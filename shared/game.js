// Raidbreaker slot engine. Pure and deterministic: the same seeds and player
// choices always produce the same round, which is what makes the verifier work.
//
// Randomness comes from `rngFor(channel)`, one independent stream per channel:
//   ''        base spin, loot and ascension rolls (or the buy roll)
//   'gamble'  one float per gamble attempt
//   'raid'    the bonus raid
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Game = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const REELS = 5;
  const ROWS = 4;
  const MAX_FREE_SPINS = 300;
  const BUY_RTP = 0.9875;

  // Base pays as multiples of the total bet for 3, 4 and 5 of a kind (per way).
  // Each mode multiplies every pay by its `scale` to hit its target RTP.
  const SYMBOLS = {
    R: { name: 'Ruby Rune', kind: 'low', icon: 'ᚱ', pays: [0.1, 0.25, 0.65] },
    S: { name: 'Sapphire Rune', kind: 'low', icon: 'ᛋ', pays: [0.1, 0.25, 0.65] },
    T: { name: 'Topaz Rune', kind: 'low', icon: 'ᛏ', pays: [0.1, 0.25, 0.65] },
    O: { name: 'Onyx Rune', kind: 'low', icon: 'ᛟ', pays: [0.1, 0.25, 0.65] },
    E: { name: 'Emerald Rune', kind: 'low', icon: 'ᛖ', pays: [0.2, 0.4, 0.8] },
    A: { name: 'Amethyst Rune', kind: 'low', icon: 'ᚨ', pays: [0.2, 0.4, 0.8] },
    WAR: { name: 'Warrior', kind: 'high', icon: '⚔️', pays: [0.3, 0.6, 2] },
    MAG: { name: 'Mage', kind: 'high', icon: '🔮', pays: [0.4, 0.8, 2.5] },
    ROG: { name: 'Rogue', kind: 'high', icon: '🗡️', pays: [0.5, 1.25, 4] },
    PRI: { name: 'Priest', kind: 'high', icon: '✨', pays: [0.6, 2, 6] },
    W: { name: 'Raid Banner', kind: 'wild', icon: '🚩', pays: null },
    B: { name: 'Boss Gate', kind: 'scatter', icon: '💀', pays: null },
  };
  const PAYING = Object.keys(SYMBOLS).filter((s) => SYMBOLS[s].pays);

  // Bonus tiers, weakest first. 3/4/5 scatters start tiers 0/1/2.
  // Super Hidden can't be bought: it's only reached by ascension or the gamble.
  const TIERS = [
    { id: 'normal', name: 'Normal Bonus', title: 'The Raid' },
    { id: 'super', name: 'Super Bonus', title: 'Heroic Raid' },
    { id: 'hidden', name: 'Hidden Bonus', title: 'Hidden Sanctum' },
    { id: 'superHidden', name: 'Super Hidden Bonus', title: 'Throne of the Unseen' },
  ];
  const TOP_TIER = TIERS.length - 1;
  // Ascension: when any bonus starts (spun or bought), chance to climb one tier.
  // Rolls chain, so Normal -> Super Hidden is 0.03 * 0.03 * 0.005 (about 1 in 222,000).
  const ASCEND_CHANCE = [0.03, 0.03, 0.005];
  // Mystery buy: random starting tier (before ascension).
  const MYSTERY_WEIGHTS = [0.6, 0.3, 0.1];
  // Glory or Wipe: random tier (any, even Super Hidden). Spin wins don't
  // count; clear every boss for the mode's max win, otherwise nothing.
  const GLORY_WEIGHTS = [0.5, 0.3, 0.17, 0.03];
  const BUYS = [
    { id: 'normal', name: 'Buy Normal Bonus', tier: 0 },
    { id: 'super', name: 'Buy Super Bonus', tier: 1 },
    { id: 'hidden', name: 'Buy Hidden Bonus', tier: 2 },
    { id: 'mystery', name: 'Mystery Buy', tier: null, weights: MYSTERY_WEIGHTS },
    { id: 'glory', name: 'Glory or Wipe', tier: null, weights: GLORY_WEIGHTS, glory: true },
  ];

  // Gear loot: rare items attached to symbols on base spins. Collecting the
  // full set starts a Normal Bonus. The drop chance climbs the longer the
  // player goes without a bonus, and a drop can be a cache with several
  // pieces, so a set can complete very fast or slowly.
  const GEAR = [
    { id: 'helm', name: 'Helm', icon: '🪖' },
    { id: 'cloak', name: 'Cloak', icon: '🧥' },
    { id: 'gauntlets', name: 'Gauntlets', icon: '🧤' },
    { id: 'boots', name: 'Boots', icon: '🥾' },
    { id: 'amulet', name: 'Amulet', icon: '📿' },
    { id: 'ring', name: 'Ring', icon: '💍' },
  ];
  const GEAR_FULL = (1 << GEAR.length) - 1;
  const CACHES = [
    { name: 'Legendary Cache', pieces: 3, chance: 0.04 },
    { name: 'Treasure Chest', pieces: 2, chance: 0.12 },
  ];
  const gearCount = (gear) => GEAR.reduce((n, _, i) => n + ((gear >> i) & 1), 0);

  // Reel strip symbol counts. Wilds only land on reels 2-4.
  const EDGE = { R: 6, S: 6, T: 6, O: 6, E: 6, A: 6, WAR: 4, MAG: 4, ROG: 3, PRI: 2, B: 1 };
  const MID = { R: 6, S: 6, T: 5, O: 5, E: 5, A: 5, WAR: 4, MAG: 4, ROG: 4, PRI: 3, W: 2, B: 1 };
  const FREE_MID = { R: 5, S: 5, T: 5, O: 5, E: 4, A: 4, WAR: 4, MAG: 4, ROG: 3, PRI: 3, W: 7, B: 1 };
  const add = (counts, extra) => {
    const out = { ...counts };
    for (const [k, v] of Object.entries(extra)) out[k] = (out[k] || 0) + v;
    return out;
  };

  // Classes. The player picks one before each raid. Each changes how the raid
  // plays, and each mode's `heroScale` evens out the raid pays per class and
  // tier, so every class has the same average win (gamble odds and buy prices
  // don't depend on the pick). Clear rates differ a little, so Glory or Wipe
  // is priced per class. Every ability scales with damage dealt, so a class
  // keeps its edge in every tier. Abilities:
  //   spins       extra (or fewer) starting raid spins
  //   crit        each wild hit has `chance` to deal `dmg` instead of 1
  //   multBoost   boss-kill multipliers are multiplied by this (rounded up)
  //   charge      every `every`th raid spin, wild hits deal `factor`x damage
  //   markReel    wild hits on this reel (0-based) deal `markDmg`
  //   killSpins   extra spins per boss kill
  //   rez         once per raid, when spins run out with the boss at or below
  //               `threshold` of its HP, add `spins`
  const HEROES = [
    {
      id: 'warrior', name: 'Warrior', icon: '🛡️', style: 'Steady',
      ability: 'Shield Wall: starts every raid with 4 extra spins.',
      spins: 4,
    },
    {
      id: 'rogue', name: 'Rogue', icon: '🗡️', style: 'Swingy',
      ability: 'Backstab: every wild hit has a 15% chance to crit for 3 damage. 1 fewer raid spin.',
      spins: -1, crit: { chance: 0.15, dmg: 3 },
    },
    {
      id: 'mage', name: 'Mage', icon: '🔮', style: 'Big multipliers',
      ability: 'Arcane Surge: boss kills give 1.5x the multiplier. Arcane Charge: every 4th spin, wild hits deal double damage.',
      spins: 0, multBoost: 1.5, charge: { every: 4, factor: 2 },
    },
    {
      id: 'hunter', name: 'Hunter', icon: '🏹', style: 'Marksman',
      ability: "Hunter's Mark: wilds on the middle reel hit for 2 damage. 1 fewer raid spin.",
      spins: -1, markReel: 2, markDmg: 2,
    },
    {
      id: 'priest', name: 'Priest', icon: '✨', style: 'Second chances',
      ability: 'Resurrection: once per raid, if spins run out with the boss at 40% HP or less, +3 spins. Blessing: +1 spin per boss kill.',
      spins: 0, killSpins: 1, rez: { threshold: 0.4, spins: 3 },
    },
  ];
  const DEFAULT_HERO = 'warrior';
  function getHero(id) {
    const hero = HEROES.find((h) => h.id === id);
    if (!hero) throw new Error(`Unknown class: ${id}`);
    return hero;
  }

  const BOSS_NAMES = ['Gravelord Okk', 'Sister Venn', 'The Ashen Wyrm', 'The Hollow King'];
  const bosses = (list) => list.map(([hp, reward], i) => ({ name: BOSS_NAMES[i], hp, reward }));

  // Volatility modes. Same symbols and features, different math.
  // tiers[i]: spins, startBoss (bosses already beaten), wildBoost (extra
  // wilds per middle reel strip), sticky (spins a raid wild stays on the reels
  // after landing, hitting the boss again each spin) and hpMult (boss HP
  // multiplier, tuned so every tier clears roughly 2-16% of the time).
  // Super Hidden adds the secret boss.
  // calibration: target mean raid win per tier (x bet), used for fair gamble
  // odds and buy prices. heroScale: raid pay scale per class and tier that
  // makes every class average the target. clearRate: measured chance each
  // class beats every boss per tier, used to price Glory or Wipe. Re-measure
  // both with `node calibrate.js` after changing a mode's raid math.
  const MODES = {
    steady: {
      label: 'Steady',
      blurb: 'Constant small wins, gentle multipliers. Rarely anywhere near max.',
      scale: 0.925,
      maxWinX: 1000,
      lowMin: 3,
      base: [EDGE, add(MID, { R: -1, W: 1, B: 1 }), add(MID, { R: -1, W: 1 }), add(MID, { R: -1, W: 1, B: 1 }), EDGE],
      freeMid: add(FREE_MID, { W: -2, R: 1, S: 1 }),
      scatterPay: { 3: 1, 4: 4, 5: 15 },
      retrigger: 1,
      bossKillSpins: 1,
      bosses: bosses([[4, 2], [6, 2], [8, 3], [10, 4]]),
      secretBoss: { name: 'The Unseen', hp: 12, reward: 8 },
      tiers: [
        { spins: 6, startBoss: 0, wildBoost: 0, sticky: 0, hpMult: 0.87 },
        { spins: 8, startBoss: 1, wildBoost: 0, sticky: 1, hpMult: 1.69 },
        { spins: 10, startBoss: 2, wildBoost: 1, sticky: 2, hpMult: 3.44 },
        { spins: 12, startBoss: 3, wildBoost: 2, sticky: 3, hpMult: 3.95 },
      ],
      loot: { base: 0.015, perDrySpin: 0.00008, max: 0.06 },
      calibration: [16.15, 27.07, 53.09, 114.71],
      heroScale: {
        warrior: [0.467, 0.2478, 0.1702, 0.1209],
        rogue: [0.9411, 0.4387, 0.2816, 0.1837],
        mage: [0.5652, 0.2487, 0.1584, 0.1047],
        hunter: [0.9299, 0.4319, 0.2782, 0.1816],
        priest: [0.464, 0.2639, 0.1991, 0.1373],
      },
      clearRate: {
        warrior: [0.03599, 0.08537, 0.1501, 0.197],
        rogue: [0.01849, 0.03227, 0.05866, 0.09506],
        mage: [0.01171, 0.02881, 0.0661, 0.121],
        hunter: [0.01784, 0.04083, 0.062, 0.1172],
        priest: [0.08094, 0.09766, 0.1216, 0.1796],
      },
    },
    standard: {
      label: 'Standard',
      blurb: 'Balanced base game and raids.',
      scale: 0.818,
      maxWinX: 5000,
      lowMin: 3,
      base: [EDGE, MID, MID, MID, EDGE],
      freeMid: FREE_MID,
      scatterPay: { 3: 2, 4: 10, 5: 50 },
      retrigger: 2,
      bossKillSpins: 2,
      bosses: bosses([[5, 2], [8, 3], [12, 5], [16, 10]]),
      secretBoss: { name: 'The Unseen', hp: 18, reward: 25 },
      tiers: [
        { spins: 8, startBoss: 0, wildBoost: 0, sticky: 0, hpMult: 1.19 },
        { spins: 10, startBoss: 1, wildBoost: 0, sticky: 1, hpMult: 2.06 },
        { spins: 12, startBoss: 2, wildBoost: 2, sticky: 2, hpMult: 3.66 },
        { spins: 14, startBoss: 3, wildBoost: 3, sticky: 3, hpMult: 4.03 },
      ],
      loot: { base: 0.01, perDrySpin: 0.00005, max: 0.05 },
      calibration: [65.23, 94.25, 258.19, 746.39],
      heroScale: {
        warrior: [0.6902, 0.2741, 0.2341, 0.1906],
        rogue: [1.097, 0.4163, 0.3389, 0.2592],
        mage: [0.6502, 0.2337, 0.191, 0.1537],
        hunter: [1.063, 0.4052, 0.333, 0.2531],
        priest: [0.644, 0.2765, 0.272, 0.216],
      },
      clearRate: {
        warrior: [0.01486, 0.05847, 0.115, 0.1351],
        rogue: [0.02344, 0.05419, 0.08345, 0.1275],
        mage: [0.01872, 0.05483, 0.09442, 0.1536],
        hunter: [0.02477, 0.06439, 0.09838, 0.1488],
        priest: [0.04412, 0.09195, 0.1061, 0.129],
      },
    },
    mega: {
      label: 'Mega',
      blurb: 'Few small hits; runes need 4+ to pay. x100 final boss, x500 secret boss, 100,000x max win.',
      scale: 0.619,
      maxWinX: 100000,
      lowMin: 4,
      base: [
        add(EDGE, { R: 2, S: 2, T: 2, O: 2, E: 2 }),
        add(MID, { R: 2, S: 2, T: 2, O: 2, E: 2, A: 1, W: -1 }),
        add(MID, { R: 2, S: 2, T: 2, O: 2, E: 2, A: 1, W: -1 }),
        add(MID, { R: 2, S: 2, T: 2, O: 2, E: 2, A: 1, W: -1 }),
        add(EDGE, { R: 2, S: 2, T: 2, O: 2, E: 2 }),
      ],
      freeMid: FREE_MID,
      scatterPay: { 3: 3, 4: 20, 5: 100 },
      retrigger: 2,
      bossKillSpins: 2,
      bosses: bosses([[6, 3], [10, 10], [14, 25], [15, 100]]),
      secretBoss: { name: 'The Unseen', hp: 20, reward: 500 },
      tiers: [
        { spins: 10, startBoss: 0, wildBoost: 0, sticky: 0, hpMult: 1.18 },
        { spins: 12, startBoss: 1, wildBoost: 0, sticky: 1, hpMult: 2.15 },
        { spins: 14, startBoss: 2, wildBoost: 2, sticky: 2, hpMult: 3.97 },
        { spins: 16, startBoss: 3, wildBoost: 3, sticky: 3, hpMult: 4.37 },
      ],
      loot: { base: 0.006, perDrySpin: 0.00004, max: 0.04 },
      calibration: [146.57, 286.99, 1642.97, 10192.74],
      heroScale: {
        warrior: [0.7033, 0.3189, 0.4173, 0.3482],
        rogue: [0.9858, 0.4432, 0.5625, 0.4268],
        mage: [0.6173, 0.2712, 0.346, 0.2604],
        hunter: [0.9328, 0.4185, 0.5442, 0.4079],
        priest: [0.6121, 0.3116, 0.4832, 0.3925],
      },
      clearRate: {
        warrior: [0.01317, 0.03751, 0.091, 0.1078],
        rogue: [0.02898, 0.05332, 0.0958, 0.1423],
        mage: [0.02285, 0.04896, 0.1006, 0.1641],
        hunter: [0.03183, 0.06491, 0.1136, 0.1693],
        priest: [0.03784, 0.05737, 0.08476, 0.1049],
      },
    },
  };
  const DEFAULT_MODE = 'standard';

  // Builds a reel strip from symbol counts: a fixed shuffle (same every time)
  // with scatters spaced evenly so at most one is visible per reel.
  function buildStrip(counts, salt) {
    const others = [];
    for (const [sym, n] of Object.entries(counts)) {
      if (sym !== 'B') for (let i = 0; i < n; i++) others.push(sym);
    }
    let s = (salt * 2654435761) >>> 0 || 1;
    const rand = () => {
      s ^= s << 13; s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
    for (let i = others.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [others[i], others[j]] = [others[j], others[i]];
    }
    const scatters = counts.B || 0;
    const total = others.length + scatters;
    const scatterAt = new Set();
    for (let i = 0; i < scatters; i++) scatterAt.add(Math.floor((i + 0.5) * (total / scatters)));
    const strip = [];
    for (let i = 0; i < total; i++) strip.push(scatterAt.has(i) ? 'B' : others.shift());
    return strip;
  }

  for (const mode of Object.values(MODES)) {
    mode.strips = { base: mode.base.map((c, i) => buildStrip(c, i + 1)), free: {} };
    for (const tier of mode.tiers) {
      const b = tier.wildBoost;
      if (mode.strips.free[b]) continue;
      const mid = add(mode.freeMid, { W: b });
      mode.strips.free[b] = [EDGE, mid, mid, mid, EDGE].map((c, i) => buildStrip(c, i + 101 + b * 10));
    }
  }

  function getMode(id) {
    const mode = MODES[id];
    if (!mode) throw new Error(`Unknown mode: ${id}`);
    return mode;
  }

  const lootChance = (mode, dry) => Math.min(mode.loot.base + dry * mode.loot.perDrySpin, mode.loot.max);
  const payFor = (mode, sym, length) => SYMBOLS[sym].pays[length - 3] * mode.scale;
  const minLength = (mode, sym) => (SYMBOLS[sym].kind === 'low' ? mode.lowMin : 3);
  const scatterTier = (count) => (count >= 3 ? Math.min(count - 3, 2) : null);

  // Fair gamble: win chance = value of current tier / value of next tier,
  // so gambling never changes the expected return.
  function gambleChance(modeId, tier) {
    if (tier >= TOP_TIER) return 0;
    const cal = getMode(modeId).calibration;
    return Math.min(cal[tier] / cal[tier + 1], 1);
  }

  // Expected value (x bet) of a bonus that starts at `tier`, including
  // ascension. `perTier` gives each final tier's value.
  function startValue(tier, perTier) {
    let p = 1;
    let value = 0;
    for (let t = tier; t <= TOP_TIER; t++) {
      const climb = t < TOP_TIER ? ASCEND_CHANCE[t] : 0;
      value += p * (1 - climb) * perTier[t];
      p *= climb;
    }
    return value;
  }

  // Buy price in multiples of the bet. Every class has the same average raid
  // win, so only Glory or Wipe (priced on clear rates) depends on the class.
  function buyPrice(modeId, buyId, heroId = DEFAULT_HERO) {
    const mode = getMode(modeId);
    const buy = BUYS.find((b) => b.id === buyId);
    if (!buy) throw new Error(`Unknown buy: ${buyId}`);
    getHero(heroId);
    const perTier = buy.glory ? mode.clearRate[heroId].map((p) => p * mode.maxWinX) : mode.calibration;
    const value = buy.tier === null
      ? buy.weights.reduce((v, w, t) => v + w * startValue(t, perTier), 0)
      : startValue(buy.tier, perTier);
    return Math.max(1, Math.round((value / BUY_RTP) * 10) / 10);
  }

  // grid[reel][row]
  function spinGrid(rng, strips) {
    return strips.map((strip) => {
      const stop = Math.floor(rng.next() * strip.length);
      const col = [];
      for (let row = 0; row < ROWS; row++) col.push(strip[(stop + row) % strip.length]);
      return col;
    });
  }

  // Ways pays: a symbol (or wild) on adjacent reels from the left.
  function evaluate(grid, mode) {
    const wins = [];
    let waysX = 0;
    for (const sym of PAYING) {
      let ways = 1;
      let length = 0;
      const cells = [];
      for (let r = 0; r < REELS; r++) {
        const rows = [];
        grid[r].forEach((s, row) => { if (s === sym || s === 'W') rows.push(row); });
        if (!rows.length) break;
        length++;
        ways *= rows.length;
        rows.forEach((row) => cells.push([r, row]));
      }
      if (length >= minLength(mode, sym)) {
        const x = payFor(mode, sym, length) * ways;
        wins.push({ symbol: sym, length, ways, x, cells });
        waysX += x;
      }
    }
    const scatterCells = [];
    const wildCells = [];
    grid.forEach((col, r) => col.forEach((s, row) => {
      if (s === 'B') scatterCells.push([r, row]);
      if (s === 'W') wildCells.push([r, row]);
    }));
    return { wins, waysX, scatterCells, wildCells };
  }

  // The bosses of a raid at `tier`, with that tier's HP multiplier and the
  // class's multiplier boost applied. Super Hidden adds the secret boss.
  function raidBosses(mode, tier, heroId = DEFAULT_HERO) {
    const hero = getHero(heroId);
    const hpMult = mode.tiers[tier].hpMult || 1;
    const base = tier === TOP_TIER ? mode.bosses.concat([mode.secretBoss]) : mode.bosses;
    return base.map((b) => ({
      name: b.name,
      hp: Math.max(1, Math.round(b.hp * hpMult)),
      reward: hero.multBoost ? Math.ceil(b.reward * hero.multBoost) : b.reward,
    }));
  }

  // Raid pay scale for a class at a tier (1 when uncalibrated).
  const heroScaleFor = (mode, tier, heroId) => (mode.heroScale ? mode.heroScale[heroId][tier] : 1);

  // glory: Glory or Wipe rules (only clearing every boss pays, at max win).
  // Wilds deal 1 damage each. In tiers with `sticky`, a wild that lands stays
  // on the reels for that many more spins and hits the boss again each spin.
  function runRaid(rng, mode, tier, startX, glory = false, heroId = DEFAULT_HERO) {
    const hero = getHero(heroId);
    const cfg = mode.tiers[tier];
    const list = raidBosses(mode, tier, heroId);
    const strips = mode.strips.free[cfg.wildBoost];
    const stickyFor = cfg.sticky || 0;
    const winScale = heroScaleFor(mode, tier, heroId);
    const killSpins = mode.bossKillSpins + (hero.killSpins || 0);
    const steps = [];
    const startSpins = Math.max(3, cfg.spins + (hero.spins || 0));
    let spinsLeft = startSpins;
    let bossIndex = cfg.startBoss;
    let hp = list[bossIndex].hp;
    let mult = bossIndex > 0 ? list[bossIndex - 1].reward : 1;
    const startMult = mult;
    let totalX = 0;
    let played = 0;
    let rezUsed = false;
    // cell index (reel * ROWS + row) -> spins the sticky wild has left
    const sticky = new Map();
    while (spinsLeft > 0 && played < MAX_FREE_SPINS) {
      spinsLeft--;
      played++;
      const grid = spinGrid(rng, strips);
      const stickyCells = [];
      for (const k of sticky.keys()) {
        const cell = [Math.floor(k / ROWS), k % ROWS];
        grid[cell[0]][cell[1]] = 'W';
        stickyCells.push(cell);
      }
      const ev = evaluate(grid, mode);
      const newWilds = ev.wildCells.filter(([r, row]) => !sticky.has(r * ROWS + row));
      const multUsed = mult;
      let winX = ev.waysX * multUsed * winScale;
      const events = [];

      if (ev.scatterCells.length >= 2) {
        spinsLeft += mode.retrigger;
        events.push({ type: 'retrigger', spins: mode.retrigger });
      }

      // Damage: sticky wilds hit again, new wilds hit (and may crit), then class bonuses.
      const hits = stickyCells.map((cell) => ({ cell, sticky: true })).concat(newWilds.map((cell) => ({ cell, sticky: false })));
      const charged = !!hero.charge && played % hero.charge.every === 0;
      if (charged && hits.length) events.push({ type: 'charge', factor: hero.charge.factor });
      for (const h of hits) {
        h.dmg = 1;
        if (hero.markReel !== undefined && h.cell[0] === hero.markReel) { h.dmg = hero.markDmg; h.marked = true; }
        if (hero.crit && rng.next() < hero.crit.chance) { h.dmg = hero.crit.dmg; h.crit = true; }
        if (charged) h.dmg *= hero.charge.factor;
      }
      const damage = hits.reduce((n, h) => n + h.dmg, 0);

      // Sticky wilds count down; new wilds become sticky.
      for (const [k, left] of sticky) {
        if (left <= 1) sticky.delete(k);
        else sticky.set(k, left - 1);
      }
      if (stickyFor) newWilds.forEach(([r, row]) => sticky.set(r * ROWS + row, stickyFor));

      // Killing a boss sets the multiplier to its reward for all following
      // spins; overflow damage carries to the next boss.
      if (bossIndex < list.length && damage > 0) {
        hp -= damage;
        while (bossIndex < list.length && hp <= 0) {
          mult = list[bossIndex].reward;
          spinsLeft += killSpins;
          events.push({ type: 'bossKilled', boss: bossIndex, mult, spins: killSpins });
          bossIndex++;
          if (bossIndex < list.length) hp += list[bossIndex].hp;
          else hp = 0;
        }
      }

      if (hero.rez && !rezUsed && spinsLeft === 0 && bossIndex < list.length && hp <= list[bossIndex].hp * hero.rez.threshold) {
        rezUsed = true;
        spinsLeft += hero.rez.spins;
        events.push({ type: 'resurrect', spins: hero.rez.spins });
      }

      if (glory) {
        winX = 0;
        if (bossIndex >= list.length) {
          winX = mode.maxWinX;
          events.push({ type: 'maxWin' });
        }
      } else if (startX + totalX + winX >= mode.maxWinX) {
        winX = mode.maxWinX - startX - totalX;
        events.push({ type: 'maxWin' });
      }
      totalX += winX;
      steps.push({
        grid, wins: ev.wins, scatterCells: ev.scatterCells, wildCells: newWilds, stickyCells, hits,
        winX, multUsed, damage, charged, bossIndex, hp, mult, spinsLeft, events,
      });
      if (startX + totalX >= mode.maxWinX) break;
    }
    const cleared = bossIndex >= list.length;
    return { tier, hero: heroId, glory, cleared, spins: startSpins, startMult, bosses: list, steps, totalX };
  }

  // Loot roll for a base spin. Always draws the same number of floats.
  function rollLoot(rng, mode, gear, dry) {
    const dropRoll = rng.next();
    const cacheRoll = rng.next();
    const picks = [];
    for (let i = 0; i < 3; i++) picks.push([rng.next(), rng.next()]);
    if (gear === GEAR_FULL || dropRoll >= lootChance(mode, dry)) return null;

    let pieces = 1;
    let cache = null;
    let acc = 0;
    for (const c of CACHES) {
      acc += c.chance;
      if (cacheRoll < acc) { pieces = c.pieces; cache = c.name; break; }
    }
    const items = [];
    const usedCells = new Set();
    let owned = gear;
    for (let i = 0; i < pieces && owned !== GEAR_FULL; i++) {
      const missing = GEAR.map((_, idx) => idx).filter((idx) => !((owned >> idx) & 1));
      const slot = missing[Math.floor(picks[i][0] * missing.length)];
      let cell = Math.floor(picks[i][1] * REELS * ROWS);
      while (usedCells.has(cell)) cell = (cell + 1) % (REELS * ROWS);
      usedCells.add(cell);
      owned |= 1 << slot;
      items.push({ slot, cell: [Math.floor(cell / ROWS), cell % ROWS] });
    }
    return { cache, items, gear: owned };
  }

  // Ascension rolls. Always draws one float per possible step.
  function rollAscension(rng, tier) {
    const rolls = ASCEND_CHANCE.map(() => rng.next());
    let t = tier;
    while (t < TOP_TIER && rolls[t] < ASCEND_CHANCE[t]) t++;
    return t;
  }

  // Step 1 of a paid spin: the base game, loot, and whether a bonus starts.
  // progress = { gear: bitmask of owned GEAR slots, dry: spins since last bonus }.
  function startSpin(rngFor, bet, progress, modeId) {
    const mode = getMode(modeId);
    const rng = rngFor('');
    const grid = spinGrid(rng, mode.strips.base);
    const loot = rollLoot(rng, mode, progress.gear, progress.dry);
    const ascendRoll = (t) => rollAscension(rng, t);
    const ev = evaluate(grid, mode);
    const scatterCount = ev.scatterCells.length;
    const scatterX = (mode.scatterPay[scatterCount] || 0) * mode.scale;
    const baseX = Math.min(ev.waysX + scatterX, mode.maxWinX);

    let gear = loot ? loot.gear : progress.gear;
    const geared = gear === GEAR_FULL;
    let triggered = scatterTier(scatterCount);
    let source = triggered === null ? null : 'scatter';
    if (geared) {
      // A full gear set starts a Normal Bonus, or lifts a scatter bonus one tier.
      triggered = triggered === null ? 0 : Math.min(triggered + 1, 2);
      source = source ? 'scatter+gear' : 'gear';
      gear = 0;
    }
    let bonus = null;
    if (triggered !== null && baseX < mode.maxWinX) {
      const tier = ascendRoll(triggered);
      bonus = { source, triggeredTier: triggered, tier };
    } else {
      ascendRoll(0);
    }
    return {
      kind: 'spin',
      mode: modeId,
      bet,
      costX: 1,
      progressBefore: { gear: progress.gear, dry: progress.dry },
      progressAfter: { gear, dry: bonus ? 0 : progress.dry + 1 },
      loot,
      base: { grid, wins: ev.wins, scatterCells: ev.scatterCells, scatterX, winX: baseX },
      bonus,
    };
  }

  // Step 1 of a bonus buy. Gear and the dry-spin counter are unaffected.
  // Glory or Wipe is priced for `heroId`, and the class is locked for that raid.
  function startBuy(rngFor, bet, progress, modeId, buyId, heroId = DEFAULT_HERO) {
    const buy = BUYS.find((b) => b.id === buyId);
    if (!buy) throw new Error(`Unknown buy: ${buyId}`);
    const rng = rngFor('');
    const mysteryRoll = rng.next();
    let rolled = buy.tier;
    if (rolled === null) {
      let acc = 0;
      rolled = buy.weights.length - 1;
      for (let t = 0; t < buy.weights.length; t++) {
        acc += buy.weights[t];
        if (mysteryRoll < acc) { rolled = t; break; }
      }
    }
    const tier = rollAscension(rng, rolled);
    return {
      kind: 'buy',
      buy: buyId,
      mode: modeId,
      bet,
      costX: buyPrice(modeId, buyId, heroId),
      progressBefore: { gear: progress.gear, dry: progress.dry },
      progressAfter: { gear: progress.gear, dry: progress.dry },
      loot: null,
      base: null,
      bonus: {
        source: buy.glory ? 'glory' : buy.tier === null ? 'mystery' : 'buy', triggeredTier: rolled, tier, glory: !!buy.glory,
        ...(buy.glory ? { hero: heroId } : {}),
      },
    };
  }

  const canGamble = (round) => !!round.bonus && round.bonus.tier !== null && round.bonus.tier < TOP_TIER && !round.bonus.glory;

  // One gamble attempt to raise the bonus one tier. Losing forfeits the bonus.
  function gamble(rngFor, modeId, tier) {
    const chance = gambleChance(modeId, tier);
    const roll = rngFor('gamble').next();
    const won = roll < chance;
    return { from: tier, to: won ? tier + 1 : null, chance, won };
  }

  // Final step: play the raid (if the bonus survived) as `heroId` and total
  // the round. A Glory or Wipe raid always uses the class it was priced for.
  function finishRound(rngFor, round, heroId = DEFAULT_HERO) {
    const mode = getMode(round.mode);
    const baseX = round.base ? round.base.winX : 0;
    let raid = null;
    if (round.bonus && round.bonus.tier !== null) {
      const hero = round.bonus.hero || heroId;
      getHero(hero);
      raid = runRaid(rngFor('raid'), mode, round.bonus.tier, baseX, !!round.bonus.glory, hero);
    }
    const totalX = baseX + (raid ? raid.totalX : 0);
    return { ...round, raid, totalX, totalWin: Math.round(totalX * round.bet * 100) / 100 };
  }

  // Full replay of a round from seeds and recorded choices.
  // opts: { bet, progress, mode, buy (id or null), gambles (attempts made), hero }.
  function playRound(rngFor, opts) {
    const mode = opts.mode || DEFAULT_MODE;
    const progress = opts.progress || { gear: 0, dry: 0 };
    const round = opts.buy
      ? startBuy(rngFor, opts.bet, progress, mode, opts.buy, opts.hero || DEFAULT_HERO)
      : startSpin(rngFor, opts.bet, progress, mode);
    round.gambles = [];
    for (let i = 0; i < (opts.gambles || 0); i++) {
      if (!canGamble(round)) break;
      const g = gamble(rngFor, mode, round.bonus.tier);
      round.gambles.push(g);
      round.bonus = { ...round.bonus, tier: g.to };
      if (!g.won) break;
    }
    return finishRound(rngFor, round, opts.hero || DEFAULT_HERO);
  }

  return {
    REELS, ROWS, BUY_RTP, SYMBOLS, TIERS, TOP_TIER, ASCEND_CHANCE, MYSTERY_WEIGHTS, GLORY_WEIGHTS, BUYS,
    GEAR, GEAR_FULL, CACHES, MODES, DEFAULT_MODE, HEROES, DEFAULT_HERO,
    getMode, getHero, heroScaleFor, lootChance, payFor, minLength, gearCount, gambleChance, canGamble, buyPrice, raidBosses,
    startSpin, startBuy, gamble, finishRound, playRound, runRaid, evaluate,
  };
});
