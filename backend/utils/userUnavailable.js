// HalaChat - ردّ موحّد عند تعذّر الوصول إلى مستخدم
//
// حذف الحساب حذف نهائي (deleteOne) — فالمستند يختفي، وكل مسار كان يردّ
// «المستخدم غير موجود». الرسالة تقنية ومربكة لمن يضغط على حساب اختفى،
// ولا تفرّق بين محذوف ومحظور. التوحيد هنا كي لا تتناثر الصياغة في المسارات.

const USER_UNAVAILABLE_MESSAGE = 'تم حظر المستخدم لمخالفة السياسة المجتمعية';
const USER_UNAVAILABLE_CODE = 'USER_UNAVAILABLE';

/** 404 موحّد: محذوف أو محظور أو موقوف — العميل يعرضها كشاشة «مستخدم محظور» */
const userUnavailable = (res) => res.status(404).json({
    success: false,
    message: USER_UNAVAILABLE_MESSAGE,
    code: USER_UNAVAILABLE_CODE
});

module.exports = { userUnavailable, USER_UNAVAILABLE_MESSAGE, USER_UNAVAILABLE_CODE };
