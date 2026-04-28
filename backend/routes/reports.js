// HalaChat Dashboard - Reports Routes
// المسارات الخاصة بإدارة البلاغات

const express = require('express');
const router = express.Router();
const Report = require('../models/Report');
const User = require('../models/User');
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const { protect, adminOnly } = require('../middleware/auth');

// Helper: شكر المُبلِّغ بعد اتخاذ إجراء على بلاغه
async function notifyReporterOfResolution(report, action) {
    try {
        if (!report.reportedBy) return;
        const Notification = require('../models/Notification');
        const pushNotificationService = require('../services/pushNotificationService');

        const actionMessages = {
            'warning_sent': 'تم إرسال تحذير للمستخدم بناءً على بلاغك',
            'user_warned': 'تم إرسال تحذير للمستخدم بناءً على بلاغك',
            'message_deleted': 'تم حذف الرسالة المُبلَّغ عنها',
            'user_suspended': 'تم تعليق المستخدم المُبلَّغ عنه',
            'user_banned': 'تم حظر المستخدم نهائياً',
            'conversation_locked': 'تم قفل المحادثة المُبلَّغ عنها'
        };

        const actionText = actionMessages[action] || 'تمت مراجعة بلاغك واتخاذ الإجراء المناسب';

        const title = '✅ تم التعامل مع بلاغك';
        const body = `${actionText}.\n\nشكراً لمساعدتنا في الحفاظ على بيئة آمنة وممتعة للجميع 💙`;

        await Notification.create({
            title,
            body,
            type: 'system',
            sender: null,
            targetUsers: [report.reportedBy],
            recipients: 'specific',
            status: 'sent',
            sentAt: new Date(),
            sentCount: 1,
            data: {
                type: 'report_resolved',
                reportId: report._id.toString(),
                action: action || 'reviewed'
            }
        });

        // Push للمُبلِّغ
        try {
            await pushNotificationService.sendNotificationToUser(
                report.reportedBy,
                { title, body },
                { type: 'report_resolved', reportId: report._id.toString() },
                false
            );
        } catch (pushErr) { /* لا نوقف على فشل push */ }
    } catch (e) {
        console.error('خطأ في إشعار المُبلِّغ:', e);
    }
}

// @route   GET /api/reports
// @desc    الحصول على جميع البلاغات
// @access  Private/Admin
router.get('/', protect, adminOnly, async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            status,
            priority,
            type,
            category
        } = req.query;

        // بناء الفلتر
        const filter = {};
        if (status) filter.status = status;
        if (priority) filter.priority = priority;
        if (type) filter.type = type;
        if (category) filter.category = category;

        const reports = await Report.find(filter)
            .populate('reportedBy', 'name email')
            .populate('reportedUser', 'name email isActive')
            .populate('reportedConversation', 'title type')
            .populate({
                path: 'reportedMessage',
                select: 'content type mediaUrl sender createdAt hasBannedWords bannedWordsFound bannedWordSeverity',
                populate: { path: 'sender', select: 'name' }
            })
            .populate('assignedTo', 'name')
            .populate('resolvedBy', 'name')
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);

        const count = await Report.countDocuments(filter);

        res.status(200).json({
            success: true,
            data: {
                reports,
                totalPages: Math.ceil(count / limit),
                currentPage: page,
                total: count
            }
        });

    } catch (error) {
        console.error('خطأ في جلب البلاغات:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر'
        });
    }
});

// @route   GET /api/reports/stats
// @desc    إحصائيات البلاغات
// @access  Private/Admin
router.get('/stats', protect, adminOnly, async (req, res) => {
    try {
        const totalReports = await Report.countDocuments();
        const pendingReports = await Report.countDocuments({ status: 'pending' });
        const reviewingReports = await Report.countDocuments({ status: 'reviewing' });
        const resolvedReports = await Report.countDocuments({ status: 'resolved' });
        const urgentReports = await Report.countDocuments({ priority: 'urgent', status: { $in: ['pending', 'reviewing'] } });

        // تصنيف البلاغات حسب النوع
        const reportsByType = await Report.aggregate([
            {
                $group: {
                    _id: '$type',
                    count: { $sum: 1 }
                }
            }
        ]);

        // تصنيف البلاغات حسب الفئة
        const reportsByCategory = await Report.aggregate([
            {
                $group: {
                    _id: '$category',
                    count: { $sum: 1 }
                }
            }
        ]);

        res.status(200).json({
            success: true,
            data: {
                totalReports,
                pendingReports,
                reviewingReports,
                resolvedReports,
                urgentReports,
                reportsByType,
                reportsByCategory
            }
        });

    } catch (error) {
        console.error('خطأ في جلب إحصائيات البلاغات:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر'
        });
    }
});

