-- Master vault registry (stored in master.db)
-- This tracks which cases exist, not the case data itself

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

-- Per-case database schema (each case has its own DB file)
-- This schema is applied when creating a new case

-- Evidence documents
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  original_path TEXT,
  file_type TEXT,
  file_size INTEGER,
  sha256_hash TEXT NOT NULL,

  -- Encrypted content storage
  encrypted_content BLOB,

  -- Extracted metadata (stored as JSON)
  metadata_json TEXT,

  -- Multi-layer dates
  file_created_at DATETIME,
  file_modified_at DATETIME,
  document_date DATETIME,
  document_date_confidence TEXT CHECK(document_date_confidence IN ('exact', 'approximate', 'inferred', 'undated')),
  content_dates_json TEXT,

  -- Analysis results
  extracted_text TEXT,
  ocr_text TEXT,
  evidence_type TEXT,
  user_context TEXT,

  -- Organization
  group_id TEXT REFERENCES groups(id),

  -- Timestamps
  ingested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Groups (optional organization, like threads)
CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Actors (people mentioned in evidence)
CREATE TABLE IF NOT EXISTS actors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  role TEXT,
  title TEXT,
  department TEXT,

  -- Classification
  classification TEXT CHECK(classification IN (
    'bad_actor', 'enabler', 'witness_supportive', 'witness_neutral',
    'witness_hostile', 'bystander', 'corroborator', 'self'
  )),

  -- Witness assessment
  would_they_help TEXT CHECK(would_they_help IN ('likely_helpful', 'uncertain', 'likely_hostile', 'unknown')),
  has_written_statement BOOLEAN DEFAULT 0,
  statement_is_dated BOOLEAN DEFAULT 0,
  statement_is_specific BOOLEAN DEFAULT 0,
  still_employed TEXT CHECK(still_employed IN ('yes', 'no', 'unknown')),
  reports_to_bad_actor BOOLEAN DEFAULT 0,
  risk_factors TEXT,

  -- Relationship
  reports_to TEXT REFERENCES actors(id),
  relationship_to_self TEXT,

  -- Computed
  is_self BOOLEAN DEFAULT 0,

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Actor appearances in documents
CREATE TABLE IF NOT EXISTS actor_appearances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id TEXT NOT NULL REFERENCES actors(id),
  document_id TEXT NOT NULL REFERENCES documents(id),
  role_in_document TEXT,
  confidence REAL DEFAULT 1.0,
  auto_detected BOOLEAN DEFAULT 0,
  UNIQUE(actor_id, document_id)
);

-- Incidents (specific events)
CREATE TABLE IF NOT EXISTS incidents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  incident_date DATETIME,
  date_confidence TEXT CHECK(date_confidence IN ('exact', 'approximate', 'range', 'undated')),

  -- Type and severity
  incident_type TEXT,
  base_severity TEXT CHECK(base_severity IN ('minor', 'moderate', 'severe', 'egregious')),
  computed_severity TEXT CHECK(computed_severity IN ('minor', 'moderate', 'severe', 'egregious')),
  severity_factors_json TEXT,

  -- Flags
  involves_retaliation BOOLEAN DEFAULT 0,
  days_after_protected_activity INTEGER,

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Link incidents to documents
CREATE TABLE IF NOT EXISTS incident_documents (
  incident_id TEXT NOT NULL REFERENCES incidents(id),
  document_id TEXT NOT NULL REFERENCES documents(id),
  relationship TEXT DEFAULT 'supports',
  PRIMARY KEY (incident_id, document_id)
);

-- Link incidents to actors
CREATE TABLE IF NOT EXISTS incident_actors (
  incident_id TEXT NOT NULL REFERENCES incidents(id),
  actor_id TEXT NOT NULL REFERENCES actors(id),
  role TEXT CHECK(role IN ('perpetrator', 'target', 'witness', 'bystander')),
  PRIMARY KEY (incident_id, actor_id)
);

-- Claims (your claims and their claims)
CREATE TABLE IF NOT EXISTS claims (
  id TEXT PRIMARY KEY,
  claim_text TEXT NOT NULL,
  claim_type TEXT CHECK(claim_type IN ('your_claim', 'their_claim', 'counter_claim')),
  status TEXT DEFAULT 'active',
  strength TEXT CHECK(strength IN ('strong', 'moderate', 'weak', 'insufficient')),

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Link evidence to claims
CREATE TABLE IF NOT EXISTS claim_evidence (
  claim_id TEXT NOT NULL REFERENCES claims(id),
  document_id TEXT NOT NULL REFERENCES documents(id),
  relationship TEXT CHECK(relationship IN ('supports', 'contradicts', 'neutral')),
  PRIMARY KEY (claim_id, document_id)
);

-- Timeline connections (causality)
CREATE TABLE IF NOT EXISTS timeline_connections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK(source_type IN ('document', 'incident')),
  target_id TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK(target_type IN ('document', 'incident')),
  connection_type TEXT CHECK(connection_type IN (
    'retaliation_chain', 'escalation', 'temporal_cluster',
    'actor_continuity', 'causal', 'response_to'
  )),
  days_between INTEGER,
  description TEXT,
  auto_detected BOOLEAN DEFAULT 1
);

-- Pay records
CREATE TABLE IF NOT EXISTS pay_records (
  id TEXT PRIMARY KEY,
  record_date DATE NOT NULL,
  base_salary REAL,
  bonus REAL,
  merit_increase_percent REAL,
  equity_value REAL,
  document_id TEXT REFERENCES documents(id),
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Precedents (case law library)
CREATE TABLE IF NOT EXISTS precedents (
  id TEXT PRIMARY KEY,
  case_name TEXT NOT NULL,
  citation TEXT,
  year INTEGER,
  court TEXT,
  jurisdiction TEXT,
  legal_standard TEXT,
  elements_json TEXT,
  key_quotes TEXT,
  application_notes TEXT,
  is_builtin BOOLEAN DEFAULT 0
);

-- Case context (narrative)
CREATE TABLE IF NOT EXISTS case_context (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  narrative TEXT,
  voice_note_path TEXT,
  hire_date DATE,
  protected_activities_json TEXT,
  case_type TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_documents_date ON documents(document_date);
CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(evidence_type);
CREATE INDEX IF NOT EXISTS idx_incidents_date ON incidents(incident_date);
CREATE INDEX IF NOT EXISTS idx_actor_appearances_actor ON actor_appearances(actor_id);
CREATE INDEX IF NOT EXISTS idx_actor_appearances_doc ON actor_appearances(document_id);
CREATE INDEX IF NOT EXISTS idx_timeline_source ON timeline_connections(source_id, source_type);
CREATE INDEX IF NOT EXISTS idx_timeline_target ON timeline_connections(target_id, target_type);
