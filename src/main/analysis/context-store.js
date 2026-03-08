/**
 * context-store.js — Litigation Locker Context Document Library
 *
 * Manages uploaded reference documents: policies, agreements, handbooks.
 * Storage: SQLite table context_documents in the existing case database.
 *
 * Port of context_store.py to Node.js for Electron main process.
 */

const crypto = require('crypto');

// ── Document types ──────────────────────────────────────────────────────────

const DOCUMENT_TYPES = {
  employment_agreement:   'Employment Agreement / Offer Letter',
  handbook:               'Employee Handbook',
  harassment_policy:      'Harassment / Anti-Discrimination Policy',
  pip_policy:             'PIP / Performance Improvement Policy',
  progressive_discipline: 'Progressive Discipline Policy',
  fmla_policy:            'FMLA / Leave Policy',
  retaliation_policy:     'Non-Retaliation Policy',
  arbitration_agreement:  'Arbitration / Dispute Resolution Agreement',
  nda:                    'NDA / Confidentiality Agreement',
  job_description:        'Job Description / Role Definition',
  severance_agreement:    'Severance Agreement',
  company_email:          'Company Email / HR Communication',
  other_policy:           'Other Policy Document',
  other:                  'Other',
};

// ── EEOC Standards ──────────────────────────────────────────────────────────

const EEOC_STANDARDS = {
  title_vii: {
    name: 'Title VII of the Civil Rights Act',
    scope: 'Prohibits employment discrimination based on race, color, religion, sex, or national origin',
    pip_relevance: 'A PIP issued disproportionately to members of a protected class, or shortly after protected activity, may constitute discrimination or retaliation',
  },
  faragher_ellerth: {
    name: 'Faragher/Ellerth Affirmative Defense',
    scope: 'Employer defense to supervisor harassment claims',
    pip_relevance: 'If a PIP follows a harassment complaint, the employer loses this defense if the PIP is retaliatory',
  },
  burlington_northern: {
    name: 'Burlington Northern v. White (2006)',
    scope: 'Any action that would deter a reasonable employee from engaging in protected activity',
    pip_relevance: 'A PIP can constitute actionable retaliation even without termination',
  },
  mcdonnell_douglas: {
    name: 'McDonnell Douglas Burden-Shifting Framework',
    scope: 'Framework for proving discrimination with circumstantial evidence',
    pip_relevance: 'Employee establishes prima facie case; burden shifts to employer; employee shows pretext',
  },
  florida_fcra: {
    name: 'Florida Civil Rights Act (FCRA)',
    scope: 'Florida state equivalent of Title VII',
    pip_relevance: '300-day EEOC window; 365-day FCHR window. Florida may provide broader coverage.',
  },
  nlra_section7: {
    name: 'NLRA Section 7 / Concerted Activity',
    scope: 'Protects employees discussing wages, working conditions, or organizing',
    pip_relevance: 'A PIP issued after concerted activity discussion may violate NLRA',
  },
};

// ── Policy signal patterns ──────────────────────────────────────────────────

const POLICY_SIGNALS = {
  pip_requires_prior_warning: [
    /\b(verbal warning|written warning|prior notice)\b.{0,120}\b(before|prior to)\b.{0,60}\b(PIP|performance improvement|formal action)\b/is,
    /\b(progressive discipline|step.?one|first step)\b/i,
  ],
  pip_requires_documentation: [
    /\b(PIP|performance improvement)\b.{0,120}\b(must|shall|required to)\b.{0,80}\b(document|in writing|written)\b/is,
  ],
  pip_employee_has_right_to_respond: [
    /\b(employee|you)\b.{0,80}\b(right|opportunity|may|can)\b.{0,60}\b(respond|contest|dispute|rebut|appeal)\b/is,
    /\b(appeal|grievance|dispute process)\b/i,
  ],
  pip_requires_specific_metrics: [
    /\b(PIP|performance improvement)\b.{0,120}\b(specific|measurable|objective|defined)\b.{0,60}\b(goal|metric|standard|target)\b/is,
    /\b(SMART goal|SMART objective)\b/i,
  ],
  has_anti_harassment_policy: [
    /\b(harassment|discrimination|hostile work environment)\b.{0,80}\b(prohibit|not tolerat|zero tolerance|against)\b/is,
  ],
  harassment_reporting_procedure: [
    /\b(report|complaint)\b.{0,60}\b(harassment|discrimination)\b.{0,60}\b(to|with|by contacting)\b/is,
  ],
  non_retaliation_clause: [
    /\b(retaliat(?:ion|e|ing))\b.{0,80}\b(prohibit|not tolerat|forbidden|against policy)\b/is,
    /\b(protected activity|protected complaint)\b/i,
  ],
  at_will_employment: [
    /\b(at.will|at will)\b.{0,80}\b(employment|employee)\b/is,
  ],
  for_cause_termination_required: [
    /\b(just cause|for cause)\b.{0,60}\b(terminat|dismiss|discharg)\b/is,
  ],
  arbitration_required: [
    /\b(binding arbitration)\b/i,
    /\b(waive.{0,20}(jury trial|class action))\b/is,
  ],
  class_action_waiver: [
    /\b(class action|collective action)\b.{0,60}\b(waive|waiver|prohibited)\b/is,
  ],
  fmla_rights_documented: [
    /\b(FMLA|Family and Medical Leave)\b.{0,80}\b(right|entitled|eligible|may take)\b/is,
  ],
};

