// HalaChat Dashboard - Users Routes
// المسارات الخاصة بإدارة المستخدمين (للأدمن فقط)

const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { protect, adminOnly } = require('../middleware/auth');
const { get, set, CACHE_KEYS, CACHE_TTL, invalidateUsers } = require('../utils/cache');
const Notification = require('../models/Notification');
const pushNotificationService = require('../services/pushNotificationService');

// @route   GET /api/users
// @desc    الحصول على جميع المستخدمين
// @access  Private/Admin
router.get('/', protect, adminOnly, async (req, res) => {
    try {
        // التحقق من الـ Cache
        const cachedUsers = get(CACHE_KEYS.ALL_USERS);
        if (cachedUsers) {
            console.log('📦 Users من الـ Cache');
            return res.status(200).json(cachedUsers);
        }

        const users = await User.find({}).select('-password').sort({ createdAt: -1 });

        const responseData = {
            success: true,
            count: users.length,
            data: {
                users
            }
        };

        // تخزين في الـ Cache
        set(CACHE_KEYS.ALL_USERS, responseData, CACHE_TTL.ALL_USERS);

        res.status(200).json(responseData);

    } catch (error) {
        console.error('خطأ في جلب المستخدمين:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر'
        });
    }
});

// @route   GET /api/users/premium
// @desc    قائمة المستخدمين المميزين
// @access  Private/Admin
router.get('/premium', protect, adminOnly, async (req, res) => {
    try {
        const { page = 1, limit = 20, plan, expired } = req.query;
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);

        const filter = { isPremium: true };
        if (plan && ['weekly', 'monthly', 'quarterly'].includes(plan)) {
            filter.premiumPlan = plan;
        }
        if (expired === 'true') {
            filter.premiumExpiresAt = { $lt: new Date() };
        } else if (expired === 'false') {
            filter.premiumExpiresAt = { $gte: new Date() };
        }

        const users = await User.find(filter)
            .select('name email profileImage isPremium premiumPlan premiumExpiresAt verification.isVerified createdAt lastLogin')
            .sort({ premiumExpiresAt: -1 })
            .limit(limitNum)
            .skip((pageNum - 1) * limitNum);

        const total = await User.countDocuments(filter);

        // إحصائيات
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
            data: {
                users,
                stats,
                page: pageNum,
                totalPages: Math.ceil(total / limitNum),
                total
            }
        });
    } catch (error) {
        console.error('خطأ في جلب المستخدمين المميزين:', error);
        res.status(500).json({ success: false, message: 'فشل في جلب المستخدمين المميزين' });
    }
});

// @route   PUT /api/users/:id/premium
// @desc    تعديل اشتراك مستخدم يدوياً
// @access  Private/Admin
router.put('/:id/premium', protect, adminOnly, async (req, res) => {
    try {
        const { isPremium, premiumPlan, premiumExpiresAt } = req.body;

        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
        }

        if (typeof isPremium === 'boolean') user.isPremium = isPremium;
        if (premiumPlan !== undefined) user.premiumPlan = premiumPlan;
        if (premiumExpiresAt) user.premiumExpiresAt = new Date(premiumExpiresAt);

        // إذا تم إلغاء Premium
        if (isPremium === false) {
            user.premiumPlan = null;
            user.premiumExpiresAt = null;
            user.stealthMode = false;
        }

        await user.save();

        res.json({
            success: true,
            message: 'تم تحديث الاشتراك بنجاح',
            data: {
                _id: user._id,
                name: user.name,
                isPremium: user.isPremium,
                premiumPlan: user.premiumPlan,
                premiumExpiresAt: user.premiumExpiresAt
            }
        });
    } catch (error) {
        console.error('خطأ في تعديل الاشتراك:', error);
        res.status(500).json({ success: false, message: 'فشل في تعديل الاشتراك' });
    }
});

// @route   GET /api/users/:id
// @desc    الحصول على مستخدم واحد
// @access  Private/Admin
router.get('/:id', protect, adminOnly, async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('-password');

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'المستخدم غير موجود'
            });
        }

        res.status(200).json({
            success: true,
            data: {
                user
            }
        });

    } catch (error) {
        console.error('خطأ في جلب المستخدم:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر'
        });
    }
});

// @route   DELETE /api/users/:id
// @desc    حذف مستخدم
// @access  Private/Admin
router.delete('/:id', protect, adminOnly, async (req, res) => {
    try {
        const user = await User.findById(req.params.id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'المستخدم غير موجود'
            });
        }

        await user.deleteOne();

        // إبطال الـ Cache
        invalidateUsers();

        res.status(200).json({
            success: true,
            message: 'تم حذف المستخدم بنجاح'
        });

    } catch (error) {
        console.error('خطأ في حذف المستخدم:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر'
        });
    }
});

