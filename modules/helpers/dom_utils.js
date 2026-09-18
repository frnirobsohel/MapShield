/**
 * modules/helpers/dom_utils.js
 * DOM Interaction, Safe Smart Click & Button Handlers
 */

const { sleep, gaussianRandom } = require('./biometrics');

/**
 * Smart Click using ghost-cursor with graceful fallback to native element.click()
 * @param {import('rebrowser-puppeteer-core').Page} page
 * @param {Object} cursor ghost-cursor instance
 * @param {import('rebrowser-puppeteer-core').ElementHandle|string} target
 * @param {Function} [onAfterClick] Callback after click (e.g. syncActiveTab)
 * @returns {Promise<boolean>}
 */
async function smartClick(page, cursor, target, onAfterClick) {
  let element = target;
  if (typeof target === 'string') {
    element = await page.$(target).catch(() => null);
  }
  if (!element) return false;

  try {
    if (cursor && typeof cursor.click === 'function') {
      await cursor.click(element, {
        waitForClick: gaussianRandom(400, 80),
        maxWaitForPadding: gaussianRandom(250, 50)
      });
    } else {
      await element.click();
    }
    await sleep(gaussianRandom(500, 100));
    if (typeof onAfterClick === 'function') {
      await onAfterClick();
    }
    return true;
  } catch (err) {
    try {
      await element.click();
      await sleep(gaussianRandom(500, 100));
      if (typeof onAfterClick === 'function') {
        await onAfterClick();
      }
      return true;
    } catch (e) {
      return false;
    }
  }
}

/**
 * Clicks a button or link by inspecting innerText/textContent/aria-label in DOM
 * @param {import('rebrowser-puppeteer-core').Page} page
 * @param {string} tagSelectors CSS selectors e.g. 'button, [role="button"]'
 * @param {Array<string>} textKeywords Keyword strings to match (case-insensitive)
 * @returns {Promise<boolean>}
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
 * @param {import('rebrowser-puppeteer-core').Page} page
 * @param {string} [primaryId] Optional ID of the button
 * @param {Object} [cursor] Ghost cursor instance
 * @param {Function} [onAfterClick]
 * @returns {Promise<boolean>}
 */
async function clickGoogleNext(page, primaryId, cursor, onAfterClick) {
  const ids = primaryId ? [`#${primaryId}`, `#${primaryId} button`] : [];
  const validSelectors = [
    ...ids,
    'button[jsname="LgbsSe"]',
    'button[type="submit"]'
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
          await smartClick(page, cursor, btn, onAfterClick);
          return true;
        }
      }
    } catch (e) {}
  }

  // If not clicked by selector, search by button text
  const textClicked = await clickElementByText(page, 'button, [role="button"], div[role="button"]', [
    'next', 'continue', 'sign in'
  ]);
  if (textClicked) return true;

  // Fallback: Enter key
  await page.keyboard.press('Enter');
  return true;
}

/**
 * Dismisses cookie consent or "Stay signed out" prompts if present
 * @param {import('rebrowser-puppeteer-core').Page} page
 */
async function handleConsentIfPresent(page) {
  try {
    await clickElementByText(page, 'button, [role="button"]', [
      'accept all', 'i agree', 'stay signed out'
    ]);
  } catch (e) {
    // Ignore
  }
}

module.exports = {
  smartClick,
  clickElementByText,
  clickGoogleNext,
  handleConsentIfPresent
};
