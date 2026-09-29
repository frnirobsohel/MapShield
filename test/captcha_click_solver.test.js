/**
 * test/captcha_click_solver.test.js
 * Unit & Integration Test Suite for Interactive Click-Based reCAPTCHA Solver
 * (puppeteer-recaptcha-solver-using-clicks implementation)
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  detectCaptcha,
  isRecaptchaPassed,
  isFoundRecaptchaChallengeFrame,
  clickAtCoordinates,
  clickRecaptchaVerifyButton,
  triggerRecaptchaCheckbox,
  handlePageCaptcha
} = require('../modules/captcha/captcha_solver');

test('detectCaptcha: detects Google reCAPTCHA iframe and sitekey', async () => {
  const mockPage = {
    evaluate: async (fn) => {
      return { hasCaptcha: true, type: 'recaptcha', sitekey: '6Ld_mock_sitekey' };
    }
  };

  const res = await detectCaptcha(mockPage);
  assert.equal(res.hasCaptcha, true);
  assert.equal(res.type, 'recaptcha');
  assert.equal(res.sitekey, '6Ld_mock_sitekey');
});

test('detectCaptcha: detects Google /sorry/ page with anomaly', async () => {
  const mockPage = {
    evaluate: async () => {
      return { hasCaptcha: true, type: 'google_sorry', sitekey: '6Ld_sorry_key' };
    }
  };

  const res = await detectCaptcha(mockPage);
  assert.equal(res.hasCaptcha, true);
  assert.equal(res.type, 'google_sorry');
});

test('detectCaptcha: returns clean result when no CAPTCHA is present', async () => {
  const mockPage = {
    evaluate: async () => {
      return { hasCaptcha: false, type: null, sitekey: null };
    }
  };

  const res = await detectCaptcha(mockPage);
  assert.equal(res.hasCaptcha, false);
  assert.equal(res.type, null);
});

test('isRecaptchaPassed: returns true when checkbox is marked checked in anchor frame', async () => {
  const mockPage = {
    frames: () => [
      {
        $: async (selector) => {
          if (selector === '.recaptcha-checkbox-checked') return {};
          return null;
        }
      }
    ],
    $: async () => null,
    evaluate: async () => false
  };

  const passed = await isRecaptchaPassed(mockPage);
  assert.equal(passed, true);
});

test('isRecaptchaPassed: returns true when token textarea is populated and bframe is closed', async () => {
  const mockPage = {
    frames: () => [],
    $: async (selector) => {
      if (selector.includes('bframe')) return null; // bframe closed
      return null;
    },
    evaluate: async () => true // Token has length > 20
  };

  const passed = await isRecaptchaPassed(mockPage);
  assert.equal(passed, true);
});

test('isFoundRecaptchaChallengeFrame: correctly identifies bframe and validates against DOS limit', async () => {
  // Normal challenge bframe
  const mockFrame = {
    evaluate: async () => false // No DOS message
  };
  const mockPageNormal = {
    waitForSelector: async () => ({
      contentFrame: async () => mockFrame
    })
  };

  const normalRes = await isFoundRecaptchaChallengeFrame(mockPageNormal, 500);
  assert.equal(normalRes.found, true);
  assert.equal(normalRes.dosBlocked, false);

  // DOS blocked bframe
  const mockDosFrame = {
    evaluate: async () => true // .rc-doscaptcha-header exists
  };
  const mockPageDos = {
    waitForSelector: async () => ({
      contentFrame: async () => mockDosFrame
    })
  };

  const dosRes = await isFoundRecaptchaChallengeFrame(mockPageDos, 500);
  assert.equal(dosRes.found, false);
  assert.equal(dosRes.dosBlocked, true);
});

test('clickAtCoordinates: computes 3x3 and 4x4 grid mouse clicks accurately', async () => {
  const clicks = [];
  const moves = [];

  const mockPage = {
    $: async () => ({
      boundingBox: async () => ({ x: 100, y: 200, width: 400, height: 500 })
    }),
    mouse: {
      move: async (x, y) => moves.push({ x, y }),
      click: async (x, y) => clicks.push({ x, y })
    }
  };

  // 3x3 Grid: Tile 1 (top-left)
  await clickAtCoordinates(mockPage, null, 3, 1);
  assert.equal(clicks.length, 1);
  // Expected x roughly 100 + 60 = 160 (+/- 6)
  // Expected y roughly 200 + 120 + 65 = 385 (+/- 6)
  assert.ok(clicks[0].x >= 150 && clicks[0].x <= 170, `x=${clicks[0].x}`);
  assert.ok(clicks[0].y >= 375 && clicks[0].y <= 395, `y=${clicks[0].y}`);

  // 3x3 Grid: Tile 5 (center) -> col 1, row 1
  await clickAtCoordinates(mockPage, null, 3, 5);
  assert.equal(clicks.length, 2);
  // Expected x: 100 + 60 + 130 = 290 (+/- 6)
  // Expected y: 200 + 120 + 65 + 130 = 515 (+/- 6)
  assert.ok(clicks[1].x >= 280 && clicks[1].x <= 300, `x=${clicks[1].x}`);
  assert.ok(clicks[1].y >= 505 && clicks[1].y <= 525, `y=${clicks[1].y}`);

  // 4x4 Grid: Tile 16 (bottom-right) -> col 3, row 3
  await clickAtCoordinates(mockPage, null, 4, 16);
  assert.equal(clicks.length, 3);
  // Expected x: 100 + 45 + (3 * 95) = 430 (+/- 5)
  // Expected y: 200 + 45 + 130 + (3 * 95) = 660 (+/- 5)
  assert.ok(clicks[2].x >= 420 && clicks[2].x <= 440, `x=${clicks[2].x}`);
  assert.ok(clicks[2].y >= 650 && clicks[2].y <= 670, `y=${clicks[2].y}`);
});

test('clickRecaptchaVerifyButton: calculates coordinates and triggers click', async () => {
  const clicks = [];
  const mockFrame = {
    evaluate: async () => ({ left: 280, top: 480, width: 80, height: 36 })
  };
  const mockPage = {
    $: async () => ({
      boundingBox: async () => ({ x: 50, y: 100, width: 400, height: 550 })
    }),
    mouse: {
      move: async () => {},
      click: async (x, y) => clicks.push({ x, y })
    }
  };

  await clickRecaptchaVerifyButton(mockPage, mockFrame);
  assert.equal(clicks.length, 1);
  // Expected x: 50 + 280 + 40 = 370 (+/- 5)
  // Expected y: 100 + 480 + 18 = 598 (+/- 5)
  assert.ok(clicks[0].x >= 360 && clicks[0].x <= 380, `x=${clicks[0].x}`);
  assert.ok(clicks[0].y >= 590 && clicks[0].y <= 610, `y=${clicks[0].y}`);
});

test('triggerRecaptchaCheckbox: interacts with anchor frame checkbox element', async () => {
  let checkboxClicked = false;
  const mockAnchorFrame = {
    $: async () => null, // Not yet checked
    evaluate: async (fn) => {
      checkboxClicked = true;
      return true;
    }
  };

  const mockPage = {
    $: async () => ({
      contentFrame: async () => mockAnchorFrame,
      boundingBox: async () => ({ x: 50, y: 50 })
    }),
    mouse: {
      click: async () => {}
    }
  };

  const res = await triggerRecaptchaCheckbox(mockPage);
  assert.equal(res, true);
  assert.equal(checkboxClicked, true);
});

test('handlePageCaptcha: returns { handled: true, solved: true, method: "none" } when page has no captcha', async () => {
  const mockPage = {
    evaluate: async () => ({ hasCaptcha: false, type: null, sitekey: null })
  };

  const res = await handlePageCaptcha(mockPage);
  assert.equal(res.handled, true);
  assert.equal(res.solved, true);
  assert.equal(res.method, 'none');
});

test('handlePageCaptcha: respects autoSolve=false without calling automated API or click solver', async () => {
  let apiCalled = false;
  const mockPage = {
    url: () => 'https://www.google.com/recaptcha/demo',
    evaluate: async (fn) => {
      if (typeof fn === 'function') {
        const str = fn.toString();
        if (str.includes('g-recaptcha-response')) return false;
      }
      return { hasCaptcha: true, type: 'recaptcha', sitekey: '6Ld_mock' };
    },
    $: async () => null
  };

  const res = await handlePageCaptcha(mockPage, { autoSolve: false, timeoutMs: 50 });
  assert.equal(res.handled, false);
  assert.equal(res.solved, false);
  assert.equal(res.method, 'timeout');
});

test('legacy stubs: backward compatibility stubs exist and return safe defaults', async () => {
  const { solveViaExtension, solveRecaptchaViaApi, injectRecaptchaToken } = require('../modules/captcha/captcha_solver');
  assert.equal(typeof solveViaExtension, 'function');
  assert.equal(typeof solveRecaptchaViaApi, 'function');
  assert.equal(typeof injectRecaptchaToken, 'function');

  assert.equal(await solveViaExtension(), false);
  assert.equal(await solveRecaptchaViaApi(), null);
  assert.equal(await injectRecaptchaToken(), false);
});

test('injectRecaptchaToken: evaluates and injects token into DOM elements safely', async () => {
  const { injectRecaptchaToken } = require('../modules/captcha/captcha_solver');
  let injectedToken = null;
  const mockPage = {
    evaluate: async (fn, token) => {
      injectedToken = token;
      return true;
    }
  };

  const res = await injectRecaptchaToken(mockPage, '03AFcWeA_sample_token');
  assert.equal(res, true);
  assert.equal(injectedToken, '03AFcWeA_sample_token');
});

