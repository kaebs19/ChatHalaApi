// HalaChat - Registration Rate Limit
// يمنع إنشاء عدد مبالغ فيه من الحسابات من نفس الجهاز/IP خلال 24 ساعة

const User = require('../models/User');

const WINDOW_MS = 24 * 60 * 60 * 1000; // 24 ساعة
const LIMIT_PER_DEVICE = 3;             // حد الجهاز الواحد
const LIMIT_PER_IP = 5;                 // حد IP الواحد (أوسع — NAT/مقاهي)

/**
 * فحص rate limit للتسجيل.
 * يرجع:
 *   - null إذا مسموح
 *   - { reason, limit, window } إذا تجاوز الحد
 */
const checkRegistrationRateLimit = async (req) => {
    const since = new Date(Date.now() - WINDOW_MS);
    const ip = req.ip || req.connection?.remoteAddress || null;
    const persistentDeviceId = req.body?.persistentDeviceId || null;

    // 1) فحص الجهاز (الأدق)
    if (persistentDeviceId) {
        const deviceCount = await User.countDocuments({
            persistentDeviceId,
            createdAt: { $gte: since }
        });
        if (deviceCount >= LIMIT_PER_DEVICE) {
            return {
                reason: 'DEVICE_REGISTRATION_LIMIT',
                message: `تم تجاوز الحد الأقصى لإنشاء الحسابات من هذا الجهاز (${LIMIT_PER_DEVICE} حسابات / 24 ساعة)`,
                limit: LIMIT_PER_DEVICE,
                window: '24h',
                count: deviceCount
            };
        }
    }

    // 2) فحص IP (أوسع)
    if (ip) {
        const ipCount = await User.countDocuments({
            'knownIPs.ip': ip,
            createdAt: { $gte: since }
        });
        if (ipCount >= LIMIT_PER_IP) {
            return {
                reason: 'IP_REGISTRATION_LIMIT',
                message: `تم تجاوز الحد الأقصى لإنشاء الحسابات من هذا الاتصال (${LIMIT_PER_IP} حسابات / 24 ساعة)`,
                limit: LIMIT_PER_IP,
                window: '24h',
                count: ipCount
            };
        }
    }

    return null;
};

/**
 * Helper يرسل 429 إذا تجاوز، ويرجع true.
 */
const enforceRegistrationRateLimit = async (req, res) => {
    try {
        const exceeded = await checkRegistrationRateLimit(req);
        if (exceeded) {
            res.status(429).json({
                success: false,
                message: exceeded.message,
                code: exceeded.reason,
                data: { limit: exceeded.limit, window: exceeded.window, count: exceeded.count }
            });
            return true;
        }
    } catch (_) { /* لا نوقف التسجيل بسبب خطأ فحص */ }
    return false;
};

module.exports = { checkRegistrationRateLimit, enforceRegistrationRateLimit };
