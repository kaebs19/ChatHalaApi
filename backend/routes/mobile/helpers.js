// HalaChat - Mobile API Shared Helpers
// الأدوات المشتركة لمسارات الموبايل

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Helper: تحويل المسار النسبي إلى URL كامل
const getFullUrl = (filePath) => {
    if (!filePath) return null;
    if (filePath.startsWith('http')) return filePath;
    const baseUrl = process.env.BASE_URL || 'https://halachat.khalafiati.io';
    return `${baseUrl}${filePath}`;
};

// إعداد multer لرفع صور الرسائل
const messagesUploadDir = path.join(__dirname, '..', '..', 'uploads', 'messages');
if (!fs.existsSync(messagesUploadDir)) {
    fs.mkdirSync(messagesUploadDir, { recursive: true });
}

const messageStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, messagesUploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = `msg-${Date.now()}-${crypto.randomBytes(8).toString('hex')}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});

const uploadMessageImage = multer({
    storage: messageStorage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (extname && mimetype) {
            cb(null, true);
        } else {
            cb(new Error('فقط الصور مسموحة (JPEG, PNG, GIF, WEBP)'));
        }
    }
});

// إعداد multer لرفع صور التوثيق (Verification Selfies)
const verificationsUploadDir = path.join(__dirname, '..', '..', 'uploads', 'verifications');
if (!fs.existsSync(verificationsUploadDir)) {
    fs.mkdirSync(verificationsUploadDir, { recursive: true });
}

const verificationStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, verificationsUploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = `verify-${Date.now()}-${crypto.randomBytes(8).toString('hex')}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});

const uploadVerificationSelfie = multer({
    storage: verificationStorage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (extname && mimetype) {
            cb(null, true);
        } else {
            cb(new Error('فقط الصور مسموحة (JPEG, PNG)'));
        }
    }
});

module.exports = {
    getFullUrl,
    uploadMessageImage,
    uploadVerificationSelfie
};
