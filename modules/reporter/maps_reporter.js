/**
 * modules/maps_reporter.js
 * Google Maps Fake Review / Report Review Automation Module
 * Integrates with ghost-cursor, multi-tab resolution, AI smart review inspection, and anti-detection engine
 */

const fs = require('fs');
const path = require('path');
const { createCursor } = require('ghost-cursor');
const { extractReviewDetails, analyzeReviewWithAI, generateLegalNoticeWithAI } = require('../ai/ai_reviewer');
const { executeFullLegalFlow } = require('./legal_reporter');
const {
  sleep: defaultSleep,
  humanScroll: defaultHumanScroll,
  humanWanderMouse: defaultHumanWanderMouse,
  smartClick: defaultSmartClick,
  handleConsentIfPresent,
  captureProofScreenshot,
  captureErrorScreenshot
} = require('../helpers');

const DEFAULT_MAPS_URL = 'https://maps.app.goo.gl/S2ejSm9dnnCwAjoq7';

// Mapping of violation reasons to Google Maps RAP reason codes and keywords matching the official Google dialog
const REASON_CONFIGS = {
  offtopic: {
    rCode: '3',
    keywords: ['off topic', 'off-topic', 'offtopic', "doesn't pertain to an experience", 'wrong business'],
    label: 'Off topic'
  },
  spam: {
    rCode: '2',
    keywords: ['spam', 'bot, a fake account', 'fake account', 'ads and promotions', 'advertising', 'bought'],
    label: 'Spam'
  },
  conflict: {
    rCode: '1',
    keywords: ['conflict of interest', 'affiliated with the business', "competitor's business", 'competitor'],
    label: 'Conflict of interest'
  },
  profanity: {
    rCode: '4',
    keywords: ['profanity', 'swear words', 'pornographic', 'sexually explicit', 'obscene'],
    label: 'Profanity'
  },
  harmful: {
    rCode: '7',
    keywords: ['harmful', 'self-harm', 'dangerous items', 'graphic violence', 'violence to people or animals'],
    label: 'Harmful'
  },
  bullying: {
    rCode: '5',
    keywords: ['bullying or harassment', 'bullying', 'harassment', 'personally attacks a specific individual', 'personal attack'],
    label: 'Bullying or harassment'
  },
  discrimination: {
    rCode: '6',
    keywords: ['discrimination or hate speech', 'discrimination', 'hate speech', 'harmful language about an individual or group based on identity'],
    label: 'Discrimination or hate speech'
  },
  personal_info: {
    rCode: '8',
    keywords: ['personal information', 'contains personal information', 'address or phone number', 'phone number'],
    label: 'Personal information'
  },
  not_helpful: {
    rCode: '9',
    keywords: ['not helpful', "doesn't help people decide whether to go to this place", 'decide whether to go'],
    label: 'Not helpful'
  }
};

// Common aliases
REASON_CONFIGS['personal_information'] = REASON_CONFIGS.personal_info;
REASON_CONFIGS['nothelpful'] = REASON_CONFIGS.not_helpful;

/**
 * Handles AI Legal Notice Generation, Artifact Saving, and Google Legal Troubleshooter & Form Automation
 */
