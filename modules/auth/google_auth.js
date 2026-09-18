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
const { applyDeepStealth } = require('../helpers/stealth');
const {
  smartClick: domSmartClick,
  clickElementByText,
  clickGoogleNext,
  handleConsentIfPresent
} = require('../helpers/dom_utils');

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
      console.log('⚠️ "Try another way" button not directly found. Capturing screenshot: debug_try_another_way.png');
      await page.screenshot({ path: 'debug_try_another_way.png' }).catch(() => {});
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
 * Detects current page status during Google sign-in sequence
 */
async function detectCurrentPageStatus(page, targetEmail) {
  try {
    const url = page.url();

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

    // 1.1 Proactively check for critical Google authentication rejection errors
    const authError = await page.evaluate(() => {
      const text = (document.body.innerText || '').toLowerCase();
      if (text.includes('couldn’t find your google account') || text.includes("couldn't find your google account") || text.includes('no account found')) {
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
      if (text.includes('wrong code. try again') || text.includes('this code was already used') || text.includes('code was already used')) {
        return { type: 'INVALID_BACKUP_CODE', description: 'Backup code was already used or invalid' };
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
      const dismissTexts = ['not now', 'confirm', 'done', 'continue'];
      const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
      for (const b of buttons) {
        const t = (b.innerText || b.textContent || '').trim().toLowerCase();
        if (dismissTexts.includes(t)) return true;
      }
      return false;
    });

    if (hasPostLoginPrompt && !url.includes('/challenge/')) {
      return { type: 'POST_LOGIN_PROMPT', description: 'Additional Google prompt (Not now / Confirm)' };
    }

    // 7. 2FA Challenge screens
    const challengeInfo = await page.evaluate(() => {
      const u = window.location.href;
      const text = (document.body.innerText || '').toLowerCase();
      const hasBackupInput = !!document.querySelector('input#backupCodePin, input[name="backupCode"]');
      const mentionsBackup = text.includes('backup') || text.includes('8-digit');
      const isSelectionUrl = u.includes('/challenge/selection') || u.includes('/selection');
      const hasMultipleChallenges = Array.from(document.querySelectorAll('li, div[role="link"], div[role="button"]')).some(el => {
        const t = (el.innerText || el.textContent || '').toLowerCase();
        return t.includes('backup') && t.includes('code');
      });
      const mentionsChooseWay = text.includes('choose how you want to sign in');

      if (isSelectionUrl || (mentionsBackup && hasMultipleChallenges && !hasBackupInput) || (mentionsChooseWay && mentionsBackup)) {
        return '2FA_OPTIONS_LIST';
      }

      const anyInput = !!document.querySelector('input#backupCodePin, input[name="backupCode"], input[autocomplete="one-time-code"], input[type="tel"], input[type="text"]');
      if (hasBackupInput || (mentionsBackup && !isSelectionUrl && anyInput && (text.includes('8-digit') || text.includes('backup code')))) {
        return '2FA_BACKUP_INPUT';
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
    if (challengeInfo === '2FA_BACKUP_INPUT') return { type: '2FA_BACKUP_INPUT', description: '8-digit backup code input page' };
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
      'not now', 'cancel', 'confirm', 'done', 'continue'
    ]);
    if (clicked) {
      console.log('👉 Skipping additional Google notice ("Not now / Continue")...');
      await sleep(2000);
    }
  } catch (e) {}
}

/**
 * Natural entry to Google / Gmail
 */
async function naturalBrowseToGmail(currentTab, currentCursor, smartClick, syncActiveTab) {
  const strategies = ['search', 'search', 'homepage', 'direct'];
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
  getBackupCode,
  smartClick,
  syncActiveTab
}) {
  const click = smartClick || (target => domSmartClick(currentTab, currentCursor, target, syncActiveTab));

  // 1. Natural entry to Google
  await naturalBrowseToGmail(currentTab, currentCursor, click, syncActiveTab);
  if (syncActiveTab) await syncActiveTab();
  await handleLandingPageIfPresent(currentTab, currentCursor, click, syncActiveTab);
  if (syncActiveTab) await syncActiveTab();

  console.log('\n🧠 [Smart page detector & decision engine active]...');

  let loggedIn = false;
  let loopStartTime = Date.now();
  const maxSessionTimeMs = 300000; // 5 mins max

  while (!loggedIn && (Date.now() - loopStartTime < maxSessionTimeMs)) {
    if (syncActiveTab) await syncActiveTab();
    const pageStatus = await detectCurrentPageStatus(currentTab, email);

    console.log(`\n📍 [Page Detection]: [${pageStatus.type}] -> ${pageStatus.description}`);

    switch (pageStatus.type) {
      case 'WRONG_PASSWORD':
      case 'ACCOUNT_NOT_FOUND':
      case 'BROWSER_UNSUPPORTED':
      case 'ACCOUNT_LOCKED':
      case 'INVALID_BACKUP_CODE': {
        console.error(`\n❌ [Auth Critical Error]: ${pageStatus.description}`);
        throw new Error(`Google Authentication Error [${pageStatus.type}]: ${pageStatus.description}`);
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

      case 'POST_LOGIN_PROMPT': {
        console.log('👉 [Page Decision] Google showing post-login prompt. Skipping "Not now / Continue"...');
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

      case '2FA_OPTIONS_LIST': {
        console.log('📋 [Page Decision] Alternative verification list. Selecting "Enter one of your 8-digit backup codes"...');
        const optionClicked = await selectBackupCodeOption(currentTab, currentCursor, click);
        if (optionClicked) {
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

      case 'CAPTCHA': {
        console.log('\n⚠️ [Page Decision] CAPTCHA detected. Waiting for manual resolution...');
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
  clickTryAnotherWay,
  selectBackupCodeOption,
  findBackupCodeInput,
  handleLandingPageIfPresent,
  handleGooglePostLoginPrompts,
  naturalBrowseToGmail
};
