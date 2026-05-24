// ── Supervisor Dashboard Logic ──

let members = [];
let attendanceRecords = [];
let editingMemberId = null;
let currentUser = null;

// Modal daily state tracking
let modalState = {
  memberId: null,
  clQuota: 12,
  flQuota: 10,
  nhQuota: 8,
  ytdAvailedExcludingCurrentMonth: { cl: 0, fl: 0, nh: 0 },
  days: [] // Array of { date, status, overtime_hours }
};

// ── Auth Check ──
(async () => {
  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) throw new Error();
    const data = await res.json();
    if (data.user.role !== 'supervisor') { window.location.href = '/'; return; }
    currentUser = data.user;
    document.getElementById('userName').textContent = data.user.full_name;
    document.getElementById('userAvatar').textContent = data.user.full_name.charAt(0).toUpperCase();
    document.getElementById('userDept').textContent = data.user.department_name || 'No department';
    document.getElementById('deptLabel').textContent = data.user.department_code ? `Dept ${data.user.department_code}` : 'Supervisor';
    document.getElementById('statDeptName').textContent = data.user.department_code || '—';

    if (!data.user.department_id) {
      showToast('No department assigned. Contact admin.', 'warning');
    }

    initFilters();
    loadMembers();
    
    // Automatically load monthly params and card grid
    loadDeptConfig();
    loadAttendance();
  } catch (err) { console.error(err); window.location.href = '/'; }
})();

// ── Navigation ──
document.querySelectorAll('.nav-item[data-tab]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.tab-content').forEach(t => t.classList.add('hidden'));
    document.getElementById('tab-' + btn.dataset.tab).classList.remove('hidden');
  });
});

// ── Logout ──
document.getElementById('logoutBtn').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/';
});

// ── Toast ──
function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${icons[type] || ''}</span> <span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => { toast.classList.add('toast-exit'); setTimeout(() => toast.remove(), 300); }, 3000);
}

// ── Modal Helpers ──
function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
window.closeModal = function(id) { document.getElementById(id).classList.add('hidden'); };

// ── MEMBERS ──
async function loadMembers() {
  try {
    const res = await fetch('/api/supervisor/members');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    members = data.members || [];
    renderMembers();
    document.getElementById('statMembers').textContent = members.filter(m => m.is_active).length;
  } catch (err) { showToast(err.message || 'Failed to load members', 'error'); }
}

function renderMembers() {
  const tbody = document.getElementById('memberTableBody');
  if (members.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state"><div class="empty-icon">👥</div><h3>No members yet</h3><p>Add members manually or import from Excel</p></td></tr>';
    return;
  }
  tbody.innerHTML = members.map((m, i) => `
    <tr style="${!m.is_active ? 'opacity:0.5' : ''}">
      <td>${i + 1}</td>
      <td style="color:var(--text-primary);font-weight:500">${m.employee_id}</td>
      <td style="color:var(--text-primary)">${m.name}</td>
      <td>${m.designation || '—'}</td>
      <td>${m.phone || '—'}</td>
      <td>${m.is_active ? '<span class="badge badge-success">Active</span>' : '<span class="badge badge-danger">Inactive</span>'}</td>
      <td>
        <div class="action-btns">
          <button class="action-btn edit" onclick="editMember(${m.id})" title="Edit">✏️</button>
          ${m.is_active ? `<button class="action-btn delete" onclick="deactivateMember(${m.id}, '${m.name}')" title="Deactivate">🗑️</button>` : ''}
        </div>
      </td>
    </tr>
  `).join('');
}

document.getElementById('addMemberBtn').addEventListener('click', () => {
  editingMemberId = null;
  document.getElementById('memberModalTitle').textContent = 'Add Member';
  document.getElementById('memEmpId').value = '';
  document.getElementById('memEmpId').disabled = false;
  document.getElementById('memName').value = '';
  document.getElementById('memDesignation').value = '';
  document.getElementById('memPhone').value = '';
  document.getElementById('memClQuota').value = 12;
  document.getElementById('memFlQuota').value = 10;
  document.getElementById('memNhQuota').value = 8;
  document.getElementById('memWeekOff').value = 'Sunday';
  openModal('memberModal');
});