async function executeLegalNoticeFlow({
  page,
  browser,
  reportPage,
  reviewUrl,
  details,
  aiOptions,
  senderInfo,
  cursor,
  smartClick,
  sleep = defaultSleep
}) {
  console.log('\n===========================================================');
  console.log('⚖️ [Legal Notice] Initiating AI Legal Complaint & Document...');
  console.log('===========================================================');

  const apiKey = aiOptions?.aiApiKey || process.env.AI_API_KEY || process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.DEEPSEEK_API_KEY;
  const provider = aiOptions?.aiProvider || process.env.AI_PROVIDER || 'gemini';
  const model = aiOptions?.aiModel || process.env.AI_MODEL;
  const businessName = senderInfo?.businessName || details?.businessName || 'the business';

  const legalNotice = await generateLegalNoticeWithAI({
    reviewText: details?.reviewText || '',
    reviewerName: details?.reviewerName || 'Anonymous',
    rating: details?.rating || '1 star',
    provider,
    apiKey,
    model,
    businessName
  });

  console.log('📋 [AI Legal Notice Generated]:');
  console.log(`   Legal Grounds:    ${legalNotice.legalGrounds}`);
  console.log(`   Severity Level:   ${legalNotice.severity?.toUpperCase() || 'HIGH'}`);
  console.log(`   Claim Summary:    ${legalNotice.formalNoticeSummary}`);

  const activeTargetPage = reportPage || page;

  // Execute end-to-end 2-stage legal takedown: Troubleshooter (1114905) + Legal Removal Form
  const legalResult = await executeFullLegalFlow({
    page,
    browser: browser || (typeof page?.browser === 'function' ? page.browser() : undefined),
    reportPage: activeTargetPage,
    reviewUrl,
    legalNotice,
    senderInfo,
    sleep,
    smartClick: smartClick || defaultSmartClick,
    cursor
  });

  return {
    ...legalNotice,
    legalResult
  };
}

/**
 * Executes the Google Maps Fake Review reporting sequence
 * 
 * @param {Object} options
 * @param {import('rebrowser-puppeteer-core').Page} options.page - Active Puppeteer page
 * @param {Object} [options.cursor] - ghost-cursor instance
 * @param {Function} [options.smartClick] - Smart click helper (defaults to modules/helpers)
 * @param {Function} [options.sleep] - Sleep delay helper (defaults to modules/helpers)
 * @param {string} [options.reviewUrl] - Target Google Maps review link
 * @param {Function} [options.humanWanderMouse] - Subconscious mouse wander helper (defaults to modules/helpers)
 * @param {Function} [options.humanScroll] - Natural scrolling helper (defaults to modules/helpers)
 * @param {string} [options.reportType] - 'standard' | 'legal'
 * @param {string} [options.reportReason] - 'spam' | 'conflict' | 'offtopic' | 'profanity' | 'bullying' | 'ai-auto'
 * @param {Object} [options.aiOptions] - { aiProvider, aiApiKey, aiModel, aiInspection }
 */
