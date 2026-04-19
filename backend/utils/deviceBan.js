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
 */
const isDeviceBanned = async ({ deviceToken, fcmToken, persistentDeviceId, deviceInfo, ip }) => {
    const or = [];
    if (persistentDeviceId) or.push({ persistentDeviceId });
    if (deviceToken) or.push({ deviceToken });
    if (fcmToken) or.push({ fcmToken });
    if (deviceInfo) {
        const fingerprint = buildFingerprint(deviceInfo, ip);
        if (fingerprint) or.push({ deviceFingerprint: fingerprint });
    }
    if (or.length === 0) return null;
    return await BannedDevice.findOne({ $or: or });
};

module.exports = { buildFingerprint, isDeviceBanned };
