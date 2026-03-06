/**
 * Federal + Florida employment law precedents
 * Each has elements that must be satisfied
 */
const PRECEDENTS = {
  burlington_northern: {
    id: 'burlington_northern',
    name: 'Burlington Northern v. White',
    citation: '548 U.S. 53 (2006)',
    year: 2006,
    court: 'Supreme Court',
    standard: 'Retaliation',
    summary: 'Broad retaliation protection - any action that would dissuade a reasonable worker from making a charge',
    elements: [
      {
        id: 'protected_activity',
        name: 'Protected Activity',
        description: 'Employee engaged in protected activity (complaint, report, EEOC charge)',
        evidenceTypes: ['PROTECTED_ACTIVITY', 'REQUEST_FOR_HELP'],
        required: true
      },
      {
        id: 'adverse_action',
        name: 'Materially Adverse Action',
        description: 'Employer took action that would dissuade a reasonable worker',
        evidenceTypes: ['ADVERSE_ACTION'],
        required: true
      },
      {
        id: 'causal_connection',
        name: 'Causal Connection',
        description: 'Connection between protected activity and adverse action (timing, statements)',
        checkType: 'temporal_proximity',
        maxDays: 90,
        required: true
      }
    ]
  },

  harris: {
    id: 'harris',
    name: 'Harris v. Forklift Systems',
    citation: '510 U.S. 17 (1993)',
    year: 1993,
    court: 'Supreme Court',
    standard: 'Hostile Work Environment',
    summary: 'Conduct must be severe OR pervasive - no requirement to prove psychological harm',
    elements: [
      {
        id: 'unwelcome_conduct',
        name: 'Unwelcome Conduct',
        description: 'The conduct was unwelcome to the employee',
        evidenceTypes: ['INCIDENT', 'REQUEST_FOR_HELP', 'CLAIM_YOU_MADE'],
        required: true
      },
      {
        id: 'based_on_protected_class',
        name: 'Based on Protected Class',
        description: 'Conduct was based on race, sex, religion, national origin, etc.',
        checkType: 'manual',
        required: true
      },
      {
        id: 'severe_or_pervasive',
        name: 'Severe or Pervasive',
        description: 'Conduct severe enough OR frequent enough to alter work conditions',
        checkType: 'severity_pattern',
        minIncidents: 3,
        required: true
      },
      {
        id: 'employer_liability',
        name: 'Employer Knew or Should Have Known',
        description: 'Employer was aware and failed to take corrective action',
        evidenceTypes: ['REQUEST_FOR_HELP', 'RESPONSE'],
        required: true
      }
    ]
  },

  vance: {
    id: 'vance',
    name: 'Vance v. Ball State',
    citation: '570 U.S. 421 (2013)',
    year: 2013,
    court: 'Supreme Court',
    standard: 'Supervisor Definition',
    summary: 'Supervisor = someone who can take tangible employment action (hire, fire, promote, demote)',
    elements: [
      {
        id: 'supervisor_harasser',
        name: 'Harasser is Supervisor',
        description: 'The harasser can take tangible employment action against the victim',
        checkType: 'actor_relationship',
        relationships: ['manager', 'supervisor', 'director'],
        required: false,
        note: 'If satisfied, employer is vicariously liable'
      },
      {
        id: 'tangible_action',
        name: 'Tangible Employment Action',
        description: 'Significant change in employment status (termination, demotion, reassignment)',
        evidenceTypes: ['ADVERSE_ACTION'],
        required: false
      }
    ]
  },

  morgan: {
    id: 'morgan',
    name: 'National Railroad v. Morgan',
    citation: '536 U.S. 101 (2002)',
    year: 2002,
    court: 'Supreme Court',
    standard: 'Continuing Violation',
    summary: 'Hostile environment claims based on cumulative acts - earlier acts recoverable if pattern continues',
    elements: [
      {
        id: 'pattern_of_conduct',
        name: 'Pattern of Conduct',
        description: 'Series of related acts constituting ongoing hostile environment',
        checkType: 'incident_count',
        minIncidents: 2,
        required: true
      },
      {
        id: 'timely_act',
        name: 'At Least One Timely Act',
        description: 'At least one act within the filing period (365 days FCHR, 300 days EEOC)',
        checkType: 'filing_deadline',
        required: true
      }
    ]
  },

  faragher: {
    id: 'faragher',
    name: 'Faragher/Ellerth',
    citation: '524 U.S. 775 (1998)',
    year: 1998,
    court: 'Supreme Court',
    standard: 'Employer Liability Defense',
    summary: 'Employer defense requires: (1) reasonable care to prevent/correct, (2) employee unreasonably failed to use procedures',
    elements: [
      {
        id: 'reported_to_employer',
        name: 'Reported to Employer',
        description: 'Employee used available complaint procedures',
        evidenceTypes: ['REQUEST_FOR_HELP', 'PROTECTED_ACTIVITY'],
        required: true,
        note: 'If you reported, employer loses affirmative defense'
      },
      {
        id: 'employer_failed_to_act',
        name: 'Employer Failed to Correct',
        description: 'Employer did not take prompt remedial action',
        checkType: 'response_analysis',
        required: false
      }
    ]
  },

  // ---- Florida & 11th Circuit Precedents ----

  harper_fcra: {
    id: 'harper_fcra',
    name: 'Harper v. Blockbuster Entertainment',
    citation: '139 F.3d 1385 (11th Cir. 1998)',
    year: 1998,
    court: '11th Circuit',
    jurisdiction: 'FL',
    standard: 'FCRA / McDonnell Douglas',
    summary: 'FCRA discrimination claims follow Title VII McDonnell Douglas burden-shifting framework — same analysis for Florida state claims',
    elements: [
      {
        id: 'protected_class_member',
        name: 'Protected Class Membership',
        description: 'Employee is a member of a protected class (race, sex, religion, national origin, age, marital status, handicap)',
        checkType: 'manual',
        required: true
      },
      {
        id: 'adverse_action',
        name: 'Adverse Employment Action',
        description: 'Employee suffered an adverse employment action',
        evidenceTypes: ['ADVERSE_ACTION'],
        required: true
      },
      {
        id: 'comparator_evidence',
        name: 'Comparator / Differential Treatment',
        description: 'Similarly situated employees outside the protected class were treated more favorably',
        evidenceTypes: ['SUPPORTING', 'PAY_RECORD', 'INCIDENT'],
        required: true,
        note: 'Can use Lewis v. Union City "convincing mosaic" as alternative'
      }
    ]
  },

  joshua_filing: {
    id: 'joshua_filing',
    name: 'Joshua v. City of Gainesville',
    citation: '768 So. 2d 432 (Fla. 2000)',
    year: 2000,
    court: 'Florida Supreme Court',
    jurisdiction: 'FL',
    standard: 'FCRA Filing Deadlines',
    summary: 'FCRA requires timely filing: 365 days to FCHR, then 1 year to file suit after FCHR notice (narrowed by HB 255, eff. July 2020)',
    elements: [
      {
        id: 'timely_fchr_filing',
        name: 'Timely FCHR Filing',
        description: 'Complaint filed with FCHR within 365 days of discriminatory act',
        checkType: 'filing_deadline',
        required: true
      },
      {
        id: 'protected_activity_documented',
        name: 'Protected Activity Documented',
        description: 'FCHR charge or EEOC dual-filing documented in evidence',
        evidenceTypes: ['PROTECTED_ACTIVITY', 'CLAIM_YOU_MADE'],
        required: true
      }
    ]
  },

  lewis_mosaic: {
    id: 'lewis_mosaic',
    name: 'Lewis v. City of Union City',
    citation: '918 F.3d 1213 (11th Cir. 2019) (en banc)',
    year: 2019,
    court: '11th Circuit (en banc)',
    jurisdiction: 'FL',
    standard: 'Convincing Mosaic',
    summary: 'Plaintiff can prove discrimination without strict comparator by presenting a "convincing mosaic" of circumstantial evidence — suspicious timing, ambiguous statements, differential treatment',
    elements: [
      {
        id: 'suspicious_timing',
        name: 'Suspicious Timing',
        description: 'Adverse action closely followed protected activity or complaint',
        checkType: 'temporal_proximity',
        maxDays: 120,
        required: false,
        note: 'Part of mosaic — multiple circumstantial indicators needed'
      },
      {
        id: 'differential_treatment',
        name: 'Differential Treatment Evidence',
        description: 'Evidence of different treatment based on protected characteristic',
        evidenceTypes: ['INCIDENT', 'ADVERSE_ACTION', 'PAY_RECORD'],
        required: true
      },
      {
        id: 'inconsistent_explanations',
        name: 'Inconsistent or Shifting Explanations',
        description: 'Employer gave shifting or contradictory reasons for adverse action',
        evidenceTypes: ['RESPONSE', 'CLAIM_AGAINST_YOU', 'SUPPORTING'],
        required: false,
        note: 'Strengthens mosaic — shows pretext'
      }
    ]
  },

  monaghan_retaliation: {
    id: 'monaghan_retaliation',
    name: 'Monaghan v. Worldpay',
    citation: '955 F.3d 855 (11th Cir. 2020)',
    year: 2020,
    court: '11th Circuit',
    jurisdiction: 'FL',
    standard: 'Retaliatory Harassment',
    summary: 'Retaliatory harassment does NOT require "severe or pervasive" showing — Burlington Northern "dissuade a reasonable worker" standard applies to all retaliation claims',
    elements: [
      {
        id: 'protected_activity',
        name: 'Protected Activity',
        description: 'Employee engaged in protected activity (complaint, charge, report)',
        evidenceTypes: ['PROTECTED_ACTIVITY', 'REQUEST_FOR_HELP'],
        required: true
      },
      {
        id: 'retaliatory_conduct',
        name: 'Retaliatory Conduct',
        description: 'Harassment or mistreatment following protected activity (no need to be severe or pervasive)',
        evidenceTypes: ['INCIDENT', 'ADVERSE_ACTION'],
        required: true
      },
      {
        id: 'dissuade_standard',
        name: 'Would Dissuade Reasonable Worker',
        description: 'Conduct would dissuade a reasonable worker from making a charge',
        checkType: 'incident_count',
        minIncidents: 1,
        required: true,
        note: 'Even a single act can suffice if materially adverse'
      }
    ]
  },

  thomas_proximity: {
    id: 'thomas_proximity',
    name: 'Thomas v. Cooper Lighting',
    citation: '506 F.3d 1361 (11th Cir. 2007)',
    year: 2007,
    court: '11th Circuit',
    jurisdiction: 'FL',
    standard: 'Temporal Proximity (Strict)',
    summary: 'In the 11th Circuit, temporal proximity alone must be "very close" — a 3-4 month gap is insufficient without additional evidence of retaliatory intent',
    elements: [
      {
        id: 'protected_activity',
        name: 'Protected Activity',
        description: 'Employee engaged in protected activity',
        evidenceTypes: ['PROTECTED_ACTIVITY'],
        required: true
      },
      {
        id: 'adverse_action',
        name: 'Adverse Action',
        description: 'Employer took adverse employment action',
        evidenceTypes: ['ADVERSE_ACTION'],
        required: true
      },
      {
        id: 'close_temporal_proximity',
        name: 'Very Close Temporal Proximity',
        description: 'Adverse action within ~60 days of protected activity (11th Circuit strict standard)',
        checkType: 'temporal_proximity',
        maxDays: 60,
        required: false,
        note: 'If gap exceeds 60 days, need additional corroborating evidence'
      },
      {
        id: 'corroborating_evidence',
        name: 'Corroborating Evidence (if gap > 60 days)',
        description: 'Additional evidence of retaliatory intent if timing alone is not very close',
        evidenceTypes: ['INCIDENT', 'RESPONSE', 'SUPPORTING'],
        required: false,
        note: 'Pattern of antagonism, retaliatory statements, intervening acts'
      }
    ]
  },

  sierminski_whistleblower: {
    id: 'sierminski_whistleblower',
    name: 'Sierminski v. Transouth Financial',
    citation: '216 F.3d 945 (11th Cir. 2000)',
    year: 2000,
    court: '11th Circuit',
    jurisdiction: 'FL',
    standard: 'FL Whistleblower Protection',
    summary: 'Florida Whistleblower Act (Fla. Stat. 448.102) claims use Title VII burden-shifting — employee must show protected activity and adverse action are "not completely unrelated"',
    elements: [
      {
        id: 'whistleblower_activity',
        name: 'Whistleblower Protected Activity',
        description: 'Employee disclosed, objected to, or refused to participate in a violation of law',
        evidenceTypes: ['PROTECTED_ACTIVITY', 'REQUEST_FOR_HELP'],
        required: true,
        note: 'Under Fla. Stat. 448.102 — disclosure, objection, or refusal'
      },
      {
        id: 'adverse_action',
        name: 'Adverse Employment Action',
        description: 'Employer took retaliatory employment action',
        evidenceTypes: ['ADVERSE_ACTION'],
        required: true
      },
      {
        id: 'causal_connection',
        name: 'Causal Connection',
        description: 'Protected activity and adverse action are "not completely unrelated"',
        checkType: 'temporal_proximity',
        maxDays: 90,
        required: true
      }
    ]
  },

  gessner_actual_violation: {
    id: 'gessner_actual_violation',
    name: 'Gessner v. Gulf Power Co.',
    citation: 'Fla. 1st DCA (2024)',
    year: 2024,
    court: 'Florida 1st DCA',
    jurisdiction: 'FL',
    standard: 'Actual Violation Required (Whistleblower)',
    summary: 'FL Whistleblower Act requires proof of an ACTUAL violation — unlike federal law, a reasonable belief of a violation is NOT sufficient',
    elements: [
      {
        id: 'identified_violation',
        name: 'Actual Violation of Law',
        description: 'Employee must prove employer actually violated a specific law, rule, or regulation',
        evidenceTypes: ['SUPPORTING'],
        required: true,
        note: 'CRITICAL: FL requires actual violation, not just reasonable belief (stricter than federal)'
      },
      {
        id: 'objection_or_refusal',
        name: 'Objection or Refusal to Participate',
        description: 'Employee objected to or refused to participate in the violation',
        evidenceTypes: ['PROTECTED_ACTIVITY', 'REQUEST_FOR_HELP'],
        required: true
      },
      {
        id: 'adverse_action',
        name: 'Retaliatory Adverse Action',
        description: 'Employer took adverse action after objection or refusal',
        evidenceTypes: ['ADVERSE_ACTION'],
        required: true
      }
    ]
  },

  muldrow_some_harm: {
    id: 'muldrow_some_harm',
    name: 'Muldrow v. City of St. Louis',
    citation: '144 S. Ct. 967 (2024)',
    year: 2024,
    court: 'Supreme Court',
    jurisdiction: 'federal',
    standard: 'Lowered Adverse Action Threshold',
    summary: 'Only "some harm" needed for adverse action in discrimination claims — lateral transfers, PIPs, schedule changes, duty changes all qualify (does NOT change Burlington Northern retaliation standard)',
    elements: [
      {
        id: 'protected_class',
        name: 'Protected Class Membership',
        description: 'Employee is a member of a protected class',
        checkType: 'manual',
        required: true
      },
      {
        id: 'some_harm_action',
        name: 'Action Causing "Some Harm"',
        description: 'Employer took action affecting terms or conditions of employment (even transfers, PIPs, schedule changes, duty changes)',
        evidenceTypes: ['ADVERSE_ACTION'],
        required: true,
        note: 'Lowered from "significant" to "some harm" — broadens what counts as adverse'
      },
      {
        id: 'discriminatory_motive',
        name: 'Discriminatory Motive',
        description: 'Action was based on protected characteristic',
        evidenceTypes: ['INCIDENT', 'CONTEXT'],
        required: true,
        note: 'Statements, pattern, differential treatment'
      }
    ]
  }
};

