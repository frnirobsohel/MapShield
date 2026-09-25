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
const puppeteer = require('rebrowser-puppeteer-core');
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
  captureErrorScreenshot,
  isNetworkError,
  isPageOffline
} = require('./modules');

let browserInstance = null;
let currentTab = null;
let currentCursor = null;
let activeProxyAuth = null;
let activeUserAgentProfile = null;

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
 * Ensures active tab tracking when Chrome navigates or opens popups
 */
async function syncActiveTab() {
  if (!browserInstance) return;
  const allPages = await browserInstance.pages().catch(() => []);
  if (allPages.length <= 1) return;

  // Target newly created tab or popup (last in list)
  let targetPage = allPages[allPages.length - 1];

  if (targetPage && targetPage !== currentTab) {
    console.log('🔄 New tab detected! Switching active tab...');

    // Close marketing/landing tabs
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
    await currentTab.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' }).catch(() => {});
    attachDialogAutoHandler(currentTab);
    await applyDeepStealth(currentTab);
    currentCursor = createCursor(currentTab);
    console.log('✅ Current active page: ' + currentTab.url());
  }
}

/**
 * Smart Click wrapper tied to active tab & cursor
 */
async function smartClick(target) {
  return domSmartClick(currentTab, currentCursor, target, syncActiveTab);
}

/**
 * Core Agent Execution Routine
 */
