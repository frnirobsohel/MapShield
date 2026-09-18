/**
 * UserAgentManager
 * Generates realistic modern browser fingerprints and validates User-Agent strings.
 */
class UserAgentManager {
  constructor() {
    this.currentIndex = 0;

    // Curated high-reputation modern Desktop User-Agents (Chrome 120-134, Edge, Firefox)
    this.userAgents = [
      // Windows 11 / 10 - Chrome
      {
        os: 'windows',
        browser: 'chrome',
        version: '133.0.6943.127',
        ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36'
      },
      {
        os: 'windows',
        browser: 'chrome',
        version: '132.0.6834.160',
        ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36'
      },
      {
        os: 'windows',
        browser: 'chrome',
        version: '131.0.6778.205',
        ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
      },
      // Windows 11 / 10 - Edge
      {
        os: 'windows',
        browser: 'edge',
        version: '133.0.3065.69',
        ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36 Edg/133.0.0.0'
      },
      {
        os: 'windows',
        browser: 'edge',
        version: '132.0.2957.140',
        ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36 Edg/132.0.0.0'
      },
      // macOS - Chrome & Safari
      {
        os: 'mac',
        browser: 'chrome',
        version: '133.0.6943.126',
        ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36'
      },
      {
        os: 'mac',
        browser: 'safari',
        version: '17.4',
        ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15'
      },
      // Linux - Chrome
      {
        os: 'linux',
        browser: 'chrome',
        version: '133.0.6943.126',
        ua: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36'
      }
    ];
  }

  /**
   * Generates a fully synchronized User-Agent and Client Hints (navigator.userAgentData) profile.
   * This eliminates fingerprint mismatch by ensuring Sec-Ch-Ua, Sec-Ch-Ua-Platform,
   * navigator.userAgent, and navigator.userAgentData match 100%.
   * @param {Object|string} [options]
   * @param {string} [options.os='windows']
   * @param {string} [options.actualVersion] e.g. "Chrome/153.0.8010.50" from browser.version()
   * @returns {{ ua: string, metadata: Object, major: string, full: string, brand: string }}
   */
  get_user_agent_profile(options = {}) {
    let targetOs = 'windows';
    let runtimeVersion = null;

    if (typeof options === 'string') {
      targetOs = options.toLowerCase();
    } else if (typeof options === 'object' && options !== null) {
      if (options.os) targetOs = options.os.toLowerCase();
      if (options.actualVersion) runtimeVersion = options.actualVersion;
    }

    let major = '133';
    let full = '133.0.6943.127';
    let brandName = 'Google Chrome';

    if (runtimeVersion && typeof runtimeVersion === 'string') {
      const match = runtimeVersion.match(/(Chrome|Edg)\/([0-9]+)\.([0-9.]+)/i);
      if (match) {
        brandName = match[1].toLowerCase() === 'edg' ? 'Microsoft Edge' : 'Google Chrome';
        major = match[2];
        full = `${match[2]}.${match[3]}`;
      }
    } else {
      const candidates = this.userAgents.filter(item => targetOs === 'all' || item.os === targetOs);
      const chosen = candidates[Math.floor(Math.random() * candidates.length)] || this.userAgents[0];
      const match = chosen.version.match(/^([0-9]+)\.(.*)$/);
      major = match ? match[1] : '133';
      full = chosen.version;
      brandName = chosen.browser === 'edge' ? 'Microsoft Edge' : 'Google Chrome';
    }

    const isEdge = brandName === 'Microsoft Edge';
    const ua = isEdge
      ? `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36 Edg/${major}.0.0.0`
      : `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`;

    const brands = isEdge ? [
      { brand: 'Microsoft Edge', version: String(major) },
      { brand: 'Chromium', version: String(major) },
      { brand: 'Not(A:Brand', version: '24' }
    ] : [
      { brand: 'Google Chrome', version: String(major) },
      { brand: 'Chromium', version: String(major) },
      { brand: 'Not_A Brand', version: '24' }
    ];

    const fullVersionList = isEdge ? [
      { brand: 'Microsoft Edge', version: full },
      { brand: 'Chromium', version: full },
      { brand: 'Not(A:Brand', version: '24.0.0.0' }
    ] : [
      { brand: 'Google Chrome', version: full },
      { brand: 'Chromium', version: full },
      { brand: 'Not_A Brand', version: '24.0.0.0' }
    ];

    const metadata = {
      brands,
      fullVersionList,
      architecture: 'x86',
      bitness: '64',
      model: '',
      platform: 'Windows',
      platformVersion: '10.0.0',
      mobile: false,
      fullVersion: full
    };

    return {
      ua,
      metadata,
      major,
      full,
      brand: brandName
    };
  }