// ── PIP red flag patterns ───────────────────────────────────────────────────

const PIP_RED_FLAG_PATTERNS = {
  vague_performance_claims: [
    /\b(attitude|demeanor|culture fit|not a team player|difficult|hard to work with)\b/i,
    /\b(does not meet expectations)\b(?!.{0,60}\b(specific|metric|goal|measurable)\b)/is,
  ],
  timing_suspicious: [
    /\b(shortly after|soon after|following|after (you|your|the))\b.{0,80}\b(complaint|report|FMLA|leave|accommodation)\b/is,
  ],
  contradicts_prior_positive_feedback: [
    /\b(previously|prior|before|past|historically)\b.{0,80}\b(strong|good|excellent|positive|praised|exceeded)\b/is,
    /\b(sudden(?:ly)?|abrupt(?:ly)?|no prior)\b.{0,80}\b(concern|issue|warning)\b/is,
  ],
  no_specific_examples: [
    /\b(generally|typically|often|frequently|consistently)\b.{0,80}\b(fail|miss|lack|below|poor)\b/is,
  ],
  unreasonable_timeline: [
    /\b([1-9]|one|two|three)\s+(day|week)\b.{0,40}\b(to (improve|meet|achieve|demonstrate))\b/is,
  ],
  selective_enforcement: [
    /\b(only (you|your))\b(?!.{0,20}\b(have|had|need|must)\b)/i,
  ],
};

// ── Signal extraction ───────────────────────────────────────────────────────

function extractSignals(text) {
  const result = {};
  for (const [key, patterns] of Object.entries(POLICY_SIGNALS)) {
    result[key] = patterns.some(p => p.test(text));
  }
  return result;
}

function extractExcerpts(text, query, window = 200) {
  const excerpts = [];
  const textLower = text.toLowerCase();
  const queryLower = query.toLowerCase();
  let start = 0;
  while (true) {
    const idx = textLower.indexOf(queryLower, start);
    if (idx === -1) break;
    const s = Math.max(0, idx - Math.floor(window / 2));
    const e = Math.min(text.length, idx + query.length + Math.floor(window / 2));
    let ex = text.slice(s, e).trim();
    if (s > 0) ex = '...' + ex;
    if (e < text.length) ex += '...';
    excerpts.push(ex);
    start = idx + query.length;
    if (excerpts.length >= 3) break;
  }
  return excerpts;
}

// ── Schema init ─────────────────────────────────────────────────────────────

function initContextSchema(caseDb) {
  caseDb.exec(`
    CREATE TABLE IF NOT EXISTS context_documents (
      doc_id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      doc_type TEXT NOT NULL,
      display_name TEXT NOT NULL,
      full_text TEXT NOT NULL,
      date_uploaded TEXT NOT NULL,
      date_effective TEXT,
      signals TEXT NOT NULL DEFAULT '{}',
      notes TEXT DEFAULT '',
      is_active INTEGER DEFAULT 1
    )
  `);
}

// ── CRUD operations ─────────────────────────────────────────────────────────

