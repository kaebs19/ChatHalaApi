// HalaChat Dashboard - Conversation Model
// نموذج المحادثة في قاعدة البيانات

const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema({
    title: {
        type: String,
        trim: true,
        default: 'محادثة جديدة'
    },
    type: {
        type: String,
        enum: ['private', 'group'],
        default: 'private'
    },
    participants: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }],
    admins: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    creator: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    groupImage: {
        type: String,
        default: null
    },
    description: {
        type: String,
        default: ''
    },
    lastMessage: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message'
    },
    isActive: {
        type: Boolean,
        default: true
    },
    isLocked: {
        type: Boolean,
        default: false
    },
    status: {
        type: String,
        enum: ['pending', 'accepted', 'rejected'],
        default: 'accepted' // المحادثات القديمة تكون مقبولة بشكل افتراضي
    },
    // المستخدمون الذين أخفوا المحادثة (حذف ناعم)
    hiddenBy: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    // وضع حذف الرسائل: none | on_exit | 24h
    deleteMode: {
        type: String,
        enum: ['none', 'on_exit', '24h'],
        default: 'none'
    },
    settings: {
        allowMembersToSend: {
            type: Boolean,
            default: true
        },
        allowMembersToAddOthers: {
            type: Boolean,
            default: false
        },
        autoDeleteMessages: {
            type: Boolean,
            default: false
        },
        autoDeleteDays: {
            type: Number,
            default: 0
        }
    },
    metadata: {
        totalMessages: {
            type: Number,
            default: 0
        },
        totalParticipants: {
            type: Number,
            default: 0
        },
        activeMembers: {
            type: Number,
            default: 0
        },
        totalReports: {
            type: Number,
            default: 0
        }
    }
}, {
    timestamps: true
});

// Indexes للبحث السريع
conversationSchema.index({ participants: 1 });
conversationSchema.index({ participants: 1, status: 1 }); // للبحث عن محادثات pending/accepted
conversationSchema.index({ participants: 1, type: 1 }); // للبحث عن محادثات خاصة
conversationSchema.index({ status: 1, updatedAt: -1 }); // للترتيب حسب النشاط
conversationSchema.index({ createdAt: -1 });
conversationSchema.index({ isActive: 1 });
conversationSchema.index({ creator: 1 });
conversationSchema.index({ type: 1, status: 1, updatedAt: -1 });

// دالة لحساب عدد المشاركين تلقائياً
conversationSchema.pre('save', function() {
    this.metadata.totalParticipants = this.participants.length;
});

const Conversation = mongoose.model('Conversation', conversationSchema);

module.exports = Conversation;
