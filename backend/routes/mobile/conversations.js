// HalaChat - Mobile API: Conversations Routes
// مسارات المحادثات (طلب/قبول/رفض/قراءة/كتم)

const express = require('express');
const router = express.Router();
const logger = require('../../utils/logger');
const User = require('../../models/User');
const Message = require('../../models/Message');
const Conversation = require('../../models/Conversation');
const SuperLike = require('../../models/SuperLike');
const { protect } = require('../../middleware/auth');
const { validate } = require('../../middleware/validation');
const { conversationRequestValidation, mongoIdParam } = require('../../validators/mobile.validator');
const pushNotificationService = require('../../services/pushNotificationService');
const { getFullUrl } = require('./helpers');

// ==========================================
// نظام المحادثات (طلب/قبول/رفض)
// ==========================================

// @route   POST /api/mobile/conversations/request
// @desc    طلب بدء محادثة مع مستخدم
// @access  Private
router.post('/conversations/request', protect, conversationRequestValidation, validate, async (req, res) => {
    try {
        // Rate limit: 50 requests per 24 hours
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const recentRequests = await Conversation.countDocuments({
            creator: req.user._id,
            createdAt: { $gte: oneDayAgo }
        });
        if (recentRequests >= 50) {
            return res.status(429).json({ success: false, message: 'عدد كبير من الطلبات. حاول لاحقاً' });
        }

        const { targetUserId, initialMessage, isSuperLike } = req.body;

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

        // ========== معالجة Super Like ==========
        let superLikeCreated = false;
        if (isSuperLike) {
            const senderId = req.user._id;

            // التحقق من الحد اليومي
            const senderUser = await User.findById(senderId);
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const lastReset = senderUser.superLikes?.lastReset ? new Date(senderUser.superLikes.lastReset) : new Date(0);
            lastReset.setHours(0, 0, 0, 0);

            let dailyCount = senderUser.superLikes?.daily || 0;
            if (lastReset < today) dailyCount = 0;

            const userIsPremium = senderUser.isPremium && senderUser.premiumExpiresAt > new Date();
            const maxDaily = userIsPremium ? 5 : 1;

            if (dailyCount >= maxDaily) {
                return res.status(429).json({
                    success: false,
                    error: 'super_like_limit_reached',
                    message: `وصلت الحد الأقصى من Super Likes (${maxDaily} يومياً)`,
                    data: { remaining: 0, max: maxDaily }
                });
            }

            // إنشاء Super Like
            await SuperLike.create({ sender: senderId, receiver: targetUserId });
            await User.findByIdAndUpdate(senderId, {
                'superLikes.daily': dailyCount + 1,
                'superLikes.lastReset': new Date()
            });
            superLikeCreated = true;
        }

        // إنشاء محادثة جديدة بحالة "pending"
        const conversation = await Conversation.create({
            type: 'private',
            participants: [req.user._id, targetUserId],
            creator: req.user._id,
            status: 'pending',
            isActive: true,
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
                isSuperLike: superLikeCreated,
                from: {
                    _id: req.user._id,
                    name: req.user.name,
                    profileImage: getFullUrl(req.user.profileImage)
                }
            });
        }

        // ٢. Push Notification عبر FCM
        const notifTitle = superLikeCreated ? '💎 إعجاب مميز!' : 'طلب محادثة جديد';
        const notifBody = superLikeCreated
            ? `${req.user.name} أرسل لك Super Like ويريد التحدث معك`
            : `${req.user.name} يريد التحدث معك`;

        try {
            await pushNotificationService.sendNotificationToUser(
                targetUserId,
                {
                    title: notifTitle,
                    body: notifBody,
                    type: superLikeCreated ? 'super_like' : 'conversation_request'
                },
                {
                    type: superLikeCreated ? 'super_like' : 'conversation_request',
                    conversationId: conversation._id.toString(),
                    senderId: req.user._id.toString(),
                    senderName: req.user.name,
                    isSuperLike: superLikeCreated ? 'true' : 'false'
                }
            );
        } catch (notifError) {
            logger.error('خطأ في إرسال إشعار طلب المحادثة:', notifError);
        }

        res.status(201).json({
            success: true,
            message: superLikeCreated ? 'تم إرسال Super Like وطلب المحادثة' : 'تم إرسال طلب المحادثة',
            data: {
                conversation,
                isExisting: false,
                isSuperLike: superLikeCreated
            }
        });

    } catch (error) {
        logger.error('خطأ في طلب المحادثة:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
        });
    }
});

