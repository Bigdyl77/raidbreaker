// Raidbreaker game server. Each player has an account. Spins run here so the
// active server seed stays on the server, encrypted on disk, and is never logged.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { httpError } = require('./shared/house');
const { simulate } = require('./shared/sim');
const { createAccounts, createLimiter, readCookie, sessionCookie, clearCookie } = require('./accounts');

const DEV = process.argv.includes('--dev') || process.env.DEV === '1';
const PORT = Number(process.env.PORT) || 3000;

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };

function createServer({
  dev = DEV,
  dataDir = process.env.DATA_DIR || path.join(__dirname, 'data'),
  scryptN,
  newSeed,
  secureCookie = process.env.COOKIE_SECURE === '1',
} = {}) {
  const root = path.resolve(__dirname);
  const accounts = createAccounts({
    dir: dataDir,
    dev,
    simulate: dev ? simulate : null,
    scryptN,
    newSeed: newSeed || (() => crypto.randomBytes(32).toString('hex')),
  });
  const limitAuth = createLimiter({ max: 30, windowMs: 10 * 60 * 1000 });
  const staticRoots = { '/shared/': path.join(root, 'shared'), '/': path.join(root, 'public') };

  function serveStatic(pathname, res) {
    for (const [prefix, dir] of Object.entries(staticRoots)) {
      if (!pathname.startsWith(prefix)) continue;
      const rel = pathname.slice(prefix.length) || 'index.html';
      const file = path.resolve(dir, rel);
      if (!file.startsWith(dir + path.sep) && file !== path.join(dir, 'index.html')) break;
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) break;
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(file).pipe(res);
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }

  function send(res, status, body, headers) {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers });
    res.end(JSON.stringify(body));
  }

  function stamp(session, out) {
    if (!out || typeof out !== 'object') return out;
    if (Object.prototype.hasOwnProperty.call(out, 'balance') && Object.prototype.hasOwnProperty.call(out, 'serverSeedHash')) {
      out.account = session.username;
    }
    if (out.state) stamp(session, out.state);
    return out;
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
    try {
      if (key === 'POST /api/register' || key === 'POST /api/login') {
        limitAuth(req.socket.remoteAddress || 'local');
        const body = await readBody(req);
        const session = key.endsWith('/register') ? accounts.register(body) : accounts.login(body);
        return send(res, 200, stamp(session, session.house.publicState()), {
          'Set-Cookie': sessionCookie(session.token, { secure: secureCookie }),
        });
      }

      const token = readCookie(req.headers.cookie);
      if (key === 'POST /api/logout') {
        if (token) accounts.logout(token);
        return send(res, 200, { ok: true }, { 'Set-Cookie': clearCookie({ secure: secureCookie }) });
      }

      if (!url.pathname.startsWith('/api/')) return serveStatic(url.pathname, res);

      const session = accounts.session(token);
      if (!session) return send(res, 401, { error: 'Sign in required' });

      const handler = session.house.handlerFor(key);
      if (!handler) return send(res, 404, { error: 'Not found' });
      const body = req.method === 'POST' ? await readBody(req) : {};
      const out = stamp(session, handler({ body, query: url.searchParams }));
      if (req.method !== 'GET') accounts.save(session);
      send(res, 200, out);
    } catch (err) {
      const status = err.status || 500;
      send(res, status, { error: status === 500 ? 'Server error' : err.message });
      if (status === 500) console.error(err);
    }
  });

  return server;
}

if (require.main === module) {
  createServer().listen(PORT, () => {
    console.log(`Raidbreaker running at http://localhost:${PORT}${DEV ? '  (DEV MODE: seeds exposed)' : ''}`);
  });
}

module.exports = { createServer };
