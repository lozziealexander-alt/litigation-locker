import React, { useState, useEffect } from 'react';
import { colors, shadows, spacing, typography, radius, getEvidenceColor, getSeverityColor } from '../styles/tokens';

// ── Thread Registry (mirrored from src/main/analysis/thread-registry.js) ──────
const THREAD_DEFINITIONS = [
  { id: 'sexual_harassment',   name: 'Sexual Harassment',     description: 'Unwanted sexual conduct, propositions, or comments',                        tag_signals: ['sexual_harassment','harassment'],                              precedents: ['harris-v-forklift','faragher-ellerth'], color: '#8B5CF6' },
  { id: 'gender_harassment',   name: 'Gender Harassment',     description: 'Gender-based comments, stereotyping, or discriminatory treatment',           tag_signals: ['gender_harassment','harassment'],                              precedents: ['harris-v-forklift'],                    color: '#EC4899' },
  { id: 'retaliation',         name: 'Retaliation',           description: 'Adverse actions taken after protected activity',                             tag_signals: ['retaliation','protected_activity','adverse_action'],          precedents: ['burlington-northern','vance'],          color: '#F59E0B' },
  { id: 'exclusion',           name: 'Exclusion & Isolation', description: 'Systematic exclusion from meetings, decisions, or team activities',          tag_signals: ['exclusion','isolation'],                                       precedents: ['harris-v-forklift'],                    color: '#10B981' },
  { id: 'pay_discrimination',  name: 'Pay Discrimination',    description: 'Unequal compensation or benefits based on protected characteristics',         tag_signals: ['pay_discrimination'],                                         precedents: ['lilly-ledbetter'],                      color: '#3B82F6' },
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
  'INCIDENT':           ['harassment'],
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
  return signals;
}

