// HalaChat Dashboard - Auth Routes
// المسارات الخاصة بالتسجيل وتسجيل الدخول

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');
const generateToken = require('../utils/generateToken');
const { generateRefreshToken, verifyRefreshToken } = require('../utils/generateToken');
const sendEmail = require('../utils/sendEmail');
const { protect } = require('../middleware/auth');
const { validate } = require('../middleware/validation');
const { generateUniqueTag } = require('../utils/generateTag');
const upload = require('../config/multer');
const { optimizeImage } = require('../middleware/imageOptimizer');
const BannedWord = require('../models/BannedWord');
const {
    registerValidation,
    loginValidation,
    updateProfileValidation,
    changePasswordValidation
} = require('../validators/user.validator');

// Google Auth
const { OAuth2Client } = require('google-auth-library');
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Apple Auth
const appleSignin = require('apple-signin-auth');

// Device ban check + fingerprint
const { isDeviceBanned, buildFingerprint } = require('../utils/deviceBan');
const { isIPBanned } = require('../utils/ipBan');
const { trackUserIP } = require('../utils/trackUserIP');
const { enforceRegistrationRateLimit } = require('../utils/registrationRateLimit');
const { autoExpireRestriction } = require('../middleware/checkRestriction');

/**
 * Helper: تحديث بصمة جهاز المستخدم (تُحسب من deviceInfo + IP) + persistentDeviceId
 * تُستدعى بعد تعيين user.deviceInfo
 */
const updateUserFingerprint = (user, req) => {
    // 1) حفظ persistentDeviceId من الطلب (iOS Keychain UUID — الأدق)
    if (req.body?.persistentDeviceId) {
        user.persistentDeviceId = req.body.persistentDeviceId;
    }
    // 2) تحديث البصمة (fallback من deviceInfo + IP)
    if (user.deviceInfo && (user.deviceInfo.platform || user.deviceInfo.osVersion)) {
        const ip = req.ip || req.connection?.remoteAddress;
        const info = user.deviceInfo.toObject ? user.deviceInfo.toObject() : user.deviceInfo;
        const fp = buildFingerprint(info, ip);
        if (fp) user.deviceFingerprint = fp;
    }
    // 3) تسجيل IP (للتدقيق فقط — ليس للحظر التلقائي)
    trackUserIP(user, req);
};

/**
 * Helper: فحص حظر الجهاز من بيانات الطلب
 * يرجع true إذا كان محظوراً (بعد إرسال 403)
 */
const checkDeviceBanned = async (req, res) => {
    try {
        const ip = req.ip || req.connection?.remoteAddress;

        // 1) فحص حظر الجهاز
        const bannedDevice = await isDeviceBanned({
            deviceToken: req.body?.deviceToken,
            fcmToken: req.body?.fcmToken,
            persistentDeviceId: req.body?.persistentDeviceId,
            deviceInfo: req.body?.deviceInfo,
            ip
        });
        if (bannedDevice) {
            // جلب بيانات الحساب الأصلي المرتبط بهذا الجهاز (للعرض الشفاف للمستخدم)
            let originalAccount = null;
            try {
                if (bannedDevice.originalUserId) {
                    const origUser = await User.findById(bannedDevice.originalUserId)
                        .select('name email profileImage uniqueTag createdAt');
                    if (origUser) {
                        // إخفاء جزء من الإيميل للخصوصية: a****@example.com
                        const masked = (email) => {
                            if (!email || !email.includes('@')) return email;
                            const [local, domain] = email.split('@');
                            const visible = local.substring(0, Math.min(2, local.length));
                            return `${visible}${'•'.repeat(Math.max(3, local.length - 2))}@${domain}`;
                        };
                        originalAccount = {
                            name: origUser.name,
                            emailMasked: masked(origUser.email),
                            uniqueTag: origUser.uniqueTag,
                            profileImage: origUser.profileImage,
                            joinedAt: origUser.createdAt,
                            bannedAt: bannedDevice.createdAt,
                            banReason: bannedDevice.reason || null
                        };
                    }
                }
            } catch (e) { /* لا يوقف */ }

            res.status(403).json({
                success: false,
                message: 'تم حظر هذا الجهاز من استخدام التطبيق',
                code: 'DEVICE_BANNED',
                data: { originalAccount }
            });
            return true;
        }

        // 2) فحص حظر IP (يدوي من الأدمن)
        const bannedIP = await isIPBanned(ip);
        if (bannedIP) {
            res.status(403).json({
                success: false,
                message: 'تم حظر هذا الاتصال من استخدام التطبيق',
                code: 'IP_BANNED',
                data: { reason: bannedIP.reason, expiresAt: bannedIP.expiresAt }
            });
            return true;
        }
    } catch (e) { /* لا نوقف التسجيل بسبب خطأ فحص */ }
    return false;
};

