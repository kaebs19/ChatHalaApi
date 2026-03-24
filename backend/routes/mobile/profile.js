// HalaChat - Mobile API: Profile Routes
// مسارات البروفايل (زيارات، توثيق، تخفي، خصوصية)

const express = require('express');
const router = express.Router();
const User = require('../../models/User');
const ProfileView = require('../../models/ProfileView');
const { protect } = require('../../middleware/auth');
const { requirePremium } = require('../../middleware/premium');
const { getFullUrl, uploadVerificationSelfie } = require('./helpers');

// ==========================================
// نظام زيارات البروفايل
// ==========================================

// @route   POST /api/mobile/profile-views
// @desc    تسجيل زيارة بروفايل
// @access  Protected
router.post('/profile-views', protect, async (req, res) => {
    try {
        const { viewedUserId } = req.body;
        const viewerId = req.user._id;

        if (!viewedUserId) {
            return res.status(400).json({ success: false, message: 'معرف المستخدم مطلوب' });
        }

        if (viewedUserId === viewerId.toString()) {
            return res.status(400).json({ success: false, message: 'لا يمكن تسجيل زيارة لنفسك' });
        }

        // التحقق من وجود المستخدم
        const viewedUser = await User.findById(viewedUserId);
        if (!viewedUser) {
            return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
        }

        // لا تسجل زيارة مكررة خلال 24 ساعة
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const existingView = await ProfileView.findOne({
            viewer: viewerId,
            viewed: viewedUserId,
            createdAt: { $gte: twentyFourHoursAgo }
        });

        if (existingView) {
            return res.json({ success: true, message: 'الزيارة مسجلة مسبقاً' });
        }

        // إنشاء زيارة جديدة
        const isHidden = req.user.stealthMode || false;
        const profileView = await ProfileView.create({
            viewer: viewerId,
            viewed: viewedUserId,
            isHidden
        });

        // إرسال Socket event في الوقت الحقيقي (فقط لو الزيارة مش مخفية)
        if (!isHidden && global.io) {
            global.io.to(`user:${viewedUserId}`).emit('profile-viewed', {
                viewer: {
                    _id: req.user._id,
                    name: req.user.name,
                    profileImage: getFullUrl(req.user.profileImage),
                    isPremium: req.user.isPremium || false,
                    isVerified: req.user.verification?.isVerified || false
                },
                createdAt: profileView.createdAt
            });
        }

        res.json({ success: true, message: 'تم تسجيل الزيارة' });
    } catch (error) {
        console.error('خطأ في تسجيل زيارة البروفايل:', error);
        res.status(500).json({ success: false, message: 'فشل في تسجيل الزيارة' });
    }
});

// @route   GET /api/mobile/profile-views
// @desc    من شاف بروفايلي
// @access  Protected
router.get('/profile-views', protect, async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);

        const totalViews = await ProfileView.countDocuments({
            viewed: req.user._id,
            isHidden: false
        });

        const isPremium = req.user.isPremium && req.user.premiumExpiresAt > new Date();

        if (isPremium) {
            // المشترك: يشوف التفاصيل
            const views = await ProfileView.find({
                viewed: req.user._id,
                isHidden: false
            })
                .populate('viewer', 'name profileImage country isOnline isPremium verification.isVerified')
                .sort({ createdAt: -1 })
                .limit(limitNum)
                .skip((pageNum - 1) * limitNum);

            res.json({
                success: true,
                data: {
                    totalViews,
                    views: views.map(v => ({
                        viewer: {
                            _id: v.viewer._id,
                            name: v.viewer.name,
                            profileImage: getFullUrl(v.viewer.profileImage),
                            country: v.viewer.country,
                            isVerified: v.viewer.verification?.isVerified || false
                        },
                        createdAt: v.createdAt
                    })),
                    page: pageNum,
                    totalPages: Math.ceil(totalViews / limitNum),
                    isPremiumRequired: false
                }
            });
        } else {
            // المجاني: عدد فقط + بيانات مخفية
            const views = await ProfileView.find({
                viewed: req.user._id,
                isHidden: false
            })
                .sort({ createdAt: -1 })
                .limit(3);

            res.json({
                success: true,
                data: {
                    totalViews,
                    views: views.map(v => ({
                        viewer: { _id: null, name: null, profileImage: null, country: null },
                        createdAt: v.createdAt
                    })),
                    page: 1,
                    totalPages: 1,
                    isPremiumRequired: true
                }
            });
        }
    } catch (error) {
        console.error('خطأ في جلب زيارات البروفايل:', error);
        res.status(500).json({ success: false, message: 'فشل في جلب الزيارات' });
    }
});

// ==========================================
// نظام التوثيق (Verification)
// ==========================================

