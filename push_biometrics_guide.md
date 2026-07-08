# Walkthrough: Push-based Biometric Sync Implementation

We have successfully implemented **Option 3 (Local Push-based Sync Agent)** to allow hosting the HR portal in the cloud without losing integration with your on-premise ZKTeco biometric attendance machine.

---

## Changes Made

### 1. Server Updates
We modified `server.js` to:
- **Expose a New Endpoint**: Added `POST /api/sync/biometric-push` to receive ZKTeco data securely. It uses `process.env.SYNC_TOKEN` to validate request authenticity.
- **Enable Push Bypassing**: When `process.env.BIOMETRIC_SYNC_MODE` is set to `'push'`, the main `/api/sync` and `/api/sync/biometric` endpoints skip attempting to fetch from the local IP `192.168.0.233` (preventing timeouts in the cloud) and run their fallback processing logic using the data previously pushed into `checkins.json`.

### 2. Local Push Script
Created a new utility script `push_biometrics.js` to run on your local Windows/Mac machine. It:
1. Connects to `http://192.168.0.233/` locally.
2. Authenticates using RC4 encryption.
3. Retrieves employee details and punches.
4. Securely pushes the payload to the hosted HR server.

### 3. Dynamic Month Selection
We updated `public/app.js` and `public/index.html` to dynamically populate all month selection dropdowns (including the Biometric Sync and Employee Report dropdowns) starting from the current month (July 2026) and counting backward. This ensures the current month is always selectable.

---

## How to Deploy & Run

### A. Setup in the Hosted Cloud Environment (Render/AWS/etc.)
Set the following environment variables on your hosted app:
1. `BIOMETRIC_SYNC_MODE=push` (tells the server to skip direct IP fetches).
2. `SYNC_TOKEN=your_secure_shared_secret` (a strong password of your choice to protect the endpoint).

---

### B. Setup on your Office local system (Mac or Windows)
Make sure Node.js is installed on the machine.

1. **Verify you can access the biometric machine**:
   Ensure you can ping or access `http://192.168.0.233/` from this system.
2. **Run the push agent**:
   Open a terminal (Mac) or command prompt (Windows) and run:
   ```bash
   HOSTED_APP_URL=https://your-hosted-hr-app.com SYNC_TOKEN=your_secure_shared_secret node push_biometrics.js
   ```
   *Note: If testing locally first, you can run:*
   ```bash
   HOSTED_APP_URL=http://localhost:3000 SYNC_TOKEN=your_secure_shared_secret node push_biometrics.js
   ```

---

## C. Automate the Local Push Agent
To ensure attendance is always up-to-date, schedule the script to run periodically (e.g., hourly).

#### For Mac (using standard cron):
1. Open the crontab editor:
   ```bash
   crontab -e
   ```
2. Add a line to run it every hour (replace with your actual path, URL, and token):
   ```text
   0 * * * * HOSTED_APP_URL=https://your-hosted-hr-app.com SYNC_TOKEN=your_secure_shared_secret /usr/local/bin/node /path/to/1juneHR/push_biometrics.js >> /path/to/1juneHR/sync.log 2>&1
   ```

#### For Windows (using Task Scheduler):
1. Create a batch file named `run_sync.bat`:
   ```bat
   @echo off
   set HOSTED_APP_URL=https://your-hosted-hr-app.com
   set SYNC_TOKEN=your_secure_shared_secret
   node C:\path\to\1juneHR\push_biometrics.js >> C:\path\to\1juneHR\sync.log 2>&1
   ```
2. Open Windows **Task Scheduler** and create a basic task:
   - **Trigger**: Daily, repeating every 1 hour.
   - **Action**: Start a program pointing to `run_sync.bat`.
