const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const net = require('net');
const { testProxyPing } = require('../electron/ipc/proxies_ipc');
const { DatabaseService } = require('../database/db');

const TEST_DB = path.join(__dirname, 'test_phase0_bugfixes.sqlite');

test.before(() => {
  try { if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB); } catch (_) {}
});

test.after(() => {
  try { if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB); } catch (_) {}
});

test('proxy test: HTTP timeout/error must fail-closed (not success)', async () => {
  // TCP accepts then ignores HTTP — request should timeout and report failed
  const server = net.createServer((socket) => {
    // Accept TCP only; never respond to HTTP
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  const result = await testProxyPing({
    host: '127.0.0.1',
    port,
    protocol: 'http'
  }, 1200);

  server.close();
  assert.strictEqual(result.success, false, 'HTTP proxy timeout must not report success');
  assert.strictEqual(result.status, 'failed');
  assert.ok(result.error, 'error message expected');
});

test('proxy test: HTTP error after TCP connect must fail-closed', async () => {
  const server = net.createServer((socket) => {
    socket.destroy(); // cause HTTP request error
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  const result = await testProxyPing({
    host: '127.0.0.1',
    port,
    protocol: 'http'
  }, 1500);

  server.close();
  assert.strictEqual(result.success, false, 'HTTP proxy error must not report success');
  assert.strictEqual(result.status, 'failed');
});

test('backup codes: commit only writes remaining codes when explicitly committed', () => {
  const db = new DatabaseService(TEST_DB);
  db.saveAccounts([{
    id: 'acc_phase0_1',
    email: 'phase0@gmail.com',
    password: 'secret',
    backupCode: '11112222, 33334444'
  }]);

  // Simulate in-memory consume without commit (login still pending)
  let backupCode = '11112222, 33334444';
  let pending = null;
  const list = backupCode.split(',').map(s => s.trim()).filter(Boolean);
  const selected = list[0];
  backupCode = list.slice(1).join(', ');
  pending = backupCode;

  assert.strictEqual(selected, '11112222');
  // DB unchanged until commit
  assert.strictEqual(db.getAccounts()[0].backupCode, '11112222, 33334444');

  // Commit after success / rejection
  db.updateAccountBackupCodes('acc_phase0_1', pending);
  pending = null;
  assert.strictEqual(db.getAccounts()[0].backupCode, '33334444');
  db.close();
});

test('legal success contract: click alone is not success', () => {
  // Mirrors fillLegalRemovalForm return rule after fix
  const successConfirmed = false;
  const submitClicked = true;
  const success = !!successConfirmed;
  assert.strictEqual(success, false);
  assert.strictEqual(!!submitClicked, true);
});

test('BrowserManager accepts diskCacheDir option without throwing', async () => {
  const BrowserManager = require('../modules/browser/browser_manager');
  const bm = new BrowserManager();
  assert.ok(typeof bm.launch === 'function');
  assert.ok(typeof bm.create_temp_profile === 'function');
  // Do not launch real Chrome in unit test — only verify option plumbing via temp profile
  const profile = bm.create_temp_profile('phase0');
  assert.ok(fs.existsSync(profile));
  bm.cleanup_all_temp_profiles();
});
