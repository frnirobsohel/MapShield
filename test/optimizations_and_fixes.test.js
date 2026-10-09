const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const { DatabaseService } = require('../database/db');
const { detectCurrentPageStatus } = require('../modules/auth/google_auth');
const { isRecaptchaPassed } = require('../modules/captcha/captcha_solver');

const TEST_OPT_DB_PATH = path.join(__dirname, 'test_optimizations.sqlite');

test.before(() => {
  try { if (fs.existsSync(TEST_OPT_DB_PATH)) fs.unlinkSync(TEST_OPT_DB_PATH); } catch (_) {}
});

test.after(() => {
  try { if (fs.existsSync(TEST_OPT_DB_PATH)) fs.unlinkSync(TEST_OPT_DB_PATH); } catch (_) {}
});

test('db: updateAccountBackupCodes updates remaining codes with transparent encryption', () => {
  const db = new DatabaseService(TEST_OPT_DB_PATH);
  const account = {
    id: 'acc_test_backup_1',
    email: 'backup_test@gmail.com',
    password: 'password123',
    backupCode: '11112222, 33334444, 55556666'
  };

  db.saveAccounts([account]);
  let retrieved = db.getAccounts();
  assert.strictEqual(retrieved[0].backupCode, '11112222, 33334444, 55556666');

  // Consume first backup code
  db.updateAccountBackupCodes('acc_test_backup_1', '33334444, 55556666');
  retrieved = db.getAccounts();
  assert.strictEqual(retrieved[0].backupCode, '33334444, 55556666', 'Backup codes must be updated in SQLite');

  // Verify raw SQLite row is encrypted
  const raw = db.db.prepare('SELECT backupCode FROM accounts WHERE id = ?').get('acc_test_backup_1');
  assert.ok(raw.backupCode.startsWith('ENC:'), 'Updated backup codes must remain encrypted at rest');
  db.close();
});

test('db: updateAccountBackupCodesByEmail updates remaining codes by email case-insensitively', () => {
  const db = new DatabaseService(TEST_OPT_DB_PATH);
  db.updateAccountBackupCodesByEmail('BACKUP_TEST@gmail.com', '55556666');
  const retrieved = db.getAccounts();
  assert.strictEqual(retrieved[0].backupCode, '55556666');
  db.close();
});

test('db: saveProxies non-destructive upsert preserves latency and active test status', () => {
  const db = new DatabaseService(TEST_OPT_DB_PATH);
  const initialProxies = [
    {
      id: 'prx_1',
      host: '192.168.1.100',
      port: 8080,
      protocol: 'http',
      username: 'user1',
      password: 'pass1',
      formatted: '192.168.1.100:8080',
      latency: '142ms',
      status: 'active',
      lastTestedAt: new Date().toISOString()
    }
  ];

  db.saveProxies(initialProxies);
  let saved = db.getProxies();
  assert.strictEqual(saved.length, 1);
  assert.strictEqual(saved[0].latency, '142ms');
  assert.strictEqual(saved[0].status, 'active');

  // Now simulate saving proxies again from UI (where latency might default to '—' or untested)
  const incomingFromUi = [
    {
      host: '192.168.1.100',
      port: 8080,
      protocol: 'http',
      username: 'user1',
      password: 'pass1',
      formatted: '192.168.1.100:8080',
      latency: '—',
      status: 'untested'
    },
    {
      host: '10.0.0.1',
      port: 3128,
      protocol: 'http',
      formatted: '10.0.0.1:3128'
    }
  ];

  db.saveProxies(incomingFromUi);
  saved = db.getProxies();
  assert.strictEqual(saved.length, 2);

  const existingProxy = saved.find(p => p.host === '192.168.1.100');
  assert.strictEqual(existingProxy.latency, '142ms', 'Existing proxy latency must NOT be wiped by saveProxies');
  assert.strictEqual(existingProxy.status, 'active', 'Existing proxy status must NOT be downgraded to untested');
  db.close();
});

test('db: saveAccounts handles large dataset chunking (>500 accounts) without SQLite error', () => {
  const db = new DatabaseService(TEST_OPT_DB_PATH);
  const largeAccounts = [];
  for (let i = 0; i < 550; i++) {
    largeAccounts.push({
      email: `bulk_user_${i}@example.com`,
      password: `pass_${i}`,
      twoFactor: '',
      backupCode: ''
    });
  }

  // Must not throw "too many SQL variables"
  assert.doesNotThrow(() => {
    db.saveAccounts(largeAccounts);
  });

  const count = db.db.prepare('SELECT COUNT(*) as count FROM accounts').get().count;
  assert.ok(count >= 550, 'All accounts should be saved successfully across chunks');
  db.close();
});

test('auth: detectCurrentPageStatus identifies recovery email challenge accurately', async () => {
  const mockPageWithRecoveryEmail = {
    url: () => 'https://accounts.google.com/signin/v2/challenge/k',
    evaluate: async (fn, ...args) => {
      // Mock DOM environment with recovery email challenge
      const mockDocument = {
        querySelector: (sel) => {
          if (sel.includes('knowledgePreregisteredEmailResponse')) return {};
          return null;
        },
        querySelectorAll: () => [],
        body: { innerText: 'Confirm the recovery email address associated with your account' }
      };
      const mockWindow = { location: { href: 'https://accounts.google.com/signin/v2/challenge/k' } };
      
      // Execute function in mocked context
      const globalDoc = global.document;
      const globalWin = global.window;
      global.document = mockDocument;
      global.window = mockWindow;
      try {
        return await fn(...args);
      } finally {
        global.document = globalDoc;
        global.window = globalWin;
      }
    }
  };

  const status = await detectCurrentPageStatus(mockPageWithRecoveryEmail, 'user@example.com');
  assert.strictEqual(status.type, 'RECOVERY_EMAIL_CHALLENGE', 'Must detect RECOVERY_EMAIL_CHALLENGE');
});

test('captcha: isRecaptchaPassed skips detached frames gracefully without throwing', async () => {
  const mockDetachedFrame = {
    isDetached: () => true,
    $: async () => { throw new Error('Attempted to use detached Frame'); }
  };
  const mockActiveFrame = {
    isDetached: () => false,
    $: async (sel) => sel.includes('recaptcha-checkbox-checked') ? {} : null
  };

  const mockPage = {
    frames: () => [mockDetachedFrame, mockActiveFrame],
    $: async () => null,
    evaluate: async () => false
  };

  const passed = await isRecaptchaPassed(mockPage);
  assert.strictEqual(passed, true, 'Must ignore detached frame and resolve via active frame');
});

test('helpers: formatTime correctly parses ISO 8601 timestamps and legacy strings', () => {
  global.window = global.window || {};
  require('../src/renderer/js/utils/helpers');
  const UIHelpers = global.window.UIHelpers;
  assert.ok(UIHelpers, 'UIHelpers should be defined');
  const formattedIso = UIHelpers.formatTime('2026-10-08T22:30:00.000Z');
  assert.match(formattedIso, /\d{1,2}:\d{2}/, 'Must format ISO string as time');
  const formattedLegacy = UIHelpers.formatTime('10:30:00 PM');
  assert.ok(formattedLegacy.includes('10:30') || formattedLegacy.includes('PM'), 'Must preserve or format valid string');
  assert.strictEqual(UIHelpers.formatTime(null), '—', 'Must return dash for null');
});

