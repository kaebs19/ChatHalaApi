// HalaChat - Mobile API: Messages Routes
// مسارات الرسائل

const express = require('express');
const router = express.Router();
const logger = require('../../utils/logger');
const fs = require('fs');
const Message = require('../../models/Message');
const Conversation = require('../../models/Conversation');
const BannedWord = require('../../models/BannedWord');
const { protect } = require('../../middleware/auth');
const pushNotificationService = require('../../services/pushNotificationService');
const { uploadMessageImage, getFullUrl } = require('./helpers');

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

        // فحص الكلمات المحظورة
        let bannedWordResult = { isClean: true, foundWords: [] };
        if (type === 'text' && content) {
            bannedWordResult = await BannedWord.checkText(content, 'word');
        }

        // تنظيف المحتوى من الكلمات المحظورة
        let filteredContent = null;
        if (!bannedWordResult.isClean) {
            filteredContent = await BannedWord.cleanText(content, '*****');
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

        // إنشاء الرسالة (مع نتائج فحص الكلمات المحظورة)
        const message = await Message.create({
            chatType: 'conversation',
            conversation: conversationId,
            sender: req.user._id,
            content,
            type,
            mediaUrl: mediaUrl || null,
            mediaMetadata: mediaMetadata || null,
            status: 'sent',
            filteredContent: filteredContent,
            reviewStatus: !bannedWordResult.isClean ? 'pending' : 'none',
            hasBannedWords: !bannedWordResult.isClean,
            bannedWordsFound: bannedWordResult.foundWords.map(w => ({
                word: w.word, severity: w.severity, action: w.action
            })),
            bannedWordSeverity: bannedWordResult.highestSeverity || null
        });

        // تنبيه الأدمن + تحذير المرسل إذا وُجدت كلمات محظورة
        if (!bannedWordResult.isClean) {
            const User = require('../../models/User');
            const updatedUser = await User.findByIdAndUpdate(
                req.user._id,
                { $inc: { violationCount: 1 } },
                { new: true, select: 'violationCount' }
            );
            const vCount = updatedUser?.violationCount || 1;
            const vRemaining = Math.max(0, 5 - vCount);

            if (global.io) {
                global.io.emit('banned-word-alert', {
                    messageId: message._id,
                    conversationId,
                    senderId: req.user._id,
                    senderName: req.user.name,
                    content: content.substring(0, 100),
                    wordsFound: bannedWordResult.foundWords,
                    severity: bannedWordResult.highestSeverity,
                    chatType: 'conversation',
                    timestamp: new Date()
                });
                global.io.to(`user:${req.user._id}`).emit('banned-word-warning', {
                    title: '⚠️ تنبيه',
                    body: vRemaining > 0
                        ? `رسالتك تحتوي على كلمات محظورة! متبقي ${vRemaining} مخالفات قبل تعليق حسابك.`
                        : 'تم تعليق حسابك بسبب تكرار المخالفات.',
                    violationCount: vCount,
                    remaining: vRemaining
                });
            }
        }

        // تحديث آخر رسالة + عداد الرسائل
        conversation.lastMessage = message._id;
        if (!conversation.metadata) conversation.metadata = {};
        conversation.metadata.totalMessages = (conversation.metadata.totalMessages || 0) + 1;
        await conversation.save();

        // جلب الرسالة مع بيانات المرسل
        const populatedMessage = await Message.findById(message._id)
            .populate('sender', 'name email profileImage isPremium verification.isVerified');

        // تحويل الصور إلى URLs كاملة
        const messageObj = populatedMessage.toObject();
        if (messageObj.sender) messageObj.sender.profileImage = getFullUrl(messageObj.sender.profileImage);
        if (messageObj.mediaUrl) messageObj.mediaUrl = getFullUrl(messageObj.mediaUrl);

        // استبدال المحتوى بالمحتوى المفلتر للموبايل
        if (messageObj.filteredContent) {
            messageObj.content = messageObj.filteredContent;
        }

        // إرسال عبر Socket.IO
        logger.debug('About to emit new-message to room:', `conversation-${conversationId}`);
        logger.debug('global.io exists:', !!global.io);
        if (global.io) {
            const socketMessage = { ...messageObj };
            if (filteredContent) {
                socketMessage.content = filteredContent;
            }
            global.io.to(`conversation-${conversationId}`).emit('new-message', {
                message: socketMessage
            });
            logger.debug('Emitted!');
        } else {
            logger.error('global.io is undefined!');
        }

        // إرسال إشعارات للمستقبلين الـ offline فقط عبر FCM
        const recipients = conversation.participants.filter(
            p => p._id.toString() !== req.user._id.toString()
        );

        logger.debug('عدد المستقبلين:', recipients.length);

        // إرسال Push Notifications بشكل متوازي (بدل تسلسلي) + بدون انتظار
        const pushContent = filteredContent || content;
        const pushMessage = type === 'text'
            ? (pushContent.length > 100 ? pushContent.substring(0, 100) + '...' : pushContent)
            : `أرسل ${type === 'image' ? 'صورة' : type === 'audio' ? 'رسالة صوتية' : type === 'video' ? 'فيديو' : 'ملف'}`;

        const offlineRecipients = recipients.filter(r => {
            const recipientId = r._id.toString();
            const isOnline = global.connectedUsers && global.connectedUsers.has(recipientId);
            if (isOnline) logger.debug(`${r.name} متصل بالسوكت - لا حاجة لـ Push`);
            return !isOnline;
        });

        // Fire-and-forget: لا نوقف الرد حتى ترسل الإشعارات
        if (offlineRecipients.length > 0) {
            Promise.allSettled(
                offlineRecipients.map(recipient =>
                    pushNotificationService.sendNewMessageNotification(
                        recipient._id,
                        req.user.name,
                        pushMessage,
                        conversationId
                    )
                )
            ).then(results => {
                results.forEach((r, i) => {
                    if (r.status === 'rejected') {
                        logger.error(`فشل إشعار ${offlineRecipients[i].name}:`, r.reason);
                    }
                });
            }).catch(err => logger.error('خطأ في إرسال الإشعارات:', err));
        }

        res.status(201).json({
            success: true,
            message: 'تم إرسال الرسالة',
            data: { message: messageObj }
        });

    } catch (error) {
        logger.error('خطأ في إرسال الرسالة:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
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
            fs.unlink(req.file.path, (err) => { if (err) console.error('File cleanup error:', err); });
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
            fs.unlink(req.file.path, (err) => { if (err) console.error('File cleanup error:', err); });
            return res.status(403).json({
                success: false,
                message: 'ليس لديك صلاحية لهذه المحادثة'
            });
        }

        // رابط الصورة
        const baseUrl = process.env.BASE_URL || 'https://halachat.khalafiati.io';
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
            .populate('sender', 'name profileImage isPremium verification.isVerified');

        // تحويل الصور إلى URLs كاملة
        const imgMsgObj = populatedMessage.toObject();
        if (imgMsgObj.sender) imgMsgObj.sender.profileImage = getFullUrl(imgMsgObj.sender.profileImage);
        if (imgMsgObj.mediaUrl) imgMsgObj.mediaUrl = getFullUrl(imgMsgObj.mediaUrl);

        // إرسال عبر Socket.IO
        if (global.io) {
            global.io.to(`conversation-${conversationId}`).emit('new-message', {
                message: imgMsgObj
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
            data: { message: imgMsgObj }
        });

    } catch (error) {
        logger.error('خطأ في إرسال الصورة:', error);
        // حذف الصورة إذا حدث خطأ
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlink(req.file.path, (err) => { if (err) console.error('File cleanup error:', err); });
        }
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
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

        // فحص الكلمات المحظورة
        let bannedWordResult = { isClean: true, foundWords: [] };
        if (type === 'text' && content) {
            bannedWordResult = await BannedWord.checkText(content, 'word');
        }

        // تنظيف المحتوى من الكلمات المحظورة
        let filteredContent = null;
        if (!bannedWordResult.isClean) {
            filteredContent = await BannedWord.cleanText(content, '*****');
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

        // إنشاء الرسالة (مع فحص الكلمات المحظورة)
        const message = await Message.create({
            chatType: 'conversation',
            conversation: conversationId,
            sender: req.user._id,
            content,
            type,
            mediaUrl: mediaUrl || null,
            mediaMetadata: mediaMetadata || null,
            status: 'sent',
            filteredContent: filteredContent,
            reviewStatus: !bannedWordResult.isClean ? 'pending' : 'none',
            hasBannedWords: !bannedWordResult.isClean,
            bannedWordsFound: bannedWordResult.foundWords.map(w => ({
                word: w.word, severity: w.severity, action: w.action
            })),
            bannedWordSeverity: bannedWordResult.highestSeverity || null
        });

        // تنبيه الأدمن + تحذير المرسل إذا وُجدت كلمات محظورة
        if (!bannedWordResult.isClean) {
            const User = require('../../models/User');
            const updatedUser = await User.findByIdAndUpdate(
                req.user._id,
                { $inc: { violationCount: 1 } },
                { new: true, select: 'violationCount' }
            );
            const vCount = updatedUser?.violationCount || 1;
            const vRemaining = Math.max(0, 5 - vCount);

            if (global.io) {
                global.io.emit('banned-word-alert', {
                    messageId: message._id,
                    conversationId,
                    senderId: req.user._id,
                    senderName: req.user.name,
                    content: content.substring(0, 100),
                    wordsFound: bannedWordResult.foundWords,
                    severity: bannedWordResult.highestSeverity,
                    chatType: 'conversation',
                    timestamp: new Date()
                });
                global.io.to(`user:${req.user._id}`).emit('banned-word-warning', {
                    title: '⚠️ تنبيه',
                    body: vRemaining > 0
                        ? `رسالتك تحتوي على كلمات محظورة! متبقي ${vRemaining} مخالفات قبل تعليق حسابك.`
                        : 'تم تعليق حسابك بسبب تكرار المخالفات.',
                    violationCount: vCount,
                    remaining: vRemaining
                });
            }
        }

        // تحديث آخر رسالة + عداد الرسائل
        conversation.lastMessage = message._id;
        if (!conversation.metadata) conversation.metadata = {};
        conversation.metadata.totalMessages = (conversation.metadata.totalMessages || 0) + 1;
        await conversation.save();

        // جلب الرسالة مع بيانات المرسل
        const populatedMessage = await Message.findById(message._id)
            .populate('sender', 'name email profileImage isPremium verification.isVerified');

        // تحويل الصور إلى URLs كاملة
        const altMsgObj = populatedMessage.toObject();
        if (altMsgObj.sender) altMsgObj.sender.profileImage = getFullUrl(altMsgObj.sender.profileImage);
        if (altMsgObj.mediaUrl) altMsgObj.mediaUrl = getFullUrl(altMsgObj.mediaUrl);

        // استبدال المحتوى بالمحتوى المفلتر للموبايل
        if (altMsgObj.filteredContent) {
            altMsgObj.content = altMsgObj.filteredContent;
        }

        // إرسال عبر Socket.IO
        logger.debug('About to emit new-message to room:', `conversation-${conversationId}`);
        logger.debug('global.io exists:', !!global.io);
        if (global.io) {
            const socketMessage = { ...altMsgObj };
            if (filteredContent) {
                socketMessage.content = filteredContent;
            }
            global.io.to(`conversation-${conversationId}`).emit('new-message', {
                message: socketMessage
            });
            logger.debug('Emitted!');
        }

        // إرسال إشعارات للمستقبلين الـ offline فقط عبر FCM
        const recipients = conversation.participants.filter(
            p => p._id.toString() !== req.user._id.toString()
        );

        logger.debug('عدد المستقبلين:', recipients.length);

        const pushContent = filteredContent || content;
        for (const recipient of recipients) {
            const recipientId = recipient._id.toString();
            const isOnline = global.connectedUsers && global.connectedUsers.has(recipientId);

            if (isOnline) {
                logger.debug(`${recipient.name} متصل بالسوكت - لا حاجة لـ Push`);
            } else {
                logger.debug(`${recipient.name} غير متصل - إرسال Push Notification`);
                const pushResult = await pushNotificationService.sendNewMessageNotification(
                    recipient._id,
                    req.user.name,
                    type === 'text' ? (pushContent.length > 100 ? pushContent.substring(0, 100) + '...' : pushContent) : `أرسل ${type === 'image' ? 'صورة' : type === 'audio' ? 'رسالة صوتية' : type === 'video' ? 'فيديو' : 'ملف'}`,
                    conversationId
                );
                logger.debug('نتيجة الإشعار:', JSON.stringify(pushResult));
            }
        }

        res.status(201).json({
            success: true,
            message: 'تم إرسال الرسالة',
            data: { message: altMsgObj }
        });

    } catch (error) {
        logger.error('خطأ في إرسال الرسالة:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
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
            .populate('sender', 'name email profileImage isPremium verification.isVerified')
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);

        const total = await Message.countDocuments({
            conversation: conversationId,
            isDeleted: false
        });

        // تحويل الصور إلى URLs كاملة + استبدال المحتوى بالمفلتر للموبايل
        const messagesWithFullUrls = messages.reverse().map(msg => {
            const msgObj = msg.toObject();
            if (msgObj.sender) msgObj.sender.profileImage = getFullUrl(msgObj.sender.profileImage);
            if (msgObj.mediaUrl) msgObj.mediaUrl = getFullUrl(msgObj.mediaUrl);
            if (msgObj.filteredContent) {
                msgObj.content = msgObj.filteredContent;
            }
            return msgObj;
        });

        res.status(200).json({
            success: true,
            data: {
                messages: messagesWithFullUrls, // عكس الترتيب للعرض
                total,
                currentPage: parseInt(page),
                totalPages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        logger.error('خطأ في جلب الرسائل:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
        });
    }
});

module.exports = router;
