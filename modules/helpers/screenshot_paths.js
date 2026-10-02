/**
 * modules/helpers/screenshot_paths.js
 * Centralized Manager for Report Proofs & Diagnostic Error Screenshots
 */

const fs = require('fs');
const path = require('path');

const isPackaged = process.env.MAPSSHIELD_PACKAGED === 'true' || __dirname.includes('.asar');
const REPORT_LOGS_DIR = process.env.MAPSSHIELD_USER_DATA
  ? path.join(process.env.MAPSSHIELD_USER_DATA, 'report_logs')
  : path.resolve(__dirname, '../../report_logs');
const PROJECT_REPORT_LOGS_DIR = isPackaged ? null : path.resolve(__dirname, '../../report_logs');
const PROOFS_DIR = path.join(REPORT_LOGS_DIR, 'proofs');
const ERRORS_DIR = path.join(REPORT_LOGS_DIR, 'errors');

/**
 * Ensures the target directories exist safely
 */
function ensureScreenshotDirs() {
  try {
    if (!fs.existsSync(PROOFS_DIR)) {
      fs.mkdirSync(PROOFS_DIR, { recursive: true });
    }
    if (!fs.existsSync(ERRORS_DIR)) {
      fs.mkdirSync(ERRORS_DIR, { recursive: true });
    }
    if (PROJECT_REPORT_LOGS_DIR && PROJECT_REPORT_LOGS_DIR !== REPORT_LOGS_DIR) {
      const projProofs = path.join(PROJECT_REPORT_LOGS_DIR, 'proofs');
      const projErrors = path.join(PROJECT_REPORT_LOGS_DIR, 'errors');
      if (!fs.existsSync(projProofs)) fs.mkdirSync(projProofs, { recursive: true });
      if (!fs.existsSync(projErrors)) fs.mkdirSync(projErrors, { recursive: true });
    }
  } catch (err) {
    console.warn('⚠️ Could not initialize screenshot directories:', err.message);
  }
}

/**
 * Generates safe, Windows-compatible timestamp string: YYYY-MM-DD_HH-mm-ss
 */
function getTimestampString(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
}

/**
 * Formats a clean, safe filename prefix
 */
function sanitizePrefix(prefix = '') {
  return prefix.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
}

/**
 * Resolves paths for proof screenshots
 */
function getProofScreenshotPath(prefix = 'proof') {
  ensureScreenshotDirs();
  const cleanPrefix = sanitizePrefix(prefix) || 'proof';
  const ts = getTimestampString();
  const filename = `${cleanPrefix}_${ts}.png`;
  return {
    archivePath: path.join(PROOFS_DIR, filename),
    latestPath: path.join(PROOFS_DIR, 'latest_proof.png'),
    filename
  };
}

/**
 * Resolves paths for error/diagnostic screenshots
 */
function getErrorScreenshotPath(prefix = 'error') {
  ensureScreenshotDirs();
  const cleanPrefix = sanitizePrefix(prefix) || 'error';
  const ts = getTimestampString();
  const filename = `${cleanPrefix}_${ts}.png`;
  return {
    archivePath: path.join(ERRORS_DIR, filename),
    latestPath: path.join(ERRORS_DIR, 'latest_error.png'),
    filename
  };
}

/**
 * Captures and archives a proof screenshot
 */
async function captureProofScreenshot(page, prefix = 'proof', options = { fullPage: true }) {
  if (!page || typeof page.screenshot !== 'function') return null;
  const paths = getProofScreenshotPath(prefix);
  try {
    await page.screenshot({ path: paths.archivePath, ...options });
    // Mirror to latest_proof.png within report_logs/proofs for instant reference
    try { fs.copyFileSync(paths.archivePath, paths.latestPath); } catch (_) {}

    // Mirror to project report_logs so files are also directly visible in workspace
    if (PROJECT_REPORT_LOGS_DIR && PROJECT_REPORT_LOGS_DIR !== REPORT_LOGS_DIR) {
      try {
        const projProofs = path.join(PROJECT_REPORT_LOGS_DIR, 'proofs');
        if (!fs.existsSync(projProofs)) fs.mkdirSync(projProofs, { recursive: true });
        fs.copyFileSync(paths.archivePath, path.join(projProofs, paths.filename));
        fs.copyFileSync(paths.archivePath, path.join(projProofs, 'latest_proof.png'));
      } catch (_) {}
    }
    return paths;
  } catch (err) {
    console.warn(`⚠️ Failed to capture proof screenshot (${prefix}):`, err.message);
    return null;
  }
}

/**
 * Captures and archives an error screenshot
 */
