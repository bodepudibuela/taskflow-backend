// backend/routes/auth.js
const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { authenticate } = require('../middleware/auth');
const { register, login, logout, refreshToken, forgotPassword, resetPassword, getMe } = require('../controllers/authController');

const validate = (validations) => async (req, res, next) => {
  await Promise.all(validations.map(v => v.run(req)));
  const { validationResult } = require('express-validator');
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: errors.array()[0].msg });
  }
  next();
};

router.post('/register', validate([
  body('username').trim().isLength({ min: 3, max: 50 }).withMessage('Username must be 3-50 chars'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 chars'),
  body('full_name').trim().notEmpty().withMessage('Full name is required'),
]), register);

router.post('/login', validate([
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
]), login);

router.post('/logout', authenticate, logout);
router.post('/refresh-token', refreshToken);
router.post('/forgot-password', validate([body('email').isEmail()]), forgotPassword);
router.post('/reset-password', validate([
  body('token').notEmpty(),
  body('password').isLength({ min: 8 }),
]), resetPassword);
router.get('/me', authenticate, getMe);

module.exports = router;
