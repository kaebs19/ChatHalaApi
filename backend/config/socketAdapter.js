// HalaChat - Socket.IO Redis Adapter (اختياري)
//
// بدون adapter مشترك، كل عملية Node ترى اتصالاتها فقط:
// إرسال io.to('user:X') من عملية لا يصل لمستخدم متصل بعملية أخرى.
// لذلك السيرفر مقيَّد اليوم بعملية واحدة (instances: 1, fork).
//
// عند ضبط REDIS_URL يُفعَّل الـ adapter تلقائياً، ويصبح بالإمكان تشغيل
// PM2 بوضع cluster على عدة نوى.
//
// المتطلبات: npm i @socket.io/redis-adapter redis
// (الحزمتان اختياريتان — السيرفر يعمل بدونهما كما هو)

const logger = require('../utils/logger');
const cache = require('../utils/cache');

// قناة إبطال الكاش بين العمليات
const INVALIDATE_CHANNEL = 'halachat:cache:invalidate';
let publisher = null;

/**
 * يبثّ إبطال مفتاح كاش لكل العمليات.
 * بدون Redis يعمل محلياً فقط (وهو الصحيح لعملية واحدة).
 */
function publishInvalidation(key) {
    if (key === 'banned_words') {
        global.__clearBannedWordsCache?.();
    } else {
        cache.del(key);
    }
    if (publisher) {
        publisher.publish(INVALIDATE_CHANNEL, key).catch(() => { /* الإبطال المحلي تم */ });
    }
}

/**
 * يربط Socket.IO بـ Redis إن توفّر. يرجع true عند النجاح.
 * @param {import('socket.io').Server} io
 */
async function setupSocketAdapter(io) {
    const url = process.env.REDIS_URL;
    if (!url) {
        logger.info('Socket.IO: بلا Redis — عملية واحدة فقط (instances: 1)');
        return false;
    }

    let createAdapter, createClient;
    try {
        ({ createAdapter } = require('@socket.io/redis-adapter'));
        ({ createClient } = require('redis'));
    } catch (e) {
        logger.warn('⚠️ REDIS_URL مضبوط لكن الحزم غير مثبّتة — شغّل: npm i @socket.io/redis-adapter redis');
        return false;
    }

    try {
        const pubClient = createClient({ url });
        const subClient = pubClient.duplicate();

        // انقطاع Redis يجب ألا يُسقط السيرفر
        pubClient.on('error', (err) => logger.error('Redis (pub):', err.message));
        subClient.on('error', (err) => logger.error('Redis (sub):', err.message));

        await Promise.all([pubClient.connect(), subClient.connect()]);
        io.adapter(createAdapter(pubClient, subClient));

        // قناة منفصلة لإبطال الكاش — لا تخلط مع قنوات الـ adapter
        publisher = pubClient.duplicate();
        const invalidateSub = pubClient.duplicate();
        publisher.on('error', (err) => logger.error('Redis (invalidate-pub):', err.message));
        invalidateSub.on('error', (err) => logger.error('Redis (invalidate-sub):', err.message));
        await Promise.all([publisher.connect(), invalidateSub.connect()]);

        // ⚠️ كاش المصادقة داخل الذاكرة: بدون هذا البث يبقى مستخدم محظور
        // قادراً على الوصول عبر العمليات الأخرى حتى انتهاء مدة الكاش
        await invalidateSub.subscribe(INVALIDATE_CHANNEL, (key) => {
            if (key === 'banned_words') {
                global.__clearBannedWordsCache?.();
            } else {
                cache.del(key);
            }
        });

        global.publishCacheInvalidation = publishInvalidation;

        logger.info('✅ Socket.IO: Redis adapter مفعّل — cluster mode + إبطال كاش موزّع');
        return true;
    } catch (e) {
        logger.error('❌ فشل تفعيل Redis adapter — المتابعة بعملية واحدة:', e.message);
        return false;
    }
}

module.exports = { setupSocketAdapter, publishInvalidation, INVALIDATE_CHANNEL };
