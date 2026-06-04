// backend/controllers/notificationsController.js
const { pool } = require('../config/database');

/**
 * @route   GET /api/notifications
 * @desc    Get notifications for current user
 * @access  Private
 */
const getNotifications = async (req, res, next) => {
  try {
    const limit = Math.min(Number.isFinite(parseInt(req.query.limit)) ? parseInt(req.query.limit) : 20, 50);
    const [notifications] = await pool.execute(
      'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
      [req.user.id, limit]
    );
    const [[{ unread_count }]] = await pool.execute(
      'SELECT COUNT(*) as unread_count FROM notifications WHERE user_id = ? AND is_read = FALSE',
      [req.user.id]
    );
    res.json({ success: true, data: { notifications, unread_count } });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   PUT /api/notifications/:notificationId/read
 * @desc    Mark notification(s) as read. Use "all" to mark all read.
 * @access  Private
 */
const markAsRead = async (req, res, next) => {
  try {
    const { notificationId } = req.params;
    if (notificationId === 'all') {
      await pool.execute(
        'UPDATE notifications SET is_read = TRUE WHERE user_id = ?',
        [req.user.id]
      );
    } else {
      await pool.execute(
        'UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?',
        [notificationId, req.user.id]
      );
    }
    res.json({ success: true, message: 'Notifications marked as read' });
  } catch (error) {
    next(error);
  }
};

module.exports = { getNotifications, markAsRead };
