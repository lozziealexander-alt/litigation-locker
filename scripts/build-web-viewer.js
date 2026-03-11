#!/usr/bin/env node
/**
 * Build the GitHub Pages web viewer.
 *
 * Usage:
 *   node scripts/build-web-viewer.js                     # build viewer only
 *   node scripts/build-web-viewer.js --vault vault.json   # embed encrypted vault
 *
 * Output goes to docs/ which GitHub Pages serves automatically.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DOCS = path.join(ROOT, 'docs');
const RENDERER = path.join(ROOT, 'src', 'renderer');

// Parse args
const args = process.argv.slice(2);
let vaultPath = null;
const vaultIdx = args.indexOf('--vault');
if (vaultIdx >= 0 && args[vaultIdx + 1]) {
  vaultPath = path.resolve(args[vaultIdx + 1]);
}

// Ensure docs/ exists
if (!fs.existsSync(DOCS)) {
  fs.mkdirSync(DOCS, { recursive: true });
}

// 1. Bundle React for browser
console.log('[build] Bundling React app...');
execSync(
  'npx esbuild src/renderer/index.jsx --bundle --outfile=docs/bundle.js --platform=browser --target=chrome120 --define:process.env.NODE_ENV=\\"production\\"',
  { cwd: ROOT, stdio: 'inherit' }
);

// 2. Copy web-api.js
console.log('[build] Copying web-api.js...');
fs.copyFileSync(
  path.join(RENDERER, 'web-api.js'),
  path.join(DOCS, 'web-api.js')
);

// 3. Copy vault data if provided
if (vaultPath && fs.existsSync(vaultPath)) {
  console.log('[build] Embedding vault data...');
  fs.copyFileSync(vaultPath, path.join(DOCS, 'vault.enc.json'));
} else if (vaultPath) {
  console.warn('[build] Warning: vault file not found:', vaultPath);
}

// 4. Write viewer.html
console.log('[build] Writing viewer.html...');
const cacheBust = Date.now();
const viewerHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Litigation Locker \u2014 Case Viewer</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif;
      background: #FAFAF8;
      color: #1A1A1A;
      overflow: hidden;
    }
    #root { height: 100vh; }
    button:hover { filter: brightness(1.05); }
    select { cursor: pointer; }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <div id="root"></div>
  <script>
    document.addEventListener('dragover', function(e) { e.preventDefault(); });
  </script>
  <script src="./web-api.js?v=${cacheBust}"></script>
  <script src="./bundle.js?v=${cacheBust}"></script>
</body>
</html>`;

fs.writeFileSync(path.join(DOCS, 'viewer.html'), viewerHtml);

// 5. Only create index.html if the existing one isn't the download portal
const indexPath = path.join(DOCS, 'index.html');
const existingIndex = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, 'utf8') : '';
if (!existingIndex.includes('ENCRYPTED_DATA')) {
  fs.writeFileSync(indexPath, viewerHtml);
}

console.log('[build] Done! Web viewer ready in docs/');
console.log('[build] Files:');
console.log('  docs/viewer.html   \u2014 case viewer');
console.log('  docs/bundle.js     \u2014 React app');
console.log('  docs/web-api.js    \u2014 browser API layer');
if (vaultPath) console.log('  docs/vault.enc.json \u2014 encrypted vault data');
console.log('');
console.log('To publish: commit docs/ and enable GitHub Pages on the docs/ folder.');
