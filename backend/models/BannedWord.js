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
        const regex = new RegExp(`\\b${escapeRegex(banned.word)}\\b`, 'gi');
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
        const regex = new RegExp(`\\b${escapeRegex(banned.word)}\\b`, 'gi');
        cleanedText = cleanedText.replace(regex, replacement);
    }

    return cleanedText;
};

// دالة مساعدة لتجنب مشاكل regex
function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = mongoose.model('BannedWord', bannedWordSchema);
