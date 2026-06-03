-- TaskFlow Database Schema
-- Run this file to set up the complete database structure



-- ============================================================
-- USERS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  username VARCHAR(50) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(100) NOT NULL,
  avatar_url VARCHAR(500) DEFAULT NULL,
  role ENUM('admin', 'member') DEFAULT 'member',
  bio TEXT DEFAULT NULL,
  is_online BOOLEAN DEFAULT FALSE,
  last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  email_verified BOOLEAN DEFAULT FALSE,
  reset_token VARCHAR(255) DEFAULT NULL,
  reset_token_expires TIMESTAMP DEFAULT NULL,
  refresh_token TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_email (email),
  INDEX idx_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- PROJECTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS projects (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  name VARCHAR(200) NOT NULL,
  description TEXT DEFAULT NULL,
  color VARCHAR(7) DEFAULT '#6366f1',
  icon VARCHAR(10) DEFAULT '📋',
  status ENUM('active', 'on_hold', 'completed', 'archived') DEFAULT 'active',
  owner_id VARCHAR(36) NOT NULL,
  due_date DATE DEFAULT NULL,
  is_private BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_owner (owner_id),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- PROJECT MEMBERS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS project_members (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  project_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  role ENUM('owner', 'admin', 'member', 'viewer') DEFAULT 'member',
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  invited_by VARCHAR(36) DEFAULT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE KEY unique_project_member (project_id, user_id),
  INDEX idx_project (project_id),
  INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- TASKS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS tasks (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  title VARCHAR(500) NOT NULL,
  description TEXT DEFAULT NULL,
  project_id VARCHAR(36) NOT NULL,
  assigned_to VARCHAR(36) DEFAULT NULL,
  created_by VARCHAR(36) NOT NULL,
  status ENUM('todo', 'in_progress', 'review', 'completed') DEFAULT 'todo',
  priority ENUM('low', 'medium', 'high', 'urgent') DEFAULT 'medium',
  due_date DATE DEFAULT NULL,
  position INT DEFAULT 0,
  tags JSON DEFAULT NULL,
  attachments JSON DEFAULT NULL,
  estimated_hours DECIMAL(5,2) DEFAULT NULL,
  actual_hours DECIMAL(5,2) DEFAULT NULL,
  completed_at TIMESTAMP DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_project (project_id),
  INDEX idx_assigned (assigned_to),
  INDEX idx_status (status),
  INDEX idx_priority (priority),
  INDEX idx_position (position)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- COMMENTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS comments (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  task_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  content TEXT NOT NULL,
  mentions JSON DEFAULT NULL,
  attachments JSON DEFAULT NULL,
  parent_id VARCHAR(36) DEFAULT NULL,
  is_edited BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE SET NULL,
  INDEX idx_task (task_id),
  INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- NOTIFICATIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id VARCHAR(36) NOT NULL,
  type ENUM('task_assigned','task_updated','comment_added','mention','project_invite','deadline_reminder','member_joined') NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  data JSON DEFAULT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_unread (user_id, is_read),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- ACTIVITY LOGS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS activity_logs (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id VARCHAR(36) NOT NULL,
  project_id VARCHAR(36) DEFAULT NULL,
  task_id VARCHAR(36) DEFAULT NULL,
  action VARCHAR(100) NOT NULL,
  entity_type ENUM('project','task','comment','member') NOT NULL,
  entity_id VARCHAR(36) DEFAULT NULL,
  old_value JSON DEFAULT NULL,
  new_value JSON DEFAULT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL,
  INDEX idx_project (project_id),
  INDEX idx_user (user_id),
  INDEX idx_task (task_id),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- FILE ATTACHMENTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS file_attachments (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  filename VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  file_size INT NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  uploaded_by VARCHAR(36) NOT NULL,
  task_id VARCHAR(36) DEFAULT NULL,
  comment_id VARCHAR(36) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE,
  INDEX idx_task (task_id),
  INDEX idx_uploader (uploaded_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- SAMPLE DATA
-- ============================================================

-- Sample Users (passwords are all: Password123!)
INSERT INTO users (id, username, email, password_hash, full_name, role, bio, email_verified) VALUES
('usr-001', 'alex_admin', 'alex@taskflow.app', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Alex Johnson', 'admin', 'Project management enthusiast and team lead.', TRUE),
('usr-002', 'sarah_dev', 'sarah@taskflow.app', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Sarah Chen', 'member', 'Full-stack developer with a passion for clean code.', TRUE),
('usr-003', 'mike_design', 'mike@taskflow.app', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Mike Rivera', 'member', 'UI/UX Designer creating beautiful experiences.', TRUE),
('usr-004', 'priya_pm', 'priya@taskflow.app', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Priya Sharma', 'member', 'Product Manager focused on user-centric solutions.', TRUE);

-- Sample Projects
INSERT INTO projects (id, name, description, color, icon, status, owner_id, due_date) VALUES
('proj-001', 'TaskFlow Platform', 'Building the next-gen project management platform with real-time collaboration.', '#6366f1', '🚀', 'active', 'usr-001', '2024-12-31'),
('proj-002', 'Mobile App Redesign', 'Complete UI/UX overhaul of the mobile application for better user experience.', '#f59e0b', '📱', 'active', 'usr-003', '2024-11-30'),
('proj-003', 'API Integration', 'Integrating third-party APIs for payments, notifications, and analytics.', '#10b981', '🔗', 'active', 'usr-002', '2024-12-15');

-- Sample Project Members
INSERT INTO project_members (project_id, user_id, role, invited_by) VALUES
('proj-001', 'usr-001', 'owner', NULL),
('proj-001', 'usr-002', 'admin', 'usr-001'),
('proj-001', 'usr-003', 'member', 'usr-001'),
('proj-001', 'usr-004', 'member', 'usr-001'),
('proj-002', 'usr-003', 'owner', NULL),
('proj-002', 'usr-001', 'admin', 'usr-003'),
('proj-002', 'usr-004', 'member', 'usr-003'),
('proj-003', 'usr-002', 'owner', NULL),
('proj-003', 'usr-001', 'member', 'usr-002'),
('proj-003', 'usr-004', 'admin', 'usr-002');

-- Sample Tasks
INSERT INTO tasks (id, title, description, project_id, assigned_to, created_by, status, priority, due_date, position) VALUES
('task-001', 'Set up authentication system', 'Implement JWT-based auth with refresh tokens, password reset via email.', 'proj-001', 'usr-002', 'usr-001', 'completed', 'high', '2024-10-15', 1),
('task-002', 'Design Kanban board UI', 'Create drag-and-drop kanban board with smooth animations and mobile support.', 'proj-001', 'usr-003', 'usr-001', 'in_progress', 'high', '2024-11-01', 1),
('task-003', 'Implement WebSocket notifications', 'Real-time notifications using Socket.IO for task updates and mentions.', 'proj-001', 'usr-002', 'usr-001', 'in_progress', 'medium', '2024-11-15', 2),
('task-004', 'Write API documentation', 'Document all REST API endpoints with request/response examples.', 'proj-001', 'usr-004', 'usr-001', 'todo', 'medium', '2024-11-30', 1),
('task-005', 'Database optimization', 'Add proper indexes, optimize slow queries, implement connection pooling.', 'proj-001', 'usr-002', 'usr-001', 'review', 'high', '2024-10-25', 1),
('task-006', 'Redesign home screen', 'New home screen with personalized dashboard and quick actions.', 'proj-002', 'usr-003', 'usr-003', 'in_progress', 'high', '2024-11-10', 1),
('task-007', 'Navigation flow update', 'Simplify navigation structure based on user research findings.', 'proj-002', 'usr-004', 'usr-003', 'todo', 'medium', '2024-11-20', 1),
('task-008', 'Payment gateway integration', 'Integrate Stripe for subscription payments with webhook handling.', 'proj-003', 'usr-002', 'usr-002', 'in_progress', 'urgent', '2024-11-05', 1),
('task-009', 'Analytics dashboard', 'Build analytics tracking with Mixpanel integration and event logging.', 'proj-003', 'usr-004', 'usr-002', 'todo', 'medium', '2024-12-01', 1),
('task-010', 'Push notifications setup', 'Firebase Cloud Messaging integration for mobile push notifications.', 'proj-002', 'usr-002', 'usr-003', 'todo', 'low', '2024-12-05', 2);

-- Sample Comments
INSERT INTO comments (id, task_id, user_id, content, mentions) VALUES
('cmt-001', 'task-002', 'usr-001', 'Great progress on the Kanban board! @sarah_dev can you review the drag-and-drop implementation once Mike is done?', '["sarah_dev"]'),
('cmt-002', 'task-002', 'usr-003', 'Working on the mobile touch events now. Should be done by EOD tomorrow.', NULL),
('cmt-003', 'task-002', 'usr-002', 'Sure! I will review it. @mike_design make sure to test on iOS Safari as well.', '["mike_design"]'),
('cmt-004', 'task-008', 'usr-001', 'Priority task! @sarah_dev please make this the top priority this week.', '["sarah_dev"]'),
('cmt-005', 'task-001', 'usr-002', 'Auth system is complete and tested. All edge cases handled including rate limiting.', NULL);

-- Sample Activity Logs
INSERT INTO activity_logs (user_id, project_id, task_id, action, entity_type, entity_id, description) VALUES
('usr-001', 'proj-001', NULL, 'created', 'project', 'proj-001', 'Alex Johnson created project TaskFlow Platform'),
('usr-002', 'proj-001', 'task-001', 'updated', 'task', 'task-001', 'Sarah Chen marked task Set up authentication system as completed'),
('usr-003', 'proj-001', 'task-002', 'updated', 'task', 'task-002', 'Mike Rivera started working on Design Kanban board UI'),
('usr-001', 'proj-001', NULL, 'invited', 'member', 'usr-002', 'Alex Johnson invited Sarah Chen to TaskFlow Platform'),
('usr-002', 'proj-001', 'task-003', 'created', 'task', 'task-003', 'Sarah Chen created task Implement WebSocket notifications');

-- Sample Notifications
INSERT INTO notifications (user_id, type, title, message, is_read) VALUES
('usr-002', 'task_assigned', 'New Task Assigned', 'You have been assigned to "Implement WebSocket notifications"', FALSE),
('usr-003', 'mention', 'You were mentioned', 'Alex Johnson mentioned you in a comment on "Design Kanban board UI"', FALSE),
('usr-004', 'task_assigned', 'New Task Assigned', 'You have been assigned to "Write API documentation"', TRUE),
('usr-001', 'member_joined', 'New Member Joined', 'Sarah Chen joined the TaskFlow Platform project', TRUE);