/**
 * Analyze case evidence against all precedents
 */
function analyzeAllPrecedents(documents, incidents = [], actors = []) {
  const results = {};

  for (const [key, precedent] of Object.entries(PRECEDENTS)) {
    results[key] = analyzePrecedent(precedent, documents, incidents, actors);
  }

  // Calculate overall case strength — include FL precedents when relevant
  const keyPrecedents = ['burlington_northern', 'harris'];

  // Add whistleblower precedent if whistleblower evidence present
  const hasWhistleblower = documents.some(d =>
    d.user_context && /whistleblower|osha|safety.violation|reported.*violation/i.test(d.user_context)
  );
  if (hasWhistleblower && results.sierminski_whistleblower) {
    keyPrecedents.push('sierminski_whistleblower');
  }

  const avgAlignment = keyPrecedents.reduce((sum, key) => {
    return sum + (results[key]?.alignmentPercent || 0);
  }, 0) / keyPrecedents.length;

  return {
    precedents: results,
    caseStrength: Math.round(avgAlignment),
    primaryPrecedent: determinePrimaryPrecedent(results, documents)
  };
}

/**
 * Analyze single precedent
 */
function analyzePrecedent(precedent, documents, incidents, actors) {
  const elementResults = {};

  for (const element of precedent.elements) {
    elementResults[element.id] = analyzeElement(element, documents, incidents, actors);
  }

  // Calculate alignment
  const requiredElements = precedent.elements.filter(e => e.required);
  const satisfiedRequired = requiredElements.filter(e => elementResults[e.id].satisfied);
  const alignmentPercent = requiredElements.length > 0
    ? Math.round((satisfiedRequired.length / requiredElements.length) * 100)
    : 0;

  // Find gaps
  const gaps = precedent.elements
    .filter(e => e.required && !elementResults[e.id].satisfied)
    .map(e => ({
      element: e.name,
      description: e.description,
      recommendation: getRecommendation(e)
    }));

  return {
    ...precedent,
    elements: elementResults,
    satisfiedCount: satisfiedRequired.length,
    totalRequired: requiredElements.length,
    alignmentPercent,
    strength: alignmentPercent >= 75 ? 'strong' : alignmentPercent >= 50 ? 'moderate' : 'weak',
    gaps
  };
}

