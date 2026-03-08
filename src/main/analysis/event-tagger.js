/**
 * Event Tagger — auto-suggest tags from event text
 * Regex-based classification of event title + description into tag vocabulary
 */

const TAG_RULES = [
  {
    tag: 'sexual_harassment',
    patterns: [
      /sexual(ly)?\s+(harass|assault|abuse|misconduct|advance)/i,
      /groped|fondled|propositioned|unwanted\s+(touch|contact|kiss)/i,
      /quid\s*pro\s*quo/i,
      /sexual\s+favor/i
    ]
  },
  {
    tag: 'gender_harassment',
    patterns: [
      /gender(\s*-?\s*based)?\s+(harass|discriminat|bias)/i,
      /\b(sweetheart|honey|darling|babe|little\s+lady)\b/i,
      /gendered\s+(language|comment|remark|slur)/i,
      /\b(sexist|misogyn)/i
    ]
  },
  {
    tag: 'hostile_environment',
    patterns: [
      /hostile\s+(work\s*)?environment/i,
      /pervasive(ly)?\s+(hostile|offensive|abusive)/i,
      /severe\s+(or|and)\s+pervasive/i,
      /toxic\s+(work\s*)?(environment|culture)/i,
      /pattern\s+of\s+(harassment|abuse|misconduct)/i
    ]
  },
  {
    tag: 'protected_activity',
    patterns: [
      /\b(reported|complained|filed|raised)\b.*\b(hr|human\s+resources|eeoc|complaint|grievance|charge)/i,
      /\bfiled\b.*\b(charge|complaint|grievance|lawsuit)/i,
      /\breported\b.*\b(discriminat|harass|retaliat|misconduct)/i,
      /\bwhistleblow/i,
      /\bprotected\s+activity/i,
      /\beeoc\b/i,
      /\bformal\s+complaint/i,
      /\binternal\s+complaint/i,
      /\bopposed\b.*\b(discriminat|harass|illegal)/i
    ]
  },
  {
    tag: 'adverse_action',
    patterns: [
      /\b(terminat|fired|demoted|suspended|written\s+warning|pip)\b/i,
      /\b(transfer|reassign|reduc)\b.*\b(pay|hours|responsibilit)/i,
      /\bperformance\s+improvement\s+plan\b/i,
      /\bdisciplin(ed|ary)\b/i,
      /\b(denied|refused)\b.*\b(promot|raise|transfer|benefit|leave)/i,
      /\b(excluded|removed)\b.*\b(meeting|project|team|role)/i,
      /\bconstructive\s+discharge/i,
      /\badverse\s+(employment\s+)?action/i,
      /\bnegative\s+performance\s+review/i
    ]
  },
  {
    tag: 'retaliation',
    patterns: [
      /\bretaliat/i,
      /\b(after|following|since)\b.*\b(report|complain|fil)/i,
      /\bpunish(ed|ment)?\b.*\b(report|complain|fil)/i,
      /\breprisal/i,
      /\bstop\s+documenting/i,
      /\bdissuade/i
    ]
  },
  {
    tag: 'exclusion',
    patterns: [
      /\b(excluded|shut\s+out|left\s+out|frozen\s+out)\b/i,
      /\b(denied\s+access|removed\s+from)\b.*\b(meeting|project|team|group)/i,
      /\bisolat(ed|ion)\b/i,
      /\bmarginali[sz](ed|ation)\b/i,
      /\bostraciz/i
    ]
  },
  {
    tag: 'pay_discrimination',
    patterns: [
      /\bpay\s+(discriminat|disparity|gap|inequit)/i,
      /\bunequal\s+pay/i,
      /\b(less|lower)\b.*\b(pay|salary|compensation|wage)\b/i,
      /\bequal\s+pay\s+act/i,
      /\bwage\s+(theft|discriminat)/i
    ]
  },
  {
    tag: 'help_request',
    patterns: [
      /\b(asked|requested|sought)\b.*\b(help|assistance|accommodation|support)/i,
      /\baccommodation\s+request/i,
      /\bada\s+request/i,
      /\basked\s+(for\s+)?help/i,
      /\breasonable\s+accommodation/i
    ]
  },
  {
    tag: 'employment_start',
    patterns: [
      /\b(started|began|hired|onboard|commenced)\b.*\b(work|employ|position|role|job)\b/i,
      /\bfirst\s+day/i,
      /\bdate\s+of\s+hire/i,
      /\bemployment\s+start/i
    ]
  },
  {
    tag: 'employment_end',
    patterns: [
      /\b(terminat|fired|laid\s+off|let\s+go|resign|quit|separated)\b/i,
      /\blast\s+day\b.*\b(work|employ)/i,
      /\bend\s+of\s+employment/i,
      /\bseparation\b/i,
      /\bconstructive\s+discharge/i
    ]
  }
];

/**
 * Suggest tags for an event based on its text content
 * @param {string} title - Event title
 * @param {string} description - Event description
 * @param {string} whatHappened - Detailed narrative
 * @returns {string[]} Array of suggested tag strings
 */
function suggestTags(title, description, whatHappened) {
  const text = [title, description, whatHappened].filter(Boolean).join(' ');
  if (!text.trim()) return [];

  const matched = [];
  for (const rule of TAG_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(text)) {
        matched.push(rule.tag);
        break; // one match per tag is enough
      }
    }
  }

  return [...new Set(matched)];
}

/**
 * Get full tag vocabulary with display metadata
 */
function getTagVocabulary() {
  return [
    { tag: 'sexual_harassment', label: 'Sexual Harassment', color: '#DC2626' },
    { tag: 'gender_harassment', label: 'Gender Harassment', color: '#F97316' },
    { tag: 'protected_activity', label: 'Protected Activity', color: '#8B5CF6' },
    { tag: 'adverse_action', label: 'Adverse Action', color: '#7C3AED' },
    { tag: 'retaliation', label: 'Retaliation', color: '#991B1B' },
    { tag: 'exclusion', label: 'Exclusion', color: '#EAB308' },
    { tag: 'pay_discrimination', label: 'Pay Discrimination', color: '#16A34A' },
    { tag: 'hostile_environment', label: 'Hostile Environment', color: '#EC4899' },
    { tag: 'help_request', label: 'Help Request', color: '#14B8A6' },
    { tag: 'employment_start', label: 'Employment Start', color: '#3B82F6' },
    { tag: 'employment_end', label: 'Employment End', color: '#1F2937' }
  ];
}

module.exports = { suggestTags, getTagVocabulary };
