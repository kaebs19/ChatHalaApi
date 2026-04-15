// HalaChat - Users Routes (Index / Aggregator)
// يدمج كل sub-routers لإدارة المستخدمين
//
// ترتيب مهم:
//   static routes (stats, devices /banned-devices/list) قبل /:id
//   لتجنب تعارض Express router مع CastError على "stats" و "locations"

const express = require('express');
const router = express.Router();

// 1) static + stats (يحتوي /premium, /stats/overview, /locations)
router.use('/', require('./stats'));

// 2) devices (يحتوي /banned-devices/list static + /:id/ban-device)
router.use('/', require('./devices'));

// 3) violations (يحتوي /:id/activity + /:id/violations)
router.use('/', require('./violations'));

// 4) moderation (يحتوي /:id/toggle-active, /suspend, /ban-permanent, /unban, إلخ)
router.use('/', require('./moderation'));

// 5) CRUD — في النهاية لأنه يحتوي /:id العام (يلتقط أي شيء غير مُطابق قبل ذلك)
router.use('/', require('./crud'));

module.exports = router;
