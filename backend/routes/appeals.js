// HalaChat - Appeals Routes
// طلبات الاستئناف: تقديم من المستخدم + مراجعة من الأدمن

const express = require('express');
const router = express.Router();
const Appeal = require('../models/Appeal');
const User = require('../models/User');
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

        // منع طلبين معلّقين
        const existing = await Appeal.findOne({ user: req.user._id, status: 'pending' });
        if (existing) {
            return res.status(409).json({
                success: false,
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

        // تحويل إلى صيغة iOS: reason + adminNote
        const appeals = raw.map(a => ({
            _id: a._id,
            id: a._id,
            status: a.status,
            reason: a.message,         // iOS يتوقع reason
            message: a.message,         // للتوافق
            adminNote: a.decisionNote,  // iOS يتوقع adminNote
            decisionNote: a.decisionNote,
            suspensionType: a.suspensionType,
            createdAt: a.createdAt,
            reviewedAt: a.reviewedAt
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
            .populate('user', 'name email profileImage isActive suspendedUntil suspendReason deviceBanned nameBanned violationCount')
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

        appeal.status = 'approved';
        appeal.reviewedBy = req.user._id;
        appeal.reviewedAt = new Date();
        appeal.decisionNote = note;
        await appeal.save();

        // إشعار المستخدم
        try {
            await Notification.create({
                title: '✅ تم قبول طلب الاستئناف',
                body: 'تمت إعادة تفعيل حسابك. يرجى المحافظة على شروط الاستخدام.',
                type: 'system',
                sender: req.user._id,
                targetUsers: [user._id],
                recipients: 'specific'
            });
            await pushNotificationService.sendNotificationToUser(user._id,
                { title: '✅ تم قبول الاستئناف', body: 'تم فك الحظر عن حسابك' },
                { type: 'system' }, false);
        } catch (e) {}

        res.json({ success: true, message: 'تم قبول الطلب وفك الحظر', data: { appeal } });
    } catch (error) {
        console.error('خطأ في قبول الاستئناف:', error);
        res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
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

        appeal.status = 'rejected';
        appeal.reviewedBy = req.user._id;
        appeal.reviewedAt = new Date();
        appeal.decisionNote = note;
        await appeal.save();

        // إشعار المستخدم
        try {
            await Notification.create({
                title: '❌ تم رفض طلب الاستئناف',
                body: note || 'لم يتم قبول طلب الاستئناف. يمكنك تقديم طلب جديد لاحقاً.',
                type: 'system',
                sender: req.user._id,
                targetUsers: [appeal.user._id],
                recipients: 'specific'
            });
            await pushNotificationService.sendNotificationToUser(appeal.user._id,
                { title: '❌ تم رفض الاستئناف', body: note || 'لم يتم قبول الطلب' },
                { type: 'system' }, false);
        } catch (e) {}

        res.json({ success: true, message: 'تم رفض الطلب' });
    } catch (error) {
        console.error('خطأ في رفض الاستئناف:', error);
        res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
    }
});

module.exports = router;
