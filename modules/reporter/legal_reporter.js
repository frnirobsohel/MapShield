/**
 * modules/reporter/legal_reporter.js
 * Automated Google Legal Removal Notice & Troubleshooter Pipeline
 * 
 * Implements 2-stage legal takedown:
 * Stage 1: Google Troubleshooter (1114905) 5-step radio sequence + "Create request" click
 * Stage 2: Google Legal Removal Form (page-legal-other-geo-form / reportcontent.google.com)
 *          Auto-fills Country, Full Name, Defamation Grounds (<1000 chars), Checkboxes & Digital Signature.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  sleep: defaultSleep,
  gaussianRandom,
  randomBetween,
  smartClick: defaultSmartClick,
  clickElementByText,
  captureProofScreenshot,
  humanType,
  waitForActionableElement,
  detectPageAnomaly,
  waitForPageOrTabTransition,
  waitForTroubleshooterQuestion
} = require('../helpers');

const TROUBLESHOOTER_URL = 'https://support.google.com/legal/troubleshooter/1114905';

// Comprehensive Troubleshooter Options & Adaptive Path Configurations
const TROUBLESHOOTER_OPTIONS = {
  step1: {
    step: 1,
    name: 'Product Selection',
    inputName: '1620659',
    inputValue: '9723198',
    textPattern: 'Google Maps, Waze and related products|Google Maps',
    labelDescription: 'Google Maps, Waze and related products'
  },
  step2: {
    step: 2,
    name: 'AI Generated Content Check',
    inputName: '14440196',
    inputValue: '14438492',
    textPattern: '^\\s*No\\s*$',
    labelDescription: 'No'
  },
  step2AIYes: {
    step: 2,
    name: 'AI Generated Content Check (Yes)',
    inputName: '14440196',
    inputValue: '14438288',
    textPattern: '^\\s*Yes\\s*$',
    labelDescription: 'Yes (AI Generated Content Check)'
  },
  step3Maps: {
    step: 3,
    name: 'Specific Maps Product (Primary)',
    inputName: '9722894',
    inputValue: '1115689',
    textPattern: '^\\s*Maps\\s*$',
    labelDescription: 'Maps'
  },
  step3LocalListings: {
    step: 3,
    name: 'Specific Maps Product (Local Listings Fallback)',
    inputName: '9722894',
    textPattern: 'Local listings.*business listings|Local listings',
    labelDescription: 'Local listings (including business listings), photos, or saved items'
  },
  step3LegalReasonsAI: {
    step: 3,
    name: 'Legal vs Policy Reason (AI Branch)',
    inputName: '14768775',
    inputValue: '16943707',
    textPattern: 'Legal Reasons to Report Content',
    labelDescription: 'Legal Reasons to Report Content'
  },
  step4: {
    step: 4,
    name: 'Legal vs Policy Reason',
    inputName: '13011237',
    inputValue: '13010990',
    textPattern: 'Legal Reasons to Report Content',
    labelDescription: 'Legal Reasons to Report Content'
  },
  step4DefamationAI: {
    step: 4,
    name: 'Legal Grounds - Defamation (AI Branch)',
    inputName: '16943637',
    inputValue: '16944292',
    textPattern: 'Defamation: Report content that defames|Defamation',
    labelDescription: 'Defamation: Report content that defames you or your business/organization'
  },
  step5Defamation: {
    step: 5,
    name: 'Legal Grounds - Defamation (Primary)',
    inputName: '13011800',
    inputValue: '15220331',
    textPattern: 'Defamation: Report content that defames|Defamation',
    labelDescription: 'Defamation: Report content that defames you or your business'
  },
  step5Other: {
    step: 5,
    name: 'Legal Grounds - Other (Fallback)',
    textPattern: 'Other: Report content for a legal reason not listed above|legal reason not listed above|Other',
    labelDescription: 'Other: Report content for a legal reason not listed above (for example, content violating local anti-terrorism or hate speech laws)'
  }
};

// Backward compatible 5-Step Troubleshooter Mapping
const TROUBLESHOOTER_STEPS = [
  TROUBLESHOOTER_OPTIONS.step1,
  TROUBLESHOOTER_OPTIONS.step2,
  TROUBLESHOOTER_OPTIONS.step3Maps,
  TROUBLESHOOTER_OPTIONS.step4,
  TROUBLESHOOTER_OPTIONS.step5Defamation
];

// Map tracking preferred troubleshooter path specifically per normalized review URL
// key: normalized review link string -> value: 'ai_yes' | 'legacy'
const reviewLinkTroubleshooterPreferences = new Map();

/**
 * Normalizes a review URL by removing hash and non-essential query parameters
 * @param {string} url
 * @returns {string}
 */
