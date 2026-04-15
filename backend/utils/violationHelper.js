// HalaChat - Violation Helper (مركزي)
// يتعامل مع كل أنواع المخالفات: كلمات/اسم/صورة/بلاغ
// يزيد العداد + يحفظ الدليل + يرسل إشعار + يعلّق تلقائياً عند 5 مخالفات يومية

const Notification = require('../models/Notification');
const pushNotificationService = require('../services/pushNotificationService');

/**
 * @param {Object} opts
 * @param {Object} opts.user - document مستخدم mongoose (سيتم استدعاء .save())
 * @param {String} opts.type - 'banned_word' | 'banned_name' | 'banned_image' | 'report'
 * @param {String} opts.reason - سبب المخالفة (نص مفصّل)
 * @param {Object} [opts.evidence] - دليل: { messageId, messageContent, messageMedia, messageType, conversationId }
 * @param {String} [opts.oldName] - الاسم القديم (لحظر الاسم فقط)
 * @param {String|ObjectId} [opts.adminId] - معرف الأدمن (اختياري إذا كانت بواسطة بلاغ)
 * @param {Boolean} [opts.sendNotification=true] - إرسال إشعار push + DB للمستخدم
 * @param {Boolean} [opts.autoSuspend=true] - التعليق التلقائي عند 5/يوم
 * @returns {Object} { autoSuspended, suspendDays, dailyViolationCount, dailyRemaining, totalViolations }
 */
async function recordViolation(opts) {
    const {
        user,
        type,
        reason,
        evidence = null,
        oldName = null,
        adminId = null,
        sendNotification = true,
        autoSuspend = true
    } = opts;

    if (!user) throw new Error('recordViolation: user مطلوب');

    // تحديث العداد اليومي (يُعاد كل يوم)
    const today = new Date().toISOString().split('T')[0];
    if (user.dailyViolationDate !== today) {
        user.dailyViolationCount = 0;
        user.dailyViolationDate = today;
    }
    user.dailyViolationCount = (user.dailyViolationCount || 0) + 1;
    user.violationCount = (user.violationCount || 0) + 1;

    // mapping للنوع → action في warnings
    const actionMap = {
        banned_word: 'warn',
        banned_name: 'warn',
        banned_image: 'warn',
        report: 'warn'
    };

    const warning = {
        reason,
        action: actionMap[type] || 'warn',
        adminId: adminId || null
    };
    if (evidence) warning.evidence = evidence;
    if (oldName) warning.oldName = oldName;
    user.warnings.push(warning);

    // فحص التعليق التلقائي (5 مخالفات/يوم)
    let autoSuspended = false;
    let suspendDays = 0;
    if (autoSuspend && user.dailyViolationCount >= 5) {
        autoSuspended = true;
        user.suspensionCount = (user.suspensionCount || 0) + 1;

        if (user.suspensionCount === 1) suspendDays = 1;
        else if (user.suspensionCount === 2) suspendDays = 3;
        else if (user.suspensionCount === 3) suspendDays = 7;
        else suspendDays = 36500; // دائم

        user.isActive = false;
        user.suspendedUntil = new Date(Date.now() + suspendDays * 24 * 60 * 60 * 1000);
        user.suspendReason = suspendDays >= 36500
            ? 'حظر دائم - تكرار المخالفات'
            : `تعليق تلقائي ${suspendDays} يوم - تجاوز 5 مخالفات يومية`;
        user.warnings.push({
            reason: user.suspendReason,
            action: 'auto_suspend',
            adminId: adminId || null
        });
        user.dailyViolationCount = 0;

        // فصل الـ socket (إن كان متصل)
        if (global.connectedUsers && global.connectedUsers.has(user._id.toString())) {
            const info = global.connectedUsers.get(user._id.toString());
            const sock = global.io?.sockets?.sockets?.get(info.socketId);
            if (sock) sock.disconnect(true);
        }
    }

    await user.save();

    // إبطال الـ cache
    try { require('./cache').invalidateUsers(); } catch (e) {}

    // إرسال إشعار للمستخدم
    const dailyRemaining = Math.max(0, 5 - user.dailyViolationCount);
    if (sendNotification) {
        const reasonLabel = {
            banned_word: 'استخدام كلمات محظورة',
            banned_name: 'اسم مخالف لسياسة الاستخدام',
            banned_image: 'صورة مخالفة',
            report: 'بلاغ تم قبوله ضدك'
        }[type] || 'مخالفة سياسة الاستخدام';

        let notifTitle, notifBody;
        if (autoSuspended) {
            notifTitle = suspendDays >= 36500 ? '🚫 تم حظر حسابك نهائياً' : '⏸️ تم تعليق حسابك';
            notifBody = suspendDays >= 36500
                ? 'تم حظر حسابك نهائياً بسبب تكرار المخالفات.'
                : `تم تعليق حسابك لمدة ${suspendDays} يوم بسبب تجاوز 5 مخالفات يومية.`;
        } else {
            notifTitle = '⚠️ مخالفة مسجّلة';
            notifBody = `تم تسجيل مخالفة: ${reasonLabel}. عدد المخالفات اليوم: ${user.dailyViolationCount}/5${dailyRemaining > 0 ? `، متبقي ${dailyRemaining} قبل التعليق التلقائي.` : '.'}`;
        }

        try {
            await Notification.create({
                title: notifTitle,
                body: notifBody,
                type: 'system',
                sender: adminId || undefined,
                targetUsers: [user._id],
                recipients: 'specific'
            });
            await pushNotificationService.sendNotificationToUser(
                user._id,
                { title: notifTitle, body: notifBody },
                { type: 'system', violation: type },
                false
            );
            if (global.io) {
                global.io.to(`user:${user._id}`).emit('notification', {
                    title: notifTitle, body: notifBody, type: 'system'
                });
            }
        } catch (e) {
            console.error('recordViolation: فشل إرسال الإشعار', e.message);
        }
    }

    return {
        autoSuspended,
        suspendDays,
        dailyViolationCount: user.dailyViolationCount,
        dailyRemaining,
        totalViolations: user.violationCount
    };
}

module.exports = { recordViolation };
