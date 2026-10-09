/**
 * modules/captcha/captcha_solver.js
 * Universal CAPTCHA Auto-Solver Engine (Interactive Click-Based Solver)
 * 
 * Based on 2captcha/puppeteer-recaptcha-solver-using-clicks:
 * 1. Native reCAPTCHA DOM & Canvas Parameter Extraction (initCaptchaParamsExtractor)
 * 2. 2Captcha Grid API Resolution (@2captcha/captcha-solver)
 * 3. Human-like Mouse Coordinate Clicks (clickAtCoordinates & clickRecaptchaVerifyButton)
 * 4. Multi-round & dynamic replacement tiles handling
 * 5. Graceful fallback countdown
 */

const { sleep, randomBetween } = require('../helpers/biometrics');

/** Dynamic (reload-on-click) tile rounds before audio fallback. One-shot / 4x4 never use this. */
const DYNAMIC_AUDIO_AFTER_ROUNDS = 8;

/**
 * Checks if any CAPTCHA widget or challenge is present on the page
 * @param {import('rebrowser-puppeteer-core').Page} page
 * @returns {Promise<{ hasCaptcha: boolean, type: string|null, sitekey: string|null }>}
 */
async function detectCaptcha(page) {
  if (!page || typeof page.evaluate !== 'function') {
    return { hasCaptcha: false, type: null, sitekey: null };
  }

  try {
    return await page.evaluate(() => {
      // 1. Google reCAPTCHA & Robot Challenges (including Google Login "Confirm you're not a robot")
      const pageText = (document.body ? document.body.innerText : '').toLowerCase();
      const hasRobot = pageText.includes('confirm you’re not a robot') || pageText.includes('confirm you are not a robot');
      const recaptchaEl = document.querySelector('[data-sitekey], iframe[src*="recaptcha"], div.g-recaptcha, #captcha-form, #captcha, div[id*="captcha"]');
      if (recaptchaEl || hasRobot) {
        let sitekey = recaptchaEl && typeof recaptchaEl.getAttribute === 'function' ? recaptchaEl.getAttribute('data-sitekey') : null;
        if (!sitekey) {
          const iframe = document.querySelector('iframe[src*="recaptcha"]');
          if (iframe && iframe.src) {
            const m = iframe.src.match(/[?&]k=([^&]+)/);
            if (m) sitekey = m[1];
          }
        }
        return { hasCaptcha: true, type: 'recaptcha', sitekey: sitekey || null };
      }

      // 1.1 Google Distorted Image Text CAPTCHA (e.g. Type the text you see above)
      const imgCaptcha = document.querySelector('img#captchaimg, img[src*="Captcha"], img[src*="GetCaptcha"]');
      if (imgCaptcha) {
        return { hasCaptcha: true, type: 'image_captcha', sitekey: null };
      }

      // 2. Cloudflare Turnstile
      const turnstile = document.querySelector('iframe[src*="turnstile"], div.cf-turnstile');
      if (turnstile) {
        const sitekey = turnstile.getAttribute('data-sitekey') || null;
        return { hasCaptcha: true, type: 'turnstile', sitekey };
      }

      // 3. hCaptcha
      const hcaptcha = document.querySelector('iframe[src*="hcaptcha"], div.h-captcha');
      if (hcaptcha) {
        const sitekey = hcaptcha.getAttribute('data-sitekey') || null;
        return { hasCaptcha: true, type: 'hcaptcha', sitekey };
      }

      // 4. Google /sorry/ page
      if (window.location.href.includes('/sorry/index') || window.location.href.includes('google.com/sorry')) {
        let sorrySitekey = null;
        const sorryRecaptcha = document.querySelector('[data-sitekey], iframe[src*="recaptcha"], form[action*="sorry"] [data-sitekey], #captcha-form [data-sitekey]');
        if (sorryRecaptcha) {
          sorrySitekey = sorryRecaptcha.getAttribute('data-sitekey');
          if (!sorrySitekey && sorryRecaptcha.src) {
            const m = sorryRecaptcha.src.match(/[?&]k=([^&]+)/);
            if (m) sorrySitekey = m[1];
          }
        }
        return { hasCaptcha: true, type: 'google_sorry', sitekey: sorrySitekey || null };
      }

      return { hasCaptcha: false, type: null, sitekey: null };
    });
  } catch (err) {
    return { hasCaptcha: false, type: null, sitekey: null };
  }
}

/**
 * Checks if reCAPTCHA has been successfully solved on the page
 * @param {import('rebrowser-puppeteer-core').Page} page
 * @returns {Promise<boolean>}
 */
async function isRecaptchaPassed(page) {
  try {
    if (!page) return false;

    // 1. Check anchor checkbox state across frames
    if (typeof page.frames === 'function') {
      const frames = page.frames();
      for (const frame of frames) {
        if (!frame || (typeof frame.isDetached === 'function' && frame.isDetached())) continue;
        try {
          const isChecked = await frame.$('.recaptcha-checkbox-checked');
          if (isChecked) return true;
        } catch (_) {}
      }
    }

    // 2. Check if challenge bframe has disappeared / hidden
    const bframe = typeof page.$ === 'function'
      ? await page.$('iframe[src*="recaptcha/api2/bframe"]').catch(() => null)
      : null;

    if (!bframe && typeof page.evaluate === 'function') {
      const hasToken = await page.evaluate(() => {
        const ta = document.querySelector('textarea[name="g-recaptcha-response"], #g-recaptcha-response');
        return ta && ta.value && ta.value.length > 20;
      }).catch(() => false);
      if (hasToken) return true;
    }

    return false;
  } catch (_) {
    return false;
  }
}

/**
 * Checks for presence of reCAPTCHA challenge bframe and validates against DOS blocks
 * @param {import('rebrowser-puppeteer-core').Page} page
 * @param {number} [timeoutMs=8000]
 * @returns {Promise<{ found: boolean, dosBlocked: boolean, frame: any }>}
 */
async function isFoundRecaptchaChallengeFrame(page, timeoutMs = 8000) {
  try {
    if (!page || typeof page.waitForSelector !== 'function') {
      return { found: false, dosBlocked: false, frame: null };
    }

    const frameHandle = await page.waitForSelector(
      'iframe[src*="recaptcha/api2/bframe"], iframe[title*="recaptcha challenge"]',
      { timeout: timeoutMs }
    ).catch(() => null);

    if (!frameHandle) {
      return { found: false, dosBlocked: false, frame: null };
    }

    const frame = await frameHandle.contentFrame();
    if (!frame) {
      return { found: false, dosBlocked: false, frame: null };
    }

    // Check for Google reCAPTCHA DOS message
    const isFoundDosMessage = await frame.evaluate(() => {
      const dosMessageElement = document.querySelector('.rc-doscaptcha-header');
      return !!dosMessageElement;
    }).catch(() => false);

    if (isFoundDosMessage) {
      console.warn('⚠️ [2Captcha Clicks]: reCAPTCHA DOS Limit triggered: "Try again later. Your computer or network may be sending automated queries."');
      return { found: false, dosBlocked: true, frame };
    }

    return { found: true, dosBlocked: false, frame };
  } catch (err) {
    return { found: false, dosBlocked: false, frame: null };
  }
}

/**
 * Injects parameter extraction function inside the reCAPTCHA challenge bframe
 * Draws tiles on in-memory canvas to assemble clean JPEG representation for 2Captcha Grid API
 * @param {any} frame Puppeteer Frame
 */
