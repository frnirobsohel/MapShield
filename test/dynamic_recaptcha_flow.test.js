/**
 * test/dynamic_recaptcha_flow.test.js
 *
 * Browser-free dry-run of solveRecaptchaViaClicks loop orchestration.
 * The browser-side helpers (frame.evaluate / page.evaluate) are stubbed by matching
 * the evaluated function source, so the REAL loop logic (branching, previousId,
 * verify timing) is exercised without a live Chromium / reCAPTCHA.
 *
 * Core guarantees being proven:
 *   - DYNAMIC: Verify is clicked ONLY after 2Captcha returns "No_matching_images".
 *   - DYNAMIC: each round re-captures + re-sends with previousId continuation.
 *   - ONE-SHOT: Verify is clicked once immediately after selecting tiles (unchanged).
 */

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SOLVER_PATH = path.join(ROOT, 'modules', 'captcha', 'captcha_solver.js');
const BIO_PATH = require.resolve(path.join(ROOT, 'modules', 'helpers', 'biometrics.js'));
const TWOCAPTCHA_PATH = require.resolve('@2captcha/captcha-solver');

// ── Mock biometrics so sleep() is instant (keeps the test fast) ──
require.cache[BIO_PATH] = {
  id: BIO_PATH, filename: BIO_PATH, loaded: true,
  exports: { sleep: async () => {}, randomBetween: (a) => a }
};

// ── Mock the 2Captcha Solver; grid() replays a scripted sequence ──
let gridCalls = [];
let gridScript = [];
class FakeSolver {
  constructor(key) { this.key = key; }
  async grid(params) {
    gridCalls.push({ ...params });
    const resp = gridScript[gridCalls.length - 1];
    return resp || { status: 0 };
  }
}
require.cache[TWOCAPTCHA_PATH] = {
  id: TWOCAPTCHA_PATH, filename: TWOCAPTCHA_PATH, loaded: true,
  exports: { Solver: FakeSolver }
};

const { solveRecaptchaViaClicks } = require(SOLVER_PATH);

/** Builds a fake page/frame harness driven by matching evaluated fn source. */
function makeHarness(style) {
  const state = {
    currentStyle: style,
    verifyClicked: false,
    tileClicks: 0,
    verifyClicks: 0,
    clickLog: [],
    pendingClickType: null
  };

  const frame = {
    evaluate: async (fn) => {
      const src = typeof fn === 'function' ? fn.toString() : String(fn);
      if (src.includes('rc-doscaptcha-header')) return false;                 // DOS check
      if (src.includes('__waitForTileLoaded') || src.includes('window.getRecaptchaParams ='))
        return undefined;                                                      // extractor init
      if (src.includes('window.getRecaptchaParams()'))
        return { rows: 3, columns: 3, type: 'GridTask', comment: 'select', body: 'FAKEB64' };
      if (src.includes('rc-imageselect-desc-wrapper') && src.includes('none left'))
        return { style: state.currentStyle, comment: state.currentStyle === 'dynamic'
          ? 'Click verify once there are none left' : 'Select all images' };   // getChallengeType
      if (src.includes('rc-imageselect-incorrect-response'))
        return { incorrect: false, selectMore: false, dynamicMore: false };    // error state
      if (src.includes('rc-imageselect-table')) {                             // tile cell rect
        state.pendingClickType = 'tile';
        return { left: 10, top: 20, width: 100, height: 100 };
      }
      if (src.includes('recaptcha-verify-button')) {                          // verify btn rect
        state.pendingClickType = 'verify';
        return { left: 250, top: 500, width: 80, height: 30 };
      }
      return null;
    },
    $: async (sel) =>
      sel.includes('recaptcha-checkbox-checked') ? (state.verifyClicked ? {} : null) : null
  };

  const bframeHandle = {
    boundingBox: async () => ({ x: 400, y: 300, width: 400, height: 580 }),
    contentFrame: async () => frame
  };

  const page = {
    url: () => 'https://accounts.google.com/signin',
    frames: () => [frame],
    mouse: {
      move: async () => {},
      click: async (x, y) => {
        const type = state.pendingClickType || 'unknown';
        state.clickLog.push(type);
        if (type === 'tile') state.tileClicks++;
        if (type === 'verify') { state.verifyClicks++; state.verifyClicked = true; }
        state.pendingClickType = null;
      }
    },
    $: async (sel) => {
      if (sel.includes('api2/anchor')) return null;        // skip checkbox trigger
      if (sel.includes('api2/bframe')) return bframeHandle; // challenge frame handle
      return null;
    },
    waitForSelector: async (sel) =>
      (sel.includes('bframe') || sel.includes('challenge')) ? bframeHandle : null,
    evaluate: async (fn) => {
      const src = typeof fn === 'function' ? fn.toString() : String(fn);
      if (src.includes('g-recaptcha-response')) return state.verifyClicked; // token after verify
      return null;
    }
  };

  return { page, state };
}

test.beforeEach(() => { gridCalls = []; gridScript = []; });

test('DYNAMIC: verify clicked only after 2Captcha returns No_matching_images', async () => {
  gridScript = [
    { status: 1, id: 101, data: 'click:1/5' },       // round 1 → 2 tiles, NO verify
    { status: 1, id: 102, data: 'click:3' },          // round 2 → 1 tile, NO verify
    { status: 1, id: 103, data: 'No_matching_images' } // round 3 → verify + pass
  ];
  const { page, state } = makeHarness('dynamic');

  const result = await solveRecaptchaViaClicks(page, 'TEST_KEY', { maxAttempts: 12 });

  assert.strictEqual(result, true, 'solver should report success');
  assert.strictEqual(gridCalls.length, 3, 'should re-capture + re-send each round');
  assert.strictEqual(state.tileClicks, 3, 'should click 2 + 1 tiles across rounds');
  assert.strictEqual(state.verifyClicks, 1, 'verify must be clicked exactly once');
  assert.deepStrictEqual(
    state.clickLog, ['tile', 'tile', 'tile', 'verify'],
    'verify must come AFTER all tile rounds (never prematurely)'
  );
  // previousId continuation: not on first round, then carried forward
  assert.strictEqual(gridCalls[0].previousId, undefined, 'round 1 has no previousId');
  assert.strictEqual(gridCalls[1].previousId, 101, 'round 2 continues task 101');
  assert.strictEqual(gridCalls[2].previousId, 102, 'round 3 continues task 102');
});

test('ONE-SHOT: verify clicked immediately after selecting tiles (unchanged behavior)', async () => {
  gridScript = [{ status: 1, id: 201, data: 'click:1/4/7' }]; // click 3 tiles → verify → pass
  const { page, state } = makeHarness('oneshot');

  const result = await solveRecaptchaViaClicks(page, 'TEST_KEY', { maxAttempts: 12 });

  assert.strictEqual(result, true, 'solver should report success');
  assert.strictEqual(gridCalls.length, 1, 'one-shot resolves in a single send');
  assert.strictEqual(state.tileClicks, 3, 'should click all 3 tiles');
  assert.strictEqual(state.verifyClicks, 1, 'verify clicked once right after tiles');
  assert.deepStrictEqual(state.clickLog, ['tile', 'tile', 'tile', 'verify']);
  assert.strictEqual(gridCalls[0].previousId, undefined, 'one-shot never uses previousId');
});
