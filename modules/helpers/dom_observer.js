/**
 * modules/helpers/dom_observer.js
 * Deterministic DOM Observer & Actionability Engine
 * 
 * Provides industry-standard actionability checks (Attached, Visible, Stable, Unobscured),
 * real-time anomaly detection (Captcha, Challenges, Offline), multi-tab synchronization,
 * and truthful progress-locked heartbeat logging.
 */

const { sleep, randomBetween } = require('./biometrics');

/**
 * Detects whether the active page has encountered an anomaly
 * (e.g. Google CAPTCHA / "sorry" page, Login challenge, Network offline, or Rate limiting)
 * 
 * @param {import('rebrowser-puppeteer-core').Page} page
 * @returns {Promise<{ isAnomaly: boolean, type: string|null, message: string|null }>}
 */
async function detectPageAnomaly(page) {
  if (!page || typeof page.url !== 'function') {
    return { isAnomaly: false, hasAnomaly: false, type: null, message: null };
  }

  try {
    const url = page.url() || '';

    // 1. Chrome Offline / Network Drop
    if (url.startsWith('chrome-error://') || url.includes('neterror')) {
      return {
        isAnomaly: true,
        hasAnomaly: true,
        type: 'OFFLINE',
        message: `Browser is offline (${url})`
      };
    }

    // 2. Google CAPTCHA / Unusual Traffic "Sorry" Page
    if (url.includes('/sorry/index') || url.includes('google.com/sorry')) {
      return {
        isAnomaly: true,
        hasAnomaly: true,
        type: 'CAPTCHA',
        message: 'Google Unusual Traffic / CAPTCHA page detected (/sorry/index)'
      };
    }

    // 3. Google Sign-In Challenge / Re-verification
    if (url.includes('accounts.google.com') && (url.includes('challenge') || url.includes('signin/rejected') || url.includes('recovery'))) {
      return {
        isAnomaly: true,
        hasAnomaly: true,
        type: 'SECURITY_CHALLENGE',
        message: `Google Account Challenge / Verification required (${url})`
      };
    }

    // 4. In-page DOM inspection for blocking Captcha walls or Rate Limit
    const domAnomaly = await page.evaluate(() => {
      // Check for Google blocking CAPTCHA wall form or Turnstile wall (distinct from embedded form widgets)
      const isBlockingForm = document.querySelector('#captcha-form, form[action*="sorry"], div#challenge-running, div.cf-turnstile-wrapper');
      if (isBlockingForm) {
        return { isAnomaly: true, hasAnomaly: true, type: 'CAPTCHA', message: 'Google bot challenge / CAPTCHA page detected in DOM' };
      }

      // Check for rate limit warnings
      const bodyText = (document.body ? document.body.innerText : '').toLowerCase();
      if (bodyText.includes('429 too many requests') || bodyText.includes('rate limit exceeded')) {
        return { isAnomaly: true, hasAnomaly: true, type: 'RATE_LIMIT', message: 'Rate limit (429) detected in page body' };
      }

      return null;
    }).catch(() => null);

    if (domAnomaly) {
      return { ...domAnomaly, hasAnomaly: true };
    }

    return { isAnomaly: false, hasAnomaly: false, type: null, message: null };
  } catch (err) {
    return { isAnomaly: false, hasAnomaly: false, type: null, message: null };
  }
}

/**
 * Checks whether a given element is truly actionable:
 * - Attached to DOM
 * - Visible (display !== 'none', visibility !== 'hidden', non-zero bounding rect)
 * - Enabled (not disabled or aria-disabled)
 * - Unobscured at its center point by an overlay/spinner (elementFromPoint test)
 * 
 * @param {import('rebrowser-puppeteer-core').Page} page
 * @param {import('rebrowser-puppeteer-core').ElementHandle} elementHandle
 * @returns {Promise<boolean>}
 */
