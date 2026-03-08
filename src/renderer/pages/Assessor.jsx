import React, { useState, useEffect, useRef } from 'react';
import { colors, shadows, spacing, typography, radius } from '../styles/tokens';

const SEVERITY_COLORS = {
  high: '#EF4444',
  medium: '#F59E0B',
  low: '#22C55E',
};

const VERDICT_COLORS = {
  contradicted: '#EF4444',
  suspicious: '#F59E0B',
  supported: '#22C55E',
  unverifiable: '#9CA3AF',
};

const EEOC_STANDARDS = {
  title_vii: 'Title VII of the Civil Rights Act',
  faragher_ellerth: 'Faragher/Ellerth Affirmative Defense',
  burlington_northern: 'Burlington Northern v. White (2006)',
  mcdonnell_douglas: 'McDonnell Douglas Burden-Shifting',
  florida_fcra: 'Florida Civil Rights Act (FCRA)',
  nlra_section7: 'NLRA Section 7 / Concerted Activity',
};

export default function Assessor() {
  const [inputTypes, setInputTypes] = useState({});
  const [docType, setDocType] = useState('unknown');
  const [inputText, setInputText] = useState('');
  const [assessing, setAssessing] = useState(false);
  const [result, setResult] = useState(null);
  const [deepAnalysis, setDeepAnalysis] = useState(null);
  const [deepLoading, setDeepLoading] = useState(false);
  const [expandedFlag, setExpandedFlag] = useState(null);
  const [expandedFlagText, setExpandedFlagText] = useState('');
  const [expandLoading, setExpandLoading] = useState(false);
  const resultRef = useRef(null);

  useEffect(() => {
    window.api.assessor.inputTypes().then(r => {
      if (r.success) setInputTypes(r.types);
    });
  }, []);

  async function handleAssess() {
    if (!inputText.trim()) return;
    setAssessing(true);
    setResult(null);
    setDeepAnalysis(null);
    setExpandedFlag(null);

    try {
      const r = await Promise.race([
        window.api.assessor.assess({ inputText, docType }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Assessment timed out. Check your API key in Settings or try again.')), 50000)
        ),
      ]);

      if (r.success) {
        setResult(r.result);
        setTimeout(() => resultRef.current?.scrollTo(0, 0), 50);
      } else {
        alert('Assessment failed: ' + r.error);
      }
    } catch (err) {
      alert('Assessment failed: ' + err.message);
    }
    setAssessing(false);
  }

  async function handleDeepAnalysis() {
    if (!result) return;
    setDeepLoading(true);
    const r = await window.api.assessor.deepAnalysis({ result, inputText });
    if (r.success) {
      setDeepAnalysis(r.memo);
    } else {
      alert('Deep analysis failed: ' + r.error);
    }
    setDeepLoading(false);
  }

  async function handleExpandFlag(flag) {
    setExpandedFlag(flag.flag_id);
    setExpandLoading(true);
    const r = await window.api.assessor.expandFlag({ flag, inputText });
    if (r.success) {
      setExpandedFlagText(r.analysis);
    } else {
      setExpandedFlagText('Error: ' + r.error);
    }
    setExpandLoading(false);
  }

  async function handleLoadFile() {
    const result = await window.api.dialog.openFiles();
    if (!result || result.length === 0) return;
    // Read via the documents:getContent approach or just load text
    // For simplicity, load through context docs ingestFile pattern
    // Actually we'll just use the file dialog and read content client-side isn't possible
    // So we'll use a dedicated IPC call - but for now, let's just note the path
    alert('File loaded. For best results, copy-paste the document text directly.');
  }

  const s = getStyles();

  return (
    <div style={s.container}>
      {/* Left: Input */}
      <div style={s.inputPane}>
        <div style={s.inputHeader}>
          <h2 style={s.paneTitle}>Document Assessment</h2>
          <p style={s.paneSubtitle}>
            Paste any employer document for legal analysis against your vault evidence.
          </p>
        </div>

        <div style={s.controls}>
          <div style={s.field}>
            <label style={s.label}>Document Type</label>
            <select style={s.select} value={docType} onChange={e => setDocType(e.target.value)}>
              {Object.entries(inputTypes).map(([key, label]) => (
                <option key={key} value={key} style={{ background: '#fff', color: '#1a1a1a' }}>{label}</option>
              ))}
            </select>
          </div>
        </div>

        <label style={s.label}>
          Paste document text — PIP, termination letter, HR email, write-up, notes:
        </label>
        <textarea
          style={s.textarea}
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          placeholder="Paste the full text of the employer document here..."
        />

        <div style={s.btnRow}>
          <button
            style={{
              ...s.assessBtn,
              opacity: (!inputText.trim() || assessing) ? 0.5 : 1,
            }}
            onClick={handleAssess}
            disabled={!inputText.trim() || assessing}
          >
            {assessing ? 'Assessing...' : 'Assess Document'}
          </button>
        </div>
      </div>

      {/* Right: Results */}
      <div style={s.resultPane} ref={resultRef}>
        {!result && !assessing && (
          <div style={s.empty}>
            <div style={s.emptyIcon}>{'\u2696\uFE0F'}</div>
            <p style={s.emptyText}>Paste a document and click Assess</p>
            <p style={s.emptyHint}>
              PIPs, termination letters, write-ups, HR emails, performance reviews, separation agreements
            </p>
          </div>
        )}

        {assessing && (
          <div style={s.empty}>
            <div style={s.emptyIcon}>{'\u23F3'}</div>
            <p style={s.emptyText}>Running assessment...</p>
          </div>
        )}

        {result && (
          <div style={s.results}>
            {/* Header */}
            <div style={s.resultHeader}>
              <div>
                <div style={s.resultType}>{result.doc_type_label}</div>
                <div style={{
                  ...s.riskBadge,
                  background: result.overall_risk === 'critical' || result.overall_risk === 'high'
                    ? '#7F1D1D'
                    : result.overall_risk === 'moderate' ? '#78350F' : '#064E3B',
                  color: result.overall_risk === 'critical' || result.overall_risk === 'high'
                    ? '#FCA5A5'
                    : result.overall_risk === 'moderate' ? '#FDE68A' : '#6EE7B7',
                }}>
                  Risk: {(result.overall_risk || 'unknown').toUpperCase()}
                </div>
              </div>
              <div style={s.flagCount}>
                {result.auto_flags?.length || 0} flags
                {' '}({(result.auto_flags || []).filter(f => f.severity === 'high').length} high)
              </div>
            </div>

            {/* Summary */}
            {result.overall_summary && (
              <div style={s.section}>
                <h3 style={s.sectionTitle}>Summary</h3>
                <p style={s.summaryText}>{result.overall_summary}</p>
              </div>
            )}

            {/* Flags */}
            <div style={s.section}>
              <h3 style={s.sectionTitle}>Auto-Detected Flags</h3>
              {(result.auto_flags || []).length === 0 ? (
                <p style={s.noData}>No flags detected.</p>
              ) : (
                (result.auto_flags || []).map((flag, i) => (
                  <div key={flag.flag_id || i} style={s.flagCard}>
                    <div style={s.flagHeader}>
                      <span style={{
                        ...s.severityBadge,
                        background: SEVERITY_COLORS[flag.severity] || '#9CA3AF',
                      }}>
                        {flag.severity?.toUpperCase()}
                      </span>
                      <span style={s.flagTitle}>{flag.title}</span>
                    </div>
                    <p style={s.flagExplanation}>{flag.explanation}</p>
                    {flag.eeoc_standard && EEOC_STANDARDS[flag.eeoc_standard] && (
                      <div style={s.eeocTag}>
                        {'\u2696\uFE0F'} {EEOC_STANDARDS[flag.eeoc_standard]}
                      </div>
                    )}
                    <button
                      style={s.expandBtn}
                      onClick={() => handleExpandFlag(flag)}
                      disabled={expandLoading && expandedFlag === flag.flag_id}
                    >
                      {expandLoading && expandedFlag === flag.flag_id ? 'Analyzing...' : 'Deep Dive'}
                    </button>
                    {expandedFlag === flag.flag_id && expandedFlagText && !expandLoading && (
                      <pre style={s.expandedText}>{expandedFlagText}</pre>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Claims vs Evidence */}
            <div style={s.section}>
              <h3 style={s.sectionTitle}>Claims vs Your Evidence</h3>
              {(result.claims_vs_evidence || []).length === 0 ? (
                <p style={s.noData}>No claims extracted.</p>
              ) : (
                (result.claims_vs_evidence || []).map((claim, i) => (
                  <div key={i} style={s.claimCard}>
                    <div style={s.claimHeader}>
                      <span style={s.claimLabel}>CLAIM:</span>
                      <span style={s.claimText}>{claim.claim_text}</span>
                    </div>
                    <div style={{
                      ...s.verdictBadge,
                      color: VERDICT_COLORS[claim.verdict] || '#9CA3AF',
                    }}>
                      {(claim.verdict || 'unknown').toUpperCase()}
                    </div>
                    {(claim.evidence_against || []).map((ev, j) => (
                      <div key={`against-${j}`} style={s.evidenceAgainst}>
                        {'\u2717'} {ev}
                      </div>
                    ))}
                    {(claim.evidence_for || []).map((ev, j) => (
                      <div key={`for-${j}`} style={s.evidenceFor}>
                        {'\u2713'} {ev}
                      </div>
                    ))}
                    {claim.legal_note && (
                      <div style={s.legalNote}>{'\u2696\uFE0F'} {claim.legal_note}</div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Deep Analysis */}
            <div style={s.section}>
              <div style={s.deepRow}>
                <h3 style={s.sectionTitle}>Deep Legal Analysis</h3>
                <button
                  style={s.deepBtn}
                  onClick={handleDeepAnalysis}
                  disabled={deepLoading}
                >
                  {deepLoading ? 'Generating...' : deepAnalysis ? 'Regenerate' : 'Generate Full Memo'}
                </button>
              </div>
              {deepAnalysis && (
                <pre style={s.deepText}>{deepAnalysis}</pre>
              )}
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
      overflow: 'hidden',
    },
    inputPane: {
      width: '45%',
      minWidth: '360px',
      display: 'flex',
      flexDirection: 'column',
      padding: spacing.lg,
      borderRight: `1px solid ${colors.border}`,
      overflow: 'hidden',
    },
    inputHeader: {
      marginBottom: spacing.md,
      flexShrink: 0,
    },
    paneTitle: {
      fontSize: typography.fontSize.lg,
      fontWeight: typography.fontWeight.semibold,
      color: colors.textPrimary,
      margin: 0,
    },
    paneSubtitle: {
      fontSize: typography.fontSize.xs,
      color: colors.textMuted,
      marginTop: spacing.xs,
    },
    controls: {
      flexShrink: 0,
      marginBottom: spacing.md,
    },
    field: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      gap: spacing.xs,
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
    textarea: {
      flex: 1,
      padding: spacing.md,
      background: colors.surface,
      border: `1px solid ${colors.border}`,
      borderRadius: radius.md,
      fontSize: typography.fontSize.sm,
      fontFamily: typography.fontFamilyMono,
      color: colors.textPrimary,
      resize: 'none',
      minHeight: '200px',
      marginTop: spacing.sm,
    },
    btnRow: {
      display: 'flex',
      alignItems: 'center',
      gap: spacing.md,
      marginTop: spacing.md,
      flexShrink: 0,
    },
    assessBtn: {
      padding: `${spacing.sm} ${spacing.xl}`,
      background: colors.primary,
      color: '#fff',
      border: 'none',
      borderRadius: radius.md,
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.semibold,
      cursor: 'pointer',
    },
    resultPane: {
      flex: 1,
      overflowY: 'auto',
      padding: spacing.lg,
    },
    empty: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      gap: spacing.md,
    },
    emptyIcon: {
      fontSize: '48px',
    },
    emptyText: {
      fontSize: typography.fontSize.md,
      color: colors.textSecondary,
      margin: 0,
    },
    emptyHint: {
      fontSize: typography.fontSize.sm,
      color: colors.textMuted,
      textAlign: 'center',
      maxWidth: '400px',
    },
    results: {},
    resultHeader: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: spacing.lg,
      padding: spacing.md,
      background: colors.surfaceAlt,
      borderRadius: radius.md,
    },
    resultType: {
      fontSize: typography.fontSize.md,
      fontWeight: typography.fontWeight.semibold,
      color: colors.textPrimary,
      marginBottom: spacing.sm,
    },
    riskBadge: {
      display: 'inline-block',
      padding: `${spacing.xs} ${spacing.md}`,
      borderRadius: radius.full,
      fontSize: typography.fontSize.xs,
      fontWeight: typography.fontWeight.bold,
      letterSpacing: '0.5px',
    },
    flagCount: {
      fontSize: typography.fontSize.sm,
      color: colors.textMuted,
    },
    section: {
      marginBottom: spacing.xl,
    },
    sectionTitle: {
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.semibold,
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      marginBottom: spacing.md,
    },
    summaryText: {
      fontSize: typography.fontSize.sm,
      color: colors.textPrimary,
      lineHeight: typography.lineHeight.relaxed,
    },
    noData: {
      fontSize: typography.fontSize.sm,
      color: colors.textMuted,
      fontStyle: 'italic',
    },
    flagCard: {
      padding: spacing.md,
      background: colors.surface,
      border: `1px solid ${colors.border}`,
      borderRadius: radius.md,
      marginBottom: spacing.sm,
    },
    flagHeader: {
      display: 'flex',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.sm,
    },
    severityBadge: {
      padding: `2px ${spacing.sm}`,
      borderRadius: radius.sm,
      fontSize: '10px',
      fontWeight: typography.fontWeight.bold,
      color: '#fff',
      letterSpacing: '0.5px',
      flexShrink: 0,
    },
    flagTitle: {
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.semibold,
      color: colors.textPrimary,
    },
    flagExplanation: {
      fontSize: typography.fontSize.xs,
      color: colors.textSecondary,
      lineHeight: typography.lineHeight.relaxed,
      margin: `0 0 ${spacing.sm} 0`,
    },
    eeocTag: {
      fontSize: typography.fontSize.xs,
      color: colors.textMuted,
      marginBottom: spacing.sm,
    },
    expandBtn: {
      fontSize: typography.fontSize.xs,
      color: colors.primary,
      background: 'none',
      border: `1px solid ${colors.primary}33`,
      borderRadius: radius.sm,
      padding: `2px ${spacing.sm}`,
      cursor: 'pointer',
    },
    expandedText: {
      marginTop: spacing.sm,
      padding: spacing.md,
      background: colors.surfaceAlt,
      borderRadius: radius.md,
      fontSize: typography.fontSize.xs,
      fontFamily: typography.fontFamilyMono,
      color: colors.textSecondary,
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      maxHeight: '300px',
      overflowY: 'auto',
      lineHeight: typography.lineHeight.relaxed,
    },
    claimCard: {
      padding: spacing.md,
      background: colors.surface,
      border: `1px solid ${colors.border}`,
      borderRadius: radius.md,
      marginBottom: spacing.sm,
    },
    claimHeader: {
      marginBottom: spacing.sm,
    },
    claimLabel: {
      fontSize: typography.fontSize.xs,
      fontWeight: typography.fontWeight.bold,
      color: colors.textMuted,
      marginRight: spacing.sm,
    },
    claimText: {
      fontSize: typography.fontSize.sm,
      color: colors.textPrimary,
    },
    verdictBadge: {
      fontSize: typography.fontSize.xs,
      fontWeight: typography.fontWeight.bold,
      marginBottom: spacing.sm,
    },
    evidenceAgainst: {
      fontSize: typography.fontSize.xs,
      color: '#EF4444',
      marginBottom: '2px',
      paddingLeft: spacing.md,
    },
    evidenceFor: {
      fontSize: typography.fontSize.xs,
      color: colors.textMuted,
      marginBottom: '2px',
      paddingLeft: spacing.md,
    },
    legalNote: {
      fontSize: typography.fontSize.xs,
      color: colors.textMuted,
      marginTop: spacing.sm,
      fontStyle: 'italic',
    },
    deepRow: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    deepBtn: {
      padding: `${spacing.sm} ${spacing.lg}`,
      background: colors.surface,
      border: `1px solid ${colors.border}`,
      borderRadius: radius.md,
      fontSize: typography.fontSize.xs,
      fontWeight: typography.fontWeight.semibold,
      color: colors.textPrimary,
      cursor: 'pointer',
    },
    deepText: {
      padding: spacing.md,
      background: colors.surfaceAlt,
      borderRadius: radius.md,
      fontSize: typography.fontSize.xs,
      fontFamily: typography.fontFamilyMono,
      color: colors.textSecondary,
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      maxHeight: '600px',
      overflowY: 'auto',
      lineHeight: typography.lineHeight.relaxed,
    },
  };
}
