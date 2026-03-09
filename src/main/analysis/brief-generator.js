// SESSION-9E: Lawyer Brief Generator
// Synthesises all case data into a structured lawyer narrative overview.

const THREAD_DEFINITIONS = [
  { id: 'sexual_harassment',   name: 'Sexual Harassment',     tag_signals: ['sexual_harassment', 'harassment'],                            precedents: ['Harris v. Forklift Systems (1993)', 'Faragher v. Boca Raton (1998)'], color: '#8B5CF6' },
  { id: 'gender_harassment',   name: 'Gender Harassment',     tag_signals: ['gender_harassment', 'harassment'],                             precedents: ['Harris v. Forklift Systems (1993)'],                                  color: '#EC4899' },
  { id: 'retaliation',         name: 'Retaliation',           tag_signals: ['retaliation', 'protected_activity', 'adverse_action'],        precedents: ['Burlington Northern v. White (2006)', 'Vance v. Ball State (2013)'],  color: '#F59E0B' },
  { id: 'exclusion',           name: 'Exclusion & Isolation', tag_signals: ['exclusion', 'isolation'],                                      precedents: ['Harris v. Forklift Systems (1993)'],                                  color: '#10B981' },
  { id: 'pay_discrimination',  name: 'Pay Discrimination',    tag_signals: ['pay_discrimination'],   evidence_type_signals: ['PAY_RECORD'], precedents: ['Lilly Ledbetter Fair Pay Act (2009)'],                                color: '#3B82F6' },
  { id: 'hostile_environment', name: 'Hostile Environment',   tag_signals: ['hostile_environment'],                                         precedents: ['Harris v. Forklift (1993)', 'Meritor Savings Bank v. Vinson (1986)'],color: '#6366F1' },
  { id: 'hr_failure',          name: 'HR Failure to Act',     tag_signals: ['help_request', 'hr_failure', 'ignored_complaint'], evidence_type_signals: ['REQUEST_FOR_HELP', 'RESPONSE'], precedents: ['Faragher v. Boca Raton (1998)', 'Vance v. Ball State (2013)'], color: '#A855F7' }
];

// Legal elements per thread (simplified checklist)
const THREAD_ELEMENTS = {
  sexual_harassment: [
    { key: 'unwelcome',         label: 'Unwelcome conduct',                   tags: ['harassment'], evidence_types: [] },
    { key: 'protected_class',   label: 'Based on sex/gender',                 tags: ['sexual_harassment', 'gender_harassment'], evidence_types: [] },
    { key: 'severe_pervasive',  label: 'Severe or pervasive',                 tags: [], evidence_types: [], minEvents: 3 },
    { key: 'employer_knowledge',label: 'Employer knew or should have known',  tags: ['hr_failure', 'help_request', 'ignored_complaint'], evidence_types: ['REQUEST_FOR_HELP', 'RESPONSE'] }
  ],
  gender_harassment: [
    { key: 'unwelcome',         label: 'Unwelcome conduct',                   tags: ['harassment'], evidence_types: [] },
    { key: 'protected_class',   label: 'Based on sex/gender',                 tags: ['gender_harassment'], evidence_types: [] },
    { key: 'severe_pervasive',  label: 'Severe or pervasive',                 tags: [], evidence_types: [], minEvents: 3 },
    { key: 'employer_knowledge',label: 'Employer knew or should have known',  tags: ['help_request'], evidence_types: ['REQUEST_FOR_HELP'] }
  ],
  retaliation: [
    { key: 'protected_activity',label: 'Protected activity occurred',         tags: ['protected_activity'], evidence_types: ['PROTECTED_ACTIVITY'] },
    { key: 'employer_knowledge',label: 'Employer aware of protected activity',tags: ['protected_activity'], evidence_types: [] },
    { key: 'adverse_action',    label: 'Adverse employment action taken',     tags: ['adverse_action'], evidence_types: ['ADVERSE_ACTION'] },
    { key: 'causal_link',       label: 'Causal connection (timing / nexus)',  tags: ['retaliation'], evidence_types: [], minEvents: 2 }
  ],
  exclusion: [
    { key: 'systematic',        label: 'Pattern of exclusion (not isolated)', tags: ['exclusion', 'isolation'], evidence_types: [], minEvents: 2 },
    { key: 'protected_class',   label: 'Tied to protected characteristic',   tags: ['exclusion'], evidence_types: [] },
    { key: 'conditions_altered',label: 'Altered terms/conditions of employ.', tags: ['adverse_action'], evidence_types: ['ADVERSE_ACTION'] }
  ],
  pay_discrimination: [
    { key: 'pay_disparity',     label: 'Pay disparity documented',            tags: ['pay_discrimination'], evidence_types: ['PAY_RECORD'] },
    { key: 'comparator',        label: 'Comparable employees identified',     tags: [], evidence_types: [] },
    { key: 'protected_class',   label: 'Disparity tied to protected class',   tags: ['pay_discrimination'], evidence_types: [] }
  ],
  hostile_environment: [
    { key: 'pervasive',         label: 'Conduct pervasive / ongoing',         tags: ['hostile_environment', 'harassment'], evidence_types: [], minEvents: 3 },
    { key: 'protected_class',   label: 'Based on protected characteristic',   tags: [], evidence_types: [] },
    { key: 'employer_knowledge',label: 'Employer aware of conduct',           tags: ['help_request', 'hr_failure'], evidence_types: ['REQUEST_FOR_HELP'] },
    { key: 'conditions_altered',label: 'Hostile / abusive work environment',  tags: ['hostile_environment'], evidence_types: [] }
  ],
  hr_failure: [
    { key: 'complaint_made',    label: 'Complaint formally made to HR/mgmt',  tags: ['help_request'], evidence_types: ['REQUEST_FOR_HELP'] },
    { key: 'no_investigation',  label: 'No adequate investigation taken',     tags: ['ignored_complaint', 'hr_failure'], evidence_types: [] },
    { key: 'no_remediation',    label: 'No corrective action taken',          tags: ['hr_failure'], evidence_types: [] }
  ]
};

