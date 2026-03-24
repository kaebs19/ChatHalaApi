// HalaChat - Mobile API: Notifications Routes
// مسارات الإشعارات وتوكنات الأجهزة

const express = require('express');
const router = express.Router();
const User = require('../../models/User');
const Notification = require('../../models/Notification');
const { protect } = require('../../middleware/auth');

// ==========================================
// نظام الإشعارات
// ==========================================

// @route   GET /api/mobile/notifications
// @desc    الحصول على إشعارات المستخدم
// @access  Private
router.get('/notifications', protect, async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;

        // جلب الإشعارات الموجهة للمستخدم أو للجميع
        const query = {
            $or: [
                { targetUsers: req.user._id },
                { recipients: 'all' }
            ],
            isActive: true
        };

        const notifications = await Notification.find(query)
            .populate('sender', 'name profileImage isPremium verification.isVerified')
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);

        const total = await Notification.countDocuments(query);

        // حساب الإشعارات غير المقروءة
        const unreadCount = await Notification.countDocuments({
            ...query,
            'readBy.user': { $ne: req.user._id }
        });

        res.status(200).json({
            success: true,
            data: {
                notifications,
                total,
                unreadCount,
                currentPage: parseInt(page),
                totalPages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.error('خطأ في جلب الإشعارات:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
        });
    }
});

// @route   PUT /api/mobile/notifications/:id/read
// @desc    تحديد إشعار كمقروء
// @access  Private
router.put('/notifications/:id/read', protect, async (req, res) => {
    try {
        const notification = await Notification.findById(req.params.id);

        if (!notification) {
            return res.status(404).json({
                success: false,
                message: 'الإشعار غير موجود'
            });
        }

        // إضافة المستخدم لقائمة القراء
        if (!notification.readBy.includes(req.user._id)) {
            notification.readBy.push(req.user._id);
            await notification.save();
        }

        res.status(200).json({
            success: true,
            message: 'تم تحديد الإشعار كمقروء'
        });

    } catch (error) {
        console.error('خطأ في تحديث الإشعار:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
        });
    }
});

// @route   PUT /api/mobile/notifications/read-all
// @desc    تحديد جميع الإشعارات كمقروءة
// @access  Private
router.put('/notifications/read-all', protect, async (req, res) => {
    try {
        await Notification.updateMany(
            {
                $or: [
                    { recipients: req.user._id },
                    { recipientType: 'all' }
                ],
                readBy: { $ne: req.user._id }
            },
            {
                $addToSet: { readBy: req.user._id }
            }
        );

        res.status(200).json({
            success: true,
            message: 'تم تحديد جميع الإشعارات كمقروءة'
        });

    } catch (error) {
        console.error('خطأ في تحديث الإشعارات:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
        });
    }
});

// ==========================================
// نظام FCM Token (Firebase Cloud Messaging)
// ==========================================

// @route   POST /api/mobile/device/register-token
// @desc    تسجيل FCM Token للإشعارات
// @access  Private
router.post('/device/register-token', protect, async (req, res) => {
    try {
        const { fcmToken, deviceToken, platform, osVersion, appVersion } = req.body;

        if (!fcmToken && !deviceToken) {
            return res.status(400).json({
                success: false,
                message: 'FCM Token أو Device Token مطلوب'
            });
        }

        // تحديث بيانات المستخدم
        const updateData = {
            deviceInfo: {
                platform: platform || null,
                osVersion: osVersion || null,
                appVersion: appVersion || null
            }
        };

        // إضافة FCM Token (Firebase)
        if (fcmToken) {
            updateData.fcmToken = fcmToken;
        }

        // إضافة Device Token (APNs)
        if (deviceToken) {
            updateData.deviceToken = deviceToken;
        }

        await User.findByIdAndUpdate(req.user._id, updateData);

        console.log(`📱 تم تسجيل Token للمستخدم ${req.user.name}`);

        res.status(200).json({
            success: true,
            message: 'تم تسجيل Token بنجاح'
        });

    } catch (error) {
        console.error('خطأ في تسجيل Token:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
        });
    }
});

// @route   DELETE /api/mobile/device/unregister-token
// @desc    إلغاء تسجيل FCM Token (عند تسجيل الخروج)
// @access  Private
router.delete('/device/unregister-token', protect, async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.user._id, {
            $unset: { fcmToken: 1, deviceToken: 1 }
        });

        console.log(`📴 تم إلغاء تسجيل Token للمستخدم ${req.user.name}`);

        res.status(200).json({
            success: true,
            message: 'تم إلغاء تسجيل Token بنجاح'
        });

    } catch (error) {
        console.error('خطأ في إلغاء تسجيل Token:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
        });
    }
});

// @route   PUT /api/mobile/device/update-token
// @desc    تحديث FCM Token
// @access  Private
router.put('/device/update-token', protect, async (req, res) => {
    try {
        const { fcmToken, deviceToken } = req.body;

        if (!fcmToken && !deviceToken) {
            return res.status(400).json({
                success: false,
                message: 'FCM Token أو Device Token مطلوب'
            });
        }

        const updateData = {};
        if (fcmToken) updateData.fcmToken = fcmToken;
        if (deviceToken) updateData.deviceToken = deviceToken;

        await User.findByIdAndUpdate(req.user._id, updateData);

        res.status(200).json({
            success: true,
            message: 'تم تحديث Token بنجاح'
        });

    } catch (error) {
        console.error('خطأ في تحديث Token:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
        });
    }
});

module.exports = router;
