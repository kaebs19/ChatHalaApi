// Error Handler Middleware
// معالج أخطاء محسّن ومركزي

const logger = require('../utils/logger');
class ErrorResponse extends Error {
    constructor(message, statusCode) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = true; // خطأ متوقع وليس bug
        Error.captureStackTrace(this, this.constructor);
    }
}

// معالج الأخطاء الرئيسي
const errorHandler = (err, req, res, next) => {
    let error = { ...err };
    error.message = err.message;
    error.statusCode = err.statusCode || 500;

    // ⚠️ كان التسجيل مقصوراً على بيئة التطوير — أي أن كل خطأ 500 في
    // الإنتاج يختفي بصمت ولا أثر له في السجلات.
    // الآن: أخطاء السيرفر (5xx) تُسجَّل دائماً مع سياق الطلب،
    // وأخطاء العميل (4xx) على مستوى debug فقط لتفادي الضجيج.
    const status = error.statusCode || 500;
    const context = {
        method: req.method,
        path: req.originalUrl,
        userId: req.user?._id?.toString() || null,
        ip: req.ip,
        statusCode: status
    };

    if (status >= 500) {
        logger.captureError(err, context);
    } else {
        logger.debug(`خطأ ${status}: ${err.message}`, context);
    }

    // أخطاء Mongoose - Cast Error (معرف غير صحيح)
    if (err.name === 'CastError') {
        const message = 'المعرف المدخل غير صحيح';
        error = new ErrorResponse(message, 400);
    }

    // أخطاء Mongoose - Duplicate Key (مفتاح مكرر)
    if (err.code === 11000) {
        const field = Object.keys(err.keyValue)[0];
        const message = `${field === 'email' ? 'البريد الإلكتروني' : field} موجود بالفعل`;
        error = new ErrorResponse(message, 400);
    }

    // أخطاء Mongoose - Validation Error
    if (err.name === 'ValidationError') {
        const message = Object.values(err.errors).map(val => val.message).join(', ');
        error = new ErrorResponse(message, 400);
    }

    // أخطاء JWT - Token غير صحيح
    if (err.name === 'JsonWebTokenError') {
        const message = 'رمز التوثيق غير صحيح';
        error = new ErrorResponse(message, 401);
    }

    // أخطاء JWT - Token منتهي الصلاحية
    if (err.name === 'TokenExpiredError') {
        const message = 'انتهت صلاحية الجلسة. يرجى تسجيل الدخول مرة أخرى';
        error = new ErrorResponse(message, 401);
    }

    // دعم AppError (له code + data إضافية)
    const responseBody = {
        success: false,
        message: error.message || 'خطأ في السيرفر'
    };
    if (err.code && typeof err.code === 'string' && err.code !== '11000') {
        responseBody.code = err.code;
    }
    if (err.data) {
        responseBody.data = err.data;
    }
    if (process.env.NODE_ENV === 'development') {
        responseBody.error = { message: err.message, stack: err.stack };
    }
    res.status(error.statusCode).json(responseBody);
};

// معالج للطلبات غير الموجودة (404)
const notFound = (req, res, next) => {
    const error = new ErrorResponse(`المسار ${req.originalUrl} غير موجود`, 404);
    next(error);
};

// Async Handler - لتجنب try/catch في كل route
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = {
    ErrorResponse,
    errorHandler,
    notFound,
    asyncHandler
};
