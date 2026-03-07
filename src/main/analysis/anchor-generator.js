const { v4: uuidv4 } = require('uuid');
const { detectActors } = require('./actor-detector');

/**
 * Anchor types, detection patterns, and title extractors
 * Each type has multiple regex patterns — first match per segment wins
 */
const ANCHOR_PATTERNS = {
  START: {
    patterns: [
      /(?:started|began|hired|joined|first day|onboarded|orientation)(?:\s+(?:at|with|onto|working|into|my\s+job|employment|a\s+new))?\s*/gi,
      /hire date/gi,
      /employment began/gi,
      /got (?:the|a|my) (?:job|offer|position|role)/gi,
      /accepted (?:the|a|an) (?:offer|position|role)/gi,
      /(?:new|my)\s+role/gi,
      /offered (?:the|a) (?:position|role|job)/gi,
      /I was (?:brought on|onboarded|brought in)/gi
    ],
    titleExtractor: (segment) => {
      const roleMatch = segment.match(/(?:role|position|title)\s+(?:as|of)\s+([^,.]+)/i);
      if (roleMatch) return `Started as ${roleMatch[1].trim().slice(0, 50)}`;
      const companyMatch = segment.match(/(?:at|with|for)\s+([A-Z][A-Za-z\s&]+?)(?:\s+(?:as|on|in)\b|[,.]|$)/);
      if (companyMatch) return `Started at ${companyMatch[1].trim().slice(0, 40)}`;
      return 'Employment Started';
    },
    defaultTitle: 'Employment Started',
    color: '#3B82F6'
  },

  REPORTED: {
    patterns: [
      /I\s+reported\s+(?:it|this|him|her|them|the|that|what)/gi,
      /I\s+reported\b/gi,
      /(?:reported|filed|submitted|made|lodged)\s+(?:a\s+)?(?:complaint|report|charge|grievance|claim)/gi,
      /(?:complained|reported)\s+(?:to|about|that|regarding)/gi,
      /(?:eeoc|fchr|hr|human resources|ethics|compliance|ombudsman)\s+(?:complaint|charge|report|filing)/gi,
      /whistleblow/gi,
      /(?:told|informed|notified|alerted)\s+(?:\w+\s+)?(?:about|regarding|that)/gi,
      /(?:brought\s+(?:it|this|the\s+issue|concerns?)\s+(?:to|up))/gi,
      /(?:raised|flagged|documented|noted)\s+(?:the\s+issue|concerns?|problems?|my\s+concerns?)/gi,
      /(?:went|spoke|talked)\s+to\s+(?:hr|human resources|management|my\s+(?:manager|supervisor|boss))/gi,
      /put\s+(?:it|this|everything)\s+in\s+writing/gi,
      /sent\s+(?:a\s+)?(?:recap|follow[\s-]?up)?\s*email/gi,
      /(?:disclosed|shared)\s+(?:what|the|my)/gi
    ],
    titleExtractor: (segment) => {
      const toWhom = segment.match(/(?:reported|complained|told|informed|spoke|went)\s+(?:to|with)\s+([A-Z][a-zA-Z\s]+?)(?:\s+(?:about|that|regarding|and)\b|[,.]|$)/i);
      if (toWhom) return `Reported to ${toWhom[1].trim().slice(0, 30)}`;
      const aboutWhat = segment.match(/(?:reported|complained about|flagged)\s+(?:the\s+)?(.{10,40}?)(?:\s+(?:to|and|but)\b|[,.]|$)/i);
      if (aboutWhat) return `Reported: ${aboutWhat[1].trim().slice(0, 40)}`;
      return 'Reported Issue';
    },
    defaultTitle: 'Reported Issue',
    color: '#8B5CF6'
  },

  HELP: {
    patterns: [
      /(?:asked|requested|sought|begged)\s+(?:for\s+)?(?:help|assistance|support|guidance|accommodation)/gi,
      /(?:asked|requested)\s+\w+\s+for\s+(?:help|support|guidance)/gi,
      /(?:reached out|contacted|spoke|went)\s+(?:to\s+)?(?:hr|management|supervisor|eap|union|attorney|lawyer)/gi,
      /(?:requested|asked for|applied for)\s+(?:accommodation|transfer|reassignment|meeting|mediation|leave|investigation)/gi,
      /escalated\s+(?:to|the|my|this)/gi,
      /I\s+escalated/gi,
      /(?:hired|consulted|retained)\s+(?:a|an)\s+(?:attorney|lawyer|counsel)/gi,
      /(?:filed|made)\s+(?:a\s+)?(?:fmla|ada|workers\s+comp)/gi,
      /(?:sought|got|needed)\s+(?:medical|mental\s+health|therapy|counseling)/gi,
      /(?:asked|requested)\s+(?:for\s+)?(?:an?\s+)?(?:internal\s+)?investigation/gi,
      /I\s+(?:continue|continued)\s+to\s+(?:try|escalate|ask|raise)/gi
    ],
    titleExtractor: (segment) => {
      const toWhom = segment.match(/(?:asked|escalated to|reached out to|went to|contacted)\s+([A-Z][a-zA-Z\s]+?)(?:\s+(?:for|about|and)\b|[,.]|$)/i);
      if (toWhom) return `Asked ${toWhom[1].trim().slice(0, 30)} for Help`;
      if (/investigation/i.test(segment)) return 'Requested Investigation';
      if (/attorney|lawyer/i.test(segment)) return 'Consulted Attorney';
      if (/escalated/i.test(segment)) return 'Escalated Issue';
      return 'Asked for Help';
    },
    defaultTitle: 'Asked for Help',
    color: '#F97316'
  },

  ADVERSE_ACTION: {
    patterns: [
      /(?:pip|performance improvement plan)/gi,
      /(?:terminated|fired|let go|laid off)/gi,
      /(?:demoted|demotion)/gi,
      /(?:written warning|final warning|verbal warning|counseling memo|write[\s-]?up)/gi,
      /(?:suspended|suspension)/gi,
      /(?:pay cut|salary reduction|reduced (?:my\s+)?(?:pay|salary|hours|bonus))/gi,
      /(?:excluded|removed|taken off|pulled off|left out)\s+(?:from\s+)?(?:meetings?|projects?|team|accounts?|clients?|presenting)/gi,
      /(?:denied|refused|rejected)\s+(?:my\s+)?(?:promotion|raise|transfer|request|leave|accommodation)/gi,
      /(?:negative|bad|unfair|false|inaccurate|low)\s+(?:performance\s+)?(?:review|evaluation|assessment|rating|bonus)/gi,
      /(?:low|reduced|no|inequitable|unequal)\s+(?:bonus|raise|merit|increase|compensation)/gi,
      /(?:moved|transferred|reassigned|relocated)\s+(?:me|my\s+(?:desk|office|team|role))/gi,
      /(?:stripped|took away|removed)\s+(?:my\s+)?(?:responsibilities|duties|authority|access|privileges)/gi,
      /(?:micromanag|surveill|monitor)\w*/gi,
      /(?:told|warned|instructed)\s+(?:me\s+)?(?:to\s+)?stop\s+documenting/gi,
      /(?:would|did|could|will)\s+not\s+(?:read|review)\s+(?:my\s+)?documentation/gi,
      /(?:gasligh|ostraciz|isolat|marginaliz|retaliat)\w*/gi,
      /(?:hostile|toxic|unbearable|intolerable)\s+(?:work\s+)?environment/gi,
      /constructive\s+discharge/gi,
      /accused\s+(?:me\s+)?of/gi,
      /(?:framed|portrayed|labeled|described)\s+(?:me\s+)?as/gi,
      /(?:called\s+me|labeled\s+me|referred\s+to\s+me\s+as)\s+/gi,
      /intimidating\s+for\s+a\s+woman/gi,
      /(?:not\s+used\s+to|unusual\s+for)\s+a\s+woman/gi,
      /(?:you(?:'re| are)\s+(?:really|pretty|very)\s+\w+\s+for\s+a\s+woman)/gi,
      /(?:gendered|sexist|discriminat\w*)\s+(?:language|comment|remark)/gi,
      /perception\s+(?:issue|problem)/gi,
      /(?:show|display)\s+more\s+emotion/gi,
      /eligible\s+for\s+rehire/gi,
      /(?:went|go(?:ing|es)?)\s+around\s+me/gi,
      /complain(?:ed|ing|s)?\s+about\s+me/gi,
      /(?:systemically|systematically|consistently)\s+excluded/gi,
      /(?:only|sole)\s+(?:senior\s+)?leader\s+(?:not|to\s+not)/gi,
      /out\s+of\s+equality/gi,
      /(?:blamed|blaming)\s+(?:me|the)/gi,
      /(?:double\s+bind|double\s+standard|catch[\s-]?22)/gi
    ],
    titleExtractor: (segment) => {
      if (/pip|performance improvement/i.test(segment)) return 'Placed on PIP';
      if (/terminat|fired|let go/i.test(segment)) return 'Terminated';
      if (/demot/i.test(segment)) return 'Demoted';
      if (/final\s+(?:written\s+)?warning/i.test(segment)) return 'Final Written Warning';
      if (/written warning|write[\s-]?up/i.test(segment)) return 'Written Warning';
      if (/suspend/i.test(segment)) return 'Suspended';
      if (/pay cut|salary reduction/i.test(segment)) return 'Pay Reduced';
      if (/exclu.*(?:meeting|present)/i.test(segment)) return 'Excluded from Meetings';
      if (/exclu/i.test(segment)) return 'Excluded from Work Activities';
      if (/denied|refused|rejected/i.test(segment)) return 'Request Denied';
      if (/review|evaluation/i.test(segment)) return 'Negative Review';
      if (/bonus|raise|merit|compensation|equality/i.test(segment)) return 'Inequitable Compensation';
      if (/stop\s+documenting|not\s+read/i.test(segment)) return 'Told to Stop Documenting';
      if (/micromanag/i.test(segment)) return 'Micromanaged';
      if (/perception|framed|blamed/i.test(segment)) return 'Framed as the Problem';
      if (/intimidating.*woman|not used to.*woman|for a woman/i.test(segment)) return 'Gendered Adverse Comments';
      if (/emotion/i.test(segment)) return 'Gendered Feedback';
      if (/eligible.*rehire|lenient/i.test(segment)) return 'Lenient Treatment of Harasser';
      if (/went around|go(?:es|ing)? around/i.test(segment)) return 'Undermined Authority';
      if (/complain.*about me/i.test(segment)) return 'False Complaints Filed';
      if (/retaliat/i.test(segment)) return 'Retaliation';
      if (/accused/i.test(segment)) return 'False Accusation';
      if (/gasligh/i.test(segment)) return 'Gaslighting';
      if (/ostraciz|isolat|marginaliz/i.test(segment)) return 'Isolation/Ostracism';
      if (/hostile.*environment/i.test(segment)) return 'Hostile Work Environment';
      return 'Adverse Action';
    },
    defaultTitle: 'Adverse Action',
    color: '#DC2626'
  },

  MILESTONE: {
    patterns: [
      /(?:promoted|promotion)/gi,
      /(?:new\s+(?:manager|supervisor|boss|team|department|role))/gi,
      /(?:policy|rule)\s+(?:changed|updated|implemented)/gi,
      /(?:investigation|audit|review)\s+(?:started|began|opened|launched|concluded)/gi,
      /(?:settlement|mediation|arbitration)\s+(?:offered|proposed|began|concluded)/gi
    ],
    defaultTitle: 'Milestone',
    color: '#6B7280'
  },

  END: {
    patterns: [
      /(?:last day|final day|ended|left|departed|quit|resigned)/gi,
      /(?:termination|separation)\s+date/gi,
      /no longer employed/gi,
      /(?:walked out|forced out|pushed out)/gi,
      /(?:gave|submitted|turned in)\s+(?:my\s+)?(?:notice|resignation|two weeks)/gi
    ],
    defaultTitle: 'Employment Ended',
    color: '#6B7280'
  }
};

// Priority order for matching — ADVERSE_ACTION before REPORTED so
// "told to stop documenting" matches adverse, not reporting
const TYPE_PRIORITY = ['START', 'END', 'ADVERSE_ACTION', 'REPORTED', 'HELP', 'MILESTONE'];

/**
 * Segment narrative into meaningful chunks that each represent
 * roughly one event or episode. Handles stream-of-consciousness text.
 */
function segmentNarrative(text) {
  if (!text) return [];

  // Step 1: Normalize whitespace
  const cleaned = text.replace(/\r\n/g, '\n').replace(/\s+/g, ' ').trim();

  // Step 2: Split on paragraph breaks first
  let segments = cleaned.split(/\n\s*\n/).filter(s => s.trim().length > 10);
  if (segments.length === 0) segments = [cleaned];

  const result = [];

  for (const para of segments) {
    // Step 3: Split on sentence-ending punctuation
    let sentences = para.split(/(?<=[.!?])\s+(?=[A-Z])/);

    // Step 4: Further split long sentences on narrative transitions
    const refined = [];
    for (const sentence of sentences) {
      if (sentence.length > 150) {
        // Split on transition phrases
        const parts = sentence.split(
          /\b(?:and then|then I|from that moment|alongside that|this was in|on top of that|in addition|at that point|at that time|around that time|around the same time|shortly after|after that|I then|I also|he also|she also|they also)\b/gi
        ).filter(s => s.trim().length > 15);

        if (parts.length > 1) {
          refined.push(...parts);
          continue;
        }

        // Split on comma + pronoun/I restart for very long segments
        if (sentence.length > 250) {
          const commaParts = sentence.split(
            /,\s+(?=(?:I |my |he |she |they |the |it |we |after |when |but |and I |and he |and she ))/i
          ).filter(s => s.trim().length > 20);

          if (commaParts.length > 1) {
            refined.push(...commaParts);
            continue;
          }
        }

        refined.push(sentence);
      } else {
        refined.push(sentence);
      }
    }

    result.push(...refined.map(s => s.trim()).filter(s => s.length > 10));
  }

  return result;
}

/**
 * Extract date from text with varying formats and confidence levels
 * Returns { date: 'YYYY-MM-DD' | null, confidence: 'exact'|'approximate'|'relative'|'unknown' }
 */
function extractDate(text, referenceDate = null) {
  if (!text) return { date: null, confidence: 'unknown' };

  // Pattern 1: Full date — "January 15, 2024" or "Jan 15, 2024"
  const fullDate = text.match(
    /\b((?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+\d{1,2},?\s+\d{4})\b/i
  );
  if (fullDate) {
    const parsed = new Date(fullDate[1]);
    if (!isNaN(parsed.getTime())) {
      return { date: parsed.toISOString().split('T')[0], confidence: 'exact' };
    }
  }

  // Pattern 2: MM/DD/YYYY or MM-DD-YYYY
  const slashDate = text.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/);
  if (slashDate) {
    const year = slashDate[3].length === 2 ? '20' + slashDate[3] : slashDate[3];
    const parsed = new Date(`${year}-${slashDate[1].padStart(2, '0')}-${slashDate[2].padStart(2, '0')}`);
    if (!isNaN(parsed.getTime())) {
      return { date: parsed.toISOString().split('T')[0], confidence: 'exact' };
    }
  }

  // Pattern 3: "Month YYYY" — "September 2024"
  const monthYear = text.match(
    /\b(?:in\s+)?(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/i
  );
  if (monthYear) {
    const monthIndex = new Date(`${monthYear[1]} 1, 2000`).getMonth();
    const approxDate = new Date(parseInt(monthYear[2]), monthIndex, 15);
    return { date: approxDate.toISOString().split('T')[0], confidence: 'approximate' };
  }

  // Pattern 4: "in December or January" — take first month, use reference year
  const monthOnly = text.match(
    /\b(?:in|around|during|by)\s+(January|February|March|April|May|June|July|August|September|October|November|December)\b/i
  );
  if (monthOnly) {
    const refYear = referenceDate ? new Date(referenceDate).getFullYear() : new Date().getFullYear();
    const monthIndex = new Date(`${monthOnly[1]} 1, 2000`).getMonth();
    const approxDate = new Date(refYear, monthIndex, 15);
    return { date: approxDate.toISOString().split('T')[0], confidence: 'approximate' };
  }

  // Pattern 5: "end of year" / "year-end" / "midyear"
  const yearEnd = text.match(/(?:end of (?:the )?year|year[\s-]end)\s*(?:(\d{4}))?/i);
  if (yearEnd) {
    const year = yearEnd[1] || (referenceDate ? new Date(referenceDate).getFullYear() : new Date().getFullYear());
    return { date: `${year}-12-15`, confidence: 'approximate' };
  }

  const midYear = text.match(/(?:mid[\s-]?year|middle of (?:the )?year)\s*(?:(\d{4}))?/i);
  if (midYear) {
    const year = midYear[1] || (referenceDate ? new Date(referenceDate).getFullYear() : new Date().getFullYear());
    return { date: `${year}-06-15`, confidence: 'approximate' };
  }

  // Pattern 6: Relative time references (flag but can't compute precisely)
  if (/\b(?:weeks?|months?|days?)\s+(?:later|after|before|earlier)\b/i.test(text)) {
    return { date: null, confidence: 'relative' };
  }

  return { date: null, confidence: 'unknown' };
}

/**
 * Count how many distinct events a segment describes.
 * Used to flag segments for "break apart" feature.
 */
function countDistinctEvents(text) {
  if (!text) return 1;
  let count = 1;

  // Multiple action-verb conjunctions
  const actionConjunctions = text.match(
    /\b(?:and then|then I|I also|he also|she also|they also|also|on top of that|in addition|furthermore|additionally|moreover|plus)\s+(?:I|he|she|they|my|the|was|were|had|did)\b/gi
  );
  if (actionConjunctions) count += actionConjunctions.length;

  // Multiple distinct date references
  const dateRefs = text.match(
    /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+(?:\d{1,2},?\s+)?\d{4}\b/gi
  );
  if (dateRefs && dateRefs.length > 1) count = Math.max(count, dateRefs.length);

  return Math.min(count, 5);
}

/**
 * Split a segment into separate sub-events for "Break Apart" feature
 */
function splitAnchorSegment(anchorText) {
  if (!anchorText) return [anchorText];

  // Try segmentNarrative first
  const subSegments = segmentNarrative(anchorText);
  if (subSegments.length > 1) return subSegments;

  // Fallback: split on conjunctions with action verbs
  const parts = anchorText.split(
    /\b(?:and then|then|also|and I|and he|and she|and they)\b/gi
  ).filter(s => s.trim().length > 15);

  if (parts.length > 1) return parts.map(p => p.trim());

  return [anchorText];
}

/**
 * Extract actors from narrative text using existing actor-detector
 */
function extractActorsFromNarrative(text) {
  if (!text) return [];
  try {
    return detectActors(text);
  } catch (e) {
    console.error('[anchor-generator] Actor extraction error:', e.message);
    return [];
  }
}

/**
 * Generate anchors from narrative context — CORE FUNCTION
 * Creates multiple anchors per type, each for a distinct event
 */
function generateAnchorsFromContext(narrativeText, existingAnchors = []) {
  if (!narrativeText || typeof narrativeText !== 'string') {
    return [];
  }

  const generated = [];
  const segments = segmentNarrative(narrativeText);
  const usedSegments = new Set();

  for (const segment of segments) {
    // Try each type in priority order — first match wins for this segment
    let matched = false;

    for (const anchorType of TYPE_PRIORITY) {
      if (matched) break;

      const config = ANCHOR_PATTERNS[anchorType];
      for (const pattern of config.patterns) {
        const testRegex = new RegExp(pattern.source, pattern.flags);
        if (testRegex.test(segment)) {
          // Content-based dedup: skip if near-identical segment already used
          const segmentKey = segment.trim().toLowerCase().slice(0, 80);
          if (usedSegments.has(segmentKey)) {
            matched = true;
            break;
          }

          // Skip if an existing user-edited anchor covers this text
          const existsInEdited = existingAnchors.some(a =>
            a.user_edited &&
            a.source_context &&
            segment.toLowerCase().includes(a.source_context.toLowerCase().slice(0, 40))
          );
          if (existsInEdited) {
            matched = true;
            break;
          }

          // Extract date
          const { date: anchorDate, confidence } = extractDate(segment);

          // Generate specific title
          const title = config.titleExtractor
            ? config.titleExtractor(segment)
            : config.defaultTitle;

          // Detect if segment contains multiple events
          const eventCount = countDistinctEvents(segment);

          generated.push({
            id: uuidv4(),
            anchor_type: anchorType,
            title: title,
            description: segment.trim().slice(0, 500),
            anchor_date: anchorDate,
            date_confidence: confidence,
            what_happened: segment.trim(),
            is_auto_generated: true,
            user_edited: false,
            source_context: segment.trim().slice(0, 200),
            contains_multiple_events: eventCount > 1 ? 1 : 0,
            event_count: eventCount
          });

          usedSegments.add(segmentKey);
          matched = true;
          break;
        }
      }
    }
  }

  // Sort by date (dateless at end, preserving narrative order among dateless)
  generated.sort((a, b) => {
    if (!a.anchor_date && !b.anchor_date) return 0;
    if (!a.anchor_date) return 1;
    if (!b.anchor_date) return -1;
    return new Date(a.anchor_date) - new Date(b.anchor_date);
  });

  generated.forEach((anchor, i) => {
    anchor.sort_order = i;
  });

  return generated;
}

/**
 * Generate anchors from incidents
 */
function generateAnchorsFromIncidents(incidents) {
  if (!incidents || !Array.isArray(incidents)) return [];
  const anchors = [];

  for (const incident of incidents) {
    let anchorType = 'MILESTONE';

    if (incident.incident_type === 'PROTECTED_ACTIVITY' || incident.subtype === 'complaint') {
      anchorType = 'REPORTED';
    } else if (incident.incident_type === 'ADVERSE_ACTION') {
      anchorType = 'ADVERSE_ACTION';
    } else if (incident.subtype === 'termination') {
      anchorType = 'END';
    }

    const severity = incident.computed_severity || incident.base_severity;
    if (severity === 'severe' || severity === 'egregious' || anchorType !== 'MILESTONE') {
      anchors.push({
        id: uuidv4(),
        anchor_type: anchorType,
        title: incident.title,
        description: incident.description,
        anchor_date: incident.incident_date?.split('T')[0],
        date_confidence: incident.date_confidence || 'exact',
        what_happened: incident.description,
        severity: severity,
        is_auto_generated: true,
        source_incident_id: incident.id,
        contains_multiple_events: 0,
        event_count: 1
      });
    }
  }

  return anchors;
}

/**
 * Generate anchors from protected activities in documents
 */
function generateAnchorsFromDocuments(documents) {
  if (!documents || !Array.isArray(documents)) return [];
  const anchors = [];

  for (const doc of documents) {
    if (doc.evidence_type === 'PROTECTED_ACTIVITY') {
      anchors.push({
        id: uuidv4(),
        anchor_type: 'REPORTED',
        title: 'Protected Activity: ' + (doc.filename || 'Report'),
        description: doc.extracted_text?.slice(0, 200),
        anchor_date: doc.document_date?.split('T')[0],
        date_confidence: doc.document_date_confidence,
        is_auto_generated: true,
        source_document_id: doc.id,
        contains_multiple_events: 0,
        event_count: 1
      });
    }

    if (doc.evidence_type === 'ADVERSE_ACTION') {
      anchors.push({
        id: uuidv4(),
        anchor_type: 'ADVERSE_ACTION',
        title: doc.filename || 'Adverse Action',
        description: doc.extracted_text?.slice(0, 200),
        anchor_date: doc.document_date?.split('T')[0],
        date_confidence: doc.document_date_confidence,
        is_auto_generated: true,
        source_document_id: doc.id,
        contains_multiple_events: 0,
        event_count: 1
      });
    }
  }

  return anchors;
}

/**
 * Simple Jaccard-like text similarity
 */
function textSimilarity(a, b) {
  if (!a || !b) return 0;
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  const intersection = new Set([...wordsA].filter(w => wordsB.has(w)));
  const union = new Set([...wordsA, ...wordsB]);
  return union.size > 0 ? intersection.size / union.size : 0;
}

/**
 * Merge and deduplicate anchors from multiple sources
 * Uses content similarity rather than just type+date
 */
function mergeAnchors(contextAnchors, incidentAnchors, documentAnchors) {
  const all = [...contextAnchors, ...incidentAnchors, ...documentAnchors];
  const merged = [];

  for (const anchor of all) {
    const existing = merged.find(m => {
      if (m.anchor_type !== anchor.anchor_type) return false;

      // Both have dates — merge if within 3 days
      if (m.anchor_date && anchor.anchor_date) {
        const daysDiff = Math.abs(
          (new Date(m.anchor_date) - new Date(anchor.anchor_date)) / (1000 * 60 * 60 * 24)
        );
        return daysDiff <= 3;
      }

      // Both dateless — merge only if very similar text
      if (!m.anchor_date && !anchor.anchor_date) {
        const similarity = textSimilarity(
          m.description || m.what_happened || '',
          anchor.description || anchor.what_happened || ''
        );
        return similarity > 0.6;
      }

      // One has date, one doesn't — don't merge
      return false;
    });

    if (!existing) {
      merged.push(anchor);
    } else {
      // Enrich existing anchor with new data
      if (!existing.description && anchor.description) existing.description = anchor.description;
      if (!existing.anchor_date && anchor.anchor_date) {
        existing.anchor_date = anchor.anchor_date;
        existing.date_confidence = anchor.date_confidence;
      }
      if (!existing.source_incident_id && anchor.source_incident_id) {
        existing.source_incident_id = anchor.source_incident_id;
      }
      if (!existing.source_document_id && anchor.source_document_id) {
        existing.source_document_id = anchor.source_document_id;
      }
    }
  }

  // Sort by date, dateless at end
  merged.sort((a, b) => {
    if (!a.anchor_date && !b.anchor_date) return 0;
    if (!a.anchor_date) return 1;
    if (!b.anchor_date) return -1;
    return new Date(a.anchor_date) - new Date(b.anchor_date);
  });

  merged.forEach((anchor, i) => {
    anchor.sort_order = i;
  });

  return merged;
}

/**
 * Get anchor color by type
 */
function getAnchorColor(type) {
  const config = ANCHOR_PATTERNS[type];
  return config ? config.color : '#6B7280';
}

module.exports = {
  generateAnchorsFromContext,
  generateAnchorsFromIncidents,
  generateAnchorsFromDocuments,
  mergeAnchors,
  getAnchorColor,
  splitAnchorSegment,
  segmentNarrative,
  extractDate,
  extractActorsFromNarrative,
  ANCHOR_PATTERNS,
  TYPE_PRIORITY
};
