/**
 * modules/auth/google_auth.js
 * Google Account Authentication & Multi-Step 2FA Challenge Solver
 * Features:
 * - Natural browsing navigation (Google Search, Homepage, Direct)
 * - Anti-bot & human-like typing and delays
 * - Smart page status detection (Email, Password, CAPTCHA, Challenge, Backup codes)
 * - Automated 2FA bypass: clicks "Try another way", selects "Enter 8-digit backup code", fills and submits
 */

const { createCursor } = require('ghost-cursor');
const {
  sleep,
  gaussianRandom,
  randomBetween,
  humanScroll,
  humanWanderMouse,
  humanType
} = require('../helpers/biometrics');
const { applyDeepStealth, attachDialogAutoHandler } = require('../helpers/stealth');
const {
  smartClick: domSmartClick,
  clickElementByText,
  clickGoogleNext,
  handleConsentIfPresent
} = require('../helpers/dom_utils');
const { captureErrorScreenshot } = require('../helpers/screenshot_paths');
const {
  generateTOTP,
  isValidSecret,
  getRemainingSeconds
} = require('./totp');

/**
 * Checks whether current screen is the actual 8-digit backup code screen
 */
async function isActualBackupCodePage(page) {
  try {
    const url = page.url();
    if (url.includes('/challenge/selection') || url.includes('/selection')) {
      return false;
    }

    const hasInput = await page.evaluate(() => {
      const direct = document.querySelector('input#backupCodePin, input[name="backupCode"], input[autocomplete="one-time-code"]');
      if (direct) return true;

      const anyInput = document.querySelector('input[type="tel"], input[type="text"]');
      if (!anyInput) return false;

      const text = (document.body.innerText || '').toLowerCase();
      const mentionsBackup = (text.includes('backup') || text.includes('8-digit')) &&
                             (text.includes('code') || text.includes('digit'));
      const notSc = !text.includes('g.co/sc') && !text.includes('get your security code');

      return mentionsBackup && notSc;
    }).catch(() => false);

    return hasInput;
  } catch (e) {
    return false;
  }
}

/**
 * Checks whether current screen is the Google Authenticator 6-digit TOTP input screen
 */
async function isActualTotpPage(page) {
  try {
    const url = page.url();
    if (url.includes('/challenge/selection') || url.includes('/selection')) {
      return false;
    }

    const hasTotpInput = await page.evaluate(() => {
      const direct = document.querySelector('input#totpPin, input[name="totpPin"]');
      if (direct) return true;

      const anyInput = document.querySelector('input[type="tel"], input[type="text"], input[autocomplete="one-time-code"]');
      if (!anyInput) return false;

      const text = (document.body.innerText || '').toLowerCase();
      const mentionsTotp = text.includes('authenticator') || (text.includes('enter code') && !text.includes('8-digit'));
      const notSc = !text.includes('g.co/sc') && !text.includes('get your security code');
      const notBackup = !text.includes('8-digit') && !text.includes('backup code');

      return mentionsTotp && notSc && notBackup;
    }).catch(() => false);

    return hasTotpInput;
  } catch (e) {
    return false;
  }
}

/**
 * Clicks the "Try another way" button on Google 2FA challenge screens
 */
async function clickTryAnotherWay(page, cursor, smartClick) {
  try {
    console.log('🔍 Searching for "Try another way" button...');

    const xpathQueries = [
      "::-p-xpath(//button[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'try another')])",
      "::-p-xpath(//a[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'try another')])",
      "::-p-xpath(//div[@role='button'][contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'try another')])",
      "::-p-xpath(//span[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'try another')]/ancestor::button)",
      "::-p-xpath(//span[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'try another')]/ancestor::div[@role='button'])",
      "::-p-xpath(//button[@jsname='prxTac'])",
      "::-p-xpath(//button[@jsname='j6312c'])",
      "::-p-xpath(//button[@jsname='by0hIf'])",
      "::-p-xpath(//*[@data-secondary-action-label])"
    ];

    let targetElement = null;
    for (const xp of xpathQueries) {
      try {
        const els = await page.$$(xp);
        for (const el of els) {
          const isVis = await page.evaluate(node => {
            const rect = node.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && window.getComputedStyle(node).visibility !== 'hidden';
          }, el).catch(() => false);
          if (isVis) {
            targetElement = el;
            break;
          }
        }
        if (targetElement) break;
      } catch (e) {}
    }

    if (!targetElement) {
      const handle = await page.evaluateHandle(() => {
        const candidates = Array.from(document.querySelectorAll('button, a, [role="button"], span, [data-secondary-action-label]'));
        for (const el of candidates) {
          const t = (el.innerText || el.textContent || '').toLowerCase().trim();
          const aria = (el.getAttribute('aria-label') || '').toLowerCase();
          if (
            t.includes('try another') ||
            t.includes('another way') ||
            aria.includes('try another') ||
            aria.includes('another way')
          ) {
            return el.closest('button, a, [role="button"]') || el;
          }
        }
        return null;
      });

      if (handle && handle.asElement()) {
        targetElement = handle.asElement();
      }
    }

    if (!targetElement) {
      const selectors = [
        'button[jsname="prxTac"]',
        'button[jsname="j6312c"]',
        'button[jsname="by0hIf"]',
        '[data-secondary-action-label]',
        'a[href*="challenge/selection"]',
        'a[href*="challenge"]'
      ];
      for (const sel of selectors) {
        const el = await page.$(sel).catch(() => null);
        if (el) {
          const isVis = await page.evaluate(node => {
            const rect = node.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          }, el).catch(() => false);
          if (isVis) {
            targetElement = el;
            break;
          }
        }
      }
    }

    if (!targetElement) {
      console.log('⚠️ "Try another way" button not directly found. Capturing diagnostic screenshot to report_logs/errors/...');
      await captureErrorScreenshot(page, 'debug_try_another_way', { fullPage: false }).catch(() => {});
      return false;
    }

    console.log('🎯 "Try another way" button found! Dispatching physical CDP mouse click...');
    await targetElement.evaluate(el => el.scrollIntoView({ behavior: 'auto', block: 'center' })).catch(() => {});
    await sleep(250);

    const box = await targetElement.boundingBox();
    if (box) {
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;

      if (cursor && typeof cursor.moveTo === 'function') {
        await cursor.moveTo({ x: cx, y: cy }).catch(() => {});
      }
      await page.mouse.move(cx, cy, { steps: 5 });
      await sleep(100);
      await page.mouse.down();
      await sleep(80);
      await page.mouse.up();
      console.log(`🖱️ Physical mouse click executed at coordinates (${Math.round(cx)}, ${Math.round(cy)})!`);
    }

    await targetElement.evaluate(el => {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const eventOpts = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy };

      el.dispatchEvent(new PointerEvent('pointerdown', eventOpts));
      el.dispatchEvent(new MouseEvent('mousedown', eventOpts));
      el.focus();
      el.dispatchEvent(new PointerEvent('pointerup', eventOpts));
      el.dispatchEvent(new MouseEvent('mouseup', eventOpts));
      el.click();

      const inner = el.querySelector('button, [role="button"], a');
      if (inner && inner !== el) {
        inner.click();
      }
    }).catch(() => {});

    await targetElement.click().catch(() => {});
    if (smartClick) await smartClick(targetElement).catch(() => {});

    console.log('✅ Click on "Try another way" button completed!');
    return true;
  } catch (e) {
    console.log('⚠️ clickTryAnotherWay error:', e.message);
    return false;
  }
}

