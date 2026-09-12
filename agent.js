require('dotenv').config();
const readline = require('readline');
const path = require('path');
// Use rebrowser-puppeteer-core for 0-CDP leak anti-detection
const puppeteer = require('rebrowser-puppeteer-core');
const { createCursor } = require('ghost-cursor');

/* ==========================================================================
   1. MATHEMATICAL & BIOMETRIC HUMAN MOTOR DYNAMICS
   ========================================================================== */

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Normal (Gaussian) distribution for realistic human reaction times (Box-Muller)
 */
function gaussianRandom(mean, stdDev) {
  let u = 1 - Math.random();
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
async function naturalKeyPress(page, char) {
  const isUppercase = char !== char.toLowerCase() && char.toUpperCase() === char;
  
  if (isUppercase) {
    await page.keyboard.down('Shift');
    await sleep(randomBetween(60, 120));
  }

  await page.keyboard.press(char, { delay: gaussianRandom(95, 20) });

  if (isUppercase) {
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

async function handleConsentIfPresent() {
  try {
    const candidates = [
      'button:has-text("Accept all")',
      'button:has-text("I agree")',
      'button:has-text("Stay signed out")',
      'button[aria-label*="Accept"]',
      'div[role="none"] button'
    ];
    for (const sel of candidates) {
      const btn = await currentTab.$(sel);
      if (btn) {
        await smartClick(btn);
        await sleep(1500);
        break;
      }
    }
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
      'a.button--medium',
      'a:has-text("Sign in")'
    ];

    let clicked = false;
    for (const sel of signinSelectors) {
      const btn = await currentTab.$(sel);
      if (btn) {
        await smartClick(btn);
        clicked = true;
        break;
      }
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
    const dismissSelectors = [
      'button:has-text("Not now")',
      'button:has-text("এখন নয়")',
      'button:has-text("Cancel")',
      'button:has-text("Confirm")',
      'button:has-text("Done")',
      'button[aria-label*="Close"]'
    ];
    for (const sel of dismissSelectors) {
      const btn = await currentTab.$(sel);
      if (btn) {
        console.log('👉 Google অতিরিক্ত নোটিশ ("Not now") স্কিপ করছে...');
        await smartClick(btn);
        await sleep(2000);
        break;
      }
    }
  } catch (e) {
    // Ignore
  }
}

async function dismissGmailOnboarding() {
  try {
    const tourButtons = [
      'button[name="ok"]',
      'div[role="button"]:has-text("Got it")',
      'div[role="button"]:has-text("Next")',
      'button:has-text("Done")',
      'div[aria-label*="Close"]'
    ];
    for (const sel of tourButtons) {
      const btn = await currentTab.$(sel);
      if (btn) {
        await smartClick(btn);
        await sleep(1000);
      }
    }
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

    const signinBtn = await currentTab.$('a[href*="accounts.google.com/ServiceLogin"], a:has-text("Sign in"), a:has-text("সাইন ইন")');
    if (signinBtn) {
      await smartClick(signinBtn);
    } else {
      await currentTab.goto('https://accounts.google.com/signin/v2/identifier?service=mail', { waitUntil: 'networkidle2' });
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
   6. MAIN AGENT WORKFLOW
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

async function main() {
  console.log('\n===============================================================');
  console.log('       🤖 ULTRA ADVANCED HUMAN-LIKE GOOGLE EMAIL AGENT         ');
  console.log('  (Pure Chrome Anti-Detect + rebrowser CDP Masking + ghost-cursor) ');
  console.log('===============================================================\n');

  let email = process.env.GOOGLE_EMAIL;
  let password = process.env.GOOGLE_PASSWORD;
  let recipient = process.env.RECIPIENT_EMAIL;
  let subject = process.env.EMAIL_SUBJECT || 'Automated Message from Agent';
  let message = process.env.EMAIL_MESSAGE || 'Hello! This is an email sent with natural biometric human behavior.';

  if (!email || email === 'your_email@gmail.com') {
    email = await promptUser('👉 আপনার Google Email দিন: ');
  }
  if (!password || password === 'your_password_here') {
    password = await promptUser('👉 আপনার Google Password দিন: ');
  }
  if (!recipient || recipient === 'receiver@example.com') {
    recipient = await promptUser('👉 যাকে ইমেইল পাঠাবেন তার Email দিন: ');
  }
  if (!subject) {
    subject = await promptUser('👉 ইমেইল Subject লিখুন: ');
  }
  if (!message) {
    message = await promptUser('👉 ইমেইল Message লিখুন: ');
  }

  console.log('\n[1/6] 🌐 Google Chrome চালু করা হচ্ছে (অটোমেশন ব্যানার ও ফ্ল্যাগ সম্পূর্ণ মুক্ত)...');

  const sessionPath = path.join(__dirname, 'chrome_session');

  browserInstance = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    userDataDir: sessionPath,
    headless: false,
    defaultViewport: null,
    // CRITICAL: Remove '--enable-automation' flag so Chrome never declares itself as automated!
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
  browserInstance.on('targetcreated', async (target) => {
    if (target.type() === 'page') {
      const newPage = await target.page();
      if (newPage) {
        await sleep(1500);
        await syncActiveTab();
      }
    }
  });

  try {
    // 1. Natural entry to Google
    await naturalBrowseToGmail();
    await syncActiveTab();
    await handleLandingPageIfPresent();
    await syncActiveTab();

    // 2. Check if already logged in
    const isAlreadyLoggedIn = currentTab.url().includes('mail.google.com/mail') && (await currentTab.$('div[gh="cm"], [data-tooltip*="Compose"], [aria-label*="Compose"]'));

    if (isAlreadyLoggedIn) {
      console.log('⚡ আগের সংরক্ষিত সেশন পাওয়া গেছে! সরাসরি ইনবক্সে প্রবেশ করা হয়েছে!');
    } else {

      // Ensure we are on accounts.google.com
      if (!currentTab.url().includes('accounts.google.com') && !currentTab.url().includes('mail.google.com/mail')) {
        console.log('👉 Google Sign-in পেজে নিয়ে যাওয়া হচ্ছে...');
        await currentTab.goto('https://accounts.google.com/signin/v2/identifier?service=mail', {
          waitUntil: 'networkidle2',
          timeout: 60000
        });
        await sleep(2000);
      }

      // Check if "Choose an account" screen is shown
      const accountCard = await currentTab.$(`div[data-identifier="${email}"], div[data-email="${email}"]`);
      if (accountCard) {
        console.log(`👉 সংরক্ষিত অ্যাকাউন্ট তালিকা থেকে "${email}" কার্ডে ক্লিক করা হচ্ছে...`);
        await smartClick(accountCard);
        await sleep(gaussianRandom(2500, 400));
      } else {
        // Step 1: Type Email
        const emailSelector = '#identifierId, input[name="identifier"], input[type="text"]';
        let emailField = null;
        try {
          emailField = await currentTab.waitForSelector(emailSelector, { visible: true, timeout: 20000 });
        } catch (e) {
          emailField = await currentTab.$(emailSelector);
        }

        if (emailField) {
          console.log(`[3/6] ✉️  Email টাইপ করা হচ্ছে (টাইপো ও ব্যাকস্পেস সহ): ${email}`);
          
          await smartClick(emailField);
          await sleep(gaussianRandom(500, 100));

          await humanType(currentTab, email, { canMakeMistakes: true, typoChance: 0.08 });
          await sleep(gaussianRandom(1500, 300));

          console.log('👉 ghost-cursor দিয়ে Next বাটনে ক্লিক করা হচ্ছে...');
          const nextBtn = await currentTab.$('#identifierNext') || await currentTab.$('button[jsname="LgbsSe"]');
          if (nextBtn) {
            await smartClick(nextBtn);
          } else {
            await currentTab.keyboard.press('Enter');
          }
          await sleep(gaussianRandom(3000, 500));
        }
      }

      // Check for CAPTCHA challenge
      let pageText = await currentTab.evaluate(() => document.body.innerText).catch(() => '');
      if (pageText.includes('robot') || pageText.includes('CAPTCHA') || pageText.includes('Verify it’s you') || pageText.includes('Verify it\'s you')) {
        console.log('\n⚠️ ========================================================');
        console.log('👉 Google CAPTCHA ("Confirm you are not a robot") চেয়েছে!');
        console.log('👉 অনুগ্রহ করে ব্রাউজারে ক্যাপচায় টিক দিন বা সমাধান করুন।');
        console.log('👉 স্ক্রিপ্টটি আপনার জন্য ১২০ সেকেন্ড অপেক্ষা করছে...');
        console.log('========================================================\n');

        const passwordSelector = 'input[name="Passwd"], input[autocomplete="current-password"], input[type="password"]:not([name="hiddenPassword"])';
        try {
          await currentTab.waitForSelector(passwordSelector, { visible: true, timeout: 120000 });
          console.log('✅ ক্যাপচা সফল হয়েছে! এবার পাসওয়ার্ড টাইপ করা হচ্ছে...');
        } catch (e) {
          console.log('⏳ পাসওয়ার্ড ফিল্ড খুঁজছি...');
        }
      }

      // Step 2: Type Password
      const passwordSelector = 'input[name="Passwd"], input[autocomplete="current-password"], input[type="password"]:not([name="hiddenPassword"])';
      let passField = null;
      try {
        passField = await currentTab.waitForSelector(passwordSelector, { visible: true, timeout: 20000 });
      } catch (err) {
        passField = await currentTab.$(passwordSelector);
      }

      if (passField) {
        console.log('[4/6] 🔒 Password টাইপ করা হচ্ছে (ধীরে ধীরে মানুষের স্বাভাবিক ছন্দে)...');
        
        await sleep(gaussianRandom(1400, 300));
        await smartClick(passField);
        await sleep(gaussianRandom(500, 100));

        await humanType(currentTab, password, { canMakeMistakes: true, typoChance: 0.04 });
        await sleep(gaussianRandom(1400, 300));

        console.log('👉 ghost-cursor দিয়ে Password সাবমিট করা হচ্ছে...');
        const passwordNextBtn = await currentTab.$('#passwordNext') || await currentTab.$('#passwordNext button');
        if (passwordNextBtn) {
          await smartClick(passwordNextBtn);
        } else {
          await currentTab.keyboard.press('Enter');
        }
      }
    }

    console.log('\n⏳ Gmail লোড হওয়ার জন্য অপেক্ষা করা হচ্ছে...');

    // Step 3: Wait for Gmail inbox or 2FA challenge
    let loggedIn = false;
    const startTime = Date.now();
    const maxWaitMs = 120000;

    while (Date.now() - startTime < maxWaitMs) {
      await syncActiveTab();
      const currentUrl = currentTab.url();
      if (currentUrl.includes('mail.google.com/mail')) {
        loggedIn = true;
        break;
      }

      await handleGooglePostLoginPrompts();

      const bodyText = await currentTab.evaluate(() => document.body.innerText).catch(() => '');
      if (bodyText.includes('2-Step') || bodyText.includes('verification') || bodyText.includes('কোড') || bodyText.includes('ভেরিফিকেশন')) {
        console.log('⚠️  [2FA ALERT] মোবাইলে অনুমোদন কোড/প্রম্পট পাঠানো হয়েছে। মোবাইলে Allow করুন...');
      }

      await sleep(3000);
    }

    if (!loggedIn) {
      console.log('👉 ইনবক্স ইউআরএল-এ নিয়ে যাওয়া হচ্ছে...');
      await currentTab.goto('https://mail.google.com/mail/u/0/#inbox', { waitUntil: 'networkidle2', timeout: 60000 });
      await syncActiveTab();
    }

    // VERIFY COMPOSE BUTTON
    console.log('🔍 জিমেইল ইনবক্স ভেরিফাই করা হচ্ছে...');
    const composeSelectors = [
      'div[gh="cm"]',
      'div[role="button"][gh="cm"]',
      '[data-tooltip*="Compose"]',
      '[aria-label*="Compose"]',
      '[aria-label*="কম্পোজ"]'
    ];

    let composeBtn = null;
    for (let attempt = 0; attempt < 20; attempt++) {
      for (const sel of composeSelectors) {
        composeBtn = await currentTab.$(sel);
        if (composeBtn) break;
      }
      if (composeBtn) break;
      await sleep(2000);
    }

    if (!composeBtn) {
      throw new Error('জিমেইল ইনবক্স লোড হয়নি বা লগইন সম্পন্ন হয়নি। error_screenshot.png দেখুন।');
    }

    console.log('\n✅ Gmail সফলভাবে ওপেন হয়েছে এবং ইনবক্স ভেরিফাইড!');
    await dismissGmailOnboarding();

    // Human reading pause scanning Gmail inbox
    console.log('👀 ইনবক্স দেখা হচ্ছে (৩-৫ সেকেন্ড বিরতি)...');
    await sleep(gaussianRandom(3500, 500));
    await humanWanderMouse(currentCursor);

    // Step 4: Click Compose
    console.log('[5/6] 📝 Compose বাটনে ghost-cursor দিয়ে ক্লিক করা হচ্ছে...');
    await smartClick(composeBtn);
    console.log('👉 Compose উইন্ডো ওপেন হয়েছে।');

    await sleep(gaussianRandom(2800, 400));

    // Step 5: Fill "To" field
    console.log(`✉️  প্রাপক (Recipient) টাইপ করা হচ্ছে: ${recipient}`);
    const toSelectors = [
      'input[aria-label="To recipients"]',
      'input[aria-label*="To"]',
      'input[aria-label*="প্রতি"]',
      'input[peoplekit-id]',
      'input[role="combobox"]',
      'textarea[name="to"]'
    ];

    let toField = null;
    for (const selector of toSelectors) {
      toField = await currentTab.$(selector);
      if (toField) break;
    }

    if (toField) {
      await smartClick(toField);
    }
    await sleep(gaussianRandom(400, 80));
    await humanType(currentTab, recipient, { canMakeMistakes: true, typoChance: 0.05 });
    await sleep(gaussianRandom(400, 80));
    await currentTab.keyboard.press('Enter');

    await sleep(gaussianRandom(1500, 300));

    // Step 6: Fill Subject
    console.log(`📌 Subject টাইপ করা হচ্ছে (টাইপো ও সংশোধন সহ): ${subject}`);
    const subjectInput = await currentTab.$('input[name="subjectbox"]');
    if (subjectInput) {
      await smartClick(subjectInput);
    } else {
      await currentTab.keyboard.press('Tab');
    }
    await sleep(gaussianRandom(400, 80));
    await humanType(currentTab, subject, { canMakeMistakes: true, typoChance: 0.09 });

    await sleep(gaussianRandom(1500, 300));

    // Step 7: Fill Message Body
    console.log(`💬 Message টাইপ করা হচ্ছে (ধীরে ধীরে সংশোধন সহ): ${message}`);
    const bodySelectors = [
      'div[aria-label="Message Body"]',
      'div[aria-label*="Message"]',
      'div[role="textbox"][g_editable="true"]'
    ];

    let bodyField = null;
    for (const selector of bodySelectors) {
      bodyField = await currentTab.$(selector);
      if (bodyField) break;
    }

    if (bodyField) {
      await smartClick(bodyField);
    } else {
      await currentTab.keyboard.press('Tab');
    }
    await sleep(gaussianRandom(500, 100));
    await humanType(currentTab, message, { canMakeMistakes: true, typoChance: 0.08 });

    // Human pause: Proofreading the email before sending
    console.log('👀 মেইলটি চেক ও প্রুফরিডিং করা হচ্ছে (৩-৪ সেকেন্ড বিরতি)...');
    await sleep(gaussianRandom(3000, 400));
    await humanWanderMouse(currentCursor);

    // Step 8: Send Email
    console.log('[6/6] 🚀 ইমেইল সেন্ড করা হচ্ছে...');
    const sendButton = await currentTab.$('div[role="button"][data-tooltip*="Send"], div[role="button"][aria-label*="Send"], div[data-tooltip^="Send"]');
    if (sendButton) {
      console.log('👉 ghost-cursor দিয়ে Send বাটনে ক্লিক করা হচ্ছে...');
      await smartClick(sendButton);
    } else {
      await page.keyboard.down('Control');
      await page.keyboard.press('Enter');
      await page.keyboard.up('Control');
    }

    console.log('⏳ কনফার্মেশনের জন্য অপেক্ষা করা হচ্ছে...');
    await sleep(6000);

    console.log('\n🎉 অভিনন্দন! সফলভাবে এবং বাস্তব মানুষের ছন্দে সম্পূর্ণ কাজ শেষ হয়েছে!');
    console.log('ব্রাউজারটি ১০ সেকেন্ড পর বন্ধ হবে...');
    await sleep(10000);

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
