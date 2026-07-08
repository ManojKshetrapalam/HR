#!/usr/bin/env node

/**
 * Biometric Attendance Push Agent
 * 
 * This script runs locally in the network where the ZKTeco Easy TimePro device is located.
 * It fetches the employee map and punch transactions directly from the local device and 
 * pushes them securely to the cloud-hosted HR portal.
 * 
 * Usage:
 *   HOSTED_APP_URL=https://your-hosted-hr-app.com SYNC_TOKEN=secure_token_here node push_biometrics.js
 * 
 * Configurations (Environment Variables):
 *   - BIOMETRIC_URL: URL of the ZKTeco biometric device (default: http://192.168.0.233/)
 *   - HOSTED_APP_URL: URL of the cloud-hosted HR app (default: http://localhost:3000)
 *   - SYNC_TOKEN: Secure shared secret token (required by server)
 *   - MONTH: Month to sync in YYYY-MM format (default: current month)
 *   - IGNORE_SSL: Set to 'true' to ignore SSL cert verification issues (default: false)
 */

const dns = require('dns');

// Configure config variables
const BIOMETRIC_URL = process.env.BIOMETRIC_URL || 'http://192.168.0.233/';
const HOSTED_APP_URL = process.env.HOSTED_APP_URL || 'http://localhost:3000';
const SYNC_TOKEN = process.env.SYNC_TOKEN;
const MONTH = process.env.MONTH || new Date().toISOString().substring(0, 7);

if (process.env.IGNORE_SSL === 'true') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  console.log('Push Agent: SSL Certificate rejection disabled (IGNORE_SSL=true).');
}

if (!SYNC_TOKEN) {
  console.warn('WARNING: SYNC_TOKEN is not set. The cloud server will reject this push request if it has a SYNC_TOKEN set.');
}

// Ensure BIOMETRIC_URL ends with a slash
const normalizedBiometricUrl = BIOMETRIC_URL.endsWith('/') ? BIOMETRIC_URL : BIOMETRIC_URL + '/';
// Ensure HOSTED_APP_URL does not end with a slash
const normalizedHostedAppUrl = HOSTED_APP_URL.endsWith('/') ? HOSTED_APP_URL.slice(0, -1) : HOSTED_APP_URL;

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

async function run() {
  console.log(`=== Biometric Sync Agent Starting ===`);
  console.log(`Local Biometric Device: ${normalizedBiometricUrl}`);
  console.log(`Target Cloud Server:    ${normalizedHostedAppUrl}`);
  console.log(`Sync Month:             ${MONTH}`);

  try {
    // 1. Initial connection to local device to get CSRF token and cookie
    console.log('\nStep 1: Connecting to local biometric device to fetch CSRF token...');
    const initialRes = await fetch(normalizedBiometricUrl);
    if (!initialRes.ok) {
      throw new Error(`Failed to load main page. Status: ${initialRes.status}`);
    }
    const initialText = await initialRes.text();
    const tokenMatch = initialText.match(/name='csrfmiddlewaretoken'\s+value='([^']+)'/) || 
                       initialText.match(/name="csrfmiddlewaretoken"\s+value="([^"]+)"/);
    if (!tokenMatch) {
      throw new Error('CSRF token not found on biometric home page.');
    }
    const csrfToken = tokenMatch[1];
    
    const setCookieHeaders = initialRes.headers.getSetCookie();
    const initialCookies = setCookieHeaders.map(c => c.split(';')[0]).join('; ');
    
    console.log('CSRF Token found successfully.');

    // 2. Perform Login
    console.log('\nStep 2: Authenticating with local biometric device...');
    const serializeData = 'username=admin&password=admin&template10=&login_type=pwd';
    const encryptedData = zkEncrypt(serializeData, csrfToken);
    
    const loginBody = new URLSearchParams({
      encrypt_data: encryptedData,
      csrfmiddlewaretoken: csrfToken
    });

    const loginRes = await fetch(`${normalizedBiometricUrl}login/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': initialCookies,
        'Referer': `${normalizedBiometricUrl}login/`
      },
      body: loginBody,
      redirect: 'manual'
    });

    const loginCookiesHeaders = loginRes.headers.getSetCookie();
    const cookiesMap = new Map();
    initialCookies.split('; ').forEach(c => {
      const [k, v] = c.split('=');
      if (k && v) cookiesMap.set(k, v);
    });
    loginCookiesHeaders.forEach(c => {
      const [k, v] = c.split(';')[0].split('=');
      if (k && v) cookiesMap.set(k, v);
    });
    const sessionCookies = [...cookiesMap.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
    console.log('Authentication successful. Session cookie established.');

    // 3. Fetch Employee List
    console.log('\nStep 3: Fetching biometric employee list...');
    const empRes = await fetch(`${normalizedBiometricUrl}personnel/employee/table/?page=1&limit=200`, {
      headers: { 'Cookie': sessionCookies }
    });
    if (!empRes.ok) {
      throw new Error(`Failed to fetch employees. Status: ${empRes.status}`);
    }
    const empData = await empRes.json();
    const etEmployees = empData.data || [];
    console.log(`Fetched ${etEmployees.length} employee records from biometric device.`);

    // 4. Fetch Punch Transactions
    const startDateStr = `${MONTH}-01`;
    console.log(`\nStep 4: Fetching biometric punches starting from ${startDateStr}...`);
    const punchesRes = await fetch(
      `${normalizedBiometricUrl}iclock/transaction/table/?page=1&limit=5000&_p_upload_time__gte=${startDateStr}`,
      { headers: { 'Cookie': sessionCookies } }
    );
    if (!punchesRes.ok) {
      throw new Error(`Failed to fetch punch transactions. Status: ${punchesRes.status}`);
    }
    const punchesData = await punchesRes.json();
    const punches = punchesData.data || [];
    console.log(`Fetched ${punches.length} punch entries since ${startDateStr}.`);

    // 5. Post data to hosted cloud server
    console.log(`\nStep 5: Pushing data to Cloud Server (${normalizedHostedAppUrl})...`);
    const pushEndpoint = `${normalizedHostedAppUrl}/api/sync/biometric-push`;
    
    const pushRes = await fetch(pushEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        token: SYNC_TOKEN,
        month: MONTH,
        etEmployees: etEmployees,
        punches: punches
      })
    });

    const pushResultText = await pushRes.text();
    let pushResult;
    try {
      pushResult = JSON.parse(pushResultText);
    } catch (e) {
      throw new Error(`Cloud server returned non-JSON response: ${pushResultText}`);
    }

    if (!pushRes.ok || !pushResult.success) {
      throw new Error(`Failed to push data to cloud server. Status: ${pushRes.status}. Error: ${pushResult.error || pushResultText}`);
    }

    console.log('\n=== Sync Complete ===');
    console.log(`Successfully synced biometric data with Cloud HR Server!`);
    console.log(`Pushed to Month: ${pushResult.summary.month}`);
    console.log(`Total Late Records Generated: ${pushResult.summary.lateRecordsCount}`);
    console.log(`Total Daily Checkins Synced:  ${pushResult.summary.checkinsAdded}`);

  } catch (error) {
    console.error('\n❌ ERROR: Biometric Sync Agent failed:');
    console.error(error.message);
    process.exit(1);
  }
}

run();
