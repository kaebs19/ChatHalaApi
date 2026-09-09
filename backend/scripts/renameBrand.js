#!/usr/bin/env node
// HalaChat → دردشات: تحديث الاسم المخزَّن في قاعدة البيانات
//
// القيم الافتراضية في models/Settings.js تُطبَّق على المستندات الجديدة فقط،
// أما مستند الإعدادات الموجود فيحمل الاسم القديم ويظهر للمستخدمين.
//
//   node scripts/renameBrand.js           # عرض فقط
//   node scripts/renameBrand.js --apply   # تنفيذ
//
// النطاقات و bundle ID والهوية التقنية خارج نطاق هذا السكربت عمداً.

require('dotenv').config();
const mongoose = require('mongoose');
const logger = require('../utils/logger');

const OLD = ['HalaChat', 'ChatHala', 'هلا شات', 'شات هلا'];
const NEW_AR = 'دردشات';
const NEW_EN = 'Dardashat';

// الحقول النصية التي يراها المستخدم
const FIELDS = ['appName', 'privacyPolicy', 'termsOfService', 'aboutApp'];

function rename(text) {
    if (typeof text !== 'string') return text;
    let out = text;
    out = out.replace(/هلا شات|شات هلا/g, NEW_AR);
    out = out.replace(/HalaChat|ChatHala/g, NEW_EN);
    return out;
}

(async () => {
    const apply = process.argv.includes('--apply');
    await mongoose.connect(process.env.MONGODB_URI);
    const Settings = require('../models/Settings');

    const docs = await Settings.find();
    if (docs.length === 0) {
        console.log('لا يوجد مستند إعدادات — القيم الافتراضية الجديدة ستُطبَّق تلقائياً.');
        await mongoose.connection.close();
        return;
    }

    let changes = 0;
    for (const doc of docs) {
        for (const field of FIELDS) {
            const before = doc[field];
            if (typeof before !== 'string') continue;
            const after = rename(before);
            if (before === after) continue;

            changes++;
            const preview = (t) => t.length > 70 ? t.slice(0, 70) + '…' : t;
            console.log(`\n— ${field}`);
            console.log(`  قبل : ${preview(before)}`);
            console.log(`  بعد : ${preview(after)}`);

            if (apply) doc[field] = after;
        }
        if (apply && doc.isModified()) await doc.save();
    }

    console.log(`\nحقول ستتغيّر: ${changes}`);
    if (!apply && changes > 0) {
        console.log('وضع العرض فقط — أضف --apply للتنفيذ.');
    } else if (apply) {
        console.log('✅ تم التحديث.');
    }

    // تذكير بما هو خارج قاعدة البيانات
    console.log('\nتذكير: EMAIL_FROM_NAME في ملف .env على السيرفر يحتاج تحديثاً يدوياً.');

    await mongoose.connection.close();
    process.exit(0);
})().catch(e => { console.error('❌ فشل:', e.message); process.exit(1); });