window.editMember = function(id) {
  const m = members.find(x => x.id === id);
  if (!m) return;
  editingMemberId = id;
  document.getElementById('memberModalTitle').textContent = 'Edit Member';
  document.getElementById('memEmpId').value = m.employee_id;
  document.getElementById('memEmpId').disabled = true;
  document.getElementById('memName').value = m.name;
  document.getElementById('memDesignation').value = m.designation || '';
  document.getElementById('memPhone').value = m.phone || '';
  document.getElementById('memClQuota').value = m.cl_quota !== undefined ? m.cl_quota : 12;
  document.getElementById('memFlQuota').value = m.fl_quota !== undefined ? m.fl_quota : 10;
  document.getElementById('memNhQuota').value = m.nh_quota !== undefined ? m.nh_quota : 8;
  document.getElementById('memWeekOff').value = m.week_off || 'Sunday';
  openModal('memberModal');
};

document.getElementById('memberSaveBtn').addEventListener('click', async () => {
  const employee_id = document.getElementById('memEmpId').value.trim();
  const name = document.getElementById('memName').value.trim();
  const designation = document.getElementById('memDesignation').value.trim();
  const phone = document.getElementById('memPhone').value.trim();
  const cl_quota = parseInt(document.getElementById('memClQuota').value) || 12;
  const fl_quota = parseInt(document.getElementById('memFlQuota').value) || 10;
  const nh_quota = parseInt(document.getElementById('memNhQuota').value) || 8;
  const week_off = document.getElementById('memWeekOff').value || 'Sunday';

  if (!employee_id || !name) return showToast('Employee ID and name are required', 'warning');

  try {
    const url = editingMemberId ? `/api/supervisor/members/${editingMemberId}` : '/api/supervisor/members';
    const method = editingMemberId ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employee_id, name, designation, phone, cl_quota, fl_quota, nh_quota, week_off })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showToast(data.message);
    closeModal('memberModal');
    loadMembers();
    loadAttendance(); // Reload grid card in case quotas changed
  } catch (err) { showToast(err.message, 'error'); }
});

