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

  // Add events tables (Session 7: hub-spoke narrative, Session 8: renamed anchors→events)
  const hasEvents = caseDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='events'").get();
  const hasAnchors = caseDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='anchors'").get();
  if (!hasEvents && !hasAnchors) {
    // Fresh DB — create spec-compliant events tables
    caseDb.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        case_id TEXT,
        date TEXT,
        title TEXT NOT NULL,
        description TEXT,
        event_type TEXT,
        what_happened TEXT,
        where_location TEXT,
        impact_summary TEXT,
        severity TEXT,
        event_weight TEXT DEFAULT 'significant',
        why_no_report TEXT,
        employer_notified BOOLEAN DEFAULT 0,
        notice_date DATE,
        notice_method TEXT,
        employer_response TEXT,
        response_date DATE,
        response_adequate BOOLEAN,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS event_tags (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        tag TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_event_tags_event ON event_tags(event_id);
      CREATE INDEX IF NOT EXISTS idx_event_tags_tag ON event_tags(tag);
      CREATE TABLE IF NOT EXISTS event_links (
        id TEXT PRIMARY KEY,
        source_event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        target_event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        link_type TEXT NOT NULL,
        confidence REAL DEFAULT 1.0,
        days_between INTEGER
      );
      CREATE TABLE IF NOT EXISTS event_documents (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        relevance TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_event_documents_event ON event_documents(event_id);
      CREATE INDEX IF NOT EXISTS idx_event_documents_doc ON event_documents(document_id);
      CREATE TABLE IF NOT EXISTS event_actors (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        actor_id TEXT NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
        role TEXT
      );
      CREATE TABLE IF NOT EXISTS event_precedents (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        precedent_id TEXT NOT NULL,
        relevance_note TEXT,
        linked_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_event_precedents_event ON event_precedents(event_id);
      CREATE TABLE IF NOT EXISTS incident_events (
        id TEXT PRIMARY KEY,
        incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
        event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        event_role TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);
      CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
    `);
  }

  // ---- Session 8: Rename anchors → events (for existing databases) ----
  if (hasAnchors && !hasEvents) {
    console.log('[DB] Session 8: Renaming anchors -> events');
    caseDb.exec('ALTER TABLE anchors RENAME TO events');
    const hasAnchorInc = caseDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='anchor_incidents'").get();
    if (hasAnchorInc) caseDb.exec('ALTER TABLE anchor_incidents RENAME TO event_incidents');
    const hasAnchorDoc = caseDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='anchor_documents'").get();
    if (hasAnchorDoc) caseDb.exec('ALTER TABLE anchor_documents RENAME TO event_documents');
    const hasAnchorAct = caseDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='anchor_actors'").get();
    if (hasAnchorAct) caseDb.exec('ALTER TABLE anchor_actors RENAME TO event_actors');
    const hasAnchorPrec = caseDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='anchor_precedents'").get();
    if (hasAnchorPrec) caseDb.exec('ALTER TABLE anchor_precedents RENAME TO event_precedents');
    console.log('[DB] Table renames complete');
  }

  // Ensure event_precedents exists (may not if DB predates Session 7b)
  const hasEventPrecedents = caseDb.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='event_precedents'"
  ).get();
  if (!hasEventPrecedents) {
    caseDb.exec(`
      CREATE TABLE IF NOT EXISTS event_precedents (
        anchor_id TEXT NOT NULL REFERENCES events(id),
        precedent_id TEXT NOT NULL,
        relevance_note TEXT,
        linked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (anchor_id, precedent_id)
      );
      CREATE INDEX IF NOT EXISTS idx_event_precedents_anchor ON event_precedents(anchor_id);
    `);
  }

  // Add multi-event tracking columns to events (if migrating from old schema)
  const eventCols = caseDb.prepare("PRAGMA table_info(events)").all();
  const eventColNames = eventCols.map(c => c.name);
  if (!eventColNames.includes('contains_multiple_events')) {
    caseDb.exec("ALTER TABLE events ADD COLUMN contains_multiple_events BOOLEAN DEFAULT 0");
  }
  if (!eventColNames.includes('event_count')) {
    caseDb.exec("ALTER TABLE events ADD COLUMN event_count INTEGER DEFAULT 1");
  }

  // Migrate events CHECK constraint to include HARASSMENT (pre-Session 12 DBs)
  // Skip if Session 8b already ran (anchor_type renamed to event_type, no CHECK constraint)
  const hasEventTagsEarly = caseDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='event_tags'").get();
  const checkSql = caseDb.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='events'"
  ).get();
  if (!hasEventTagsEarly && checkSql && checkSql.sql && !checkSql.sql.includes('HARASSMENT')) {
    console.log('[DB] Migrating events table to allow HARASSMENT type');
    caseDb.exec('DROP TABLE IF EXISTS events_new');
    const existingCols = caseDb.prepare("PRAGMA table_info(events)").all().map(c => c.name);
    const baseCols = [
      'id', 'anchor_type', 'title', 'description', 'anchor_date', 'date_confidence',
      'what_happened', 'where_location', 'impact_summary', 'severity',
      'is_auto_generated', 'user_edited', 'source_context', 'sort_order', 'is_expanded',
      'contains_multiple_events', 'event_count', 'created_at', 'updated_at'
    ];
    const extraCols = existingCols.filter(c => !baseCols.includes(c));
    const extraColDefs = extraCols.map(c => `${c} TEXT DEFAULT NULL`).join(',\n        ');
    const allCols = [...baseCols, ...extraCols].join(', ');

    caseDb.exec(`
      CREATE TABLE events_new (
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
      INSERT INTO events_new (${allCols}) SELECT ${allCols} FROM events;
      DROP TABLE events;
      ALTER TABLE events_new RENAME TO events;
      CREATE INDEX IF NOT EXISTS idx_events_date ON events(anchor_date);
      CREATE INDEX IF NOT EXISTS idx_events_type ON events(anchor_type);
    `);
    console.log('[DB] Events table migrated successfully');
  }

  // Session 8: Add new columns to events table
  const evtCols8 = caseDb.prepare("PRAGMA table_info(events)").all();
  const evtColNames8 = evtCols8.map(c => c.name);
  if (!evtColNames8.includes('event_weight')) {
    caseDb.exec("ALTER TABLE events ADD COLUMN event_weight TEXT DEFAULT 'significant'");
  }
  if (!evtColNames8.includes('why_no_report')) {
    caseDb.exec("ALTER TABLE events ADD COLUMN why_no_report TEXT");
  }
  if (!evtColNames8.includes('employer_notified')) {
    caseDb.exec("ALTER TABLE events ADD COLUMN employer_notified BOOLEAN DEFAULT 0");
  }
  if (!evtColNames8.includes('notice_date')) {
    caseDb.exec("ALTER TABLE events ADD COLUMN notice_date DATE");
  }
  if (!evtColNames8.includes('notice_method')) {
    caseDb.exec("ALTER TABLE events ADD COLUMN notice_method TEXT");
  }
  if (!evtColNames8.includes('employer_response')) {
    caseDb.exec("ALTER TABLE events ADD COLUMN employer_response TEXT");
  }
  if (!evtColNames8.includes('response_date')) {
    caseDb.exec("ALTER TABLE events ADD COLUMN response_date DATE");
  }
  if (!evtColNames8.includes('response_adequate')) {
    caseDb.exec("ALTER TABLE events ADD COLUMN response_adequate BOOLEAN");
  }
  if (!evtColNames8.includes('employer_response_type')) {
    caseDb.exec("ALTER TABLE events ADD COLUMN employer_response_type TEXT");
  }

  // Session 8: Add new columns to event_documents
  const edCols = caseDb.prepare("PRAGMA table_info(event_documents)").all();
  const edColNames = edCols.map(c => c.name);
  if (!edColNames.includes('relevance_v2')) {
    caseDb.exec("ALTER TABLE event_documents ADD COLUMN relevance_v2 TEXT DEFAULT 'context'");
  }
  if (!edColNames.includes('timing_relation')) {
    caseDb.exec("ALTER TABLE event_documents ADD COLUMN timing_relation TEXT");
  }
  // Migrate existing relevance data
  caseDb.exec("UPDATE event_documents SET relevance_v2 = 'supports_me' WHERE relevance = 'supports' AND (relevance_v2 IS NULL OR relevance_v2 = 'context')");

  // Add weight column to event_documents for case strength scoring
  if (!edColNames.includes('weight')) {
    caseDb.exec("ALTER TABLE event_documents ADD COLUMN weight INTEGER DEFAULT 3");
  }

  // Session 8: Create document_regions table
  const hasRegions = caseDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='document_regions'").get();
  if (!hasRegions) {
    caseDb.exec(`
      CREATE TABLE IF NOT EXISTS document_regions (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        region_label TEXT,
        region_bounds_json TEXT,
        extracted_text TEXT,
        region_date DATETIME,
        date_confidence TEXT CHECK(date_confidence IN ('exact', 'approximate', 'inferred')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_regions_doc ON document_regions(document_id);
      CREATE INDEX IF NOT EXISTS idx_regions_date ON document_regions(region_date);
    `);
  }

  // Session 8: Create document_merges table
  const hasMerges = caseDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='document_merges'").get();
  if (!hasMerges) {
    caseDb.exec(`
      CREATE TABLE IF NOT EXISTS document_merges (
        id TEXT PRIMARY KEY,
        merged_doc_id TEXT NOT NULL REFERENCES documents(id),
        source_doc_id TEXT NOT NULL REFERENCES documents(id),
        page_order INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_merges_merged ON document_merges(merged_doc_id);
      CREATE INDEX IF NOT EXISTS idx_merges_source ON document_merges(source_doc_id);
    `);
  }

  // Session 8: Create damages table
  const hasDamages = caseDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='damages'").get();
  if (!hasDamages) {
    caseDb.exec(`
      CREATE TABLE IF NOT EXISTS damages (
        id TEXT PRIMARY KEY,
        damage_type TEXT NOT NULL CHECK(damage_type IN (
          'lost_wages', 'lost_benefits', 'lost_bonus',
          'emotional_distress', 'medical_expenses', 'therapy',
          'job_search_costs', 'relocation', 'other'
        )),
        amount REAL,
        start_date DATE,
        end_date DATE,
        is_ongoing BOOLEAN DEFAULT 0,
        description TEXT,
        document_id TEXT REFERENCES documents(id),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
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

  // ==================== SESSION 8b: Events Foundation Migration ====================
  // Rebuilds events + junction tables to spec schema: event_tags, event_links, incident_events
  // Renames anchor_id → event_id, anchor_date → date, anchor_type → event_type
  // Drops confusing columns, creates multi-tag + causality tables
  const hasEventTags = caseDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='event_tags'").get();
  if (!hasEventTags) {
    console.log('[DB] Session 8b: Migrating events to foundation spec...');
    // Disable FK checks — DROP TABLE events fails otherwise because event_documents etc. reference it
    caseDb.pragma('foreign_keys = OFF');
    const crypto = require('crypto');
    const genId = () => crypto.randomBytes(16).toString('hex');

    // 2a: Rebuild events table — drop confusing columns, rename anchor_* → spec names
    caseDb.exec('DROP TABLE IF EXISTS events_v2');
    const evtColInfo = caseDb.prepare("PRAGMA table_info(events)").all().map(c => c.name);
    caseDb.exec(`
      CREATE TABLE events_v2 (
        id TEXT PRIMARY KEY,
        case_id TEXT,
        date TEXT,
        title TEXT NOT NULL,
        description TEXT,
        event_type TEXT,
        what_happened TEXT,
        where_location TEXT,
        impact_summary TEXT,
        severity TEXT,
        event_weight TEXT DEFAULT 'significant',
        why_no_report TEXT,
        employer_notified BOOLEAN DEFAULT 0,
        notice_date DATE,
        notice_method TEXT,
        employer_response TEXT,
        response_date DATE,
        response_adequate BOOLEAN,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Copy data: anchor_date → date, anchor_type → event_type
    const oldEvents = caseDb.prepare('SELECT * FROM events').all();
    const insertEvt = caseDb.prepare(`
      INSERT INTO events_v2 (id, case_id, date, title, description, event_type,
        what_happened, where_location, impact_summary, severity, event_weight,
        why_no_report, employer_notified, notice_date, notice_method,
        employer_response, response_date, response_adequate, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const e of oldEvents) {
      insertEvt.run(
        e.id, null, e.anchor_date || e.date, e.title, e.description, e.anchor_type || e.event_type,
        e.what_happened || null, e.where_location || null, e.impact_summary || null,
        e.severity || null, e.event_weight || 'significant',
        e.why_no_report || null, e.employer_notified || 0, e.notice_date || null,
        e.notice_method || null, e.employer_response || null, e.response_date || null,
        e.response_adequate || null, e.created_at, e.updated_at || e.created_at
      );
    }
    caseDb.exec('DROP TABLE events');
    caseDb.exec('ALTER TABLE events_v2 RENAME TO events');
    caseDb.exec('CREATE INDEX IF NOT EXISTS idx_events_date ON events(date)');
    caseDb.exec('CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type)');
    console.log(`[DB] Migrated ${oldEvents.length} events`);

    // 2b: Rebuild event_documents — anchor_id → event_id, add id PK
    caseDb.exec('DROP TABLE IF EXISTS event_documents_v2');
    caseDb.exec(`
      CREATE TABLE event_documents_v2 (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        relevance TEXT
      )
    `);
    try {
      const oldEdocs = caseDb.prepare('SELECT * FROM event_documents').all();
      const insertEdoc = caseDb.prepare('INSERT INTO event_documents_v2 (id, event_id, document_id, relevance) VALUES (?, ?, ?, ?)');
      for (const ed of oldEdocs) {
        const evtId = ed.anchor_id || ed.event_id;
        if (evtId) insertEdoc.run(genId(), evtId, ed.document_id, ed.relevance || 'supports');
      }
      console.log(`[DB] Migrated ${oldEdocs.length} event_documents`);
    } catch (e) { console.log('[DB] No event_documents to migrate:', e.message); }
    caseDb.exec('DROP TABLE IF EXISTS event_documents');
    caseDb.exec('ALTER TABLE event_documents_v2 RENAME TO event_documents');
    caseDb.exec('CREATE INDEX IF NOT EXISTS idx_event_documents_event ON event_documents(event_id)');
    caseDb.exec('CREATE INDEX IF NOT EXISTS idx_event_documents_doc ON event_documents(document_id)');

    // 2b: Rebuild event_actors — anchor_id → event_id, role_in_anchor → role
    caseDb.exec('DROP TABLE IF EXISTS event_actors_v2');
    caseDb.exec(`
      CREATE TABLE event_actors_v2 (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        actor_id TEXT NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
        role TEXT
      )
    `);
    try {
      const oldEactors = caseDb.prepare('SELECT * FROM event_actors').all();
      const insertEactor = caseDb.prepare('INSERT INTO event_actors_v2 (id, event_id, actor_id, role) VALUES (?, ?, ?, ?)');
      for (const ea of oldEactors) {
        const evtId = ea.anchor_id || ea.event_id;
        const role = ea.role_in_anchor || ea.role || null;
        if (evtId) insertEactor.run(genId(), evtId, ea.actor_id, role);
      }
      console.log(`[DB] Migrated ${oldEactors.length} event_actors`);
    } catch (e) { console.log('[DB] No event_actors to migrate:', e.message); }
    caseDb.exec('DROP TABLE IF EXISTS event_actors');
    caseDb.exec('ALTER TABLE event_actors_v2 RENAME TO event_actors');

    // 2b: Rebuild event_precedents — anchor_id → event_id
    caseDb.exec('DROP TABLE IF EXISTS event_precedents_v2');
    caseDb.exec(`
      CREATE TABLE event_precedents_v2 (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        precedent_id TEXT NOT NULL,
        relevance_note TEXT,
        linked_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    try {
      const oldEprec = caseDb.prepare('SELECT * FROM event_precedents').all();
      const insertEprec = caseDb.prepare('INSERT INTO event_precedents_v2 (id, event_id, precedent_id, relevance_note, linked_at) VALUES (?, ?, ?, ?, ?)');
      for (const ep of oldEprec) {
        const evtId = ep.anchor_id || ep.event_id;
        if (evtId) insertEprec.run(genId(), evtId, ep.precedent_id, ep.relevance_note || null, ep.linked_at);
      }
      console.log(`[DB] Migrated ${oldEprec.length} event_precedents`);
    } catch (e) { console.log('[DB] No event_precedents to migrate:', e.message); }
    caseDb.exec('DROP TABLE IF EXISTS event_precedents');
    caseDb.exec('ALTER TABLE event_precedents_v2 RENAME TO event_precedents');
    caseDb.exec('CREATE INDEX IF NOT EXISTS idx_event_precedents_event ON event_precedents(event_id)');

    // 2c: Create new spec tables
    caseDb.exec(`
      CREATE TABLE event_tags (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        tag TEXT NOT NULL
      );
      CREATE INDEX idx_event_tags_event ON event_tags(event_id);
      CREATE INDEX idx_event_tags_tag ON event_tags(tag);

      CREATE TABLE event_links (
        id TEXT PRIMARY KEY,
        source_event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        target_event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        link_type TEXT NOT NULL,
        confidence REAL DEFAULT 1.0,
        days_between INTEGER
      );

      CREATE TABLE incident_events (
        id TEXT PRIMARY KEY,
        incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
        event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        event_role TEXT
      )
    `);

    // 2d: Migrate anchor_type → event_tags
    const typeToTags = {
      'HARASSMENT': ['harassment'],
      'ADVERSE_ACTION': ['adverse_action'],
      'REPORTED': ['protected_activity'],
      'HELP': ['help_request'],
      'START': ['employment_start'],
      'END': ['employment_end'],
      'MILESTONE': []
    };
    const insertTag = caseDb.prepare('INSERT INTO event_tags (id, event_id, tag) VALUES (?, ?, ?)');
    for (const evt of oldEvents) {
      const evtType = evt.anchor_type || evt.event_type;
      const tags = typeToTags[evtType] || [];
      for (const tag of tags) {
        insertTag.run(genId(), evt.id, tag);
      }
    }
    console.log('[DB] Migrated anchor_type → event_tags');

    // 2d: Migrate event_incidents → incident_events
    try {
      const oldEI = caseDb.prepare('SELECT * FROM event_incidents').all();
      const insertIE = caseDb.prepare('INSERT INTO incident_events (id, incident_id, event_id, event_role) VALUES (?, ?, ?, ?)');
      for (const ei of oldEI) {
        const evtId = ei.anchor_id || ei.event_id;
        if (evtId && ei.incident_id) insertIE.run(genId(), ei.incident_id, evtId, 'primary');
      }
      console.log(`[DB] Migrated ${oldEI.length} event_incidents → incident_events`);
    } catch (e) { console.log('[DB] No event_incidents to migrate:', e.message); }

    // Re-enable FK checks
    caseDb.pragma('foreign_keys = ON');
    console.log('[DB] Session 8b migration complete');
  }

  // ── Session 8b cleanup: normalize event_type to lowercase + fill missing tags ──
  const uppercaseCount = caseDb.prepare(
    "SELECT COUNT(*) as cnt FROM events WHERE event_type IS NOT NULL AND event_type <> LOWER(event_type)"
  ).get().cnt;
  if (uppercaseCount > 0) {
    console.log(`[DB] Session 8b cleanup: normalizing ${uppercaseCount} uppercase event_type values...`);
    const crypto = require('crypto');
    const genId = () => crypto.randomBytes(16).toString('hex');

    // Lowercase all event_type values
    caseDb.prepare("UPDATE events SET event_type = LOWER(event_type) WHERE event_type IS NOT NULL").run();

    // Fill missing event_tags for events that have event_type but no tags
    const typeToTag = {
      'harassment': 'harassment',
      'adverse_action': 'adverse_action',
      'reported': 'protected_activity',
      'help': 'help_request',
      'start': 'employment_start',
      'end': 'employment_end'
      // 'milestone' → no tag (plain event)
    };

    const eventsNeedingTags = caseDb.prepare(`
      SELECT e.id, e.event_type FROM events e
      WHERE e.event_type IS NOT NULL AND e.event_type <> ''
        AND NOT EXISTS (SELECT 1 FROM event_tags et WHERE et.event_id = e.id)
    `).all();

    const insertTag = caseDb.prepare('INSERT INTO event_tags (id, event_id, tag) VALUES (?, ?, ?)');
    let tagsFilled = 0;
    for (const evt of eventsNeedingTags) {
      const tag = typeToTag[evt.event_type];
      if (tag) {
        insertTag.run(genId(), evt.id, tag);
        tagsFilled++;
      }
    }
    console.log(`[DB] Session 8b cleanup: filled ${tagsFilled} missing tags, ${eventsNeedingTags.length - tagsFilled} milestone events (no tag needed)`);
  }

  // Session 8c: Convert 'milestone' event_type to 'reported' (milestone was removed as a concept)
  {
    const milestoneEvents = caseDb.prepare(
      "SELECT id FROM events WHERE event_type = 'milestone'"
    ).all();
    if (milestoneEvents.length > 0) {
      caseDb.prepare("UPDATE events SET event_type = 'reported' WHERE event_type = 'milestone'").run();
      console.log(`[DB] Session 8c: converted ${milestoneEvents.length} milestone events to reported`);
    }
  }

  // SESSION-9 A2: Schema for full CRUD (date_confidence, comparators, context_events, audit_log)
  const evtCols9 = caseDb.prepare("PRAGMA table_info(events)").all().map(c => c.name);
  if (!evtCols9.includes('date_confidence')) {
    caseDb.exec("ALTER TABLE events ADD COLUMN date_confidence TEXT DEFAULT 'exact'");
  }
  if (!evtCols9.includes('is_context_event')) {
    caseDb.exec("ALTER TABLE events ADD COLUMN is_context_event INTEGER DEFAULT 0");
  }
  if (!evtCols9.includes('edit_history')) {
    caseDb.exec("ALTER TABLE events ADD COLUMN edit_history TEXT DEFAULT '[]'");
  }
  // SESSION-9C: context_scope for context events
  const evtCols9c = caseDb.prepare("PRAGMA table_info(events)").all().map(c => c.name);
  if (!evtCols9c.includes('context_scope')) {
    caseDb.exec("ALTER TABLE events ADD COLUMN context_scope TEXT");
  }

  // SESSION-9C: Enhance comparators table with full fields
  if (!caseDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='comparators'").get()) {
    caseDb.exec(`CREATE TABLE IF NOT EXISTS comparators (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT,
      gender TEXT,
      race TEXT,
      outcome TEXT,
      outcome_date TEXT,
      circumstances TEXT,
      evidence_similarity TEXT,
      relevance_score REAL DEFAULT 0.5,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
  } else {
    const compCols = caseDb.prepare("PRAGMA table_info(comparators)").all().map(c => c.name);
    if (!compCols.includes('gender')) caseDb.exec("ALTER TABLE comparators ADD COLUMN gender TEXT");
    if (!compCols.includes('race')) caseDb.exec("ALTER TABLE comparators ADD COLUMN race TEXT");
    if (!compCols.includes('outcome_date')) caseDb.exec("ALTER TABLE comparators ADD COLUMN outcome_date TEXT");
    if (!compCols.includes('evidence_similarity')) caseDb.exec("ALTER TABLE comparators ADD COLUMN evidence_similarity TEXT");
    if (!compCols.includes('relevance_score')) caseDb.exec("ALTER TABLE comparators ADD COLUMN relevance_score REAL DEFAULT 0.5");
    if (!compCols.includes('notes')) caseDb.exec("ALTER TABLE comparators ADD COLUMN notes TEXT");
    if (!compCols.includes('updated_at')) caseDb.exec("ALTER TABLE comparators ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP");
  }

  if (!caseDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='context_events'").get()) {
    caseDb.exec(`CREATE TABLE IF NOT EXISTS context_events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      date_start DATE,
      date_end DATE,
      scope TEXT,
      impact_on_case TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
  }

  if (!caseDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='audit_log'").get()) {
    caseDb.exec(`CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action TEXT,
      changes_json TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
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

function renameCase(caseId, newName) {
  masterDb.prepare('UPDATE cases SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newName, caseId);
  return { id: caseId, name: newName };
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
  renameCase,
  openCase,
  listCases,
  vaultExists,
  getSalt,
  storeSalt,
  closeMasterDb,
  getSetting,
  setSetting
};
