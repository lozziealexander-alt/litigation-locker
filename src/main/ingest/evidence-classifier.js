const natural = require('natural');
const path = require('path');

// ---- Layer weights ----
const WEIGHTS = {
  textInference: 0.50,
  metadataRules: 0.25,
  filenameHeuristics: 0.10,
  structuralAnalysis: 0.15
};

// All evidence types
const EVIDENCE_TYPES = [
  'ADVERSE_ACTION', 'PROTECTED_ACTIVITY', 'REQUEST_FOR_HELP',
  'INCIDENT', 'RESPONSE', 'CLAIM_AGAINST_YOU', 'CLAIM_YOU_MADE',
  'PAY_RECORD', 'SUPPORTING', 'CONTEXT'
];

// ---- Cached Bayesian classifier ----
let trainedClassifier = null;

/**
 * Get or train the Naive Bayes classifier.
 * Trains on first call from training-corpus.json, then caches.
 */
function getClassifier() {
  if (trainedClassifier) return trainedClassifier;

  const classifier = new natural.BayesClassifier(natural.PorterStemmer);

  // Load training corpus
  let corpus;
  try {
    corpus = require('./training-corpus.json');
  } catch (e) {
    console.error('[evidence-classifier] Failed to load training corpus:', e.message);
    return null;
  }

  // Train on each category
  for (const [category, examples] of Object.entries(corpus)) {
    for (const example of examples) {
      classifier.addDocument(example.toLowerCase(), category);
    }
  }

  classifier.train();
  trainedClassifier = classifier;
  return classifier;
}

// ============================================================
// Layer 1: Bayesian Text Inference (weight 0.50)
// ============================================================

/**
 * Run Naive Bayes classification on text.
 * Returns scores object { TYPE: probability, ... }
 */
function runTextInference(text) {
  const scores = initScores();

  if (!text || text.trim().length < 10) return scores;

  const classifier = getClassifier();
  if (!classifier) return scores;

  const lower = text.toLowerCase();

  // Get classifications for the full text
  try {
    const classifications = classifier.getClassifications(lower);

    // Convert log probabilities to relative scores
    // natural returns [{label, value}] sorted by value (higher = better match)
    if (classifications && classifications.length > 0) {
      // Find the range for normalization
      const values = classifications.map(c => c.value);
      const maxVal = Math.max(...values);
      const minVal = Math.min(...values);
      const range = maxVal - minVal || 1;

      for (const c of classifications) {
        if (EVIDENCE_TYPES.includes(c.label)) {
          // Normalize to 0-1 range
          scores[c.label] = (c.value - minVal) / range;
        }
      }
    }
  } catch (e) {
    console.warn('[evidence-classifier] Bayes classification error:', e.message);
  }

  // Also run chunk-based analysis for longer texts
  // Split into sentences and classify each — boosts types that appear repeatedly
  if (lower.length > 200) {
    const sentences = lower.split(/[.!?\n]+/).filter(s => s.trim().length > 15);
    const chunkBoosts = initScores();
    let validChunks = 0;

    for (const sentence of sentences.slice(0, 20)) { // cap at 20 sentences
      try {
        const result = classifier.classify(sentence.trim());
        if (EVIDENCE_TYPES.includes(result)) {
          chunkBoosts[result] += 1;
          validChunks++;
        }
      } catch (e) { /* skip */ }
    }

    // Normalize chunk boosts and blend in (30% weight within this layer)
    if (validChunks > 0) {
      for (const type of EVIDENCE_TYPES) {
        const chunkScore = chunkBoosts[type] / validChunks;
        scores[type] = scores[type] * 0.7 + chunkScore * 0.3;
      }
    }
  }

  return scores;
}

// ============================================================
// Layer 2: Metadata Rules (weight 0.25)
// ============================================================

/**
 * Score based on email/PDF metadata signals.
 */
