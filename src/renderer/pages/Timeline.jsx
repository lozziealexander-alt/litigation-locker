import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import { useTheme } from '../styles/ThemeContext';
import { colors, shadows, spacing, typography, radius, getEvidenceColor } from '../styles/tokens';

// Evidence type icons
const EVIDENCE_ICONS = {
  'ADVERSE_ACTION': '\u26D4',
  'INCIDENT': '\u26A0\uFE0F',
  'PROTECTED_ACTIVITY': '\uD83D\uDEE1\uFE0F',
  'REQUEST_FOR_HELP': '\u2709\uFE0F',
  'RESPONSE': '\uD83D\uDCE8',
  'CLAIM_AGAINST_YOU': '\u2694\uFE0F',
  'CLAIM_YOU_MADE': '\uD83D\uDCDD',
  'PAY_RECORD': '\uD83D\uDCB0',
  'CONTEXT': '\uD83D\uDCC4',
  'SUPPORTING': '\u2705',
  'email': '\u2709\uFE0F',
  'screenshot': '\uD83D\uDCF8',
  'photo': '\uD83D\uDDBC\uFE0F',
  'pdf': '\uD83D\uDCC4',
  'document': '\uD83D\uDCC3',
  'performance_review': '\uD83D\uDCCA',
  'text_message': '\uD83D\uDCAC',
  'recording': '\uD83C\uDFA4',
  'video': '\uD83C\uDFA5',
  'medical': '\uD83C\uDFE5',
  'legal': '\u2696\uFE0F',
  'financial': '\uD83D\uDCB3',
  'contract': '\uD83D\uDCDD',
  'policy': '\uD83D\uDCCB',
  'other': '\uD83D\uDCC1'
};

function getEvidenceIcon(type) {
  return EVIDENCE_ICONS[type] || '\uD83D\uDCC4';
}

const ZOOM_LEVELS = ['year', 'month', 'day', 'hour'];
const ZOOM_LABELS = { year: 'Year', month: 'Month', day: 'Day', hour: 'Hour' };

