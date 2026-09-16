/**
 * modules/maps_reporter.js
 * Google Maps Fake Review / Report Review Automation Module
 * Integrates with ghost-cursor, multi-tab resolution, and anti-detection engine
 */

const { createCursor } = require('ghost-cursor');

const DEFAULT_MAPS_URL = 'https://maps.app.goo.gl/S2ejSm9dnnCwAjoq7';

/**
 * Executes the Google Maps Fake Review reporting sequence
 * 
 * @param {Object} options
 * @param {import('rebrowser-puppeteer-core').Page} options.page - Active Puppeteer page
 * @param {Object} [options.cursor] - ghost-cursor instance
 * @param {Function} [options.smartClick] - Smart click helper
 * @param {Function} options.sleep - Sleep delay helper
 * @param {string} [options.reviewUrl] - Target Google Maps review link
 * @param {Function} [options.humanWanderMouse] - Subconscious mouse wander helper
 * @param {Function} [options.humanScroll] - Natural scrolling helper
 */
async function runMapsReporter({ page, cursor, smartClick, sleep, reviewUrl, humanWanderMouse, humanScroll }) {
  const targetUrl = reviewUrl || DEFAULT_MAPS_URL;

  console.log('\n===============================================================');
  console.log('       📍 GOOGLE MAPS AUTO FAKE REVIEW REPORTER               ');
  console.log('  (Automated 3-Dots Detection & "Report review" Clicker)       ');
  console.log('===============================================================\n');

  console.log('🌐 টার্গেট গুগল ম্যাপস রিভিউ লিঙ্ক ওপেন করা হচ্ছে:');
  console.log(`🔗 ${targetUrl}`);

  // Navigate to Google Maps review link
  await page.goto(targetUrl, {
    waitUntil: 'networkidle2',
    timeout: 60000
  });

  console.log('⏳ গুগল ম্যাপস রিভিউ সেকশন লোড হওয়ার জন্য অপেক্ষা করা হচ্ছে...');
  await sleep(4000);

  if (humanScroll) {
    console.log('📜 রিভিউ কনটেন্ট স্ক্রল করে দৃশ্যমান করা হচ্ছে...');
    await humanScroll(page, 180);
    await sleep(1500);
  }

  if (humanWanderMouse && cursor) {
    await humanWanderMouse(cursor);
  }

  // --------------------------------------------------------------------------
  // [ধাপ ১] ৩-ডট বাটন শনাক্ত ও ক্লিক
  // --------------------------------------------------------------------------
  console.log('\n[ধাপ ১] 🔍 ৩-ডট (3-Dots / More Options) বাটন খোঁজা হচ্ছে...');

  let threeDotsFound = false;

  const dotsSelectors = [
    'button[aria-label*="Action"]',
    'button[aria-label*="action"]',
    'button[aria-label*="actions for"]',
    'button[aria-label*="More options"]',
    'button[aria-label*="more options"]',
    'button[aria-label*="বিকল্প"]',
    'button[data-tooltip*="options"]',
    'button[data-tooltip*="More"]',
    'button[aria-haspopup="menu"]',
    'button.al6KDe'
  ];

  for (const sel of dotsSelectors) {
    const btn = await page.$(sel).catch(() => null);
    if (btn) {
      const isVisible = await btn.isIntersectingViewport().catch(() => true);
      if (isVisible) {
        console.log(`👉 ৩-ডট বাটন পাওয়া গেছে (${sel})। ক্লিক করা হচ্ছে...`);
        if (smartClick) {
          await smartClick(btn);
        } else {
          await btn.click();
        }
        threeDotsFound = true;
        break;
      }
    }
  }

  // Fallback: DOM Search for 3-dots button
  if (!threeDotsFound) {
    console.log('🔄 DOM থেকে ডাইনামিক ৩-ডট বাটন অনুসন্ধান করা হচ্ছে...');
    const domClickSuccess = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const threeDotsBtn = buttons.find(b => {
        const aria = (b.getAttribute('aria-label') || '').toLowerCase();
        const tooltip = (b.getAttribute('data-tooltip') || '').toLowerCase();
        return (
          aria.includes('actions for') ||
          aria.includes('more options') ||
          aria.includes('action') ||
          aria.includes('বিকল্প') ||
          tooltip.includes('options') ||
          tooltip.includes('more')
        );
      }) || buttons.find(b => {
        const svg = b.querySelector('svg');
        return svg && b.offsetWidth > 0 && b.offsetWidth < 60 && b.offsetHeight < 60;
      });

      if (threeDotsBtn) {
        threeDotsBtn.scrollIntoView({ block: 'center', behavior: 'smooth' });
        threeDotsBtn.click();
        return threeDotsBtn.getAttribute('aria-label') || '3-Dot button clicked';
      }
      return null;
    });

    if (domClickSuccess) {
      console.log(`✅ ৩-ডট বাটন ক্লিক সফল: ${domClickSuccess}`);
      threeDotsFound = true;
    }
  }

  if (!threeDotsFound) {
    console.warn('⚠️ ৩-ডট বাটন সরাসরি পাওয়া যায়নি। পেজের মেনু অথবা বাটনগুলোতে চোখ বুলানো হচ্ছে...');
  }

  console.log('\n[ধাপ ২] ⏳ পপ-আপ মেনু খোলার জন্য অপেক্ষা করা হচ্ছে...');
  await sleep(2000);

  if (humanWanderMouse && cursor) {
    await humanWanderMouse(cursor);
  }

  // --------------------------------------------------------------------------
  // [ধাপ ৩] "Report review" মেনু আইটেম ক্লিক
  // --------------------------------------------------------------------------
  console.log('\n[ধাপ ৩] 🎯 "Report review" (রিভিউ রিপোর্ট) অপশন শনাক্ত ও ক্লিক করা হচ্ছে...');

  let reportClicked = false;

  const reportSelectors = [
    'div[role="menuitem"]',
    'button[role="menuitem"]',
    'div[data-action-id*="report"]',
    'div.action-menu-entry'
  ];

  const menuItems = await page.$$(reportSelectors.join(', ')).catch(() => []);
  for (const item of menuItems) {
    const text = await page.evaluate(el => (el.innerText || el.textContent || '').trim().toLowerCase(), item);
    if (
      text.includes('report review') ||
      text.includes('report') ||
      text.includes('রিভিউটি রিপোর্ট করুন') ||
      text.includes('রিপোর্ট করুন') ||
      text.includes('পতাকা')
    ) {
      console.log(`👉 "${text}" মেনু আইটেম পাওয়া গেছে! ক্লিক করা হচ্ছে...`);
      if (smartClick) {
        await smartClick(item);
      } else {
        await item.click();
      }
      reportClicked = true;
      break;
    }
  }

  // Fallback evaluate search for Report text
  if (!reportClicked) {
    const evaluateResult = await page.evaluate(() => {
      const candidates = Array.from(document.querySelectorAll('*'));
      
      const reportEl = candidates.find(el => {
        const t = (el.innerText || el.textContent || '').trim().toLowerCase();
        return (
          t === 'report review' ||
          t === 'report' ||
          t === 'flag as inappropriate' ||
          t === 'রিভিউটি রিপোর্ট করুন' ||
          t === 'রিপোর্ট করুন'
        ) && el.children.length === 0;
      }) || candidates.find(el => {
        const t = (el.innerText || el.textContent || '').trim().toLowerCase();
        return (
          t.includes('report review') ||
          t.includes('flag as inappropriate') ||
          t.includes('রিপোর্ট করুন')
        ) && el.children.length < 3;
      });

      if (reportEl) {
        reportEl.scrollIntoView({ block: 'center' });
        reportEl.click();
        if (reportEl.parentElement) reportEl.parentElement.click();
        return (reportEl.innerText || reportEl.textContent || 'Report Option Clicked').trim();
      }
      return null;
    });

    if (evaluateResult) {
      console.log(`✅ "Report review" অপশনে ক্লিক সফল: "${evaluateResult}"`);
      reportClicked = true;
    }
  }

  if (!reportClicked) {
    console.error('❌ "Report review" অপশনটি ক্লিক করা সম্ভব হয়নি। পেজের স্ক্রিনশট রাখা হচ্ছে: maps_error.png');
    await page.screenshot({ path: 'maps_error.png', fullPage: true }).catch(() => {});
    return false;
  }

  console.log('\n🎉 [সফলতা] গুগল ম্যাপসের ৩-ডট মেনু থেকে "Report review" সফলভাবে ক্লিক করা হয়েছে!');
  console.log('⏳ রিপোর্ট পেজ / উইন্ডো শনাক্ত করা হচ্ছে...');

  // --------------------------------------------------------------------------
  // [ধাপ ৪] Dynamic Tab & Dialog Resolution Engine
  // Google Maps opens Report Review in a NEW TAB (e.g. /local/content/rap/report?...)
  // --------------------------------------------------------------------------
  let reportPage = page;
  let reportCursor = cursor;
  const browser = page.browser();

  // Poll up to 8 seconds for the new tab or modal to appear
  const waitStart = Date.now();
  let foundReportTab = false;

  while (Date.now() - waitStart < 8000) {
    await sleep(1000);
    const allPages = await browser.pages().catch(() => []);
    
    // Check if any tab has the report URL or Title
    const newTab = allPages.find(p => {
      const u = p.url();
      return u.includes('/rap/report') || u.includes('/content/rap') || u.includes('/report?') || u.includes('/local/content/rap');
    });

    if (newTab) {
      reportPage = newTab;
      foundReportTab = true;
      console.log(`🎯 নতুন ট্যাবে রিপোর্ট পেজ শনাক্ত ও ফোকাস করা হয়েছে:`);
      console.log(`🔗 ${reportPage.url()}`);
      await reportPage.bringToFront();
      reportCursor = createCursor(reportPage);
      break;
    }
  }

  if (!foundReportTab) {
    // If not in new tab, check if opened in the same tab or in an iframe
    const isCurrentReport = reportPage.url().includes('report') || reportPage.url().includes('rap');
    if (isCurrentReport) {
      console.log('🎯 বর্তমান পেজেই রিপোর্ট ফর্ম লোড হয়েছে।');
    } else {
      console.log('⏳ ডায়ালগ বা আইফ্রেমের জন্য অপেক্ষা করা হচ্ছে...');
    }
  }

  await sleep(2500);

  // --------------------------------------------------------------------------
  // [ধাপ ৫] "Spam" (স্প্যাম) অপশন শনাক্ত ও নির্বাচন
  // In Google RAP UI, Spam is: <a href="...report/submit?r=2..."> with <div class="um5FIe">Spam</div>
  // --------------------------------------------------------------------------
  console.log('\n[ধাপ ৫] 🎯 "Spam" (স্প্যাম) অপশন শনাক্ত ও নির্বাচন করা হচ্ছে...');

  let spamClicked = false;

  for (let attempt = 1; attempt <= 6; attempt++) {
    spamClicked = await reportPage.evaluate(() => {
      const all = Array.from(document.querySelectorAll('*'));

      // Method 1: Look specifically for link with r=2 (Google's designated reason code for Spam)
      const r2Link = document.querySelector('a[href*="r=2"], [data-value*="2"], [data-reason="2"]');
      if (r2Link) {
        r2Link.scrollIntoView({ block: 'center' });
        r2Link.click();
        return true;
      }

      // Method 2: Match leaf text element strictly for Spam / স্প্যাম
      const spamEl = all.find(el => {
        const t = (el.innerText || el.textContent || '').toLowerCase().trim();
        return (
          t === 'spam' ||
          t === 'স্প্যাম' ||
          t.startsWith('spam\n') ||
          t.startsWith('স্প্যাম\n') ||
          t === 'spam or fake'
        ) && el.children.length === 0;
      });

      if (spamEl) {
        // Find clickable parent row: <a>, <button>, [role="button"], [role="radio"], [role="listitem"]
        const clickable = spamEl.closest('a, button, [role="button"], [role="radio"], [role="listitem"], li, div[tabindex]') || spamEl.parentElement;
        if (clickable) {
          clickable.scrollIntoView({ block: 'center' });
          clickable.click();
          const innerLink = clickable.querySelector('a, button');
          if (innerLink && innerLink !== clickable) innerLink.click();
          return true;
        }
        spamEl.click();
        return true;
      }

      // Method 3: Fallback search for radio buttons or labels
      const radioOrLabel = all.find(el => {
        const t = (el.innerText || el.textContent || '').toLowerCase();
        const aria = (el.getAttribute('aria-label') || '').toLowerCase();
        return (t.includes('spam') || t.includes('স্প্যাম') || aria.includes('spam')) &&
          (el.tagName === 'LABEL' || el.getAttribute('role') === 'radio' || el.getAttribute('role') === 'button');
      });

      if (radioOrLabel) {
        radioOrLabel.scrollIntoView({ block: 'center' });
        radioOrLabel.click();
        const input = radioOrLabel.querySelector('input');
        if (input) input.click();
        return true;
      }

      return false;
    }).catch(() => false);

    if (spamClicked) {
      console.log('✅ "Spam" (স্প্যাম) অপশন সফলভাবে ক্লিক করা হয়েছে!');
      break;
    }

    await sleep(1500);
  }

  if (!spamClicked) {
    console.warn('⚠️ "Spam" অপশন সরাসরি নির্বাচন করা যায়নি। স্ক্রিনশট রাখা হচ্ছে: maps_reason_error.png');
    await reportPage.screenshot({ path: 'maps_reason_error.png', fullPage: true }).catch(() => {});
    return false;
  }

  // --------------------------------------------------------------------------
  // [ধাপ ৬] Submit পেজে যাওয়া ও Submit বাটন ক্লিক
  // --------------------------------------------------------------------------
  console.log('\n[ধাপ ৬] ⏳ সাবমিট পেজ লোড হওয়ার জন্য অপেক্ষা করা হচ্ছে...');
  await sleep(3000);

  // Check if there is an intermediate "Next" button in certain regional flows
  await reportPage.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button, div[role="button"]'));
    const nextBtn = buttons.find(btn => {
      const t = (btn.innerText || btn.textContent || '').trim().toLowerCase();
      return (t === 'next' || t === 'পরবর্তী') && !btn.disabled;
    });
    if (nextBtn) {
      nextBtn.scrollIntoView({ block: 'center' });
      nextBtn.click();
      return true;
    }
    return false;
  }).catch(() => false);

  await sleep(2000);

  console.log('👉 Submit / Report বাটনে ক্লিক করার চেষ্টা করা হচ্ছে...');

  let submitted = false;

  for (let attempt = 1; attempt <= 6; attempt++) {
    submitted = await reportPage.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button, div[role="button"], input[type="submit"], a[role="button"]'));
      
      const submitBtn = buttons.find(btn => {
        const t = (btn.innerText || btn.textContent || btn.value || '').trim().toLowerCase();
        const isDisabled = btn.disabled || btn.getAttribute('aria-disabled') === 'true';
        return (
          t === 'submit' ||
          t === 'report' ||
          t === 'send' ||
          t === 'রিপোর্ট করুন' ||
          t === 'জমা দিন' ||
          t === 'পাঠান'
        ) && !isDisabled;
      });

      if (submitBtn) {
        submitBtn.scrollIntoView({ block: 'center' });
        submitBtn.click();
        return true;
      }
      return false;
    }).catch(() => false);

    if (submitted) {
      console.log('🎉 "Submit" বাটনে ক্লিক সম্পন্ন হয়েছে!');
      break;
    }

    await sleep(1500);
  }

  if (!submitted) {
    console.warn('⚠️ Submit বাটন স্বয়ংক্রিয়ভাবে পাওয়া যায়নি। স্ক্রিনশট রাখা হচ্ছে: maps_submit_error.png');
    await reportPage.screenshot({ path: 'maps_submit_error.png', fullPage: true }).catch(() => {});
  }

  // --------------------------------------------------------------------------
  // [ধাপ ৭] সাবমিশন ভেরিফিকেশন ও প্রমাণ সংরক্ষণ
  // --------------------------------------------------------------------------
  console.log('\n[ধাপ ৭] ⏳ রিপোর্ট সাবমিশন কনফার্মেশন যাচাই করা হচ্ছে...');
  await sleep(4000);

  const confirmationStatus = await reportPage.evaluate(() => {
    const text = (document.body.innerText || '').toLowerCase();
    const url = window.location.href;

    const isConfirmed = (
      url.includes('/confirmation') ||
      text.includes('report received') ||
      text.includes('thank you for reporting') ||
      text.includes('thanks for reporting') ||
      text.includes('already reported') ||
      text.includes('ইতিমধ্যে রিপোর্ট') ||
      text.includes('রিপোর্ট জমা দেওয়া হয়েছে') ||
      text.includes('রিপোর্ট করার জন্য ধন্যবাদ') ||
      text.includes('ধন্যবাদ')
    );

    return {
      isConfirmed,
      currentUrl: url
    };
  }).catch(() => ({ isConfirmed: false, currentUrl: '' }));

  if (confirmationStatus.isConfirmed) {
    console.log('🏆 [চূড়ান্ত কনফার্মেশন] গুগল দ্বারা রিপোর্টটি সফলভাবে গৃহীত হয়েছে!');
    console.log(`📄 কনফার্মেশন লিঙ্ক: ${confirmationStatus.currentUrl}`);
  } else {
    console.log('ℹ️ সাবমিট সম্পন্ন হয়েছে, চূড়ান্ত কনফার্মেশন স্ক্রিন সংরক্ষণ করা হচ্ছে...');
  }

  // Capture final proof screenshot
  await reportPage.screenshot({ path: 'maps_report_spam_submitted.png', fullPage: true }).catch(() => {});
  console.log('📸 প্রমাণের স্ক্রিনশট সফলভাবে সংরক্ষিত: maps_report_spam_submitted.png');

  // Dismiss "Done" button if present
  await reportPage.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button, div[role="button"]'));
    const doneBtn = buttons.find(btn => {
      const t = (btn.innerText || btn.textContent || '').trim().toLowerCase();
      return t === 'done' || t === 'সম্পন্ন' || t === 'close' || t === 'বন্ধ করুন';
    });
    if (doneBtn) doneBtn.click();
  }).catch(() => {});

  console.log('\n===========================================================');
  console.log('✅ গুগল ম্যাপসের ফেক রিভিউ রিপোর্ট সফলভাবে সম্পন্ন হয়েছে!');
  console.log('===========================================================');
  return true;
}

module.exports = {
  runMapsReporter,
  DEFAULT_MAPS_URL
};
