// إصلاح الطلبات المعلقة المخفية بسبب hiddenBy
// التشغيل: node scripts/fix-hidden-pending.js

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Conversation = require('../models/Conversation');

(async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ متصل بقاعدة البيانات');

        const before = await Conversation.countDocuments({
            status: 'pending',
            hiddenBy: { $exists: true, $ne: [] }
        });
        console.log(`📋 طلبات معلقة مخفية: ${before}`);

        if (before === 0) {
            console.log('✅ لا يوجد ما يصلح');
            await mongoose.disconnect();
            process.exit(0);
        }

        const result = await Conversation.updateMany(
            { status: 'pending', hiddenBy: { $exists: true, $ne: [] } },
            { $set: { hiddenBy: [] } }
        );

        console.log(`✅ تم تعديل: ${result.modifiedCount} طلب`);

        const after = await Conversation.countDocuments({
            status: 'pending',
            hiddenBy: { $exists: true, $ne: [] }
        });
        console.log(`📋 طلبات معلقة مخفية الآن: ${after}`);

        await mongoose.disconnect();
        process.exit(0);
    } catch (err) {
        console.error('❌ خطأ:', err);
        process.exit(1);
    }
})();
