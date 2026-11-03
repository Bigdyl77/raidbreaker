// Balances each mode's raids per class, in parallel.
//
// Each mode's `calibration` is the design target: the mean raid win per tier
// (x bet). It sets the fair gamble odds and the buy prices. This script plays
// raids for every class and tier with the current `heroScale`, then prints a
// corrected `heroScale` (so every class averages the target) and each class's
// `clearRate` (used to price Glory or Wipe). Paste both into the mode in
// shared/game.js, run it again until the means sit on target, then confirm
// the paid-spin RTP with `node rtp.js`.
// Usage: node calibrate.js [raidsPerClassAndTier] [mode|all]
'use strict';
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const os = require('os');
const Game = require('./shared/game');
const { simulateTier } = require('./shared/sim');

if (!isMainThread) {
  const { raids, mode, tier, hero, seed } = workerData;
  parentPort.postMessage(simulateTier(raids, mode, tier, seed, hero));
} else {
  const raids = Number(process.argv[2]) || 300000;
  const which = process.argv[3] || 'all';
  const modes = which === 'all' ? Object.keys(Game.MODES) : [which];
  const workers = Math.max(1, os.cpus().length);
  const chunks = 2;

  const jobs = [];
  for (const mode of modes) {
    for (const { id: hero } of Game.HEROES) {
      for (let tier = 0; tier < Game.TIERS.length; tier++) {
        for (let c = 0; c < chunks; c++) {
          jobs.push({ mode, hero, tier, raids: Math.ceil(raids / chunks), seed: (Date.now() + jobs.length * 7919) >>> 0 });
        }
      }
    }
  }
  const results = {};
  let next = 0;
  let running = 0;
  const report = () => {
    for (const mode of modes) {
      const m = Game.MODES[mode];
      const scale = {};
      const clear = {};
      console.log(`\n== ${m.label} ==  target ${m.calibration.map((x) => x + 'x').join(' / ')}`);
      for (const { id: hero } of Game.HEROES) {
        scale[hero] = [];
        clear[hero] = [];
        const cells = Game.TIERS.map((t, tier) => {
          const a = results[`${mode}:${hero}:${tier}`];
          const mean = a.sum / a.raids;
          const se = Math.sqrt((a.sumSq / a.raids - mean * mean) / a.raids);
          const old = Game.heroScaleFor(m, tier, hero);
          scale[hero].push(Number((old * m.calibration[tier] / mean).toPrecision(4)));
          clear[hero].push(Number((a.clears / a.raids).toPrecision(4)));
          return `${mean.toFixed(1)}x ±${(1.96 * se).toFixed(1)} clear ${(a.clears / a.raids * 100).toFixed(2)}%`;
        });
        console.log(`${hero.padEnd(8)} ${cells.join(' | ')}`);
      }
      const fmt = (obj) => `{\n${Object.entries(obj).map(([k, v]) => `        ${k}: [${v.join(', ')}],`).join('\n')}\n      }`;
      console.log(`heroScale: ${fmt(scale)},`);
      console.log(`clearRate: ${fmt(clear)},`);
    }
  };
  const pump = () => {
    while (running < workers && next < jobs.length) {
      const job = jobs[next++];
      running++;
      const w = new Worker(__filename, { workerData: job });
      w.once('message', (r) => {
        const key = `${job.mode}:${job.hero}:${job.tier}`;
        const acc = (results[key] = results[key] || { raids: 0, sum: 0, sumSq: 0, clears: 0 });
        acc.raids += r.raids; acc.sum += r.sum; acc.sumSq += r.sumSq; acc.clears += r.clears;
      });
      w.once('exit', () => { running--; if (next < jobs.length) pump(); else if (!running) report(); });
    }
  };
  pump();
}
