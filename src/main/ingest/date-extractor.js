const chrono = require('chrono-node');

// Patterns that indicate a date label (the date following these is likely the document date)
const DATE_LABEL_PATTERNS = [
  /\bdate\s*[:;]\s*/i,
  /\bdated\s*[:;]?\s*/i,
  /\beffective\s+date\s*[:;]\s*/i,
  /\bsent\s*[:;]\s*/i,
  /\breceived\s*[:;]\s*/i,
  /\bfiled\s*[:;]\s*/i,
  /\bissued?\s*[:;]\s*/i,
  /\bwritten\s*[:;]\s*/i,
  /\bsigned\s*[:;]\s*/i,
  /\bon\s+or\s+about\s*/i,
  /\bincident\s+date\s*[:;]\s*/i,
  /\boccurred?\s*[:;]?\s+on\s*/i
];

/**
 * Extract dates from text using chrono-node NLP.
 * Prioritizes dates found near "Date:", "Sent:", etc. labels and in document headers.
 * Returns array of { date, text, confidence, index, priority }
 */
function extractDatesFromText(text) {
  if (!text || text.trim().length === 0) return [];

  try {
    const results = chrono.parse(text);
    const dates = [];
    const seen = new Set();

    for (const result of results) {
      const date = result.start.date();
      if (!date || isNaN(date.getTime())) continue;

      const isoDate = date.toISOString();

      // Deduplicate same dates
      const dateKey = isoDate.slice(0, 10);
      if (seen.has(dateKey)) continue;
      seen.add(dateKey);

      // Determine confidence based on how specific the parse was
      const confidence = assessDateConfidence(result);

      // Check if this date appears near a date label (higher priority)
      const contextStart = Math.max(0, result.index - 40);
      const precedingText = text.slice(contextStart, result.index);
      const hasDateLabel = DATE_LABEL_PATTERNS.some(p => p.test(precedingText));

      // Dates in first 500 chars are likely header dates
      const isInHeader = result.index < 500;

      // Priority scoring: labeled dates > header dates > body dates
      let priority = 0;
      if (hasDateLabel) priority = 3;
      else if (isInHeader && confidence === 'exact') priority = 2;
      else if (isInHeader) priority = 1;

      dates.push({
        date: isoDate,
        text: result.text,
        confidence,
        index: result.index,
        priority
      });
    }

    // Sort by priority (highest first), then by position in text
    dates.sort((a, b) => b.priority - a.priority || a.index - b.index);

    return dates;
  } catch (e) {
    return [];
  }
}

/**
 * Assess confidence of a parsed date based on specificity
 */
function assessDateConfidence(result) {
  const knownFields = result.start.knownValues || {};
  const hasYear = result.start.isCertain('year');
  const hasMonth = result.start.isCertain('month');
  const hasDay = result.start.isCertain('day');

  if (hasYear && hasMonth && hasDay) return 'exact';
  if (hasYear && hasMonth) return 'approximate';
  return 'inferred';
}

module.exports = { extractDatesFromText };