async function initCaptchaParamsExtractor(frame) {
  if (!frame || typeof frame.evaluate !== 'function') return;

  await frame.evaluate(() => {
    // Waits until an <img> is fully decoded (complete + non-zero natural size),
    // so we never composite a half-faded / blank replacement tile onto the canvas.
    window.__waitForTileLoaded = (img, timeoutMs = 4000) => {
      return new Promise((resolve) => {
        if (!img) return resolve(false);
        const isReady = () => img.complete && img.naturalWidth > 0 && img.naturalHeight > 0;
        if (isReady()) return resolve(true);

        let settled = false;
        const finish = (ok) => {
          if (settled) return;
          settled = true;
          clearInterval(poll);
          clearTimeout(timer);
          resolve(ok);
        };
        // Poll because reCAPTCHA swaps the <img> src during the fade animation.
        const poll = setInterval(() => { if (isReady()) finish(true); }, 120);
        const timer = setTimeout(() => finish(isReady()), timeoutMs);
      });
    };

    window.getRecaptchaParams = () => {
      return new Promise(async (resolve, reject) => {
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          const descEl = document.querySelector('.rc-imageselect-desc-wrapper') || document.querySelector('.rc-imageselect-desc');
          const comment = descEl ? descEl.innerText.replace(/\n+/g, ' ').trim() : '';

          const img4x4 = document.querySelector('img.rc-image-tile-44');
          if (!img4x4) {
            const table3x3 = document.querySelector('table.rc-imageselect-table-33 > tbody') || document.querySelector('table.rc-imageselect-table-33');
            if (!table3x3) {
              reject(new Error('Cannot find reCAPTCHA grid elements in frame'));
              return;
            }

            const initial3x3img = table3x3.querySelector('img.rc-image-tile-33');
            if (!initial3x3img) {
              reject(new Error('Cannot find initial 3x3 image tile'));
              return;
            }

            // LOAD-GUARD: base tile must be fully decoded before measuring / drawing.
            await window.__waitForTileLoaded(initial3x3img);

            canvas.width = initial3x3img.naturalWidth || initial3x3img.width || 300;
            canvas.height = initial3x3img.naturalHeight || initial3x3img.height || 300;
            ctx.drawImage(initial3x3img, 0, 0);

            // Handle replacement tiles (fading tiles) in 3x3 dynamic challenge
            const updatedTiles = Array.from(document.querySelectorAll('img.rc-image-tile-11'));
            if (updatedTiles.length > 0) {
              const pos = [
                { x: 0, y: 0 },
                { x: ctx.canvas.width / 3, y: 0 },
                { x: (ctx.canvas.width / 3) * 2, y: 0 },
                { x: 0, y: ctx.canvas.height / 3 },
                { x: ctx.canvas.width / 3, y: ctx.canvas.height / 3 },
                { x: (ctx.canvas.width / 3) * 2, y: ctx.canvas.height / 3 },
                { x: 0, y: (ctx.canvas.height / 3) * 2 },
                { x: ctx.canvas.width / 3, y: (ctx.canvas.height / 3) * 2 },
                { x: (ctx.canvas.width / 3) * 2, y: (ctx.canvas.height / 3) * 2 },
              ];

              // LOAD-GUARD: wait for every replacement tile to finish fading-in first.
              await Promise.all(updatedTiles.map((t) => window.__waitForTileLoaded(t)));

              updatedTiles.forEach((tile) => {
                if (!(tile.complete && tile.naturalWidth > 0)) return; // skip still-blank tiles
                const cell = tile.closest('td');
                const allCells = cell && cell.parentElement && cell.parentElement.parentElement
                  ? Array.from(cell.parentElement.parentElement.querySelectorAll('td'))
                  : [];
                const ind = cell ? allCells.indexOf(cell) : -1;
                if (ind >= 0 && pos[ind]) {
                  ctx.drawImage(tile, pos[ind].x, pos[ind].y);
                }
              });
            }

            resolve({
              rows: 3,
              columns: 3,
              type: 'GridTask',
              comment: comment || 'Select matching images',
              body: canvas.toDataURL('image/jpeg').replace(/^data:image\/?[A-Za-z]*;base64,/, '')
            });
          } else {
            // LOAD-GUARD: 4x4 single-image tile.
            await window.__waitForTileLoaded(img4x4);

            canvas.width = img4x4.naturalWidth || img4x4.width || 450;
            canvas.height = img4x4.naturalHeight || img4x4.height || 450;
            ctx.drawImage(img4x4, 0, 0);
            resolve({
              rows: 4,
              columns: 4,
              type: 'GridTask',
              comment: comment || 'Select matching images',
              body: canvas.toDataURL('image/jpeg').replace(/^data:image\/?[A-Za-z]*;base64,/, '')
            });
          }
        } catch (e) {
          reject(e);
        }
      });
    };
  });
}

/**
 * Retrieves captcha image parameters from the challenge frame
 * @param {any} frame 
 * @returns {Promise<{ rows: number, columns: number, comment: string, body: string, type: string }>}
 */
async function getCaptchaParams(frame) {
  if (!frame || typeof frame.evaluate !== 'function') {
    throw new Error('Frame evaluate unavailable');
  }
  return await frame.evaluate(() => {
    return window.getRecaptchaParams();
  });
}

/**
 * Detects the active reCAPTCHA image challenge style.
 *   - 'dynamic'  : "Click verify once there are none left" — tiles fade & are replaced on click.
 *                  Must NOT verify until 2Captcha returns No_matching_images.
 *   - 'multi'    : 4x4 "Select all squares with ..." one-shot multi-select.
 *   - 'oneshot'  : 3x3 single "Select all images with ..." — click all, verify once.
 * @param {any} frame Puppeteer challenge bframe
 * @returns {Promise<{ style: 'dynamic'|'multi'|'oneshot', comment: string }>}
 */
async function getChallengeType(frame) {
  if (!frame || typeof frame.evaluate !== 'function') {
    return { style: 'oneshot', comment: '' };
  }
  return await frame.evaluate(() => {
    const descEl = document.querySelector('.rc-imageselect-desc-wrapper') || document.querySelector('.rc-imageselect-desc');
    const comment = descEl ? descEl.innerText.replace(/\n+/g, ' ').trim() : '';
    const lowered = comment.toLowerCase();

    // 4x4 is ALWAYS a one-shot split-image ("Select all squares with X / If there are none, click skip").
    // Tiles highlight on click; they NEVER fade/replace. Check this FIRST so "if there are none, click skip"
    // cannot be confused with the 3x3 dynamic "click verify once there are none left".
    const is4x4 = !!document.querySelector('img.rc-image-tile-44, table.rc-imageselect-table-44');
    if (is4x4) return { style: 'multi', comment };

    // Dynamic 3x3 = clicked tiles fade and are replaced. Trust the instruction, or live
    // replacement <img.rc-image-tile-11> tiles once the first round has already clicked.
    const hasReplacementTiles = !!document.querySelector('img.rc-image-tile-11');
    const isDynamicText =
      lowered.includes('none left') ||
      lowered.includes('once there are none') ||
      lowered.includes('click verify once') ||
      lowered.includes('there are none left') ||
      (lowered.includes('verify') &&
        (lowered.includes('none') || lowered.includes('no more') || lowered.includes('left'))) ||
      lowered.includes('keine mehr') ||
      lowered.includes('übrig sind') ||
      lowered.includes('no queden') ||
      lowered.includes("n'en reste plus") ||
      lowered.includes('reste plus') ||
      (lowered.includes('nessuna') && lowered.includes('verifica')) ||
      (lowered.includes('nenhuma') && lowered.includes('verificar'));

    if (isDynamicText || hasReplacementTiles) return { style: 'dynamic', comment };
    return { style: 'oneshot', comment };
  }).catch(() => ({ style: 'oneshot', comment: '' }));
}

