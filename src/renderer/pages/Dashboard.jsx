import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { colors, shadows, spacing, typography, radius, getEvidenceColor, getSeverityColor } from '../styles/tokens';

// ── Thread Registry (mirrored from src/main/analysis/thread-registry.js) ──────
const THREAD_DEFINITIONS = [
  { id: 'sexual_harassment',   name: 'Sexual Harassment',     description: 'Unwanted sexual conduct, propositions, or sexual comments',                  tag_signals: ['sexual_harassment'],                                           precedents: ['harris-v-forklift','faragher-ellerth','meritor'], color: '#8B5CF6',
    title_keywords: ['sexual', 'inappropriate touch', 'inappropriate contact', 'groped', 'groping', 'unwanted advance', 'proposition', 'unwanted sexual'] },
  { id: 'gender_harassment',   name: 'Gender Harassment',     description: 'Gender-based comments, stereotyping, or discriminatory treatment',           tag_signals: ['gender_harassment'],                                           precedents: ['harris-v-forklift'], color: '#EC4899',
    title_keywords: ['gendered', 'sexist', 'stereotype', 'because she', 'because he', 'boys club', 'gender bias', 'gender discrimination'] },
  { id: 'retaliation',         name: 'Retaliation',           description: 'Adverse actions taken after protected activity',                             tag_signals: ['retaliation','protected_activity','adverse_action'],           precedents: ['burlington-northern','vance'],          color: '#F59E0B' },
  { id: 'exclusion',           name: 'Exclusion & Isolation', description: 'Systematic exclusion from meetings, decisions, or team activities',          tag_signals: ['exclusion','isolation'],                                       precedents: ['harris-v-forklift'],                    color: '#10B981',
    title_keywords: ['excluded', 'left out', 'not invited', 'removed from', 'cut out', 'isolated', 'sidelined', 'marginalized', 'shut out'] },
  { id: 'pay_discrimination',  name: 'Pay Discrimination',    description: 'Unequal compensation or benefits based on protected characteristics',        tag_signals: ['pay_discrimination'],                                          precedents: ['lilly-ledbetter'],                      color: '#3B82F6' },
  { id: 'hostile_environment', name: 'Hostile Environment',   description: 'Pervasive conduct creating an abusive or intimidating workplace',            tag_signals: ['hostile_environment'],                                         precedents: ['harris-v-forklift','meritor'],          color: '#6366F1' },
  { id: 'hr_failure',          name: 'HR Failure to Act',     description: 'HR ignored complaints, failed to investigate, or enabled misconduct',        tag_signals: ['help_request','hr_failure','ignored_complaint'],               precedents: ['faragher-ellerth','vance'],             color: '#A855F7' },
];

// Map event_type (moment type) → thread tag signals
const EVENT_TYPE_SIGNALS = {
  'reported':          ['protected_activity'],
  'help':              ['help_request'],
  'harassment':        ['harassment'],
  'adverse_action':    ['adverse_action'],
  'protected_activity':['protected_activity'],
  'retaliation':       ['retaliation', 'adverse_action'],
  'start':             [],
  'end':               [],
  'milestone':         [],
};

// Map document evidence_type → thread tag signals
const DOC_TYPE_SIGNALS = {
  'ADVERSE_ACTION':     ['adverse_action'],
  'PROTECTED_ACTIVITY': ['protected_activity'],
  'REQUEST_FOR_HELP':   ['help_request'],
  'RESPONSE':           ['help_request'],
  'PAY_RECORD':         ['pay_discrimination'],
  // NOTE: 'INCIDENT' deliberately omitted — too broad, incidents can be any type
  'CLAIM_YOU_MADE':     ['protected_activity'],
  'CLAIM_AGAINST_YOU':  ['retaliation'],
};

function buildEffectiveSignals(evt) {
  const signals = new Set(evt.tags || []);
  // Add signals from moment type
  (EVENT_TYPE_SIGNALS[evt.event_type] || []).forEach(s => signals.add(s));
  // Add signals from linked document categories
  (evt.documents || []).forEach(d => {
    (DOC_TYPE_SIGNALS[d.evidence_type] || []).forEach(s => signals.add(s));
  });

  const text = ((evt.title || '') + ' ' + (evt.what_happened || '') + ' ' + (evt.description || '')).toLowerCase();
  const sexualKeywords = ['sexual', 'grope', 'groping', 'unwanted touch', 'unwanted advance', 'inappropriate touch', 'proposition'];
  const genderKeywords = ['gendered', 'sexist', 'stereotype', 'because she', 'because he', 'boys club', 'gender bias', 'gender discrimination',
    'for a woman', 'for a man', 'as a woman', 'as a man', 'like a woman', 'like a man', 'too aggressive for a', 'too emotional'];

  // Resolve generic 'harassment' into specific sub-type using content
  if (signals.has('harassment') && !signals.has('sexual_harassment') && !signals.has('gender_harassment')) {
    if (sexualKeywords.some(k => text.includes(k))) {
      signals.add('sexual_harassment');
    } else if (genderKeywords.some(k => text.includes(k))) {
      signals.add('gender_harassment');
    } else {
      signals.add('hostile_environment');
    }
    signals.delete('harassment');
  }

  // Content-based correction: if tagged sexual_harassment but content is clearly gender-based (not sexual)
  if (signals.has('sexual_harassment') && !sexualKeywords.some(k => text.includes(k))) {
    if (genderKeywords.some(k => text.includes(k))) {
      // Content is gendered, not sexual — reclassify
      signals.delete('sexual_harassment');
      signals.add('gender_harassment');
    }
  }

  return signals;
}

function assignEventsToThreads(events) {
  const assignments = {};
  console.group('[Threads] Event → Thread Assignment');
  for (const evt of events) {
    // Skip context events — they're background info, not part of claim threads
    if (evt.is_context_event) { continue; }
    const signals = buildEffectiveSignals(evt);
    const evtText = ((evt.title || '') + ' ' + (evt.what_happened || '') + ' ' + (evt.description || '')).toLowerCase();
    const matchedThreads = [];
    for (const thread of THREAD_DEFINITIONS) {
      let matches = thread.tag_signals.some(sig => signals.has(sig));
      let matchReason = matches ? 'tag_signal' : '';
      // Also check title_keywords if the thread defines them and tags didn't match
      if (!matches && thread.title_keywords) {
        const kw = thread.title_keywords.find(kw => evtText.includes(kw.toLowerCase()));
        if (kw) { matches = true; matchReason = `title_keyword: "${kw}"`; }
      }
      if (matches) {
        matchedThreads.push(`${thread.name} (${matchReason})`);
        if (!assignments[thread.id]) assignments[thread.id] = { thread, events: [], documents: new Map() };
        assignments[thread.id].events.push(evt);
        // Store full doc objects keyed by id to deduplicate across events
        (evt.documents || []).forEach(d => {
          if (d && d.id && !assignments[thread.id].documents.has(d.id)) {
            assignments[thread.id].documents.set(d.id, d);
          }
        });
      }
    }
    if (matchedThreads.length > 0) {
      console.log(`"${evt.title}" | tags=[${(evt.tags||[]).join(',')}] type=${evt.event_type||'?'} | signals=[${[...signals].join(',')}] → ${matchedThreads.join(', ')}`);
    }
  }
  console.groupEnd();
  // Convert Maps to Arrays of full doc objects
  for (const id in assignments) assignments[id].documents = Array.from(assignments[id].documents.values());
  return assignments;
}

