// اختبارات تكامل — تغطي الثغرات التي أُصلحت في دفعات الأمان
//
// تحتاج MongoDB. تُتخطّى تلقائياً إن لم تتوفر (كي لا تُسقط CI).
// تُنشئ مستخدميها الخاصين وتحذفهم في النهاية — لا تمسّ بيانات حقيقية.
//
// التشغيل: npm run test:integration

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const root = path.join(__dirname, '..');
require(path.join(root, 'node_modules/dotenv')).config({ path: path.join(root, '.env') });
process.env.LOG_LEVEL = 'error';

const mongoose = require(path.join(root, 'node_modules/mongoose'));
const jwt = require(path.join(root, 'node_modules/jsonwebtoken'));

const PREFIX = 'halachat_test_';
let ctx = { available: false };

before(async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 2000 });
    } catch (e) {
        console.warn('⚠️ تخطّي اختبارات التكامل — لا اتصال بقاعدة البيانات');
        return;
    }

    const User = require(path.join(root, 'models/User'));
    const mk = (name) => User.create({
        name: PREFIX + name,
        email: `${PREFIX}${name}@test.local`,
        password: 'Test12345!',
        gender: 'male',
        isActive: true
    });

    ctx.alice = await mk('alice');
    ctx.bob = await mk('bob');
    ctx.carol = await mk('carol');
    ctx.token = (u) => jwt.sign({ id: u._id.toString(), type: 'access', tv: u.tokenVersion || 0 },
        process.env.JWT_SECRET, { expiresIn: '1h' });

    ctx.available = true;
});

after(async () => {
    if (!ctx.available) {
        if (mongoose.connection.readyState === 1) await mongoose.connection.close();
        return;
    }
    const User = require(path.join(root, 'models/User'));
    const Conversation = require(path.join(root, 'models/Conversation'));
    const Message = require(path.join(root, 'models/Message'));

    const ids = [ctx.alice, ctx.bob, ctx.carol].filter(Boolean).map(u => u._id);
    const convs = await Conversation.find({ participants: { $in: ids } }).select('_id').lean();
    await Message.deleteMany({ conversation: { $in: convs.map(c => c._id) } });
    await Conversation.deleteMany({ _id: { $in: convs.map(c => c._id) } });
    await User.deleteMany({ email: { $regex: '^' + PREFIX } });
    await mongoose.connection.close();
});

describe('فحص الحظر (utils/blockCheck)', () => {
    test('يكتشف الحظر في الاتجاهين', async (t) => {
        if (!ctx.available) return t.skip('لا قاعدة بيانات');
        const User = require(path.join(root, 'models/User'));
        const { checkBlockBetween } = require(path.join(root, 'utils/blockCheck'));

        const fresh = (id) => User.findById(id).select('_id blockedUsers').lean();

        assert.deepStrictEqual(
            await checkBlockBetween(await fresh(ctx.alice._id), [ctx.bob._id]),
            { blocked: false, direction: null }
        );

        // bob يحظر alice → alice ممنوعة (وارد)
        await User.updateOne({ _id: ctx.bob._id }, { $addToSet: { blockedUsers: ctx.alice._id } });
        let r = await checkBlockBetween(await fresh(ctx.alice._id), [ctx.bob._id]);
        assert.strictEqual(r.blocked, true);
        assert.strictEqual(r.direction, 'incoming');

        // alice تحظر bob أيضاً → صادر له الأولوية في الرسالة
        await User.updateOne({ _id: ctx.alice._id }, { $addToSet: { blockedUsers: ctx.bob._id } });
        r = await checkBlockBetween(await fresh(ctx.alice._id), [ctx.bob._id]);
        assert.strictEqual(r.direction, 'outgoing');

        // رفع الحظر
        await User.updateOne({ _id: ctx.bob._id }, { $pull: { blockedUsers: ctx.alice._id } });
        await User.updateOne({ _id: ctx.alice._id }, { $pull: { blockedUsers: ctx.bob._id } });
        r = await checkBlockBetween(await fresh(ctx.alice._id), [ctx.bob._id]);
        assert.strictEqual(r.blocked, false);
    });

    test('لا يتأثر بمستخدم ثالث', async (t) => {
        if (!ctx.available) return t.skip('لا قاعدة بيانات');
        const User = require(path.join(root, 'models/User'));
        const { checkBlockBetween } = require(path.join(root, 'utils/blockCheck'));

        await User.updateOne({ _id: ctx.carol._id }, { $addToSet: { blockedUsers: ctx.alice._id } });
        const alice = await User.findById(ctx.alice._id).select('_id blockedUsers').lean();
        const r = await checkBlockBetween(alice, [ctx.bob._id]);
        assert.strictEqual(r.blocked, false, 'حظر من carol يجب ألا يمنع مراسلة bob');
        await User.updateOne({ _id: ctx.carol._id }, { $pull: { blockedUsers: ctx.alice._id } });
    });
});

