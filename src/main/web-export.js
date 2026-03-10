/**
 * Web Export — serialize case data to encrypted JSON for GitHub Pages viewer.
 *
 * Encryption uses AES-GCM with PBKDF2 key derivation, compatible with the
 * Web Crypto API so the browser-based viewer can decrypt client-side.
 */
const crypto = require('crypto');
const db = require('./database/init');

// PBKDF2 + AES-GCM parameters (must match web-api.js decryption)
const PBKDF2_ITERATIONS = 100000;
const KEY_LENGTH = 32; // 256-bit
const IV_LENGTH = 12;  // 96-bit for AES-GCM
const SALT_LENGTH = 16;

/**
 * Export all data for the currently-open case database.
 * Returns a plain JS object matching the shapes expected by the renderer.
 */
function exportCaseData(caseDb, caseId, caseName) {
  const data = { caseId, caseName };

  // Documents (exclude encrypted_content blob — too large for web)
  // Use SELECT * and strip encrypted_content to handle migration columns safely
  data.documents = caseDb.prepare(`
    SELECT * FROM documents ORDER BY document_date
  `).all().map(doc => {
    delete doc.encrypted_content;
    return doc;
  });

  // Actors
  data.actors = caseDb.prepare(`
    SELECT id, name, email, role, title, department, classification,
           secondary_classifications, would_they_help, relationship_to_self,
           reports_to, gender, disability_status, start_date, end_date,
           aliases, in_reporting_chain, is_self
    FROM actors ORDER BY name
  `).all();

  // Actor appearances (document-actor links)
  data.actorAppearances = caseDb.prepare(`
    SELECT actor_id, document_id, role_in_document, confidence
    FROM actor_appearances
  `).all();

  // Events
  data.events = caseDb.prepare(`
    SELECT id, case_id, date, title, description, event_type,
           what_happened, where_location, impact_summary, severity,
           event_weight, why_no_report, employer_notified, notice_date,
           notice_method, employer_response, response_date, response_adequate
    FROM events ORDER BY date
  `).all();

  // Event tags
  data.eventTags = caseDb.prepare(`
    SELECT event_id, tag FROM event_tags
  `).all();

  // Event-document links
  data.eventDocuments = caseDb.prepare(`
    SELECT event_id, document_id, relevance FROM event_documents
  `).all();

  // Event-actor links
  data.eventActors = caseDb.prepare(`
    SELECT event_id, actor_id, role FROM event_actors
  `).all();

  // Event-precedent links
  data.eventPrecedents = caseDb.prepare(`
    SELECT event_id, precedent_id, relevance_note FROM event_precedents
  `).all();

  // Event causality links
  data.eventLinks = caseDb.prepare(`
    SELECT id, source_event_id, target_event_id, link_type, confidence, days_between
    FROM event_links
  `).all();

  // Incidents
  data.incidents = caseDb.prepare(`
    SELECT id, title, description, incident_date as date,
           incident_type, base_severity, computed_severity
    FROM incidents ORDER BY incident_date
  `).all();

  // Incident-document links
  data.incidentDocuments = caseDb.prepare(`
    SELECT incident_id, document_id, relationship FROM incident_documents
  `).all();

  // Incident-event links
  data.incidentEvents = caseDb.prepare(`
    SELECT incident_id, event_id, event_role FROM incident_events
  `).all();

  // Timeline connections
  data.timelineConnections = caseDb.prepare(`
    SELECT source_id, source_type, target_id, target_type,
           connection_type, strength, days_between, description
    FROM timeline_connections
  `).all();

  // Case context
  data.context = caseDb.prepare(`
    SELECT narrative, hire_date, end_date, case_type, jurisdiction
    FROM case_context WHERE id = 1
  `).get() || {};

  // Precedents
  data.precedents = caseDb.prepare(`
    SELECT id, case_name, citation, year, court, jurisdiction,
           legal_standard, elements_json, key_quotes, application_notes
    FROM precedents
  `).all();

  // Pay records
  data.payRecords = caseDb.prepare(`
    SELECT id, actor_id, record_date, period, base_salary, bonus,
           merit_increase_percent, equity_value, notes
    FROM pay_records ORDER BY record_date
  `).all();

  // Damages
  data.damages = caseDb.prepare(`
    SELECT id, category, description, amount, currency,
           date_from, date_to, is_ongoing, notes
    FROM damages
  `).all();

  // Groups
  data.groups = caseDb.prepare(`
    SELECT id, name, description, color FROM groups
  `).all();

  // Notifications
  data.notifications = caseDb.prepare(`
    SELECT target_type, target_id, actor_id FROM notifications
  `).all();

  // Lawyer briefs (most recent non-stale)
  data.brief = caseDb.prepare(`
    SELECT content_json, strength_score, generated_at
    FROM lawyer_briefs WHERE is_stale = 0
    ORDER BY generated_at DESC LIMIT 1
  `).get() || null;

  // Context documents (policy library)
  try {
    data.contextDocs = caseDb.prepare(`
      SELECT doc_id, filename, doc_type, display_name, date_uploaded,
             date_effective, is_active, notes, full_text, signals_json
      FROM context_documents
    `).all();
  } catch (e) {
    // Table may not exist in older databases
    data.contextDocs = [];
  }

  return data;
}

/**
 * Encrypt a JSON-serializable object with a password.
 * Returns { encrypted (base64), salt (base64), iv (base64) }
 */
function encryptForWeb(data, password) {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);

  // Derive key using PBKDF2 (same as Web Crypto will use to decrypt)
  const key = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const json = JSON.stringify(data);
  const encrypted = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    encrypted: Buffer.concat([encrypted, authTag]).toString('base64'),
    salt: salt.toString('base64'),
    iv: iv.toString('base64')
  };
}

/**
 * Full export pipeline: extract data → encrypt → return bundle.
 */
function exportForWeb(caseDb, caseId, caseName, password) {
  const data = exportCaseData(caseDb, caseId, caseName);
  const bundle = encryptForWeb(data, password);
  bundle.caseName = caseName;
  return bundle;
}

module.exports = { exportCaseData, encryptForWeb, exportForWeb };
