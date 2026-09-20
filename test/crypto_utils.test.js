const test = require('node:test');
const assert = require('node:assert');
const { encrypt, decrypt, isEncrypted, deriveKey, PREFIX } = require('../modules/helpers/crypto_utils');

test('crypto_utils: deriveKey returns a 32-byte Buffer', () => {
  const key = deriveKey();
  assert.ok(Buffer.isBuffer(key), 'Key should be a Buffer');
  assert.strictEqual(key.length, 32, 'AES-256 requires 32-byte key');
});

test('crypto_utils: encrypt and decrypt roundtrip matches original plaintext', () => {
  const secretText = 'SuperSecretP@ssw0rd!123';
  const encrypted = encrypt(secretText);

  assert.ok(typeof encrypted === 'string', 'Encrypted text should be string');
  assert.notStrictEqual(encrypted, secretText, 'Encrypted output must not equal plaintext');
  assert.ok(encrypted.startsWith(PREFIX), `Encrypted output should start with ${PREFIX}`);
  assert.ok(isEncrypted(encrypted), 'isEncrypted should return true for encrypted text');

  const decrypted = decrypt(encrypted);
  assert.strictEqual(decrypted, secretText, 'Decrypted text should match original');
});

test('crypto_utils: handles null, undefined, and empty string safely', () => {
  assert.strictEqual(encrypt(''), '');
  assert.strictEqual(encrypt(null), '');
  assert.strictEqual(encrypt(undefined), '');

  assert.strictEqual(decrypt(''), '');
  assert.strictEqual(decrypt(null), '');
  assert.strictEqual(decrypt(undefined), '');

  assert.strictEqual(isEncrypted(''), false);
  assert.strictEqual(isEncrypted(null), false);
});

test('crypto_utils: does not double-encrypt already encrypted text', () => {
  const secret = 'SampleSecret123';
  const encryptedOnce = encrypt(secret);
  const encryptedTwice = encrypt(encryptedOnce);
  assert.strictEqual(encryptedOnce, encryptedTwice, 'Should not double-encrypt');
});

test('crypto_utils: backward compatibility with plaintext legacy values', () => {
  const legacyPlaintext = 'legacy_plaintext_password';
  const result = decrypt(legacyPlaintext);
  assert.strictEqual(result, legacyPlaintext, 'Legacy unencrypted string should return as-is');
  assert.strictEqual(isEncrypted(legacyPlaintext), false);
});

test('crypto_utils: corrupted ciphertext returns safe fallback without crashing', () => {
  const corrupted = 'ENC:invalid_iv:invalid_tag:invalid_cipher';
  const result = decrypt(corrupted);
  assert.strictEqual(typeof result, 'string');
});
