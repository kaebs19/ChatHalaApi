// HalaChat Dashboard - Messages Routes
// مسارات API الخاصة بالرسائل

const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const { protect, adminOnly } = require('../middleware/auth');

// Helper: تنظيف المدخلات من أحرف Regex الخاصة لمنع NoSQL Injection
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// @route   GET /api/messages/conversation/:conversationId
// @desc    جلب جميع رسائل محادثة معينة
// @access  Admin
router.get('/conversation/:conversationId', protect, adminOnly, async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { page = 1, limit = 50, search = '' } = req.query;

        // التحقق من وجود المحادثة
        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
            return res.status(404).json({
                success: false,
                message: 'المحادثة غير موجودة'
            });
        }

        // بناء الفلتر
        const filter = {
            chatType: 'conversation',
            conversation: conversationId
        };

        // البحث في المحتوى
        if (search) {
            filter.content = { $regex: escapeRegex(search), $options: 'i' };
        }

        // الحصول على الرسائل مع pagination
        const messages = await Message.find(filter)
            .populate('sender', 'name email profileImage')
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);

        // عدد الرسائل الكلي
        const total = await Message.countDocuments(filter);

        res.json({
            success: true,
            data: {
                messages,
                currentPage: page,
                totalPages: Math.ceil(total / limit),
                totalMessages: total
            }
        });
    } catch (error) {
        console.error('خطأ في جلب الرسائل:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في جلب الرسائل',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
        });
    }
});

// @route   GET /api/messages/flagged
// @desc    الرسائل المحظورة للمراجعة
// @access  Admin
router.get('/flagged', protect, adminOnly, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const status = req.query.status || 'pending'; // pending, reviewed, dismissed, all
        const severity = req.query.severity; // low, medium, high
        const chatType = req.query.chatType; // conversation, room

        const filter = { hasBannedWords: true };
        if (status !== 'all') filter.reviewStatus = status;
        if (severity) filter.bannedWordSeverity = severity;
        if (chatType) filter.chatType = chatType;

        const messages = await Message.find(filter)
            .populate('sender', 'name email profileImage')
            .populate('conversation', 'participants')
            .populate('room', 'name')
            .populate('reviewedBy', 'name')
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean();

        const total = await Message.countDocuments(filter);

        res.json({
            success: true,
            messages,
            pagination: {
                current: page,
                pages: Math.ceil(total / limit),
                total
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'خطأ في جلب الرسائل المحظورة',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
        });
    }
});

// @route   GET /api/messages/flagged/stats
// @desc    إحصائيات المراجعة
// @access  Admin
router.get('/flagged/stats', protect, adminOnly, async (req, res) => {
    try {
        const [pending, reviewed, dismissed, total] = await Promise.all([
            Message.countDocuments({ hasBannedWords: true, reviewStatus: 'pending' }),
            Message.countDocuments({ hasBannedWords: true, reviewStatus: 'reviewed' }),
            Message.countDocuments({ hasBannedWords: true, reviewStatus: 'dismissed' }),
            Message.countDocuments({ hasBannedWords: true })
        ]);

        const bySeverity = await Message.aggregate([
            { $match: { hasBannedWords: true, reviewStatus: 'pending' } },
            { $group: { _id: '$bannedWordSeverity', count: { $sum: 1 } } }
        ]);

        res.json({
            success: true,
            stats: { pending, reviewed, dismissed, total },
            bySeverity: bySeverity.reduce((acc, s) => { acc[s._id || 'unknown'] = s.count; return acc; }, {})
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'خطأ في جلب الإحصائيات',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
        });
    }
});

// @route   PUT /api/messages/:id/review
// @desc    تحديث حالة المراجعة
// @access  Admin
router.put('/:id/review', protect, adminOnly, async (req, res) => {
    try {
        const { status, action } = req.body; // status: reviewed/dismissed, action: delete/warn/none

        if (!['reviewed', 'dismissed'].includes(status)) {
            return res.status(400).json({ success: false, message: 'حالة المراجعة غير صالحة' });
        }

        const message = await Message.findById(req.params.id);
        if (!message) {
            return res.status(404).json({ success: false, message: 'الرسالة غير موجودة' });
        }

        message.reviewStatus = status;
        message.reviewedBy = req.user._id;
        message.reviewedAt = new Date();

        // إذا طلب حذف الرسالة
        if (action === 'delete') {
            message.isDeleted = true;
            message.deletedAt = new Date();
        }

        await message.save();

        // زيادة عداد المخالفات عند المراجعة
        if (status === 'reviewed' && message.sender) {
            const User = require('../models/User');
            const sender = await User.findById(message.sender);
            if (sender) {
                sender.violationCount = (sender.violationCount || 0) + 1;
                sender.warnings.push({
                    reason: `رسالة مخالفة: ${message.content?.substring(0, 50)}`,
                    action: 'warn',
                    adminId: req.user._id
                });
                // إيقاف تلقائي عند 5 مخالفات
                if (sender.violationCount >= 5) {
                    sender.isActive = false;
                    sender.suspendedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
                    sender.suspendReason = 'إيقاف تلقائي - تجاوز 5 مخالفات';
                }
                await sender.save();
            }
        }

        res.json({
            success: true,
            message: 'تم تحديث حالة المراجعة',
            data: message
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'خطأ في تحديث المراجعة',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
        });
    }
});