function calculateThreadStrength(assignment) {
  if (assignment.events.length === 0) return 0;
  let score = 20;
  score += Math.min(assignment.events.length * 10, 40);
  score += Math.min(assignment.documents.length * 5, 30);
  const hasPair = assignment.events.some(e => buildEffectiveSignals(e).has('protected_activity')) &&
                  assignment.events.some(e => buildEffectiveSignals(e).has('adverse_action'));
  if (hasPair) score += 10;
  return Math.min(score, 100);
}

function getThreadGaps(assignment, thread) {
  const gaps = [];
  if (assignment.events.length === 0) { gaps.push('No events tagged yet'); return gaps; }
  if (assignment.documents.length === 0) gaps.push('No supporting documents linked');
  if (thread.id === 'retaliation') {
    const hasPA  = assignment.events.some(e => buildEffectiveSignals(e).has('protected_activity'));
    const hasAdv = assignment.events.some(e => buildEffectiveSignals(e).has('adverse_action'));
    if (!hasPA)  gaps.push('Missing: protected activity event');
    if (!hasAdv) gaps.push('Missing: adverse action event');
  }
  if (assignment.events.length < 2) gaps.push('More corroborating events strengthen this thread');
  return gaps;
}

// ── Document hover preview item ──────────────────────────────────────────────
function DocPreviewItem({ doc, onSelectDocument }) {
  const [hoverPos, setHoverPos] = React.useState(null);
  const preview = doc.extracted_text
    ? doc.extracted_text.slice(0, 600).trim()
    : null;

  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '5px 8px',
        borderRadius: '5px',
        background: colors.surfaceAlt,
        border: `1px solid ${colors.border}`,
        fontSize: typography.fontSize.xs,
        color: colors.textSecondary,
        cursor: onSelectDocument ? 'pointer' : 'default'
      }}
      onMouseEnter={e => {
        if (!preview) return;
        const rect = e.currentTarget.getBoundingClientRect();
        setHoverPos({ top: rect.top, left: rect.left, bottom: rect.bottom });
      }}
      onMouseLeave={() => setHoverPos(null)}
      onClick={() => onSelectDocument?.(doc)}
    >
      <span style={{
        padding: '1px 5px',
        borderRadius: '3px',
        fontSize: 10,
        background: `${colors.primary}22`,
        color: colors.primary,
        flexShrink: 0
      }}>
        {(doc.evidence_type || 'DOC').replace(/_/g, ' ')}
      </span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
        {doc.filename || doc.id}
      </span>

      {/* Hover preview popover — rendered via portal to escape overflow:hidden ancestors */}
      {hoverPos && preview && ReactDOM.createPortal(
        <div
          style={{
            position: 'fixed',
            top: hoverPos.top > 280 ? hoverPos.top - 280 : hoverPos.bottom + 8,
            left: Math.max(8, Math.min(hoverPos.left, window.innerWidth - 356)),
            zIndex: 9999,
            width: 340,
            maxHeight: 260,
            overflow: 'hidden',
            background: '#1E293B',
            color: '#E2E8F0',
            borderRadius: '8px',
            padding: '12px',
            fontSize: '12px',
            lineHeight: '1.6',
            boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
            pointerEvents: 'none',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word'
          }}
        >
          <div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {doc.filename || 'Document'}
          </div>
          {preview}
          {doc.extracted_text && doc.extracted_text.length > 600 && (
            <div style={{ color: '#64748B', marginTop: 6, fontStyle: 'italic' }}>…click to view full document</div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
// ─────────────────────────────────────────────────────────────────────────────

export default function Dashboard({ onNavigateToTimeline, onNavigateToPeople, onSelectDocument, onSelectActor }) {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [precedentAnalysis, setPrecedentAnalysis] = useState(null);
  const [actors, setActors] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [connections, setConnections] = useState([]);
  const [escalation, setEscalation] = useState(null);
  const [collapsedSections, setCollapsedSections] = useState({});
  const [showCaseStrength, setShowCaseStrength] = useState(false);
  const [protectedClasses, setProtectedClasses] = useState([]);
  const [chainAnalysis, setChainAnalysis] = useState(null);
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [causalityLinks, setCausalityLinks] = useState([]);
  const [suggestedIncidents, setSuggestedIncidents] = useState([]);
  const [threads, setThreads] = useState({});
  const [events, setEvents] = useState([]);

  function toggleSection(section) {
    setCollapsedSections(prev => ({ ...prev, [section]: !prev[section] }));
  }

  useEffect(() => {
    loadDashboardData();
  }, []);

  async function loadDashboardData() {
    setLoading(true);
    try {
    // Get current case first so we can use the new connections + events APIs
    const currentCase = await window.api.cases.current().catch(() => null);
    const caseId = currentCase?.caseId;

    const [docsResult, incidentsResult, actorsResult, precedentResult, connectionsResult, eventsResult] = await Promise.all([
      window.api.documents.list().catch(e => ({ success: false })),
      window.api.incidents.list().catch(e => ({ success: false })),
      window.api.actors.list().catch(e => ({ success: false })),
      window.api.precedents.analyze().catch(e => ({ success: false })),
      caseId ? window.api.connections.list(caseId).catch(e => ({ success: false, connections: [] })) : Promise.resolve({ success: false, connections: [] }),
      caseId ? window.api.events.list(caseId).catch(e => ({ success: false, events: [] })) : Promise.resolve({ success: false, events: [] })
    ]);

    if (docsResult.success) setDocuments(docsResult.documents);
    if (incidentsResult.success) setIncidents(incidentsResult.incidents);
    if (actorsResult.success) {
      setActors(actorsResult.actors);
      // Extract protected class status from self-actor
      const self = actorsResult.actors.find(a => a.is_self);
      if (self) {
        const classes = [];
        if (self.gender && self.gender !== 'unknown') classes.push({ type: 'Gender', value: self.gender });
        if (self.disability_status && self.disability_status !== 'unknown' && self.disability_status !== 'no') classes.push({ type: 'Disability', value: self.disability_status });
        if (self.race && self.race !== 'unknown') classes.push({ type: 'Race', value: self.race });
        if (self.age_range && self.age_range !== 'unknown') classes.push({ type: 'Age', value: self.age_range });
        setProtectedClasses(classes);
      }
    }
    if (precedentResult.success) setPrecedentAnalysis(precedentResult.analysis);

    // Normalize new connections API (snake_case → camelCase) so rest of code is unchanged
    if (connectionsResult.success) {
      const normalized = (connectionsResult.connections || []).map(c => ({
        ...c,
        connectionType: c.connection_type || c.connectionType,
        sourceId: c.source_id || c.sourceId,
        targetId: c.target_id || c.targetId,
        daysBetween: c.days_between ?? c.daysBetween,
      }));
      setConnections(normalized);
      setEscalation(connectionsResult.escalation || null);
    }

    // Process events — assignEventsToThreads stores full doc objects directly from evt.documents
    const evts = eventsResult.success ? (eventsResult.events || []) : [];
    setEvents(evts);
    const threadAssignments = assignEventsToThreads(evts);
    setThreads(threadAssignments);

    // Run incident chain analysis (categorizer)
    try {
      const chainResult = await window.api.categorizer.analyzeDocuments();
      if (chainResult.success && chainResult.summary) {
        setChainAnalysis(chainResult.summary);
      }
    } catch (e) {
      console.warn('[Dashboard] categorizer analysis error:', e);
    }

    // Load causality links + suggested incidents
    try {
      const linksResult = await window.api.eventLinks.list();
      if (linksResult.success) setCausalityLinks(linksResult.links || []);
    } catch (e) {}
    try {
      const suggestResult = await window.api.incidents.suggest();
      if (suggestResult.success) setSuggestedIncidents(suggestResult.suggestions || []);
    } catch (e) {}

    // Compute stats
    const docs = docsResult.documents || [];
    const incs = incidentsResult.incidents || [];
    const acts = actorsResult.actors || [];

    // Count incidents from events (more accurate than legacy incidents table)
    const incidentTagSignals = ['harassment', 'sexual_harassment', 'gender_harassment', 'hostile_environment', 'exclusion', 'adverse_action', 'retaliation'];
    const eventIncidentCount = evts.filter(e => {
      const sigs = [...(e.tags || []), e.event_type].filter(Boolean);
      return sigs.some(s => incidentTagSignals.includes(s));
    }).length;
    const effectiveIncidentCount = eventIncidentCount > 0 ? eventIncidentCount : incs.length;

    const allDates = [
      ...docs.filter(d => d.document_date).map(d => new Date(d.document_date)),
      ...evts.filter(e => e.date).map(e => new Date(e.date))
    ];

    const computed = {
      documentCount: docs.length,
      incidentCount: effectiveIncidentCount,
      momentCount: evts.length,
      helpRequestCount: evts.filter(e => (e.tags || []).includes('help_request') || e.event_type === 'help').length
        + docs.filter(d => d.evidence_type === 'REQUEST_FOR_HELP').length,
      adverseActionCount: evts.filter(e => (e.tags || []).some(t => ['adverse_action', 'retaliation'].includes(t))).length
        + docs.filter(d => d.evidence_type === 'ADVERSE_ACTION').length,
      retaliationEventCount: evts.filter(e => (e.tags || []).some(t => ['retaliation', 'adverse_action'].includes(t)) && (e.tags || []).includes('protected_activity')).length,
      actorCount: acts.length,
      badActorCount: acts.filter(a => a.classification === 'bad_actor').length,
      witnessCount: acts.filter(a => a.classification?.startsWith('witness')).length,
      chainCount: acts.filter(a => !!a.in_reporting_chain).length,
      earliestDate: allDates.length > 0 ? new Date(Math.min(...allDates)) : null,
      latestDate: allDates.length > 0 ? new Date(Math.max(...allDates)) : null,
      timelineSpanDays: allDates.length > 1
        ? Math.ceil((Math.max(...allDates) - Math.min(...allDates)) / (1000 * 60 * 60 * 24))
        : 0
    };

    // Calculate filing deadlines
    if (computed.latestDate) {
      const now = new Date();
      const fchrDeadline = new Date(computed.latestDate);
      fchrDeadline.setDate(fchrDeadline.getDate() + 365);
      const eeocDeadline = new Date(computed.latestDate);
      eeocDeadline.setDate(eeocDeadline.getDate() + 300);

      computed.fchrDaysRemaining = Math.ceil((fchrDeadline - now) / (1000 * 60 * 60 * 24));
      computed.eeocDaysRemaining = Math.ceil((eeocDeadline - now) / (1000 * 60 * 60 * 24));
    }

    setStats(computed);
    } catch (err) {
      console.error('[Dashboard] loadDashboardData error:', err);
    }
    setLoading(false);
  }

  // Generate natural language summary
  function generateSummary() {
    if (!stats || stats.documentCount === 0) {
      return "No evidence has been added yet. Drop documents onto the Timeline to begin building your case.";
    }

    const parts = [];

    // Timeline span
    if (stats.earliestDate && stats.latestDate) {
      parts.push(`This case spans ${stats.timelineSpanDays} days, from ${formatDate(stats.earliestDate)} to ${formatDate(stats.latestDate)}.`);
    }

    // Evidence count
    const momentStr = stats.momentCount > 0 ? ` and ${stats.momentCount} moment${stats.momentCount !== 1 ? 's' : ''}` : '';
    parts.push(`You have documented ${stats.documentCount} piece${stats.documentCount !== 1 ? 's' : ''} of evidence${momentStr}, with ${stats.incidentCount} documented incidents.`);

    // Help requests and adverse actions
    if (stats.helpRequestCount > 0) {
      parts.push(`You asked for help ${stats.helpRequestCount} time${stats.helpRequestCount !== 1 ? 's' : ''} — establishing protected activity.`);
    }
    if (stats.adverseActionCount > 0) {
      parts.push(`${stats.adverseActionCount} adverse action${stats.adverseActionCount !== 1 ? 's were' : ' was'} taken against you.`);
    }

    // Actors
    if (stats.badActorCount > 0) {
      parts.push(`${stats.badActorCount} person${stats.badActorCount !== 1 ? 's have' : ' has'} been identified as bad actor${stats.badActorCount !== 1 ? 's' : ''}.`);
    }
    if (stats.chainCount > 0) {
      parts.push(`${stats.chainCount} person${stats.chainCount !== 1 ? 's are' : ' is'} in your reporting chain.`);
    }
    if (stats.witnessCount > 0) {
      parts.push(`${stats.witnessCount} potential witness${stats.witnessCount !== 1 ? 'es' : ''} identified.`);
    }

    // Patterns
    if (escalation?.hasEscalation) {
      parts.push(`\u26A0\uFE0F An escalating pattern of severity has been detected.`);
    }

    const retaliationConnections = connections.filter(c => c.connectionType === 'retaliation_chain');
    if (retaliationConnections.length > 0) {
      const closestTiming = Math.min(...retaliationConnections.map(c => c.daysBetween));
      parts.push(`\u26A0\uFE0F Potential retaliation detected: adverse action occurred ${closestTiming} days after protected activity.`);
    }

    return parts.join(' ');
  }

  // Helper: find document by id
  function findDoc(docId) {
    return documents.find(d => d.id === docId);
  }

  // Get pattern alerts
  function getAlerts() {
    const alerts = [];

    // Escalation
    if (escalation?.hasEscalation) {
      // Gather all incident-type documents as related evidence
      const incidentDocs = documents.filter(d =>
        ['INCIDENT', 'ADVERSE_ACTION'].includes(d.evidence_type)
      );
      alerts.push({
        type: 'escalation',
        severity: 'warning',
        title: 'Escalating Pattern',
        description: `Severity trending ${escalation.trend}: ${escalation.escalations} escalations vs ${escalation.deescalations} de-escalations`,
        legal: 'Harris v. Forklift - pattern demonstrates hostile environment',
        relatedDocs: incidentDocs,
        relatedIncidents: incidents,
        detail: `${escalation.escalations} escalation${escalation.escalations !== 1 ? 's' : ''} detected with ${escalation.deescalations} de-escalation${escalation.deescalations !== 1 ? 's' : ''}. This pattern of increasing severity demonstrates a worsening hostile environment, which is a key element under Harris v. Forklift Systems.`
      });
    }

    // Retaliation timing
    const retaliationConns = connections.filter(c => c.connectionType === 'retaliation_chain');
    retaliationConns.forEach(conn => {
      const sourceDoc = findDoc(conn.sourceId);
      const targetDoc = findDoc(conn.targetId);
      const relatedDocs = [sourceDoc, targetDoc].filter(Boolean);

      if (conn.daysBetween <= 14) {
        alerts.push({
          type: 'retaliation',
          severity: 'critical',
          title: `${conn.daysBetween} Days After Protected Activity`,
          description: 'Very close temporal proximity strongly supports retaliation inference',
          legal: 'Burlington Northern v. White',
          relatedDocs,
          connection: conn,
          detail: `Only ${conn.daysBetween} days elapsed between the protected activity${sourceDoc ? ` (${sourceDoc.filename})` : ''} and the adverse action${targetDoc ? ` (${targetDoc.filename})` : ''}. Courts have consistently held that temporal proximity of this closeness is sufficient to establish a prima facie case of retaliation under Burlington Northern v. White.`
        });
      } else if (conn.daysBetween <= 30) {
        alerts.push({
          type: 'retaliation',
          severity: 'warning',
          title: `${conn.daysBetween} Days After Protected Activity`,
          description: 'Close temporal proximity supports retaliation claim',
          legal: 'Burlington Northern v. White',
          relatedDocs,
          connection: conn,
          detail: `${conn.daysBetween} days elapsed between the protected activity${sourceDoc ? ` (${sourceDoc.filename})` : ''} and the adverse action${targetDoc ? ` (${targetDoc.filename})` : ''}. This temporal proximity, while not as strong as under 14 days, still supports an inference of retaliation under Burlington Northern v. White.`
        });
      }
    });

    // Temporal clusters
    const clusterConns = connections.filter(c => c.connectionType === 'temporal_cluster');
    clusterConns.forEach(conn => {
      const sourceDoc = findDoc(conn.sourceId);
      const targetDoc = findDoc(conn.targetId);
      alerts.push({
        type: 'cluster',
        severity: 'info',
        title: 'Event Cluster Detected',
        description: conn.description,
        legal: 'Morgan - continuing violation pattern',
        relatedDocs: [sourceDoc, targetDoc].filter(Boolean),
        connection: conn,
        detail: `Multiple events occurring in close temporal proximity suggest a continuing pattern of conduct. Under National Railroad Passenger Corp. v. Morgan, incidents that are part of a continuing violation may be considered together, even if some fall outside the statute of limitations filing window.`
      });
    });

    return alerts;
  }

  // Get pattern insights
  function getPatternInsights() {
    const insights = [];

    // Count requests for help (events + docs combined, deduplicated by intent)
    const helpEventCount = events.filter(e => (e.tags || []).includes('help_request') || e.event_type === 'help').length;
    const helpDocCount = documents.filter(d => d.evidence_type === 'REQUEST_FOR_HELP').length;
    const helpCount = Math.max(helpEventCount, helpDocCount);
    if (helpCount > 0) {
      insights.push({
        icon: '\uD83D\uDE4B',
        count: helpCount,
        label: `time${helpCount !== 1 ? 's' : ''} you asked for help`,
        legal: 'Protected activity under Title VII and ADA — documented requests for help establish you engaged in protected conduct'
      });
    }

    // Employer notice — HR/supervisor actors involved in help events (Faragher/Ellerth)
    const noticeActors = actors.filter(a =>
      ['hr', 'direct_supervisor', 'skip_level'].includes(a.relationship_to_self)
    );
    if (noticeActors.length > 0 && helpCount > 0) {
      const noticeNames = noticeActors.map(a => a.name).join(', ');
      insights.push({
        icon: '\uD83D\uDCCB',
        count: noticeActors.length,
        label: `supervisor/HR ${noticeActors.length === 1 ? 'person' : 'people'} had notice (${noticeNames})`,
        legal: 'Employer had actual or constructive notice — Faragher v. City of Boca Raton / Ellerth — key for vicarious liability'
      });
    }

    // Count adverse actions (events + docs)
    const adverseEventCount = events.filter(e => (e.tags || []).some(t => ['adverse_action', 'retaliation'].includes(t))).length;
    const adverseDocCount = documents.filter(d => d.evidence_type === 'ADVERSE_ACTION').length;
    const adverseCount = adverseEventCount + adverseDocCount;
    if (adverseCount > 0) {
      insights.push({
        icon: '\u26A0\uFE0F',
        count: adverseCount,
        label: `adverse action${adverseCount !== 1 ? 's' : ''} documented`,
        legal: 'Each adverse action may constitute a separate claim — Burlington Northern v. White'
      });
    }

    // Count harassment incidents from events
    const harassEventCount = events.filter(e => {
      const sigs = [...(e.tags || []), e.event_type].filter(Boolean);
      return sigs.some(s => ['harassment', 'sexual_harassment', 'gender_harassment', 'hostile_environment'].includes(s));
    }).length;
    const incidentDocCount = documents.filter(d => d.evidence_type === 'INCIDENT').length;
    const harassTotal = harassEventCount + incidentDocCount;
    if (harassTotal > 0) {
      insights.push({
        icon: '\u26A1',
        count: harassTotal,
        label: `harassment incident${harassTotal !== 1 ? 's' : ''} documented`,
        legal: 'Pattern of incidents supports hostile work environment claim — Harris v. Forklift'
      });
    }

    // Retaliation: events with both protected_activity and adverse_action/retaliation tags
    const retaliationEvtCount = events.filter(e => {
      const tags = e.tags || [];
      return tags.includes('protected_activity') && tags.some(t => ['adverse_action', 'retaliation'].includes(t));
    }).length;
    // Count retaliation chains
    const retaliationConnCount = connections.filter(c => c.connectionType === 'retaliation_chain').length;
    const retaliationCount = retaliationEvtCount + retaliationConnCount;
    if (retaliationCount > 0) {
      insights.push({
        icon: '\uD83D\uDD17',
        count: retaliationCount,
        label: `retaliation indicator${retaliationCount !== 1 ? 's' : ''} detected`,
        legal: 'Temporal proximity between protected activity and adverse action supports retaliation inference'
      });
    }

    // Escalation trend
    if (escalation?.hasEscalation) {
      insights.push({
        icon: '\uD83D\uDCC8',
        count: escalation.escalations,
        label: `escalation${escalation.escalations !== 1 ? 's' : ''} vs ${escalation.deescalations} de-escalation${escalation.deescalations !== 1 ? 's' : ''}`,
        legal: 'Escalating pattern demonstrates worsening hostile environment — Faragher v. City of Boca Raton'
      });
    }

    // Count temporal clusters
    const clusterCount = connections.filter(c => c.connectionType === 'temporal_cluster').length;
    if (clusterCount > 0) {
      insights.push({
        icon: '\uD83D\uDCCD',
        count: clusterCount,
        label: `temporal cluster${clusterCount !== 1 ? 's' : ''} detected`,
        legal: 'Clustering of events supports continuing violation theory — Morgan v. Nat\'l R.R. Passenger Corp.'
      });
    }

    // Reporting chain actors
    const chainActors = actors.filter(a => !!a.in_reporting_chain);
    if (chainActors.length > 0) {
      insights.push({
        icon: '\u{1F3E2}',
        count: chainActors.length,
        label: `in your reporting chain`,
        legal: 'Actors in the reporting chain establish employer knowledge and vicarious liability — Faragher/Ellerth framework'
      });
    }

    return insights;
  }

  // Get evidence gaps
  function getGaps() {
    if (!precedentAnalysis?.precedents) return [];

    const allGaps = [];

    Object.entries(precedentAnalysis.precedents).forEach(([key, prec]) => {
      if (prec.gaps && prec.gaps.length > 0) {
        prec.gaps.forEach(gap => {
          allGaps.push({
            precedent: prec.name,
            precedentKey: key,
            ...gap
          });
        });
      }
    });

    return allGaps;
  }

  if (loading) {
    return (
      <div style={styles.loading}>
        <div style={styles.loadingSpinner} />
        <span>Loading dashboard...</span>
      </div>
    );
  }

  const gaps = getGaps();
  const topActors = actors
    .filter(a => a.classification === 'bad_actor' || a.classification === 'enabler' || !!a.in_reporting_chain)
    .sort((a, b) => {
      // Sort: bad_actors first, then enablers, then chain actors
      const classPriority = { bad_actor: 0, enabler: 1 };
      const pa = classPriority[a.classification] ?? (a.in_reporting_chain ? 2 : 3);
      const pb = classPriority[b.classification] ?? (b.in_reporting_chain ? 2 : 3);
      return pa - pb;
    })
    .slice(0, 8);

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.title}>Threads</h1>
        <p style={styles.subtitle}>Legal claim threads built from your timeline</p>
      </div>


      {/* Threads Tab */}
        <div style={styles.threadsContent}>
          {THREAD_DEFINITIONS.map(thread => {
            const assignment = threads[thread.id] || { events: [], documents: [] };
            const strength = calculateThreadStrength(assignment);
            const gaps = getThreadGaps(assignment, thread);
            return (
              <div key={thread.id} style={styles.threadCard}>
                <div style={styles.threadCardHeader}>
                  <div style={{ ...styles.threadDot, backgroundColor: thread.color }} />
                  <div style={styles.threadHeaderText}>
                    <div style={styles.threadName}>{thread.name}</div>
                    <div style={styles.threadDesc}>{thread.description}</div>
                  </div>
                  <div style={{ ...styles.threadStrengthPill, borderColor: thread.color, color: thread.color }}>
                    {strength}%
                  </div>
                </div>

                <div style={styles.strengthBarBg}>
                  <div style={{ ...styles.strengthBarFill, width: `${strength}%`, backgroundColor: thread.color }} />
                </div>

                <div style={styles.threadStats}>
                  <span style={styles.threadStat}><strong>{assignment.events.length}</strong> event{assignment.events.length !== 1 ? 's' : ''}</span>
                  <span style={styles.threadStatDivider}>·</span>
                  <span style={styles.threadStat}><strong>{assignment.documents.length}</strong> doc{assignment.documents.length !== 1 ? 's' : ''}</span>
                  {thread.precedents.length > 0 && (
                    <>
                      <span style={styles.threadStatDivider}>·</span>
                      <span style={styles.threadPrecedent}>⚖️ {thread.precedents[0]}</span>
                    </>
                  )}
                </div>

                {/* Key Evidence with hover preview */}
                {assignment.documents.length > 0 && (
                  <div style={{ marginTop: spacing.xs }}>
                    <div style={{ fontSize: typography.fontSize.xs, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: spacing.xs }}>
                      Key Evidence ({assignment.documents.length})
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs, maxHeight: 160, overflowY: 'auto' }}>
                      {assignment.documents.map(doc => (
                        <DocPreviewItem key={doc.id || doc} doc={doc} onSelectDocument={onSelectDocument} />
                      ))}
                    </div>
                  </div>
                )}

                {gaps.length > 0 && (
                  <div style={styles.threadGaps}>
                    {gaps.slice(0, 2).map((gap, i) => (
                      <div key={i} style={styles.threadGap}>⚠ {gap}</div>
                    ))}
                  </div>
                )}

                {assignment.events.length === 0 && (
                  <div style={styles.threadEmpty}>No events tagged for this thread yet</div>
                )}
              </div>
            );
          })}
        </div>

      {/* Alert Detail Modal */}
      {selectedAlert && (
        <div style={styles.overlay} onClick={() => setSelectedAlert(null)}>
          <div style={{...styles.overlayPanel, width: '650px'}} onClick={e => e.stopPropagation()}>
            <div style={styles.overlayHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
                <span style={{
                  display: 'inline-block',
                  padding: `${spacing.xs} ${spacing.sm}`,
                  borderRadius: radius.sm,
                  fontSize: typography.fontSize.xs,
                  fontWeight: typography.fontWeight.bold,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  color: '#fff',
                  background: selectedAlert.severity === 'critical' ? colors.error :
                              selectedAlert.severity === 'warning' ? colors.warning : colors.primary
                }}>
                  {selectedAlert.severity}
                </span>
                <h2 style={styles.overlayTitle}>{selectedAlert.title}</h2>
              </div>
              <button style={styles.overlayClose} onClick={() => setSelectedAlert(null)}>{'\u2715'}</button>
            </div>
            <div style={styles.overlayContent}>
              {/* Legal basis */}
              <div style={{
                padding: spacing.md,
                background: colors.surfaceAlt,
                borderRadius: radius.md,
                marginBottom: spacing.lg,
                borderLeft: `3px solid ${colors.primary}`
              }}>
                <div style={{ fontSize: typography.fontSize.xs, color: colors.textMuted, marginBottom: spacing.xs, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Legal Basis</div>
                <div style={{ fontSize: typography.fontSize.sm, color: colors.textPrimary, fontStyle: 'italic' }}>{selectedAlert.legal}</div>
              </div>

              {/* Analysis */}
              {selectedAlert.detail && (
                <div style={{ marginBottom: spacing.lg }}>
                  <div style={{ fontSize: typography.fontSize.xs, color: colors.textMuted, marginBottom: spacing.sm, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Analysis</div>
                  <p style={{ fontSize: typography.fontSize.sm, color: colors.textSecondary, lineHeight: '1.6', margin: 0 }}>
                    {selectedAlert.detail}
                  </p>
                </div>
              )}

              {/* Related Evidence */}
              {selectedAlert.relatedDocs?.length > 0 && (
                <div style={{ marginBottom: spacing.lg }}>
                  <div style={{ fontSize: typography.fontSize.xs, color: colors.textMuted, marginBottom: spacing.sm, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Linked Evidence ({selectedAlert.relatedDocs.length})
                  </div>
                  {selectedAlert.relatedDocs.map((doc, i) => (
                    <div
                      key={doc.id || i}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: spacing.sm,
                        padding: spacing.sm,
                        marginBottom: spacing.xs,
                        background: colors.surfaceAlt,
                        borderRadius: radius.sm,
                        cursor: 'pointer'
                      }}
                      onClick={() => {
                        setSelectedAlert(null);
                        onSelectDocument?.(doc);
                      }}
                    >
                      <span style={{
                        display: 'inline-block',
                        padding: `2px ${spacing.xs}`,
                        borderRadius: radius.xs,
                        fontSize: typography.fontSize.xs,
                        fontWeight: typography.fontWeight.medium,
                        background: getEvidenceColor(doc.evidence_type) + '22',
                        color: getEvidenceColor(doc.evidence_type)
                      }}>
                        {(doc.evidence_type || '').replace(/_/g, ' ')}
                      </span>
                      <span style={{ fontSize: typography.fontSize.sm, color: colors.textPrimary, flex: 1 }}>
                        {doc.filename}
                      </span>
                      {doc.document_date && (
                        <span style={{ fontSize: typography.fontSize.xs, color: colors.textMuted }}>
                          {new Date(doc.document_date).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Related Incidents (for escalation alerts) */}
              {selectedAlert.relatedIncidents?.length > 0 && (
                <div style={{ marginBottom: spacing.lg }}>
                  <div style={{ fontSize: typography.fontSize.xs, color: colors.textMuted, marginBottom: spacing.sm, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Related Incidents ({selectedAlert.relatedIncidents.length})
                  </div>
                  {selectedAlert.relatedIncidents.map((inc, i) => (
                    <div
                      key={inc.id || i}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: spacing.sm,
                        padding: spacing.sm,
                        marginBottom: spacing.xs,
                        background: colors.surfaceAlt,
                        borderRadius: radius.sm
                      }}
                    >
                      <span style={{
                        display: 'inline-block',
                        padding: `2px ${spacing.xs}`,
                        borderRadius: radius.xs,
                        fontSize: typography.fontSize.xs,
                        fontWeight: typography.fontWeight.bold,
                        background: getSeverityColor(inc.severity) + '22',
                        color: getSeverityColor(inc.severity)
                      }}>
                        {inc.severity}
                      </span>
                      <span style={{ fontSize: typography.fontSize.sm, color: colors.textPrimary, flex: 1 }}>
                        {inc.description}
                      </span>
                      {inc.incident_date && (
                        <span style={{ fontSize: typography.fontSize.xs, color: colors.textMuted }}>
                          {new Date(inc.incident_date).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Connection detail (for retaliation/cluster) */}
              {selectedAlert.connection && (
                <div style={{
                  padding: spacing.md,
                  background: colors.surfaceAlt,
                  borderRadius: radius.md,
                  display: 'flex',
                  alignItems: 'center',
                  gap: spacing.md
                }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: typography.fontSize.xl, fontWeight: typography.fontWeight.bold, color: colors.textPrimary }}>
                      {selectedAlert.connection.daysBetween}
                    </div>
                    <div style={{ fontSize: typography.fontSize.xs, color: colors.textMuted }}>days</div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: typography.fontSize.sm, color: colors.textPrimary }}>{selectedAlert.connection.description}</div>
                    <div style={{ fontSize: typography.fontSize.xs, color: colors.textMuted, marginTop: spacing.xs }}>
                      Strength: <span style={{
                        color: selectedAlert.connection.strength === 'strong' ? colors.error :
                               selectedAlert.connection.strength === 'moderate' ? colors.warning : colors.textMuted,
                        fontWeight: typography.fontWeight.medium
                      }}>{selectedAlert.connection.strength}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: spacing.sm, marginTop: spacing.lg }}>
                <button
                  style={{
                    flex: 1,
                    padding: spacing.sm,
                    background: colors.surfaceAlt,
                    border: `1px solid ${colors.border}`,
                    borderRadius: radius.sm,
                    color: colors.textPrimary,
                    fontSize: typography.fontSize.sm,
                    cursor: 'pointer'
                  }}
                  onClick={() => {
                    const docIds = selectedAlert?.relatedDocs?.map(d => d.id).filter(Boolean) || [];
                    setSelectedAlert(null);
                    onNavigateToTimeline?.(docIds.length > 0 ? docIds : undefined);
                  }}
                >
                  View on Timeline
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Case Strength Overlay */}
      {showCaseStrength && precedentAnalysis && (
        <div style={styles.overlay} onClick={() => setShowCaseStrength(false)}>
          <div style={styles.overlayPanel} onClick={e => e.stopPropagation()}>
            <div style={styles.overlayHeader}>
              <h2 style={styles.overlayTitle}>Case Strength Analysis</h2>
              <button style={styles.overlayClose} onClick={() => setShowCaseStrength(false)}>{'\u2715'}</button>
            </div>
            <div style={styles.overlayContent}>
              <div style={styles.strengthMeter}>
                <div style={styles.strengthBarOuter}>
                  <div style={{
                    ...styles.strengthBarInner,
                    width: `${precedentAnalysis.caseStrength}%`,
                    background: precedentAnalysis.caseStrength >= 70 ? colors.success :
                               precedentAnalysis.caseStrength >= 40 ? colors.warning : colors.error
                  }} />
                </div>
                <span style={styles.strengthValue}>{precedentAnalysis.caseStrength}%</span>
              </div>
              {Object.entries(precedentAnalysis.precedents || {}).map(([key, prec]) => (
                <div key={key} style={styles.precedentDetail}>
                  <div style={styles.precedentDetailHeader}>
                    <span style={styles.precedentDetailName}>{prec.name}</span>
                    <span style={{
                      ...styles.precedentScore,
                      color: prec.alignmentPercent >= 70 ? colors.success :
                             prec.alignmentPercent >= 40 ? colors.warning : colors.error
                    }}>{prec.alignmentPercent}%</span>
                  </div>
                  <div style={styles.precedentElements}>
                    {prec.elements?.map((el, i) => (
                      <div key={i} style={styles.precedentElement}>
                        <span style={{
                          ...styles.elementStatus,
                          color: el.satisfied ? colors.success : colors.error
                        }}>{el.satisfied ? '\u2713' : '\u2717'}</span>
                        <span style={styles.elementName}>{el.element}</span>
                        {el.note && <span style={styles.elementNote}>{el.note}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper Components
function StatCard({ icon, value, label, sublabel, onClick }) {
  return (
    <div style={{...styles.statCard, cursor: onClick ? 'pointer' : 'default'}} onClick={onClick}>
      <span style={styles.statIcon}>{icon}</span>
      <span style={styles.statValue}>{value}</span>
      <span style={styles.statLabel}>{label}</span>
      {sublabel && <span style={styles.statSublabel}>{sublabel}</span>}
    </div>
  );
}

function DeadlineItem({ agency, days, total }) {
  const percent = Math.max(0, Math.min(100, (days / total) * 100));
  const isUrgent = days <= 30;
  const isWarning = days <= 90;

  return (
    <div style={styles.deadlineItem}>
      <div style={styles.deadlineHeader}>
        <span style={styles.deadlineAgency}>{agency}</span>
        <span style={{
          ...styles.deadlineDays,
          color: isUrgent ? colors.error : isWarning ? colors.warning : colors.textPrimary
        }}>
          {days > 0 ? `${days} days` : 'EXPIRED'}
        </span>
      </div>
      <div style={styles.deadlineBar}>
        <div style={{
          ...styles.deadlineProgress,
          width: `${percent}%`,
          background: isUrgent ? colors.error : isWarning ? colors.warning : colors.success
        }} />
      </div>
    </div>
  );
}

function formatDate(date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const styles = {
  container: {
    height: '100%',
    overflow: 'auto',
    background: colors.bg
  },
  loading: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    color: colors.textMuted
  },
  loadingSpinner: {
    width: '32px',
    height: '32px',
    border: `3px solid ${colors.border}`,
    borderTopColor: colors.primary,
    borderRadius: '50%',
    animation: 'spin 1s linear infinite'
  },
  header: {
    padding: `${spacing.lg} ${spacing.xl}`,
    borderBottom: `1px solid ${colors.border}`,
    background: colors.surface
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
    margin: `${spacing.xs} 0 0 0`
  },
  content: {
    padding: spacing.xl,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.lg
  },

  // Summary Card
  summaryCard: {
    background: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    boxShadow: shadows.sm
  },
  summaryText: {
    fontSize: typography.fontSize.base,
    color: colors.textPrimary,
    lineHeight: typography.lineHeight.relaxed,
    margin: 0
  },

  // Stats Row
  statsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: spacing.md
  },
  statCard: {
    background: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: spacing.xs,
    boxShadow: shadows.sm,
    transition: 'box-shadow 0.15s ease'
  },
  statIcon: {
    fontSize: '24px'
  },
  statValue: {
    fontSize: typography.fontSize.xxl,
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary
  },
  statLabel: {
    fontSize: typography.fontSize.sm,
    color: colors.textMuted
  },
  statSublabel: {
    fontSize: typography.fontSize.xs,
    color: colors.warning,
    fontWeight: typography.fontWeight.medium
  },

  // Card
  card: {
    background: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    boxShadow: shadows.sm
  },
  cardTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textPrimary,
    margin: `0 0 ${spacing.md} 0`,
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm
  },
  badge: {
    background: colors.primary,
    color: colors.textInverse,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    padding: `2px ${spacing.sm}`,
    borderRadius: radius.full
  },
  emptyText: {
    fontSize: typography.fontSize.sm,
    color: colors.textMuted,
    margin: 0
  },

  // Strength Meter
  strengthMeter: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md
  },
  strengthBarOuter: {
    flex: 1,
    height: '8px',
    background: colors.surfaceAlt,
    borderRadius: radius.full,
    overflow: 'hidden'
  },
  strengthBarInner: {
    height: '100%',
    borderRadius: radius.full,
    transition: 'width 0.5s ease'
  },
  strengthValue: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
    minWidth: '50px',
    textAlign: 'right'
  },
  precedentRow: {
    display: 'flex',
    gap: spacing.md
  },
  precedentMini: {
    flex: 1,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.sm,
    background: colors.surfaceAlt,
    borderRadius: radius.md
  },
  precedentName: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary
  },
  precedentScore: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold
  },

  // Two Column
  twoColumn: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: spacing.lg
  },
  column: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.lg
  },

  // Alerts
  alertList: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
    maxHeight: '400px',
    overflowY: 'auto',
    paddingRight: spacing.xs
  },
  alertItem: {
    padding: spacing.md,
    background: colors.surfaceAlt,
    borderRadius: radius.md,
    borderLeft: `4px solid ${colors.warning}`
  },
  alertTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.xs
  },
  alertDesc: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.xs
  },
  alertLegal: {
    fontSize: typography.fontSize.xs,
    color: colors.textMuted,
    fontStyle: 'italic'
  },

  // Deadlines
  deadlineList: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.md
  },
  deadlineItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs
  },
  deadlineHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  deadlineAgency: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary
  },
  deadlineDays: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold
  },
  deadlineBar: {
    height: '6px',
    background: colors.surfaceAlt,
    borderRadius: radius.full,
    overflow: 'hidden'
  },
  deadlineProgress: {
    height: '100%',
    borderRadius: radius.full,
    transition: 'width 0.3s ease'
  },
  deadlineNote: {
    fontSize: typography.fontSize.xs,
    color: colors.textMuted,
    marginTop: spacing.sm,
    fontStyle: 'italic'
  },

  // Gaps
  gapList: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm
  },
  gapItem: {
    padding: spacing.sm,
    background: '#FEF3C7',
    borderRadius: radius.md
  },
  gapElement: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: '#92400E',
    marginBottom: '2px'
  },
  gapRec: {
    fontSize: typography.fontSize.xs,
    color: '#B45309',
    marginBottom: '2px'
  },
  gapPrecedent: {
    fontSize: typography.fontSize.xs,
    color: '#D97706',
    fontStyle: 'italic'
  },
  moreText: {
    fontSize: typography.fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
    padding: spacing.sm
  },

  // Actors
  actorList: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm
  },
  actorItem: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.sm,
    background: colors.surfaceAlt,
    borderRadius: radius.md
  },
  actorBadge: {
    width: '36px',
    height: '36px',
    borderRadius: radius.full,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold
  },
  actorInfo: {
    flex: 1
  },
  actorName: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.textPrimary
  },
  actorRole: {
    fontSize: typography.fontSize.xs,
    color: colors.textMuted,
    textTransform: 'capitalize'
  },
  actorCount: {
    fontSize: typography.fontSize.xs,
    color: colors.textMuted,
    background: colors.surface,
    padding: `2px ${spacing.sm}`,
    borderRadius: radius.full
  },
  dashboardChainTag: {
    fontSize: '10px',
    fontWeight: 600,
    color: '#3B82F6',
    background: '#3B82F610',
    border: '1px solid #3B82F630',
    padding: '1px 6px',
    borderRadius: '9999px',
    lineHeight: '1.4',
    whiteSpace: 'nowrap'
  },

  // Collapsible + Clickable
  collapsibleTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textPrimary,
    margin: `0 0 ${spacing.md} 0`,
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    cursor: 'pointer',
    userSelect: 'none'
  },
  chevron: {
    fontSize: '10px',
    color: colors.textMuted,
    width: '14px',
    textAlign: 'center',
    flexShrink: 0
  },
  strengthBadge: {
    color: '#fff',
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    padding: `2px ${spacing.sm}`,
    borderRadius: radius.full,
    marginLeft: 'auto'
  },
  clickableItem: {
    cursor: 'pointer',
    transition: 'opacity 0.15s ease'
  },

  // Case Strength Overlay
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000
  },
  overlayPanel: {
    background: colors.surface,
    borderRadius: radius.xl,
    width: '600px',
    maxHeight: '80vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: shadows.lg
  },
  overlayHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderBottom: `1px solid ${colors.border}`
  },
  overlayTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textPrimary,
    margin: 0
  },
  overlayClose: {
    background: 'none',
    border: 'none',
    fontSize: '18px',
    color: colors.textMuted,
    cursor: 'pointer',
    padding: spacing.sm
  },
  overlayContent: {
    padding: spacing.lg,
    overflowY: 'auto'
  },
  precedentDetail: {
    marginBottom: spacing.lg,
    padding: spacing.md,
    background: colors.surfaceAlt,
    borderRadius: radius.md
  },
  precedentDetailHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm
  },
  precedentDetailName: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textPrimary
  },
  precedentElements: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs
  },
  precedentElement: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: spacing.sm,
    fontSize: typography.fontSize.sm
  },
  elementStatus: {
    fontWeight: typography.fontWeight.bold,
    flexShrink: 0
  },
  elementName: {
    color: colors.textPrimary
  },
  elementNote: {
    color: colors.textMuted,
    fontSize: typography.fontSize.xs,
    marginLeft: 'auto'
  },

  // Pattern Insights
  insightsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: spacing.sm
  },
  insightItem: {
    padding: spacing.md,
    background: colors.surfaceAlt,
    borderRadius: radius.md
  },
  insightTop: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs
  },
  insightIcon: {
    fontSize: '16px'
  },
  insightCount: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary
  },
  insightLabel: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary
  },
  insightLegal: {
    fontSize: typography.fontSize.xs,
    color: colors.textMuted,
    fontStyle: 'italic',
    lineHeight: typography.lineHeight.relaxed
  },

  // Tab bar
  tabBar: {
    display: 'flex',
    gap: '2px',
    padding: `0 ${spacing.lg}`,
    borderBottom: `1px solid ${colors.border}`,
    marginBottom: spacing.lg
  },
  tab: {
    padding: `${spacing.sm} ${spacing.md}`,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.textSecondary,
    background: 'none',
    border: 'none',
    borderBottom: '2px solid transparent',
    cursor: 'pointer',
    marginBottom: '-1px'
  },
  tabActive: {
    color: colors.primary,
    borderBottomColor: colors.primary
  },

  // Threads tab
  threadsContent: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
    gap: spacing.md,
    padding: `0 ${spacing.lg} ${spacing.lg}`
  },
  threadCard: {
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: radius.lg,
    padding: spacing.lg,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm
  },
  threadCardHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: spacing.sm
  },
  threadDot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    flexShrink: 0,
    marginTop: '4px'
  },
  threadHeaderText: {
    flex: 1,
    minWidth: 0
  },
  threadName: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textPrimary
  },
  threadDesc: {
    fontSize: typography.fontSize.xs,
    color: colors.textMuted,
    marginTop: '2px'
  },
  threadStrengthPill: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    border: '1px solid',
    borderRadius: radius.sm,
    padding: '2px 8px',
    flexShrink: 0
  },
  strengthBarBg: {
    height: '4px',
    background: colors.border,
    borderRadius: '2px',
    overflow: 'hidden'
  },
  strengthBarFill: {
    height: '100%',
    borderRadius: '2px',
    transition: 'width 0.3s ease'
  },
  threadStats: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.xs,
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary
  },
  threadStat: {
    color: colors.textSecondary
  },
  threadStatDivider: {
    color: colors.textMuted
  },
  threadPrecedent: {
    color: colors.textMuted,
    fontStyle: 'italic'
  },
  threadGaps: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px'
  },
  threadGap: {
    fontSize: typography.fontSize.xs,
    color: colors.warning,
    padding: '3px 8px',
    background: `${colors.warning}15`,
    borderRadius: radius.sm
  },
  threadEmpty: {
    fontSize: typography.fontSize.xs,
    color: colors.textMuted,
    fontStyle: 'italic'
  }
};