/**
 * Analyze single element
 */
function analyzeElement(element, documents, incidents, actors) {
  let satisfied = false;
  let evidence = [];
  let note = '';

  // Check by evidence type (primary OR secondary classification)
  if (element.evidenceTypes) {
    const matching = documents.filter(d =>
      element.evidenceTypes.includes(d.evidence_type) ||
      (d.evidence_secondary && element.evidenceTypes.includes(d.evidence_secondary))
    );
    satisfied = matching.length > 0;
    evidence = matching.map(d => ({
      id: d.id, type: 'document', name: d.filename,
      matchedAs: element.evidenceTypes.includes(d.evidence_type) ? 'primary' : 'secondary'
    }));
  }

  // Check temporal proximity (consider secondary types too)
  if (element.checkType === 'temporal_proximity') {
    const protectedDocs = documents.filter(d =>
      d.evidence_type === 'PROTECTED_ACTIVITY' || d.evidence_secondary === 'PROTECTED_ACTIVITY'
    );
    const adverseDocs = documents.filter(d =>
      d.evidence_type === 'ADVERSE_ACTION' || d.evidence_secondary === 'ADVERSE_ACTION'
    );

    if (protectedDocs.length > 0 && adverseDocs.length > 0) {
      const protectedDate = new Date(Math.min(...protectedDocs.map(d => new Date(d.document_date))));
      const adverseDate = new Date(Math.min(...adverseDocs.map(d => new Date(d.document_date))));
      const daysDiff = Math.floor((adverseDate - protectedDate) / (1000 * 60 * 60 * 24));

      if (daysDiff > 0 && daysDiff <= element.maxDays) {
        satisfied = true;
        note = `${daysDiff} days between protected activity and adverse action`;
      }
    }
  }

  // Check severity pattern
  if (element.checkType === 'severity_pattern') {
    const incidentDocs = documents.filter(d =>
      ['INCIDENT', 'ADVERSE_ACTION'].includes(d.evidence_type)
    );
    const totalIncidents = incidentDocs.length + incidents.length;

    satisfied = totalIncidents >= element.minIncidents;
    if (satisfied) {
      note = `${totalIncidents} incidents documented (meets pervasive threshold)`;
    }
  }

  // Check incident count
  if (element.checkType === 'incident_count') {
    const incidentDocs = documents.filter(d =>
      ['INCIDENT', 'ADVERSE_ACTION'].includes(d.evidence_type)
    );
    satisfied = (incidentDocs.length + incidents.length) >= element.minIncidents;
  }

  // Check filing deadline
  if (element.checkType === 'filing_deadline') {
    const now = new Date();
    const fchrCutoff = new Date(now.getTime() - (365 * 24 * 60 * 60 * 1000));

    const timelyDocs = documents.filter(d =>
      d.document_date && new Date(d.document_date) > fchrCutoff
    );
    satisfied = timelyDocs.length > 0;
    if (satisfied) {
      note = 'Events within FCHR 365-day filing window';
    }
  }

  // Check actor relationship
  if (element.checkType === 'actor_relationship') {
    const supervisorActors = actors.filter(a =>
      element.relationships.includes(a.relationship_to_self) ||
      element.relationships.includes(a.role) ||
      a.classification === 'bad_actor'
    );
    satisfied = supervisorActors.length > 0;
    if (satisfied) {
      note = `Supervisor involvement: ${supervisorActors.map(a => a.name).join(', ')}`;
    }
  }

  return {
    ...element,
    satisfied,
    evidence,
    note: note || element.note || ''
  };
}

