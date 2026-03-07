import React, { useState, useEffect, useRef, useCallback } from 'react';
import { colors, shadows, spacing, typography, radius, getEvidenceColor, getSeverityColor } from '../styles/tokens';

const ANCHOR_COLORS = {
  'START': '#3B82F6',
  'REPORTED': '#8B5CF6',
  'HELP': '#F97316',
  'ADVERSE_ACTION': '#DC2626',
  'MILESTONE': '#6B7280',
  'END': '#1F2937'
};

const ANCHOR_ICONS = {
  'START': '\u{1F680}',
  'REPORTED': '\u{1F4E2}',
  'HELP': '\u{1F198}',
  'ADVERSE_ACTION': '\u26A0\uFE0F',
  'MILESTONE': '\u{1F4CC}',
  'END': '\u{1F3C1}'
};

const ANCHOR_TYPES = ['START', 'REPORTED', 'HELP', 'ADVERSE_ACTION', 'MILESTONE', 'END'];

const PRECEDENT_CATALOG = [
  { id: 'burlington_northern', name: 'Burlington Northern v. White', shortName: 'Burlington Northern' },
  { id: 'harris', name: 'Harris v. Forklift Systems', shortName: 'Harris' },
  { id: 'vance', name: 'Vance v. Ball State', shortName: 'Vance' },
  { id: 'morgan', name: 'National Railroad v. Morgan', shortName: 'Morgan' },
  { id: 'faragher', name: 'Faragher/Ellerth', shortName: 'Faragher' },
  { id: 'harper_fcra', name: 'Harper v. Blockbuster', shortName: 'Harper' },
  { id: 'joshua_filing', name: 'Joshua Filing', shortName: 'Joshua' },
  { id: 'lewis_mosaic', name: 'Lewis Mosaic', shortName: 'Lewis' },
  { id: 'monaghan_retaliation', name: 'Monaghan Retaliation', shortName: 'Monaghan' },
  { id: 'thomas_proximity', name: 'Thomas Proximity', shortName: 'Thomas' },
  { id: 'sierminski_whistleblower', name: 'Sierminski Whistleblower', shortName: 'Sierminski' },
  { id: 'gessner_actual_violation', name: 'Gessner Actual Violation', shortName: 'Gessner' },
  { id: 'muldrow_some_harm', name: 'Muldrow v. St. Louis', shortName: 'Muldrow' }
];

