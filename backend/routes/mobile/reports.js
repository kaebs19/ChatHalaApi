// HalaChat - Mobile API: Reports Routes
// مسارات الإبلاغات

const express = require('express');
const router = express.Router();
const logger = require('../../utils/logger');
const User = require('../../models/User');
const Report = require('../../models/Report');
const Notification = require('../../models/Notification');
const { protect } = require('../../middleware/auth');
const notificationService = require('../../services/notificationService');

// ==========================================
// نظام الإبلاغات
// ==========================================

// @route   POST /api/mobile/reports
// @desc    إنشاء بلاغ جديد (شكل مبسط للتطبيق)
// @access  Private
router.post('/reports', protect, async (req, res) => {
    try {
        const {
            reportedUser,   // userId للمستخدم المبلغ عنه
            reason,         // spam | inappropriate | harassment | fake_profile | other
            description     // وصف إضافي (اختياري)
        } = req.body;

        // التحقق من البيانات المطلوبة
        if (!reportedUser || !reason) {
            return res.status(400).json({
                success: false,
                message: 'معرف المستخدم وسبب البلاغ مطلوبان'
            });
        }

        // التحقق من صحة السبب
        const validReasons = ['spam', 'inappropriate', 'harassment', 'fake_profile', 'other'];
        if (!validReasons.includes(reason)) {
            return res.status(400).json({
                success: false,
                message: 'سبب البلاغ غير صالح'
            });
        }

        // التحقق من وجود المستخدم المبلغ عنه
        const targetUser = await User.findById(reportedUser);
        if (!targetUser) {
            return res.status(404).json({
                success: false,
                message: 'المستخدم المبلغ عنه غير موجود'
            });
        }

        // لا يمكن الإبلاغ عن نفسك
        if (reportedUser === req.user._id.toString()) {
            return res.status(400).json({
                success: false,
                message: 'لا يمكن الإبلاغ عن نفسك'
            });
        }

        // تحديد الأولوية بناء على السبب
        const highPriorityReasons = ['harassment', 'inappropriate'];
        const priority = highPriorityReasons.includes(reason) ? 'high' : 'medium';

        const report = await Report.create({
            type: 'user',
            reportedBy: req.user._id,
            reportedUser: reportedUser,
            category: reason,
            description: description || '',
            status: 'pending',
            priority
        });

        // إرسال إشعار للأدمن عند إنشاء بلاغ جديد
        try {
            // جلب جميع الأدمن
            const admins = await User.find({ role: 'admin', isActive: true });

            // ترجمة السبب للعربية
            const reasonTranslations = {
                'spam': 'سبام',
                'inappropriate': 'محتوى غير لائق',
                'harassment': 'تحرش',
                'fake_profile': 'حساب مزيف',
                'other': 'أخرى'
            };

            const reasonArabic = reasonTranslations[reason] || reason;

            // إنشاء إشعار في قاعدة البيانات
            await Notification.create({
                title: 'بلاغ جديد',
                body: `${req.user.name} أبلغ عن ${targetUser.name} - السبب: ${reasonArabic}`,
                type: 'report',
                recipients: 'specific',
                targetUsers: admins.map(admin => admin._id),
                sender: req.user._id,
                status: 'sent',
                priority: priority === 'high' ? 'high' : 'normal',
                sentAt: new Date(),
                sentCount: admins.length,
                data: {
                    reportId: report._id.toString(),
                    reportedUserId: reportedUser,
                    reportedUserName: targetUser.name,
                    reason: reason,
                    type: 'new_report'
                }
            });

            // إرسال Push Notifications للأدمن الأوفلاين
            for (const admin of admins) {
                // Socket.IO للأدمن المتصلين
                if (global.io) {
                    global.io.to(`user:${admin._id}`).emit('notification', {
                        type: 'report',
                        title: 'بلاغ جديد',
                        body: `${req.user.name} أبلغ عن ${targetUser.name}`,
                        data: { reportId: report._id.toString() }
                    });
                }

                // Push للأدمن الأوفلاين — معطّل (الأدمن يتابع من لوحة التحكم)
                if (false && !admin.isOnline && admin.deviceToken) {
                    await notificationService.sendPush(
                        admin.deviceToken,
                        'بلاغ جديد ⚠️',
                        `${req.user.name} أبلغ عن ${targetUser.name} - السبب: ${reasonArabic}`,
                        {
                            type: 'new_report',
                            reportId: report._id.toString()
                        }
                    );
                }
            }
        } catch (notifError) {
            logger.error('خطأ في إرسال إشعار البلاغ:', notifError);
            // نكمل حتى لو فشل الإشعار
        }

        res.status(201).json({
            success: true,
            message: 'تم إرسال البلاغ'
        });

    } catch (error) {
        logger.error('خطأ في إنشاء البلاغ:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
        });
    }
});

// @route   GET /api/mobile/reports/my
// @desc    الحصول على بلاغاتي
// @access  Private
router.get('/reports/my', protect, async (req, res) => {
    try {
        const reports = await Report.find({ reportedBy: req.user._id })
            .populate('reportedUser', 'name email')
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            data: { reports }
        });

    } catch (error) {
        logger.error('خطأ في جلب البلاغات:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
        });
    }
});

module.exports = router;
