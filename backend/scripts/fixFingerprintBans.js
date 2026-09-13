#!/usr/bin/env node
// HalaChat - إصلاح الحظر الخاطئ الناتج عن تصادم deviceFingerprint
//
// المشكلة: البصمة كانت هاش لـ (platform|osVersion|appVersion) فقط — أي أن كل
// من يحمل نفس إصدار iOS ونفس إصدار التطبيق له نفس «البصمة». مطابقتها في
// isDeviceBanned وفي حظر «الحسابات الشقيقة» كانت تحظر مستخدمين لا علاقة لهم
// بالجهاز المحظور. الكود صار يتجاهل البصمة؛ هذا السكربت ينظّف آثارها:
//
//   1) تقرير التصادم (كم حساب/سجل يتشارك نفس البصمة)
//   2) فكّ حظر «الحسابات الشقيقة» التي لا يربطها بالجهاز المحظور معرّف فريد
//      (الحظر المباشر من الأدمن يبقى — حتى لو غاب سجل جهازه بسبب نفس العلّة)
//   3) تفريغ حقل deviceFingerprint وإسقاط فهارسه
//
//   node scripts/fixFingerprintBans.js            # عرض فقط (لا يغيّر شيئاً)
//   node scripts/fixFingerprintBans.js --apply    # التنفيذ الفعلي

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const BannedDevice = require('../models/BannedDevice');

const APPLY = process.argv.includes('--apply');
const BATCH = 500;

// نفس تعريف utils/deviceBan: معرّف صالح للمطابقة
const usable = (v) => typeof v === 'string' && v.trim().length >= 8;
const idsOf = (doc) => [doc.persistentDeviceId, doc.deviceToken, doc.fcmToken].filter(usable);

// حظر مباشر: سجّل الأدمن تحذير device_ban على الحساب نفسه بلا إشارة إلى أنه
// حساب «شقيق/مرتبط». هؤلاء قرار إداري مقصود ولا يجوز رفعه هنا.
const LINKED_HINT = /حساب مرتبط|حساب شقيق|صفحة الأجهزة المحظورة/;
const wasBannedDirectly = (u) => (u.warnings || []).some(
    w => w.action === 'device_ban' && !LINKED_HINT.test(w.reason || '')
);

// الحظر «دائم بمعنى حظر جهاز»: التاريخ البعيد (36500 يوماً) الذي يضعه راوت الحظر
const isDeviceBanSentinel = (until) =>
    until && (new Date(until) - Date.now()) > 10 * 365 * 24 * 60 * 60 * 1000;

