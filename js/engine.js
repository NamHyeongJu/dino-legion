'use strict';
// Asset loading, creature sheet renderer (Dino Nest frames) and synthesized sound.

const Engine = (() => {
  // ---------- images ----------
  const images = {};

  // Retries with backoff: a fresh deploy or a flaky mobile link can drop a few requests.
  function loadImage(src) {
    if (images[src]) return images[src].promise;
    const el = new Image();
    let tries = 0;
    const promise = new Promise((resolve) => {
      el.onload = () => resolve(el);
      el.onerror = () => {
        tries++;
        if (tries > 4 || src.startsWith('data:')) { console.warn('image failed', src); resolve(null); return; }
        setTimeout(() => { el.src = src + (src.includes('?') ? '&' : '?') + 'retry=' + tries; }, 400 * tries * tries);
      };
    });
    el.src = src;
    images[src] = { el, promise };
    return promise;
  }

  // Loads many images a few at a time instead of all at once.
  async function loadAll(list, onEach) {
    let next = 0;
    const worker = async () => {
      while (next < list.length) {
        const src = list[next++];
        await loadImage(src);
        if (onEach) onEach(src);
      }
    };
    await Promise.all(Array.from({ length: 10 }, worker));
  }

  function img(src) {
    const e = images[src];
    return e && e.el.complete && e.el.naturalWidth ? e.el : null;
  }

  // Downscale in halving steps so small sprites stay crisp.
  function scaledCanvas(source, s) {
    let src = source;
    let w = source.naturalWidth || source.width;
    let h = source.naturalHeight || source.height;
    const tw = Math.max(1, Math.round(w * s));
    const th = Math.max(1, Math.round(h * s));
    while (w / 2 > tw && h / 2 > th) {
      const c = document.createElement('canvas');
      c.width = Math.round(w / 2); c.height = Math.round(h / 2);
      const g = c.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(src, 0, 0, c.width, c.height);
      src = c; w = c.width; h = c.height;
    }
    const c = document.createElement('canvas');
    c.width = tw; c.height = th;
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(src, 0, 0, tw, th);
    return c;
  }

  // ---------- creature sheets ----------
  // Frame strips sliced from Dino Nest's creature sheets (js/sheets.js). Each strip is recoloured
  // once: hue rotation for bred colours, grayscale with red eyes for wild dinosaurs, white for hit flashes.
  function hueMatrix(deg) {
    const a = deg * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a);
    return [
      0.213 + cs * 0.787 - sn * 0.213, 0.715 - cs * 0.715 - sn * 0.715, 0.072 - cs * 0.072 + sn * 0.928,
      0.213 - cs * 0.213 + sn * 0.143, 0.715 + cs * 0.285 + sn * 0.140, 0.072 - cs * 0.072 - sn * 0.283,
      0.213 - cs * 0.213 - sn * 0.787, 0.715 - cs * 0.715 + sn * 0.715, 0.072 + cs * 0.928 + sn * 0.072,
    ];
  }
  const goldenEye = (r, g, b) => r > 150 && g > 100 && g < 240 && b < g * 0.55 && r > g * 0.95;

  let pixelsOk = true;
  function recolor(base, sheet, mode, hue) {
    const c = document.createElement('canvas');
    c.width = base.naturalWidth || base.width; c.height = base.naturalHeight || base.height;
    const g = c.getContext('2d');
    g.drawImage(base, 0, 0);
    if (mode === 'normal' && !hue) return c;
    if (pixelsOk) {
      try {
        const id = g.getImageData(0, 0, c.width, c.height);
        const p = id.data;
        if (mode === 'white') {
          for (let i = 0; i < p.length; i += 4) if (p[i + 3]) { p[i] = p[i + 1] = p[i + 2] = 255; }
        } else if (mode === 'enemy') {
          // Same as DinoArt.EnemyVariant: luma grayscale, the detected eye repainted red.
          const eye = new Uint8Array(c.width * c.height);
          for (const f of sheet.fr) {
            if (!f || f[5] == null) continue;
            const k = f[1] / f[3];
            const cx = f[0] + (f[3] / 2 + f[5]) * k, cy = (f[4] + f[6]) * k, r = f[7] * k + 2.5;
            for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(c.height - 1, Math.ceil(cy + r)); y++) {
              for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(c.width - 1, Math.ceil(cx + r)); x++) {
                const i = (y * c.width + x) * 4;
                if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r && p[i + 3] > 120 && goldenEye(p[i], p[i + 1], p[i + 2])) eye[y * c.width + x] = 1;
              }
            }
          }
          for (let i = 0, j = 0; i < p.length; i += 4, j++) {
            if (!p[i + 3]) continue;
            if (eye[j]) { p[i] = 255; p[i + 1] = 20; p[i + 2] = 10; continue; }
            const v = p[i] * 0.299 + p[i + 1] * 0.587 + p[i + 2] * 0.114;
            p[i] = p[i + 1] = p[i + 2] = v;
          }
        } else {
          const m = hueMatrix(hue);
          for (let i = 0; i < p.length; i += 4) {
            if (!p[i + 3]) continue;
            const r = p[i], gg = p[i + 1], b = p[i + 2];
            p[i] = m[0] * r + m[1] * gg + m[2] * b;
            p[i + 1] = m[3] * r + m[4] * gg + m[5] * b;
            p[i + 2] = m[6] * r + m[7] * gg + m[8] * b;
          }
        }
        g.putImageData(id, 0, 0);
        return c;
      } catch (e) { pixelsOk = false; } // file:// taints the canvas; fall back to CSS filters
    }
    g.clearRect(0, 0, c.width, c.height);
    g.filter = mode === 'white' ? 'brightness(0) invert(1)' : mode === 'enemy' ? 'grayscale(1)' : `hue-rotate(${hue}deg)`;
    g.drawImage(base, 0, 0);
    g.filter = 'none';
    return c;
  }

  const varCache = new Map();
  function variant(name, mode, hue) {
    const key = name + '|' + mode + '|' + (hue || 0);
    let c = varCache.get(key);
    if (c) return c;
    const sh = SHEETS[name];
    const base = sh && img(sh.f);
    if (!base) return null;
    c = recolor(base, sh, mode, hue || 0);
    varCache.set(key, c);
    return c;
  }

  const MOTION = { walk: 'Walk', attack: 'Attack', death: 'Death' };
  const sheetKey = (look) => (look.raid ? 'DeathRex' : SPECIES[look.sp].key);

  // walk: 4.5 fps cycle while moving (frame 0 when standing); attack: t is progress 0-1; death: 4 fps, holds the last frame.
  function frameOf(look, motion, pose) {
    const name = sheetKey(look) + MOTION[motion];
    const sh = SHEETS[name];
    let i;
    if (motion === 'death') i = Math.min(5, Math.floor(Math.max(0, pose.t) * 4));
    else if (motion === 'attack') i = Math.max(0, Math.min(5, Math.floor(pose.t * 6)));
    else i = pose.moving ? Math.floor(Math.max(0, pose.t) * 4.5 * (pose.pace || 1)) % 6 : 0;
    return { name, f: sh.fr[i] || sh.fr.find(Boolean) };
  }

  // Walk frame 0 size in sheet px: the reference box for layout, hit ranges and health bars.
  function dims(look) {
    const f = SHEETS[sheetKey(look) + 'Walk'].fr[0];
    return { w: f[3], h: f[4], ex: f[5] != null ? f[5] : f[3] * 0.4, ey: f[6] != null ? f[6] : -f[4] * 0.75 };
  }

  // Burning eye of wild dinosaurs (red) and of the raid rex (violet), after Battle.Rigs.cs.
  function eyeGlow(g, x, y, r, violet, time, seed) {
    const pulse = 1 + 0.14 * Math.sin(time * 19 + seed);
    const R = r * pulse;
    g.save();
    g.globalCompositeOperation = 'lighter';
    const col = violet ? '185,92,255' : '255,20,0';
    const gl = g.createRadialGradient(x, y, 0, x, y, R * 2.2);
    gl.addColorStop(0, `rgba(${col},.75)`); gl.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = gl; g.beginPath(); g.arc(x, y, R * 2.2, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 3; i++) {
      const fl = 0.7 + 0.3 * Math.sin(time * (13 + i * 3) + seed + i);
      const fx = x + Math.sin(time * 9 + i * 2 + seed) * R * 0.3;
      g.fillStyle = violet ? `rgba(${i === 2 ? '230,170,255' : '170,70,255'},${0.7 - i * 0.12})` : `rgba(255,${i === 2 ? 165 : 10},${i === 2 ? 50 : 0},${0.7 - i * 0.12})`;
      g.beginPath();
      g.ellipse(fx, y - R * (0.6 + fl * 0.5 + i * 0.25), R * (0.3 + i * 0.08), R * (0.55 + fl * 0.5 + i * 0.2), (-12 + i * 12) * Math.PI / 180, 0, Math.PI * 2);
      g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = violet ? '#f3e0ff' : '#ffd9a6';
    g.beginPath(); g.ellipse(x, y, R * 0.42, R * 0.34, 0, 0, Math.PI * 2); g.fill();
    g.restore();
  }

  // look: { sp, hue, enemy, raid }. s: world px per sheet px.
  // pose: { motion, t, moving, pace, tilt, lunge, lift, squash, time, seed }. flash: 0-1 white overlay.
  function drawDino(g, look, x, y, s, flip, pose, flash) {
    const motion = pose.motion || 'walk';
    const { name, f } = frameOf(look, motion, pose);
    const c = variant(name, look.enemy ? 'enemy' : 'normal', look.enemy ? 0 : look.hue);
    if (!c || !f) return;
    const [sx, sw, sh, w, h, ex, ey] = f;
    const yy = y - (pose.lift || 0);
    const sq = pose.squash || 1;
    g.save();
    g.translate(x, yy);
    g.scale(flip ? -s : s, s * sq);
    if (pose.tilt) g.rotate(pose.tilt);
    if (pose.lunge) g.translate(pose.lunge, 0);
    g.drawImage(c, sx, 0, sw, sh, -w / 2, -h, w, h);
    if (flash) {
      const wc = variant(name, 'white', 0);
      if (wc) { g.globalAlpha *= flash; g.drawImage(wc, sx, 0, sw, sh, -w / 2, -h, w, h); }
    }
    g.restore();
    if ((look.enemy || look.raid) && ex != null && motion !== 'death' && !pose.tilt) {
      const ox = (ex + (pose.lunge || 0)) * s * (flip ? -1 : 1);
      eyeGlow(g, x + ox, yy + ey * s * sq, Math.max(1.6, h * s * 0.035) * (look.raid ? 1.6 : 1), look.raid, pose.time || 0, pose.seed || 0);
    }
  }

  // Fit a dinosaur into a canvas element (UI cards).
  function portrait(canvas, look, opts = {}) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = canvas.clientWidth || 60, H = canvas.clientHeight || 40;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    if (!look) return;
    const d = dims(look);
    const pad = opts.pad != null ? opts.pad : 0.06;
    const s = Math.min(W * (1 - pad * 2) / d.w, H * (1 - pad * 2) / d.h);
    drawDino(g, look, W / 2, H / 2 + d.h * s / 2, s, !!opts.flip, opts.pose || { motion: 'walk', t: 0 }, 0);
  }

  // Recolour ahead of time so the first wave does not hitch.
  function prewarm() {
    for (const sp of SPECIES) {
      variant(sp.key + 'Walk', 'normal', 0);
      variant(sp.key + 'Walk', 'enemy', 0);
      variant(sp.key + 'Attack', 'enemy', 0);
    }
  }

  const sheetUrls = () => Object.values(SHEETS).map((s) => s.f);

  // ---------- sound ----------
  // Port of Dino Nest's Sfx.cs synthesizer (tones and filtered noise rendered into buffers).
  const SR = 44100;
  function tone(d, f, dur, wave, vol, f2 = 0, delay = 0) {
    const s0 = Math.floor(delay * SR), n = Math.floor(dur * SR);
    let ph = 0;
    for (let i = 0; i < n && s0 + i < d.length; i++) {
      const t = i / SR;
      const fr = f2 > 0 ? f * Math.pow(f2 / f, t / dur) : f;
      ph += fr / SR;
      const p = ph - Math.floor(ph);
      const w = wave === 's' ? Math.sin(p * Math.PI * 2) : wave === 't' ? 1 - 4 * Math.abs(p - 0.5) : wave === 'q' ? (p < 0.5 ? 1 : -1) : 2 * p - 1;
      const env = t < 0.01 ? vol * t / 0.01 : vol * Math.pow(0.0001 / vol, (t - 0.01) / Math.max(0.001, dur - 0.01));
      d[s0 + i] += w * env;
    }
  }
  function noise(d, dur, vol, freq, delay = 0) {
    const s0 = Math.floor(delay * SR), n = Math.floor(dur * SR);
    const a = 1 - Math.exp(-2 * Math.PI * freq / SR);
    let y = 0;
    for (let i = 0; i < n && s0 + i < d.length; i++) {
      const x = (Math.random() * 2 - 1) * (1 - i / n);
      y += a * (x - y);
      d[s0 + i] += y * vol * 2.2;
    }
  }
  const SOUNDS = {
    click: [0.05, (d) => tone(d, 880, 0.04, 's', 0.025, 660)],
    open: [0.1, (d) => tone(d, 440, 0.09, 's', 0.035, 700)],
    close: [0.1, (d) => tone(d, 700, 0.09, 's', 0.03, 420)],
    drop: [0.08, (d) => tone(d, 520, 0.07, 's', 0.04, 760)],
    deny: [0.16, (d) => tone(d, 220, 0.14, 'q', 0.03, 150)],
    hit: [0.07, (d) => noise(d, 0.06, 0.045, 1700)],
    crit: [0.14, (d) => { noise(d, 0.06, 0.12, 900); tone(d, 150, 0.12, 'q', 0.035, 70); }],
    bite: [0.12, (d) => { noise(d, 0.05, 0.09, 2600); tone(d, 260, 0.08, 'w', 0.03, 120, 0.02); }],
    level: [0.1, (d) => tone(d, 620, 0.09, 'q', 0.03, 930)],
    buy: [0.3, (d) => { [784, 988, 1319].forEach((f, i) => tone(d, f, 0.13, 's', 0.06, 0, i * 0.06)); }],
    clear: [0.6, (d) => { [523, 659, 784, 1047].forEach((f, i) => tone(d, f, 0.26, 't', 0.08, 0, i * 0.1)); }],
    fail: [0.46, (d) => tone(d, 300, 0.45, 'w', 0.04, 110)],
    stomp: [0.3, (d) => noise(d, 0.28, 0.16, 260)],
    roar: [0.8, (d) => { noise(d, 0.75, 0.13, 520); tone(d, 118, 0.7, 'w', 0.05, 66); tone(d, 176, 0.5, 'q', 0.018, 92, 0.05); }],
    fire: [0.24, (d) => { noise(d, 0.22, 0.07, 1300); tone(d, 260, 0.18, 's', 0.03, 120); }],
    boom: [0.6, (d) => { noise(d, 0.55, 0.22, 200); tone(d, 72, 0.5, 's', 0.09, 38); }],
    zap: [0.18, (d) => { noise(d, 0.15, 0.08, 3200); tone(d, 900, 0.15, 'q', 0.02, 300); }],
    heal: [0.4, (d) => { [660, 880, 1175].forEach((f, i) => tone(d, f, 0.2, 's', 0.04, f * 1.1, i * 0.07)); }],
    coin: [0.07, (d) => tone(d, 1150, 0.06, 's', 0.02, 1550)],
    merge0: [0.2, (d) => mergeFill(d, 0)],
    reveal: [0.7, (d) => { noise(d, 0.12, 0.05, 4000); [784, 988, 1175, 1568].forEach((f, i) => tone(d, f, 0.3, 't', 0.06, 0, i * 0.07)); }],
  };
  function mergeFill(d, t) {
    const f = 300 * Math.pow(1.07, t * 2);
    tone(d, f, 0.13, 't', 0.13, f * 1.7);
    tone(d, f * 2, 0.09, 's', 0.05, 0, 0.05);
  }
  function hatchFill(d, notes) {
    noise(d, 0.18, 0.12, 2400);
    const fs = [523, 659, 784, 1047, 1319];
    for (let i = 0; i < notes; i++) tone(d, fs[i], 0.24, 't', 0.08, 0, 0.12 + i * 0.08);
  }

  const Sfx = {
    on: true, ctx: null, master: null, bufs: {}, last: {}, active: 0,
    unlock() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
    },
    buffer(name) {
      let b = this.bufs[name];
      if (b) return b;
      let len, fill;
      if (SOUNDS[name]) [len, fill] = SOUNDS[name];
      else if (name.startsWith('merge')) { const t = +name.slice(5); len = 0.2; fill = (d) => mergeFill(d, t); }
      else if (name.startsWith('hatch')) { const n = +name.slice(5); len = 0.8; fill = (d) => hatchFill(d, n); }
      else return null;
      const d = new Float32Array(Math.floor(SR * len));
      fill(d);
      for (let i = 0; i < d.length; i++) d[i] = Math.max(-1, Math.min(1, d[i] * 1.6));
      b = this.ctx.createBuffer(1, d.length, SR);
      b.getChannelData(0).set(d);
      this.bufs[name] = b;
      return b;
    },
    play(name, vol = 1, rate = 1, gap = 55) {
      if (!this.on || !this.ctx) return;
      const now = performance.now();
      if (now - (this.last[name] || 0) < gap) return;
      this.last[name] = now;
      if (this.active > 16) return;
      const buf = this.buffer(name);
      if (!buf) return;
      const s = this.ctx.createBufferSource();
      s.buffer = buf;
      s.playbackRate.value = rate;
      const gn = this.ctx.createGain();
      gn.gain.value = vol;
      s.connect(gn); gn.connect(this.master);
      this.active++;
      s.onended = () => { this.active--; };
      s.start();
    },
  };

  return { loadImage, loadAll, img, scaledCanvas, drawDino, portrait, dims, frameOf, eyeGlow, prewarm, sheetUrls, Sfx };
})();
