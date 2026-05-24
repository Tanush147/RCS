const express = require('express');
const bcrypt = require('bcrypt');
const XLSX = require('xlsx');
const { requireAdmin } = require('../middleware/auth');
const router = express.Router();

router.use(requireAdmin);

// GET /api/admin/departments
router.get('/departments', (req, res) => {
  try {
    const departments = req.db.prepare(`
      SELECT d.*, u.full_name as supervisor_name, u.username as supervisor_username, u.id as supervisor_id,
        (SELECT COUNT(*) FROM members m WHERE m.department_id = d.id AND m.is_active = 1) as member_count
      FROM departments d
      LEFT JOIN users u ON u.department_id = d.id AND u.role = 'supervisor'
      ORDER BY d.code
    `).all();
    res.json({ departments });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to fetch departments' }); }
});

// POST /api/admin/departments
router.post('/departments', (req, res) => {
  try {
    const { name, code } = req.body;
    if (!name || !code) return res.status(400).json({ error: 'Name and code are required' });
    const result = req.db.prepare('INSERT INTO departments (name, code) VALUES (?, ?)').run(name.trim(), code.trim().toUpperCase());
    const department = req.db.prepare('SELECT * FROM departments WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ message: 'Department created', department });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Department name or code already exists' });
    res.status(500).json({ error: 'Failed to create department' });
  }
});

// PUT /api/admin/departments/:id
router.put('/departments/:id', (req, res) => {
  try {
    const { name, code } = req.body;
    if (!name || !code) return res.status(400).json({ error: 'Name and code are required' });
    const exists = req.db.prepare('SELECT id FROM departments WHERE id = ?').get(req.params.id);
    if (!exists) return res.status(404).json({ error: 'Department not found' });
    req.db.prepare('UPDATE departments SET name = ?, code = ? WHERE id = ?').run(name.trim(), code.trim().toUpperCase(), req.params.id);
    const department = req.db.prepare('SELECT * FROM departments WHERE id = ?').get(req.params.id);
    res.json({ message: 'Department updated', department });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Department name or code already exists' });
    res.status(500).json({ error: 'Failed to update department' });
  }
});

// DELETE /api/admin/departments/:id
router.delete('/departments/:id', (req, res) => {
  try {
    const exists = req.db.prepare('SELECT id FROM departments WHERE id = ?').get(req.params.id);
    if (!exists) return res.status(404).json({ error: 'Department not found' });
    req.db.prepare('UPDATE users SET department_id = NULL WHERE department_id = ? AND role = ?').run(req.params.id, 'supervisor');
    req.db.prepare('DELETE FROM departments WHERE id = ?').run(req.params.id);
    res.json({ message: 'Department deleted' });
  } catch (err) { res.status(500).json({ error: 'Failed to delete department' }); }
});

