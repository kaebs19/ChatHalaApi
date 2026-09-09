#!/usr/bin/env node
// ربط الرسالة الافتتاحية بطلبات المحادثة القديمة
//
// الخلفية: مسار /conversations/request كان يُنشئ الرسالة الأولى دون ضبط
// conversation.lastMessage، فلا يرى المستقبِل ما كتبه الطالب في بطاقة الطلب.
// أُصلح المسار، لكن الطلبات المعلّقة القائمة بقيت بلا ربط — هذا السكربت يعالجها.
//
//   node scripts/backfillRequestOpeners.js           # عرض فقط
//   node scripts/backfillRequestOpeners.js --apply   # تنفيذ

require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
    const apply = process.argv.includes('--apply');
    await mongoose.connect(process.env.MONGODB_URI);
    const Conversation = require('../models/Conversation');
    const Message = require('../models/Message');

    const pending = await Conversation.find({
        status: 'pending',
        $or: [{ lastMessage: null }, { lastMessage: { $exists: false } }]
    }).select('_id').lean();

    console.log(`طلبات معلّقة بلا رسالة مربوطة: ${pending.length}`);

    let linked = 0, noMessage = 0;
    for (const conv of pending) {
        const first = await Message.findOne({ conversation: conv._id, isDeleted: { $ne: true } })
            .sort({ createdAt: 1 })
            .select('_id content')
            .lean();

        if (!first) { noMessage++; continue; }

        linked++;
        if (apply) {
            await Conversation.updateOne({ _id: conv._id }, { $set: { lastMessage: first._id } });
        }
    }

    console.log(`— سيُربط: ${linked}   — بلا رسالة أصلاً (طلب صامت): ${noMessage}`);
    console.log(apply ? '✅ تم التنفيذ.' : 'وضع العرض فقط — أضف --apply للتنفيذ.');
    await mongoose.connection.close();
    process.exit(0);
})().catch(e => { console.error('❌ فشل:', e.message); process.exit(1); });
