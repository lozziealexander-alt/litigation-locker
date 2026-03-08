import React, { useState, useEffect } from 'react';
import { colors, shadows, spacing, typography, radius } from '../styles/tokens';
import ActorApproval from '../components/ActorApproval';

const CLASSIFICATION_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'self', label: 'Self' },
  { value: 'bad_actor', label: 'Bad Actor' },
  { value: 'enabler', label: 'Enabler' },
  { value: 'witness_supportive', label: 'Supportive Witness' },
  { value: 'witness_neutral', label: 'Neutral Witness' },
  { value: 'witness_hostile', label: 'Hostile Witness' },
  { value: 'corroborator', label: 'Corroborator' },
  { value: 'bystander', label: 'Bystander' }
];

const CLASSIFICATION_COLORS = {
  bad_actor: '#DC2626',
  enabler: '#F97316',
  witness_supportive: '#16A34A',
  witness_neutral: '#6B7280',
  witness_hostile: '#DC2626',
  bystander: '#9CA3AF',
  corroborator: '#16A34A',
  self: '#2563EB',
  unknown: '#6B7280'
};

const RELATIONSHIP_LABELS = {
  direct_supervisor: 'Direct Supervisor',
  skip_level: 'Skip-Level',
  senior_leadership: 'Senior Leadership',
  hr: 'HR',
  hr_investigator: 'HR Investigator',
  peer: 'Peer/Colleague',
  subordinate: 'Subordinate',
  union_rep: 'Union Rep',
  legal: 'Legal Counsel',
  witness: 'Witness',
  other: 'Other',
  // Legacy values for backwards compat
  supervisor: 'Supervisor',
  executive: 'Executive',
  direct_report: 'Direct Report'
};

