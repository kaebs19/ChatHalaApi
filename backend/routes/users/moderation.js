// HalaChat - Users Moderation Routes (Admin)
// إجراءات الإشراف: تعليق، حظر، فك حظر، تحذير، إلخ

const express = require('express');
const router = express.Router();
const User = require('../../models/User');
const Notification = require('../../models/Notification');
const Message = require('../../models/Message');
const { protect, adminOnly } = require('../../middleware/auth');
const { invalidateUsers } = require('../../utils/cache');
const pushNotificationService = require('../../services/pushNotificationService');
const modConfig = require('../../config/moderation');

// Helper: فصل socket للمستخدم عند الحظر
const disconnectUserSocket = (userId) => {
    if (global.connectedUsers && global.connectedUsers.has(userId.toString())) {
        const info = global.connectedUsers.get(userId.toString());
        const sock = global.io?.sockets?.sockets?.get(info.socketId);
        if (sock) sock.disconnect(true);
    }
};

// @route   PUT /api/users/:id/toggle-active
router.put('/:id/toggle-active', protect, adminOnly, async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });

        user.isActive = !user.isActive;
        await user.save();
        invalidateUsers();

        res.status(200).json({
            success: true,
            message: user.isActive ? 'تم تفعيل المستخدم' : 'تم إلغاء تفعيل المستخدم',
            data: { user }
        });
    } catch (error) {
        console.error('خطأ في تحديث المستخدم:', error);
        res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
    }
});

// @route   PUT /api/users/:id/suspend
router.put('/:id/suspend', protect, adminOnly, async (req, res) => {
    try {
        const { days = 7, reason = '' } = req.body;
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });

        user.isActive = false;
        user.suspendedUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
        user.suspendReason = reason;
        user.violationCount = (user.violationCount || 0) + 1;
        user.warnings.push({ reason: reason || `تعليق ${days} يوم`, action: 'suspend', adminId: req.user._id });
        await user.save();

        const notifTitle = 'تم تعليق حسابك';
        const notifBody = `تم تعليق حسابك لمدة ${days} يوم. السبب: ${reason || 'مخالفة سياسة الاستخدام'}`;
        await Notification.create({
            title: notifTitle, body: notifBody, type: 'system',
            sender: req.user._id, targetUsers: [user._id], recipients: 'specific'
        });
        await pushNotificationService.sendNotificationToUser(user._id, { title: notifTitle, body: notifBody }, { type: 'system' }, false);

        disconnectUserSocket(user._id);
        invalidateUsers();

        res.json({
            success: true,
            message: `تم تعليق ${user.name} لمدة ${days} يوم`,
            data: { suspendedUntil: user.suspendedUntil, reason }
        });
    } catch (error) {
        console.error('خطأ في تعليق المستخدم:', error);
        res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
    }
});

// @route   PUT /api/users/:id/ban-permanent
router.put('/:id/ban-permanent', protect, adminOnly, async (req, res) => {
    try {
        const { reason = 'حظر دائم من قبل الإدارة' } = req.body;
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
        if (user.role === 'admin') {
            return res.status(403).json({ success: false, message: 'لا يمكن حظر مدير' });
        }

        user.isActive = false;
        user.suspendedUntil = new Date(Date.now() + modConfig.PERMANENT_BAN_DAYS * 24 * 60 * 60 * 1000);
        user.suspendReason = reason;
        user.violationCount = (user.violationCount || 0) + 1;
        user.warnings.push({ reason, action: 'permanent_ban', adminId: req.user._id });
        await user.save();

        const notifTitle = '🚫 تم حظر حسابك نهائياً';
        const notifBody = `تم حظر حسابك نهائياً. السبب: ${reason}`;
        try {
            await Notification.create({
                title: notifTitle, body: notifBody, type: 'system',
                sender: req.user._id, targetUsers: [user._id], recipients: 'specific'
            });
            await pushNotificationService.sendNotificationToUser(user._id, { title: notifTitle, body: notifBody }, { type: 'system' }, false);
        } catch (e) { /* لا يوقف */ }

        disconnectUserSocket(user._id);
        invalidateUsers();

        res.json({
            success: true,
            message: `تم حظر ${user.name} نهائياً`,
            data: { suspendedUntil: user.suspendedUntil, reason }
        });
    } catch (error) {
        console.error('خطأ في الحظر النهائي:', error);
        res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
    }
});

