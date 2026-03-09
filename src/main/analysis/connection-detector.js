const { v4: uuidv4 } = require('uuid');

/**
 * Auto-detect connections between events
 * Finds: retaliation chains, escalation patterns, temporal clusters, actor continuity
 */
class ConnectionDetector {

  /**
   * Main entry point - detect all connections for a case
   */
  static detectConnections(caseDb, caseId) {
    const events = caseDb.prepare(`
      SELECT
        e.*,
        GROUP_CONCAT(et.tag) as tags
      FROM events e
      LEFT JOIN event_tags et ON et.event_id = e.id
      WHERE e.case_id = ?
      AND (e.is_context_event IS NULL OR e.is_context_event = 0)
      GROUP BY e.id
      ORDER BY e.date ASC
    `).all(caseId);

    console.log(`[ConnectionDetector] Analyzing ${events.length} events`);

    const connections = [];

    connections.push(...this.detectRetaliationChains(events));
    connections.push(...this.detectEscalationPatterns(events));
    connections.push(...this.detectTemporalClusters(events));
    connections.push(...this.detectActorContinuity(events, caseDb));

    console.log(`[ConnectionDetector] Found ${connections.length} connections`);

    this.saveConnections(caseDb, caseId, connections);

    return connections;
  }

  /**
   * Detect retaliation chains
   * Protected activity followed by adverse action within 30 days
   */
  static detectRetaliationChains(events) {
    const connections = [];
    const protectedTags = ['REPORTED', 'PROTECTED_ACTIVITY', 'COMPLAINT', 'HELP_REQUEST'];
    const adverseTags = ['ADVERSE_ACTION', 'PIP', 'TERMINATION', 'DEMOTION', 'PAY_CUT'];

    for (let i = 0; i < events.length; i++) {
      const protectedEvent = events[i];
      const protectedEventTags = protectedEvent.tags ? protectedEvent.tags.split(',') : [];

      const isProtected = protectedEventTags.some(tag =>
        protectedTags.some(pt => tag.toUpperCase().includes(pt))
      );

      if (!isProtected) continue;

      for (let j = i + 1; j < events.length; j++) {
        const adverseEvent = events[j];
        const adverseEventTags = adverseEvent.tags ? adverseEvent.tags.split(',') : [];

        const isAdverse = adverseEventTags.some(tag =>
          adverseTags.some(at => tag.toUpperCase().includes(at))
        );

        if (!isAdverse) continue;

        const daysBetween = this.getDaysBetween(protectedEvent.date, adverseEvent.date);

        if (daysBetween !== null && daysBetween <= 30 && daysBetween >= 0) {
          connections.push({
            id: uuidv4(),
            source_type: 'event',
            source_id: protectedEvent.id,
            target_type: 'event',
            target_id: adverseEvent.id,
            connection_type: 'retaliation_chain',
            strength: this.calculateRetaliationStrength(daysBetween),
            days_between: daysBetween,
            description: `${daysBetween} days after protected activity`,
            auto_detected: 1
          });
        }
      }
    }

    return connections;
  }

  /**
   * Detect escalation patterns
   * Events of increasing severity
   */
  static detectEscalationPatterns(events) {
    const connections = [];
    const severityMap = {
      'HARASSMENT': 1,
      'GENDER_HARASSMENT': 1,
      'SEXUAL_HARASSMENT': 2,
      'HOSTILE_ENVIRONMENT': 2,
      'EXCLUSION': 2,
      'RETALIATION': 3,
      'PIP': 3,
      'ADVERSE_ACTION': 4,
      'PAY_CUT': 4,
      'TERMINATION': 5
    };

    for (let i = 0; i < events.length - 1; i++) {
      const event1 = events[i];
      const event2 = events[i + 1];

      const tags1 = event1.tags ? event1.tags.split(',') : [];
      const tags2 = event2.tags ? event2.tags.split(',') : [];

      const severity1 = Math.max(0, ...tags1.map(t => severityMap[t.toUpperCase()] || 0));
      const severity2 = Math.max(0, ...tags2.map(t => severityMap[t.toUpperCase()] || 0));

      const daysBetween = this.getDaysBetween(event1.date, event2.date);

      if (severity2 > severity1 && daysBetween !== null && daysBetween <= 90 && daysBetween >= 0) {
        connections.push({
          id: uuidv4(),
          source_type: 'event',
          source_id: event1.id,
          target_type: 'event',
          target_id: event2.id,
          connection_type: 'escalation',
          strength: (severity2 - severity1) / 5,
          days_between: daysBetween,
          description: `Escalation in severity (${severity1} → ${severity2})`,
          auto_detected: 1
        });
      }
    }

    return connections;
  }

