const test = require('node:test');
const assert = require('node:assert');
const { resolveJobCooldownMs, resolveSuccessHoldMs } = require('../modules/helpers/job_timing');
const { shouldPreferCaptchaToken } = require('../modules/captcha/captcha_solver');

test('job_timing: default cooldown is within 5–10s', () => {
  for (let i = 0; i < 40; i++) {
    const ms = resolveJobCooldownMs({}, {});
    assert.ok(ms >= 5000 && ms <= 10000, `cooldown ${ms} out of default range`);
  }
});

test('job_timing: payload overrides settings for cooldown', () => {
  const ms = resolveJobCooldownMs(
    { jobCooldownMinMs: 8000, jobCooldownMaxMs: 15000 },
    { jobCooldownMinMs: 1000, jobCooldownMaxMs: 1000 }
  );
  assert.strictEqual(ms, 1000);
});

test('job_timing: success hold defaults to 2000ms', () => {
  assert.strictEqual(resolveSuccessHoldMs({}, {}), 2000);
  assert.strictEqual(resolveSuccessHoldMs({ successHoldMs: 3000 }, {}), 3000);
  assert.strictEqual(resolveSuccessHoldMs({}, { successHoldMs: 500 }), 500);
});

test('captcha: Token API only for Legal form (not login/maps)', () => {
  assert.strictEqual(
    shouldPreferCaptchaToken('https://accounts.google.com/v3/signin/identifier', {}),
    false,
    'login must NOT use token API'
  );
  assert.strictEqual(
    shouldPreferCaptchaToken('https://www.google.com/sorry/index', {}),
    false,
    '/sorry/ must NOT use token API by URL'
  );
  assert.strictEqual(
    shouldPreferCaptchaToken('https://maps.google.com/', {}),
    false
  );
  assert.strictEqual(
    shouldPreferCaptchaToken('https://reportcontent.google.com/forms/lr_legal', {}),
    true,
    'legal form URL uses token'
  );
  assert.strictEqual(
    shouldPreferCaptchaToken('https://support.google.com/legal/contact/lr_legal', {}),
    true
  );
  assert.strictEqual(
    shouldPreferCaptchaToken('https://maps.google.com/', { preferToken: true }),
    true,
    'explicit preferToken (legal reporter) still allowed'
  );
});

test('concurrency: default setting is 1 worker in db.getSettings()', () => {
  const { DatabaseService } = require('../database/db');
  const path = require('path');
  const os = require('os');
  const fs = require('fs');
  const tempDbPath = path.join(os.tmpdir(), `test_concurrency_${Date.now()}_${Math.random().toString(36).substring(7)}.sqlite`);
  try {
    const db = new DatabaseService(tempDbPath);
    const settings = db.getSettings();
    assert.strictEqual(settings.concurrency, 1, 'Default concurrency should be 1');

    db.saveSettings({ concurrency: 3 });
    const updated = db.getSettings();
    assert.strictEqual(updated.concurrency, 3, 'Saved concurrency should be 3');

    // String number coercion
    db.saveSettings({ concurrency: '5' });
    const strUpdated = db.getSettings();
    assert.strictEqual(strUpdated.concurrency, 5, 'String "5" should parse to 5');

    // Fallback for invalid input
    db.saveSettings({ concurrency: 'invalid' });
    const fallback = db.getSettings();
    assert.strictEqual(fallback.concurrency, 1, 'Invalid value should fall back to 1');
  } finally {
    try { fs.unlinkSync(tempDbPath); } catch (_) {}
  }
});

test('concurrency: worker pool simulates non-overlapping parallel job distribution', async () => {
  const totalJobs = 10;
  const concurrency = 3;
  const processedByWorker = { 1: [], 2: [], 3: [] };
  let nextJobIndex = 0;

  async function worker(workerId) {
    while (nextJobIndex < totalJobs) {
      const idx = nextJobIndex++;
      if (idx >= totalJobs) break;
      processedByWorker[workerId].push(idx);
      // Small simulated async delay
      await new Promise(r => setTimeout(r, 5));
    }
  }

  await Promise.all([worker(1), worker(2), worker(3)]);

  const allProcessed = [
    ...processedByWorker[1],
    ...processedByWorker[2],
    ...processedByWorker[3]
  ].sort((a, b) => a - b);

  assert.strictEqual(allProcessed.length, 10, 'All 10 jobs must be processed');
  for (let i = 0; i < 10; i++) {
    assert.strictEqual(allProcessed[i], i, `Job ${i} must be processed exactly once`);
  }
  assert.ok(processedByWorker[1].length > 0, 'Worker 1 processed jobs');
  assert.ok(processedByWorker[2].length > 0, 'Worker 2 processed jobs');
  assert.ok(processedByWorker[3].length > 0, 'Worker 3 processed jobs');
});