/**
 * Finds the "Enter one of your 8-digit backup codes" element handle
 */
async function getBackupCodeOptionHandle(page) {
  const xpathQueries = [
    "::-p-xpath(//li[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'backup')])",
    "::-p-xpath(//div[@data-challengetype='8'])",
    "::-p-xpath(//li[@data-challengetype='8'])",
    "::-p-xpath(//div[@role='link'][contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'backup')])",
    "::-p-xpath(//div[@role='button'][contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'backup')])",
    "::-p-xpath(//*[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '8-digit')])",
    "::-p-xpath(//*[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'backup code')])"
  ];

  for (const xp of xpathQueries) {
    try {
      const elements = await page.$$(xp);
      for (const el of elements) {
        const isVisible = await page.evaluate(node => {
          const rect = node.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && window.getComputedStyle(node).visibility !== 'hidden';
        }, el).catch(() => false);
        if (isVisible) return el;
      }
    } catch (e) {}
  }

  const handle = await page.evaluateHandle(() => {
    const candidates = Array.from(document.querySelectorAll('li, div[role="link"], div[role="button"], div[data-challengetype], [data-challengeindex]'));
    for (const el of candidates) {
      const text = (el.innerText || el.textContent || '').toLowerCase();
      if (text.includes('backup') || text.includes('8-digit')) {
        return el;
      }
    }

    const all = Array.from(document.querySelectorAll('span, div, p, h2, h3'));
    for (const el of all) {
      const text = (el.innerText || el.textContent || '').toLowerCase().trim();
      if ((text.includes('backup') || text.includes('8-digit')) && text.length < 120) {
        return el.closest('li, div[role="link"], div[role="button"], [data-challengetype]') || el;
      }
    }
    return null;
  });

  if (handle && handle.asElement()) {
    return handle.asElement();
  }

  return null;
}

/**
 * Finds the "Get a verification code from Google Authenticator" element handle
 */
async function getAuthenticatorOptionHandle(page) {
  const xpathQueries = [
    "::-p-xpath(//li[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'authenticator')])",
    "::-p-xpath(//div[@data-challengetype='6'])",
    "::-p-xpath(//li[@data-challengetype='6'])",
    "::-p-xpath(//div[@role='link'][contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'authenticator')])",
    "::-p-xpath(//div[@role='button'][contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'authenticator')])",
    "::-p-xpath(//*[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'google authenticator')])",
    "::-p-xpath(//*[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'authenticator app')])"
  ];

  for (const xp of xpathQueries) {
    try {
      const elements = await page.$$(xp);
      for (const el of elements) {
        const isVisible = await page.evaluate(node => {
          const rect = node.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && window.getComputedStyle(node).visibility !== 'hidden';
        }, el).catch(() => false);
        if (isVisible) return el;
      }
    } catch (e) {}
  }

  const handle = await page.evaluateHandle(() => {
    const candidates = Array.from(document.querySelectorAll('li, div[role="link"], div[role="button"], div[data-challengetype], [data-challengeindex]'));
    for (const el of candidates) {
      const text = (el.innerText || el.textContent || '').toLowerCase();
      if (text.includes('authenticator')) {
        return el;
      }
    }

    const all = Array.from(document.querySelectorAll('span, div, p, h2, h3'));
    for (const el of all) {
      const text = (el.innerText || el.textContent || '').toLowerCase().trim();
      if (text.includes('authenticator') && text.length < 120) {
        return el.closest('li, div[role="link"], div[role="button"], [data-challengetype]') || el;
      }
    }
    return null;
  });

  if (handle && handle.asElement()) {
    return handle.asElement();
  }

  return null;
}

/**
 * Selects the Google Authenticator option with physical mouse click and event dispatching
 */
async function selectAuthenticatorOption(page, cursor, smartClick) {
  console.log('🔍 Searching verification list for "Google Authenticator" option...');

  for (let attempt = 1; attempt <= 10; attempt++) {
    await sleep(800);

    const optionHandle = await getAuthenticatorOptionHandle(page);
    if (optionHandle) {
      console.log(`🎯 [Attempt ${attempt}] Google Authenticator option found! Clicking automatically...`);

      await optionHandle.evaluate(el => el.scrollIntoView({ behavior: 'auto', block: 'center' })).catch(() => {});
      await sleep(250);

      const box = await optionHandle.boundingBox();
      if (box) {
        const x = box.x + box.width / 2;
        const y = box.y + box.height / 2;

        if (cursor && typeof cursor.moveTo === 'function') {
          await cursor.moveTo({ x, y }).catch(() => {});
        }
        await page.mouse.move(x, y, { steps: 5 });
        await sleep(100);
        await page.mouse.down();
        await sleep(80);
        await page.mouse.up();
        console.log(`🖱️ Physical click sent to Authenticator option at (${Math.round(x)}, ${Math.round(y)})!`);
      }

      await optionHandle.evaluate(el => {
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const eventOpts = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy };

        el.dispatchEvent(new PointerEvent('pointerdown', eventOpts));
        el.dispatchEvent(new MouseEvent('mousedown', eventOpts));
        el.focus();
        el.dispatchEvent(new PointerEvent('pointerup', eventOpts));
        el.dispatchEvent(new MouseEvent('mouseup', eventOpts));
        el.click();

        const inner = el.querySelector('a, button, [role="link"], [role="button"]');
        if (inner && inner !== el) {
          inner.click();
        }
      }).catch(() => {});

      if (smartClick) await smartClick(optionHandle).catch(() => {});
      await optionHandle.click().catch(() => {});

      await sleep(2500);

      const isNavigated = await isActualTotpPage(page);
      if (isNavigated) {
        console.log('✅ Successfully clicked "Google Authenticator" and opened TOTP code input page!');
        return true;
      } else {
        console.log('⏳ Authenticator input page has not loaded yet, retrying...');
      }
    }
  }

  return false;
}

/**
 * Selects the 8-digit Backup Code option with physical mouse click and event dispatching
 */
