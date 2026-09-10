// HalaChat Dashboard - Report Model
// نموذج البلاغات في قاعدة البيانات

const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['user', 'message', 'conversation'],
        required: true
    },
    reportedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    reportedUser: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    reportedMessage: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message'
    },
    reportedConversation: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Conversation'
    },
    category: {
        type: String,
        enum: [
            'spam',
            'harassment',
            'inappropriate_content',
            'inappropriate',
            'fake_profile',
            'hate_speech',
            'violence',
            'fraud',
            'impersonation',
            'other'
        ],
        required: true
    },
    description: {
        type: String,
        required: true,
        maxlength: 1000
    },
    // لقطة شاشة يُرفقها المُبلِّغ طوعاً — المحادثات نفسها لا يطّلع عليها أحد،
    // فهذه اللقطة هي الدليل الوحيد المتاح للمشرف.
    evidenceUrl: {
        type: String,
        default: null
    },
    evidenceUploadedAt: {
        type: Date,
        default: null
    },
    status: {
        type: String,
        enum: ['pending', 'reviewing', 'resolved', 'rejected'],
        default: 'pending'
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium'
    },
    assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    reviewNotes: {
        type: String,
        default: ''
    },
    action: {
        type: String,
        enum: ['none', 'warning', 'message_deleted', 'user_suspended', 'user_banned', 'conversation_locked'],
        default: 'none'
    },
    actionDate: {
        type: Date
    },
    resolvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    resolvedAt: {
        type: Date
    }
}, {
    timestamps: true
});

// Indexes للبحث السريع
reportSchema.index({ status: 1 });
reportSchema.index({ priority: 1 });
reportSchema.index({ reportedBy: 1 });
reportSchema.index({ reportedUser: 1 });
reportSchema.index({ createdAt: -1 });
reportSchema.index({ type: 1, status: 1 });

const Report = mongoose.model('Report', reportSchema);

module.exports = Report;
