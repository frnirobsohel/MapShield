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
    window.getRecaptchaParams = () => {
      return new Promise((resolve, reject) => {
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

            canvas.width = initial3x3img.naturalWidth || initial3x3img.width || 300;
            canvas.height = initial3x3img.naturalHeight || initial3x3img.height || 300;
            ctx.drawImage(initial3x3img, 0, 0);

            // Handle replacement tiles (fading tiles) in 3x3
            const updatedTiles = document.querySelectorAll('img.rc-image-tile-11');
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

              updatedTiles.forEach((tile) => {
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

  let x = boundingBox.x;
  let y = boundingBox.y;

  if (recaptchaSize === 3) {
    const col = (number - 1) % 3;
    const row = Math.floor((number - 1) / 3);
    x = boundingBox.x + 60 + (col * 130) + randomBetween(-6, 6);
    y = boundingBox.y + 120 + 65 + (row * 130) + randomBetween(-6, 6);
  } else if (recaptchaSize === 4) {
    const col = (number - 1) % 4;
    const row = Math.floor((number - 1) / 4);
    const heightTop = 130;
    const width = 95;
    x = boundingBox.x + 45 + (col * width) + randomBetween(-5, 5);
    y = boundingBox.y + 45 + heightTop + (row * width) + randomBetween(-5, 5);
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

  let isNotSolved = true;
  let attempts = 0;
  const maxAttempts = options.maxAttempts || 8;

  while (isNotSolved && attempts < maxAttempts) {
    attempts++;
    console.log(`\n⏳ [2Captcha Clicks]: Solving round #${attempts}/${maxAttempts}...`);

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

    console.log(`🌐 [2Captcha Clicks]: Sending ${captchaParams.columns}x${captchaParams.rows} grid challenge ("${captchaParams.comment}") to 2Captcha API...`);

    let answer;
    try {
      answer = await solver.grid({
        body: captchaParams.body,
        textinstructions: captchaParams.comment,
        cols: captchaParams.columns,
        rows: captchaParams.rows,
        canSkip: 1,
        img_type: 'recaptcha'
      });
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

    console.log(`🎉 [2Captcha Clicks]: Solution received for task ID ${answer.id}: "${answer.data}"`);

    if (answer.data === 'No_matching_images') {
      console.log('ℹ️ [2Captcha Clicks]: No matching images found. Clicking Verify / Skip...');
      await sleep(randomBetween(800, 1400));
      await clickRecaptchaVerifyButton(page, frame);
    } else {
      const rawClicks = (answer.data || '').replace('click:', '').split('/');
      const clicks = rawClicks.map(Number).filter(n => !isNaN(n) && n > 0);

      console.log(`🎯 [2Captcha Clicks]: Clicking target tiles: [${clicks.join(', ')}]`);

      for (let i = 0; i < clicks.length; i++) {
        await sleep(randomBetween(200, 450));
        await clickAtCoordinates(page, frame, captchaParams.columns, clicks[i]);
      }

      await sleep(randomBetween(1200, 1800));
      await clickRecaptchaVerifyButton(page, frame);
    }

    // Wait for DOM update & check if solved
    await sleep(randomBetween(2500, 3500));
    const passed = await isRecaptchaPassed(page);
    if (passed) {
      console.log('🎉 [2Captcha Clicks]: CAPTCHA challenge successfully solved and verified!');
      return true;
    }

    // Check if challenge is still active
    const stillActive = await isFoundRecaptchaChallengeFrame(page, 3000);
    if (!stillActive.found) {
      if (await isRecaptchaPassed(page)) {
        return true;
      }
      break;
    }

    console.log('🔄 [2Captcha Clicks]: Multi-round challenge continuing with next set of images...');
    await sleep(1500);
  }

  return await isRecaptchaPassed(page);
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
  clickAtCoordinates,
  clickRecaptchaVerifyButton,
  triggerRecaptchaCheckbox,
  solveRecaptchaViaClicks,
  solveRecaptchaViaApi,
  injectRecaptchaToken,
  handlePageCaptcha,
  // Deprecated compatibility stubs for legacy extension methods
  solveViaExtension: async () => false
};
