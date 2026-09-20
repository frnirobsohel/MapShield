/**
 * modules/helpers/crypto_utils.js
 * AES-256-GCM Encryption/Decryption Utility for Sensitive Data at Rest
 * Uses machine-derived key so credentials are tied to the specific computer.
 */

const crypto = require('crypto');
const os = require('os');

const ALGORITHM = 'aes-256-gcm';
const ENCODING = 'base64';
const PREFIX = 'ENC:'; // Prefix to identify encrypted values

/**
 * Derives a 32-byte encryption key from machine-specific identifiers.
 * This ensures the encrypted data can only be decrypted on the same machine.
 * @returns {Buffer} 32-byte key
 */
function deriveKey() {
  const host = os.hostname() || 'LOCALHOST';
  const cpu = os.cpus()[0]?.model || 'GENERIC-CPU';
  const platform = os.platform() + os.arch();
  const seed = `mapsshield:${host}:${cpu}:${platform}`;
  return crypto.createHash('sha256').update(seed).digest();
}

/**
 * Encrypts a plaintext string using AES-256-GCM
 * @param {string} plaintext - The text to encrypt
 * @returns {string} Encrypted string with ENC: prefix, or original if empty
 */
function encrypt(plaintext) {
  if (!plaintext || typeof plaintext !== 'string' || plaintext.length === 0) {
    return plaintext || '';
  }
  // Already encrypted — don't double-encrypt
  if (plaintext.startsWith(PREFIX)) {
    return plaintext;
  }

  try {
    const key = deriveKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', ENCODING);
    encrypted += cipher.final(ENCODING);
    const authTag = cipher.getAuthTag();

    // Format: ENC:<iv>:<authTag>:<ciphertext>
    return PREFIX + [
      iv.toString(ENCODING),
      authTag.toString(ENCODING),
      encrypted
    ].join(':');
  } catch (e) {
    console.warn('⚠️ Encryption failed, storing as-is:', e.message);
    return plaintext;
  }
}

/**
 * Decrypts an AES-256-GCM encrypted string
 * @param {string} encryptedText - The encrypted text with ENC: prefix
 * @returns {string} Decrypted plaintext, or original if not encrypted
 */
function decrypt(encryptedText) {
  if (!encryptedText || typeof encryptedText !== 'string') {
    return encryptedText || '';
  }
  // Not encrypted — return as-is (backward compatible with existing plaintext data)
  if (!encryptedText.startsWith(PREFIX)) {
    return encryptedText;
  }

  try {
    const payload = encryptedText.slice(PREFIX.length);
    const parts = payload.split(':');
    if (parts.length < 3) {
      return encryptedText; // Malformed, return as-is
    }

    const iv = Buffer.from(parts[0], ENCODING);
    const authTag = Buffer.from(parts[1], ENCODING);
    const ciphertext = parts.slice(2).join(':'); // Rejoin in case ciphertext contains ':'

    const key = deriveKey();
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: 16 });
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext, ENCODING, 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (e) {
    console.warn('⚠️ Decryption failed (key mismatch or corrupted data):', e.message);
    return ''; // Return empty on failure — don't expose garbled data
  }
}

/**
 * Checks if a string is already encrypted (has ENC: prefix)
 * @param {string} value
 * @returns {boolean}
 */
function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

module.exports = {
  encrypt,
  decrypt,
  isEncrypted,
  deriveKey,
  PREFIX
};
