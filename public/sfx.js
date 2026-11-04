// Original Web Audio score. No sample files. A quiet pad sits under play and
// thickens during a raid; low boss HP speeds a slow heartbeat. Stingers bloom
// instead of clicking. Super Turbo keeps only the short cues.
//
// Mute is saved per browser. The first call resumes the audio context, which
// browsers allow after a click or key press.
(function (root) {
  'use strict';

  function create(opts) {
    const prefs = opts.prefs;
    const getSpeed = opts.getSpeed || (() => 'normal');
    let ctx = null;
    let master = null;
    let noise = null;
    let muted = prefs.get('muted', false);
    let bedOn = false;
    let raid = false;
    let danger = 0;
    let heartTimer = null;

    function ensure() {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      if (!ctx) {
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = muted ? 0 : 0.85;
        master.connect(ctx.destination);
        const n = ctx.sampleRate * 2;
        noise = ctx.createBuffer(1, n, ctx.sampleRate);
        const data = noise.getChannelData(0);
        for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
      }
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return ctx;
    }

    function tone(freq, dur, type, vol, slideTo, delay, attack) {
      const c = ensure();
      if (!c || muted) return;
      try {
        const t0 = c.currentTime + (delay || 0);
        const osc = c.createOscillator();
        const g = c.createGain();
        const a = attack == null ? Math.min(0.03, dur * 0.25) : attack;
        osc.type = type || 'sine';
        osc.frequency.setValueAtTime(Math.max(20, freq), t0);
        if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.linearRampToValueAtTime(vol, t0 + Math.min(a, dur * 0.8));
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        osc.connect(g);
        g.connect(master);
        osc.start(t0);
        osc.stop(t0 + dur + 0.02);
      } catch { /* ignore audio errors */ }
    }

    function noiseBurst(freq, q, dur, vol, delay) {
      const c = ensure();
      if (!c || muted || !noise) return;
      const t0 = c.currentTime + (delay || 0);
      const src = c.createBufferSource();
      src.buffer = noise;
      const f = c.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.setValueAtTime(freq, t0);
      f.Q.value = q;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(vol, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(f);
      f.connect(g);
      g.connect(master);
      src.start(t0);
      src.stop(t0 + dur + 0.02);
    }

    function startBed() {
      const c = ensure();
      if (!c || bedOn || muted) return;
      bedOn = true;
      const mk = (freq, type, vol) => {
        const osc = c.createOscillator();
        const g = c.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        g.gain.value = vol;
        osc.connect(g);
        g.connect(master);
        osc.start();
        return { osc, g };
      };
      const a = mk(55, 'sine', 0.018);
      const b = mk(82.4, 'triangle', 0.01);
      b.osc.detune.value = 7;
      const air = mk(220, 'sine', 0.004);
      const lfo = c.createOscillator();
      const lfoG = c.createGain();
      lfo.frequency.value = 0.07;
      lfoG.gain.value = 0.008;
      lfo.connect(lfoG);
      lfoG.connect(a.g.gain);
      lfo.start();
      startBed.nodes = { a, b, air };
    }

    function applyBed() {
      const nodes = startBed.nodes;
      if (!ctx || !nodes) return;
      const t = ctx.currentTime;
      const low = raid ? 0.03 + danger * 0.02 : 0.016;
      const mid = raid ? 0.014 : 0.008;
      nodes.a.g.gain.cancelScheduledValues(t);
      nodes.b.g.gain.cancelScheduledValues(t);
      nodes.a.g.gain.linearRampToValueAtTime(low, t + 2.2);
      nodes.b.g.gain.linearRampToValueAtTime(mid, t + 2.2);
      nodes.a.osc.frequency.linearRampToValueAtTime(raid ? 46 - danger * 6 : 55, t + 2.2);
    }

    function thump() {
      tone(48, 0.18, 'sine', 0.05 + danger * 0.03, 32, 0, 0.01);
      noiseBurst(90, 0.7, 0.08, 0.03);
    }

    function scheduleHeart() {
      if (!raid || muted) {
        if (heartTimer) clearTimeout(heartTimer);
        heartTimer = null;
        return;
      }
      if (heartTimer) return;
      heartTimer = setTimeout(() => {
        heartTimer = null;
        if (!muted && raid) thump();
        scheduleHeart();
      }, 1500 - danger * 900);
    }

    function short() {
      return getSpeed() === 'super';
    }

    function paintButton() {
      const btn = document.getElementById('sound-toggle');
      if (!btn) return;
      btn.textContent = muted ? '🔇 Muted' : '🔊 Sound';
      btn.classList.toggle('muted', muted);
      btn.setAttribute('aria-pressed', muted ? 'true' : 'false');
    }

    return {
      isMuted: () => muted,
      setMuted(m) {
        muted = !!m;
        prefs.set('muted', muted);
        if (master) master.gain.value = muted ? 0 : 0.85;
        if (muted && heartTimer) { clearTimeout(heartTimer); heartTimer = null; }
        else if (!muted && raid) scheduleHeart();
        paintButton();
      },
      unlock() {
        if (muted) return;
        startBed();
        applyBed();
      },
      scene(next) {
        raid = !!next.raid;
        danger = Math.max(0, Math.min(1, next.danger || 0));
        if (!muted) {
          startBed();
          applyBed();
          scheduleHeart();
        }
      },
      spin(spd) {
        startBed();
        if (spd === 'super') return;
        noiseBurst(240, 0.6, spd === 'turbo' ? 0.08 : 0.22, 0.04);
        tone(140, 0.18, 'triangle', 0.03, 220, 0, 0.04);
      },
      reelStop(r, spd, hasScatter, hasWild) {
        if (spd === 'super') return;
        if (hasScatter) {
          tone(520 + r * 70, 0.22, 'sine', 0.06, 780, 0, 0.02);
          tone(780 + r * 40, 0.3, 'triangle', 0.03, null, 0.06, 0.04);
        } else if (hasWild) {
          tone(320 + r * 36, 0.14, 'triangle', 0.05, 480);
        } else {
          noiseBurst(180 + r * 30, 1.2, 0.06, 0.04);
        }
      },
      tease() {
        if (short()) return;
        tone(196, 0.5, 'sawtooth', 0.02, 320, 0, 0.12);
        tone(392, 0.6, 'sine', 0.03, 523, 0.08, 0.2);
      },
      win(big) {
        if (big) this.winTier('big');
        else {
          tone(392, 0.12, 'triangle', 0.045, null, 0, 0.02);
          tone(494, 0.16, 'triangle', 0.04, null, 0.07, 0.02);
        }
      },
      winTier(tier) {
        if (tier === 'epic') {
          [65.4, 98, 130.8, 196, 261.6, 392].forEach((f, i) => tone(f, 2.6, i < 2 ? 'sine' : 'triangle', 0.045, null, i * 0.16, 0.5));
          noiseBurst(600, 0.4, 1.2, 0.03, 0.2);
        } else if (tier === 'huge') {
          [98, 146.8, 196, 293.7].forEach((f, i) => tone(f, 1.5, 'triangle', 0.05, null, i * 0.12, 0.28));
        } else {
          [261.6, 329.6, 392, 523.3].forEach((f, i) => tone(f, 0.7, 'triangle', 0.05, null, i * 0.08, 0.06));
        }
      },
      loot() {
        tone(523, 0.12, 'sine', 0.045, 784, 0, 0.02);
        tone(784, 0.22, 'triangle', 0.04, 1046, 0.1, 0.05);
      },
      attack(kind) {
        if (kind === 'mage' || kind === 'priest') {
          tone(kind === 'priest' ? 520 : 360, 0.16, 'sine', 0.04, kind === 'priest' ? 880 : 640, 0, 0.03);
        } else if (kind === 'hunter') {
          noiseBurst(900, 2, 0.07, 0.04);
          tone(660, 0.08, 'triangle', 0.03, 220);
        } else if (kind === 'rogue') {
          noiseBurst(1400, 1.4, 0.05, 0.045);
          tone(240, 0.06, 'square', 0.02, 120);
        } else {
          noiseBurst(180, 0.8, 0.09, 0.05);
          tone(140, 0.1, 'sawtooth', 0.03, 70);
        }
      },
      bossHit() {
        noiseBurst(120, 0.5, 0.12, 0.05);
        tone(90, 0.14, 'sine', 0.04, 50);
      },
      bossKill() {
        [110, 82, 55].forEach((f, i) => tone(f, 0.4, 'sawtooth', 0.04, 40, i * 0.08, 0.04));
        [392, 494, 587].forEach((f, i) => tone(f, 0.5, 'triangle', 0.04, null, 0.28 + i * 0.1, 0.08));
      },
      gamble(won) {
        if (won) {
          tone(349, 0.16, 'triangle', 0.05, 523, 0, 0.04);
          tone(523, 0.4, 'sine', 0.045, 784, 0.12, 0.12);
        } else {
          tone(196, 0.5, 'sawtooth', 0.04, 70, 0, 0.05);
          noiseBurst(200, 0.4, 0.4, 0.04, 0.05);
        }
      },
      taunt() {
        tone(220, 0.18, 'triangle', 0.035, 330, 0, 0.04);
        tone(330, 0.22, 'sine', 0.03, 247, 0.1, 0.06);
      },
      ascend() {
        [196, 247, 311, 392, 494].forEach((f, i) => tone(f, 1.4, 'sine', 0.04, null, i * 0.18, 0.25));
      },
      raidIntro() {
        if (short()) {
          tone(82, 0.2, 'sine', 0.04, 55);
          return;
        }
        tone(55, 1.6, 'sine', 0.05, 82, 0, 0.4);
        tone(110, 1.6, 'triangle', 0.03, 164, 0.25, 0.5);
        noiseBurst(300, 0.35, 1.1, 0.025, 0.15);
      },
      raidClear() {
        [196, 247, 294, 392, 494].forEach((f, i) => tone(f, 1.8, 'triangle', 0.045, null, i * 0.12, 0.2));
      },
      wipe() {
        tone(146, 1.1, 'sawtooth', 0.04, 55, 0, 0.08);
        tone(98, 1.3, 'sine', 0.05, 40, 0.1, 0.2);
        noiseBurst(100, 0.4, 0.8, 0.04);
      },
      maxWin() {
        this.winTier('epic');
        tone(880, 1.2, 'sine', 0.03, 1760, 0.4, 0.3);
      },
    };
  }

  root.RaidSfx = { create };
})(typeof window !== 'undefined' ? window : globalThis);