function runMetadataRules(metadata, ext, mimeType) {
  const scores = initScores();
  if (!metadata) return scores;

  const meta = typeof metadata === 'string' ? safeParse(metadata) : metadata;
  if (!meta) return scores;

  // ---- Email metadata ----
  const from = (meta.from || '').toLowerCase();
  const to = (meta.to || '').toLowerCase();
  const cc = (meta.cc || '').toLowerCase();
  const subject = (meta.subject || '').toLowerCase();
  const inReplyTo = meta.inReplyTo || meta.in_reply_to || '';

  // HR/Legal sender boosts
  if (from.includes('hr@') || from.includes('humanresources') || from.includes('human.resources') ||
      from.includes('people@') || from.includes('peopleops')) {
    scores['RESPONSE'] += 0.6;
    scores['ADVERSE_ACTION'] += 0.3;
    scores['CLAIM_AGAINST_YOU'] += 0.2;
  }

  if (from.includes('legal@') || from.includes('compliance@') || from.includes('ethics@')) {
    scores['RESPONSE'] += 0.5;
    scores['CLAIM_AGAINST_YOU'] += 0.3;
  }

  // Subject line signals
  if (subject.includes('complaint') || subject.includes('grievance')) {
    scores['REQUEST_FOR_HELP'] += 0.5;
    scores['PROTECTED_ACTIVITY'] += 0.3;
  }
  if (subject.includes('investigation') || subject.includes('findings')) {
    scores['RESPONSE'] += 0.6;
  }
  if (subject.includes('termination') || subject.includes('separation') || subject.includes('pip') ||
      subject.includes('warning') || subject.includes('disciplinary')) {
    scores['ADVERSE_ACTION'] += 0.7;
  }
  if (subject.includes('pay') || subject.includes('compensation') || subject.includes('salary') ||
      subject.includes('bonus') || subject.includes('payroll')) {
    scores['PAY_RECORD'] += 0.6;
  }
  if (subject.includes('re:') || subject.includes('response') || subject.includes('follow up') ||
      subject.includes('regarding your')) {
    scores['RESPONSE'] += 0.3;
  }
  if (subject.includes('incident') || subject.includes('harassment') || subject.includes('discrimination')) {
    scores['INCIDENT'] += 0.5;
    scores['REQUEST_FOR_HELP'] += 0.3;
  }

  // Reply chain detection — emails in a chain are more likely responses
  if (inReplyTo) {
    scores['RESPONSE'] += 0.4;
  }

  // Sent TO hr/legal (from user) → likely a request for help or protected activity
  if (to.includes('hr@') || to.includes('humanresources') || to.includes('compliance@') ||
      cc.includes('hr@') || cc.includes('humanresources')) {
    scores['REQUEST_FOR_HELP'] += 0.4;
    scores['PROTECTED_ACTIVITY'] += 0.2;
  }

  // ---- PDF metadata ----
  const pdfTitle = (meta.title || meta.Title || '').toLowerCase();
  const pdfAuthor = (meta.author || meta.Author || '').toLowerCase();
  const pdfSubject = (meta.subject || meta.Subject || '').toLowerCase();

  if (pdfTitle.includes('termination') || pdfTitle.includes('separation') ||
      pdfTitle.includes('warning') || pdfTitle.includes('performance improvement')) {
    scores['ADVERSE_ACTION'] += 0.6;
  }
  if (pdfTitle.includes('handbook') || pdfTitle.includes('policy') || pdfTitle.includes('code of conduct')) {
    scores['SUPPORTING'] += 0.7;
  }
  if (pdfTitle.includes('complaint') || pdfTitle.includes('charge')) {
    scores['CLAIM_YOU_MADE'] += 0.4;
    scores['PROTECTED_ACTIVITY'] += 0.4;
  }
  if (pdfTitle.includes('investigation') || pdfTitle.includes('findings')) {
    scores['RESPONSE'] += 0.5;
  }
  if (pdfTitle.includes('pay') || pdfTitle.includes('earnings') || pdfTitle.includes('w-2') || pdfTitle.includes('w2')) {
    scores['PAY_RECORD'] += 0.7;
  }

  // Normalize: cap all scores at 1.0
  for (const type of EVIDENCE_TYPES) {
    scores[type] = Math.min(scores[type], 1.0);
  }

  return scores;
}

// ============================================================
// Layer 3: Filename Heuristics (weight 0.10)
// ============================================================

/**
 * Score based on filename patterns.
 */