/**
 * Helper: فحص حظر الحساب وإعادة 403 مع token ليعمل الاستئناف
 * يرجع true إذا تم إرسال الرد
 */
const checkAccountSuspended = (user, res) => {
    if (user.isActive !== false) return false;
    // التحقق من انتهاء التعليق التلقائي (تترك التفعيل للراوت الأصلي)
    if (user.suspendedUntil && new Date(user.suspendedUntil) <= new Date()) {
        return false; // سيتولى الراوت التفعيل
    }

    const isPermanent = user.suspendedUntil && (new Date(user.suspendedUntil) - new Date()) > 365 * 24 * 60 * 60 * 1000;
    const isDeviceBanned = user.deviceBanned === true;
    let remaining = '';
    if (user.suspendedUntil) {
        const diff = new Date(user.suspendedUntil) - new Date();
        const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
        const hours = Math.ceil(diff / (1000 * 60 * 60));
        remaining = days > 365 ? 'حظر دائم' : (days > 1 ? `متبقي ${days} يوم` : `متبقي ${hours} ساعة`);
    }

    res.status(403).json({
        success: false,
        message: isDeviceBanned ? 'جهاز محظور نهائياً' : (isPermanent ? 'تم حظر حسابك نهائياً' : 'الحساب معلّق'),
        code: isDeviceBanned ? 'DEVICE_BANNED' : (isPermanent ? 'ACCOUNT_BANNED_PERMANENT' : 'ACCOUNT_SUSPENDED'),
        data: {
            suspended: true,
            permanent: isPermanent,
            deviceBanned: isDeviceBanned,
            reason: user.suspendReason || 'مخالفة سياسة الاستخدام',
            suspendedUntil: user.suspendedUntil,
            remaining,
            level: user.suspensionCount || 0,
            token: generateToken(user._id),
            refreshToken: generateRefreshToken(user._id),
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                profileImage: user.profileImage,
                role: user.role,
                uniqueTag: user.uniqueTag
            }
        }
    });
    return true;
};

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

        // فحص حظر الجهاز
        if (await checkDeviceBanned(req, res)) return;

        // فحص حد إنشاء الحسابات (rate limit)
        if (await enforceRegistrationRateLimit(req, res)) return;

        // فحص الاسم ضد الكلمات المحظورة
        const nameCheck = await BannedWord.checkText(name, 'name');
        if (!nameCheck.isClean) {
            return res.status(400).json({
                success: false,
                message: 'الاسم يحتوي على كلمات غير مسموحة'
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

        // إنشاء المستخدم مع معرف فريد
        const uniqueTag = await generateUniqueTag(User);
        const user = await User.create({
            name,
            email,
            password,
            uniqueTag
        });

        // تسجيل IP + persistentDeviceId للتدقيق
        trackUserIP(user, req);
        if (req.body?.persistentDeviceId) user.persistentDeviceId = req.body.persistentDeviceId;
        await user.save();

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
                    role: user.role,
                    profileImage: user.profileImage || null,
                    uniqueTag: user.uniqueTag
                },
                token: generateToken(user._id),
                refreshToken: generateRefreshToken(user._id)
            }
        });

    } catch (error) {
        console.error('خطأ في التسجيل:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر'
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

        // فحص حظر الجهاز
        if (await checkDeviceBanned(req, res)) return;

        // البحث عن المستخدم (مع كلمة المرور)
        const user = await User.findOne({ email }).select('+password +loginAttempts +lockUntil');

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'البريد الإلكتروني أو كلمة المرور خاطئة'
            });
        }

        // التحقق من قفل الحساب
        if (user.isLocked) {
            const remainingMs = user.lockUntil - Date.now();
            const remainingMin = Math.ceil(remainingMs / 60000);
            return res.status(423).json({
                success: false,
                message: `الحساب مقفل مؤقتاً. حاول بعد ${remainingMin} دقيقة`
            });
        }

        // التحقق من كلمة المرور
        const isPasswordMatch = await user.comparePassword(password);

        if (!isPasswordMatch) {
            await user.incrementLoginAttempts();
            return res.status(401).json({
                success: false,
                message: 'البريد الإلكتروني أو كلمة المرور خاطئة'
            });
        }

        // التحقق من أن الحساب مفعل
        if (user.isActive === false) {
            // التحقق إذا انتهت مدة التعليق → إعادة التفعيل تلقائياً
            if (user.suspendedUntil && new Date(user.suspendedUntil) <= new Date()) {
                user.isActive = true;
                user.suspendedUntil = null;
                user.suspendReason = null;
                user.dailyViolationCount = 0;
                await user.save();
                // إشعار فك التعليق
                try {
                    const Notification = require('../models/Notification');
                    await Notification.create({
                        title: 'تم رفع التعليق عن حسابك',
                        body: 'مرحباً بعودتك! يرجى المحافظة على شروط الاستخدام لتجنب التعليق مرة أخرى.',
                        type: 'system',
                        targetUsers: [user._id],
                        recipients: 'specific'
                    });
                } catch (e) {}
                // يكمل تسجيل الدخول بشكل طبيعي
            } else {
                // حساب لا يزال معلّق
                let remaining = '';
                if (user.suspendedUntil) {
                    const diff = new Date(user.suspendedUntil) - new Date();
                    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
                    const hours = Math.ceil(diff / (1000 * 60 * 60));
                    if (days > 365) {
                        remaining = 'حظر دائم';
                    } else if (days > 1) {
                        remaining = `متبقي ${days} يوم`;
                    } else {
                        remaining = `متبقي ${hours} ساعة`;
                    }
                }
                const isPermanent = user.suspendedUntil && (new Date(user.suspendedUntil) - new Date()) > 365 * 24 * 60 * 60 * 1000;
                const isDeviceBanned = user.deviceBanned === true;
                return res.status(403).json({
                    success: false,
                    message: isDeviceBanned ? 'جهاز محظور نهائياً' : (isPermanent ? 'تم حظر حسابك نهائياً' : 'الحساب معلّق'),
                    code: isDeviceBanned ? 'DEVICE_BANNED' : (isPermanent ? 'ACCOUNT_BANNED_PERMANENT' : 'ACCOUNT_SUSPENDED'),
                    data: {
                        suspended: true,
                        permanent: isPermanent,
                        deviceBanned: isDeviceBanned,
                        reason: user.suspendReason || 'مخالفة سياسة الاستخدام',
                        suspendedUntil: user.suspendedUntil,
                        remaining,
                        level: user.suspensionCount || 0,
                        // توكن + بيانات حتى يقدر المستخدم يقدم استئناف
                        token: generateToken(user._id),
                        refreshToken: generateRefreshToken(user._id),
                        user: {
                            id: user._id,
                            name: user.name,
                            email: user.email,
                            profileImage: user.profileImage,
                            role: user.role,
                            uniqueTag: user.uniqueTag
                        }
                    }
                });
            }
        }

        // إعادة تعيين محاولات تسجيل الدخول
        if (user.loginAttempts > 0) {
            await user.resetLoginAttempts();
        }

        // تحديث آخر تسجيل دخول + backfill uniqueTag + تسجيل IP
        user.lastLogin = new Date();
        if (!user.uniqueTag) {
            user.uniqueTag = await generateUniqueTag(User);
        }
        trackUserIP(user, req);
        await user.save();

        // فحص انتهاء مدة التقييد تلقائياً (لا يوقف تسجيل الدخول)
        await autoExpireRestriction(user);

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
                    profileImage: user.profileImage,
                    lastLogin: user.lastLogin,
                    uniqueTag: user.uniqueTag,
                    restrictions: user.restrictions || null
                },
                token: generateToken(user._id),
                refreshToken: generateRefreshToken(user._id)
            }
        });

    } catch (error) {
        console.error('خطأ في تسجيل الدخول:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
        });
    }
});

