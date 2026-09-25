const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const { DatabaseService } = require('../database/db');

const TEST_DB_PATH = path.join(__dirname, 'test_mapsshield.sqlite');

test.before(() => {
  // Clean up any lingering test database
  try { if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH); } catch (_) {}
});

test.after(() => {
  // Clean up test database after all tests complete
  try { if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH); } catch (_) {}
});

test('db: initializes schema successfully in clean SQLite database', () => {
  const db = new DatabaseService(TEST_DB_PATH);
  assert.ok(db, 'DatabaseService should initialize');
  assert.ok(fs.existsSync(TEST_DB_PATH), 'SQLite database file should be created');
});

test('db: saves and retrieves accounts with transparent AES-256-GCM encryption', () => {
  const db = new DatabaseService(TEST_DB_PATH);
  const rawAccounts = [
    {
      email: 'testuser1@gmail.com',
      password: 'SecretPassword999!',
      twoFactor: 'JBSWY3DPEHPK3PXP',
      backupCode: '12345678, 87654321'
    }
  ];

  db.saveAccounts(rawAccounts, false);
  const retrieved = db.getAccounts();

  assert.strictEqual(retrieved.length, 1);
  assert.strictEqual(retrieved[0].email, 'testuser1@gmail.com');
  // Passwords and 2FA should be transparently decrypted back to plaintext
  assert.strictEqual(retrieved[0].password, 'SecretPassword999!');
  assert.strictEqual(retrieved[0].twoFactor, 'JBSWY3DPEHPK3PXP');
  assert.strictEqual(retrieved[0].backupCode, '12345678, 87654321');

  // Verify raw SQLite row is actually encrypted
  const rawRow = db.db.prepare('SELECT password, twoFactor FROM accounts WHERE email = ?').get('testuser1@gmail.com');
  assert.ok(rawRow.password.startsWith('ENC:'), 'Raw database password must be encrypted with ENC: prefix');
  assert.ok(rawRow.twoFactor.startsWith('ENC:'), 'Raw database 2FA must be encrypted with ENC: prefix');
});

test('db: saves and retrieves review links correctly', () => {
  const db = new DatabaseService(TEST_DB_PATH);
  const links = [
    {
      url: 'https://maps.app.goo.gl/testlink123',
      reason: 'spam',
      mode: 'standard',
      targetCount: 5,
      doneCount: 2,
      businessName: 'Coffee Shop NYC',
      country: 'United States'
    }
  ];

  db.saveLinks(links, false);
  const retrieved = db.getLinks();

  assert.strictEqual(retrieved.length, 1);
  assert.strictEqual(retrieved[0].url, 'https://maps.app.goo.gl/testlink123');
  assert.strictEqual(retrieved[0].targetCount, 5);
  assert.strictEqual(retrieved[0].doneCount, 2);
  assert.strictEqual(retrieved[0].businessName, 'Coffee Shop NYC');
});

test('db: updates link progress with exact URL match (BUG-03 regression test)', () => {
  const db = new DatabaseService(TEST_DB_PATH);
  const urlA = 'https://maps.app.goo.gl/abc';
  const urlB = 'https://maps.app.goo.gl/abcdef';

  db.saveLinks([
    { url: urlA, targetCount: 3, doneCount: 0 },
    { url: urlB, targetCount: 3, doneCount: 0 }
  ], false);

  // Update only urlA
  db.updateLinkProgress(urlA, { status: 'completed', timestamp: '12:00:00' });

  const links = db.getLinks();
  const linkA = links.find(l => l.url === urlA);
  const linkB = links.find(l => l.url === urlB);

  assert.strictEqual(linkA.doneCount, 1, 'Link A should be updated to 1');
  assert.strictEqual(linkB.doneCount, 0, 'Link B must remain 0 and not be affected by substring match');
});

