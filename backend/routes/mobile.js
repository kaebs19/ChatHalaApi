// HalaChat - Mobile API Routes
// مسارات API للتطبيق (المستخدمين العاديين)

const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const Report = require('../models/Report');
const Notification = require('../models/Notification');
const { protect } = require('../middleware/auth');
const notificationService = require('../services/notificationService');

// ==========================================
// نظام البحث عن المستخدمين
// ==========================================

// @route   GET /api/mobile/users/search
// @desc    البحث عن مستخدمين مع فلاتر متقدمة
// @access  Private
router.get('/users/search', protect, async (req, res) => {
    try {
        const {
            q,           // بحث بالاسم (اختياري)
            page = 1,
            limit = 20,
            gender,      // male / female
            country,     // كود الدولة: SA, AE, EG
            minAge,      // أقل عمر
            maxAge       // أكبر عمر
        } = req.query;

        // بناء الفلتر
        const filter = {
            _id: { $ne: req.user._id },              // 1. استثناء نفسك
            isActive: true                            // 2. المستخدمين النشطين فقط
        };

        // 3. استثناء المستخدمين المحظورين
        if (req.user.blockedUsers && req.user.blockedUsers.length > 0) {
            filter._id = {
                $ne: req.user._id,
                $nin: req.user.blockedUsers
            };
        }

        // فلتر الاسم (اختياري)
        if (q && q.length >= 2) {
            filter.name = { $regex: q, $options: 'i' };
        }

        // فلتر الجنس
        if (gender && ['male', 'female'].includes(gender)) {
            filter.gender = gender;
        }

        // فلتر الدولة
        if (country) {
            filter.country = country.toUpperCase();
        }

        // فلتر العمر (من birthDate)
        if (minAge || maxAge) {
            filter.birthDate = {};
            if (maxAge) {
                // أكبر عمر = أصغر تاريخ ميلاد
                const minDate = new Date();
                minDate.setFullYear(minDate.getFullYear() - parseInt(maxAge) - 1);
                filter.birthDate.$gte = minDate;
            }
            if (minAge) {
                // أصغر عمر = أكبر تاريخ ميلاد
                const maxDate = new Date();
                maxDate.setFullYear(maxDate.getFullYear() - parseInt(minAge));
                filter.birthDate.$lte = maxDate;
            }
        }

        const users = await User.find(filter)
            .select('name email profileImage birthDate gender country bio isOnline lastLogin')
            .sort({ isOnline: -1, lastLogin: -1 })  // المتصلين أولاً، ثم الأنشط
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit));

        const totalUsers = await User.countDocuments(filter);

        res.status(200).json({
            success: true,
            data: {
                users,
                page: parseInt(page),
                totalPages: Math.ceil(totalUsers / parseInt(limit)),
                totalUsers
            }
        });

    } catch (error) {
        console.error('خطأ في البحث عن المستخدمين:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر',
            error: error.message
        });
    }
});

// ==========================================
// نظام حظر المستخدمين
// ==========================================

// @route   POST /api/mobile/users/block/:userId
// @desc    حظر مستخدم
// @access  Private
router.post('/users/block/:userId', protect, async (req, res) => {
    try {
        const { userId } = req.params;

        // تحقق إن المستخدم موجود
        const target = await User.findById(userId);
        if (!target) {
            return res.status(404).json({
                success: false,
                message: 'المستخدم غير موجود'
            });
        }

        // لا تحظر نفسك
        if (userId === req.user._id.toString()) {
            return res.status(400).json({
                success: false,
                message: 'لا يمكن حظر نفسك'
            });
        }

        // أضف للقائمة السوداء (بدون تكرار)
        await User.findByIdAndUpdate(req.user._id, {
            $addToSet: { blockedUsers: userId }
        });

        // حذف أي محادثة بينهم
        await Conversation.deleteMany({
            type: 'private',
            participants: { $all: [req.user._id, userId] }
        });

        res.json({
            success: true,
            message: 'تم حظر المستخدم'
        });

    } catch (error) {
        console.error('خطأ في حظر المستخدم:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر',
            error: error.message
        });
    }
});