// @route   GET /api/auth/me
// @desc    الحصول على بيانات المستخدم الحالي
// @access  Private
router.get('/me', protect, async (req, res) => {
    try {
        // Backfill uniqueTag إذا لم يكن موجود
        if (!req.user.uniqueTag) {
            req.user.uniqueTag = await generateUniqueTag(User);
            await req.user.save();
        }

        // فحص انتهاء مدة التقييد تلقائياً
        await autoExpireRestriction(req.user);

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
router.put('/update-profile', protect, updateProfileValidation, validate, async (req, res) => {
    try {
        const { name, email, profileImage, birthDate, gender, country, bio, defaultAvatar } = req.body;

        const user = await User.findById(req.user.id);

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

        // فحص الاسم ضد الكلمات المحظورة (مع تسجيل مخالفة)
        if (name && name !== user.name) {
            const nameCheck = await BannedWord.checkText(name, 'name');
            if (!nameCheck.isClean) {
                // تسجيل مخالفة + إشعار + تعليق تلقائي عند 5/يوم
                try {
                    const { recordViolation } = require('../utils/violationHelper');
                    const result = await recordViolation({
                        user,
                        type: 'banned_name',
                        reason: `محاولة استخدام اسم مخالف: "${name}" - يحتوي: ${(nameCheck.foundWords || []).join(', ')}`,
                        oldName: user.name
                    });
                    return res.status(400).json({
                        success: false,
                        message: result.autoSuspended
                            ? (result.suspendDays >= 36500 ? 'تم حظر حسابك نهائياً بسبب تكرار المخالفات' : `تم تعليق حسابك لمدة ${result.suspendDays} يوم`)
                            : 'الاسم يحتوي على كلمات غير مسموحة',
                        code: 'BANNED_NAME',
                        data: {
                            violationCount: result.totalViolations,
                            dailyViolationCount: result.dailyViolationCount,
                            dailyRemaining: result.dailyRemaining,
                            autoSuspended: result.autoSuspended,
                            suspendDays: result.suspendDays
                        }
                    });
                } catch (e) {
                    console.error('recordViolation failed for banned name:', e);
                    return res.status(400).json({
                        success: false,
                        message: 'الاسم يحتوي على كلمات غير مسموحة'
                    });
                }
            }
        }

        // تحديث الحقول الأساسية
        if (name) user.name = name;
        if (email) user.email = email;

        // تحديث حقول الملف الشخصي الجديدة
        if (profileImage !== undefined) user.profileImage = profileImage;
        if (birthDate !== undefined) user.birthDate = birthDate;
        if (gender !== undefined) user.gender = gender;
        if (country !== undefined) user.country = country;
        if (bio !== undefined) user.bio = bio;

        // دعم الصور الافتراضية (avatar_1 إلى avatar_14)
        if (defaultAvatar) {
            // التحقق من صحة اسم الصورة الافتراضية
            const validAvatars = Array.from({ length: 14 }, (_, i) => `avatar_${i + 1}`);
            if (validAvatars.includes(defaultAvatar)) {
                user.profileImage = `/uploads/defaults/${defaultAvatar}.jpg`;
            }
        }

        await user.save();

        // تسجيل النشاط
        await ActivityLog.logActivity({
            user: user._id,
            action: 'profile_update',
            description: `تحديث الملف الشخصي: ${user.name}`,
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
            message: 'خطأ في السيرفر',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
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
        const isMatch = await user.comparePassword(currentPassword);
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
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
        });
    }
});

// @route   POST /api/auth/forgot-password
// @desc    طلب إعادة تعيين كلمة المرور (إرسال رمز التحقق)
// @access  Public
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;

        // التحقق من البيانات
        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'البريد الإلكتروني مطلوب'
            });
        }

        // البحث عن المستخدم
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'لا يوجد مستخدم بهذا البريد الإلكتروني'
            });
        }

        // توليد رمز إعادة التعيين
        const resetToken = user.generateResetToken();
        await user.save();

        // إرسال البريد الإلكتروني
        const message = `
            <div dir="rtl" style="font-family: Arial, sans-serif; padding: 20px; background-color: #f4f4f4;">
                <div style="max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                    <h2 style="color: #333; text-align: center;">إعادة تعيين كلمة المرور</h2>
                    <p style="color: #666; font-size: 16px;">مرحباً ${user.name},</p>
                    <p style="color: #666; font-size: 16px;">لقد تلقينا طلباً لإعادة تعيين كلمة المرور الخاصة بحسابك.</p>
                    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; text-align: center; margin: 20px 0;">
                        <p style="color: #666; margin-bottom: 10px;">رمز التحقق الخاص بك:</p>
                        <h1 style="color: #007bff; font-size: 36px; letter-spacing: 5px; margin: 10px 0;">${resetToken}</h1>
                    </div>
                    <p style="color: #666; font-size: 14px;">هذا الرمز صالح لمدة 10 دقائق فقط.</p>
                    <p style="color: #999; font-size: 12px; margin-top: 30px; text-align: center;">إذا لم تطلب إعادة تعيين كلمة المرور، يرجى تجاهل هذه الرسالة.</p>
                </div>
            </div>
        `;

        await sendEmail({
            email: user.email,
            subject: 'إعادة تعيين كلمة المرور - HalaChat',
            message: `رمز إعادة تعيين كلمة المرور الخاص بك هو: ${resetToken}\n\nهذا الرمز صالح لمدة 10 دقائق.`,
            html: message
        });

        res.status(200).json({
            success: true,
            message: 'تم إرسال رمز إعادة تعيين كلمة المرور إلى بريدك الإلكتروني'
        });

    } catch (error) {
        console.error('خطأ في طلب إعادة تعيين كلمة المرور:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في إرسال البريد الإلكتروني',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
        });
    }
});