/**
 * Parses 2Captcha Grid API click payload ("click:1/5/9") into 1-based tile numbers.
 * @param {string} data
 * @returns {number[]}
 */
function parseGridClicks(data) {
  if (!data || data === 'No_matching_images') return [];
  return String(data)
    .replace('click:', '')
    .split('/')
    .map(Number)
    .filter((n) => !isNaN(n) && n > 0);
}

/**
 * Dynamic reCAPTCHA only reloads tiles that were clicked last round.
 * Unchanged tiles were already judged "no match" — if 2Captcha re-flags them,
 * those are false positives (the exact "1 real crosswalk + 2 extra wrong" failure).
 * @param {number[]} clicks
 * @param {Set<number>|null} reloadedTiles
 * @returns {{ kept: number[], dropped: number[] }}
 */
function filterReloadedTileClicks(clicks, reloadedTiles) {
  if (!reloadedTiles || reloadedTiles.size === 0) {
    return { kept: clicks.slice(), dropped: [] };
  }
  const kept = [];
  const dropped = [];
  for (const n of clicks) {
    if (reloadedTiles.has(n)) kept.push(n);
    else dropped.push(n);
  }
  return { kept, dropped };
}

/**
 * Reads the reCAPTCHA challenge error/validation banner state so the loop can react
 * instead of blindly clicking Verify.
 *   - incorrect  : wrong tiles were selected ("Please try again") → challenge reshuffles.
 *   - selectMore : one-shot needs more selections ("Please select all matching images").
 *   - dynamicMore: dynamic challenge wants the newly appeared images checked too.
 * @param {any} frame Puppeteer challenge bframe
 * @returns {Promise<{ incorrect: boolean, selectMore: boolean, dynamicMore: boolean }>}
 */
async function getChallengeErrorState(frame) {
  const empty = { incorrect: false, selectMore: false, dynamicMore: false };
  if (!frame || typeof frame.evaluate !== 'function') return empty;
  return await frame.evaluate(() => {
    const isVisible = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
      return (el.innerText || '').trim().length > 0 || el.offsetParent !== null;
    };
    return {
      incorrect: isVisible('.rc-imageselect-incorrect-response'),
      selectMore: isVisible('.rc-imageselect-error-select-more') || isVisible('.rc-imageselect-error-select-something'),
      dynamicMore: isVisible('.rc-imageselect-error-dynamic-more')
    };
  }).catch(() => empty);
}

/**
 * Waits until the freshly composed grid image differs from the one previously sent to
 * 2Captcha — i.e. the clicked tiles have faded out and their replacement images have
 * fully loaded & composited. This is the core guard that prevents re-sending a STALE grid
 * (which makes 2Captcha return the OLD tile positions and causes clicking now-wrong tiles).
 *
 * Measured on live reCAPTCHA: replacement <img.rc-image-tile-11> can take ~2.5s+ to even
 * appear in the DOM, so a fixed sleep is unreliable — we poll on actual visual change.
 *
 * @param {any} frame challenge bframe
 * @param {string|null} prevBody base64 body previously sent to 2Captcha
 * @param {number} [timeoutMs=11000]
 * @returns {Promise<boolean>} true if a changed grid was observed, false on timeout
 */
async function waitForGridChange(frame, prevBody, timeoutMs = 11000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await sleep(500);
    let params;
    try {
      params = await getCaptchaParams(frame); // load-guard inside blocks on half-faded tiles
    } catch (_) {
      continue;
    }
    if (params && params.body && params.body !== prevBody) {
      return true;
    }
  }
  return false;
}

/**
 * Official 2Captcha Selenium pattern: after clicking N dynamic tiles, wait until EACH
 * clicked cell has a fully-loaded replacement <img.rc-image-tile-11>. Sending the grid
 * before all N have swapped is what makes 2Captcha re-see leftover crosswalks and
 * return extra (wrong) clicks.
 * @param {any} frame
 * @param {number[]} clickedTiles 1-based indices
 * @param {string|null} prevBody
 * @param {number} [timeoutMs=11000]
 * @returns {Promise<boolean>}
 */
async function waitForClickedTilesReloaded(frame, clickedTiles, prevBody, timeoutMs = 11000) {
  const wanted = (clickedTiles || []).filter((n) => n > 0);
  if (wanted.length === 0) return waitForGridChange(frame, prevBody, timeoutMs);

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await sleep(400);
    const allReady = await frame.evaluate((indices) => {
      const table = document.querySelector(
        'table.rc-imageselect-table-33, table[class*="rc-imageselect-table"]'
      );
      if (!table) return false;
      const cells = Array.from(table.querySelectorAll('td.rc-imageselect-tile, td'));
      return indices.every((n) => {
        const cell = cells[n - 1];
        if (!cell) return false;
        const img = cell.querySelector('img.rc-image-tile-11');
        return !!(img && img.complete && img.naturalWidth > 0);
      });
    }, wanted).catch(() => false);

    if (!allReady) continue;

    try {
      const params = await getCaptchaParams(frame);
      if (params && params.body && params.body !== prevBody) return true;
    } catch (_) {}
    // All clicked cells show a loaded replacement, but composite may still match
    // lastSentBody for a moment — keep polling until the canvas actually changes.
  }
  return false;
}

/**
 * Calculates tile coordinates and performs human-like mouse click
 * @param {import('rebrowser-puppeteer-core').Page} page
 * @param {any} frame
 * @param {number} recaptchaSize 3 or 4
 * @param {number} number Tile number (1-based index)
 */
async function clickAtCoordinates(page, frame, recaptchaSize = 3, number = 1) {
  if (!page || !page.mouse) return;

  const frameHandle = typeof page.$ === 'function'
    ? await page.$('iframe[src*="recaptcha/api2/bframe"], iframe[title*="recaptcha challenge"]').catch(() => null)
    : null;
  if (!frameHandle) return;

  const boundingBox = await frameHandle.boundingBox().catch(() => null);
  if (!boundingBox) return;

  let x = null;
  let y = null;

  // PRIMARY: measure the actual <td> cell rectangle inside the bframe. This is robust
  // against instruction-text wrapping that shifts the grid up/down (hardcoded offsets drift).
  if (frame && typeof frame.evaluate === 'function') {
    const cellRect = await frame.evaluate((idx) => {
      const table = document.querySelector('table.rc-imageselect-table-33, table.rc-imageselect-table-44, table[class*="rc-imageselect-table"]');
      if (!table) return null;
      const cells = Array.from(table.querySelectorAll('td.rc-imageselect-tile, td'));
      const cell = cells[idx - 1];
      if (!cell) return null;
      const r = cell.getBoundingClientRect();
      if (!r || r.width <= 0 || r.height <= 0) return null;
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    }, number).catch(() => null);

    if (cellRect) {
      x = boundingBox.x + cellRect.left + (cellRect.width / 2) + randomBetween(-6, 6);
      y = boundingBox.y + cellRect.top + (cellRect.height / 2) + randomBetween(-6, 6);
    }
  }

  // FALLBACK: legacy hardcoded offsets only if the cell rect could not be measured.
  if (x === null || y === null) {
    if (recaptchaSize === 3) {
      const col = (number - 1) % 3;
      const row = Math.floor((number - 1) / 3);
      x = boundingBox.x + 60 + (col * 130) + randomBetween(-6, 6);
      y = boundingBox.y + 120 + 65 + (row * 130) + randomBetween(-6, 6);
    } else {
      const col = (number - 1) % 4;
      const row = Math.floor((number - 1) / 4);
      const heightTop = 130;
      const width = 95;
      x = boundingBox.x + 45 + (col * width) + randomBetween(-5, 5);
      y = boundingBox.y + 45 + heightTop + (row * width) + randomBetween(-5, 5);
    }
  }

  console.log(`🎯 [2Captcha Clicks]: Clicking tile #${number} (${recaptchaSize}x${recaptchaSize}) at (${Math.round(x)}, ${Math.round(y)})`);

  if (typeof page.mouse.move === 'function') {
    await page.mouse.move(x, y, { steps: randomBetween(2, 5) }).catch(() => {});
    await sleep(randomBetween(40, 90));
  }
  await page.mouse.click(x, y).catch(() => {});
}

