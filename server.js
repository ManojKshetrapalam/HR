const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Paths to database files
const DATA_DIR = path.join(__dirname, 'data');
const PATHS = {
  employees: path.join(DATA_DIR, 'employees.json'),
  leaves: path.join(DATA_DIR, 'leaves.json'),
  attendance: path.join(DATA_DIR, 'attendance.json'),
  salaries: path.join(DATA_DIR, 'salaries.json'),
  checkins: path.join(DATA_DIR, 'checkins.json'),
  holidays: path.join(DATA_DIR, 'holidays.json'),
  performance: path.join(DATA_DIR, 'performance.json')
};

// Ensure data folder exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Seed default holidays if they don't exist
if (!fs.existsSync(PATHS.holidays)) {
  const seedHolidays = [
    { date: "2026-01-01", name: "New Year's Day" },
    { date: "2026-01-26", name: "Republic Day" },
    { date: "2026-05-01", name: "May Day" },
    { date: "2026-08-15", name: "Independence Day" },
    { date: "2026-10-02", name: "Gandhi Jayanti" },
    { date: "2026-11-01", name: "Kannada Rajyotsava" },
    { date: "2026-12-25", name: "Christmas" }
  ];
  try {
    fs.writeFileSync(PATHS.holidays, JSON.stringify(seedHolidays, null, 2), 'utf8');
  } catch (err) {
    console.error('Error seeding holidays:', err);
  }
}

// Helpers to read/write JSON files safely
function readJSON(filePath, defaultVal = []) {
  if (!fs.existsSync(filePath)) return defaultVal;
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error(`Error reading file ${filePath}:`, err);
    return defaultVal;
  }
}

function writeJSON(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error(`Error writing file ${filePath}:`, err);
    return false;
  }
}

function decodeEntities(encodedString) {
  return encodedString
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'");
}

// ZKTeco easy TimePro Encryption helpers
function zk_encrypt(key, str) {
  const s = [];
  let j = 0;
  let x;
  let res = "";
  for (let i = 0; i < 256; i++) {
    s[i] = i;
  }
  for (let i = 0; i < 256; i++) {
    j = (j + s[i] + key.charCodeAt(i % key.length)) % 256;
    x = s[i];
    s[i] = s[j];
    s[j] = x;
  }
  let i = 0;
  j = 0;
  for (let y = 0; y < str.length; y++) {
    i = (i + 1) % 256;
    j = (j + s[i]) % 256;
    x = s[i];
    s[i] = s[j];
    s[j] = x;
    res += String.fromCharCode(str.charCodeAt(y) ^ s[(s[i] + s[j]) % 256]);
  }
  return res;
}

function zkEncrypt(data, key) {
  const tmp = zk_encrypt(key, data);
  return Buffer.from(tmp, 'binary').toString('base64');
}

// Scrapers for data
function parseEmployees(html) {
  let lastIdx = 0;
  const employees = [];
  const seenIds = new Set();

  while (true) {
    const idx = html.indexOf('openPerformanceModal(', lastIdx);
    if (idx === -1) break;
    
    const startParamIdx = idx + 'openPerformanceModal('.length;
    let paramStr = '';
    let braceCount = 0;
    let started = false;
    
    for (let i = startParamIdx; i < html.length; i++) {
      const char = html[i];
      paramStr += char;
      if (char === '{') {
        braceCount++;
        started = true;
      } else if (char === '}') {
        braceCount--;
        if (started && braceCount === 0) {
          break;
        }
      }
    }
    
    try {
      const decoded = decodeEntities(paramStr);
      const emp = JSON.parse(decoded);
      if (emp && emp.id && !seenIds.has(emp.id)) {
        seenIds.add(emp.id);
        employees.push(emp);
      }
    } catch (err) {
      // Ignored
    }
    lastIdx = idx + 1;
  }
  return employees;
}

function parseLeaves(html) {
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let match;
  const leaves = [];
  const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;

  function cleanText(text) {
    return text
      .replace(/<[^>]+>/g, '')
      .trim()
      .replace(/\s+/g, ' ');
  }

  while ((match = trRegex.exec(html)) !== null) {
    const trContent = match[1];
    if (!trContent.includes('<td')) continue;
    
    const cells = [];
    let tdMatch;
    tdRegex.lastIndex = 0;
    while ((tdMatch = tdRegex.exec(trContent)) !== null) {
      cells.push(tdMatch[1]);
    }
    
    if (cells.length >= 6) {
      const empCell = cells[0];
      const nameMatch = empCell.match(/text-slate-900[^>]*>([\s\S]*?)<\/p>/i);
      const name = nameMatch ? cleanText(nameMatch[1]) : cleanText(empCell);
      
      const desigMatch = empCell.match(/text-slate-505*[^>]*>([\s\S]*?)<\/p>/i) || empCell.match(/text-xs text-slate-500 font-bold[^>]*>([\s\S]*?)<\/p>/i);
      const designation = desigMatch ? cleanText(desigMatch[1]) : '';
      
      const leavePeriod = cleanText(cells[1]);
      const category = cleanText(cells[2]);
      const duration = cleanText(cells[3]);
      
      const reasonCell = cells[4];
      const reasonMatch = reasonCell.match(/onclick="viewReasonModalText\(`([\s\S]*?)`,\s*`([\s\S]*?)`,\s*(\d+)\)"/i);
      let reason = cleanText(reasonCell);
      let userId = null;
      if (reasonMatch) {
        reason = reasonMatch[1].trim();
        userId = parseInt(reasonMatch[3], 10);
      }
      
      const status = cleanText(cells[5]);
      
      leaves.push({
        employeeName: name,
        designation,
        userId,
        leavePeriod,
        category,
        duration,
        reason,
        status
      });
    }
  }
  return leaves;
}

function parseAttendance(html) {
  const regex = /openEdit([a-zA-Z]+)Modal\(([\s\S]*?)\)/g;
  let match;
  const records = [];
  const seenIds = new Set();

  while ((match = regex.exec(html)) !== null) {
    const modalType = match[1];
    if (modalType !== 'Late' && modalType !== 'Lop') continue;
    try {
      const decoded = decodeEntities(match[2].trim());
      const obj = JSON.parse(decoded);
      if (obj && obj.id) {
        const key = `${modalType}_${obj.id}`;
        if (!seenIds.has(key)) {
          seenIds.add(key);
          records.push({ modalType, data: obj });
        }
      }
    } catch (err) {
      let braceCount = 0;
      let paramStr = '';
      let started = false;
      const rawParam = match[2];
      for (let i = 0; i < rawParam.length; i++) {
        const char = rawParam[i];
        paramStr += char;
        if (char === '{') {
          braceCount++;
          started = true;
        } else if (char === '}') {
          braceCount--;
          if (started && braceCount === 0) {
            break;
          }
        }
      }
      try {
        const decoded = decodeEntities(paramStr);
        const obj = JSON.parse(decoded);
        if (obj && obj.id) {
          const key = `${modalType}_${obj.id}`;
          if (!seenIds.has(key)) {
            seenIds.add(key);
            records.push({ modalType, data: obj });
          }
        }
      } catch (e) {
        // Safe to ignore definitions
      }
    }
  }
  return records;
}

