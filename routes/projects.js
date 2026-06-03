// backend/routes/projects.js
const express = require('express');
const router = express.Router();
const { authenticate, requireProjectMember, requireProjectAdmin } = require('../middleware/auth');
const {
  getProjects, createProject, getProject, updateProject, deleteProject,
  inviteMember, removeMember, getProjectActivity
} = require('../controllers/projectsController');

router.use(authenticate);

router.get('/', getProjects);
router.post('/', createProject);
router.get('/:projectId', requireProjectMember, getProject);
router.put('/:projectId', requireProjectAdmin, updateProject);
router.delete('/:projectId', deleteProject);
router.post('/:projectId/members', requireProjectAdmin, inviteMember);
router.delete('/:projectId/members/:userId', requireProjectAdmin, removeMember);
router.get('/:projectId/activity', requireProjectMember, getProjectActivity);

module.exports = router;