function runFilenameHeuristics(filename) {
  const scores = initScores();
  if (!filename) return scores;

  const lower = filename.toLowerCase();

  // Adverse action indicators
  if (/terminat|pip|warning|disciplin|suspend|demot|separat|severance/.test(lower)) {
    scores['ADVERSE_ACTION'] += 0.8;
  }

  // Protected activity indicators
  if (/complaint|eeoc|fchr|charge|whistleblower|grievance/.test(lower)) {
    scores['PROTECTED_ACTIVITY'] += 0.7;
    scores['CLAIM_YOU_MADE'] += 0.3;
  }

  // Pay records
  if (/pay[_\s-]?stub|payroll|paycheck|w[_-]?2|earning|compensation|salary/.test(lower)) {
    scores['PAY_RECORD'] += 0.9;
  }

  // Incident/harassment
  if (/incident|harass|discriminat|hostile|bully/.test(lower)) {
    scores['INCIDENT'] += 0.7;
  }

  // Request for help
  if (/hr[_\s-]?report|hr[_\s-]?complaint|hr[_\s-]?email|request/.test(lower)) {
    scores['REQUEST_FOR_HELP'] += 0.6;
  }

  // Response/investigation
  if (/investigation|findings|response|result/.test(lower)) {
    scores['RESPONSE'] += 0.6;
  }

  // Supporting documents
  if (/handbook|policy|contract|agreement|offer[_\s-]?letter|nda|non[_-]?disclosure/.test(lower)) {
    scores['SUPPORTING'] += 0.8;
  }

  // Claims
  if (/demand[_\s-]?letter|legal[_\s-]?claim|lawsuit|filing/.test(lower)) {
    scores['CLAIM_YOU_MADE'] += 0.6;
  }
  if (/counter[_\s-]?claim|accused|allegation/.test(lower)) {
    scores['CLAIM_AGAINST_YOU'] += 0.6;
  }

  // Screenshots are often incident evidence
  if (/screenshot|screen[_\s-]?cap|snip/.test(lower)) {
    scores['INCIDENT'] += 0.2;
    scores['CONTEXT'] += 0.2;
  }

  // Cap at 1.0
  for (const type of EVIDENCE_TYPES) {
    scores[type] = Math.min(scores[type], 1.0);
  }

  return scores;
}

// ============================================================
// Layer 4: Structural Analysis (weight 0.15)
// ============================================================

/**
 * Analyze document structure: letter format, voice, length cues.
 */
function runStructuralAnalysis(text, metadata) {
  const scores = initScores();
  if (!text || text.trim().length < 20) return scores;

  const lower = text.toLowerCase();
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  const wordCount = text.split(/\s+/).length;

  // ---- Formal letter detection ----
  // Salutation patterns: "Dear Mr/Ms/Dr...", "To Whom It May Concern"
  const hasSalutation = /^(dear\s|to whom|attention:|attn:)/im.test(text);
  // Sign-off patterns: "Sincerely,", "Regards,"
  const hasSignoff = /(sincerely|regards|respectfully|truly yours|best regards),?\s*$/im.test(text);

  if (hasSalutation && hasSignoff) {
    // Formal letters are often adverse actions, responses, or claims
    scores['ADVERSE_ACTION'] += 0.3;
    scores['RESPONSE'] += 0.3;
    scores['CLAIM_YOU_MADE'] += 0.2;
  }

  // ---- First-person voice (complainant perspective) ----
  const firstPersonStarts = (lower.match(/^i\s+(am|was|have|had|feel|felt|want|need|wish|believe|think|filed|reported|complained)/gm) || []).length;
  if (firstPersonStarts >= 3) {
    scores['CLAIM_YOU_MADE'] += 0.4;
    scores['REQUEST_FOR_HELP'] += 0.3;
    scores['PROTECTED_ACTIVITY'] += 0.2;
  }

  // ---- Third-person/institutional voice ----
  const institutionalPhrases = (lower.match(/(the company|the organization|management has|we have|our investigation|our policy|per company|as per|pursuant to)/g) || []).length;
  if (institutionalPhrases >= 2) {
    scores['RESPONSE'] += 0.3;
    scores['ADVERSE_ACTION'] += 0.2;
    scores['SUPPORTING'] += 0.2;
  }

  // ---- Document length heuristics ----
  if (wordCount > 2000) {
    // Long documents are more likely handbooks/policies or detailed complaints
    scores['SUPPORTING'] += 0.3;
    scores['CLAIM_YOU_MADE'] += 0.1;
  } else if (wordCount < 50) {
    // Very short docs might be notes, stubs, or screenshots
    scores['CONTEXT'] += 0.2;
    scores['PAY_RECORD'] += 0.1; // pay stubs are often short
  }

  // ---- Tabular/numeric content (pay records) ----
  const numericLines = lines.filter(l => /\$[\d,.]+/.test(l) || /\d{1,3}(,\d{3})*\.\d{2}/.test(l)).length;
  if (numericLines >= 3) {
    scores['PAY_RECORD'] += 0.5;
  }

  // ---- Date-heavy content ----
  const datePatterns = (lower.match(/\d{1,2}\/\d{1,2}\/\d{2,4}|\w+ \d{1,2},?\s+\d{4}/g) || []).length;
  if (datePatterns >= 5) {
    // Many dates suggest timeline, pay records, or incident logs
    scores['PAY_RECORD'] += 0.2;
    scores['INCIDENT'] += 0.1;
  }

  // ---- List/bullet structure (common in policies and handbooks) ----
  const bulletLines = lines.filter(l => /^\s*[\u2022\-\*\d+\.]\s/.test(l)).length;
  if (bulletLines >= 5 && wordCount > 500) {
    scores['SUPPORTING'] += 0.3;
  }

  // Cap at 1.0
  for (const type of EVIDENCE_TYPES) {
    scores[type] = Math.min(scores[type], 1.0);
  }

  return scores;
}