/**
 * Main entry point — generate a complete brief from raw case data.
 */
function generateBrief(events, documents, actors, incidents, caseContext) {
  const allTags = buildEventTagMap(events);

  // 1. Assign events to threads
  const threadAssignments = assignToThreads(events, allTags, documents);

  // 2. Active threads (have at least 1 event or evidence signal)
  const activeThreads = THREAD_DEFINITIONS.filter(t => {
    const evts = threadAssignments[t.id] || [];
    const docs = documents.filter(d => t.evidence_type_signals && t.evidence_type_signals.includes(d.evidence_type));
    return evts.length > 0 || docs.length > 0;
  });

  // 3. Thread analysis
  const threadBreakdown = activeThreads.map(thread => {
    const threadEvents = threadAssignments[thread.id] || [];
    const threadDocs = findDocsForThread(thread, threadEvents, documents);
    const elements = checkElements(thread, threadEvents, threadDocs, allTags);
    const strength = calcThreadStrength(threadEvents, threadDocs, elements);
    const gaps = findThreadGaps(thread, threadEvents, threadDocs, elements);
    return {
      id: thread.id,
      name: thread.name,
      color: thread.color,
      precedents: thread.precedents,
      eventCount: threadEvents.length,
      docCount: threadDocs.length,
      elements,
      strength,
      keyEvidence: threadDocs.slice(0, 5).map(d => ({
        id: d.id,
        filename: d.filename,
        date: d.document_date || d.file_created_at,
        type: d.evidence_type
      })),
      gaps
    };
  });

  // 4. Timeline
  const sortedEvents = [...events]
    .filter(e => e.date)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const timelineStart = sortedEvents[0]?.date || null;
  const timelineEnd   = sortedEvents[sortedEvents.length - 1]?.date || null;
  const timelineGaps  = detectTimelineGaps(sortedEvents);
  const criticalMoments = selectCriticalMoments(sortedEvents, allTags, 12);

  // 5. Actor summary
  const actorSummary = buildActorSummary(actors, events, documents, allTags);

  // 6. Overall strength
  const overallStrength = calcOverallStrength(threadBreakdown, sortedEvents, documents, timelineGaps);

  // 7. Case type label
  const caseType = detectCaseType(activeThreads);

  // 8. Red flags
  const redFlags = buildRedFlags(timelineGaps, documents, events, caseContext);

  return {
    generatedAt: new Date().toISOString(),
    executive: {
      caseType,
      timeSpan: timelineStart && timelineEnd
        ? `${formatDate(timelineStart)} — ${formatDate(timelineEnd)}`
        : 'No dated events yet',
      timeSpanDays: timelineStart && timelineEnd
        ? Math.round((new Date(timelineEnd) - new Date(timelineStart)) / 86400000)
        : 0,
      counts: {
        documents: documents.length,
        events: events.length,
        actors: actors.length,
        incidents: incidents.length,
        activeThreads: activeThreads.length
      },
      strength: overallStrength
    },
    timeline: {
      start: timelineStart,
      end: timelineEnd,
      gaps: timelineGaps,
      criticalMoments
    },
    threads: threadBreakdown,
    actors: actorSummary,
    redFlags
  };
}

// ──────────────────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────────────────

function buildEventTagMap(events) {
  // Returns { eventId: [tag, tag, ...] }
  const map = {};
  for (const e of events) {
    map[e.id] = e.tags || [];
  }
  return map;
}