async function runAgentCore(options = {}) {
  let email = options.email;
  let password = options.password;
  let twoFactor = options.twoFactor || options['2fa'] || process.env.GOOGLE_2FA_SECRET;
  let backupCode = options.backupCode;
  let reviewUrl = options.reviewUrl;
  let reportReason = options.reportReason;
  let reportType = options.reportType;
  let browserPath = options.browserPath;
  let proxyServer = options.proxyServer;
  let headless = options.headless;
  let captchaApiKey = options.captchaApiKey;
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

  // Fallback to SQLite Database if values not provided in options
  if (!email || !reviewUrl || !reportReason || !browserPath || !aiOptions.aiApiKey || !captchaApiKey) {
    try {
      const { getDatabase } = require('./database/db');
      const db = getDatabase();
      const settings = db.getSettings();
      const accounts = db.getAccounts();
      const links = db.getLinks();

      if (!email && !options.sessionOnly && options.email !== false && accounts.length > 0) {
        email = accounts[0].email;
        password = password || accounts[0].password;
        twoFactor = twoFactor || accounts[0].twoFactor || accounts[0]['2fa'];
        backupCode = backupCode || accounts[0].backupCode;
      }
      if (!reviewUrl && links.length > 0) {
        reviewUrl = links[0].url;
      }
      if (!reportReason) reportReason = settings.reportReason || 'spam';
      if (!reportType) reportType = settings.reportType || 'standard';
      if (!browserPath) browserPath = settings.browserPath || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
      if (headless === undefined) headless = settings.headless || false;
      if (!captchaApiKey && settings.captchaApiKey) captchaApiKey = settings.captchaApiKey;

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

  // Backup codes sequential consumer
  async function getBackupCode() {
    if (backupCode) {
      const list = backupCode.split(',').map(s => s.trim()).filter(Boolean);
      if (list.length > 0) {
        const selected = list[0];
        backupCode = list.slice(1).join(',');
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

  // Dynamic 2Captcha Extension Injection
  const captchaExtPath = path.resolve(__dirname, 'extensions/2captcha-solver');
  const extensionArgs = [];
  if (fs.existsSync(captchaExtPath) && options.loadCaptchaExtension !== false) {
    extensionArgs.push(`--disable-extensions-except=${captchaExtPath}`);
    extensionArgs.push(`--load-extension=${captchaExtPath}`);
    console.log(`🧩 [Agent]: Auto-loaded 2Captcha extension from ${captchaExtPath}`);
  }

  browserInstance = await puppeteer.launch({
    executablePath: targetExecutable || browserPath,
    userDataDir: sessionPath,
    headless: headless,
    defaultViewport: null,
    ignoreDefaultArgs: ['--enable-automation'],
    args: [
      '--start-maximized',
      '--lang=en-US,en',
      ...extensionArgs,
      ...(cleanProxyServer ? [`--proxy-server=${cleanProxyServer}`] : []),
      `--user-agent=${startupUa}`,
      // WebRTC Leak Protection: Strictly disallow non-proxied UDP lookups
      '--enforce-webrtc-ip-permission-check',
      '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
      // DNS & Background Network Isolation
      '--dns-prefetch-disable',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-domain-reliability',
      '--disable-sync',
      '--disable-breakpad',
      '--no-first-run',
      '--no-default-browser-check',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-infobars',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=ChromeSigninBubble,SignInProfileCreationFlow',
      '--no-service-autorun',
      '--password-store=basic',
      '--log-level=3',
      '--disable-logging',
      '--silent-debugger-extension-api',
      `--disk-cache-dir=${tempCacheDir}`
    ]
  });

  // Query actual launched browser version to align User-Agent and Client Hints perfectly (zero mismatch)
  const actualBrowserVersion = await browserInstance.version().catch(() => null);
  activeUserAgentProfile = uaManager.get_user_agent_profile({
    os: 'windows',
    actualVersion: actualBrowserVersion
  });
  if (options.userAgent) {
    activeUserAgentProfile.ua = options.userAgent;
  }

  console.log(`🎭 User-Agent: ${activeUserAgentProfile.ua}`);
  console.log(`🛡️ Client Hints: Sec-Ch-Ua synchronized with ${activeUserAgentProfile.brand} v${activeUserAgentProfile.major}`);

  const pages = await browserInstance.pages();
  currentTab = pages.length > 0 ? pages[0] : await browserInstance.newPage();
  attachDialogAutoHandler(currentTab);
  currentCursor = createCursor(currentTab);

  if (activeProxyAuth && activeProxyAuth.username) {
    console.log(`🔐 Authenticating proxy credentials for user "${activeProxyAuth.username}"...`);
    await currentTab.authenticate(activeProxyAuth).catch(err => {
      console.warn('⚠️ Proxy initial authentication warning:', err.message);
    });
  }

  // Strictly apply synchronized UserAgent + ClientHints + Accept-Language
  await currentTab.setUserAgent(activeUserAgentProfile.ua, activeUserAgentProfile.metadata).catch(() => {});
  await currentTab.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' }).catch(() => {});
  attachDialogAutoHandler(currentTab);
  await applyDeepStealth(currentTab);

  // Automatically switch tab, synchronize User-Agent & authenticate if Chrome opens a new tab
  browserInstance.on('targetcreated', async (target) => {
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
          await newPage.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' }).catch(() => {});
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
        getBackupCode,
        smartClick,
        syncActiveTab
      });
      if (!isLoginSuccess) {
        throw new Error('Google login could not be completed for account: ' + email);
      }

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
        captchaApiKey
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
        captchaApiKey
      });
      if (!repResult || repResult === false || repResult.success === false) {
        throw new Error('Google Maps report execution could not be verified');
      }
    }

    console.log('\nTask completed successfully for: ' + reviewUrl);
    console.log('Holding browser open for confirmation before exiting...');
    await sleep(5000);

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
    throw finalError;
  } finally {
    if (browserInstance) {
      await browserInstance.close().catch(() => {});
      console.log('👋 Browser closed.');
    }
    browserInstance = null;
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
  if (browserInstance) {
    try {
      await browserInstance.close();
    } catch (e) {
      try {
        const proc = browserInstance.process();
        if (proc && !proc.killed) {
          // Use SIGTERM on all platforms (Node.js maps this to taskkill on Windows)
          proc.kill();
        }
      } catch (err) {}
    }
    browserInstance = null;
  }
  currentTab = null;
  currentCursor = null;
  activeProxyAuth = null;
  activeUserAgentProfile = null;
}

module.exports = {
  runAgentCore,
  forceCloseBrowser,
  main
};

if (require.main === module) {
  main();
}
