/**
 * Incident Detector
 *
 * Scans document text for signal words/patterns that suggest workplace incidents.
 * Returns suggested incidents for user approval - nothing saves automatically.
 *
 * Legal frameworks referenced:
 * - Harris v. Forklift Systems (severity based on nature of conduct)
 * - Burlington Northern (retaliation timing/proximity)
 * - Vance v. Ball State (supervisor involvement, tangible actions)
 * - National Railroad v. Morgan (pattern of conduct)
 */

/**
 * Signal words and patterns that suggest incidents
 * Each pattern maps to an incident type and base severity
 */
const INCIDENT_SIGNALS = {
  // Verbal abuse
  verbal_abuse: {
    patterns: [
      /yelled at (?:me|him|her|them)/i,
      /screamed at/i,
      /raised (?:his|her|their) voice/i,
      /called me (?:stupid|incompetent|idiot|worthless)/i,
      /belittled/i,
      /humiliated (?:me|him|her|them)/i,
      /berated/i,
      /mocked/i,
      /publicly embarrassed/i,
      /said (?:i|my work) was (?:embarrassing|pathetic|terrible|garbage)/i
    ],
    type: 'INCIDENT',
    subtype: 'verbal_abuse',
    baseSeverity: 'moderate',
    harrisNature: 'humiliating'
  },

  // Threats
  threat: {
    patterns: [
      /threatened (?:to|that)/i,
      /intimidated/i,
      /warned me that (?:i would|my job)/i,
      /you(?:'ll| will) (?:regret|be sorry)/i,
      /if you (?:don't|do not|refuse)/i,
      /your job is (?:on the line|at risk)/i,
      /i(?:'ll| will) make sure you/i
    ],
    type: 'INCIDENT',
    subtype: 'threat',
    baseSeverity: 'severe',
    harrisNature: 'threatening'
  },

  // Exclusion
  exclusion: {
    patterns: [
      /not invited to/i,
      /excluded from (?:the )?(?:meeting|team|project|discussion)/i,
      /left out of/i,
      /wasn(?:'t| not) included/i,
      /removed from (?:the )?(?:meeting|invite|list|email|thread|project)/i,
      /no longer (?:cc|copied|included)/i,
      /dropped from/i,
      /didn(?:'t| not) (?:tell|inform|invite) me/i
    ],
    type: 'INCIDENT',
    subtype: 'exclusion',
    baseSeverity: 'moderate',
    harrisNature: 'isolating'
  },

  // Retaliation indicators
  retaliation: {
    patterns: [
      /after (?:i|my) (?:complaint|report|filed)/i,
      /since (?:i|my) (?:complained|reported)/i,
      /following my (?:complaint|report)/i,
      /in response to my/i,
      /ever since i (?:spoke up|reported|complained)/i,
      /retaliat/i,
      /punish(?:ed|ing|ment) (?:me|for)/i,
      /payback for/i
    ],
    type: 'INCIDENT',
    subtype: 'retaliation',
    baseSeverity: 'severe',
    burlingtonProximity: true
  },

  // Adverse employment actions
  pip: {
    patterns: [
      /performance improvement plan/i,
      /\bpip\b/i,
      /placed on (?:a )?(?:performance|improvement) plan/i
    ],
    type: 'ADVERSE_ACTION',
    subtype: 'pip',
    baseSeverity: 'severe',
    tangibleAction: true
  },

  written_warning: {
    patterns: [
      /written warning/i,
      /formal warning/i,
      /final warning/i,
      /disciplinary (?:action|notice|warning)/i,
      /write(?:-| )up/i
    ],
    type: 'ADVERSE_ACTION',
    subtype: 'written_warning',
    baseSeverity: 'moderate',
    tangibleAction: true
  },

  termination: {
    patterns: [
      /terminat(?:ed|ion)/i,
      /fired/i,
      /let (?:me |him |her |them )?go/i,
      /position (?:has been |was )?eliminated/i,
      /laid off/i,
      /your last day/i,
      /no longer employed/i,
      /separation agreement/i
    ],
    type: 'ADVERSE_ACTION',
    subtype: 'termination',
    baseSeverity: 'egregious',
    tangibleAction: true
  },

  demotion: {
    patterns: [
      /demot(?:ed|ion)/i,
      /reduced (?:my |your )?(?:title|role|responsibilities)/i,
      /reassigned to (?:a )?(?:lesser|lower|junior)/i,
      /stripped of (?:my |your )?(?:title|role|duties)/i
    ],
    type: 'ADVERSE_ACTION',
    subtype: 'demotion',
    baseSeverity: 'severe',
    tangibleAction: true
  },

  pay_cut: {
    patterns: [
      /(?:pay|salary|compensation) (?:cut|reduction|decrease)/i,
      /reduced (?:my |your )?(?:pay|salary|bonus|compensation)/i,
      /bonus (?:was |has been )?(?:cut|reduced|denied|eliminated)/i,
      /no (?:raise|merit increase|bonus)/i
    ],
    type: 'ADVERSE_ACTION',
    subtype: 'pay_reduction',
    baseSeverity: 'severe',
    tangibleAction: true
  },

  // Denial
  denial: {
    patterns: [
      /denied (?:my |the )?(?:request|promotion|raise|transfer|accommodation)/i,
      /rejected my (?:request|application|proposal)/i,
      /refused to (?:approve|grant|allow|consider)/i,
      /request was (?:denied|rejected)/i,
      /passed over for (?:promotion|raise|opportunity)/i
    ],
    type: 'INCIDENT',
    subtype: 'denial',
    baseSeverity: 'moderate'
  },

  // Micromanagement / different treatment
  differential_treatment: {
    patterns: [
      /treated (?:me )?differently/i,
      /(?:only|just) (?:i|me) (?:was|am|have to)/i,
      /(?:no one|nobody) else (?:has to|is required)/i,
      /singled (?:me )?out/i,
      /held to (?:a )?(?:different|higher) standard/i,
      /micromanag/i,
      /constantly (?:watched|monitored|scrutinized)/i
    ],
    type: 'INCIDENT',
    subtype: 'differential_treatment',
    baseSeverity: 'moderate'
  },

  // Protected activity (not an incident, but important to detect)
  protected_activity: {
    patterns: [
      /filed (?:a )?(?:complaint|charge|claim)/i,
      /reported to (?:hr|human resources|management|eeoc|fchr)/i,
      /submitted (?:a )?(?:complaint|report|charge)/i,
      /contacted (?:eeoc|fchr|dol|osha)/i,
      /made (?:a )?(?:formal |official )?complaint/i,
      /whistleblow/i,
      /requested (?:accommodation|ada|fmla|leave)/i,
      /complained (?:to|about)/i
    ],
    type: 'PROTECTED_ACTIVITY',
    subtype: 'complaint',
    baseSeverity: 'moderate',
    isProtectedActivity: true
  }
};

/**
 * Detect potential incidents from document text
 * Returns array of suggested incidents for user approval
 */
function detectIncidents(text, documentDate = null, documentId = null) {
  if (!text || typeof text !== 'string') {
    return [];
  }

  const detected = [];
  const sentences = splitIntoSentences(text);

  for (const [signalKey, config] of Object.entries(INCIDENT_SIGNALS)) {
    for (const pattern of config.patterns) {
      const match = text.match(pattern);

      if (match) {
        // Find the sentence containing the match
        const matchingSentence = sentences.find(s => pattern.test(s)) || match[0];

        // Try to extract a more specific date from nearby text
        const extractedDate = extractNearbyDate(matchingSentence, documentDate);

        detected.push({
          id: `pending_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          signalKey,
          type: config.type,
          subtype: config.subtype,

          // Suggested values (user can edit)
          suggestedTitle: generateTitle(config.subtype, matchingSentence),
          suggestedDescription: matchingSentence.trim().slice(0, 300),
          suggestedDate: extractedDate,
          suggestedSeverity: config.baseSeverity,

          // Metadata
          matchedPattern: pattern.source,
          matchedText: match[0],
          confidence: calculateConfidence(match, config),

          // Legal factors
          harrisNature: config.harrisNature || null,
          tangibleAction: config.tangibleAction || false,
          burlingtonProximity: config.burlingtonProximity || false,
          isProtectedActivity: config.isProtectedActivity || false,

          // Source
          sourceDocumentId: documentId,

          // Status
          status: 'pending_review',
          needsReview: true
        });

        break; // Only one match per signal type per document
      }
    }
  }

  // Sort by type priority (protected activity first, then adverse actions, then incidents)
  const typePriority = { 'PROTECTED_ACTIVITY': 0, 'ADVERSE_ACTION': 1, 'INCIDENT': 2 };
  detected.sort((a, b) => (typePriority[a.type] || 99) - (typePriority[b.type] || 99));

  return detected;
}

/**
 * Split text into sentences
 */
function splitIntoSentences(text) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 10);
}

/**
 * Extract date from nearby text
 */
function extractNearbyDate(text, fallbackDate) {
  // Simple date patterns
  const patterns = [
    /(?:on|dated?)\s+(\w+\s+\d{1,2},?\s+\d{4})/i,
    /(\d{1,2}\/\d{1,2}\/\d{2,4})/,
    /(\w+\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4})/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      try {
        const parsed = new Date(match[1]);
        if (!isNaN(parsed.getTime())) {
          return parsed.toISOString();
        }
      } catch (e) {
        // Continue to fallback
      }
    }
  }

  return fallbackDate;
}

/**
 * Generate a human-readable title
 */
function generateTitle(subtype, context) {
  const titles = {
    'verbal_abuse': 'Verbal abuse incident',
    'threat': 'Threatening behavior',
    'exclusion': 'Exclusion from meeting/communication',
    'retaliation': 'Potential retaliation',
    'pip': 'Performance Improvement Plan issued',
    'written_warning': 'Written warning received',
    'termination': 'Employment terminated',
    'demotion': 'Demotion or role reduction',
    'pay_reduction': 'Pay or compensation reduced',
    'denial': 'Request denied',
    'differential_treatment': 'Differential treatment',
    'complaint': 'Complaint or report filed'
  };

  return titles[subtype] || 'Incident';
}

/**
 * Calculate confidence score
 */
function calculateConfidence(match, config) {
  let confidence = 0.7;

  // Longer matches are more confident
  if (match[0].length > 20) confidence += 0.1;

  // Tangible actions are more certain
  if (config.tangibleAction) confidence += 0.1;

  // Protected activity patterns are usually clear
  if (config.isProtectedActivity) confidence += 0.1;

  return Math.min(confidence, 0.95);
}

/**
 * Compute severity based on case law factors
 *
 * Harris v. Forklift: Nature of conduct (threatening, humiliating)
 * Vance v. Ball State: Supervisor involvement, tangible employment actions
 * Burlington Northern: Temporal proximity to protected activity
 * National Railroad v. Morgan: Pattern of conduct
 */
function computeSeverity(incident, caseContext = {}, jurisdiction = 'both') {
  const severityLevels = ['minor', 'moderate', 'severe', 'egregious'];
  let severityIndex = severityLevels.indexOf(incident.suggestedSeverity || incident.severity || 'moderate');
  const factors = [];

  // Factor 1: Nature of conduct (Harris v. Forklift) — federal, always relevant
  if (jurisdiction !== 'state') {
    if (incident.harrisNature === 'threatening') {
      severityIndex = Math.min(severityIndex + 1, 3);
      factors.push({
        factor: 'Nature of Conduct',
        citation: 'Harris v. Forklift',
        effect: '+1 (threatening)',
        description: 'Physically threatening or intimidating conduct'
      });
    }
    if (incident.harrisNature === 'humiliating' && caseContext.publicWitnesses) {
      severityIndex = Math.min(severityIndex + 1, 3);
      factors.push({
        factor: 'Public Humiliation',
        citation: 'Harris v. Forklift',
        effect: '+1 (public)',
        description: 'Humiliating conduct in front of others'
      });
    }
  }

  // Factor 2: Tangible employment action (Vance v. Ball State) — federal, always relevant
  if (jurisdiction !== 'state' && incident.tangibleAction) {
    severityIndex = Math.min(severityIndex + 1, 3);
    factors.push({
      factor: 'Tangible Action',
      citation: 'Vance v. Ball State',
      effect: '+1',
      description: 'Significant change in employment status'
    });
  }

  // Factor 3: Proximity to protected activity — jurisdiction-dependent
  if (incident.burlingtonProximity && caseContext.daysAfterProtectedActivity) {
    const days = caseContext.daysAfterProtectedActivity;

    if (jurisdiction === 'state') {
      // Thomas v. Cooper Lighting: strict ~60 day proximity (11th Circuit)
      if (days <= 60) {
        severityIndex = Math.min(severityIndex + 2, 3);
        factors.push({
          factor: 'Temporal Proximity (Strict)',
          citation: 'Thomas v. Cooper Lighting',
          effect: '+2 (within 60 days, 11th Circuit)',
          description: `Occurred ${days} days after protected activity`
        });
      }
    } else {
      // Federal or Both: Burlington Northern flexible timing
      if (days <= 14) {
        severityIndex = Math.min(severityIndex + 2, 3);
        factors.push({
          factor: 'Temporal Proximity',
          citation: 'Burlington Northern',
          effect: '+2 (within 14 days)',
          description: `Occurred ${days} days after protected activity`
        });
      } else if (days <= 30) {
        severityIndex = Math.min(severityIndex + 1, 3);
        factors.push({
          factor: 'Temporal Proximity',
          citation: 'Burlington Northern',
          effect: '+1 (within 30 days)',
          description: `Occurred ${days} days after protected activity`
        });
      }

      // In "both" mode, note the Thomas strict standard if gap > 60 days
      if (jurisdiction === 'both' && days > 60) {
        factors.push({
          factor: '11th Circuit Strict Standard',
          citation: 'Thomas v. Cooper Lighting',
          effect: 'advisory',
          description: `Gap of ${days} days exceeds 11th Circuit ~60-day threshold; additional corroborating evidence needed for state claim`
        });
      }
    }
  }

  // Factor 4: Supervisor involvement (Vance v. Ball State) — always relevant
  if (caseContext.involvesSupervisor) {
    severityIndex = Math.min(severityIndex + 1, 3);
    factors.push({
      factor: 'Supervisor Involvement',
      citation: 'Vance v. Ball State',
      effect: '+1',
      description: 'Perpetrator has authority to take tangible employment action'
    });
  }

  // Factor 5: Pattern (Morgan) — federal, always relevant
  if (jurisdiction !== 'state' && caseContext.incidentCount >= 3) {
    severityIndex = Math.min(severityIndex + 1, 3);
    factors.push({
      factor: 'Pattern of Conduct',
      citation: 'National Railroad v. Morgan',
      effect: '+1',
      description: `Part of pattern (${caseContext.incidentCount} incidents)`
    });
  }

  // Factor 6: Gessner actual violation warning (state/both, whistleblower)
  if (jurisdiction !== 'federal' && caseContext.isWhistleblower && !caseContext.hasActualViolationProof) {
    factors.push({
      factor: 'Actual Violation Required',
      citation: 'Gessner v. Gulf Power',
      effect: 'warning',
      description: 'FL Whistleblower Act requires proof of ACTUAL violation, not just reasonable belief'
    });
  }

  return {
    baseSeverity: incident.suggestedSeverity || incident.severity,
    computedSeverity: severityLevels[severityIndex],
    factors,
    wasElevated: severityIndex > severityLevels.indexOf(incident.suggestedSeverity || incident.severity || 'moderate')
  };
}

module.exports = {
  detectIncidents,
  computeSeverity,
  INCIDENT_SIGNALS
};
