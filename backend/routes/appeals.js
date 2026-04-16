// HalaChat - Appeals Routes
// طلبات الاستئناف: تقديم من المستخدم + مراجعة من الأدمن

const express = require('express');
const router = express.Router();
const Appeal = require('../models/Appeal');
const User = require('../models/User');
const Message = require('../models/Message');
const Notification = require('../models/Notification');
const BannedDevice = require('../models/BannedDevice');
const pushNotificationService = require('../services/pushNotificationService');
const { adminOnly } = require('../middleware/auth');

// middleware خاص للاستئناف — يسمح بدخول المستخدم حتى لو معلّق (لأنه يحتاج يقدم طلب)
const jwt = require('jsonwebtoken');
const protectEvenSuspended = async (req, res, next) => {
    try {
        const auth = req.headers.authorization;
        if (!auth || !auth.startsWith('Bearer')) {
            return res.status(401).json({ success: false, message: 'غير مصرح' });
        }
        const token = auth.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = await User.findById(decoded.id).select('-password');
        if (!req.user) return res.status(401).json({ success: false, message: 'المستخدم غير موجود' });
        next();
    } catch (e) {
        return res.status(401).json({ success: false, message: 'توكن غير صالح' });
    }
};

// @route   POST /api/appeals  و  POST /api/appeals/submit
// @desc    تقديم طلب استئناف (للمستخدم المحظور)
// @access  Private (يعمل حتى لو الحساب معلّق)
const submitHandler = async (req, res) => {
    try {
        // دعم كلا المفتاحين: reason (iOS) و message
        const text = (req.body.reason || req.body.message || '').toString();
        if (!text || text.trim().length < 10) {
            return res.status(400).json({
                success: false,
                message: 'الرجاء كتابة سبب الاستئناف (10 أحرف على الأقل)'
            });
        }
        const message = text;

        // لا يُقبل إلا من المعلّقين/المحظورين
        const isSuspended = !req.user.isActive || req.user.suspendedUntil;
        if (!isSuspended && !req.user.deviceBanned && !req.user.nameBanned) {
            return res.status(400).json({
                success: false,
                message: 'حسابك نشط، لا حاجة لتقديم استئناف'
            });
        }

        // منع طلبين معلّقين — نرجع 200 مع success:false ليظهر في UI
        const existing = await Appeal.findOne({ user: req.user._id, status: 'pending' });
        if (existing) {
            return res.status(200).json({
                success: false,
                code: 'APPEAL_ALREADY_PENDING',
                message: 'لديك طلب استئناف معلّق بالفعل. يرجى انتظار الرد.',
                data: { appealId: existing._id, submittedAt: existing.createdAt }
            });
        }

        // تحديد نوع الحظر
        let suspensionType = 'temporary';
        if (req.user.deviceBanned) suspensionType = 'device';
        else if (req.user.suspendedUntil) {
            const days = (new Date(req.user.suspendedUntil) - new Date()) / (1000 * 60 * 60 * 24);
            suspensionType = days > 365 ? 'permanent' : 'temporary';
        } else if (req.user.nameBanned) suspensionType = 'name';

        const appeal = await Appeal.create({
            user: req.user._id,
            message: message.trim(),
            suspensionType,
            suspendReasonSnapshot: req.user.suspendReason || null
        });

        res.status(201).json({
            success: true,
            message: 'تم تقديم طلب الاستئناف بنجاح. سيتم الرد خلال 24-48 ساعة.',
            data: { appealId: appeal._id }
        });
    } catch (error) {
        console.error('خطأ في تقديم الاستئناف:', error);
        res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
    }
};
router.post('/', protectEvenSuspended, submitHandler);        // متوافق مع iOS
router.post('/submit', protectEvenSuspended, submitHandler);  // احتياطي

