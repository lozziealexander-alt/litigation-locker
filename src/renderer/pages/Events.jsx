import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { colors, shadows, spacing, typography, radius, getEvidenceColor, getSeverityColor } from '../styles/tokens';
import DocumentLinkModal from '../components/DocumentLinkModal';
import IncidentBuilder from '../components/IncidentBuilder';
import NotifyModal, { NotifySummary } from '../components/NotifyModal';

// ===== Constants =====

const EVENT_COLORS = {
  'start': '#3B82F6',
  'reported': '#8B5CF6',
  'help': '#F97316',
  'adverse_action': '#DC2626',
  'harassment': '#E11D48',
  'end': '#1F2937',
  // Tag-based colors (used alongside event_type)
  'sexual_harassment': '#DC2626',
  'gender_harassment': '#F97316',
  'protected_activity': '#8B5CF6',
  'retaliation': '#991B1B',
  'exclusion': '#EAB308',
  'pay_discrimination': '#16A34A',
  'hostile_environment': '#EC4899',
  'help_request': '#14B8A6',
  'employment_start': '#3B82F6',
  'employment_end': '#1F2937'
};

const EVENT_ICONS = {
  'start': '\u{1F680}',
  'reported': '\u{1F4E2}',
  'help': '\u{1F198}',
  'adverse_action': '\u26A0\uFE0F',
  'harassment': '\u{1F6A8}',
  'end': '\u{1F3C1}'
};

const TAG_VOCABULARY = [
  { tag: 'sexual_harassment', label: 'Sexual Harassment', color: '#DC2626' },
  { tag: 'gender_harassment', label: 'Gender Harassment', color: '#F97316' },
  { tag: 'protected_activity', label: 'Protected Activity', color: '#8B5CF6' },
  { tag: 'adverse_action', label: 'Negative Action', color: '#7C3AED' },
  { tag: 'retaliation', label: 'Retaliation', color: '#991B1B' },
  { tag: 'exclusion', label: 'Exclusion', color: '#EAB308' },
  { tag: 'pay_discrimination', label: 'Pay Discrimination', color: '#16A34A' },
  { tag: 'hostile_environment', label: 'Hostile Environment', color: '#EC4899' },
  { tag: 'help_request', label: 'Help Request', color: '#14B8A6' },
  { tag: 'employment_start', label: 'Employment Start', color: '#3B82F6' },
  { tag: 'employment_end', label: 'Employment End', color: '#1F2937' }
];

const TAG_COLORS = Object.fromEntries(TAG_VOCABULARY.map(t => [t.tag, t.color]));

const EMPLOYER_RESPONSE_OPTIONS = [
  { value: 'no_response', label: 'No Response', color: '#DC2626' },
  { value: 'investigated', label: 'Investigated', color: '#F97316' },
  { value: 'took_action', label: 'Took Action', color: '#16A34A' },
  { value: 'denied', label: 'Denied', color: '#991B1B' },
  { value: 'retaliated', label: 'Retaliated', color: '#7C3AED' },
  { value: 'partial', label: 'Partial Response', color: '#EAB308' }
];

// Legacy compat — still used in some views
const EVENT_TYPES = TAG_VOCABULARY.map(t => t.tag);

