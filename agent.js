/**
 * agent.js
 * Google Maps Anti-Detect Fake Review Reporter Agent Orchestrator
 * Pure Chrome Anti-Detect (rebrowser-puppeteer-core) + Google 2FA Authentication + ghost-cursor
 */

const readline = require('readline');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { createCursor } = require('ghost-cursor');

// Domain Modules & Shared Helpers
const {
  runMapsReporter,
  DEFAULT_MAPS_URL,
  ensureGoogleLoggedIn,
  sleep,
  gaussianRandom,
  randomBetween,
  humanScroll,
  humanWanderMouse,
  applyDeepStealth,
  attachDialogAutoHandler,
  smartClick: domSmartClick,
  parseProxy,
  UserAgentManager,
  BrowserManager,
  captureErrorScreenshot,
  isNetworkError,
  isPageOffline,
  resolveSuccessHoldMs
} = require('./modules');

// Concurrency-safe registry for all running browser instances
const activeBrowserInstances = new Set();
let browserInstance = null; // Legacy compatibility reference for single-run/CLI inspection

/**
 * Terminal input prompt helper
 */
function promptUser(query) {
  if (!process.stdin.isTTY && typeof process.send === 'function') {
    console.warn('⚠️ Non-interactive terminal: promptUser skipped.');
    return Promise.resolve('');
  }
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise(resolve => rl.question(query, ans => {
    rl.close();
    resolve(ans.trim());
  }));
}

/**
 * Core Agent Execution Routine
 */
