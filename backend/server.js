// HalaChat Dashboard - Backend Server
// ملف السيرفر الرئيسي

const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression'); // gzip compression
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const logger = require('./utils/logger');
const { sweepDeliveredForUser } = require('./utils/deliveryStatus');
const validateEnv = require('./config/validateEnv');
validateEnv(); // التحقق من متغيرات البيئة قبل بدء التشغيل
const connectDB = require('./config/database');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const User = require('./models/User');
const Conversation = require('./models/Conversation');
const ChatRoom = require('./models/ChatRoom');
const BannedWord = require('./models/BannedWord');
const { moderateContent, recordContentViolations } = require('./utils/moderateContent');

// الاتصال بقاعدة البيانات
connectDB();

// Helper: تحويل المسار النسبي إلى URL كامل
const getFullUrl = (imgPath) => {
    if (!imgPath) return null;
    if (imgPath.startsWith('http')) return imgPath;
    const baseUrl = process.env.BASE_URL || 'https://halachat.khalafiati.io';
    return `${baseUrl}${imgPath}`;
};

// Helper: هل المستخدم عضو في المحادثة؟ (مع كاش لكل اتصال socket)
// الأدمن مستثنى (يحتاج متابعة المحادثات من اللوحة)
const isConversationMember = async (socket, conversationId) => {
    if (!conversationId) return false;
    const key = String(conversationId);

    if (socket.data.verifiedConversations?.has(key)) return true;
    if (socket.user.role === 'admin') return true;

    const conversation = await Conversation.findById(key).select('participants').lean();
    if (!conversation) return false;

    const isMember = (conversation.participants || []).some(
        p => p.toString() === socket.userId
    );
    if (isMember) socket.data.verifiedConversations?.add(key);
    return isMember;
};

// Helper: هل يحق للمستخدم الكتابة في الغرفة؟ (الغرف الخاصة تتطلب عضوية)
const canWriteInRoom = (chatRoom, socketOrUser) => {
    const userId = socketOrUser.userId || String(socketOrUser._id);
    const role = socketOrUser.user?.role || socketOrUser.role;
    if (role === 'admin') return true;
    if (chatRoom.accessType !== 'private') return true;
    return (chatRoom.members || []).some(m => m.toString() === userId);
};

// شركاء المحادثات — من يهمّه فعلاً معرفة حضور هذا المستخدم
// ⚠️ كان بث الحضور يذهب لكل المتصلين (broadcast/io.emit): مع N مستخدم متصل
// يصبح كل اتصال أو قطع اتصال N رسالة، أي O(N²) رسائل في الشبكة.
const PRESENCE_PARTNERS_LIMIT = 300;

const getPresencePartners = async (userId) => {
    const conversations = await Conversation.find({
        participants: userId,
        isActive: true,
        status: 'accepted'
    })
        .select('participants')
        .limit(PRESENCE_PARTNERS_LIMIT)
        .lean();

    const partners = new Set();
    for (const conv of conversations) {
        for (const p of conv.participants || []) {
            const pid = p.toString();
            if (pid !== String(userId)) partners.add(pid);
        }
    }
    return [...partners];
};

// يبثّ حالة الحضور لشركاء المحادثات فقط
const emitPresence = async (userId, event, payload) => {
    try {
        const partners = await getPresencePartners(userId);
        for (const pid of partners) {
            io.to(`user:${pid}`).emit(event, payload);
        }
    } catch (e) {
        logger.error(`فشل بث الحضور (${event}):`, e.message);
    }
};

// إنشاء التطبيق
const app = express();

// Trust proxy for Nginx reverse proxy (fixes rate-limiter X-Forwarded-For issue)
app.set('trust proxy', 1);

const server = http.createServer(app);

