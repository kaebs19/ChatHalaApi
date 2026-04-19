// HalaChat - Admin Action Logger
// helper مختصر لتسجيل عمليات الأدمن الإشرافية في ActivityLog

const ActivityLog = require('../models/ActivityLog');

/**
 * تسجيل عملية إدارية مع metadata + requestInfo تلقائياً.
 * fail-silent — لا يوقف العملية الأصلية إذا فشل التسجيل.
 */
const logAdminAction = async (req, {
    action,
    description,
    targetUser = null,
    targetType = 'User',
    targetId = null,
    targetName = null,
    before = null,
    after = null,
    additionalInfo = null,
    severity = 'medium',
    status = 'success'
}) => {
    try {
        if (!req?.user?._id) return;

        // استخراج بيانات الهدف من targetUser (User document) إذا تم تمريره
        const effectiveTargetId = targetId || targetUser?._id || null;
        const effectiveTargetName = targetName || targetUser?.name || null;

        await ActivityLog.create({
            user: req.user._id,
            action,
            description,
            targetType,
            targetId: effectiveTargetId,
            targetName: effectiveTargetName,
            metadata: { before, after, additionalInfo },
            requestInfo: {
                ipAddress: req.ip || req.connection?.remoteAddress,
                userAgent: req.get ? req.get('user-agent') : req.headers?.['user-agent'],
                method: req.method,
                url: req.originalUrl
            },
            severity,
            status
        });
    } catch (e) {
        console.error('فشل تسجيل نشاط الأدمن:', e.message);
    }
};

module.exports = { logAdminAction };
