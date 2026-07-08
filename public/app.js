// App State
const state = {
  employees: [],
  leaves: [],
  attendance: [],
  salaries: [],
  checkins: [],
  holidays: [],
  uploadedSalaries: [], // Temporary storage for Excel uploads
  syncStatus: {},
  settings: {
    companyName: "Variety Vintage",
    supportPhone: "+91 94038 90373",
    supportEmail: "hello@varietyvintage.com",
    gracePeriod: "09:30:00",
    lateDeduction: 250
  }
};

// Month Names Helper
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

// Initialize on page load
document.addEventListener("DOMContentLoaded", () => {
  // Initialize Lucide icons
  lucide.createIcons();
  
  // Setup drag-and-drop listeners for the salary upload zone
  setupDragAndDrop();
  
  // Fetch initial status and data
  refreshAllData();

  // Refresh status periodically every 60 seconds (for live biometric status updates)
  setInterval(fetchStatus, 60000);
});

// Refresh all data from server
async function refreshAllData() {
  await fetchSettings();
  await fetchStatus();
  await fetchData();
  await fetchSalaries();
  
  // Populate month dropdowns dynamically
  populateMonthDropdown("sync-attendance-month");
  populateMonthDropdown("report-month-select");
  populateMonthDropdown("payslip-month-select");
  
  renderDashboard();
  renderEmployees();
  renderAttendance();
  renderLeaves();
  renderSalariesTable();
  renderHolidays();
  populateEmployeeDropdown();
}

// Fetch CMS Settings and update branding
async function fetchSettings() {
  try {
    const res = await fetch("/api/settings");
    const data = await res.json();
    state.settings = data;
    
    // Bind settings dynamically to DOM
    const logoEl = document.getElementById("company-logo-text");
    if (logoEl) logoEl.textContent = data.companyName || "Variety Vintage";
    
    const sidebarNameEl = document.getElementById("company-name-sidebar");
    if (sidebarNameEl) sidebarNameEl.textContent = `${data.companyName} HR` || "Variety Vintage HR";
    
    const sidebarPhoneEl = document.getElementById("company-phone-sidebar");
    if (sidebarPhoneEl) sidebarPhoneEl.textContent = data.supportPhone || "+91 94038 90373";
    
    const sidebarEmailEl = document.getElementById("company-email-sidebar");
    if (sidebarEmailEl) sidebarEmailEl.textContent = data.supportEmail || "hello@varietyvintage.com";
    
    const payslipNameEl = document.getElementById("company-name-payslip");
    if (payslipNameEl) payslipNameEl.textContent = data.companyName || "Variety Vintage";
    
    const payslipDiscEl = document.getElementById("company-email-payslip-discrepancy");
    if (payslipDiscEl) payslipDiscEl.textContent = `For discrepancies, contact Finance at ${data.supportEmail || "hello@varietyvintage.com"}`;
  } catch (err) {
    console.error("Error fetching settings:", err);
  }
}

// Fetch Sync Status
async function fetchStatus() {
  try {
    const res = await fetch("/api/status");
    const data = await res.json();
    state.syncStatus = data;
    
    // Update Sync Time in header
    const statusText = document.getElementById("sync-status-time");
    if (data.employees && data.employees.exists) {
      const date = new Date(data.employees.lastUpdated);
      statusText.innerHTML = `Last Synced: <b>${date.toLocaleDateString()} ${date.toLocaleTimeString()}</b>`;
    } else {
      statusText.innerHTML = "<b>Not Synced Yet</b>";
    }

    // Update Biometric Status in sidebar
    const bioDot = document.getElementById("biometric-status-dot");
    const bioText = document.getElementById("biometric-status-text");
    if (bioDot && bioText && data.biometric) {
      const isOnline = data.biometric.status === 'online';
      bioDot.style.backgroundColor = isOnline ? '#10b981' : '#ef4444';
      bioDot.style.boxShadow = isOnline ? '0 0 8px #10b981' : '0 0 8px #ef4444';
      
      let label = isOnline ? 'Biometric: Online' : 'Biometric: Offline';
      if (data.biometric.lastSyncTime) {
        const lastSyncDate = new Date(data.biometric.lastSyncTime);
        const timeStr = lastSyncDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        label += ` (${timeStr})`;
      }
      bioText.textContent = label;
      bioText.title = data.biometric.lastSyncTime ? `Last Sync: ${new Date(data.biometric.lastSyncTime).toLocaleString()}` : 'No successful sync yet';
    }
  } catch (err) {
    showToast("Failed to fetch system status.", "error");
  }
}

// Fetch main portal data (employees, leaves, attendance, checkins, holidays)
async function fetchData() {
  try {
    const res = await fetch("/api/data");
    const data = await res.json();
    state.employees = data.employees || [];
    state.leaves = data.leaves || [];
    state.attendance = (data.attendance || []).sort((a, b) => {
      const dateA = a.data?.date || '';
      const dateB = b.data?.date || '';
      if (dateA !== dateB) {
        return dateB.localeCompare(dateA);
      }
      const idA = a.data?.id || 0;
      const idB = b.data?.id || 0;
      return idB - idA;
    });
    state.checkins = data.checkins || [];
    state.holidays = data.holidays || [];
  } catch (err) {
    showToast("Failed to retrieve employee & log databases.", "error");
  }
}

// Fetch saved salary details
async function fetchSalaries() {
  try {
    const res = await fetch("/api/salaries");
    const data = await res.json();
    state.salaries = data || [];
  } catch (err) {
    showToast("Failed to retrieve salary structures.", "error");
  }
}

// Switch tabs inside application (sidebar router)
function switchTab(tabId) {
  // Update sidebar menu highlight
  const navItems = document.querySelectorAll(".nav-item");
  navItems.forEach(item => item.classList.remove("active"));
  
  const activeNavItem = document.getElementById(`nav-${tabId}`);
  if (activeNavItem) activeNavItem.classList.add("active");
  
  // Show active tab pane
  const tabPanes = document.querySelectorAll(".tab-content");
  tabPanes.forEach(pane => pane.classList.remove("active"));
  
  const activePane = document.getElementById(tabId);
  if (activePane) activePane.classList.add("active");
  
  // Update top header page title
  const pageTitle = document.getElementById("page-title-text");
  pageTitle.textContent = tabId.charAt(0).toUpperCase() + tabId.slice(1).replace("-", " ");
  
  // Perform page specific rendering/triggers
  if (tabId === "payslips") {
    populatePayslipMonthDropdown();
    populateEmployeeDropdown();
    generatePayslipPreview();
  }
  if (tabId === "logs") {
    renderActivityLogs();
  }

  // Pretty page titles
  const titles = {
    dashboard: 'Dashboard',
    employees: 'Employees',
    attendance: 'Attendance Logs',
    leaves: 'Leave Requests',
    salaries: 'Upload Salaries',
    payslips: 'Generate Payslips',
    holidays: 'Holidays',
    logs: 'Activity Logs'
  };
  document.getElementById('page-title-text').textContent = titles[tabId] || (tabId.charAt(0).toUpperCase() + tabId.slice(1));
}

// Render Dashboard Counters
function renderDashboard() {
  document.getElementById("stat-total-employees").textContent = state.employees.length;
  
  // Approved leaves
  const approvedLeaves = state.leaves.filter(l => l.status.toLowerCase() === "approved");
  document.getElementById("stat-approved-leaves").textContent = approvedLeaves.length;
  
  // Total LOP Days (sum lop_days from attendance of type lop, and also leaves with category loss of pay)
  let totalLopDays = 0;
  state.attendance.forEach(rec => {
    if (rec.modalType === "Lop" && rec.data && rec.data.lop_days) {
      totalLopDays += parseFloat(rec.data.lop_days);
    }
  });
  document.getElementById("stat-lop-days").textContent = totalLopDays;
  
  // Total Late Marks
  const lateMarks = state.attendance.filter(rec => rec.modalType === "Late");
  document.getElementById("stat-late-marks").textContent = lateMarks.length;
}

// Render Employee cards
function renderEmployees() {
  const container = document.getElementById("employee-card-container");
  container.innerHTML = "";
  
  if (state.employees.length === 0) {
    container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--slate-500); font-weight: 600;">No employees synced yet. Please sync portal.</div>`;
    return;
  }
  
  state.employees.forEach(emp => {
    const card = document.createElement("div");
    card.className = "employee-card";
    card.setAttribute("onclick", `if(!event.target.closest('.eye-btn') && !event.target.closest('.emp-action-btn')) showEmployeeReport('${emp.username}')`);
    
    const initial = emp.name ? emp.name.charAt(0) : "E";
    const typeLabel = emp.employee_type === "sales" ? "Sales Team" : emp.employee_type === "combined" ? "Combined" : "Operations/Non-Sales";
    const kpiLabel = emp.employee_type === "sales" ? "Sales KPI" : emp.employee_type === "combined" ? "Combined KPI" : "Non-Sales KPI";
    
    card.innerHTML = `
      <div class="employee-avatar">${initial}</div>
      <h4 class="employee-name">${emp.name}</h4>
      <p class="employee-designation">${emp.designation || 'Staff member'}</p>
      
      <div class="employee-details">
        <div class="employee-detail-row">
          <span class="employee-detail-lbl">Username</span>
          <span class="employee-detail-val">${emp.username}</span>
        </div>
        <div class="employee-detail-row">
          <span class="employee-detail-lbl">Portal Password</span>
          <span class="employee-password-container">
            <span class="employee-detail-val" id="pwd-text-${emp.id}" style="-webkit-text-security: disc;">${emp.plain_password || '—'}</span>
            <button class="eye-btn" onclick="togglePasswordVisibility(${emp.id})">
              <i data-lucide="eye" id="pwd-icon-${emp.id}" style="width: 14px; height: 14px;"></i>
            </button>
          </span>
        </div>
        <div class="employee-detail-row">
          <span class="employee-detail-lbl">Role Class</span>
          <span class="employee-detail-val badge">${emp.role}</span>
        </div>
        <div class="employee-detail-row">
          <span class="employee-detail-lbl">KPI Type</span>
          <span class="employee-detail-val">${kpiLabel}</span>
        </div>
      </div>

      <div style="display:flex; gap:8px; margin-top:16px; border-top:1px solid var(--slate-100); padding-top:14px;">
        <button class="emp-action-btn" onclick="openEditEmployeeModal('${emp.username}')" style="flex:1; display:flex; align-items:center; justify-content:center; gap:6px; padding:9px 12px; border-radius:10px; border:1px solid var(--slate-200); background:white; font-size:12px; font-weight:600; color:var(--slate-700); cursor:pointer; transition:all .2s;" onmouseover="this.style.background='var(--primary-light)';this.style.color='var(--primary)';this.style.borderColor='rgba(121,19,176,.2)'" onmouseout="this.style.background='white';this.style.color='var(--slate-700)';this.style.borderColor='var(--slate-200)'">
          <i data-lucide="edit-3" style="width:13px;height:13px;"></i> Edit
        </button>
        <button class="emp-action-btn" onclick="openPerfHistoryModal('${emp.username}', ${emp.id},'${emp.name}')" style="flex:1; display:flex; align-items:center; justify-content:center; gap:6px; padding:9px 12px; border-radius:10px; border:1px solid var(--slate-200); background:white; font-size:12px; font-weight:600; color:var(--slate-700); cursor:pointer; transition:all .2s;" onmouseover="this.style.background='#ede9fe';this.style.color='#7c3aed';this.style.borderColor='#c4b5fd'" onmouseout="this.style.background='white';this.style.color='var(--slate-700)';this.style.borderColor='var(--slate-200)'">
          <i data-lucide="bar-chart-2" style="width:13px;height:13px;"></i> Performance
        </button>
      </div>
    `;
    container.appendChild(card);
  });
  
  lucide.createIcons();
}

