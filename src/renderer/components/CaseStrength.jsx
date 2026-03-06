import React, { useState } from 'react';
import { colors, shadows, spacing, typography, radius } from '../styles/tokens';

export default function CaseStrength({ analysis, onClose }) {
  const [expandedPrecedent, setExpandedPrecedent] = useState(null);

  if (!analysis) return null;

  const { precedents, caseStrength, primaryPrecedent } = analysis;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.panel} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <div>
            <h2 style={styles.title}>Case Strength Analysis</h2>
            <p style={styles.subtitle}>Based on federal employment law precedents</p>
          </div>
          <button style={styles.closeBtn} onClick={onClose}>&times;</button>
        </div>

        {/* Overall strength */}
        <div style={styles.strengthSection}>
          <div style={styles.strengthMeter}>
            <div style={styles.strengthLabel}>Overall Strength</div>
            <div style={styles.strengthBarContainer}>
              <div
                style={{
                  ...styles.strengthBar,
                  width: `${caseStrength}%`,
                  background: caseStrength >= 70 ? colors.success :
                              caseStrength >= 40 ? colors.warning : colors.error
                }}
              />
            </div>
            <div style={styles.strengthValue}>{caseStrength}%</div>
          </div>
        </div>

        {/* Precedents */}
        <div style={styles.precedentsList}>
          {Object.entries(precedents).map(([key, prec]) => (
            <div key={key} style={styles.precedentCard}>
              <div
                style={styles.precedentHeader}
                onClick={() => setExpandedPrecedent(expandedPrecedent === key ? null : key)}
              >
                <div style={styles.precedentInfo}>
                  <div style={styles.precedentName}>{prec.name}</div>
                  <div style={styles.precedentCitation}>{prec.citation}</div>
                  <div style={styles.precedentStandard}>{prec.standard}</div>
                </div>
                <div style={styles.precedentScore}>
                  <div style={{
                    ...styles.scoreCircle,
                    borderColor: prec.alignmentPercent >= 70 ? colors.success :
                                 prec.alignmentPercent >= 40 ? colors.warning : colors.error
                  }}>
                    {prec.alignmentPercent}%
                  </div>
                </div>
              </div>

              {/* Expanded view */}
              {expandedPrecedent === key && (
                <div style={styles.precedentDetails}>
                  <div style={styles.elementsList}>
                    {Object.entries(prec.elements).map(([elemKey, elem]) => (
                      <div key={elemKey} style={styles.elementRow}>
                        <div style={{
                          ...styles.elementStatus,
                          color: elem.satisfied ? colors.success : colors.textMuted
                        }}>
                          {elem.satisfied ? '\u2713' : '\u25CB'}
                        </div>
                        <div style={styles.elementContent}>
                          <div style={{
                            ...styles.elementName,
                            color: elem.satisfied ? colors.textPrimary : colors.textMuted
                          }}>
                            {elem.name}
                            {elem.required && <span style={styles.requiredBadge}>Required</span>}
                          </div>
                          <div style={styles.elementDesc}>{elem.description}</div>
                          {elem.note && (
                            <div style={styles.elementNote}>{elem.note}</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Gaps */}
                  {prec.gaps.length > 0 && (
                    <div style={styles.gapsSection}>
                      <div style={styles.gapsTitle}>{'\uD83D\uDCCB'} To Strengthen This Claim:</div>
                      {prec.gaps.map((gap, i) => (
                        <div key={i} style={styles.gapItem}>
                          <div style={styles.gapElement}>{gap.element}</div>
                          <div style={styles.gapRec}>{gap.recommendation}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
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
    background: 'rgba(0, 0, 0, 0.3)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingTop: '5vh',
    zIndex: 1000,
    overflowY: 'auto'
  },
  panel: {
    width: '600px',
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
    cursor: 'pointer',
    padding: spacing.xs
  },

  // Strength meter
  strengthSection: {
    padding: spacing.lg,
    borderBottom: `1px solid ${colors.border}`
  },
  strengthMeter: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.md
  },
  strengthLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.textSecondary,
    minWidth: '120px'
  },
  strengthBarContainer: {
    flex: 1,
    height: '8px',
    background: colors.surfaceAlt,
    borderRadius: radius.full,
    overflow: 'hidden'
  },
  strengthBar: {
    height: '100%',
    borderRadius: radius.full,
    transition: 'width 0.5s ease'
  },
  strengthValue: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
    minWidth: '50px',
    textAlign: 'right'
  },

  // Precedents list
  precedentsList: {
    flex: 1,
    overflowY: 'auto',
    padding: spacing.md
  },
  precedentCard: {
    background: colors.surfaceAlt,
    borderRadius: radius.lg,
    marginBottom: spacing.md,
    overflow: 'hidden'
  },
  precedentHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    cursor: 'pointer',
    transition: 'background 0.15s ease'
  },
  precedentInfo: {
    flex: 1
  },
  precedentName: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textPrimary
  },
  precedentCitation: {
    fontSize: typography.fontSize.xs,
    fontFamily: typography.fontFamilyMono,
    color: colors.textMuted,
    marginTop: '2px'
  },
  precedentStandard: {
    fontSize: typography.fontSize.sm,
    color: colors.primary,
    marginTop: spacing.xs
  },
  precedentScore: {
    marginLeft: spacing.md
  },
  scoreCircle: {
    width: '56px',
    height: '56px',
    borderRadius: radius.full,
    border: '3px solid',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
    background: colors.surface
  },

  // Expanded details
  precedentDetails: {
    borderTop: `1px solid ${colors.border}`,
    padding: spacing.md,
    background: colors.surface
  },
  elementsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm
  },
  elementRow: {
    display: 'flex',
    gap: spacing.md
  },
  elementStatus: {
    width: '24px',
    height: '24px',
    borderRadius: radius.full,
    background: colors.surfaceAlt,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: typography.fontSize.sm,
    flexShrink: 0
  },
  elementContent: {
    flex: 1
  },
  elementName: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm
  },
  requiredBadge: {
    fontSize: typography.fontSize.xs,
    color: colors.textInverse,
    background: colors.textMuted,
    padding: `1px ${spacing.xs}`,
    borderRadius: radius.sm
  },
  elementDesc: {
    fontSize: typography.fontSize.xs,
    color: colors.textMuted,
    marginTop: '2px'
  },
  elementNote: {
    fontSize: typography.fontSize.xs,
    color: colors.success,
    marginTop: spacing.xs,
    fontStyle: 'italic'
  },

  // Gaps
  gapsSection: {
    marginTop: spacing.md,
    padding: spacing.md,
    background: '#FEF3C7',
    borderRadius: radius.md
  },
  gapsTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: '#92400E',
    marginBottom: spacing.sm
  },
  gapItem: {
    marginBottom: spacing.sm,
    paddingLeft: spacing.md
  },
  gapElement: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: '#92400E'
  },
  gapRec: {
    fontSize: typography.fontSize.xs,
    color: '#B45309',
    marginTop: '2px'
  }
};
