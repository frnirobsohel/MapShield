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
  attachDialogAutoHandler,
  handleConsentIfPresent,
  captureProofScreenshot,
  captureErrorScreenshot,
  waitForActionableElement,
  detectPageAnomaly,
  waitForPageOrTabTransition
} = require('../helpers');

const DEFAULT_MAPS_URL = 'https://maps.app.goo.gl/S2ejSm9dnnCwAjoq7';

// Mapping of violation reasons to Google Maps RAP reason codes and keywords matching the official Google dialog
const REASON_CONFIGS = {
  offtopic: {
    rCode: '1',
    keywords: ['off topic', 'off-topic', 'offtopic', "doesn't pertain to an experience", 'wrong business'],
    label: 'Off topic'
  },
  spam: {
    rCode: '2',
    keywords: ['spam', 'bot, a fake account', 'fake account', 'ads and promotions', 'advertising', 'bought'],
    label: 'Spam'
  },
  conflict: {
    rCode: '3',
    keywords: ['conflict of interest', 'affiliated with the business', "competitor's business", 'competitor'],
    label: 'Conflict of interest'
  },
  profanity: {
    rCode: '4',
    keywords: ['profanity', 'swear words', 'pornographic', 'sexually explicit', 'obscene'],
    label: 'Profanity'
  },
  harmful: {
    rCode: '5',
    keywords: ['harmful', 'self-harm', 'dangerous items', 'graphic violence', 'violence to people or animals'],
    label: 'Harmful'
  },
  bullying: {
    rCode: '6',
    keywords: ['bullying or harassment', 'bullying', 'harassment', 'personally attacks a specific individual', 'personal attack'],
    label: 'Bullying or harassment'
  },
  discrimination: {
    rCode: '7',
    keywords: ['discrimination or hate speech', 'discrimination', 'hate speech', 'harmful language about an individual or group based on identity'],
    label: 'Discrimination or hate speech'
  },
  personal_info: {
    rCode: '8',
    keywords: ['personal information', 'contains personal information', 'address or phone number', 'phone number'],
    label: 'Personal information'
  },
  not_helpful: {
    rCode: '12',
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
  sleep = defaultSleep,
  captchaApiKey,
  captchaAutoSolve
}) {
  console.log('[Legal Notice] Generating formal removal complaint...');

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
    cursor,
    captchaApiKey,
    captchaAutoSolve
  });

  return {
    ...legalNotice,
    legalResult,
    success: !!(legalResult && legalResult.success !== false)
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
  senderInfo = {},
  captchaApiKey,
  captchaAutoSolve
}) {
  sleep = sleep || defaultSleep;
  humanScroll = humanScroll || defaultHumanScroll;
  humanWanderMouse = humanWanderMouse || defaultHumanWanderMouse;
  smartClick = smartClick || (async (btn) => defaultSmartClick(page, cursor, btn));

  const targetUrl = reviewUrl || DEFAULT_MAPS_URL;

  // Auto-accept any browser dialogs (such as "Leave site?" when transitioning from Gmail)
  if (attachDialogAutoHandler) {
    attachDialogAutoHandler(page);
  }

  console.log(`\n[Maps Reporter] Target URL: ${targetUrl}`);

  // Navigate to Google Maps review link
  await page.goto(targetUrl, {
    waitUntil: 'networkidle2',
    timeout: 60000
  });

  console.log('⏳ Synchronizing with Google Maps review page...');
  const initialAnomaly = await detectPageAnomaly(page);
  if (initialAnomaly.hasAnomaly || initialAnomaly.isAnomaly) {
    console.error(`🚨 Browser Anomaly Detected: ${initialAnomaly.message}`);
    if (initialAnomaly.type === 'CAPTCHA') {
      try {
        const { handlePageCaptcha } = require('../captcha/captcha_solver');
        console.log('🧩 [Maps Reporter]: Detected CAPTCHA anomaly. Invoking Auto-Solver...');
        await handlePageCaptcha(page, { apiKey: captchaApiKey, autoSolve: captchaAutoSolve });
      } catch (_) {}
    }
  }

  // Handle cookie consent or 'Before you continue to Google' dialogs
  try {
    await handleConsentIfPresent(page);
  } catch (e) {}

  // Await review card or container anchor readiness
  const reviewAnchorSelectors = [
    'div[data-review-id]',
    'div.jftiEf',
    'div.m6QErb',
    'div.fontBodyMedium',
    'div[role="main"]',
    'button[aria-label*="Actions for" i]',
    'button[aria-label*="options" i]'
  ].join(', ');

  const reviewLoaded = await waitForActionableElement(page, reviewAnchorSelectors, {
    timeout: 30000,
    visible: true,
    description: 'Review container anchor'
  });

  if (!reviewLoaded) {
    const anomaly = await detectPageAnomaly(page);
    if (anomaly.hasAnomaly || anomaly.isAnomaly) {
      console.error(`🚨 Browser Anomaly Detected while loading review: ${anomaly.message}`);
    } else {
      console.warn('⚠️ Review container anchor did not settle within 30s. Continuing best-effort...');
    }
  }

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

  // --------------------------------------------------------------------------
  // [Step 1] 3-Dots Button Detection & Click (Review-Scoped)
  // --------------------------------------------------------------------------
  console.log('🔍 Locating 3-dots menu button...');

  const dotsSelectors = [
    'button[aria-label*="Actions for"]',
    'button[aria-label*="actions for"]',
    'button[data-tooltip*="Actions for"]',
    'button[aria-label*="More actions"]',
    'button[aria-label*="more actions"]',
    'button[aria-label*="More options"]',
    'button[aria-label*="more options"]',
    'button[aria-label*="Options"]',
    'button[aria-label*="options"]',
    'button[aria-haspopup="menu"]',
    'button.al6KDe'
  ];

  const dotsFinder = async (p) => {
    // 0. Dismiss any lingering Share dialog if present
    await p.evaluate(() => {
      const shareDialog = document.querySelector('div[role="dialog"][aria-label*="Share" i], div.widget-pane-share-dialog');
      if (shareDialog) {
        const closeBtn = shareDialog.querySelector('button[aria-label*="Close" i], button[jsaction*="close"]');
        if (closeBtn) closeBtn.click();
      }
    }).catch(() => {});

    // 1. Selector search (strictly excluding Share buttons)
    for (const sel of dotsSelectors) {
      const btns = await p.$$(sel).catch(() => []);
      for (const btn of btns) {
        const isShare = await p.evaluate(el => {
          const aria = (el.getAttribute('aria-label') || '').toLowerCase();
          const tooltip = (el.getAttribute('data-tooltip') || '').toLowerCase();
          return aria.includes('share') || tooltip.includes('share');
        }, btn).catch(() => false);
        if (!isShare) return btn;
      }
    }
    // 2. Review container scoped search
    const scopedHandle = await p.evaluateHandle(() => {
      const reviewContainers = Array.from(document.querySelectorAll('[data-review-id], div.jftiEf, div.m6QErb div[role="region"], div.GKa6Le, div.fontBodyMedium'));
      for (const container of reviewContainers) {
        const dotsInContainer = Array.from(container.querySelectorAll('button, div[role="button"]')).find(b => {
          const aria = (b.getAttribute('aria-label') || '').toLowerCase();
          const tooltip = (b.getAttribute('data-tooltip') || '').toLowerCase();
          if (aria.includes('share') || tooltip.includes('share')) return false;
          const hasMenu = b.getAttribute('aria-haspopup') === 'menu';
          return (
            aria.includes('action') ||
            aria.includes('option') ||
            tooltip.includes('action') ||
            tooltip.includes('option') ||
            hasMenu
          );
        });
        if (dotsInContainer) return dotsInContainer;
      }
      // 3. Global DOM search
      const buttons = Array.from(document.querySelectorAll('button, div[role="button"], [role="button"]'));
      return buttons.find(b => {
        const aria = (b.getAttribute('aria-label') || '').toLowerCase();
        const tooltip = (b.getAttribute('data-tooltip') || '').toLowerCase();
        if (aria.includes('share') || tooltip.includes('share')) return false;
        const hasMenu = b.getAttribute('aria-haspopup') === 'menu';
        const inner = (b.innerHTML || '').toLowerCase();
        const isMoreVert = inner.includes('more_vert') || inner.includes('m12 8c1.1');
        return (
          aria.includes('action') ||
          aria.includes('more option') ||
          aria.includes('option') ||
          tooltip.includes('option') ||
          tooltip.includes('more') ||
          hasMenu ||
          isMoreVert
        );
      }) || null;
    }).catch(() => null);

    return scopedHandle ? scopedHandle.asElement() : null;
  };

  const dotsBtn = await waitForActionableElement(page, dotsFinder, {
    timeout: 20000,
    visible: true,
    description: '3-Dots Options Menu button'
  });

  if (!dotsBtn) {
    console.error('❌ Failed to locate 3-Dots button on review. Saving diagnostic screenshot to report_logs/errors/');
    await captureErrorScreenshot(page, 'maps_dots_error');
    throw new Error(`Failed to locate 3-Dots (More Options) button on review page: ${targetUrl}`);
  }

  console.log('[Step 1] 3-dots button is actionable. Clicking...');
  if (smartClick) {
    await smartClick(dotsBtn);
  } else {
    await dotsBtn.click();
  }
  console.log('✅ 3-Dots button clicked successfully.');
  await sleep(1200);

  // --------------------------------------------------------------------------
  // [Step 2 & 3] Click "Report review" from Menu
  // --------------------------------------------------------------------------
  console.log('🔍 Locating "Report review" menu item (strictly excluding Share review)...');

  const reportItemFinder = async (p) => {
    const handle = await p.evaluateHandle(() => {
      const shareWords = ['share', 'partager', 'compartir', 'teilen', 'condividi', 'ভাগ', 'साझा', 'поделиться', 'del', 'compartilhar', 'bagikan', 'osztás', 'sdílet', 'udostępnij', 'deel'];
      const reportWords = ['report', 'flag', 'signaler', 'denunciar', 'melden', 'segnala', 'রিপোর্ট', 'शिकायत', 'пожаловаться', 'rapporter', 'informar', 'laporkan', 'jelentés', 'nahlásit', 'zgłoś', 'rapotu'];

      const checkMultiLang = (el) => {
        const text = (el.innerText || el.textContent || '').trim().toLowerCase();
        const aria = (el.getAttribute('aria-label') || '').toLowerCase();
        const str = text + ' ' + aria;

        const isShare = shareWords.some(w => str.includes(w));
        const isReport = reportWords.some(w => str.includes(w));
        return { isShare, isReport };
      };

      // 1. Direct query on distinct menu items (never container role="menu")
      const items = Array.from(document.querySelectorAll('[role="menuitem"], [role="menuitemradio"], .nbpdpb, li[role="menuitem"]'));
      for (const item of items) {
        if (item.querySelectorAll('[role="menuitem"]').length > 1) continue;
        if (item.getAttribute('role') === 'menu') continue;

        const { isShare, isReport } = checkMultiLang(item);
        if (isShare) continue;
        if (isReport) return item;
      }

      // 2. Leaf element search inside open menu
      const allLeaves = Array.from(document.querySelectorAll('[role="menu"] *, div.action-menu *, .fxKbKc *, [role="menuitem"] *'));
      for (const leaf of allLeaves) {
        if (leaf.children.length > 0) continue;

        const { isShare, isReport } = checkMultiLang(leaf);
        if (isShare) continue;
        if (isReport) return leaf.closest('[role="menuitem"], .nbpdpb, [role="button"]') || leaf;
      }

      // 3. Fallback: text search strictly rejecting anything with "share"
      const fallbacks = Array.from(document.querySelectorAll('div, span, button, a'));
      for (const el of fallbacks) {
        if (el.getAttribute('role') === 'menu') continue;
        if (el.querySelectorAll('[role="menuitem"]').length > 1) continue;

        const { isShare, isReport } = checkMultiLang(el);
        if (isShare) continue;
        if (isReport) return el.closest('[role="menuitem"], .nbpdpb, [role="button"]') || el;
      }

      return null;
    }).catch(() => null);

    return handle ? handle.asElement() : null;
  };

  const reportMenuItem = await waitForActionableElement(page, reportItemFinder, {
    timeout: 15000,
    visible: true,
    description: '"Report review" menu item'
  });

  if (!reportMenuItem) {
    console.error('❌ Failed to click "Report review" option. Saving diagnostic screenshot to report_logs/errors/');
    await captureErrorScreenshot(page, 'maps_report_click_error');
    throw new Error('Failed to click "Report review" option from 3-dots dropdown menu');
  }

  // Ensure element is scrolled into view
  await page.evaluate(el => {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, reportMenuItem).catch(() => {});
  await sleep(400);

  console.log('[Step 2] "Report review" menu item is actionable. Clicking...');
  if (smartClick) {
    await smartClick(reportMenuItem);
  } else {
    await reportMenuItem.click();
  }
  // Secondary native click dispatch to guarantee event trigger
  await page.evaluate(el => {
    if (el && typeof el.click === 'function') el.click();
  }, reportMenuItem).catch(() => {});

  console.log('[Step 3] "Report review" clicked. Awaiting report dialog / tab...');

  // --------------------------------------------------------------------------
  // [Step 4] Dynamic Tab & Dialog Resolution Engine
  // --------------------------------------------------------------------------
  let reportPage = page;
  let reportCursor = cursor;
  const browser = page.browser();

  console.log('🔍 Synchronizing with report dialog or tab...');
  const reportTargetPatterns = [
    '/rap/report',
    '/content/rap',
    '/report?',
    '/local/content/rap',
    p => {
      const u = p.url();
      return u.includes('report') || u.includes('rap');
    }
  ];

  const transitionedReportPage = await waitForPageOrTabTransition(browser, page, reportTargetPatterns, {
    timeout: 15000,
    actionName: 'Report Dialog / Tab'
  });

  if (transitionedReportPage) {
    reportPage = transitionedReportPage;
    if (attachDialogAutoHandler) {
      attachDialogAutoHandler(reportPage);
    }
    await reportPage.bringToFront().catch(() => {});
    reportCursor = createCursor(reportPage);
    console.log(`🎯 Report page detected in tab and focused: ${reportPage.url()}`);
  } else {
    // If no new tab opened, check if an in-page modal dialog appeared on current page
    const dialogModal = await waitForActionableElement(page, 'div[role="dialog"], [aria-modal="true"], iframe[src*="rap"], iframe[src*="report"]', {
      timeout: 6000,
      description: 'In-page report modal dialog'
    });
    if (dialogModal) {
      console.log('🎯 Report modal dialog detected and actionable on current page.');
    } else {
      console.log('ℹ️ Proceeding with active page for report form.');
    }
  }

  const reportAnomaly = await detectPageAnomaly(reportPage);
  if (reportAnomaly.hasAnomaly || reportAnomaly.isAnomaly) {
    console.error(`🚨 Browser Anomaly Detected on Report Page: ${reportAnomaly.message}`);
    if (reportAnomaly.type === 'CAPTCHA') {
      try {
        const { handlePageCaptcha } = require('../captcha/captcha_solver');
        console.log('🧩 [Maps Reporter]: Detected CAPTCHA on report page. Invoking Auto-Solver...');
        await handlePageCaptcha(reportPage, { apiKey: captchaApiKey, autoSolve: captchaAutoSolve });
      } catch (_) {}
    }
  }

  // --------------------------------------------------------------------------
  // [Step 5] Report Action: Legal Notice vs Standard Category
  // --------------------------------------------------------------------------
  if (activeType === 'legal' || activeReason === 'legal') {
    console.log('[Step 5] Initiating Legal Notice submission...');

    // If reportPage has a direct link to legal issues, click it to transfer review context
    const legalLinkFound = await reportPage.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a, button, [role="button"], [role="link"]'));
      const target = links.find(el => {
        const h = (el.getAttribute('href') || '').toLowerCase();
        const t = (el.innerText || el.textContent || '').toLowerCase().trim();
        return (
          h.includes('troubleshooter') ||
          h.includes('/legal') ||
          t.includes('legal issue') ||
          t.includes('legal')
        );
      });
      if (target) {
        target.scrollIntoView({ block: 'center' });
        target.click();
        return true;
      }
      return false;
    }).catch(() => false);

    if (legalLinkFound) {
      console.log('[Step 5] Clicked legal removal link from report dialog.');
      await sleep(3000);
    }

    const legalResult = await executeLegalNoticeFlow({
      page,
      browser,
      reportPage,
      reviewUrl: targetUrl,
      details,
      aiOptions,
      senderInfo,
      cursor: reportCursor || cursor,
      smartClick,
      sleep,
      captchaApiKey,
      captchaAutoSolve
    });

    console.log('[Legal Notice] Completed.');
    return legalResult;
  }

  // Standard Option Detection & Selection
  const reasonCfg = REASON_CONFIGS[activeReason] || REASON_CONFIGS.spam;
  console.log(`\n🔍 Synchronizing with "${reasonCfg.label}" violation option...`);

  const reasonFinder = async (p) => {
    // 1. Check in page DOM
    const handle = await p.evaluateHandle((cfg) => {
      const rCode = cfg.rCode;

      // Primary A: Direct RAP submit link matching exact r parameter
      const rLinks = Array.from(document.querySelectorAll('a[href*="report/submit"], a[href*="/rap/report"], [data-value], [data-reason]'));
      const exactRLink = rLinks.find(a => {
        const href = a.getAttribute('href') || '';
        const dataVal = a.getAttribute('data-value') || '';
        const dataReason = a.getAttribute('data-reason') || '';
        return (
          new RegExp(`[?&]r=${rCode}(?:&|$)`).test(href) ||
          dataVal === rCode ||
          dataReason === rCode
        );
      });
      if (exactRLink) return exactRLink;

      // Primary B: Check by exact category title in .um5FIe or .dsrmTc (Google RAP design)
      const titleEls = Array.from(document.querySelectorAll('.um5FIe, .dsrmTc, .w51cd, [role="link"], li a'));
      for (const el of titleEls) {
        const t = (el.innerText || el.textContent || '').trim().toLowerCase();
        if (cfg.keywords.some(kw => t === kw || t.startsWith(kw + '\n') || t === kw.replace('-', ' '))) {
          return el.closest('a') || el;
        }
      }

      // Primary C: Check leaf nodes
      const all = Array.from(document.querySelectorAll('*'));
      const reasonEl = all.find(el => {
        const t = (el.innerText || el.textContent || '').toLowerCase().trim();
        return cfg.keywords.some(kw => t === kw || t.startsWith(kw + '\n') || t === kw.replace('-', ' ')) &&
          el.children.length === 0;
      });
      if (reasonEl) {
        return reasonEl.closest('a, button, [role="button"], [role="radio"], [role="listitem"], li, div[tabindex]') || reasonEl;
      }

      // Primary D: Check radio or button with aria-label
      const radioOrLabel = all.find(el => {
        const t = (el.innerText || el.textContent || '').toLowerCase();
        const aria = (el.getAttribute('aria-label') || '').toLowerCase();
        return cfg.keywords.some(kw => t.includes(kw) || aria.includes(kw)) &&
          (el.tagName === 'LABEL' || el.getAttribute('role') === 'radio' || el.getAttribute('role') === 'button');
      });
      return radioOrLabel || null;
    }, reasonCfg).catch(() => null);

    if (handle && handle.asElement()) return handle.asElement();

    // 2. Check frames
    for (const frame of p.frames()) {
      try {
        const fHandle = await frame.evaluateHandle((cfg) => {
          const rLinks = Array.from(document.querySelectorAll('a[href*="report/submit"], a[href*="/rap/report"], [data-value], [data-reason]'));
          const exactRLink = rLinks.find(a => {
            const href = a.getAttribute('href') || '';
            return new RegExp(`[?&]r=${cfg.rCode}(?:&|$)`).test(href);
          });
          if (exactRLink) return exactRLink;

          const titleEls = Array.from(document.querySelectorAll('.um5FIe, .dsrmTc, .w51cd, [role="link"], li a'));
          for (const el of titleEls) {
            const t = (el.innerText || el.textContent || '').trim().toLowerCase();
            if (cfg.keywords.some(kw => t === kw || t.startsWith(kw + '\n') || t === kw.replace('-', ' '))) {
              return el.closest('a') || el;
            }
          }

          const all = Array.from(document.querySelectorAll('*'));
          const el = all.find(e => {
            const t = (e.innerText || e.textContent || '').toLowerCase().trim();
            return cfg.keywords.some(kw => t === kw || t.startsWith(kw + '\n')) && e.children.length === 0;
          });
          return el ? (el.closest('a') || el) : null;
        }, reasonCfg).catch(() => null);
        if (fHandle && fHandle.asElement()) return fHandle.asElement();
      } catch (e) {}
    }
    return null;
  };

  const reasonElement = await waitForActionableElement(reportPage, reasonFinder, {
    timeout: 20000,
    visible: true,
    description: `Violation reason "${reasonCfg.label}"`
  });

  if (!reasonElement) {
    console.warn(`⚠️ Could not locate actionable "${reasonCfg.label}" option. Saving diagnostic screenshot to report_logs/errors/`);
    await captureErrorScreenshot(reportPage, 'maps_reason_error');
    throw new Error(`Could not locate or select violation reason "${reasonCfg.label}" in Google report dialog`);
  }

  // Ensure element is visible and centered in viewport before interaction
  await reportPage.evaluate((el) => {
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
    }
  }, reasonElement).catch(() => {});
  await sleep(400);

  console.log(`[Step 5] "${reasonCfg.label}" option is actionable. Selecting...`);
  let clicked = false;
  if (smartClick) {
    try {
      await smartClick(reasonElement);
      clicked = true;
    } catch (_) {}
  }
  if (!clicked) {
    try {
      await reasonElement.click();
      clicked = true;
    } catch (_) {}
  }

  // Native DOM dispatch & fallback trigger for Google RAP direct submit links
  await reportPage.evaluate((el) => {
    if (el) {
      if (typeof el.click === 'function') el.click();
      const href = el.getAttribute('href') || (el.closest('a') ? el.closest('a').getAttribute('href') : null);
      if (href && href.includes('report/submit')) {
        setTimeout(() => {
          if (!window.location.href.includes('/submit') && !window.location.href.includes('/confirmation')) {
            window.location.href = href;
          }
        }, 800);
      }
    }
  }, reasonElement).catch(() => {});
  console.log(`✅ "${reasonCfg.label}" option selected successfully!`);

  // --------------------------------------------------------------------------
  // [Step 6] Navigate to Submit Page & Click Submit Button
  // --------------------------------------------------------------------------
  console.log('\n🔍 Synchronizing with Submit / Report page...');
  await sleep(1500);

  let submitted = false;

  // 1. Check if already confirmed
  const alreadyConfirmed = await reportPage.evaluate(() => {
    const text = (document.body.innerText || '').toLowerCase();
    return window.location.href.includes('/confirmation') ||
      text.includes('thank you for reporting') ||
      text.includes('thanks for reporting') ||
      text.includes('report received');
  }).catch(() => false);

  if (alreadyConfirmed) {
    console.log('⚡ Direct submission confirmed!');
    submitted = true;
  } else {
    // 2. Intermediate "Next" button in certain regional flows
    const nextBtn = await reportPage.evaluateHandle(() => {
      const buttons = Array.from(document.querySelectorAll('button, div[role="button"]'));
      return buttons.find(btn => {
        const t = (btn.innerText || btn.textContent || '').trim().toLowerCase();
        return t === 'next' && !btn.disabled;
      }) || null;
    }).catch(() => null);

    if (nextBtn && nextBtn.asElement()) {
      console.log('👉 Clicking intermediate "Next" button...');
      await nextBtn.asElement().click();
      await sleep(1500);
    }

    console.log('👉 Attempting to click Submit / Report button...');

    for (let attempt = 1; attempt <= 8; attempt++) {
      submitted = await reportPage.evaluate(() => {
        // Direct exact match for Google RAP Submit button (button[jsname="haV7P"] or .mhBSmf button)
        const rapBtn = document.querySelector('button[jsname="haV7P"], .mhBSmf button');
        if (rapBtn) {
          rapBtn.scrollIntoView({ block: 'center' });
          rapBtn.click();
          return true;
        }

        // Match by span with text "Submit" or "Report"
        const spanSubmits = Array.from(document.querySelectorAll('span.VfPpkd-vQzf8d, span[jsname="V67aGc"]'));
        for (const span of spanSubmits) {
          const t = (span.innerText || span.textContent || '').trim().toLowerCase();
          if (t === 'submit' || t === 'report') {
            const btn = span.closest('button, [role="button"]') || span;
            btn.scrollIntoView({ block: 'center' });
            btn.click();
            return true;
          }
        }

        // Generic fallback for submit/report/send buttons
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

      await sleep(1000);
    }

    if (!submitted) {
      console.warn('⚠️ Submit button was not automatically found. Saving diagnostic screenshot to report_logs/errors/');
      await captureErrorScreenshot(reportPage, 'maps_submit_btn_error').catch(() => {});
    }
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
  if (shouldExecuteLegalNotice && activeType !== 'legal' && activeReason !== 'legal') {
    console.log('[Dual Mode] Standard report completed. Filing Legal Notice...');
    await executeLegalNoticeFlow({
      page,
      browser,
      reportPage,
      reviewUrl: targetUrl,
      details,
      aiOptions,
      senderInfo,
      cursor: reportCursor || cursor,
      smartClick,
      sleep,
      captchaApiKey,
      captchaAutoSolve
    });
  }

  console.log('[Maps Reporter] Report submitted successfully.');
  return true;
}

module.exports = {
  runMapsReporter,
  DEFAULT_MAPS_URL,
  REASON_CONFIGS
};
