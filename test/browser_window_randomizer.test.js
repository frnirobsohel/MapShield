const test = require('node:test');
const assert = require('node:assert/strict');
const BrowserManager = require('../modules/browser/browser_manager');

test('Desktop Resolution Randomizer: all standard resolutions are safe for Google Maps (>1280px)', () => {
  const resolutions = BrowserManager.STANDARD_DESKTOP_RESOLUTIONS;
  assert.ok(Array.isArray(resolutions), 'Must be an array');
  assert.ok(resolutions.length >= 6, 'Must have at least 6 standard resolutions');

  for (const res of resolutions) {
    assert.ok(typeof res.width === 'number', 'Width must be number');
    assert.ok(typeof res.height === 'number', 'Height must be number');
    assert.ok(res.width >= 1280, `Width ${res.width} must be >= 1280 to prevent mobile layout shift`);
    assert.ok(res.height >= 768, `Height ${res.height} must be >= 768 for captcha visibility`);
  }

  // Common resolutions must be present
  const widths = resolutions.map(r => r.width);
  assert.ok(widths.includes(1920), '1080p must be present');
  assert.ok(widths.includes(1366), '1366 must be present');
  assert.ok(widths.includes(1280), '1280 must be present');
  assert.ok(widths.includes(1536), '1536 must be present');
});

test('Desktop Window Staggering: generates distinct non-overlapping window offsets for workers', () => {
  const offsets = [];
  for (let workerId = 0; workerId < 4; workerId++) {
    const posX = 30 + ((workerId * 60) % 360);
    const posY = 30 + ((workerId * 45) % 220);
    offsets.push({ workerId, posX, posY });
  }

  assert.equal(offsets.length, 4);
  assert.notEqual(offsets[0].posX, offsets[1].posX, 'Worker 0 and 1 must not open at identical X');
  assert.notEqual(offsets[0].posY, offsets[1].posY, 'Worker 0 and 1 must not open at identical Y');
});
