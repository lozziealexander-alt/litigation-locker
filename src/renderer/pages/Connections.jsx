import React, { useState, useEffect, useCallback } from 'react';

const PRECEDENT_COLORS = {
  burlington_northern: '#dc2626',
  thomas_proximity: '#ef4444',
  harris: '#f97316',
  morgan: '#f59e0b',
  faragher: '#8b5cf6',
  muldrow_some_harm: '#ec4899',
  lewis_mosaic: '#06b6d4',
  sierminski_whistleblower: '#10b981',
  gessner_actual_violation: '#059669',
  harper_fcra: '#6366f1',
  monaghan_retaliation: '#e11d48',
  joshua_filing: '#d97706',
  vance: '#7c3aed'
};

const PRECEDENT_LABELS = {
  burlington_northern: 'Burlington Northern',
  thomas_proximity: 'Thomas v. Cooper',
  harris: 'Harris v. Forklift',
  morgan: 'National Railroad v. Morgan',
  faragher: 'Faragher/Ellerth',
  muldrow_some_harm: 'Muldrow v. St. Louis',
  lewis_mosaic: 'Lewis v. Union City',
  sierminski_whistleblower: 'Sierminski Whistleblower',
  gessner_actual_violation: 'Gessner v. Gulf Power',
  harper_fcra: 'Harper FCRA',
  monaghan_retaliation: 'Monaghan v. Worldpay',
  joshua_filing: 'Joshua v. Gainesville',
  vance: 'Vance v. Ball State'
};

const CONNECTION_TYPE_COLORS = {
  retaliation_chain: '#dc2626',
  escalation: '#f97316',
  temporal_cluster: '#3b82f6',
  actor_continuity: '#6b7280',
  hostile_environment: '#f97316',
  continuing_violation: '#f59e0b',
  employer_notice: '#8b5cf6',
  convincing_mosaic: '#06b6d4',
  whistleblower_retaliation: '#10b981',
  quid_pro_quo: '#e11d48',
  sexual_harassment_pattern: '#be123c',
  pay_discrimination: '#16a34a',
  pay_retaliation_chain: '#15803d',
  supervisor_liability: '#7c3aed',
  supervisor_pattern: '#6d28d9',
  retaliatory_harassment: '#ea580c',
  retaliatory_harassment_pattern: '#c2410c',
  fcra_discrimination: '#6366f1',
  discrimination_some_harm: '#ec4899'
};

const CONNECTION_TYPES = [
  'retaliation_chain', 'escalation', 'temporal_cluster', 'actor_continuity',
  'hostile_environment', 'continuing_violation', 'employer_notice',
  'convincing_mosaic', 'whistleblower_retaliation',
  'quid_pro_quo', 'sexual_harassment_pattern',
  'pay_discrimination', 'pay_retaliation_chain',
  'supervisor_liability', 'supervisor_pattern',
  'retaliatory_harassment', 'retaliatory_harassment_pattern',
  'fcra_discrimination', 'discrimination_some_harm'
];

const CONNECTION_TYPE_LABELS = {
  retaliation_chain:              { label: 'Retaliation Chain',               desc: 'Sequence of adverse actions following protected activity, establishing causation' },
  escalation:                     { label: 'Escalation Pattern',              desc: 'Progressive intensification of adverse treatment over time' },
  temporal_cluster:               { label: 'Temporal Cluster',                desc: 'Events concentrated in a short time window, suggesting coordinated conduct' },
  actor_continuity:               { label: 'Same-Actor Pattern',              desc: 'Repeated involvement of the same individual across multiple incidents' },
  hostile_environment:            { label: 'Hostile Work Environment',        desc: 'Pattern of conduct creating an abusive or intimidating workplace' },
  continuing_violation:           { label: 'Continuing Violation',            desc: 'Ongoing series of related acts treated as a single unlawful violation (Morgan)' },
  employer_notice:                { label: 'Employer Notice',                 desc: 'Evidence the employer knew or should have known of misconduct and failed to act' },
  convincing_mosaic:              { label: 'Convincing Mosaic',               desc: 'Cumulative circumstantial pattern establishing discriminatory intent (Lewis v. Union City)' },
  whistleblower_retaliation:      { label: 'Whistleblower Retaliation',       desc: 'Adverse action following a protected disclosure or complaint' },
  quid_pro_quo:                   { label: 'Quid Pro Quo',                   desc: 'Employment benefit conditioned on submission to unwelcome conduct' },
  sexual_harassment_pattern:      { label: 'Sexual Harassment Pattern',       desc: 'Repeated unwelcome sexual conduct creating a hostile environment' },
  pay_discrimination:             { label: 'Pay Discrimination',              desc: 'Unequal compensation based on a protected characteristic' },
  pay_retaliation_chain:          { label: 'Pay Retaliation',                desc: 'Compensation reduced or withheld following protected activity' },
  supervisor_liability:           { label: 'Supervisor Liability',            desc: 'Employer vicariously liable for supervisor\'s tangible employment actions (Vance)' },
  supervisor_pattern:             { label: 'Supervisor Pattern',              desc: 'Systematic conduct by supervisors establishing employer liability' },
  retaliatory_harassment:         { label: 'Retaliatory Harassment',          desc: 'Harassment directed at an employee following protected activity' },
  retaliatory_harassment_pattern: { label: 'Retaliatory Harassment Pattern',  desc: 'Systemic post-complaint harassment campaign establishing retaliatory motive' },
  fcra_discrimination:            { label: 'FCRA Discrimination',             desc: 'Discriminatory or retaliatory use of consumer report information' },
  discrimination_some_harm:       { label: 'Discriminatory Harm',             desc: 'Adverse action causing material harm based on a protected characteristic (Muldrow)' }
};

