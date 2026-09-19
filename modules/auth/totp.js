/**
 * modules/auth/totp.js
 * Zero-dependency RFC 6238 Time-Based One-Time Password (TOTP) generator
 * Uses native Node.js crypto module for HMAC-SHA1.
 */

const crypto = require('crypto');

/**
 * Decodes a Base32 string into a Buffer
 * @param {string} base32
 * @returns {Buffer}
 */
function base32ToBuffer(base32) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = String(base32 || '')
    .toUpperCase()
    .replace(/[\s=-]/g, '');

  if (!clean || clean.length === 0) {
    return Buffer.alloc(0);
  }

  let bits = '';
  for (let i = 0; i < clean.length; i++) {
    const val = alphabet.indexOf(clean[i]);
    if (val === -1) {
      continue; // Skip unrecognized characters
    }
    bits += val.toString(2).padStart(5, '0');
  }

  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.substring(i, i + 8), 2));
  }

  return Buffer.from(bytes);
}

/**
 * Checks if a string looks like a valid Base32 secret
 * @param {string} secret
 * @returns {boolean}
 */
function isValidSecret(secret) {
  if (!secret || typeof secret !== 'string') return false;
  const clean = secret.toUpperCase().replace(/[\s=-]/g, '');
  if (clean.length < 8) return false;
  return /^[A-Z2-7]+$/.test(clean);
}

/**
 * Generates a 6-digit TOTP code from a Base32 secret key
 * @param {string} secret - Base32 encoded secret key
 * @param {Object} [options]
 * @param {number} [options.step=30] - Time step in seconds (standard 30s)
 * @param {number} [options.digits=6] - Number of digits (standard 6 digits)
 * @param {number} [options.epoch] - Custom epoch timestamp in ms (defaults to Date.now())
 * @returns {string|null} - 6-digit string or null if secret is invalid
 */
function generateTOTP(secret, options = {}) {
  if (!isValidSecret(secret)) {
    return null;
  }

  const opts = typeof options === 'number'
    ? { epoch: options < 10000000000 ? options * 1000 : options }
    : (options || {});

  const step = opts.step || 30;
  const digits = opts.digits || 6;
  const epoch = opts.epoch !== undefined ? opts.epoch : Date.now();

  const keyBuffer = base32ToBuffer(secret);
  if (keyBuffer.length === 0) return null;

  // Calculate 8-byte big-endian counter
  const counter = Math.floor(epoch / 1000 / step);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter), 0);

  // HMAC-SHA1 calculation
  const hmac = crypto.createHmac('sha1', keyBuffer).update(counterBuf).digest();

  // Dynamic truncation (RFC 4226 / 6238)
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = binary % Math.pow(10, digits);
  return otp.toString().padStart(digits, '0');
}

/**
 * Returns the number of seconds remaining until the current TOTP expires
 * @param {number} [step=30]
 * @returns {number}
 */
function getRemainingSeconds(step = 30) {
  const currentSec = Math.floor(Date.now() / 1000);
  return step - (currentSec % step);
}

module.exports = {
  generateTOTP,
  isValidSecret,
  getRemainingSeconds,
  base32ToBuffer
};