// @route   PUT /api/users/:id/unban
router.put('/:id/unban', protect, adminOnly, async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });

        user.isActive = true;
        user.suspendedUntil = null;
        user.suspendReason = null;
        user.dailyViolationCount = 0;
        user.warnings.push({ reason: 'فك الحظر/التعليق', action: 'unban', adminId: req.user._id });
        await user.save();

        try {
            await Notification.create({
                title: '✅ تم رفع التعليق عن حسابك',
                body: 'مرحباً بعودتك! يرجى المحافظة على شروط الاستخدام.',
                type: 'system',
                sender: req.user._id,
                targetUsers: [user._id],
                recipients: 'specific'
            });
            await pushNotificationService.sendNotificationToUser(user._id,
                { title: '✅ تم رفع التعليق عن حسابك', body: 'مرحباً بعودتك!' },
                { type: 'system' }, false);
        } catch (e) {}

        invalidateUsers();
        res.json({ success: true, message: `تم فك الحظر عن ${user.name}`, data: { user } });
    } catch (error) {
        console.error('خطأ في فك الحظر:', error);
        res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
    }
});

// @route   PUT /api/users/:id/reset-avatar
router.put('/:id/reset-avatar', protect, adminOnly, async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });

        user.profileImage = null;
        user.violationCount = (user.violationCount || 0) + 1;
        user.warnings.push({ reason: 'حذف الصورة الشخصية من قبل الإدارة', action: 'avatar_reset', adminId: req.user._id });
        await user.save();

        const notifTitle = 'تنبيه من الإدارة';
        const notifBody = 'تم حذف صورتك الشخصية لمخالفتها سياسة الاستخدام';
        await Notification.create({
            title: notifTitle, body: notifBody, type: 'system',
            sender: req.user._id, targetUsers: [user._id], recipients: 'specific'
        });
        await pushNotificationService.sendNotificationToUser(user._id, { title: notifTitle, body: notifBody }, { type: 'system' }, false);
        if (global.io) {
            global.io.to(`user:${user._id}`).emit('notification', { title: notifTitle, body: notifBody });
        }

        invalidateUsers();
        res.json({ success: true, message: 'تم حذف الصورة وإشعار المستخدم' });
    } catch (error) {
        console.error('خطأ:', error);
        res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
    }
});

// @route   PUT /api/users/:id/ban-name
router.put('/:id/ban-name', protect, adminOnly, async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });

        const oldName = user.name;
        user.name = '***مستخدم محظور***';
        user.nameBanned = true;
        user.violationCount = (user.violationCount || 0) + 1;
        user.warnings.push({
            reason: `حظر الاسم: ${oldName}`,
            action: 'name_ban',
            adminId: req.user._id,
            oldName
        });
        if (!user.bannedNamesHistory) user.bannedNamesHistory = [];
        user.bannedNamesHistory.push({
            name: oldName,
            bannedAt: new Date(),
            adminId: req.user._id
        });
        await user.save();

        const notifTitle = 'تنبيه من الإدارة';
        const notifBody = 'تم حظر اسمك لمخالفته سياسة الاستخدام. يرجى تغيير الاسم.';
        await Notification.create({
            title: notifTitle, body: notifBody, type: 'system',
            sender: req.user._id, targetUsers: [user._id], recipients: 'specific'
        });
        await pushNotificationService.sendNotificationToUser(user._id, { title: notifTitle, body: notifBody }, { type: 'system' }, false);
        if (global.io) {
            global.io.to(`user:${user._id}`).emit('notification', { title: notifTitle, body: notifBody });
        }

        invalidateUsers();
        res.json({ success: true, message: `تم حظر الاسم "${oldName}"` });
    } catch (error) {
        console.error('خطأ:', error);
        res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
    }
});

