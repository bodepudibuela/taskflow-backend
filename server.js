// backend/server.js
require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
const { testConnection } = require('./config/database');
const { errorHandler, notFound } = require('./middleware/errorHandler');

const app = express();
const httpServer = http.createServer(app);

// ── Socket.IO ─────────────────────────────────────────────
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Socket authentication
const jwt = require('jsonwebtoken');
const { pool } = require('./config/database');

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication required'));
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const [users] = await pool.execute(
      'SELECT id, username, full_name, avatar_url FROM users WHERE id = ?',
      [decoded.userId]
    );
    if (!users.length) return next(new Error('User not found'));
    socket.user = users[0];
    next();
  } catch {
    next(new Error('Invalid token'));
  }
});

// Online user tracking
const onlineUsers = new Map();

io.on('connection', async (socket) => {
  const user = socket.user;
  console.log(`🔌 ${user.full_name} connected (${socket.id})`);

  // Mark online
  onlineUsers.set(user.id, { ...user, socketId: socket.id });
  await pool.execute('UPDATE users SET is_online = TRUE, last_seen = NOW() WHERE id = ?', [user.id]);
  io.emit('user:online', { userId: user.id, user });

  // Join project rooms
  socket.on('join:project', (projectId) => {
    socket.join(`project:${projectId}`);
    console.log(`${user.full_name} joined project room: ${projectId}`);
  });

  socket.on('leave:project', (projectId) => {
    socket.leave(`project:${projectId}`);
  });

  // Join task room (for comments)
  socket.on('join:task', (taskId) => socket.join(`task:${taskId}`));
  socket.on('leave:task', (taskId) => socket.leave(`task:${taskId}`));

  // Typing indicator
  socket.on('typing:start', ({ taskId }) => {
    socket.to(`task:${taskId}`).emit('user:typing', { userId: user.id, username: user.username });
  });
  socket.on('typing:stop', ({ taskId }) => {
    socket.to(`task:${taskId}`).emit('user:stopped_typing', { userId: user.id });
  });

  // Disconnect
  socket.on('disconnect', async () => {
    onlineUsers.delete(user.id);
    await pool.execute('UPDATE users SET is_online = FALSE, last_seen = NOW() WHERE id = ?', [user.id]);
    io.emit('user:offline', { userId: user.id });
    console.log(`❌ ${user.full_name} disconnected`);
  });
});

// Attach io to requests
app.use((req, res, next) => {
  req.io = io;
  next();
});

// ── Middleware ────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: { success: false, message: 'Too many requests, please try again later' },
});
app.use('/api/', limiter);

// ── Routes ────────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/users', require('./routes/users'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'TaskFlow API is running', version: '1.0.0' });
});

// ── Error Handling ────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

const start = async () => {
  await testConnection();
  httpServer.listen(PORT, () => {
    console.log(`\n🚀 TaskFlow API running on port ${PORT}`);
    console.log(`📡 Socket.IO ready`);
    console.log(`🌐 CORS: ${process.env.FRONTEND_URL || 'http://localhost:3000'}\n`);
  });
};

start();
