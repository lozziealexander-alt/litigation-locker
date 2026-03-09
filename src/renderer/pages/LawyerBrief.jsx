import React, { useState, useEffect, useCallback } from 'react';
import { colors, shadows, spacing, typography, radius } from '../styles/tokens';

// ── Strength helpers ─────────────────────────────────────────────────────────

function strengthLabel(score) {
  if (score >= 9) return { icon: '🟢', text: 'Very Strong' };
  if (score >= 7) return { icon: '🟢', text: 'Strong' };
  if (score >= 4) return { icon: '🟡', text: 'Moderate' };
  return { icon: '🔴', text: 'Weak' };
}

function strengthColor(score) {
  if (score >= 7) return '#16A34A';
  if (score >= 4) return '#F59E0B';
  return '#DC2626';
}

function elementIcon(status) {
  if (status === 'satisfied') return { icon: '✓', color: '#16A34A' };
  if (status === 'partial')   return { icon: '⚠', color: '#F59E0B' };
  return { icon: '✗', color: '#DC2626' };
}

function classificationLabel(cls) {
  const map = {
    bad_actor:         { label: 'Bad Actor',        color: '#DC2626' },
    enabler:           { label: 'Enabler',           color: '#F59E0B' },
    witness_supportive:{ label: 'Witness (Supportive)', color: '#16A34A' },
    witness_neutral:   { label: 'Witness (Neutral)', color: '#6B7280' },
    witness_hostile:   { label: 'Witness (Hostile)', color: '#7F1D1D' },
    corroborator:      { label: 'Corroborator',      color: '#2563EB' },
    bystander:         { label: 'Bystander',         color: '#9CA3AF' },
    self:              { label: 'You',               color: '#8B5CF6' },
    unknown:           { label: 'Unknown',           color: '#9CA3AF' }
  };
  return map[cls] || { label: cls || 'Unknown', color: '#9CA3AF' };
}

function formatDate(isoStr) {
  if (!isoStr) return '—';
  try {
    return new Date(isoStr).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return isoStr;
  }
}

// ── Tab constants ─────────────────────────────────────────────────────────────
const TABS = [
  { id: 'executive', label: 'Executive Summary' },
  { id: 'threads',   label: 'Thread Breakdown' },
  { id: 'timeline',  label: 'Timeline' },
  { id: 'actors',    label: 'Key People' },
  { id: 'gaps',      label: 'Red Flags' }
];