// GET /api/admin/supervisors
router.get('/supervisors', (req, res) => {
  try {
    const supervisors = req.db.prepare(`
      SELECT u.id, u.username, u.full_name, u.department_id, u.created_at,
        d.name as department_name, d.code as department_code
      FROM users u LEFT JOIN departments d ON u.department_id = d.id
      WHERE u.role = 'supervisor' ORDER BY u.full_name
    `).all();
    res.json({ supervisors });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch supervisors' }); }
});

// POST /api/admin/supervisors
router.post('/supervisors', async (req, res) => {
  try {
    const { username, password, full_name, department_id } = req.body;
    if (!username || !password || !full_name) return res.status(400).json({ error: 'Username, password, and full name are required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    if (department_id) {
      const existing = req.db.prepare('SELECT id, full_name FROM users WHERE department_id = ? AND role = ?').get(department_id, 'supervisor');
      if (existing) return res.status(409).json({ error: `Department already assigned to ${existing.full_name}` });
    }
    const hash = await bcrypt.hash(password, 12);
    const result = req.db.prepare('INSERT INTO users (username, password_hash, role, full_name, department_id) VALUES (?, ?, ?, ?, ?)').run(username.trim(), hash, 'supervisor', full_name.trim(), department_id || null);
    const supervisor = req.db.prepare(`SELECT u.id, u.username, u.full_name, u.department_id, u.created_at, d.name as department_name, d.code as department_code FROM users u LEFT JOIN departments d ON u.department_id = d.id WHERE u.id = ?`).get(result.lastInsertRowid);
    res.status(201).json({ message: 'Supervisor created', supervisor });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Username already exists' });
    res.status(500).json({ error: 'Failed to create supervisor' });
  }
});

// PUT /api/admin/supervisors/:id
router.put('/supervisors/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { full_name, department_id, password } = req.body;
    const exists = req.db.prepare('SELECT id FROM users WHERE id = ? AND role = ?').get(id, 'supervisor');
    if (!exists) return res.status(404).json({ error: 'Supervisor not found' });
    if (department_id) {
      const existing = req.db.prepare('SELECT id, full_name FROM users WHERE department_id = ? AND role = ? AND id != ?').get(department_id, 'supervisor', id);
      if (existing) return res.status(409).json({ error: `Department already assigned to ${existing.full_name}` });
    }
    if (password && password.length > 0) {
      const hash = await bcrypt.hash(password, 12);
      req.db.prepare('UPDATE users SET full_name = ?, department_id = ?, password_hash = ? WHERE id = ?').run(full_name.trim(), department_id || null, hash, id);
    } else {
      req.db.prepare('UPDATE users SET full_name = ?, department_id = ? WHERE id = ?').run(full_name.trim(), department_id || null, id);
    }
    const supervisor = req.db.prepare(`SELECT u.id, u.username, u.full_name, u.department_id, u.created_at, d.name as department_name, d.code as department_code FROM users u LEFT JOIN departments d ON u.department_id = d.id WHERE u.id = ?`).get(id);
    res.json({ message: 'Supervisor updated', supervisor });
  } catch (err) { res.status(500).json({ error: 'Failed to update supervisor' }); }
});

// DELETE /api/admin/supervisors/:id
router.delete('/supervisors/:id', (req, res) => {
  try {
    const exists = req.db.prepare('SELECT id FROM users WHERE id = ? AND role = ?').get(req.params.id, 'supervisor');
    if (!exists) return res.status(404).json({ error: 'Supervisor not found' });
    req.db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
    res.json({ message: 'Supervisor deleted' });
  } catch (err) { res.status(500).json({ error: 'Failed to delete supervisor' }); }
});

