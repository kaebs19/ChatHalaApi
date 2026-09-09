// HalaChat - فحص المحتوى المركزي
// يوحّد فحص الكلمات المحظورة + كشف الحسابات الخارجية + تسجيل المخالفة
// (كان مكرراً في: mobile/messages, mobile/rooms, mobile/conversations, server.js)

const BannedWord = require('../models/BannedWord');
const logger = require('./logger');

/**
 * يفحص نص رسالة ويرجع حقول الرسالة الجاهزة للحفظ.
 * @param {String} content - نص الرسالة
 * @param {String} type - نوع الرسالة (يُفحص النص فقط)
 * @returns {Promise<{bannedWordResult, externalCheck, filteredContent, messageFields}>}
 */
async function moderateContent(content, type = 'text') {
    let bannedWordResult = { isClean: true, foundWords: [], highestSeverity: null };
    let externalCheck = { hasExternalAccount: false, platforms: [] };

    const text = typeof content === 'string' ? content.trim() : '';

    if (type === 'text' && text) {
        try {
            bannedWordResult = await BannedWord.checkText(text, 'word');
            externalCheck = BannedWord.checkExternalAccounts(text);
        } catch (e) {
            logger.error('moderateContent: فشل الفحص:', e.message);
        }
    }

    let filteredContent = null;
    if (!bannedWordResult.isClean) {
        try {
            filteredContent = await BannedWord.cleanText(text, '*****');
        } catch (e) {
            logger.error('moderateContent: فشل التنظيف:', e.message);
        }
    }

    return {
        bannedWordResult,
        externalCheck,
        filteredContent,
        // حقول جاهزة للدمج في Message.create
        messageFields: {
            filteredContent,
            reviewStatus: !bannedWordResult.isClean ? 'pending' : 'none',
            hasBannedWords: !bannedWordResult.isClean,
            bannedWordsFound: (bannedWordResult.foundWords || []).map(w => ({
                word: w.word, severity: w.severity, action: w.action
            })),
            bannedWordSeverity: bannedWordResult.highestSeverity || null
        }
    };
}

/**
 * يسجّل المخالفات الناتجة عن الفحص (كلمات محظورة + حسابات خارجية)
 * ويرسل التنبيهات. لا يرمي استثناءً — الفشل هنا يجب ألا يمنع إرسال الرسالة.
 *
 * @param {Object} opts
 * @param {Object} opts.user - مستند mongoose للمستخدم المخالف
 * @param {Object} opts.bannedWordResult
 * @param {Object} opts.externalCheck
 * @param {Object} opts.evidence - { messageId, messageContent, messageType, conversationId, ... }
 */
async function recordContentViolations({ user, bannedWordResult, externalCheck, evidence = {} }) {
    const { recordViolation } = require('./violationHelper');
    const io = global.io;

    const notify = (result, { title, body, extra = {} }) => {
        if (!io) return;
        io.to(`user:${user._id}`).emit('banned-word-warning', {
            title,
            body,
            violationCount: result.dailyViolationCount,
            remaining: result.dailyRemaining,
            suspended: result.autoSuspended,
            ...extra
        });
    };

    if (bannedWordResult && !bannedWordResult.isClean) {
        try {
            const result = await recordViolation({
                user,
                type: 'banned_word',
                reason: `كلمات محظورة: ${(bannedWordResult.foundWords || []).map(w => w.word || w).join(', ')}`,
                evidence
            });

            // تنبيه الأدمن فقط — وليس بثاً عاماً (تسريب محتوى خاص)
            if (io) {
                io.to('admins').emit('banned-word-alert', {
                    ...evidence,
                    senderId: user._id,
                    senderName: user.name,
                    content: String(evidence.messageContent || '').substring(0, 100),
                    wordsFound: (bannedWordResult.foundWords || []).map(w => w.word || w),
                    severity: bannedWordResult.highestSeverity,
                    timestamp: new Date()
                });
            }

            notify(result, {
                title: result.autoSuspended ? '🚫 تم تعليق حسابك' : '⚠️ تنبيه',
                body: result.autoSuspended
                    ? (result.suspendDays >= 36500 ? 'تم حظر حسابك نهائياً.' : `تم تعليق حسابك ${result.suspendDays} يوم.`)
                    : `رسالتك تحتوي على كلمات محظورة! متبقي ${result.dailyRemaining} قبل التعليق.`
            });
        } catch (e) {
            logger.error('recordContentViolations (banned_word) فشل:', e.message);
        }
    }

    if (externalCheck && externalCheck.hasExternalAccount) {
        try {
            const result = await recordViolation({
                user,
                type: 'external_account',
                reason: externalCheck.reason,
                evidence: { ...evidence, platforms: externalCheck.platforms }
            });

            notify(result, {
                title: result.autoSuspended ? '🚫 تم تقييد حسابك' : '⚠️ مخالفة — حسابات خارجية',
                body: result.autoSuspended
                    ? (result.suspendDays >= 36500
                        ? 'تم حظر حسابك نهائياً بسبب نشر حسابات خارجية.'
                        : `تم تقييد حسابك لمدة ${result.suspendDays} يوم بسبب نشر حسابات خارجية.`)
                    : `نشر أو طلب حسابات خارجية مخالف لسياسة المنصة، ويعرّض حسابك للتقييد والحظر. متبقي ${result.dailyRemaining} قبل التعليق.`,
                extra: { violationType: 'external_account', platforms: externalCheck.platforms }
            });
        } catch (e) {
            logger.error('recordContentViolations (external_account) فشل:', e.message);
        }
    }
}

module.exports = { moderateContent, recordContentViolations };
