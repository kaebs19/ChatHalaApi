// HalaChat Dashboard - Authentication Middleware
// للتحقق من صلاحية Token

const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { get: cacheGet, set: cacheSet, del: cacheDel } = require('../utils/cache');

// ═══════════════════════════════════════════════════════════════════
// كاش قصير لبيانات المستخدم في المصادقة
// ═══════════════════════════════════════════════════════════════════
// كل طلب كان يجلب مستند المستخدم كاملاً من قاعدة البيانات — وهو أثقل
// استعلام في النظام لأنه يعمل على كل نقطة نهاية.
// نخزّن نسخة lean لمدة قصيرة ثم hydrate لكل طلب: النسخة معزولة تماماً
// (التعديل على req.user لا يمسّ الكاش) و .save() يعمل كالمعتاد.
//
// المفتاح يبدأ بـ user_ عمداً حتى تمسحه invalidateUsers() الموجودة
// أصلاً في مسارات الإشراف، فتُطبَّق قرارات الحظر فوراً.
const AUTH_CACHE_TTL = parseInt(process.env.AUTH_CACHE_TTL_SECONDS || '20', 10);
const authCacheKey = (id) => `user_auth_${id}`;

// إبطال كاش مستخدم واحد (يُستدعى من hook الحفظ في نموذج User)
const invalidateAuthCache = (userId) => cacheDel(authCacheKey(userId));

const loadUser = async (userId) => {
    if (AUTH_CACHE_TTL <= 0) {
        return User.findById(userId).select('-password');
    }

    const key = authCacheKey(userId);
    let raw = cacheGet(key);

    if (!raw) {
        raw = await User.findById(userId).select('-password').lean();
        if (!raw) return null;
        cacheSet(key, raw, AUTH_CACHE_TTL);
    }

    // مستند mongoose كامل الصلاحيات بلا استعلام
    return User.hydrate(raw);
};

const protect = async (req, res, next) => {
    let token;

    // التحقق من وجود Token في Headers
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            // الحصول على Token
            token = req.headers.authorization.split(' ')[1];

            // التحقق من Token
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            // الحصول على بيانات المستخدم (بدون كلمة المرور) — عبر كاش قصير
            req.user = await loadUser(decoded.id);

            if (!req.user) {
                return res.status(401).json({
                    success: false,
                    message: 'المستخدم غير موجود'
                });
            }

            // إبطال التوكنات القديمة (بعد تغيير كلمة المرور أو الحظر)
            // التوكنات الصادرة قبل إضافة الميزة لا تحمل tv → تبقى صالحة للتوافق
            if (typeof decoded.tv === 'number' && decoded.tv !== (req.user.tokenVersion || 0)) {
                return res.status(401).json({
                    success: false,
                    message: 'انتهت الجلسة. سجّل الدخول مرة أخرى',
                    code: 'TOKEN_REVOKED'
                });
            }

            if (!req.user.isActive) {
                // التحقق إذا انتهت مدة التعليق → إعادة التفعيل تلقائياً
                if (req.user.suspendedUntil && new Date(req.user.suspendedUntil) <= new Date()) {
                    req.user.isActive = true;
                    req.user.suspendedUntil = null;
                    req.user.suspendReason = null;
                    req.user.dailyViolationCount = 0;
                    await req.user.save();
                    // إشعار فك التعليق
                    try {
                        await Notification.create({
                            title: 'تم رفع التعليق عن حسابك',
                            body: 'مرحباً بعودتك! يرجى المحافظة على شروط الاستخدام لتجنب التعليق مرة أخرى.',
                            type: 'system',
                            targetUsers: [req.user._id],
                            recipients: 'specific'
                        });
                    } catch (e) {}
                    // يكمل الطلب بشكل طبيعي
                } else {
                    // 403 بدل 401 حتى لا يعمل logout
                    const remaining = req.user.suspendedUntil
                        ? Math.ceil((new Date(req.user.suspendedUntil) - new Date()) / (1000 * 60 * 60 * 24))
                        : 0;
                    const isPermanent = remaining > 365;
                    const isDeviceBanned = req.user.deviceBanned === true;
                    const isTempSuspended = !isPermanent && !isDeviceBanned && remaining > 0;

                    // ✅ تعليق مؤقت "ناعم": يُمرَّر الطلب للـ GET (قراءة)
                    // فقط routes الكتابة تُطبّق blockWriteIfRestricted لرفض الكتابة
                    if (isTempSuspended) {
                        req.user.isSoftSuspended = true;
                        req.user.softSuspensionInfo = {
                            reason: req.user.suspendReason,
                            suspendedUntil: req.user.suspendedUntil,
                            remaining,
                            level: req.user.suspensionCount || 0
                        };
                        return next();
                    }

                    // تعليق دائم أو حظر جهاز → حجب كامل
                    return res.status(403).json({
                        success: false,
                        message: isDeviceBanned
                            ? 'جهاز محظور نهائياً'
                            : isPermanent
                                ? 'تم حظر حسابك نهائياً'
                                : 'الحساب غير مفعل',
                        code: isDeviceBanned
                            ? 'DEVICE_BANNED'
                            : isPermanent
                                ? 'ACCOUNT_BANNED_PERMANENT'
                                : 'ACCOUNT_SUSPENDED',
                        data: {
                            suspended: true,
                            permanent: isPermanent,
                            deviceBanned: isDeviceBanned,
                            reason: req.user.suspendReason,
                            suspendedUntil: req.user.suspendedUntil,
                            remaining: isPermanent ? -1 : remaining,
                            level: req.user.suspensionCount || 0
                        }
                    });
                }
            }

            next();
        } catch (error) {
            logger.error('خطأ في التحقق من Token:', error.message);
            return res.status(401).json({
                success: false,
                message: 'غير مصرح، Token غير صالح'
            });
        }
    } else {
        return res.status(401).json({
            success: false,
            message: 'غير مصرح، لا يوجد Token'
        });
    }
};

// التحقق من صلاحيات الأدمن
const adminOnly = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({
            success: false,
            message: 'غير مصرح، مطلوب صلاحيات أدمن'
        });
    }
};

module.exports = { protect, adminOnly, invalidateAuthCache };