const EVENT_TYPE_GLOSSARY = {
  sexual_harassment: 'Sexual harassment, assault, or unwanted sexual conduct',
  gender_harassment: 'Gender-based harassment, sexist language, or gender discrimination',
  protected_activity: 'Reporting misconduct, filing complaints, or whistleblowing',
  adverse_action: 'Negative employment actions (demotion, warning, termination, exclusion)',
  retaliation: 'Punishment or retaliation for engaging in protected activity',
  exclusion: 'Being excluded from meetings, projects, teams, or opportunities',
  pay_discrimination: 'Unequal pay, wage theft, or compensation discrimination',
  hostile_environment: 'Pattern of severe or pervasive hostile conduct',
  help_request: 'Asking for help, support, or reasonable accommodation',
  employment_start: 'The beginning of your employment or a significant role change',
  employment_end: 'Termination, resignation, or end of employment'
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

export default function Events({ caseId, onSelectEvent, onSelectDocument }) {
  const [events, setEvents] = useState([]);
  const [context, setContext] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedEvent, setExpandedEvent] = useState(null);
  const [expandedData, setExpandedData] = useState(null);
  const [editingContext, setEditingContext] = useState(false);
  const [contextDraft, setContextDraft] = useState('');
  const [hireDateDraft, setHireDateDraft] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEvent, setNewEvent] = useState({ title: '', tags: [], date: '', description: '' });
  const [dragState, setDragState] = useState({ dragging: null, over: null });
  const [actorToast, setActorToast] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [allActors, setAllActors] = useState([]);
  const [precedentDetail, setPrecedentDetail] = useState(null);
  const [dateError, setDateError] = useState('');
  const [duplicateActors, setDuplicateActors] = useState([]);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [tagFilter, setTagFilter] = useState(null); // null = show all, string = filter by tag
  const [showIncidentBuilder, setShowIncidentBuilder] = useState(false);
  const [expandedIncidentId, setExpandedIncidentId] = useState(null);
  const [expandedIncidentEvents, setExpandedIncidentEvents] = useState([]);
  // Notification modal for incidents
  const [notifyIncidentId, setNotifyIncidentId] = useState(null);
  const [incidentNotifications, setIncidentNotifications] = useState({}); // { incidentId: [actors] }

  async function handleExpandIncident(incidentId) {
    if (expandedIncidentId === incidentId) {
      setExpandedIncidentId(null);
      setExpandedIncidentEvents([]);
      return;
    }
    setExpandedIncidentId(incidentId);
    try {
      const [evtResult, notifResult] = await Promise.all([
        window.api.incidentEvents.list(incidentId),
        window.api.notifications?.getForTarget('incident', incidentId)
          .catch(() => ({ success: false }))
          || Promise.resolve({ success: false })
      ]);
      if (evtResult.success) {
        setExpandedIncidentEvents(evtResult.events || []);
      }
      if (notifResult?.success && notifResult.notifications) {
        setIncidentNotifications(prev => ({ ...prev, [incidentId]: notifResult.notifications }));
      }
    } catch (e) {
      console.error('[Events] expand incident error:', e);
    }
  }

  // Sort events chronologically, undated at end
  const sortedEvents = useMemo(() => {
    let filtered = [...events];
    if (tagFilter) {
      filtered = filtered.filter(e => (e.tags || []).includes(tagFilter));
    }
    return filtered.sort((a, b) => {
      if (a.date && b.date) return a.date.localeCompare(b.date);
      if (a.date) return -1;
      if (b.date) return 1;
      return 0;
    });
  }, [events, tagFilter]);

  useEffect(() => { loadData(); }, [caseId]);

  async function loadData() {
    setLoading(true);
    try {
      const [eventsResult, contextResult, docsResult, incidentsResult, actorsResult] = await Promise.all([
        window.api.events.list(caseId).catch(() => ({ success: false })),
        window.api.context.get(caseId).catch(() => ({ success: false })),
        window.api.documents.list().catch(() => ({ success: false })),
        window.api.incidents.list().catch(() => ({ success: false })),
        window.api.actors.list().catch(() => ({ success: false }))
      ]);

      if (eventsResult.success) setEvents(eventsResult.events);
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
      console.error('[Events] loadData error:', err);
    }
    setLoading(false);
  }

  async function handleRescan() {
    try {
      const result = await window.api.events.generate(caseId);
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
        const result = await window.api.events.generate(caseId);
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

  const expandedEventRef = useRef(null);

  async function handleExpandEvent(anchor) {
    if (expandedEvent === anchor.id) {
      setExpandedEvent(null);
      setExpandedData(null);
      expandedEventRef.current = null;
      return;
    }
    // Clear stale data immediately so old card doesn't flash
    expandedEventRef.current = anchor.id;
    setExpandedEvent(anchor.id);
    setExpandedData(null);
    const result = await window.api.events.getRelatedEvidence(caseId, anchor.id);
    // Guard against race condition: only set data if this anchor is still expanded
    if (result.success && expandedEventRef.current === anchor.id) {
      setExpandedData(result);
    }
  }

  async function handleUpdateEvent(anchorId, updates) {
    console.log('[Events] Saving event', anchorId, 'updates:', JSON.stringify(updates));
    const result = await window.api.events.update(caseId, anchorId, updates);
    console.log('[Events] Save result:', JSON.stringify(result));
    if (result && !result.success && result.error) {
      setDateError(result.error);
      setTimeout(() => setDateError(''), 3000);
      return;
    }
    if (expandedEventRef.current === anchorId) {
      const res = await window.api.events.getRelatedEvidence(caseId, anchorId);
      if (res.success && expandedEventRef.current === anchorId) setExpandedData(res);
    }
    loadData();
  }

  async function handleAddEvent() {
    if (!newEvent.title.trim()) return;
    if (newEvent.date && newEvent.date > TODAY_ISO) {
      setDateError('Date cannot be in the future');
      setTimeout(() => setDateError(''), 3000);
      return;
    }
    await window.api.events.create(caseId, {
      title: newEvent.title.trim(),
      type: newEvent.tags[0] || null,
      tags: newEvent.tags,
      date: newEvent.date || null,
      description: newEvent.description || null
    });
    setNewEvent({ title: '', tags: [], date: '', description: '' });
    setShowAddForm(false);
    loadData();
  }

  async function handleClone(anchorId) {
    await window.api.events.clone(caseId, anchorId);
    loadData();
  }

  async function handleBreakApart(anchorId) {
    const result = await window.api.events.breakApart(caseId, anchorId);
    if (result.success) { expandedEventRef.current = null; setExpandedEvent(null); setExpandedData(null); loadData(); }
  }

  async function handleDeleteEvent(anchorId) {
    if (!window.confirm('Delete this event? This cannot be undone.')) return;
    await window.api.events.delete(caseId, anchorId);
    expandedEventRef.current = null; setExpandedEvent(null); setExpandedData(null); loadData();
  }

  async function handleLinkEvidence(anchorId, docId) {
    await window.api.events.linkEvidence(caseId, anchorId, docId);
    const r = await window.api.events.getRelatedEvidence(caseId, anchorId);
    if (r.success) setExpandedData(r);
    loadData();
  }

  async function handleLinkDocumentV2(anchorId, docId, relevanceV2, timingRelation) {
    await window.api.events.linkDocumentV2(caseId, anchorId, docId, relevanceV2, timingRelation);
    const r = await window.api.events.getRelatedEvidence(caseId, anchorId);
    if (r.success) setExpandedData(r);
    loadData();
  }

  async function handleUnlinkEvidence(anchorId, docId) {
    await window.api.events.unlinkEvidence(caseId, anchorId, docId);
    const r = await window.api.events.getRelatedEvidence(caseId, anchorId);
    if (r.success) setExpandedData(r);
    loadData();
  }

  async function handleLinkIncident(anchorId, incidentId) {
    await window.api.events.linkIncident(caseId, anchorId, incidentId);
    const r = await window.api.events.getRelatedEvidence(caseId, anchorId);
    if (r.success) setExpandedData(r);
    loadData();
  }

  async function handleLinkPrecedent(anchorId, precedentId) {
    await window.api.events.linkPrecedent(caseId, anchorId, precedentId);
    const r = await window.api.events.getRelatedEvidence(caseId, anchorId);
    if (r.success) setExpandedData(r);
    loadData();
  }

  async function handleUnlinkPrecedent(anchorId, precedentId) {
    await window.api.events.unlinkPrecedent(caseId, anchorId, precedentId);
    const r = await window.api.events.getRelatedEvidence(caseId, anchorId);
    if (r.success) setExpandedData(r);
    loadData();
  }

  async function handleLinkActor(anchorId, actorId, role) {
    await window.api.events.linkActor(caseId, anchorId, actorId, role);
    const r = await window.api.events.getRelatedEvidence(caseId, anchorId);
    if (r.success) setExpandedData(r);
    loadData();
  }

  async function handleUnlinkActor(anchorId, actorId) {
    await window.api.events.unlinkActor(caseId, anchorId, actorId);
    const r = await window.api.events.getRelatedEvidence(caseId, anchorId);
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
    const reordered = [...sortedEvents];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(index, 0, moved);
    setEvents(reordered);
    setDragState({ dragging: null, over: null });
    await window.api.events.reorder(caseId, reordered.map(a => a.id));
  }
  function handleDragEnd() { setDragState({ dragging: null, over: null }); }

  // Group event docs for display
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
            {sortedEvents.length} event{sortedEvents.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div style={styles.headerActions}>
          {/* Tag filter chips */}
          {tagFilter && (
            <button
              onClick={() => setTagFilter(null)}
              style={{
                padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 600,
                background: (TAG_COLORS[tagFilter] || '#6B7280') + '18',
                color: TAG_COLORS[tagFilter] || '#6B7280',
                border: `1.5px solid ${TAG_COLORS[tagFilter] || '#6B7280'}`,
                cursor: 'pointer'
              }}>
              {TAG_VOCABULARY.find(t => t.tag === tagFilter)?.label || tagFilter} x
            </button>
          )}
          <button style={styles.ghostBtn} onClick={handleRescan}
            onMouseEnter={e => e.target.style.background = '#F3F4F6'}
            onMouseLeave={e => e.target.style.background = 'transparent'}
          >
            {'\u{1F504}'} Rescan
          </button>
          <button style={{ ...styles.ghostBtn, borderColor: '#7C3AED', color: '#7C3AED' }}
            onClick={() => setShowIncidentBuilder(true)}
            onMouseEnter={e => e.target.style.background = '#F5F3FF'}
            onMouseLeave={e => e.target.style.background = 'transparent'}
          >
            Build Incident
          </button>
          <button style={styles.primaryBtn} onClick={() => setShowAddForm(!showAddForm)}
            onMouseEnter={e => e.target.style.background = colors.primaryHover}
            onMouseLeave={e => e.target.style.background = colors.primary}
          >
            + Add Event
          </button>
        </div>
      </div>

      <div style={styles.mainRow}>
      <div style={{ ...styles.content, flex: 1, minWidth: 0 }}>
        {/* Add Event Form */}
        {showAddForm && (
          <div style={styles.card}>
            <div style={{ ...styles.cardAccent, background: `linear-gradient(180deg, ${colors.primary}, #8B5CF6)` }} />
            <div style={styles.cardBody}>
              <h3 style={styles.cardTitle}>New Event</h3>
              <div style={styles.formGrid}>
                <div style={styles.formField}>
                  <label style={styles.label}>Title</label>
                  <input value={newEvent.title} onChange={e => setNewEvent({ ...newEvent, title: e.target.value })}
                    style={styles.input} placeholder="What happened?" autoFocus
                    onKeyDown={e => e.key === 'Enter' && handleAddEvent()} />
                </div>
                <div style={{ ...styles.formField, flex: '1 1 100%' }}>
                  <label style={styles.label}>Tags</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {TAG_VOCABULARY.map(t => {
                      const isSelected = (newEvent.tags || []).includes(t.tag);
                      return (
                        <button key={t.tag} type="button"
                          onClick={() => {
                            const tags = isSelected ? newEvent.tags.filter(x => x !== t.tag) : [...(newEvent.tags || []), t.tag];
                            setNewEvent({ ...newEvent, tags });
                          }}
                          title={EVENT_TYPE_GLOSSARY[t.tag]}
                          style={{
                            padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 500,
                            border: `1.5px solid ${isSelected ? t.color : '#E8E4DF'}`,
                            background: isSelected ? t.color + '18' : '#FAFAF8',
                            color: isSelected ? t.color : '#9CA3AF',
                            cursor: 'pointer', transition: 'all 0.15s'
                          }}>
                          {t.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div style={styles.formField}>
                  <label style={styles.label}>Date (optional)</label>
                  <input type="date" value={newEvent.date} max={TODAY_ISO}
                    onChange={e => setNewEvent({ ...newEvent, date: e.target.value })}
                    style={styles.dateInput} />
                </div>
                <div style={{ ...styles.formField, flex: '1 1 100%' }}>
                  <label style={styles.label}>Description</label>
                  <input value={newEvent.description} onChange={e => setNewEvent({ ...newEvent, description: e.target.value })}
                    style={styles.input} placeholder="Brief description (optional)" />
                </div>
                <div style={styles.formField}>
                  <label style={styles.label}>Weight</label>
                  <select value={newEvent.eventWeight || 'significant'} onChange={e => setNewEvent({ ...newEvent, eventWeight: e.target.value })} style={styles.select}>
                    <option value="major">Major</option>
                    <option value="significant">Significant</option>
                    <option value="supporting">Supporting</option>
                  </select>
                </div>
                {((newEvent.tags || []).some(t => ['sexual_harassment', 'gender_harassment', 'hostile_environment', 'adverse_action'].includes(t))) && (
                  <div style={{ ...styles.formField, flex: '1 1 100%' }}>
                    <label style={styles.label}>Why wasn't this reported? (optional)</label>
                    <input value={newEvent.whyNoReport || ''} onChange={e => setNewEvent({ ...newEvent, whyNoReport: e.target.value })}
                      style={styles.input} placeholder="Fear of retaliation, didn't know who to tell, etc." />
                  </div>
                )}
                <div style={{ ...styles.formField, flex: '1 1 100%' }}>
                  <label style={{ ...styles.label, display: 'flex', alignItems: 'center', gap: spacing.sm }}>
                    <input type="checkbox" checked={newEvent.employerNotified || false}
                      onChange={e => setNewEvent({ ...newEvent, employerNotified: e.target.checked })} />
                    Employer was notified
                  </label>
                </div>
                {newEvent.employerNotified && (
                  <>
                    <div style={styles.formField}>
                      <label style={styles.label}>Notice Date</label>
                      <input type="date" value={newEvent.noticeDate || ''} max={TODAY_ISO}
                        onChange={e => setNewEvent({ ...newEvent, noticeDate: e.target.value })} style={styles.dateInput} />
                    </div>
                    <div style={styles.formField}>
                      <label style={styles.label}>Notice Method</label>
                      <input value={newEvent.noticeMethod || ''} onChange={e => setNewEvent({ ...newEvent, noticeMethod: e.target.value })}
                        style={styles.input} placeholder="Email, verbal, written, etc." />
                    </div>
                    <div style={{ ...styles.formField, flex: '1 1 100%' }}>
                      <label style={styles.label}>Employer Response (select all that apply)</label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '6px' }}>
                        {EMPLOYER_RESPONSE_OPTIONS.map(opt => {
                          const types = (newEvent.employerResponseType || '').split(',').filter(Boolean);
                          const selected = types.includes(opt.value);
                          return (
                            <button key={opt.value} type="button"
                              style={{
                                padding: '4px 10px', fontSize: '12px', fontWeight: 500,
                                border: `1.5px solid ${selected ? opt.color : colors.border}`,
                                borderRadius: radius.full, cursor: 'pointer',
                                background: selected ? `${opt.color}15` : colors.surface,
                                color: selected ? opt.color : colors.textSecondary
                              }}
                              onClick={() => {
                                const next = selected ? types.filter(t => t !== opt.value) : [...types, opt.value];
                                setNewEvent({ ...newEvent, employerResponseType: next.join(',') });
                              }}
                            >{opt.label}</button>
                          );
                        })}
                      </div>
                      <textarea value={newEvent.employerResponse || ''}
                        onChange={e => setNewEvent({ ...newEvent, employerResponse: e.target.value })}
                        style={{ ...styles.input, minHeight: '40px', resize: 'vertical', fontFamily: 'inherit' }}
                        placeholder="Additional context about the employer's response..." rows={2} />
                    </div>
                    <div style={styles.formField}>
                      <label style={styles.label}>Response Date</label>
                      <input type="date" value={newEvent.responseDate || ''} max={TODAY_ISO}
                        onChange={e => setNewEvent({ ...newEvent, responseDate: e.target.value })} style={styles.dateInput} />
                    </div>
                    <div style={styles.formField}>
                      <label style={{ ...styles.label, display: 'flex', alignItems: 'center', gap: spacing.sm }}>
                        <input type="checkbox" checked={newEvent.responseAdequate || false}
                          onChange={e => setNewEvent({ ...newEvent, responseAdequate: e.target.checked })} />
                        Response was adequate
                      </label>
                    </div>
                  </>
                )}
              </div>
              <div style={styles.formActions}>
                <button style={styles.cancelBtn} onClick={() => setShowAddForm(false)}>Cancel</button>
                <button style={{ ...styles.saveBtn, opacity: newEvent.title.trim() ? 1 : 0.5 }}
                  onClick={handleAddEvent} disabled={!newEvent.title.trim()}>Add Event</button>
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

        {/* Incidents Section */}
        {incidents.length > 0 && (
          <div style={styles.storyCard}>
            <div style={styles.storyHeader}>
              <h2 style={styles.sectionTitle}>{'\u{1F6A8}'} Incidents ({incidents.length})</h2>
              <button style={{ ...styles.ghostBtn, borderColor: '#7C3AED', color: '#7C3AED' }}
                onClick={() => setShowIncidentBuilder(true)}
                onMouseEnter={e => e.target.style.background = '#F5F3FF'}
                onMouseLeave={e => e.target.style.background = 'transparent'}>
                + Build Incident
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {incidents.map(inc => {
                const severityColor = getSeverityColor(inc.computed_severity || inc.base_severity);
                const eventCount = inc.events?.length || 0;
                const docCount = inc.documents?.length || 0;
                const isExpanded = expandedIncidentId === inc.id;
                return (
                  <div key={inc.id} style={{ display: 'flex', flexDirection: 'column' }}>
                    <div
                      style={{
                        display: 'flex', alignItems: 'center', gap: spacing.sm,
                        padding: '8px 12px', borderRadius: radius.sm,
                        border: `1px solid ${isExpanded ? severityColor : colors.border}`,
                        background: isExpanded ? severityColor + '08' : colors.surface,
                        cursor: 'pointer', transition: 'all 0.15s'
                      }}
                      onClick={() => handleExpandIncident(inc.id)}
                      onMouseEnter={e => { if (!isExpanded) { e.currentTarget.style.background = '#F9FAFB'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)'; } }}
                      onMouseLeave={e => { if (!isExpanded) { e.currentTarget.style.background = colors.surface; e.currentTarget.style.boxShadow = 'none'; } }}
                    >
                      <span style={{
                        width: '8px', height: '8px', borderRadius: '50%',
                        background: severityColor, flexShrink: 0
                      }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: colors.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {inc.title}
                        </div>
                        <div style={{ display: 'flex', gap: '8px', marginTop: '2px', fontSize: '11px', color: colors.textMuted }}>
                          {inc.incident_type && <span>{inc.incident_type.replace(/_/g, ' ')}</span>}
                          {inc.date && <span>{new Date(inc.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>}
                          {eventCount > 0 && <span>{eventCount} event{eventCount !== 1 ? 's' : ''}</span>}
                          {docCount > 0 && <span>{docCount} doc{docCount !== 1 ? 's' : ''}</span>}
                        </div>
                      </div>
                      <span style={{
                        padding: '2px 8px', fontSize: '10px', fontWeight: 600,
                        borderRadius: '999px', textTransform: 'uppercase',
                        background: severityColor + '15', color: severityColor,
                        border: `1px solid ${severityColor}`
                      }}>
                        {inc.computed_severity || inc.base_severity || 'unknown'}
                      </span>
                      <span style={{ fontSize: '10px', color: colors.textMuted }}>{isExpanded ? '\u25B2' : '\u25BC'}</span>
                    </div>
                    {/* Expanded incident detail */}
                    {isExpanded && (
                      <div style={{
                        padding: '10px 12px', borderLeft: `3px solid ${severityColor}`,
                        marginLeft: '16px', borderBottom: `1px solid ${colors.border}`,
                        fontSize: '12px', color: colors.textSecondary
                      }}>
                        {inc.description && <p style={{ margin: '0 0 8px 0', lineHeight: 1.5 }}>{inc.description}</p>}
                        {/* Linked events */}
                        {expandedIncidentEvents.length > 0 && (
                          <div style={{ marginBottom: '8px' }}>
                            <div style={{ fontWeight: 600, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px', color: colors.textMuted }}>
                              Linked Events ({expandedIncidentEvents.length})
                            </div>
                            {expandedIncidentEvents.map(evt => (
                              <div key={evt.id || evt.event_id} style={{
                                display: 'flex', alignItems: 'center', gap: '6px',
                                padding: '4px 0', cursor: onSelectEvent ? 'pointer' : 'default'
                              }}
                                onClick={() => onSelectEvent?.({ ...evt, case_id: caseId })}
                                onMouseEnter={e => { if (onSelectEvent) e.currentTarget.style.background = '#F5F3FF'; }}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                              >
                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: TAG_COLORS[evt.event_role] || '#6B7280', flexShrink: 0 }} />
                                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{evt.title}</span>
                                {evt.event_role && <span style={{ fontSize: '10px', color: TAG_COLORS[evt.event_role] || '#6B7280' }}>{evt.event_role.replace(/_/g, ' ')}</span>}
                              </div>
                            ))}
                          </div>
                        )}
                        {/* Linked documents */}
                        {inc.documents?.length > 0 && (
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px', color: colors.textMuted }}>
                              Documents ({inc.documents.length})
                            </div>
                            {inc.documents.map(doc => (
                              <div key={doc.id} style={{
                                display: 'flex', alignItems: 'center', gap: '6px',
                                padding: '4px 0', cursor: onSelectDocument ? 'pointer' : 'default'
                              }}
                                onClick={() => onSelectDocument?.(doc)}
                                onMouseEnter={e => { if (onSelectDocument) e.currentTarget.style.background = '#F5F3FF'; }}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                              >
                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: getEvidenceColor(doc.evidence_type), flexShrink: 0 }} />
                                <span style={{ flex: 1, color: '#7C3AED', textDecoration: 'underline', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.filename}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {/* Notifications */}
                        <div style={{ marginTop: '8px' }}>
                          {(incidentNotifications[inc.id] || []).length > 0 ? (
                            <NotifySummary
                              actors={incidentNotifications[inc.id]}
                              onClick={() => setNotifyIncidentId(inc.id)}
                            />
                          ) : (
                            <button
                              style={{
                                background: 'none', border: `1px dashed ${colors.border}`,
                                borderRadius: '6px', padding: '4px 10px', fontSize: '11px',
                                color: colors.textSecondary, cursor: 'pointer'
                              }}
                              onClick={() => setNotifyIncidentId(inc.id)}
                            >
                              {'\uD83D\uDD14'} Notify People
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Events Timeline */}
        <div style={styles.timelineSection}>
          {sortedEvents.length === 0 ? (
            <div style={styles.emptyState}>
              <div style={{ fontSize: '48px', marginBottom: spacing.md }}>{'\u{1F4CD}'}</div>
              <h3 style={{ fontSize: '18px', fontWeight: 600, color: colors.textPrimary, margin: 0 }}>No events yet</h3>
              <p style={{ fontSize: '14px', color: colors.textMuted, margin: `${spacing.sm} 0 ${spacing.md} 0` }}>
                Add your story above, or click "Add Event" to create one manually.
              </p>
              <button style={styles.primaryBtn} onClick={() => setEditingContext(true)}>Write Your Story</button>
            </div>
          ) : (
            <div style={styles.timeline}>
              {/* Clean vertical line */}
              <div style={styles.timelineLine}>
                {sortedEvents.map((a, i) => (
                  <div key={a.id} style={{
                    position: 'absolute',
                    top: `${24 + i * 140}px`,
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: '8px', height: '8px', borderRadius: '50%',
                    background: EVENT_COLORS[a.event_type] || '#6B7280',
                    border: '1.5px solid #FFFFFF',
                    boxShadow: '0 0 0 1px #E8E4DF',
                    zIndex: 1
                  }} />
                ))}
              </div>

              {/* Event cards */}
              {sortedEvents.map((anchor, index) => {
                const tags = anchor.tags || [];
                const primaryTag = tags[0] || anchor.event_type;
                const color = TAG_COLORS[primaryTag] || EVENT_COLORS[anchor.event_type] || '#6B7280';
                const summary = getEvidenceSummary(anchor);
                const accentColor = color;

                return (
                  <div key={anchor.id}
                    draggable onDragStart={e => handleDragStart(e, index)}
                    onDragOver={e => handleDragOver(e, index)}
                    onDrop={e => handleDrop(e, index)} onDragEnd={handleDragEnd}
                    onClick={() => handleExpandEvent(anchor)}
                    style={{
                      ...styles.eventCard,
                      borderLeft: `3px solid ${accentColor}`,
                      opacity: dragState.dragging === index ? 0.4 : 1,
                      borderTop: dragState.over === index ? `2px solid ${colors.primary}` : '2px solid transparent',
                      ...(expandedEvent === anchor.id ? {
                        borderRight: `1px solid ${accentColor}`,
                        borderBottom: `1px solid ${accentColor}`,
                        borderTop: `2px solid ${accentColor}`,
                        boxShadow: `0 0 0 2px ${accentColor}20`,
                      } : {})
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.boxShadow = expandedEvent === anchor.id
                        ? `0 0 0 2px ${accentColor}20` : '0 4px 12px rgba(0,0,0,0.08)';
                      e.currentTarget.style.transform = 'translateY(-1px)';
                      e.currentTarget.querySelectorAll('.hover-action').forEach(b => b.style.opacity = '1');
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.boxShadow = expandedEvent === anchor.id
                        ? `0 0 0 2px ${accentColor}20` : 'none';
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.querySelectorAll('.hover-action').forEach(b => b.style.opacity = '0');
                    }}
                  >

                    <div style={{ ...styles.eventCardBody, padding: '12px 16px' }}>
                      {/* Top row */}
                      <div style={styles.eventCardTop}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '14px' }}>{EVENT_ICONS[anchor.event_type] || '\u{1F4CC}'}</span>
                          {tags.length > 0 ? tags.map(tag => {
                            const tagColor = TAG_COLORS[tag] || '#6B7280';
                            const vocab = TAG_VOCABULARY.find(t => t.tag === tag);
                            return (
                              <span key={tag} style={{
                                ...styles.typeBadge,
                                background: tagColor + '14',
                                color: tagColor,
                                fontSize: '10px',
                                cursor: 'pointer'
                              }} title={EVENT_TYPE_GLOSSARY[tag] || tag}
                                onClick={e => { e.stopPropagation(); setTagFilter(tagFilter === tag ? null : tag); }}>
                                {vocab ? vocab.label : tag.replace(/_/g, ' ')}
                              </span>
                            );
                          }) : (
                            <span style={{ ...styles.typeBadge, background: color + '14', color, fontSize: '10px' }}>
                              {(anchor.event_type || 'event').replace(/_/g, ' ')}
                            </span>
                          )}
                          {anchor.event_weight && anchor.event_weight !== 'significant' && (
                            <span style={{
                              ...styles.typeBadge,
                              background: anchor.event_weight === 'major' ? '#FEF2F2' : '#F0FDF4',
                              color: anchor.event_weight === 'major' ? '#DC2626' : '#16A34A',
                              fontSize: '10px'
                            }} title={`Weight: ${anchor.event_weight}`}>
                              {anchor.event_weight === 'major' ? '\u25CF\u25CF\u25CF' : '\u25CF'}
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: '2px' }}>
                          {onSelectEvent && (
                            <button className="hover-action" style={styles.hoverIconBtn}
                              onClick={e => { e.stopPropagation(); onSelectEvent(anchor); }} title="Open Panel">{'\u{1F50D}'}</button>
                          )}
                          <button className="hover-action" style={styles.hoverIconBtn}
                            onClick={e => { e.stopPropagation(); handleClone(anchor.id); }} title="Clone">{'\u{1F4CB}'}</button>
                          <button className="hover-action" style={styles.hoverIconBtn}
                            onClick={e => { e.stopPropagation(); handleDeleteEvent(anchor.id); }} title="Delete">{'\u{1F5D1}'}</button>
                        </div>
                      </div>

                      {/* Title */}
                      <h3 style={styles.eventTitle} onClick={e => { e.stopPropagation(); handleExpandEvent(anchor); }}>
                        {anchor.title}
                      </h3>

                      {/* Date */}
                      {anchor.date && (
                        <div style={styles.eventDate}>
                          {'\u{1F4C5}'} {new Date(anchor.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </div>
                      )}

                      {/* Description */}
                      {anchor.description && (
                        <p style={styles.eventDescription}>
                          {anchor.description.slice(0, 120)}{anchor.description.length > 120 ? '...' : ''}
                        </p>
                      )}

                      {/* Bottom row */}
                      <div style={styles.eventCardBottom}>
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
                      <button style={styles.expandBtn} onClick={e => { e.stopPropagation(); handleExpandEvent(anchor); }}>
                        {expandedEvent === anchor.id ? 'Close \u25B2' : 'Details \u25BC'}
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
      {expandedEvent && expandedData && (() => {
        const idx = sortedEvents.findIndex(a => a.id === expandedEvent);
        const hasPrev = idx > 0;
        const hasNext = idx < sortedEvents.length - 1;
        return (
        <div style={styles.spokePanel}>
          <EventSpokes
            anchor={expandedData.event || expandedData.anchor}
            linked={expandedData.linked}
            nearby={expandedData.nearby}
            documents={documents}
            incidents={incidents}
            allActors={allActors}
            caseId={caseId}
            onClose={() => { expandedEventRef.current = null; setExpandedEvent(null); setExpandedData(null); }}
            onUpdate={updates => handleUpdateEvent(expandedEvent, updates)}
            onSelectDocument={onSelectDocument}
            onLinkEvidence={docId => handleLinkEvidence(expandedEvent, docId)}
            onUnlinkEvidence={docId => handleUnlinkEvidence(expandedEvent, docId)}
            onLinkDocumentV2={(docId, relV2, timing) => handleLinkDocumentV2(expandedEvent, docId, relV2, timing)}
            onLinkIncident={incId => handleLinkIncident(expandedEvent, incId)}
            onLinkPrecedent={precId => handleLinkPrecedent(expandedEvent, precId)}
            onUnlinkPrecedent={precId => handleUnlinkPrecedent(expandedEvent, precId)}
            onLinkActor={(actorId, role) => handleLinkActor(expandedEvent, actorId, role)}
            onUnlinkActor={actorId => handleUnlinkActor(expandedEvent, actorId)}
            onBreakApart={() => handleBreakApart(expandedEvent)}
            onClone={() => handleClone(expandedEvent)}
            onDelete={() => handleDeleteEvent(expandedEvent)}
            onPrecedentClick={prec => setPrecedentDetail(prec)}
            onPrev={hasPrev ? () => handleExpandEvent(sortedEvents[idx - 1]) : null}
            onNext={hasNext ? () => handleExpandEvent(sortedEvents[idx + 1]) : null}
            anchorIndex={idx}
            anchorCount={sortedEvents.length}
          />
        </div>
        );
      })()}
      </div>

      {/* Incident Builder Modal */}
      {showIncidentBuilder && (
        <IncidentBuilder
          caseId={caseId}
          events={events}
          existingIncidents={incidents}
          onClose={() => setShowIncidentBuilder(false)}
          onIncidentCreated={() => { loadData(); setShowIncidentBuilder(false); }}
          onSelectDocument={onSelectDocument}
        />
      )}

      {/* Notify modal for incidents */}
      {notifyIncidentId && (
        <NotifyModal
          targetType="incident"
          targetId={notifyIncidentId}
          onClose={() => setNotifyIncidentId(null)}
          onNotified={(actors) => {
            setIncidentNotifications(prev => ({ ...prev, [notifyIncidentId]: actors }));
            setNotifyIncidentId(null);
          }}
        />
      )}
    </div>
  );
}

// ===== Spoke Panel Component =====

function EventSpokes({
  anchor, linked, nearby, documents, incidents, allActors, caseId,
  onClose, onUpdate, onSelectDocument, onLinkEvidence, onUnlinkEvidence,
  onLinkDocumentV2,
  onLinkIncident, onLinkPrecedent, onUnlinkPrecedent,
  onLinkActor, onUnlinkActor,
  onBreakApart, onClone, onDelete, onPrecedentClick,
  onPrev, onNext, anchorIndex, anchorCount
}) {
  const [editing, setEditing] = useState(false);
  const buildEditData = () => ({
    title: anchor.title || '',
    type: anchor.event_type || null,
    tags: anchor.tags || [],
    date: anchor.date || '',
    whatHappened: anchor.what_happened || '',
    where: anchor.where_location || '',
    impact: anchor.impact_summary || '',
    eventWeight: anchor.event_weight || 'significant',
    whyNoReport: anchor.why_no_report || '',
    employerNotified: anchor.employer_notified ? true : false,
    noticeDate: anchor.notice_date || '',
    noticeMethod: anchor.notice_method || '',
    employerResponse: anchor.employer_response || '',
    employerResponseType: anchor.employer_response_type || '',
    responseDate: anchor.response_date || '',
    responseAdequate: anchor.response_adequate ? true : false
  });
  const [editData, setEditData] = useState(buildEditData);

  // Sync editData when anchor prop changes (e.g. after save + reload)
  React.useEffect(() => {
    setEditData(buildEditData());
  }, [anchor.id, anchor.event_type, anchor.title, anchor.date, anchor.what_happened, anchor.event_weight, anchor.employer_notified]);
  const [showAddEvidence, setShowAddEvidence] = useState(false);
  const [showAddIncident, setShowAddIncident] = useState(false);
  const [showAddPrecedent, setShowAddPrecedent] = useState(false);
  const [showAddActor, setShowAddActor] = useState(false);
  const [expandedDoc, setExpandedDoc] = useState(null);
  const [docEditName, setDocEditName] = useState('');
  const [docEditType, setDocEditType] = useState('');
  const [confirmUnlinkActor, setConfirmUnlinkActor] = useState(null);
  const [linkModalDoc, setLinkModalDoc] = useState(null);
  const [evidenceFilter, setEvidenceFilter] = useState('');

  const primaryTag = (anchor.tags || [])[0] || anchor.event_type;
  const accentColor = TAG_COLORS[primaryTag] || EVENT_COLORS[anchor.event_type] || '#6B7280';

  function handleSave() {
    onUpdate(editData);
    setEditing(false);
  }

  function toggleTag(tag) {
    setEditData(prev => {
      const tags = prev.tags.includes(tag) ? prev.tags.filter(t => t !== tag) : [...prev.tags, tag];
      return { ...prev, tags, type: tags[0] || prev.type };
    });
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

  return (
    <div style={styles.spokePanelInner}>
      {/* Header */}
      <div style={styles.spokeHeader}>
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
          <span style={{ fontSize: '24px' }}>{EVENT_ICONS[anchor.event_type] || '\u{1F4CC}'}</span>
          <div>
            {editing ? (
              <input value={editData.title}
                onChange={e => setEditData({ ...editData, title: e.target.value })}
                style={{ ...styles.spokeTitleInput, border: `1px solid ${accentColor}` }} />
            ) : (
              <h3 style={styles.spokeTitle}>{anchor.title}</h3>
            )}
            <div style={{ display: 'flex', gap: '4px', marginTop: '4px', flexWrap: 'wrap' }}>
              {(anchor.tags || []).length > 0 ? (anchor.tags || []).map(tag => {
                const tc = TAG_COLORS[tag] || '#6B7280';
                const vocab = TAG_VOCABULARY.find(t => t.tag === tag);
                return <span key={tag} style={{ ...styles.typeBadge, background: tc + '14', color: tc, display: 'inline-block' }}>{vocab ? vocab.label : tag.replace(/_/g, ' ')}</span>;
              }) : (
                <span style={{ ...styles.typeBadge, background: accentColor + '14', color: accentColor, display: 'inline-block' }}>
                  {(anchor.event_type || 'event').replace(/_/g, ' ')}
                </span>
              )}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button style={{ ...styles.navBtn, opacity: onPrev ? 1 : 0.3 }}
            onClick={onPrev} disabled={!onPrev} title="Previous event">{'\u25C0'}</button>
          <span style={{ fontSize: '11px', color: '#9CA3AF', minWidth: '32px', textAlign: 'center' }}>
            {anchorIndex + 1}/{anchorCount}
          </span>
          <button style={{ ...styles.navBtn, opacity: onNext ? 1 : 0.3 }}
            onClick={onNext} disabled={!onNext} title="Next event">{'\u25B6'}</button>
          <button style={styles.closeBtn} onClick={onClose}>{'\u00D7'}</button>
        </div>
      </div>

      <div style={styles.spokeBody}>
        {/* Tags */}
        <div style={styles.spokeSection}>
          <div style={styles.sectionLabel}>
            <span style={{ fontSize: '13px' }}>{'\u{1F3F7}\uFE0F'}</span> Tags
          </div>
          {editing ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {TAG_VOCABULARY.map(t => {
                const isSelected = editData.tags.includes(t.tag);
                return (
                  <button key={t.tag}
                    onClick={() => toggleTag(t.tag)}
                    title={EVENT_TYPE_GLOSSARY[t.tag]}
                    style={{
                      padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 500,
                      border: `1.5px solid ${isSelected ? t.color : '#E8E4DF'}`,
                      background: isSelected ? t.color + '18' : '#FAFAF8',
                      color: isSelected ? t.color : '#9CA3AF',
                      cursor: 'pointer', transition: 'all 0.15s'
                    }}>
                    {t.label}
                  </button>
                );
              })}
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {(anchor.tags || []).length > 0 ? (anchor.tags || []).map(tag => {
                const tagColor = TAG_COLORS[tag] || '#6B7280';
                const vocab = TAG_VOCABULARY.find(t => t.tag === tag);
                return (
                  <span key={tag} style={{ ...styles.typeBadgeLarge, background: tagColor + '14', color: tagColor }}
                    title={EVENT_TYPE_GLOSSARY[tag]}>
                    {vocab ? vocab.label : tag.replace(/_/g, ' ')}
                  </span>
                );
              }) : (
                <span style={{ ...styles.typeBadgeLarge, background: accentColor + '14', color: accentColor }}>
                  {(anchor.event_type || 'event').replace(/_/g, ' ')}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Date */}
        <div style={styles.spokeSection}>
          <div style={styles.sectionLabel}>
            <span style={{ fontSize: '13px' }}>{'\u{1F4C5}'}</span> Date
          </div>
          {editing ? (
            <input type="date" value={editData.date} max={TODAY_ISO}
              onChange={e => setEditData({ ...editData, date: e.target.value })}
              style={styles.input} />
          ) : (
            <p style={styles.spokeText}>
              {anchor.date
                ? new Date(anchor.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
                : 'Date unknown'}
            </p>
          )}
        </div>

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
                      {actor.role && <span style={styles.actorRole}>({actor.role})</span>}
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

        {/* Event Weight */}
        <div style={styles.spokeSection}>
          <div style={styles.sectionLabel}>
            <span style={{ fontSize: '13px' }}>{'\u2696\uFE0F'}</span> Event Weight
          </div>
          {editing ? (
            <select value={editData.eventWeight}
              onChange={e => setEditData({ ...editData, eventWeight: e.target.value })}
              style={styles.select}>
              <option value="major">Major</option>
              <option value="significant">Significant</option>
              <option value="supporting">Supporting</option>
            </select>
          ) : (
            <span style={{
              ...styles.typeBadge, display: 'inline-block',
              background: anchor.event_weight === 'major' ? '#FEF2F2' : anchor.event_weight === 'supporting' ? '#F0FDF4' : '#F3F4F6',
              color: anchor.event_weight === 'major' ? '#DC2626' : anchor.event_weight === 'supporting' ? '#16A34A' : '#6B7280'
            }}>
              {anchor.event_weight === 'major' ? '\u25CF\u25CF\u25CF Major' : anchor.event_weight === 'supporting' ? '\u25CF Supporting' : '\u25CF\u25CF Significant'}
            </span>
          )}
        </div>

        {/* Employer Notice (shown for HARASSMENT / ADVERSE_ACTION types) */}
        {(anchor.event_type === 'harassment' || anchor.event_type === 'adverse_action' || anchor.event_type === 'reported') && (
          <div style={styles.spokeSection}>
            <div style={styles.sectionLabel}>
              <span style={{ fontSize: '13px' }}>{'\u{1F4E2}'}</span> Employer Notice
            </div>
            {editing ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
                <textarea value={editData.whyNoReport}
                  onChange={e => setEditData({ ...editData, whyNoReport: e.target.value })}
                  style={styles.spokeTextarea} rows={2}
                  placeholder="If not reported, why not?" />
                <label style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, fontSize: '12px', color: colors.textSecondary, cursor: 'pointer' }}>
                  <input type="checkbox" checked={editData.employerNotified}
                    onChange={e => setEditData({ ...editData, employerNotified: e.target.checked })} />
                  Employer was notified
                </label>
                {editData.employerNotified && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm, paddingLeft: spacing.md, borderLeft: `2px solid ${colors.border}` }}>
                    <div style={{ display: 'flex', gap: spacing.sm }}>
                      <div style={{ flex: 1 }}>
                        <label style={styles.label}>Notice Date</label>
                        <input type="date" value={editData.noticeDate}
                          onChange={e => setEditData({ ...editData, noticeDate: e.target.value })}
                          style={styles.input} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={styles.label}>Method</label>
                        <input value={editData.noticeMethod}
                          onChange={e => setEditData({ ...editData, noticeMethod: e.target.value })}
                          style={styles.input} placeholder="Email, verbal, formal..." />
                      </div>
                    </div>
                    <div>
                      <label style={styles.label}>Employer Response (select all that apply)</label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '6px' }}>
                        {EMPLOYER_RESPONSE_OPTIONS.map(opt => {
                          const types = (editData.employerResponseType || '').split(',').filter(Boolean);
                          const selected = types.includes(opt.value);
                          return (
                            <button key={opt.value} type="button"
                              style={{
                                padding: '3px 9px', fontSize: '11px', fontWeight: 500,
                                border: `1.5px solid ${selected ? opt.color : colors.border}`,
                                borderRadius: radius.full, cursor: 'pointer',
                                background: selected ? `${opt.color}15` : colors.surface,
                                color: selected ? opt.color : colors.textSecondary
                              }}
                              onClick={() => {
                                const next = selected ? types.filter(t => t !== opt.value) : [...types, opt.value];
                                setEditData({ ...editData, employerResponseType: next.join(',') });
                              }}
                            >{opt.label}</button>
                          );
                        })}
                      </div>
                      <textarea value={editData.employerResponse}
                        onChange={e => setEditData({ ...editData, employerResponse: e.target.value })}
                        style={styles.spokeTextarea} rows={2}
                        placeholder="Additional context about the employer's response..." />
                    </div>
                    <div style={{ display: 'flex', gap: spacing.sm }}>
                      <div style={{ flex: 1 }}>
                        <label style={styles.label}>Response Date</label>
                        <input type="date" value={editData.responseDate}
                          onChange={e => setEditData({ ...editData, responseDate: e.target.value })}
                          style={styles.input} />
                      </div>
                      <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, fontSize: '12px', color: colors.textSecondary, cursor: 'pointer' }}>
                          <input type="checkbox" checked={editData.responseAdequate}
                            onChange={e => setEditData({ ...editData, responseAdequate: e.target.checked })} />
                          Response was adequate
                        </label>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ fontSize: '13px', color: colors.textSecondary }}>
                {anchor.employer_notified ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ color: '#16A34A', fontWeight: 500 }}>Employer was notified</span>
                    {anchor.notice_date && <span>Date: {new Date(anchor.notice_date + 'T00:00:00').toLocaleDateString()}</span>}
                    {anchor.notice_method && <span>Method: {anchor.notice_method}</span>}
                    {anchor.employer_response_type && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {anchor.employer_response_type.split(',').filter(Boolean).map(rt => {
                          const opt = EMPLOYER_RESPONSE_OPTIONS.find(o => o.value === rt);
                          return (
                            <span key={rt} style={{
                              display: 'inline-block',
                              padding: '2px 8px',
                              fontSize: '11px',
                              fontWeight: 500,
                              borderRadius: '999px',
                              background: (opt?.color || '#6B7280') + '15',
                              color: opt?.color || '#6B7280',
                              border: `1px solid ${opt?.color || '#6B7280'}`
                            }}>
                              {opt?.label || rt}
                            </span>
                          );
                        })}
                      </div>
                    )}
                    {anchor.employer_response && <span>Response: {anchor.employer_response}</span>}
                    {anchor.response_date && <span>Response date: {new Date(anchor.response_date + 'T00:00:00').toLocaleDateString()}</span>}
                    <span style={{ color: anchor.response_adequate ? '#16A34A' : '#DC2626' }}>
                      {anchor.response_adequate ? 'Response adequate' : 'Response inadequate'}
                    </span>
                  </div>
                ) : anchor.why_no_report ? (
                  <div>
                    <span style={{ color: '#B45309' }}>Not reported</span>
                    <p style={{ margin: '4px 0 0 0', fontSize: '12px' }}>{anchor.why_no_report}</p>
                  </div>
                ) : (
                  <span style={{ color: colors.textMuted }}>No notice information recorded</span>
                )}
              </div>
            )}
          </div>
        )}

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
                  onOpenFull={onSelectDocument ? () => onSelectDocument(doc) : null}
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
              onOpenFull={onSelectDocument ? () => onSelectDocument(doc) : null}
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
                    onClick={() => { setLinkModalDoc(doc); setShowAddEvidence(false); setEvidenceFilter(''); }}>
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

      {/* Document Link Modal */}
      {linkModalDoc && (
        <DocumentLinkModal
          document={linkModalDoc}
          eventTitle={anchor.title}
          onSave={({ relevanceV2, timingRelation }) => {
            if (onLinkDocumentV2) {
              onLinkDocumentV2(linkModalDoc.id, relevanceV2, timingRelation);
            } else {
              onLinkEvidence(linkModalDoc.id);
            }
            setLinkModalDoc(null);
          }}
          onCancel={() => setLinkModalDoc(null)}
        />
      )}
    </div>
  );
}

// ===== Evidence Item Component =====

function EvidenceItem({ doc, expanded, onToggle, onUnlink, onOpenFull, editName, onEditName, onRename, editType, onReclassify }) {
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
      <div style={styles.evidenceRow}
        onMouseEnter={e => e.currentTarget.style.background = '#FAFAF8'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        <span style={{ ...styles.evidenceTypeDot, background: getEvidenceColor(doc.evidence_type) }}
          title={EVIDENCE_TYPE_GLOSSARY[doc.evidence_type]} />
        <span style={{ ...styles.evidenceFileName, cursor: 'pointer', color: '#7C3AED', textDecoration: 'underline' }}
          onClick={onOpenFull || handleToggle}>{doc.filename}</span>
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

  // Event cards
  eventCard: {
    display: 'flex', background: '#FFFFFF',
    borderTop: '1px solid #E8E4DF', borderRight: '1px solid #E8E4DF',
    borderBottom: '1px solid #E8E4DF', borderLeft: '1px solid #E8E4DF',
    borderRadius: radius.md,
    marginBottom: spacing.sm, overflow: 'hidden',
    transition: 'all 0.2s ease', position: 'relative',
    zIndex: 1, cursor: 'grab'
  },
  eventCardBody: {
    flex: 1, padding: '12px 16px'
  },
  eventCardTop: {
    display: 'flex', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: '4px'
  },
  eventTitle: {
    fontSize: '14px', fontWeight: 500, color: colors.textPrimary,
    margin: '0 0 4px 0', cursor: 'pointer',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
  },
  eventDate: {
    fontSize: '12px', color: colors.textSecondary,
    marginBottom: spacing.xs, display: 'flex',
    alignItems: 'center', gap: '4px'
  },
  eventDescription: {
    fontSize: '13px', color: '#666', lineHeight: 1.5,
    margin: `0 0 ${spacing.sm} 0`,
    display: '-webkit-box', WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical', overflow: 'hidden'
  },
  eventCardBottom: {
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
    display: 'flex', flexDirection: 'column',
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
