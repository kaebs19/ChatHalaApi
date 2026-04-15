// HalaChat - Appeal Model
// طلبات استئناف المستخدمين المحظورين/المعلّقين

const mongoose = require('mongoose');

const appealSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    // رسالة المستخدم (سبب طلب فك الحظر/التعليق)
    message: {
        type: String,
        trim: true,
        maxlength: 1000,
        default: ''
    },
    // نوع الحظر وقت تقديم الطلب (للمرجع)
    suspensionType: {
        type: String,
        enum: ['temporary', 'permanent', 'device', 'name'],
        default: 'temporary'
    },
    suspendReasonSnapshot: { type: String, default: null },

    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending',
        index: true
    },

    // مراجعة الأدمن
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    decisionNote: { type: String, default: null },

    // محادثة ثنائية بين المستخدم والأدمن
    thread: [{
        senderType: { type: String, enum: ['user', 'admin'], required: true },
        senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        senderName: { type: String, default: null }, // snapshot
        message: { type: String, required: true, maxlength: 1000 },
        createdAt: { type: Date, default: Date.now },
        readByUser: { type: Boolean, default: false },
        readByAdmin: { type: Boolean, default: false }
    }],

    // عداد للرسائل غير المقروءة (لتسهيل الاستعلام)
    unreadByUser: { type: Number, default: 0 },
    unreadByAdmin: { type: Number, default: 0 },
    lastMessageAt: { type: Date, default: null }
}, { timestamps: true });

// يضمن طلب واحد معلّق فقط لكل مستخدم
appealSchema.index({ user: 1, status: 1 });

module.exports = mongoose.model('Appeal', appealSchema);
