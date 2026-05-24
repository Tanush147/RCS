const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const path = require('path');

const DB_DIR = process.env.DB_DIR || __dirname;
const DB_PATH = path.join(DB_DIR, 'rcs_attendance.db');

function initDatabase() {
  const db = new Database(DB_PATH);

  // Enable WAL mode for better performance
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      code TEXT NOT NULL UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'supervisor')),
      full_name TEXT NOT NULL,
      department_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      designation TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      department_id INTEGER NOT NULL,
      cl_quota INTEGER DEFAULT 12,
      fl_quota INTEGER DEFAULT 10,
      nh_quota INTEGER DEFAULT 8,
      week_off TEXT DEFAULT 'Sunday',
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS department_monthly_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      department_id INTEGER NOT NULL,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      working_days INTEGER DEFAULT 0,
      national_holidays INTEGER DEFAULT 0,
      festive_leaves INTEGER DEFAULT 0,
      FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE,
      UNIQUE(department_id, year, month)
    );

    CREATE TABLE IF NOT EXISTS daily_attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      status TEXT CHECK(status IN ('P', 'A', 'CL', 'FL', 'NH', 'WO', 'none')) DEFAULT 'none',
      overtime_hours REAL DEFAULT 0,
      marked_by INTEGER,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
      FOREIGN KEY (marked_by) REFERENCES users(id) ON DELETE SET NULL,
      UNIQUE(member_id, date)
    );

    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER NOT NULL,
      department_id INTEGER NOT NULL,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      working_days INTEGER DEFAULT 0,
      casual_leave INTEGER DEFAULT 0,
      festive_leave INTEGER DEFAULT 0,
      national_holiday INTEGER DEFAULT 0,
      absent INTEGER DEFAULT 0,
      overtime_hours REAL DEFAULT 0,
      marked_by INTEGER,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
      FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE,
      FOREIGN KEY (marked_by) REFERENCES users(id) ON DELETE SET NULL,
      UNIQUE(member_id, year, month)
    );
  `);

  // Run dynamic migrations for existing database file safely
  try { db.exec("ALTER TABLE members ADD COLUMN cl_quota INTEGER DEFAULT 12;"); } catch(e){}
  try { db.exec("ALTER TABLE members ADD COLUMN fl_quota INTEGER DEFAULT 10;"); } catch(e){}
  try { db.exec("ALTER TABLE members ADD COLUMN nh_quota INTEGER DEFAULT 8;"); } catch(e){}
  try { db.exec("ALTER TABLE members ADD COLUMN week_off TEXT DEFAULT 'Sunday';"); } catch(e){}

  // Migrate daily_attendance status check constraint to support 'WO'
  try {
    const tableSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='daily_attendance'").get();
    if (tableSql && !tableSql.sql.includes("'WO'")) {
      console.log('🔄 Migrating daily_attendance table to support WO (Week Off) status...');
      db.transaction(() => {
        db.exec("ALTER TABLE daily_attendance RENAME TO daily_attendance_old;");
        db.exec(`
          CREATE TABLE daily_attendance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            member_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            status TEXT CHECK(status IN ('P', 'A', 'CL', 'FL', 'NH', 'WO', 'none')) DEFAULT 'none',
            overtime_hours REAL DEFAULT 0,
            marked_by INTEGER,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
            FOREIGN KEY (marked_by) REFERENCES users(id) ON DELETE SET NULL,
            UNIQUE(member_id, date)
          );
        `);
        db.exec(`
          INSERT INTO daily_attendance (id, member_id, date, status, overtime_hours, marked_by, updated_at)
          SELECT id, member_id, date, status, overtime_hours, marked_by, updated_at FROM daily_attendance_old;
        `);
        db.exec("DROP TABLE daily_attendance_old;");
      })();
      console.log('✅ daily_attendance table migration complete!');
    }
  } catch(err) {
    console.error('⚠️ Failed to migrate daily_attendance table:', err);
  }

  // Seed default admin user if not exists
  const adminExists = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
  if (!adminExists) {
    const hash = bcrypt.hashSync('rcs@admin2024', 12);
    db.prepare(`
      INSERT INTO users (username, password_hash, role, full_name)
      VALUES (?, ?, 'admin', 'System Administrator')
    `).run('admin', hash);
    console.log('✅ Default admin user created (admin / rcs@admin2024)');
  }

  console.log('✅ Database initialized successfully');
  return db;
}

module.exports = { initDatabase, DB_PATH };
