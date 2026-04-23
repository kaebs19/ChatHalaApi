// HalaChat - Swipes & Matches Routes
// نظام الإعجاب والمطابقة

const express = require('express');
const router = express.Router();
const Swipe = require('../models/Swipe');
const User = require('../models/User');
const Conversation = require('../models/Conversation');
const Notification = require('../models/Notification');
const { protect } = require('../middleware/auth');
const { blockIfSoftSuspended } = require('../middleware/checkRestriction');
const pushNotificationService = require('../services/pushNotificationService');

// @route   POST /api/swipes
// @desc    تسجيل إعجاب/عدم إعجاب/إعجاب مميز
// @access  Private
router.post('/', protect, blockIfSoftSuspended, async (req, res) => {
    try {
        const { userId, type } = req.body;

        if (!userId || !['like', 'dislike', 'superlike'].includes(type)) {
            return res.status(400).json({
                success: false,
                message: 'userId و type (like/dislike/superlike) مطلوبان'
            });
        }

        if (userId === req.user._id.toString()) {
            return res.status(400).json({ success: false, message: 'لا يمكنك الإعجاب بنفسك' });
        }

        const targetUser = await User.findById(userId).select('name isActive deviceBanned suspendedUntil fcmToken deviceToken');
        if (!targetUser) {
            return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
        }
        if (!targetUser.isActive || targetUser.deviceBanned) {
            return res.status(400).json({ success: false, message: 'المستخدم غير متاح' });
        }

        // إنشاء أو تحديث الـ swipe (upsert لتجنب duplicate key error)
        const swipe = await Swipe.findOneAndUpdate(
            { swiper: req.user._id, swiped: userId },
            { $set: { type } },
            { upsert: true, new: true }
        );

        // إذا dislike — نرجع بدون مطابقة
        if (type === 'dislike') {
            return res.json({ success: true, message: 'تم', data: { swipe: { _id: swipe._id, type, swiped: userId } } });
        }

        // فحص المطابقة: هل الطرف الآخر أعجب بي سابقاً؟
        const reverseSwipe = await Swipe.findOne({
            swiper: userId,
            swiped: req.user._id,
            type: { $in: ['like', 'superlike'] }
        });

        let matchInfo = null;
        if (reverseSwipe) {
            // ⭐ مطابقة! أنشئ محادثة مقبولة
            let conversation = await Conversation.findOne({
                type: 'private',
                participants: { $all: [req.user._id, userId] }
            });

            if (!conversation) {
                conversation = await Conversation.create({
                    type: 'private',
                    participants: [req.user._id, userId],
                    creator: req.user._id,
                    status: 'accepted',  // مطابقة = مقبولة تلقائياً
                    isActive: true,
                    title: `محادثة بين ${req.user.name} و ${targetUser.name}`
                });
            } else if (conversation.status !== 'accepted') {
                conversation.status = 'accepted';
                conversation.isActive = true;
                conversation.hiddenBy = [];
                await conversation.save();
            }

            matchInfo = {
                matchId: conversation._id,
                conversationId: conversation._id,
                user: {
                    _id: targetUser._id,
                    name: targetUser.name
                }
            };

            // إشعار الطرف الآخر بالمطابقة
            try {
                await Notification.create({
                    title: '🎉 مطابقة جديدة!',
                    body: `لديك مطابقة مع ${req.user.name}`,
                    type: 'system',
                    sender: req.user._id,
                    targetUsers: [userId],
                    recipients: 'specific'
                });
                await pushNotificationService.sendNotificationToUser(userId,
                    { title: '🎉 مطابقة جديدة!', body: `لديك مطابقة مع ${req.user.name}` },
                    { type: 'system', conversationId: String(conversation._id) }, false);
            } catch (e) { /* لا يوقف */ }
        } else {
            // لا مطابقة بعد — أرسل إشعار "إعجاب" للطرف الآخر (اختياري للـ Premium للرؤية)
            if (type === 'superlike') {
                try {
                    await Notification.create({
                        title: '💎 إعجاب مميز!',
                        body: `${req.user.name} أرسل لك Super Like`,
                        type: 'super_like',
                        sender: req.user._id,
                        targetUsers: [userId],
                        recipients: 'specific'
                    });
                    await pushNotificationService.sendNotificationToUser(userId,
                        { title: '💎 إعجاب مميز!', body: `${req.user.name} أعجب بك` },
                        { type: 'super_like', senderId: String(req.user._id) }, false);
                } catch (e) { /* لا يوقف */ }
            }
        }

        res.json({
            success: true,
            message: matchInfo ? 'مطابقة جديدة!' : 'تم',
            data: {
                swipe: { _id: swipe._id, type, swiped: userId },
                match: matchInfo
            }
        });
    } catch (error) {
        console.error('خطأ في swipe:', error);
        res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
    }
});

// @route   GET /api/swipes/likes-me
// @desc    قائمة من أعجب بي (Premium فقط)
// @access  Private
router.get('/likes-me', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('isPremium premiumExpiresAt');
        const isPremium = user.isPremium && user.premiumExpiresAt && user.premiumExpiresAt > new Date();

        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 20, 50);
        const skip = (page - 1) * limit;

        const filter = {
            swiped: req.user._id,
            type: { $in: ['like', 'superlike'] }
        };

        const total = await Swipe.countDocuments(filter);
        const likes = await Swipe.find(filter)
            .populate('swiper', 'name profileImage birthDate gender country isPremium verification.isVerified')
            .sort('-createdAt')
            .skip(skip)
            .limit(limit)
            .lean();

        // إذا مش Premium، أخفِ بيانات المعجبين
        const data = likes.map(l => {
            if (!isPremium) {
                return {
                    _id: l._id,
                    swiper: { _id: l.swiper?._id, name: '💎', profileImage: null, isBlurred: true },
                    type: l.type,
                    createdAt: l.createdAt
                };
            }
            return {
                _id: l._id,
                swiper: l.swiper,
                type: l.type,
                createdAt: l.createdAt
            };
        });

        res.json({
            success: true,
            data: {
                likes: data,
                page,
                totalPages: Math.ceil(total / limit),
                total,
                isPremium
            }
        });
    } catch (error) {
        console.error('خطأ في likes-me:', error);
        res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
    }
});

// @route   GET /api/swipes/my-likes
// @desc    قائمة إعجاباتي
// @access  Private
router.get('/my-likes', protect, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 20, 50);
        const skip = (page - 1) * limit;

        const filter = {
            swiper: req.user._id,
            type: { $in: ['like', 'superlike'] }
        };

        const total = await Swipe.countDocuments(filter);
        const likes = await Swipe.find(filter)
            .populate('swiped', 'name profileImage birthDate gender country isPremium verification.isVerified')
            .sort('-createdAt')
            .skip(skip)
            .limit(limit)
            .lean();

        res.json({
            success: true,
            data: {
                likes: likes.map(l => ({
                    _id: l._id,
                    swiped: l.swiped,
                    type: l.type,
                    createdAt: l.createdAt
                })),
                page,
                totalPages: Math.ceil(total / limit),
                total
            }
        });
    } catch (error) {
        console.error('خطأ في my-likes:', error);
        res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
    }
});

module.exports = router;