async function isElementActionable(page, elementHandle) {
  if (!elementHandle) return false;

  try {
    return await page.evaluate(el => {
      if (!el || !el.isConnected) return false;

      // 1. Resolve effective target for visibility (support hidden native inputs wrapped in visible labels)
      let targetForVisibility = el;
      if (el.tagName === 'INPUT' && (el.type === 'radio' || el.type === 'checkbox')) {
        const parentLabel = el.closest('label') || el.parentElement;
        if (parentLabel) targetForVisibility = parentLabel;
      }

      // 2. Visibility style check
      const style = window.getComputedStyle(targetForVisibility);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        return false;
      }

      // 3. Disabled check
      if (el.disabled || el.getAttribute('aria-disabled') === 'true') {
        return false;
      }

      // 4. Geometry check on effective element
      const rect = targetForVisibility.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        if (style.display === 'contents') {
          const visibleChild = Array.from(targetForVisibility.children).find(c => {
            const r = c.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
          });
          if (visibleChild) return true;
        }
        return false;
      }

      // 5. Hit-test check: center point should belong to this element or its descendant
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      if (centerX < 0 || centerY < 0 || centerX > window.innerWidth || centerY > window.innerHeight) {
        // Element is offscreen, will need scrollIntoView
        return true;
      }

      const topEl = document.elementFromPoint(centerX, centerY);
      if (!topEl) return true;
      if (targetForVisibility.contains(topEl) || topEl.contains(targetForVisibility)) {
        return true;
      }

      // Support Material Design ripple overlays, touch targets, and card/list item containers
      const topStyle = window.getComputedStyle(topEl);
      if (topStyle.pointerEvents === 'none') {
        return true;
      }

      const elContainer = targetForVisibility.closest('li, [role="listitem"], .lBjADd, [role="button"], a');
      const topContainer = topEl.closest('li, [role="listitem"], .lBjADd, [role="button"], a');
      if (elContainer && topContainer && elContainer === topContainer) {
        return true;
      }

      return false;
    }, elementHandle);
  } catch (err) {
    return false;
  }
}

/**
 * Deterministically waits for an element to be attached, visible, and actionable in DOM.
 * Emits truthful heartbeat logs if page loading or rendering takes longer than threshold.
 * 
 * @param {import('rebrowser-puppeteer-core').Page} page
 * @param {string|Function} selectorOrFn CSS selector string or page.evaluate function
 * @param {Object} [options]
 * @param {number} [options.timeout=30000] Maximum wait time in ms
 * @param {number} [options.pollInterval=300] Polling interval in ms
 * @param {string} [options.description="target element"] Description for logging
 * @param {boolean} [options.checkAnomaly=true] Whether to inspect for Captcha/Challenges
 * @returns {Promise<import('rebrowser-puppeteer-core').ElementHandle|null>}
 */
async function waitForActionableElement(page, selectorOrFn, options = {}) {
  const timeout = options.timeout || 30000;
  const pollInterval = options.pollInterval || 300;
  const description = options.description || 'target element';
  const checkAnomaly = options.checkAnomaly !== false;

  const startTime = Date.now();
  let lastHeartbeat = Date.now();

  while (Date.now() - startTime < timeout) {
    // 1. Periodically check for page anomalies
    if (checkAnomaly && (Date.now() - startTime) % 2000 < pollInterval) {
      const anomaly = await detectPageAnomaly(page);
      if (anomaly.isAnomaly) {
        console.warn(`\n⚠️ [DOM Observer] Alert during wait for "${description}": ${anomaly.message}`);
        if (anomaly.type === 'CAPTCHA' || anomaly.type === 'SECURITY_CHALLENGE') {
          const currentUrl = typeof page.url === 'function' ? page.url() : '';
          if (currentUrl.includes('/sorry/index') || currentUrl.includes('google.com/sorry') || anomaly.type === 'CAPTCHA') {
            try {
              const { handlePageCaptcha } = require('../captcha/captcha_solver');
              console.log('🧩 [DOM Observer]: Invoking CAPTCHA Auto-Solver Engine...');
              const res = await handlePageCaptcha(page);
              if (res.solved) {
                console.log(`🎉 [CAPTCHA Solved]: Challenge bypassed! Resuming wait for "${description}"...`);
                continue;
              }
            } catch (_) {}

            console.log('⏳ [CAPTCHA Alert]: Keeping browser open for manual solve (30s)...');
            for (let s = 0; s < 30; s++) {
              await sleep(1000);
              const u = typeof page.url === 'function' ? page.url() : '';
              if (!u.includes('/sorry/index') && !u.includes('google.com/sorry')) {
                console.log('🎉 [CAPTCHA Solved]: URL changed away from /sorry/! Resuming flow...');
                break;
              }
            }
            const finalUrl = typeof page.url === 'function' ? page.url() : '';
            if (finalUrl.includes('/sorry/index') || finalUrl.includes('google.com/sorry')) {
              throw new Error(`Execution halted: ${anomaly.message}`);
            }
          } else {
            console.log(`ℹ️ [DOM Observer]: Non-blocking alert (${anomaly.message}); continuing wait for "${description}"...`);
          }
        }
      }
    }

    // 2. Locate element
    let handle = null;
    try {
      if (typeof selectorOrFn === 'string') {
        if (selectorOrFn.includes(',')) {
          const candidates = await page.$$(selectorOrFn).catch(() => []);
          for (const cand of candidates) {
            const act = await isElementActionable(page, cand);
            if (act) {
              handle = cand;
              break;
            }
          }
        } else {
          handle = await page.$(selectorOrFn).catch(() => null);
        }
      } else if (typeof selectorOrFn === 'function') {
        handle = await selectorOrFn(page).catch(() => null);
      }
    } catch {
      handle = null;
    }

    // 3. Verify actionability (if not already verified in candidate loop)
    if (handle) {
      const actionable = await isElementActionable(page, handle);
      if (actionable) {
        return handle;
      }
    }

    // 4. Truthful Heartbeat Log if waiting exceeds 4 seconds
    const elapsed = Date.now() - startTime;
    if (elapsed > 4000 && Date.now() - lastHeartbeat >= 4000) {
      const currentUrl = typeof page.url === 'function' ? page.url() : '';
      const displayUrl = currentUrl.length > 50 ? `${currentUrl.slice(0, 50)}...` : currentUrl;
      console.log(`⏳ [Browser Sync]: Still waiting for "${description}" (${Math.round(elapsed / 1000)}s elapsed, page: ${displayUrl})...`);
      lastHeartbeat = Date.now();
    }

    await sleep(pollInterval);
  }

  return null;
}

