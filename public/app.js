// Raidbreaker browser client. The server decides every outcome; this file
// only animates results and replays rounds locally for verification.
'use strict';

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const money = (n) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const xFmt = (x) => (x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x.toFixed(2)) + 'x';
const pct = (p, d = 1) => (p * 100).toFixed(d) + '%';
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Per-viewer preferences. Storage may be unavailable; everything works without it.
const prefs = {
  get(key, fallback) {
    try { const v = localStorage.getItem('raidbreaker.' + key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem('raidbreaker.' + key, JSON.stringify(value)); } catch { /* ignore */ }
  },
};

const SPEEDS = {
  normal: { spinMin: 650, stagger: 140, cycle: 70, fsPause: 650, winHold: 900, banner: 1400, teaser: 700, pop: 700 },
  turbo: { spinMin: 220, stagger: 50, cycle: 45, fsPause: 200, winHold: 320, banner: 650, teaser: 300, pop: 350 },
  super: { spinMin: 0, stagger: 0, cycle: 40, fsPause: 35, winHold: 60, banner: 260, teaser: 0, pop: 0 },
};

let S = null; // latest server state
let betIndex = 2;
let busy = false;
let inRaid = false;
let skipRequested = false;
let speed = prefs.get('speed', 'normal');
const heroById = (id) => Game.HEROES.find((h) => h.id === id) || Game.getHero(Game.DEFAULT_HERO);
if (!SPEEDS[speed]) speed = 'normal';

const sp = () => SPEEDS[speed];
const skipping = () => inRaid && skipRequested;
// Raid waits collapse to nothing once the player skips.
const wait = (ms) => (skipping() ? Promise.resolve() : sleep(ms));

async function api(path, body) {
  // The static build (see build-static.js) runs the game in the page instead.
  if (window.LocalApi) return window.LocalApi(path, body);
  const res = await fetch(path, body === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function setText(text, big = false) {
  const el = $('win-text');
  el.innerHTML = text;
  el.parentElement.classList.toggle('big', big);
}

/* ---------- Board ---------- */

const board = $('board');
const cells = [];
for (let r = 0; r < Game.REELS; r++) {
  const reel = document.createElement('div');
  reel.className = 'reel';
  cells.push([]);
  for (let row = 0; row < Game.ROWS; row++) {
    const cell = document.createElement('div');
    cell.innerHTML = '<span class="icon"></span><span class="lbl"></span>';
    reel.appendChild(cell);
    cells[r].push(cell);
  }
  board.appendChild(reel);
}

const LABELS = { W: 'Wild', B: 'Boss' };
function setCell(cell, sym, extra = '') {
  const def = Game.SYMBOLS[sym];
  cell.className = `cell sym-${sym}${def.kind === 'low' ? ' rune' : ''}${def.kind === 'high' ? ' high' : ''}${extra}`;
  cell.children[0].textContent = def.icon;
  cell.children[1].textContent = LABELS[sym] || (def.kind === 'high' ? def.name : '');
}

function renderGrid(grid, landed = false) {
  grid.forEach((col, r) => col.forEach((sym, row) => setCell(cells[r][row], sym, landed ? ' landed' : '')));
}

function clearMarks() {
  board.classList.remove('has-win');
  board.querySelectorAll('.loot-badge, .dmg-pop').forEach((b) => b.remove());
}

function markCells(list, cls) {
  list.forEach(([r, row]) => cells[r][row].classList.add(cls));
}

const SYMBOL_POOL = Object.keys(Game.SYMBOLS);
const randomSym = () => SYMBOL_POOL[Math.floor(Math.random() * SYMBOL_POOL.length)];

// Spins the reels until `gridPromise` resolves, then stops them left to right.
// opts.fixed: Set of cell keys (reel * ROWS + row) that hold a sticky wild and
// don't spin. opts.teaser(reel, grid): true to hold that reel back for suspense.
const cellKey = (r, row) => r * Game.ROWS + row;
async function spinReels(gridPromise, opts = {}) {
  clearMarks();
  const s = sp();
  const fixed = opts.fixed || new Set();
  const draw = (grid, extra) => grid.forEach((col, r) => col.forEach((sym, row) => {
    setCell(cells[r][row], sym, fixed.has(cellKey(r, row)) ? ' sticky' : extra);
  }));
  if (skipping()) { draw(await gridPromise, ''); return; }
  const stopped = Array(Game.REELS).fill(false);
  const tick = () => cells.forEach((col, r) => {
    if (!stopped[r]) col.forEach((cell, row) => { if (!fixed.has(cellKey(r, row))) setCell(cell, randomSym(), ' spinning'); });
  });
  fixed.forEach((k) => setCell(cells[Math.floor(k / Game.ROWS)][k % Game.ROWS], 'W', ' sticky'));
  tick();
  const timer = setInterval(tick, s.cycle);
  try {
    const [grid] = await Promise.all([gridPromise, sleep(s.spinMin)]);
    for (let r = 0; r < Game.REELS; r++) {
      if (opts.teaser && s.teaser && !skipping() && opts.teaser(r, grid)) {
        board.children[r].classList.add('teaser');
        await sleep(s.teaser);
        board.children[r].classList.remove('teaser');
      }
      stopped[r] = true;
      grid[r].forEach((sym, row) => setCell(cells[r][row], sym, fixed.has(cellKey(r, row)) ? ' sticky' : ' landed'));
      if (s.stagger && !skipping()) await sleep(s.stagger);
    }
  } finally {
    clearInterval(timer);
  }
}

async function banner(html, ms) {
  if (skipping()) return;
  const el = $('banner');
  el.innerHTML = html;
  el.classList.remove('hidden');
  await sleep(ms === undefined ? sp().banner : ms);
  el.classList.add('hidden');
}

/* ---------- Gear ---------- */

function renderGear(progress, newSlots = []) {
  const wrap = $('gear-slots');
  if (!wrap.children.length) {
    Game.GEAR.forEach((g) => {
      const d = document.createElement('div');
      d.className = 'gear-slot';
      d.innerHTML = `<span class="icon">${g.icon}</span>${esc(g.name)}`;
      wrap.appendChild(d);
    });
  }
  Game.GEAR.forEach((_, i) => {
    const el = wrap.children[i];
    el.classList.toggle('owned', !!((progress.gear >> i) & 1));
    el.classList.remove('new');
    if (newSlots.includes(i)) { void el.offsetWidth; el.classList.add('new'); }
  });
  $('gear-count').textContent = `${Game.gearCount(progress.gear)}/${Game.GEAR.length}`;
  $('loot-chance').textContent = pct(Game.lootChance(Game.getMode(S.mode), progress.dry));
}

/* ---------- Raid bar ---------- */

function renderRaidBar(raid, view) {
  const tier = Game.TIERS[raid.tier];
  const hero = heroById(raid.hero);
  const chip = $('raid-tier');
  chip.className = `tier-chip t-${tier.id}`;
  chip.textContent = raid.glory ? `${tier.name} · Glory or Wipe` : tier.name;
  $('raid-hero').textContent = `${hero.icon} ${hero.name}`;
  const list = raid.bosses;
  const cleared = view.bossIndex >= list.length;
  $('boss-name').textContent = cleared ? 'Raid cleared!' : list[view.bossIndex].name;
  const max = cleared ? 1 : list[view.bossIndex].hp;
  const hp = cleared ? 0 : Math.max(0, view.hp);
  const width = `${(hp / max) * 100}%`;
  $('hp-fill').style.width = width;
  $('hp-lag').style.width = width;
  $('hp-text').textContent = cleared ? 'All bosses down' : `${hp} / ${max} HP`;
  $('raid-mult').textContent = 'x' + view.mult;
  $('raid-next').textContent = cleared ? '—' : 'x' + list[view.bossIndex].reward;
  $('raid-spins').textContent = view.spinsLeft;
  $('raid-win').textContent = raid.glory ? (cleared ? 'MAX' : '—') : money(view.win);
  const charge = hero.charge;
  $('raid-charge').classList.toggle('hidden', !charge);
  if (charge) {
    const n = view.played % charge.every;
    $('raid-charge-val').textContent = n === charge.every - 1 ? 'READY ⚡' : `${n}/${charge.every - 1}`;
  }
  $('boss-pips').innerHTML = list.map((b, i) => {
    const cls = i < view.bossIndex ? 'dead' : i === view.bossIndex ? 'current' : '';
    const secret = i === Game.MODES[S.mode].bosses.length ? ' secret' : '';
    return `<span class="pip ${cls}${secret}">${esc(b.name)} · ${b.hp} HP · x${b.reward}</span>`;
  }).join('');
}

// Floating damage numbers on the cells that hit, and on the HP bar.
function showHits(step) {
  if (skipping() || !sp().pop) return;
  step.hits.forEach((h) => {
    const cell = cells[h.cell[0]][h.cell[1]];
    cell.classList.remove('hit', 'crit');
    void cell.offsetWidth;
    cell.classList.add('hit');
    if (h.crit || step.charged || h.marked) cell.classList.add('crit');
    const pop = document.createElement('span');
    pop.className = 'dmg-pop' + (h.crit ? ' crit' : h.marked ? ' marked' : '') + (step.charged ? ' charged' : '');
    pop.textContent = `-${h.dmg}${h.crit ? ' CRIT' : ''}`;
    cell.appendChild(pop);
  });
  if (step.damage > 0) {
    const pop = $('hp-pop');
    pop.textContent = `-${step.damage}`;
    pop.classList.remove('show');
    void pop.offsetWidth;
    pop.classList.add('show');
    const track = $('hp-track');
    track.classList.remove('shake');
    void track.offsetWidth;
    track.classList.add('shake');
  }
}

// What the raid summary banner says.
function raidRecap(raid, modeId) {
  const m = Game.getMode(modeId);
  const start = m.tiers[raid.tier].startBoss;
  const last = raid.steps[raid.steps.length - 1];
  const end = last ? last.bossIndex : start;
  const dmg = raid.steps.reduce((n, st) => n + st.damage, 0);
  const crits = raid.steps.reduce((n, st) => n + st.hits.filter((h) => h.crit).length, 0);
  const best = raid.steps.reduce((x, st) => Math.max(x, st.winX), 0);
  const parts = [`${end - start}/${raid.bosses.length - start} bosses`, `${dmg} damage`];
  if (crits) parts.push(`${crits} crit${crits > 1 ? 's' : ''}`);
  if (!raid.glory && best > 0) parts.push(`best spin ${xFmt(best)}`);
  let near = '';
  if (last && !raid.cleared) {
    const boss = raid.bosses[end];
    if (last.hp <= Math.max(3, boss.hp * 0.25)) near = `<small class="near">${esc(boss.name)} survived with ${last.hp} HP!</small>`;
  }
  return `<small>${parts.join(' · ')}</small>${near}`;
}

async function playRaid(round) {
  const raid = round.raid;
  const bet = round.bet;
  const tier = Game.TIERS[raid.tier];
  const hero = heroById(raid.hero);
  const cfg = Game.getMode(round.mode).tiers[raid.tier];
  inRaid = true;
  skipRequested = false;
  const view = { bossIndex: cfg.startBoss, hp: 0, mult: raid.startMult, spinsLeft: raid.spins, win: 0, played: 0 };
  view.hp = raid.bosses[view.bossIndex].hp;
  $('raid-bar').classList.remove('hidden');
  renderRaidBar(raid, view);
  const sticky = cfg.sticky ? ` · wilds stick for ${cfg.sticky} spin${cfg.sticky > 1 ? 's' : ''}` : '';
  await banner(`${esc(tier.title)}<small>${hero.icon} ${esc(hero.name)} · ${raid.glory
    ? `Glory or Wipe: beat every boss for ${Game.MODES[round.mode].maxWinX.toLocaleString()}x. Spin wins don't count.`
    : `${raid.spins} spins · starting multiplier x${raid.startMult}${sticky}`}</small>`);

  for (const step of raid.steps) {
    const hpBefore = view.hp;
    const alive = view.bossIndex < raid.bosses.length;
    const fixed = new Set(step.stickyCells.map(([r, row]) => cellKey(r, row)));
    // Hold a wild reel back when the hits so far leave the boss within reach.
    const teaser = (r) => {
      if (!alive || r < 1 || r > 3) return false;
      const sofar = step.hits.filter((h) => h.cell[0] < r).reduce((n, h) => n + h.dmg, 0);
      const left = hpBefore - sofar;
      return left > 0 && left <= 3;
    };
    await spinReels(Promise.resolve(step.grid), { fixed, teaser });
    if (!raid.glory && step.wins.length) {
      board.classList.add('has-win');
      step.wins.forEach((w) => markCells(w.cells, 'win'));
    }
    if (step.charged && step.hits.length) setText('⚡ Arcane Charge: double damage!');
    showHits(step);
    view.played++;
    view.bossIndex = step.bossIndex;
    view.hp = step.hp;
    view.mult = step.mult;
    view.spinsLeft = step.spinsLeft;
    view.win += step.winX * bet;
    renderRaidBar(raid, view);
    if (!raid.glory && step.winX > 0) setText(`${money(step.winX * bet)} <small>(x${step.multUsed})</small>`);
    if (step.damage > 0 || step.hits.length) await wait(sp().pop);
    for (const ev of step.events) {
      if (ev.type === 'bossKilled') {
        await banner(`${esc(raid.bosses[ev.boss].name)} defeated!<small>Multiplier x${ev.mult} · +${ev.spins} spins</small>`, sp().banner);
      } else if (ev.type === 'retrigger') {
        setText(`+${ev.spins} spins!`);
      } else if (ev.type === 'resurrect') {
        await banner(`✨ Resurrection!<small>The Priest buys ${ev.spins} more spins</small>`, sp().banner);
      } else if (ev.type === 'maxWin') {
        await banner(`MAX WIN<small>${Game.MODES[round.mode].maxWinX.toLocaleString()}x</small>`, sp().banner * 1.5);
      }
    }
    await wait(sp().fsPause);
  }
  // Always end on the final state, even after a skip.
  const last = raid.steps[raid.steps.length - 1];
  if (last) {
    renderGrid(last.grid);
    last.stickyCells.forEach(([r, row]) => cells[r][row].classList.add('sticky'));
  }
  renderRaidBar(raid, { ...view, win: raid.totalX * bet });
  inRaid = false;
  skipRequested = false;
  $('raid-bar').classList.add('hidden');
  const recap = raidRecap(raid, round.mode);
  if (raid.glory) {
    await banner(raid.cleared ? `GLORY!<small>Every boss down: ${money(round.totalWin)}</small>${recap}` : `WIPE${recap}`, sp().banner * 1.6);
  } else {
    await banner(`${raid.cleared ? 'RAID CLEARED!' : 'Raid complete'}<small>${money(raid.totalX * bet)} (${xFmt(raid.totalX)})</small>${recap}`, sp().banner * 1.6);
  }
}

/* ---------- Skip bonus ---------- */

const skipModal = $('skip-modal');
$('skip-bonus').addEventListener('click', () => {
  if (!inRaid) return;
  if (prefs.get('skipNoConfirm', false)) { skipRequested = true; return; }
  $('skip-dont-ask').checked = false;
  skipModal.classList.remove('hidden');
  $('skip-confirm').focus();
});
$('skip-cancel').addEventListener('click', () => skipModal.classList.add('hidden'));
$('skip-confirm').addEventListener('click', () => {
  if ($('skip-dont-ask').checked) prefs.set('skipNoConfirm', true);
  skipModal.classList.add('hidden');
  skipRequested = true;
});

/* ---------- Class picker ---------- */

// Fills `el` with one button per class. tier: show each class's clear rate
// for that tier. locked: only the given class can be picked.
function renderHeroPick(el, selected, { tier = null, locked = false } = {}) {
  const m = Game.MODES[S.mode];
  el.innerHTML = Game.HEROES.map((h) => {
    const clear = tier !== null ? `<small>clears ${pct(m.clearRate[h.id][tier], 1)}</small>` : `<small>${esc(h.style)}</small>`;
    const off = locked && h.id !== selected ? 'disabled' : '';
    return `<button class="hero-card${h.id === selected ? ' active' : ''}" data-hero="${h.id}" role="radio" aria-checked="${h.id === selected}" ${off}
      title="${esc(h.ability)}"><span class="icon">${h.icon}</span>${esc(h.name)}${clear}</button>`;
  }).join('');
}

function heroDesc(id) {
  const h = heroById(id);
  return `<b>${h.icon} ${esc(h.name)}</b> · ${esc(h.style)}. ${esc(h.ability)}`;
}

/* ---------- Bonus decision (gamble or play) ---------- */

function renderLadder(tier, glory) {
  $('tier-ladder').innerHTML = Game.TIERS.map((t, i) => {
    const cls = i === tier ? 'current' : i > tier ? 'locked' : '';
    const value = glory ? '' : `<span class="hint">~${xFmt(Game.MODES[S.mode].calibration[i])} avg</span>`;
    return `<li class="${cls}"><span><span class="tier-chip t-${t.id}">${esc(t.name)}</span> ${esc(t.title)}</span>${value}</li>`;
  }).join('');
}

function sourceText(bonus, round) {
  switch (bonus.source) {
    case 'scatter': return `${round.base.scatterCells.length} Boss Gates opened the way.`;
    case 'gear': return 'Fully geared. The raid awaits.';
    case 'scatter+gear': return 'Boss Gates and a full gear set: tier raised!';
    case 'buy': return 'Bonus bought.';
    case 'mystery': return 'The Mystery Buy reveals…';
    case 'glory': return 'Glory or Wipe: clear every boss for the max win.';
    default: return '';
  }
}

// Runs the gamble/play choice until the round is finished. Returns the final response.
function decide(resp) {
  return new Promise((resolve, reject) => {
    const overlay = $('decision');
    const card = overlay.firstElementChild;
    let current = resp;
    const draw = () => {
      const round = current.round;
      const tier = round.bonus.tier;
      const hero = round.bonus.hero || S.hero;
      $('decision-hero').innerHTML = `Raiding as ${heroDesc(hero)} Clears ${pct(Game.MODES[round.mode].clearRate[hero][tier], 1)} of ${esc(Game.TIERS[tier].name)} raids.`;
      $('decision-title').textContent = Game.TIERS[tier].name + '!';
      const ascended = round.bonus.tier > round.bonus.triggeredTier && !round.gambles.length;
      $('decision-sub').textContent = sourceText(round.bonus, round) + (ascended ? ` Ascended from ${Game.TIERS[round.bonus.triggeredTier].name}!` : '');
      renderLadder(tier, round.bonus.glory);
      const g = $('gamble');
      if (Game.canGamble(round)) {
        g.classList.remove('hidden');
        g.textContent = `Gamble for ${Game.TIERS[tier + 1].name} (${pct(Game.gambleChance(round.mode, tier))})`;
      } else {
        g.classList.add('hidden');
      }
    };
    const done = (r) => { overlay.classList.add('hidden'); cleanup(); resolve(r); };
    const fail = (e) => { overlay.classList.add('hidden'); cleanup(); reject(e); };
    const onGamble = async () => {
      setButtons(true);
      try {
        const r = await api('/api/bonus/gamble', {});
        card.classList.remove('gamble-flash-win', 'gamble-flash-lose');
        void card.offsetWidth;
        card.classList.add(r.gamble.won ? 'gamble-flash-win' : 'gamble-flash-lose');
        S = r.state;
        if (!r.gamble.won) {
          await sleep(Math.max(sp().winHold, 400));
          await banner('Gamble lost<small>The bonus is forfeited.</small>', sp().banner);
          return done(r);
        }
        current = r;
        draw();
      } catch (e) { return fail(e); } finally { setButtons(false); }
    };
    const onPlay = async () => {
      setButtons(true);
      try { done(await api('/api/bonus/play', {})); } catch (e) { fail(e); } finally { setButtons(false); }
    };
    const setButtons = (disabled) => { $('gamble').disabled = disabled; $('play-bonus').disabled = disabled; };
    const cleanup = () => {
      $('gamble').removeEventListener('click', onGamble);
      $('play-bonus').removeEventListener('click', onPlay);
    };
    $('gamble').addEventListener('click', onGamble);
    $('play-bonus').addEventListener('click', onPlay);
    draw();
    overlay.classList.remove('hidden');
  });
}

async function bonusFlow(resp, announce = true) {
  const bonus = resp.round.bonus;
  if (announce) {
    if (bonus.source === 'gear' || bonus.source === 'scatter+gear') await banner('FULLY GEARED!<small>Your set is complete. Into the raid.</small>');
    if (bonus.tier > bonus.triggeredTier) {
      await banner(`ASCENSION!<small>${esc(Game.TIERS[bonus.triggeredTier].name)} → ${esc(Game.TIERS[bonus.tier].name)}</small>`, sp().banner * 1.4);
    }
  }
  const final = await decide(resp);
  if (final.round.raid) await playRaid(final.round);
  return final;
}

/* ---------- Rounds ---------- */

function showResult(round) {
  if (round.totalWin > 0) {
    const big = round.totalX >= 20;
    setText(`${big ? 'BIG WIN ' : 'WIN '}${money(round.totalWin)} <small>(${xFmt(round.totalX)})</small>`, big);
  } else if (round.bonus && round.bonus.glory) {
    setText('Wipe. No win this time.');
  } else {
    setText(round.kind === 'buy' ? 'No win' : 'No win · spin again');
  }
}

async function showBase(round) {
  const base = round.base;
  if (base.wins.length) {
    board.classList.add('has-win');
    base.wins.forEach((w) => markCells(w.cells, 'win'));
  }
  if (base.scatterCells.length >= 3) markCells(base.scatterCells, 'win');
  if (round.loot) {
    round.loot.items.forEach((it) => {
      const [r, row] = it.cell;
      const badge = document.createElement('span');
      badge.className = 'loot-badge';
      badge.textContent = Game.GEAR[it.slot].icon;
      badge.title = Game.GEAR[it.slot].name;
      cells[r][row].appendChild(badge);
    });
    renderGear({ gear: round.loot.gear, dry: round.progressBefore.dry }, round.loot.items.map((it) => it.slot));
    const names = round.loot.items.map((it) => Game.GEAR[it.slot].name).join(', ');
    setText(round.loot.cache ? `${esc(round.loot.cache)}! ${esc(names)}` : `Loot: ${esc(names)}`);
  }
  if (base.winX > 0 && !round.loot) setText(`${money(base.winX * round.bet)}`);
  if (base.winX > 0 || round.loot || round.bonus) await sleep(sp().winHold);
}

async function run(task) {
  if (busy) return;
  busy = true;
  updateControls();
  try {
    await task();
  } catch (e) {
    setText(esc(e.message));
    await refresh();
  } finally {
    busy = false;
    inRaid = false;
    $('raid-bar').classList.add('hidden');
    updateControls();
  }
}

function spin() {
  return run(async () => {
    const bet = S.bets[betIndex];
    $('balance').textContent = money(S.balance - bet);
    setText('&nbsp;');
    let resp;
    const request = api('/api/spin', { bet }).then((r) => { resp = r; return r.round.base.grid; });
    await spinReels(request);
    S = resp.state;
    await showBase(resp.round);
    const final = resp.done ? resp : await bonusFlow(resp);
    S = final.state;
    render();
    showResult(final.round);
  });
}

function buy(buyId) {
  return run(async () => {
    const bet = S.bets[betIndex];
    const resp = await api('/api/buy', { bet, buy: buyId });
    S = resp.state;
    render();
    clearMarks();
    const b = resp.round.bonus;
    if (b.source === 'mystery' || b.source === 'glory') {
      await banner(`${b.source === 'glory' ? 'Glory or Wipe' : 'Mystery Buy'}<small>${esc(Game.TIERS[b.triggeredTier].name)}</small>`);
    }
    const final = await bonusFlow(resp);
    S = final.state;
    render();
    showResult(final.round);
  });
}

/* ---------- Controls ---------- */

function updateControls() {
  const pending = !!(S && S.pending);
  const bet = S ? S.bets[betIndex] : 0;
  $('spin').disabled = busy || pending || !S || S.balance < bet || !heroChosen;
  $('buy-open').disabled = busy || pending || !S || !heroChosen;
  document.querySelectorAll('#heroes button').forEach((b) => { b.disabled = busy || pending; });
  $('bet-down').disabled = busy || betIndex === 0;
  $('bet-up').disabled = busy || !S || betIndex === S.bets.length - 1;
  document.querySelectorAll('#modes button').forEach((b) => { b.disabled = busy || pending; });
  $('rotate').disabled = busy || pending;
  $('save-client-seed').disabled = busy || pending;
}

$('spin').addEventListener('click', spin);
$('bet-down').addEventListener('click', () => { betIndex = Math.max(0, betIndex - 1); prefs.set('bet', betIndex); render(); });
$('bet-up').addEventListener('click', () => { betIndex = Math.min(S.bets.length - 1, betIndex + 1); prefs.set('bet', betIndex); render(); });
$('speed').value = speed;
$('speed').addEventListener('change', (e) => { speed = e.target.value; prefs.set('speed', speed); });
$('reset-balance').addEventListener('click', async () => { S = await api('/api/reset-balance', {}); render(); });
document.addEventListener('keydown', (e) => {
  if (e.code !== 'Space' || e.repeat) return;
  if (/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(document.activeElement.tagName)) return;
  e.preventDefault();
  if (!$('spin').disabled) spin();
});

// Buy menu
const buyModal = $('buy-modal');
function buyBlurb(b, mode) {
  const m = Game.MODES[mode];
  switch (b.id) {
    case 'normal': return `${m.tiers[0].spins} spins from the first boss`;
    case 'super': return `${m.tiers[1].spins} spins, starts at x${m.bosses[0].reward}`;
    case 'hidden': return `${m.tiers[2].spins} spins, starts at x${m.bosses[1].reward}, more wilds`;
    case 'mystery': return Game.MYSTERY_WEIGHTS.map((w, i) => `${pct(w, 0)} ${Game.TIERS[i].name.replace(' Bonus', '')}`).join(' · ');
    case 'glory': return `Random tier (${pct(Game.GLORY_WEIGHTS[3], 0)} Super Hidden). Beat every boss = ${m.maxWinX.toLocaleString()}x, else nothing. Priced for your ${heroById(S.hero).name}.`;
    default: return '';
  }
}
function renderBuyList() {
  const bet = S.bets[betIndex];
  $('buy-list').innerHTML = Game.BUYS.map((b) => {
    const priceX = Game.buyPrice(S.mode, b.id, S.hero);
    const cost = Math.round(priceX * bet * 100) / 100;
    return `<button class="buy-item" data-buy="${b.id}" ${cost > S.balance ? 'disabled' : ''}>
      <span>${esc(b.name)}<small>${esc(buyBlurb(b, S.mode))}</small></span>
      <span class="price">${money(cost)}<small>${priceX}x bet</small></span></button>`;
  }).join('');
}
$('buy-open').addEventListener('click', () => {
  renderBuyList();
  buyModal.classList.remove('hidden');
});

/* ---------- Class (profile) ---------- */

// The class is chosen before the first spin and kept as the player's profile.
let heroChosen = prefs.get('heroChosen', false);

async function chooseHero(id) {
  if (id !== S.hero) S = await api('/api/hero', { hero: id });
  prefs.set('hero', S.hero);
  render();
}

$('heroes').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-hero]');
  if (!btn || btn.disabled || btn.dataset.hero === S.hero) return;
  try { await chooseHero(btn.dataset.hero); } catch (err) { setText(esc(err.message)); }
});

const classModal = $('class-modal');
let modalPick = null;
function drawClassModal() {
  renderHeroPick($('class-modal-pick'), modalPick);
  $('class-modal-desc').innerHTML = heroDesc(modalPick);
}
function openClassModal() {
  modalPick = S.hero;
  drawClassModal();
  classModal.classList.remove('hidden');
}
$('class-modal-pick').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-hero]');
  if (!btn) return;
  modalPick = btn.dataset.hero;
  drawClassModal();
});
$('class-confirm').addEventListener('click', async () => {
  try {
    await chooseHero(modalPick);
    heroChosen = true;
    prefs.set('heroChosen', true);
    classModal.classList.add('hidden');
    updateControls();
  } catch (err) { setText(esc(err.message)); }
});
$('buy-list').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-buy]');
  if (!btn || btn.disabled) return;
  buyModal.classList.add('hidden');
  buy(btn.dataset.buy);
});
$('buy-close').addEventListener('click', () => buyModal.classList.add('hidden'));
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  buyModal.classList.add('hidden');
  skipModal.classList.add('hidden');
});

// Modes
$('modes').innerHTML = Object.entries(Game.MODES).map(([id, m]) => `<button data-mode="${id}">${esc(m.label)}</button>`).join('');
$('modes').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-mode]');
  if (!btn || btn.disabled || btn.dataset.mode === S.mode) return;
  try { S = await api('/api/mode', { mode: btn.dataset.mode }); render(); } catch (err) { setText(esc(err.message)); }
});

/* ---------- Side panel ---------- */

document.querySelectorAll('.tabs button').forEach((btn) => btn.addEventListener('click', () => {
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b === btn));
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('hidden', p.dataset.panel !== btn.dataset.tab));
  prefs.set('tab', btn.dataset.tab);
  if (btn.dataset.tab === 'dev') loadDevSeed();
}));

$('save-client-seed').addEventListener('click', async () => {
  try { S = await api('/api/client-seed', { clientSeed: $('client-seed').value }); render(); } catch (e) { setText(esc(e.message)); }
});
$('rotate').addEventListener('click', async () => {
  try { S = await api('/api/rotate', {}); render(); } catch (e) { setText(esc(e.message)); }
});

function kindLabel(h) {
  if (h.kind !== 'buy') return 'Spin';
  const b = Game.BUYS.find((x) => x.id === h.buy);
  return b ? b.name.replace('Buy ', '') : h.buy;
}

function renderHistory() {
  const el = $('history');
  if (!S.history.length) { el.innerHTML = '<p class="hint">No rounds yet.</p>'; return; }
  el.innerHTML = S.history.map((h, i) => {
    const tier = h.tier !== null ? `<span class="tier-chip t-${Game.TIERS[h.tier].id}">${esc(Game.TIERS[h.tier].name.replace(' Bonus', ''))}</span>${h.hero ? heroById(h.hero).icon : ''}` : '';
    const action = h.serverSeed ? `<button data-verify="${i}">Verify</button>` : '<span class="sub">rotate to verify</span>';
    const cls = h.tier !== null ? 'raid' : h.x >= 20 ? 'big' : '';
    return `<div class="item ${cls}"><div>#${h.nonce} ${esc(Game.MODES[h.mode].label)} · ${esc(kindLabel(h))} ${tier}
      <div class="sub">cost ${money(h.cost)}${h.gambles ? ` · ${h.gambles} gamble${h.gambles > 1 ? 's' : ''}` : ''}</div></div>
      <div><span class="${h.win > 0 ? 'win-pos' : ''}">${money(h.win)}</span> ${action}</div></div>`;
  }).join('');
}
$('history').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-verify]');
  if (!btn) return;
  const h = S.history[Number(btn.dataset.verify)];
  $('v-server').value = h.serverSeed;
  $('v-client').value = h.clientSeed;
  $('v-nonce').value = h.nonce;
  $('v-bet').value = h.bet;
  $('v-mode').value = h.mode;
  $('v-kind').value = h.buy || 'spin';
  $('v-hero').value = h.hero || Game.DEFAULT_HERO;
  $('v-gambles').value = h.gambles;
  $('v-gear').value = h.progressBefore.gear;
  $('v-dry').value = h.progressBefore.dry;
  document.querySelector('.tabs button[data-tab="verify"]').click();
  verify(h);
});

function renderRevealed() {
  const el = $('revealed');
  if (!S.revealed.length) { el.innerHTML = '<p class="hint">None yet.</p>'; return; }
  el.innerHTML = S.revealed.map((r) => `<div class="item"><div><div class="sub">Server seed (${r.spins} rounds)</div><code>${esc(r.serverSeed)}</code>
    <div class="sub">Client seed: ${esc(r.clientSeed)}</div></div></div>`).join('');
}

// Verify tab
$('v-mode').innerHTML = Object.entries(Game.MODES).map(([id, m]) => `<option value="${id}">${esc(m.label)}</option>`).join('');
$('v-kind').innerHTML = '<option value="spin">Paid spin</option>' + Game.BUYS.map((b) => `<option value="${b.id}">${esc(b.name)}</option>`).join('');
$('v-hero').innerHTML = Game.HEROES.map((h) => `<option value="${h.id}">${h.icon} ${esc(h.name)}</option>`).join('');
$('v-run').addEventListener('click', () => verify(null));

function verify(expected) {
  const out = $('v-out');
  const serverSeed = $('v-server').value.trim();
  const clientSeed = $('v-client').value.trim();
  if (!serverSeed || !clientSeed) { out.innerHTML = '<p class="bad">Enter both seeds.</p>'; return; }
  const kind = $('v-kind').value;
  const opts = {
    bet: Number($('v-bet').value) || 1,
    mode: $('v-mode').value,
    buy: kind === 'spin' ? null : kind,
    gambles: Number($('v-gambles').value) || 0,
    hero: $('v-hero').value,
    progress: { gear: Number($('v-gear').value) || 0, dry: Number($('v-dry').value) || 0 },
  };
  const nonce = Number($('v-nonce').value) || 0;
  const r = Game.playRound(Fair.streams(serverSeed, clientSeed, nonce), opts);
  const hash = Fair.hashSeed(serverSeed);
  const known = S.revealed.some((x) => x.serverSeedHash === hash) || (expected && expected.serverSeedHash === hash);
  const match = expected ? Math.abs(expected.win - r.totalWin) < 0.005 : null;
  const grid = r.base ? `<div class="mini-grid">${r.base.grid[0].map((_, row) => r.base.grid.map((col) => `<div>${Game.SYMBOLS[col[row]].icon}</div>`).join('')).join('')}</div>` : '';
  const bonus = r.bonus
    ? `<p>Bonus: <span class="tier-chip t-${Game.TIERS[r.bonus.triggeredTier].id}">${esc(Game.TIERS[r.bonus.triggeredTier].name)}</span>${r.bonus.tier !== r.bonus.triggeredTier ? ` → ${r.bonus.tier === null ? 'forfeited' : esc(Game.TIERS[r.bonus.tier].name)}` : ''}${r.raid ? ` · ${heroById(r.raid.hero).icon} raid ${xFmt(r.raid.totalX)} over ${r.raid.steps.length} spins` : ''}</p>`
    : '';
  out.innerHTML = `
    <p>SHA-256 of server seed:</p><code>${hash}</code>
    <p class="${known ? 'ok' : 'hint'}">${known ? '✓ Matches a hash the server committed to' : 'Compare this with the hash shown before you played.'}</p>
    <p>Result: <b>${money(r.totalWin)}</b> (${xFmt(r.totalX)}) for a cost of ${money(r.costX * opts.bet)}</p>
    ${expected ? `<p class="${match ? 'ok' : 'bad'}">${match ? '✓ Matches the server\'s result' : `✗ Server paid ${money(expected.win)}`}</p>` : ''}
    ${bonus}${grid}`;
}

// Paytable
function renderPaytable() {
  const m = Game.MODES[S.mode];
  const rows = Object.entries(Game.SYMBOLS).filter(([, d]) => d.pays).map(([id, d]) => {
    const min = Game.minLength(m, id);
    const cell = (len) => (len < min ? '—' : xFmt(Game.payFor(m, id, len)));
    return `<tr><td><span class="pt-sym"><span class="icon">${d.icon}</span>${esc(d.name)}</span></td><td>${cell(3)}</td><td>${cell(4)}</td><td>${cell(5)}</td></tr>`;
  }).join('');
  const tiers = Game.TIERS.map((t, i) => {
    const c = m.tiers[i];
    const startMult = c.startBoss > 0 ? m.bosses[c.startBoss - 1].reward : 1;
    const odds = i < Game.TOP_TIER ? pct(Game.gambleChance(S.mode, i)) : '—';
    return `<tr><td><span class="tier-chip t-${t.id}">${esc(t.name.replace(' Bonus', ''))}</span></td><td>${c.spins}</td><td>x${startMult}</td><td>${c.sticky || '—'}</td><td>${xFmt(m.calibration[i])}</td><td>${odds}</td></tr>`;
  }).join('');
  const allBosses = Game.raidBosses(m, Game.TOP_TIER);
  const hpRows = allBosses.map((b, i) => `<tr><td>${esc(b.name)}${i === m.bosses.length ? ' <em>secret</em>' : ''}</td>${Game.TIERS.map((_, t) => {
    const list = Game.raidBosses(m, t);
    return `<td>${i < m.tiers[t].startBoss || i >= list.length ? '—' : list[i].hp}</td>`;
  }).join('')}<td>x${b.reward}</td></tr>`).join('');
  const tierHead = Game.TIERS.map((t) => `<th>${esc(t.name.replace(' Bonus', '').replace('Super Hidden', 'S.Hidden'))}</th>`).join('');
  const classRows = Game.HEROES.map((h) => `<tr><td>${h.icon} ${esc(h.name)}</td>${Game.TIERS.map((_, t) => `<td>${pct(m.clearRate[h.id][t], 1)}</td>`).join('')}</tr>`).join('');
  const classInfo = Game.HEROES.map((h) => `<p class="hint"><b>${h.icon} ${esc(h.name)}</b> (${esc(h.style)}): ${esc(h.ability)}</p>`).join('');
  $('paytable').innerHTML = `
    <h3>${esc(m.label)} · max win ${m.maxWinX.toLocaleString()}x</h3>
    <p class="hint">${esc(m.blurb)} Pays are per way, as multiples of your total bet.</p>
    <table><tr><th>Symbol</th><th>3</th><th>4</th><th>5</th></tr>${rows}</table>
    <p class="hint">🚩 Wild on reels 2–4 · 💀 Boss Gate scatter pays ${Object.entries(m.scatterPay).map(([n, x]) => `${n}: ${xFmt(x * m.scale)}`).join(', ')}</p>
    <h3>Bonus tiers</h3>
    <table><tr><th>Tier</th><th>Spins</th><th>Start</th><th>Sticky</th><th>Avg</th><th>Gamble up</th></tr>${tiers}</table>
    <p class="hint">Sticky: in the raid, a wild stays on the reels for that many more spins and hits the boss again each spin.</p>
    <p class="hint">3 / 4 / 5 Boss Gates start Normal / Super / Hidden. A full gear set starts Normal (or raises a scatter bonus one tier). Ascension when any bonus starts: ${Game.ASCEND_CHANCE.map((c, i) => `${Game.TIERS[i].name.replace(' Bonus', '')}→${Game.TIERS[i + 1].name.replace(' Bonus', '')} ${pct(c, 1)}`).join(', ')}.</p>
    <h3>Raid bosses (HP by tier)</h3>
    <table><tr><th>Boss</th>${tierHead}<th>Kill</th></tr>${hpRows}</table>
    <p class="hint">Each wild hit deals 1 damage. A kill sets the multiplier shown (the Mage's is 1.5x) and adds ${m.bossKillSpins} spin${m.bossKillSpins > 1 ? 's' : ''}. 2+ Boss Gates in a raid add ${m.retrigger}.</p>
    <h3>Classes</h3>
    ${classInfo}
    <p class="hint">Pick a class before each raid. Raid pays are balanced per class, so every class has the same average win at each tier. They differ in how the raid plays and how often it clears:</p>
    <table><tr><th>Clears</th>${tierHead}</tr>${classRows}</table>
    <h3>Gear loot</h3>
    <p class="hint">Drop chance ${pct(m.loot.base)} per spin, +${pct(m.loot.perDrySpin, 3)} per spin without a bonus, up to ${pct(m.loot.max)}. ${Game.CACHES.map((c) => `${esc(c.name)} (${c.pieces} pieces) ${pct(c.chance, 0)} of drops`).join(', ')}.</p>
    <p class="hint">Target RTP 98.5–99% for spins and buys. Simulated, not certified.</p>`;
}

// Dev tab
async function loadDevSeed() {
  if (!S || !S.dev) return;
  try { $('dev-seed').textContent = (await api('/api/dev/seed')).serverSeed; } catch { /* ignore */ }
}
$('dev-set-seed').addEventListener('click', async () => {
  try { S = await api('/api/dev/seed', { serverSeed: $('dev-seed-input').value }); render(); loadDevSeed(); } catch (e) { setText(esc(e.message)); }
});
$('dev-preview').addEventListener('click', async () => {
  const { rows } = await api('/api/dev/preview?count=50');
  $('dev-preview-out').innerHTML = rows.map((r) => {
    const tier = r.bonus ? ` <span class="tier-chip t-${Game.TIERS[r.bonus.tier].id}">${esc(Game.TIERS[r.bonus.tier].name.replace(' Bonus', ''))}</span>` : '';
    return `<div class="item ${r.bonus ? 'raid' : r.x >= 20 ? 'big' : ''}"><span>#${r.nonce}${tier}${r.loot ? ` <span class="sub">+${r.loot} loot (${r.gear}/6)</span>` : ''}</span><span class="${r.x > 0 ? 'win-pos' : ''}">${xFmt(r.x)}</span></div>`;
  }).join('');
});
$('dev-sim').addEventListener('click', async () => {
  const btn = $('dev-sim');
  btn.disabled = true;
  $('dev-sim-out').innerHTML = '<p class="hint">Running…</p>';
  try {
    const s = await api('/api/dev/simulate', { spins: Number($('dev-sim-count').value), mode: S.mode });
    const every = (v) => (v ? Math.round(v).toLocaleString() : '—');
    $('dev-sim-out').innerHTML = `<table>
      <tr><td>RTP</td><td>${pct(s.rtp, 2)} ± ${pct(1.96 * s.rtpStdErr, 2)}</td></tr>
      <tr><td>Base / bonus</td><td>${pct(s.baseRtp, 1)} / ${pct(s.bonusRtp, 1)}</td></tr>
      <tr><td>Hit rate</td><td>${pct(s.hitRate)}</td></tr>
      <tr><td>Bonus every</td><td>${every(s.bonusEvery)} spins</td></tr>
      <tr><td>Tiers</td><td>${Object.entries(s.tierCounts).map(([k, v]) => `${k} ${v}`).join(', ')}</td></tr>
      <tr><td>Loot drop every</td><td>${every(s.dropEvery)} spins</td></tr>
      <tr><td>Gear set median</td><td>${every(s.gearSetSpins.median)} spins</td></tr>
      <tr><td>Max win</td><td>${xFmt(s.maxX)}</td></tr>
      ${s.buckets.map((b) => `<tr><td>${b.label}</td><td>${pct(b.rate, 2)}</td></tr>`).join('')}
    </table>`;
  } catch (e) {
    $('dev-sim-out').innerHTML = `<p class="bad">${esc(e.message)}</p>`;
  } finally {
    btn.disabled = false;
  }
});

/* ---------- Render ---------- */

function render() {
  $('balance').textContent = money(S.balance);
  $('bet').textContent = money(S.bets[betIndex]);
  $('seed-hash').textContent = S.serverSeedHash;
  if (document.activeElement !== $('client-seed')) $('client-seed').value = S.clientSeed;
  $('nonce').textContent = S.nonce;
  document.querySelectorAll('#modes button').forEach((b) => b.classList.toggle('active', b.dataset.mode === S.mode));
  $('mode-blurb').textContent = Game.MODES[S.mode].blurb;
  const hero = heroById(S.hero);
  renderHeroPick($('heroes'), S.hero);
  $('class-name').textContent = `${hero.icon} ${hero.name}`;
  $('class-ability').textContent = hero.ability;
  $('dev-tab').classList.toggle('hidden', !S.dev);
  renderGear(S.progress);
  renderHistory();
  renderRevealed();
  renderPaytable();
  updateControls();
  if (S.dev && !$('dev-tab').classList.contains('hidden') && $('dev-tab').classList.contains('active')) loadDevSeed();
}

async function refresh() {
  S = await api('/api/state');
  render();
}

(async function init() {
  S = await api('/api/state');
  betIndex = Math.min(prefs.get('bet', betIndex), S.bets.length - 1);
  // The server forgets the class on restart; the browser remembers it.
  const savedHero = prefs.get('hero', null);
  if (savedHero && savedHero !== S.hero && !S.pending && Game.HEROES.some((h) => h.id === savedHero)) {
    try { S = await api('/api/hero', { hero: savedHero }); } catch { /* keep the server's */ }
  }
  renderGrid(Game.MODES[S.mode].strips.base.map((strip) => strip.slice(0, Game.ROWS)));
  render();
  const tab = prefs.get('tab', 'fair');
  const tabBtn = document.querySelector(`.tabs button[data-tab="${tab}"]`);
  if (tabBtn && !tabBtn.classList.contains('hidden')) tabBtn.click();
  // A bonus left waiting (e.g. after a reload) picks up where it stopped.
  if (S.pending) {
    if (S.pending.round.base) renderGrid(S.pending.round.base.grid);
    await run(async () => {
      const final = await bonusFlow({ round: S.pending.round, state: S }, false);
      S = final.state;
      render();
      showResult(final.round);
    });
  }
  if (!heroChosen) openClassModal();
})();
