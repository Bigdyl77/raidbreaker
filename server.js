// Raidbreaker game server. Spins are computed here so the active server seed
// never leaves the server (except through the dev endpoints in --dev mode).
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Fair = require('./shared/fair');
const Game = require('./shared/game');
const { simulate } = require('./shared/sim');

const DEV = process.argv.includes('--dev') || process.env.DEV === '1';
const PORT = Number(process.env.PORT) || 3000;
const BETS = [0.2, 0.5, 1, 2, 5, 10, 20];
const START_BALANCE = 10000;

const newServerSeed = () => crypto.randomBytes(32).toString('hex');
const round2 = (n) => Math.round(n * 100) / 100;

// Single-player, in-memory state. Fine for a prototype; a real game needs
// per-player storage with the seed encrypted at rest.
const state = {
  balance: START_BALANCE,
  serverSeed: newServerSeed(),
  clientSeed: crypto.randomBytes(8).toString('hex'),
  nonce: 0,
  mode: Game.DEFAULT_MODE,
  progress: Object.fromEntries(Object.keys(Game.MODES).map((m) => [m, { gear: 0, dry: 0 }])),
  // A round whose bonus is waiting for the player to gamble or play.
  pending: null,
  history: [],
  revealed: [],
};

function publicState() {
  return {
    balance: state.balance,
    serverSeedHash: Fair.hashSeed(state.serverSeed),
    clientSeed: state.clientSeed,
    nonce: state.nonce,
    mode: state.mode,
    progress: state.progress[state.mode],
    bets: BETS,
    dev: DEV,
    pending: state.pending ? pendingView() : null,
    history: state.history.slice(-30).reverse(),
    revealed: state.revealed.slice(-10).reverse(),
  };
}

function pendingView() {
  const { round, nonce } = state.pending;
  const tier = round.bonus.tier;
  return {
    nonce,
    round,
    gambleChance: Game.gambleChance(round.mode, tier),
  };
}

function rotateSeed(nextSeed) {
  if (state.pending) throw httpError(409, 'Finish the current bonus first');
  if (state.nonce > 0) {
    state.revealed.push({
      serverSeed: state.serverSeed,
      serverSeedHash: Fair.hashSeed(state.serverSeed),
      clientSeed: state.clientSeed,
      spins: state.nonce,
    });
  }
  const seedHash = Fair.hashSeed(state.serverSeed);
  state.history.forEach((h) => { if (h.serverSeedHash === seedHash) h.serverSeed = state.serverSeed; });
  state.serverSeed = nextSeed || newServerSeed();
  state.nonce = 0;
}

function requireNoPending() {
  if (state.pending) throw httpError(409, 'Finish the current bonus first');
}

// Charges the bet, then either finishes the round or parks it as pending.
function begin(start, costX, bet) {
  const cost = round2(costX * bet);
  if (state.balance < cost) throw httpError(400, 'Not enough balance');
  const nonce = state.nonce++;
  const rngFor = Fair.streams(state.serverSeed, state.clientSeed, nonce);
  const round = start(rngFor);
  round.gambles = [];
  state.balance = round2(state.balance - cost);
  state.progress[round.mode] = round.progressAfter;
  state.pending = { nonce, round, rngFor, cost };
  if (!round.bonus) return finish();
  return { round, nonce, done: false, state: publicState() };
}

function finish() {
  const { nonce, round, rngFor, cost } = state.pending;
  const done = Game.finishRound(rngFor, round);
  state.pending = null;
  state.balance = round2(state.balance + done.totalWin);
  state.history.push({
    nonce,
    mode: done.mode,
    kind: done.kind,
    buy: done.buy || null,
    bet: done.bet,
    cost,
    gambles: done.gambles.length,
    progressBefore: done.progressBefore,
    tier: done.bonus ? done.bonus.tier : null,
    win: done.totalWin,
    x: done.totalX,
    clientSeed: state.clientSeed,
    serverSeedHash: Fair.hashSeed(state.serverSeed),
  });
  if (state.history.length > 500) state.history.shift();
  return { round: done, nonce, done: true, state: publicState() };
}

