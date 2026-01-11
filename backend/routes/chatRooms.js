// Chat Rooms Routes - مسارات غرف المحادثة
const express = require('express');
const router = express.Router();
const ChatRoom = require('../models/ChatRoom');
const Message = require('../models/Message');
const { protect, adminOnly } = require('../middleware/auth');
const { validate } = require('../middleware/validation');
const {
    createChatRoomValidation,
    updateChatRoomValidation,
    mongoIdValidation,
    queryValidation
} = require('../validators/chatRoom.validator');

// @route   GET /api/chat-rooms
// @desc    الحصول على جميع غرف المحادثة
// @access  Admin
router.get('/', protect, adminOnly, queryValidation, validate, async (req, res) => {
    try {
        const { page = 1, limit = 20, search, accessType, isActive } = req.query;

        const query = {};

        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } }
            ];
        }

        if (accessType) query.accessType = accessType;
        if (isActive !== undefined) query.isActive = isActive === 'true';

        const rooms = await ChatRoom.find(query)
            .populate('createdBy', 'name email')
            .populate('lastMessage.sender', 'name')
            .sort({ updatedAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);

        const count = await ChatRoom.countDocuments(query);

        res.json({
            success: true,
            data: {
                rooms,
                totalPages: Math.ceil(count / limit),
                currentPage: page,
                total: count
            }
        });
    } catch (error) {
        console.error('خطأ في جلب غرف المحادثة:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في جلب غرف المحادثة',
            error: error.message
        });
    }
});

// @route   GET /api/chat-rooms/public
// @desc    الحصول على غرف المحادثة العامة (للمستخدمين)
// @access  Protected
router.get('/public', protect, async (req, res) => {
    try {
        const rooms = await ChatRoom.find({
            accessType: 'public',
            isActive: true
        })
            .select('name image description memberCount messageCount lastMessage updatedAt')
            .populate('lastMessage.sender', 'name')
            .sort({ updatedAt: -1 });

        res.json({
            success: true,
            data: rooms
        });
    } catch (error) {
        console.error('خطأ في جلب الغرف العامة:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في جلب الغرف العامة',
            error: error.message
        });
    }
});

// @route   GET /api/chat-rooms/:id
// @desc    الحصول على غرفة محادثة واحدة
// @access  Protected
router.get('/:id', protect, mongoIdValidation, validate, async (req, res) => {
    try {
        const room = await ChatRoom.findById(req.params.id)
            .populate('createdBy', 'name email')
            .populate('admins', 'name email')
            .populate('members', 'name email')
            .populate('lastMessage.sender', 'name');

        if (!room) {
            return res.status(404).json({
                success: false,
                message: 'الغرفة غير موجودة'
            });
        }

        // التحقق من صلاحية الوصول
        const user = req.user;
        if (room.accessType === 'private' && !room.isMember(user._id) && user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'ليس لديك صلاحية الوصول لهذه الغرفة'
            });
        }

        res.json({
            success: true,
            data: room
        });
    } catch (error) {
        console.error('خطأ في جلب الغرفة:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في جلب الغرفة',
            error: error.message
        });
    }
});

// @route   POST /api/chat-rooms
// @desc    إنشاء غرفة محادثة جديدة
// @access  Admin
router.post('/', protect, adminOnly, createChatRoomValidation, validate, async (req, res) => {
    try {
        const { name, image, description, accessType, settings } = req.body;

        // Validation
        if (!name) {
            return res.status(400).json({
                success: false,
                message: 'اسم الغرفة مطلوب'
            });
        }

        // التحقق من عدم وجود غرفة بنفس الاسم
        const existingRoom = await ChatRoom.findOne({ name });
        if (existingRoom) {
            return res.status(400).json({
                success: false,
                message: 'يوجد غرفة بنفس الاسم بالفعل'
            });
        }

        const room = await ChatRoom.create({
            name,
            image: image || 'https://via.placeholder.com/150?text=ChatRoom',
            description: description || '',
            accessType: accessType || 'public',
            settings: settings || {},
            createdBy: req.user._id,
            admins: [req.user._id]
        });

        const populatedRoom = await ChatRoom.findById(room._id)
            .populate('createdBy', 'name email');

        res.status(201).json({
            success: true,
            message: 'تم إنشاء الغرفة بنجاح',
            data: populatedRoom
        });
    } catch (error) {
        console.error('خطأ في إنشاء الغرفة:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في إنشاء الغرفة',
            error: error.message
        });
    }
});

