// HalaChat - Moderation Configuration
// جميع الأرقام والثوابت المتعلقة بالإشراف والمخالفات في مكان واحد

module.exports = {
    // عدد المخالفات اليومية قبل التعليق التلقائي
    MAX_DAILY_VIOLATIONS: 5,

    // سلّم التعليق التصاعدي بالأيام
    // الفهرس 0 = أول تعليق، 1 = ثاني، إلخ. آخر قيمة = حظر دائم
    SUSPENSION_ESCALATION: [1, 3, 7, 36500], // يوم

    // أي تعليق أكبر من هذا العدد بالأيام يُعتبر "حظر دائم"
    PERMANENT_BAN_THRESHOLD_DAYS: 365,

    // مدة التعليق "النهائي" بالأيام (تستخدم في ban-permanent)
    PERMANENT_BAN_DAYS: 36500, // ~100 سنة

    // الحد الأدنى لطول رسالة الاستئناف
    APPEAL_MIN_LENGTH: 10,

    // فترة التهدئة بين استئنافين للمستخدم نفسه (بالساعات)
    APPEAL_COOLDOWN_HOURS: 24,

    // الحد الأقصى لطول رسالة الاستئناف
    APPEAL_MAX_LENGTH: 1000,

    // حد طول رسالة الـ thread في الاستئناف
    APPEAL_THREAD_MESSAGE_MAX: 1000,

    // عدد الرسائل المخالفة المعروضة في /violations
    FLAGGED_MESSAGES_LIMIT: 20,

    // عدد التحذيرات المعروضة في تفاصيل المستخدم
    WARNINGS_DISPLAY_LIMIT: 10,

    // Helper: يحسب عدد أيام التعليق حسب رقم التعليق
    getSuspensionDays(suspensionCount) {
        const schedule = this.SUSPENSION_ESCALATION;
        const idx = Math.min(suspensionCount - 1, schedule.length - 1);
        return schedule[Math.max(0, idx)];
    },

    // Helper: هل هذا التعليق يُعتبر نهائياً؟
    isPermanentSuspension(suspendedUntil) {
        if (!suspendedUntil) return false;
        const days = (new Date(suspendedUntil) - new Date()) / (1000 * 60 * 60 * 24);
        return days > this.PERMANENT_BAN_THRESHOLD_DAYS;
    }
};