window.deactivateMember = async function(id, name) {
  if (!confirm(`Deactivate member "${name}"?`)) return;
  try {
    const res = await fetch(`/api/supervisor/members/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showToast(data.message);
    loadMembers();
    loadAttendance();
  } catch (err) { showToast(err.message, 'error'); }
};

// ── IMPORT EXCEL ──
const uploadZone = document.getElementById('uploadZone');
const fileInput = document.getElementById('fileInput');

document.getElementById('importBtn').addEventListener('click', () => {
  document.getElementById('uploadStatus').classList.add('hidden');
  openModal('importModal');
});

uploadZone.addEventListener('click', () => fileInput.click());
uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
uploadZone.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadZone.classList.remove('drag-over');
  if (e.dataTransfer.files.length > 0) uploadFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', () => { if (fileInput.files.length > 0) uploadFile(fileInput.files[0]); });

async function uploadFile(file) {
  const statusEl = document.getElementById('uploadStatus');
  statusEl.classList.remove('hidden');
  statusEl.innerHTML = '<span class="spinner"></span> Importing...';

  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await fetch('/api/supervisor/members/import', { method: 'POST', body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    statusEl.innerHTML = `<span style="color:var(--success)">✅ ${data.message}</span>`;
    showToast(data.message);
    loadMembers();
    loadAttendance();
  } catch (err) {
    statusEl.innerHTML = `<span style="color:var(--danger)">❌ ${err.message}</span>`;
    showToast(err.message, 'error');
  }
  fileInput.value = '';
}

// ── ATTENDANCE TAB STATE & LOGIC ──
function initFilters() {
  const monthSel = document.getElementById('attMonth');
  const yearSel = document.getElementById('attYear');
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const now = new Date();
  monthSel.innerHTML = months.map((m, i) => `<option value="${i + 1}" ${i === now.getMonth() ? 'selected' : ''}>${m}</option>`).join('');
  const currentYear = now.getFullYear();
  yearSel.innerHTML = '';
  for (let y = currentYear; y >= currentYear - 2; y--) {
    yearSel.innerHTML += `<option value="${y}" ${y === currentYear ? 'selected' : ''}>${y}</option>`;
  }

  // Hook up automatic loading when month/year filters change
  monthSel.addEventListener('change', () => { loadDeptConfig(); loadAttendance(); });
  yearSel.addEventListener('change', () => { loadDeptConfig(); loadAttendance(); });
}

document.getElementById('attLoadBtn').addEventListener('click', () => {
  loadDeptConfig();
  loadAttendance();
});

// ── DEPARTMENT MONTHLY PARAMETERS ──
async function loadDeptConfig() {
  const month = document.getElementById('attMonth').value;
  const year = document.getElementById('attYear').value;
  try {
    const res = await fetch(`/api/supervisor/dept-config?month=${month}&year=${year}`);
    const data = await res.json();
    if (res.ok && data.config) {
      document.getElementById('deptWorkingDays').value = data.config.working_days || 0;
      document.getElementById('deptNH').value = data.config.national_holidays || 0;
      document.getElementById('deptFL').value = data.config.festive_leaves || 0;
    } else {
      document.getElementById('deptWorkingDays').value = 0;
      document.getElementById('deptNH').value = 0;
      document.getElementById('deptFL').value = 0;
    }
  } catch (err) {
    console.error('Failed to load dept config', err);
  }
}

document.getElementById('saveDeptConfigBtn').addEventListener('click', async () => {
  const month = document.getElementById('attMonth').value;
  const year = document.getElementById('attYear').value;
  const working_days = parseInt(document.getElementById('deptWorkingDays').value) || 0;
  const national_holidays = parseInt(document.getElementById('deptNH').value) || 0;
  const festive_leaves = parseInt(document.getElementById('deptFL').value) || 0;

  try {
    const res = await fetch('/api/supervisor/dept-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month, year, working_days, national_holidays, festive_leaves })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showToast(data.message);
  } catch (err) {
    showToast(err.message || 'Failed to save parameters', 'error');
  }
});

// ── LOAD ATTENDANCE & RENDERING CARDS ──
async function loadAttendance() {
  const month = document.getElementById('attMonth').value;
  const year = document.getElementById('attYear').value;
  const grid = document.getElementById('employeeCardsGrid');
  grid.innerHTML = `
    <div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: var(--text-secondary);">
      <span class="spinner"></span> Loading cards...
    </div>
  `;

  try {
    const res = await fetch(`/api/supervisor/attendance?month=${month}&year=${year}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    attendanceRecords = data.records || [];
    renderEmployeeCards();
  } catch (err) {
    showToast(err.message || 'Failed to load attendance cards', 'error');
  }
}

function renderEmployeeCards() {
  const grid = document.getElementById('employeeCardsGrid');
  const searchVal = document.getElementById('attSearchInput').value.trim().toLowerCase();

  const filtered = attendanceRecords.filter(r => 
    r.name.toLowerCase().includes(searchVal) || 
    r.employee_id.toLowerCase().includes(searchVal)
  );

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: var(--text-muted);">
        <div style="font-size: 3rem; margin-bottom: 1rem;">🔍</div>
        <h3>No matching employees</h3>
        <p>Try refining your search terms</p>
      </div>
    `;
    return;
  }

  const todayStr = new Date().toLocaleDateString('en-CA');

  grid.innerHTML = filtered.map(r => {
    const totalDays = r.working_days + r.casual_leave + r.festive_leave + r.national_holiday + r.absent;
    const clLeft = Math.max(0, (r.cl_quota || 12) - (r.availed_cl_ytd || 0));
    const flLeft = Math.max(0, (r.fl_quota || 10) - (r.availed_fl_ytd || 0));
    const nhLeft = Math.max(0, (r.nh_quota || 8) - (r.availed_nh_ytd || 0));

    return `
      <div class="employee-card" onclick="openDailyCalendar(${r.member_id})">
        <div>
          <div class="employee-card-header">
            <div class="employee-card-title">
              <h4>${r.name}</h4>
              <p>${r.designation || 'Operator'}</p>
            </div>
            <span class="badge badge-info" style="font-family: monospace;">${r.employee_id}</span>
          </div>
          
          <div style="font-size: 0.8rem; color: var(--text-secondary); margin: 0.5rem 0;">
            Month Summary: <strong>P: ${r.working_days} | A: ${r.absent} | OT: ${r.overtime_hours} hrs</strong>
          </div>

          <div style="font-size: 0.8rem; color: var(--text-secondary); margin: 0.35rem 0 0.5rem 0; display: flex; align-items: center; gap: 0.35rem;">
            <span>Week Off:</span>
            <span class="badge badge-secondary" style="font-size: 0.7rem; padding: 0.1rem 0.4rem; background: rgba(255,255,255,0.06); border: 1px solid var(--border-glass); color: var(--text-primary); font-weight:600;">${r.week_off || 'Sunday'}</span>
          </div>

          <div class="employee-card-quotas">
            <div class="quota-tag cl" title="Casual Leave Quota Remaining">
              <span>CL Left:</span> <strong>${clLeft}</strong>
            </div>
            <div class="quota-tag fl" title="Festive Leave Quota Remaining">
              <span>FL Left:</span> <strong>${flLeft}</strong>
            </div>
            <div class="quota-tag nh" title="National Holiday Quota Remaining">
              <span>NH Left:</span> <strong>${nhLeft}</strong>
            </div>
          </div>

          <!-- Quick Mark Today's Attendance -->
          <div class="quick-mark-container" onclick="event.stopPropagation()" style="display: flex; gap: 0.5rem; align-items: center; margin-top: 0.85rem; background: rgba(255,255,255,0.03); padding: 0.5rem 0.75rem; border-radius: 8px; border: 1px solid var(--border-glass);">
            <span style="font-size: 0.75rem; font-weight: 600; color: var(--text-secondary); flex-grow: 1;">Quick Today:</span>
            <button class="btn btn-sm quick-mark-btn p-btn ${r.today_status === 'P' ? 'active-present' : ''}" onclick="quickMarkToday(${r.member_id}, 'P')" style="font-size: 0.75rem; font-weight: bold; width: 30px; height: 26px; padding: 0; display: flex; align-items: center; justify-content: center; border-radius: 4px;">P</button>
            <button class="btn btn-sm quick-mark-btn a-btn ${r.today_status === 'A' ? 'active-absent' : ''}" onclick="quickMarkToday(${r.member_id}, 'A')" style="font-size: 0.75rem; font-weight: bold; width: 30px; height: 26px; padding: 0; display: flex; align-items: center; justify-content: center; border-radius: 4px;">A</button>
          </div>
        </div>

        <div style="margin-top: 1rem; border-top: 1px solid var(--border-glass); padding-top: 0.75rem; display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 0.8rem; color: var(--text-muted);">Total Checked: ${totalDays} days</span>
          <button class="btn btn-primary btn-sm" style="padding: 0.35rem 0.75rem; font-size: 0.75rem;">📅 Mark Daily</button>
        </div>
      </div>
    `;
  }).join('');
}

// Hook up search filter input
document.getElementById('attSearchInput').addEventListener('input', renderEmployeeCards);

window.quickMarkToday = async function(memberId, status) {
  const month = document.getElementById('attMonth').value;
  const year = document.getElementById('attYear').value;
  const todayStr = new Date().toLocaleDateString('en-CA');
  
  // Find current record
  const record = attendanceRecords.find(r => r.member_id === memberId);
  const finalStatus = (record && record.today_status === status) ? 'none' : status;
  
  try {
    const res = await fetch('/api/supervisor/attendance/daily', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        member_id: memberId,
        month,
        year,
        days: [{ date: todayStr, status: finalStatus, overtime_hours: 0 }]
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showToast(`Today marked successfully`);
    loadAttendance(); // Refresh grid
  } catch (err) {
    showToast(err.message || 'Failed to mark today\'s attendance', 'error');
  }
};

// ── DAILY DATE-WISE ATTENDANCE CALENDAR MODAL ──
window.openDailyCalendar = async function(memberId) {
  const month = document.getElementById('attMonth').value;
  const year = document.getElementById('attYear').value;
  
  try {
    const res = await fetch(`/api/supervisor/attendance/daily?member_id=${memberId}&month=${month}&year=${year}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    const member = data.member;
    const days = data.days || [];
    const balances = data.leave_balances;

    // Build days in selected month
    const totalDays = new Date(year, month, 0).getDate();
    const dayList = [];
    const monthsNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    // Track total leaves marked in this month's daily records currently
    let currentMonthCL = 0;
    let currentMonthFL = 0;
    let currentMonthNH = 0;

    for (let d = 1; d <= totalDays; d++) {
      const dayStr = String(d).padStart(2, '0');
      const monthStr = String(month).padStart(2, '0');
      const dateStr = `${year}-${monthStr}-${dayStr}`;
      
      const dayRecord = days.find(x => x.date === dateStr);
      const status = dayRecord ? dayRecord.status : 'none';
      const ot = dayRecord ? dayRecord.overtime_hours : 0;

      if (status === 'CL') currentMonthCL++;
      if (status === 'FL') currentMonthFL++;
      if (status === 'NH') currentMonthNH++;

      // Day of week
      const dateObj = new Date(year, month - 1, d);
      const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });

      dayList.push({
        date: dateStr,
        label: `${dayStr} - ${dayName}`,
        status,
        overtime_hours: ot
      });
    }

    // Capture YTD excluding this month's marked records to prevent double counting
    modalState = {
      memberId,
      clQuota: member.cl_quota || 12,
      flQuota: member.fl_quota || 10,
      nhQuota: member.nh_quota || 8,
      ytdAvailedExcludingCurrentMonth: {
        cl: Math.max(0, balances.cl.availed - currentMonthCL),
        fl: Math.max(0, balances.fl.availed - currentMonthFL),
        nh: Math.max(0, balances.nh.availed - currentMonthNH)
      },
      days: dayList
    };

    // Render Modal Header
    document.getElementById('dailyModalEmployeeName').textContent = `Mark Daily Attendance: ${member.name}`;
    document.getElementById('dailyModalEmployeeId').textContent = `ID: ${member.employee_id} | Designation: ${member.designation || 'Operator'}`;
    document.getElementById('dailyModalMonthYear').textContent = `${monthsNames[month - 1]} ${year}`;

    // Render Modal Grid and Balance panel
    renderDailyCalendarGrid();
    recalculateLiveBalances();
    
    openModal('dailyAttendanceModal');
  } catch (err) {
    showToast(err.message || 'Failed to load daily calendar data', 'error');
  }
};

