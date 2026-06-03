// backend/controllers/commentsController.js
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../config/database');
const { createNotification } = require('../utils/notificationService');
const { logActivity } = require('../utils/activityLogger');

const createComment = async (req, res, next) => {
  try {
    const { taskId } = req.params;
    const { content, mentions, parent_id } = req.body;
    const commentId = uuidv4();

    const [tasks] = await pool.execute('SELECT project_id, title FROM tasks WHERE id = ?', [taskId]);
    if (!tasks.length) return res.status(404).json({ success: false, message: 'Task not found' });

    await pool.execute(
      'INSERT INTO comments (id, task_id, user_id, content, mentions, parent_id) VALUES (?, ?, ?, ?, ?, ?)',
      [commentId, taskId, req.user.id, content, mentions ? JSON.stringify(mentions) : null, parent_id || null]
    );

    // Notify mentioned users
    if (mentions && mentions.length) {
      for (const username of mentions) {
        const [mentioned] = await pool.execute('SELECT id FROM users WHERE username = ?', [username]);
        if (mentioned.length && mentioned[0].id !== req.user.id) {
          await createNotification(mentioned[0].id, 'mention', 'You were mentioned',
            `${req.user.full_name} mentioned you in a comment on "${tasks[0].title}"`,
            { taskId, projectId: tasks[0].project_id }
          );
        }
      }
    }

    await logActivity(req.user.id, tasks[0].project_id, taskId, 'commented', 'comment', commentId,
      `${req.user.full_name} commented on "${tasks[0].title}"`);

    const [comments] = await pool.execute(
      `SELECT co.*, u.full_name, u.avatar_url, u.username
       FROM comments co JOIN users u ON co.user_id = u.id WHERE co.id = ?`,
      [commentId]
    );

    if (req.io) {
      req.io.to(`task:${taskId}`).emit('comment:added', comments[0]);
    }

    res.status(201).json({ success: true, data: { comment: comments[0] } });
  } catch (error) {
    next(error);
  }
};

const updateComment = async (req, res, next) => {
  try {
    const { commentId } = req.params;
    const { content } = req.body;

    const [comments] = await pool.execute('SELECT user_id FROM comments WHERE id = ?', [commentId]);
    if (!comments.length) return res.status(404).json({ success: false, message: 'Comment not found' });
    if (comments[0].user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Cannot edit another user\'s comment' });
    }

    await pool.execute('UPDATE comments SET content = ?, is_edited = TRUE WHERE id = ?', [content, commentId]);

    const [updated] = await pool.execute(
      `SELECT co.*, u.full_name, u.avatar_url, u.username
       FROM comments co JOIN users u ON co.user_id = u.id WHERE co.id = ?`,
      [commentId]
    );

    res.json({ success: true, data: { comment: updated[0] } });
  } catch (error) {
    next(error);
  }
};

const deleteComment = async (req, res, next) => {
  try {
    const { commentId } = req.params;
    const [comments] = await pool.execute('SELECT user_id FROM comments WHERE id = ?', [commentId]);
    if (!comments.length) return res.status(404).json({ success: false, message: 'Comment not found' });
    if (comments[0].user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Cannot delete another user\'s comment' });
    }
    await pool.execute('DELETE FROM comments WHERE id = ?', [commentId]);
    res.json({ success: true, message: 'Comment deleted' });
  } catch (error) {
    next(error);
  }
};

module.exports = { createComment, updateComment, deleteComment };
