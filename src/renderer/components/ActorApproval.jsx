import React, { useState } from 'react';
import { colors, shadows, spacing, typography, radius } from '../styles/tokens';

const CLASSIFICATIONS = [
  { value: 'bad_actor', label: 'Bad Actor', color: '#DC2626', description: 'Primary aggressor or perpetrator' },
  { value: 'enabler', label: 'Enabler', color: '#F97316', description: 'Enabled or failed to stop bad behavior' },
  { value: 'witness_supportive', label: 'Supportive Witness', color: '#16A34A', description: 'Witnessed events, likely to help' },
  { value: 'witness_neutral', label: 'Neutral Witness', color: '#6B7280', description: 'Witnessed events, unclear stance' },
  { value: 'witness_hostile', label: 'Hostile Witness', color: '#DC2626', description: 'Witnessed events, likely hostile' },
  { value: 'bystander', label: 'Bystander', color: '#9CA3AF', description: 'Present but not directly involved' },
  { value: 'corroborator', label: 'Corroborator', color: '#16A34A', description: 'Can confirm your account' },
  { value: 'self', label: 'This is Me', color: '#2563EB', description: 'Mark as yourself' }
];

const RELATIONSHIPS = [
  { value: 'supervisor', label: 'My Supervisor/Manager' },
  { value: 'hr', label: 'HR' },
  { value: 'executive', label: 'Executive' },
  { value: 'peer', label: 'Peer/Colleague' },
  { value: 'direct_report', label: 'My Direct Report' },
  { value: 'other', label: 'Other' }
];

const WOULD_HELP_OPTIONS = [
  { value: 'likely_helpful', label: 'Likely Helpful', color: '#16A34A' },
  { value: 'uncertain', label: 'Uncertain', color: '#F97316' },
  { value: 'likely_hostile', label: 'Likely Hostile', color: '#DC2626' },
  { value: 'unknown', label: 'Unknown', color: '#6B7280' }
];

