const chrono = require('chrono-node');

/**
 * Extract dates from text using chrono-node NLP.
 * Returns array of { date, text, confidence, index }
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

      dates.push({
        date: isoDate,
        text: result.text,
        confidence,
        index: result.index
      });
    }

    // Sort by position in text (earlier mentions tend to be more important)
    dates.sort((a, b) => a.index - b.index);

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
