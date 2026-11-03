// Raidbreaker browser client. The server (or public/local.js in static builds)
// decides every outcome; this file animates the reels, the interactive Raid
// Stage, synthesized Web Audio SFX, and replays rounds locally for verification.
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

/* ---------- Chiseled Gothic Dark-Fantasy Boss Portrait SVGs ---------- */
const BOSS_PORTRAITS = {
  'Gravelord Okk': '<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg"><path d="M10,12 L40,4 L70,12 L66,52 L40,76 L14,52 Z" fill="#0d2618" stroke="#10b981" stroke-width="2.6"/><path d="M18,26 C4,16 4,4 18,8 C13,15 16,21 24,22 M62,26 C76,16 76,4 62,8 C67,15 64,21 56,22" fill="#fef3c7" stroke="#451a03" stroke-width="1.8"/><path d="M22,26 C22,12 58,12 58,26 L54,52 L26,52 Z" fill="#e7e5e4" stroke="#1c1917" stroke-width="2.2"/><polygon points="27,31 36,35 28,38" fill="#10b981"/><polygon points="53,31 44,35 52,38" fill="#10b981"/><rect x="24" y="48" width="32" height="14" rx="3" fill="#57534e" stroke="#1c1917" stroke-width="2"/><path d="M30,48 L30,62 M40,48 L40,62 M50,48 L50,62" stroke="#1c1917" stroke-width="2.2"/></svg>',
  'Sister Venn': '<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg"><path d="M10,12 L40,4 L70,12 L66,52 L40,76 L14,52 Z" fill="#2e0714" stroke="#f43f5e" stroke-width="2.6"/><circle cx="40" cy="34" r="24" fill="none" stroke="#fbbf24" stroke-width="2.2" stroke-dasharray="5 3"/><path d="M16,66 L24,22 L40,8 L56,22 L64,66 Z" fill="#881337" stroke="#fbbf24" stroke-width="2"/><path d="M28,28 C28,18 52,18 52,28 L49,50 L31,50 Z" fill="#ffe4e6" stroke="#4c0519" stroke-width="1.6"/><polygon points="31,33 38,35 32,37" fill="#e11d48"/><polygon points="49,33 42,35 48,37" fill="#e11d48"/><path d="M34,37 L33,48 M46,37 L47,48" stroke="#e11d48" stroke-width="2"/></svg>',
  'The Ashen Wyrm': '<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg"><path d="M10,12 L40,4 L70,12 L66,52 L40,76 L14,52 Z" fill="#290d04" stroke="#f97316" stroke-width="2.6"/><path d="M20,24 L8,4 L28,16 M60,24 L72,4 L52,16" fill="#fbbf24" stroke="#7c2d12" stroke-width="2"/><path d="M18,24 L40,14 L62,24 L56,56 L40,68 L24,56 Z" fill="#1c1917" stroke="#f97316" stroke-width="2.2"/><path d="M28,22 L40,36 L52,22 M26,44 L40,54 L54,44" fill="none" stroke="#fb923c" stroke-width="2.2"/><polygon points="25,33 35,37 26,40" fill="#fde047"/><polygon points="55,33 45,37 54,40" fill="#fde047"/></svg>',
  'The Hollow King': '<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg"><path d="M10,12 L40,4 L70,12 L66,52 L40,76 L14,52 Z" fill="#140b29" stroke="#a855f7" stroke-width="2.6"/><path d="M18,68 L24,26 L56,26 L62,68 Z" fill="#090514" stroke="#6b21a8" stroke-width="2"/><polygon points="20,26 25,10 33,22 40,6 47,22 55,10 60,26" fill="#fbbf24" stroke="#78350f" stroke-width="1.8"/><polygon points="28,38 36,41 29,44" fill="#c084fc"/><polygon points="52,38 44,41 51,44" fill="#c084fc"/></svg>',
  'The Unseen': '<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg"><path d="M10,12 L40,4 L70,12 L66,52 L40,76 L14,52 Z" fill="#090414" stroke="#fde047" stroke-width="2.6"/><ellipse cx="40" cy="40" rx="28" ry="12" transform="rotate(30 40 40)" fill="none" stroke="#c084fc" stroke-width="2.2"/><ellipse cx="40" cy="40" rx="28" ry="12" transform="rotate(-30 40 40)" fill="none" stroke="#fde047" stroke-width="2.2"/><circle cx="40" cy="40" r="13" fill="#3b0764" stroke="#f5d0fe" stroke-width="2"/><ellipse cx="40" cy="40" rx="9" ry="5" fill="#fef08a"/><circle cx="40" cy="40" r="3" fill="#581c87"/><circle cx="22" cy="24" r="3" fill="#fde047"/><circle cx="58" cy="24" r="3" fill="#fde047"/><circle cx="22" cy="56" r="3" fill="#e879f9"/><circle cx="58" cy="56" r="3" fill="#e879f9"/></svg>',
};
const bossSvg = (name) => BOSS_PORTRAITS[name] || BOSS_PORTRAITS['Gravelord Okk'];

/* ---------- Synthesized Web Audio SFX ---------- */
const SFX = (() => {
  let ctx = null;
  let muted = prefs.get('muted', false);

  function ensure() {
    if (muted) return null;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) ctx = new AC();
    }
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  function tone(freq, dur, type = 'sine', vol = 0.08, slideTo = null, delay = 0) {
    const c = ensure();
    if (!c) return;
    try {
      const t0 = c.currentTime + delay;
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(vol, t0 + Math.min(0.015, dur * 0.25));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(c.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.01);
    } catch { /* ignore audio errors */ }
  }

  return {
    isMuted: () => muted,
    setMuted(m) {
      muted = !!m;
      prefs.set('muted', muted);
      const btn = $('sound-toggle');
      if (btn) {
        btn.textContent = muted ? '🔇 Muted' : '🔊 Sound';
        btn.classList.toggle('muted', muted);
      }
    },
    spin(spd) {
      if (spd === 'super') return;
      tone(190, 0.07, 'triangle', 0.05, 310);
    },
    reelStop(r, spd, hasScatter, hasWild) {
      if (spd === 'super') return;
      if (hasScatter) {
        tone(520 + r * 95, 0.16, 'sine', 0.09, 780 + r * 110);
      } else if (hasWild) {
        tone(360 + r * 50, 0.11, 'triangle', 0.07, 520);
      } else {
        tone(125 + r * 18, 0.05, 'sine', 0.05, 85);
      }
    },
    win(big) {
      if (big) {
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, 0.22, 'triangle', 0.09, null, i * 0.07));
      } else {
        tone(440, 0.1, 'triangle', 0.06);
        tone(554.37, 0.14, 'triangle', 0.06, null, 0.06);
      }
    },
    loot() {
      tone(660, 0.1, 'sine', 0.08, 880);
      tone(990, 0.18, 'triangle', 0.08, 1320, 0.08);
    },
    attack() {
      tone(280, 0.08, 'sawtooth', 0.06, 110);
      tone(540, 0.09, 'triangle', 0.05, 220, 0.03);
    },
    bossKill() {
      [220, 165, 110].forEach((f, i) => tone(f, 0.2, 'sawtooth', 0.08, 55, i * 0.06));
      [587.33, 880].forEach((f, i) => tone(f, 0.25, 'triangle', 0.08, null, 0.18 + i * 0.08));
    },
    gamble(won) {
      if (won) {
        tone(440, 0.12, 'triangle', 0.08, 660);
        tone(660, 0.2, 'triangle', 0.09, 880, 0.1);
      } else {
        tone(310, 0.18, 'sawtooth', 0.07, 180);
        tone(180, 0.26, 'sawtooth', 0.07, 95, 0.14);
      }
    },
    taunt() {
      tone(320, 0.1, 'triangle', 0.06, 480);
      tone(480, 0.12, 'sine', 0.06, 400, 0.08);
    },
  };
})();

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
let autoLeft = 0;
let speed = prefs.get('speed', 'normal');
const heroById = (id) => Game.HEROES.find((h) => h.id === id) || Game.getHero(Game.DEFAULT_HERO);
if (!SPEEDS[speed]) speed = 'normal';

