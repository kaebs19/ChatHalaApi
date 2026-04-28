// HalaChat - Users Devices Routes (Admin)
// حظر/فك حظر أجهزة المستخدمين

const express = require('express');
const router = express.Router();
const User = require('../../models/User');
const BannedDevice = require('../../models/BannedDevice');
const BannedIP = require('../../models/BannedIP');
const { protect, adminOnly } = require('../../middleware/auth');
const { invalidateUsers } = require('../../utils/cache');
const { buildFingerprint } = require('../../utils/deviceBan');
const { logAdminAction } = require('../../utils/logAdminAction');

// @route   GET /api/users/banned-devices/list
router.get('/banned-devices/list', protect, adminOnly, async (req, res) => {
    try {
        const devices = await BannedDevice.find()
            .populate('bannedBy', 'name')
            .sort('-bannedAt')
            .limit(200)
            .lean();

        // أولوية المطابقة: persistentDeviceId (الأدق من iOS Keychain)
        // ثم tokens الفريدة (deviceToken/fcmToken)
        for (const d of devices) {
            // fallback: جلب persistentDeviceId من المستخدم لو السجل قديم ما يحفظه
            let pid = d.persistentDeviceId || null;
            if (!pid && d.originalUserId) {
                const originalUser = await User.findById(d.originalUserId).select('persistentDeviceId').lean();
                pid = originalUser?.persistentDeviceId || null;
            }

            const filters = [];
            if (pid) filters.push({ persistentDeviceId: pid });
            if (d.deviceToken) filters.push({ deviceToken: d.deviceToken });
            if (d.fcmToken) filters.push({ fcmToken: d.fcmToken });
            if (d.deviceFingerprint) filters.push({ deviceFingerprint: d.deviceFingerprint });

            if (filters.length > 0) {
                d.linkedAccountsCount = await User.countDocuments({ $or: filters });
                // حسابات تتخطّى الحظر: نشطة (isActive=true) ولم تُحظر بعد
                d.activeLinkedCount = await User.countDocuments({
                    $or: filters,
                    isActive: true,
                    deviceBanned: { $ne: true },
                    role: { $ne: 'admin' }
                });
            } else {
                d.linkedAccountsCount = 0;
                d.activeLinkedCount = 0;
            }
            d.persistentDeviceId = pid;
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

        // أولوية: persistentDeviceId من السجل نفسه، ثم من المستخدم الأصلي (للسجلات القديمة)
        let pid = device.persistentDeviceId || null;
        if (!pid && device.originalUserId) {
            const originalUser = await User.findById(device.originalUserId).select('persistentDeviceId').lean();
            pid = originalUser?.persistentDeviceId || null;
        }

        const filters = [];
        if (pid) filters.push({ persistentDeviceId: pid });
        if (device.deviceToken) filters.push({ deviceToken: device.deviceToken });
        if (device.fcmToken) filters.push({ fcmToken: device.fcmToken });

        if (filters.length === 0) {
            return res.json({ success: true, count: 0, data: { device, accounts: [] } });
        }

        const accounts = await User.find({ $or: filters })
            .select('name email profileImage isActive suspendedUntil suspendReason deviceBanned violationCount createdAt lastLogin role uniqueTag persistentDeviceId')
            .sort('-createdAt')
            .lean();

        res.json({
            success: true,
            count: accounts.length,
            data: {
                device: { ...device, persistentDeviceId: pid },
                accounts
            }
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
            .select('deviceFingerprint persistentDeviceId deviceToken fcmToken deviceInfo name')
            .lean();
        if (!user) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });

        // أولوية: persistentDeviceId (الأدق)
        const filters = [];
        if (user.persistentDeviceId) filters.push({ persistentDeviceId: user.persistentDeviceId });
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

// @route   GET /api/users/by-ip/:ip
// @desc    جلب الحسابات التي استخدمت IP محدد (knownIPs)
router.get('/by-ip/:ip', protect, adminOnly, async (req, res) => {
    try {
        const ip = decodeURIComponent(req.params.ip || '').trim();
        if (!ip) return res.status(400).json({ success: false, message: 'IP مطلوب' });

        const accounts = await User.find({ 'knownIPs.ip': ip })
            .select('name email profileImage isActive suspendedUntil suspendReason deviceBanned violationCount createdAt lastLogin role uniqueTag persistentDeviceId knownIPs')
            .sort('-lastLogin')
            .limit(100)
            .lean();

        // استخراج معلومات IP من كل حساب
        const enriched = accounts.map(u => {
            const entry = (u.knownIPs || []).find(e => e.ip === ip);
            return {
                ...u,
                knownIPs: undefined,
                ipActivity: entry ? {
                    firstSeen: entry.firstSeen,
                    lastSeen: entry.lastSeen,
                    count: entry.count,
                    userAgent: entry.userAgent
                } : null
            };
        });

        res.json({ success: true, count: enriched.length, data: { ip, accounts: enriched } });
    } catch (error) {
        console.error('خطأ في البحث بـ IP:', error);
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

        if (!user.deviceToken && !user.fcmToken && !user.persistentDeviceId && (!user.deviceInfo || !user.deviceInfo.platform)) {
            return res.status(400).json({ success: false, message: 'لا توجد معلومات جهاز لهذا المستخدم' });
        }

        const fingerprint = user.deviceInfo
            ? buildFingerprint(user.deviceInfo.toObject ? user.deviceInfo.toObject() : user.deviceInfo, null)
            : null;

        const existing = await BannedDevice.findOne({
            $or: [
                user.persistentDeviceId ? { persistentDeviceId: user.persistentDeviceId } : null,
                user.deviceToken ? { deviceToken: user.deviceToken } : null,
                user.fcmToken ? { fcmToken: user.fcmToken } : null,
                fingerprint ? { deviceFingerprint: fingerprint } : null
            ].filter(Boolean)
        });

        if (!existing) {
            await BannedDevice.create({
                deviceToken: user.deviceToken || null,
                fcmToken: user.fcmToken || null,
                persistentDeviceId: user.persistentDeviceId || null,
                deviceFingerprint: fingerprint,
                deviceInfo: user.deviceInfo || {},
                originalUserId: user._id,
                originalUserName: user.name,
                reason,
                bannedBy: req.user._id
            });
        } else if (user.persistentDeviceId && !existing.persistentDeviceId) {
            // تحديث سجل قديم بإضافة persistentDeviceId
            existing.persistentDeviceId = user.persistentDeviceId;
            await existing.save();
        }

        const banUntil = new Date(Date.now() + 36500 * 24 * 60 * 60 * 1000);

        user.deviceBanned = true;
        user.deviceBannedAt = new Date();
        user.isActive = false;
        user.suspendedUntil = banUntil;
        user.suspendReason = reason;
        user.warnings.push({ reason, action: 'device_ban', adminId: req.user._id });
        await user.save();

        // قطع الجلسة الحية للحساب الأصلي
        const disconnectUser = (uid) => {
            if (global.connectedUsers && global.connectedUsers.has(uid)) {
                const info = global.connectedUsers.get(uid);
                const sock = global.io?.sockets?.sockets?.get(info.socketId);
                if (sock) sock.disconnect(true);
            }
        };
        disconnectUser(user._id.toString());

        // 🔒 حظر كل الحسابات الشقيقة على نفس الجهاز
        // (نفس persistentDeviceId / deviceToken / fcmToken / deviceFingerprint)
        const linkedFilters = [];
        if (user.persistentDeviceId) linkedFilters.push({ persistentDeviceId: user.persistentDeviceId });
        if (user.deviceToken) linkedFilters.push({ deviceToken: user.deviceToken });
        if (user.fcmToken) linkedFilters.push({ fcmToken: user.fcmToken });
        if (fingerprint) linkedFilters.push({ deviceFingerprint: fingerprint });

        let linkedBannedCount = 0;
        if (linkedFilters.length > 0) {
            const linked = await User.find({
                $or: linkedFilters,
                _id: { $ne: user._id },
                role: { $ne: 'admin' }
            }).select('_id name');

            for (const linkedUser of linked) {
                await User.updateOne(
                    { _id: linkedUser._id },
                    {
                        $set: {
                            deviceBanned: true,
                            deviceBannedAt: new Date(),
                            isActive: false,
                            suspendedUntil: banUntil,
                            suspendReason: `${reason} (حساب مرتبط بـ ${user.name})`
                        },
                        $push: {
                            warnings: { reason: `حساب شقيق محظور (الأصلي: ${user.name})`, action: 'device_ban', adminId: req.user._id }
                        }
                    }
                );
                disconnectUser(linkedUser._id.toString());
                linkedBannedCount++;
            }
        }

        invalidateUsers();

        await logAdminAction(req, {
            action: 'admin_device_ban',
            description: `حظر جهاز ${user.name} نهائياً + ${linkedBannedCount} حساب شقيق`,
            targetUser: user,
            additionalInfo: { reason, persistentDeviceId: user.persistentDeviceId, linkedBannedCount },
            severity: 'high'
        });

        res.json({
            success: true,
            message: linkedBannedCount > 0
                ? `تم حظر جهاز ${user.name} + ${linkedBannedCount} حساب آخر على نفس الجهاز`
                : `تم حظر جهاز ${user.name} نهائياً`,
            data: { deviceBanned: true, linkedBannedCount }
        });
    } catch (error) {
        console.error('خطأ في حظر الجهاز:', error);
        res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
    }
});

// @route   PUT /api/users/banned-devices/:id/ban-active-linked
// @desc    حظر كل الحسابات النشطة المرتبطة بجهاز محظور (التهرب)
router.put('/banned-devices/:id/ban-active-linked', protect, adminOnly, async (req, res) => {
    try {
        const device = await BannedDevice.findById(req.params.id).lean();
        if (!device) return res.status(404).json({ success: false, message: 'الجهاز غير موجود' });

        let pid = device.persistentDeviceId || null;
        if (!pid && device.originalUserId) {
            const orig = await User.findById(device.originalUserId).select('persistentDeviceId').lean();
            pid = orig?.persistentDeviceId || null;
        }

        const filters = [];
        if (pid) filters.push({ persistentDeviceId: pid });
        if (device.deviceToken) filters.push({ deviceToken: device.deviceToken });
        if (device.fcmToken) filters.push({ fcmToken: device.fcmToken });
        if (device.deviceFingerprint) filters.push({ deviceFingerprint: device.deviceFingerprint });

        if (filters.length === 0) {
            return res.json({ success: true, message: 'لا توجد معرّفات للجهاز', count: 0 });
        }

        const activeLinked = await User.find({
            $or: filters,
            isActive: true,
            deviceBanned: { $ne: true },
            role: { $ne: 'admin' }
        }).select('_id name');

        const banUntil = new Date(Date.now() + 36500 * 24 * 60 * 60 * 1000);
        const reason = `حساب مرتبط بجهاز محظور (${device.originalUserName || 'غير معروف'})`;

        for (const u of activeLinked) {
            await User.updateOne(
                { _id: u._id },
                {
                    $set: {
                        deviceBanned: true,
                        deviceBannedAt: new Date(),
                        isActive: false,
                        suspendedUntil: banUntil,
                        suspendReason: reason
                    },
                    $push: {
                        warnings: { reason: 'تم حظره من صفحة الأجهزة المحظورة', action: 'device_ban', adminId: req.user._id }
                    }
                }
            );
            // قطع الجلسة الحية
            if (global.connectedUsers && global.connectedUsers.has(u._id.toString())) {
                const info = global.connectedUsers.get(u._id.toString());
                const sock = global.io?.sockets?.sockets?.get(info.socketId);
                if (sock) sock.disconnect(true);
            }
        }

        invalidateUsers();

        await logAdminAction(req, {
            action: 'admin_ban_active_linked',
            description: `حظر ${activeLinked.length} حساب نشط مرتبط بجهاز ${device.originalUserName}`,
            additionalInfo: { deviceId: device._id, count: activeLinked.length, names: activeLinked.map(u => u.name) },
            severity: 'high'
        });

        res.json({
            success: true,
            message: `تم حظر ${activeLinked.length} حساب`,
            count: activeLinked.length,
            accounts: activeLinked.map(u => ({ id: u._id, name: u.name }))
        });
    } catch (error) {
        console.error('خطأ في حظر الحسابات النشطة:', error);
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
                user.persistentDeviceId ? { persistentDeviceId: user.persistentDeviceId } : null,
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

        await logAdminAction(req, {
            action: 'admin_device_unban',
            description: `فك حظر جهاز ${user.name}`,
            targetUser: user,
            severity: 'medium'
        });

        res.json({ success: true, message: 'تم فك حظر الجهاز' });
    } catch (error) {
        console.error('خطأ في فك حظر الجهاز:', error);
        res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
    }
});

// ═══════════════════════════════════════════
// إدارة حظر IPs (يدوي من الأدمن — TTL تلقائي)
// ═══════════════════════════════════════════

// @route   GET /api/users/banned-ips/list
// @desc    قائمة IPs المحظورة
router.get('/banned-ips/list', protect, adminOnly, async (req, res) => {
    try {
        const list = await BannedIP.find()
            .populate('bannedBy', 'name')
            .populate('originalUserId', 'name uniqueTag')
            .sort('-bannedAt')
            .limit(200)
            .lean();

        // لكل IP: كم حساب استخدمه
        for (const b of list) {
            b.accountsCount = await User.countDocuments({ 'knownIPs.ip': b.ip });
        }

        res.json({ success: true, count: list.length, data: list });
    } catch (error) {
        console.error('خطأ في قائمة IPs المحظورة:', error);
        res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
    }
});

// @route   POST /api/users/banned-ips
// @desc    حظر IP يدوياً (مع TTL اختياري)
// @body    { ip, reason, days (optional, null = permanent), originalUserId (optional) }
router.post('/banned-ips', protect, adminOnly, async (req, res) => {
    try {
        const { ip, reason = 'حظر يدوي من الأدمن', days = null, originalUserId = null } = req.body;
        if (!ip || typeof ip !== 'string') {
            return res.status(400).json({ success: false, message: 'IP مطلوب' });
        }

        const cleanIP = ip.trim();
        const expiresAt = days ? new Date(Date.now() + Number(days) * 24 * 60 * 60 * 1000) : null;

        let originalUserName = null;
        if (originalUserId) {
            const u = await User.findById(originalUserId).select('name').lean();
            originalUserName = u?.name || null;
        }

        // upsert: إذا موجود → حدّث
        const banned = await BannedIP.findOneAndUpdate(
            { ip: cleanIP },
            {
                ip: cleanIP,
                reason,
                expiresAt,
                bannedBy: req.user._id,
                bannedAt: new Date(),
                originalUserId,
                originalUserName
            },
            { upsert: true, new: true }
        );

        await logAdminAction(req, {
            action: 'admin_ip_ban',
            description: `حظر IP: ${cleanIP}`,
            targetType: null,
            targetId: banned._id,
            targetName: cleanIP,
            additionalInfo: { reason, days, expiresAt, originalUserId, originalUserName },
            severity: 'high'
        });

        res.json({ success: true, message: 'تم حظر IP', data: banned });
    } catch (error) {
        console.error('خطأ في حظر IP:', error);
        res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
    }
});

// @route   DELETE /api/users/banned-ips/:id
// @desc    فك حظر IP
router.delete('/banned-ips/:id', protect, adminOnly, async (req, res) => {
    try {
        const deleted = await BannedIP.findByIdAndDelete(req.params.id);
        if (!deleted) return res.status(404).json({ success: false, message: 'IP غير موجود' });

        await logAdminAction(req, {
            action: 'admin_ip_unban',
            description: `فك حظر IP: ${deleted.ip}`,
            targetType: null,
            targetName: deleted.ip,
            severity: 'medium'
        });

        res.json({ success: true, message: 'تم فك حظر IP' });
    } catch (error) {
        console.error('خطأ في فك حظر IP:', error);
        res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
    }
});

// @route   GET /api/users/banned-ips/:id/accounts
// @desc    الحسابات التي استخدمت IP المحظور
router.get('/banned-ips/:id/accounts', protect, adminOnly, async (req, res) => {
    try {
        const banned = await BannedIP.findById(req.params.id).lean();
        if (!banned) return res.status(404).json({ success: false, message: 'IP غير موجود' });

        const accounts = await User.find({ 'knownIPs.ip': banned.ip })
            .select('name email profileImage isActive suspendedUntil deviceBanned createdAt lastLogin role uniqueTag')
            .sort('-lastLogin')
            .limit(100)
            .lean();

        res.json({ success: true, count: accounts.length, data: { ip: banned, accounts } });
    } catch (error) {
        console.error('خطأ في حسابات IP المحظور:', error);
        res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
    }
});

module.exports = router;
