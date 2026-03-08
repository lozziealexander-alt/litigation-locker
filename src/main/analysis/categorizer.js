/**
 * Incident Categorization Engine
 *
 * Classifies documents/entries into their role within an incident chain.
 * Prevents:
 *   - The underlying incident being tagged as a "report"
 *   - Two separate reports (supervisor + HR) being merged into one
 *   - Follow-up emails/meetings from inflating incident severity
 *   - Severity being pulled from administrative records rather than the actual incident
 *
 * Also surfaces employer liability signals separately from incident severity:
 *   - How many times the employer was put on notice
 *   - Whether they took action after each notice
 *   - Whether the conduct continued post-notice
 *   - Deliberate indifference patterns
 *
 * Category taxonomy:
 *   INCIDENT          — The actual event that occurred
 *   REPORT_SUPERVISOR — Report made to a direct supervisor/manager
 *   REPORT_HR         — Report made to Human Resources
 *   REPORT_OTHER      — Report to another party (union, ombudsman, etc.)
 *   FOLLOWUP_EMAIL    — Recap/documentation email sent after a report/meeting
 *   MEETING           — In-person or virtual meeting about the incident
 *   WITNESS_STATEMENT — Statement from a third party
 *   RESPONSE_RECEIVED — Formal/informal response from employer
 *   RETALIATION       — Subsequent adverse action linked to the report
 *   EVIDENCE          — Supporting material (photos, screenshots, etc.)
 *   UNKNOWN           — Cannot be determined
 *
 * Legal doctrine references:
 *   Faragher/Ellerth  — Employer liability / deliberate indifference
 *   Burlington Northern — Retaliation timing
 */

// ---------------------------------------------------------------------------
// Pattern banks
// ---------------------------------------------------------------------------

const INCIDENT_PATTERNS = [
  /\b(he|she|they)\s+(touched|grabbed|groped|kissed|cornered|followed|exposed|showed|sent|texted|said|told|whispered|stared|comment(ed)?)\b/i,
  /\b(inappropriate|unwanted|unwelcome)\s+(touch|contact|comment|advance|behavior|conduct)\b/i,
  /\b(harass(ed|ment|ing))\b/i,
  /\b(sexual(ly)?)\s+(harass|assault|comment|advance|explicit)\b/i,
  /\b(in the (break room|office|parking lot|elevator|meeting|hallway|bathroom))\b/i,
  /\b(he|she|they)\s+(made me|forced|pressured|coerced)\b/i,
  /\b(the incident (occurred|happened|took place))\b/i,
  /\bwhat happened\b/i,
  /\b(I was|I felt|I experienced)\b/i,
  /\b(on [A-Z][a-z]+(day)?|on \d{1,2}\/\d{1,2})\b.*\b(he|she|they)\b/i,
];

const REPORT_SUPERVISOR_PATTERNS = [
  /\b(told|informed|notified|spoke (to|with)|reported (to|it to))\b.{0,80}\b(my )?(boss|manager|supervisor|lead|director)\b/i,
  /\b(my )?(boss|manager|supervisor|lead|director)\b.{0,80}\b(told|informed|notified|spoke|reported)\b/i,
  /\b(escalat(ed|ing) to)\b.{0,60}\b(manager|supervisor|lead)\b/i,
  /\breport(ed)? (it |this )?(to )?(my )?(manager|supervisor|boss|lead|director)\b/i,
  /\b(manager|supervisor|boss|lead|director)\b.{0,40}\b(meeting|conversation|discussion|call)\b/i,
  /\b(I )(told|informed|notified|reported to|spoke with|let)\b.{0,80}\b(my )?(manager|supervisor|boss|lead|director)\b/i,
  /\bwhat happened\b.{0,120}\b(to )(my )?(manager|boss|supervisor)\b/i,
  /\b(my )?(manager|boss|supervisor)\b.{0,40}\b(said|told|promised|would|will)\b/i,
];

