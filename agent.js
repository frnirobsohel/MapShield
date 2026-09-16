require('dotenv').config();
const readline = require('readline');
const path = require('path');
// Use rebrowser-puppeteer-core for 0-CDP leak anti-detection
const puppeteer = require('rebrowser-puppeteer-core');
const { createCursor } = require('ghost-cursor');
const { runMapsReporter, DEFAULT_MAPS_URL } = require('./modules/maps_reporter');

/* ==========================================================================
   1. MATHEMATICAL & BIOMETRIC HUMAN MOTOR DYNAMICS
   ========================================================================== */

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Normal (Gaussian) distribution for realistic human reaction times (Box-Muller)
 */
function gaussianRandom(mean, stdDev) {
  // Clamp u away from 0 and 1 to avoid Math.log(0) = -Infinity -> NaN
  let u = Math.max(Number.EPSILON, Math.min(1 - Number.EPSILON, Math.random()));
  let v = Math.random();
  let z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return Math.max(0, Math.round(mean + z * stdDev));
}

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/* ==========================================================================
   2. HUMAN SCROLL & NATURAL MOUSE DRIFT
   ========================================================================== */

async function humanScroll(page, totalDistance, steps = 8) {
  const stepDistance = totalDistance / steps;
  for (let i = 0; i < steps; i++) {
    const currentStep = stepDistance * (1 - (i / (steps * 1.5)));
    await page.evaluate((d) => window.scrollBy(0, d), currentStep).catch(() => {});
    await sleep(randomBetween(50, 110));
  }
}

/**
 * Natural subconscious mouse movement while human reads or waits
 */
async function humanWanderMouse(cursor) {
  try {
    await cursor.randomMove();
    await sleep(gaussianRandom(450, 100));
  } catch (e) {
    // Ignore bounds
  }
}

/* ==========================================================================
   3. BIOMETRIC KEYSTROKE DYNAMICS (Typing, Muscle Memory & Typos)
   ========================================================================== */

const QWERTY_NEIGHBORS = {
  a: ['s', 'q', 'z', 'w'],
  b: ['v', 'g', 'h', 'n'],
  c: ['x', 'd', 'v'],
  d: ['s', 'e', 'f', 'c', 'x'],
  e: ['w', 'r', 'd', 's'],
  f: ['d', 'r', 't', 'g', 'v'],
  g: ['f', 't', 'y', 'h', 'b'],
  h: ['g', 'y', 'u', 'j', 'n', 'b'],
  i: ['u', 'o', 'k', 'j'],
  j: ['h', 'u', 'i', 'k', 'm', 'n'],
  k: ['j', 'i', 'o', 'l', 'm'],
  l: ['k', 'o', 'p'],
  m: ['n', 'j', 'k'],
  n: ['b', 'h', 'j', 'm'],
  o: ['i', 'p', 'k', 'l'],
  p: ['o', 'l'],
  q: ['w', 'a'],
  r: ['e', 't', 'f', 'd'],
  s: ['a', 'w', 'e', 'd', 'x', 'z'],
  t: ['r', 'y', 'g', 'f'],
  u: ['y', 'i', 'j', 'h'],
  v: ['c', 'f', 'g', 'b'],
  w: ['q', 'e', 's', 'a'],
  x: ['z', 's', 'd', 'c'],
  y: ['t', 'u', 'h', 'g'],
  z: ['a', 's', 'x']
};

/**
 * Simulates physical key press with biological hold time (keydown -> wait -> keyup)
 */
// Characters that require Shift key on a standard QWERTY keyboard
const SHIFT_CHARS = new Set(['!', '@', '#', '$', '%', '^', '&', '*', '(', ')', '_', '+', '{', '}', '|', ':', '"', '<', '>', '?', '~']);

async function naturalKeyPress(page, char) {
  // Bug fix: also handle special chars that need Shift (e.g. @, !, #, $)
  const isUppercase = char !== char.toLowerCase() && char.toUpperCase() === char;
  const needsShift = isUppercase || SHIFT_CHARS.has(char);

  if (needsShift) {
    await page.keyboard.down('Shift');
    await sleep(randomBetween(60, 120));
  }

  await page.keyboard.press(char, { delay: gaussianRandom(95, 20) });

  if (needsShift) {
    await sleep(randomBetween(50, 100));
    await page.keyboard.up('Shift');
  }
}

/**
 * Biometric Human Typing:
 * - Natural typing with realistic typos & Backspace corrections (likhe katbe)
 * - Variable delay based on character type (special symbols require higher cognitive load)
 */
async function humanType(page, text, { canMakeMistakes = true, typoChance = 0.08 } = {}) {
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const lowerChar = char.toLowerCase();

    // Natural typo simulation
    if (canMakeMistakes && QWERTY_NEIGHBORS[lowerChar] && Math.random() < typoChance) {
      const neighbors = QWERTY_NEIGHBORS[lowerChar];
      const typoChar = neighbors[Math.floor(Math.random() * neighbors.length)];

      await naturalKeyPress(page, typoChar);
      await sleep(gaussianRandom(400, 80)); // Human realization pause
      await page.keyboard.press('Backspace', { delay: gaussianRandom(85, 20) });
      await sleep(gaussianRandom(200, 40));
    }

    await naturalKeyPress(page, char);

    let delay = gaussianRandom(160, 35);
    
    // Higher thinking delay on special characters or transitions
    if (['!', '@', '#', '$', '%', '^', '&', '*', '(', ')', '_', '+'].includes(char)) {
      delay += randomBetween(200, 450);
    } else if (char === ' ' || char === '.' || char === ',' || Math.random() < 0.04) {
      delay += randomBetween(250, 500);
    }
    await sleep(delay);
  }
}

/* ==========================================================================
   4. ADVANCED STEALTH EVASION (MASKING BOTGUARD & CDP SIGNALS)
   ========================================================================== */

/**
 * Injects deep stealth properties to completely camouflage the browser
 */
async function applyDeepStealth(page) {
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

    // 4. Genuine language and hardware concurrency
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en', 'bn'],
      configurable: true
    });
  }).catch(() => {});
}