// ============================================================
// Score Merging & Ranking
// ============================================================

/**
 * Merge a layer's scores into the accumulator with given weight.
 */
function mergeScores(accumulator, layerScores, weight) {
  for (const type of EVIDENCE_TYPES) {
    accumulator[type] += (layerScores[type] || 0) * weight;
  }
}

/**
 * Rank all types by merged score. Returns sorted array of { type, score }.
 */
function rankResults(scores) {
  return EVIDENCE_TYPES
    .map(type => ({ type, score: scores[type] || 0 }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Convert raw score to confidence string.
 */
function scoreToConfidence(topScore, secondScore) {
  const gap = topScore - secondScore;
  if (topScore >= 0.4 && gap >= 0.15) return 'high';
  if (topScore >= 0.25 && gap >= 0.08) return 'medium';
  if (topScore >= 0.1) return 'low';
  return 'none';
}

// ============================================================
// Main Public API
// ============================================================

/**
 * Classify evidence using all 4 layers.
 *
 * @param {Object} args
 * @param {string} args.filename
 * @param {string} args.ext
 * @param {string} args.mimeType
 * @param {string} args.extractedText - combined extracted + OCR text
 * @param {Object} args.metadata - raw metadata object or JSON string
 * @param {Array} args.contentDates
 *
 * @returns {Object} { primary, confidence, secondary, secondaryConfidence, allScores, method }
 */
function classifyEvidence({ filename, ext, mimeType, extractedText, metadata, contentDates }) {
  const scores = initScores();

  // Parse metadata if it's a string
  const meta = typeof metadata === 'string' ? safeParse(metadata) : (metadata || {});

  // Layer 1: Bayesian text inference
  const textScores = runTextInference(extractedText || '');
  mergeScores(scores, textScores, WEIGHTS.textInference);

  // Layer 2: Metadata rules
  const metaScores = runMetadataRules(meta, ext, mimeType);
  mergeScores(scores, metaScores, WEIGHTS.metadataRules);

  // Layer 3: Filename heuristics
  const fnScores = runFilenameHeuristics(filename);
  mergeScores(scores, fnScores, WEIGHTS.filenameHeuristics);

  // Layer 4: Structural analysis
  const structScores = runStructuralAnalysis(extractedText || '', meta);
  mergeScores(scores, structScores, WEIGHTS.structuralAnalysis);

  // Rank
  const ranked = rankResults(scores);
  const top = ranked[0] || { type: 'CONTEXT', score: 0 };
  const second = ranked[1] || { type: 'CONTEXT', score: 0 };

  const confidence = scoreToConfidence(top.score, second.score);

  // Determine which layers contributed most
  const methods = [];
  if (textScores[top.type] > 0.3) methods.push('text_inference');
  if (metaScores[top.type] > 0.3) methods.push('metadata');
  if (fnScores[top.type] > 0.3) methods.push('filename');
  if (structScores[top.type] > 0.3) methods.push('structure');

  return {
    primary: top.type,
    confidence,
    secondary: second.type !== top.type ? second.type : (ranked[2]?.type || 'CONTEXT'),
    secondaryConfidence: scoreToConfidence(second.score, (ranked[2]?.score || 0)),
    allScores: Object.fromEntries(ranked.map(r => [r.type, Math.round(r.score * 1000) / 1000])),
    method: methods.length > 0 ? methods.join('+') : 'fallback'
  };
}

/**
 * Backward-compatible wrapper — returns just the primary type string.
 * Drop-in replacement for the old detectEvidenceType().
 */
function detectEvidenceType(args) {
  const result = classifyEvidence(args);
  return result.primary;
}

// ============================================================
// Utilities
// ============================================================

function initScores() {
  const scores = {};
  for (const type of EVIDENCE_TYPES) {
    scores[type] = 0;
  }
  return scores;
}

function safeParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

module.exports = {
  classifyEvidence,
  detectEvidenceType,
  EVIDENCE_TYPES
};
