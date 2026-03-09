import React, { useState, useEffect } from 'react';

export default function Connections() {
  const [connections, setConnections] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [autoDetecting, setAutoDetecting] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);

      const { caseId } = await window.api.cases.current();
      if (!caseId) return;

      const eventsRes = await window.api.events.list(caseId);
      if (eventsRes.success) {
        setEvents(eventsRes.events);
      }

      const connectionsRes = await window.api.connections.list(caseId);
      if (connectionsRes.success) {
        setConnections(connectionsRes.connections);
      }

      setLoading(false);
    } catch (err) {
      console.error('[Connections] Load failed:', err);
      setLoading(false);
    }
  };

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
          .map(([t, n]) => `• ${t.replace(/_/g, ' ')}: ${n}`)
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
          <h2 style={{ margin: 0, fontSize: '18px' }}>Case Flow Diagram</h2>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#8b92a8' }}>
            {events.length} events &bull; {connections.length} connections
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={handleAutoDetect}
            disabled={autoDetecting}
            style={{
              padding: '8px 16px',
              background: '#3b82f6',
              border: 'none',
              borderRadius: '6px',
              color: '#fff',
              fontSize: '13px',
              cursor: autoDetecting ? 'wait' : 'pointer',
              opacity: autoDetecting ? 0.6 : 1
            }}
          >
            {autoDetecting ? 'Detecting...' : 'Auto-Detect Connections'}
          </button>

          <button
            onClick={() => alert('Manual connection creation coming soon')}
            style={{
              padding: '8px 16px',
              background: '#2d323e',
              border: '1px solid #3d4450',
              borderRadius: '6px',
              color: '#fff',
              fontSize: '13px',
              cursor: 'pointer'
            }}
          >
            + Add Connection
          </button>
        </div>
      </div>

      {/* CONTENT */}
      <div style={{ flex: 1, padding: '40px', overflowY: 'auto' }}>

        {connections.length === 0 ? (
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
              Run auto-detection to find retaliation chains, escalation patterns,<br />
              and temporal clusters across your {events.length} events.
            </p>
            <button
              onClick={handleAutoDetect}
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
              Run Auto-Detection
            </button>
          </div>
        ) : (
          <>
            <h3 style={{ margin: '0 0 20px 0', fontSize: '16px' }}>
              Detected Connections
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
                      background:
                        conn.connection_type === 'retaliation_chain' ? '#dc2626' :
                        conn.connection_type === 'escalation' ? '#f97316' :
                        conn.connection_type === 'temporal_cluster' ? '#3b82f6' : '#6b7280',
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
                      onClick={() => alert('Edit connection: ' + conn.id)}
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
                      onClick={async () => {
                        if (confirm('Delete this connection?')) {
                          const { caseId } = await window.api.cases.current();
                          await window.api.connections.delete(caseId, conn.id);
                          loadData();
                        }
                      }}
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
    </div>
  );
}