// إعداد Socket.IO
const io = new Server(server, {
    cors: {
        origin: function (origin, callback) {
            // السماح بالاتصالات بدون origin (تطبيقات الموبايل)
            if (!origin || allowedOrigins.includes(origin)) {
                callback(null, true);
            } else {
                // رفض المصادر غير المسموحة
                callback(new Error('غير مسموح بواسطة CORS'));
            }
        },
        credentials: true
    },
    pingTimeout: 20000,      // 20 ثانية (من 60) — اكتشاف أسرع للانقطاع
    pingInterval: 10000,     // فحص كل 10 ثواني (من 25) — heartbeat أكثر تواتراً
    maxHttpBufferSize: 1e6,  // 1MB حد أقصى للرسالة
    // السماح بدون origin فقط لتطبيقات الموبايل (يمررون التوكن في auth)
    allowRequest: (req, callback) => {
        callback(null, true);
    }
});

// Socket.IO Authentication Middleware
io.use(async (socket, next) => {
    try {
        const token = socket.handshake.auth.token;

        if (!token) {
            return next(new Error('Authentication error: No token provided'));
        }

        // التحقق من Token
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (tokenError) {
            if (tokenError.name === 'TokenExpiredError') {
                // إرسال حدث للعميل لتجديد التوكن بدل قطع الاتصال
                logger.warn('Socket: Token expired, requesting refresh');
                return next(new Error('TOKEN_EXPIRED'));
            }
            return next(new Error('Authentication error: Invalid token'));
        }

        // جلب بيانات المستخدم
        const user = await User.findById(decoded.id).select('-password');

        if (!user) {
            return next(new Error('Authentication error: User not found'));
        }

        if (!user.isActive) {
            return next(new Error('Authentication error: User is not active'));
        }

        // نفس فحص إبطال التوكن الموجود في middleware/auth.js
        if (typeof decoded.tv === 'number' && decoded.tv !== (user.tokenVersion || 0)) {
            return next(new Error('Authentication error: Token revoked'));
        }

        // إضافة بيانات المستخدم إلى socket
        socket.userId = user._id.toString();
        socket.user = user;

        logger.info(`مستخدم معتمد: ${user.name} (${user.email})`);
        next();
    } catch (error) {
        logger.error('خطأ في التحقق من Socket.IO:', error.message);
        next(new Error('Authentication error: Invalid token'));
    }
});

// تخزين اتصالات Socket.IO
// ⚠️ المستخدم قد يكون متصلاً من أكثر من جهاز — لذلك كل مدخل يحمل مجموعة sockets
// وليس socket واحداً. (سابقاً كان الجهاز الثاني يطرد الأول من الخريطة، وقطع اتصال
// أي جهاز يجعل المستخدم "غير متصل" فتُرسَل/تُمنَع الإشعارات بشكل خاطئ)
global.io = io;
global.connectedUsers = new Map();

// فصل كل جلسات المستخدم (عند الحظر/التعليق) — لا جهاز واحد فقط
global.disconnectUserSockets = (userId) => {
    const id = String(userId);
    let count = 0;
    const entry = global.connectedUsers.get(id);
    for (const sid of entry?.sockets || []) {
        const sock = io.sockets.sockets.get(sid);
        if (sock) { sock.disconnect(true); count++; }
    }
    return count;
};

// Socket.IO Rate Limiter (محسّن - حد أقصى للذاكرة)
const socketRateLimits = new Map();
const MAX_RATE_LIMIT_ENTRIES = 10000; // حد أقصى لعدد المدخلات

// ⚠️ المفتاح مبني على userId وليس socket.id — إعادة الاتصال كانت تصفّر العدّاد
// فيتجاوز أي مستخدم الحد بمجرد قطع الاتصال وإعادته
function checkSocketRate(userId, event, maxPerMinute = 30) {
    const key = `${userId}:${event}`;
    const now = Date.now();
    const windowMs = 60 * 1000;

    // حماية من تجاوز الذاكرة
    if (socketRateLimits.size > MAX_RATE_LIMIT_ENTRIES) {
        // مسح أقدم نصف المدخلات
        const entries = Array.from(socketRateLimits.entries());
        const toDelete = entries.slice(0, Math.floor(entries.length / 2));
        toDelete.forEach(([k]) => socketRateLimits.delete(k));
    }

    if (!socketRateLimits.has(key)) {
        socketRateLimits.set(key, [now]);
        return true;
    }

    const timestamps = socketRateLimits.get(key).filter(t => now - t < windowMs);

    if (timestamps.length >= maxPerMinute) {
        socketRateLimits.set(key, timestamps);
        return false;
    }

    timestamps.push(now);
    socketRateLimits.set(key, timestamps);
    return true;
}