  /**
   * Detect temporal clusters
   * Events close together in time (within 14 days)
   */
  static detectTemporalClusters(events) {
    const connections = [];

    for (let i = 0; i < events.length - 1; i++) {
      const event1 = events[i];
      const event2 = events[i + 1];

      const daysBetween = this.getDaysBetween(event1.date, event2.date);

      if (daysBetween !== null && daysBetween <= 14 && daysBetween > 0) {
        connections.push({
          id: uuidv4(),
          source_type: 'event',
          source_id: event1.id,
          target_type: 'event',
          target_id: event2.id,
          connection_type: 'temporal_cluster',
          strength: 1 - (daysBetween / 14),
          days_between: daysBetween,
          description: `${daysBetween} days apart`,
          auto_detected: 1
        });
      }
    }

    return connections;
  }

  /**
   * Detect actor continuity
   * Same actors appearing in multiple events
   */
  static detectActorContinuity(events, caseDb) {
    const connections = [];

    if (events.length === 0) return connections;

    const appearances = caseDb.prepare(`
      SELECT ea.event_id, ea.actor_id, a.name as actor_name
      FROM event_actors ea
      JOIN actors a ON a.id = ea.actor_id
      WHERE ea.event_id IN (${events.map(() => '?').join(',')})
    `).all(...events.map(e => e.id));

    const actorEvents = {};
    appearances.forEach(app => {
      if (!actorEvents[app.actor_id]) {
        actorEvents[app.actor_id] = [];
      }
      actorEvents[app.actor_id].push(app.event_id);
    });

    Object.entries(actorEvents).forEach(([actorId, eventIds]) => {
      if (eventIds.length < 2) return;

      for (let i = 0; i < eventIds.length - 1; i++) {
        const event1 = events.find(e => e.id === eventIds[i]);
        const event2 = events.find(e => e.id === eventIds[i + 1]);

        if (!event1 || !event2) continue;

        const daysBetween = this.getDaysBetween(event1.date, event2.date);
        const actor = appearances.find(a => a.actor_id === actorId);

        connections.push({
          id: uuidv4(),
          source_type: 'event',
          source_id: event1.id,
          target_type: 'event',
          target_id: event2.id,
          connection_type: 'actor_continuity',
          strength: 0.7,
          days_between: daysBetween,
          description: `Same actor: ${actor.actor_name}`,
          auto_detected: 1
        });
      }
    });

    return connections;
  }

  static getDaysBetween(date1, date2) {
    if (!date1 || !date2) return null;
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    return Math.floor((d2 - d1) / (1000 * 60 * 60 * 24));
  }

  static calculateRetaliationStrength(days) {
    if (days <= 7) return 1.0;
    if (days <= 14) return 0.9;
    if (days <= 21) return 0.8;
    if (days <= 30) return 0.7;
    return 0.5;
  }

  static saveConnections(caseDb, caseId, connections) {
    caseDb.prepare(`
      DELETE FROM timeline_connections
      WHERE case_id = ? AND auto_detected = 1
    `).run(caseId);

    const insert = caseDb.prepare(`
      INSERT INTO timeline_connections (
        id, case_id, source_type, source_id, target_type, target_id,
        connection_type, strength, days_between, description, auto_detected
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = caseDb.transaction((conns) => {
      for (const conn of conns) {
        insert.run(
          conn.id, caseId,
          conn.source_type, conn.source_id,
          conn.target_type, conn.target_id,
          conn.connection_type, conn.strength,
          conn.days_between, conn.description,
          conn.auto_detected
        );
      }
    });

    insertMany(connections);
    console.log(`[ConnectionDetector] Saved ${connections.length} connections`);
  }
}

module.exports = { ConnectionDetector };
