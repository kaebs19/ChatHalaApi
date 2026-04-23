// HalaChat - Mobile API: Notifications Routes
// مسارات الإشعارات وتوكنات الأجهزة

const express = require('express');
const router = express.Router();
const logger = require('../../utils/logger');
const User = require('../../models/User');
const Notification = require('../../models/Notification');
const { protect } = require('../../middleware/auth');
const { getFullUrl } = require('./helpers');

// ==========================================
// نظام الإشعارات
// ==========================================

// @route   GET /api/mobile/notifications
// @desc    الحصول على إشعارات المستخدم
// @access  Private
router.get('/notifications', protect, async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        const userId = req.user._id;

        // جلب الإشعارات الموجهة للمستخدم أو للجميع (مع استبعاد المخفية شخصياً)
        const query = {
            $or: [
                { targetUsers: userId },
                { recipients: 'all' }
            ],
            isActive: true,
            hiddenBy: { $ne: userId }
        };

        // 🔕 الأدمن لا يستقبل تنبيهات البلاغات والكلمات المحجوبة في التطبيق
        // (يتابعها من لوحة التحكم)
        if (req.user.role === 'admin') {
            query.type = { $nin: ['report', 'banned_word', 'new_report'] };
        }

        const notifications = await Notification.find(query)
            .populate('sender', 'name profileImage isPremium verification.isVerified')
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);

        const total = await Notification.countDocuments(query);

        // حساب الإشعارات غير المقروءة (readBy هو array of {user, readAt})
        const unreadCount = await Notification.countDocuments({
            ...query,
            'readBy.user': { $ne: userId }
        });

        // تحويل + إصلاح sender
        const formattedNotifications = notifications.map(n => {
            const nObj = n.toObject();

            // إصلاح sender: إذا sender هو نفس المستلم، استخدم data.senderId
            const senderId = nObj.sender?._id?.toString();
            const myId = userId.toString();

            if (nObj.data && nObj.data.senderId && senderId === myId) {
                // sender خطأ (هو المستلم نفسه) → نستبدله بالمرسل الفعلي
                nObj.sender = {
                    _id: nObj.data.senderId,
                    name: nObj.data.senderName || ''
                };
            } else if (!nObj.sender && nObj.data && nObj.data.senderId) {
                // ما فيه sender أصلاً → ننشئ من data
                nObj.sender = {
                    _id: nObj.data.senderId,
                    name: nObj.data.senderName || ''
                };
            } else if (nObj.sender && nObj.sender.profileImage) {
                // sender صحيح → حوّل الصورة لـ URL كامل
                nObj.sender.profileImage = getFullUrl(nObj.sender.profileImage);
            }

            return nObj;
        });

        res.status(200).json({
            success: true,
            data: {
                notifications: formattedNotifications,
                total,
                unreadCount,
                currentPage: parseInt(page),
                totalPages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        logger.error('خطأ في جلب الإشعارات:', error);
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
        const userId = req.user._id;
        const notification = await Notification.findById(req.params.id);

        if (!notification) {
            return res.status(404).json({
                success: false,
                message: 'الإشعار غير موجود'
            });
        }

        // إضافة المستخدم لقائمة القراء (readBy هو [{user, readAt}])
        const alreadyRead = notification.readBy.some(
            r => r.user && r.user.toString() === userId.toString()
        );

        if (!alreadyRead) {
            notification.readBy.push({ user: userId, readAt: new Date() });
            await notification.save();
        }

        res.status(200).json({
            success: true,
            message: 'تم تحديد الإشعار كمقروء'
        });

    } catch (error) {
        logger.error('خطأ في تحديث الإشعار:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر'
        });
    }
});