// @route   PUT /api/users/:id/warn
router.put('/:id/warn', protect, adminOnly, async (req, res) => {
    try {
        const { reason = 'مخالفة سياسة الاستخدام', messageId } = req.body;
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });

        const today = new Date().toISOString().split('T')[0];
        if (user.dailyViolationDate !== today) {
            user.dailyViolationCount = 0;
            user.dailyViolationDate = today;
        }
        user.dailyViolationCount += 1;
        user.violationCount = (user.violationCount || 0) + 1;

        const warning = { reason, action: 'warn', adminId: req.user._id };
        if (messageId) {
            try {
                const msg = await Message.findById(messageId).select('content type mediaUrl conversationId');
                if (msg) {
                    warning.evidence = {
                        messageId: msg._id,
                        messageContent: msg.content || null,
                        messageMedia: msg.mediaUrl || null,
                        messageType: msg.type || 'text',
                        conversationId: msg.conversationId || null
                    };
                }
            } catch (e) {}
        }
        user.warnings.push(warning);

        let autoSuspended = false;
        let suspendDays = 0;
        if (user.dailyViolationCount >= modConfig.MAX_DAILY_VIOLATIONS) {
            autoSuspended = true;
            user.suspensionCount = (user.suspensionCount || 0) + 1;
            suspendDays = modConfig.getSuspensionDays(user.suspensionCount);

            user.isActive = false;
            user.suspendedUntil = new Date(Date.now() + suspendDays * 24 * 60 * 60 * 1000);
            user.suspendReason = suspendDays >= modConfig.PERMANENT_BAN_DAYS
                ? 'حظر دائم - تكرار المخالفات'
                : `تعليق تلقائي ${suspendDays} يوم - تجاوز ${modConfig.MAX_DAILY_VIOLATIONS} مخالفات يومية`;
            user.warnings.push({ reason: user.suspendReason, action: 'auto_suspend', adminId: req.user._id });
            user.dailyViolationCount = 0;

            disconnectUserSocket(user._id);
        }

        await user.save();

        const dailyRemaining = Math.max(0, modConfig.MAX_DAILY_VIOLATIONS - user.dailyViolationCount);
        const notifTitle = autoSuspended ? '🚫 تم تعليق حسابك' : '⚠️ تحذير من الإدارة';
        const notifBody = autoSuspended
            ? (suspendDays >= modConfig.PERMANENT_BAN_DAYS
                ? 'تم حظر حسابك نهائياً بسبب تكرار المخالفات.'
                : `تم تعليق حسابك لمدة ${suspendDays} يوم بسبب تكرار المخالفات.`)
            : `تحذير: ${reason}. مخالفة ${user.dailyViolationCount}/${modConfig.MAX_DAILY_VIOLATIONS} اليوم. متبقي ${dailyRemaining}.`;
        await Notification.create({
            title: notifTitle, body: notifBody, type: 'system',
            sender: req.user._id, targetUsers: [user._id], recipients: 'specific'
        });
        await pushNotificationService.sendNotificationToUser(user._id, { title: notifTitle, body: notifBody }, { type: 'system' }, false);
        if (global.io) {
            global.io.to(`user:${user._id}`).emit('notification', { title: notifTitle, body: notifBody });
        }

        invalidateUsers();
        res.json({
            success: true,
            message: autoSuspended
                ? `تم تحذير وتعليق ${user.name} تلقائياً (${suspendDays >= modConfig.PERMANENT_BAN_DAYS ? 'دائم' : suspendDays + ' يوم'})`
                : `تم تحذير ${user.name} (${user.dailyViolationCount}/${modConfig.MAX_DAILY_VIOLATIONS} مخالفات اليوم)`,
            data: { violationCount: user.violationCount, dailyViolationCount: user.dailyViolationCount, autoSuspended, suspendDays }
        });
    } catch (error) {
        console.error('خطأ:', error);
        res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
    }
});

// ============================================
// 📨 تنبيهات احترافية (بدون تسجيل مخالفة)
// ============================================

// قوالب التنبيهات الجاهزة
const NOTIFICATION_TEMPLATES = {
    photo: {
        title: '⚠️ تنبيه بشأن الصورة الشخصية',
        body: 'صورتك الشخصية تخالف سياسة الاستخدام. يرجى تغييرها خلال 24 ساعة لتجنب الإيقاف.'
    },
    name: {
        title: '⚠️ تنبيه بشأن الاسم',
        body: 'اسمك الحالي يخالف سياسة التطبيق. يرجى تغييره لتجنب إيقاف حسابك.'
    },
    content: {
        title: '⚠️ تنبيه بشأن المحتوى',
        body: 'تم رصد محتوى مخالف لسياسة الاستخدام. يرجى الالتزام بالشروط لتجنب الإيقاف.'
    },
    behavior: {
        title: '⚠️ تنبيه بشأن السلوك',
        body: 'تلقينا بلاغات عن سلوك مزعج من حسابك. نأمل التزامك بقواعد التطبيق لتجنب الإجراءات.'
    },
    final_warning: {
        title: '🚫 تحذير أخير',
        body: 'هذا تحذيرك الأخير. أي مخالفة إضافية ستؤدي لإيقاف حسابك فوراً وبشكل نهائي.'
    },
    bio: {
        title: '⚠️ تنبيه بشأن النبذة',
        body: 'نبذتك الشخصية تحتوي على محتوى مخالف. يرجى تعديلها لتتوافق مع سياسة الاستخدام.'
    }
};

