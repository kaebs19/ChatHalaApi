// HalaChat Dashboard - JWT Token Generator
// نظام توكنات محسّن مع Access Token و Refresh Token

const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// توليد Access Token (قصير الصلاحية)
// tv = tokenVersion — يسمح بإبطال التوكن قبل انتهاء صلاحيته
const generateAccessToken = (userId, tokenVersion = 0) => {
    return jwt.sign(
        { id: userId, type: 'access', tv: tokenVersion },
        process.env.JWT_SECRET,
        {
            expiresIn: process.env.JWT_ACCESS_EXPIRE || '1d' // يوم واحد افتراضياً
        }
    );
};

// توليد Refresh Token (طويل الصلاحية)
const generateRefreshToken = (userId, tokenVersion = 0) => {
    return jwt.sign(
        { id: userId, type: 'refresh', tv: tokenVersion },
        process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET + '_refresh',
        {
            expiresIn: process.env.JWT_REFRESH_EXPIRE || '30d' // 30 يوم افتراضياً
        }
    );
};

// التحقق من Refresh Token
const verifyRefreshToken = (token) => {
    return jwt.verify(
        token,
        process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET + '_refresh'
    );
};

// للتوافق مع الكود القديم - يولّد access token
const generateToken = (userId, tokenVersion = 0) => {
    return generateAccessToken(userId, tokenVersion);
};

module.exports = generateToken;
module.exports.generateAccessToken = generateAccessToken;
module.exports.generateRefreshToken = generateRefreshToken;
module.exports.verifyRefreshToken = verifyRefreshToken;