  /**
   * Retrieves the next valid User-Agent string from the pool.
   * @param {Object|string} [filter] Optional OS ('windows'|'mac'|'linux'|'all') or options object
   * @param {string} [filter.os] Target OS platform
   * @param {string} [filter.browser] Target browser
   * @param {boolean} [filter.random=false] Select randomly rather than sequentially
   * @returns {string} User-Agent string
   */
  get_next_user_agent(filter = 'windows') {
    let targetOs = 'windows';
    let isRandom = false;

    if (typeof filter === 'string') {
      targetOs = filter.toLowerCase();
    } else if (typeof filter === 'object' && filter !== null) {
      if (filter.os) targetOs = filter.os.toLowerCase();
      if (filter.random) isRandom = true;
    }

    let candidates = this.userAgents;
    if (targetOs !== 'all') {
      const filtered = candidates.filter(item => item.os === targetOs);
      if (filtered.length > 0) candidates = filtered;
    }

    if (isRandom) {
      const idx = Math.floor(Math.random() * candidates.length);
      return candidates[idx].ua;
    }

    const selected = candidates[this.currentIndex % candidates.length];
    this.currentIndex = (this.currentIndex + 1) % candidates.length;
    return selected.ua;
  }

  /**
   * Validates and parses a User-Agent string.
   * @param {string} uaString
   * @returns {{ valid: boolean, browser: string, version: string, os: string, isBot: boolean, reason?: string }}
   */
  validate_ua(uaString) {
    if (!uaString || typeof uaString !== 'string') {
      return { valid: false, browser: 'Unknown', version: '0', os: 'Unknown', isBot: false, reason: 'Empty or non-string UA' };
    }

    const clean = uaString.trim();
    if (clean.length < 20) {
      return { valid: false, browser: 'Unknown', version: '0', os: 'Unknown', isBot: false, reason: 'UA too short' };
    }

    // Check for bot or automation keywords
    const botKeywords = ['bot', 'crawler', 'spider', 'headless', 'phantomjs', 'selenium', 'puppeteer'];
    const isBot = botKeywords.some(kw => clean.toLowerCase().includes(kw));

    // Detect OS
    let os = 'Unknown OS';
    if (/windows nt 10\.0/i.test(clean)) os = 'Windows 10/11';
    else if (/windows nt/i.test(clean)) os = 'Windows (Legacy)';
    else if (/macintosh|mac os x/i.test(clean)) os = 'macOS';
    else if (/linux/i.test(clean)) os = 'Linux';
    else if (/android/i.test(clean)) os = 'Android';
    else if (/iphone|ipad/i.test(clean)) os = 'iOS';

    // Detect Browser & Version
    let browser = 'Unknown Browser';
    let version = '0';

    if (/Edg\/([0-9.]+)/i.test(clean)) {
      browser = 'Microsoft Edge';
      version = RegExp.$1;
    } else if (/Chrome\/([0-9.]+)/i.test(clean)) {
      browser = 'Google Chrome';
      version = RegExp.$1;
    } else if (/Version\/([0-9.]+).*Safari/i.test(clean)) {
      browser = 'Apple Safari';
      version = RegExp.$1;
    } else if (/Firefox\/([0-9.]+)/i.test(clean)) {
      browser = 'Mozilla Firefox';
      version = RegExp.$1;
    }

    const valid = !isBot && browser !== 'Unknown Browser' && os !== 'Unknown OS';

    return {
      valid,
      browser,
      version,
      os,
      isBot,
      raw: clean
    };
  }
}

module.exports = UserAgentManager;
