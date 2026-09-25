/**
 * modules/captcha/captcha_solver.js
 * Universal CAPTCHA Auto-Solver Engine
 * 
 * Supports:
 * 1. 2Captcha Chrome Extension (Real-time DOM solver button .captcha-solver[data-state="solved"])
 * 2. 2Captcha Direct HTTP API (Native fetch token resolution & callback dispatch)
 * 3. Human-assisted countdown fallback
 */

const { sleep, randomBetween } = require('../helpers/biometrics');

/**
 * Checks if any CAPTCHA widget or challenge is present on the page
 * @param {import('rebrowser-puppeteer-core').Page} page
 * @returns {Promise<{ hasCaptcha: boolean, type: string|null, sitekey: string|null }>}
 */
async function detectCaptcha(page) {
  if (!page || typeof page.evaluate !== 'function') {
    return { hasCaptcha: false, type: null, sitekey: null };
  }

  try {
    return await page.evaluate(() => {
      // 1. Google reCAPTCHA
      const recaptchaEl = document.querySelector('[data-sitekey], iframe[src*="recaptcha"], div.g-recaptcha, #captcha-form');
      if (recaptchaEl) {
        let sitekey = recaptchaEl.getAttribute('data-sitekey');
        if (!sitekey) {
          const iframe = document.querySelector('iframe[src*="recaptcha"]');
          if (iframe && iframe.src) {
            const m = iframe.src.match(/[?&]k=([^&]+)/);
            if (m) sitekey = m[1];
          }
        }
        return { hasCaptcha: true, type: 'recaptcha', sitekey: sitekey || null };
      }

      // 2. Cloudflare Turnstile
      const turnstile = document.querySelector('iframe[src*="turnstile"], div.cf-turnstile');
      if (turnstile) {
        const sitekey = turnstile.getAttribute('data-sitekey') || null;
        return { hasCaptcha: true, type: 'turnstile', sitekey };
      }

      // 3. hCaptcha
      const hcaptcha = document.querySelector('iframe[src*="hcaptcha"], div.h-captcha');
      if (hcaptcha) {
        const sitekey = hcaptcha.getAttribute('data-sitekey') || null;
        return { hasCaptcha: true, type: 'hcaptcha', sitekey };
      }

      // 4. Google /sorry/ page
      if (window.location.href.includes('/sorry/index') || window.location.href.includes('google.com/sorry')) {
        let sorrySitekey = null;
        const sorryRecaptcha = document.querySelector('[data-sitekey], iframe[src*="recaptcha"], form[action*="sorry"] [data-sitekey], #captcha-form [data-sitekey]');
        if (sorryRecaptcha) {
          sorrySitekey = sorryRecaptcha.getAttribute('data-sitekey');
          if (!sorrySitekey && sorryRecaptcha.src) {
            const m = sorryRecaptcha.src.match(/[?&]k=([^&]+)/);
            if (m) sorrySitekey = m[1];
          }
        }
        return { hasCaptcha: true, type: 'google_sorry', sitekey: sorrySitekey || null };
      }

      return { hasCaptcha: false, type: null, sitekey: null };
    });
  } catch (err) {
    return { hasCaptcha: false, type: null, sitekey: null };
  }
}

/**
 * Solves CAPTCHA using 2Captcha Extension if loaded in browser
 * @param {import('rebrowser-puppeteer-core').Page} page
 * @param {number} [timeoutMs=90000]
 * @returns {Promise<boolean>}
 */
async function solveViaExtension(page, timeoutMs = 90000) {
  try {
    // Poll up to 7s for the extension to detect captcha widget and mount its .captcha-solver button
    let hasSolverBtn = false;
    const checkStart = Date.now();
    while (Date.now() - checkStart < 7000) {
      hasSolverBtn = typeof page.$ === 'function'
        ? await page.$('.captcha-solver').catch(() => null)
        : await page.evaluate(() => !!document.querySelector('.captcha-solver')).catch(() => null);
      if (hasSolverBtn) break;
      await sleep(1000);
    }
    if (!hasSolverBtn) return false;

    console.log('🧩 [2Captcha Extension]: Solver button detected on page. Initiating automatic solve...');

    // Click solver button if in ready state
    await page.evaluate(() => {
      const btn = document.querySelector('.captcha-solver');
      if (btn && btn.getAttribute('data-state') === 'ready') {
        btn.click();
      }
    }).catch(() => {});

    const startTime = Date.now();
    let lastLog = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const state = await page.evaluate(() => {
        const btn = document.querySelector('.captcha-solver');
        if (!btn) return 'not_found';
        return btn.getAttribute('data-state') || 'unknown';
      }).catch(() => 'error');

      if (state === 'solved') {
        console.log('🎉 [2Captcha Extension]: CAPTCHA solved successfully!');
        await sleep(randomBetween(1500, 2500));
        return true;
      }

      if (Date.now() - lastLog >= 8000) {
        console.log(`⏳ [2Captcha Extension]: Solving in progress... (${Math.round((Date.now() - startTime) / 1000)}s elapsed, state: ${state})`);
        lastLog = Date.now();
      }

      await sleep(1500);
    }

    console.warn('⚠️ [2Captcha Extension]: Solving timed out.');
    return false;
  } catch (err) {
    console.warn('⚠️ [2Captcha Extension]: Notice during extension solve:', err.message);
    return false;
  }
}

