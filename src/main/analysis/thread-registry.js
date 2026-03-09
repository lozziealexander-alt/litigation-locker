// Thread Registry - defines claim threads and how events are assigned to them.
// Colors are categorical only (visual differentiation, no semantic meaning).

const THREAD_DEFINITIONS = [
  {
    id: 'sexual_harassment',
    name: 'Sexual Harassment',
    description: 'Unwanted sexual conduct, propositions, or sexual comments',
    tag_signals: ['sexual_harassment'],
    precedents: ['harris-v-forklift', 'faragher-ellerth', 'meritor'],
    color: '#8B5CF6'
  },
  {
    id: 'gender_harassment',
    name: 'Gender Harassment',
    description: 'Gender-based comments, stereotyping, or discriminatory treatment',
    tag_signals: ['gender_harassment'],
    precedents: ['harris-v-forklift'],
    color: '#EC4899'
  },
  {
    id: 'retaliation',
    name: 'Retaliation',
    description: 'Adverse actions taken after protected activity',
    tag_signals: ['retaliation', 'protected_activity', 'adverse_action'],
    require_combo: ['protected_activity', 'adverse_action'],
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

  // Keyword maps for content-based matching
  const sexualKeywords = ['sexual', 'grope', 'groping', 'unwanted touch', 'unwanted advance', 'inappropriate touch', 'proposition'];
  const genderKeywords = ['gendered', 'sexist', 'stereotype', 'because she', 'because he', 'boys club', 'gender bias', 'gender discrimination',
    'for a woman', 'for a man', 'as a woman', 'as a man', 'like a woman', 'like a man', 'too aggressive for a', 'too emotional'];

  for (const evt of events) {
    // Skip context events
    if (evt.is_context_event) continue;

    const tags = evt.tags || [];
    const evtType = evt.evidence_type || '';
    const evtText = ((evt.title || '') + ' ' + (evt.what_happened || '') + ' ' + (evt.description || '')).toLowerCase();

    // Resolve generic 'harassment' tag into specific sub-type
    const resolvedTags = new Set(tags);
    if (resolvedTags.has('harassment') && !resolvedTags.has('sexual_harassment') && !resolvedTags.has('gender_harassment')) {
      if (sexualKeywords.some(k => evtText.includes(k))) {
        resolvedTags.add('sexual_harassment');
      } else if (genderKeywords.some(k => evtText.includes(k))) {
        resolvedTags.add('gender_harassment');
      } else {
        resolvedTags.add('hostile_environment');
      }
      resolvedTags.delete('harassment');
    }

    // Content-based correction: reclassify sexual_harassment to gender_harassment if content is gendered, not sexual
    if (resolvedTags.has('sexual_harassment') && !sexualKeywords.some(k => evtText.includes(k))) {
      if (genderKeywords.some(k => evtText.includes(k))) {
        resolvedTags.delete('sexual_harassment');
        resolvedTags.add('gender_harassment');
      }
    }

    for (const thread of THREAD_DEFINITIONS) {
      let matches = false;

      // Check tag signals
      if (thread.tag_signals.some(sig => resolvedTags.has(sig))) {
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
