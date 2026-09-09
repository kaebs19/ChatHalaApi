// اختبارات وحدة — لا تحتاج قاعدة بيانات ولا سيرفر
// التشغيل: npm test
const { test, describe } = require('node:test');
const assert = require('node:assert');
const path = require('path');

process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'error';
const root = path.join(__dirname, '..');

describe('الترقيم الآمن (utils/pagination)', () => {
    const { getPagination, MAX_LIMIT } = require(path.join(root, 'utils/pagination'));

    test('القيم الافتراضية', () => {
        assert.deepStrictEqual(getPagination({}), { page: 1, limit: 20, skip: 0 });
    });

    test('يحسب skip بشكل صحيح', () => {
        assert.deepStrictEqual(getPagination({ page: '3', limit: '10' }), { page: 3, limit: 10, skip: 20 });
    });

    test('يمنع limit ضخم (كان يسحب الـ collection كاملاً)', () => {
        assert.strictEqual(getPagination({ limit: '100000' }).limit, MAX_LIMIT);
    });

    test('يتجاهل المدخلات غير الصالحة', () => {
        assert.deepStrictEqual(getPagination({ page: '-5', limit: 'abc' }), { page: 1, limit: 20, skip: 0 });
        assert.deepStrictEqual(getPagination({ page: '0', limit: '0' }), { page: 1, limit: 20, skip: 0 });
    });
});

describe('إخفاء البيانات الحساسة (utils/logger)', () => {
    const logger = require(path.join(root, 'utils/logger'));

    test('لا يسرّب كلمات المرور والتوكنات في السجل', () => {
        const lines = [];
        const orig = console.error;
        console.error = (...a) => lines.push(a);
        try {
            const prevLevel = process.env.LOG_LEVEL;
            logger.error('اختبار', { password: 'سري123', token: 'jwt.abc', name: 'أحمد', nested: { refreshToken: 'r' } });
            void prevLevel;
        } finally {
            console.error = orig;
        }
        const dump = JSON.stringify(lines);
        assert.ok(!dump.includes('سري123'), 'كلمة المرور ظهرت في السجل');
        assert.ok(!dump.includes('jwt.abc'), 'التوكن ظهر في السجل');
        assert.ok(dump.includes('أحمد'), 'الحقول العادية يجب أن تبقى');
    });
});

describe('كشف الحسابات الخارجية (models/BannedWord)', () => {
    // النموذج لا يحتاج اتصالاً بقاعدة البيانات لهذه الدالة الساكنة
    const BannedWord = require(path.join(root, 'models/BannedWord'));

    const detected = (text) => BannedWord.checkExternalAccounts(text).platforms;

    test('يكتشف المنصات بالعربية (كان \\b يعطّلها كلياً)', () => {
        assert.deepStrictEqual(detected('سناب: user123'), ['Snapchat']);
        assert.deepStrictEqual(detected('واتس: 0501234567'), ['WhatsApp']);
        assert.deepStrictEqual(detected('انستقرام : mo'), ['Instagram']);
        assert.deepStrictEqual(detected('تيك توك - x'), ['TikTok']);
        assert.deepStrictEqual(detected('تلجرام@abc'), ['Telegram']);
        assert.deepStrictEqual(detected('فيس بوك: ali'), ['Facebook']);
        assert.deepStrictEqual(detected('تويتر: @x'), ['Twitter']);
    });

    test('يدعم أداة التعريف "ال"', () => {
        assert.deepStrictEqual(detected('السناب: user123'), ['Snapchat']);
        assert.deepStrictEqual(detected('الواتس : 0501'), ['WhatsApp']);
    });

    test('يكتشف الروابط والأرقام الدولية', () => {
        assert.deepStrictEqual(detected('تابعني instagram.com/xyz'), ['Instagram']);
        assert.deepStrictEqual(detected('t.me/abc'), ['Telegram']);
        assert.deepStrictEqual(detected('رقمي +966501234567'), ['Phone']);
    });

    test('لا ينذر على النص العربي العادي', () => {
        assert.deepStrictEqual(detected('مرحبا كيف حالك اليوم'), []);
        assert.deepStrictEqual(detected('ودي اشوفك بكرة ان شاء الله'), []);
        assert.deepStrictEqual(detected('السناب مو زين'), []);
    });
});

describe('حدود الكلمات العربية (BannedWord regex)', () => {
    test('\\b لا يعمل مع العربية — توثيق سبب الإصلاح', () => {
        assert.strictEqual(/\bسناب\s*[:@-]/i.test('سناب: x'), false);
        assert.strictEqual(/(?<![\p{L}\p{N}])سناب\s*[:@-]/iu.test('سناب: x'), true);
    });
});
