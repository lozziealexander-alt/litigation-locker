const { v4: uuidv4 } = require('uuid');
const { PRECEDENTS } = require('./precedent-matcher');

/**
 * Precedent Connection Analyzer
 *
 * Finds legally-significant connections between events by analyzing
 * through the lens of EEOC claim types and case precedents.
 *
 * Runs 11 analysis passes:
 * 1. Retaliation causal links (Burlington Northern, Thomas v. Cooper)
 * 2. Hostile environment patterns (Harris v. Forklift, National Railroad)
 * 3. Employer notice chains (Faragher-Ellerth)
 * 4. Escalation with legal threshold (Muldrow)
 * 5. Convincing mosaic links (Lewis v. Union City)
 * 6. Whistleblower retaliation (Sierminski, Gessner)
 * 7. Sexual harassment chains (quid pro quo, severe single incident)
 * 8. Pay discrimination patterns (Lilly Ledbetter, disparate pay)
 * 9. Supervisor liability (Vance v. Ball State)
 * 10. Retaliatory harassment (Monaghan — no severe/pervasive required)
 * 11. FCRA discrimination (Harper v. Blockbuster — McDonnell Douglas)
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
    suggestions.push(...this.analyzeSexualHarassmentChains(events, actors));
    suggestions.push(...this.analyzePayDiscrimination(events));
    suggestions.push(...this.analyzeSupervisorLiability(events, actors, caseDb, caseId));
    suggestions.push(...this.analyzeRetaliatoryHarassment(events));
    suggestions.push(...this.analyzeFCRADiscrimination(events, actors));
    suggestions.push(...this.analyzeAdverseActionChains(events));

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

  /**
   * Check event against patterns using BOTH tags AND event_type + title.
   * More robust than hasTags alone — catches events that may not have
   * the exact tag but whose type or title clearly matches.
   */
  static matchesEvent(event, tagPatterns, titlePatterns = []) {
    if (this.hasTags(event, tagPatterns)) return true;
    const evType = (event.event_type || '').toUpperCase();
    if (evType && tagPatterns.some(p => evType.includes(p.toUpperCase()))) return true;
    if (titlePatterns.length > 0) {
      const title = (event.title || '').toUpperCase();
      if (titlePatterns.some(p => title.includes(p.toUpperCase()))) return true;
    }
    return false;
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
    const protectedTags = ['REPORTED', 'PROTECTED_ACTIVITY', 'COMPLAINT', 'HELP_REQUEST', 'WHISTLEBLOW'];
    const adverseTags = ['ADVERSE_ACTION', 'PIP', 'TERMINATION', 'DEMOTION', 'PAY_CUT', 'RETALIATION'];

    const protectedTitleWords = ['reported', 'complained', 'filed', 'notified hr', 'escalated'];
    const adverseTitleWords = ['review', 'pip', 'fired', 'terminated', 'demoted', 'written up', 'warning', 'disciplin', 'bonus', 'pay cut'];
    const protectedEvents = events.filter(e => this.matchesEvent(e, protectedTags, protectedTitleWords));
    const adverseEvents = events.filter(e => this.matchesEvent(e, adverseTags, adverseTitleWords));

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
    const whistleblowerTags = ['PROTECTED_ACTIVITY', 'COMPLAINT', 'REPORTED', 'WHISTLEBLOW'];
    const adverseTags = ['ADVERSE_ACTION', 'PIP', 'TERMINATION', 'DEMOTION', 'PAY_CUT', 'RETALIATION'];

    const disclosures = events.filter(e => this.matchesEvent(e, whistleblowerTags, ['reported', 'complained', 'filed', 'escalated']));
    const adverseEvents = events.filter(e => this.matchesEvent(e, adverseTags, ['review', 'pip', 'fired', 'terminated', 'demoted', 'bonus', 'pay cut']));

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

  // ─── Pass 7: Sexual Harassment Chains ─────────────────────────

  static analyzeSexualHarassmentChains(events, actors) {
    const suggestions = [];
    const shTags = ['SEXUAL_HARASSMENT'];
    const adverseTags = ['ADVERSE_ACTION', 'PIP', 'TERMINATION', 'DEMOTION', 'PAY_CUT'];

    const shEvents = events.filter(e => this.hasTags(e, shTags));
    const adverseEvents = events.filter(e => this.hasTags(e, adverseTags));

    if (shEvents.length === 0) return suggestions;

    // Quid pro quo: sexual harassment followed by adverse action (supervisor retaliation)
    for (const sh of shEvents) {
      for (const ae of adverseEvents) {
        const days = this.getDaysBetween(sh.date, ae.date);
        if (days === null || days < 0 || days > 120) continue;

        const strength = days <= 14 ? 0.95 : days <= 30 ? 0.90 : days <= 60 ? 0.80 : 0.65;

        suggestions.push({
          id: uuidv4(),
          source_id: sh.id,
          source_type: 'event',
          target_id: ae.id,
          target_type: 'event',
          connection_type: 'quid_pro_quo',
          precedent_key: 'harris',
          legal_element: 'unwelcome_conduct',
          strength,
          days_between: days,
          description: `Sexual harassment followed by adverse action within ${days} days — potential quid pro quo`,
          reasoning: `Under Title VII and Harris v. Forklift, quid pro quo harassment occurs when submission to or rejection of unwelcome sexual conduct is used as the basis for employment decisions. The ${days}-day link between sexual harassment and adverse action suggests a tangible employment action tied to the harassment. Under Vance v. Ball State, if the harasser is a supervisor, the employer is strictly liable.`
        });
      }
    }

    // Severe single incident: sexual harassment can be "severe" enough on its own
    for (const sh of shEvents) {
      // Check if there are subsequent hostile environment events
      const subsequentHostile = events.filter(e => {
        if (e.id === sh.id) return false;
        const days = this.getDaysBetween(sh.date, e.date);
        return days !== null && days >= 0 && days <= 90 &&
          this.hasTags(e, ['HOSTILE_ENVIRONMENT', 'HARASSMENT', 'EXCLUSION', 'RETALIATION']);
      });

      if (subsequentHostile.length > 0) {
        const last = subsequentHostile[subsequentHostile.length - 1];
        const days = this.getDaysBetween(sh.date, last.date);

        suggestions.push({
          id: uuidv4(),
          source_id: sh.id,
          source_type: 'event',
          target_id: last.id,
          target_type: 'event',
          connection_type: 'sexual_harassment_pattern',
          precedent_key: 'harris',
          legal_element: 'severe_or_pervasive',
          strength: Math.min(0.95, 0.7 + (subsequentHostile.length * 0.08)),
          days_between: days,
          description: `Sexual harassment + ${subsequentHostile.length} subsequent hostile event(s) over ${days} days`,
          reasoning: `Harris v. Forklift: Sexual harassment that is either "severe" (a single egregious act) or "pervasive" (repeated conduct) creates an actionable hostile environment. This pattern shows sexual harassment followed by ${subsequentHostile.length} additional hostile event(s), strengthening the pervasiveness element. No requirement to prove psychological injury.`
        });
      }
    }

    return suggestions;
  }

  // ─── Pass 8: Pay Discrimination ──────────────────────────────

  static analyzePayDiscrimination(events) {
    const suggestions = [];
    const payTags = ['PAY_DISCRIMINATION', 'PAY_CUT'];
    const adverseTags = ['ADVERSE_ACTION', 'PIP', 'TERMINATION', 'DEMOTION'];
    const protectedTags = ['PROTECTED_ACTIVITY', 'COMPLAINT', 'HELP_REQUEST'];

    const payEvents = events.filter(e => this.hasTags(e, payTags));

    if (payEvents.length === 0) return suggestions;

    // Pay discrimination as ongoing violation (Lilly Ledbetter Act)
    // Each paycheck restarts the filing clock
    if (payEvents.length >= 2) {
      const first = payEvents[0];
      const last = payEvents[payEvents.length - 1];
      const days = this.getDaysBetween(first.date, last.date);

      if (days !== null && days > 0) {
        suggestions.push({
          id: uuidv4(),
          source_id: first.id,
          source_type: 'event',
          target_id: last.id,
          target_type: 'event',
          connection_type: 'pay_discrimination',
          precedent_key: 'morgan',
          legal_element: 'pattern_of_conduct',
          strength: Math.min(0.95, 0.6 + (payEvents.length * 0.1)),
          days_between: days,
          description: `${payEvents.length} pay discrimination events over ${days} days — continuing violation`,
          reasoning: `Under the Lilly Ledbetter Fair Pay Act (2009) and National Railroad v. Morgan, each discriminatory paycheck constitutes a new violation, resetting the filing deadline. ${payEvents.length} pay events over ${days} days establishes a continuing pattern of compensation discrimination. The most recent paycheck triggers a new 180/300-day filing window.`
        });
      }
    }

    // Pay discrimination followed by retaliation for complaining
    for (const pe of payEvents) {
      const laterProtected = events.filter(e => {
        const days = this.getDaysBetween(pe.date, e.date);
        return days !== null && days >= 0 && days <= 60 && this.hasTags(e, protectedTags);
      });

      for (const prot of laterProtected) {
        const adverseAfter = events.filter(e => {
          const days = this.getDaysBetween(prot.date, e.date);
          return days !== null && days > 0 && days <= 90 && this.hasTags(e, adverseTags);
        });

        for (const ae of adverseAfter) {
          const totalDays = this.getDaysBetween(pe.date, ae.date);

          suggestions.push({
            id: uuidv4(),
            source_id: pe.id,
            source_type: 'event',
            target_id: ae.id,
            target_type: 'event',
            connection_type: 'pay_retaliation_chain',
            precedent_key: 'burlington_northern',
            legal_element: 'causal_connection',
            strength: 0.85,
            days_between: totalDays,
            description: `Pay discrimination → complaint → adverse action over ${totalDays} days`,
            reasoning: `Compound EEOC claim: Pay discrimination triggered a complaint (protected activity), which was followed by adverse action — combining Equal Pay Act / Title VII pay discrimination with Burlington Northern retaliation. This chain strengthens both claims and demonstrates employer retaliatory intent.`
          });
        }
      }
    }

    return suggestions;
  }

  // ─── Pass 9: Supervisor Liability (Vance v. Ball State) ──────

  static analyzeSupervisorLiability(events, actors, caseDb, caseId) {
    const suggestions = [];
    const harmTags = [
      'HARASSMENT', 'SEXUAL_HARASSMENT', 'GENDER_HARASSMENT',
      'HOSTILE_ENVIRONMENT', 'INCIDENT', 'EXCLUSION'
    ];
    const adverseTags = ['ADVERSE_ACTION', 'PIP', 'TERMINATION', 'DEMOTION', 'PAY_CUT'];

    // Find supervisors and bad actors from the actors table
    const supervisorRelationships = [
      'supervisor', 'manager', 'director', 'executive',
      'direct_supervisor', 'skip_level', 'senior_leadership'
    ];

    const supervisors = new Set();
    const supervisorNames = {};
    for (const actor of actors) {
      if (supervisorRelationships.includes(actor.relationship_to_self) ||
          (actor.classification === 'bad_actor' && supervisorRelationships.includes(actor.relationship_to_self))) {
        supervisors.add(actor.id);
        supervisorNames[actor.id] = actor.name;
      }
    }

    if (supervisors.size === 0) return suggestions;

    // Find events involving supervisors
    const supervisorEventIds = new Set(
      actors.filter(a => supervisors.has(a.id) && a.event_id).map(a => a.event_id)
    );

    const supervisorHarmEvents = events.filter(e =>
      supervisorEventIds.has(e.id) && this.hasTags(e, harmTags)
    );
    const supervisorAdverseEvents = events.filter(e =>
      supervisorEventIds.has(e.id) && this.hasTags(e, adverseTags)
    );

    // Supervisor harassment → tangible employment action = strict liability
    for (const he of supervisorHarmEvents) {
      for (const ae of supervisorAdverseEvents) {
        const days = this.getDaysBetween(he.date, ae.date);
        if (days === null || days < 0 || days > 180) continue;

        // Find which supervisor is involved
        const heActors = actors.filter(a => a.event_id === he.id && supervisors.has(a.id));
        const aeActors = actors.filter(a => a.event_id === ae.id && supervisors.has(a.id));
        const commonSupervisors = heActors.filter(a => aeActors.some(b => b.id === a.id));

        const supervisorName = commonSupervisors.length > 0
          ? commonSupervisors.map(a => supervisorNames[a.id]).join(', ')
          : heActors.length > 0
            ? heActors.map(a => supervisorNames[a.id]).join(', ')
            : 'supervisor';

        suggestions.push({
          id: uuidv4(),
          source_id: he.id,
          source_type: 'event',
          target_id: ae.id,
          target_type: 'event',
          connection_type: 'supervisor_liability',
          precedent_key: 'vance',
          legal_element: 'supervisor_harasser',
          strength: commonSupervisors.length > 0 ? 0.95 : 0.80,
          days_between: days,
          description: `Supervisor (${supervisorName}) involved in harassment → tangible employment action`,
          reasoning: `Vance v. Ball State: When the harasser is a "supervisor" (can take tangible employment actions), the employer is vicariously liable. ${supervisorName} is documented in both the harassment event and the adverse action, establishing supervisor involvement. Under Faragher/Ellerth, no affirmative defense is available when a supervisor's harassment culminates in a tangible employment action.`
        });
      }
    }

    // Supervisor-linked pattern (same supervisor across multiple harm events)
    const supervisorArray = [...supervisors];
    for (const supId of supervisorArray) {
      const supEvents = supervisorHarmEvents.filter(e =>
        actors.some(a => a.event_id === e.id && a.id === supId)
      );

      if (supEvents.length >= 2) {
        const first = supEvents[0];
        const last = supEvents[supEvents.length - 1];
        const days = this.getDaysBetween(first.date, last.date);

        suggestions.push({
          id: uuidv4(),
          source_id: first.id,
          source_type: 'event',
          target_id: last.id,
          target_type: 'event',
          connection_type: 'supervisor_pattern',
          precedent_key: 'vance',
          legal_element: 'supervisor_harasser',
          strength: Math.min(0.95, 0.6 + (supEvents.length * 0.1)),
          days_between: days,
          description: `Supervisor ${supervisorNames[supId]} linked to ${supEvents.length} harassment events over ${days} days`,
          reasoning: `Vance v. Ball State + Harris v. Forklift: ${supervisorNames[supId]} is a supervisor (authorized to take tangible employment actions) linked to ${supEvents.length} separate harassment events. This establishes both a pervasive pattern AND supervisor involvement, triggering strict vicarious liability. Employer cannot assert Faragher/Ellerth affirmative defense.`
        });
      }
    }

    return suggestions;
  }

  // ─── Pass 10: Retaliatory Harassment (Monaghan) ──────────────

  static analyzeRetaliatoryHarassment(events) {
    const suggestions = [];
    const protectedTags = ['PROTECTED_ACTIVITY', 'COMPLAINT', 'HELP_REQUEST', 'REPORTED'];
    const harassmentTags = [
      'HARASSMENT', 'GENDER_HARASSMENT', 'SEXUAL_HARASSMENT',
      'HOSTILE_ENVIRONMENT', 'EXCLUSION', 'INCIDENT'
    ];

    const protectedEvents = events.filter(e => this.hasTags(e, protectedTags));
    const harassmentEvents = events.filter(e => this.hasTags(e, harassmentTags));

    for (const pe of protectedEvents) {
      // Find harassment events AFTER protected activity
      const subsequentHarassment = harassmentEvents.filter(he => {
        const days = this.getDaysBetween(pe.date, he.date);
        return days !== null && days > 0 && days <= 120;
      });

      if (subsequentHarassment.length === 0) continue;

      // Monaghan: even a SINGLE retaliatory act suffices (no severe/pervasive needed)
      const firstHarassment = subsequentHarassment[0];
      const days = this.getDaysBetween(pe.date, firstHarassment.date);

      suggestions.push({
        id: uuidv4(),
        source_id: pe.id,
        source_type: 'event',
        target_id: firstHarassment.id,
        target_type: 'event',
        connection_type: 'retaliatory_harassment',
        precedent_key: 'monaghan_retaliation',
        legal_element: 'retaliatory_conduct',
        strength: days <= 14 ? 0.90 : days <= 30 ? 0.85 : days <= 60 ? 0.75 : 0.60,
        days_between: days,
        description: `Protected activity followed by harassment within ${days} days — retaliatory harassment`,
        reasoning: `Monaghan v. Worldpay (11th Cir. 2020): Retaliatory harassment does NOT require the "severe or pervasive" showing of a hostile environment claim. Under Burlington Northern's "dissuade a reasonable worker" standard, even a single retaliatory act can be actionable. The ${days}-day gap between protected activity and harassment supports retaliatory intent.`
      });

      // If multiple harassment events follow, the pattern strengthens the claim
      if (subsequentHarassment.length >= 2) {
        const last = subsequentHarassment[subsequentHarassment.length - 1];
        const totalDays = this.getDaysBetween(pe.date, last.date);

        suggestions.push({
          id: uuidv4(),
          source_id: pe.id,
          source_type: 'event',
          target_id: last.id,
          target_type: 'event',
          connection_type: 'retaliatory_harassment_pattern',
          precedent_key: 'monaghan_retaliation',
          legal_element: 'dissuade_standard',
          strength: Math.min(0.95, 0.7 + (subsequentHarassment.length * 0.08)),
          days_between: totalDays,
          description: `${subsequentHarassment.length} harassment events following protected activity over ${totalDays} days`,
          reasoning: `Monaghan v. Worldpay: ${subsequentHarassment.length} separate instances of harassment following protected activity establish a clear pattern of retaliation. Each act independently satisfies the "would dissuade a reasonable worker" standard. Combined, this pattern provides compelling evidence of retaliatory animus, exceeding the threshold even under traditional hostile environment analysis.`
        });
      }
    }

    return suggestions;
  }

  // ─── Pass 11: FCRA Discrimination (Harper v. Blockbuster) ────

  static analyzeFCRADiscrimination(events, actors) {
    const suggestions = [];
    const adverseTags = ['ADVERSE_ACTION', 'PIP', 'TERMINATION', 'DEMOTION', 'PAY_CUT'];
    const incidentTags = ['INCIDENT', 'HARASSMENT', 'GENDER_HARASSMENT',
      'SEXUAL_HARASSMENT', 'EXCLUSION', 'PAY_DISCRIMINATION'];

    const adverseEvents = events.filter(e => this.hasTags(e, adverseTags));
    const incidentEvents = events.filter(e => this.hasTags(e, incidentTags));

    if (adverseEvents.length === 0) return suggestions;

    // Build discrimination pattern: incidents showing differential treatment → adverse action
    for (const ae of adverseEvents) {
      // Find discrimination-related incidents within 180 days before the adverse action
      const priorIncidents = incidentEvents.filter(ie => {
        const days = this.getDaysBetween(ie.date, ae.date);
        return days !== null && days >= 0 && days <= 180;
      });

      if (priorIncidents.length === 0) continue;

      const first = priorIncidents[0];
      const days = this.getDaysBetween(first.date, ae.date);
      const hasGenderTag = priorIncidents.some(e =>
        this.hasTags(e, ['GENDER_HARASSMENT', 'SEXUAL_HARASSMENT'])
      );
      const hasPayTag = priorIncidents.some(e =>
        this.hasTags(e, ['PAY_DISCRIMINATION'])
      );
      const hasExclusion = priorIncidents.some(e =>
        this.hasTags(e, ['EXCLUSION'])
      );

      // Count discrimination indicators
      let indicators = 0;
      const indicatorLabels = [];
      if (hasGenderTag) { indicators++; indicatorLabels.push('gender-based conduct'); }
      if (hasPayTag) { indicators++; indicatorLabels.push('pay disparity'); }
      if (hasExclusion) { indicators++; indicatorLabels.push('exclusion/isolation'); }
      if (priorIncidents.length >= 2) { indicators++; indicatorLabels.push(`${priorIncidents.length} prior incidents`); }

      if (indicators >= 1) {
        const strength = Math.min(0.90, 0.5 + (indicators * 0.12) + (priorIncidents.length * 0.05));

        // Harper v. Blockbuster: FCRA / McDonnell Douglas framework
        suggestions.push({
          id: uuidv4(),
          source_id: first.id,
          source_type: 'event',
          target_id: ae.id,
          target_type: 'event',
          connection_type: 'fcra_discrimination',
          precedent_key: 'harper_fcra',
          legal_element: 'adverse_action',
          strength,
          days_between: days,
          description: `Discrimination pattern (${indicatorLabels.join(', ')}) culminating in adverse action`,
          reasoning: `Harper v. Blockbuster (11th Cir.): Under the FCRA/McDonnell Douglas burden-shifting framework, the plaintiff must show (1) protected class membership, (2) qualification for the position, (3) adverse employment action, and (4) differential treatment. This pattern shows ${indicatorLabels.join(', ')} preceding an adverse employment action, establishing the prima facie case elements. If combined with a convincing mosaic (Lewis v. Union City), strict comparator evidence is not required.`
        });
      }

      // Muldrow "some harm" — even minor actions count as adverse
      if (this.hasTags(ae, ['PIP', 'DEMOTION'])) {
        suggestions.push({
          id: uuidv4(),
          source_id: first.id,
          source_type: 'event',
          target_id: ae.id,
          target_type: 'event',
          connection_type: 'discrimination_some_harm',
          precedent_key: 'muldrow_some_harm',
          legal_element: 'some_harm_action',
          strength: 0.80,
          days_between: days,
          description: `Discrimination culminating in action meeting Muldrow "some harm" standard`,
          reasoning: `Muldrow v. City of St. Louis (2024): The Supreme Court lowered the adverse action threshold in discrimination claims. Actions causing only "some harm" to employment terms now qualify — including PIPs, lateral transfers, schedule changes, and duty reassignments. This broadened standard means ${indicatorLabels.join(', ')} leading to any harmful employment change satisfies the adverse action element.`
        });
      }
    }

    return suggestions;
  }

  // ─── Pass 12: Adverse Action Chains ───────────────────────────

  /**
   * Detect chains of adverse actions that compound harm.
   *
   * Catches patterns like:
   *   - Bad review → low bonus / pay cut (performance-to-pay chain)
   *   - PIP → demotion → termination (escalating adverse actions)
   *   - Any protected activity → adverse1 → adverse2 (continuing retaliation)
   *
   * These establish that adverse actions didn't happen in isolation but
   * were part of a retaliatory or discriminatory pattern.
   */
  static analyzeAdverseActionChains(events) {
    const suggestions = [];

    const protectedPatterns = ['REPORTED', 'PROTECTED_ACTIVITY', 'COMPLAINT', 'HELP_REQUEST', 'WHISTLEBLOW'];
    const adversePatterns = ['ADVERSE_ACTION', 'PIP', 'TERMINATION', 'DEMOTION', 'PAY_CUT', 'RETALIATION'];
    const payPatterns = ['PAY_CUT', 'PAY_DISCRIMINATION', 'BONUS', 'COMPENSATION', 'SALARY'];
    const performancePatterns = ['PIP', 'PERFORMANCE', 'REVIEW'];

    // Title keywords to catch events not tagged but clearly adverse/pay-related
    const adverseTitleWords = ['review', 'pip', 'fired', 'terminated', 'demoted', 'written up', 'warning', 'disciplin'];
    const payTitleWords = ['bonus', 'pay', 'salary', 'compensation', 'raise', 'merit', 'wage'];
    const performanceTitleWords = ['review', 'evaluation', 'assessment', 'goals', 'objectives', 'rating', 'performance'];

    // Identify event categories using broader matching
    const isProtected = (e) => this.matchesEvent(e, protectedPatterns);
    const isAdverse = (e) => this.matchesEvent(e, adversePatterns, adverseTitleWords);
    const isPay = (e) => this.matchesEvent(e, payPatterns, payTitleWords);
    const isPerformance = (e) => this.matchesEvent(e, performancePatterns, performanceTitleWords);

    const adverseEvents = events.filter(e => isAdverse(e) || isPay(e) || isPerformance(e));

    // Find protected activity events (anchor for chains)
    const protectedEvents = events.filter(isProtected);

    // --- Chain 1: Performance → Pay impact ---
    // Bad review / PIP followed by pay-related action (low bonus, pay cut)
    for (let i = 0; i < adverseEvents.length; i++) {
      const perf = adverseEvents[i];
      if (!isPerformance(perf) && !this.hasTags(perf, ['ADVERSE_ACTION'])) continue;

      for (let j = i + 1; j < adverseEvents.length; j++) {
        const pay = adverseEvents[j];
        if (!isPay(pay)) continue;

        const days = this.getDaysBetween(perf.date, pay.date);
        if (days === null || days < 0 || days > 120) continue;

        // Check if a protected activity happened before this chain
        const hasUpstreamProtected = protectedEvents.some(pe => {
          const d = this.getDaysBetween(pe.date, perf.date);
          return d !== null && d >= 0 && d <= 365;
        });

        const strength = hasUpstreamProtected
          ? (days <= 30 ? 0.92 : days <= 60 ? 0.82 : 0.70)
          : (days <= 30 ? 0.80 : days <= 60 ? 0.70 : 0.55);

        suggestions.push({
          id: uuidv4(),
          source_id: perf.id,
          source_type: 'event',
          target_id: pay.id,
          target_type: 'event',
          connection_type: 'pay_retaliation_chain',
          precedent_key: hasUpstreamProtected ? 'burlington_northern' : 'ledbetter',
          legal_element: 'compounding_adverse_action',
          strength,
          days_between: days,
          description: `Performance action followed by pay impact within ${days} days${hasUpstreamProtected ? ' (post-protected activity)' : ''}`,
          reasoning: hasUpstreamProtected
            ? `Performance-to-pay retaliation chain: A negative performance action was followed by a pay-impacting action within ${days} days, both occurring after protected activity. Under Burlington Northern, this chain of compounding adverse actions strengthens the causal connection — the employer used the performance mechanism as a pretext for pay retaliation.`
            : `Performance-to-pay chain: A negative performance action was followed by pay impact within ${days} days. Under the Lilly Ledbetter Fair Pay Act, each subsequent paycheck affected by a discriminatory review constitutes a new violation. This chain suggests the performance evaluation was used to justify discriminatory pay outcomes.`
        });
      }
    }

    // --- Chain 2: Sequential adverse actions after protected activity ---
    // Protected → Adverse1 → Adverse2 (connect Adverse1 to Adverse2)
    for (const pe of protectedEvents) {
      const subsequentAdverse = adverseEvents.filter(ae => {
        const d = this.getDaysBetween(pe.date, ae.date);
        return d !== null && d > 0 && d <= 365;
      });

      // Connect sequential adverse actions to each other
      for (let i = 0; i < subsequentAdverse.length - 1; i++) {
        const ae1 = subsequentAdverse[i];
        const ae2 = subsequentAdverse[i + 1];
        const days = this.getDaysBetween(ae1.date, ae2.date);

        if (days === null || days < 0 || days > 120) continue;

        const daysSinceProtected = this.getDaysBetween(pe.date, ae2.date);
        const strength = days <= 14 ? 0.88 : days <= 30 ? 0.80 : days <= 60 ? 0.70 : 0.55;

        suggestions.push({
          id: uuidv4(),
          source_id: ae1.id,
          source_type: 'event',
          target_id: ae2.id,
          target_type: 'event',
          connection_type: 'retaliation_chain',
          precedent_key: 'burlington_northern',
          legal_element: 'continuing_retaliation',
          strength,
          days_between: days,
          description: `Compounding adverse action — ${days} days apart, ${daysSinceProtected} days after protected activity`,
          reasoning: `Continuing retaliation pattern: This adverse action followed a prior adverse action by ${days} days, both occurring after a protected activity (${daysSinceProtected} days prior). Under Burlington Northern, the totality of retaliatory actions is considered — each additional adverse act strengthens the inference that the employer engaged in a pattern of retaliation. Sequential adverse actions that "would dissuade a reasonable worker" from engaging in protected activity are independently actionable.`
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
      // Skip self-connections (same event as both source and target)
      if (suggestion.source_id === suggestion.target_id) continue;

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
      // Create new timeline_connection (use edited source/target if provided)
      const newId = uuidv4();
      const finalSourceId = edits.source_id || suggestion.source_id;
      const finalTargetId = edits.target_id || suggestion.target_id;

      // Recalculate days_between if source or target changed
      let daysBetween = suggestion.days_between;
      if (edits.source_id || edits.target_id) {
        const src = caseDb.prepare('SELECT date FROM events WHERE id = ?').get(finalSourceId);
        const tgt = caseDb.prepare('SELECT date FROM events WHERE id = ?').get(finalTargetId);
        if (src?.date && tgt?.date) {
          daysBetween = Math.round((new Date(tgt.date) - new Date(src.date)) / 86400000);
        }
      }

      caseDb.prepare(`
        INSERT INTO timeline_connections (
          id, case_id, source_type, source_id, target_type, target_id,
          connection_type, strength, days_between, description, auto_detected
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
      `).run(
        newId, caseId, suggestion.source_type, finalSourceId,
        suggestion.target_type, finalTargetId,
        connType, strength, daysBetween, description
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