const sp = () => SPEEDS[speed];
const skipping = () => inRaid && skipRequested;
const wait = (ms) => (skipping() ? Promise.resolve() : sleep(ms));

async function api(path, body) {
  if (window.LocalApi) return window.LocalApi(path, body);
  const res = await fetch(path, body === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

/* ---------- Interactive Raid Stage (Supports all 5 Classes: Warrior, Rogue, Mage, Hunter, Priest) ---------- */
const Arena = (() => {
  const canvas = $('arena-canvas');
  const ctx = canvas.getContext('2d');
  const pxCanvas = document.createElement('canvas');
  pxCanvas.width = 220;
  pxCanvas.height = 52;
  const pxCtx = pxCanvas.getContext('2d');

  let artStyle = prefs.get('artStyle', 'gothic');
  if (!['gothic', 'pixel', 'compact'].includes(artStyle)) artStyle = 'gothic';

  const st = {
    t: 0,
    mouseX: 440,
    mouseY: 105,
    heroX: 215,
    heroY: 162,
    bossX: 665,
    bossY: 162,
    pose: 'idle',
    poseTimer: 0,
    lungeX: 0,
    shake: 0,
    previewGearBit: -1,
    previewTimer: 0,
    scatterCount: 0,
    boss: null,
    particles: [],
    projectiles: [],
    callouts: [],
    embers: Array.from({ length: 34 }, () => ({
      x: Math.random() * 880,
      y: Math.random() * 210,
      vx: (Math.random() - 0.5) * 0.45,
      vy: -0.4 - Math.random() * 0.75,
      r: 1.2 + Math.random() * 2.4,
      a: 0.35 + Math.random() * 0.6,
    })),
  };

  const HERO_META = {
    warrior: { name: 'Dread-Vanguard', color: '#ef4444', accent: '#fbbf24', cries: ['Shield Wall holds!', 'Blood and iron!', 'Cleave the Gate!', 'For the Raid!'] },
    rogue:   { name: 'Nightshade Blade', color: '#10b981', accent: '#a855f7', cries: ['Backstab 3x CRIT!', 'Venom on the edge!', 'From the shadows!', 'Claim the cache!'] },
    mage:    { name: 'Astral Archon', color: '#38bdf8', accent: '#c084fc', cries: ['Arcane Surge 1.5x!', 'Every 4th spin: 2x!', 'Unseal the Sanctum!', 'Void and starlight!'] },
    hunter:  { name: 'Elven Marksman', color: '#4ade80', accent: '#facc15', cries: ["Hunter's Mark locked!", 'Center reel hits 2x!', 'True-flight arrow!', 'Pierce their armor!'] },
    priest:  { name: 'Solar Confessor', color: '#fde047', accent: '#fb923c', cries: ['Resurrection ready!', 'Radiant crusade!', 'Blessing on the reels!', 'Ascend in light!'] },
  };

  const curHeroId = () => (S && S.hero && HERO_META[S.hero]) ? S.hero : 'warrior';

  function addCallout(x, y, text, color = '#ffe394', scale = 1) {
    st.callouts.push({ x, y, text, color, vy: -0.85, life: 1, maxLife: 68, scale });
    if (st.callouts.length > 8) st.callouts.shift();
  }

  function burst(x, y, color, count = 18, speed = 3.8) {
    for (let i = 0; i < count; i++) {
      const ang = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
      const spd = (0.4 + Math.random() * 0.85) * speed;
      st.particles.push({
        x, y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 0.9,
        r: 2 + Math.random() * 3.4,
        color,
        life: 1,
        decay: 0.02 + Math.random() * 0.02,
      });
    }
  }

  function drawGothicSanctum(w, h) {
    const mode = S ? S.mode : 'standard';
    const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
    if (inRaid) {
      skyGrad.addColorStop(0, '#360917');
      skyGrad.addColorStop(0.6, '#14050d');
      skyGrad.addColorStop(1, '#070309');
    } else if (mode === 'mega') {
      skyGrad.addColorStop(0, '#2b0b18');
      skyGrad.addColorStop(0.65, '#120714');
      skyGrad.addColorStop(1, '#07040a');
    } else if (mode === 'steady') {
      skyGrad.addColorStop(0, '#0f2233');
      skyGrad.addColorStop(0.65, '#0b1221');
      skyGrad.addColorStop(1, '#060810');
    } else {
      skyGrad.addColorStop(0, '#1f1235');
      skyGrad.addColorStop(0.65, '#100a1c');
      skyGrad.addColorStop(1, '#07050d');
    }
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(255, 230, 180, 0.05)';
    ctx.fillStyle = 'rgba(8, 5, 14, 0.55)';
    ctx.lineWidth = 2;
    for (let x = 55; x < w; x += 154) {
      ctx.fillRect(x - 10, 0, 20, h - 46);
      ctx.beginPath();
      ctx.moveTo(x + 10, 90);
      ctx.quadraticCurveTo(x + 77, 8, x + 144, 90);
      ctx.stroke();
    }

    ctx.save();
    ctx.translate(w / 2, 70);
    ctx.strokeStyle = inRaid ? 'rgba(244, 63, 94, 0.16)' : 'rgba(229, 173, 59, 0.12)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 48, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4 + st.t * 0.002;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * 46, Math.sin(a) * 46);
      ctx.stroke();
    }
    ctx.restore();

    const flicker = 0.88 + Math.sin(st.t * 0.2) * 0.12;
    const flameCol = inRaid ? '#f43f5e' : mode === 'mega' ? '#f97316' : mode === 'steady' ? '#38bdf8' : '#fbbf24';
    [105, 440, 775].forEach((tx, idx) => {
      const rg = ctx.createRadialGradient(tx, 60, 3, tx, 60, 78 * flicker);
      rg.addColorStop(0, flameCol + '66');
      rg.addColorStop(0.5, flameCol + '1a');
      rg.addColorStop(1, 'transparent');
      ctx.fillStyle = rg;
      ctx.fillRect(tx - 80, 0, 160, 140);

      ctx.fillStyle = '#271f36';
      ctx.strokeStyle = '#09060e';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(tx - 9, 64);
      ctx.lineTo(tx + 9, 64);
      ctx.lineTo(tx + 4, 82);
      ctx.lineTo(tx - 4, 82);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      const sway = Math.sin(st.t * 0.24 + idx * 2) * 4;
      ctx.fillStyle = flameCol;
      ctx.beginPath();
      ctx.moveTo(tx - 8, 64);
      ctx.quadraticCurveTo(tx - 10, 46, tx + sway, 34);
      ctx.quadraticCurveTo(tx + 10, 46, tx + 8, 64);
      ctx.closePath();
      ctx.fill();
    });

    const fy = h - 46;
    const fg = ctx.createLinearGradient(0, fy, 0, h);
    fg.addColorStop(0, '#1c152b');
    fg.addColorStop(1, '#09060f');
    ctx.fillStyle = fg;
    ctx.fillRect(0, fy, w, 46);
    ctx.strokeStyle = '#3d2f59';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, fy);
    ctx.lineTo(w, fy);
    ctx.stroke();
  }

  function drawHeroGothic() {
    const hId = curHeroId();
    const meta = HERO_META[hId];
    const gearMask = S && S.progress ? S.progress.gear : 0;
    const hasGear = (slot) => st.previewGearBit === slot || !!((gearMask >> slot) & 1);
    const gearOwnedCount = Game.gearCount(gearMask);
    const breath = Math.sin(st.t * 0.08) * 2.2;
    const isAttack = st.pose === 'attack' || st.pose === 'celebrate';
    const x = st.heroX + st.lungeX;
    const y = st.heroY + (st.pose === 'celebrate' ? -Math.abs(Math.sin(st.t * 0.25)) * 12 : 0);

    ctx.save();
    ctx.translate(x, y);

    ctx.save();
    ctx.translate(0, 6);
    ctx.scale(1, 0.26);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.arc(0, 0, 50, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = gearOwnedCount === 6 ? '#fbbf24' : meta.color + 'aa';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 54, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    if (gearOwnedCount > 0 || st.previewGearBit >= 0) {
      const auraR = 44 + gearOwnedCount * 4.5 + Math.sin(st.t * 0.12) * 3;
      const ag = ctx.createRadialGradient(0, -46, 8, 0, -46, auraR);
      ag.addColorStop(0, gearOwnedCount === 6 ? 'rgba(251, 191, 36, 0.42)' : 'rgba(168, 85, 247, 0.24)');
      ag.addColorStop(1, 'transparent');
      ctx.fillStyle = ag;
      ctx.beginPath();
      ctx.arc(0, -46, auraR, 0, Math.PI * 2);
      ctx.fill();
    }

    // 1. Billowing Cloak (Gear slot 1) or Hunter Quiver
    const cloakWave = Math.sin(st.t * 0.1) * 7;
    if (hasGear(1) || hId === 'warrior' || hId === 'mage' || hId === 'hunter') {
      ctx.fillStyle = hasGear(1) ? '#581c87' : hId === 'warrior' ? '#7f1d1d' : hId === 'hunter' ? '#14532d' : '#1e1b4b';
      ctx.strokeStyle = hasGear(1) ? '#fbbf24' : '#09050e';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(-18, -72 + breath);
      ctx.bezierCurveTo(-40, -46, -46 + cloakWave, -15, -36 + cloakWave, 4);
      ctx.lineTo(-18 + cloakWave * 0.6, -2);
      ctx.lineTo(14, 2);
      ctx.lineTo(18, -72 + breath);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    if (hId === 'hunter') {
      // Quiver of arrows on back shoulder
      ctx.fillStyle = '#78350f';
      ctx.strokeStyle = '#09060e';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(-14, -74 + breath);
      ctx.lineTo(-24, -96 + breath);
      ctx.lineTo(-14, -98 + breath);
      ctx.lineTo(-6, -74 + breath);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // 2. Articulated Legs & Boots (Gear slot 3)
    const stride = isAttack ? Math.sin(st.t * 0.4) * 6 : 0;
    [[-11, -stride], [11, stride]].forEach(([lx, ly], idx) => {
      ctx.save();
      ctx.translate(lx, ly);
      ctx.fillStyle = '#1e293b';
      ctx.strokeStyle = '#09060e';
      ctx.lineWidth = 2;
      ctx.fillRect(-5, -32, 10, 16);
      ctx.strokeRect(-5, -32, 10, 16);

      ctx.fillStyle = hasGear(3) ? '#cbd5e1' : '#475569';
      ctx.strokeStyle = hasGear(3) ? '#fbbf24' : '#09060e';
      ctx.beginPath();
      ctx.moveTo(-6, -16);
      ctx.lineTo(6, -16);
      ctx.lineTo(8, 2);
      ctx.lineTo(idx === 1 ? 13 : 9, 6);
      ctx.lineTo(-6, 6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      if (hasGear(3)) {
        ctx.fillStyle = '#fde047';
        ctx.beginPath();
        ctx.moveTo(-6, -8);
        ctx.lineTo(-17, -15);
        ctx.lineTo(-12, -5);
        ctx.lineTo(-6, -1);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    });

    // 3. V-Tapered Heroic Torso & Pauldrons
    ctx.save();
    ctx.translate(0, breath);
    const torsoPal = {
      warrior: ['#7f1d1d', '#94a3b8', '#fbbf24'],
      mage:    ['#1e3a8a', '#312e81', '#38bdf8'],
      rogue:   ['#064e3b', '#1e293b', '#10b981'],
      hunter:  ['#14532d', '#3f6212', '#4ade80'],
      priest:  ['#f8fafc', '#b45309', '#fde047'],
    }[hId];

    ctx.fillStyle = torsoPal[0];
    ctx.strokeStyle = '#09060e';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-17, -36);
    ctx.lineTo(17, -36);
    ctx.lineTo(22, -19);
    ctx.lineTo(0, -17);
    ctx.lineTo(-22, -19);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = torsoPal[1];
    ctx.beginPath();
    ctx.moveTo(-21, -72);
    ctx.lineTo(21, -72);
    ctx.lineTo(15, -36);
    ctx.lineTo(0, -32);
    ctx.lineTo(-15, -36);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(-16, -38, 32, 5);
    ctx.strokeRect(-16, -38, 32, 5);

    // Amulet (Gear slot 4)
    if (hasGear(4)) {
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-10, -70);
      ctx.lineTo(0, -53);
      ctx.lineTo(10, -70);
      ctx.stroke();
      ctx.fillStyle = '#f43f5e';
      ctx.beginPath();
      ctx.arc(0, -52, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Pauldrons
    for (const sd of [-1, 1]) {
      ctx.save();
      ctx.translate(sd * 22, -68);
      ctx.fillStyle = hasGear(1) ? '#fbbf24' : torsoPal[1];
      ctx.strokeStyle = '#09060e';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-sd * 4, -8);
      ctx.quadraticCurveTo(sd * 15, -10, sd * 17, 6);
      ctx.lineTo(-sd * 2, 8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // 4. Head, Visage & Helm (Gear slot 0)
    const lookX = Math.max(-3.5, Math.min(3.5, (st.mouseX - x) / 95));
    ctx.save();
    ctx.translate(0, -86);
    if (hasGear(0)) {
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.moveTo(0, -30);
      ctx.quadraticCurveTo(-16, -20, -5, -8);
      ctx.quadraticCurveTo(15, -18, 0, -30);
      ctx.fill();
      for (const sd of [-1, 1]) {
        ctx.fillStyle = '#fbbf24';
        ctx.strokeStyle = '#291002';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(sd * 12, -8);
        ctx.quadraticCurveTo(sd * 30, -14, sd * 24, -27);
        ctx.quadraticCurveTo(sd * 16, -16, sd * 10, -13);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.fillStyle = '#cbd5e1';
      ctx.strokeStyle = '#09060e';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(-14, -11);
      ctx.lineTo(0, -18);
      ctx.lineTo(14, -11);
      ctx.lineTo(12, 11);
      ctx.lineTo(0, 17);
      ctx.lineTo(-12, 11);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#f97316';
      ctx.fillRect(-10 + lookX * 0.4, -2, 7, 3);
      ctx.fillRect(3 + lookX * 0.4, -2, 7, 3);
    } else {
      ctx.fillStyle = hId === 'warrior' ? '#64748b' : hId === 'mage' ? '#1e3a8a' : hId === 'hunter' ? '#14532d' : hId === 'rogue' ? '#181326' : '#fef3c7';
      ctx.strokeStyle = hId === 'priest' ? '#fde047' : '#09060e';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(-15, 11);
      ctx.lineTo(-14, -12);
      ctx.lineTo(0, -22);
      ctx.lineTo(14, -12);
      ctx.lineTo(15, 11);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = meta.color;
      ctx.fillRect(-8 + lookX * 0.5, -2, 6, 3);
      ctx.fillRect(2 + lookX * 0.5, -2, 6, 3);
    }
    ctx.restore();

    // 5. Off-Hand Shield / Tome / Dagger
    ctx.save();
    ctx.translate(-23, -54);
    if (hId === 'warrior') {
      ctx.fillStyle = '#991b1b';
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(-13, -15);
      ctx.lineTo(11, -15);
      ctx.lineTo(9, 11);
      ctx.lineTo(-1, 22);
      ctx.lineTo(-11, 11);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();

    // 6. Main Weapon Hand, Gauntlet (Gear slot 2), Ring (Gear slot 5) & Class Weapon
    const swing = isAttack
      ? -0.9 + Math.sin(st.t * 0.65) * 1.1
      : st.pose === 'anticipate'
      ? -0.5 + Math.sin(st.t * 0.4) * 0.15
      : Math.sin(st.t * 0.08) * 0.1;

    ctx.save();
    ctx.translate(22, -58);
    ctx.rotate(swing);
    ctx.fillStyle = hasGear(2) ? '#fbbf24' : '#64748b';
    ctx.strokeStyle = '#09060e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-6, -6, 13, 12, 4);
    ctx.fill();
    ctx.stroke();

    if (hasGear(5)) {
      ctx.strokeStyle = '#e879f9';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(2, 0, 11 + Math.sin(st.t * 0.2) * 2, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (hId === 'warrior') {
      ctx.fillStyle = '#e2e8f0';
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-4, -6);
      ctx.lineTo(-2, -60);
      ctx.lineTo(2, -70);
      ctx.lineTo(6, -60);
      ctx.lineTo(8, -6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(-12, -6, 28, 5);
    } else if (hId === 'mage') {
      ctx.strokeStyle = '#b45309';
      ctx.lineWidth = 4.2;
      ctx.beginPath();
      ctx.moveTo(2, 14);
      ctx.lineTo(2, -52);
      ctx.stroke();
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(2, -58, 7, 0, Math.PI * 2);
      ctx.fill();
    } else if (hId === 'hunter') {
      // Golden Elven Recurve Bow & Charged Arrow
      ctx.strokeStyle = '#eab308';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(4, -18, 26, -Math.PI * 0.42, Math.PI * 0.42);
      ctx.stroke();
      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(0, -18);
      ctx.lineTo(36, -18);
      ctx.stroke();
    } else if (hId === 'rogue') {
      ctx.fillStyle = '#34d399';
      ctx.strokeStyle = '#022c22';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-2, -4);
      ctx.quadraticCurveTo(10, -26, 0, -50);
      ctx.quadraticCurveTo(14, -26, 6, -4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 4.2;
      ctx.beginPath();
      ctx.moveTo(2, 14);
      ctx.lineTo(2, -48);
      ctx.stroke();
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(2, -52, 8.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.restore(); // end breath

    ctx.fillStyle = 'rgba(10, 7, 18, 0.86)';
    ctx.strokeStyle = '#4c3a6e';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(-72, 13, 144, 20, 9);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffe394';
    ctx.font = '700 11px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${meta.name} · ${gearOwnedCount}/6 Gear`, 0, 27);

    ctx.restore();
  }

  function drawBossGothic() {
    const x = st.bossX;
    const y = st.bossY;
    ctx.save();
    ctx.translate(x, y);

    if (!inRaid || !st.boss) {
      const gearMask = S && S.progress ? S.progress.gear : 0;
      const vg = ctx.createRadialGradient(0, -52, 4, 0, -52, 50);
      vg.addColorStop(0, st.scatterCount >= 2 ? '#fde047' : '#f43f5e');
      vg.addColorStop(0.55, '#6b21a8');
      vg.addColorStop(1, '#080410');
      ctx.fillStyle = vg;
      ctx.beginPath();
      ctx.arc(0, -52, 42, Math.PI, 0);
      ctx.lineTo(42, 6);
      ctx.lineTo(-42, 6);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#334155';
      ctx.strokeStyle = '#09060e';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(-52, 6);
      ctx.lineTo(-48, -60);
      ctx.lineTo(-40, -90);
      ctx.lineTo(0, -106);
      ctx.lineTo(40, -90);
      ctx.lineTo(48, -60);
      ctx.lineTo(52, 6);
      ctx.lineTo(36, 6);
      ctx.lineTo(36, -52);
      ctx.arc(0, -52, 36, 0, Math.PI, true);
      ctx.lineTo(-36, 6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      for (let i = 0; i < 6; i++) {
        const ang = Math.PI + ((i + 0.5) / 6) * Math.PI;
        const gx = Math.cos(ang) * 42;
        const gy = -52 + Math.sin(ang) * 42;
        const owned = !!((gearMask >> i) & 1);
        ctx.fillStyle = owned ? '#fbbf24' : '#1e293b';
        ctx.strokeStyle = owned ? '#fffbeb' : '#09060e';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(gx, gy, 4.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      ctx.fillStyle = 'rgba(10, 7, 18, 0.86)';
      ctx.strokeStyle = '#4c3a6e';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.roundRect(-74, 13, 148, 20, 9);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = st.scatterCount >= 2 ? '#fde047' : '#fda4af';
      ctx.font = '700 11px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(st.scatterCount >= 2 ? '⚡ GATE UNSEALING!' : 'Boss Gate (3+ Gates or 6/6 Gear)', 0, 27);
      ctx.restore();
      return;
    }

    const b = st.boss;
    const hitOffset = b.hitTimer > 0 ? (Math.random() - 0.5) * 12 : 0;
    const floatY = Math.sin(st.t * 0.08) * 4;
    ctx.translate(hitOffset, floatY);
    if (b.hitTimer > 0) b.hitTimer--;
    const isFlash = b.hitTimer > 0 && b.hitTimer % 2 === 0;
    const bName = b.name;

    const bg = ctx.createRadialGradient(0, -52, 10, 0, -52, 66);
    bg.addColorStop(0, isFlash ? 'rgba(255,255,255,0.75)' : 'rgba(225, 29, 72, 0.42)');
    bg.addColorStop(1, 'transparent');
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.arc(0, -52, 66, 0, Math.PI * 2);
    ctx.fill();

    if (bName === 'Gravelord Okk') {
      ctx.fillStyle = isFlash ? '#fff' : '#27272a';
      ctx.strokeStyle = '#09060e';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(-32, -78);
      ctx.lineTo(32, -78);
      ctx.lineTo(22, 2);
      ctx.lineTo(-22, 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.arc(0, -48, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = isFlash ? '#fff' : '#e7e5e4';
      ctx.beginPath();
      ctx.moveTo(-17, -100);
      ctx.lineTo(0, -110);
      ctx.lineTo(17, -100);
      ctx.lineTo(13, -76);
      ctx.lineTo(-13, -76);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (bName === 'Sister Venn') {
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.arc(0, -84, 26, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = isFlash ? '#fff' : '#881337';
      ctx.beginPath();
      ctx.moveTo(-28, 4);
      ctx.lineTo(-16, -78);
      ctx.lineTo(0, -110);
      ctx.lineTo(16, -78);
      ctx.lineTo(28, 4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (bName === 'The Ashen Wyrm') {
      const wf = Math.sin(st.t * 0.16) * 12;
      ctx.fillStyle = isFlash ? '#fff' : '#7c2d12';
      ctx.strokeStyle = '#f97316';
      ctx.lineWidth = 2.2;
      for (const sd of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(0, -54);
        ctx.lineTo(sd * 62, -94 + wf);
        ctx.lineTo(sd * 48, -38);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.fillStyle = isFlash ? '#fff' : '#1c1917';
      ctx.beginPath();
      ctx.moveTo(-24, 4);
      ctx.lineTo(-16, -84);
      ctx.lineTo(0, -104);
      ctx.lineTo(16, -84);
      ctx.lineTo(24, 4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (bName === 'The Hollow King') {
      ctx.fillStyle = isFlash ? '#fff' : '#1e1b4b';
      ctx.strokeStyle = '#a855f7';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(-32, 4);
      ctx.lineTo(-20, -80);
      ctx.lineTo(20, -80);
      ctx.lineTo(32, 4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.moveTo(-16, -86);
      ctx.lineTo(-12, -108);
      ctx.lineTo(0, -94);
      ctx.lineTo(12, -108);
      ctx.lineTo(16, -86);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.save();
      ctx.translate(0, -54);
      ctx.rotate(st.t * 0.04);
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 2.6;
      ctx.strokeRect(-30, -30, 60, 60);
      ctx.rotate(Math.PI / 4);
      ctx.strokeStyle = '#c084fc';
      ctx.strokeRect(-30, -30, 60, 60);
      ctx.restore();
      ctx.fillStyle = isFlash ? '#fff' : '#3b0764';
      ctx.beginPath();
      ctx.arc(0, -54, 17, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = 'rgba(18, 7, 12, 0.9)';
    ctx.strokeStyle = '#f43f5e';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.roundRect(-74, 13, 148, 20, 9);
    ctx.fill();
    ctx.stroke();
    const pctHp = Math.max(0, Math.min(1, b.hp / Math.max(1, b.maxHp)));
    ctx.fillStyle = '#e11d48';
    ctx.beginPath();
    ctx.roundRect(-72, 15, 144 * pctHp, 16, 7);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 10.5px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${b.name} (${b.hp}/${b.maxHp} HP)`, 0, 27);
    ctx.restore();
  }

  function drawPixelStage() {
    const hId = curHeroId();
    const meta = HERO_META[hId];
    const pw = pxCanvas.width;
    const ph = pxCanvas.height;
    pxCtx.fillStyle = inRaid ? '#240812' : '#110b1c';
    pxCtx.fillRect(0, 0, pw, ph);

    pxCtx.fillStyle = '#1c142b';
    for (let y = 4; y < ph - 11; y += 8) {
      const off = (y % 16 === 4) ? 0 : 8;
      for (let x = off; x < pw; x += 16) pxCtx.fillRect(x, y, 14, 6);
    }

    const fl = (Math.floor(st.t / 6) % 2);
    [28, 110, 192].forEach((tx) => {
      pxCtx.fillStyle = '#475569';
      pxCtx.fillRect(tx - 1, 16, 3, 5);
      pxCtx.fillStyle = '#f97316';
      pxCtx.fillRect(tx - 2, 11 + fl, 5, 5 - fl);
    });

    pxCtx.fillStyle = '#271e38';
    pxCtx.fillRect(0, ph - 11, pw, 11);

    const gearMask = S && S.progress ? S.progress.gear : 0;
    const hasGear = (slot) => st.previewGearBit === slot || !!((gearMask >> slot) & 1);
    const hx = Math.round((st.heroX + st.lungeX) / 4);
    const hy = 40;
    const bob = Math.floor(st.t / 15) % 2;

    if (hasGear(1)) {
      pxCtx.fillStyle = '#7e22ce';
      pxCtx.fillRect(hx - 7, hy - 14 + bob, 6, 12);
    }
    pxCtx.fillStyle = meta.color;
    pxCtx.fillRect(hx - 4, hy - 13 + bob, 9, 10);
    pxCtx.fillStyle = '#fde68a';
    pxCtx.fillRect(hx - 3, hy - 19 + bob, 7, 6);
    if (hasGear(0)) {
      pxCtx.fillStyle = '#cbd5e1';
      pxCtx.fillRect(hx - 4, hy - 21 + bob, 9, 7);
    }
    pxCtx.fillStyle = '#e2e8f0';
    pxCtx.fillRect(hx + 6, hy - 21 + bob, 3, 14);

    const bx = Math.round(st.bossX / 4);
    if (!inRaid || !st.boss) {
      pxCtx.fillStyle = '#475569';
      pxCtx.fillRect(bx - 11, 15, 22, 25);
      pxCtx.fillStyle = st.scatterCount >= 2 ? '#fde047' : '#9333ea';
      pxCtx.fillRect(bx - 7, 19, 14, 21);
    } else {
      if (st.boss.hitTimer > 0) st.boss.hitTimer--;
      pxCtx.fillStyle = (st.boss.hitTimer % 2) ? '#ffffff' : '#e11d48';
      pxCtx.fillRect(bx - 10, 13 + bob, 20, 27);
    }

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(pxCanvas, 0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  function tick() {
    st.t++;
    if (st.poseTimer > 0) {
      st.poseTimer--;
      if (st.poseTimer === 0) st.pose = 'idle';
    }
    if (st.previewTimer > 0) {
      st.previewTimer--;
      if (st.previewTimer === 0) st.previewGearBit = -1;
    }
    st.lungeX *= 0.82;
    st.shake *= 0.8;

    if (artStyle === 'compact') {
      requestAnimationFrame(tick);
      return;
    }

    const w = canvas.width;
    const h = canvas.height;
    ctx.save();
    if (st.shake > 0.5) {
      ctx.translate((Math.random() - 0.5) * st.shake, (Math.random() - 0.5) * st.shake);
    }

    if (artStyle === 'pixel') {
      drawPixelStage();
    } else {
      drawGothicSanctum(w, h);
      st.embers.forEach((e) => {
        e.x += e.vx;
        e.y += e.vy;
        if (e.y < 0) { e.y = h - 44; e.x = Math.random() * w; }
        ctx.fillStyle = `rgba(251, 191, 36, ${e.a})`;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
        ctx.fill();
      });
      if (st.scatterCount >= 2) {
        ctx.strokeStyle = '#fde047';
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.moveTo(st.heroX + 32, st.heroY - 54);
        for (let i = 1; i <= 6; i++) {
          const px = st.heroX + 32 + ((st.bossX - st.heroX - 64) * i) / 7;
          const py = st.heroY - 54 + (Math.random() - 0.5) * 30;
          ctx.lineTo(px, py);
        }
        ctx.lineTo(st.bossX - 32, st.bossY - 54);
        ctx.stroke();
      }
      drawHeroGothic();
      drawBossGothic();
    }

    for (let i = st.projectiles.length - 1; i >= 0; i--) {
      const p = st.projectiles[i];
      p.progress += 0.12;
      const cx = p.x0 + (p.x1 - p.x0) * p.progress;
      const cy = p.y0 + (p.y1 - p.y0) * p.progress - Math.sin(p.progress * Math.PI) * 28;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(cx, cy, 13, -0.7, 0.7);
      ctx.stroke();
      if (p.progress >= 1) {
        burst(p.x1, p.y1, p.color, 20, 4.4);
        if (st.boss) st.boss.hitTimer = 14;
        st.shake = 8;
        addCallout(p.x1, p.y1 - 42, p.label || '-1 HP!', '#ff6b6b', 1.15);
        st.projectiles.splice(i, 1);
      }
    }

    for (let i = st.particles.length - 1; i >= 0; i--) {
      const p = st.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.12;
      p.life -= p.decay;
      if (p.life <= 0) { st.particles.splice(i, 1); continue; }
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    for (let i = st.callouts.length - 1; i >= 0; i--) {
      const c = st.callouts[i];
      c.y += c.vy;
      c.life++;
      if (c.life >= c.maxLife) { st.callouts.splice(i, 1); continue; }
      const alpha = c.life > c.maxLife - 15 ? (c.maxLife - c.life) / 15 : 1;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = `700 ${Math.round(13.5 * c.scale)}px "Segoe UI", sans-serif`;
      ctx.textAlign = 'center';
      ctx.strokeStyle = '#07040d';
      ctx.lineWidth = 3.8;
      ctx.strokeText(c.text, c.x, c.y);
      ctx.fillStyle = c.color;
      ctx.fillText(c.text, c.x, c.y);
      ctx.restore();
    }

    ctx.restore();
    requestAnimationFrame(tick);
  }

  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    st.mouseX = ((e.clientX - r.left) / r.width) * canvas.width;
    st.mouseY = ((e.clientY - r.top) / r.height) * canvas.height;
  });

  canvas.addEventListener('click', (e) => {
    const r = canvas.getBoundingClientRect();
    const cx = ((e.clientX - r.left) / r.width) * canvas.width;
    if (cx < canvas.width * 0.5) {
      Arena.triggerAttack();
    } else {
      SFX.taunt();
      burst(st.bossX, st.bossY - 52, inRaid ? '#f43f5e' : '#a855f7', 18, 3.8);
      if (inRaid && st.boss) {
        addCallout(st.bossX, st.bossY - 102, `${st.boss.name}: "Your raid falls here!"`, '#fda4af');
      } else {
        const gCount = S && S.progress ? Game.gearCount(S.progress.gear) : 0;
        addCallout(st.bossX, st.bossY - 102, `Gate Seal: ${gCount}/6 Gear · Land 3+ Gates!`, '#d8b4fe');
      }
    }
  });

  function setArtStyle(style) {
    if (!['gothic', 'pixel', 'compact'].includes(style)) return;
    artStyle = style;
    prefs.set('artStyle', style);
    document.querySelectorAll('.style-btn').forEach((b) => b.classList.toggle('active', b.dataset.style === style));
    $('arena-canvas-wrap').classList.toggle('hidden', style === 'compact');
    document.body.classList.toggle('style-pixel', style === 'pixel');
    SFX.taunt();
  }

  document.querySelectorAll('.style-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.style === artStyle);
    btn.addEventListener('click', () => setArtStyle(btn.dataset.style));
  });
  setArtStyle(artStyle);

  requestAnimationFrame(tick);

  return {
    triggerAttack(customLabel) {
      const meta = HERO_META[curHeroId()];
      st.pose = 'attack';
      st.poseTimer = 28;
      st.lungeX = 46;
      SFX.attack();
      burst(st.heroX + 38, st.heroY - 50, meta.color, 16, 3.8);
      st.projectiles.push({
        x0: st.heroX + 34,
        y0: st.heroY - 52,
        x1: st.bossX - 22,
        y1: st.bossY - 54,
        progress: 0,
        color: meta.color,
        label: customLabel || (inRaid ? 'STRIKE!' : meta.cries[Math.floor(Math.random() * meta.cries.length)]),
      });
    },
    triggerTaunt() {
      const meta = HERO_META[curHeroId()];
      st.pose = 'celebrate';
      st.poseTimer = 38;
      SFX.taunt();
      const cry = meta.cries[Math.floor(Math.random() * meta.cries.length)];
      burst(st.heroX, st.heroY - 52, meta.accent, 22, 4.2);
      addCallout(st.heroX, st.heroY - 104, `"${cry}"`, '#ffe394', 1.1);
    },
    triggerFlex() {
      const gMask = S && S.progress ? S.progress.gear : 0;
      const cnt = Game.gearCount(gMask);
      st.pose = 'celebrate';
      st.poseTimer = 42;
      SFX.loot();
      burst(st.heroX, st.heroY - 46, '#fbbf24', 26, 4.4);
      addCallout(st.heroX, st.heroY - 104, cnt ? `Equipped: ${cnt}/6 Raid Set!` : 'Spin to forge 6/6 Raid Gear!', '#fde047', 1.1);
    },
    previewGear(slotIdx) {
      st.previewGearBit = slotIdx;
      st.previewTimer = 95;
      const g = Game.GEAR[slotIdx];
      const owned = S && S.progress && ((S.progress.gear >> slotIdx) & 1);
      burst(st.heroX, st.heroY - 50, '#fbbf24', 16, 3.4);
      addCallout(st.heroX, st.heroY - 102, `${g.name} (${owned ? 'Equipped' : 'Previewing'})`, '#ffe394');
      SFX.taunt();
    },
    onSpinStart() {
      st.scatterCount = 0;
      st.pose = 'spin';
      st.poseTimer = 20;
    },
    onReelStop(r, col) {
      const hasB = col.includes('B');
      const hasW = col.includes('W');
      if (hasB) {
        st.scatterCount++;
        burst(st.bossX, st.bossY - 52, '#f43f5e', 14, 3.4);
        if (st.scatterCount === 2) {
          st.pose = 'anticipate';
          st.poseTimer = 60;
          addCallout(st.heroX, st.heroY - 102, 'One more Boss Gate!!', '#fde047', 1.15);
        }
      }
      SFX.reelStop(r, speed, hasB, hasW);
    },
    onWin(winAmount, winX) {
      const meta = HERO_META[curHeroId()];
      const big = winX >= 20;
      st.pose = big ? 'celebrate' : 'attack';
      st.poseTimer = big ? 65 : 32;
      st.lungeX = 32;
      SFX.win(big);
      burst(st.heroX + 42, st.heroY - 50, big ? '#fbbf24' : meta.color, big ? 34 : 18, big ? 5.4 : 3.8);
      addCallout(440, 80, big ? `🔥 BIG WIN +${money(winAmount)} (${xFmt(winX)})!` : `+${money(winAmount)}`, '#ffe394', big ? 1.3 : 1.05);
    },
    onLoot(items) {
      SFX.loot();
      st.pose = 'celebrate';
      st.poseTimer = 45;
      burst(st.heroX, st.heroY - 52, '#fbbf24', 28, 4.5);
      const names = items.map((it) => Game.GEAR[it.slot].name).join(' + ');
      addCallout(st.heroX, st.heroY - 104, `⚙️ Equipped ${names}!`, '#fde047', 1.15);
    },
    setBoss(bossObj, hp, maxHp) {
      if (!bossObj) { st.boss = null; return; }
      st.boss = { name: bossObj.name, hp, maxHp, reward: bossObj.reward, hitTimer: 0 };
    },
    onStepHits(step) {
      if (!step.hits.length) return;
      const meta = HERO_META[curHeroId()];
      st.pose = 'attack';
      st.poseTimer = 28;
      st.lungeX = 54;
      SFX.attack();
      step.hits.forEach((h, i) => {
        st.projectiles.push({
          x0: st.heroX + 34,
          y0: st.heroY - 52,
          x1: st.bossX - 18,
          y1: st.bossY - 54 + (i - (step.hits.length - 1) / 2) * 14,
          progress: i * -0.14,
          color: h.crit ? '#fde047' : h.marked ? '#4ade80' : step.charged ? '#c084fc' : meta.color,
          label: `-${h.dmg}${h.crit ? ' CRIT!' : h.marked ? ' MARK!' : ''}`,
        });
      });
    },
    onBossKilled(bossName, mult) {
      SFX.bossKill();
      burst(st.bossX, st.bossY - 54, '#f43f5e', 40, 6);
      burst(st.bossX, st.bossY - 54, '#fbbf24', 28, 4.8);
      st.shake = 15;
      addCallout(440, 66, `💀 ${bossName} SLAIN! Multiplier x${mult}!`, '#fde047', 1.25);
    },
  };
})();

$('act-attack').addEventListener('click', () => Arena.triggerAttack());
$('act-taunt').addEventListener('click', () => Arena.triggerTaunt());
$('act-flex').addEventListener('click', () => Arena.triggerFlex());
$('sound-toggle').addEventListener('click', () => SFX.setMuted(!SFX.isMuted()));
SFX.setMuted(SFX.isMuted());

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
  if (cell.dataset.sym !== sym) {
    cell.children[0].innerHTML = def.icon;
    cell.children[1].textContent = LABELS[sym] || def.name.replace(' Rune', '');
    cell.dataset.sym = sym;
  }
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

const cellKey = (r, row) => r * Game.ROWS + row;
async function spinReels(gridPromise, opts = {}) {
  clearMarks();
  Arena.onSpinStart();
  SFX.spin(speed);
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
      Arena.onReelStop(r, grid[r]);
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
    Game.GEAR.forEach((g, idx) => {
      const d = document.createElement('div');
      d.className = 'gear-slot';
      d.innerHTML = `<span class="icon">${g.icon}</span>${esc(g.name)}`;
      d.title = `Click to preview ${g.name} on your Champion`;
      d.addEventListener('click', () => Arena.previewGear(idx));
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
  $('raid-hero').innerHTML = `${hero.icon} ${esc(hero.name)}`;
  const list = raid.bosses;
  const cleared = view.bossIndex >= list.length;
  const curBoss = cleared ? list[list.length - 1] : list[view.bossIndex];
  $('boss-portrait').innerHTML = bossSvg(curBoss.name);
  $('boss-name').textContent = cleared ? 'Raid cleared!' : curBoss.name;
  const max = cleared ? 1 : curBoss.hp;
  const hp = cleared ? 0 : Math.max(0, view.hp);
  const width = `${(hp / max) * 100}%`;
  $('hp-fill').style.width = width;
  $('hp-lag').style.width = width;
  $('hp-text').textContent = cleared ? 'All bosses down' : `${hp} / ${max} HP`;
  $('raid-mult').textContent = 'x' + view.mult;
  $('raid-next').textContent = cleared ? '—' : 'x' + curBoss.reward;
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
    return `<span class="pip ${cls}${secret}">${bossSvg(b.name)} ${esc(b.name)} · ${b.hp} HP · x${b.reward}</span>`;
  }).join('');
  Arena.setBoss(cleared ? null : curBoss, hp, max);
}

function showHits(step) {
  if (skipping() || !sp().pop) return;
  Arena.onStepHits(step);
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
  await banner(`${esc(tier.title)}<small><span class="inline-svg">${hero.icon}</span> ${esc(hero.name)} · ${raid.glory
    ? `Glory or Wipe: beat every boss for ${Game.MODES[round.mode].maxWinX.toLocaleString()}x. Spin wins don't count.`
    : `${raid.spins} spins · starting multiplier x${raid.startMult}${sticky}`}</small>`);

  for (const step of raid.steps) {
    const hpBefore = view.hp;
    const alive = view.bossIndex < raid.bosses.length;
    const fixed = new Set(step.stickyCells.map(([r, row]) => cellKey(r, row)));
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
    if (!raid.glory && step.winX > 0) {
      setText(`${money(step.winX * bet)} <small>(x${step.multUsed})</small>`);
      Arena.onWin(step.winX * bet, step.winX);
    }
    if (step.damage > 0 || step.hits.length) await wait(sp().pop);
    for (const ev of step.events) {
      if (ev.type === 'bossKilled') {
        Arena.onBossKilled(raid.bosses[ev.boss].name, ev.mult);
        await banner(`${bossSvg(raid.bosses[ev.boss].name)} ${esc(raid.bosses[ev.boss].name)} defeated!<small>Multiplier x${ev.mult} · +${ev.spins} spins</small>`, sp().banner);
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
  const last = raid.steps[raid.steps.length - 1];
  if (last) {
    renderGrid(last.grid);
    last.stickyCells.forEach(([r, row]) => cells[r][row].classList.add('sticky'));
  }
  renderRaidBar(raid, { ...view, win: raid.totalX * bet });
  inRaid = false;
  skipRequested = false;
  Arena.setBoss(null, 0, 1);
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

function renderHeroPick(el, selected, { tier = null, locked = false } = {}) {
  const m = Game.MODES[S.mode];
  el.innerHTML = Game.HEROES.map((h) => {
    const clear = tier !== null ? `<small>clears ${pct(m.clearRate[h.id][tier], 1)}</small>` : `<small>${esc(h.style)}</small>`;
    const off = locked && h.id !== selected ? 'disabled' : '';
    return `<button type="button" class="hero-card${h.id === selected ? ' active' : ''}" data-hero="${h.id}" role="radio" aria-checked="${h.id === selected}" ${off}
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
        SFX.gamble(r.gamble.won);
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
  if (autoLeft > 0) stopAuto();
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
      badge.innerHTML = Game.GEAR[it.slot].icon;
      badge.title = Game.GEAR[it.slot].name;
      cells[r][row].appendChild(badge);
    });
    renderGear({ gear: round.loot.gear, dry: round.progressBefore.dry }, round.loot.items.map((it) => it.slot));
    Arena.onLoot(round.loot.items);
    const names = round.loot.items.map((it) => Game.GEAR[it.slot].name).join(', ');
    setText(round.loot.cache ? `${esc(round.loot.cache)}! ${esc(names)}` : `Loot: ${esc(names)}`);
  }
  if (base.winX > 0) {
    Arena.onWin(base.winX * round.bet, base.winX);
    if (!round.loot) setText(`${money(base.winX * round.bet)}`);
  }
  if (base.winX > 0 || round.loot || round.bonus) await sleep(sp().winHold);
}

async function run(task) {
  if (busy) return;
  busy = true;
  updateControls();
  try {
    await task();
  } catch (e) {
    stopAuto();
    setText(esc(e.message));
    await refresh();
  } finally {
    busy = false;
    inRaid = false;
    $('raid-bar').classList.add('hidden');
    updateControls();
  }
}

function stopAuto() {
  autoLeft = 0;
  const btn = $('auto-btn');
  if (btn) {
    btn.textContent = 'Auto';
    btn.classList.remove('active');
  }
}

async function spin() {
  await run(async () => {
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
  if (autoLeft > 0) {
    autoLeft--;
    $('auto-btn').textContent = autoLeft > 0 ? `Stop (${autoLeft})` : 'Auto';
    if (autoLeft > 0 && S && S.balance >= S.bets[betIndex]) {
      setTimeout(() => { if (autoLeft > 0 && !busy) spin(); }, 180);
    } else {
      stopAuto();
    }
  }
}

function buy(buyId) {
  stopAuto();
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

let heroChosen = prefs.get('heroChosen', false);

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

$('spin').addEventListener('click', () => { stopAuto(); spin(); });
$('auto-btn').addEventListener('click', () => {
  if (autoLeft > 0) { stopAuto(); return; }
  const count = Number($('auto-select').value) || 10;
  if ($('auto-select').value === '0') $('auto-select').value = '10';
  autoLeft = count;
  $('auto-btn').classList.add('active');
  $('auto-btn').textContent = `Stop (${autoLeft})`;
  if (!busy) spin();
});
$('bet-down').addEventListener('click', () => { betIndex = Math.max(0, betIndex - 1); prefs.set('bet', betIndex); render(); });
$('bet-up').addEventListener('click', () => { betIndex = Math.min(S.bets.length - 1, betIndex + 1); prefs.set('bet', betIndex); render(); });
$('speed').value = speed;
$('speed').addEventListener('change', (e) => { speed = e.target.value; prefs.set('speed', speed); });
$('reset-balance').addEventListener('click', async () => { S = await api('/api/reset-balance', {}); render(); });
document.addEventListener('keydown', (e) => {
  if (e.code !== 'Space' || e.repeat) return;
  if (/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(document.activeElement.tagName)) return;
  e.preventDefault();
  if (!$('spin').disabled) { stopAuto(); spin(); }
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
    return `<button type="button" class="buy-item" data-buy="${b.id}" ${cost > S.balance ? 'disabled' : ''}>
      <span>${esc(b.name)}<small>${esc(buyBlurb(b, S.mode))}</small></span>
      <span class="price">${money(cost)}<small>${priceX}x bet</small></span></button>`;
  }).join('');
}
$('buy-open').addEventListener('click', () => {
  renderBuyList();
  buyModal.classList.remove('hidden');
});

/* ---------- Class (profile) ---------- */

async function chooseHero(id) {
  if (id !== S.hero) S = await api('/api/hero', { hero: id });
  prefs.set('hero', S.hero);
  render();
  Arena.triggerTaunt();
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
$('modes').innerHTML = Object.entries(Game.MODES).map(([id, m]) => `<button type="button" data-mode="${id}">${esc(m.label)}</button>`).join('');
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
    const tier = h.tier !== null ? `<span class="tier-chip t-${Game.TIERS[h.tier].id}">${esc(Game.TIERS[h.tier].name.replace(' Bonus', ''))}</span>${h.hero ? `<span class="inline-svg">${heroById(h.hero).icon}</span>` : ''}` : '';
    const action = h.serverSeed ? `<button type="button" data-verify="${i}">Verify</button>` : '<span class="sub">rotate to verify</span>';
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
$('v-hero').innerHTML = Game.HEROES.map((h) => `<option value="${h.id}">${esc(h.name)}</option>`).join('');
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
    ? `<p>Bonus: <span class="tier-chip t-${Game.TIERS[r.bonus.triggeredTier].id}">${esc(Game.TIERS[r.bonus.triggeredTier].name)}</span>${r.bonus.tier !== r.bonus.triggeredTier ? ` → ${r.bonus.tier === null ? 'forfeited' : esc(Game.TIERS[r.bonus.tier].name)}` : ''}${r.raid ? ` · <span class="inline-svg">${heroById(r.raid.hero).icon}</span> raid ${xFmt(r.raid.totalX)} over ${r.raid.steps.length} spins` : ''}</p>`
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
  const hpRows = allBosses.map((b, i) => `<tr><td><span class="inline-svg">${bossSvg(b.name)}</span> ${esc(b.name)}${i === m.bosses.length ? ' <em>secret</em>' : ''}</td>${Game.TIERS.map((_, t) => {
    const list = Game.raidBosses(m, t);
    return `<td>${i < m.tiers[t].startBoss || i >= list.length ? '—' : list[i].hp}</td>`;
  }).join('')}<td>x${b.reward}</td></tr>`).join('');
  const tierHead = Game.TIERS.map((t) => `<th>${esc(t.name.replace(' Bonus', '').replace('Super Hidden', 'S.Hidden'))}</th>`).join('');
  const classRows = Game.HEROES.map((h) => `<tr><td><span class="inline-svg">${h.icon}</span> ${esc(h.name)}</td>${Game.TIERS.map((_, t) => `<td>${pct(m.clearRate[h.id][t], 1)}</td>`).join('')}</tr>`).join('');
  const classInfo = Game.HEROES.map((h) => `<p class="hint"><b><span class="inline-svg">${h.icon}</span> ${esc(h.name)}</b> (${esc(h.style)}): ${esc(h.ability)}</p>`).join('');
  $('paytable').innerHTML = `
    <h3>${esc(m.label)} · max win ${m.maxWinX.toLocaleString()}x</h3>
    <p class="hint">${esc(m.blurb)} Pays are per way, as multiples of your total bet.</p>
    <table><tr><th>Symbol</th><th>3</th><th>4</th><th>5</th></tr>${rows}</table>
    <p class="hint"><span class="inline-svg">${Game.SYMBOLS.W.icon}</span> Wild on reels 2–4 · <span class="inline-svg">${Game.SYMBOLS.B.icon}</span> Boss Gate scatter pays ${Object.entries(m.scatterPay).map(([n, x]) => `${n}: ${xFmt(x * m.scale)}`).join(', ')}</p>
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
  $('class-name').innerHTML = `${hero.icon} ${esc(hero.name)}`;
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
  const savedHero = prefs.get('hero', null);
  if (savedHero && savedHero !== S.hero && !S.pending && Game.HEROES.some((h) => h.id === savedHero)) {
    try { S = await api('/api/hero', { hero: savedHero }); } catch { /* keep the server's */ }
  }
  renderGrid(Game.MODES[S.mode].strips.base.map((strip) => strip.slice(0, Game.ROWS)));
  render();
  const tab = prefs.get('tab', 'fair');
  const tabBtn = document.querySelector(`.tabs button[data-tab="${tab}"]`);
  if (tabBtn && !tabBtn.classList.contains('hidden')) tabBtn.click();
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
