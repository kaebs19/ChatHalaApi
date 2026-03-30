// PM2 Ecosystem Configuration for HalaChat
module.exports = {
    apps: [
        {
            name: 'halachat-api',
            script: './backend/server.js',
            cwd: '/var/www/HalaChat',
            // ⚠️ ملاحظة: Socket.IO يحتاج sticky sessions مع cluster mode
            // إذا عندك Redis adapter لـ Socket.IO، فعّل cluster mode
            // بدون Redis: استخدم fork mode مع instance واحد
            instances: 1,
            exec_mode: 'fork',
            watch: false,
            max_memory_restart: '800M', // زيادة الحد لمنع إعادة التشغيل المتكرر
            env: {
                NODE_ENV: 'production',
                PORT: 5001
            },
            error_file: '/var/log/halachat/api-error.log',
            out_file: '/var/log/halachat/api-out.log',
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
