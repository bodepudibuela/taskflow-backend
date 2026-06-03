// backend/utils/notificationService.js
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../config/database');

/**
 * Create a notification for a user
 */
const createNotification = async (userId, type, title, message, data = null) => {
  try {
    const notifId = uuidv4();
    await pool.execute(
      'INSERT INTO notifications (id, user_id, type, title, message, data) VALUES (?, ?, ?, ?, ?, ?)',
      [notifId, userId, type, title, message, data ? JSON.stringify(data) : null]
    );

    // Return the notification so the socket can emit it
    return { id: notifId, user_id: userId, type, title, message, data, is_read: false, created_at: new Date() };
  } catch (error) {
    console.error('Notification error:', error.message);
    return null;
  }
};

module.exports = { createNotification };
