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
 * Case-insensitive normalized directory comparison for cross-platform resilience
 */
function isSameDir(d1, d2) {
  if (!d1 || !d2) return false;
  return path.resolve(d1).toLowerCase() === path.resolve(d2).toLowerCase();
}

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
    if (PROJECT_REPORT_LOGS_DIR && !isSameDir(PROJECT_REPORT_LOGS_DIR, REPORT_LOGS_DIR)) {
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
/**
 * Captures and archives a proof screenshot
 */
async function captureProofScreenshot(page, prefix = 'proof', options = { fullPage: true }) {
  if (!page || typeof page.screenshot !== 'function') return null;
  const paths = getProofScreenshotPath(prefix);
  const screenshotOpts = typeof options === 'object' && options !== null ? { ...options } : { fullPage: true };
  const stepName = screenshotOpts.stepName || 'PROOF_CAPTURED';
  const extraMeta = screenshotOpts.extraMeta || null;

  delete screenshotOpts.stepName;
  delete screenshotOpts.extraMeta;
  if (screenshotOpts.fullPage === undefined) screenshotOpts.fullPage = true;

  try {
    try {
      await page.screenshot({ path: paths.archivePath, ...screenshotOpts });
    } catch (ssErr) {
      await page.screenshot({ path: paths.archivePath, fullPage: false }).catch(() => {});
    }

    // Mirror to latest_proof.png within report_logs/proofs for instant reference
    try { fs.copyFileSync(paths.archivePath, paths.latestPath); } catch (_) {}

    // Companion Metadata (Zero-Injection)
    let pageUrl = 'N/A';
    let pageTitle = 'N/A';
    try { if (typeof page.url === 'function') pageUrl = page.url(); } catch (_) {}
    try { if (typeof page.title === 'function') pageTitle = await page.title(); } catch (_) {}

    const metaData = {
      timestamp: new Date().toISOString(),
      status: 'SUCCESS',
      prefix,
      filename: paths.filename,
      url: pageUrl,
      title: pageTitle,
      step: stepName,
      extra: extraMeta
    };

    const baseName = paths.filename.replace(/\.png$/i, '');
    const metaPath = path.join(PROOFS_DIR, `${baseName}.json`);
    const latestMetaPath = path.join(PROOFS_DIR, 'latest_proof.json');
    try {
      fs.writeFileSync(metaPath, JSON.stringify(metaData, null, 2), 'utf8');
      fs.copyFileSync(metaPath, latestMetaPath);
    } catch (_) {}

    // Mirror to project report_logs so files are also directly visible in workspace
    if (PROJECT_REPORT_LOGS_DIR && !isSameDir(PROJECT_REPORT_LOGS_DIR, REPORT_LOGS_DIR)) {
      try {
        const projProofs = path.join(PROJECT_REPORT_LOGS_DIR, 'proofs');
        if (!fs.existsSync(projProofs)) fs.mkdirSync(projProofs, { recursive: true });
        if (fs.existsSync(paths.archivePath)) {
          fs.copyFileSync(paths.archivePath, path.join(projProofs, paths.filename));
          fs.copyFileSync(paths.archivePath, path.join(projProofs, 'latest_proof.png'));
        }
        if (fs.existsSync(metaPath)) {
          fs.copyFileSync(metaPath, path.join(projProofs, `${baseName}.json`));
          fs.copyFileSync(metaPath, path.join(projProofs, 'latest_proof.json'));
        }
      } catch (_) {}
    }
    invalidateReportLogsCache();
    return paths;
  } catch (err) {
    console.warn(`⚠️ Failed to capture proof screenshot (${prefix}):`, err.message);
    return null;
  }
}

/**
 * Captures and archives an error screenshot with forensic metadata and HTML snapshot
 */
async function captureErrorScreenshot(page, prefix = 'error', options = { fullPage: true }) {
  if (!page || typeof page.screenshot !== 'function') return null;
  const paths = getErrorScreenshotPath(prefix);
  const screenshotOpts = typeof options === 'object' && options !== null ? { ...options } : { fullPage: true };
  const stepName = screenshotOpts.stepName || 'EXECUTION_ERROR';
  const selector = screenshotOpts.selector || null;
  const errorObj = screenshotOpts.error || null;
  const extraMeta = screenshotOpts.extraMeta || null;

  delete screenshotOpts.stepName;
  delete screenshotOpts.selector;
  delete screenshotOpts.error;
  delete screenshotOpts.extraMeta;
  if (screenshotOpts.fullPage === undefined) screenshotOpts.fullPage = true;

  try {
    try {
      await page.screenshot({ path: paths.archivePath, ...screenshotOpts });
    } catch (ssErr) {
      // Fallback: viewport screenshot if fullPage fails or hangs
      await page.screenshot({ path: paths.archivePath, fullPage: false }).catch(() => {});
    }

    // Mirror to latest_error.png within report_logs/errors for instant reference
    try { fs.copyFileSync(paths.archivePath, paths.latestPath); } catch (_) {}

    // Companion Metadata (Zero-Injection CDP Read)
    let pageUrl = 'N/A';
    let pageTitle = 'N/A';
    try { if (typeof page.url === 'function') pageUrl = page.url(); } catch (_) {}
    try { if (typeof page.title === 'function') pageTitle = await page.title(); } catch (_) {}

    const metaData = {
      timestamp: new Date().toISOString(),
      status: 'FAILED',
      prefix,
      filename: paths.filename,
      url: pageUrl,
      title: pageTitle,
      step: stepName,
      selector,
      error: errorObj ? {
        message: errorObj.message || String(errorObj),
        stack: errorObj.stack || null
      } : null,
      extra: extraMeta
    };

    const baseName = paths.filename.replace(/\.png$/i, '');
    const metaPath = path.join(ERRORS_DIR, `${baseName}.json`);
    const latestMetaPath = path.join(ERRORS_DIR, 'latest_error.json');
    try {
      fs.writeFileSync(metaPath, JSON.stringify(metaData, null, 2), 'utf8');
      fs.copyFileSync(metaPath, latestMetaPath);
    } catch (_) {}

    // Companion HTML Snapshot (Clean DOM Read, zero script injection)
    let capturedHtml = false;
    try {
      if (typeof page.content === 'function') {
        const html = await page.content();
        if (html && html.length > 50) {
          const htmlPath = path.join(ERRORS_DIR, `${baseName}.html`);
          const latestHtmlPath = path.join(ERRORS_DIR, 'latest_error.html');
          fs.writeFileSync(htmlPath, html, 'utf8');
          fs.copyFileSync(htmlPath, latestHtmlPath);
          capturedHtml = true;
        }
      }
    } catch (_) {}

    // Mirror to project report_logs so files are also directly visible in workspace
    if (PROJECT_REPORT_LOGS_DIR && !isSameDir(PROJECT_REPORT_LOGS_DIR, REPORT_LOGS_DIR)) {
      try {
        const projErrors = path.join(PROJECT_REPORT_LOGS_DIR, 'errors');
        if (!fs.existsSync(projErrors)) fs.mkdirSync(projErrors, { recursive: true });
        if (fs.existsSync(paths.archivePath)) {
          fs.copyFileSync(paths.archivePath, path.join(projErrors, paths.filename));
          fs.copyFileSync(paths.archivePath, path.join(projErrors, 'latest_error.png'));
        }
        if (fs.existsSync(metaPath)) {
          fs.copyFileSync(metaPath, path.join(projErrors, `${baseName}.json`));
          fs.copyFileSync(metaPath, path.join(projErrors, 'latest_error.json'));
        }
        if (capturedHtml) {
          const htmlPath = path.join(ERRORS_DIR, `${baseName}.html`);
          if (fs.existsSync(htmlPath)) {
            fs.copyFileSync(htmlPath, path.join(projErrors, `${baseName}.html`));
            fs.copyFileSync(htmlPath, path.join(projErrors, 'latest_error.html'));
          }
        }
      } catch (_) {}
    }
    invalidateReportLogsCache();
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
    if (PROJECT_REPORT_LOGS_DIR && !isSameDir(PROJECT_REPORT_LOGS_DIR, REPORT_LOGS_DIR)) {
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

/**
 * Helper to format bytes into readable KB / MB
 */
function formatBytes(bytes, decimals = 1) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

let _cachedReportLogs = null;
let _cachedReportLogsTime = 0;
const REPORT_LOGS_CACHE_TTL = 4000;

function invalidateReportLogsCache() {
  _cachedReportLogs = null;
  _cachedReportLogsTime = 0;
}

/**
 * Senior-grade resilient CSV line parser supporting quoted fields, escaped quotes, and empty values
 */
function parseCsvLine(line) {
  if (!line || typeof line !== 'string') return [];
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current.trim());
  return fields;
}

/**
 * Reads all diagnostic logs (proofs, errors, metadata, html dumps)
 * Returns a sorted list and storage summary.
 */
function getAllReportLogs(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && _cachedReportLogs && (now - _cachedReportLogsTime < REPORT_LOGS_CACHE_TTL)) {
    return _cachedReportLogs;
  }
  ensureScreenshotDirs();
  const logs = [];
  let totalSizeBytes = 0;
  let errorCount = 0;
  let proofCount = 0;

  // Pre-index reports_history.csv for fast email/url lookup
  const csvIndex = new Map();
  try {
    const csvPaths = [
      path.join(REPORT_LOGS_DIR, 'reports_history.csv'),
      PROJECT_REPORT_LOGS_DIR ? path.join(PROJECT_REPORT_LOGS_DIR, 'reports_history.csv') : null
    ].filter(Boolean);

    for (const cp of csvPaths) {
      if (fs.existsSync(cp)) {
        const lines = fs.readFileSync(cp, 'utf8').split(/\r?\n/);
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          const parts = parseCsvLine(line);
          if (parts && parts.length >= 8) {
            const clean = (val) => (val || '').replace(/^"|"$/g, '').trim();
            const ts = clean(parts[0]);
            const url = clean(parts[2]);
            const email = clean(parts[3]);
            const screenshot = clean(parts[7]);
            const sBase = path.basename(screenshot).replace(/\.png$/i, '');
            if (sBase) {
              csvIndex.set(sBase, { url, email, ts });
            }
          }
        }
      }
    }
  } catch (_) {}

  const processDirectory = (dir, category) => {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir);
    const pngFiles = entries.filter(f => f.toLowerCase().endsWith('.png') && !f.startsWith('latest_'));

    for (const file of pngFiles) {
      const fullPngPath = path.join(dir, file);
      let stat = null;
      try { stat = fs.statSync(fullPngPath); } catch (_) { continue; }

      const baseName = file.replace(/\.png$/i, '');
      const jsonFile = `${baseName}.json`;
      const htmlFile = `${baseName}.html`;
      const fullJsonPath = path.join(dir, jsonFile);
      const fullHtmlPath = path.join(dir, htmlFile);

      let meta = {};
      if (fs.existsSync(fullJsonPath)) {
        try {
          meta = JSON.parse(fs.readFileSync(fullJsonPath, 'utf8'));
        } catch (_) {}
      }

      const fromCsv = csvIndex.get(baseName) || null;
      const resolvedUrl = (meta.url && meta.url !== '—' && meta.url !== 'N/A')
        ? meta.url
        : (fromCsv && fromCsv.url && fromCsv.url !== '—' ? fromCsv.url : (meta.url || '—'));

      const resolvedEmail = meta.email
        || (meta.extra && meta.extra.email)
        || (fromCsv && fromCsv.email && fromCsv.email !== '—' ? fromCsv.email : null);

      const hasHtml = fs.existsSync(fullHtmlPath);
      let totalItemBytes = stat.size;
      if (fs.existsSync(fullJsonPath)) {
        try { totalItemBytes += fs.statSync(fullJsonPath).size; } catch (_) {}
      }
      if (hasHtml) {
        try { totalItemBytes += fs.statSync(fullHtmlPath).size; } catch (_) {}
      }

      totalSizeBytes += totalItemBytes;
      if (category === 'error') errorCount++;
      else proofCount++;

      logs.push({
        id: `${category}_${baseName}`,
        category, // 'error' or 'proof'
        filename: file,
        baseName,
        pngPath: fullPngPath,
        relativePath: path.join('report_logs', category === 'proof' ? 'proofs' : 'errors', file).replace(/\\/g, '/'),
        hasJson: fs.existsSync(fullJsonPath),
        jsonPath: fs.existsSync(fullJsonPath) ? fullJsonPath : null,
        hasHtml,
        htmlPath: hasHtml ? fullHtmlPath : null,
        htmlFilename: hasHtml ? htmlFile : null,
        sizeBytes: totalItemBytes,
        formattedSize: formatBytes(totalItemBytes),
        timestamp: meta.timestamp || stat.mtime.toISOString(),
        mtimeMs: stat.mtimeMs,
        url: resolvedUrl,
        email: resolvedEmail,
        title: meta.title || '—',
        step: meta.step || (category === 'proof' ? 'Task Completed' : 'Execution Failure'),
        selector: meta.selector || null,
        errorMessage: meta.error
          ? (typeof meta.error === 'string' ? meta.error : (meta.error.message || String(meta.error)))
          : (meta.errorMessage || null),
        errorStack: meta.error && meta.error.stack ? meta.error.stack : (meta.errorStack || null),
        extra: meta.extra || null
      });
    }
  };

  processDirectory(ERRORS_DIR, 'error');
  processDirectory(PROOFS_DIR, 'proof');

  // Check activity.log and csv size
  try {
    const actPath = path.join(REPORT_LOGS_DIR, 'activity.log');
    if (fs.existsSync(actPath)) totalSizeBytes += fs.statSync(actPath).size;
    const csvPath = path.join(REPORT_LOGS_DIR, 'reports_history.csv');
    if (fs.existsSync(csvPath)) totalSizeBytes += fs.statSync(csvPath).size;
  } catch (_) {}

  // Sort descending by modified time (newest first)
  logs.sort((a, b) => b.mtimeMs - a.mtimeMs);

  const result = {
    logs,
    summary: {
      total: logs.length,
      errors: errorCount,
      proofs: proofCount,
      totalSizeBytes,
      formattedTotalSize: formatBytes(totalSizeBytes)
    }
  };
  _cachedReportLogs = result;
  _cachedReportLogsTime = Date.now();
  return result;
}