function assignToThreads(events, tagMap, documents) {
  const assignments = {};
  for (const thread of THREAD_DEFINITIONS) {
    assignments[thread.id] = [];
  }
  for (const evt of events) {
    const tags = tagMap[evt.id] || [];
    const evtType = evt.evidence_type || '';
    for (const thread of THREAD_DEFINITIONS) {
      const tagMatch  = thread.tag_signals.some(s => tags.includes(s));
      const typeMatch = thread.evidence_type_signals && thread.evidence_type_signals.includes(evtType);
      if (tagMatch || typeMatch) {
        assignments[thread.id].push(evt);
      }
    }
  }
  return assignments;
}

function findDocsForThread(thread, threadEvents, documents) {
  const eventDocIds = new Set(
    threadEvents.flatMap(e => (e.linkedDocIds || []))
  );
  const typeMatch = (d) =>
    thread.evidence_type_signals && thread.evidence_type_signals.includes(d.evidence_type);
  return documents.filter(d => eventDocIds.has(d.id) || typeMatch(d));
}

function checkElements(thread, threadEvents, threadDocs, tagMap) {
  const defs = THREAD_ELEMENTS[thread.id] || [];
  const allEventTags = new Set(threadEvents.flatMap(e => tagMap[e.id] || []));
  const allDocTypes  = new Set(threadDocs.map(d => d.evidence_type));

  return defs.map(el => {
    const tagHit  = el.tags.some(t => allEventTags.has(t));
    const typeHit = el.evidence_types.some(t => allDocTypes.has(t));
    const countHit = el.minEvents ? threadEvents.length >= el.minEvents : true;

    let status;
    if ((tagHit || typeHit) && countHit) {
      status = 'satisfied';
    } else if (tagHit || typeHit || threadEvents.length > 0) {
      status = 'partial';
    } else {
      status = 'missing';
    }

    return { key: el.key, label: el.label, status };
  });
}

function calcThreadStrength(threadEvents, threadDocs, elements) {
  if (threadEvents.length === 0 && threadDocs.length === 0) return 0;

  const satisfied = elements.filter(e => e.status === 'satisfied').length;
  const partial   = elements.filter(e => e.status === 'partial').length;
  const total     = elements.length || 1;

  // Elements score (0-10)
  const elementScore = ((satisfied + partial * 0.5) / total) * 10;

  // Evidence density bonus (0-10)
  const densityScore = Math.min(threadDocs.length * 1.5 + threadEvents.length * 0.5, 10);

  // Weighted average: 60% elements, 40% density
  const raw = elementScore * 0.6 + densityScore * 0.4;
  return Math.round(Math.min(raw, 10) * 10) / 10;
}

function findThreadGaps(thread, threadEvents, threadDocs, elements) {
  const gaps = [];
  const missing = elements.filter(e => e.status === 'missing');
  for (const el of missing) {
    gaps.push(`No evidence for: ${el.label}`);
  }
  if (threadDocs.length === 0) {
    gaps.push('No documents directly linked to this thread');
  }
  if (threadEvents.length === 0) {
    gaps.push('No events tagged to this thread');
  }
  return gaps;
}

function detectTimelineGaps(sortedEvents) {
  const gaps = [];
  const GAP_THRESHOLD_DAYS = 21;
  for (let i = 1; i < sortedEvents.length; i++) {
    const prev = new Date(sortedEvents[i - 1].date);
    const curr = new Date(sortedEvents[i].date);
    const days = Math.round((curr - prev) / 86400000);
    if (days >= GAP_THRESHOLD_DAYS) {
      gaps.push({
        from: sortedEvents[i - 1].date,
        to: sortedEvents[i].date,
        days,
        label: `${days}-day gap (${formatDate(sortedEvents[i - 1].date)} — ${formatDate(sortedEvents[i].date)})`
      });
    }
  }
  return gaps;
}

function selectCriticalMoments(sortedEvents, tagMap, maxCount) {
  // Score events by importance; pick top N
  const scored = sortedEvents.map(evt => {
    const tags = tagMap[evt.id] || [];
    let score = 0;
    if (tags.includes('adverse_action'))    score += 5;
    if (tags.includes('protected_activity'))score += 4;
    if (tags.includes('retaliation'))       score += 4;
    if (tags.includes('help_request'))      score += 3;
    if (tags.includes('hr_failure'))        score += 3;
    if (tags.includes('harassment'))        score += 2;
    if (evt.severity === 'egregious')       score += 3;
    if (evt.severity === 'severe')          score += 2;
    if (evt.severity === 'moderate')        score += 1;
    score += Math.min((evt.linkedDocIds || []).length, 3);
    return { ...evt, _score: score };
  });

  scored.sort((a, b) => b._score - a._score);
  const top = scored.slice(0, maxCount);
  // Re-sort by date for display
  top.sort((a, b) => new Date(a.date) - new Date(b.date));

  return top.map(e => ({
    id: e.id,
    date: e.date,
    title: e.title,
    tags: tagMap[e.id] || [],
    severity: e.severity,
    score: e._score
  }));
}

