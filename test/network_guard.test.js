const { test } = require('node:test');
const assert = require('node:assert');
const { isNetworkError, isPageOffline, NETWORK_ERROR_PATTERNS } = require('../modules/network/network_guard');
const { DatabaseService } = require('../database/db');
const path = require('path');
const fs = require('fs');

test('network_guard: recognizes DNS_PROBE_FINISHED_NO_INTERNET error', () => {
  assert.strictEqual(isNetworkError('net::ERR_NAME_NOT_RESOLVED (DNS_PROBE_FINISHED_NO_INTERNET)'), true);
  assert.strictEqual(isNetworkError(new Error('net::ERR_INTERNET_DISCONNECTED: DNS_PROBE_FINISHED_NO_INTERNET')), true);
  assert.strictEqual(isNetworkError('dns_probe_finished_no_internet'), true);
});

test('network_guard: recognizes all common Chrome offline & network drop errors', () => {
  const commonErrors = [
    'net::ERR_INTERNET_DISCONNECTED',
    'net::ERR_NAME_NOT_RESOLVED',
    'net::ERR_CONNECTION_TIMED_OUT',
    'net::ERR_CONNECTION_RESET',
    'net::ERR_CONNECTION_REFUSED',
    'net::ERR_NETWORK_CHANGED',
    'net::ERR_PROXY_CONNECTION_FAILED',
    'net::ERR_TUNNEL_CONNECTION_FAILED',
    'net::ERR_ADDRESS_UNREACHABLE',
    'Navigation timeout of 60000 ms exceeded',
    'getaddrinfo ENOTFOUND accounts.google.com',
    'connect ECONNREFUSED 127.0.0.1:8080',
    'read ECONNRESET',
    'Press space to play'
  ];

  for (const err of commonErrors) {
    assert.strictEqual(isNetworkError(err), true, `Should recognize "${err}" as network error`);
  }
});

test('network_guard: correctly ignores non-network application errors', () => {
  const appErrors = [
    'Wrong password entered for account',
    "Couldn't find your Google Account",
    'Google Authentication Error [ACCOUNT_LOCKED]',
    'CAPTCHA challenge encountered',
    'Invalid backup code',
    'Target element not found on page'
  ];

  for (const err of appErrors) {
    assert.strictEqual(isNetworkError(err), false, `Should NOT recognize "${err}" as network error`);
  }
});

test('network_guard: isPageOffline detects chrome-error:// URL and offline text', async () => {
  const offlinePageMock = {
    url: () => 'chrome-error://chromewebdata/',
    evaluate: async (fn) => true
  };
  assert.strictEqual(await isPageOffline(offlinePageMock), true);

  const dinoTextMock = {
    url: () => 'https://accounts.google.com',
    evaluate: async (fn) => true
  };
  assert.strictEqual(await isPageOffline(dinoTextMock), true);

  const onlinePageMock = {
    url: () => 'https://accounts.google.com/signin',
    evaluate: async (fn) => false
  };
  assert.strictEqual(await isPageOffline(onlinePageMock), false);
});

test('db: updateAccountStatus preserves unused state when status is network_error or used: false', () => {
  const testDbPath = path.join(__dirname, 'test_network_db.sqlite');
  if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);

  const db = new DatabaseService(testDbPath);
  const testAccount = {
    id: 'test_acc_1',
    email: 'nettest@example.com',
    password: 'secretpassword',
    twoFactor: '',
    backupCode: '',
    used: false,
    usedCount: 0,
    status: 'ready'
  };

  db.saveAccounts([testAccount]);

  // Verify initial state
  let accounts = db.getAccounts();
  assert.strictEqual(accounts[0].used, false);
  assert.strictEqual(accounts[0].usedCount, 0);

  // Update with network error: used: false, status: 'ready'
  db.updateAccountStatus('nettest@example.com', {
    status: 'ready',
    used: false,
    error: 'Network disconnected: DNS_PROBE_FINISHED_NO_INTERNET'
  });

  accounts = db.getAccounts();
  assert.strictEqual(accounts[0].used, false, 'Account should remain used=false');
  assert.strictEqual(accounts[0].usedCount, 0, 'Account usedCount should remain 0');
  assert.strictEqual(accounts[0].status, 'ready');

  // Verify normal success update marks as used
  db.updateAccountStatus('nettest@example.com', {
    status: 'success',
    used: true
  });
  accounts = db.getAccounts();
  assert.strictEqual(accounts[0].used, true, 'Account should now be marked used=true');
  assert.strictEqual(accounts[0].usedCount, 1, 'Account usedCount should now be 1');

  db.close();
  if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
});
