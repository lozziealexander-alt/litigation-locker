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
  whistleblower_retaliation: '#10b981'
};

const CONNECTION_TYPES = [
  'retaliation_chain', 'escalation', 'temporal_cluster', 'actor_continuity',
  'hostile_environment', 'continuing_violation', 'employer_notice',
  'convincing_mosaic', 'whistleblower_retaliation'
];

export default function Connections() {
  const [connections, setConnections] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [autoDetecting, setAutoDetecting] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [editModal, setEditModal] = useState(null);
  const [editConnectionModal, setEditConnectionModal] = useState(null);
  const [showDismissed, setShowDismissed] = useState(false);

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
      if (connectionsRes.success) setConnections(connectionsRes.connections);
      if (suggestionsRes.success) setSuggestions(suggestionsRes.suggestions);

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
          .map(([t, n]) => `${t.replace(/_/g, ' ')}: ${n}`)
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
                    <span style={{
                      padding: '4px 8px',
                      background: CONNECTION_TYPE_COLORS[conn.connection_type] || '#6b7280',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: 600,
                      textTransform: 'uppercase'
                    }}>
                      {conn.connection_type ? conn.connection_type.replace(/_/g, ' ') : 'unknown'}
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

                  <div style={{ marginBottom: '8px' }}>
                    <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '2px' }}>
                      {conn.source_title || conn.source_id}
                    </div>
                    <div style={{ fontSize: '12px', color: '#8b92a8' }}>
                      {conn.source_date ? new Date(conn.source_date).toLocaleDateString() : ''}
                    </div>
                  </div>

                  <div style={{ fontSize: '18px', color: '#6b7280', textAlign: 'center', margin: '6px 0' }}>
                    ↓
                  </div>

                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '2px' }}>
                      {conn.target_title || conn.target_id}
                    </div>
                    <div style={{ fontSize: '12px', color: '#8b92a8' }}>
                      {conn.target_date ? new Date(conn.target_date).toLocaleDateString() : ''}
                    </div>
                  </div>

                  <div style={{
                    fontSize: '13px',
                    color: '#d1d5db',
                    padding: '10px 12px',
                    background: '#1a1d24',
                    borderRadius: '6px',
                    marginTop: '12px'
                  }}>
                    {conn.description}
                    {conn.days_between != null && (
                      <div style={{ marginTop: '4px', fontSize: '12px', color: '#8b92a8' }}>
                        <strong>{conn.days_between} days</strong> between events
                      </div>
                    )}
                  </div>

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
        <span style={{
          padding: '3px 6px',
          background: '#1a1d24',
          borderRadius: '3px',
          fontSize: '10px',
          color: '#8b92a8',
          textTransform: 'uppercase'
        }}>
          {(s.legal_element || '').replace(/_/g, ' ')}
        </span>
        <span style={{ fontSize: '12px', color: '#6b7280', marginLeft: 'auto' }}>
          {Math.round((s.strength || 0) * 100)}%
        </span>
      </div>

      {/* Source → Target */}
      <div style={{ fontSize: '13px', marginBottom: '8px' }}>
        <div style={{ fontWeight: 600 }}>
          {s.source_title || s.source_id}
          <span style={{ fontWeight: 400, color: '#8b92a8', marginLeft: '6px', fontSize: '12px' }}>
            {s.source_date ? new Date(s.source_date).toLocaleDateString() : ''}
          </span>
        </div>
        <div style={{ color: '#6b7280', fontSize: '12px', margin: '2px 0', paddingLeft: '8px' }}>
          — {s.days_between != null ? `${s.days_between} days` : '?'} →
        </div>
        <div style={{ fontWeight: 600 }}>
          {s.target_title || s.target_id}
          <span style={{ fontWeight: 400, color: '#8b92a8', marginLeft: '6px', fontSize: '12px' }}>
            {s.target_date ? new Date(s.target_date).toLocaleDateString() : ''}
          </span>
        </div>
      </div>

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


// ─── Edit & Approve Modal (for suggestions) ────────────────────

function EditApproveModal({ suggestion, onApprove, onClose }) {
  const [connectionType, setConnectionType] = useState(suggestion.connection_type);
  const [strength, setStrength] = useState(suggestion.strength || 0.5);
  const [description, setDescription] = useState(suggestion.description || '');

  const precedentLabel = PRECEDENT_LABELS[suggestion.precedent_key] || suggestion.precedent_key;

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

        {/* Event info */}
        <div style={{ marginBottom: '16px', fontSize: '13px' }}>
          <div style={{ color: '#8b92a8', marginBottom: '4px' }}>Source</div>
          <div style={{ fontWeight: 600 }}>{suggestion.source_title || suggestion.source_id}</div>
          <div style={{ color: '#8b92a8', fontSize: '12px' }}>
            {suggestion.source_date ? new Date(suggestion.source_date).toLocaleDateString() : ''}
          </div>

          <div style={{ color: '#6b7280', textAlign: 'center', margin: '8px 0' }}>
            {suggestion.days_between != null ? `${suggestion.days_between} days` : ''} ↓
          </div>

          <div style={{ color: '#8b92a8', marginBottom: '4px' }}>Target</div>
          <div style={{ fontWeight: 600 }}>{suggestion.target_title || suggestion.target_id}</div>
          <div style={{ color: '#8b92a8', fontSize: '12px' }}>
            {suggestion.target_date ? new Date(suggestion.target_date).toLocaleDateString() : ''}
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
            onChange={e => setConnectionType(e.target.value)}
            style={{
              width: '100%', padding: '8px', background: '#1a1d24', border: '1px solid #3d4450',
              borderRadius: '4px', color: '#fff', fontSize: '13px'
            }}
          >
            {CONNECTION_TYPES.map(t => (
              <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
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
            onClick={() => onApprove({ connection_type: connectionType, strength, description })}
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

function EditConnectionModal({ connection, onSave, onClose }) {
  const [connectionType, setConnectionType] = useState(connection.connection_type);
  const [strength, setStrength] = useState(connection.strength || 0.5);
  const [description, setDescription] = useState(connection.description || '');

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
          <div style={{ fontWeight: 600 }}>{connection.source_title || connection.source_id}</div>
          <div style={{ color: '#6b7280', textAlign: 'center', margin: '4px 0' }}>↓</div>
          <div style={{ fontWeight: 600 }}>{connection.target_title || connection.target_id}</div>
        </div>

        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', fontSize: '12px', color: '#8b92a8', marginBottom: '4px' }}>Type</label>
          <select
            value={connectionType}
            onChange={e => setConnectionType(e.target.value)}
            style={{
              width: '100%', padding: '8px', background: '#1a1d24', border: '1px solid #3d4450',
              borderRadius: '4px', color: '#fff', fontSize: '13px'
            }}
          >
            {CONNECTION_TYPES.map(t => (
              <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
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
            onClick={() => onSave({ connection_type: connectionType, strength, description })}
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
