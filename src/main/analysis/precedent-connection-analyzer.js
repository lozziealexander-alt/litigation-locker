const { v4: uuidv4 } = require('uuid');
const { PRECEDENTS } = require('./precedent-matcher');

/**
 * Precedent Connection Analyzer
 *
 * Finds legally-significant connections between events by analyzing
 * through the lens of EEOC claim types and case precedents.
 *
 * Runs 6 analysis passes:
 * 1. Retaliation causal links (Burlington Northern, Thomas v. Cooper)
 * 2. Hostile environment patterns (Harris v. Forklift, National Railroad)
 * 3. Employer notice chains (Faragher-Ellerth)
 * 4. Escalation with legal threshold (Muldrow)
 * 5. Convincing mosaic links (Lewis v. Union City)
 * 6. Whistleblower retaliation (Sierminski, Gessner)
 */
class PrecedentConnectionAnalyzer {

  /**
   * Main entry: analyze events and produce suggested connections
   */
  static analyze(caseDb, caseId) {
    const events = this.loadEvents(caseDb, caseId);
    const existingConnections = this.loadExistingConnections(caseDb, caseId);
    const existingSuggestions = this.loadExistingSuggestions(caseDb, caseId);
    const actors = this.loadActors(caseDb, caseId);

    console.log(`[PrecedentAnalyzer] Analyzing ${events.length} events against precedents`);

    const suggestions = [];

    suggestions.push(...this.analyzeRetaliationCausalLinks(events));
    suggestions.push(...this.analyzeHostileEnvironmentPatterns(events));
    suggestions.push(...this.analyzeEmployerNoticeChains(events));
    suggestions.push(...this.analyzeEscalationThreshold(events));
    suggestions.push(...this.analyzeConvincingMosaic(events, actors));
    suggestions.push(...this.analyzeWhistleblowerRetaliation(events));

    console.log(`[PrecedentAnalyzer] Raw suggestions: ${suggestions.length}`);

    // Deduplicate and check overlaps
    const deduped = this.deduplicateAndCheckOverlaps(
      suggestions, existingConnections, existingSuggestions
    );

    console.log(`[PrecedentAnalyzer] After dedup: ${deduped.length}`);

    // Save to DB
    this.saveSuggestions(caseDb, caseId, deduped);

    return deduped;
  }

  // ─── Data Loading ────────────────────────────────────────────

