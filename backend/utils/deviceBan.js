// HalaChat - Device Ban Utility
// أدوات التحقق من حظر الجهاز وبناء البصمة

const crypto = require('crypto');
const BannedDevice = require('../models/BannedDevice');

/**
 * بناء بصمة الجهاز من معلوماته (لا تعتمد فقط على deviceToken لأنه قد يتغير)
 */
const buildFingerprint = ({ platform, osVersion, appVersion }, ip) => {
    const raw = [platform, osVersion, appVersion, ip].filter(Boolean).join('|');
    if (!raw) return null;
    return crypto.createHash('sha256').update(raw).digest('hex').substring(0, 32);
};

/**
 * التحقق إن كان الجهاز محظوراً
 * يرجع document الحظر أو null
 *
 * Self-healing: إذا وُجد match بمعرّف واحد فقط (مثلاً fingerprint قديم)
 * يتم إثراء سجل الحظر بأي معرّفات جديدة قادمة من الطلب،
 * حتى الفحوصات اللاحقة تكون أدق ولا يستطيع المستخدم تخطيها بتغيير tokens.
 */
const isDeviceBanned = async ({ deviceToken, fcmToken, persistentDeviceId, deviceInfo, ip }) => {
    const fingerprint = deviceInfo ? buildFingerprint(deviceInfo, ip) : null;

    const or = [];
    if (persistentDeviceId) or.push({ persistentDeviceId });
    if (deviceToken) or.push({ deviceToken });
    if (fcmToken) or.push({ fcmToken });
    if (fingerprint) or.push({ deviceFingerprint: fingerprint });

    if (or.length === 0) return null;

    const banned = await BannedDevice.findOne({ $or: or });
    if (!banned) return null;

    // Self-healing: أضف أي معرّف جديد لم يكن موجوداً في السجل
    let dirty = false;
    if (persistentDeviceId && !banned.persistentDeviceId) {
        banned.persistentDeviceId = persistentDeviceId;
        dirty = true;
    }
    if (deviceToken && !banned.deviceToken) {
        banned.deviceToken = deviceToken;
        dirty = true;
    }
    if (fcmToken && !banned.fcmToken) {
        banned.fcmToken = fcmToken;
        dirty = true;
    }
    if (fingerprint && !banned.deviceFingerprint) {
        banned.deviceFingerprint = fingerprint;
        dirty = true;
    }
    if (dirty) {
        try { await banned.save(); } catch (e) { /* لا نوقف الفحص */ }
    }

    return banned;
};

module.exports = { buildFingerprint, isDeviceBanned };