async function runAgentCore(options = {}) {
  // Instance-local variables for isolated concurrent execution
  let localBrowser = null;
  let currentTab = null;
  let currentCursor = null;
  let activeProxyAuth = null;
  let activeUserAgentProfile = null;

  async function syncActiveTab() {
    if (!localBrowser) return;
    const allPages = await localBrowser.pages().catch(() => []);
    if (allPages.length <= 1) return;

    let targetPage = allPages[allPages.length - 1];
    if (targetPage && targetPage !== currentTab) {
      console.log('🔄 New tab detected! Switching active tab...');

      for (const p of allPages) {
        if (p !== targetPage && (p.url().includes('workspace.google.com') || p.url().includes('gmail/about'))) {
          console.log('🗑️ Previous landing page closed.');
          await p.close().catch(() => {});
        }
      }

      currentTab = targetPage;
      if (activeProxyAuth && activeProxyAuth.username) {
        await currentTab.authenticate(activeProxyAuth).catch(() => {});
      }
      await currentTab.bringToFront().catch(() => {});
      if (activeUserAgentProfile) {
        await currentTab.setUserAgent(activeUserAgentProfile.ua, activeUserAgentProfile.metadata).catch(() => {});
      }
      attachDialogAutoHandler(currentTab);
      await applyDeepStealth(currentTab);
      currentCursor = createCursor(currentTab);
      console.log('✅ Current active page: ' + currentTab.url());
    }
  }

  async function smartClick(target) {
    return domSmartClick(currentTab, currentCursor, target, syncActiveTab);
  }

  let accountId = options.accountId;
  let email = options.email;
  let password = options.password;
  let twoFactor = options.twoFactor || options['2fa'] || process.env.GOOGLE_2FA_SECRET;
  let backupCode = options.backupCode;
  let recoveryEmail = options.recoveryEmail;
  let reviewUrl = options.reviewUrl;
  let reportReason = options.reportReason;
  let reportType = options.reportType;
  let browserPath = options.browserPath;
  let proxyServer = options.proxyServer;
  let headless = options.headless;
  let captchaApiKey = options.captchaApiKey;
  let captchaAutoSolve = options.captchaAutoSolve;
  const isLast = options.isLast !== undefined ? options.isLast : true;

  // AI Options resolution
  let aiOptions = options.aiOptions || {
    aiProvider: options.aiProvider,
    aiApiKey: options.aiApiKey,
    aiModel: options.aiModel,
    aiInspection: options.aiInspection
  };

  // Support for random browser selection from pool of checked browsers
  if (Array.isArray(options.selectedBrowsers) && options.selectedBrowsers.length > 0) {
    const chosen = options.selectedBrowsers[Math.floor(Math.random() * options.selectedBrowsers.length)];
    browserPath = (typeof chosen === 'object' && chosen.path) ? chosen.path : String(chosen);
    console.log(`🎲 [Random Browser] Selected: ${browserPath}`);
  }

  // Load settings once (cached for this job — avoid repeated DB reads)
  let cachedSettings = {};
  try {
    cachedSettings = require('./database/db').getDatabase().getSettings() || {};
  } catch (_) {
    cachedSettings = {};
  }

  // Fallback to SQLite Database if values not provided in options
  if (!email || !reviewUrl || !reportReason || !browserPath || !aiOptions.aiApiKey || !captchaApiKey) {
    try {
      const { getDatabase } = require('./database/db');
      const db = getDatabase();
      const settings = cachedSettings;
      const accounts = db.getAccounts();
      const links = db.getLinks();

      if (!email && !options.sessionOnly && options.email !== false && accounts.length > 0) {
        accountId = accounts[0].id;
        email = accounts[0].email;
        password = password || accounts[0].password;
        twoFactor = twoFactor || accounts[0].twoFactor || accounts[0]['2fa'];
        backupCode = backupCode || accounts[0].backupCode;
        recoveryEmail = recoveryEmail || accounts[0].recoveryEmail;
      }
      if (!reviewUrl && links.length > 0) {
        reviewUrl = links[0].url;
      }
      if (!reportReason) reportReason = settings.reportReason || 'spam';
      if (!reportType) reportType = settings.reportType || 'standard';
      if (!browserPath) browserPath = settings.browserPath || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
      if (headless === undefined) headless = settings.headless || false;
      if (!captchaApiKey && settings.captchaApiKey) captchaApiKey = settings.captchaApiKey;
      if (captchaAutoSolve === undefined && settings.captchaAutoSolve !== undefined) captchaAutoSolve = settings.captchaAutoSolve !== false;

      if (!aiOptions.aiApiKey && settings.aiApiKey) {
        aiOptions = {
          aiProvider: aiOptions.aiProvider || settings.aiProvider || 'gemini',
          aiApiKey: settings.aiApiKey,
          aiModel: aiOptions.aiModel || settings.aiModel || 'gemini-2.0-flash',
          aiInspection: aiOptions.aiInspection !== undefined ? aiOptions.aiInspection : (settings.aiInspection || false)
        };
      }
    } catch (e) {
      console.warn('⚠️ Database fallback notice:', e.message);
    }
  }

  if (!reviewUrl) reviewUrl = DEFAULT_MAPS_URL;
  if (!reportReason) reportReason = 'spam';
  if (!reportType) reportType = 'standard';
  if (!browserPath) browserPath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  if (headless === undefined) headless = false;

  // Backup codes sequential consumer — DB write deferred until Google accepts/rejects
  let pendingBackupCodesRemaining = null;

  async function getBackupCode() {
    if (backupCode) {
      const list = backupCode.split(',').map(s => s.trim()).filter(Boolean);
      if (list.length > 0) {
        const selected = list[0];
        backupCode = list.slice(1).join(', ');
        pendingBackupCodesRemaining = backupCode;
        console.log(`🔑 Using backup code (${list.length - 1} remaining)`);
        return selected;
      }
    }
    if (!process.stdin.isTTY && typeof process.send === 'function') {
      console.warn('⚠️ No 2FA backup codes remaining and environment is non-interactive.');
      return null;
    }
    return await promptUser('\n👉 Enter Google 2FA 8-digit Backup Code: ');
  }

  async function commitBackupCodes() {
    if (pendingBackupCodesRemaining === null) return;
    const remaining = pendingBackupCodesRemaining;
    pendingBackupCodesRemaining = null;
    try {
      const { getDatabase } = require('./database/db');
      const db = getDatabase();
      if (accountId) {
        db.updateAccountBackupCodes(accountId, remaining);
      } else if (email) {
        db.updateAccountBackupCodesByEmail(email, remaining);
      }
      if (typeof process.send === 'function') {
        process.send({
          type: 'account_backup_codes_updated',
          accountId,
          email,
          remainingBackupCodes: remaining
        });
      }
    } catch (dbErr) {
      console.warn('⚠️ Backup code persistence notice:', dbErr.message);
    }
  }

  console.log('\n🌐 Launching Google Chrome (with Stealth & Isolated Session)...');

  // Authenticated Proxy Credentials Parsing via Universal Parser
  let cleanProxyServer = null;
  activeProxyAuth = null;
  if (proxyServer) {
    try {
      const parsed = parseProxy(proxyServer);
      if (parsed && parsed.serverUrl) {
        cleanProxyServer = parsed.serverUrl;
        activeProxyAuth = parsed.auth;
      } else {
        cleanProxyServer = typeof proxyServer === 'string' ? proxyServer : null;
      }
    } catch (e) {
      cleanProxyServer = typeof proxyServer === 'string' ? proxyServer : null;
    }
  }

  // Per-Account Isolated User Data Directory
  const sessionsBaseDir = process.env.MAPSSHIELD_USER_DATA
    ? path.join(process.env.MAPSSHIELD_USER_DATA, 'chrome_sessions')
    : path.join(__dirname, 'chrome_sessions');
  if (!fs.existsSync(sessionsBaseDir)) {
    try { fs.mkdirSync(sessionsBaseDir, { recursive: true }); } catch (e) {}
  }

  const safeEmail = email && email !== 'your_email@gmail.com'
    ? crypto.createHash('md5').update(email.toLowerCase().trim()).digest('hex').substring(0, 10)
    : 'default';
  const sessionPath = path.join(sessionsBaseDir, `account_${safeEmail}`);
  if (!fs.existsSync(sessionPath)) {
    try { fs.mkdirSync(sessionPath, { recursive: true }); } catch (e) {}
  }

  const tempCacheDir = process.env.MAPSSHIELD_USER_DATA
    ? path.join(process.env.MAPSSHIELD_USER_DATA, 'cache', `cache_${safeEmail}`)
    : path.join(os.tmpdir(), 'mapsshield_cache', `cache_${safeEmail}`);
  if (!fs.existsSync(tempCacheDir)) {
    try { fs.mkdirSync(tempCacheDir, { recursive: true }); } catch (e) {}
  }

  // Safe browser path verification
  let targetExecutable = browserPath;
  if (!targetExecutable || !fs.existsSync(targetExecutable)) {
    const candidatePaths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe'
    ];
    for (const cand of candidatePaths) {
      if (fs.existsSync(cand)) {
        targetExecutable = cand;
        break;
      }
    }
  }

  // Dynamic User-Agent & Client Hints Generation via UserAgentManager
  const uaManager = new UserAgentManager();
  const startupUa = options.userAgent || uaManager.get_next_user_agent({ os: 'windows', random: true });

  // Launch via BrowserManager (same stealth flags / session path as before)
  const browserManager = new BrowserManager({
    defaultBrowserPath: targetExecutable || browserPath
  });
  const launched = await browserManager.launch({
    browserPath: targetExecutable || browserPath,
    headless,
    userDataDir: sessionPath,
    proxyServer: cleanProxyServer,
    proxyAuth: activeProxyAuth,
    userAgent: startupUa,
    diskCacheDir: tempCacheDir,
    args: ['--disable-infobars']
  });
  localBrowser = launched.browser;
  activeBrowserInstances.add(localBrowser);
  browserInstance = localBrowser;
  currentTab = launched.page;

  if (activeProxyAuth && activeProxyAuth.username) {
    console.log(`🔐 Authenticating proxy credentials for user "${activeProxyAuth.username}"...`);
  }

  // Query actual launched browser version to align User-Agent and Client Hints perfectly (zero mismatch)
  const actualBrowserVersion = await localBrowser.version().catch(() => null);
  activeUserAgentProfile = uaManager.get_user_agent_profile({
    os: 'windows',
    actualVersion: actualBrowserVersion
  });
  if (options.userAgent) {
    activeUserAgentProfile.ua = options.userAgent;
  }

  console.log(`🎭 User-Agent: ${activeUserAgentProfile.ua}`);
  console.log(`🛡️ Client Hints: Sec-Ch-Ua synchronized with ${activeUserAgentProfile.brand} v${activeUserAgentProfile.major}`);

  currentCursor = createCursor(currentTab);

  // Strictly apply synchronized UserAgent + ClientHints (post-launch version align)
  await currentTab.setUserAgent(activeUserAgentProfile.ua, activeUserAgentProfile.metadata).catch(() => {});
  attachDialogAutoHandler(currentTab);
  await applyDeepStealth(currentTab);

  // Automatically switch tab, synchronize User-Agent & authenticate if Chrome opens a new tab
  localBrowser.on('targetcreated', async (target) => {
    try {
      if (target.type() === 'page') {
        const newPage = await target.page().catch(() => null);
        if (newPage) {
          attachDialogAutoHandler(newPage);
          if (activeProxyAuth && activeProxyAuth.username) {
            await newPage.authenticate(activeProxyAuth).catch(() => {});
          }
          if (activeUserAgentProfile) {
            await newPage.setUserAgent(activeUserAgentProfile.ua, activeUserAgentProfile.metadata).catch(() => {});
          }
          await applyDeepStealth(newPage);
          await sleep(1500);
          await syncActiveTab();
        }
      }
    } catch (e) {}
  });

  try {
    const hasCredentials = email && email !== 'your_email@gmail.com';

    if (hasCredentials) {
      console.log(`\n[Agent] Step 1: Account Login (${email})`);
      const isLoginSuccess = await ensureGoogleLoggedIn({
        currentTab,
        currentCursor,
        email,
        password,
        twoFactor,
        backupCode,
        recoveryEmail,
        getBackupCode,
        commitBackupCodes,
        smartClick,
        syncActiveTab,
        captchaApiKey,
        captchaAutoSolve
      });
      if (!isLoginSuccess) {
        throw new Error('Google login could not be completed for account: ' + email);
      }
      // Persist consumed backup codes only after Google login succeeds
      await commitBackupCodes();

      console.log('\n[Agent] Step 2: Submitting Review Report');
      const repResult = await runMapsReporter({
        page: currentTab,
        cursor: currentCursor,
        smartClick,
        sleep,
        reviewUrl,
        humanWanderMouse,
        humanScroll,
        reportType,
        reportReason,
        aiOptions,
        senderInfo: options.senderInfo,
        captchaApiKey,
        captchaAutoSolve
      });
      if (!repResult || repResult === false || repResult.success === false) {
        throw new Error('Google Maps report execution could not be verified');
      }

    } else {
      console.log('\n[Agent] Reporting with active session');
      const repResult = await runMapsReporter({
        page: currentTab,
        cursor: currentCursor,
        smartClick,
        sleep,
        reviewUrl,
        humanWanderMouse,
        humanScroll,
        reportType,
        reportReason,
        aiOptions,
        senderInfo: options.senderInfo,
        captchaApiKey,
        captchaAutoSolve
      });
      if (!repResult || repResult === false || repResult.success === false) {
        throw new Error('Google Maps report execution could not be verified');
      }
    }

    console.log('\nTask completed successfully for: ' + reviewUrl);
    console.log('Holding browser open for confirmation before exiting...');

    // Standalone CLI execution audit log persistence
    if (!process.send && !options.isSubJob) {
      try {
        const { getDatabase } = require('./database/db');
        const { getLatestScreenshot } = require('./modules/helpers/screenshot_paths');
        getDatabase().recordAuditLog({
          url: reviewUrl,
          email: email || null,
          proxy: proxyServer || null,
          status: 'completed',
          reason: reportReason || 'spam',
          mode: reportType || 'standard',
          error: null,
          screenshot: getLatestScreenshot('proof'),
          timestamp: new Date().toISOString()
        });
      } catch (_) {}
    }

    const holdMs = resolveSuccessHoldMs(cachedSettings, options);
    if (holdMs > 0) {
      console.log(`⏳ Success hold ${(holdMs / 1000).toFixed(1)}s before closing browser...`);
      await sleep(holdMs);
    }

  } catch (error) {
    let finalError = error;
    if (currentTab) {
      const pageOffline = await isPageOffline(currentTab).catch(() => false);
      if (pageOffline && !isNetworkError(finalError)) {
        finalError = new Error(`net::ERR_INTERNET_DISCONNECTED (DNS_PROBE_FINISHED_NO_INTERNET): ${error.message}`);
      }
    }
    console.error('\n❌ An error occurred:', finalError.message);
    console.log('Saving diagnostic screenshot to report_logs/errors/...');
    if (currentTab) {
      await captureErrorScreenshot(currentTab, 'agent_error').catch(() => {});
    }

    // Standalone CLI execution audit log persistence on failure
    if (!process.send && !options.isSubJob) {
      try {
        const { getDatabase } = require('./database/db');
        const { getLatestScreenshot } = require('./modules/helpers/screenshot_paths');
        getDatabase().recordAuditLog({
          url: reviewUrl,
          email: email || null,
          proxy: proxyServer || null,
          status: isNetworkError(finalError) ? 'network_error' : 'failed',
          reason: reportReason || 'spam',
          mode: reportType || 'standard',
          error: finalError.message || 'Execution failed',
          screenshot: getLatestScreenshot('error'),
          timestamp: new Date().toISOString()
        });
      } catch (_) {}
    }

    throw finalError;
  } finally {
    if (localBrowser) {
      activeBrowserInstances.delete(localBrowser);
      if (browserInstance === localBrowser) browserInstance = null;
      await localBrowser.close().catch(() => {});
      console.log('👋 Browser closed.');
    }
    currentTab = null;
    currentCursor = null;
    activeProxyAuth = null;
    activeUserAgentProfile = null;
  }
}

