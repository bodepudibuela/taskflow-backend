// backend/controllers/usersController.js
const bcrypt = require('bcryptjs');
const { pool } = require('../config/database');

/**
 * @route   GET /api/users/search?q=
 * @desc    Search users by name / username / email
 * @access  Private
 */
const searchUsers = async (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) {
      return res.json({ success: true, data: { users: [] } });
    }
    const [users] = await pool.execute(
      `SELECT id, username, email, full_name, avatar_url
       FROM users
       WHERE username LIKE ? OR full_name LIKE ? OR email LIKE ?
       LIMIT 10`,
      [`%${q}%`, `%${q}%`, `%${q}%`]
    );
    res.json({ success: true, data: { users } });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/users
 * @desc    Get all users (admin)
 * @access  Private / Admin
 */
const getAllUsers = async (req, res, next) => {
  try {
    const [users] = await pool.execute(
      `SELECT id, username, email, full_name, avatar_url, role, is_online, last_seen, created_at
       FROM users ORDER BY created_at DESC`
    );
    res.json({ success: true, data: { users } });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   PUT /api/users/profile
 * @desc    Update current user's profile
 * @access  Private
 */
const updateProfile = async (req, res, next) => {
  try {
    const { full_name, bio, username } = req.body;
    const avatar_url = req.file ? `/uploads/${req.file.filename}` : undefined;

    const fields = [];
    const values = [];

    if (full_name)             { fields.push('full_name = ?');  values.push(full_name); }
    if (bio !== undefined)     { fields.push('bio = ?');        values.push(bio); }
    if (username)              { fields.push('username = ?');   values.push(username); }
    if (avatar_url)            { fields.push('avatar_url = ?'); values.push(avatar_url); }

    if (fields.length) {
      values.push(req.user.id);
      await pool.execute(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);
    }

    const [users] = await pool.execute(
      `SELECT id, username, email, full_name, avatar_url, role, bio, is_online, created_at
       FROM users WHERE id = ?`,
      [req.user.id]
    );
    res.json({ success: true, data: { user: users[0] } });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   PUT /api/users/password
 * @desc    Change password
 * @access  Private
 */
const changePassword = async (req, res, next) => {
  try {
    const { current_password, new_password } = req.body;

    const [users] = await pool.execute(
      'SELECT password_hash FROM users WHERE id = ?', [req.user.id]
    );
    if (!users.length) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const valid = await bcrypt.compare(current_password, users[0].password_hash);
    if (!valid) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect' });
    }

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(new_password, salt);
    await pool.execute('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash, req.user.id]);

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    next(error);
  }
};

module.exports = { searchUsers, getAllUsers, updateProfile, changePassword };