function parseBet(value) {
  const bet = Number(value);
  if (!BETS.includes(bet)) throw httpError(400, 'Invalid bet');
  return bet;
}

const api = {
  'GET /api/state': () => publicState(),

  'POST /api/mode': ({ body }) => {
    requireNoPending();
    if (!Game.MODES[body.mode]) throw httpError(400, 'Unknown mode');
    state.mode = body.mode;
    return publicState();
  },

  'POST /api/spin': ({ body }) => {
    requireNoPending();
    const bet = parseBet(body.bet);
    const mode = state.mode;
    return begin((rngFor) => Game.startSpin(rngFor, bet, state.progress[mode], mode), 1, bet);
  },

  'POST /api/buy': ({ body }) => {
    requireNoPending();
    const bet = parseBet(body.bet);
    const mode = state.mode;
    const buy = Game.BUYS.find((b) => b.id === body.buy);
    if (!buy) throw httpError(400, 'Unknown buy');
    return begin((rngFor) => Game.startBuy(rngFor, bet, state.progress[mode], mode, buy.id), Game.buyPrice(mode, buy.id), bet);
  },

  'POST /api/bonus/gamble': () => {
    const p = state.pending;
    if (!p || !p.round.bonus || p.round.bonus.tier === null) throw httpError(409, 'No bonus to gamble');
    if (p.round.bonus.tier >= Game.TOP_TIER) throw httpError(409, 'Already at the top tier');
    const g = Game.gamble(p.rngFor, p.round.mode, p.round.bonus.tier);
    p.round.gambles.push(g);
    p.round.bonus = { ...p.round.bonus, tier: g.to };
    if (!g.won) return { gamble: g, ...finish() };
    return { gamble: g, round: p.round, nonce: p.nonce, done: false, state: publicState() };
  },

  'POST /api/bonus/play': () => {
    if (!state.pending) throw httpError(409, 'No bonus waiting');
    return finish();
  },

  'POST /api/client-seed': ({ body }) => {
    const seed = String(body.clientSeed || '').trim();
    if (!seed || seed.length > 64) throw httpError(400, 'Client seed must be 1-64 characters');
    // Changing the client seed starts a new seed pair, so the old server seed is revealed.
    rotateSeed();
    state.clientSeed = seed;
    return publicState();
  },

  'POST /api/rotate': () => {
    rotateSeed();
    return publicState();
  },

  'POST /api/reset-balance': () => {
    state.balance = START_BALANCE;
    return publicState();
  },
};

// Dev-only tools. These deliberately expose the active seed, so they must
// never be enabled for real players.
const devApi = {
  'GET /api/dev/seed': () => ({ serverSeed: state.serverSeed, serverSeedHash: Fair.hashSeed(state.serverSeed) }),

  'POST /api/dev/seed': ({ body }) => {
    const seed = String(body.serverSeed || '').trim();
    if (!seed || seed.length > 128) throw httpError(400, 'Server seed must be 1-128 characters');
    rotateSeed(seed);
    return publicState();
  },

  // Next N paid spins in the current mode, assuming no gambles and no buys.
  'GET /api/dev/preview': ({ query }) => {
    const count = Math.min(Math.max(Number(query.get('count')) || 50, 1), 500);
    const rows = [];
    let progress = state.progress[state.mode];
    const first = state.nonce + (state.pending ? 0 : 0);
    for (let i = 0; i < count; i++) {
      const nonce = first + i;
      const r = Game.playRound(Fair.streams(state.serverSeed, state.clientSeed, nonce), { bet: 1, progress, mode: state.mode });
      rows.push({
        nonce, x: r.totalX,
        bonus: r.bonus ? { source: r.bonus.source, tier: r.bonus.tier } : null,
        loot: r.loot ? r.loot.items.length : 0,
        gear: Game.gearCount(r.progressAfter.gear),
      });
      progress = r.progressAfter;
    }
    return { rows };
  },

  'POST /api/dev/simulate': ({ body }) => {
    const spins = Math.min(Math.max(Number(body.spins) || 100000, 1000), 2000000);
    return simulate(spins, Game.MODES[body.mode] ? body.mode : state.mode);
  },
};

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

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
  const handler = api[key] || (DEV && devApi[key]);
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
