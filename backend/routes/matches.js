// HalaChat - Matches Routes
// مطابقات المستخدم (مستمدة من Swipes المتبادلة)

const express = require('express');
const router = express.Router();
const Swipe = require('../models/Swipe');
const Conversation = require('../models/Conversation');
const { protect } = require('../middleware/auth');

// @route   GET /api/matches
// @desc    قائمة مطابقاتي (إعجابات متبادلة)
// @access  Private
router.get('/', protect, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 20, 50);
        const skip = (page - 1) * limit;

        // المطابقة = محادثة مقبولة + تأكيد swipe متبادل
        const conversations = await Conversation.find({
            type: 'private',
            participants: req.user._id,
            status: 'accepted',
            isActive: true,
            hiddenBy: { $ne: req.user._id }
        })
            .populate('participants', 'name profileImage birthDate gender country isPremium isOnline verification.isVerified')
            .sort('-updatedAt')
            .skip(skip)
            .limit(limit)
            .lean();

        const total = await Conversation.countDocuments({
            type: 'private',
            participants: req.user._id,
            status: 'accepted',
            isActive: true,
            hiddenBy: { $ne: req.user._id }
        });

        const matches = conversations.map(c => {
            const otherUser = c.participants.find(p => p._id.toString() !== req.user._id.toString());
            return {
                _id: c._id,
                matchId: c._id,
                conversationId: c._id,
                user: otherUser,
                createdAt: c.createdAt,
                updatedAt: c.updatedAt
            };
        });

        res.json({
            success: true,
            data: {
                matches,
                page,
                totalPages: Math.ceil(total / limit),
                total
            }
        });
    } catch (error) {
        console.error('خطأ في المطابقات:', error);
        res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
    }
});

// @route   DELETE /api/matches/:id
// @desc    إلغاء مطابقة
// @access  Private
router.delete('/:id', protect, async (req, res) => {
    try {
        const conversation = await Conversation.findById(req.params.id);
        if (!conversation) {
            return res.status(404).json({ success: false, message: 'المطابقة غير موجودة' });
        }

        if (!conversation.participants.some(p => p.toString() === req.user._id.toString())) {
            return res.status(403).json({ success: false, message: 'غير مصرح' });
        }

        const otherId = conversation.participants.find(p => p.toString() !== req.user._id.toString());

        // حذف الـ swipes بينهما
        await Swipe.deleteMany({
            $or: [
                { swiper: req.user._id, swiped: otherId },
                { swiper: otherId, swiped: req.user._id }
            ]
        });

        // إخفاء المحادثة من الطرفين
        conversation.status = 'rejected';
        conversation.isActive = false;
        await conversation.save();

        res.json({ success: true, message: 'تم إلغاء المطابقة' });
    } catch (error) {
        console.error('خطأ في إلغاء المطابقة:', error);
        res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
    }
});

module.exports = router;
