// backend/controllers/tasksController.js
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../config/database');
const { logActivity } = require('../utils/activityLogger');
const { createNotification } = require('../utils/notificationService');

/**
 * @route   GET /api/projects/:projectId/tasks
 * @desc    Get all tasks for a project
 * @access  Private (member)
 */
const getTasks = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const { status, priority, assigned_to, search } = req.query;

    let query = `
      SELECT t.*, 
        u.full_name as assignee_name, u.avatar_url as assignee_avatar, u.username as assignee_username,
        c.full_name as creator_name, c.avatar_url as creator_avatar,
        (SELECT COUNT(*) FROM comments co WHERE co.task_id = t.id) as comment_count,
        (SELECT COUNT(*) FROM file_attachments fa WHERE fa.task_id = t.id) as attachment_count
      FROM tasks t
      LEFT JOIN users u ON t.assigned_to = u.id
      LEFT JOIN users c ON t.created_by = c.id
      WHERE t.project_id = ?
    `;
    const params = [projectId];

    if (status) { query += ' AND t.status = ?'; params.push(status); }
    if (priority) { query += ' AND t.priority = ?'; params.push(priority); }
    if (assigned_to) { query += ' AND t.assigned_to = ?'; params.push(assigned_to); }
    if (search) { query += ' AND (t.title LIKE ? OR t.description LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }

    query += ' ORDER BY t.position ASC, t.created_at ASC';

    const [tasks] = await pool.execute(query, params);
    res.json({ success: true, data: { tasks } });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/projects/:projectId/tasks
 * @desc    Create a new task
 * @access  Private (member)
 */
const createTask = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const { title, description, assigned_to, priority, due_date, status, tags, estimated_hours } = req.body;
    const taskId = uuidv4();

    // Get max position for this status column
    const [posResult] = await pool.execute(
      'SELECT COALESCE(MAX(position), 0) + 1 as next_pos FROM tasks WHERE project_id = ? AND status = ?',
      [projectId, status || 'todo']
    );

    await pool.execute(
      `INSERT INTO tasks (id, title, description, project_id, assigned_to, created_by, status, priority, due_date, tags, estimated_hours, position)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [taskId, title, description || null, projectId, assigned_to || null, req.user.id,
       status || 'todo', priority || 'medium', due_date || null,
       tags ? JSON.stringify(tags) : null, estimated_hours || null, posResult[0].next_pos]
    );

    // Notify assigned user
    if (assigned_to && assigned_to !== req.user.id) {
      await createNotification(assigned_to, 'task_assigned', 'Task Assigned to You',
        `${req.user.full_name} assigned you to "${title}"`, { taskId, projectId }
      );
    }

    await logActivity(req.user.id, projectId, taskId, 'created', 'task', taskId,
      `${req.user.full_name} created task "${title}"`);

    const [tasks] = await pool.execute(
      `SELECT t.*, u.full_name as assignee_name, u.avatar_url as assignee_avatar
       FROM tasks t LEFT JOIN users u ON t.assigned_to = u.id WHERE t.id = ?`,
      [taskId]
    );

    // Emit socket event
    if (req.io) {
      req.io.to(`project:${projectId}`).emit('task:created', tasks[0]);
    }

    res.status(201).json({ success: true, message: 'Task created', data: { task: tasks[0] } });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/tasks/:taskId
 * @desc    Get single task with comments
 * @access  Private
 */
const getTask = async (req, res, next) => {
  try {
    const { taskId } = req.params;

    const [tasks] = await pool.execute(
      `SELECT t.*, 
        u.full_name as assignee_name, u.avatar_url as assignee_avatar, u.username as assignee_username,
        c.full_name as creator_name, c.avatar_url as creator_avatar
       FROM tasks t
       LEFT JOIN users u ON t.assigned_to = u.id
       LEFT JOIN users c ON t.created_by = c.id
       WHERE t.id = ?`,
      [taskId]
    );

    if (!tasks.length) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    const [comments] = await pool.execute(
      `SELECT co.*, u.full_name, u.avatar_url, u.username
       FROM comments co JOIN users u ON co.user_id = u.id
       WHERE co.task_id = ? ORDER BY co.created_at ASC`,
      [taskId]
    );

    const [attachments] = await pool.execute(
      `SELECT fa.*, u.full_name as uploader_name
       FROM file_attachments fa JOIN users u ON fa.uploaded_by = u.id
       WHERE fa.task_id = ? ORDER BY fa.created_at DESC`,
      [taskId]
    );

    res.json({ success: true, data: { task: tasks[0], comments, attachments } });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   PUT /api/tasks/:taskId
 * @desc    Update task
 * @access  Private
 */
const updateTask = async (req, res, next) => {
  try {
    const { taskId } = req.params;
    const updates = req.body;

    const [existing] = await pool.execute('SELECT * FROM tasks WHERE id = ?', [taskId]);
    if (!existing.length) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    const task = existing[0];
    const fields = [];
    const values = [];

    const allowedFields = ['title', 'description', 'assigned_to', 'status', 'priority', 'due_date', 'tags', 'estimated_hours', 'actual_hours', 'position'];
    allowedFields.forEach(field => {
      if (updates[field] !== undefined) {
        fields.push(`${field} = ?`);
        values.push(field === 'tags' ? JSON.stringify(updates[field]) : updates[field]);
      }
    });

    // Auto-set completed_at
    if (updates.status === 'completed' && task.status !== 'completed') {
      fields.push('completed_at = NOW()');
    } else if (updates.status && updates.status !== 'completed') {
      fields.push('completed_at = NULL');
    }

    if (fields.length) {
      values.push(taskId);
      await pool.execute(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`, values);
    }

    // Notifications
    if (updates.assigned_to && updates.assigned_to !== task.assigned_to && updates.assigned_to !== req.user.id) {
      await createNotification(updates.assigned_to, 'task_assigned', 'Task Assigned to You',
        `${req.user.full_name} assigned you to "${task.title}"`, { taskId, projectId: task.project_id }
      );
    }

    const statusChanged = updates.status && updates.status !== task.status;
    await logActivity(req.user.id, task.project_id, taskId, 'updated', 'task', taskId,
      statusChanged
        ? `${req.user.full_name} moved "${task.title}" to ${updates.status}`
        : `${req.user.full_name} updated task "${task.title}"`
    );

    const [updatedTask] = await pool.execute(
      `SELECT t.*, u.full_name as assignee_name, u.avatar_url as assignee_avatar
       FROM tasks t LEFT JOIN users u ON t.assigned_to = u.id WHERE t.id = ?`,
      [taskId]
    );

    if (req.io) {
      req.io.to(`project:${task.project_id}`).emit('task:updated', updatedTask[0]);
    }

    res.json({ success: true, message: 'Task updated', data: { task: updatedTask[0] } });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   DELETE /api/tasks/:taskId
 * @desc    Delete task
 * @access  Private
 */
