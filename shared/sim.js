// Bulk simulation for balancing. Uses a fast non-crypto RNG: fine for
// measuring the math, never used for real spins. Gear progress carries
// from spin to spin like it does for a real player. Simulated players
// never gamble (the gamble is designed not to change the expected return).
'use strict';
const Game = require('./game');

function fastRng(seed) {
  let a = seed >>> 0 || 1, b = 0x9e3779b9, c = 0x243f6a88, d = 0xb7e15162;
  return {
    next() {
      const t = a ^ (a << 11);
      a = b; b = c; c = d;
      d = (d ^ (d >>> 19) ^ (t ^ (t >>> 8))) >>> 0;
      return d / 4294967296;
    },
  };
}

const BUCKETS = [
  ['0x', 0, 0], ['<1x', 0, 1], ['1-5x', 1, 5], ['5-20x', 5, 20],
  ['20-100x', 20, 100], ['100-1000x', 100, 1000], ['1000-10000x', 1000, 10000], ['10000x+', 10000, Infinity],
];
const bucketOf = (x) => (x === 0 ? 0 : BUCKETS.findIndex(([, lo, hi], i) => i > 0 && x >= lo && x < hi));

function percentile(sorted, p) {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

// Paid spins.
function simulate(spins, modeId = Game.DEFAULT_MODE, seed = Date.now()) {
  const mode = Game.getMode(modeId);
  const rng = fastRng(seed);
  const rngFor = () => rng;
  let progress = { gear: 0, dry: 0 };
  let totalX = 0, sumSq = 0, baseX = 0, hits = 0, maxX = 0, maxWins = 0, drops = 0;
  const bySource = {};
  const byTier = Game.TIERS.map(() => 0);
  const buckets = BUCKETS.map(([label]) => ({ label, count: 0 }));
  const setTimes = [];
  let setStart = 0;
  for (let i = 0; i < spins; i++) {
    const r = Game.playRound(rngFor, { bet: 1, progress, mode: modeId });
    progress = r.progressAfter;
    totalX += r.totalX;
    sumSq += r.totalX * r.totalX;
    baseX += r.base.winX;
    if (r.totalX > 0) hits++;
    if (r.totalX > maxX) maxX = r.totalX;
    if (r.totalX >= mode.maxWinX - 1e-9) maxWins++;
    if (r.loot) drops++;
    if (r.bonus) {
      const s = (bySource[r.bonus.source] = bySource[r.bonus.source] || { count: 0, x: 0 });
      s.count++;
      s.x += r.raid ? r.raid.totalX : 0;
      byTier[r.bonus.tier]++;
      if (r.bonus.source !== 'scatter') { setTimes.push(i + 1 - setStart); setStart = i + 1; }
    }
    buckets[bucketOf(r.totalX)].count++;
  }
  setTimes.sort((a, b) => a - b);
  const bonuses = byTier.reduce((a, b) => a + b, 0);
  return {
    mode: modeId,
    spins,
    rtp: totalX / spins,
    // standard error of the RTP estimate
    rtpStdErr: Math.sqrt((sumSq / spins - (totalX / spins) ** 2) / spins),
    baseRtp: baseX / spins,
    bonusRtp: (totalX - baseX) / spins,
    hitRate: hits / spins,
    bonusEvery: bonuses ? spins / bonuses : null,
    bySource: Object.fromEntries(Object.entries(bySource).map(([k, v]) => [k, { every: spins / v.count, avgX: v.x / v.count }])),
    tierCounts: Object.fromEntries(Game.TIERS.map((t, i) => [t.id, byTier[i]])),
    dropEvery: drops ? spins / drops : null,
    gearSetSpins: { fastest: setTimes[0] || null, p10: percentile(setTimes, 0.1), median: percentile(setTimes, 0.5), p90: percentile(setTimes, 0.9) },
    maxX,
    maxWins,
    buckets: buckets.map((b) => ({ label: b.label, rate: b.count / spins })),
  };
}

// Raids of one tier started directly (no base spin), for tier values.
function simulateTier(raids, modeId, tier, seed = Date.now()) {
  const mode = Game.getMode(modeId);
  const rng = fastRng(seed);
  let sum = 0, sumSq = 0, maxX = 0, maxWins = 0, clears = 0;
  for (let i = 0; i < raids; i++) {
    const r = Game.runRaid(rng, mode, tier, 0);
    if (r.cleared) clears++;
    sum += r.totalX;
    sumSq += r.totalX * r.totalX;
    if (r.totalX > maxX) maxX = r.totalX;
    if (r.totalX >= mode.maxWinX - 1e-9) maxWins++;
  }
  return { raids, sum, sumSq, clears, mean: sum / raids, stdErr: Math.sqrt((sumSq / raids - (sum / raids) ** 2) / raids), maxX, maxWins };
}

module.exports = { simulate, simulateTier, fastRng };

if (require.main === module) {
  // node shared/sim.js [spins] [mode|all] [--json]
  const n = Number(process.argv[2]) || 1000000;
  const which = process.argv[3] || 'all';
  const json = process.argv.includes('--json');
  const pct = (v) => (v * 100).toFixed(2) + '%';
  const every = (v) => (v ? v.toFixed(0) : '-');
  for (const modeId of which === 'all' ? Object.keys(Game.MODES) : [which]) {
    const s = simulate(n, modeId, Date.now() ^ (process.pid << 8));
    if (json) { console.log(JSON.stringify(s)); continue; }
    console.log(`\n== ${Game.MODES[modeId].label} (scale ${Game.MODES[modeId].scale}) ==`);
    console.log(`Spins:        ${n.toLocaleString()}`);
    console.log(`RTP:          ${pct(s.rtp)} ± ${pct(1.96 * s.rtpStdErr)}  (base ${pct(s.baseRtp)}, bonuses ${pct(s.bonusRtp)})`);
    console.log(`Hit rate:     ${pct(s.hitRate)}`);
    console.log(`Bonus every:  ${every(s.bonusEvery)} spins  ${Object.entries(s.bySource).map(([k, v]) => `${k}: every ${every(v.every)}, avg ${v.avgX.toFixed(1)}x`).join(' | ')}`);
    console.log(`Tiers:        ${JSON.stringify(s.tierCounts)}`);
    console.log(`Loot drops:   every ${every(s.dropEvery)} spins; gear set in fastest ${s.gearSetSpins.fastest}, median ${s.gearSetSpins.median}, p90 ${s.gearSetSpins.p90}`);
    console.log(`Max win:      ${s.maxX.toFixed(2)}x (cap ${Game.MODES[modeId].maxWinX}x hit ${s.maxWins} times)`);
    console.log(`Distribution: ${s.buckets.map((b) => `${b.label} ${pct(b.rate)}`).join(', ')}`);
  }
}