// تنظيف rate limits كل دقيقتين (بدل 5)
setInterval(() => {
    const now = Date.now();
    for (const [key, timestamps] of socketRateLimits.entries()) {
        const valid = timestamps.filter(t => now - t < 60000);
        if (valid.length === 0) {
            socketRateLimits.delete(key);
        } else {
            socketRateLimits.set(key, valid);
        }
    }
}, 2 * 60 * 1000);

// الإعدادات الأساسية
const PORT = process.env.PORT || 5000;

// Security Middlewares
// 1. Helmet - حماية HTTP headers
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],  // Swagger UI needs inline scripts
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "wss:", "ws:"],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            frameSrc: ["'none'"],
        }
    },
    crossOriginEmbedderPolicy: false // للسماح بتحميل الصور الخارجية
}));

// 2. Compression - ضغط gzip للردود
app.use(compression({
    level: 6, // مستوى الضغط (1-9)
    threshold: 1024, // ضغط الردود أكبر من 1KB فقط
    filter: (req, res) => {
        // لا تضغط إذا كان الطلب يحتوي على no-compression header
        if (req.headers['x-no-compression']) {
            return false;
        }
        return compression.filter(req, res);
    }
}));

// 3. CORS - السماح بالطلبات من Frontend و Mobile
const allowedOrigins = [
    process.env.FRONTEND_URL || 'http://localhost:3000',
    ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [])
];
app.use(cors({
    origin: function (origin, callback) {
        // السماح بالطلبات بدون origin (مثل تطبيقات الموبايل و Postman)
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('غير مسموح بواسطة CORS'));
        }
    },
    credentials: true
}));

// 4. Rate Limiting - منع الهجمات بالطلبات المتكررة
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 دقيقة
    max: 300, // 300 طلب كحد أقصى (الموبايل يرسل طلبات كثيرة)
    message: {
        success: false,
        message: 'عدد كبير من المحاولات. يرجى المحاولة بعد 15 دقيقة'
    },
    standardHeaders: true,
    legacyHeaders: false,
    // لا تحسب الطلبات الناجحة من الموبايل
    skip: (req) => req.path.includes('/mobile/') && req.method === 'GET',
});
app.use('/api/', limiter);

// Rate limit أكثر صرامة لتسجيل الدخول
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 دقيقة
    max: 20, // 20 محاولة (للتطوير - قلّلها في الإنتاج)
    message: {
        success: false,
        message: 'عدد كبير من محاولات تسجيل الدخول. حاول بعد 15 دقيقة'
    },
    skipSuccessfulRequests: true, // لا تحسب المحاولات الناجحة
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/reset-password', authLimiter);

// rate limit صارم لـ forgot-password — يمنع spam على bounces
// 3 طلبات / ساعة لكل IP (cooldown 5 دقائق لكل بريد منفصل في الـ route)
const forgotPasswordLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // ساعة
    max: 3,
    message: {
        success: false,
        code: 'RATE_LIMITED',
        message: 'محاولات كثيرة. حاول مرة أخرى بعد ساعة'
    },
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api/auth/forgot-password', forgotPasswordLimiter);

// 5. Body parser
app.use(express.json({ limit: '10mb' })); // تحديد حجم الطلبات
app.use(express.urlencoded({ extended: true }));

// 6. Data Sanitization - حماية من NoSQL Injection
app.use(mongoSanitize());

// 7. Prevent Parameter Pollution
app.use(hpp());