function ingestContextDocument(caseDb, { text, filename, docType, displayName, dateEffective, notes }) {
  initContextSchema(caseDb);
  const docId = crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
  const signals = extractSignals(text);
  const now = new Date().toISOString();

  caseDb.prepare(`
    INSERT OR REPLACE INTO context_documents
    (doc_id, filename, doc_type, display_name, full_text,
     date_uploaded, date_effective, signals, notes, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).run(
    docId, filename, docType, displayName || filename,
    text, now, dateEffective || null,
    JSON.stringify(signals), notes || ''
  );

  const signalSummary = Object.entries(signals)
    .filter(([, v]) => v)
    .map(([k]) => k);

  return { docId, displayName: displayName || filename, signals, signalSummary };
}

function listContextDocuments(caseDb) {
  initContextSchema(caseDb);
  const rows = caseDb.prepare('SELECT * FROM context_documents').all();
  return rows.map(row => ({
    ...row,
    signals: JSON.parse(row.signals || '{}'),
    is_active: !!row.is_active,
    signalSummary: Object.entries(JSON.parse(row.signals || '{}'))
      .filter(([, v]) => v)
      .map(([k]) => k),
  }));
}

function deleteContextDocument(caseDb, docId) {
  initContextSchema(caseDb);
  caseDb.prepare('DELETE FROM context_documents WHERE doc_id = ?').run(docId);
}

function toggleContextDocumentActive(caseDb, docId, isActive) {
  initContextSchema(caseDb);
  caseDb.prepare('UPDATE context_documents SET is_active = ? WHERE doc_id = ?')
    .run(isActive ? 1 : 0, docId);
}

function getContextDocument(caseDb, docId) {
  initContextSchema(caseDb);
  const row = caseDb.prepare('SELECT * FROM context_documents WHERE doc_id = ?').get(docId);
  if (!row) return null;
  return {
    ...row,
    signals: JSON.parse(row.signals || '{}'),
    is_active: !!row.is_active,
    signalSummary: Object.entries(JSON.parse(row.signals || '{}'))
      .filter(([, v]) => v)
      .map(([k]) => k),
  };
}

// ── Query helpers ───────────────────────────────────────────────────────────

function getActiveContextDocuments(caseDb) {
  initContextSchema(caseDb);
  const rows = caseDb.prepare('SELECT * FROM context_documents WHERE is_active = 1').all();
  return rows.map(row => ({
    ...row,
    signals: JSON.parse(row.signals || '{}'),
    is_active: true,
    signalSummary: Object.entries(JSON.parse(row.signals || '{}'))
      .filter(([, v]) => v)
      .map(([k]) => k),
  }));
}

function hasSignal(caseDb, signalKey) {
  const docs = getActiveContextDocuments(caseDb);
  return docs.some(d => d.signals[signalKey]);
}

function getSignalSource(caseDb, signalKey) {
  const docs = getActiveContextDocuments(caseDb);
  return docs.find(d => d.signals[signalKey]) || null;
}

function activeSignalsSummary(caseDb) {
  const docs = getActiveContextDocuments(caseDb);
  const summary = {};
  for (const doc of docs) {
    for (const [sig, val] of Object.entries(doc.signals)) {
      if (val && !(sig in summary)) {
        summary[sig] = doc.display_name;
      }
    }
  }
  return summary;
}

function buildAssessmentContext(caseDb) {
  const docs = getActiveContextDocuments(caseDb);
  if (docs.length === 0) return 'No context documents uploaded.';

  const parts = ['=== CONTEXT DOCUMENTS (uploaded by user) ===\n'];
  for (const doc of docs) {
    const typeLabel = DOCUMENT_TYPES[doc.doc_type] || 'Other';
    const sigs = doc.signalSummary.join(', ') || 'none detected';
    parts.push(`[${typeLabel.toUpperCase()}] ${doc.display_name}`);
    parts.push(`Active policy signals: ${sigs}`);
    parts.push('');
    parts.push('--- DOCUMENT TEXT ---');
    parts.push(doc.full_text.slice(0, 6000));
    if (doc.full_text.length > 6000) parts.push('... [truncated]');
    parts.push('\n' + '\u2014'.repeat(60) + '\n');
  }
  return parts.join('\n');
}

function searchContextDocuments(caseDb, query) {
  const docs = getActiveContextDocuments(caseDb);
  const results = [];
  for (const doc of docs) {
    const excerpts = extractExcerpts(doc.full_text, query);
    if (excerpts.length > 0) {
      results.push({ doc, excerpts });
    }
  }
  return results;
}

// ── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  DOCUMENT_TYPES,
  EEOC_STANDARDS,
  POLICY_SIGNALS,
  PIP_RED_FLAG_PATTERNS,
  extractSignals,
  extractExcerpts,
  initContextSchema,
  ingestContextDocument,
  listContextDocuments,
  deleteContextDocument,
  toggleContextDocumentActive,
  getContextDocument,
  getActiveContextDocuments,
  hasSignal,
  getSignalSource,
  activeSignalsSummary,
  buildAssessmentContext,
  searchContextDocuments,
};
