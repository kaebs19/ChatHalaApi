// HalaChat - Mobile API Routes Index
// الملف الرئيسي لتجميع مسارات الموبايل

const express = require('express');
const router = express.Router();

// تحميل المسارات الفرعية
router.use('/', require('./users'));
router.use('/', require('./profile'));
router.use('/', require('./premium'));
router.use('/', require('./blocking'));
router.use('/', require('./conversations'));
router.use('/', require('./messages'));
router.use('/', require('./reports'));
router.use('/', require('./notifications'));
router.use('/', require('./rooms'));

module.exports = router;
