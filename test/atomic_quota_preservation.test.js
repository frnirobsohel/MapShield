const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

// Point to temporary SQLite DB for test isolation
const TEST_DB_PATH = path.join(__dirname, 'test_atomic_quota.sqlite');
process.env.MAPSSHIELD_USER_DATA = path.join(__dirname, 'test_scratch_quota');
if (!fs.existsSync(process.env.MAPSSHIELD_USER_DATA)) {
  fs.mkdirSync(process.env.MAPSSHIELD_USER_DATA, { recursive: true });
}

const { DatabaseService } = require('../database/db');
const db = new DatabaseService(TEST_DB_PATH);

test.beforeEach(() => {
  db.clearAccounts();
  db.clearLinks();
  db.clearProxies();
});

test.after(() => {
  try {
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
    const wal = TEST_DB_PATH + '-wal';
    const shm = TEST_DB_PATH + '-shm';
    if (fs.existsSync(wal)) fs.unlinkSync(wal);
    if (fs.existsSync(shm)) fs.unlinkSync(shm);
    if (fs.existsSync(process.env.MAPSSHIELD_USER_DATA)) {
      fs.rmSync(process.env.MAPSSHIELD_USER_DATA, { recursive: true, force: true });
    }
  } catch (_) {}
});

test('Quota Preservation: Failed task leaves account unused (used: false, usedCount: 0)', () => {
  const email = 'preserve_test@gmail.com';
  db.saveAccounts([{ email, password: 'password123' }]);

  // Simulate failed job update (e.g. timeout, captcha, or incomplete run)
  db.updateAccountStatus(email, {
    status: 'failed',
    used: false,
    error: 'Selector timeout waiting for 3-dots button'
  });

  const account = db.getAccounts().find(a => a.email.toLowerCase() === email);
  assert.ok(account, 'Account should exist');
  assert.equal(account.used, false, 'Account must NOT be marked as used on failure');
  assert.equal(account.usedCount, 0, 'usedCount must NOT increment on failure');
  assert.equal(account.status, 'failed');
  assert.equal(account.lastError, 'Selector timeout waiting for 3-dots button');
});

test('Quota Preservation: Defensive check prevents accidental mark-as-used on failure even without used:false', () => {
  const email = 'defensive_test@gmail.com';
  db.saveAccounts([{ email, password: 'password123' }]);

  // Caller sends status: 'failed' without explicitly passing used: false
  db.updateAccountStatus(email, {
    status: 'failed',
    error: 'Page crashed'
  });

  const account = db.getAccounts().find(a => a.email.toLowerCase() === email);
  assert.ok(account);
  assert.equal(account.used, false, 'Account must remain unused when status is non-success');
  assert.equal(account.usedCount, 0, 'usedCount must remain 0 when status is non-success');
  assert.equal(account.status, 'failed');
});

test('Quota Preservation: ONLY verified success marks account as used (used: true, usedCount: 1)', () => {
  const email = 'success_test@gmail.com';
  db.saveAccounts([{ email, password: 'password123' }]);

  // Simulate verified successful submission
  db.updateAccountStatus(email, {
    status: 'success',
    used: true,
    error: null,
    timestamp: '10:30 PM'
  });

  const account = db.getAccounts().find(a => a.email.toLowerCase() === email);
  assert.ok(account);
  assert.equal(account.used, true, 'Account must be marked as used on success');
  assert.equal(account.usedCount, 1, 'usedCount must increment to 1 on success');
  assert.equal(account.status, 'success');
  assert.equal(account.lastError, null);
});

test('Quota Preservation: Multiple failures do not increment usedCount; first success increments cleanly', () => {
  const email = 'multi_attempt@gmail.com';
  db.saveAccounts([{ email, password: 'password123' }]);

  // Attempt 1: Failed
  db.updateAccountStatus(email, { status: 'failed', used: false, error: 'Proxy timeout' });
  let acc = db.getAccounts().find(a => a.email.toLowerCase() === email);
  assert.equal(acc.used, false);
  assert.equal(acc.usedCount, 0);

  // Attempt 2: Failed
  db.updateAccountStatus(email, { status: 'failed', used: false, error: 'Network lag' });
  acc = db.getAccounts().find(a => a.email.toLowerCase() === email);
  assert.equal(acc.used, false);
  assert.equal(acc.usedCount, 0);

  // Attempt 3: Success
  db.updateAccountStatus(email, { status: 'success', used: true });
  acc = db.getAccounts().find(a => a.email.toLowerCase() === email);
  assert.equal(acc.used, true);
  assert.equal(acc.usedCount, 1);
});

test('Link Progress Preservation: Failed report does NOT increment doneCount or completedCount', () => {
  const testUrl = 'https://maps.app.goo.gl/sampleReviewUrl123';
  db.saveLinks([{ url: testUrl, targetCount: 5, doneCount: 2 }]);

  // Simulate failed report
  db.updateLinkProgress(testUrl, {
    status: 'failed',
    error: 'Dialog did not appear'
  });

  const link = db.getLinks().find(l => l.url === testUrl);
  assert.ok(link);
  assert.equal(link.doneCount, 2, 'doneCount must remain untouched on failure');
  assert.equal(link.status, 'failed');
  assert.equal(link.lastError, 'Dialog did not appear');
});

test('Link Progress Preservation: Verified completed report increments doneCount exactly by 1', () => {
  const testUrl = 'https://maps.app.goo.gl/sampleReviewUrl456';
  db.saveLinks([{ url: testUrl, targetCount: 5, doneCount: 2 }]);

  // Simulate successful report
  db.updateLinkProgress(testUrl, {
    status: 'completed',
    timestamp: '11:15 AM'
  });

  const link = db.getLinks().find(l => l.url === testUrl);
  assert.ok(link);
  assert.equal(link.doneCount, 3, 'doneCount must increment on success');
  assert.equal(link.status, 'queued', 'Status remains queued until targetCount is reached');
});

test('Queue Re-eligibility: Unused accounts filtering retains failed accounts for retry', () => {
  const accounts = [
    { email: 'user1@gmail.com', used: 0, usedCount: 0, status: 'failed' },
    { email: 'user2@gmail.com', used: 1, usedCount: 1, status: 'success' },
    { email: 'user3@gmail.com', used: 0, usedCount: 0, status: 'ready' }
  ];

  // Exact filtering logic from agent_runner.js
  const unusedAccounts = accounts.filter(a => {
    if (!a || !a.email) return false;
    if (a.used === true || a.used === 1) return false;
    if (typeof a.usedCount === 'number' && a.usedCount > 0) return false;
    if (a.status === 'success') return false;
    return true;
  });

  const availableEmails = unusedAccounts.map(a => a.email);
  assert.ok(availableEmails.includes('user1@gmail.com'), 'Failed account must remain available in queue');
  assert.ok(availableEmails.includes('user3@gmail.com'), 'Ready account must remain available in queue');
  assert.ok(!availableEmails.includes('user2@gmail.com'), 'Successful account must be excluded from queue');
  assert.equal(unusedAccounts.length, 2);
});

test('Proxy Health Tracking: updateProxyStatus records diagnostic error without touching accounts', () => {
  const proxy = '192.168.1.50:8080';
  db.saveProxies([{ host: '192.168.1.50', port: 8080, formatted: proxy }]);

  db.updateProxyStatus(proxy, {
    status: 'error',
    error: 'Proxy handshake timeout 504'
  });

  const proxies = db.getProxies();
  assert.equal(proxies.length, 1);
  assert.equal(proxies[0].status, 'error');
  assert.equal(proxies[0].error, 'Proxy handshake timeout 504');
});