async function main() {
  console.log('\n===============================================================');
  console.log('       📍 GOOGLE MAPS AUTO FAKE REVIEW REPORTER AGENT          ');
  console.log('  (Pure Chrome Anti-Detect + Google Login + ghost-cursor)      ');
  console.log('===============================================================\n');

  let reviewUrl = '';
  try {
    const { getDatabase } = require('./database/db');
    const links = getDatabase().getLinks();
    if (links.length > 0) reviewUrl = links[0].url;
  } catch (e) {}

  if (!reviewUrl) {
    const enteredUrl = await promptUser(`👉 Enter Google Maps Review link (Press Enter to use default "${DEFAULT_MAPS_URL}"): `);
    reviewUrl = enteredUrl || DEFAULT_MAPS_URL;
  }

  await runAgentCore({ reviewUrl });
}

async function forceCloseBrowser() {
  const instances = Array.from(activeBrowserInstances);
  activeBrowserInstances.clear();
  browserInstance = null;
  await Promise.allSettled(instances.map(async (b) => {
    try {
      await b.close();
    } catch (e) {
      try {
        const proc = b.process();
        if (proc && !proc.killed) {
          proc.kill();
        }
      } catch (err) {}
    }
  }));
}

module.exports = {
  runAgentCore,
  forceCloseBrowser,
  main
};

if (require.main === module) {
  main();
}
