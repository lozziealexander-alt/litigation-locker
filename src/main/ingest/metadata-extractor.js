const exifReader = require('exif-reader');
const sharp = require('sharp');
const pdfParse = require('pdf-parse');
const { simpleParser } = require('mailparser');

/**
 * Extract metadata from a file based on its type.
 * Returns { raw, documentDate, extractedText }
 */
async function extractMetadata(buffer, ext, mimeType, filePath) {
  if (mimeType.startsWith('image/')) {
    return extractImageMetadata(buffer);
  }

  if (mimeType === 'application/pdf' || ext === '.pdf') {
    return extractPdfMetadata(buffer);
  }

  if (ext === '.eml' || mimeType === 'message/rfc822') {
    return extractEmailMetadata(buffer);
  }

  if (isTextFile(ext, mimeType)) {
    return extractTextMetadata(buffer);
  }

  return { raw: {}, documentDate: null, extractedText: '' };
}

/**
 * Extract EXIF data from images
 */
async function extractImageMetadata(buffer) {
  try {
    const metadata = await sharp(buffer).metadata();
    let exif = {};
    let documentDate = null;

    if (metadata.exif) {
      try {
        exif = exifReader(metadata.exif);
        // EXIF date fields
        const dateOriginal = exif?.exif?.DateTimeOriginal;
        const dateCreated = exif?.exif?.DateTimeDigitized;
        const gpsDate = exif?.gps?.GPSDateStamp;

        if (dateOriginal) {
          documentDate = new Date(dateOriginal).toISOString();
        } else if (dateCreated) {
          documentDate = new Date(dateCreated).toISOString();
        } else if (gpsDate) {
          documentDate = new Date(gpsDate).toISOString();
        }
      } catch (e) {
        // EXIF parsing can fail on malformed data
      }
    }

    return {
      raw: {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        space: metadata.space,
        channels: metadata.channels,
        hasAlpha: metadata.hasAlpha,
        exif: exif
      },
      documentDate,
      extractedText: ''
    };
  } catch (e) {
    return { raw: {}, documentDate: null, extractedText: '' };
  }
}

/**
 * Extract text and metadata from PDFs
 */
async function extractPdfMetadata(buffer) {
  try {
    const data = await pdfParse(buffer);
    const info = data.info || {};
    let documentDate = null;

    // PDF date fields
    if (info.CreationDate) {
      documentDate = parsePdfDate(info.CreationDate);
    } else if (info.ModDate) {
      documentDate = parsePdfDate(info.ModDate);
    }

    return {
      raw: {
        title: info.Title || null,
        author: info.Author || null,
        subject: info.Subject || null,
        creator: info.Creator || null,
        producer: info.Producer || null,
        creationDate: info.CreationDate || null,
        modDate: info.ModDate || null,
        pageCount: data.numpages,
        version: data.version
      },
      documentDate,
      extractedText: data.text || ''
    };
  } catch (e) {
    return { raw: {}, documentDate: null, extractedText: '' };
  }
}

/**
 * Parse PDF date format (D:YYYYMMDDHHmmSS)
 */
function parsePdfDate(pdfDate) {
  if (!pdfDate) return null;
  try {
    // Remove "D:" prefix
    let cleaned = pdfDate.replace(/^D:/, '');
    // Parse YYYYMMDDHHMMSS format
    const match = cleaned.match(/^(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?/);
    if (match) {
      const [, y, m, d, h = '00', min = '00', s = '00'] = match;
      return new Date(`${y}-${m}-${d}T${h}:${min}:${s}Z`).toISOString();
    }
    // Try parsing as-is
    const d = new Date(pdfDate);
    return isNaN(d.getTime()) ? null : d.toISOString();
  } catch {
    return null;
  }
}

/**
 * Extract metadata from .eml email files
 */
async function extractEmailMetadata(buffer) {
  try {
    const parsed = await simpleParser(buffer);
    const documentDate = parsed.date ? parsed.date.toISOString() : null;

    const from = parsed.from?.value?.[0] || {};
    const to = (parsed.to?.value || []).map(a => ({ name: a.name, address: a.address }));
    const cc = (parsed.cc?.value || []).map(a => ({ name: a.name, address: a.address }));

    return {
      raw: {
        subject: parsed.subject || null,
        from: { name: from.name, address: from.address },
        to,
        cc,
        date: documentDate,
        messageId: parsed.messageId || null,
        inReplyTo: parsed.inReplyTo || null,
        headers: Object.fromEntries(
          [...(parsed.headers || new Map())].filter(([k]) =>
            ['x-mailer', 'x-originating-ip', 'received', 'return-path'].includes(k.toLowerCase())
          )
        )
      },
      documentDate,
      extractedText: parsed.text || parsed.textAsHtml || ''
    };
  } catch (e) {
    return { raw: {}, documentDate: null, extractedText: '' };
  }
}

/**
 * Extract text from plain text files
 */
function extractTextMetadata(buffer) {
  const text = buffer.toString('utf8');
  return {
    raw: { charCount: text.length, lineCount: text.split('\n').length },
    documentDate: null,
    extractedText: text
  };
}

/**
 * Check if file is a text-based file
 */
function isTextFile(ext, mimeType) {
  const textExtensions = ['.txt', '.md', '.csv', '.json', '.log', '.rtf', '.html', '.htm', '.xml'];
  return textExtensions.includes(ext) || mimeType.startsWith('text/');
}

module.exports = { extractMetadata };
