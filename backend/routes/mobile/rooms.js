// HalaChat - Mobile API: Rooms Routes
// مسارات غرف المحادثة العامة والتصنيفات

const express = require('express');
const router = express.Router();
const logger = require('../../utils/logger');
const User = require('../../models/User');
const Message = require('../../models/Message');
const ChatRoom = require('../../models/ChatRoom');
const Report = require('../../models/Report');
const BannedWord = require('../../models/BannedWord');
const { protect } = require('../../middleware/auth');
const { blockIfSoftSuspended } = require('../../middleware/checkRestriction');
const { getFullUrl, uploadMessageImage } = require('./helpers');
const { get: cacheGet, set: cacheSet, CACHE_TTL } = require('../../utils/cache');

// Helper: تنظيف المدخلات من أحرف Regex الخاصة لمنع NoSQL Injection
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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
                { name: { $regex: escapeRegex(search), $options: 'i' } },
                { description: { $regex: escapeRegex(search), $options: 'i' } }
            ];
        }

        const rooms = await ChatRoom.find(filter)
            .select('name image description category memberCount messageCount isLocked lastMessage updatedAt pinnedMessage')
            .populate('lastMessage.sender', 'name profileImage isPremium verification.isVerified')
            .sort({ updatedAt: -1 })
            .skip((page - 1) * limit)
            .limit(parseInt(limit));

        const total = await ChatRoom.countDocuments(filter);

        // جلب عضوية المستخدم لكل الغرف بعملية واحدة
        const roomIds = rooms.map(r => r._id);
        const joinedRooms = await ChatRoom.find(
            { _id: { $in: roomIds }, members: req.user._id },
            { _id: 1 }
        ).lean();
        const joinedSet = new Set(joinedRooms.map(r => r._id.toString()));

        // تنسيق البيانات كجدول مبسط
        const tableData = rooms.map(room => {
            // حساب عدد المتصلين من Socket.IO
            const socketRoom = global.io?.sockets?.adapter?.rooms?.get(`room-${room._id}`);
            const onlineCount = socketRoom ? socketRoom.size : 0;

            // التحقق هل المستخدم عضو بالغرفة
            const isJoined = joinedSet.has(room._id.toString());

            return {
                id: room._id,
                name: room.name,
                image: getFullUrl(room.image),
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
        logger.error('خطأ في جلب الغرف:', error);
        res.status(500).json({
            success: false,
            message: 'فشل في جلب الغرف',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
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
            filter.content = { $regex: escapeRegex(search), $options: 'i' };
        }

        // جلب الرسائل
        const messages = await Message.find(filter)
            .populate('sender', 'name profileImage isPremium verification.isVerified')
            .sort({ createdAt: -1 })
            .skip((parseInt(page) - 1) * parseInt(limit))
            .limit(parseInt(limit));

        const total = await Message.countDocuments(filter);

        res.json({
            success: true,
            data: {
                messages: messages.map(msg => {
                    const m = msg.toObject ? msg.toObject() : { ...msg };
                    return {
                        _id: m._id,
                        roomId: m.room,
                        sender: {
                            _id: msg.sender?._id,
                            name: msg.sender?.name,
                            profileImage: getFullUrl(msg.sender?.profileImage)
                        },
                        content: m.filteredContent || m.content,
                        type: m.type || 'text',
                        mediaUrl: getFullUrl(m.mediaUrl) || null,
                        createdAt: m.createdAt
                    };
                }),
                page: parseInt(page),
                totalPages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        logger.error('خطأ في جلب رسائل الغرفة:', error);
        res.status(500).json({
            success: false,
            message: 'فشل في جلب الرسائل',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
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
            .select('name profileImage isPremium verification.isVerified')
            .limit(100);

        res.json({
            success: true,
            data: {
                onlineCount: members.length,
                members: members.map(m => ({
                    _id: m._id,
                    name: m.name,
                    profileImage: getFullUrl(m.profileImage),
                    isPremium: m.isPremium || false,
                    isVerified: m.verification?.isVerified || false
                }))
            }
        });
    } catch (error) {
        logger.error('خطأ في جلب الأعضاء المتصلين:', error);
        res.status(500).json({
            success: false,
            message: 'فشل في جلب الأعضاء المتصلين',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
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
        logger.error('خطأ في إرسال البلاغ:', error);
        res.status(500).json({
            success: false,
            message: 'فشل في إرسال البلاغ',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
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
        logger.error('خطأ في تحديث حالة الكتم:', error);
        res.status(500).json({
            success: false,
            message: 'فشل في تحديث حالة الكتم',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
        });
    }
});

// @route   POST /api/mobile/rooms/:id/messages
// @desc    إرسال رسالة نصية في الغرفة
// @access  Protected
router.post('/rooms/:id/messages', protect, blockIfSoftSuspended, async (req, res) => {
    try {
        const { id: roomId } = req.params;
        const { content, type = 'text' } = req.body;
        const senderId = req.user._id;

        if (!content || !content.trim()) {
            return res.status(400).json({
                success: false,
                message: 'محتوى الرسالة مطلوب'
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

        if (!room.isActive) {
            return res.status(403).json({
                success: false,
                message: 'الغرفة غير نشطة'
            });
        }

        if (room.isLocked) {
            return res.status(403).json({
                success: false,
                message: 'الغرفة مقفلة'
            });
        }

        // فحص الكلمات المحظورة
        let bannedWordResult = { isClean: true, foundWords: [] };
        if (type === 'text' && content) {
            bannedWordResult = await BannedWord.checkText(content.trim(), 'word');
        }

        // تنظيف النص من الكلمات المحظورة
        let filteredContent = null;
        if (!bannedWordResult.isClean) {
            filteredContent = await BannedWord.cleanText(content.trim(), '*****');
        }

        // إنشاء الرسالة
        const message = new Message({
            chatType: 'room',
            room: roomId,
            sender: senderId,
            type: type,
            content: content.trim(),
            filteredContent: filteredContent,
            reviewStatus: !bannedWordResult.isClean ? 'pending' : 'none',
            hasBannedWords: !bannedWordResult.isClean,
            bannedWordsFound: bannedWordResult.foundWords.map(w => ({
                word: w.word, severity: w.severity, action: w.action
            })),
            bannedWordSeverity: bannedWordResult.highestSeverity || null
        });
        await message.save();

        // تنبيه الأدمن إذا وُجدت كلمات محظورة
        if (!bannedWordResult.isClean && global.io) {
            global.io.emit('banned-word-alert', {
                messageId: message._id,
                roomId,
                senderId,
                senderName: req.user.name,
                content: content.substring(0, 100),
                wordsFound: bannedWordResult.foundWords,
                severity: bannedWordResult.highestSeverity,
                chatType: 'room',
                timestamp: new Date()
            });
        }

        // تحديث آخر رسالة في الغرفة
        room.lastMessage = {
            content: content.substring(0, 50),
            sender: senderId,
            sentAt: new Date()
        };
        room.messageCount = (room.messageCount || 0) + 1;
        await room.save();

        // جلب بيانات المرسل
        const populatedMessage = await Message.findById(message._id)
            .populate('sender', 'name profileImage isPremium verification.isVerified');

        // إرسال عبر Socket.IO لجميع المتصلين في الغرفة
        if (global.io) {
            global.io.to(`room-${roomId}`).emit('new-room-message', {
                _id: populatedMessage._id,
                roomId: roomId,
                sender: {
                    _id: populatedMessage.sender._id,
                    name: populatedMessage.sender.name,
                    profileImage: getFullUrl(populatedMessage.sender.profileImage)
                },
                content: filteredContent || populatedMessage.content,
                type: populatedMessage.type,
                createdAt: populatedMessage.createdAt
            });
        }

        res.status(201).json({
            success: true,
            data: {
                message: {
                    _id: populatedMessage._id,
                    roomId: roomId,
                    sender: {
                        _id: populatedMessage.sender._id,
                        name: populatedMessage.sender.name,
                        profileImage: getFullUrl(populatedMessage.sender.profileImage)
                    },
                    content: populatedMessage.content,
                    type: populatedMessage.type,
                    createdAt: populatedMessage.createdAt
                }
            }
        });

    } catch (error) {
        logger.error('خطأ في إرسال رسالة الغرفة:', error);
        res.status(500).json({
            success: false,
            message: 'فشل في إرسال الرسالة',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
        });
    }
});

// @route   POST /api/mobile/rooms/:id/messages/image
// @desc    إرسال صورة في الغرفة
// @access  Protected
router.post('/rooms/:id/messages/image', protect, blockIfSoftSuspended, uploadMessageImage.single('image'), async (req, res) => {
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
        const mediaUrl = `${process.env.BASE_URL || 'https://halachat.khalafiati.io'}/uploads/messages/${req.file.filename}`;

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
            .populate('sender', 'name profileImage isPremium verification.isVerified');

        // إرسال عبر Socket.IO
        global.io?.to(`room-${roomId}`).emit('new-room-message', {
            _id: populatedMessage._id,
            roomId: roomId,
            sender: {
                _id: populatedMessage.sender._id,
                name: populatedMessage.sender.name,
                profileImage: getFullUrl(populatedMessage.sender.profileImage)
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
                    profileImage: getFullUrl(populatedMessage.sender.profileImage)
                },
                content: populatedMessage.content,
                type: 'image',
                mediaUrl: mediaUrl,
                createdAt: populatedMessage.createdAt
            }
        });
    } catch (error) {
        logger.error('خطأ في إرسال الصورة:', error);
        res.status(500).json({
            success: false,
            message: 'فشل في إرسال الصورة',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
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
        const Category = require('../../models/Category');

        const categories = await Category.find({ isActive: true })
            .sort({ order: 1, name: 1 })
            .select('name icon color description roomsCount');

        res.json({
            success: true,
            data: categories,
            count: categories.length
        });
    } catch (error) {
        logger.error('خطأ في جلب التصنيفات:', error);
        res.status(500).json({
            success: false,
            message: 'فشل في جلب التصنيفات'
        });
    }
});

module.exports = router;
