// HalaChat - Mobile API Routes
// مسارات API للتطبيق (المستخدمين العاديين)

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const User = require('../models/User');
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const Report = require('../models/Report');
const Notification = require('../models/Notification');
const ChatRoom = require('../models/ChatRoom');
const { protect } = require('../middleware/auth');
const notificationService = require('../services/notificationService');
const pushNotificationService = require('../services/pushNotificationService');

// إعداد multer لرفع صور الرسائل
const messagesUploadDir = path.join(__dirname, '..', 'uploads', 'messages');
if (!fs.existsSync(messagesUploadDir)) {
    fs.mkdirSync(messagesUploadDir, { recursive: true });
}

const messageStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, messagesUploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});

const uploadMessageImage = multer({
    storage: messageStorage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (extname && mimetype) {
            cb(null, true);
        } else {
            cb(new Error('فقط الصور مسموحة (JPEG, PNG, GIF, WEBP)'));
        }
    }
});

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
            recipients: 'specific',
            targetUsers: [targetUserId],
            sender: req.user._id,
            status: 'sent',
            sentAt: new Date(),
            sentCount: 1,
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

// @route   PUT /api/mobile/conversations/:id/read
// @desc    تحديث الرسائل كمقروءة في المحادثة
// @access  Private
router.put('/conversations/:id/read', protect, async (req, res) => {
    try {
        const conversationId = req.params.id;
        const userId = req.user._id;

        // التحقق من المحادثة
        const conversation = await Conversation.findById(conversationId);

        if (!conversation) {
            return res.status(404).json({
                success: false,
                message: 'المحادثة غير موجودة'
            });
        }

        // التحقق من أن المستخدم جزء من المحادثة
        const isParticipant = conversation.participants.some(
            p => p.toString() === userId.toString()
        );

        if (!isParticipant) {
            return res.status(403).json({
                success: false,
                message: 'ليس لديك صلاحية لهذه المحادثة'
            });
        }

        // تحديث جميع الرسائل غير المقروءة (التي لم يقرأها هذا المستخدم)
        const result = await Message.updateMany(
            {
                conversation: conversationId,
                sender: { $ne: userId }, // رسائل الآخرين فقط
                'readBy.user': { $ne: userId } // لم يقرأها هذا المستخدم بعد
            },
            {
                $addToSet: {
                    readBy: { user: userId, readAt: new Date() }
                },
                $set: { status: 'read' }
            }
        );

        // إرسال Socket event للطرف الآخر (اختياري)
        if (global.io && result.modifiedCount > 0) {
            global.io.to(`conversation-${conversationId}`).emit('messages-read', {
                conversationId,
                readBy: userId,
                count: result.modifiedCount
            });
        }

        res.status(200).json({
            success: true,
            message: 'تم تحديث حالة القراءة',
            data: {
                markedAsRead: result.modifiedCount
            }
        });

    } catch (error) {
        console.error('خطأ في تحديث حالة القراءة:', error);
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
            .populate('participants', 'name email profileImage lastLogin isOnline')
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
// @desc    الحصول على محادثات المستخدم النشطة مع عدد الرسائل غير المقروءة
// @access  Private
router.get('/conversations', protect, async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        const userId = req.user._id;

        const conversations = await Conversation.find({
            participants: userId,
            status: { $in: ['accepted', 'pending'] },
            isActive: true
        })
            .populate('participants', 'name email profileImage lastLogin isOnline')
            .populate('lastMessage')
            .sort({ updatedAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .lean(); // استخدام lean للتعديل على النتائج

        // حساب عدد الرسائل غير المقروءة لكل محادثة
        const conversationsWithUnread = await Promise.all(
            conversations.map(async (conv) => {
                const unreadCount = await Message.countDocuments({
                    conversation: conv._id,
                    sender: { $ne: userId }, // رسائل الآخرين فقط
                    'readBy.user': { $ne: userId } // لم يقرأها هذا المستخدم
                });
                return { ...conv, unreadCount };
            })
        );

        const total = await Conversation.countDocuments({
            participants: userId,
            status: { $in: ['accepted', 'pending'] },
            isActive: true
        });

        // حساب إجمالي الرسائل غير المقروءة
        const totalUnread = conversationsWithUnread.reduce((sum, conv) => sum + conv.unreadCount, 0);

        res.status(200).json({
            success: true,
            data: {
                conversations: conversationsWithUnread,
                total,
                totalUnread,
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

// @route   PUT /api/mobile/conversations/:id/mute
// @desc    كتم/إلغاء كتم إشعارات محادثة
// @access  Private
router.put('/conversations/:id/mute', protect, async (req, res) => {
    try {
        const { id } = req.params;
        const { muted, mutedUntil } = req.body;
        const userId = req.user._id;

        // التحقق من وجود المحادثة وأن المستخدم مشارك فيها
        const conversation = await Conversation.findById(id);
        if (!conversation) {
            return res.status(404).json({
                success: false,
                message: 'المحادثة غير موجودة'
            });
        }

        if (!conversation.participants.includes(userId)) {
            return res.status(403).json({
                success: false,
                message: 'غير مصرح لك بالوصول لهذه المحادثة'
            });
        }

        if (muted) {
            // إزالة أي كتم سابق لنفس المحادثة أولاً
            await User.findByIdAndUpdate(userId, {
                $pull: { mutedConversations: { conversationId: id } }
            });
            // إضافة للقائمة المكتومة
            await User.findByIdAndUpdate(userId, {
                $push: {
                    mutedConversations: {
                        conversationId: id,
                        mutedUntil: mutedUntil || null
                    }
                }
            });
        } else {
            // إزالة من القائمة المكتومة
            await User.findByIdAndUpdate(userId, {
                $pull: { mutedConversations: { conversationId: id } }
            });
        }

        res.json({
            success: true,
            muted,
            mutedUntil: muted ? (mutedUntil || null) : null,
            message: muted ? 'تم كتم المحادثة' : 'تم إلغاء كتم المحادثة'
        });
    } catch (error) {
        console.error('خطأ في كتم المحادثة:', error);
        res.status(500).json({
            success: false,
            message: 'فشل في تحديث حالة الكتم',
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
        console.log('🔥 About to emit new-message to room:', `conversation-${conversationId}`);
        console.log('🔥 global.io exists:', !!global.io);
        if (global.io) {
            global.io.to(`conversation-${conversationId}`).emit('new-message', {
                message: populatedMessage
            });
            console.log('🔥 Emitted!');
        } else {
            console.log('❌ global.io is undefined!');
        }

        // إرسال إشعارات للمستقبلين الـ offline فقط عبر FCM
        const recipients = conversation.participants.filter(
            p => p._id.toString() !== req.user._id.toString()
        );

        console.log('📲 عدد المستقبلين:', recipients.length);

        for (const recipient of recipients) {
            const recipientId = recipient._id.toString();

            // تحقق هل المستقبل متصل بالسوكت
            const isOnline = global.connectedUsers && global.connectedUsers.has(recipientId);

            if (isOnline) {
                console.log(`📲 ${recipient.name} متصل بالسوكت - لا حاجة لـ Push`);
            } else {
                console.log(`📲 ${recipient.name} غير متصل - إرسال Push Notification`);
                // إرسال Push Notification عبر Firebase للـ offline users فقط
                const pushResult = await pushNotificationService.sendNewMessageNotification(
                    recipient._id,
                    req.user.name,
                    type === 'text' ? (content.length > 100 ? content.substring(0, 100) + '...' : content) : `أرسل ${type === 'image' ? 'صورة' : type === 'audio' ? 'رسالة صوتية' : type === 'video' ? 'فيديو' : 'ملف'}`,
                    conversationId
                );
                console.log('📲 نتيجة الإشعار:', JSON.stringify(pushResult));
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

// @route   POST /api/mobile/conversations/:conversationId/messages/image
// @desc    إرسال صورة في رسالة (multipart/form-data)
// @access  Private
router.post('/conversations/:conversationId/messages/image', protect, uploadMessageImage.single('image'), async (req, res) => {
    try {
        const { conversationId } = req.params;
        const senderId = req.user._id;

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'لم يتم رفع صورة'
            });
        }

        // التحقق من المحادثة
        const conversation = await Conversation.findById(conversationId)
            .populate('participants', 'name email fcmToken');

        if (!conversation) {
            // حذف الصورة المرفوعة
            fs.unlinkSync(req.file.path);
            return res.status(404).json({
                success: false,
                message: 'المحادثة غير موجودة'
            });
        }

        // التحقق من أن المستخدم جزء من المحادثة
        const isParticipant = conversation.participants.some(
            p => p._id.toString() === senderId.toString()
        );

        if (!isParticipant) {
            fs.unlinkSync(req.file.path);
            return res.status(403).json({
                success: false,
                message: 'ليس لديك صلاحية لهذه المحادثة'
            });
        }

        // رابط الصورة
        const baseUrl = process.env.BASE_URL || 'https://halachat.com';
        const mediaUrl = `${baseUrl}/uploads/messages/${req.file.filename}`;

        // إنشاء الرسالة
        const message = await Message.create({
            chatType: 'conversation',
            conversation: conversationId,
            sender: senderId,
            type: 'image',
            mediaUrl: mediaUrl,
            content: req.body.caption || '',
            status: 'sent'
        });

        // تحديث آخر رسالة في المحادثة
        conversation.lastMessage = message._id;
        await conversation.save();

        // جلب الرسالة مع بيانات المرسل
        const populatedMessage = await Message.findById(message._id)
            .populate('sender', 'name profileImage');

        // إرسال عبر Socket.IO
        if (global.io) {
            global.io.to(`conversation-${conversationId}`).emit('new-message', {
                message: populatedMessage
            });
        }

        // إرسال Push للمستقبلين غير المتصلين
        const recipients = conversation.participants.filter(
            p => p._id.toString() !== senderId.toString()
        );

        for (const recipient of recipients) {
            const recipientId = recipient._id.toString();
            const isOnline = global.connectedUsers && global.connectedUsers.has(recipientId);

            if (!isOnline) {
                await pushNotificationService.sendNewMessageNotification(
                    recipient._id,
                    req.user.name,
                    '📷 أرسل صورة',
                    conversationId
                );
            }
        }

        res.status(201).json({
            success: true,
            message: 'تم إرسال الصورة',
            data: { message: populatedMessage }
        });

    } catch (error) {
        console.error('خطأ في إرسال الصورة:', error);
        // حذف الصورة إذا حدث خطأ
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر',
            error: error.message
        });
    }
});

// @route   POST /api/mobile/conversations/:conversationId/messages
// @desc    إرسال رسالة (route بديل للتوافق مع iOS)
// @access  Private
router.post('/conversations/:conversationId/messages', protect, async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { content, type = 'text', mediaUrl, mediaMetadata } = req.body;

        if (!content) {
            return res.status(400).json({
                success: false,
                message: 'المحتوى مطلوب'
            });
        }

        // التحقق من المحادثة
        const conversation = await Conversation.findById(conversationId)
            .populate('participants', 'name email deviceToken fcmToken');

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
        console.log('🔥 About to emit new-message to room:', `conversation-${conversationId}`);
        console.log('🔥 global.io exists:', !!global.io);
        if (global.io) {
            global.io.to(`conversation-${conversationId}`).emit('new-message', {
                message: populatedMessage
            });
            console.log('🔥 Emitted!');
        }

        // إرسال إشعارات للمستقبلين الـ offline فقط عبر FCM
        const recipients = conversation.participants.filter(
            p => p._id.toString() !== req.user._id.toString()
        );

        console.log('📲 عدد المستقبلين:', recipients.length);

        for (const recipient of recipients) {
            const recipientId = recipient._id.toString();
            const isOnline = global.connectedUsers && global.connectedUsers.has(recipientId);

            if (isOnline) {
                console.log(`📲 ${recipient.name} متصل بالسوكت - لا حاجة لـ Push`);
            } else {
                console.log(`📲 ${recipient.name} غير متصل - إرسال Push Notification`);
                const pushResult = await pushNotificationService.sendNewMessageNotification(
                    recipient._id,
                    req.user.name,
                    type === 'text' ? (content.length > 100 ? content.substring(0, 100) + '...' : content) : `أرسل ${type === 'image' ? 'صورة' : type === 'audio' ? 'رسالة صوتية' : type === 'video' ? 'فيديو' : 'ملف'}`,
                    conversationId
                );
                console.log('📲 نتيجة الإشعار:', JSON.stringify(pushResult));
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

        // إرسال إشعار للأدمن عند إنشاء بلاغ جديد
        try {
            // جلب جميع الأدمن
            const admins = await User.find({ role: 'admin', isActive: true });

            // ترجمة السبب للعربية
            const reasonTranslations = {
                'spam': 'سبام',
                'inappropriate': 'محتوى غير لائق',
                'harassment': 'تحرش',
                'fake_profile': 'حساب مزيف',
                'other': 'أخرى'
            };

            const reasonArabic = reasonTranslations[reason] || reason;

            // إنشاء إشعار في قاعدة البيانات
            await Notification.create({
                title: 'بلاغ جديد',
                body: `${req.user.name} أبلغ عن ${targetUser.name} - السبب: ${reasonArabic}`,
                type: 'report',
                recipients: 'specific',
                targetUsers: admins.map(admin => admin._id),
                sender: req.user._id,
                status: 'sent',
                priority: priority === 'high' ? 'high' : 'normal',
                sentAt: new Date(),
                sentCount: admins.length,
                data: {
                    reportId: report._id.toString(),
                    reportedUserId: reportedUser,
                    reportedUserName: targetUser.name,
                    reason: reason,
                    type: 'new_report'
                }
            });

            // إرسال Push Notifications للأدمن الأوفلاين
            for (const admin of admins) {
                // Socket.IO للأدمن المتصلين
                if (global.io) {
                    global.io.to(`user:${admin._id}`).emit('notification', {
                        type: 'report',
                        title: 'بلاغ جديد',
                        body: `${req.user.name} أبلغ عن ${targetUser.name}`,
                        data: { reportId: report._id.toString() }
                    });
                }

                // Push للأدمن الأوفلاين
                if (!admin.isOnline && admin.deviceToken) {
                    await notificationService.sendPush(
                        admin.deviceToken,
                        'بلاغ جديد ⚠️',
                        `${req.user.name} أبلغ عن ${targetUser.name} - السبب: ${reasonArabic}`,
                        {
                            type: 'new_report',
                            reportId: report._id.toString()
                        }
                    );
                }
            }
        } catch (notifError) {
            console.error('خطأ في إرسال إشعار البلاغ:', notifError);
            // نكمل حتى لو فشل الإشعار
        }

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

        // جلب الإشعارات الموجهة للمستخدم أو للجميع
        const query = {
            $or: [
                { targetUsers: req.user._id },
                { recipients: 'all' }
            ],
            isActive: true
        };

        const notifications = await Notification.find(query)
            .populate('sender', 'name profileImage')
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);

        const total = await Notification.countDocuments(query);

        // حساب الإشعارات غير المقروءة
        const unreadCount = await Notification.countDocuments({
            ...query,
            'readBy.user': { $ne: req.user._id }
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

// ==========================================
// غرف المحادثة العامة (Rooms)
// ==========================================

// @route   GET /api/mobile/rooms
// @desc    جلب قائمة الغرف العامة (مبسط للتطبيق)
// @access  Protected
router.get('/rooms', protect, async (req, res) => {
    try {
        const { page = 1, limit = 20, category, search } = req.query;

        // فلتر الغرف النشطة والعامة فقط
        const filter = {
            isActive: true,
            accessType: 'public'
        };

        if (category) filter.category = category;
        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } }
            ];
        }

        const rooms = await ChatRoom.find(filter)
            .select('name image description category memberCount messageCount isLocked lastMessage updatedAt members pinnedMessage')
            .populate('lastMessage.sender', 'name profileImage')
            .sort({ updatedAt: -1 })
            .skip((page - 1) * limit)
            .limit(parseInt(limit));

        const total = await ChatRoom.countDocuments(filter);

        // تنسيق البيانات كجدول مبسط
        const tableData = rooms.map(room => {
            // حساب عدد المتصلين من Socket.IO
            const socketRoom = global.io?.sockets?.adapter?.rooms?.get(`room-${room._id}`);
            const onlineCount = socketRoom ? socketRoom.size : 0;

            // التحقق هل المستخدم عضو بالغرفة
            const isJoined = room.members?.some(m => m.toString() === req.user._id.toString()) || false;

            return {
                id: room._id,
                name: room.name,
                image: room.image,
                description: room.description?.substring(0, 100) || '',
                category: room.category || 'عام',
                members: room.memberCount || 0,
                messages: room.messageCount || 0,
                isLocked: room.isLocked || false,
                onlineCount,
                isJoined,
                pinnedMessage: room.pinnedMessage?.content ? {
                    content: room.pinnedMessage.content,
                    createdAt: room.pinnedMessage.createdAt
                } : null,
                lastMessage: room.lastMessage ? {
                    content: room.lastMessage.content?.substring(0, 50),
                    senderName: room.lastMessage.sender?.name,
                    sentAt: room.lastMessage.sentAt
                } : null,
                updatedAt: room.updatedAt
            };
        });

        res.json({
            success: true,
            data: {
                rooms: tableData,
                total,
                currentPage: parseInt(page),
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('خطأ في جلب الغرف:', error);
        res.status(500).json({
            success: false,
            message: 'فشل في جلب الغرف',
            error: error.message
        });
    }
});

// @route   GET /api/mobile/rooms/:id/messages
// @desc    جلب رسائل الغرفة مع البحث والترقيم
// @access  Protected
router.get('/rooms/:id/messages', protect, async (req, res) => {
    try {
        const { id: roomId } = req.params;
        const { page = 1, limit = 50, search } = req.query;

        // التحقق من وجود الغرفة
        const room = await ChatRoom.findById(roomId);
        if (!room) {
            return res.status(404).json({
                success: false,
                message: 'الغرفة غير موجودة'
            });
        }

        // بناء الفلتر
        const filter = {
            room: roomId,
            isDeleted: { $ne: true }
        };

        // البحث في المحتوى
        if (search) {
            filter.content = { $regex: search, $options: 'i' };
        }

        // جلب الرسائل
        const messages = await Message.find(filter)
            .populate('sender', 'name profileImage')
            .sort({ createdAt: -1 })
            .skip((parseInt(page) - 1) * parseInt(limit))
            .limit(parseInt(limit));

        const total = await Message.countDocuments(filter);

        res.json({
            success: true,
            data: {
                messages: messages.map(msg => ({
                    _id: msg._id,
                    roomId: msg.room,
                    sender: {
                        _id: msg.sender?._id,
                        name: msg.sender?.name,
                        profileImage: msg.sender?.profileImage
                    },
                    content: msg.content,
                    type: msg.type || 'text',
                    mediaUrl: msg.mediaUrl || null,
                    createdAt: msg.createdAt
                })),
                page: parseInt(page),
                totalPages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('خطأ في جلب رسائل الغرفة:', error);
        res.status(500).json({
            success: false,
            message: 'فشل في جلب الرسائل',
            error: error.message
        });
    }
});

// @route   GET /api/mobile/rooms/:id/online-members
// @desc    جلب قائمة الأعضاء المتصلين في الغرفة
// @access  Protected
router.get('/rooms/:id/online-members', protect, async (req, res) => {
    try {
        const { id: roomId } = req.params;

        // التحقق من وجود الغرفة
        const room = await ChatRoom.findById(roomId);
        if (!room) {
            return res.status(404).json({
                success: false,
                message: 'الغرفة غير موجودة'
            });
        }

        // جلب المستخدمين المتصلين من Socket.IO
        const socketRoom = global.io?.sockets?.adapter?.rooms?.get(`room-${roomId}`);
        const onlineUserIds = [];

        if (socketRoom && global.connectedUsers) {
            // جمع userIds من السوكتات المتصلة
            for (const socketId of socketRoom) {
                const socket = global.io.sockets.sockets.get(socketId);
                if (socket?.userId) {
                    onlineUserIds.push(socket.userId);
                }
            }
        }

        // جلب بيانات المستخدمين المتصلين
        const members = await User.find({ _id: { $in: onlineUserIds } })
            .select('name profileImage')
            .limit(100);

        res.json({
            success: true,
            data: {
                onlineCount: members.length,
                members: members.map(m => ({
                    _id: m._id,
                    name: m.name,
                    profileImage: m.profileImage
                }))
            }
        });
    } catch (error) {
        console.error('خطأ في جلب الأعضاء المتصلين:', error);
        res.status(500).json({
            success: false,
            message: 'فشل في جلب الأعضاء المتصلين',
            error: error.message
        });
    }
});

// @route   POST /api/mobile/rooms/:id/report
// @desc    إبلاغ عن محتوى في الغرفة
// @access  Protected
router.post('/rooms/:id/report', protect, async (req, res) => {
    try {
        const { id: roomId } = req.params;
        const { messageId, reason, details } = req.body;

        // التحقق من السبب
        const validReasons = ['spam', 'inappropriate', 'harassment'];
        if (!reason || !validReasons.includes(reason)) {
            return res.status(400).json({
                success: false,
                message: 'سبب الإبلاغ غير صالح'
            });
        }

        // التحقق من وجود الغرفة
        const room = await ChatRoom.findById(roomId);
        if (!room) {
            return res.status(404).json({
                success: false,
                message: 'الغرفة غير موجودة'
            });
        }

        // إنشاء البلاغ
        const report = new Report({
            reporter: req.user._id,
            type: 'room',
            room: roomId,
            message: messageId || null,
            reason: reason,
            details: details || '',
            status: 'pending'
        });

        await report.save();

        res.json({
            success: true,
            message: 'تم إرسال البلاغ بنجاح'
        });
    } catch (error) {
        console.error('خطأ في إرسال البلاغ:', error);
        res.status(500).json({
            success: false,
            message: 'فشل في إرسال البلاغ',
            error: error.message
        });
    }
});

// @route   PUT /api/mobile/rooms/:id/mute
// @desc    كتم/إلغاء كتم إشعارات الغرفة
// @access  Protected
router.put('/rooms/:id/mute', protect, async (req, res) => {
    try {
        const { id: roomId } = req.params;
        const { muted } = req.body;
        const userId = req.user._id;

        // التحقق من وجود الغرفة
        const room = await ChatRoom.findById(roomId);
        if (!room) {
            return res.status(404).json({
                success: false,
                message: 'الغرفة غير موجودة'
            });
        }

        if (muted) {
            // إضافة الغرفة للقائمة المكتومة
            await User.findByIdAndUpdate(userId, {
                $addToSet: {
                    mutedRooms: {
                        roomId: roomId,
                        mutedAt: new Date()
                    }
                }
            });
        } else {
            // إزالة الغرفة من القائمة المكتومة
            await User.findByIdAndUpdate(userId, {
                $pull: { mutedRooms: { roomId: roomId } }
            });
        }

        res.json({
            success: true,
            message: muted ? 'تم كتم الغرفة' : 'تم إلغاء كتم الغرفة',
            muted
        });
    } catch (error) {
        console.error('خطأ في تحديث حالة الكتم:', error);
        res.status(500).json({
            success: false,
            message: 'فشل في تحديث حالة الكتم',
            error: error.message
        });
    }
});

// @route   POST /api/mobile/rooms/:id/messages/image
// @desc    إرسال صورة في الغرفة
// @access  Protected
router.post('/rooms/:id/messages/image', protect, uploadMessageImage.single('image'), async (req, res) => {
    try {
        const { id: roomId } = req.params;
        const senderId = req.user._id;

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'لم يتم رفع صورة'
            });
        }

        // التحقق من وجود الغرفة
        const room = await ChatRoom.findById(roomId);
        if (!room) {
            return res.status(404).json({
                success: false,
                message: 'الغرفة غير موجودة'
            });
        }

        // التحقق من إعدادات الغرفة (السماح بالصور)
        if (room.settings?.allowImages === false) {
            return res.status(403).json({
                success: false,
                message: 'الصور غير مسموحة في هذه الغرفة'
            });
        }

        // رابط الصورة
        const mediaUrl = `${process.env.BASE_URL || 'https://halachat.com'}/uploads/messages/${req.file.filename}`;

        // إنشاء الرسالة
        const message = new Message({
            chatType: 'room',
            room: roomId,
            sender: senderId,
            type: 'image',
            mediaUrl: mediaUrl,
            content: req.body.caption || ''
        });
        await message.save();

        // تحديث آخر رسالة في الغرفة
        room.lastMessage = {
            content: '📷 صورة',
            sender: senderId,
            sentAt: new Date()
        };
        room.messageCount = (room.messageCount || 0) + 1;
        await room.save();

        // جلب بيانات المرسل
        const populatedMessage = await Message.findById(message._id)
            .populate('sender', 'name profileImage');

        // إرسال عبر Socket.IO
        global.io?.to(`room-${roomId}`).emit('new-room-message', {
            _id: populatedMessage._id,
            roomId: roomId,
            sender: {
                _id: populatedMessage.sender._id,
                name: populatedMessage.sender.name,
                profileImage: populatedMessage.sender.profileImage
            },
            content: populatedMessage.content,
            type: 'image',
            mediaUrl: mediaUrl,
            createdAt: populatedMessage.createdAt
        });

        res.status(201).json({
            success: true,
            data: {
                _id: populatedMessage._id,
                roomId: roomId,
                sender: {
                    _id: populatedMessage.sender._id,
                    name: populatedMessage.sender.name,
                    profileImage: populatedMessage.sender.profileImage
                },
                content: populatedMessage.content,
                type: 'image',
                mediaUrl: mediaUrl,
                createdAt: populatedMessage.createdAt
            }
        });
    } catch (error) {
        console.error('خطأ في إرسال الصورة:', error);
        res.status(500).json({
            success: false,
            message: 'فشل في إرسال الصورة',
            error: error.message
        });
    }
});

// ==================== التصنيفات ====================

/**
 * @route   GET /api/mobile/categories
 * @desc    جلب التصنيفات النشطة للتطبيق
 * @access  Public
 */
router.get('/categories', async (req, res) => {
    try {
        const Category = require('../models/Category');

        const categories = await Category.find({ isActive: true })
            .sort({ order: 1, name: 1 })
            .select('name icon color description roomsCount');

        res.json({
            success: true,
            data: categories,
            count: categories.length
        });
    } catch (error) {
        console.error('خطأ في جلب التصنيفات:', error);
        res.status(500).json({
            success: false,
            message: 'فشل في جلب التصنيفات'
        });
    }
});

module.exports = router;