export default function ActorApproval({ actors, onApprove, onDismiss, onClose }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [editedActor, setEditedActor] = useState(actors[0] || null);

  if (!actors || actors.length === 0) {
    return null;
  }

  const current = actors[currentIndex];
  const isLast = currentIndex === actors.length - 1;

  function handleFieldChange(field, value) {
    setEditedActor(prev => ({ ...prev, [field]: value }));
  }

  function handleApprove() {
    onApprove({
      name: editedActor.name,
      role: editedActor.suggestedRole,
      relationship: editedActor.suggestedRelationship,
      classification: editedActor.classification || 'unknown',
      wouldTheyHelp: editedActor.wouldTheyHelp || 'unknown',
      isSelf: editedActor.classification === 'self',
      sourceDocumentId: editedActor.sourceDocumentId,
      ...editedActor
    });

    if (isLast) {
      onClose();
    } else {
      setCurrentIndex(currentIndex + 1);
      setEditedActor(actors[currentIndex + 1]);
    }
  }

  function handleDismiss() {
    onDismiss(current);

    if (isLast) {
      onClose();
    } else {
      setCurrentIndex(currentIndex + 1);
      setEditedActor(actors[currentIndex + 1]);
    }
  }

  function handleSkipAll() {
    onClose();
  }

  const selectedClassification = CLASSIFICATIONS.find(c => c.value === editedActor.classification);

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        {/* Header */}
        <div style={styles.header}>
          <div>
            <h2 style={styles.title}>Review Detected Person</h2>
            <p style={styles.subtitle}>
              {currentIndex + 1} of {actors.length} • Classify before accepting
            </p>
          </div>
          <button style={styles.closeBtn} onClick={handleSkipAll}>×</button>
        </div>

        {/* Detected from preview */}
        <div style={styles.matchPreview}>
          <div style={styles.matchLabel}>Detected from:</div>
          <div style={styles.matchText}>"{current.matchedText}"</div>
          <div style={styles.confidence}>
            Source: {current.source?.replace('_', ' ')} • Confidence: {Math.round(current.confidence * 100)}%
          </div>
        </div>

        {/* Form */}
        <div style={styles.form}>
          {/* Name */}
          <div style={styles.field}>
            <label style={styles.label}>Name</label>
            <input
              type="text"
              value={editedActor.name || ''}
              onChange={(e) => handleFieldChange('name', e.target.value)}
              style={styles.input}
              placeholder="Full name"
            />
          </div>

          {/* Role and Relationship */}
          <div style={styles.fieldRow}>
            <div style={styles.fieldHalf}>
              <label style={styles.label}>Their Role/Title</label>
              <input
                type="text"
                value={editedActor.suggestedRole || ''}
                onChange={(e) => handleFieldChange('suggestedRole', e.target.value)}
                style={styles.input}
                placeholder="e.g., Manager, HR Director"
              />
            </div>

            <div style={styles.fieldHalf}>
              <label style={styles.label}>Relationship to You</label>
              <select
                value={editedActor.suggestedRelationship || ''}
                onChange={(e) => handleFieldChange('suggestedRelationship', e.target.value)}
                style={styles.select}
              >
                <option value="">Select...</option>
                {RELATIONSHIPS.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Classification */}
          <div style={styles.field}>
            <label style={styles.label}>Classification</label>
            <div style={styles.classificationGrid}>
              {CLASSIFICATIONS.map(c => (
                <button
                  key={c.value}
                  type="button"
                  style={{
                    ...styles.classificationBtn,
                    borderColor: editedActor.classification === c.value ? c.color : colors.border,
                    background: editedActor.classification === c.value ? `${c.color}10` : colors.surface,
                    color: editedActor.classification === c.value ? c.color : colors.textSecondary
                  }}
                  onClick={() => handleFieldChange('classification', c.value)}
                >
                  {c.label}
                </button>
              ))}
            </div>
            {selectedClassification && (
              <div style={styles.classificationDesc}>
                {selectedClassification.description}
              </div>
            )}
          </div>

          {/* Would they help? (only for witnesses) */}
          {editedActor.classification?.startsWith('witness') && (
            <div style={styles.field}>
              <label style={styles.label}>Would they help your case?</label>
              <div style={styles.helpGrid}>
                {WOULD_HELP_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    style={{
                      ...styles.helpBtn,
                      borderColor: editedActor.wouldTheyHelp === opt.value ? opt.color : colors.border,
                      background: editedActor.wouldTheyHelp === opt.value ? `${opt.color}10` : colors.surface,
                      color: editedActor.wouldTheyHelp === opt.value ? opt.color : colors.textSecondary
                    }}
                    onClick={() => handleFieldChange('wouldTheyHelp', opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={styles.actions}>
          <button style={styles.dismissBtn} onClick={handleDismiss}>
            Skip This Person
          </button>
          <button style={styles.approveBtn} onClick={handleApprove}>
            Save {isLast ? '& Close' : '& Next'}
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
    width: '520px',
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
    background: '#EFF6FF',
    borderBottom: `1px solid ${colors.border}`
  },
  matchLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    color: '#1E40AF',
    marginBottom: spacing.xs
  },
  matchText: {
    fontSize: typography.fontSize.sm,
    color: '#1E3A8A',
    fontStyle: 'italic'
  },
  confidence: {
    fontSize: typography.fontSize.xs,
    color: '#3B82F6',
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

  // Classification grid
  classificationGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: spacing.sm
  },
  classificationBtn: {
    padding: `${spacing.sm} ${spacing.xs}`,
    border: '2px solid',
    borderRadius: radius.md,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    textAlign: 'center'
  },
  classificationDesc: {
    fontSize: typography.fontSize.xs,
    color: colors.textMuted,
    fontStyle: 'italic',
    marginTop: spacing.xs
  },

  // Help grid
  helpGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: spacing.sm
  },
  helpBtn: {
    padding: spacing.sm,
    border: '2px solid',
    borderRadius: radius.md,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    cursor: 'pointer',
    transition: 'all 0.15s ease'
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