async function selectBackupCodeOption(page, cursor, smartClick) {
  console.log('🔍 Searching verification list for "Enter one of your 8-digit backup codes" option...');

  for (let attempt = 1; attempt <= 10; attempt++) {
    await sleep(800);

    const optionHandle = await getBackupCodeOptionHandle(page);
    if (optionHandle) {
      console.log(`🎯 [Attempt ${attempt}] Backup code option found! Clicking automatically...`);

      await optionHandle.evaluate(el => el.scrollIntoView({ behavior: 'auto', block: 'center' })).catch(() => {});
      await sleep(250);

      const box = await optionHandle.boundingBox();
      if (box) {
        const x = box.x + box.width / 2;
        const y = box.y + box.height / 2;

        if (cursor && typeof cursor.moveTo === 'function') {
          await cursor.moveTo({ x, y }).catch(() => {});
        }
        await page.mouse.move(x, y, { steps: 5 });
        await sleep(100);
        await page.mouse.down();
        await sleep(80);
        await page.mouse.up();
        console.log(`🖱️ Physical click sent to coordinates (${Math.round(x)}, ${Math.round(y)})!`);
      }

      await optionHandle.evaluate(el => {
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const eventOpts = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy };

        el.dispatchEvent(new PointerEvent('pointerdown', eventOpts));
        el.dispatchEvent(new MouseEvent('mousedown', eventOpts));
        el.focus();
        el.dispatchEvent(new PointerEvent('pointerup', eventOpts));
        el.dispatchEvent(new MouseEvent('mouseup', eventOpts));
        el.click();

        const inner = el.querySelector('a, button, [role="link"], [role="button"]');
        if (inner && inner !== el) {
          inner.click();
        }
      }).catch(() => {});

      if (smartClick) await smartClick(optionHandle).catch(() => {});
      await optionHandle.click().catch(() => {});

      await sleep(2500);

      const isNavigated = await isActualBackupCodePage(page);
      if (isNavigated) {
        console.log('✅ Successfully clicked "Enter one of your 8-digit backup codes" and opened backup code page!');
        return true;
      } else {
        console.log('⏳ Backup code page has not loaded yet, retrying...');
      }
    }
  }

  return false;
}

/**
 * Finds the backup code input element on the page
 */
async function findBackupCodeInput(page) {
  const selectors = [
    'input#backupCodePin',
    'input[name="backupCode"]',
    'input[autocomplete="one-time-code"]',
    'input[type="tel"]',
    'input[type="text"]'
  ];

  for (const sel of selectors) {
    try {
      const input = await page.$(sel);
      if (input) {
        const isVisible = await page.evaluate(el => {
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).visibility !== 'hidden';
        }, input).catch(() => false);
        if (isVisible) return input;
      }
    } catch (e) {}
  }
  return null;
}

/**
 * Finds the Google Authenticator 6-digit input element on the page
 */
async function findTotpInput(page) {
  const selectors = [
    'input#totpPin',
    'input[name="totpPin"]',
    'input[autocomplete="one-time-code"]',
    'input[id*="Pin"]',
    'input[name*="Pin"]',
    'input[type="tel"]',
    'input[type="text"]'
  ];

  for (const sel of selectors) {
    try {
      const input = await page.$(sel);
      if (input) {
        const isVisible = await page.evaluate(el => {
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).visibility !== 'hidden';
        }, input).catch(() => false);
        if (isVisible) return input;
      }
    } catch (e) {}
  }
  return null;
}

/**
 * Detects current page status during Google sign-in sequence
 */
