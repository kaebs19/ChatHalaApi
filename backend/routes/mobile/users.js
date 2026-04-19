// HalaChat - Mobile API: Users Routes
// مسارات المستخدمين (الموقع + البحث)

const express = require('express');
const router = express.Router();
const logger = require('../../utils/logger');
const User = require('../../models/User');
const { protect } = require('../../middleware/auth');
const { getFullUrl } = require('./helpers');

// Helper: تنظيف المدخلات من أحرف Regex الخاصة لمنع NoSQL Injection
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ==========================================
// نظام الموقع الجغرافي
// ==========================================

// @route   PUT /api/mobile/users/location
// @desc    تحديث الموقع الجغرافي
// @access  Protected
router.put('/users/location', protect, async (req, res) => {
    try {
        const { latitude, longitude } = req.body;

        if (typeof latitude !== 'number' || typeof longitude !== 'number') {
            return res.status(400).json({
                success: false,
                message: 'الإحداثيات مطلوبة (latitude, longitude) كأرقام'
            });
        }

        if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
            return res.status(400).json({
                success: false,
                message: 'الإحداثيات غير صحيحة'
            });
        }

        // تمويه الموقع (1-3 كم إزاحة عشوائية) للعرض للآخرين
        const fuzzKm = 1 + Math.random() * 2; // 1-3 كم
        const fuzzAngle = Math.random() * 2 * Math.PI;
        const fuzzLat = latitude + (fuzzKm / 111) * Math.cos(fuzzAngle);
        const fuzzLng = longitude + (fuzzKm / (111 * Math.cos(latitude * Math.PI / 180))) * Math.sin(fuzzAngle);

        await User.findByIdAndUpdate(req.user._id, {
            location: {
                type: 'Point',
                coordinates: [longitude, latitude] // الموقع الحقيقي (للحسابات فقط)
            },
            fuzzyLocation: {
                type: 'Point',
                coordinates: [fuzzLng, fuzzLat] // الموقع المموّه (للعرض)
            }
        });

        res.json({ success: true, message: 'تم تحديث الموقع بنجاح' });
    } catch (error) {
        logger.error('خطأ في تحديث الموقع:', error);
        res.status(500).json({ success: false, message: 'فشل في تحديث الموقع' });
    }
});

// ==========================================
// نظام البحث عن المستخدمين
// ==========================================

