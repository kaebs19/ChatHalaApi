// Firebase Admin SDK Configuration
// تكوين Firebase للإشعارات الفورية (Push Notifications)

const admin = require('firebase-admin');
const logger = require('../utils/logger');
const path = require('path');

// تحميل ملف بيانات الاعتماد
const serviceAccount = require('./serviceAccount.json');

// تهيئة Firebase Admin (مع تجنب التهيئة المكررة)
let firebaseApp;

try {
    if (admin.apps.length) {
        firebaseApp = admin.app();
    } else {
        firebaseApp = admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            projectId: serviceAccount.project_id
        });
    }
    logger.info('✅ Firebase Admin SDK تم تهيئته بنجاح');
} catch (error) {
    logger.error('❌ خطأ في تهيئة Firebase:', error.message);
}

// الحصول على خدمة المراسلة
const messaging = admin.messaging();


// ═══════════════════════════════════════════════════════════════════
// بناء إعدادات APNs موحّدة
// ═══════════════════════════════════════════════════════════════════
// ⚠️ كان هنا 'content-available': 1 بلا 'apns-push-type' — وهو ما يجعل iOS
// يعامل الإشعار أحياناً كـ silent فيصدر صوتاً بلا banner. الإصلاح طُبِّق سابقاً
// في services/notificationService.js فقط، بينما هذا هو المسار الأساسي (FCM).
const APNS_EXPIRATION_HOURS = 24;

// FCM يرفض أي قيمة غير نصية في data — القيم الكائنية كانت تُسقط الإرسال بصمت
const stringifyData = (data = {}) => Object.fromEntries(
    Object.entries(data)
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v)])
);

const buildApnsConfig = (data = {}) => {
    // تجميع إشعارات نفس المحادثة في iOS
    const threadId = data.conversationId || data.threadId || 'default';

    const aps = {
        sound: 'default',
        badge: data.badge ? parseInt(data.badge) : 1,
        'mutable-content': 1,
        'thread-id': String(threadId).substring(0, 64)
    };

    // subtitle يتطلب alert صريحاً (FCM لا يضيفه من notification)
    if (data.subtitle && data.title) {
        aps.alert = { title: String(data.title), subtitle: String(data.subtitle), body: String(data.body || '') };
    }
    if (data.category) aps.category = String(data.category);

    return {
        headers: {
            'apns-priority': '10',
            // alert = يعرض banner (وليس silent)
            'apns-push-type': 'alert',
            // ⚠️ كان '0' = "سلّم الآن أو أسقط" — أي جهاز مقفل/بلا شبكة يفقد الإشعار
            // نهائياً. الآن APNs يحتفظ به ويعيد المحاولة لمدة يوم.
            'apns-expiration': String(Math.floor(Date.now() / 1000) + APNS_EXPIRATION_HOURS * 3600)
        },
        payload: { aps }
    };
};

// أكواد FCM التي تعني أن التوكن ميّت ويجب حذفه من المستخدم
// ملاحظة: لا نُدرج 'messaging/invalid-argument' — فهي تُرفع أيضاً عند خطأ في
// الحمولة، فحذف التوكن عندها يقتل إشعارات مستخدم سليم بسبب خطأ برمجي عندنا.
const DEAD_TOKEN_CODES = new Set([
    'messaging/registration-token-not-registered',
    'messaging/invalid-registration-token'
]);

const isDeadToken = (error) => !!error && DEAD_TOKEN_CODES.has(error.code);

/**
 * إرسال إشعار لجهاز واحد
 * @param {string} token - FCM Token للجهاز
 * @param {object} notification - عنوان ونص الإشعار
 * @param {object} data - بيانات إضافية
 */
const sendToDevice = async (token, notification, data = {}) => {
    try {
        const message = {
            token,
            notification: {
                title: notification.title,
                body: notification.body
            },
            data: stringifyData({
                ...data,
                title: notification.title,
                body: notification.body,
                click_action: 'FLUTTER_NOTIFICATION_CLICK'
            }),
            apns: buildApnsConfig({ ...data, title: notification.title, body: notification.body }),
            android: {
                priority: 'high',
                notification: {
                    sound: 'default',
                    channelId: 'halachat_channel'
                }
            }
        };

        const response = await messaging.send(message);
        logger.info('✅ تم إرسال الإشعار بنجاح:', response);
        return { success: true, messageId: response };
    } catch (error) {
        logger.error('❌ خطأ في إرسال الإشعار:', error.message);
        // التوكن الميّت يُبلَّغ عنه ليحذفه المستدعي من المستخدم
        return { success: false, error: error.message, deadToken: isDeadToken(error) };
    }
};

