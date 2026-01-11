// HalaChat Dashboard - User Model
// نموذج المستخدم في قاعدة البيانات

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

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
        required: [true, 'كلمة المرور مطلوبة'],
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
    }
}, {
    timestamps: true // يضيف createdAt و updatedAt تلقائياً
});

// تشفير كلمة المرور قبل الحفظ
userSchema.pre('save', async function() {
    // إذا لم تتغير كلمة المرور، تخطى
    if (!this.isModified('password')) {
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
    return user;
};

const User = mongoose.model('User', userSchema);

module.exports = User;
