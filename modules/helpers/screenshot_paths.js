/**
 * modules/helpers/screenshot_paths.js
 * Centralized Manager for Report Proofs & Diagnostic Error Screenshots
 */

const fs = require('fs');
const path = require('path');

const REPORT_LOGS_DIR = process.env.MAPSSHIELD_USER_DATA
  ? path.join(process.env.MAPSSHIELD_USER_DATA, 'report_logs')
  : path.resolve(__dirname, '../../report_logs');
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
    return paths;
  } catch (err) {
    console.warn(`⚠️ Failed to capture error screenshot (${prefix}):`, err.message);
    return null;
  }
}

module.exports = {
  REPORT_LOGS_DIR,
  PROOFS_DIR,
  ERRORS_DIR,
  ensureScreenshotDirs,
  getProofScreenshotPath,
  getErrorScreenshotPath,
  captureProofScreenshot,
  captureErrorScreenshot
};
