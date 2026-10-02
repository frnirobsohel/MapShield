// Suppress Node.js ExperimentalWarning in child runner process
const origEmit = process.emit;
process.emit = function (name, data, ...args) {
  if (name === 'warning' && typeof data === 'object' && (data.name === 'ExperimentalWarning' || (data.message && data.message.includes('SQLite')))) {
    return false;
  }
  return origEmit.apply(process, [name, data, ...args]);
};
process.__experimentalWarningPatched = true;

const fs = require('fs');
const path = require('path');
const { getDatabase } = require('./database/db');
const { isNetworkError } = require('./modules/network');
const { PROOFS_DIR, ERRORS_DIR, getLatestScreenshot } = require('./modules/helpers/screenshot_paths');

// Helper to notify Electron parent process (with CLI direct DB fallback)
function notifyParent(type, data) {
  if (process.send) {
    process.send({ type, data });
  } else {
    try {
      const db = getDatabase();
      if (type === 'account_update' && data && data.email) {
        db.updateAccountStatus(data.email, data);
      } else if (type === 'link_update' && data && data.url) {
        db.updateLinkProgress(data.url, data);
      }
    } catch (_) {}
  }
}

/**
 * Retrieves execution payload safely via native IPC or fallback environment
 */
function getPayload() {
  return new Promise((resolve) => {
    // 1. If passed via env (legacy / CLI fallback)
    if (process.env.AGENT_PAYLOAD) {
      try {
        const parsed = JSON.parse(process.env.AGENT_PAYLOAD);
        delete process.env.AGENT_PAYLOAD;
        return resolve(parsed);
      } catch (e) {
        delete process.env.AGENT_PAYLOAD;
      }
    }

    // 2. If running under Electron fork with IPC, wait for 'init_payload' message
    if (process.send) {
      const handler = (msg) => {
        if (msg && msg.type === 'init_payload') {
          process.removeListener('message', handler);
          resolve(msg.payload || {});
        }
      };
      process.on('message', handler);
      setTimeout(() => {
        process.removeListener('message', handler);
        resolve({});
      }, 3500);
      return;
    }

    resolve({});
  });
}

// Watch for screenshot generation (both success proof in report_logs/proofs and error diagnostics in report_logs/errors)
try {
  fs.mkdirSync(PROOFS_DIR, { recursive: true });
  fs.mkdirSync(ERRORS_DIR, { recursive: true });
} catch (_) {}

const legacyWatchedScreenshots = [
  'maps_report_spam_submitted.png',
  'legal_notice_submitted.png',
  'error_screenshot.png',
  'maps_error.png',
  'maps_reason_error.png',
  'debug_try_another_way.png'
];

const watchedScreenshotMtimes = new Map();

function initExistingScreenshotMtimes() {
  try {
    if (fs.existsSync(PROOFS_DIR)) {
      for (const file of fs.readdirSync(PROOFS_DIR)) {
        const p = path.join(PROOFS_DIR, file);
        try { watchedScreenshotMtimes.set(p, fs.statSync(p).mtimeMs); } catch (_) {}
      }
    }
    if (fs.existsSync(ERRORS_DIR)) {
      for (const file of fs.readdirSync(ERRORS_DIR)) {
        const p = path.join(ERRORS_DIR, file);
        try { watchedScreenshotMtimes.set(p, fs.statSync(p).mtimeMs); } catch (_) {}
      }
    }
    for (const sName of legacyWatchedScreenshots) {
      const p = path.join(__dirname, sName);
      if (fs.existsSync(p)) {
        try { watchedScreenshotMtimes.set(p, fs.statSync(p).mtimeMs); } catch (_) {}
      }
    }
  } catch (_) {}
}
initExistingScreenshotMtimes();