/**
 * Clicks the Verify / Skip button on the challenge bframe
 * @param {import('rebrowser-puppeteer-core').Page} page
 * @param {any} frame
 */
async function clickRecaptchaVerifyButton(page, frame) {
  if (!page || !page.mouse) return;

  const frameHandle = typeof page.$ === 'function'
    ? await page.$('iframe[src*="recaptcha/api2/bframe"], iframe[title*="recaptcha challenge"]').catch(() => null)
    : null;
  if (!frameHandle) return;

  const boundingBox = await frameHandle.boundingBox().catch(() => null);
  if (!boundingBox) return;

  // Attempt dynamic element bounding rect measurement inside frame
  let btnRect = null;
  if (frame && typeof frame.evaluate === 'function') {
    btnRect = await frame.evaluate(() => {
      const btn = document.querySelector('#recaptcha-verify-button, button#recaptcha-verify-button, .rc-button-default');
      if (btn) {
        const r = btn.getBoundingClientRect();
        return { left: r.left, top: r.top, width: r.width, height: r.height };
      }
      return null;
    }).catch(() => null);
  }

  let x, y;
  if (btnRect && btnRect.width > 0) {
    x = boundingBox.x + btnRect.left + (btnRect.width / 2) + randomBetween(-5, 5);
    y = boundingBox.y + btnRect.top + (btnRect.height / 2) + randomBetween(-5, 5);
  } else {
    // Standard 2captcha repo coordinates
    x = boundingBox.x + 340 + randomBetween(1, 35);
    y = boundingBox.y + 540 + randomBetween(1, 5);
  }

  console.log(`🚀 [2Captcha Clicks]: Clicking Verify/Skip button at (${Math.round(x)}, ${Math.round(y)})`);

  if (typeof page.mouse.move === 'function') {
    await page.mouse.move(x, y, { steps: randomBetween(3, 6) }).catch(() => {});
    await sleep(randomBetween(50, 100));
  }
  await page.mouse.click(x, y).catch(() => {});
}

/**
 * Triggers the reCAPTCHA checkbox if present and not yet clicked
 * @param {import('rebrowser-puppeteer-core').Page} page
 * @returns {Promise<boolean>}
 */
async function triggerRecaptchaCheckbox(page) {
  try {
    if (!page || typeof page.$ !== 'function') return false;

    const anchorFrameHandle = await page.$(
      'iframe[src*="recaptcha/api2/anchor"], iframe[title="reCAPTCHA"]'
    ).catch(() => null);
    if (!anchorFrameHandle) return false;

    const anchorFrame = await anchorFrameHandle.contentFrame();
    if (!anchorFrame) return false;

    const alreadyChecked = await anchorFrame.$('.recaptcha-checkbox-checked').catch(() => null);
    if (alreadyChecked) {
      console.log('✅ [2Captcha Clicks]: reCAPTCHA checkbox is already checked.');
      return true;
    }

    console.log('👉 [2Captcha Clicks]: Clicking reCAPTCHA checkbox anchor...');
    const clicked = await anchorFrame.evaluate(() => {
      const cb = document.querySelector('.recaptcha-checkbox-unchecked, #recaptcha-anchor, span.recaptcha-checkbox');
      if (cb) {
        cb.click();
        return true;
      }
      return false;
    }).catch(() => false);

    if (!clicked && page.mouse) {
      const box = await anchorFrameHandle.boundingBox().catch(() => null);
      if (box) {
        await page.mouse.click(box.x + 28 + randomBetween(-3, 3), box.y + 38 + randomBetween(-3, 3));
      }
    }

    await sleep(randomBetween(1500, 2500));
    return true;
  } catch (err) {
    console.warn('⚠️ [2Captcha Clicks]: Notice during checkbox click:', err.message);
    return false;
  }
}

/**
 * Fallback for DYNAMIC tile challenges only: switch the bframe to the audio challenge,
 * send the MP3 to 2Captcha AudioTask, type the transcript, then Verify.
 * @param {import('rebrowser-puppeteer-core').Page} page
 * @param {any} frame
 * @param {string} apiKey
 * @returns {Promise<boolean>}
 */