// ═════════════════════════════════════════════════════════════════════════════
export default function LawyerBrief() {
  const [brief, setBrief]               = useState(null);
  const [isLoading, setIsLoading]       = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeTab, setActiveTab]       = useState('executive');
  const [progress, setProgress]         = useState('');
  const [genError, setGenError]         = useState(null);
  const [versions, setVersions]         = useState([]);
  const [showVersions, setShowVersions] = useState(false);
  const [exportStatus, setExportStatus] = useState('');

  const s = getStyles();

  // Load latest brief on mount
  useEffect(() => {
    loadLatest();
  }, []);

  async function loadLatest() {
    setIsLoading(true);
    try {
      const res = await window.api.brief.latest();
      if (res.success && res.brief) setBrief(res.brief);
    } catch (e) {
      console.error('[LawyerBrief] loadLatest error:', e);
    }
    setIsLoading(false);
  }

  async function handleGenerate() {
    setIsGenerating(true);
    setGenError(null);
    setProgress('Gathering threads...');
    await delay(120);
    setProgress('Analysing incidents...');
    await delay(120);
    setProgress('Mapping actors...');
    await delay(120);
    setProgress('Building timeline...');
    await delay(120);
    setProgress('Scoring case strength...');

    try {
      const res = await window.api.brief.generate();
      if (res.success) {
        setBrief(res.brief);
        setActiveTab('executive');
      } else {
        setGenError(res.error || 'Generation failed — check that a case is open and try again.');
      }
    } catch (e) {
      setGenError(e?.message || 'Unexpected error generating brief.');
    }

    setProgress('');
    setIsGenerating(false);
  }

  async function handleLoadVersions() {
    try {
      const res = await window.api.brief.versions();
      if (res.success) setVersions(res.versions);
    } catch (e) {
      console.error('[LawyerBrief] loadVersions error:', e);
    }
    setShowVersions(v => !v);
  }

  async function handleExportMarkdown() {
    if (!brief) return;
    setExportStatus('Saving...');
    const res = await window.api.brief.exportMarkdown(brief);
    setExportStatus(res.success ? '✓ Saved' : '✗ Failed');
    setTimeout(() => setExportStatus(''), 2500);
  }

  async function handleExportHTML() {
    if (!brief) return;
    setExportStatus('Saving...');
    const res = await window.api.brief.exportHTML(brief);
    setExportStatus(res.success ? '✓ Saved' : '✗ Failed');
    setTimeout(() => setExportStatus(''), 2500);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div style={s.center}>
        <div style={s.spinner} />
        <p style={s.muted}>Loading brief...</p>
      </div>
    );
  }

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <div style={s.headerLeft}>
          <span style={s.headerIcon}>📄</span>
          <div>
            <h1 style={s.title}>Lawyer Brief</h1>
            <p style={s.subtitle}>Auto-generated case overview for attorney review</p>
          </div>
        </div>
        <div style={s.headerRight}>
          {brief?.isStale && (
            <div style={s.staleBanner}>
              ⚠️ Case updated since last brief
            </div>
          )}
          {brief && (
            <>
              <button style={s.btnSecondary} onClick={handleLoadVersions}>
                🕐 History
              </button>
              <button style={s.btnSecondary} onClick={handleExportMarkdown}>
                ↓ Markdown
              </button>
              <button style={s.btnSecondary} onClick={handleExportHTML}>
                ↓ HTML
              </button>
            </>
          )}
          {exportStatus && <span style={s.exportStatus}>{exportStatus}</span>}
          <button
            style={{ ...s.btnPrimary, opacity: isGenerating ? 0.7 : 1 }}
            onClick={handleGenerate}
            disabled={isGenerating}
          >
            {isGenerating ? '⏳ Generating...' : brief ? '🔄 Regenerate' : '✨ Generate Brief'}
          </button>
        </div>
      </div>

      {/* Progress */}
      {isGenerating && (
        <div style={s.progressBar}>
          <div style={s.progressInner} />
          <span style={s.progressText}>{progress}</span>
        </div>
      )}

      {/* Error banner */}
      {genError && !isGenerating && (
        <div style={s.errorBanner}>
          <span>⚠ {genError}</span>
          <button style={s.errorDismiss} onClick={() => setGenError(null)}>✕</button>
        </div>
      )}

      {/* Version history drawer */}
      {showVersions && versions.length > 0 && (
        <div style={s.versionDrawer}>
          <strong style={{ color: colors.textPrimary }}>Previous Briefs</strong>
          {versions.map(v => (
            <div key={v.id} style={s.versionRow}>
              <span style={{ color: colors.textSecondary }}>{formatDate(v.generated_at)}</span>
              <span style={{ color: strengthColor(v.strength_score || 0) }}>
                {(v.strength_score || 0).toFixed(1)}/10
              </span>
            </div>
          ))}
        </div>
      )}

      {!brief && !isGenerating && (
        <div style={s.empty}>
          <div style={s.emptyIcon}>📄</div>
          <h2 style={s.emptyTitle}>No brief yet</h2>
          <p style={s.emptyText}>
            Click <strong>Generate Brief</strong> to auto-build your case overview from all evidence, events, and actors.
          </p>
        </div>
      )}

      {brief && !isGenerating && (
        <>
          {/* Tab bar */}
          <div style={s.tabBar}>
            {TABS.map(tab => (
              <button
                key={tab.id}
                style={{ ...s.tab, ...(activeTab === tab.id ? s.tabActive : {}) }}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
                {tab.id === 'gaps' && (brief.redFlags?.length > 0) && (
                  <span style={s.badge}>{brief.redFlags.length}</span>
                )}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div style={s.content}>
            {activeTab === 'executive' && <ExecutiveSummary brief={brief} />}
            {activeTab === 'threads'   && <ThreadBreakdown brief={brief} />}
            {activeTab === 'timeline'  && <TimelineView    brief={brief} />}
            {activeTab === 'actors'    && <ActorSummary    brief={brief} />}
            {activeTab === 'gaps'      && <RedFlags        brief={brief} />}
          </div>
        </>
      )}
    </div>
  );
}

// ═══════════════ TAB: Executive Summary ════════════════════════════════════════
function ExecutiveSummary({ brief }) {
  const ex = brief.executive || {};
  const sl = strengthLabel(ex.strength || 0);
  const s = getStyles();

  return (
    <div style={s.section}>
      {/* Strength hero */}
      <div style={s.strengthHero}>
        <div style={{ ...s.strengthScore, color: strengthColor(ex.strength || 0) }}>
          {(ex.strength || 0).toFixed(1)}
          <span style={s.strengthDenom}>/10</span>
        </div>
        <div>
          <div style={{ ...s.strengthLabel, color: strengthColor(ex.strength || 0) }}>
            {sl.icon} {sl.text} Case
          </div>
          <div style={s.strengthSub}>Overall strength score</div>
        </div>
      </div>

      {/* Stats row */}
      <div style={s.statsRow}>
        <StatCard label="Case Type"     value={ex.caseType || 'Undetermined'} wide />
        <StatCard label="Time Span"     value={ex.timeSpan || 'No dates'} />
        <StatCard label="Duration"      value={ex.timeSpanDays > 0 ? `${ex.timeSpanDays} days` : '—'} />
        <StatCard label="Documents"     value={ex.counts?.documents ?? 0} />
        <StatCard label="Events"        value={ex.counts?.events ?? 0} />
        <StatCard label="Actors"        value={ex.counts?.actors ?? 0} />
        <StatCard label="Active Claims" value={ex.counts?.activeThreads ?? 0} />
      </div>

      {/* Strength meter */}
      <div style={s.meterWrap}>
        <div style={{ ...s.meter, width: `${((ex.strength || 0) / 10) * 100}%`, background: strengthColor(ex.strength || 0) }} />
      </div>

      {/* Brief meta */}
      {brief.generatedAt && (
        <p style={s.metaLine}>
          Generated {formatDate(brief.generatedAt)}
          {brief.isStale && <span style={s.staleTag}> · Outdated</span>}
        </p>
      )}
    </div>
  );
}

function StatCard({ label, value, wide }) {
  const s = getStyles();
  return (
    <div style={{ ...s.statCard, ...(wide ? s.statCardWide : {}) }}>
      <div style={s.statValue}>{value}</div>
      <div style={s.statLabel}>{label}</div>
    </div>
  );
}

// ═══════════════ TAB: Thread Breakdown ════════════════════════════════════════
function ThreadBreakdown({ brief }) {
  const s = getStyles();
  const threads = brief.threads || [];

  if (threads.length === 0) {
    return <EmptyState text="No active legal threads detected. Tag events with claim types to populate threads." />;
  }

  return (
    <div style={s.section}>
      {threads.map(thread => (
        <div key={thread.id} style={s.threadCard}>
          <div style={s.threadHeader}>
            <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
              <div style={{ ...s.threadDot, background: thread.color }} />
              <span style={s.threadName}>🧵 {thread.name}</span>
            </div>
            <div style={s.threadMeta}>
              <span style={s.threadCount}>{thread.eventCount} events · {thread.docCount} docs</span>
              <span style={{ ...s.threadStrength, color: strengthColor(thread.strength) }}>
                {(thread.strength || 0).toFixed(1)}/10
              </span>
            </div>
          </div>

          {/* Strength bar */}
          <div style={s.meterWrapSm}>
            <div style={{ ...s.meterSm, width: `${(thread.strength / 10) * 100}%`, background: thread.color }} />
          </div>

          {/* Elements */}
          <div style={s.elementGrid}>
            {(thread.elements || []).map(el => {
              const ei = elementIcon(el.status);
              return (
                <div key={el.key} style={s.elementRow}>
                  <span style={{ ...s.elementIcon, color: ei.color }}>{ei.icon}</span>
                  <span style={{ ...s.elementLabel, color: el.status === 'missing' ? colors.textMuted : colors.textPrimary }}>
                    {el.label}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Precedents */}
          {thread.precedents?.length > 0 && (
            <div style={s.precedentsRow}>
              <span style={s.precedentsLabel}>Precedents:</span>
              {thread.precedents.map(p => (
                <span key={p} style={s.precedentBadge}>{p}</span>
              ))}
            </div>
          )}

          {/* Key evidence */}
          {thread.keyEvidence?.length > 0 && (
            <div style={s.evidenceSection}>
              <div style={s.sectionSubLabel}>Key Evidence</div>
              {thread.keyEvidence.map(e => (
                <div key={e.id} style={s.evidenceRow}>
                  <span style={s.evidenceFile}>{e.filename || e.id}</span>
                  <span style={s.evidenceDate}>{e.date ? formatDate(e.date) : 'undated'}</span>
                </div>
              ))}
            </div>
          )}

          {/* Gaps */}
          {thread.gaps?.length > 0 && (
            <div style={s.gapsSection}>
              <div style={s.sectionSubLabel}>Gaps</div>
              {thread.gaps.map((g, i) => (
                <div key={i} style={s.gapRow}>⚠ {g}</div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ═══════════════ TAB: Timeline ════════════════════════════════════════════════
function TimelineView({ brief }) {
  const s = getStyles();
  const tl = brief.timeline || {};
  const moments = tl.criticalMoments || [];
  const gaps    = tl.gaps || [];

  if (moments.length === 0 && gaps.length === 0) {
    return <EmptyState text="No dated events found. Add dates to events to see the timeline." />;
  }

  // Build a merged sorted list of moments + gaps for interleaved display
  const items = [];
  let gapIdx = 0;
  for (let i = 0; i < moments.length; i++) {
    // Insert any gaps that start before or at this moment
    while (gapIdx < gaps.length && new Date(gaps[gapIdx].from) <= new Date(moments[i].date)) {
      items.push({ type: 'gap', data: gaps[gapIdx] });
      gapIdx++;
    }
    items.push({ type: 'event', data: moments[i] });
  }
  // Append any remaining gaps after the last event
  while (gapIdx < gaps.length) {
    items.push({ type: 'gap', data: gaps[gapIdx] });
    gapIdx++;
  }

  return (
    <div style={s.section}>
      <div style={s.timelineSpan}>
        <span style={s.timelineDate}>{tl.start ? formatDate(tl.start) : '?'}</span>
        <div style={s.timelineTrack} />
        <span style={s.timelineDate}>{tl.end ? formatDate(tl.end) : '?'}</span>
      </div>

      {gaps.length > 0 && (
        <div style={s.gapSummary}>
          ⚠ {gaps.length} documentation gap{gaps.length > 1 ? 's' : ''} detected
        </div>
      )}

      <div style={s.timelineList}>
        {items.map((item, i) => {
          if (item.type === 'event') {
            const m = item.data;
            return (
              <div key={m.id || `evt-${i}`} style={s.timelineMoment}>
                <div style={s.momentDot} />
                <div style={s.momentContent}>
                  <div style={s.momentDate}>{formatDate(m.date)}</div>
                  <div style={s.momentTitle}>{m.title}</div>
                  {m.tags?.length > 0 && (
                    <div style={s.momentTags}>
                      {m.tags.map(t => (
                        <span key={t} style={s.tagPill}>{t.replace(/_/g, ' ')}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          }
          // Gap item
          const g = item.data;
          return (
            <div key={`gap-${i}`} style={s.gapCard}>
              <span style={s.gapIcon}>🕳</span>
              <div>
                <div style={s.gapLabel}>{g.label}</div>
                <div style={s.gapSub}>Missing {g.days} days of documentation</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════ TAB: Actor Summary ═══════════════════════════════════════════
function ActorSummary({ brief }) {
  const s = getStyles();
  const actors = (brief.actors || []).filter(a => a.classification !== 'self');
  const self   = (brief.actors || []).find(a => a.classification === 'self');

  if (actors.length === 0 && !self) {
    return <EmptyState text="No actors found. Add people via the People tab to populate this section." />;
  }

  // Group by classification priority
  const groups = [
    { label: 'Bad Actors',   filter: a => a.classification === 'bad_actor' },
    { label: 'Enablers',     filter: a => a.classification === 'enabler' },
    { label: 'Witnesses',    filter: a => ['witness_supportive','witness_neutral','witness_hostile','corroborator'].includes(a.classification) },
    { label: 'Other People', filter: a => ['bystander','unknown',null,undefined].includes(a.classification) }
  ];

  return (
    <div style={s.section}>
      {groups.map(group => {
        const members = actors.filter(group.filter);
        if (members.length === 0) return null;
        return (
          <div key={group.label} style={s.actorGroup}>
            <h3 style={s.subHeading}>{group.label}</h3>
            {members.map(actor => <ActorCard key={actor.id} actor={actor} />)}
          </div>
        );
      })}
    </div>
  );
}

function ActorCard({ actor }) {
  const s = getStyles();
  const cls = classificationLabel(actor.classification);
  return (
    <div style={s.actorCard}>
      <div style={s.actorHeader}>
        <div style={s.actorAvatar}>{(actor.name || '?')[0].toUpperCase()}</div>
        <div>
          <div style={s.actorName}>{actor.name}</div>
          {actor.role && <div style={s.actorRole}>{actor.role}</div>}
        </div>
        <div style={{ ...s.actorClassBadge, background: cls.color + '22', color: cls.color }}>
          {cls.label}
        </div>
      </div>
      <div style={s.actorStats}>
        <span>📁 {actor.eventCount} events</span>
        <span>📄 {actor.docCount} docs</span>
        {actor.reliabilityLabel && <span>🔍 {actor.reliabilityLabel}</span>}
        {actor.still_employed === 'yes' && <span style={{ color: '#16A34A' }}>✓ Still employed</span>}
        {actor.still_employed === 'no'  && <span style={{ color: '#DC2626' }}>✗ No longer employed</span>}
        {actor.would_they_help === 'likely_helpful' && <span style={{ color: '#16A34A' }}>👍 Likely helpful</span>}
        {actor.would_they_help === 'likely_hostile' && <span style={{ color: '#DC2626' }}>👎 Likely hostile</span>}
      </div>
    </div>
  );
}

// ═══════════════ TAB: Red Flags ═══════════════════════════════════════════════
function RedFlags({ brief }) {
  const s = getStyles();
  const flags = brief.redFlags || [];
  const gaps  = brief.timeline?.gaps || [];

  if (flags.length === 0 && gaps.length === 0) {
    return (
      <div style={s.noFlags}>
        <span style={{ fontSize: '2em' }}>✅</span>
        <p style={s.noFlagsText}>No critical red flags detected. The case structure looks solid.</p>
      </div>
    );
  }

  return (
    <div style={s.section}>
      <div style={s.flagsIntro}>
        {flags.length} issue{flags.length !== 1 ? 's' : ''} identified that may weaken the case or need attention before filing.
      </div>

      {flags.map((f, i) => (
        <div key={i} style={{ ...s.flagCard, borderLeftColor: f.severity === 'high' ? '#DC2626' : '#F59E0B' }}>
          <div style={s.flagHeader}>
            <span style={{ ...s.flagSeverity, color: f.severity === 'high' ? '#DC2626' : '#F59E0B' }}>
              {f.severity === 'high' ? '🔴' : '🟡'} {f.severity === 'high' ? 'HIGH' : 'MEDIUM'}
            </span>
            <span style={s.flagLabel}>{f.label}</span>
          </div>
          {f.detail && <div style={s.flagDetail}>{f.detail}</div>}
        </div>
      ))}

      {gaps.length > 0 && (
        <>
          <h3 style={s.subHeading}>Timeline Gaps</h3>
          {gaps.map((g, i) => (
            <div key={i} style={{ ...s.flagCard, borderLeftColor: '#6366F1' }}>
              <div style={s.flagLabel}>{g.label}</div>
              <div style={s.flagDetail}>
                {g.days > 60
                  ? 'Significant gap — attorney will need explanation'
                  : 'Moderate gap — consider whether additional evidence exists for this period'}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ── Shared empty state ────────────────────────────────────────────────────────
function EmptyState({ text }) {
  const s = getStyles();
  return (
    <div style={s.emptyState}>
      <p style={s.emptyStateText}>{text}</p>
    </div>
  );
}

// ── Utility ──────────────────────────────────────────────────────────────────
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Styles ────────────────────────────────────────────────────────────────────
function getStyles() {
  return {
    page: {
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: colors.bg,
      overflow: 'hidden'
    },
    center: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.md,
      color: colors.textMuted
    },
    spinner: {
      width: 32,
      height: 32,
      border: `3px solid ${colors.border}`,
      borderTopColor: colors.primary,
      borderRadius: '50%',
      animation: 'spin 1s linear infinite'
    },
    muted: { color: colors.textMuted, fontSize: typography.fontSize.sm },

    // Header
    header: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: `${spacing.lg} ${spacing.xl}`,
      borderBottom: `1px solid ${colors.border}`,
      background: colors.surface,
      flexShrink: 0,
      flexWrap: 'wrap',
      gap: spacing.md
    },
    headerLeft: { display: 'flex', alignItems: 'center', gap: spacing.md },
    headerIcon: { fontSize: '2em' },
    title: {
      margin: 0,
      fontSize: typography.fontSize.xl,
      fontWeight: typography.fontWeight.semibold,
      color: colors.textPrimary
    },
    subtitle: { margin: 0, fontSize: typography.fontSize.sm, color: colors.textMuted },
    headerRight: { display: 'flex', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },

    staleBanner: {
      padding: `${spacing.xs} ${spacing.sm}`,
      background: '#FEF9C3',
      color: '#854D0E',
      borderRadius: radius.sm,
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.medium
    },
    exportStatus: { fontSize: typography.fontSize.sm, color: colors.success, fontWeight: typography.fontWeight.medium },

    btnPrimary: {
      padding: `${spacing.sm} ${spacing.lg}`,
      background: colors.primary,
      color: '#fff',
      border: 'none',
      borderRadius: radius.md,
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.semibold,
      cursor: 'pointer'
    },
    btnSecondary: {
      padding: `${spacing.sm} ${spacing.md}`,
      background: 'transparent',
      color: colors.textSecondary,
      border: `1px solid ${colors.border}`,
      borderRadius: radius.md,
      fontSize: typography.fontSize.sm,
      cursor: 'pointer'
    },

    // Progress
    progressBar: {
      position: 'relative',
      height: 36,
      background: colors.surfaceAlt,
      display: 'flex',
      alignItems: 'center',
      overflow: 'hidden',
      flexShrink: 0
    },
    progressInner: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: '60%',
      background: colors.primary,
      opacity: 0.15,
      animation: 'pulse 1.4s ease-in-out infinite'
    },
    progressText: {
      position: 'relative',
      zIndex: 1,
      padding: `0 ${spacing.xl}`,
      fontSize: typography.fontSize.sm,
      color: colors.textSecondary
    },

    errorBanner: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
      padding: `${spacing.sm} ${spacing.xl}`,
      background: '#FEF2F2',
      borderBottom: `1px solid #FECACA`,
      color: '#DC2626',
      fontSize: typography.fontSize.sm,
      flexShrink: 0
    },
    errorDismiss: {
      background: 'none',
      border: 'none',
      color: '#DC2626',
      cursor: 'pointer',
      fontSize: '14px',
      padding: '0 4px',
      flexShrink: 0
    },

    // Version drawer
    versionDrawer: {
      padding: `${spacing.sm} ${spacing.xl}`,
      background: colors.surfaceAlt,
      borderBottom: `1px solid ${colors.border}`,
      display: 'flex',
      gap: spacing.lg,
      alignItems: 'center',
      flexShrink: 0,
      flexWrap: 'wrap'
    },
    versionRow: { display: 'flex', gap: spacing.md, fontSize: typography.fontSize.sm },

    // Empty
    empty: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.lg,
      padding: spacing.xxl
    },
    emptyIcon: { fontSize: '3em' },
    emptyTitle: { margin: 0, fontSize: typography.fontSize.xl, color: colors.textPrimary },
    emptyText: { margin: 0, color: colors.textMuted, textAlign: 'center', maxWidth: 440 },

    // Tab bar
    tabBar: {
      display: 'flex',
      borderBottom: `1px solid ${colors.border}`,
      background: colors.surface,
      flexShrink: 0,
      overflowX: 'auto'
    },
    tab: {
      padding: `${spacing.md} ${spacing.lg}`,
      border: 'none',
      background: 'transparent',
      color: colors.textSecondary,
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.medium,
      cursor: 'pointer',
      borderBottom: '2px solid transparent',
      display: 'flex',
      alignItems: 'center',
      gap: spacing.xs,
      whiteSpace: 'nowrap'
    },
    tabActive: {
      color: colors.primary,
      borderBottomColor: colors.primary
    },
    badge: {
      background: '#DC2626',
      color: '#fff',
      fontSize: 10,
      fontWeight: 700,
      borderRadius: 999,
      padding: '1px 6px',
      lineHeight: '16px'
    },

    // Content
    content: {
      flex: 1,
      overflowY: 'auto',
      padding: spacing.xl
    },
    section: {
      display: 'flex',
      flexDirection: 'column',
      gap: spacing.lg,
      maxWidth: 900,
      margin: '0 auto'
    },

    // Executive summary
    strengthHero: {
      display: 'flex',
      alignItems: 'center',
      gap: spacing.xl,
      padding: spacing.xl,
      background: colors.surface,
      borderRadius: radius.lg,
      boxShadow: shadows.sm
    },
    strengthScore: {
      fontSize: 64,
      fontWeight: 800,
      lineHeight: 1,
      letterSpacing: '-2px'
    },
    strengthDenom: { fontSize: 28, fontWeight: 400, opacity: 0.6 },
    strengthLabel: { fontSize: typography.fontSize.xl, fontWeight: typography.fontWeight.semibold },
    strengthSub: { color: colors.textMuted, fontSize: typography.fontSize.sm, marginTop: 4 },

    statsRow: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: spacing.md
    },
    statCard: {
      background: colors.surface,
      borderRadius: radius.md,
      padding: `${spacing.md} ${spacing.lg}`,
      border: `1px solid ${colors.border}`,
      minWidth: 110,
      flex: '1 1 110px'
    },
    statCardWide: { flex: '2 1 220px' },
    statValue: { fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.semibold, color: colors.textPrimary },
    statLabel: { fontSize: typography.fontSize.xs, color: colors.textMuted, marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.05em' },

    meterWrap: {
      height: 8,
      background: colors.border,
      borderRadius: 99,
      overflow: 'hidden'
    },
    meter: { height: '100%', borderRadius: 99, transition: 'width 0.6s ease' },

    metaLine: { fontSize: typography.fontSize.sm, color: colors.textMuted, margin: 0 },
    staleTag: { color: '#F59E0B', fontWeight: typography.fontWeight.medium },

    // Thread cards
    threadCard: {
      background: colors.surface,
      borderRadius: radius.lg,
      padding: spacing.xl,
      border: `1px solid ${colors.border}`,
      display: 'flex',
      flexDirection: 'column',
      gap: spacing.md,
      boxShadow: shadows.sm
    },
    threadHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
    threadDot: { width: 10, height: 10, borderRadius: '50%', flexShrink: 0 },
    threadName: { fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.semibold, color: colors.textPrimary },
    threadMeta: { display: 'flex', gap: spacing.md, alignItems: 'center' },
    threadCount: { fontSize: typography.fontSize.sm, color: colors.textMuted },
    threadStrength: { fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.bold },
    meterWrapSm: { height: 6, background: colors.border, borderRadius: 99, overflow: 'hidden' },
    meterSm: { height: '100%', borderRadius: 99 },

    elementGrid: { display: 'flex', flexDirection: 'column', gap: spacing.xs },
    elementRow: { display: 'flex', alignItems: 'flex-start', gap: spacing.sm },
    elementIcon: { fontSize: 14, fontWeight: 700, flexShrink: 0, marginTop: 1 },
    elementLabel: { fontSize: typography.fontSize.sm },

    precedentsRow: { display: 'flex', flexWrap: 'wrap', gap: spacing.xs, alignItems: 'center' },
    precedentsLabel: { fontSize: typography.fontSize.xs, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' },
    precedentBadge: {
      padding: '2px 8px',
      background: colors.surfaceAlt,
      borderRadius: radius.sm,
      fontSize: typography.fontSize.xs,
      color: colors.textSecondary,
      border: `1px solid ${colors.border}`
    },

    evidenceSection: { display: 'flex', flexDirection: 'column', gap: spacing.xs },
    gapsSection: { display: 'flex', flexDirection: 'column', gap: spacing.xs },
    sectionSubLabel: { fontSize: typography.fontSize.xs, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: typography.fontWeight.medium },
    evidenceRow: { display: 'flex', justifyContent: 'space-between', fontSize: typography.fontSize.sm, color: colors.textSecondary },
    evidenceFile: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    evidenceDate: { flexShrink: 0, marginLeft: spacing.sm, color: colors.textMuted },
    gapRow: { fontSize: typography.fontSize.sm, color: '#F59E0B' },

    // Timeline
    timelineSpan: {
      display: 'flex',
      alignItems: 'center',
      gap: spacing.md
    },
    timelineDate: { fontSize: typography.fontSize.sm, color: colors.textSecondary, flexShrink: 0 },
    timelineTrack: { flex: 1, height: 2, background: colors.border },
    gapSummary: {
      padding: `${spacing.sm} ${spacing.md}`,
      background: '#FEF9C3',
      borderRadius: radius.md,
      color: '#854D0E',
      fontSize: typography.fontSize.sm
    },
    timelineList: { display: 'flex', flexDirection: 'column', gap: 0, paddingLeft: spacing.md },
    timelineMoment: { display: 'flex', gap: spacing.md, position: 'relative', paddingBottom: spacing.lg },
    momentDot: { width: 10, height: 10, borderRadius: '50%', background: colors.primary, flexShrink: 0, marginTop: 4 },
    momentContent: { flex: 1, paddingBottom: spacing.md, borderBottom: `1px solid ${colors.borderLight}` },
    momentDate: { fontSize: typography.fontSize.xs, color: colors.textMuted, marginBottom: 2 },
    momentTitle: { fontSize: typography.fontSize.base, fontWeight: typography.fontWeight.medium, color: colors.textPrimary },
    momentTags: { display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 },
    tagPill: {
      padding: '1px 6px',
      background: colors.surfaceAlt,
      borderRadius: 99,
      fontSize: 10,
      color: colors.textSecondary,
      border: `1px solid ${colors.border}`
    },
    gapCard: {
      display: 'flex',
      gap: spacing.md,
      alignItems: 'flex-start',
      padding: spacing.md,
      background: '#FFF7ED',
      borderRadius: radius.md,
      border: '1px solid #FED7AA'
    },
    gapIcon: { fontSize: '1.5em' },
    gapLabel: { fontWeight: typography.fontWeight.medium, color: '#9A3412', fontSize: typography.fontSize.sm },
    gapSub: { color: '#C2410C', fontSize: typography.fontSize.xs, marginTop: 2 },

    subHeading: {
      margin: `${spacing.md} 0 0 0`,
      fontSize: typography.fontSize.base,
      fontWeight: typography.fontWeight.semibold,
      color: colors.textPrimary
    },

    // Actors
    actorGroup: { display: 'flex', flexDirection: 'column', gap: spacing.sm },
    actorCard: {
      background: colors.surface,
      border: `1px solid ${colors.border}`,
      borderRadius: radius.md,
      padding: spacing.lg,
      display: 'flex',
      flexDirection: 'column',
      gap: spacing.sm,
      boxShadow: shadows.sm
    },
    actorHeader: { display: 'flex', alignItems: 'center', gap: spacing.md },
    actorAvatar: {
      width: 36,
      height: 36,
      borderRadius: '50%',
      background: colors.primary,
      color: '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontWeight: typography.fontWeight.bold,
      fontSize: typography.fontSize.base,
      flexShrink: 0
    },
    actorName: { fontWeight: typography.fontWeight.semibold, color: colors.textPrimary },
    actorRole: { fontSize: typography.fontSize.sm, color: colors.textMuted },
    actorClassBadge: {
      marginLeft: 'auto',
      padding: '2px 10px',
      borderRadius: 99,
      fontSize: typography.fontSize.xs,
      fontWeight: typography.fontWeight.medium
    },
    actorStats: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: spacing.md,
      fontSize: typography.fontSize.sm,
      color: colors.textSecondary
    },

    // Red flags
    flagsIntro: {
      color: colors.textSecondary,
      fontSize: typography.fontSize.sm,
      padding: `${spacing.sm} 0`
    },
    flagCard: {
      background: colors.surface,
      borderLeft: '4px solid #DC2626',
      borderRadius: `0 ${radius.md} ${radius.md} 0`,
      padding: `${spacing.md} ${spacing.lg}`,
      boxShadow: shadows.sm,
      display: 'flex',
      flexDirection: 'column',
      gap: spacing.xs
    },
    flagHeader: { display: 'flex', alignItems: 'center', gap: spacing.md },
    flagSeverity: { fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.bold, textTransform: 'uppercase', letterSpacing: '0.05em' },
    flagLabel: { fontWeight: typography.fontWeight.medium, color: colors.textPrimary, fontSize: typography.fontSize.base },
    flagDetail: { color: colors.textSecondary, fontSize: typography.fontSize.sm },

    noFlags: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.md,
      padding: spacing.xxl
    },
    noFlagsText: { color: colors.textMuted, textAlign: 'center' },

    // Empty state (inside tab)
    emptyState: {
      padding: spacing.xxl,
      textAlign: 'center'
    },
    emptyStateText: { color: colors.textMuted, fontSize: typography.fontSize.sm }
  };
}
