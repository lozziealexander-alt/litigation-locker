/**
 * Detect people mentioned in document text
 * Returns array of suggested actors for user approval
 */

const ROLE_PATTERNS = [
  // Direct relationship patterns
  { pattern: /my (?:direct )?(?:manager|supervisor|boss),?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi, role: 'manager', relationship: 'supervisor' },
  { pattern: /my (?:director|vp|vice president),?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi, role: 'director', relationship: 'supervisor' },
  { pattern: /(?:hr|human resources)\s+(?:director|manager|rep(?:resentative)?|partner|bp),?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi, role: 'hr', relationship: 'hr' },
  { pattern: /(?:ceo|cfo|coo|cto|president),?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi, role: 'executive', relationship: 'executive' },
  { pattern: /(?:my )?(?:coworker|colleague|teammate|peer),?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi, role: 'peer', relationship: 'peer' },
  { pattern: /(?:my )?(?:direct report|subordinate|team member),?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi, role: 'report', relationship: 'direct_report' },

  // Title patterns
  { pattern: /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?),?\s+(?:the |our )?(?:manager|supervisor|director|vp)/gi, role: 'manager', relationship: 'supervisor' },
  { pattern: /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?),?\s+(?:from |in )?(?:hr|human resources)/gi, role: 'hr', relationship: 'hr' },
];

const EMAIL_PATTERNS = [
  // "From: John Smith <email>" or "From: John Smith"
  { pattern: /from:\s*"?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)"?\s*(?:<|$|\n)/gim, context: 'email_sender' },
  { pattern: /to:\s*"?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)"?\s*(?:<|$|\n)/gim, context: 'email_recipient' },
  { pattern: /cc:\s*"?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)"?\s*(?:<|$|\n)/gim, context: 'email_cc' },
  // "From: John Smith email@..." on same line
  { pattern: /from:\s*([A-Z][a-z]+\s+[A-Z][a-z]+)\s/gim, context: 'email_sender' },
  { pattern: /to:\s*([A-Z][a-z]+\s+[A-Z][a-z]+)\s/gim, context: 'email_recipient' },
];

const ACTION_PATTERNS = [
  { pattern: /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:said|told me|wrote|emailed|stated|mentioned|replied|responded|asked|requested|suggested|recommended|approved|denied|rejected|refused|agreed|confirmed|decided|announced|notified|informed|instructed|directed|ordered|demanded|insisted|claimed|argued|complained|reported|explained|described|acknowledged|admitted|warned|cautioned|advised)/gi, context: 'action_subject' },
  { pattern: /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:yelled|screamed|threatened|berated|humiliated|mocked|harassed|bullied|intimidated|belittled|dismissed|ignored|excluded|retaliated|discriminated|targeted)/gi, context: 'aggressor', suggestedClassification: 'bad_actor' },
  { pattern: /(?:told|informed|notified|alerted|contacted|called|emailed|texted|messaged|spoke to|talked to|met with|spoke with)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi, context: 'informed_party' },
  { pattern: /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:witnessed|saw|heard|observed|confirmed|corroborated|supported|backed|verified)/gi, context: 'witness', suggestedClassification: 'witness_supportive' },
];

// Honorific/title patterns that strongly indicate a person
const TITLE_PATTERNS = [
  { pattern: /(?:Mr|Mrs|Ms|Miss|Dr|Prof|Professor|Judge|Officer|Sgt|Sargent|Det|Detective)\.?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/g, context: 'titled_person' },
];