const deleteTask = async (req, res, next) => {
  try {
    const { taskId } = req.params;
    const [tasks] = await pool.execute('SELECT project_id, title FROM tasks WHERE id = ?', [taskId]);

    if (!tasks.length) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    await pool.execute('DELETE FROM tasks WHERE id = ?', [taskId]);

    await logActivity(req.user.id, tasks[0].project_id, null, 'deleted', 'task', taskId,
      `${req.user.full_name} deleted task "${tasks[0].title}"`);

    if (req.io) {
      req.io.to(`project:${tasks[0].project_id}`).emit('task:deleted', { taskId, projectId: tasks[0].project_id });
    }

    res.json({ success: true, message: 'Task deleted' });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   PUT /api/tasks/reorder
 * @desc    Reorder tasks (drag & drop)
 * @access  Private
 */
const reorderTasks = async (req, res, next) => {
  try {
    const { tasks, projectId } = req.body;
    // tasks: [{ id, status, position }]

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      for (const task of tasks) {
        await connection.execute(
          'UPDATE tasks SET status = ?, position = ? WHERE id = ?',
          [task.status, task.position, task.id]
        );
      }
      await connection.commit();
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }

    if (req.io) {
      req.io.to(`project:${projectId}`).emit('tasks:reordered', { tasks, projectId });
    }

    res.json({ success: true, message: 'Tasks reordered' });
  } catch (error) {
    next(error);
  }
};

module.exports = { getTasks, createTask, getTask, updateTask, deleteTask, reorderTasks };
