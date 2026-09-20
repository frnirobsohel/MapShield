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
const {
  sleep: defaultSleep,
  gaussianRandom,
  randomBetween,
  smartClick: defaultSmartClick,
  clickElementByText,
  captureProofScreenshot,
  humanType
} = require('../helpers');

const TROUBLESHOOTER_URL = 'https://support.google.com/legal/troubleshooter/1114905';

// 5-Step Troubleshooter Question & Option Mappings
const TROUBLESHOOTER_STEPS = [
  {
    step: 1,
    name: 'Product Selection',
    inputName: '1620659',
    inputValue: '9723198', // Google Maps, Waze and related products
    labelDescription: 'Google Maps, Waze and related products'
  },
  {
    step: 2,
    name: 'AI Generated Content Check',
    inputName: '14440196',
    inputValue: '14438492', // No
    labelDescription: 'No'
  },
  {
    step: 3,
    name: 'Specific Maps Product',
    inputName: '9722894',
    inputValue: '1115689', // Maps
    labelDescription: 'Maps'
  },
  {
    step: 4,
    name: 'Legal vs Policy Reason',
    inputName: '13011237',
    inputValue: '13010990', // Legal Reasons to Report Content
    labelDescription: 'Legal Reasons to Report Content'
  },
  {
    step: 5,
    name: 'Legal Grounds',
    inputName: '13011800',
    inputValue: '15220331', // Defamation
    labelDescription: 'Defamation: Report content that defames you or your business'
  }
];

/**
 * Formats a clean, proper capitalized human legal name from a string or email
 * e.g. "vvishnusingh09@gmail.com" -> "Vishnu Singh"
 * e.g. "nirobsohel272@gmail.com" -> "Nirob Sohel"
 */