// @route   PUT /api/users/:id
// @desc    تعديل بيانات مستخدم
// @access  Private/Admin
router.put('/:id', protect, adminOnly, async (req, res) => {
    try {
        const { name, email, role } = req.body;

        // التحقق من وجود المستخدم
        const user = await User.findById(req.params.id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'المستخدم غير موجود'
            });
        }

        // التحقق من عدم تكرار البريد الإلكتروني
        if (email && email !== user.email) {
            const emailExists = await User.findOne({ email });
            if (emailExists) {
                return res.status(400).json({
                    success: false,
                    message: 'البريد الإلكتروني مستخدم بالفعل'
                });
            }
        }

        // تحديث البيانات
        if (name) user.name = name;
        if (email) user.email = email;
        if (role) user.role = role;

        await user.save();

        // إبطال الـ Cache
        invalidateUsers();

        res.status(200).json({
            success: true,
            message: 'تم تحديث بيانات المستخدم بنجاح',
            data: {
                user: {
                    _id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    isActive: user.isActive
                }
            }
        });

    } catch (error) {
        console.error('خطأ في تحديث المستخدم:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر'
        });
    }
});

// @route   PUT /api/users/:id/toggle-active
// @desc    تفعيل/إلغاء تفعيل مستخدم
// @access  Private/Admin
router.put('/:id/toggle-active', protect, adminOnly, async (req, res) => {
    try {
        const user = await User.findById(req.params.id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'المستخدم غير موجود'
            });
        }

        user.isActive = !user.isActive;
        await user.save();

        // إبطال الـ Cache
        invalidateUsers();

        res.status(200).json({
            success: true,
            message: user.isActive ? 'تم تفعيل المستخدم' : 'تم إلغاء تفعيل المستخدم',
            data: {
                user
            }
        });

    } catch (error) {
        console.error('خطأ في تحديث المستخدم:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر'
        });
    }
});

// @route   GET /api/users/:id/activity
// @desc    الحصول على نشاط مستخدم محدد
// @access  Private/Admin
router.get('/:id/activity', protect, adminOnly, async (req, res) => {
    try {
        const Conversation = require('../models/Conversation');
        const Message = require('../models/Message');

        const user = await User.findById(req.params.id).select('-password');

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'المستخدم غير موجود'
            });
        }

        // إحصائيات المستخدم
        const userConversations = await Conversation.find({
            participants: req.params.id
        }).populate('lastMessage');

        const userMessages = await Message.find({
            sender: req.params.id,
            isDeleted: false
        });

        // حساب الإحصائيات
        const stats = {
            totalConversations: userConversations.length,
            activeConversations: userConversations.filter(c => c.isActive).length,
            totalMessagesSent: userMessages.length,
            lastActivity: user.lastLogin || user.updatedAt
        };

        res.status(200).json({
            success: true,
            data: {
                user,
                stats,
                conversations: userConversations,
                recentMessages: userMessages.slice(0, 10)
            }
        });

    } catch (error) {
        console.error('خطأ في جلب نشاط المستخدم:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر'
        });
    }
});

// @route   GET /api/users/locations
// @desc    جلب مواقع جميع المستخدمين (للخريطة)
// @access  Private/Admin
router.get('/locations', protect, adminOnly, async (req, res) => {
    try {
        const users = await User.find({
            'location.coordinates': { $ne: [0, 0] }
        }).select('name email profileImage gender isActive isOnline lastLogin location createdAt');

        res.status(200).json({
            success: true,
            count: users.length,
            data: { users }
        });
    } catch (error) {
        console.error('خطأ في جلب مواقع المستخدمين:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر'
        });
    }
});