/**
 * Synchronizes with a newly opened tab or wait for current page to transition to a target URL pattern.
 * Brings new tab to front, ensures document.readyState === 'complete', and returns the active Page handle.
 * 
 * @param {import('rebrowser-puppeteer-core').Browser} browser
 * @param {import('rebrowser-puppeteer-core').Page} activePage
 * @param {Array<string>|string} targetUrlPatterns Substrings to match in target URL
 * @param {Object} [options]
 * @param {number} [options.timeout=25000]
 * @returns {Promise<import('rebrowser-puppeteer-core').Page>}
 */
async function waitForPageOrTabTransition(browser, activePage, targetUrlPatterns, options = {}) {
  const timeout = options.timeout || 25000;
  const patterns = Array.isArray(targetUrlPatterns) ? targetUrlPatterns : [targetUrlPatterns];
  const startTime = Date.now();
  let lastHeartbeat = Date.now();

  const patternLabels = patterns.map(p => typeof p === 'function' ? (p.name || 'customPredicate') : String(p));
  console.log(`🔍 [Tab Sync]: Synchronizing page/tab transition to [${patternLabels.join(', ')}]...`);

  while (Date.now() - startTime < timeout) {
    // 1. Check existing open pages in the browser
    if (browser && typeof browser.pages === 'function') {
      const allPages = await browser.pages().catch(() => []);
      for (const p of allPages) {
        const u = (typeof p.url === 'function' ? p.url() : '') || '';
        const matches = patterns.some(pattern => {
          if (typeof pattern === 'function') {
            try { return Boolean(pattern(p)); } catch { return false; }
          }
          return typeof pattern === 'string' && u.toLowerCase().includes(pattern.toLowerCase());
        });
        if (matches) {
          // Wait for readyState complete
          const isComplete = await p.evaluate(() => document.readyState === 'complete').catch(() => false);
          if (isComplete) {
            await p.bringToFront().catch(() => {});
            if (p !== activePage) {
              console.log(`📑 [Tab Sync]: Successfully switched to target tab: ${p.url()}`);
            } else {
              console.log(`📑 [Tab Sync]: Target page confirmed on current tab: ${p.url()}`);
            }
            return p;
          }
        }
      }
    }

    // 2. Check active page directly
    if (activePage && typeof activePage.url === 'function') {
      const u = activePage.url() || '';
      const matches = patterns.some(pattern => {
        if (typeof pattern === 'function') {
          try { return Boolean(pattern(activePage)); } catch { return false; }
        }
        return typeof pattern === 'string' && u.toLowerCase().includes(pattern.toLowerCase());
      });
      if (matches) {
        const isComplete = await activePage.evaluate(() => document.readyState === 'complete').catch(() => false);
        if (isComplete) {
          console.log(`📑 [Tab Sync]: Target confirmed on active tab: ${activePage.url()}`);
          return activePage;
        }
      }
    }

    const elapsed = Date.now() - startTime;
    if (elapsed > 4000 && Date.now() - lastHeartbeat >= 4000) {
      console.log(`⏳ [Tab Sync]: Waiting for target tab to open and finish loading (${Math.round(elapsed / 1000)}s elapsed)...`);
      lastHeartbeat = Date.now();
    }

    await sleep(400);
  }

  console.warn(`⚠️ [Tab Sync]: Transition wait timed out after ${timeout}ms. No new tab/transition detected.`);
  return null;
}

