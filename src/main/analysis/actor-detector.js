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
  // Common verbs/words that start capitalized at sentence beginnings
  'after', 'before', 'during', 'since', 'until', 'while', 'because',
  'however', 'also', 'then', 'there', 'here', 'later', 'today', 'yesterday',
  'everyone', 'someone', 'anyone', 'nobody', 'nothing', 'everything',
  'about', 'just', 'only', 'even', 'still', 'already', 'never', 'always'
]);

/**
 * Detect actors from document text
 */
function detectActors(text, documentId = null) {
  if (!text || typeof text !== 'string') {
    return [];
  }

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

  // Process action patterns
  for (const { pattern, context, suggestedClassification } of ACTION_PATTERNS) {
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
            suggestedClassification: suggestedClassification || null,
            source: context,
            confidence: 0.7,
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
  // Add names — threshold of 1 is fine since blacklist filters out false positives
  for (const [key, count] of nameCounts) {
    if (count >= 1 && !detected.has(key)) {
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
            confidence: 0.6,
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
 * Validate that string looks like a real name
 */
function isValidName(name) {
  if (!name) return false;

  const lower = name.toLowerCase();

  // Check blacklist
  if (NAME_BLACKLIST.has(lower)) return false;
  if (lower.split(' ').some(word => NAME_BLACKLIST.has(word))) return false;

  // Basic validation
  if (name.length < 2) return false;
  if (name.length > 50) return false;
  if (!/^[A-Z]/.test(name)) return false; // Must start with capital
  if (/\d/.test(name)) return false; // No numbers
  if (/[@#$%^&*()+=\[\]{}|\\/<>]/.test(name)) return false; // No special chars

  // Should have at least one vowel
  if (!/[aeiouAEIOU]/.test(name)) return false;

  return true;
}

/**
 * Check if two actor names might be the same person
 */
function mightBeSamePerson(name1, name2) {
  const n1 = name1.toLowerCase().trim();
  const n2 = name2.toLowerCase().trim();

  // Exact match
  if (n1 === n2) return true;

  // One is substring of other (e.g., "John" vs "John Smith")
  if (n1.includes(n2) || n2.includes(n1)) return true;

  // Same first name or last name
  const parts1 = n1.split(' ');
  const parts2 = n2.split(' ');

  if (parts1[0] === parts2[0]) return true; // Same first name
  if (parts1.length > 1 && parts2.length > 1) {
    if (parts1[parts1.length - 1] === parts2[parts2.length - 1]) return true; // Same last name
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
      if (mightBeSamePerson(actors[i].name, actors[j].name)) {
        duplicates.push({
          actor1: actors[i],
          actor2: actors[j],
          reason: 'Similar names'
        });
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
