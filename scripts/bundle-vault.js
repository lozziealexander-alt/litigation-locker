#!/usr/bin/env node
/**
 * Copies your local vault databases into bundled-vault/ for distribution.
 * The recipient will see your vault in read-only mode — no password needed.
 *
 * Usage:
 *   node scripts/bundle-vault.js
 *
 * After running, rebuild the app:
 *   npm run build
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Determine the Electron userData path for "Litigation Locker"
function getUserDataPath() {
  const platform = os.platform();
  const home = os.homedir();

  if (platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'Litigation Locker');
  } else if (platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'Litigation Locker');
  } else {
    return path.join(home, '.config', 'Litigation Locker');
  }
}

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return 0;
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    let count = 0;
    for (const item of fs.readdirSync(src)) {
      count += copyRecursive(path.join(src, item), path.join(dest, item));
    }
    return count;
  } else {
    fs.copyFileSync(src, dest);
    return 1;
  }
}

const userDataPath = getUserDataPath();
const projectRoot = path.join(__dirname, '..');
const bundledDir = path.join(projectRoot, 'bundled-vault');

console.log('Source vault:', userDataPath);
console.log('Destination:', bundledDir);

// Check source exists
const masterDbPath = path.join(userDataPath, 'master.db');
if (!fs.existsSync(masterDbPath)) {
  console.error('\nError: No vault found at', userDataPath);
  console.error('Make sure you have opened Litigation Locker and created at least one case.');
  process.exit(1);
}

// Clean and recreate bundled-vault/
if (fs.existsSync(bundledDir)) {
  fs.rmSync(bundledDir, { recursive: true });
}
fs.mkdirSync(bundledDir, { recursive: true });

// Copy master.db
fs.copyFileSync(masterDbPath, path.join(bundledDir, 'master.db'));
console.log('  Copied master.db');

// Copy case-databases/
const casesDir = path.join(userDataPath, 'case-databases');
if (fs.existsSync(casesDir)) {
  const count = copyRecursive(casesDir, path.join(bundledDir, 'case-databases'));
  console.log(`  Copied ${count} case database(s)`);
}

// Do NOT copy salt or any key material — read-only mode doesn't need it
console.log('\nDone! Vault bundled for read-only distribution.');
console.log('Now rebuild: npm run build');
console.log('\nNote: The bundled-vault/ directory contains your case data.');
console.log('Do NOT commit it to git — it is listed in .gitignore.');
