// HalaChat - Users CRUD Routes (Admin)
// العمليات الأساسية: قائمة، عرض، تعديل، حذف

const express = require('express');
const router = express.Router();
const User = require('../../models/User');
const { protect, adminOnly } = require('../../middleware/auth');
const { invalidateUsers } = require('../../utils/cache');

// @route   GET /api/users
router.get('/', protect, adminOnly, async (req, res) => {
    try {
        const { page = 1, limit = 20, search, status, role, provider, gender, minAge, maxAge, sort = 'createdAt', order = 'desc' } = req.query;
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);

        const filter = {};
        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }
        if (status === 'active') filter.isActive = true;
        else if (status === 'inactive') filter.isActive = false;
        else if (status === 'suspended') {
            filter.isActive = false;
            filter.suspendedUntil = {
                $gte: new Date(),
                $lte: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
            };
        } else if (status === 'banned') {
            filter.$or = [
                { suspendedUntil: { $gt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) } },
                { deviceBanned: true }
            ];
        } else if (status === 'violators') {
            filter.violationCount = { $gt: 0 };
        } else if (status === 'new_today') {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            filter.createdAt = { $gte: today };
        } else if (status === 'new_week') {
            filter.createdAt = { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) };
        } else if (status === 'online') filter.isOnline = true;
        else if (status === 'premium') filter.isPremium = true;
        else if (status === 'device_banned') filter.deviceBanned = true;

        if (role && role !== 'all') filter.role = role;

        // مزوّد الحساب
        if (provider === 'email') filter.authProvider = { $in: [null, 'email', undefined] };
        else if (provider === 'google') filter.authProvider = 'google';
        else if (provider === 'apple') filter.authProvider = 'apple';

        // الجنس
        if (gender && ['male', 'female'].includes(gender)) filter.gender = gender;

        // العمر (من birthdate)
        if (minAge || maxAge) {
            filter.birthdate = {};
            const now = new Date();
            if (maxAge) {
                const minDate = new Date(now.getFullYear() - Number(maxAge) - 1, now.getMonth(), now.getDate());
                filter.birthdate.$gte = minDate;
            }
            if (minAge) {
                const maxDate = new Date(now.getFullYear() - Number(minAge), now.getMonth(), now.getDate());
                filter.birthdate.$lte = maxDate;
            }
        }

        const total = await User.countDocuments(filter);
        const users = await User.find(filter)
            .select('-password')
            .sort({ [sort]: order === 'asc' ? 1 : -1 })
            .skip((pageNum - 1) * limitNum)
            .limit(limitNum);

        res.status(200).json({
            success: true,
            count: users.length,
            data: { users, total, currentPage: pageNum, totalPages: Math.ceil(total / limitNum) }
        });
    } catch (error) {
        console.error('خطأ في جلب المستخدمين:', error);
        res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
    }
});

// @route   PUT /api/users/:id/premium
router.put('/:id/premium', protect, adminOnly, async (req, res) => {
    try {
        const { isPremium, premiumPlan, premiumExpiresAt } = req.body;
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });

        if (typeof isPremium === 'boolean') user.isPremium = isPremium;
        if (premiumPlan !== undefined) user.premiumPlan = premiumPlan;
        if (premiumExpiresAt) user.premiumExpiresAt = new Date(premiumExpiresAt);

        if (isPremium === false) {
            user.premiumPlan = null;
            user.premiumExpiresAt = null;
            user.stealthMode = false;
        }

        await user.save();
        res.json({
            success: true,
            message: 'تم تحديث الاشتراك بنجاح',
            data: {
                _id: user._id,
                name: user.name,
                isPremium: user.isPremium,
                premiumPlan: user.premiumPlan,
                premiumExpiresAt: user.premiumExpiresAt
            }
        });
    } catch (error) {
        console.error('خطأ في تعديل الاشتراك:', error);
        res.status(500).json({ success: false, message: 'فشل في تعديل الاشتراك' });
    }
});

// @route   GET /api/users/:id
router.get('/:id', protect, adminOnly, async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('-password');
        if (!user) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
        res.status(200).json({ success: true, data: { user } });
    } catch (error) {
        console.error('خطأ في جلب المستخدم:', error);
        res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
    }
});

// @route   DELETE /api/users/:id
router.delete('/:id', protect, adminOnly, async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });

        await user.deleteOne();
        invalidateUsers();
        res.status(200).json({ success: true, message: 'تم حذف المستخدم بنجاح' });
    } catch (error) {
        console.error('خطأ في حذف المستخدم:', error);
        res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
    }
});

// @route   PUT /api/users/:id
router.put('/:id', protect, adminOnly, async (req, res) => {
    try {
        const { name, email, role } = req.body;
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });

        if (email && email !== user.email) {
            const emailExists = await User.findOne({ email });
            if (emailExists) {
                return res.status(400).json({ success: false, message: 'البريد الإلكتروني مستخدم بالفعل' });
            }
        }

        if (name) user.name = name;
        if (email) user.email = email;
        if (role) user.role = role;

        await user.save();
        invalidateUsers();

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
        res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
    }
});

module.exports = router;