export default function Anchors({ caseId }) {
  const [anchors, setAnchors] = useState([]);
  const [context, setContext] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedAnchor, setExpandedAnchor] = useState(null);
  const [expandedData, setExpandedData] = useState(null);
  const [editingContext, setEditingContext] = useState(false);
  const [contextDraft, setContextDraft] = useState('');
  const [hireDateDraft, setHireDateDraft] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newAnchor, setNewAnchor] = useState({ title: '', type: 'MILESTONE', date: '' });
  const [dragState, setDragState] = useState({ dragging: null, over: null });
  const [actorToast, setActorToast] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [incidents, setIncidents] = useState([]);

  useEffect(() => {
    loadData();
  }, [caseId]);

  async function loadData() {
    setLoading(true);
    try {
      const [anchorsResult, contextResult, docsResult, incidentsResult] = await Promise.all([
        window.api.anchors.list(caseId).catch(() => ({ success: false })),
        window.api.context.get(caseId).catch(() => ({ success: false })),
        window.api.documents.list().catch(() => ({ success: false })),
        window.api.incidents.list().catch(() => ({ success: false }))
      ]);

      if (anchorsResult.success) setAnchors(anchorsResult.anchors);
      if (contextResult.success) {
        setContext(contextResult.context);
        setContextDraft(contextResult.context?.narrative || '');
        setHireDateDraft(contextResult.context?.hire_date || '');
      }
      if (docsResult.success) setDocuments(docsResult.documents || []);
      if (incidentsResult.success) setIncidents(incidentsResult.incidents || []);
    } catch (err) {
      console.error('[Anchors] loadData error:', err);
    }
    setLoading(false);
  }

  async function handleRescan() {
    try {
      const result = await window.api.anchors.generate(caseId);
      if (result?.success) {
        if (result.actorsFound > 0) {
          setActorToast({
            count: result.actorsFound,
            actors: result.actors || []
          });
          setTimeout(() => setActorToast(null), 6000);
        }
        if (result.skipped) {
          console.log('No anchors generated — narrative may be empty');
        }
        await loadData();
      } else {
        console.error('Rescan failed:', result?.error);
      }
    } catch (err) {
      console.error('Rescan error:', err);
    }
  }

  async function handleSaveContext() {
    try {
      const saveResult = await window.api.context.update(caseId, {
        narrative: contextDraft,
        hireDate: hireDateDraft
      });

      if (!saveResult?.success) {
        alert('Failed to save: ' + (saveResult?.error || 'Unknown error'));
        return;
      }

      setEditingContext(false);

      // Scan for anchors if there's enough text
      if (contextDraft.trim().length > 10) {
        const result = await window.api.anchors.generate(caseId);
        if (!result?.success) {
          alert('Anchor scan failed: ' + (result?.error || 'Unknown error'));
        } else if (result.skipped) {
          alert('No anchors could be generated from this text. Try adding more detail about specific events.');
        } else {
          // Show count temporarily
          if (result.actorsFound > 0) {
            setActorToast({ count: result.actorsFound, actors: result.actors || [] });
            setTimeout(() => setActorToast(null), 6000);
          }
        }
      }

      // Reload data but preserve the draft values
      const savedNarrative = contextDraft;
      const savedHireDate = hireDateDraft;
      await loadData();
      setContextDraft(savedNarrative);
      setHireDateDraft(savedHireDate);
    } catch (err) {
      alert('Error saving: ' + err.message);
    }
  }

  async function handleExpandAnchor(anchor) {
    if (expandedAnchor === anchor.id) {
      setExpandedAnchor(null);
      setExpandedData(null);
      return;
    }
    setExpandedAnchor(anchor.id);
    const result = await window.api.anchors.getRelatedEvidence(caseId, anchor.id);
    if (result.success) setExpandedData(result);
  }

  async function handleUpdateAnchor(anchorId, updates) {
    await window.api.anchors.update(caseId, anchorId, updates);
    // Refresh expanded data
    if (expandedAnchor === anchorId) {
      const result = await window.api.anchors.getRelatedEvidence(caseId, anchorId);
      if (result.success) setExpandedData(result);
    }
    loadData();
  }

  async function handleAddAnchor() {
    if (!newAnchor.title.trim()) return;
    await window.api.anchors.create(caseId, {
      title: newAnchor.title.trim(),
      type: newAnchor.type,
      date: newAnchor.date || null
    });
    setNewAnchor({ title: '', type: 'MILESTONE', date: '' });
    setShowAddForm(false);
    loadData();
  }

  async function handleClone(anchorId) {
    await window.api.anchors.clone(caseId, anchorId);
    loadData();
  }

  async function handleBreakApart(anchorId) {
    const result = await window.api.anchors.breakApart(caseId, anchorId);
    if (result.success) {
      setExpandedAnchor(null);
      setExpandedData(null);
      loadData();
    }
  }

  async function handleDeleteAnchor(anchorId) {
    await window.api.anchors.delete(caseId, anchorId);
    setExpandedAnchor(null);
    setExpandedData(null);
    loadData();
  }

  async function handleLinkEvidence(anchorId, docId) {
    await window.api.anchors.linkEvidence(caseId, anchorId, docId);
    const result = await window.api.anchors.getRelatedEvidence(caseId, anchorId);
    if (result.success) setExpandedData(result);
    loadData();
  }

  async function handleUnlinkEvidence(anchorId, docId) {
    await window.api.anchors.unlinkEvidence(caseId, anchorId, docId);
    const result = await window.api.anchors.getRelatedEvidence(caseId, anchorId);
    if (result.success) setExpandedData(result);
    loadData();
  }

  async function handleLinkIncident(anchorId, incidentId) {
    await window.api.anchors.linkIncident(caseId, anchorId, incidentId);
    const result = await window.api.anchors.getRelatedEvidence(caseId, anchorId);
    if (result.success) setExpandedData(result);
    loadData();
  }

  async function handleLinkPrecedent(anchorId, precedentId) {
    await window.api.anchors.linkPrecedent(caseId, anchorId, precedentId);
    const result = await window.api.anchors.getRelatedEvidence(caseId, anchorId);
    if (result.success) setExpandedData(result);
    loadData();
  }

  async function handleUnlinkPrecedent(anchorId, precedentId) {
    await window.api.anchors.unlinkPrecedent(caseId, anchorId, precedentId);
    const result = await window.api.anchors.getRelatedEvidence(caseId, anchorId);
    if (result.success) setExpandedData(result);
    loadData();
  }

  // Drag-and-drop reorder
  function handleDragStart(e, index) {
    setDragState({ dragging: index, over: null });
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragOver(e, index) {
    e.preventDefault();
    if (dragState.dragging !== index) {
      setDragState(prev => ({ ...prev, over: index }));
    }
  }

  async function handleDrop(e, index) {
    e.preventDefault();
    const fromIndex = dragState.dragging;
    if (fromIndex === null || fromIndex === index) {
      setDragState({ dragging: null, over: null });
      return;
    }

    const reordered = [...anchors];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(index, 0, moved);

    setAnchors(reordered);
    setDragState({ dragging: null, over: null });

    await window.api.anchors.reorder(caseId, reordered.map(a => a.id));
  }

  function handleDragEnd() {
    setDragState({ dragging: null, over: null });
  }

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner} />
        <span style={{ color: colors.textMuted }}>Loading case narrative...</span>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Actor detection toast */}
      {actorToast && (
        <div style={styles.actorToast}>
          <span style={styles.actorToastIcon}>{'\u{1F465}'}</span>
          <div>
            <strong>{actorToast.count} actor{actorToast.count > 1 ? 's' : ''} detected</strong>
            <div style={styles.actorToastNames}>
              {actorToast.actors.slice(0, 4).map(a => a.name).join(', ')}
              {actorToast.actors.length > 4 ? ` +${actorToast.actors.length - 4} more` : ''}
            </div>
          </div>
          <button style={styles.toastClose} onClick={() => setActorToast(null)}>{'\u00D7'}</button>
        </div>
      )}

      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Case Narrative</h1>
          <p style={styles.subtitle}>
            {anchors.length} anchor point{anchors.length !== 1 ? 's' : ''} identified
          </p>
        </div>
        <div style={styles.headerActions}>
          <button
            style={styles.secondaryBtn}
            onClick={handleRescan}
            onMouseEnter={e => e.target.style.background = '#F3F4F6'}
            onMouseLeave={e => e.target.style.background = '#F9FAFB'}
          >
            {'\u{1F504}'} Rescan
          </button>
          <button
            style={styles.primaryBtn}
            onClick={() => setShowAddForm(!showAddForm)}
            onMouseEnter={e => e.target.style.background = colors.primaryHover}
            onMouseLeave={e => e.target.style.background = colors.primary}
          >
            + Add Anchor
          </button>
        </div>
      </div>

      <div style={styles.content}>
        {/* Inline Add Form */}
        {showAddForm && (
          <div style={styles.addForm}>
            <div style={styles.addFormAccent} />
            <div style={styles.addFormBody}>
              <h3 style={styles.addFormTitle}>New Anchor Point</h3>
              <div style={styles.addFormGrid}>
                <div style={styles.addFormField}>
                  <label style={styles.label}>Title</label>
                  <input
                    value={newAnchor.title}
                    onChange={e => setNewAnchor({ ...newAnchor, title: e.target.value })}
                    style={styles.input}
                    placeholder="What happened?"
                    autoFocus
                    onKeyDown={e => e.key === 'Enter' && handleAddAnchor()}
                  />
                </div>
                <div style={styles.addFormField}>
                  <label style={styles.label}>Type</label>
                  <select
                    value={newAnchor.type}
                    onChange={e => setNewAnchor({ ...newAnchor, type: e.target.value })}
                    style={styles.select}
                  >
                    {ANCHOR_TYPES.map(t => (
                      <option key={t} value={t}>{t.replace('_', ' ')}</option>
                    ))}
                  </select>
                </div>
                <div style={styles.addFormField}>
                  <label style={styles.label}>Date (optional)</label>
                  <input
                    type="date"
                    value={newAnchor.date}
                    onChange={e => setNewAnchor({ ...newAnchor, date: e.target.value })}
                    style={styles.dateInput}
                  />
                </div>
              </div>
              <div style={styles.addFormActions}>
                <button style={styles.cancelBtn} onClick={() => setShowAddForm(false)}>Cancel</button>
                <button
                  style={{ ...styles.saveBtn, opacity: newAnchor.title.trim() ? 1 : 0.5 }}
                  onClick={handleAddAnchor}
                  disabled={!newAnchor.title.trim()}
                >
                  Add Anchor
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Context Input Section */}
        <div style={styles.contextSection}>
          <div style={styles.contextHeader}>
            <h2 style={styles.sectionTitle}>{'\u{1F4D6}'} Your Story</h2>
            {!editingContext ? (
              <button style={styles.editBtn} onClick={() => setEditingContext(true)}>
                {'\u270F\uFE0F'} Edit
              </button>
            ) : (
              <div style={styles.editActions}>
                <button style={styles.cancelBtn} onClick={() => setEditingContext(false)}>Cancel</button>
                <button style={styles.saveBtn} onClick={handleSaveContext}>Save & Scan</button>
              </div>
            )}
          </div>

          {editingContext ? (
            <div style={styles.contextForm}>
              <div style={styles.formRow}>
                <label style={styles.label}>Start Date</label>
                <input
                  type="date"
                  value={hireDateDraft}
                  onChange={e => setHireDateDraft(e.target.value)}
                  style={styles.dateInput}
                />
              </div>
              <div style={styles.formRow}>
                <label style={styles.label}>Tell your story</label>
                <textarea
                  value={contextDraft}
                  onChange={e => setContextDraft(e.target.value)}
                  style={styles.narrativeInput}
                  rows={8}
                  placeholder="Describe what happened... Include dates, names, and key events."
                />
              </div>
              <p style={styles.hint}>
                {'\u{1F4A1}'} Include dates and key moments. Names trigger automatic actor detection.
              </p>
            </div>
          ) : (
            <div style={styles.contextDisplay}>
              {context?.narrative ? (
                <p style={styles.narrativeText}>
                  {context.narrative.length > 300
                    ? context.narrative.slice(0, 300) + '...'
                    : context.narrative}
                </p>
              ) : (
                <p style={styles.emptyContext}>No story added yet. Click Edit to describe what happened.</p>
              )}
              {context?.hire_date && (
                <p style={styles.hireDateDisplay}>
                  {'\u{1F4C5}'} Employment started: {new Date(context.hire_date + 'T00:00:00').toLocaleDateString()}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Anchors Timeline */}
        <div style={styles.timelineSection}>
          {anchors.length === 0 ? (
            <div style={styles.emptyState}>
              <div style={styles.emptyIcon}>{'\u{1F4CD}'}</div>
              <h3 style={styles.emptyTitle}>No anchor points yet</h3>
              <p style={styles.emptyText}>
                Add your story above, or click "Add Anchor" to create one manually.
              </p>
            </div>
          ) : (
            <div style={styles.timeline}>
              {/* Gradient flow line */}
              <div style={styles.flowLineContainer}>
                <svg style={styles.flowLine} viewBox={`0 0 40 ${Math.max(anchors.length * 140, 200)}`} preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="flowGrad" x1="0" y1="0" x2="0" y2="1">
                      {anchors.map((a, i) => (
                        <stop
                          key={a.id}
                          offset={`${(i / Math.max(anchors.length - 1, 1)) * 100}%`}
                          stopColor={ANCHOR_COLORS[a.anchor_type] || '#6B7280'}
                          stopOpacity="0.6"
                        />
                      ))}
                    </linearGradient>
                  </defs>
                  <line x1="20" y1="0" x2="20" y2={anchors.length * 140} stroke="url(#flowGrad)" strokeWidth="3" strokeLinecap="round" />
                  {/* Node dots on the line */}
                  {anchors.map((a, i) => (
                    <circle
                      key={a.id}
                      cx="20"
                      cy={24 + i * 140}
                      r="6"
                      fill={ANCHOR_COLORS[a.anchor_type] || '#6B7280'}
                      stroke="#fff"
                      strokeWidth="2"
                    />
                  ))}
                </svg>
              </div>

              {/* Anchor cards */}
              {anchors.map((anchor, index) => (
                <div
                  key={anchor.id}
                  draggable
                  onDragStart={e => handleDragStart(e, index)}
                  onDragOver={e => handleDragOver(e, index)}
                  onDrop={e => handleDrop(e, index)}
                  onDragEnd={handleDragEnd}
                  style={{
                    ...styles.anchorRow,
                    opacity: dragState.dragging === index ? 0.4 : 1,
                    borderTop: dragState.over === index ? '2px solid ' + colors.primary : '2px solid transparent',
                    cursor: 'grab'
                  }}
                >
                  {/* Accent bar */}
                  <div style={{
                    ...styles.anchorAccent,
                    background: ANCHOR_COLORS[anchor.anchor_type] || '#6B7280'
                  }} />

                  {/* Card body */}
                  <div style={styles.anchorCardBody}>
                    {/* Top row: icon + type + title + badges */}
                    <div style={styles.anchorCardTop}>
                      <div style={styles.anchorMeta}>
                        <span style={styles.anchorIcon}>
                          {ANCHOR_ICONS[anchor.anchor_type] || '\u{1F4CC}'}
                        </span>
                        <span style={{
                          ...styles.anchorTypeBadge,
                          background: (ANCHOR_COLORS[anchor.anchor_type] || '#6B7280') + '18',
                          color: ANCHOR_COLORS[anchor.anchor_type] || '#6B7280'
                        }}>
                          {anchor.anchor_type.replace('_', ' ')}
                        </span>
                        {anchor.is_auto_generated && !anchor.user_edited && (
                          <span style={styles.autoBadge}>Auto</span>
                        )}
                        {anchor.contains_multiple_events ? (
                          <span style={styles.multiBadge} title="Contains multiple events - can be broken apart">
                            {'\u{1F500}'} {anchor.event_count || '2+'}
                          </span>
                        ) : null}
                      </div>

                      <div style={styles.anchorActions}>
                        <button
                          style={styles.iconBtn}
                          title="Clone"
                          onClick={e => { e.stopPropagation(); handleClone(anchor.id); }}
                        >
                          {'\u{1F4CB}'}
                        </button>
                        <button
                          style={styles.iconBtn}
                          title="Delete"
                          onClick={e => { e.stopPropagation(); handleDeleteAnchor(anchor.id); }}
                        >
                          {'\u{1F5D1}'}
                        </button>
                      </div>
                    </div>

                    {/* Title */}
                    <h3
                      style={styles.anchorTitle}
                      onClick={() => handleExpandAnchor(anchor)}
                    >
                      {anchor.title}
                    </h3>

                    {/* Date */}
                    {anchor.anchor_date && (
                      <div style={styles.anchorDate}>
                        {'\u{1F4C5}'}{' '}
                        {new Date(anchor.anchor_date + 'T00:00:00').toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric', year: 'numeric'
                        })}
                        {anchor.date_confidence && anchor.date_confidence !== 'exact' && (
                          <span style={styles.confidenceBadge}>~{anchor.date_confidence}</span>
                        )}
                      </div>
                    )}

                    {/* Description */}
                    {anchor.description && (
                      <p style={styles.anchorDescription}>
                        {anchor.description.slice(0, 120)}
                        {anchor.description.length > 120 ? '...' : ''}
                      </p>
                    )}

                    {/* Bottom row: evidence dots + precedent badges */}
                    <div style={styles.anchorCardBottom}>
                      {/* Evidence dots */}
                      <div style={styles.evidenceBlobs}>
                        {anchor.documents?.slice(0, 4).map(doc => (
                          <div
                            key={doc.id}
                            style={{ ...styles.evidenceBlob, background: getEvidenceColor(doc.evidence_type) }}
                            title={doc.filename}
                          />
                        ))}
                        {anchor.incidents?.slice(0, 3).map(inc => (
                          <div
                            key={inc.id}
                            style={{ ...styles.evidenceBlob, background: getSeverityColor(inc.computed_severity || inc.base_severity) }}
                            title={inc.title}
                          />
                        ))}
                        {((anchor.documents?.length || 0) + (anchor.incidents?.length || 0)) > 7 && (
                          <span style={styles.moreBlobs}>
                            +{(anchor.documents?.length || 0) + (anchor.incidents?.length || 0) - 7}
                          </span>
                        )}
                      </div>

                      {/* Precedent badges */}
                      {anchor.precedents?.length > 0 && (
                        <div style={styles.precedentBadges}>
                          {anchor.precedents.slice(0, 3).map(p => {
                            const info = PRECEDENT_CATALOG.find(c => c.id === p.precedent_id);
                            return (
                              <span key={p.precedent_id} style={styles.precedentBadge} title={info?.name || p.precedent_id}>
                                {'\u2696\uFE0F'} {info?.shortName || p.precedent_id}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Expand indicator */}
                    <button
                      style={styles.expandBtn}
                      onClick={() => handleExpandAnchor(anchor)}
                    >
                      {expandedAnchor === anchor.id ? 'Close details \u25B2' : 'View details \u25BC'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Expanded spoke panel overlay */}
      {expandedAnchor && expandedData && (
        <div style={styles.spokeOverlay} onClick={() => { setExpandedAnchor(null); setExpandedData(null); }}>
          <div style={styles.spokesPanel} onClick={e => e.stopPropagation()}>
            <AnchorSpokes
              anchor={expandedData.anchor}
              linked={expandedData.linked}
              nearby={expandedData.nearby}
              documents={documents}
              incidents={incidents}
              caseId={caseId}
              onClose={() => { setExpandedAnchor(null); setExpandedData(null); }}
              onUpdate={updates => handleUpdateAnchor(expandedAnchor, updates)}
              onLinkEvidence={docId => handleLinkEvidence(expandedAnchor, docId)}
              onUnlinkEvidence={docId => handleUnlinkEvidence(expandedAnchor, docId)}
              onLinkIncident={incId => handleLinkIncident(expandedAnchor, incId)}
              onLinkPrecedent={precId => handleLinkPrecedent(expandedAnchor, precId)}
              onUnlinkPrecedent={precId => handleUnlinkPrecedent(expandedAnchor, precId)}
              onBreakApart={() => handleBreakApart(expandedAnchor)}
              onClone={() => handleClone(expandedAnchor)}
              onDelete={() => handleDeleteAnchor(expandedAnchor)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ===== Spoke Details Component =====
function AnchorSpokes({
  anchor, linked, nearby, documents, incidents, caseId,
  onClose, onUpdate, onLinkEvidence, onUnlinkEvidence,
  onLinkIncident, onLinkPrecedent, onUnlinkPrecedent,
  onBreakApart, onClone, onDelete
}) {
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState({
    title: anchor.title || '',
    type: anchor.anchor_type || 'MILESTONE',
    date: anchor.anchor_date || '',
    dateConfidence: anchor.date_confidence || 'exact',
    whatHappened: anchor.what_happened || '',
    where: anchor.where_location || '',
    impact: anchor.impact_summary || ''
  });
  const [showAddEvidence, setShowAddEvidence] = useState(false);
  const [showAddIncident, setShowAddIncident] = useState(false);
  const [showAddPrecedent, setShowAddPrecedent] = useState(false);

  const accentColor = ANCHOR_COLORS[anchor.anchor_type] || '#6B7280';

  function handleSave() {
    onUpdate(editData);
    setEditing(false);
  }

  // Filter out already-linked items
  const linkedDocIds = new Set((linked.documents || []).map(d => d.id));
  const availableDocs = documents.filter(d => !linkedDocIds.has(d.id));

  const linkedIncIds = new Set((linked.incidents || []).map(i => i.id));
  const availableIncidents = incidents.filter(i => !linkedIncIds.has(i.id));

  const linkedPrecIds = new Set((linked.precedents || []).map(p => p.precedent_id));
  const availablePrecedents = PRECEDENT_CATALOG.filter(p => !linkedPrecIds.has(p.id));

  return (
    <div style={styles.spokesPanelInner}>
      {/* Colored header bar */}
      <div style={{ ...styles.spokesHeader, borderBottom: `3px solid ${accentColor}` }}>
        <div style={styles.spokesHeaderLeft}>
          <span style={{ fontSize: '24px' }}>{ANCHOR_ICONS[anchor.anchor_type] || '\u{1F4CC}'}</span>
          <div>
            {editing ? (
              <input
                value={editData.title}
                onChange={e => setEditData({ ...editData, title: e.target.value })}
                style={{ ...styles.spokeTitleInput, borderColor: accentColor }}
              />
            ) : (
              <h3 style={styles.spokesTitle}>{anchor.title}</h3>
            )}
            <span style={{
              ...styles.spokeTypeBadgeHeader,
              background: accentColor + '18',
              color: accentColor
            }}>
              {anchor.anchor_type.replace('_', ' ')}
            </span>
          </div>
        </div>
        <button style={styles.closeSpokes} onClick={onClose}>{'\u00D7'}</button>
      </div>

      <div style={styles.spokesContent}>
        {/* Type + Date row (editable) */}
        <div style={styles.spokeSection}>
          <div style={styles.spokeRow}>
            <div style={{ flex: 1 }}>
              <div style={styles.spokeLabel}>
                <span style={styles.spokeLabelIcon}>{'\u{1F3F7}\uFE0F'}</span> Type
              </div>
              {editing ? (
                <select
                  value={editData.type}
                  onChange={e => setEditData({ ...editData, type: e.target.value })}
                  style={styles.select}
                >
                  {ANCHOR_TYPES.map(t => (
                    <option key={t} value={t}>{t.replace('_', ' ')}</option>
                  ))}
                </select>
              ) : (
                <span style={{
                  ...styles.spokeTypeBadgeLarge,
                  background: accentColor + '18',
                  color: accentColor
                }}>
                  {anchor.anchor_type.replace('_', ' ')}
                </span>
              )}
            </div>
            <div style={{ flex: 1 }}>
              <div style={styles.spokeLabel}>
                <span style={styles.spokeLabelIcon}>{'\u{1F4C5}'}</span> Date
              </div>
              {editing ? (
                <div style={styles.dateEditRow}>
                  <input
                    type="date"
                    value={editData.date}
                    onChange={e => setEditData({ ...editData, date: e.target.value })}
                    style={styles.dateInputSmall}
                  />
                  <select
                    value={editData.dateConfidence}
                    onChange={e => setEditData({ ...editData, dateConfidence: e.target.value })}
                    style={styles.confidenceSelect}
                  >
                    <option value="exact">Exact</option>
                    <option value="approximate">Approximate</option>
                    <option value="relative">Relative</option>
                    <option value="unknown">Unknown</option>
                  </select>
                </div>
              ) : (
                <p style={styles.spokeText}>
                  {anchor.anchor_date
                    ? new Date(anchor.anchor_date + 'T00:00:00').toLocaleDateString('en-US', {
                        month: 'long', day: 'numeric', year: 'numeric'
                      })
                    : 'Date unknown'}
                  {anchor.date_confidence && anchor.date_confidence !== 'exact' && (
                    <span style={styles.confidenceBadge}> ~{anchor.date_confidence}</span>
                  )}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* What Happened */}
        <div style={styles.spokeSection}>
          <div style={styles.spokeLabel}>
            <span style={styles.spokeLabelIcon}>{'\u{1F4DD}'}</span> What Happened
          </div>
          {editing ? (
            <textarea
              value={editData.whatHappened}
              onChange={e => setEditData({ ...editData, whatHappened: e.target.value })}
              style={styles.spokeTextarea}
              rows={4}
            />
          ) : (
            <p style={styles.spokeText}>
              {anchor.what_happened || anchor.description || 'No description'}
            </p>
          )}
        </div>

        {/* Who Was Involved */}
        <div style={styles.spokeSection}>
          <div style={styles.spokeLabel}>
            <span style={styles.spokeLabelIcon}>{'\u{1F465}'}</span> Who Was Involved
          </div>
          {linked.actors?.length > 0 ? (
            <div style={styles.actorsList}>
              {linked.actors.map(actor => (
                <div key={actor.id} style={styles.actorChip}>
                  <span style={{
                    ...styles.actorDot,
                    background: getClassificationColor(actor.classification)
                  }} />
                  {actor.name}
                  {actor.role_in_anchor && (
                    <span style={styles.actorRole}>({actor.role_in_anchor})</span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p style={styles.spokeEmpty}>No actors linked</p>
          )}
        </div>

        {/* Where */}
        <div style={styles.spokeSection}>
          <div style={styles.spokeLabel}>
            <span style={styles.spokeLabelIcon}>{'\u{1F4CD}'}</span> Where
          </div>
          {editing ? (
            <input
              value={editData.where}
              onChange={e => setEditData({ ...editData, where: e.target.value })}
              style={styles.spokeInput}
              placeholder="Location or context"
            />
          ) : (
            <p style={styles.spokeText}>{anchor.where_location || 'Not specified'}</p>
          )}
        </div>

        {/* Impact */}
        <div style={styles.spokeSection}>
          <div style={styles.spokeLabel}>
            <span style={styles.spokeLabelIcon}>{'\u{1F4A5}'}</span> Impact
          </div>
          {editing ? (
            <textarea
              value={editData.impact}
              onChange={e => setEditData({ ...editData, impact: e.target.value })}
              style={styles.spokeTextarea}
              rows={2}
              placeholder="How did this affect you or your case?"
            />
          ) : (
            <p style={styles.spokeText}>{anchor.impact_summary || 'Impact not documented'}</p>
          )}
          {anchor.severity && (
            <span style={{
              ...styles.severityBadge,
              background: getSeverityColor(anchor.severity) + '20',
              color: getSeverityColor(anchor.severity)
            }}>
              {anchor.severity}
            </span>
          )}
        </div>

        {/* Evidence Section */}
        <div style={styles.spokeSection}>
          <div style={styles.spokeLabelRow}>
            <div style={styles.spokeLabel}>
              <span style={styles.spokeLabelIcon}>{'\u{1F4CE}'}</span>
              Evidence ({linked.documents?.length || 0})
            </div>
            <button
              style={styles.addSmallBtn}
              onClick={() => setShowAddEvidence(!showAddEvidence)}
            >
              {showAddEvidence ? 'Cancel' : '+ Add'}
            </button>
          </div>

          {linked.documents?.length > 0 && (
            <div style={styles.evidenceList}>
              {linked.documents.map(doc => (
                <div key={doc.id} style={styles.evidenceItem}>
                  <div style={{ ...styles.evidenceTypeDot, background: getEvidenceColor(doc.evidence_type) }} />
                  <span style={styles.evidenceName}>{doc.filename}</span>
                  <span style={styles.evidenceType}>{doc.evidence_type}</span>
                  <button
                    style={styles.removeBtn}
                    onClick={() => onUnlinkEvidence(doc.id)}
                    title="Remove link"
                  >
                    {'\u00D7'}
                  </button>
                </div>
              ))}
            </div>
          )}

          {showAddEvidence && availableDocs.length > 0 && (
            <div style={styles.addEvidenceList}>
              {availableDocs.slice(0, 8).map(doc => (
                <div
                  key={doc.id}
                  style={styles.addEvidenceItem}
                  onClick={() => { onLinkEvidence(doc.id); setShowAddEvidence(false); }}
                >
                  <div style={{ ...styles.evidenceTypeDot, background: getEvidenceColor(doc.evidence_type) }} />
                  <span style={styles.evidenceName}>{doc.filename}</span>
                </div>
              ))}
            </div>
          )}
          {showAddEvidence && availableDocs.length === 0 && (
            <p style={styles.spokeEmpty}>No documents available to link</p>
          )}

          {nearby.documents?.length > 0 && (
            <div style={styles.nearbySection}>
              <div style={styles.nearbyLabel}>Nearby evidence (within 14 days):</div>
              {nearby.documents.slice(0, 3).map(doc => (
                <div
                  key={doc.id}
                  style={styles.nearbyItem}
                  onClick={() => onLinkEvidence(doc.id)}
                  title="Click to link"
                >
                  + {doc.filename}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Incidents Section */}
        <div style={styles.spokeSection}>
          <div style={styles.spokeLabelRow}>
            <div style={styles.spokeLabel}>
              <span style={styles.spokeLabelIcon}>{'\u{1F6A8}'}</span>
              Incidents ({linked.incidents?.length || 0})
            </div>
            <button
              style={styles.addSmallBtn}
              onClick={() => setShowAddIncident(!showAddIncident)}
            >
              {showAddIncident ? 'Cancel' : '+ Add'}
            </button>
          </div>

          {linked.incidents?.length > 0 && (
            <div style={styles.evidenceList}>
              {linked.incidents.map(inc => (
                <div key={inc.id} style={styles.evidenceItem}>
                  <div style={{
                    ...styles.evidenceTypeDot,
                    background: getSeverityColor(inc.computed_severity || inc.base_severity)
                  }} />
                  <span style={styles.evidenceName}>{inc.title}</span>
                  <span style={styles.evidenceType}>{inc.incident_type}</span>
                </div>
              ))}
            </div>
          )}

          {showAddIncident && availableIncidents.length > 0 && (
            <div style={styles.addEvidenceList}>
              {availableIncidents.slice(0, 8).map(inc => (
                <div
                  key={inc.id}
                  style={styles.addEvidenceItem}
                  onClick={() => { onLinkIncident(inc.id); setShowAddIncident(false); }}
                >
                  <span style={styles.evidenceName}>{inc.title}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Precedents Section */}
        <div style={styles.spokeSection}>
          <div style={styles.spokeLabelRow}>
            <div style={styles.spokeLabel}>
              <span style={styles.spokeLabelIcon}>{'\u2696\uFE0F'}</span>
              Precedents ({linked.precedents?.length || 0})
            </div>
            <button
              style={styles.addSmallBtn}
              onClick={() => setShowAddPrecedent(!showAddPrecedent)}
            >
              {showAddPrecedent ? 'Cancel' : '+ Link'}
            </button>
          </div>

          {linked.precedents?.length > 0 && (
            <div style={styles.precedentList}>
              {linked.precedents.map(p => {
                const info = PRECEDENT_CATALOG.find(c => c.id === p.precedent_id);
                return (
                  <div key={p.precedent_id} style={styles.precedentItem}>
                    <span style={styles.precedentIcon}>{'\u2696\uFE0F'}</span>
                    <div style={styles.precedentInfo}>
                      <span style={styles.precedentName}>{info?.name || p.precedent_id}</span>
                      {p.relevance_note && (
                        <span style={styles.precedentNote}>{p.relevance_note}</span>
                      )}
                    </div>
                    <button
                      style={styles.removeBtn}
                      onClick={() => onUnlinkPrecedent(p.precedent_id)}
                    >
                      {'\u00D7'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {showAddPrecedent && availablePrecedents.length > 0 && (
            <div style={styles.addEvidenceList}>
              {availablePrecedents.map(prec => (
                <div
                  key={prec.id}
                  style={styles.addEvidenceItem}
                  onClick={() => { onLinkPrecedent(prec.id); setShowAddPrecedent(false); }}
                >
                  <span style={styles.precedentIcon}>{'\u2696\uFE0F'}</span>
                  <span style={styles.evidenceName}>{prec.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div style={styles.spokeActions}>
          <div style={styles.spokeActionsLeft}>
            {anchor.contains_multiple_events ? (
              <button style={styles.breakApartBtn} onClick={onBreakApart}>
                {'\u{1F500}'} Break Apart
              </button>
            ) : null}
            <button style={styles.cloneBtn} onClick={onClone}>
              {'\u{1F4CB}'} Clone
            </button>
            <button style={styles.deleteBtn} onClick={onDelete}>
              {'\u{1F5D1}'} Delete
            </button>
          </div>
          <div style={styles.spokeActionsRight}>
            {editing ? (
              <>
                <button style={styles.cancelBtn} onClick={() => setEditing(false)}>Cancel</button>
                <button style={styles.saveBtn} onClick={handleSave}>Save</button>
              </>
            ) : (
              <button style={styles.editBtn} onClick={() => setEditing(true)}>
                {'\u270F\uFE0F'} Edit Details
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function getClassificationColor(classification) {
  const map = {
    'bad_actor': '#DC2626',
    'enabler': '#F97316',
    'witness_supportive': '#16A34A',
    'witness_neutral': '#6B7280',
    'witness_hostile': '#DC2626',
    'self': '#3B82F6'
  };
  return map[classification] || '#6B7280';
}

// ===== Styles =====
const styles = {
  container: {
    height: '100%',
    background: '#FFFFFF',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative'
  },
  loadingContainer: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    color: colors.textMuted
  },
  spinner: {
    width: '32px',
    height: '32px',
    border: '3px solid #E5E7EB',
    borderTopColor: colors.primary,
    borderRadius: '50%',
    animation: 'spin 1s linear infinite'
  },

  // Actor toast
  actorToast: {
    position: 'fixed',
    top: '20px',
    right: '20px',
    background: '#EFF6FF',
    border: '1px solid #93C5FD',
    borderRadius: radius.lg,
    padding: `${spacing.sm} ${spacing.md}`,
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    boxShadow: shadows.lg,
    zIndex: 200,
    fontSize: typography.fontSize.sm,
    color: '#1E40AF',
    maxWidth: '380px'
  },
  actorToastIcon: { fontSize: '20px' },
  actorToastNames: { fontSize: typography.fontSize.xs, color: '#3B82F6', marginTop: '2px' },
  toastClose: {
    background: 'none',
    border: 'none',
    fontSize: '18px',
    color: '#93C5FD',
    cursor: 'pointer',
    marginLeft: spacing.sm
  },

  // Header
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: `${spacing.md} ${spacing.xl}`,
    borderBottom: '1px solid #F3F4F6',
    background: '#FAFAFA'
  },
  title: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textPrimary,
    margin: 0
  },
  subtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.textMuted,
    margin: `4px 0 0 0`
  },
  headerActions: {
    display: 'flex',
    gap: spacing.sm
  },
  secondaryBtn: {
    padding: `${spacing.sm} ${spacing.md}`,
    background: '#F9FAFB',
    border: '1px solid #E5E7EB',
    borderRadius: radius.md,
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    cursor: 'pointer',
    transition: 'background 0.15s'
  },
  primaryBtn: {
    padding: `${spacing.sm} ${spacing.md}`,
    background: colors.primary,
    border: 'none',
    borderRadius: radius.md,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: '#FFFFFF',
    cursor: 'pointer',
    transition: 'background 0.15s'
  },

  // Content
  content: {
    flex: 1,
    overflow: 'auto',
    padding: spacing.xl
  },

  // Add form
  addForm: {
    display: 'flex',
    background: '#FFFFFF',
    border: '1px solid #E5E7EB',
    borderRadius: radius.lg,
    marginBottom: spacing.lg,
    boxShadow: shadows.md,
    overflow: 'hidden'
  },
  addFormAccent: {
    width: '4px',
    background: `linear-gradient(180deg, ${colors.primary}, #8B5CF6)`,
    flexShrink: 0
  },
  addFormBody: {
    flex: 1,
    padding: spacing.md
  },
  addFormTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textPrimary,
    margin: `0 0 ${spacing.md} 0`
  },
  addFormGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md
  },
  addFormField: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    flex: '1 1 140px',
    minWidth: '120px'
  },
  addFormActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: spacing.sm
  },

  // Inputs
  label: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
  },
  input: {
    padding: `${spacing.sm} ${spacing.sm}`,
    border: '1px solid #E5E7EB',
    borderRadius: radius.md,
    fontSize: typography.fontSize.sm,
    outline: 'none'
  },
  select: {
    padding: `${spacing.sm} ${spacing.sm}`,
    border: '1px solid #E5E7EB',
    borderRadius: radius.md,
    fontSize: typography.fontSize.sm,
    background: '#FFFFFF',
    outline: 'none'
  },
  dateInput: {
    padding: `${spacing.sm} ${spacing.sm}`,
    border: '1px solid #E5E7EB',
    borderRadius: radius.md,
    fontSize: typography.fontSize.sm
  },

  // Buttons
  editBtn: {
    padding: `${spacing.xs} ${spacing.sm}`,
    background: 'transparent',
    border: '1px solid #E5E7EB',
    borderRadius: radius.md,
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    cursor: 'pointer'
  },
  editActions: {
    display: 'flex',
    gap: spacing.sm
  },
  cancelBtn: {
    padding: `${spacing.xs} ${spacing.md}`,
    background: 'transparent',
    border: '1px solid #E5E7EB',
    borderRadius: radius.md,
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    cursor: 'pointer'
  },
  saveBtn: {
    padding: `${spacing.xs} ${spacing.md}`,
    background: colors.primary,
    border: 'none',
    borderRadius: radius.md,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: '#FFFFFF',
    cursor: 'pointer'
  },
  iconBtn: {
    background: 'none',
    border: 'none',
    fontSize: '14px',
    cursor: 'pointer',
    padding: '4px',
    borderRadius: radius.sm,
    opacity: 0.5,
    transition: 'opacity 0.15s'
  },
  addSmallBtn: {
    padding: `2px ${spacing.sm}`,
    background: '#F3F4F6',
    border: '1px solid #E5E7EB',
    borderRadius: radius.sm,
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    cursor: 'pointer'
  },
  removeBtn: {
    background: 'none',
    border: 'none',
    fontSize: '16px',
    color: '#DC2626',
    cursor: 'pointer',
    padding: '2px 4px',
    borderRadius: radius.sm,
    opacity: 0.6
  },

  // Context section
  contextSection: {
    background: '#FAFAF8',
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.xl,
    border: '1px solid #F0EDE8'
  },
  contextHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md
  },
  sectionTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textPrimary,
    margin: 0
  },
  contextForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.md
  },
  formRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs
  },
  narrativeInput: {
    padding: spacing.md,
    border: '1px solid #E5E7EB',
    borderRadius: radius.md,
    fontSize: typography.fontSize.base,
    fontFamily: 'inherit',
    resize: 'vertical',
    lineHeight: 1.6,
    outline: 'none'
  },
  hint: {
    fontSize: typography.fontSize.sm,
    color: colors.textMuted,
    margin: 0
  },
  contextDisplay: {},
  narrativeText: {
    fontSize: typography.fontSize.sm,
    color: colors.textPrimary,
    lineHeight: 1.6,
    margin: 0
  },
  emptyContext: {
    fontSize: typography.fontSize.sm,
    color: colors.textMuted,
    fontStyle: 'italic',
    margin: 0
  },
  hireDateDisplay: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.sm
  },

  // Timeline
  timelineSection: {
    position: 'relative'
  },
  emptyState: {
    textAlign: 'center',
    padding: spacing.xxl
  },
  emptyIcon: {
    fontSize: '48px',
    marginBottom: spacing.md
  },
  emptyTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textPrimary,
    margin: 0
  },
  emptyText: {
    fontSize: typography.fontSize.base,
    color: colors.textMuted,
    margin: `${spacing.sm} 0 0 0`
  },
  timeline: {
    position: 'relative',
    paddingLeft: '48px'
  },
  flowLineContainer: {
    position: 'absolute',
    top: 0,
    left: '0px',
    width: '40px',
    height: '100%',
    pointerEvents: 'none',
    zIndex: 0
  },
  flowLine: {
    width: '40px',
    height: '100%'
  },

  // Anchor row (card style)
  anchorRow: {
    display: 'flex',
    background: '#FFFFFF',
    border: '1px solid #E5E7EB',
    borderRadius: radius.lg,
    marginBottom: spacing.md,
    overflow: 'hidden',
    transition: 'all 0.15s ease',
    position: 'relative',
    zIndex: 1
  },
  anchorAccent: {
    width: '4px',
    flexShrink: 0
  },
  anchorCardBody: {
    flex: 1,
    padding: `${spacing.sm} ${spacing.md}`
  },
  anchorCardTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '4px'
  },
  anchorMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm
  },
  anchorIcon: {
    fontSize: '16px'
  },
  anchorTypeBadge: {
    fontSize: '10px',
    fontWeight: typography.fontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    padding: '2px 6px',
    borderRadius: radius.sm
  },
  autoBadge: {
    fontSize: '10px',
    fontWeight: typography.fontWeight.medium,
    color: colors.textMuted,
    background: '#F3F4F6',
    padding: '2px 6px',
    borderRadius: radius.sm
  },
  multiBadge: {
    fontSize: '10px',
    fontWeight: typography.fontWeight.medium,
    color: '#B45309',
    background: '#FFFBEB',
    padding: '2px 6px',
    borderRadius: radius.sm
  },
  anchorActions: {
    display: 'flex',
    gap: '2px'
  },
  anchorTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textPrimary,
    margin: `0 0 4px 0`,
    cursor: 'pointer'
  },
  anchorDate: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    display: 'flex',
    alignItems: 'center',
    gap: '4px'
  },
  confidenceBadge: {
    fontSize: '10px',
    color: '#B45309',
    background: '#FFFBEB',
    padding: '1px 4px',
    borderRadius: '3px',
    marginLeft: '4px'
  },
  anchorDescription: {
    fontSize: typography.fontSize.sm,
    color: colors.textMuted,
    lineHeight: 1.5,
    margin: `0 0 ${spacing.sm} 0`
  },
  anchorCardBottom: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  evidenceBlobs: {
    display: 'flex',
    gap: '4px',
    flexWrap: 'wrap',
    alignItems: 'center'
  },
  evidenceBlob: {
    width: '10px',
    height: '10px',
    borderRadius: '50%'
  },
  moreBlobs: {
    fontSize: '10px',
    color: colors.textMuted
  },
  precedentBadges: {
    display: 'flex',
    gap: '4px',
    flexWrap: 'wrap'
  },
  precedentBadge: {
    fontSize: '10px',
    color: '#6B21A8',
    background: '#F3E8FF',
    padding: '2px 6px',
    borderRadius: radius.sm,
    whiteSpace: 'nowrap'
  },
  expandBtn: {
    background: 'none',
    border: 'none',
    color: colors.primary,
    fontSize: typography.fontSize.xs,
    cursor: 'pointer',
    padding: `${spacing.xs} 0 0 0`,
    display: 'block',
    width: '100%',
    textAlign: 'left'
  },

  // Spoke overlay
  spokeOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.35)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100
  },
  spokesPanel: {
    background: '#FFFFFF',
    borderRadius: radius.xl,
    boxShadow: shadows.xl,
    width: '560px',
    maxHeight: '85vh',
    overflow: 'hidden'
  },
  spokesPanelInner: {
    display: 'flex',
    flexDirection: 'column',
    height: '85vh'
  },
  spokesHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: `${spacing.md} ${spacing.lg}`,
    background: '#FAFAFA'
  },
  spokesHeaderLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm
  },
  spokesTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textPrimary,
    margin: 0
  },
  spokeTitleInput: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textPrimary,
    border: '1px solid',
    borderRadius: radius.md,
    padding: `4px ${spacing.sm}`,
    outline: 'none',
    width: '280px'
  },
  spokeTypeBadgeHeader: {
    display: 'inline-block',
    fontSize: '10px',
    fontWeight: typography.fontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    padding: '2px 6px',
    borderRadius: radius.sm,
    marginTop: '4px'
  },
  closeSpokes: {
    background: 'none',
    border: 'none',
    fontSize: '28px',
    color: colors.textMuted,
    cursor: 'pointer',
    lineHeight: 1,
    padding: '4px'
  },
  spokesContent: {
    padding: `${spacing.md} ${spacing.lg}`,
    overflowY: 'auto',
    flex: 1
  },
  spokeSection: {
    marginBottom: spacing.md,
    paddingBottom: spacing.md,
    borderBottom: '1px solid #F3F4F6'
  },
  spokeRow: {
    display: 'flex',
    gap: spacing.lg
  },
  spokeLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.xs,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: spacing.sm
  },
  spokeLabelRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm
  },
  spokeLabelIcon: {
    fontSize: '13px'
  },
  spokeText: {
    fontSize: typography.fontSize.sm,
    color: colors.textPrimary,
    lineHeight: 1.5,
    margin: 0
  },
  spokeTypeBadgeLarge: {
    display: 'inline-block',
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    padding: `4px ${spacing.sm}`,
    borderRadius: radius.md,
    textTransform: 'capitalize'
  },
  spokeEmpty: {
    fontSize: typography.fontSize.sm,
    color: colors.textMuted,
    fontStyle: 'italic',
    margin: 0
  },
  spokeTextarea: {
    width: '100%',
    padding: spacing.sm,
    border: '1px solid #E5E7EB',
    borderRadius: radius.md,
    fontSize: typography.fontSize.sm,
    fontFamily: 'inherit',
    resize: 'vertical',
    boxSizing: 'border-box',
    outline: 'none'
  },
  spokeInput: {
    width: '100%',
    padding: spacing.sm,
    border: '1px solid #E5E7EB',
    borderRadius: radius.md,
    fontSize: typography.fontSize.sm,
    boxSizing: 'border-box',
    outline: 'none'
  },
  dateEditRow: {
    display: 'flex',
    gap: spacing.sm
  },
  dateInputSmall: {
    padding: spacing.sm,
    border: '1px solid #E5E7EB',
    borderRadius: radius.md,
    fontSize: typography.fontSize.sm,
    flex: 1
  },
  confidenceSelect: {
    padding: spacing.sm,
    border: '1px solid #E5E7EB',
    borderRadius: radius.md,
    fontSize: typography.fontSize.xs,
    background: '#FFFFFF',
    width: '100px'
  },

  // Actors
  actorsList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: spacing.sm
  },
  actorChip: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.xs,
    padding: `${spacing.xs} ${spacing.sm}`,
    background: '#F9FAFB',
    borderRadius: radius.full,
    fontSize: typography.fontSize.sm,
    border: '1px solid #F3F4F6'
  },
  actorDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%'
  },
  actorRole: {
    fontSize: typography.fontSize.xs,
    color: colors.textMuted
  },
  severityBadge: {
    display: 'inline-block',
    marginTop: spacing.sm,
    padding: `2px ${spacing.sm}`,
    borderRadius: radius.sm,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    textTransform: 'capitalize'
  },

  // Evidence list
  evidenceList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px'
  },
  evidenceItem: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    padding: `${spacing.xs} ${spacing.sm}`,
    background: '#F9FAFB',
    borderRadius: radius.md
  },
  evidenceTypeDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    flexShrink: 0
  },
  evidenceName: {
    flex: 1,
    fontSize: typography.fontSize.sm,
    color: colors.textPrimary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  evidenceType: {
    fontSize: typography.fontSize.xs,
    color: colors.textMuted
  },
  addEvidenceList: {
    marginTop: spacing.sm,
    border: '1px solid #E5E7EB',
    borderRadius: radius.md,
    maxHeight: '160px',
    overflowY: 'auto'
  },
  addEvidenceItem: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    padding: `${spacing.xs} ${spacing.sm}`,
    cursor: 'pointer',
    borderBottom: '1px solid #F9FAFB',
    fontSize: typography.fontSize.sm,
    transition: 'background 0.1s'
  },

  // Precedent section
  precedentList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px'
  },
  precedentItem: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    padding: `${spacing.xs} ${spacing.sm}`,
    background: '#FAF5FF',
    borderRadius: radius.md,
    border: '1px solid #E9D5FF'
  },
  precedentIcon: {
    fontSize: '14px',
    flexShrink: 0
  },
  precedentInfo: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column'
  },
  precedentName: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: '#6B21A8'
  },
  precedentNote: {
    fontSize: typography.fontSize.xs,
    color: '#9333EA'
  },

  // Nearby
  nearbySection: {
    marginTop: spacing.md,
    padding: spacing.sm,
    background: '#FFFBEB',
    borderRadius: radius.md,
    border: '1px solid #FEF3C7'
  },
  nearbyLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    color: '#B45309',
    marginBottom: spacing.xs
  },
  nearbyItem: {
    fontSize: typography.fontSize.sm,
    color: '#92400E',
    padding: `${spacing.xs} 0`,
    cursor: 'pointer'
  },

  // Spoke actions
  spokeActions: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.md,
    borderTop: '1px solid #F3F4F6'
  },
  spokeActionsLeft: {
    display: 'flex',
    gap: spacing.sm
  },
  spokeActionsRight: {
    display: 'flex',
    gap: spacing.sm
  },
  breakApartBtn: {
    padding: `${spacing.xs} ${spacing.sm}`,
    background: '#FFFBEB',
    border: '1px solid #FDE68A',
    borderRadius: radius.md,
    fontSize: typography.fontSize.xs,
    color: '#B45309',
    cursor: 'pointer'
  },
  cloneBtn: {
    padding: `${spacing.xs} ${spacing.sm}`,
    background: '#F0F9FF',
    border: '1px solid #BAE6FD',
    borderRadius: radius.md,
    fontSize: typography.fontSize.xs,
    color: '#0369A1',
    cursor: 'pointer'
  },
  deleteBtn: {
    padding: `${spacing.xs} ${spacing.sm}`,
    background: '#FEF2F2',
    border: '1px solid #FECACA',
    borderRadius: radius.md,
    fontSize: typography.fontSize.xs,
    color: '#DC2626',
    cursor: 'pointer'
  }
};