// @route   PUT /api/mobile/notifications/read-all
// @desc    تحديد جميع الإشعارات كمقروءة
// @access  Private
router.put('/notifications/read-all', protect, async (req, res) => {
    try {
        const userId = req.user._id;

        // جلب الإشعارات غير المقروءة
        const unreadNotifications = await Notification.find({
            $or: [
                { targetUsers: userId },
                { recipients: 'all' }
            ],
            isActive: true,
            'readBy.user': { $ne: userId }
        });

        // إضافة المستخدم لكل إشعار غير مقروء
        for (const notif of unreadNotifications) {
            notif.readBy.push({ user: userId, readAt: new Date() });
            await notif.save();
        }

        res.status(200).json({
            success: true,
            message: `تم تحديد ${unreadNotifications.length} إشعار كمقروء`
        });

    } catch (error) {
        logger.error('خطأ في تحديث الإشعارات:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر'
        });
    }
});

// @route   DELETE /api/mobile/notifications/clear-all
// @desc    إخفاء جميع الإشعارات عن المستخدم (soft delete — لا نحذف من DB)
// @access  Private
router.delete('/notifications/clear-all', protect, async (req, res) => {
    try {
        const userId = req.user._id;

        // نضيف المستخدم إلى hiddenBy لكل إشعاراته (ليختفي عنه فقط دون التأثير على الآخرين)
        const result = await Notification.updateMany(
            {
                $or: [
                    { targetUsers: userId },
                    { recipients: 'all' }
                ],
                isActive: true,
                hiddenBy: { $ne: userId }
            },
            { $addToSet: { hiddenBy: userId } }
        );

        res.status(200).json({
            success: true,
            message: `تم حذف ${result.modifiedCount || 0} إشعار`,
            data: { count: result.modifiedCount || 0 }
        });
    } catch (error) {
        logger.error('خطأ في حذف جميع الإشعارات:', error);
        res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
    }
});

// ==========================================
// نظام FCM Token (Firebase Cloud Messaging)
// ==========================================

// @route   POST /api/mobile/device/register-token
router.post('/device/register-token', protect, async (req, res) => {
    try {
        const { fcmToken, deviceToken, platform, osVersion, appVersion } = req.body;

        if (!fcmToken && !deviceToken) {
            return res.status(400).json({ success: false, message: 'FCM Token أو Device Token مطلوب' });
        }

        const updateData = {
            deviceInfo: { platform: platform || null, osVersion: osVersion || null, appVersion: appVersion || null }
        };
        if (fcmToken) updateData.fcmToken = fcmToken;
        if (deviceToken) updateData.deviceToken = deviceToken;

        await User.findByIdAndUpdate(req.user._id, updateData);
        logger.info(`تم تسجيل Token للمستخدم ${req.user.name}`);

        res.status(200).json({ success: true, message: 'تم تسجيل Token بنجاح' });
    } catch (error) {
        logger.error('خطأ في تسجيل Token:', error);
        res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
    }
});

// @route   DELETE /api/mobile/device/unregister-token
router.delete('/device/unregister-token', protect, async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.user._id, { $unset: { fcmToken: 1, deviceToken: 1 } });
        logger.info(`تم إلغاء تسجيل Token للمستخدم ${req.user.name}`);
        res.status(200).json({ success: true, message: 'تم إلغاء تسجيل Token بنجاح' });
    } catch (error) {
        logger.error('خطأ في إلغاء تسجيل Token:', error);
        res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
    }
});

// @route   PUT /api/mobile/device/update-token
router.put('/device/update-token', protect, async (req, res) => {
    try {
        const { fcmToken, deviceToken } = req.body;
        if (!fcmToken && !deviceToken) {
            return res.status(400).json({ success: false, message: 'FCM Token أو Device Token مطلوب' });
        }
        const updateData = {};
        if (fcmToken) updateData.fcmToken = fcmToken;
        if (deviceToken) updateData.deviceToken = deviceToken;
        await User.findByIdAndUpdate(req.user._id, updateData);
        res.status(200).json({ success: true, message: 'تم تحديث Token بنجاح' });
    } catch (error) {
        logger.error('خطأ في تحديث Token:', error);
        res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
    }
});

module.exports = router;