function ctLabel(type) {
  return (CONNECTION_TYPE_LABELS[type] || {}).label || (type ? type.replace(/_/g, ' ') : 'Unknown');
}
function ctDesc(type) {
  return (CONNECTION_TYPE_LABELS[type] || {}).desc || '';
}

export default function Connections({ onSelectDocument }) {
  const [connections, setConnections] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [autoDetecting, setAutoDetecting] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [editModal, setEditModal] = useState(null);
  const [editConnectionModal, setEditConnectionModal] = useState(null);
  const [showDismissed, setShowDismissed] = useState(false);

  // Build event-id → documents[] lookup for showing related docs on connection cards
  const docsByEventId = React.useMemo(() => {
    const map = new Map();
    for (const evt of events) {
      if (Array.isArray(evt.documents) && evt.documents.length > 0) {
        map.set(String(evt.id), evt.documents);
      }
    }
    return map;
  }, [events]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const { caseId } = await window.api.cases.current();
      if (!caseId) return;

      const [eventsRes, connectionsRes, suggestionsRes] = await Promise.all([
        window.api.events.list(caseId),
        window.api.connections.list(caseId),
        window.api.connections.listSuggested(caseId)
      ]);

      if (eventsRes.success) setEvents(eventsRes.events);
      // Filter out self-connections (same event as source and target)
      if (connectionsRes.success) setConnections(connectionsRes.connections.filter(c => c.source_id !== c.target_id));
      if (suggestionsRes.success) setSuggestions(suggestionsRes.suggestions.filter(s => s.source_id !== s.target_id));

      setLoading(false);
    } catch (err) {
      console.error('[Connections] Load failed:', err);
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleAutoDetect = async () => {
    try {
      setAutoDetecting(true);
      const { caseId } = await window.api.cases.current();
      const result = await window.api.connections.autoDetect(caseId);

      if (result.success) {
        const byType = {};
        result.connections.forEach(c => {
          byType[c.connection_type] = (byType[c.connection_type] || 0) + 1;
        });
        const breakdown = Object.entries(byType)
          .map(([t, n]) => `${ctLabel(t)}: ${n}`)
          .join('\n');
        alert(`Auto-Detect Complete!\n\nFound ${result.count} connections:\n${breakdown}`);
        loadData();
      } else {
        alert(`Auto-detect failed: ${result.error}`);
      }
      setAutoDetecting(false);
    } catch (err) {
      console.error('[Connections] Auto-detect failed:', err);
      setAutoDetecting(false);
    }
  };

  const handlePrecedentAnalysis = async () => {
    try {
      setAnalyzing(true);
      const { caseId } = await window.api.cases.current();
      const result = await window.api.connections.suggestFromPrecedents(caseId);

      if (result.success) {
        alert(`Precedent Analysis Complete!\n\nFound ${result.count} new suggestions based on legal precedents.`);
        loadData();
      } else {
        alert(`Analysis failed: ${result.error}`);
      }
      setAnalyzing(false);
    } catch (err) {
      console.error('[Connections] Precedent analysis failed:', err);
      setAnalyzing(false);
    }
  };

  const handleApprove = async (suggestion, edits) => {
    try {
      const { caseId } = await window.api.cases.current();
      const result = await window.api.connections.approveSuggestion(caseId, suggestion.id, edits);
      if (result.success) {
        loadData();
      }
    } catch (err) {
      console.error('[Connections] Approve failed:', err);
    }
  };

  const handleDismiss = async (suggestion) => {
    try {
      const { caseId } = await window.api.cases.current();
      await window.api.connections.dismissSuggestion(caseId, suggestion.id);
      loadData();
    } catch (err) {
      console.error('[Connections] Dismiss failed:', err);
    }
  };

  const handleBulkApprove = async () => {
    const pending = suggestions.filter(s => s.status === 'pending');
    if (pending.length === 0) return;
    if (!confirm(`Approve all ${pending.length} pending suggestions?`)) return;

    try {
      const { caseId } = await window.api.cases.current();
      await window.api.connections.bulkApprove(caseId, pending.map(s => s.id));
      loadData();
    } catch (err) {
      console.error('[Connections] Bulk approve failed:', err);
    }
  };

  const handleEditConnection = async (conn, edits) => {
    try {
      const { caseId } = await window.api.cases.current();
      await window.api.connections.update(caseId, conn.id, edits);
      setEditConnectionModal(null);
      loadData();
    } catch (err) {
      console.error('[Connections] Update failed:', err);
    }
  };

  const handleDeleteConnection = async (conn) => {
    if (!confirm('Delete this connection?')) return;
    try {
      const { caseId } = await window.api.cases.current();
      await window.api.connections.delete(caseId, conn.id);
      loadData();
    } catch (err) {
      console.error('[Connections] Delete failed:', err);
    }
  };

  const pendingSuggestions = suggestions.filter(s => s.status === 'pending');
  const dismissedSuggestions = suggestions.filter(s => s.status === 'dismissed');
  const reviewedCount = suggestions.filter(s => s.status !== 'pending').length;

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#8b92a8' }}>
        Loading connections...
      </div>
    );
  }

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: '#1a1d24',
      color: '#fff'
    }}>

      {/* HEADER */}
      <div style={{
        background: '#252932',
        padding: '16px 24px',
        borderBottom: '1px solid #2d323e',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '18px' }}>Connections & Precedent Intelligence</h2>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#8b92a8' }}>
            {events.length} events &bull; {connections.length} connections &bull; {pendingSuggestions.length} pending suggestions
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={handleAutoDetect}
            disabled={autoDetecting}
            style={{
              padding: '8px 16px',
              background: '#2d323e',
              border: '1px solid #3d4450',
              borderRadius: '6px',
              color: '#fff',
              fontSize: '13px',
              cursor: autoDetecting ? 'wait' : 'pointer',
              opacity: autoDetecting ? 0.6 : 1
            }}
          >
            {autoDetecting ? 'Detecting...' : 'Auto-Detect'}
          </button>

          <button
            onClick={handlePrecedentAnalysis}
            disabled={analyzing}
            style={{
              padding: '8px 16px',
              background: '#3b82f6',
              border: 'none',
              borderRadius: '6px',
              color: '#fff',
              fontSize: '13px',
              cursor: analyzing ? 'wait' : 'pointer',
              opacity: analyzing ? 0.6 : 1
            }}
          >
            {analyzing ? 'Analyzing...' : 'Precedent Analysis'}
          </button>
        </div>
      </div>

      {/* CONTENT */}
      <div style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>

        {/* SUGGESTED CONNECTIONS SECTION */}
        {pendingSuggestions.length > 0 && (
          <div style={{ marginBottom: '32px' }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: '16px'
            }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: '#f59e0b' }}>
                Suggested Connections ({pendingSuggestions.length})
              </h3>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {reviewedCount > 0 && (
                  <span style={{ fontSize: '12px', color: '#6b7280' }}>
                    {reviewedCount} previously reviewed
                  </span>
                )}
                <button
                  onClick={handleBulkApprove}
                  style={{
                    padding: '6px 12px',
                    background: '#059669',
                    border: 'none',
                    borderRadius: '4px',
                    color: '#fff',
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  Approve All ({pendingSuggestions.length})
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(440px, 1fr))', gap: '16px' }}>
              {pendingSuggestions.map(s => (
                <SuggestionCard
                  key={s.id}
                  suggestion={s}
                  onApprove={() => handleApprove(s)}
                  onEditApprove={() => setEditModal(s)}
                  onDismiss={() => handleDismiss(s)}
                />
              ))}
            </div>

            {/* Show dismissed toggle */}
            {dismissedSuggestions.length > 0 && (
              <div style={{ marginTop: '12px' }}>
                <button
                  onClick={() => setShowDismissed(!showDismissed)}
                  style={{
                    background: 'none', border: 'none', color: '#6b7280',
                    fontSize: '12px', cursor: 'pointer', textDecoration: 'underline'
                  }}
                >
                  {showDismissed ? 'Hide' : 'Show'} {dismissedSuggestions.length} dismissed
                </button>
                {showDismissed && (
                  <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(440px, 1fr))',
                    gap: '12px', marginTop: '12px', opacity: 0.5
                  }}>
                    {dismissedSuggestions.map(s => (
                      <SuggestionCard
                        key={s.id}
                        suggestion={s}
                        dismissed
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* EMPTY STATE — no connections AND no suggestions */}
        {connections.length === 0 && pendingSuggestions.length === 0 && (
          <div style={{
            textAlign: 'center',
            padding: '80px 20px',
            background: '#252932',
            borderRadius: '12px',
            border: '1px solid #2d323e'
          }}>
            <p style={{ fontSize: '16px', color: '#8b92a8', marginBottom: '20px' }}>
              No connections detected yet
            </p>
            <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '30px' }}>
              Run auto-detection to find timeline patterns, then use precedent analysis<br />
              to identify legally-significant connections across your {events.length} events.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={handleAutoDetect}
                style={{
                  padding: '12px 24px',
                  background: '#2d323e',
                  border: '1px solid #3d4450',
                  borderRadius: '6px',
                  color: '#fff',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Run Auto-Detection
              </button>
              <button
                onClick={handlePrecedentAnalysis}
                style={{
                  padding: '12px 24px',
                  background: '#3b82f6',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#fff',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Run Precedent Analysis
              </button>
            </div>
          </div>
        )}

        {/* APPROVED CONNECTIONS SECTION */}
        {connections.length > 0 && (
          <>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>
              Approved Connections ({connections.length})
            </h3>

            {/* Chain Assessment — ranked connection patterns */}
            {(() => {
              const typeGroups = {};
              for (const c of connections) {
                const t = c.connection_type || 'general';
                if (!typeGroups[t]) typeGroups[t] = [];
                typeGroups[t].push(c);
              }
              const ranked = Object.entries(typeGroups)
                .map(([type, conns]) => ({
                  type,
                  count: conns.length,
                  meanStrength: conns.reduce((sum, c) => sum + (c.strength || 0), 0) / conns.length
                }))
                .sort((a, b) => b.meanStrength - a.meanStrength);

              return (
                <div style={{
                  marginBottom: '24px', padding: '16px',
                  background: '#1e2028', border: '1px solid #2d323e',
                  borderRadius: '10px'
                }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>
                    Chain Assessment
                  </div>
                  <p style={{ fontSize: '12px', color: '#8b92a8', margin: '0 0 12px 0' }}>
                    Connection patterns ranked by evidential strength
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {ranked.map((g, i) => {
                      const pct = Math.round(g.meanStrength * 100);
                      const barColor = CONNECTION_TYPE_COLORS[g.type] || '#6b7280';
                      return (
                        <div key={g.type} style={{
                          display: 'flex', alignItems: 'center', gap: '10px',
                          padding: '8px 12px', background: '#252932',
                          borderRadius: '6px', border: '1px solid #2d323e'
                        }}>
                          <span style={{
                            width: '22px', height: '22px', borderRadius: '50%',
                            background: barColor, display: 'flex', alignItems: 'center',
                            justifyContent: 'center', fontSize: '11px', fontWeight: 700,
                            flexShrink: 0
                          }}>
                            {i + 1}
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                              <span style={{ fontSize: '13px', fontWeight: 600 }}>{ctLabel(g.type)}</span>
                              <span style={{ fontSize: '11px', color: '#6b7280' }}>
                                {g.count} link{g.count !== 1 ? 's' : ''}
                              </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <div style={{
                                flex: 1, height: '5px', background: '#1a1d24',
                                borderRadius: '3px', overflow: 'hidden'
                              }}>
                                <div style={{
                                  width: `${pct}%`, height: '100%',
                                  background: barColor, borderRadius: '3px'
                                }} />
                              </div>
                              <span style={{ fontSize: '11px', fontWeight: 600, color: barColor, minWidth: '32px' }}>
                                {pct}%
                              </span>
                            </div>
                            <p style={{ fontSize: '11px', color: '#6b7280', margin: '3px 0 0 0' }}>
                              {ctDesc(g.type)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '16px' }}>
              {connections.map(conn => (
                <div
                  key={conn.id}
                  style={{
                    background: '#252932',
                    border: '1px solid #2d323e',
                    borderRadius: '8px',
                    padding: '16px'
                  }}
                >
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '12px'
                  }}>
                    <span
                      title={ctDesc(conn.connection_type)}
                      style={{
                        padding: '4px 8px',
                        background: CONNECTION_TYPE_COLORS[conn.connection_type] || '#6b7280',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        cursor: 'help'
                      }}
                    >
                      {ctLabel(conn.connection_type)}
                    </span>

                    {conn.auto_detected === 1 && (
                      <span style={{ fontSize: '11px', color: '#6b7280' }}>Auto-detected</span>
                    )}

                    {conn.strength != null && (
                      <span style={{ fontSize: '11px', color: '#6b7280', marginLeft: 'auto' }}>
                        {Math.round(conn.strength * 100)}% strength
                      </span>
                    )}
                  </div>

                  {(() => {
                    // Always display in chronological order: earlier event first
                    const srcDate = conn.source_date ? new Date(conn.source_date) : null;
                    const tgtDate = conn.target_date ? new Date(conn.target_date) : null;
                    const reversed = srcDate && tgtDate && srcDate > tgtDate;
                    const firstTitle = reversed ? (conn.target_title || conn.target_id) : (conn.source_title || conn.source_id);
                    const firstDate = reversed ? conn.target_date : conn.source_date;
                    const secondTitle = reversed ? (conn.source_title || conn.source_id) : (conn.target_title || conn.target_id);
                    const secondDate = reversed ? conn.source_date : conn.target_date;
                    const absDays = conn.days_between != null ? Math.abs(conn.days_between) : null;
                    return (
                      <>
                        <div style={{ marginBottom: '8px' }}>
                          <div style={{ fontSize: '10px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '3px' }}>
                            Triggering Event
                          </div>
                          <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '2px' }}>
                            {firstTitle}
                          </div>
                          <div style={{ fontSize: '12px', color: '#8b92a8' }}>
                            {firstDate ? new Date(firstDate).toLocaleDateString() : ''}
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: '6px 0' }}>
                          <div style={{ flex: 1, height: '1px', background: '#3d4450' }} />
                          <span style={{ fontSize: '11px', color: '#6b7280', whiteSpace: 'nowrap' }}>
                            {absDays != null ? `${absDays}d later` : 'led to'}
                          </span>
                          <div style={{ color: '#6b7280', fontSize: '14px' }}>↓</div>
                        </div>

                        <div style={{ marginBottom: '12px' }}>
                          <div style={{ fontSize: '10px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '3px' }}>
                            Resulting Action
                          </div>
                          <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '2px' }}>
                            {secondTitle}
                          </div>
                          <div style={{ fontSize: '12px', color: '#8b92a8' }}>
                            {secondDate ? new Date(secondDate).toLocaleDateString() : ''}
                          </div>
                        </div>
                      </>
                    );
                  })()}

                  <div style={{
                    fontSize: '13px',
                    color: '#d1d5db',
                    padding: '10px 12px',
                    background: '#1a1d24',
                    borderRadius: '6px',
                    marginTop: '12px'
                  }}>
                    {conn.description}
                  </div>

                  {/* Related documents from linked events */}
                  {onSelectDocument && (() => {
                    const srcDocs = docsByEventId.get(String(conn.source_id)) || [];
                    const tgtDocs = docsByEventId.get(String(conn.target_id)) || [];
                    const seen = new Set();
                    const unique = [...srcDocs, ...tgtDocs].filter(d => {
                      if (seen.has(d.id)) return false;
                      seen.add(d.id);
                      return true;
                    });
                    if (!unique.length) return null;
                    return (
                      <div style={{ marginTop: 12 }}>
                        <div style={{ fontSize: '10px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                          Related Documents
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                          {unique.slice(0, 5).map(doc => (
                            <button
                              key={doc.id}
                              onClick={() => onSelectDocument(doc)}
                              style={{
                                padding: '3px 10px',
                                background: 'transparent',
                                border: '1px solid #3d4450',
                                borderRadius: 4,
                                color: '#9ca3af',
                                fontSize: '11px',
                                cursor: 'pointer',
                                maxWidth: 200,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}
                              title={doc.filename}
                            >
                              📄 {doc.filename || 'Document'}
                            </button>
                          ))}
                          {unique.length > 5 && (
                            <span style={{ fontSize: '11px', color: '#6b7280', padding: '3px 6px', alignSelf: 'center' }}>
                              +{unique.length - 5} more
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                    <button
                      onClick={() => setEditConnectionModal(conn)}
                      style={{
                        flex: 1,
                        padding: '6px',
                        background: 'transparent',
                        border: '1px solid #3d4450',
                        borderRadius: '4px',
                        color: '#e5e7eb',
                        fontSize: '12px',
                        cursor: 'pointer'
                      }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteConnection(conn)}
                      style={{
                        flex: 1,
                        padding: '6px',
                        background: 'transparent',
                        border: '1px solid #dc2626',
                        borderRadius: '4px',
                        color: '#dc2626',
                        fontSize: '12px',
                        cursor: 'pointer'
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div style={{
              marginTop: '40px',
              padding: '20px',
              background: '#252932',
              borderRadius: '8px',
              border: '1px solid #2d323e',
              textAlign: 'center'
            }}>
              <p style={{ margin: 0, color: '#8b92a8', fontSize: '13px' }}>
                Sankey flow visualization coming in next update
              </p>
            </div>
          </>
        )}

      </div>

      {/* EDIT & APPROVE MODAL (for suggestions) */}
      {editModal && (
        <EditApproveModal
          suggestion={editModal}
          events={events}
          onApprove={(edits) => {
            handleApprove(editModal, edits);
            setEditModal(null);
          }}
          onClose={() => setEditModal(null)}
        />
      )}

      {/* EDIT CONNECTION MODAL (for existing connections) */}
      {editConnectionModal && (
        <EditConnectionModal
          connection={editConnectionModal}
          events={events}
          onSave={(edits) => handleEditConnection(editConnectionModal, edits)}
          onClose={() => setEditConnectionModal(null)}
        />
      )}
    </div>
  );
}


// ─── Suggestion Card Component ─────────────────────────────────

function SuggestionCard({ suggestion: s, onApprove, onEditApprove, onDismiss, dismissed }) {
  const precedentColor = PRECEDENT_COLORS[s.precedent_key] || '#6b7280';
  const precedentLabel = PRECEDENT_LABELS[s.precedent_key] || s.precedent_key;

  return (
    <div style={{
      background: '#252932',
      border: `1px solid ${dismissed ? '#2d323e' : precedentColor + '40'}`,
      borderLeft: `3px solid ${precedentColor}`,
      borderRadius: '8px',
      padding: '16px'
    }}>
      {/* Header: Precedent + strength */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        marginBottom: '10px', flexWrap: 'wrap'
      }}>
        <span style={{
          padding: '3px 8px',
          background: precedentColor + '20',
          color: precedentColor,
          borderRadius: '4px',
          fontSize: '11px',
          fontWeight: 700
        }}>
          {precedentLabel}
        </span>
        {s.legal_element && (
          <span style={{
            padding: '3px 6px',
            background: '#1a1d24',
            borderRadius: '3px',
            fontSize: '10px',
            color: '#8b92a8',
            textTransform: 'uppercase',
            letterSpacing: '0.04em'
          }}>
            {s.legal_element.replace(/_/g, ' ')}
          </span>
        )}
        <span style={{ fontSize: '12px', color: '#6b7280', marginLeft: 'auto' }}>
          {Math.round((s.strength || 0) * 100)}%
        </span>
      </div>

      {/* Source → Target (always chronological) */}
      {(() => {
        const srcDate = s.source_date ? new Date(s.source_date) : null;
        const tgtDate = s.target_date ? new Date(s.target_date) : null;
        const reversed = srcDate && tgtDate && srcDate > tgtDate;
        const fTitle = reversed ? (s.target_title || s.target_id) : (s.source_title || s.source_id);
        const fDate = reversed ? s.target_date : s.source_date;
        const sTitle = reversed ? (s.source_title || s.source_id) : (s.target_title || s.target_id);
        const sDate = reversed ? s.source_date : s.target_date;
        const absDays = s.days_between != null ? Math.abs(s.days_between) : null;
        return (
          <div style={{ fontSize: '13px', marginBottom: '8px' }}>
            <div style={{ fontWeight: 600 }}>
              {fTitle}
              <span style={{ fontWeight: 400, color: '#8b92a8', marginLeft: '6px', fontSize: '12px' }}>
                {fDate ? new Date(fDate).toLocaleDateString() : ''}
              </span>
            </div>
            <div style={{ color: '#6b7280', fontSize: '12px', margin: '2px 0', paddingLeft: '8px' }}>
              — {absDays != null ? `${absDays} days` : '?'} →
            </div>
            <div style={{ fontWeight: 600 }}>
              {sTitle}
              <span style={{ fontWeight: 400, color: '#8b92a8', marginLeft: '6px', fontSize: '12px' }}>
                {sDate ? new Date(sDate).toLocaleDateString() : ''}
              </span>
            </div>
          </div>
        );
      })()}

      {/* Reasoning */}
      <div style={{
        fontSize: '12px',
        color: '#d1d5db',
        padding: '8px 10px',
        background: '#1a1d24',
        borderRadius: '6px',
        lineHeight: '1.5',
        marginBottom: '8px'
      }}>
        {s.reasoning || s.description}
      </div>

      {/* Overlap warning */}
      {s.overlaps_connection_id && (
        <div style={{
          fontSize: '11px', color: '#f59e0b', marginBottom: '8px',
          padding: '4px 8px', background: '#f59e0b15', borderRadius: '4px'
        }}>
          Overlaps existing connection — will upgrade strength on approval
        </div>
      )}

      {/* Status badge for dismissed */}
      {dismissed && (
        <div style={{
          fontSize: '11px', color: '#6b7280',
          padding: '4px 8px', background: '#1a1d24', borderRadius: '4px',
          textAlign: 'center'
        }}>
          Dismissed
        </div>
      )}

      {/* Actions */}
      {!dismissed && (
        <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
          <button
            onClick={onApprove}
            style={{
              flex: 1, padding: '6px',
              background: '#059669', border: 'none', borderRadius: '4px',
              color: '#fff', fontSize: '12px', cursor: 'pointer'
            }}
          >
            Approve
          </button>
          <button
            onClick={onEditApprove}
            style={{
              flex: 1, padding: '6px',
              background: 'transparent', border: '1px solid #3d4450', borderRadius: '4px',
              color: '#e5e7eb', fontSize: '12px', cursor: 'pointer'
            }}
          >
            Edit & Approve
          </button>
          <button
            onClick={onDismiss}
            style={{
              flex: 1, padding: '6px',
              background: 'transparent', border: '1px solid #6b7280', borderRadius: '4px',
              color: '#6b7280', fontSize: '12px', cursor: 'pointer'
            }}
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}


// ─── Strength recalculator based on connection type + days_between ─────────
function recalcStrength(newType, daysBetween) {
  const d = daysBetween ?? 0;
  switch (newType) {
    case 'retaliation_chain':
    case 'whistleblower_retaliation':
    case 'retaliatory_harassment':
    case 'retaliatory_harassment_pattern':
    case 'pay_retaliation_chain':
      if (d <= 7)  return 1.0;
      if (d <= 14) return 0.9;
      if (d <= 21) return 0.8;
      if (d <= 30) return 0.7;
      return 0.5;
    case 'temporal_cluster':
      return Math.max(0.1, parseFloat((1 - (d / 14)).toFixed(2)));
    case 'actor_continuity':
    case 'supervisor_pattern':
    case 'supervisor_liability':
      return 0.7;
    case 'escalation':
    case 'hostile_environment':
    case 'sexual_harassment_pattern':
    case 'continuing_violation':
      return 0.65;
    case 'convincing_mosaic':
    case 'employer_notice':
      return 0.6;
    default:
      return 0.6;
  }
}

// ─── Edit & Approve Modal (for suggestions) ────────────────────

function EditApproveModal({ suggestion, events = [], onApprove, onClose }) {
  const [connectionType, setConnectionType] = useState(suggestion.connection_type);
  const [strength, setStrength] = useState(suggestion.strength || 0.5);
  const [description, setDescription] = useState(suggestion.description || '');
  const [sourceId, setSourceId] = useState(suggestion.source_id);
  const [targetId, setTargetId] = useState(suggestion.target_id);

  const precedentLabel = PRECEDENT_LABELS[suggestion.precedent_key] || suggestion.precedent_key;
  const sortedEvents = [...events].sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        background: '#252932', borderRadius: '12px', padding: '24px',
        width: '520px', maxHeight: '80vh', overflowY: 'auto',
        border: '1px solid #3d4450'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ margin: 0, fontSize: '16px' }}>Review Connection</h3>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: '#6b7280', fontSize: '18px', cursor: 'pointer'
          }}>x</button>
        </div>

        {/* Event pickers */}
        <div style={{ marginBottom: '16px', fontSize: '13px' }}>
          <div style={{ marginBottom: '8px' }}>
            <label style={{ display: 'block', fontSize: '10px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '3px' }}>Triggering Event</label>
            <select
              value={sourceId}
              onChange={e => setSourceId(e.target.value)}
              style={{
                width: '100%', padding: '8px', background: '#1a1d24', border: '1px solid #3d4450',
                borderRadius: '4px', color: '#fff', fontSize: '12px'
              }}
            >
              {sortedEvents.map(ev => (
                <option key={ev.id} value={ev.id}>
                  {ev.date ? new Date(ev.date).toLocaleDateString() + ' — ' : ''}{ev.title || ev.id}
                </option>
              ))}
            </select>
          </div>

          <div style={{ color: '#6b7280', textAlign: 'center', margin: '4px 0', fontSize: '12px' }}>↓</div>

          <div>
            <label style={{ display: 'block', fontSize: '10px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '3px' }}>Resulting Action</label>
            <select
              value={targetId}
              onChange={e => setTargetId(e.target.value)}
              style={{
                width: '100%', padding: '8px', background: '#1a1d24', border: '1px solid #3d4450',
                borderRadius: '4px', color: '#fff', fontSize: '12px'
              }}
            >
              {sortedEvents.map(ev => (
                <option key={ev.id} value={ev.id}>
                  {ev.date ? new Date(ev.date).toLocaleDateString() + ' — ' : ''}{ev.title || ev.id}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Legal basis (read-only) */}
        <div style={{
          padding: '8px 12px', background: '#1a1d24', borderRadius: '6px',
          marginBottom: '16px', fontSize: '12px', color: '#8b92a8'
        }}>
          <strong>Legal basis:</strong> {precedentLabel} — {(suggestion.legal_element || '').replace(/_/g, ' ')}
        </div>

        {/* Editable fields */}
        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', fontSize: '12px', color: '#8b92a8', marginBottom: '4px' }}>Type</label>
          <select
            value={connectionType}
            onChange={e => {
              const newType = e.target.value;
              setConnectionType(newType);
              setStrength(recalcStrength(newType, suggestion.days_between));
            }}
            style={{
              width: '100%', padding: '8px', background: '#1a1d24', border: '1px solid #3d4450',
              borderRadius: '4px', color: '#fff', fontSize: '13px'
            }}
          >
            {CONNECTION_TYPES.map(t => (
              <option key={t} value={t}>{ctLabel(t)}</option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', fontSize: '12px', color: '#8b92a8', marginBottom: '4px' }}>
            Strength: {Math.round(strength * 100)}%
          </label>
          <input
            type="range"
            min="0" max="1" step="0.05"
            value={strength}
            onChange={e => setStrength(parseFloat(e.target.value))}
            style={{ width: '100%' }}
          />
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '12px', color: '#8b92a8', marginBottom: '4px' }}>Description</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={3}
            style={{
              width: '100%', padding: '8px', background: '#1a1d24', border: '1px solid #3d4450',
              borderRadius: '4px', color: '#fff', fontSize: '13px', resize: 'vertical',
              boxSizing: 'border-box'
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            padding: '8px 16px', background: 'transparent', border: '1px solid #3d4450',
            borderRadius: '6px', color: '#e5e7eb', fontSize: '13px', cursor: 'pointer'
          }}>
            Cancel
          </button>
          <button
            onClick={() => onApprove({
              connection_type: connectionType, strength, description,
              source_id: sourceId !== suggestion.source_id ? sourceId : undefined,
              target_id: targetId !== suggestion.target_id ? targetId : undefined
            })}
            style={{
              padding: '8px 16px', background: '#059669', border: 'none',
              borderRadius: '6px', color: '#fff', fontSize: '13px', cursor: 'pointer'
            }}
          >
            Approve
          </button>
        </div>
      </div>
    </div>
  );
}


// ─── Edit Connection Modal (for existing approved connections) ──

function EditConnectionModal({ connection, events = [], onSave, onClose }) {
  const [connectionType, setConnectionType] = useState(connection.connection_type);
  const [strength, setStrength] = useState(connection.strength || 0.5);
  const [description, setDescription] = useState(connection.description || '');
  const [sourceId, setSourceId] = useState(connection.source_id);
  const [targetId, setTargetId] = useState(connection.target_id);

  const sortedEvents = [...events].sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        background: '#252932', borderRadius: '12px', padding: '24px',
        width: '480px', border: '1px solid #3d4450'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ margin: 0, fontSize: '16px' }}>Edit Connection</h3>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: '#6b7280', fontSize: '18px', cursor: 'pointer'
          }}>x</button>
        </div>

        <div style={{ marginBottom: '16px', fontSize: '13px' }}>
          <div style={{ marginBottom: '8px' }}>
            <label style={{ display: 'block', fontSize: '10px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '3px' }}>Triggering Event</label>
            <select
              value={sourceId}
              onChange={e => setSourceId(e.target.value)}
              style={{
                width: '100%', padding: '8px', background: '#1a1d24', border: '1px solid #3d4450',
                borderRadius: '4px', color: '#fff', fontSize: '12px'
              }}
            >
              {sortedEvents.map(ev => (
                <option key={ev.id} value={ev.id}>
                  {ev.date ? new Date(ev.date).toLocaleDateString() + ' — ' : ''}{ev.title || ev.id}
                </option>
              ))}
            </select>
          </div>

          <div style={{ color: '#6b7280', textAlign: 'center', margin: '4px 0', fontSize: '12px' }}>↓</div>

          <div>
            <label style={{ display: 'block', fontSize: '10px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '3px' }}>Resulting Action</label>
            <select
              value={targetId}
              onChange={e => setTargetId(e.target.value)}
              style={{
                width: '100%', padding: '8px', background: '#1a1d24', border: '1px solid #3d4450',
                borderRadius: '4px', color: '#fff', fontSize: '12px'
              }}
            >
              {sortedEvents.map(ev => (
                <option key={ev.id} value={ev.id}>
                  {ev.date ? new Date(ev.date).toLocaleDateString() + ' — ' : ''}{ev.title || ev.id}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', fontSize: '12px', color: '#8b92a8', marginBottom: '4px' }}>Type</label>
          <select
            value={connectionType}
            onChange={e => {
              const newType = e.target.value;
              setConnectionType(newType);
              setStrength(recalcStrength(newType, connection.days_between));
            }}
            style={{
              width: '100%', padding: '8px', background: '#1a1d24', border: '1px solid #3d4450',
              borderRadius: '4px', color: '#fff', fontSize: '13px'
            }}
          >
            {CONNECTION_TYPES.map(t => (
              <option key={t} value={t}>{ctLabel(t)}</option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', fontSize: '12px', color: '#8b92a8', marginBottom: '4px' }}>
            Strength: {Math.round(strength * 100)}%
          </label>
          <input
            type="range"
            min="0" max="1" step="0.05"
            value={strength}
            onChange={e => setStrength(parseFloat(e.target.value))}
            style={{ width: '100%' }}
          />
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '12px', color: '#8b92a8', marginBottom: '4px' }}>Description</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={3}
            style={{
              width: '100%', padding: '8px', background: '#1a1d24', border: '1px solid #3d4450',
              borderRadius: '4px', color: '#fff', fontSize: '13px', resize: 'vertical',
              boxSizing: 'border-box'
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            padding: '8px 16px', background: 'transparent', border: '1px solid #3d4450',
            borderRadius: '6px', color: '#e5e7eb', fontSize: '13px', cursor: 'pointer'
          }}>
            Cancel
          </button>
          <button
            onClick={() => onSave({
              connection_type: connectionType, strength, description,
              source_id: sourceId !== connection.source_id ? sourceId : undefined,
              target_id: targetId !== connection.target_id ? targetId : undefined
            })}
            style={{
              padding: '8px 16px', background: '#3b82f6', border: 'none',
              borderRadius: '6px', color: '#fff', fontSize: '13px', cursor: 'pointer'
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
