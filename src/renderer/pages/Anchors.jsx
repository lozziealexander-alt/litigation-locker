import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { colors, shadows, spacing, typography, radius, getEvidenceColor, getSeverityColor } from '../styles/tokens';

// ===== Constants =====

const ANCHOR_COLORS = {
  'START': '#3B82F6',
  'REPORTED': '#8B5CF6',
  'HELP': '#F97316',
  'ADVERSE_ACTION': '#DC2626',
  'HARASSMENT': '#E11D48',
  'MILESTONE': '#6B7280',
  'END': '#1F2937'
};

const ANCHOR_ICONS = {
  'START': '\u{1F680}',
  'REPORTED': '\u{1F4E2}',
  'HELP': '\u{1F198}',
  'ADVERSE_ACTION': '\u26A0\uFE0F',
  'HARASSMENT': '\u{1F6A8}',
  'MILESTONE': '\u{1F4CC}',
  'END': '\u{1F3C1}'
};

const ANCHOR_TYPES = ['START', 'REPORTED', 'HELP', 'ADVERSE_ACTION', 'HARASSMENT', 'MILESTONE', 'END'];

const ANCHOR_TYPE_GLOSSARY = {
  START: 'The beginning of your employment or a significant role change',
  REPORTED: 'When you formally or informally reported misconduct, discrimination, or concerns',
  HELP: 'When you asked for support, escalated issues, or sought assistance',
  ADVERSE_ACTION: 'Negative actions taken against you in retaliation or discrimination',
  HARASSMENT: 'An incident of harassment, bullying, or hostile conduct',
  MILESTONE: 'Important dates or events in your case timeline',
  END: 'Termination, resignation, or end of employment'
};

const EVIDENCE_TYPE_GLOSSARY = {
  ADVERSE_ACTION: 'Negative employment action taken against you (demotion, warning, termination)',
  PROTECTED_ACTIVITY: 'Your formal complaints, EEOC filings, or whistleblower reports',
  REQUEST_FOR_HELP: 'Emails or messages where you asked for help or escalated concerns',
  INCIDENT: 'Records of discriminatory incidents, harassment, or hostile behavior',
  RESPONSE: 'Company responses to your complaints or reports',
  CLAIM_AGAINST_YOU: 'Performance complaints, PIPs, or allegations made about you',
  CLAIM_YOU_MADE: 'Formal claims, charges, or legal filings you initiated',
  PAY_RECORD: 'Pay stubs, bonus records, compensation documentation',
  SUPPORTING: 'Witness statements, corroborating evidence, character references',
  CONTEXT: 'Background documents, org charts, policies, general context'
};

const CLASSIFICATION_GLOSSARY = {
  bad_actor: 'The person who committed harassment, discrimination, or retaliation',
  enabler: 'Someone who enabled or failed to stop the misconduct',
  witness_supportive: 'A witness who supports your account',
  witness_neutral: 'A witness with no clear bias',
  witness_hostile: 'A witness who may contradict your account',
  bystander: 'Someone present but not directly involved',
  corroborator: 'Someone who can confirm specific facts or events',
  self: 'You \u2014 the person bringing the case',
  unknown: 'Classification not yet determined'
};

const EVIDENCE_TYPES = [
  'ADVERSE_ACTION', 'PROTECTED_ACTIVITY', 'REQUEST_FOR_HELP', 'INCIDENT',
  'RESPONSE', 'CLAIM_AGAINST_YOU', 'CLAIM_YOU_MADE', 'PAY_RECORD',
  'SUPPORTING', 'CONTEXT'
];

const PRECEDENT_CATALOG = [
  { id: 'burlington_northern', name: 'Burlington Northern v. White', shortName: 'Burlington Northern', citation: '548 U.S. 53', year: 2006, court: 'U.S. Supreme Court', standard: 'Retaliation', summary: 'Established that retaliation claims require showing the employer\'s action would dissuade a reasonable worker from making a charge of discrimination. Broadened the scope of actionable retaliation beyond tangible employment actions.', elements: ['Protected activity', 'Materially adverse action', 'Causal connection', 'Temporal proximity'] },
  { id: 'harris', name: 'Harris v. Forklift Systems', shortName: 'Harris', citation: '510 U.S. 17', year: 1993, court: 'U.S. Supreme Court', standard: 'Hostile Work Environment', summary: 'Set the standard for hostile work environment claims. Conduct must be severe or pervasive enough to create an objectively hostile environment that a reasonable person would find hostile or abusive.', elements: ['Unwelcome conduct', 'Based on protected class', 'Severe or pervasive', 'Employer liability'] },
  { id: 'vance', name: 'Vance v. Ball State', shortName: 'Vance', citation: '570 U.S. 421', year: 2013, court: 'U.S. Supreme Court', standard: 'Supervisor Definition', summary: 'Narrowly defined "supervisor" as someone empowered to take tangible employment actions. This affects employer liability analysis in harassment cases.', elements: ['Supervisor as harasser', 'Tangible employment action'] },
  { id: 'morgan', name: 'National Railroad v. Morgan', shortName: 'Morgan', citation: '536 U.S. 101', year: 2002, court: 'U.S. Supreme Court', standard: 'Continuing Violation', summary: 'Hostile environment claims can include acts outside the filing period if they are part of the same pattern. Each discriminatory act restarts the clock for hostile environment claims.', elements: ['Pattern of conduct (2+ incidents)', 'Timely filing (365 days FCHR / 300 days EEOC)'] },
  { id: 'faragher', name: 'Faragher/Ellerth', shortName: 'Faragher', citation: '524 U.S. 775', year: 1998, court: 'U.S. Supreme Court', standard: 'Employer Liability', summary: 'Employer is liable for supervisor harassment if no tangible action was taken but employer failed to prevent or correct. Established the affirmative defense for employers who can show reasonable care.', elements: ['Reported to employer', 'Employer failed to act'] },
  { id: 'harper_fcra', name: 'Harper v. Blockbuster', shortName: 'Harper', citation: '139 F.3d 1385', year: 1998, court: '11th Circuit', standard: 'FCRA / McDonnell Douglas', summary: 'Applied the McDonnell Douglas burden-shifting framework to Florida Civil Rights Act claims. Plaintiff must show protected class membership, adverse action, and comparator evidence.', elements: ['Protected class member', 'Adverse action', 'Comparator evidence'] },
  { id: 'joshua_filing', name: 'Joshua v. City of Gainesville', shortName: 'Joshua', citation: '768 So. 2d 432', year: 2000, court: 'Florida Supreme Court', standard: 'FCRA Filing Deadlines', summary: 'Established strict filing deadlines for Florida Civil Rights Act claims. Must file with FCHR within 365 days of the discriminatory act.', elements: ['Timely FCHR filing (365 days)', 'Protected activity documented'] },
  { id: 'lewis_mosaic', name: 'Lewis v. City of Union City', shortName: 'Lewis', citation: '918 F.3d 1213', year: 2019, court: '11th Circuit (en banc)', standard: 'Convincing Mosaic', summary: 'Adopted the "convincing mosaic" standard allowing plaintiffs to survive summary judgment by presenting circumstantial evidence that creates a convincing mosaic of discrimination.', elements: ['Suspicious timing (within 120 days)', 'Differential treatment', 'Inconsistent explanations'] },
  { id: 'monaghan_retaliation', name: 'Monaghan v. Worldpay', shortName: 'Monaghan', citation: '955 F.3d 855', year: 2020, court: '11th Circuit', standard: 'Retaliatory Harassment', summary: 'Held that retaliatory harassment does not require meeting the severe or pervasive standard of hostile environment claims. A single retaliatory act can suffice if it would dissuade a reasonable worker.', elements: ['Protected activity', 'Retaliatory conduct', 'Dissuade standard (1+ incident)'] },
  { id: 'thomas_proximity', name: 'Thomas v. Cooper Lighting', shortName: 'Thomas', citation: '506 F.3d 1361', year: 2007, court: '11th Circuit', standard: 'Temporal Proximity', summary: 'Established strict temporal proximity requirements. Very close proximity (within 60 days) can alone establish causation. Beyond that, additional corroborating evidence is needed.', elements: ['Protected activity', 'Adverse action', 'Close temporal proximity (60 days)', 'Corroborating evidence (if >60 days)'] },
  { id: 'sierminski_whistleblower', name: 'Sierminski v. Transouth', shortName: 'Sierminski', citation: '216 F.3d 945', year: 2000, court: '11th Circuit', standard: 'FL Whistleblower', summary: 'Interpreted Florida Whistleblower Protection Act. Employee must show they reported an actual violation and suffered adverse action within a causal timeframe.', elements: ['Whistleblower activity', 'Adverse action', 'Causal connection (90 days)'] },
  { id: 'gessner_actual_violation', name: 'Gessner v. Gulf Power', shortName: 'Gessner', citation: 'Fla. 1st DCA', year: 2024, court: 'Florida 1st DCA', standard: 'Actual Violation Required', summary: 'Clarified that Florida Whistleblower Act requires the employee to have identified an actual violation, not merely a good-faith belief of a violation.', elements: ['Identified actual violation', 'Objection or refusal', 'Adverse action'] },
  { id: 'muldrow_some_harm', name: 'Muldrow v. City of St. Louis', shortName: 'Muldrow', citation: '144 S. Ct. 967', year: 2024, court: 'U.S. Supreme Court', standard: 'Lowered Threshold', summary: 'Lowered the bar for Title VII discrimination claims. Plaintiffs need only show "some harm" from a discriminatory transfer or other action, not that the harm was "significant" or "material."', elements: ['Protected class', 'Some harm action', 'Discriminatory motive'] }
];

const TODAY_ISO = new Date().toISOString().split('T')[0];

