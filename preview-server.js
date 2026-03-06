const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3847;
const RENDERER_DIR = path.join(__dirname, 'src', 'renderer');

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
  let filePath = req.url === '/' ? '/index.html' : req.url.split('?')[0];

  // Serve index.html with CSP removed and mock-api.js injected
  if (filePath === '/index.html') {
    let html = fs.readFileSync(path.join(RENDERER_DIR, 'index.html'), 'utf8');
    // Remove CSP meta tag so external mock script can load
    html = html.replace(
      /<meta http-equiv="Content-Security-Policy"[^>]*>/,
      '<!-- CSP disabled for preview -->'
    );
    // Inject mock-api.js before bundle.js
    html = html.replace(
      '<script src="./bundle.js"></script>',
      '<script src="./mock-api.js"></script>\n  <script src="./bundle.js"></script>'
    );
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
    return;
  }

  const fullPath = path.join(RENDERER_DIR, filePath);
  const ext = path.extname(fullPath);

  if (fs.existsSync(fullPath)) {
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(fs.readFileSync(fullPath));
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`Preview server running at http://localhost:${PORT}`);
});
