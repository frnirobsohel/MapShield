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
const vm = require('vm');

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
let audioCalls = [];
let audioResult = { status: 1, data: 'seven four two' };
class FakeSolver {
  constructor(key) { this.key = key; }
  async grid(params) {
    gridCalls.push({ ...params });
    const resp = gridScript[gridCalls.length - 1];
    return resp || { status: 0 };
  }
  async audio(params) {
    audioCalls.push({ ...params });
    return audioResult;
  }
}
require.cache[TWOCAPTCHA_PATH] = {
  id: TWOCAPTCHA_PATH, filename: TWOCAPTCHA_PATH, loaded: true,
  exports: { Solver: FakeSolver }
};

const { solveRecaptchaViaClicks, getChallengeType, filterReloadedTileClicks } = require(SOLVER_PATH);

/**
 * Fake frame whose evaluate() runs the real in-browser callback against a stub DOM
 * (via vm), so getChallengeType's ACTUAL classification logic is exercised.
 * @param {{descText?:string, noCanonical?:boolean, is4x4?:boolean, hasTile11?:boolean}} dom
 */
function makeClassifyFrame(dom) {
  return {
    evaluate: async (fn) => {
      const document = {
        querySelector: (sel) => {
          if (sel.includes('rc-imageselect-desc-wrapper') || sel.includes('rc-imageselect-desc'))
            return dom.descText != null ? { innerText: dom.descText } : null;
          if (sel.includes('rc-imageselect-desc-no-canonical')) return dom.noCanonical ? {} : null;
          if (sel.includes('rc-image-tile-11')) return dom.hasTile11 ? {} : null;
          if (sel.includes('rc-image-tile-44') || sel.includes('rc-imageselect-table-44'))
            return dom.is4x4 ? {} : null;
          return null;
        }
      };
      const sandbox = { document };
      vm.createContext(sandbox);
      return new vm.Script('(' + fn.toString() + ')()').runInContext(sandbox);
    }
  };
}