// @route   POST /api/mobile/users/unblock/:userId
// @desc    إلغاء حظر مستخدم
// @access  Private
router.post('/users/unblock/:userId', protect, async (req, res) => {
    try {
        const { userId } = req.params;

        // تحقق إن المستخدم موجود
        const target = await User.findById(userId);
        if (!target) {
            return res.status(404).json({
                success: false,
                message: 'المستخدم غير موجود'
            });
        }

        // إزالة من القائمة السوداء
        await User.findByIdAndUpdate(req.user._id, {
            $pull: { blockedUsers: userId }
        });

        res.json({
            success: true,
            message: 'تم إلغاء حظر المستخدم'
        });

    } catch (error) {
        console.error('خطأ في إلغاء حظر المستخدم:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر',
            error: error.message
        });
    }
});

// @route   GET /api/mobile/users/blocked
// @desc    الحصول على قائمة المحظورين
// @access  Private
router.get('/users/blocked', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user._id)
            .populate('blockedUsers', 'name email profileImage');

        res.json({
            success: true,
            data: {
                blockedUsers: user.blockedUsers || []
            }
        });

    } catch (error) {
        console.error('خطأ في جلب المحظورين:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر',
            error: error.message
        });
    }
});

// ==========================================
// نظام المحادثات (طلب/قبول/رفض)
// ==========================================

// @route   POST /api/mobile/conversations/request
// @desc    طلب بدء محادثة مع مستخدم
// @access  Private
router.post('/conversations/request', protect, async (req, res) => {
    try {
        const { targetUserId, initialMessage } = req.body;

        if (!targetUserId) {
            return res.status(400).json({
                success: false,
                message: 'معرف المستخدم المستهدف مطلوب'
            });
        }

        // التحقق من وجود المستخدم المستهدف
        const targetUser = await User.findById(targetUserId);
        if (!targetUser) {
            return res.status(404).json({
                success: false,
                message: 'المستخدم غير موجود'
            });
        }

        if (!targetUser.isActive) {
            return res.status(400).json({
                success: false,
                message: 'المستخدم غير نشط'
            });
        }

        // التحقق من عدم وجود محادثة سابقة
        const existingConversation = await Conversation.findOne({
            type: 'private',
            participants: { $all: [req.user._id, targetUserId] }
        });

        if (existingConversation) {
            return res.status(200).json({
                success: true,
                message: 'محادثة موجودة بالفعل',
                data: {
                    conversation: existingConversation,
                    isExisting: true
                }
            });
        }

        // إنشاء محادثة جديدة بحالة "pending"
        const conversation = await Conversation.create({
            type: 'private',
            participants: [req.user._id, targetUserId],
            creator: req.user._id,
            status: 'pending', // في انتظار قبول المستخدم الآخر
            isActive: true, // نشطة عشان الرسائل تنرسل
            title: `محادثة بين ${req.user.name} و ${targetUser.name}`
        });

        // إرسال الرسالة الأولى إذا وجدت
        if (initialMessage) {
            await Message.create({
                chatType: 'conversation',
                conversation: conversation._id,
                sender: req.user._id,
                content: initialMessage,
                type: 'text',
                status: 'sent'
            });
        }

        // ١. Socket.IO (لو متصل)
        if (global.io) {
            global.io.to(`user:${targetUserId}`).emit('conversation:request', {
                conversationId: conversation._id,
                from: {
                    _id: req.user._id,
                    name: req.user.name,
                    profileImage: req.user.profileImage
                }
            });
        }

        // ٢. Push Notification (لو غير متصل)
        if (!targetUser.isOnline && targetUser.deviceToken) {
            await notificationService.sendPush(
                targetUser.deviceToken,
                'طلب محادثة جديد',
                `${req.user.name} يريد التحدث معك`,
                {
                    type: 'conversation_request',
                    conversationId: conversation._id.toString(),
                    senderId: req.user._id.toString(),
                    senderName: req.user.name
                }
            );
        }

        // حفظ الإشعار في قاعدة البيانات
        await Notification.create({
            title: 'طلب محادثة جديد',
            body: `${req.user.name} يريد بدء محادثة معك`,
            type: 'message',
            recipients: [targetUserId],
            sentTo: [targetUserId],
            data: {
                conversationId: conversation._id.toString(),
                senderId: req.user._id.toString(),
                type: 'conversation_request'
            }
        });

        res.status(201).json({
            success: true,
            message: 'تم إرسال طلب المحادثة',
            data: {
                conversation,
                isExisting: false
            }
        });

    } catch (error) {
        console.error('خطأ في طلب المحادثة:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر',
            error: error.message
        });
    }
});

