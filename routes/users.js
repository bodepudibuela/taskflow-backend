// backend/routes/users.js
const express  = require('express');
const router   = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const { searchUsers, getAllUsers, updateProfile, changePassword } = require('../controllers/usersController');
const upload   = require('../utils/fileUpload');

router.use(authenticate);

router.get('/search',   searchUsers);
router.get('/',         requireAdmin, getAllUsers);
router.put('/profile',  upload.single('avatar'), updateProfile);
router.put('/password', changePassword);

module.exports = router;
