const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const { secureDelete, secureDeleteDirectory } = require('./secure-delete');
const keyManager = require('./key-derivation');

/**
 * BURN - Complete destruction of all data
 *
 * Destroys:
 * 1. All case databases
 * 2. All cached documents
 * 3. Master vault registry
 * 4. Encryption salt
 * 5. Any temp files
 * 6. SQLite WAL/journal files (can contain plaintext)
 */
async function burn(scope = 'all') {
  const userDataPath = app.getPath('userData');
  const results = {
    scope,
    startTime: Date.now(),
    deleted: [],
    errors: []
  };

  try {
    // Lock the vault first (clear keys from memory)
    keyManager.lock();

    if (scope === 'all') {
      // Delete everything
      const targets = [
        path.join(userDataPath, 'case-databases'),
        path.join(userDataPath, 'documents'),
        path.join(userDataPath, 'cache'),
        path.join(userDataPath, 'master.db'),
        path.join(userDataPath, 'master.db-wal'),
        path.join(userDataPath, 'master.db-shm'),
        path.join(userDataPath, 'master.db-journal'),
        path.join(userDataPath, 'salt'),
        path.join(userDataPath, 'config.json')
      ];

      for (const target of targets) {
        if (fs.existsSync(target)) {
          const stat = fs.statSync(target);
          if (stat.isDirectory()) {
            const result = await secureDeleteDirectory(target);
            results.deleted.push({ path: target, ...result });
          } else {
            const result = await secureDelete(target);
            results.deleted.push({ path: target, ...result });
          }
        }
      }

      // Also sweep system temp directories for any app-related files
      const tempDir = app.getPath('temp');
      const appTempPattern = /litigation-locker|evidence-locker/i;

      if (fs.existsSync(tempDir)) {
        const tempFiles = fs.readdirSync(tempDir);
        for (const file of tempFiles) {
          if (appTempPattern.test(file)) {
            const fullPath = path.join(tempDir, file);
            const result = await secureDelete(fullPath);
            results.deleted.push({ path: fullPath, ...result });
          }
        }
      }
    }

    results.endTime = Date.now();
    results.duration = results.endTime - results.startTime;
    results.success = true;

  } catch (error) {
    results.success = false;
    results.errors.push(error.message);
  }

  return results;
}

/**
 * Verify burn completed (check targets are gone)
 */
function verifyBurn() {
  const userDataPath = app.getPath('userData');
  const targets = [
    path.join(userDataPath, 'case-databases'),
    path.join(userDataPath, 'documents'),
    path.join(userDataPath, 'master.db'),
    path.join(userDataPath, 'salt')
  ];

  const remaining = targets.filter(t => fs.existsSync(t));

  return {
    verified: remaining.length === 0,
    remaining
  };
}

module.exports = {
  burn,
  verifyBurn
};
