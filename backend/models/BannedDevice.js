// HalaChat - Banned Device Model
// حفظ بصمات الأجهزة المحظورة لمنعها من التسجيل مرة أخرى

const mongoose = require('mongoose');

const bannedDeviceSchema = new mongoose.Schema({
    // معرّف الجهاز — أحد هذه القيم على الأقل
    deviceToken: { type: String, default: null, index: true },
    fcmToken: { type: String, default: null, index: true },
    // معرّف فريد مستمر من iOS Keychain — الأدق (يبقى بعد حذف التطبيق)
    persistentDeviceId: { type: String, default: null, index: true },
    // بصمة مركّبة من معلومات الجهاز (platform+osVersion+appVersion+IP هاش)
    deviceFingerprint: { type: String, default: null, index: true },

    deviceInfo: {
        platform: String,
        osVersion: String,
        appVersion: String
    },

    // آخر IP استخدم هذا الجهاز
    lastIP: { type: String, default: null },

    // المستخدم الأصلي الذي تم حظر جهازه (للمرجع)
    originalUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    originalUserName: { type: String, default: null },

    reason: { type: String, default: 'حظر الجهاز نهائياً' },
    bannedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    bannedAt: { type: Date, default: Date.now }
}, { timestamps: true });

// مهم: index مركّب للبحث السريع
bannedDeviceSchema.index({ deviceToken: 1, fcmToken: 1 });

module.exports = mongoose.model('BannedDevice', bannedDeviceSchema);