// @route   GET /api/messages/:id
// @desc    جلب رسالة واحدة
// @access  Admin
router.get('/:id', protect, adminOnly, async (req, res) => {
    try {
        const message = await Message.findById(req.params.id)
            .populate('sender', 'name email profileImage')
            .populate('conversation', 'title type');

        if (!message) {
            return res.status(404).json({
                success: false,
                message: 'الرسالة غير موجودة'
            });
        }

        res.json({
            success: true,
            data: message
        });
    } catch (error) {
        console.error('خطأ في جلب الرسالة:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في جلب الرسالة',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
        });
    }
});

// @route   DELETE /api/messages/:id
// @desc    حذف رسالة واحدة (soft delete)
// @access  Admin
router.delete('/:id', protect, adminOnly, async (req, res) => {
    try {
        const message = await Message.findById(req.params.id);

        if (!message) {
            return res.status(404).json({
                success: false,
                message: 'الرسالة غير موجودة'
            });
        }

        // استخدام الحذف الناعم
        await message.softDelete();

        res.json({
            success: true,
            message: 'تم حذف الرسالة بنجاح'
        });
    } catch (error) {
        console.error('خطأ في حذف الرسالة:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في حذف الرسالة',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
        });
    }
});

// @route   DELETE /api/messages/:id/permanent
// @desc    حذف رسالة نهائياً
// @access  Admin
router.delete('/:id/permanent', protect, adminOnly, async (req, res) => {
    try {
        const message = await Message.findById(req.params.id);

        if (!message) {
            return res.status(404).json({
                success: false,
                message: 'الرسالة غير موجودة'
            });
        }

        await Message.findByIdAndDelete(req.params.id);

        res.json({
            success: true,
            message: 'تم حذف الرسالة نهائياً'
        });
    } catch (error) {
        console.error('خطأ في حذف الرسالة:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في حذف الرسالة',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
        });
    }
});

// @route   POST /api/messages/send
// @desc    إرسال رسالة جديدة (مع Socket.IO)
// @access  Admin (للتجربة)
router.post('/send', protect, adminOnly, async (req, res) => {
    try {
        const { conversationId, content, type = 'text' } = req.body;

        // التحقق من وجود المحادثة
        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
            return res.status(404).json({
                success: false,
                message: 'المحادثة غير موجودة'
            });
        }

        // إنشاء الرسالة
        const message = await Message.create({
            chatType: 'conversation',
            conversation: conversationId,
            sender: req.user._id,
            content,
            type,
            isDeleted: false
        });

        // جلب الرسالة مع بيانات المرسل
        const populatedMessage = await Message.findById(message._id)
            .populate('sender', 'name email profileImage');

        // إرسال الرسالة عبر Socket.IO لكل المتصلين بهذه المحادثة
        if (global.io) {
            global.io.to(`conversation-${conversationId}`).emit('new-message', {
                message: populatedMessage
            });
        }

        res.json({
            success: true,
            message: 'تم إرسال الرسالة بنجاح',
            data: populatedMessage
        });
    } catch (error) {
        console.error('خطأ في إرسال الرسالة:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في إرسال الرسالة',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
        });
    }
});

// @route   GET /api/messages/stats/:conversationId
// @desc    إحصائيات رسائل محادثة
// @access  Admin
router.get('/stats/:conversationId', protect, adminOnly, async (req, res) => {
    try {
        const { conversationId } = req.params;

        const stats = {
            totalMessages: await Message.countDocuments({ chatType: 'conversation', conversation: conversationId }),
            deletedMessages: await Message.countDocuments({ chatType: 'conversation', conversation: conversationId, isDeleted: true }),
            activeMessages: await Message.countDocuments({ chatType: 'conversation', conversation: conversationId, isDeleted: false }),
            messagesByType: await Message.aggregate([
                { $match: { chatType: 'conversation', conversation: mongoose.Types.ObjectId(conversationId) } },
                { $group: { _id: '$type', count: { $sum: 1 } } }
            ])
        };

        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        console.error('خطأ في جلب الإحصائيات:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في جلب الإحصائيات',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
        });
    }
});

// @route   GET /api/messages/flagged/:messageId/context
// @desc    عرض سياق الرسالة المخالفة (5 رسائل قبل وبعد)
// @access  Private/Admin
router.get('/flagged/:messageId/context', protect, adminOnly, async (req, res) => {
    try {
        const message = await Message.findById(req.params.messageId);
        if (!message) return res.status(404).json({ success: false, message: 'الرسالة غير موجودة' });

        const conversationId = message.conversation;
        if (!conversationId) return res.json({ success: true, data: { messages: [message], conversationId: null } });

        const contextMessages = await Message.find({
            conversation: conversationId,
            createdAt: {
                $gte: new Date(message.createdAt.getTime() - 5 * 60 * 1000),
                $lte: new Date(message.createdAt.getTime() + 5 * 60 * 1000)
            }
        })
        .populate('sender', 'name email profileImage')
        .sort({ createdAt: 1 })
        .limit(20);

        res.json({
            success: true,
            data: {
                messages: contextMessages,
                conversationId: conversationId,
                flaggedMessageId: message._id
            }
        });
    } catch (error) {
        console.error('خطأ:', error);
        res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
    }
});

module.exports = router;