async function captureErrorScreenshot(page, prefix = 'error', options = { fullPage: true }) {
  if (!page || typeof page.screenshot !== 'function') return null;
  const paths = getErrorScreenshotPath(prefix);
  try {
    await page.screenshot({ path: paths.archivePath, ...options });
    // Mirror to latest_error.png within report_logs/errors for instant reference
    try { fs.copyFileSync(paths.archivePath, paths.latestPath); } catch (_) {}

    // Mirror to project report_logs so files are also directly visible in workspace
    if (PROJECT_REPORT_LOGS_DIR && PROJECT_REPORT_LOGS_DIR !== REPORT_LOGS_DIR) {
      try {
        const projErrors = path.join(PROJECT_REPORT_LOGS_DIR, 'errors');
        if (!fs.existsSync(projErrors)) fs.mkdirSync(projErrors, { recursive: true });
        fs.copyFileSync(paths.archivePath, path.join(projErrors, paths.filename));
        fs.copyFileSync(paths.archivePath, path.join(projErrors, 'latest_error.png'));
      } catch (_) {}
    }
    return paths;
  } catch (err) {
    console.warn(`⚠️ Failed to capture error screenshot (${prefix}):`, err.message);
    return null;
  }
}

/**
 * Appends human-readable and structured log entries to activity.log and reports_history.csv
 * @param {Object} entry - { timestamp, status, url, email, mode, reason, error, screenshot }
 */
function appendActivityLog(entry = {}) {
  try {
    ensureScreenshotDirs();
    const ts = entry.timestamp || new Date().toISOString();
    const status = (entry.status || 'unknown').toUpperCase();
    const url = entry.url || '—';
    const email = entry.email || '—';
    const mode = entry.mode || 'standard';
    const reason = entry.reason || 'spam';
    const rawError = entry.error ? String(entry.error.message || entry.error).replace(/\r?\n/g, ' ').trim() : '';
    const errText = rawError ? ` | Error: ${rawError}` : '';
    const screenshotText = entry.screenshot ? ` | Screenshot: ${String(entry.screenshot).trim()}` : '';

    const textLine = `[${ts}] [${status}] URL: ${url} | Email: ${email} | Mode: ${mode} | Reason: ${reason}${errText}${screenshotText}\n`;

    const writeToDir = (dir) => {
      try {
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        const logPath = path.join(dir, 'activity.log');
        // Prevent uncontrolled growth: rotate if file exceeds 10MB
        try {
          if (fs.existsSync(logPath) && fs.statSync(logPath).size > 10 * 1024 * 1024) {
            const oldLogPath = path.join(dir, 'activity.old.log');
            try { if (fs.existsSync(oldLogPath)) fs.unlinkSync(oldLogPath); } catch (_) {}
            fs.renameSync(logPath, oldLogPath);
          }
        } catch (_) {}

        // Plain text activity log
        fs.appendFileSync(logPath, textLine, 'utf8');

        // CSV report history
        const csvPath = path.join(dir, 'reports_history.csv');
        if (!fs.existsSync(csvPath)) {
          fs.writeFileSync(csvPath, 'Timestamp,Status,URL,Email,Mode,Reason,Error,Screenshot\n', 'utf8');
        }
        const safeCsv = (val) => `"${String(val || '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
        const csvLine = [
          safeCsv(ts),
          safeCsv(status),
          safeCsv(url),
          safeCsv(email),
          safeCsv(mode),
          safeCsv(reason),
          safeCsv(rawError),
          safeCsv(entry.screenshot || '')
        ].join(',') + '\n';
        fs.appendFileSync(csvPath, csvLine, 'utf8');
      } catch (_) {}
    };

    writeToDir(REPORT_LOGS_DIR);
    if (PROJECT_REPORT_LOGS_DIR && PROJECT_REPORT_LOGS_DIR !== REPORT_LOGS_DIR) {
      writeToDir(PROJECT_REPORT_LOGS_DIR);
    }
  } catch (err) {
    console.warn('⚠️ Could not write activity log file:', err.message);
  }
}

/**
 * Returns relative path of the most recently saved screenshot file in proofs or errors folder
 */
function getLatestScreenshot(category = 'proof') {
  try {
    const dir = category === 'proof' ? PROOFS_DIR : ERRORS_DIR;
    if (!fs.existsSync(dir)) {
      return category === 'proof' ? 'report_logs/proofs/latest_proof.png' : 'report_logs/errors/latest_error.png';
    }
    const files = fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.png') && !f.startsWith('latest_'));
    if (files.length === 0) {
      return category === 'proof' ? 'report_logs/proofs/latest_proof.png' : 'report_logs/errors/latest_error.png';
    }
    files.sort((a, b) => {
      try {
        return fs.statSync(path.join(dir, b)).mtimeMs - fs.statSync(path.join(dir, a)).mtimeMs;
      } catch (_) { return 0; }
    });
    return path.join('report_logs', category === 'proof' ? 'proofs' : 'errors', files[0]).replace(/\\/g, '/');
  } catch (_) {
    return category === 'proof' ? 'report_logs/proofs/latest_proof.png' : 'report_logs/errors/latest_error.png';
  }
}

module.exports = {
  REPORT_LOGS_DIR,
  PROJECT_REPORT_LOGS_DIR,
  PROOFS_DIR,
  ERRORS_DIR,
  ensureScreenshotDirs,
  getProofScreenshotPath,
  getErrorScreenshotPath,
  captureProofScreenshot,
  captureErrorScreenshot,
  appendActivityLog,
  getLatestScreenshot
};
