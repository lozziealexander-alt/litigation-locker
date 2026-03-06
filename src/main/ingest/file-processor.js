const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const mime = require('mime-types');

const { extractMetadata } = require('./metadata-extractor');
const { extractDatesFromText } = require('./date-extractor');
const { detectEvidenceType } = require('./evidence-detector');
const { runOcr } = require('./ocr-engine');
const { encrypt } = require('../crypto/vault');

/**
 * Process a single file through the full ingest pipeline.
 * Returns a document record ready for DB insertion.
 */
async function processFile(filePath, caseKey) {
  const stats = fs.statSync(filePath);
  const rawContent = fs.readFileSync(filePath);

  const filename = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mimeType = mime.lookup(filePath) || 'application/octet-stream';
  const sha256 = crypto.createHash('sha256').update(rawContent).digest('hex');
  const docId = uuidv4();

  // Encrypt the raw file content
  const encryptedContent = encrypt(rawContent, caseKey);

  // Extract metadata based on file type
  const metadata = await extractMetadata(rawContent, ext, mimeType, filePath);

  // Get text content: from extraction or OCR
  let extractedText = metadata.extractedText || '';
  let ocrText = '';

  const isImage = mimeType.startsWith('image/');
  if (isImage && !extractedText) {
    ocrText = await runOcr(rawContent, mimeType);
  }

  // Combine all available text for date extraction
  const allText = [extractedText, ocrText].filter(Boolean).join('\n');

  // Extract dates from text using NLP
  const contentDates = extractDatesFromText(allText);

  // Determine the primary document date (best guess)
  const documentDate = pickBestDate(metadata, contentDates, stats);

  // Detect evidence type from content signals
  const evidenceType = detectEvidenceType({
    filename,
    ext,
    mimeType,
    extractedText: allText,
    metadata: metadata.raw,
    contentDates
  });

  return {
    id: docId,
    filename,
    original_path: filePath,
    file_type: mimeType,
    file_size: stats.size,
    sha256_hash: sha256,
    encrypted_content: encryptedContent,
    metadata_json: JSON.stringify(metadata.raw || {}),
    file_created_at: stats.birthtime.toISOString(),
    file_modified_at: stats.mtime.toISOString(),
    document_date: documentDate.date,
    document_date_confidence: documentDate.confidence,
    content_dates_json: JSON.stringify(contentDates),
    extracted_text: extractedText || null,
    ocr_text: ocrText || null,
    evidence_type: evidenceType
  };
}

/**
 * Pick the best date from all available sources.
 * Priority: document metadata date > email date > NLP-extracted date > file date
 */
function pickBestDate(metadata, contentDates, stats) {
  // 1. Document metadata date (EXIF, PDF creation, email date)
  if (metadata.documentDate) {
    return { date: metadata.documentDate, confidence: 'exact' };
  }

  // 2. First NLP-extracted date from content
  if (contentDates.length > 0) {
    const best = contentDates[0];
    return { date: best.date, confidence: best.confidence || 'inferred' };
  }

  // 3. File modification date as fallback
  if (stats.mtime) {
    return { date: stats.mtime.toISOString(), confidence: 'approximate' };
  }

  return { date: null, confidence: 'undated' };
}

/**
 * Process multiple files (batch ingest)
 */
async function processFiles(filePaths, caseKey) {
  const results = [];
  const errors = [];

  for (const filePath of filePaths) {
    try {
      const doc = await processFile(filePath, caseKey);
      results.push(doc);
    } catch (err) {
      errors.push({ file: filePath, error: err.message });
    }
  }

  return { documents: results, errors };
}

module.exports = { processFile, processFiles };