async function detectCurrentPageStatus(page, targetEmail) {
  try {
    const url = page.url();

    // 0. Recovery phone/email SETUP interstitial ("Make sure that you can always sign in")
    // Must run before LOGGED_IN — this page often shows an account chip that looks "logged in".
    // Correct action is always Cancel (never Save / never fill recovery fields).
    const isRecoverySetupPrompt = await page.evaluate(() => {
      const text = (document.body?.innerText || '').toLowerCase();
      const buttons = Array.from(document.querySelectorAll('button, [role="button"], a[role="button"]'));
      const hasCancel = buttons.some((b) => {
        const t = (b.innerText || b.textContent || '').trim().toLowerCase();
        return t === 'cancel';
      });
      if (!hasCancel) return false;
      return (
        text.includes('make sure that you can always sign in') ||
        text.includes('your recovery info is used to reach you') ||
        (text.includes('add a recovery email') && (
          text.includes('your recovery phone') || text.includes('recovery phone')
        ))
      );
    }).catch(() => false);

    if (isRecoverySetupPrompt) {
      return {
        type: 'RECOVERY_SETUP_PROMPT',
        description: 'Recovery phone/email setup interstitial — dismiss with Cancel'
      };
    }

    // 1. Check if already logged in
    const loggedInInfo = await page.evaluate((expectedEmail) => {
      const u = window.location.href;
      let foundLoggedIn = false;

      if (u.includes('mail.google.com/mail')) {
        const hasCompose = !!document.querySelector('div[gh="cm"], [data-tooltip*="Compose"], [aria-label*="Compose"]');
        const hasSearch = !!document.querySelector('input[name="q"], form[role="search"]');
        if (hasCompose || hasSearch) foundLoggedIn = true;
      }

      const avatar = document.querySelector('a[aria-label*="Google Account"], a[href*="SignOutOptions"], [data-email]');
      if (avatar && !u.includes('/signin/') && !u.includes('/challenge/')) {
        foundLoggedIn = true;
      }

      if (u.includes('myaccount.google.com') && !u.includes('/signin/')) {
        foundLoggedIn = true;
      }

      if (foundLoggedIn && expectedEmail) {
        const lowerExpected = expectedEmail.toLowerCase().trim();
        const avatarAria = (avatar?.getAttribute('aria-label') || '').toLowerCase();
        const dataEmail = (avatar?.getAttribute('data-email') || '').toLowerCase();

        if (dataEmail && dataEmail !== lowerExpected) {
          return { isLoggedIn: false, accountMismatch: true, currentEmail: dataEmail };
        }
        if (avatarAria && !avatarAria.includes(lowerExpected)) {
          const emailMatch = avatarAria.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
          if (emailMatch && emailMatch[0].toLowerCase() !== lowerExpected) {
            return { isLoggedIn: false, accountMismatch: true, currentEmail: emailMatch[0] };
          }
        }
      }

      return { isLoggedIn: foundLoggedIn, accountMismatch: false, currentEmail: '' };
    }, targetEmail);

    if (loggedInInfo && loggedInInfo.accountMismatch) {
      return { type: 'ACCOUNT_MISMATCH', description: `Different account logged in (${loggedInInfo.currentEmail}). Switching to ${targetEmail}` };
    }

    if (loggedInInfo && loggedInInfo.isLoggedIn) {
      return { type: 'LOGGED_IN', description: 'Login completed (Inbox or Google Account active)' };
    }

    // 1.0 Proactively check for Chrome Network Disconnection / Offline Dinosaur Screen
    const networkOffline = await page.evaluate(() => {
      const u = (window.location.href || '').toLowerCase();
      const text = (document.body ? document.body.innerText : '') || '';
      if (
        u.startsWith('chrome-error://') ||
        u.includes('chromewebdata') ||
        text.includes('DNS_PROBE_FINISHED_NO_INTERNET') ||
        text.includes('ERR_INTERNET_DISCONNECTED') ||
        text.includes('Press space to play') ||
        text.includes('Checking the network cables') ||
        text.includes('No internet')
      ) {
        return {
          type: 'NETWORK_DISCONNECTED',
          description: 'net::ERR_INTERNET_DISCONNECTED (DNS_PROBE_FINISHED_NO_INTERNET): Internet connection lost'
        };
      }
      return null;
    }).catch(() => null);

    if (networkOffline) {
      return networkOffline;
    }

    // 1.1 Proactively check for critical Google authentication rejection errors
    const authError = await page.evaluate(() => {
      const text = (document.body.innerText || '').toLowerCase();
      if (text.includes("couldn't find your google account") || text.includes('no account found')) {
        return { type: 'ACCOUNT_NOT_FOUND', description: "Couldn't find your Google Account" };
      }
      if (text.includes('wrong password') || text.includes('wrong password. try again')) {
        return { type: 'WRONG_PASSWORD', description: 'Wrong password entered' };
      }
      if (text.includes('this browser or app may not be secure') || (text.includes("couldn't sign you in") && text.includes('different browser'))) {
        return { type: 'BROWSER_UNSUPPORTED', description: 'Google blocked browser: "This browser or app may not be secure"' };
      }
      if (text.includes('too many failed attempts') || text.includes('try again in a few hours') || text.includes('account has been disabled') || text.includes('account disabled')) {
        return { type: 'ACCOUNT_LOCKED', description: 'Account temporarily locked or disabled by Google' };
      }
      const hasTotp = !!document.querySelector('input#totpPin, input[name="totpPin"]') ||
                      (text.includes('authenticator') && !text.includes('backup') && !text.includes('8-digit'));
      if (text.includes('this code was already used') || text.includes('code was already used')) {
        return { type: 'INVALID_BACKUP_CODE', description: 'Backup code was already used or invalid' };
      }
      if (text.includes('wrong code. try again') || text.includes('wrong code')) {
        if (hasTotp) {
          return { type: 'INVALID_TOTP_CODE', description: 'TOTP code was incorrect or expired' };
        }
        return { type: 'INVALID_BACKUP_CODE', description: 'Backup code was already used or invalid' };
      }

      // Phone verification required — Google is demanding a phone number before continuing.
      // This account must be skipped; we cannot proceed or bypass this wall.
      const hasPhoneInput = !!document.querySelector(
        'input[type="tel"], input[autocomplete="tel"], input[name="phoneNumber"], input[id*="phone"]'
      );
      const mentionsPhone = text.includes('enter a phone number') ||
        text.includes('phone number to get a text') ||
        text.includes('get a text message') ||
        text.includes('verify your phone') ||
        text.includes('confirm your phone') ||
        (text.includes('verify it') && text.includes('phone'));
      if (hasPhoneInput && mentionsPhone) {
        return { type: 'PHONE_VERIFICATION_REQUIRED', description: 'Google is requiring phone number verification — account must be skipped' };
      }

      return null;
    });

    if (authError) {
      return authError;
    }
    // 2. Check CAPTCHA
    const hasCaptcha = await page.evaluate(() => {
      const text = (document.body.innerText || '').toLowerCase();
      const hasRobot = text.includes('confirm you’re not a robot') || text.includes('confirm you are not a robot');
      const hasRecaptcha = !!document.querySelector('#captcha, iframe[src*="recaptcha"]');
      return hasRobot || hasRecaptcha;
    });

    if (hasCaptcha) {
      return { type: 'CAPTCHA', description: 'CAPTCHA challenge page' };
    }

    // 3. Password input
    const isPasswordVisible = await page.evaluate(() => {
      const el = document.querySelector('input[name="Passwd"], input[name="password"], input[autocomplete="current-password"], input[type="password"]:not([name="hiddenPassword"])');
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      const isHidden = style.visibility === 'hidden' || style.display === 'none' || el.offsetParent === null || !!el.closest('[aria-hidden="true"]');
      return rect.width > 0 && rect.height > 0 && !isHidden;
    });

    if (isPasswordVisible) {
      return { type: 'PASSWORD_ENTRY', description: 'Password entry page' };
    }

    // 4. Email input
    const isEmailVisible = await page.evaluate(() => {
      const passEl = document.querySelector('input[name="Passwd"], input[name="password"], input[autocomplete="current-password"], input[type="password"]:not([name="hiddenPassword"])');
      if (passEl && passEl.offsetParent !== null && !passEl.closest('[aria-hidden="true"]')) {
        return false;
      }
      const el = document.querySelector('#identifierId, input[name="identifier"], input[type="email"]');
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      const isHidden = style.visibility === 'hidden' || style.display === 'none' || el.offsetParent === null || !!el.closest('[aria-hidden="true"]');
      return rect.width > 0 && rect.height > 0 && !isHidden;
    });

    if (isEmailVisible) {
      return { type: 'EMAIL_ENTRY', description: 'Email entry page' };
    }

    // 5. Account Chooser
    const hasAccountChooser = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('div[data-identifier], div[data-email], li[data-identifier]'));
      if (cards.length > 0) return true;
      const text = (document.body.innerText || '').toLowerCase();
      return text.includes('choose an account');
    });

    if (hasAccountChooser) {
      return { type: 'ACCOUNT_CHOOSER', description: 'Account chooser page' };
    }

    // 6. Post-Login Prompts
    const hasPostLoginPrompt = await page.evaluate(() => {
      // Guard: g.co/sc page shows a "Next/Continue" button — must NOT be treated as a post-login prompt
      const bodyText = (document.body.innerText || '').toLowerCase();
      const isSecurityCodePage = bodyText.includes('g.co/sc') || bodyText.includes('get your security code');
      if (isSecurityCodePage) return false;

      const dismissTexts = ['not now', 'cancel', 'skip', 'confirm', 'done', 'continue'];
      const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
      for (const b of buttons) {
        const t = (b.innerText || b.textContent || '').trim().toLowerCase();
        if (dismissTexts.includes(t)) return true;
      }
      return false;
    });

    if (hasPostLoginPrompt && !url.includes('/challenge/') && !url.includes('g.co/sc')) {
      return { type: 'POST_LOGIN_PROMPT', description: 'Additional Google prompt (Not now / Cancel / Continue)' };
    }

    // 7. 2FA Challenge screens
    const challengeInfo = await page.evaluate(() => {
      const u = window.location.href;
      const text = (document.body.innerText || '').toLowerCase();
      const hasBackupInput = !!document.querySelector('input#backupCodePin, input[name="backupCode"]');
      const hasTotpInput = !!document.querySelector('input#totpPin, input[name="totpPin"]');
      const mentionsBackup = text.includes('backup') || text.includes('8-digit');
      const mentionsTotp = text.includes('authenticator');
      const isSelectionUrl = u.includes('/challenge/selection') || u.includes('/selection');
      const hasMultipleChallenges = Array.from(document.querySelectorAll('li, div[role="link"], div[role="button"]')).some(el => {
        const t = (el.innerText || el.textContent || '').toLowerCase();
        return (t.includes('backup') && t.includes('code')) || t.includes('authenticator');
      });
      const mentionsChooseWay = text.includes('choose how you want to sign in');

      if (isSelectionUrl || ((mentionsBackup || mentionsTotp) && hasMultipleChallenges && !hasBackupInput && !hasTotpInput) || (mentionsChooseWay && (mentionsBackup || mentionsTotp))) {
        return '2FA_OPTIONS_LIST';
      }

      const anyInput = !!document.querySelector('input#backupCodePin, input[name="backupCode"], input#totpPin, input[name="totpPin"], input[autocomplete="one-time-code"], input[type="tel"], input[type="text"]');

      if (hasTotpInput || (mentionsTotp && !isSelectionUrl && anyInput && !text.includes('g.co/sc') && !mentionsBackup)) {
        return '2FA_TOTP_INPUT';
      }

      if (hasBackupInput || (mentionsBackup && !isSelectionUrl && anyInput && (text.includes('8-digit') || text.includes('backup code')))) {
        return '2FA_BACKUP_INPUT';
      }

      // Strict 2FA "confirm YOUR recovery email" challenge only — NOT the "Add a recovery email" setup interstitial
      const hasRecoveryConfirmInput = !!document.querySelector(
        'input[name="knowledgePreregisteredEmailResponse"], input#knowledge-preregistered-email-response'
      );
      const mentionsConfirmRecovery =
        text.includes('confirm the recovery email') ||
        text.includes('confirm your recovery email') ||
        (text.includes('recovery email') && text.includes('associated with your account'));
      if (hasRecoveryConfirmInput || (mentionsConfirmRecovery && !isSelectionUrl && anyInput && !text.includes('add a recovery email'))) {
        return 'RECOVERY_EMAIL_CHALLENGE';
      }

      if (text.includes('g.co/sc') || text.includes('get your security code') || text.includes('security code')) {
        return '2FA_G_CO_SC';
      }

      const hasTryAnotherWay = Array.from(document.querySelectorAll('button, a, [role="button"]')).some(b => {
        const t = (b.innerText || b.textContent || '').toLowerCase();
        return t.includes('try another way');
      });

      if (hasTryAnotherWay || u.includes('/challenge/')) {
        return '2FA_OTHER';
      }

      return null;
    });

    if (challengeInfo === '2FA_OPTIONS_LIST') return { type: '2FA_OPTIONS_LIST', description: 'Verification options list page' };
    if (challengeInfo === '2FA_TOTP_INPUT') return { type: '2FA_TOTP_INPUT', description: 'Google Authenticator 6-digit TOTP code input page' };
    if (challengeInfo === '2FA_BACKUP_INPUT') return { type: '2FA_BACKUP_INPUT', description: '8-digit backup code input page' };
    if (challengeInfo === 'RECOVERY_EMAIL_CHALLENGE') return { type: 'RECOVERY_EMAIL_CHALLENGE', description: 'Confirm recovery email address challenge' };
    if (challengeInfo === '2FA_G_CO_SC') return { type: '2FA_G_CO_SC', description: 'Security code (g.co/sc) page -> Try another way' };
    if (challengeInfo === '2FA_OTHER' || url.includes('/challenge/')) return { type: '2FA_OTHER', description: '2-Step verification page -> Try another way' };

    // 8. Landing pages
    if (url.includes('workspace.google.com') || url.includes('gmail/about')) {
      return { type: 'LANDING_PAGE', description: 'Gmail landing page' };
    }

    return { type: 'UNKNOWN', description: `Page URL: ${url}` };
  } catch (e) {
    return { type: 'UNKNOWN', description: 'Page is loading...' };
  }
}

