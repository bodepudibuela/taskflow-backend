// backend/middleware/auth.js
const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');

/**
 * Verify JWT token and attach user to request
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Access token required' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const [users] = await pool.execute(
      'SELECT id, username, email, full_name, avatar_url, role, is_online FROM users WHERE id = ?',
      [decoded.userId]
    );

    if (!users.length) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    req.user = users[0];
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

/**
 * Check if user is admin
 */
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  next();
};

/**
 * Check if user is a member of the project
 */
const requireProjectMember = async (req, res, next) => {
  try {
    const projectId = req.params.projectId || req.body.project_id;
    if (!projectId) return next();

    const [members] = await pool.execute(
      'SELECT role FROM project_members WHERE project_id = ? AND user_id = ?',
      [projectId, req.user.id]
    );

    if (!members.length) {
      return res.status(403).json({ success: false, message: 'Not a project member' });
    }

    req.projectRole = members[0].role;
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Check if user is project admin or owner
 */
const requireProjectAdmin = async (req, res, next) => {
  try {
    const projectId = req.params.projectId || req.body.project_id;

    const [members] = await pool.execute(
      'SELECT role FROM project_members WHERE project_id = ? AND user_id = ?',
      [projectId, req.user.id]
    );

    if (!members.length || !['owner', 'admin'].includes(members[0].role)) {
      return res.status(403).json({ success: false, message: 'Project admin access required' });
    }

    req.projectRole = members[0].role;
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = { authenticate, requireAdmin, requireProjectMember, requireProjectAdmin };
