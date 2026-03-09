import React, { useState, useEffect, useMemo } from 'react';
import NotifyModal, { NotifySummary } from '../components/NotifyModal';

const PERIOD_COLORS = [
  '#f5a623', '#e8743b', '#e05c5c', '#c0392b', '#9b59b6',
  '#3498db', '#1abc9c', '#27ae60', '#2980b9', '#8e44ad',
  '#16a085', '#d35400'
];

const VIEW_MODES = [
  { key: 'all', label: 'All' },
  { key: 'moments', label: 'Moments' },
  { key: 'documents', label: 'Documents' }
];

export default function Timeline({ onSelectDocument, onSelectEvent, onDataChanged, refreshSignal }) {
  const [timelineItems, setTimelineItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [zoomLevel, setZoomLevel] = useState('month');
  const [groupedItems, setGroupedItems] = useState({});
  const [sortedKeys, setSortedKeys] = useState([]);
  const [selectedPeriod, setSelectedPeriod] = useState(null);
  const [viewMode, setViewMode] = useState('all');

  // Document metadata: linked event counts + notification actors
  const [docMeta, setDocMeta] = useState({ eventCounts: {}, notifMap: {} });

  // Notification modal state
  const [notifyDocId, setNotifyDocId] = useState(null);

  useEffect(() => {
    loadTimeline();
    const handleCaseChange = () => loadTimeline();
    window.api.on?.('case-changed', handleCaseChange);
    return () => window.api.off?.('case-changed', handleCaseChange);
  }, []);

  useEffect(() => {
    if (refreshSignal) loadTimeline();
  }, [refreshSignal]);

  // Filter items by viewMode
  const filteredItems = useMemo(() => {
    if (viewMode === 'moments') return timelineItems.filter(i => i._type === 'moment');
    if (viewMode === 'documents') return timelineItems.filter(i => i._type === 'document');
    return timelineItems;
  }, [timelineItems, viewMode]);

  useEffect(() => {
    if (filteredItems.length > 0) groupByZoom(filteredItems);
    else {
      setGroupedItems({});
      setSortedKeys([]);
      setSelectedPeriod(null);
    }
  }, [filteredItems, zoomLevel]);

  const loadTimeline = async () => {
    try {
      setLoading(true);
      const { caseId } = await window.api.cases.current();
      if (!caseId) { setTimelineItems([]); setLoading(false); return; }

      const [eventsRes, docsRes, metaRes] = await Promise.all([
        window.api.events.list(caseId),
        window.api.documents.list(caseId),
        window.api.notifications?.batchDocumentMeta()
          .catch(() => ({ success: false }))
          || Promise.resolve({ success: false })
      ]);

      const events = eventsRes.success ? eventsRes.events : [];
      const docs = docsRes.success ? docsRes.documents : [];

      if (metaRes?.success) {
        setDocMeta({
          eventCounts: metaRes.eventCounts || {},
          notifMap: metaRes.notifMap || {}
        });
      }

      const merged = [
        ...events.map(e => ({
          ...e, _type: 'moment',
          _date: e.date,
          _label: e.title || 'Untitled moment'
        })),
        ...docs.map(d => ({
          ...d, _type: 'document',
          _date: d.document_date || d.date_received || d.created_at || d.uploaded_at,
          _label: d.title || d.filename || 'Untitled document'
        }))
      ].sort((a, b) => {
        if (!a._date) return 1;
        if (!b._date) return -1;
        return new Date(a._date) - new Date(b._date);
      });

      setTimelineItems(merged);
      setLoading(false);
    } catch (err) {
      console.error('[Timeline] Load failed:', err);
      setLoading(false);
    }
  };

  const getPeriodKey = (dateStr) => {
    if (!dateStr) return 'No Date';
    const d = new Date(dateStr);
    if (isNaN(d)) return 'No Date';
    if (zoomLevel === 'year') return String(d.getFullYear());
    if (zoomLevel === 'month') return `${d.toLocaleString('default', { month: 'short' })} ${d.getFullYear()}`;
    if (zoomLevel === 'week') {
      const jan1 = new Date(d.getFullYear(), 0, 1);
      const week = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
      return `Wk ${week} ${d.getFullYear()}`;
    }
    return d.toLocaleDateString();
  };

  const groupByZoom = (items) => {
    const groups = {};
    items.forEach(item => {
      const key = getPeriodKey(item._date);
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });

    const keys = Object.keys(groups).sort((a, b) => {
      if (a === 'No Date') return 1;
      if (b === 'No Date') return -1;
      return new Date(groups[a][0]._date) - new Date(groups[b][0]._date);
    });

    setGroupedItems(groups);
    setSortedKeys(keys);
    if (!selectedPeriod || !groups[selectedPeriod]) {
      setSelectedPeriod(keys[0] || null);
    }
  };

  const handleDelete = async (item) => {
    const label = item._label;
    if (!confirm(`Delete "${label}"?\n\nCannot be undone.`)) return;
    const { caseId } = await window.api.cases.current();
    const res = item._type === 'moment'
      ? await window.api.events.delete(caseId, item.id)
      : await window.api.documents.delete(caseId, item.id);
    if (res.success) { onDataChanged?.(); loadTimeline(); }
    else alert(`Delete failed: ${res.error}`);
  };

  const handleNotified = (docId, actors) => {
    setDocMeta(prev => ({
      ...prev,
      notifMap: { ...prev.notifMap, [docId]: actors }
    }));
    setNotifyDocId(null);
  };

  if (loading) return (
    <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Loading timeline…</div>
  );

  const maxCount = Math.max(...sortedKeys.map(k => (groupedItems[k] || []).length), 1);
  const CHART_HEIGHT = 200;
  const BAR_MIN_HEIGHT = 12;
  const selectedItems = selectedPeriod ? (groupedItems[selectedPeriod] || []) : [];
  const moments = timelineItems.filter(i => i._type === 'moment').length;
  const docCount = timelineItems.filter(i => i._type === 'document').length;

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#f8f9fa', fontFamily: 'system-ui, sans-serif' }}>

      {/* HEADER */}
      <div style={{ padding: '14px 24px', borderBottom: '1px solid #e0e0e0', background: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Timeline</h2>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: '#888', whiteSpace: 'nowrap' }}>
            {timelineItems.length} items &nbsp;·&nbsp; <span style={{ color: '#e74c3c' }}>● {moments} moments</span> &nbsp;·&nbsp; <span style={{ color: '#2196f3' }}>● {docCount} documents</span>
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* View mode toggle */}
          <div style={{ display: 'flex', border: '1px solid #ddd', borderRadius: 6, overflow: 'hidden' }}>
            {VIEW_MODES.map(m => (
              <button key={m.key} onClick={() => setViewMode(m.key)} style={{
                padding: '5px 12px', border: 'none', fontSize: 12,
                background: viewMode === m.key ? '#2563EB' : '#fff',
                color: viewMode === m.key ? '#fff' : '#555',
                cursor: 'pointer', fontWeight: viewMode === m.key ? 600 : 400
              }}>{m.label}</button>
            ))}
          </div>
          {/* Zoom level */}
          <div style={{ display: 'flex', border: '1px solid #ddd', borderRadius: 6, overflow: 'hidden' }}>
            {['year', 'month', 'week', 'day'].map(level => (
              <button key={level} onClick={() => setZoomLevel(level)} style={{
                padding: '5px 12px', border: 'none', fontSize: 12,
                background: zoomLevel === level ? '#2c3e50' : '#fff',
                color: zoomLevel === level ? '#fff' : '#555',
                cursor: 'pointer', textTransform: 'capitalize', fontWeight: zoomLevel === level ? 600 : 400
              }}>{level}</button>
            ))}
          </div>
          <button onClick={() => window.dispatchEvent(new CustomEvent('add-moment'))} style={{
            padding: '6px 14px', background: '#e74c3c', color: '#fff',
            border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 500
          }}>+ Moment</button>
          <button onClick={() => window.dispatchEvent(new CustomEvent('import-files'))} style={{
            padding: '6px 14px', background: '#2c3e50', color: '#fff',
            border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 500
          }}>+ Import</button>
        </div>
      </div>

      {/* BAR CHART */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e8e8e8', flexShrink: 0 }}>
        {sortedKeys.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>
            {viewMode === 'all' ? 'No items yet' : `No ${viewMode} yet`}
          </div>
        ) : (
          <div style={{ display: 'flex', overflowX: 'auto', padding: '20px 24px 0', gap: 0, alignItems: 'flex-end' }}>

            {/* Y-axis */}
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: CHART_HEIGHT, paddingBottom: 32, marginRight: 8, flexShrink: 0 }}>
              {[maxCount, Math.ceil(maxCount * 0.66), Math.ceil(maxCount * 0.33), 0].map(v => (
                <div key={v} style={{ fontSize: 10, color: '#bbb', textAlign: 'right', lineHeight: 1 }}>{v}</div>
              ))}
            </div>

            {/* Columns */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', minWidth: 'max-content' }}>
              {sortedKeys.map((key, idx) => {
                const items = groupedItems[key] || [];
                const count = items.length;
                const barH = Math.max(BAR_MIN_HEIGHT, Math.round((count / maxCount) * (CHART_HEIGHT - 40)));
                const color = PERIOD_COLORS[idx % PERIOD_COLORS.length];
                const isSelected = key === selectedPeriod;
                const mCount = items.filter(i => i._type === 'moment').length;
                const dCount = items.filter(i => i._type === 'document').length;

                return (
                  <div
                    key={key}
                    onClick={() => setSelectedPeriod(isSelected ? null : key)}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer', width: 64 }}
                    title={`${key}: ${count} items (${mCount} moments, ${dCount} docs)`}
                  >
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#555', marginBottom: 2 }}>{count}</div>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, marginBottom: 4, boxShadow: isSelected ? `0 0 0 3px ${color}44` : 'none' }} />
                    <div style={{
                      width: 48, height: barH,
                      background: isSelected ? color : `${color}88`,
                      borderRadius: '4px 4px 0 0',
                      transition: 'all 0.15s',
                      border: isSelected ? `2px solid ${color}` : '2px solid transparent',
                      position: 'relative', overflow: 'hidden'
                    }}>
                      {Array.from({ length: Math.ceil(barH / 12) }).map((_, i) => (
                        <div key={i} style={{ position: 'absolute', left: 0, right: 0, height: 1, background: 'rgba(255,255,255,0.3)', top: i * 12 }} />
                      ))}
                    </div>
                    <div style={{
                      marginTop: 6, padding: '3px 6px', borderRadius: 4,
                      background: isSelected ? color : '#eee',
                      color: isSelected ? '#fff' : '#555',
                      fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap',
                      transition: 'all 0.15s', letterSpacing: 0.3
                    }}>
                      {key.toUpperCase()}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <div style={{ height: 12 }} />
      </div>

      {/* ITEMS PANEL */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
        {selectedPeriod && (
          <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#2c3e50' }}>{selectedPeriod}</h3>
            <span style={{ fontSize: 12, color: '#888' }}>({selectedItems.length} items)</span>
            <button onClick={() => setSelectedPeriod(null)} style={{
              marginLeft: 'auto', padding: '3px 10px', fontSize: 11,
              border: '1px solid #ddd', background: '#fff', borderRadius: 4, cursor: 'pointer', color: '#888'
            }}>Show all</button>
          </div>
        )}

        {(selectedPeriod ? selectedItems : filteredItems).map(item => {
          const isMoment = item._type === 'moment';
          const typeColor = isMoment ? '#e74c3c' : '#2196f3';
          const tags = isMoment ? (item.tags || []) : (item.evidence_type ? [item.evidence_type] : []);

          // Document-specific metadata
          const linkedEventCount = !isMoment ? (docMeta.eventCounts[item.id] || 0) : 0;
          const notifiedActors = !isMoment ? (docMeta.notifMap[item.id] || []) : [];

          return (
            <div key={`${item._type}-${item.id}`} style={{
              display: 'flex', gap: 12, padding: '10px 14px',
              background: '#fff', border: '1px solid #eee',
              borderLeft: `3px solid ${typeColor}`,
              borderRadius: 6, marginBottom: 6,
              transition: 'box-shadow 0.1s'
            }}>
              {/* Icon */}
              <div style={{
                width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                background: isMoment ? '#ffeef0' : '#e8f4fd',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14
              }}>
                {isMoment ? '\uD83D\uDD34' : '\uD83D\uDCC4'}
              </div>

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                <div style={{ fontWeight: 500, fontSize: 13, color: '#2c3e50', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item._label}
                </div>
                <div style={{ fontSize: 11, color: '#aaa', marginTop: 2, whiteSpace: 'nowrap' }}>
                  {item._date ? new Date(item._date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'No date'}
                  {!isMoment && item.file_size ? ` \u00B7 ${(item.file_size / 1024).toFixed(0)} KB` : ''}
                </div>
                {tags.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                    {tags.slice(0, 4).map(tag => (
                      <span key={tag} style={{
                        padding: '1px 6px', fontSize: 10, borderRadius: 3,
                        background: isMoment ? '#ffeef0' : '#e8f4fd',
                        color: typeColor, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.3
                      }}>{tag.replace(/_/g, ' ')}</span>
                    ))}
                  </div>
                )}

                {/* Document: linked event count */}
                {!isMoment && linkedEventCount > 0 && (
                  <div style={{ fontSize: 11, color: '#6B7280', marginTop: 4 }}>
                    {'\uD83D\uDD17'} Linked to {linkedEventCount} moment{linkedEventCount !== 1 ? 's' : ''}
                  </div>
                )}

                {/* Document: notification summary + manage button */}
                {!isMoment && (
                  <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                    {notifiedActors.length > 0 ? (
                      <>
                        <NotifySummary
                          actors={notifiedActors}
                          onClick={() => setNotifyDocId(item.id)}
                        />
                      </>
                    ) : (
                      <button
                        onClick={(e) => { e.stopPropagation(); setNotifyDocId(item.id); }}
                        style={{
                          padding: '2px 8px', fontSize: 11, borderRadius: 4,
                          background: 'transparent', color: '#9CA3AF',
                          border: '1px dashed #D1D5DB', cursor: 'pointer'
                        }}
                      >{'\u2610'} Notified employer</button>
                    )}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
                <button onClick={() => isMoment ? onSelectEvent?.(item) : onSelectDocument?.(item)} style={{
                  padding: '4px 10px', fontSize: 11, cursor: 'pointer', borderRadius: 4,
                  background: typeColor, color: '#fff', border: 'none', fontWeight: 500
                }}>
                  {isMoment ? '\u270F\uFE0F Edit' : '\uD83D\uDC41 View'}
                </button>
                <button onClick={() => handleDelete(item)} style={{
                  padding: '4px 8px', fontSize: 11, cursor: 'pointer', borderRadius: 4,
                  background: '#fff', color: '#e74c3c', border: '1px solid #ffd0d0'
                }}>{'\uD83D\uDDD1'}</button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Notify modal */}
      {notifyDocId && (
        <NotifyModal
          targetType="document"
          targetId={notifyDocId}
          onClose={() => setNotifyDocId(null)}
          onNotified={(actors) => handleNotified(notifyDocId, actors)}
        />
      )}
    </div>
  );
}