// @route   POST /api/auth/reset-password
// @desc    إعادة تعيين كلمة المرور باستخدام الرمز
// @access  Public
router.post('/reset-password', async (req, res) => {
    try {
        const { email, resetToken, newPassword } = req.body;

        // التحقق من البيانات
        if (!email || !resetToken || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'جميع الحقول مطلوبة'
            });
        }

        // التحقق من طول كلمة المرور
        if (newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل'
            });
        }

        // تشفير الرمز للمقارنة
        const hashedToken = crypto
            .createHash('sha256')
            .update(resetToken)
            .digest('hex');

        // البحث عن المستخدم بالبريد والرمز والتأكد من صلاحية الرمز
        const user = await User.findOne({
            email,
            resetPasswordToken: hashedToken,
            resetPasswordExpire: { $gt: Date.now() }
        }).select('+resetPasswordToken +resetPasswordExpire');

        if (!user) {
            return res.status(400).json({
                success: false,
                message: 'رمز التحقق غير صحيح أو منتهي الصلاحية'
            });
        }

        // تحديث كلمة المرور
        user.password = newPassword;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpire = undefined;
        await user.save();

        // تسجيل النشاط
        await ActivityLog.logActivity({
            user: user._id,
            action: 'password_reset',
            description: `إعادة تعيين كلمة المرور: ${user.name}`,
            targetType: 'User',
            targetId: user._id,
            targetName: user.name,
            requestInfo: {
                ipAddress: req.ip || req.connection.remoteAddress,
                userAgent: req.get('user-agent'),
                method: req.method,
                url: req.originalUrl
            },
            severity: 'medium',
            status: 'success'
        });

        res.status(200).json({
            success: true,
            message: 'تم إعادة تعيين كلمة المرور بنجاح'
        });

    } catch (error) {
        console.error('خطأ في إعادة تعيين كلمة المرور:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
        });
    }
});

