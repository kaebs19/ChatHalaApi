// HalaChat - IP Ban Utility
// فحص حظر عناوين IP اليدوي (من قبل الأدمن) — بجانب deviceBan

const BannedIP = require('../models/BannedIP');

/**
 * فحص إن كان IP محظوراً.
 * يرجع document الحظر أو null.
 */
const isIPBanned = async (ip) => {
    if (!ip) return null;
    return await BannedIP.findOne({ ip });
};

module.exports = { isIPBanned };
