// Thread Registry - defines claim threads and how events are assigned to them.
// Colors are categorical only (visual differentiation, no semantic meaning).

const THREAD_DEFINITIONS = [
  {
    id: 'sexual_harassment',
    name: 'Sexual Harassment',
    description: 'Unwanted sexual conduct, propositions, or comments',
    tag_signals: ['sexual_harassment', 'harassment'],
    precedents: ['harris-v-forklift', 'faragher-ellerth'],
    color: '#8B5CF6'
  },
  {
    id: 'gender_harassment',
    name: 'Gender Harassment',
    description: 'Gender-based comments, stereotyping, or discriminatory treatment',
    tag_signals: ['gender_harassment', 'harassment'],
    precedents: ['harris-v-forklift'],
    color: '#EC4899'
  },
  {
    id: 'retaliation',
    name: 'Retaliation',
    description: 'Adverse actions taken after protected activity',
    tag_signals: ['retaliation', 'protected_activity', 'adverse_action'],
    require_combo: ['protected_activity', 'adverse_action'], // bonus scoring if BOTH present across thread
    precedents: ['burlington-northern', 'vance'],
    color: '#F59E0B'
  },
  {
    id: 'exclusion',
    name: 'Exclusion & Isolation',
    description: 'Systematic exclusion from meetings, decisions, or team activities',
    tag_signals: ['exclusion', 'isolation'],
    precedents: ['harris-v-forklift'],
    color: '#10B981'
  },
  {
    id: 'pay_discrimination',
    name: 'Pay Discrimination',
    description: 'Unequal compensation or benefits based on protected characteristics',
    tag_signals: ['pay_discrimination'],
    evidence_type_signals: ['PAY_RECORD'],
    precedents: ['lilly-ledbetter'],
    color: '#3B82F6'
  },
  {
    id: 'hostile_environment',
    name: 'Hostile Environment',
    description: 'Pervasive conduct that creates an abusive or intimidating workplace',
    tag_signals: ['hostile_environment'],
    precedents: ['harris-v-forklift', 'meritor'],
    color: '#6366F1'
  },
  {
    id: 'hr_failure',
    name: 'HR Failure to Act',
    description: 'HR ignored complaints, failed to investigate, or enabled misconduct',
    tag_signals: ['help_request', 'hr_failure', 'ignored_complaint'],
    evidence_type_signals: ['REQUEST_FOR_HELP', 'RESPONSE'],
    precedents: ['faragher-ellerth', 'vance'],
    color: '#A855F7'
  }
];

function assignEventsToThreads(events) {
  const assignments = {};

  for (const evt of events) {
    const tags = evt.tags || [];
    const evtType = evt.evidence_type || '';

    for (const thread of THREAD_DEFINITIONS) {
      let matches = false;

      // Check tag signals
      if (thread.tag_signals.some(sig => tags.includes(sig))) {
        matches = true;
      }

      // Check evidence_type signals (documents linked to this event)
      if (!matches && thread.evidence_type_signals) {
        const docTypes = (evt.documents || []).map(d => d.evidence_type);
        if (thread.evidence_type_signals.some(sig => docTypes.includes(sig))) {
          matches = true;
        }
      }

      if (matches) {
        if (!assignments[thread.id]) {
          assignments[thread.id] = {
            thread,
            events: [],
            documents: new Set()
          };
        }
        assignments[thread.id].events.push(evt);

        // Collect linked document IDs
        (evt.documents || []).forEach(doc => assignments[thread.id].documents.add(doc.id));
      }
    }
  }

  // Convert document Sets to arrays
  for (const threadId in assignments) {
    assignments[threadId].documents = Array.from(assignments[threadId].documents);
  }

  return assignments;
}

module.exports = { THREAD_DEFINITIONS, assignEventsToThreads };