// @route   PUT /api/mobile/conversations/:id/accept
// @desc    قبول طلب محادثة
// @access  Private
router.put('/conversations/:id/accept', protect, mongoIdParam, validate, async (req, res) => {
    try {
        const conversation = await Conversation.findById(req.params.id)
            .populate('participants', 'name email deviceToken fcmToken');

        if (!conversation) {
            return res.status(404).json({
                success: false,
                message: 'المحادثة غير موجودة'
            });
        }

        // التحقق من أن المحادثة في حالة انتظار
        if (conversation.status !== 'pending') {
            return res.status(400).json({
                success: false,
                message: 'هذا الطلب تم التعامل معه مسبقاً'
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

        // إرسال إشعار لمنشئ المحادثة عبر FCM
        const creator = conversation.participants.find(
            p => p._id.toString() === conversation.creator.toString()
        );

        if (creator && creator.fcmToken) {
            await pushNotificationService.sendNotificationToUser(
                creator._id,
                {
                    title: 'تم قبول طلب المحادثة',
                    body: `${req.user.name} قبل طلب المحادثة`
                },
                {
                    type: 'conversation_request',
                    conversationId: conversation._id.toString(),
                    action: 'accepted'
                }
            );
        }

        // إرسال عبر Socket.IO
        if (global.io) {
            global.io.to(`user:${conversation.creator.toString()}`).emit('conversation-accepted', {
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
        logger.error('خطأ في قبول المحادثة:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
        });
    }
});

// @route   PUT /api/mobile/conversations/:id/reject
// @desc    رفض طلب محادثة
// @access  Private
router.put('/conversations/:id/reject', protect, mongoIdParam, validate, async (req, res) => {
    try {
        const conversation = await Conversation.findById(req.params.id)
            .populate('participants', 'name email deviceToken fcmToken');

        if (!conversation) {
            return res.status(404).json({
                success: false,
                message: 'المحادثة غير موجودة'
            });
        }

        // التحقق من أن المحادثة في حالة انتظار
        if (conversation.status !== 'pending') {
            return res.status(400).json({
                success: false,
                message: 'هذا الطلب تم التعامل معه مسبقاً'
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

        // إرسال إشعار لمنشئ المحادثة عبر FCM
        const creator = conversation.participants.find(
            p => p._id.toString() === conversation.creator.toString()
        );

        if (creator && creator.fcmToken) {
            await pushNotificationService.sendNotificationToUser(
                creator._id,
                {
                    title: 'طلب المحادثة',
                    body: 'لم يتم قبول طلب المحادثة'
                },
                {
                    type: 'conversation_request',
                    conversationId: conversation._id.toString(),
                    action: 'rejected'
                }
            );
        }

        // إرسال عبر Socket.IO
        if (global.io) {
            global.io.to(`user:${conversation.creator.toString()}`).emit('conversation-rejected', {
                conversationId: conversation._id,
                rejectedBy: req.user.name
            });
        }

        res.status(200).json({
            success: true,
            message: 'تم رفض طلب المحادثة',
            data: { conversation }
        });

    } catch (error) {
        logger.error('خطأ في رفض المحادثة:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
        });
    }
});

// @route   PUT /api/mobile/conversations/:id/read
// @desc    تحديث الرسائل كمقروءة في المحادثة
// @access  Private
router.put('/conversations/:id/read', protect, mongoIdParam, validate, async (req, res) => {
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
        logger.error('خطأ في تحديث حالة القراءة:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
        });
    }
});

// @route   GET /api/mobile/conversations/pending
// @desc    الحصول على طلبات المحادثة المعلقة
// @access  Private
router.get('/conversations/pending', protect, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 20, 50);
        const skip = (page - 1) * limit;

        const query = {
            participants: req.user._id,
            creator: { $ne: req.user._id },
            status: 'pending'
        };

        const total = await Conversation.countDocuments(query);

        const conversations = await Conversation.find(query)
            .populate('creator', 'name email profileImage verification.isVerified isPremium isActive deviceBanned suspendedUntil')
            .populate('participants', 'name email profileImage lastLogin isOnline isPremium verification.isVerified isActive deviceBanned suspendedUntil')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        // إضافة حقل isSuperLike لكل طلب
        const creatorIds = conversations.map(c => c.creator._id);
        const superLikes = await SuperLike.find({
            receiver: req.user._id,
            sender: { $in: creatorIds }
        });
        const superLikeSet = new Set(superLikes.map(sl => sl.sender.toString()));

        const { maskInPlace: maskCr, isUserSuspended: isSusp } = require('../../utils/userStatus');
        const enrichedConversations = conversations.map(conv => {
            const convObj = conv.toObject();
            convObj.isSuperLike = superLikeSet.has(conv.creator._id.toString());
            // قناع للـ creator إذا موقوف
            maskCr(convObj, 'creator');
            if (!convObj.creator.isSuspended) {
                convObj.creator.isVerified = conv.creator.verification?.isVerified || false;
                convObj.creator.profileImage = getFullUrl(convObj.creator.profileImage);
            }
            if (convObj.participants) {
                convObj.participants = convObj.participants.map(p => {
                    if (isSusp(p)) {
                        return {
                            _id: p._id,
                            name: 'مستخدم موقوف',
                            profileImage: null,
                            isSuspended: true,
                            isOnline: false
                        };
                    }
                    const { isActive, deviceBanned, suspendedUntil, ...rest } = p;
                    return { ...rest, profileImage: getFullUrl(p.profileImage) };
                });
            }
            return convObj;
        });

        // ترتيب: Super Like أولاً ثم بالتاريخ
        enrichedConversations.sort((a, b) => {
            if (a.isSuperLike && !b.isSuperLike) return -1;
            if (!a.isSuperLike && b.isSuperLike) return 1;
            return new Date(b.createdAt) - new Date(a.createdAt);
        });

        res.status(200).json({
            success: true,
            data: {
                conversations: enrichedConversations,
                total,
                currentPage: page,
                totalPages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        logger.error('خطأ في جلب الطلبات المعلقة:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
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
            isActive: true,
            hiddenBy: { $ne: userId }
        })
            .populate('participants', 'name email profileImage lastLogin isOnline isPremium verification.isVerified isActive deviceBanned suspendedUntil')
            .populate('lastMessage')
            .sort({ updatedAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .lean(); // استخدام lean للتعديل على النتائج

        // حساب عدد الرسائل غير المقروءة لكل محادثة (aggregation واحد بدل N+1 queries)
        const conversationIds = conversations.map(c => c._id);
        const unreadCounts = await Message.aggregate([
            {
                $match: {
                    conversation: { $in: conversationIds },
                    sender: { $ne: userId },
                    'readBy.user': { $ne: userId }
                }
            },
            {
                $group: {
                    _id: '$conversation',
                    count: { $sum: 1 }
                }
            }
        ]);

        const { isUserSuspended: isSuspHelper } = require('../../utils/userStatus');
        const unreadMap = new Map(unreadCounts.map(u => [u._id.toString(), u.count]));
        const conversationsWithUnread = conversations.map(conv => ({
            ...conv,
            participants: conv.participants ? conv.participants.map(p => {
                if (isSuspHelper(p)) {
                    return {
                        _id: p._id,
                        name: 'مستخدم موقوف',
                        profileImage: null,
                        isSuspended: true,
                        isOnline: false
                    };
                }
                const { isActive, deviceBanned, suspendedUntil, ...rest } = p;
                return { ...rest, profileImage: getFullUrl(p.profileImage) };
            }) : conv.participants,
            unreadCount: unreadMap.get(conv._id.toString()) || 0
        }));

        const total = await Conversation.countDocuments({
            participants: userId,
            status: { $in: ['accepted', 'pending'] },
            isActive: true,
            hiddenBy: { $ne: userId }
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
        logger.error('خطأ في جلب المحادثات:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
        });
    }
});

// @route   PUT /api/mobile/conversations/:id/mute
// @desc    كتم/إلغاء كتم إشعارات محادثة
// @access  Private
router.put('/conversations/:id/mute', protect, mongoIdParam, validate, async (req, res) => {
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
        logger.error('خطأ في كتم المحادثة:', error);
        res.status(500).json({
            success: false,
            message: 'فشل في تحديث حالة الكتم',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
        });
    }
});

// ==========================================
// إخفاء المحادثة (حذف ناعم - للمستخدم فقط)
// ==========================================
router.put('/conversations/:id/leave', protect, async (req, res) => {
    try {
        const userId = req.user._id;
        const conversation = await Conversation.findOne({
            _id: req.params.id,
            participants: userId
        });

        if (!conversation) {
            return res.status(404).json({ success: false, message: 'المحادثة غير موجودة' });
        }

        // إضافة المستخدم لقائمة الإخفاء
        if (!conversation.hiddenBy.includes(userId)) {
            conversation.hiddenBy.push(userId);
            await conversation.save();
        }

        res.json({ success: true, message: 'تم إخفاء المحادثة' });
    } catch (error) {
        logger.error('خطأ في إخفاء المحادثة:', error);
        res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
    }
});

// ==========================================
// تحديث إعدادات حذف الرسائل (مثل Snapchat)
// ==========================================
router.put('/conversations/:id/delete-settings', protect, async (req, res) => {
    try {
        const userId = req.user._id;
        const { deleteMode } = req.body; // none | on_exit | 24h

        if (!['none', 'on_exit', '24h'].includes(deleteMode)) {
            return res.status(400).json({ success: false, message: 'وضع حذف غير صالح' });
        }

        const conversation = await Conversation.findOne({
            _id: req.params.id,
            participants: userId
        }).populate('participants', 'name');

        if (!conversation) {
            return res.status(404).json({ success: false, message: 'المحادثة غير موجودة' });
        }

        const oldMode = conversation.deleteMode || 'none';
        conversation.deleteMode = deleteMode;
        conversation.settings.autoDeleteMessages = deleteMode !== 'none';
        conversation.settings.autoDeleteDays = deleteMode === '24h' ? 1 : 0;
        await conversation.save();

        // رسالة نظام توضيحية (مثل Snapchat)
        const modeLabels = { none: 'بدون حذف', on_exit: 'حذف بعد الخروج', '24h': 'حذف بعد 24 ساعة' };
        const systemMessage = await Message.create({
            chatType: 'conversation',
            conversation: conversation._id,
            sender: userId,
            content: `غيّر إعدادات حذف الرسائل إلى "${modeLabels[deleteMode]}"`,
            type: 'text',
            status: 'sent'
        });

        // إرسال عبر Socket للطرف الآخر
        if (global.io) {
            global.io.to(`conversation-${conversation._id}`).emit('delete-settings-changed', {
                conversationId: conversation._id.toString(),
                deleteMode,
                changedBy: userId.toString(),
                message: systemMessage
            });
        }

        res.json({
            success: true,
            message: `تم تغيير وضع الحذف إلى "${modeLabels[deleteMode]}"`,
            data: { deleteMode, systemMessage }
        });
    } catch (error) {
        logger.error('خطأ في تحديث إعدادات الحذف:', error);
        res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
    }
});

module.exports = router;
