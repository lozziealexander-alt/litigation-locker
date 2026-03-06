const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Encrypt data with AES-256-GCM
 * @param {Buffer} data - Data to encrypt
 * @param {Buffer} key - 32-byte encryption key
 * @returns {Buffer} - IV + AuthTag + Ciphertext
 */
function encrypt(data, key) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH
  });

  const encrypted = Buffer.concat([
    cipher.update(data),
    cipher.final()
  ]);

  const authTag = cipher.getAuthTag();

  // Format: IV (16) + AuthTag (16) + Ciphertext
  return Buffer.concat([iv, authTag, encrypted]);
}

/**
 * Decrypt data with AES-256-GCM
 * @param {Buffer} encryptedData - IV + AuthTag + Ciphertext
 * @param {Buffer} key - 32-byte encryption key
 * @returns {Buffer} - Decrypted data
 */
function decrypt(encryptedData, key) {
  const iv = encryptedData.subarray(0, IV_LENGTH);
  const authTag = encryptedData.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = encryptedData.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH
  });
  decipher.setAuthTag(authTag);

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final()
  ]);
}

/**
 * Encrypt a string (convenience wrapper)
 */
function encryptString(text, key) {
  return encrypt(Buffer.from(text, 'utf8'), key);
}

/**
 * Decrypt to string (convenience wrapper)
 */
function decryptString(encryptedData, key) {
  return decrypt(encryptedData, key).toString('utf8');
}

module.exports = {
  encrypt,
  decrypt,
  encryptString,
  decryptString
};