// @route   GET /api/appeals/my
// @desc    طلبات الاستئناف الخاصة بالمستخدم الحالي (صيغة متوافقة مع iOS)
// @access  Private
router.get('/my', protectEvenSuspended, async (req, res) => {
    try {
        const raw = await Appeal.find({ user: req.user._id })
            .sort('-createdAt')
            .limit(10)
            .lean();

        // تحويل إلى صيغة iOS: reason + adminNote + thread
        const appeals = raw.map(a => ({
            _id: a._id,
            id: a._id,
            status: a.status,
            reason: a.message,
            message: a.message,
            adminNote: a.decisionNote,
            decisionNote: a.decisionNote,
            suspensionType: a.suspensionType,
            createdAt: a.createdAt,
            reviewedAt: a.reviewedAt,
            thread: a.thread || [],
            unreadByUser: a.unreadByUser || 0,
            lastMessageAt: a.lastMessageAt
        }));

        res.json({
            success: true,
            count: appeals.length,
            data: { appeals }  // iOS يتوقع data.appeals
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
    }
});

// @route   GET /api/appeals/my-violations
// @desc    سجل مخالفات/إيقافات المستخدم الحالي (للعرض في SuspendedAccountView)
// @access  Private (يعمل حتى لو معلّق)
router.get('/my-violations', protectEvenSuspended, async (req, res) => {
    try {
        const user = await User.findById(req.user._id)
            .select('warnings violationCount suspensionCount')
            .lean();
        if (!user) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });

        // فلترة: فقط إجراءات الإيقاف (لا التحذيرات العادية)
        const suspensionActions = ['suspend', 'auto_suspend', 'permanent_ban', 'device_ban'];
        const suspensions = (user.warnings || [])
            .filter(w => suspensionActions.includes(w.action))
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .map(w => ({
                reason: w.reason,
                action: w.action,
                date: w.date
            }));

        res.json({
            success: true,
            data: {
                suspensionCount: user.suspensionCount || suspensions.length,
                violationCount: user.violationCount || 0,
                suspensions
            }
        });
    } catch (error) {
        console.error('خطأ في سجل المخالفات:', error);
        res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
    }
});

// ============================================
// Admin Routes
// ============================================

const { protect } = require('../middleware/auth');

// @route   GET /api/appeals
// @desc    قائمة جميع طلبات الاستئناف (أدمن)
// @access  Private/Admin
router.get('/', protect, adminOnly, async (req, res) => {
    try {
        const { status = 'pending', page = 1, limit = 20 } = req.query;
        const filter = status === 'all' ? {} : { status };

        const total = await Appeal.countDocuments(filter);
        const appeals = await Appeal.find(filter)
            .populate('user', 'name email profileImage isActive suspendedUntil suspendReason deviceBanned nameBanned violationCount uniqueTag')
            .populate('reviewedBy', 'name')
            .sort('-createdAt')
            .skip((page - 1) * limit)
            .limit(parseInt(limit))
            .lean();

        const pendingCount = await Appeal.countDocuments({ status: 'pending' });

        res.json({
            success: true,
            count: appeals.length,
            total,
            pendingCount,
            currentPage: parseInt(page),
            totalPages: Math.ceil(total / limit),
            data: appeals
        });
    } catch (error) {
        console.error('خطأ في جلب الاستئنافات:', error);
        res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
    }
});

// @route   PUT /api/appeals/:id/approve
// @desc    قبول طلب استئناف وفك الحظر تلقائياً
// @access  Private/Admin
router.put('/:id/approve', protect, adminOnly, async (req, res) => {
    try {
        const { note = '' } = req.body;
        const appeal = await Appeal.findById(req.params.id);
        if (!appeal) return res.status(404).json({ success: false, message: 'الطلب غير موجود' });
        if (appeal.status !== 'pending') {
            return res.status(400).json({ success: false, message: 'تم الرد على هذا الطلب بالفعل' });
        }

        const user = await User.findById(appeal.user);
        if (!user) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });

        // فك الحظر/التعليق حسب النوع
        user.isActive = true;
        user.suspendedUntil = null;
        user.suspendReason = null;
        user.dailyViolationCount = 0;

        if (appeal.suspensionType === 'device') {
            user.deviceBanned = false;
            user.deviceBannedAt = null;
            // حذف الجهاز من قائمة المحظورين
            await BannedDevice.deleteMany({ originalUserId: user._id });
        }

        const appealSnippet = (appeal.message || '').substring(0, 100);
        user.warnings.push({
            reason: `قبول استئناف: ${note || appealSnippet || 'بدون ملاحظة'}`,
            action: 'unban',
            adminId: req.user._id
        });

        await user.save();

        // استخدام update بدل save لتجنب فشل التحقق على الطلبات القديمة
        await Appeal.findByIdAndUpdate(appeal._id, {
            status: 'approved',
            reviewedBy: req.user._id,
            reviewedAt: new Date(),
            decisionNote: note
        }, { runValidators: false });

        // إشعار المستخدم (مع ملاحظة الأدمن إن وُجدت)
        try {
            const baseBody = 'تمت إعادة تفعيل حسابك. يرجى المحافظة على شروط الاستخدام.';
            const fullBody = note && note.trim()
                ? `${baseBody}\n\n📝 ملاحظة الإدارة:\n${note.trim()}`
                : baseBody;
            await Notification.create({
                title: '✅ تم قبول طلب الاستئناف',
                body: fullBody,
                type: 'system',
                sender: req.user._id,
                targetUsers: [user._id],
                recipients: 'specific'
            });
            await pushNotificationService.sendNotificationToUser(user._id,
                { title: '✅ تم قبول الاستئناف', body: note ? `ملاحظة: ${note.substring(0,100)}` : 'تم فك الحظر عن حسابك' },
                { type: 'system' }, false);
        } catch (e) {}

        res.json({ success: true, message: 'تم قبول الطلب وفك الحظر', data: { appeal } });
    } catch (error) {
        console.error('خطأ في قبول الاستئناف:', error);
        console.error('Stack:', error.stack);
        console.error('Appeal ID:', req.params.id);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر',
            error: error.message,
            ...(process.env.NODE_ENV !== 'production' && { stack: error.stack })
        });
    }
});

