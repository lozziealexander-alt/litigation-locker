import React, { useState, useEffect, useRef, useMemo } from 'react';

const EVIDENCE_COLORS = {
  email: '#3b82f6',
  screenshot: '#8b5cf6',
  chat_screenshot: '#a855f7',
  photo: '#06b6d4',
  performance_review: '#ef4444',
  hr_document: '#f97316',
  pay_record: '#22c55e',
  legal_document: '#eab308',
  policy: '#64748b',
  contract: '#14b8a6',
  medical_record: '#ec4899',
  letter: '#6366f1',
  meeting_notes: '#78716c',
  chat_export: '#a855f7',
  text_document: '#94a3b8',
  document: '#94a3b8',
  other: '#6b7280'
};

const EVIDENCE_ICONS = {
  email: '\u2709',
  screenshot: '\uD83D\uDCF1',
  chat_screenshot: '\uD83D\uDCAC',
  photo: '\uD83D\uDCF7',
  performance_review: '\uD83D\uDCCA',
  hr_document: '\uD83D\uDCC1',
  pay_record: '\uD83D\uDCB0',
  legal_document: '\u2696\uFE0F',
  policy: '\uD83D\uDCD6',
  contract: '\uD83D\uDCDD',
  medical_record: '\uD83C\uDFE5',
  letter: '\u2709\uFE0F',
  meeting_notes: '\uD83D\uDCCB',
  chat_export: '\uD83D\uDCAC',
  text_document: '\uD83D\uDCC4',
  document: '\uD83D\uDCC4',
  other: '\uD83D\uDCCE'
};

