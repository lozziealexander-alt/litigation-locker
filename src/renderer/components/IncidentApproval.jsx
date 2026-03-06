import React, { useState } from 'react';
import { colors, shadows, spacing, typography, radius, getSeverityColor } from '../styles/tokens';

export default function IncidentApproval({ incidents, jurisdiction = 'both', onApprove, onDismiss, onClose }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [editedIncident, setEditedIncident] = useState(incidents[0] || null);

  if (!incidents || incidents.length === 0) {
    return null;
  }

  const current = incidents[currentIndex];
  const isLast = currentIndex === incidents.length - 1;

  function handleFieldChange(field, value) {
    setEditedIncident(prev => ({ ...prev, [field]: value }));
  }

  function handleApprove() {
    onApprove({
      title: editedIncident.suggestedTitle,
      description: editedIncident.suggestedDescription,
      date: editedIncident.suggestedDate,
      severity: editedIncident.suggestedSeverity,
      type: editedIncident.type,
      subtype: editedIncident.subtype,
      sourceDocumentId: editedIncident.sourceDocumentId,
      involvesRetaliation: editedIncident.burlingtonProximity,
      harrisNature: editedIncident.harrisNature,
      tangibleAction: editedIncident.tangibleAction,
      burlingtonProximity: editedIncident.burlingtonProximity
    });

    if (isLast) {
      onClose();
    } else {
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);
      setEditedIncident(incidents[nextIndex]);
    }
  }

  function handleDismiss() {
    onDismiss(current);

    if (isLast) {
      onClose();
    } else {
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);
      setEditedIncident(incidents[nextIndex]);
    }
  }

  function handleSkipAll() {
    onClose();
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        {/* Header */}
        <div style={styles.header}>
          <div>
            <h2 style={styles.title}>Review Detected Incident</h2>
            <p style={styles.subtitle}>
              {currentIndex + 1} of {incidents.length} &bull; Edit details before accepting
            </p>
          </div>
          <button style={styles.closeBtn} onClick={handleSkipAll}>&times;</button>
        </div>

        {/* Matched text preview */}
        <div style={styles.matchPreview}>
          <div style={styles.matchLabel}>Detected from:</div>
          <div style={styles.matchText}>"{current.matchedText}"</div>
          <div style={styles.confidence}>
            Confidence: {Math.round(current.confidence * 100)}%
          </div>
        </div>

        {/* Editable fields */}
        <div style={styles.form}>
          {/* Title */}
          <div style={styles.field}>
            <label style={styles.label}>Title</label>
            <input
              type="text"
              value={editedIncident.suggestedTitle || ''}
              onChange={(e) => handleFieldChange('suggestedTitle', e.target.value)}
              style={styles.input}
              placeholder="Incident title"
            />
          </div>

          {/* Type + Severity row */}
          <div style={styles.fieldRow}>
            <div style={styles.fieldHalf}>
              <label style={styles.label}>Type</label>
              <select
                value={editedIncident.type || 'INCIDENT'}
                onChange={(e) => handleFieldChange('type', e.target.value)}
                style={styles.select}
              >
                <option value="INCIDENT">Incident</option>
                <option value="ADVERSE_ACTION">Adverse Action</option>
                <option value="PROTECTED_ACTIVITY">Protected Activity</option>
              </select>
            </div>
            <div style={styles.fieldHalf}>
              <label style={styles.label}>Severity</label>
              <select
                value={editedIncident.suggestedSeverity || 'moderate'}
                onChange={(e) => handleFieldChange('suggestedSeverity', e.target.value)}
                style={styles.select}
              >
                <option value="minor">Minor</option>
                <option value="moderate">Moderate</option>
                <option value="severe">Severe</option>
                <option value="egregious">Egregious</option>
              </select>
            </div>
          </div>

          {/* Date */}
          <div style={styles.field}>
            <label style={styles.label}>Date</label>
            <input
              type="date"
              value={editedIncident.suggestedDate?.split('T')[0] || ''}
              onChange={(e) => handleFieldChange('suggestedDate', e.target.value)}
              style={styles.input}
            />
          </div>

          {/* Description */}
          <div style={styles.field}>
            <label style={styles.label}>Description</label>
            <textarea
              value={editedIncident.suggestedDescription || ''}
              onChange={(e) => handleFieldChange('suggestedDescription', e.target.value)}
              style={styles.textarea}
              rows={3}
              placeholder="What happened..."
            />
          </div>
        </div>

        {/* Severity factors preview — filtered by jurisdiction */}
        {(current.harrisNature || current.tangibleAction || current.burlingtonProximity) && (
          <div style={styles.factors}>
            <div style={styles.factorsTitle}>Legal Significance:</div>
            <div style={styles.factorsList}>
              {current.tangibleAction && jurisdiction !== 'state' && (
                <span style={styles.factorBadge}>Tangible Action (Vance)</span>
              )}
              {current.harrisNature && jurisdiction !== 'state' && (
                <span style={styles.factorBadge}>{current.harrisNature} (Harris)</span>
              )}
              {current.burlingtonProximity && jurisdiction !== 'state' && (
                <span style={styles.factorBadge}>Retaliation Timing (Burlington)</span>
              )}
              {current.burlingtonProximity && jurisdiction !== 'federal' && (
                <span style={styles.factorBadge}>Strict Proximity (Thomas)</span>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={styles.actions}>
          <button style={styles.dismissBtn} onClick={handleDismiss}>
            Dismiss
          </button>
          <button style={styles.approveBtn} onClick={handleApprove}>
            Accept {isLast ? '& Close' : '& Next'}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1100
  },
  modal: {
    width: '500px',
    maxHeight: '90vh',
    background: colors.surface,
    borderRadius: radius.xl,
    boxShadow: shadows.xl,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: spacing.lg,
    borderBottom: `1px solid ${colors.border}`,
    background: colors.surfaceAlt
  },
  title: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textPrimary,
    margin: 0
  },
  subtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.textMuted,
    margin: `${spacing.xs} 0 0 0`
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    fontSize: '24px',
    color: colors.textMuted,
    cursor: 'pointer'
  },

  // Match preview
  matchPreview: {
    padding: spacing.md,
    background: '#FEF3C7',
    borderBottom: `1px solid ${colors.border}`
  },
  matchLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    color: '#92400E',
    marginBottom: spacing.xs
  },
  matchText: {
    fontSize: typography.fontSize.sm,
    color: '#78350F',
    fontStyle: 'italic',
    lineHeight: typography.lineHeight.relaxed
  },
  confidence: {
    fontSize: typography.fontSize.xs,
    color: '#B45309',
    marginTop: spacing.sm
  },

  // Form
  form: {
    padding: spacing.lg,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.md,
    flex: 1,
    overflowY: 'auto'
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs
  },
  fieldRow: {
    display: 'flex',
    gap: spacing.md
  },
  fieldHalf: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs
  },
  label: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.textSecondary
  },
  input: {
    padding: spacing.sm,
    border: `1px solid ${colors.border}`,
    borderRadius: radius.md,
    fontSize: typography.fontSize.base,
    color: colors.textPrimary,
    background: colors.surface,
    outline: 'none'
  },
  select: {
    padding: spacing.sm,
    border: `1px solid ${colors.border}`,
    borderRadius: radius.md,
    fontSize: typography.fontSize.base,
    color: colors.textPrimary,
    background: colors.surface,
    outline: 'none',
    cursor: 'pointer'
  },
  textarea: {
    padding: spacing.sm,
    border: `1px solid ${colors.border}`,
    borderRadius: radius.md,
    fontSize: typography.fontSize.base,
    color: colors.textPrimary,
    background: colors.surface,
    outline: 'none',
    resize: 'vertical',
    fontFamily: 'inherit'
  },

  // Factors
  factors: {
    padding: spacing.md,
    background: colors.surfaceAlt,
    borderTop: `1px solid ${colors.border}`
  },
  factorsTitle: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textSecondary,
    marginBottom: spacing.sm
  },
  factorsList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: spacing.sm
  },
  factorBadge: {
    fontSize: typography.fontSize.xs,
    padding: `${spacing.xs} ${spacing.sm}`,
    background: colors.primary + '15',
    color: colors.primary,
    borderRadius: radius.full
  },

  // Actions
  actions: {
    display: 'flex',
    gap: spacing.md,
    padding: spacing.lg,
    borderTop: `1px solid ${colors.border}`,
    background: colors.surface
  },
  dismissBtn: {
    flex: 1,
    padding: spacing.md,
    background: colors.surfaceAlt,
    border: `1px solid ${colors.border}`,
    borderRadius: radius.md,
    fontSize: typography.fontSize.base,
    color: colors.textSecondary,
    cursor: 'pointer'
  },
  approveBtn: {
    flex: 2,
    padding: spacing.md,
    background: colors.primary,
    border: 'none',
    borderRadius: radius.md,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textInverse,
    cursor: 'pointer'
  }
};
