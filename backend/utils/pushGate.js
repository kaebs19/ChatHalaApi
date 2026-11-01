// HalaChat - Push Gate
// هل نرسل Push لمستخدم يبدو متصلاً بالسوكت؟
//
// التطبيق يُعلَّق في الخلفية فيبقى سوكته "حياً" عند الخادم حتى ينتهي heartbeat
// (حتى 30 ثانية)، وكل رسالة في هذه المدة كانت تضيع بلا إشعار. لذلك نسأل الجهاز
// مباشرة: الإصدارات التي تدعم presence-probe تجيب، ومن لا يجيب يُعامل كغائب.
const logger = require('./logger');

const PROBE_TIMEOUT_MS = 2500;

const liveSockets = (userId) => {
    const entry = global.connectedUsers?.get(String(userId));
    if (!entry) return [];
    return [...entry.sockets]
        .map(sid => global.io?.sockets?.sockets?.get(sid))
        .filter(Boolean);
};

const isForeground = (socket) =>
    socket.timeout(PROBE_TIMEOUT_MS).emitWithAck('presence-probe')
        .then(reply => reply?.active === true)
        .catch(() => false);

const hasForegroundDevice = async (userId) => {
    const sockets = liveSockets(userId);
    if (sockets.length === 0) return false;

    // الإصدارات القديمة لا تجيب على الفحص — نبقي سلوكها كما كان حتى لا يتكرر التنبيه
    if (sockets.some(s => !s.data?.supportsPresenceProbe)) return true;

    const replies = await Promise.all(sockets.map(isForeground));
    return replies.some(Boolean);
};

/**
 * يرسل Push ما لم يكن للمستخدم جهاز في المقدمة. لا تنتظرها قبل رد HTTP:
 * الفحص قد يأخذ PROBE_TIMEOUT_MS.
 */
const pushUnlessForeground = async (userId, send) => {
    try {
        if (await hasForegroundDevice(userId)) {
            logger.debug(`${userId} في المقدمة - لا حاجة لـ Push`);
            return;
        }
        await send();
    } catch (error) {
        logger.error(`فشل إشعار ${userId}:`, error);
    }
};

module.exports = { hasForegroundDevice, pushUnlessForeground, PROBE_TIMEOUT_MS };
