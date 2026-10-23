'use strict';
// Parallax chapter backdrops painted at runtime, after Dino Nest's Art.Background.

const Backdrop = (() => {
  const T = 640;      // tile width (virtual px)
  const HB = 210;     // far/mid layer height; their bottom edge sits on the ground line
  const GH = 190;     // ground tile height below the ground line
  const RES = 2;      // canvas px per virtual px
  const cache = {};

  function seeded(seed) {
    let s = (seed >>> 0) || 1;
    return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  }

  function layer(h) {
    const c = document.createElement('canvas');
    c.width = T * RES; c.height = h * RES;
    const g = c.getContext('2d');
    g.scale(RES, RES);
    return { c, g };
  }

  // Draw at x and its wrapped copy so the tile repeats seamlessly.
  function wrap(x, margin, fn) {
    fn(x);
    if (x < margin) fn(x + T);
    if (x > T - margin) fn(x - T);
  }

  function ridge(g, color, baseY, amp, rnd, freqs) {
    const ph = freqs.map(() => rnd() * 6.283);
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(0, HB);
    for (let x = 0; x <= T; x += 6) {
      const t = x / T * 6.283;
      let y = 0;
      freqs.forEach((f, i) => { y += Math.sin(t * f + ph[i]) / (i + 1); });
      g.lineTo(x, baseY - amp * (0.6 + 0.5 * y));
    }
    g.lineTo(T, HB);
    g.closePath();
    g.fill();
  }

  function build(ci) {
    if (cache[ci]) return cache[ci];
    const c = ci < 0 ? RAID_CHAPTER : CHAPTERS[ci];
    const G = HB; // ground line inside far/mid layers

    // far hills
    const far = layer(HB);
    const r1 = seeded(ci * 101 + 7);
    ridge(far.g, c.far2, G - 86, 40, r1, [2, 5, 9]);
    if (c.volcano) {
      wrap(430, 120, (x) => {
        const g = far.g;
        g.fillStyle = '#2a1a1b';
        g.beginPath(); g.moveTo(x - 110, G - 14); g.lineTo(x - 22, G - 144); g.lineTo(x + 22, G - 144); g.lineTo(x + 110, G - 14); g.fill();
        const gr = g.createRadialGradient(x, G - 144, 0, x, G - 144, 64);
        gr.addColorStop(0, 'rgba(255,115,51,.55)'); gr.addColorStop(1, 'rgba(255,115,51,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(x, G - 144, 64, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#ff7a2e'; g.lineWidth = 3; g.lineCap = 'round';
        g.beginPath(); g.moveTo(x - 8, G - 140); g.quadraticCurveTo(x - 20, G - 94, x - 40, G - 54); g.stroke();
      });
    }
    ridge(far.g, c.far, G - 54, 30, r1, [3, 7, 11]);

    // mid trees, palms and ferns
    const mid = layer(HB);
    const r2 = seeded(ci * 57 + 3);
    for (let i = 0; i < 8; i++) {
      const x = r2() * T, h = 70 + r2() * 70;
      const palm = r2() < 0.5;
      const blobs = [];
      for (let j = 0; j < 5; j++) blobs.push([(r2() - 0.5) * 44, (r2() - 0.5) * 26, 15 + r2() * 13]);
      wrap(x, 70, (xx) => {
        const g = mid.g, top = G - 6 - h;
        g.fillStyle = c.mid2;
        g.fillRect(xx - 3, top, 6, h + 6);
        if (palm) {
          g.strokeStyle = c.mid; g.lineWidth = 6; g.lineCap = 'round';
          for (let j = 0; j < 6; j++) {
            const a = -Math.PI / 2 + (j - 2.5) * 0.5;
            g.beginPath(); g.moveTo(xx, top);
            g.quadraticCurveTo(xx + Math.cos(a) * 32, top + Math.sin(a) * 30 - 12, xx + Math.cos(a) * 52, top + Math.sin(a) * 16 + 16);
            g.stroke();
          }
        } else {
          g.fillStyle = c.mid;
          for (const b of blobs) { g.beginPath(); g.arc(xx + b[0], top + b[1], b[2], 0, Math.PI * 2); g.fill(); }
        }
      });
    }
    for (let i = 0; i < 16; i++) {
      const x = r2() * T, s = 14 + r2() * 16;
      wrap(x, 40, (xx) => {
        const g = mid.g;
        g.strokeStyle = c.mid2; g.lineWidth = 3; g.lineCap = 'round';
        for (let j = 0; j < 7; j++) {
          const a = -Math.PI / 2 + (j - 3) * 0.38;
          g.beginPath(); g.moveTo(xx, G - 4);
          g.quadraticCurveTo(xx + Math.cos(a) * s * 0.6, G - 4 + Math.sin(a) * s, xx + Math.cos(a) * s * 1.2, G - 4 + Math.sin(a) * s * 0.6);
          g.stroke();
        }
      });
    }

    // ground: dirt, furrows, grass lip, pebbles and old bones
    const gr = layer(GH);
    const r3 = seeded(ci * 31 + 11);
    {
      const g = gr.g;
      const grad = g.createLinearGradient(0, 0, 0, GH);
      grad.addColorStop(0, c.dirt[0]); grad.addColorStop(1, c.dirt[1]);
      g.fillStyle = grad; g.fillRect(0, 0, T, GH);
      g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 1.5;
      for (let i = 0; i < 6; i++) {
        const y = 30 + i * 22;
        g.beginPath();
        for (let x = 0; x <= T; x += 8) {
          const yy = y + Math.sin(x / T * 6.283 * (3 + i)) * 3;
          if (x) g.lineTo(x, yy); else g.moveTo(x, yy);
        }
        g.stroke();
      }
      g.fillStyle = 'rgba(0,0,0,.2)';
      for (let i = 0; i < 40; i++) {
        const x = r3() * T, y = 14 + r3() * (GH - 20), rr = 2 + r3() * 4;
        wrap(x, 10, (xx) => { g.beginPath(); g.ellipse(xx, y, rr * 1.3, rr, 0, 0, Math.PI * 2); g.fill(); });
      }
      for (let i = 0; i < 6; i++) {
        const x = r3() * T, y = 30 + r3() * (GH - 50), a = r3() * 1.2 - 0.6;
        wrap(x, 20, (xx) => {
          g.save(); g.translate(xx, y); g.rotate(a);
          g.strokeStyle = g.fillStyle = 'rgba(240,226,196,.35)'; g.lineWidth = 2.4; g.lineCap = 'round';
          g.beginPath(); g.moveTo(-9, 0); g.lineTo(9, 0); g.stroke();
          for (const [bx, by] of [[-10, -2], [-10, 2], [10, -2], [10, 2]]) { g.beginPath(); g.arc(bx, by, 2.2, 0, Math.PI * 2); g.fill(); }
          g.restore();
        });
      }
      g.fillStyle = c.grass;
      g.fillRect(0, 0, T, 8);
      g.beginPath();
      for (let x = 0; x < T; x += 6) { g.moveTo(x, 1); g.lineTo(x + 3, -5 - r3() * 5); g.lineTo(x + 6, 1); }
      g.fill();
    }

    return (cache[ci] = { far: far.c, mid: mid.c, ground: gr.c, c });
  }

  function hash(n) {
    n = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
    n ^= n >>> 13; n = Math.imul(n, 0xc2b2ae35); n ^= n >>> 16;
    return (n >>> 0) / 4294967296;
  }

  function tile(g, canvas, par, camX, y, h, VW) {
    const off = ((camX * par) % T + T) % T;
    for (let x = -off; x < VW; x += T) g.drawImage(canvas, x, y, T, h);
  }

  // groundY: virtual y of the ground line.
  function draw(g, ci, camX, time, VW, VH, groundY) {
    const bd = build(ci), c = bd.c;
    const sky = g.createLinearGradient(0, 0, 0, groundY);
    sky.addColorStop(0, c.sky[0]); sky.addColorStop(1, c.sky[1]);
    g.fillStyle = sky; g.fillRect(0, 0, VW, groundY + 2);
    if (c.sun || c.moon) {
      const x = VW * 0.78, y = Math.max(28, groundY * 0.22);
      const col = c.moon ? '#f1f4ff' : c.sun;
      const glow = g.createRadialGradient(x, y, 0, x, y, 60);
      glow.addColorStop(0, col); glow.addColorStop(0.3, col + '88'); glow.addColorStop(1, col + '00');
      g.fillStyle = glow; g.beginPath(); g.arc(x, y, 60, 0, Math.PI * 2); g.fill();
      g.fillStyle = col; g.beginPath(); g.arc(x, y, 16, 0, Math.PI * 2); g.fill();
      if (c.moon) { g.fillStyle = c.sky[0]; g.beginPath(); g.arc(x + 7, y - 5, 13, 0, Math.PI * 2); g.fill(); }
    }
    tile(g, bd.far, 0.12, camX, groundY - HB, HB, VW);
    tile(g, bd.mid, 0.38, camX, groundY - HB + 4, HB, VW);
    if (c.fog) {
      const fog = g.createLinearGradient(0, groundY - 150, 0, groundY);
      fog.addColorStop(0, 'rgba(230,236,220,0)'); fog.addColorStop(1, 'rgba(230,236,220,.42)');
      g.fillStyle = fog; g.fillRect(0, groundY - 150, VW, 150);
    }
    tile(g, bd.ground, 1, camX, groundY - 6, GH, VW);
    if (VH > groundY - 6 + GH) { g.fillStyle = c.dirt[1]; g.fillRect(0, groundY - 6 + GH, VW, VH); }
    if (c.embers) {
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 26; i++) {
        const sp = 18 + hash(i * 7) * 30;
        const y = groundY - ((time * sp + hash(i * 3) * 400) % (groundY + 20));
        const x = ((hash(i * 5) * VW + Math.sin(time + i) * 12 - camX * 0.3) % VW + VW) % VW;
        g.fillStyle = `rgba(255,${120 + (i % 5) * 20},40,${0.35 + 0.4 * hash(i)})`;
        g.beginPath(); g.arc(x, y, 1.2 + hash(i * 11) * 1.4, 0, Math.PI * 2); g.fill();
      }
      g.globalCompositeOperation = 'source-over';
    }
    if (c.flies) {
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 18; i++) {
        const x = ((hash(i * 13) * VW + Math.sin(time * 0.7 + i) * 20 - camX * 0.5) % VW + VW) % VW;
        const y = groundY - 20 - hash(i * 17) * 120 + Math.cos(time * 0.9 + i * 2) * 8;
        const a = 0.5 + 0.5 * Math.sin(time * 3 + i * 1.7);
        const gl = g.createRadialGradient(x, y, 0, x, y, 6);
        const fc = c.spirit ? '190,110,255' : '220,255,140';
        gl.addColorStop(0, `rgba(${fc},${a})`); gl.addColorStop(1, `rgba(${fc},0)`);
        g.fillStyle = gl; g.beginPath(); g.arc(x, y, 6, 0, Math.PI * 2); g.fill();
      }
      g.globalCompositeOperation = 'source-over';
    }
  }

  return { draw, build };
})();
