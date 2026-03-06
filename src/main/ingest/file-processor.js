const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const mime = require('mime-types');

const { extractMetadata } = require('./metadata-extractor');
const { extractDatesFromText } = require('./date-extractor');
const { classifyEvidence } = require('./evidence-classifier');
const { runOcr } = require('./ocr-engine');
const { encrypt } = require('../crypto/vault');

/**
 * Process a single file through the full ingest pipeline.
 * Returns a document record ready for DB insertion.
 */
async function processFile(filePath, caseKey) {
  // Validate file exists and is accessible
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const stats = fs.statSync(filePath);
  if (!stats.isFile()) {
    throw new Error(`Not a file: ${filePath}`);
  }

  const rawContent = fs.readFileSync(filePath);

  const filename = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mimeType = mime.lookup(filePath) || 'application/octet-stream';
  const sha256 = crypto.createHash('sha256').update(rawContent).digest('hex');
  const docId = uuidv4();

  console.log(`[processFile] ${filename} (${mimeType}, ${stats.size} bytes)`);

  // Encrypt the raw file content
  const encryptedContent = encrypt(rawContent, caseKey);

  // Extract metadata based on file type
  let metadata;
  try {
    metadata = await extractMetadata(rawContent, ext, mimeType, filePath);
  } catch (metaErr) {
    console.warn(`[processFile] metadata extraction failed for ${filename}:`, metaErr.message);
    metadata = { raw: {}, documentDate: null, extractedText: '' };
  }

  // Get text content: from extraction or OCR
  let extractedText = metadata.extractedText || '';
  let ocrText = '';

  const isImage = mimeType.startsWith('image/');
  if (isImage && !extractedText) {
    try {
      ocrText = await runOcr(rawContent, mimeType);
    } catch (ocrErr) {
      console.warn(`[processFile] OCR failed for ${filename}:`, ocrErr.message);
      ocrText = '';
    }
  }

  // Combine all available text for date extraction
  const allText = [extractedText, ocrText].filter(Boolean).join('\n');

  // Extract dates from text using NLP
  const contentDates = extractDatesFromText(allText);

  // Determine the primary document date (best guess)
  const documentDate = pickBestDate(metadata, contentDates, stats);

  // Classify evidence type using multi-layer inference
  const classification = classifyEvidence({
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
    evidence_type: classification.primary,
    evidence_confidence: classification.confidence === 'high' ? 0.9 :
                         classification.confidence === 'medium' ? 0.6 :
                         classification.confidence === 'low' ? 0.3 : 0.1,
    evidence_secondary: classification.secondary,
    evidence_scores_json: JSON.stringify(classification.allScores)
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
 * Process multiple files (batch ingest).
 * Splits work: non-image files process in parallel, image files
 * (which need the shared Tesseract worker) process sequentially.
 */
async function processFiles(filePaths, caseKey) {
  const results = [];
  const errors = [];

  // Split into image vs non-image for smarter concurrency
  const imagePaths = [];
  const otherPaths = [];

  for (const fp of filePaths) {
    const m = mime.lookup(fp) || 'application/octet-stream';
    if (m.startsWith('image/')) {
      imagePaths.push(fp);
    } else {
      otherPaths.push(fp);
    }
  }

  // Process non-image files in parallel (no shared OCR worker contention)
  if (otherPaths.length > 0) {
    const settled = await Promise.allSettled(
      otherPaths.map(fp => processFile(fp, caseKey))
    );
    for (let i = 0; i < settled.length; i++) {
      if (settled[i].status === 'fulfilled') {
        results.push(settled[i].value);
      } else {
        const reason = settled[i].reason;
        console.error('[processFiles] error on', otherPaths[i], reason?.message || reason);
        errors.push({ file: path.basename(otherPaths[i]), error: reason?.message || String(reason) });
      }
    }
  }

  // Process image files sequentially (shared Tesseract worker)
  for (const fp of imagePaths) {
    try {
      const doc = await processFile(fp, caseKey);
      results.push(doc);
    } catch (err) {
      console.error('[processFiles] error on', fp, err.message);
      errors.push({ file: path.basename(fp), error: err.message });
    }
  }

  return { documents: results, errors };
}

module.exports = { processFile, processFiles };
