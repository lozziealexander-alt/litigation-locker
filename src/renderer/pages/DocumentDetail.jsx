import React, { useState, useEffect } from 'react';
import { EVIDENCE_COLORS, EVIDENCE_ICONS } from './Timeline';

const EVIDENCE_TYPES = [
  'email', 'screenshot', 'chat_screenshot', 'photo',
  'performance_review', 'hr_document', 'pay_record',
  'legal_document', 'policy', 'contract', 'medical_record',
  'letter', 'meeting_notes', 'chat_export', 'text_document',
  'document', 'other'
];

export default function DocumentDetail({ docSummary, onClose, onUpdate }) {
  const [doc, setDoc] = useState(null);
  const [context, setContext] = useState('');
  const [savedConfirm, setSavedConfirm] = useState(false);
  const [editingDate, setEditingDate] = useState(false);
  const [dateInput, setDateInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    if (docSummary?.id) loadDocument(docSummary.id);
  }, [docSummary?.id]);

  // Clear saved confirmation after 3s
  useEffect(() => {
    if (!savedConfirm) return;
    const t = setTimeout(() => setSavedConfirm(false), 3000);
    return () => clearTimeout(t);
  }, [savedConfirm]);

  async function loadDocument(id) {
    const result = await window.api.documents.get(id);
    if (result.success && result.document) {
      setDoc(result.document);
      setContext(result.document.user_context || '');
      setDateInput(result.document.document_date?.slice(0, 10) || '');
      setNameInput(result.document.filename || '');
    }
  }

  async function saveContext() {
    if (!doc) return;
    setSaving(true);
    await window.api.documents.updateContext(doc.id, context);
    setSaving(false);
    setSavedConfirm(true);
    if (onUpdate) onUpdate();
  }

  async function saveDate() {
    if (!doc) return;
    const isoDate = dateInput ? new Date(dateInput + 'T12:00:00Z').toISOString() : null;
    await window.api.documents.updateDate(doc.id, isoDate, isoDate ? 'exact' : 'undated');
    setDoc({ ...doc, document_date: isoDate, document_date_confidence: isoDate ? 'exact' : 'undated' });
    setEditingDate(false);
    if (onUpdate) onUpdate();
  }

  async function saveName() {
    if (!doc || !nameInput.trim()) return;
    await window.api.documents.rename(doc.id, nameInput.trim());
    setDoc({ ...doc, filename: nameInput.trim() });
    setEditingName(false);
    if (onUpdate) onUpdate();
  }

  async function changeType(newType) {
    if (!doc) return;
    await window.api.documents.updateType(doc.id, newType);
    setDoc({ ...doc, evidence_type: newType });
    if (onUpdate) onUpdate();
  }

  async function openPreview() {
    if (!doc) return;
    setPreviewLoading(true);
    setPreviewOpen(true);

    const result = await window.api.documents.getContent(doc.id);
    if (result.success) {
      setPreviewData({ data: result.data, mimeType: result.mimeType });
    } else {
      setPreviewData(null);
    }
    setPreviewLoading(false);
  }

  if (!doc) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>Loading...</div>
      </div>
    );
  }

  const metadata = safeParseJson(doc.metadata_json);
  const contentDates = safeParseJson(doc.content_dates_json);
  const color = EVIDENCE_COLORS[doc.evidence_type] || '#6b7280';

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <button onClick={onClose} style={styles.closeBtn}>{'\u2190'} Timeline</button>
      </div>

      <div style={styles.body}>
        {/* Title area with rename */}
        <div style={styles.titleArea}>
          <span style={{ fontSize: '24px' }}>
            {EVIDENCE_ICONS[doc.evidence_type] || '\uD83D\uDCCE'}
          </span>
          <div style={{ flex: 1 }}>
            {editingName ? (
              <div style={styles.renameRow}>
                <input
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveName();
                    if (e.key === 'Escape') { setEditingName(false); setNameInput(doc.filename); }
                  }}
                  style={styles.renameInput}
                  autoFocus
                />
                <button onClick={saveName} style={styles.saveBtn}>Save</button>
                <button onClick={() => { setEditingName(false); setNameInput(doc.filename); }} style={styles.cancelBtn}>Cancel</button>
              </div>
            ) : (
              <div style={styles.nameRow}>
                <h3 style={styles.filename}>{doc.filename}</h3>
                <button onClick={() => setEditingName(true)} style={styles.editBtn} title="Rename document">
                  {'\u270E'}
                </button>
              </div>
            )}
            <div style={styles.meta}>
              <span style={{ ...styles.typeBadge, background: color + '20', color }}>
                {doc.evidence_type?.replace(/_/g, ' ')}
              </span>
              <span style={styles.size}>{formatSize(doc.file_size)}</span>
              <span style={styles.hash} title={doc.sha256_hash}>
                SHA: {doc.sha256_hash?.slice(0, 8)}
              </span>
            </div>
          </div>
        </div>

        {/* Preview button */}
        <button onClick={openPreview} style={styles.previewBtn}>
          {'\uD83D\uDD0D'} View Document
        </button>

        {/* Date section */}
        <div style={styles.section}>
          <h4 style={styles.sectionTitle}>Document Date</h4>
          {editingDate ? (
            <div style={styles.dateEditRow}>
              <input
                type="date"
                value={dateInput}
                onChange={(e) => setDateInput(e.target.value)}
                style={styles.dateInput}
              />
              <button onClick={saveDate} style={styles.saveBtn}>Save</button>
              <button onClick={() => setEditingDate(false)} style={styles.cancelBtn}>Cancel</button>
            </div>
          ) : (
            <div style={styles.dateRow}>
              <span style={styles.dateValue}>
                {doc.document_date
                  ? formatDate(doc.document_date)
                  : 'No date assigned'}
              </span>
              {doc.document_date_confidence && doc.document_date_confidence !== 'exact' && (
                <span style={{
                  ...styles.confidenceTag,
                  color: doc.document_date_confidence === 'approximate' ? '#f59e0b' : '#ef4444'
                }}>
                  {doc.document_date_confidence}
                </span>
              )}
              <button onClick={() => setEditingDate(true)} style={styles.editBtn}>Edit</button>
            </div>
          )}

          {/* File dates */}
          <div style={styles.fileDates}>
            <span style={styles.fileDate}>Created: {formatDate(doc.file_created_at)}</span>
            <span style={styles.fileDate}>Modified: {formatDate(doc.file_modified_at)}</span>
          </div>
        </div>

        {/* Evidence type selector */}
        <div style={styles.section}>
          <h4 style={styles.sectionTitle}>Evidence Type</h4>
          <select
            value={doc.evidence_type || 'other'}
            onChange={(e) => changeType(e.target.value)}
            style={styles.select}
          >
            {EVIDENCE_TYPES.map(t => (
              <option key={t} value={t}>
                {EVIDENCE_ICONS[t] || ''} {t.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>

        {/* Content dates found */}
        {contentDates && contentDates.length > 0 && (
          <div style={styles.section}>
            <h4 style={styles.sectionTitle}>Dates Found in Content</h4>
            <div style={styles.dateList}>
              {contentDates.map((cd, i) => (
                <div key={i} style={styles.contentDate}>
                  <span style={styles.contentDateValue}>{formatDate(cd.date)}</span>
                  <span style={styles.contentDateText}>"{cd.text}"</span>
                  <span style={styles.contentDateConf}>{cd.confidence}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Metadata */}
        {metadata && Object.keys(metadata).length > 0 && (
          <div style={styles.section}>
            <h4 style={styles.sectionTitle}>Metadata</h4>
            <div style={styles.metadataGrid}>
              {renderMetadata(metadata)}
            </div>
          </div>
        )}

        {/* User context / notes */}
        <div style={styles.section}>
          <h4 style={styles.sectionTitle}>Your Notes</h4>
          <textarea
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="Why is this document important? What does it prove?"
            style={styles.textarea}
            rows={4}
          />
          <div style={styles.notesActions}>
            <button
              onClick={saveContext}
              disabled={saving}
              style={styles.saveBtn}
            >
              {saving ? 'Saving...' : 'Save Notes'}
            </button>
            {savedConfirm && (
              <span style={styles.savedConfirm}>{'\u2713'} Notes saved</span>
            )}
          </div>
        </div>

        {/* Extracted text preview */}
        {(doc.extracted_text || doc.ocr_text) && (
          <div style={styles.section}>
            <h4 style={styles.sectionTitle}>
              {doc.ocr_text ? 'OCR Text' : 'Extracted Text'}
            </h4>
            <pre style={styles.textPreview}>
              {(doc.ocr_text || doc.extracted_text || '').slice(0, 2000)}
              {(doc.ocr_text || doc.extracted_text || '').length > 2000 && '\n\n... (truncated)'}
            </pre>
          </div>
        )}
      </div>

      {/* Full-screen document preview overlay */}
      {previewOpen && (
        <div style={styles.overlay} onClick={() => setPreviewOpen(false)}>
          <div style={styles.overlayContent} onClick={(e) => e.stopPropagation()}>
            <div style={styles.overlayHeader}>
              <span style={styles.overlayTitle}>{doc.filename}</span>
              <button onClick={() => setPreviewOpen(false)} style={styles.overlayClose}>{'\u2715'}</button>
            </div>
            <div style={styles.overlayBody}>
              {previewLoading ? (
                <div style={styles.overlayLoading}>Loading document...</div>
              ) : previewData ? (
                renderPreview(previewData, doc)
              ) : (
                <div style={styles.overlayLoading}>Could not load document preview.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function renderPreview(previewData, doc) {
  const { data, mimeType } = previewData;
  const dataUrl = `data:${mimeType};base64,${data}`;

  if (mimeType.startsWith('image/')) {
    return (
      <img
        src={dataUrl}
        alt={doc.filename}
        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
      />
    );
  }

  if (mimeType === 'application/pdf') {
    return (
      <embed
        src={dataUrl}
        type="application/pdf"
        style={{ width: '100%', height: '100%' }}
      />
    );
  }

  if (mimeType.startsWith('text/') || mimeType === 'message/rfc822') {
    // Decode base64 to text
    try {
      const text = atob(data);
      return (
        <pre style={{
          padding: '20px', color: '#ccc', fontSize: '13px',
          fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          overflow: 'auto', height: '100%'
        }}>
          {text}
        </pre>
      );
    } catch {
      return <div style={{ padding: '20px', color: '#888' }}>Cannot render this file type as text.</div>;
    }
  }

  // Fallback for unsupported types
  return (
    <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>
      <p style={{ fontSize: '48px', marginBottom: '16px' }}>
        {EVIDENCE_ICONS[doc.evidence_type] || '\uD83D\uDCCE'}
      </p>
      <p>Preview not available for {mimeType}</p>
      <p style={{ fontSize: '13px', marginTop: '8px', color: '#555' }}>
        {formatSize(doc.file_size)}
      </p>
    </div>
  );
}

function formatDate(iso) {
  if (!iso) return 'Unknown';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    timeZone: 'UTC'
  });
}

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function safeParseJson(str) {
  if (!str) return null;
  try { return JSON.parse(str); } catch { return null; }
}

function renderMetadata(obj, prefix = '') {
  const items = [];
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'object' && !Array.isArray(value)) {
      items.push(...renderMetadata(value, prefix + key + '.'));
    } else {
      const display = Array.isArray(value) ? JSON.stringify(value) : String(value);
      if (display.length > 200) continue;
      items.push(
        <div key={prefix + key} style={metaStyles.row}>
          <span style={metaStyles.key}>{prefix + key}</span>
          <span style={metaStyles.value}>{display}</span>
        </div>
      );
    }
  }
  return items;
}

const metaStyles = {
  row: { display: 'flex', gap: '8px', fontSize: '12px', padding: '2px 0' },
  key: { color: '#888', minWidth: '100px', flexShrink: 0 },
  value: { color: '#ccc', wordBreak: 'break-word' }
};

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: '#1e1e38',
    borderLeft: '1px solid #2a2a4a',
    position: 'relative'
  },
  loading: {
    padding: '40px',
    textAlign: 'center',
    color: '#888'
  },
  header: {
    padding: '12px 16px',
    borderBottom: '1px solid #2a2a4a'
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: '#3b82f6',
    fontSize: '13px',
    cursor: 'pointer',
    padding: '4px 0'
  },
  body: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px'
  },
  titleArea: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    marginBottom: '12px'
  },
  nameRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  filename: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#f5f0eb',
    margin: '0 0 4px 0',
    wordBreak: 'break-word'
  },
  renameRow: {
    display: 'flex',
    gap: '6px',
    alignItems: 'center',
    marginBottom: '4px'
  },
  renameInput: {
    flex: 1,
    background: '#1a1a2e',
    border: '1px solid #3b82f6',
    borderRadius: '6px',
    padding: '6px 10px',
    color: '#f5f0eb',
    fontSize: '14px',
    fontWeight: 600,
    outline: 'none'
  },
  meta: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap'
  },
  typeBadge: {
    fontSize: '11px',
    padding: '2px 8px',
    borderRadius: '4px',
    textTransform: 'capitalize',
    fontWeight: 500
  },
  size: { fontSize: '11px', color: '#888' },
  hash: { fontSize: '11px', color: '#555', fontFamily: 'monospace' },
  previewBtn: {
    width: '100%',
    background: '#252542',
    border: '1px solid #3b82f6',
    borderRadius: '8px',
    padding: '10px',
    color: '#3b82f6',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    marginBottom: '16px',
    transition: 'background 0.15s'
  },
  section: {
    marginBottom: '20px',
    padding: '12px',
    background: '#252542',
    borderRadius: '8px'
  },
  sectionTitle: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    margin: '0 0 8px 0'
  },
  dateRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  dateValue: {
    fontSize: '14px',
    color: '#f5f0eb'
  },
  confidenceTag: {
    fontSize: '11px',
    fontStyle: 'italic'
  },
  editBtn: {
    background: 'none',
    border: '1px solid #444',
    color: '#888',
    fontSize: '11px',
    padding: '2px 8px',
    borderRadius: '4px',
    cursor: 'pointer',
    marginLeft: 'auto'
  },
  dateEditRow: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center'
  },
  dateInput: {
    background: '#1a1a2e',
    border: '1px solid #444',
    borderRadius: '6px',
    padding: '6px 10px',
    color: '#f5f0eb',
    fontSize: '13px'
  },
  fileDates: {
    display: 'flex',
    gap: '16px',
    marginTop: '8px'
  },
  fileDate: {
    fontSize: '11px',
    color: '#666'
  },
  select: {
    width: '100%',
    background: '#1a1a2e',
    border: '1px solid #444',
    borderRadius: '6px',
    padding: '8px 10px',
    color: '#f5f0eb',
    fontSize: '13px',
    textTransform: 'capitalize'
  },
  dateList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px'
  },
  contentDate: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '12px'
  },
  contentDateValue: {
    color: '#f5f0eb',
    minWidth: '100px'
  },
  contentDateText: {
    color: '#888',
    fontStyle: 'italic',
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  contentDateConf: {
    color: '#555',
    fontSize: '10px'
  },
  metadataGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px'
  },
  textarea: {
    width: '100%',
    background: '#1a1a2e',
    border: '1px solid #444',
    borderRadius: '6px',
    padding: '10px',
    color: '#f5f0eb',
    fontSize: '13px',
    resize: 'vertical',
    fontFamily: 'inherit'
  },
  notesActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginTop: '8px'
  },
  saveBtn: {
    background: '#3b82f6',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    padding: '6px 16px',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer'
  },
  savedConfirm: {
    color: '#22c55e',
    fontSize: '12px',
    fontWeight: 500
  },
  cancelBtn: {
    background: '#333',
    color: '#ccc',
    border: 'none',
    borderRadius: '6px',
    padding: '6px 16px',
    fontSize: '12px',
    cursor: 'pointer'
  },
  textPreview: {
    background: '#1a1a2e',
    borderRadius: '6px',
    padding: '10px',
    fontSize: '11px',
    color: '#aaa',
    fontFamily: 'monospace',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    maxHeight: '300px',
    overflowY: 'auto',
    margin: 0
  },
  // Full-screen overlay
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.85)',
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  overlayContent: {
    background: '#1e1e38',
    borderRadius: '12px',
    border: '1px solid #2a2a4a',
    width: '90vw',
    height: '85vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden'
  },
  overlayHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 20px',
    borderBottom: '1px solid #2a2a4a',
    flexShrink: 0
  },
  overlayTitle: {
    color: '#f5f0eb',
    fontSize: '14px',
    fontWeight: 500
  },
  overlayClose: {
    background: 'none',
    border: 'none',
    color: '#888',
    fontSize: '18px',
    cursor: 'pointer',
    padding: '4px 8px'
  },
  overlayBody: {
    flex: 1,
    overflow: 'auto',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px'
  },
  overlayLoading: {
    color: '#888',
    fontSize: '14px'
  }
};
