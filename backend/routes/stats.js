// HalaChat Dashboard - Stats Routes
// المسارات الخاصة بالإحصائيات

const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { protect, adminOnly } = require('../middleware/auth');
const { get, set, CACHE_KEYS, CACHE_TTL } = require('../utils/cache');

// @route   GET /api/stats/dashboard
// @desc    الحصول على إحصائيات Dashboard
// @access  Private/Admin
router.get('/dashboard', protect, adminOnly, async (req, res) => {
    try {
        // التحقق من الـ Cache أولاً
        const cachedData = get(CACHE_KEYS.DASHBOARD_STATS);
        if (cachedData) {
            console.log('📦 Dashboard Stats من الـ Cache');
            return res.status(200).json(cachedData);
        }

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
            .select('name email createdAt profileImage')
            .sort({ createdAt: -1 })
            .limit(5);

        const responseData = {
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
        };

        // تخزين في الـ Cache
        set(CACHE_KEYS.DASHBOARD_STATS, responseData, CACHE_TTL.DASHBOARD_STATS);
        console.log('💾 Dashboard Stats تم تخزينها في الـ Cache');

        res.status(200).json(responseData);

    } catch (error) {
        console.error('خطأ في جلب الإحصائيات:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر'
        });
    }
});

module.exports = router;