// @route   PUT /api/mobile/conversations/:id/accept
// @desc    قبول طلب محادثة
// @access  Private
router.put('/conversations/:id/accept', protect, async (req, res) => {
    try {
        const conversation = await Conversation.findById(req.params.id)
            .populate('participants', 'name email deviceToken');

        if (!conversation) {
            return res.status(404).json({
                success: false,
                message: 'المحادثة غير موجودة'
            });
        }

        // التحقق من أن المستخدم هو المستهدف وليس المنشئ
        if (conversation.creator.toString() === req.user._id.toString()) {
            return res.status(400).json({
                success: false,
                message: 'لا يمكنك قبول طلب أنت أرسلته'
            });
        }

        // التحقق من أن المستخدم جزء من المحادثة
        const isParticipant = conversation.participants.some(
            p => p._id.toString() === req.user._id.toString()
        );

        if (!isParticipant) {
            return res.status(403).json({
                success: false,
                message: 'ليس لديك صلاحية لهذه المحادثة'
            });
        }

        // تفعيل المحادثة
        conversation.status = 'accepted';
        conversation.isActive = true;
        await conversation.save();

        // إرسال إشعار لمنشئ المحادثة
        const creator = conversation.participants.find(
            p => p._id.toString() === conversation.creator.toString()
        );

        if (creator && creator.deviceToken) {
            const notification = notificationService.createNotificationPayload({
                title: 'تم قبول طلب المحادثة',
                body: `${req.user.name} قبل طلب المحادثة`,
                type: 'message',
                data: {
                    conversationId: conversation._id.toString(),
                    type: 'conversation_accepted'
                }
            });

            await notificationService.sendToUser(creator, notification);
        }

        // إرسال عبر Socket.IO
        if (global.io) {
            global.io.to(`user-${conversation.creator.toString()}`).emit('conversation-accepted', {
                conversationId: conversation._id,
                acceptedBy: req.user.name
            });
        }

        res.status(200).json({
            success: true,
            message: 'تم قبول المحادثة',
            data: { conversation }
        });

    } catch (error) {
        console.error('خطأ في قبول المحادثة:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر',
            error: error.message
        });
    }
});

// @route   PUT /api/mobile/conversations/:id/reject
// @desc    رفض طلب محادثة
// @access  Private
router.put('/conversations/:id/reject', protect, async (req, res) => {
    try {
        const conversation = await Conversation.findById(req.params.id)
            .populate('participants', 'name email deviceToken');

        if (!conversation) {
            return res.status(404).json({
                success: false,
                message: 'المحادثة غير موجودة'
            });
        }

        // التحقق من أن المستخدم هو المستهدف
        if (conversation.creator.toString() === req.user._id.toString()) {
            return res.status(400).json({
                success: false,
                message: 'لا يمكنك رفض طلب أنت أرسلته'
            });
        }

        const isParticipant = conversation.participants.some(
            p => p._id.toString() === req.user._id.toString()
        );

        if (!isParticipant) {
            return res.status(403).json({
                success: false,
                message: 'ليس لديك صلاحية لهذه المحادثة'
            });
        }

        // تحديث حالة المحادثة
        conversation.status = 'rejected';
        conversation.isActive = false;
        await conversation.save();

        // إرسال إشعار لمنشئ المحادثة (اختياري)
        const creator = conversation.participants.find(
            p => p._id.toString() === conversation.creator.toString()
        );

        if (creator && creator.deviceToken) {
            const notification = notificationService.createNotificationPayload({
                title: 'طلب المحادثة',
                body: 'لم يتم قبول طلب المحادثة',
                type: 'message',
                data: {
                    conversationId: conversation._id.toString(),
                    type: 'conversation_rejected'
                }
            });

            await notificationService.sendToUser(creator, notification);
        }

        res.status(200).json({
            success: true,
            message: 'تم رفض طلب المحادثة',
            data: { conversation }
        });

    } catch (error) {
        console.error('خطأ في رفض المحادثة:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر',
            error: error.message
        });
    }
});

// @route   GET /api/mobile/conversations/pending
// @desc    الحصول على طلبات المحادثة المعلقة
// @access  Private
router.get('/conversations/pending', protect, async (req, res) => {
    try {
        const conversations = await Conversation.find({
            participants: req.user._id,
            creator: { $ne: req.user._id }, // طلبات من الآخرين
            status: 'pending'
        })
            .populate('creator', 'name email profileImage')
            .populate('participants', 'name email profileImage')
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            data: { conversations }
        });

    } catch (error) {
        console.error('خطأ في جلب الطلبات المعلقة:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر',
            error: error.message
        });
    }
});