// Words that look like names but aren't
const NAME_BLACKLIST = new Set([
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
  'september', 'october', 'november', 'december',
  'hello', 'dear', 'sincerely', 'regards', 'thanks', 'best', 'cheers',
  'subject', 'from', 'sent', 'received', 'date', 'please', 'thank',
  'human', 'resources', 'performance', 'improvement', 'meeting', 'action',
  'the', 'this', 'that', 'when', 'where', 'what', 'which', 'will', 'would',
  // Pronouns
  'he', 'she', 'they', 'him', 'her', 'his', 'hers', 'their', 'theirs', 'them',
  'we', 'our', 'ours', 'us', 'it', 'its', 'who', 'whom', 'whose',
  'myself', 'yourself', 'himself', 'herself', 'itself', 'themselves', 'ourselves',
  // Common verbs/auxiliaries that appear capitalized at sentence starts
  'has', 'had', 'have', 'having', 'is', 'was', 'were', 'are', 'been', 'being',
  'do', 'does', 'did', 'done', 'doing', 'can', 'could', 'should', 'shall',
  'might', 'must', 'need', 'want', 'get', 'got', 'make', 'made', 'take', 'took',
  'said', 'told', 'asked', 'gave', 'went', 'came', 'know', 'knew', 'think',
  'thought', 'feel', 'felt', 'see', 'saw', 'seem', 'seemed', 'keep', 'kept',
  'let', 'put', 'set', 'say', 'says', 'tell', 'told', 'give', 'go', 'come',
  // Common words that start capitalized at sentence beginnings
  'after', 'before', 'during', 'since', 'until', 'while', 'because',
  'however', 'also', 'then', 'there', 'here', 'later', 'today', 'yesterday',
  'everyone', 'someone', 'anyone', 'nobody', 'nothing', 'everything',
  'about', 'just', 'only', 'even', 'still', 'already', 'never', 'always',
  'both', 'each', 'every', 'some', 'any', 'all', 'most', 'many', 'few',
  'much', 'more', 'other', 'another', 'such', 'own', 'same', 'able',
  'first', 'last', 'next', 'new', 'old', 'long', 'great', 'little', 'right',
  'being', 'once', 'upon', 'into', 'over', 'under', 'between', 'through',
  // Department names
  'compliance', 'engineering', 'marketing', 'legal', 'finance', 'accounting',
  'operations', 'sales', 'support', 'security', 'procurement', 'logistics',
  'payroll', 'benefits', 'training', 'development', 'research', 'quality',
  'audit', 'risk', 'strategy', 'communications', 'administration', 'facilities',
  // Location words
  'building', 'floor', 'suite', 'county', 'district', 'office', 'campus',
  'tower', 'plaza', 'center', 'centre', 'park', 'street', 'avenue', 'boulevard',
  'room', 'wing', 'annex', 'location', 'branch', 'region', 'area', 'zone',
  // Generic business terms
  'general', 'counsel', 'senior', 'interim', 'written', 'formal', 'final',
  'initial', 'annual', 'quarterly', 'monthly', 'weekly', 'daily', 'internal',
  'external', 'corporate', 'executive', 'management', 'advisory', 'committee',
  'board', 'panel', 'review', 'notice', 'policy', 'procedure', 'standard',
  'report', 'summary', 'overview', 'update', 'response', 'request', 'approval',
  'termination', 'suspension', 'investigation', 'complaint', 'grievance',
  'warning', 'corrective', 'disciplinary', 'progressive', 'adverse',
  'reasonable', 'accommodation', 'transfer', 'demotion', 'promotion',
  'separation', 'resignation', 'retirement', 'leave', 'absence',
  // Additional sentence-start words that cause false positives
  'although', 'furthermore', 'moreover', 'nevertheless', 'subsequently',
  'meanwhile', 'regarding', 'according', 'following', 'concerning',
  'despite', 'within', 'without', 'throughout', 'immediately',
  'therefore', 'consequently', 'additionally', 'specifically', 'apparently',
  'essentially', 'unfortunately', 'thankfully', 'hopefully', 'obviously',
  'clearly', 'certainly', 'perhaps', 'maybe', 'sometimes', 'often',
  'typically', 'normally', 'usually', 'frequently', 'occasionally',
  'eventually', 'finally', 'recently', 'previously', 'initially',
  'currently', 'basically', 'actually', 'honestly', 'frankly',
  // Common two-word false positive starters
  'if', 'so', 'but', 'yet', 'nor', 'for', 'not', 'no', 'yes', 'too',
  'how', 'why', 'now', 'per', 'via', 'etc', 'out', 'off', 'up', 'down',
  // Common document / workplace terms that appear capitalized
  'performance', 'improvement', 'plan', 'evaluation', 'assessment',
  'record', 'information', 'schedule', 'position', 'change',
  'document', 'evidence', 'statement', 'prior', 'current', 'pending',
  'written', 'verbal', 'official', 'unofficial', 'total'
]);

