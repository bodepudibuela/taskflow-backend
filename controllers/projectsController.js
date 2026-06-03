// backend/controllers/projectsController.js
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../config/database');
const { logActivity } = require('../utils/activityLogger');
const { createNotification } = require('../utils/notificationService');

/**
 * @route   GET /api/projects
 * @desc    Get all projects for current user
 * @access  Private
 */
const getProjects = async (req, res, next) => {
  try {
    const [projects] = await pool.execute(
      `SELECT p.*, u.full_name as owner_name, u.avatar_url as owner_avatar,
       pm.role as user_role,
       (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) as task_count,
       (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'completed') as completed_tasks,
       (SELECT COUNT(*) FROM project_members pm2 WHERE pm2.project_id = p.id) as member_count
       FROM projects p
       JOIN project_members pm ON p.id = pm.project_id
       JOIN users u ON p.owner_id = u.id
       WHERE pm.user_id = ?
       ORDER BY p.updated_at DESC`,
      [req.user.id]
    );
    res.json({ success: true, data: { projects } });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/projects
 * @desc    Create a new project
 * @access  Private
 */
const createProject = async (req, res, next) => {
  try {
    const { name, description, color, icon, due_date, is_private } = req.body;
    const projectId = uuidv4();

    await pool.execute(
      `INSERT INTO projects (id, name, description, color, icon, owner_id, due_date, is_private) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [projectId, name, description || null, color || '#6366f1', icon || '📋',
       req.user.id, due_date || null, is_private ? 1 : 0]
    );

    // Add creator as owner member
    await pool.execute(
      'INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)',
      [projectId, req.user.id, 'owner']
    );

    await logActivity(req.user.id, projectId, null, 'created', 'project', projectId,
      `${req.user.full_name} created project ${name}`);

    const [projects] = await pool.execute(
      'SELECT * FROM projects WHERE id = ?', [projectId]
    );

    res.status(201).json({ success: true, message: 'Project created', data: { project: projects[0] } });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/projects/:projectId
 * @desc    Get project details with members and tasks
 * @access  Private (member only)
 */
const getProject = async (req, res, next) => {
  try {
    const { projectId } = req.params;

    const [projects] = await pool.execute(
      `SELECT p.*, u.full_name as owner_name, u.avatar_url as owner_avatar
       FROM projects p JOIN users u ON p.owner_id = u.id WHERE p.id = ?`,
      [projectId]
    );

    if (!projects.length) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    // Get members
    const [members] = await pool.execute(
      `SELECT u.id, u.username, u.full_name, u.avatar_url, u.email, u.is_online,
       pm.role, pm.joined_at
       FROM project_members pm JOIN users u ON pm.user_id = u.id
       WHERE pm.project_id = ?`,
      [projectId]
    );

    // Get tasks grouped by status
    const [tasks] = await pool.execute(
      `SELECT t.*, u.full_name as assignee_name, u.avatar_url as assignee_avatar,
       c.full_name as creator_name,
       (SELECT COUNT(*) FROM comments co WHERE co.task_id = t.id) as comment_count
       FROM tasks t 
       LEFT JOIN users u ON t.assigned_to = u.id
       LEFT JOIN users c ON t.created_by = c.id
       WHERE t.project_id = ? ORDER BY t.position, t.created_at`,
      [projectId]
    );

    res.json({ success: true, data: { project: projects[0], members, tasks } });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   PUT /api/projects/:projectId
 * @desc    Update project
 * @access  Private (admin/owner)
 */
const updateProject = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const { name, description, color, icon, status, due_date, is_private } = req.body;

    await pool.execute(
      `UPDATE projects SET name = COALESCE(?, name), description = COALESCE(?, description),
       color = COALESCE(?, color), icon = COALESCE(?, icon), status = COALESCE(?, status),
       due_date = COALESCE(?, due_date), is_private = COALESCE(?, is_private)
       WHERE id = ?`,
      [name, description, color, icon, status, due_date, is_private !== undefined ? (is_private ? 1 : 0) : null, projectId]
    );

    await logActivity(req.user.id, projectId, null, 'updated', 'project', projectId,
      `${req.user.full_name} updated project details`);

    const [projects] = await pool.execute('SELECT * FROM projects WHERE id = ?', [projectId]);
    res.json({ success: true, message: 'Project updated', data: { project: projects[0] } });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   DELETE /api/projects/:projectId
 * @desc    Delete project
 * @access  Private (owner only)
 */
const deleteProject = async (req, res, next) => {
  try {
    const { projectId } = req.params;

    const [projects] = await pool.execute('SELECT owner_id, name FROM projects WHERE id = ?', [projectId]);
    if (!projects.length) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }
    if (projects[0].owner_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only the project owner can delete it' });
    }

    await pool.execute('DELETE FROM projects WHERE id = ?', [projectId]);
    res.json({ success: true, message: 'Project deleted successfully' });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/projects/:projectId/members
 * @desc    Invite a member to project
 * @access  Private (admin/owner)
 */
const inviteMember = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const { email, role = 'member' } = req.body;

    const [users] = await pool.execute('SELECT id, full_name, email FROM users WHERE email = ?', [email]);
    if (!users.length) {
      return res.status(404).json({ success: false, message: 'User not found with that email' });
    }

    const invitedUser = users[0];
    const [existing] = await pool.execute(
      'SELECT id FROM project_members WHERE project_id = ? AND user_id = ?',
      [projectId, invitedUser.id]
    );

    if (existing.length) {
      return res.status(409).json({ success: false, message: 'User is already a project member' });
    }

    await pool.execute(
      'INSERT INTO project_members (project_id, user_id, role, invited_by) VALUES (?, ?, ?, ?)',
      [projectId, invitedUser.id, role, req.user.id]
    );

    const [projects] = await pool.execute('SELECT name FROM projects WHERE id = ?', [projectId]);

    await createNotification(invitedUser.id, 'project_invite', 'Project Invitation',
      `${req.user.full_name} invited you to join "${projects[0].name}"`,
      { projectId }
    );

    await logActivity(req.user.id, projectId, null, 'invited', 'member', invitedUser.id,
      `${req.user.full_name} invited ${invitedUser.full_name} to the project`);

    res.json({ success: true, message: `${invitedUser.full_name} added to project` });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   DELETE /api/projects/:projectId/members/:userId
 * @desc    Remove member from project
 * @access  Private (admin/owner)
 */
const removeMember = async (req, res, next) => {
  try {
    const { projectId, userId } = req.params;

    const [members] = await pool.execute(
      'SELECT role FROM project_members WHERE project_id = ? AND user_id = ?',
      [projectId, userId]
    );

    if (!members.length) {
      return res.status(404).json({ success: false, message: 'Member not found' });
    }
    if (members[0].role === 'owner') {
      return res.status(403).json({ success: false, message: 'Cannot remove the project owner' });
    }

    await pool.execute('DELETE FROM project_members WHERE project_id = ? AND user_id = ?', [projectId, userId]);
    res.json({ success: true, message: 'Member removed from project' });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/projects/:projectId/activity
 * @desc    Get project activity log
 * @access  Private (member)
 */
const getProjectActivity = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const limit = parseInt(req.query.limit) || 20;

    const [activities] = await pool.execute(
      `SELECT al.*, u.full_name, u.avatar_url FROM activity_logs al
       JOIN users u ON al.user_id = u.id
       WHERE al.project_id = ? ORDER BY al.created_at DESC LIMIT ?`,
      [projectId, limit]
    );
    res.json({ success: true, data: { activities } });
  } catch (error) {
    next(error);
  }
};

module.exports = { getProjects, createProject, getProject, updateProject, deleteProject, inviteMember, removeMember, getProjectActivity };
