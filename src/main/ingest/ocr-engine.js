const Tesseract = require('tesseract.js');
const sharp = require('sharp');

let worker = null;

/**
 * Get or create Tesseract worker (reuse across calls)
 */
async function getWorker() {
  if (!worker) {
    worker = await Tesseract.createWorker('eng');
  }
  return worker;
}

/**
 * Preprocess image for better OCR accuracy.
 * Converts to grayscale, increases contrast, and normalizes size.
 */
async function preprocessImage(buffer) {
  return sharp(buffer)
    .grayscale()
    .normalize()
    .sharpen()
    .resize({ width: 2000, withoutEnlargement: true })
    .png()
    .toBuffer();
}

/**
 * Run OCR on an image buffer.
 * Returns extracted text string.
 */
async function runOcr(buffer, mimeType) {
  try {
    // Preprocess image for better results
    const processed = await preprocessImage(buffer);

    const w = await getWorker();
    const { data: { text, confidence } } = await w.recognize(processed);

    // Only return text if confidence is reasonable
    if (confidence < 20) {
      return '';
    }

    return text.trim();
  } catch (e) {
    console.error('OCR failed:', e.message);
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