// Toggle employee portal password reveal
function togglePasswordVisibility(empId) {
  const pwdText = document.getElementById(`pwd-text-${empId}`);
  const pwdIcon = document.getElementById(`pwd-icon-${empId}`);
  
  if (pwdText.style.webkitTextSecurity === "disc" || pwdText.style.webkitTextSecurity === "") {
    pwdText.style.webkitTextSecurity = "none";
    pwdIcon.setAttribute("data-lucide", "eye-off");
  } else {
    pwdText.style.webkitTextSecurity = "disc";
    pwdIcon.setAttribute("data-lucide", "eye");
  }
  lucide.createIcons();
}

// Filter employees based on search input
function filterEmployees() {
  const searchVal = document.getElementById("employee-search").value.toLowerCase();
  const cards = document.querySelectorAll(".employee-card");
  
  cards.forEach(card => {
    const name = card.querySelector(".employee-name").textContent.toLowerCase();
    const designation = card.querySelector(".employee-designation").textContent.toLowerCase();
    const details = card.querySelector(".employee-details").textContent.toLowerCase();
    
    if (name.includes(searchVal) || designation.includes(searchVal) || details.includes(searchVal)) {
      card.style.display = "block";
    } else {
      card.style.display = "none";
    }
  });
}

// Render Attendance table
function renderAttendance() {
  const tbody = document.getElementById("attendance-table-body");
  tbody.innerHTML = "";
  
  if (state.attendance.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--slate-500); padding: 30px;">No attendance deductions synced.</td></tr>`;
    return;
  }
  
  state.attendance.forEach(rec => {
    const empName = rec.data.user ? rec.data.user.name : "Unknown Employee";
    const typeLabel = rec.modalType === "Late" ? "Late Arrival" : "Loss Of Pay (LOP)";
    const pillClass = rec.modalType === "Late" ? "late" : "lop";
    
    const details = rec.modalType === "Late" 
      ? `Late by <b>${rec.data.minutes_late} minutes</b>`
      : `Absent for <b>${rec.data.lop_days} days</b>`;
      
    const dateFormatted = new Date(rec.data.date).toLocaleDateString("en-US", {
      day: "numeric",
      month: "short",
      year: "numeric"
    });

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="font-weight: 700; color: var(--slate-900);">${empName}</td>
      <td><span class="status-pill ${pillClass}">${typeLabel}</span></td>
      <td style="font-family: monospace; font-weight: 600;">${dateFormatted}</td>
      <td style="font-weight: 700; color: var(--danger);">₹${(rec.data.deduction_amount || 0).toLocaleString()}</td>
      <td>${details}</td>
      <td style="font-size: 12px; color: var(--slate-500); max-width: 250px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${rec.data.reason || 'No comment'}">${rec.data.reason || 'No reasoning entered'}</td>
    `;
    tbody.appendChild(tr);
  });
}

// Render Leaves table
function renderLeaves() {
  const tbody = document.getElementById("leaves-table-body");
  tbody.innerHTML = "";
  
  if (state.leaves.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--slate-500); padding: 30px;">No leave logs synced.</td></tr>`;
    return;
  }
  
  state.leaves.forEach(leave => {
    const pillClass = leave.status.toLowerCase();
    
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="font-weight: 700; color: var(--slate-900);">
        <div>${leave.employeeName}</div>
        <div style="font-size: 10px; color: var(--slate-400); font-weight: 600; text-transform: uppercase; margin-top: 3px;">${leave.designation || 'Staff Member'}</div>
      </td>
      <td style="font-weight: 600; color: var(--slate-700); font-size: 13px;">${leave.leavePeriod}</td>
      <td style="font-size: 13px;">${leave.category}</td>
      <td style="font-weight: 700; color: var(--primary);">${leave.duration}</td>
      <td style="font-size: 12px; color: var(--slate-500); max-width: 300px; line-height: 1.4;" title="${leave.reason}">${leave.reason}</td>
      <td><span class="status-pill ${pillClass}">${leave.status}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

// Render active base salaries
function renderSalariesTable() {
  const tbody = document.getElementById("active-salaries-body");
  tbody.innerHTML = "";
  
  if (state.employees.length === 0) {
    tbody.innerHTML = `<tr><td colspan="11" style="text-align: center; color: var(--slate-500); padding: 30px;">Sync employee profiles to view active salaries.</td></tr>`;
    return;
  }
  
  state.employees.forEach(emp => {
    // Find if we have base salary record for employee
    const sal = state.salaries.find(s => 
      s.username === emp.username || 
      s.employeeName.toLowerCase() === emp.name.toLowerCase()
    ) || { basicDA: 0, hra: 0, otherAllow: 0, empPf: 0, esic: 0, pt: 0, it: 0 };
    
    const gross = (sal.basicDA || 0) + (sal.hra || 0) + (sal.otherAllow || 0);
    
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="font-weight: 700; color: var(--slate-900);">${emp.name}</td>
      <td style="font-family: monospace;">${emp.username}</td>
      <td style="font-weight: 700; color: var(--primary);">₹${gross.toLocaleString()}</td>
      <td style="color: var(--slate-800);">₹${(sal.basicDA || 0).toLocaleString()}</td>
      <td style="color: var(--slate-700);">₹${(sal.hra || 0).toLocaleString()}</td>
      <td style="color: var(--slate-600);">₹${(sal.otherAllow || 0).toLocaleString()}</td>
      <td style="color: var(--danger);">₹${(sal.empPf || 0).toLocaleString()}</td>
      <td style="color: var(--danger);">₹${(sal.esic || 0).toLocaleString()}</td>
      <td style="color: var(--danger);">₹${(sal.pt || 0).toLocaleString()}</td>
      <td style="color: var(--danger);">₹${(sal.it || 0).toLocaleString()}</td>
      <td style="white-space: nowrap;">
        <button class="btn btn-secondary" style="padding: 6px 12px; border-radius: 8px; font-size: 12px; display: inline-flex; align-items: center; gap: 4px; margin-right: 6px;" onclick="openSalaryModal('${emp.username}', '${emp.name}')">
          <i data-lucide="edit" style="width: 12px; height: 12px; vertical-align: middle;"></i> Edit
        </button>
        <button class="btn btn-danger" style="padding: 6px 12px; border-radius: 8px; font-size: 12px; display: inline-flex; align-items: center; gap: 4px;" onclick="removeEmployee('${emp.username}', '${emp.name.replace(/'/g, "\\'")}')">
          <i data-lucide="trash-2" style="width: 12px; height: 12px; vertical-align: middle;"></i> Remove
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
  
  lucide.createIcons();
}

// Populate Employee Dropdown in Payslip tab
function populateEmployeeDropdown() {
  const select = document.getElementById("payslip-employee-select");
  const currentVal = select.value;
  select.innerHTML = "";
  
  if (state.employees.length === 0) {
    select.innerHTML = `<option value="">-- No Synced Employees --</option>`;
    return;
  }
  
  state.employees.forEach(emp => {
    const opt = document.createElement("option");
    opt.value = emp.username;
    opt.textContent = `${emp.name} (${emp.designation || 'Staff'})`;
    select.appendChild(opt);
  });
  
  if (currentVal && state.employees.some(e => e.username === currentVal)) {
    select.value = currentVal;
  }
}

// Populate payslip month dropdown dynamically (from current month back to September 2021)
function populatePayslipMonthDropdown() {
  populateMonthDropdown("payslip-month-select");
}

// Populate a month select dropdown dynamically (from current month back to September 2021)
function populateMonthDropdown(selectId) {
  const select = document.getElementById(selectId);
  if (!select) return;
  const currentVal = select.value;
  select.innerHTML = "";

  const today = new Date();
  const startYear = 2021;
  const startMonth = 8; // September is 8 (0-indexed)

  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();

  let y = currentYear;
  let m = currentMonth;

  while (y > startYear || (y === startYear && m >= startMonth)) {
    const value = `${y}-${String(m + 1).padStart(2, '0')}`;
    const label = `${MONTH_NAMES[m]} ${y}`;
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = label;
    select.appendChild(opt);

    m--;
    if (m < 0) {
      m = 11;
      y--;
    }
  }

  // Restore previously selected month if it still exists
  if (currentVal && [...select.options].some(o => o.value === currentVal)) {
    select.value = currentVal;
  }
}

// Modal open/close controls
function openSyncModal() {
  document.getElementById("sync-modal").classList.add("active");
}

function closeSyncModal() {
  document.getElementById("sync-modal").classList.remove("active");
}

// Trigger portal synchronization API
async function triggerSyncData() {
  const userEl = document.getElementById("sync-username");
  const passEl = document.getElementById("sync-password");
  const btnText = document.getElementById("sync-btn-text");
  const spinner = document.getElementById("sync-spinner-icon");
  
  const prevText = btnText.textContent;
  btnText.textContent = "Syncing Portal, Please wait...";
  spinner.classList.add("spinning");
  
  try {
    const res = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: userEl.value,
        password: passEl.value
      })
    });
    
    const data = await res.json();
    
    if (data.success) {
      showToast(`Sync Complete! Fetched ${data.summary.employeesCount} employees, ${data.summary.leavesCount} leaves.`, "success");
      closeSyncModal();
      await refreshAllData();
    } else {
      showToast(`Sync Failed: ${data.error}`, "error");
    }
  } catch (err) {
    showToast("Server request timed out or was rejected.", "error");
  } finally {
    btnText.textContent = prevText;
    spinner.classList.remove("spinning");
  }
}

// Trigger biometric sync for a specific month
async function triggerBiometricSync() {
  const monthSelect = document.getElementById("sync-attendance-month");
  const monthVal = monthSelect.value;
  
  const btnText = document.getElementById("biometric-sync-btn-text");
  const spinner = document.getElementById("biometric-sync-spinner");
  
  const prevText = btnText.textContent;
  btnText.textContent = `Syncing ${monthVal}...`;
  spinner.classList.add("spinning");
  
  try {
    const res = await fetch("/api/sync/biometric", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        month: monthVal
      })
    });
    
    const data = await res.json();
    
    if (data.success) {
      showToast(`Biometric Sync Complete for ${monthVal}!`, "success");
      await refreshAllData();
    } else {
      showToast(`Sync Failed: ${data.error}`, "error");
    }
  } catch (err) {
    showToast("Server request timed out or was rejected.", "error");
  } finally {
    btnText.textContent = prevText;
    spinner.classList.remove("spinning");
  }
}