// GET /api/admin/mastersheet
router.get('/mastersheet', (req, res) => {
  try {
    const { dept, month, year } = req.query;
    if (!month || !year) return res.status(400).json({ error: 'Month and year are required' });
    let query = `SELECT m.employee_id, m.name, m.designation, d.name as department_name, d.code as department_code,
      COALESCE(a.working_days, 0) as working_days, COALESCE(a.casual_leave, 0) as casual_leave,
      COALESCE(a.festive_leave, 0) as festive_leave, COALESCE(a.national_holiday, 0) as national_holiday,
      COALESCE(a.absent, 0) as absent, COALESCE(a.overtime_hours, 0) as overtime_hours,
      (COALESCE(a.working_days, 0) + COALESCE(a.casual_leave, 0) + COALESCE(a.festive_leave, 0) + COALESCE(a.national_holiday, 0) + COALESCE(a.absent, 0)) as total_days
      FROM members m JOIN departments d ON m.department_id = d.id
      LEFT JOIN attendance a ON a.member_id = m.id AND a.year = ? AND a.month = ?
      WHERE m.is_active = 1`;
    const params = [parseInt(year), parseInt(month)];
    if (dept && dept !== 'all') { query += ' AND d.id = ?'; params.push(parseInt(dept)); }
    query += ' ORDER BY d.code, m.name';
    const records = req.db.prepare(query).all(...params);
    res.json({ records });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to fetch master sheet' }); }
});

// GET /api/admin/mastersheet/export
router.get('/mastersheet/export', (req, res) => {
  try {
    const { dept, month, year } = req.query;
    if (!month || !year) return res.status(400).json({ error: 'Month and year are required' });
    let query = `SELECT m.employee_id as "Employee ID", m.name as "Name", m.designation as "Designation", d.name as "Department",
      COALESCE(a.working_days, 0) as "Working Days", COALESCE(a.casual_leave, 0) as "Casual Leave",
      COALESCE(a.festive_leave, 0) as "Festive Leave", COALESCE(a.national_holiday, 0) as "National Holiday",
      COALESCE(a.absent, 0) as "Absent",
      (COALESCE(a.working_days, 0) + COALESCE(a.casual_leave, 0) + COALESCE(a.festive_leave, 0) + COALESCE(a.national_holiday, 0) + COALESCE(a.absent, 0)) as "Total Days",
      COALESCE(a.overtime_hours, 0) as "Overtime Hours"
      FROM members m JOIN departments d ON m.department_id = d.id
      LEFT JOIN attendance a ON a.member_id = m.id AND a.year = ? AND a.month = ?
      WHERE m.is_active = 1`;
    const params = [parseInt(year), parseInt(month)];
    if (dept && dept !== 'all') { query += ' AND d.id = ?'; params.push(parseInt(dept)); }
    query += ' ORDER BY d.code, m.name';
    const records = req.db.prepare(query).all(...params);
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(records);
    ws['!cols'] = [{ wch: 15 }, { wch: 25 }, { wch: 20 }, { wch: 20 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 10 }, { wch: 12 }, { wch: 15 }];
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const sheetName = `${monthNames[parseInt(month) - 1]} ${year}`;
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="RCS_Attendance_${sheetName.replace(' ', '_')}.xlsx"`);
    res.send(buffer);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to export' }); }
});

// GET /api/admin/mastersheet/detail
router.get('/mastersheet/detail', (req, res) => {
  try {
    const { employee_id, month, year } = req.query;
    if (!employee_id || !month || !year) return res.status(400).json({ error: 'Employee ID, month, and year are required' });
    
    const member = req.db.prepare('SELECT m.*, d.name as department_name, d.code as department_code FROM members m JOIN departments d ON m.department_id = d.id WHERE m.employee_id = ?').get(employee_id);
    if (!member) return res.status(404).json({ error: 'Member not found' });
    
    const monthStr = String(month).padStart(2, '0');
    const yearStr = String(year);
    const likePattern = `${yearStr}-${monthStr}-%`;
    const days = req.db.prepare(
      "SELECT date, status, overtime_hours FROM daily_attendance WHERE member_id = ? AND date LIKE ?"
    ).all(member.id, likePattern);
    
    const startOfYear = `${yearStr}-01-01`;
    const endOfYear = `${yearStr}-12-31`;
    const availed = req.db.prepare(`
      SELECT 
        COUNT(CASE WHEN status = 'CL' THEN 1 END) as cl,
        COUNT(CASE WHEN status = 'FL' THEN 1 END) as fl,
        COUNT(CASE WHEN status = 'NH' THEN 1 END) as nh
      FROM daily_attendance 
      WHERE member_id = ? AND date >= ? AND date <= ?
    `).get(member.id, startOfYear, endOfYear);
    
    res.json({
      member,
      days,
      leave_balances: {
        cl: { quota: member.cl_quota, availed: availed.cl, remaining: Math.max(0, member.cl_quota - availed.cl) },
        fl: { quota: member.fl_quota, availed: availed.fl, remaining: Math.max(0, member.fl_quota - availed.fl) },
        nh: { quota: member.nh_quota, availed: availed.nh, remaining: Math.max(0, member.nh_quota - availed.nh) }
      }
    });
  } catch (err) {
    console.error('Fetch admin details error:', err);
    res.status(500).json({ error: 'Failed to fetch details' });
  }
});

module.exports = router;