/**
 * Get recommendation for unsatisfied element
 */
function getRecommendation(element) {
  const recommendations = {
    'protected_activity': 'Document any complaints made to HR, management, or agencies (EEOC, FCHR)',
    'adverse_action': 'Gather evidence of negative employment actions (PIP, demotion, termination, pay cut)',
    'causal_connection': 'Establish timeline showing adverse action followed protected activity',
    'unwelcome_conduct': 'Document incidents showing the conduct was unwelcome',
    'based_on_protected_class': 'Show connection between conduct and protected characteristic',
    'severe_or_pervasive': 'Document additional incidents to establish pattern',
    'employer_liability': 'Show evidence that you reported to HR/management',
    'reported_to_employer': 'Document all complaints made through official channels',
    'pattern_of_conduct': 'Document additional related incidents',
    'timely_act': 'Identify incidents within the past 365 days',
    // Florida / 11th Circuit elements
    'protected_class_member': 'Document your protected class membership (race, sex, religion, national origin, age, marital status, handicap)',
    'comparator_evidence': 'Identify similarly situated employees outside your class who were treated more favorably, or build a "convincing mosaic" (Lewis v. Union City)',
    'timely_fchr_filing': 'Verify complaint was filed with FCHR within 365 days of the discriminatory act',
    'protected_activity_documented': 'Gather copies of your FCHR charge, EEOC dual-filing, or demand letter',
    'suspicious_timing': 'Document the timeline between your complaint and the adverse action',
    'differential_treatment': 'Gather evidence showing you were treated differently than others based on your protected characteristic',
    'inconsistent_explanations': 'Document employer\'s shifting or contradictory reasons for the adverse action',
    'retaliatory_conduct': 'Document harassment or mistreatment that followed your protected activity',
    'dissuade_standard': 'Document any retaliatory action — even a single act can suffice under Monaghan',
    'close_temporal_proximity': 'In the 11th Circuit, the gap must be ~60 days or less for timing alone to prove causation',
    'corroborating_evidence': 'If timing gap exceeds 60 days, gather additional evidence of retaliatory intent (hostile statements, pattern of antagonism)',
    'whistleblower_activity': 'Document your disclosure, objection, or refusal to participate in the violation',
    'identified_violation': 'Under FL Whistleblower Act, you must prove an ACTUAL violation of a specific law, rule, or regulation — reasonable belief is not enough',
    'objection_or_refusal': 'Document that you objected to or refused to participate in the violation',
    'protected_class': 'Document your protected class membership',
    'some_harm_action': 'Under Muldrow (2024), even lateral transfers, PIPs, schedule changes, and duty changes count as adverse — document any harm to employment terms',
    'discriminatory_motive': 'Gather evidence connecting the action to your protected characteristic (statements, pattern, differential treatment)'
  };

  return recommendations[element.id] || 'Gather additional supporting evidence';
}

