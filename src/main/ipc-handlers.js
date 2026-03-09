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
const { detectIncidents, computeSeverity, suggestActorsForIncident } = require('./analysis/incident-detector');
const { detectActors, findPotentialDuplicates } = require('./analysis/actor-detector');
const { categorize, buildChain, categorizeAndBuildChain } = require('./analysis/categorizer');
const { ActorRegistry, resolveHarasserForEntry, RELATIONSHIP_TYPES, IN_CHAIN_RELATIONSHIPS } = require('./analysis/actor-registry');
const {
  generateEventsFromContext,
  generateEventsFromIncidents,
  generateEventsFromDocuments,
  mergeEvents,
  splitEventSegment,
  extractDate,
  extractActorsFromNarrative,
  EVENT_PATTERNS
} = require('./analysis/anchor-generator');
const contextStore = require('./analysis/context-store');
const { DocumentAssessor, DOCUMENT_INPUT_TYPES } = require('./analysis/assessor');
const { suggestTags, getTagVocabulary } = require('./analysis/event-tagger');
const { detectCausality, suggestIncidents } = require('./analysis/causality-engine');

// Track currently open case
let currentCaseDb = null;
let currentCaseId = null;
let actorRegistry = null;

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
  console.log('[IPC] Registering handlers...');

  // ==================== VAULT ====================

  ipcMain.handle('vault:exists', async () => {
    const exists = db.vaultExists();
    console.log('[IPC] vault:exists =>', exists);
    return exists;
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
        console.error('[IPC] vault:unlock — no salt found');
        return { success: false, error: 'Vault not set up' };
      }
      await keyManager.unlock(passphrase, salt);
      const masterDb = db.initMasterDb(keyManager.getMasterKey());
      console.log('[IPC] vault:unlock => success, masterDb:', !!masterDb);
      return { success: true };
    } catch (error) {
      console.error('[IPC] vault:unlock ERROR:', error.message);
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
      const cases = db.listCases();
      console.log('[IPC] cases:list =>', cases.length, 'cases', cases.map(c => c.name));
      return { success: true, cases };
    } catch (error) {
      console.error('[IPC] cases:list ERROR:', error.message);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('cases:rename', async (event, caseId, newName) => {
    try {
      const result = db.renameCase(caseId, newName);
      return { success: true, case: result };
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

      // Initialize actor registry from the case database
      try {
        actorRegistry = ActorRegistry.fromDb(currentCaseDb);
        console.log('[IPC] Actor registry loaded:', actorRegistry.actors.size, 'actors');
      } catch (e) {
        console.error('[IPC] Actor registry init error:', e.message);
        actorRegistry = null;
      }

      console.log('[IPC] cases:open success, caseId:', caseId, 'db:', !!currentCaseDb);
      event.sender.send('case-changed', { caseId });
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
          // Suggest actor roles for each detected incident
          if (detected.length > 0 && actorRegistry && actorRegistry.actors.size > 0) {
            for (const incident of detected) {
              const textForActors = incident.suggestedDescription || incident.matchedText || '';
              incident.suggestedActors = suggestActorsForIncident(textForActors, actorRegistry);
            }
          }
          if (detected.length > 0) {
            allDetectedIncidents.push(...detected);
          }
        }
      }

      // Detect actors from ingested documents
      const allDetectedActors = [];
      const autoLinkedActors = [];
      for (const doc of documents) {
        const allText = [doc.extracted_text, doc.ocr_text].filter(Boolean).join('\n');
        if (allText) {
          const detected = detectActors(allText, doc.id);
          if (detected.length > 0) {
            allDetectedActors.push(...detected);
          }

          // Auto-link known actors from registry to this document
          if (actorRegistry && actorRegistry.actors.size > 0) {
            const linked = actorRegistry.autoLinkActorsToDocument(doc.id, allText);
            if (linked.length > 0) {
              autoLinkedActors.push(...linked);
            }
          }
        }
      }

      // Refresh registry after new actors may have been added
      if (actorRegistry) {
        try { actorRegistry.loadAll(); } catch (e) { /* ignore */ }
      }

      console.log('[IPC] inserted', inserted.length, 'documents,', allDetectedIncidents.length, 'potential incidents,', allDetectedActors.length, 'potential actors detected,', autoLinkedActors.length, 'known actors auto-linked,', nearDuplicates.length, 'near-duplicates flagged');
      return { success: true, documents: inserted, errors, detectedIncidents: allDetectedIncidents, detectedActors: allDetectedActors, autoLinkedActors, nearDuplicates };
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

      // Clean up all related records referencing this document
      try { currentCaseDb.prepare('DELETE FROM document_date_entries WHERE document_id = ?').run(docId); } catch (e) {}
      try { currentCaseDb.prepare('DELETE FROM actor_appearances WHERE document_id = ?').run(docId); } catch (e) {}
      try { currentCaseDb.prepare('DELETE FROM anchor_evidence WHERE document_id = ?').run(docId); } catch (e) {}
      try { currentCaseDb.prepare('DELETE FROM event_documents WHERE document_id = ?').run(docId); } catch (e) {}
      try { currentCaseDb.prepare('DELETE FROM incident_documents WHERE document_id = ?').run(docId); } catch (e) {}
      try { currentCaseDb.prepare('DELETE FROM claim_evidence WHERE document_id = ?').run(docId); } catch (e) {}
      try { currentCaseDb.prepare('DELETE FROM pay_records WHERE document_id = ?').run(docId); } catch (e) {}
      try { currentCaseDb.prepare('DELETE FROM timeline_connections WHERE (source_id = ? AND source_type = "document") OR (target_id = ? AND target_type = "document")').run(docId, docId); } catch (e) {}

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

  // Update recap status on a document (legacy, kept for compat)
  ipcMain.handle('documents:updateRecapStatus', async (event, docId, isRecap, responseReceived) => {
    try {
      if (!currentCaseDb) {
        return { success: false, error: 'No case is open' };
      }
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

  // Update document subtype classification (replaces recap toggle)
  ipcMain.handle('documents:updateDocumentSubtype', async (event, docId, subtype) => {
    try {
      if (!currentCaseDb) {
        return { success: false, error: 'No case is open' };
      }
      try { currentCaseDb.prepare('SELECT document_subtype FROM documents LIMIT 1').get(); }
      catch (e) { try { currentCaseDb.exec('ALTER TABLE documents ADD COLUMN document_subtype TEXT DEFAULT NULL'); } catch (e2) {} }
      try { currentCaseDb.prepare('SELECT is_recap FROM documents LIMIT 1').get(); }
      catch (e) { try { currentCaseDb.exec('ALTER TABLE documents ADD COLUMN is_recap BOOLEAN DEFAULT 0'); } catch (e2) {} }

      const isRecap = subtype ? 1 : 0;
      currentCaseDb.prepare(`
        UPDATE documents SET document_subtype = ?, is_recap = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).run(subtype || null, isRecap, docId);

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

      // Fetch direct incident-actor links for precise role checks
      const incidentActors = currentCaseDb.prepare(`
        SELECT incident_id, actor_id, role FROM incident_actors
      `).all();

      // Attach event-link weights and relevance to documents for case strength scoring
      try {
        const docWeights = currentCaseDb.prepare(
          'SELECT document_id, relevance, weight FROM event_documents'
        ).all();
        const weightMap = {};
        for (const dw of docWeights) {
          if (!weightMap[dw.document_id] || (dw.weight || 3) > (weightMap[dw.document_id].weight || 3)) {
            weightMap[dw.document_id] = { relevance: dw.relevance, weight: dw.weight || 3 };
          }
        }
        for (const doc of documents) {
          const w = weightMap[doc.id];
          if (w) {
            doc.link_relevance = w.relevance;
            doc.link_weight = w.weight;
          }
        }
      } catch (e) { /* weight column may not exist yet */ }

      const analysis = analyzeAllPrecedents(documents, incidents, actors, jurisdiction, actorAppearances, incidentActors);

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
        SELECT i.*,
          (SELECT COUNT(*) FROM incident_actors ia WHERE ia.incident_id = i.id) AS actor_count
        FROM incidents i
        ORDER BY i.incident_date DESC, i.created_at DESC
      `).all();

      // Attach linked documents and events to each incident
      const docStmt = currentCaseDb.prepare(`
        SELECT d.id, d.filename, d.evidence_type, d.document_date, id2.relationship
        FROM incident_documents id2
        JOIN documents d ON d.id = id2.document_id
        WHERE id2.incident_id = ?
      `);
      const evtStmt = currentCaseDb.prepare(`
        SELECT ie.event_id, ie.event_role
        FROM incident_events ie
        WHERE ie.incident_id = ?
      `);
      for (const inc of incidents) {
        inc.documents = docStmt.all(inc.id);
        inc.events = evtStmt.all(inc.id);
      }

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

      // Link actors if provided: [{ actorId, role }]
      if (incidentData.actors && Array.isArray(incidentData.actors)) {
        const linkActorStmt = currentCaseDb.prepare(`
          INSERT OR IGNORE INTO incident_actors (incident_id, actor_id, role)
          VALUES (?, ?, ?)
        `);
        for (const { actorId, role } of incidentData.actors) {
          if (actorId && role) {
            linkActorStmt.run(id, actorId, role);
          }
        }
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

  ipcMain.handle('incidents:reclassify', async () => {
    try {
      if (!currentCaseDb) {
        return { success: false, error: 'No case is open' };
      }

      const ctx = currentCaseDb.prepare(
        "SELECT jurisdiction FROM case_context WHERE id = 1"
      ).get();
      const jurisdiction = ctx?.jurisdiction || 'both';

      const incidents = currentCaseDb.prepare('SELECT * FROM incidents').all();

      const updateStmt = currentCaseDb.prepare(`
        UPDATE incidents
        SET computed_severity = ?, severity_factors_json = ?, updated_at = datetime('now')
        WHERE id = ?
      `);

      let updated = 0;
      for (const inc of incidents) {
        const incidentData = {
          severity: inc.base_severity,
          suggestedSeverity: inc.base_severity,
          harrisNature: null,
          tangibleAction: false,
          burlingtonProximity: inc.involves_retaliation ? true : false
        };
        const context = {
          daysAfterProtectedActivity: inc.days_after_protected_activity
        };
        const severityResult = computeSeverity(incidentData, context, jurisdiction);
        updateStmt.run(severityResult.computedSeverity, JSON.stringify(severityResult.factors), inc.id);
        updated++;
      }

      console.log(`[IPC] incidents:reclassify: updated ${updated} incidents`);
      return { success: true, updated };
    } catch (error) {
      console.error('[IPC] incidents:reclassify error:', error.message);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('incidents:suggest', async () => {
    try {
      const caseDb = currentCaseDb;
      const events = caseDb.prepare('SELECT * FROM events WHERE date IS NOT NULL ORDER BY date').all().map(evt => {
        const tags = caseDb.prepare('SELECT tag FROM event_tags WHERE event_id = ?').all(evt.id).map(r => r.tag);
        return { ...evt, tags };
      });
      const existingIncidents = caseDb.prepare('SELECT * FROM incidents').all();
      const suggestions = suggestIncidents(events, existingIncidents);
      return { success: true, suggestions };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // ── Incident ↔ Actor linking ──────────────────────────────────────────────

  ipcMain.handle('incidents:linkActor', async (event, incidentId, actorId, role) => {
    try {
      if (!currentCaseDb) {
        return { success: false, error: 'No case is open' };
      }
      const validRoles = ['perpetrator', 'target', 'witness', 'bystander'];
      if (!validRoles.includes(role)) {
        return { success: false, error: `Invalid role. Must be one of: ${validRoles.join(', ')}` };
      }
      currentCaseDb.prepare(`
        INSERT OR REPLACE INTO incident_actors (incident_id, actor_id, role)
        VALUES (?, ?, ?)
      `).run(incidentId, actorId, role);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('incidents:unlinkActor', async (event, incidentId, actorId) => {
    try {
      if (!currentCaseDb) {
        return { success: false, error: 'No case is open' };
      }
      currentCaseDb.prepare(
        'DELETE FROM incident_actors WHERE incident_id = ? AND actor_id = ?'
      ).run(incidentId, actorId);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('incidents:getActors', async (event, incidentId) => {
    try {
      if (!currentCaseDb) {
        return { success: false, error: 'No case is open' };
      }
      const actors = currentCaseDb.prepare(`
        SELECT a.*, ia.role AS incident_role
        FROM incident_actors ia
        JOIN actors a ON a.id = ia.actor_id
        WHERE ia.incident_id = ?
        ORDER BY
          CASE ia.role
            WHEN 'perpetrator' THEN 0
            WHEN 'target' THEN 1
            WHEN 'witness' THEN 2
            WHEN 'bystander' THEN 3
          END
      `).all(incidentId);
      return { success: true, actors };
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

      // Determine in_reporting_chain from relationship if not explicitly set
      const relationship = actorData.relationship || null;
      const inChain = actorData.inReportingChain !== undefined
        ? (actorData.inReportingChain ? 1 : 0)
        : (relationship && IN_CHAIN_RELATIONSHIPS.has(relationship) ? 1 : 0);

      const stmt = currentCaseDb.prepare(`
        INSERT INTO actors (
          id, name, email, role, title, department,
          classification, secondary_classifications, would_they_help,
          relationship_to_self, reports_to, is_self,
          has_written_statement, statement_is_dated, statement_is_specific,
          still_employed, reports_to_bad_actor, risk_factors,
          gender, disability_status, start_date, end_date,
          aliases, in_reporting_chain
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        relationship,
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
        actorData.endDate || null,
        JSON.stringify(actorData.aliases || []),
        inChain
      );

      // Link to source document if provided
      if (actorData.sourceDocumentId) {
        const linkStmt = currentCaseDb.prepare(`
          INSERT INTO actor_appearances (actor_id, document_id, role_in_document, auto_detected)
          VALUES (?, ?, ?, 1)
        `);
        linkStmt.run(id, actorData.sourceDocumentId, actorData.roleInDocument || null);
      }

      // Refresh actor registry
      if (actorRegistry) {
        try { actorRegistry.loadAll(); } catch (e) { /* ignore */ }
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

      // Handle aliases (JSON array)
      if (updates.aliases !== undefined) {
        fields.push('aliases = ?');
        values.push(JSON.stringify(Array.isArray(updates.aliases) ? updates.aliases : []));
      }

      // Handle in_reporting_chain
      if (updates.inReportingChain !== undefined) {
        fields.push('in_reporting_chain = ?');
        values.push(updates.inReportingChain ? 1 : 0);
      }

      if (fields.length === 0) {
        return { success: true };
      }

      fields.push("updated_at = datetime('now')");
      values.push(actorId);

      const stmt = currentCaseDb.prepare('UPDATE actors SET ' + fields.join(', ') + ' WHERE id = ?');
      stmt.run(...values);

      // Refresh actor registry
      if (actorRegistry) {
        try { actorRegistry.loadAll(); } catch (e) { /* ignore */ }
      }

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

      // Delete conflicting event links where both actors are in same event
      currentCaseDb.prepare(`
        DELETE FROM event_actors
        WHERE actor_id = ? AND event_id IN (
          SELECT event_id FROM event_actors WHERE actor_id = ?
        )
      `).run(mergeActorId, keepActorId);

      // Move remaining event links
      currentCaseDb.prepare(`
        UPDATE event_actors SET actor_id = ? WHERE actor_id = ?
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

  // ==================== ACTOR REGISTRY ====================

  /** Get relationship type taxonomy */
  ipcMain.handle('actors:getRelationshipTypes', async () => {
    return { success: true, types: RELATIONSHIP_TYPES };
  });

  /** Resolve harasser role from text using known actors */
  ipcMain.handle('actors:resolveFromText', async (event, text, confirmedActorIds) => {
    try {
      if (!actorRegistry) {
        return { success: true, role: 'unknown', inChain: false, actor: null, pending: [] };
      }
      const result = resolveHarasserForEntry(text, actorRegistry, confirmedActorIds || null);
      return {
        success: true,
        role: result.role,
        inChain: result.inChain,
        actor: result.actor ? { id: result.actor.id, name: result.actor.name, relationship: result.actor.relationship } : null,
        pending: result.pending.map(m => ({
          actorId: m.actor.id,
          actorName: m.actor.name,
          confidence: m.confidence,
          matchedOn: m.matchedOn,
          relationship: m.actor.relationship,
          classification: m.actor.classification,
        })),
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  /** Find all known actors mentioned in text */
  ipcMain.handle('actors:findInText', async (event, text) => {
    try {
      if (!actorRegistry) {
        return { success: true, matches: [] };
      }
      const matches = actorRegistry.findActorsInText(text);
      return {
        success: true,
        matches: matches.map(m => ({
          actorId: m.actor.id,
          actorName: m.actor.name,
          confidence: m.confidence,
          matchedOn: m.matchedOn,
          needsConfirmation: m.needsConfirmation,
          relationship: m.actor.relationship,
          relationshipLabel: m.actor.relationshipLabel,
          harasserRole: m.actor.harasserRole,
          inReportingChain: m.actor.inReportingChain,
          classification: m.actor.classification,
        })),
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  /** Get actors in the reporting chain */
  ipcMain.handle('actors:getChain', async () => {
    try {
      if (!actorRegistry) {
        return { success: true, actors: [] };
      }
      const chain = actorRegistry.actorsInChain();
      return {
        success: true,
        actors: chain.map(a => ({
          id: a.id,
          name: a.name,
          relationship: a.relationship,
          relationshipLabel: a.relationshipLabel,
          title: a.title,
          classification: a.classification,
        })),
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  /** Get summary of all actors for assessment prompts */
  ipcMain.handle('actors:getSummary', async () => {
    try {
      if (!actorRegistry) {
        return { success: true, summary: 'No actors defined.' };
      }
      return { success: true, summary: actorRegistry.summaryForAssessment() };
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

  // ==================== EVENTS ====================

  ipcMain.handle('events:list', async (event, caseId) => {
    try {
      const caseDb = currentCaseDb;

      const events = caseDb.prepare('SELECT * FROM events ORDER BY date, created_at').all();

      // Get linked items for each event
      for (const evt of events) {
        // Tags
        try {
          evt.tags = caseDb.prepare('SELECT tag FROM event_tags WHERE event_id = ?').all(evt.id).map(r => r.tag);
        } catch (e) { evt.tags = []; }

        // Documents
        try {
          evt.documents = caseDb.prepare(`
            SELECT d.*, ed.relevance, ed.weight
            FROM documents d
            JOIN event_documents ed ON ed.document_id = d.id
            WHERE ed.event_id = ?
          `).all(evt.id);
        } catch (e) { evt.documents = []; }

        // Incidents (via incident_events)
        try {
          evt.incidents = caseDb.prepare(`
            SELECT i.*, ie.event_role
            FROM incidents i
            JOIN incident_events ie ON ie.incident_id = i.id
            WHERE ie.event_id = ?
          `).all(evt.id);
        } catch (e) { evt.incidents = []; }

        // Actors
        try {
          evt.actors = caseDb.prepare(`
            SELECT a.*, ea.role
            FROM actors a
            JOIN event_actors ea ON ea.actor_id = a.id
            WHERE ea.event_id = ?
          `).all(evt.id);
        } catch (e) { evt.actors = []; }

        // Precedents
        try {
          evt.precedents = caseDb.prepare('SELECT * FROM event_precedents WHERE event_id = ?').all(evt.id);
        } catch (e) { evt.precedents = []; }
      }
      return { success: true, events };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('events:generate', async (event, caseId) => {
    try {
      const caseDb = currentCaseDb;

      // Get existing data
      const documents = caseDb.prepare('SELECT * FROM documents').all();
      let incidents = [];
      try { incidents = caseDb.prepare('SELECT * FROM incidents').all(); } catch (e) {}
      let context = null;
      try { context = caseDb.prepare('SELECT * FROM case_context WHERE id = 1').get(); } catch (e) {}

      // Get existing events for dedup
      const existingEvents = caseDb.prepare('SELECT id, title, date FROM events').all();

      // Generate events from each source
      const contextAnchors = context?.narrative
        ? generateEventsFromContext(context.narrative, [])
        : [];
      const incidentAnchors = generateEventsFromIncidents(incidents);
      const documentAnchors = generateEventsFromDocuments(documents);
      const allAnchors = mergeEvents(contextAnchors, incidentAnchors, documentAnchors);

      // Add START event if hire_date exists and no employment_start event
      const hasStart = existingEvents.some(e => e.title === 'Employment Started') ||
        allAnchors.some(a => a.anchor_type === 'START');
      if (context?.hire_date && !hasStart) {
        allAnchors.unshift({
          id: uuidv4(),
          anchor_type: 'START',
          title: 'Employment Started',
          anchor_date: context.hire_date
        });
      }

      if (allAnchors.length === 0) {
        return { success: true, count: 0, actorsFound: 0, actors: [], skipped: true };
      }

      // Detect actors from narrative
      let detectedActors = [];
      if (context?.narrative) {
        try { detectedActors = extractActorsFromNarrative(context.narrative); } catch (e) {}
      }

      // Upsert detected actors
      const actorInsertStmt = caseDb.prepare('INSERT OR IGNORE INTO actors (id, name, classification) VALUES (?, ?, ?)');
      for (const actor of detectedActors) {
        try {
          const existing = caseDb.prepare('SELECT id FROM actors WHERE LOWER(name) = LOWER(?)').get(actor.name);
          if (!existing) {
            const actorId = uuidv4();
            actorInsertStmt.run(actorId, actor.name, actor.suggestedClassification || 'unknown');
            actor.dbId = actorId;
          } else {
            actor.dbId = existing.id;
          }
        } catch (e) {}
      }

      // Tag mapping from anchor_type
      const tagMapping = {
        'HARASSMENT': ['harassment'],
        'ADVERSE_ACTION': ['adverse_action'],
        'REPORTED': ['protected_activity'],
        'HELP': ['help_request'],
        'START': ['employment_start'],
        'END': ['employment_end'],
        'MILESTONE': []
      };

      // Precedent mapping by tag
      const precedentMapping = {
        'protected_activity': ['faragher', 'joshua_filing'],
        'adverse_action': ['burlington_northern', 'harris', 'muldrow_some_harm'],
        'harassment': ['harris', 'vance', 'morgan', 'faragher', 'monaghan_retaliation'],
        'help_request': ['faragher'],
        'employment_end': ['burlington_northern']
      };

      const insertEvt = caseDb.prepare(`
        INSERT INTO events (id, case_id, date, title, description, event_type, what_happened, severity)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const insertTag = caseDb.prepare('INSERT INTO event_tags (id, event_id, tag) VALUES (?, ?, ?)');

      let added = 0;
      for (const anchor of allAnchors) {
        // Dedup: skip if similar event already exists
        const isDup = existingEvents.some(e =>
          textSimilarity(e.title, anchor.title) > 0.7 ||
          (e.title === anchor.title && e.date === (anchor.anchor_date || null))
        );
        if (isDup) continue;

        const evtId = anchor.id || uuidv4();
        const evtType = (anchor.anchor_type || '').toLowerCase();

        insertEvt.run(
          evtId, caseId || null, anchor.anchor_date || null,
          anchor.title, anchor.description || null, evtType,
          anchor.what_happened || null, anchor.severity || null
        );

        // Insert tags
        const tags = tagMapping[anchor.anchor_type] || [];
        for (const tag of tags) {
          insertTag.run(uuidv4(), evtId, tag);
        }

        // Link source document
        if (anchor.source_document_id) {
          try {
            caseDb.prepare('INSERT INTO event_documents (id, event_id, document_id, relevance) VALUES (?, ?, ?, ?)').run(
              uuidv4(), evtId, anchor.source_document_id, 'source'
            );
          } catch (e) {}
        }

        // Link source incident
        if (anchor.source_incident_id) {
          try {
            caseDb.prepare('INSERT INTO incident_events (id, incident_id, event_id, event_role) VALUES (?, ?, ?, ?)').run(
              uuidv4(), anchor.source_incident_id, evtId, 'primary'
            );
          } catch (e) {}
        }

        // Link detected actors mentioned in this event
        if (anchor.what_happened || anchor.description) {
          const evtText = (anchor.what_happened || '') + ' ' + (anchor.description || '');
          for (const actor of detectedActors) {
            if (actor.dbId && actor.name && evtText.toLowerCase().includes(actor.name.toLowerCase())) {
              try {
                caseDb.prepare('INSERT INTO event_actors (id, event_id, actor_id, role) VALUES (?, ?, ?, ?)').run(
                  uuidv4(), evtId, actor.dbId, actor.suggestedClassification || 'mentioned'
                );
              } catch (e) {}
            }
          }
        }

        // Auto-link precedents based on tags
        for (const tag of tags) {
          const precs = precedentMapping[tag];
          if (precs) {
            for (const precId of precs) {
              try {
                caseDb.prepare("INSERT INTO event_precedents (id, event_id, precedent_id, relevance_note, linked_at) VALUES (?, ?, ?, ?, datetime('now'))").run(
                  uuidv4(), evtId, precId, 'Auto-linked based on event tag'
                );
              } catch (e) {}
            }
          }
        }

        added++;
      }

      // Update last scanned
      try { caseDb.prepare("UPDATE case_context SET last_scanned_at = datetime('now') WHERE id = 1").run(); } catch (e) {}

      return {
        success: true,
        count: added,
        actorsFound: detectedActors.length,
        actors: detectedActors.map(a => ({ name: a.name, classification: a.suggestedClassification, id: a.dbId }))
      };
    } catch (error) {
      console.error('[IPC] events:generate error:', error.message);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('events:create', async (event, caseId, data) => {
    try {
      if (data.date) {
        const d = new Date(data.date);
        const today = new Date();
        today.setHours(23, 59, 59, 999);
        if (d > today) {
          return { success: false, error: 'Date cannot be in the future' };
        }
      }

      const caseDb = currentCaseDb;
      const id = uuidv4();

      caseDb.prepare(`
        INSERT INTO events (
          id, case_id, date, title, description, event_type,
          what_happened, where_location, impact_summary, severity,
          event_weight, why_no_report, employer_notified, notice_date,
          notice_method, employer_response, response_date, response_adequate
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        caseId || null,
        data.date || null,
        data.title,
        data.description || null,
        data.type ? data.type.toLowerCase() : null,
        data.whatHappened || null,
        data.where || null,
        data.impact || null,
        data.severity || null,
        data.eventWeight || 'significant',
        data.whyNoReport || null,
        data.employerNotified ? 1 : 0,
        data.noticeDate || null,
        data.noticeMethod || null,
        data.employerResponse || null,
        data.responseDate || null,
        data.responseAdequate ? 1 : 0
      );

      // Insert tags
      if (data.tags && Array.isArray(data.tags)) {
        const tagStmt = caseDb.prepare('INSERT INTO event_tags (id, event_id, tag) VALUES (?, ?, ?)');
        for (const tag of data.tags) {
          tagStmt.run(uuidv4(), id, tag);
        }
      }

      return { success: true, event: { id, ...data } };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('events:update', async (event, caseId, eventId, updates) => {
    try {
      if (updates.date) {
        const d = new Date(updates.date);
        const today = new Date();
        today.setHours(23, 59, 59, 999);
        if (d > today) {
          return { success: false, error: 'Date cannot be in the future' };
        }
      }

      const caseDb = currentCaseDb;

      const fields = [];
      const values = [];

      const fieldMap = {
        title: 'title',
        description: 'description',
        date: 'date',
        type: 'event_type',
        whatHappened: 'what_happened',
        where: 'where_location',
        impact: 'impact_summary',
        severity: 'severity',
        eventWeight: 'event_weight',
        whyNoReport: 'why_no_report',
        employerNotified: 'employer_notified',
        noticeDate: 'notice_date',
        noticeMethod: 'notice_method',
        employerResponse: 'employer_response',
        employer_response: 'employer_response',
        employerResponseType: 'employer_response_type',
        employer_response_type: 'employer_response_type',
        responseDate: 'response_date',
        response_date: 'response_date',
        responseAdequate: 'response_adequate',
        response_adequate: 'response_adequate',
        date_confidence: 'date_confidence'
      };

      const booleanFields = new Set(['employerNotified', 'responseAdequate', 'employer_notified', 'response_adequate']);
      for (const [key, dbField] of Object.entries(fieldMap)) {
        if (updates[key] !== undefined) {
          fields.push(`${dbField} = ?`);
          let val = updates[key];
          if (booleanFields.has(key) || typeof val === 'boolean') val = val ? 1 : 0;
          values.push(val);
        }
      }

      // Track edit history before saving
      try {
        const current = caseDb.prepare('SELECT title, date, date_confidence, description FROM events WHERE id = ?').get(eventId);
        if (current) {
          const historyRaw = caseDb.prepare('SELECT edit_history FROM events WHERE id = ?').get(eventId)?.edit_history;
          const history = JSON.parse(historyRaw || '[]');
          history.push({ ...current, saved_at: new Date().toISOString() });
          fields.push('edit_history = ?');
          values.push(JSON.stringify(history));
        }
      } catch (e) { /* edit_history column may not exist on older DBs */ }

      fields.push("updated_at = datetime('now')");
      values.push(eventId);

      if (fields.length > 1) {
        const stmt = caseDb.prepare(`UPDATE events SET ${fields.join(', ')} WHERE id = ?`);
        stmt.run(...values);
      }

      // Update tags if provided
      if (updates.tags && Array.isArray(updates.tags)) {
        caseDb.prepare('DELETE FROM event_tags WHERE event_id = ?').run(eventId);
        const tagStmt = caseDb.prepare('INSERT INTO event_tags (id, event_id, tag) VALUES (?, ?, ?)');
        for (const tag of updates.tags) {
          tagStmt.run(uuidv4(), eventId, tag);
        }

        // Auto-link precedents when tags change
        const precMapping = {
          'protected_activity': ['faragher', 'joshua_filing'],
          'adverse_action': ['burlington_northern', 'harris', 'muldrow_some_harm'],
          'harassment': ['harris', 'vance', 'morgan', 'faragher', 'monaghan_retaliation'],
          'help_request': ['faragher'],
          'employment_end': ['burlington_northern']
        };
        for (const tag of updates.tags) {
          const precs = precMapping[tag];
          if (precs) {
            for (const precId of precs) {
              try {
                caseDb.prepare("INSERT OR IGNORE INTO event_precedents (id, event_id, precedent_id, relevance_note, linked_at) VALUES (?, ?, ?, ?, datetime('now'))").run(
                  uuidv4(), eventId, precId, 'Auto-linked on tag change'
                );
              } catch (e) {}
            }
          }
        }
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('events:delete', async (event, caseId, eventId) => {
    try {
      const caseDb = currentCaseDb;

      // Delete from all junction tables
      caseDb.prepare('DELETE FROM event_tags WHERE event_id = ?').run(eventId);
      caseDb.prepare('DELETE FROM event_documents WHERE event_id = ?').run(eventId);
      caseDb.prepare('DELETE FROM event_actors WHERE event_id = ?').run(eventId);
      try { caseDb.prepare('DELETE FROM event_precedents WHERE event_id = ?').run(eventId); } catch (e) {}
      try { caseDb.prepare('DELETE FROM event_links WHERE source_event_id = ? OR target_event_id = ?').run(eventId, eventId); } catch (e) {}
      try { caseDb.prepare('DELETE FROM incident_events WHERE event_id = ?').run(eventId); } catch (e) {}

      caseDb.prepare('DELETE FROM events WHERE id = ?').run(eventId);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('events:linkEvidence', async (event, caseId, eventId, documentId) => {
    try {
      const caseDb = currentCaseDb;
      caseDb.prepare('INSERT INTO event_documents (id, event_id, document_id, relevance) VALUES (?, ?, ?, ?)').run(
        uuidv4(), eventId, documentId, 'supports'
      );
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('events:unlinkEvidence', async (event, caseId, eventId, documentId) => {
    try {
      const caseDb = currentCaseDb;
      caseDb.prepare('DELETE FROM event_documents WHERE event_id = ? AND document_id = ?').run(eventId, documentId);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('events:getRelatedEvidence', async (event, caseId, eventId) => {
    try {
      const caseDb = currentCaseDb;

      const evt = caseDb.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
      if (!evt) {
        return { success: false, error: 'Event not found' };
      }

      // Tags
      try {
        evt.tags = caseDb.prepare('SELECT tag FROM event_tags WHERE event_id = ?').all(evt.id).map(r => r.tag);
      } catch (e) { evt.tags = []; }

      // Linked documents
      let linkedDocs = [];
      try {
        linkedDocs = caseDb.prepare(`
          SELECT d.*, ed.relevance, ed.weight
          FROM documents d
          JOIN event_documents ed ON ed.document_id = d.id
          WHERE ed.event_id = ?
        `).all(eventId);
      } catch (e) {}

      // Linked incidents
      let linkedIncidents = [];
      try {
        linkedIncidents = caseDb.prepare(`
          SELECT i.*, ie.event_role
          FROM incidents i
          JOIN incident_events ie ON ie.incident_id = i.id
          WHERE ie.event_id = ?
        `).all(eventId);
      } catch (e) {}

      // Linked actors
      let linkedActors = [];
      try {
        linkedActors = caseDb.prepare(`
          SELECT a.*, ea.role
          FROM actors a
          JOIN event_actors ea ON ea.actor_id = a.id
          WHERE ea.event_id = ?
        `).all(eventId);
      } catch (e) {}

      // Nearby documents (within 14 days)
      let nearbyDocs = [];
      if (evt.date) {
        try {
          const allDocs = caseDb.prepare('SELECT * FROM documents').all();
          const evtDate = new Date(evt.date);
          nearbyDocs = allDocs.filter(d => {
            if (!d.document_date) return false;
            if (linkedDocs.some(ld => ld.id === d.id)) return false;
            const docDate = new Date(d.document_date);
            const daysDiff = Math.abs((docDate - evtDate) / (1000 * 60 * 60 * 24));
            return daysDiff <= 14;
          }).slice(0, 10);
        } catch (e) {}
      }

      // Linked precedents
      let linkedPrecedents = [];
      try {
        linkedPrecedents = caseDb.prepare('SELECT * FROM event_precedents WHERE event_id = ?').all(eventId);
      } catch (e) {}

      // Causality links
      let links = [];
      try {
        links = caseDb.prepare('SELECT * FROM event_links WHERE source_event_id = ? OR target_event_id = ?').all(eventId, eventId);
      } catch (e) {}

      return {
        success: true,
        event: evt,
        linked: {
          documents: linkedDocs,
          incidents: linkedIncidents,
          actors: linkedActors,
          precedents: linkedPrecedents,
          links
        },
        nearby: { documents: nearbyDocs }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // ==================== EVENT EXTENDED OPERATIONS ====================

  ipcMain.handle('events:clone', async (event, caseId, eventId) => {
    try {
      const caseDb = currentCaseDb;

      const original = caseDb.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
      if (!original) {
        return { success: false, error: 'Event not found' };
      }

      const newId = uuidv4();

      caseDb.prepare(`
        INSERT INTO events (
          id, case_id, date, title, description, event_type,
          what_happened, where_location, impact_summary, severity,
          event_weight, why_no_report, employer_notified, notice_date,
          notice_method, employer_response, response_date, response_adequate
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        newId, original.case_id, original.date,
        original.title + ' (copy)', original.description, original.event_type,
        original.what_happened, original.where_location, original.impact_summary, original.severity,
        original.event_weight, original.why_no_report, original.employer_notified, original.notice_date,
        original.notice_method, original.employer_response, original.response_date, original.response_adequate
      );

      // Clone tags
      try {
        const tags = caseDb.prepare('SELECT tag FROM event_tags WHERE event_id = ?').all(eventId);
        const tagStmt = caseDb.prepare('INSERT INTO event_tags (id, event_id, tag) VALUES (?, ?, ?)');
        for (const t of tags) { tagStmt.run(uuidv4(), newId, t.tag); }
      } catch (e) {}

      // Clone linked documents
      try {
        const docs = caseDb.prepare('SELECT * FROM event_documents WHERE event_id = ?').all(eventId);
        for (const doc of docs) {
          caseDb.prepare('INSERT INTO event_documents (id, event_id, document_id, relevance) VALUES (?, ?, ?, ?)').run(uuidv4(), newId, doc.document_id, doc.relevance);
        }
      } catch (e) {}

      // Clone linked incidents
      try {
        const incs = caseDb.prepare('SELECT * FROM incident_events WHERE event_id = ?').all(eventId);
        for (const inc of incs) {
          caseDb.prepare('INSERT INTO incident_events (id, incident_id, event_id, event_role) VALUES (?, ?, ?, ?)').run(uuidv4(), inc.incident_id, newId, inc.event_role);
        }
      } catch (e) {}

      // Clone linked actors
      try {
        const actors = caseDb.prepare('SELECT * FROM event_actors WHERE event_id = ?').all(eventId);
        for (const actor of actors) {
          caseDb.prepare('INSERT INTO event_actors (id, event_id, actor_id, role) VALUES (?, ?, ?, ?)').run(uuidv4(), newId, actor.actor_id, actor.role);
        }
      } catch (e) {}

      // Clone linked precedents
      try {
        const precs = caseDb.prepare('SELECT * FROM event_precedents WHERE event_id = ?').all(eventId);
        for (const prec of precs) {
          caseDb.prepare('INSERT INTO event_precedents (id, event_id, precedent_id, relevance_note) VALUES (?, ?, ?, ?)').run(uuidv4(), newId, prec.precedent_id, prec.relevance_note);
        }
      } catch (e) {}

      return { success: true, newId };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // events:reorder — no-op (sort_order removed from schema, events sorted by date)
  ipcMain.handle('events:reorder', async () => {
    return { success: true };
  });

  ipcMain.handle('events:linkPrecedent', async (event, caseId, eventId, precedentId, relevanceNote) => {
    try {
      const caseDb = currentCaseDb;
      const existing = caseDb.prepare('SELECT id FROM event_precedents WHERE event_id = ? AND precedent_id = ?').get(eventId, precedentId);
      if (existing) {
        caseDb.prepare("UPDATE event_precedents SET relevance_note = ?, linked_at = datetime('now') WHERE id = ?").run(relevanceNote || null, existing.id);
      } else {
        caseDb.prepare("INSERT INTO event_precedents (id, event_id, precedent_id, relevance_note, linked_at) VALUES (?, ?, ?, ?, datetime('now'))").run(
          uuidv4(), eventId, precedentId, relevanceNote || null
        );
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('events:unlinkPrecedent', async (event, caseId, eventId, precedentId) => {
    try {
      const caseDb = currentCaseDb;
      caseDb.prepare('DELETE FROM event_precedents WHERE event_id = ? AND precedent_id = ?').run(eventId, precedentId);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('events:getPrecedents', async (event, caseId, eventId) => {
    try {
      const caseDb = currentCaseDb;
      const precedents = caseDb.prepare('SELECT * FROM event_precedents WHERE event_id = ?').all(eventId);
      return { success: true, precedents };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('events:breakApart', async (event, caseId, eventId) => {
    try {
      const caseDb = currentCaseDb;

      const original = caseDb.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
      if (!original) {
        return { success: false, error: 'Event not found' };
      }

      const textToSplit = original.what_happened || original.description || '';
      const subSegments = splitEventSegment(textToSplit);

      if (subSegments.length <= 1) {
        return { success: false, error: 'Cannot break apart — only one event detected' };
      }

      // Get original tags for cloning
      let originalTags = [];
      try {
        originalTags = caseDb.prepare('SELECT tag FROM event_tags WHERE event_id = ?').all(eventId).map(r => r.tag);
      } catch (e) {}

      const newEvents = [];
      for (let i = 0; i < subSegments.length; i++) {
        const segment = subSegments[i].trim();
        if (segment.length < 10) continue;

        const newId = uuidv4();
        const dateInfo = extractDate(segment);
        const title = segment.slice(0, 60).replace(/[,.]$/, '').trim();

        caseDb.prepare(`
          INSERT INTO events (id, case_id, date, title, description, event_type, what_happened, where_location, severity)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          newId, original.case_id, dateInfo.date || original.date,
          title, segment.slice(0, 500), original.event_type,
          segment, original.where_location, original.severity
        );

        // Copy tags from original
        const tagStmt = caseDb.prepare('INSERT INTO event_tags (id, event_id, tag) VALUES (?, ?, ?)');
        for (const tag of originalTags) {
          tagStmt.run(uuidv4(), newId, tag);
        }

        newEvents.push({ id: newId, title, segment });
      }

      // Delete the original event and its links
      caseDb.prepare('DELETE FROM event_tags WHERE event_id = ?').run(eventId);
      caseDb.prepare('DELETE FROM event_documents WHERE event_id = ?').run(eventId);
      caseDb.prepare('DELETE FROM event_actors WHERE event_id = ?').run(eventId);
      try { caseDb.prepare('DELETE FROM event_precedents WHERE event_id = ?').run(eventId); } catch (e) {}
      try { caseDb.prepare('DELETE FROM event_links WHERE source_event_id = ? OR target_event_id = ?').run(eventId, eventId); } catch (e) {}
      try { caseDb.prepare('DELETE FROM incident_events WHERE event_id = ?').run(eventId); } catch (e) {}
      caseDb.prepare('DELETE FROM events WHERE id = ?').run(eventId);

      return { success: true, newEvents };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('events:linkIncident', async (event, caseId, eventId, incidentId, eventRole) => {
    try {
      const caseDb = currentCaseDb;
      caseDb.prepare('INSERT INTO incident_events (id, incident_id, event_id, event_role) VALUES (?, ?, ?, ?)').run(
        uuidv4(), incidentId, eventId, eventRole || 'primary'
      );
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('events:unlinkIncident', async (event, caseId, eventId, incidentId) => {
    try {
      const caseDb = currentCaseDb;
      caseDb.prepare('DELETE FROM incident_events WHERE event_id = ? AND incident_id = ?').run(eventId, incidentId);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('events:linkActor', async (event, caseId, eventId, actorId, role) => {
    try {
      const caseDb = currentCaseDb;
      caseDb.prepare('INSERT INTO event_actors (id, event_id, actor_id, role) VALUES (?, ?, ?, ?)').run(
        uuidv4(), eventId, actorId, role || 'involved'
      );
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('events:unlinkActor', async (event, caseId, eventId, actorId) => {
    try {
      const caseDb = currentCaseDb;
      caseDb.prepare('DELETE FROM event_actors WHERE event_id = ? AND actor_id = ?').run(eventId, actorId);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('events:linkDocumentV2', async (event, caseId, eventId, documentId, relevanceV2) => {
    try {
      const caseDb = currentCaseDb;
      const relevance = Array.isArray(relevanceV2) ? relevanceV2[0] : (relevanceV2 || 'context');

      const existing = caseDb.prepare('SELECT id FROM event_documents WHERE event_id = ? AND document_id = ?').get(eventId, documentId);
      if (existing) {
        caseDb.prepare('UPDATE event_documents SET relevance = ? WHERE id = ?').run(relevance, existing.id);
      } else {
        caseDb.prepare('INSERT INTO event_documents (id, event_id, document_id, relevance) VALUES (?, ?, ?, ?)').run(
          uuidv4(), eventId, documentId, relevance
        );
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('events:setDocumentWeight', async (event, caseId, eventId, documentId, weight) => {
    try {
      const caseDb = currentCaseDb;
      const w = Math.max(1, Math.min(5, parseInt(weight) || 3));
      caseDb.prepare('UPDATE event_documents SET weight = ? WHERE event_id = ? AND document_id = ?').run(w, eventId, documentId);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // ==================== DOCUMENT-EVENT LINK SUGGESTIONS ====================

  ipcMain.handle('events:suggestLinks', async (event, caseId, documentId) => {
    try {
      console.log('[suggestLinks] called with documentId:', documentId, 'caseId:', caseId);
      const caseDb = currentCaseDb;

      // Get document details
      const doc = caseDb.prepare('SELECT * FROM documents WHERE id = ?').get(documentId);
      console.log('[suggestLinks] doc:', doc ? doc.filename : 'NOT FOUND', '| date:', doc?.document_date, '| type:', doc?.evidence_type);
      if (!doc) return { success: false, error: 'Document not found' };

      // Get actors linked to this document via actor_appearances
      const docActors = caseDb.prepare(`
        SELECT a.id, a.name FROM actors a
        JOIN actor_appearances aa ON aa.actor_id = a.id
        WHERE aa.document_id = ?
      `).all(documentId);

      const actorIds = docActors.map(a => a.id);

      const suggestions = [];

      if (doc.document_date) {
        // Find events within ±7 days of document date
        const events = caseDb.prepare(`
          SELECT e.*, GROUP_CONCAT(et.tag) as tags_concat
          FROM events e
          LEFT JOIN event_tags et ON et.event_id = e.id
          WHERE e.date IS NOT NULL
            AND julianday(e.date) BETWEEN julianday(?) - 7 AND julianday(?) + 7
          GROUP BY e.id
        `).all(doc.document_date, doc.document_date);

        for (const evt of events) {
          let score = 0;

          // Date proximity scoring
          const daysDiff = Math.abs(
            Math.round((new Date(evt.date) - new Date(doc.document_date)) / (1000 * 60 * 60 * 24))
          );
          if (daysDiff === 0) score += 50;
          else if (daysDiff <= 3) score += 30;
          else if (daysDiff <= 7) score += 20;

          // Actor overlap scoring (+15 per shared actor)
          const evtActorIds = caseDb.prepare(
            'SELECT actor_id FROM event_actors WHERE event_id = ?'
          ).all(evt.id).map(a => a.actor_id);

          const overlapCount = actorIds.filter(id => evtActorIds.includes(id)).length;
          score += overlapCount * 15;

          // Evidence type alignment scoring
          const tags = evt.tags_concat ? evt.tags_concat.split(',') : [];
          if (doc.evidence_type === 'PROTECTED_ACTIVITY' && tags.includes('protected_activity')) score += 20;
          if (doc.evidence_type === 'ADVERSE_ACTION'    && tags.includes('adverse_action'))    score += 20;
          if (doc.evidence_type === 'RESPONSE'          && tags.includes('help_request'))      score += 15;

          if (score >= 40) {
            suggestions.push({
              event: evt,
              score: Math.min(score, 100),
              reason: `${daysDiff} day${daysDiff !== 1 ? 's' : ''} apart, ${overlapCount} shared actor${overlapCount !== 1 ? 's' : ''}`
            });
          }
        }
      }

      suggestions.sort((a, b) => b.score - a.score);

      const top = suggestions.slice(0, 5);
      console.log('[suggestLinks] returning', top.length, 'suggestions:', top.map(s => `"${s.event.title}" (${s.score}%)`).join(', ') || 'none');
      return { success: true, suggestions: top };
    } catch (error) {
      console.error('[IPC] events:suggestLinks error:', error.message);
      return { success: false, error: error.message };
    }
  });

  // ==================== EVENT TAGS ====================

  ipcMain.handle('eventTags:set', async (event, eventId, tags) => {
    try {
      const caseDb = currentCaseDb;
      caseDb.prepare('DELETE FROM event_tags WHERE event_id = ?').run(eventId);
      const stmt = caseDb.prepare('INSERT INTO event_tags (id, event_id, tag) VALUES (?, ?, ?)');
      for (const tag of (tags || [])) {
        stmt.run(uuidv4(), eventId, tag);
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('eventTags:listAll', async () => {
    try {
      const caseDb = currentCaseDb;
      const tags = caseDb.prepare('SELECT DISTINCT tag FROM event_tags ORDER BY tag').all().map(r => r.tag);
      return { success: true, tags };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // ==================== EVENT LINKS (CAUSALITY) ====================

  ipcMain.handle('eventLinks:list', async () => {
    try {
      const caseDb = currentCaseDb;
      const links = caseDb.prepare(`
        SELECT el.*,
          se.title as source_title, se.date as source_date,
          te.title as target_title, te.date as target_date
        FROM event_links el
        JOIN events se ON se.id = el.source_event_id
        JOIN events te ON te.id = el.target_event_id
      `).all();
      return { success: true, links };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('eventLinks:create', async (event, data) => {
    try {
      const caseDb = currentCaseDb;
      const id = uuidv4();

      // Calculate days between
      let daysBetween = null;
      if (data.sourceEventId && data.targetEventId) {
        const source = caseDb.prepare('SELECT date FROM events WHERE id = ?').get(data.sourceEventId);
        const target = caseDb.prepare('SELECT date FROM events WHERE id = ?').get(data.targetEventId);
        if (source?.date && target?.date) {
          daysBetween = Math.round((new Date(target.date) - new Date(source.date)) / (1000 * 60 * 60 * 24));
        }
      }

      caseDb.prepare(`
        INSERT INTO event_links (id, source_event_id, target_event_id, link_type, confidence, days_between)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, data.sourceEventId, data.targetEventId, data.linkType || 'related', data.confidence || 1.0, daysBetween);
      return { success: true, id };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('eventLinks:delete', async (event, linkId) => {
    try {
      const caseDb = currentCaseDb;
      caseDb.prepare('DELETE FROM event_links WHERE id = ?').run(linkId);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('eventLinks:suggest', async () => {
    try {
      const caseDb = currentCaseDb;
      // Load all events with tags and actors
      const events = caseDb.prepare('SELECT * FROM events ORDER BY date').all().map(evt => {
        const tags = caseDb.prepare('SELECT tag FROM event_tags WHERE event_id = ?').all(evt.id).map(r => r.tag);
        const actors = caseDb.prepare(`
          SELECT a.id, a.name FROM event_actors ea JOIN actors a ON ea.actor_id = a.id WHERE ea.event_id = ?
        `).all(evt.id);
        return { ...evt, tags, actors };
      });
      const existingLinks = caseDb.prepare('SELECT * FROM event_links').all();
      const suggestions = detectCausality(events, existingLinks);
      return { success: true, suggestions };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('eventTags:suggest', async (event, eventId) => {
    try {
      const caseDb = currentCaseDb;
      const evt = caseDb.prepare('SELECT title, description, what_happened FROM events WHERE id = ?').get(eventId);
      if (!evt) return { success: false, error: 'Event not found' };
      const tags = suggestTags(evt.title, evt.description, evt.what_happened);
      return { success: true, tags };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // ==================== INCIDENT EVENTS ====================

  ipcMain.handle('incidentEvents:list', async (event, incidentId) => {
    try {
      const caseDb = currentCaseDb;
      const items = caseDb.prepare(`
        SELECT e.*, ie.event_role
        FROM events e
        JOIN incident_events ie ON ie.event_id = e.id
        WHERE ie.incident_id = ?
        ORDER BY e.date
      `).all(incidentId);

      // Attach tags
      for (const evt of items) {
        try {
          evt.tags = caseDb.prepare('SELECT tag FROM event_tags WHERE event_id = ?').all(evt.id).map(r => r.tag);
        } catch (e) { evt.tags = []; }
      }

      return { success: true, events: items };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('incidentEvents:link', async (event, incidentId, eventId, eventRole) => {
    try {
      const caseDb = currentCaseDb;
      caseDb.prepare('INSERT INTO incident_events (id, incident_id, event_id, event_role) VALUES (?, ?, ?, ?)').run(
        uuidv4(), incidentId, eventId, eventRole || 'primary'
      );
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('incidentEvents:unlink', async (event, incidentId, eventId) => {
    try {
      const caseDb = currentCaseDb;
      caseDb.prepare('DELETE FROM incident_events WHERE incident_id = ? AND event_id = ?').run(incidentId, eventId);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // ==================== DOCUMENT COPY ====================

  ipcMain.handle('documents:copy', async (event, docId) => {
    try {
      const caseDb = currentCaseDb;

      const original = caseDb.prepare('SELECT * FROM documents WHERE id = ?').get(docId);
      if (!original) {
        return { success: false, error: 'Document not found' };
      }

      const newId = uuidv4();
      const newFilename = original.filename.replace(/(\.[^.]+)$/, ' (copy)$1');

      caseDb.prepare(`
        INSERT INTO documents (
          id, filename, original_path, file_type, file_size, sha256_hash,
          encrypted_content, metadata_json,
          file_created_at, file_modified_at,
          document_date, document_date_confidence, content_dates_json,
          extracted_text, ocr_text, evidence_type,
          evidence_confidence, evidence_secondary, evidence_scores_json,
          user_context, group_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        newId, newFilename, original.original_path, original.file_type, original.file_size, original.sha256_hash,
        original.encrypted_content, original.metadata_json,
        original.file_created_at, original.file_modified_at,
        original.document_date, original.document_date_confidence, original.content_dates_json,
        original.extracted_text, original.ocr_text, original.evidence_type,
        original.evidence_confidence, original.evidence_secondary, original.evidence_scores_json,
        original.user_context, original.group_id
      );

      const newDoc = caseDb.prepare('SELECT * FROM documents WHERE id = ?').get(newId);
      return { success: true, document: docToSummary(newDoc) };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // ==================== DAMAGES ====================

  ipcMain.handle('damages:list', async () => {
    try {
      const caseDb = currentCaseDb;
      if (!caseDb) return { success: false, error: 'No case open' };

      const damages = caseDb.prepare('SELECT * FROM damages ORDER BY date_from, created_at').all();
      return { success: true, damages };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('damages:create', async (event, data) => {
    try {
      const caseDb = currentCaseDb;
      if (!caseDb) return { success: false, error: 'No case open' };

      const id = uuidv4();
      caseDb.prepare(`
        INSERT INTO damages (id, category, description, amount, currency, date_from, date_to, is_ongoing, evidence_document_id, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, data.category, data.description || null, data.amount || null,
        data.currency || 'AUD', data.dateFrom || null, data.dateTo || null,
        data.isOngoing ? 1 : 0, data.evidenceDocumentId || null, data.notes || null
      );
      return { success: true, damage: { id, ...data } };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('damages:update', async (event, id, updates) => {
    try {
      const caseDb = currentCaseDb;
      if (!caseDb) return { success: false, error: 'No case open' };

      const fieldMap = {
        category: 'category',
        description: 'description',
        amount: 'amount',
        currency: 'currency',
        dateFrom: 'date_from',
        dateTo: 'date_to',
        isOngoing: 'is_ongoing',
        evidenceDocumentId: 'evidence_document_id',
        notes: 'notes'
      };

      const fields = [];
      const values = [];

      for (const [key, dbField] of Object.entries(fieldMap)) {
        if (updates[key] !== undefined) {
          fields.push(`${dbField} = ?`);
          values.push(updates[key]);
        }
      }

      fields.push("updated_at = datetime('now')");
      values.push(id);

      caseDb.prepare(`UPDATE damages SET ${fields.join(', ')} WHERE id = ?`).run(...values);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('damages:delete', async (event, id) => {
    try {
      const caseDb = currentCaseDb;
      if (!caseDb) return { success: false, error: 'No case open' };

      caseDb.prepare('DELETE FROM damages WHERE id = ?').run(id);
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
  // ==================== CATEGORIZER ====================

  ipcMain.handle('categorizer:categorize', async (event, text, isPrimary) => {
    try {
      const result = categorize(text, isPrimary || false);
      return { success: true, result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('categorizer:buildChain', async (event, entries) => {
    try {
      const result = categorizeAndBuildChain(entries);
      return { success: true, ...result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('categorizer:analyzeDocuments', async () => {
    try {
      if (!currentCaseDb) {
        return { success: false, error: 'No case is open' };
      }

      // Pull all documents with extracted text
      const docs = currentCaseDb.prepare(`
        SELECT id, filename, extracted_text, ocr_text, evidence_type, document_date
        FROM documents
        WHERE extracted_text IS NOT NULL OR ocr_text IS NOT NULL
        ORDER BY document_date ASC, ingested_at ASC
      `).all();

      if (docs.length === 0) {
        return { success: true, categorized: [], chain: null, summary: null };
      }

      // Also pull incidents to find the primary one
      const incidents = currentCaseDb.prepare(`
        SELECT id, title, description, incident_date
        FROM incidents
        ORDER BY incident_date ASC
        LIMIT 1
      `).all();

      const primaryIncidentId = incidents.length > 0 ? incidents[0].id : null;

      // Find the primary incident document — use incident_documents link if available,
      // otherwise fall back to earliest INCIDENT-type document
      let primaryDocId = null;
      if (primaryIncidentId) {
        const linked = currentCaseDb.prepare(`
          SELECT document_id FROM incident_documents WHERE incident_id = ?
          ORDER BY rowid ASC LIMIT 1
        `).get(primaryIncidentId);
        if (linked) primaryDocId = linked.document_id;
      }
      if (!primaryDocId) {
        const incidentDoc = docs.find(d => d.evidence_type === 'INCIDENT');
        if (incidentDoc) primaryDocId = incidentDoc.id;
      }

      // Build entries for the categorizer
      const entries = docs.map(doc => {
        const text = [doc.extracted_text, doc.ocr_text].filter(Boolean).join('\n');
        const isPrimary = doc.id === primaryDocId;
        return { text, isPrimary, docId: doc.id, filename: doc.filename, date: doc.document_date };
      });

      // Categorize each
      const categorized = entries.map(e => {
        const result = categorize(e.text, e.isPrimary);
        result.docId = e.docId;
        result.filename = e.filename;
        result.documentDate = e.date;
        return result;
      });

      // Build chain
      const chain = buildChain(categorized);
      const summary = chain.toSummary();

      return { success: true, categorized, summary };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // ==================== CONTEXT DOCUMENTS ====================

  ipcMain.handle('contextDocs:list', async () => {
    try {
      if (!currentCaseDb) return { success: false, error: 'No case open' };
      const docs = contextStore.listContextDocuments(currentCaseDb);
      return { success: true, documents: docs };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('contextDocs:ingest', async (event, { text, filename, docType, displayName, dateEffective, notes }) => {
    try {
      if (!currentCaseDb) return { success: false, error: 'No case open' };
      const result = contextStore.ingestContextDocument(currentCaseDb, {
        text, filename, docType, displayName, dateEffective, notes
      });
      return { success: true, ...result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('contextDocs:ingestFile', async (event, { filePath, docType, displayName, dateEffective, notes }) => {
    try {
      if (!currentCaseDb) return { success: false, error: 'No case open' };
      const path = require('path');
      const filename = path.basename(filePath);
      const ext = path.extname(filePath).toLowerCase();

      const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.heic', '.heif', '.tiff', '.tif', '.svg'];
      const pdfExts = ['.pdf'];
      let fileContent;

      if (imageExts.includes(ext)) {
        // Run OCR on image files (policy docs are often photos of printed text)
        const { runOcr } = require('./ingest/ocr-engine');
        const rawBuffer = fs.readFileSync(filePath);
        const ocrText = await runOcr(rawBuffer, `image/${ext.slice(1)}`);
        if (ocrText && ocrText.length > 10) {
          fileContent = ocrText;
          console.log(`[contextDocs] OCR extracted ${ocrText.length} chars from ${filename}`);
        } else {
          fileContent = `[Image file: ${filename}]\nType: ${ext.slice(1).toUpperCase()}\nUploaded as supporting evidence.\n(OCR could not extract readable text from this image.)`;
          console.log(`[contextDocs] OCR got minimal text from ${filename}, stored as image reference`);
        }
      } else if (pdfExts.includes(ext)) {
        // Extract text from PDFs using pdf-parse
        const pdfParse = require('pdf-parse');
        const rawBuffer = fs.readFileSync(filePath);
        try {
          const pdfData = await pdfParse(rawBuffer);
          fileContent = (pdfData.text || '').trim();
          console.log(`[contextDocs] PDF extracted ${fileContent.length} chars from ${filename}`);
          // If PDF has very little text it might be a scanned doc — try OCR
          if (fileContent.length < 50) {
            console.log(`[contextDocs] PDF text too short, likely scanned — skipping OCR for PDFs`);
            if (fileContent.length === 0) {
              fileContent = `[Scanned PDF: ${filename}]\nThis PDF appears to be a scanned document with no extractable text.\nPage count: ${pdfData.numpages || 'unknown'}`;
            }
          }
        } catch (pdfErr) {
          console.error(`[contextDocs] PDF parse failed for ${filename}:`, pdfErr.message);
          fileContent = `[PDF file: ${filename}]\nCould not extract text from this PDF.`;
        }
      } else {
        fileContent = fs.readFileSync(filePath, 'utf-8');
      }

      const result = contextStore.ingestContextDocument(currentCaseDb, {
        text: fileContent,
        filename,
        docType,
        displayName: displayName || path.parse(filePath).name,
        dateEffective,
        notes
      });
      return { success: true, ...result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('contextDocs:delete', async (event, docId) => {
    try {
      if (!currentCaseDb) return { success: false, error: 'No case open' };
      contextStore.deleteContextDocument(currentCaseDb, docId);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('contextDocs:toggleActive', async (event, docId, isActive) => {
    try {
      if (!currentCaseDb) return { success: false, error: 'No case open' };
      contextStore.toggleContextDocumentActive(currentCaseDb, docId, isActive);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('contextDocs:get', async (event, docId) => {
    try {
      if (!currentCaseDb) return { success: false, error: 'No case open' };
      const doc = contextStore.getContextDocument(currentCaseDb, docId);
      return doc ? { success: true, document: doc } : { success: false, error: 'Not found' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('contextDocs:search', async (event, query) => {
    try {
      if (!currentCaseDb) return { success: false, error: 'No case open' };
      const results = contextStore.searchContextDocuments(currentCaseDb, query);
      return { success: true, results };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('contextDocs:signalsSummary', async () => {
    try {
      if (!currentCaseDb) return { success: false, error: 'No case open' };
      const summary = contextStore.activeSignalsSummary(currentCaseDb);
      return { success: true, summary };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('contextDocs:types', async () => {
    return { success: true, types: contextStore.DOCUMENT_TYPES };
  });

  // ==================== SETTINGS ====================

  ipcMain.handle('settings:get', async (event, key) => {
    try {
      const value = db.getSetting(key);
      return { success: true, value };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('settings:set', async (event, key, value) => {
    try {
      db.setSetting(key, value);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // ==================== ASSESSOR ====================
  console.log('[IPC] Registering assessor handlers...');

  ipcMain.handle('assessor:assess', async (event, { inputText, docType }) => {
    try {
      if (!currentCaseDb) return { success: false, error: 'No case open' };

      const apiKey = db.getSetting('anthropic_api_key');
      console.log('[Assessor] assess called, docType=' + docType + ', hasKey=' + !!apiKey + ', textLen=' + (inputText?.length || 0));

      // Gather vault incidents
      let vaultIncidents = [];
      try {
        const incidents = currentCaseDb.prepare('SELECT * FROM incidents').all();
        vaultIncidents = incidents.map(inc => ({
          incident_type: inc.incident_type,
          incident_severity: inc.computed_severity || inc.base_severity,
          harasser_role: null,
          harasser_in_reporting_chain: false,
          reports: [],
          employer_liability: {
            level: 'unknown',
            signals: inc.involves_retaliation ? ['potential_retaliation_post_report'] : [],
          },
        }));
      } catch (e) { /* no incidents table yet */ }

      const assessor = new DocumentAssessor(apiKey || null);

      // Wrap the entire assess call in a 45s timeout to prevent hangs
      const result = await Promise.race([
        assessor.assess({
          inputText,
          docType,
          vaultIncidents,
          caseDb: currentCaseDb,
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Assessment timed out after 45 seconds. Try again or check your API key in Settings.')), 45000)
        ),
      ]);

      console.log('[Assessor] assess completed, flags=' + (result.auto_flags?.length || 0));
      return { success: true, result };
    } catch (error) {
      console.error('[Assessor] assess error:', error.message);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('assessor:expandFlag', async (event, { flag, inputText }) => {
    try {
      if (!currentCaseDb) return { success: false, error: 'No case open' };
      const apiKey = db.getSetting('anthropic_api_key');
      if (!apiKey) return { success: false, error: 'API key not configured. Set it in Settings.' };

      let vaultIncidents = [];
      try {
        const incidents = currentCaseDb.prepare('SELECT * FROM incidents').all();
        vaultIncidents = incidents.map(inc => ({
          incident_type: inc.incident_type,
          incident_severity: inc.computed_severity || inc.base_severity,
          employer_liability: {
            level: 'unknown',
            signals: inc.involves_retaliation ? ['potential_retaliation_post_report'] : [],
          },
        }));
      } catch (e) {}

      const assessor = new DocumentAssessor(apiKey);
      const analysis = await assessor.expandFlag(flag, {
        inputText,
        vaultIncidents,
        caseDb: currentCaseDb,
      });

      return { success: true, analysis };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('assessor:deepAnalysis', async (event, { result, inputText }) => {
    try {
      if (!currentCaseDb) return { success: false, error: 'No case open' };
      const apiKey = db.getSetting('anthropic_api_key');
      if (!apiKey) return { success: false, error: 'API key not configured. Set it in Settings.' };

      let vaultIncidents = [];
      try {
        const incidents = currentCaseDb.prepare('SELECT * FROM incidents').all();
        vaultIncidents = incidents.map(inc => ({
          incident_type: inc.incident_type,
          incident_severity: inc.computed_severity || inc.base_severity,
          employer_liability: {
            level: 'unknown',
            signals: inc.involves_retaliation ? ['potential_retaliation_post_report'] : [],
          },
        }));
      } catch (e) {}

      const assessor = new DocumentAssessor(apiKey);
      const memo = await assessor.requestDeepAnalysis(result, {
        inputText,
        vaultIncidents,
        caseDb: currentCaseDb,
      });

      return { success: true, memo };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('assessor:inputTypes', async () => {
    return { success: true, types: DOCUMENT_INPUT_TYPES };
  });

  // ==================== SESSION-9B: CRUD HELPERS ====================

  ipcMain.handle('events:get', async (event, caseId, eventId) => {
    try {
      const caseDb = currentCaseDb;
      const evt = caseDb.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
      if (!evt) return { success: false, error: 'Event not found' };
      return { success: true, event: evt };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('events:getTags', async (event, caseId, eventId) => {
    try {
      const caseDb = currentCaseDb;
      const tags = caseDb.prepare('SELECT tag FROM event_tags WHERE event_id = ?').all(eventId).map(r => r.tag);
      return { success: true, tags };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('events:updateTags', async (event, caseId, eventId, tags) => {
    try {
      const caseDb = currentCaseDb;
      caseDb.prepare('DELETE FROM event_tags WHERE event_id = ?').run(eventId);
      const stmt = caseDb.prepare('INSERT INTO event_tags (id, event_id, tag) VALUES (?, ?, ?)');
      for (const tag of (tags || [])) {
        stmt.run(uuidv4(), eventId, tag);
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('events:getLinkedDocuments', async (event, caseId, eventId) => {
    try {
      const caseDb = currentCaseDb;
      const documents = caseDb.prepare(`
        SELECT d.* FROM documents d
        JOIN event_documents ed ON ed.document_id = d.id
        WHERE ed.event_id = ?
        ORDER BY d.document_date DESC
      `).all(eventId);
      return { success: true, documents };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  console.log('[IPC] All handlers registered successfully');
}

function closeCurrentCase() {
  if (currentCaseDb) {
    currentCaseDb.close();
    currentCaseDb = null;
    currentCaseId = null;
    actorRegistry = null;
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