const chainStyles = {
  metric: {
    flex: '1 1 100px',
    background: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.sm,
    textAlign: 'center',
    minWidth: '80px'
  },
  metricValue: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
    textTransform: 'capitalize'
  },
  metricLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.textMuted,
    marginTop: '2px'
  },
  sectionLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: spacing.xs
  },
  reportRow: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.xs,
    padding: `${spacing.xs} 0`,
    borderBottom: `1px solid ${colors.border}`,
    flexWrap: 'wrap'
  },
  reportBadge: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    color: colors.textInverse,
    background: colors.primary,
    borderRadius: radius.full,
    padding: '1px 8px',
    minWidth: '24px',
    textAlign: 'center'
  },
  reportCategory: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.textPrimary,
    textTransform: 'capitalize'
  },
  reportTo: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary
  },
  reportDate: {
    fontSize: typography.fontSize.xs,
    color: colors.textMuted,
    fontFamily: typography.fontFamilyMono
  },
  flag: {
    fontSize: '10px',
    padding: '1px 6px',
    borderRadius: radius.sm,
    fontWeight: typography.fontWeight.medium
  },
  signalTag: {
    fontSize: typography.fontSize.xs,
    padding: '2px 8px',
    borderRadius: radius.sm,
    background: '#FEE2E2',
    color: '#991B1B',
    fontWeight: typography.fontWeight.medium,
    textTransform: 'capitalize'
  },
  continuedWarning: {
    marginTop: spacing.sm,
    padding: spacing.sm,
    background: '#FEF2F2',
    border: '1px solid #FECACA',
    borderRadius: radius.md,
    fontSize: typography.fontSize.sm,
    color: '#DC2626',
    fontWeight: typography.fontWeight.medium
  },
  recipientRow: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    padding: `${spacing.xs} 0`,
    borderBottom: `1px solid ${colors.border}`
  },
  recipientName: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textPrimary,
    textTransform: 'capitalize',
    minWidth: '80px'
  },
  recipientCount: {
    fontSize: typography.fontSize.xs,
    color: colors.textMuted
  },
  recipientAction: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium
  },
  verbalTag: {
    fontSize: '10px',
    padding: '1px 6px',
    borderRadius: radius.sm,
    background: '#FEF3C7',
    color: '#92400E'
  }
};