// @route   PUT /api/auth/upload-profile-image
// @desc    رفع صورة الملف الشخصي
// @access  Private
router.put('/upload-profile-image', protect, upload.single('profileImage'), optimizeImage({ maxWidth: 800, maxHeight: 800, quality: 85 }), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'لم يتم رفع أي صورة'
            });
        }

        const user = await User.findById(req.user.id);

        if (!user) {
            // حذف الملف المرفوع إذا لم يتم إيجاد المستخدم
            fs.unlinkSync(req.file.path);
            return res.status(404).json({
                success: false,
                message: 'المستخدم غير موجود'
            });
        }

        // حذف الصورة القديمة إذا كانت موجودة
        if (user.profileImage) {
            const oldImagePath = path.join(__dirname, '..', user.profileImage);
            if (fs.existsSync(oldImagePath)) {
                fs.unlinkSync(oldImagePath);
            }
        }

        // تحديث مسار الصورة
        const imagePath = '/uploads/profile-images/' + req.file.filename;
        user.profileImage = imagePath;
        await user.save();

        // تسجيل النشاط
        await ActivityLog.logActivity({
            user: user._id,
            action: 'profile_image_upload',
            description: `رفع صورة الملف الشخصي: ${user.name}`,
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

        res.status(200).json({
            success: true,
            message: 'تم رفع الصورة بنجاح',
            data: {
                profileImage: imagePath,
                user
            }
        });

    } catch (error) {
        // حذف الملف في حالة حدوث خطأ
        if (req.file) {
            fs.unlinkSync(req.file.path);
        }

        console.error('خطأ في رفع الصورة:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'خطأ في السيرفر'
        });
    }
});

