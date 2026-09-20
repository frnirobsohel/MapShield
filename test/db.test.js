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
