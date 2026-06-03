// backend/routes/tasks.js
const express  = require('express');
const router   = express.Router();
const { v4: uuidv4 } = require('uuid');
const { authenticate, requireProjectMember } = require('../middleware/auth');
const { getTasks, createTask, getTask, updateTask, deleteTask, reorderTasks } = require('../controllers/tasksController');
const { createComment, updateComment, deleteComment } = require('../controllers/commentsController');
const upload   = require('../utils/fileUpload');
const { pool } = require('../config/database');

router.use(authenticate);

// Task CRUD
router.get('/project/:projectId',  requireProjectMember, getTasks);
router.post('/project/:projectId', requireProjectMember, createTask);
router.put('/reorder',             reorderTasks);
router.get('/:taskId',             getTask);
router.put('/:taskId',             updateTask);
router.delete('/:taskId',          deleteTask);

// Comments
router.post('/:taskId/comments',      createComment);
router.put('/comments/:commentId',    updateComment);
router.delete('/comments/:commentId', deleteComment);

// File Attachments
router.post('/:taskId/attachments', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    const attachId = uuidv4();
    const filePath = `/uploads/${req.file.filename}`;
    await pool.execute(
      `INSERT INTO file_attachments (id, filename, original_name, file_path, file_size, mime_type, uploaded_by, task_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [attachId, req.file.filename, req.file.originalname, filePath, req.file.size, req.file.mimetype, req.user.id, req.params.taskId]
    );
    res.json({ success: true, data: { attachment: { id: attachId, filename: req.file.filename, original_name: req.file.originalname, file_path: filePath, file_size: req.file.size, mime_type: req.file.mimetype } } });
  } catch (error) { next(error); }
});

module.exports = router;
