/**
 * Web Export — serialize case data to encrypted JSON for GitHub Pages viewer.
 *
 * Encryption uses AES-GCM with PBKDF2 key derivation, compatible with the
 * Web Crypto API so the browser-based viewer can decrypt client-side.
 *
 * Images are compressed with sharp for web preview (max 1600px, JPEG 75%).
 * Documents whose compressed content exceeds OVERFLOW_THRESHOLD are exported
 * as separate encrypted files in docs/content/ and loaded on demand.
 */
const crypto = require('crypto');
const db = require('./database/init');

// PBKDF2 + AES-GCM parameters (must match web-api.js decryption)
const PBKDF2_ITERATIONS = 100000;
const KEY_LENGTH = 32; // 256-bit
const IV_LENGTH = 12;  // 96-bit for AES-GCM
const SALT_LENGTH = 16;

// Documents larger than this (after compression) go into separate overflow files
const OVERFLOW_THRESHOLD = 5 * 1024 * 1024; // 5 MB

/**
 * Compress an image buffer for web preview using sharp.
 * Returns a smaller JPEG/PNG buffer suitable for inline display.
 */
async function compressImage(buffer, mimeType) {
  const sharp = require('sharp');
  try {
    let pipeline = sharp(buffer).rotate(); // auto-rotate based on EXIF
    if (mimeType === 'image/png') {
      // Keep PNG format but resize
      pipeline = pipeline.resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
        .png({ quality: 80, compressionLevel: 9 });
    } else {
      // Convert everything else to JPEG
      pipeline = pipeline.resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 75, mozjpeg: true });
    }
    return await pipeline.toBuffer();
  } catch (e) {
    console.warn('[WebExport] sharp compression failed, using original:', e.message);
    return buffer; // fallback to original
  }
}

/**
 * Export all data for the currently-open case database.
 * Returns { data, overflowDocs } where overflowDocs are large documents
 * that should be stored as separate encrypted files.
 */
async function exportCaseData(caseDb, caseId, caseName, caseKey = null) {
  const data = { caseId, caseName };
  const overflowDocs = []; // { id, content_b64, mimeType }

  // Lazy-require vault decrypt so a module-load failure can't crash the export
  let vaultDecrypt = null;
  if (caseKey) {
    try {
      vaultDecrypt = require('./crypto/vault').decrypt;
    } catch (e) {
      console.warn('[WebExport] Could not load vault decrypt, previews will be excluded:', e.message);
    }
  }

  const PREVIEWABLE = (mime) => mime && (mime.startsWith('image/') || mime === 'application/pdf');

  const allDocs = caseDb.prepare(`
    SELECT * FROM documents ORDER BY document_date
  `).all();

  data.documents = [];
  let inlineBytes = 0;

  for (const doc of allDocs) {
    const encContent = doc.encrypted_content;
    delete doc.encrypted_content;

    if (vaultDecrypt && caseKey && PREVIEWABLE(doc.file_type) && encContent) {
      try {
        if (Buffer.isBuffer(encContent) && encContent.length > 32) {
          const decrypted = vaultDecrypt(encContent, caseKey);

          // Compress images for web preview
          let previewBuf = decrypted;
          let previewMime = doc.file_type;
          if (doc.file_type.startsWith('image/')) {
            previewBuf = await compressImage(decrypted, doc.file_type);
            // Update mime if we converted to JPEG
            if (doc.file_type !== 'image/png') {
              previewMime = 'image/jpeg';
            }
            console.log(`[WebExport] ${doc.filename}: ${(encContent.length/1024).toFixed(0)}KB → ${(previewBuf.length/1024).toFixed(0)}KB`);
          }

          const contentB64 = previewBuf.toString('base64');

          if (previewBuf.length > OVERFLOW_THRESHOLD) {
            // Large document → separate overflow file
            overflowDocs.push({ id: doc.id, content_b64: contentB64, mimeType: previewMime });
            doc.content_url = `content/${doc.id}.enc`;
            console.log(`[WebExport] ${doc.filename}: overflow (${(previewBuf.length/1024/1024).toFixed(1)}MB) → ${doc.content_url}`);
          } else {
            // Small enough to inline
            doc.content_b64 = contentB64;
            if (previewMime !== doc.file_type) {
              doc.preview_mime = previewMime;
            }
            inlineBytes += previewBuf.length;
          }
        }
      } catch (e) {
        // Decryption failure — skip this doc; don't abort the whole export
        console.warn('[WebExport] Decrypt failed for doc', doc.id, ':', e.message);
      }
    }
    data.documents.push(doc);
  }

  console.log(`[WebExport] Inline content: ${(inlineBytes/1024/1024).toFixed(1)}MB, overflow files: ${overflowDocs.length}`);

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
    SELECT id, source_id, source_type, target_id, target_type,
           connection_type, strength, days_between, description, auto_detected
    FROM timeline_connections
  `).all();

  // Suggested connections
  try {
    data.suggestedConnections = caseDb.prepare(`
      SELECT id, source_id, source_type, target_id, target_type,
             connection_type, precedent_key, legal_element, strength,
             days_between, description, reasoning, status
      FROM suggested_connections
    `).all();
  } catch (e) {
    data.suggestedConnections = [];
  }

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
    SELECT id, damage_type, description, amount,
           start_date, end_date, is_ongoing, document_id
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
    data.contextDocs = [];
  }

  return { data, overflowDocs };
}

/**
 * Encrypt a JSON-serializable object with a password.
 * Returns Promise<{ encrypted (base64), salt (base64), iv (base64) }>
 * Uses async PBKDF2 so the main-process event loop is not blocked.
 */
async function encryptForWeb(data, password) {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);

  // Async PBKDF2 — yields the event loop during the 100k iterations
  const key = await new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256', (err, dk) => {
      if (err) reject(err); else resolve(dk);
    });
  });

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
 * Full export pipeline: extract data → compress images → encrypt → return bundle + overflow files.
 * Returns { bundle, overflowFiles: [{ id, encBundle }] }
 */
async function exportForWeb(caseDb, caseId, caseName, password, caseKey = null) {
  const { data, overflowDocs } = await exportCaseData(caseDb, caseId, caseName, caseKey);

  // Encrypt main bundle
  const bundle = await encryptForWeb(data, password);
  bundle.caseName = caseName;

  // Encrypt each overflow document separately (same password, independent salt/iv)
  const overflowFiles = [];
  for (const od of overflowDocs) {
    const encBundle = await encryptForWeb({ content_b64: od.content_b64, mimeType: od.mimeType }, password);
    overflowFiles.push({ id: od.id, encBundle });
    console.log(`[WebExport] Encrypted overflow: ${od.id} (${(JSON.stringify(encBundle).length/1024/1024).toFixed(1)}MB)`);
  }

  return { bundle, overflowFiles };
}

module.exports = { exportCaseData, encryptForWeb, exportForWeb };
