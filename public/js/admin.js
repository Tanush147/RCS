// ── Admin Dashboard Logic ──

let departments = [];
let supervisors = [];
let editingDeptId = null;
let editingSupervisorId = null;

// ── Auth Check ──
(async () => {
  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) throw new Error();
    const data = await res.json();
    if (data.user.role !== 'admin') { window.location.href = '/'; return; }
    document.getElementById('userName').textContent = data.user.full_name;
    document.getElementById('userAvatar').textContent = data.user.full_name.charAt(0).toUpperCase();
    loadAll();
  } catch { window.location.href = '/'; }
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

// ── Load All Data ──
async function loadAll() {
  await Promise.all([loadDepartments(), loadSupervisors()]);
  updateStats();
  populateFilters();
}

// ── DEPARTMENTS ──
async function loadDepartments() {
  try {
    const res = await fetch('/api/admin/departments');
    const data = await res.json();
    departments = data.departments || [];
    renderDepartments();
  } catch (err) { showToast('Failed to load departments', 'error'); }
}

function renderDepartments() {
  const tbody = document.getElementById('deptTableBody');
  if (departments.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state"><div class="empty-icon">📁</div><h3>No departments yet</h3><p>Create your first department</p></td></tr>';
    return;
  }
  tbody.innerHTML = departments.map(d => `
    <tr>
      <td><span class="badge badge-info">${d.code}</span></td>
      <td style="color:var(--text-primary);font-weight:500">${d.name}</td>
      <td>${d.supervisor_name ? `<span class="badge badge-success">${d.supervisor_name}</span>` : '<span class="badge badge-warning">Unassigned</span>'}</td>
      <td>${d.member_count}</td>
      <td>
        <div class="action-btns">
          <button class="action-btn edit" onclick="editDept(${d.id})" title="Edit">✏️</button>
          <button class="action-btn delete" onclick="deleteDept(${d.id}, '${d.name}')" title="Delete">🗑️</button>
        </div>
      </td>
    </tr>
  `).join('');
}

document.getElementById('addDeptBtn').addEventListener('click', () => {
  editingDeptId = null;
  document.getElementById('deptModalTitle').textContent = 'Add Department';
  document.getElementById('deptName').value = '';
  document.getElementById('deptCode').value = '';
  openModal('deptModal');
});

window.editDept = function(id) {
  const d = departments.find(x => x.id === id);
  if (!d) return;
  editingDeptId = id;
  document.getElementById('deptModalTitle').textContent = 'Edit Department';
  document.getElementById('deptName').value = d.name;
  document.getElementById('deptCode').value = d.code;
  openModal('deptModal');
};

document.getElementById('deptSaveBtn').addEventListener('click', async () => {
  const name = document.getElementById('deptName').value.trim();
  const code = document.getElementById('deptCode').value.trim();
  if (!name || !code) return showToast('Name and code are required', 'warning');

  try {
    const url = editingDeptId ? `/api/admin/departments/${editingDeptId}` : '/api/admin/departments';
    const method = editingDeptId ? 'PUT' : 'POST';
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, code }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showToast(data.message);
    closeModal('deptModal');
    loadAll();
  } catch (err) { showToast(err.message, 'error'); }
});