async function solveRecaptchaViaAudio(page, frame, apiKey) {
  if (!apiKey || !page || !frame) return false;

  console.log('🎧 [2Captcha Audio]: Dynamic tile fallback — switching to audio challenge...');

  const switched = await frame.evaluate(() => {
    const btn = document.querySelector('#recaptcha-audio-button, button#recaptcha-audio-button');
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  }).catch(() => false);

  if (!switched) {
    console.warn('⚠️ [2Captcha Audio]: Audio button not found on challenge frame.');
    return false;
  }

  await sleep(randomBetween(1800, 2600));

  const isAudioBlocked = async () =>
    frame.evaluate(() => {
      if (document.querySelector('.rc-doscaptcha-header, .rc-doscaptcha-body')) return true;
      const text = (document.body && document.body.innerText ? document.body.innerText : '').toLowerCase();
      return text.includes('automated queries') || text.includes('try again later');
    }).catch(() => false);

  if (await isAudioBlocked()) {
    console.warn('⚠️ [2Captcha Audio]: Google blocked the audio challenge (automated-query / DOS).');
    return false;
  }

  const TwoCaptcha = require('@2captcha/captcha-solver');
  const solver = new TwoCaptcha.Solver(apiKey, 1000);

  for (let audioAttempt = 0; audioAttempt < 2; audioAttempt++) {
    if (audioAttempt > 0) {
      console.log('🔄 [2Captcha Audio]: Verify failed — loading a fresh audio clip (retry 2/2)...');
      const reloaded = await frame.evaluate(() => {
        const btn = document.querySelector('#recaptcha-reload-button, button.rc-button-reload');
        if (btn) {
          btn.click();
          return true;
        }
        return false;
      }).catch(() => false);
      if (!reloaded) break;
      await sleep(randomBetween(1500, 2200));
      if (await isAudioBlocked()) break;
    }

    let audioSrc = null;
    for (let i = 0; i < 10 && !audioSrc; i++) {
      audioSrc = await frame.evaluate(() => {
        const audio = document.querySelector('#audio-source, audio');
        if (audio && (audio.src || audio.getAttribute('src'))) return audio.src || audio.getAttribute('src');
        const link = document.querySelector('.rc-audiochallenge-tdownload-link, a[href*="payload"]');
        return link && link.href ? link.href : null;
      }).catch(() => null);
      if (!audioSrc) await sleep(400);
    }

    if (!audioSrc) {
      console.warn('⚠️ [2Captcha Audio]: No audio source URL after switching challenge.');
      break;
    }

    const base64 = await frame.evaluate(async (url) => {
      const res = await fetch(url);
      if (!res.ok) return null;
      const buf = await res.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = '';
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
      }
      return btoa(binary);
    }, audioSrc).catch(() => null);

    if (!base64) {
      console.warn('⚠️ [2Captcha Audio]: Failed to download audio payload.');
      break;
    }

    let answer;
    try {
      console.log('🌐 [2Captcha Audio]: Sending MP3 to 2Captcha Audio API...');
      answer = await solver.audio({ body: base64, lang: 'en' });
    } catch (err) {
      console.error('❌ [2Captcha Audio]: API error:', err.message);
      break;
    }

    if (!answer || !answer.data) {
      console.warn('⚠️ [2Captcha Audio]: Empty transcript from 2Captcha.');
      break;
    }

    console.log(`🎉 [2Captcha Audio]: Transcript received: "${answer.data}"`);

    const inputReady = await frame.evaluate(() => {
      const input = document.querySelector('#audio-response, input#audio-response');
      if (!input) return false;
      input.focus();
      input.click();
      input.value = '';
      return true;
    }).catch(() => false);

    if (!inputReady) {
      console.warn('⚠️ [2Captcha Audio]: #audio-response input not found.');
      break;
    }

    const transcript = String(answer.data).trim();
    let typedOk = false;
    if (typeof frame.type === 'function') {
      typedOk = await frame.type('#audio-response', transcript, { delay: randomBetween(35, 70) }).then(() => true).catch(() => false);
    }
    if (!typedOk) {
      typedOk = await frame.evaluate((text) => {
        const input = document.querySelector('#audio-response, input#audio-response');
        if (!input) return false;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        if (setter) setter.call(input, text);
        else input.value = text;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }, transcript).catch(() => false);
    }
    if (!typedOk) {
      console.warn('⚠️ [2Captcha Audio]: Failed to type transcript into #audio-response.');
      break;
    }

    await sleep(randomBetween(600, 1000));

    console.log('🚀 [2Captcha Audio]: Audio complete — clicking Verify...');
    await frame.evaluate(() => {
      const btn = document.querySelector('#recaptcha-verify-button, button#recaptcha-verify-button');
      if (!btn) return;
      btn.removeAttribute('disabled');
      btn.disabled = false;
      btn.click();
    }).catch(() => {});
    await clickRecaptchaVerifyButton(page, frame);
    await sleep(randomBetween(2200, 3200));

    const passed = await isRecaptchaPassed(page);
    if (passed) {
      console.log('🎉 [2Captcha Audio]: Audio fallback solved the challenge.');
      return true;
    }
  }

  return false;
}

/**
 * Solves reCAPTCHA using the 2Captcha Grid API and Puppeteer mouse clicks
 * (Direct implementation of 2captcha/puppeteer-recaptcha-solver-using-clicks)
 * 
 * @param {import('rebrowser-puppeteer-core').Page} page
 * @param {string} apiKey 2Captcha user API key
 * @param {Object} [options]
 * @returns {Promise<boolean>}
 */