/* ==========================================================================
   5. TAB MANAGER & SMART GHOST-CURSOR CLICK
   ========================================================================== */

let browserInstance = null;
let currentTab = null;
let currentCursor = null;

async function syncActiveTab() {
  if (!browserInstance) return;
  const allPages = await browserInstance.pages();
  if (allPages.length <= 1) return;

  // Find relevant account or mail tab
  let targetPage = allPages.find(p => p.url().includes('accounts.google.com') || p.url().includes('mail.google.com'));
  if (!targetPage) {
    targetPage = allPages[allPages.length - 1];
  }

  if (targetPage && targetPage !== currentTab) {
    console.log('🔄 নতুন ট্যাব শনাক্ত হয়েছে! সক্রিয় ট্যাব পরিবর্তন করা হচ্ছে...');
    
    // Close marketing/landing tabs
    for (const p of allPages) {
      if (p !== targetPage && (p.url().includes('workspace.google.com') || p.url().includes('gmail/about'))) {
        console.log('🗑️ পূর্ববর্তী ল্যান্ডিং পেজ বন্ধ করা হয়েছে।');
        await p.close().catch(() => {});
      }
    }

    currentTab = targetPage;
    await currentTab.bringToFront();
    await applyDeepStealth(currentTab);
    currentCursor = createCursor(currentTab);
    console.log('✅ বর্তমান সক্রিয় পেজ: ' + currentTab.url());
  }
}

async function smartClick(target) {
  let element = target;
  if (typeof target === 'string') {
    element = await currentTab.$(target);
  }
  if (!element) return false;

  try {
    await currentCursor.click(element, {
      waitForClick: gaussianRandom(400, 80),
      maxWaitForPadding: gaussianRandom(250, 50)
    });
    await sleep(gaussianRandom(500, 100));
    await syncActiveTab();
    return true;
  } catch (err) {
    try {
      await element.click();
      await sleep(gaussianRandom(500, 100));
      await syncActiveTab();
      return true;
    } catch (e) {
      return false;
    }
  }
}

/**
 * Clicks a button or link by checking innerText/textContent/aria-label cleanly in DOM
 */
async function clickElementByText(page, tagSelectors, textKeywords) {
  try {
    const clicked = await page.evaluate((sel, keywords) => {
      const els = Array.from(document.querySelectorAll(sel));
      for (const el of els) {
        const t = (el.innerText || el.textContent || '').trim().toLowerCase();
        const aria = (el.getAttribute('aria-label') || '').toLowerCase();
        for (const kw of keywords) {
          const lowerKw = kw.toLowerCase();
          if (t === lowerKw || t.includes(lowerKw) || aria === lowerKw || aria.includes(lowerKw)) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.click();
            return true;
          }
        }
      }
      return false;
    }, tagSelectors, textKeywords);
    return clicked;
  } catch (e) {
    return false;
  }
}

/**
 * Clicks Google Next / Submit buttons using standard valid CSS selectors and DOM fallback
 */
async function clickGoogleNext(page, primaryId) {
  const ids = primaryId ? [`#${primaryId}`, `#${primaryId} button`] : [];
  const validSelectors = [
    ...ids,
    'button[jsname="LgbsSe"]',
    'button[type="submit"]',
    'button[type="button"]'
  ];

  for (const sel of validSelectors) {
    try {
      const btn = await page.$(sel);
      if (btn) {
        const isVisible = await page.evaluate(el => {
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).visibility !== 'hidden';
        }, btn).catch(() => false);

        if (isVisible) {
          await smartClick(btn);
          return true;
        }
      }
    } catch (e) {}
  }

  // If not clicked by selector, search by button text
  const textClicked = await clickElementByText(page, 'button, [role="button"], div[role="button"]', [
    'next', 'পরবর্তী', 'continue', 'চালিয়ে যান', 'sign in', 'সাইন ইন'
  ]);
  if (textClicked) return true;

  // Fallback: Enter key
  await page.keyboard.press('Enter');
  return true;
}

async function handleConsentIfPresent() {
  try {
    await clickElementByText(currentTab, 'button, [role="button"]', [
      'accept all', 'i agree', 'stay signed out', 'সবগুলি গ্রহণ করুন', 'আমি সম্মত'
    ]);
  } catch (e) {
    // Ignore
  }
}

async function handleLandingPageIfPresent() {
  await syncActiveTab();
  const currentUrl = currentTab.url();
  
  if (currentUrl.includes('workspace.google.com') || currentUrl.includes('google.com/gmail/about')) {
    console.log('\n📄 Gmail-এর ল্যান্ডিং পেজ (workspace.google.com) পাওয়া গেছে!');
    console.log('👉 ওপরের "Sign in" বাটনে ghost-cursor দিয়ে ক্লিক করা হচ্ছে...');

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
      clicked = await clickElementByText(currentTab, 'a, button', ['sign in', 'সাইন ইন']);
    }

    if (!clicked) {
      await currentTab.goto('https://accounts.google.com/signin/v2/identifier?service=mail', { waitUntil: 'networkidle2' });
    }

    await sleep(3500);
    await syncActiveTab();
  }
}

async function handleGooglePostLoginPrompts() {
  try {
    const clicked = await clickElementByText(currentTab, 'button, [role="button"], a', [
      'not now', 'এখন নয়', 'cancel', 'বাতিল', 'confirm', 'নিশ্চিত করুন', 'done', 'continue', 'চালিয়ে যান'
    ]);
    if (clicked) {
      console.log('👉 Google অতিরিক্ত নোটিশ ("Not now / Continue") স্কিপ করছে...');
      await sleep(2000);
    }
  } catch (e) {
    // Ignore
  }
}

async function dismissGmailOnboarding() {
  try {
    await clickElementByText(currentTab, 'button, [role="button"], div[role="button"]', [
      'got it', 'next', 'done', 'পরবর্তী', 'ঠিক আছে'
    ]);
  } catch (e) {
    // Ignore
  }
}