export default function People({ onSelectActor }) {
  const [actors, setActors] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterClassification, setFilterClassification] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');

  // Rescan state
  const [scanning, setScanning] = useState(false);
  const [pendingActors, setPendingActors] = useState([]);
  const [showActorApproval, setShowActorApproval] = useState(false);

  // Merge/duplicates state
  const [duplicates, setDuplicates] = useState([]);
  const [showMergePanel, setShowMergePanel] = useState(false);
  const [checkingDupes, setCheckingDupes] = useState(false);

  const styles = getStyles();

  useEffect(() => {
    loadActors();
  }, []);

  async function loadActors() {
    const result = await window.api.actors.list();
    if (result.success) {
      setActors(result.actors);
    }
  }

  async function handleAddActor() {
    if (!newName.trim()) return;
    const result = await window.api.actors.create({ name: newName.trim() });
    if (result.success) {
      setNewName('');
      setShowAddForm(false);
      await loadActors();
    }
  }

  async function handleRescan() {
    setScanning(true);
    try {
      const result = await window.api.actors.rescan();
      if (result.success && result.detectedActors && result.detectedActors.length > 0) {
        setPendingActors(result.detectedActors);
        setShowActorApproval(true);
      } else {
        setPendingActors([]);
        alert(result.success ? 'No new people found in documents.' : `Scan failed: ${result.error}`);
      }
    } catch (err) {
      alert('Scan failed: ' + err.message);
    }
    setScanning(false);
  }

  async function handleApproveActor(actorData) {
    const result = await window.api.actors.create(actorData);
    if (result.success) {
      setActors(prev => [...prev, result.actor]);
    }
  }

  function handleDismissActor() {
    // nothing needed
  }

  async function handleCheckDuplicates() {
    setCheckingDupes(true);
    const result = await window.api.actors.checkDuplicates();
    setCheckingDupes(false);
    if (result.success && result.duplicates.length > 0) {
      setDuplicates(result.duplicates);
      setShowMergePanel(true);
    } else {
      setDuplicates([]);
      alert(result.success ? 'No duplicate people found.' : `Check failed: ${result.error}`);
    }
  }

  async function handleMerge(keepId, mergeId) {
    const result = await window.api.actors.merge(keepId, mergeId);
    if (result.success) {
      // Remove merged pair from list, close panel if none remain
      setDuplicates(prev => {
        const remaining = prev.filter(d => !(d.actor1.id === mergeId || d.actor2.id === mergeId));
        if (remaining.length === 0) {
          setShowMergePanel(false);
        }
        return remaining;
      });
      await loadActors();
    }
  }

  function getInitials(name) {
    return name
      .split(' ')
      .map(p => p[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }

  function getClassificationLabel(classification) {
    const opt = CLASSIFICATION_OPTIONS.find(c => c.value === classification);
    return opt ? opt.label : classification || 'Unknown';
  }

  const filtered = actors.filter(a => {
    if (filterClassification && a.classification !== filterClassification) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      let aliases = [];
      try { aliases = JSON.parse(a.aliases || '[]'); } catch {}
      const nameMatch = a.name.toLowerCase().includes(q);
      const aliasMatch = aliases.some(alias => alias.toLowerCase().includes(q));
      if (!nameMatch && !aliasMatch) return false;
    }
    return true;
  });

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>People</h1>
          <p style={styles.subtitle}>{actors.length} people in this case</p>
        </div>
        <div style={styles.headerActions}>
          <button
            style={styles.secondaryButton}
            onClick={handleCheckDuplicates}
            disabled={checkingDupes}
          >
            {checkingDupes ? 'Checking...' : 'Find Duplicates'}
          </button>
          <button
            style={styles.secondaryButton}
            onClick={handleRescan}
            disabled={scanning}
          >
            {scanning ? 'Scanning...' : 'Rescan Documents'}
          </button>
          <button style={styles.addButton} onClick={() => setShowAddForm(true)}>
            + Add Person
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={styles.filterBar}>
        <input
          type="text"
          placeholder="Search by name..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          style={styles.searchInput}
        />
        <select
          value={filterClassification}
          onChange={e => setFilterClassification(e.target.value)}
          style={styles.filterSelect}
        >
          {CLASSIFICATION_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Add form */}
      {showAddForm && (
        <div style={styles.addForm}>
          <input
            type="text"
            placeholder="Full name"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddActor()}
            style={styles.addInput}
            autoFocus
          />
          <button style={styles.addConfirmBtn} onClick={handleAddActor}>Add</button>
          <button style={styles.addCancelBtn} onClick={() => { setShowAddForm(false); setNewName(''); }}>Cancel</button>
        </div>
      )}

      {/* Actor grid */}
      <div style={styles.grid}>
        {filtered.map(actor => {
          const classColor = CLASSIFICATION_COLORS[actor.classification] || '#6B7280';
          const isSelf = actor.is_self === 1;

          return (
            <div
              key={actor.id}
              style={{
                ...styles.card,
                ...(isSelf ? styles.cardSelf : {})
              }}
              onClick={() => onSelectActor(actor)}
            >
              {/* Avatar */}
              <div style={{
                ...styles.avatar,
                background: `${classColor}15`,
                color: classColor
              }}>
                {getInitials(actor.name)}
              </div>

              {/* Info */}
              <div style={styles.cardInfo}>
                <div style={styles.cardName}>
                  {actor.name}
                  {isSelf && <span style={styles.selfTag}>You</span>}
                  {!!actor.in_reporting_chain && <span style={styles.chainTag}>Chain</span>}
                </div>
                {actor.email && (
                  <div style={styles.cardEmail}>{actor.email}</div>
                )}
                {actor.role && (
                  <div style={styles.cardRole}>{actor.role}</div>
                )}
                {(() => {
                  let aliases = [];
                  try { aliases = JSON.parse(actor.aliases || '[]'); } catch {}
                  return aliases.length > 0 ? (
                    <div style={styles.cardAliases}>aka {aliases.join(', ')}</div>
                  ) : null;
                })()}
                <div style={styles.cardMeta}>
                  <span style={{
                    ...styles.classificationTag,
                    background: `${classColor}15`,
                    color: classColor
                  }}>
                    {getClassificationLabel(actor.classification)}
                  </span>
                  {actor.relationship_to_self && (
                    <span style={styles.relationshipText}>
                      {RELATIONSHIP_LABELS[actor.relationship_to_self] || actor.relationship_to_self}
                    </span>
                  )}
                </div>
              </div>

              {/* Stats */}
              <div style={styles.cardStats}>
                <div style={styles.statItem}>
                  <span style={styles.statValue}>{actor.appearance_count || 0}</span>
                  <span style={styles.statLabel}>docs</span>
                </div>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div style={styles.empty}>
            {actors.length === 0
              ? 'No people detected yet. Click "Rescan Documents" to auto-detect people, or "Add Person" to add manually.'
              : 'No people match your filters.'}
          </div>
        )}
      </div>

      {/* Actor approval modal (from rescan) */}
      {showActorApproval && pendingActors.length > 0 && (
        <ActorApproval
          actors={pendingActors}
          onApprove={handleApproveActor}
          onDismiss={handleDismissActor}
          onClose={() => {
            setShowActorApproval(false);
            setPendingActors([]);
          }}
        />
      )}

      {/* Merge duplicates modal */}
      {showMergePanel && duplicates.length > 0 && (
        <div style={styles.overlay}>
          <div style={styles.mergeModal}>
            <div style={styles.mergeHeader}>
              <div>
                <h2 style={styles.mergeTitle}>Potential Duplicates</h2>
                <p style={styles.mergeSubtitle}>{duplicates.length} potential duplicate{duplicates.length !== 1 ? 's' : ''} found</p>
              </div>
              <button style={styles.closeBtn} onClick={() => setShowMergePanel(false)}>×</button>
            </div>
            <div style={styles.mergeList}>
              {duplicates.map((dup, i) => (
                <div key={i} style={styles.mergeRow}>
                  <div style={styles.mergeActors}>
                    <div style={styles.mergeName}>
                      <strong>{dup.actor1.name}</strong>
                      <span style={styles.mergeClassification}>
                        {getClassificationLabel(dup.actor1.classification)}
                      </span>
                    </div>
                    <span style={styles.mergeArrow}>↔</span>
                    <div style={styles.mergeName}>
                      <strong>{dup.actor2.name}</strong>
                      <span style={styles.mergeClassification}>
                        {getClassificationLabel(dup.actor2.classification)}
                      </span>
                    </div>
                  </div>
                  <div style={styles.mergeReason}>{dup.reason}</div>
                  <div style={styles.mergeActions}>
                    <button
                      style={styles.mergeBtn}
                      onClick={() => handleMerge(dup.actor1.id, dup.actor2.id)}
                      title={`Keep "${dup.actor1.name}", merge "${dup.actor2.name}" into it`}
                    >
                      Keep {dup.actor1.name.split(' ')[0]}
                    </button>
                    <button
                      style={styles.mergeBtn}
                      onClick={() => handleMerge(dup.actor2.id, dup.actor1.id)}
                      title={`Keep "${dup.actor2.name}", merge "${dup.actor1.name}" into it`}
                    >
                      Keep {dup.actor2.name.split(' ')[0]}
                    </button>
                    <button
                      style={styles.skipMergeBtn}
                      onClick={() => setDuplicates(prev => prev.filter(d =>
                        !(d.actor1.id === dup.actor1.id && d.actor2.id === dup.actor2.id)
                      ))}
                    >
                      Skip
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function getStyles() {
  return {
    container: {
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden'
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: `${spacing.lg} ${spacing.xl}`,
      borderBottom: `1px solid ${colors.border}`
    },
    title: {
      fontSize: typography.fontSize.xl,
      fontWeight: typography.fontWeight.semibold,
      color: colors.textPrimary,
      margin: 0
    },
    subtitle: {
      fontSize: typography.fontSize.sm,
      color: colors.textMuted,
      margin: `${spacing.xs} 0 0 0`
    },
    headerActions: {
      display: 'flex',
      gap: spacing.sm,
      alignItems: 'center'
    },
    addButton: {
      padding: `${spacing.sm} ${spacing.lg}`,
      background: colors.primary,
      color: colors.textInverse,
      border: 'none',
      borderRadius: radius.md,
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.medium,
      cursor: 'pointer'
    },
    secondaryButton: {
      padding: `${spacing.sm} ${spacing.md}`,
      background: colors.surfaceAlt,
      color: colors.textSecondary,
      border: `1px solid ${colors.border}`,
      borderRadius: radius.md,
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.medium,
      cursor: 'pointer'
    },

    // Filters
    filterBar: {
      display: 'flex',
      gap: spacing.md,
      padding: `${spacing.md} ${spacing.xl}`,
      borderBottom: `1px solid ${colors.border}`,
      background: colors.surfaceAlt
    },
    searchInput: {
      flex: 1,
      padding: spacing.sm,
      border: `1px solid ${colors.border}`,
      borderRadius: radius.md,
      fontSize: typography.fontSize.sm,
      color: colors.textPrimary,
      background: colors.surface,
      outline: 'none'
    },
    filterSelect: {
      padding: spacing.sm,
      border: `1px solid ${colors.border}`,
      borderRadius: radius.md,
      fontSize: typography.fontSize.sm,
      color: colors.textPrimary,
      background: colors.surface,
      cursor: 'pointer',
      outline: 'none',
      minWidth: '160px'
    },

    // Add form
    addForm: {
      display: 'flex',
      gap: spacing.sm,
      padding: `${spacing.md} ${spacing.xl}`,
      borderBottom: `1px solid ${colors.border}`,
      background: '#EFF6FF'
    },
    addInput: {
      flex: 1,
      padding: spacing.sm,
      border: `1px solid ${colors.primary}`,
      borderRadius: radius.md,
      fontSize: typography.fontSize.sm,
      color: colors.textPrimary,
      background: colors.surface,
      outline: 'none'
    },
    addConfirmBtn: {
      padding: `${spacing.sm} ${spacing.lg}`,
      background: colors.primary,
      color: colors.textInverse,
      border: 'none',
      borderRadius: radius.md,
      fontSize: typography.fontSize.sm,
      cursor: 'pointer'
    },
    addCancelBtn: {
      padding: `${spacing.sm} ${spacing.lg}`,
      background: colors.surfaceAlt,
      color: colors.textSecondary,
      border: `1px solid ${colors.border}`,
      borderRadius: radius.md,
      fontSize: typography.fontSize.sm,
      cursor: 'pointer'
    },

    // Grid
    grid: {
      flex: 1,
      overflowY: 'auto',
      padding: spacing.xl,
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
      gap: spacing.md,
      alignContent: 'start'
    },
    card: {
      display: 'flex',
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.md,
      background: colors.surface,
      border: `1px solid ${colors.border}`,
      borderRadius: radius.lg,
      cursor: 'pointer',
      transition: 'box-shadow 0.15s ease, border-color 0.15s ease'
    },
    cardSelf: {
      borderColor: '#2563EB',
      borderWidth: '2px'
    },
    avatar: {
      width: '44px',
      height: '44px',
      borderRadius: radius.full,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: typography.fontSize.md,
      fontWeight: typography.fontWeight.semibold,
      flexShrink: 0
    },
    cardInfo: {
      flex: 1,
      minWidth: 0
    },
    cardName: {
      fontSize: typography.fontSize.base,
      fontWeight: typography.fontWeight.medium,
      color: colors.textPrimary,
      display: 'flex',
      alignItems: 'center',
      gap: spacing.sm
    },
    selfTag: {
      fontSize: typography.fontSize.xs,
      fontWeight: typography.fontWeight.semibold,
      color: '#2563EB',
      background: '#EFF6FF',
      padding: `1px ${spacing.xs}`,
      borderRadius: radius.sm
    },
    chainTag: {
      fontSize: typography.fontSize.xs,
      fontWeight: typography.fontWeight.semibold,
      color: '#7C3AED',
      background: '#F3E8FF',
      padding: `1px ${spacing.xs}`,
      borderRadius: radius.sm
    },
    cardEmail: {
      fontSize: typography.fontSize.xs,
      color: colors.textMuted,
      marginTop: '1px',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    },
    cardRole: {
      fontSize: typography.fontSize.sm,
      color: colors.textSecondary,
      marginTop: '2px',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    },
    cardAliases: {
      fontSize: typography.fontSize.xs,
      color: colors.textMuted,
      fontStyle: 'italic',
      marginTop: '1px',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    },
    cardMeta: {
      display: 'flex',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.xs
    },
    classificationTag: {
      fontSize: typography.fontSize.xs,
      fontWeight: typography.fontWeight.medium,
      padding: `1px ${spacing.sm}`,
      borderRadius: radius.full
    },
    relationshipText: {
      fontSize: typography.fontSize.xs,
      color: colors.textMuted
    },
    cardStats: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      flexShrink: 0
    },
    statItem: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center'
    },
    statValue: {
      fontSize: typography.fontSize.md,
      fontWeight: typography.fontWeight.semibold,
      color: colors.textPrimary
    },
    statLabel: {
      fontSize: typography.fontSize.xs,
      color: colors.textMuted
    },
    empty: {
      gridColumn: '1 / -1',
      textAlign: 'center',
      padding: spacing.xxl,
      color: colors.textMuted,
      fontSize: typography.fontSize.base
    },

    // Overlay (shared by merge modal)
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

    // Merge modal
    mergeModal: {
      width: '560px',
      maxHeight: '80vh',
      background: colors.surface,
      borderRadius: radius.xl,
      boxShadow: shadows.xl,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column'
    },
    mergeHeader: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      padding: spacing.lg,
      borderBottom: `1px solid ${colors.border}`,
      background: colors.surfaceAlt
    },
    mergeTitle: {
      fontSize: typography.fontSize.lg,
      fontWeight: typography.fontWeight.semibold,
      color: colors.textPrimary,
      margin: 0
    },
    mergeSubtitle: {
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
    mergeList: {
      flex: 1,
      overflowY: 'auto',
      padding: spacing.md
    },
    mergeRow: {
      padding: spacing.md,
      borderBottom: `1px solid ${colors.border}`,
      marginBottom: spacing.sm
    },
    mergeActors: {
      display: 'flex',
      alignItems: 'center',
      gap: spacing.md,
      marginBottom: spacing.sm
    },
    mergeName: {
      display: 'flex',
      flexDirection: 'column',
      gap: '2px'
    },
    mergeArrow: {
      fontSize: typography.fontSize.lg,
      color: colors.textMuted
    },
    mergeClassification: {
      fontSize: typography.fontSize.xs,
      color: colors.textMuted
    },
    mergeReason: {
      fontSize: typography.fontSize.xs,
      color: colors.textMuted,
      fontStyle: 'italic',
      marginBottom: spacing.sm
    },
    mergeActions: {
      display: 'flex',
      gap: spacing.sm
    },
    mergeBtn: {
      padding: `${spacing.xs} ${spacing.md}`,
      background: colors.primary,
      color: colors.textInverse,
      border: 'none',
      borderRadius: radius.md,
      fontSize: typography.fontSize.xs,
      fontWeight: typography.fontWeight.medium,
      cursor: 'pointer'
    },
    skipMergeBtn: {
      padding: `${spacing.xs} ${spacing.md}`,
      background: colors.surfaceAlt,
      color: colors.textSecondary,
      border: `1px solid ${colors.border}`,
      borderRadius: radius.md,
      fontSize: typography.fontSize.xs,
      cursor: 'pointer'
    }
  };
}
