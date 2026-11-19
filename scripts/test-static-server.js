import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '../public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, 'http://localhost');
  let pathname = parsedUrl.pathname;

  // Mock API endpoints for offline / demo testing
  if (pathname === '/api/config') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ demoOnly: true, development: true, evidenceUploadEnabled: false }));
    return;
  }
  if (pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', demoOnly: true }));
    return;
  }

  if (pathname === '/' || pathname === '') pathname = '/index.html';
  const filePath = path.join(publicDir, pathname.replace(/^\//, ''));

  if (!filePath.startsWith(publicDir) || !fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Security-Policy': "default-src 'none'; script-src 'self' https://static.line-scdn.net; style-src 'self'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://api.line.me https://*.line-scdn.net; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; object-src 'none'",
    'X-Content-Type-Options': 'nosniff'
  });
  fs.createReadStream(filePath).pipe(res);
});

const PORT = process.env.PORT || 4173;
server.listen(PORT, () => {
  console.log(`PakMaii Test Server running at http://localhost:${PORT}`);
});
