// HalaChat - فحص الحظر المتبادل بين المستخدمين
// الحظر يجب أن يمنع المراسلة في الاتجاهين: الحاظر والمحظور

const User = require('../models/User');

/**
 * هل يوجد حظر بين المستخدم الحالي وأي من المستخدمين الآخرين؟
 * يفحص الاتجاهين: (أ) الحالي حاظر للطرف الآخر، (ب) الطرف الآخر حاظر للحالي.
 *
 * @param {object} currentUser - مستند المستخدم الحالي (req.user) — يجب أن يحوي blockedUsers
 * @param {Array} otherUserIds - معرفات الأطراف الأخرى
 * @returns {Promise<{blocked: boolean, direction: 'outgoing'|'incoming'|null}>}
 */
const checkBlockBetween = async (currentUser, otherUserIds) => {
    const ids = (Array.isArray(otherUserIds) ? otherUserIds : [otherUserIds])
        .filter(Boolean)
        .map(id => id.toString());

    if (ids.length === 0) return { blocked: false, direction: null };

    // (أ) المستخدم الحالي حاظر أحدهم
    const myBlocked = (currentUser.blockedUsers || []).map(b => b.toString());
    if (ids.some(id => myBlocked.includes(id))) {
        return { blocked: true, direction: 'outgoing' };
    }

    // (ب) أحدهم حاظر المستخدم الحالي — استعلام واحد مفهرس (blockedUsers مفهرس)
    const blocker = await User.findOne({
        _id: { $in: ids },
        blockedUsers: currentUser._id
    }).select('_id').lean();

    if (blocker) return { blocked: true, direction: 'incoming' };

    return { blocked: false, direction: null };
};

/**
 * رد 403 موحّد عند وجود حظر.
 * لا نكشف للطرف المحظور أنه محظور (نستخدم صياغة محايدة).
 */
const blockResponse = (res, direction) => {
    return res.status(403).json({
        success: false,
        message: direction === 'outgoing'
            ? 'لا يمكنك مراسلة مستخدم قمت بحظره. أزل الحظر أولاً'
            : 'لا يمكن إرسال الرسالة إلى هذا المستخدم',
        code: direction === 'outgoing' ? 'YOU_BLOCKED_USER' : 'MESSAGE_NOT_ALLOWED'
    });
};

module.exports = { checkBlockBetween, blockResponse };
