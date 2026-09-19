// Suppress Node.js ExperimentalWarning in child runner process
const origEmit = process.emit;
process.emit = function (name, data, ...args) {
  if (name === 'warning' && typeof data === 'object' && (data.name === 'ExperimentalWarning' || (data.message && data.message.includes('SQLite')))) {
    return false;
  }
  return origEmit.apply(process, [name, data, ...args]);
};

const fs = require('fs');
const path = require('path');
const { getDatabase } = require('./database/db');

// Read payload passed from Electron
const payloadRaw = process.env.AGENT_PAYLOAD;
let payload = {};
try {
  if (payloadRaw) payload = JSON.parse(payloadRaw);
} catch (e) {
  console.error('Failed to parse AGENT_PAYLOAD:', e.message);
}

// Override environment variables with user-configured values from UI
if (payload.email) process.env.GOOGLE_EMAIL = payload.email;
if (payload.password) process.env.GOOGLE_PASSWORD = payload.password;
if (payload.twoFactor || payload['2fa']) process.env.GOOGLE_2FA_SECRET = payload.twoFactor || payload['2fa'];
if (payload.backupCode) process.env.GOOGLE_BACKUP_CODE = payload.backupCode;
if (payload.reportReason) process.env.MAPS_REPORT_REASON = payload.reportReason;
if (payload.reportType) process.env.MAPS_REPORT_TYPE = payload.reportType;
if (payload.browserPath) process.env.BROWSER_PATH = payload.browserPath;
if (payload.headless !== undefined) process.env.HEADLESS = payload.headless ? 'true' : 'false';
if (payload.aiApiKey) process.env.AI_API_KEY = payload.aiApiKey;
if (payload.aiProvider) process.env.AI_PROVIDER = payload.aiProvider;
if (payload.aiModel) process.env.AI_MODEL = payload.aiModel;
if (payload.aiInspection !== undefined) process.env.AI_INSPECTION = payload.aiInspection ? 'true' : 'false';

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
  } catch (e) {}
}

// Browser selection pool (for randomized browser rotation across jobs)
const browserPool = Array.isArray(payload.selectedBrowsers) && payload.selectedBrowsers.length > 0
  ? payload.selectedBrowsers
  : (payload.browserPath ? [payload.browserPath] : []);

// Helper to notify Electron parent process
function notifyParent(type, data) {
  if (process.send) {
    process.send({ type, data });
  }
}

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

// Normalize each target to a clean object { url, mode, reason, targetCount, doneCount }
const targetUrls = rawTargetList.map(item => {
  if (typeof item === 'object' && item !== null) {
    const rawUrl = (item.url || '').trim();
    if (!rawUrl) return null;
    return {
      url: rawUrl,
      mode: item.mode || payload.reportType || 'standard',
      reason: item.reason || payload.reportReason || 'spam',
      targetCount: Math.max(1, parseInt(item.targetCount, 10) || 1),
      doneCount: Math.max(0, parseInt(item.doneCount, 10) || 0)
    };
  } else if (typeof item === 'string') {
    const rawUrl = item.trim();
    if (!rawUrl) return null;
    return {
      url: rawUrl,
      mode: payload.reportType || 'standard',
      reason: payload.reportReason || 'spam',
      targetCount: 1,
      doneCount: 0
    };
  }
  return null;
}).filter(Boolean);

console.log('🚀 Agent Runner Initialized');
console.log(`🌐 Target Browser: ${payload.browserPath || 'Google Chrome (Default)'}`);
console.log(`⚖️ Report Mode: ${payload.reportType === 'legal' ? 'Report a Legal Notice' : 'Standard Policy Report (' + (payload.reportReason || 'spam') + ')'}`);
console.log(`📋 Target Queue: ${targetUrls.length} Review URL(s) to process\n`);

// Watch for screenshot generation (both success proof and error diagnostics)
const watchedScreenshots = [
  'maps_report_spam_submitted.png',
  'error_screenshot.png',
  'maps_error.png',
  'maps_reason_error.png',
  'debug_try_another_way.png'
];

const lastScreenshotMtime = {};
for (const sName of watchedScreenshots) {
  const p = path.join(__dirname, sName);
  if (fs.existsSync(p)) {
    try { lastScreenshotMtime[sName] = fs.statSync(p).mtimeMs; } catch (e) { lastScreenshotMtime[sName] = 0; }
  } else {
    lastScreenshotMtime[sName] = 0;
  }
}

function flushScreenshots() {
  try {
    for (const sName of watchedScreenshots) {
      const p = path.join(__dirname, sName);
      if (fs.existsSync(p)) {
        const stat = fs.statSync(p);
        if (stat.mtimeMs > (lastScreenshotMtime[sName] || 0)) {
          lastScreenshotMtime[sName] = stat.mtimeMs;
          const b64 = fs.readFileSync(p).toString('base64');
          notifyParent('screenshot', {
            filename: sName,
            base64: 'data:image/png;base64,' + b64,
            timestamp: new Date().toLocaleTimeString()
          });
        }
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

  let accounts = Array.isArray(payload.accounts) && payload.accounts.length > 0 ? payload.accounts : [];
  if (accounts.length === 0) {
    try {
      const db = getDatabase();
      accounts = db.getAccounts();
    } catch (e) {}
  }
  if (accounts.length === 0 && payload.email) {
    accounts = [
      {
        email: payload.email,
        password: payload.password,
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
          account: assignedAccount
        });
      } else {
        // Session-only mode (no user credentials configured)
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
          account: null
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
        account: assignedAccount
      });
    }
  }

  console.log(`📋 Resolved Task Queue: ${jobs.length} Job(s) scheduled across ${targetUrls.length} target URL(s).\n`);

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

    console.log(`\n=======================================================`);
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
    console.log(`=======================================================\n`);

    try {
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
        isLast: i === jobs.length - 1
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
    } catch (err) {
      console.error(`\n❌ [Job ${i + 1}/${jobs.length}] Error:`, err.message);

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
          timestamp: new Date().toISOString()
        });
      } catch (e) {
        console.warn('[SQLite Audit] Notice:', e.message);
      }

      if (currentAccount && currentAccount.email) {
        notifyParent('account_update', {
          email: currentAccount.email,
          status: 'failed',
          used: true,
          error: err.message || 'Login or reporting failed',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
      }
      notifyParent('link_update', {
        url: currentUrl,
        status: 'failed',
        error: err.message || 'Report execution failed',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });
    }
  }

  notifyParent('status', {
    text: 'All reviews in queue processed!',
    progress: 100,
    current: jobs.length,
    total: jobs.length
  });

  clearInterval(screenshotWatcher);
  flushScreenshots();
  console.log('\n🏁 Queue execution finished.');
  process.exit(0);
}

executeQueue().catch(err => {
  console.error('Fatal Runner Error:', err);
  clearInterval(screenshotWatcher);
  flushScreenshots();
  process.exit(1);
});