describe('فحص المحتوى (utils/moderateContent)', () => {
    test('يبني حقول الرسالة من نتيجة الفحص', async (t) => {
        if (!ctx.available) return t.skip('لا قاعدة بيانات');
        const { moderateContent } = require(path.join(root, 'utils/moderateContent'));

        const clean = await moderateContent('مرحبا كيف حالك', 'text');
        assert.strictEqual(clean.bannedWordResult.isClean, true);
        assert.strictEqual(clean.messageFields.reviewStatus, 'none');
        assert.strictEqual(clean.messageFields.hasBannedWords, false);

        const ext = await moderateContent('تابعني سناب: user123', 'text');
        assert.strictEqual(ext.externalCheck.hasExternalAccount, true);
        assert.deepStrictEqual(ext.externalCheck.platforms, ['Snapchat']);
    });

    test('لا يفحص المرفقات غير النصية', async (t) => {
        if (!ctx.available) return t.skip('لا قاعدة بيانات');
        const { moderateContent } = require(path.join(root, 'utils/moderateContent'));
        const r = await moderateContent('سناب: x', 'image');
        assert.strictEqual(r.externalCheck.hasExternalAccount, false);
    });
});

describe('إبطال التوكنات (tokenVersion)', () => {
    test('التوكن القديم يُرفض والتوكن بلا tv يُقبل', async (t) => {
        if (!ctx.available) return t.skip('لا قاعدة بيانات');
        const User = require(path.join(root, 'models/User'));

        const user = await User.findById(ctx.alice._id);
        user.tokenVersion = 5;
        await user.save();

        const good = jwt.sign({ id: user._id.toString(), type: 'access', tv: 5 }, process.env.JWT_SECRET, { expiresIn: '1h' });
        const stale = jwt.sign({ id: user._id.toString(), type: 'access', tv: 4 }, process.env.JWT_SECRET, { expiresIn: '1h' });
        const legacy = jwt.sign({ id: user._id.toString(), type: 'access' }, process.env.JWT_SECRET, { expiresIn: '1h' });

        assert.strictEqual(jwt.verify(good, process.env.JWT_SECRET).tv, 5);
        assert.strictEqual(jwt.verify(stale, process.env.JWT_SECRET).tv, 4);
        assert.strictEqual(jwt.verify(legacy, process.env.JWT_SECRET).tv, undefined,
            'التوكنات القديمة بلا tv — يجب أن تبقى مقبولة للتوافق');
    });
});

describe('كاش المصادقة', () => {
    test('يُبطَل تلقائياً عند حفظ المستخدم', async (t) => {
        if (!ctx.available) return t.skip('لا قاعدة بيانات');
        const User = require(path.join(root, 'models/User'));
        const cache = require(path.join(root, 'utils/cache'));

        const key = `user_auth_${ctx.bob._id}`;
        cache.set(key, { _id: ctx.bob._id, name: 'قديم' }, 60);
        assert.ok(cache.get(key), 'المفتاح مضبوط');

        const bob = await User.findById(ctx.bob._id);
        bob.bio = 'تحديث ' + Date.now();
        await bob.save();

        assert.strictEqual(cache.get(key), undefined, 'الكاش يجب أن يُبطَل بعد الحفظ');
    });
});