/**
 * Clears report logs safely (all, errors only, or proofs only)
 */
function clearReportLogs(type = 'all') {
  invalidateReportLogsCache();
  ensureScreenshotDirs();
  let deletedCount = 0;

  const cleanDir = (dir) => {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);
    for (const f of files) {
      try {
        const full = path.join(dir, f);
        if (fs.statSync(full).isFile()) {
          fs.unlinkSync(full);
          deletedCount++;
        }
      } catch (_) {}
    }
  };

  if (type === 'all' || type === 'errors') {
    cleanDir(ERRORS_DIR);
    if (PROJECT_REPORT_LOGS_DIR && !isSameDir(PROJECT_REPORT_LOGS_DIR, REPORT_LOGS_DIR)) {
      cleanDir(path.join(PROJECT_REPORT_LOGS_DIR, 'errors'));
    }
  }

  if (type === 'all' || type === 'proofs') {
    cleanDir(PROOFS_DIR);
    if (PROJECT_REPORT_LOGS_DIR && !isSameDir(PROJECT_REPORT_LOGS_DIR, REPORT_LOGS_DIR)) {
      cleanDir(path.join(PROJECT_REPORT_LOGS_DIR, 'proofs'));
    }
  }

  return { success: true, deletedCount };
}

/**
 * Safely reads and returns HTML snapshot content
 */