/**
 * Solves reCAPTCHA V2 via direct 2Captcha HTTP API
 * @param {string} apiKey 2Captcha user key
 * @param {string} sitekey Target site key
 * @param {string} pageUrl Target page URL
 * @param {number} [timeoutMs=120000]
 * @returns {Promise<string|null>} Token string or null
 */
async function solveRecaptchaViaApi(apiKey, sitekey, pageUrl, timeoutMs = 120000) {
  if (!apiKey || !sitekey || !pageUrl) return null;

  try {
    console.log(`🌐 [2Captcha API]: Sending reCAPTCHA task to 2Captcha (sitekey: ${sitekey.slice(0, 10)}...)...`);

    // 1. Submit request
    const inUrl = `https://2captcha.com/in.php?key=${encodeURIComponent(apiKey)}&method=userrecaptcha&googlekey=${encodeURIComponent(sitekey)}&pageurl=${encodeURIComponent(pageUrl)}&json=1`;
    const inRes = await fetch(inUrl).then(r => r.json()).catch(() => null);

    if (!inRes || inRes.status !== 1 || !inRes.request) {
      console.warn('⚠️ [2Captcha API]: Failed to submit CAPTCHA task:', inRes?.request || 'Network error');
      return null;
    }

    const taskId = inRes.request;
    console.log(`⏳ [2Captcha API]: Task submitted (ID: ${taskId}). Awaiting solution...`);

    // 2. Poll for result
    const startTime = Date.now();
    await sleep(15000); // 2Captcha reCAPTCHA takes minimum 12-15s

    while (Date.now() - startTime < timeoutMs) {
      const resUrl = `https://2captcha.com/res.php?key=${encodeURIComponent(apiKey)}&action=get&id=${encodeURIComponent(taskId)}&json=1`;
      const resJson = await fetch(resUrl).then(r => r.json()).catch(() => null);

      if (resJson && resJson.status === 1 && resJson.request) {
        console.log('🎉 [2Captcha API]: Token received from 2Captcha successfully!');
        return resJson.request;
      }

      if (resJson && resJson.request !== 'CAPCHA_NOT_READY') {
        console.warn('⚠️ [2Captcha API]: 2Captcha returned response:', resJson.request);
        return null;
      }

      await sleep(5000);
    }

    console.warn('⚠️ [2Captcha API]: Solving timed out after 120s.');
    return null;
  } catch (err) {
    console.error('❌ [2Captcha API]: Error during API solving:', err.message);
    return null;
  }
}

/**
 * Injects solved reCAPTCHA response token into page DOM and dispatches callbacks
 * @param {import('rebrowser-puppeteer-core').Page} page
 * @param {string} token
 * @returns {Promise<boolean>}
 */
async function injectRecaptchaToken(page, token) {
  if (!page || !token) return false;

  try {
    return await page.evaluate((tok) => {
      let injected = false;

      // 1. Inject into standard response textareas
      const textareas = document.querySelectorAll(
        'textarea[name="g-recaptcha-response"], #g-recaptcha-response, textarea[id*="g-recaptcha"], textarea[name="h-captcha-response"], textarea[name="cf-turnstile-response"]'
      );
      textareas.forEach(ta => {
        ta.innerHTML = tok;
        ta.value = tok;
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        ta.dispatchEvent(new Event('change', { bubbles: true }));
        injected = true;
      });

      // 2. Execute explicit DOM data-callback if defined
      const cbEls = document.querySelectorAll('[data-callback], .g-recaptcha[data-callback]');
      cbEls.forEach(el => {
        const fnName = el.getAttribute('data-callback');
        if (fnName && typeof window[fnName] === 'function') {
          try {
            window[fnName](tok);
            injected = true;
          } catch (_) {}
        }
      });

      // 3. Deep recursive search inside window.___grecaptcha_cfg
      if (window.___grecaptcha_cfg && window.___grecaptcha_cfg.clients) {
        const executedCallbacks = new Set();
        function searchAndTrigger(obj, depth = 0) {
          if (!obj || depth > 8 || executedCallbacks.size > 2) return;
          for (const key of Object.keys(obj)) {
            try {
              const val = obj[key];
              if (!val) continue;
              if (key === 'callback') {
                if (typeof val === 'function' && !executedCallbacks.has(val)) {
                  executedCallbacks.add(val);
                  val(tok);
                  injected = true;
                } else if (typeof val === 'string' && typeof window[val] === 'function' && !executedCallbacks.has(window[val])) {
                  executedCallbacks.add(window[val]);
                  window[val](tok);
                  injected = true;
                }
              } else if (typeof val === 'object' && val !== null && !Array.isArray(val) && !val.nodeType) {
                searchAndTrigger(val, depth + 1);
              }
            } catch (_) {}
          }
        }

        for (const cid in window.___grecaptcha_cfg.clients) {
          searchAndTrigger(window.___grecaptcha_cfg.clients[cid], 0);
        }
      }

      // 4. Unlock disabled submit buttons on the form
      const submitButtons = document.querySelectorAll(
        'button[data-test-id="submit-button"], button[type="submit"], input[type="submit"], button.submit-button'
      );
      submitButtons.forEach(btn => {
        btn.removeAttribute('disabled');
        btn.disabled = false;
        btn.classList.remove('disabled');
        btn.dispatchEvent(new Event('change', { bubbles: true }));
      });

      return injected;
    }, token);
  } catch (err) {
    return false;
  }
}