/**
 * Handles Gmail landing page redirect to accounts sign-in
 */
async function handleLandingPageIfPresent(currentTab, currentCursor, smartClick, syncActiveTab) {
  if (syncActiveTab) await syncActiveTab();
  const currentUrl = currentTab.url();

  if (currentUrl.includes('workspace.google.com') || currentUrl.includes('google.com/gmail/about')) {
    console.log('\n📄 Gmail landing page detected! Clicking "Sign in" button...');

    await currentTab.evaluate(() => {
      document.querySelectorAll('a').forEach(a => a.removeAttribute('target'));
    }).catch(() => {});

    await sleep(gaussianRandom(1500, 300));
    await humanWanderMouse(currentCursor);

    const signinSelectors = [
      'a[aria-label*="Sign into Gmail"]',
      'a[href*="accounts.google.com/AccountChooser"]',
      'a[href*="accounts.google.com"]',
      'a.button--medium'
    ];

    let clicked = false;
    for (const sel of signinSelectors) {
      const btn = await currentTab.$(sel).catch(() => null);
      if (btn) {
        await smartClick(btn);
        clicked = true;
        break;
      }
    }

    if (!clicked) {
      clicked = await clickElementByText(currentTab, 'a, button', ['sign in']);
    }

    if (!clicked) {
      await currentTab.goto('https://accounts.google.com/signin/v2/identifier?service=mail', { waitUntil: 'networkidle2' });
    }

    await sleep(3500);
    if (syncActiveTab) await syncActiveTab();
  }
}

/**
 * Dismisses post-login prompts like "Not now / Confirm / Done"
 */
async function handleGooglePostLoginPrompts(currentTab) {
  try {
    const clicked = await clickElementByText(currentTab, 'button, [role="button"], a', [
      'not now', 'cancel', 'skip', 'confirm', 'done', 'continue'
    ]);
    if (clicked) {
      console.log('👉 Skipping additional Google notice ("Not now / Cancel / Continue")...');
      await sleep(2000);
    }
  } catch (e) {}
}

/**
 * Dismiss Google recovery phone/email SETUP interstitial by clicking Cancel only.
 * Never clicks Save and never fills recovery fields.
 * @returns {Promise<boolean>}
 */
async function dismissRecoverySetupPrompt(currentTab) {
  try {
    // Prefer exact "Cancel" label (avoid matching Save / other actions)
    const clickedExact = await currentTab.evaluate(() => {
      const candidates = Array.from(document.querySelectorAll('button, [role="button"], a[role="button"]'));
      for (const el of candidates) {
        const t = (el.innerText || el.textContent || '').trim().toLowerCase();
        if (t === 'cancel') {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.click();
          return true;
        }
      }
      return false;
    }).catch(() => false);

    if (clickedExact) {
      console.log('👉 Clicked Cancel on recovery setup interstitial.');
      await sleep(2500);
      return true;
    }

    const clicked = await clickElementByText(currentTab, 'button, [role="button"], a', ['cancel']);
    if (clicked) {
      console.log('👉 Clicked Cancel (fallback) on recovery setup interstitial.');
      await sleep(2500);
      return true;
    }

    console.warn('⚠️ Recovery setup Cancel button not found.');
    return false;
  } catch (e) {
    console.warn('⚠️ Failed to dismiss recovery setup prompt:', e.message);
    return false;
  }
}

/**
 * Natural entry to Google / Gmail
 */
