const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * DoD 5220.22-M 3-pass secure delete
 * Pass 1: Overwrite with random data
 * Pass 2: Overwrite with zeros
 * Pass 3: Overwrite with random data
 * Then: Rename to random, truncate, unlink
 */
async function secureDelete(filePath) {
  if (!fs.existsSync(filePath)) {
    return { success: false, error: 'File not found' };
  }

  const stats = fs.statSync(filePath);
  const size = stats.size;

  try {
    // Pass 1: Random data
    const random1 = crypto.randomBytes(size);
    fs.writeFileSync(filePath, random1);

    // Pass 2: Zeros
    const zeros = Buffer.alloc(size, 0);
    fs.writeFileSync(filePath, zeros);

    // Pass 3: Random data
    const random2 = crypto.randomBytes(size);
    fs.writeFileSync(filePath, random2);

    // Rename to random string
    const dir = path.dirname(filePath);
    const randomName = crypto.randomBytes(16).toString('hex');
    const newPath = path.join(dir, randomName);
    fs.renameSync(filePath, newPath);

    // Truncate to zero
    fs.truncateSync(newPath, 0);

    // Unlink
    fs.unlinkSync(newPath);

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Securely delete entire directory
 */
async function secureDeleteDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return { success: false, error: 'Directory not found' };
  }

  const results = [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      results.push(await secureDeleteDirectory(fullPath));
    } else {
      results.push(await secureDelete(fullPath));
    }
  }

  // Remove empty directory
  fs.rmdirSync(dirPath);

  return { success: true, filesDeleted: results.length };
}

module.exports = {
  secureDelete,
  secureDeleteDirectory
};
