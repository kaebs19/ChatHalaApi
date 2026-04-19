// HalaChat - Track User IP
// تسجيل عناوين IP المستخدم للتدقيق (audit) — لا يُستخدم للحظر التلقائي

const MAX_IPS_PER_USER = 10;

/**
 * تحديث knownIPs للمستخدم بناءً على الطلب الحالي.
 * إذا كان IP موجوداً: يزيد count ويحدّث lastSeen.
 * إذا جديد: يضيفه (مع قص القائمة إلى 10).
 *
 * ملاحظة: لا يستدعي user.save() — المستدعي مسؤول عن الحفظ.
 */
const trackUserIP = (user, req) => {
    try {
        const ip = req.ip || req.connection?.remoteAddress || null;
        if (!ip) return;

        const userAgent = (req.headers?.['user-agent'] || '').substring(0, 200);
        const now = new Date();

        if (!Array.isArray(user.knownIPs)) user.knownIPs = [];

        const existing = user.knownIPs.find(e => e.ip === ip);
        if (existing) {
            existing.lastSeen = now;
            existing.count = (existing.count || 1) + 1;
            if (userAgent) existing.userAgent = userAgent;
        } else {
            user.knownIPs.push({ ip, userAgent, firstSeen: now, lastSeen: now, count: 1 });
        }

        // حافظ على آخر MAX_IPS_PER_USER فقط (الأحدث lastSeen)
        if (user.knownIPs.length > MAX_IPS_PER_USER) {
            user.knownIPs = user.knownIPs
                .sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen))
                .slice(0, MAX_IPS_PER_USER);
        }
    } catch (_) { /* fail silent — لا نعطّل التسجيل/الدخول */ }
};

module.exports = { trackUserIP };
