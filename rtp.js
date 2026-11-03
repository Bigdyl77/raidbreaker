// Measures paid-spin RTP per mode with many spins in parallel.
// Usage: node rtp.js [spinsPerMode] [mode|all]
'use strict';
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const os = require('os');
const Game = require('./shared/game');
const { simulate } = require('./shared/sim');

if (!isMainThread) {
  parentPort.postMessage(simulate(workerData.spins, workerData.mode, workerData.seed));
} else {
  const total = Number(process.argv[2]) || 100000000;
  const which = process.argv[3] || 'all';
  const modes = which === 'all' ? Object.keys(Game.MODES) : [which];
  const chunk = 5000000;
  const jobs = [];
  for (const mode of modes) {
    for (let done = 0; done < total; done += chunk) jobs.push({ mode, spins: Math.min(chunk, total - done), seed: (Date.now() + jobs.length * 104729) >>> 0 });
  }
  const acc = {};
  let next = 0, running = 0;
  const pump = () => {
    while (running < Math.max(1, os.cpus().length - 1) && next < jobs.length) {
      const job = jobs[next++];
      running++;
      const w = new Worker(__filename, { workerData: job });
      w.once('message', (r) => {
        const a = (acc[job.mode] = acc[job.mode] || { spins: 0, sum: 0, sumSqTerm: 0, base: 0, hits: 0, maxX: 0, maxWins: 0 });
        // combine: sum of x and sum of x^2 recovered from each chunk's mean and std error
        const mean = r.rtp, n = r.spins;
        const meanSq = r.rtpStdErr ** 2 * n + mean * mean;
        a.spins += n; a.sum += mean * n; a.sumSqTerm += meanSq * n; a.base += r.baseRtp * n; a.hits += r.hitRate * n;
        a.maxX = Math.max(a.maxX, r.maxX); a.maxWins += r.maxWins;
      });
      w.once('exit', () => { running--; if (next < jobs.length) pump(); else if (!running) report(); });
    }
  };
  const report = () => {
    for (const mode of modes) {
      const a = acc[mode];
      const mean = a.sum / a.spins;
      const se = Math.sqrt((a.sumSqTerm / a.spins - mean * mean) / a.spins);
      console.log(`${Game.MODES[mode].label.padEnd(9)} RTP ${(mean * 100).toFixed(3)}% ± ${(196 * se).toFixed(3)}%  base ${(a.base / a.spins * 100).toFixed(2)}%  hit ${(a.hits / a.spins * 100).toFixed(2)}%  max ${a.maxX.toFixed(0)}x  capped ${a.maxWins}  (${a.spins.toLocaleString()} spins)`);
    }
  };
  pump();
}
