// HalaChat Dashboard - Database Configuration
// ملف الاتصال بقاعدة البيانات MongoDB

const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGODB_URI);

        console.log(`✅ MongoDB متصل: ${conn.connection.host}`);
        console.log(`📁 قاعدة البيانات: ${conn.connection.name}`);

        // معالجة أحداث الاتصال
        mongoose.connection.on('error', (err) => {
            console.error('❌ خطأ في MongoDB:', err.message);
        });

        mongoose.connection.on('disconnected', () => {
            console.warn('⚠️  MongoDB انقطع الاتصال');
        });

        mongoose.connection.on('reconnected', () => {
            console.log('✅ MongoDB أعاد الاتصال');
        });

        // إغلاق الاتصال عند إيقاف التطبيق
        process.on('SIGINT', async () => {
            await mongoose.connection.close();
            console.log('📴 MongoDB: تم إغلاق الاتصال');
            process.exit(0);
        });

    } catch (error) {
        console.error(`❌ خطأ في الاتصال بقاعدة البيانات: ${error.message}`);
        process.exit(1);
    }
};

module.exports = connectDB;