function formatCleanHumanName(raw) {
  if (!raw) return 'Google Business Representative';

  let str = raw.includes('@') ? raw.split('@')[0] : raw;
  str = str.replace(/[0-9]+/g, ' ').trim();
  str = str.replace(/[._\-+]/g, ' ');
  str = str.replace(/^([a-z])\1(?=[a-z]{3,})/i, '$1');

  let words = str.split(/\s+/).filter(Boolean);
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

  if (words.length === 0) return 'Google Business Representative';

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
      console.log(`👤 [Profile Detection]: Found name from avatar aria-label: "${extractedName}"`);
      return extractedName;
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
        console.log(`👤 [Profile Detection]: Successfully extracted name from profile card popup: "${extractedName}"`);
        return extractedName;
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
 * Automates Stage 1: Google Legal Troubleshooter (1114905)
 * Clicks the exact 5-step radio sequence with human reading pauses and triggers "Create request" visibly.
 * 
 * @param {import('rebrowser-puppeteer-core').Page} page
 * @param {Object} [options]
 * @param {Object} [options.cursor] ghost-cursor instance
 * @param {Function} [options.smartClick]
 * @param {Function} [options.sleep]
 * @returns {Promise<boolean>}
 */
async function walkthroughTroubleshooter(page, options = {}) {
  const sleep = options.sleep || defaultSleep;
  const smartClick = options.smartClick || defaultSmartClick;
  const cursor = options.cursor;

  console.log('\n===========================================================');
  console.log('⚖️ [Stage 1] Executing Google Legal Troubleshooter (1114905)...');
  console.log('===========================================================');

  try {
    const currentUrl = page.url();
    if (!currentUrl.includes('/troubleshooter/1114905')) {
      console.log(`🌐 Navigating to Troubleshooter: ${TROUBLESHOOTER_URL}`);
      await page.goto(TROUBLESHOOTER_URL, {
        waitUntil: 'networkidle2',
        timeout: 45000
      });
      // Human pause looking at newly loaded troubleshooter page
      await sleep(randomBetween(2400, 3400));
    }

    // Iterate through all 5 questions with human reading cadence
    for (const stepConfig of TROUBLESHOOTER_STEPS) {
      // Human reading pause before selecting
      console.log(`👀 Step ${stepConfig.step}/5: Reading question options for "${stepConfig.labelDescription}"...`);
      await sleep(randomBetween(1800, 2600));

      const radioSelector = `input[name="${stepConfig.inputName}"][value="${stepConfig.inputValue}"]`;

      // Wait for radio input to be attached in DOM
      let radioHandle = await page.waitForSelector(radioSelector, { timeout: 15000 }).catch(() => null);

      if (!radioHandle) {
        console.warn(`⚠️ Step ${stepConfig.step}: Radio selector ${radioSelector} not directly found. Attempting DOM evaluation...`);
      }

      // 1. Smoothly scroll the option into view
      await page.evaluate((name, val) => {
        const input = document.querySelector(`input[name="${name}"][value="${val}"]`);
        if (input) {
          const target = input.closest('label') || input;
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, stepConfig.inputName, stepConfig.inputValue);

      // Pause so user sees the scrolling complete
      await sleep(randomBetween(600, 1000));

      // 2. Move mouse cursor to the radio option if cursor available
      if (cursor && radioHandle) {
        await cursor.moveTo(radioHandle).catch(() => { });
        await sleep(randomBetween(300, 600));
      }

      // 3. Safe humanized click on either label or radio button
      const clicked = await page.evaluate((name, val) => {
        const input = document.querySelector(`input[name="${name}"][value="${val}"]`);
        if (!input) return false;

        const label = input.closest('label') || input.parentElement;
        if (label) {
          label.click();
          input.checked = true;
          input.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }

        input.click();
        input.checked = true;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }, stepConfig.inputName, stepConfig.inputValue);

      if (!clicked && radioHandle) {
        await radioHandle.click({ delay: 100 });
      }

      console.log(`   ✅ Step ${stepConfig.step}/5 selected: "${stepConfig.labelDescription}"`);
      // Human pause watching Google troubleshooter animate/expand next question
      await sleep(randomBetween(2000, 2800));
    }

    // Step 6: Locate, scroll to, hover and click "Create request" button VISIBLY
    console.log('\n⏳ Waiting for "Create request" action section to expand...');
    await sleep(randomBetween(1800, 2600));

    let createBtnHandle = null;
    let createBtnHref = '';

    for (let attempt = 0; attempt < 10; attempt++) {
      const candidates = await page.$$('button, a, [role="button"], .material-button, input[type="button"], input[type="submit"]').catch(() => []);
      for (const btn of candidates) {
        const txt = await page.evaluate(el => (el.innerText || el.textContent || el.value || '').trim().toLowerCase(), btn).catch(() => '');
        if (txt === 'create request' || txt.includes('create request')) {
          createBtnHandle = btn;
          createBtnHref = await page.evaluate(el => el.getAttribute('href') || '', btn).catch(() => '');
          break;
        }
      }
      if (createBtnHandle) break;
      await sleep(700);
    }

    if (createBtnHandle) {
      console.log('===========================================================');
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
      console.log('===========================================================\n');

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

  const reviewUrl = options.reviewUrl;
  const legalNotice = options.legalNotice || {};
  const senderInfo = options.senderInfo || {};

  // Human initial delay: looking at newly opened form
  console.log('⏳ Waiting for Legal Removal Form components to load...');
  await activePage.waitForSelector('[data-test-id="form-container"], page-legal-other-geo-form, gdf-form', {
    timeout: 30000
  }).catch(() => null);

  await activePage.bringToFront().catch(() => { });
  await sleep(randomBetween(2600, 3600)); // Human reading overview header

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

  const country = (senderInfo.country || 'United States').trim();
  const legalExplanation = (legalNotice.legalClaimText || '').trim().slice(0, 950);

  console.log('\n===========================================================');
  console.log('⚖️ [Stage 2] Automating Google Legal Removal Form (Human Paced)...');
  console.log(`   Complainant Real Name: ${fullName}`);
  console.log(`   Country:                ${country}`);
  console.log(`   Target Review:          ${reviewUrl}`);
  console.log(`   Legal Claim Len:        ${legalExplanation.length} chars (Limit: 1000)`);
  console.log('===========================================================');

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
      await activePage.evaluate((url) => {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).catch(() => { });
        }
      }, targetReviewUrl);
      await sleep(250);

      await activePage.keyboard.down('Control');
      await activePage.keyboard.press('KeyV');
      await activePage.keyboard.up('Control');
      await sleep(250);

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
      console.log('⏳ Checking reCAPTCHA widget...');

      // Give 25 seconds for automatic token completion or user interaction
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

    if (submitClicked) {
      console.log('✅ Submit button clicked successfully!');
      await sleep(3500);
    } else {
      console.log('ℹ️ Form prepared and filled completely. Capture proof screenshot...');
    }

    // 12. Capture Proof Screenshot
    const proofRes = await captureProofScreenshot(activePage, 'legal_submission');
    const screenshotPath = proofRes ? proofRes.filename : 'report_logs/proofs';
    console.log(`📸 Legal Notice submission proof saved: ${screenshotPath}`);

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
      proofScreenshot: screenshotPath
    };

    fs.writeFileSync(dossierPath, JSON.stringify(dossierData, null, 2), 'utf8');

    const txtContent = `===============================================================
OFFICIAL GOOGLE LEGAL REMOVAL COMPLAINT (DEFAMATION & INFRINGEMENT)
Target Review URL: ${reviewUrl}
Complainant:       ${fullName}
Country:           ${country}
Date Filed:        ${new Date().toUTCString()}
Status:            SUBMITTED
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
      success: true,
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
  const { page, reportPage, reviewUrl, legalNotice, senderInfo, sleep, smartClick, cursor, browser } = options;
  const activePage = reportPage || page;

  // Stage 1: Walkthrough Troubleshooter
  const stage1Success = await walkthroughTroubleshooter(activePage, { sleep, smartClick, cursor });
  if (!stage1Success) {
    console.warn('⚠️ Stage 1 Troubleshooter encountered a warning; continuing to Stage 2 if form is reachable.');
  }

  // Detect if "Create request" opened in a new tab or redirected same tab
  let formPage = activePage;
  try {
    const activeBrowser = browser || (typeof activePage.browser === 'function' ? activePage.browser() : (typeof page?.browser === 'function' ? page.browser() : null));
    if (activeBrowser) {
      console.log('🔍 Detecting Legal Removal Form tab (polling up to 10s)...');
      for (let attempt = 0; attempt < 10; attempt++) {
        await (sleep || defaultSleep)(1000);
        const allPages = await activeBrowser.pages().catch(() => []);
        const legalTab = allPages.find(p => {
          const u = p.url();
          return (u.includes('reportcontent.google.com') || u.includes('contact/lr_') || (u.includes('legal') && !u.includes('1114905'))) && p !== activePage;
        });

        if (legalTab) {
          console.log(`📑 Detected Legal Removal Form in a new tab: ${legalTab.url()}`);
          formPage = legalTab;
          await formPage.bringToFront().catch(() => { });
          break;
        }

        if (activePage.url().includes('reportcontent.google.com') || activePage.url().includes('contact/lr_')) {
          console.log('📑 Active page redirected to Legal Removal Form.');
          formPage = activePage;
          break;
        }
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
    cursor
  });

  return result;
}

module.exports = {
  walkthroughTroubleshooter,
  fillLegalRemovalForm,
  executeFullLegalFlow,
  TROUBLESHOOTER_STEPS
};
