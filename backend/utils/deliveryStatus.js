// HalaChat - حالة تسليم الرسائل (✓ أُرسلت → ✓✓ وصلت → ✓✓ ملوّنة: قُرئت)
//
// كان الحقل status لا يأخذ 'delivered' أبداً في أي مسار: الرسالة تبقى 'sent'
// حتى يفتح الطرف الآخر المحادثة فتقفز إلى 'read' — فالعلامة الثانية الرمادية
// لم تكن تظهر إطلاقاً. هذه الأدوات هي المصدر الوحيد لتحديث التسليم.

const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const logger = require('./logger');

/** هل للمستخدم اتصال سوكت حيّ الآن؟ */
const isUserOnline = (userId) =>
    !!(global.connectedUsers && global.connectedUsers.has(String(userId)));

/** إبلاغ المرسل أن رسائله وصلت جهاز الطرف الآخر */
const notifySender = (senderId, conversationId, messageIds) => {
    if (!global.io || messageIds.length === 0) return;
    global.io.to(`user:${String(senderId)}`).emit('messages-delivered', {
        conversationId: String(conversationId),
        messageIds: messageIds.map(String)
    });
};

/**
 * الحالة الابتدائية للرسالة عند إنشائها: إن كان أحد المستقبلين متصلاً بالسوكت
 * فستصله الرسالة في نفس اللحظة → 'delivered' من البداية.
 *
 * ⚠️ تُحسب قبل الإنشاء عمداً، لا بتحديث لاحق: التحديث اللاحق يسابق ردّ الـ HTTP
 * فيصل للمرسل كائن الرسالة بحالة 'sent' ويبقى على ✓ واحدة حتى إعادة التحميل.
 */
const initialMessageStatus = (recipientIds = []) =>
    recipientIds.some(isUserOnline) ? 'delivered' : 'sent';

/**
 * تُستدعى فور إرسال رسالة: إن كان أحد المستقبلين متصلاً فقد وصلته الرسالة
 * عبر السوكت في نفس اللحظة → 'delivered'.
 * لا تنتظرها مسارات الإرسال (fire-and-forget) كي لا تبطئ الرد.
 */
const markDeliveredOnSend = async ({ messageId, senderId, conversationId, recipientIds }) => {
    try {
        if (!recipientIds.some(isUserOnline)) return;

        // status: 'sent' فقط — كي لا تُرجَع رسالة صارت 'read' إلى الخلف
        const res = await Message.updateOne(
            { _id: messageId, status: 'sent' },
            { $set: { status: 'delivered' } }
        );
        if (res.modifiedCount > 0) notifySender(senderId, conversationId, [messageId]);
    } catch (e) {
        logger.error('فشل تعليم الرسالة كمُسلَّمة:', e.message);
    }
};

// سقف المحادثات التي تُفحص عند الاتصال — نفس منطق حدّ الحضور في server.js:
// المستخدم قد يملك آلاف المحادثات، ومسح الكل عند كل اتصال استعلام ثقيل.
const SWEEP_CONVERSATIONS_LIMIT = 300;
const SWEEP_MESSAGES_LIMIT = 500;

/**
 * تُستدعى عند اتصال المستخدم: كل رسالة واردة إليه ما زالت 'sent' وصلت الآن
 * جهازه → 'delivered'، ويُبلَّغ كل مرسل برسائله.
 */
const sweepDeliveredForUser = async (userId) => {
    try {
        const conversations = await Conversation.find({
            participants: userId,
            isActive: true,
            status: 'accepted'
        })
            .select('_id')
            .sort('-updatedAt')
            .limit(SWEEP_CONVERSATIONS_LIMIT)
            .lean();

        if (conversations.length === 0) return 0;

        const pending = await Message.find({
            conversation: { $in: conversations.map(c => c._id) },
            sender: { $ne: userId },
            status: 'sent'
        })
            .select('_id sender conversation')
            .limit(SWEEP_MESSAGES_LIMIT)
            .lean();

        if (pending.length === 0) return 0;

        await Message.updateMany(
            { _id: { $in: pending.map(m => m._id) }, status: 'sent' },
            { $set: { status: 'delivered' } }
        );

        // تجميع حسب (المرسل + المحادثة) كي يصل كل مرسل حدثاً واحداً لكل محادثة
        const grouped = new Map();
        for (const m of pending) {
            const key = `${m.sender}|${m.conversation}`;
            if (!grouped.has(key)) grouped.set(key, []);
            grouped.get(key).push(m._id);
        }
        for (const [key, ids] of grouped) {
            const [senderId, conversationId] = key.split('|');
            notifySender(senderId, conversationId, ids);
        }

        return pending.length;
    } catch (e) {
        logger.error('فشل مسح الرسائل غير المُسلَّمة:', e.message);
        return 0;
    }
};

module.exports = { isUserOnline, initialMessageStatus, markDeliveredOnSend, sweepDeliveredForUser };
