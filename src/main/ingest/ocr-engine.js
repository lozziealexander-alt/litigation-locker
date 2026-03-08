const Tesseract = require('tesseract.js');
const sharp = require('sharp');

let worker = null;

/**
 * Get or create Tesseract worker configured for document OCR.
 * Uses LSTM engine + document-optimized parameters.
 */
async function getWorker() {
  if (!worker) {
    worker = await Tesseract.createWorker('eng', Tesseract.OEM.LSTM_ONLY);
    // Set page segmentation to AUTO (best for mixed document layouts)
    await worker.setParameters({
      tessedit_pageseg_mode: Tesseract.PSM.AUTO,
      // Preserve interword spaces
      preserve_interword_spaces: '1',
    });
    console.log('[OCR] Worker initialized with LSTM engine');
  }
  return worker;
}

/**
 * Preprocess image for document OCR.
 * Upscales to ensure Tesseract has enough resolution,
 * converts to high-contrast grayscale.
 */
async function preprocessForDocument(buffer) {
  const meta = await sharp(buffer).metadata();
  const width = meta.width || 0;
  const height = meta.height || 0;

  console.log(`[OCR] Input image: ${width}x${height}, format=${meta.format}`);

  // Target at least 300 DPI equivalent — upscale small images aggressively
  const targetWidth = Math.max(2500, width);

  // Strategy: grayscale → normalize contrast → sharpen → upscale
  const processed = await sharp(buffer)
    .grayscale()
    .normalize()            // Full-range contrast stretch
    .sharpen({ sigma: 1.2 })
    .resize({ width: targetWidth, withoutEnlargement: false })
    .png({ compressionLevel: 0 }) // No compression for quality
    .toBuffer();

  return processed;
}

/**
 * Additional preprocessing: binarize for poor-quality scans/photos.
 */
async function preprocessBinarized(buffer) {
  const meta = await sharp(buffer).metadata();
  const targetWidth = Math.max(2500, meta.width || 0);

  return sharp(buffer)
    .grayscale()
    .normalize()
    .threshold(128)  // Convert to pure black/white
    .resize({ width: targetWidth, withoutEnlargement: false })
    .png({ compressionLevel: 0 })
    .toBuffer();
}

/**
 * Run OCR on an image buffer.
 * Tries standard and binarized preprocessing, picks best result.
 */
async function runOcr(buffer, mimeType) {
  try {
    const w = await getWorker();

    // Try standard preprocessing first
    const standardBuf = await preprocessForDocument(buffer);
    const result1 = await w.recognize(standardBuf);
    let bestText = result1.data.text || '';
    let bestConfidence = result1.data.confidence || 0;
    console.log(`[OCR] Standard pass: confidence=${bestConfidence.toFixed(1)}%, chars=${bestText.length}`);

    // If confidence is low, try binarized version
    if (bestConfidence < 75) {
      try {
        const binarizedBuf = await preprocessBinarized(buffer);
        // Switch to SINGLE_BLOCK mode for binarized (cleaner layout assumption)
        await w.setParameters({ tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK });
        const result2 = await w.recognize(binarizedBuf);
        // Restore AUTO mode
        await w.setParameters({ tessedit_pageseg_mode: Tesseract.PSM.AUTO });

        const conf2 = result2.data.confidence || 0;
        const text2 = result2.data.text || '';
        console.log(`[OCR] Binarized pass: confidence=${conf2.toFixed(1)}%, chars=${text2.length}`);

        if (conf2 > bestConfidence) {
          bestConfidence = conf2;
          bestText = text2;
        }
      } catch (e) {
        console.warn('[OCR] Binarized pass failed:', e.message);
      }
    }

    console.log(`[OCR] Best result: confidence=${bestConfidence.toFixed(1)}%, chars=${bestText.length}`);

    // Accept anything with some text — even low-confidence OCR is better than nothing
    if (bestConfidence < 5 || bestText.trim().length < 5) {
      return '';
    }

    // Clean up OCR artifacts
    let cleaned = bestText.trim();
    // Remove lines that are just whitespace, single chars, or common noise
    cleaned = cleaned
      .split('\n')
      .filter(line => {
        const t = line.trim();
        if (t.length <= 1) return false;
        // Filter lines that are just punctuation/symbols
        if (/^[^a-zA-Z0-9]*$/.test(t)) return false;
        return true;
      })
      .join('\n');
    // Collapse multiple blank lines
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    // Fix common OCR errors
    cleaned = cleaned
      .replace(/\|/g, 'l')   // pipe → l
      .replace(/0(?=[a-z])/g, 'o')  // zero before lowercase → o
      .replace(/\s{2,}/g, ' '); // collapse multiple spaces

    return cleaned;
  } catch (e) {
    console.error('[OCR] Failed:', e.message);
    return '';
  }
}

/**
 * Terminate worker when app closes
 */
async function terminateOcr() {
  if (worker) {
    await worker.terminate();
    worker = null;
  }
}

module.exports = { runOcr, terminateOcr };
