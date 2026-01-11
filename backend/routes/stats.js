// HalaChat Dashboard - Stats Routes
// المسارات الخاصة بالإحصائيات

const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { protect, adminOnly } = require('../middleware/auth');

// @route   GET /api/stats/dashboard
// @desc    الحصول على إحصائيات Dashboard
// @access  Private/Admin
router.get('/dashboard', protect, adminOnly, async (req, res) => {
    try {
        // إجمالي المستخدمين
        const totalUsers = await User.countDocuments();

        // المستخدمين النشطين
        const activeUsers = await User.countDocuments({ isActive: true });

        // المستخدمين الجدد (آخر 7 أيام)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const newUsers = await User.countDocuments({
            createdAt: { $gte: sevenDaysAgo }
        });

        // المستخدمين الذين سجلوا دخول مؤخراً (آخر 24 ساعة)
        const oneDayAgo = new Date();
        oneDayAgo.setDate(oneDayAgo.getDate() - 1);
        const recentLogins = await User.countDocuments({
            lastLogin: { $gte: oneDayAgo }
        });

        // أحدث المستخدمين (آخر 5)
        const latestUsers = await User.find({})
            .select('name email createdAt')
            .sort({ createdAt: -1 })
            .limit(5);

        res.status(200).json({
            success: true,
            data: {
                stats: {
                    totalUsers,
                    activeUsers,
                    newUsers,
                    recentLogins
                },
                latestUsers
            }
        });

    } catch (error) {
        console.error('خطأ في جلب الإحصائيات:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر'
        });
    }
});

module.exports = router;