/**
 * Determine which precedent is most relevant
 */
function determinePrimaryPrecedent(results, documents) {
  // Check for whistleblower pattern — FL Whistleblower Act takes priority when present
  const hasWhistleblower = documents.some(d =>
    d.user_context && /whistleblower|osha|safety.violation|reported.*violation/i.test(d.user_context)
  );
  if (hasWhistleblower && results.sierminski_whistleblower?.alignmentPercent > 30) {
    return 'sierminski_whistleblower';
  }

  // Check for mosaic pattern — strong circumstantial case without strict comparator
  const hasMultipleIncidents = documents.filter(d =>
    d.evidence_type === 'INCIDENT' || d.evidence_secondary === 'INCIDENT'
  ).length >= 2;
  const hasAdverse = documents.some(d =>
    d.evidence_type === 'ADVERSE_ACTION' || d.evidence_secondary === 'ADVERSE_ACTION'
  );
  const hasShiftingReasons = documents.some(d =>
    d.evidence_type === 'RESPONSE' || d.evidence_type === 'CLAIM_AGAINST_YOU'
  );
  if (hasMultipleIncidents && hasAdverse && hasShiftingReasons && results.lewis_mosaic?.alignmentPercent > 40) {
    return 'lewis_mosaic';
  }

  // Standard retaliation analysis
  const hasRetaliation = documents.some(d =>
    d.evidence_type === 'PROTECTED_ACTIVITY' ||
    d.evidence_type === 'ADVERSE_ACTION'
  );

  if (hasRetaliation && results.burlington_northern?.alignmentPercent > 30) {
    return 'burlington_northern';
  }

  const hasHostile = documents.some(d => d.evidence_type === 'INCIDENT');
  if (hasHostile && results.harris?.alignmentPercent > 30) {
    return 'harris';
  }

  return 'burlington_northern';
}

