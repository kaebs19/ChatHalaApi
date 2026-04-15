// HalaChat Dashboard - Users Routes
// المسارات الخاصة بإدارة المستخدمين (للأدمن فقط)

const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { protect, adminOnly } = require('../middleware/auth');
const { get, set, CACHE_KEYS, CACHE_TTL, invalidateUsers } = require('../utils/cache');
const Notification = require('../models/Notification');
const BannedDevice = require('../models/BannedDevice');
const Message = require('../models/Message');
const pushNotificationService = require('../services/pushNotificationService');
const { buildFingerprint } = require('../utils/deviceBan');

// @route   GET /api/users
// @desc    الحصول على جميع المستخدمين
// @access  Private/Admin
router.get('/', protect, adminOnly, async (req, res) => {
    try {
        const { page = 1, limit = 20, search, status, role, sort = 'createdAt', order = 'desc' } = req.query;
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);

        // بناء الفلتر
        const filter = {};
        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }
        if (status === 'active') filter.isActive = true;
        else if (status === 'inactive') filter.isActive = false;
        else if (status === 'suspended') {
            // معلّق مؤقتاً (أقل من سنة)
            filter.isActive = false;
            filter.suspendedUntil = {
                $gte: new Date(),
                $lte: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
            };
        } else if (status === 'banned') {
            // محظور نهائياً (أكثر من سنة) أو جهاز محظور
            filter.$or = [
                { suspendedUntil: { $gt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) } },
                { deviceBanned: true }
            ];
        } else if (status === 'violators') {
            filter.violationCount = { $gt: 0 };
        }
        if (role && role !== 'all') filter.role = role;

        const total = await User.countDocuments(filter);
        const users = await User.find(filter)
            .select('-password')
            .sort({ [sort]: order === 'asc' ? 1 : -1 })
            .skip((pageNum - 1) * limitNum)
            .limit(limitNum);

        res.status(200).json({
            success: true,
            count: users.length,
            data: {
                users,
                total,
                currentPage: pageNum,
                totalPages: Math.ceil(total / limitNum)
            }
        });

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

