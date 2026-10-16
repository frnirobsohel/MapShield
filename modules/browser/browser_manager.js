const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
// Anti-detect puppeteer core
const puppeteer = require('rebrowser-puppeteer-core');
const { parseProxy } = require('../network');
const { applyDeepStealth, attachDialogAutoHandler } = require('../helpers/stealth');

/**
 * BrowserManager
 * Handles browser lifecycle, isolated/temp profiles, stealth flags & proxy attachment.
 */
class BrowserManager {
  constructor(options = {}) {
    this.defaultBrowserPath = options.defaultBrowserPath || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    this.activeBrowsers = new Set();
    this.tempProfiles = new Set();
  }

  /**
   * Generates and initializes a temporary, isolated user profile directory.
   * @param {string} [prefix='temp_profile'] 
   * @returns {string} Absolute path to the created temporary profile directory
   */
  create_temp_profile(prefix = 'temp_profile') {
    const uniqueId = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const profileDir = path.join(os.tmpdir(), 'mapsshield_profiles', `${prefix}_${uniqueId}`);

    if (!fs.existsSync(profileDir)) {
      fs.mkdirSync(profileDir, { recursive: true });
    }

    this.tempProfiles.add(profileDir);
    return profileDir;
  }

  /**
   * Launches a stealth Chromium / Chrome instance with configured flags.
   * @param {Object} options
   * @param {string} [options.browserPath] Executable path of Chrome/Edge/Brave
   * @param {boolean} [options.headless=false] Run in headless or visible mode
   * @param {string} [options.proxyServer] Proxy address e.g. "http://1.2.3.4:8080"
   * @param {string} [options.userDataDir] Path to persistent or temporary user profile
   * @param {string} [options.userAgent] Custom User-Agent string
   * @param {boolean} [options.useTempProfile=false] Force creation of a fresh temp profile
   * @param {Array<string>} [options.args] Additional command-line flags
   * @returns {Promise<{ browser: import('puppeteer-core').Browser, page: import('puppeteer-core').Page, profilePath: string }>}
   */
  async launch(options = {}) {
    const browserPath = options.browserPath || this.defaultBrowserPath;
    const headless = options.headless !== undefined ? options.headless : false;

    let profilePath = options.userDataDir;
    if (options.useTempProfile || !profilePath) {
      profilePath = this.create_temp_profile('ms_session');
    }

    let cleanProxyServer = null;
    let proxyAuth = options.proxyAuth || null;
    if (options.proxyServer) {
      if (typeof options.proxyServer === 'object' && options.proxyServer.serverUrl) {
        cleanProxyServer = options.proxyServer.serverUrl;
        if (!proxyAuth) proxyAuth = options.proxyServer.auth || null;
      } else {
        const parsed = parseProxy(options.proxyServer);
        if (parsed && parsed.serverUrl) {
          cleanProxyServer = parsed.serverUrl;
          if (!proxyAuth) proxyAuth = parsed.auth;
        } else if (typeof options.proxyServer === 'string') {
          cleanProxyServer = options.proxyServer;
        }
      }
    }

    const diskCacheDir = options.diskCacheDir
      || path.join(os.tmpdir(), 'mapsshield_browser_cache');
    if (!fs.existsSync(diskCacheDir)) {
      try { fs.mkdirSync(diskCacheDir, { recursive: true }); } catch (_) {}
    }

    // Curated high-reputation standard desktop screen resolutions
    // All sizes are >=1280px wide to prevent Google Maps from collapsing into mobile layout
    const STANDARD_DESKTOP_RESOLUTIONS = BrowserManager.STANDARD_DESKTOP_RESOLUTIONS;

    let windowSizeArg = '--start-maximized';
    let windowPosArg = null;

    const hasExplicitSize = options.args && options.args.some(a => typeof a === 'string' && a.startsWith('--window-size'));
    const shouldRandomize = options.randomizeWindowSize === true || (options.randomizeWindowSize !== false && !headless);

    if (shouldRandomize && !hasExplicitSize) {
      const chosenRes = options.windowSize || STANDARD_DESKTOP_RESOLUTIONS[Math.floor(Math.random() * STANDARD_DESKTOP_RESOLUTIONS.length)];
      windowSizeArg = `--window-size=${chosenRes.width},${chosenRes.height}`;

      const sIndex = Math.max(0, parseInt(options.staggerIndex, 10) || 0);
      const posX = 30 + ((sIndex * 60) % 360) + Math.floor(Math.random() * 20);
      const posY = 30 + ((sIndex * 45) % 220) + Math.floor(Math.random() * 20);
      windowPosArg = `--window-position=${posX},${posY}`;
      console.log(`🖥️ [Desktop Window] Resolution: ${chosenRes.width}x${chosenRes.height} | Position: (${posX}, ${posY})`);
    } else if (hasExplicitSize) {
      windowSizeArg = null;
    } else if (headless && windowSizeArg === '--start-maximized') {
      // In headless mode without explicit size, Chromium defaults to 800x600 if start-maximized is used.
      // Force 1080p desktop canvas to prevent Google Maps responsive mobile layout collapse.
      windowSizeArg = '--window-size=1920,1080';
    }

    const chromeArgs = [
      ...(windowSizeArg ? [windowSizeArg] : []),
      ...(windowPosArg ? [windowPosArg] : []),
      '--no-sandbox',
      '--disable-setuid-sandbox',
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
      '--disable-blink-features=AutomationControlled',
      '--disable-features=ChromeSigninBubble,SignInProfileCreationFlow',
      '--no-service-autorun',
      '--log-level=3',
      '--disable-logging',
      '--silent-debugger-extension-api',
      `--disk-cache-dir=${diskCacheDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--password-store=basic',
      ...(cleanProxyServer ? [`--proxy-server=${cleanProxyServer}`] : []),
      ...(options.userAgent ? [`--user-agent=${options.userAgent}`] : []),
      ...(Array.isArray(options.args) ? options.args : [])
    ];

    // Clean launch with Zero-Extension stealth (click-based solver active)

    const browser = await puppeteer.launch({
      executablePath: browserPath,
      userDataDir: profilePath,
      headless: headless,
      defaultViewport: null,
      ignoreDefaultArgs: ['--enable-automation'],
      args: chromeArgs
    });

    this.activeBrowsers.add(browser);

    const pages = await browser.pages();
    const page = pages.length > 0 ? pages[0] : await browser.newPage();

    if (proxyAuth && proxyAuth.username) {
      await page.authenticate(proxyAuth).catch(() => {});
    }

    if (attachDialogAutoHandler) attachDialogAutoHandler(page);
    await applyDeepStealth(page);

    browser.on('targetcreated', async (target) => {
      try {
        if (target.type() === 'page') {
          const newP = await target.page().catch(() => null);
          if (newP) {
            if (attachDialogAutoHandler) attachDialogAutoHandler(newP);
            if (proxyAuth && proxyAuth.username) {
              await newP.authenticate(proxyAuth).catch(() => {});
            }
            await applyDeepStealth(newP);
          }
        }
      } catch (e) {}
    });

    if (options.userAgent) {
      await page.setUserAgent(options.userAgent);
    }

    browser.once('disconnected', () => {
      this.activeBrowsers.delete(browser);
    });

    return { browser, page, profilePath };
  }

  /**
   * Gracefully closes a browser instance and cleans up its temporary profile if applicable.
   * @param {import('puppeteer-core').Browser} browser Browser instance to terminate
   * @param {string} [profilePath] Path to profile for cleanup
   * @returns {Promise<boolean>}
   */
  async close(browser, profilePath = null) {
    if (!browser) return false;

    try {
      if (typeof browser.close === 'function') {
        await browser.close();
      }
    } catch (err) {
      // Force kill underlying process if hung
      try {
        const proc = browser.process();
        if (proc && !proc.killed) proc.kill('SIGKILL');
      } catch (e) {}
    } finally {
      this.activeBrowsers.delete(browser);
    }

    // Clean up temporary profile directory if registered
    const targetProfile = profilePath || (browser._userDataDir);
    if (targetProfile && this.tempProfiles.has(targetProfile)) {
      try {
        if (fs.existsSync(targetProfile)) {
          fs.rmSync(targetProfile, { recursive: true, force: true });
        }
        this.tempProfiles.delete(targetProfile);
      } catch (e) {}
    }

    return true;
  }

  /**
   * Cleans up all tracked temporary profiles on exit
   */
  cleanup_all_temp_profiles() {
    for (const dir of this.tempProfiles) {
      try {
        if (fs.existsSync(dir)) {
          fs.rmSync(dir, { recursive: true, force: true });
        }
      } catch (e) {}
    }
    this.tempProfiles.clear();
  }
}

BrowserManager.STANDARD_DESKTOP_RESOLUTIONS = [
  { width: 1920, height: 1080 }, // 1080p Full HD (~24% global)
  { width: 1536, height: 864 },  // 125% Windows scale on 1080p (~11% global)
  { width: 1440, height: 900 },  // 16:10 MacBook/Desktop (~7% global)
  { width: 1366, height: 768 },  // Standard HD Laptop (~14% global)
  { width: 1600, height: 900 },  // HD+ widescreen (~4% global)
  { width: 1280, height: 800 },  // 16:10 compact desktop (~5% global)
  { width: 1680, height: 1050 }  // WSXGA+ widescreen (~2% global)
];

module.exports = BrowserManager;
