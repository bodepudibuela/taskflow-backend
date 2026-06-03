// backend/utils/activityLogger.js
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../config/database');

/**
 * Log an activity event
 */
const logActivity = async (userId, projectId, taskId, action, entityType, entityId, description, oldValue = null, newValue = null) => {
  try {
    await pool.execute(
      `INSERT INTO activity_logs (id, user_id, project_id, task_id, action, entity_type, entity_id, old_value, new_value, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuidv4(), userId, projectId || null, taskId || null,
        action, entityType, entityId,
        oldValue ? JSON.stringify(oldValue) : null,
        newValue ? JSON.stringify(newValue) : null,
        description,
      ]
    );
  } catch (error) {
    // Non-critical — log but don't throw
    console.error('Activity log error:', error.message);
  }
};

module.exports = { logActivity };
