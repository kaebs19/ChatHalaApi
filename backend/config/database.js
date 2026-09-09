// HalaChat Dashboard - Database Configuration
// ملف الاتصال بقاعدة البيانات MongoDB

const mongoose = require('mongoose');

const logger = require('../utils/logger');
const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGODB_URI);

        logger.info(`✅ MongoDB متصل: ${conn.connection.host}`);
        logger.info(`📁 قاعدة البيانات: ${conn.connection.name}`);

        // معالجة أحداث الاتصال
        mongoose.connection.on('error', (err) => {
            logger.error('❌ خطأ في MongoDB:', err.message);
        });

        mongoose.connection.on('disconnected', () => {
            logger.warn('⚠️  MongoDB انقطع الاتصال');
        });

        mongoose.connection.on('reconnected', () => {
            logger.info('✅ MongoDB أعاد الاتصال');
        });

        // إغلاق الاتصال عند إيقاف التطبيق
        process.on('SIGINT', async () => {
            await mongoose.connection.close();
            logger.info('📴 MongoDB: تم إغلاق الاتصال');
            process.exit(0);
        });

    } catch (error) {
        logger.error(`❌ خطأ في الاتصال بقاعدة البيانات: ${error.message}`);
        process.exit(1);
    }
};

module.exports = connectDB;