// @route   GET /api/mobile/conversations
// @desc    الحصول على محادثات المستخدم النشطة
// @access  Private
router.get('/conversations', protect, async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;

        const conversations = await Conversation.find({
            participants: req.user._id,
            status: { $in: ['accepted', 'pending'] },
            isActive: true
        })
            .populate('participants', 'name email profileImage')
            .populate('lastMessage')
            .sort({ updatedAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);

        const total = await Conversation.countDocuments({
            participants: req.user._id,
            status: { $in: ['accepted', 'pending'] },
            isActive: true
        });

        res.status(200).json({
            success: true,
            data: {
                conversations,
                total,
                currentPage: parseInt(page),
                totalPages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.error('خطأ في جلب المحادثات:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر',
            error: error.message
        });
    }
});

// ==========================================
// نظام الرسائل
// ==========================================

// @route   POST /api/mobile/messages/send
// @desc    إرسال رسالة
// @access  Private
router.post('/messages/send', protect, async (req, res) => {
    try {
        const { conversationId, content, type = 'text', mediaUrl, mediaMetadata } = req.body;

        if (!conversationId || !content) {
            return res.status(400).json({
                success: false,
                message: 'معرف المحادثة والمحتوى مطلوبان'
            });
        }

        // التحقق من المحادثة
        const conversation = await Conversation.findById(conversationId)
            .populate('participants', 'name email deviceToken');

        if (!conversation) {
            return res.status(404).json({
                success: false,
                message: 'المحادثة غير موجودة'
            });
        }

        // التحقق من أن المستخدم جزء من المحادثة
        const isParticipant = conversation.participants.some(
            p => p._id.toString() === req.user._id.toString()
        );

        if (!isParticipant) {
            return res.status(403).json({
                success: false,
                message: 'ليس لديك صلاحية لهذه المحادثة'
            });
        }

        // التحقق من أن المحادثة نشطة
        if (!conversation.isActive) {
            return res.status(400).json({
                success: false,
                message: 'المحادثة غير نشطة'
            });
        }

        // لو معلقة، بس المنشئ يقدر يرسل
        if (conversation.status === 'pending') {
            if (conversation.creator.toString() !== req.user._id.toString()) {
                return res.status(400).json({
                    success: false,
                    message: 'لا يمكنك الإرسال حتى تقبل المحادثة'
                });
            }
        }

        // إنشاء الرسالة
        const message = await Message.create({
            chatType: 'conversation',
            conversation: conversationId,
            sender: req.user._id,
            content,
            type,
            mediaUrl: mediaUrl || null,
            mediaMetadata: mediaMetadata || null,
            status: 'sent'
        });

        // تحديث آخر رسالة في المحادثة
        conversation.lastMessage = message._id;
        await conversation.save();

        // جلب الرسالة مع بيانات المرسل
        const populatedMessage = await Message.findById(message._id)
            .populate('sender', 'name email profileImage');

        // إرسال عبر Socket.IO
        if (global.io) {
            global.io.to(`conversation-${conversationId}`).emit('new-message', {
                message: populatedMessage
            });
        }

        // إرسال إشعارات للمستقبلين
        const recipients = conversation.participants.filter(
            p => p._id.toString() !== req.user._id.toString()
        );

        for (const recipient of recipients) {
            if (recipient.deviceToken) {
                const notification = notificationService.createNotificationPayload({
                    title: req.user.name,
                    body: type === 'text' ? content : `أرسل ${type === 'image' ? 'صورة' : 'ملف'}`,
                    type: 'message',
                    data: {
                        conversationId: conversationId,
                        messageId: message._id.toString(),
                        senderId: req.user._id.toString(),
                        type: 'new_message'
                    }
                });

                await notificationService.sendToUser(recipient, notification);
            }
        }

        res.status(201).json({
            success: true,
            message: 'تم إرسال الرسالة',
            data: { message: populatedMessage }
        });

    } catch (error) {
        console.error('خطأ في إرسال الرسالة:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر',
            error: error.message
        });
    }
});

