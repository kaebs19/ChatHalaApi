// HalaChat - User Status Utility
// أدوات موحدة للتعامل مع المستخدمين الموقوفين/المحظورين

/**
 * فحص: هل المستخدم موقوف/محظور؟
 * @param {Object} user - document المستخدم
 * @returns {Boolean}
 */
const isUserSuspended = (user) => {
    if (!user) return true;
    if (user.isActive === false) return true;
    if (user.deviceBanned === true) return true;
    if (user.suspendedUntil && new Date(user.suspendedUntil) > new Date()) return true;
    return false;
};

/**
 * Filter mongoose لاستبعاد المستخدمين الموقوفين في query
 * مناسب لصفحات الاستكشاف والبحث
 */
const activeUserFilter = () => ({
    isActive: true,
    deviceBanned: { $ne: true },
    $or: [
        { suspendedUntil: null },
        { suspendedUntil: { $lte: new Date() } }
    ]
});

/**
 * قناع بيانات مستخدم موقوف (لعرضه كـ "مستخدم موقوف" في المحادثات)
 * @param {Object} user - بيانات المستخدم الأصلية
 * @returns {Object}
 */
const maskSuspendedUser = (user) => {
    if (!user) return user;
    return {
        _id: user._id,
        name: 'مستخدم موقوف',
        profileImage: null,
        isPremium: false,
        isOnline: false,
        isSuspended: true,  // علامة للواجهة
        verification: { isVerified: false }
    };
};

/**
 * يحوّل بيانات المستخدم إلى قناع إذا كان موقوف
 */
const applySuspendedMask = (user) => {
    if (isUserSuspended(user)) {
        return maskSuspendedUser(user);
    }
    return user;
};

/**
 * حقول إضافية تُضاف لأي populate على User لفحص حالة الحظر
 * استخدم: populate('sender', userStatusFields + ' name email ...')
 */
const userStatusFields = 'isActive deviceBanned suspendedUntil';

/**
 * يقنّع كائن sender إذا كان موقوفاً (in-place)
 * يحتفظ بـ _id + isSuspended flag للواجهة
 */
const maskInPlace = (obj, key = 'sender') => {
    const u = obj?.[key];
    if (!u) return;
    if (isUserSuspended(u)) {
        const id = u._id;
        obj[key] = {
            _id: id,
            name: 'مستخدم موقوف',
            profileImage: null,
            isPremium: false,
            isOnline: false,
            isSuspended: true,
            verification: { isVerified: false }
        };
    } else {
        // لا نرسل حقول الحالة للواجهة — فقط نحذفها
        delete u.isActive;
        delete u.deviceBanned;
        delete u.suspendedUntil;
    }
};

module.exports = {
    isUserSuspended,
    activeUserFilter,
    maskSuspendedUser,
    applySuspendedMask,
    userStatusFields,
    maskInPlace
};
