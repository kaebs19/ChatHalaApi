#!/usr/bin/env node
// ربط الرسالة الافتتاحية بطلبات المحادثة القديمة
//
// الخلفية: مسار /conversations/request كان يُنشئ الرسالة الأولى دون ضبط
// conversation.lastMessage، فلا يرى المستقبِل ما كتبه الطالب في بطاقة الطلب.
// أُصلح المسار، لكن الطلبات المعلّقة القائمة بقيت بلا ربط — هذا السكربت يعالجها.
//
// ⚠️ مصمَّم لمئات الآلاف من السجلات: يقرأ بمؤشر (cursor) ويعالج دفعات،
// واستهلاك الذاكرة ثابت مهما كان الحجم. (النسخة الأولى حمّلت كل شيء
// في الذاكرة فقُتلت على السيرفر عند 284 ألف طلب.)
//
//   node scripts/backfillRequestOpeners.js           # عرض فقط
//   node scripts/backfillRequestOpeners.js --apply   # تنفيذ
//   BATCH=500 node scripts/backfillRequestOpeners.js # حجم دفعة أصغر لخادم ضعيف
//
// يُفضَّل تشغيله داخل screen/nohup لأنه قد يستغرق دقائق.

require('dotenv').config();
const mongoose = require('mongoose');

const BATCH = Math.max(100, parseInt(process.env.BATCH || '1000', 10));

const PENDING_FILTER = {
    status: 'pending',
    $or: [{ lastMessage: null }, { lastMessage: { $exists: false } }]
};

(async () => {
    const apply = process.argv.includes('--apply');
    const started = Date.now();

    await mongoose.connect(process.env.MONGODB_URI);
    const Conversation = require('../models/Conversation');
    const Message = require('../models/Message');

    const total = await Conversation.countDocuments(PENDING_FILTER);
    console.log(`طلبات معلّقة بلا رسالة مربوطة: ${total.toLocaleString('en')}`);
    console.log(`الوضع: ${apply ? '⚙️  تنفيذ' : '🔍 عرض فقط'} — دفعات من ${BATCH}\n`);

    let scanned = 0, linked = 0, silent = 0;

    // معالجة دفعة: أول رسالة لكل محادثة بتجميع واحد، ثم كتابة واحدة مجمّعة
    async function processBatch(ids) {
        const firsts = await Message.aggregate([
            { $match: { conversation: { $in: ids }, isDeleted: { $ne: true } } },
            { $sort: { conversation: 1, createdAt: 1 } },
            { $group: { _id: '$conversation', first: { $first: '$_id' } } }
        ]);

        if (apply && firsts.length) {
            await Conversation.bulkWrite(
                firsts.map(f => ({
                    updateOne: { filter: { _id: f._id }, update: { $set: { lastMessage: f.first } } }
                })),
                { ordered: false }
            );
        }

        linked += firsts.length;
        silent += ids.length - firsts.length;
        scanned += ids.length;

        const pct = total ? Math.round((scanned / total) * 100) : 100;
        process.stdout.write(
            `\r  ${pct}%  فُحص ${scanned.toLocaleString('en')} | ` +
            `سيُربط ${linked.toLocaleString('en')} | صامت ${silent.toLocaleString('en')}   `
        );
    }

    // مؤشر بدل تحميل كل السجلات — ذاكرة ثابتة
    const cursor = Conversation.find(PENDING_FILTER).select('_id').lean().cursor();
    let ids = [];
    for await (const doc of cursor) {
        ids.push(doc._id);
        if (ids.length >= BATCH) {
            await processBatch(ids);
            ids = [];
        }
    }
    if (ids.length) await processBatch(ids);

    const secs = Math.round((Date.now() - started) / 1000);
    console.log(`\n\n— ${apply ? 'رُبط' : 'سيُربط'}: ${linked.toLocaleString('en')}`);
    console.log(`— بلا أي رسالة (طلب صامت): ${silent.toLocaleString('en')}`);
    console.log(`— المدة: ${secs} ثانية`);
    console.log(apply ? '✅ تم التنفيذ.' : '\nوضع العرض فقط — أضف --apply للتنفيذ.');

    await mongoose.connection.close();
    process.exit(0);
})().catch(e => { console.error('\n❌ فشل:', e.message); process.exit(1); });