// @route   GET /api/mobile/messages/:conversationId
// @desc    الحصول على رسائل محادثة
// @access  Private
router.get('/messages/:conversationId', protect, async (req, res) => {
    try {
        const { page = 1, limit = 50 } = req.query;
        const { conversationId } = req.params;

        // التحقق من المحادثة
        const conversation = await Conversation.findById(conversationId);

        if (!conversation) {
            return res.status(404).json({
                success: false,
                message: 'المحادثة غير موجودة'
            });
        }

        // التحقق من صلاحية المستخدم
        const isParticipant = conversation.participants.some(
            p => p.toString() === req.user._id.toString()
        );

        if (!isParticipant) {
            return res.status(403).json({
                success: false,
                message: 'ليس لديك صلاحية لهذه المحادثة'
            });
        }

        const messages = await Message.find({
            conversation: conversationId,
            isDeleted: false
        })
            .populate('sender', 'name email profileImage')
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);

        const total = await Message.countDocuments({
            conversation: conversationId,
            isDeleted: false
        });

        res.status(200).json({
            success: true,
            data: {
                messages: messages.reverse(), // عكس الترتيب للعرض
                total,
                currentPage: parseInt(page),
                totalPages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.error('خطأ في جلب الرسائل:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر',
            error: error.message
        });
    }
});

// ==========================================
// نظام الإبلاغات
// ==========================================

// @route   POST /api/mobile/reports
// @desc    إنشاء بلاغ جديد (شكل مبسط للتطبيق)
// @access  Private
router.post('/reports', protect, async (req, res) => {
    try {
        const {
            reportedUser,   // userId للمستخدم المبلغ عنه
            reason,         // spam | inappropriate | harassment | fake_profile | other
            description     // وصف إضافي (اختياري)
        } = req.body;

        // التحقق من البيانات المطلوبة
        if (!reportedUser || !reason) {
            return res.status(400).json({
                success: false,
                message: 'معرف المستخدم وسبب البلاغ مطلوبان'
            });
        }

        // التحقق من صحة السبب
        const validReasons = ['spam', 'inappropriate', 'harassment', 'fake_profile', 'other'];
        if (!validReasons.includes(reason)) {
            return res.status(400).json({
                success: false,
                message: 'سبب البلاغ غير صالح'
            });
        }

        // التحقق من وجود المستخدم المبلغ عنه
        const targetUser = await User.findById(reportedUser);
        if (!targetUser) {
            return res.status(404).json({
                success: false,
                message: 'المستخدم المبلغ عنه غير موجود'
            });
        }

        // لا يمكن الإبلاغ عن نفسك
        if (reportedUser === req.user._id.toString()) {
            return res.status(400).json({
                success: false,
                message: 'لا يمكن الإبلاغ عن نفسك'
            });
        }

        // تحديد الأولوية بناء على السبب
        const highPriorityReasons = ['harassment', 'inappropriate'];
        const priority = highPriorityReasons.includes(reason) ? 'high' : 'medium';

        const report = await Report.create({
            type: 'user',
            reportedBy: req.user._id,
            reportedUser: reportedUser,
            category: reason,
            description: description || '',
            status: 'pending',
            priority
        });

        res.status(201).json({
            success: true,
            message: 'تم إرسال البلاغ'
        });

    } catch (error) {
        console.error('خطأ في إنشاء البلاغ:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر',
            error: error.message
        });
    }
});

// @route   GET /api/mobile/reports/my
// @desc    الحصول على بلاغاتي
// @access  Private
router.get('/reports/my', protect, async (req, res) => {
    try {
        const reports = await Report.find({ reportedBy: req.user._id })
            .populate('reportedUser', 'name email')
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            data: { reports }
        });

    } catch (error) {
        console.error('خطأ في جلب البلاغات:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر',
            error: error.message
        });
    }
});

// ==========================================
// نظام الإشعارات
// ==========================================

// @route   GET /api/mobile/notifications
// @desc    الحصول على إشعارات المستخدم
// @access  Private
router.get('/notifications', protect, async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;

        const notifications = await Notification.find({
            $or: [
                { recipients: req.user._id },
                { recipientType: 'all' }
            ]
        })
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);

        const total = await Notification.countDocuments({
            $or: [
                { recipients: req.user._id },
                { recipientType: 'all' }
            ]
        });

        const unreadCount = await Notification.countDocuments({
            $or: [
                { recipients: req.user._id },
                { recipientType: 'all' }
            ],
            readBy: { $ne: req.user._id }
        });

        res.status(200).json({
            success: true,
            data: {
                notifications,
                total,
                unreadCount,
                currentPage: parseInt(page),
                totalPages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.error('خطأ في جلب الإشعارات:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر',
            error: error.message
        });
    }
});

