// backend/routes/notifications.js
const express = require('express');
const router  = express.Router();
const { authenticate } = require('../middleware/auth');
const { getNotifications, markAsRead } = require('../controllers/notificationsController');

router.use(authenticate);
router.get('/',                       getNotifications);
router.put('/:notificationId/read',   markAsRead);

module.exports = router;
