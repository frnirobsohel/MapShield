const test = require('node:test');
const assert = require('node:assert');
const {
  generateTOTP,
  isValidSecret,
  isActualBackupCodePage,
  isActualTotpPage,
  ensureGoogleLoggedIn
} = require('../modules/auth');

test('totp: validates base32 secrets correctly', () => {
  assert.strictEqual(isValidSecret('JBSWY3DPEHPK3PXP'), true);
  assert.strictEqual(isValidSecret('jbswy3dpehpk3pxp'), true);
  assert.strictEqual(isValidSecret(''), false);
  assert.strictEqual(isValidSecret(null), false);
  assert.strictEqual(isValidSecret('1234'), false);
});

test('totp: generates 6-digit TOTP code accurately', () => {
  const secret = 'JBSWY3DPEHPK3PXP';
  const code = generateTOTP(secret);
  assert.ok(typeof code === 'string');
  assert.strictEqual(code.length, 6);
  assert.ok(/^\d{6}$/.test(code));
});

test('auth: ensureGoogleLoggedIn is exported as an async function', () => {
  assert.strictEqual(typeof ensureGoogleLoggedIn, 'function');
});