// @route   POST /api/mobile/verification/submit
// @desc    طلب توثيق الحساب (رفع سيلفي)
// @access  Protected + Premium
router.post('/verification/submit', protect, requirePremium, uploadVerificationSelfie.single('selfie'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'صورة السيلفي مطلوبة' });
        }

        // التحقق من الحالة الحالية
        if (req.user.verification && req.user.verification.status === 'pending') {
            return res.status(400).json({ success: false, message: 'لديك طلب توثيق قيد المراجعة' });
        }

        const selfieUrl = `/uploads/verifications/${req.file.filename}`;

        await User.findByIdAndUpdate(req.user._id, {
            'verification.selfieUrl': selfieUrl,
            'verification.status': 'pending',
            'verification.submittedAt': new Date()
        });

        res.json({
            success: true,
            message: 'تم إرسال طلب التوثيق بنجاح',
            data: { status: 'pending' }
        });
    } catch (error) {
        console.error('خطأ في طلب التوثيق:', error);
        res.status(500).json({ success: false, message: 'فشل في إرسال طلب التوثيق' });
    }
});

// @route   GET /api/mobile/verification/status
// @desc    حالة التوثيق
// @access  Protected
router.get('/verification/status', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('verification');
        res.json({
            success: true,
            data: {
                isVerified: user.verification?.isVerified || false,
                status: user.verification?.status || 'none',
                submittedAt: user.verification?.submittedAt || null,
                reviewedAt: user.verification?.reviewedAt || null
            }
        });
    } catch (error) {
        console.error('خطأ في جلب حالة التوثيق:', error);
        res.status(500).json({ success: false, message: 'فشل في جلب حالة التوثيق' });
    }
});

// ==========================================
// وضع التخفي (Stealth Mode)
// ==========================================

// @route   PUT /api/mobile/users/stealth-mode
// @desc    تفعيل/تعطيل وضع التخفي
// @access  Protected + Premium
router.put('/users/stealth-mode', protect, requirePremium, async (req, res) => {
    try {
        const { enabled } = req.body;

        if (typeof enabled !== 'boolean') {
            return res.status(400).json({ success: false, message: 'القيمة مطلوبة (true/false)' });
        }

        await User.findByIdAndUpdate(req.user._id, { stealthMode: enabled });

        res.json({
            success: true,
            message: enabled ? 'تم تفعيل وضع التخفي' : 'تم تعطيل وضع التخفي',
            data: { stealthMode: enabled }
        });
    } catch (error) {
        console.error('خطأ في تغيير وضع التخفي:', error);
        res.status(500).json({ success: false, message: 'فشل في تغيير وضع التخفي' });
    }
});

// ==========================================
// إعدادات الخصوصية (Mobile)
// ==========================================

// @route   GET /api/mobile/privacy/settings
// @desc    جلب إعدادات الخصوصية الحالية
// @access  Private
router.get('/privacy/settings', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user._id)
            .select('privacySettings showDistance stealthMode');

        if (!user) {
            return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
        }

        res.json({
            success: true,
            data: {
                profileVisibility: user.privacySettings?.profileVisibility || 'public',
                showLastSeen: user.privacySettings?.showLastSeen ?? true,
                notificationSound: user.privacySettings?.notificationSound ?? true,
                showDistance: user.showDistance ?? true,
                stealthMode: user.stealthMode || false
            }
        });
    } catch (error) {
        console.error('خطأ في جلب إعدادات الخصوصية:', error);
        res.status(500).json({ success: false, message: 'حدث خطأ في الخادم' });
    }
});

// @route   PATCH /api/mobile/privacy/distance
// @desc    تفعيل/تعطيل إظهار المسافة
// @access  Private
router.patch('/privacy/distance', protect, async (req, res) => {
    try {
        const { showDistance } = req.body;

        if (typeof showDistance !== 'boolean') {
            return res.status(400).json({ success: false, message: 'القيمة مطلوبة (true/false)' });
        }

        await User.findByIdAndUpdate(req.user._id, { showDistance });

        res.json({
            success: true,
            message: showDistance ? 'تم إظهار المسافة' : 'تم إخفاء المسافة'
        });
    } catch (error) {
        console.error('خطأ في تغيير إعداد المسافة:', error);
        res.status(500).json({ success: false, message: 'فشل في تغيير الإعداد' });
    }
});

// @route   PATCH /api/mobile/privacy/stealth
// @desc    تفعيل/تعطيل وضع التخفي
// @access  Private + Premium
router.patch('/privacy/stealth', protect, requirePremium, async (req, res) => {
    try {
        const { stealthMode } = req.body;

        if (typeof stealthMode !== 'boolean') {
            return res.status(400).json({ success: false, message: 'القيمة مطلوبة (true/false)' });
        }

        await User.findByIdAndUpdate(req.user._id, { stealthMode });

        res.json({
            success: true,
            message: stealthMode ? 'تم تفعيل وضع التخفي' : 'تم تعطيل وضع التخفي'
        });
    } catch (error) {
        console.error('خطأ في تغيير وضع التخفي:', error);
        res.status(500).json({ success: false, message: 'فشل في تغيير وضع التخفي' });
    }
});

module.exports = router;