// @route   GET /api/reports/:id
// @desc    الحصول على بلاغ واحد
// @access  Private/Admin
router.get('/:id', protect, adminOnly, async (req, res) => {
    try {
        const report = await Report.findById(req.params.id)
            .populate('reportedBy', 'name email createdAt')
            .populate('reportedUser', 'name email isActive role')
            .populate('reportedMessage')
            .populate('reportedConversation')
            .populate('assignedTo', 'name email')
            .populate('resolvedBy', 'name email');

        if (!report) {
            return res.status(404).json({
                success: false,
                message: 'البلاغ غير موجود'
            });
        }

        res.status(200).json({
            success: true,
            data: { report }
        });

    } catch (error) {
        console.error('خطأ في جلب البلاغ:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر'
        });
    }
});

// @route   PUT /api/reports/:id/status
// @desc    تحديث حالة البلاغ
// @access  Private/Admin
router.put('/:id/status', protect, adminOnly, async (req, res) => {
    try {
        const { status, reviewNotes } = req.body;

        const report = await Report.findById(req.params.id);

        if (!report) {
            return res.status(404).json({
                success: false,
                message: 'البلاغ غير موجود'
            });
        }

        report.status = status;
        if (reviewNotes) report.reviewNotes = reviewNotes;

        if (status === 'reviewing' && !report.assignedTo) {
            report.assignedTo = req.user._id;
        }

        const wasNotResolved = report.status !== 'resolved';
        if (status === 'resolved' || status === 'rejected') {
            report.resolvedBy = req.user._id;
            report.resolvedAt = Date.now();
        }

        await report.save();

        // إشعار شكر للمُبلِّغ عند الحسم (resolved فقط، ليس rejected)
        if (status === 'resolved' && wasNotResolved) {
            await notifyReporterOfResolution(report, report.action || 'reviewed');
        }

        res.status(200).json({
            success: true,
            message: 'تم تحديث حالة البلاغ',
            data: { report }
        });

    } catch (error) {
        console.error('خطأ في تحديث البلاغ:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر'
        });
    }
});

// @route   PUT /api/reports/:id/action
// @desc    اتخاذ إجراء على البلاغ
// @access  Private/Admin
router.put('/:id/action', protect, adminOnly, async (req, res) => {
    try {
        const { action, reviewNotes } = req.body;

        const report = await Report.findById(req.params.id)
            .populate('reportedUser')
            .populate('reportedMessage')
            .populate('reportedConversation');

        if (!report) {
            return res.status(404).json({
                success: false,
                message: 'البلاغ غير موجود'
            });
        }

        report.action = action;
        report.actionDate = Date.now();
        report.status = 'resolved';
        report.resolvedBy = req.user._id;
        report.resolvedAt = Date.now();
        if (reviewNotes) report.reviewNotes = reviewNotes;

        // استخراج بيانات الدليل من الرسالة المُبلّغ عنها (إن وجدت)
        const messageEvidence = report.reportedMessage ? {
            messageId: report.reportedMessage._id,
            messageContent: report.reportedMessage.content || null,
            messageMedia: report.reportedMessage.mediaUrl || null,
            messageType: report.reportedMessage.type || 'text',
            conversationId: report.reportedMessage.conversation || null
        } : null;

        // تنفيذ الإجراء
        switch (action) {
            case 'message_deleted':
                if (report.reportedMessage) {
                    await Message.findByIdAndUpdate(report.reportedMessage, {
                        isDeleted: true
                    });
                }
                // تسجيل مخالفة على المستخدم المُبلَّغ عنه + إشعار + تعليق تلقائي عند 5
                if (report.reportedUser) {
                    const { recordViolation } = require('../utils/violationHelper');
                    const targetUser = await User.findById(report.reportedUser._id || report.reportedUser);
                    if (targetUser) {
                        await recordViolation({
                            user: targetUser,
                            type: 'report',
                            reason: `بلاغ مقبول - تم حذف رسالة${reviewNotes ? ': ' + reviewNotes : ''}`,
                            evidence: messageEvidence,
                            adminId: req.user._id
                        });
                    }
                }
                break;

            case 'user_warned':
            case 'warning_sent':
                if (report.reportedUser) {
                    const { recordViolation } = require('../utils/violationHelper');
                    const targetUser = await User.findById(report.reportedUser._id || report.reportedUser);
                    if (targetUser) {
                        await recordViolation({
                            user: targetUser,
                            type: 'report',
                            reason: `بلاغ مقبول ضد المستخدم${reviewNotes ? ': ' + reviewNotes : ''}`,
                            evidence: messageEvidence,
                            adminId: req.user._id
                        });
                    }
                }
                break;

            case 'user_suspended':
                if (report.reportedUser) {
                    const days = parseInt(req.body.suspendDays) || 7;
                    const targetUser = await User.findById(report.reportedUser._id || report.reportedUser);
                    if (targetUser) {
                        targetUser.isActive = false;
                        targetUser.suspendedUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
                        targetUser.suspendReason = `بلاغ${reviewNotes ? ': ' + reviewNotes : ''}`;
                        targetUser.violationCount = (targetUser.violationCount || 0) + 1;
                        targetUser.warnings.push({
                            reason: targetUser.suspendReason,
                            action: 'suspend',
                            adminId: req.user._id,
                            evidence: messageEvidence
                        });
                        await targetUser.save();

                        // إشعار
                        try {
                            const Notification = require('../models/Notification');
                            const pushNotificationService = require('../services/pushNotificationService');
                            const notifTitle = '⏸️ تم تعليق حسابك';
                            const notifBody = `تم تعليق حسابك لمدة ${days} يوم بناءً على بلاغ.`;
                            await Notification.create({
                                title: notifTitle, body: notifBody, type: 'system',
                                sender: req.user._id, targetUsers: [targetUser._id], recipients: 'specific'
                            });
                            await pushNotificationService.sendNotificationToUser(
                                targetUser._id, { title: notifTitle, body: notifBody }, { type: 'system' }, false
                            );
                        } catch (e) {}
                    }
                }
                break;

            case 'user_banned':
                if (report.reportedUser) {
                    const targetUser = await User.findById(report.reportedUser._id || report.reportedUser);
                    if (targetUser) {
                        targetUser.isActive = false;
                        targetUser.suspendedUntil = new Date(Date.now() + 36500 * 24 * 60 * 60 * 1000);
                        targetUser.suspendReason = `حظر نهائي بناءً على بلاغ${reviewNotes ? ': ' + reviewNotes : ''}`;
                        targetUser.violationCount = (targetUser.violationCount || 0) + 1;
                        targetUser.warnings.push({
                            reason: targetUser.suspendReason,
                            action: 'permanent_ban',
                            adminId: req.user._id,
                            evidence: messageEvidence
                        });
                        await targetUser.save();
                        try {
                            const Notification = require('../models/Notification');
                            const pushNotificationService = require('../services/pushNotificationService');
                            const notifTitle = '🚫 تم حظر حسابك نهائياً';
                            const notifBody = 'تم حظر حسابك نهائياً بناءً على بلاغ.';
                            await Notification.create({
                                title: notifTitle, body: notifBody, type: 'system',
                                sender: req.user._id, targetUsers: [targetUser._id], recipients: 'specific'
                            });
                            await pushNotificationService.sendNotificationToUser(
                                targetUser._id, { title: notifTitle, body: notifBody }, { type: 'system' }, false
                            );
                        } catch (e) {}
                    }
                }
                break;

            case 'conversation_locked':
                if (report.reportedConversation) {
                    await Conversation.findByIdAndUpdate(report.reportedConversation, {
                        isLocked: true,
                        'settings.allowMembersToSend': false
                    });
                }
                break;
        }

        await report.save();

        // إشعار شكر للمُبلِّغ بعد اتخاذ الإجراء
        await notifyReporterOfResolution(report, action);

        res.status(200).json({
            success: true,
            message: 'تم تنفيذ الإجراء بنجاح',
            data: { report }
        });

    } catch (error) {
        console.error('خطأ في تنفيذ الإجراء:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر'
        });
    }
});