// @route   GET /api/mobile/users/search
// @desc    البحث عن مستخدمين مع فلاتر متقدمة
// @access  Private
router.get('/users/search', protect, async (req, res) => {
    try {
        const {
            q,           // بحث بالاسم (اختياري)
            page = 1,
            limit = 20,
            gender,      // male / female
            country,     // كود الدولة: SA, AE, EG
            minAge,      // أقل عمر
            maxAge,      // أكبر عمر
            latitude,    // خط العرض (اختياري)
            longitude,   // خط الطول (اختياري)
            maxDistance = 50, // أقصى مسافة بالكيلومتر
            onlineOnly,  // 'true' = فقط المتصلين الآن
            completeOnly,// 'true' = فقط الملفات المكتملة (صورة + جنس + عمر + دولة)
            verifiedOnly // 'true' = فقط الموثّقين
        } = req.query;

        // بناء الفلتر
        const filter = {
            _id: { $ne: req.user._id },
            isActive: true,
            deviceBanned: { $ne: true },
            // استبعاد المعلّقين مؤقتاً (suspendedUntil في المستقبل)
            $or: [
                { suspendedUntil: null },
                { suspendedUntil: { $exists: false } },
                { suspendedUntil: { $lte: new Date() } }
            ]
            // Stealth Mode لا يخفي من الاكتشاف — فقط يمنع تسجيل زيارات البروفايل ويخفي آخر ظهور
        };

        // استثناء المستخدمين المحظورين
        if (req.user.blockedUsers && req.user.blockedUsers.length > 0) {
            filter._id = {
                $ne: req.user._id,
                $nin: req.user.blockedUsers
            };
        }

        // فلتر البحث (اسم / معرف / إيميل)
        if (q && q.length >= 2) {
            const trimmedQ = q.trim();
            if (trimmedQ.toUpperCase().startsWith('HALA-')) {
                // بحث بالمعرف الفريد
                filter.uniqueTag = trimmedQ.toUpperCase();
            } else if (trimmedQ.includes('@')) {
                // بحث بالإيميل
                filter.email = { $regex: escapeRegex(trimmedQ), $options: 'i' };
            } else {
                // بحث بالاسم
                filter.name = { $regex: escapeRegex(trimmedQ), $options: 'i' };
            }
        }

        // فلتر الجنس
        if (gender && ['male', 'female'].includes(gender)) {
            filter.gender = gender;
        }

        // فلتر الدولة
        if (country) {
            filter.country = country.toUpperCase();
        }

        const wantsCompleteOnly = (completeOnly === 'true' || completeOnly === true);
        if (wantsCompleteOnly) {
            filter.profileImage = { $nin: [null, ''], $exists: true };
            if (!filter.gender) filter.gender = { $in: ['male', 'female'] };
            if (!filter.country) filter.country = { $nin: [null, ''], $exists: true };
        }

        // فلتر "موثّقين فقط"
        if (verifiedOnly === 'true' || verifiedOnly === true) {
            filter['verification.isVerified'] = true;
        }

        // فلتر "متصل الآن فقط" — يُطبّق بعد الاستعلام (يعتمد على global.connectedUsers)
        const filterOnlineOnly = (onlineOnly === 'true' || onlineOnly === true);

        // فلتر العمر (من birthDate)
        if (minAge || maxAge) {
            filter.birthDate = {};
            if (maxAge) {
                const minDate = new Date();
                minDate.setFullYear(minDate.getFullYear() - parseInt(maxAge) - 1);
                filter.birthDate.$gte = minDate;
            }
            if (minAge) {
                const maxDate = new Date();
                maxDate.setFullYear(maxDate.getFullYear() - parseInt(minAge));
                filter.birthDate.$lte = maxDate;
            }
        } else if (wantsCompleteOnly) {
            filter.birthDate = { $ne: null, $exists: true };
        }

        const pageNum = Math.max(1, parseInt(page) || 1);
        const limitNum = Math.min(Math.max(1, parseInt(limit) || 20), 100); // حد أقصى 100
        const skipNum = (pageNum - 1) * limitNum;

        // Helper: حساب وصف المسافة
        const getDistanceLabel = (distanceInMeters) => {
            const km = distanceInMeters / 1000;
            if (km < 1) return 'قريب جداً';
            if (km <= 10) return 'قريب منك';
            if (km <= 50) return 'في مدينتك';
            if (km <= 200) return 'في منطقتك';
            return 'بعيد';
        };

        let users, totalUsers;

        // إذا فيه إحداثيات → استخدام $geoNear
        if (latitude && longitude) {
            const lat = parseFloat(latitude);
            const lng = parseFloat(longitude);
            const maxDist = parseFloat(maxDistance) * 1000; // تحويل كم إلى متر

            const pipeline = [
                {
                    $geoNear: {
                        near: { type: 'Point', coordinates: [lng, lat] },
                        distanceField: 'distance',
                        maxDistance: maxDist,
                        query: filter,
                        spherical: true
                    }
                },
                {
                    $project: {
                        name: 1, email: 1, profileImage: 1, birthDate: 1,
                        gender: 1, country: 1, bio: 1, isOnline: 1, lastLogin: 1,
                        isVerified: '$verification.isVerified', isPremium: 1, stealthMode: 1,
                        distance: 1, uniqueTag: 1, fuzzyLocation: 1
                    }
                },
                { $sort: { isOnline: -1, distance: 1 } },
                { $skip: skipNum },
                { $limit: limitNum }
            ];

            users = await User.aggregate(pipeline);

            // حساب distanceLabel + إخفاء lastLogin للمتخفين + إضافة fuzzyLocation
            users = users.map(u => {
                // 🟢 isOnline الحي من Socket (أدق من حقل DB الجامد)
                const liveOnline = global.connectedUsers && global.connectedUsers.has(u._id.toString());
                const result = {
                    ...u,
                    isOnline: liveOnline || false,
                    distance: Math.round(u.distance / 100) / 10,
                    distanceLabel: getDistanceLabel(u.distance),
                    lastActive: u.stealthMode ? null : u.lastLogin
                };
                result.profileImage = getFullUrl(u.profileImage);
                // إضافة الموقع المموّه (إلا إذا متخفي)
                if (u.fuzzyLocation && u.fuzzyLocation.coordinates && !u.stealthMode) {
                    result.fuzzyLatitude = u.fuzzyLocation.coordinates[1];
                    result.fuzzyLongitude = u.fuzzyLocation.coordinates[0];
                }
                // لا نكشف الموقع الحقيقي أبداً
                delete result.location;
                delete result.fuzzyLocation;
                delete result.lastLogin;
                delete result.stealthMode;
                return result;
            });

            // حساب الإجمالي
            const countPipeline = [
                {
                    $geoNear: {
                        near: { type: 'Point', coordinates: [lng, lat] },
                        distanceField: 'distance',
                        maxDistance: maxDist,
                        query: filter,
                        spherical: true
                    }
                },
                { $count: 'total' }
            ];
            const countResult = await User.aggregate(countPipeline);
            totalUsers = countResult.length > 0 ? countResult[0].total : 0;

        } else {
            // بدون موقع — البحث العادي
            users = await User.find(filter)
                .select('name email profileImage birthDate gender country bio isOnline lastLogin verification.isVerified isPremium stealthMode uniqueTag fuzzyLocation')
                .sort({ isOnline: -1, lastLogin: -1 })
                .limit(limitNum)
                .skip(skipNum);

            totalUsers = await User.countDocuments(filter);

            // إخفاء lastLogin للمتخفين + إضافة distance: null + حذف stealthMode
            users = users.map(u => {
                const userObj = u.toObject();
                // 🟢 isOnline الحي من Socket (أدق من حقل DB الجامد)
                userObj.isOnline = global.connectedUsers && global.connectedUsers.has(userObj._id.toString());
                userObj.lastActive = userObj.stealthMode ? null : userObj.lastLogin;
                delete userObj.lastLogin;
                delete userObj.stealthMode;
                userObj.profileImage = getFullUrl(userObj.profileImage);
                userObj.isVerified = userObj.verification?.isVerified || false;
                delete userObj.verification;
                userObj.distance = null;
                userObj.distanceLabel = null;
                // إضافة الموقع المموّه
                if (userObj.fuzzyLocation && userObj.fuzzyLocation.coordinates && !userObj.stealthMode) {
                    userObj.fuzzyLatitude = userObj.fuzzyLocation.coordinates[1];
                    userObj.fuzzyLongitude = userObj.fuzzyLocation.coordinates[0];
                }
                delete userObj.fuzzyLocation;
                delete userObj.location;
                return userObj;
            });
        }

        // فلترة نهائية: "متصل الآن فقط"
        if (filterOnlineOnly) {
            users = users.filter(u => u.isOnline === true);
        }

        res.status(200).json({
            success: true,
            data: {
                users,
                page: pageNum,
                limit: limitNum,
                total: totalUsers
            }
        });

    } catch (error) {
        logger.error('خطأ في البحث عن المستخدمين:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
        });
    }
});

