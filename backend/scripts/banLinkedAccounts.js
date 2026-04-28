// حظر الحسابات الشقيقة لكل الأجهزة المحظورة (تشغيل لمرة واحدة)
// يمر على كل BannedDevice، يجد كل الحسابات التي تشترك بنفس
// persistentDeviceId / deviceToken / fcmToken / deviceFingerprint،
// ويحظر كل حساب لم يكن محظوراً سابقاً.
//
// التشغيل: node scripts/banLinkedAccounts.js [--dry-run]

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const BannedDevice = require('../models/BannedDevice');

const DRY = process.argv.includes('--dry-run');

(async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log(`✅ متصل بقاعدة البيانات${DRY ? ' (DRY RUN — لن يُحفظ شيء)' : ''}`);

        const devices = await BannedDevice.find().lean();
        console.log(`📋 عدد الأجهزة المحظورة: ${devices.length}`);

        let totalLinked = 0;
        let totalNewBans = 0;
        let totalSkipped = 0;
        const banUntil = new Date(Date.now() + 36500 * 24 * 60 * 60 * 1000);

        for (const d of devices) {
            // أولوية: persistentDeviceId من السجل، أو من المستخدم الأصلي إذا كان السجل قديم
            let pid = d.persistentDeviceId || null;
            if (!pid && d.originalUserId) {
                const orig = await User.findById(d.originalUserId).select('persistentDeviceId').lean();
                pid = orig?.persistentDeviceId || null;
            }

            const filters = [];
            if (pid) filters.push({ persistentDeviceId: pid });
            if (d.deviceToken) filters.push({ deviceToken: d.deviceToken });
            if (d.fcmToken) filters.push({ fcmToken: d.fcmToken });
            if (d.deviceFingerprint) filters.push({ deviceFingerprint: d.deviceFingerprint });

            if (filters.length === 0) continue;

            // كل الحسابات على نفس الجهاز ما عدا الأدمن والمحظورين أصلاً
            const linked = await User.find({
                $or: filters,
                role: { $ne: 'admin' }
            }).select('_id name deviceBanned isActive').lean();

            totalLinked += linked.length;

            for (const u of linked) {
                if (u.deviceBanned === true && u.isActive === false) {
                    totalSkipped++;
                    continue;
                }

                console.log(`  🔒 حظر: ${u.name} (${u._id})${DRY ? ' [DRY]' : ''}`);

                if (!DRY) {
                    await User.updateOne(
                        { _id: u._id },
                        {
                            $set: {
                                deviceBanned: true,
                                deviceBannedAt: new Date(),
                                isActive: false,
                                suspendedUntil: banUntil,
                                suspendReason: `حساب مرتبط بجهاز محظور (الأصلي: ${d.originalUserName || 'غير معروف'})`
                            },
                            $push: {
                                warnings: {
                                    reason: `حساب شقيق لجهاز محظور (سكريبت تنظيف)`,
                                    action: 'device_ban',
                                    adminId: d.bannedBy || null
                                }
                            }
                        }
                    );

                    // قطع الجلسة الحية إن وُجدت
                    if (global.connectedUsers && global.connectedUsers.has(u._id.toString())) {
                        const info = global.connectedUsers.get(u._id.toString());
                        const sock = global.io?.sockets?.sockets?.get(info.socketId);
                        if (sock) sock.disconnect(true);
                    }
                }
                totalNewBans++;
            }
        }

        console.log('\n📊 الإحصائيات:');
        console.log(`   الحسابات المرتبطة (إجمالي): ${totalLinked}`);
        console.log(`   حسابات محظورة سابقاً (تخطّي): ${totalSkipped}`);
        console.log(`   ${DRY ? 'سيتم حظرها' : 'تم حظرها'}: ${totalNewBans}`);

        await mongoose.disconnect();
        process.exit(0);
    } catch (err) {
        console.error('❌ خطأ:', err);
        process.exit(1);
    }
})();
