const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { app } = require('electron');
const keyManager = require('../crypto/key-derivation');

let masterDb = null;

/**
 * Initialize master database (vault registry)
 */
function initMasterDb(masterKey) {
  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'master.db');

  // Ensure directory exists
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
  }

  masterDb = new Database(dbPath);

  // Enable SQLCipher encryption
  masterDb.pragma(`key = "x'${masterKey.toString('hex')}'"`);

  // Create master tables
  masterDb.exec(`
    CREATE TABLE IF NOT EXISTS cases (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      db_path TEXT NOT NULL,
      salt BLOB NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  return masterDb;
}

/**
 * Create a new case with its own encrypted database
 */
function createCase(name) {
  const userDataPath = app.getPath('userData');
  const caseId = crypto.randomUUID();
  const caseSalt = crypto.randomBytes(32);
  const caseKey = keyManager.deriveCaseKey(caseId);

  // Create databases directory
  const dbDir = path.join(userDataPath, 'databases');
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const dbPath = path.join(dbDir, `${caseId}.db`);

  // Create case database
  const caseDb = new Database(dbPath);
  caseDb.pragma(`key = "x'${caseKey.toString('hex')}'"`);

  // Read and execute schema
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  caseDb.exec(schema);

  caseDb.close();

  // Register in master DB
  const stmt = masterDb.prepare(`
    INSERT INTO cases (id, name, db_path, salt)
    VALUES (?, ?, ?, ?)
  `);
  stmt.run(caseId, name, dbPath, caseSalt);

  return { id: caseId, name, dbPath };
}

/**
 * Open an existing case database
 */
function openCase(caseId) {
  const caseKey = keyManager.deriveCaseKey(caseId);

  const stmt = masterDb.prepare('SELECT db_path FROM cases WHERE id = ?');
  const row = stmt.get(caseId);

  if (!row) {
    throw new Error(`Case not found: ${caseId}`);
  }

  const caseDb = new Database(row.db_path);
  caseDb.pragma(`key = "x'${caseKey.toString('hex')}'"`);

  return caseDb;
}

/**
 * List all cases
 */
function listCases() {
  const stmt = masterDb.prepare('SELECT id, name, created_at, updated_at FROM cases ORDER BY updated_at DESC');
  return stmt.all();
}

/**
 * Check if vault exists (has been set up)
 */
function vaultExists() {
  const userDataPath = app.getPath('userData');
  const saltPath = path.join(userDataPath, 'salt');
  return fs.existsSync(saltPath);
}

/**
 * Get stored salt
 */
function getSalt() {
  const userDataPath = app.getPath('userData');
  const saltPath = path.join(userDataPath, 'salt');

  if (!fs.existsSync(saltPath)) {
    return null;
  }

  return fs.readFileSync(saltPath);
}

/**
 * Store salt (first-time setup)
 */
function storeSalt(salt) {
  const userDataPath = app.getPath('userData');

  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
  }

  const saltPath = path.join(userDataPath, 'salt');
  fs.writeFileSync(saltPath, salt);
}

/**
 * Close master database
 */
function closeMasterDb() {
  if (masterDb) {
    masterDb.close();
    masterDb = null;
  }
}

module.exports = {
  initMasterDb,
  createCase,
  openCase,
  listCases,
  vaultExists,
  getSalt,
  storeSalt,
  closeMasterDb
};