function renderDailyCalendarGrid() {
  const container = document.getElementById('calendarDaysGrid');
  
  container.innerHTML = modalState.days.map((d, index) => {
    return `
      <div class="calendar-day-row" data-index="${index}">
        <span class="calendar-day-label">${d.label}</span>
        <div class="day-btn-group">
          <button type="button" class="day-btn p ${d.status === 'P' ? 'active p' : ''}" onclick="updateDayStatus(${index}, 'P')">P</button>
          <button type="button" class="day-btn a ${d.status === 'A' ? 'active a' : ''}" onclick="updateDayStatus(${index}, 'A')">A</button>
          <button type="button" class="day-btn cl ${d.status === 'CL' ? 'active cl' : ''}" onclick="updateDayStatus(${index}, 'CL')">CL</button>
          <button type="button" class="day-btn fl ${d.status === 'FL' ? 'active fl' : ''}" onclick="updateDayStatus(${index}, 'FL')">FL</button>
          <button type="button" class="day-btn nh ${d.status === 'NH' ? 'active nh' : ''}" onclick="updateDayStatus(${index}, 'NH')">NH</button>
          <button type="button" class="day-btn wo ${d.status === 'WO' ? 'active wo' : ''}" onclick="updateDayStatus(${index}, 'WO')">WO</button>
          <button type="button" class="day-btn none ${d.status === 'none' ? 'active none' : ''}" onclick="updateDayStatus(${index}, 'none')">—</button>
        </div>
        <div style="display: flex; align-items: center; gap: 0.25rem;">
          <span style="font-size: 0.75rem; color: var(--text-muted);">OT:</span>
          <input type="number" class="table-input" style="width: 60px; padding: 0.25rem; font-size: 0.8rem; height: 32px;" 
            value="${d.overtime_hours}" min="0" step="0.5" oninput="updateDayOvertime(${index}, this.value)">
        </div>
      </div>
    `;
  }).join('');
}