// 8. Static Files - تقديم الملفات المرفوعة
// 🔒 صور التوثيق مستثناة: تحتوي صور هوية وتُقدَّم فقط عبر
// GET /api/verifications/file/:filename (أدمن فقط)
app.use('/uploads/verifications', (req, res) => {
    res.status(404).json({ success: false, message: 'غير موجود' });
});
// 🔒 لقطات البلاغات مستثناة كذلك: محتواها محادثات خاصة، ووعدنا المُبلِّغ
// بأن لا أحد يطّلع عليها. تُقدَّم فقط عبر GET /api/reports/evidence/:filename
app.use('/uploads/reports', (req, res) => {
    res.status(404).json({ success: false, message: 'غير موجود' });
});
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Swagger API Documentation
const { setupSwagger } = require('./config/swagger');
setupSwagger(app);

// Route تجريبي للتأكد من عمل السيرفر
app.get('/', (req, res) => {
    res.json({
        message: 'مرحباً بك في HalaChat Dashboard API',
        status: 'working',
        version: '2.1',
        apiVersions: ['v1'],
        docs: '/api/v1/'
    });
});

// Route للتحقق من حالة API
app.get('/api/health', (req, res) => {
    const mongoose = require('mongoose');
    const dbState = mongoose.connection.readyState;
    const dbStatus = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };

    res.status(dbState === 1 ? 200 : 503).json({
        status: dbState === 1 ? 'success' : 'error',
        message: dbState === 1 ? 'السيرفر يعمل بنجاح' : 'مشكلة في الاتصال',
        database: dbStatus[dbState] || 'unknown',
        uptime: Math.floor(process.uptime()) + 's'
    });
});

// نقطة مراقبة تشغيلية (أدمن فقط) — بديل التشخيص عبر السجلات
app.get('/api/metrics', require('./middleware/auth').protect, require('./middleware/auth').adminOnly, (req, res) => {
    const mongoose = require('mongoose');
    const mem = process.memoryUsage();
    const mb = (n) => Math.round(n / 1024 / 1024);

    // توزيع الجلسات: عدد المستخدمين مقابل عدد الاتصالات (تعدد الأجهزة)
    let socketCount = 0;
    for (const entry of connectedUsers.values()) {
        socketCount += entry.sockets?.size || 1;
    }

    res.json({
        success: true,
        data: {
            uptimeSeconds: Math.floor(process.uptime()),
            environment: process.env.NODE_ENV || 'development',
            memory: { rssMB: mb(mem.rss), heapUsedMB: mb(mem.heapUsed), heapTotalMB: mb(mem.heapTotal) },
            database: {
                state: ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState] || 'unknown',
                name: mongoose.connection.name || null
            },
            sockets: {
                onlineUsers: connectedUsers.size,
                openConnections: socketCount,
                adminsConnected: io.sockets.adapter.rooms.get('admins')?.size || 0,
                redisAdapter: !!process.env.REDIS_URL
            },
            cache: require('./utils/cache').getStats(),
            rateLimitEntries: socketRateLimits.size,
            sentry: logger.isSentryEnabled()
        }
    });
});

// Routes - v1 مع توافق عكسي
const apiRoutes = {
    auth: require('./routes/auth'),
    users: require('./routes/users'),
    stats: require('./routes/stats'),
    conversations: require('./routes/conversations'),
    reports: require('./routes/reports'),
    messages: require('./routes/messages'),
    settings: require('./routes/settings'),
    notifications: require('./routes/notifications'),
    'chat-rooms': require('./routes/chatRooms'),
    'activity-logs': require('./routes/activityLogs'),
    'banned-words': require('./routes/bannedWords'),
    mobile: require('./routes/mobile'),
    privacy: require('./routes/privacy'),
    categories: require('./routes/categories'),
    verifications: require('./routes/verifications'),
    appeals: require('./routes/appeals'),
    swipes: require('./routes/swipes'),
    matches: require('./routes/matches'),
    'admin-activity': require('./routes/adminActivity')
};

// تسجيل المسارات مع دعم /api/v1/ و /api/ (للتوافق العكسي)
Object.entries(apiRoutes).forEach(([path, router]) => {
    app.use(`/api/v1/${path}`, router); // المسار الجديد
    app.use(`/api/${path}`, router);     // التوافق العكسي
});

