const { ipcMain } = require('electron');
const keyManager = require('./crypto/key-derivation');
const { burn, verifyBurn } = require('./crypto/kill-switch');
const db = require('./database/init');

function registerIpcHandlers() {

  // ==================== VAULT ====================

  ipcMain.handle('vault:exists', async () => {
    return db.vaultExists();
  });

  ipcMain.handle('vault:setup', async (event, passphrase) => {
    try {
      // Generate new salt
      const salt = keyManager.generateSalt();

      // Derive key
      await keyManager.unlock(passphrase, salt);

      // Store salt
      db.storeSalt(salt);

      // Initialize master database
      db.initMasterDb(keyManager.getMasterKey());

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('vault:unlock', async (event, passphrase) => {
    try {
      const salt = db.getSalt();
      if (!salt) {
        return { success: false, error: 'Vault not set up' };
      }

      await keyManager.unlock(passphrase, salt);
      db.initMasterDb(keyManager.getMasterKey());

      return { success: true };
    } catch (error) {
      return { success: false, error: 'Invalid passphrase' };
    }
  });

  ipcMain.handle('vault:lock', async () => {
    keyManager.lock();
    db.closeMasterDb();
    return { success: true };
  });

  ipcMain.handle('vault:isUnlocked', async () => {
    return keyManager.isUnlocked();
  });

  // ==================== BURN ====================

  ipcMain.handle('burn:execute', async (event, scope) => {
    // Close master DB before burning so files aren't locked
    db.closeMasterDb();
    return await burn(scope);
  });

  ipcMain.handle('burn:verify', async () => {
    return verifyBurn();
  });

  // ==================== CASES ====================

  ipcMain.handle('cases:list', async () => {
    try {
      return { success: true, cases: db.listCases() };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('cases:create', async (event, name) => {
    try {
      const caseData = db.createCase(name);
      return { success: true, case: caseData };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Placeholder handlers for future sessions
  ipcMain.handle('cases:open', async (event, caseId) => {
    // Will be implemented in Session 1
    return { success: true };
  });

  ipcMain.handle('documents:ingest', async (event, filePaths, caseId) => {
    // Will be implemented in Session 1
    return { success: true, documents: [] };
  });

  ipcMain.handle('documents:list', async (event, caseId) => {
    // Will be implemented in Session 1
    return { success: true, documents: [] };
  });

  ipcMain.handle('documents:get', async (event, docId, caseId) => {
    // Will be implemented in Session 1
    return { success: true, document: null };
  });

  ipcMain.handle('timeline:get', async (event, caseId) => {
    // Will be implemented in Session 2
    return { success: true, timeline: [] };
  });

  ipcMain.handle('timeline:getConnections', async (event, caseId) => {
    // Will be implemented in Session 3
    return { success: true, connections: [] };
  });
}

module.exports = { registerIpcHandlers };
