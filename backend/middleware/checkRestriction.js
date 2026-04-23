// HalaChat - Restriction Middleware
// فحص التقييد الجزائي للمستخدم قبل بدء محادثة أو الرد

const User = require('../models/User');

/**
 * تحقق إن انتهت مدة التقييد وأزلها تلقائياً.
 * يرجع الـ user (مع التحديث لو تم).
 */
const autoExpireRestriction = async (user) => {
    if (!user?.restrictions) return user;
    const { until, cannotStartChat, cannotReply } = user.restrictions;
    if ((cannotStartChat || cannotReply) && until && new Date(until) <= new Date()) {
        user.restrictions.cannotStartChat = false;
        user.restrictions.cannotReply = false;
        user.restrictions.until = null;
        user.restrictions.reason = null;
        await user.save();
    }
    return user;
};

/**
 * Helper: يبني رد 403 موحّد للتقييد
 */
const restrictionResponse = (res, user, type) => {
    const { until, reason } = user.restrictions || {};
    let remaining = '';
    if (until) {
        const diff = new Date(until) - new Date();
        if (diff > 0) {
            const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
            const hours = Math.ceil(diff / (1000 * 60 * 60));
            remaining = days > 1 ? `${days} يوم` : `${hours} ساعة`;
        }
    }
    return res.status(403).json({
        success: false,
        message: type === 'start_chat'
            ? 'لا يمكنك بدء محادثات جديدة بسبب تقييد جزائي'
            : 'لا يمكنك إرسال رسائل بسبب تقييد جزائي',
        code: type === 'start_chat' ? 'RESTRICTED_START_CHAT' : 'RESTRICTED_REPLY',
        data: {
            reason: reason || 'مخالفة سياسة الاستخدام',
            until: until || null,
            remaining: remaining || 'دائم'
        }
    });
};

/**
 * middleware: يمنع بدء محادثة جديدة إذا المستخدم مقيّد
 */
const checkCanStartChat = async (req, res, next) => {
    try {
        if (!req.user?._id) return next();
        const user = await User.findById(req.user._id).select('restrictions');
        if (!user) return next();
        await autoExpireRestriction(user);
        if (user.restrictions?.cannotStartChat) {
            return restrictionResponse(res, user, 'start_chat');
        }
        next();
    } catch (e) { next(); /* fail open */ }
};

/**
 * middleware: يمنع الرد في محادثة موجودة إذا المستخدم مقيّد
 */
const checkCanReply = async (req, res, next) => {
    try {
        if (!req.user?._id) return next();
        const user = await User.findById(req.user._id).select('restrictions');
        if (!user) return next();
        await autoExpireRestriction(user);
        if (user.restrictions?.cannotReply) {
            return restrictionResponse(res, user, 'reply');
        }
        next();
    } catch (e) { next(); /* fail open */ }
};

/**
 * middleware: يمنع الكتابة إذا المستخدم معلّق مؤقتاً (soft suspension)
 * auth.js يمرّر التعليق المؤقت ويضع req.user.isSoftSuspended=true
 * هذا الـ middleware يُطبَّق على routes الكتابة لرفض الإجراء
 */
const blockIfSoftSuspended = (req, res, next) => {
    if (req.user?.isSoftSuspended) {
        const info = req.user.softSuspensionInfo || {};
        return res.status(403).json({
            success: false,
            message: info.remaining > 0
                ? `حسابك معلّق مؤقتاً. متبقي ${info.remaining} يوم`
                : 'حسابك معلّق مؤقتاً',
            code: 'ACCOUNT_SUSPENDED',
            data: {
                suspended: true,
                permanent: false,
                deviceBanned: false,
                reason: info.reason || 'مخالفة سياسة الاستخدام',
                suspendedUntil: info.suspendedUntil,
                remaining: info.remaining || 0,
                level: info.level || 0
            }
        });
    }
    next();
};

module.exports = { checkCanStartChat, checkCanReply, autoExpireRestriction, blockIfSoftSuspended };
