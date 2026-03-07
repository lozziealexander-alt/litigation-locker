const { ipcMain, dialog } = require('electron');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const keyManager = require('./crypto/key-derivation');
const { burn, verifyBurn } = require('./crypto/kill-switch');
const db = require('./database/init');
const { processFiles } = require('./ingest/file-processor');
const { analyzeConnections, detectEscalationPattern } = require('./analysis/timeline-connections');
const { analyzeAllPrecedents, getDocumentPrecedentBadges } = require('./analysis/precedent-matcher');
const { classifyEvidence } = require('./ingest/evidence-classifier');
const { detectIncidents, computeSeverity } = require('./analysis/incident-detector');
const { detectActors, findPotentialDuplicates } = require('./analysis/actor-detector');
const {
  generateAnchorsFromContext,
  generateAnchorsFromIncidents,
  generateAnchorsFromDocuments,
  mergeAnchors,
  splitAnchorSegment,
  extractDate,
  extractActorsFromNarrative,
  ANCHOR_PATTERNS
} = require('./analysis/anchor-generator');

// Track currently open case
let currentCaseDb = null;
let currentCaseId = null;

/**
 * Compute Jaccard similarity between two text strings (word-level).
 * Returns a value between 0 and 1.
 */
function textSimilarity(textA, textB) {
  if (!textA || !textB) return 0;
  const wordsA = new Set(textA.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const wordsB = new Set(textB.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }
  const union = wordsA.size + wordsB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function registerIpcHandlers() {

  // ==================== VAULT ====================

  ipcMain.handle('vault:exists', async () => {
    return db.vaultExists();
  });

  ipcMain.handle('vault:setup', async (event, passphrase) => {
    try {
      const salt = keyManager.generateSalt();
      await keyManager.unlock(passphrase, salt);
      db.storeSalt(salt);
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
    closeCurrentCase();
    keyManager.lock();
    db.closeMasterDb();
    return { success: true };
  });

  ipcMain.handle('vault:isUnlocked', async () => {
    return keyManager.isUnlocked();
  });

  // ==================== BURN ====================

  ipcMain.handle('burn:execute', async (event, scope) => {
    closeCurrentCase();
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

  ipcMain.handle('cases:open', async (event, caseId) => {
    try {
      closeCurrentCase();
      currentCaseDb = db.openCase(caseId);
      currentCaseId = caseId;
      console.log('[IPC] cases:open success, caseId:', caseId, 'db:', !!currentCaseDb);
      return { success: true };
    } catch (error) {
      console.error('[IPC] cases:open error:', error.message);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('cases:current', async () => {
    return { caseId: currentCaseId };
  });

  // ==================== DOCUMENTS ====================

  ipcMain.handle('documents:ingest', async (event, filePaths) => {
    console.log('[IPC] documents:ingest called, paths:', filePaths);
    console.log('[IPC] currentCaseId:', currentCaseId, 'hasDb:', !!currentCaseDb);
    try {
      if (!currentCaseDb || !currentCaseId) {
        console.log('[IPC] documents:ingest - no case open');
        return { success: false, error: 'No case is open' };
      }

      const caseKey = keyManager.deriveCaseKey(currentCaseId);
      console.log('[IPC] caseKey derived, processing', filePaths.length, 'files...');
      const { documents, errors } = await processFiles(filePaths, caseKey);
      console.log('[IPC] processFiles done:', documents.length, 'docs,', errors.length, 'errors');
      if (errors.length > 0) {
        console.log('[IPC] ingest errors:', JSON.stringify(errors));
      }

      // Insert documents into case database
      // Ensure media_subtype and is_recap columns exist (migration)
      try { currentCaseDb.prepare('SELECT media_subtype FROM documents LIMIT 1').get(); }
      catch (e) { try { currentCaseDb.exec('ALTER TABLE documents ADD COLUMN media_subtype TEXT DEFAULT NULL'); } catch (e2) {} }
      try { currentCaseDb.prepare('SELECT is_recap FROM documents LIMIT 1').get(); }
      catch (e) { try { currentCaseDb.exec('ALTER TABLE documents ADD COLUMN is_recap BOOLEAN DEFAULT 0'); } catch (e2) {} }
      try { currentCaseDb.prepare('SELECT response_received FROM documents LIMIT 1').get(); }
      catch (e) { try { currentCaseDb.exec('ALTER TABLE documents ADD COLUMN response_received BOOLEAN DEFAULT NULL'); } catch (e2) {} }

      const insertStmt = currentCaseDb.prepare(`
        INSERT INTO documents (
          id, filename, original_path, file_type, file_size, sha256_hash,
          encrypted_content, metadata_json,
          file_created_at, file_modified_at,
          document_date, document_date_confidence, content_dates_json,
          extracted_text, ocr_text, evidence_type,
          evidence_confidence, evidence_secondary, evidence_scores_json,
          media_subtype, is_recap
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?,
          ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?
        )
      `);

      const inserted = [];
      const nearDuplicates = [];
      for (const doc of documents) {
        // Check for duplicate by hash
        const existing = currentCaseDb.prepare(
          'SELECT id FROM documents WHERE sha256_hash = ?'
        ).get(doc.sha256_hash);

        if (existing) {
          errors.push({ file: doc.filename, error: 'Duplicate file (already ingested)' });
          continue;
        }

        // Check for near-duplicate by text similarity
        const docText = [doc.extracted_text, doc.ocr_text].filter(Boolean).join(' ');
        if (docText && docText.length > 50) {
          const existingDocs = currentCaseDb.prepare(
            'SELECT id, filename, extracted_text, ocr_text FROM documents WHERE extracted_text IS NOT NULL OR ocr_text IS NOT NULL'
          ).all();

          let bestMatch = null;
          let bestSimilarity = 0;
          for (const existing of existingDocs) {
            const existingText = [existing.extracted_text, existing.ocr_text].filter(Boolean).join(' ');
            if (!existingText || existingText.length < 50) continue;
            const sim = textSimilarity(docText, existingText);
            if (sim > bestSimilarity) {
              bestSimilarity = sim;
              bestMatch = existing;
            }
          }

          if (bestSimilarity > 0.85 && bestMatch) {
            // Flag as near-duplicate but still insert — let user decide later
            nearDuplicates.push({
              newFile: doc.filename,
              newDocId: doc.id,
              existingFile: bestMatch.filename,
              existingDocId: bestMatch.id,
              similarity: Math.round(bestSimilarity * 100)
            });
          }
        }

        insertStmt.run(
          doc.id, doc.filename, doc.original_path, doc.file_type, doc.file_size, doc.sha256_hash,
          doc.encrypted_content, doc.metadata_json,
          doc.file_created_at, doc.file_modified_at,
          doc.document_date, doc.document_date_confidence, doc.content_dates_json,
          doc.extracted_text, doc.ocr_text, doc.evidence_type,
          doc.evidence_confidence, doc.evidence_secondary, doc.evidence_scores_json,
          doc.media_subtype || null, doc.is_recap || 0
        );
        // Verify the insert actually persisted
        const verify = currentCaseDb.prepare('SELECT count(*) as cnt FROM documents').get();
        console.log('[IPC] VERIFY after insert:', doc.filename, '-> total docs now:', verify.cnt);
        inserted.push(docToSummary(doc));
      }

      // Detect potential incidents from ingested documents
      const allDetectedIncidents = [];
      for (const doc of documents) {
        const allText = [doc.extracted_text, doc.ocr_text].filter(Boolean).join('\n');
        if (allText) {
          const detected = detectIncidents(allText, doc.document_date, doc.id);
          if (detected.length > 0) {
            allDetectedIncidents.push(...detected);
          }
        }
      }

      // Detect actors from ingested documents
      const allDetectedActors = [];
      for (const doc of documents) {
        const allText = [doc.extracted_text, doc.ocr_text].filter(Boolean).join('\n');
        if (allText) {
          const detected = detectActors(allText, doc.id);
          if (detected.length > 0) {
            allDetectedActors.push(...detected);
          }
        }
      }

      console.log('[IPC] inserted', inserted.length, 'documents,', allDetectedIncidents.length, 'potential incidents,', allDetectedActors.length, 'potential actors detected,', nearDuplicates.length, 'near-duplicates flagged');
      return { success: true, documents: inserted, errors, detectedIncidents: allDetectedIncidents, detectedActors: allDetectedActors, nearDuplicates };
    } catch (error) {
      console.error('[IPC] documents:ingest EXCEPTION:', error.message, error.stack);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('documents:list', async () => {
    try {
      if (!currentCaseDb) {
        return { success: false, error: 'No case is open' };
      }

      const docs = currentCaseDb.prepare(`
        SELECT id, filename, file_type, file_size, evidence_type,
               evidence_confidence, evidence_secondary,
               document_date, document_date_confidence,
               file_created_at, file_modified_at,
               ingested_at, metadata_json, content_dates_json
        FROM documents
        ORDER BY document_date ASC, ingested_at ASC
      `).all();

      return { success: true, documents: docs };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('documents:get', async (event, docId) => {
    try {
      if (!currentCaseDb) {
        return { success: false, error: 'No case is open' };
      }

      const doc = currentCaseDb.prepare(`
        SELECT id, filename, file_type, file_size, evidence_type,
               document_date, document_date_confidence,
               file_created_at, file_modified_at,
               metadata_json, content_dates_json,
               extracted_text, ocr_text, user_context,
               group_id, ingested_at, sha256_hash
        FROM documents WHERE id = ?
      `).get(docId);

      if (!doc) {
        return { success: false, error: 'Document not found' };
      }

      return { success: true, document: doc };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('documents:updateContext', async (event, docId, context) => {
    try {
      if (!currentCaseDb) {
        return { success: false, error: 'No case is open' };
      }

      currentCaseDb.prepare(`
        UPDATE documents SET user_context = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).run(context, docId);

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('documents:updateDate', async (event, docId, date, confidence) => {
    try {
      if (!currentCaseDb) {
        return { success: false, error: 'No case is open' };
      }

      currentCaseDb.prepare(`
        UPDATE documents SET document_date = ?, document_date_confidence = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).run(date, confidence, docId);

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('documents:rename', async (event, docId, newFilename) => {
    try {
      if (!currentCaseDb) {
        return { success: false, error: 'No case is open' };
      }

      currentCaseDb.prepare(`
        UPDATE documents SET filename = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).run(newFilename, docId);

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('documents:getContent', async (event, docId) => {
    try {
      if (!currentCaseDb || !currentCaseId) {
        return { success: false, error: 'No case is open' };
      }

      const row = currentCaseDb.prepare(
        'SELECT encrypted_content, file_type FROM documents WHERE id = ?'
      ).get(docId);

      if (!row) {
        return { success: false, error: 'Document not found' };
      }

      // Decrypt the file content
      const { decrypt } = require('./crypto/vault');
      const caseKey = keyManager.deriveCaseKey(currentCaseId);
      const decrypted = decrypt(row.encrypted_content, caseKey);

      // Return as base64 so it can cross the IPC bridge
      return {
        success: true,
        data: decrypted.toString('base64'),
        mimeType: row.file_type
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('documents:updateType', async (event, docId, evidenceType) => {
    try {
      if (!currentCaseDb) {
        return { success: false, error: 'No case is open' };
      }

      currentCaseDb.prepare(`
        UPDATE documents SET evidence_type = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).run(evidenceType, docId);

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // ==================== DELETE DOCUMENT ====================

  ipcMain.handle('documents:delete', async (event, docId) => {
    try {
      if (!currentCaseDb) {
        return { success: false, error: 'No case is open' };
      }

      // Clean up related records
      try { currentCaseDb.prepare('DELETE FROM document_date_entries WHERE document_id = ?').run(docId); } catch (e) {}
      try { currentCaseDb.prepare('DELETE FROM actor_appearances WHERE document_id = ?').run(docId); } catch (e) {}
      try { currentCaseDb.prepare('DELETE FROM anchor_evidence WHERE document_id = ?').run(docId); } catch (e) {}

      // Delete from documents table
      currentCaseDb.prepare('DELETE FROM documents WHERE id = ?').run(docId);

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // ==================== RECLASSIFY ====================

  ipcMain.handle('documents:reclassify', async () => {
    try {
      if (!currentCaseDb) {
        return { success: false, error: 'No case is open' };
      }

      const docs = currentCaseDb.prepare(`
        SELECT id, filename, file_type, extracted_text, ocr_text, metadata_json
        FROM documents
      `).all();

      const path = require('path');
      const updateStmt = currentCaseDb.prepare(`
        UPDATE documents
        SET evidence_type = ?, evidence_confidence = ?, evidence_secondary = ?,
            evidence_scores_json = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);

      let updated = 0;
      for (const doc of docs) {
        const allText = [doc.extracted_text, doc.ocr_text].filter(Boolean).join('\n');
        const ext = path.extname(doc.filename || '').toLowerCase();

        let meta = {};
        try { meta = JSON.parse(doc.metadata_json || '{}'); } catch {}

        const result = classifyEvidence({
          filename: doc.filename || '',
          ext,
          mimeType: doc.file_type || '',
          extractedText: allText,
          metadata: meta,
          contentDates: []
        });

        const confidence = result.confidence === 'high' ? 0.9 :
                           result.confidence === 'medium' ? 0.6 :
                           result.confidence === 'low' ? 0.3 : 0.1;

        updateStmt.run(
          result.primary,
          confidence,
          result.secondary,
          JSON.stringify(result.allScores),
          doc.id
        );
        updated++;
      }

      console.log(`[IPC] reclassify: updated ${updated} documents`);
      return { success: true, updated };
    } catch (error) {
      console.error('[IPC] reclassify error:', error.message);
      return { success: false, error: error.message };
    }
  });

  // Update recap status on a document
  ipcMain.handle('documents:updateRecapStatus', async (event, docId, isRecap, responseReceived) => {
    try {
      if (!currentCaseDb) {
        return { success: false, error: 'No case is open' };
      }
      // Ensure columns exist
      try { currentCaseDb.prepare('SELECT is_recap FROM documents LIMIT 1').get(); }
      catch (e) { try { currentCaseDb.exec('ALTER TABLE documents ADD COLUMN is_recap BOOLEAN DEFAULT 0'); } catch (e2) {} }
      try { currentCaseDb.prepare('SELECT response_received FROM documents LIMIT 1').get(); }
      catch (e) { try { currentCaseDb.exec('ALTER TABLE documents ADD COLUMN response_received BOOLEAN DEFAULT NULL'); } catch (e2) {} }

      currentCaseDb.prepare(`
        UPDATE documents SET is_recap = ?, response_received = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).run(isRecap ? 1 : 0, responseReceived != null ? (responseReceived ? 1 : 0) : null, docId);

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // ==================== FILE DIALOG ====================

  ipcMain.handle('dialog:openFiles', async () => {
    try {
      console.log('[IPC] dialog:openFiles called');
      const result = await dialog.showOpenDialog({
        properties: ['openFile', 'multiSelections'],
        filters: [
          { name: 'All Files', extensions: ['*'] },
          { name: 'Documents', extensions: ['pdf', 'doc', 'docx', 'txt', 'rtf', 'md'] },
          { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff', 'webp'] },
          { name: 'Emails', extensions: ['eml'] }
        ]
      });

      if (result.canceled) {
        console.log('[IPC] dialog:openFiles - canceled');
        return { canceled: true, filePaths: [] };
      }
      console.log('[IPC] dialog:openFiles - selected', result.filePaths.length, 'files:', result.filePaths);
      return { canceled: false, filePaths: result.filePaths };
    } catch (error) {
      console.error('[IPC] dialog:openFiles error:', error.message);
      return { canceled: true, filePaths: [], error: error.message };
    }
  });

  // ==================== TIMELINE ====================

  ipcMain.handle('timeline:get', async () => {
    try {
      if (!currentCaseDb) {
        console.log('[IPC] timeline:get - no case DB open');
        return { success: false, error: 'No case is open' };
      }

      const docs = currentCaseDb.prepare(`
        SELECT id, filename, file_type, file_size, evidence_type,
               evidence_confidence, evidence_secondary,
               document_date, document_date_confidence,
               content_dates_json, user_context,
               group_id, ingested_at
        FROM documents
        WHERE document_date IS NOT NULL
        ORDER BY document_date ASC
      `).all();

      // Also get undated documents
      const undated = currentCaseDb.prepare(`
        SELECT id, filename, file_type, file_size, evidence_type,
               evidence_confidence, evidence_secondary,
               document_date_confidence, user_context,
               group_id, ingested_at
        FROM documents
        WHERE document_date IS NULL
        ORDER BY ingested_at ASC
      `).all();

      // Get pinned date entries for multi-date timeline appearances
      const dateEntries = currentCaseDb.prepare(`
        SELECT de.id as entry_id, de.entry_date, de.label, de.date_confidence,
               d.id, d.filename, d.file_type, d.file_size,
               d.evidence_type, d.evidence_confidence, d.evidence_secondary,
               d.document_date_confidence, d.user_context, d.group_id, d.ingested_at
        FROM document_date_entries de
        JOIN documents d ON de.document_id = d.id
        ORDER BY de.entry_date ASC
      `).all();

      console.log('[IPC] timeline:get - dated:', docs.length, 'undated:', undated.length, 'dateEntries:', dateEntries.length);
      return { success: true, dated: docs, undated, dateEntries };
    } catch (error) {
      console.error('[IPC] timeline:get error:', error.message);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('timeline:getConnections', async () => {
    try {
      if (!currentCaseDb) {
        return { success: true, connections: [], escalation: null };
      }

      const documents = currentCaseDb.prepare(`
        SELECT id, filename, evidence_type, document_date, document_date_confidence
        FROM documents
        WHERE document_date IS NOT NULL
        ORDER BY document_date ASC
      `).all();

      // For now, we don't have incidents yet - that's a future session
      const incidents = [];

      const connections = analyzeConnections(documents, incidents);
      const escalation = detectEscalationPattern(documents, incidents);

      return { success: true, connections, escalation };
    } catch (error) {
      return { success: false, error: error.message, connections: [], escalation: null };
    }
  });

  // ==================== PRECEDENTS ====================

  ipcMain.handle('precedents:analyze', async (event, jurisdictionOverride) => {
    try {
      if (!currentCaseDb) {
        return { success: false, error: 'No case is open' };
      }

      // Get jurisdiction from case_context or use override
      let jurisdiction = jurisdictionOverride || 'both';
      if (!jurisdictionOverride) {
        const ctx = currentCaseDb.prepare(
          "SELECT jurisdiction FROM case_context WHERE id = 1"
        ).get();
        jurisdiction = ctx?.jurisdiction || 'both';
      }

      const documents = currentCaseDb.prepare(`
        SELECT id, filename, file_type, file_size, evidence_type,
               evidence_confidence, evidence_secondary,
               document_date, document_date_confidence,
               user_context
        FROM documents
        ORDER BY document_date ASC
      `).all();

      const incidents = currentCaseDb.prepare(`
        SELECT id, title, incident_date, incident_type, computed_severity
        FROM incidents
        ORDER BY incident_date ASC
      `).all();

      const actors = currentCaseDb.prepare(`
        SELECT id, name, role, classification, relationship_to_self,
               is_self, gender, disability_status
        FROM actors
      `).all();

      // Fetch actor-document links so precedent checks can be per-incident
      const actorAppearances = currentCaseDb.prepare(`
        SELECT actor_id, document_id FROM actor_appearances
      `).all();

      const analysis = analyzeAllPrecedents(documents, incidents, actors, jurisdiction, actorAppearances);

      return { success: true, analysis, jurisdiction };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('precedents:getDocumentBadges', async (event, documentId) => {
    try {
      if (!currentCaseDb) {
        return { success: false, error: 'No case is open' };
      }

      const documents = currentCaseDb.prepare(`
        SELECT id, filename, file_type, file_size, evidence_type,
               evidence_confidence, evidence_secondary,
               document_date, document_date_confidence
        FROM documents
        ORDER BY document_date ASC
      `).all();

      const document = documents.find(d => d.id === documentId);

      if (!document) {
        return { success: false, error: 'Document not found' };
      }

      const incidents = currentCaseDb.prepare(`
        SELECT id, title, incident_date, incident_type, computed_severity
        FROM incidents ORDER BY incident_date ASC
      `).all();

      const actors = currentCaseDb.prepare(`
        SELECT id, name, role, classification, relationship_to_self,
               is_self, gender, disability_status
        FROM actors
      `).all();

      const ctx = currentCaseDb.prepare(
        "SELECT jurisdiction FROM case_context WHERE id = 1"
      ).get();
      const jurisdiction = ctx?.jurisdiction || 'both';

      const analysis = analyzeAllPrecedents(documents, incidents, actors, jurisdiction);
      const badges = getDocumentPrecedentBadges(document, analysis);

      return { success: true, badges };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // ==================== DATE ENTRIES (multi-date timeline) ====================

  ipcMain.handle('documents:addDateEntry', async (event, docId, date, label, confidence) => {
    try {
      if (!currentCaseDb) {
        return { success: false, error: 'No case is open' };
      }

      const stmt = currentCaseDb.prepare(`
        INSERT INTO document_date_entries (document_id, entry_date, label, date_confidence)
        VALUES (?, ?, ?, ?)
      `);
      const result = stmt.run(docId, date, label || null, confidence || 'exact');

      return { success: true, id: result.lastInsertRowid };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('documents:removeDateEntry', async (event, entryId) => {
    try {
      if (!currentCaseDb) {
        return { success: false, error: 'No case is open' };
      }

      currentCaseDb.prepare('DELETE FROM document_date_entries WHERE id = ?').run(entryId);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('documents:getDateEntries', async (event, docId) => {
    try {
      if (!currentCaseDb) {
        return { success: false, error: 'No case is open' };
      }

      const entries = currentCaseDb.prepare(`
        SELECT id, document_id, entry_date, label, date_confidence, is_primary, created_at
        FROM document_date_entries
        WHERE document_id = ?
        ORDER BY entry_date ASC
      `).all(docId);

      return { success: true, entries };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // ==================== GROUPS (document linking) ====================

  ipcMain.handle('groups:create', async (event, name, description, color) => {
    try {
      if (!currentCaseDb) {
        return { success: false, error: 'No case is open' };
      }

      const crypto = require('crypto');
      const id = crypto.randomUUID();

      currentCaseDb.prepare(`
        INSERT INTO groups (id, name, description, color) VALUES (?, ?, ?, ?)
      `).run(id, name, description || null, color || null);

      return { success: true, group: { id, name, description, color } };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('groups:list', async () => {
    try {
      if (!currentCaseDb) {
        return { success: false, error: 'No case is open' };
      }

      const groups = currentCaseDb.prepare(`
        SELECT g.id, g.name, g.description, g.color, g.created_at,
               COUNT(d.id) as member_count
        FROM groups g
        LEFT JOIN documents d ON d.group_id = g.id
        GROUP BY g.id
        ORDER BY g.created_at DESC
      `).all();

      return { success: true, groups };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('groups:delete', async (event, groupId) => {
    try {
      if (!currentCaseDb) {
        return { success: false, error: 'No case is open' };
      }

      // Unlink all documents from this group
      currentCaseDb.prepare('UPDATE documents SET group_id = NULL WHERE group_id = ?').run(groupId);
      // Delete the group
      currentCaseDb.prepare('DELETE FROM groups WHERE id = ?').run(groupId);

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('groups:getMembers', async (event, groupId) => {
    try {
      if (!currentCaseDb) {
        return { success: false, error: 'No case is open' };
      }

      const members = currentCaseDb.prepare(`
        SELECT id, filename, file_type, file_size, evidence_type,
               document_date, document_date_confidence
        FROM documents
        WHERE group_id = ?
        ORDER BY document_date ASC, ingested_at ASC
      `).all(groupId);

      return { success: true, members };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('documents:setGroup', async (event, docId, groupId) => {
    try {
      if (!currentCaseDb) {
        return { success: false, error: 'No case is open' };
      }

      currentCaseDb.prepare(`
        UPDATE documents SET group_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).run(groupId, docId);

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('documents:removeGroup', async (event, docId) => {
    try {
      if (!currentCaseDb) {
        return { success: false, error: 'No case is open' };
      }

      currentCaseDb.prepare(`
        UPDATE documents SET group_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).run(docId);

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // ==================== INCIDENTS ====================

  ipcMain.handle('incidents:list', async () => {
    try {
      if (!currentCaseDb) {
        return { success: false, error: 'No case is open' };
      }

      const incidents = currentCaseDb.prepare(`
        SELECT * FROM incidents
        ORDER BY incident_date DESC, created_at DESC
      `).all();

      return { success: true, incidents };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('incidents:create', async (event, incidentData) => {
    try {
      if (!currentCaseDb) {
        return { success: false, error: 'No case is open' };
      }

      const id = uuidv4();

      // Read jurisdiction for severity computation
      const ctx = currentCaseDb.prepare(
        "SELECT jurisdiction FROM case_context WHERE id = 1"
      ).get();
      const jurisdiction = ctx?.jurisdiction || 'both';

      // Compute severity with factors
      const severityResult = computeSeverity(incidentData, incidentData.context || {}, jurisdiction);

      const stmt = currentCaseDb.prepare(`
        INSERT INTO incidents (
          id, title, description, incident_date, date_confidence,
          incident_type, base_severity, computed_severity, severity_factors_json,
          involves_retaliation, days_after_protected_activity
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        id,
        incidentData.title,
        incidentData.description || '',
        incidentData.date,
        incidentData.dateConfidence || 'exact',
        incidentData.type,
        incidentData.severity || incidentData.suggestedSeverity,
        severityResult.computedSeverity,
        JSON.stringify(severityResult.factors),
        incidentData.involvesRetaliation ? 1 : 0,
        incidentData.daysAfterProtectedActivity || null
      );

      // Link to source document if provided
      if (incidentData.sourceDocumentId) {
        const linkStmt = currentCaseDb.prepare(`
          INSERT INTO incident_documents (incident_id, document_id, relationship)
          VALUES (?, ?, 'source')
        `);
        linkStmt.run(id, incidentData.sourceDocumentId);
      }

      return {
        success: true,
        incident: {
          id,
          title: incidentData.title,
          description: incidentData.description || '',
          incident_date: incidentData.date,
          incident_type: incidentData.type,
          base_severity: incidentData.severity || incidentData.suggestedSeverity,
          computed_severity: severityResult.computedSeverity,
          severity_factors: severityResult.factors
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('incidents:update', async (event, incidentId, updates) => {
    try {
      if (!currentCaseDb) {
        return { success: false, error: 'No case is open' };
      }

      const fields = [];
      const values = [];

      if (updates.title !== undefined) {
        fields.push('title = ?');
        values.push(updates.title);
      }
      if (updates.description !== undefined) {
        fields.push('description = ?');
        values.push(updates.description);
      }
      if (updates.date !== undefined) {
        fields.push('incident_date = ?');
        values.push(updates.date);
      }
      if (updates.severity !== undefined) {
        fields.push('base_severity = ?');
        values.push(updates.severity);
      }
      if (updates.type !== undefined) {
        fields.push('incident_type = ?');
        values.push(updates.type);
      }

      fields.push("updated_at = datetime('now')");
      values.push(incidentId);

      const stmt = currentCaseDb.prepare(
        `UPDATE incidents SET ${fields.join(', ')} WHERE id = ?`
      );
      stmt.run(...values);

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('incidents:delete', async (event, incidentId) => {
    try {
      if (!currentCaseDb) {
        return { success: false, error: 'No case is open' };
      }

      // Delete links first
      currentCaseDb.prepare('DELETE FROM incident_documents WHERE incident_id = ?').run(incidentId);
      currentCaseDb.prepare('DELETE FROM incident_actors WHERE incident_id = ?').run(incidentId);

      // Delete incident
      currentCaseDb.prepare('DELETE FROM incidents WHERE id = ?').run(incidentId);

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // ==================== JURISDICTION ====================

  ipcMain.handle('jurisdiction:get', async () => {
    try {
      if (!currentCaseDb) {
        return { success: false, error: 'No case is open' };
      }
      const row = currentCaseDb.prepare(
        "SELECT jurisdiction FROM case_context WHERE id = 1"
      ).get();
      return { success: true, jurisdiction: row?.jurisdiction || 'both' };
    } catch (error) {
      return { success: true, jurisdiction: 'both' };
    }
  });

  ipcMain.handle('jurisdiction:set', async (event, jurisdiction) => {
    try {
      if (!currentCaseDb) {
        return { success: false, error: 'No case is open' };
      }
      if (!['federal', 'state', 'both'].includes(jurisdiction)) {
        return { success: false, error: 'Invalid jurisdiction value' };
      }
      const existing = currentCaseDb.prepare(
        "SELECT id FROM case_context WHERE id = 1"
      ).get();
      if (existing) {
        currentCaseDb.prepare(
          "UPDATE case_context SET jurisdiction = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1"
        ).run(jurisdiction);
      } else {
        currentCaseDb.prepare(
          "INSERT INTO case_context (id, jurisdiction) VALUES (1, ?)"
        ).run(jurisdiction);
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // ==================== ACTORS ====================

  ipcMain.handle('actors:list', async () => {
    try {
      if (!currentCaseDb) {
        return { success: false, error: 'No case is open' };
      }

      // Migration: add secondary_classifications if missing
      try { currentCaseDb.exec('ALTER TABLE actors ADD COLUMN secondary_classifications TEXT DEFAULT NULL'); } catch (e) {}

      const stmt = currentCaseDb.prepare(`
        SELECT a.*,
         (SELECT COUNT(*) FROM actor_appearances WHERE actor_id = a.id) as appearance_count
        FROM actors a
        ORDER BY
         CASE WHEN a.is_self = 1 THEN 0 ELSE 1 END,
         CASE a.classification
           WHEN 'bad_actor' THEN 1
           WHEN 'enabler' THEN 2
           ELSE 3
         END,
         a.name
      `);
      const actors = stmt.all();

      return { success: true, actors };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('actors:create', async (event, actorData) => {
    try {
      if (!currentCaseDb) {
        return { success: false, error: 'No case is open' };
      }

      const id = uuidv4();

      const stmt = currentCaseDb.prepare(`
        INSERT INTO actors (
          id, name, email, role, title, department,
          classification, secondary_classifications, would_they_help,
          relationship_to_self, reports_to, is_self,
          has_written_statement, statement_is_dated, statement_is_specific,
          still_employed, reports_to_bad_actor, risk_factors,
          gender, disability_status, start_date, end_date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        id,
        actorData.name,
        actorData.email || null,
        actorData.role || null,
        actorData.title || null,
        actorData.department || null,
        actorData.classification || 'unknown',
        actorData.secondaryClassifications ? JSON.stringify(actorData.secondaryClassifications) : null,
        actorData.wouldTheyHelp || 'unknown',
        actorData.relationship || null,
        actorData.reportsTo || null,
        actorData.isSelf ? 1 : 0,
        actorData.hasWrittenStatement ? 1 : 0,
        actorData.statementIsDated ? 1 : 0,
        actorData.statementIsSpecific ? 1 : 0,
        actorData.stillEmployed || 'unknown',
        actorData.reportsToBadActor ? 1 : 0,
        actorData.riskFactors || null,
        actorData.gender || null,
        actorData.disabilityStatus || null,
        actorData.startDate || null,
        actorData.endDate || null
      );

      // Link to source document if provided
      if (actorData.sourceDocumentId) {
        const linkStmt = currentCaseDb.prepare(`
          INSERT INTO actor_appearances (actor_id, document_id, role_in_document, auto_detected)
          VALUES (?, ?, ?, 1)
        `);
        linkStmt.run(id, actorData.sourceDocumentId, actorData.roleInDocument || null);
      }

      return { success: true, actor: { id, ...actorData } };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('actors:update', async (event, actorId, updates) => {
    try {
      if (!currentCaseDb) {
        return { success: false, error: 'No case is open' };
      }

      const fields = [];
      const values = [];

      const fieldMap = {
        name: 'name',
        email: 'email',
        role: 'role',
        title: 'title',
        department: 'department',
        classification: 'classification',
        wouldTheyHelp: 'would_they_help',
        relationship: 'relationship_to_self',
        reportsTo: 'reports_to',
        isSelf: 'is_self',
        hasWrittenStatement: 'has_written_statement',
        statementIsDated: 'statement_is_dated',
        statementIsSpecific: 'statement_is_specific',
        stillEmployed: 'still_employed',
        reportsToBadActor: 'reports_to_bad_actor',
        riskFactors: 'risk_factors',
        gender: 'gender',
        disabilityStatus: 'disability_status',
        startDate: 'start_date',
        endDate: 'end_date'
      };

      for (const [key, dbField] of Object.entries(fieldMap)) {
        if (updates[key] !== undefined) {
          fields.push(`${dbField} = ?`);
          values.push(typeof updates[key] === 'boolean' ? (updates[key] ? 1 : 0) : updates[key]);
        }
      }

      // Handle JSON-serialized secondary classifications
      if (updates.secondaryClassifications !== undefined) {
        fields.push('secondary_classifications = ?');
        values.push(Array.isArray(updates.secondaryClassifications) ? JSON.stringify(updates.secondaryClassifications) : updates.secondaryClassifications);
      }

      if (fields.length === 0) {
        return { success: true };
      }

      fields.push("updated_at = datetime('now')");
      values.push(actorId);

      const stmt = currentCaseDb.prepare(`UPDATE actors SET ${fields.join(', ')} WHERE id = ?`);
      stmt.run(...values);

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('actors:delete', async (event, actorId) => {
    try {
      if (!currentCaseDb) {
        return { success: false, error: 'No case is open' };
      }

      // Delete appearances first
      currentCaseDb.prepare('DELETE FROM actor_appearances WHERE actor_id = ?').run(actorId);
      currentCaseDb.prepare('DELETE FROM incident_actors WHERE actor_id = ?').run(actorId);

      // Delete actor
      currentCaseDb.prepare('DELETE FROM actors WHERE id = ?').run(actorId);

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('actors:merge', async (event, keepActorId, mergeActorId) => {
    try {
      if (!currentCaseDb) {
        return { success: false, error: 'No case is open' };
      }

      // Delete conflicting appearances where both actors appear in same document
      currentCaseDb.prepare(`
        DELETE FROM actor_appearances
        WHERE actor_id = ? AND document_id IN (
          SELECT document_id FROM actor_appearances WHERE actor_id = ?
        )
      `).run(mergeActorId, keepActorId);

      // Move remaining appearances to the kept actor
      currentCaseDb.prepare(`
        UPDATE actor_appearances SET actor_id = ? WHERE actor_id = ?
      `).run(keepActorId, mergeActorId);

      // Delete conflicting incident links where both actors are in same incident
      currentCaseDb.prepare(`
        DELETE FROM incident_actors
        WHERE actor_id = ? AND incident_id IN (
          SELECT incident_id FROM incident_actors WHERE actor_id = ?
        )
      `).run(mergeActorId, keepActorId);

      // Move remaining incident links
      currentCaseDb.prepare(`
        UPDATE incident_actors SET actor_id = ? WHERE actor_id = ?
      `).run(keepActorId, mergeActorId);

      // Delete conflicting anchor links where both actors are in same anchor
      currentCaseDb.prepare(`
        DELETE FROM anchor_actors
        WHERE actor_id = ? AND anchor_id IN (
          SELECT anchor_id FROM anchor_actors WHERE actor_id = ?
        )
      `).run(mergeActorId, keepActorId);

      // Move remaining anchor links
      currentCaseDb.prepare(`
        UPDATE anchor_actors SET actor_id = ? WHERE actor_id = ?
      `).run(keepActorId, mergeActorId);

      // Delete the merged actor
      currentCaseDb.prepare('DELETE FROM actors WHERE id = ?').run(mergeActorId);

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('actors:getAppearances', async (event, actorId) => {
    try {
      if (!currentCaseDb) {
        return { success: false, error: 'No case is open' };
      }

      const stmt = currentCaseDb.prepare(`
        SELECT d.id, d.filename, d.file_type, d.file_size, d.evidence_type,
               d.document_date, d.document_date_confidence,
               aa.role_in_document
        FROM documents d
        JOIN actor_appearances aa ON aa.document_id = d.id
        WHERE aa.actor_id = ?
        ORDER BY d.document_date DESC
      `);
      const appearances = stmt.all(actorId);

      return { success: true, appearances };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('actors:setSelf', async (event, actorId) => {
    try {
      if (!currentCaseDb) {
        return { success: false, error: 'No case is open' };
      }

      // Clear any existing self designation
      currentCaseDb.prepare('UPDATE actors SET is_self = 0 WHERE is_self = 1').run();

      // Set this actor as self
      currentCaseDb.prepare('UPDATE actors SET is_self = 1, classification = "self" WHERE id = ?').run(actorId);

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('actors:checkDuplicates', async () => {
    try {
      if (!currentCaseDb) {
        return { success: false, error: 'No case is open' };
      }

      const actors = currentCaseDb.prepare('SELECT * FROM actors').all();
      const duplicates = findPotentialDuplicates(actors);
      return { success: true, duplicates };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('actors:rescan', async () => {
    try {
      if (!currentCaseDb) {
        return { success: false, error: 'No case is open' };
      }

      // Get all documents with text
      const docs = currentCaseDb.prepare(`
        SELECT id, extracted_text, ocr_text FROM documents
      `).all();

      // Get existing actor names to filter duplicates
      const existingActors = currentCaseDb.prepare('SELECT name FROM actors').all();
      const existingNames = new Set(existingActors.map(a => a.name.toLowerCase()));

      const allDetected = [];
      for (const doc of docs) {
        const allText = [doc.extracted_text, doc.ocr_text].filter(Boolean).join('\n');
        if (allText) {
          const detected = detectActors(allText, doc.id);
          for (const actor of detected) {
            if (!existingNames.has(actor.name.toLowerCase())) {
              allDetected.push(actor);
              existingNames.add(actor.name.toLowerCase()); // prevent dupes across docs
            }
          }
        }
      }

      console.log('[IPC] actors:rescan found', allDetected.length, 'new actors across', docs.length, 'documents');
      return { success: true, detectedActors: allDetected };
    } catch (error) {
      console.error('[IPC] actors:rescan error:', error.message);
      return { success: false, error: error.message };
    }
  });

  // ==================== DOCUMENT ACTORS ====================

  ipcMain.handle('actors:getForDocument', async (event, documentId) => {
    try {
      if (!currentCaseDb) {
        return { success: false, error: 'No case is open' };
      }

      const stmt = currentCaseDb.prepare(`
        SELECT a.*, aa.role_in_document, aa.auto_detected
        FROM actors a
        JOIN actor_appearances aa ON aa.actor_id = a.id
        WHERE aa.document_id = ?
        ORDER BY a.name
      `);
      const actors = stmt.all(documentId);

      return { success: true, actors };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('actors:addToDocument', async (event, actorId, documentId, roleInDocument) => {
    try {
      if (!currentCaseDb) {
        return { success: false, error: 'No case is open' };
      }

      // Check if already linked
      const existing = currentCaseDb.prepare(
        'SELECT 1 FROM actor_appearances WHERE actor_id = ? AND document_id = ?'
      ).get(actorId, documentId);

      if (existing) {
        return { success: true, alreadyLinked: true };
      }

      currentCaseDb.prepare(`
        INSERT INTO actor_appearances (actor_id, document_id, role_in_document, auto_detected)
        VALUES (?, ?, ?, 0)
      `).run(actorId, documentId, roleInDocument || null);

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('actors:removeFromDocument', async (event, actorId, documentId) => {
    try {
      if (!currentCaseDb) {
        return { success: false, error: 'No case is open' };
      }

      currentCaseDb.prepare(
        'DELETE FROM actor_appearances WHERE actor_id = ? AND document_id = ?'
      ).run(actorId, documentId);

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // ==================== PAY RECORDS ====================

  ipcMain.handle('payRecords:list', async () => {
    try {
      if (!currentCaseDb) {
        return { success: false, error: 'No case is open' };
      }

      const records = currentCaseDb.prepare(`
        SELECT pr.*, d.filename as document_filename, d.file_type as document_file_type,
               a.name as actor_name
        FROM pay_records pr
        LEFT JOIN documents d ON pr.document_id = d.id
        LEFT JOIN actors a ON pr.actor_id = a.id
        ORDER BY pr.record_date DESC
      `).all();

      return { success: true, records };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('payRecords:create', async (event, data) => {
    try {
      if (!currentCaseDb) {
        return { success: false, error: 'No case is open' };
      }

      const id = uuidv4();

      currentCaseDb.prepare(`
        INSERT INTO pay_records (id, actor_id, record_date, period, base_salary, bonus, merit_increase_percent, equity_value, document_id, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        data.actorId || null,
        data.recordDate,
        data.period || null,
        data.baseSalary || null,
        data.bonus || null,
        data.meritIncreasePercent || null,
        data.equityValue || null,
        data.documentId || null,
        data.notes || null
      );

      return { success: true, record: { id, ...data } };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('payRecords:update', async (event, recordId, updates) => {
    try {
      if (!currentCaseDb) {
        return { success: false, error: 'No case is open' };
      }

      const fields = [];
      const values = [];

      const fieldMap = {
        actorId: 'actor_id',
        recordDate: 'record_date',
        period: 'period',
        baseSalary: 'base_salary',
        bonus: 'bonus',
        meritIncreasePercent: 'merit_increase_percent',
        equityValue: 'equity_value',
        documentId: 'document_id',
        notes: 'notes'
      };

      for (const [key, dbField] of Object.entries(fieldMap)) {
        if (updates[key] !== undefined) {
          fields.push(`${dbField} = ?`);
          values.push(updates[key]);
        }
      }

      if (fields.length === 0) return { success: true };

      values.push(recordId);
      currentCaseDb.prepare(`UPDATE pay_records SET ${fields.join(', ')} WHERE id = ?`).run(...values);

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('payRecords:delete', async (event, recordId) => {
    try {
      if (!currentCaseDb) {
        return { success: false, error: 'No case is open' };
      }

      currentCaseDb.prepare('DELETE FROM pay_records WHERE id = ?').run(recordId);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('payRecords:getForActor', async (event, actorId) => {
    try {
      if (!currentCaseDb) {
        return { success: false, error: 'No case is open' };
      }

      const records = currentCaseDb.prepare(`
        SELECT pr.*, d.filename as document_filename, d.file_type as document_file_type
        FROM pay_records pr
        LEFT JOIN documents d ON pr.document_id = d.id
        WHERE pr.actor_id = ?
        ORDER BY pr.record_date DESC
      `).all(actorId);

      return { success: true, records };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // ==================== DEBUG ====================

  ipcMain.handle('debug:testIngest', async () => {
    console.log('[DEBUG] testIngest called');
    console.log('[DEBUG] currentCaseId:', currentCaseId, 'hasDb:', !!currentCaseDb);
    try {
      if (!currentCaseDb || !currentCaseId) {
        return { success: false, error: 'No case is open' };
      }

      // Create a test file
      const testPath = '/tmp/litigation-locker-test-debug.txt';
      fs.writeFileSync(testPath, 'This is a test document created on January 15, 2024. Meeting notes about the project review.');

      const caseKey = keyManager.deriveCaseKey(currentCaseId);
      console.log('[DEBUG] caseKey derived OK');

      const { documents, errors } = await processFiles([testPath], caseKey);
      console.log('[DEBUG] processFiles result:', documents.length, 'docs,', errors.length, 'errors');

      if (errors.length > 0) {
        console.log('[DEBUG] errors:', JSON.stringify(errors));
        return { success: false, error: errors[0].error, errors };
      }

      if (documents.length === 0) {
        return { success: false, error: 'No documents processed' };
      }

      // Try inserting into DB
      const doc = documents[0];
      const existing = currentCaseDb.prepare(
        'SELECT id FROM documents WHERE sha256_hash = ?'
      ).get(doc.sha256_hash);

      if (existing) {
        // Delete the existing one first for the test
        currentCaseDb.prepare('DELETE FROM documents WHERE sha256_hash = ?').run(doc.sha256_hash);
      }

      const insertStmt = currentCaseDb.prepare(`
        INSERT INTO documents (
          id, filename, original_path, file_type, file_size, sha256_hash,
          encrypted_content, metadata_json,
          file_created_at, file_modified_at,
          document_date, document_date_confidence, content_dates_json,
          extracted_text, ocr_text, evidence_type,
          evidence_confidence, evidence_secondary, evidence_scores_json
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?,
          ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?
        )
      `);

      insertStmt.run(
        doc.id, doc.filename, doc.original_path, doc.file_type, doc.file_size, doc.sha256_hash,
        doc.encrypted_content, doc.metadata_json,
        doc.file_created_at, doc.file_modified_at,
        doc.document_date, doc.document_date_confidence, doc.content_dates_json,
        doc.extracted_text, doc.ocr_text, doc.evidence_type,
        doc.evidence_confidence, doc.evidence_secondary, doc.evidence_scores_json
      );

      console.log('[DEBUG] INSERT SUCCESS!');

      // Clean up test file
      fs.unlinkSync(testPath);

      return { success: true, document: docToSummary(doc) };
    } catch (error) {
      console.error('[DEBUG] testIngest EXCEPTION:', error.message, error.stack);
      return { success: false, error: error.message, stack: error.stack };
    }
  });

  // ==================== ANCHORS ====================

  ipcMain.handle('anchors:list', async (event, caseId) => {
    try {
      const caseDb = currentCaseDb;

      // Ensure tables exist
      caseDb.exec(`
        CREATE TABLE IF NOT EXISTS anchors (
          id TEXT PRIMARY KEY,
          anchor_type TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT,
          anchor_date DATE,
          date_confidence TEXT DEFAULT 'exact',
          what_happened TEXT,
          where_location TEXT,
          impact_summary TEXT,
          severity TEXT,
          is_auto_generated BOOLEAN DEFAULT 1,
          user_edited BOOLEAN DEFAULT 0,
          source_context TEXT,
          sort_order INTEGER,
          is_expanded BOOLEAN DEFAULT 0,
          contains_multiple_events BOOLEAN DEFAULT 0,
          event_count INTEGER DEFAULT 1,
          action_direction TEXT DEFAULT NULL,
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
      `);

      const stmt = caseDb.prepare(`
        SELECT * FROM anchors ORDER BY sort_order, anchor_date
      `);
      const anchors = stmt.all();

      // Get linked items for each anchor
      for (const anchor of anchors) {
        try {
          anchor.documents = caseDb.prepare(`
            SELECT d.*, ad.relevance
            FROM documents d
            JOIN anchor_documents ad ON ad.document_id = d.id
            WHERE ad.anchor_id = ?
          `).all(anchor.id);
        } catch (e) { anchor.documents = []; }

        try {
          anchor.incidents = caseDb.prepare(`
            SELECT i.*
            FROM incidents i
            JOIN anchor_incidents ai ON ai.incident_id = i.id
            WHERE ai.anchor_id = ?
          `).all(anchor.id);
        } catch (e) { anchor.incidents = []; }

        try {
          anchor.actors = caseDb.prepare(`
            SELECT a.*, aa.role_in_anchor
            FROM actors a
            JOIN anchor_actors aa ON aa.actor_id = a.id
            WHERE aa.anchor_id = ?
          `).all(anchor.id);
        } catch (e) { anchor.actors = []; }

        // Get linked precedents
        try {
          anchor.precedents = caseDb.prepare(`
            SELECT * FROM anchor_precedents WHERE anchor_id = ?
          `).all(anchor.id);
        } catch (e) { anchor.precedents = []; }
      }
      return { success: true, anchors };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('anchors:generate', async (event, caseId) => {
    try {
      const caseDb = currentCaseDb;

      // Ensure anchor tables exist
      caseDb.exec(`
        CREATE TABLE IF NOT EXISTS anchors (
          id TEXT PRIMARY KEY,
          anchor_type TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT,
          anchor_date DATE,
          date_confidence TEXT DEFAULT 'exact',
          what_happened TEXT,
          where_location TEXT,
          impact_summary TEXT,
          severity TEXT,
          is_auto_generated BOOLEAN DEFAULT 1,
          user_edited BOOLEAN DEFAULT 0,
          source_context TEXT,
          sort_order INTEGER,
          is_expanded BOOLEAN DEFAULT 0,
          contains_multiple_events BOOLEAN DEFAULT 0,
          event_count INTEGER DEFAULT 1,
          action_direction TEXT DEFAULT NULL,
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
      `);

      // Get existing data
      const documents = caseDb.prepare('SELECT * FROM documents').all();

      let incidents = [];
      try {
        incidents = caseDb.prepare('SELECT * FROM incidents').all();
      } catch (e) {}

      let context = null;
      try {
        context = caseDb.prepare('SELECT * FROM case_context WHERE id = 1').get();
      } catch (e) {}

      let userEditedAnchors = [];
      try {
        userEditedAnchors = caseDb.prepare('SELECT * FROM anchors WHERE user_edited = 1').all();
      } catch (e) {}

      // Generate anchors from each source
      const contextAnchors = context?.narrative
        ? generateAnchorsFromContext(context.narrative, userEditedAnchors)
        : [];
      const incidentAnchors = generateAnchorsFromIncidents(incidents);
      const documentAnchors = generateAnchorsFromDocuments(documents);

      // Merge all
      const allAnchors = mergeAnchors(contextAnchors, incidentAnchors, documentAnchors);

      // Add START anchor if hire_date exists
      if (context?.hire_date && !allAnchors.some(a => a.anchor_type === 'START')) {
        allAnchors.unshift({
          id: uuidv4(),
          anchor_type: 'START',
          title: 'Employment Started',
          anchor_date: context.hire_date,
          date_confidence: 'exact',
          is_auto_generated: true,
          sort_order: 0
        });
      }

      // Ensure anchor_precedents table exists
      try {
        caseDb.exec(`
          CREATE TABLE IF NOT EXISTS anchor_precedents (
            anchor_id TEXT NOT NULL REFERENCES anchors(id),
            precedent_id TEXT NOT NULL,
            relevance_note TEXT,
            linked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (anchor_id, precedent_id)
          );
        `);
      } catch (e) {}

      // Safety: only delete old auto-anchors if we actually generated new ones
      // This prevents wiping everything when narrative is empty or generator fails
      if (allAnchors.length > 0) {
        caseDb.prepare('DELETE FROM anchor_documents WHERE anchor_id IN (SELECT id FROM anchors WHERE user_edited = 0)').run();
        caseDb.prepare('DELETE FROM anchor_incidents WHERE anchor_id IN (SELECT id FROM anchors WHERE user_edited = 0)').run();
        caseDb.prepare('DELETE FROM anchor_actors WHERE anchor_id IN (SELECT id FROM anchors WHERE user_edited = 0)').run();
        try {
          caseDb.prepare('DELETE FROM anchor_precedents WHERE anchor_id IN (SELECT id FROM anchors WHERE user_edited = 0)').run();
        } catch (e) {}
        caseDb.prepare('DELETE FROM anchors WHERE user_edited = 0').run();
      } else {
        return { success: true, count: 0, actorsFound: 0, actors: [], skipped: true };
      }

      // Migrate: add action_direction column if missing
      try {
        caseDb.prepare('SELECT action_direction FROM anchors LIMIT 1').get();
      } catch (e) {
        try { caseDb.exec('ALTER TABLE anchors ADD COLUMN action_direction TEXT DEFAULT NULL'); } catch (e2) {}
      }

      const insertStmt = caseDb.prepare(`
        INSERT INTO anchors (
          id, anchor_type, title, description, anchor_date, date_confidence,
          what_happened, severity, is_auto_generated, user_edited, sort_order,
          contains_multiple_events, event_count, action_direction
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      // Detect actors from narrative for linking
      let detectedActors = [];
      if (context?.narrative) {
        try {
          detectedActors = extractActorsFromNarrative(context.narrative);
        } catch (e) {
          console.error('[IPC] Actor extraction during anchor gen:', e.message);
        }
      }

      // Insert or upsert detected actors into actors table
      const actorInsertStmt = caseDb.prepare(`
        INSERT OR IGNORE INTO actors (id, name, classification)
        VALUES (?, ?, ?)
      `);
      for (const actor of detectedActors) {
        try {
          const existingActor = caseDb.prepare('SELECT id FROM actors WHERE LOWER(name) = LOWER(?)').get(actor.name);
          if (!existingActor) {
            const actorId = uuidv4();
            actorInsertStmt.run(actorId, actor.name, actor.suggestedClassification || 'unknown');
            actor.dbId = actorId;
          } else {
            actor.dbId = existingActor.id;
          }
        } catch (e) {
          // Skip actor if insert fails (e.g. CHECK constraint)
        }
      }

      for (const anchor of allAnchors) {
        // Skip if user-edited version exists
        if (userEditedAnchors.some(u => u.id === anchor.id)) continue;

        // Detect action direction for ADVERSE_ACTION anchors
        let actionDirection = null;
        if (anchor.anchor_type === 'ADVERSE_ACTION') {
          const anchorText = ((anchor.what_happened || '') + ' ' + (anchor.description || '') + ' ' + (anchor.title || '')).toLowerCase();
          const towardOffenderPatterns = /eligible for rehire|given severance|let go|retired|discipline|consequence for|fired him|fired her|terminated him|terminated her|pip for him|pip for her|disciplined|reprimanded him|reprimanded her/;
          actionDirection = towardOffenderPatterns.test(anchorText) ? 'toward_offender' : 'toward_me';
        }

        insertStmt.run(
          anchor.id,
          anchor.anchor_type,
          anchor.title,
          anchor.description || null,
          anchor.anchor_date || null,
          anchor.date_confidence || 'unknown',
          anchor.what_happened || null,
          anchor.severity || null,
          anchor.is_auto_generated ? 1 : 0,
          0,
          anchor.sort_order,
          anchor.contains_multiple_events || 0,
          anchor.event_count || 1,
          actionDirection
        );

        // Link source document if exists
        if (anchor.source_document_id) {
          caseDb.prepare(`
            INSERT OR IGNORE INTO anchor_documents (anchor_id, document_id, relevance)
            VALUES (?, ?, 'source')
          `).run(anchor.id, anchor.source_document_id);
        }

        // Link source incident if exists
        if (anchor.source_incident_id) {
          caseDb.prepare(`
            INSERT OR IGNORE INTO anchor_incidents (anchor_id, incident_id)
            VALUES (?, ?)
          `).run(anchor.id, anchor.source_incident_id);
        }

        // Link detected actors to this anchor based on name mention in anchor text
        if (anchor.what_happened || anchor.description) {
          const anchorText = (anchor.what_happened || '') + ' ' + (anchor.description || '');
          for (const actor of detectedActors) {
            if (actor.dbId && actor.name && anchorText.toLowerCase().includes(actor.name.toLowerCase())) {
              try {
                caseDb.prepare(`
                  INSERT OR IGNORE INTO anchor_actors (anchor_id, actor_id, role_in_anchor)
                  VALUES (?, ?, ?)
                `).run(anchor.id, actor.dbId, actor.suggestedClassification || 'mentioned');
              } catch (e) {}
            }
          }
        }
      }

      // Step 3: Auto-link precedents based on anchor type
      try {
        const precedentMapping = {
          'REPORTED': ['faragher', 'joshua_filing'],
          'ADVERSE_ACTION': ['burlington_northern', 'harris', 'muldrow_some_harm'],
          'HELP': ['faragher'],
          'END': ['burlington_northern']
        };
        for (const anchor of allAnchors) {
          const relevantPrecedents = precedentMapping[anchor.anchor_type];
          if (relevantPrecedents) {
            for (const precId of relevantPrecedents) {
              try {
                caseDb.prepare(`
                  INSERT OR IGNORE INTO anchor_precedents (anchor_id, precedent_id, relevance_note, linked_at)
                  VALUES (?, ?, ?, datetime('now'))
                `).run(anchor.id, precId, 'Auto-linked based on anchor type');
              } catch (e) {}
            }
          }
        }
      } catch (e) {
        console.error('[IPC] Auto-link precedents error:', e.message);
      }

      // Update last scanned
      try {
        caseDb.prepare(`
          UPDATE case_context SET last_scanned_at = datetime('now') WHERE id = 1
        `).run();
      } catch (e) {}

      return {
        success: true,
        count: allAnchors.length,
        actorsFound: detectedActors.length,
        actors: detectedActors.map(a => ({ name: a.name, classification: a.suggestedClassification, id: a.dbId }))
      };
    } catch (error) {
      console.error('[IPC] anchors:generate error:', error.message);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('anchors:create', async (event, caseId, anchorData) => {
    try {
      // Future date validation
      if (anchorData.date) {
        const anchorDate = new Date(anchorData.date);
        const today = new Date();
        today.setHours(23, 59, 59, 999);
        if (anchorDate > today) {
          return { success: false, error: 'Date cannot be in the future' };
        }
      }

      const caseDb = currentCaseDb;
      const id = uuidv4();

      // Get max sort order
      const maxOrder = caseDb.prepare('SELECT MAX(sort_order) as max FROM anchors').get();
      const sortOrder = (maxOrder?.max || 0) + 1;

      caseDb.prepare(`
        INSERT INTO anchors (
          id, anchor_type, title, description, anchor_date, date_confidence,
          what_happened, where_location, impact_summary, severity,
          is_auto_generated, user_edited, sort_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?)
      `).run(
        id,
        anchorData.type,
        anchorData.title,
        anchorData.description || null,
        anchorData.date || null,
        anchorData.dateConfidence || 'exact',
        anchorData.whatHappened || null,
        anchorData.where || null,
        anchorData.impact || null,
        anchorData.severity || null,
        sortOrder
      );
      return { success: true, anchor: { id, ...anchorData } };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('anchors:update', async (event, caseId, anchorId, updates) => {
    try {
      // Future date validation
      if (updates.date) {
        const anchorDate = new Date(updates.date);
        const today = new Date();
        today.setHours(23, 59, 59, 999);
        if (anchorDate > today) {
          return { success: false, error: 'Date cannot be in the future' };
        }
      }

      const caseDb = currentCaseDb;

      const fields = [];
      const values = [];

      const fieldMap = {
        title: 'title',
        description: 'description',
        date: 'anchor_date',
        dateConfidence: 'date_confidence',
        type: 'anchor_type',
        whatHappened: 'what_happened',
        where: 'where_location',
        impact: 'impact_summary',
        severity: 'severity',
        sortOrder: 'sort_order',
        containsMultipleEvents: 'contains_multiple_events',
        eventCount: 'event_count',
        actionDirection: 'action_direction'
      };

      for (const [key, dbField] of Object.entries(fieldMap)) {
        if (updates[key] !== undefined) {
          fields.push(`${dbField} = ?`);
          values.push(updates[key]);
        }
      }

      // Mark as user edited
      fields.push('user_edited = 1');
      fields.push("updated_at = datetime('now')");
      values.push(anchorId);

      const stmt = caseDb.prepare(`UPDATE anchors SET ${fields.join(', ')} WHERE id = ?`);
      stmt.run(...values);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('anchors:delete', async (event, caseId, anchorId) => {
    try {
      const caseDb = currentCaseDb;

      // Delete links
      caseDb.prepare('DELETE FROM anchor_documents WHERE anchor_id = ?').run(anchorId);
      caseDb.prepare('DELETE FROM anchor_incidents WHERE anchor_id = ?').run(anchorId);
      caseDb.prepare('DELETE FROM anchor_actors WHERE anchor_id = ?').run(anchorId);
      try {
        caseDb.prepare('DELETE FROM anchor_precedents WHERE anchor_id = ?').run(anchorId);
      } catch (e) {}

      // Delete anchor
      caseDb.prepare('DELETE FROM anchors WHERE id = ?').run(anchorId);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('anchors:linkEvidence', async (event, caseId, anchorId, documentId) => {
    try {
      const caseDb = currentCaseDb;

      caseDb.prepare(`
        INSERT OR IGNORE INTO anchor_documents (anchor_id, document_id, relevance)
        VALUES (?, ?, 'supports')
      `).run(anchorId, documentId);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('anchors:getRelatedEvidence', async (event, caseId, anchorId) => {
    try {
      const caseDb = currentCaseDb;

      const anchor = caseDb.prepare('SELECT * FROM anchors WHERE id = ?').get(anchorId);
      if (!anchor) {
        return { success: false, error: 'Anchor not found' };
      }

      // Get linked documents
      let linkedDocs = [];
      try {
        linkedDocs = caseDb.prepare(`
          SELECT d.*, ad.relevance
          FROM documents d
          JOIN anchor_documents ad ON ad.document_id = d.id
          WHERE ad.anchor_id = ?
        `).all(anchorId);
      } catch (e) {}

      // Get linked incidents
      let linkedIncidents = [];
      try {
        linkedIncidents = caseDb.prepare(`
          SELECT i.*
          FROM incidents i
          JOIN anchor_incidents ai ON ai.incident_id = i.id
          WHERE ai.anchor_id = ?
        `).all(anchorId);
      } catch (e) {}

      // Get linked actors
      let linkedActors = [];
      try {
        linkedActors = caseDb.prepare(`
          SELECT a.*, aa.role_in_anchor
          FROM actors a
          JOIN anchor_actors aa ON aa.actor_id = a.id
          WHERE aa.anchor_id = ?
        `).all(anchorId);
      } catch (e) {}

      // Find nearby evidence (within 14 days if anchor has date)
      let nearbyDocs = [];
      if (anchor.anchor_date) {
        try {
          const allDocs = caseDb.prepare('SELECT * FROM documents').all();
          const anchorDate = new Date(anchor.anchor_date);

          nearbyDocs = allDocs.filter(d => {
            if (!d.document_date) return false;
            if (linkedDocs.some(ld => ld.id === d.id)) return false;

            const docDate = new Date(d.document_date);
            const daysDiff = Math.abs((docDate - anchorDate) / (1000 * 60 * 60 * 24));
            return daysDiff <= 14;
          }).slice(0, 10);
        } catch (e) {}
      }

      // Get linked precedents
      let linkedPrecedents = [];
      try {
        linkedPrecedents = caseDb.prepare(`
          SELECT * FROM anchor_precedents WHERE anchor_id = ?
        `).all(anchorId);
      } catch (e) {}

      return {
        success: true,
        anchor,
        linked: {
          documents: linkedDocs,
          incidents: linkedIncidents,
          actors: linkedActors,
          precedents: linkedPrecedents
        },
        nearby: {
          documents: nearbyDocs
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // ==================== ANCHOR EXTENDED OPERATIONS ====================

  ipcMain.handle('anchors:clone', async (event, caseId, anchorId) => {
    try {
      const caseDb = currentCaseDb;

      const original = caseDb.prepare('SELECT * FROM anchors WHERE id = ?').get(anchorId);
      if (!original) {
        return { success: false, error: 'Anchor not found' };
      }

      const newId = uuidv4();
      const maxOrder = caseDb.prepare('SELECT MAX(sort_order) as max FROM anchors').get();
      const newOrder = (maxOrder?.max || 0) + 1;

      caseDb.prepare(`
        INSERT INTO anchors (
          id, anchor_type, title, description, anchor_date, date_confidence,
          what_happened, where_location, impact_summary, severity,
          is_auto_generated, user_edited, source_context, sort_order,
          contains_multiple_events, event_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?, ?, ?)
      `).run(
        newId,
        original.anchor_type,
        original.title + ' (copy)',
        original.description,
        original.anchor_date,
        original.date_confidence,
        original.what_happened,
        original.where_location,
        original.impact_summary,
        original.severity,
        original.source_context,
        newOrder,
        original.contains_multiple_events || 0,
        original.event_count || 1
      );

      // Clone linked documents
      try {
        const docs = caseDb.prepare('SELECT * FROM anchor_documents WHERE anchor_id = ?').all(anchorId);
        for (const doc of docs) {
          caseDb.prepare('INSERT OR IGNORE INTO anchor_documents (anchor_id, document_id, relevance) VALUES (?, ?, ?)').run(newId, doc.document_id, doc.relevance);
        }
      } catch (e) {}

      // Clone linked incidents
      try {
        const incs = caseDb.prepare('SELECT * FROM anchor_incidents WHERE anchor_id = ?').all(anchorId);
        for (const inc of incs) {
          caseDb.prepare('INSERT OR IGNORE INTO anchor_incidents (anchor_id, incident_id) VALUES (?, ?)').run(newId, inc.incident_id);
        }
      } catch (e) {}

      // Clone linked actors
      try {
        const actors = caseDb.prepare('SELECT * FROM anchor_actors WHERE anchor_id = ?').all(anchorId);
        for (const actor of actors) {
          caseDb.prepare('INSERT OR IGNORE INTO anchor_actors (anchor_id, actor_id, role_in_anchor) VALUES (?, ?, ?)').run(newId, actor.actor_id, actor.role_in_anchor);
        }
      } catch (e) {}

      // Clone linked precedents
      try {
        const precs = caseDb.prepare('SELECT * FROM anchor_precedents WHERE anchor_id = ?').all(anchorId);
        for (const prec of precs) {
          caseDb.prepare('INSERT OR IGNORE INTO anchor_precedents (anchor_id, precedent_id, relevance_note) VALUES (?, ?, ?)').run(newId, prec.precedent_id, prec.relevance_note);
        }
      } catch (e) {}
      return { success: true, newId };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('anchors:reorder', async (event, caseId, orderedIds) => {
    try {
      const caseDb = currentCaseDb;

      const updateStmt = caseDb.prepare("UPDATE anchors SET sort_order = ?, updated_at = datetime('now') WHERE id = ?");
      const txn = caseDb.transaction(() => {
        for (let i = 0; i < orderedIds.length; i++) {
          updateStmt.run(i, orderedIds[i]);
        }
      });
      txn();
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('anchors:linkPrecedent', async (event, caseId, anchorId, precedentId, relevanceNote) => {
    try {
      const caseDb = currentCaseDb;

      // Ensure table exists
      try {
        caseDb.exec(`
          CREATE TABLE IF NOT EXISTS anchor_precedents (
            anchor_id TEXT NOT NULL REFERENCES anchors(id),
            precedent_id TEXT NOT NULL,
            relevance_note TEXT,
            linked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (anchor_id, precedent_id)
          );
        `);
      } catch (e) {}

      caseDb.prepare(`
        INSERT OR REPLACE INTO anchor_precedents (anchor_id, precedent_id, relevance_note, linked_at)
        VALUES (?, ?, ?, datetime('now'))
      `).run(anchorId, precedentId, relevanceNote || null);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('anchors:unlinkPrecedent', async (event, caseId, anchorId, precedentId) => {
    try {
      const caseDb = currentCaseDb;
      caseDb.prepare('DELETE FROM anchor_precedents WHERE anchor_id = ? AND precedent_id = ?').run(anchorId, precedentId);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('anchors:getPrecedents', async (event, caseId, anchorId) => {
    try {
      const caseDb = currentCaseDb;

      let precedents = [];
      try {
        precedents = caseDb.prepare('SELECT * FROM anchor_precedents WHERE anchor_id = ?').all(anchorId);
      } catch (e) {}
      return { success: true, precedents };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('anchors:breakApart', async (event, caseId, anchorId) => {
    try {
      const caseDb = currentCaseDb;

      const original = caseDb.prepare('SELECT * FROM anchors WHERE id = ?').get(anchorId);
      if (!original) {
        return { success: false, error: 'Anchor not found' };
      }

      const textToSplit = original.what_happened || original.description || '';
      const subSegments = splitAnchorSegment(textToSplit);

      if (subSegments.length <= 1) {
        return { success: false, error: 'Cannot break apart — only one event detected' };
      }

      const newAnchors = [];
      const baseOrder = original.sort_order || 0;

      for (let i = 0; i < subSegments.length; i++) {
        const segment = subSegments[i].trim();
        if (segment.length < 10) continue;

        const newId = uuidv4();
        const dateInfo = extractDate(segment);
        const title = segment.slice(0, 60).replace(/[,.]$/, '').trim();

        caseDb.prepare(`
          INSERT INTO anchors (
            id, anchor_type, title, description, anchor_date, date_confidence,
            what_happened, where_location, impact_summary, severity,
            is_auto_generated, user_edited, source_context, sort_order,
            contains_multiple_events, event_count
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?, 0, 1)
        `).run(
          newId,
          original.anchor_type,
          title,
          segment.slice(0, 500),
          dateInfo.date || original.anchor_date,
          dateInfo.confidence || original.date_confidence,
          segment,
          original.where_location,
          null,
          original.severity,
          segment.slice(0, 200),
          baseOrder + i + 1
        );

        newAnchors.push({ id: newId, title, segment });
      }

      // Delete the original anchor and its links
      caseDb.prepare('DELETE FROM anchor_documents WHERE anchor_id = ?').run(anchorId);
      caseDb.prepare('DELETE FROM anchor_incidents WHERE anchor_id = ?').run(anchorId);
      caseDb.prepare('DELETE FROM anchor_actors WHERE anchor_id = ?').run(anchorId);
      try { caseDb.prepare('DELETE FROM anchor_precedents WHERE anchor_id = ?').run(anchorId); } catch (e) {}
      caseDb.prepare('DELETE FROM anchors WHERE id = ?').run(anchorId);
      return { success: true, newAnchors };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('anchors:linkIncident', async (event, caseId, anchorId, incidentId) => {
    try {
      const caseDb = currentCaseDb;
      caseDb.prepare(`
        INSERT OR IGNORE INTO anchor_incidents (anchor_id, incident_id)
        VALUES (?, ?)
      `).run(anchorId, incidentId);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('anchors:unlinkEvidence', async (event, caseId, anchorId, documentId) => {
    try {
      const caseDb = currentCaseDb;
      caseDb.prepare('DELETE FROM anchor_documents WHERE anchor_id = ? AND document_id = ?').run(anchorId, documentId);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('anchors:unlinkIncident', async (event, caseId, anchorId, incidentId) => {
    try {
      const caseDb = currentCaseDb;
      caseDb.prepare('DELETE FROM anchor_incidents WHERE anchor_id = ? AND incident_id = ?').run(anchorId, incidentId);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('anchors:linkActor', async (event, caseId, anchorId, actorId, roleInAnchor) => {
    try {
      const caseDb = currentCaseDb;
      caseDb.prepare(`
        INSERT OR IGNORE INTO anchor_actors (anchor_id, actor_id, role_in_anchor)
        VALUES (?, ?, ?)
      `).run(anchorId, actorId, roleInAnchor || 'involved');
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('anchors:unlinkActor', async (event, caseId, anchorId, actorId) => {
    try {
      const caseDb = currentCaseDb;
      caseDb.prepare('DELETE FROM anchor_actors WHERE anchor_id = ? AND actor_id = ?').run(anchorId, actorId);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // ==================== CASE CONTEXT ====================

  ipcMain.handle('context:get', async (event, caseId) => {
    try {
      const caseDb = currentCaseDb;

      // Ensure table exists and has a row
      caseDb.exec(`
        CREATE TABLE IF NOT EXISTS case_context (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          narrative TEXT,
          voice_note_path TEXT,
          hire_date DATE,
          end_date DATE,
          protected_activities_json TEXT,
          case_type TEXT,
          jurisdiction TEXT DEFAULT 'both',
          last_scanned_at DATETIME,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        INSERT OR IGNORE INTO case_context (id) VALUES (1);
      `);

      const context = caseDb.prepare('SELECT * FROM case_context WHERE id = 1').get();
      return { success: true, context };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('context:update', async (event, caseId, updates) => {
    try {
      const caseDb = currentCaseDb;

      // Ensure table exists
      caseDb.exec(`
        CREATE TABLE IF NOT EXISTS case_context (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          narrative TEXT,
          voice_note_path TEXT,
          hire_date DATE,
          end_date DATE,
          protected_activities_json TEXT,
          case_type TEXT,
          jurisdiction TEXT DEFAULT 'both',
          last_scanned_at DATETIME,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        INSERT OR IGNORE INTO case_context (id) VALUES (1);
      `);

      const fields = [];
      const values = [];

      if (updates.narrative !== undefined) {
        fields.push('narrative = ?');
        values.push(updates.narrative);
      }
      if (updates.hireDate !== undefined) {
        fields.push('hire_date = ?');
        values.push(updates.hireDate);
      }
      if (updates.endDate !== undefined) {
        fields.push('end_date = ?');
        values.push(updates.endDate);
      }
      if (updates.caseType !== undefined) {
        fields.push('case_type = ?');
        values.push(updates.caseType);
      }

      fields.push("updated_at = datetime('now')");

      const stmt = caseDb.prepare(`UPDATE case_context SET ${fields.join(', ')} WHERE id = 1`);
      stmt.run(...values);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
}

function closeCurrentCase() {
  if (currentCaseDb) {
    currentCaseDb.close();
    currentCaseDb = null;
    currentCaseId = null;
  }
}

/**
 * Strip encrypted content from doc for sending to renderer
 */
function docToSummary(doc) {
  return {
    id: doc.id,
    filename: doc.filename,
    file_type: doc.file_type,
    file_size: doc.file_size,
    evidence_type: doc.evidence_type,
    evidence_confidence: doc.evidence_confidence,
    evidence_secondary: doc.evidence_secondary,
    document_date: doc.document_date,
    document_date_confidence: doc.document_date_confidence
  };
}

module.exports = { registerIpcHandlers };