async function naturalBrowseToGmail(currentTab, currentCursor, smartClick, syncActiveTab) {
  // Favor direct & homepage navigation to prevent triggering Google Search automated query / CAPTCHA bot walls
  const strategies = ['direct', 'homepage', 'direct', 'search'];
  const chosenStrategy = strategies[Math.floor(Math.random() * strategies.length)];

  console.log(`\n🧭 Browsing strategy: [${chosenStrategy.toUpperCase()}]`);

  if (chosenStrategy === 'search') {
    console.log('[2/6] 🔍 Navigating to google.com and searching naturally...');
    await currentTab.goto('https://www.google.com', { waitUntil: 'networkidle2', timeout: 60000 });
    await handleConsentIfPresent(currentTab);

    await sleep(gaussianRandom(1800, 300));
    await humanWanderMouse(currentCursor);

    const searchPhrases = ['gmail login', 'gmail', 'google mail', 'gmail sign in'];
    const query = searchPhrases[Math.floor(Math.random() * searchPhrases.length)];

    const searchBox = await currentTab.waitForSelector('textarea[name="q"], input[name="q"]', { timeout: 15000 });
    console.log(`⌨️  Typing in search box: "${query}"...`);

    await smartClick(searchBox);
    await sleep(gaussianRandom(400, 80));
    await humanType(currentTab, query, { canMakeMistakes: true, typoChance: 0.10 });

    await sleep(gaussianRandom(900, 150));
    console.log('👉 Pressing Enter to fetch search results...');
    await currentTab.keyboard.press('Enter');

    await currentTab.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
    await sleep(gaussianRandom(2200, 400));

    console.log('📜 Browsing search results...');
    await humanScroll(currentTab, randomBetween(180, 320));
    await sleep(gaussianRandom(1200, 200));
    await humanWanderMouse(currentCursor);
    await humanScroll(currentTab, -randomBetween(60, 120));
    await sleep(gaussianRandom(1000, 200));

    console.log('🎯 Clicking official Gmail result link...');
    const links = await currentTab.$$('a[href*="mail.google.com"], a[href*="accounts.google.com"], a h3');
    let clicked = false;

    for (const link of links) {
      const text = await currentTab.evaluate(el => (el.innerText || el.getAttribute('href') || '').toLowerCase(), link);
      if (text.includes('gmail') || text.includes('mail.google.com') || text.includes('sign in')) {
        await smartClick(link);
        clicked = true;
        break;
      }
    }

    if (!clicked) {
      await currentTab.goto('https://accounts.google.com/signin/v2/identifier?service=mail', { waitUntil: 'networkidle2' });
    }

  } else if (chosenStrategy === 'homepage') {
    console.log('[2/6] 🏠 Navigating to google.com homepage and clicking top "Sign in" button...');
    await currentTab.goto('https://www.google.com', { waitUntil: 'networkidle2', timeout: 60000 });
    await handleConsentIfPresent(currentTab);

    await sleep(gaussianRandom(1800, 300));
    await humanWanderMouse(currentCursor);

    const signinBtn = await currentTab.$('a[href*="accounts.google.com/ServiceLogin"], a[href*="accounts.google.com"]');
    if (signinBtn) {
      await smartClick(signinBtn);
    } else {
      const clicked = await clickElementByText(currentTab, 'a, button', ['sign in']);
      if (!clicked) {
        await currentTab.goto('https://accounts.google.com/signin/v2/identifier?service=mail', { waitUntil: 'networkidle2' });
      }
    }

  } else {
    console.log('[2/6] 🌐 Navigating directly to mail.google.com...');
    await currentTab.goto('https://mail.google.com', { waitUntil: 'networkidle2', timeout: 60000 });
  }

  await sleep(gaussianRandom(2500, 400));
  if (syncActiveTab) await syncActiveTab();
  await handleLandingPageIfPresent(currentTab, currentCursor, smartClick, syncActiveTab);
}

/**
 * Main Google Login & 2FA Resolution Routine
 * 
 * @param {Object} context
 * @param {import('rebrowser-puppeteer-core').Page} context.currentTab
 * @param {Object} context.currentCursor
 * @param {string} context.email
 * @param {string} context.password
 * @param {string} [context.recoveryEmail]
 * @param {Function} context.getBackupCode
 * @param {Function} context.smartClick
 * @param {Function} context.syncActiveTab
 * @returns {Promise<boolean>}
 */
