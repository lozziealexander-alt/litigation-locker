/**
 * Analyze timeline for connections between events
 */

function analyzeConnections(documents, incidents = []) {
  const connections = [];

  // Combine documents and incidents into events
  const allEvents = [
    ...documents.map(d => ({
      id: d.id,
      type: 'document',
      evidenceType: d.evidence_type,
      date: d.document_date ? new Date(d.document_date) : null,
      data: d
    })),
    ...incidents.map(i => ({
      id: i.id,
      type: 'incident',
      evidenceType: i.type,
      subtype: i.subtype,
      severity: i.computed_severity || i.base_severity,
      date: i.incident_date ? new Date(i.incident_date) : null,
      data: i
    }))
  ].filter(e => e.date).sort((a, b) => a.date - b.date);

  if (allEvents.length < 2) {
    return connections;
  }

  // Find protected activities
  const protectedActivities = allEvents.filter(e =>
    e.evidenceType === 'PROTECTED_ACTIVITY'
  );

  // Find adverse actions and incidents
  const adverseEvents = allEvents.filter(e =>
    e.evidenceType === 'ADVERSE_ACTION' ||
    e.evidenceType === 'INCIDENT' ||
    e.subtype === 'adverse_action' ||
    e.subtype === 'retaliation'
  );

  // CONNECTION TYPE 1: Retaliation chains
  for (const activity of protectedActivities) {
    for (const adverse of adverseEvents) {
      if (adverse.date > activity.date) {
        const daysDiff = Math.floor((adverse.date - activity.date) / (1000 * 60 * 60 * 24));

        if (daysDiff <= 90) {
          connections.push({
            sourceId: activity.id,
            sourceType: activity.type,
            targetId: adverse.id,
            targetType: adverse.type,
            connectionType: 'retaliation_chain',
            daysBetween: daysDiff,
            strength: daysDiff <= 14 ? 'strong' : daysDiff <= 30 ? 'moderate' : 'weak',
            description: `${daysDiff} days after protected activity`,
            legalBasis: 'Burlington Northern v. White'
          });
        }
      }
    }
  }

  // CONNECTION TYPE 2: Escalation
  const severityOrder = { minor: 1, moderate: 2, severe: 3, egregious: 4 };

  for (let i = 0; i < allEvents.length - 1; i++) {
    const current = allEvents[i];
    const next = allEvents[i + 1];

    // Check if both have severity
    const currentSev = severityOrder[current.data?.computed_severity || current.data?.base_severity] || 0;
    const nextSev = severityOrder[next.data?.computed_severity || next.data?.base_severity] || 0;

    if (nextSev > currentSev && currentSev > 0) {
      const daysDiff = Math.floor((next.date - current.date) / (1000 * 60 * 60 * 24));

      connections.push({
        sourceId: current.id,
        sourceType: current.type,
        targetId: next.id,
        targetType: next.type,
        connectionType: 'escalation',
        daysBetween: daysDiff,
        strength: nextSev - currentSev >= 2 ? 'strong' : 'moderate',
        description: `Severity escalation`,
        legalBasis: 'Harris v. Forklift - pattern'
      });
    }
  }

  // CONNECTION TYPE 3: Temporal clusters (3+ events within 7 days)
  for (let i = 0; i < allEvents.length; i++) {
    const cluster = [allEvents[i]];

    for (let j = i + 1; j < allEvents.length; j++) {
      const daysDiff = Math.floor((allEvents[j].date - allEvents[i].date) / (1000 * 60 * 60 * 24));

      if (daysDiff <= 7) {
        cluster.push(allEvents[j]);
      } else {
        break;
      }
    }

    if (cluster.length >= 3) {
      connections.push({
        sourceId: cluster[0].id,
        sourceType: cluster[0].type,
        targetId: cluster[cluster.length - 1].id,
        targetType: cluster[cluster.length - 1].type,
        connectionType: 'temporal_cluster',
        daysBetween: Math.floor((cluster[cluster.length - 1].date - cluster[0].date) / (1000 * 60 * 60 * 24)),
        strength: 'moderate',
        description: `${cluster.length} events within 7 days`,
        legalBasis: 'Pervasive conduct pattern'
      });

      // Skip past this cluster
      i += cluster.length - 1;
    }
  }

  return connections;
}

/**
 * Detect overall escalation pattern
 */
function detectEscalationPattern(documents, incidents = []) {
  const allEvents = [
    ...documents.filter(d => d.evidence_type === 'INCIDENT' || d.evidence_type === 'ADVERSE_ACTION'),
    ...incidents
  ].filter(e => e.document_date || e.incident_date);

  if (allEvents.length < 2) {
    return { hasEscalation: false };
  }

  const sorted = allEvents.sort((a, b) => {
    const dateA = new Date(a.document_date || a.incident_date);
    const dateB = new Date(b.document_date || b.incident_date);
    return dateA - dateB;
  });

  const severityOrder = { minor: 1, moderate: 2, severe: 3, egregious: 4 };

  let escalations = 0;
  let deescalations = 0;

  for (let i = 0; i < sorted.length - 1; i++) {
    const currentSev = severityOrder[sorted[i].computed_severity || sorted[i].base_severity] || 0;
    const nextSev = severityOrder[sorted[i + 1].computed_severity || sorted[i + 1].base_severity] || 0;

    if (nextSev > currentSev) escalations++;
    if (nextSev < currentSev) deescalations++;
  }

  return {
    hasEscalation: escalations > deescalations,
    escalations,
    deescalations,
    trend: escalations > deescalations ? 'escalating' :
            deescalations > escalations ? 'deescalating' : 'stable'
  };
}

module.exports = {
  analyzeConnections,
  detectEscalationPattern
};