// Patterns that indicate a department, organization, or place rather than a person
const DEPT_OR_PLACE_SUFFIXES = /\b(?:department|division|group|team|unit|bureau|office|branch|section|university|college|institute|school|inc|llc|corp|corporation|company|associates|partners|services|solutions|holdings|enterprises|foundation|authority|agency|commission|council|board)\b/i;

/**
 * Detect actors from document text
 */
function detectActors(text, documentId = null) {
  if (!text || typeof text !== 'string') {
    return [];
  }

  // Skip very short text or text that looks like OCR gibberish
  const trimmed = text.trim();
  if (trimmed.length < 40) return [];
  // If the ratio of alphabetic chars to total is too low, it's likely garbled OCR
  const alphaCount = (trimmed.match(/[a-zA-Z]/g) || []).length;
  if (alphaCount / trimmed.length < 0.5) return [];

  const detected = new Map(); // Use Map to dedupe by normalized name

  // Process role patterns (highest confidence)
  for (const { pattern, role, relationship } of ROLE_PATTERNS) {
    let match;
    const regex = new RegExp(pattern.source, pattern.flags);
    while ((match = regex.exec(text)) !== null) {
      const name = cleanName(match[1]);
      if (isValidName(name)) {
        const key = name.toLowerCase();
        if (!detected.has(key)) {
          detected.set(key, {
            id: `pending_actor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name,
            suggestedRole: role,
            suggestedRelationship: relationship,
            suggestedClassification: null,
            source: 'role_pattern',
            confidence: 0.85,
            matchedText: match[0].slice(0, 100),
            sourceDocumentId: documentId,
            needsReview: true
          });
        }
      }
    }
  }

  // Process email patterns
  for (const { pattern, context } of EMAIL_PATTERNS) {
    let match;
    const regex = new RegExp(pattern.source, pattern.flags);
    while ((match = regex.exec(text)) !== null) {
      const name = cleanName(match[1]);
      if (isValidName(name)) {
        const key = name.toLowerCase();
        if (!detected.has(key)) {
          detected.set(key, {
            id: `pending_actor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name,
            suggestedRole: null,
            suggestedRelationship: null,
            suggestedClassification: null,
            source: context,
            confidence: 0.9,
            matchedText: match[0].slice(0, 100),
            sourceDocumentId: documentId,
            needsReview: true
          });
        }
      }
    }
  }

  // Count name appearances for contextual validation of action patterns
  const nameAppearanceCounts = new Map();
  const simpleNameScan = /\b([A-Z][a-z]{1,15}(?:\s+[A-Z][a-z]{1,20})?)\b/g;
  let scanMatch;
  while ((scanMatch = simpleNameScan.exec(text)) !== null) {
    const scannedKey = cleanName(scanMatch[1]).toLowerCase();
    nameAppearanceCounts.set(scannedKey, (nameAppearanceCounts.get(scannedKey) || 0) + 1);
  }

  // Process action patterns
  for (const { pattern, context, suggestedClassification } of ACTION_PATTERNS) {
    let match;
    const regex = new RegExp(pattern.source, pattern.flags);
    while ((match = regex.exec(text)) !== null) {
      const name = cleanName(match[1]);
      if (isValidName(name)) {
        const key = name.toLowerCase();
        if (!detected.has(key)) {
          // Lower confidence for single-occurrence action pattern matches
          const appearances = nameAppearanceCounts.get(key) || 1;
          const confidence = appearances >= 2 ? 0.7 : 0.45;
          detected.set(key, {
            id: `pending_actor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name,
            suggestedRole: null,
            suggestedRelationship: null,
            suggestedClassification: suggestedClassification || null,
            source: context,
            confidence,
            matchedText: match[0].slice(0, 100),
            sourceDocumentId: documentId,
            needsReview: true
          });
        } else if (suggestedClassification) {
          // Update existing with classification hint
          const existing = detected.get(key);
          if (!existing.suggestedClassification) {
            existing.suggestedClassification = suggestedClassification;
          }
        }
      }
    }
  }

  // Process honorific/title patterns (high confidence)
  for (const { pattern, context } of TITLE_PATTERNS) {
    let match;
    const regex = new RegExp(pattern.source, pattern.flags);
    while ((match = regex.exec(text)) !== null) {
      const name = cleanName(match[1]);
      if (isValidName(name)) {
        const key = name.toLowerCase();
        if (!detected.has(key)) {
          detected.set(key, {
            id: `pending_actor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name,
            suggestedRole: null,
            suggestedRelationship: null,
            suggestedClassification: null,
            source: context,
            confidence: 0.85,
            matchedText: match[0].slice(0, 100),
            sourceDocumentId: documentId,
            needsReview: true
          });
        }
      }
    }
  }

  // Chat/messaging header patterns — "Firstname Lastname  date" or "Firstname Lastname\nChat"
  // Catches Teams, Slack, iMessage, WhatsApp screenshot OCR where name appears as message header
  const chatHeaderPatterns = [
    // "Name  3/27/25 10:11 AM" or "Name 7/11/25 1:57 PM"
    /^([A-Z][a-z]{1,15}\s+[A-Z][a-z]{1,20})\s+\d{1,2}\/\d{1,2}\/\d{2,4}/gm,
    // "Name\nChat" (Teams header)
    /^([A-Z][a-z]{1,15}\s+[A-Z][a-z]{1,20})\s*\n\s*Chat/gm,
    // Name on its own line (start of line, just a name, nothing else significant)
    /^([A-Z][a-z]{1,15}\s+[A-Z][a-z]{1,20})\s*$/gm,
  ];
  for (const pattern of chatHeaderPatterns) {
    let cMatch;
    const regex = new RegExp(pattern.source, pattern.flags);
    while ((cMatch = regex.exec(text)) !== null) {
      const name = cleanName(cMatch[1]);
      if (isValidName(name) && name.includes(' ')) {
        const key = name.toLowerCase();
        if (!detected.has(key)) {
          detected.set(key, {
            id: `pending_actor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name,
            suggestedRole: null,
            suggestedRelationship: null,
            suggestedClassification: null,
            source: 'chat_header',
            confidence: 0.8,
            matchedText: cMatch[0].slice(0, 100),
            sourceDocumentId: documentId,
            needsReview: true
          });
        }
      }
    }
  }

  // Standalone "Firstname Lastname" detection — catches names not preceded by keywords
  // Picks up two-word capitalized names; count=1 is enough since we already have higher-confidence patterns above
  const nameCounts = new Map();
  let sMatch;
  // Simple frequency scan for "Firstname Lastname" anywhere in text
  const simpleNameRegex = /\b([A-Z][a-z]{1,15}\s+[A-Z][a-z]{1,20})\b/g;
  while ((sMatch = simpleNameRegex.exec(text)) !== null) {
    const name = cleanName(sMatch[1]);
    if (isValidName(name) && name.includes(' ')) {
      const key = name.toLowerCase();
      if (!detected.has(key)) {
        nameCounts.set(key, (nameCounts.get(key) || 0) + 1);
      }
    }
  }
  // Add names — require at least 2 mentions to reduce false positives
  for (const [key, count] of nameCounts) {
    if (count >= 2 && !detected.has(key)) {
      const parts = key.split(' ');
      const properName = parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
      detected.set(key, {
        id: `pending_actor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: properName,
        suggestedRole: null,
        suggestedRelationship: null,
        suggestedClassification: null,
        source: count >= 2 ? 'standalone_name' : 'single_mention',
        confidence: count >= 2 ? 0.5 : 0.35,
        matchedText: `"${properName}" appears ${count} times`,
        sourceDocumentId: documentId,
        needsReview: true
      });
    }
  }

  // Extract email addresses and associate with detected actors or create new entries
  const emailRegex = /\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/g;
  let emailMatch;
  const foundEmails = [];
  while ((emailMatch = emailRegex.exec(text)) !== null) {
    foundEmails.push(emailMatch[1].toLowerCase());
  }

  // Dedupe emails
  const uniqueEmails = [...new Set(foundEmails)];

  for (const email of uniqueEmails) {
    // Try to derive a name from the email local part (e.g. john.smith@company.com → John Smith)
    const localPart = email.split('@')[0];
    const nameParts = localPart.split(/[._-]/).filter(p => p.length > 1 && /^[a-z]+$/i.test(p));

    // Try to match email to an already-detected actor
    let matched = false;
    for (const [key, actor] of detected) {
      const actorParts = key.split(' ');
      // Check if email local part contains actor's first or last name
      if (actorParts.some(part => localPart.toLowerCase().includes(part))) {
        if (!actor.email) actor.email = email;
        matched = true;
        break;
      }
    }

    // If not matched and we can derive a name, create a new actor entry
    if (!matched && nameParts.length >= 2) {
      const derivedName = nameParts.slice(0, 2).map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ');
      if (isValidName(derivedName)) {
        const key = derivedName.toLowerCase();
        if (!detected.has(key)) {
          detected.set(key, {
            id: `pending_actor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: derivedName,
            email: email,
            suggestedRole: null,
            suggestedRelationship: null,
            suggestedClassification: null,
            source: 'email_address',
            confidence: 0.4,
            matchedText: email,
            sourceDocumentId: documentId,
            needsReview: true
          });
        }
      }
    }
  }

  return Array.from(detected.values());
}

/**
 * Clean extracted name
 */
function cleanName(name) {
  return name
    .trim()
    .replace(/[,.:;'"]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check if a name looks like a department, organization, or place
 */
function looksLikeDepartmentOrPlace(name) {
  return DEPT_OR_PLACE_SUFFIXES.test(name);
}

/**
 * Validate that string looks like a real name
 */
// Common two-word phrases that get matched as names
const COMMON_PHRASES = new Set([
  'performance improvement', 'human resources', 'written warning',
  'corrective action', 'adverse action', 'protected activity',
  'reasonable accommodation', 'formal complaint', 'final warning',
  'annual review', 'quarterly review', 'internal investigation',
  'progressive discipline', 'leave absence', 'general counsel',
  'senior management', 'executive team', 'after that', 'however this',
  'despite that', 'although this', 'furthermore this', 'moreover this',
  'before that', 'during this', 'since then', 'until then'
]);

function isValidName(name) {
  if (!name) return false;

  const lower = name.toLowerCase();

  // Check blacklist — whole name and each word
  if (NAME_BLACKLIST.has(lower)) return false;
  if (lower.split(' ').some(word => NAME_BLACKLIST.has(word))) return false;

  // Reject common two-word phrases
  if (COMMON_PHRASES.has(lower)) return false;

  // Filter out department/org/place names
  if (looksLikeDepartmentOrPlace(name)) return false;

  // Basic validation
  if (name.length < 2) return false;
  if (name.length > 50) return false;
  if (!/^[A-Z]/.test(name)) return false; // Must start with capital
  if (/\d/.test(name)) return false; // No numbers
  if (/[@#$%^&*()+=\[\]{}|\\/<>]/.test(name)) return false; // No special chars

  // Should have at least one vowel
  if (!/[aeiouAEIOU]/.test(name)) return false;

  // Each part of name must be at least 2 characters
  const parts = name.split(' ');
  if (parts.some(part => part.length < 2)) return false;

  // Single-word "names" must be at least 3 chars and not look like a common word
  if (parts.length === 1 && parts[0].length < 3) return false;

  // If name has two parts, neither should be a common preposition/conjunction/article
  const FILLER_WORDS = new Set(['the', 'and', 'for', 'but', 'nor', 'yet', 'so', 'or', 'an', 'at', 'by', 'in', 'of', 'on', 'to', 'up', 'as', 'if', 'it', 'no', 'do']);
  if (parts.length === 2 && parts.some(p => FILLER_WORDS.has(p.toLowerCase()))) return false;

  // Reject names where all letters are uppercase (likely OCR artifacts like "TOUR", "EXIT")
  if (/^[A-Z]+$/.test(name.replace(/\s+/g, ''))) return false;

  // Reject if it looks like an all-caps label followed by lowercase (OCR noise)
  if (/^[A-Z]{3,}\s/.test(name)) return false;

  return true;
}

// Common nickname → canonical first name mappings
const NICKNAME_MAP = {
  ken: 'kenneth', kenny: 'kenneth',
  bob: 'robert', rob: 'robert', bobby: 'robert',
  bill: 'william', will: 'william', billy: 'william', willy: 'william',
  jim: 'james', jimmy: 'james',
  tom: 'thomas', tommy: 'thomas',
  mike: 'michael', mick: 'michael', mickey: 'michael',
  dave: 'david', davy: 'david',
  steve: 'steven', steph: 'stephanie',
  chris: 'christopher',
  matt: 'matthew', matty: 'matthew',
  nick: 'nicholas', nicky: 'nicholas',
  joe: 'joseph', joey: 'joseph',
  dan: 'daniel', danny: 'daniel',
  liz: 'elizabeth', beth: 'elizabeth', betty: 'elizabeth', lisa: 'elizabeth',
  sue: 'susan', susie: 'susan',
  pam: 'pamela',
  jen: 'jennifer', jenny: 'jennifer',
  kate: 'katherine', kathy: 'katherine', kat: 'katherine',
  pat: 'patricia',
  sam: 'samuel',
  alex: 'alexander',
  andy: 'andrew',
  tony: 'anthony',
  ron: 'ronald', ronnie: 'ronald',
  ed: 'edward', eddie: 'edward', ted: 'edward',
  rick: 'richard', rich: 'richard', dick: 'richard',
  chuck: 'charles', charlie: 'charles',
  ben: 'benjamin', benny: 'benjamin',
  tim: 'timothy', timmy: 'timothy',
  greg: 'gregory',
};

function canonicalFirstName(first) {
  return NICKNAME_MAP[first] || first;
}

/**
 * Check if two actor names might be the same person
 */
function mightBeSamePerson(name1, name2) {
  const n1 = name1.toLowerCase().trim();
  const n2 = name2.toLowerCase().trim();

  // Exact match
  if (n1 === n2) return true;

  // One is substring of other (e.g., "Ken" vs "Ken Smith")
  if (n1.includes(n2) || n2.includes(n1)) return true;

  const parts1 = n1.split(/\s+/);
  const parts2 = n2.split(/\s+/);
  const first1 = parts1[0];
  const first2 = parts2[0];
  const last1 = parts1[parts1.length - 1];
  const last2 = parts2[parts2.length - 1];

  // Same canonical first name (handles Ken/Kenneth, Bob/Robert, etc.)
  if (canonicalFirstName(first1) === canonicalFirstName(first2)) return true;

  // Same last name (only flag if both have last names)
  if (parts1.length > 1 && parts2.length > 1 && last1 === last2) return true;

  // First name of one matches last name of other (display name reordering)
  if (parts1.length > 1 && parts2.length > 1) {
    if (first1 === last2 && last1 === first2) return true;
  }

  return false;
}

/**
 * Find potential duplicates in actor list
 */
function findPotentialDuplicates(actors) {
  const duplicates = [];

  for (let i = 0; i < actors.length; i++) {
    for (let j = i + 1; j < actors.length; j++) {
      const a1 = actors[i];
      const a2 = actors[j];
      if (mightBeSamePerson(a1.name, a2.name)) {
        // Build a descriptive reason
        let reason = 'Similar names';
        const n1 = a1.name.toLowerCase().trim();
        const n2 = a2.name.toLowerCase().trim();
        if (n1 === n2) reason = 'Identical names';
        else if (n1.includes(n2) || n2.includes(n1)) reason = 'One name contains the other';
        else {
          const p1 = n1.split(/\s+/), p2 = n2.split(/\s+/);
          const c1 = canonicalFirstName(p1[0]), c2 = canonicalFirstName(p2[0]);
          if (c1 === c2 && c1 !== p1[0]) reason = `Nickname match (${p1[0]} / ${p2[0]})`;
          else if (p1[0] === p2[0]) reason = 'Same first name';
          else if (p1.length > 1 && p2.length > 1 && p1[p1.length-1] === p2[p2.length-1]) reason = 'Same last name';
        }
        duplicates.push({ actor1: a1, actor2: a2, reason });
      }
    }
  }

  return duplicates;
}

module.exports = {
  detectActors,
  isValidName,
  mightBeSamePerson,
  findPotentialDuplicates
};
