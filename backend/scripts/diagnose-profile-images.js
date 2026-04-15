// تشخيص مشكلة عدم ظهور صور الملف الشخصي
// يفحص: وجود الملفات فعلياً على القرص + صلاحيات القراءة
// التشغيل: node scripts/diagnose-profile-images.js

require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const User = require('../models/User');

(async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ اتصال بقاعدة البيانات\n');

        const uploadsDir = path.join(__dirname, '..', 'uploads');
        console.log(`📁 مجلد uploads: ${uploadsDir}`);
        console.log(`   موجود؟ ${fs.existsSync(uploadsDir) ? '✅ نعم' : '❌ لا'}\n`);

        const users = await User.find({
            profileImage: { $ne: null, $exists: true }
        }).select('name email profileImage').lean();

        console.log(`👥 عدد المستخدمين الذين لديهم صورة: ${users.length}\n`);

        let googleCount = 0;
        let localCount = 0;
        let localMissing = 0;
        let localOk = 0;
        const missingFiles = [];

        for (const u of users) {
            const img = u.profileImage;
            if (!img) continue;

            if (img.startsWith('http')) {
                googleCount++;
                continue;
            }

            localCount++;
            // تحويل /uploads/... إلى مسار فعلي
            const relative = img.startsWith('/') ? img.slice(1) : img;
            const fullPath = path.join(__dirname, '..', relative);

            if (fs.existsSync(fullPath)) {
                localOk++;
            } else {
                localMissing++;
                if (missingFiles.length < 10) {
                    missingFiles.push({ name: u.name, path: img, expected: fullPath });
                }
            }
        }

        console.log('📊 النتائج:');
        console.log(`   🌐 روابط قوقل/خارجية: ${googleCount}`);
        console.log(`   📂 ملفات محلية (uploads): ${localCount}`);
        console.log(`      ✅ موجودة على القرص: ${localOk}`);
        console.log(`      ❌ مفقودة على القرص: ${localMissing}\n`);

        if (missingFiles.length > 0) {
            console.log('⚠️ أمثلة على الملفات المفقودة:');
            missingFiles.forEach(f => {
                console.log(`   - ${f.name}`);
                console.log(`     DB: ${f.path}`);
                console.log(`     متوقع: ${f.expected}`);
            });
            console.log('\n💡 الحل المحتمل:');
            console.log('   1. تأكد أن ملفات uploads تم نسخها للسيرفر عند النشر');
            console.log('   2. تحقق من صلاحيات المجلد: chmod -R 755 /var/www/HalaChat/backend/uploads');
            console.log('   3. تحقق من nginx alias يشير للمسار الصحيح');
        }

        await mongoose.disconnect();
        process.exit(0);
    } catch (err) {
        console.error('❌ خطأ:', err);
        process.exit(1);
    }
})();