function getReportHtmlContent(targetPath) {
  try {
    if (!targetPath || !fs.existsSync(targetPath)) {
      return { success: false, error: 'File not found' };
    }
    const stat = fs.statSync(targetPath);
    if (!stat.isFile()) {
      return { success: false, error: 'Target path is not a file' };
    }
    if (stat.size > 15 * 1024 * 1024) {
      return { success: false, error: 'HTML file exceeds 15MB limit' };
    }
    const html = fs.readFileSync(targetPath, 'utf8');
    return { success: true, html };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Bundles report logs, screenshots, html snapshots & an AI debug manual into a ZIP file
 */
async function exportDiagnosticBundle(destinationZipPath) {
  const { exec } = require('child_process');
  const util = require('util');
  const execAsync = util.promisify(exec);
  const os = require('os');

  ensureScreenshotDirs();

  // Create temporary staging directory
  const tempExportDir = path.join(os.tmpdir(), `mapsshield_export_${Date.now()}`);
  fs.mkdirSync(tempExportDir, { recursive: true });

  try {
    // 1. Copy error screenshots, html dumps and metadata
    const exportErrorsDir = path.join(tempExportDir, 'errors');
    fs.mkdirSync(exportErrorsDir, { recursive: true });
    if (fs.existsSync(ERRORS_DIR)) {
      for (const f of fs.readdirSync(ERRORS_DIR)) {
        try { fs.copyFileSync(path.join(ERRORS_DIR, f), path.join(exportErrorsDir, f)); } catch (_) {}
      }
    }

    // 2. Copy proofs
    const exportProofsDir = path.join(tempExportDir, 'proofs');
    fs.mkdirSync(exportProofsDir, { recursive: true });
    if (fs.existsSync(PROOFS_DIR)) {
      for (const f of fs.readdirSync(PROOFS_DIR)) {
        try { fs.copyFileSync(path.join(PROOFS_DIR, f), path.join(exportProofsDir, f)); } catch (_) {}
      }
    }

    // 3. Copy activity log and csv
    const actLog = path.join(REPORT_LOGS_DIR, 'activity.log');
    if (fs.existsSync(actLog)) {
      try { fs.copyFileSync(actLog, path.join(tempExportDir, 'activity.log')); } catch (_) {}
    }
    const csvLog = path.join(REPORT_LOGS_DIR, 'reports_history.csv');
    if (fs.existsSync(csvLog)) {
      try { fs.copyFileSync(csvLog, path.join(tempExportDir, 'reports_history.csv')); } catch (_) {}
    }

    // 4. Generate AI Debug Manual & Summary
    const { logs, summary } = getAllReportLogs();
    const recentErrors = logs.filter(l => l.category === 'error').slice(0, 5);

    const aiSummary = {
      exportedAt: new Date().toISOString(),
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      summary,
      recentErrors: recentErrors.map(e => ({
        timestamp: e.timestamp,
        filename: e.filename,
        step: e.step,
        selector: e.selector,
        url: e.url,
        errorMessage: e.errorMessage,
        hasHtml: e.hasHtml
      }))
    };
    fs.writeFileSync(path.join(tempExportDir, 'ai_diagnostic_summary.json'), JSON.stringify(aiSummary, null, 2), 'utf8');

    const aiManual = `# 🤖 MapsShield Pro - AI Diagnostic Package

This diagnostic bundle was automatically generated from **MapsShield Pro** to help you debug and resolve automation issues instantly using AI models like Google Gemini, Claude, or ChatGPT.

---

### 📦 Package Contents:
1. **/errors/**
   - \`*.png\` : Full-page / Viewport screenshots captured at the exact moment of failure.
   - \`*.html\` : Complete DOM HTML source of the page at the failure point. Open or search this file to inspect changed CSS selectors, button labels, or Google anti-bot challenges.
   - \`*.json\` : Failure metadata including the exact target URL, failing step, selector, and Node.js stack trace.
2. **/proofs/**
   - \`*.png\` & \`*.json\` : Successful report confirmations.
3. **activity.log** : Chronological execution audit trail.
4. **reports_history.csv** : Summary table of all executed reviews and statuses.
5. **ai_diagnostic_summary.json** : High-level failure telemetry.

---

### 💬 Recommended Prompt for AI:
Copy and paste this prompt to your AI assistant alongside the relevant files from this ZIP:

\`\`\`markdown
I am diagnosing an automation failure in MapsShield Pro.
Here is the error context:
- Target URL: ${recentErrors[0]?.url || 'See ai_diagnostic_summary.json'}
- Failing Step: ${recentErrors[0]?.step || 'Unknown'}
- Selector: ${recentErrors[0]?.selector || 'N/A'}
- Error: ${recentErrors[0]?.errorMessage || 'N/A'}

Please inspect the attached screenshot (\`${recentErrors[0]?.filename || 'error.png'}\`) and HTML dump (\`${recentErrors[0]?.htmlFilename || 'error.html'}\`).
Identify why this step failed (did Google change the DOM, was a captcha shown, or was the button hidden?) and provide the exact updated selector or code fix.
\`\`\`
`;
    fs.writeFileSync(path.join(tempExportDir, 'AI_DEBUG_INSTRUCTIONS.md'), aiManual, 'utf8');

    // 5. Compress using PowerShell Compress-Archive (Windows) or zip (POSIX)
    if (fs.existsSync(destinationZipPath)) {
      try { fs.unlinkSync(destinationZipPath); } catch (_) {}
    }

    if (process.platform === 'win32') {
      const safeSource = `${tempExportDir.replace(/'/g, "''")}\\*`;
      const safeDest = destinationZipPath.replace(/'/g, "''");
      const psCmd = `powershell -NoProfile -NonInteractive -Command "Compress-Archive -Path '${safeSource}' -DestinationPath '${safeDest}' -Force"`;
      await execAsync(psCmd, { windowsHide: true, timeout: 60000 });
    } else {
      await execAsync(`zip -r "${destinationZipPath.replace(/"/g, '\\"')}" .`, { cwd: tempExportDir, timeout: 60000 });
    }

    if (!fs.existsSync(destinationZipPath)) {
      throw new Error(`Failed to create ZIP package at: ${destinationZipPath}`);
    }

    return { success: true, path: destinationZipPath };
  } finally {
    // Cleanup staging directory
    try {
      fs.rmSync(tempExportDir, { recursive: true, force: true });
    } catch (_) {}
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
  getLatestScreenshot,
  getAllReportLogs,
  clearReportLogs,
  invalidateReportLogsCache,
  getReportHtmlContent,
  exportDiagnosticBundle
};

