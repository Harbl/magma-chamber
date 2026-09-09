// Minimal static server for local testing. No dependencies.
//   node tools/serve.js [port]
//
// Serve over http://localhost -- the Riftbound locator API allows browser
// requests from "localhost" but NOT from "127.0.0.1", so signup import only
// works on the localhost hostname.
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = +process.argv[2] || 8080;

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png',
};

http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  const file = path.join(ROOT, rel);

  // Don't serve anything outside the project directory.
  if (!file.startsWith(ROOT)) { res.writeHead(403).end('Forbidden'); return; }

  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found: ' + rel); return; }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(data);
  });
}).listen(PORT, () => {
  console.log(`\n  Magma Chamber running at  http://localhost:${PORT}\n`);
  console.log('  Signup import works here because localhost is allowlisted by the API.');
  console.log('  Press Ctrl+C to stop.\n');
});
