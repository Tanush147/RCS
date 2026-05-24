const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const { requireSupervisor } = require('../middleware/auth');
const router = express.Router();

router.use(requireSupervisor);

// Multer config for Excel uploads
const storage = multer.diskStorage({
  destination: path.join(__dirname, '..', 'uploads'),
  filename: (req, file, cb) => cb(null, `import_${Date.now()}_${file.originalname}`)
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// GET /api/supervisor/members
router.get('/members', (req, res) => {
  try {
    const deptId = req.session.user.department_id;
    if (!deptId) return res.status(400).json({ error: 'No department assigned' });
    const members = req.db.prepare(
      'SELECT * FROM members WHERE department_id = ? ORDER BY name'
    ).all(deptId);
    res.json({ members });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

// POST /api/supervisor/members
router.post('/members', (req, res) => {
  try {
    const deptId = req.session.user.department_id;
    if (!deptId) return res.status(400).json({ error: 'No department assigned' });
    const { employee_id, name, designation, phone, cl_quota, fl_quota, nh_quota, week_off } = req.body;
    if (!employee_id || !name) return res.status(400).json({ error: 'Employee ID and name are required' });
    const result = req.db.prepare(
      'INSERT INTO members (employee_id, name, designation, phone, department_id, cl_quota, fl_quota, nh_quota, week_off) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      employee_id.trim(),
      name.trim(),
      (designation || '').trim(),
      (phone || '').trim(),
      deptId,
      cl_quota !== undefined ? parseInt(cl_quota) : 12,
      fl_quota !== undefined ? parseInt(fl_quota) : 10,
      nh_quota !== undefined ? parseInt(nh_quota) : 8,
      (week_off || 'Sunday').trim()
    );
    const member = req.db.prepare('SELECT * FROM members WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ message: 'Member added', member });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Employee ID already exists' });
    res.status(500).json({ error: 'Failed to add member' });
  }
});

// POST /api/supervisor/members/import
router.post('/members/import', upload.single('file'), (req, res) => {
  try {
    const deptId = req.session.user.department_id;
    if (!deptId) return res.status(400).json({ error: 'No department assigned' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const wb = XLSX.readFile(req.file.path);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws);

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    if (rows.length === 0) return res.status(400).json({ error: 'Excel file is empty' });

    const insert = req.db.prepare(
      'INSERT OR IGNORE INTO members (employee_id, name, designation, phone, department_id, cl_quota, fl_quota, nh_quota, week_off) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );

    let imported = 0, skipped = 0;
    const insertMany = req.db.transaction((rows) => {
      for (const row of rows) {
        const empId = row['Employee ID'] || row['employee_id'] || row['EmpID'] || row['ID'] || '';
        const name = row['Name'] || row['name'] || row['Employee Name'] || '';
        const designation = row['Designation'] || row['designation'] || row['Position'] || '';
        const phone = row['Phone'] || row['phone'] || row['Contact'] || row['Mobile'] || '';
        const cl = row['CL Quota'] || row['cl_quota'] || 12;
        const fl = row['FL Quota'] || row['fl_quota'] || 10;
        const nh = row['NH Quota'] || row['nh_quota'] || 8;
        const weekOff = row['Week Off'] || row['week_off'] || row['Weekly Off'] || 'Sunday';
        if (!empId || !name) { skipped++; continue; }
        const result = insert.run(
          String(empId).trim(),
          String(name).trim(),
          String(designation).trim(),
          String(phone).trim(),
          deptId,
          parseInt(cl) || 12,
          parseInt(fl) || 10,
          parseInt(nh) || 8,
          String(weekOff).trim()
        );
        if (result.changes > 0) imported++; else skipped++;
      }
    });
    insertMany(rows);
    res.json({ message: `Imported ${imported} members, ${skipped} skipped (duplicates or invalid)`, imported, skipped });
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    console.error('Import error:', err);
    res.status(500).json({ error: 'Failed to import members' });
  }
});

// PUT /api/supervisor/members/:id
router.put('/members/:id', (req, res) => {
  try {
    const deptId = req.session.user.department_id;
    const { id } = req.params;
    const member = req.db.prepare('SELECT * FROM members WHERE id = ? AND department_id = ?').get(id, deptId);
    if (!member) return res.status(404).json({ error: 'Member not found' });
    const { name, designation, phone, cl_quota, fl_quota, nh_quota, week_off, is_active } = req.body;
    req.db.prepare(
      'UPDATE members SET name = ?, designation = ?, phone = ?, cl_quota = ?, fl_quota = ?, nh_quota = ?, week_off = ?, is_active = ? WHERE id = ?'
    ).run(
      name || member.name,
      designation !== undefined ? designation : member.designation,
      phone !== undefined ? phone : member.phone,
      cl_quota !== undefined ? parseInt(cl_quota) : member.cl_quota,
      fl_quota !== undefined ? parseInt(fl_quota) : member.fl_quota,
      nh_quota !== undefined ? parseInt(nh_quota) : member.nh_quota,
      week_off !== undefined ? week_off : member.week_off,
      is_active !== undefined ? (is_active ? 1 : 0) : member.is_active,
      id
    );
    const updated = req.db.prepare('SELECT * FROM members WHERE id = ?').get(id);
    res.json({ message: 'Member updated', member: updated });
  } catch (err) {
    console.error('Update member error:', err);
    res.status(500).json({ error: 'Failed to update member' });
  }
});

// DELETE /api/supervisor/members/:id
router.delete('/members/:id', (req, res) => {
  try {
    const deptId = req.session.user.department_id;
    const { id } = req.params;
    const member = req.db.prepare('SELECT * FROM members WHERE id = ? AND department_id = ?').get(id, deptId);
    if (!member) return res.status(404).json({ error: 'Member not found' });
    req.db.prepare('UPDATE members SET is_active = 0 WHERE id = ?').run(id);
    res.json({ message: 'Member deactivated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to deactivate member' });
  }
});
// GET /api/supervisor/attendance
router.get('/attendance', (req, res) => {
  try {
    const deptId = req.session.user.department_id;
    if (!deptId) return res.status(400).json({ error: 'No department assigned' });
    const { month, year, today } = req.query;
    if (!month || !year) return res.status(400).json({ error: 'Month and year are required' });
    
    const todayStr = today || new Date().toLocaleDateString('en-CA');
    const yearPattern = `${year}-%`;
    const records = req.db.prepare(`
      SELECT m.id as member_id, m.employee_id, m.name, m.designation,
        m.cl_quota, m.fl_quota, m.nh_quota, m.week_off,
        COALESCE(a.working_days, 0) as working_days, COALESCE(a.casual_leave, 0) as casual_leave,
        COALESCE(a.festive_leave, 0) as festive_leave, COALESCE(a.national_holiday, 0) as national_holiday,
        COALESCE(a.absent, 0) as absent, COALESCE(a.overtime_hours, 0) as overtime_hours,
        a.id as attendance_id,
        (SELECT COUNT(*) FROM daily_attendance WHERE member_id = m.id AND status = 'CL' AND date LIKE ?) as availed_cl_ytd,
        (SELECT COUNT(*) FROM daily_attendance WHERE member_id = m.id AND status = 'FL' AND date LIKE ?) as availed_fl_ytd,
        (SELECT COUNT(*) FROM daily_attendance WHERE member_id = m.id AND status = 'NH' AND date LIKE ?) as availed_nh_ytd,
        (SELECT status FROM daily_attendance WHERE member_id = m.id AND date = ?) as today_status
      FROM members m
      LEFT JOIN attendance a ON a.member_id = m.id AND a.year = ? AND a.month = ?
      WHERE m.department_id = ? AND m.is_active = 1
      ORDER BY m.name
    `).all(yearPattern, yearPattern, yearPattern, todayStr, parseInt(year), parseInt(month), deptId);
    res.json({ records });
  } catch (err) {
    console.error('Fetch attendance error:', err);
    res.status(500).json({ error: 'Failed to fetch attendance' });
  }
});

// GET /api/supervisor/dept-config
router.get('/dept-config', (req, res) => {
  try {
    const deptId = req.session.user.department_id;
    if (!deptId) return res.status(400).json({ error: 'No department assigned' });
    const { month, year } = req.query;
    if (!month || !year) return res.status(400).json({ error: 'Month and year are required' });
    
    let config = req.db.prepare(
      'SELECT working_days, national_holidays, festive_leaves FROM department_monthly_config WHERE department_id = ? AND year = ? AND month = ?'
    ).get(deptId, parseInt(year), parseInt(month));
    
    if (!config) {
      config = { working_days: 0, national_holidays: 0, festive_leaves: 0 };
    }
    res.json({ config });
  } catch (err) {
    console.error('Fetch dept config error:', err);
    res.status(500).json({ error: 'Failed to fetch department parameters' });
  }
});

// POST /api/supervisor/dept-config
router.post('/dept-config', (req, res) => {
  try {
    const deptId = req.session.user.department_id;
    if (!deptId) return res.status(400).json({ error: 'No department assigned' });
    const { month, year, working_days, national_holidays, festive_leaves } = req.body;
    if (!month || !year) return res.status(400).json({ error: 'Month and year are required' });
    
    req.db.prepare(`
      INSERT INTO department_monthly_config (department_id, year, month, working_days, national_holidays, festive_leaves)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(department_id, year, month) DO UPDATE SET
        working_days = excluded.working_days,
        national_holidays = excluded.national_holidays,
        festive_leaves = excluded.festive_leaves
    `).run(
      deptId,
      parseInt(year),
      parseInt(month),
      parseInt(working_days) || 0,
      parseInt(national_holidays) || 0,
      parseInt(festive_leaves) || 0
    );
    
    res.json({ message: 'Department monthly parameters updated' });
  } catch (err) {
    console.error('Save dept config error:', err);
    res.status(500).json({ error: 'Failed to save department parameters' });
  }
});

// GET /api/supervisor/attendance/daily
router.get('/attendance/daily', (req, res) => {
  try {
    const deptId = req.session.user.department_id;
    if (!deptId) return res.status(400).json({ error: 'No department assigned' });
    const { member_id, month, year } = req.query;
    if (!member_id || !month || !year) return res.status(400).json({ error: 'Member ID, month, and year are required' });
    
    const member = req.db.prepare('SELECT * FROM members WHERE id = ? AND department_id = ?').get(parseInt(member_id), deptId);
    if (!member) return res.status(404).json({ error: 'Member not found' });
    
    // Fetch daily records for this month
    const monthStr = String(month).padStart(2, '0');
    const yearStr = String(year);
    const likePattern = `${yearStr}-${monthStr}-%`;
    const days = req.db.prepare(
      "SELECT date, status, overtime_hours FROM daily_attendance WHERE member_id = ? AND date LIKE ?"
    ).all(member.id, likePattern);
    
    // Fetch annual leave balances for the selected year
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
    console.error('Fetch daily attendance error:', err);
    res.status(500).json({ error: 'Failed to fetch daily attendance' });
  }
});

// POST /api/supervisor/attendance/daily
router.post('/attendance/daily', (req, res) => {
  try {
    const deptId = req.session.user.department_id;
    const userId = req.session.user.id;
    if (!deptId) return res.status(400).json({ error: 'No department assigned' });
    const { member_id, month, year, days } = req.body;
    if (!member_id || !month || !year || !days || !Array.isArray(days)) {
      return res.status(400).json({ error: 'Member ID, month, year, and days array are required' });
    }
    
    const upsertDaily = req.db.prepare(`
      INSERT INTO daily_attendance (member_id, date, status, overtime_hours, marked_by, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(member_id, date) DO UPDATE SET
        status = excluded.status,
        overtime_hours = excluded.overtime_hours,
        marked_by = excluded.marked_by,
        updated_at = CURRENT_TIMESTAMP
    `);
    
    const transaction = req.db.transaction((daysList) => {
      for (const d of daysList) {
        upsertDaily.run(parseInt(member_id), d.date, d.status, parseFloat(d.overtime_hours) || 0, userId);
      }
      
      // Calculate and save totals to attendance summary table for backward compatibility
      const monthStr = String(month).padStart(2, '0');
      const yearStr = String(year);
      const likePattern = `${yearStr}-${monthStr}-%`;
      
      const stats = req.db.prepare(`
        SELECT 
          COUNT(CASE WHEN status = 'P' THEN 1 END) as working_days,
          COUNT(CASE WHEN status = 'CL' THEN 1 END) as cl,
          COUNT(CASE WHEN status = 'FL' THEN 1 END) as fl,
          COUNT(CASE WHEN status = 'NH' THEN 1 END) as nh,
          COUNT(CASE WHEN status = 'A' THEN 1 END) as absent,
          SUM(overtime_hours) as overtime_hours
        FROM daily_attendance
        WHERE member_id = ? AND date LIKE ?
      `).get(parseInt(member_id), likePattern);
      
      req.db.prepare(`
        INSERT INTO attendance (member_id, department_id, year, month, working_days, casual_leave, festive_leave, national_holiday, absent, overtime_hours, marked_by, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(member_id, year, month) DO UPDATE SET
          working_days = excluded.working_days,
          casual_leave = excluded.casual_leave,
          festive_leave = excluded.festive_leave,
          national_holiday = excluded.national_holiday,
          absent = excluded.absent,
          overtime_hours = excluded.overtime_hours,
          marked_by = excluded.marked_by,
          updated_at = CURRENT_TIMESTAMP
      `).run(
        parseInt(member_id),
        deptId,
        parseInt(year),
        parseInt(month),
        stats.working_days || 0,
        stats.cl || 0,
        stats.fl || 0,
        stats.nh || 0,
        stats.absent || 0,
        stats.overtime_hours || 0,
        userId
      );
    });
    
    transaction(days);
    res.json({ message: 'Daily attendance and summary synced successfully' });
  } catch (err) {
    console.error('Save daily attendance error:', err);
    res.status(500).json({ error: 'Failed to save daily attendance' });
  }
});

module.exports = router;