window.updateDayStatus = function(index, newStatus) {
  modalState.days[index].status = newStatus;
  
  // Re-render buttons in that row quickly
  const row = document.querySelector(`.calendar-day-row[data-index="${index}"]`);
  if (row) {
    row.querySelectorAll('.day-btn').forEach(btn => {
      btn.className = btn.className.split(' ').filter(c => !['active', 'p', 'a', 'cl', 'fl', 'nh', 'wo', 'none'].includes(c)).join(' ');
      if (btn.classList.contains(newStatus.toLowerCase())) {
        btn.classList.add('active', newStatus.toLowerCase());
      }
    });
  }
  
  recalculateLiveBalances();
};

window.updateDayOvertime = function(index, value) {
  modalState.days[index].overtime_hours = parseFloat(value) || 0;
  recalculateLiveBalances();
};

function recalculateLiveBalances() {
  let clMarkedInMonth = 0;
  let flMarkedInMonth = 0;
  let nhMarkedInMonth = 0;
  let woMarkedInMonth = 0;
  let presentDays = 0;
  let absentDays = 0;
  let totalOT = 0;

  modalState.days.forEach(d => {
    if (d.status === 'P') presentDays++;
    else if (d.status === 'A') absentDays++;
    else if (d.status === 'CL') clMarkedInMonth++;
    else if (d.status === 'FL') flMarkedInMonth++;
    else if (d.status === 'NH') nhMarkedInMonth++;
    else if (d.status === 'WO') woMarkedInMonth++;
    
    totalOT += d.overtime_hours;
  });

  // Calculate annual totals including ytd excluding this month + current month marked
  const totalCL = modalState.ytdAvailedExcludingCurrentMonth.cl + clMarkedInMonth;
  const totalFL = modalState.ytdAvailedExcludingCurrentMonth.fl + flMarkedInMonth;
  const totalNH = modalState.ytdAvailedExcludingCurrentMonth.nh + nhMarkedInMonth;

  const clRemaining = Math.max(0, modalState.clQuota - totalCL);
  const flRemaining = Math.max(0, modalState.flQuota - totalFL);
  const nhRemaining = Math.max(0, modalState.nhQuota - totalNH);

  // Update annual balance displays
  document.getElementById('clQuotaBalance').textContent = `${clRemaining} / ${modalState.clQuota} remaining`;
  document.getElementById('clQuotaProgress').style.width = `${(clRemaining / modalState.clQuota) * 100}%`;
  
  document.getElementById('flQuotaBalance').textContent = `${flRemaining} / ${modalState.flQuota} remaining`;
  document.getElementById('flQuotaProgress').style.width = `${(flRemaining / modalState.flQuota) * 100}%`;
  
  document.getElementById('nhQuotaBalance').textContent = `${nhRemaining} / ${modalState.nhQuota} remaining`;
  document.getElementById('nhQuotaProgress').style.width = `${(nhRemaining / modalState.nhQuota) * 100}%`;

  // Visual feedback if limit exceeded
  const clCard = document.getElementById('clQuotaProgress').closest('.quota-progress-card');
  if (totalCL > modalState.clQuota) {
    clCard.style.borderColor = 'var(--danger)';
    document.getElementById('clQuotaBalance').style.color = 'var(--danger)';
  } else {
    clCard.style.borderColor = 'var(--border-glass)';
    document.getElementById('clQuotaBalance').style.color = 'var(--text-primary)';
  }

  const flCard = document.getElementById('flQuotaProgress').closest('.quota-progress-card');
  if (totalFL > modalState.flQuota) {
    flCard.style.borderColor = 'var(--danger)';
    document.getElementById('flQuotaBalance').style.color = 'var(--danger)';
  } else {
    flCard.style.borderColor = 'var(--border-glass)';
    document.getElementById('flQuotaBalance').style.color = 'var(--text-primary)';
  }

  const nhCard = document.getElementById('nhQuotaProgress').closest('.quota-progress-card');
  if (totalNH > modalState.nhQuota) {
    nhCard.style.borderColor = 'var(--danger)';
    document.getElementById('nhQuotaBalance').style.color = 'var(--danger)';
  } else {
    nhCard.style.borderColor = 'var(--border-glass)';
    document.getElementById('nhQuotaBalance').style.color = 'var(--text-primary)';
  }

  // Update month summary sidebar
  document.getElementById('summaryPresent').textContent = presentDays;
  document.getElementById('summaryAbsent').textContent = absentDays;
  document.getElementById('summaryCL').textContent = clMarkedInMonth;
  document.getElementById('summaryFL').textContent = flMarkedInMonth;
  document.getElementById('summaryNH').textContent = nhMarkedInMonth;
  document.getElementById('summaryWO').textContent = woMarkedInMonth;
  document.getElementById('summaryOT').textContent = `${totalOT.toFixed(1)} hrs`;
}

document.getElementById('saveDailyAttendanceBtn').addEventListener('click', async () => {
  const month = document.getElementById('attMonth').value;
  const year = document.getElementById('attYear').value;
  
  const saveBtn = document.getElementById('saveDailyAttendanceBtn');
  saveBtn.disabled = true;
  saveBtn.innerHTML = '<span class="spinner"></span> Saving...';

  try {
    const res = await fetch('/api/supervisor/attendance/daily', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        member_id: modalState.memberId,
        month: parseInt(month),
        year: parseInt(year),
        days: modalState.days.map(d => ({
          date: d.date,
          status: d.status,
          overtime_hours: d.overtime_hours
        }))
      })
    });
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    showToast('Daily attendance saved successfully');
    closeModal('dailyAttendanceModal');
    loadAttendance(); // Reload grid cards
  } catch (err) {
    showToast(err.message || 'Failed to save daily attendance', 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = '💾 Save Attendance';
  }
});
