// HalaChat Dashboard - User Model
// نموذج المستخدم في قاعدة البيانات

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'الاسم مطلوب'],
        trim: true,
        minlength: [2, 'الاسم يجب أن يكون حرفين على الأقل']
    },
    email: {
        type: String,
        required: [true, 'البريد الإلكتروني مطلوب'],
        unique: true,
        lowercase: true,
        trim: true,
        match: [/^\S+@\S+\.\S+$/, 'البريد الإلكتروني غير صحيح']
    },
    password: {
        type: String,
        required: false, // غير مطلوبة للتسجيل عبر Google/Apple
        minlength: [6, 'كلمة المرور يجب أن تكون 6 أحرف على الأقل'],
        select: false // لا نرجع كلمة المرور في الاستعلامات العادية
    },
    role: {
        type: String,
        enum: ['admin', 'user'],
        default: 'user'
    },
    isActive: {
        type: Boolean,
        default: true
    },
    lastLogin: {
        type: Date
    },
    isOnline: {
        type: Boolean,
        default: false
    },
    // حقول إعادة تعيين كلمة المرور
    resetPasswordToken: {
        type: String,
        select: false
    },
    resetPasswordExpire: {
        type: Date,
        select: false
    },
    // حقول الملف الشخصي
    profileImage: {
        type: String,
        default: null
    },
    birthDate: {
        type: Date,
        default: null
    },
    gender: {
        type: String,
        enum: ['male', 'female', null],
        default: null
    },
    country: {
        type: String,
        default: null,
        trim: true
    },
    bio: {
        type: String,
        default: null,
        maxlength: [500, 'النبذة يجب أن لا تتجاوز 500 حرف']
    },
    // معرف فريد للعرض (HALA-XXXXXX)
    uniqueTag: {
        type: String,
        unique: true,
        sparse: true,
        uppercase: true,
        trim: true
    },
    // نوع التسجيل (app, google, apple)
    authProvider: {
        type: String,
        enum: ['app', 'google', 'apple'],
        default: 'app'
    },
    // معرفات التسجيل الخارجية
    googleId: {
        type: String,
        default: null,
        sparse: true
    },
    appleId: {
        type: String,
        default: null,
        sparse: true
    },
    // Device Token للإشعارات (APNs)
    deviceToken: {
        type: String,
        default: null
    },
    // FCM Token للإشعارات (Firebase Cloud Messaging)
    fcmToken: {
        type: String,
        default: null
    },
    // معلومات الجهاز
    deviceInfo: {
        platform: { type: String, default: null },
        osVersion: { type: String, default: null },
        appVersion: { type: String, default: null }
    },
    // إعدادات الخصوصية
    privacySettings: {
        // إخفاء الملف الشخصي: public (للجميع), contacts (جهات الاتصال فقط), private (مخفي)
        profileVisibility: {
            type: String,
            enum: ['public', 'contacts', 'private'],
            default: 'public'
        },
        // إخفاء آخر ظهور
        showLastSeen: {
            type: Boolean,
            default: true
        },
        // صوت الإشعارات
        notificationSound: {
            type: Boolean,
            default: true
        }
    },
    // قائمة المستخدمين المحظورين
    blockedUsers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    // قائمة المحادثات المكتومة
    mutedConversations: [{
        conversationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Conversation'
        },
        mutedUntil: {
            type: Date,
            default: null // null = مكتوم للأبد
        }
    }],
    // قائمة الغرف المكتومة
    mutedRooms: [{
        roomId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'ChatRoom'
        },
        mutedAt: {
            type: Date,
            default: Date.now
        }
    }],

    // ============ Premium Features ============

    // الاشتراك المميز
    isPremium: { type: Boolean, default: false },
    premiumPlan: {
        type: String,
        enum: ['weekly', 'monthly', 'quarterly', null],
        default: null
    },
    premiumExpiresAt: { type: Date, default: null },

    // بيانات StoreKit 2 (Apple)
    subscriptionTransactionId: { type: String, default: null },
    subscriptionOriginalTransactionId: { type: String, default: null },

    // الموقع الجغرافي (GeoJSON) - الموقع الحقيقي (للحسابات فقط)
    location: {
        type: { type: String, enum: ['Point'], default: 'Point' },
        coordinates: { type: [Number], default: [0, 0] } // [longitude, latitude]
    },

    // الموقع المموّه (للعرض للمستخدمين الآخرين) - إزاحة 1-3 كم
    fuzzyLocation: {
        type: { type: String, enum: ['Point'], default: 'Point' },
        coordinates: { type: [Number], default: [0, 0] }
    },

    // وضع التخفي (للمشتركين فقط)
    stealthMode: { type: Boolean, default: false },
    // إخفاء/إظهار المسافة عن المستخدمين الآخرين
    showDistance: { type: Boolean, default: true },

    // توثيق الحساب
    verification: {
        isVerified: { type: Boolean, default: false },
        selfieUrl: { type: String, default: null },
        status: {
            type: String,
            enum: ['none', 'pending', 'approved', 'rejected'],
            default: 'none'
        },
        submittedAt: { type: Date, default: null },
        reviewedAt: { type: Date, default: null }
    },

    // Super Likes
    superLikes: {
        daily: { type: Number, default: 0 },
        lastReset: { type: Date, default: Date.now }
    },

    // تعليق الحساب
    suspendedUntil: { type: Date, default: null },
    suspendReason: { type: String, default: null },

    // عداد المخالفات
    violationCount: { type: Number, default: 0 },
    dailyViolationCount: { type: Number, default: 0 },
    dailyViolationDate: { type: String, default: null },
    suspensionCount: { type: Number, default: 0 },
    warnings: [{
        reason: String,
        action: String,     // 'warn' | 'name_ban' | 'avatar_reset' | 'suspend' | 'auto_suspend' | 'permanent_ban' | 'unban' | 'device_ban'
        adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        date: { type: Date, default: Date.now },
        // دليل المخالفة (snapshot — يبقى حتى لو حذف المستخدم الرسالة)
        evidence: {
            messageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
            messageContent: { type: String, default: null },
            messageMedia: { type: String, default: null }, // رابط الصورة/الفيديو
            messageType: { type: String, default: null },  // text/image/video/file
            conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', default: null }
        },
        // في حالة حظر الاسم: الاسم القديم المحظور
        oldName: { type: String, default: null }
    }],
    nameBanned: { type: Boolean, default: false },
    // سجل الأسماء المحظورة سابقاً للمستخدم
    bannedNamesHistory: [{
        name: String,
        bannedAt: { type: Date, default: Date.now },
        adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    }],
    // حظر الجهاز (الجهاز الخاص بالمستخدم محظور نهائياً)
    deviceBanned: { type: Boolean, default: false },
    deviceBannedAt: { type: Date, default: null },

    // حماية من هجمات القوة الغاشمة
    loginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },
}, {
    timestamps: true // يضيف createdAt و updatedAt تلقائياً
});