function buildActorSummary(actors, events, documents, tagMap) {
  return actors.map(actor => {
    // Count events mentioning this actor
    const actorEvents = events.filter(e => (e.actorIds || []).includes(actor.id));
    // Count docs mentioning this actor
    const actorDocs = documents.filter(d => (d.actorIds || []).includes(actor.id));

    let reliabilityLabel = null;
    if (['witness_neutral', 'witness_supportive', 'corroborator'].includes(actor.classification)) {
      reliabilityLabel = actor.has_written_statement && actor.statement_is_dated && actor.statement_is_specific
        ? 'High (contemporaneous, specific statement)'
        : actor.has_written_statement
          ? 'Moderate (statement exists)'
          : 'Low (no written statement)';
    }

    return {
      id: actor.id,
      name: actor.name,
      classification: actor.classification,
      role: actor.role || actor.title || null,
      eventCount: actorEvents.length,
      docCount: actorDocs.length,
      reliabilityLabel,
      would_they_help: actor.would_they_help,
      still_employed: actor.still_employed
    };
  });
}

function calcOverallStrength(threadBreakdown, sortedEvents, documents, gaps) {
  if (threadBreakdown.length === 0) return 0;

  // Documentation density (40%)
  const docsPerEvent = sortedEvents.length > 0 ? documents.length / sortedEvents.length : 0;
  const densityScore = Math.min(docsPerEvent * 2.5, 10);

  // Thread avg strength (40%)
  const avgThread = threadBreakdown.length > 0
    ? threadBreakdown.reduce((s, t) => s + t.strength, 0) / threadBreakdown.length
    : 0;

  // Timeline continuity (20%): fewer gaps = higher
  const continuityScore = Math.max(10 - gaps.length * 2, 0);

  const raw = densityScore * 0.4 + avgThread * 0.4 + continuityScore * 0.2;
  return Math.round(Math.min(raw, 10) * 10) / 10;
}

function detectCaseType(activeThreads) {
  if (activeThreads.length === 0) return 'Undetermined';
  return activeThreads.map(t => t.name).join(' + ');
}

function buildRedFlags(gaps, documents, events, caseContext) {
  const flags = [];

  // Timeline gaps
  if (gaps.length > 0) {
    flags.push({
      type: 'timeline_gap',
      severity: gaps.length >= 3 ? 'high' : 'medium',
      label: `${gaps.length} timeline gap${gaps.length > 1 ? 's' : ''} identified`,
      detail: gaps.map(g => g.label).join('; ')
    });
  }

  // No HR complaint documents
  const hrDocs = documents.filter(d =>
    d.evidence_type === 'REQUEST_FOR_HELP' || (d.filename || '').toLowerCase().includes('hr')
  );
  if (hrDocs.length === 0) {
    flags.push({
      type: 'missing_hr_docs',
      severity: 'high',
      label: 'No HR complaint documents found',
      detail: 'Complaint to HR is a key element for many employment claims'
    });
  }

  // No protected activity documented
  const hasProtectedActivity = events.some(e => (e.tags || []).includes('protected_activity'));
  const hasProtectedDoc = documents.some(d => d.evidence_type === 'PROTECTED_ACTIVITY');
  if (!hasProtectedActivity && !hasProtectedDoc) {
    flags.push({
      type: 'missing_protected_activity',
      severity: 'medium',
      label: 'No protected activity documented',
      detail: 'Retaliation claims require a documented protected activity'
    });
  }

  // No adverse action documented
  const hasAdverseAction = events.some(e => (e.tags || []).includes('adverse_action'));
  const hasAdverseDoc = documents.some(d => d.evidence_type === 'ADVERSE_ACTION');
  if (!hasAdverseAction && !hasAdverseDoc) {
    flags.push({
      type: 'missing_adverse_action',
      severity: 'medium',
      label: 'No adverse action documented',
      detail: 'Many claims require a documented adverse employment action'
    });
  }

  // Sparse evidence overall
  if (documents.length < 5) {
    flags.push({
      type: 'sparse_evidence',
      severity: 'high',
      label: `Only ${documents.length} document${documents.length !== 1 ? 's' : ''} in case`,
      detail: 'More contemporaneous evidence significantly strengthens any claim'
    });
  }

  return flags;
}

function formatDate(isoStr) {
  if (!isoStr) return 'Unknown';
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return isoStr;
  }
}

module.exports = { generateBrief, THREAD_DEFINITIONS };