const REPORT_HR_PATTERNS = [
  /\b(report(ed)?|filed|submitted|brought)\b.{0,60}\b(HR|human resources|people ops|people team|EEOC|labor board)\b/i,
  /\b(HR|human resources|people ops)\b.{0,60}\b(report|complaint|filed|submitted|told)\b/i,
  /\b(formal complaint)\b/i,
  /\b(went to HR|talked to HR|called HR|emailed HR)\b/i,
  /\b(HR (rep|representative|generalist|business partner|manager|director))\b/i,
];

const REPORT_OTHER_PATTERNS = [
  /\b(union|union rep|shop steward)\b/i,
  /\b(ombudsman|ombudsperson|ethics hotline|compliance (team|officer|line)|EAP)\b/i,
  /\b(police|law enforcement|detective|officer|filed a report with)\b/i,
  /\b(EEOC|Equal Employment Opportunity|labor board|department of labor)\b/i,
];

const FOLLOWUP_EMAIL_PATTERNS = [
  /\b(per our (conversation|meeting|discussion)|as (we|I) discussed|following (up|our))\b/i,
  /\b(recap|summary|follow.?up|to confirm|to document|for the record)\b/i,
  /\b(this email (is to|serves as|confirms|summarizes))\b/i,
  /\b(wanted to put (this|it) in writing)\b/i,
  /\b(as discussed|as mentioned)\b/i,
  /\b(sent (this |an )?(email|message) to both)\b/i,
  /\b(emailed (both|my boss|HR|my manager))\b/i,
];

const MEETING_PATTERNS = [
  /\b(meeting|call|discussion|conversation|sit.?down)\b.{0,80}\b(about|regarding|concerning|re:)\b.{0,80}\b(incident|complaint|report|harassment|situation|investigation)\b/i,
  /\b(met with|spoke with|had a call with|had a meeting with)\b.{0,60}\b(HR|manager|supervisor|boss|investigator|counsel)\b/i,
  /\b(investigation (meeting|interview|session))\b/i,
  /\b(they (called|invited|scheduled) a meeting)\b/i,
  /\b(a meeting (with|about|on|regarding))\b.{0,80}\b(HR|manager|supervisor|investigation|complaint|incident)\b/i,
  /\b(HR and my manager)\b.{0,40}\b(on|meeting|met|spoke)\b/i,
];

const RETALIATION_PATTERNS = [
  /\b(after (I|my) (report|complaint|told|filed))\b.{0,120}\b(fired|terminated|demoted|written up|PIP|performance improvement|laid off|hours (cut|reduced)|moved|excluded|ostracized|freeze|frozen)\b/i,
  /\b(retaliat(ion|ed|ing))\b/i,
  /\b(adverse (action|employment action))\b/i,
  /\b(since (I|my) (report|complaint))\b/i,
];

const WITNESS_PATTERNS = [
  /\b(witness(ed)?|saw (it|this happen|him|her|them)|was present|overheard)\b/i,
  /\b(statement from|according to|per [A-Z][a-z]+ who)\b/i,
  /\b([A-Z][a-z]+ (told me|confirmed|verified|can attest))\b/i,
];

const RESPONSE_PATTERNS = [
  /\b(HR (said|told|responded|replied|informed|notified))\b/i,
  /\b(my (manager|boss|supervisor) (responded|replied|said|told me))\b/i,
  /\b(I received (a|an) (response|letter|email|notice|decision))\b/i,
  /\b(the (investigation|review) (concluded|found|determined|resulted))\b/i,
  /\b(they (found|determined|concluded|decided))\b/i,
];

