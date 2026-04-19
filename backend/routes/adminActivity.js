// HalaChat - Admin Activity Routes
// عرض سجل نشاطات الأدمن (audit log)

const express = require('express');
const router = express.Router();
const ActivityLog = require('../models/ActivityLog');
const { protect, adminOnly } = require('../middleware/auth');

// كل actions الإدارية (بادئة admin_)
const ADMIN_ACTIONS = [
    'admin_user_create', 'admin_user_update', 'admin_user_delete',
    'admin_user_ban', 'admin_user_unban', 'admin_user_activate', 'admin_user_deactivate',
    'admin_user_suspend', 'admin_user_unsuspend', 'admin_user_warn',
    'admin_user_ban_name', 'admin_user_ban_permanent', 'admin_user_reset_avatar',
    'admin_user_adjust_violations', 'admin_user_clear_violations', 'admin_user_notify',
    'admin_user_restrict', 'admin_user_unrestrict',
    'admin_device_ban', 'admin_device_unban',
    'admin_ip_ban', 'admin_ip_unban',
    'admin_appeal_approve', 'admin_appeal_reject', 'admin_appeal_reply',
    'admin_report_resolve', 'admin_report_reject'
];

// @route   GET /api/admin-activity
// @desc    قائمة نشاطات الأدمن مع فلاتر
// @query   ?admin=userId&action=...&severity=...&limit=100&skip=0&from=ISO&to=ISO
router.get('/', protect, adminOnly, async (req, res) => {
    try {
        const { admin, action, severity, from, to } = req.query;
        const limit = Math.min(Number(req.query.limit) || 100, 500);
        const skip = Number(req.query.skip) || 0;

        const filter = { action: { $in: ADMIN_ACTIONS } };
        if (admin) filter.user = admin;
        if (action) filter.action = action;
        if (severity) filter.severity = severity;
        if (from || to) {
            filter.createdAt = {};
            if (from) filter.createdAt.$gte = new Date(from);
            if (to) filter.createdAt.$lte = new Date(to);
        }

        const [logs, total] = await Promise.all([
            ActivityLog.find(filter)
                .populate('user', 'name email profileImage role')
                .sort('-createdAt')
                .skip(skip)
                .limit(limit)
                .lean(),
            ActivityLog.countDocuments(filter)
        ]);

        // إحصائيات سريعة (آخر 24 ساعة)
        const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const stats24h = await ActivityLog.aggregate([
            { $match: { action: { $in: ADMIN_ACTIONS }, createdAt: { $gte: since24h } } },
            { $group: { _id: '$action', count: { $sum: 1 } } }
        ]);

        res.json({
            success: true,
            data: { logs, total, skip, limit, stats24h }
        });
    } catch (error) {
        console.error('خطأ في جلب نشاطات الأدمن:', error);
        res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
    }
});

// @route   GET /api/admin-activity/actions
// @desc    قائمة الـ actions المتاحة للفلتر
router.get('/actions', protect, adminOnly, (req, res) => {
    res.json({ success: true, data: ADMIN_ACTIONS });
});

module.exports = router;