// @route   DELETE /api/auth/delete-account
// @desc    حذف حساب المستخدم
// @access  Private
router.delete('/delete-account', protect, async (req, res) => {
    try {
        const { password, confirmDelete } = req.body;

        const user = await User.findById(req.user.id).select('+password');

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'المستخدم غير موجود'
            });
        }

        // التحقق حسب نوع التسجيل
        if (user.authProvider === 'app') {
            // مستخدم عادي: يحتاج كلمة مرور
            if (!password) {
                return res.status(400).json({
                    success: false,
                    message: 'كلمة المرور مطلوبة لتأكيد حذف الحساب'
                });
            }
            const isMatch = await user.comparePassword(password);
            if (!isMatch) {
                return res.status(401).json({
                    success: false,
                    message: 'كلمة المرور غير صحيحة'
                });
            }
        } else {
            // مستخدم Google/Apple: يحتاج تأكيد صريح
            if (confirmDelete !== true) {
                return res.status(400).json({
                    success: false,
                    message: 'يجب تأكيد حذف الحساب عبر إرسال confirmDelete: true'
                });
            }
        }

        // حذف صورة الملف الشخصي إذا كانت موجودة
        if (user.profileImage) {
            const imagePath = path.join(__dirname, '..', user.profileImage);
            if (fs.existsSync(imagePath)) {
                fs.unlinkSync(imagePath);
            }
        }

        // تسجيل النشاط قبل الحذف
        await ActivityLog.logActivity({
            user: user._id,
            action: 'account_deleted',
            description: `حذف الحساب: ${user.name}`,
            targetType: 'User',
            targetId: user._id,
            targetName: user.name,
            requestInfo: {
                ipAddress: req.ip || req.connection.remoteAddress,
                userAgent: req.get('user-agent'),
                method: req.method,
                url: req.originalUrl
            },
            severity: 'high',
            status: 'success'
        });

        // حذف المستخدم
        await user.deleteOne();

        res.status(200).json({
            success: true,
            message: 'تم حذف الحساب بنجاح'
        });

    } catch (error) {
        console.error('خطأ في حذف الحساب:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
        });
    }
});