export default function Timeline({ onSelectDocument }) {
  const { mode } = useTheme();
  const [dated, setDated] = useState([]);
  const [undated, setUndated] = useState([]);
  const [connections, setConnections] = useState([]);
  const [escalation, setEscalation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hoveredEvent, setHoveredEvent] = useState(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [zoomLevel, setZoomLevel] = useState('day'); // 'year' | 'month' | 'day' | 'hour'
  const [linePositions, setLinePositions] = useState([]);
  const [svgDimensions, setSvgDimensions] = useState({ width: 0, height: 0 });
  const timelineRef = useRef(null);
  const timelineInnerRef = useRef(null);
  const containerRef = useRef(null);
  const dragCounter = useRef(0);

  const styles = getStyles();

  // ---- Native DOM drag/drop handlers (bypass React delegation issues) ----
  // NOTE: depends on [loading] because on first mount `loading=true` renders a
  // different tree that does NOT have the containerRef div. Once loading flips
  // to false the real container appears and we can attach listeners.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let counter = 0;

    function onDragOver(e) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'copy';
    }

    function onDragEnter(e) {
      e.preventDefault();
      e.stopPropagation();
      counter++;
      if (counter === 1) setIsDraggingOver(true);
    }

    function onDragLeave(e) {
      e.preventDefault();
      e.stopPropagation();
      counter--;
      if (counter === 0) setIsDraggingOver(false);
    }

    function onDrop(e) {
      e.preventDefault();
      e.stopPropagation();
      counter = 0;
      setIsDraggingOver(false);

      const files = Array.from(e.dataTransfer.files);
      console.log('[Timeline] native drop, files:', files.length);
      if (files.length === 0) return;

      // Electron 22+ removed File.path when contextIsolation is on —
      // use webUtils.getPathForFile() exposed via preload
      const filePaths = files.map(f => {
        try {
          return window.api.getPathForFile(f);
        } catch (err) {
          console.warn('[Timeline] getPathForFile fallback for:', f.name, err.message);
          return f.path || '';
        }
      }).filter(Boolean);
      console.log('[Timeline] file paths:', filePaths);

      if (filePaths.length === 0) {
        console.error('[Timeline] No valid file paths from drop');
        return;
      }

      window.api.documents.ingest(filePaths).then(result => {
        console.log('[Timeline] ingest result:', JSON.stringify(result).slice(0, 300));
        if (result.success) {
          loadTimeline();
        } else {
          console.error('[Timeline] ingest failed:', result.error);
          alert('Import failed: ' + (result.error || 'Unknown error'));
        }
      }).catch(err => {
        console.error('[Timeline] ingest error:', err);
        alert('Import error: ' + err.message);
      });
    }

    el.addEventListener('dragover', onDragOver);
    el.addEventListener('dragenter', onDragEnter);
    el.addEventListener('dragleave', onDragLeave);
    el.addEventListener('drop', onDrop);

    return () => {
      el.removeEventListener('dragover', onDragOver);
      el.removeEventListener('dragenter', onDragEnter);
      el.removeEventListener('dragleave', onDragLeave);
      el.removeEventListener('drop', onDrop);
    };
  }, [loading]);

  useEffect(() => {
    loadTimeline();
  }, []);

  async function loadTimeline() {
    setLoading(true);
    try {
      const [timelineResult, connectionsResult] = await Promise.all([
        window.api.timeline.get(),
        window.api.timeline.getConnections()
      ]);

      if (timelineResult.success) {
        setDated(timelineResult.dated || []);
        setUndated(timelineResult.undated || []);
      }
      if (connectionsResult.success) {
        setConnections(connectionsResult.connections || []);
        setEscalation(connectionsResult.escalation);
      }
    } catch (err) {
      console.error('[Timeline] loadTimeline error:', err);
    }
    setLoading(false);
  }

  // ---- Semantic zoom groupings ----
  const timeline = useMemo(() => {
    if (dated.length === 0) return [];

    if (zoomLevel === 'year') {
      const groups = {};
      for (const doc of dated) {
        const d = new Date(doc.document_date);
        const key = `${d.getFullYear()}`;
        if (!groups[key]) groups[key] = { key, label: key, documents: [] };
        groups[key].documents.push(doc);
      }
      return Object.values(groups).sort((a, b) => a.key.localeCompare(b.key));
    }

    if (zoomLevel === 'month') {
      const groups = {};
      for (const doc of dated) {
        const d = new Date(doc.document_date);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        if (!groups[key]) groups[key] = { key, label, documents: [] };
        groups[key].documents.push(doc);
      }
      return Object.values(groups).sort((a, b) => a.key.localeCompare(b.key));
    }

    if (zoomLevel === 'hour') {
      const groups = {};
      for (const doc of dated) {
        const d = new Date(doc.document_date);
        const dateStr = doc.document_date?.split('T')[0] || doc.document_date;
        const hour = d.getHours();
        const key = `${dateStr}-${String(hour).padStart(2, '0')}`;
        if (!groups[key]) {
          const hourLabel = hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`;
          groups[key] = {
            key,
            label: `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${hourLabel}`,
            dayNum: d.toLocaleDateString('en-US', { day: 'numeric' }),
            monthYear: `${d.toLocaleDateString('en-US', { month: 'short' })} ${hourLabel}`,
            documents: []
          };
        }
        groups[key].documents.push(doc);
      }
      return Object.values(groups).sort((a, b) => a.key.localeCompare(b.key));
    }

    // day level (default)
    const groups = {};
    for (const doc of dated) {
      const dateKey = doc.document_date?.split('T')[0] || doc.document_date;
      if (!groups[dateKey]) {
        const d = new Date(dateKey + 'T12:00:00');
        groups[dateKey] = {
          key: dateKey,
          label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
          dayNum: d.toLocaleDateString('en-US', { day: 'numeric' }),
          monthYear: d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
          documents: []
        };
      }
      groups[dateKey].documents.push(doc);
    }
    return Object.values(groups).sort((a, b) => a.key.localeCompare(b.key));
  }, [dated, zoomLevel]);

  // Active evidence types for legend
  const activeTypes = useMemo(() => {
    const types = new Set();
    for (const doc of dated) {
      if (doc.evidence_type) types.add(doc.evidence_type);
    }
    for (const doc of undated) {
      if (doc.evidence_type) types.add(doc.evidence_type);
    }
    return Array.from(types).sort();
  }, [dated, undated]);

  // ---- Connection line positions (computed from DOM after render) ----
  useLayoutEffect(() => {
    if (!timelineInnerRef.current || connections.length === 0 || zoomLevel === 'year') {
      setLinePositions([]);
      return;
    }
    const timer = setTimeout(() => {
      const inner = timelineInnerRef.current;
      if (!inner) return;
      // Use the timeline div's own rect — SVG is position:absolute inside it
      const innerRect = inner.getBoundingClientRect();
      const lines = [];
      for (const conn of connections) {
        const sourceEl = inner.querySelector(`[data-event-id="${conn.sourceId}"]`);
        const targetEl = inner.querySelector(`[data-event-id="${conn.targetId}"]`);
        if (!sourceEl || !targetEl) continue;
        const sourceRect = sourceEl.getBoundingClientRect();
        const targetRect = targetEl.getBoundingClientRect();
        // Coordinates relative to the timeline div (same parent as SVG)
        const x1 = sourceRect.left + sourceRect.width / 2 - innerRect.left;
        const y1 = sourceRect.bottom - innerRect.top;
        const x2 = targetRect.left + targetRect.width / 2 - innerRect.left;
        const y2 = targetRect.top - innerRect.top;
        let lineColor = colors.connectionCluster;
        let dashed = false;
        if (conn.connectionType === 'retaliation_chain') {
          lineColor = colors.connectionRetaliation;
        } else if (conn.connectionType === 'escalation') {
          lineColor = colors.connectionEscalation;
        } else if (conn.connectionType === 'temporal_cluster') {
          lineColor = colors.connectionCluster;
          dashed = true;
        }
        lines.push({ x1, y1, x2, y2, color: lineColor, dashed, key: `${conn.sourceId}-${conn.targetId}-${conn.connectionType}` });
      }
      setSvgDimensions({ width: inner.scrollWidth, height: inner.scrollHeight });
      setLinePositions(lines.length > 0 ? lines : []);
    }, 50);
    return () => clearTimeout(timer);
  }, [connections, timeline, zoomLevel]);

  // Zoom controls
  function zoomIn() {
    const idx = ZOOM_LEVELS.indexOf(zoomLevel);
    if (idx < ZOOM_LEVELS.length - 1) setZoomLevel(ZOOM_LEVELS[idx + 1]);
  }
  function zoomOut() {
    const idx = ZOOM_LEVELS.indexOf(zoomLevel);
    if (idx > 0) setZoomLevel(ZOOM_LEVELS[idx - 1]);
  }

  async function handleImportFiles() {
    try {
      console.log('[Timeline] handleImportFiles called');
      const result = await window.api.dialog.openFiles();
      console.log('[Timeline] dialog result:', JSON.stringify(result).slice(0, 300));
      if (result.canceled || result.filePaths.length === 0) return;
      const ingestResult = await window.api.documents.ingest(result.filePaths);
      console.log('[Timeline] ingest result:', JSON.stringify(ingestResult).slice(0, 300));
      if (ingestResult.success) {
        loadTimeline();
      } else {
        console.error('[Timeline] import failed:', ingestResult.error);
        alert('Import failed: ' + (ingestResult.error || 'Unknown error'));
      }
    } catch (err) {
      console.error('[Timeline] handleImportFiles error:', err);
      alert('Import error: ' + err.message);
    }
  }

  function getEventConnections(eventId) {
    return connections.filter(c =>
      c.sourceId === eventId || c.targetId === eventId
    );
  }

  // Date range info
  const allDates = dated.map(d => new Date(d.document_date));
  const minDate = allDates.length ? new Date(Math.min(...allDates)) : new Date();
  const maxDate = allDates.length ? new Date(Math.max(...allDates)) : new Date();
  const spanDays = Math.ceil((maxDate - minDate) / (1000 * 60 * 60 * 24)) || 1;

  const dateRangeText = allDates.length > 0
    ? `${minDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} \u2014 ${maxDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
    : 'No documents yet';

  const totalDocs = dated.length + undated.length;
  const canZoomIn = ZOOM_LEVELS.indexOf(zoomLevel) < ZOOM_LEVELS.length - 1;
  const canZoomOut = ZOOM_LEVELS.indexOf(zoomLevel) > 0;

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.loadingSpinner} />
        <span style={styles.loadingText}>Loading timeline...</span>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        ...styles.container,
        ...(isDraggingOver ? styles.containerDragOver : {})
      }}
    >
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <h1 style={styles.title}>Timeline</h1>
          <span style={styles.dateRange}>{dateRangeText}</span>
          {spanDays > 1 && (
            <span style={styles.spanBadge}>{spanDays} days</span>
          )}
        </div>

        <div style={styles.headerRight}>
          {escalation?.hasEscalation && (
            <div style={styles.escalationBadge}>
              <span style={styles.escalationIcon}>{'\u2197'}</span>
              Escalating Pattern
            </div>
          )}

          {/* Semantic zoom controls */}
          {timeline.length > 0 && (
            <div style={styles.zoomControls}>
              <button
                style={{
                  ...styles.zoomButton,
                  ...(canZoomOut ? {} : styles.zoomButtonDisabled)
                }}
                onClick={zoomOut}
                disabled={!canZoomOut}
                title="Zoom out"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M3 7H11" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
              <span style={styles.zoomLabel}>
                {ZOOM_LABELS[zoomLevel]}
              </span>
              <button
                style={{
                  ...styles.zoomButton,
                  ...(canZoomIn ? {} : styles.zoomButtonDisabled)
                }}
                onClick={zoomIn}
                disabled={!canZoomIn}
                title="Zoom in"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M7 3V11M3 7H11" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
          )}

          <button style={styles.importButton} onClick={handleImportFiles}>
            + Import Files
          </button>
          <span style={styles.docCount}>
            {totalDocs} document{totalDocs !== 1 ? 's' : ''}
            {undated.length > 0 && ` \u00B7 ${undated.length} undated`}
          </span>
        </div>
      </div>

      {/* Evidence type legend */}
      {activeTypes.length > 0 && (
        <div style={styles.legend}>
          {activeTypes.map(type => (
            <div key={type} style={styles.legendItem}>
              <span style={{
                ...styles.legendDot,
                background: getEvidenceColor(type)
              }} />
              <span style={styles.legendIcon}>{getEvidenceIcon(type)}</span>
              <span style={styles.legendLabel}>{formatEvidenceType(type)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {timeline.length === 0 && undated.length === 0 && (
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}>{'\uD83D\uDCC4'}</div>
          <h2 style={styles.emptyTitle}>Add evidence to begin</h2>
          <p style={styles.emptyText}>
            Drag files here or use the import button
          </p>
          <button style={styles.importButtonLarge} onClick={handleImportFiles}>
            + Import Files
          </button>
          <div style={styles.emptyHints}>
            <span style={styles.emptyHint}>{'\u2709\uFE0F'} .eml emails</span>
            <span style={styles.emptyHint}>{'\uD83D\uDCC4'} PDFs</span>
            <span style={styles.emptyHint}>{'\uD83D\uDCF8'} Screenshots</span>
            <span style={styles.emptyHint}>{'\uD83D\uDDBC\uFE0F'} Photos</span>
          </div>
        </div>
      )}

      {/* Timeline visualization */}
      {timeline.length > 0 && (
        <div style={styles.timelineWrapper} ref={timelineRef}>
          <div style={styles.timeline} ref={timelineInnerRef}>
            {/* Connection lines SVG overlay — inside scrollable content */}
            {linePositions.length > 0 && (
              <svg style={styles.connectionsLayer} width={svgDimensions.width || '100%'} height={svgDimensions.height || '100%'}>
                <defs>
                  <marker id="arrowRed" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                    <polygon points="0,0 8,3 0,6" fill={colors.connectionRetaliation} opacity="0.6" />
                  </marker>
                  <marker id="arrowOrange" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                    <polygon points="0,0 8,3 0,6" fill={colors.connectionEscalation} opacity="0.6" />
                  </marker>
                  <marker id="arrowBlue" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                    <polygon points="0,0 8,3 0,6" fill={colors.connectionCluster} opacity="0.6" />
                  </marker>
                </defs>
                {linePositions.map(line => {
                  const markerId = line.color === colors.connectionRetaliation ? 'arrowRed'
                    : line.color === colors.connectionEscalation ? 'arrowOrange'
                    : 'arrowBlue';
                  return (
                    <line
                      key={line.key}
                      x1={line.x1} y1={line.y1}
                      x2={line.x2} y2={line.y2}
                      stroke={line.color}
                      strokeWidth="2.5"
                      strokeDasharray={line.dashed ? '6,4' : undefined}
                      opacity="0.7"
                      markerEnd={`url(#${markerId})`}
                    />
                  );
                })}
              </svg>
            )}
            {timeline.map(group => (
              <div key={group.key} style={{
                ...styles.dateColumn,
                ...(zoomLevel === 'year' ? styles.dateColumnWide : {}),
                ...(zoomLevel === 'month' ? styles.dateColumnMedium : {})
              }}>
                {/* Column header */}
                <div style={{
                  ...styles.dateHeader,
                  ...(zoomLevel !== 'day' && zoomLevel !== 'hour' ? styles.dateHeaderCompact : {})
                }}>
                  {zoomLevel === 'day' || zoomLevel === 'hour' ? (
                    <>
                      <span style={styles.dateDay}>{group.dayNum}</span>
                      <span style={styles.dateMonth}>{group.monthYear}</span>
                    </>
                  ) : (
                    <>
                      <span style={styles.groupLabel}>{group.label}</span>
                      <span style={styles.groupCount}>
                        {group.documents.length} doc{group.documents.length !== 1 ? 's' : ''}
                      </span>
                    </>
                  )}
                </div>

                {/* Events */}
                <div style={styles.eventsColumn}>
                  {zoomLevel === 'year' ? (
                    // Year view: compact summary cards grouped by type
                    <YearSummary
                      documents={group.documents}
                      onSelectDocument={onSelectDocument}
                      styles={styles}
                    />
                  ) : zoomLevel === 'month' ? (
                    // Month view: condensed cards
                    group.documents.map(doc => (
                      <div
                        key={doc.id}
                        style={{
                          ...styles.eventCardCompact,
                          borderLeftColor: getEvidenceColor(doc.evidence_type)
                        }}
                        onClick={() => onSelectDocument && onSelectDocument(doc)}
                      >
                        <span style={styles.eventIcon}>{getEvidenceIcon(doc.evidence_type)}</span>
                        <span style={styles.compactTitle}>{doc.filename}</span>
                        <span style={styles.compactDate}>
                          {new Date(doc.document_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                    ))
                  ) : (
                    // Day/Hour view: full cards
                    group.documents.map(doc => {
                      const eventConnections = getEventConnections(doc.id);
                      const retaliationConn = eventConnections.find(c => c.connectionType === 'retaliation_chain');

                      return (
                        <div
                          key={doc.id}
                          data-event-id={doc.id}
                          style={{
                            ...styles.eventCard,
                            borderLeftColor: getEvidenceColor(doc.evidence_type),
                            ...(hoveredEvent === doc.id ? styles.eventCardHover : {})
                          }}
                          onClick={() => onSelectDocument && onSelectDocument(doc)}
                          onMouseEnter={() => setHoveredEvent(doc.id)}
                          onMouseLeave={() => setHoveredEvent(null)}
                        >
                          {retaliationConn && (
                            <div style={styles.retaliationBadge}>
                              {'\u26A1'} {retaliationConn.daysBetween} days after protected activity
                            </div>
                          )}

                          <div style={{
                            ...styles.eventType,
                            color: getEvidenceColor(doc.evidence_type)
                          }}>
                            <span style={styles.eventIcon}>{getEvidenceIcon(doc.evidence_type)}</span>
                            {formatEvidenceType(doc.evidence_type)}
                          </div>

                          <div style={styles.eventTitle}>{doc.filename}</div>

                          <div style={styles.eventMeta}>
                            {doc.file_type && (
                              <span style={styles.fileTypeBadge}>
                                {doc.file_type.replace('application/', '').replace('image/', '')}
                              </span>
                            )}
                            <span style={styles.confidenceBadge}>
                              {doc.document_date_confidence}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
                onClick={() => onSelectDocument && onSelectDocument(doc)}
                style={styles.undatedItem}
              >
                <span style={styles.undatedIcon}>{getEvidenceIcon(doc.evidence_type)}</span>
                <span style={{
                  ...styles.undatedDot,
                  background: getEvidenceColor(doc.evidence_type)
                }} />
                <span style={styles.undatedName}>{doc.filename}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Drag overlay */}
      {isDraggingOver && (
        <div style={styles.dragOverlay}>
          <div style={styles.dragContent}>
            <span style={styles.dragIcon}>{'\uD83D\uDCE5'}</span>
            <span style={styles.dragText}>Drop to add evidence</span>
          </div>
        </div>
      )}
    </div>
  );
}

// Year view: group documents by evidence type and show summary
function YearSummary({ documents, onSelectDocument, styles }) {
  const byType = {};
  for (const doc of documents) {
    const t = doc.evidence_type || 'CONTEXT';
    if (!byType[t]) byType[t] = [];
    byType[t].push(doc);
  }

  return Object.entries(byType).sort(([a], [b]) => a.localeCompare(b)).map(([type, docs]) => (
    <div key={type} style={styles.yearTypeGroup}>
      <div style={{
        ...styles.yearTypeHeader,
        color: getEvidenceColor(type)
      }}>
        <span>{getEvidenceIcon(type)}</span>
        <span>{formatEvidenceType(type)}</span>
        <span style={styles.yearTypeCount}>{docs.length}</span>
      </div>
      {docs.map(doc => (
        <div
          key={doc.id}
          style={styles.yearDocRow}
          onClick={() => onSelectDocument && onSelectDocument(doc)}
        >
          <span style={styles.yearDocName}>{doc.filename}</span>
          <span style={styles.yearDocDate}>
            {new Date(doc.document_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        </div>
      ))}
    </div>
  ));
}

function formatEvidenceType(type) {
  const labels = {
    'ADVERSE_ACTION': 'Adverse Action',
    'INCIDENT': 'Incident',
    'PROTECTED_ACTIVITY': 'Protected Activity',
    'REQUEST_FOR_HELP': 'Request for Help',
    'RESPONSE': 'Response',
    'CLAIM_AGAINST_YOU': 'Claim Against You',
    'CLAIM_YOU_MADE': 'Your Claim',
    'PAY_RECORD': 'Pay Record',
    'CONTEXT': 'Context',
    'SUPPORTING': 'Supporting'
  };
  return labels[type] || type?.replace(/_/g, ' ') || 'Document';
}

function getStyles() {
  return {
    container: {
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: colors.bg,
      position: 'relative',
      transition: 'background 0.2s ease'
    },
    containerDragOver: {
      background: colors.surfaceAlt
    },

    // Loading
    loadingContainer: {
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.md,
      background: colors.bg
    },
    loadingSpinner: {
      width: '32px',
      height: '32px',
      border: `3px solid ${colors.border}`,
      borderTopColor: colors.primary,
      borderRadius: '50%',
      animation: 'spin 1s linear infinite'
    },
    loadingText: {
      color: colors.textMuted,
      fontSize: typography.fontSize.base
    },

    // Header
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: `${spacing.lg} ${spacing.xl}`,
      borderBottom: `1px solid ${colors.border}`,
      background: colors.surface
    },
    headerLeft: {
      display: 'flex',
      alignItems: 'center',
      gap: spacing.md
    },
    headerRight: {
      display: 'flex',
      alignItems: 'center',
      gap: spacing.md
    },
    title: {
      fontSize: typography.fontSize.xl,
      fontWeight: typography.fontWeight.semibold,
      color: colors.textPrimary,
      margin: 0
    },
    dateRange: {
      fontSize: typography.fontSize.sm,
      color: colors.textMuted,
      fontFamily: typography.fontFamilyMono
    },
    spanBadge: {
      fontSize: typography.fontSize.xs,
      color: colors.textSecondary,
      background: colors.surfaceAlt,
      padding: `${spacing.xs} ${spacing.sm}`,
      borderRadius: radius.full
    },
    docCount: {
      fontSize: typography.fontSize.sm,
      color: colors.textMuted
    },
    importButton: {
      padding: `${spacing.sm} ${spacing.md}`,
      background: colors.primary,
      color: colors.textInverse,
      border: 'none',
      borderRadius: radius.md,
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.medium,
      cursor: 'pointer',
      transition: 'background 0.15s ease'
    },
    importButtonLarge: {
      padding: `${spacing.md} ${spacing.xl}`,
      background: colors.primary,
      color: colors.textInverse,
      border: 'none',
      borderRadius: radius.md,
      fontSize: typography.fontSize.base,
      fontWeight: typography.fontWeight.semibold,
      cursor: 'pointer',
      marginBottom: spacing.lg,
      transition: 'background 0.15s ease'
    },
    escalationBadge: {
      display: 'flex',
      alignItems: 'center',
      gap: spacing.xs,
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.medium,
      color: colors.adverseAction,
      background: colors.escalationBg,
      padding: `${spacing.xs} ${spacing.sm}`,
      borderRadius: radius.full
    },
    escalationIcon: {
      fontSize: typography.fontSize.base
    },

    // Zoom controls
    zoomControls: {
      display: 'flex',
      alignItems: 'center',
      gap: '2px',
      background: colors.surfaceAlt,
      borderRadius: radius.md,
      border: `1px solid ${colors.border}`,
      padding: '2px'
    },
    zoomButton: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '28px',
      height: '28px',
      background: 'none',
      border: 'none',
      borderRadius: radius.sm,
      color: colors.textSecondary,
      cursor: 'pointer',
      transition: 'background 0.1s ease'
    },
    zoomButtonDisabled: {
      opacity: 0.3,
      cursor: 'default'
    },
    zoomLabel: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: '52px',
      height: '28px',
      color: colors.textPrimary,
      fontSize: typography.fontSize.xs,
      fontWeight: typography.fontWeight.semibold,
      letterSpacing: '0.5px',
      textTransform: 'uppercase',
      padding: `0 ${spacing.xs}`
    },

    // Legend
    legend: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: spacing.md,
      padding: `${spacing.sm} ${spacing.xl}`,
      borderBottom: `1px solid ${colors.border}`,
      background: colors.surface
    },
    legendItem: {
      display: 'flex',
      alignItems: 'center',
      gap: spacing.xs,
      fontSize: typography.fontSize.xs,
      color: colors.textSecondary
    },
    legendDot: {
      width: '8px',
      height: '8px',
      borderRadius: '50%',
      flexShrink: 0
    },
    legendIcon: {
      fontSize: '12px',
      lineHeight: 1
    },
    legendLabel: {
      whiteSpace: 'nowrap'
    },

    // Empty state
    emptyState: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.xl,
      textAlign: 'center'
    },
    emptyIcon: {
      fontSize: '64px',
      marginBottom: spacing.lg,
      opacity: 0.5
    },
    emptyTitle: {
      fontSize: typography.fontSize.lg,
      fontWeight: typography.fontWeight.semibold,
      color: colors.textPrimary,
      margin: `0 0 ${spacing.sm} 0`
    },
    emptyText: {
      fontSize: typography.fontSize.base,
      color: colors.textMuted,
      margin: `0 0 ${spacing.lg} 0`
    },
    emptyHints: {
      display: 'flex',
      gap: spacing.md,
      flexWrap: 'wrap',
      justifyContent: 'center'
    },
    emptyHint: {
      fontSize: typography.fontSize.sm,
      color: colors.textMuted,
      background: colors.surface,
      padding: `${spacing.sm} ${spacing.md}`,
      borderRadius: radius.md,
      border: `1px solid ${colors.border}`
    },

    // Timeline
    timelineWrapper: {
      flex: 1,
      overflow: 'auto',
      padding: spacing.xl,
      position: 'relative'
    },
    connectionsLayer: {
      position: 'absolute',
      top: 0,
      left: 0,
      pointerEvents: 'none',
      zIndex: 10
    },
    timeline: {
      display: 'flex',
      gap: spacing.lg,
      minHeight: '100%',
      position: 'relative'
    },
    dateColumn: {
      minWidth: '180px',
      display: 'flex',
      flexDirection: 'column',
      gap: spacing.md,
      transition: 'min-width 0.2s ease'
    },
    dateColumnWide: {
      minWidth: '260px'
    },
    dateColumnMedium: {
      minWidth: '200px'
    },
    dateHeader: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: spacing.sm,
      background: colors.surface,
      borderRadius: radius.md,
      border: `1px solid ${colors.border}`,
      boxShadow: shadows.sm
    },
    dateHeaderCompact: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      padding: `${spacing.sm} ${spacing.md}`
    },
    dateDay: {
      fontSize: typography.fontSize.xl,
      fontWeight: typography.fontWeight.bold,
      color: colors.textPrimary,
      lineHeight: 1
    },
    dateMonth: {
      fontSize: typography.fontSize.xs,
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: '0.5px'
    },
    groupLabel: {
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.semibold,
      color: colors.textPrimary
    },
    groupCount: {
      fontSize: typography.fontSize.xs,
      color: colors.textMuted,
      background: colors.surfaceAlt,
      padding: `2px ${spacing.sm}`,
      borderRadius: radius.full
    },
    eventsColumn: {
      display: 'flex',
      flexDirection: 'column',
      gap: spacing.sm
    },

    // Day view: full event card
    eventCard: {
      background: colors.surface,
      borderRadius: radius.md,
      padding: spacing.md,
      borderLeft: `4px solid ${colors.context}`,
      boxShadow: shadows.sm,
      cursor: 'pointer',
      transition: 'all 0.15s ease',
      position: 'relative'
    },
    eventCardHover: {
      boxShadow: shadows.md,
      transform: 'translateY(-2px)'
    },
    retaliationBadge: {
      position: 'absolute',
      top: `-${spacing.sm}`,
      left: spacing.md,
      fontSize: typography.fontSize.xs,
      fontWeight: typography.fontWeight.semibold,
      color: colors.textInverse,
      background: colors.retaliationBg,
      padding: `2px ${spacing.sm}`,
      borderRadius: radius.sm,
      whiteSpace: 'nowrap'
    },
    eventType: {
      fontSize: typography.fontSize.xs,
      fontWeight: typography.fontWeight.semibold,
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      marginBottom: spacing.xs,
      display: 'flex',
      alignItems: 'center',
      gap: spacing.xs
    },
    eventIcon: {
      fontSize: '13px',
      lineHeight: 1
    },
    eventTitle: {
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.medium,
      color: colors.textPrimary,
      marginBottom: spacing.xs,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    },
    eventMeta: {
      display: 'flex',
      gap: spacing.sm
    },
    fileTypeBadge: {
      fontSize: typography.fontSize.xs,
      color: colors.textMuted,
      background: colors.surfaceAlt,
      padding: `2px ${spacing.xs}`,
      borderRadius: radius.sm,
      fontFamily: typography.fontFamilyMono,
      textTransform: 'lowercase'
    },
    confidenceBadge: {
      fontSize: typography.fontSize.xs,
      color: colors.textMuted,
      background: colors.surfaceAlt,
      padding: `2px ${spacing.xs}`,
      borderRadius: radius.sm
    },

    // Month view: compact event card
    eventCardCompact: {
      display: 'flex',
      alignItems: 'center',
      gap: spacing.sm,
      background: colors.surface,
      borderRadius: radius.sm,
      padding: `${spacing.sm} ${spacing.md}`,
      borderLeft: `3px solid ${colors.context}`,
      boxShadow: shadows.sm,
      cursor: 'pointer',
      transition: 'box-shadow 0.15s ease'
    },
    compactTitle: {
      flex: 1,
      fontSize: typography.fontSize.sm,
      color: colors.textPrimary,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    },
    compactDate: {
      fontSize: typography.fontSize.xs,
      color: colors.textMuted,
      fontFamily: typography.fontFamilyMono,
      whiteSpace: 'nowrap'
    },

    // Year view: type groups
    yearTypeGroup: {
      background: colors.surface,
      borderRadius: radius.md,
      padding: spacing.sm,
      boxShadow: shadows.sm,
      marginBottom: spacing.xs
    },
    yearTypeHeader: {
      display: 'flex',
      alignItems: 'center',
      gap: spacing.xs,
      fontSize: typography.fontSize.xs,
      fontWeight: typography.fontWeight.semibold,
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      marginBottom: spacing.xs,
      padding: `0 ${spacing.xs}`
    },
    yearTypeCount: {
      marginLeft: 'auto',
      background: colors.surfaceAlt,
      color: colors.textMuted,
      padding: `1px ${spacing.sm}`,
      borderRadius: radius.full,
      fontSize: typography.fontSize.xs
    },
    yearDocRow: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: `${spacing.xs} ${spacing.sm}`,
      borderRadius: radius.sm,
      cursor: 'pointer',
      transition: 'background 0.1s ease'
    },
    yearDocName: {
      fontSize: typography.fontSize.xs,
      color: colors.textSecondary,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      flex: 1,
      marginRight: spacing.sm
    },
    yearDocDate: {
      fontSize: typography.fontSize.xs,
      color: colors.textMuted,
      fontFamily: typography.fontFamilyMono,
      whiteSpace: 'nowrap'
    },

    // Undated tray
    undatedTray: {
      borderTop: `1px solid ${colors.border}`,
      padding: `${spacing.md} ${spacing.xl}`,
      background: colors.surfaceAlt,
      maxHeight: '140px',
      overflowY: 'auto'
    },
    undatedHeader: {
      display: 'flex',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.sm
    },
    undatedTitle: {
      fontSize: typography.fontSize.xs,
      fontWeight: typography.fontWeight.semibold,
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: '0.5px'
    },
    undatedCount: {
      fontSize: typography.fontSize.xs,
      background: colors.warning + '20',
      color: colors.warning,
      padding: `1px 6px`,
      borderRadius: radius.full
    },
    undatedList: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: spacing.sm
    },
    undatedItem: {
      display: 'flex',
      alignItems: 'center',
      gap: spacing.sm,
      padding: `${spacing.xs} ${spacing.md}`,
      borderRadius: radius.md,
      border: `1px solid ${colors.border}`,
      background: colors.surface,
      cursor: 'pointer',
      fontSize: typography.fontSize.sm,
      color: colors.textPrimary,
      transition: 'box-shadow 0.15s ease'
    },
    undatedIcon: {
      fontSize: '13px',
      lineHeight: 1
    },
    undatedDot: {
      width: '8px',
      height: '8px',
      borderRadius: '50%',
      flexShrink: 0
    },
    undatedName: {
      maxWidth: '150px',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    },

    // Drag overlay
    dragOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(37, 99, 235, 0.1)',
      border: `3px dashed ${colors.primary}`,
      borderRadius: radius.lg,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
      pointerEvents: 'none'
    },
    dragContent: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: spacing.md
    },
    dragIcon: {
      fontSize: '48px'
    },
    dragText: {
      fontSize: typography.fontSize.lg,
      fontWeight: typography.fontWeight.semibold,
      color: colors.primary
    }
  };
}

const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;
document.head.appendChild(styleSheet);