/**
 * إرسال إشعار لعدة أجهزة
 * @param {string[]} tokens - قائمة FCM Tokens
 * @param {object} notification - عنوان ونص الإشعار
 * @param {object} data - بيانات إضافية
 */
const sendToMultipleDevices = async (tokens, notification, data = {}) => {
    if (!tokens || tokens.length === 0) {
        return { success: false, error: 'لا توجد أجهزة للإرسال' };
    }

    try {
        const message = {
            notification: {
                title: notification.title,
                body: notification.body
            },
            data: stringifyData({
                ...data,
                title: notification.title,
                body: notification.body,
                click_action: 'FLUTTER_NOTIFICATION_CLICK'
            }),
            apns: buildApnsConfig({ ...data, title: notification.title, body: notification.body }),
            android: {
                priority: 'high',
                notification: {
                    sound: 'default',
                    channelId: 'halachat_channel'
                }
            },
            tokens
        };

        const response = await messaging.sendEachForMulticast(message);

        logger.info(`✅ تم إرسال ${response.successCount} إشعار من أصل ${tokens.length}`);

        // تتبع التوكنات الفاشلة لحذفها لاحقاً
        const failedTokens = [];
        const deadTokens = [];
        response.responses.forEach((resp, idx) => {
            if (!resp.success) {
                failedTokens.push(tokens[idx]);
                if (isDeadToken(resp.error)) deadTokens.push(tokens[idx]);
                logger.error(`❌ فشل إرسال للتوكن ${idx}:`, resp.error?.message);
            }
        });

        return {
            success: true,
            successCount: response.successCount,
            failureCount: response.failureCount,
            failedTokens,
            deadTokens
        };
    } catch (error) {
        logger.error('❌ خطأ في إرسال الإشعارات المتعددة:', error.message);
        return { success: false, error: error.message };
    }
};

/**
 * إرسال إشعار لموضوع (Topic)
 * @param {string} topic - اسم الموضوع
 * @param {object} notification - عنوان ونص الإشعار
 * @param {object} data - بيانات إضافية
 */
const sendToTopic = async (topic, notification, data = {}) => {
    try {
        const message = {
            topic,
            notification: {
                title: notification.title,
                body: notification.body
            },
            data: {
                ...data,
                click_action: 'FLUTTER_NOTIFICATION_CLICK'
            },
            apns: {
                payload: {
                    aps: {
                        sound: 'default'
                    }
                }
            },
            android: {
                priority: 'high',
                notification: {
                    sound: 'default',
                    channelId: 'halachat_channel'
                }
            }
        };

        const response = await messaging.send(message);
        logger.info(`✅ تم إرسال الإشعار للموضوع ${topic}:`, response);
        return { success: true, messageId: response };
    } catch (error) {
        logger.error('❌ خطأ في إرسال الإشعار للموضوع:', error.message);
        return { success: false, error: error.message };
    }
};

/**
 * اشتراك مستخدم في موضوع
 * @param {string} token - FCM Token
 * @param {string} topic - اسم الموضوع
 */
const subscribeToTopic = async (token, topic) => {
    try {
        const response = await messaging.subscribeToTopic(token, topic);
        logger.info(`✅ تم الاشتراك في الموضوع ${topic}`);
        return { success: true, response };
    } catch (error) {
        logger.error('❌ خطأ في الاشتراك بالموضوع:', error.message);
        return { success: false, error: error.message };
    }
};

/**
 * إلغاء اشتراك مستخدم من موضوع
 * @param {string} token - FCM Token
 * @param {string} topic - اسم الموضوع
 */
const unsubscribeFromTopic = async (token, topic) => {
    try {
        const response = await messaging.unsubscribeFromTopic(token, topic);
        logger.info(`✅ تم إلغاء الاشتراك من الموضوع ${topic}`);
        return { success: true, response };
    } catch (error) {
        logger.error('❌ خطأ في إلغاء الاشتراك من الموضوع:', error.message);
        return { success: false, error: error.message };
    }
};

module.exports = {
    admin,
    messaging,
    sendToDevice,
    sendToMultipleDevices,
    sendToTopic,
    subscribeToTopic,
    unsubscribeFromTopic
};