async function solveRecaptchaViaClicks(page, apiKey, options = {}) {
  if (!apiKey) {
    console.warn('⚠️ [2Captcha Clicks]: 2Captcha API key is not configured.');
    return false;
  }

  const TwoCaptcha = require('@2captcha/captcha-solver');
  const solver = new TwoCaptcha.Solver(apiKey, 1000);

  console.log('🧩 [2Captcha Clicks]: Initializing interactive click-based reCAPTCHA solver...');

  // 1. Trigger anchor checkbox if present
  await triggerRecaptchaCheckbox(page);

  // 2. Check if passed immediately without popup challenge
  if (await isRecaptchaPassed(page)) {
    console.log('🎉 [2Captcha Clicks]: reCAPTCHA passed immediately without image challenge!');
    return true;
  }

  // 3. Locate challenge bframe
  const challengeInfo = await isFoundRecaptchaChallengeFrame(page, 8000);
  if (!challengeInfo.found) {
    if (challengeInfo.dosBlocked) {
      return false;
    }
    if (await isRecaptchaPassed(page)) {
      return true;
    }
    console.warn('⚠️ [2Captcha Clicks]: reCAPTCHA challenge bframe not found on page.');
    return false;
  }

  const frame = challengeInfo.frame;

  // 4. Initialize extractor
  await initCaptchaParamsExtractor(frame);

  let attempts = 0;
  const maxAttempts = options.maxAttempts || 12; // oneshot / 4x4 ceiling; dynamic switches to audio after 8
  const audioAfter = options.dynamicAudioAfterRounds || DYNAMIC_AUDIO_AFTER_ROUNDS;
  let firstTaskId = null;         // official 3x3 pattern: keep the FIRST task id as previousID
  let verifyFailures = 0;         // safety guard against infinite verify loops
  let lastSentBody = null;        // last grid image sent to 2Captcha (for stale detection)
  let unchangedSkips = 0;         // skip re-sending an unchanged composite (official selenium)
  let reloadedTiles = null;       // tiles that actually replaced last round (dynamic only)
  let dynamicRounds = 0;          // completed dynamic tile rounds (audio only after 8)

  while (attempts < maxAttempts) {
    attempts++;
    console.log(`\n⏳ [2Captcha Clicks]: Solving round #${attempts}/${maxAttempts}...`);

    // Re-detect style every round — a one-shot can turn into a dynamic set and vice-versa.
    const { style } = await getChallengeType(frame);
    const isDynamic = style === 'dynamic';
    if (!isDynamic) {
      reloadedTiles = null;
      firstTaskId = null;
    }

    // Audio fallback is ONLY for the reload-on-click (dynamic tile) challenge, after 8 rounds.
    if (isDynamic && dynamicRounds >= audioAfter) {
      console.log(`🎧 [2Captcha Clicks]: Dynamic tile still unsolved after ${dynamicRounds} rounds → audio fallback.`);
      return await solveRecaptchaViaAudio(page, frame, apiKey);
    }

    let captchaParams;
    try {
      captchaParams = await getCaptchaParams(frame);
    } catch (extractErr) {
      console.warn(`⚠️ [2Captcha Clicks]: Failed to extract captcha params in round ${attempts}:`, extractErr.message);
      await sleep(2000);
      if (await isRecaptchaPassed(page)) return true;
      break;
    }

    if (!captchaParams || !captchaParams.body) {
      console.warn('⚠️ [2Captcha Clicks]: Empty captcha image received from extractor.');
      break;
    }

    // Official: do not pay 2Captcha again for the exact same composite (causes repeat clicks).
    if (isDynamic && lastSentBody && captchaParams.body === lastSentBody) {
      unchangedSkips++;
      if (unchangedSkips < 5) {
        console.log(`⏭️ [2Captcha Clicks]: Grid unchanged (${unchangedSkips}/5) — not re-sending to 2Captcha.`);
        await sleep(1000);
        continue;
      }
      console.log('⏭️ [2Captcha Clicks]: Grid still unchanged after 5 skips — forcing one send.');
      unchangedSkips = 0;
    } else {
      unchangedSkips = 0;
    }

    console.log(`🌐 [2Captcha Clicks]: Sending ${captchaParams.columns}x${captchaParams.rows} [${style}] grid ("${captchaParams.comment}") to 2Captcha API...`);

    const gridPayload = {
      body: captchaParams.body,
      textinstructions: captchaParams.comment,
      cols: captchaParams.columns,
      rows: captchaParams.rows,
      canSkip: 1,
      img_type: 'recaptcha'
    };
    // Official dynamic 3x3 only: recaptcha=1 + previousID (first task) → workers judge NEW tiles.
    if (isDynamic) {
      gridPayload.recaptcha = 1;
      if (firstTaskId) gridPayload.previousId = firstTaskId;
    }

    let answer;
    try {
      answer = await solver.grid(gridPayload);
    } catch (apiErr) {
      console.error('❌ [2Captcha Clicks]: 2Captcha API error:', apiErr.message);
      if (apiErr.message.includes('ERROR_WRONG_USER_KEY') || apiErr.message.includes('ERROR_ZERO_BALANCE')) {
        return false;
      }
      await sleep(3000);
      continue;
    }

    if (!answer || answer.status !== 1) {
      console.warn('⚠️ [2Captcha Clicks]: Unsolvable response from 2Captcha in this round.');
      await sleep(2000);
      continue;
    }

    if (isDynamic) dynamicRounds++;
    if (isDynamic && !firstTaskId && answer.id) firstTaskId = answer.id;
    lastSentBody = captchaParams.body;
    console.log(`🎉 [2Captcha Clicks]: Solution received for task ID ${answer.id}: "${answer.data}"`);

    let clicks = parseGridClicks(answer.data);

    // Dynamic continuation: only tiles that RELOADED last round can contain a new match.
    // 2Captcha often re-flags unchanged tiles (the "1 real + 2 extra wrong" cascade).
    if (isDynamic && reloadedTiles) {
      const { kept, dropped } = filterReloadedTileClicks(clicks, reloadedTiles);
      if (dropped.length) {
        console.log(`🛡️ [2Captcha Clicks]: Dropping extra clicks on tiles that did NOT reload: [${dropped.join(', ')}] (reloaded: [${[...reloadedTiles].join(', ')}])`);
      }
      clicks = kept;
    }

    // ── Branch A: no more matching tiles (2Captcha said so, OR every extra click was on an unchanged tile) ──
    if (answer.data === 'No_matching_images' || clicks.length === 0) {
      if (answer.data === 'No_matching_images') {
        console.log('ℹ️ [2Captcha Clicks]: 2Captcha reports No_matching_images → clicking Verify...');
      } else {
        console.log('ℹ️ [2Captcha Clicks]: No matching reloaded tiles remain → clicking Verify...');
      }
      await sleep(randomBetween(700, 1200));
      await clickRecaptchaVerifyButton(page, frame);

      await sleep(randomBetween(2200, 3200));
      if (await isRecaptchaPassed(page)) {
        console.log('🎉 [2Captcha Clicks]: CAPTCHA challenge successfully solved and verified!');
        return true;
      }

      // Verify didn't pass — inspect what reCAPTCHA is asking for.
      const stillActive = await isFoundRecaptchaChallengeFrame(page, 3000);
      if (!stillActive.found) {
        if (await isRecaptchaPassed(page)) return true;
        break;
      }

      const errState = await getChallengeErrorState(frame);
      if (errState.dynamicMore) {
        console.log('🔄 [2Captcha Clicks]: New images appeared after verify — continuing dynamic rounds...');
        reloadedTiles = null;
        lastSentBody = null;
        unchangedSkips = 0;
        await sleep(1200);
        continue;
      }
      if (errState.incorrect || errState.selectMore) {
        console.log('🔄 [2Captcha Clicks]: Verify rejected (incorrect / select-more) — retrying with fresh capture...');
        firstTaskId = null;
        reloadedTiles = null; // whole grid reshuffled
        lastSentBody = null;
        dynamicRounds = 0;
        unchangedSkips = 0;
        verifyFailures++;
        if (verifyFailures >= 3 && !isDynamic) break; // dynamic keeps going until 8 → audio
        await sleep(1200);
        continue;
      }

      // No clear signal; loop defensively. Dynamic stays in-loop until 8 rounds then audio.
      verifyFailures++;
      if (verifyFailures >= 3 && !isDynamic) break;
      await sleep(1200);
      continue;
    }

    // ── Branch B: tiles to click ──
    console.log(`🎯 [2Captcha Clicks]: Clicking target tiles: [${clicks.join(', ')}]`);

    for (let i = 0; i < clicks.length; i++) {
      await sleep(randomBetween(200, 450));
      await clickAtCoordinates(page, frame, captchaParams.columns, clicks[i]);
    }

    if (isDynamic) {
      // Only these cells will fade and receive new images. Next round, ignore any
      // 2Captcha clicks that fall outside this set (false positives on unchanged tiles).
      reloadedTiles = new Set(clicks);
      // Official: wait until EVERY clicked tile has a replacement, then re-send (no Verify).
      // If nothing reloads, there is nothing left to click → Verify.
      console.log(`⏳ [2Captcha Clicks]: Waiting for ${clicks.length} clicked tile(s) to fully reload...`);
      const changed = await waitForClickedTilesReloaded(frame, clicks, lastSentBody, 11000);

      if (await isRecaptchaPassed(page)) return true;
      const stillActive = await isFoundRecaptchaChallengeFrame(page, 4000);
      if (!stillActive.found) {
        if (await isRecaptchaPassed(page)) return true;
        break;
      }

      if (!changed) {
        console.log('🔎 [2Captcha Clicks]: Clicked tiles did not reload — clicking Verify.');
        await clickRecaptchaVerifyButton(page, frame);
        await sleep(randomBetween(2200, 3200));
        if (await isRecaptchaPassed(page)) return true;
        reloadedTiles = null;
        lastSentBody = null;
        unchangedSkips = 0;
      }
      continue;
    }

    // ── ONE-SHOT / MULTI: all tiles selected in one pass, verify once ──
    await sleep(randomBetween(1200, 1800));
    await clickRecaptchaVerifyButton(page, frame);

    await sleep(randomBetween(2500, 3500));
    if (await isRecaptchaPassed(page)) {
      console.log('🎉 [2Captcha Clicks]: CAPTCHA challenge successfully solved and verified!');
      return true;
    }

    const stillActive = await isFoundRecaptchaChallengeFrame(page, 3000);
    if (!stillActive.found) {
      if (await isRecaptchaPassed(page)) return true;
      break;
    }

    // A one-shot may issue a new image set, convert to dynamic, or report "select more".
    const errState = await getChallengeErrorState(frame);
    if (errState.incorrect) console.log('🔄 [2Captcha Clicks]: Incorrect — new image set issued, retrying...');
    else if (errState.selectMore || errState.dynamicMore) console.log('🔄 [2Captcha Clicks]: More selections required, continuing...');
    else console.log('🔄 [2Captcha Clicks]: Multi-round challenge continuing with next set of images...');
    firstTaskId = null;
    reloadedTiles = null;
    lastSentBody = null;
    dynamicRounds = 0;
    unchangedSkips = 0;
    await sleep(1500);
  }

  if (await isRecaptchaPassed(page)) return true;
  if (dynamicRounds >= audioAfter) {
    console.log(`🎧 [2Captcha Clicks]: Dynamic tile still unsolved after ${dynamicRounds} rounds → audio fallback.`);
    return await solveRecaptchaViaAudio(page, frame, apiKey);
  }
  return false;
}

