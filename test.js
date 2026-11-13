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
      let bossIndex = mode.tiers[tier].startBoss;
      let hp = raid.bosses[bossIndex].hp;
      raid.steps.forEach((st) => {
        st.stickyCells.forEach(([r, row]) => assert.strictEqual(st.grid[r][row], 'W', 'sticky cells hold wilds'));
        if (!sticky) assert.strictEqual(st.stickyCells.length, 0, 'no sticky wilds in tiers without them');
        assert.strictEqual(st.hits.length, st.stickyCells.length + st.wildCells.length, 'every wild hits');
        const kills = [];
        for (const h of st.hits) {
          const applied = Game.applyDamage(raid.bosses, bossIndex, hp, h.dmg);
          kills.push(...applied.kills);
          bossIndex = applied.bossIndex;
          hp = applied.hp;
        }
        assert.strictEqual(bossIndex, st.bossIndex, 'hit-by-hit walk stays on the step boss');
        assert.strictEqual(hp, st.hp, 'hit-by-hit walk matches step HP');
        assert.deepStrictEqual(
          st.events.filter((e) => e.type === 'bossKilled').map((e) => e.boss),
          kills.map((k) => k.boss),
          'kills follow the hits',
        );
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
console.log('All tests passed');