function assignEventsToThreads(events) {
  const assignments = {};
  for (const evt of events) {
    const signals = buildEffectiveSignals(evt);
    for (const thread of THREAD_DEFINITIONS) {
      if (thread.tag_signals.some(sig => signals.has(sig))) {
        if (!assignments[thread.id]) assignments[thread.id] = { thread, events: [], documents: new Set() };
        assignments[thread.id].events.push(evt);
        (evt.documents || []).forEach(d => assignments[thread.id].documents.add(d.id));
      }
    }
  }
  for (const id in assignments) assignments[id].documents = Array.from(assignments[id].documents);
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
  const [activeTab, setActiveTab] = useState('overview');
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

    // Process events
    const evts = eventsResult.success ? (eventsResult.events || []) : [];
    setEvents(evts);
    setThreads(assignEventsToThreads(evts));

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
    } catch (e) {
      console.warn('[Dashboard] Failed to load causality links:', e);
    }
    try {
      const suggestResult = await window.api.incidents.suggest();
      if (suggestResult.success) setSuggestedIncidents(suggestResult.suggestions || []);
    } catch (e) {
      console.warn('[Dashboard] Failed to load suggested incidents:', e);
    }

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

  const alerts = getAlerts();
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
        <h1 style={styles.title}>Dashboard</h1>
        <p style={styles.subtitle}>Fresh eyes view of your case</p>
      </div>

      {/* Tab bar */}
      <div style={styles.tabBar}>
        <button style={activeTab === 'overview' ? {...styles.tab, ...styles.tabActive} : styles.tab} onClick={() => setActiveTab('overview')}>Overview</button>
        <button style={activeTab === 'threads'  ? {...styles.tab, ...styles.tabActive} : styles.tab} onClick={() => setActiveTab('threads')}>Threads ({THREAD_DEFINITIONS.length})</button>
      </div>

      {activeTab === 'overview' && (
      <div style={styles.content}>
        {/* Summary Card */}
        <div style={styles.summaryCard}>
          <h2 style={styles.cardTitle}>Case Summary</h2>
          <p style={styles.summaryText}>{generateSummary()}</p>
        </div>

        {/* Pattern Insights */}
        {(() => {
          const insights = getPatternInsights();
          if (insights.length === 0) return null;
          return (
            <div style={styles.card}>
              <h3
                style={styles.collapsibleTitle}
                onClick={() => toggleSection('insights')}
              >
                <span style={styles.chevron}>{collapsedSections.insights ? '\u25B6' : '\u25BC'}</span>
                Pattern Insights
                <span style={styles.badge}>{insights.length}</span>
              </h3>
              {!collapsedSections.insights && (
                <div style={styles.insightsGrid}>
                  {insights.map((insight, i) => (
                    <div key={i} style={styles.insightItem}>
                      <div style={styles.insightTop}>
                        <span style={styles.insightIcon}>{insight.icon}</span>
                        <span style={styles.insightCount}>{insight.count}</span>
                        <span style={styles.insightLabel}>{insight.label}</span>
                      </div>
                      <div style={styles.insightLegal}>{insight.legal}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        {/* Protected Class Status */}
        {protectedClasses.length > 0 && (
          <div style={{ ...styles.card, borderLeft: `3px solid ${colors.primary}`, marginBottom: spacing.md }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '14px', fontWeight: 600, color: colors.textPrimary }}>Protected Class Status:</span>
              {protectedClasses.map((pc, i) => (
                <span key={i} style={{
                  padding: '2px 10px', borderRadius: radius.full, fontSize: '12px', fontWeight: 500,
                  background: colors.primary + '14', color: colors.primary, border: `1px solid ${colors.primary}30`
                }}>
                  {pc.type}: {pc.value}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Stats Row */}
        <div style={styles.statsRow}>
          <StatCard
            icon={'\uD83D\uDCC4'}
            value={stats?.documentCount || 0}
            label="Documents"
            onClick={() => onNavigateToTimeline?.()}
          />
          <StatCard
            icon={'\uD83D\uDD34'}
            value={stats?.momentCount || 0}
            label="Moments"
            sublabel={stats?.incidentCount > 0 ? `${stats.incidentCount} incidents` : null}
            onClick={() => onNavigateToTimeline?.()}
          />
          <StatCard
            icon={'\uD83D\uDC65'}
            value={stats?.actorCount || 0}
            label="People"
            sublabel={[
              stats?.badActorCount > 0 ? `${stats.badActorCount} bad actor${stats.badActorCount !== 1 ? 's' : ''}` : null,
              stats?.chainCount > 0 ? `${stats.chainCount} in chain` : null
            ].filter(Boolean).join(' · ') || null}
            onClick={() => onNavigateToPeople?.()}
          />
          <StatCard
            icon={'\uD83D\uDCC5'}
            value={stats?.timelineSpanDays || 0}
            label="Days Span"
          />
          <StatCard
            icon={'\u{1F525}'}
            value={causalityLinks.length}
            label="Causality Links"
            sublabel={causalityLinks.length > 0 ? `${causalityLinks.filter(l => l.link_type === 'caused').length} causal` : 'none yet'}
          />
          {suggestedIncidents.length > 0 && (
            <StatCard
              icon={'\u{1F6A8}'}
              value={suggestedIncidents.length}
              label="Suggested Incidents"
              sublabel="Auto-detected patterns"
            />
          )}
        </div>

        {/* Case Strength */}
        {precedentAnalysis && (
          <div style={styles.card}>
            <h3
              style={styles.collapsibleTitle}
              onClick={() => toggleSection('strength')}
            >
              <span style={styles.chevron}>{collapsedSections.strength ? '\u25B6' : '\u25BC'}</span>
              Case Strength
              <span style={{
                ...styles.strengthBadge,
                background: precedentAnalysis.caseStrength >= 70 ? colors.success :
                             precedentAnalysis.caseStrength >= 40 ? colors.warning : colors.error
              }}>{precedentAnalysis.caseStrength}%</span>
            </h3>
            {!collapsedSections.strength && (
              <div
                style={{ cursor: 'pointer' }}
                onClick={() => setShowCaseStrength(true)}
                title="Click for detailed precedent analysis"
              >
                <div style={styles.strengthMeter}>
                  <div style={styles.strengthBarOuter}>
                    <div
                      style={{
                        ...styles.strengthBarInner,
                        width: `${precedentAnalysis.caseStrength}%`,
                        background: precedentAnalysis.caseStrength >= 70 ? colors.success :
                                   precedentAnalysis.caseStrength >= 40 ? colors.warning : colors.error
                      }}
                    />
                  </div>
                  <span style={styles.strengthValue}>{precedentAnalysis.caseStrength}%</span>
                </div>
                <div style={styles.precedentRow}>
                  {Object.entries(precedentAnalysis.precedents).slice(0, 3).map(([key, prec]) => (
                    <div key={key} style={styles.precedentMini}>
                      <span style={styles.precedentName}>{prec.name.split(' v.')[0]}</span>
                      <span style={{
                        ...styles.precedentScore,
                        color: prec.alignmentPercent >= 70 ? colors.success :
                               prec.alignmentPercent >= 40 ? colors.warning : colors.error
                      }}>
                        {prec.alignmentPercent}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Incident Chain Analysis (Employer Liability) */}
        {chainAnalysis && (
          <div style={styles.card}>
            <h3
              style={styles.collapsibleTitle}
              onClick={() => toggleSection('chain')}
            >
              <span style={styles.chevron}>{collapsedSections.chain ? '\u25B6' : '\u25BC'}</span>
              Employer Liability Analysis
              <span style={{
                ...styles.strengthBadge,
                background: chainAnalysis.employerLiability?.level === 'critical' ? colors.error :
                             chainAnalysis.employerLiability?.level === 'high' ? '#F97316' :
                             chainAnalysis.employerLiability?.level === 'moderate' ? colors.warning : colors.success
              }}>
                {chainAnalysis.employerLiability?.level?.toUpperCase()}
              </span>
            </h3>
            {!collapsedSections.chain && (
              <div style={{ padding: `0 ${spacing.md} ${spacing.md}` }}>
                {/* Top metrics row */}
                <div style={{ display: 'flex', gap: spacing.md, marginBottom: spacing.md, flexWrap: 'wrap' }}>
                  <div style={chainStyles.metric}>
                    <div style={chainStyles.metricValue}>{chainAnalysis.incidentSeverity || 'N/A'}</div>
                    <div style={chainStyles.metricLabel}>Incident Severity</div>
                  </div>
                  <div style={chainStyles.metric}>
                    <div style={chainStyles.metricValue}>{chainAnalysis.documentationStrength || 'N/A'}</div>
                    <div style={chainStyles.metricLabel}>Documentation</div>
                  </div>
                  <div style={chainStyles.metric}>
                    <div style={chainStyles.metricValue}>{chainAnalysis.reports?.length || 0}</div>
                    <div style={chainStyles.metricLabel}>Reports Filed</div>
                  </div>
                  <div style={chainStyles.metric}>
                    <div style={chainStyles.metricValue}>{chainAnalysis.retaliationEntries || 0}</div>
                    <div style={chainStyles.metricLabel}>Retaliation</div>
                  </div>
                </div>

                {/* Reports breakdown */}
                {chainAnalysis.reports?.length > 0 && (
                  <div style={{ marginBottom: spacing.md }}>
                    <div style={chainStyles.sectionLabel}>Notice History</div>
                    {chainAnalysis.reports.map((r, i) => (
                      <div key={i} style={chainStyles.reportRow}>
                        <span style={chainStyles.reportBadge}>#{r.noticeSequence}</span>
                        <span style={chainStyles.reportCategory}>{r.category?.replace('REPORT_', '').replace('_', ' ')}</span>
                        <span style={chainStyles.reportTo}>{r.reportedTo ? `to ${r.reportedTo}` : ''}</span>
                        {r.date && <span style={chainStyles.reportDate}>{r.date}</span>}
                        {r.flags?.map((f, fi) => (
                          <span key={fi} style={{
                            ...chainStyles.flag,
                            background: f.includes('no_action') ? '#FEE2E2' :
                                       f.includes('verbal') ? '#FEF3C7' :
                                       f.includes('continued') ? '#FEE2E2' : '#F3F4F6',
                            color: f.includes('no_action') ? '#DC2626' :
                                   f.includes('verbal') ? '#92400E' :
                                   f.includes('continued') ? '#DC2626' : '#6B7280'
                          }}>
                            {f.replace(/_/g, ' ')}
                          </span>
                        ))}
                      </div>
                    ))}
                  </div>
                )}

                {/* Liability signals */}
                {chainAnalysis.employerLiability?.signals?.length > 0 && (
                  <div>
                    <div style={chainStyles.sectionLabel}>Liability Signals (Faragher/Ellerth)</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing.xs }}>
                      {chainAnalysis.employerLiability.signals.map((signal, i) => (
                        <span key={i} style={chainStyles.signalTag}>
                          {signal.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>
                    {chainAnalysis.employerLiability.conductContinuedPostReport && (
                      <div style={chainStyles.continuedWarning}>
                        Conduct continued after employer was put on notice
                      </div>
                    )}
                  </div>
                )}

                {/* Notice by recipient */}
                {chainAnalysis.employerLiability?.noticeByRecipient &&
                  Object.keys(chainAnalysis.employerLiability.noticeByRecipient).length > 0 && (
                  <div style={{ marginTop: spacing.md }}>
                    <div style={chainStyles.sectionLabel}>Notice by Recipient</div>
                    {Object.entries(chainAnalysis.employerLiability.noticeByRecipient).map(([recipient, data]) => {
                      const importance = data.recipientImportance || {};
                      const importanceColors = {
                        critical: { bg: '#FEE2E2', color: '#DC2626', border: '#FECACA' },
                        high: { bg: '#FEF3C7', color: '#92400E', border: '#FDE68A' },
                        moderate: { bg: '#DBEAFE', color: '#1E40AF', border: '#BFDBFE' },
                        external: { bg: '#F3F4F6', color: '#6B7280', border: '#E5E7EB' },
                        low: { bg: '#F3F4F6', color: '#9CA3AF', border: '#E5E7EB' },
                      };
                      const ic = importanceColors[importance.level] || importanceColors.low;
                      const actionStatus = data.actionStatus || (data.actionTaken ? 'yes' : 'no');
                      const actionColor = actionStatus === 'yes' ? colors.success : actionStatus === 'no' ? colors.error : '#92400E';
                      const actionLabel = actionStatus === 'yes' ? 'action taken' : actionStatus === 'no' ? 'no action taken' : 'no remedy documented';

                      return (
                        <div key={recipient} style={{ ...chainStyles.recipientRow, flexDirection: 'column', alignItems: 'flex-start', gap: '4px', padding: `${spacing.sm} ${spacing.md}`, marginBottom: spacing.xs, border: `1px solid ${ic.border}`, borderRadius: radius.sm, background: ic.bg + '40' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, width: '100%', flexWrap: 'wrap' }}>
                            <span style={{ ...chainStyles.recipientName, fontWeight: 600 }}>{importance.label || recipient}</span>
                            <span style={chainStyles.recipientCount}>notified {data.timesNotified}x</span>
                            <span style={{ ...chainStyles.recipientAction, color: actionColor, fontWeight: 600 }}>
                              {actionLabel}
                            </span>
                            {data.allVerbalOnly && <span style={chainStyles.verbalTag}>verbal only</span>}
                          </div>
                          {importance.note && (
                            <div style={{ fontSize: '11px', color: ic.color, lineHeight: '1.3' }}>
                              {importance.note}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Two Column Layout */}
        <div style={styles.twoColumn}>
          {/* Left: Alerts */}
          <div style={styles.column}>
            <div style={styles.card}>
              <h3
                style={styles.collapsibleTitle}
                onClick={() => toggleSection('alerts')}
              >
                <span style={styles.chevron}>{collapsedSections.alerts ? '\u25B6' : '\u25BC'}</span>
                Pattern Alerts
                {alerts.length > 0 && <span style={styles.badge}>{alerts.length}</span>}
              </h3>
              {!collapsedSections.alerts && (
                alerts.length === 0 ? (
                  <p style={styles.emptyText}>No patterns detected yet. Add more evidence to identify patterns.</p>
                ) : (
                  <div style={styles.alertList}>
                    {alerts.map((alert, i) => (
                      <div
                        key={i}
                        style={{
                          ...styles.alertItem,
                          ...styles.clickableItem,
                          borderLeftColor: alert.severity === 'critical' ? colors.error :
                                           alert.severity === 'warning' ? colors.warning : colors.primary
                        }}
                        onClick={() => setSelectedAlert(alert)}
                        title="View details"
                      >
                        <div style={styles.alertTitle}>{alert.title}</div>
                        <div style={styles.alertDesc}>{alert.description}</div>
                        <div style={styles.alertLegal}>{alert.legal}</div>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>

            {/* Filing Deadlines */}
            {stats?.fchrDaysRemaining && (
              <div style={styles.card}>
                <h3
                  style={styles.collapsibleTitle}
                  onClick={() => toggleSection('deadlines')}
                >
                  <span style={styles.chevron}>{collapsedSections.deadlines ? '\u25B6' : '\u25BC'}</span>
                  Filing Deadlines
                </h3>
                {!collapsedSections.deadlines && (
                  <>
                    <div style={styles.deadlineList}>
                      <DeadlineItem
                        agency="FCHR (Florida)"
                        days={stats.fchrDaysRemaining}
                        total={365}
                      />
                      <DeadlineItem
                        agency="EEOC (Federal)"
                        days={stats.eeocDaysRemaining}
                        total={300}
                      />
                    </div>
                    <p style={styles.deadlineNote}>
                      Based on most recent documented incident
                    </p>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Right: Gaps + Key Players */}
          <div style={styles.column}>
            {/* Evidence Gaps */}
            <div style={styles.card}>
              <h3
                style={styles.collapsibleTitle}
                onClick={() => toggleSection('gaps')}
              >
                <span style={styles.chevron}>{collapsedSections.gaps ? '\u25B6' : '\u25BC'}</span>
                Evidence Gaps
                {gaps.length > 0 && <span style={styles.badge}>{gaps.length}</span>}
              </h3>
              {!collapsedSections.gaps && (
                gaps.length === 0 ? (
                  <p style={styles.emptyText}>No critical gaps identified. Keep documenting!</p>
                ) : (
                  <div style={styles.gapList}>
                    {gaps.map((gap, i) => (
                      <div
                        key={i}
                        style={{...styles.gapItem, ...styles.clickableItem}}
                        onClick={() => setShowCaseStrength(true)}
                        title={`${gap.recommendation}\n\nPrecedent: ${gap.precedent}`}
                      >
                        <div style={styles.gapElement}>{gap.element}</div>
                        <div style={styles.gapRec}>{gap.recommendation}</div>
                        <div style={styles.gapPrecedent}>{gap.precedent}</div>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>

            {/* Key Players */}
            <div style={styles.card}>
              <h3
                style={styles.collapsibleTitle}
                onClick={() => toggleSection('players')}
              >
                <span style={styles.chevron}>{collapsedSections.players ? '\u25B6' : '\u25BC'}</span>
                Key Players
                {topActors.length > 0 && <span style={styles.badge}>{topActors.length}</span>}
              </h3>
              {!collapsedSections.players && (
                topActors.length === 0 ? (
                  <p style={styles.emptyText}>No bad actors, enablers, or reporting chain actors identified yet.</p>
                ) : (
                  <div style={styles.actorList}>
                    {topActors.map(actor => {
                      const isBadActor = actor.classification === 'bad_actor';
                      const isEnabler = actor.classification === 'enabler';
                      const isChain = !!actor.in_reporting_chain;
                      return (
                        <div
                          key={actor.id}
                          style={{...styles.actorItem, ...styles.clickableItem}}
                          onClick={() => onSelectActor?.(actor)}
                          title="Click to view details"
                        >
                          <div style={{
                            ...styles.actorBadge,
                            background: isBadActor ? '#DC262610' : isEnabler ? '#F9731610' : isChain ? '#3B82F610' : '#6B728010',
                            color: isBadActor ? '#DC2626' : isEnabler ? '#F97316' : isChain ? '#3B82F6' : '#6B7280'
                          }}>
                            {actor.name.split(' ').map(p => p[0]).join('').slice(0, 2)}
                          </div>
                          <div style={styles.actorInfo}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={styles.actorName}>{actor.name}</span>
                              {isChain && <span style={styles.dashboardChainTag}>Chain</span>}
                            </div>
                            <div style={styles.actorRole}>
                              {actor.role || actor.relationship_to_self?.replace(/_/g, ' ') || actor.classification?.replace('_', ' ')}
                            </div>
                          </div>
                          {actor.appearance_count > 0 && (
                            <div style={styles.actorCount}>
                              {actor.appearance_count} doc{actor.appearance_count !== 1 ? 's' : ''}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      </div>
      )} {/* end activeTab === 'overview' */}

      {/* Threads Tab */}
      {activeTab === 'threads' && (
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
      )}

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
                        onSelectDocument?.(doc.id);
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
