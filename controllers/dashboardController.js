// backend/controllers/dashboardController.js
const { pool } = require('../config/database');

/**
 * @route   GET /api/dashboard
 * @desc    Get dashboard stats for current user
 * @access  Private
 */
const getDashboard = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Total projects
    const [[{ total_projects }]] = await pool.execute(
      'SELECT COUNT(*) as total_projects FROM project_members WHERE user_id = ?', [userId]
    );

    // Task stats
    const [taskStats] = await pool.execute(
      `SELECT 
        COUNT(*) as total_tasks,
        SUM(status = 'completed') as completed_tasks,
        SUM(status = 'in_progress') as active_tasks,
        SUM(status = 'todo') as todo_tasks,
        SUM(status = 'review') as review_tasks,
        SUM(due_date < CURDATE() AND status != 'completed') as overdue_tasks
       FROM tasks t
       JOIN project_members pm ON t.project_id = pm.project_id
       WHERE pm.user_id = ?`,
      [userId]
    );

    // My assigned tasks
    const [myTasks] = await pool.execute(
      `SELECT t.id, t.title, t.status, t.priority, t.due_date, t.project_id,
        p.name as project_name, p.color as project_color
       FROM tasks t JOIN projects p ON t.project_id = p.id
       WHERE t.assigned_to = ? AND t.status != 'completed'
       ORDER BY t.due_date ASC, t.priority DESC LIMIT 10`,
      [userId]
    );

    // Recent activity
    const [recentActivity] = await pool.execute(
      `SELECT al.*, u.full_name, u.avatar_url
       FROM activity_logs al JOIN users u ON al.user_id = u.id
       WHERE al.project_id IN (
         SELECT project_id FROM project_members WHERE user_id = ?
       )
       ORDER BY al.created_at DESC LIMIT 15`,
      [userId]
    );

    // Team performance (projects I'm in)
    const [teamStats] = await pool.execute(
      `SELECT u.id, u.full_name, u.avatar_url, u.username, u.is_online,
        COUNT(t.id) as assigned_tasks,
        SUM(t.status = 'completed') as completed_tasks
       FROM project_members pm
       JOIN project_members pm2 ON pm.project_id = pm2.project_id
       JOIN users u ON pm2.user_id = u.id
       LEFT JOIN tasks t ON t.assigned_to = u.id AND t.project_id = pm.project_id
       WHERE pm.user_id = ?
       GROUP BY u.id ORDER BY completed_tasks DESC LIMIT 8`,
      [userId]
    );

    // Upcoming deadlines
    const [upcomingDeadlines] = await pool.execute(
      `SELECT t.id, t.title, t.due_date, t.priority, t.status, t.project_id,
        p.name as project_name, p.color as project_color
       FROM tasks t JOIN projects p ON t.project_id = p.id
       JOIN project_members pm ON t.project_id = pm.project_id
       WHERE pm.user_id = ? AND t.due_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)
       AND t.status != 'completed'
       ORDER BY t.due_date ASC LIMIT 5`,
      [userId]
    );

    // Project progress
    const [projectProgress] = await pool.execute(
      `SELECT p.id, p.name, p.color, p.icon, p.status,
        COUNT(t.id) as total_tasks,
        SUM(t.status = 'completed') as completed_tasks,
        ROUND(100 * SUM(t.status = 'completed') / NULLIF(COUNT(t.id), 0), 0) as progress
       FROM projects p
       JOIN project_members pm ON p.id = pm.project_id
       LEFT JOIN tasks t ON p.id = t.project_id
       WHERE pm.user_id = ?
       GROUP BY p.id ORDER BY p.updated_at DESC LIMIT 6`,
      [userId]
    );

    res.json({
      success: true,
      data: {
        stats: { ...taskStats[0], total_projects },
        myTasks,
        recentActivity,
        teamStats,
        upcomingDeadlines,
        projectProgress,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getDashboard };