// @route   PUT /api/mobile/notifications/:id/read
// @desc    تحديد إشعار كمقروء
// @access  Private
router.put('/notifications/:id/read', protect, async (req, res) => {
    try {
        const notification = await Notification.findById(req.params.id);

        if (!notification) {
            return res.status(404).json({
                success: false,
                message: 'الإشعار غير موجود'
            });
        }

        // إضافة المستخدم لقائمة القراء
        if (!notification.readBy.includes(req.user._id)) {
            notification.readBy.push(req.user._id);
            await notification.save();
        }

        res.status(200).json({
            success: true,
            message: 'تم تحديد الإشعار كمقروء'
        });

    } catch (error) {
        console.error('خطأ في تحديث الإشعار:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر',
            error: error.message
        });
    }
});

// @route   PUT /api/mobile/notifications/read-all
// @desc    تحديد جميع الإشعارات كمقروءة
// @access  Private
router.put('/notifications/read-all', protect, async (req, res) => {
    try {
        await Notification.updateMany(
            {
                $or: [
                    { recipients: req.user._id },
                    { recipientType: 'all' }
                ],
                readBy: { $ne: req.user._id }
            },
            {
                $addToSet: { readBy: req.user._id }
            }
        );

        res.status(200).json({
            success: true,
            message: 'تم تحديد جميع الإشعارات كمقروءة'
        });

    } catch (error) {
        console.error('خطأ في تحديث الإشعارات:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر',
            error: error.message
        });
    }
});

// ==========================================
// نظام FCM Token (Firebase Cloud Messaging)
// ==========================================

// @route   POST /api/mobile/device/register-token
// @desc    تسجيل FCM Token للإشعارات
// @access  Private
router.post('/device/register-token', protect, async (req, res) => {
    try {
        const { fcmToken, deviceToken, platform, osVersion, appVersion } = req.body;

        if (!fcmToken && !deviceToken) {
            return res.status(400).json({
                success: false,
                message: 'FCM Token أو Device Token مطلوب'
            });
        }

        // تحديث بيانات المستخدم
        const updateData = {
            deviceInfo: {
                platform: platform || null,
                osVersion: osVersion || null,
                appVersion: appVersion || null
            }
        };

        // إضافة FCM Token (Firebase)
        if (fcmToken) {
            updateData.fcmToken = fcmToken;
        }

        // إضافة Device Token (APNs)
        if (deviceToken) {
            updateData.deviceToken = deviceToken;
        }

        await User.findByIdAndUpdate(req.user._id, updateData);

        console.log(`📱 تم تسجيل Token للمستخدم ${req.user.name}`);

        res.status(200).json({
            success: true,
            message: 'تم تسجيل Token بنجاح'
        });

    } catch (error) {
        console.error('خطأ في تسجيل Token:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر',
            error: error.message
        });
    }
});

// @route   DELETE /api/mobile/device/unregister-token
// @desc    إلغاء تسجيل FCM Token (عند تسجيل الخروج)
// @access  Private
router.delete('/device/unregister-token', protect, async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.user._id, {
            $unset: { fcmToken: 1, deviceToken: 1 }
        });

        console.log(`📴 تم إلغاء تسجيل Token للمستخدم ${req.user.name}`);

        res.status(200).json({
            success: true,
            message: 'تم إلغاء تسجيل Token بنجاح'
        });

    } catch (error) {
        console.error('خطأ في إلغاء تسجيل Token:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر',
            error: error.message
        });
    }
});

// @route   PUT /api/mobile/device/update-token
// @desc    تحديث FCM Token
// @access  Private
router.put('/device/update-token', protect, async (req, res) => {
    try {
        const { fcmToken, deviceToken } = req.body;

        if (!fcmToken && !deviceToken) {
            return res.status(400).json({
                success: false,
                message: 'FCM Token أو Device Token مطلوب'
            });
        }

        const updateData = {};
        if (fcmToken) updateData.fcmToken = fcmToken;
        if (deviceToken) updateData.deviceToken = deviceToken;

        await User.findByIdAndUpdate(req.user._id, updateData);

        res.status(200).json({
            success: true,
            message: 'تم تحديث Token بنجاح'
        });

    } catch (error) {
        console.error('خطأ في تحديث Token:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر',
            error: error.message
        });
    }
});

module.exports = router;
