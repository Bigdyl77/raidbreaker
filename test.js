// Checks the pure-JS hashing against Node's crypto, that rounds replay
// exactly, and that the server's step-by-step flow matches a full replay.
'use strict';
const assert = require('assert');
const crypto = require('crypto');
const Fair = require('./shared/fair');
const Game = require('./shared/game');

for (let i = 0; i < 300; i++) {
  const msg = crypto.randomBytes(i);
  assert.strictEqual(Fair.toHex(Fair.sha256(msg)), crypto.createHash('sha256').update(msg).digest('hex'), `sha256 len ${i}`);
  const key = crypto.randomBytes(i % 100);
  assert.strictEqual(Fair.toHex(Fair.hmacSha256(key, msg)), crypto.createHmac('sha256', key).update(msg).digest('hex'), `hmac len ${i}`);
}
assert.strictEqual(Fair.hashSeed('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');

// Same flow the server uses: start, gamble N times (stop on loss), finish.
function stepwise(seeds, opts) {
  const rngFor = Fair.streams(...seeds);
  const round = opts.buy
    ? Game.startBuy(rngFor, opts.bet, opts.progress, opts.mode, opts.buy, opts.hero)
    : Game.startSpin(rngFor, opts.bet, opts.progress, opts.mode);
  round.gambles = [];
  for (let i = 0; i < opts.gambles; i++) {
    if (!Game.canGamble(round)) break;
    const g = Game.gamble(rngFor, opts.mode, round.bonus.tier);
    round.gambles.push(g);
    round.bonus = { ...round.bonus, tier: g.to };
    if (!g.won) break;
  }
  return Game.finishRound(rngFor, round, opts.hero);
}

const HERO_IDS = Game.HEROES.map((h) => h.id);

for (const [modeId, mode] of Object.entries(Game.MODES)) {
  let p = { gear: 0, dry: 0 };
  let bonuses = 0;
  for (let n = 0; n < 3000; n++) {
    const seeds = ['seed-a', 'seed-b', n];
    const opts = { bet: 1, progress: p, mode: modeId, gambles: n % 3, hero: HERO_IDS[n % HERO_IDS.length] };
    const r = Game.playRound(Fair.streams(...seeds), opts);
    assert.deepStrictEqual(r, Game.playRound(Fair.streams(...seeds), opts), `${modeId} replays`);
    assert.deepStrictEqual(r, stepwise(seeds, opts), `${modeId} stepwise matches replay`);
    assert.ok(r.totalX >= 0 && r.totalX <= mode.maxWinX + 1e-9, `${modeId} max win`);
    if (r.loot) r.loot.items.forEach((it) => assert.ok(!((r.progressBefore.gear >> it.slot) & 1), 'loot is always a missing piece'));
    if (r.bonus) bonuses++;
    if (r.raid) assert.strictEqual(r.raid.hero, opts.hero, 'raid uses the picked class');
    p = r.progressAfter;
  }
  assert.ok(bonuses > 0, `${modeId} triggers bonuses`);

  for (const buy of Game.BUYS) {
    for (let n = 0; n < 50; n++) {
      const seeds = ['buy-a', 'buy-b', n];
      const opts = { bet: 2, progress: { gear: 3, dry: 40 }, mode: modeId, buy: buy.id, gambles: n % 4, hero: HERO_IDS[n % HERO_IDS.length] };
      const r = Game.playRound(Fair.streams(...seeds), opts);
      assert.deepStrictEqual(r, stepwise(seeds, opts), `${modeId} ${buy.id} stepwise matches replay`);
      assert.deepStrictEqual(r.progressAfter, opts.progress, 'buys leave gear alone');
      if (buy.tier !== null) assert.ok(r.bonus.triggeredTier === buy.tier, 'bought tier');
      if (!buy.glory) assert.ok(r.bonus.triggeredTier < Game.TOP_TIER, 'Super Hidden is never bought directly');
      else {
        assert.ok(r.totalX === 0 || r.totalX === mode.maxWinX, 'Glory or Wipe pays max or nothing');
        assert.strictEqual(r.bonus.hero, opts.hero, 'Glory or Wipe keeps the class it was priced for');
        // Picking another class at play time can't change a Glory raid.
        const rngFor = Fair.streams(...seeds);
        const round = Game.startBuy(rngFor, opts.bet, opts.progress, modeId, buy.id, opts.hero);
        round.gambles = [];
        const other = HERO_IDS[(n + 1) % HERO_IDS.length];
        if (round.bonus.tier !== null) assert.strictEqual(Game.finishRound(rngFor, round, other).raid.hero, opts.hero, 'Glory class is locked');
      }
    }
  }

  // Every class is calibrated for every tier, and raid mechanics hold up.
  for (const hero of HERO_IDS) {
    assert.strictEqual(mode.heroScale[hero].length, Game.TIERS.length, `${modeId} ${hero} heroScale`);
    assert.strictEqual(mode.clearRate[hero].length, Game.TIERS.length, `${modeId} ${hero} clearRate`);
    assert.ok(Game.buyPrice(modeId, 'glory', hero) >= 1, 'Glory price');
    for (let tier = 0; tier < Game.TIERS.length; tier++) {
      const rng = Fair.streams('raid-a', 'raid-b', tier)('raid');
      const raid = Game.runRaid(rng, mode, tier, 0, false, hero);
      const sticky = mode.tiers[tier].sticky || 0;
      raid.steps.forEach((st) => {
        st.stickyCells.forEach(([r, row]) => assert.strictEqual(st.grid[r][row], 'W', 'sticky cells hold wilds'));
        if (!sticky) assert.strictEqual(st.stickyCells.length, 0, 'no sticky wilds in tiers without them');
        assert.strictEqual(st.hits.length, st.stickyCells.length + st.wildCells.length, 'every wild hits');
      });
    }
  }
  // Same average for every class: buy prices don't depend on the class.
  for (const buy of Game.BUYS.filter((b) => !b.glory)) {
    HERO_IDS.forEach((hero) => assert.strictEqual(Game.buyPrice(modeId, buy.id, hero), Game.buyPrice(modeId, buy.id), 'class-free price'));
  }

  Object.values(mode.strips.free).concat([mode.strips.base]).forEach((strips) => strips.forEach((strip) => {
    for (let stop = 0; stop < strip.length; stop++) {
      let b = 0;
      for (let row = 0; row < Game.ROWS; row++) if (strip[(stop + row) % strip.length] === 'B') b++;
      assert.ok(b <= 1, `${modeId}: at most one scatter visible per reel`);
    }
  }));
}
// The static build saves state between page loads, including a bonus waiting
// on the gamble. A restored house must finish that round exactly like one
// that never reloaded.
{
  const { createHouse } = require('./shared/house');
  let n = 0;
  const newSeed = () => crypto.createHash('sha256').update('house-' + n++).digest('hex');
  let checked = 0;
  for (let i = 0; i < 4000 && checked < 20; i++) {
    const a = createHouse({ newSeed });
    a.handlerFor('POST /api/hero')({ body: { hero: Game.HEROES[i % Game.HEROES.length].id } });
    for (let spin = 0; spin < 400; spin++) {
      const r = a.handlerFor('POST /api/spin')({ body: { bet: 1 } });
      if (r.done) continue;
      try { a.handlerFor('POST /api/bonus/gamble')({}); } catch { /* top tier */ }
      if (!a.state.pending) break;
      const b = createHouse({ newSeed, saved: JSON.parse(JSON.stringify(a.snapshot())) });
      const play = (h) => { try { h.handlerFor('POST /api/bonus/gamble')({}); } catch { /* top tier */ } return h.state.pending ? h.handlerFor('POST /api/bonus/play')({}) : null; };
      assert.throws(() => a.handlerFor('POST /api/hero')({ body: { hero: 'mage' } }), /Finish the current bonus/, 'class is locked during a round');
      assert.deepStrictEqual(play(b), play(a), 'restored pending round finishes identically');
      assert.deepStrictEqual(b.snapshot(), a.snapshot(), 'restored house state matches');
      checked++;
      break;
    }
  }
  assert.ok(checked >= 5, 'restore test hit pending bonuses');
}

// Accounts: progress survives a new process, and the active server seed is
// encrypted at rest. Passwords and seeds are never logged.
{
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const { createAccounts, createLimiter, SCRYPT_N } = require('./accounts');
  const { createServer } = require('./server');
  const accountsSrc = fs.readFileSync(path.join(__dirname, 'accounts.js'), 'utf8');
  const serverSrc = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  assert.strictEqual(SCRYPT_N, 16384, 'password hashing cost');
  assert.ok(!/console\./.test(accountsSrc), 'accounts.js does not log');
  assert.ok(!/console\.[a-z]+\([^)]*(password|serverSeed)/.test(serverSrc), 'server logs omit secrets');

  const limit = createLimiter({ max: 2, windowMs: 60_000 });
  limit('ip');
  limit('ip');
  assert.throws(() => limit('ip'), /Too many attempts/);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-acct-'));
  let n = 0;
  const newSeed = () => crypto.createHash('sha256').update('acct-' + n++).digest('hex');
  const opts = { dir, scryptN: 1024, newSeed, dev: false };
  const accounts = createAccounts(opts);
  assert.throws(() => accounts.register({ username: 'ab', password: 'password-1' }), /3-20/);
  assert.throws(() => accounts.register({ username: 'ada', password: 'short' }), /8-128/);
  const ada = accounts.register({ username: 'Ada', password: 'password-1' });
  assert.strictEqual(ada.username, 'Ada');
  assert.throws(() => accounts.register({ username: 'ada', password: 'password-2' }), /taken/);
  assert.throws(() => accounts.login({ username: 'Ada', password: 'wrong-password' }), /Wrong name or password/);
  assert.throws(() => accounts.login({ username: 'nobody', password: 'password-1' }), /Wrong name or password/);

  const other = accounts.register({ username: '__proto__', password: 'password-2' });
  other.house.handlerFor('POST /api/spin')({ body: { bet: 1 } });
  accounts.save(other);
  assert.notStrictEqual(other.house.state.balance, ada.house.state.balance, 'accounts do not share a balance');

  const again = accounts.login({ username: 'ADA', password: 'password-1' });
  assert.strictEqual(again.house, ada.house, 'a second sign-in shares the live save');
  assert.strictEqual(again.username, 'Ada');

  for (let i = 0; i < 2500 && !ada.house.state.pending; i++) {
    ada.house.handlerFor('POST /api/spin')({ body: { bet: 1 } });
  }
  assert.ok(ada.house.state.pending, 'found a bonus to save');
  accounts.save(ada);
  const seed = ada.house.state.serverSeed;
  const snap = ada.house.snapshot();
  const onDisk = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
  assert.ok(!onDisk.includes(seed), 'active seed is not stored in the clear');
  assert.ok(!onDisk.includes('password-1'), 'password is not stored');
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.json')) continue;
    assert.strictEqual(fs.statSync(path.join(dir, file)).mode & 0o777, 0o600, file);
  }
  assert.strictEqual(fs.statSync(dir).mode & 0o777, 0o700);

  accounts.logout(ada.token);
  accounts.logout(again.token);
  const reloaded = createAccounts({ ...opts, newSeed: () => { throw new Error('seed rotated'); } });
  const back = reloaded.login({ username: 'ada', password: 'password-1' });
  assert.strictEqual(back.house.state.serverSeed, seed, 'the same seed unlocks');
  assert.deepStrictEqual(back.house.snapshot(), snap, 'pending round restored');
  const play = (house) => {
    try { house.handlerFor('POST /api/bonus/gamble')({}); } catch { /* top tier */ }
    return house.state.pending ? house.handlerFor('POST /api/bonus/play')({}) : null;
  };
  const left = play(ada.house);
  const right = play(back.house);
  assert.deepStrictEqual(right, left, 'restored account finishes the bonus the same way');

  // A revealed seed is public. The seed that replaces it stays encrypted.
  const plain = accounts.register({ username: 'Bea', password: 'password-3' });
  const first = plain.house.handlerFor('POST /api/spin')({ body: { bet: 1 } });
  if (!first.done) plain.house.handlerFor('POST /api/bonus/play')({});
  const revealed = plain.house.state.serverSeed;
  plain.house.handlerFor('POST /api/rotate')({});
  accounts.save(plain);
  const after = fs.readFileSync(path.join(dir, `${plain.id}.json`), 'utf8');
  assert.ok(after.includes(revealed), 'a revealed seed is kept for verification');
  assert.ok(!after.includes(plain.house.state.serverSeed), 'the new active seed is encrypted');

  fs.rmSync(dir, { recursive: true, force: true });

  async function call(port, pathname, { body, cookie } = {}) {
    const res = await fetch(`http://127.0.0.1:${port}${pathname}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(cookie ? { cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json();
    const set = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    const line = set[0] || res.headers.get('set-cookie') || '';
    return { status: res.status, data, cookie: line.split(';')[0] };
  }

  (async () => {
    const httpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-http-'));
    const devDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-dev-'));
    const listen = (server) => new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
    const close = (server) => new Promise((resolve) => server.close(resolve));
    const server = createServer({ dev: false, dataDir: httpDir, scryptN: 1024 });
    const port = await listen(server);
    const denied = await call(port, '/api/state');
    assert.strictEqual(denied.status, 401, 'spins require a sign-in');
    const created = await call(port, '/api/register', { body: { username: 'Cara', password: 'password-4' } });
    assert.strictEqual((await call(port, '/api/dev/seed', { cookie: created.cookie })).status, 404, 'dev seed stays off');
    assert.strictEqual(created.status, 200);
    assert.strictEqual(created.data.account, 'Cara');
    assert.ok(created.cookie.startsWith('rb='), 'session cookie');
    const spun = await call(port, '/api/spin', { body: { bet: 1 }, cookie: created.cookie });
    assert.strictEqual(spun.status, 200);
    assert.ok(spun.data.state.balance < created.data.balance);
    const hash = spun.data.state.serverSeedHash;
    const balance = spun.data.state.balance;
    await close(server);

    const restarted = createServer({ dev: false, dataDir: httpDir, scryptN: 1024 });
    const port2 = await listen(restarted);
    const stale = await call(port2, '/api/state', { cookie: created.cookie });
    assert.strictEqual(stale.status, 401, 'a restart drops the session');
    const signed = await call(port2, '/api/login', { body: { username: 'cara', password: 'password-4' } });
    assert.strictEqual(signed.data.balance, balance, 'balance survived the restart');
    assert.strictEqual(signed.data.serverSeedHash, hash, 'seed pair survived the restart');
    await call(port2, '/api/logout', { body: {}, cookie: signed.cookie });
    assert.strictEqual((await call(port2, '/api/state', { cookie: signed.cookie })).status, 401);
    await close(restarted);

    const devServer = createServer({ dev: true, dataDir: devDir, scryptN: 1024 });
    const devPort = await listen(devServer);
    const devUser = await call(devPort, '/api/register', { body: { username: 'Dev', password: 'password-5' } });
    const leaked = await call(devPort, '/api/dev/seed', { cookie: devUser.cookie });
    assert.strictEqual(leaked.status, 200);
    const devFiles = fs.readdirSync(devDir).map((f) => fs.readFileSync(path.join(devDir, f))).join('\n');
    assert.ok(!devFiles.includes(leaked.data.serverSeed), 'dev mode still encrypts the seed');
    await close(devServer);
    fs.rmSync(httpDir, { recursive: true, force: true });
    fs.rmSync(devDir, { recursive: true, force: true });
    console.log('All tests passed');
  })().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