async function naturalBrowseToGmail() {
  const strategies = ['search', 'search', 'homepage', 'direct'];
  const chosenStrategy = strategies[Math.floor(Math.random() * strategies.length)];

  console.log(`\n🧭 ব্রাউজিং কৌশল (Strategy): [${chosenStrategy.toUpperCase()}]`);

  if (chosenStrategy === 'search') {
    console.log('[2/6] 🔍 google.com-এ গিয়ে মানুষের মতো সার্চ করা হচ্ছে...');
    await currentTab.goto('https://www.google.com', { waitUntil: 'networkidle2', timeout: 60000 });
    await handleConsentIfPresent();

    await sleep(gaussianRandom(1800, 300));
    await humanWanderMouse(currentCursor);

    const searchPhrases = ['gmail login', 'gmail', 'google mail', 'gmail sign in'];
    const query = searchPhrases[Math.floor(Math.random() * searchPhrases.length)];

    const searchBox = await currentTab.waitForSelector('textarea[name="q"], input[name="q"]', { timeout: 15000 });
    console.log(`⌨️  সার্চ বক্সে টাইপ করা হচ্ছে: "${query}"...`);
    
    await smartClick(searchBox);
    await sleep(gaussianRandom(400, 80));
    await humanType(currentTab, query, { canMakeMistakes: true, typoChance: 0.10 });
    
    await sleep(gaussianRandom(900, 150));
    console.log('👉 Enter চেপে সার্চ ফলাফল আনা হচ্ছে...');
    await currentTab.keyboard.press('Enter');

    await currentTab.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
    await sleep(gaussianRandom(2200, 400));

    console.log('📜 সার্চ রেজাল্ট ব্রাউজ করা হচ্ছে...');
    await humanScroll(currentTab, randomBetween(180, 320));
    await sleep(gaussianRandom(1200, 200));
    await humanWanderMouse(currentCursor);
    await humanScroll(currentTab, -randomBetween(60, 120));
    await sleep(gaussianRandom(1000, 200));

    console.log('🎯 Gmail-এর অফিশিয়াল রেজাল্ট লিঙ্কে ক্লিক করা হচ্ছে...');
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
    console.log('[2/6] 🏠 google.com হোমপেজে গিয়ে ওপরের "Sign in" বাটনে ক্লিক করা হচ্ছে...');
    await currentTab.goto('https://www.google.com', { waitUntil: 'networkidle2', timeout: 60000 });
    await handleConsentIfPresent();

    await sleep(gaussianRandom(1800, 300));
    await humanWanderMouse(currentCursor);

    const signinBtn = await currentTab.$('a[href*="accounts.google.com/ServiceLogin"], a[href*="accounts.google.com"]');
    if (signinBtn) {
      await smartClick(signinBtn);
    } else {
      const clicked = await clickElementByText(currentTab, 'a, button', ['sign in', 'সাইন ইন']);
      if (!clicked) {
        await currentTab.goto('https://accounts.google.com/signin/v2/identifier?service=mail', { waitUntil: 'networkidle2' });
      }
    }

  } else {
    console.log('[2/6] 🌐 সরাসরি mail.google.com এ প্রবেশ করা হচ্ছে...');
    await currentTab.goto('https://mail.google.com', { waitUntil: 'networkidle2', timeout: 60000 });
  }

  await sleep(gaussianRandom(2500, 400));
  await syncActiveTab();
  await handleLandingPageIfPresent();
}

/* ==========================================================================
   5.1. TWO-FACTOR AUTHENTICATION (2FA) & BACKUP CODE HANDLER
   ========================================================================== */

/**
 * Checks whether current screen is the actual 8-digit backup code screen (and NOT the g.co/sc security code screen)
 */
async function isActualBackupCodePage(page) {
  try {
    const url = page.url();
    // If URL is challenge selection, it is the list page, NOT the input page
    if (url.includes('/challenge/selection') || url.includes('/selection')) {
      return false;
    }

    const hasInput = await page.evaluate(() => {
      const direct = document.querySelector('input#backupCodePin, input[name="backupCode"], input[autocomplete="one-time-code"]');
      if (direct) return true;

      const anyInput = document.querySelector('input[type="tel"], input[type="text"]');
      if (!anyInput) return false;

      const text = (document.body.innerText || '').toLowerCase();
      const mentionsBackup = (text.includes('backup') || text.includes('৮-সংখ্যার') || text.includes('৮ ডিজিট') || text.includes('ব্যাকআপ')) &&
                             (text.includes('code') || text.includes('8-digit') || text.includes('কোড') || text.includes('digit'));
      const notSc = !text.includes('g.co/sc') && !text.includes('get your security code');

      return mentionsBackup && notSc;
    }).catch(() => false);

    return hasInput;
  } catch (e) {
    return false;
  }
}

/**
 * Clicks the "Try another way" button on Google 2FA challenge screens using real physical mouse events
 */
