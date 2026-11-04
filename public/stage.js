// Raid stage. A small champion on the left, a boss that fills the right.
// Drawing is procedural. RaidArt.registerImage can replace the hall, the
// hero, or one boss later without changing this file's calls.
(function (root) {
  'use strict';

  const LINES = {
    'Gravelord Okk': ['The grave keeps what it takes.', 'Kneel. The stone is patient.', 'I have buried brighter raids.'],
    'Sister Venn': ['Count the eyes. Miss one.', 'Your pulse is already mine.', 'Come closer. The veil parts.'],
    'The Ashen Wyrm': ['Ash remembers your name.', 'Burn, and be counted.', 'Wings enough to bury a hall.'],
    'The Hollow King': ['The crown fits any corpse.', 'No heart. No mercy.', 'Kneel to an empty throne.'],
    'The Unseen': ['You were seen first.', 'Names end here.', 'Look away. It will not help.'],
  };

  function create(opts) {
    const canvas = opts.canvas;
    const ctx = canvas.getContext('2d');
    const prefs = opts.prefs;
    const sfx = opts.sfx;
    const getState = opts.getState;
    const getInRaid = opts.getInRaid;
    const getSpeed = opts.getSpeed;

    let artStyle = prefs.get('artStyle', 'gothic');
    if (!['gothic', 'pixel', 'compact'].includes(artStyle)) artStyle = 'gothic';

    const st = {
      t: 0,
      mouseX: 480,
      mouseY: 180,
      pose: 'idle',
      poseTimer: 0,
      lunge: 0,
      shake: 0,
      previewGearBit: -1,
      previewTimer: 0,
      scatterCount: 0,
      boss: null,
      intro: 0,
      fx: null,
      fxTimer: 0,
      death: 0,
      particles: [],
      projectiles: [],
      callouts: [],
      motes: Array.from({ length: 42 }, () => mote(canvas.width, canvas.height)),
    };

    function mote(w, h) {
      return {
        x: Math.random() * w,
        y: Math.random() * h,
        v: 0.15 + Math.random() * 0.45,
        r: 0.8 + Math.random() * 1.8,
        a: 0.15 + Math.random() * 0.45,
      };
    }

    const META = {
      warrior: { color: '#ef4444', accent: '#fbbf24', cries: ['Hold the wall.', 'Blood and iron.', 'For the raid.'] },
      rogue: { color: '#34d399', accent: '#a78bfa', cries: ['From the dark.', 'One opening.', 'The purse, then the throat.'] },
      mage: { color: '#38bdf8', accent: '#c4b5fd', cries: ['The surge is lit.', 'Count the fourth.', 'Unmake the gate.'] },
      hunter: { color: '#4ade80', accent: '#fde047', cries: ['Marked.', 'Center holds.', 'Loose.'] },
      priest: { color: '#fde047', accent: '#fdba74', cries: ['Not this one.', 'Light enough.', 'Rise.'] },
    };

    function heroId() {
      const s = getState();
      return s && META[s.hero] ? s.hero : 'warrior';
    }

    function layout() {
      const w = canvas.width;
      const h = canvas.height;
      return { w, h, heroX: w * 0.2, heroY: h * 0.84, bossX: w * 0.7, bossY: h * 0.9 };
    }

    function addCallout(x, y, text, color, scale) {
      st.callouts.push({ x, y, text, color: color || '#ffe7a3', vy: -0.7, life: 0, max: 78, scale: scale || 1 });
      if (st.callouts.length > 7) st.callouts.shift();
    }

    function burst(x, y, color, count, speed) {
      for (let i = 0; i < count; i++) {
        const a = (Math.PI * 2 * i) / count + Math.random() * 0.4;
        const sp = (0.35 + Math.random()) * (speed || 3);
        st.particles.push({
          x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1,
          r: 1.5 + Math.random() * 2.6, color, life: 1, decay: 0.012 + Math.random() * 0.02,
        });
      }
    }

    function gearMask() {
      const s = getState();
      return s && s.progress ? s.progress.gear : 0;
    }

    function hasGear(slot) {
      return st.previewGearBit === slot || !!((gearMask() >> slot) & 1);
    }

    function look(ox, oy) {
      const dx = st.mouseX - ox;
      const dy = st.mouseY - oy;
      const m = Math.hypot(dx, dy) || 1;
      return { x: (dx / m) * 3.2, y: (dy / m) * 2.2 };
    }

    function eye(x, y, r, glow, originX, originY) {
      const L = look(originX, originY);
      ctx.fillStyle = '#0a0608';
      ctx.beginPath();
      ctx.ellipse(x, y, r * 1.35, r, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = glow;
      ctx.shadowColor = glow;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(x + L.x, y + L.y, r * 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    function drawHall(L) {
      const img = root.RaidArt && root.RaidArt.image('stage:backdrop');
      if (img) {
        ctx.drawImage(img, 0, 0, L.w, L.h);
        return;
      }
      const raid = getInRaid();
      const mode = (getState() && getState().mode) || 'standard';
      const g = ctx.createLinearGradient(0, 0, 0, L.h);
      if (raid) {
        g.addColorStop(0, '#2a0812');
        g.addColorStop(0.45, '#12060c');
        g.addColorStop(1, '#070306');
      } else if (mode === 'mega') {
        g.addColorStop(0, '#2a0c10');
        g.addColorStop(1, '#070406');
      } else if (mode === 'steady') {
        g.addColorStop(0, '#101820');
        g.addColorStop(1, '#07080c');
      } else {
        g.addColorStop(0, '#1a1024');
        g.addColorStop(1, '#07060c');
      }
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, L.w, L.h);

      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      for (let i = 0; i < 6; i++) {
        const x = 70 + i * 160;
        ctx.fillRect(x, 0, 26, L.h * 0.72);
        ctx.beginPath();
        ctx.moveTo(x - 18, L.h * 0.22);
        ctx.lineTo(x + 13, 8);
        ctx.lineTo(x + 44, L.h * 0.22);
        ctx.fill();
      }

      const floorY = L.h * 0.78;
      const fg = ctx.createLinearGradient(0, floorY, 0, L.h);
      fg.addColorStop(0, '#1a141c');
      fg.addColorStop(1, '#09070b');
      ctx.fillStyle = fg;
      ctx.fillRect(0, floorY, L.w, L.h - floorY);
      ctx.strokeStyle = 'rgba(196, 146, 58, 0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, floorY);
      ctx.lineTo(L.w, floorY);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      for (let i = -2; i < 8; i++) {
        ctx.beginPath();
        ctx.moveTo(L.w * 0.5 + i * 80, floorY);
        ctx.lineTo(L.w * 0.5 + i * 150, L.h);
        ctx.stroke();
      }

      [L.w * 0.08, L.w * 0.92].forEach((x, i) => {
        const flick = 0.75 + Math.sin(st.t * 0.2 + i) * 0.25;
        const rg = ctx.createRadialGradient(x, floorY - 20, 4, x, floorY - 30, 90 * flick);
        rg.addColorStop(0, 'rgba(251, 146, 60, 0.55)');
        rg.addColorStop(1, 'rgba(251, 146, 60, 0)');
        ctx.fillStyle = rg;
        ctx.fillRect(x - 90, floorY - 120, 180, 140);
        ctx.fillStyle = '#3f3f46';
        ctx.fillRect(x - 8, floorY - 36, 16, 36);
        ctx.fillStyle = '#fb923c';
        ctx.beginPath();
        ctx.moveTo(x - 10, floorY - 36);
        ctx.quadraticCurveTo(x + Math.sin(st.t * 0.3 + i) * 6, floorY - 70, x + 10, floorY - 36);
        ctx.fill();
      });

      const vig = ctx.createRadialGradient(L.w * 0.62, L.h * 0.45, L.h * 0.2, L.w * 0.5, L.h * 0.5, L.w * 0.62);
      vig.addColorStop(0, 'rgba(0,0,0,0)');
      vig.addColorStop(1, 'rgba(0,0,0,0.55)');
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, L.w, L.h);
    }

    function drawHero(L) {
      const id = heroId();
      const meta = META[id];
      const img = root.RaidArt && root.RaidArt.image('stage:hero');
      const x = L.heroX + st.lunge;
      const bob = Math.sin(st.t * 0.07) * 3;
      const y = L.heroY + bob + (st.pose === 'celebrate' ? -8 : 0);
      if (img) {
        ctx.drawImage(img, x - 70, y - 200, 140, 200);
        return;
      }
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(1.65, 1.65);
      const body = ctx.createLinearGradient(-20, -140, 20, 0);
      body.addColorStop(0, meta.color);
      body.addColorStop(1, '#1c1214');
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath();
      ctx.ellipse(0, 6, 28, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      if (hasGear(1)) {
        ctx.fillStyle = '#4c1d95';
        ctx.beginPath();
        ctx.moveTo(-8, -78);
        ctx.quadraticCurveTo(-46, -40, -22, 2);
        ctx.lineTo(-6, -36);
        ctx.fill();
      }
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.moveTo(-16, -36);
      ctx.lineTo(-22, -88);
      ctx.quadraticCurveTo(0, -102, 22, -88);
      ctx.lineTo(16, -36);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#e7c8b0';
      ctx.beginPath();
      ctx.ellipse(0, -108, 11, 13, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = hasGear(0) ? '#cbd5e1' : '#3f3f46';
      ctx.beginPath();
      ctx.moveTo(-14, -112);
      ctx.quadraticCurveTo(0, -136, 14, -112);
      ctx.quadraticCurveTo(0, -104, -14, -112);
      ctx.fill();
      if (id === 'warrior') {
        ctx.fillStyle = meta.accent;
        ctx.beginPath();
        ctx.moveTo(-16, -118);
        ctx.lineTo(-26, -138);
        ctx.lineTo(-8, -120);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(16, -118);
        ctx.lineTo(26, -138);
        ctx.lineTo(8, -120);
        ctx.fill();
      }
      eye(-4, -108, 2.1, meta.accent, x, y);
      eye(5, -108, 2.1, meta.accent, x, y);
      if (hasGear(4)) {
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, -70, 6, 0.2, Math.PI - 0.2);
        ctx.stroke();
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(0, -62, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = hasGear(2) ? '#e7e5e4' : '#44403c';
      ctx.beginPath();
      ctx.roundRect(-30, -86, 12, 28, 4);
      ctx.roundRect(18, -86, 12, 28, 4);
      ctx.fill();
      ctx.fillStyle = hasGear(3) ? '#a8a29e' : '#292524';
      ctx.beginPath();
      ctx.moveTo(-14, -36);
      ctx.lineTo(-18, -4);
      ctx.lineTo(-4, -4);
      ctx.lineTo(-4, -36);
      ctx.moveTo(4, -36);
      ctx.lineTo(6, -4);
      ctx.lineTo(18, -4);
      ctx.lineTo(14, -36);
      ctx.fill();
      if (hasGear(5)) {
        ctx.fillStyle = '#a855f7';
        ctx.beginPath();
        ctx.arc(24, -60, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.strokeStyle = '#e7e5e4';
      ctx.fillStyle = meta.accent;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      if (id === 'warrior') {
        ctx.beginPath();
        ctx.moveTo(26, -90);
        ctx.lineTo(48, st.pose === 'attack' ? -130 : -150);
        ctx.stroke();
      } else if (id === 'rogue') {
        ctx.beginPath();
        ctx.moveTo(-30, -70);
        ctx.lineTo(-48, -96);
        ctx.moveTo(30, -70);
        ctx.lineTo(50, -100);
        ctx.stroke();
      } else if (id === 'mage') {
        ctx.beginPath();
        ctx.moveTo(24, -20);
        ctx.lineTo(36, -130);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(36, -138, 7, 0, Math.PI * 2);
        ctx.fill();
      } else if (id === 'hunter') {
        ctx.beginPath();
        ctx.arc(34, -100, 18, -1.2, 1.2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(20, -100);
        ctx.lineTo(52, -100);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(30, -120);
        ctx.lineTo(30, -40);
        ctx.moveTo(18, -108);
        ctx.lineTo(42, -108);
        ctx.stroke();
        ctx.fillStyle = '#fff7d6';
        ctx.beginPath();
        ctx.arc(30, -120, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    function plate(name, hp, maxHp, x, y) {
      const w = 250;
      ctx.save();
      ctx.translate(x - w / 2, y);
      ctx.fillStyle = 'rgba(8, 6, 10, 0.82)';
      ctx.strokeStyle = 'rgba(196, 146, 58, 0.8)';
      ctx.lineWidth = 2;
      roundRect(0, 0, w, 36, 6);
      ctx.fill();
      ctx.stroke();
      ctx.font = '700 16px Georgia, serif';
      ctx.fillStyle = '#ffe7a3';
      ctx.textAlign = 'center';
      ctx.fillText(name, w / 2, 16);
      if (maxHp > 0) {
        ctx.fillStyle = '#1a0a0e';
        ctx.fillRect(10, 22, w - 20, 8);
        const ratio = Math.max(0, Math.min(1, hp / maxHp));
        ctx.fillStyle = ratio < 0.3 ? '#ef4444' : '#b91c1c';
        ctx.fillRect(10, 22, (w - 20) * ratio, 8);
      }
      ctx.restore();
    }

    function roundRect(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    function drawBossBody(name, hit) {
      const breathe = Math.sin(st.t * 0.045) * 5;
      ctx.save();
      ctx.translate(0, breathe + st.death * 30);
      ctx.scale(1, 1 - st.death * 0.25);
      ctx.globalAlpha = 1 - st.death * 0.85;
      if (name === 'Sister Venn') drawVenn();
      else if (name === 'The Ashen Wyrm') drawWyrm();
      else if (name === 'The Hollow King') drawKing();
      else if (name === 'The Unseen') drawUnseen();
      else if (name === 'gate') drawGate();
      else drawOkk();
      if (hit) {
        ctx.fillStyle = 'rgba(255,255,255,0.28)';
        ctx.beginPath();
        ctx.ellipse(0, -150, 90, 130, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    function drawOkk() {
      ctx.fillStyle = '#1c1917';
      ctx.beginPath();
      ctx.moveTo(-70, -20);
      ctx.quadraticCurveTo(-120, -160, -40, -250);
      ctx.quadraticCurveTo(0, -290, 50, -250);
      ctx.quadraticCurveTo(130, -160, 80, -20);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#44403c';
      ctx.fillRect(-78, -40, 36, 44);
      ctx.fillRect(48, -40, 36, 44);
      horn(-46, -230, -30, -40);
      horn(36, -230, 34, -36);
      ctx.fillStyle = '#44403c';
      ctx.beginPath();
      ctx.moveTo(-90, -150);
      ctx.quadraticCurveTo(-150, -80, -70, -10);
      ctx.lineTo(-40, -40);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(90, -140);
      ctx.quadraticCurveTo(160, -40, 80, -8);
      ctx.lineTo(46, -30);
      ctx.fill();
      ctx.fillStyle = '#0c1f17';
      ctx.beginPath();
      ctx.ellipse(0, -180, 48, 36, 0, 0, Math.PI * 2);
      ctx.fill();
      eye(-16, -186, 7, '#34d399', 0, -180);
      eye(18, -186, 7, '#34d399', 0, -180);
      ctx.fillStyle = '#052e16';
      ctx.fillRect(-20, -160, 40, 10);
      const fire = ctx.createLinearGradient(0, -150, 0, -120);
      fire.addColorStop(0, 'rgba(52,211,153,0.1)');
      fire.addColorStop(1, 'rgba(52,211,153,0.85)');
      ctx.fillStyle = fire;
      ctx.fillRect(-16, -158, 32, 18 + Math.sin(st.t * 0.3) * 4);
    }

    function horn(x, y, dx, dy) {
      ctx.fillStyle = '#d6d3d1';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + dx * 0.4, y + dy * 0.2, x + dx, y + dy);
      ctx.quadraticCurveTo(x + dx * 0.2, y + 10, x + 8, y + 8);
      ctx.fill();
    }

    function drawVenn() {
      ctx.fillStyle = '#4c0519';
      ctx.beginPath();
      ctx.moveTo(-30, -270);
      ctx.lineTo(30, -270);
      ctx.lineTo(70, -10);
      ctx.lineTo(-70, -10);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#881337';
      ctx.fillRect(-36, -250, 72, 40);
      for (let i = -1; i <= 1; i++) {
        eye(i * 18, -210, 5, '#fecdd3', 0, -210);
      }
      eye(-10, -186, 4, '#fb7185', 0, -186);
      eye(12, -186, 4, '#fb7185', 0, -186);
      ctx.strokeStyle = '#fda4af';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-54, -80);
      ctx.quadraticCurveTo(-90, -40, -70, 0);
      ctx.moveTo(54, -80);
      ctx.quadraticCurveTo(96, -30, 78, 0);
      ctx.stroke();
    }

    function drawWyrm() {
      ctx.fillStyle = '#292524';
      ctx.beginPath();
      ctx.moveTo(-40, -10);
      ctx.quadraticCurveTo(-20, -180, 10, -250);
      ctx.quadraticCurveTo(80, -280, 110, -200);
      ctx.quadraticCurveTo(140, -80, 40, -10);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(249, 115, 22, 0.35)';
      ctx.beginPath();
      ctx.moveTo(-20, -200);
      ctx.quadraticCurveTo(-110, -160, -130, -60);
      ctx.quadraticCurveTo(-40, -120, -10, -170);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(40, -180);
      ctx.quadraticCurveTo(150, -150, 160, -40);
      ctx.quadraticCurveTo(70, -100, 30, -160);
      ctx.fill();
      eye(48, -210, 8, '#fde047', 48, -210);
      ctx.fillStyle = '#fb923c';
      ctx.beginPath();
      ctx.ellipse(70, -180, 16, 10, 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fdba74';
      for (let i = 0; i < 4; i++) {
        ctx.fillRect(24 + i * 14, -150 - Math.sin(st.t * 0.2 + i) * 6, 8, 16);
      }
    }

    function drawKing() {
      ctx.fillStyle = '#090514';
      ctx.fillRect(-60, -200, 120, 190);
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.moveTo(-70, -200);
      ctx.lineTo(-50, -270);
      ctx.lineTo(-20, -220);
      ctx.lineTo(0, -286);
      ctx.lineTo(24, -220);
      ctx.lineTo(54, -274);
      ctx.lineTo(74, -200);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#3b0764';
      ctx.fillRect(-36, -180, 72, 54);
      eye(-14, -156, 5, '#e9d5ff', 0, -156);
      eye(16, -156, 5, '#e9d5ff', 0, -156);
      ctx.strokeStyle = '#c4b5fd';
      ctx.lineWidth = 2;
      ctx.strokeRect(-28, -90, 56, 40);
    }

    function drawUnseen() {
      ctx.fillStyle = '#05020a';
      ctx.beginPath();
      ctx.ellipse(0, -150, 100, 130, 0, 0, Math.PI * 2);
      ctx.fill();
      const pulse = 16 + Math.sin(st.t * 0.08) * 2;
      ctx.fillStyle = '#fef9c3';
      ctx.beginPath();
      ctx.ellipse(0, -150, 58, pulse + 8, 0, 0, Math.PI * 2);
      ctx.fill();
      const pupil = look(Lboss(), -150);
      ctx.fillStyle = '#3b0764';
      ctx.beginPath();
      ctx.arc(pupil.x * 1.4, -150 + pupil.y, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(232, 121, 249, 0.7)';
      ctx.lineWidth = 2;
      const spin = st.t * 0.03;
      for (let i = 0; i < 4; i++) {
        const a = spin + (i * Math.PI) / 2;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * 78, -150 + Math.sin(a) * 78, 4, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    function drawGate() {
      const open = st.scatterCount >= 2;
      ctx.fillStyle = '#1c1917';
      ctx.beginPath();
      ctx.moveTo(-96, -20);
      ctx.lineTo(-88, -250);
      ctx.quadraticCurveTo(0, -310, 88, -250);
      ctx.lineTo(96, -20);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#d6d3d1';
      ctx.lineWidth = 6;
      ctx.stroke();
      const maw = ctx.createRadialGradient(0, -140, 10, 0, -130, 90);
      maw.addColorStop(0, open ? '#581c87' : '#0c0a09');
      maw.addColorStop(1, '#1c1917');
      ctx.fillStyle = maw;
      ctx.beginPath();
      ctx.moveTo(-48, -36);
      ctx.lineTo(-46, -190);
      ctx.quadraticCurveTo(0, -246, 46, -190);
      ctx.lineTo(48, -36);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#44403c';
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.moveTo(-78 + i * 8, -250 + i * 6);
        ctx.lineTo(-40, -210);
        ctx.lineTo(-70 + i * 8, -236);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(78 - i * 8, -250 + i * 6);
        ctx.lineTo(40, -210);
        ctx.lineTo(70 - i * 8, -236);
        ctx.fill();
      }
      if (open) {
        eye(-16, -150, 7, '#fde047', 0, -150);
        eye(16, -150, 7, '#fde047', 0, -150);
        ctx.strokeStyle = '#fde68a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-10, -120);
        ctx.lineTo(0, -100);
        ctx.lineTo(12, -118);
        ctx.stroke();
      } else {
        ctx.strokeStyle = 'rgba(253, 224, 71, 0.35)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -200);
        ctx.lineTo(-6, -80);
        ctx.lineTo(4, -40);
        ctx.stroke();
      }
      ctx.strokeStyle = '#a16207';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-90, -160);
      ctx.quadraticCurveTo(-130, -190, -150, -230);
      ctx.moveTo(90, -160);
      ctx.quadraticCurveTo(130, -190, 150, -230);
      ctx.stroke();
    }

    function Lboss() {
      return layout().bossX;
    }

    function drawBoss(L) {
      const showBoss = !!st.boss;
      const name = showBoss ? st.boss.name : 'gate';
      const img = root.RaidArt && root.RaidArt.image(showBoss ? 'stage:boss:' + name : 'stage:boss:gate');
      const introScale = 1 + st.intro * 0.18;
      ctx.save();
      ctx.translate(L.bossX, L.bossY);
      ctx.scale(introScale * 1.12, introScale * 1.12);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath();
      ctx.ellipse(0, 0, 90, 16, 0, 0, Math.PI * 2);
      ctx.fill();
      if (img) ctx.drawImage(img, -150, -300, 300, 300);
      else drawBossBody(name, st.boss && st.boss.hitTimer > 0);
      ctx.restore();
      const label = showBoss ? st.boss.name : (st.scatterCount >= 2 ? 'The gate stirs' : 'Sealed Gate');
      const hp = showBoss ? st.boss.hp : 0;
      const maxHp = showBoss ? st.boss.maxHp : 0;
      plate(label, hp, maxHp, L.bossX, 16);
    }

    function drawPixel(L) {
      ctx.fillStyle = getInRaid() ? '#1a0a10' : '#100c16';
      ctx.fillRect(0, 0, L.w, L.h);
      ctx.fillStyle = '#241c30';
      for (let x = 0; x < L.w; x += 24) ctx.fillRect(x, L.h - 28, 16, 10);
      const meta = META[heroId()];
      const hx = L.heroX + st.lunge;
      ctx.fillStyle = meta.color;
      ctx.fillRect(hx - 16, L.heroY - 70, 32, 48);
      ctx.fillStyle = '#fde68a';
      ctx.fillRect(hx - 10, L.heroY - 90, 20, 18);
      const bx = L.bossX;
      ctx.fillStyle = st.boss && st.boss.hitTimer > 0 ? '#fff' : '#7f1d1d';
      ctx.fillRect(bx - 70, L.bossY - 200, 140, 180);
      ctx.fillStyle = '#fde047';
      ctx.fillRect(bx - 30, L.bossY - 150, 16, 10);
      ctx.fillRect(bx + 16, L.bossY - 150, 16, 10);
    }

    function drawFx(L) {
      if (!st.fx || st.fxTimer <= 0) return;
      const a = Math.min(1, st.fxTimer / 20);
      ctx.save();
      ctx.globalAlpha = a * 0.85;
      if (st.fx === 'wipe') {
        ctx.fillStyle = 'rgba(80, 0, 10, 0.45)';
        ctx.fillRect(0, 0, L.w, L.h);
        ctx.fillStyle = '#fecdd3';
        ctx.font = '700 42px Georgia, serif';
        ctx.textAlign = 'center';
        ctx.fillText('WIPE', L.w / 2, L.h * 0.46);
      } else if (st.fx === 'clear' || st.fx === 'ascend') {
        ctx.strokeStyle = st.fx === 'ascend' ? 'rgba(216, 180, 254, 0.8)' : 'rgba(253, 224, 71, 0.8)';
        ctx.lineWidth = 2;
        for (let i = 0; i < 10; i++) {
          const ang = (i / 10) * Math.PI + st.t * 0.01;
          ctx.beginPath();
          ctx.moveTo(L.w / 2, L.h * 0.4);
          ctx.lineTo(L.w / 2 + Math.cos(ang) * L.w, L.h * 0.4 + Math.sin(ang) * L.h);
          ctx.stroke();
        }
      } else {
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(0, 0, L.w, L.h);
      }
      ctx.restore();
    }

    function tick() {
      st.t++;
      if (st.poseTimer > 0 && --st.poseTimer === 0) st.pose = 'idle';
      if (st.previewTimer > 0 && --st.previewTimer === 0) st.previewGearBit = -1;
      if (st.boss && st.boss.hitTimer > 0) st.boss.hitTimer--;
      st.lunge *= 0.84;
      st.shake *= 0.82;
      st.intro *= 0.96;
      if (st.fxTimer > 0) st.fxTimer--;
      else st.fx = null;
      if (st.death > 0 && st.death < 1) st.death = Math.min(1, st.death + 0.02);
      for (let i = st.projectiles.length - 1; i >= 0; i--) {
        const p = st.projectiles[i];
        p.progress += p.speed;
        if (p.progress >= 1) {
          if (artStyle !== 'compact') {
            burst(p.x1, p.y1, p.color, 16, 3.5);
            if (p.label) addCallout(p.x1, p.y1 - 36, p.label, p.color, 1.05);
          }
          if (st.boss) st.boss.hitTimer = 10;
          st.shake = Math.max(st.shake, 7);
          if (p.label) sfx.bossHit();
          st.projectiles.splice(i, 1);
        }
      }

      if (artStyle !== 'compact') {
        const L = layout();
        ctx.save();
        if (st.shake > 0.4) ctx.translate((Math.random() - 0.5) * st.shake, (Math.random() - 0.5) * st.shake * 0.6);
        if (artStyle === 'pixel') drawPixel(L);
        else {
          drawHall(L);
          st.motes.forEach((m) => {
            m.y -= m.v;
            if (m.y < 0) { m.y = L.h; m.x = Math.random() * L.w; }
            ctx.fillStyle = `rgba(253, 186, 116, ${m.a})`;
            ctx.fillRect(m.x, m.y, m.r, m.r);
          });
          drawHero(L);
          drawBoss(L);
        }

        st.projectiles.forEach((p) => {
          const t = Math.min(1, p.progress);
          const cx = p.x0 + (p.x1 - p.x0) * t;
          const cy = p.y0 + (p.y1 - p.y0) * t - Math.sin(t * Math.PI) * 36;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(cx, cy, p.kind === 'hunter' ? 3 : 7, 0, Math.PI * 2);
          ctx.fill();
        });

        st.particles.forEach((p) => {
          p.x += p.vx;
          p.y += p.vy;
          p.vy += 0.08;
          p.life -= p.decay;
        });
        st.particles = st.particles.filter((p) => p.life > 0);
        st.particles.forEach((p) => {
          ctx.globalAlpha = Math.max(0, p.life);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.globalAlpha = 1;

        st.callouts.forEach((c) => { c.y += c.vy; c.life++; });
        st.callouts = st.callouts.filter((c) => c.life < c.max);
        st.callouts.forEach((c) => {
          const alpha = c.life > c.max - 16 ? (c.max - c.life) / 16 : 1;
          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.font = `700 ${Math.round(15 * c.scale)}px Georgia, serif`;
          ctx.textAlign = 'center';
          ctx.lineWidth = 4;
          ctx.strokeStyle = '#14080c';
          ctx.strokeText(c.text, c.x, c.y);
          ctx.fillStyle = c.color;
          ctx.fillText(c.text, c.x, c.y);
          ctx.restore();
        });
        drawFx(L);
        ctx.restore();
      }
      requestAnimationFrame(tick);
    }

    function shot(label, color, silent) {
      const L = layout();
      const id = heroId();
      const meta = META[id];
      st.pose = 'attack';
      st.poseTimer = 26;
      st.lunge = id === 'rogue' ? 70 : 36;
      if (!silent) sfx.attack(id);
      st.projectiles.push({
        x0: L.heroX + 30,
        y0: L.heroY - 110,
        x1: L.bossX - 20,
        y1: L.bossY - 170 - st.projectiles.length * 8,
        progress: 0,
        speed: id === 'hunter' || id === 'rogue' ? 0.16 : 0.09,
        color: color || meta.color,
        kind: id,
        label: label || '',
      });
    }

    function setArtStyle(style, quiet) {
      if (!['gothic', 'pixel', 'compact'].includes(style)) return;
      artStyle = style;
      prefs.set('artStyle', style);
      document.querySelectorAll('.style-btn').forEach((b) => b.classList.toggle('active', b.dataset.style === style));
      const wrap = document.getElementById('arena-canvas-wrap');
      if (wrap) wrap.classList.toggle('hidden', style === 'compact');
      document.body.classList.toggle('style-pixel', style === 'pixel');
      if (!quiet) sfx.taunt();
    }

    canvas.addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      st.mouseX = ((e.clientX - r.left) / r.width) * canvas.width;
      st.mouseY = ((e.clientY - r.top) / r.height) * canvas.height;
    });
    canvas.addEventListener('click', (e) => {
      sfx.unlock();
      const r = canvas.getBoundingClientRect();
      const cx = ((e.clientX - r.left) / r.width) * canvas.width;
      const L = layout();
      if (cx < canvas.width * 0.42) shot(META[heroId()].cries[0]);
      else {
        sfx.taunt();
        const name = st.boss ? st.boss.name : null;
        const pool = (name && LINES[name]) || ['The seal holds.', 'Three gates, and it opens.', 'Something waits in the stone.'];
        const line = pool[Math.floor(Math.random() * pool.length)];
        burst(L.bossX, L.bossY - 180, '#fb7185', 18, 3);
        addCallout(L.w * 0.5, L.h * 0.56, line, '#fecdd3', 1.05);
        st.shake = 5;
      }
    });
    document.querySelectorAll('.style-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.style === artStyle);
      btn.addEventListener('click', () => setArtStyle(btn.dataset.style));
    });
    setArtStyle(artStyle, true);
    requestAnimationFrame(tick);

    const api = {
      triggerAttack() { shot(); },
      triggerTaunt() {
        const meta = META[heroId()];
        const L = layout();
        st.pose = 'celebrate';
        st.poseTimer = 36;
        sfx.taunt();
        burst(L.heroX, L.heroY - 120, meta.accent, 18, 3.4);
        addCallout(L.heroX, L.heroY - 160, meta.cries[Math.floor(Math.random() * meta.cries.length)], '#ffe7a3', 1.05);
      },
      triggerFlex() {
        const L = layout();
        const cnt = root.Game ? root.Game.gearCount(gearMask()) : 0;
        st.pose = 'celebrate';
        st.poseTimer = 40;
        sfx.loot();
        burst(L.heroX, L.heroY - 100, '#fbbf24', 20, 3.2);
        addCallout(L.heroX, L.heroY - 160, cnt ? `Gear ${cnt}/6` : 'No gear yet', '#fde68a');
      },
      previewGear(slot) {
        st.previewGearBit = slot;
        st.previewTimer = 90;
        const g = root.Game.GEAR[slot];
        const L = layout();
        sfx.taunt();
        addCallout(L.heroX, L.heroY - 160, g ? g.name : 'Gear', '#ffe7a3');
      },
      onSpinStart() {
        st.scatterCount = 0;
        st.death = 0;
        st.pose = 'spin';
        st.poseTimer = 18;
        sfx.unlock();
      },
      onReelStop(r, col) {
        const hasB = col.includes('B');
        const hasW = col.includes('W');
        if (hasB) {
          st.scatterCount++;
          const L = layout();
          burst(L.bossX, L.bossY - 160, '#fb7185', 12, 3);
          if (st.scatterCount === 2) {
            st.pose = 'anticipate';
            st.poseTimer = 50;
            sfx.tease();
            addCallout(L.heroX, L.heroY - 150, 'One more gate.', '#fde68a', 1.1);
          }
        }
        sfx.reelStop(r, getSpeed(), hasB, hasW);
      },
      onWin(amount, winX) {
        const L = layout();
        const big = winX >= 20;
        st.pose = big ? 'celebrate' : 'attack';
        st.poseTimer = big ? 50 : 24;
        sfx.win(big);
        burst(L.w * 0.5, L.h * 0.4, big ? '#fde68a' : META[heroId()].color, big ? 28 : 12, big ? 4 : 3);
        if (big) addCallout(L.w / 2, 70, 'BIG WIN', '#fde68a', 1.3);
      },
      onLoot(items) {
        const L = layout();
        sfx.loot();
        st.pose = 'celebrate';
        st.poseTimer = 40;
        const names = items.map((it) => root.Game.GEAR[it.slot].name).join(' + ');
        burst(L.heroX, L.heroY - 120, '#fbbf24', 24, 3.6);
        addCallout(L.heroX, L.heroY - 170, names, '#fde68a', 1.05);
      },
      setBoss(boss, hp, maxHp) {
        if (!boss) {
          st.boss = null;
          sfx.scene({ raid: false, danger: 0 });
          return;
        }
        st.boss = { name: boss.name, hp, maxHp, reward: boss.reward, hitTimer: st.boss && st.boss.name === boss.name ? st.boss.hitTimer : 0 };
        const ratio = maxHp ? hp / maxHp : 1;
        sfx.scene({ raid: true, danger: 1 - ratio });
      },
      enterRaid(boss) {
        st.intro = 1;
        st.death = 0;
        st.fx = null;
        if (boss) st.boss = { name: boss.name, hp: boss.hp, maxHp: boss.hp, reward: boss.reward, hitTimer: 0 };
      },
      onStepHits(step) {
        if (!step.hits.length) return;
        const id = heroId();
        sfx.attack(id);
        step.hits.forEach((h, i) => {
          const tag = h.crit ? `CRIT ${h.dmg}` : h.marked ? `MARK ${h.dmg}` : String(h.dmg);
          const color = h.crit ? '#fde047' : h.marked ? '#4ade80' : step.charged ? '#d8b4fe' : META[id].color;
          shot(i === step.hits.length - 1 ? tag : '', color, true);
        });
      },
      onBossKilled(name) {
        sfx.bossKill();
        const L = layout();
        burst(L.bossX, L.bossY - 160, '#fb7185', 36, 5);
        burst(L.bossX, L.bossY - 160, '#fde68a', 20, 3.5);
        st.shake = 16;
        addCallout(L.w / 2, L.h * 0.42, `${name} falls`, '#fde68a', 1.25);
      },
      onClear() {
        st.fx = 'clear';
        st.fxTimer = 90;
        st.death = 0.02;
        sfx.raidClear();
      },
      onWipe() {
        st.fx = 'wipe';
        st.fxTimer = 80;
        st.shake = 14;
        sfx.wipe();
      },
      celebrate(kind) {
        st.fx = kind;
        st.fxTimer = kind === 'epic' ? 110 : 70;
        if (kind === 'epic' || kind === 'huge') st.shake = 10;
      },
    };
    root.RaidArena = api;
    return api;
  }

  root.RaidStage = { create };
})(typeof window !== 'undefined' ? window : globalThis);
