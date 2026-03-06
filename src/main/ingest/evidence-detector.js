/**
 * Evidence type detection — thin wrapper that delegates to the
 * multi-layer inference classifier (evidence-classifier.js).
 *
 * Backward-compatible: still exports detectEvidenceType() which
 * returns a single type string. Consumers that need confidence
 * scores should import classifyEvidence from evidence-classifier directly.
 */
const { detectEvidenceType, classifyEvidence, EVIDENCE_TYPES } = require('./evidence-classifier');

module.exports = { detectEvidenceType, classifyEvidence, EVIDENCE_TYPES };