window.deleteDept = async function(id, name) {
  if (!confirm(`Delete department "${name}"? This will also remove all its members and attendance data.`)) return;
  try {
    const res = await fetch(`/api/admin/departments/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showToast(data.message);
    loadAll();
  } catch (err) { showToast(err.message, 'error'); }
};

// ── SUPERVISORS ──
async function loadSupervisors() {
  try {
    const res = await fetch('/api/admin/supervisors');
    const data = await res.json();
    supervisors = data.supervisors || [];
    renderSupervisors();
  } catch (err) { showToast('Failed to load supervisors', 'error'); }
}

function renderSupervisors() {
  const tbody = document.getElementById('supTableBody');
  if (supervisors.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-state"><div class="empty-icon">👤</div><h3>No supervisors yet</h3><p>Create your first supervisor</p></td></tr>';
    return;
  }
  tbody.innerHTML = supervisors.map(s => `
    <tr>
      <td style="color:var(--text-primary)">${s.username}</td>
      <td style="font-weight:500;color:var(--text-primary)">${s.full_name}</td>
      <td>${s.department_name ? `<span class="badge badge-info">${s.department_code} — ${s.department_name}</span>` : '<span class="badge badge-warning">Not assigned</span>'}</td>
      <td>
        <div class="action-btns">
          <button class="action-btn edit" onclick="editSupervisor(${s.id})" title="Edit">✏️</button>
          <button class="action-btn delete" onclick="deleteSupervisor(${s.id}, '${s.full_name}')" title="Delete">🗑️</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function populateDeptDropdown(selectId) {
  const sel = document.getElementById(selectId);
  const currentVal = sel.value;
  sel.innerHTML = '<option value="">— Not assigned —</option>' +
    departments.map(d => `<option value="${d.id}">${d.code} — ${d.name}</option>`).join('');
  if (currentVal) sel.value = currentVal;
}

document.getElementById('addSupervisorBtn').addEventListener('click', () => {
  editingSupervisorId = null;
  document.getElementById('supModalTitle').textContent = 'Add Supervisor';
  document.getElementById('supUsername').value = '';
  document.getElementById('supUsername').disabled = false;
  document.getElementById('supPassword').value = '';
  document.getElementById('supFullName').value = '';
  populateDeptDropdown('supDept');
  document.getElementById('supDept').value = '';
  openModal('supModal');
});

window.editSupervisor = function(id) {
  const s = supervisors.find(x => x.id === id);
  if (!s) return;
  editingSupervisorId = id;
  document.getElementById('supModalTitle').textContent = 'Edit Supervisor';
  document.getElementById('supUsername').value = s.username;
  document.getElementById('supUsername').disabled = true;
  document.getElementById('supPassword').value = '';
  document.getElementById('supFullName').value = s.full_name;
  populateDeptDropdown('supDept');
  document.getElementById('supDept').value = s.department_id || '';
  openModal('supModal');
};

document.getElementById('supSaveBtn').addEventListener('click', async () => {
  const username = document.getElementById('supUsername').value.trim();
  const password = document.getElementById('supPassword').value;
  const full_name = document.getElementById('supFullName').value.trim();
  const department_id = document.getElementById('supDept').value || null;

  if (!full_name) return showToast('Full name is required', 'warning');
  if (!editingSupervisorId && (!username || !password)) return showToast('Username and password are required', 'warning');

  try {
    const url = editingSupervisorId ? `/api/admin/supervisors/${editingSupervisorId}` : '/api/admin/supervisors';
    const method = editingSupervisorId ? 'PUT' : 'POST';
    const body = editingSupervisorId
      ? { full_name, department_id, password: password || undefined }
      : { username, password, full_name, department_id };
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showToast(data.message);
    closeModal('supModal');
    loadAll();
  } catch (err) { showToast(err.message, 'error'); }
});

window.deleteSupervisor = async function(id, name) {
  if (!confirm(`Delete supervisor "${name}"?`)) return;
  try {
    const res = await fetch(`/api/admin/supervisors/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showToast(data.message);
    loadAll();
  } catch (err) { showToast(err.message, 'error'); }
};

// ── MASTER SHEET ──
function populateFilters() {
  // Department filter
  const deptSel = document.getElementById('msFilterDept');
  deptSel.innerHTML = '<option value="all">All Departments</option>' +
    departments.map(d => `<option value="${d.id}">${d.code} — ${d.name}</option>`).join('');

  // Month filter
  const monthSel = document.getElementById('msFilterMonth');
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const now = new Date();
  monthSel.innerHTML = months.map((m, i) => `<option value="${i + 1}" ${i === now.getMonth() ? 'selected' : ''}>${m}</option>`).join('');

  // Year filter
  const yearSel = document.getElementById('msFilterYear');
  const currentYear = now.getFullYear();
  yearSel.innerHTML = '';
  for (let y = currentYear; y >= currentYear - 2; y--) {
    yearSel.innerHTML += `<option value="${y}" ${y === currentYear ? 'selected' : ''}>${y}</option>`;
  }
}

document.getElementById('msLoadBtn').addEventListener('click', loadMasterSheet);

async function loadMasterSheet() {
  const dept = document.getElementById('msFilterDept').value;
  const month = document.getElementById('msFilterMonth').value;
  const year = document.getElementById('msFilterYear').value;

  try {
    const res = await fetch(`/api/admin/mastersheet?dept=${dept}&month=${month}&year=${year}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    renderMasterSheet(data.records);
  } catch (err) { showToast(err.message, 'error'); }
}

function renderMasterSheet(records) {
  const tbody = document.getElementById('msTableBody');
  if (!records || records.length === 0) {
    tbody.innerHTML = '<tr><td colspan="11" class="empty-state"><div class="empty-icon">📭</div><h3>No records found</h3><p>No attendance data for the selected period</p></td></tr>';
    return;
  }

  let totalWD = 0, totalCL = 0, totalFL = 0, totalNH = 0, totalAbs = 0, totalDays = 0, totalOT = 0;

  tbody.innerHTML = records.map((r, i) => {
    totalWD += r.working_days;
    totalCL += r.casual_leave;
    totalFL += r.festive_leave;
    totalNH += r.national_holiday;
    totalAbs += r.absent;
    totalDays += r.total_days;
    totalOT += r.overtime_hours;

    return `<tr onclick="openMasterDetail('${r.employee_id}')" style="cursor: pointer;" title="Click to view detailed attendance breakdown">
      <td>${i + 1}</td>
      <td style="color:var(--text-primary); font-family: monospace;">${r.employee_id}</td>
      <td style="font-weight:500;color:var(--text-primary)">${r.name}</td>
      <td><span class="badge badge-info">${r.department_code}</span></td>
      <td><span class="badge badge-success">${r.working_days}</span></td>
      <td>${r.casual_leave}</td>
      <td>${r.festive_leave}</td>
      <td>${r.national_holiday}</td>
      <td>${r.absent > 0 ? '<span class="badge badge-danger">' + r.absent + '</span>' : '0'}</td>
      <td style="font-weight:600;color:var(--text-primary)">${r.total_days}</td>
      <td>${r.overtime_hours > 0 ? '<span class="badge badge-warning">' + r.overtime_hours + '</span>' : '0'}</td>
    </tr>`;
  }).join('');

  // Totals row
  tbody.innerHTML += `<tr class="totals-row">
    <td colspan="4" style="text-align:right;font-weight:700">TOTALS</td>
    <td>${totalWD}</td><td>${totalCL}</td><td>${totalFL}</td><td>${totalNH}</td>
    <td>${totalAbs}</td><td>${totalDays}</td><td>${totalOT}</td>
  </tr>`;
}

window.openMasterDetail = async function(employeeId) {
  const month = document.getElementById('msFilterMonth').value;
  const year = document.getElementById('msFilterYear').value;
  const monthsNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  try {
    const res = await fetch(`/api/admin/mastersheet/detail?employee_id=${employeeId}&month=${month}&year=${year}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    const { member, days, leave_balances } = data;

    // Populate Modal Headers
    document.getElementById('msDetailEmployeeName').textContent = member.name;
    document.getElementById('msDetailEmployeeMeta').textContent = `Emp ID: ${member.employee_id} | Dept: ${member.department_code} — ${member.department_name} | Weekly Off: ${member.week_off || 'Sunday'}`;
    document.getElementById('msDetailMonthYear').textContent = `${monthsNames[month - 1]} ${year}`;

    // Populate Quota cards
    const clLeft = leave_balances.cl.remaining;
    const clQuota = leave_balances.cl.quota || 12;
    document.getElementById('msClBalance').textContent = `${clLeft} / ${clQuota} Left`;
    document.getElementById('msClProgress').style.width = `${(clLeft / clQuota) * 100}%`;

    const flLeft = leave_balances.fl.remaining;
    const flQuota = leave_balances.fl.quota || 10;
    document.getElementById('msFlBalance').textContent = `${flLeft} / ${flQuota} Left`;
    document.getElementById('msFlProgress').style.width = `${(flLeft / flQuota) * 100}%`;

    const nhLeft = leave_balances.nh.remaining;
    const nhQuota = leave_balances.nh.quota || 8;
    document.getElementById('msNhBalance').textContent = `${nhLeft} / ${nhQuota} Left`;
    document.getElementById('msNhProgress').style.width = `${(nhLeft / nhQuota) * 100}%`;

    // Build Calendar breakdown rows
    const tbody = document.getElementById('msDetailTableBody');
    
    // Generate days in month
    const daysCount = new Date(year, month, 0).getDate();
    let presentCount = 0, absentCount = 0, clCount = 0, flCount = 0, nhCount = 0, woCount = 0, otHours = 0;

    const rowsHtml = [];
    for (let d = 1; d <= daysCount; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayName = new Date(year, month - 1, d).toLocaleDateString('en-US', { weekday: 'short' });
      
      const dayRecord = days.find(day => day.date === dateStr);
      let status = dayRecord ? dayRecord.status : 'none';
      let ot = dayRecord ? dayRecord.overtime_hours : 0;
      
      if (status === 'P') presentCount++;
      else if (status === 'A') absentCount++;
      else if (status === 'CL') clCount++;
      else if (status === 'FL') flCount++;
      else if (status === 'NH') nhCount++;
      else if (status === 'WO') woCount++;
      otHours += ot;

      let statusBadge = '<span class="badge" style="background: rgba(255,255,255,0.05); color: var(--text-muted);">—</span>';
      if (status === 'P') {
        statusBadge = '<span class="badge badge-success">Present</span>';
      } else if (status === 'A') {
        statusBadge = '<span class="badge badge-danger">Absent</span>';
      } else if (status === 'CL') {
        statusBadge = '<span class="badge" style="background: rgba(99, 102, 241, 0.15); color: #818cf8; font-weight: 600;">Casual Leave (CL)</span>';
      } else if (status === 'FL') {
        statusBadge = '<span class="badge" style="background: rgba(242, 153, 74, 0.15); color: #f2994a; font-weight: 600;">Festive Leave (FL)</span>';
      } else if (status === 'NH') {
        statusBadge = '<span class="badge" style="background: rgba(39, 174, 96, 0.15); color: #27ae60; font-weight: 600;">National Holiday (NH)</span>';
      } else if (status === 'WO') {
        statusBadge = '<span class="badge" style="background: rgba(59, 130, 246, 0.15); color: #3b82f6; font-weight: 600;">Week Off (WO)</span>';
      }

      rowsHtml.push(`
        <tr style="border-bottom: 1px solid rgba(255,255,255,0.02);">
          <td style="padding: 0.5rem; color: var(--text-primary); font-family: monospace;">${String(d).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}</td>
          <td style="padding: 0.5rem; color: var(--text-secondary);">${dayName}</td>
          <td style="padding: 0.5rem; text-align: center;">${statusBadge}</td>
          <td style="padding: 0.5rem; text-align: right; font-family: monospace; color: ${ot > 0 ? 'var(--warning)' : 'var(--text-muted)'}">${ot > 0 ? ot + ' hrs' : '—'}</td>
        </tr>
      `);
    }
    tbody.innerHTML = rowsHtml.join('');

    // Populate summary counts
    document.getElementById('msSumPresent').textContent = presentCount;
    document.getElementById('msSumAbsent').textContent = absentCount;
    document.getElementById('msSumCL').textContent = clCount;
    document.getElementById('msSumFL').textContent = flCount;
    document.getElementById('msSumNH').textContent = nhCount;
    document.getElementById('msSumWO').textContent = woCount;
    document.getElementById('msSumOT').textContent = `${otHours.toFixed(1)} hrs`;

    openModal('msDetailModal');
  } catch (err) {
    showToast(err.message || 'Failed to fetch employee attendance details', 'error');
  }
};

document.getElementById('msExportBtn').addEventListener('click', () => {
  const dept = document.getElementById('msFilterDept').value;
  const month = document.getElementById('msFilterMonth').value;
  const year = document.getElementById('msFilterYear').value;
  window.open(`/api/admin/mastersheet/export?dept=${dept}&month=${month}&year=${year}`, '_blank');
});

// ── Stats ──
function updateStats() {
  document.getElementById('statDepts').textContent = departments.length;
  document.getElementById('statSupervisors').textContent = supervisors.length;
  const totalMembers = departments.reduce((sum, d) => sum + (d.member_count || 0), 0);
  document.getElementById('statMembers').textContent = totalMembers;
}