/**
 * Get precedent badges for a specific document
 */
function getDocumentPrecedentBadges(document, allResults) {
  const badges = [];
  const type = document.evidence_type;
  const secondary = document.evidence_secondary;

  // Burlington Northern - if it's protected activity or adverse action
  if (['PROTECTED_ACTIVITY', 'ADVERSE_ACTION'].includes(type)) {
    const bn = allResults.precedents?.burlington_northern;
    if (bn) {
      badges.push({
        precedent: 'Burlington Northern',
        short: 'BN',
        percent: bn.alignmentPercent,
        strength: bn.strength,
        relevance: type === 'PROTECTED_ACTIVITY' ? 'protected_activity' : 'adverse_action'
      });
    }
  }

  // Harris - if it's an incident
  if (type === 'INCIDENT') {
    const harris = allResults.precedents?.harris;
    if (harris) {
      badges.push({
        precedent: 'Harris',
        short: 'Harris',
        percent: harris.alignmentPercent,
        strength: harris.strength,
        relevance: 'hostile_environment'
      });
    }
  }

  // Harper FCRA - discrimination with adverse action or pay/comparator evidence
  if (['ADVERSE_ACTION', 'PAY_RECORD', 'SUPPORTING'].includes(type) || ['ADVERSE_ACTION', 'PAY_RECORD'].includes(secondary)) {
    const harper = allResults.precedents?.harper_fcra;
    if (harper && harper.alignmentPercent > 30) {
      badges.push({
        precedent: 'Harper v. Blockbuster',
        short: 'FCRA',
        percent: harper.alignmentPercent,
        strength: harper.strength,
        relevance: 'fcra_discrimination'
      });
    }
  }

  // Lewis Mosaic - incidents, adverse actions, or responses showing pretext
  if (['INCIDENT', 'ADVERSE_ACTION', 'RESPONSE', 'CLAIM_AGAINST_YOU'].includes(type)) {
    const lewis = allResults.precedents?.lewis_mosaic;
    if (lewis && lewis.alignmentPercent > 30) {
      badges.push({
        precedent: 'Lewis v. Union City',
        short: 'Mosaic',
        percent: lewis.alignmentPercent,
        strength: lewis.strength,
        relevance: 'convincing_mosaic'
      });
    }
  }

  // Monaghan - retaliatory harassment (protected activity or retaliatory incidents)
  if (['PROTECTED_ACTIVITY', 'INCIDENT'].includes(type) || secondary === 'INCIDENT') {
    const monaghan = allResults.precedents?.monaghan_retaliation;
    if (monaghan && monaghan.alignmentPercent > 30) {
      badges.push({
        precedent: 'Monaghan v. Worldpay',
        short: 'Monaghan',
        percent: monaghan.alignmentPercent,
        strength: monaghan.strength,
        relevance: 'retaliatory_harassment'
      });
    }
  }

  // Thomas Proximity - protected activity or adverse action (strict timing)
  if (['PROTECTED_ACTIVITY', 'ADVERSE_ACTION'].includes(type)) {
    const thomas = allResults.precedents?.thomas_proximity;
    if (thomas && thomas.alignmentPercent > 30) {
      badges.push({
        precedent: 'Thomas v. Cooper Lighting',
        short: 'Thomas',
        percent: thomas.alignmentPercent,
        strength: thomas.strength,
        relevance: 'temporal_proximity'
      });
    }
  }

  // Sierminski Whistleblower - protected activity or adverse action in whistleblower context
  if (['PROTECTED_ACTIVITY', 'ADVERSE_ACTION', 'REQUEST_FOR_HELP'].includes(type)) {
    const sierminski = allResults.precedents?.sierminski_whistleblower;
    if (sierminski && sierminski.alignmentPercent > 30) {
      badges.push({
        precedent: 'Sierminski v. Transouth',
        short: 'Whistle',
        percent: sierminski.alignmentPercent,
        strength: sierminski.strength,
        relevance: 'whistleblower'
      });
    }
  }

  // Gessner - supporting evidence of actual violation in whistleblower context
  if (['SUPPORTING', 'PROTECTED_ACTIVITY'].includes(type)) {
    const gessner = allResults.precedents?.gessner_actual_violation;
    if (gessner && gessner.alignmentPercent > 30) {
      badges.push({
        precedent: 'Gessner v. Gulf Power',
        short: 'Gessner',
        percent: gessner.alignmentPercent,
        strength: gessner.strength,
        relevance: 'actual_violation'
      });
    }
  }

  // Muldrow - any adverse action (broadened definition)
  if (type === 'ADVERSE_ACTION') {
    const muldrow = allResults.precedents?.muldrow_some_harm;
    if (muldrow && muldrow.alignmentPercent > 30) {
      badges.push({
        precedent: 'Muldrow v. St. Louis',
        short: 'Muldrow',
        percent: muldrow.alignmentPercent,
        strength: muldrow.strength,
        relevance: 'lowered_threshold'
      });
    }
  }

  return badges;
}

module.exports = {
  PRECEDENTS,
  analyzeAllPrecedents,
  analyzePrecedent,
  getDocumentPrecedentBadges
};