/**
 * Solves distorted image text CAPTCHA via 2Captcha API
 * @param {import('rebrowser-puppeteer-core').Page} page
 * @param {string} apiKey
 * @returns {Promise<boolean>}
 */
async function solveImageCaptchaViaApi(page, apiKey) {
  if (!apiKey || !page) return false;
  try {
    const TwoCaptcha = require('@2captcha/captcha-solver');
    const solver = new TwoCaptcha.Solver(apiKey, 1000);

    console.log('🧩 [2Captcha Engine]: Solving distorted image text CAPTCHA via 2Captcha API...');
    const base64Img = await page.evaluate(() => {
      const img = document.querySelector('img#captchaimg, img[src*="Captcha"], img[src*="GetCaptcha"]');
      if (!img) return null;
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width || 200;
      canvas.height = img.naturalHeight || img.height || 70;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      return canvas.toDataURL('image/png').replace(/^data:image\/?[A-Za-z]*;base64,/, '');
    }).catch(() => null);

    if (!base64Img) return false;

    const solution = await solver.imageCaptcha({ body: base64Img });
    if (solution && solution.data) {
      console.log(`🎉 [2Captcha Engine]: Image text captcha solved: "${solution.data}"`);
      const typed = await page.evaluate((val) => {
        const input = document.querySelector('input#ca, input[name="ca"], input#identifier-captcha-input, input[name="identifier-captcha-input"], input[aria-label*="characters"], input[type="text"]:not([type="email"])');
        if (input) {
          input.focus();
          input.value = val;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
        return false;
      }, solution.data);

      if (typed) {
        await sleep(1000);
        return true;
      }
    }
    return false;
  } catch (err) {
    console.warn('⚠️ [2Captcha Engine]: Image captcha solve error:', err.message);
    return false;
  }
}

/**
 * Direct 2Captcha API Solver for Google reCAPTCHA v2 (Token-based)
 * Uses native fetch to submit task and poll for g-recaptcha-response token.
 * 
 * @param {string} apiKey 2Captcha user API key
 * @param {string} sitekey Target site key
 * @param {string} pageUrl Target page URL
 * @param {number} [timeoutMs=120000]
 * @returns {Promise<string|null>} Token string or null
 */
async function solveRecaptchaViaApi(apiKey, sitekey, pageUrl, timeoutMs = 120000) {
  if (!apiKey || !sitekey || !pageUrl) return null;

  try {
    console.log(`🌐 [2Captcha API]: Sending reCAPTCHA task to 2Captcha (sitekey: ${sitekey.slice(0, 10)}...)...`);

    // 1. Submit request
    const inUrl = `https://2captcha.com/in.php?key=${encodeURIComponent(apiKey)}&method=userrecaptcha&googlekey=${encodeURIComponent(sitekey)}&pageurl=${encodeURIComponent(pageUrl)}&json=1`;
    const inRes = await fetch(inUrl).then(r => r.json()).catch(() => null);

    if (!inRes || inRes.status !== 1 || !inRes.request) {
      console.warn('⚠️ [2Captcha API]: Failed to submit CAPTCHA task:', inRes?.request || 'Network error');
      return null;
    }

    const taskId = inRes.request;
    console.log(`⏳ [2Captcha API]: Task submitted (ID: ${taskId}). Awaiting solution...`);

    // 2. Poll for result
    const startTime = Date.now();
    await sleep(15000); // 2Captcha reCAPTCHA takes minimum 12-15s

    while (Date.now() - startTime < timeoutMs) {
      const resUrl = `https://2captcha.com/res.php?key=${encodeURIComponent(apiKey)}&action=get&id=${encodeURIComponent(taskId)}&json=1`;
      const resJson = await fetch(resUrl).then(r => r.json()).catch(() => null);

      if (resJson && resJson.status === 1 && resJson.request) {
        console.log('🎉 [2Captcha API]: Token received from 2Captcha successfully!');
        return resJson.request;
      }

      if (resJson && resJson.request !== 'CAPCHA_NOT_READY') {
        console.warn('⚠️ [2Captcha API]: 2Captcha returned response:', resJson.request);
        return null;
      }

      await sleep(5000);
    }

    console.warn('⚠️ [2Captcha API]: Solving timed out after 120s.');
    return null;
  } catch (err) {
    console.error('❌ [2Captcha API]: Error during API solving:', err.message);
    return null;
  }
}

/**
 * Injects solved reCAPTCHA response token into page DOM and dispatches callbacks
 * @param {import('rebrowser-puppeteer-core').Page} page
 * @param {string} token
 * @returns {Promise<boolean>}
 */
async function injectRecaptchaToken(page, token) {
  if (!page || !token || typeof page.evaluate !== 'function') return false;

  try {
    return await page.evaluate((tok) => {
      let injected = false;

      // 1. Inject into standard response textareas
      const textareas = document.querySelectorAll(
        'textarea[name="g-recaptcha-response"], #g-recaptcha-response, textarea[id*="g-recaptcha"], textarea[name="h-captcha-response"], textarea[name="cf-turnstile-response"]'
      );
      textareas.forEach(ta => {
        ta.innerHTML = tok;
        ta.value = tok;
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        ta.dispatchEvent(new Event('change', { bubbles: true }));
        injected = true;
      });

      // 2. Execute explicit DOM data-callback if defined
      const cbEls = document.querySelectorAll('[data-callback], .g-recaptcha[data-callback]');
      cbEls.forEach(el => {
        const fnName = el.getAttribute('data-callback');
        if (fnName && typeof window[fnName] === 'function') {
          try {
            window[fnName](tok);
            injected = true;
          } catch (_) {}
        }
      });

      // 3. Deep recursive search inside window.___grecaptcha_cfg
      if (window.___grecaptcha_cfg && window.___grecaptcha_cfg.clients) {
        const executedCallbacks = new Set();
        function searchAndTrigger(obj, depth = 0) {
          if (!obj || depth > 8 || executedCallbacks.size > 2) return;
          for (const key of Object.keys(obj)) {
            try {
              const val = obj[key];
              if (!val) continue;
              if (key === 'callback') {
                if (typeof val === 'function' && !executedCallbacks.has(val)) {
                  executedCallbacks.add(val);
                  val(tok);
                  injected = true;
                } else if (typeof val === 'string' && typeof window[val] === 'function' && !executedCallbacks.has(window[val])) {
                  executedCallbacks.add(window[val]);
                  window[val](tok);
                  injected = true;
                }
              } else if (typeof val === 'object' && val !== null && !Array.isArray(val) && !val.nodeType) {
                searchAndTrigger(val, depth + 1);
              }
            } catch (_) {}
          }
        }

        for (const cid in window.___grecaptcha_cfg.clients) {
          searchAndTrigger(window.___grecaptcha_cfg.clients[cid], 0);
        }
      }

      // 4. Unlock disabled submit buttons on the form
      const submitButtons = document.querySelectorAll(
        'button[data-test-id="submit-button"], button[type="submit"], input[type="submit"], button.submit-button'
      );
      submitButtons.forEach(btn => {
        btn.removeAttribute('disabled');
        btn.disabled = false;
        btn.classList.remove('disabled');
        btn.dispatchEvent(new Event('change', { bubbles: true }));
      });

      return injected;
    }, token);
  } catch (err) {
    return false;
  }
}

/**
 * Universal Auto-Solver Orchestrator
 * Checks for CAPTCHA on page, triggers Token API solver for standard web forms (e.g. Legal Form)
 * or interactive click-based solver for challenges, and handles form submission.
 * 
 * @param {import('rebrowser-puppeteer-core').Page} page
 * @param {Object} [options]
 * @param {string} [options.apiKey] 2Captcha API Key
 * @param {boolean} [options.autoSolve=true]
 * @param {boolean} [options.preferToken=false] Force direct Token API solving (e.g. for Google Legal Form)
 * @param {number} [options.timeoutMs]
 * @returns {Promise<{ handled: boolean, solved: boolean, method: string }>}
 */
async function handlePageCaptcha(page, options = {}) {
  const detection = await detectCaptcha(page);
  if (!detection.hasCaptcha) {
    return { handled: true, solved: true, method: 'none' };
  }

  console.log(`\n🛡️ [CAPTCHA Engine]: Detected "${detection.type?.toUpperCase()}" on active page.`);

  // 1. Resolve autoSolve setting and API key
  let autoSolve = options.autoSolve;
  if (autoSolve === undefined && process.env.CAPTCHA_AUTO_SOLVE !== undefined) {
    autoSolve = process.env.CAPTCHA_AUTO_SOLVE === 'true';
  }

  let apiKey = options.apiKey || process.env.TWOCAPTCHA_API_KEY || process.env.APIKEY || '';

  try {
    const { getDatabase } = require('../../database/db');
    const dbSettings = getDatabase().getSettings();
    if (dbSettings) {
      if (autoSolve === undefined && dbSettings.captchaAutoSolve !== undefined) {
        autoSolve = dbSettings.captchaAutoSolve !== false;
      }
      if (!apiKey && dbSettings.captchaApiKey) {
        apiKey = dbSettings.captchaApiKey;
      }
    }
  } catch (_) {}

  if (autoSolve === undefined) {
    autoSolve = true;
  }

  const currentUrl = typeof page.url === 'function' ? page.url() : '';
  const isLegalForm = options.preferToken === true ||
                      options.method === 'token' ||
                      currentUrl.includes('reportcontent.google.com') ||
                      currentUrl.includes('/contact/lr_');

  // 2. Token-Based API Solver for Standard Web Forms (Google Legal Removal Form, contact forms)
  if (autoSolve && apiKey && isLegalForm && (detection.type === 'recaptcha' || detection.type === 'google_sorry')) {
    console.log('🧩 [CAPTCHA Engine]: Using direct Token API for standard reCAPTCHA form...');

    if (!detection.sitekey && typeof page.evaluate === 'function') {
      detection.sitekey = await page.evaluate(() => {
        const el = document.querySelector('[data-sitekey]');
        if (el && el.getAttribute('data-sitekey')) return el.getAttribute('data-sitekey');
        const iframes = document.querySelectorAll('iframe[src*="recaptcha"]');
        for (const iframe of iframes) {
          if (iframe && iframe.src) {
            const m = iframe.src.match(/[?&]k=([^&]+)/);
            if (m) return m[1];
          }
        }
        return null;
      }).catch(() => null);
    }

    if (detection.sitekey) {
      const pageTargetUrl = currentUrl || 'https://reportcontent.google.com';
      const token = await solveRecaptchaViaApi(apiKey, detection.sitekey, pageTargetUrl, 120000);
      if (token) {
        const injected = await injectRecaptchaToken(page, token);
        if (injected) {
          console.log('✅ [CAPTCHA Engine]: Token injected into form successfully.');
          const isSorry = currentUrl.includes('/sorry/');
          if (isSorry) {
            console.log('🚀 [CAPTCHA Engine]: Submitting Google /sorry/ challenge form...');
            await page.evaluate(() => {
              const f = document.querySelector('#captcha-form, form[action*="sorry"]');
              if (f) f.submit();
            }).catch(() => {});
            await sleep(3500);
          } else {
            await sleep(randomBetween(1500, 2500));
          }
          return { handled: true, solved: true, method: '2captcha_token' };
        }
      } else {
        console.warn('⚠️ [CAPTCHA Engine]: Token API did not return token; trying click solver fallback...');
      }
    }
  }

  // 3. Execute interactive click-based solver for reCAPTCHA or Google /sorry/ ONLY IF autoSolve is enabled
  if (autoSolve && apiKey && (detection.type === 'recaptcha' || detection.type === 'google_sorry')) {
    const solved = await solveRecaptchaViaClicks(page, apiKey, options);
    if (solved) {
      const isSorry = typeof page.url === 'function' && page.url().includes('/sorry/');
      if (isSorry) {
        console.log('🚀 [CAPTCHA Engine]: Submitting Google /sorry/ challenge form...');
        await page.evaluate(() => {
          const f = document.querySelector('#captcha-form, form[action*="sorry"]');
          if (f) f.submit();
        }).catch(() => {});
        await sleep(3500);
      } else {
        await sleep(randomBetween(1500, 2500));
      }
      return { handled: true, solved: true, method: '2captcha_clicks' };
    }
  }

  // 4. Execute Image Text CAPTCHA solver if distorted image present ONLY IF autoSolve is enabled
  if (autoSolve && apiKey && detection.type === 'image_captcha') {
    const solved = await solveImageCaptchaViaApi(page, apiKey);
    if (solved) {
      return { handled: true, solved: true, method: '2captcha_image' };
    }
  }

  // 5. Graceful Human Pause fallback (keeps browser open if running in headed mode)
  if (typeof page.$ === 'function') {
    const timeout = options.timeoutMs || 10000;
    console.log(`⏳ [CAPTCHA Engine]: Awaiting manual or automated verification (${Math.round(timeout / 1000)}s)...`);
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const check = await detectCaptcha(page);
      const u = typeof page.url === 'function' ? page.url() : '';
      const isCleared = !check.hasCaptcha ||
                        (detection.type === 'google_sorry' && !u.includes('/sorry/')) ||
                        await isRecaptchaPassed(page);
      if (isCleared) {
        console.log('🎉 [CAPTCHA Engine]: CAPTCHA cleared! Proceeding...');
        return { handled: true, solved: true, method: 'manual' };
      }
      await sleep(1000);
    }
  }

  return { handled: false, solved: false, method: 'timeout' };
}

module.exports = {
  detectCaptcha,
  isRecaptchaPassed,
  isFoundRecaptchaChallengeFrame,
  initCaptchaParamsExtractor,
  getCaptchaParams,
  getChallengeType,
  getChallengeErrorState,
  parseGridClicks,
  filterReloadedTileClicks,
  clickAtCoordinates,
  clickRecaptchaVerifyButton,
  triggerRecaptchaCheckbox,
  solveRecaptchaViaClicks,
  solveRecaptchaViaAudio,
  DYNAMIC_AUDIO_AFTER_ROUNDS,
  solveRecaptchaViaApi,
  injectRecaptchaToken,
  handlePageCaptcha,
  // Deprecated compatibility stubs for legacy extension methods
  solveViaExtension: async () => false
};