function checkAndNotifyScreenshot(fullPath, filename, category = 'proof') {
  try {
    if (!fs.existsSync(fullPath)) return;
    const stat = fs.statSync(fullPath);
    if (!stat.size || stat.size < 512) return; // Wait for write to finish
    const lastMtime = watchedScreenshotMtimes.get(fullPath) || 0;
    if (stat.mtimeMs > lastMtime) {
      watchedScreenshotMtimes.set(fullPath, stat.mtimeMs);
      // Small delay to ensure disk write stream is completely flushed by browser
      setTimeout(() => {
        fs.promises.readFile(fullPath).then(buffer => {
          if (!buffer || buffer.length < 512) return;
          const b64 = buffer.toString('base64');
          notifyParent('screenshot', {
            category, // 'proof' or 'error'
            folder: category === 'proof' ? 'report_logs/proofs' : 'report_logs/errors',
            filename,
            base64: 'data:image/png;base64,' + b64,
            timestamp: new Date().toLocaleTimeString()
          });
        }).catch(() => {});
      }, 200);
    }
  } catch (_) {}
}

function flushScreenshots() {
  try {
    // 1. Scan report_logs/proofs (skip mirror latest_proof.png to avoid duplicate notifications)
    if (fs.existsSync(PROOFS_DIR)) {
      const proofFiles = fs.readdirSync(PROOFS_DIR);
      for (const file of proofFiles) {
        if (file.toLowerCase().endsWith('.png') && !file.startsWith('latest_')) {
          checkAndNotifyScreenshot(path.join(PROOFS_DIR, file), file, 'proof');
        }
      }
    }

    // 2. Scan report_logs/errors (skip mirror latest_error.png to avoid duplicate notifications)
    if (fs.existsSync(ERRORS_DIR)) {
      const errorFiles = fs.readdirSync(ERRORS_DIR);
      for (const file of errorFiles) {
        if (file.toLowerCase().endsWith('.png') && !file.startsWith('latest_')) {
          checkAndNotifyScreenshot(path.join(ERRORS_DIR, file), file, 'error');
        }
      }
    }

    // 3. Fallback for root files (legacy)
    for (const sName of legacyWatchedScreenshots) {
      const p = path.join(__dirname, sName);
      if (fs.existsSync(p)) {
        const isError = sName.includes('error') || sName.includes('debug');
        checkAndNotifyScreenshot(p, sName, isError ? 'error' : 'proof');
      }
    }
  } catch (e) {}
}

const screenshotWatcher = setInterval(flushScreenshots, 1200);

// Graceful termination handling
process.on('message', async (msg) => {
  if (msg && msg.type === 'stop') {
    console.log('\n🛑 Stop signal received from application. Terminating cleanly...');
    try {
      const { forceCloseBrowser } = require('./agent');
      await forceCloseBrowser();
    } catch (e) {}
    clearInterval(screenshotWatcher);
    flushScreenshots();
    process.exit(0);
  }
});

process.on('SIGTERM', async () => {
  try {
    const { forceCloseBrowser } = require('./agent');
    await forceCloseBrowser();
  } catch (e) {}
  clearInterval(screenshotWatcher);
  process.exit(0);
});

process.on('SIGINT', async () => {
  try {
    const { forceCloseBrowser } = require('./agent');
    await forceCloseBrowser();
  } catch (e) {}
  clearInterval(screenshotWatcher);
  process.exit(0);
});