/**
 * Specifically waits for a Google Troubleshooter question node to expand and become actionable in the DOM.
 * Detects already-selected answers instantly (< 50ms) and checks unhidden active node status.
 * 
 * @param {import('rebrowser-puppeteer-core').Page} page
 * @param {Object} criteria
 * @param {string} [criteria.inputName]
 * @param {string} [criteria.inputValue]
 * @param {string} [criteria.textPattern]
 * @param {string} criteria.labelDescription
 * @param {Object} [options]
 * @returns {Promise<boolean>}
 */
async function waitForTroubleshooterQuestion(page, criteria, options = {}) {
  const timeout = options.timeout || 20000;
  const { inputName, inputValue, textPattern, labelDescription } = criteria;
  const startTime = Date.now();
  let lastHeartbeat = Date.now();

  while (Date.now() - startTime < timeout) {
    // 1. Periodically check for page anomalies
    if ((Date.now() - startTime) % 2000 < 300) {
      const anomaly = await detectPageAnomaly(page);
      if (anomaly.isAnomaly) {
        console.warn(`\n⚠️ [DOM Observer] Alert during wait for option "${labelDescription}": ${anomaly.message}`);
        if (anomaly.type === 'CAPTCHA' || anomaly.type === 'SECURITY_CHALLENGE') {
          const currentUrl = typeof page.url === 'function' ? page.url() : '';
          if (currentUrl.includes('/sorry/index') || currentUrl.includes('google.com/sorry')) {
            try {
              const { handlePageCaptcha } = require('../captcha/captcha_solver');
              console.log('🧩 [DOM Observer]: Invoking CAPTCHA Auto-Solver Engine during Troubleshooter wait...');
              const res = await handlePageCaptcha(page);
              if (res.solved) {
                console.log('🎉 [CAPTCHA Solved]: CAPTCHA challenge bypassed! Resuming Troubleshooter...');
                continue;
              }
            } catch (_) {}
            throw new Error(`Execution halted: ${anomaly.message}`);
          }
        }
      }
    }

    // 2. Evaluate readiness in page context
    const status = await page.evaluate((name, val, pat) => {
      const reg = pat ? new RegExp(pat, 'i') : null;

      // Find input
      let input = null;
      if (name && val) input = document.querySelector(`input[name="${name}"][value="${val}"]`);
      if (!input && val) input = document.querySelector(`input[value="${val}"]`);

      // Check if already selected / answered
      if (input) {
        if (input.checked) return 'ALREADY_SELECTED';
        const spanRadio = input.parentElement ? input.parentElement.querySelector('[role="radio"]') : null;
        if (spanRadio && spanRadio.getAttribute('aria-checked') === 'true') return 'ALREADY_SELECTED';
      }

      // Check if question is answered with matching choice text
      const answeredQuestions = Array.from(document.querySelectorAll('.question.answered'));
      for (const q of answeredQuestions) {
        if (input && q.contains(input)) return 'ALREADY_SELECTED';
        const choice = q.querySelector('.choice');
        if (choice && reg && reg.test(choice.textContent || '')) return 'ALREADY_SELECTED';
      }

      // Check if input exists in an active (unhidden) container
      if (input) {
        const hiddenParent = input.closest('.hidden');
        if (!hiddenParent) {
          const label = input.closest('label') || input.parentElement;
          if (label) {
            const style = window.getComputedStyle(label);
            if (style.display !== 'none' && style.visibility !== 'hidden') {
              return 'READY';
            }
          }
          return 'READY';
        }
      }

      // Check by text pattern in visible labels
      if (reg) {
        const labels = Array.from(document.querySelectorAll('label, .question label'));
        for (const l of labels) {
          if (!l.closest('.hidden')) {
            const txt = (l.innerText || l.textContent || '').trim();
            if (reg.test(txt)) {
              const style = window.getComputedStyle(l);
              if (style.display !== 'none' && style.visibility !== 'hidden') {
                return 'READY';
              }
            }
          }
        }
      }

      return 'WAITING';
    }, inputName, inputValue, textPattern).catch(() => 'WAITING');

    if (status === 'ALREADY_SELECTED' || status === 'READY') {
      return true;
    }

    // Heartbeat log if waiting > 4s
    const elapsed = Date.now() - startTime;
    if (elapsed > 4000 && Date.now() - lastHeartbeat >= 4000) {
      console.log(`⏳ [Browser Sync]: Still waiting for "Option for "${labelDescription}"" (${Math.round(elapsed / 1000)}s elapsed)...`);
      lastHeartbeat = Date.now();
    }

    await sleep(250);
  }

  console.warn(`⚠️ [DOM Observer]: Timeout waiting for option "${labelDescription}". Continuing best-effort...`);
  return false;
}

module.exports = {
  detectPageAnomaly,
  isElementActionable,
  waitForActionableElement,
  waitForPageOrTabTransition,
  waitForTroubleshooterQuestion
};
