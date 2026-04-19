// HalaChat - Banned IP Model
// حظر يدوي لعناوين IP من الأدمن — TTL تلقائي عند expiresAt

const mongoose = require('mongoose');

const bannedIPSchema = new mongoose.Schema({
    ip: { type: String, required: true, unique: true, index: true },
    reason: { type: String, default: 'حظر يدوي من الأدمن' },
    bannedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    bannedAt: { type: Date, default: Date.now },

    // الحساب الأصلي الذي سبّب الحظر (مرجع فقط)
    originalUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    originalUserName: { type: String, default: null },

    // تاريخ انتهاء الحظر — null = دائم
    // TTL: MongoDB يحذف السجل تلقائياً عند expiresAt
    expiresAt: { type: Date, default: null, index: { expireAfterSeconds: 0 } }
}, { timestamps: true });

module.exports = mongoose.model('BannedIP', bannedIPSchema);