// @route   PUT /api/users/:id/suspend
// @desc    تعليق مستخدم لفترة محددة
// @access  Private/Admin
router.put('/:id/suspend', protect, adminOnly, async (req, res) => {
    try {
        const { days = 7, reason = '' } = req.body;

        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
        }

        user.isActive = false;
        user.suspendedUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
        user.suspendReason = reason;
        user.violationCount = (user.violationCount || 0) + 1;
        user.warnings.push({ reason: reason || `تعليق ${days} يوم`, action: 'suspend', adminId: req.user._id });
        await user.save();

        // إشعار في DB + FCM push
        const notifTitle = 'تم تعليق حسابك';
        const notifBody = `تم تعليق حسابك لمدة ${days} يوم. السبب: ${reason || 'مخالفة سياسة الاستخدام'}`;
        await Notification.create({
            title: notifTitle, body: notifBody, type: 'system',
            sender: req.user._id, targetUsers: [user._id], recipients: 'specific'
        });
        await pushNotificationService.sendNotificationToUser(user._id, { title: notifTitle, body: notifBody }, { type: 'system' }, false);

        // قطع اتصال Socket
        if (global.connectedUsers && global.connectedUsers.has(user._id.toString())) {
            const socketInfo = global.connectedUsers.get(user._id.toString());
            const socket = global.io?.sockets?.sockets?.get(socketInfo.socketId);
            if (socket) socket.disconnect(true);
        }

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

// @route   PUT /api/users/:id/reset-avatar
// @desc    حذف صورة المستخدم + إشعار
// @access  Private/Admin
router.put('/:id/reset-avatar', protect, adminOnly, async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });

        user.profileImage = null;
        user.violationCount = (user.violationCount || 0) + 1;
        user.warnings.push({ reason: 'حذف الصورة الشخصية من قبل الإدارة', action: 'avatar_reset', adminId: req.user._id });
        await user.save();

        // إشعار في DB + FCM push + Socket
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
// @desc    حظر اسم المستخدم (يظهر نجوم)
// @access  Private/Admin
router.put('/:id/ban-name', protect, adminOnly, async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });

        const oldName = user.name;
        user.name = '***مستخدم محظور***';
        user.nameBanned = true;
        user.violationCount = (user.violationCount || 0) + 1;
        user.warnings.push({ reason: `حظر الاسم: ${oldName}`, action: 'name_ban', adminId: req.user._id });
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
// @desc    إرسال تحذير للمستخدم
// @access  Private/Admin
router.put('/:id/warn', protect, adminOnly, async (req, res) => {
    try {
        const { reason = 'مخالفة سياسة الاستخدام' } = req.body;
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });

        user.violationCount = (user.violationCount || 0) + 1;
        user.warnings.push({ reason, action: 'warn', adminId: req.user._id });

        // إيقاف تلقائي عند 5 مخالفات
        let autoSuspended = false;
        if (user.violationCount >= 5) {
            user.isActive = false;
            user.suspendedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
            user.suspendReason = 'إيقاف تلقائي - تجاوز 5 مخالفات';
            user.warnings.push({ reason: 'إيقاف تلقائي - 5 مخالفات', action: 'auto_suspend', adminId: req.user._id });
            autoSuspended = true;

            // قطع اتصال Socket
            if (global.connectedUsers && global.connectedUsers.has(user._id.toString())) {
                const info = global.connectedUsers.get(user._id.toString());
                const sock = global.io?.sockets?.sockets?.get(info.socketId);
                if (sock) sock.disconnect(true);
            }
        }

        await user.save();

        const notifTitle = autoSuspended ? 'تم تعليق حسابك' : 'تحذير من الإدارة';
        const notifBody = autoSuspended
            ? 'تم تعليق حسابك لمدة 24 ساعة بسبب تكرار المخالفات'
            : `تحذير: ${reason}. عدد المخالفات: ${user.violationCount}/5`;
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
                ? `تم تحذير وتعليق ${user.name} تلقائياً (${user.violationCount} مخالفات)`
                : `تم تحذير ${user.name} (${user.violationCount}/5 مخالفات)`,
            data: { violationCount: user.violationCount, autoSuspended }
        });
    } catch (error) {
        console.error('خطأ:', error);
        res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
    }
});

// @route   GET /api/users/:id/violations
// @desc    عرض سجل مخالفات المستخدم
// @access  Private/Admin
router.get('/:id/violations', protect, adminOnly, async (req, res) => {
    try {
        const user = await User.findById(req.params.id)
            .select('name email violationCount warnings nameBanned suspendedUntil suspendReason isActive')
            .populate('warnings.adminId', 'name');

        if (!user) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });

        // عدد الرسائل المخالفة
        const Message = require('../models/Message');
        const flaggedCount = await Message.countDocuments({ sender: req.params.id, hasBannedWords: true });

        res.json({
            success: true,
            data: {
                user: { name: user.name, email: user.email, isActive: user.isActive },
                violationCount: user.violationCount || 0,
                nameBanned: user.nameBanned || false,
                suspendedUntil: user.suspendedUntil,
                suspendReason: user.suspendReason,
                warnings: user.warnings || [],
                flaggedMessagesCount: flaggedCount
            }
        });
    } catch (error) {
        console.error('خطأ:', error);
        res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
    }
});

module.exports = router;
