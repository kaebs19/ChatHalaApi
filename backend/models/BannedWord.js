// نموذج الكلمات المحظورة - Banned Words Model
const mongoose = require('mongoose');

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
const CACHE_TTL = 5 * 60 * 1000; // 5 دقائق

async function getCachedBannedWords(model, type) {
    const now = Date.now();
    if (_bannedWordsCache && (now - _cacheTimestamp) < CACHE_TTL) {
        // فلترة حسب النوع من الكاش
        if (type === 'both') return _bannedWordsCache;
        return _bannedWordsCache.filter(w => w.type === type || w.type === 'both');
    }

    // تحديث الكاش
    _bannedWordsCache = await model.find({ isActive: true }).select('word type severity action').lean();
    _cacheTimestamp = now;

    if (type === 'both') return _bannedWordsCache;
    return _bannedWordsCache.filter(w => w.type === type || w.type === 'both');
}

// مسح الكاش عند تعديل الكلمات المحظورة
bannedWordSchema.post('save', () => { _bannedWordsCache = null; });
bannedWordSchema.post('deleteOne', () => { _bannedWordsCache = null; });
bannedWordSchema.post('findOneAndUpdate', () => { _bannedWordsCache = null; });
bannedWordSchema.post('findOneAndDelete', () => { _bannedWordsCache = null; });

// دالة للتحقق من النص (محسّنة - بدون استعلامات متكررة)
bannedWordSchema.statics.checkText = async function(text, type = 'both') {
    if (!text) return { isClean: true, foundWords: [] };

    const normalizedText = text.toLowerCase().trim();
    const bannedWords = await getCachedBannedWords(this, type);
    const foundWords = [];
    const matchedIds = [];

    for (const banned of bannedWords) {
        const regex = buildWordRegex(banned.word);
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
            console.error('خطأ في تحديث عداد الكلمات المحظورة:', err);
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
        const regex = buildWordRegex(banned.word);
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
const EXTERNAL_ACCOUNT_PATTERNS = [
    // Instagram
    { platform: 'Instagram', regex: /instagram\.com\/\S+/i },
    { platform: 'Instagram', regex: /ig\.me\/\S+/i },
    { platform: 'Instagram', regex: /\b(?:insta(?:gram)?|ig)\s*[:@\-]\s*\S+/i },
    { platform: 'Instagram', regex: /\b(?:انست(?:غرام|قرام|اجرام)?)\s*[:@\-]/i },
    // Snapchat
    { platform: 'Snapchat', regex: /snapchat\.com\/\S+/i },
    { platform: 'Snapchat', regex: /\bsnap(?:chat)?\s*[:@\-]\s*\S+/i },
    { platform: 'Snapchat', regex: /\bsc\s*[:\-]\s*[a-zA-Z0-9._]{3,}/i },
    { platform: 'Snapchat', regex: /\b(?:سناب(?:\s*شات)?)\s*[:@\-]/i },
    // WhatsApp
    { platform: 'WhatsApp', regex: /wa\.me\/\S+/i },
    { platform: 'WhatsApp', regex: /whatsapp\.com\//i },
    { platform: 'WhatsApp', regex: /\bwhatsapp\s*[:@\-]\s*\S+/i },
    { platform: 'WhatsApp', regex: /\bواتس(?:اب|آب|أب)?\s*[:@\-]/i },
    // Telegram
    { platform: 'Telegram', regex: /t\.me\/\S+/i },
    { platform: 'Telegram', regex: /telegram\.me\/\S+/i },
    { platform: 'Telegram', regex: /\btelegram\s*[:@\-]\s*\S+/i },
    { platform: 'Telegram', regex: /\bتيلي?(?:جرام|غرام|قرام|گرام)\s*[:@\-]/i },
    { platform: 'Telegram', regex: /\bتلجرام\s*[:@\-]/i },
    { platform: 'Telegram', regex: /\btg\s*[:\-]\s*[a-zA-Z0-9._]{3,}/i },
    // TikTok
    { platform: 'TikTok', regex: /tiktok\.com\/\S+/i },
    { platform: 'TikTok', regex: /\btiktok\s*[:@\-]\s*\S+/i },
    { platform: 'TikTok', regex: /\bتيك\s*توك\s*[:@\-]/i },
    // Twitter / X
    { platform: 'Twitter', regex: /twitter\.com\/\S+/i },
    { platform: 'Twitter', regex: /\bx\.com\/[a-zA-Z0-9_]{1,}\b/i },
    { platform: 'Twitter', regex: /\bتويتر\s*[:@\-]\s*\S+/i },
    // Facebook
    { platform: 'Facebook', regex: /facebook\.com\/\S+/i },
    { platform: 'Facebook', regex: /fb\.me\/\S+/i },
    { platform: 'Facebook', regex: /\bfacebook\s*[:@\-]\s*\S+/i },
    { platform: 'Facebook', regex: /\bفيس\s*بوك\s*[:@\-]/i },
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
