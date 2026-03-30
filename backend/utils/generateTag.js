// HalaChat - Unique Tag Generator
// توليد معرف فريد للمستخدم بصيغة HALA-XXXXXX

const crypto = require('crypto');

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const TAG_LENGTH = 6;
const MAX_ATTEMPTS = 10;

/**
 * توليد معرف عشوائي
 * @returns {string} مثال: HALA-A3K9Z2
 */
function generateRandomTag() {
    const bytes = crypto.randomBytes(TAG_LENGTH);
    let tag = '';
    for (let i = 0; i < TAG_LENGTH; i++) {
        tag += CHARS[bytes[i] % CHARS.length];
    }
    return `HALA-${tag}`;
}

/**
 * توليد معرف فريد مع فحص التكرار
 * @param {Model} UserModel - Mongoose User model
 * @returns {Promise<string>} معرف فريد
 */
async function generateUniqueTag(UserModel) {
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
        const tag = generateRandomTag();
        const exists = await UserModel.findOne({ uniqueTag: tag }).select('_id').lean();
        if (!exists) return tag;
    }
    throw new Error('Failed to generate unique tag after ' + MAX_ATTEMPTS + ' attempts');
}

module.exports = { generateUniqueTag, generateRandomTag };
