const argon2 = require('argon2');
const crypto = require('crypto');

// Argon2id parameters (memory-hard, GPU-resistant)
const ARGON2_CONFIG = {
  type: argon2.argon2id,
  memoryCost: 65536,      // 64 MB
  timeCost: 3,            // 3 iterations
  parallelism: 4,
  hashLength: 32          // 256-bit key
};

class KeyManager {
  constructor() {
    this.masterKey = null;
    this.salt = null;
  }

  // Generate new salt for first-time setup
  generateSalt() {
    return crypto.randomBytes(32);
  }

  // Derive master key from passphrase
  async deriveKey(passphrase, salt) {
    const hash = await argon2.hash(passphrase, {
      ...ARGON2_CONFIG,
      salt: salt,
      raw: true
    });
    return hash;
  }

  // Unlock vault with passphrase
  async unlock(passphrase, storedSalt) {
    this.salt = storedSalt;
    this.masterKey = await this.deriveKey(passphrase, storedSalt);
    return true;
  }

  // Check if vault is unlocked
  isUnlocked() {
    return this.masterKey !== null;
  }

  // Get master key (only if unlocked)
  getMasterKey() {
    if (!this.masterKey) {
      throw new Error('Vault is locked');
    }
    return this.masterKey;
  }

  // Derive case-specific key using HKDF
  deriveCaseKey(caseId) {
    if (!this.masterKey) {
      throw new Error('Vault is locked');
    }
    return crypto.createHmac('sha256', this.masterKey)
      .update(`case:${caseId}`)
      .digest();
  }

  // Lock vault (clear key from memory)
  lock() {
    if (this.masterKey) {
      // Overwrite with zeros before releasing
      this.masterKey.fill(0);
    }
    this.masterKey = null;
  }
}

module.exports = new KeyManager();
