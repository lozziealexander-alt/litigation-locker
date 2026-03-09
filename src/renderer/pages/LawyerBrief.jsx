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
  { id: 'summary', label: 'Case Summary' },
  { id: 'causal',  label: 'Causal Links' },
  { id: 'actors',  label: 'Key People' },
  { id: 'gaps',    label: 'Red Flags' }
];

// ═════════════════════════════════════════════════════════════════════════════
export default function LawyerBrief({ onNavigateToThread, onNavigateToConnections }) {
  const [brief, setBrief]               = useState(null);
  const [isLoading, setIsLoading]       = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeTab, setActiveTab]       = useState('summary');
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
      console.error('[CaseOverview] loadLatest error:', e);
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
        setActiveTab('summary');
      } else {
        setGenError(res.error || 'Generation failed — check that a case is open and try again.');
      }
    } catch (e) {
      setGenError(e?.message || 'Unexpected error generating overview.');
    }

    setProgress('');
    setIsGenerating(false);
  }

  async function handleLoadVersions() {
    const res = await window.api.brief.versions();
    if (res.success) setVersions(res.versions);
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
        <p style={s.muted}>Loading overview...</p>
      </div>
    );
  }

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <div style={s.headerLeft}>
          <span style={s.headerIcon}>⚖️</span>
          <div>
            <h1 style={s.title}>Case Overview</h1>
            <p style={s.subtitle}>Auto-generated case summary for attorney review</p>
          </div>
        </div>
        <div style={s.headerRight}>
          {brief?.isStale && (
            <div style={s.staleBanner}>
              ⚠️ Case updated since last overview
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
            {isGenerating ? '⏳ Generating...' : brief ? '🔄 Regenerate' : '✨ Generate Overview'}
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
          <strong style={{ color: colors.textPrimary }}>Previous Overviews</strong>
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
          <div style={s.emptyIcon}>⚖️</div>
          <h2 style={s.emptyTitle}>No overview yet</h2>
          <p style={s.emptyText}>
            Click <strong>Generate Overview</strong> to auto-build your case summary from all evidence, events, and actors.
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
            {activeTab === 'summary' && <CaseSummary brief={brief} onNavigateToThread={onNavigateToThread} />}
            {activeTab === 'causal'  && <CausalLinks onNavigateToConnections={onNavigateToConnections} />}
            {activeTab === 'actors'  && <ActorSummary brief={brief} />}
            {activeTab === 'gaps'    && <RedFlags brief={brief} />}
          </div>
        </>
      )}
    </div>
  );
}

