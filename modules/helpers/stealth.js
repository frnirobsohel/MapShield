/**
 * modules/helpers/stealth.js
 * Advanced Stealth & Anti-Detection Camouflage
 * Masks BotGuard, CDP signals, navigator.webdriver, window.chrome mock, and browser fingerprint properties.
 */

/**
 * Injects deep stealth properties to completely camouflage the browser
 * @param {import('rebrowser-puppeteer-core').Page} page
 */
async function applyDeepStealth(page) {
  if (!page) return;
  await page.evaluateOnNewDocument(() => {
    // 1. Remove navigator.webdriver completely from prototype chain
    delete Object.getPrototypeOf(navigator).webdriver;
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
      configurable: true
    });

    // 2. Realistic window.chrome object
    window.chrome = {
      app: {
        isInstalled: false,
        InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
        RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' }
      },
      runtime: {
        OnInstalledReason: { CHROME_UPDATE: 'chrome_update', INSTALL: 'install', SHARED_MODULE_UPDATE: 'shared_module_update', UPDATE: 'update' },
        OnRestartRequiredReason: { APP_UPDATE: 'app_update', OS_UPDATE: 'os_update', PERIODIC: 'periodic' },
        PlatformArch: { ARM: 'arm', ARM64: 'arm64', MIPS: 'mips', MIPS64: 'mips64', X86_32: 'x86-32', X86_64: 'x86-64' },
        PlatformNaclArch: { ARM: 'arm', MIPS: 'mips', MIPS64: 'mips64', X86_32: 'x86-32', X86_64: 'x86-64' },
        PlatformOs: { ANDROID: 'android', CROS: 'cros', LINUX: 'linux', MAC: 'mac', OPENBSD: 'openbsd', WIN: 'win' }
      },
      loadTimes: function() {},
      csi: function() {}
    };

    // 3. Realistic permissions query
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters) => (
      parameters.name === 'notifications' ?
        Promise.resolve({ state: Notification.permission }) :
        originalQuery(parameters)
    );

    // 4. Genuine language and vendor
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en'],
      configurable: true
    });

    Object.defineProperty(navigator, 'vendor', {
      get: () => 'Google Inc.',
      configurable: true
    });

    // 5. Realistic plugins array (desktop Chrome default PDF plugins)
    if (!navigator.plugins || navigator.plugins.length === 0) {
      const mockPlugins = [
        { name: 'Chrome PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
        { name: 'Chromium PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
        { name: 'Microsoft Edge PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
        { name: 'PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
        { name: 'WebKit built-in PDF', filename: 'internal-pdf-viewer', description: 'Portable Document Format' }
      ];
      Object.defineProperty(navigator, 'plugins', {
        get: () => mockPlugins,
        configurable: true
      });
    }

    // 6. WebRTC Local IP Leak Guard (Blocks non-proxied host candidates from leaking real IP)
    if (window.RTCPeerConnection) {
      const OrigRTC = window.RTCPeerConnection;
      const origAddEventListener = OrigRTC.prototype.addEventListener;

      // Override onicecandidate setter to filter out host candidates that leak local IP
      const origDescriptor = Object.getOwnPropertyDescriptor(OrigRTC.prototype, 'onicecandidate');
      if (origDescriptor && origDescriptor.set) {
        Object.defineProperty(OrigRTC.prototype, 'onicecandidate', {
          set(handler) {
            origDescriptor.set.call(this, function(event) {
              if (event && event.candidate && event.candidate.candidate) {
                // Strip host candidates containing local/private IPs
                if (event.candidate.type === 'host' || /candidate.*typ host/.test(event.candidate.candidate)) {
                  return; // Suppress local IP candidate
                }
              }
              if (typeof handler === 'function') handler(event);
            });
          },
          get: origDescriptor.get,
          configurable: true
        });
      }
    }
  }).catch(() => {});
}

module.exports = {
  applyDeepStealth
};
