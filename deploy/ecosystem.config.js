// PM2 Ecosystem Configuration for Dardashat
module.exports = {
    apps: [
        {
            name: 'dardashat-api',
            script: './backend/server.js',
            cwd: '/var/www/dardashat',
            interpreter: '/root/.nvm/versions/node/v20.20.2/bin/node',
            // Socket.IO يحتاج حالة مشتركة بين العمليات:
            //   بدون REDIS_URL  → عملية واحدة (fork) — الوضع الحالي
            //   مع REDIS_URL    → cluster على كل النوى
            // شغّل: REDIS_URL=redis://127.0.0.1:6379 PM2_INSTANCES=max pm2 reload ecosystem.config.js
            // (ثبّت أولاً: npm i @socket.io/redis-adapter redis)
            instances: process.env.REDIS_URL ? (process.env.PM2_INSTANCES || 'max') : 1,
            exec_mode: process.env.REDIS_URL ? 'cluster' : 'fork',
            watch: false,
            max_memory_restart: '800M', // زيادة الحد لمنع إعادة التشغيل المتكرر
            env: {
                NODE_ENV: 'production',
                PORT: 5005,
                // ضع REDIS_URL هنا (أو في البيئة) لتفعيل cluster mode
                ...(process.env.REDIS_URL ? { REDIS_URL: process.env.REDIS_URL } : {})
            },
            error_file: '/var/log/dardashat/api-error.log',
            out_file: '/var/log/dardashat/api-out.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss',
            merge_logs: true,
            autorestart: true,
            max_restarts: 10,
            restart_delay: 5000,
            // Graceful shutdown
            kill_timeout: 5000,
            listen_timeout: 10000,
            // Memory monitoring
            node_args: '--max-old-space-size=700'
        }
    ]
};