// @route   PUT /api/appeals/:id/reject
// @desc    رفض طلب استئناف
// @access  Private/Admin
router.put('/:id/reject', protect, adminOnly, async (req, res) => {
    try {
        const { note = '' } = req.body;
        const appeal = await Appeal.findById(req.params.id).populate('user', 'name');
        if (!appeal) return res.status(404).json({ success: false, message: 'الطلب غير موجود' });
        if (appeal.status !== 'pending') {
            return res.status(400).json({ success: false, message: 'تم الرد على هذا الطلب بالفعل' });
        }

        await Appeal.findByIdAndUpdate(appeal._id, {
            status: 'rejected',
            reviewedBy: req.user._id,
            reviewedAt: new Date(),
            decisionNote: note
        }, { runValidators: false });

        // إشعار المستخدم (مع ملاحظة الأدمن إن وُجدت)
        try {
            const bodyWithNote = note && note.trim()
                ? `لم يتم قبول طلب الاستئناف.\n\n📝 سبب الرفض:\n${note.trim()}\n\nيمكنك تقديم طلب جديد لاحقاً.`
                : 'لم يتم قبول طلب الاستئناف. يمكنك تقديم طلب جديد لاحقاً.';
            await Notification.create({
                title: '❌ تم رفض طلب الاستئناف',
                body: bodyWithNote,
                type: 'system',
                sender: req.user._id,
                targetUsers: [appeal.user._id],
                recipients: 'specific'
            });
            await pushNotificationService.sendNotificationToUser(appeal.user._id,
                { title: '❌ تم رفض الاستئناف', body: note ? `سبب الرفض: ${note.substring(0,100)}` : 'لم يتم قبول الطلب' },
                { type: 'system' }, false);
        } catch (e) {}

        res.json({ success: true, message: 'تم رفض الطلب' });
    } catch (error) {
        console.error('خطأ في رفض الاستئناف:', error);
        res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
    }
});

// @route   POST /api/appeals/:id/message
// @desc    إضافة رسالة في محادثة الاستئناف (من المستخدم أو الأدمن)
// @access  Private
router.post('/:id/message', protectEvenSuspended, async (req, res) => {
    try {
        const { message } = req.body;
        if (!message || message.trim().length < 1) {
            return res.status(400).json({ success: false, message: 'الرسالة فارغة' });
        }

        const appeal = await Appeal.findById(req.params.id);
        if (!appeal) return res.status(404).json({ success: false, message: 'الطلب غير موجود' });

        // من يحق له الإرسال
        const isAdmin = req.user.role === 'admin';
        const isOwner = appeal.user.toString() === req.user._id.toString();
        if (!isAdmin && !isOwner) {
            return res.status(403).json({ success: false, message: 'غير مصرح' });
        }

        const senderType = isAdmin ? 'admin' : 'user';
        const entry = {
            senderType,
            senderId: req.user._id,
            senderName: req.user.name,
            message: message.trim(),
            createdAt: new Date(),
            readByUser: senderType === 'user',
            readByAdmin: senderType === 'admin'
        };

        await Appeal.findByIdAndUpdate(appeal._id, {
            $push: { thread: entry },
            lastMessageAt: new Date(),
            $inc: senderType === 'admin' ? { unreadByUser: 1 } : { unreadByAdmin: 1 }
        }, { runValidators: false });

        // إشعار الطرف الآخر
        try {
            if (senderType === 'admin') {
                // 1) إشعار DB
                await Notification.create({
                    title: '💬 رسالة من الإدارة',
                    body: message.trim().substring(0, 200),
                    type: 'system',
                    sender: req.user._id,
                    targetUsers: [appeal.user],
                    recipients: 'specific'
                });
                // 2) Push notification (FCM/APNs) — إذا التطبيق مغلق أو في الخلفية
                await pushNotificationService.sendNotificationToUser(appeal.user,
                    { title: '💬 رسالة من الإدارة', body: message.trim().substring(0, 100) },
                    {
                        type: 'appeal_message',
                        appealId: String(appeal._id),
                        adminName: req.user.name
                    }, false);
                // 3) Socket event فوري — إذا التطبيق مفتوح
                if (global.io) {
                    global.io.to(`user:${appeal.user}`).emit('appeal-admin-reply', {
                        appealId: String(appeal._id),
                        message: entry.message,
                        senderName: entry.senderName,
                        createdAt: entry.createdAt
                    });
                    global.io.to(`user:${appeal.user}`).emit('notification', {
                        title: '💬 رسالة من الإدارة',
                        body: message.trim().substring(0, 100),
                        type: 'appeal_message'
                    });
                }
            } else {
                // إشعار للأدمن عبر socket (كل الأدمن)
                if (global.io) {
                    global.io.emit('appeal-message', {
                        appealId: appeal._id,
                        userId: appeal.user,
                        senderName: req.user.name,
                        preview: message.trim().substring(0, 100)
                    });
                }
            }
        } catch (e) { console.error('notify error', e.message); }

        res.json({ success: true, message: 'تم الإرسال', data: { entry } });
    } catch (error) {
        console.error('خطأ في إرسال الرسالة:', error);
        res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
    }
});