// REST API Endpoints

// 1. Get current sync status
app.get('/api/status', (req, res) => {
  const status = {};
  for (const [key, filePath] of Object.entries(PATHS)) {
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      const data = readJSON(filePath);
      status[key] = {
        exists: true,
        lastUpdated: stats.mtime,
        count: Array.isArray(data) ? data.length : Object.keys(data).length
      };
    } else {
      status[key] = { exists: false };
    }
  }
  res.json(status);
});

// 2. Perform live sync
app.post('/api/sync', async (req, res) => {
  const username = req.body.username || 'admin';
  const password = req.body.password || 'admin';
  const selectedMonth = req.body.month || new Date().toISOString().substring(0, 7);

  const loginUrl = 'https://varietyvintage.com/employee/login';
  const mainUrl = 'https://varietyvintage.com/employee';
  
  const urls = {
    employees: 'https://varietyvintage.com/employee/admin/employees',
    leaves: 'https://varietyvintage.com/employee/admin/leaves',
    attendance: 'https://varietyvintage.com/employee/admin/attendance'
  };

  try {
    console.log('Sync initiated: Fetching initial login page...');
    const initialRes = await fetch(mainUrl);
    if (!initialRes.ok) throw new Error(`Initial page returned status ${initialRes.status}`);
    const initialText = await initialRes.text();
    
    const setCookieHeaders = initialRes.headers.getSetCookie();
    const cookies = setCookieHeaders.map(c => c.split(';')[0]).join('; ');
    
    const tokenMatch = initialText.match(/name="_token"\s+value="([^"]+)"/);
    if (!tokenMatch) throw new Error('CSRF token not found on varietyvintage page.');
    const token = tokenMatch[1];

    console.log('Sync: Authenticating with credentials...');
    const loginBody = new URLSearchParams({
      _token: token,
      username: username,
      password: password
    });

    const loginRes = await fetch(loginUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': cookies,
        'Referer': mainUrl
      },
      body: loginBody,
      redirect: 'manual'
    });

    if (loginRes.status !== 302) {
      throw new Error(`Authentication failed with status code ${loginRes.status}. Check credentials.`);
    }

    const loginCookies = loginRes.headers.getSetCookie();
    const allCookiesMap = new Map();
    cookies.split('; ').forEach(c => {
      const [k, v] = c.split('=');
      if (k && v) allCookiesMap.set(k, v);
    });
    loginCookies.forEach(c => {
      const [k, v] = c.split(';')[0].split('=');
      if (k && v) allCookiesMap.set(k, v);
    });
    const combinedCookies = [...allCookiesMap.entries()].map(([k, v]) => `${k}=${v}`).join('; ');

    // Fetch and parse employees
    console.log('Sync: Fetching employee database...');
    const empRes = await fetch(urls.employees, { headers: { 'Cookie': combinedCookies } });
    const empHtml = await empRes.text();
    const employees = parseEmployees(empHtml);
    writeJSON(PATHS.employees, employees);

    // Fetch and parse leaves
    console.log('Sync: Fetching leave logs...');
    const leaveRes = await fetch(urls.leaves, { headers: { 'Cookie': combinedCookies } });
    const leaveHtml = await leaveRes.text();
    const leaves = parseLeaves(leaveHtml);
    writeJSON(PATHS.leaves, leaves);

    // Fetch and parse attendance
    console.log('Sync: Fetching attendance logs...');
    const attRes = await fetch(urls.attendance, { headers: { 'Cookie': combinedCookies } });
    const attHtml = await attRes.text();
    const attendance = parseAttendance(attHtml);
    
    // Keep only LOP records from the external portal to avoid double-counting
    const lopAttendance = attendance.filter(r => r.modalType === 'Lop');

    // Sync with ZKTeco Easy TimePro Biometric attendance system
    let biometricLateCount = 0;
    try {
      if (process.env.BIOMETRIC_SYNC_MODE === 'push') {
        throw new Error('Biometric direct fetch is disabled (running in push mode).');
      }
      console.log('Sync: Fetching Biometric Attendance from http://192.168.0.233...');
      const etMainUrl = 'http://192.168.0.233/';
      const etLoginUrl = 'http://192.168.0.233/login/';
      
      const etInitialRes = await fetch(etMainUrl);
      const etInitialText = await etInitialRes.text();
      const etTokenMatch = etInitialText.match(/name='csrfmiddlewaretoken'\s+value='([^']+)'/) || etInitialText.match(/name="csrfmiddlewaretoken"\s+value="([^"]+)"/);
      if (!etTokenMatch) throw new Error('CSRF token not found on easy TimePro page.');
      const etToken = etTokenMatch[1];
      
      const etSetCookieHeaders = etInitialRes.headers.getSetCookie();
      const etCookies = etSetCookieHeaders.map(c => c.split(';')[0]).join('; ');
      
      const etSerializeData = 'username=admin&password=admin&template10=&login_type=pwd';
      const etEncryptedData = zkEncrypt(etSerializeData, etToken);
      
      const etLoginBody = new URLSearchParams({
        encrypt_data: etEncryptedData,
        csrfmiddlewaretoken: etToken
      });
      
      const etLoginRes = await fetch(etLoginUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cookie': etCookies,
          'Referer': etLoginUrl
        },
        body: etLoginBody,
        redirect: 'manual'
      });
      
      const etLoginCookiesHeaders = etLoginRes.headers.getSetCookie();
      const etCookiesMap = new Map();
      etCookies.split('; ').forEach(c => {
        const [k, v] = c.split('=');
        if (k && v) etCookiesMap.set(k, v);
      });
      etLoginCookiesHeaders.forEach(c => {
        const [k, v] = c.split(';')[0].split('=');
        if (k && v) etCookiesMap.set(k, v);
      });
      const etCombinedCookies = [...etCookiesMap.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
      
      // Fetch Easy TimePro employees to map emp_code to internal employee records
      console.log('Sync: Fetching easy TimePro employees...');
      const etEmpRes = await fetch('http://192.168.0.233/personnel/employee/table/?page=1&limit=100', {
        headers: { 'Cookie': etCombinedCookies }
      });
      const etEmpData = await etEmpRes.json();
      const etEmployees = etEmpData.data || [];
      
      // Helper function to match employee names dynamically
      function matchEmpCode(sysEmp, etEmps) {
        const sysClean = sysEmp.name.toLowerCase().replace(/[^a-z]/g, '');
        for (const e of etEmps) {
          const etClean = (e.first_name + ' ' + (e.last_name || '')).toLowerCase().replace(/[^a-z]/g, '');
          if (etClean.includes(sysClean) || sysClean.includes(etClean)) {
            return e.emp_code;
          }
        }
        for (const e of etEmps) {
          const etFirstName = e.first_name.toLowerCase().replace(/[^a-z]/g, '');
          if (sysClean.startsWith(etFirstName) || etFirstName.startsWith(sysClean)) {
            return e.emp_code;
          }
        }
        return null;
      }
      
      const empCodeToUserMap = new Map();
      const salaries = readJSON(PATHS.salaries, []);
      
      employees.forEach(emp => {
        const code = matchEmpCode(emp, etEmployees);
        if (code) {
          if (empCodeToUserMap.has(code)) {
            const existingEmp = empCodeToUserMap.get(code);
            const empHasSalary = salaries.some(s => s.username === emp.username);
            const existingHasSalary = salaries.some(s => s.username === existingEmp.username);
            
            if (empHasSalary && !existingHasSalary) {
              empCodeToUserMap.set(code, emp);
            } else if (!empHasSalary && existingHasSalary) {
              // Keep existing
            } else {
              if (emp.id < existingEmp.id) {
                empCodeToUserMap.set(code, emp);
              }
            }
          } else {
            empCodeToUserMap.set(code, emp);
          }
        }
      });
      
      // Fetch punch logs starting from the first of the selected month
      const startDateStr = `${selectedMonth}-01`;
      
      console.log(`Sync: Fetching easy TimePro punches starting from ${startDateStr}...`);
      const etPunchesRes = await fetch(`http://192.168.0.233/iclock/transaction/table/?page=1&limit=5000&_p_upload_time__gte=${startDateStr}`, {
        headers: { 'Cookie': etCombinedCookies }
      });
      const etPunchesData = await etPunchesRes.json();
      let punches = etPunchesData.data || [];
      
      // Filter punches to only keep those belonging to the selected month
      punches = punches.filter(p => p.transaction_punch_date && p.transaction_punch_date.startsWith(selectedMonth));
      
      // Group punches by emp_code and date
      const groupedPunches = {};
      punches.forEach(p => {
        if (!p.emp_code || !p.transaction_punch_date || !p.transaction_punch_time) return;
        const key = `${p.emp_code}_${p.transaction_punch_date}`;
        if (!groupedPunches[key]) groupedPunches[key] = [];
        groupedPunches[key].push(p.transaction_punch_time);
      });
      
      const biometricLateRecords = [];
      let nextRecordId = 1000;
      const dailyCheckins = [];
      
      for (const [key, times] of Object.entries(groupedPunches)) {
        const [empCode, date] = key.split('_');
        const systemEmp = empCodeToUserMap.get(empCode);
        if (!systemEmp) continue;
        
        times.sort();
        const earliestTime = times[0];
        
        dailyCheckins.push({
          username: systemEmp.username,
          name: systemEmp.name,
          date: date,
          punchTime: earliestTime
        });
        
        if (earliestTime > "09:30:00") {
          const [h, m] = earliestTime.split(':').map(Number);
          const punchMinutes = h * 60 + m;
          const limitMinutes = 9 * 60 + 30;
          const minutesLate = Math.round(punchMinutes - limitMinutes);
          
          biometricLateRecords.push({
            modalType: "Late",
            data: {
              id: nextRecordId++,
              user_id: systemEmp.id,
              type: "late",
              date: date,
              minutes_late: minutesLate,
              lop_days: null,
              deduction_amount: 250,
              reason: `Initial check-in punch at ${earliestTime} (biometric)`,
              created_at: `${date}T${earliestTime}.000000Z`,
              updated_at: `${date}T${earliestTime}.000000Z`,
              user: {
                id: systemEmp.id,
                name: systemEmp.name,
                username: systemEmp.username,
                plain_password: systemEmp.plain_password,
                role: systemEmp.role,
                employee_type: systemEmp.employee_type,
                designation: systemEmp.designation,
                designation_id: systemEmp.designation_id
              }
            }
          });
        }
      }
      
      biometricLateCount = biometricLateRecords.length;
      console.log(`Sync: Calculated ${biometricLateCount} biometric late-arrival records.`);
      
      // Merge with existing checkins
      let existingCheckins = readJSON(PATHS.checkins, []);
      existingCheckins = existingCheckins.filter(c => !c.date.startsWith(selectedMonth));
      const combinedCheckins = [...existingCheckins, ...dailyCheckins];
      writeJSON(PATHS.checkins, combinedCheckins);

      // Merge with existing biometric attendance records
      let existingAttendance = readJSON(PATHS.attendance, []);
      const existingBiometricOtherMonths = existingAttendance.filter(r => 
        r.modalType === 'Late' && 
        r.data.id >= 1000 && 
        !r.data.date.startsWith(selectedMonth)
      );
      
      const combinedAttendance = [...lopAttendance, ...existingBiometricOtherMonths, ...biometricLateRecords];
      writeJSON(PATHS.attendance, combinedAttendance);
      
    } catch (etErr) {
      console.error('Biometric sync failed, falling back to local checkins and portal attendance:', etErr);
      
      // Load checkins and employees
      const checkins = readJSON(PATHS.checkins, []);
      const employees = readJSON(PATHS.employees, []);
      
      // Filter checkins for the selected month
      const monthCheckins = checkins.filter(c => c.date && c.date.startsWith(selectedMonth));
      
      // Group checkins by username and date to find the earliest punch time
      const grouped = {};
      monthCheckins.forEach(c => {
        if (!c.username || !c.date || !c.punchTime) return;
        const key = `${c.username}_${c.date}`;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(c.punchTime);
      });
      
      const fallbackBiometricRecords = [];
      let nextRecordId = 1000;
      
      for (const [key, times] of Object.entries(grouped)) {
        const [username, date] = key.split('_');
        const systemEmp = employees.find(e => e.username === username);
        if (!systemEmp) continue;
        
        times.sort();
        const earliestTime = times[0];
        
        if (earliestTime > "09:30:00") {
          const [h, m] = earliestTime.split(':').map(Number);
          const punchMinutes = h * 60 + m;
          const limitMinutes = 9 * 60 + 30;
          const minutesLate = Math.round(punchMinutes - limitMinutes);
          
          fallbackBiometricRecords.push({
            modalType: "Late",
            data: {
              id: nextRecordId++,
              user_id: systemEmp.id,
              type: "late",
              date: date,
              minutes_late: minutesLate,
              lop_days: null,
              deduction_amount: 250,
              reason: `Initial check-in punch at ${earliestTime} (biometric)`,
              created_at: `${date}T${earliestTime}.000000Z`,
              updated_at: `${date}T${earliestTime}.000000Z`,
              user: {
                id: systemEmp.id,
                name: systemEmp.name,
                username: systemEmp.username,
                plain_password: systemEmp.plain_password,
                role: systemEmp.role,
                employee_type: systemEmp.employee_type,
                designation: systemEmp.designation,
                designation_id: systemEmp.designation_id
              }
            }
          });
        }
      }
      
      console.log(`Fallback: Calculated ${fallbackBiometricRecords.length} biometric late-arrival records for ${selectedMonth} from local checkins.`);
      
      let existingAttendance = readJSON(PATHS.attendance, []);
      // Filter out biometric records for the selected month to avoid duplicates
      const existingBiometricOtherMonths = existingAttendance.filter(r => 
        r.modalType === 'Late' && 
        r.data.id >= 1000 && 
        !r.data.date.startsWith(selectedMonth)
      );
      
      const combinedAttendance = [...lopAttendance, ...existingBiometricOtherMonths, ...fallbackBiometricRecords];
      writeJSON(PATHS.attendance, combinedAttendance);
      
      biometricLateCount = fallbackBiometricRecords.length;
    }

    res.json({
      success: true,
      summary: {
        employeesCount: employees.length,
        leavesCount: leaves.length,
        attendanceCount: lopAttendance.length + biometricLateCount
      }
    });

  } catch (err) {
    console.error('Sync error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2b. Biometric-ONLY attendance sync (does NOT touch portal employees/leaves)
app.post('/api/sync/biometric', async (req, res) => {
  const selectedMonth = req.body.month || new Date().toISOString().substring(0, 7);

  // Load existing local data - we never overwrite these
  const existingEmployees = readJSON(PATHS.employees, []);
  const salaries = readJSON(PATHS.salaries, []);
  const existingAttendance = readJSON(PATHS.attendance, []);

  // Keep all non-biometric attendance records (LOP records from portal) intact
  const lopAttendance = existingAttendance.filter(r => r.modalType === 'Lop');

  let biometricLateCount = 0;

  try {
    if (process.env.BIOMETRIC_SYNC_MODE === 'push') {
      throw new Error('Biometric direct fetch is disabled (running in push mode).');
    }
    console.log(`Biometric Sync: Connecting to http://192.168.0.233 for month ${selectedMonth}...`);
    const etMainUrl = 'http://192.168.0.233/';
    const etLoginUrl = 'http://192.168.0.233/login/';

    const etInitialRes = await fetch(etMainUrl);
    const etInitialText = await etInitialRes.text();
    const etTokenMatch = etInitialText.match(/name='csrfmiddlewaretoken'\s+value='([^']+)'/) || etInitialText.match(/name="csrfmiddlewaretoken"\s+value="([^"]+)"/);
    if (!etTokenMatch) throw new Error('CSRF token not found on easy TimePro page.');
    const etToken = etTokenMatch[1];

    const etSetCookieHeaders = etInitialRes.headers.getSetCookie();
    const etCookies = etSetCookieHeaders.map(c => c.split(';')[0]).join('; ');

    const etSerializeData = 'username=admin&password=admin&template10=&login_type=pwd';
    const etEncryptedData = zkEncrypt(etSerializeData, etToken);

    const etLoginBody = new URLSearchParams({
      encrypt_data: etEncryptedData,
      csrfmiddlewaretoken: etToken
    });

    const etLoginRes = await fetch(etLoginUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': etCookies,
        'Referer': etLoginUrl
      },
      body: etLoginBody,
      redirect: 'manual'
    });

    const etLoginCookiesHeaders = etLoginRes.headers.getSetCookie();
    const etCookiesMap = new Map();
    etCookies.split('; ').forEach(c => {
      const [k, v] = c.split('=');
      if (k && v) etCookiesMap.set(k, v);
    });
    etLoginCookiesHeaders.forEach(c => {
      const [k, v] = c.split(';')[0].split('=');
      if (k && v) etCookiesMap.set(k, v);
    });
    const etCombinedCookies = [...etCookiesMap.entries()].map(([k, v]) => `${k}=${v}`).join('; ');

    // Fetch ZKTeco employee list
    console.log('Biometric Sync: Fetching ZKTeco employee list...');
    const etEmpRes = await fetch('http://192.168.0.233/personnel/employee/table/?page=1&limit=200', {
      headers: { 'Cookie': etCombinedCookies }
    });
    const etEmpData = await etEmpRes.json();
    const etEmployees = etEmpData.data || [];

    // Match ZKTeco emp_code to our system employee records
    function matchEmpCode(sysEmp, etEmps) {
      const sysClean = sysEmp.name.toLowerCase().replace(/[^a-z]/g, '');
      for (const e of etEmps) {
        const etClean = (e.first_name + ' ' + (e.last_name || '')).toLowerCase().replace(/[^a-z]/g, '');
        if (etClean.includes(sysClean) || sysClean.includes(etClean)) return e.emp_code;
      }
      for (const e of etEmps) {
        const etFirstName = e.first_name.toLowerCase().replace(/[^a-z]/g, '');
        if (sysClean.startsWith(etFirstName) || etFirstName.startsWith(sysClean)) return e.emp_code;
      }
      return null;
    }

    const empCodeToUserMap = new Map();
    existingEmployees.forEach(emp => {
      const code = matchEmpCode(emp, etEmployees);
      if (code) {
        if (empCodeToUserMap.has(code)) {
          const existingEmp = empCodeToUserMap.get(code);
          const empHasSalary = salaries.some(s => s.username === emp.username);
          const existingHasSalary = salaries.some(s => s.username === existingEmp.username);
          if (empHasSalary && !existingHasSalary) {
            empCodeToUserMap.set(code, emp);
          } else if (!empHasSalary && !existingHasSalary) {
            if (emp.id < existingEmp.id) empCodeToUserMap.set(code, emp);
          }
          // else keep existing (it has salary record)
        } else {
          empCodeToUserMap.set(code, emp);
        }
      }
    });

    // Fetch punch logs for the selected month
    const startDateStr = `${selectedMonth}-01`;
    console.log(`Biometric Sync: Fetching punches from ${startDateStr}...`);
    const etPunchesRes = await fetch(
      `http://192.168.0.233/iclock/transaction/table/?page=1&limit=5000&_p_upload_time__gte=${startDateStr}`,
      { headers: { 'Cookie': etCombinedCookies } }
    );
    const etPunchesData = await etPunchesRes.json();
    let punches = etPunchesData.data || [];

    // Filter to only the selected month
    punches = punches.filter(p => p.transaction_punch_date && p.transaction_punch_date.startsWith(selectedMonth));
    console.log(`Biometric Sync: Found ${punches.length} punches for ${selectedMonth}.`);

    // Group punches by emp_code + date, keep only earliest punch per day
    const groupedPunches = {};
    punches.forEach(p => {
      if (!p.emp_code || !p.transaction_punch_date || !p.transaction_punch_time) return;
      const key = `${p.emp_code}_${p.transaction_punch_date}`;
      if (!groupedPunches[key]) groupedPunches[key] = [];
      groupedPunches[key].push(p.transaction_punch_time);
    });

    const biometricLateRecords = [];
    let nextRecordId = 1000;
    const dailyCheckins = [];

    for (const [key, times] of Object.entries(groupedPunches)) {
      const [empCode, date] = key.split('_');
      const systemEmp = empCodeToUserMap.get(empCode);
      if (!systemEmp) continue;

      times.sort();
      const earliestTime = times[0];

      dailyCheckins.push({
        username: systemEmp.username,
        name: systemEmp.name,
        date: date,
        punchTime: earliestTime
      });

      if (earliestTime > "09:30:00") {
        const [h, m] = earliestTime.split(':').map(Number);
        const punchMinutes = h * 60 + m;
        const limitMinutes = 9 * 60 + 30;
        const minutesLate = Math.round(punchMinutes - limitMinutes);

        biometricLateRecords.push({
          modalType: "Late",
          data: {
            id: nextRecordId++,
            user_id: systemEmp.id,
            type: "late",
            date: date,
            minutes_late: minutesLate,
            lop_days: null,
            deduction_amount: 250,
            reason: `Initial check-in punch at ${earliestTime} (biometric)`,
            created_at: `${date}T${earliestTime}.000000Z`,
            updated_at: `${date}T${earliestTime}.000000Z`,
            user: {
              id: systemEmp.id,
              name: systemEmp.name,
              username: systemEmp.username,
              plain_password: systemEmp.plain_password,
              role: systemEmp.role,
              employee_type: systemEmp.employee_type,
              designation: systemEmp.designation,
              designation_id: systemEmp.designation_id
            }
          }
        });
      }
    }

    biometricLateCount = biometricLateRecords.length;
    console.log(`Biometric Sync: Calculated ${biometricLateCount} late-arrival records for ${selectedMonth}.`);

    // Merge checkins: remove old entries for this month, add new ones
    let existingCheckins = readJSON(PATHS.checkins, []);
    existingCheckins = existingCheckins.filter(c => !c.date.startsWith(selectedMonth));
    writeJSON(PATHS.checkins, [...existingCheckins, ...dailyCheckins]);

    // Merge attendance: keep biometric records from other months + LOP records + new biometric records
    const existingBiometricOtherMonths = existingAttendance.filter(r =>
      r.modalType === 'Late' &&
      r.data.id >= 1000 &&
      !r.data.date.startsWith(selectedMonth)
    );
    writeJSON(PATHS.attendance, [...lopAttendance, ...existingBiometricOtherMonths, ...biometricLateRecords]);

  } catch (etErr) {
    // ZKTeco unreachable — reconstruct from local checkins for the selected month
    console.error('Biometric Sync: ZKTeco unreachable, rebuilding from local checkins:', etErr.message);

    const checkins = readJSON(PATHS.checkins, []);
    const monthCheckins = checkins.filter(c => c.date && c.date.startsWith(selectedMonth));

    const grouped = {};
    monthCheckins.forEach(c => {
      if (!c.username || !c.date || !c.punchTime) return;
      const key = `${c.username}_${c.date}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(c.punchTime);
    });

    const fallbackRecords = [];
    let nextRecordId = 1000;

    for (const [key, times] of Object.entries(grouped)) {
      const [username, date] = key.split('_');
      const systemEmp = existingEmployees.find(e => e.username === username);
      if (!systemEmp) continue;

      times.sort();
      const earliestTime = times[0];

      if (earliestTime > "09:30:00") {
        const [h, m] = earliestTime.split(':').map(Number);
        const minutesLate = Math.round((h * 60 + m) - (9 * 60 + 30));

        fallbackRecords.push({
          modalType: "Late",
          data: {
            id: nextRecordId++,
            user_id: systemEmp.id,
            type: "late",
            date: date,
            minutes_late: minutesLate,
            lop_days: null,
            deduction_amount: 250,
            reason: `Initial check-in punch at ${earliestTime} (biometric - offline fallback)`,
            created_at: `${date}T${earliestTime}.000000Z`,
            updated_at: `${date}T${earliestTime}.000000Z`,
            user: {
              id: systemEmp.id,
              name: systemEmp.name,
              username: systemEmp.username,
              plain_password: systemEmp.plain_password,
              role: systemEmp.role,
              employee_type: systemEmp.employee_type,
              designation: systemEmp.designation,
              designation_id: systemEmp.designation_id
            }
          }
        });
      }
    }

    biometricLateCount = fallbackRecords.length;
    console.log(`Biometric Sync Fallback: Calculated ${biometricLateCount} records from local checkins for ${selectedMonth}.`);

    const existingBiometricOtherMonths = existingAttendance.filter(r =>
      r.modalType === 'Late' &&
      r.data.id >= 1000 &&
      !r.data.date.startsWith(selectedMonth)
    );
    writeJSON(PATHS.attendance, [...lopAttendance, ...existingBiometricOtherMonths, ...fallbackRecords]);
  }

  res.json({
    success: true,
    summary: {
      month: selectedMonth,
      lateRecordsCount: biometricLateCount
    }
  });
});


// 2c. Biometric-PUSH attendance sync (receives biometric records from local client and syncs them)
app.post('/api/sync/biometric-push', (req, res) => {
  const { token, month, etEmployees, punches } = req.body;

  // Validate security token
  const expectedToken = process.env.SYNC_TOKEN;
  if (!expectedToken || token !== expectedToken) {
    console.warn('Biometric Push Sync: Unauthorized sync attempt or SYNC_TOKEN is not set on server.');
    return res.status(401).json({ success: false, error: 'Unauthorized: Invalid or missing sync token.' });
  }

  const selectedMonth = month || new Date().toISOString().substring(0, 7);

  // Load existing local data
  const existingEmployees = readJSON(PATHS.employees, []);
  const salaries = readJSON(PATHS.salaries, []);
  const existingAttendance = readJSON(PATHS.attendance, []);

  // Keep all non-biometric attendance records (LOP records from portal) intact
  const lopAttendance = existingAttendance.filter(r => r.modalType === 'Lop');

  let biometricLateCount = 0;

  try {
    console.log(`Biometric Push Sync: Processing pushed data for month ${selectedMonth}...`);

    // Match ZKTeco emp_code to our system employee records
    function matchEmpCode(sysEmp, etEmps) {
      const sysClean = sysEmp.name.toLowerCase().replace(/[^a-z]/g, '');
      for (const e of etEmps) {
        const etClean = (e.first_name + ' ' + (e.last_name || '')).toLowerCase().replace(/[^a-z]/g, '');
        if (etClean.includes(sysClean) || sysClean.includes(etClean)) return e.emp_code;
      }
      for (const e of etEmps) {
        const etFirstName = e.first_name.toLowerCase().replace(/[^a-z]/g, '');
        if (sysClean.startsWith(etFirstName) || etFirstName.startsWith(sysClean)) return e.emp_code;
      }
      return null;
    }

    const empCodeToUserMap = new Map();
    existingEmployees.forEach(emp => {
      const code = matchEmpCode(emp, etEmployees || []);
      if (code) {
        if (empCodeToUserMap.has(code)) {
          const existingEmp = empCodeToUserMap.get(code);
          const empHasSalary = salaries.some(s => s.username === emp.username);
          const existingHasSalary = salaries.some(s => s.username === existingEmp.username);
          if (empHasSalary && !existingHasSalary) {
            empCodeToUserMap.set(code, emp);
          } else if (!empHasSalary && !existingHasSalary) {
            if (emp.id < existingEmp.id) empCodeToUserMap.set(code, emp);
          }
        } else {
          empCodeToUserMap.set(code, emp);
        }
      }
    });

    // Filter punches to only the selected month
    const filteredPunches = (punches || []).filter(p => p.transaction_punch_date && p.transaction_punch_date.startsWith(selectedMonth));
    console.log(`Biometric Push Sync: Found ${filteredPunches.length} punches for ${selectedMonth}.`);

    // Group punches by emp_code + date, keep only earliest punch per day
    const groupedPunches = {};
    filteredPunches.forEach(p => {
      if (!p.emp_code || !p.transaction_punch_date || !p.transaction_punch_time) return;
      const key = `${p.emp_code}_${p.transaction_punch_date}`;
      if (!groupedPunches[key]) groupedPunches[key] = [];
      groupedPunches[key].push(p.transaction_punch_time);
    });

    const biometricLateRecords = [];
    let nextRecordId = 1000;
    const dailyCheckins = [];

    for (const [key, times] of Object.entries(groupedPunches)) {
      const [empCode, date] = key.split('_');
      const systemEmp = empCodeToUserMap.get(empCode);
      if (!systemEmp) continue;

      times.sort();
      const earliestTime = times[0];

      dailyCheckins.push({
        username: systemEmp.username,
        name: systemEmp.name,
        date: date,
        punchTime: earliestTime
      });

      if (earliestTime > "09:30:00") {
        const [h, m] = earliestTime.split(':').map(Number);
        const punchMinutes = h * 60 + m;
        const limitMinutes = 9 * 60 + 30;
        const minutesLate = Math.round(punchMinutes - limitMinutes);

        biometricLateRecords.push({
          modalType: "Late",
          data: {
            id: nextRecordId++,
            user_id: systemEmp.id,
            type: "late",
            date: date,
            minutes_late: minutesLate,
            lop_days: null,
            deduction_amount: 250,
            reason: `Initial check-in punch at ${earliestTime} (biometric)`,
            created_at: `${date}T${earliestTime}.000000Z`,
            updated_at: `${date}T${earliestTime}.000000Z`,
            user: {
              id: systemEmp.id,
              name: systemEmp.name,
              username: systemEmp.username,
              plain_password: systemEmp.plain_password,
              role: systemEmp.role,
              employee_type: systemEmp.employee_type,
              designation: systemEmp.designation,
              designation_id: systemEmp.designation_id
            }
          }
        });
      }
    }

    biometricLateCount = biometricLateRecords.length;
    console.log(`Biometric Push Sync: Calculated ${biometricLateCount} late-arrival records for ${selectedMonth}.`);

    // Merge checkins: remove old entries for this month, add new ones
    let existingCheckins = readJSON(PATHS.checkins, []);
    existingCheckins = existingCheckins.filter(c => !c.date.startsWith(selectedMonth));
    writeJSON(PATHS.checkins, [...existingCheckins, ...dailyCheckins]);

    // Merge attendance: keep biometric records from other months + LOP records + new biometric records
    const existingBiometricOtherMonths = existingAttendance.filter(r =>
      r.modalType === 'Late' &&
      r.data.id >= 1000 &&
      !r.data.date.startsWith(selectedMonth)
    );
    writeJSON(PATHS.attendance, [...lopAttendance, ...existingBiometricOtherMonths, ...biometricLateRecords]);

    res.json({
      success: true,
      summary: {
        month: selectedMonth,
        lateRecordsCount: biometricLateCount,
        checkinsAdded: dailyCheckins.length
      }
    });

  } catch (err) {
    console.error('Biometric push sync error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});


app.get('/api/data', (req, res) => {
  res.json({
    employees: readJSON(PATHS.employees, []),
    leaves: readJSON(PATHS.leaves, []),
    attendance: readJSON(PATHS.attendance, []),
    checkins: readJSON(PATHS.checkins, []),
    holidays: readJSON(PATHS.holidays, [])
  });
});

// 4. Upload salaries JSON
app.post('/api/salaries/upload', (req, res) => {
  const salaryList = req.body;
  if (!Array.isArray(salaryList)) {
    return res.status(400).json({ success: false, error: 'Request body must be a JSON array of salaries.' });
  }
  
  // Format should be { employee_name: ..., base_salary: ..., allowances: ..., etc }
  writeJSON(PATHS.salaries, salaryList);
  res.json({ success: true, count: salaryList.length });
});

// 5. Get salaries database
app.get('/api/salaries', (req, res) => {
  res.json(readJSON(PATHS.salaries, []));
});

// 6. Update single employee salary record
app.post('/api/salaries/single', (req, res) => {
  const record = req.body;
  if (!record.employeeName && !record.username) {
    return res.status(400).json({ success: false, error: 'Employee name or username is required.' });
  }
  
  const salaries = readJSON(PATHS.salaries, []);
  const index = salaries.findIndex(s => 
    (record.username && s.username === record.username) || 
    (record.employeeName && s.employeeName.toLowerCase() === record.employeeName.toLowerCase())
  );
  
  const cleanRecord = {
    username: record.username || '',
    employeeName: record.employeeName || '',
    designation: record.designation || '',
    basicDA: parseFloat(record.basicDA) || 0,
    hra: parseFloat(record.hra) || 0,
    otherAllow: parseFloat(record.otherAllow) || 0,
    empPf: parseFloat(record.empPf) || 0,
    esic: parseFloat(record.esic) || 0,
    pt: parseFloat(record.pt) || 0,
    it: parseFloat(record.it) || 0
  };

  if (index !== -1) {
    salaries[index] = { ...salaries[index], ...cleanRecord };
  } else {
    salaries.push(cleanRecord);
  }
  
  writeJSON(PATHS.salaries, salaries);
  res.json({ success: true, record: cleanRecord });
});

// 7. Get holidays list
app.get('/api/holidays', (req, res) => {
  const holidays = readJSON(PATHS.holidays, []);
  holidays.sort((a, b) => a.date.localeCompare(b.date));
  res.json(holidays);
});

// 8. Add/modify holiday
app.post('/api/holidays', (req, res) => {
  const { date, name } = req.body;
  if (!date || !name) {
    return res.status(400).json({ success: false, error: 'Date and Name are required.' });
  }
  
  const holidays = readJSON(PATHS.holidays, []);
  const index = holidays.findIndex(h => h.date === date);
  
  if (index !== -1) {
    holidays[index].name = name;
  } else {
    holidays.push({ date, name });
  }
  
  holidays.sort((a, b) => a.date.localeCompare(b.date));
  writeJSON(PATHS.holidays, holidays);
  res.json({ success: true, holidays });
});

// 9. Remove holiday
app.post('/api/holidays/delete', (req, res) => {
  const { date } = req.body;
  if (!date) {
    return res.status(400).json({ success: false, error: 'Date is required.' });
  }
  
  let holidays = readJSON(PATHS.holidays, []);
  holidays = holidays.filter(h => h.date !== date);
  
  writeJSON(PATHS.holidays, holidays);
  res.json({ success: true, holidays });
});

// 10. Bulk upload holidays
app.post('/api/holidays/upload', (req, res) => {
  const { year, holidays } = req.body;
  if (!year || !Array.isArray(holidays)) {
    return res.status(400).json({ success: false, error: 'Year and Holidays array are required.' });
  }
  
  let databaseHolidays = readJSON(PATHS.holidays, []);
  
  // Filter out any existing holidays for the selected year
  databaseHolidays = databaseHolidays.filter(h => !h.date.startsWith(`${year}-`));
  
  // Add the new ones
  databaseHolidays = [...databaseHolidays, ...holidays];
  
  databaseHolidays.sort((a, b) => a.date.localeCompare(b.date));
  writeJSON(PATHS.holidays, databaseHolidays);
  
  res.json({ success: true, count: holidays.length });
});

// 11. Update employee profile (name, role, employee_type, designation, password)
app.patch('/api/employees/:username', (req, res) => {
  const { username } = req.params;
  const { name, role, employee_type, designation, designation_id, plain_password } = req.body;

  const employees = readJSON(PATHS.employees, []);
  const idx = employees.findIndex(e => e.username === username);
  if (idx === -1) return res.status(404).json({ success: false, error: 'Employee not found.' });

  if (name)           employees[idx].name           = name;
  if (role)           employees[idx].role           = role;
  if (employee_type)  employees[idx].employee_type  = employee_type;
  if (designation)    employees[idx].designation    = designation;
  if (designation_id !== undefined) employees[idx].designation_id = designation_id;
  if (plain_password) employees[idx].plain_password = plain_password;

  writeJSON(PATHS.employees, employees);

  // Log the action
  addActivityLog({
    category: 'UPDATE',
    actor: 'Admin',
    description: `Updated employee profile for ${employees[idx].name} (${username})`,
    meta: { username }
  });

  res.json({ success: true, employee: employees[idx] });
});

// 11b. Add new employee profile
app.post('/api/employees', (req, res) => {
  const { name, username, plain_password, role, employee_type, designation } = req.body;
  if (!name || !username || !plain_password) {
    return res.status(400).json({ success: false, error: 'Name, username, and password are required.' });
  }

  const employees = readJSON(PATHS.employees, []);
  const exists = employees.some(e => e.username.toLowerCase() === username.toLowerCase());
  if (exists) {
    return res.status(400).json({ success: false, error: 'Username already exists.' });
  }

  const newId = employees.reduce((max, e) => (e.id > max ? e.id : max), 0) + 1;
  const newEmp = {
    id: newId,
    name,
    username,
    email: null,
    email_verified_at: null,
    plain_password,
    role: role || 'employee',
    employee_type: employee_type || 'combined',
    designation: designation || 'Staff Member',
    designation_id: 6,
    team_lead_id: null,
    target_revenue: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    kpis: [],
    leaves: [],
    attendance_records: [],
    team_lead: null,
    designation_ref: {
      id: 6,
      name: designation || 'Staff Member',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  };

  employees.push(newEmp);
  writeJSON(PATHS.employees, employees);

  addActivityLog({
    category: 'CREATE',
    actor: 'Admin',
    description: `Added new employee profile for ${name} (${username})`,
    meta: { username, id: newId }
  });

  res.json({ success: true, employee: newEmp });
});

// 11c. Remove employee profile
app.delete('/api/employees/:username', (req, res) => {
  const { username } = req.params;
  const employees = readJSON(PATHS.employees, []);
  const idx = employees.findIndex(e => e.username === username);
  if (idx === -1) {
    return res.status(404).json({ success: false, error: 'Employee not found.' });
  }

  const empName = employees[idx].name;
  employees.splice(idx, 1);
  writeJSON(PATHS.employees, employees);

  // Also remove from salaries.json
  const salaries = readJSON(PATHS.salaries, []);
  const updatedSalaries = salaries.filter(s => 
    s.username !== username && 
    s.employeeName.toLowerCase() !== empName.toLowerCase()
  );
  writeJSON(PATHS.salaries, updatedSalaries);

  addActivityLog({
    category: 'DELETE',
    actor: 'Admin',
    description: `Removed employee profile and salary configuration for ${empName} (${username})`,
    meta: { username }
  });

  res.json({ success: true });
});

// 12. Activity log system (in-memory + file persistence)
const PATHS_LOGS = path.join(DATA_DIR, 'activity_logs.json');

function addActivityLog(entry) {
  const logs = readJSON(PATHS_LOGS, []);
  logs.unshift({
    id: Date.now(),
    timestamp: new Date().toISOString(),
    category: entry.category || 'INFO',
    actor: entry.actor || 'System',
    description: entry.description || '',
    ip: entry.ip || '—',
    meta: entry.meta || {}
  });
  // Keep last 2000 logs
  writeJSON(PATHS_LOGS, logs.slice(0, 2000));
}

app.get('/api/logs', (req, res) => {
  let logs = readJSON(PATHS_LOGS, []);
  const { category, actor, from, to, q } = req.query;
  if (category && category !== 'ALL') logs = logs.filter(l => l.category === category);
  if (actor && actor !== 'ALL') logs = logs.filter(l => l.actor.toLowerCase().includes(actor.toLowerCase()));
  if (from) logs = logs.filter(l => l.timestamp >= from);
  if (to)   logs = logs.filter(l => l.timestamp <= to + 'T23:59:59Z');
  if (q)    logs = logs.filter(l => l.description.toLowerCase().includes(q.toLowerCase()));
  res.json(logs);
});

app.post('/api/logs', (req, res) => {
  const { category, actor, description, ip, meta } = req.body;
  addActivityLog({ category, actor, description, ip, meta });
  res.json({ success: true });
});

// 13. Proxy: fetch employee performance history from varietyvintage portal
app.post('/api/performance-history', async (req, res) => {
  const { username, password, employeeId } = req.body;
  const u = username || 'admin';
  const p = password || 'admin';

  let portalReports = [];
  try {
    const mainUrl = 'https://varietyvintage.com/employee';
    const loginUrl = 'https://varietyvintage.com/employee/login';

    const initRes = await fetch(mainUrl);
    const initHtml = await initRes.text();
    const cookieHdrs = initRes.headers.getSetCookie();
    const cookies = cookieHdrs.map(c => c.split(';')[0]).join('; ');
    const tokenMatch = initHtml.match(/name="_token"\s+value="([^"]+)"/);
    if (!tokenMatch) throw new Error('CSRF token not found');

    const loginRes = await fetch(loginUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': cookies, 'Referer': mainUrl },
      body: new URLSearchParams({ _token: tokenMatch[1], username: u, password: p }),
      redirect: 'manual'
    });
    if (loginRes.status !== 302) throw new Error('Portal authentication failed');

    const loginCookies = loginRes.headers.getSetCookie();
    const cookieMap = new Map();
    cookies.split('; ').forEach(c => { const [k, v] = c.split('='); if (k && v) cookieMap.set(k, v); });
    loginCookies.forEach(c => { const [k, v] = c.split(';')[0].split('='); if (k && v) cookieMap.set(k, v); });
    const authCookies = [...cookieMap.entries()].map(([k, v]) => `${k}=${v}`).join('; ');

    // Fetch logs page that has performance history
    const logsRes = await fetch(`https://varietyvintage.com/employee/admin/logs?user_id=${employeeId || ''}`, {
      headers: { 'Cookie': authCookies }
    });
    const logsHtml = await logsRes.text();

    // Extract performance report cards from the HTML
    const reportRegex = /openPerformanceReportModal\((\{[\s\S]*?\})\)/g;
    let m;
    const seen = new Set();
    while ((m = reportRegex.exec(logsHtml)) !== null) {
      try {
        const obj = JSON.parse(decodeEntities(m[1]));
        if (obj && obj.id && !seen.has(obj.id)) {
          seen.add(obj.id);
          portalReports.push(obj);
        }
      } catch (_) {}
    }
  } catch (err) {
    console.error('Portal performance history fetch failed, using local fallback:', err.message);
  }

  // Load and merge local reports
  try {
    const localReports = readJSON(PATHS.performance, []);
    const filteredLocal = localReports.filter(r => r.user_id == employeeId);
    
    // Merge: We prioritize local reports over portal ones if they are for the same period.
    const mergedMap = new Map();
    // 1. Add portal reports first
    portalReports.forEach(r => {
      const period = r.period || r.month || '';
      if (period) mergedMap.set(period, r);
    });
    // 2. Add local reports (will overwrite portal reports for the same period)
    filteredLocal.forEach(r => {
      const period = r.period;
      if (period) mergedMap.set(period, r);
    });

    const mergedReports = Array.from(mergedMap.values());
    // Sort reports by period descending (newest first)
    mergedReports.sort((a, b) => {
      const ap = a.period || a.month || '';
      const bp = b.period || b.month || '';
      return bp.localeCompare(ap);
    });

    res.json({ success: true, reports: mergedReports });
  } catch (err) {
    console.error('Error merging performance history:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 14. Route to manually add/update employee performance history locally
app.post('/api/performance-history/add', (req, res) => {
  const report = req.body;
  if (!report.employeeId || !report.period) {
    return res.status(400).json({ success: false, error: 'Employee ID and Period are required.' });
  }

  try {
    const localReports = readJSON(PATHS.performance, []);

    const newReport = {
      id: 'local_' + Date.now(),
      user_id: parseInt(report.employeeId, 10) || report.employeeId,
      period: report.period,
      overall_score: parseFloat(report.overall_score) || 0,
      attendance_score: parseFloat(report.attendance_score) || 0,
      teamwork_score: parseFloat(report.teamwork_score) || 0,
      initiative_score: parseFloat(report.initiative_score) || 0,
      audit_date: report.audit_date || new Date().toISOString().substring(0, 10),
      is_verified: !!report.is_verified,
      
      buy_lead_target: report.buy_lead_target !== undefined ? parseFloat(report.buy_lead_target) : null,
      buy_lead_achieved: report.buy_lead_achieved !== undefined ? parseFloat(report.buy_lead_achieved) : null,
      buy_lead_weight: report.buy_lead_weight !== undefined ? parseFloat(report.buy_lead_weight) : null,
      
      ipm_target: report.ipm_target !== undefined ? parseFloat(report.ipm_target) : null,
      ipm_achieved: report.ipm_achieved !== undefined ? parseFloat(report.ipm_achieved) : null,
      ipm_weight: report.ipm_weight !== undefined ? parseFloat(report.ipm_weight) : null,
      tasks: report.tasks || null
    };

    // Check if report already exists for this employee and period
    const existingIdx = localReports.findIndex(r => r.user_id == newReport.user_id && r.period === newReport.period);
    if (existingIdx !== -1) {
      localReports[existingIdx] = { ...localReports[existingIdx], ...newReport, id: localReports[existingIdx].id };
    } else {
      localReports.push(newReport);
    }

    writeJSON(PATHS.performance, localReports);

    // Add activity log
    addActivityLog({
      category: 'UPDATE',
      actor: 'Admin',
      description: `Added/Updated performance report for employee ID ${report.employeeId} (${report.period})`,
      meta: { employeeId: report.employeeId, period: report.period }
    });

    res.json({ success: true, report: newReport });
  } catch (err) {
    console.error('Error adding local performance report:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});


app.listen(PORT, () => {
  console.log(`Variety Vintage HR Management System running at http://localhost:${PORT}`);
});