// Salary Editor Modal controls
function openSalaryModal(username, name) {
  const sal = state.salaries.find(s => s.username === username) || { basicDA: 0, hra: 0, otherAllow: 0, empPf: 0, esic: 0, pt: 0, it: 0 };
  
  document.getElementById("sal-edit-username").value = username;
  document.getElementById("sal-edit-name").value = name;
  document.getElementById("sal-edit-basicda").value = sal.basicDA || 0;
  document.getElementById("sal-edit-hra").value = sal.hra || 0;
  document.getElementById("sal-edit-otherallow").value = sal.otherAllow || 0;
  document.getElementById("sal-edit-emppf").value = sal.empPf || 0;
  document.getElementById("sal-edit-esic").value = sal.esic || 0;
  document.getElementById("sal-edit-pt").value = sal.pt || 0;
  document.getElementById("sal-edit-it").value = sal.it || 0;
  
  document.getElementById("salary-modal").classList.add("active");
}

function closeSalaryModal() {
  document.getElementById("salary-modal").classList.remove("active");
}

async function saveSingleSalary() {
  const username = document.getElementById("sal-edit-username").value;
  const name = document.getElementById("sal-edit-name").value;
  const basicDA = parseFloat(document.getElementById("sal-edit-basicda").value) || 0;
  const hra = parseFloat(document.getElementById("sal-edit-hra").value) || 0;
  const otherAllow = parseFloat(document.getElementById("sal-edit-otherallow").value) || 0;
  const empPf = parseFloat(document.getElementById("sal-edit-emppf").value) || 0;
  const esic = parseFloat(document.getElementById("sal-edit-esic").value) || 0;
  const pt = parseFloat(document.getElementById("sal-edit-pt").value) || 0;
  const it = parseFloat(document.getElementById("sal-edit-it").value) || 0;
  
  try {
    const res = await fetch("/api/salaries/single", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username,
        employeeName: name,
        basicDA,
        hra,
        otherAllow,
        empPf,
        esic,
        pt,
        it
      })
    });
    
    const data = await res.json();
    if (data.success) {
      showToast("Salary updated successfully.", "success");
      closeSalaryModal();
      await fetchSalaries();
      renderSalariesTable();
      if (document.getElementById("payslips").classList.contains("active")) {
        generatePayslipPreview();
      }
    }
  } catch (err) {
    showToast("Failed to update salary.", "error");
  }
}

// Add Employee Modal controls
function openAddEmployeeModal() {
  document.getElementById("add-emp-name").value = "";
  document.getElementById("add-emp-username").value = "";
  document.getElementById("add-emp-designation").value = "";
  document.getElementById("add-emp-password").value = "";
  document.getElementById("add-emp-role").value = "employee";
  document.getElementById("add-emp-type").value = "combined";

  document.getElementById("add-sal-basicda").value = "";
  document.getElementById("add-sal-hra").value = "";
  document.getElementById("add-sal-otherallow").value = "";
  document.getElementById("add-sal-emppf").value = "";
  document.getElementById("add-sal-esic").value = "";
  document.getElementById("add-sal-pt").value = "";
  document.getElementById("add-sal-it").value = "";

  document.getElementById("add-employee-modal").classList.add("active");
}

function closeAddEmployeeModal() {
  document.getElementById("add-employee-modal").classList.remove("active");
}

async function saveNewEmployee() {
  const name = document.getElementById("add-emp-name").value.trim();
  const username = document.getElementById("add-emp-username").value.trim().toLowerCase();
  const designation = document.getElementById("add-emp-designation").value.trim();
  const plain_password = document.getElementById("add-emp-password").value.trim();
  const role = document.getElementById("add-emp-role").value;
  const employee_type = document.getElementById("add-emp-type").value;

  if (!name || !username || !plain_password || !designation) {
    showToast("Please fill in all required fields marked with *", "error");
    return;
  }

  // Check unique username on client side first
  if (state.employees.some(e => e.username.toLowerCase() === username)) {
    showToast("Username already exists. Please choose a different one.", "error");
    return;
  }

  // Parse salary parameters
  const basicDA = parseFloat(document.getElementById("add-sal-basicda").value) || 0;
  const hra = parseFloat(document.getElementById("add-sal-hra").value) || 0;
  const otherAllow = parseFloat(document.getElementById("add-sal-otherallow").value) || 0;
  const empPf = parseFloat(document.getElementById("add-sal-emppf").value) || 0;
  const esic = parseFloat(document.getElementById("add-sal-esic").value) || 0;
  const pt = parseFloat(document.getElementById("add-sal-pt").value) || 0;
  const it = parseFloat(document.getElementById("add-sal-it").value) || 0;

  try {
    // 1. Create employee profile
    const empRes = await fetch("/api/employees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        username,
        plain_password,
        role,
        employee_type,
        designation
      })
    });

    const empData = await empRes.json();
    if (!empData.success) {
      showToast(`Failed to add employee profile: ${empData.error}`, "error");
      return;
    }

    // 2. Create/save employee starting salary specifications
    const salRes = await fetch("/api/salaries/single", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username,
        employeeName: name,
        basicDA,
        hra,
        otherAllow,
        empPf,
        esic,
        pt,
        it
      })
    });

    const salData = await salRes.json();
    if (!salData.success) {
      showToast(`Failed to initialize employee salary, but profile was created.`, "warning");
    } else {
      showToast("Employee and salary specifications added successfully.", "success");
    }

    closeAddEmployeeModal();
    await refreshAllData();
  } catch (err) {
    showToast("Failed to create employee.", "error");
  }
}

async function removeEmployee(username, name) {
  if (!confirm(`Are you sure you want to permanently remove employee "${name}" (${username}) and their salary specifications? This action cannot be undone.`)) {
    return;
  }

  try {
    const res = await fetch(`/api/employees/${username}`, {
      method: "DELETE"
    });

    const data = await res.json();
    if (data.success) {
      showToast(`Employee "${name}" has been removed.`, "success");
      await refreshAllData();
    } else {
      showToast(`Failed to remove employee: ${data.error}`, "error");
    }
  } catch (err) {
    showToast("Failed to remove employee.", "error");
  }
}

// File drag and drop listeners
function setupDragAndDrop() {
  const dropZone = document.getElementById("drop-zone");
  
  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropZone.classList.add("dragover");
    }, false);
  });
  
  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropZone.classList.remove("dragover");
    }, false);
  });
  
  dropZone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length > 0) {
      handleFile(files[0]);
    }
  }, false);
}

function handleFileSelect(e) {
  const files = e.target.files;
  if (files.length > 0) {
    handleFile(files[0]);
  }
}

// Parse excel/csv file client-side using SheetJS
function handleFile(file) {
  const isCsv = file.name.toLowerCase().endsWith('.csv');
  const reader = new FileReader();
  reader.onload = function(e) {
    let workbook;
    if (isCsv) {
      const text = e.target.result;
      workbook = XLSX.read(text, { type: 'string' });
    } else {
      const data = new Uint8Array(e.target.result);
      workbook = XLSX.read(data, { type: 'array' });
    }
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json(worksheet);
    
    processSalaryData(json);
  };
  
  if (isCsv) {
    reader.readAsText(file);
  } else {
    reader.readAsArrayBuffer(file);
  }
}

// Process mapped keys
function processSalaryData(rows) {
  state.uploadedSalaries = [];
  
  rows.forEach(row => {
    // Look for name columns
    let employeeName = '';
    let username = '';
    
    // Scan object keys for matches
    for (const key of Object.keys(row)) {
      const lower = key.toLowerCase().replace(/[^a-z0-9+]/g, ''); // retain + sign for basic+da
      if (['username', 'user', 'id'].includes(lower)) {
        username = String(row[key]).trim();
      }
      if (['employeename', 'name', 'fullname', 'empname'].includes(lower)) {
        employeeName = String(row[key]).trim();
      }
    }
    
    // Find matching employee by name if username is empty, and vice versa
    if (!username && employeeName) {
      const emp = state.employees.find(e => e.name.toLowerCase() === employeeName.toLowerCase());
      if (emp) username = emp.username;
    }
    if (!employeeName && username) {
      const emp = state.employees.find(e => e.username === username);
      if (emp) employeeName = emp.name;
    }
    
    // If we have neither, skip or assign name
    if (!employeeName && !username) return;
    
    // Scan values
    let basicDA = 0;
    let hra = 0;
    let otherAllow = 0;
    let empPf = 0;
    let esic = 0;
    let pt = 0;
    let it = 0;
    
    for (const key of Object.keys(row)) {
      const lower = key.toLowerCase().trim().replace(/\s+/g, '');
      const rawVal = parseFloat(String(row[key]).replace(/,/g, '')) || 0; // handle formatted strings like "75,000.00"
      
      if (lower === 'basic+da' || lower === 'basicda' || lower === 'basic' || lower === 'basicpay') {
        basicDA = rawVal;
      } else if (lower === 'hra' || lower === 'houserentallowance') {
        hra = rawVal;
      } else if (lower === 'otherallow' || lower === 'otherallowance' || lower === 'allowance') {
        otherAllow = rawVal;
      } else if (lower === 'emppf' || lower === 'pf' || lower === 'providentfund') {
        empPf = rawVal;
      } else if (lower === 'esic' || lower === 'esi') {
        esic = rawVal;
      } else if (lower === 'pt' || lower === 'professionaltax') {
        pt = rawVal;
      } else if (lower === 'it' || lower === 'incometax' || lower === 'tds') {
        it = rawVal;
      }
    }
    
    state.uploadedSalaries.push({
      username: username || employeeName.toLowerCase().replace(/\s+/g, ''),
      employeeName: employeeName || username,
      basicDA,
      hra,
      otherAllow,
      empPf,
      esic,
      pt,
      it
    });
  });
  
  // Display Preview
  renderSalaryPreview();
}