async function clickTryAnotherWay(page) {
  try {
    console.log('🔍 "Try another way" (অন্য উপায়ে চেষ্টা করুন) বাটন খোঁজা হচ্ছে...');

    // Bug fix: page.$x() is deprecated in Puppeteer v22+. Use '::-p-xpath()' CSS extension instead.
    // Method 1: XPath queries via modern Puppeteer API
    const xpathQueries = [
      "::-p-xpath(//button[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'try another')])",
      "::-p-xpath(//a[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'try another')])",
      "::-p-xpath(//div[@role='button'][contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'try another')])",
      "::-p-xpath(//span[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'try another')]/ancestor::button)",
      "::-p-xpath(//span[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'try another')]/ancestor::div[@role='button'])",
      "::-p-xpath(//button[contains(., 'অন্য')])",
      "::-p-xpath(//a[contains(., 'অন্য')])",
      "::-p-xpath(//div[@role='button'][contains(., 'অন্য')])",
      "::-p-xpath(//span[contains(., 'অন্য')]/ancestor::button)",
      "::-p-xpath(//span[contains(., 'অন্য')]/ancestor::div[@role='button'])",
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

    // Method 2: evaluateHandle (DOM search fallback)
    if (!targetElement) {
      const handle = await page.evaluateHandle(() => {
        const candidates = Array.from(document.querySelectorAll('button, a, [role="button"], span, [data-secondary-action-label]'));
        for (const el of candidates) {
          const t = (el.innerText || el.textContent || '').toLowerCase().trim();
          const aria = (el.getAttribute('aria-label') || '').toLowerCase();
          // Bug fix: removed duplicate 'অন্য উপায়ে' check
          if (
            t.includes('try another') ||
            t.includes('another way') ||
            t.includes('অন্য উপায়ে') ||
            t.includes('অন্য উপায়') ||
            aria.includes('try another') ||
            aria.includes('অন্য উপায়ে') ||
            aria.includes('অন্য উপায়')
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

    // Method 3: Standard CSS selectors
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
      console.log('⚠️ "Try another way" বাটনটি পেজে সরাসরি পাওয়া যায়নি। স্ক্রিনশট নেওয়া হচ্ছে: debug_try_another_way.png');
      await page.screenshot({ path: 'debug_try_another_way.png' }).catch(() => {});
      return false;
    }

    console.log('🎯 "Try another way" বাটন পাওয়া গেছে! ফিজিক্যাল CDP মাউস ক্লিক পাঠানো হচ্ছে...');

    // 1. Scroll into view
    await targetElement.evaluate(el => el.scrollIntoView({ behavior: 'auto', block: 'center' })).catch(() => {});
    await sleep(250);

    // 2. Physical hardware-level CDP click
    const box = await targetElement.boundingBox();
    if (box) {
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;

      if (currentCursor) {
        await currentCursor.moveTo({ x: cx, y: cy }).catch(() => {});
      }
      await page.mouse.move(cx, cy, { steps: 5 });
      await sleep(100);
      await page.mouse.down();
      await sleep(80);
      await page.mouse.up();
      console.log(`🖱️ স্থানাঙ্কে (${Math.round(cx)}, ${Math.round(cy)}) ফিজিক্যাল মাউস ক্লিক কার্যকর হয়েছে!`);
    }

    // 3. Dispatch DOM events
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

    // 4. Puppeteer click & smartClick
    await targetElement.click().catch(() => {});
    await smartClick(targetElement).catch(() => {});

    console.log('✅ "Try another way" বাটনে ক্লিক সম্পন্ন হয়েছে!');
    return true;
  } catch (e) {
    console.log('⚠️ clickTryAnotherWay ত্রুটি:', e.message);
    return false;
  }
}

/**
 * Finds the "Enter one of your 8-digit backup codes" element handle in Puppeteer
 */
async function getBackupCodeOptionHandle(page) {
  // Bug fix: page.$x() is deprecated in Puppeteer v22+. Use '::-p-xpath()' CSS extension instead.
  // Method 1: XPath search via modern Puppeteer API
  const xpathQueries = [
    "::-p-xpath(//li[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'backup')])",
    "::-p-xpath(//div[@data-challengetype='8'])",
    "::-p-xpath(//li[@data-challengetype='8'])",
    "::-p-xpath(//div[@role='link'][contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'backup')])",
    "::-p-xpath(//div[@role='button'][contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'backup')])",
    "::-p-xpath(//*[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '8-digit')])",
    "::-p-xpath(//*[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'backup code')])",
    "::-p-xpath(//*[contains(., '৮-সংখ্যার')])",
    "::-p-xpath(//*[contains(., '৮ ডিজিট')])",
    "::-p-xpath(//*[contains(., 'ব্যাকআপ কোড')])",
    "::-p-xpath(//*[contains(., 'ব্যাকআপ')])"
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

  // Method 2: evaluateHandle
  const handle = await page.evaluateHandle(() => {
    // 1. Search challenge list containers
    const candidates = Array.from(document.querySelectorAll('li, div[role="link"], div[role="button"], div[data-challengetype], [data-challengeindex]'));
    for (const el of candidates) {
      const text = (el.innerText || el.textContent || '').toLowerCase();
      if (
        text.includes('backup') ||
        text.includes('8-digit') ||
        text.includes('৮-সংখ্যার') ||
        text.includes('৮ ডিজিট') ||
        text.includes('ব্যাকআপ')
      ) {
        return el;
      }
    }

    // 2. Search leaf text nodes and return clickable parent
    const all = Array.from(document.querySelectorAll('span, div, p, h2, h3'));
    for (const el of all) {
      const text = (el.innerText || el.textContent || '').toLowerCase().trim();
      if (
        (text.includes('backup') || text.includes('8-digit') || text.includes('ব্যাকআপ') || text.includes('৮-সংখ্যার')) &&
        text.length < 120
      ) {
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
async function selectBackupCodeOption(page) {
  console.log('🔍 ভেরিফিকেশন তালিকা থেকে "Enter one of your 8-digit backup codes" অপশন খোঁজা হচ্ছে...');

  for (let attempt = 1; attempt <= 10; attempt++) {
    await sleep(800);

    const optionHandle = await getBackupCodeOptionHandle(page);
    if (optionHandle) {
      console.log(`🎯 [চেষ্টা ${attempt}] ব্যাকআপ কোড অপশন পাওয়া গেছে! স্বয়ংক্রিয়ভাবে ক্লিক করা হচ্ছে...`);

      // 1. Scroll into view
      await optionHandle.evaluate(el => el.scrollIntoView({ behavior: 'auto', block: 'center' })).catch(() => {});
      await sleep(250);

      // 2. Physical hardware-level CDP mouse click at coordinates
      const box = await optionHandle.boundingBox();
      if (box) {
        const x = box.x + box.width / 2;
        const y = box.y + box.height / 2;

        if (currentCursor) {
          await currentCursor.moveTo({ x, y }).catch(() => {});
        }
        await page.mouse.move(x, y, { steps: 5 });
        await sleep(100);
        await page.mouse.down();
        await sleep(80);
        await page.mouse.up();
        console.log(`🖱️ স্থানাঙ্কে (${Math.round(x)}, ${Math.round(y)}) ফিজিক্যাল ক্লিক পাঠানো হয়েছে!`);
      }

      // 3. Dispatch full DOM events
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

      // 4. Try smartClick & native click
      await smartClick(optionHandle).catch(() => {});
      await optionHandle.click().catch(() => {});

      // 5. Check if page navigated to backup code page
      await sleep(2500);

      const isNavigated = await isActualBackupCodePage(page);
      if (isNavigated) {
        console.log('✅ "Enter one of your 8-digit backup codes" অপশনে ক্লিক সফল এবং ব্যাকআপ পেজ ওপেন হয়েছে!');
        return true;
      } else {
        console.log('⏳ এখনও ব্যাকআপ পেজ লোড হয়নি, পুনরায় চেষ্টা করা হচ্ছে...');
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

/* ==========================================================================
   6. SMART PAGE-AWARE GOOGLE LOGIN & DECISION ENGINE
   ========================================================================== */

function promptUser(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise(resolve => rl.question(query, ans => {
    rl.close();
    resolve(ans.trim());
  }));
}

async function detectCurrentPageStatus(page, targetEmail) {
  try {
    const url = page.url();
    
    // 1. Check if already logged in (Gmail Inbox or Google Account logged in)
    const isLoggedIn = await page.evaluate(() => {
      const u = window.location.href;
      
      if (u.includes('mail.google.com/mail')) {
        const hasCompose = !!document.querySelector('div[gh="cm"], [data-tooltip*="Compose"], [aria-label*="Compose"], [aria-label*="কম্পোজ"]');
        const hasSearch = !!document.querySelector('input[name="q"], form[role="search"]');
        if (hasCompose || hasSearch) return true;
      }

      const hasAccountAvatar = !!document.querySelector('a[aria-label*="Google Account"], a[aria-label*="গুগল অ্যাকাউন্ট"], a[href*="SignOutOptions"]');
      if (hasAccountAvatar && !u.includes('/signin/') && !u.includes('/challenge/')) {
        return true;
      }

      if (u.includes('myaccount.google.com') && !u.includes('/signin/')) {
        return true;
      }

      return false;
    });

    if (isLoggedIn) {
      return { type: 'LOGGED_IN', description: 'লগইন সম্পূর্ণ (Inbox বা Google Account সক্রিয়)' };
    }

    // 2. Check CAPTCHA
    const hasCaptcha = await page.evaluate(() => {
      const text = (document.body.innerText || '').toLowerCase();
      const hasRobot = text.includes('confirm you’re not a robot') || text.includes('confirm you are not a robot') || text.includes('রোবট নন');
      const hasRecaptcha = !!document.querySelector('#captcha, iframe[src*="recaptcha"]');
      return hasRobot || hasRecaptcha;
    });

    if (hasCaptcha) {
      return { type: 'CAPTCHA', description: 'ক্যাপচা চ্যালেঞ্জ পেজ' };
    }

    // 3. PRIORITY 1: Check Password input FIRST!
    // Never click "Try another way" if a password field is visible on the screen!
    const isPasswordVisible = await page.evaluate(() => {
      const el = document.querySelector('input[name="Passwd"], input[name="password"], input[autocomplete="current-password"], input[type="password"]:not([name="hiddenPassword"])');
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      const isHidden = style.visibility === 'hidden' || style.display === 'none' || el.offsetParent === null || !!el.closest('[aria-hidden="true"]');
      return rect.width > 0 && rect.height > 0 && !isHidden;
    });

    if (isPasswordVisible) {
      return { type: 'PASSWORD_ENTRY', description: 'পাসওয়ার্ড ইনপুট পেজ' };
    }

    // 4. PRIORITY 2: Check Email / Identifier input
    const isEmailVisible = await page.evaluate(() => {
      // If password field is visible, it is NEVER email entry!
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
      return { type: 'EMAIL_ENTRY', description: 'ইমেইল ইনপুট পেজ' };
    }

    // 5. Check Account Chooser
    const hasAccountChooser = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('div[data-identifier], div[data-email], li[data-identifier]'));
      if (cards.length > 0) return true;
      const text = (document.body.innerText || '').toLowerCase();
      return text.includes('choose an account') || text.includes('একটি অ্যাকাউন্ট বেছে নিন');
    });

    if (hasAccountChooser) {
      return { type: 'ACCOUNT_CHOOSER', description: 'অ্যাকাউন্ট বাছাই পেজ' };
    }

    // 6. Check Post-Login Prompts / Interstitials ("Not now", "Confirm", "Stay signed in")
    const hasPostLoginPrompt = await page.evaluate(() => {
      const dismissTexts = ['not now', 'এখন নয়', 'confirm', 'নিশ্চিত করুন', 'done', 'continue', 'চালিয়ে যান'];
      const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
      for (const b of buttons) {
        const t = (b.innerText || b.textContent || '').trim().toLowerCase();
        if (dismissTexts.includes(t)) return true;
      }
      return false;
    });

    if (hasPostLoginPrompt && !url.includes('/challenge/')) {
      return { type: 'POST_LOGIN_PROMPT', description: 'অতিরিক্ত গুগল প্রম্পট (Not now / Confirm)' };
    }

    // 7. Check 2FA Challenge screens (Security code, g.co/sc, backup code, options list)
    // ONLY checked after password and email inputs have been ruled out!
    const challengeInfo = await page.evaluate(() => {
      const u = window.location.href;
      const text = (document.body.innerText || '').toLowerCase();
      
      const hasBackupInput = !!document.querySelector('input#backupCodePin, input[name="backupCode"]');
      const mentionsBackup = text.includes('backup') || text.includes('৮-সংখ্যার') || text.includes('৮ ডিজিট') || text.includes('ব্যাকআপ');
      
      // Step A: Are we on the Challenge Selection page?
      const isSelectionUrl = u.includes('/challenge/selection') || u.includes('/selection');
      const hasMultipleChallenges = Array.from(document.querySelectorAll('li, div[role="link"], div[role="button"]')).some(el => {
        const t = (el.innerText || el.textContent || '').toLowerCase();
        return (t.includes('backup') || t.includes('৮-সংখ্যার') || t.includes('ব্যাকআপ')) && (t.includes('code') || t.includes('কোড'));
      });
      const mentionsChooseWay = text.includes('choose how you want to sign in') || text.includes('বাছাই করুন') || text.includes('অন্য উপায়ে');

      if (isSelectionUrl || (mentionsBackup && hasMultipleChallenges && !hasBackupInput) || (mentionsChooseWay && mentionsBackup)) {
        return '2FA_OPTIONS_LIST';
      }

      // Step B: Are we on the Backup Code input page?
      const anyInput = !!document.querySelector('input#backupCodePin, input[name="backupCode"], input[autocomplete="one-time-code"], input[type="tel"], input[type="text"]');
      if (hasBackupInput || (mentionsBackup && !isSelectionUrl && anyInput && (text.includes('8-digit') || text.includes('৮-সংখ্যার') || text.includes('৮ ডিজিট') || text.includes('backup code')))) {
        return '2FA_BACKUP_INPUT';
      }

      // Step C: Security Code (g.co/sc) page
      if (text.includes('g.co/sc') || text.includes('get your security code') || text.includes('security code') || text.includes('নিরাপত্তা কোড')) {
        return '2FA_G_CO_SC';
      }

      // Step D: Any other 2FA challenge
      const hasTryAnotherWay = Array.from(document.querySelectorAll('button, a, [role="button"]')).some(b => {
        const t = (b.innerText || b.textContent || '').toLowerCase();
        return t.includes('try another way') || t.includes('অন্য উপায়ে') || t.includes('অন্য উপায়');
      });

      if (hasTryAnotherWay || u.includes('/challenge/')) {
        return '2FA_OTHER';
      }

      return null;
    });

    if (challengeInfo === '2FA_OPTIONS_LIST') {
      return { type: '2FA_OPTIONS_LIST', description: 'ভেরিফিকেশন বিকল্প তালিকা পেজ' };
    }
    if (challengeInfo === '2FA_BACKUP_INPUT') {
      return { type: '2FA_BACKUP_INPUT', description: '৮-ডিজিটের ব্যাকআপ কোড ইনপুট পেজ' };
    }
    if (challengeInfo === '2FA_G_CO_SC') {
      return { type: '2FA_G_CO_SC', description: 'সিকিউরিটি কোড (g.co/sc) পেজ -> Try another way' };
    }
    if (challengeInfo === '2FA_OTHER' || url.includes('/challenge/')) {
      return { type: '2FA_OTHER', description: 'টু-স্টেপ ভেরিফিকেশন পেজ -> Try another way' };
    }

    // 8. Landing pages
    if (url.includes('workspace.google.com') || url.includes('gmail/about')) {
      return { type: 'LANDING_PAGE', description: 'Gmail ল্যান্ডিং পেজ' };
    }

    return { type: 'UNKNOWN', description: `পেজ ইউআরএল: ${url}` };
  } catch (e) {
    return { type: 'UNKNOWN', description: 'পেজ লোড হচ্ছে...' };
  }
}

async function ensureGoogleLoggedIn(email, password, getBackupCode) {
  // 1. Natural entry to Google
  await naturalBrowseToGmail();
  await syncActiveTab();
  await handleLandingPageIfPresent();
  await syncActiveTab();

  console.log('\n🧠 [স্মার্ট পেজ-ডিটেক্টর ও ডিসিশন ইঞ্জিন সক্রিয় হয়েছে]...');

  let loggedIn = false;
  let loopStartTime = Date.now();
  const maxSessionTimeMs = 300000; // 5 mins max

  while (!loggedIn && (Date.now() - loopStartTime < maxSessionTimeMs)) {
    await syncActiveTab();
    const pageStatus = await detectCurrentPageStatus(currentTab, email);
    
    console.log(`\n📍 [পেজ ডিটেকশন]: [${pageStatus.type}] -> ${pageStatus.description}`);

    switch (pageStatus.type) {
      case 'LOGGED_IN': {
        console.log('🎉 [পেজ সিদ্ধান্ত] চমৎকার! অ্যাকাউন্ট ইতিমধ্যে সফলভাবে লগইন সম্পন্ন হয়েছে!');
        console.log('⏩ পাসওয়ার্ড বা 2FA-এর পরবর্তী কোনো অপ্রয়োজনীয় স্টেপে যাওয়ার প্রয়োজন নেই।');
        loggedIn = true;
        break;
      }

      case 'LANDING_PAGE': {
        console.log('👉 [পেজ সিদ্ধান্ত] ল্যান্ডিং পেজে আছি, "Sign in" বাটনে ক্লিক করছি...');
        await handleLandingPageIfPresent();
        await sleep(2500);
        break;
      }

      case 'ACCOUNT_CHOOSER': {
        // Bug fix: {} block scope prevents lexical declaration errors in switch-case
        console.log('👉 [পেজ সিদ্ধান্ত] অ্যাকাউন্ট লিস্ট পেজে আছি...');
        const accountCard = await currentTab.$(`div[data-identifier="${email}"], div[data-email="${email}"]`);
        if (accountCard) {
          console.log(`👉 সংরক্ষিত তালিকা থেকে "${email}" অ্যাকাউন্টে ক্লিক করা হচ্ছে...`);
          await smartClick(accountCard);
        } else {
          console.log('👉 "Use another account" এ ক্লিক করা হচ্ছে...');
          const useAnother = await currentTab.$('#identifierLink');
          if (useAnother) {
            await smartClick(useAnother);
          } else {
            await clickElementByText(currentTab, 'button, [role="button"], li', ['use another account', 'অন্য একটি অ্যাকাউন্ট']);
          }
        }
        await sleep(2500);
        break;
      }

      case 'EMAIL_ENTRY': {
        // Bug fix: {} block scope prevents lexical declaration errors in switch-case
        console.log(`✉️ [পেজ সিদ্ধান্ত] ইমেইল পেজ। "${email}" টাইপ করে Next চাপছি...`);
        const emailInput = await currentTab.$('#identifierId, input[name="identifier"], input[type="email"]');
        if (emailInput) {
          await emailInput.evaluate(el => {
            el.focus();
            el.value = '';
          }).catch(() => {});
          await smartClick(emailInput);
          await sleep(250);

          // Clear field before typing
          await currentTab.keyboard.down('Control');
          await currentTab.keyboard.press('KeyA');
          await currentTab.keyboard.up('Control');
          await currentTab.keyboard.press('Backspace');
          await sleep(200);

          console.log(`⌨️  ইমেইল টাইপ করা হচ্ছে: ${email}`);
          await humanType(currentTab, email, { canMakeMistakes: false });
          await sleep(1000);

          console.log('👉 Next বাটনে ক্লিক করা হচ্ছে...');
          await clickGoogleNext(currentTab, 'identifierNext');
        }
        await sleep(3500);
        break;
      }

      case 'PASSWORD_ENTRY': {
        // Bug fix: {} block scope prevents lexical declaration errors in switch-case
        console.log('🔒 [পেজ সিদ্ধান্ত] পাসওয়ার্ড পেজ। ফিল্ড পরিষ্কার করে শুধুমাত্র পাসওয়ার্ড টাইপ করছি...');
        const passInput = await currentTab.$('input[name="Passwd"], input[name="password"], input[autocomplete="current-password"], input[type="password"]:not([name="hiddenPassword"])');
        if (passInput) {
          // Explicitly focus and clear password input so nothing like email is typed in it
          await passInput.evaluate(el => {
            el.focus();
            el.value = '';
          }).catch(() => {});
          await smartClick(passInput);
          await sleep(250);

          // Full clear using Ctrl+A and Backspace
          await currentTab.keyboard.down('Control');
          await currentTab.keyboard.press('KeyA');
          await currentTab.keyboard.up('Control');
          await currentTab.keyboard.press('Backspace');
          await sleep(200);

          console.log('⌨️  শুধু পাসওয়ার্ড টাইপ করা হচ্ছে...');
          await humanType(currentTab, password, { canMakeMistakes: false });
          await sleep(1000);

          console.log('👉 Next বাটনে ক্লিক করে পাসওয়ার্ড সাবমিট করা হচ্ছে...');
          await clickGoogleNext(currentTab, 'passwordNext');
        }
        console.log('⏳ পাসওয়ার্ড সাবমিট হয়েছে। গুগল সরাসরি লগইন করলো নাকি সিকিউরিটি কোড (2FA) চাইল তা যাচাই করছি...');
        await sleep(4000);
        break;
      }

      case 'POST_LOGIN_PROMPT': {
        console.log('👉 [পেজ সিদ্ধান্ত] গুগল অতিরিক্ত প্রম্পট দেখাচ্ছে। "Not now / Continue" স্কিপ করছি...');
        await handleGooglePostLoginPrompts();
        await sleep(2000);
        break;
      }

      case '2FA_G_CO_SC':
      case '2FA_OTHER': {
        console.log('🛡️ [পেজ সিদ্ধান্ত] ২-স্টেপ ভেরিফিকেশন পেজ (g.co/sc বা প্রম্পট)। "Try another way" এ ক্লিক করছি...');
        const tryClicked = await clickTryAnotherWay(currentTab);
        if (tryClicked) {
          console.log('⏳ "Try another way" এ ক্লিক পাঠানো হয়েছে। বিকল্প তালিকার অপেক্ষা করা হচ্ছে...');
          // Wait up to 6 seconds for page to transition away from 2FA_G_CO_SC
          for (let waitSec = 0; waitSec < 6; waitSec++) {
            await sleep(1000);
            await syncActiveTab();
            const nextStatus = await detectCurrentPageStatus(currentTab, email);
            if (nextStatus.type !== '2FA_G_CO_SC' && nextStatus.type !== '2FA_OTHER') {
              break;
            }
          }
        } else {
          console.log('⚠️ "Try another way" বাটন পাওয়া যায়নি। ২.৫ সেকেন্ড অপেক্ষা করছি...');
          await sleep(2500);
        }
        break;
      }

      case '2FA_OPTIONS_LIST': {
        console.log('📋 [পেজ সিদ্ধান্ত] বিকল্প ভেরিফিকেশন তালিকা। "Enter one of your 8-digit backup codes" সিলেক্ট করছি...');
        const optionClicked = await selectBackupCodeOption(currentTab);
        if (optionClicked) {
          console.log('⏳ ব্যাকআপ কোড ইনপুট পেজ লোড হওয়ার অপেক্ষা করা হচ্ছে...');
          for (let waitSec = 0; waitSec < 6; waitSec++) {
            await sleep(1000);
            await syncActiveTab();
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
        console.log('🔢 [পেজ সিদ্ধান্ত] ব্যাকআপ কোড ইনপুট পেজ। ৮ সংখ্যার ব্যাকআপ কোড বসাচ্ছি...');
        const rawCode = await getBackupCode();
        if (rawCode) {
          const clean = rawCode.replace(/[\s-]/g, '');
          console.log(`⌨️  ৮ ডিজিটের ব্যাকআপ কোড টাইপ করা হচ্ছে (${clean.length} সংখ্যা)...`);
          const field = await findBackupCodeInput(currentTab);
          if (field) {
            await smartClick(field);
            await sleep(250);

            // Clear field before typing
            await currentTab.keyboard.down('Control');
            await currentTab.keyboard.press('KeyA');
            await currentTab.keyboard.up('Control');
            await currentTab.keyboard.press('Backspace');
            await sleep(200);

            await humanType(currentTab, clean, { canMakeMistakes: false });
            await sleep(1000);

            console.log('👉 Next বাটনে ক্লিক করে ব্যাকআপ কোড সাবমিট করা হচ্ছে...');
            await clickGoogleNext(currentTab, 'backupCodeNext');
            await sleep(4000);
          }
        } else {
          console.log('⚠️ কোনো ব্যাকআপ কোড পাওয়া যায়নি!');
          await sleep(3000);
        }
        break;
      }

      case 'CAPTCHA': {
        console.log('\n⚠️ [পেজ সিদ্ধান্ত] ক্যাপচা এসেছে। সমাধান করার জন্য অপেক্ষা করছি...');
        await sleep(5000);
        break;
      }

      default:
        // If on accounts.google.com root, redirect to sign-in
        if (!currentTab.url().includes('accounts.google.com') && !currentTab.url().includes('mail.google.com')) {
          console.log('👉 Google Sign-in পেজে নিয়ে যাওয়া হচ্ছে...');
          await currentTab.goto('https://accounts.google.com/signin/v2/identifier?service=mail', { waitUntil: 'networkidle2' });
        }
        await sleep(2500);
        break;
    }
  }

  return loggedIn;
}

/* ==========================================================================
   7. MAIN ENTRYPOINT (GOOGLE MAPS FAKE REVIEW REPORTER)
   ========================================================================== */

async function main() {
  console.log('\n===============================================================');
  console.log('       📍 GOOGLE MAPS AUTO FAKE REVIEW REPORTER AGENT          ');
  console.log('  (Pure Chrome Anti-Detect + Google Login + ghost-cursor)      ');
  console.log('===============================================================\n');

  let email = process.env.GOOGLE_EMAIL;
  let password = process.env.GOOGLE_PASSWORD;
  let backupCode = process.env.GOOGLE_BACKUP_CODE;
  let reviewUrl = process.env.MAPS_REVIEW_URL || DEFAULT_MAPS_URL;
  const reportReason = process.env.MAPS_REPORT_REASON || 'spam';

  // Bug fix: removed `backupCodeUsed` flag — it was declared but never set to true.
  // Backup codes are now consumed sequentially from the comma-separated list.
  async function getBackupCode() {
    if (backupCode) {
      const list = backupCode.split(',').map(s => s.trim()).filter(Boolean);
      if (list.length > 0) {
        const selected = list[0];
        // Consume this code from the list for the next call
        backupCode = list.slice(1).join(',');
        console.log(`🔑 ব্যাকআপ কোড ব্যবহার করা হচ্ছে (বাকি: ${list.length - 1}টি)`);
        return selected;
      }
    }
    return await promptUser('\n👉 Google 2FA ৮ ডিজিটের ব্যাকআপ কোড (8-digit Backup Code) দিন: ');
  }

  // Ask for review URL only if not in .env
  if (!process.env.MAPS_REVIEW_URL) {
    const enteredUrl = await promptUser(`👉 Google Maps Review লিঙ্ক দিন (এন্টার চাপলে ডিফল্ট "${DEFAULT_MAPS_URL}" ব্যবহার হবে): `);
    if (enteredUrl) reviewUrl = enteredUrl;
  }

  console.log('\n🌐 Google Chrome চালু করা হচ্ছে (Stealth ও Session সহ)...');

  const sessionPath = path.join(__dirname, 'chrome_session');

  browserInstance = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    userDataDir: sessionPath,
    headless: false,
    defaultViewport: null,
    ignoreDefaultArgs: ['--enable-automation'],
    args: [
      '--start-maximized',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-infobars',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process'
    ]
  });

  const pages = await browserInstance.pages();
  currentTab = pages.length > 0 ? pages[0] : await browserInstance.newPage();
  currentCursor = createCursor(currentTab);

  await applyDeepStealth(currentTab);

  // Automatically switch tab if Chrome opens a new tab
  // Bug fix: Added try-catch and null check to prevent crash on race condition
  browserInstance.on('targetcreated', async (target) => {
    try {
      if (target.type() === 'page') {
        const newPage = await target.page().catch(() => null);
        if (newPage) {
          await sleep(1500);
          await syncActiveTab();
        }
      }
    } catch (e) {
      // Ignore tab creation errors (e.g., tab closed immediately)
    }
  });

  try {
    const hasCredentials = email && email !== 'your_email@gmail.com';

    if (hasCredentials) {
      console.log('\n┌─────────────────────────────────────────────────────────┐');
      console.log('│  🔐 ধাপ ১: Google অ্যাকাউন্ট যাচাই ও লগইন সুনিশ্চিতকরণ │');
      console.log('└─────────────────────────────────────────────────────────┘\n');
      console.log(`👤 ব্যবহারকারী: ${email}`);
      await ensureGoogleLoggedIn(email, password, getBackupCode);

      console.log('\n┌─────────────────────────────────────────────────────────┐');
      console.log('│  📍 ধাপ ২: গুগল ম্যাপস রিভিউ পেজ ও রিপোর্ট সাবমিশন     │');
      console.log('└─────────────────────────────────────────────────────────┘\n');
      await runMapsReporter({ page: currentTab, cursor: currentCursor, smartClick, sleep, reviewUrl, humanWanderMouse, humanScroll });

    } else {
      console.log('\n┌─────────────────────────────────────────────────────────┐');
      console.log('│  🌐 সংরক্ষিত সেশন (Session Only) দিয়ে সরাসরি রিপোর্ট   │');
      console.log('└─────────────────────────────────────────────────────────┘\n');
      await runMapsReporter({ page: currentTab, cursor: currentCursor, smartClick, sleep, reviewUrl, humanWanderMouse, humanScroll });
    }

    console.log('\nTask completed successfully!');
    console.log('Browser will close in 15 seconds...');
    await sleep(15000);


  } catch (error) {
    console.error('\n❌ ত্রুটি দেখা দিয়েছে:', error.message);
    console.log('স্ক্রিনশট সংরক্ষণ করা হচ্ছে: error_screenshot.png');
    if (currentTab) {
      await currentTab.screenshot({ path: 'error_screenshot.png', fullPage: true }).catch(() => {});
    }
  } finally {
    if (browserInstance) {
      await browserInstance.close();
      console.log('👋 ব্রাউজার বন্ধ করা হয়েছে।');
    }
  }
}

main();
