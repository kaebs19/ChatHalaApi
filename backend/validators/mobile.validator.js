// HalaChat - Mobile API Validators
// قواعد التحقق من بيانات مسارات الموبايل

const { body, param, query } = require('express-validator');

// التحقق من طلب محادثة
const conversationRequestValidation = [
    body('targetUserId')
        .notEmpty().withMessage('معرف المستخدم المستهدف مطلوب')
        .isMongoId().withMessage('معرف المستخدم غير صالح'),
    body('initialMessage')
        .optional()
        .trim()
        .isLength({ max: 1000 }).withMessage('الرسالة الأولى لا يجب أن تتجاوز 1000 حرف'),
    body('isSuperLike')
        .optional()
        .isBoolean().withMessage('isSuperLike يجب أن يكون true أو false')
];

// التحقق من MongoID في params
const mongoIdParam = [
    param('id')
        .isMongoId().withMessage('المعرف غير صالح')
];

// التحقق من إرسال رسالة في الغرفة
const roomMessageValidation = [
    param('id')
        .isMongoId().withMessage('معرف الغرفة غير صالح'),
    body('content')
        .notEmpty().withMessage('محتوى الرسالة مطلوب')
        .trim()
        .isLength({ min: 1, max: 5000 }).withMessage('الرسالة يجب أن تكون بين 1 و 5000 حرف'),
    body('type')
        .optional()
        .isIn(['text', 'image', 'voice']).withMessage('نوع الرسالة غير صالح')
];

// التحقق من البحث عن مستخدمين
const userSearchValidation = [
    query('q')
        .optional()
        .trim()
        .isLength({ min: 2, max: 50 }).withMessage('البحث يجب أن يكون بين 2-50 حرف'),
    query('page')
        .optional()
        .isInt({ min: 1 }).withMessage('رقم الصفحة غير صالح'),
    query('limit')
        .optional()
        .isInt({ min: 1, max: 100 }).withMessage('الحد يجب أن يكون بين 1-100'),
    query('gender')
        .optional()
        .isIn(['male', 'female']).withMessage('الجنس غير صالح'),
    query('country')
        .optional()
        .trim()
        .isLength({ min: 2, max: 3 }).withMessage('كود الدولة غير صالح'),
    query('minAge')
        .optional()
        .isInt({ min: 13, max: 100 }).withMessage('العمر الأدنى غير صالح'),
    query('maxAge')
        .optional()
        .isInt({ min: 13, max: 100 }).withMessage('العمر الأقصى غير صالح'),
    query('latitude')
        .optional()
        .isFloat({ min: -90, max: 90 }).withMessage('خط العرض غير صالح'),
    query('longitude')
        .optional()
        .isFloat({ min: -180, max: 180 }).withMessage('خط الطول غير صالح'),
    query('maxDistance')
        .optional()
        .isInt({ min: 1, max: 500 }).withMessage('المسافة يجب أن تكون بين 1-500 كم')
];

// التحقق من تحديث الموقع
const locationUpdateValidation = [
    body('latitude')
        .notEmpty().withMessage('خط العرض مطلوب')
        .isFloat({ min: -90, max: 90 }).withMessage('خط العرض غير صالح'),
    body('longitude')
        .notEmpty().withMessage('خط الطول مطلوب')
        .isFloat({ min: -180, max: 180 }).withMessage('خط الطول غير صالح')
];

// التحقق من الإبلاغ
const reportValidation = [
    param('id')
        .isMongoId().withMessage('المعرف غير صالح'),
    body('reason')
        .notEmpty().withMessage('سبب الإبلاغ مطلوب')
        .isIn(['spam', 'inappropriate', 'harassment']).withMessage('سبب الإبلاغ غير صالح'),
    body('details')
        .optional()
        .trim()
        .isLength({ max: 500 }).withMessage('التفاصيل لا يجب أن تتجاوز 500 حرف')
];

// التحقق من الاشتراك
const subscriptionVerifyValidation = [
    body('plan')
        .notEmpty().withMessage('الخطة مطلوبة')
        .isIn(['weekly', 'monthly', 'quarterly']).withMessage('خطة غير صالحة'),
    body('receipt')
        .optional()
        .isString().withMessage('الإيصال يجب أن يكون نص'),
    body('transactionId')
        .optional()
        .isString().withMessage('معرف المعاملة يجب أن يكون نص')
];

// التحقق من Super Like
const superLikeValidation = [
    body('userId')
        .notEmpty().withMessage('معرف المستخدم مطلوب')
        .isMongoId().withMessage('معرف المستخدم غير صالح')
];

module.exports = {
    conversationRequestValidation,
    mongoIdParam,
    roomMessageValidation,
    userSearchValidation,
    locationUpdateValidation,
    reportValidation,
    subscriptionVerifyValidation,
    superLikeValidation
};