async function ensureGoogleLoggedIn({
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
}) {
  const click = smartClick || (target => domSmartClick(currentTab, currentCursor, target, syncActiveTab));

  if (attachDialogAutoHandler) {
    attachDialogAutoHandler(currentTab);
  }

  // 1. Entry to Google — warm session skip when profile is already logged in
  let skippedNaturalBrowse = false;
  try {
    await currentTab.goto('https://accounts.google.com/', {
      waitUntil: 'domcontentloaded',
      timeout: 25000
    }).catch(() => null);
    await sleep(1200);
    if (syncActiveTab) await syncActiveTab();
    const warmStatus = await detectCurrentPageStatus(currentTab, email);
    if (warmStatus && warmStatus.type === 'LOGGED_IN') {
      console.log('⚡ [Warm Session] Already logged in — skipping natural browse.');
      skippedNaturalBrowse = true;
    }
  } catch (_) {}

  if (!skippedNaturalBrowse) {
    await naturalBrowseToGmail(currentTab, currentCursor, click, syncActiveTab);
    if (syncActiveTab) await syncActiveTab();
    await handleLandingPageIfPresent(currentTab, currentCursor, click, syncActiveTab);
    if (syncActiveTab) await syncActiveTab();
  }

  console.log('\n🧠 [Smart page detector & decision engine active]...');

  let loggedIn = false;
  let loopStartTime = Date.now();
  const maxSessionTimeMs = 300000; // 5 mins max
  let totpAttempts = 0;
  let totpFailed = false;
  let backupAttempts = 0;

  while (!loggedIn && (Date.now() - loopStartTime < maxSessionTimeMs)) {
    if (syncActiveTab) await syncActiveTab();
    const pageStatus = await detectCurrentPageStatus(currentTab, email);

    console.log(`\n📍 [Page Detection]: [${pageStatus.type}] -> ${pageStatus.description}`);

    switch (pageStatus.type) {
      case 'NETWORK_DISCONNECTED': {
        console.error(`\n🛑 [Network Offline]: ${pageStatus.description}`);
        throw new Error(pageStatus.description);
      }

      case 'WRONG_PASSWORD':
      case 'ACCOUNT_NOT_FOUND':
      case 'BROWSER_UNSUPPORTED':
      case 'ACCOUNT_LOCKED': {
        console.error(`\n❌ [Auth Critical Error]: ${pageStatus.description}`);
        throw new Error(`Google Authentication Error [${pageStatus.type}]: ${pageStatus.description}`);
      }

      case 'PHONE_VERIFICATION_REQUIRED': {
        console.warn(`\n📵 [Phone Wall Detected]: Google is requiring phone verification for "${email}".`);
        console.warn('⏭️ Skipping this account and moving to the next one...');
        throw new Error(`PHONE_VERIFICATION_REQUIRED: ${pageStatus.description}`);
      }

      case 'INVALID_BACKUP_CODE': {
        backupAttempts++;
        // Persist removal of the rejected/used code only after Google rejects it
        if (typeof commitBackupCodes === 'function') {
          await commitBackupCodes().catch(() => {});
        }
        if (backupAttempts >= 4) {
          console.error(`\n❌ [Auth Critical Error]: ${pageStatus.description} (Maximum backup code attempts reached)`);
          throw new Error(`Google Authentication Error [${pageStatus.type}]: ${pageStatus.description}`);
        }
        console.warn(`⚠️ [Page Decision] Backup code was rejected or already used (Attempt ${backupAttempts}). Trying next available backup code...`);
        const rawCode = typeof getBackupCode === 'function' ? await getBackupCode() : null;
        if (rawCode) {
          const clean = rawCode.replace(/[\s-]/g, '');
          console.log(`⌨️  Typing next backup code (${clean.length} digits)...`);
          const field = await findBackupCodeInput(currentTab);
          if (field) {
            await click(field);
            await sleep(250);
            await currentTab.keyboard.down('Control');
            await currentTab.keyboard.press('KeyA');
            await currentTab.keyboard.up('Control');
            await currentTab.keyboard.press('Backspace');
            await sleep(200);
            await humanType(currentTab, clean, { canMakeMistakes: false });
            await sleep(1000);
            await clickGoogleNext(currentTab, 'backupCodeNext', currentCursor, syncActiveTab);
            await sleep(4000);
          }
        } else {
          console.error(`\n❌ [Auth Critical Error]: No more backup codes remaining in list.`);
          throw new Error(`Google Authentication Error [${pageStatus.type}]: ${pageStatus.description}`);
        }
        break;
      }

      case 'LOGGED_IN': {
        console.log('🎉 [Page Decision] Excellent! Account is already logged in!');
        console.log('⏩ No need to proceed to password or 2FA steps.');
        loggedIn = true;
        break;
      }

      case 'ACCOUNT_MISMATCH': {
        console.log(`🔄 [Page Decision] Session account does not match target "${email}". Logging out to switch accounts...`);
        await currentTab.goto('https://accounts.google.com/Logout', { waitUntil: 'networkidle2' }).catch(() => {});
        await sleep(2000);
        await currentTab.goto('https://accounts.google.com/signin/v2/identifier?service=mail', { waitUntil: 'networkidle2' });
        await sleep(2500);
        break;
      }

      case 'LANDING_PAGE': {
        console.log('👉 [Page Decision] On landing page, clicking "Sign in" button...');
        await handleLandingPageIfPresent(currentTab, currentCursor, click, syncActiveTab);
        await sleep(2500);
        break;
      }

      case 'ACCOUNT_CHOOSER': {
        console.log('👉 [Page Decision] On account chooser page...');
        const accountCard = await currentTab.$(`div[data-identifier="${email}"], div[data-email="${email}"]`);
        if (accountCard) {
          console.log(`👉 Clicking "${email}" from account list...`);
          await click(accountCard);
        } else {
          console.log('👉 Clicking "Use another account"...');
          const useAnother = await currentTab.$('#identifierLink');
          if (useAnother) {
            await click(useAnother);
          } else {
            await clickElementByText(currentTab, 'button, [role="button"], li', ['use another account']);
          }
        }
        await sleep(2500);
        break;
      }

      case 'EMAIL_ENTRY': {
        console.log(`✉️ [Page Decision] Email page. Typing "${email}" and clicking Next...`);
        const emailInput = await currentTab.$('#identifierId, input[name="identifier"], input[type="email"]');
        if (emailInput) {
          await emailInput.evaluate(el => {
            el.focus();
            el.value = '';
          }).catch(() => {});
          await click(emailInput);
          await sleep(250);

          await currentTab.keyboard.down('Control');
          await currentTab.keyboard.press('KeyA');
          await currentTab.keyboard.up('Control');
          await currentTab.keyboard.press('Backspace');
          await sleep(200);

          console.log(`⌨️  Typing email: ${email}`);
          await humanType(currentTab, email, { canMakeMistakes: false });
          await sleep(1000);

          console.log('👉 Clicking Next button...');
          await clickGoogleNext(currentTab, 'identifierNext', currentCursor, syncActiveTab);
        }
        await sleep(3500);
        break;
      }

      case 'PASSWORD_ENTRY': {
        console.log('🔒 [Page Decision] Password page. Clearing field and typing password...');
        const passInput = await currentTab.$('input[name="Passwd"], input[name="password"], input[autocomplete="current-password"], input[type="password"]:not([name="hiddenPassword"])');
        if (passInput) {
          await passInput.evaluate(el => {
            el.focus();
            el.value = '';
          }).catch(() => {});
          await click(passInput);
          await sleep(250);

          await currentTab.keyboard.down('Control');
          await currentTab.keyboard.press('KeyA');
          await currentTab.keyboard.up('Control');
          await currentTab.keyboard.press('Backspace');
          await sleep(200);

          console.log('⌨️  Typing password...');
          await humanType(currentTab, password, { canMakeMistakes: false });
          await sleep(1000);

          console.log('👉 Clicking Next to submit password...');
          await clickGoogleNext(currentTab, 'passwordNext', currentCursor, syncActiveTab);
        }
        console.log('⏳ Password submitted. Checking whether logged in or 2FA challenge is requested...');
        await sleep(4000);
        break;
      }

      case 'RECOVERY_SETUP_PROMPT': {
        console.log('🛡️ [Page Decision] Recovery phone/email setup interstitial detected.');
        console.log('👉 Clicking Cancel (skip setup — no recovery email import required)...');
        await dismissRecoverySetupPrompt(currentTab);
        if (syncActiveTab) await syncActiveTab();
        await sleep(1500);
        break;
      }

      case 'POST_LOGIN_PROMPT': {
        console.log('👉 [Page Decision] Google showing post-login prompt. Skipping "Not now / Cancel / Continue"...');
        await handleGooglePostLoginPrompts(currentTab);
        await sleep(2000);
        break;
      }

      case '2FA_G_CO_SC':
      case '2FA_OTHER': {
        console.log('🛡️ [Page Decision] 2-Step verification page (prompt or g.co/sc). Clicking "Try another way"...');
        const tryClicked = await clickTryAnotherWay(currentTab, currentCursor, click);
        if (tryClicked) {
          console.log('⏳ Click sent to "Try another way". Waiting for options list...');
          for (let waitSec = 0; waitSec < 6; waitSec++) {
            await sleep(1000);
            if (syncActiveTab) await syncActiveTab();
            const nextStatus = await detectCurrentPageStatus(currentTab, email);
            if (nextStatus.type !== '2FA_G_CO_SC' && nextStatus.type !== '2FA_OTHER') {
              break;
            }
          }
        } else {
          console.log('⚠️ "Try another way" button not found. Waiting 2.5 seconds...');
          await sleep(2500);
        }
        break;
      }

      case 'INVALID_TOTP_CODE': {
        totpAttempts++;
        console.warn(`⚠️ [Page Decision] Submitted TOTP code was rejected by Google (Attempt ${totpAttempts}).`);
        // Immediately mark TOTP as failed so subsequent choices fallback to Backup Code and prevent looping
        totpFailed = true;
        console.log('🔄 Disabling TOTP and clicking "Try another way" to fallback to Backup Code...');
        const tryClicked = await clickTryAnotherWay(currentTab, currentCursor, click);
        if (tryClicked) {
          console.log('⏳ Click sent to "Try another way". Waiting for options list...');
          for (let waitSec = 0; waitSec < 6; waitSec++) {
            await sleep(1000);
            if (syncActiveTab) await syncActiveTab();
            const nextStatus = await detectCurrentPageStatus(currentTab, email);
            if (nextStatus.type !== 'INVALID_TOTP_CODE' && nextStatus.type !== '2FA_TOTP_INPUT') {
              break;
            }
          }
        } else {
          console.log('⚠️ "Try another way" button not found. Waiting 2.5 seconds...');
          await sleep(2500);
        }
        break;
      }

      case '2FA_OPTIONS_LIST': {
        console.log('📋 [Page Decision] Alternative verification list options loaded.');
        let optionClicked = false;

        // Priority 1: Google Authenticator (ONLY if TOTP has not failed and twoFactor secret is provided and valid)
        if (!totpFailed && twoFactor && isValidSecret(twoFactor)) {
          console.log('📱 2FA Secret Key detected! Selecting "Google Authenticator" option...');
          optionClicked = await selectAuthenticatorOption(currentTab, currentCursor, click);
          if (optionClicked) {
            console.log('⏳ Waiting for Authenticator 6-digit code page to load...');
            for (let waitSec = 0; waitSec < 6; waitSec++) {
              await sleep(1000);
              if (syncActiveTab) await syncActiveTab();
              const nextStatus = await detectCurrentPageStatus(currentTab, email);
              if (nextStatus.type === '2FA_TOTP_INPUT') {
                break;
              }
            }
          } else {
            console.log('⚠️ Google Authenticator option not found or could not be clicked. Falling back to backup code...');
          }
        } else if (totpFailed) {
          console.log('ℹ️ TOTP previously failed. Bypassing Authenticator and selecting Backup Code directly...');
        }

        // Priority 2 / Fallback: 8-digit Backup code
        if (!optionClicked) {
          console.log('🔑 Selecting "Enter one of your 8-digit backup codes"...');
          const backupClicked = await selectBackupCodeOption(currentTab, currentCursor, click);
          if (backupClicked) {
            console.log('⏳ Waiting for backup code input page to load...');
            for (let waitSec = 0; waitSec < 6; waitSec++) {
              await sleep(1000);
              if (syncActiveTab) await syncActiveTab();
              const nextStatus = await detectCurrentPageStatus(currentTab, email);
              if (nextStatus.type === '2FA_BACKUP_INPUT') {
                break;
              }
            }
          } else {
            await sleep(2000);
          }
        }
        break;
      }

      case '2FA_TOTP_INPUT': {
        console.log('🔢 [Page Decision] Google Authenticator 6-digit code page.');
        if (totpFailed) {
          console.log('⚠️ TOTP is marked as failed. Clicking "Try another way" to switch to Backup code...');
          await clickTryAnotherWay(currentTab, currentCursor, click);
          await sleep(2500);
          break;
        }

        if (twoFactor && isValidSecret(twoFactor)) {
          totpAttempts++;
          const totpCode = generateTOTP(twoFactor);
          const remaining = getRemainingSeconds();
          console.log(`🔐 Generated 6-digit TOTP code (Attempt ${totpAttempts}): [${totpCode}] (~${remaining}s remaining in window)`);

          const field = await findTotpInput(currentTab);
          if (field) {
            await click(field);
            await sleep(250);

            await currentTab.keyboard.down('Control');
            await currentTab.keyboard.press('KeyA');
            await currentTab.keyboard.up('Control');
            await currentTab.keyboard.press('Backspace');
            await sleep(200);

            console.log(`⌨️  Typing 6-digit TOTP code...`);
            await humanType(currentTab, totpCode, { canMakeMistakes: false });
            await sleep(1000);

            console.log('👉 Clicking Next button to submit TOTP code...');
            await clickGoogleNext(currentTab, 'totpNext', currentCursor, syncActiveTab);
            await sleep(4000);
          } else {
            console.log('⚠️ TOTP input field not found. Retrying in 2 seconds...');
            await sleep(2000);
          }
        } else {
          console.log('⚠️ No valid 2FA Secret key available for TOTP code! Falling back to "Try another way"...');
          totpFailed = true;
          await clickTryAnotherWay(currentTab, currentCursor, click);
          await sleep(2500);
        }
        break;
      }

      case '2FA_BACKUP_INPUT': {
        console.log('🔢 [Page Decision] Backup code input page. Entering 8-digit backup code...');
        const rawCode = typeof getBackupCode === 'function' ? await getBackupCode() : null;
        if (rawCode) {
          const clean = rawCode.replace(/[\s-]/g, '');
          console.log(`⌨️  Typing 8-digit backup code (${clean.length} digits)...`);
          const field = await findBackupCodeInput(currentTab);
          if (field) {
            await click(field);
            await sleep(250);

            await currentTab.keyboard.down('Control');
            await currentTab.keyboard.press('KeyA');
            await currentTab.keyboard.up('Control');
            await currentTab.keyboard.press('Backspace');
            await sleep(200);

            await humanType(currentTab, clean, { canMakeMistakes: false });
            await sleep(1000);

            console.log('👉 Clicking Next button to submit backup code...');
            await clickGoogleNext(currentTab, 'backupCodeNext', currentCursor, syncActiveTab);
            await sleep(4000);
          }
        } else {
          console.log('⚠️ No backup code found!');
          await sleep(3000);
        }
        break;
      }

      case 'RECOVERY_EMAIL_CHALLENGE': {
        console.log(`🛡️ [Page Decision] Google is requesting Recovery Email verification...`);
        if (recoveryEmail) {
          console.log(`⌨️  Filling recovery email: "${recoveryEmail}"...`);
          const recInput = await currentTab.$(
            'input[name="knowledgePreregisteredEmailResponse"], input#knowledge-preregistered-email-response, input[type="email"], input[type="text"]'
          );
          if (recInput) {
            await click(recInput);
            await sleep(250);
            await humanType(currentTab, recoveryEmail.trim(), { canMakeMistakes: false });
            await sleep(500);
            await clickGoogleNext(currentTab, 'recoveryEmailNext', currentCursor, syncActiveTab);
            await sleep(4000);
          }
        } else {
          console.warn('⚠️ No recovery email configured for this account. Skipping...');
          throw new Error('Google Authentication Error [RECOVERY_EMAIL_REQUIRED]: Google requested recovery email confirmation but none was configured');
        }
        break;
      }

      case 'CAPTCHA': {
        console.log('\n🧩 [Page Decision] CAPTCHA detected on Google Login! Invoking click/audio solver (Token API is Legal-form only)...');
        try {
          const { handlePageCaptcha } = require('../captcha/captcha_solver');
          // Login: click + audio only — Token API reserved for Legal form
          const captchaRes = await handlePageCaptcha(currentTab, {
            apiKey: captchaApiKey,
            autoSolve: captchaAutoSolve,
            timeoutMs: 40000
          });
          if (captchaRes.solved) {
            console.log('🎉 [Google Auth]: CAPTCHA challenge solved successfully!');
            await sleep(2000);
            console.log('👉 Clicking Next button to continue sign-in...');
            await clickGoogleNext(currentTab, 'identifierNext', currentCursor, syncActiveTab).catch(() => {});
            await sleep(4000);
            if (syncActiveTab) await syncActiveTab();
            break;
          }
        } catch (cErr) {
          console.warn('⚠️ [Google Auth]: Notice during CAPTCHA auto-solve:', cErr.message);
        }

        console.log('⏳ Awaiting CAPTCHA resolution before re-checking...');
        await sleep(5000);
        break;
      }

      default:
        if (!currentTab.url().includes('accounts.google.com') && !currentTab.url().includes('mail.google.com')) {
          console.log('👉 Redirecting to Google Sign-in page...');
          await currentTab.goto('https://accounts.google.com/signin/v2/identifier?service=mail', { waitUntil: 'networkidle2' });
        }
        await sleep(2500);
        break;
    }
  }

  return loggedIn;
}

module.exports = {
  ensureGoogleLoggedIn,
  detectCurrentPageStatus,
  isActualBackupCodePage,
  isActualTotpPage,
  clickTryAnotherWay,
  selectBackupCodeOption,
  selectAuthenticatorOption,
  findBackupCodeInput,
  findTotpInput,
  handleLandingPageIfPresent,
  handleGooglePostLoginPrompts,
  dismissRecoverySetupPrompt,
  naturalBrowseToGmail,
  generateTOTP,
  isValidSecret
};
