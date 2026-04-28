// HalaChat - Email Validator
// التحقق من صحة البريد قبل الإرسال (DNS MX check + cache)

const dns = require('dns').promises;

// كاش بسيط في الذاكرة — يتجنب lookups متكررة لنفس الـ domain
const mxCache = new Map();
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 ساعات

// domains معروفة (لا حاجة لـ DNS lookup — أسرع وأوفر)
const KNOWN_GOOD_DOMAINS = new Set([
    'gmail.com', 'googlemail.com',
    'yahoo.com', 'yahoo.co.uk', 'yahoo.fr',
    'hotmail.com', 'outlook.com', 'live.com', 'msn.com',
    'icloud.com', 'me.com', 'mac.com',
    'protonmail.com', 'proton.me',
    'aol.com', 'mail.com', 'zoho.com',
    'yandex.com', 'yandex.ru',
    // Arabic providers
    'maktoob.com'
]);

/**
 * تحقق من شكل البريد الأساسي (regex)
 */
const isValidEmailFormat = (email) => {
    if (!email || typeof email !== 'string') return false;
    // RFC 5322 simplified — يكفي لـ 99% من الحالات
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email.trim());
};

/**
 * تحقق من وجود MX records لـ domain البريد
 * يعيد true لو الـ domain يستطيع استقبال بريد، false إذا لا
 */
const hasValidMX = async (email) => {
    if (!isValidEmailFormat(email)) return false;
    const domain = email.split('@')[1].toLowerCase().trim();

    // Domains معروفة — نثق بها مباشرة
    if (KNOWN_GOOD_DOMAINS.has(domain)) return true;

    // فحص الكاش
    const cached = mxCache.get(domain);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
        return cached.valid;
    }

    // DNS MX lookup (مع timeout قصير)
    try {
        const records = await Promise.race([
            dns.resolveMx(domain),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('DNS timeout')), 3000)
            )
        ]);
        const valid = Array.isArray(records) && records.length > 0;
        mxCache.set(domain, { valid, timestamp: Date.now() });
        return valid;
    } catch (err) {
        // ENOTFOUND/ENODATA = domain لا يستقبل بريد
        // أي خطأ آخر (timeout, network) → نسمح بالبريد بدلاً من إيقاف المستخدم
        const isHardFail = err.code === 'ENOTFOUND' || err.code === 'ENODATA';
        if (isHardFail) {
            mxCache.set(domain, { valid: false, timestamp: Date.now() });
            return false;
        }
        // soft fail (timeout/network): لا نكتش، نسمح بالمحاولة
        return true;
    }
};

/**
 * فحص شامل: format + MX
 */
const isDeliverableEmail = async (email) => {
    if (!isValidEmailFormat(email)) return false;
    return await hasValidMX(email);
};

module.exports = { isValidEmailFormat, hasValidMX, isDeliverableEmail };
