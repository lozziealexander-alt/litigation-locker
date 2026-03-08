/**
 * assessor.js — Litigation Locker Universal Document Assessor
 *
 * Accepts ANY employer-issued document and assesses it against:
 *   1. Incident records in the vault
 *   2. Uploaded context documents (policies, agreements, handbooks)
 *   3. EEOC federal standards + Florida FCRA
 *   4. Internal consistency of the document itself
 *   5. Timing relative to protected activity
 *
 * Port of assessor.py to Node.js for Electron main process.
 */

const crypto = require('crypto');
const https = require('https');
const contextStore = require('./context-store');

// ── Document input types ────────────────────────────────────────────────────

const DOCUMENT_INPUT_TYPES = {
  pip:                  'Performance Improvement Plan (PIP)',
  termination_letter:   'Termination / Separation Letter',
  writeup:              'Written Warning / Disciplinary Notice',
  hr_communication:     'HR Email or Communication',
  demotion_notice:      'Demotion or Role Change Notice',
  performance_review:   'Performance Review',
  separation_agreement: 'Separation / Severance Agreement',
  free_text:            'Free-Text Note / Paste',
  unknown:              'Unknown \u2014 auto-detect',
};

// ── Type detection ──────────────────────────────────────────────────────────

const TYPE_DETECTION_PATTERNS = {
  pip: [
    /\b(performance improvement plan|PIP)\b/i,
    /\b(30|60|90).day (plan|review|improvement|period)\b/i,
  ],
  termination_letter: [
    /\b(terminat(?:e|ed|ion)|separat(?:e|ed|ion)|discharg(?:e|ed)|laid off|layoff)\b/i,
    /\b(last day of (employment|work))\b/i,
  ],
  writeup: [
    /\b(written warning|formal warning|disciplinary (notice|action|warning))\b/i,
    /\b(write.up|write up)\b/i,
  ],
  hr_communication: [
    /\b(human resources|HR)\b.{0,40}\b(writing to|want to|following up|reaching out)\b/i,
  ],
  performance_review: [
    /\b(performance (review|evaluation|appraisal|assessment|rating))\b/i,
    /\b(annual|mid.year|quarterly).{0,40}\b(review|evaluation|check.in)\b/i,
  ],
  separation_agreement: [
    /\b(separation agreement|severance agreement|general release)\b/i,
    /\b(release (of|all) claims)\b/i,
  ],
};

function detectDocumentType(text) {
  for (const [docType, patterns] of Object.entries(TYPE_DETECTION_PATTERNS)) {
    if (patterns.some(p => p.test(text))) return docType;
  }
  return 'unknown';
}

// ── Pattern flag definitions ────────────────────────────────────────────────

const FLAG_DEFINITIONS = {
  vague_performance_claims: {
    flag_id: 'vague_claims',
    category: 'procedural_defect',
    severity: 'medium',
    title: 'Vague or subjective performance claims',
    explanation:
      "Contains vague, subjective language ('attitude', 'culture fit', 'not a team player') " +
      'without measurable criteria. Courts require specific, documented, measurable deficiencies. ' +
      'Vague claims are harder to defend and easier to challenge as pretextual.',
    eeoc_standard: 'mcdonnell_douglas',
  },
  timing_suspicious: {
    flag_id: 'suspicious_timing',
    category: 'retaliation_risk',
    severity: 'high',
    title: 'Document issued suspiciously close to protected activity',
    explanation:
      'Language suggests issuance shortly after a complaint, report, leave request, or other ' +
      'protected activity. Under Burlington Northern v. White, any action that would deter a ' +
      'reasonable employee from engaging in protected activity constitutes actionable retaliation ' +
      '\u2014 even a PIP that doesn\'t result in termination.',
    eeoc_standard: 'burlington_northern',
  },
  contradicts_prior_positive_feedback: {
    flag_id: 'positive_contradiction',
    category: 'procedural_defect',
    severity: 'high',
    title: 'Contradicts prior positive performance feedback',
    explanation:
      'References previously positive performance, then abruptly reverses. Sudden negative ' +
      'reviews after a period of positive feedback \u2014 especially following protected activity \u2014 ' +
      'are a recognized indicator of pretext under the McDonnell Douglas framework.',
    eeoc_standard: 'mcdonnell_douglas',
  },
  no_specific_examples: {
    flag_id: 'no_examples',
    category: 'procedural_defect',
    severity: 'medium',
    title: 'No specific examples or dates',
    explanation:
      'Performance claims stated in general terms without specific incidents or dates. ' +
      'A legally defensible disciplinary document should cite specific events with dates. ' +
      'Generalized claims are more easily challenged as pretextual.',
    eeoc_standard: null,
  },
  unreasonable_timeline: {
    flag_id: 'unreasonable_timeline',
    category: 'procedural_defect',
    severity: 'medium',
    title: 'Unreasonably short improvement timeline',
    explanation:
      'The timeline for required improvement is very short (days or a single week). ' +
      'An unreasonably short improvement period suggests the document is designed to fail ' +
      'rather than achieve genuine improvement \u2014 a factor courts weigh in pretext analysis.',
    eeoc_standard: 'mcdonnell_douglas',
  },
  selective_enforcement: {
    flag_id: 'selective_enforcement',
    category: 'retaliation_risk',
    severity: 'high',
    title: 'Potential selective enforcement',
    explanation:
      'Language suggests standards applied to this employee that are not applied to others ' +
      'in comparable positions. Selective enforcement is a core element of disparate ' +
      'treatment discrimination under Title VII.',
    eeoc_standard: 'title_vii',
  },
};

