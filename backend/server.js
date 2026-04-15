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
const validateEnv = require('./config/validateEnv');
validateEnv(); // التحقق من متغيرات البيئة قبل بدء التشغيل
const connectDB = require('./config/database');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const User = require('./models/User');
const Conversation = require('./models/Conversation');
const ChatRoom = require('./models/ChatRoom');
const BannedWord = require('./models/BannedWord');

// الاتصال بقاعدة البيانات
connectDB();

// Helper: تحويل المسار النسبي إلى URL كامل
const getFullUrl = (imgPath) => {
    if (!imgPath) return null;
    if (imgPath.startsWith('http')) return imgPath;
    const baseUrl = process.env.BASE_URL || 'https://halachat.khalafiati.io';
    return `${baseUrl}${imgPath}`;
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
    pingTimeout: 60000,      // 60 ثانية قبل اعتبار الاتصال مقطوع
    pingInterval: 25000,     // فحص كل 25 ثانية
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
global.io = io;
global.connectedUsers = new Map();

// Socket.IO Rate Limiter (محسّن - حد أقصى للذاكرة)
const socketRateLimits = new Map();
const MAX_RATE_LIMIT_ENTRIES = 10000; // حد أقصى لعدد المدخلات

function checkSocketRate(socketId, event, maxPerMinute = 30) {
    const key = `${socketId}:${event}`;
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
app.use('/api/auth/forgot-password', authLimiter);
app.use('/api/auth/reset-password', authLimiter);

// 5. Body parser
app.use(express.json({ limit: '10mb' })); // تحديد حجم الطلبات
app.use(express.urlencoded({ extended: true }));

// 6. Data Sanitization - حماية من NoSQL Injection
app.use(mongoSanitize());

// 7. Prevent Parameter Pollution
app.use(hpp());

// 8. Static Files - تقديم الملفات المرفوعة
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
    matches: require('./routes/matches')
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

    // إضافة المستخدم إلى قائمة المتصلين
    connectedUsers.set(socket.userId, {
        socketId: socket.id,
        user: socket.user,
        connectedAt: new Date()
    });

    // تحديث حالة المستخدم: متصل
    await User.findByIdAndUpdate(socket.userId, {
        isOnline: true,
        lastLogin: new Date()
    });

    // إبلاغ الآخرين أن المستخدم متصل
    socket.broadcast.emit('user:online', { userId: socket.userId });

    // انضم لغرفته الخاصة (للرسائل الخاصة)
    socket.join(`user:${socket.userId}`);

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
        if (!checkSocketRate(socket.id, 'typing', 10)) return;
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
            if (!checkSocketRate(socket.id, 'room-message', 20)) {
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

            // فحص الكلمات المحظورة
            let bannedWordResult = { isClean: true, foundWords: [] };
            if (type === 'text' && content) {
                try {
                    bannedWordResult = await BannedWord.checkText(content, 'word');
                } catch (bwError) {
                    logger.error('خطأ في فحص الكلمات المحظورة:', bwError);
                }
            }

            // تنظيف النص من الكلمات المحظورة
            let filteredContent = null;
            if (!bannedWordResult.isClean) {
                filteredContent = await BannedWord.cleanText(content, '*****');
            }

            // إنشاء الرسالة
            const message = new Message({
                chatType: 'room',
                room: roomId,
                sender: socket.userId,
                content: content,
                type: type,
                filteredContent: filteredContent,
                reviewStatus: !bannedWordResult.isClean ? 'pending' : 'none',
                hasBannedWords: !bannedWordResult.isClean,
                bannedWordsFound: bannedWordResult.foundWords.map(w => ({
                    word: w.word,
                    severity: w.severity,
                    action: w.action
                })),
                bannedWordSeverity: bannedWordResult.highestSeverity || null
            });
            await message.save();

            // تنبيه الأدمن + تحذير المرسل + نظام مخالفات يومي تصاعدي
            if (!bannedWordResult.isClean) {
                const today = new Date().toISOString().split('T')[0];
                const roomUser = await User.findById(socket.userId);
                if (roomUser.dailyViolationDate !== today) {
                    roomUser.dailyViolationCount = 0;
                    roomUser.dailyViolationDate = today;
                }
                roomUser.dailyViolationCount += 1;
                roomUser.violationCount += 1;

                const dailyRemaining = Math.max(0, 5 - roomUser.dailyViolationCount);
                let roomAutoSuspended = false;
                let roomSuspendDays = 0;

                if (roomUser.dailyViolationCount >= 5) {
                    roomAutoSuspended = true;
                    roomUser.suspensionCount = (roomUser.suspensionCount || 0) + 1;
                    if (roomUser.suspensionCount === 1) roomSuspendDays = 1;
                    else if (roomUser.suspensionCount === 2) roomSuspendDays = 3;
                    else if (roomUser.suspensionCount === 3) roomSuspendDays = 7;
                    else roomSuspendDays = 36500;

                    roomUser.isActive = false;
                    roomUser.suspendedUntil = new Date(Date.now() + roomSuspendDays * 24 * 60 * 60 * 1000);
                    roomUser.suspendReason = roomSuspendDays >= 36500
                        ? 'حظر دائم - تكرار المخالفات'
                        : `تعليق تلقائي ${roomSuspendDays} يوم`;
                    roomUser.warnings.push({ reason: roomUser.suspendReason, action: 'auto_suspend', date: new Date() });
                    roomUser.dailyViolationCount = 0;
                }
                await roomUser.save();

                io.emit('banned-word-alert', {
                    messageId: message._id, roomId, roomName: chatRoom.name,
                    senderId: socket.userId, senderName: socket.user.name,
                    content: content.substring(0, 100),
                    wordsFound: bannedWordResult.foundWords.map(w => w.word),
                    severity: bannedWordResult.highestSeverity,
                    chatType: 'room', timestamp: new Date()
                });
                io.to(`user:${socket.userId}`).emit('banned-word-warning', {
                    title: roomAutoSuspended ? '🚫 تم تعليق حسابك' : '⚠️ تنبيه',
                    body: roomAutoSuspended
                        ? (roomSuspendDays >= 36500 ? 'تم حظر حسابك نهائياً.' : `تم تعليق حسابك لمدة ${roomSuspendDays} يوم.`)
                        : `رسالتك تحتوي على كلمات محظورة! متبقي ${dailyRemaining} مخالفات اليوم.`,
                    violationCount: roomUser.dailyViolationCount, remaining: dailyRemaining, suspended: roomAutoSuspended
                });

                if (roomAutoSuspended) {
                    socket.disconnect(true);
                }

                // إشعار push
                const Notification = require('./models/Notification');
                const notifTitle = roomAutoSuspended ? '🚫 تم تعليق حسابك' : '⚠️ مخالفة';
                const notifBody = roomAutoSuspended
                    ? `تم تعليق حسابك لمدة ${roomSuspendDays >= 36500 ? 'دائم' : roomSuspendDays + ' يوم'}.`
                    : `مخالفة ${roomUser.dailyViolationCount}/5 اليوم.`;
                await Notification.create({ title: notifTitle, body: notifBody, type: 'system', targetUsers: [socket.userId], recipients: 'specific' });
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
        if (!checkSocketRate(socket.id, 'typing', 10)) return;
        socket.to(`room-${roomId}`).emit('room-user-typing', {
            roomId,
            userName,
            isTyping
        });
    });

    // إرسال رسالة في المحادثة الخاصة (من تطبيق الموبايل)
    socket.on('send-message', (data) => {
        try {
            if (!checkSocketRate(socket.id, 'send-message', 30)) {
                return socket.emit('error', { message: 'أنت ترسل رسائل بسرعة كبيرة. انتظر قليلاً' });
            }

            const { conversationId, content, type, _id } = data || {};

            if (!conversationId || !content) {
                return socket.emit('error', { message: 'بيانات الرسالة غير مكتملة' });
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
        connectedUsers.delete(socket.userId);

        // تنظيف rate limits
        for (const key of socketRateLimits.keys()) {
            if (key.startsWith(socket.id + ':')) {
                socketRateLimits.delete(key);
            }
        }

        // تحديث حالة المستخدم: غير متصل
        await User.findByIdAndUpdate(socket.userId, {
            isOnline: false,
            lastLogin: new Date()
        });

        // إبلاغ الآخرين أن المستخدم قطع الاتصال
        socket.broadcast.emit('user:offline', { userId: socket.userId });

        // إرسال إشعار للجميع بأن المستخدم غير متصل (للتوافق مع الكود القديم)
        io.emit('user-disconnected', {
            userId: socket.userId,
            userName: socket.user.name
        });
    });
});

// معالجة الأخطاء غير المعالجة
process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception:', err.message);
    logger.error(err.stack);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection:', reason);
    // لا نوقف السيرفر لكن نسجل التفاصيل الكاملة
    if (reason instanceof Error) {
        logger.error('Stack:', reason.stack);
    }
});

// تشغيل السيرفر
server.listen(PORT, () => {
    logger.info(`السيرفر يعمل على المنفذ ${PORT}`);
    logger.info(`http://localhost:${PORT}`);
    logger.info(`البيئة: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`Socket.IO جاهز للاتصال`);
});
