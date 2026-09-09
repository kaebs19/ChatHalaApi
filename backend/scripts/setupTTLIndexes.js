#!/usr/bin/env node
// HalaChat - فهارس TTL لتنظيف البيانات القديمة تلقائياً
//
// ⚠️ إنشاء فهرس TTL يحذف المستندات الأقدم من المدة فوراً وبلا رجعة.
// لذلك السكربت يعمل بوضع dry-run افتراضياً ويعرض ما سيُحذف قبل أي تنفيذ.
//
//   node scripts/setupTTLIndexes.js              # عرض فقط (لا يغيّر شيئاً)
//   node scripts/setupTTLIndexes.js --apply      # إنشاء الفهارس فعلياً
//   node scripts/setupTTLIndexes.js --drop       # إزالة فهارس TTL
//
// المدد قابلة للضبط عبر متغيرات البيئة (بالأيام).

require('dotenv').config();
const mongoose = require('mongoose');

const DAY = 24 * 60 * 60;

const TTL_CONFIG = [
    {
        collection: 'activitylogs',
        field: 'createdAt',
        days: parseInt(process.env.TTL_ACTIVITY_LOGS_DAYS || '90', 10),
        note: 'سجلات النشاط الإداري'
    },
    {
        collection: 'profileviews',
        field: 'createdAt',
        days: parseInt(process.env.TTL_PROFILE_VIEWS_DAYS || '60', 10),
        note: 'سجل زيارات الملفات'
    },
    {
        collection: 'notifications',
        field: 'createdAt',
        days: parseInt(process.env.TTL_NOTIFICATIONS_DAYS || '90', 10),
        note: 'الإشعارات'
    }
];

const indexName = (field) => `${field}_ttl`;

(async () => {
    const apply = process.argv.includes('--apply');
    const drop = process.argv.includes('--drop');

    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;
    console.log(`📁 قاعدة البيانات: ${mongoose.connection.name}\n`);

    for (const cfg of TTL_CONFIG) {
        const col = db.collection(cfg.collection);
        const cutoff = new Date(Date.now() - cfg.days * DAY * 1000);

        const total = await col.estimatedDocumentCount();
        const toDelete = await col.countDocuments({ [cfg.field]: { $lt: cutoff } });

        console.log(`— ${cfg.collection} (${cfg.note})`);
        console.log(`  المدة: ${cfg.days} يوم | الإجمالي: ${total} | سيُحذف: ${toDelete}`);

        if (drop) {
            try {
                await col.dropIndex(indexName(cfg.field));
                console.log('  ✅ أُزيل فهرس TTL');
            } catch (e) {
                console.log('  ℹ️ لا يوجد فهرس TTL لإزالته');
            }
        } else if (apply) {
            await col.createIndex(
                { [cfg.field]: 1 },
                { expireAfterSeconds: cfg.days * DAY, name: indexName(cfg.field), background: true }
            );
            console.log(`  ✅ أُنشئ فهرس TTL — سيبدأ MongoDB الحذف خلال دقيقة`);
        } else {
            console.log('  🔍 وضع العرض فقط — أضف --apply للتنفيذ');
        }
        console.log('');
    }

    if (!apply && !drop) {
        console.log('لم يتغيّر شيء. راجع الأعداد أعلاه ثم شغّل:');
        console.log('  node scripts/setupTTLIndexes.js --apply');
    }

    await mongoose.connection.close();
    process.exit(0);
})().catch(e => {
    console.error('❌ فشل:', e.message);
    process.exit(1);
});
