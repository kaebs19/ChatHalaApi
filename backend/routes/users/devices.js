// HalaChat - Users Devices Routes (Admin)
// حظر/فك حظر أجهزة المستخدمين

const express = require('express');
const router = express.Router();
const User = require('../../models/User');
const BannedDevice = require('../../models/BannedDevice');
const { protect, adminOnly } = require('../../middleware/auth');
const { invalidateUsers } = require('../../utils/cache');
const { buildFingerprint } = require('../../utils/deviceBan');

// @route   GET /api/users/banned-devices/list
router.get('/banned-devices/list', protect, adminOnly, async (req, res) => {
    try {
        const devices = await BannedDevice.find()
            .populate('bannedBy', 'name')
            .sort('-bannedAt')
            .limit(200)
            .lean();

        // إضافة عدد الحسابات المرتبطة لكل جهاز
        // ملاحظة: نعتمد على tokens الفريدة فقط. البصمة (fingerprint) تستند
        // لمعلومات عامة (iOS 17 + app v1.5) → غير موثوقة للمطابقة الدقيقة
        for (const d of devices) {
            const filters = [];
            if (d.deviceToken) filters.push({ deviceToken: d.deviceToken });
            if (d.fcmToken) filters.push({ fcmToken: d.fcmToken });

            d.linkedAccountsCount = filters.length > 0
                ? await User.countDocuments({ $or: filters })
                : 0;
        }

        res.json({ success: true, count: devices.length, data: devices });
    } catch (error) {
        console.error('خطأ في قائمة الأجهزة:', error);
        res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
    }
});

// @route   GET /api/users/banned-devices/:id/linked-accounts
// @desc    جلب كل الحسابات المرتبطة بنفس بصمة الجهاز
router.get('/banned-devices/:id/linked-accounts', protect, adminOnly, async (req, res) => {
    try {
        const device = await BannedDevice.findById(req.params.id).lean();
        if (!device) return res.status(404).json({ success: false, message: 'الجهاز غير موجود' });

        // نعتمد فقط على tokens الفريدة (deviceToken/fcmToken)
        const filters = [];
        if (device.deviceToken) filters.push({ deviceToken: device.deviceToken });
        if (device.fcmToken) filters.push({ fcmToken: device.fcmToken });

        if (filters.length === 0) {
            return res.json({ success: true, count: 0, data: { device, accounts: [] } });
        }

        const accounts = await User.find({ $or: filters })
            .select('name email profileImage isActive suspendedUntil suspendReason deviceBanned violationCount createdAt lastLogin role uniqueTag')
            .sort('-createdAt')
            .lean();

        res.json({
            success: true,
            count: accounts.length,
            data: { device, accounts }
        });
    } catch (error) {
        console.error('خطأ في الحسابات المرتبطة:', error);
        res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
    }
});

// @route   GET /api/users/:id/linked-accounts
// @desc    جلب الحسابات التي تشارك نفس بصمة جهاز مستخدم محدد
router.get('/:id/linked-accounts', protect, adminOnly, async (req, res) => {
    try {
        const user = await User.findById(req.params.id)
            .select('deviceFingerprint deviceToken fcmToken deviceInfo name')
            .lean();
        if (!user) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });

        // نعتمد فقط على tokens الفريدة
        const filters = [];
        if (user.deviceToken) filters.push({ deviceToken: user.deviceToken });
        if (user.fcmToken) filters.push({ fcmToken: user.fcmToken });

        if (filters.length === 0) {
            return res.json({
                success: true,
                count: 0,
                data: {
                    user: { name: user.name, deviceInfo: user.deviceInfo, fingerprint: user.deviceFingerprint },
                    accounts: []
                }
            });
        }

        const accounts = await User.find({
            $or: filters,
            _id: { $ne: user._id }
        })
            .select('name email profileImage isActive suspendedUntil suspendReason deviceBanned violationCount createdAt lastLogin role uniqueTag')
            .sort('-createdAt')
            .lean();

        res.json({
            success: true,
            count: accounts.length,
            data: {
                user: { name: user.name, deviceInfo: user.deviceInfo, fingerprint: user.deviceFingerprint },
                accounts
            }
        });
    } catch (error) {
        console.error('خطأ في الحسابات المرتبطة:', error);
        res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
    }
});

// @route   PUT /api/users/:id/ban-device
router.put('/:id/ban-device', protect, adminOnly, async (req, res) => {
    try {
        const { reason = 'حظر الجهاز نهائياً' } = req.body;
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
        if (user.role === 'admin') {
            return res.status(403).json({ success: false, message: 'لا يمكن حظر جهاز مدير' });
        }

        if (!user.deviceToken && !user.fcmToken && (!user.deviceInfo || !user.deviceInfo.platform)) {
            return res.status(400).json({ success: false, message: 'لا توجد معلومات جهاز لهذا المستخدم' });
        }

        const fingerprint = user.deviceInfo
            ? buildFingerprint(user.deviceInfo.toObject ? user.deviceInfo.toObject() : user.deviceInfo, null)
            : null;

        const existing = await BannedDevice.findOne({
            $or: [
                user.deviceToken ? { deviceToken: user.deviceToken } : null,
                user.fcmToken ? { fcmToken: user.fcmToken } : null,
                fingerprint ? { deviceFingerprint: fingerprint } : null
            ].filter(Boolean)
        });

        if (!existing) {
            await BannedDevice.create({
                deviceToken: user.deviceToken || null,
                fcmToken: user.fcmToken || null,
                deviceFingerprint: fingerprint,
                deviceInfo: user.deviceInfo || {},
                originalUserId: user._id,
                originalUserName: user.name,
                reason,
                bannedBy: req.user._id
            });
        }

        user.deviceBanned = true;
        user.deviceBannedAt = new Date();
        user.isActive = false;
        user.suspendedUntil = new Date(Date.now() + 36500 * 24 * 60 * 60 * 1000);
        user.suspendReason = reason;
        user.warnings.push({ reason, action: 'device_ban', adminId: req.user._id });
        await user.save();

        if (global.connectedUsers && global.connectedUsers.has(user._id.toString())) {
            const info = global.connectedUsers.get(user._id.toString());
            const sock = global.io?.sockets?.sockets?.get(info.socketId);
            if (sock) sock.disconnect(true);
        }

        invalidateUsers();
        res.json({
            success: true,
            message: `تم حظر جهاز ${user.name} نهائياً`,
            data: { deviceBanned: true }
        });
    } catch (error) {
        console.error('خطأ في حظر الجهاز:', error);
        res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
    }
});

// @route   PUT /api/users/:id/unban-device
router.put('/:id/unban-device', protect, adminOnly, async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });

        const fingerprint = user.deviceInfo
            ? buildFingerprint(user.deviceInfo.toObject ? user.deviceInfo.toObject() : user.deviceInfo, null)
            : null;

        await BannedDevice.deleteMany({
            $or: [
                user.deviceToken ? { deviceToken: user.deviceToken } : null,
                user.fcmToken ? { fcmToken: user.fcmToken } : null,
                fingerprint ? { deviceFingerprint: fingerprint } : null,
                { originalUserId: user._id }
            ].filter(Boolean)
        });

        user.deviceBanned = false;
        user.deviceBannedAt = null;
        await user.save();

        invalidateUsers();
        res.json({ success: true, message: 'تم فك حظر الجهاز' });
    } catch (error) {
        console.error('خطأ في فك حظر الجهاز:', error);
        res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
    }
});

module.exports = router;
