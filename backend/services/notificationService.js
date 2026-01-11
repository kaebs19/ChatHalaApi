// Notification Service - خدمة الإشعارات
// يدعم APNs (Apple Push Notifications) و Firebase (للمستقبل)

const fs = require('fs');
const path = require('path');
const apnsConfig = require('../config/apns-config');

class NotificationService {
    constructor() {
        this.apnsProvider = null;
        this.initialized = false;
    }

    // تهيئة APNs Provider
    async initializeAPNs() {
        try {
            // التحقق من وجود ملف المفتاح
            const keyPath = apnsConfig.apns.keyPath;

            if (!fs.existsSync(keyPath)) {
                console.warn('⚠️ ملف مفتاح APNs غير موجود:', keyPath);
                console.warn('⚠️ يرجى وضع ملف AuthKey_43J3HP6K23.p8 في مجلد config');
                return false;
            }

            // هنا يمكن استخدام مكتبة مثل node-apn أو apn
            // للتبسيط، سنستخدم نسخة تجريبية

            this.apnsConfig = apnsConfig.apns;
            this.initialized = true;

            console.log('✅ تم تهيئة APNs بنجاح');
            console.log(`   Team ID: ${apnsConfig.developer.teamId}`);
            console.log(`   Bundle ID: ${apnsConfig.apns.bundleId}`);
            console.log(`   البيئة: ${apnsConfig.apns.production ? 'Production' : 'Development'}`);

            return true;
        } catch (error) {
            console.error('❌ خطأ في تهيئة APNs:', error.message);
            return false;
        }
    }

    // إرسال إشعار عبر APNs
    async sendAPNsNotification(deviceToken, notification) {
        try {
            if (!this.initialized) {
                console.log('⚠️ APNs غير مُهيأ، استخدام وضع التجربة');
                return this.mockSendNotification(deviceToken, notification);
            }

            // هنا يتم الإرسال الفعلي عبر APNs
            // يحتاج تثبيت: npm install apn
            /*
            const apn = require('apn');

            const provider = new apn.Provider({
                token: {
                    key: fs.readFileSync(this.apnsConfig.keyPath),
                    keyId: this.apnsConfig.keyId,
                    teamId: this.apnsConfig.teamId
                },
                production: this.apnsConfig.production
            });

            const apnNotification = new apn.Notification();
            apnNotification.alert = {
                title: notification.title,
                body: notification.body
            };
            apnNotification.topic = this.apnsConfig.bundleId;
            apnNotification.badge = notification.badge || 1;
            apnNotification.sound = notification.sound || 'default';
            apnNotification.payload = notification.data || {};
            apnNotification.priority = notification.priority === 'high' ? 10 : 5;

            const result = await provider.send(apnNotification, deviceToken);

            if (result.failed.length > 0) {
                throw new Error(result.failed[0].response.reason);
            }

            return { success: true, sent: result.sent.length };
            */

            // نسخة تجريبية
            return this.mockSendNotification(deviceToken, notification);

        } catch (error) {
            console.error('❌ خطأ في إرسال إشعار APNs:', error.message);
            throw error;
        }
    }

    // إرسال تجريبي (للاختبار)
    async mockSendNotification(deviceToken, notification) {
        console.log('📱 إرسال إشعار تجريبي...');
        console.log(`   العنوان: ${notification.title}`);
        console.log(`   المحتوى: ${notification.body}`);
        console.log(`   Device Token: ${deviceToken ? deviceToken.substring(0, 20) + '...' : 'N/A'}`);
        console.log(`   النوع: ${notification.type}`);
        console.log(`   الأولوية: ${notification.priority}`);

        // محاكاة تأخير الشبكة
        await new Promise(resolve => setTimeout(resolve, 100));

        return {
            success: true,
            sent: 1,
            mode: 'mock',
            message: 'تم إرسال الإشعار في الوضع التجريبي'
        };
    }

    // إرسال إشعار لمستخدم واحد
    async sendToUser(user, notification) {
        try {
            // التحقق من وجود device token للمستخدم
            const deviceToken = user.deviceToken || null;

            if (!deviceToken) {
                console.log(`⚠️ المستخدم ${user.name} ليس لديه device token`);
                return { success: false, reason: 'no_device_token' };
            }

            // إرسال عبر APNs
            const result = await this.sendAPNsNotification(deviceToken, notification);

            return result;
        } catch (error) {
            console.error(`❌ فشل إرسال إشعار للمستخدم ${user.name}:`, error.message);
            return { success: false, error: error.message };
        }
    }

    // إرسال إشعار لعدة مستخدمين
    async sendToMultipleUsers(users, notification) {
        const results = {
            total: users.length,
            sent: 0,
            failed: 0,
            details: []
        };

        for (const user of users) {
            const result = await this.sendToUser(user, notification);

            if (result.success) {
                results.sent++;
            } else {
                results.failed++;
            }

            results.details.push({
                userId: user._id,
                userName: user.name,
                success: result.success,
                reason: result.reason || result.error
            });
        }

        return results;
    }

    // إرسال إشعار لجميع المستخدمين
    async sendToAllUsers(notification) {
        try {
            const User = require('../models/User');

            // جلب جميع المستخدمين النشطين
            const users = await User.find({
                isActive: true,
                deviceToken: { $exists: true, $ne: null }
            }).select('_id name email deviceToken');

            console.log(`📢 إرسال إشعار لـ ${users.length} مستخدم...`);

            const results = await this.sendToMultipleUsers(users, notification);

            console.log(`✅ تم إرسال ${results.sent} إشعار بنجاح`);
            console.log(`❌ فشل إرسال ${results.failed} إشعار`);

            return results;
        } catch (error) {
            console.error('❌ خطأ في إرسال الإشعارات:', error.message);
            throw error;
        }
    }

    // إنشاء إشعار من نموذج
    createNotificationPayload(data) {
        return {
            title: data.title || 'HalaChat',
            body: data.body || '',
            type: data.type || 'general',
            badge: data.badge || 1,
            sound: data.sound || 'default',
            priority: data.priority || 'normal',
            data: data.data || {}
        };
    }
}

// Singleton instance
const notificationService = new NotificationService();

// تهيئة عند بدء التشغيل
notificationService.initializeAPNs().catch(console.error);

module.exports = notificationService;