// ==========================================
// جلب ملف مستخدم بالـ ID
// ==========================================

// @route   GET /api/mobile/users/:id
// @desc    جلب بيانات مستخدم عام (لعرض الملف الشخصي)
// @access  Protected
router.get('/users/:id', protect, async (req, res) => {
    try {
        const { id } = req.params;

        // التحقق من صحة ObjectId
        if (!id.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({
                success: false,
                message: 'معرّف مستخدم غير صحيح'
            });
        }

        const user = await User.findById(id)
            .select('name profileImage birthDate gender country bio isOnline lastLogin verification.isVerified isPremium stealthMode uniqueTag fuzzyLocation interests photos isActive isSuspended deviceBanned createdAt');

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'المستخدم غير موجود'
            });
        }

        // التحقق من الحظر/الإيقاف
        if (user.deviceBanned || !user.isActive) {
            return res.status(404).json({
                success: false,
                message: 'المستخدم غير متاح'
            });
        }

        // التحقق من الحظر المتبادل
        if (req.user.blockedUsers && req.user.blockedUsers.some(b => b.toString() === id)) {
            return res.status(403).json({
                success: false,
                message: 'لا يمكنك عرض هذا المستخدم'
            });
        }

        // بناء response — إخفاء البيانات الحساسة
        const userObj = user.toObject();
        const result = {
            _id: userObj._id,
            name: userObj.name,
            profileImage: getFullUrl(userObj.profileImage),
            birthDate: userObj.birthDate,
            gender: userObj.gender,
            country: userObj.country,
            bio: userObj.bio,
            isOnline: userObj.isOnline,
            lastLogin: userObj.stealthMode ? null : userObj.lastLogin,
            isVerified: userObj.verification?.isVerified || false,
            isPremium: userObj.isPremium || false,
            uniqueTag: userObj.uniqueTag,
            interests: userObj.interests || [],
            photos: userObj.photos || [],
            isSuspended: userObj.isSuspended || false,
            createdAt: userObj.createdAt
        };

        // إضافة الموقع المموّه (إلا للمتخفين)
        if (userObj.fuzzyLocation?.coordinates && !userObj.stealthMode) {
            result.fuzzyLatitude = userObj.fuzzyLocation.coordinates[1];
            result.fuzzyLongitude = userObj.fuzzyLocation.coordinates[0];
        }

        res.status(200).json({
            success: true,
            data: result
        });

    } catch (error) {
        logger.error('خطأ في جلب ملف المستخدم:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في السيرفر',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
        });
    }
});

module.exports = router;
