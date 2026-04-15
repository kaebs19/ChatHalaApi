// HalaChat - Custom Application Error
// لتوحيد الأخطاء في كل المشروع

class AppError extends Error {
    /**
     * @param {String} message - رسالة الخطأ (عربي للمستخدم)
     * @param {Number} statusCode - HTTP status code
     * @param {String} code - code موحّد للـ client (مثلاً USER_NOT_FOUND)
     * @param {Object} [data] - بيانات إضافية للـ response
     */
    constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', data = null) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.data = data;
        this.isOperational = true; // يميّزها عن الأخطاء البرمجية غير المتوقعة
        Error.captureStackTrace(this, this.constructor);
    }
}

// Shortcuts للأنماط الشائعة
AppError.notFound = (message = 'غير موجود', code = 'NOT_FOUND') =>
    new AppError(message, 404, code);

AppError.badRequest = (message = 'طلب غير صالح', code = 'BAD_REQUEST', data = null) =>
    new AppError(message, 400, code, data);

AppError.unauthorized = (message = 'غير مصرح', code = 'UNAUTHORIZED') =>
    new AppError(message, 401, code);

AppError.forbidden = (message = 'ممنوع', code = 'FORBIDDEN', data = null) =>
    new AppError(message, 403, code, data);

AppError.conflict = (message = 'تعارض', code = 'CONFLICT', data = null) =>
    new AppError(message, 409, code, data);

AppError.tooManyRequests = (message = 'محاولات كثيرة', code = 'RATE_LIMIT') =>
    new AppError(message, 429, code);

module.exports = AppError;