  static loadEvents(caseDb, caseId) {
    return caseDb.prepare(`
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
  }

  static loadExistingConnections(caseDb, caseId) {
    return caseDb.prepare(
      'SELECT * FROM timeline_connections WHERE case_id = ?'
    ).all(caseId);
  }

  static loadExistingSuggestions(caseDb, caseId) {
    try {
      return caseDb.prepare(
        'SELECT * FROM suggested_connections WHERE case_id = ?'
      ).all(caseId);
    } catch {
      return [];
    }
  }

  static loadActors(caseDb, caseId) {
    try {
      return caseDb.prepare(`
        SELECT a.*, ea.event_id, ea.role as event_role
        FROM actors a
        LEFT JOIN event_actors ea ON ea.actor_id = a.id
        WHERE a.case_id = ?
      `).all(caseId);
    } catch {
      return [];
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────

  static getDaysBetween(date1, date2) {
    if (!date1 || !date2) return null;
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    return Math.floor((d2 - d1) / (1000 * 60 * 60 * 24));
  }

  static hasTags(event, tagPatterns) {
    if (!event.tags) return false;
    const tags = event.tags.split(',').map(t => t.trim().toUpperCase());
    return tagPatterns.some(pattern =>
      tags.some(tag => tag.includes(pattern.toUpperCase()))
    );
  }

  static getMaxSeverity(event) {
    const severityMap = {
      'HARASSMENT': 1, 'GENDER_HARASSMENT': 1,
      'SEXUAL_HARASSMENT': 2, 'HOSTILE_ENVIRONMENT': 2, 'EXCLUSION': 2,
      'RETALIATION': 3, 'PIP': 3,
      'ADVERSE_ACTION': 4, 'PAY_CUT': 4,
      'TERMINATION': 5
    };
    if (!event.tags) return 0;
    const tags = event.tags.split(',').map(t => t.trim().toUpperCase());
    return Math.max(0, ...tags.map(t => severityMap[t] || 0));
  }

  // ─── Pass 1: Retaliation Causal Links ────────────────────────

  static analyzeRetaliationCausalLinks(events) {
    const suggestions = [];
    const protectedTags = ['REPORTED', 'PROTECTED_ACTIVITY', 'COMPLAINT', 'HELP_REQUEST'];
    const adverseTags = ['ADVERSE_ACTION', 'PIP', 'TERMINATION', 'DEMOTION', 'PAY_CUT'];

    const protectedEvents = events.filter(e => this.hasTags(e, protectedTags));
    const adverseEvents = events.filter(e => this.hasTags(e, adverseTags));

    for (const pe of protectedEvents) {
      for (const ae of adverseEvents) {
        const days = this.getDaysBetween(pe.date, ae.date);
        if (days === null || days < 0 || days > 90) continue;

        // Burlington Northern: broad 90-day window
        const bnStrength = days <= 7 ? 0.95 : days <= 14 ? 0.90 : days <= 30 ? 0.80 : days <= 60 ? 0.65 : 0.50;

        suggestions.push({
          id: uuidv4(),
          source_id: pe.id,
          source_type: 'event',
          target_id: ae.id,
          target_type: 'event',
          connection_type: 'retaliation_chain',
          precedent_key: 'burlington_northern',
          legal_element: 'causal_connection',
          strength: bnStrength,
          days_between: days,
          description: `Protected activity followed by adverse action within ${days} days`,
          reasoning: days <= 60
            ? `Strong causal link per Burlington Northern v. White — ${days}-day proximity satisfies 11th Circuit standard (Thomas v. Cooper). "Would dissuade a reasonable worker" standard applies.`
            : `Temporal proximity of ${days} days supports causal connection per Burlington Northern. In 11th Circuit, gap exceeds 60 days (Thomas v. Cooper) — corroborating evidence strengthens this link.`
        });

        // Thomas v. Cooper: strict 60-day 11th Circuit standard (only if within window)
        if (days <= 60) {
          suggestions.push({
            id: uuidv4(),
            source_id: pe.id,
            source_type: 'event',
            target_id: ae.id,
            target_type: 'event',
            connection_type: 'retaliation_chain',
            precedent_key: 'thomas_proximity',
            legal_element: 'close_temporal_proximity',
            strength: days <= 14 ? 0.95 : days <= 30 ? 0.85 : 0.70,
            days_between: days,
            description: `${days}-day gap meets 11th Circuit strict proximity standard`,
            reasoning: `Thomas v. Cooper Lighting requires "very close" temporal proximity in the 11th Circuit. ${days} days ${days <= 30 ? 'strongly satisfies' : 'satisfies'} this requirement — timing alone may establish causal connection.`
          });
        }
      }
    }

    return suggestions;
  }

  // ─── Pass 2: Hostile Environment Patterns ────────────────────

  static analyzeHostileEnvironmentPatterns(events) {
    const suggestions = [];
    const hostileTags = [
      'HARASSMENT', 'GENDER_HARASSMENT', 'SEXUAL_HARASSMENT',
      'HOSTILE_ENVIRONMENT', 'EXCLUSION', 'INCIDENT'
    ];

    const hostileEvents = events.filter(e => this.hasTags(e, hostileTags));

    if (hostileEvents.length < 3) return suggestions;

    // Find clusters of 3+ incidents within 90 days (pervasive conduct)
    for (let i = 0; i < hostileEvents.length; i++) {
      const cluster = [hostileEvents[i]];

      for (let j = i + 1; j < hostileEvents.length; j++) {
        const days = this.getDaysBetween(hostileEvents[i].date, hostileEvents[j].date);
        if (days !== null && days <= 90 && days >= 0) {
          cluster.push(hostileEvents[j]);
        }
      }

      if (cluster.length >= 3) {
        const first = cluster[0];
        const last = cluster[cluster.length - 1];
        const totalDays = this.getDaysBetween(first.date, last.date);
        const density = cluster.length / Math.max(1, totalDays / 30);
        const strength = Math.min(0.95, 0.5 + (cluster.length * 0.1) + (density * 0.1));

        // Harris v. Forklift: pervasive pattern
        suggestions.push({
          id: uuidv4(),
          source_id: first.id,
          source_type: 'event',
          target_id: last.id,
          target_type: 'event',
          connection_type: 'hostile_environment',
          precedent_key: 'harris',
          legal_element: 'severe_or_pervasive',
          strength,
          days_between: totalDays,
          description: `${cluster.length} hostile incidents within ${totalDays} days — pervasive pattern`,
          reasoning: `Harris v. Forklift requires conduct that is "severe or pervasive." ${cluster.length} incidents over ${totalDays} days establishes a pervasive pattern that altered conditions of employment. No requirement to show psychological harm.`
        });

        // National Railroad v. Morgan: continuing violation
        suggestions.push({
          id: uuidv4(),
          source_id: first.id,
          source_type: 'event',
          target_id: last.id,
          target_type: 'event',
          connection_type: 'continuing_violation',
          precedent_key: 'morgan',
          legal_element: 'pattern_of_conduct',
          strength: Math.min(0.90, 0.6 + (cluster.length * 0.08)),
          days_between: totalDays,
          description: `Continuing violation — ${cluster.length} related acts over ${totalDays} days`,
          reasoning: `National Railroad v. Morgan allows hostile environment claims based on cumulative acts. If the last incident is within the filing period, earlier acts are recoverable as part of the continuing pattern.`
        });

        // Only generate one cluster per starting event
        break;
      }
    }

    return suggestions;
  }

  // ─── Pass 3: Employer Notice Chains ──────────────────────────

  static analyzeEmployerNoticeChains(events) {
    const suggestions = [];
    const reportTags = ['HELP_REQUEST', 'PROTECTED_ACTIVITY', 'COMPLAINT', 'REPORTED'];
    const harmTags = ['HARASSMENT', 'HOSTILE_ENVIRONMENT', 'INCIDENT',
      'ADVERSE_ACTION', 'RETALIATION', 'SEXUAL_HARASSMENT'];

    const reports = events.filter(e => this.hasTags(e, reportTags));
    const harms = events.filter(e => this.hasTags(e, harmTags));

    for (const report of reports) {
      // Find harm events AFTER the report (employer failed to act)
      const subsequentHarms = harms.filter(h => {
        const days = this.getDaysBetween(report.date, h.date);
        return days !== null && days > 0 && days <= 180;
      });

      if (subsequentHarms.length === 0) continue;

      const lastHarm = subsequentHarms[subsequentHarms.length - 1];
      const days = this.getDaysBetween(report.date, lastHarm.date);
      const strength = Math.min(0.90, 0.6 + (subsequentHarms.length * 0.1));

      suggestions.push({
        id: uuidv4(),
        source_id: report.id,
        source_type: 'event',
        target_id: lastHarm.id,
        target_type: 'event',
        connection_type: 'employer_notice',
        precedent_key: 'faragher',
        legal_element: 'employer_failed_to_act',
        strength,
        days_between: days,
        description: `Report/complaint followed by ${subsequentHarms.length} continued harm event(s)`,
        reasoning: `Faragher/Ellerth: Employee reported through available procedures. ${subsequentHarms.length} incident(s) continued after report, indicating employer failed to take prompt remedial action. Employer loses affirmative defense.`
      });
    }

    return suggestions;
  }

  // ─── Pass 4: Escalation with Muldrow Threshold ───────────────

  static analyzeEscalationThreshold(events) {
    const suggestions = [];
    const muldrowActions = ['PIP', 'ADVERSE_ACTION', 'DEMOTION', 'PAY_CUT', 'TERMINATION'];

    for (let i = 0; i < events.length; i++) {
      const event1 = events[i];
      const sev1 = this.getMaxSeverity(event1);
      if (sev1 === 0) continue;

      for (let j = i + 1; j < events.length; j++) {
        const event2 = events[j];
        const sev2 = this.getMaxSeverity(event2);
        if (sev2 <= sev1) continue;

        const days = this.getDaysBetween(event1.date, event2.date);
        if (days === null || days < 0 || days > 120) continue;

        // Check if the target crosses Muldrow's "some harm" threshold (severity 3+)
        if (sev2 >= 3 && this.hasTags(event2, muldrowActions)) {
          const strength = Math.min(0.95, 0.5 + ((sev2 - sev1) * 0.15));

          suggestions.push({
            id: uuidv4(),
            source_id: event1.id,
            source_type: 'event',
            target_id: event2.id,
            target_type: 'event',
            connection_type: 'escalation',
            precedent_key: 'muldrow_some_harm',
            legal_element: 'some_harm_action',
            strength,
            days_between: days,
            description: `Severity escalation (${sev1} to ${sev2}) crosses "some harm" threshold`,
            reasoning: `Muldrow v. City of St. Louis (2024) lowered the adverse action threshold — only "some harm" to terms or conditions needed. Escalation from severity ${sev1} to ${sev2} shows progressive worsening that satisfies this standard. PIPs, schedule changes, duty changes, and lateral transfers all qualify.`
          });
          break; // Only first threshold-crossing escalation per source event
        }
      }
    }

    return suggestions;
  }

  // ─── Pass 5: Convincing Mosaic (Lewis v. Union City) ─────────

  static analyzeConvincingMosaic(events, actors) {
    const suggestions = [];
    const protectedTags = ['PROTECTED_ACTIVITY', 'COMPLAINT', 'HELP_REQUEST'];
    const adverseTags = ['ADVERSE_ACTION', 'PIP', 'TERMINATION', 'DEMOTION', 'PAY_CUT'];
    const incidentTags = ['INCIDENT', 'HARASSMENT', 'EXCLUSION', 'HOSTILE_ENVIRONMENT'];

    const protectedEvents = events.filter(e => this.hasTags(e, protectedTags));
    const adverseEvents = events.filter(e => this.hasTags(e, adverseTags));
    const incidentEvents = events.filter(e => this.hasTags(e, incidentTags));

    // Need at least: suspicious timing + differential treatment evidence
    if (protectedEvents.length === 0 || adverseEvents.length === 0) return suggestions;

    for (const ae of adverseEvents) {
      // Check suspicious timing: adverse action within 120 days of protected activity
      const timedProtected = protectedEvents.filter(pe => {
        const days = this.getDaysBetween(pe.date, ae.date);
        return days !== null && days > 0 && days <= 120;
      });

      if (timedProtected.length === 0) continue;

      // Count mosaic pieces
      let mosaicPieces = 0;
      const pieces = [];

      // Piece 1: Suspicious timing
      const closestProtected = timedProtected[timedProtected.length - 1];
      const timingDays = this.getDaysBetween(closestProtected.date, ae.date);
      mosaicPieces++;
      pieces.push(`suspicious timing (${timingDays} days)`);

      // Piece 2: Pattern of differential treatment (incidents before adverse action)
      const priorIncidents = incidentEvents.filter(ie => {
        const days = this.getDaysBetween(ie.date, ae.date);
        return days !== null && days >= 0 && days <= 180;
      });
      if (priorIncidents.length >= 2) {
        mosaicPieces++;
        pieces.push(`${priorIncidents.length} prior incidents showing differential treatment`);
      }

      // Piece 3: Multiple actors involved (pattern across decision-makers)
      const aeActors = actors.filter(a => a.event_id === ae.id);
      if (aeActors.length > 0) {
        mosaicPieces++;
        pieces.push('actor involvement documented');
      }

      if (mosaicPieces >= 2) {
        const strength = Math.min(0.90, 0.5 + (mosaicPieces * 0.15));

        suggestions.push({
          id: uuidv4(),
          source_id: closestProtected.id,
          source_type: 'event',
          target_id: ae.id,
          target_type: 'event',
          connection_type: 'convincing_mosaic',
          precedent_key: 'lewis_mosaic',
          legal_element: 'differential_treatment',
          strength,
          days_between: timingDays,
          description: `Convincing mosaic: ${pieces.join(' + ')}`,
          reasoning: `Lewis v. City of Union City (11th Cir. en banc) allows proving discrimination without a strict comparator through a "convincing mosaic" of circumstantial evidence. This link shows: ${pieces.join('; ')}. Combined, these indicators support an inference of discriminatory intent.`
        });
      }
    }

    return suggestions;
  }

  // ─── Pass 6: Whistleblower Retaliation ───────────────────────

  static analyzeWhistleblowerRetaliation(events) {
    const suggestions = [];
    const whistleblowerTags = ['PROTECTED_ACTIVITY', 'COMPLAINT', 'REPORTED'];
    const adverseTags = ['ADVERSE_ACTION', 'PIP', 'TERMINATION', 'DEMOTION', 'PAY_CUT'];

    const disclosures = events.filter(e => this.hasTags(e, whistleblowerTags));
    const adverseEvents = events.filter(e => this.hasTags(e, adverseTags));

    for (const disc of disclosures) {
      for (const ae of adverseEvents) {
        const days = this.getDaysBetween(disc.date, ae.date);
        if (days === null || days < 0 || days > 90) continue;

        const strength = days <= 14 ? 0.90 : days <= 30 ? 0.80 : days <= 60 ? 0.65 : 0.50;

        suggestions.push({
          id: uuidv4(),
          source_id: disc.id,
          source_type: 'event',
          target_id: ae.id,
          target_type: 'event',
          connection_type: 'whistleblower_retaliation',
          precedent_key: 'sierminski_whistleblower',
          legal_element: 'causal_connection',
          strength,
          days_between: days,
          description: `Protected disclosure followed by adverse action within ${days} days`,
          reasoning: `Sierminski v. Transouth Financial: FL Whistleblower Act (Fla. Stat. 448.102) requires protected activity and adverse action be "not completely unrelated." ${days}-day proximity supports causal link. Note: Under Gessner v. Gulf Power (2024), FL requires proof of an ACTUAL violation, not just reasonable belief.`
        });
      }
    }

    return suggestions;
  }

  // ─── Deduplication & Overlap Detection ───────────────────────

  static deduplicateAndCheckOverlaps(suggestions, existingConnections, existingSuggestions) {
    const result = [];
    const seen = new Set();

    // Build keys for existing suggestions (already in DB)
    const existingSuggestionKeys = new Set(
      existingSuggestions.map(s =>
        `${s.source_id}:${s.target_id}:${s.precedent_key}:${s.legal_element}`
      )
    );

    for (const suggestion of suggestions) {
      // Deduplicate within this batch
      const key = `${suggestion.source_id}:${suggestion.target_id}:${suggestion.precedent_key}:${suggestion.legal_element}`;
      if (seen.has(key)) continue;
      seen.add(key);

      // Skip if already suggested (and not dismissed)
      if (existingSuggestionKeys.has(key)) continue;

      // Check overlap with existing timeline_connections
      const overlap = existingConnections.find(ec =>
        ec.source_id === suggestion.source_id &&
        ec.target_id === suggestion.target_id
      );

      if (overlap) {
        // If existing connection has lower strength, mark as upgrade
        if (suggestion.strength > (overlap.strength || 0)) {
          suggestion.overlaps_connection_id = overlap.id;
          suggestion.description = `[Upgrade] ${suggestion.description} (existing: ${Math.round((overlap.strength || 0) * 100)}% → ${Math.round(suggestion.strength * 100)}%)`;
        } else {
          // Existing connection is already as strong or stronger — skip
          continue;
        }
      }

      result.push(suggestion);
    }

    return result;
  }

  // ─── Persistence ─────────────────────────────────────────────

  static saveSuggestions(caseDb, caseId, suggestions) {
    const insert = caseDb.prepare(`
      INSERT INTO suggested_connections (
        id, case_id, source_id, source_type, target_id, target_type,
        connection_type, precedent_key, legal_element,
        strength, days_between, description, reasoning,
        status, overlaps_connection_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
    `);

    const insertMany = caseDb.transaction((items) => {
      for (const s of items) {
        insert.run(
          s.id, caseId, s.source_id, s.source_type || 'event',
          s.target_id, s.target_type || 'event',
          s.connection_type, s.precedent_key, s.legal_element,
          s.strength, s.days_between, s.description, s.reasoning,
          s.overlaps_connection_id || null
        );
      }
    });

    insertMany(suggestions);
    console.log(`[PrecedentAnalyzer] Saved ${suggestions.length} suggestions`);
  }

  /**
   * Approve a suggestion — copy to timeline_connections (or merge with existing)
   */
  static approveSuggestion(caseDb, caseId, suggestionId, edits = {}) {
    const suggestion = caseDb.prepare(
      'SELECT * FROM suggested_connections WHERE id = ? AND case_id = ?'
    ).get(suggestionId, caseId);

    if (!suggestion) throw new Error('Suggestion not found');

    const connType = edits.connection_type || suggestion.connection_type;
    const strength = edits.strength != null ? edits.strength : suggestion.strength;
    const description = edits.description || suggestion.description;

    if (suggestion.overlaps_connection_id) {
      // Merge: update existing connection
      caseDb.prepare(`
        UPDATE timeline_connections SET
          connection_type = ?,
          strength = ?,
          description = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND case_id = ?
      `).run(connType, strength, description, suggestion.overlaps_connection_id, caseId);

      caseDb.prepare(
        "UPDATE suggested_connections SET status = 'merged', reviewed_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).run(suggestionId);

      return { action: 'merged', connectionId: suggestion.overlaps_connection_id };
    } else {
      // Create new timeline_connection
      const newId = uuidv4();
      caseDb.prepare(`
        INSERT INTO timeline_connections (
          id, case_id, source_type, source_id, target_type, target_id,
          connection_type, strength, days_between, description, auto_detected
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
      `).run(
        newId, caseId, suggestion.source_type, suggestion.source_id,
        suggestion.target_type, suggestion.target_id,
        connType, strength, suggestion.days_between, description
      );

      caseDb.prepare(
        "UPDATE suggested_connections SET status = 'approved', reviewed_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).run(suggestionId);

      return { action: 'approved', connectionId: newId };
    }
  }

  /**
   * Dismiss a suggestion
   */
  static dismissSuggestion(caseDb, caseId, suggestionId) {
    caseDb.prepare(
      "UPDATE suggested_connections SET status = 'dismissed', reviewed_at = CURRENT_TIMESTAMP WHERE id = ? AND case_id = ?"
    ).run(suggestionId, caseId);
  }

  /**
   * Bulk approve
   */
  static bulkApprove(caseDb, caseId, suggestionIds) {
    const results = [];
    for (const id of suggestionIds) {
      results.push(this.approveSuggestion(caseDb, caseId, id));
    }
    return results;
  }
}

module.exports = { PrecedentConnectionAnalyzer };
