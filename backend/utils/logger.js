// HalaChat - Logger
// مستويات + timestamps + إخفاء البيانات الحساسة + ربط اختياري بـ Sentry
//
// كل تسجيل في السيرفر يمر من هنا، فأي وجهة جديدة (Sentry، ملف، خدمة
// خارجية) تُضاف في مكان واحد بدل تعديل مئات الاستدعاءات.

const LOG_LEVELS = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3
};

const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL || 'info'] ?? LOG_LEVELS.info;

// ═══════════════════════════════════════════════════════════════════
// Sentry اختياري
// ═══════════════════════════════════════════════════════════════════
// يُفعَّل فقط عند وجود SENTRY_DSN + تثبيت @sentry/node.
// السيرفر يعمل كما هو بدونهما.
let sentry = null;
if (process.env.SENTRY_DSN) {
    try {
        sentry = require('@sentry/node');
        sentry.init({
            dsn: process.env.SENTRY_DSN,
            environment: process.env.NODE_ENV || 'development',
            tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_RATE || '0'),
            // لا نرسل بيانات المستخدمين تلقائياً
            sendDefaultPii: false
        });
        console.log('✅ Sentry مفعّل');
    } catch (e) {
        console.warn('⚠️ SENTRY_DSN مضبوط لكن @sentry/node غير مثبّت — شغّل: npm i @sentry/node');
    }
}

// ═══════════════════════════════════════════════════════════════════
// إخفاء البيانات الحساسة قبل التسجيل
// ═══════════════════════════════════════════════════════════════════
const SENSITIVE_KEYS = /^(password|newPassword|currentPassword|token|refreshToken|accessToken|authorization|jwt|secret|apiKey|fcmToken|deviceToken|resetPasswordToken)$/i;

function redact(value, depth = 0) {
    if (depth > 4 || value == null) return value;

    if (Array.isArray(value)) {
        return value.slice(0, 20).map(v => redact(v, depth + 1));
    }

    // لا نغوص في المستندات والكائنات الخاصة
    if (typeof value === 'object') {
        if (value instanceof Error) return value;
        if (typeof value.toHexString === 'function') return value.toString(); // ObjectId
        if (value instanceof Date) return value;

        const out = {};
        for (const [k, v] of Object.entries(value)) {
            out[k] = SENSITIVE_KEYS.test(k) ? '[محجوب]' : redact(v, depth + 1);
        }
        return out;
    }

    return value;
}

function formatTimestamp() {
    return new Date().toISOString();
}

function emit(level, consoleFn, message, args) {
    if (currentLevel < LOG_LEVELS[level]) return;
    const safeArgs = args.map(a => redact(a));
    consoleFn(`[${formatTimestamp()}] [${level.toUpperCase()}] ${message}`, ...safeArgs);
}

const logger = {
    error(message, ...args) {
        emit('error', console.error, message, args);

        if (sentry) {
            const err = args.find(a => a instanceof Error);
            if (err) {
                sentry.captureException(err, { extra: { message } });
            } else {
                sentry.captureMessage(String(message), 'error');
            }
        }
    },

    warn(message, ...args) {
        emit('warn', console.warn, message, args);
    },

    info(message, ...args) {
        emit('info', console.log, message, args);
    },

    debug(message, ...args) {
        emit('debug', console.log, message, args);
    },

    /**
     * تسجيل استثناء مع سياق (مستخدم، مسار، بيانات إضافية)
     */
    captureError(error, context = {}) {
        const safeContext = redact(context);
        emit('error', console.error, error?.message || String(error), [error?.stack, safeContext]);
        if (sentry) {
            sentry.captureException(error, { extra: safeContext });
        }
    },

    isSentryEnabled: () => !!sentry
};

module.exports = logger;