export default function Timeline({ onSelectDocument }) {
  const [dated, setDated] = useState([]);
  const [undated, setUndated] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const timelineRef = useRef(null);

  useEffect(() => {
    loadTimeline();
  }, []);

  async function loadTimeline() {
    const result = await window.api.timeline.get();
    if (result.success) {
      setDated(result.dated || []);
      setUndated(result.undated || []);
    }
  }

  // Group documents by month for the timeline
  const monthGroups = useMemo(() => {
    const groups = {};
    for (const doc of dated) {
      const d = new Date(doc.document_date);
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      if (!groups[key]) {
        groups[key] = {
          key,
          year: d.getUTCFullYear(),
          month: d.getUTCMonth(),
          label: d.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }),
          docs: []
        };
      }
      groups[key].docs.push(doc);
    }
    return Object.values(groups).sort((a, b) => a.key.localeCompare(b.key));
  }, [dated]);

  // Compute year markers
  const years = useMemo(() => {
    const yrs = new Set();
    for (const g of monthGroups) yrs.add(g.year);
    return [...yrs].sort();
  }, [monthGroups]);

  function handleSelect(doc) {
    setSelectedId(doc.id);
    if (onSelectDocument) onSelectDocument(doc);
  }

  function formatDate(iso) {
    if (!iso) return 'No date';
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      timeZone: 'UTC'
    });
  }

  function formatSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  const totalDocs = dated.length + undated.length;

  return (
    <div style={styles.container}>
      {/* Timeline header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <h2 style={styles.title}>Timeline</h2>
          <span style={styles.count}>
            {totalDocs} document{totalDocs !== 1 ? 's' : ''}
            {undated.length > 0 && ` \u00B7 ${undated.length} undated`}
          </span>
        </div>
        <div style={styles.zoomControls}>
          <button
            onClick={() => setZoomLevel(z => Math.max(0.5, z - 0.25))}
            style={styles.zoomBtn}
            title="Zoom out"
          >\u2212</button>
          <span style={styles.zoomLabel}>{Math.round(zoomLevel * 100)}%</span>
          <button
            onClick={() => setZoomLevel(z => Math.min(3, z + 0.25))}
            style={styles.zoomBtn}
            title="Zoom in"
          >+</button>
        </div>
      </div>

      {/* Evidence type legend */}
      <div style={styles.legend}>
        {Object.entries(EVIDENCE_COLORS).filter(([type]) => {
          return dated.some(d => d.evidence_type === type) || undated.some(d => d.evidence_type === type);
        }).map(([type, color]) => (
          <span key={type} style={styles.legendItem}>
            <span style={{ ...styles.legendDot, background: color }} />
            {type.replace(/_/g, ' ')}
          </span>
        ))}
      </div>

      {/* Main timeline */}
      <div style={styles.timelineScroll} ref={timelineRef}>
        {monthGroups.length === 0 && undated.length === 0 ? (
          <div style={styles.empty}>
            <p style={styles.emptyIcon}>{'\uD83D\uDCC5'}</p>
            <p style={styles.emptyText}>No documents yet.</p>
            <p style={styles.emptySubtext}>Drag and drop files to add evidence to the timeline.</p>
          </div>
        ) : (
          <div style={styles.timeline}>
            {/* Year markers */}
            {monthGroups.map((group, gi) => {
              const isFirstOfYear = gi === 0 || monthGroups[gi - 1].year !== group.year;
              return (
                <React.Fragment key={group.key}>
                  {isFirstOfYear && (
                    <div style={styles.yearMarker}>
                      <span style={styles.yearLabel}>{group.year}</span>
                      <div style={styles.yearLine} />
                    </div>
                  )}
                  <div style={{
                    ...styles.monthGroup,
                    minWidth: `${Math.max(140, group.docs.length * 80 * zoomLevel)}px`
                  }}>
                    <div style={styles.monthLabel}>{group.label}</div>
                    <div style={styles.monthLine} />
                    <div style={styles.docsRow}>
                      {group.docs.map((doc, di) => (
                        <button
                          key={doc.id}
                          onClick={() => handleSelect(doc)}
                          style={{
                            ...styles.docNode,
                            borderColor: EVIDENCE_COLORS[doc.evidence_type] || '#6b7280',
                            background: selectedId === doc.id
                              ? (EVIDENCE_COLORS[doc.evidence_type] || '#6b7280') + '30'
                              : '#252542',
                            transform: `scale(${zoomLevel > 1.5 ? 1 : 1})`,
                          }}
                          title={`${doc.filename}\n${formatDate(doc.document_date)}\nType: ${doc.evidence_type}`}
                        >
                          <span style={styles.docIcon}>
                            {EVIDENCE_ICONS[doc.evidence_type] || '\uD83D\uDCCE'}
                          </span>
                          <span style={styles.docName}>
                            {doc.filename.length > 20
                              ? doc.filename.slice(0, 18) + '\u2026'
                              : doc.filename}
                          </span>
                          <span style={styles.docDate}>
                            {new Date(doc.document_date).toLocaleDateString('en-US', {
                              month: 'short', day: 'numeric', timeZone: 'UTC'
                            })}
                          </span>
                          {doc.document_date_confidence !== 'exact' && (
                            <span style={{
                              ...styles.confidenceBadge,
                              background: doc.document_date_confidence === 'approximate'
                                ? '#f59e0b30' : '#ef444430',
                              color: doc.document_date_confidence === 'approximate'
                                ? '#f59e0b' : '#ef4444'
                            }}>
                              {doc.document_date_confidence === 'approximate' ? '~' : '?'}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        )}
      </div>

      {/* Undated documents tray */}
      {undated.length > 0 && (
        <div style={styles.undatedTray}>
          <div style={styles.undatedHeader}>
            <span style={styles.undatedTitle}>Undated Documents</span>
            <span style={styles.undatedCount}>{undated.length}</span>
          </div>
          <div style={styles.undatedList}>
            {undated.map(doc => (
              <button
                key={doc.id}
                onClick={() => handleSelect(doc)}
                style={{
                  ...styles.undatedItem,
                  background: selectedId === doc.id ? '#3b82f620' : 'transparent'
                }}
              >
                <span>{EVIDENCE_ICONS[doc.evidence_type] || '\uD83D\uDCCE'}</span>
                <span style={styles.undatedName}>{doc.filename}</span>
                <span style={{
                  ...styles.typeBadge,
                  background: (EVIDENCE_COLORS[doc.evidence_type] || '#6b7280') + '20',
                  color: EVIDENCE_COLORS[doc.evidence_type] || '#6b7280'
                }}>
                  {doc.evidence_type?.replace(/_/g, ' ') || 'unknown'}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Re-export for use in DocumentDetail
export { EVIDENCE_COLORS, EVIDENCE_ICONS };

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: '#1a1a2e'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 24px',
    borderBottom: '1px solid #2a2a4a'
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '12px'
  },
  title: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#f5f0eb',
    margin: 0
  },
  count: {
    fontSize: '13px',
    color: '#666'
  },
  zoomControls: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  zoomBtn: {
    width: '28px',
    height: '28px',
    borderRadius: '6px',
    border: '1px solid #333',
    background: '#252542',
    color: '#f5f0eb',
    fontSize: '16px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  zoomLabel: {
    fontSize: '12px',
    color: '#888',
    minWidth: '40px',
    textAlign: 'center'
  },
  legend: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px',
    padding: '8px 24px',
    borderBottom: '1px solid #2a2a4a'
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '11px',
    color: '#888',
    textTransform: 'capitalize'
  },
  legendDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    display: 'inline-block'
  },
  timelineScroll: {
    flex: 1,
    overflowX: 'auto',
    overflowY: 'auto',
    padding: '24px'
  },
  timeline: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0',
    minHeight: '200px',
    paddingBottom: '20px'
  },
  yearMarker: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    marginRight: '8px',
    flexShrink: 0
  },
  yearLabel: {
    fontSize: '14px',
    fontWeight: 700,
    color: '#3b82f6',
    marginBottom: '8px',
    background: '#1a1a2e',
    padding: '2px 8px',
    borderRadius: '4px',
    border: '1px solid #3b82f6'
  },
  yearLine: {
    width: '2px',
    height: '100%',
    minHeight: '180px',
    background: '#3b82f640'
  },
  monthGroup: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    flexShrink: 0,
    padding: '0 4px'
  },
  monthLabel: {
    fontSize: '11px',
    color: '#888',
    marginBottom: '8px',
    whiteSpace: 'nowrap'
  },
  monthLine: {
    width: '1px',
    height: '12px',
    background: '#444',
    marginBottom: '8px'
  },
  docsRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    alignItems: 'center'
  },
  docNode: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '2px',
    padding: '8px 10px',
    borderRadius: '8px',
    border: '2px solid',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    minWidth: '72px',
    maxWidth: '120px',
    position: 'relative'
  },
  docIcon: {
    fontSize: '18px'
  },
  docName: {
    fontSize: '10px',
    color: '#ccc',
    textAlign: 'center',
    lineHeight: 1.2,
    wordBreak: 'break-word'
  },
  docDate: {
    fontSize: '9px',
    color: '#888'
  },
  confidenceBadge: {
    position: 'absolute',
    top: '-4px',
    right: '-4px',
    width: '16px',
    height: '16px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '10px',
    fontWeight: 700
  },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '200px',
    gap: '8px'
  },
  emptyIcon: {
    fontSize: '36px',
    margin: 0
  },
  emptyText: {
    fontSize: '16px',
    color: '#888',
    margin: 0
  },
  emptySubtext: {
    fontSize: '13px',
    color: '#555',
    margin: 0
  },
  undatedTray: {
    borderTop: '1px solid #2a2a4a',
    padding: '12px 24px',
    maxHeight: '150px',
    overflowY: 'auto'
  },
  undatedHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px'
  },
  undatedTitle: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
  },
  undatedCount: {
    fontSize: '11px',
    background: '#f59e0b30',
    color: '#f59e0b',
    padding: '1px 6px',
    borderRadius: '8px'
  },
  undatedList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px'
  },
  undatedItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 10px',
    borderRadius: '6px',
    border: '1px solid #333',
    cursor: 'pointer',
    fontSize: '12px',
    color: '#ccc',
    transition: 'background 0.15s'
  },
  undatedName: {
    maxWidth: '150px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  typeBadge: {
    fontSize: '10px',
    padding: '1px 6px',
    borderRadius: '4px',
    textTransform: 'capitalize'
  }
};