// ═══════════════ TAB: Case Summary ════════════════════════════════════════════
function CaseSummary({ brief, onNavigateToThread }) {
  const ex = brief.executive || {};
  const score = ex.strength || 0;
  const sl = strengthLabel(score);
  const sc = strengthColor(score);
  const s = getStyles();
  const threads = (brief.threads || []).filter(t => t.eventCount > 0);
  const paragraphs = buildNarrativeParagraphs(ex, threads, brief);

  // SVG ring gauge dimensions
  const ringSize = 140;
  const strokeW = 10;
  const ringR = (ringSize - strokeW) / 2;
  const circumference = 2 * Math.PI * ringR;
  const dashOffset = circumference - (score / 10) * circumference;

  const stats = [
    { label: 'Time Span', value: ex.timeSpan || 'No dates' },
    { label: 'Duration', value: ex.timeSpanDays > 0 ? `${ex.timeSpanDays} days` : '\u2014' },
    { label: 'Documents', value: ex.counts?.documents ?? 0 },
    { label: 'Events', value: ex.counts?.events ?? 0 },
    { label: 'Actors', value: ex.counts?.actors ?? 0 }
  ];

  return (
    <div style={s.section}>
      {/* Hero: ring gauge + case info */}
      <div style={s.strengthHero}>
        <div style={{ position: 'relative', width: ringSize, height: ringSize, flexShrink: 0 }}>
          <svg width={ringSize} height={ringSize} style={{ transform: 'rotate(-90deg)' }}>
            <circle cx={ringSize/2} cy={ringSize/2} r={ringR} fill="none"
              stroke={colors.border} strokeWidth={strokeW} opacity={0.35} />
            <circle cx={ringSize/2} cy={ringSize/2} r={ringR} fill="none"
              stroke={sc} strokeWidth={strokeW}
              strokeDasharray={circumference} strokeDashoffset={dashOffset}
              strokeLinecap="round" style={{ transition: 'stroke-dashoffset 1s ease' }} />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 36, fontWeight: 800, color: sc, lineHeight: 1, letterSpacing: '-1px' }}>
              {score.toFixed(1)}
            </span>
            <span style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>/10</span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: sc }}>{sl.text} Case</div>
          <div style={s.heroCaseType}>{ex.caseType || 'Undetermined'}</div>
          <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 4 }}>
            {threads.length} active claim{threads.length !== 1 ? 's' : ''} identified
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <div style={s.statsBar}>
        {stats.map((stat, i) => (
          <React.Fragment key={i}>
            <div style={s.statItem}>
              <div style={s.statValue}>{stat.value}</div>
              <div style={s.statLabel}>{stat.label}</div>
            </div>
            {i < stats.length - 1 && <div style={s.statDivider} />}
          </React.Fragment>
        ))}
      </div>

      {/* Why Are We Here */}
      <div style={s.whyCard}>
        <h2 style={s.whyHeading}>Why Are We Here</h2>
        {paragraphs.map((p, i) => (
          <p key={i} style={s.whyPara}>{p}</p>
        ))}
      </div>

      {/* Active Claims */}
      {threads.length > 0 && (
        <div style={s.claimsSection}>
          <h3 style={s.subHeading}>Active Claims</h3>
          {threads.map(thread => {
            const tc = strengthColor(thread.strength);
            return (
              <div
                key={thread.id}
                style={{ ...s.claimRow, borderLeft: `3px solid ${thread.color}` }}
                onClick={() => onNavigateToThread?.(thread.id)}
                title="Click to open this claim in Threads"
              >
                <div style={s.claimLeft}>
                  <div>
                    <div style={s.claimName}>{thread.name}</div>
                    <div style={s.claimMeta}>{thread.eventCount} events · {thread.docCount} docs</div>
                  </div>
                </div>
                <div style={s.claimRight}>
                  <div style={s.claimMeterWrap}>
                    <div style={{ ...s.claimMeter, width: `${(thread.strength / 10) * 100}%`, background: tc }} />
                  </div>
                  <span style={{ ...s.claimScore, color: tc }}>
                    {thread.strength}/10
                  </span>
                  <span style={s.viewArrow}>View \u2192</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Brief meta */}
      {brief.generatedAt && (
        <p style={s.metaLine}>
          Generated {formatDate(brief.generatedAt)}
          {brief.isStale && <span style={s.staleTag}> \u00b7 Outdated</span>}
        </p>
      )}
    </div>
  );
}

function buildNarrativeParagraphs(ex, threads, brief) {
  const paras = [];
  const counts = ex.counts || {};
  const strength = ex.strength || 0;

  // Para 1 — Setting: scope and evidence base
  if (counts.events > 0 || threads.length > 0) {
    let p1 = 'This employment matter';
    if (ex.timeSpan && ex.timeSpan !== 'No dated events yet') {
      p1 += ` spans ${ex.timeSpan}`;
      if (ex.timeSpanDays > 0) p1 += ` (${ex.timeSpanDays} days)`;
    }
    p1 += '. The record contains';
    const parts = [];
    if (counts.events > 0) parts.push(`${counts.events} documented event${counts.events !== 1 ? 's' : ''}`);
    if (counts.documents > 0) parts.push(`${counts.documents} supporting document${counts.documents !== 1 ? 's' : ''}`);
    if (counts.actors > 0) parts.push(`${counts.actors} named individual${counts.actors !== 1 ? 's' : ''}`);
    p1 += ' ' + parts.join(', ') + '.';
    paras.push(p1);
  }

  // Para 2 — The pattern: what the threads reveal
  if (threads.length > 0) {
    const sorted = [...threads].sort((a, b) => b.strength - a.strength);
    const top = sorted[0];
    const threadNames = sorted.map(t => t.name);
    let p2 = '';
    if (threadNames.length === 1) {
      p2 = `The record establishes a ${top.name} claim`;
    } else {
      const rest = threadNames.slice(0, -1).join(', ');
      const last = threadNames[threadNames.length - 1];
      p2 = `The record supports ${threadNames.length} concurrent claims — ${rest} and ${last}`;
    }
    if (top.eventCount > 1) {
      p2 += `, with ${top.name} showing the strongest documented pattern across ${top.eventCount} events`;
    }
    const gaps = brief.timeline?.gaps || [];
    if (gaps.length > 0) {
      p2 += `. ${gaps.length} documentation gap${gaps.length > 1 ? 's' : ''} exist that may require explanation at deposition`;
    }
    p2 += '.';
    paras.push(p2);
  }

  // Para 3 — Legal significance: what it means for the case
  if (strength > 0) {
    const redFlags = brief.redFlags || [];
    const highFlags = redFlags.filter(f => f.severity === 'high');
    let p3 = '';
    if (strength >= 7) {
      p3 = `With an overall case strength of ${strength.toFixed(1)}/10, the documented record is well-supported for filing`;
    } else if (strength >= 4) {
      p3 = `With an overall case strength of ${strength.toFixed(1)}/10, the record provides a moderate foundation — additional corroborating evidence would strengthen the position before filing`;
    } else {
      p3 = `With an overall case strength of ${strength.toFixed(1)}/10, significant evidentiary gaps remain`;
    }
    if (highFlags.length > 0) {
      p3 += `. ${highFlags.length} high-severity issue${highFlags.length > 1 ? 's' : ''} require${highFlags.length === 1 ? 's' : ''} attorney review before proceeding`;
    }
    p3 += '.';
    paras.push(p3);
  }

  if (paras.length === 0) {
    paras.push('No case data available yet. Add events, documents, and tag them with claim types to generate the narrative summary.');
  }

  return paras;
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

// ═══════════════ TAB: Causal Links ═══════════════════════════════════════════

// Precedent labels for all connection types
const CONNECTION_PRECEDENTS = {
  // Core retaliation patterns
  retaliation:                    { label: 'Retaliation', precedents: ['Burlington N. & Santa Fe Ry. Co. v. White (2006)', 'Clark Cty. Sch. Dist. v. Breeden (2001)'], description: 'Protected activity followed by adverse action within a suspect timeframe may establish retaliatory intent.' },
  retaliation_chain:              { label: 'Retaliation Chain', precedents: ['Burlington N. & Santa Fe Ry. Co. v. White (2006)', 'Clark Cty. Sch. Dist. v. Breeden (2001)'], description: 'A sequence of adverse actions following protected activity establishes a causal chain supporting a retaliation claim.' },
  whistleblower_retaliation:      { label: 'Whistleblower Retaliation', precedents: ['Burlington N. & Santa Fe Ry. Co. v. White (2006)'], description: 'Adverse action following a protected disclosure or complaint supports a whistleblower retaliation claim.' },
  retaliatory_harassment:         { label: 'Retaliatory Harassment', precedents: ['Burlington N. & Santa Fe Ry. Co. v. White (2006)', 'Harris v. Forklift Systems (1993)'], description: 'Harassment directed at an employee following protected activity can constitute an adverse employment action under Title VII.' },
  retaliatory_harassment_pattern: { label: 'Retaliatory Harassment Pattern', precedents: ['Burlington N. & Santa Fe Ry. Co. v. White (2006)', "Nat'l R.R. Passenger Corp. v. Morgan (2002)"], description: 'A systemic post-complaint harassment campaign establishes retaliatory motive and satisfies the adverse action element.' },
  pay_retaliation_chain:          { label: 'Pay Retaliation', precedents: ['Burlington N. & Santa Fe Ry. Co. v. White (2006)', 'Lilly Ledbetter Fair Pay Act (2009)'], description: 'Compensation reduced or withheld following protected activity supports a pay retaliation claim.' },
  // Temporal and proximity patterns
  temporal_proximity:             { label: 'Temporal Proximity', precedents: ['Clark Cty. Sch. Dist. v. Breeden (2001)'], description: 'Courts treat short gaps between protected activity and adverse action as evidence of causation.' },
  temporal_cluster:               { label: 'Temporal Cluster', precedents: ["Nat'l R.R. Passenger Corp. v. Morgan (2002)"], description: 'Events concentrated in a short time window suggest coordinated conduct and can establish a continuing violation.' },
  protected_to_adverse:           { label: 'Protected Activity → Adverse Action', precedents: ['Burlington N. & Santa Fe Ry. Co. v. White (2006)'], description: 'A direct causal chain from a protected act to a materially adverse employment action supports a retaliation claim.' },
  // Escalation and environment patterns
  escalation:                     { label: 'Pattern Escalation', precedents: ["Nat'l R.R. Passenger Corp. v. Morgan (2002)"], description: 'A series of incidents of increasing severity can establish a hostile work environment claim.' },
  hostile_environment:            { label: 'Hostile Environment Pattern', precedents: ['Harris v. Forklift Systems (1993)', 'Meritor Savings Bank v. Vinson (1986)'], description: 'Severe or pervasive conduct that alters employment conditions satisfies the hostile environment standard.' },
  sexual_harassment_pattern:      { label: 'Sexual Harassment Pattern', precedents: ['Harris v. Forklift Systems (1993)', 'Meritor Savings Bank v. Vinson (1986)'], description: 'Repeated unwelcome sexual conduct creating a hostile environment establishes liability under Title VII.' },
  quid_pro_quo:                   { label: 'Quid Pro Quo', precedents: ['Meritor Savings Bank v. Vinson (1986)', 'Burlington Indus., Inc. v. Ellerth (1998)'], description: 'Conditioning an employment benefit on submission to unwelcome conduct establishes tangible employment action liability.' },
  // Actor and employer patterns
  actor_continuity:               { label: 'Same-Actor Pattern', precedents: ['Vance v. Ball State Univ. (2013)'], description: 'Repeated involvement of the same individual across multiple incidents strengthens discriminatory intent.' },
  supervisor_liability:           { label: 'Supervisor Liability', precedents: ['Vance v. Ball State Univ. (2013)', 'Burlington Indus., Inc. v. Ellerth (1998)'], description: "Employer vicariously liable for a supervisor's tangible employment actions without affirmative defense." },
  supervisor_pattern:             { label: 'Supervisor Pattern', precedents: ['Vance v. Ball State Univ. (2013)', 'Faragher v. City of Boca Raton (1998)'], description: 'Systematic supervisory conduct establishes employer liability and may negate the Faragher/Ellerth affirmative defense.' },
  employer_notice:                { label: 'Employer Notice', precedents: ['Faragher v. City of Boca Raton (1998)', 'Burlington Indus., Inc. v. Ellerth (1998)'], description: 'Evidence the employer knew or should have known of misconduct and failed to act defeats the affirmative defense.' },
  // Continuing and cumulative patterns
  continuing_violation:           { label: 'Continuing Violation', precedents: ["Nat'l R.R. Passenger Corp. v. Morgan (2002)"], description: 'An ongoing series of related acts is treated as a single unlawful violation, extending the limitations period (Morgan).' },
  convincing_mosaic:              { label: 'Convincing Mosaic', precedents: ['Lewis v. Union City Sch. Dist. (11th Cir. 2019)', 'Smith v. Lockheed-Martin Corp. (11th Cir. 2011)'], description: 'A cumulative circumstantial pattern of discriminatory conduct can establish intent without a single smoking-gun fact.' },
  // Pay and FCRA
  pay_discrimination:             { label: 'Pay Discrimination', precedents: ['Lilly Ledbetter Fair Pay Act (2009)', 'County of Washington v. Gunther (1981)'], description: 'Each discriminatory paycheck constitutes a fresh violation under the Ledbetter Act, preserving timeliness.' },
  fcra_discrimination:            { label: 'FCRA Discrimination', precedents: ['Trans Union Corp. v. FTC (D.C. Cir. 2001)'], description: 'Discriminatory or retaliatory use of consumer report information may violate both the FCRA and Title VII.' },
  discrimination_some_harm:       { label: 'Discriminatory Harm', precedents: ['Muldrow v. City of St. Louis (2024)'], description: 'An adverse action need only cause some harm to a term or condition of employment, not serious or significant harm (Muldrow).' },
  exclusion_pattern:              { label: 'Systematic Exclusion', precedents: ['Meritor Savings Bank v. Vinson (1986)'], description: 'Repeated exclusion from meetings, communications, or opportunities can constitute discriminatory terms.' },
  // Fallback
  general:                        { label: 'Causal Connection', precedents: [], description: 'A documented link between two events that may be relevant to one or more claims.' }
};

function CausalLinks({ onNavigateToConnections }) {
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const s = getStyles();

  useEffect(() => {
    loadConnections();
  }, []);

  // Connection types that represent genuine cause-and-effect relationships
  const CAUSAL_TYPES = new Set([
    'retaliation_chain', 'protected_to_adverse', 'whistleblower_retaliation',
    'pay_retaliation_chain', 'retaliatory_harassment', 'retaliatory_harassment_pattern',
    'quid_pro_quo', 'employer_notice'
  ]);

  async function loadConnections() {
    setLoading(true);
    try {
      const res = await window.api.connections.list();
      if (res.success) {
        // Only show causal connection types (cause → effect), exclude self-connections
        const causal = (res.connections || []).filter(
          c => c.source_type === 'event' && c.target_type === 'event'
            && CAUSAL_TYPES.has(c.connection_type)
            && c.source_id !== c.target_id
        );
        setConnections(causal);
      }
    } catch (e) {
      console.error('[CausalLinks] load error:', e);
    }
    setLoading(false);
  }

  if (loading) {
    return (
      <div style={{ padding: '60px', textAlign: 'center', color: colors.textMuted }}>
        Loading causal links...
      </div>
    );
  }

  if (connections.length === 0) {
    return (
      <div style={s.emptyState}>
        <p style={s.emptyStateText}>
          No causal links found. Use the Connections view to add or auto-detect links between events.
        </p>
      </div>
    );
  }

  // Group by connection_type
  const groups = {};
  for (const c of connections) {
    const type = c.connection_type || 'general';
    if (!groups[type]) groups[type] = [];
    groups[type].push(c);
  }

  return (
    <div style={s.section}>
      <p style={{ color: colors.textSecondary, fontSize: typography.fontSize.sm, margin: 0 }}>
        Causal connections between documented events, with supporting case precedent.
      </p>

      {onNavigateToConnections && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={onNavigateToConnections}
            style={{
              background: 'none',
              border: `1px solid ${colors.border}`,
              borderRadius: radius.sm,
              padding: `${spacing.xs} ${spacing.md}`,
              fontSize: typography.fontSize.sm,
              color: colors.textSecondary,
              cursor: 'pointer'
            }}
          >
            View all in Connections →
          </button>
        </div>
      )}

      {Object.entries(groups).map(([type, conns]) => {
        const meta = CONNECTION_PRECEDENTS[type] || CONNECTION_PRECEDENTS.general;
        return (
          <div key={type} style={s.causalGroup}>
            <div style={s.causalGroupHeader}>
              <span style={s.causalTypeLabel}>{meta.label}</span>
              <span style={s.causalCount}>{conns.length} link{conns.length !== 1 ? 's' : ''}</span>
            </div>
            <p style={s.causalDescription}>{meta.description}</p>
            {meta.precedents.length > 0 && (
              <div style={s.precedentsRow}>
                <span style={s.precedentsLabel}>Precedent:</span>
                {meta.precedents.map(p => (
                  <span key={p} style={s.precedentBadge}>{p}</span>
                ))}
              </div>
            )}
            <div style={s.causalLinks}>
              {conns.map(c => (
                <div key={c.id} style={s.causalLink}>
                  <div style={s.causalLinkMain}>
                    <div style={s.causalNode}>
                      <div style={s.causalNodeLabel}>
                        {c.source_date ? formatDate(c.source_date) : 'undated'}
                      </div>
                      <div style={s.causalNodeTitle}>{c.source_title || c.source_id}</div>
                    </div>
                    <div style={s.causalArrow}>
                      <div style={s.causalArrowLine} />
                      {c.days_between != null && c.days_between >= 0 && (
                        <span style={s.causalDays}>{c.days_between}d</span>
                      )}
                      <span style={s.causalArrowHead}>→</span>
                    </div>
                    <div style={s.causalNode}>
                      <div style={s.causalNodeLabel}>
                        {c.target_date ? formatDate(c.target_date) : 'undated'}
                      </div>
                      <div style={s.causalNodeTitle}>{c.target_title || c.target_id}</div>
                    </div>
                    {c.strength != null && (
                      <div style={{ ...s.causalStrength, color: strengthColor(c.strength * 10) }}>
                        {Math.round(c.strength * 100)}%
                      </div>
                    )}
                  </div>
                  {c.description && (
                    <div style={s.causalLinkDesc}>{c.description}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
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

    // Executive summary — ring gauge hero
    strengthHero: {
      display: 'flex',
      alignItems: 'center',
      gap: '32px',
      padding: '32px',
      background: `linear-gradient(135deg, ${colors.surface} 0%, ${colors.surfaceAlt} 100%)`,
      borderRadius: radius.lg,
      border: `1px solid ${colors.border}`,
      boxShadow: shadows.md
    },
    heroCaseType: {
      fontSize: 13,
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: '0.06em',
      fontWeight: typography.fontWeight.medium
    },

    // Unified stats bar
    statsBar: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '16px 24px',
      background: colors.surface,
      borderRadius: radius.md,
      border: `1px solid ${colors.border}`
    },
    statItem: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      flex: 1
    },
    statDivider: {
      width: 1,
      height: 32,
      background: colors.border,
      flexShrink: 0
    },
    statValue: { fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.semibold, color: colors.textPrimary, textAlign: 'center' },
    statLabel: { fontSize: typography.fontSize.xs, color: colors.textMuted, marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' },

    meterWrap: {
      height: 8,
      background: colors.border,
      borderRadius: 99,
      overflow: 'hidden'
    },
    meter: { height: '100%', borderRadius: 99, transition: 'width 0.6s ease' },

    metaLine: { fontSize: typography.fontSize.sm, color: colors.textMuted, margin: 0 },
    staleTag: { color: '#F59E0B', fontWeight: typography.fontWeight.medium },

    // Why Are We Here
    whyCard: {
      background: colors.surface,
      borderRadius: radius.lg,
      padding: '28px 28px 20px',
      border: `1px solid ${colors.border}`,
      boxShadow: shadows.sm
    },
    whyHeading: {
      margin: '0 0 16px 0',
      fontSize: typography.fontSize.md,
      fontWeight: typography.fontWeight.semibold,
      color: colors.textPrimary,
      letterSpacing: '-0.01em'
    },
    whyPara: {
      fontSize: typography.fontSize.base,
      color: colors.textSecondary,
      lineHeight: 1.8,
      margin: '0 0 12px 0'
    },

    // Active claims
    claimsSection: { display: 'flex', flexDirection: 'column', gap: spacing.sm },
    claimRow: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
      padding: '14px 16px',
      background: colors.surface,
      border: `1px solid ${colors.border}`,
      borderRadius: radius.md,
      cursor: 'pointer',
      transition: 'box-shadow 0.15s, transform 0.1s'
    },
    claimLeft: { display: 'flex', alignItems: 'center', gap: spacing.md, flex: 1, minWidth: 0 },
    claimName: { fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.semibold, color: colors.textPrimary },
    claimMeta: { fontSize: typography.fontSize.xs, color: colors.textMuted, marginTop: 2 },
    claimRight: { display: 'flex', alignItems: 'center', gap: spacing.sm, flexShrink: 0 },
    claimMeterWrap: { width: 100, height: 7, background: colors.border, borderRadius: 99, overflow: 'hidden' },
    claimMeter: { height: '100%', borderRadius: 99, transition: 'width 0.6s ease' },
    claimScore: { fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.bold, minWidth: 36, textAlign: 'right' },
    viewArrow: { fontSize: 11, color: colors.textMuted, marginLeft: 4, opacity: 0.7 },

    // Causal links
    causalGroup: {
      background: colors.surface,
      borderRadius: radius.lg,
      padding: spacing.xl,
      border: `1px solid ${colors.border}`,
      boxShadow: shadows.sm,
      display: 'flex',
      flexDirection: 'column',
      gap: spacing.md
    },
    causalGroupHeader: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between'
    },
    causalTypeLabel: {
      fontSize: typography.fontSize.base,
      fontWeight: typography.fontWeight.semibold,
      color: colors.textPrimary
    },
    causalCount: {
      fontSize: typography.fontSize.xs,
      color: colors.textMuted,
      background: colors.surfaceAlt,
      padding: '2px 8px',
      borderRadius: 99,
      border: `1px solid ${colors.border}`
    },
    causalDescription: {
      margin: 0,
      fontSize: typography.fontSize.sm,
      color: colors.textSecondary,
      lineHeight: 1.6
    },
    precedentsRow: { display: 'flex', flexWrap: 'wrap', gap: spacing.xs, alignItems: 'center' },
    precedentsLabel: { fontSize: typography.fontSize.xs, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' },
    precedentBadge: {
      padding: '2px 8px',
      background: '#EFF6FF',
      borderRadius: radius.sm,
      fontSize: typography.fontSize.xs,
      color: '#1D4ED8',
      border: `1px solid #BFDBFE`
    },
    causalLinks: { display: 'flex', flexDirection: 'column', gap: spacing.sm },
    causalLink: {
      padding: spacing.md,
      background: colors.bg,
      borderRadius: radius.md,
      border: `1px solid ${colors.border}`,
      display: 'flex',
      flexDirection: 'column',
      gap: spacing.xs
    },
    causalLinkMain: {
      display: 'flex',
      alignItems: 'center',
      gap: spacing.sm,
      flexWrap: 'wrap'
    },
    causalNode: {
      flex: '1 1 160px',
      minWidth: 120
    },
    causalNodeLabel: {
      fontSize: typography.fontSize.xs,
      color: colors.textMuted,
      marginBottom: 2
    },
    causalNodeTitle: {
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.medium,
      color: colors.textPrimary,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    },
    causalArrow: {
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      flexShrink: 0,
      color: colors.textMuted
    },
    causalArrowLine: {
      width: 24,
      height: 1,
      background: colors.border
    },
    causalDays: {
      fontSize: 10,
      color: colors.textMuted,
      background: colors.surfaceAlt,
      padding: '1px 4px',
      borderRadius: 4,
      border: `1px solid ${colors.border}`
    },
    causalArrowHead: { fontSize: 14, color: colors.textMuted },
    causalStrength: {
      fontSize: typography.fontSize.xs,
      fontWeight: typography.fontWeight.bold,
      flexShrink: 0,
      marginLeft: 'auto'
    },
    causalLinkDesc: {
      fontSize: typography.fontSize.xs,
      color: colors.textMuted,
      fontStyle: 'italic',
      paddingLeft: 0
    },

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