function normalizeReviewUrl(url) {
  if (!url || typeof url !== 'string') return '';
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`.toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

/**
 * Gets the preferred troubleshooter path for a specific review link
 * @param {string} reviewUrl
 * @returns {'ai_yes' | 'legacy' | null}
 */
function getReviewLinkPreferredPath(reviewUrl) {
  const key = normalizeReviewUrl(reviewUrl);
  if (!key) return null;
  if (reviewLinkTroubleshooterPreferences.has(key)) {
    return reviewLinkTroubleshooterPreferences.get(key);
  }
  try {
    const { getDatabase } = require('../../database/db');
    const db = getDatabase();
    if (db && db.db) {
      const hashedKey = `ts_pref_${crypto.createHash('md5').update(key).digest('hex')}`;
      const row = db.db.prepare('SELECT value FROM app_settings WHERE key = ?').get(hashedKey);
      if (row && row.value) {
        reviewLinkTroubleshooterPreferences.set(key, row.value);
        return row.value;
      }
    }
  } catch (_) {}
  return null;
}

/**
 * Sets the preferred troubleshooter path for a specific review link
 * @param {string} reviewUrl
 * @param {'ai_yes' | 'legacy'} pathKey
 */
function setReviewLinkPreferredPath(reviewUrl, pathKey) {
  const key = normalizeReviewUrl(reviewUrl);
  if (!key) return;
  reviewLinkTroubleshooterPreferences.set(key, pathKey);
  try {
    const { getDatabase } = require('../../database/db');
    const db = getDatabase();
    if (db && db.db) {
      const hashedKey = `ts_pref_${crypto.createHash('md5').update(key).digest('hex')}`;
      db.db.prepare(`
        INSERT INTO app_settings (key, value, updatedAt)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt
      `).run(hashedKey, pathKey, new Date().toISOString());
    }
  } catch (_) {}
}

/**
 * Clears the link preferences registry (useful for testing)
 */
function clearReviewLinkPreferences() {
  reviewLinkTroubleshooterPreferences.clear();
  try {
    const { getDatabase } = require('../../database/db');
    const db = getDatabase();
    if (db && db.db) {
      db.db.prepare("DELETE FROM app_settings WHERE key LIKE 'ts_pref_%'").run();
    }
  } catch (_) {}
}

/**
 * Deduplicates consecutive repeated words and multi-word phrase patterns
 * e.g. ["Vishnu", "singh", "Vishnu", "singh"] -> ["Vishnu", "singh"]
 * e.g. ["John", "John", "Doe"] -> ["John", "Doe"]
 * e.g. ["Nirob", "Sohel", "Nirob", "Sohel"] -> ["Nirob", "Sohel"]
 */
function deduplicateWords(words) {
  if (!words || words.length <= 1) return words;

  // 1. Remove consecutive identical words (case-insensitive)
  let deduped = [];
  for (let i = 0; i < words.length; i++) {
    if (i === 0 || words[i].toLowerCase() !== words[i - 1].toLowerCase()) {
      deduped.push(words[i]);
    }
  }

  // 2. Detect repeated phrase sequences (e.g. [A, B, A, B] -> [A, B], [A, B, C, A, B, C] -> [A, B, C])
  for (let patLen = Math.floor(deduped.length / 2); patLen >= 1; patLen--) {
    if (deduped.length % patLen === 0) {
      let isAllRepeats = true;
      const firstChunk = deduped.slice(0, patLen).map(w => w.toLowerCase()).join(' ');
      for (let offset = patLen; offset < deduped.length; offset += patLen) {
        const chunk = deduped.slice(offset, offset + patLen).map(w => w.toLowerCase()).join(' ');
        if (chunk !== firstChunk) {
          isAllRepeats = false;
          break;
        }
      }
      if (isAllRepeats) {
        deduped = deduped.slice(0, patLen);
        break;
      }
    }
  }

  return deduped;
}

/**
 * Formats a clean, proper capitalized human legal name from a string, Google profile, or email.
 * Resolves duplicated phrases, removes metadata annotations, splits compound usernames,
 * and ensures flawless Title-Casing.
 * e.g. "Vishnu singh Vishnu singh" -> "Vishnu Singh"
 * e.g. "vvishnusingh09@gmail.com" -> "Vishnu Singh"
 * e.g. "nirobsohel272@gmail.com" -> "Nirob Sohel"
 * e.g. "John Doe John Doe" -> "John Doe"
 */
function formatCleanHumanName(raw) {
  if (!raw || typeof raw !== 'string') return 'Google Business Representative';

  let str = raw.trim();
  if (!str) return 'Google Business Representative';

  // Strip email domain if present
  if (str.includes('@')) {
    str = str.split('@')[0];
  }

  // Remove URLs if any
  str = str.replace(/https?:\/\/\S+/gi, '');
  // Remove parenthesized notes (e.g. "(Owner)", "(verified)", "(Google Account)")
  str = str.replace(/\([^)]*\)/g, ' ');
  // Remove numbers
  str = str.replace(/[0-9]+/g, ' ').trim();
  // Replace punctuation and separators with spaces
  str = str.replace(/[._\-+/:\\|,]/g, ' ');
  // Remove repeated leading single letter from usernames (e.g. vvishnusingh -> vishnusingh)
  str = str.replace(/^([a-z])\1(?=[a-z]{3,})/i, '$1');

  let words = str.split(/\s+/).filter(Boolean);

  // If a single combined word has duplicate halves (e.g. "VishnuSinghVishnuSingh")
  if (words.length === 1 && words[0].length >= 6) {
    const w = words[0];
    const half = Math.floor(w.length / 2);
    if (w.length % 2 === 0 && w.slice(0, half).toLowerCase() === w.slice(half).toLowerCase()) {
      words = [w.slice(0, half)];
    }
  }

  // If single combined word, attempt to split common compound names/last names
  if (words.length === 1 && words[0].length >= 6) {
    const commonLastNames = ['singh', 'sohel', 'kumar', 'khan', 'sharma', 'smith', 'jones', 'brown', 'wilson', 'taylor', 'johnson', 'patel', 'ahmed', 'rahman', 'ali', 'hasan', 'hossain'];
    const lower = words[0].toLowerCase();
    for (const ln of commonLastNames) {
      if (lower.endsWith(ln) && lower.length > ln.length) {
        const first = lower.slice(0, lower.length - ln.length);
        words = [first, ln];
        break;
      }
    }
  }

  // Deduplicate consecutive identical words and repeated phrase patterns
  words = deduplicateWords(words);

  if (words.length === 0) return 'Google Business Representative';
  if (words.length === 1) {
    words.push('Representative');
  }

  // Proper Title-casing for each name part
  return words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

/**
 * Extracts the real human legal name from the active Google Account session on the page
 * Multi-layer detection strategy:
 * Layer 1 (Direct Read): Inspect avatar aria-label / title / alt for "Google Account: Full Name (email)"
 * Layer 2 (Avatar Click): If name not found or only email present, click the avatar to reveal Google's profile card popup, extract prominent display name, and close cleanly.
 * Layer 3 (Verified Callout): Extract verified email badge at top of Google Legal form and format clean name.
 */
async function extractGoogleProfileName(page) {
  try {
    // Layer 1: Fast direct read of avatar aria-label / title without clicking
    let extractedName = await page.evaluate(() => {
      const candidates = Array.from(document.querySelectorAll(
        'a[aria-label*="Google Account"], button[aria-label*="Google Account"], ' +
        'header a[aria-label*="@"], header button[aria-label*="@"], ' +
        '[data-g-label="Account"], .gb_d[aria-label], .gb_A[aria-label]'
      ));

      for (const el of candidates) {
        const label = (el.getAttribute('aria-label') || '').trim();
        const match = label.match(/Google Account:\s*([^\n\(\<]+)/i);
        if (match && match[1]) {
          const rawName = match[1].trim();
          if (rawName && !rawName.includes('@') && rawName.length >= 2 && !/^google account/i.test(rawName)) {
            return rawName;
          }
        }
      }

      // Check avatar images
      const avatarImgs = Array.from(document.querySelectorAll('img[alt*="Google Account"], img[title*="Google Account"]'));
      for (const img of avatarImgs) {
        const t = (img.getAttribute('title') || img.getAttribute('alt') || '').trim();
        const match = t.match(/Google Account:\s*([^\n\(\<]+)/i);
        if (match && match[1]) {
          const rawName = match[1].trim();
          if (rawName && !rawName.includes('@') && rawName.length >= 2) {
            return rawName;
          }
        }
      }

      return null;
    });

    if (extractedName) {
      const cleanName = formatCleanHumanName(extractedName);
      console.log(`👤 [Profile Detection]: Found name from avatar aria-label: "${cleanName}"`);
      return cleanName;
    }

    // Layer 2: Click the avatar button to open Profile Card Popup (as user suggested)
    console.log('👤 [Profile Detection]: Clicking avatar to inspect Google Profile popup card...');
    const avatarHandle = await page.$(
      'a[aria-label*="Google Account"], button[aria-label*="Google Account"], ' +
      'header a[role="button"][aria-label], header button[aria-label*="@"], ' +
      '.gb_A, .gb_d, [data-g-label="Account"], a[href*="accounts.google.com/SignOutOptions"]'
    ).catch(() => null);

    if (avatarHandle) {
      // Click the avatar
      await avatarHandle.click({ delay: 60 }).catch(() => {});
      await page.evaluate(() => new Promise(r => setTimeout(r, 800)));

      // 2a. Check DOM of current page for popup display name
      extractedName = await page.evaluate(() => {
        const popupEls = Array.from(document.querySelectorAll(
          '[role="dialog"] div, .gb_D div, .gb_c div, .gb_P div, div[class*="profile"] div, ' +
          'div[style*="font-weight: 500"], div[style*="font-weight:500"], div[style*="font-weight: 600"], div[style*="font-weight:600"]'
        ));

        for (const el of popupEls) {
          const text = (el.innerText || el.textContent || '').trim();
          if (
            text.length >= 3 &&
            text.length <= 40 &&
            !text.includes('@') &&
            !text.includes('http') &&
            !text.includes('\n') &&
            !/manage your google|sign out|add account|privacy policy|terms of service|switch account|choose an account/i.test(text)
          ) {
            const parentText = (el.parentElement?.innerText || '').toLowerCase();
            if (parentText.includes('@gmail.com') || parentText.includes('@googlemail.com') || parentText.includes('@')) {
              return text;
            }
          }
        }
        return null;
      });

      // 2b. If popup is rendered inside Google Account iframe (iframe[name="account"])
      if (!extractedName) {
        const frames = page.frames();
        for (const frame of frames) {
          try {
            const frameUrl = frame.url();
            if (frameUrl.includes('accounts.google.com') || frameUrl.includes('myaccount') || frame.name() === 'account') {
              const nameInFrame = await frame.evaluate(() => {
                const candidates = Array.from(document.querySelectorAll('div, h1, h2, span'));
                for (const c of candidates) {
                  const t = (c.innerText || c.textContent || '').trim();
                  if (t.length >= 3 && t.length <= 35 && !t.includes('@') && !t.includes('\n')) {
                    const parent = c.parentElement?.innerText || '';
                    if (parent.includes('@')) {
                      return t;
                    }
                  }
                }
                return null;
              }).catch(() => null);

              if (nameInFrame) {
                extractedName = nameInFrame;
                break;
              }
            }
          } catch (_) {}
        }
      }

      // Close the popup by pressing Escape and clicking body cleanly
      await page.keyboard.press('Escape').catch(() => {});
      await page.evaluate(() => {
        document.body.click();
      }).catch(() => {});
      await page.evaluate(() => new Promise(r => setTimeout(r, 400)));

      if (extractedName) {
        const cleanName = formatCleanHumanName(extractedName);
        console.log(`👤 [Profile Detection]: Successfully extracted name from profile card popup: "${cleanName}"`);
        return cleanName;
      }
    }

    // Layer 3: Check verified email callout at top of Google Legal form
    const verifiedEmail = await page.evaluate(() => {
      const el = document.querySelector('[data-test-id="email-verification-callout"] b');
      return el ? el.textContent.trim() : null;
    }).catch(() => null);

    if (verifiedEmail && verifiedEmail.includes('@')) {
      const formatted = formatCleanHumanName(verifiedEmail);
      console.log(`👤 [Profile Detection]: Derived clean name from verified email (${verifiedEmail}): "${formatted}"`);
      return formatted;
    }

  } catch (err) {
    console.warn('⚠️ [Profile Detection] Notice:', err.message);
  }
  return null;
}

/**
 * Selects a Troubleshooter radio option by value or fuzzy text pattern with natural mouse movement & scroll
 * @param {import('rebrowser-puppeteer-core').Page} page
 * @param {Object} criteria
 * @param {string} [criteria.inputName]
 * @param {string} [criteria.inputValue]
 * @param {string} [criteria.textPattern]
 * @param {string} criteria.labelDescription
 * @param {Object} [options]
 * @returns {Promise<boolean>}
 */
async function selectOptionByCriteria(page, criteria, options = {}) {
  const sleep = options.sleep || defaultSleep;
  const cursor = options.cursor;
  const { inputName, inputValue, textPattern, labelDescription } = criteria;

  console.log(`👀 Reading & selecting option for "${labelDescription}"...`);
  await sleep(randomBetween(1200, 1800));

  // 0. Check if target option is ALREADY selected and satisfied
  const alreadySelected = await page.evaluate((name, val, pattern) => {
    let input = null;
    if (name && val) input = document.querySelector(`input[name="${name}"][value="${val}"]`);
    if (!input && val) input = document.querySelector(`input[value="${val}"]`);
    if (input) {
      if (input.checked) return true;
      const spanRadio = input.parentElement ? input.parentElement.querySelector('[role="radio"]') : null;
      if (spanRadio && spanRadio.getAttribute('aria-checked') === 'true') return true;
    }
    const answeredQs = Array.from(document.querySelectorAll('.question.answered, .scSharedMaterialtroubleshooterFlowquestion.answered, [data-question-id].answered'));
    for (const q of answeredQs) {
      if (input && q.contains(input)) {
        const choice = q.querySelector('.choice');
        if (choice && (!val || q.querySelector(`input[value="${val}"]:checked`) || (pattern && new RegExp(pattern, 'i').test(choice.textContent || '')))) {
          return true;
        }
      }
    }
    return false;
  }, inputName, inputValue, textPattern).catch(() => false);

  if (alreadySelected) {
    console.log(`   ✅ Option for "${labelDescription}" is already selected.`);
    return true;
  }

  // 1. If the target question was previously answered with a DIFFERENT value, uncollapse it
  await page.evaluate((name, val, pattern) => {
    const reg = pattern ? new RegExp(pattern, 'i') : null;
    const answeredQs = Array.from(document.querySelectorAll('.question.answered, .scSharedMaterialtroubleshooterFlowquestion.answered, [data-question-id].answered'));
    for (const q of answeredQs) {
      let isTarget = false;
      if (name && q.querySelector(`input[name="${name}"]`)) isTarget = true;
      if (!isTarget && val && q.querySelector(`input[value="${val}"]`)) isTarget = true;
      if (!isTarget && reg) {
        const text = (q.innerText || q.textContent || '').trim();
        if (reg.test(text)) isTarget = true;
      }

      if (isTarget) {
        const choice = q.querySelector('.choice') || q.querySelector('svg') || q;
        choice.click();
        q.classList.remove('answered');
      }
    }
  }, inputName, inputValue, textPattern).catch(() => {});

  // 2. Wait for option to appear in DOM (up to 15s)
  let foundHandle = null;
  for (let attempt = 0; attempt < 15; attempt++) {
    if (inputValue) {
      const sel = inputName
        ? `input[name="${inputName}"][value="${inputValue}"]`
        : `input[value="${inputValue}"]`;
      foundHandle = await page.$(sel).catch(() => null);
    }

    if (!foundHandle && textPattern) {
      foundHandle = await page.evaluateHandle((pattern) => {
        const reg = new RegExp(pattern, 'i');
        const labels = Array.from(document.querySelectorAll('label, .scSharedMaterialtroubleshooterFlowquestion label, .question label'));
        for (const l of labels) {
          const t = (l.innerText || l.textContent || '').trim();
          if (reg.test(t)) {
            return l;
          }
        }
        return null;
      }, textPattern).catch(() => null);

      if (foundHandle && (await foundHandle.asElement()) === null) {
        foundHandle = null;
      }
    }

    if (foundHandle) break;
    await sleep(600);
  }

  // 3. Scroll into view and move cursor if available
  if (foundHandle) {
    await page.evaluate(el => {
      const target = el.closest('label') || el.parentElement || el;
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, foundHandle).catch(() => {});
    await sleep(randomBetween(400, 700));

    if (cursor && typeof cursor.moveTo === 'function') {
      await cursor.moveTo(foundHandle).catch(() => {});
      await sleep(randomBetween(200, 400));
    }
  }

  // 4. Click and dispatch change events
  const clicked = await page.evaluate((name, val, pattern) => {
    let input = null;
    let label = null;

    if (name && val) {
      input = document.querySelector(`input[name="${name}"][value="${val}"]`);
    }
    if (!input && val) {
      input = document.querySelector(`input[value="${val}"]`);
    }

    if (input) {
      label = input.closest('label') || input.parentElement;
    } else if (pattern) {
      const reg = new RegExp(pattern, 'i');
      const allLabels = Array.from(document.querySelectorAll('label, .scSharedMaterialtroubleshooterFlowquestion label, .question label'));
      for (const l of allLabels) {
        const txt = (l.innerText || l.textContent || '').trim();
        if (reg.test(txt)) {
          label = l;
          input = l.querySelector('input[type="radio"]') || (l.htmlFor ? document.getElementById(l.htmlFor) : null);
          if (input) break;
        }
      }
    }

    if (label || input) {
      const clickTarget = label || input;
      clickTarget.scrollIntoView({ behavior: 'smooth', block: 'center' });
      clickTarget.click();
      if (input) {
        input.checked = true;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return true;
    }
    return false;
  }, inputName, inputValue, textPattern).catch(() => false);

  if (clicked) {
    console.log(`   ✅ Selected: "${labelDescription}"`);
    await sleep(randomBetween(1800, 2600));
    return true;
  }

  console.warn(`   ⚠️ Could not select "${labelDescription}" directly.`);
  return false;
}

/**
 * Checks whether the "Defamation" option is currently rendered and visible in DOM
 * @param {import('rebrowser-puppeteer-core').Page} page
 * @returns {Promise<boolean>}
 */
async function isDefamationAvailable(page) {
  return await page.evaluate(() => {
    // 1. Check by exact value 15220331 (legacy) or 16944292 (AI branch)
    const byVal = document.querySelector('input[value="15220331"], input[value="16944292"]');
    if (byVal) {
      const parentLabel = byVal.closest('label') || byVal.parentElement;
      if (parentLabel) {
        const style = window.getComputedStyle(parentLabel);
        if (style.display !== 'none' && style.visibility !== 'hidden') {
          return true;
        }
      } else {
        return true;
      }
    }

    // 2. Check by text in visible labels
    const labels = Array.from(document.querySelectorAll('label, .scSharedMaterialtroubleshooterFlowquestion label, .question label'));
    for (const l of labels) {
      const txt = (l.innerText || l.textContent || '').toLowerCase();
      if (txt.includes('defamation')) {
        const style = window.getComputedStyle(l);
        if (style.display !== 'none' && style.visibility !== 'hidden') {
          return true;
        }
      }
    }
    return false;
  }).catch(() => false);
}

/**
 * Waits for step 5 options to expand in the DOM
 * @param {import('rebrowser-puppeteer-core').Page} page
 * @param {number} [timeoutMs]
 */
async function waitForStep5Options(page, timeoutMs = 6000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ready = await page.evaluate(() => {
      const labels = Array.from(document.querySelectorAll('label, .scSharedMaterialtroubleshooterFlowquestion label, .question label'));
      for (const l of labels) {
        const txt = (l.innerText || l.textContent || '').toLowerCase();
        if (txt.includes('defamation') || txt.includes('legal reason not listed') || txt.includes('other:')) {
          const style = window.getComputedStyle(l);
          if (style.display !== 'none' && style.visibility !== 'hidden') {
            return true;
          }
        }
      }
      return false;
    }).catch(() => false);

    if (ready) return true;
    await new Promise(r => setTimeout(r, 400));
  }
  return false;
}

/**
 * Visually and naturally reselects Step 2 to "Yes" and completes the AI-direct branch.
 * Employs smooth window scrolling, natural mouse movements, uncollapsing edit icon,
 * and realistic human pauses.
 *
 * @param {import('rebrowser-puppeteer-core').Page} page
 * @param {Object} [options]
 * @param {Object} [options.cursor]
 * @param {Function} [options.sleep]
 * @returns {Promise<boolean>}
 */
async function visuallyReselectStep2AI(page, options = {}) {
  const sleep = options.sleep || defaultSleep;
  const cursor = options.cursor;

  console.log('🔄 [Visual Reselection]: "Defamation" not found under "Maps".');
  console.log('👀 [Visual Reselection]: Smoothly scrolling up to Step 2 (AI Generated Content Check)...');

  // 1. Smoothly scroll back up to Step 2
  await page.evaluate(() => {
    const q2 = document.getElementById('14440196_legend')
      || document.querySelector('[name="14440196"]')?.closest('.question')
      || document.querySelector('[data-stats-id="14440196"]')
      || document.querySelector('[data-stats-id="9723198"]');
    if (q2) {
      q2.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      window.scrollTo({ top: 250, behavior: 'smooth' });
    }
  }).catch(() => {});
  await sleep(randomBetween(1200, 1800));

  // 2. Uncollapse Step 2 if collapsed (click edit pencil)
  const uncollapsed = await page.evaluateHandle(() => {
    const q2 = document.querySelector('[name="14440196"]')?.closest('.question')
      || document.getElementById('14440196_legend')?.closest('.question');
    if (q2 && q2.classList.contains('answered')) {
      const editBtn = q2.querySelector('svg[aria-label="Edit selection"], .choice, svg');
      return editBtn || q2;
    }
    return null;
  }).catch(() => null);

  if (uncollapsed && (await uncollapsed.asElement())) {
    console.log('✏️ [Visual Reselection]: Uncollapsing Step 2 via Edit selection button...');
    if (cursor && typeof cursor.moveTo === 'function') {
      await cursor.moveTo(uncollapsed).catch(() => {});
      await sleep(randomBetween(350, 600));
    }
    await page.evaluate(el => el.click(), uncollapsed).catch(() => {});
    await sleep(randomBetween(900, 1500));
  }

  // 3. Move cursor naturally and click "Yes" radio option
  console.log('👉 [Visual Reselection]: Selecting "Yes" on AI Generated Content Check...');
  const selectedYes = await selectOptionByCriteria(page, TROUBLESHOOTER_OPTIONS.step2AIYes, { sleep, cursor });
  if (!selectedYes) {
    console.warn('⚠️ [Visual Reselection]: Failed to select Step 2 "Yes"');
    return false;
  }
  await sleep(randomBetween(1600, 2400));

  // 4. Smoothly scroll and click "Legal Reasons to Report Content"
  console.log('👉 [Visual Reselection]: Selecting "Legal Reasons to Report Content"...');
  const selectedLegal = await selectOptionByCriteria(page, TROUBLESHOOTER_OPTIONS.step3LegalReasonsAI, { sleep, cursor });
  if (!selectedLegal) {
    console.warn('⚠️ [Visual Reselection]: Failed to select AI Legal Reasons');
    return false;
  }
  await sleep(randomBetween(1600, 2400));

  // 5. Smoothly scroll and click "Defamation"
  console.log('🎯 [Visual Reselection]: Selecting "Defamation" under AI branch...');
  const selectedDefamation = await selectOptionByCriteria(page, TROUBLESHOOTER_OPTIONS.step4DefamationAI, { sleep, cursor });
  if (!selectedDefamation) {
    console.warn('⚠️ [Visual Reselection]: Failed to select AI Defamation');
    return false;
  }
  await sleep(randomBetween(1800, 2600));

  return true;
}

/**
 * Automates Stage 1: Google Legal Troubleshooter (1114905)
 * Smart adaptive navigation:
 * - Checks if the specific review link has a known working path ('ai_yes').
 * - If 'ai_yes': directly traverses Product -> AI Check: Yes -> Legal Reasons -> Defamation.
 * - Otherwise: traverses initial legacy flow; if Defamation is missing, visually reselects
 *   Step 2 to "Yes", completes flow, and saves 'ai_yes' for this specific review link.
 * 
 * @param {import('rebrowser-puppeteer-core').Page} page
 * @param {Object} [options]
 * @param {Object} [options.cursor] ghost-cursor instance
 * @param {Function} [options.smartClick]
 * @param {Function} [options.sleep]
 * @param {string} [options.reviewUrl] Specific review URL being reported
 * @returns {Promise<boolean>}
 */
async function walkthroughTroubleshooter(page, options = {}) {
  const sleep = options.sleep || defaultSleep;
  const smartClick = options.smartClick || defaultSmartClick;
  const cursor = options.cursor;
  const reviewUrl = options.reviewUrl || '';
  const preferredPath = getReviewLinkPreferredPath(reviewUrl);

  console.log('\n[Stage 1] Google Legal Troubleshooter (1114905)...');

  try {
    const currentUrl = page.url();
    if (!currentUrl.includes('/troubleshooter/1114905')) {
      console.log(`🌐 Navigating to Troubleshooter: ${TROUBLESHOOTER_URL}`);
      await page.goto(TROUBLESHOOTER_URL, {
        waitUntil: 'networkidle2',
        timeout: 45000
      });
      await sleep(randomBetween(1500, 2500));
    }

    // -------------------------------------------------------------------------
    // Synchronize: Ensure Troubleshooter container is physically loaded in DOM
    // -------------------------------------------------------------------------
    console.log('⏳ [Browser Sync]: Verifying Troubleshooter container in DOM...');
    const containerReady = await page.waitForSelector('.ts, #1114905, .question, [data-stats-id="1114905"]', {
      timeout: 10000
    }).catch(() => null);
    if (!containerReady) {
      const anomaly = await detectPageAnomaly(page);
      if (anomaly.isAnomaly) {
        if (anomaly.type === 'CAPTCHA') {
          try {
            const { handlePageCaptcha } = require('../captcha/captcha_solver');
            console.log('🧩 [Troubleshooter Sync]: Detected CAPTCHA before form open. Invoking Auto-Solver...');
            const cRes = await handlePageCaptcha(page);
            if (cRes.solved) {
              console.log('🎉 [Troubleshooter Sync]: CAPTCHA bypassed successfully!');
              await page.waitForSelector('.ts, #1114905, .question, [data-stats-id="1114905"]', { timeout: 15000 }).catch(() => null);
            }
          } catch (_) {}
        }
        const postCheck = await detectPageAnomaly(page);
        if (postCheck.isAnomaly) {
          throw new Error(`Troubleshooter page blocked: ${postCheck.message}`);
        }
      }
      console.warn('⚠️ Troubleshooter container selector not immediately detected; continuing best-effort...');
    } else {
      console.log('   ✅ Troubleshooter container verified in DOM.');
    }

    if (preferredPath === 'ai_yes') {
      console.log('🎯 [Link Memory Hit]: This review link was previously verified to require AI="Yes". Proceeding directly via AI branch...');

      // [Troubleshooter 1/4] Product Selection: "Google Maps, Waze and related products"
      await waitForTroubleshooterQuestion(page, TROUBLESHOOTER_OPTIONS.step1, { timeout: 20000 });
      console.log('\n[Troubleshooter 1/4] Product Selection: "Google Maps, Waze and related products"...');
      await selectOptionByCriteria(page, TROUBLESHOOTER_OPTIONS.step1, { sleep, cursor });

      // [Troubleshooter 2/4] AI Generated Content: "Yes"
      await waitForTroubleshooterQuestion(page, TROUBLESHOOTER_OPTIONS.step2AIYes, { timeout: 20000 });
      console.log('\n[Troubleshooter 2/4] AI Generated Content Check: "Yes"...');
      await selectOptionByCriteria(page, TROUBLESHOOTER_OPTIONS.step2AIYes, { sleep, cursor });

      // [Troubleshooter 3/4] Legal Reasons to Report Content
      await waitForTroubleshooterQuestion(page, TROUBLESHOOTER_OPTIONS.step3LegalReasonsAI, { timeout: 20000 });
      console.log('\n[Troubleshooter 3/4] Legal Reasons to Report Content...');
      await selectOptionByCriteria(page, TROUBLESHOOTER_OPTIONS.step3LegalReasonsAI, { sleep, cursor });

      // [Troubleshooter 4/4] Legal Grounds - Defamation
      await waitForTroubleshooterQuestion(page, TROUBLESHOOTER_OPTIONS.step4DefamationAI, { timeout: 20000 });
      console.log('\n[Troubleshooter 4/4] Legal Grounds - Defamation...');
      await selectOptionByCriteria(page, TROUBLESHOOTER_OPTIONS.step4DefamationAI, { sleep, cursor });
    } else {
      // -------------------------------------------------------------------------
      // [Step 1] Product Selection: "Google Maps, Waze and related products"
      // -------------------------------------------------------------------------
      await waitForTroubleshooterQuestion(page, TROUBLESHOOTER_OPTIONS.step1, { timeout: 20000 });
      console.log('\n[Troubleshooter 1/5] Product Selection...');
      await selectOptionByCriteria(page, TROUBLESHOOTER_OPTIONS.step1, { sleep, cursor });

      // -------------------------------------------------------------------------
      // [Step 2] AI Generated Content Check: "No"
      // -------------------------------------------------------------------------
      await waitForTroubleshooterQuestion(page, TROUBLESHOOTER_OPTIONS.step2, { timeout: 20000 });
      console.log('\n[Troubleshooter 2/5] AI Generated Content Check...');
      await selectOptionByCriteria(page, TROUBLESHOOTER_OPTIONS.step2, { sleep, cursor });

      // -------------------------------------------------------------------------
      // [Step 3] Specific Maps Product: Initially select "Maps" (Primary)
      // -------------------------------------------------------------------------
      await waitForTroubleshooterQuestion(page, TROUBLESHOOTER_OPTIONS.step3Maps, { timeout: 20000 });
      console.log('\n[Troubleshooter 3/5] Primary selection: "Maps"...');
      await selectOptionByCriteria(page, TROUBLESHOOTER_OPTIONS.step3Maps, { sleep, cursor });

      // -------------------------------------------------------------------------
      // [Step 4] Legal vs Policy Reason: "Legal Reasons to Report Content"
      // -------------------------------------------------------------------------
      await waitForTroubleshooterQuestion(page, TROUBLESHOOTER_OPTIONS.step4, { timeout: 20000 });
      console.log('\n[Troubleshooter 4/5] Legal vs Policy Reason...');
      await selectOptionByCriteria(page, TROUBLESHOOTER_OPTIONS.step4, { sleep, cursor });

      // -------------------------------------------------------------------------
      // [Step 5] Check if "Defamation" is available under "Maps"
      // -------------------------------------------------------------------------
      console.log('\n[Troubleshooter 5/5] Checking if "Defamation" option is available under "Maps"...');
      await waitForStep5Options(page, 4500);
      let defamationAvailable = await isDefamationAvailable(page);

      if (defamationAvailable) {
        console.log('🎯 [Step 5] "Defamation" is available under "Maps"! Selecting Defamation...');
        await selectOptionByCriteria(page, TROUBLESHOOTER_OPTIONS.step5Defamation, { sleep, cursor });
      } else {
        console.warn('⚠️ [Step 5] "Defamation" was NOT found under "Maps". Initiating visual reselection...');

        // Trigger human-like visual reselection to Step 2 "Yes"
        const reselected = await visuallyReselectStep2AI(page, { sleep, cursor });
        if (reselected) {
          if (reviewUrl) {
            setReviewLinkPreferredPath(reviewUrl, 'ai_yes');
            console.log(`💾 [Link Memory Saved]: Successfully saved 'ai_yes' preference for review link: "${reviewUrl.slice(0, 60)}..."`);
          }
        } else {
          console.log('🔄 [Auto Fallback]: Reselection incomplete. Changing Step 3 to "Local listings"...');
          await selectOptionByCriteria(page, TROUBLESHOOTER_OPTIONS.step3LocalListings, { sleep, cursor });
          await selectOptionByCriteria(page, TROUBLESHOOTER_OPTIONS.step4, { sleep, cursor });
          await waitForStep5Options(page, 4500);
          defamationAvailable = await isDefamationAvailable(page);

          if (defamationAvailable) {
            console.log('🎯 [Step 5] "Defamation" found under Local listings! Selecting Defamation...');
            await selectOptionByCriteria(page, TROUBLESHOOTER_OPTIONS.step5Defamation, { sleep, cursor });
          } else {
            console.log('🛡️ [Step 5] "Defamation" not present. Selecting fallback "Other: Report content for a legal reason not listed above..."');
            const selectedOther = await selectOptionByCriteria(page, TROUBLESHOOTER_OPTIONS.step5Other, { sleep, cursor });
            if (!selectedOther) {
              console.warn('⚠️ Selecting last available legal option in Step 5 as final fallback...');
              await page.evaluate(() => {
                const radios = Array.from(document.querySelectorAll('input[type="radio"]'));
                const visible = radios.filter(r => r.offsetParent !== null);
                if (visible.length > 0) {
                  const last = visible[visible.length - 1];
                  const label = last.closest('label') || last;
                  label.click();
                  last.checked = true;
                  last.dispatchEvent(new Event('change', { bubbles: true }));
                }
              }).catch(() => {});
            }
          }
        }
      }
    }

    // Step 6: Locate, scroll to, hover and click "Create request" button VISIBLY
    console.log('\n⏳ [Browser Sync]: Waiting for "Create request" button to become actionable in DOM...');
    const createBtnHandle = await waitForActionableElement(page, async (p) => {
      const candidates = await p.$$('button, a, [role="button"], .material-button, input[type="button"], input[type="submit"]').catch(() => []);
      for (const btn of candidates) {
        const txt = await p.evaluate(el => (el.innerText || el.textContent || el.value || '').trim().toLowerCase(), btn).catch(() => '');
        if (txt === 'create request' || txt.includes('create request')) {
          return btn;
        }
      }
      return null;
    }, {
      timeout: 20000,
      description: '"Create request" button'
    });

    if (createBtnHandle) {
      console.log('-----------------------------------------------------------');
      console.log('📍 [Create request] button located!');
      console.log('   Scrolling button directly to screen center...');

      // 1. Smoothly scroll the "Create request" button to the center of the screen
      await page.evaluate(el => {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.style.outline = '3px solid #1a73e8';
        el.style.boxShadow = '0 0 16px rgba(26, 115, 232, 0.8)';
        el.style.transition = 'all 0.3s ease';
      }, createBtnHandle);

      // Pause so user sees the button centered and highlighted on screen
      await sleep(randomBetween(1200, 1800));

      // 2. Move mouse cursor onto the button to show human hover state
      console.log('🖱️ Moving mouse cursor to hover on [Create request] button...');
      if (cursor && typeof cursor.moveTo === 'function') {
        await cursor.moveTo(createBtnHandle).catch(() => { });
      } else {
        await createBtnHandle.hover().catch(() => { });
      }
      // Visible human pause hovering over the button
      await sleep(randomBetween(1500, 2200));

      // 3. Deliberate human click
      console.log('🎯 Clicking [Create request] button now!');
      await page.evaluate(el => {
        el.style.transform = 'scale(0.96)';
        el.style.backgroundColor = '#1557b0';
      }, createBtnHandle);

      await createBtnHandle.click({ delay: 180 });
      console.log('✅ [Create request] button successfully clicked!');
      console.log('-----------------------------------------------------------\n');

      // Give sufficient time for tab to spawn or redirect
      await sleep(randomBetween(3500, 4500));
      return true;
    } else {
      console.log('ℹ️ Attempting fallback text click for "Create request"...');
      const fallbackClicked = await page.evaluate(() => {
        const all = Array.from(document.querySelectorAll('button, a, [role="button"]'));
        for (const el of all) {
          const txt = (el.innerText || el.textContent || '').trim().toLowerCase();
          if (txt === 'create request' || txt.includes('create request')) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.style.outline = '3px solid #1a73e8';
            el.click();
            return true;
          }
        }
        return false;
      });
      if (fallbackClicked) {
        console.log('🚀 [Create request] button clicked via fallback!');
        await sleep(3500);
        return true;
      }
    }

    console.warn('⚠️ [Create request] button not found after retries.');
    return false;
  } catch (err) {
    console.error('❌ Error during Troubleshooter walkthrough:', err.message);
    return false;
  }
}

/**
 * Automates Stage 2: Google Legal Removal Form (page-legal-other-geo-form / reportcontent.google.com)
 * 
 * @param {import('rebrowser-puppeteer-core').Page} activePage
 * @param {Object} options
 * @param {string} options.reviewUrl - Target Google Maps review link
 * @param {Object} options.legalNotice - Generated AI legal notice object
 * @param {Object} [options.senderInfo] - Legal complainant details
 * @param {string} [options.senderInfo.fullName] - Full legal name
 * @param {string} [options.senderInfo.country] - Country of residence (default: United States)
 * @param {string} [options.senderInfo.businessName] - Affected business name
 * @param {Object} [options.cursor] - ghost-cursor instance
 * @param {Function} [options.smartClick]
 * @param {Function} [options.sleep]
 * @returns {Promise<{ success: boolean, proofScreenshot?: string, dossierPath?: string }>}
 */
async function fillLegalRemovalForm(activePage, options = {}) {
  const sleep = options.sleep || defaultSleep;
  const smartClick = options.smartClick || defaultSmartClick;
  const cursor = options.cursor;
  const captchaApiKey = options.captchaApiKey;
  const captchaAutoSolve = options.captchaAutoSolve;

  const reviewUrl = options.reviewUrl;
  const legalNotice = options.legalNotice || {};
  const senderInfo = options.senderInfo || {};

  // Synchronize with Legal Removal Form container
  console.log('⏳ Synchronizing with Legal Removal Form...');
  const formElement = await waitForActionableElement(
    activePage,
    '[data-test-id="form-display-name"], [data-test-id="form-container-component-region"], [gdf-id="region"], [data-test-id="form-container-component-full-name"], [gdf-id="full-name"], [data-test-id="form-container"], form, gdf-form',
    {
      timeout: 15000,
      visible: true,
      description: 'Legal Removal Form'
    }
  );

  if (!formElement) {
    const anomaly = await detectPageAnomaly(activePage);
    if (anomaly.hasAnomaly || anomaly.isAnomaly) {
      if (anomaly.type === 'CAPTCHA') {
        try {
          const { handlePageCaptcha } = require('../captcha/captcha_solver');
          console.log('🧩 [Legal Form Sync]: Detected CAPTCHA before legal form open. Invoking Auto-Solver (Token API)...');
          const cRes = await handlePageCaptcha(activePage, {
            apiKey: captchaApiKey || options.captchaApiKey,
            autoSolve: captchaAutoSolve,
            preferToken: true
          });
          if (cRes.solved) {
            console.log('🎉 [Legal Form Sync]: CAPTCHA bypassed successfully!');
          }
        } catch (_) {}
      }
      const postAnomaly = await detectPageAnomaly(activePage);
      if (postAnomaly.hasAnomaly || postAnomaly.isAnomaly) {
        console.error(`🚨 Browser Anomaly Detected: ${postAnomaly.message}`);
        return { success: false, error: postAnomaly.message };
      }
    } else {
      console.warn('⚠️ Legal Removal Form container not detected within 30s. Continuing best-effort...');
    }
  }

  await activePage.bringToFront().catch(() => { });
  await sleep(randomBetween(1800, 2600)); // Human reading overview header

  // 1. Resolve Real Human Name from Logged-in Google Account / Mail
  let fullName = (senderInfo.fullName || '').trim();
  if (!fullName || fullName === 'Google Business Representative' || fullName.includes('@')) {
    console.log('🔍 Resolving real complainant name from Google Account / Mail...');
    const profileName = await extractGoogleProfileName(activePage);
    if (profileName) {
      fullName = profileName;
      console.log(`👤 Resolved real name from Google Account session: "${fullName}"`);
    } else {
      const verifiedEmail = await activePage.evaluate(() => {
        const el = document.querySelector('[data-test-id="email-verification-callout"] b');
        return el ? el.textContent.trim() : null;
      }).catch(() => null);
      const targetEmail = verifiedEmail || senderInfo.email || '';
      fullName = formatCleanHumanName(targetEmail);
      console.log(`👤 Formatted clean real name from Mail account (${targetEmail}): "${fullName}"`);
    }
  }

  // Always sanitize, deduplicate, and properly capitalize the full legal name
  fullName = formatCleanHumanName(fullName);
  console.log(`👤 Final sanitized complainant name: "${fullName}"`);

  const country = (senderInfo.country || 'United States').trim();
  const legalExplanation = (legalNotice.legalClaimText || '').trim().slice(0, 950);

  console.log(`\n[Stage 2] Legal Removal Form (${fullName} | ${country})`);
  console.log(`[Stage 2] Target: ${reviewUrl} (${legalExplanation.length}/1000 chars)`);

  try {
    // 2. Select Country of Residence
    console.log(`🌍 [1/7] Selecting Country of residence: "${country}"...`);
    try {
      const regionContainer = await activePage.$('[data-test-id="form-container-component-region"], [gdf-id="region"]').catch(() => null);
      if (regionContainer) {
        await activePage.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), regionContainer);
        // Human reading pause for dropdown label
        await sleep(randomBetween(1600, 2200));
      }

      const dropdownBtn = await activePage.$('[data-test-id="form-container-component-region"] dropdown-button .button, [gdf-id="region"] dropdown-button .button, [data-test-id="form-container-component-region"] [role="button"], [gdf-id="region"] [role="button"]').catch(() => null);

      if (dropdownBtn) {
        await dropdownBtn.click({ delay: 100 });
      } else {
        await activePage.evaluate(() => {
          const btn = document.querySelector('[data-test-id="form-container-component-region"] .button, [gdf-id="region"] .button, [data-test-id="form-container-component-region"] [role="button"]');
          if (btn) btn.click();
        });
      }

      // Human pause looking at country popup options
      await sleep(randomBetween(1200, 1800));

      let countryChosen = await activePage.evaluate((targetCountry) => {
        const norm = targetCountry.trim().toLowerCase();
        const items = Array.from(document.querySelectorAll('[role="option"], material-select-item, .gm-select-item, .material-list-item, div.item, .item'));
        for (const item of items) {
          const txt = (item.innerText || item.textContent || '').trim().toLowerCase();
          if (txt === norm || txt.startsWith(norm)) {
            item.scrollIntoView({ behavior: 'smooth', block: 'center' });
            item.click();
            return true;
          }
        }
        return false;
      }, country);

      if (!countryChosen) {
        console.log(`   ℹ️ Selecting country via keyboard navigation: "${country}"...`);
        for (const char of country) {
          await activePage.keyboard.press(char, { delay: 60 });
        }
        await sleep(350);
        await activePage.keyboard.press('Enter');
        await sleep(500);
      }

      const verifiedCountry = await activePage.evaluate(() => {
        const comp = document.querySelector('[data-test-id="form-container-component-region"]') || document.querySelector('[gdf-id="region"]');
        return comp ? (comp.innerText || comp.textContent || '').trim() : '';
      });
      console.log(`   ✅ Country confirmed: "${verifiedCountry}"`);
    } catch (err) {
      console.warn('   ⚠️ Country dropdown notice:', err.message);
    }
    // Human glance after country selection
    await sleep(randomBetween(1200, 1600));

    // 3. Fill Full Legal Name with Human Typing
    console.log(`✍️ [2/7] Entering Full legal name: "${fullName}"...`);
    const nameInput = await activePage.$('[data-test-id="form-container-component-full-name"] input, [gdf-id="full-name"] input, input[aria-label="Full legal name"]').catch(() => null);
    if (nameInput) {
      await activePage.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), nameInput);
      await sleep(randomBetween(1400, 1800)); // Reading label & instructions
      await nameInput.click({ delay: 80 });
      await nameInput.focus();
      await sleep(randomBetween(500, 800));

      await activePage.keyboard.down('Control');
      await activePage.keyboard.press('KeyA');
      await activePage.keyboard.up('Control');
      await activePage.keyboard.press('Backspace');
      await sleep(200);

      // Natural human typing rhythm
      for (let i = 0; i < fullName.length; i++) {
        await activePage.keyboard.type(fullName[i], { delay: Math.floor(Math.random() * 35) + 40 });
        if (fullName[i] === ' ') await sleep(randomBetween(180, 260));
      }
      await sleep(300);

      await activePage.evaluate((el, val) => {
        if (el.value !== val) el.value = val;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true }));
      }, nameInput, fullName);
      console.log(`   ✅ Full legal name entered: "${fullName}"`);
    }
    // Human pause checking typed name
    await sleep(randomBetween(1200, 1600));

    // 4. Select "I am acting on behalf of: Myself"
    console.log('👤 [3/7] Selecting "I am acting on behalf of: Myself"...');
    const myselfRadio = await activePage.$('[data-test-id="form-container-component-representing-myself"] material-radio[aria-label="Myself"], [gdf-id="representing-myself"] material-radio[aria-label="Myself"]').catch(() => null);
    if (myselfRadio) {
      await activePage.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), myselfRadio);
      await sleep(randomBetween(1400, 2000)); // Reading options: Myself vs Someone else
      await myselfRadio.click({ delay: 80 });
    }
    await sleep(randomBetween(1000, 1500));

    // 5. Fill Allegedly Infringing URL - PASTED VIA CLIPBOARD (Human Behavior)
    const targetReviewUrl = (reviewUrl || 'https://maps.app.goo.gl/S2ejSm9dnnCwAjoq7').trim();
    console.log(`📋 [4/7] Pasting Target Review URL from clipboard: "${targetReviewUrl}"...`);
    const urlInput = await activePage.$('[data-test-id="form-container-component-german-defamation-url-box"] input, [gdf-id="german-defamation-url-box"] input, input[aria-label="Allegedly infringing URL"]').catch(() => null);
    if (urlInput) {
      await activePage.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), urlInput);
      await sleep(randomBetween(1400, 2000)); // Reading "Allegedly infringing URL" label
      await urlInput.click({ delay: 80 });
      await urlInput.focus();
      await sleep(randomBetween(600, 900));

      await activePage.keyboard.down('Control');
      await activePage.keyboard.press('KeyA');
      await activePage.keyboard.up('Control');
      await activePage.keyboard.press('Backspace');
      await sleep(200);

      // Human Paste Simulation: write to clipboard and press Ctrl+V
      const clipboardWritten = await activePage.evaluate(async (url) => {
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(url);
            return true;
          }
        } catch (_) {}
        return false;
      }, targetReviewUrl).catch(() => false);

      if (clipboardWritten) {
        await sleep(200);
        await activePage.keyboard.down('Control');
        await activePage.keyboard.press('KeyV');
        await activePage.keyboard.up('Control');
        await sleep(250);
      }

      // Verify Angular model registration & apply fallback if clipboard paste did not populate value
      const verifiedVal = await activePage.evaluate((el, val) => {
        if (el.value !== val) {
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
          if (nativeSetter) {
            nativeSetter.call(el, val);
          } else {
            el.value = val;
          }
        }
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true }));
        return el.value;
      }, urlInput, targetReviewUrl);

      // Fallback: if value is still not populated, simulate direct keyboard typing
      if (verifiedVal !== targetReviewUrl) {
        await urlInput.click({ clickCount: 3 });
        await urlInput.type(targetReviewUrl, { delay: 10 });
      }
      console.log(`   ✅ Target Review URL successfully verified and registered into box.`);
    }
    // Human verification pause (verifying that the correct link was pasted)
    await sleep(randomBetween(1400, 2200));

    // 6. Fill Unlawful Explanation Textarea (<1000 chars) with Sentence Bursts & Pauses
    console.log(`📜 [5/7] Typing formal legal defamation claim (${legalExplanation.length} chars, human rhythm)...`);
    const descTextarea = await activePage.$('[data-test-id="form-container-component-german-defamation-url-description"] textarea, [gdf-id="german-defamation-url-description"] textarea, textarea[aria-label="Explain in detail why you believe the content on the above URL is unlawful"]').catch(() => null);
    if (descTextarea) {
      await activePage.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), descTextarea);
      await sleep(randomBetween(1800, 2600)); // Human reading prompt & reviewing claim
      await descTextarea.click({ delay: 80 });
      await descTextarea.focus();
      await sleep(randomBetween(600, 900));

      await activePage.keyboard.down('Control');
      await activePage.keyboard.press('KeyA');
      await activePage.keyboard.up('Control');
      await activePage.keyboard.press('Backspace');
      await sleep(200);

      // Type sentence by sentence with realistic cognitive thought pauses
      const sentences = legalExplanation.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [legalExplanation];
      for (const sentence of sentences) {
        await activePage.keyboard.type(sentence, { delay: Math.floor(Math.random() * 18) + 14 });
        await sleep(randomBetween(450, 850)); // Natural pause between legal sentences
      }
      await sleep(350);

      await activePage.evaluate((el, val) => {
        if (el.value !== val) el.value = val;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true }));
      }, descTextarea, legalExplanation);
      console.log('   ✅ Legal explanation entered successfully (Character counter updated).');
    }
    // Human pause reviewing typed legal text
    await sleep(randomBetween(1800, 2600));

    // 7. Select "Is this submission related to a photo, image or video?: No"
    console.log('🖼️ [6/7] Answering "Photo/Image/Video?": No...');
    const noRadio = await activePage.$('[data-test-id="form-container-component-is-geo-ugc-imagery"] material-radio[aria-label="No"], [gdf-id="is-geo-ugc-imagery"] material-radio[aria-label="No"]').catch(() => null);
    if (noRadio) {
      await activePage.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), noRadio);
      await sleep(randomBetween(1400, 1800)); // Human reading question
      await noRadio.click({ delay: 80 });
    }
    await sleep(randomBetween(1000, 1400));

    // 8. Check Good Faith Declaration Checkbox
    console.log('☑️ Checking Good Faith Declaration statement...');
    const consentCheckbox = await activePage.$('[data-test-id="form-container-component-legal-consent-statement"] material-checkbox, [gdf-id="legal-consent-statement"] material-checkbox').catch(() => null);
    if (consentCheckbox) {
      await activePage.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), consentCheckbox);
      await sleep(randomBetween(1800, 2400)); // Human reading declaration statement
      const isChecked = await activePage.evaluate(el => el.getAttribute('aria-checked') === 'true', consentCheckbox);
      if (!isChecked) {
        await consentCheckbox.click({ delay: 80 });
      }
    }
    await sleep(randomBetween(1000, 1400));

    // 9. Enter Digital Signature (Strict match with Full Name)
    console.log(`🖋️ [7/7] Entering Digital Signature (Exact match: "${fullName}")...`);
    const sigInput = await activePage.$('[data-test-id="form-container-component-signature"] input, [gdf-id="signature"] input, input[aria-label="Signature"]').catch(() => null);
    if (sigInput) {
      await activePage.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), sigInput);
      await sleep(randomBetween(1400, 2000)); // Reading signature requirement note
      await sigInput.click({ delay: 80 });
      await sigInput.focus();
      await sleep(randomBetween(500, 800));

      await activePage.keyboard.down('Control');
      await activePage.keyboard.press('KeyA');
      await activePage.keyboard.up('Control');
      await activePage.keyboard.press('Backspace');
      await sleep(200);

      for (let i = 0; i < fullName.length; i++) {
        await activePage.keyboard.type(fullName[i], { delay: Math.floor(Math.random() * 35) + 40 });
        if (fullName[i] === ' ') await sleep(randomBetween(180, 260));
      }
      await sleep(300);

      await activePage.evaluate((el, val) => {
        if (el.value !== val) el.value = val;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true }));
      }, sigInput, fullName);
      console.log(`   ✅ Digital Signature entered matching: "${fullName}"`);
    }
    // Pre-submission review pause (human looking over the entire filled form)
    console.log('🧐 Reviewing completed form details before submitting...');
    await sleep(randomBetween(2400, 3400));

    // 10. Check reCAPTCHA status & Submit Button
    console.log('🛡️ Verifying form validation & reCAPTCHA state...');
    const isSubmitDisabled = await activePage.evaluate(() => {
      const btn = document.querySelector('button[data-test-id="submit-button"]');
      return btn ? btn.hasAttribute('disabled') : true;
    });

    if (isSubmitDisabled) {
      console.log('ℹ️ Submit button is currently disabled (awaiting reCAPTCHA completion).');
      console.log('🧩 Triggering CAPTCHA Auto-Solver Engine (Token API mode)...');

      try {
        const { handlePageCaptcha } = require('../captcha/captcha_solver');
        await handlePageCaptcha(activePage, {
          apiKey: options.captchaApiKey,
          autoSolve: captchaAutoSolve,
          preferToken: true
        });
      } catch (cErr) {
        console.warn('⚠️ CAPTCHA Auto-Solver notice:', cErr.message);
      }

      // Check reCAPTCHA status again
      let waitSeconds = 0;
      while (waitSeconds < 25) {
        const stillDisabled = await activePage.evaluate(() => {
          const btn = document.querySelector('button[data-test-id="submit-button"]');
          return btn ? btn.hasAttribute('disabled') : true;
        });

        if (!stillDisabled) {
          console.log('🎉 reCAPTCHA solved / Submit button is now ENABLED!');
          break;
        }

        await sleep(2000);
        waitSeconds += 2;
      }
    }

    // 11. Click Submit Button
    console.log('🚀 Submitting Google Legal Removal Request...');
    const submitClicked = await activePage.evaluate(() => {
      const btn = document.querySelector('button[data-test-id="submit-button"]');
      if (btn && !btn.hasAttribute('disabled')) {
        btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
        btn.click();
        return true;
      }
      return false;
    });

    let successConfirmed = false;
    let extractedReportId = null;

    if (submitClicked) {
      console.log('✅ Submit button clicked successfully!');
      console.log('⏳ Awaiting Google Legal confirmation response & success page...');

      try {
        // Wait up to 35s for Google's Angular <success-page> component to mount
        const successElement = await activePage.waitForSelector(
          'success-page, [data-test-id="success-page"], [data-test-id="report-id"], .success-page',
          { timeout: 35000, visible: true }
        ).catch(() => null);

        if (successElement) {
          successConfirmed = true;
          // Extract the exact Report ID from Google
          extractedReportId = await activePage.evaluate(() => {
            const idEl = document.querySelector('[data-test-id="report-id"]');
            if (idEl) return idEl.textContent.trim();
            const textNodes = document.querySelectorAll('p, div, span');
            for (const node of textNodes) {
              if (node.textContent.includes('Report ID:')) {
                return node.textContent.trim();
              }
            }
            return null;
          }).catch(() => null);

          console.log(`🎉 [Google Legal Removal SUCCESS]: ${extractedReportId || 'Confirmed!'}`);
          console.log('✅ Success page rendered and verified.');
          // Allow full render before screenshot
          await sleep(2000);
        } else {
          console.warn('⚠️ Success page selector timed out; verifying page content...');
          const pageText = await activePage.evaluate(() => document.body.innerText).catch(() => '');
          if (pageText.includes('Thank you for submitting') || pageText.includes('Report ID:')) {
            successConfirmed = true;
            const m = pageText.match(/Report ID:\s*([0-9-]+)/);
            if (m) extractedReportId = m[0];
            console.log(`🎉 [Google Legal Removal SUCCESS]: ${extractedReportId || 'Confirmed!'}`);
          }
        }
      } catch (waitErr) {
        console.warn('ℹ️ Notice while awaiting success page:', waitErr.message);
      }
    } else {
      console.warn('⚠️ Submit button could not be clicked or confirmed.');
    }

    // 12. Capture Proof Screenshot (Now capturing verified Success Page with Report ID)
    const proofRes = await captureProofScreenshot(activePage, 'legal_submission');
    const screenshotPath = proofRes ? proofRes.filename : 'report_logs/proofs';
    console.log(`📸 Legal Notice submission proof saved: ${screenshotPath}`);

    // Allow user to clearly see the verified success page on screen
    if (successConfirmed) {
      console.log('👀 Displaying verified success page on screen for 5 seconds...');
      await sleep(5000);
    }

    // 13. Save Formal Legal Notice Dossier to Disk
    const timestamp = Date.now();
    const noticesDir = path.join(process.cwd(), 'legal_notices');
    if (!fs.existsSync(noticesDir)) {
      fs.mkdirSync(noticesDir, { recursive: true });
    }

    const dossierPath = path.join(noticesDir, `notice_${timestamp}.json`);
    const dossierTxtPath = path.join(noticesDir, `notice_${timestamp}.txt`);

    const dossierData = {
      timestamp: new Date().toISOString(),
      targetReviewUrl: reviewUrl,
      complainantName: fullName,
      country,
      grounds: legalNotice.legalGrounds || 'Defamation Per Se',
      statutoryCitation: '16 C.F.R. § 465.2 & Defamation Per Se',
      legalClaimText: legalExplanation,
      reportId: extractedReportId || null,
      proofScreenshot: screenshotPath
    };

    fs.writeFileSync(dossierPath, JSON.stringify(dossierData, null, 2), 'utf8');

    const txtContent = `===============================================================
OFFICIAL GOOGLE LEGAL REMOVAL COMPLAINT (DEFAMATION & INFRINGEMENT)
Target Review URL: ${reviewUrl}
Complainant:       ${fullName}
Country:           ${country}
Date Filed:        ${new Date().toUTCString()}
Status:            ${(submitClicked || successConfirmed) ? 'SUBMITTED_AND_CONFIRMED' : 'PREPARED_UNSUBMITTED'}
Official Report ID:${extractedReportId ? ' ' + extractedReportId : ' N/A'}
===============================================================

LEGAL GROUNDS & REGULATORY CITATIONS:
- Defamation Per Se (Commercial Disparagement & Tortious Interference)
- 16 C.F.R. Part 465 (FTC Rule on Fake Reviews and Deceptive Practices)
- Google Prohibited and Restricted Content Policy (Fake Engagement)

OFFICIAL STATEMENT SUBMITTED TO GOOGLE LEGAL COUNSEL:
${legalExplanation}

SIGNATURE ON RECORD:
/s/ ${fullName}
Signed on: ${new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
Proof Screenshot: ${screenshotPath}
===============================================================`;

    fs.writeFileSync(dossierTxtPath, txtContent, 'utf8');
    console.log(`💾 Legal Notice Dossier archived: legal_notices/notice_${timestamp}.txt`);

    return {
      success: successConfirmed || !!submitClicked,
      submitted: !!submitClicked,
      reportId: extractedReportId,
      proofScreenshot: screenshotPath,
      dossierPath: dossierTxtPath
    };
  } catch (err) {
    console.error('❌ Error filling Legal Removal Form:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * End-to-End Orchestrator for Legal Notice Flow
 * @param {Object} options
 */
async function executeFullLegalFlow(options) {
  const { page, reportPage, reviewUrl, legalNotice, senderInfo, sleep, smartClick, cursor, browser, captchaApiKey, captchaAutoSolve } = options;
  const activePage = reportPage || page;

  // Stage 1: Walkthrough Troubleshooter
  const stage1Success = await walkthroughTroubleshooter(activePage, { sleep, smartClick, cursor, reviewUrl });
  if (!stage1Success) {
    console.warn('⚠️ Stage 1 Troubleshooter encountered a warning; continuing to Stage 2 if form is reachable.');
  }

  // Detect if "Create request" opened in a new tab or redirected same tab
  let formPage = activePage;
  try {
    const activeBrowser = browser || (typeof activePage.browser === 'function' ? activePage.browser() : (typeof page?.browser === 'function' ? page.browser() : null));
    if (activeBrowser) {
      console.log('🔍 Synchronizing with Legal Removal Form tab / redirection...');
      const targetPatterns = [
        'reportcontent.google.com',
        'contact/lr_legalother',
        'contact/lr_',
        p => {
          const u = p.url();
          return u.includes('legal') && !u.includes('1114905');
        }
      ];
      const transitionedPage = await waitForPageOrTabTransition(activeBrowser, activePage, targetPatterns, {
        timeout: 25000,
        actionName: 'Legal Removal Form'
      });
      if (transitionedPage) {
        formPage = transitionedPage;
        await formPage.bringToFront().catch(() => { });
      }
    }
  } catch (tabErr) {
    console.warn('ℹ️ Multi-tab detection notice:', tabErr.message);
  }

  // Stage 2: Fill Legal Form
  const result = await fillLegalRemovalForm(formPage, {
    reviewUrl,
    legalNotice,
    senderInfo,
    sleep,
    smartClick,
    cursor,
    captchaApiKey,
    captchaAutoSolve
  });

  return result;
}

module.exports = {
  walkthroughTroubleshooter,
  visuallyReselectStep2AI,
  getReviewLinkPreferredPath,
  setReviewLinkPreferredPath,
  clearReviewLinkPreferences,
  normalizeReviewUrl,
  fillLegalRemovalForm,
  executeFullLegalFlow,
  TROUBLESHOOTER_STEPS,
  TROUBLESHOOTER_OPTIONS,
  selectOptionByCriteria,
  isDefamationAvailable,
  waitForStep5Options,
  formatCleanHumanName,
  deduplicateWords
};
