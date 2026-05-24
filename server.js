const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const cors = require('cors');
const path = require('path');
const { initDatabase } = require('./database/init');

// Initialize database
const db = initDatabase();

// Make db available to routes
const app = express();

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session configuration
const DB_DIR = process.env.DB_DIR || path.join(__dirname, 'database');
app.use(session({
  store: new SQLiteStore({
    db: 'sessions.db',
    dir: DB_DIR
  }),
  secret: 'rcs-attendance-secret-key-2024',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    httpOnly: true,
    sameSite: 'lax'
  }
}));

// Attach db to request
app.use((req, res, next) => {
  req.db = db;
  next();
});

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Create uploads directory
const fs = require('fs');
const uploadsDir = process.env.UPLOADS_DIR || path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Routes
const authRoutes = require('./routes/auth.routes');
const adminRoutes = require('./routes/admin.routes');
const supervisorRoutes = require('./routes/supervisor.routes');

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/supervisor', supervisorRoutes);

// Serve HTML pages
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/supervisor', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'supervisor.html'));
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🏢 RCS Attendance Manager running at http://localhost:${PORT}`);
  console.log(`📋 Default admin login: admin / rcs@admin2024\n`);
});