// @route   PUT /api/users/:id/ban-permanent
// @desc    حظر مستخدم نهائياً
// @access  Private/Admin
router.put('/:id/ban-permanent', protect, adminOnly, async (req, res) => {
    try {
        const { reason = 'حظر دائم من قبل الإدارة' } = req.body;
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
        }
        if (user.role === 'admin') {
            return res.status(403).json({ success: false, message: 'لا يمكن حظر مدير' });
        }

        user.isActive = false;
        // تاريخ بعيد جداً (100 سنة) كعلامة على الحظر النهائي
        user.suspendedUntil = new Date(Date.now() + 36500 * 24 * 60 * 60 * 1000);
        user.suspendReason = reason;
        user.violationCount = (user.violationCount || 0) + 1;
        user.warnings.push({ reason, action: 'permanent_ban', adminId: req.user._id });
        await user.save();

        // إشعار في DB + FCM push
        const notifTitle = '🚫 تم حظر حسابك نهائياً';
        const notifBody = `تم حظر حسابك نهائياً. السبب: ${reason}`;
        try {
            await Notification.create({
                title: notifTitle, body: notifBody, type: 'system',
                sender: req.user._id, targetUsers: [user._id], recipients: 'specific'
            });
            await pushNotificationService.sendNotificationToUser(user._id, { title: notifTitle, body: notifBody }, { type: 'system' }, false);
        } catch (e) { /* لا يوقف العملية */ }

        // قطع اتصال Socket
        if (global.connectedUsers && global.connectedUsers.has(user._id.toString())) {
            const socketInfo = global.connectedUsers.get(user._id.toString());
            const socket = global.io?.sockets?.sockets?.get(socketInfo.socketId);
            if (socket) socket.disconnect(true);
        }

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
// @desc    فك الحظر/التعليق عن مستخدم
// @access  Private/Admin
router.put('/:id/unban', protect, adminOnly, async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
        }

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
        user.warnings.push({
            reason: `حظر الاسم: ${oldName}`,
            action: 'name_ban',
            adminId: req.user._id,
            oldName
        });
        // حفظ في سجل الأسماء المحظورة
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
// @desc    إرسال تحذير للمستخدم
// @access  Private/Admin
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

        // بناء كائن التحذير مع دليل (snapshot من الرسالة إن وُجدت)
        const warning = { reason, action: 'warn', adminId: req.user._id };
        if (messageId) {
            try {
                const msg = await Message.findById(messageId).select('content type mediaUrl conversationId');
                if (msg && msg.sender?.toString() === user._id.toString() || msg) {
                    warning.evidence = {
                        messageId: msg._id,
                        messageContent: msg.content || null,
                        messageMedia: msg.mediaUrl || null,
                        messageType: msg.type || 'text',
                        conversationId: msg.conversationId || null
                    };
                }
            } catch (e) { /* تجاهل - تحذير بدون دليل */ }
        }
        user.warnings.push(warning);

        // تعليق تصاعدي عند 5 مخالفات يومية
        let autoSuspended = false;
        let suspendDays = 0;
        if (user.dailyViolationCount >= 5) {
            autoSuspended = true;
            user.suspensionCount = (user.suspensionCount || 0) + 1;

            if (user.suspensionCount === 1) suspendDays = 1;
            else if (user.suspensionCount === 2) suspendDays = 3;
            else if (user.suspensionCount === 3) suspendDays = 7;
            else suspendDays = 36500;

            user.isActive = false;
            user.suspendedUntil = new Date(Date.now() + suspendDays * 24 * 60 * 60 * 1000);
            user.suspendReason = suspendDays >= 36500
                ? 'حظر دائم - تكرار المخالفات'
                : `تعليق تلقائي ${suspendDays} يوم - تجاوز 5 مخالفات يومية`;
            user.warnings.push({ reason: user.suspendReason, action: 'auto_suspend', adminId: req.user._id });
            user.dailyViolationCount = 0;

            if (global.connectedUsers && global.connectedUsers.has(user._id.toString())) {
                const info = global.connectedUsers.get(user._id.toString());
                const sock = global.io?.sockets?.sockets?.get(info.socketId);
                if (sock) sock.disconnect(true);
            }
        }

        await user.save();

        const dailyRemaining = Math.max(0, 5 - user.dailyViolationCount);
        const notifTitle = autoSuspended ? '🚫 تم تعليق حسابك' : '⚠️ تحذير من الإدارة';
        const notifBody = autoSuspended
            ? (suspendDays >= 36500
                ? 'تم حظر حسابك نهائياً بسبب تكرار المخالفات.'
                : `تم تعليق حسابك لمدة ${suspendDays} يوم بسبب تكرار المخالفات.`)
            : `تحذير: ${reason}. مخالفة ${user.dailyViolationCount}/5 اليوم. متبقي ${dailyRemaining}.`;
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
                ? `تم تحذير وتعليق ${user.name} تلقائياً (${suspendDays >= 36500 ? 'دائم' : suspendDays + ' يوم'})`
                : `تم تحذير ${user.name} (${user.dailyViolationCount}/5 مخالفات اليوم)`,
            data: { violationCount: user.violationCount, dailyViolationCount: user.dailyViolationCount, autoSuspended, suspendDays }
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
            .select('name email violationCount warnings nameBanned bannedNamesHistory suspendedUntil suspendReason isActive deviceBanned deviceBannedAt')
            .populate('warnings.adminId', 'name')
            .populate('bannedNamesHistory.adminId', 'name');

        if (!user) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });

        // عدد الرسائل المخالفة + آخر 20 رسالة مخالفة مع الدليل
        const flaggedCount = await Message.countDocuments({ sender: req.params.id, hasBannedWords: true });
        const flaggedMessages = await Message.find({ sender: req.params.id, hasBannedWords: true })
            .select('content type mediaUrl createdAt conversationId isDeleted')
            .sort('-createdAt')
            .limit(20)
            .lean();

        res.json({
            success: true,
            data: {
                user: {
                    name: user.name, email: user.email, isActive: user.isActive,
                    deviceBanned: user.deviceBanned || false,
                    deviceBannedAt: user.deviceBannedAt
                },
                violationCount: user.violationCount || 0,
                nameBanned: user.nameBanned || false,
                bannedNamesHistory: user.bannedNamesHistory || [],
                suspendedUntil: user.suspendedUntil,
                suspendReason: user.suspendReason,
                warnings: user.warnings || [],
                flaggedMessagesCount: flaggedCount,
                flaggedMessages
            }
        });
    } catch (error) {
        console.error('خطأ:', error);
        res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
    }
});

// @route   PUT /api/users/:id/ban-device
// @desc    حظر جهاز المستخدم نهائياً (يمنعه من التسجيل بحساب جديد)
// @access  Private/Admin
router.put('/:id/ban-device', protect, adminOnly, async (req, res) => {
    try {
        const { reason = 'حظر الجهاز نهائياً' } = req.body;
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
        if (user.role === 'admin') {
            return res.status(403).json({ success: false, message: 'لا يمكن حظر جهاز مدير' });
        }

        if (!user.deviceToken && !user.fcmToken && (!user.deviceInfo || !user.deviceInfo.platform)) {
            return res.status(400).json({
                success: false,
                message: 'لا توجد معلومات جهاز لهذا المستخدم'
            });
        }

        const fingerprint = user.deviceInfo
            ? buildFingerprint(user.deviceInfo.toObject ? user.deviceInfo.toObject() : user.deviceInfo, null)
            : null;

        // تجنب التكرار
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

        // تفعيل الحظر على الحساب أيضاً (لن يستطيع الدخول حتى من جهاز آخر بنفس الحساب)
        user.deviceBanned = true;
        user.deviceBannedAt = new Date();
        user.isActive = false;
        user.suspendedUntil = new Date(Date.now() + 36500 * 24 * 60 * 60 * 1000);
        user.suspendReason = reason;
        user.warnings.push({
            reason, action: 'device_ban', adminId: req.user._id
        });
        await user.save();

        // فصل الـ socket
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
// @desc    فك حظر جهاز المستخدم
// @access  Private/Admin
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

// @route   GET /api/users/banned-devices
// @desc    قائمة الأجهزة المحظورة
// @access  Private/Admin
router.get('/banned-devices/list', protect, adminOnly, async (req, res) => {
    try {
        const devices = await BannedDevice.find()
            .populate('bannedBy', 'name')
            .sort('-bannedAt')
            .limit(200);
        res.json({ success: true, count: devices.length, data: devices });
    } catch (error) {
        res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
    }
});

module.exports = router;
