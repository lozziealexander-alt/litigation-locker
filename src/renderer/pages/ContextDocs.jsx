import React, { useState, useEffect } from 'react';
import { colors, shadows, spacing, typography, radius } from '../styles/tokens';

const SIGNAL_LABELS = {
  pip_requires_prior_warning: 'PIP requires prior warning',
  pip_requires_documentation: 'PIP requires documentation',
  pip_employee_has_right_to_respond: 'Employee right to respond',
  pip_requires_specific_metrics: 'PIP requires specific metrics',
  has_anti_harassment_policy: 'Anti-harassment policy',
  harassment_reporting_procedure: 'Harassment reporting procedure',
  non_retaliation_clause: 'Non-retaliation clause',
  at_will_employment: 'At-will employment',
  for_cause_termination_required: 'For-cause termination required',
  arbitration_required: 'Arbitration required',
  class_action_waiver: 'Class action waiver',
  fmla_rights_documented: 'FMLA rights documented',
};

export default function ContextDocs() {
  const [documents, setDocuments] = useState([]);
  const [docTypes, setDocTypes] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [showUpload, setShowUpload] = useState(false);

  // Upload form state
  const [pasteText, setPasteText] = useState('');
  const [docType, setDocType] = useState('other_policy');
  const [displayName, setDisplayName] = useState('');
  const [uploading, setUploading] = useState(false);

  // Drag-and-drop state
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [docsResult, typesResult] = await Promise.all([
        window.api.contextDocs.list(),
        window.api.contextDocs.types()
      ]);
      if (docsResult.success) setDocuments(docsResult.documents);
      if (typesResult.success) setDocTypes(typesResult.types);
    } catch (err) {
      console.error('Failed to load context docs:', err);
    }
    setLoading(false);
  }

  function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }

  function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }

  async function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    setUploading(true);
    for (const file of files) {
      try {
        // Electron: get real file path via webUtils
        const filePath = window.api.getPathForFile
          ? window.api.getPathForFile(file)
          : file.name;
        await window.api.contextDocs.ingestFile({
          filePath,
          docType,
          displayName: displayName || undefined,
        });
      } catch (err) {
        console.error('Failed to ingest dropped file:', err);
      }
    }
    setUploading(false);
    setDisplayName('');
    await loadData();
  }

  async function handleUploadFile() {
    const result = await window.api.dialog.openFiles();
    if (!result || result.length === 0) return;
    setUploading(true);
    for (const filePath of result) {
      await window.api.contextDocs.ingestFile({
        filePath,
        docType,
        displayName: displayName || undefined,
      });
    }
    setUploading(false);
    setDisplayName('');
    await loadData();
  }

  async function handleUploadPaste() {
    if (!pasteText.trim()) return;
    setUploading(true);
    await window.api.contextDocs.ingest({
      text: pasteText,
      filename: 'pasted.txt',
      docType,
      displayName: displayName || 'Pasted document',
    });
    setUploading(false);
    setPasteText('');
    setDisplayName('');
    await loadData();
  }

  async function handleToggle(docId, currentActive) {
    await window.api.contextDocs.toggleActive(docId, !currentActive);
    await loadData();
  }

  async function handleDelete(docId) {
    if (!confirm('Remove this document from your context library?')) return;
    await window.api.contextDocs.delete(docId);
    if (selectedDoc?.doc_id === docId) setSelectedDoc(null);
    await loadData();
  }

  async function handleViewDoc(docId) {
    const result = await window.api.contextDocs.get(docId);
    if (result.success) setSelectedDoc(result.document);
  }

  const s = getStyles();

  if (loading) {
    return (
      <div style={s.container}>
        <div style={s.loading}>Loading context documents...</div>
      </div>
    );
  }

  return (
    <div
      style={s.container}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Full-page drag overlay */}
      {dragOver && (
        <div style={s.dragOverlay}>
          <div style={s.dragContent}>
            <div style={s.dragIcon}>&#x1F4C4;</div>
            <p style={s.dragText}>Drop files to upload</p>
            <p style={s.dragHint}>PDF, DOC, TXT, or other document files</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={s.header}>
        <div>
          <h1 style={s.title}>Context Documents</h1>
          <p style={s.subtitle}>
            Upload policies, agreements, and handbooks. These inform all document assessments.
          </p>
        </div>
        <button style={s.uploadBtn} onClick={() => setShowUpload(!showUpload)}>
          {showUpload ? 'Close' : '+ Upload Document'}
        </button>
      </div>

      {/* Upload panel */}
      {showUpload && (
        <div style={s.uploadPanel}>
          <div style={s.uploadRow}>
            <div style={s.fieldGroup}>
              <label style={s.label}>Document Type</label>
              <select
                style={s.select}
                value={docType}
                onChange={e => setDocType(e.target.value)}
              >
                {Object.entries(docTypes).map(([key, label]) => (
                  <option key={key} value={key} style={{ background: '#fff', color: '#1a1a1a' }}>{label}</option>
                ))}
              </select>
            </div>
            <div style={s.fieldGroup}>
              <label style={s.label}>Display Name (optional)</label>
              <input
                style={s.input}
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="e.g. Employee Handbook 2024"
              />
            </div>
          </div>

          {/* Drop zone */}
          <div
            style={s.dropZone}
            onClick={handleUploadFile}
          >
            {uploading ? (
              <span style={s.dropText}>Uploading...</span>
            ) : (
              <>
                <span style={s.dropIcon}>&#x2B06;&#xFE0F;</span>
                <span style={s.dropText}>Drag files here or click to browse</span>
                <span style={s.dropHint}>Supports PDF, DOCX, TXT, and other document formats</span>
              </>
            )}
          </div>

          <div style={s.pasteSection}>
            <label style={s.label}>Or paste document text:</label>
            <textarea
              style={s.textarea}
              value={pasteText}
              onChange={e => setPasteText(e.target.value)}
              placeholder="Paste policy text, agreement text, or any reference document..."
              rows={4}
            />
            <button
              style={{ ...s.fileBtn, marginTop: spacing.sm, opacity: pasteText.trim() ? 1 : 0.5 }}
              onClick={handleUploadPaste}
              disabled={uploading || !pasteText.trim()}
            >
              Save Pasted Text
            </button>
          </div>
        </div>
      )}

      {/* Document list */}
      <div style={s.content}>
        <div style={s.listPane}>
          {documents.length === 0 ? (
            <div style={s.empty} onClick={() => setShowUpload(true)}>
              <div style={s.emptyIcon}>&#x1F4C1;</div>
              <p style={s.emptyText}>No context documents yet</p>
              <p style={s.emptyHint}>Drag and drop files here, or click to upload</p>
              <p style={s.emptyHint}>Policies, handbooks, and agreements enhance assessments</p>
            </div>
          ) : (
            documents.map(doc => (
              <div
                key={doc.doc_id}
                style={{
                  ...s.docCard,
                  ...(selectedDoc?.doc_id === doc.doc_id ? s.docCardSelected : {}),
                  opacity: doc.is_active ? 1 : 0.5,
                }}
                onClick={() => handleViewDoc(doc.doc_id)}
              >
                <div style={s.docHeader}>
                  <span style={s.docName}>{doc.display_name}</span>
                  <span style={s.docType}>{docTypes[doc.doc_type] || doc.doc_type}</span>
                </div>
                <div style={s.docMeta}>
                  <span style={s.docDate}>{doc.date_uploaded?.slice(0, 10)}</span>
                  <span style={s.docActive}>{doc.is_active ? 'Active' : 'Inactive'}</span>
                </div>
                {doc.signalSummary.length > 0 && (
                  <div style={s.signalRow}>
                    {doc.signalSummary.slice(0, 3).map(sig => (
                      <span key={sig} style={s.signalBadge}>
                        {SIGNAL_LABELS[sig] || sig.replace(/_/g, ' ')}
                      </span>
                    ))}
                    {doc.signalSummary.length > 3 && (
                      <span style={s.signalMore}>+{doc.signalSummary.length - 3}</span>
                    )}
                  </div>
                )}
                <div style={s.docActions}>
                  <button
                    style={s.actionBtn}
                    onClick={e => { e.stopPropagation(); handleToggle(doc.doc_id, doc.is_active); }}
                  >
                    {doc.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                  <button
                    style={{ ...s.actionBtn, color: colors.error }}
                    onClick={e => { e.stopPropagation(); handleDelete(doc.doc_id); }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Detail pane */}
        {selectedDoc && (
          <div style={s.detailPane}>
            <div style={s.detailHeader}>
              <h2 style={s.detailTitle}>{selectedDoc.display_name}</h2>
              <button style={s.closeBtn} onClick={() => setSelectedDoc(null)}>&#x2715;</button>
            </div>

            <div style={s.detailMeta}>
              <div style={s.metaItem}>
                <span style={s.metaLabel}>Type</span>
                <span style={s.metaValue}>{docTypes[selectedDoc.doc_type] || selectedDoc.doc_type}</span>
              </div>
              <div style={s.metaItem}>
                <span style={s.metaLabel}>File</span>
                <span style={s.metaValue}>{selectedDoc.filename}</span>
              </div>
              <div style={s.metaItem}>
                <span style={s.metaLabel}>Uploaded</span>
                <span style={s.metaValue}>{selectedDoc.date_uploaded?.slice(0, 10)}</span>
              </div>
              <div style={s.metaItem}>
                <span style={s.metaLabel}>Status</span>
                <span style={{
                  ...s.metaValue,
                  color: selectedDoc.is_active ? colors.success : colors.textMuted
                }}>
                  {selectedDoc.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>

            <div style={s.signalSection}>
              <h3 style={s.sectionTitle}>Detected Policy Signals</h3>
              {selectedDoc.signalSummary.length === 0 ? (
                <p style={s.noSignals}>No policy signals detected in this document.</p>
              ) : (
                <div style={s.signalList}>
                  {selectedDoc.signalSummary.map(sig => (
                    <div key={sig} style={s.signalItem}>
                      <span style={s.signalDot}>&#x2713;</span>
                      <span>{SIGNAL_LABELS[sig] || sig.replace(/_/g, ' ')}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={s.textSection}>
              <h3 style={s.sectionTitle}>Document Text</h3>
              <pre style={s.docText}>{selectedDoc.full_text}</pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function getStyles() {
  return {
    container: {
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      position: 'relative',
    },
    dragOverlay: {
      position: 'absolute',
      inset: 0,
      background: 'rgba(37, 99, 235, 0.12)',
      border: `3px dashed ${colors.primary}`,
      borderRadius: radius.md,
      zIndex: 100,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    },
    dragContent: {
      textAlign: 'center',
    },
    dragIcon: {
      fontSize: '48px',
      marginBottom: spacing.md,
    },
    dragText: {
      fontSize: typography.fontSize.lg,
      fontWeight: typography.fontWeight.semibold,
      color: colors.primary,
      margin: 0,
    },
    dragHint: {
      fontSize: typography.fontSize.sm,
      color: colors.textMuted,
      marginTop: spacing.xs,
    },
    loading: {
      padding: spacing.xl,
      color: colors.textMuted,
      textAlign: 'center',
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      padding: `${spacing.lg} ${spacing.xl}`,
      borderBottom: `1px solid ${colors.border}`,
      flexShrink: 0,
    },
    title: {
      fontSize: typography.fontSize.xl,
      fontWeight: typography.fontWeight.semibold,
      color: colors.textPrimary,
      margin: 0,
    },
    subtitle: {
      fontSize: typography.fontSize.sm,
      color: colors.textMuted,
      margin: `${spacing.xs} 0 0 0`,
    },
    uploadBtn: {
      padding: `${spacing.sm} ${spacing.lg}`,
      background: colors.primary,
      color: '#fff',
      border: 'none',
      borderRadius: radius.md,
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.semibold,
      cursor: 'pointer',
    },
    uploadPanel: {
      padding: spacing.lg,
      background: colors.surfaceAlt,
      borderBottom: `1px solid ${colors.border}`,
      flexShrink: 0,
    },
    uploadRow: {
      display: 'flex',
      gap: spacing.md,
      alignItems: 'flex-end',
      marginBottom: spacing.md,
    },
    fieldGroup: {
      display: 'flex',
      flexDirection: 'column',
      gap: spacing.xs,
      flex: 1,
    },
    label: {
      fontSize: typography.fontSize.xs,
      fontWeight: typography.fontWeight.semibold,
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
    },
    select: {
      padding: `${spacing.sm} ${spacing.md}`,
      background: colors.surface,
      border: `1px solid ${colors.border}`,
      borderRadius: radius.md,
      fontSize: typography.fontSize.sm,
      color: colors.textPrimary,
      WebkitAppearance: 'menulist',
      appearance: 'menulist',
      cursor: 'pointer',
    },
    input: {
      padding: `${spacing.sm} ${spacing.md}`,
      background: colors.surface,
      border: `1px solid ${colors.border}`,
      borderRadius: radius.md,
      fontSize: typography.fontSize.sm,
      color: colors.textPrimary,
    },
    fileBtn: {
      padding: `${spacing.sm} ${spacing.lg}`,
      background: colors.surface,
      border: `1px solid ${colors.border}`,
      borderRadius: radius.md,
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.medium,
      color: colors.textPrimary,
      cursor: 'pointer',
      whiteSpace: 'nowrap',
    },
    dropZone: {
      padding: spacing.lg,
      border: `2px dashed ${colors.border}`,
      borderRadius: radius.md,
      textAlign: 'center',
      cursor: 'pointer',
      marginBottom: spacing.md,
      transition: 'border-color 0.15s ease, background 0.15s ease',
    },
    dropIcon: {
      fontSize: '24px',
      display: 'block',
      marginBottom: spacing.xs,
    },
    dropText: {
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.medium,
      color: colors.textSecondary,
      display: 'block',
    },
    dropHint: {
      fontSize: typography.fontSize.xs,
      color: colors.textMuted,
      display: 'block',
      marginTop: '2px',
    },
    pasteSection: {
      display: 'flex',
      flexDirection: 'column',
      gap: spacing.xs,
    },
    textarea: {
      padding: spacing.md,
      background: colors.surface,
      border: `1px solid ${colors.border}`,
      borderRadius: radius.md,
      fontSize: typography.fontSize.sm,
      fontFamily: typography.fontFamilyMono,
      color: colors.textPrimary,
      resize: 'vertical',
      minHeight: '100px',
    },
    content: {
      flex: 1,
      display: 'flex',
      overflow: 'hidden',
    },
    listPane: {
      width: selectedDoc => selectedDoc ? '360px' : '100%',
      flex: 1,
      minWidth: '320px',
      maxWidth: '500px',
      overflowY: 'auto',
      padding: spacing.md,
      borderRight: `1px solid ${colors.border}`,
    },
    empty: {
      textAlign: 'center',
      padding: spacing.xxl,
      cursor: 'pointer',
      border: `2px dashed ${colors.border}`,
      borderRadius: radius.md,
      margin: spacing.md,
      transition: 'border-color 0.15s ease',
    },
    emptyIcon: {
      fontSize: '48px',
      marginBottom: spacing.md,
    },
    emptyText: {
      fontSize: typography.fontSize.md,
      color: colors.textSecondary,
      margin: 0,
    },
    emptyHint: {
      fontSize: typography.fontSize.sm,
      color: colors.textMuted,
      marginTop: spacing.sm,
    },
    docCard: {
      padding: spacing.md,
      background: colors.surface,
      borderRadius: radius.md,
      border: `1px solid ${colors.border}`,
      marginBottom: spacing.sm,
      cursor: 'pointer',
      transition: 'border-color 0.15s ease',
    },
    docCardSelected: {
      borderColor: colors.primary,
      boxShadow: shadows.glow,
    },
    docHeader: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: spacing.sm,
      marginBottom: spacing.xs,
    },
    docName: {
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.semibold,
      color: colors.textPrimary,
    },
    docType: {
      fontSize: typography.fontSize.xs,
      color: colors.textMuted,
      whiteSpace: 'nowrap',
    },
    docMeta: {
      display: 'flex',
      gap: spacing.md,
      marginBottom: spacing.sm,
    },
    docDate: {
      fontSize: typography.fontSize.xs,
      color: colors.textMuted,
    },
    docActive: {
      fontSize: typography.fontSize.xs,
      color: colors.textMuted,
    },
    signalRow: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: spacing.xs,
      marginBottom: spacing.sm,
    },
    signalBadge: {
      fontSize: '10px',
      padding: `2px ${spacing.sm}`,
      background: `${colors.primary}15`,
      color: colors.primary,
      borderRadius: radius.full,
      whiteSpace: 'nowrap',
    },
    signalMore: {
      fontSize: '10px',
      padding: `2px ${spacing.sm}`,
      color: colors.textMuted,
    },
    docActions: {
      display: 'flex',
      gap: spacing.sm,
    },
    actionBtn: {
      fontSize: typography.fontSize.xs,
      color: colors.textMuted,
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      padding: `2px ${spacing.sm}`,
    },
    detailPane: {
      flex: 2,
      overflowY: 'auto',
      padding: spacing.lg,
    },
    detailHeader: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.lg,
    },
    detailTitle: {
      fontSize: typography.fontSize.lg,
      fontWeight: typography.fontWeight.semibold,
      color: colors.textPrimary,
      margin: 0,
    },
    closeBtn: {
      background: 'none',
      border: 'none',
      fontSize: typography.fontSize.lg,
      color: colors.textMuted,
      cursor: 'pointer',
    },
    detailMeta: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: spacing.md,
      marginBottom: spacing.lg,
      padding: spacing.md,
      background: colors.surfaceAlt,
      borderRadius: radius.md,
    },
    metaItem: {
      display: 'flex',
      flexDirection: 'column',
      gap: '2px',
    },
    metaLabel: {
      fontSize: typography.fontSize.xs,
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
    },
    metaValue: {
      fontSize: typography.fontSize.sm,
      color: colors.textPrimary,
    },
    signalSection: {
      marginBottom: spacing.lg,
    },
    sectionTitle: {
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.semibold,
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      marginBottom: spacing.md,
    },
    noSignals: {
      fontSize: typography.fontSize.sm,
      color: colors.textMuted,
      fontStyle: 'italic',
    },
    signalList: {
      display: 'flex',
      flexDirection: 'column',
      gap: spacing.sm,
    },
    signalItem: {
      display: 'flex',
      alignItems: 'center',
      gap: spacing.sm,
      fontSize: typography.fontSize.sm,
      color: colors.textPrimary,
    },
    signalDot: {
      color: colors.success,
      fontWeight: typography.fontWeight.bold,
    },
    textSection: {
      marginBottom: spacing.lg,
    },
    docText: {
      padding: spacing.md,
      background: colors.surfaceAlt,
      borderRadius: radius.md,
      fontSize: typography.fontSize.xs,
      fontFamily: typography.fontFamilyMono,
      color: colors.textSecondary,
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      maxHeight: '400px',
      overflowY: 'auto',
      lineHeight: typography.lineHeight.relaxed,
    },
  };
}
