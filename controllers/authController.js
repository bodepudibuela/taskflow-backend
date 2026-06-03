// backend/controllers/authController.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../config/database');
const { sendEmail } = require('../utils/emailService');
const { logActivity } = require('../utils/activityLogger');

/**
 * Generate JWT tokens
 */
const generateTokens = (userId) => {
  const accessToken = jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
  const refreshToken = jwt.sign({ userId }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  });
  return { accessToken, refreshToken };
};

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user
 * @access  Public
 */
const register = async (req, res, next) => {
  try {
    const { username, email, password, full_name } = req.body;

    // Check existing user
    const [existing] = await pool.execute(
      'SELECT id FROM users WHERE email = ? OR username = ?',
      [email, username]
    );
    if (existing.length) {
      return res.status(409).json({
        success: false,
        message: 'Email or username already registered',
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);
    const userId = uuidv4();

    await pool.execute(
      `INSERT INTO users (id, username, email, password_hash, full_name, email_verified) 
       VALUES (?, ?, ?, ?, ?, TRUE)`,
      [userId, username, email, password_hash, full_name]
    );

    const { accessToken, refreshToken } = generateTokens(userId);

    // Store refresh token
    await pool.execute('UPDATE users SET refresh_token = ? WHERE id = ?', [refreshToken, userId]);

    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      data: {
        user: { id: userId, username, email, full_name, role: 'member' },
        accessToken,
        refreshToken,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/auth/login
 * @desc    Login user
 * @access  Public
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const [users] = await pool.execute(
      'SELECT id, username, email, password_hash, full_name, avatar_url, role FROM users WHERE email = ?',
      [email]
    );

    if (!users.length || !(await bcrypt.compare(password, users[0].password_hash))) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const user = users[0];
    const { accessToken, refreshToken } = generateTokens(user.id);

    await pool.execute(
      'UPDATE users SET refresh_token = ?, is_online = TRUE, last_seen = NOW() WHERE id = ?',
      [refreshToken, user.id]
    );

    const { password_hash, ...userData } = user;

    res.json({
      success: true,
      message: 'Login successful',
      data: { user: userData, accessToken, refreshToken },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user
 * @access  Private
 */
const logout = async (req, res, next) => {
  try {
    await pool.execute(
      'UPDATE users SET refresh_token = NULL, is_online = FALSE, last_seen = NOW() WHERE id = ?',
      [req.user.id]
    );
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/auth/refresh-token
 * @desc    Refresh access token
 * @access  Public
 */
const refreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(401).json({ success: false, message: 'Refresh token required' });
    }

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const [users] = await pool.execute(
      'SELECT id, refresh_token FROM users WHERE id = ?',
      [decoded.userId]
    );

    if (!users.length || users[0].refresh_token !== refreshToken) {
      return res.status(401).json({ success: false, message: 'Invalid refresh token' });
    }

    const { accessToken, refreshToken: newRefreshToken } = generateTokens(users[0].id);
    await pool.execute('UPDATE users SET refresh_token = ? WHERE id = ?', [newRefreshToken, users[0].id]);

    res.json({ success: true, data: { accessToken, refreshToken: newRefreshToken } });
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Invalid or expired refresh token' });
    }
    next(error);
  }
};

/**
 * @route   POST /api/auth/forgot-password
 * @desc    Send password reset email
 * @access  Public
 */
const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    const [users] = await pool.execute('SELECT id, full_name FROM users WHERE email = ?', [email]);

    // Always return success to prevent email enumeration
    if (!users.length) {
      return res.json({ success: true, message: 'If that email exists, a reset link has been sent' });
    }

    const resetToken = uuidv4();
    const expires = new Date(Date.now() + 3600000); // 1 hour

    await pool.execute(
      'UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?',
      [resetToken, expires, users[0].id]
    );

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    await sendEmail({
      to: email,
      subject: 'TaskFlow Password Reset',
      html: `
        <h2>Password Reset Request</h2>
        <p>Hello ${users[0].full_name},</p>
        <p>Click the link below to reset your password. This link expires in 1 hour.</p>
        <a href="${resetUrl}" style="background:#6366f1;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;">Reset Password</a>
        <p>If you didn't request this, please ignore this email.</p>
      `,
    });

    res.json({ success: true, message: 'If that email exists, a reset link has been sent' });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/auth/reset-password
 * @desc    Reset password with token
 * @access  Public
 */
const resetPassword = async (req, res, next) => {
  try {
    const { token, password } = req.body;

    const [users] = await pool.execute(
      'SELECT id FROM users WHERE reset_token = ? AND reset_token_expires > NOW()',
      [token]
    );

    if (!users.length) {
      return res.status(400).json({ success: false, message: 'Invalid or expired reset token' });
    }

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    await pool.execute(
      'UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?',
      [password_hash, users[0].id]
    );

    res.json({ success: true, message: 'Password reset successfully' });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/auth/me
 * @desc    Get current user
 * @access  Private
 */
const getMe = async (req, res, next) => {
  try {
    const [users] = await pool.execute(
      'SELECT id, username, email, full_name, avatar_url, role, bio, is_online, last_seen, created_at FROM users WHERE id = ?',
      [req.user.id]
    );
    res.json({ success: true, data: { user: users[0] } });
  } catch (error) {
    next(error);
  }
};

module.exports = { register, login, logout, refreshToken, forgotPassword, resetPassword, getMe };
