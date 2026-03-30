// سكربت إضافة الكلمات المحظورة الشائعة
// يُشغَّل مرة واحدة: node scripts/seedBannedWords.js

const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const BannedWord = require('../models/BannedWord');

const WORDS = [
    // ========== عربية — خطورة عالية (block) ==========
    { word: 'جنس', type: 'both', severity: 'high', action: 'block' },
    { word: 'سكس', type: 'both', severity: 'high', action: 'block' },
    { word: 'نيك', type: 'both', severity: 'high', action: 'block' },
    { word: 'زب', type: 'both', severity: 'high', action: 'block' },
    { word: 'كس', type: 'both', severity: 'high', action: 'block' },
    { word: 'شرموطة', type: 'both', severity: 'high', action: 'block' },
    { word: 'شرموط', type: 'both', severity: 'high', action: 'block' },
    { word: 'عاهرة', type: 'both', severity: 'high', action: 'block' },
    { word: 'قحبة', type: 'both', severity: 'high', action: 'block' },
    { word: 'طيز', type: 'both', severity: 'high', action: 'block' },
    { word: 'بزاز', type: 'both', severity: 'high', action: 'block' },
    { word: 'لعن', type: 'word', severity: 'high', action: 'block' },
    { word: 'منيوك', type: 'both', severity: 'high', action: 'block' },
    { word: 'خنيث', type: 'both', severity: 'high', action: 'block' },
    { word: 'عرص', type: 'both', severity: 'high', action: 'block' },
    { word: 'ديوث', type: 'both', severity: 'high', action: 'block' },
    { word: 'متناك', type: 'both', severity: 'high', action: 'block' },
    { word: 'زنا', type: 'word', severity: 'high', action: 'block' },
    { word: 'لوطي', type: 'both', severity: 'high', action: 'block' },
    { word: 'فاجرة', type: 'both', severity: 'high', action: 'block' },
    { word: 'مومس', type: 'both', severity: 'high', action: 'block' },
    { word: 'عير', type: 'both', severity: 'high', action: 'block' },
    { word: 'بعبوص', type: 'both', severity: 'high', action: 'block' },
    { word: 'ثدي', type: 'word', severity: 'high', action: 'block' },
    { word: 'حقير', type: 'both', severity: 'high', action: 'block' },

    // ========== إنجليزية — خطورة عالية (block) ==========
    { word: 'fuck', type: 'both', severity: 'high', action: 'block' },
    { word: 'fucking', type: 'both', severity: 'high', action: 'block' },
    { word: 'shit', type: 'both', severity: 'high', action: 'block' },
    { word: 'dick', type: 'both', severity: 'high', action: 'block' },
    { word: 'pussy', type: 'both', severity: 'high', action: 'block' },
    { word: 'ass', type: 'word', severity: 'high', action: 'block' },
    { word: 'asshole', type: 'both', severity: 'high', action: 'block' },
    { word: 'bitch', type: 'both', severity: 'high', action: 'block' },
    { word: 'whore', type: 'both', severity: 'high', action: 'block' },
    { word: 'slut', type: 'both', severity: 'high', action: 'block' },
    { word: 'nigger', type: 'both', severity: 'critical', action: 'ban' },
    { word: 'nigga', type: 'both', severity: 'critical', action: 'ban' },
    { word: 'bastard', type: 'both', severity: 'high', action: 'block' },
    { word: 'cock', type: 'both', severity: 'high', action: 'block' },
    { word: 'cum', type: 'word', severity: 'high', action: 'block' },
    { word: 'porn', type: 'both', severity: 'high', action: 'block' },
    { word: 'nude', type: 'word', severity: 'high', action: 'block' },
    { word: 'naked', type: 'word', severity: 'high', action: 'block' },
    { word: 'boobs', type: 'both', severity: 'high', action: 'block' },
    { word: 'blowjob', type: 'both', severity: 'high', action: 'block' },
    { word: 'handjob', type: 'both', severity: 'high', action: 'block' },

    // ========== عربية — خطورة متوسطة (warn) ==========
    { word: 'حمار', type: 'word', severity: 'medium', action: 'warn' },
    { word: 'غبي', type: 'word', severity: 'medium', action: 'warn' },
    { word: 'احمق', type: 'word', severity: 'medium', action: 'warn' },
    { word: 'أحمق', type: 'word', severity: 'medium', action: 'warn' },
    { word: 'تافه', type: 'word', severity: 'medium', action: 'warn' },
    { word: 'وسخ', type: 'word', severity: 'medium', action: 'warn' },
    { word: 'قذر', type: 'word', severity: 'medium', action: 'warn' },
    { word: 'كلب', type: 'word', severity: 'medium', action: 'warn' },
    { word: 'حيوان', type: 'word', severity: 'medium', action: 'warn' },
    { word: 'منحرف', type: 'word', severity: 'medium', action: 'warn' },
    { word: 'زبالة', type: 'word', severity: 'medium', action: 'warn' },
    { word: 'اخرس', type: 'word', severity: 'medium', action: 'warn' },
    { word: 'انقلع', type: 'word', severity: 'medium', action: 'warn' },

    // ========== إنجليزية — خطورة متوسطة (warn) ==========
    { word: 'stupid', type: 'word', severity: 'medium', action: 'warn' },
    { word: 'idiot', type: 'word', severity: 'medium', action: 'warn' },
    { word: 'dumb', type: 'word', severity: 'medium', action: 'warn' },
    { word: 'loser', type: 'word', severity: 'medium', action: 'warn' },
    { word: 'ugly', type: 'word', severity: 'medium', action: 'warn' },
    { word: 'trash', type: 'word', severity: 'medium', action: 'warn' },
    { word: 'crap', type: 'word', severity: 'medium', action: 'warn' },
    { word: 'damn', type: 'word', severity: 'medium', action: 'warn' },
    { word: 'hell', type: 'word', severity: 'low', action: 'warn' },

    // ========== أسماء محظورة — جنسية (name) ==========
    { word: 'يهودي', type: 'name', severity: 'high', action: 'block' },
    { word: 'صهيوني', type: 'name', severity: 'high', action: 'block' },
    { word: 'اسرائيلي', type: 'name', severity: 'high', action: 'block' },
    { word: 'ايراني', type: 'name', severity: 'medium', action: 'block' },

    // ========== أسماء محظورة — دينية (name) ==========
    { word: 'كافر', type: 'name', severity: 'high', action: 'block' },
    { word: 'ملحد', type: 'name', severity: 'high', action: 'block' },
    { word: 'مرتد', type: 'name', severity: 'high', action: 'block' },
    { word: 'مشرك', type: 'name', severity: 'high', action: 'block' },
    { word: 'زنديق', type: 'name', severity: 'high', action: 'block' },
    { word: 'الشيطان', type: 'name', severity: 'critical', action: 'ban' },
    { word: 'ابليس', type: 'name', severity: 'critical', action: 'ban' },
    { word: 'satan', type: 'name', severity: 'critical', action: 'ban' },
    { word: 'devil', type: 'name', severity: 'critical', action: 'ban' },
    { word: 'lucifer', type: 'name', severity: 'critical', action: 'ban' },

    // ========== أسماء محظورة — سياسية (name) ==========
    { word: 'داعش', type: 'name', severity: 'critical', action: 'ban' },
    { word: 'isis', type: 'name', severity: 'critical', action: 'ban' },
    { word: 'القاعدة', type: 'name', severity: 'critical', action: 'ban' },
    { word: 'طالبان', type: 'name', severity: 'critical', action: 'ban' },
    { word: 'ارهابي', type: 'name', severity: 'critical', action: 'ban' },
    { word: 'terrorist', type: 'name', severity: 'critical', action: 'ban' },
    { word: 'حزب الله', type: 'name', severity: 'high', action: 'block' },
    { word: 'حماس', type: 'name', severity: 'high', action: 'block' },

    // ========== أسماء محظورة — ألقاب مسيئة (name) ==========
    { word: 'admin', type: 'name', severity: 'high', action: 'block' },
    { word: 'مدير', type: 'name', severity: 'high', action: 'block' },
    { word: 'support', type: 'name', severity: 'high', action: 'block' },
    { word: 'دعم فني', type: 'name', severity: 'high', action: 'block' },
    { word: 'halachat', type: 'name', severity: 'high', action: 'block' },
    { word: 'moderator', type: 'name', severity: 'high', action: 'block' },
    { word: 'مشرف', type: 'name', severity: 'high', action: 'block' },
];

async function seed() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/halachat');
        console.log('✅ متصل بقاعدة البيانات');

        let added = 0;
        let skipped = 0;

        for (const item of WORDS) {
            const normalizedWord = item.word.toLowerCase().trim();
            const exists = await BannedWord.findOne({ word: normalizedWord });

            if (exists) {
                skipped++;
                continue;
            }

            await BannedWord.create({
                word: normalizedWord,
                type: item.type,
                severity: item.severity,
                action: item.action,
                isActive: true
            });
            added++;
        }

        console.log(`\n📊 النتيجة:`);
        console.log(`   ✅ تم إضافة: ${added} كلمة`);
        console.log(`   ⏭️  تم تخطي: ${skipped} كلمة (موجودة مسبقاً)`);
        console.log(`   📝 الإجمالي: ${WORDS.length} كلمة\n`);

        await mongoose.disconnect();
        console.log('🔌 تم قطع الاتصال');
        process.exit(0);
    } catch (error) {
        console.error('❌ خطأ:', error.message);
        process.exit(1);
    }
}

seed();
