const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
// Anti-detect puppeteer core
const puppeteer = require('rebrowser-puppeteer-core');
const { parseProxy } = require('../network');
const { applyDeepStealth } = require('../helpers/stealth');

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
    let proxyAuth = null;
    if (options.proxyServer) {
      const parsed = parseProxy(options.proxyServer);
      if (parsed && parsed.serverUrl) {
        cleanProxyServer = parsed.serverUrl;
        proxyAuth = parsed.auth;
      } else if (typeof options.proxyServer === 'string') {
        cleanProxyServer = options.proxyServer;
      }
    }

    const chromeArgs = [
      '--start-maximized',
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
      '--disable-infobars',
      '--disable-blink-features=AutomationControlled',
      '--log-level=3',
      '--disable-logging',
      '--silent-debugger-extension-api',
      `--disk-cache-dir=${path.join(os.tmpdir(), 'mapsshield_browser_cache')}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--password-store=basic',
      ...(cleanProxyServer ? [`--proxy-server=${cleanProxyServer}`] : []),
      ...(options.userAgent ? [`--user-agent=${options.userAgent}`] : []),
      ...(Array.isArray(options.args) ? options.args : [])
    ];

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

    await applyDeepStealth(page);

    browser.on('targetcreated', async (target) => {
      try {
        if (target.type() === 'page') {
          const newP = await target.page().catch(() => null);
          if (newP) {
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

module.exports = BrowserManager;
