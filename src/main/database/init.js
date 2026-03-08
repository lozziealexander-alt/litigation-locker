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
  const dbDir = path.join(userDataPath, 'case-databases');
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const dbPath = path.join(dbDir, `${caseId}.db`);

  // Create case database
  const caseDb = new Database(dbPath);

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

  // Ensure the databases directory exists (may have been removed)
  const dbDir = path.dirname(row.db_path);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const fileSize = fs.existsSync(row.db_path) ? fs.statSync(row.db_path).size : 0;
  console.log('[DB] openCase path=' + row.db_path + ' fileSize=' + fileSize);

  const caseDb = new Database(row.db_path);

  const tables = caseDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  console.log('[DB] openCase tables=' + tables.length);
  if (tables.length === 0 && fileSize < 4096) {
    console.log('[DB] Fresh DB, applying schema');
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    caseDb.exec(schema);
  } else if (tables.length === 0 && fileSize >= 4096) {
    console.log('[DB] ERROR: Existing file has 0 tables - refusing to overwrite');
    throw new Error('Database file exists but has no readable tables. File may be corrupted.');
  }

  // ---- Migrations for existing databases ----

  // Add evidence classification columns (inference-based classification update)
  const docColumns = caseDb.prepare("PRAGMA table_info(documents)").all();
  const columnNames = docColumns.map(c => c.name);

  if (!columnNames.includes('evidence_confidence')) {
    caseDb.exec('ALTER TABLE documents ADD COLUMN evidence_confidence REAL');
  }
  if (!columnNames.includes('evidence_secondary')) {
    caseDb.exec('ALTER TABLE documents ADD COLUMN evidence_secondary TEXT');
  }
  if (!columnNames.includes('evidence_scores_json')) {
    caseDb.exec('ALTER TABLE documents ADD COLUMN evidence_scores_json TEXT');
  }

  // Add document_date_entries table (multi-date timeline support)
  const hasDateEntries = caseDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='document_date_entries'").get();
  if (!hasDateEntries) {
    caseDb.exec(`
      CREATE TABLE IF NOT EXISTS document_date_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        entry_date DATETIME NOT NULL,
        label TEXT,
        date_confidence TEXT CHECK(date_confidence IN ('exact', 'approximate', 'inferred')),
        is_primary BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_date_entries_doc ON document_date_entries(document_id);
      CREATE INDEX IF NOT EXISTS idx_date_entries_date ON document_date_entries(entry_date);
    `);
  }

  // Add jurisdiction column to case_context (jurisdiction toggle)
  const contextColumns = caseDb.prepare("PRAGMA table_info(case_context)").all();
  const contextColumnNames = contextColumns.map(c => c.name);
  if (!contextColumnNames.includes('jurisdiction')) {
    caseDb.exec("ALTER TABLE case_context ADD COLUMN jurisdiction TEXT DEFAULT 'both'");
  }

  // Add dossier fields to actors (gender, disability, dates)
  const actorColumns = caseDb.prepare("PRAGMA table_info(actors)").all();
  const actorColumnNames = actorColumns.map(c => c.name);
  if (!actorColumnNames.includes('gender')) {
    caseDb.exec("ALTER TABLE actors ADD COLUMN gender TEXT");
  }
  if (!actorColumnNames.includes('disability_status')) {
    caseDb.exec("ALTER TABLE actors ADD COLUMN disability_status TEXT");
  }
  if (!actorColumnNames.includes('start_date')) {
    caseDb.exec("ALTER TABLE actors ADD COLUMN start_date TEXT");
  }
  if (!actorColumnNames.includes('end_date')) {
    caseDb.exec("ALTER TABLE actors ADD COLUMN end_date TEXT");
  }

  // Add actor_id and period to pay_records
  const payColumns = caseDb.prepare("PRAGMA table_info(pay_records)").all();
  const payColumnNames = payColumns.map(c => c.name);
  if (!payColumnNames.includes('actor_id')) {
    caseDb.exec("ALTER TABLE pay_records ADD COLUMN actor_id TEXT REFERENCES actors(id)");
    caseDb.exec("CREATE INDEX IF NOT EXISTS idx_pay_records_actor ON pay_records(actor_id)");
  }
  if (!payColumnNames.includes('period')) {
    caseDb.exec("ALTER TABLE pay_records ADD COLUMN period TEXT");
  }

  // Add actor registry columns (aliases, in_reporting_chain)
  const actorColsForRegistry = caseDb.prepare("PRAGMA table_info(actors)").all();
  const actorColNamesForRegistry = actorColsForRegistry.map(c => c.name);
  if (!actorColNamesForRegistry.includes('aliases')) {
    caseDb.exec("ALTER TABLE actors ADD COLUMN aliases TEXT DEFAULT '[]'");
  }
  if (!actorColNamesForRegistry.includes('in_reporting_chain')) {
    caseDb.exec('ALTER TABLE actors ADD COLUMN in_reporting_chain INTEGER DEFAULT 0');
  }

  // Backfill: set in_reporting_chain = 1 for actors with chain-type relationships
  caseDb.exec(`
    UPDATE actors SET in_reporting_chain = 1
    WHERE relationship_to_self IN ('direct_supervisor', 'skip_level', 'senior_leadership', 'supervisor', 'executive')
    AND in_reporting_chain = 0
  `);

  // Add auto_detected column to actor_appearances (document-actor linking)
  const aaColumns = caseDb.prepare("PRAGMA table_info(actor_appearances)").all();
  const aaColumnNames = aaColumns.map(c => c.name);
  if (!aaColumnNames.includes('auto_detected')) {
    caseDb.exec("ALTER TABLE actor_appearances ADD COLUMN auto_detected BOOLEAN DEFAULT 0");
  }

  // Add anchors tables (Session 7: hub-spoke narrative)
  const hasAnchors = caseDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='anchors'").get();
  if (!hasAnchors) {
    caseDb.exec(`
      CREATE TABLE IF NOT EXISTS anchors (
        id TEXT PRIMARY KEY,
        anchor_type TEXT NOT NULL CHECK(anchor_type IN ('START', 'REPORTED', 'HELP', 'ADVERSE_ACTION', 'HARASSMENT', 'MILESTONE', 'END')),
        title TEXT NOT NULL,
        description TEXT,
        anchor_date DATE,
        date_confidence TEXT DEFAULT 'exact',
        what_happened TEXT,
        where_location TEXT,
        impact_summary TEXT,
        severity TEXT CHECK(severity IN ('minor', 'moderate', 'severe', 'egregious')),
        is_auto_generated BOOLEAN DEFAULT 1,
        user_edited BOOLEAN DEFAULT 0,
        source_context TEXT,
        sort_order INTEGER,
        is_expanded BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS anchor_incidents (
        anchor_id TEXT NOT NULL REFERENCES anchors(id),
        incident_id TEXT NOT NULL REFERENCES incidents(id),
        PRIMARY KEY (anchor_id, incident_id)
      );
      CREATE TABLE IF NOT EXISTS anchor_documents (
        anchor_id TEXT NOT NULL REFERENCES anchors(id),
        document_id TEXT NOT NULL REFERENCES documents(id),
        relevance TEXT DEFAULT 'supports',
        PRIMARY KEY (anchor_id, document_id)
      );
      CREATE TABLE IF NOT EXISTS anchor_actors (
        anchor_id TEXT NOT NULL REFERENCES anchors(id),
        actor_id TEXT NOT NULL REFERENCES actors(id),
        role_in_anchor TEXT,
        PRIMARY KEY (anchor_id, actor_id)
      );
      CREATE INDEX IF NOT EXISTS idx_anchors_date ON anchors(anchor_date);
      CREATE INDEX IF NOT EXISTS idx_anchors_type ON anchors(anchor_type);
    `);
  }

  // Add anchor_precedents junction table
  const hasAnchorPrecedents = caseDb.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='anchor_precedents'"
  ).get();
  if (!hasAnchorPrecedents) {
    caseDb.exec(`
      CREATE TABLE IF NOT EXISTS anchor_precedents (
        anchor_id TEXT NOT NULL REFERENCES anchors(id),
        precedent_id TEXT NOT NULL,
        relevance_note TEXT,
        linked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (anchor_id, precedent_id)
      );
      CREATE INDEX IF NOT EXISTS idx_anchor_precedents_anchor ON anchor_precedents(anchor_id);
    `);
  }

  // Add multi-event tracking columns to anchors
  const anchorCols = caseDb.prepare("PRAGMA table_info(anchors)").all();
  const anchorColNames = anchorCols.map(c => c.name);
  if (!anchorColNames.includes('contains_multiple_events')) {
    caseDb.exec("ALTER TABLE anchors ADD COLUMN contains_multiple_events BOOLEAN DEFAULT 0");
  }
  if (!anchorColNames.includes('event_count')) {
    caseDb.exec("ALTER TABLE anchors ADD COLUMN event_count INTEGER DEFAULT 1");
  }

  // Migrate anchors CHECK constraint to include HARASSMENT
  // SQLite can't ALTER CHECK constraints, so we recreate the table
  const checkSql = caseDb.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='anchors'"
  ).get();
  if (checkSql && checkSql.sql && !checkSql.sql.includes('HARASSMENT')) {
    console.log('[DB] Migrating anchors table to allow HARASSMENT type');
    // Clean up any leftover temp table from a previous failed migration
    caseDb.exec('DROP TABLE IF EXISTS anchors_new');
    // Read existing columns to handle any extra columns (e.g. action_direction)
    const existingCols = caseDb.prepare("PRAGMA table_info(anchors)").all().map(c => c.name);
    const baseCols = [
      'id', 'anchor_type', 'title', 'description', 'anchor_date', 'date_confidence',
      'what_happened', 'where_location', 'impact_summary', 'severity',
      'is_auto_generated', 'user_edited', 'source_context', 'sort_order', 'is_expanded',
      'contains_multiple_events', 'event_count', 'created_at', 'updated_at'
    ];
    // Find any extra columns added by previous migrations
    const extraCols = existingCols.filter(c => !baseCols.includes(c));
    const extraColDefs = extraCols.map(c => `${c} TEXT DEFAULT NULL`).join(',\n        ');
    const allCols = [...baseCols, ...extraCols].join(', ');

    caseDb.exec(`
      CREATE TABLE anchors_new (
        id TEXT PRIMARY KEY,
        anchor_type TEXT NOT NULL CHECK(anchor_type IN ('START', 'REPORTED', 'HELP', 'ADVERSE_ACTION', 'HARASSMENT', 'MILESTONE', 'END')),
        title TEXT NOT NULL,
        description TEXT,
        anchor_date DATE,
        date_confidence TEXT DEFAULT 'exact',
        what_happened TEXT,
        where_location TEXT,
        impact_summary TEXT,
        severity TEXT CHECK(severity IN ('minor', 'moderate', 'severe', 'egregious')),
        is_auto_generated BOOLEAN DEFAULT 1,
        user_edited BOOLEAN DEFAULT 0,
        source_context TEXT,
        sort_order INTEGER,
        is_expanded BOOLEAN DEFAULT 0,
        contains_multiple_events BOOLEAN DEFAULT 0,
        event_count INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        ${extraColDefs ? ', ' + extraColDefs : ''}
      );
      INSERT INTO anchors_new (${allCols}) SELECT ${allCols} FROM anchors;
      DROP TABLE anchors;
      ALTER TABLE anchors_new RENAME TO anchors;
      CREATE INDEX IF NOT EXISTS idx_anchors_date ON anchors(anchor_date);
      CREATE INDEX IF NOT EXISTS idx_anchors_type ON anchors(anchor_type);
    `);
    console.log('[DB] Anchors table migrated successfully (extra cols: ' + extraCols.join(', ') + ')');
  }

  // Add end_date and last_scanned_at to case_context if missing
  const ctxCols2 = caseDb.prepare("PRAGMA table_info(case_context)").all();
  const ctxColNames2 = ctxCols2.map(c => c.name);
  if (!ctxColNames2.includes('end_date')) {
    caseDb.exec("ALTER TABLE case_context ADD COLUMN end_date DATE");
  }
  if (!ctxColNames2.includes('last_scanned_at')) {
    caseDb.exec("ALTER TABLE case_context ADD COLUMN last_scanned_at DATETIME");
  }

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

/**
 * Get a setting from app_settings
 */
function getSetting(key) {
  if (!masterDb) return null;
  const row = masterDb.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

/**
 * Set a setting in app_settings
 */
function setSetting(key, value) {
  if (!masterDb) throw new Error('Master DB not initialized');
  masterDb.prepare(
    'INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)'
  ).run(key, value);
}

module.exports = {
  initMasterDb,
  createCase,
  openCase,
  listCases,
  vaultExists,
  getSalt,
  storeSalt,
  closeMasterDb,
  getSetting,
  setSetting
};
