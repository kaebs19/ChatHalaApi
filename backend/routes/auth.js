// HalaChat Dashboard - Auth Routes
// المسارات الخاصة بالتسجيل وتسجيل الدخول

const express = require('express');
const router = express.Router();
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');
const generateToken = require('../utils/generateToken');
const { protect } = require('../middleware/auth');
const { validate } = require('../middleware/validation');
const {
    registerValidation,
    loginValidation,
    updateProfileValidation,
    changePasswordValidation
} = require('../validators/user.validator');

// @route   POST /api/auth/register
// @desc    تسجيل مستخدم جديد
// @access  Public
router.post('/register', registerValidation, validate, async (req, res) => {
    try {
        const { name, email, password } = req.body;

        // التحقق من البيانات
        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: 'جميع الحقول مطلوبة'
            });
        }

        // التحقق من أن البريد غير مستخدم
        const userExists = await User.findOne({ email });
        if (userExists) {
            return res.status(400).json({
                success: false,
                message: 'البريد الإلكتروني مستخدم بالفعل'
            });
        }

        // إنشاء المستخدم
        const user = await User.create({
            name,
            email,
            password
        });

        // تسجيل النشاط
        await ActivityLog.logActivity({
            user: user._id,
            action: 'user_register',
            description: `تسجيل مستخدم جديد: ${name}`,
            targetType: 'User',
            targetId: user._id,
            targetName: name,
            requestInfo: {
                ipAddress: req.ip || req.connection.remoteAddress,
                userAgent: req.get('user-agent'),
                method: req.method,
                url: req.originalUrl
            },
            severity: 'low',
            status: 'success'
        });

        // إرجاع البيانات مع Token
        res.status(201).json({
            success: true,
            message: 'تم التسجيل بنجاح',
            data: {
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role
                },
                token: generateToken(user._id)
            }
        });

    } catch (error) {
        console.error('خطأ في التسجيل:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر',
            error: error.message
        });
    }
});

// @route   POST /api/auth/login
// @desc    تسجيل الدخول
// @access  Public
router.post('/login', loginValidation, validate, async (req, res) => {
    try {
        const { email, password } = req.body;

        // التحقق من البيانات
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'البريد الإلكتروني وكلمة المرور مطلوبة'
            });
        }

        // البحث عن المستخدم (مع كلمة المرور)
        const user = await User.findOne({ email }).select('+password');

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'البريد الإلكتروني أو كلمة المرور خاطئة'
            });
        }

        // التحقق من كلمة المرور
        const isPasswordMatch = await user.comparePassword(password);

        if (!isPasswordMatch) {
            return res.status(401).json({
                success: false,
                message: 'البريد الإلكتروني أو كلمة المرور خاطئة'
            });
        }

        // التحقق من أن الحساب مفعل
        if (!user.isActive) {
            return res.status(401).json({
                success: false,
                message: 'الحساب غير مفعل، تواصل مع الإدارة'
            });
        }

        // تحديث آخر تسجيل دخول
        user.lastLogin = new Date();
        await user.save();

        // تسجيل النشاط
        await ActivityLog.logActivity({
            user: user._id,
            action: 'user_login',
            description: `تسجيل دخول: ${user.name}`,
            targetType: 'User',
            targetId: user._id,
            targetName: user.name,
            requestInfo: {
                ipAddress: req.ip || req.connection.remoteAddress,
                userAgent: req.get('user-agent'),
                method: req.method,
                url: req.originalUrl
            },
            severity: 'low',
            status: 'success'
        });

        // إرجاع البيانات مع Token
        res.status(200).json({
            success: true,
            message: 'تم تسجيل الدخول بنجاح',
            data: {
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    lastLogin: user.lastLogin
                },
                token: generateToken(user._id)
            }
        });

    } catch (error) {
        console.error('خطأ في تسجيل الدخول:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر',
            error: error.message
        });
    }
});

// @route   GET /api/auth/me
// @desc    الحصول على بيانات المستخدم الحالي
// @access  Private
router.get('/me', protect, async (req, res) => {
    try {
        res.status(200).json({
            success: true,
            data: {
                user: req.user
            }
        });
    } catch (error) {
        console.error('خطأ في جلب البيانات:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر'
        });
    }
});

// @route   PUT /api/auth/update-profile
// @desc    تحديث الملف الشخصي
// @access  Private
router.put('/update-profile', protect, async (req, res) => {
    try {
        const { name, email } = req.body;

        const user = await User.findById(req.user.id);

        if (name) user.name = name;
        if (email) user.email = email;

        await user.save();

        res.status(200).json({
            success: true,
            message: 'تم تحديث البيانات بنجاح',
            data: {
                user
            }
        });

    } catch (error) {
        console.error('خطأ في التحديث:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر'
        });
    }
});

// @route   PUT /api/auth/change-password
// @desc    تغيير كلمة المرور
// @access  Private
router.put('/change-password', protect, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        // التحقق من البيانات
        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'كلمة المرور الحالية والجديدة مطلوبة'
            });
        }

        // التحقق من طول كلمة المرور الجديدة
        if (newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل'
            });
        }

        const user = await User.findById(req.user.id).select('+password');

        // التحقق من كلمة المرور الحالية
        const isMatch = await user.matchPassword(currentPassword);
        if (!isMatch) {
            return res.status(400).json({
                success: false,
                message: 'كلمة المرور الحالية غير صحيحة'
            });
        }

        // تحديث كلمة المرور
        user.password = newPassword;
        await user.save();

        res.status(200).json({
            success: true,
            message: 'تم تغيير كلمة المرور بنجاح'
        });

    } catch (error) {
        console.error('خطأ في تغيير كلمة المرور:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر',
            error: error.message
        });
    }
});

module.exports = router;
