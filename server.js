// Raidbreaker game server. Spins are computed here so the active server seed
// never leaves the server (except through the dev endpoints in --dev mode).
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createHouse, httpError } = require('./shared/house');
const { simulate } = require('./shared/sim');

const DEV = process.argv.includes('--dev') || process.env.DEV === '1';
const PORT = Number(process.env.PORT) || 3000;

// Single-player, in-memory state. Fine for a prototype; a real game needs
// per-player storage with the seed encrypted at rest.
const house = createHouse({ newSeed: () => crypto.randomBytes(32).toString('hex'), dev: DEV, simulate });

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
const STATIC_ROOTS = { '/shared/': path.join(__dirname, 'shared'), '/': path.join(__dirname, 'public') };

function serveStatic(pathname, res) {
  for (const [prefix, root] of Object.entries(STATIC_ROOTS)) {
    if (!pathname.startsWith(prefix)) continue;
    const rel = pathname.slice(prefix.length) || 'index.html';
    const file = path.resolve(root, rel);
    if (!file.startsWith(root + path.sep)) break;
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) break;
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
    return;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 10000) reject(httpError(413, 'Body too large'));
    });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch { reject(httpError(400, 'Invalid JSON')); }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const key = `${req.method} ${url.pathname}`;
  const handler = house.handlerFor(key);
  if (!handler) {
    if (url.pathname.startsWith('/api/')) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Not found' }));
    }
    return serveStatic(url.pathname, res);
  }
  try {
    const body = req.method === 'POST' ? await readBody(req) : {};
    const out = handler({ body, query: url.searchParams });
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(out));
  } catch (err) {
    res.writeHead(err.status || 500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.status ? err.message : 'Server error' }));
    if (!err.status) console.error(err);
  }
});

server.listen(PORT, () => {
  console.log(`Raidbreaker running at http://localhost:${PORT}${DEV ? '  (DEV MODE: seeds exposed)' : ''}`);
});
