// Game state and the request handlers that change it. The Node server serves
// these over HTTP; the static (GitHub Pages) build runs them in the browser.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./fair'), require('./game'));
  else root.House = factory(root.Fair, root.Game);
})(typeof self !== 'undefined' ? self : this, function (Fair, Game) {
  'use strict';

  const BETS = [0.2, 0.5, 1, 2, 5, 10, 20];
  const START_BALANCE = 10000;
  const round2 = (n) => Math.round(n * 100) / 100;

  function httpError(status, message) {
    const err = new Error(message);
    err.status = status;
    return err;
  }

  // newSeed(): a fresh random hex seed. saved: a snapshot() from a previous run.
  // simulate: optional, only needed by the dev tools.
  function createHouse({ newSeed, dev = false, saved = null, simulate = null }) {
    const state = saved ? restore(saved) : {
      balance: START_BALANCE,
      serverSeed: newSeed(),
      clientSeed: newSeed().slice(0, 16),
      nonce: 0,
      mode: Game.DEFAULT_MODE,
      // The player's class (profile). Chosen before spinning or buying and
      // changeable between rounds; a round always uses the class it started with.
      hero: Game.DEFAULT_HERO,
      progress: Object.fromEntries(Object.keys(Game.MODES).map((m) => [m, { gear: 0, dry: 0 }])),
      // A round whose bonus is waiting for the player to gamble or play.
      pending: null,
      history: [],
      revealed: [],
    };

    // A saved pending round has no streams; rebuild them and skip the gamble
    // draws it already made (one float each).
    function restore(snap) {
      const s = JSON.parse(JSON.stringify(snap));
      for (const m of Object.keys(Game.MODES)) if (!s.progress[m]) s.progress[m] = { gear: 0, dry: 0 };
      if (!Game.MODES[s.mode]) s.mode = Game.DEFAULT_MODE;
      if (!Game.HEROES.some((h) => h.id === s.hero)) s.hero = Game.DEFAULT_HERO;
      if (s.pending) {
        s.pending.rngFor = Fair.streams(s.serverSeed, s.clientSeed, s.pending.nonce);
        for (let i = 0; i < s.pending.round.gambles.length; i++) s.pending.rngFor('gamble').next();
      }
      return s;
    }

    function snapshot() {
      const { pending, ...rest } = state;
      const out = JSON.parse(JSON.stringify(rest));
      out.pending = pending ? JSON.parse(JSON.stringify({ nonce: pending.nonce, round: pending.round, cost: pending.cost })) : null;
      return out;
    }

    function publicState() {
      return {
        balance: state.balance,
        serverSeedHash: Fair.hashSeed(state.serverSeed),
        clientSeed: state.clientSeed,
        nonce: state.nonce,
        mode: state.mode,
        hero: state.hero,
        progress: state.progress[state.mode],
        bets: BETS,
        dev,
        pending: state.pending ? pendingView() : null,
        history: state.history.slice(-30).reverse(),
        revealed: state.revealed.slice(-10).reverse(),
      };
    }

    function pendingView() {
      const { round, nonce } = state.pending;
      return { nonce, round, gambleChance: Game.gambleChance(round.mode, round.bonus.tier) };
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
        if (state.revealed.length > 50) state.revealed.shift();
      }
      const seedHash = Fair.hashSeed(state.serverSeed);
      state.history.forEach((h) => { if (h.serverSeedHash === seedHash) h.serverSeed = state.serverSeed; });
      state.serverSeed = nextSeed || newSeed();
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
      const done = Game.finishRound(rngFor, round, state.hero);
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
        hero: done.raid ? done.raid.hero : null,
        win: done.totalWin,
        x: done.totalX,
        clientSeed: state.clientSeed,
        serverSeedHash: Fair.hashSeed(state.serverSeed),
      });
      if (state.history.length > 500) state.history.shift();
      return { round: done, nonce, done: true, state: publicState() };
    }

    // Sets the class. Only between rounds, so a round always plays (and Glory
    // or Wipe is always priced) with the class it started with.
    function setHero(value) {
      const hero = Game.HEROES.find((h) => h.id === value);
      if (!hero) throw httpError(400, 'Unknown class');
      requireNoPending();
      state.hero = hero.id;
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
        const hero = state.hero;
        return begin((rngFor) => Game.startBuy(rngFor, bet, state.progress[mode], mode, buy.id, hero), Game.buyPrice(mode, buy.id, hero), bet);
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

      'POST /api/hero': ({ body }) => {
        setHero(body.hero);
        return publicState();
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

      // Next N paid spins in the current mode and class, assuming no gambles and no buys.
      'GET /api/dev/preview': ({ query }) => {
        const count = Math.min(Math.max(Number(query.get('count')) || 50, 1), 500);
        const rows = [];
        let progress = state.progress[state.mode];
        for (let i = 0; i < count; i++) {
          const nonce = state.nonce + i;
          const r = Game.playRound(Fair.streams(state.serverSeed, state.clientSeed, nonce), { bet: 1, progress, mode: state.mode, hero: state.hero });
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
        if (!simulate) throw httpError(404, 'Not found');
        const spins = Math.min(Math.max(Number(body.spins) || 100000, 1000), 2000000);
        return simulate(spins, Game.MODES[body.mode] ? body.mode : state.mode);
      },
    };

    // Looks up the handler for "METHOD /path", or null.
    function handlerFor(key) {
      return api[key] || (dev && devApi[key]) || null;
    }

    return { handlerFor, snapshot, publicState, state };
  }

  return { createHouse, httpError, BETS, START_BALANCE };
});
