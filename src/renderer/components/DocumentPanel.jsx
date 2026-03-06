import React, { useState, useEffect, useRef } from 'react';
import { useTheme } from '../styles/ThemeContext';
import { colors, shadows, spacing, typography, radius, getEvidenceColor } from '../styles/tokens';

const EVIDENCE_TYPE_OPTIONS = [
  { value: 'ADVERSE_ACTION', label: 'Adverse Action' },
  { value: 'INCIDENT', label: 'Incident' },
  { value: 'PROTECTED_ACTIVITY', label: 'Protected Activity' },
  { value: 'REQUEST_FOR_HELP', label: 'Request for Help' },
  { value: 'RESPONSE', label: 'Response' },
  { value: 'CLAIM_AGAINST_YOU', label: 'Claim Against You' },
  { value: 'CLAIM_YOU_MADE', label: 'Your Claim' },
  { value: 'PAY_RECORD', label: 'Pay Record' },
  { value: 'CONTEXT', label: 'Context' },
  { value: 'SUPPORTING', label: 'Supporting' }
];

export default function DocumentPanel({ document: doc, onClose, onDocumentUpdated }) {
  const { mode } = useTheme();
  const [fullDoc, setFullDoc] = useState(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState('');
  const [isEditingDate, setIsEditingDate] = useState(false);
  const [editDate, setEditDate] = useState('');
  const [isEditingContext, setIsEditingContext] = useState(false);
  const [editContext, setEditContext] = useState('');
  const [previewData, setPreviewData] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const nameInputRef = useRef(null);
  const styles = getStyles();

  useEffect(() => {
    if (doc?.id) {
      loadFullDocument(doc.id);
      setPreviewData(null);
      setShowPreview(false);
    }
  }, [doc?.id]);

  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [isEditingName]);

  async function loadFullDocument(docId) {
    const result = await window.api.documents.get(docId);
    if (result.success) {
      setFullDoc(result.document);
    }
  }

  async function handleRename() {
    if (!editName.trim() || editName === displayDoc.filename) {
      setIsEditingName(false);
      return;
    }
    const result = await window.api.documents.rename(doc.id, editName.trim());
    if (result.success) {
      setFullDoc(prev => prev ? { ...prev, filename: editName.trim() } : prev);
      if (onDocumentUpdated) onDocumentUpdated();
    }
    setIsEditingName(false);
  }

  async function handleDateChange() {
    if (!editDate) {
      setIsEditingDate(false);
      return;
    }
    const result = await window.api.documents.updateDate(doc.id, editDate, 'exact');
    if (result.success) {
      setFullDoc(prev => prev ? { ...prev, document_date: editDate, document_date_confidence: 'exact' } : prev);
      if (onDocumentUpdated) onDocumentUpdated();
    }
    setIsEditingDate(false);
  }

  async function handleTypeChange(newType) {
    const result = await window.api.documents.updateType(doc.id, newType);
    if (result.success) {
      setFullDoc(prev => prev ? { ...prev, evidence_type: newType } : prev);
      if (onDocumentUpdated) onDocumentUpdated();
    }
  }

  async function handleContextSave() {
    const result = await window.api.documents.updateContext(doc.id, editContext);
    if (result.success) {
      setFullDoc(prev => prev ? { ...prev, user_context: editContext } : prev);
      if (onDocumentUpdated) onDocumentUpdated();
    }
    setIsEditingContext(false);
  }

  async function handlePreview() {
    if (previewData) {
      setShowPreview(true);
      return;
    }
    try {
      const result = await window.api.documents.getContent(doc.id);
      if (result.success) {
        setPreviewData({ data: result.data, mimeType: result.mimeType });
        setShowPreview(true);
      }
    } catch (err) {
      console.error('[DocumentPanel] preview error:', err);
    }
  }

  if (!doc) return null;

  const displayDoc = fullDoc || doc;
  const metadata = displayDoc.metadata_json ? safeParseJSON(displayDoc.metadata_json) : {};
  const contentDates = displayDoc.content_dates_json ? safeParseJSON(displayDoc.content_dates_json) : [];
  const isImage = displayDoc.file_type?.startsWith('image/');
  const isPdf = displayDoc.file_type === 'application/pdf';
  const canPreview = isImage || isPdf;

  return (
    <>
      <div style={styles.overlay} onClick={onClose}>
        <div style={styles.panel} onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div style={styles.header}>
            <div style={styles.headerContent}>
              <div style={{
                ...styles.typeBadge,
                background: `${getEvidenceColor(displayDoc.evidence_type)}15`,
                color: getEvidenceColor(displayDoc.evidence_type)
              }}>
                {formatType(displayDoc.evidence_type)}
              </div>

              {/* Editable filename */}
              {isEditingName ? (
                <input
                  ref={nameInputRef}
                  style={styles.nameInput}
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  onBlur={handleRename}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleRename();
                    if (e.key === 'Escape') setIsEditingName(false);
                  }}
                />
              ) : (
                <h2
                  style={styles.title}
                  onClick={() => {
                    setEditName(displayDoc.filename);
                    setIsEditingName(true);
                  }}
                  title="Click to rename"
                >
                  {displayDoc.filename}
                  <span style={styles.editHint}>{'\u270E'}</span>
                </h2>
              )}
            </div>
            <button style={styles.closeButton} onClick={onClose}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M15 5L5 15M5 5L15 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
          </div>

          {/* Preview button */}
          {canPreview && (
            <div style={styles.previewButtonRow}>
              <button style={styles.previewButton} onClick={handlePreview}>
                {isImage ? '\uD83D\uDDBC\uFE0F' : '\uD83D\uDCC4'} View {isImage ? 'Image' : 'PDF'}
              </button>
            </div>
          )}

          {/* Evidence type selector */}
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Evidence Type</h3>
            <select
              style={styles.typeSelect}
              value={displayDoc.evidence_type || ''}
              onChange={e => handleTypeChange(e.target.value)}
            >
              <option value="">-- Select type --</option>
              {EVIDENCE_TYPE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Primary date with editing */}
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Document Date</h3>
            {isEditingDate ? (
              <div style={styles.dateEditRow}>
                <input
                  type="date"
                  style={styles.dateInput}
                  value={editDate}
                  onChange={e => setEditDate(e.target.value)}
                  autoFocus
                />
                <button style={styles.saveBtn} onClick={handleDateChange}>Save</button>
                <button style={styles.cancelBtn} onClick={() => setIsEditingDate(false)}>Cancel</button>
              </div>
            ) : (
              <div
                style={styles.primaryDate}
                onClick={() => {
                  setEditDate(displayDoc.document_date?.split('T')[0] || '');
                  setIsEditingDate(true);
                }}
                title="Click to edit date"
              >
                {displayDoc.document_date
                  ? formatDate(displayDoc.document_date)
                  : 'No date extracted'
                }
                <span style={styles.editHint}>{'\u270E'}</span>
              </div>
            )}
            <div style={styles.confidenceRow}>
              <span style={styles.confidenceLabel}>Confidence:</span>
              <span style={{
                ...styles.confidenceBadge,
                background: getConfidenceColor(displayDoc.document_date_confidence)
              }}>
                {displayDoc.document_date_confidence || 'undated'}
              </span>
            </div>
          </div>

          {/* Content dates */}
          {contentDates.length > 0 && (
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>
                Dates Found in Content
                <span style={styles.countBadge}>{contentDates.length}</span>
              </h3>
              <div style={styles.datesList}>
                {contentDates.slice(0, 5).map((d, i) => (
                  <div key={i} style={styles.dateRow}>
                    <span style={styles.dateText}>"{d.text}"</span>
                    <span style={styles.dateValue}>
                      {new Date(d.date).toLocaleDateString()}
                    </span>
                  </div>
                ))}
                {contentDates.length > 5 && (
                  <div style={styles.moreText}>
                    +{contentDates.length - 5} more dates
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Metadata */}
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>File Details</h3>
            <div style={styles.metaGrid}>
              <MetaRow label="Type" value={displayDoc.file_type} styles={styles} />
              <MetaRow label="Size" value={formatBytes(displayDoc.file_size)} styles={styles} />
              {displayDoc.sha256_hash && (
                <MetaRow label="Hash" value={displayDoc.sha256_hash.slice(0, 20) + '...'} mono styles={styles} />
              )}
              {metadata.from && <MetaRow label="From" value={metadata.from} styles={styles} />}
              {metadata.to && <MetaRow label="To" value={metadata.to} styles={styles} />}
              {metadata.subject && <MetaRow label="Subject" value={metadata.subject} styles={styles} />}
            </div>
          </div>

          {/* Extracted text */}
          {displayDoc.extracted_text && (
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>Extracted Text</h3>
              <div style={styles.textBox}>
                {displayDoc.extracted_text.slice(0, 800)}
                {displayDoc.extracted_text.length > 800 && (
                  <span style={styles.truncated}>... (truncated)</span>
                )}
              </div>
            </div>
          )}

          {/* User context / notes (editable) */}
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Your Notes</h3>
            {isEditingContext ? (
              <div style={styles.contextEditArea}>
                <textarea
                  style={styles.contextTextarea}
                  value={editContext}
                  onChange={e => setEditContext(e.target.value)}
                  rows={4}
                  autoFocus
                  placeholder="Add your notes about this document..."
                />
                <div style={styles.contextButtons}>
                  <button style={styles.saveBtn} onClick={handleContextSave}>Save</button>
                  <button style={styles.cancelBtn} onClick={() => setIsEditingContext(false)}>Cancel</button>
                </div>
              </div>
            ) : (
              <div
                style={styles.textBox}
                onClick={() => {
                  setEditContext(displayDoc.user_context || '');
                  setIsEditingContext(true);
                }}
                title="Click to edit notes"
              >
                {displayDoc.user_context || (
                  <span style={styles.placeholder}>Click to add notes...</span>
                )}
                <span style={styles.editHintInline}>{'\u270E'}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Full-screen preview overlay */}
      {showPreview && previewData && (
        <div style={styles.previewOverlay} onClick={() => setShowPreview(false)}>
          <div style={styles.previewContainer} onClick={e => e.stopPropagation()}>
            <div style={styles.previewHeader}>
              <span style={styles.previewTitle}>{displayDoc.filename}</span>
              <button style={styles.previewClose} onClick={() => setShowPreview(false)}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
            <div style={styles.previewBody}>
              {isImage ? (
                <img
                  src={`data:${previewData.mimeType};base64,${previewData.data}`}
                  alt={displayDoc.filename}
                  style={styles.previewImage}
                />
              ) : isPdf ? (
                <object
                  data={`data:application/pdf;base64,${previewData.data}`}
                  type="application/pdf"
                  style={styles.previewPdf}
                >
                  <p style={styles.previewFallback}>
                    PDF preview not available.
                  </p>
                </object>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function MetaRow({ label, value, mono, styles }) {
  return (
    <div style={styles.metaRow}>
      <span style={styles.metaLabel}>{label}</span>
      <span style={{
        ...styles.metaValue,
        ...(mono ? { fontFamily: typography.fontFamilyMono } : {})
      }}>{value}</span>
    </div>
  );
}

function safeParseJSON(str) {
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}

function formatType(type) {
  const labels = {
    'ADVERSE_ACTION': 'Adverse Action',
    'INCIDENT': 'Incident',
    'PROTECTED_ACTIVITY': 'Protected Activity',
    'REQUEST_FOR_HELP': 'Request',
    'RESPONSE': 'Response',
    'CLAIM_AGAINST_YOU': 'Their Claim',
    'CLAIM_YOU_MADE': 'Your Claim',
    'PAY_RECORD': 'Pay Record',
    'CONTEXT': 'Context',
    'SUPPORTING': 'Supporting'
  };
  return labels[type] || type?.replace(/_/g, ' ') || 'Document';
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function getConfidenceColor(confidence) {
  const map = {
    'exact': colors.confidenceExact,
    'approximate': colors.confidenceApprox,
    'inferred': colors.confidenceInferred,
    'undated': colors.confidenceUndated
  };
  return map[confidence] || colors.confidenceUndated;
}

function getStyles() {
  return {
    overlay: {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.3)',
      display: 'flex',
      justifyContent: 'flex-end',
      zIndex: 1000,
      animation: 'fadeIn 0.15s ease'
    },
    panel: {
      width: '420px',
      height: '100%',
      background: colors.surface,
      borderLeft: `1px solid ${colors.border}`,
      overflowY: 'auto',
      animation: 'slideIn 0.2s ease'
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      padding: spacing.lg,
      borderBottom: `1px solid ${colors.border}`,
      background: colors.surfaceAlt
    },
    headerContent: {
      flex: 1,
      marginRight: spacing.md
    },
    typeBadge: {
      display: 'inline-block',
      fontSize: typography.fontSize.xs,
      fontWeight: typography.fontWeight.semibold,
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      padding: `${spacing.xs} ${spacing.sm}`,
      borderRadius: radius.sm,
      marginBottom: spacing.sm
    },
    title: {
      fontSize: typography.fontSize.md,
      fontWeight: typography.fontWeight.semibold,
      color: colors.textPrimary,
      margin: 0,
      wordBreak: 'break-word',
      lineHeight: typography.lineHeight.tight,
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'baseline',
      gap: spacing.sm
    },
    editHint: {
      fontSize: typography.fontSize.xs,
      color: colors.textMuted,
      opacity: 0.5,
      flexShrink: 0
    },
    editHintInline: {
      fontSize: typography.fontSize.xs,
      color: colors.textMuted,
      opacity: 0.4,
      marginLeft: spacing.sm
    },
    nameInput: {
      width: '100%',
      fontSize: typography.fontSize.md,
      fontWeight: typography.fontWeight.semibold,
      color: colors.textPrimary,
      background: colors.surface,
      border: `2px solid ${colors.primary}`,
      borderRadius: radius.sm,
      padding: `${spacing.xs} ${spacing.sm}`,
      outline: 'none',
      fontFamily: 'inherit'
    },
    closeButton: {
      background: 'none',
      border: 'none',
      color: colors.textMuted,
      cursor: 'pointer',
      padding: spacing.xs,
      borderRadius: radius.sm,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'color 0.15s ease'
    },

    // Preview button
    previewButtonRow: {
      padding: `${spacing.sm} ${spacing.lg}`,
      borderBottom: `1px solid ${colors.border}`
    },
    previewButton: {
      width: '100%',
      padding: `${spacing.sm} ${spacing.md}`,
      background: colors.surfaceAlt,
      color: colors.primary,
      border: `1px solid ${colors.border}`,
      borderRadius: radius.md,
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.medium,
      cursor: 'pointer',
      transition: 'background 0.15s ease'
    },

    // Evidence type select
    typeSelect: {
      width: '100%',
      padding: `${spacing.sm} ${spacing.md}`,
      background: colors.surface,
      color: colors.textPrimary,
      border: `1px solid ${colors.border}`,
      borderRadius: radius.md,
      fontSize: typography.fontSize.sm,
      cursor: 'pointer',
      outline: 'none',
      fontFamily: 'inherit'
    },

    // Date editing
    dateEditRow: {
      display: 'flex',
      gap: spacing.sm,
      alignItems: 'center',
      marginBottom: spacing.sm
    },
    dateInput: {
      flex: 1,
      padding: `${spacing.sm} ${spacing.md}`,
      background: colors.surface,
      color: colors.textPrimary,
      border: `2px solid ${colors.primary}`,
      borderRadius: radius.md,
      fontSize: typography.fontSize.sm,
      outline: 'none',
      fontFamily: 'inherit'
    },
    saveBtn: {
      padding: `${spacing.sm} ${spacing.md}`,
      background: colors.primary,
      color: colors.textInverse,
      border: 'none',
      borderRadius: radius.md,
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.medium,
      cursor: 'pointer'
    },
    cancelBtn: {
      padding: `${spacing.sm} ${spacing.md}`,
      background: 'transparent',
      color: colors.textMuted,
      border: `1px solid ${colors.border}`,
      borderRadius: radius.md,
      fontSize: typography.fontSize.sm,
      cursor: 'pointer'
    },

    // Context editing
    contextEditArea: {
      display: 'flex',
      flexDirection: 'column',
      gap: spacing.sm
    },
    contextTextarea: {
      width: '100%',
      padding: spacing.md,
      background: colors.surface,
      color: colors.textPrimary,
      border: `2px solid ${colors.primary}`,
      borderRadius: radius.md,
      fontSize: typography.fontSize.sm,
      lineHeight: typography.lineHeight.relaxed,
      outline: 'none',
      fontFamily: 'inherit',
      resize: 'vertical',
      minHeight: '80px',
      boxSizing: 'border-box'
    },
    contextButtons: {
      display: 'flex',
      gap: spacing.sm
    },
    placeholder: {
      color: colors.textMuted,
      fontStyle: 'italic'
    },

    // Sections
    section: {
      padding: spacing.lg,
      borderBottom: `1px solid ${colors.border}`
    },
    sectionTitle: {
      fontSize: typography.fontSize.xs,
      fontWeight: typography.fontWeight.semibold,
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      margin: `0 0 ${spacing.md} 0`,
      display: 'flex',
      alignItems: 'center',
      gap: spacing.sm
    },
    countBadge: {
      background: colors.surfaceAlt,
      color: colors.textSecondary,
      padding: `2px ${spacing.sm}`,
      borderRadius: radius.full,
      fontSize: typography.fontSize.xs,
      fontWeight: typography.fontWeight.normal
    },

    // Primary date
    primaryDate: {
      fontSize: typography.fontSize.md,
      fontWeight: typography.fontWeight.medium,
      color: colors.textPrimary,
      marginBottom: spacing.sm,
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'baseline',
      gap: spacing.sm
    },
    confidenceRow: {
      display: 'flex',
      alignItems: 'center',
      gap: spacing.sm
    },
    confidenceLabel: {
      fontSize: typography.fontSize.sm,
      color: colors.textMuted
    },
    confidenceBadge: {
      fontSize: typography.fontSize.xs,
      fontWeight: typography.fontWeight.medium,
      padding: `2px ${spacing.sm}`,
      borderRadius: radius.sm,
      textTransform: 'capitalize'
    },

    // Dates list
    datesList: {
      display: 'flex',
      flexDirection: 'column',
      gap: spacing.sm
    },
    dateRow: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: spacing.sm,
      background: colors.surfaceAlt,
      borderRadius: radius.md
    },
    dateText: {
      fontSize: typography.fontSize.sm,
      color: colors.textSecondary,
      fontStyle: 'italic',
      flex: 1,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      marginRight: spacing.md
    },
    dateValue: {
      fontSize: typography.fontSize.sm,
      fontFamily: typography.fontFamilyMono,
      color: colors.textPrimary,
      whiteSpace: 'nowrap'
    },
    moreText: {
      fontSize: typography.fontSize.sm,
      color: colors.textMuted,
      textAlign: 'center',
      padding: spacing.sm
    },

    // Meta grid
    metaGrid: {
      display: 'flex',
      flexDirection: 'column',
      gap: spacing.sm
    },
    metaRow: {
      display: 'flex',
      justifyContent: 'space-between',
      padding: `${spacing.sm} ${spacing.md}`,
      background: colors.surfaceAlt,
      borderRadius: radius.md
    },
    metaLabel: {
      fontSize: typography.fontSize.sm,
      color: colors.textMuted
    },
    metaValue: {
      fontSize: typography.fontSize.sm,
      color: colors.textPrimary,
      textAlign: 'right',
      maxWidth: '60%',
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    },

    // Text box
    textBox: {
      background: colors.surfaceAlt,
      padding: spacing.md,
      borderRadius: radius.md,
      fontSize: typography.fontSize.sm,
      color: colors.textSecondary,
      lineHeight: typography.lineHeight.relaxed,
      maxHeight: '250px',
      overflowY: 'auto',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      cursor: 'pointer',
      position: 'relative'
    },
    truncated: {
      color: colors.textMuted,
      fontStyle: 'italic'
    },

    // Preview overlay
    previewOverlay: {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.85)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2000,
      animation: 'fadeIn 0.15s ease'
    },
    previewContainer: {
      width: '90vw',
      height: '90vh',
      display: 'flex',
      flexDirection: 'column',
      background: colors.surface,
      borderRadius: radius.lg,
      overflow: 'hidden',
      boxShadow: shadows.xl
    },
    previewHeader: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: `${spacing.md} ${spacing.lg}`,
      borderBottom: `1px solid ${colors.border}`,
      background: colors.surfaceAlt
    },
    previewTitle: {
      fontSize: typography.fontSize.md,
      fontWeight: typography.fontWeight.semibold,
      color: colors.textPrimary,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    },
    previewClose: {
      background: 'none',
      border: 'none',
      color: colors.textMuted,
      cursor: 'pointer',
      padding: spacing.xs,
      borderRadius: radius.sm,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    },
    previewBody: {
      flex: 1,
      overflow: 'auto',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: colors.bg,
      padding: spacing.lg
    },
    previewImage: {
      maxWidth: '100%',
      maxHeight: '100%',
      objectFit: 'contain',
      borderRadius: radius.md,
      boxShadow: shadows.lg
    },
    previewPdf: {
      width: '100%',
      height: '100%',
      border: 'none',
      borderRadius: radius.md
    },
    previewFallback: {
      color: colors.textMuted,
      fontSize: typography.fontSize.base,
      textAlign: 'center'
    }
  };
}

// Add animations
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes slideIn {
    from { transform: translateX(100%); }
    to { transform: translateX(0); }
  }
`;
document.head.appendChild(styleSheet);