// @route   POST /api/auth/google
// @desc    تسجيل/دخول عبر Google
// @access  Public
router.post('/google', async (req, res) => {
    try {
        const { idToken, deviceToken, deviceInfo } = req.body;

        if (!idToken) {
            return res.status(400).json({
                success: false,
                message: 'Google ID Token مطلوب'
            });
        }

        // فحص حظر الجهاز
        if (await checkDeviceBanned(req, res)) return;

        // التحقق من Google ID Token
        let payload;
        try {
            const ticket = await googleClient.verifyIdToken({
                idToken,
                audience: process.env.GOOGLE_CLIENT_ID
            });
            payload = ticket.getPayload();
        } catch (error) {
            console.error('خطأ في التحقق من Google Token:', error);
            return res.status(401).json({
                success: false,
                message: 'Google Token غير صالح'
            });
        }

        const { sub: googleId, email, name, picture } = payload;

        // البحث عن المستخدم أو إنشاؤه
        let user = await User.findOne({
            $or: [
                { googleId },
                { email }
            ]
        });

        let isNewUser = false;

        if (user) {
            // فحص حظر الحساب قبل إكمال الدخول
            if (checkAccountSuspended(user, res)) return;

            // تحديث معلومات Google إذا لم تكن موجودة
            if (!user.googleId) {
                user.googleId = googleId;
                user.authProvider = 'google';
            }
            // تحديث الصورة إذا لم تكن موجودة
            if (!user.profileImage && picture) {
                user.profileImage = picture;
            }
        } else {
            // فحص حد إنشاء الحسابات (rate limit) — فقط عند إنشاء حساب جديد
            if (await enforceRegistrationRateLimit(req, res)) return;

            // إنشاء مستخدم جديد
            isNewUser = true;
            user = new User({
                name,
                email,
                googleId,
                authProvider: 'google',
                profileImage: picture || null,
                isActive: true
            });
        }

        // تحديث Device Token و معلومات الجهاز + backfill uniqueTag
        if (deviceToken) user.deviceToken = deviceToken;
        if (deviceInfo) user.deviceInfo = deviceInfo;
        updateUserFingerprint(user, req);
        user.lastLogin = new Date();
        if (!user.uniqueTag) {
            user.uniqueTag = await generateUniqueTag(User);
        }

        await user.save();

        // تسجيل النشاط
        await ActivityLog.logActivity({
            user: user._id,
            action: isNewUser ? 'user_register_google' : 'user_login_google',
            description: isNewUser ? `تسجيل مستخدم جديد عبر Google: ${name}` : `تسجيل دخول عبر Google: ${name}`,
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

        res.status(200).json({
            success: true,
            message: isNewUser ? 'تم التسجيل بنجاح عبر Google' : 'تم تسجيل الدخول بنجاح عبر Google',
            data: {
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    profileImage: user.profileImage,
                    authProvider: user.authProvider,
                    lastLogin: user.lastLogin,
                    uniqueTag: user.uniqueTag
                },
                token: generateToken(user._id),
                refreshToken: generateRefreshToken(user._id),
                isNewUser
            }
        });

    } catch (error) {
        console.error('خطأ في تسجيل الدخول عبر Google:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
        });
    }
});

