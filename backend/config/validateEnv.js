// HalaChat - التحقق من متغيرات البيئة عند بدء التشغيل
// يمنع تشغيل السيرفر بدون الإعدادات الأساسية

const validateEnv = () => {
    const required = [
        'MONGODB_URI',
        'JWT_SECRET',
        'PORT'
    ];

    const warnings = [
        'EMAIL_USER',
        'EMAIL_PASSWORD',
        'GOOGLE_CLIENT_ID',
        'APPLE_CLIENT_ID'
    ];

    const missing = required.filter(key => !process.env[key]);

    if (missing.length > 0) {
        console.error('❌ متغيرات بيئة مطلوبة مفقودة:');
        missing.forEach(key => console.error(`   - ${key}`));
        process.exit(1);
    }

    // تحذير من JWT_SECRET الافتراضي
    if (process.env.JWT_SECRET === 'your_super_secret_key_here') {
        if (process.env.NODE_ENV === 'production') {
            console.error('❌ يجب تغيير JWT_SECRET قبل الإنتاج!');
            process.exit(1);
        }
        console.warn('⚠️  تحذير: JWT_SECRET يستخدم القيمة الافتراضية. غيّرها قبل النشر!');
    }

    // تحذير من JWT_SECRET قصير
    if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
        console.warn('⚠️  تحذير: JWT_SECRET قصير جداً. يُنصح بـ 64 حرف على الأقل.');
    }

    // تحذيرات للمتغيرات الاختيارية
    const missingWarnings = warnings.filter(key => !process.env[key]);
    if (missingWarnings.length > 0) {
        console.warn('⚠️  متغيرات بيئة اختيارية مفقودة (بعض الميزات لن تعمل):');
        missingWarnings.forEach(key => console.warn(`   - ${key}`));
    }

    console.log('✅ تم التحقق من متغيرات البيئة بنجاح');
};

module.exports = validateEnv;