// Error Handlers - يجب أن تكون في النهاية
app.use(notFound); // 404 Handler
app.use(errorHandler); // Error Handler

// Socket.IO Connection Handler
io.on('connection', async (socket) => {
    logger.info(`مستخدم متصل: ${socket.user.name} (${socket.id})`);

    // إضافة الجلسة إلى قائمة المتصلين (تراكمية — تدعم عدة أجهزة)
    const existingEntry = connectedUsers.get(socket.userId);
    const isFirstDevice = !existingEntry;
    if (existingEntry) {
        existingEntry.sockets.add(socket.id);
        existingEntry.socketId = socket.id;   // آخر جهاز (للتوافق مع الكود القديم)
        existingEntry.user = socket.user;
    } else {
        connectedUsers.set(socket.userId, {
            socketId: socket.id,
            sockets: new Set([socket.id]),
            user: socket.user,
            connectedAt: new Date()
        });
    }

    // تحديث حالة المستخدم: متصل
    await User.findByIdAndUpdate(socket.userId, {
        isOnline: true,
        lastLogin: new Date()
    });

    // إبلاغ شركاء المحادثات أن المستخدم متصل (أول جهاز فقط)
    if (isFirstDevice) {
        emitPresence(socket.userId, 'user:online', { userId: socket.userId });
    }

    // انضم لغرفته الخاصة (للرسائل الخاصة)
    socket.join(`user:${socket.userId}`);

    // 🔒 غرفة الأدمن — تنبيهات الإشراف تُرسل إليها فقط
    // (كانت تُبثّ سابقاً لكل المتصلين عبر io.emit وتكشف محتوى الرسائل الخاصة)
    if (socket.user.role === 'admin') {
        socket.join('admins');
    }

    // كاش عضوية المحادثات لهذا الاتصال (يمنع استعلام DB لكل رسالة)
    socket.data.verifiedConversations = new Set();

    // ✓✓ كل رسالة واردة ما زالت 'sent' وصلت جهازه الآن — يُعلَّم التسليم
    // ويُبلَّغ مرسلوها. أول جهاز فقط: الأجهزة الأخرى لنفس المستخدم لا تضيف شيئاً.
    if (isFirstDevice) {
        sweepDeliveredForUser(socket.userId).catch(() => {});
    }

    // إرسال حالة الاتصال للمستخدم
    socket.emit('authenticated', {
        userId: socket.userId,
        userName: socket.user.name,
        email: socket.user.email,
        role: socket.user.role
    });

    // عند الانضمام لمحادثة معينة
    socket.on('join-conversation', async (conversationId) => {
        try {
            // التحقق من وجود المحادثة
            const conversation = await Conversation.findById(conversationId);

            if (!conversation) {
                return socket.emit('error', { message: 'المحادثة غير موجودة' });
            }

            // التحقق من أن المستخدم عضو في المحادثة أو Admin
            const isMember = conversation.participants.some(
                p => p.toString() === socket.userId
            );
            const isAdmin = socket.user.role === 'admin';

            if (!isMember && !isAdmin) {
                return socket.emit('error', { message: 'ليس لديك صلاحية للدخول لهذه المحادثة' });
            }

            socket.join(`conversation-${conversationId}`);
            logger.info(`${socket.user.name} انضم للمحادثة ${conversationId}`);

            // إرسال عدد المتصلين للجميع
            const room = io.sockets.adapter.rooms.get(`conversation-${conversationId}`);
            const onlineCount = room ? room.size : 0;
            io.to(`conversation-${conversationId}`).emit('users-online', { count: onlineCount });
        } catch (error) {
            logger.error('خطأ في join-conversation:', error);
            socket.emit('error', { message: 'حدث خطأ أثناء الانضمام للمحادثة' });
        }
    });

    // عند الانضمام لغرفة محادثة
    socket.on('join-room', async (roomId) => {
        try {
            const chatRoom = await ChatRoom.findById(roomId);

            if (!chatRoom) {
                return socket.emit('error', { message: 'الغرفة غير موجودة' });
            }

            if (!chatRoom.isActive) {
                return socket.emit('error', { message: 'الغرفة غير نشطة' });
            }

            // التحقق من صلاحية الدخول للغرف الخاصة
            if (chatRoom.accessType === 'private') {
                const isMember = chatRoom.members.some(
                    m => m.toString() === socket.userId
                );
                const isAdmin = socket.user.role === 'admin';

                if (!isMember && !isAdmin) {
                    return socket.emit('error', { message: 'ليس لديك صلاحية للدخول لهذه الغرفة' });
                }
            }

            socket.join(`room-${roomId}`);
            logger.info(`${socket.user.name} انضم للغرفة ${roomId}`);

            const room = io.sockets.adapter.rooms.get(`room-${roomId}`);
            const onlineCount = room ? room.size : 0;

            // إرسال عدد المتصلين (للتوافق)
            io.to(`room-${roomId}`).emit('users-online', { count: onlineCount });

            // إشعار دخول عضو جديد
            io.to(`room-${roomId}`).emit('room-member-joined', {
                roomId: roomId,
                user: {
                    _id: socket.userId,
                    name: socket.user.name,
                    profileImage: getFullUrl(socket.user.profileImage)
                },
                onlineCount: onlineCount
            });
        } catch (error) {
            logger.error('خطأ في join-room:', error);
            socket.emit('error', { message: 'حدث خطأ أثناء الانضمام للغرفة' });
        }
    });

    // عند مغادرة محادثة
    socket.on('leave-conversation', (conversationId) => {
        socket.leave(`conversation-${conversationId}`);
        logger.info(`${socket.user.name} غادر المحادثة ${conversationId}`);

        // تحديث عدد المتصلين بعد المغادرة
        setTimeout(() => {
            const room = io.sockets.adapter.rooms.get(`conversation-${conversationId}`);
            const onlineCount = room ? room.size : 0;
            io.to(`conversation-${conversationId}`).emit('users-online', { count: onlineCount });
        }, 100);
    });

    // عند مغادرة غرفة
    socket.on('leave-room', (roomId) => {
        socket.leave(`room-${roomId}`);
        logger.info(`${socket.user.name} غادر الغرفة ${roomId}`);

        setTimeout(() => {
            const room = io.sockets.adapter.rooms.get(`room-${roomId}`);
            const onlineCount = room ? room.size : 0;

            // إرسال عدد المتصلين (للتوافق)
            io.to(`room-${roomId}`).emit('users-online', { count: onlineCount });

            // إشعار خروج عضو
            io.to(`room-${roomId}`).emit('room-member-left', {
                roomId: roomId,
                userId: socket.userId,
                onlineCount: onlineCount
            });
        }, 100);
    });

    // عند الكتابة
    socket.on('typing', ({ conversationId, userName }) => {
        if (!checkSocketRate(socket.userId, 'typing', 10)) return;
        socket.to(`conversation-${conversationId}`).emit('user-typing', {
            conversationId,
            userName,
            isTyping: true
        });
        logger.debug(`${userName} يكتب في المحادثة ${conversationId}`);
    });

    // عند التوقف عن الكتابة
    socket.on('stop-typing', ({ conversationId }) => {
        socket.to(`conversation-${conversationId}`).emit('user-typing', {
            conversationId,
            userName: null,
            isTyping: false
        });
    });

    // ==========================================
    // Socket Events للغرف الجماعية
    // ==========================================

    // إرسال رسالة في الغرفة
    socket.on('room-message', async (data) => {
        try {
            const roomId = data?.roomId;
            let content = data?.content;
            const type = data?.type || 'text';

            // Rate limiting
            if (!checkSocketRate(socket.userId, 'room-message', 20)) {
                return socket.emit('error', { message: 'أنت ترسل رسائل بسرعة كبيرة. انتظر قليلاً' });
            }

            // Message validation
            if (!content || typeof content !== 'string') {
                return socket.emit('error', { message: 'محتوى الرسالة غير صالح' });
            }

            content = content.trim();
            if (content.length === 0 || content.length > 5000) {
                return socket.emit('error', { message: 'الرسالة يجب أن تكون بين 1 و 5000 حرف' });
            }

            const ChatRoom = require('./models/ChatRoom');
            const Message = require('./models/Message');

            // التحقق من وجود الغرفة
            const chatRoom = await ChatRoom.findById(roomId);
            if (!chatRoom || !chatRoom.isActive) {
                return socket.emit('error', { message: 'الغرفة غير موجودة أو غير نشطة' });
            }

            // التحقق من قفل الغرفة
            if (chatRoom.isLocked) {
                return socket.emit('error', { message: 'الغرفة مقفلة' });
            }

            // 🔒 الغرف الخاصة: الكتابة للأعضاء فقط (join-room كان يفحصها لكن الإرسال لا)
            if (!canWriteInRoom(chatRoom, socket)) {
                return socket.emit('error', { message: 'ليس لديك صلاحية للكتابة في هذه الغرفة' });
            }

            // فحص المحتوى عبر الـ helper المركزي (نفس فلترة مسارات HTTP)
            const moderation = await moderateContent(content, type);
            const { bannedWordResult, externalCheck, filteredContent } = moderation;

            // إنشاء الرسالة
            const message = new Message({
                chatType: 'room',
                room: roomId,
                sender: socket.userId,
                content: content,
                type: type,
                ...moderation.messageFields
            });
            await message.save();

            // تسجيل المخالفة عبر violationHelper المركزي
            // ⚠️ كان هنا نسخة يدوية من منطق العقوبات (عدّاد يومي + مدد التعليق)
            // منفصلة عن utils/violationHelper — أي تعديل على السياسة كان يلزم
            // تطبيقه في مكانين، وقد تباعدا فعلاً (هذه النسخة تجاهلت
            // config/moderation ولم تفحص الحسابات الخارجية إطلاقاً)
            if (!bannedWordResult.isClean || externalCheck.hasExternalAccount) {
                const roomUser = await User.findById(socket.userId);
                if (roomUser) {
                    await recordContentViolations({
                        user: roomUser,
                        bannedWordResult,
                        externalCheck,
                        evidence: {
                            messageId: message._id,
                            messageContent: content,
                            messageType: type,
                            roomId,
                            roomName: chatRoom.name,
                            chatType: 'room'
                        }
                    });

                    // الحساب المعلَّق تُقطع كل جلساته
                    if (!roomUser.isActive) {
                        global.disconnectUserSockets(socket.userId);
                    }
                }
            }

            // تحديث آخر رسالة في الغرفة
            chatRoom.lastMessage = {
                content: content?.substring(0, 50),
                sender: socket.userId,
                sentAt: new Date()
            };
            chatRoom.messageCount = (chatRoom.messageCount || 0) + 1;
            await chatRoom.save();

            // إرسال للجميع في الغرفة
            io.to(`room-${roomId}`).emit('new-room-message', {
                _id: message._id,
                roomId: roomId,
                sender: {
                    _id: socket.userId,
                    name: socket.user.name,
                    profileImage: getFullUrl(socket.user.profileImage)
                },
                content: filteredContent || content,
                type: type,
                createdAt: message.createdAt
            });

            logger.info(`رسالة جديدة في الغرفة ${roomId} من ${socket.user.name}`);
        } catch (error) {
            logger.error('خطأ في room-message:', error);
            socket.emit('error', { message: 'فشل في إرسال الرسالة' });
        }
    });

    // الكتابة في الغرفة
    socket.on('room-typing', ({ roomId, userName, isTyping }) => {
        if (!checkSocketRate(socket.userId, 'typing', 10)) return;
        socket.to(`room-${roomId}`).emit('room-user-typing', {
            roomId,
            userName,
            isTyping
        });
    });

    // إرسال رسالة في المحادثة الخاصة (من تطبيق الموبايل)
    socket.on('send-message', async (data) => {
        try {
            if (!checkSocketRate(socket.userId, 'send-message', 30)) {
                return socket.emit('error', { message: 'أنت ترسل رسائل بسرعة كبيرة. انتظر قليلاً' });
            }

            const { conversationId, content, type, _id } = data || {};

            if (!conversationId || !content) {
                return socket.emit('error', { message: 'بيانات الرسالة غير مكتملة' });
            }

            // 🔒 التحقق من عضوية المرسل في المحادثة
            // بدونه: أي مستخدم مسجّل يقدر يحقن رسالة في أي محادثة بمعرفها فقط
            if (!(await isConversationMember(socket, conversationId))) {
                return socket.emit('error', { message: 'ليس لديك صلاحية لهذه المحادثة' });
            }

            // بث الرسالة للمشاركين في المحادثة (ما عدا المرسل)
            socket.to(`conversation-${conversationId}`).emit('new-message', {
                _id,
                conversationId,
                content,
                type: type || 'text',
                sender: {
                    _id: socket.userId,
                    name: socket.user.name,
                    profileImage: getFullUrl(socket.user.profileImage)
                },
                createdAt: new Date()
            });

            logger.info(`رسالة جديدة في المحادثة ${conversationId} من ${socket.user.name}`);
        } catch (error) {
            logger.error('خطأ في send-message:', error);
            socket.emit('error', { message: 'فشل في إرسال الرسالة' });
        }
    });

    // عند قطع الاتصال
    socket.on('disconnect', async () => {
        logger.info(`${socket.user.name} قطع الاتصال (${socket.id})`);

        // إزالة هذه الجلسة فقط — المستخدم يبقى "متصل" ما دام له جهاز آخر
        const entry = connectedUsers.get(socket.userId);
        entry?.sockets?.delete(socket.id);
        const stillOnline = (entry?.sockets?.size || 0) > 0;

        if (!stillOnline) {
            connectedUsers.delete(socket.userId);
        } else if (entry.socketId === socket.id) {
            // حدّث المرجع للجهاز المتبقي
            entry.socketId = entry.sockets.values().next().value;
        }

        // تنظيف rate limits (المفتاح صار userId:event، ينظَّف عند آخر جلسة فقط)
        if (!stillOnline) {
            for (const key of socketRateLimits.keys()) {
                if (key.startsWith(socket.userId + ':')) {
                    socketRateLimits.delete(key);
                }
            }
        }

        // آخر جهاز فقط يُعلِن المستخدم غير متصل
        if (!stillOnline) {
            await User.findByIdAndUpdate(socket.userId, {
                isOnline: false,
                lastLogin: new Date()
            });

            // إبلاغ شركاء المحادثات فقط
            await emitPresence(socket.userId, 'user:offline', { userId: socket.userId });

            // حدث قديم للتوافق — لنفس الجمهور، لا لكل المتصلين
            await emitPresence(socket.userId, 'user-disconnected', {
                userId: socket.userId,
                userName: socket.user.name
            });
        }
    });
});

// معالجة الأخطاء غير المعالجة
process.on('uncaughtException', (err) => {
    logger.captureError(err, { fatal: true, source: 'uncaughtException' });
    // مهلة قصيرة كي يصل التقرير قبل الخروج (PM2 يعيد التشغيل)
    setTimeout(() => process.exit(1), 500).unref();
});

process.on('unhandledRejection', (reason) => {
    // لا نوقف السيرفر لكن نسجل التفاصيل الكاملة
    if (reason instanceof Error) {
        logger.captureError(reason, { source: 'unhandledRejection' });
    } else {
        logger.error('Unhandled Rejection:', reason);
    }
});

// تفعيل Redis adapter إن توفّر (يسمح بتشغيل أكثر من عملية)
const { setupSocketAdapter } = require('./config/socketAdapter');
setupSocketAdapter(io).catch(e => logger.error('setupSocketAdapter:', e.message));

// تشغيل السيرفر
server.listen(PORT, () => {
    logger.info(`السيرفر يعمل على المنفذ ${PORT}`);
    logger.info(`http://localhost:${PORT}`);
    logger.info(`البيئة: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`Socket.IO جاهز للاتصال`);
});