(async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log(`📁 قاعدة البيانات: ${mongoose.connection.name}`);
    console.log(APPLY ? '⚙️  وضع التنفيذ (--apply)\n' : '👀 وضع العرض فقط — أضف --apply للتنفيذ\n');

    // ─── 1) تقرير التصادم ────────────────────────────────────────────
    const collisions = await User.aggregate([
        { $match: { deviceFingerprint: { $ne: null } } },
        { $group: { _id: '$deviceFingerprint', count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 }
    ]);
    const withFp = await User.countDocuments({ deviceFingerprint: { $ne: null } });
    console.log(`🔎 حسابات تحمل بصمة: ${withFp}`);
    collisions.forEach(c => console.log(`   بصمة ${String(c._id).slice(0, 8)}… يتشاركها ${c.count} حساباً`));
    console.log();

    // ─── 2) المعرّفات المحظورة فعلاً ─────────────────────────────────
    const bannedIdSet = new Set();
    const directlyBanned = new Set(); // مستخدمون أُنشئ لهم سجل جهاز باسمهم
    for await (const d of BannedDevice.find().select('persistentDeviceId deviceToken fcmToken originalUserId').lean()) {
        idsOf(d).forEach(v => bannedIdSet.add(v.trim()));
        if (d.originalUserId) directlyBanned.add(String(d.originalUserId));
    }
    console.log(`🔐 سجلات أجهزة محظورة: ${await BannedDevice.countDocuments()} — معرّفات فريدة: ${bannedIdSet.size}\n`);

    // ─── 3) فحص كل حساب محظور جهازياً ────────────────────────────────
    const collateral = [];   // شقيق بلا معرّف مشترك → خطأ مؤكّد
    const orphanDirect = [];  // حظر مباشر بلا سجل جهاز → يبقى، ويُستكمل سجله
    let kept = 0;
    for await (const u of User.find({ deviceBanned: true })
        .select('_id name persistentDeviceId deviceToken fcmToken deviceInfo isActive suspendedUntil suspendReason warnings')
        .lean()) {
        if (directlyBanned.has(String(u._id))) { kept++; continue; }
        const shares = idsOf(u).some(v => bannedIdSet.has(v.trim()));
        if (shares) { kept++; continue; }
        if (wasBannedDirectly(u)) { orphanDirect.push(u); continue; }
        collateral.push(u);
    }

    console.log(`✅ يبقى الحظر على ${kept} حساباً (معرّف جهاز مطابق أو سجل جهاز باسمه)`);
    console.log(`🔒 حظر مباشر بلا سجل جهاز (يبقى محظوراً، ويُنشأ له سجل): ${orphanDirect.length}`);
    const noIds = collateral.filter(u => idsOf(u).length === 0);
    console.log(`♻️  حسابات شقيقة محظورة بلا أي رابط جهاز حقيقي: ${collateral.length}`);
    console.log(`     منها ${noIds.length} بلا أي معرّف جهاز إطلاقاً (لا يمكن إثبات ولا نفي الجهاز)،`);
    console.log(`     و${collateral.length - noIds.length} لها معرّف فريد لا يطابق أي جهاز محظور (خطأ مؤكّد)`);
    collateral.slice(0, 15).forEach(u => console.log(`   - ${u.name} (${u._id}) — ${u.suspendReason || 'بلا سبب'}`));
    if (collateral.length > 15) console.log(`   … و${collateral.length - 15} غيرها`);
    console.log();

    if (!APPLY) {
        console.log('👀 لم يُغيَّر شيء. للتنفيذ:');
        console.log('   node scripts/fixFingerprintBans.js --apply');
        await mongoose.connection.close();
        process.exit(0);
    }

    // ─── 4) فكّ الحظر على دفعات ──────────────────────────────────────
    let restored = 0;
    for (let i = 0; i < collateral.length; i += BATCH) {
        const chunk = collateral.slice(i, i + BATCH);
        const ops = chunk.map(u => {
            const set = { deviceBanned: false, deviceBannedAt: null };
            // أعِد التفعيل فقط إذا كان التعليق هو تعليق حظر الجهاز نفسه،
            // كي لا نرفع تعليقاً تأديبياً مشروعاً بالخطأ.
            if (u.isActive === false && isDeviceBanSentinel(u.suspendedUntil)) {
                set.isActive = true;
                set.suspendedUntil = null;
                set.suspendReason = null;
            }
            return {
                updateOne: {
                    filter: { _id: u._id },
                    update: {
                        $set: set,
                        $push: { warnings: { reason: 'فكّ حظر جهاز خاطئ (تصادم بصمة إصدار)', action: 'unban' } }
                    }
                }
            };
        });
        const r = await User.bulkWrite(ops, { ordered: false });
        restored += r.modifiedCount || 0;
        console.log(`   ↳ ${Math.min(i + BATCH, collateral.length)}/${collateral.length}`);
    }
    console.log(`♻️  فُكّ الحظر عن ${restored} حساباً\n`);

    // ─── 4ب) استكمال سجلات الأجهزة للحظر المباشر اليتيم ──────────────
    // كان سجلها يُلغى لأن findOne طابق سجلاً آخر بالبصمة المشتركة، فبقي
    // الجهاز نفسه قادراً على التسجيل بحساب جديد.
    let created = 0;
    for (const u of orphanDirect) {
        if (idsOf(u).length === 0) continue;
        const exists = await BannedDevice.findOne({
            $or: idsOf(u).map(v => (
                v === u.persistentDeviceId ? { persistentDeviceId: v }
                    : v === u.deviceToken ? { deviceToken: v } : { fcmToken: v }
            ))
        }).lean();
        if (exists) continue;
        await BannedDevice.create({
            deviceToken: usable(u.deviceToken) ? u.deviceToken : null,
            fcmToken: usable(u.fcmToken) ? u.fcmToken : null,
            persistentDeviceId: usable(u.persistentDeviceId) ? u.persistentDeviceId : null,
            deviceInfo: u.deviceInfo || {},
            originalUserId: u._id,
            originalUserName: u.name,
            reason: u.suspendReason || 'حظر الجهاز نهائياً',
            bannedAt: u.deviceBannedAt || new Date()
        });
        created++;
    }
    console.log(`🔐 أُنشئ ${created} سجل جهاز ناقص للحظر المباشر\n`);

    // ─── 5) تفريغ البصمات وإسقاط الفهارس ─────────────────────────────
    const uRes = await User.updateMany({ deviceFingerprint: { $ne: null } }, { $set: { deviceFingerprint: null } });
    const dRes = await BannedDevice.updateMany({ deviceFingerprint: { $ne: null } }, { $set: { deviceFingerprint: null } });
    console.log(`🧹 تفريغ البصمة: ${uRes.modifiedCount} مستخدماً، ${dRes.modifiedCount} سجل جهاز`);

    for (const [model, name] of [[User, 'users'], [BannedDevice, 'banneddevices']]) {
        try {
            await model.collection.dropIndex('deviceFingerprint_1');
            console.log(`🗑️  أُسقط فهرس deviceFingerprint_1 من ${name}`);
        } catch (e) {
            if (e.codeName !== 'IndexNotFound') console.log(`   (${name}: ${e.message})`);
        }
    }

    console.log('\n✅ تم. أعد تشغيل الخادم كي يُمسح كاش المصادقة.');
    await mongoose.connection.close();
    process.exit(0);
})().catch(e => {
    console.error('❌ فشل:', e.message);
    process.exit(1);
});
