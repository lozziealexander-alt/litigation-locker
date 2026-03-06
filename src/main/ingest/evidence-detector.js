/**
 * Auto-detect evidence type from content signals.
 * Returns a string like 'email', 'screenshot', 'performance_review', etc.
 */
function detectEvidenceType({ filename, ext, mimeType, extractedText, metadata, contentDates }) {
  const lower = (extractedText || '').toLowerCase();
  const fname = filename.toLowerCase();

  // Email
  if (ext === '.eml' || mimeType === 'message/rfc822') return 'email';
  if (metadata?.subject && metadata?.from) return 'email';
  if (lower.includes('from:') && lower.includes('to:') && lower.includes('subject:')) return 'email';

  // Screenshot (image with screen-like dimensions or screenshot naming)
  if (mimeType?.startsWith('image/')) {
    if (fname.includes('screenshot') || fname.includes('screen shot') || fname.includes('screen_capture')) {
      return 'screenshot';
    }
    if (fname.match(/img_\d{4}/i) || fname.match(/photo_\d/i)) return 'photo';
    // Chat screenshot detection
    if (lower.includes('imessage') || lower.includes('whatsapp') || lower.includes('slack') ||
        lower.includes('teams') || lower.includes('signal')) {
      return 'chat_screenshot';
    }
    return 'photo';
  }

  // PDF subtypes
  if (ext === '.pdf' || mimeType === 'application/pdf') {
    if (matchesPattern(lower, PERFORMANCE_REVIEW_SIGNALS)) return 'performance_review';
    if (matchesPattern(lower, HR_DOCUMENT_SIGNALS)) return 'hr_document';
    if (matchesPattern(lower, PAY_DOCUMENT_SIGNALS)) return 'pay_record';
    if (matchesPattern(lower, LEGAL_DOCUMENT_SIGNALS)) return 'legal_document';
    if (matchesPattern(lower, POLICY_SIGNALS)) return 'policy';
    if (matchesPattern(lower, CONTRACT_SIGNALS)) return 'contract';
    if (matchesPattern(lower, MEDICAL_SIGNALS)) return 'medical_record';
    return 'document';
  }

  // Text-based files
  if (mimeType?.startsWith('text/') || ['.txt', '.md', '.rtf'].includes(ext)) {
    if (matchesPattern(lower, PERFORMANCE_REVIEW_SIGNALS)) return 'performance_review';
    if (matchesPattern(lower, HR_DOCUMENT_SIGNALS)) return 'hr_document';
    if (matchesPattern(lower, PAY_DOCUMENT_SIGNALS)) return 'pay_record';
    if (lower.includes('dear ') || lower.includes('sincerely') || lower.includes('regards')) return 'letter';
    if (lower.includes('meeting notes') || lower.includes('minutes of')) return 'meeting_notes';
    if (lower.includes('agenda') && lower.includes('attendees')) return 'meeting_notes';
    return 'text_document';
  }

  // Chat exports
  if (fname.includes('chat') || fname.includes('conversation') || fname.includes('messages')) {
    return 'chat_export';
  }

  return 'other';
}

// Signal patterns for different evidence types
const PERFORMANCE_REVIEW_SIGNALS = [
  'performance review', 'performance evaluation', 'annual review',
  'performance rating', 'performance assessment', 'self-assessment',
  'meets expectations', 'exceeds expectations', 'below expectations',
  'performance improvement plan', 'pip', 'development plan',
  'rating:', 'overall rating', 'competency', 'goals for next'
];

const HR_DOCUMENT_SIGNALS = [
  'human resources', 'employee handbook', 'written warning',
  'verbal warning', 'disciplinary action', 'termination',
  'separation agreement', 'severance', 'non-compete',
  'offer letter', 'employment agreement', 'onboarding',
  'employee id', 'hire date', 'department:'
];

const PAY_DOCUMENT_SIGNALS = [
  'pay stub', 'payroll', 'salary', 'compensation',
  'gross pay', 'net pay', 'deductions', 'w-2',
  'bonus', 'commission', 'overtime', 'pay period',
  'earnings statement', 'direct deposit'
];

const LEGAL_DOCUMENT_SIGNALS = [
  'court', 'plaintiff', 'defendant', 'attorney',
  'legal notice', 'cease and desist', 'complaint',
  'motion to', 'hereby', 'jurisdiction', 'arbitration',
  'mediation', 'settlement', 'deposition'
];

const POLICY_SIGNALS = [
  'policy', 'procedure', 'guideline', 'standard operating',
  'effective date', 'revision date', 'applies to',
  'code of conduct', 'anti-discrimination', 'anti-harassment',
  'whistleblower', 'retaliation', 'reporting procedure'
];

const CONTRACT_SIGNALS = [
  'agreement', 'contract', 'parties', 'whereas',
  'terms and conditions', 'effective date', 'termination clause',
  'governing law', 'entire agreement', 'amendments'
];

const MEDICAL_SIGNALS = [
  'diagnosis', 'treatment', 'prescription', 'medical leave',
  'fmla', 'accommodation', 'physician', 'doctor',
  'patient', 'symptoms', 'disability', 'reasonable accommodation'
];

/**
 * Check if text matches enough signals from a pattern list
 */
function matchesPattern(text, signals) {
  let matches = 0;
  for (const signal of signals) {
    if (text.includes(signal)) matches++;
  }
  return matches >= 2;
}

module.exports = { detectEvidenceType };
