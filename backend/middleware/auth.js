// HalaChat Dashboard - Authentication Middleware
// للتحقق من صلاحية Token

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Notification = require('../models/Notification');

const protect = async (req, res, next) => {
    let token;

    // التحقق من وجود Token في Headers
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            // الحصول على Token
            token = req.headers.authorization.split(' ')[1];

            // التحقق من Token
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            // الحصول على بيانات المستخدم (بدون كلمة المرور)
            req.user = await User.findById(decoded.id).select('-password');

            if (!req.user) {
                return res.status(401).json({
                    success: false,
                    message: 'المستخدم غير موجود'
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
            console.error('خطأ في التحقق من Token:', error.message);
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

module.exports = { protect, adminOnly };