// @route   PUT /api/reports/:id/priority
// @desc    تحديث أولوية البلاغ
// @access  Private/Admin
router.put('/:id/priority', protect, adminOnly, async (req, res) => {
    try {
        const { priority } = req.body;

        const report = await Report.findByIdAndUpdate(
            req.params.id,
            { priority },
            { new: true }
        );

        if (!report) {
            return res.status(404).json({
                success: false,
                message: 'البلاغ غير موجود'
            });
        }

        res.status(200).json({
            success: true,
            message: 'تم تحديث الأولوية',
            data: { report }
        });

    } catch (error) {
        console.error('خطأ في تحديث الأولوية:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر'
        });
    }
});

// @route   DELETE /api/reports/bulk
// @desc    حذف بلاغات متعددة أو جميع البلاغات
// @access  Private/Admin
router.delete('/bulk', protect, adminOnly, async (req, res) => {
    try {
        const { ids, deleteAll, status } = req.body;

        let result;
        if (deleteAll) {
            const filter = status && status !== 'all' ? { status } : {};
            result = await Report.deleteMany(filter);
        } else if (ids && ids.length > 0) {
            result = await Report.deleteMany({ _id: { $in: ids } });
        } else {
            return res.status(400).json({ success: false, message: 'يجب تحديد البلاغات المراد حذفها' });
        }

        res.json({
            success: true,
            message: `تم حذف ${result.deletedCount} بلاغ`,
            data: { deletedCount: result.deletedCount }
        });
    } catch (error) {
        console.error('خطأ في حذف البلاغات:', error);
        res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
    }
});

// @route   DELETE /api/reports/:id
// @desc    حذف بلاغ
// @access  Private/Admin
router.delete('/:id', protect, adminOnly, async (req, res) => {
    try {
        const report = await Report.findById(req.params.id);

        if (!report) {
            return res.status(404).json({
                success: false,
                message: 'البلاغ غير موجود'
            });
        }

        await report.deleteOne();

        res.status(200).json({
            success: true,
            message: 'تم حذف البلاغ بنجاح'
        });

    } catch (error) {
        console.error('خطأ في حذف البلاغ:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر'
        });
    }
});

module.exports = router;
