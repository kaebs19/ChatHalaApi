// نموذج الكلمات المحظورة - Banned Words Model
const mongoose = require('mongoose');

const logger = require('../utils/logger');
const bannedWordSchema = new mongoose.Schema({
    word: {
        type: String,
        required: [true, 'الكلمة مطلوبة'],
        unique: true,
        trim: true,
        lowercase: true
    },
    type: {
        type: String,
        enum: ['word', 'name', 'both'], // كلمة في الرسائل، اسم مستخدم، أو كلاهما
        default: 'both'
    },
    category: {
        type: String,
        enum: ['spam', 'promotion', 'contact', 'name', 'other'],
        default: 'other'
    },
    severity: {
        type: String,
        enum: ['low', 'medium', 'high', 'critical'],
        default: 'medium'
    },
    action: {
        type: String,
        enum: ['filter', 'warn', 'block', 'ban'], // فلترة، تحذير، حظر الرسالة، حظر المستخدم
        default: 'filter'
    },
    isActive: {
        type: Boolean,
        default: true
    },
    addedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    usageCount: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

// Index للبحث السريع
// word index already defined as unique in schema
bannedWordSchema.index({ type: 1, isActive: 1 });

// ═══════════════════════════════════════════════════════════════════
// كاش الكلمات المحظورة (يمنع الاستعلام من قاعدة البيانات كل رسالة)
// ═══════════════════════════════════════════════════════════════════
let _bannedWordsCache = null;
let _cacheTimestamp = 0;
const _typeCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 دقائق

// الكاش يخزّن الـ regex مُجمَّعة مسبقاً: بناء RegExp لكل كلمة عند كل رسالة
// كان يعني آلاف عمليات التجميع في الدقيقة مع نمو قائمة الكلمات
async function getCachedBannedWords(model, type) {
    const now = Date.now();
    if (!_bannedWordsCache || (now - _cacheTimestamp) >= CACHE_TTL) {
        const words = await model.find({ isActive: true })
            .select('word type severity action')
            .lean();

        // نُجمِّع الـ regex مرة واحدة عند تحديث الكاش
        _bannedWordsCache = words.map(w => ({ ...w, regex: buildWordRegex(w.word) }));
        _cacheTimestamp = now;
        _typeCache.clear();
    }

    if (type === 'both') return _bannedWordsCache;

    // نتيجة الفلترة حسب النوع مخزّنة أيضاً بدل إعادة الفلترة كل رسالة
    if (!_typeCache.has(type)) {
        _typeCache.set(type, _bannedWordsCache.filter(w => w.type === type || w.type === 'both'));
    }
    return _typeCache.get(type);
}

// مسح الكاش عند تعديل الكلمات المحظورة
const clearWordsCache = () => {
    _bannedWordsCache = null;
    _typeCache.clear();
    // مع cluster: أبلغ العمليات الأخرى، وإلا بقيت تعمل بقائمة قديمة حتى 5 دقائق
    if (global.publishCacheInvalidation) {
        global.publishCacheInvalidation('banned_words');
    }
};

// استقبال الإبطال القادم من عملية أخرى
global.__clearBannedWordsCache = () => { _bannedWordsCache = null; _typeCache.clear(); };
bannedWordSchema.post('save', clearWordsCache);
bannedWordSchema.post('deleteOne', clearWordsCache);
bannedWordSchema.post('deleteMany', clearWordsCache);
bannedWordSchema.post('insertMany', clearWordsCache);
bannedWordSchema.post('findOneAndUpdate', clearWordsCache);
bannedWordSchema.post('findOneAndDelete', clearWordsCache);
bannedWordSchema.post('updateMany', clearWordsCache);

// دالة للتحقق من النص (محسّنة - بدون استعلامات متكررة)
bannedWordSchema.statics.checkText = async function(text, type = 'both') {
    if (!text) return { isClean: true, foundWords: [] };

    const normalizedText = text.toLowerCase().trim();
    const bannedWords = await getCachedBannedWords(this, type);
    const foundWords = [];
    const matchedIds = [];

    for (const banned of bannedWords) {
        const regex = banned.regex || buildWordRegex(banned.word);
        regex.lastIndex = 0; // علم g يجعل test ذات حالة عبر الاستدعاءات
        if (regex.test(normalizedText)) {
            foundWords.push({
                word: banned.word,
                severity: banned.severity,
                action: banned.action
            });
            matchedIds.push(banned._id);
        }
    }

    // تحديث عداد الاستخدام بعملية واحدة (بدل عملية لكل كلمة)
    if (matchedIds.length > 0) {
        this.updateMany(
            { _id: { $in: matchedIds } },
            { $inc: { usageCount: 1 } }
        ).exec().catch(err => {
            logger.error('خطأ في تحديث عداد الكلمات المحظورة:', err);
        });
    }

    return {
        isClean: foundWords.length === 0,
        foundWords,
        highestSeverity: foundWords.length > 0
            ? foundWords.reduce((max, w) => {
                const order = { low: 1, medium: 2, high: 3, critical: 4 };
                return order[w.severity] > order[max] ? w.severity : max;
            }, 'low')
            : null,
        suggestedAction: foundWords.length > 0
            ? foundWords.reduce((max, w) => {
                const order = { filter: 1, warn: 2, block: 3, ban: 4 };
                return order[w.action] > order[max] ? w.action : max;
            }, 'filter')
            : null
    };
};

// دالة لتنظيف النص من الكلمات المحظورة (محسّنة - تستخدم الكاش)
bannedWordSchema.statics.cleanText = async function(text, replacement = '***') {
    if (!text) return text;

    const bannedWords = await getCachedBannedWords(this, 'both');
    let cleanedText = text;

    for (const banned of bannedWords) {
        const regex = banned.regex || buildWordRegex(banned.word);
        regex.lastIndex = 0;
        cleanedText = cleanedText.replace(regex, (match) => {
            // حفظ المسافات حول الكلمة المستبدلة
            const leading = match.match(/^[\s.,!?؟،؛:]/)?.[0] || '';
            const trailing = match.match(/[\s.,!?؟،؛:]$/)?.[0] || '';
            return leading + replacement + trailing;
        });
    }

    return cleanedText;
};

// دالة مساعدة لتجنب مشاكل regex
function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// بناء regex يدعم العربية (\\b لا يعمل مع الأحرف العربية)
function buildWordRegex(word) {
    const escaped = escapeRegex(word);
    // للعربية: استخدام حدود مخصصة بدل \b
    const isArabic = /[\u0600-\u06FF]/.test(word);
    if (isArabic) {
        // حدود عربية: بداية/نهاية النص أو مسافة أو علامة ترقيم
        return new RegExp(`(?:^|[\\s.,!?؟،؛:])${escaped}(?:[\\s.,!?؟،؛:]|$)`, 'gi');
    }
    return new RegExp(`\\b${escaped}\\b`, 'gi');
}

// ═══════════════════════════════════════════════════════════════════
// كشف مشاركة الحسابات الخارجية (Instagram, Snap, WhatsApp, إلخ)
// ═══════════════════════════════════════════════════════════════════
// ⚠️ الأنماط العربية تستخدم (?<![\p{L}\p{N}]) بدل \b — لأن \b لا يعمل مع
// الأحرف العربية في JS (تُعتبر non-word) فكانت كل الأنماط العربية لا تُطابق أبداً.
const EXTERNAL_ACCOUNT_PATTERNS = [
    // Instagram
    { platform: 'Instagram', regex: /instagram\.com\/\S+/i },
    { platform: 'Instagram', regex: /ig\.me\/\S+/i },
    { platform: 'Instagram', regex: /\b(?:insta(?:gram)?|ig)\s*[:@\-]\s*\S+/i },
    { platform: 'Instagram', regex: /(?<![\p{L}\p{N}])(?:ال)?(?:انست(?:غرام|قرام|اجرام)?)\s*[:@\-]/iu },
    // Snapchat
    { platform: 'Snapchat', regex: /snapchat\.com\/\S+/i },
    { platform: 'Snapchat', regex: /\bsnap(?:chat)?\s*[:@\-]\s*\S+/i },
    { platform: 'Snapchat', regex: /\bsc\s*[:\-]\s*[a-zA-Z0-9._]{3,}/i },
    { platform: 'Snapchat', regex: /(?<![\p{L}\p{N}])(?:ال)?(?:سناب(?:\s*شات)?)\s*[:@\-]/iu },
    // WhatsApp
    { platform: 'WhatsApp', regex: /wa\.me\/\S+/i },
    { platform: 'WhatsApp', regex: /whatsapp\.com\//i },
    { platform: 'WhatsApp', regex: /\bwhatsapp\s*[:@\-]\s*\S+/i },
    { platform: 'WhatsApp', regex: /(?<![\p{L}\p{N}])(?:ال)?واتس(?:اب|آب|أب)?\s*[:@\-]/iu },
    // Telegram
    { platform: 'Telegram', regex: /t\.me\/\S+/i },
    { platform: 'Telegram', regex: /telegram\.me\/\S+/i },
    { platform: 'Telegram', regex: /\btelegram\s*[:@\-]\s*\S+/i },
    { platform: 'Telegram', regex: /(?<![\p{L}\p{N}])(?:ال)?تيلي?(?:جرام|غرام|قرام|گرام)\s*[:@\-]/iu },
    { platform: 'Telegram', regex: /(?<![\p{L}\p{N}])(?:ال)?تلجرام\s*[:@\-]/iu },
    { platform: 'Telegram', regex: /\btg\s*[:\-]\s*[a-zA-Z0-9._]{3,}/i },
    // TikTok
    { platform: 'TikTok', regex: /tiktok\.com\/\S+/i },
    { platform: 'TikTok', regex: /\btiktok\s*[:@\-]\s*\S+/i },
    { platform: 'TikTok', regex: /(?<![\p{L}\p{N}])(?:ال)?تيك\s*توك\s*[:@\-]/iu },
    // Twitter / X
    { platform: 'Twitter', regex: /twitter\.com\/\S+/i },
    { platform: 'Twitter', regex: /\bx\.com\/[a-zA-Z0-9_]{1,}\b/i },
    { platform: 'Twitter', regex: /(?<![\p{L}\p{N}])(?:ال)?تويتر\s*[:@\-]\s*\S+/iu },
    // Facebook
    { platform: 'Facebook', regex: /facebook\.com\/\S+/i },
    { platform: 'Facebook', regex: /fb\.me\/\S+/i },
    { platform: 'Facebook', regex: /\bfacebook\s*[:@\-]\s*\S+/i },
    { platform: 'Facebook', regex: /(?<![\p{L}\p{N}])(?:ال)?فيس\s*بوك\s*[:@\-]/iu },
    // YouTube
    { platform: 'YouTube', regex: /youtube\.com\/\S+/i },
    { platform: 'YouTube', regex: /youtu\.be\/\S+/i },
    // @username standalone
    { platform: 'Username', regex: /(?:^|[\s,؟?!.،؛:])@([a-zA-Z][a-zA-Z0-9_.]{2,29})(?=[\s,؟?!.،؛:]|$)/i },
    // أرقام هاتف دولية
    { platform: 'Phone', regex: /(?:\+|00)[1-9]\d{9,14}(?!\d)/i },
];

// يكتشف مشاركة الحسابات الخارجية في نص الرسالة
bannedWordSchema.statics.checkExternalAccounts = function(text) {
    if (!text) return { hasExternalAccount: false, platforms: [] };

    const detectedPlatforms = new Set();
    for (const { platform, regex } of EXTERNAL_ACCOUNT_PATTERNS) {
        if (regex.test(text)) {
            detectedPlatforms.add(platform);
        }
    }

    const platforms = [...detectedPlatforms];
    return {
        hasExternalAccount: platforms.length > 0,
        platforms,
        reason: platforms.length > 0
            ? `مشاركة حسابات خارجية: ${platforms.join(', ')}`
            : null
    };
};

module.exports = mongoose.model('BannedWord', bannedWordSchema);