const CONDUCT_CONTINUED_PATTERNS = [
  /\b(again|continued|still (doing|happening|occurring)|hasn't stopped|keeps?|kept)\b/i,
  /\b(after (I|my) (report|complaint|told))\b.{0,120}\b(he|she|they)\b.{0,80}\b(again|still|continued|another time|more times)\b/i,
  /\b(nothing (changed|was done|happened)|no change|same behavior|same thing)\b/i,
  /\b(it happened again|happened (a second|another|once more) time)\b/i,
];

const NO_ACTION_PATTERNS = [
  /\b(nothing was done|no action|ignored|dismissed|brushed off|blew (me|it) off)\b/i,
  /\b(they (didn't|did not|never) (do|did|take|investigate|respond|follow up))\b/i,
  /\b(no (response|reply|investigation|follow.?up|outcome|result))\b/i,
  /\b(never heard back|no one got back to me)\b/i,
];

const INCIDENT_TYPE_MAP = {
  sexual_harassment: [
    /\b(sexual(ly)?|sex)\b/i,
    /\b(harass(ment|ed|ing))\b/i,
    /\b(inappropriate (touch|contact|comment|advance))\b/i,
    /\b(unwanted (touch|contact|sexual|advance))\b/i,
  ],
  physical_assault: [
    /\b(hit|struck|pushed|shoved|grabbed|choked|restrained|physical(ly)?)\b/i,
    /\b(assault(ed)?|batter(ed|y)?)\b/i,
  ],
  discrimination: [
    /\b(discriminat(ed|ion|ing))\b/i,
    /\b(because (of|I am|I'm) (my )?(race|gender|sex|age|religion|disability|national origin|color|pregnant|pregnancy))\b/i,
  ],
  hostile_work_environment: [
    /\b(hostile (work )?environment)\b/i,
    /\b(hostile|hostile workplace)\b/i,
  ],
  retaliation: RETALIATION_PATTERNS,
  stalking_or_surveillance: [
    /\b(follow(ed|ing)|stalk(ed|ing)|monitor(ed|ing)|watching me|following me)\b/i,
  ],
  verbal_abuse: [
    /\b(yell(ed|ing)|scream(ed|ing)|berat(ed|ing)|insult(ed|ing)|humiliat(ed|ing)|degrading)\b/i,
  ],
};

const SEVERITY_HIGH = [
  /\b(assault(ed)?|attack(ed)?|raped|rape|groped|grabbed|choked|hit|struck|pushed|shoved|cornered|forced|coerced|blackmail(ed)?|threat(en|ened))\b/i,
  /\b(multiple (times|incidents|occasions))\b/i,
  /\b(ongoing|repeated|pattern|persistent|continued)\b/i,
  /\b(alone|isolated|no one (else )?(was |could )?(there|hear|see))\b/i,
];

const SEVERITY_LOW = [
  /\b(comment(ed)?|said|joked|stared|looked|wink(ed)?|whistled)\b/i,
  /\b(one time|once|single)\b/i,
];

// ---------------------------------------------------------------------------
// Core helpers
// ---------------------------------------------------------------------------

function scorePatterns(text, patterns) {
  let matches = 0;
  for (const p of patterns) {
    if (p.test(text)) matches++;
  }
  return Math.min(matches / Math.max(patterns.length * 0.3, 1), 1.0);
}

function detectIncidentType(text) {
  let bestType = null;
  let bestScore = 0;
  for (const [itype, patterns] of Object.entries(INCIDENT_TYPE_MAP)) {
    const score = scorePatterns(text, patterns);
    if (score > bestScore) {
      bestScore = score;
      bestType = itype;
    }
  }
  return bestScore > 0.1 ? bestType : null;
}

function detectSeverity(text) {
  const high = scorePatterns(text, SEVERITY_HIGH);
  const low = scorePatterns(text, SEVERITY_LOW);
  if (high > 0.2) return 'high';
  if (low > 0.3 && high < 0.1) return 'low';
  return 'medium';
}

function extractReportedTo(text) {
  const patterns = [
    /\breport(ed)?\s+(it\s+|this\s+)?(to\s+)?(my\s+)?(?<role>manager|supervisor|boss|HR|human resources|lead|director|VP|chief|CLO|general counsel|people ops)\b/i,
    /\btold\s+(my\s+)?(?<role>manager|supervisor|boss|HR|human resources|lead|director|[A-Z][a-z]+)\b/i,
    /\bspoke\s+(to|with)\s+(my\s+)?(?<role>manager|supervisor|boss|HR|human resources|lead|director|[A-Z][a-z]+)\b/i,
    /\bfiled\s+.{0,40}(with\s+)?(?<role>HR|human resources|people ops)\b/i,
    /\b(?<role>HR business partner|HR rep|HR generalist|HR manager|HR director)\b/i,
  ];
  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (m && m.groups && m.groups.role) {
      return m.groups.role.trim();
    }
  }
  return null;
}

function extractDateHint(text) {
  const patterns = [
    /\b(\d{1,2}\/\d{1,2}\/\d{2,4})\b/,
    /\b(\d{1,2}-\d{1,2}-\d{2,4})\b/,
    /\b((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:st|nd|rd|th)?,?\s*\d{4})\b/i,
    /\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+\d{1,2},?\s+\d{4})\b/i,
    /\b((?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2})\b/i,
    /\b(yesterday|today|last (?:Monday|Tuesday|Wednesday|Thursday|Friday|week|month))\b/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[0];
  }
  return null;
}

function buildFlags(text, category) {
  const flags = [];

  if (category === 'REPORT_SUPERVISOR' || category === 'REPORT_HR' || category === 'REPORT_OTHER') {
    if (/\b(verbal|orally|in person|face to face|no email|nothing in writing)\b/i.test(text)) {
      flags.push('verbal_report_only');
    }
    if (/\b(weeks?|months?|years?)\s+(later|after|had passed)\b/i.test(text)) {
      flags.push('delayed_reporting');
    }
    if (NO_ACTION_PATTERNS.some(p => p.test(text))) {
      flags.push('no_action_taken');
    }
    if (CONDUCT_CONTINUED_PATTERNS.some(p => p.test(text))) {
      flags.push('conduct_continued_after_report');
    }
  }

  if (category === 'FOLLOWUP_EMAIL') {
    if (/\b(no (reply|response|confirmation|acknowledgement))\b/i.test(text)) {
      flags.push('no_written_confirmation');
    }
  }

  if (category === 'INCIDENT') {
    if (/\b(alone|no witnesses?|no one (else )?(was |could )?(there|see|hear))\b/i.test(text)) {
      flags.push('no_witnesses');
    }
    if (/\b(ongoing|repeated|multiple times|pattern|history)\b/i.test(text)) {
      flags.push('pattern_of_conduct');
    }
  }

  return flags;
}

// ---------------------------------------------------------------------------
// Main categorization
// ---------------------------------------------------------------------------

/**
 * Classify one piece of text into its role within an incident record.
 *
 * @param {string} text - Raw text to classify
 * @param {boolean} isPrimaryIncident - If true, forced to INCIDENT category
 * @returns {Object} CategorizedEntry
 */
function categorize(text, isPrimaryIncident = false) {
  if (isPrimaryIncident) {
    return {
      rawText: text,
      category: 'INCIDENT',
      subcategory: null,
      incidentType: detectIncidentType(text),
      severity: detectSeverity(text),
      reportedTo: null,
      dateHint: extractDateHint(text),
      isPrimaryIncident: true,
      confidence: 1.0,
      flags: buildFlags(text, 'INCIDENT'),
      notes: '',
      noticeSequence: null,
    };
  }

  const scores = {
    INCIDENT:           scorePatterns(text, INCIDENT_PATTERNS),
    REPORT_SUPERVISOR:  scorePatterns(text, REPORT_SUPERVISOR_PATTERNS),
    REPORT_HR:          scorePatterns(text, REPORT_HR_PATTERNS),
    REPORT_OTHER:       scorePatterns(text, REPORT_OTHER_PATTERNS),
    FOLLOWUP_EMAIL:     scorePatterns(text, FOLLOWUP_EMAIL_PATTERNS),
    MEETING:            scorePatterns(text, MEETING_PATTERNS),
    RETALIATION:        scorePatterns(text, RETALIATION_PATTERNS),
    WITNESS_STATEMENT:  scorePatterns(text, WITNESS_PATTERNS),
    RESPONSE_RECEIVED:  scorePatterns(text, RESPONSE_PATTERNS),
  };

  // REPORT categories take priority — "I reported to my manager"
  // must never be classified as INCIDENT even if incident language is present.
  const reportMax = Math.max(scores.REPORT_SUPERVISOR, scores.REPORT_HR, scores.REPORT_OTHER);
  if (reportMax > 0.25) {
    scores.INCIDENT = 0.0;
  } else if (reportMax > 0.10) {
    scores.INCIDENT *= 0.3;
  }

  // FOLLOWUP_EMAIL demotes INCIDENT and MEETING
  if (scores.FOLLOWUP_EMAIL > 0.2) {
    scores.INCIDENT *= 0.3;
    scores.MEETING *= 0.5;
  }

  // MEETING beats FOLLOWUP_EMAIL when meeting-specific language fires
  if (scores.MEETING > scores.FOLLOWUP_EMAIL * 1.5) {
    scores.FOLLOWUP_EMAIL *= 0.5;
  }

  // RETALIATION trumps most categories when it fires strongly
  if (scores.RETALIATION > 0.3) {
    for (const k of Object.keys(scores)) {
      if (k !== 'RETALIATION') scores[k] *= 0.4;
    }
  }

  let bestCategory = 'UNKNOWN';
  let bestScore = 0;
  for (const [cat, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestCategory = cat;
    }
  }

  if (bestScore < 0.05) {
    bestCategory = 'UNKNOWN';
  }

  const confidence = bestScore < 0.05 ? 0 : Math.min(bestScore * 2, 1.0);
  const severity = bestCategory === 'INCIDENT' ? detectSeverity(text) : null;
  const isReport = bestCategory.startsWith('REPORT');

  return {
    rawText: text,
    category: bestCategory,
    subcategory: null,
    incidentType: detectIncidentType(text),
    severity,
    reportedTo: isReport ? extractReportedTo(text) : null,
    dateHint: extractDateHint(text),
    isPrimaryIncident: false,
    confidence: Math.round(confidence * 100) / 100,
    flags: buildFlags(text, bestCategory),
    notes: (bestCategory !== 'INCIDENT' && bestCategory !== 'UNKNOWN')
      ? 'Severity not assigned — this is a reporting/administrative record, not the underlying incident.'
      : '',
    noticeSequence: null,
  };
}

// ---------------------------------------------------------------------------
// NoticeRecord
// ---------------------------------------------------------------------------

/**
 * Tracks every instance a specific recipient was put on legal notice.
 * Drives employer LIABILITY — completely separate from incident severity.
 *
 * Legal doctrine reference:
 *   First notice:       Employer's duty to investigate attaches.
 *   No action taken:    Employer cannot claim ignorance if conduct continues.
 *   Repeated notice:    "Deliberate indifference" standard (Faragher/Ellerth).
 *   Post-notice conduct: May constitute continuing hostile work environment.
 *   Verbal-only notice: Valid but harder to prove without corroboration.
 */
class NoticeRecord {
  constructor(recipient) {
    this.recipient = recipient;
    this.reportsToRecipient = [];
  }

  get noticeCount() {
    return this.reportsToRecipient.length;
  }

  get anyActionTaken() {
    return this.reportsToRecipient.some(r => !r.flags.includes('no_action_taken'));
  }

  get allVerbal() {
    return this.reportsToRecipient.every(r => r.flags.includes('verbal_report_only'));
  }

  get liabilitySignals() {
    const signals = [];
    if (this.noticeCount >= 1 && !this.anyActionTaken) {
      signals.push('notice_without_remedy');
    }
    if (this.noticeCount >= 2 && !this.anyActionTaken) {
      signals.push('repeated_notice_no_action');
    }
    if (this.noticeCount >= 3 && !this.anyActionTaken) {
      signals.push('pattern_of_deliberate_indifference');
    }
    if (this.allVerbal) {
      signals.push('no_written_acknowledgement_of_notice');
    }
    if (this.noticeCount >= 2) {
      signals.push('multiple_reports_to_same_recipient');
    }
    return signals;
  }

  toSummary() {
    return {
      recipient: this.recipient,
      timesNotified: this.noticeCount,
      actionTaken: this.anyActionTaken,
      allVerbalOnly: this.allVerbal,
      liabilitySignals: this.liabilitySignals,
      reports: this.reportsToRecipient.map(r => ({
        date: r.dateHint,
        flags: r.flags,
        noticeSequence: r.noticeSequence,
      })),
    };
  }
}

// ---------------------------------------------------------------------------
// IncidentChain
// ---------------------------------------------------------------------------

/**
 * One underlying incident and all related records.
 *
 * DESIGN PRINCIPLE — two separate tracks:
 *   chainSeverity         → anchored to INCIDENT only. Never inflated by
 *                           number of reports, emails, or meetings.
 *   employerLiability     → computed from NoticeRecords. Tracks how many
 *                           times employer was on notice, whether they acted,
 *                           whether conduct continued.
 */
class IncidentChain {
  constructor() {
    this.incident = null;
    this.reports = [];
    this.followupEmails = [];
    this.meetings = [];
    this.retaliation = [];
    this.witnessStatements = [];
    this.responsesReceived = [];
    this.other = [];
    this.noticeRecords = {};
    this.conductContinuedPostReport = false;
  }

  get chainSeverity() {
    return this.incident?.severity || null;
  }

  get reportCount() {
    return this.reports.length;
  }

  get isDocumented() {
    return this.reports.length > 0 || this.followupEmails.length > 0;
  }

  get employerLiabilitySignals() {
    const signals = new Set();
    for (const nr of Object.values(this.noticeRecords)) {
      for (const s of nr.liabilitySignals) signals.add(s);
    }

    const totalNotices = Object.values(this.noticeRecords)
      .reduce((sum, nr) => sum + nr.noticeCount, 0);

    if (totalNotices >= 2 && this.conductContinuedPostReport) {
      signals.add('conduct_continued_after_notice');
    }
    if (totalNotices >= 3) {
      signals.add('employer_had_multiple_opportunities_to_remedy');
    }
    if (this.retaliation.length > 0) {
      signals.add('potential_retaliation_post_report');
    }
    if (this.conductContinuedPostReport) {
      signals.add('hostile_work_environment_ongoing');
    }
    return [...signals].sort();
  }

  get employerLiabilityLevel() {
    const signals = this.employerLiabilitySignals;
    let score = 0;

    const countSignal = (name) => signals.filter(s => s === name).length;
    score += 2 * countSignal('notice_without_remedy');
    score += 3 * countSignal('repeated_notice_no_action');
    score += 4 * countSignal('pattern_of_deliberate_indifference');
    score += 3 * countSignal('conduct_continued_after_notice');
    score += 3 * countSignal('potential_retaliation_post_report');
    score += 2 * countSignal('hostile_work_environment_ongoing');
    score += signals.length;

    if (score >= 10) return 'critical';
    if (score >= 6) return 'high';
    if (score >= 3) return 'moderate';
    return 'low';
  }

  toSummary() {
    return {
      incidentType: this.incident?.incidentType || null,
      incidentSeverity: this.chainSeverity,
      incidentDate: this.incident?.dateHint || null,
      reports: this.reports.map(r => ({
        category: r.category,
        reportedTo: r.reportedTo,
        date: r.dateHint,
        noticeSequence: r.noticeSequence,
        flags: r.flags,
      })),
      followupEmails: this.followupEmails.length,
      meetings: this.meetings.length,
      witnesses: this.witnessStatements.length,
      responsesReceived: this.responsesReceived.length,
      retaliationEntries: this.retaliation.length,
      documentationStrength: scoreDocumentation(this),
      employerLiability: {
        level: this.employerLiabilityLevel,
        signals: this.employerLiabilitySignals,
        conductContinuedPostReport: this.conductContinuedPostReport,
        noticeByRecipient: Object.fromEntries(
          Object.entries(this.noticeRecords).map(([k, nr]) => [k, nr.toSummary()])
        ),
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Documentation scoring
// ---------------------------------------------------------------------------

function scoreDocumentation(chain) {
  let score = 0;
  if (chain.incident) score += 2;
  score += Math.min(chain.reports.length, 3) * 2;
  score += Math.min(chain.followupEmails.length, 2);
  score += Math.min(chain.meetings.length, 2);
  score += Math.min(chain.responsesReceived.length, 2);
  score += Math.min(chain.witnessStatements.length, 2);

  const verbalReports = chain.reports.filter(r => r.flags.includes('verbal_report_only')).length;
  score -= verbalReports;

  if (score >= 10) return 'strong';
  if (score >= 6) return 'moderate';
  if (score >= 3) return 'limited';
  return 'weak';
}

// ---------------------------------------------------------------------------
// Recipient normalization
// ---------------------------------------------------------------------------

function normalizeRecipient(entry) {
  const cat = entry.category;
  if (cat === 'REPORT_HR') return 'HR';
  if (cat === 'REPORT_SUPERVISOR') {
    const r = (entry.reportedTo || '').toLowerCase();
    if (['hr', 'human resources', 'people ops'].includes(r)) return 'HR';
    return 'supervisor';
  }
  if (cat === 'REPORT_OTHER') {
    const r = (entry.reportedTo || '').toLowerCase();
    if (['union', 'steward'].some(w => r.includes(w))) return 'union';
    if (['eeoc', 'labor', 'department'].some(w => r.includes(w))) return 'EEOC/labor board';
    if (['police', 'law enforcement'].some(w => r.includes(w))) return 'law enforcement';
    return entry.reportedTo || 'other';
  }
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Chain builder
// ---------------------------------------------------------------------------

/**
 * Organize categorized entries into one IncidentChain.
 * Populates NoticeRecords, notice_sequence numbers, and
 * conductContinuedPostReport flag.
 *
 * @param {Array} entries - Array of categorized entry objects
 * @returns {IncidentChain}
 */
function buildChain(entries) {
  const chain = new IncidentChain();

  for (const entry of entries) {
    const cat = entry.category;
    if (cat === 'INCIDENT' && entry.isPrimaryIncident) {
      chain.incident = entry;
    } else if (cat === 'INCIDENT' && !chain.incident) {
      chain.incident = entry;
    } else if (cat === 'REPORT_SUPERVISOR' || cat === 'REPORT_HR' || cat === 'REPORT_OTHER') {
      chain.reports.push(entry);
    } else if (cat === 'FOLLOWUP_EMAIL') {
      chain.followupEmails.push(entry);
    } else if (cat === 'MEETING') {
      chain.meetings.push(entry);
    } else if (cat === 'RETALIATION') {
      chain.retaliation.push(entry);
    } else if (cat === 'WITNESS_STATEMENT') {
      chain.witnessStatements.push(entry);
    } else if (cat === 'RESPONSE_RECEIVED') {
      chain.responsesReceived.push(entry);
    } else {
      chain.other.push(entry);
    }
  }

  // Build NoticeRecords and assign per-recipient sequence numbers
  const recipientCounters = {};
  for (const report of chain.reports) {
    const recipient = normalizeRecipient(report);
    recipientCounters[recipient] = (recipientCounters[recipient] || 0) + 1;
    report.noticeSequence = recipientCounters[recipient];

    if (!chain.noticeRecords[recipient]) {
      chain.noticeRecords[recipient] = new NoticeRecord(recipient);
    }
    chain.noticeRecords[recipient].reportsToRecipient.push(report);
  }

  // Detect if conduct continued after any report was made
  const allFollowupText = [
    ...chain.reports,
    ...chain.followupEmails,
    ...chain.meetings,
  ].map(e => e.rawText).join(' ');

  chain.conductContinuedPostReport = CONDUCT_CONTINUED_PATTERNS.some(p => p.test(allFollowupText));

  return chain;
}

// ---------------------------------------------------------------------------
// Batch categorization helper
// ---------------------------------------------------------------------------

/**
 * Categorize multiple text entries and build an incident chain.
 *
 * @param {Array} entries - Array of { text, isPrimary } objects
 * @returns {{ categorized: Array, chain: IncidentChain, summary: Object }}
 */
function categorizeAndBuildChain(entries) {
  const categorized = entries.map(e => categorize(e.text, e.isPrimary || false));
  const chain = buildChain(categorized);
  return {
    categorized,
    chain,
    summary: chain.toSummary(),
  };
}

module.exports = {
  categorize,
  buildChain,
  categorizeAndBuildChain,
  IncidentChain,
  NoticeRecord,
};