/**
 * Universal Auto-Solver Orchestrator
 * Checks for CAPTCHA on page, tries Extension first, then API fallback, then graceful countdown.
 * 
 * @param {import('rebrowser-puppeteer-core').Page} page
 * @param {Object} [options]
 * @param {string} [options.apiKey] 2Captcha API Key
 * @param {boolean} [options.autoSolve=true]
 * @returns {Promise<{ handled: boolean, solved: boolean, method: string }>}
 */
async function handlePageCaptcha(page, options = {}) {
  const detection = await detectCaptcha(page);
  if (!detection.hasCaptcha) {
    return { handled: true, solved: true, method: 'none' };
  }

  console.log(`\n🛡️ [CAPTCHA Engine]: Detected "${detection.type?.toUpperCase()}" on active page.`);

  // 1. Try 2Captcha Extension first (highest reliability on Google dynamic forms)
  const extensionSolved = await solveViaExtension(page, 75000);
  if (extensionSolved) {
    return { handled: true, solved: true, method: 'extension' };
  }

  // 2. Resolve API key from options, environment, or SQLite app_settings
  let apiKey = options.apiKey || process.env.TWOCAPTCHA_API_KEY || '';
  if (!apiKey) {
    try {
      const { getDatabase } = require('../../database/db');
      const dbSettings = getDatabase().getSettings();
      if (dbSettings && dbSettings.captchaAutoSolve !== false && dbSettings.captchaApiKey) {
        apiKey = dbSettings.captchaApiKey;
      }
    } catch (_) {}
  }

  // 3. Try Direct 2Captcha API if API key provided and sitekey resolved
  if (apiKey && !detection.sitekey && (detection.type === 'recaptcha' || detection.type === 'google_sorry')) {
    detection.sitekey = await page.evaluate(() => {
      const el = document.querySelector('[data-sitekey]');
      if (el && el.getAttribute('data-sitekey')) return el.getAttribute('data-sitekey');
      const iframe = document.querySelector('iframe[src*="recaptcha"]');
      if (iframe && iframe.src) {
        const m = iframe.src.match(/[?&]k=([^&]+)/);
        if (m) return m[1];
      }
      return null;
    }).catch(() => null);
  }

  if (apiKey && detection.sitekey && (detection.type === 'recaptcha' || detection.type === 'google_sorry')) {
    const pageUrl = page.url();
    const token = await solveRecaptchaViaApi(apiKey, detection.sitekey, pageUrl, 90000);
    if (token) {
      const injected = await injectRecaptchaToken(page, token);
      if (injected) {
        console.log('✅ [CAPTCHA Engine]: Token injected into form successfully.');
        const isSorry = page.url().includes('/sorry/');
        if (isSorry) {
          console.log('🚀 [CAPTCHA Engine]: Submitting Google /sorry/ challenge form...');
          await page.evaluate(() => {
            const f = document.querySelector('#captcha-form, form[action*="sorry"]');
            if (f) f.submit();
          }).catch(() => {});
          await sleep(3500);
        } else {
          await sleep(randomBetween(1500, 2500));
        }
        return { handled: true, solved: true, method: 'api' };
      }
    }
  }

  // 4. Graceful Human Pause fallback (keeps browser open instead of abruptly crashing)
  console.log('⏳ [CAPTCHA Engine]: Awaiting manual CAPTCHA verification (up to 45s)...');
  const start = Date.now();
  while (Date.now() - start < 45000) {
    const check = await detectCaptcha(page);
    const u = page.url() || '';
    if (!check.hasCaptcha || (!u.includes('/sorry/') && !u.includes('recaptcha/api2/bframe'))) {
      console.log('🎉 [CAPTCHA Engine]: CAPTCHA cleared! Proceeding...');
      return { handled: true, solved: true, method: 'manual' };
    }
    await sleep(2000);
  }

  return { handled: false, solved: false, method: 'timeout' };
}

module.exports = {
  detectCaptcha,
  solveViaExtension,
  solveRecaptchaViaApi,
  injectRecaptchaToken,
  handlePageCaptcha
};
