// HalaChat - Simple Logger
// نظام تسجيل بسيط مع timestamps ومستويات

const LOG_LEVELS = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3
};

const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL || 'info'] ?? LOG_LEVELS.info;

function formatTimestamp() {
    return new Date().toISOString();
}

const logger = {
    error(message, ...args) {
        if (currentLevel >= LOG_LEVELS.error) {
            console.error(`[${formatTimestamp()}] [ERROR] ${message}`, ...args);
        }
    },

    warn(message, ...args) {
        if (currentLevel >= LOG_LEVELS.warn) {
            console.warn(`[${formatTimestamp()}] [WARN] ${message}`, ...args);
        }
    },

    info(message, ...args) {
        if (currentLevel >= LOG_LEVELS.info) {
            console.log(`[${formatTimestamp()}] [INFO] ${message}`, ...args);
        }
    },

    debug(message, ...args) {
        if (currentLevel >= LOG_LEVELS.debug) {
            console.log(`[${formatTimestamp()}] [DEBUG] ${message}`, ...args);
        }
    }
};

module.exports = logger;