async function runMapsReporter({
  page,
  cursor,
  smartClick,
  sleep,
  reviewUrl,
  humanWanderMouse,
  humanScroll,
  reportType = 'standard',
  reportReason = 'spam',
  aiOptions = {},
  senderInfo = {}
}) {
  sleep = sleep || defaultSleep;
  humanScroll = humanScroll || defaultHumanScroll;
  humanWanderMouse = humanWanderMouse || defaultHumanWanderMouse;
  smartClick = smartClick || (async (btn) => defaultSmartClick(page, cursor, btn));

  const targetUrl = reviewUrl || DEFAULT_MAPS_URL;

  console.log('\n===============================================================');
  console.log('       📍 GOOGLE MAPS AUTO FAKE REVIEW REPORTER               ');
  console.log('  (Automated 3-Dots Detection & "Report review" Clicker)       ');
  console.log('===============================================================\n');

  console.log('🌐 Opening target Google Maps review link:');
  console.log(`🔗 ${targetUrl}`);

  // Navigate to Google Maps review link
  await page.goto(targetUrl, {
    waitUntil: 'networkidle2',
    timeout: 60000
  });

  console.log('⏳ Waiting for Google Maps review section to load...');
  await sleep(2500);

  // Handle cookie consent or 'Before you continue to Google' dialogs
  try {
    await handleConsentIfPresent(page);
  } catch (e) {}
  await sleep(1500);

  if (humanScroll) {
    console.log('📜 Scrolling review content into view...');
    await humanScroll(page, 180);
    await sleep(1500);
  }

  if (humanWanderMouse && cursor) {
    await humanWanderMouse(cursor);
  }

  // --------------------------------------------------------------------------
  // [Step 0] Violation Category & Report Setup
  // --------------------------------------------------------------------------
  let activeReason = (reportReason || 'spam').toLowerCase();
  let activeType = (reportType || 'standard').toLowerCase();

  // If reason is a multi-category list (e.g. "bullying, conflict, not_helpful"), pick one randomly
  if (activeReason.includes(',')) {
    const list = activeReason.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    if (list.length > 0) {
      activeReason = list[Math.floor(Math.random() * list.length)];
      console.log(`🎲 [Category Rotation]: Selected "${activeReason.toUpperCase()}" from [${list.join(', ')}]`);
    }
  }

  let shouldExecuteLegalNotice = activeType === 'both' || activeType === 'legal' || activeReason === 'legal';
  let details = null;

  // AI is ONLY called during execution if reason was NOT pre-selected (i.e. explicitly 'ai-auto')
  // For pre-selected categories, AI runs $0.00 zero tokens during live reporting
  const isAiRequested = activeReason === 'ai-auto';

  if (isAiRequested || shouldExecuteLegalNotice) {
    console.log('\n🤖 [AI Inspection] Inspecting review text & metadata from page...');
    details = await extractReviewDetails(page);

    const apiKey = aiOptions?.aiApiKey || process.env.AI_API_KEY || process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.DEEPSEEK_API_KEY;
    const provider = aiOptions?.aiProvider || process.env.AI_PROVIDER || 'gemini';
    const model = aiOptions?.aiModel || process.env.AI_MODEL;

    if (apiKey && isAiRequested) {
      const aiDecision = await analyzeReviewWithAI({
        reviewText: details.reviewText,
        reviewerName: details.reviewerName,
        rating: details.rating,
        provider,
        apiKey,
        model
      });

      if (activeReason === 'ai-auto') {
        activeReason = aiDecision.category || 'spam';
      }

      if (aiDecision.recommendedMode === 'legal' || aiDecision.category === 'legal') {
        shouldExecuteLegalNotice = true;
      }
      console.log(`✨ [AI Decision Applied] Violation Category: "${activeReason.toUpperCase()}" (Mode: ${activeType.toUpperCase()})\n`);
    } else if (isAiRequested) {
      if (activeReason === 'ai-auto') {
        console.log('ℹ️ No AI API Key provided; using default reason: "spam".\n');
        activeReason = 'spam';
      }
    }
  }

  // If report mode is purely legal, bypass standard 3-dots report and file directly
  if (activeType === 'legal' || activeReason === 'legal') {
    console.log('\n===========================================================');
    console.log('⚖️ [Legal Notice Mode] Direct Legal Removal Notice Flow');
    console.log('===========================================================');

    const legalResult = await executeLegalNoticeFlow({
      page,
      browser: typeof page?.browser === 'function' ? page.browser() : undefined,
      reportPage: page,
      reviewUrl: targetUrl,
      details,
      aiOptions,
      senderInfo,
      cursor,
      smartClick,
      sleep
    });

    console.log('\n===========================================================');
    console.log('✅ Google Legal Removal Notice process completed!');
    console.log('===========================================================');
    return legalResult;
  }

  // --------------------------------------------------------------------------
  // [Step 1] 3-Dots Button Detection & Click
  // --------------------------------------------------------------------------
  console.log('\n[Step 1] 🔍 Searching for 3-Dots (More Options) button...');

  let threeDotsFound = false;

  const dotsSelectors = [
    'button[aria-label*="Action"]',
    'button[aria-label*="action"]',
    'button[aria-label*="actions for"]',
    'button[aria-label*="More options"]',
    'button[aria-label*="more options"]',
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
        console.log(`👉 3-Dots button found (${sel}). Clicking...`);
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

  // Fallback: evaluate search for 3-dots button
  if (!threeDotsFound) {
    threeDotsFound = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button, div[role="button"]'));
      const dotsBtn = buttons.find(b => {
        const aria = (b.getAttribute('aria-label') || '').toLowerCase();
        const tooltip = (b.getAttribute('data-tooltip') || '').toLowerCase();
        return (
          aria.includes('action') ||
          aria.includes('more option') ||
          tooltip.includes('option') ||
          tooltip.includes('more') ||
          b.getAttribute('aria-haspopup') === 'menu'
        );
      });
      if (dotsBtn) {
        dotsBtn.scrollIntoView({ block: 'center' });
        dotsBtn.click();
        return true;
      }
      return false;
    }).catch(() => false);
  }

  if (!threeDotsFound) {
    console.error('❌ Failed to locate 3-Dots button on review. Saving diagnostic screenshot to report_logs/errors/');
    await captureErrorScreenshot(page, 'maps_dots_error');
    throw new Error(`Failed to locate 3-Dots (More Options) button on review page: ${targetUrl}`);
  }

  console.log('✅ 3-Dots button clicked successfully.');
  await sleep(2500);

  // --------------------------------------------------------------------------
  // [Step 2 & 3] Click "Report review" from Menu
  // --------------------------------------------------------------------------
  console.log('\n[Step 2] 🔍 Searching for "Report review" option in dropdown menu...');

  let reportClicked = false;

  const menuItems = await page.$$('div[role="menuitem"], [role="menuitem"], .gU3Bcb, .nbpdpb, div[jsaction*="click"]').catch(() => []);
  for (const item of menuItems) {
    const text = (await page.evaluate(el => el.innerText || el.textContent || '', item)).toLowerCase().trim();
    if (
      text.includes('report review') ||
      text.includes('report') ||
      text.includes('flag as inappropriate')
    ) {
      console.log(`👉 Menu item "${text}" found! Clicking...`);
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
      const candidates = Array.from(document.querySelectorAll('button, a, span, div[role="menuitem"], div[role="button"], li, [role="menuitemradio"], [data-index], [jsaction]'));
      
      const reportEl = candidates.find(el => {
        const t = (el.innerText || el.textContent || '').trim().toLowerCase();
        return (
          t === 'report review' ||
          t === 'report' ||
          t === 'flag as inappropriate'
        ) && el.children.length === 0;
      }) || candidates.find(el => {
        const t = (el.innerText || el.textContent || '').trim().toLowerCase();
        return (
          t.includes('report review') ||
          t.includes('flag as inappropriate')
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
      console.log(`✅ "Report review" clicked successfully: "${evaluateResult}"`);
      reportClicked = true;
    }
  }

  if (!reportClicked) {
    console.error('❌ Failed to click "Report review" option. Saving diagnostic screenshot to report_logs/errors/');
    await captureErrorScreenshot(page, 'maps_report_click_error');
    throw new Error('Failed to click "Report review" option from 3-dots dropdown menu');
  }

  console.log('\n🎉 [Success] "Report review" clicked successfully from 3-dots menu!');
  console.log('⏳ Detecting report page / window...');

  // --------------------------------------------------------------------------
  // [Step 4] Dynamic Tab & Dialog Resolution Engine
  // --------------------------------------------------------------------------
  let reportPage = page;
  let reportCursor = cursor;
  const browser = page.browser();

  const waitStart = Date.now();
  let foundReportTab = false;

  while (Date.now() - waitStart < 8000) {
    await sleep(1000);
    const allPages = await browser.pages().catch(() => []);
    
    const newTab = allPages.find(p => {
      const u = p.url();
      return u.includes('/rap/report') || u.includes('/content/rap') || u.includes('/report?') || u.includes('/local/content/rap');
    });

    if (newTab) {
      reportPage = newTab;
      foundReportTab = true;
      console.log(`🎯 Report page detected in new tab and focused:`);
      console.log(`🔗 ${reportPage.url()}`);
      await reportPage.bringToFront();
      reportCursor = createCursor(reportPage);
      break;
    }
  }

  if (!foundReportTab) {
    const isCurrentReport = reportPage.url().includes('report') || reportPage.url().includes('rap');
    if (isCurrentReport) {
      console.log('🎯 Report form loaded on current page.');
    } else {
      console.log('⏳ Waiting for dialog or iframe...');
    }
  }

  await sleep(2500);

  // --------------------------------------------------------------------------
  // [Step 5] Report Action: Legal Notice vs Standard Category
  // --------------------------------------------------------------------------
  // Standard Option Detection & Selection (legal mode already returned earlier at line 262)
  const reasonCfg = REASON_CONFIGS[activeReason] || REASON_CONFIGS.spam;
  console.log(`\n[Step 5] 🎯 Detecting and selecting "${reasonCfg.label}" option...`);

  let reasonClicked = false;

  for (let attempt = 1; attempt <= 6; attempt++) {
    reasonClicked = await reportPage.evaluate((cfg) => {
      const all = Array.from(document.querySelectorAll('*'));

      // Method 1: Look specifically for link with r=<code>
      const rCode = cfg.rCode;
      const rLink = document.querySelector(`a[href*="r=${rCode}"], [data-value*="${rCode}"], [data-reason="${rCode}"]`);
      if (rLink) {
        rLink.scrollIntoView({ block: 'center' });
        rLink.click();
        return true;
      }

      // Method 2: Match leaf text element for keywords
      const reasonEl = all.find(el => {
        const t = (el.innerText || el.textContent || '').toLowerCase().trim();
        return cfg.keywords.some(kw => t === kw || t.startsWith(kw + '\n') || t === kw.replace('-', ' ')) &&
          el.children.length === 0;
      });

      if (reasonEl) {
        const clickable = reasonEl.closest('a, button, [role="button"], [role="radio"], [role="listitem"], li, div[tabindex]') || reasonEl.parentElement;
        if (clickable) {
          clickable.scrollIntoView({ block: 'center' });
          clickable.click();
          const innerLink = clickable.querySelector('a, button');
          if (innerLink && innerLink !== clickable) innerLink.click();
          return true;
        }
        reasonEl.click();
        return true;
      }

      // Method 3: Fallback search for radio buttons or labels
      const radioOrLabel = all.find(el => {
        const t = (el.innerText || el.textContent || '').toLowerCase();
        const aria = (el.getAttribute('aria-label') || '').toLowerCase();
        return cfg.keywords.some(kw => t.includes(kw) || aria.includes(kw)) &&
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
    }, reasonCfg).catch(() => false);

    if (reasonClicked) {
      console.log(`✅ "${reasonCfg.label}" option selected successfully!`);
      break;
    }

    await sleep(1500);
  }

  if (!reasonClicked) {
    // Also check any embedded iframes if reason was not found in main document
    const frames = reportPage.frames();
    for (const frame of frames) {
      try {
        reasonClicked = await frame.evaluate((cfg) => {
          const rLink = document.querySelector(`a[href*="r=${cfg.rCode}"], [data-value*="${cfg.rCode}"], [data-reason="${cfg.rCode}"]`);
          if (rLink) { rLink.scrollIntoView({ block: 'center' }); rLink.click(); return true; }
          const all = Array.from(document.querySelectorAll('*'));
          const el = all.find(e => {
            const t = (e.innerText || e.textContent || '').toLowerCase().trim();
            return cfg.keywords.some(kw => t === kw || t.startsWith(kw + '\n')) && e.children.length === 0;
          });
          if (el) { el.click(); return true; }
          return false;
        }, reasonCfg).catch(() => false);
        if (reasonClicked) {
          console.log(`✅ "${reasonCfg.label}" option selected successfully inside iframe!`);
          break;
        }
      } catch (e) {}
    }
  }

  if (!reasonClicked) {
    console.warn(`⚠️ Could not directly select "${reasonCfg.label}" option. Saving diagnostic screenshot to report_logs/errors/`);
    await captureErrorScreenshot(reportPage, 'maps_reason_error');
    throw new Error(`Could not locate or select violation reason "${reasonCfg.label}" in Google report dialog`);
  }

  // --------------------------------------------------------------------------
  // [Step 6] Navigate to Submit Page & Click Submit Button
  // --------------------------------------------------------------------------
  console.log('\n[Step 6] ⏳ Waiting for submit page to load...');
  await sleep(3000);

  // Intermediate "Next" button in certain regional flows
  await reportPage.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button, div[role="button"]'));
    const nextBtn = buttons.find(btn => {
      const t = (btn.innerText || btn.textContent || '').trim().toLowerCase();
      return t === 'next' && !btn.disabled;
    });
    if (nextBtn) {
      nextBtn.scrollIntoView({ block: 'center' });
      nextBtn.click();
      return true;
    }
    return false;
  }).catch(() => false);

  await sleep(2000);

  console.log('👉 Attempting to click Submit / Report button...');

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
          t === 'send'
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
      console.log('🎉 "Submit" button clicked successfully!');
      break;
    }

    await sleep(1500);
  }

  if (!submitted) {
    console.warn('⚠️ Submit button was not automatically found. Saving diagnostic screenshot to report_logs/errors/');
    await captureErrorScreenshot(reportPage, 'maps_submit_btn_error').catch(() => {});
  }

  // --------------------------------------------------------------------------
  // [Step 7] Submission Verification & Proof Archiving
  // --------------------------------------------------------------------------
  console.log('\n[Step 7] ⏳ Verifying report submission confirmation...');
  await sleep(4000);

  const confirmationStatus = await reportPage.evaluate(() => {
    const text = (document.body.innerText || '').toLowerCase();
    const url = window.location.href;

    const isConfirmed = (
      url.includes('/confirmation') ||
      text.includes('report received') ||
      text.includes('thank you for reporting') ||
      text.includes('thanks for reporting') ||
      text.includes('already reported')
    );

    return {
      isConfirmed,
      currentUrl: url
    };
  }).catch(() => ({ isConfirmed: false, currentUrl: '' }));

  if (confirmationStatus.isConfirmed) {
    console.log('🏆 [Final Confirmation] Report was successfully received by Google!');
    console.log(`📄 Confirmation URL: ${confirmationStatus.currentUrl}`);
  } else if (submitted) {
    console.log('ℹ️ Submit button was clicked; awaiting backend confirmation...');
  } else {
    console.warn('⚠️ Neither submit confirmation nor submit button could be confirmed.');
    await captureErrorScreenshot(reportPage, 'maps_submit_error').catch(() => {});
    throw new Error('Report submission could not be verified by confirmation response');
  }

  // Capture final proof screenshot
  const proofRes = await captureProofScreenshot(reportPage, `proof_${reasonCfg.label.toLowerCase().replace(/\s+/g, '_')}`);
  console.log(`📸 Proof screenshot saved successfully: ${proofRes ? proofRes.filename : 'report_logs/proofs'}`);

  // Dismiss "Done" button if present
  await reportPage.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button, div[role="button"]'));
    const doneBtn = buttons.find(btn => {
      const t = (btn.innerText || btn.textContent || '').trim().toLowerCase();
      return t === 'done' || t === 'close';
    });
    if (doneBtn) doneBtn.click();
  }).catch(() => {});

  // --------------------------------------------------------------------------
  // [Step 8] Dual Mode: Post-Report Legal Notice Submission
  // --------------------------------------------------------------------------
  if (shouldExecuteLegalNotice && activeType !== 'legal') {
    console.log('\n===========================================================');
    console.log('⚖️ [Dual Mode] Standard report completed. Now filing Legal Notice...');
    console.log('===========================================================');
    await executeLegalNoticeFlow({
      page,
      browser,
      reportPage,
      reviewUrl,
      details,
      aiOptions,
      senderInfo,
      cursor,
      smartClick,
      sleep
    });
  }

  console.log('\n===========================================================');
  console.log('✅ Google Maps fake review report completed successfully!');
  console.log('===========================================================');
  return true;
}

module.exports = {
  runMapsReporter,
  DEFAULT_MAPS_URL,
  REASON_CONFIGS
};
