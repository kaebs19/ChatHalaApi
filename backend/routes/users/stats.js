// HalaChat - Users Stats Routes (Admin)
// إحصائيات + قوائم Premium + المواقع
// ملاحظة: static routes قبل /:id لتجنب تعارض

const express = require('express');
const router = express.Router();
const User = require('../../models/User');
const { protect, adminOnly } = require('../../middleware/auth');

// @route   GET /api/users/premium
router.get('/premium', protect, adminOnly, async (req, res) => {
    try {
        const { page = 1, limit = 20, plan, expired } = req.query;
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);

        const filter = { isPremium: true };
        if (plan && ['weekly', 'monthly', 'quarterly'].includes(plan)) filter.premiumPlan = plan;
        if (expired === 'true') filter.premiumExpiresAt = { $lt: new Date() };
        else if (expired === 'false') filter.premiumExpiresAt = { $gte: new Date() };

        const users = await User.find(filter)
            .select('name email profileImage isPremium premiumPlan premiumExpiresAt verification.isVerified createdAt lastLogin')
            .sort({ premiumExpiresAt: -1 })
            .limit(limitNum)
            .skip((pageNum - 1) * limitNum);

        const total = await User.countDocuments(filter);
        const stats = {
            total: await User.countDocuments({ isPremium: true }),
            active: await User.countDocuments({ isPremium: true, premiumExpiresAt: { $gte: new Date() } }),
            expired: await User.countDocuments({ isPremium: true, premiumExpiresAt: { $lt: new Date() } }),
            weekly: await User.countDocuments({ isPremium: true, premiumPlan: 'weekly' }),
            monthly: await User.countDocuments({ isPremium: true, premiumPlan: 'monthly' }),
            quarterly: await User.countDocuments({ isPremium: true, premiumPlan: 'quarterly' })
        };

        res.json({
            success: true,
            data: { users, stats, page: pageNum, totalPages: Math.ceil(total / limitNum), total }
        });
    } catch (error) {
        console.error('خطأ في جلب المستخدمين المميزين:', error);
        res.status(500).json({ success: false, message: 'فشل في جلب المستخدمين المميزين' });
    }
});

// @route   GET /api/users/locations
router.get('/locations', protect, adminOnly, async (req, res) => {
    try {
        const users = await User.find({
            'location.coordinates': { $ne: [0, 0] },
            isActive: true
        }).select('name email profileImage gender isActive isOnline lastLogin location createdAt');
        res.status(200).json({ success: true, count: users.length, data: { users } });
    } catch (error) {
        console.error('خطأ في جلب مواقع المستخدمين:', error);
        res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
    }
});

// @route   GET /api/users/stats/overview
router.get('/stats/overview', protect, adminOnly, async (req, res) => {
    try {
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        const [
            total, active, newToday, new7Days, new30Days,
            suspended, permanentBanned, deviceBanned, violators, onlineNow,
            premiumCount, verifiedCount
        ] = await Promise.all([
            User.countDocuments({}),
            User.countDocuments({ isActive: true, deviceBanned: { $ne: true } }),
            User.countDocuments({ createdAt: { $gte: startOfDay } }),
            User.countDocuments({ createdAt: { $gte: last7Days } }),
            User.countDocuments({ createdAt: { $gte: last30Days } }),
            User.countDocuments({
                isActive: false,
                suspendedUntil: { $gte: now, $lte: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000) }
            }),
            User.countDocuments({ suspendedUntil: { $gt: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000) } }),
            User.countDocuments({ deviceBanned: true }),
            User.countDocuments({ violationCount: { $gt: 0 } }),
            User.countDocuments({ isOnline: true }),
            User.countDocuments({ isPremium: true }),
            User.countDocuments({ 'verification.isVerified': true })
        ]);

        res.json({
            success: true,
            data: {
                total, active,
                newUsers: { today: newToday, last7Days: new7Days, last30Days: new30Days },
                moderation: { suspended, permanentBanned, deviceBanned, violators },
                engagement: { onlineNow, premium: premiumCount, verified: verifiedCount }
            }
        });
    } catch (error) {
        console.error('خطأ في إحصائيات المستخدمين:', error);
        res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
    }
});

module.exports = router;