async function executeQueue() {
  const { runAgentCore } = require('./agent');

  const payload = await getPayload();

  // Non-sensitive runtime settings
  if (payload.reportReason) process.env.MAPS_REPORT_REASON = payload.reportReason;
  if (payload.reportType) process.env.MAPS_REPORT_TYPE = payload.reportType;
  if (payload.browserPath) process.env.BROWSER_PATH = payload.browserPath;
  if (payload.headless !== undefined) process.env.HEADLESS = payload.headless ? 'true' : 'false';
  if (payload.aiApiKey) process.env.AI_API_KEY = payload.aiApiKey;
  if (payload.aiProvider) process.env.AI_PROVIDER = payload.aiProvider;
  if (payload.aiModel) process.env.AI_MODEL = payload.aiModel;
  if (payload.aiInspection !== undefined) process.env.AI_INSPECTION = payload.aiInspection ? 'true' : 'false';
  if (payload.captchaApiKey) process.env.TWOCAPTCHA_API_KEY = payload.captchaApiKey;
  if (payload.captchaAutoSolve !== undefined) process.env.CAPTCHA_AUTO_SOLVE = payload.captchaAutoSolve ? 'true' : 'false';

  // AI configuration resolution
  let aiConfig = {
    aiProvider: payload.aiProvider,
    aiApiKey: payload.aiApiKey,
    aiModel: payload.aiModel,
    aiInspection: payload.aiInspection
  };

  if (!aiConfig.aiApiKey) {
    try {
      const db = getDatabase();
      const settings = db.getSettings();
      if (settings.aiApiKey) {
        aiConfig = {
          aiProvider: aiConfig.aiProvider || settings.aiProvider || 'gemini',
          aiApiKey: settings.aiApiKey,
          aiModel: aiConfig.aiModel || settings.aiModel || 'gemini-2.0-flash',
          aiInspection: aiConfig.aiInspection !== undefined ? aiConfig.aiInspection : (settings.aiInspection || false)
        };
      }
    } catch (e) {
      console.warn('⚠️ Settings fallback notice:', e.message);
    }
  }

  // Browser selection pool (for randomized browser rotation across jobs)
  const browserPool = Array.isArray(payload.selectedBrowsers) && payload.selectedBrowsers.length > 0
    ? payload.selectedBrowsers
    : (payload.browserPath ? [payload.browserPath] : []);

  // Parse target URLs (one or multiple, objects or strings)
  let rawTargetList = [];
  if (Array.isArray(payload.urls) && payload.urls.length > 0) {
    rawTargetList = payload.urls;
  } else if (payload.url) {
    rawTargetList = [payload.url];
  } else {
    try {
      const db = getDatabase();
      const links = db.getLinks();
      if (Array.isArray(links) && links.length > 0) {
        rawTargetList = links;
      }
    } catch (e) {}
  }

  if (rawTargetList.length === 0) {
    rawTargetList = ['https://maps.app.goo.gl/S2ejSm9dnnCwAjoq7'];
  }

  // Normalize each target to a clean object
  const targetUrls = rawTargetList.map(item => {
    if (typeof item === 'object' && item !== null) {
      const rawUrl = (item.url || '').trim();
      if (!rawUrl) return null;
      return {
        url: rawUrl,
        mode: item.mode || payload.reportType || 'standard',
        reason: item.reason || payload.reportReason || 'spam',
        targetCount: Math.max(1, parseInt(item.targetCount, 10) || 1),
        doneCount: Math.max(0, parseInt(item.doneCount, 10) || 0),
        businessName: (item.businessName || '').trim(),
        country: (item.country || '').trim()
      };
    } else if (typeof item === 'string') {
      const rawUrl = item.trim();
      if (!rawUrl) return null;
      return {
        url: rawUrl,
        mode: payload.reportType || 'standard',
        reason: payload.reportReason || 'spam',
        targetCount: 1,
        doneCount: 0,
        businessName: '',
        country: ''
      };
    }
    return null;
  }).filter(Boolean);

  console.log('🚀 Agent Runner Initialized');
  console.log(`🌐 Target Browser: ${payload.browserPath || 'Google Chrome (Default)'}`);
  console.log(`⚖️ Report Mode: ${payload.reportType === 'legal' ? 'Report a Legal Notice' : 'Standard Policy Report (' + (payload.reportReason || 'spam') + ')'}`);
  console.log(`📋 Target Queue: ${targetUrls.length} Review URL(s) to process\n`);

  let accounts = Array.isArray(payload.accounts) && payload.accounts.length > 0 ? payload.accounts : [];
  if (accounts.length === 0) {
    try {
      const db = getDatabase();
      accounts = db.getAccounts();
    } catch (e) {
      console.warn('⚠️ Could not load accounts from database:', e.message);
    }
  }
  if (accounts.length === 0 && payload.email) {
    accounts = [
      {
        email: payload.email,
        password: payload.password,
        twoFactor: payload.twoFactor || payload['2fa'] || '',
        backupCode: payload.backupCode
      }
    ];
  }
  accounts = accounts.filter(a => a && a.email);

  // Filter out any accounts that have already been used (1 report per account policy)
  // An account can only be reused once its status/history is cleared/reset
  const unusedAccounts = accounts.filter(a => {
    if (!a || !a.email) return false;
    if (a.used === true || a.used === 1) return false;
    if (typeof a.usedCount === 'number' && a.usedCount > 0) return false;
    if (a.status === 'success') return false;
    return true;
  });

  if (accounts.length > 0 && unusedAccounts.length === 0) {
    console.error('\n❌ [Account Policy]: All loaded accounts have already been used for reports.');
    console.error('🔒 Rule: Each account can perform at most 1 report until its history is cleared.');
    console.error('👉 Please import new accounts or click "Reset Account History" in the Accounts tab.\n');
    notifyParent('status', {
      text: 'Blocked: All accounts already used. Reset account history to re-enable them.',
      progress: 0,
      current: 0,
      total: 0
    });
    clearInterval(screenshotWatcher);
    process.exit(1);
  }

  // Quota-Driven Smart Queue Construction with Strict 1-Account = 1-Report:
  const jobs = [];
  let accountCursor = 0;

  for (const target of targetUrls) {
    const targetCount = target.targetCount || 1;
    const doneCount = target.doneCount || 0;
    const remaining = Math.max(0, targetCount - doneCount);

    for (let r = 0; r < remaining; r++) {
      if (accounts.length > 0) {
        if (accountCursor >= unusedAccounts.length) {
          console.warn(`⚠️ Account quota reached: No more unused accounts available (1 report per account). Remaining target reports postponed.`);
          break;
        }
        const assignedAccount = unusedAccounts[accountCursor];
        accountCursor++;

        // Resolve randomized category if multiple pre-selected categories exist
        let assignedReason = target.reason || payload.reportReason || 'spam';
        const rawCats = target.categories || target.reason || '';
        let catList = [];
        if (Array.isArray(rawCats)) {
          catList = rawCats;
        } else if (typeof rawCats === 'string' && rawCats.includes(',')) {
          catList = rawCats.split(',').map(s => s.trim()).filter(Boolean);
        }
        if (catList.length > 0) {
          assignedReason = catList[Math.floor(Math.random() * catList.length)];
        }

        jobs.push({
          url: target.url,
          mode: target.mode,
          reason: assignedReason,
          targetCount: targetCount,
          reportNum: doneCount + r + 1,
          account: assignedAccount,
          businessName: target.businessName || '',
          country: target.country || ''
        });
      } else {
        // Session-only mode (no user credentials configured)
        // Guard against duplicate identity reports: in session-only mode, repeated reports from the identical session identity risk spam-flagging
        if (r > 0) {
          console.warn(`⚠️ Session-only mode: Target "${target.url}" capped to 1 report per run to prevent duplicate identity detection (import Google Accounts to report multiple times).`);
          break;
        }
        let assignedReason = target.reason || payload.reportReason || 'spam';
        const rawCats = target.categories || target.reason || '';
        let catList = [];
        if (Array.isArray(rawCats)) {
          catList = rawCats;
        } else if (typeof rawCats === 'string' && rawCats.includes(',')) {
          catList = rawCats.split(',').map(s => s.trim()).filter(Boolean);
        }
        if (catList.length > 0) {
          assignedReason = catList[Math.floor(Math.random() * catList.length)];
        }

        jobs.push({
          url: target.url,
          mode: target.mode,
          reason: assignedReason,
          targetCount: targetCount,
          reportNum: doneCount + r + 1,
          account: null,
          businessName: target.businessName || '',
          country: target.country || ''
        });
      }
    }
    if (accounts.length > 0 && accountCursor >= unusedAccounts.length) {
      break;
    }
  }

  // If all links were already met, schedule 1 report per link if unused accounts exist
  if (jobs.length === 0 && targetUrls.length > 0 && (accounts.length === 0 || unusedAccounts.length > 0)) {
    console.log('ℹ️ All target quotas were previously met. Scheduling 1 fresh report per target...');
    for (const target of targetUrls) {
      if (accounts.length > 0 && accountCursor >= unusedAccounts.length) break;
      const assignedAccount = accounts.length > 0 ? unusedAccounts[accountCursor++] : null;
      let assignedReason = target.reason || payload.reportReason || 'spam';
      const rawCats = target.categories || target.reason || '';
      let catList = [];
      if (Array.isArray(rawCats)) {
        catList = rawCats;
      } else if (typeof rawCats === 'string' && rawCats.includes(',')) {
        catList = rawCats.split(',').map(s => s.trim()).filter(Boolean);
      }
      if (catList.length > 0) {
        assignedReason = catList[Math.floor(Math.random() * catList.length)];
      }

      jobs.push({
        url: target.url,
        mode: target.mode,
        reason: assignedReason,
        targetCount: (target.targetCount || 1) + 1,
        reportNum: (target.doneCount || 0) + 1,
        account: assignedAccount,
        businessName: target.businessName || '',
        country: target.country || ''
      });
    }
  }

  console.log(`📋 Resolved Task Queue: ${jobs.length} Job(s) scheduled across ${targetUrls.length} target URL(s).\n`);

  let wasAbortedByNetwork = false;
  let processedCount = 0;

  for (let i = 0; i < jobs.length; i++) {
    const currentJob = jobs[i];
    const currentUrl = currentJob.url;
    const currentAccount = currentJob.account;

    notifyParent('status', {
      text: `Processing Review ${i + 1} of ${jobs.length}${currentAccount ? ' (' + currentAccount.email + ')' : ''}`,
      progress: Math.round(((i) / jobs.length) * 100),
      current: i + 1,
      total: jobs.length
    });

    let currentProxy = '';
    if (payload.proxy && payload.proxy.enabled) {
      let pool = Array.isArray(payload.proxy.list) && payload.proxy.list.length > 0 ? payload.proxy.list : null;
      if (!pool) {
        try {
          const db = getDatabase();
          const dbProxies = db.getProxies();
          if (Array.isArray(dbProxies) && dbProxies.length > 0) {
            pool = dbProxies;
          }
        } catch (e) {}
      }

      if (payload.proxy.mode === 'rotate' && pool && pool.length > 0) {
        const item = pool[i % pool.length];
        currentProxy = typeof item === 'object' && item.formatted ? item.formatted : (typeof item === 'object' ? `${item.host}:${item.port}` : String(item));
      } else if (payload.proxy.server) {
        currentProxy = typeof payload.proxy.server === 'object' && payload.proxy.server.formatted ? payload.proxy.server.formatted : String(payload.proxy.server);
      } else if (pool && pool.length > 0) {
        const item = pool[0];
        currentProxy = typeof item === 'object' && item.formatted ? item.formatted : (typeof item === 'object' ? `${item.host}:${item.port}` : String(item));
      }
    }

    let currentBrowserPath = payload.browserPath;
    if (browserPool.length > 0) {
      if (payload.randomBrowser || browserPool.length > 1) {
        const pick = browserPool[Math.floor(Math.random() * browserPool.length)];
        currentBrowserPath = (typeof pick === 'object' && pick.path) ? pick.path : String(pick);
      } else {
        const pick = browserPool[0];
        currentBrowserPath = (typeof pick === 'object' && pick.path) ? pick.path : String(pick);
      }
    }

    console.log(`\n-------------------------------------------------------`);
    console.log(`🎯 [Job ${i + 1}/${jobs.length}] URL: ${currentUrl} (Report #${currentJob.reportNum} of ${currentJob.targetCount})`);
    if (currentAccount) {
      console.log(`👤 Using Account: ${currentAccount.email}`);
    }
    if (currentProxy) {
      console.log(`🌐 Using Proxy: ${currentProxy}`);
    }
    if (currentBrowserPath) {
      console.log(`🚀 Using Browser: ${currentBrowserPath}`);
    }
    console.log(`-------------------------------------------------------\n`);

    try {
      const dbSettings = (() => {
        try { return getDatabase().getSettings(); } catch (_) { return {}; }
      })();
      const senderInfo = {
        fullName: payload.legalFullName || dbSettings.legalFullName || '',
        businessName: currentJob.businessName || payload.legalBusinessName || dbSettings.legalBusinessName || 'the business',
        country: currentJob.country || payload.legalCountry || dbSettings.legalCountry || 'United States',
        email: currentAccount ? currentAccount.email : (payload.email || '')
      };

      await runAgentCore({
        email: currentAccount ? currentAccount.email : undefined,
        password: currentAccount ? currentAccount.password : undefined,
        twoFactor: currentAccount ? (currentAccount.twoFactor || currentAccount['2fa']) : undefined,
        backupCode: currentAccount ? currentAccount.backupCode : undefined,
        reviewUrl: currentUrl,
        reportType: currentJob.mode || payload.reportType || 'standard',
        reportReason: currentJob.reason || payload.reportReason || 'spam',
        browserPath: currentBrowserPath,
        proxyServer: currentProxy || undefined,
        headless: payload.headless === true,
        aiOptions: aiConfig,
        senderInfo,
        captchaApiKey: payload.captchaApiKey || dbSettings.captchaApiKey || undefined,
        captchaAutoSolve: payload.captchaAutoSolve !== undefined ? payload.captchaAutoSolve : (dbSettings.captchaAutoSolve !== false),
        isLast: i === jobs.length - 1,
        isSubJob: true
      });
      console.log(`\n✅ [Job ${i + 1}/${jobs.length}] Completed successfully! (${currentJob.reportNum}/${currentJob.targetCount})`);

      // Record Audit Entry to SQLite
      try {
        const db = getDatabase();
        db.recordAuditLog({
          url: currentUrl,
          email: currentAccount ? currentAccount.email : null,
          proxy: currentProxy || null,
          status: 'completed',
          reason: currentJob.reason || payload.reportReason || 'spam',
          mode: currentJob.mode || payload.reportType || 'standard',
          error: null,
          screenshot: getLatestScreenshot('proof'),
          timestamp: new Date().toISOString()
        });
      } catch (e) {
        console.warn('[SQLite Audit] Notice:', e.message);
      }

      if (currentAccount && currentAccount.email) {
        notifyParent('account_update', {
          email: currentAccount.email,
          status: 'success',
          used: true,
          error: null,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
      }
      notifyParent('link_update', {
        url: currentUrl,
        status: 'completed',
        targetCount: currentJob.targetCount,
        reportNum: currentJob.reportNum,
        error: null,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });
      processedCount = i + 1;
    } catch (err) {
      console.error(`\n❌ [Job ${i + 1}/${jobs.length}] Error:`, err.message);

      const isNetwork = isNetworkError(err);

      if (isNetwork) {
        wasAbortedByNetwork = true;
        processedCount = i;

        console.error('\n' + '='.repeat(68));
        console.error('🛑 [NETWORK DISCONNECTED] Internet connection or DNS lost!');
        console.error(`⚠️ Detected Network Error: ${err.message}`);
        console.error('🛡️ [ACCOUNT SAFETY ACTIVATED]');
        console.error('🛡️ Preserving account without marking as used or failed.');
        console.error('🛑 Halting review queue immediately to prevent burning accounts.');
        console.error('='.repeat(68) + '\n');

        // Record Network Failure Audit Entry to SQLite
        try {
          const db = getDatabase();
          db.recordAuditLog({
            url: currentUrl,
            email: currentAccount ? currentAccount.email : null,
            proxy: currentProxy || null,
            status: 'network_error',
            reason: currentJob.reason || payload.reportReason || 'spam',
            mode: currentJob.mode || payload.reportType || 'standard',
            error: err.message || 'Network disconnected',
            screenshot: getLatestScreenshot('error'),
            timestamp: new Date().toISOString()
          });
        } catch (e) {
          console.warn('[SQLite Audit] Notice:', e.message);
        }

        // Account is preserved: NOT marked as used! Status preserved as 'ready'
        if (currentAccount && currentAccount.email) {
          notifyParent('account_update', {
            email: currentAccount.email,
            status: 'ready',
            used: false,
            error: 'Network disconnected: ' + err.message,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          });
        }

        notifyParent('link_update', {
          url: currentUrl,
          status: 'paused',
          error: 'Network disconnected: ' + err.message,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });

        notifyParent('status', {
          text: `⚠️ Execution paused: Internet connection lost (${err.message})`,
          progress: Math.round(((i) / jobs.length) * 100),
          current: i,
          total: jobs.length,
          networkError: true
        });

        // Break loop to completely stop runner from burning subsequent accounts
        break;
      }

      // ── Phone Verification Wall ──────────────────────────────────────────────
      // Google is asking for a phone number. We cannot bypass this.
      // Safe action: skip this account silently and move on to the next job.
      const isPhoneWall = err.message && err.message.startsWith('PHONE_VERIFICATION_REQUIRED');
      if (isPhoneWall) {
        console.warn(`\n📵 [Phone Wall] Account "${currentAccount ? currentAccount.email : 'unknown'}" requires phone verification — skipping.`);
        console.warn(`⏭️  Moving to next account in queue...\n`);

        // Audit log: phone wall skip
        try {
          const db = getDatabase();
          db.recordAuditLog({
            url: currentUrl,
            email: currentAccount ? currentAccount.email : null,
            proxy: currentProxy || null,
            status: 'skipped',
            reason: currentJob.reason || payload.reportReason || 'spam',
            mode: currentJob.mode || payload.reportType || 'standard',
            error: 'Phone verification required — account skipped',
            screenshot: null,
            timestamp: new Date().toISOString()
          });
        } catch (e) {
          console.warn('[SQLite Audit] Notice:', e.message);
        }

        // Notify UI: mark account as skipped (NOT used, NOT failed — preserves reuse potential)
        if (currentAccount && currentAccount.email) {
          notifyParent('account_update', {
            email: currentAccount.email,
            status: 'skipped',
            used: false,
            error: 'Phone verification required',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          });
        }

        notifyParent('link_update', {
          url: currentUrl,
          status: 'skipped',
          error: 'Account skipped: phone verification required',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });

        processedCount = i + 1;
        // continue to next job — DO NOT break, DO NOT fall through to generic failure handler
        continue;
      }
      // ─────────────────────────────────────────────────────────────────────────

      processedCount = i + 1;

      // Record Failed Audit Entry to SQLite
      try {
        const db = getDatabase();
        db.recordAuditLog({
          url: currentUrl,
          email: currentAccount ? currentAccount.email : null,
          proxy: currentProxy || null,
          status: 'failed',
          reason: currentJob.reason || payload.reportReason || 'spam',
          mode: currentJob.mode || payload.reportType || 'standard',
          error: err.message || 'Report execution failed',
          screenshot: getLatestScreenshot('error'),
          timestamp: new Date().toISOString()
        });
      } catch (e) {
        console.warn('[SQLite Audit] Notice:', e.message);
      }

      if (currentAccount && currentAccount.email) {
        notifyParent('account_update', {
          email: currentAccount.email,
          status: 'failed',
          used: false, // Strict Quota Preservation: Task was incomplete/failed, do NOT mark as used!
          error: err.message || 'Login or reporting failed',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
        console.log(`🛡️ [ACCOUNT PRESERVED] Account "${currentAccount.email}" was NOT burned (preserved as unused with used: 0).`);
      }

      // If a proxy was in use during this failed job, record proxy diagnostic status
      if (currentProxy) {
        try {
          const db = getDatabase();
          if (typeof db.updateProxyStatus === 'function') {
            db.updateProxyStatus(currentProxy, {
              status: 'error',
              error: err.message || 'Task failed while using proxy',
              timestamp: new Date().toISOString()
            });
          }
        } catch (pe) {
          console.warn('[Proxy Tracking] Notice:', pe.message);
        }
      }

      notifyParent('link_update', {
        url: currentUrl,
        status: 'failed',
        error: err.message || 'Report execution failed',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });
    }

    // Rate limiting: Add cooldown between successive jobs to reduce Google detection risk
    if (i < jobs.length - 1) {
      const cooldownMs = Math.floor(Math.random() * 7000) + 8000; // 8-15 seconds
      console.log(`⏱️ [Rate Limit] Cooling down for ${(cooldownMs / 1000).toFixed(1)}s before next job...`);
      await new Promise(r => setTimeout(r, cooldownMs));
    }
  }

  if (wasAbortedByNetwork) {
    notifyParent('status', {
      text: 'Execution halted: Internet connection lost. Remaining accounts preserved.',
      progress: Math.round((processedCount / jobs.length) * 100),
      current: processedCount,
      total: jobs.length,
      networkError: true
    });
    console.log('\n🛑 Execution stopped due to network disconnection.');
  } else {
    notifyParent('status', {
      text: 'All reviews in queue processed!',
      progress: 100,
      current: jobs.length,
      total: jobs.length
    });
    console.log('\n🏁 Queue execution finished.');
  }
  process.exit(0);
}

executeQueue().catch(err => {
  console.error('Fatal Runner Error:', err);
  clearInterval(screenshotWatcher);
  flushScreenshots();
  process.exit(1);
});