test('db: saves and retrieves settings with encrypted AI API key', () => {
  const db = new DatabaseService(TEST_DB_PATH);
  const settings = {
    browserPath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    aiApiKey: 'AIzaSySecretTestKey1234567890',
    aiProvider: 'gemini',
    reportReason: 'spam'
  };

  db.saveSettings(settings);
  const retrieved = db.getSettings();

  assert.strictEqual(retrieved.aiApiKey, 'AIzaSySecretTestKey1234567890', 'Decrypted API key should match');

  // Verify raw SQLite value is encrypted
  const rawRow = db.db.prepare('SELECT value FROM app_settings WHERE key = ?').get('aiApiKey');
  assert.ok(rawRow.value.startsWith('ENC:'), 'Raw database AI key must be encrypted with ENC: prefix');
});

test('db: saveAccounts UPSERT preserves lastUsedAt and usedCount on subsequent saves', () => {
  const db = new DatabaseService(TEST_DB_PATH);
  const email = 'upsert_test@gmail.com';

  // 1. Initial save
  db.saveAccounts([
    {
      email,
      password: 'Pass1',
      twoFactor: '2fa_initial',
      backupCode: 'backup_initial'
    }
  ]);

  // 2. Mark account as used with lastUsedAt
  db.updateAccountStatus(email, {
    status: 'success',
    used: true,
    timestamp: '2026-09-23 21:00:00'
  });

  const afterUse = db.getAccounts().find(a => a.email === email);
  assert.strictEqual(afterUse.used, true);
  assert.strictEqual(afterUse.usedCount, 1);
  assert.strictEqual(afterUse.lastUsedAt, '2026-09-23 21:00:00');

  // 3. User updates password from UI (UI passes new password, but no lastUsedAt)
  db.saveAccounts([
    {
      email,
      password: 'NewPassUpdated!',
      twoFactor: '2fa_initial',
      backupCode: 'backup_initial',
      used: true,
      usedCount: 1
    }
  ]);

  const afterEdit = db.getAccounts().find(a => a.email === email);
  assert.strictEqual(afterEdit.password, 'NewPassUpdated!', 'Password should be updated');
  assert.strictEqual(afterEdit.used, true, 'used status must be preserved');
  assert.strictEqual(afterEdit.usedCount, 1, 'usedCount must be preserved');
  assert.strictEqual(afterEdit.lastUsedAt, '2026-09-23 21:00:00', 'lastUsedAt timestamp must NOT be wiped');
});

test('db: saveLinks UPSERT preserves doneCount on subsequent saves', () => {
  const db = new DatabaseService(TEST_DB_PATH);
  const testUrl = 'https://maps.app.goo.gl/upsertlink456';

  db.saveLinks([
    { url: testUrl, reason: 'spam', targetCount: 5, doneCount: 0 }
  ]);

  // Update progress
  db.updateLinkProgress(testUrl, { status: 'completed' });
  assert.strictEqual(db.getLinks().find(l => l.url === testUrl).doneCount, 1);

  // Subsequent save from UI
  db.saveLinks([
    { url: testUrl, reason: 'conflict', targetCount: 10 }
  ]);

  const updated = db.getLinks().find(l => l.url === testUrl);
  assert.strictEqual(updated.reason, 'conflict', 'Reason should be updated');
  assert.strictEqual(updated.targetCount, 10, 'Target count should be updated');
  assert.strictEqual(updated.doneCount, 1, 'doneCount progress must be preserved');
});

test('db: respects MAPSSHIELD_USER_DATA environment path', () => {
  const customUserData = path.join(__dirname, 'temp_test_user_data');
  const customDbDir = path.join(customUserData, 'database');
  const customDbPath = path.join(customDbDir, 'mapsshield.sqlite');

  try {
    process.env.MAPSSHIELD_USER_DATA = customUserData;
    const db = new DatabaseService();
    assert.strictEqual(db.dbPath, customDbPath);
    assert.ok(fs.existsSync(customDbPath), 'Database file must be created inside MAPSSHIELD_USER_DATA/database');
    db.close();
  } finally {
    delete process.env.MAPSSHIELD_USER_DATA;
    try {
      if (fs.existsSync(customUserData)) {
        fs.rmSync(customUserData, { recursive: true, force: true });
      }
    } catch (_) {}
  }
});


