import React, { useState, useEffect } from 'react';
import { colors, spacing, typography, radius, shadows } from '../styles/tokens';

const CONNECTION_TYPES = [
  { value: 'retaliation_chain', label: 'Retaliation Chain', color: '#dc2626' },
  { value: 'escalation', label: 'Escalation', color: '#f97316' },
  { value: 'temporal_cluster', label: 'Temporal Cluster', color: '#3b82f6' },
  { value: 'influenced', label: 'Influenced', color: '#8b5cf6' },
  { value: 'responded_to', label: 'Responded To', color: '#14b8a6' },
  { value: 'preceded', label: 'Preceded', color: '#6b7280' },
  { value: 'collaborated_with', label: 'Collaborated With', color: '#eab308' },
  { value: 'enabled', label: 'Enabled', color: '#ec4899' }
];

function getTypeColor(type) {
  const found = CONNECTION_TYPES.find(t => t.value === type);
  return found ? found.color : '#6b7280';
}

export default function Connections() {
  const [connections, setConnections] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [autoDetecting, setAutoDetecting] = useState(false);
  const [editingConn, setEditingConn] = useState(null); // null = closed, {} = new, {id,...} = edit

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');

      const { caseId } = await window.api.cases.current();
      if (!caseId) { setError('No active case'); setLoading(false); return; }

      const [eventsRes, connectionsRes] = await Promise.all([
        window.api.events.list(caseId),
        window.api.connections.list(caseId)
      ]);

      if (eventsRes.success) setEvents(eventsRes.events);
      if (connectionsRes.success) setConnections(connectionsRes.connections);
    } catch (err) {
      console.error('[Connections] Load failed:', err);
      setError('Failed to load connections: ' + err.message);
    }
    setLoading(false);
  };

  const handleAutoDetect = async () => {
    try {
      setAutoDetecting(true);
      setError('');

      const { caseId } = await window.api.cases.current();
      const result = await window.api.connections.autoDetect(caseId);

      if (result.success) {
        const byType = {};
        result.connections.forEach(c => {
          byType[c.connection_type] = (byType[c.connection_type] || 0) + 1;
        });
        const breakdown = Object.entries(byType)
          .map(([t, n]) => `\u2022 ${t.replace(/_/g, ' ')}: ${n}`)
          .join('\n');
        alert(`Auto-Detect Complete!\n\nFound ${result.count} connections:\n${breakdown}`);
        loadData();
      } else {
        setError('Auto-detect failed: ' + (result.error || 'Unknown error'));
      }
    } catch (err) {
      console.error('[Connections] Auto-detect failed:', err);
      setError('Auto-detect failed: ' + err.message);
    }
    setAutoDetecting(false);
  };

  const handleDelete = async (connId) => {
    if (!confirm('Delete this connection?')) return;
    try {
      const { caseId } = await window.api.cases.current();
      const result = await window.api.connections.delete(caseId, connId);
      if (result.success) {
        loadData();
      } else {
        setError('Failed to delete connection: ' + (result.error || 'Unknown error'));
      }
    } catch (err) {
      setError('Failed to delete connection: ' + err.message);
    }
  };

  const handleSaveConnection = async (data) => {
    try {
      setError('');
      const { caseId } = await window.api.cases.current();
      let result;
      if (data.id) {
        result = await window.api.connections.update(caseId, data.id, data);
      } else {
        result = await window.api.connections.create(caseId, data);
      }
      if (result.success) {
        setEditingConn(null);
        loadData();
      } else {
        setError('Failed to save connection: ' + (result.error || 'Unknown error'));
      }
    } catch (err) {
      setError('Failed to save connection: ' + err.message);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: colors.textMuted }}>
        Loading connections...
      </div>
    );
  }

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: colors.bg,
      color: colors.textPrimary
    }}>

      {/* HEADER */}
      <div style={{
        background: colors.surface,
        padding: `${spacing.md} ${spacing.lg}`,
        borderBottom: `1px solid ${colors.border}`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: typography.fontSize.lg }}>Case Flow Diagram</h2>
          <p style={{ margin: '4px 0 0 0', fontSize: typography.fontSize.sm, color: colors.textMuted }}>
            {events.length} events &bull; {connections.length} connections
          </p>
        </div>

        <div style={{ display: 'flex', gap: spacing.sm }}>
          <button
            onClick={handleAutoDetect}
            disabled={autoDetecting}
            style={{
              padding: `${spacing.sm} ${spacing.md}`,
              background: colors.primary,
              border: 'none',
              borderRadius: radius.md,
              color: colors.textInverse,
              fontSize: typography.fontSize.sm,
              cursor: autoDetecting ? 'wait' : 'pointer',
              opacity: autoDetecting ? 0.6 : 1
            }}
          >
            {autoDetecting ? 'Detecting...' : 'Auto-Detect Connections'}
          </button>

          <button
            onClick={() => setEditingConn({})}
            style={{
              padding: `${spacing.sm} ${spacing.md}`,
              background: colors.surfaceHover || colors.border,
              border: `1px solid ${colors.border}`,
              borderRadius: radius.md,
              color: colors.textPrimary,
              fontSize: typography.fontSize.sm,
              cursor: 'pointer'
            }}
          >
            + Add Connection
          </button>
        </div>
      </div>

      {/* ERROR BANNER */}
      {error && (
        <div style={{
          padding: `${spacing.sm} ${spacing.lg}`,
          background: '#FEE2E2',
          color: '#DC2626',
          fontSize: typography.fontSize.sm,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span>{error}</span>
          <button
            onClick={() => setError('')}
            style={{ background: 'none', border: 'none', color: '#DC2626', cursor: 'pointer', fontSize: '16px' }}
          >
            \u00d7
          </button>
        </div>
      )}

      {/* CONTENT */}
      <div style={{ flex: 1, padding: spacing.xl, overflowY: 'auto' }}>

        {connections.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '80px 20px',
            background: colors.surface,
            borderRadius: radius.xl,
            border: `1px solid ${colors.border}`
          }}>
            <p style={{ fontSize: typography.fontSize.base, color: colors.textMuted, marginBottom: spacing.lg }}>
              No connections detected yet
            </p>
            <p style={{ fontSize: typography.fontSize.sm, color: colors.textMuted, marginBottom: spacing.xl }}>
              Run auto-detection to find retaliation chains, escalation patterns,<br />
              and temporal clusters across your {events.length} events.
            </p>
            <button
              onClick={handleAutoDetect}
              style={{
                padding: `${spacing.md} ${spacing.lg}`,
                background: colors.primary,
                border: 'none',
                borderRadius: radius.md,
                color: colors.textInverse,
                fontSize: typography.fontSize.sm,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Run Auto-Detection
            </button>
          </div>
        ) : (
          <>
            <h3 style={{ margin: `0 0 ${spacing.lg} 0`, fontSize: typography.fontSize.base }}>
              Detected Connections
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: spacing.md }}>
              {connections.map(conn => (
                <div
                  key={conn.id}
                  style={{
                    background: colors.surface,
                    border: `1px solid ${colors.border}`,
                    borderRadius: radius.lg,
                    padding: spacing.md
                  }}
                >
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: spacing.sm,
                    marginBottom: spacing.md
                  }}>
                    <span style={{
                      padding: '4px 8px',
                      background: getTypeColor(conn.connection_type),
                      borderRadius: radius.sm,
                      fontSize: typography.fontSize.xs,
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      color: '#fff'
                    }}>
                      {conn.connection_type ? conn.connection_type.replace(/_/g, ' ') : 'unknown'}
                    </span>

                    {conn.auto_detected === 1 && (
                      <span style={{ fontSize: typography.fontSize.xs, color: colors.textMuted }}>Auto-detected</span>
                    )}

                    {conn.strength != null && (
                      <span style={{ fontSize: typography.fontSize.xs, color: colors.textMuted, marginLeft: 'auto' }}>
                        {Math.round(conn.strength * 100)}% strength
                      </span>
                    )}
                  </div>

                  <div style={{ marginBottom: spacing.sm }}>
                    <div style={{ fontSize: typography.fontSize.sm, fontWeight: 600, marginBottom: '2px' }}>
                      {conn.source_title || conn.source_id}
                    </div>
                    <div style={{ fontSize: typography.fontSize.xs, color: colors.textMuted }}>
                      {conn.source_date ? new Date(conn.source_date).toLocaleDateString() : ''}
                    </div>
                  </div>

                  <div style={{ fontSize: '18px', color: colors.textMuted, textAlign: 'center', margin: '6px 0' }}>
                    \u2193
                  </div>

                  <div style={{ marginBottom: spacing.md }}>
                    <div style={{ fontSize: typography.fontSize.sm, fontWeight: 600, marginBottom: '2px' }}>
                      {conn.target_title || conn.target_id}
                    </div>
                    <div style={{ fontSize: typography.fontSize.xs, color: colors.textMuted }}>
                      {conn.target_date ? new Date(conn.target_date).toLocaleDateString() : ''}
                    </div>
                  </div>

                  <div style={{
                    fontSize: typography.fontSize.sm,
                    color: colors.textSecondary,
                    padding: `${spacing.sm} ${spacing.md}`,
                    background: colors.bg,
                    borderRadius: radius.md,
                    marginTop: spacing.md
                  }}>
                    {conn.description}
                    {conn.days_between != null && (
                      <div style={{ marginTop: '4px', fontSize: typography.fontSize.xs, color: colors.textMuted }}>
                        <strong>{conn.days_between} days</strong> between events
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: spacing.sm, marginTop: spacing.md }}>
                    <button
                      onClick={() => setEditingConn(conn)}
                      style={{
                        flex: 1,
                        padding: '6px',
                        background: 'transparent',
                        border: `1px solid ${colors.border}`,
                        borderRadius: radius.sm,
                        color: colors.textPrimary,
                        fontSize: typography.fontSize.xs,
                        cursor: 'pointer'
                      }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(conn.id)}
                      style={{
                        flex: 1,
                        padding: '6px',
                        background: 'transparent',
                        border: '1px solid #dc2626',
                        borderRadius: radius.sm,
                        color: '#dc2626',
                        fontSize: typography.fontSize.xs,
                        cursor: 'pointer'
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* CONNECTION MODAL */}
      {editingConn && (
        <ConnectionModal
          connection={editingConn}
          events={events}
          onSave={handleSaveConnection}
          onClose={() => setEditingConn(null)}
        />
      )}
    </div>
  );
}

function ConnectionModal({ connection, events, onSave, onClose }) {
  const isEditing = !!connection.id;
  const [sourceId, setSourceId] = useState(connection.source_event_id || '');
  const [targetId, setTargetId] = useState(connection.target_event_id || '');
  const [type, setType] = useState(connection.connection_type || 'retaliation_chain');
  const [description, setDescription] = useState(connection.description || '');
  const [strength, setStrength] = useState(connection.strength != null ? Math.round(connection.strength * 100) : 80);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const handleSubmit = async () => {
    if (!sourceId || !targetId) {
      setFormError('Please select both source and target events');
      return;
    }
    if (sourceId === targetId) {
      setFormError('Source and target events must be different');
      return;
    }

    setSaving(true);
    setFormError('');

    const data = {
      source_event_id: sourceId,
      target_event_id: targetId,
      connection_type: type,
      description: description.trim(),
      strength: strength / 100,
      auto_detected: 0
    };
    if (isEditing) data.id = connection.id;

    await onSave(data);
    setSaving(false);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000
    }} onClick={onClose}>
      <div style={{
        background: colors.surface,
        borderRadius: radius.xl,
        width: '560px',
        maxWidth: '90vw',
        maxHeight: '90vh',
        overflow: 'auto',
        boxShadow: shadows.lg
      }} onClick={e => e.stopPropagation()}>

        <div style={{
          padding: spacing.lg,
          borderBottom: `1px solid ${colors.border}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h2 style={{ margin: 0, fontSize: typography.fontSize.lg, fontWeight: 600, color: colors.textPrimary }}>
            {isEditing ? 'Edit Connection' : 'Add Connection'}
          </h2>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', fontSize: '24px',
            cursor: 'pointer', color: colors.textMuted, lineHeight: 1
          }}>\u00d7</button>
        </div>

        {formError && (
          <div style={{ padding: `${spacing.sm} ${spacing.lg}`, background: '#FEE2E2', color: '#DC2626', fontSize: typography.fontSize.sm }}>
            {formError}
          </div>
        )}

        <div style={{ padding: spacing.lg }}>
          <div style={{ marginBottom: spacing.lg }}>
            <label style={{ display: 'block', fontSize: typography.fontSize.sm, fontWeight: 600, marginBottom: spacing.sm, color: colors.textPrimary }}>
              Source Event *
            </label>
            <select value={sourceId} onChange={e => setSourceId(e.target.value)} style={{
              width: '100%', padding: `${spacing.sm} ${spacing.md}`,
              fontSize: typography.fontSize.sm, border: `1px solid ${colors.border}`,
              borderRadius: radius.md, boxSizing: 'border-box',
              background: colors.bg, color: colors.textPrimary
            }}>
              <option value="">-- Select source event --</option>
              {events.map(ev => (
                <option key={ev.id} value={ev.id}>
                  {ev.date ? `${ev.date} — ` : ''}{ev.title}
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: spacing.lg }}>
            <label style={{ display: 'block', fontSize: typography.fontSize.sm, fontWeight: 600, marginBottom: spacing.sm, color: colors.textPrimary }}>
              Target Event *
            </label>
            <select value={targetId} onChange={e => setTargetId(e.target.value)} style={{
              width: '100%', padding: `${spacing.sm} ${spacing.md}`,
              fontSize: typography.fontSize.sm, border: `1px solid ${colors.border}`,
              borderRadius: radius.md, boxSizing: 'border-box',
              background: colors.bg, color: colors.textPrimary
            }}>
              <option value="">-- Select target event --</option>
              {events.map(ev => (
                <option key={ev.id} value={ev.id}>
                  {ev.date ? `${ev.date} — ` : ''}{ev.title}
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: spacing.lg }}>
            <label style={{ display: 'block', fontSize: typography.fontSize.sm, fontWeight: 600, marginBottom: spacing.sm, color: colors.textPrimary }}>
              Connection Type
            </label>
            <select value={type} onChange={e => setType(e.target.value)} style={{
              width: '100%', padding: `${spacing.sm} ${spacing.md}`,
              fontSize: typography.fontSize.sm, border: `1px solid ${colors.border}`,
              borderRadius: radius.md, boxSizing: 'border-box',
              background: colors.bg, color: colors.textPrimary
            }}>
              {CONNECTION_TYPES.map(ct => (
                <option key={ct.value} value={ct.value}>{ct.label}</option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: spacing.lg }}>
            <label style={{ display: 'block', fontSize: typography.fontSize.sm, fontWeight: 600, marginBottom: spacing.sm, color: colors.textPrimary }}>
              Strength: {strength}%
            </label>
            <input type="range" min={0} max={100} value={strength} onChange={e => setStrength(Number(e.target.value))} style={{ width: '100%' }} />
          </div>

          <div style={{ marginBottom: spacing.lg }}>
            <label style={{ display: 'block', fontSize: typography.fontSize.sm, fontWeight: 600, marginBottom: spacing.sm, color: colors.textPrimary }}>
              Description
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Describe the connection between these events..."
              rows={3}
              style={{
                width: '100%', padding: `${spacing.sm} ${spacing.md}`,
                fontSize: typography.fontSize.sm, border: `1px solid ${colors.border}`,
                borderRadius: radius.md, boxSizing: 'border-box', resize: 'vertical',
                background: colors.bg, color: colors.textPrimary
              }}
            />
          </div>
        </div>

        <div style={{
          padding: spacing.lg,
          borderTop: `1px solid ${colors.border}`,
          display: 'flex', gap: spacing.md, justifyContent: 'flex-end'
        }}>
          <button onClick={onClose} style={{
            padding: `${spacing.sm} ${spacing.lg}`,
            border: `1px solid ${colors.border}`,
            borderRadius: radius.md,
            background: colors.surface,
            color: colors.textPrimary,
            cursor: 'pointer',
            fontSize: typography.fontSize.sm
          }}>
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={saving} style={{
            padding: `${spacing.sm} ${spacing.lg}`,
            border: 'none',
            borderRadius: radius.md,
            background: colors.primary,
            color: colors.textInverse,
            cursor: saving ? 'wait' : 'pointer',
            fontSize: typography.fontSize.sm,
            fontWeight: 600,
            opacity: saving ? 0.6 : 1
          }}>
            {saving ? 'Saving...' : (isEditing ? 'Update' : 'Create')}
          </button>
        </div>
      </div>
    </div>
  );
}
