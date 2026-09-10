// HalaChat - Device Ban Utility
// أدوات التحقق من حظر الجهاز وبناء البصمة

const crypto = require('crypto');
const BannedDevice = require('../models/BannedDevice');
const User = require('../models/User');

/**
 * بناء بصمة الجهاز من معلوماته (لا تعتمد فقط على deviceToken لأنه قد يتغير)
 *
 * ⚠️ لا تدخل الـ IP في البصمة: الـ IP يتغيّر مع كل شبكة، فإدخاله كان يجعل
 * البصمة وقت الحظر (ip=null) مختلفة عن البصمة وقت الفحص (ip حقيقي) — أي
 * أن هذا المسار لم يكن يطابق أبداً.
 */
const buildFingerprint = ({ platform, osVersion, appVersion }) => {
    const raw = [platform, osVersion, appVersion].filter(Boolean).join('|');
    if (!raw) return null;
    return crypto.createHash('sha256').update(raw).digest('hex').substring(0, 32);
};

/** معرّف صالح للمطابقة: نص غير فارغ وليس قيمة وهمية قصيرة */
const usable = (v) => typeof v === 'string' && v.trim().length >= 8;

/**
 * التحقق إن كان الجهاز محظوراً
 * يرجع document الحظر أو null
 *
 * مصدران للحقيقة:
 *  1) سجل BannedDevice (السريع)
 *  2) أي حساب عليه deviceBanned=true يحمل نفس المعرّفات — لأن حظر الحسابات
 *     الشقيقة كان يضع deviceBanned على الحساب دون إنشاء سجل جهاز له، فيبقى
 *     الجهاز قادراً على التسجيل من جديد.
 *
 * Self-healing: أي معرّف جديد يصل مع الطلب يُضاف لسجل الحظر، وأي جهاز
 * محظور بلا سجل يُنشأ له سجل، حتى تكون الفحوصات اللاحقة أدق.
 */
const isDeviceBanned = async ({ deviceToken, fcmToken, persistentDeviceId, deviceInfo, ip }) => {
    const fingerprint = deviceInfo ? buildFingerprint(deviceInfo) : null;

    const or = [];
    if (usable(persistentDeviceId)) or.push({ persistentDeviceId });
    if (usable(deviceToken)) or.push({ deviceToken });
    if (usable(fcmToken)) or.push({ fcmToken });
    if (usable(fingerprint)) or.push({ deviceFingerprint: fingerprint });

    if (or.length === 0) return null;

    const banned = await BannedDevice.findOne({ $or: or });

    if (banned) {
        // Self-healing: أضف أي معرّف جديد لم يكن موجوداً في السجل
        let dirty = false;
        if (usable(persistentDeviceId) && !banned.persistentDeviceId) {
            banned.persistentDeviceId = persistentDeviceId;
            dirty = true;
        }
        if (usable(deviceToken) && !banned.deviceToken) {
            banned.deviceToken = deviceToken;
            dirty = true;
        }
        if (usable(fcmToken) && !banned.fcmToken) {
            banned.fcmToken = fcmToken;
            dirty = true;
        }
        if (usable(fingerprint) && !banned.deviceFingerprint) {
            banned.deviceFingerprint = fingerprint;
            dirty = true;
        }
        if (ip && banned.lastIP !== ip) {
            banned.lastIP = ip;
            dirty = true;
        }
        if (dirty) {
            try { await banned.save(); } catch (e) { /* لا نوقف الفحص */ }
        }
        return banned;
    }

    // ── المصدر الثاني: حساب محظور جهازياً بنفس المعرّفات وبلا سجل جهاز ──
    const bannedUser = await User.findOne({ deviceBanned: true, $or: or })
        .select('_id name persistentDeviceId deviceToken fcmToken deviceFingerprint deviceInfo suspendReason deviceBannedAt')
        .lean();

    if (!bannedUser) return null;

    // أنشئ السجل الناقص كي يعمل الفحص السريع في المرات القادمة
    try {
        return await BannedDevice.create({
            deviceToken: bannedUser.deviceToken || (usable(deviceToken) ? deviceToken : null),
            fcmToken: bannedUser.fcmToken || (usable(fcmToken) ? fcmToken : null),
            persistentDeviceId: bannedUser.persistentDeviceId || (usable(persistentDeviceId) ? persistentDeviceId : null),
            deviceFingerprint: (bannedUser.deviceInfo ? buildFingerprint(bannedUser.deviceInfo) : null) || fingerprint,
            deviceInfo: bannedUser.deviceInfo || deviceInfo || {},
            lastIP: ip || null,
            originalUserId: bannedUser._id,
            originalUserName: bannedUser.name,
            reason: bannedUser.suspendReason || 'حظر الجهاز نهائياً',
            bannedAt: bannedUser.deviceBannedAt || new Date()
        });
    } catch (e) {
        // إنشاء السجل ليس شرطاً للحظر — الحساب المحظور وحده كافٍ
        return {
            originalUserId: bannedUser._id,
            originalUserName: bannedUser.name,
            reason: bannedUser.suspendReason || 'حظر الجهاز نهائياً',
            createdAt: bannedUser.deviceBannedAt || new Date()
        };
    }
};

module.exports = { buildFingerprint, isDeviceBanned };