// ── Main assessor ───────────────────────────────────────────────────────────

class DocumentAssessor {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }

  async assess({ inputText, docType, vaultIncidents, caseDb }) {
    const assessmentId = crypto.createHash('sha256')
      .update(inputText + new Date().toISOString())
      .digest('hex').slice(0, 12);

    const resolvedType = (docType && docType !== 'unknown')
      ? docType
      : detectDocumentType(inputText);

    const result = {
      assessment_id: assessmentId,
      doc_type: resolvedType,
      doc_type_label: DOCUMENT_INPUT_TYPES[resolvedType] || 'Unknown Document',
      assessed_at: new Date().toISOString(),
      input_text: inputText,
      auto_flags: [],
      claims_vs_evidence: [],
      overall_risk: 'unknown',
      overall_summary: '',
      deep_analysis: null,
    };

    // Pass 1: instant pattern-based flags
    result.auto_flags = this._runPatternFlags(inputText, resolvedType, vaultIncidents, caseDb);

    // Pass 2: claims vs evidence (AI-assisted, falls back to patterns)
    result.claims_vs_evidence = await this._buildClaimsTable(
      inputText, resolvedType, vaultIncidents, caseDb
    );

    // Pass 3: AI analysis for summary + additional flags
    if (this.apiKey) {
      try {
        const aiResult = await this._runAiAnalysis(inputText, resolvedType, vaultIncidents, caseDb, result);
        result.overall_summary = aiResult.summary || '';
        result.overall_risk = aiResult.risk_level || 'unknown';
        for (const af of (aiResult.additional_flags || [])) {
          result.auto_flags.push({
            flag_id: `ai_${result.auto_flags.length}`,
            category: af.category || 'eeoc_trigger',
            severity: af.severity || 'medium',
            title: af.title || '',
            explanation: af.explanation || '',
            supporting_evidence: af.evidence || [],
            eeoc_standard: af.eeoc_standard || null,
          });
        }
      } catch (err) {
        result.overall_summary = 'Assessment complete (AI pass unavailable). Review flagged items above.';
        result.overall_risk = result.auto_flags.some(f => f.severity === 'high') ? 'high' : 'moderate';
      }
    } else {
      result.overall_summary = 'Pattern-based assessment complete. Add an API key for AI-enhanced analysis.';
      result.overall_risk = result.auto_flags.some(f => f.severity === 'high') ? 'high' : 'moderate';
    }

    // Sort flags by severity
    const sevOrder = { high: 0, medium: 1, low: 2 };
    result.auto_flags.sort((a, b) => (sevOrder[a.severity] || 3) - (sevOrder[b.severity] || 3));

    return result;
  }

  async expandFlag(flag, { inputText, vaultIncidents, caseDb }) {
    const context = this._buildContextBlock(vaultIncidents, caseDb);
    let stdText = '';
    if (flag.eeoc_standard && contextStore.EEOC_STANDARDS[flag.eeoc_standard]) {
      const std = contextStore.EEOC_STANDARDS[flag.eeoc_standard];
      stdText = `Relevant standard: ${std.name} \u2014 ${std.scope}`;
    }

    const prompt = `You are an employment law analyst. Provide deep analysis of this specific legal flag.

FLAGGED ISSUE: ${flag.title}
Category: ${flag.category}
Current explanation: ${flag.explanation}
${stdText}

DOCUMENT:
${inputText.slice(0, 4000)}

${context}

Cover:
1. Why this is legally significant and what the employer must show to defend it
2. What evidence the employee should gather or preserve right now
3. Relevant case law (Burlington Northern, Faragher/Ellerth, McDonnell Douglas as applicable)
4. Florida-specific considerations under the FCRA

Be precise. Use legal terminology but explain it plainly. No padding.`;

    return this._callClaude(prompt, 1500);
  }

  async requestDeepAnalysis(result, { inputText, vaultIncidents, caseDb }) {
    const context = this._buildContextBlock(vaultIncidents, caseDb);
    const flagsText = result.auto_flags
      .map(f => `- [${f.severity.toUpperCase()}] ${f.title}: ${f.explanation.slice(0, 100)}`)
      .join('\n');
    const claimsText = result.claims_vs_evidence
      .map(c => {
        let line = `- [${c.verdict}] '${c.claim_text.slice(0, 100)}'`;
        if (c.evidence_against?.length) line += ` \u2014 contradicted by: ${c.evidence_against.slice(0, 2).join('; ')}`;
        return line;
      })
      .join('\n');

    const prompt = `You are a senior employment law analyst preparing a legal memo for an employee facing an adverse employment action.

DOCUMENT TYPE: ${result.doc_type_label}

DOCUMENT:
${inputText.slice(0, 5000)}

${context}

DETECTED FLAGS:
${flagsText || 'None'}

CLAIM ANALYSIS:
${claimsText || 'None'}

Write a structured legal memo with these sections:

1. DOCUMENT VALIDITY ASSESSMENT
   Does this document meet procedural requirements under company policy?
   Does it contain the specificity required by law?
   Internal contradictions?

2. RETALIATION / DISCRIMINATION ANALYSIS
   Timing relative to protected activity
   McDonnell Douglas framework \u2014 prima facie case elements present?
   Burlington Northern materiality
   Faragher/Ellerth implications if applicable

3. FEDERAL EEOC EXPOSURE
   Title VII implications
   Prima facie case elements present or absent
   Employer's likely defense and its weaknesses

4. FLORIDA STATE LAW (FCRA)
   FCHR vs EEOC filing strategy
   300-day federal / 365-day state windows
   Florida-specific protections

5. RECOMMENDED IMMEDIATE ACTIONS
   Evidence to preserve right now
   Documents to request (personnel file, disciplinary records, comparator data)
   Timeline considerations
   What this document does and does not establish legally

Be direct. Flag weaknesses in the employee's position as well as strengths.
This memo will be used to prepare for an attorney meeting.`;

    return this._callClaude(prompt, 3000);
  }

  // ── Pattern-based flagging ──────────────────────────────────────────────

  _runPatternFlags(text, docType, vaultIncidents, caseDb) {
    const flags = [];

    // Red flag patterns in the document itself
    for (const [flagKey, patterns] of Object.entries(contextStore.PIP_RED_FLAG_PATTERNS)) {
      if (patterns.some(p => p.test(text))) {
        const def = FLAG_DEFINITIONS[flagKey];
        if (def) {
          flags.push({ ...def, supporting_evidence: [] });
        }
      }
    }

    // Timing: vault contains protected activity
    const timingFlag = this._checkTiming(vaultIncidents);
    if (timingFlag) flags.push(timingFlag);

    // Policy compliance against context docs
    if (caseDb) {
      flags.push(...this._checkPolicyCompliance(text, docType, caseDb));
    }

    // Vault contradiction check
    flags.push(...this._checkVaultContradictions(vaultIncidents));

    // EEOC / state triggers
    flags.push(...this._checkEeocTriggers(vaultIncidents, caseDb));

    return flags;
  }

  _checkTiming(vaultIncidents) {
    for (const incident of (vaultIncidents || [])) {
      const signals = incident.employer_liability?.signals || [];
      if (signals.includes('potential_retaliation_post_report')) {
        return {
          flag_id: 'timing_vault_match',
          category: 'retaliation_risk',
          severity: 'high',
          title: 'Vault contains protected activity preceding this document',
          explanation:
            'Your incident vault contains reports of harassment/discrimination that constitute ' +
            'protected activity. If this document was issued after those reports, the timing ' +
            'creates a strong inference of retaliation under Burlington Northern.',
          supporting_evidence: ['Protected activity documented in vault'],
          eeoc_standard: 'burlington_northern',
        };
      }
    }
    return null;
  }

  _checkPolicyCompliance(text, docType, caseDb) {
    const flags = [];

    if (docType === 'pip' || docType === 'writeup') {
      if (contextStore.hasSignal(caseDb, 'pip_requires_prior_warning')) {
        const hasPrior = /\b(prior warning|previous warning|verbal warning|step one|first step)\b/i.test(text);
        if (!hasPrior) {
          const source = contextStore.getSignalSource(caseDb, 'pip_requires_prior_warning');
          flags.push({
            flag_id: 'no_prior_warning',
            category: 'policy_violation',
            severity: 'high',
            title: 'Issued without required prior warning \u2014 violates company policy',
            explanation:
              `Your uploaded policy ('${source?.display_name || 'company policy'}') ` +
              'requires a prior verbal or written warning before a PIP can be issued. ' +
              'This document does not reference any prior warning. Skipping progressive ' +
              'discipline steps is a procedural defect and supports a pretext argument.',
            supporting_evidence: [source ? `Source: ${source.display_name}` : 'uploaded policy'],
            eeoc_standard: 'mcdonnell_douglas',
          });
        }
      }

      if (contextStore.hasSignal(caseDb, 'pip_requires_specific_metrics')) {
        const hasMetrics = /\b(\d+%|\d+ (units|calls|tickets|sales)|measurable|specific goal|target of|achieve \d)\b/i.test(text);
        if (!hasMetrics) {
          const source = contextStore.getSignalSource(caseDb, 'pip_requires_specific_metrics');
          flags.push({
            flag_id: 'no_measurable_goals',
            category: 'policy_violation',
            severity: 'medium',
            title: 'No measurable goals \u2014 required by company policy',
            explanation:
              `'${source?.display_name || 'Your policy'}' requires PIPs to ` +
              'contain specific, measurable goals. This document does not contain numeric ' +
              'targets or objective benchmarks.',
            supporting_evidence: [],
            eeoc_standard: null,
          });
        }
      }

      if (contextStore.hasSignal(caseDb, 'pip_employee_has_right_to_respond')) {
        const hasAppeal = /\b(right to (respond|appeal|contest|dispute|rebut)|may (respond|appeal|contest))\b/i.test(text);
        if (!hasAppeal) {
          const source = contextStore.getSignalSource(caseDb, 'pip_employee_has_right_to_respond');
          flags.push({
            flag_id: 'no_right_to_respond',
            category: 'policy_violation',
            severity: 'medium',
            title: 'Does not include employee\'s right to respond or appeal',
            explanation:
              `'${source?.display_name || 'Your policy'}' establishes a right to ` +
              'respond to or appeal disciplinary actions. This document omits that. ' +
              'Omitting procedural rights supports a claim that the process was not in good faith.',
            supporting_evidence: [],
            eeoc_standard: null,
          });
        }
      }
    }

    if (docType === 'separation_agreement') {
      if (contextStore.hasSignal(caseDb, 'arbitration_required')) {
        flags.push({
          flag_id: 'arbitration_waiver',
          category: 'eeoc_trigger',
          severity: 'high',
          title: 'Contains arbitration clause \u2014 do not sign without attorney review',
          explanation:
            'Your underlying employment agreement contains mandatory arbitration. If this ' +
            'separation agreement also requires arbitration, you may be waiving your right ' +
            'to a jury trial. Note: EEOC charges cannot be waived by private agreement \u2014 ' +
            'you can always file. Do not sign any separation agreement without attorney review.',
          supporting_evidence: [],
          eeoc_standard: 'title_vii',
        });
      }
    }

    return flags;
  }

  _checkVaultContradictions(vaultIncidents) {
    for (const incident of (vaultIncidents || [])) {
      const signals = incident.employer_liability?.signals || [];
      if (signals.includes('potential_retaliation_post_report')) {
        return [{
          flag_id: 'vault_retaliation_pattern',
          category: 'retaliation_risk',
          severity: 'high',
          title: 'Vault shows retaliation pattern \u2014 this document may be part of it',
          explanation:
            'Your evidence vault contains records categorized as potential retaliation. ' +
            'This document may extend that pattern. The combination of vault records and ' +
            'this document could demonstrate a continuing sequence of adverse employment actions.',
          supporting_evidence: signals,
          eeoc_standard: 'burlington_northern',
        }];
      }
    }
    return [];
  }

  _checkEeocTriggers(vaultIncidents, caseDb) {
    const flags = [];
    const hasHarassment = (vaultIncidents || []).some(i =>
      ['sexual_harassment', 'discrimination', 'hostile_work_environment'].includes(i.incident_type)
    );

    if (hasHarassment) {
      flags.push({
        flag_id: 'fl_fcra_clock',
        category: 'fl_state',
        severity: 'high',
        title: 'Florida EEOC/FCRA filing windows are running',
        explanation:
          'Your vault contains harassment or discrimination incidents. In Florida: ' +
          '300 days from the most recent act to file with EEOC (federal), ' +
          '365 days to file with FCHR (Florida state). ' +
          'If this document is an adverse action following those incidents, it may extend the clock. ' +
          'Confirm your exact deadline with an employment attorney now.',
        supporting_evidence: [],
        eeoc_standard: 'florida_fcra',
      });
    }

    const harasserInChain = (vaultIncidents || []).some(i => i.harasser_in_reporting_chain);
    if (harasserInChain) {
      flags.push({
        flag_id: 'faragher_ellerth_weakened',
        category: 'eeoc_trigger',
        severity: 'high',
        title: 'Faragher/Ellerth defense weakened \u2014 harasser was in reporting chain',
        explanation:
          'Your vault shows the harasser was your supervisor or in your reporting chain. ' +
          'The employer\'s standard affirmative defense requires that you had a reasonable ' +
          'path to report and failed to use it. If the people you\'d report to were the ' +
          'problem, that defense fails \u2014 and so does any argument that this adverse action ' +
          'was unrelated to your protected activity.',
        supporting_evidence: [],
        eeoc_standard: 'faragher_ellerth',
      });
    }

    return flags;
  }

  // ── Claims vs evidence ──────────────────────────────────────────────────

  async _buildClaimsTable(text, docType, vaultIncidents, caseDb) {
    if (this.apiKey) {
      try {
        return await this._extractClaimsAi(text, docType, vaultIncidents, caseDb);
      } catch (err) {
        // fall through to pattern-based
      }
    }
    return this._extractClaimsPatterns(text, vaultIncidents, caseDb);
  }

  async _extractClaimsAi(text, docType, vaultIncidents, caseDb) {
    const context = this._buildContextBlock(vaultIncidents, caseDb);
    const prompt = `You are an employment law analyst. Extract the key claims from this employer document and assess each against the employee's evidence.

DOCUMENT TYPE: ${DOCUMENT_INPUT_TYPES[docType] || 'Unknown'}

DOCUMENT:
${text.slice(0, 4000)}

EMPLOYEE'S EVIDENCE:
${context.slice(0, 3000)}

Extract 3-8 legally significant claims. For each, assess whether evidence supports or contradicts it.

Respond ONLY with a JSON array. No preamble, no markdown backticks:
[
  {
    "claim_text": "Employee consistently failed to meet project deadlines",
    "claim_type": "performance",
    "evidence_for": ["No contradicting records found"],
    "evidence_against": ["No prior written warnings documented", "Vault shows positive feedback prior to complaint"],
    "verdict": "contradicted",
    "legal_note": "Sudden performance issues after complaint filing \u2014 pretext indicator under McDonnell Douglas"
  }
]

Verdict options: supported | contradicted | unverifiable | suspicious
Claim types: performance | conduct | timing | procedure | factual | legal
Keep each field concise. Max 3 items in evidence arrays.`;

    const raw = await this._callClaude(prompt, 2000);
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const items = JSON.parse(cleaned);
    return items
      .filter(i => i.claim_text)
      .map(i => ({
        claim_text: i.claim_text,
        claim_type: i.claim_type || 'unknown',
        evidence_for: i.evidence_for || [],
        evidence_against: i.evidence_against || [],
        verdict: i.verdict || 'unverifiable',
        legal_note: i.legal_note || null,
      }));
  }

  _extractClaimsPatterns(text, vaultIncidents, caseDb) {
    const claims = [];
    // Split on sentence endings, newlines, bullet points, numbered lists
    const sentences = text
      .split(/(?<=[.!?])\s+|\n+|(?=\s*[-•●◦▪]\s)|(?=\s*\d+[.)]\s)/)
      .map(s => s.replace(/^[\s\-•●◦▪\d.)]+/, '').trim())
      .filter(s => s.length > 10);
    console.log(`[Assessor] Claims extraction: ${sentences.length} segments from ${text.length} chars`);

    const claimCategories = [
      // Performance claims — broad: anything saying the employee did poorly
      { type: 'performance', patterns: [
        /\b(fail(ed|s|ing|ure)?( to)?)\b/i,
        /\b(did not|has not|have not|was not|were not|cannot|could not)\b/i,
        /\b(unable to|lack(s|ed|ing)?|deficien(t|cy))\b/i,
        /\b(below|poor|inadequate|unacceptable|unsatisfactory|substandard|subpar)\b/i,
        /\b(need(s)? (to )?improv|must improv|requires? improvement|area.{0,10}improvement)\b/i,
        /\b(not meet(ing)?|not complet(ed|ing)|not submit|not attend|not follow)\b/i,
        /\b(miss(ed|ing))\b.{0,40}\b(deadline|meeting|target|goal|assignment|task|report)\b/i,
        /\b(late|tardy|absent|attendance)\b/i,
        /\b(error|mistake|oversight|careless|negligent)\b/i,
        /\b(underperform|low quality|not up to|fell short|not satisf)\b/i,
        /\b(expectation|standard|benchmark|goal|objective|target)\b.{0,40}\b(not|fail|miss|below|short)\b/i,
        /\b(not (met|achieved|reached|demonstrated|shown|displayed|exhibited))\b/i,
        /\b(inconsisten(t|cy|tly)|unreliab(le|ility))\b/i,
        /\b(complained?|concern|issue|problem)\b.{0,40}\b(about|with|regarding)\b.{0,40}\b(your|employee|performance|work|quality)\b/i,
      ]},
      // Conduct / disciplinary claims
      { type: 'conduct', patterns: [
        /\b(violat(ed|ion|ing)|breach(ed|ing)?|insubordinat(e|ion))\b/i,
        /\b(unprofessional|inappropriate|disruptive|hostile|threatening|disrespect)\b/i,
        /\b(policy|code of conduct|workplace (policy|rules|standard))\b/i,
        /\b(warn(ed|ing)|written warning|verbal warning|final warning|first warning)\b/i,
        /\b(disciplin(e|ary)|corrective action|suspension|probation)\b/i,
        /\b(refus(ed|al|ing)|unwilling|uncooperative|combative|argumentative)\b/i,
        /\b(complaint(s)? (from|by|about)|reported (by|that)|concern.{0,20}raised)\b/i,
        /\b(behavior|conduct|attitude|demeanor|disposition)\b/i,
      ]},
      // Timing / procedural claims
      { type: 'timing', patterns: [
        /\b(effective (immediately|as of|on|upon))\b/i,
        /\b(terminat(ed|ion|ing)|separat(ed|ion)|discharg(ed|e)|laid off|let go|dismissed)\b/i,
        /\b(last day|final day|end of employment|no longer employed|position.{0,20}eliminat)\b/i,
        /\b(improvement (plan|period)|PIP|performance (review|plan) period)\b/i,
        /\b(\d+ (days?|weeks?|business days?) (to|for))\b/i,
        /\b(by (January|February|March|April|May|June|July|August|September|October|November|December|\d{1,2}[/.-]\d{1,2}))\b/i,
        /\b(must (correct|improve|demonstrate|show|resolve))\b.{0,40}\b(by|within|before)\b/i,
        /\b(final (opportunity|chance|review)|last chance)\b/i,
      ]},
      // Factual claims — specific allegations with dates, witnesses, events
      { type: 'factual', patterns: [
        /\b(on|during|at)\b.{0,10}\b(January|February|March|April|May|June|July|August|September|October|November|December|\d{1,2}[/.-]\d{1,2})/i,
        /\b(witness(ed|es)?|observed|saw|noted|documented|reported)\b/i,
        /\b(investigation|review|inquiry|audit)\b.{0,30}\b(found|reveal|conclud|determin|show|indicat)\b/i,
        /\b(according to|as documented|records (show|indicate)|evidence (show|suggest|indicat))\b/i,
        /\b(specific(ally)?|instance|occasion|incident|example|occurrence)\b/i,
        /\b(you (said|stated|told|sent|wrote|did|were seen|were observed|were heard))\b/i,
        /\b(email|meeting|conversation|call|interaction)\b.{0,30}\b(on|dated|from|of)\b/i,
      ]},
      // Legal / rights claims
      { type: 'legal', patterns: [
        /\b(at.will|at will|right to terminate|employment is at)\b/i,
        /\b(waiv(e|er|ing)|release|relinquish|forfeit|give up)\b.{0,40}\b(right|claim|action|suit)\b/i,
        /\b(non.?compete|non.?disclosure|confidentiality|arbitration|mediation)\b/i,
        /\b(severance|separation (agreement|package)|release agreement)\b/i,
        /\b(you (agree|acknowledge|understand|accept|certify|affirm|confirm) (that|to))\b/i,
        /\b(sign(ed|ing)?|execut(e|ed|ing))\b.{0,30}\b(agreement|document|release|waiver|acknowledgment)\b/i,
        /\b(forfeit|surrender|waive)\b/i,
        /\b(binding|irrevocable|final and binding)\b/i,
      ]},
    ];

    // Build vault evidence lookup for cross-referencing
    const vaultEvidence = this._buildVaultEvidence(vaultIncidents, caseDb);

    for (const sentence of sentences.slice(0, 100)) {
      const trimmed = sentence.trim();
      if (trimmed.length < 10) continue;

      for (const category of claimCategories) {
        if (category.patterns.some(p => p.test(trimmed))) {
          const isDuplicate = claims.some(c =>
            c.claim_text.slice(0, 30) === trimmed.slice(0, 30)
          );
          if (!isDuplicate) {
            const claimText = trimmed.length > 300 ? trimmed.slice(0, 300) + '...' : trimmed;
            const xref = this._crossReferenceClaim(claimText, category.type, vaultEvidence);
            claims.push({
              claim_text: claimText,
              claim_type: category.type,
              evidence_for: xref.evidence_for,
              evidence_against: xref.evidence_against,
              verdict: xref.verdict,
              legal_note: xref.legal_note,
            });
            console.log(`[Assessor] Claim found [${category.type}]: "${claimText.slice(0, 60)}..." → ${xref.verdict}`);
          }
          break;
        }
      }
      if (claims.length >= 15) break;
    }
    console.log(`[Assessor] Total claims extracted: ${claims.length}`);
    return claims;
  }

  /**
   * Build a structured evidence summary from vault data for cross-referencing.
   */
  _buildVaultEvidence(vaultIncidents, caseDb) {
    const evidence = {
      incidents: [],
      contextDocs: [],
      hasReporting: false,
      hasPositiveFeedback: false,
      hasRetaliation: false,
      hasHarassment: false,
      hasDiscrimination: false,
      hasPIP: false,
      hasTermination: false,
      reportingTimeline: null,
    };

    if (vaultIncidents && vaultIncidents.length > 0) {
      for (const inc of vaultIncidents) {
        const type = inc.incident_type || '';
        const reports = inc.reports || [];
        evidence.incidents.push({
          type,
          severity: inc.incident_severity || inc.base_severity || 'unknown',
          reportCount: reports.length,
          dates: reports.map(r => r.date_occurred).filter(Boolean),
          summaries: reports.map(r => (r.what_happened || '').slice(0, 100)).filter(Boolean),
        });

        if (/report|complaint|filed|HR/i.test(type)) evidence.hasReporting = true;
        if (/retaliat/i.test(type)) evidence.hasRetaliation = true;
        if (/harass/i.test(type)) evidence.hasHarassment = true;
        if (/discriminat/i.test(type)) evidence.hasDiscrimination = true;
        if (/pip|improvement/i.test(type)) evidence.hasPIP = true;
        if (/terminat|fired|discharg/i.test(type)) evidence.hasTermination = true;

        for (const r of reports) {
          const txt = (r.what_happened || '') + ' ' + (r.notes || '');
          if (/positive|good|excellent|strong|commend|praise|exceed/i.test(txt)) {
            evidence.hasPositiveFeedback = true;
          }
          if (/report(ed)?|complain(ed|t)|filed|HR|eeoc|eeo/i.test(txt)) {
            evidence.hasReporting = true;
            if (!evidence.reportingTimeline && r.date_occurred) {
              evidence.reportingTimeline = r.date_occurred;
            }
          }
        }
      }
    }

    if (caseDb) {
      try {
        const docs = contextStore.getActiveContextDocuments(caseDb);
        for (const doc of docs) {
          const docText = (doc.text || '').toLowerCase();
          evidence.contextDocs.push({
            name: doc.display_name,
            type: doc.doc_type,
            hasPositive: /positive|excellent|good|strong|exceeds|commend/i.test(docText),
            hasPIP: /pip|improvement plan|performance plan/i.test(docText),
            hasPolicy: /policy|handbook|procedure|guideline/i.test(docText),
          });
          if (/positive|excellent|good|strong|exceeds|commend/i.test(docText)) {
            evidence.hasPositiveFeedback = true;
          }
        }
      } catch (e) {
        // no context docs
      }
    }

    return evidence;
  }

  /**
   * Cross-reference a single claim against vault evidence (pattern-based).
   * Returns { evidence_for, evidence_against, verdict, legal_note }
   */
  _crossReferenceClaim(claimText, claimType, vault) {
    const ef = []; // evidence for the employer's claim
    const ea = []; // evidence against the employer's claim (supporting employee)
    let verdict = 'unverifiable';
    let legalNote = null;
    const lower = claimText.toLowerCase();

    // Performance claims
    if (claimType === 'performance') {
      if (vault.hasPositiveFeedback) {
        ea.push('Vault contains prior positive feedback/reviews');
        verdict = 'suspicious';
      }
      if (vault.hasReporting) {
        ea.push('Performance issues raised after protected activity — possible pretext');
        verdict = 'suspicious';
        legalNote = 'Temporal proximity to complaint may indicate pretext (McDonnell Douglas)';
      }
      if (vault.hasPIP) {
        ef.push('PIP documented in vault');
      }
      const noWarnings = !vault.incidents.some(i => /warning|disciplin/i.test(i.type));
      if (noWarnings) {
        ea.push('No prior warnings found in vault');
      }
    }

    // Conduct claims
    if (claimType === 'conduct') {
      if (vault.hasReporting) {
        ea.push('Conduct issues raised after employee filed complaint');
        verdict = 'suspicious';
        legalNote = 'Retaliatory discipline after protected activity — EEOC scrutiny likely';
      }
      if (vault.hasPositiveFeedback) {
        ea.push('Prior record shows no conduct concerns');
        verdict = verdict === 'suspicious' ? 'contradicted' : 'suspicious';
      }
      if (vault.hasHarassment) {
        ea.push('Vault documents harassment by management');
      }
    }

    // Timing claims
    if (claimType === 'timing') {
      if (vault.hasReporting && vault.reportingTimeline) {
        ea.push(`Protected activity documented (${vault.reportingTimeline})`);
        verdict = 'suspicious';
        legalNote = 'Close timing between complaint and adverse action is a key retaliation indicator';
      }
      if (/immediately|within \d+ day/i.test(lower)) {
        ea.push('Rushed timeline may indicate predetermined outcome');
      }
      if (vault.hasTermination) {
        ef.push('Termination event documented in vault');
      }
    }

    // Factual claims
    if (claimType === 'factual') {
      const relatedIncidents = vault.incidents.filter(i =>
        i.summaries.some(s => {
          // Check for keyword overlap
          const words = lower.split(/\s+/).filter(w => w.length > 4);
          return words.some(w => s.toLowerCase().includes(w));
        })
      );
      if (relatedIncidents.length > 0) {
        ea.push(`${relatedIncidents.length} vault incident(s) may contradict this claim`);
        verdict = 'suspicious';
      }
      if (/witness|observed/i.test(lower) && vault.hasHarassment) {
        ea.push('Vault documents harassment — employer witnesses may be biased');
      }
    }

    // Legal claims
    if (claimType === 'legal') {
      if (/waiv|release|relinquish/i.test(lower)) {
        ea.push('Waiver requests after complaint may be coercive');
        legalNote = 'Waivers signed under duress or without consideration may be unenforceable';
        verdict = 'suspicious';
      }
      if (/at.will/i.test(lower) && vault.hasReporting) {
        ea.push('At-will does not protect against retaliatory termination');
        legalNote = 'At-will employment does not override anti-retaliation protections';
        verdict = 'suspicious';
      }
      if (/severance|separation/i.test(lower)) {
        ea.push('Review agreement carefully — may contain claim waivers');
        legalNote = 'Older Workers Benefit Protection Act requires 21-day review period for 40+ employees';
      }
    }

    // Default if nothing matched
    if (ef.length === 0 && ea.length === 0) {
      ea.push('No matching vault evidence found — review your uploaded documents');
      verdict = 'unverifiable';
    }

    return { evidence_for: ef, evidence_against: ea, verdict, legal_note: legalNote };
  }

  // ── AI analysis pass ────────────────────────────────────────────────────

  async _runAiAnalysis(text, docType, vaultIncidents, caseDb, partialResult) {
    const context = this._buildContextBlock(vaultIncidents, caseDb);
    const existing = partialResult.auto_flags
      .map(f => `- [${f.severity}] ${f.title}`)
      .join('\n');

    const prompt = `You are an employment law analyst. Assess this employer document.

DOCUMENT TYPE: ${DOCUMENT_INPUT_TYPES[docType] || 'Unknown'}

DOCUMENT:
${text.slice(0, 4000)}

${context}

ALREADY DETECTED FLAGS:
${existing || 'None'}

Tasks:
1. Write a 2-4 sentence plain-language summary of what this document does legally and the overall risk.
2. Surface any additional legal issues NOT already flagged.
3. Assign overall risk level.

Respond ONLY with JSON. No preamble, no backticks:
{
  "summary": "2-4 sentences plain English",
  "risk_level": "low|moderate|high|critical",
  "additional_flags": [
    {
      "title": "short title",
      "category": "retaliation_risk|procedural_defect|policy_violation|eeoc_trigger|fl_state|timing|vagueness",
      "severity": "high|medium|low",
      "explanation": "1-3 sentences",
      "evidence": ["brief point"],
      "eeoc_standard": "title_vii|burlington_northern|mcdonnell_douglas|faragher_ellerth|florida_fcra|nlra_section7|null"
    }
  ]
}

Only flag genuinely new issues not already covered above. eeoc_standard must be one of the listed keys or null.`;

    const raw = await this._callClaude(prompt, 1500);
    const cleaned = raw.replace(/```json|```/g, '').trim();
    try {
      return JSON.parse(cleaned);
    } catch (e) {
      return { summary: 'Assessment complete. Review flagged items above.', risk_level: 'unknown', additional_flags: [] };
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  _buildContextBlock(vaultIncidents, caseDb) {
    const parts = [];

    if (vaultIncidents && vaultIncidents.length > 0) {
      parts.push('=== VAULT INCIDENTS ===');
      vaultIncidents.forEach((inc, i) => {
        parts.push(
          `Incident ${i + 1}: type=${inc.incident_type} | ` +
          `severity=${inc.incident_severity || inc.base_severity} | ` +
          `harasser_role=${inc.harasser_role || 'unknown'} | ` +
          `in_chain=${inc.harasser_in_reporting_chain || false} | ` +
          `reports=${(inc.reports || []).length} | ` +
          `liability=${inc.employer_liability?.level || 'unknown'} | ` +
          `signals=${JSON.stringify(inc.employer_liability?.signals || [])}`
        );
      });
      parts.push('');
    }

    if (caseDb) {
      try {
        const docs = contextStore.getActiveContextDocuments(caseDb);
        if (docs.length > 0) {
          parts.push('=== CONTEXT DOCUMENTS ===');
          const summary = contextStore.activeSignalsSummary(caseDb);
          parts.push(`Active signals: ${JSON.stringify(Object.keys(summary))}`);
          docs.forEach(doc => {
            const typeLabel = contextStore.DOCUMENT_TYPES[doc.doc_type] || 'Other';
            parts.push(`[${typeLabel}] ${doc.display_name}: signals=${JSON.stringify(doc.signalSummary)}`);
          });
          parts.push('');
        }
      } catch (e) {
        // no context docs table yet
      }
    }

    return parts.length > 0 ? parts.join('\n') : 'No vault incidents or context documents.';
  }

  _callClaude(prompt, maxTokens = 1000) {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      });

      const timeout = setTimeout(() => {
        req.destroy();
        reject(new Error('API request timed out after 30s'));
      }, 30000);

      const req = https.request({
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
      }, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          clearTimeout(timeout);
          try {
            const parsed = JSON.parse(data);
            if (parsed.content && parsed.content[0]) {
              resolve(parsed.content[0].text);
            } else if (parsed.error) {
              reject(new Error(parsed.error.message || 'API error'));
            } else {
              reject(new Error('Unexpected API response'));
            }
          } catch (e) {
            reject(e);
          }
        });
      });

      req.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
      req.write(payload);
      req.end();
    });
  }
}

module.exports = {
  DOCUMENT_INPUT_TYPES,
  detectDocumentType,
  DocumentAssessor,
};