/** Builds a fake page/frame harness driven by matching evaluated fn source. */
function makeHarness(style) {
  const state = {
    currentStyle: style,
    verifyClicked: false,
    audioClicked: false,
    audioTyped: null,
    tileClicks: 0,
    verifyClicks: 0,
    clickLog: [],
    clickedTiles: [],
    pendingClickType: null,
    pendingTileNumber: null
  };

  const frame = {
    type: async (_sel, text) => { state.audioTyped = text; },
    evaluate: async (fn, arg) => {
      const src = typeof fn === 'function' ? fn.toString() : String(fn);
      if (src.includes('rc-doscaptcha-header') && src.includes('automated queries'))
        return false;                                                          // audio DOS check
      if (src.includes('rc-doscaptcha-header')) return false;                 // DOS check
      if (src.includes('__waitForTileLoaded') || src.includes('window.getRecaptchaParams ='))
        return undefined;                                                      // extractor init
      if (src.includes('window.getRecaptchaParams()')) {
        // Each capture returns a UNIQUE body so waitForGridChange() sees the grid change
        // (simulates replacement tiles loading between rounds).
        state.captureSeq = (state.captureSeq || 0) + 1;
        return { rows: 3, columns: 3, type: 'GridTask', comment: 'select', body: 'FAKEB64_' + state.captureSeq };
      }
      if (src.includes('rc-imageselect-desc-wrapper') && src.includes('none left'))
        return { style: state.currentStyle, comment: state.currentStyle === 'dynamic'
          ? 'Click verify once there are none left' : 'Select all images' };   // getChallengeType
      if (src.includes('rc-imageselect-incorrect-response')) {
        if (state.fireDynamicMoreOnce) {
          state.fireDynamicMoreOnce = false;
          return { incorrect: false, selectMore: false, dynamicMore: true };
        }
        return { incorrect: false, selectMore: false, dynamicMore: false };
      }
      // waitForClickedTilesReloaded — must not fall through to the cell-rect stub
      if (src.includes('rc-image-tile-11') && src.includes('indices.every')) return true;
      if (src.includes('recaptcha-audio-button')) {
        state.audioClicked = true;
        return true;
      }
      if (src.includes('arrayBuffer') || src.includes('btoa')) return 'FAKEAUDIO64';
      if (src.includes('audio-source') || src.includes('rc-audiochallenge-tdownload-link'))
        return 'https://example.test/payload.mp3';
      if (src.includes('audio-response')) {
        state.audioTyped = arg;
        return true;
      }
      if (src.includes('rc-imageselect-table')) {                             // tile cell rect
        state.pendingClickType = 'tile';
        state.pendingTileNumber = arg;
        return { left: 10, top: 20, width: 100, height: 100 };
      }
      if (src.includes('recaptcha-verify-button')) {                          // verify btn rect
        state.pendingClickType = 'verify';
        return { left: 250, top: 500, width: 80, height: 30 };
      }
      return null;
    },
    $: async (sel) => {
      if (!sel.includes('recaptcha-checkbox-checked')) return null;
      const need = state.passOnVerifyNumber ?? 1;
      return state.verifyClicks >= need ? {} : null;
    }
  };

  const bframeHandle = {
    boundingBox: async () => ({ x: 400, y: 300, width: 400, height: 580 }),
    contentFrame: async () => frame
  };

  const page = {
    url: () => 'https://accounts.google.com/signin',
    frames: () => [frame],
    keyboard: {
      type: async (text) => { state.audioTyped = text; }
    },
    mouse: {
      move: async () => {},
      click: async (x, y) => {
        const type = state.pendingClickType || 'unknown';
        state.clickLog.push(type);
        if (type === 'tile') {
          state.tileClicks++;
          if (state.pendingTileNumber) state.clickedTiles.push(state.pendingTileNumber);
        }
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
      if (src.includes('arrayBuffer') || src.includes('btoa')) return 'FAKEAUDIO64';
      if (src.includes('g-recaptcha-response')) {
        const need = state.passOnVerifyNumber ?? 1;
        return state.verifyClicks >= need;
      }
      return null;
    }
  };

  return { page, state };
}

test.beforeEach(() => {
  gridCalls = [];
  gridScript = [];
  audioCalls = [];
  audioResult = { status: 1, data: 'seven four two' };
});

test('DYNAMIC: verify clicked only after 2Captcha returns No_matching_images', async () => {
  gridScript = [
    { status: 1, id: 101, data: 'click:1/5' },       // round 1 → tiles 1,5 reload
    { status: 1, id: 102, data: 'click:1' },          // round 2 → only a reloaded tile
    { status: 1, id: 103, data: 'No_matching_images' } // round 3 → verify + pass
  ];
  const { page, state } = makeHarness('dynamic');

  const result = await solveRecaptchaViaClicks(page, 'TEST_KEY', { maxAttempts: 12 });

  assert.strictEqual(result, true, 'solver should report success');
  assert.strictEqual(gridCalls.length, 3, 'should re-capture + re-send each round');
  assert.deepStrictEqual(state.clickedTiles, [1, 5, 1], 'round 2 must click a tile that actually reloaded');
  assert.strictEqual(state.verifyClicks, 1, 'verify must be clicked exactly once');
  assert.deepStrictEqual(
    state.clickLog, ['tile', 'tile', 'tile', 'verify'],
    'verify must come AFTER all tile rounds (never prematurely)'
  );
  // previousId continuation: not on first round, then carried forward
  assert.strictEqual(gridCalls[0].previousId, undefined, 'round 1 has no previousId');
  assert.strictEqual(gridCalls[1].previousId, 101, 'round 2 keeps the FIRST task id');
  assert.strictEqual(gridCalls[2].previousId, 101, 'round 3 still uses the first task id (official 3x3)');
  assert.strictEqual(gridCalls[1].recaptcha, 1, 'official recaptcha=1 flag must be sent');
  assert.strictEqual(audioCalls.length, 0, 'audio must not run when image solves before 8 rounds');
});

test('DYNAMIC: extra clicks on tiles that did not reload are dropped (1 real + 2 wrong)', async () => {
  gridScript = [
    { status: 1, id: 101, data: 'click:1/5/9' },      // 3 real crosswalks
    { status: 1, id: 102, data: 'click:1/2/4' },      // 1 real new + 2 false positives on UNCHANGED tiles
    { status: 1, id: 103, data: 'No_matching_images' }
  ];
  const { page, state } = makeHarness('dynamic');

  const result = await solveRecaptchaViaClicks(page, 'TEST_KEY', { maxAttempts: 12 });

  assert.strictEqual(result, true);
  assert.deepStrictEqual(
    state.clickedTiles, [1, 5, 9, 1],
    'round 2 must keep tile 1 (reloaded) and drop tiles 2 and 4 (never reloaded)'
  );
  assert.strictEqual(state.verifyClicks, 1);
  assert.strictEqual(audioCalls.length, 0, 'audio must not run when filtered image path succeeds');
});

test('4x4 MULTI: "if there are none, click skip" is NOT dynamic — verify after one pass', async () => {
  gridScript = [{ status: 1, id: 301, data: 'click:5/6/10/11' }];
  const { page, state } = makeHarness('multi');

  const result = await solveRecaptchaViaClicks(page, 'TEST_KEY', { maxAttempts: 12 });

  assert.strictEqual(result, true);
  assert.strictEqual(gridCalls.length, 1, '4x4 must not re-send as a dynamic continuation');
  assert.strictEqual(state.tileClicks, 4);
  assert.strictEqual(state.verifyClicks, 1, 'verify immediately after the one-shot selection');
  assert.strictEqual(gridCalls[0].previousId, undefined);
  assert.strictEqual(gridCalls[0].recaptcha, undefined, '4x4 must not send recaptcha=1');
  assert.strictEqual(audioCalls.length, 0, '4x4 must never use audio fallback');
});

test('getChallengeType: 4x4 skip-text is multi, 3x3 none-left is dynamic', async () => {
  const fourByFour = await getChallengeType(makeClassifyFrame({
    descText: 'Select all squares with taxis If there are none, click skip',
    is4x4: true,
    noCanonical: true
  }));
  assert.strictEqual(fourByFour.style, 'multi');

  const dynamic = await getChallengeType(makeClassifyFrame({
    descText: 'Select all images with a crosswalk Click verify once there are none left.'
  }));
  assert.strictEqual(dynamic.style, 'dynamic');

  const oneshot = await getChallengeType(makeClassifyFrame({
    descText: 'Select all images with a bus'
  }));
  assert.strictEqual(oneshot.style, 'oneshot');
});

test('filterReloadedTileClicks: keeps only tiles that actually reloaded', () => {
  const { kept, dropped } = filterReloadedTileClicks([1, 2, 4], new Set([1, 5, 9]));
  assert.deepStrictEqual(kept, [1]);
  assert.deepStrictEqual(dropped, [2, 4]);

  const firstRound = filterReloadedTileClicks([1, 5, 9], null);
  assert.deepStrictEqual(firstRound.kept, [1, 5, 9]);
  assert.deepStrictEqual(firstRound.dropped, []);
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
  assert.strictEqual(gridCalls[0].recaptcha, undefined, 'one-shot must not send recaptcha=1');
  assert.strictEqual(audioCalls.length, 0, 'one-shot must never use audio fallback');
});

test('DYNAMIC: dynamicMore after verify clears reload filter so new tiles can be clicked', async () => {
  gridScript = [
    { status: 1, id: 501, data: 'click:1' },
    { status: 1, id: 502, data: 'No_matching_images' },
    { status: 1, id: 503, data: 'click:2' },
    { status: 1, id: 504, data: 'No_matching_images' }
  ];
  const { page, state } = makeHarness('dynamic');
  state.fireDynamicMoreOnce = true;
  state.passOnVerifyNumber = 2;

  const result = await solveRecaptchaViaClicks(page, 'TEST_KEY', { maxAttempts: 12 });

  assert.strictEqual(result, true);
  assert.deepStrictEqual(state.clickedTiles, [1, 2], 'tile 2 must be clicked after dynamicMore (not dropped by reload filter)');
  assert.strictEqual(state.verifyClicks, 2);
});

test('getChallengeType: Spanish dynamic prompt without replacement tiles yet', async () => {
  const es = await getChallengeType(makeClassifyFrame({
    descText: 'Selecciona todas las imágenes con un semáforo. Haz clic en Verificar cuando no queden.',
    hasTile11: false
  }));
  assert.strictEqual(es.style, 'dynamic');
});

test('DYNAMIC: audio fallback runs only after 8 unsolved tile rounds', async () => {
  gridScript = Array.from({ length: 8 }, (_, i) => ({
    status: 1,
    id: 400 + i,
    data: 'click:1'
  }));
  const { page, state } = makeHarness('dynamic');

  const result = await solveRecaptchaViaClicks(page, 'TEST_KEY', { maxAttempts: 12 });

  assert.strictEqual(result, true, 'audio fallback should solve after 8 tile rounds');
  assert.strictEqual(gridCalls.length, 8, 'exactly 8 image rounds before audio');
  assert.strictEqual(audioCalls.length, 1, 'audio API called once as fallback');
  assert.strictEqual(audioCalls[0].body, 'FAKEAUDIO64');
  assert.strictEqual(audioCalls[0].lang, 'en');
  assert.strictEqual(state.audioClicked, true, 'must switch to the headphone/audio challenge');
  assert.strictEqual(state.audioTyped, 'seven four two');
});