// @route   PUT /api/chat-rooms/:id
// @desc    تحديث غرفة محادثة
// @access  Admin
router.put('/:id', protect, adminOnly, async (req, res) => {
    try {
        const { name, image, description, accessType, settings } = req.body;

        const room = await ChatRoom.findById(req.params.id);

        if (!room) {
            return res.status(404).json({
                success: false,
                message: 'الغرفة غير موجودة'
            });
        }

        // تحديث البيانات
        if (name) room.name = name;
        if (image) room.image = image;
        if (description !== undefined) room.description = description;
        if (accessType) room.accessType = accessType;
        if (settings) room.settings = { ...room.settings, ...settings };

        room.updatedAt = new Date();
        await room.save();

        const updatedRoom = await ChatRoom.findById(room._id)
            .populate('createdBy', 'name email');

        res.json({
            success: true,
            message: 'تم تحديث الغرفة بنجاح',
            data: updatedRoom
        });
    } catch (error) {
        console.error('خطأ في تحديث الغرفة:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في تحديث الغرفة',
            error: error.message
        });
    }
});

// @route   DELETE /api/chat-rooms/:id
// @desc    حذف غرفة محادثة
// @access  Admin
router.delete('/:id', protect, adminOnly, async (req, res) => {
    try {
        const room = await ChatRoom.findById(req.params.id);

        if (!room) {
            return res.status(404).json({
                success: false,
                message: 'الغرفة غير موجودة'
            });
        }

        await ChatRoom.findByIdAndDelete(req.params.id);

        res.json({
            success: true,
            message: 'تم حذف الغرفة بنجاح'
        });
    } catch (error) {
        console.error('خطأ في حذف الغرفة:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في حذف الغرفة',
            error: error.message
        });
    }
});

// @route   DELETE /api/chat-rooms/:id/messages
// @desc    حذف جميع رسائل الغرفة
// @access  Admin
router.delete('/:id/messages', protect, adminOnly, async (req, res) => {
    try {
        const room = await ChatRoom.findById(req.params.id);

        if (!room) {
            return res.status(404).json({
                success: false,
                message: 'الغرفة غير موجودة'
            });
        }

        // حذف جميع الرسائل المرتبطة بهذه الغرفة
        const result = await Message.deleteMany({
            chatType: 'room',
            room: req.params.id
        });

        // تحديث عداد الرسائل
        room.messageCount = 0;
        room.lastMessage = null;
        await room.save();

        res.json({
            success: true,
            message: `تم حذف ${result.deletedCount} رسالة بنجاح`,
            deletedCount: result.deletedCount
        });
    } catch (error) {
        console.error('خطأ في حذف رسائل الغرفة:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في حذف الرسائل',
            error: error.message
        });
    }
});

// @route   PUT /api/chat-rooms/:id/toggle-active
// @desc    تفعيل/إلغاء تفعيل غرفة
// @access  Admin
router.put('/:id/toggle-active', protect, adminOnly, async (req, res) => {
    try {
        const room = await ChatRoom.findById(req.params.id);

        if (!room) {
            return res.status(404).json({
                success: false,
                message: 'الغرفة غير موجودة'
            });
        }

        room.isActive = !room.isActive;
        await room.save();

        res.json({
            success: true,
            message: room.isActive ? 'تم تفعيل الغرفة' : 'تم إلغاء تفعيل الغرفة',
            data: room
        });
    } catch (error) {
        console.error('خطأ في تغيير حالة الغرفة:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في تغيير حالة الغرفة',
            error: error.message
        });
    }
});

// @route   PUT /api/chat-rooms/:id/toggle-lock
// @desc    قفل/فتح غرفة
// @access  Admin
router.put('/:id/toggle-lock', protect, adminOnly, async (req, res) => {
    try {
        const room = await ChatRoom.findById(req.params.id);

        if (!room) {
            return res.status(404).json({
                success: false,
                message: 'الغرفة غير موجودة'
            });
        }

        room.isLocked = !room.isLocked;
        await room.save();

        res.json({
            success: true,
            message: room.isLocked ? 'تم قفل الغرفة' : 'تم فتح الغرفة',
            data: room
        });
    } catch (error) {
        console.error('خطأ في تغيير قفل الغرفة:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في تغيير قفل الغرفة',
            error: error.message
        });
    }
});

// @route   GET /api/chat-rooms/:id/stats
// @desc    إحصائيات الغرفة
// @access  Admin
router.get('/:id/stats', protect, adminOnly, async (req, res) => {
    try {
        const room = await ChatRoom.findById(req.params.id);

        if (!room) {
            return res.status(404).json({
                success: false,
                message: 'الغرفة غير موجودة'
            });
        }

        // إحصائيات الرسائل
        const messagesCount = await Message.countDocuments({ room: req.params.id });
        const todayMessages = await Message.countDocuments({
            room: req.params.id,
            createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) }
        });

        res.json({
            success: true,
            data: {
                room: {
                    name: room.name,
                    memberCount: room.memberCount,
                    messageCount: messagesCount,
                    isActive: room.isActive,
                    isLocked: room.isLocked
                },
                messages: {
                    total: messagesCount,
                    today: todayMessages
                },
                lastActivity: room.updatedAt
            }
        });
    } catch (error) {
        console.error('خطأ في جلب إحصائيات الغرفة:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في جلب الإحصائيات',
            error: error.message
        });
    }
});

module.exports = router;
