// HalaChat Dashboard - Users Routes
// المسارات الخاصة بإدارة المستخدمين (للأدمن فقط)

const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { protect, adminOnly } = require('../middleware/auth');

// @route   GET /api/users
// @desc    الحصول على جميع المستخدمين
// @access  Private/Admin
router.get('/', protect, adminOnly, async (req, res) => {
    try {
        const users = await User.find({}).select('-password').sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: users.length,
            data: {
                users
            }
        });

    } catch (error) {
        console.error('خطأ في جلب المستخدمين:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر'
        });
    }
});

// @route   GET /api/users/:id
// @desc    الحصول على مستخدم واحد
// @access  Private/Admin
router.get('/:id', protect, adminOnly, async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('-password');

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'المستخدم غير موجود'
            });
        }

        res.status(200).json({
            success: true,
            data: {
                user
            }
        });

    } catch (error) {
        console.error('خطأ في جلب المستخدم:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر'
        });
    }
});

// @route   DELETE /api/users/:id
// @desc    حذف مستخدم
// @access  Private/Admin
router.delete('/:id', protect, adminOnly, async (req, res) => {
    try {
        const user = await User.findById(req.params.id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'المستخدم غير موجود'
            });
        }

        await user.deleteOne();

        res.status(200).json({
            success: true,
            message: 'تم حذف المستخدم بنجاح'
        });

    } catch (error) {
        console.error('خطأ في حذف المستخدم:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر'
        });
    }
});

// @route   PUT /api/users/:id
// @desc    تعديل بيانات مستخدم
// @access  Private/Admin
router.put('/:id', protect, adminOnly, async (req, res) => {
    try {
        const { name, email, role } = req.body;

        // التحقق من وجود المستخدم
        const user = await User.findById(req.params.id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'المستخدم غير موجود'
            });
        }

        // التحقق من عدم تكرار البريد الإلكتروني
        if (email && email !== user.email) {
            const emailExists = await User.findOne({ email });
            if (emailExists) {
                return res.status(400).json({
                    success: false,
                    message: 'البريد الإلكتروني مستخدم بالفعل'
                });
            }
        }

        // تحديث البيانات
        if (name) user.name = name;
        if (email) user.email = email;
        if (role) user.role = role;

        await user.save();

        res.status(200).json({
            success: true,
            message: 'تم تحديث بيانات المستخدم بنجاح',
            data: {
                user: {
                    _id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    isActive: user.isActive
                }
            }
        });

    } catch (error) {
        console.error('خطأ في تحديث المستخدم:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر'
        });
    }
});

// @route   PUT /api/users/:id/toggle-active
// @desc    تفعيل/إلغاء تفعيل مستخدم
// @access  Private/Admin
router.put('/:id/toggle-active', protect, adminOnly, async (req, res) => {
    try {
        const user = await User.findById(req.params.id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'المستخدم غير موجود'
            });
        }

        user.isActive = !user.isActive;
        await user.save();

        res.status(200).json({
            success: true,
            message: user.isActive ? 'تم تفعيل المستخدم' : 'تم إلغاء تفعيل المستخدم',
            data: {
                user
            }
        });

    } catch (error) {
        console.error('خطأ في تحديث المستخدم:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر'
        });
    }
});

// @route   GET /api/users/:id/activity
// @desc    الحصول على نشاط مستخدم محدد
// @access  Private/Admin
router.get('/:id/activity', protect, adminOnly, async (req, res) => {
    try {
        const Conversation = require('../models/Conversation');
        const Message = require('../models/Message');

        const user = await User.findById(req.params.id).select('-password');

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'المستخدم غير موجود'
            });
        }

        // إحصائيات المستخدم
        const userConversations = await Conversation.find({
            participants: req.params.id
        }).populate('lastMessage');

        const userMessages = await Message.find({
            sender: req.params.id,
            isDeleted: false
        });

        // حساب الإحصائيات
        const stats = {
            totalConversations: userConversations.length,
            activeConversations: userConversations.filter(c => c.isActive).length,
            totalMessagesSent: userMessages.length,
            lastActivity: user.lastLogin || user.updatedAt
        };

        res.status(200).json({
            success: true,
            data: {
                user,
                stats,
                conversations: userConversations,
                recentMessages: userMessages.slice(0, 10)
            }
        });

    } catch (error) {
        console.error('خطأ في جلب نشاط المستخدم:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر'
        });
    }
});

module.exports = router;