// @route   POST /api/users/:id/notify
// @desc    إرسال تنبيه رسمي للمستخدم (بدون تسجيل مخالفة)
router.post('/:id/notify', protect, adminOnly, async (req, res) => {
    try {
        const { template, title, body } = req.body;
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });

        let notifTitle, notifBody;

        if (template && NOTIFICATION_TEMPLATES[template]) {
            notifTitle = NOTIFICATION_TEMPLATES[template].title;
            notifBody = NOTIFICATION_TEMPLATES[template].body;
        } else if (title && body) {
            notifTitle = title;
            notifBody = body;
        } else {
            return res.status(400).json({ success: false, message: 'اختر قالب أو اكتب عنوان ومحتوى' });
        }

        // إشعار DB + Push + Socket
        await Notification.create({
            title: notifTitle, body: notifBody, type: 'warning',
            sender: req.user._id, targetUsers: [user._id], recipients: 'specific'
        });
        await pushNotificationService.sendNotificationToUser(user._id,
            { title: notifTitle, body: notifBody }, { type: 'warning' }, false);
        if (global.io) {
            global.io.to(`user:${user._id}`).emit('notification', {
                title: notifTitle, body: notifBody, type: 'warning'
            });
        }

        res.json({ success: true, message: `تم إرسال التنبيه لـ ${user.name}` });
    } catch (error) {
        console.error('خطأ في إرسال التنبيه:', error);
        res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
    }
});

// @route   GET /api/users/notification-templates
// @desc    قائمة قوالب التنبيهات المتاحة
router.get('/notification-templates', protect, adminOnly, (req, res) => {
    const templates = Object.entries(NOTIFICATION_TEMPLATES).map(([key, val]) => ({
        key,
        title: val.title,
        body: val.body
    }));
    res.json({ success: true, data: templates });
});

// ============================================
// ⚠️ إدارة عدد المخالفات
// ============================================

// @route   PUT /api/users/:id/adjust-violations
// @desc    تعديل عدد المخالفات (+/-)
router.put('/:id/adjust-violations', protect, adminOnly, async (req, res) => {
    try {
        const { amount = 1, reason = '' } = req.body;
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });

        const oldCount = user.violationCount || 0;
        user.violationCount = Math.max(0, oldCount + parseInt(amount));

        // سجّل في warnings
        user.warnings.push({
            reason: reason || `تعديل المخالفات يدوياً: ${amount > 0 ? '+' : ''}${amount}`,
            action: 'warn',
            adminId: req.user._id
        });

        await user.save();

        // إشعار المستخدم إذا كانت زيادة
        if (amount > 0) {
            const notifTitle = '⚠️ مخالفة مسجّلة';
            const notifBody = reason
                ? `تم تسجيل مخالفة: ${reason}. إجمالي المخالفات: ${user.violationCount}`
                : `تم تسجيل ${amount} مخالفة. إجمالي المخالفات: ${user.violationCount}`;
            await Notification.create({
                title: notifTitle, body: notifBody, type: 'warning',
                sender: req.user._id, targetUsers: [user._id], recipients: 'specific'
            });
            await pushNotificationService.sendNotificationToUser(user._id,
                { title: notifTitle, body: notifBody }, { type: 'warning' }, false);
            if (global.io) {
                global.io.to(`user:${user._id}`).emit('notification', {
                    title: notifTitle, body: notifBody
                });
            }
        }

        invalidateUsers();
        res.json({
            success: true,
            message: `تم تعديل المخالفات: ${oldCount} → ${user.violationCount}`,
            data: { oldCount, newCount: user.violationCount }
        });
    } catch (error) {
        console.error('خطأ في تعديل المخالفات:', error);
        res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
    }
});

// @route   PUT /api/users/:id/clear-violations
// @desc    تصفير جميع المخالفات
router.put('/:id/clear-violations', protect, adminOnly, async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });

        const oldCount = user.violationCount || 0;
        user.violationCount = 0;
        user.dailyViolationCount = 0;
        user.dailyViolationDate = null;
        user.suspensionCount = 0;
        user.warnings.push({
            reason: `تصفير جميع المخالفات (كانت ${oldCount})`,
            action: 'unban',
            adminId: req.user._id
        });

        await user.save();
        invalidateUsers();

        res.json({
            success: true,
            message: `تم تصفير مخالفات ${user.name} (كانت ${oldCount})`,
            data: { oldCount, newCount: 0 }
        });
    } catch (error) {
        console.error('خطأ في تصفير المخالفات:', error);
        res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
    }
});

module.exports = router;
