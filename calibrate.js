// Measures each bonus tier's mean raid win per mode (x bet), in parallel.
// Paste the printed arrays into each mode's `calibration` in shared/game.js:
// they set the fair gamble odds and the buy prices.
// Usage: node calibrate.js [raidsPerTier] [mode|all]
'use strict';
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const os = require('os');
const Game = require('./shared/game');
const { simulateTier } = require('./shared/sim');

if (!isMainThread) {
  const { raids, mode, tier, seed } = workerData;
  parentPort.postMessage(simulateTier(raids, mode, tier, seed));
} else {
  const raids = Number(process.argv[2]) || 2000000;
  const which = process.argv[3] || 'all';
  const modes = which === 'all' ? Object.keys(Game.MODES) : [which];
  const workers = Math.max(1, os.cpus().length - 1);

  const jobs = [];
  for (const mode of modes) {
    for (let tier = 0; tier < Game.TIERS.length; tier++) {
      for (let w = 0; w < workers; w++) {
        jobs.push({ mode, tier, raids: Math.ceil(raids / workers), seed: (Date.now() + jobs.length * 7919) >>> 0 });
      }
    }
  }
  const results = {};
  let next = 0;
  let finished = 0;
  const run = () => new Promise((resolve) => {
    const pump = () => {
      if (finished === jobs.length) return resolve();
      if (next >= jobs.length) return;
      const job = jobs[next++];
      const worker = new Worker(__filename, { workerData: job });
      worker.once('message', (r) => {
        const key = `${job.mode}:${job.tier}`;
        const acc = (results[key] = results[key] || { raids: 0, sum: 0, sumSq: 0, maxX: 0, maxWins: 0, clears: 0 });
        acc.raids += r.raids; acc.sum += r.sum; acc.sumSq += r.sumSq; acc.clears += r.clears;
        acc.maxX = Math.max(acc.maxX, r.maxX); acc.maxWins += r.maxWins;
        finished++;
        pump();
      });
    };
    for (let i = 0; i < workers; i++) pump();
  });

  run().then(() => {
    setTimeout(() => {
      for (const mode of modes) {
        const means = [];
        const clears = [];
        console.log(`\n== ${Game.MODES[mode].label} ==`);
        Game.TIERS.forEach((t, tier) => {
          const a = results[`${mode}:${tier}`];
          const mean = a.sum / a.raids;
          const se = Math.sqrt((a.sumSq / a.raids - mean * mean) / a.raids);
          means.push(Number(mean.toFixed(2)));
          clears.push(Number((a.clears / a.raids).toPrecision(4)));
          console.log(`${t.name.padEnd(20)} mean ${mean.toFixed(2)}x ± ${(1.96 * se).toFixed(2)}  max ${a.maxX.toFixed(0)}x  capped ${a.maxWins}  clears ${(a.clears / a.raids * 100).toFixed(4)}%`);
        });
        console.log(`calibration: [${means.join(', ')}],`);
        console.log(`clearRate: [${clears.join(', ')}],`);
      }
    }, 200);
  });
}
