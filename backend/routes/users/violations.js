// HalaChat - Users Violations & Activity Routes (Admin)

const express = require('express');
const router = express.Router();
const User = require('../../models/User');
const Message = require('../../models/Message');
const { protect, adminOnly } = require('../../middleware/auth');
const modConfig = require('../../config/moderation');

// @route   GET /api/users/:id/activity
router.get('/:id/activity', protect, adminOnly, async (req, res) => {
    try {
        const Conversation = require('../../models/Conversation');
        const user = await User.findById(req.params.id).select('-password');
        if (!user) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });

        const userConversations = await Conversation.find({
            participants: req.params.id
        }).populate('lastMessage');

        const userMessages = await Message.find({
            sender: req.params.id,
            isDeleted: false
        });

        const stats = {
            totalConversations: userConversations.length,
            activeConversations: userConversations.filter(c => c.isActive).length,
            totalMessagesSent: userMessages.length,
            lastActivity: user.lastLogin || user.updatedAt
        };

        res.status(200).json({
            success: true,
            data: {
                user,
                stats,
                conversations: userConversations,
                recentMessages: userMessages.slice(0, 10)
            }
        });
    } catch (error) {
        console.error('خطأ في جلب نشاط المستخدم:', error);
        res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
    }
});

// @route   GET /api/users/:id/violations
router.get('/:id/violations', protect, adminOnly, async (req, res) => {
    try {
        const user = await User.findById(req.params.id)
            .select('name email violationCount warnings nameBanned bannedNamesHistory suspendedUntil suspendReason isActive deviceBanned deviceBannedAt')
            .populate('warnings.adminId', 'name')
            .populate('bannedNamesHistory.adminId', 'name');

        if (!user) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });

        const flaggedCount = await Message.countDocuments({ sender: req.params.id, hasBannedWords: true });
        const flaggedMessages = await Message.find({ sender: req.params.id, hasBannedWords: true })
            .select('content type mediaUrl createdAt conversationId isDeleted')
            .sort('-createdAt')
            .limit(modConfig.FLAGGED_MESSAGES_LIMIT)
            .lean();

        res.json({
            success: true,
            data: {
                user: {
                    name: user.name,
                    email: user.email,
                    isActive: user.isActive,
                    deviceBanned: user.deviceBanned || false,
                    deviceBannedAt: user.deviceBannedAt
                },
                violationCount: user.violationCount || 0,
                nameBanned: user.nameBanned || false,
                bannedNamesHistory: user.bannedNamesHistory || [],
                suspendedUntil: user.suspendedUntil,
                suspendReason: user.suspendReason,
                warnings: user.warnings || [],
                flaggedMessagesCount: flaggedCount,
                flaggedMessages
            }
        });
    } catch (error) {
        console.error('خطأ:', error);
        res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
    }
});

module.exports = router;