// @route   POST /api/auth/apple
// @desc    تسجيل/دخول عبر Apple
// @access  Public
router.post('/apple', async (req, res) => {
    try {
        const { identityToken, authorizationCode, fullName, email: appleEmail, deviceToken, deviceInfo } = req.body;

        if (!identityToken) {
            return res.status(400).json({
                success: false,
                message: 'Apple Identity Token مطلوب'
            });
        }

        // فحص حظر الجهاز
        if (await checkDeviceBanned(req, res)) return;

        // التحقق من Apple Identity Token
        let applePayload;
        try {
            applePayload = await appleSignin.verifyIdToken(identityToken, {
                audience: process.env.APPLE_CLIENT_ID || 'com.alsaplel.octadevtn.HalaChat',
                ignoreExpiration: false
            });
        } catch (error) {
            console.error('خطأ في التحقق من Apple Token:', error);
            return res.status(401).json({
                success: false,
                message: 'Apple Token غير صالح'
            });
        }

        const appleId = applePayload.sub;
        const email = appleEmail || applePayload.email;

        // البحث عن المستخدم
        let user = await User.findOne({
            $or: [
                { appleId },
                ...(email ? [{ email }] : [])
            ]
        });

        let isNewUser = false;

        // استخراج الاسم من Apple (إذا متوفر)
        let appleName = null;
        if (fullName) {
            const firstName = fullName.givenName || '';
            const lastName = fullName.familyName || '';
            const combined = `${firstName} ${lastName}`.trim();
            if (combined) appleName = combined;
        }

        if (user) {
            // فحص حظر الحساب قبل إكمال الدخول
            if (checkAccountSuspended(user, res)) return;

            // تحديث معلومات Apple إذا لم تكن موجودة
            if (!user.appleId) {
                user.appleId = appleId;
                user.authProvider = 'apple';
            }
            // تحديث الاسم إذا كان "مستخدم Apple" وتوفر اسم حقيقي
            if (appleName && (user.name === 'مستخدم Apple' || user.name === 'Apple User')) {
                user.name = appleName;
            }
        } else {
            // فحص حد إنشاء الحسابات (rate limit) — فقط عند إنشاء حساب جديد
            if (await enforceRegistrationRateLimit(req, res)) return;

            // إنشاء مستخدم جديد
            isNewUser = true;

            user = new User({
                name: appleName || 'مستخدم Apple',
                email: email || `apple_${appleId}@private.appleid.com`,
                appleId,
                authProvider: 'apple',
                isActive: true
            });
        }

        // تحديث Device Token و معلومات الجهاز + backfill uniqueTag
        if (deviceToken) user.deviceToken = deviceToken;
        if (deviceInfo) user.deviceInfo = deviceInfo;
        updateUserFingerprint(user, req);
        user.lastLogin = new Date();
        if (!user.uniqueTag) {
            user.uniqueTag = await generateUniqueTag(User);
        }

        await user.save();

        // تسجيل النشاط
        await ActivityLog.logActivity({
            user: user._id,
            action: isNewUser ? 'user_register_apple' : 'user_login_apple',
            description: isNewUser ? `تسجيل مستخدم جديد عبر Apple: ${user.name}` : `تسجيل دخول عبر Apple: ${user.name}`,
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

        res.status(200).json({
            success: true,
            message: isNewUser ? 'تم التسجيل بنجاح عبر Apple' : 'تم تسجيل الدخول بنجاح عبر Apple',
            data: {
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    profileImage: user.profileImage,
                    authProvider: user.authProvider,
                    lastLogin: user.lastLogin,
                    uniqueTag: user.uniqueTag
                },
                token: generateToken(user._id),
                refreshToken: generateRefreshToken(user._id),
                isNewUser
            }
        });

    } catch (error) {
        console.error('خطأ في تسجيل الدخول عبر Apple:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
        });
    }
});

// @route   PUT /api/auth/device-token
// @desc    تحديث Device Token للإشعارات
// @access  Private
router.put('/device-token', protect, async (req, res) => {
    try {
        const { deviceToken, deviceInfo } = req.body;

        if (!deviceToken) {
            return res.status(400).json({
                success: false,
                message: 'Device Token مطلوب'
            });
        }

        const user = await User.findById(req.user.id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'المستخدم غير موجود'
            });
        }

        user.deviceToken = deviceToken;
        if (deviceInfo) user.deviceInfo = deviceInfo;
        updateUserFingerprint(user, req);
        await user.save();

        res.status(200).json({
            success: true,
            message: 'تم تحديث Device Token بنجاح'
        });

    } catch (error) {
        console.error('خطأ في تحديث Device Token:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
        });
    }
});

// @route   POST /api/auth/refresh-token
// @desc    تجديد Access Token باستخدام Refresh Token
// @access  Public
router.post('/refresh-token', async (req, res) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(400).json({
                success: false,
                message: 'Refresh Token مطلوب'
            });
        }

        // التحقق من Refresh Token
        let decoded;
        try {
            decoded = verifyRefreshToken(refreshToken);
        } catch (err) {
            return res.status(401).json({
                success: false,
                message: 'Refresh Token غير صالح أو منتهي الصلاحية'
            });
        }

        if (decoded.type !== 'refresh') {
            return res.status(401).json({
                success: false,
                message: 'نوع التوكن غير صحيح'
            });
        }

        // التحقق من المستخدم
        const user = await User.findById(decoded.id);
        if (!user || !user.isActive) {
            return res.status(401).json({
                success: false,
                message: 'المستخدم غير موجود أو غير مفعل'
            });
        }

        // توليد توكنات جديدة
        res.status(200).json({
            success: true,
            message: 'تم تجديد التوكن بنجاح',
            data: {
                token: generateToken(user._id),
                refreshToken: generateRefreshToken(user._id)
            }
        });

    } catch (error) {
        console.error('خطأ في تجديد التوكن:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر'
        });
    }
});

module.exports = router;
