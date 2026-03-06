const { ipcMain, dialog } = require('electron');
const fs = require('fs');
const keyManager = require('./crypto/key-derivation');
const { burn, verifyBurn } = require('./crypto/kill-switch');
const db = require('./database/init');
const { processFiles } = require('./ingest/file-processor');
const { analyzeConnections, detectEscalationPattern } = require('./analysis/timeline-connections');
const { analyzeAllPrecedents, getDocumentPrecedentBadges } = require('./analysis/precedent-matcher');
const { classifyEvidence } = require('./ingest/evidence-classifier');

// Track currently open case
let currentCaseDb = null;
let currentCaseId = null;

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

      const inserted = [];
      for (const doc of documents) {
        // Check for duplicate by hash
        const existing = currentCaseDb.prepare(
          'SELECT id FROM documents WHERE sha256_hash = ?'
        ).get(doc.sha256_hash);

        if (existing) {
          errors.push({ file: doc.filename, error: 'Duplicate file (already ingested)' });
          continue;
        }

        insertStmt.run(
          doc.id, doc.filename, doc.original_path, doc.file_type, doc.file_size, doc.sha256_hash,
          doc.encrypted_content, doc.metadata_json,
          doc.file_created_at, doc.file_modified_at,
          doc.document_date, doc.document_date_confidence, doc.content_dates_json,
          doc.extracted_text, doc.ocr_text, doc.evidence_type,
          doc.evidence_confidence, doc.evidence_secondary, doc.evidence_scores_json
        );
        inserted.push(docToSummary(doc));
      }

      console.log('[IPC] inserted', inserted.length, 'documents successfully');
      return { success: true, documents: inserted, errors };
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

  // ==================== FILE DIALOG ====================

  ipcMain.handle('dialog:openFiles', async () => {
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

  ipcMain.handle('precedents:analyze', async () => {
    try {
      if (!currentCaseDb) {
        return { success: false, error: 'No case is open' };
      }

      const documents = currentCaseDb.prepare(`
        SELECT id, filename, file_type, file_size, evidence_type,
               evidence_confidence, evidence_secondary,
               document_date, document_date_confidence,
               user_context
        FROM documents
        ORDER BY document_date ASC
      `).all();

      // We don't have actors/incidents tables populated yet
      const incidents = [];
      const actors = [];

      const analysis = analyzeAllPrecedents(documents, incidents, actors);

      return { success: true, analysis };
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

      const analysis = analyzeAllPrecedents(documents, [], []);
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