// ===== Main Component =====

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
  const [newAnchor, setNewAnchor] = useState({ title: '', type: 'MILESTONE', date: '', description: '' });
  const [dragState, setDragState] = useState({ dragging: null, over: null });
  const [actorToast, setActorToast] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [allActors, setAllActors] = useState([]);
  const [precedentDetail, setPrecedentDetail] = useState(null);
  const [dateError, setDateError] = useState('');
  const [duplicateActors, setDuplicateActors] = useState([]);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [sortMode, setSortMode] = useState('chronological'); // 'chronological' | 'manual'

  // Sort anchors: chronological mode sorts by date; manual mode sorts by sort_order
  const sortedAnchors = useMemo(() => {
    return [...anchors].sort((a, b) => {
      if (sortMode === 'chronological') {
        // Date-first sorting: dated anchors by date, undated at end
        if (a.anchor_date && b.anchor_date) return a.anchor_date.localeCompare(b.anchor_date);
        if (a.anchor_date) return -1;
        if (b.anchor_date) return 1;
        // Both undated: fall back to sort_order or creation order
        return (a.sort_order ?? 999) - (b.sort_order ?? 999);
      }
      // Manual mode: sort_order first, then date
      if (a.sort_order !== b.sort_order) return (a.sort_order ?? 999) - (b.sort_order ?? 999);
      if (a.anchor_date && b.anchor_date) return a.anchor_date.localeCompare(b.anchor_date);
      if (a.anchor_date) return -1;
      if (b.anchor_date) return 1;
      return 0;
    });
  }, [anchors, sortMode]);

  useEffect(() => { loadData(); }, [caseId]);

  async function loadData() {
    setLoading(true);
    try {
      const [anchorsResult, contextResult, docsResult, incidentsResult, actorsResult] = await Promise.all([
        window.api.anchors.list(caseId).catch(() => ({ success: false })),
        window.api.context.get(caseId).catch(() => ({ success: false })),
        window.api.documents.list().catch(() => ({ success: false })),
        window.api.incidents.list().catch(() => ({ success: false })),
        window.api.actors.list().catch(() => ({ success: false }))
      ]);

      if (anchorsResult.success) setAnchors(anchorsResult.anchors);
      if (contextResult.success) {
        setContext(contextResult.context);
        setContextDraft(contextResult.context?.narrative || '');
        setHireDateDraft(contextResult.context?.hire_date || '');
      }
      if (docsResult.success) setDocuments(docsResult.documents || []);
      if (incidentsResult.success) setIncidents(incidentsResult.incidents || []);
      if (actorsResult.success) {
        setAllActors(actorsResult.actors || []);
        // Step 4: Check for duplicate actors
        try {
          const dupes = await window.api.actors.checkDuplicates();
          if (dupes.success && dupes.duplicates?.length > 0) {
            setDuplicateActors(dupes.duplicates);
          }
        } catch (e) { /* ignore */ }
      }
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
          setActorToast({ count: result.actorsFound, actors: result.actors || [] });
          setTimeout(() => setActorToast(null), 6000);
        }
        // Step 3: Auto-link precedents after generation
        try { await window.api.precedents.analyze(caseId); } catch (e) { /* ignore */ }
        await loadData();
      }
    } catch (err) {
      console.error('Rescan error:', err);
    }
  }

  async function handleSaveContext() {
    try {
      const saveResult = await window.api.context.update(caseId, {
        narrative: contextDraft, hireDate: hireDateDraft
      });
      if (!saveResult?.success) return;
      setEditingContext(false);

      if (contextDraft.trim().length > 10) {
        const result = await window.api.anchors.generate(caseId);
        if (result?.success) {
          if (result.actorsFound > 0) {
            setActorToast({ count: result.actorsFound, actors: result.actors || [] });
            setTimeout(() => setActorToast(null), 6000);
          }
          // Step 3: Auto-link precedents after generation
          try { await window.api.precedents.analyze(caseId); } catch (e) { /* ignore */ }
        }
      }

      const savedNarrative = contextDraft;
      const savedHireDate = hireDateDraft;
      await loadData();
      setContextDraft(savedNarrative);
      setHireDateDraft(savedHireDate);
    } catch (err) {
      console.error('Save error:', err);
    }
  }

  const expandedAnchorRef = useRef(null);

  async function handleExpandAnchor(anchor) {
    if (expandedAnchor === anchor.id) {
      setExpandedAnchor(null);
      setExpandedData(null);
      expandedAnchorRef.current = null;
      return;
    }
    // Clear stale data immediately so old card doesn't flash
    expandedAnchorRef.current = anchor.id;
    setExpandedAnchor(anchor.id);
    setExpandedData(null);
    const result = await window.api.anchors.getRelatedEvidence(caseId, anchor.id);
    // Guard against race condition: only set data if this anchor is still expanded
    if (result.success && expandedAnchorRef.current === anchor.id) {
      setExpandedData(result);
    }
  }

  async function handleUpdateAnchor(anchorId, updates) {
    console.log('[Anchors] Saving anchor', anchorId, 'updates:', JSON.stringify(updates));
    const result = await window.api.anchors.update(caseId, anchorId, updates);
    console.log('[Anchors] Save result:', JSON.stringify(result));
    if (result && !result.success && result.error) {
      setDateError(result.error);
      setTimeout(() => setDateError(''), 3000);
      return;
    }
    if (expandedAnchorRef.current === anchorId) {
      const res = await window.api.anchors.getRelatedEvidence(caseId, anchorId);
      if (res.success && expandedAnchorRef.current === anchorId) setExpandedData(res);
    }
    loadData();
  }

  async function handleAddAnchor() {
    if (!newAnchor.title.trim()) return;
    if (newAnchor.date && newAnchor.date > TODAY_ISO) {
      setDateError('Date cannot be in the future');
      setTimeout(() => setDateError(''), 3000);
      return;
    }
    await window.api.anchors.create(caseId, {
      title: newAnchor.title.trim(),
      type: newAnchor.type,
      date: newAnchor.date || null,
      description: newAnchor.description || null
    });
    setNewAnchor({ title: '', type: 'MILESTONE', date: '', description: '' });
    setShowAddForm(false);
    loadData();
  }

  async function handleClone(anchorId) {
    await window.api.anchors.clone(caseId, anchorId);
    loadData();
  }

  async function handleBreakApart(anchorId) {
    const result = await window.api.anchors.breakApart(caseId, anchorId);
    if (result.success) { expandedAnchorRef.current = null; setExpandedAnchor(null); setExpandedData(null); loadData(); }
  }

  async function handleDeleteAnchor(anchorId) {
    if (!window.confirm('Delete this anchor point? This cannot be undone.')) return;
    await window.api.anchors.delete(caseId, anchorId);
    expandedAnchorRef.current = null; setExpandedAnchor(null); setExpandedData(null); loadData();
  }

  async function handleLinkEvidence(anchorId, docId) {
    await window.api.anchors.linkEvidence(caseId, anchorId, docId);
    const r = await window.api.anchors.getRelatedEvidence(caseId, anchorId);
    if (r.success) setExpandedData(r);
    loadData();
  }

  async function handleUnlinkEvidence(anchorId, docId) {
    await window.api.anchors.unlinkEvidence(caseId, anchorId, docId);
    const r = await window.api.anchors.getRelatedEvidence(caseId, anchorId);
    if (r.success) setExpandedData(r);
    loadData();
  }

  async function handleLinkIncident(anchorId, incidentId) {
    await window.api.anchors.linkIncident(caseId, anchorId, incidentId);
    const r = await window.api.anchors.getRelatedEvidence(caseId, anchorId);
    if (r.success) setExpandedData(r);
    loadData();
  }

  async function handleLinkPrecedent(anchorId, precedentId) {
    await window.api.anchors.linkPrecedent(caseId, anchorId, precedentId);
    const r = await window.api.anchors.getRelatedEvidence(caseId, anchorId);
    if (r.success) setExpandedData(r);
    loadData();
  }

  async function handleUnlinkPrecedent(anchorId, precedentId) {
    await window.api.anchors.unlinkPrecedent(caseId, anchorId, precedentId);
    const r = await window.api.anchors.getRelatedEvidence(caseId, anchorId);
    if (r.success) setExpandedData(r);
    loadData();
  }

  async function handleLinkActor(anchorId, actorId, role) {
    await window.api.anchors.linkActor(caseId, anchorId, actorId, role);
    const r = await window.api.anchors.getRelatedEvidence(caseId, anchorId);
    if (r.success) setExpandedData(r);
    loadData();
  }

  async function handleUnlinkActor(anchorId, actorId) {
    await window.api.anchors.unlinkActor(caseId, anchorId, actorId);
    const r = await window.api.anchors.getRelatedEvidence(caseId, anchorId);
    if (r.success) setExpandedData(r);
    loadData();
  }

  // Drag-and-drop reorder
  function handleDragStart(e, index) {
    setDragState({ dragging: index, over: null });
    e.dataTransfer.effectAllowed = 'move';
  }
  function handleDragOver(e, index) {
    e.preventDefault();
    if (dragState.dragging !== index) setDragState(prev => ({ ...prev, over: index }));
  }
  async function handleDrop(e, index) {
    e.preventDefault();
    const fromIndex = dragState.dragging;
    if (fromIndex === null || fromIndex === index) { setDragState({ dragging: null, over: null }); return; }
    const reordered = [...sortedAnchors];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(index, 0, moved);
    // Update sort_order in local state so useMemo keeps the new order
    const withOrder = reordered.map((a, i) => ({ ...a, sort_order: i }));
    setSortMode('manual');
    setAnchors(withOrder);
    setDragState({ dragging: null, over: null });
    await window.api.anchors.reorder(caseId, withOrder.map(a => a.id));
  }
  function handleDragEnd() { setDragState({ dragging: null, over: null }); }

  // Group anchor docs for display
  function getEvidenceSummary(anchor) {
    const docs = anchor.documents || [];
    const incs = anchor.incidents || [];
    const groups = {};
    let ungrouped = 0;
    docs.forEach(d => {
      if (d.group_id) {
        groups[d.group_id] = (groups[d.group_id] || 0) + 1;
      } else {
        ungrouped++;
      }
    });
    const groupCount = Object.keys(groups).length;
    const docCount = ungrouped + groupCount;
    const parts = [];
    if (docCount > 0) parts.push(`${docCount} doc${docCount !== 1 ? 's' : ''}`);
    if (incs.length > 0) parts.push(`${incs.length} incident${incs.length !== 1 ? 's' : ''}`);
    return parts.join(' \u00B7 ');
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
          <span style={{ fontSize: '20px' }}>{'\u{1F465}'}</span>
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

      {/* Date error toast */}
      {dateError && (
        <div style={styles.dateErrorToast}>{dateError}</div>
      )}

      {/* Step 4: Duplicate actors banner */}
      {duplicateActors.length > 0 && !showDuplicates && (
        <div style={styles.duplicateBanner}>
          <span>{'\u26A0\uFE0F'} {duplicateActors.length} possible duplicate actor{duplicateActors.length !== 1 ? 's' : ''} found</span>
          <button style={styles.duplicateReviewBtn} onClick={() => setShowDuplicates(true)}>Review</button>
        </div>
      )}

      {/* Step 4: Duplicate resolution panel */}
      {showDuplicates && duplicateActors.length > 0 && (
        <DuplicateResolutionPanel
          duplicates={duplicateActors}
          onMerge={async (keepId, mergeId) => {
            await window.api.actors.merge(keepId, mergeId);
            setDuplicateActors(prev => prev.filter(d =>
              !(d.actor1.id === keepId && d.actor2.id === mergeId) &&
              !(d.actor1.id === mergeId && d.actor2.id === keepId)
            ));
            loadData();
          }}
          onSkip={(actor1Id, actor2Id) => {
            setDuplicateActors(prev => prev.filter(d =>
              !(d.actor1.id === actor1Id && d.actor2.id === actor2Id)
            ));
          }}
          onClose={() => { setShowDuplicates(false); setDuplicateActors([]); }}
        />
      )}

      {/* Precedent Detail Modal */}
      {precedentDetail && (
        <PrecedentDetailModal
          precedent={precedentDetail}
          onClose={() => setPrecedentDetail(null)}
        />
      )}

      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Case Narrative</h1>
          <p style={styles.subtitle}>
            {sortedAnchors.length} anchor point{sortedAnchors.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div style={styles.headerActions}>
          {/* Sort mode toggle */}
          <div style={styles.sortToggle}>
            <button
              style={{
                ...styles.sortToggleBtn,
                ...(sortMode === 'chronological' ? styles.sortToggleBtnActive : {})
              }}
              onClick={() => setSortMode('chronological')}
              title="Sort anchors by date (chronological order)"
            >
              {'\uD83D\uDCC5'} By Date
            </button>
            <button
              style={{
                ...styles.sortToggleBtn,
                ...(sortMode === 'manual' ? styles.sortToggleBtnActive : {})
              }}
              onClick={() => setSortMode('manual')}
              title="Sort anchors by manual drag order"
            >
              {'\u2630'} Manual
            </button>
          </div>
          <button style={styles.ghostBtn} onClick={handleRescan}
            onMouseEnter={e => e.target.style.background = '#F3F4F6'}
            onMouseLeave={e => e.target.style.background = 'transparent'}
          >
            {'\u{1F504}'} Rescan
          </button>
          <button style={styles.primaryBtn} onClick={() => setShowAddForm(!showAddForm)}
            onMouseEnter={e => e.target.style.background = colors.primaryHover}
            onMouseLeave={e => e.target.style.background = colors.primary}
          >
            + Add Anchor
          </button>
        </div>
      </div>

      <div style={styles.mainRow}>
      <div style={{ ...styles.content, flex: 1, minWidth: 0 }}>
        {/* Add Anchor Form */}
        {showAddForm && (
          <div style={styles.card}>
            <div style={{ ...styles.cardAccent, background: `linear-gradient(180deg, ${colors.primary}, #8B5CF6)` }} />
            <div style={styles.cardBody}>
              <h3 style={styles.cardTitle}>New Anchor Point</h3>
              <div style={styles.formGrid}>
                <div style={styles.formField}>
                  <label style={styles.label}>Title</label>
                  <input value={newAnchor.title} onChange={e => setNewAnchor({ ...newAnchor, title: e.target.value })}
                    style={styles.input} placeholder="What happened?" autoFocus
                    onKeyDown={e => e.key === 'Enter' && handleAddAnchor()} />
                </div>
                <div style={styles.formField}>
                  <label style={styles.label}>Type</label>
                  <select value={newAnchor.type} onChange={e => setNewAnchor({ ...newAnchor, type: e.target.value })} style={styles.select}>
                    {ANCHOR_TYPES.map(t => (
                      <option key={t} value={t} title={ANCHOR_TYPE_GLOSSARY[t]} style={{ background: '#fff', color: '#1a1a1a' }}>{t.replace('_', ' ')}</option>
                    ))}
                  </select>
                </div>
                <div style={styles.formField}>
                  <label style={styles.label}>Date (optional)</label>
                  <input type="date" value={newAnchor.date} max={TODAY_ISO}
                    onChange={e => setNewAnchor({ ...newAnchor, date: e.target.value })}
                    style={styles.dateInput} />
                </div>
                <div style={{ ...styles.formField, flex: '1 1 100%' }}>
                  <label style={styles.label}>Description</label>
                  <input value={newAnchor.description} onChange={e => setNewAnchor({ ...newAnchor, description: e.target.value })}
                    style={styles.input} placeholder="Brief description (optional)" />
                </div>
              </div>
              <div style={styles.formActions}>
                <button style={styles.cancelBtn} onClick={() => setShowAddForm(false)}>Cancel</button>
                <button style={{ ...styles.saveBtn, opacity: newAnchor.title.trim() ? 1 : 0.5 }}
                  onClick={handleAddAnchor} disabled={!newAnchor.title.trim()}>Add Anchor</button>
              </div>
            </div>
          </div>
        )}

        {/* Your Story Section */}
        <div style={styles.storyCard}>
          <div style={styles.storyHeader}>
            <h2 style={styles.sectionTitle}>{'\u{1F4D6}'} Your Story</h2>
            {!editingContext ? (
              <button style={styles.ghostBtn} onClick={() => setEditingContext(true)}>{'\u270F\uFE0F'} Edit</button>
            ) : (
              <div style={{ display: 'flex', gap: spacing.sm }}>
                <button style={styles.cancelBtn} onClick={() => setEditingContext(false)}>Cancel</button>
                <button style={styles.saveBtn} onClick={handleSaveContext}>Save & Scan</button>
              </div>
            )}
          </div>
          {editingContext ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
              <div>
                <label style={styles.label}>Start Date</label>
                <input type="date" value={hireDateDraft} max={TODAY_ISO}
                  onChange={e => setHireDateDraft(e.target.value)} style={styles.dateInput} />
              </div>
              <div>
                <label style={styles.label}>Tell your story</label>
                <textarea value={contextDraft} onChange={e => setContextDraft(e.target.value)}
                  style={styles.narrativeTextarea} rows={8}
                  placeholder="Describe what happened... Include dates, names, and key events." />
              </div>
              <p style={styles.hint}>{'\u{1F4A1}'} Include dates and key moments. Names trigger automatic actor detection.</p>
            </div>
          ) : (
            <div>
              {context?.narrative ? (
                <p style={styles.narrativeText}>
                  {context.narrative.length > 400 ? context.narrative.slice(0, 400) + '...' : context.narrative}
                </p>
              ) : (
                <p style={styles.emptyText}>No story added yet. Click Edit to describe what happened.</p>
              )}
              {context?.hire_date && (
                <p style={styles.hireDateText}>
                  {'\u{1F4C5}'} Employment started: {new Date(context.hire_date + 'T00:00:00').toLocaleDateString()}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Anchors Timeline */}
        <div style={styles.timelineSection}>
          {sortedAnchors.length === 0 ? (
            <div style={styles.emptyState}>
              <div style={{ fontSize: '48px', marginBottom: spacing.md }}>{'\u{1F4CD}'}</div>
              <h3 style={{ fontSize: '18px', fontWeight: 600, color: colors.textPrimary, margin: 0 }}>No anchor points yet</h3>
              <p style={{ fontSize: '14px', color: colors.textMuted, margin: `${spacing.sm} 0 ${spacing.md} 0` }}>
                Add your story above, or click "Add Anchor" to create one manually.
              </p>
              <button style={styles.primaryBtn} onClick={() => setEditingContext(true)}>Write Your Story</button>
            </div>
          ) : (
            <div style={styles.timeline}>
              {/* Clean vertical line */}
              <div style={styles.timelineLine}>
                {sortedAnchors.map((a, i) => (
                  <div key={a.id} style={{
                    position: 'absolute',
                    top: `${24 + i * 140}px`,
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: '8px', height: '8px', borderRadius: '50%',
                    background: ANCHOR_COLORS[a.anchor_type] || '#6B7280',
                    border: '1.5px solid #FFFFFF',
                    boxShadow: '0 0 0 1px #E8E4DF',
                    zIndex: 1
                  }} />
                ))}
              </div>

              {/* Anchor cards */}
              {sortedAnchors.map((anchor, index) => {
                const color = ANCHOR_COLORS[anchor.anchor_type] || '#6B7280';
                const summary = getEvidenceSummary(anchor);
                const isAdverseAction = anchor.anchor_type === 'ADVERSE_ACTION';
                const directionLabel = isAdverseAction
                  ? (anchor.action_direction === 'toward_offender' ? 'Against Offender' : 'Against Me')
                  : null;
                const accentColor = isAdverseAction && anchor.action_direction === 'toward_offender'
                  ? '#D97706' : color;

                return (
                  <div key={anchor.id}
                    draggable onDragStart={e => handleDragStart(e, index)}
                    onDragOver={e => handleDragOver(e, index)}
                    onDrop={e => handleDrop(e, index)} onDragEnd={handleDragEnd}
                    onClick={() => handleExpandAnchor(anchor)}
                    style={{
                      ...styles.anchorCard,
                      borderLeft: `3px solid ${accentColor}`,
                      opacity: dragState.dragging === index ? 0.4 : 1,
                      borderTop: dragState.over === index ? `2px solid ${colors.primary}` : '2px solid transparent',
                      ...(expandedAnchor === anchor.id ? {
                        borderRight: `1px solid ${accentColor}`,
                        borderBottom: `1px solid ${accentColor}`,
                        borderTop: `2px solid ${accentColor}`,
                        boxShadow: `0 0 0 2px ${accentColor}20`,
                      } : {})
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.boxShadow = expandedAnchor === anchor.id
                        ? `0 0 0 2px ${accentColor}20` : '0 4px 12px rgba(0,0,0,0.08)';
                      e.currentTarget.style.transform = 'translateY(-1px)';
                      e.currentTarget.querySelectorAll('.hover-action').forEach(b => b.style.opacity = '1');
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.boxShadow = expandedAnchor === anchor.id
                        ? `0 0 0 2px ${accentColor}20` : 'none';
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.querySelectorAll('.hover-action').forEach(b => b.style.opacity = '0');
                    }}
                  >

                    <div style={{ ...styles.anchorCardBody, padding: '12px 16px' }}>
                      {/* Top row */}
                      <div style={styles.anchorCardTop}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
                          <span style={{ fontSize: '14px' }}>{ANCHOR_ICONS[anchor.anchor_type] || '\u{1F4CC}'}</span>
                          <span style={{ ...styles.typeBadge, background: color + '14', color }}
                            title={ANCHOR_TYPE_GLOSSARY[anchor.anchor_type]}>
                            {anchor.anchor_type.replace('_', ' ')}
                          </span>
                          {directionLabel && (
                            <span style={{
                              ...styles.typeBadge,
                              background: anchor.action_direction === 'toward_offender' ? '#FFFBEB' : '#FEF2F2',
                              color: anchor.action_direction === 'toward_offender' ? '#B45309' : '#DC2626',
                              fontSize: '10px'
                            }}>
                              {directionLabel}
                            </span>
                          )}
                          {anchor.is_auto_generated && !anchor.user_edited && (
                            <span style={styles.mutedBadge}>Auto</span>
                          )}
                          {anchor.contains_multiple_events ? (
                            <span style={styles.warnBadge} title="Contains multiple events">{'\u{1F500}'} {anchor.event_count || '2+'}</span>
                          ) : null}
                        </div>
                        <div style={{ display: 'flex', gap: '2px' }}>
                          <button className="hover-action" style={styles.hoverIconBtn}
                            onClick={e => { e.stopPropagation(); handleClone(anchor.id); }} title="Clone">{'\u{1F4CB}'}</button>
                          <button className="hover-action" style={styles.hoverIconBtn}
                            onClick={e => { e.stopPropagation(); handleDeleteAnchor(anchor.id); }} title="Delete">{'\u{1F5D1}'}</button>
                        </div>
                      </div>

                      {/* Title */}
                      <h3 style={styles.anchorTitle} onClick={e => { e.stopPropagation(); handleExpandAnchor(anchor); }}>
                        {anchor.title}
                      </h3>

                      {/* Date */}
                      {anchor.anchor_date && (
                        <div style={styles.anchorDate}>
                          {'\u{1F4C5}'} {new Date(anchor.anchor_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          {anchor.date_confidence && anchor.date_confidence !== 'exact' && (
                            <span style={styles.confidenceBadge}>~{anchor.date_confidence}</span>
                          )}
                        </div>
                      )}

                      {/* Description */}
                      {anchor.description && (
                        <p style={styles.anchorDescription}>
                          {anchor.description.slice(0, 120)}{anchor.description.length > 120 ? '...' : ''}
                        </p>
                      )}

                      {/* Bottom row */}
                      <div style={styles.anchorCardBottom}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {summary && <span style={styles.evidenceSummaryText}>{summary}</span>}
                          {/* Step 6: Recap indicator */}
                          {anchor.documents?.some(d => d.is_recap) && (
                            <span style={styles.recapBadge}>RECAP</span>
                          )}
                        </div>

                        {/* Clickable precedent badges */}
                        {anchor.precedents?.length > 0 && (
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                            {anchor.precedents.slice(0, 3).map(p => {
                              const info = PRECEDENT_CATALOG.find(c => c.id === p.precedent_id);
                              if (!info) return null;
                              return (
                                <span key={p.precedent_id} style={styles.precedentBadgeClickable}
                                  onClick={e => { e.stopPropagation(); setPrecedentDetail(info); }}
                                  title={info.name}>
                                  {'\u2696\uFE0F'} {info.shortName || p.precedent_id}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Expand button */}
                      <button style={styles.expandBtn} onClick={e => { e.stopPropagation(); handleExpandAnchor(anchor); }}>
                        {expandedAnchor === anchor.id ? 'Close \u25B2' : 'Details \u25BC'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Step 7: Side-by-side spoke panel */}
      {expandedAnchor && expandedData && (() => {
        const idx = sortedAnchors.findIndex(a => a.id === expandedAnchor);
        const hasPrev = idx > 0;
        const hasNext = idx < sortedAnchors.length - 1;
        return (
        <div style={styles.spokePanel}>
          <AnchorSpokes
            anchor={expandedData.anchor}
            linked={expandedData.linked}
            nearby={expandedData.nearby}
            documents={documents}
            incidents={incidents}
            allActors={allActors}
            caseId={caseId}
            onClose={() => { expandedAnchorRef.current = null; setExpandedAnchor(null); setExpandedData(null); }}
            onUpdate={updates => handleUpdateAnchor(expandedAnchor, updates)}
            onLinkEvidence={docId => handleLinkEvidence(expandedAnchor, docId)}
            onUnlinkEvidence={docId => handleUnlinkEvidence(expandedAnchor, docId)}
            onLinkIncident={incId => handleLinkIncident(expandedAnchor, incId)}
            onLinkPrecedent={precId => handleLinkPrecedent(expandedAnchor, precId)}
            onUnlinkPrecedent={precId => handleUnlinkPrecedent(expandedAnchor, precId)}
            onLinkActor={(actorId, role) => handleLinkActor(expandedAnchor, actorId, role)}
            onUnlinkActor={actorId => handleUnlinkActor(expandedAnchor, actorId)}
            onBreakApart={() => handleBreakApart(expandedAnchor)}
            onClone={() => handleClone(expandedAnchor)}
            onDelete={() => handleDeleteAnchor(expandedAnchor)}
            onPrecedentClick={prec => setPrecedentDetail(prec)}
            onPrev={hasPrev ? () => handleExpandAnchor(sortedAnchors[idx - 1]) : null}
            onNext={hasNext ? () => handleExpandAnchor(sortedAnchors[idx + 1]) : null}
            anchorIndex={idx}
            anchorCount={sortedAnchors.length}
          />
        </div>
        );
      })()}
      </div>
    </div>
  );
}

// ===== Spoke Panel Component =====

function AnchorSpokes({
  anchor, linked, nearby, documents, incidents, allActors, caseId,
  onClose, onUpdate, onLinkEvidence, onUnlinkEvidence,
  onLinkIncident, onLinkPrecedent, onUnlinkPrecedent,
  onLinkActor, onUnlinkActor,
  onBreakApart, onClone, onDelete, onPrecedentClick,
  onPrev, onNext, anchorIndex, anchorCount
}) {
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState(() => ({
    title: anchor.title || '',
    type: anchor.anchor_type || 'MILESTONE',
    date: anchor.anchor_date || '',
    dateConfidence: anchor.date_confidence || 'exact',
    whatHappened: anchor.what_happened || '',
    where: anchor.where_location || '',
    impact: anchor.impact_summary || '',
    actionDirection: anchor.action_direction || 'toward_me'
  }));

  // Sync editData when anchor prop changes (e.g. after save + reload)
  React.useEffect(() => {
    setEditData({
      title: anchor.title || '',
      type: anchor.anchor_type || 'MILESTONE',
      date: anchor.anchor_date || '',
      dateConfidence: anchor.date_confidence || 'exact',
      whatHappened: anchor.what_happened || '',
      where: anchor.where_location || '',
      impact: anchor.impact_summary || '',
      actionDirection: anchor.action_direction || 'toward_me'
    });
  }, [anchor.id, anchor.anchor_type, anchor.title, anchor.anchor_date, anchor.what_happened]);
  const [showAddEvidence, setShowAddEvidence] = useState(false);
  const [showAddIncident, setShowAddIncident] = useState(false);
  const [showAddPrecedent, setShowAddPrecedent] = useState(false);
  const [showAddActor, setShowAddActor] = useState(false);
  const [expandedDoc, setExpandedDoc] = useState(null);
  const [docEditName, setDocEditName] = useState('');
  const [docEditType, setDocEditType] = useState('');
  const [confirmUnlinkActor, setConfirmUnlinkActor] = useState(null);
  const [evidenceFilter, setEvidenceFilter] = useState('');

  const accentColor = ANCHOR_COLORS[anchor.anchor_type] || '#6B7280';

  function handleSave() {
    onUpdate(editData);
    setEditing(false);
  }

  // Filter helpers
  const linkedDocIds = new Set((linked.documents || []).map(d => d.id));
  const availableDocs = documents.filter(d => !linkedDocIds.has(d.id));
  const filteredAvailableDocs = evidenceFilter
    ? availableDocs.filter(d => d.filename.toLowerCase().includes(evidenceFilter.toLowerCase()) || (d.evidence_type || '').toLowerCase().includes(evidenceFilter.toLowerCase()))
    : availableDocs;
  const linkedIncIds = new Set((linked.incidents || []).map(i => i.id));
  const availableIncidents = incidents.filter(i => !linkedIncIds.has(i.id));
  const linkedPrecIds = new Set((linked.precedents || []).map(p => p.precedent_id));
  const availablePrecedents = PRECEDENT_CATALOG.filter(p => !linkedPrecIds.has(p.id));
  const linkedActorIds = new Set((linked.actors || []).map(a => a.id));
  const availableActors = allActors.filter(a => !linkedActorIds.has(a.id));

  // Group documents by group_id
  function groupDocuments(docs) {
    const groups = {};
    const ungrouped = [];
    (docs || []).forEach(d => {
      if (d.group_id) {
        if (!groups[d.group_id]) groups[d.group_id] = [];
        groups[d.group_id].push(d);
      } else {
        ungrouped.push(d);
      }
    });
    return { groups, ungrouped };
  }

  const { groups: docGroups, ungrouped: ungroupedDocs } = groupDocuments(linked.documents);

  async function handleExpandDoc(doc) {
    if (expandedDoc === doc.id) { setExpandedDoc(null); return; }
    setExpandedDoc(doc.id);
    setDocEditName(doc.filename);
    setDocEditType(doc.evidence_type || 'CONTEXT');
  }

  async function handleRenameDoc(docId) {
    if (docEditName.trim()) {
      await window.api.documents.rename(docId, docEditName.trim());
    }
  }

  async function handleReclassifyDoc(docId, newType) {
    setDocEditType(newType);
    await window.api.documents.updateType(docId, newType);
  }

  const isAdverseAction = anchor.anchor_type === 'ADVERSE_ACTION';

  return (
    <div style={styles.spokePanelInner}>
      {/* Header */}
      <div style={styles.spokeHeader}>
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
          <span style={{ fontSize: '24px' }}>{ANCHOR_ICONS[anchor.anchor_type] || '\u{1F4CC}'}</span>
          <div>
            {editing ? (
              <input value={editData.title}
                onChange={e => setEditData({ ...editData, title: e.target.value })}
                style={{ ...styles.spokeTitleInput, border: `1px solid ${accentColor}` }} />
            ) : (
              <h3 style={styles.spokeTitle}>{anchor.title}</h3>
            )}
            <span style={{ ...styles.typeBadge, background: accentColor + '14', color: accentColor, marginTop: '4px', display: 'inline-block' }}
              title={ANCHOR_TYPE_GLOSSARY[anchor.anchor_type]}>
              {anchor.anchor_type.replace('_', ' ')}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button style={{ ...styles.navBtn, opacity: onPrev ? 1 : 0.3 }}
            onClick={onPrev} disabled={!onPrev} title="Previous anchor">{'\u25C0'}</button>
          <span style={{ fontSize: '11px', color: '#9CA3AF', minWidth: '32px', textAlign: 'center' }}>
            {anchorIndex + 1}/{anchorCount}
          </span>
          <button style={{ ...styles.navBtn, opacity: onNext ? 1 : 0.3 }}
            onClick={onNext} disabled={!onNext} title="Next anchor">{'\u25B6'}</button>
          <button style={styles.closeBtn} onClick={onClose}>{'\u00D7'}</button>
        </div>
      </div>

      <div style={styles.spokeBody}>
        {/* Type + Date */}
        <div style={styles.spokeSection}>
          <div style={{ display: 'flex', gap: spacing.lg }}>
            <div style={{ flex: 1 }}>
              <div style={styles.sectionLabel}>
                <span style={{ fontSize: '13px' }}>{'\u{1F3F7}\uFE0F'}</span> Type
              </div>
              {editing ? (
                <select value={editData.type}
                  onChange={e => setEditData({ ...editData, type: e.target.value })}
                  style={styles.select}>
                  {ANCHOR_TYPES.map(t => (
                    <option key={t} value={t} title={ANCHOR_TYPE_GLOSSARY[t]} style={{ background: '#fff', color: '#1a1a1a' }}>{t.replace('_', ' ')}</option>
                  ))}
                </select>
              ) : (
                <span style={{ ...styles.typeBadgeLarge, background: accentColor + '14', color: accentColor }}
                  title={ANCHOR_TYPE_GLOSSARY[anchor.anchor_type]}>
                  {anchor.anchor_type.replace('_', ' ')}
                </span>
              )}
            </div>
            <div style={{ flex: 1 }}>
              <div style={styles.sectionLabel}>
                <span style={{ fontSize: '13px' }}>{'\u{1F4C5}'}</span> Date
              </div>
              {editing ? (
                <div style={{ display: 'flex', gap: spacing.sm }}>
                  <input type="date" value={editData.date} max={TODAY_ISO}
                    onChange={e => setEditData({ ...editData, date: e.target.value })}
                    style={{ ...styles.input, flex: 1 }} />
                  <select value={editData.dateConfidence}
                    onChange={e => setEditData({ ...editData, dateConfidence: e.target.value })}
                    style={{ ...styles.select, width: '100px', fontSize: '11px' }}>
                    <option value="exact">Exact</option>
                    <option value="approximate">Approx</option>
                    <option value="relative">Relative</option>
                    <option value="unknown">Unknown</option>
                  </select>
                </div>
              ) : (
                <p style={styles.spokeText}>
                  {anchor.anchor_date
                    ? new Date(anchor.anchor_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
                    : 'Date unknown'}
                  {anchor.date_confidence && anchor.date_confidence !== 'exact' && (
                    <span style={styles.confidenceBadge}> ~{anchor.date_confidence}</span>
                  )}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Direction toggle for ADVERSE_ACTION */}
        {isAdverseAction && (
          <div style={styles.spokeSection}>
            <div style={styles.sectionLabel}>
              <span style={{ fontSize: '13px' }}>{'\u{1F3AF}'}</span> Direction
            </div>
            {editing ? (
              <div style={{ display: 'flex', gap: spacing.sm }}>
                {['toward_me', 'toward_offender'].map(dir => (
                  <label key={dir} style={{
                    ...styles.radioLabel,
                    background: editData.actionDirection === dir ? (dir === 'toward_me' ? '#FEF2F2' : '#FFFBEB') : '#F9FAFB',
                    border: `1px solid ${editData.actionDirection === dir ? (dir === 'toward_me' ? '#FCA5A5' : '#FDE68A') : '#E8E4DF'}`
                  }}>
                    <input type="radio" name="direction" value={dir} checked={editData.actionDirection === dir}
                      onChange={e => setEditData({ ...editData, actionDirection: e.target.value })}
                      style={{ display: 'none' }} />
                    {dir === 'toward_me' ? 'Against Me' : 'Against Offender'}
                  </label>
                ))}
              </div>
            ) : (
              <span style={{
                ...styles.typeBadge,
                background: anchor.action_direction === 'toward_offender' ? '#FFFBEB' : '#FEF2F2',
                color: anchor.action_direction === 'toward_offender' ? '#B45309' : '#DC2626'
              }}>
                {anchor.action_direction === 'toward_offender' ? 'Against Offender' : 'Against Me'}
              </span>
            )}
          </div>
        )}

        {/* What Happened */}
        <div style={styles.spokeSection}>
          <div style={styles.sectionLabel}><span style={{ fontSize: '13px' }}>{'\u{1F4DD}'}</span> What Happened</div>
          {editing ? (
            <textarea value={editData.whatHappened}
              onChange={e => setEditData({ ...editData, whatHappened: e.target.value })}
              style={styles.spokeTextarea} rows={4} />
          ) : (
            <p style={styles.spokeText}>{anchor.what_happened || anchor.description || 'No description'}</p>
          )}
        </div>

        {/* Who Was Involved — with add/remove */}
        <div style={styles.spokeSection}>
          <div style={styles.sectionLabelRow}>
            <div style={styles.sectionLabel}><span style={{ fontSize: '13px' }}>{'\u{1F465}'}</span> Who Was Involved ({linked.actors?.length || 0})</div>
            <button style={styles.addSmallBtn} onClick={() => setShowAddActor(!showAddActor)}>
              {showAddActor ? 'Cancel' : '+ Add Person'}
            </button>
          </div>

          {linked.actors?.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing.sm }}>
              {linked.actors.map(actor => {
                const secondaries = actor.secondary_classifications ? JSON.parse(actor.secondary_classifications) : [];
                return (
                  <div key={actor.id} style={{ position: 'relative' }}>
                    <div style={styles.actorChip} title={CLASSIFICATION_GLOSSARY[actor.classification] || ''}>
                      <span style={{ ...styles.actorDot, background: getClassificationColor(actor.classification) }} />
                      {secondaries.map((sc, i) => (
                        <span key={i} style={{ ...styles.actorDotSmall, background: getClassificationColor(sc) }} />
                      ))}
                      {actor.name}
                      {actor.role_in_anchor && <span style={styles.actorRole}>({actor.role_in_anchor})</span>}
                      <button style={styles.chipRemoveBtn}
                        onClick={() => setConfirmUnlinkActor(actor.id)}>{'\u00D7'}</button>
                    </div>
                    {/* Confirm unlink inline */}
                    {confirmUnlinkActor === actor.id && (
                      <div style={styles.confirmBanner}>
                        Remove {actor.name}?
                        <button style={styles.confirmYes} onClick={() => { onUnlinkActor(actor.id); setConfirmUnlinkActor(null); }}>Yes</button>
                        <button style={styles.confirmNo} onClick={() => setConfirmUnlinkActor(null)}>Cancel</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p style={styles.emptyInline}>No people linked</p>
          )}

          {showAddActor && availableActors.length > 0 && (
            <div style={styles.dropdown}>
              {availableActors.map(actor => (
                <div key={actor.id} style={styles.dropdownItem}
                  onClick={() => { onLinkActor(actor.id, 'involved'); setShowAddActor(false); }}>
                  <span style={{ ...styles.actorDot, background: getClassificationColor(actor.classification) }} />
                  <span style={{ flex: 1 }}>{actor.name}</span>
                  <span style={{ fontSize: '10px', color: colors.textMuted }}>{actor.classification}</span>
                </div>
              ))}
            </div>
          )}
          {showAddActor && availableActors.length === 0 && (
            <p style={styles.emptyInline}>No people available. Add them on the People page.</p>
          )}
        </div>

        {/* Where */}
        <div style={styles.spokeSection}>
          <div style={styles.sectionLabel}><span style={{ fontSize: '13px' }}>{'\u{1F4CD}'}</span> Where</div>
          {editing ? (
            <input value={editData.where}
              onChange={e => setEditData({ ...editData, where: e.target.value })}
              style={styles.input} placeholder="Location or context" />
          ) : (
            <p style={styles.spokeText}>{anchor.where_location || 'Not specified'}</p>
          )}
        </div>

        {/* Impact */}
        <div style={styles.spokeSection}>
          <div style={styles.sectionLabel}><span style={{ fontSize: '13px' }}>{'\u{1F4A5}'}</span> Impact</div>
          {editing ? (
            <textarea value={editData.impact}
              onChange={e => setEditData({ ...editData, impact: e.target.value })}
              style={styles.spokeTextarea} rows={2} placeholder="How did this affect you?" />
          ) : (
            <p style={styles.spokeText}>{anchor.impact_summary || 'Impact not documented'}</p>
          )}
          {anchor.severity && (
            <span style={{
              ...styles.typeBadge, marginTop: spacing.sm, display: 'inline-block',
              background: getSeverityColor(anchor.severity) + '20',
              color: getSeverityColor(anchor.severity)
            }}>
              {anchor.severity}
            </span>
          )}
        </div>

        {/* Evidence Section — with preview/rename/classify + grouping */}
        <div style={styles.spokeSection}>
          <div style={styles.sectionLabelRow}>
            <div style={styles.sectionLabel}>
              <span style={{ fontSize: '13px' }}>{'\u{1F4CE}'}</span> Evidence ({linked.documents?.length || 0})
            </div>
            <button style={styles.addSmallBtn} onClick={() => setShowAddEvidence(!showAddEvidence)}>
              {showAddEvidence ? 'Cancel' : '+ Add'}
            </button>
          </div>

          {/* Grouped documents */}
          {Object.entries(docGroups).map(([groupId, groupDocs]) => (
            <div key={groupId} style={styles.groupedEvidence}>
              <div style={styles.groupHeader}>
                {'\u{1F4C4}'} Group ({groupDocs.length} pages)
              </div>
              {groupDocs.map(doc => (
                <EvidenceItem key={doc.id} doc={doc}
                  expanded={expandedDoc === doc.id}
                  onToggle={() => handleExpandDoc(doc)}
                  onUnlink={() => onUnlinkEvidence(doc.id)}
                  editName={docEditName} onEditName={setDocEditName}
                  onRename={() => handleRenameDoc(doc.id)}
                  editType={docEditType} onReclassify={t => handleReclassifyDoc(doc.id, t)} />
              ))}
            </div>
          ))}

          {/* Ungrouped documents */}
          {ungroupedDocs.map(doc => (
            <EvidenceItem key={doc.id} doc={doc}
              expanded={expandedDoc === doc.id}
              onToggle={() => handleExpandDoc(doc)}
              onUnlink={() => onUnlinkEvidence(doc.id)}
              editName={docEditName} onEditName={setDocEditName}
              onRename={() => handleRenameDoc(doc.id)}
              editType={docEditType} onReclassify={t => handleReclassifyDoc(doc.id, t)} />
          ))}

          {/* Add evidence dropdown */}
          {showAddEvidence && (
            <div style={styles.dropdown}>
              <input value={evidenceFilter} onChange={e => setEvidenceFilter(e.target.value)}
                style={{ ...styles.input, width: '100%', boxSizing: 'border-box', marginBottom: '4px', fontSize: '11px' }}
                placeholder="Search documents..." />
              {filteredAvailableDocs.length > 0 ? (
                filteredAvailableDocs.slice(0, 10).map(doc => (
                  <div key={doc.id} style={styles.dropdownItem}
                    onClick={() => { onLinkEvidence(doc.id); setShowAddEvidence(false); setEvidenceFilter(''); }}>
                    <span style={{ ...styles.evidenceTypeDot, background: getEvidenceColor(doc.evidence_type) }} />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.filename}</span>
                    <span style={{ fontSize: '10px', color: colors.textMuted }}
                      title={EVIDENCE_TYPE_GLOSSARY[doc.evidence_type]}>{doc.evidence_type}</span>
                  </div>
                ))
              ) : (
                <p style={styles.emptyInline}>No documents available</p>
              )}
            </div>
          )}

          {/* Nearby evidence */}
          {nearby.documents?.length > 0 && (
            <div style={styles.nearbySection}>
              <div style={styles.nearbyLabel}>Nearby evidence (within 14 days):</div>
              {nearby.documents.slice(0, 3).map(doc => (
                <div key={doc.id} style={styles.nearbyItem} onClick={() => onLinkEvidence(doc.id)}>
                  + {doc.filename}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Incidents */}
        <div style={styles.spokeSection}>
          <div style={styles.sectionLabelRow}>
            <div style={styles.sectionLabel}>
              <span style={{ fontSize: '13px' }}>{'\u{1F6A8}'}</span> Incidents ({linked.incidents?.length || 0})
            </div>
            <button style={styles.addSmallBtn} onClick={() => setShowAddIncident(!showAddIncident)}>
              {showAddIncident ? 'Cancel' : '+ Add'}
            </button>
          </div>
          {linked.incidents?.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {linked.incidents.map(inc => (
                <div key={inc.id} style={styles.evidenceRow}>
                  <span style={{ ...styles.evidenceTypeDot, background: getSeverityColor(inc.computed_severity || inc.base_severity) }} />
                  <span style={styles.evidenceFileName}>{inc.title}</span>
                  <span style={styles.evidenceTypeLabel}>{inc.incident_type}</span>
                </div>
              ))}
            </div>
          )}
          {showAddIncident && availableIncidents.length > 0 && (
            <div style={styles.dropdown}>
              {availableIncidents.slice(0, 8).map(inc => (
                <div key={inc.id} style={styles.dropdownItem}
                  onClick={() => { onLinkIncident(inc.id); setShowAddIncident(false); }}>
                  <span style={styles.evidenceFileName}>{inc.title}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Precedents — clickable */}
        <div style={styles.spokeSection}>
          <div style={styles.sectionLabelRow}>
            <div style={styles.sectionLabel}>
              <span style={{ fontSize: '13px' }}>{'\u2696\uFE0F'}</span> Precedents ({linked.precedents?.length || 0})
            </div>
            <button style={styles.addSmallBtn} onClick={() => setShowAddPrecedent(!showAddPrecedent)}>
              {showAddPrecedent ? 'Cancel' : '+ Link'}
            </button>
          </div>
          {linked.precedents?.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {linked.precedents.map(p => {
                const info = PRECEDENT_CATALOG.find(c => c.id === p.precedent_id);
                return (
                  <div key={p.precedent_id} style={styles.precedentRow}>
                    <span style={{ fontSize: '14px', flexShrink: 0 }}>{'\u2696\uFE0F'}</span>
                    <div style={{ flex: 1, cursor: info ? 'pointer' : 'default' }} onClick={() => info && onPrecedentClick(info)}>
                      <span style={styles.precedentName}>{info?.name || p.precedent_id}</span>
                      {p.relevance_note && <span style={styles.precedentNote}>{p.relevance_note}</span>}
                    </div>
                    <button style={styles.removeBtn} onClick={() => onUnlinkPrecedent(p.precedent_id)}>{'\u00D7'}</button>
                  </div>
                );
              })}
            </div>
          )}
          {showAddPrecedent && availablePrecedents.length > 0 && (
            <div style={styles.dropdown}>
              {availablePrecedents.map(prec => (
                <div key={prec.id} style={styles.dropdownItem}
                  onClick={() => { onLinkPrecedent(prec.id); setShowAddPrecedent(false); }}>
                  <span style={{ fontSize: '13px' }}>{'\u2696\uFE0F'}</span>
                  <span style={styles.evidenceFileName}>{prec.name}</span>
                  <span style={{ fontSize: '10px', color: '#9333EA' }}>{prec.standard}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div style={styles.spokeActions}>
          <div style={{ display: 'flex', gap: spacing.sm }}>
            {anchor.contains_multiple_events ? (
              <button style={styles.breakBtn} onClick={onBreakApart}>{'\u{1F500}'} Break Apart</button>
            ) : null}
            <button style={styles.cloneActionBtn} onClick={onClone}>{'\u{1F4CB}'} Clone</button>
            <button style={styles.deleteActionBtn} onClick={onDelete}>{'\u{1F5D1}'} Delete</button>
          </div>
          <div style={{ display: 'flex', gap: spacing.sm }}>
            {editing ? (
              <>
                <button style={styles.cancelBtn} onClick={() => setEditing(false)}>Cancel</button>
                <button style={styles.saveBtn} onClick={handleSave}>Save</button>
              </>
            ) : (
              <button style={styles.ghostBtn} onClick={() => setEditing(true)}>{'\u270F\uFE0F'} Edit Details</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ===== Evidence Item Component =====

function EvidenceItem({ doc, expanded, onToggle, onUnlink, editName, onEditName, onRename, editType, onReclassify }) {
  const [previewData, setPreviewData] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  async function handleToggle() {
    onToggle();
    if (!expanded && !previewData) {
      setLoadingPreview(true);
      try {
        const result = await window.api.documents.getContent(doc.id);
        if (result.success) setPreviewData(result);
      } catch (e) { /* ignore */ }
      setLoadingPreview(false);
    }
  }

  async function handleToggleRecap() {
    try {
      await window.api.documents.updateRecapStatus(doc.id, !doc.is_recap);
    } catch (e) { /* ignore */ }
  }

  return (
    <div style={{ marginBottom: '4px' }}>
      <div style={styles.evidenceRow}>
        <span style={{ ...styles.evidenceTypeDot, background: getEvidenceColor(doc.evidence_type) }}
          title={EVIDENCE_TYPE_GLOSSARY[doc.evidence_type]} />
        <span style={styles.evidenceFileName} onClick={handleToggle}>{doc.filename}</span>
        {/* Step 6: Recap badge */}
        {doc.is_recap && <span style={styles.recapBadge}>RECAP</span>}
        <span style={styles.evidenceTypeLabel} title={EVIDENCE_TYPE_GLOSSARY[doc.evidence_type]}>{doc.evidence_type}</span>
        <button style={styles.removeBtn} onClick={onUnlink} title="Remove link">{'\u00D7'}</button>
      </div>
      {expanded && (
        <div style={styles.evidenceExpanded}>
          <div style={{ display: 'flex', gap: spacing.sm, marginBottom: spacing.sm }}>
            <div style={{ flex: 1 }}>
              <label style={styles.label}>Filename</label>
              <input value={editName} onChange={e => onEditName(e.target.value)}
                onBlur={onRename} style={{ ...styles.input, width: '100%', boxSizing: 'border-box' }} />
            </div>
            <div style={{ width: '160px' }}>
              <label style={styles.label}>Type</label>
              <select value={editType} onChange={e => onReclassify(e.target.value)}
                style={{ ...styles.select, width: '100%' }}>
                {EVIDENCE_TYPES.map(t => (
                  <option key={t} value={t} title={EVIDENCE_TYPE_GLOSSARY[t]}>{t.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
          </div>
          {doc.document_date && (
            <p style={{ fontSize: '11px', color: colors.textMuted, margin: 0 }}>
              {'\u{1F4C5}'} {new Date(doc.document_date + 'T00:00:00').toLocaleDateString()}
            </p>
          )}
          {/* Step 6: Recap toggle */}
          <label style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, fontSize: '12px', color: colors.textSecondary, marginTop: spacing.sm, cursor: 'pointer' }}>
            <input type="checkbox" checked={!!doc.is_recap} onChange={handleToggleRecap} />
            Recap / Self-Documentation Email
          </label>
          {/* Step 5: Evidence preview */}
          {loadingPreview && (
            <div style={{ fontSize: '11px', color: colors.textMuted, marginTop: spacing.sm }}>Loading preview...</div>
          )}
          {previewData && (
            <div style={styles.evidencePreview}>
              {previewData.mimeType?.startsWith('image/') ? (
                <img src={`data:${previewData.mimeType};base64,${previewData.data}`}
                  alt={doc.filename} style={{ maxHeight: '200px', maxWidth: '100%', borderRadius: radius.sm }} />
              ) : (
                <div style={styles.textSnippet}>
                  {previewData.mimeType === 'application/pdf' && (
                    <div style={{ fontSize: '10px', color: colors.textMuted, marginBottom: '4px', fontWeight: 600 }}>PDF Document</div>
                  )}
                  {(previewData.data || previewData.text || '').slice(0, 300) || 'No preview available'}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ===== Precedent Detail Modal =====

function PrecedentDetailModal({ precedent, onClose }) {
  if (!precedent) return null;

  return (
    <div style={{ ...styles.spokeOverlay, zIndex: 200, justifyContent: 'center', alignItems: 'center' }} onClick={onClose}>
      <div style={styles.precedentModal} onClick={e => e.stopPropagation()}>
        <div style={styles.precedentModalHeader}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 600, color: colors.textPrimary, margin: 0 }}>
              {precedent.name}
            </h2>
            <p style={{ fontSize: '12px', color: colors.textMuted, margin: '4px 0 0 0' }}>
              {precedent.citation} ({precedent.year}) {'\u2014'} {precedent.court}
            </p>
          </div>
          <button style={styles.closeBtn} onClick={onClose}>{'\u00D7'}</button>
        </div>

        <div style={{ padding: spacing.lg }}>
          <span style={{
            ...styles.typeBadge, marginBottom: spacing.md, display: 'inline-block',
            background: '#F3E8FF', color: '#6B21A8'
          }}>
            {precedent.standard}
          </span>

          <p style={{ fontSize: '13px', color: colors.textPrimary, lineHeight: 1.6, margin: `0 0 ${spacing.lg} 0` }}>
            {precedent.summary}
          </p>

          <h4 style={{ fontSize: '12px', fontWeight: 600, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', margin: `0 0 ${spacing.sm} 0` }}>
            Required Elements
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {precedent.elements?.map((elem, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: spacing.sm,
                padding: `${spacing.xs} ${spacing.sm}`,
                background: '#F9FAFB', borderRadius: radius.md
              }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#D1D5DB', flexShrink: 0 }} />
                <span style={{ fontSize: '13px', color: colors.textPrimary }}>{elem}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ===== Duplicate Resolution Panel (Step 4) =====

function DuplicateResolutionPanel({ duplicates, onMerge, onSkip, onClose }) {
  if (!duplicates.length) return null;
  const pair = duplicates[0];
  return (
    <div style={styles.duplicatePanel}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
        <h3 style={{ fontSize: '14px', fontWeight: 600, color: colors.textPrimary, margin: 0 }}>
          Resolve Duplicate Actors ({duplicates.length} remaining)
        </h3>
        <button style={styles.closeBtn} onClick={onClose}>{'\u00D7'}</button>
      </div>
      <div style={{ display: 'flex', gap: spacing.md, alignItems: 'center' }}>
        <div style={styles.dupeCard}>
          <div style={{ fontWeight: 600, fontSize: '14px' }}>{pair.actor1.name}</div>
          <div style={{ fontSize: '11px', color: colors.textMuted }}>{pair.actor1.role || pair.actor1.classification || 'Unknown'}</div>
          <div style={{ fontSize: '11px', color: colors.textMuted }}>{pair.actor1.appearance_count || 0} appearances</div>
        </div>
        <span style={{ fontSize: '20px', color: colors.textMuted }}>{'='}</span>
        <div style={styles.dupeCard}>
          <div style={{ fontWeight: 600, fontSize: '14px' }}>{pair.actor2.name}</div>
          <div style={{ fontSize: '11px', color: colors.textMuted }}>{pair.actor2.role || pair.actor2.classification || 'Unknown'}</div>
          <div style={{ fontSize: '11px', color: colors.textMuted }}>{pair.actor2.appearance_count || 0} appearances</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: spacing.sm, marginTop: spacing.md, justifyContent: 'center' }}>
        <button style={styles.mergeBtn} onClick={() => onMerge(pair.actor1.id, pair.actor2.id)}>
          Merge (keep {pair.actor1.name.split(' ')[0]})
        </button>
        <button style={styles.mergeBtn} onClick={() => onMerge(pair.actor2.id, pair.actor1.id)}>
          Merge (keep {pair.actor2.name.split(' ')[0]})
        </button>
        <button style={styles.cancelBtn} onClick={() => onSkip(pair.actor1.id, pair.actor2.id)}>
          Skip
        </button>
      </div>
    </div>
  );
}

// ===== Helpers =====

function getClassificationColor(classification) {
  const map = {
    'bad_actor': '#DC2626',
    'enabler': '#F97316',
    'witness_supportive': '#16A34A',
    'witness_neutral': '#6B7280',
    'witness_hostile': '#DC2626',
    'witness_friendly': '#16A34A',
    'bystander': '#9CA3AF',
    'corroborator': '#0D9488',
    'self': '#3B82F6',
    'unknown': '#9CA3AF'
  };
  return map[classification] || '#6B7280';
}

// ===== Styles (Asana-inspired) =====

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
    width: '32px', height: '32px',
    borderRight: '3px solid #E5E7EB', borderBottom: '3px solid #E5E7EB',
    borderLeft: '3px solid #E5E7EB', borderTop: `3px solid ${colors.primary}`,
    borderRadius: '50%',
    animation: 'spin 1s linear infinite'
  },

  // Toast
  actorToast: {
    position: 'fixed', top: '20px', right: '20px',
    background: '#EFF6FF', border: '1px solid #93C5FD',
    borderRadius: radius.lg, padding: `${spacing.sm} ${spacing.md}`,
    display: 'flex', alignItems: 'center', gap: spacing.sm,
    boxShadow: shadows.lg, zIndex: 200,
    fontSize: '12px', color: '#1E40AF', maxWidth: '380px'
  },
  actorToastNames: { fontSize: '11px', color: '#3B82F6', marginTop: '2px' },
  toastClose: {
    background: 'none', border: 'none', fontSize: '18px',
    color: '#93C5FD', cursor: 'pointer', marginLeft: spacing.sm
  },
  dateErrorToast: {
    position: 'fixed', top: '20px', right: '20px',
    background: '#FEF2F2', border: '1px solid #FCA5A5',
    borderRadius: radius.lg, padding: `${spacing.sm} ${spacing.md}`,
    boxShadow: shadows.lg, zIndex: 200,
    fontSize: '13px', color: '#DC2626', fontWeight: 500
  },

  // Header (Step 8: sticky)
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: `${spacing.sm} ${spacing.xl}`,
    borderBottom: '1px solid #E8E4DF', background: '#FFFFFF',
    position: 'sticky', top: 0, zIndex: 10
  },
  title: {
    fontSize: '18px', fontWeight: 600, color: colors.textPrimary, margin: 0
  },
  // Main row for side-by-side layout (Step 7)
  mainRow: {
    display: 'flex', flex: 1, overflow: 'hidden'
  },
  subtitle: {
    fontSize: '13px', color: colors.textMuted, margin: '4px 0 0 0'
  },
  headerActions: {
    display: 'flex', gap: spacing.sm, alignItems: 'center'
  },
  sortToggle: {
    display: 'flex',
    border: `1px solid ${colors.border}`,
    borderRadius: radius.md,
    overflow: 'hidden',
    marginRight: spacing.sm
  },
  sortToggleBtn: {
    padding: `${spacing.xs} ${spacing.sm}`,
    background: 'transparent',
    border: 'none',
    fontSize: '12px',
    color: colors.textMuted,
    cursor: 'pointer',
    transition: 'all 0.15s',
    whiteSpace: 'nowrap'
  },
  sortToggleBtnActive: {
    background: colors.primary + '18',
    color: colors.primary,
    fontWeight: 600
  },

  // Buttons
  primaryBtn: {
    padding: `${spacing.sm} ${spacing.md}`,
    background: colors.primary, border: 'none', borderRadius: radius.md,
    fontSize: '13px', fontWeight: 500, color: '#FFFFFF', cursor: 'pointer',
    transition: 'background 0.15s'
  },
  ghostBtn: {
    padding: `${spacing.sm} ${spacing.md}`,
    background: 'transparent', border: '1px solid #E8E4DF', borderRadius: radius.md,
    fontSize: '13px', color: colors.textSecondary, cursor: 'pointer',
    transition: 'background 0.15s'
  },
  cancelBtn: {
    padding: `${spacing.xs} ${spacing.md}`,
    background: 'transparent', border: '1px solid #E8E4DF', borderRadius: radius.md,
    fontSize: '12px', color: colors.textSecondary, cursor: 'pointer'
  },
  saveBtn: {
    padding: `${spacing.xs} ${spacing.md}`,
    background: colors.primary, border: 'none', borderRadius: radius.md,
    fontSize: '12px', fontWeight: 500, color: '#FFFFFF', cursor: 'pointer'
  },
  addSmallBtn: {
    padding: `2px ${spacing.sm}`,
    background: '#F3F4F6', border: '1px solid #E8E4DF',
    borderRadius: radius.sm, fontSize: '11px',
    color: colors.textSecondary, cursor: 'pointer'
  },
  removeBtn: {
    background: 'none', border: 'none', fontSize: '16px',
    color: '#DC2626', cursor: 'pointer', padding: '2px 4px',
    borderRadius: radius.sm, opacity: 0.6
  },
  hoverIconBtn: {
    background: 'none', border: 'none', fontSize: '14px',
    cursor: 'pointer', padding: '4px', borderRadius: radius.sm,
    opacity: 0, transition: 'opacity 0.15s'
  },

  // Content
  content: {
    flex: 1, overflow: 'auto', padding: spacing.xl
  },

  // Cards
  card: {
    display: 'flex', background: '#FFFFFF',
    border: '1px solid #E8E4DF', borderRadius: '12px',
    marginBottom: spacing.lg, boxShadow: 'none', overflow: 'hidden'
  },
  cardAccent: {
    width: '4px', flexShrink: 0
  },
  cardBody: {
    flex: 1, padding: spacing.md
  },
  cardTitle: {
    fontSize: '14px', fontWeight: 600, color: colors.textPrimary,
    margin: `0 0 ${spacing.md} 0`
  },

  // Form
  formGrid: {
    display: 'flex', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md
  },
  formField: {
    display: 'flex', flexDirection: 'column', gap: '4px',
    flex: '1 1 140px', minWidth: '120px'
  },
  formActions: {
    display: 'flex', justifyContent: 'flex-end', gap: spacing.sm
  },

  // Inputs
  label: {
    fontSize: '11px', fontWeight: 500, color: colors.textMuted,
    textTransform: 'uppercase', letterSpacing: '0.5px'
  },
  input: {
    padding: `${spacing.sm}`, border: '1px solid #E8E4DF',
    borderRadius: '6px', fontSize: '13px', outline: 'none',
    transition: 'border-color 0.15s'
  },
  select: {
    padding: `${spacing.sm}`, border: '1px solid #E8E4DF',
    borderRadius: '6px', fontSize: '13px', background: '#FFFFFF', outline: 'none',
    WebkitAppearance: 'menulist', appearance: 'menulist', cursor: 'pointer'
  },
  dateInput: {
    padding: `${spacing.sm}`, border: '1px solid #E8E4DF',
    borderRadius: '6px', fontSize: '13px'
  },

  // Story section
  storyCard: {
    background: '#FFFFFF', borderRadius: '12px',
    padding: spacing.lg, marginBottom: spacing.xl,
    border: '1px solid #E8E4DF'
  },
  storyHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: spacing.md
  },
  sectionTitle: {
    fontSize: '14px', fontWeight: 600, color: colors.textPrimary, margin: 0
  },
  narrativeTextarea: {
    padding: spacing.md, border: '1px solid #E8E4DF',
    borderRadius: '6px', fontSize: '14px', fontFamily: 'inherit',
    resize: 'vertical', lineHeight: 1.7, outline: 'none',
    width: '100%', boxSizing: 'border-box', minHeight: '160px'
  },
  hint: {
    fontSize: '12px', color: colors.textMuted, margin: 0
  },
  narrativeText: {
    fontSize: '14px', color: '#333', lineHeight: 1.7, margin: 0
  },
  emptyText: {
    fontSize: '13px', color: colors.textMuted, fontStyle: 'italic', margin: 0
  },
  hireDateText: {
    fontSize: '12px', color: colors.textSecondary, marginTop: spacing.sm
  },

  // Timeline
  timelineSection: {
    position: 'relative'
  },
  emptyState: {
    textAlign: 'center', padding: spacing.xxl
  },
  timeline: {
    position: 'relative', paddingLeft: '48px'
  },
  timelineLine: {
    position: 'absolute', top: 0, left: '0px',
    width: '20px', height: '100%', pointerEvents: 'none', zIndex: 0
  },

  // Anchor cards
  anchorCard: {
    display: 'flex', background: '#FFFFFF',
    borderTop: '1px solid #E8E4DF', borderRight: '1px solid #E8E4DF',
    borderBottom: '1px solid #E8E4DF', borderLeft: '1px solid #E8E4DF',
    borderRadius: radius.md,
    marginBottom: spacing.sm, overflow: 'hidden',
    transition: 'all 0.2s ease', position: 'relative',
    zIndex: 1, cursor: 'grab'
  },
  anchorCardBody: {
    flex: 1, padding: '12px 16px'
  },
  anchorCardTop: {
    display: 'flex', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: '4px'
  },
  anchorTitle: {
    fontSize: '14px', fontWeight: 500, color: colors.textPrimary,
    margin: '0 0 4px 0', cursor: 'pointer',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
  },
  anchorDate: {
    fontSize: '12px', color: colors.textSecondary,
    marginBottom: spacing.xs, display: 'flex',
    alignItems: 'center', gap: '4px'
  },
  anchorDescription: {
    fontSize: '13px', color: '#666', lineHeight: 1.5,
    margin: `0 0 ${spacing.sm} 0`,
    display: '-webkit-box', WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical', overflow: 'hidden'
  },
  anchorCardBottom: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
  },
  evidenceSummaryText: {
    fontSize: '11px', color: colors.textMuted
  },

  // Badges
  typeBadge: {
    fontSize: '11px', fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: '0.5px', padding: '2px 8px', borderRadius: radius.full
  },
  typeBadgeLarge: {
    display: 'inline-block', fontSize: '13px', fontWeight: 600,
    padding: `4px ${spacing.sm}`, borderRadius: radius.md, textTransform: 'capitalize'
  },
  mutedBadge: {
    fontSize: '10px', fontWeight: 500, color: colors.textMuted,
    background: '#F3F4F6', padding: '2px 6px', borderRadius: radius.sm
  },
  warnBadge: {
    fontSize: '10px', fontWeight: 500, color: '#B45309',
    background: '#FFFBEB', padding: '2px 6px', borderRadius: radius.sm
  },
  confidenceBadge: {
    fontSize: '10px', color: '#B45309', background: '#FFFBEB',
    padding: '1px 4px', borderRadius: '3px', marginLeft: '4px'
  },
  precedentBadgeClickable: {
    fontSize: '10px', color: '#6B21A8', background: '#F3E8FF',
    padding: '2px 6px', borderRadius: radius.sm, whiteSpace: 'nowrap',
    cursor: 'pointer', transition: 'background 0.15s',
    border: '1px solid transparent'
  },

  expandBtn: {
    background: 'none', border: 'none', color: colors.primary,
    fontSize: '11px', cursor: 'pointer', padding: `${spacing.xs} 0 0 0`,
    display: 'block', width: '100%', textAlign: 'left'
  },

  // Spoke panel (Step 7: side-by-side flex, no overlay)
  spokeOverlay: {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.35)', display: 'flex',
    justifyContent: 'center', alignItems: 'center', zIndex: 200
  },
  spokePanel: {
    background: '#FFFFFF', width: '480px', flexShrink: 0,
    height: '100%', overflow: 'hidden',
    borderLeft: '1px solid #E8E4DF',
    transition: 'width 0.2s ease-out'
  },
  spokePanelInner: {
    display: 'flex', flexDirection: 'column', height: '100%'
  },
  spokeHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: `${spacing.md} ${spacing.lg}`, background: '#FFFFFF',
    borderBottom: '1px solid #E8E4DF'
  },
  spokeTitle: {
    fontSize: '18px', fontWeight: 600, color: colors.textPrimary, margin: 0
  },
  spokeTitleInput: {
    fontSize: '18px', fontWeight: 600, color: colors.textPrimary,
    border: '1px solid #E8E4DF', borderRadius: '6px', padding: `4px ${spacing.sm}`,
    outline: 'none', width: '280px'
  },
  closeBtn: {
    width: '32px', height: '32px', borderRadius: '50%',
    background: '#F3F4F6', border: 'none', fontSize: '20px',
    color: colors.textMuted, cursor: 'pointer', display: 'flex',
    alignItems: 'center', justifyContent: 'center', lineHeight: 1
  },
  navBtn: {
    width: '28px', height: '28px', borderRadius: '50%',
    background: '#F3F4F6', border: 'none', fontSize: '12px',
    color: colors.textSecondary, cursor: 'pointer', display: 'flex',
    alignItems: 'center', justifyContent: 'center', lineHeight: 1
  },
  spokeBody: {
    padding: `${spacing.md} ${spacing.lg}`, overflowY: 'auto', flex: 1
  },
  spokeSection: {
    marginBottom: spacing.md, paddingBottom: spacing.md,
    borderBottom: '1px solid #F3F4F6'
  },
  sectionLabel: {
    display: 'flex', alignItems: 'center', gap: spacing.xs,
    fontSize: '13px', fontWeight: 600, color: '#999',
    textTransform: 'uppercase', letterSpacing: '0.5px',
    marginBottom: spacing.sm
  },
  sectionLabelRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: spacing.sm
  },
  spokeText: {
    fontSize: '13px', color: colors.textPrimary, lineHeight: 1.6, margin: 0
  },
  spokeTextarea: {
    width: '100%', padding: spacing.sm, border: '1px solid #E8E4DF',
    borderRadius: '6px', fontSize: '13px', fontFamily: 'inherit',
    resize: 'vertical', boxSizing: 'border-box', outline: 'none'
  },
  emptyInline: {
    fontSize: '12px', color: colors.textMuted, fontStyle: 'italic', margin: 0
  },

  // Radio label
  radioLabel: {
    padding: `${spacing.xs} ${spacing.sm}`, borderRadius: radius.md,
    fontSize: '12px', fontWeight: 500, cursor: 'pointer',
    border: '1px solid #E8E4DF', transition: 'all 0.15s'
  },

  // Actor chips
  actorChip: {
    display: 'flex', alignItems: 'center', gap: spacing.xs,
    padding: `${spacing.xs} ${spacing.sm}`,
    background: '#F9FAFB', borderRadius: radius.full,
    fontSize: '13px', border: '1px solid #E8E4DF'
  },
  actorDot: {
    width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0
  },
  actorDotSmall: {
    width: '5px', height: '5px', borderRadius: '50%', flexShrink: 0
  },
  actorRole: {
    fontSize: '11px', color: colors.textMuted
  },
  chipRemoveBtn: {
    background: 'none', border: 'none', fontSize: '14px',
    color: '#DC2626', cursor: 'pointer', padding: '0 2px',
    opacity: 0.5, marginLeft: '2px'
  },

  // Confirm banner
  confirmBanner: {
    position: 'absolute', top: '100%', left: 0, right: 0,
    background: '#FEF2F2', border: '1px solid #FCA5A5',
    borderRadius: radius.md, padding: `${spacing.xs} ${spacing.sm}`,
    fontSize: '11px', color: '#DC2626', display: 'flex',
    alignItems: 'center', gap: spacing.sm, zIndex: 10,
    boxShadow: shadows.md, whiteSpace: 'nowrap', marginTop: '2px'
  },
  confirmYes: {
    background: '#DC2626', color: '#FFF', border: 'none',
    borderRadius: radius.sm, padding: '2px 8px', fontSize: '11px',
    cursor: 'pointer'
  },
  confirmNo: {
    background: 'transparent', color: '#DC2626', border: '1px solid #FCA5A5',
    borderRadius: radius.sm, padding: '2px 8px', fontSize: '11px',
    cursor: 'pointer'
  },

  // Evidence
  evidenceRow: {
    display: 'flex', alignItems: 'center', gap: spacing.sm,
    padding: `${spacing.xs} ${spacing.sm}`,
    background: '#F9FAFB', borderRadius: radius.md
  },
  evidenceTypeDot: {
    width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0
  },
  evidenceFileName: {
    flex: 1, fontSize: '13px', color: colors.textPrimary,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    cursor: 'pointer'
  },
  evidenceTypeLabel: {
    fontSize: '10px', color: colors.textMuted
  },
  evidenceExpanded: {
    background: '#FAFAF8', border: '1px solid #E8E4DF',
    borderRadius: `0 0 ${radius.md} ${radius.md}`,
    padding: spacing.sm, marginTop: '-2px'
  },

  // Grouped evidence
  groupedEvidence: {
    border: '1px solid #E8E4DF', borderRadius: radius.md,
    marginBottom: '6px', overflow: 'hidden'
  },
  groupHeader: {
    fontSize: '11px', fontWeight: 600, color: colors.textMuted,
    padding: `${spacing.xs} ${spacing.sm}`, background: '#F3F4F6',
    borderBottom: '1px solid #E8E4DF'
  },

  // Dropdown
  dropdown: {
    marginTop: spacing.sm, border: '1px solid #E8E4DF',
    borderRadius: radius.md, maxHeight: '180px', overflowY: 'auto',
    padding: '4px'
  },
  dropdownItem: {
    display: 'flex', alignItems: 'center', gap: spacing.sm,
    padding: `${spacing.xs} ${spacing.sm}`,
    cursor: 'pointer', borderRadius: radius.sm,
    fontSize: '13px', transition: 'background 0.1s'
  },

  // Nearby
  nearbySection: {
    marginTop: spacing.md, padding: spacing.sm,
    background: '#FFFBEB', borderRadius: radius.md,
    border: '1px solid #FEF3C7'
  },
  nearbyLabel: {
    fontSize: '11px', fontWeight: 500, color: '#B45309', marginBottom: spacing.xs
  },
  nearbyItem: {
    fontSize: '12px', color: '#92400E', padding: `${spacing.xs} 0`, cursor: 'pointer'
  },

  // Precedents
  precedentRow: {
    display: 'flex', alignItems: 'center', gap: spacing.sm,
    padding: `${spacing.xs} ${spacing.sm}`,
    background: '#FAF5FF', borderRadius: radius.md, border: '1px solid #E9D5FF'
  },
  precedentName: {
    fontSize: '13px', fontWeight: 500, color: '#6B21A8', display: 'block'
  },
  precedentNote: {
    fontSize: '11px', color: '#9333EA', display: 'block'
  },

  // Precedent detail modal
  precedentModal: {
    background: '#FFFFFF', borderRadius: '12px',
    boxShadow: shadows.xl, width: '480px', maxHeight: '70vh',
    overflow: 'auto', margin: 'auto'
  },
  precedentModalHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    padding: spacing.lg, borderBottom: '1px solid #E8E4DF'
  },

  // Spoke actions
  spokeActions: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: spacing.md, borderTop: '1px solid #F3F4F6'
  },
  breakBtn: {
    padding: `${spacing.xs} ${spacing.sm}`, background: '#FFFBEB',
    border: '1px solid #FDE68A', borderRadius: radius.md,
    fontSize: '11px', color: '#B45309', cursor: 'pointer'
  },
  cloneActionBtn: {
    padding: `${spacing.xs} ${spacing.sm}`, background: '#F0F9FF',
    border: '1px solid #BAE6FD', borderRadius: radius.md,
    fontSize: '11px', color: '#0369A1', cursor: 'pointer'
  },
  deleteActionBtn: {
    padding: `${spacing.xs} ${spacing.sm}`, background: '#FEF2F2',
    border: '1px solid #FECACA', borderRadius: radius.md,
    fontSize: '11px', color: '#DC2626', cursor: 'pointer'
  },

  // Step 4: Duplicate resolution
  duplicateBanner: {
    position: 'sticky', top: 0, zIndex: 20,
    background: '#FFFBEB', border: '1px solid #FDE68A',
    padding: `${spacing.sm} ${spacing.xl}`,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    fontSize: '13px', color: '#92400E', fontWeight: 500
  },
  duplicateReviewBtn: {
    padding: `${spacing.xs} ${spacing.md}`,
    background: '#F59E0B', border: 'none', borderRadius: radius.md,
    fontSize: '12px', fontWeight: 500, color: '#FFFFFF', cursor: 'pointer'
  },
  duplicatePanel: {
    background: '#FFFFFF', border: '1px solid #E8E4DF',
    borderRadius: radius.lg, padding: spacing.lg,
    margin: `${spacing.md} ${spacing.xl}`, boxShadow: shadows.md
  },
  dupeCard: {
    flex: 1, padding: spacing.md, background: '#F9FAFB',
    borderRadius: radius.md, border: '1px solid #E8E4DF', textAlign: 'center'
  },
  mergeBtn: {
    padding: `${spacing.xs} ${spacing.md}`,
    background: colors.primary, border: 'none', borderRadius: radius.md,
    fontSize: '12px', fontWeight: 500, color: '#FFFFFF', cursor: 'pointer'
  },

  // Step 5: Evidence preview
  evidencePreview: {
    marginTop: spacing.sm, padding: spacing.sm,
    background: '#F9FAFB', borderRadius: radius.md,
    border: '1px solid #E8E4DF'
  },
  textSnippet: {
    fontFamily: typography.fontFamilyMono,
    fontSize: '11px', color: colors.textSecondary,
    lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word'
  },

  // Step 6: Recap badge
  recapBadge: {
    fontSize: '9px', fontWeight: 700, color: '#1D4ED8',
    background: '#DBEAFE', padding: '1px 6px',
    borderRadius: radius.full, textTransform: 'uppercase',
    letterSpacing: '0.5px', flexShrink: 0
  },

  // Step 8: Card accent removed (using borderLeft inline instead)
  cardAccentInline: {
    borderLeft: '3px solid'
  }
};
