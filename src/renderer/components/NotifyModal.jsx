import React, { useState, useEffect, useMemo } from 'react';
import { colors, spacing, typography, radius } from '../styles/tokens';

/**
 * NotifyModal — Multi-select modal for choosing people to notify about
 * a document or incident. Groups actors by classification category.
 *
 * Props:
 *   targetType: 'document' | 'incident' | 'event'
 *   targetId: ID of the document/incident/event
 *   onClose: () => void
 *   onNotified: (selectedActors) => void — called after saving
 */

const GROUPS = [
  {
    key: 'management',
    label: 'Management',
    classifications: ['bad_actor', 'enabler', 'responsible'],
    relationships: ['direct_supervisor', 'skip_level', 'senior_leadership', 'supervisor', 'executive'],
    color: '#DC2626'
  },
  {
    key: 'hr_legal',
    label: 'HR & Legal',
    classifications: [],
    relationships: ['hr', 'hr_investigator', 'legal', 'union_rep'],
    color: '#7C3AED'
  },
  {
    key: 'other',
    label: 'Other',
    classifications: null, // catch-all
    relationships: null,
    color: '#6B7280'
  }
];

export default function NotifyModal({ targetType, targetId, onClose, onNotified }) {
  const [allActors, setAllActors] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [existing, setExisting] = useState([]); // already-notified actor IDs
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const styles = getStyles();

  useEffect(() => {
    loadData();
  }, [targetId]);

  async function loadData() {
    setLoading(true);
    try {
      const [actorsResult, notifResult] = await Promise.all([
        window.api.actors.list(),
        window.api.notifications?.getForTarget(targetType, targetId)
          .catch(() => ({ success: false }))
          || Promise.resolve({ success: false })
      ]);

      if (actorsResult.success) {
        // Exclude "self" from the list
        setAllActors(actorsResult.actors.filter(a => a.is_self !== 1));
      }

      if (notifResult?.success && notifResult.notifications) {
        const existingIds = notifResult.notifications.map(n => n.actor_id);
        setExisting(existingIds);
        setSelected(new Set(existingIds));
      }
    } catch (e) {
      console.error('[NotifyModal] loadData error:', e);
    }
    setLoading(false);
  }

  // Group actors into Management / HR & Legal / Other
  const grouped = useMemo(() => {
    const assigned = new Set();
    const result = [];

    for (const group of GROUPS) {
      if (group.key === 'other') {
        // Catch-all for remaining actors
        const actors = allActors.filter(a => !assigned.has(a.id));
        if (actors.length > 0) {
          result.push({ ...group, actors });
        }
        continue;
      }

      const actors = allActors.filter(a => {
        if (assigned.has(a.id)) return false;
        const matchClass = group.classifications?.length > 0 &&
          group.classifications.includes(a.classification);
        const matchRel = group.relationships?.length > 0 &&
          group.relationships.includes(a.relationship_to_self);
        return matchClass || matchRel;
      });

      actors.forEach(a => assigned.add(a.id));
      if (actors.length > 0) {
        result.push({ ...group, actors });
      }
    }

    return result;
  }, [allActors]);

  function toggleActor(actorId) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(actorId)) {
        next.delete(actorId);
      } else {
        next.add(actorId);
      }
      return next;
    });
  }

  function toggleGroup(groupActors) {
    const allSelected = groupActors.every(a => selected.has(a.id));
    setSelected(prev => {
      const next = new Set(prev);
      groupActors.forEach(a => {
        if (allSelected) {
          next.delete(a.id);
        } else {
          next.add(a.id);
        }
      });
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      const actorIds = Array.from(selected);
      const result = await window.api.notifications?.setForTarget(targetType, targetId, actorIds)
        || { success: true };

      if (result.success !== false) {
        const notifiedActors = allActors.filter(a => selected.has(a.id));
        onNotified?.(notifiedActors);
        onClose();
      }
    } catch (e) {
      console.error('[NotifyModal] save error:', e);
    }
    setSaving(false);
  }

  const selectedActors = allActors.filter(a => selected.has(a.id));
  const summary = selectedActors.map(a => a.name.split(' ')[0]).join(', ');

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <div>
            <h2 style={styles.headerTitle}>Notify People</h2>
            <p style={styles.headerSubtitle}>
              Select who was notified about this {targetType}
            </p>
          </div>
          <button style={styles.closeBtn} onClick={onClose}>{'\u2715'}</button>
        </div>

        {/* Content */}
        <div style={styles.content}>
          {loading ? (
            <div style={styles.loadingText}>Loading people...</div>
          ) : allActors.length === 0 ? (
            <div style={styles.emptyText}>
              No people in this case yet. Add people from the People page first.
            </div>
          ) : (
            <>
              {grouped.map(group => {
                const allGroupSelected = group.actors.every(a => selected.has(a.id));
                const someGroupSelected = group.actors.some(a => selected.has(a.id));
                return (
                  <div key={group.key} style={styles.group}>
                    <div
                      style={styles.groupHeader}
                      onClick={() => toggleGroup(group.actors)}
                    >
                      <span style={{
                        ...styles.groupCheckbox,
                        background: allGroupSelected ? group.color : 'transparent',
                        borderColor: someGroupSelected ? group.color : colors.border,
                        color: allGroupSelected ? '#fff' : 'transparent'
                      }}>
                        {allGroupSelected ? '\u2713' : someGroupSelected ? '\u2500' : ''}
                      </span>
                      <span style={{ ...styles.groupLabel, color: group.color }}>
                        {group.label}
                      </span>
                      <span style={styles.groupCount}>
                        {group.actors.filter(a => selected.has(a.id)).length}/{group.actors.length}
                      </span>
                    </div>
                    <div style={styles.actorList}>
                      {group.actors.map(actor => {
                        const isSelected = selected.has(actor.id);
                        const wasAlreadyNotified = existing.includes(actor.id);
                        return (
                          <div
                            key={actor.id}
                            style={{
                              ...styles.actorRow,
                              background: isSelected ? `${group.color}08` : 'transparent',
                              borderColor: isSelected ? `${group.color}30` : 'transparent'
                            }}
                            onClick={() => toggleActor(actor.id)}
                          >
                            <span style={{
                              ...styles.checkbox,
                              background: isSelected ? group.color : 'transparent',
                              borderColor: isSelected ? group.color : colors.border
                            }}>
                              {isSelected && '\u2713'}
                            </span>
                            <span style={styles.actorInitials}>
                              {actor.name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2)}
                            </span>
                            <div style={styles.actorInfo}>
                              <div style={styles.actorName}>{actor.name}</div>
                              {actor.role && (
                                <div style={styles.actorRole}>{actor.role}</div>
                              )}
                            </div>
                            {wasAlreadyNotified && (
                              <span style={styles.alreadyTag}>previously</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* Summary + Footer */}
        {selected.size > 0 && (
          <div style={styles.summaryBar}>
            {'\uD83D\uDD14'} Notified: {summary}
          </div>
        )}
        <div style={styles.footer}>
          <button style={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button
            style={{
              ...styles.saveBtn,
              opacity: selected.size > 0 ? 1 : 0.5
            }}
            disabled={saving || selected.size === 0}
            onClick={handleSave}
          >
            {saving ? 'Saving...' : `Notify ${selected.size} ${selected.size === 1 ? 'Person' : 'People'}`}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * NotifySummary — Inline display of who was notified.
 * Shows: 🔔 Notified: Manager, HR, Legal
 */
export function NotifySummary({ actors, onClick }) {
  if (!actors || actors.length === 0) return null;
  const names = actors.map(a => a.name.split(' ')[0]);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: spacing.xs,
        fontSize: typography.fontSize.sm,
        color: '#16A34A',
        cursor: onClick ? 'pointer' : 'default',
        padding: `${spacing.xs} 0`
      }}
      onClick={onClick}
      title={actors.map(a => a.name).join(', ')}
    >
      <span>{'\uD83D\uDD14'}</span>
      <span>Notified: {names.join(', ')}</span>
      {onClick && <span style={{ color: colors.textMuted, fontSize: '11px' }}>(edit)</span>}
    </div>
  );
}

function getStyles() {
  return {
    overlay: {
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0, 0, 0, 0.4)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1200,
      animation: 'fadeIn 0.15s ease'
    },
    modal: {
      width: '480px',
      maxHeight: '80vh',
      background: colors.surface,
      borderRadius: radius.lg,
      boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden'
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      padding: `${spacing.md} ${spacing.lg}`,
      borderBottom: `1px solid ${colors.border}`,
      background: colors.surfaceAlt
    },
    headerTitle: {
      margin: 0,
      fontSize: typography.fontSize.lg,
      fontWeight: typography.fontWeight.semibold,
      color: colors.textPrimary
    },
    headerSubtitle: {
      margin: `${spacing.xs} 0 0 0`,
      fontSize: typography.fontSize.sm,
      color: colors.textMuted
    },
    closeBtn: {
      background: 'none',
      border: 'none',
      fontSize: '18px',
      cursor: 'pointer',
      color: colors.textMuted,
      padding: '4px 8px'
    },
    content: {
      flex: 1,
      overflowY: 'auto',
      padding: spacing.md
    },
    loadingText: {
      textAlign: 'center',
      padding: spacing.xl,
      color: colors.textMuted,
      fontSize: typography.fontSize.sm
    },
    emptyText: {
      textAlign: 'center',
      padding: spacing.xl,
      color: colors.textMuted,
      fontSize: typography.fontSize.sm
    },
    group: {
      marginBottom: spacing.md
    },
    groupHeader: {
      display: 'flex',
      alignItems: 'center',
      gap: spacing.sm,
      padding: `${spacing.xs} ${spacing.sm}`,
      cursor: 'pointer',
      borderRadius: radius.sm,
      userSelect: 'none'
    },
    groupCheckbox: {
      width: '18px',
      height: '18px',
      borderRadius: '4px',
      border: '2px solid',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '12px',
      fontWeight: 'bold',
      flexShrink: 0,
      transition: 'all 0.15s'
    },
    groupLabel: {
      fontSize: typography.fontSize.xs,
      fontWeight: typography.fontWeight.semibold,
      letterSpacing: '0.5px',
      textTransform: 'uppercase',
      flex: 1
    },
    groupCount: {
      fontSize: typography.fontSize.xs,
      color: colors.textMuted
    },
    actorList: {
      marginLeft: spacing.sm,
      marginTop: spacing.xs
    },
    actorRow: {
      display: 'flex',
      alignItems: 'center',
      gap: spacing.sm,
      padding: `6px ${spacing.sm}`,
      borderRadius: radius.sm,
      cursor: 'pointer',
      border: '1px solid transparent',
      transition: 'background 0.1s',
      marginBottom: '2px'
    },
    checkbox: {
      width: '16px',
      height: '16px',
      borderRadius: '3px',
      border: '2px solid',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '11px',
      fontWeight: 'bold',
      color: '#fff',
      flexShrink: 0,
      transition: 'all 0.15s'
    },
    actorInitials: {
      width: '28px',
      height: '28px',
      borderRadius: radius.full,
      background: colors.surfaceAlt,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: typography.fontSize.xs,
      fontWeight: typography.fontWeight.semibold,
      color: colors.textSecondary,
      flexShrink: 0
    },
    actorInfo: {
      flex: 1,
      minWidth: 0
    },
    actorName: {
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.medium,
      color: colors.textPrimary
    },
    actorRole: {
      fontSize: typography.fontSize.xs,
      color: colors.textMuted,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    },
    alreadyTag: {
      fontSize: '10px',
      color: '#16A34A',
      background: '#F0FDF4',
      padding: '1px 6px',
      borderRadius: radius.full,
      border: '1px solid #BBF7D0',
      flexShrink: 0
    },
    summaryBar: {
      padding: `${spacing.sm} ${spacing.lg}`,
      background: '#F0FDF4',
      borderTop: '1px solid #BBF7D0',
      fontSize: typography.fontSize.sm,
      color: '#16A34A',
      fontWeight: typography.fontWeight.medium
    },
    footer: {
      display: 'flex',
      justifyContent: 'flex-end',
      gap: spacing.sm,
      padding: `${spacing.md} ${spacing.lg}`,
      borderTop: `1px solid ${colors.border}`,
      background: colors.surfaceAlt
    },
    cancelBtn: {
      background: 'none',
      border: `1px solid ${colors.border}`,
      padding: '6px 16px',
      borderRadius: radius.sm,
      fontSize: typography.fontSize.sm,
      cursor: 'pointer',
      color: colors.textSecondary
    },
    saveBtn: {
      background: '#16A34A',
      color: '#fff',
      border: 'none',
      padding: '6px 20px',
      borderRadius: radius.sm,
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.semibold,
      cursor: 'pointer'
    }
  };
}