// Show preview panel
function renderSalaryPreview() {
  const previewCard = document.getElementById("salary-preview-card");
  const previewBody = document.getElementById("salary-preview-body");
  previewBody.innerHTML = "";
  
  if (state.uploadedSalaries.length === 0) {
    previewCard.style.display = "none";
    showToast("Could not extract salary columns. Check spreadsheet headers.", "error");
    return;
  }
  
  state.uploadedSalaries.forEach(sal => {
    const gross = sal.basicDA + sal.hra + sal.otherAllow;
    const totalDed = sal.empPf + sal.esic + sal.pt + sal.it;
    const net = gross - totalDed;
    
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="font-weight: 700; color: var(--slate-900);">${sal.employeeName} (<code>${sal.username}</code>)</td>
      <td style="font-family: monospace; font-weight: 700; color: var(--primary);">₹${gross.toLocaleString()}</td>
      <td style="font-family: monospace;">₹${sal.basicDA.toLocaleString()}</td>
      <td style="font-family: monospace;">₹${sal.hra.toLocaleString()}</td>
      <td style="font-family: monospace;">₹${sal.otherAllow.toLocaleString()}</td>
      <td style="font-family: monospace; color: var(--danger);">₹${sal.empPf.toLocaleString()}</td>
      <td style="font-family: monospace; color: var(--danger);">₹${sal.esic.toLocaleString()}</td>
      <td style="font-family: monospace; color: var(--danger);">₹${sal.pt.toLocaleString()}</td>
      <td style="font-family: monospace; color: var(--danger);">₹${sal.it.toLocaleString()}</td>
      <td style="font-family: monospace; font-weight: 700; color: var(--success);">₹${net.toLocaleString()}</td>
    `;
    previewBody.appendChild(tr);
  });
  
  previewCard.style.display = "block";
  previewCard.scrollIntoView({ behavior: 'smooth' });
}

// Save uploaded Excel sheets to API
async function saveUploadedSalaries() {
  try {
    const res = await fetch("/api/salaries/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state.uploadedSalaries)
    });
    
    const data = await res.json();
    if (data.success) {
      showToast(`Successfully saved ${data.count} salary records!`, "success");
      document.getElementById("salary-preview-card").style.display = "none";
      state.uploadedSalaries = [];
      await fetchSalaries();
      renderSalariesTable();
    }
  } catch (err) {
    showToast("Failed to save salaries to server.", "error");
  }
}

// --- PAYSLIP DEDUCTIONS AND COMPILATION ENGINE ---
function generatePayslipPreview() {
  const username = document.getElementById("payslip-employee-select").value;
  const selectedPeriod = document.getElementById("payslip-month-select").value; // e.g. "2026-05"
  
  if (!username) {
    clearPayslipPreview();
    return;
  }
  
  const employee = state.employees.find(e => e.username === username);
  if (!employee) {
    clearPayslipPreview();
    return;
  }
  
  // Parse year and month
  const [yearStr, monthStr] = selectedPeriod.split('-');
  const year = parseInt(yearStr, 10);
  const monthIdx = parseInt(monthStr, 10) - 1; // 0-indexed month
  
  // Calculate total days in this target month (divisor)
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
  const periodLabel = `${MONTH_NAMES[monthIdx]} ${year}`;
  
  // 1. Get salary config
  const salaryConfig = state.salaries.find(s => 
    s.username === username || 
    s.employeeName.toLowerCase() === employee.name.toLowerCase()
  ) || { basicDA: 0, hra: 0, otherAllow: 0, empPf: 0, esic: 0, pt: 0, it: 0 };
  
  const basicDA = salaryConfig.basicDA || 0;
  const hra = salaryConfig.hra || 0;
  const otherAllow = salaryConfig.otherAllow || 0;
  const empPf = salaryConfig.empPf || 0;
  const esic = salaryConfig.esic || 0;
  const pt = salaryConfig.pt || 0;
  const it = salaryConfig.it || 0;
  
  const grossEarnings = basicDA + hra + otherAllow;
  
  // Daily rate for LOP deduction (Gross / calendar days in selected month)
  const dailyRate = grossEarnings > 0 ? (grossEarnings / daysInMonth) : 0;
  
  // 2. Count late marks for employee in target month
  const zeroLate = document.getElementById("zero-late")?.checked || false;
  const lates = state.attendance.filter(rec => 
    rec.modalType === "Late" && 
    rec.data.user_id === employee.id && 
    rec.data.date.startsWith(selectedPeriod)
  );
  const lateCount = zeroLate ? 0 : lates.length;
  // Flat late deduction using CMS settings
  const lateDeductionAmount = state.settings.lateDeduction !== undefined ? parseFloat(state.settings.lateDeduction) : 250;
  const lateDeduction = zeroLate ? 0 : (lateCount * lateDeductionAmount);
  
  // 3. Count LOP days in target month
  const zeroLop = document.getElementById("zero-lop")?.checked || false;
  const lopRecords = state.attendance.filter(rec => 
    rec.modalType === "Lop" && 
    rec.data.user_id === employee.id && 
    rec.data.date.startsWith(selectedPeriod)
  );
  
  let lopDays = 0;
  let lopDeduction = 0;
  
  if (!zeroLop) {
    lopRecords.forEach(rec => {
      lopDays += parseFloat(rec.data.lop_days) || 0;
      if (rec.data.deduction_amount) {
        lopDeduction += parseFloat(rec.data.deduction_amount);
      } else {
        lopDeduction += (parseFloat(rec.data.lop_days) || 0) * dailyRate;
      }
    });
  }

  // Calculate final numbers
  const totalDeductions = empPf + esic + pt + it + lopDeduction + lateDeduction;
  const netPayable = Math.max(0, grossEarnings - totalDeductions);
  
  // --- Update GUI ---
  document.getElementById("ps-emp-name").textContent = employee.name;
  document.getElementById("ps-period").textContent = periodLabel.toUpperCase();
  document.getElementById("ps-emp-designation").textContent = employee.designation || "STAFF MEMBER";
  
  // Earnings
  document.getElementById("ps-earn-basic").textContent = `₹${basicDA.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
  document.getElementById("ps-earn-hra").textContent = `₹${hra.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
  document.getElementById("ps-earn-allowance").textContent = `₹${otherAllow.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
  document.getElementById("ps-earn-gross").textContent = `₹${grossEarnings.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
  
  // Deductions
  document.getElementById("ps-ded-pf").textContent = `₹${empPf.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
  document.getElementById("ps-ded-esic").textContent = `₹${esic.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
  document.getElementById("ps-ded-pt").textContent = `₹${pt.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
  document.getElementById("ps-ded-tds").textContent = `₹${it.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
  
  document.getElementById("ps-lop-count-lbl").textContent = `(${lopDays} ${lopDays === 1 ? 'day' : 'days'})`;
  document.getElementById("ps-ded-lop").textContent = `₹${lopDeduction.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
  
  document.getElementById("ps-late-count-lbl").textContent = `(${lateCount} ${lateCount === 1 ? 'mark' : 'marks'})`;
  document.getElementById("ps-ded-late").textContent = `₹${lateDeduction.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
  
  document.getElementById("ps-ded-total").textContent = `₹${totalDeductions.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
  
  // Net Total
  document.getElementById("ps-net-salary").textContent = `₹${netPayable.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
}

function clearPayslipPreview() {
  document.getElementById("ps-emp-name").textContent = "—";
  document.getElementById("ps-period").textContent = "—";
  document.getElementById("ps-emp-designation").textContent = "—";
  
  document.getElementById("ps-earn-basic").textContent = "₹0.00";
  document.getElementById("ps-earn-hra").textContent = "₹0.00";
  document.getElementById("ps-earn-allowance").textContent = "₹0.00";
  document.getElementById("ps-earn-gross").textContent = "₹0.00";
  
  document.getElementById("ps-ded-pf").textContent = "₹0.00";
  document.getElementById("ps-ded-esic").textContent = "₹0.00";
  document.getElementById("ps-ded-pt").textContent = "₹0.00";
  document.getElementById("ps-ded-tds").textContent = "₹0.00";
  document.getElementById("ps-lop-count-lbl").textContent = "(0 days)";
  document.getElementById("ps-ded-lop").textContent = "₹0.00";
  document.getElementById("ps-late-count-lbl").textContent = "(0 marks)";
  document.getElementById("ps-ded-late").textContent = "₹0.00";
  document.getElementById("ps-ded-total").textContent = "₹0.00";
  document.getElementById("ps-net-salary").textContent = "₹0.00";

  const zeroLopInput = document.getElementById("zero-lop");
  if (zeroLopInput) zeroLopInput.checked = false;
  const zeroLateInput = document.getElementById("zero-late");
  if (zeroLateInput) zeroLateInput.checked = false;
}

// Toast System Notification popup
function showToast(message, type = "success") {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  
  let iconName = "check";
  if (type === "error") iconName = "alert-circle";
  if (type === "info") iconName = "info";
  
  toast.innerHTML = `
    <i data-lucide="${iconName}" style="width: 18px; height: 18px;"></i>
    <span>${message}</span>
  `;
  
  container.appendChild(toast);
  lucide.createIcons();
  
  // Trigger transition
  setTimeout(() => toast.classList.add("active"), 10);
  
  // Remove after 4s
  setTimeout(() => {
    toast.classList.remove("active");
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// --- EMPLOYEE ATTENDANCE REPORT MODAL LOGIC ---
let activeReportUsername = null;

function showEmployeeReport(username) {
  const employee = state.employees.find(e => e.username === username);
  if (!employee) return;
  
  activeReportUsername = username;
  
  // Set profile metadata
  document.getElementById("rep-avatar").textContent = employee.name ? employee.name.charAt(0) : "E";
  document.getElementById("rep-name").textContent = employee.name;
  document.getElementById("rep-designation").textContent = employee.designation || "Staff Member";
  
  // Set select dropdown value to current month if possible
  const payslipMonth = document.getElementById("payslip-month-select").value;
  const monthSelect = document.getElementById("report-month-select");
  if (payslipMonth && Array.from(monthSelect.options).some(opt => opt.value === payslipMonth)) {
    monthSelect.value = payslipMonth;
  } else {
    monthSelect.value = monthSelect.options[0] ? monthSelect.options[0].value : "2026-05"; // fallback
  }
  
  updateEmployeeReport();
  
  document.getElementById("employee-report-modal").classList.add("active");
}

function closeEmployeeReportModal() {
  document.getElementById("employee-report-modal").classList.remove("active");
  activeReportUsername = null;
}

function updateEmployeeReport() {
  if (!activeReportUsername) return;
  const username = activeReportUsername;
  const selectedPeriod = document.getElementById("report-month-select").value; // "YYYY-MM"
  
  const employee = state.employees.find(e => e.username === username);
  if (!employee) return;
  
  const [yearStr, monthStr] = selectedPeriod.split('-');
  const year = parseInt(yearStr, 10);
  const monthIdx = parseInt(monthStr, 10) - 1; // 0-indexed
  
  // Calculate total days in month
  const totalDays = new Date(year, monthIdx + 1, 0).getDate();
  
  // Determine if selected month is current month, to limit future days display
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonthIdx = today.getMonth(); // 0-indexed
  const currentDay = today.getDate();
  
  let maxDay = totalDays;
  if (year === currentYear && monthIdx === currentMonthIdx) {
    maxDay = Math.min(totalDays, currentDay);
  }
  
  // Get employee logs
  const userCheckins = (state.checkins || []).filter(c => 
    c.username === username && 
    c.date.startsWith(selectedPeriod)
  );
  
  const userLeaves = state.leaves.filter(l => 
    l.employeeName.toLowerCase() === employee.name.toLowerCase() && 
    l.status.toLowerCase() === "approved"
  );
  
  const userLops = state.attendance.filter(rec => 
    rec.modalType === "Lop" && 
    rec.data.user_id === employee.id && 
    rec.data.date.startsWith(selectedPeriod)
  );
  
  let presentCount = 0;
  let lateCount = 0;
  let absentCount = 0;
  
  const tbody = document.getElementById("report-table-body");
  tbody.innerHTML = "";
  
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  
  for (let day = 1; day <= maxDay; day++) {
    const dayStr = String(day).padStart(2, '0');
    const dateStr = `${selectedPeriod}-${dayStr}`;
    const dateObj = new Date(year, monthIdx, day);
    const dayOfWeek = dayNames[dateObj.getDay()];
    const isWeekend = dayOfWeek === "Sunday";
    
    // Find check-in punch
    const checkin = userCheckins.find(c => c.date === dateStr);
    
    // Find LOP records for this date
    const lop = userLops.find(l => l.data.date === dateStr);
    
    // Find if date is a Holiday
    const holiday = (state.holidays || []).find(h => h.date === dateStr);
    
    // Find if date falls in any approved leaves
    let isOnLeave = false;
    let leaveCategory = "";
    userLeaves.forEach(l => {
      const parts = l.leavePeriod.split(" to ");
      const startStr = parts[0].trim();
      const endStr = parts[1] ? parts[1].trim() : startStr;
      
      if (dateStr >= startStr && dateStr <= endStr) {
        isOnLeave = true;
        leaveCategory = l.category || "Leave";
      }
    });
    
    let punchTime = "—";
    let statusLabel = "Rest Day";
    let pillClass = "rest";
    let details = "Weekly Off";
    
    if (holiday) {
      statusLabel = "Holiday";
      pillClass = "holiday";
      details = holiday.name;
      if (checkin) {
        punchTime = checkin.punchTime;
        details += ` (Worked: check-in at ${punchTime})`;
      }
    } else if (checkin) {
      punchTime = checkin.punchTime;
      const graceLimit = state.settings.gracePeriod || "09:30:00";
      const lateDeductionAmount = state.settings.lateDeduction !== undefined ? parseFloat(state.settings.lateDeduction) : 250;
      const isLate = punchTime > graceLimit;
      if (isLate) {
        statusLabel = "Late Arrival";
        pillClass = "late";
        const displayTime = graceLimit.split(':').slice(0, 2).join(':');
        details = `Deduction: ₹${lateDeductionAmount} (Punch after ${displayTime})`;
        lateCount++;
        presentCount++;
      } else {
        statusLabel = "On-time";
        pillClass = "ontime";
        details = "Present & On-time";
        presentCount++;
      }
    } else {
      if (lop) {
        statusLabel = "Loss Of Pay";
        pillClass = "lop";
        details = `Unexcused absence (${lop.data.lop_days} days LOP)`;
        absentCount++;
      } else if (isOnLeave) {
        statusLabel = "Leave";
        pillClass = "leave";
        details = `Approved: ${leaveCategory}`;
      } else {
        if (isWeekend) {
          statusLabel = "Weekly Off";
          pillClass = "rest";
          details = "Sunday Rest Day";
        } else {
          statusLabel = "Absent";
          pillClass = "absent";
          details = "No biometric punch recorded";
          absentCount++;
        }
      }
    }
    
    const formattedDate = dateObj.toLocaleDateString("en-US", {
      day: "numeric",
      month: "short"
    });
    
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="font-family: monospace; font-weight: 700;">${formattedDate}</td>
      <td style="color: var(--slate-500); font-weight: 600;">${dayOfWeek}</td>
      <td style="font-family: monospace; font-weight: 700;">${punchTime}</td>
      <td><span class="status-pill ${pillClass}">${statusLabel}</span></td>
      <td style="font-size: 12px; color: var(--slate-600);">${details}</td>
    `;
    tbody.appendChild(tr);
  }
  
  const totalDaysActive = presentCount + absentCount;
  const attendancePercentage = totalDaysActive > 0 ? Math.round((presentCount / totalDaysActive) * 100) : 100;

  document.getElementById("rep-stat-present").textContent = presentCount;
  document.getElementById("rep-stat-late").textContent = lateCount;
  document.getElementById("rep-stat-absent").textContent = absentCount;
  document.getElementById("rep-stat-percent").textContent = attendancePercentage + "%";
  
  lucide.createIcons();
}

// --- HOLIDAY LIST MANAGEMENT LOGIC ---
function renderHolidays() {
  const tbody = document.getElementById("holidays-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";
  
  if (!state.holidays || state.holidays.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--slate-500); padding: 30px;">No holidays registered yet.</td></tr>`;
    return;
  }
  
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  
  state.holidays.forEach(h => {
    // Correcting time zone shifting issues on date parsing
    const [y, m, d] = h.date.split('-');
    const dateObj = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
    const dayOfWeek = dayNames[dateObj.getDay()];
    
    const formattedDate = dateObj.toLocaleDateString("en-US", {
      day: "numeric",
      month: "long",
      year: "numeric"
    });
    
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="font-family: monospace; font-weight: 700; color: var(--slate-900);">${formattedDate}</td>
      <td style="color: var(--slate-500); font-weight: 600;">${dayOfWeek}</td>
      <td style="font-weight: 600; color: var(--slate-800);">${h.name}</td>
      <td style="text-align: right; padding-right: 30px;">
        <button class="btn btn-secondary" style="padding: 6px 12px; border-radius: 8px; font-size: 12px; color: var(--danger); border-color: rgba(220, 38, 38, 0.2);" onclick="deleteHoliday('${h.date}')">
          <i data-lucide="trash-2" style="width: 12px; height: 12px; vertical-align: middle;"></i> Remove
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
  
  lucide.createIcons();
}

function openAddHolidayModal() {
  document.getElementById("hol-add-date").value = "";
  document.getElementById("hol-add-name").value = "";
  document.getElementById("add-holiday-modal").classList.add("active");
}

function closeAddHolidayModal() {
  document.getElementById("add-holiday-modal").classList.remove("active");
}

async function saveHoliday() {
  const date = document.getElementById("hol-add-date").value;
  const name = document.getElementById("hol-add-name").value.trim();
  
  if (!date || !name) {
    showToast("Please enter both holiday date and description.", "error");
    return;
  }
  
  try {
    const res = await fetch("/api/holidays", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, name })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Holiday "${name}" added successfully.`, "success");
      closeAddHolidayModal();
      await refreshAllData();
    } else {
      showToast(`Failed to save holiday: ${data.error}`, "error");
    }
  } catch (err) {
    showToast("Network error. Failed to add holiday.", "error");
  }
}

async function deleteHoliday(date) {
  if (!confirm(`Are you sure you want to remove the holiday on ${date}?`)) {
    return;
  }
  
  try {
    const res = await fetch("/api/holidays/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date })
    });
    const data = await res.json();
    if (data.success) {
      showToast("Holiday removed successfully.", "success");
      await refreshAllData();
    } else {
      showToast(`Failed to remove holiday: ${data.error}`, "error");
    }
  } catch (err) {
    showToast("Network error. Failed to remove holiday.", "error");
  }
}

// --- HOLIDAYS FILE UPLOAD CONTROLS ---
function openUploadHolidaysModal() {
  document.getElementById("hol-file-input").value = "";
  document.getElementById("upload-holidays-modal").classList.add("active");
  setupHolidayDragAndDrop();
}

function closeUploadHolidaysModal() {
  document.getElementById("upload-holidays-modal").classList.remove("active");
}

function handleHolidayFileSelect(e) {
  const files = e.target.files;
  if (files.length > 0) {
    uploadHolidayFile(files[0]);
  }
}

function setupHolidayDragAndDrop() {
  const dropZone = document.getElementById("hol-drop-zone");
  if (!dropZone) return;
  
  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropZone.classList.add("dragover");
    }, false);
  });
  
  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropZone.classList.remove("dragover");
    }, false);
  });
  
  dropZone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length > 0) {
      uploadHolidayFile(files[0]);
    }
  }, false);
}

function uploadHolidayFile(file) {
  const selectedYear = document.getElementById("hol-upload-year").value;
  const isCsv = file.name.toLowerCase().endsWith('.csv');
  const reader = new FileReader();
  
  reader.onload = async function(e) {
    try {
      let json = [];
      if (isCsv) {
        const text = e.target.result;
        const lines = parseCSV(text);
        if (lines.length > 0) {
          const headers = lines[0].map(h => h.toLowerCase().trim().replace(/[^a-z]/g, ''));
          const holidayIdx = headers.findIndex(h => h === 'holiday' || h === 'name' || h === 'description');
          const dateIdx = headers.findIndex(h => h === 'date' || h === 'holidaydate');
          
          if (holidayIdx !== -1 && dateIdx !== -1) {
            for (let i = 1; i < lines.length; i++) {
              const row = lines[i];
              if (row[holidayIdx] && row[dateIdx]) {
                json.push({
                  holiday: row[holidayIdx].trim(),
                  date: row[dateIdx].trim()
                });
              }
            }
          }
        }
      } else {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        json = XLSX.utils.sheet_to_json(worksheet);
      }
      
      const parsedHolidays = [];
      const monthNamesMap = {
        "january": "01", "february": "02", "march": "03", "april": "04", "may": "05", "june": "06",
        "july": "07", "august": "08", "september": "09", "october": "10", "november": "11", "december": "12"
      };

      json.forEach(row => {
        let holidayName = "";
        let dateStr = "";
        
        for (const key of Object.keys(row)) {
          const lowerKey = key.toLowerCase().trim().replace(/[^a-z]/g, '');
          if (lowerKey === 'holiday' || lowerKey === 'name' || lowerKey === 'description') {
            holidayName = String(row[key]).trim();
          }
          if (lowerKey === 'date' || lowerKey === 'holidaydate') {
            dateStr = String(row[key]).trim();
          }
        }
        
        if (holidayName && dateStr) {
          const cleanDate = dateStr.replace(/\s+/g, ' ').trim();
          const spaceIdx = cleanDate.indexOf(' ');
          if (spaceIdx !== -1) {
            const monthName = cleanDate.substring(0, spaceIdx).toLowerCase();
            const dayStr = cleanDate.substring(spaceIdx + 1).trim();
            const monthVal = monthNamesMap[monthName];
            const dayVal = String(parseInt(dayStr, 10)).padStart(2, '0');
            
            if (monthVal && dayVal && !isNaN(dayVal)) {
              const formattedDate = `${selectedYear}-${monthVal}-${dayVal}`;
              parsedHolidays.push({
                date: formattedDate,
                name: holidayName
              });
            }
          }
        }
      });
      
      if (parsedHolidays.length === 0) {
        showToast("No valid holiday records found. Check headers mapping.", "error");
        return;
      }
      
      const response = await fetch("/api/holidays/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year: selectedYear,
          holidays: parsedHolidays
        })
      });
      
      const resData = await response.json();
      if (resData.success) {
        showToast(`Successfully uploaded ${parsedHolidays.length} holidays for ${selectedYear}!`, "success");
        closeUploadHolidaysModal();
        await refreshAllData();
      } else {
        showToast(`Failed to upload holidays: ${resData.error}`, "error");
      }
    } catch (err) {
      showToast("Error reading file or parsing data.", "error");
    }
  };
  
  if (isCsv) {
    reader.readAsText(file);
  } else {
    reader.readAsArrayBuffer(file);
  }
}

// Custom CSV Parser to bypass SheetJS browser CSV anomalies
function parseCSV(text) {
  const lines = [];
  let row = [];
  let inQuotes = false;
  let currentField = '';
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i+1];
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentField += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push(currentField);
      currentField = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      row.push(currentField);
      if (row.length > 0 && row.some(cell => cell.trim() !== '')) {
        lines.push(row);
      }
      row = [];
      currentField = '';
    } else {
      currentField += char;
    }
  }
  
  if (currentField || row.length > 0) {
    row.push(currentField);
    if (row.some(cell => cell.trim() !== '')) {
      lines.push(row);
    }
  }
  
  return lines;
}

// ─────────────────────────────────────────────────────────
// EDIT EMPLOYEE PROFILE
// ─────────────────────────────────────────────────────────
function openEditEmployeeModal(username) {
  const emp = state.employees.find(e => e.username === username);
  if (!emp) return;

  document.getElementById('edit-emp-username').value   = emp.username;
  document.getElementById('edit-emp-name').value       = emp.name || '';
  document.getElementById('edit-emp-username-field').value = emp.username || '';
  document.getElementById('edit-emp-existing-pwd').textContent = emp.plain_password || '—';
  document.getElementById('edit-emp-existing-pwd').style.webkitTextSecurity = 'disc';
  document.getElementById('edit-emp-password').value  = '';

  // Set role
  const roleMap = { employee: 'employee', team_lead: 'team_lead', manager: 'manager', admin: 'admin' };
  const roleEl = document.getElementById('edit-emp-role');
  roleEl.value = roleMap[emp.role] || 'employee';

  // Set KPI type
  const kpiType = emp.employee_type === 'sales' ? 'sales' : emp.employee_type === 'combined' ? 'combined' : 'non-sales';
  selectKpiType(kpiType);

  // Set designation
  const desigEl = document.getElementById('edit-emp-designation');
  const desigOpts = [...desigEl.options].map(o => o.value);
  if (desigOpts.includes(emp.designation)) {
    desigEl.value = emp.designation;
  } else if (emp.designation) {
    const opt = document.createElement('option');
    opt.value = emp.designation; opt.textContent = emp.designation;
    desigEl.appendChild(opt);
    desigEl.value = emp.designation;
  }

  document.getElementById('edit-employee-modal').classList.add('active');
  lucide.createIcons();
}

function closeEditEmployeeModal() {
  document.getElementById('edit-employee-modal').classList.remove('active');
}

function selectKpiType(type) {
  document.querySelectorAll('.kpi-card').forEach(card => {
    card.classList.toggle('selected', card.dataset.type === type);
  });
}

function toggleExistingPwdVisibility() {
  const span = document.getElementById('edit-emp-existing-pwd');
  const icon = document.getElementById('edit-emp-eye-icon');
  const isHidden = span.style.webkitTextSecurity === 'disc';
  span.style.webkitTextSecurity = isHidden ? 'none' : 'disc';
  icon.setAttribute('data-lucide', isHidden ? 'eye-off' : 'eye');
  lucide.createIcons();
}

async function saveEditEmployee() {
  const username  = document.getElementById('edit-emp-username').value;
  const name      = document.getElementById('edit-emp-name').value.trim();
  const role      = document.getElementById('edit-emp-role').value;
  const designation = document.getElementById('edit-emp-designation').value;
  const newPassword = document.getElementById('edit-emp-password').value.trim();
  const kpiSelected = document.querySelector('.kpi-card.selected');
  const employee_type = kpiSelected ? (kpiSelected.dataset.type === 'sales' ? 'sales' : kpiSelected.dataset.type === 'combined' ? 'combined' : 'non-sales') : 'non-sales';

  if (!name) { showToast('Full name is required.', 'error'); return; }

  const body = { name, role, employee_type, designation };
  if (newPassword) body.plain_password = newPassword;

  try {
    const res = await fetch(`/api/employees/${username}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (data.success) {
      showToast(`${name}'s profile updated successfully!`, 'success');
      closeEditEmployeeModal();
      await refreshAllData();
    } else {
      showToast(data.error || 'Update failed.', 'error');
    }
  } catch (err) {
    showToast('Failed to update employee.', 'error');
  }
}

// ─────────────────────────────────────────────────────────
// PERFORMANCE HISTORY
// ─────────────────────────────────────────────────────────
async function openPerfHistoryModal(username, empId, empName) {
  document.getElementById('perf-modal-title').textContent = `${empName}'s Performance History`;
  document.getElementById('perf-history-body').innerHTML = `
    <div style="text-align:center; padding:60px 0; color:var(--slate-400);">
      <div style="font-size:32px; margin-bottom:12px;">⏳</div>
      <p style="font-weight:600;">Fetching performance data from portal...</p>
    </div>`;
  
  // Set hidden inputs for Add Report form
  document.getElementById('perf-add-emp-id').value = empId || '';
  document.getElementById('perf-add-username').value = username || '';
  document.getElementById('perf-add-emp-name').value = empName || '';
  
  // Reset form state to hidden
  document.getElementById('add-perf-form').style.display = 'none';
  const btn = document.getElementById('add-perf-btn');
  btn.innerHTML = `<i data-lucide="plus-circle" style="width:16px; height:16px; margin-right:4px; vertical-align:middle;"></i> Add Report`;
  
  document.getElementById('perf-history-modal').classList.add('active');
  lucide.createIcons();

  try {
    const res = await fetch('/api/performance-history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeId: empId })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed');
    renderPerfHistory(data.reports, empId);
  } catch (err) {
    document.getElementById('perf-history-body').innerHTML = `
      <div style="text-align:center; padding:40px; color:var(--danger);">
        <p style="font-weight:600;">⚠ Could not load performance history.</p>
        <p style="font-size:13px; color:var(--slate-500); margin-top:8px;">${err.message}</p>
      </div>`;
  }
}

function closePerfHistoryModal() {
  document.getElementById('perf-history-modal').classList.remove('active');
}

function toggleAddPerfForm() {
  const form = document.getElementById('add-perf-form');
  const btn = document.getElementById('add-perf-btn');
  const isHidden = form.style.display === 'none';
  
  if (isHidden) {
    form.style.display = 'block';
    btn.innerHTML = `<i data-lucide="eye" style="width:16px; height:16px; margin-right:4px; vertical-align:middle;"></i> View History`;
    
    // Set default audit date to today
    document.getElementById('perf-add-audit-date').value = new Date().toISOString().substring(0, 10);
    // Set default month to current month
    const defaultPeriod = new Date().toISOString().substring(0, 7);
    document.getElementById('perf-add-period').value = defaultPeriod;
    
    // Clear/reset values
    document.getElementById('perf-add-overall').value = '';
    document.getElementById('perf-add-team-score').value = '100';
    document.getElementById('perf-add-init-score').value = '100';
    document.getElementById('perf-add-verified').checked = false;
    
    document.getElementById('perf-add-bl-target').value = '';
    document.getElementById('perf-add-bl-achieved').value = '';
    document.getElementById('perf-add-bl-weight').value = '';
    document.getElementById('perf-add-ipm-target').value = '';
    document.getElementById('perf-add-ipm-achieved').value = '';
    document.getElementById('perf-add-ipm-weight').value = '';
    document.getElementById('perf-add-tasks').value = '';

    // Auto-calculate and fill attendance score
    const username = document.getElementById('perf-add-username').value;
    const attScore = calculateAttendanceScore(username, defaultPeriod);
    document.getElementById('perf-add-att-score').value = attScore;

    // Segment input sections based on employee_type
    const emp = state.employees.find(e => e.username === username);
    const empType = emp ? emp.employee_type : 'non-sales';

    const targetsSection = document.getElementById('perf-kpi-targets-section');
    const tasksSection = document.getElementById('perf-kpi-tasks-section');
    const combinedInfo = document.getElementById('perf-kpi-combined-info');

    if (empType === 'sales') {
      targetsSection.style.display = 'block';
      tasksSection.style.display = 'none';
      combinedInfo.style.display = 'none';
    } else if (empType === 'combined') {
      targetsSection.style.display = 'block';
      tasksSection.style.display = 'block';
      combinedInfo.style.display = 'flex';
    } else {
      // non-sales
      targetsSection.style.display = 'none';
      tasksSection.style.display = 'block';
      combinedInfo.style.display = 'none';
    }
    calculateFormOverall();
  } else {
    form.style.display = 'none';
    btn.innerHTML = `<i data-lucide="plus-circle" style="width:16px; height:16px; margin-right:4px; vertical-align:middle;"></i> Add Report`;
  }
  lucide.createIcons();
}

function calculateAttendanceScore(username, selectedPeriod) {
  const employee = state.employees.find(e => e.username === username);
  if (!employee) return 100;
  
  const [yearStr, monthStr] = selectedPeriod.split('-');
  const year = parseInt(yearStr, 10);
  const monthIdx = parseInt(monthStr, 10) - 1; // 0-indexed
  
  const totalDays = new Date(year, monthIdx + 1, 0).getDate();
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonthIdx = today.getMonth();
  const currentDay = today.getDate();
  
  let maxDay = totalDays;
  if (year === currentYear && monthIdx === currentMonthIdx) {
    maxDay = Math.min(totalDays, currentDay);
  }
  
  const userCheckins = (state.checkins || []).filter(c => 
    c.username === username && 
    c.date.startsWith(selectedPeriod)
  );
  
  const userLeaves = (state.leaves || []).filter(l => 
    l.employeeName.toLowerCase() === employee.name.toLowerCase() && 
    l.status.toLowerCase() === "approved"
  );
  
  const userLops = (state.attendance || []).filter(rec => 
    rec.modalType === "Lop" && 
    rec.data.user_id === employee.id && 
    rec.data.date.startsWith(selectedPeriod)
  );
  
  let presentCount = 0;
  let absentCount = 0;
  
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  
  for (let day = 1; day <= maxDay; day++) {
    const dayStr = String(day).padStart(2, '0');
    const dateStr = `${selectedPeriod}-${dayStr}`;
    const dateObj = new Date(year, monthIdx, day);
    const dayOfWeek = dayNames[dateObj.getDay()];
    const isWeekend = dayOfWeek === "Sunday";
    
    const checkin = userCheckins.find(c => c.date === dateStr);
    const lop = userLops.find(l => l.data.date === dateStr);
    const holiday = (state.holidays || []).find(h => h.date === dateStr);
    
    let isOnLeave = false;
    userLeaves.forEach(l => {
      const parts = l.leavePeriod.split(" to ");
      const startStr = parts[0].trim();
      const endStr = parts[1] ? parts[1].trim() : startStr;
      if (dateStr >= startStr && dateStr <= endStr) isOnLeave = true;
    });
    
    if (holiday) {
      // Holiday doesn't count
    } else if (checkin) {
      presentCount++;
    } else {
      if (lop) {
        absentCount++;
      } else if (isOnLeave) {
        // Leaves do not count as absent
      } else {
        if (!isWeekend) {
          absentCount++;
        }
      }
    }
  }
  
  const totalDaysActive = presentCount + absentCount;
  return totalDaysActive > 0 ? Math.round((presentCount / totalDaysActive) * 100) : 100;
}

function autoFillAttendanceScore() {
  const username = document.getElementById('perf-add-username').value;
  const period = document.getElementById('perf-add-period').value;
  if (username && period) {
    const attScore = calculateAttendanceScore(username, period);
    document.getElementById('perf-add-att-score').value = attScore;
    calculateFormOverall();
  }
}

function calculateFormOverall() {
  const username = document.getElementById('perf-add-username').value;
  const emp = state.employees.find(e => e.username === username);
  const empType = emp ? emp.employee_type : 'non-sales';

  const blTarget = parseFloat(document.getElementById('perf-add-bl-target').value) || 0;
  const blAchieved = parseFloat(document.getElementById('perf-add-bl-achieved').value) || 0;
  const blWeight = parseFloat(document.getElementById('perf-add-bl-weight').value) || 0;

  const ipmTarget = parseFloat(document.getElementById('perf-add-ipm-target').value) || 0;
  const ipmAchieved = parseFloat(document.getElementById('perf-add-ipm-achieved').value) || 0;
  const ipmWeight = parseFloat(document.getElementById('perf-add-ipm-weight').value) || 0;

  let blContrib = 0;
  let ipmContrib = 0;

  const isSalesOrCombined = (empType === 'sales' || empType === 'combined');

  if (isSalesOrCombined) {
    if (blTarget > 0) {
      const blAchvPct = (blAchieved / blTarget) * 100;
      blContrib = Math.min(blAchieved / blTarget, 1) * blWeight;
      document.getElementById('perf-add-bl-calc-info').style.display = 'flex';
      document.getElementById('perf-bl-achv-pct').textContent = `${blAchvPct.toFixed(1)}%`;
      document.getElementById('perf-bl-contrib').textContent = `${blContrib.toFixed(1)}%`;
    } else {
      document.getElementById('perf-add-bl-calc-info').style.display = 'none';
    }

    if (ipmTarget > 0) {
      const ipmAchvPct = (ipmAchieved / ipmTarget) * 100;
      ipmContrib = Math.min(ipmAchieved / ipmTarget, 1) * ipmWeight;
      document.getElementById('perf-add-ipm-calc-info').style.display = 'flex';
      document.getElementById('perf-ipm-achv-pct').textContent = `${ipmAchvPct.toFixed(1)}%`;
      document.getElementById('perf-ipm-contrib').textContent = `${ipmContrib.toFixed(1)}%`;
    } else {
      document.getElementById('perf-add-ipm-calc-info').style.display = 'none';
    }

    const totalWeight = blWeight + ipmWeight;
    document.getElementById('perf-combined-weightage-lbl').textContent = `${totalWeight}% / 90%`;
  } else {
    document.getElementById('perf-add-bl-calc-info').style.display = 'none';
    document.getElementById('perf-add-ipm-calc-info').style.display = 'none';
  }

  const attVal = parseFloat(document.getElementById('perf-add-att-score').value) || 0;
  const teamVal = parseFloat(document.getElementById('perf-add-team-score').value) || 0;
  const initVal = parseFloat(document.getElementById('perf-add-init-score').value) || 0;

  let overallVal = 0;
  if (isSalesOrCombined) {
    const attContrib = (attVal / 100) * 5;
    const teamContrib = (teamVal / 100) * 2.5;
    const initContrib = (initVal / 100) * 2.5;
    overallVal = Math.round(blContrib + ipmContrib + attContrib + teamContrib + initContrib);
  } else {
    overallVal = Math.round((attVal * 0.5) + (teamVal * 0.25) + (initVal * 0.25));
  }

  document.getElementById('perf-add-overall').value = overallVal;
}

function updateCombinedWeightage() {
  calculateFormOverall();
}

async function savePerfReport() {
  const empId = document.getElementById('perf-add-emp-id').value;
  const username = document.getElementById('perf-add-username').value;
  const empName = document.getElementById('perf-add-emp-name').value;
  const period = document.getElementById('perf-add-period').value;
  const auditDate = document.getElementById('perf-add-audit-date').value;
  const overall = document.getElementById('perf-add-overall').value;
  const attendance = document.getElementById('perf-add-att-score').value;
  const teamwork = document.getElementById('perf-add-team-score').value;
  const initiative = document.getElementById('perf-add-init-score').value;
  const verified = document.getElementById('perf-add-verified').checked;

  const blTarget = document.getElementById('perf-add-bl-target').value;
  const blAchieved = document.getElementById('perf-add-bl-achieved').value;
  const blWeight = document.getElementById('perf-add-bl-weight').value;
  const ipmTarget = document.getElementById('perf-add-ipm-target').value;
  const ipmAchieved = document.getElementById('perf-add-ipm-achieved').value;
  const ipmWeight = document.getElementById('perf-add-ipm-weight').value;
  const tasksText = document.getElementById('perf-add-tasks').value;

  if (!period) {
    showToast('Please select the month/period.', 'error');
    return;
  }
  if (!auditDate) {
    showToast('Please select the audit date.', 'error');
    return;
  }
  if (overall === '') {
    showToast('Please enter the overall performance score.', 'error');
    return;
  }

  const payload = {
    employeeId: empId,
    username,
    period,
    audit_date: auditDate,
    overall_score: parseFloat(overall),
    attendance_score: parseFloat(attendance) || 100,
    teamwork_score: parseFloat(teamwork) || 100,
    initiative_score: parseFloat(initiative) || 100,
    is_verified: verified
  };

  // Only send targets if targets section is visible
  const targetsSectionVisible = document.getElementById('perf-kpi-targets-section').style.display !== 'none';
  if (targetsSectionVisible) {
    if (blTarget !== '') payload.buy_lead_target = parseFloat(blTarget);
    if (blAchieved !== '') payload.buy_lead_achieved = parseFloat(blAchieved);
    if (blWeight !== '') payload.buy_lead_weight = parseFloat(blWeight);
    if (ipmTarget !== '') payload.ipm_target = parseFloat(ipmTarget);
    if (ipmAchieved !== '') payload.ipm_achieved = parseFloat(ipmAchieved);
    if (ipmWeight !== '') payload.ipm_weight = parseFloat(ipmWeight);
  }

  // Only send tasks if tasks section is visible
  const tasksSectionVisible = document.getElementById('perf-kpi-tasks-section').style.display !== 'none';
  if (tasksSectionVisible && tasksText.trim() !== '') {
    const tasksArray = tasksText.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => ({ t: line, c: true, r: "" }));
    payload.tasks = JSON.stringify(tasksArray);
  }

  try {
    const res = await fetch('/api/performance-history/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      showToast('Performance report saved successfully.', 'success');
      toggleAddPerfForm();
      document.getElementById('perf-history-body').innerHTML = `
        <div style="text-align:center; padding:60px 0; color:var(--slate-400);">
          <i data-lucide="loader" style="width:32px;height:32px; animation:spin 1s linear infinite;"></i>
          <p style="margin-top:12px; font-weight:600;">Reloading performance data...</p>
        </div>`;
      lucide.createIcons();
      
      const refreshRes = await fetch('/api/performance-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId: empId })
      });
      const refreshData = await refreshRes.json();
      if (refreshData.success) {
        renderPerfHistory(refreshData.reports, empId);
      } else {
        throw new Error(refreshData.error || 'Refresh failed');
      }
    } else {
      showToast(data.error || 'Failed to save performance report.', 'error');
    }
  } catch (err) {
    showToast(err.message || 'Error saving performance report.', 'error');
  }
}

function renderPerfHistory(reports, empId) {
  const container = document.getElementById('perf-history-body');
  const empReports = reports.filter(r => !empId || r.user_id === empId || r.user_id == empId);

  if (empReports.length === 0) {
    container.innerHTML = `<div style="text-align:center; padding:40px; color:var(--slate-400); font-weight:600;">No performance reports found for this employee.</div>`;
    return;
  }

  const scoreColor = s => s >= 80 ? '#059669' : s >= 60 ? '#d97706' : '#dc2626';
  const badgeHtml = r => {
    const score = parseFloat(r.overall_score) || 0;
    if (score >= 85) return `<span style="display:inline-flex;align-items:center;gap:5px;background:#fef9c3;color:#854d0e;border-radius:20px;padding:4px 12px;font-size:11px;font-weight:700;">⭐ STAR PERFORMER</span>`;
    if (score >= 70) return `<span style="display:inline-flex;align-items:center;gap:5px;background:#dcfce7;color:#166534;border-radius:20px;padding:4px 12px;font-size:11px;font-weight:700;">✓ ON TRACK</span>`;
    return `<span style="display:inline-flex;align-items:center;gap:5px;background:#fee2e2;color:#991b1b;border-radius:20px;padding:4px 12px;font-size:11px;font-weight:700;">⚠ NEEDS ATTENTION</span>`;
  };

  const monthName = period => {
    if (!period) return '—';
    const [y, m] = period.split('-');
    return `${MONTH_NAMES[parseInt(m,10)-1]} ${y}`;
  };

  container.innerHTML = empReports.map(r => {
    const score = parseFloat(r.overall_score) || 0;
    const period = r.period || r.month || '';
    const auditDate = r.audit_date || r.created_at || '';
    const isVerified = r.is_verified || r.verified || false;

    // Build KPI detail section
    let kpiHtml = '';
    if (r.buy_lead_target || r.ipm_target) {
      const blAchv = parseFloat(r.buy_lead_achieved) || 0;
      const blTarget = parseFloat(r.buy_lead_target) || 0;
      const blPct = blTarget > 0 ? Math.round((blAchv / blTarget) * 100) : 0;
      const blWeight = r.buy_lead_weight || 80;

      const ipmAchv = parseFloat(r.ipm_achieved) || 0;
      const ipmTarget = parseFloat(r.ipm_target) || 0;
      const ipmPct = ipmTarget > 0 ? Math.round((ipmAchv / ipmTarget) * 100) : 0;
      const ipmWeight = r.ipm_weight || 10;

      kpiHtml = `
        <div style="background:#fafafa;border:1px solid var(--slate-200);border-radius:16px;padding:20px;margin-bottom:16px;">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
            <div style="width:32px;height:32px;border-radius:10px;background:#f3e8ff;display:flex;align-items:center;justify-content:center;">
              <span style="font-size:16px;">🧩</span>
            </div>
            <span style="font-size:13px;font-weight:700;letter-spacing:.05em;color:var(--slate-600);">COMBINED KPI DETAILS</span>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div style="background:white;border:1px solid var(--slate-200);border-radius:12px;padding:14px;">
              <p style="font-size:11px;font-weight:800;color:var(--slate-700);margin-bottom:8px;">BUY LEAD <span style="color:#d97706;font-weight:700;">(${blWeight}%)</span></p>
              <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;">
                <div><p style="font-size:9px;font-weight:700;color:var(--slate-400);text-transform:uppercase;">Target</p><p style="font-size:18px;font-weight:800;color:var(--slate-900);">${blTarget}</p></div>
                <div><p style="font-size:9px;font-weight:700;color:var(--slate-400);text-transform:uppercase;">Achieved</p><p style="font-size:18px;font-weight:800;color:${blAchv>=blTarget?'#059669':'#dc2626'};">${blAchv}</p></div>
                <div><p style="font-size:9px;font-weight:700;color:var(--slate-400);text-transform:uppercase;">Achv %</p><p style="font-size:18px;font-weight:800;color:var(--slate-900);">${blPct}%</p></div>
              </div>
            </div>
            <div style="background:white;border:1px solid var(--slate-200);border-radius:12px;padding:14px;">
              <p style="font-size:11px;font-weight:800;color:var(--slate-700);margin-bottom:8px;">IPM <span style="color:#7c3aed;font-weight:700;">(${ipmWeight}%)</span></p>
              <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;">
                <div><p style="font-size:9px;font-weight:700;color:var(--slate-400);text-transform:uppercase;">Target</p><p style="font-size:18px;font-weight:800;color:var(--slate-900);">${ipmTarget}</p></div>
                <div><p style="font-size:9px;font-weight:700;color:var(--slate-400);text-transform:uppercase;">Achieved</p><p style="font-size:18px;font-weight:800;color:${ipmAchv>=ipmTarget?'#059669':'#dc2626'};">${ipmAchv}</p></div>
                <div><p style="font-size:9px;font-weight:700;color:var(--slate-400);text-transform:uppercase;">Achv %</p><p style="font-size:18px;font-weight:800;color:var(--slate-900);">${ipmPct}%</p></div>
              </div>
            </div>
          </div>
        </div>`;
    }

    // Render tasks list if present
    let tasksHtml = '';
    if (r.tasks) {
      try {
        const tasksList = typeof r.tasks === 'string' ? JSON.parse(r.tasks) : r.tasks;
        if (Array.isArray(tasksList) && tasksList.length > 0) {
          const isTargetList = tasksList.every(t => t.type === 'target');
          if (!isTargetList) {
            const listItems = tasksList.map(t => {
              const completed = t.c !== undefined ? t.c : (t.completed !== undefined ? t.completed : true);
              const checked = completed ? '✓' : '✗';
              const color = completed ? '#059669' : '#dc2626';
              return `<li style="font-size:12px;color:var(--slate-700);margin-bottom:6px;display:flex;align-items:flex-start;gap:8px;">
                <span style="font-weight:bold;color:${color};font-family:monospace;font-size:14px;line-height:1;">${checked}</span>
                <span>${t.t || t.task || ''}</span>
              </li>`;
            }).join('');

            tasksHtml = `
              <div style="background:#fafafa;border:1px solid var(--slate-200);border-radius:16px;padding:20px;margin-bottom:16px;">
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
                  <div style="width:32px;height:32px;border-radius:10px;background:#e0f2fe;display:flex;align-items:center;justify-content:center;">
                    <span style="font-size:16px;">📋</span>
                  </div>
                  <span style="font-size:13px;font-weight:700;letter-spacing:.05em;color:var(--slate-600);">TASKS / DELIVERABLES</span>
                </div>
                <ul style="margin:0;padding:0;list-style:none;">
                  ${listItems}
                </ul>
              </div>`;
          }
        }
      } catch (e) {
        console.error('Error parsing tasks in report:', e);
      }
    }

    // Behavioural scores
    const attScore = parseFloat(r.attendance_score) || 0;
    const teamScore = parseFloat(r.teamwork_score) || 0;
    const initScore = parseFloat(r.initiative_score) || 0;
    const scoreBar = (val, color) => `<div style="height:4px;background:#e2e8f0;border-radius:4px;margin-top:6px;"><div style="height:4px;background:${color};border-radius:4px;width:${Math.min(val,100)}%;"></div></div>`;

    const auditDateFormatted = auditDate ? new Date(auditDate).toLocaleDateString('en-IN', {day:'numeric',month:'short',year:'numeric'}) : '—';

    return `
      <div style="border:2px solid var(--slate-200);border-radius:20px;padding:24px;margin-bottom:20px;position:relative;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">
          <div>
            <h3 style="font-family:'Outfit',sans-serif;font-size:24px;font-weight:800;color:var(--slate-900);margin-bottom:6px;">${monthName(period)}</h3>
            <div style="display:flex;gap:8px;align-items:center;">
              ${isVerified ? '<span style="display:inline-flex;align-items:center;gap:5px;background:#f1f5f9;color:var(--slate-600);border-radius:20px;padding:4px 12px;font-size:11px;font-weight:700;">● VERIFIED REPORT</span>' : ''}
            </div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;">
            <span style="font-family:'Outfit',sans-serif;font-size:36px;font-weight:900;color:${scoreColor(score)};">${score}</span>
            ${badgeHtml(r)}
          </div>
        </div>

        ${kpiHtml}
        ${tasksHtml}

        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px;">
          <div style="border:2px solid #fef3c7;border-radius:14px;padding:14px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
              <span style="font-size:10px;font-weight:700;letter-spacing:.06em;color:var(--slate-600);">ATTENDANCE</span>
              <span style="font-size:16px;">👥</span>
            </div>
            <p style="font-size:24px;font-weight:800;color:var(--slate-900);">${attScore}</p>
            ${scoreBar(attScore, '#f59e0b')}
          </div>
          <div style="border:2px solid #ede9fe;border-radius:14px;padding:14px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
              <span style="font-size:10px;font-weight:700;letter-spacing:.06em;color:var(--slate-600);">TEAMWORK</span>
              <span style="font-size:16px;">🤝</span>
            </div>
            <p style="font-size:24px;font-weight:800;color:var(--slate-900);">${teamScore}</p>
            ${scoreBar(teamScore, '#7c3aed')}
          </div>
          <div style="border:2px solid #dcfce7;border-radius:14px;padding:14px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
              <span style="font-size:10px;font-weight:700;letter-spacing:.06em;color:var(--slate-600);">INITIATIVE</span>
              <span style="font-size:16px;">🚀</span>
            </div>
            <p style="font-size:24px;font-weight:800;color:var(--slate-900);">${initScore}</p>
            ${scoreBar(initScore, '#059669')}
          </div>
        </div>

        <div style="display:flex;align-items:center;gap:10px;">
          <div style="width:32px;height:32px;border-radius:10px;background:var(--slate-100);display:flex;align-items:center;justify-content:center;">
            <i data-lucide="calendar" style="width:14px;height:14px;color:var(--slate-500);"></i>
          </div>
          <div>
            <p style="font-size:10px;font-weight:700;color:var(--slate-400);text-transform:uppercase;letter-spacing:.05em;">Audit Date</p>
            <p style="font-size:13px;font-weight:700;color:var(--slate-900);">${auditDateFormatted}</p>
          </div>
        </div>
      </div>`;
  }).join('');

  lucide.createIcons();
}

// ─────────────────────────────────────────────────────────
// ACTIVITY LOGS
// ─────────────────────────────────────────────────────────
let _cachedLogs = [];

async function renderActivityLogs() {
  try {
    const res = await fetch('/api/logs');
    _cachedLogs = await res.json();
    renderLogsTable(_cachedLogs);
    updateLogStats(_cachedLogs);
  } catch (err) {
    showToast('Failed to load activity logs.', 'error');
  }
}

function updateLogStats(logs) {
  document.getElementById('log-stat-total').textContent   = logs.length;
  document.getElementById('log-stat-logins').textContent  = logs.filter(l => l.category === 'SYNC').length;
  document.getElementById('log-stat-updates').textContent = logs.filter(l => l.category === 'UPDATE').length;
  document.getElementById('log-stat-mods').textContent    = logs.filter(l => l.category === 'DELETE' || l.category === 'INFO').length;
}

function renderLogsTable(logs) {
  const tbody = document.getElementById('logs-table-body');
  if (!logs.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:40px;color:var(--slate-400);">No activity logs yet.</td></tr>`;
    return;
  }

  const catStyle = cat => {
    switch(cat) {
      case 'SYNC':   return 'background:#dcfce7;color:#166534;';
      case 'UPDATE': return 'background:#fef3c7;color:#854d0e;';
      case 'DELETE': return 'background:#fee2e2;color:#991b1b;';
      case 'INFO':   return 'background:#e0f2fe;color:#0369a1;';
      default:       return 'background:#f1f5f9;color:#475569;';
    }
  };

  tbody.innerHTML = logs.map(log => {
    const ts = new Date(log.timestamp);
    const timeAgo = (() => {
      const diff = Date.now() - ts.getTime();
      if (diff < 60000) return `${Math.floor(diff/1000)}s ago`;
      if (diff < 3600000) return `${Math.floor(diff/60000)}m ago`;
      if (diff < 86400000) return `${Math.floor(diff/3600000)}h ago`;
      return `${Math.floor(diff/86400000)}d ago`;
    })();
    const dateStr = ts.toLocaleDateString('en-IN', {day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit'});
    const initial = log.actor ? log.actor.charAt(0).toUpperCase() : '?';

    return `<tr>
      <td>
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="width:8px;height:8px;border-radius:50%;background:var(--success);display:inline-block;flex-shrink:0;"></span>
          <div>
            <div style="font-weight:700;color:var(--slate-900);">${timeAgo}</div>
            <div style="font-size:11px;color:var(--slate-400);">${dateStr}</div>
          </div>
        </div>
      </td>
      <td>
        <span style="display:inline-flex;align-items:center;gap:5px;padding:5px 11px;border-radius:20px;font-size:11px;font-weight:700;${catStyle(log.category)}">${log.category}</span>
      </td>
      <td>
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="width:28px;height:28px;border-radius:8px;background:linear-gradient(135deg,var(--primary),#b865f7);color:white;font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${initial}</div>
          <span style="font-weight:600;color:var(--slate-800);font-size:13px;">${log.actor}</span>
        </div>
      </td>
      <td style="color:var(--slate-700);">${log.description}</td>
      <td style="font-size:11px;color:var(--slate-500);font-family:monospace;">${log.ip || '—'}</td>
    </tr>`;
  }).join('');
}

async function filterLogs() {
  const category = document.getElementById('log-filter-category').value;
  const actor    = document.getElementById('log-filter-actor').value.trim();
  const from     = document.getElementById('log-filter-from').value;
  const to       = document.getElementById('log-filter-to').value;
  const q        = document.getElementById('log-filter-q').value.trim();

  const params = new URLSearchParams();
  if (category !== 'ALL') params.set('category', category);
  if (actor)  params.set('actor', actor);
  if (from)   params.set('from', from);
  if (to)     params.set('to', to);
  if (q)      params.set('q', q);

  try {
    const res = await fetch('/api/logs?' + params.toString());
    const logs = await res.json();
    renderLogsTable(logs);
  } catch (err) {
    showToast('Failed to filter logs.', 'error');
  }
}

function clearLogFilters() {
  document.getElementById('log-filter-category').value = 'ALL';
  document.getElementById('log-filter-actor').value    = '';
  document.getElementById('log-filter-from').value     = '';
  document.getElementById('log-filter-to').value       = '';
  document.getElementById('log-filter-q').value        = '';
  renderLogsTable(_cachedLogs);
}
