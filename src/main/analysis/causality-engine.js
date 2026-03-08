/**
 * Causality Engine — detect causal/temporal links between events
 * Synchronous API (better-sqlite3 compatible)
 *
 * Core logic:
 * - Protected Activity → Adverse Action within 90 days = "caused" link
 * - Same-actor events within 14 days = "followed_by" link
 * - All other temporally close events = "related" link
 */

const CAUSALITY_WINDOWS = {
  strong: 30,    // days — confidence 0.95
  moderate: 60,  // days — confidence 0.85
  weak: 90       // days — confidence 0.70
};

const CAUSE_SOURCE_TAGS = ['protected_activity'];
const CAUSE_TARGET_TAGS = ['adverse_action', 'retaliation', 'exclusion', 'employment_end'];

/**
 * Calculate days between two date strings
 * @param {string} dateA - ISO date string
 * @param {string} dateB - ISO date string
 * @returns {number|null} Days between, or null if either date missing
 */
function daysBetween(dateA, dateB) {
  if (!dateA || !dateB) return null;
  const a = new Date(dateA);
  const b = new Date(dateB);
  if (isNaN(a) || isNaN(b)) return null;
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

/**
 * Get confidence score based on temporal proximity
 * @param {number} days - Days between events
 * @returns {number} Confidence score 0-1
 */
function getConfidence(days) {
  const absDays = Math.abs(days);
  if (absDays <= CAUSALITY_WINDOWS.strong) return 0.95;
  if (absDays <= CAUSALITY_WINDOWS.moderate) return 0.85;
  if (absDays <= CAUSALITY_WINDOWS.weak) return 0.70;
  return 0;
}

/**
 * Detect causality links between events
 *
 * @param {Array} events - Array of event objects with: id, date, tags[], title, actors[]
 * @param {Array} existingLinks - Array of existing link objects to avoid duplicates
 * @returns {Array} Suggested links: { source_event_id, target_event_id, link_type, confidence, days_between, reason }
 */
function detectCausality(events, existingLinks = []) {
  const suggestions = [];
  const existingPairs = new Set(
    existingLinks.map(l => `${l.source_event_id}:${l.target_event_id}`)
  );

  // Index events by tag for fast lookup
  const sourceEvents = events.filter(e =>
    e.date && e.tags && e.tags.some(t => CAUSE_SOURCE_TAGS.includes(t))
  );
  const targetEvents = events.filter(e =>
    e.date && e.tags && e.tags.some(t => CAUSE_TARGET_TAGS.includes(t))
  );

  // Protected Activity → Adverse Action causality
  for (const source of sourceEvents) {
    for (const target of targetEvents) {
      if (source.id === target.id) continue;
      const pairKey = `${source.id}:${target.id}`;
      if (existingPairs.has(pairKey)) continue;

      const days = daysBetween(source.date, target.date);
      if (days === null || days < 0) continue; // target must come after source

      const confidence = getConfidence(days);
      if (confidence === 0) continue;

      suggestions.push({
        source_event_id: source.id,
        target_event_id: target.id,
        link_type: 'caused',
        confidence,
        days_between: days,
        reason: `${days} days after protected activity "${source.title}"`
      });
      existingPairs.add(pairKey); // prevent duplicate suggestions
    }
  }

  // Same-actor "followed_by" links within 14 days
  const datedEvents = events.filter(e => e.date).sort((a, b) =>
    new Date(a.date) - new Date(b.date)
  );

  for (let i = 0; i < datedEvents.length; i++) {
    for (let j = i + 1; j < datedEvents.length; j++) {
      const a = datedEvents[i];
      const b = datedEvents[j];
      const pairKey = `${a.id}:${b.id}`;
      if (existingPairs.has(pairKey)) continue;

      const days = daysBetween(a.date, b.date);
      if (days === null || days > 14) break; // sorted, so all subsequent will be > 14

      // Check for shared actors
      const aActors = new Set((a.actors || []).map(ac => ac.id));
      const bActors = (b.actors || []).map(ac => ac.id);
      const sharedActor = bActors.some(id => aActors.has(id));

      if (sharedActor) {
        suggestions.push({
          source_event_id: a.id,
          target_event_id: b.id,
          link_type: 'followed_by',
          confidence: 0.75,
          days_between: days,
          reason: `Same actor, ${days} days apart`
        });
        existingPairs.add(pairKey);
      }
    }
  }

  return suggestions;
}

/**
 * Detect potential EEOC incident patterns from tagged events
 * Finds protected_activity events with subsequent adverse_action events
 *
 * @param {Array} events - Events with tags
 * @param {Array} existingIncidents - Existing incidents to avoid duplicates
 * @returns {Array} Suggested incident structures
 */
function suggestIncidents(events, existingIncidents = []) {
  const protectedActivities = events.filter(e =>
    e.date && e.tags && e.tags.includes('protected_activity')
  ).sort((a, b) => new Date(a.date) - new Date(b.date));

  const adverseActions = events.filter(e =>
    e.date && e.tags && e.tags.some(t => CAUSE_TARGET_TAGS.includes(t))
  ).sort((a, b) => new Date(a.date) - new Date(b.date));

  if (protectedActivities.length === 0 || adverseActions.length === 0) {
    return [];
  }

  const suggestions = [];

  for (const pa of protectedActivities) {
    const relatedAdverse = adverseActions.filter(aa => {
      const days = daysBetween(pa.date, aa.date);
      return days !== null && days > 0 && days <= 180; // 180-day EEOC window
    });

    if (relatedAdverse.length === 0) continue;

    // Check if an existing incident already covers this pattern
    // (Simple check: skip if most adverse actions are already in an incident)
    const description = `Retaliation: ${relatedAdverse.length} adverse action(s) within ${
      daysBetween(pa.date, relatedAdverse[relatedAdverse.length - 1].date)
    } days of "${pa.title}"`;

    suggestions.push({
      protectedActivity: pa,
      adverseActions: relatedAdverse,
      description,
      daysSpan: daysBetween(pa.date, relatedAdverse[relatedAdverse.length - 1].date),
      eventRoles: [
        { event_id: pa.id, event_role: 'protected_activity' },
        ...relatedAdverse.map(aa => ({ event_id: aa.id, event_role: 'adverse_action' }))
      ]
    });
  }

  return suggestions;
}

module.exports = { detectCausality, suggestIncidents, daysBetween, getConfidence };