// @route   PUT /api/appeals/:id/mark-read
// @desc    تحديد رسائل الـ thread كمقروءة (للطرف الحالي)
// @access  Private
router.put('/:id/mark-read', protectEvenSuspended, async (req, res) => {
    try {
        const appeal = await Appeal.findById(req.params.id);
        if (!appeal) return res.status(404).json({ success: false, message: 'الطلب غير موجود' });
        const isAdmin = req.user.role === 'admin';
        const isOwner = appeal.user.toString() === req.user._id.toString();
        if (!isAdmin && !isOwner) return res.status(403).json({ success: false, message: 'غير مصرح' });

        const field = isAdmin ? 'readByAdmin' : 'readByUser';
        const counterField = isAdmin ? 'unreadByAdmin' : 'unreadByUser';

        await Appeal.updateOne(
            { _id: appeal._id },
            {
                $set: {
                    [`thread.$[].${field}`]: true,
                    [counterField]: 0
                }
            },
            { runValidators: false }
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
    }
});

// @route   GET /api/appeals/:id/details
// @desc    تفاصيل كاملة لطلب استئناف (للأدمن): مخالفات المستخدم + سجل + محادثة
// @access  Private/Admin
router.get('/:id/details', protect, adminOnly, async (req, res) => {
    try {
        const appeal = await Appeal.findById(req.params.id)
            .populate('user', 'name email profileImage isActive suspendedUntil suspendReason deviceBanned nameBanned violationCount suspensionCount warnings bannedNamesHistory createdAt lastLogin')
            .populate('reviewedBy', 'name')
            .populate('thread.senderId', 'name profileImage role')
            .lean();

        if (!appeal) return res.status(404).json({ success: false, message: 'الطلب غير موجود' });

        // تحديد كمقروء من الأدمن
        await Appeal.updateOne(
            { _id: appeal._id },
            { $set: { 'thread.$[].readByAdmin': true, unreadByAdmin: 0 } },
            { runValidators: false }
        );

        // عدد الاستئنافات السابقة
        const totalAppeals = await Appeal.countDocuments({ user: appeal.user._id });
        const approvedAppeals = await Appeal.countDocuments({ user: appeal.user._id, status: 'approved' });
        const rejectedAppeals = await Appeal.countDocuments({ user: appeal.user._id, status: 'rejected' });

        // عدد الرسائل المخالفة
        const flaggedMessagesCount = await Message.countDocuments({ sender: appeal.user._id, hasBannedWords: true });

        res.json({
            success: true,
            data: {
                appeal,
                stats: {
                    totalAppeals,
                    approvedAppeals,
                    rejectedAppeals,
                    flaggedMessagesCount
                }
            }
        });
    } catch (error) {
        console.error('خطأ في التفاصيل:', error);
        res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
    }
});

// @route   DELETE /api/appeals/:id
// @desc    حذف طلب استئناف (يسمح للمستخدم بتقديم طلب جديد)
// @access  Private/Admin
router.delete('/:id', protect, adminOnly, async (req, res) => {
    try {
        const appeal = await Appeal.findByIdAndDelete(req.params.id);
        if (!appeal) return res.status(404).json({ success: false, message: 'الطلب غير موجود' });
        res.json({ success: true, message: 'تم حذف الطلب' });
    } catch (error) {
        console.error('خطأ في حذف الاستئناف:', error);
        res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
    }
});

module.exports = router;