// تشفير كلمة المرور قبل الحفظ
userSchema.pre('save', async function() {
    // إذا لم تتغير كلمة المرور، تخطى
    if (!this.isModified('password')) {
        return;
    }

    // لا تشفر كلمة المرور إذا كانت فارغة (للتسجيل عبر Google/Apple)
    if (!this.password) {
        return;
    }

    // تشفير كلمة المرور
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

// دالة للتحقق من كلمة المرور
userSchema.methods.comparePassword = async function(candidatePassword) {
    try {
        return await bcrypt.compare(candidatePassword, this.password);
    } catch (error) {
        throw new Error('خطأ في التحقق من كلمة المرور');
    }
};

// دالة لإرجاع بيانات المستخدم بدون كلمة المرور
userSchema.methods.toJSON = function() {
    const user = this.toObject();
    delete user.password;
    delete user.resetPasswordToken;
    delete user.resetPasswordExpire;
    return user;
};

// دالة لتوليد رمز إعادة تعيين كلمة المرور
userSchema.methods.generateResetToken = function() {
    // توليد رمز عشوائي آمن مكون من 6 أرقام باستخدام crypto
    const resetToken = crypto.randomInt(100000, 999999).toString();

    // حفظ الرمز مشفر في قاعدة البيانات
    this.resetPasswordToken = crypto
        .createHash('sha256')
        .update(resetToken)
        .digest('hex');

    // تعيين صلاحية الرمز لمدة 10 دقائق
    this.resetPasswordExpire = Date.now() + 10 * 60 * 1000;

    return resetToken;
};

// التحقق من قفل الحساب
userSchema.virtual('isLocked').get(function() {
    return !!(this.lockUntil && this.lockUntil > Date.now());
});

// زيادة عدد محاولات تسجيل الدخول الفاشلة
userSchema.methods.incrementLoginAttempts = async function() {
    // إذا انتهت فترة القفل، أعد تعيين المحاولات
    if (this.lockUntil && this.lockUntil < Date.now()) {
        return this.updateOne({
            $set: { loginAttempts: 1 },
            $unset: { lockUntil: 1 }
        });
    }

    const updates = { $inc: { loginAttempts: 1 } };

    // قفل الحساب بعد 5 محاولات فاشلة
    if (this.loginAttempts + 1 >= 5) {
        updates.$set = { lockUntil: Date.now() + 15 * 60 * 1000 }; // 15 دقيقة
    }

    return this.updateOne(updates);
};

// إعادة تعيين محاولات تسجيل الدخول بعد نجاح
userSchema.methods.resetLoginAttempts = function() {
    return this.updateOne({
        $set: { loginAttempts: 0 },
        $unset: { lockUntil: 1 }
    });
};

// Indexes للبحث السريع
userSchema.index({ name: 'text' });
userSchema.index({ gender: 1, country: 1 });
userSchema.index({ isOnline: -1, lastLogin: -1 });
// email index already defined as unique in schema
userSchema.index({ location: '2dsphere' });
userSchema.index({ isPremium: 1 });
userSchema.index({ 'verification.status': 1 });

// Indexes إضافية لتحسين الأداء
userSchema.index({ uniqueTag: 1 }, { unique: true, sparse: true });
userSchema.index({ fuzzyLocation: '2dsphere' });
userSchema.index({ isActive: 1, isOnline: -1 });
userSchema.index({ blockedUsers: 1 });
userSchema.index({ isPremium: 1, premiumExpiresAt: 1 });
userSchema.index({ fcmToken: 1 }, { sparse: true });
userSchema.index({ deviceToken: 1 }, { sparse: true });
userSchema.index({ createdAt: -1 });

const User = mongoose.model('User', userSchema);

module.exports = User;
