'use strict';
// Side-view battle: the dinosaur legion marches right, wild herds come from the right.

const Battle = (() => {
  const VW = 400;            // virtual width; height follows the canvas aspect
  const LANE_SP = 18;
  const RANK_SP = 40;
  const FRONT_X = 236;       // screen x of the front rank
  const DINO_S = 0.1;        // virtual px per sheet px
  const MARCH = 34;
  const BACK_RANK = RANKS - 1;

  let cv, g, dpr = 1, k = 1, VH = 400;
  let laneY0 = 200, groundY = 180;
  let nextFx = 1;

  const B = {
    time: 0, px: 0, camX: 0, marching: false, charging: false, engaged: false, marchT: 0, dustT: 0,
    lanes: Array.from({ length: LANES }, () => []), units: [], dying: [],
    enemies: [], projs: [], fx: [], texts: [], coins: [],
    stage: 0, wave: 0, waveActive: false, pending: false, pendT: 0,
    state: 'run', stateT: 0, boss: null, banner: null, flash: null,
    shake: 0, cd: {}, castGap: 0, aspdT: 0, aspdV: 0, chapter: null, chapterFade: 0,
    goldAnchor: { x: 60, y: -20 }, raid: null,
  };

  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const laneY = (l) => laneY0 + l * LANE_SP;
  const depth = (y) => 0.86 + 0.14 * clamp((y - laneY0) / ((LANES - 1) * LANE_SP), 0, 1);
  const sfx = (n, v, r, gap) => Engine.Sfx.play(n, v, r, gap);
  const IMG = (p) => Engine.img(p);
  const FONT = '"Jua", "Malgun Gothic", sans-serif';
  const FONT_B = '"Black Han Sans", "Jua", "Malgun Gothic", sans-serif';

  // ---------- setup ----------
  function init(canvas) {
    cv = canvas;
    g = cv.getContext('2d');
    resize();
  }

  function resize() {
    const r = cv.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    cv.width = Math.max(1, Math.round(r.width * dpr));
    cv.height = Math.max(1, Math.round(r.height * dpr));
    k = r.width / VW;
    VH = r.height / k;
    laneY0 = VH - 22 - (LANES - 1) * LANE_SP;
    groundY = laneY0 - 30;
    for (const u of B.units) u.y = laneY(u.lane);
  }

  function toVirtual(cssX, cssY) { return { x: cssX / k, y: cssY / k }; }

  // ---------- dinosaurs ----------
  function calcStats(u) {
    const r = u.r, S = SPECIES[r.sp], S2 = SPECIES[r.sp2];
    const M = Game.mods, H = Game.herd;
    const hy = r.sp2 !== r.sp;
    const base = hy ? { atk: (S.atk * 2 + S2.atk) / 3, hp: (S.hp * 2 + S2.hp) / 3, aspd: (S.aspd * 2 + S2.aspd) / 3 } : S;
    const T = (key) => { const l = traitLv(r, key); return l ? traitV(key, l) : 0; };
    const giant = T('giant');
    const st = u.st || (u.st = {});
    st.role = dinoRole(r);
    st.fire = T('fire');
    st.atk = base.atk * lvMult(r.lv) * (1 + T('fury')) * (1 + giant * 0.8) * M.atk * (1 + H.pack);
    st.hpMax = base.hp * lvMult(r.lv) * (1 + T('hide')) * (1 + giant * 0.8) * M.hp;
    st.interval = 1 / (base.aspd * (1 + T('swift')));
    st.crit = T('fang'); st.critDmg = T('hunt'); st.regen = T('regen'); st.rage = T('rage'); st.jaw = T('jaw');
    st.abs = hy ? [S.ab, S2.ab] : [S.ab];
    st.size = S.size * (1 + giant) * (1 + Math.min(0.3, 0.03 * (r.lv - 1)));
    const d = Engine.dims(u.look);
    st.w = d.w * DINO_S * st.size; st.h = d.h * DINO_S * st.size;
    st.front = st.w * 0.45;
    st.mouthX = d.ex * DINO_S * st.size; st.mouthY = d.ey * DINO_S * st.size * 0.92;
    const ratio = u.maxHp ? u.hp / u.maxHp : 1;
    u.maxHp = st.hpMax;
    u.hp = u.maxHp * ratio;
  }

  function makeUnit(rec) {
    const u = {
      id: rec.id, r: rec, look: { sp: rec.sp, hue: rec.hue }, lane: 0, rank: 0, idx: 0, ox: 0, y: 0,
      hp: 1, maxHp: 0, st: null, cd: Math.random(), anim: null, hitT: 0, dead: false, deathT: 0,
      spawnT: 0, shield: 0, shieldT: 0, seed: Math.random() * 6.28, atkN: 0, lastTgt: null,
      quakeT: rnd(1, 5), fly: null, fx: 0, fy: 0,
    };
    calcStats(u);
    u.hp = u.maxHp;
    return u;
  }

  const slotX = (l, rank) => -rank * RANK_SP + ((l & 1) ? 12 : 0);
  const aliveCount = () => B.units.length;
  const meleeOrder = (a, b) => (a.st.role - b.st.role) || (b.r.lv - a.r.lv) || (a.id - b.id);

  // Melee packs from the front and keeps lanes even; ranged dinosaurs and fliers always take the
  // rearmost free rank, switching lanes if they have to.
  function arrange() {
    const melee = [], back = [];
    for (const u of B.units) (u.st.role >= 2 ? back : melee).push(u);
    const mc = new Array(LANES).fill(0);
    for (const u of melee) mc[u.lane]++;
    for (let guard = 0; guard < 60; guard++) {
      let hi = 0, lo = 0;
      for (let l = 1; l < LANES; l++) { if (mc[l] > mc[hi]) hi = l; if (mc[l] < mc[lo]) lo = l; }
      if (mc[hi] - mc[lo] < 2) break;
      const mover = melee.filter((u) => u.lane === hi).sort(meleeOrder).pop();
      mover.lane = lo; mc[hi]--; mc[lo]++;
    }
    const cap = mc.map((n) => RANKS - n);
    const have = new Array(LANES).fill(0);
    for (const u of back) have[u.lane]++;
    const order = [...Array(LANES).keys()].sort((a, b) => have[b] - have[a] || Math.abs(a - 2.5) - Math.abs(b - 2.5));
    const need = new Array(LANES).fill(0);
    let left = back.length;
    for (let d = 0; d < RANKS && left > 0; d++) for (const l of order) if (left > 0 && cap[l] > d) { need[l]++; left--; }
    back.sort((a, b) => b.r.lv - a.r.lv || a.id - b.id);
    const placed = new Array(LANES).fill(0);
    const rest = [];
    for (const u of back) { if (placed[u.lane] < need[u.lane]) placed[u.lane]++; else rest.push(u); }
    for (const u of rest) {
      let best = -1, bd = 99;
      for (let l = 0; l < LANES; l++) if (placed[l] < need[l] && Math.abs(l - u.lane) < bd) { bd = Math.abs(l - u.lane); best = l; }
      if (best >= 0) { u.lane = best; placed[best]++; }
    }
    for (let l = 0; l < LANES; l++) {
      const m = melee.filter((u) => u.lane === l).sort(meleeOrder);
      const b = back.filter((u) => u.lane === l);
      m.forEach((u, i) => { u.rank = i; });
      b.forEach((u, i) => { u.rank = BACK_RANK - i; });
      B.lanes[l] = m.concat(b.reverse());
      B.lanes[l].forEach((u, i) => { u.idx = i; });
    }
  }

  function addDino(rec, opt = {}) {
    if (B.units.length >= SLOTS) return null;
    const u = makeUnit(rec);
    let best = 0;
    for (let l = 1; l < LANES; l++) if (B.lanes[l].length < B.lanes[best].length) best = l;
    if (opt.lane != null && B.lanes[opt.lane].length < RANKS) best = opt.lane;
    u.lane = best;
    if (opt.hp != null) u.hp = u.maxHp * opt.hp;
    B.units.push(u);
    arrange();
    u.ox = slotX(u.lane, u.rank);
    u.y = laneY(u.lane);
    if (opt.drop) {
      u.spawnT = 0.8;
      B.fx.push({ kind: 'egg', x: B.px + u.ox, y: u.y, t: 0, dur: 0.85, lv: rec.lv, bred: !!opt.bred });
      B.fx.push({ kind: 'beam', x: B.px + u.ox, y: u.y, t: 0, dur: 0.9, color: lvColor(rec.lv), big: rec.lv >= 4 });
    } else if (opt.merge) {
      u.spawnT = 0.35;
      B.fx.push({ kind: 'beam', x: B.px + u.ox, y: u.y, t: 0, dur: 0.7, color: lvColor(rec.lv), big: true });
      for (let i = 0; i < 6; i++) B.fx.push({ kind: 'spark', x: B.px + u.ox + rnd(-14, 14), y: u.y - rnd(4, 24), t: -i * 0.05, dur: 0.4, crit: true });
    }
    if (!opt.quiet) Game.armyChanged();
    return u;
  }

  // Takes a dinosaur out of the formation (it goes to the nest). Returns its record.
  function removeUnit(u) {
    const i = B.units.indexOf(u);
    if (i < 0) return null;
    B.units.splice(i, 1);
    B.fx.push({ kind: 'poof', x: B.px + u.ox, y: u.y - 8, t: 0, dur: 0.55, s: 0.8 });
    arrange();
    Game.armyChanged();
    return u.r;
  }

  // Two dinosaurs of the same level become one of the next level (species does not matter).
  function mergePair(a, b, quiet) {
    if (!a || !b || a === b || a.r.lv !== b.r.lv || !B.units.includes(a) || !B.units.includes(b)) return null;
    const rec = Game.mergedRecord(a.r, b.r);
    for (const u of [a, b]) {
      B.units.splice(B.units.indexOf(u), 1);
      B.fx.push({ kind: 'spark', x: B.px + u.ox, y: u.y - 14, t: 0, dur: 0.35, crit: true });
    }
    const hp = Math.min(1, (a.hp / a.maxHp + b.hp / b.maxHp) / 2 + 0.25);
    arrange();
    return addDino(rec, { lane: a.lane, merge: true, hp, quiet });
  }

  const traitScore = (r) => r.tr.reduce((s, t) => s + t[1] * (t[0] === 'fire' ? 3 : 2), 0) + (r.sp2 !== r.sp ? 1 : 0);

  function mergeGroups() {
    const groups = new Map();
    for (const u of B.units) {
      if (u.r.lock) continue;
      if (!groups.has(u.r.lv)) groups.set(u.r.lv, []);
      groups.get(u.r.lv).push(u);
    }
    return groups;
  }

  function mergeCount() {
    let n = 0;
    for (const grp of mergeGroups().values()) n += Math.floor(grp.length / 2);
    return n;
  }

  // One step per press: dinosaurs made by this merge wait for the next press.
  function mergeAll() {
    const made = [];
    const groups = [...mergeGroups().entries()].sort((a, b) => a[0] - b[0]);
    for (const [, grp] of groups) {
      grp.sort((a, b) => traitScore(b.r) - traitScore(a.r) || a.id - b.id);
      for (let i = 0; i + 1 < grp.length; i += 2) {
        const u = mergePair(grp[i], grp[i + 1], true);
        if (u) made.push(u);
      }
    }
    if (made.length) Game.armyChanged();
    return made;
  }

  function refreshStats() {
    for (const u of B.units) calcStats(u);
  }

  function hurtUnit(u, dmg, src) {
    if (u.dead || B.state === 'wipe') return;
    dmg *= 1 - Game.mods.armor;
    if (u.shield > 0) {
      const a = Math.min(u.shield, dmg);
      u.shield -= a; dmg -= a;
    }
    u.hp -= dmg;
    u.hitT = 0.15;
    if (src && !src.dead && u.st.abs.includes('whip')) hurtEnemy(src, dmg * 0.15 * (1 + u.st.jaw), { reflect: true });
    if (u.hp <= 0) killUnit(u);
  }

  function killUnit(u) {
    u.dead = true; u.deathT = 0; u.hp = 0; u.anim = null; u.fly = null;
    const i = B.units.indexOf(u);
    if (i >= 0) B.units.splice(i, 1);
    u.wx = B.px + u.ox;
    B.dying.push(u);
    arrange();
    sfx('stomp', 0.35, rnd(0.9, 1.1));
    Game.onDinoDied(u);
    if (!B.units.length) {
      B.state = 'wipe'; B.stateT = 2.8; B.boss = null;
      setBanner('군단 전멸!', B.raid ? '사룡 레이드 실패' : '무리를 정비하고 다시 진격합니다', '#ff6b5e', 2.6);
      sfx('fail', 0.8);
    }
  }

  // ---------- enemies ----------
  function makeEnemy(type, x, lane) {
    const T = ENEMY_TYPES[type];
    const sp = T.pool[Math.floor(Math.random() * T.pool.length)];
    const look = { sp, hue: 0, enemy: true };
    const scale = (T.scale || 1) * SPECIES[sp].size * (0.92 + Math.min(0.25, B.stage * 0.005));
    const d = Engine.dims(look);
    const hp = F.enemyHp(B.stage) * T.hp;
    return {
      id: nextFx++, type, T, sp, look, x, y: laneY(lane), lane, hp, maxHp: hp, atk: F.enemyAtk(B.stage) * T.atk,
      cd: rnd(0.3, T.aspd), anim: null, hitT: 0, dead: false, deathT: 0, slowT: 0, stunT: 0, scale,
      w: d.w * DINO_S * scale, h: d.h * DINO_S * scale, front: d.w * DINO_S * scale * 0.45,
      seed: rnd(0, 6.28), rand: Math.random(), moving: true, kb: 0, bleeds: [],
    };
  }

  function spawnWave() {
    const list = waveEnemies(B.stage, B.wave);
    const x0 = B.camX + VW + 50;
    const lanes = [...Array(LANES).keys()].sort(() => Math.random() - 0.5);
    let col = 0, li = 0;
    list.forEach((type) => {
      const T = ENEMY_TYPES[type];
      let lane = lanes[li % LANES];
      if (T.boss) lane = 2 + Math.floor(Math.random() * 2);
      const x = x0 + col * 46 + rnd(0, 16) + (T.range ? 40 : 0) + (T.boss ? 40 : 0);
      const e = makeEnemy(type, x, lane);
      B.enemies.push(e);
      if (T.boss) B.boss = e;
      li++;
      if (li % LANES === 0) col++;
    });
    B.waveActive = true;
    if (B.wave === WAVES_PER_STAGE - 1) {
      const T = ENEMY_TYPES[(B.stage % STAGES_PER_CHAPTER) === STAGES_PER_CHAPTER - 1 ? 'warlord' : 'boss'];
      setBanner('BOSS', T.name + ' 출현!', '#ff5a55', 1.8);
      sfx('roar', 0.7, 0.9);
    } else if (B.wave === 0) {
      setBanner('STAGE ' + F.stageLabel(B.stage), F.chapter(B.stage).name, '#ffe9a8', 1.8);
    }
  }

  function hurtEnemy(e, dmg, opt = {}) {
    if (e.dead) return;
    if (B.raid && e.raid) B.raid.dmg += Math.min(dmg, e.hp);
    e.hp -= dmg;
    e.hitT = 0.12;
    addText(e.x + rnd(-6, 6), e.y - e.h * depth(e.y) - 4, fmt(dmg), opt.crit ? 'crit' : opt.skill ? 'skill' : opt.bleed ? 'bleed' : 'n');
    const heavy = e.T.boss;
    if (opt.kb && !heavy) e.kb = Math.max(e.kb, opt.kb);
    if (opt.stun) e.stunT = Math.max(e.stunT, opt.stun * (e.raid ? 0.12 : heavy ? 0.3 : 1));
    if (opt.slow) e.slowT = Math.max(e.slowT, opt.slow);
    if (e.hp <= 0) killEnemy(e);
  }

  function killEnemy(e) {
    e.dead = true; e.deathT = 0; e.anim = null;
    if (B.boss === e) B.boss = null;
    const n = e.T.boss ? 8 : 1 + (Math.random() < 0.5 ? 1 : 0);
    const sx = e.x - B.camX, sy = e.y - e.h * 0.5;
    if (!e.raid) for (let i = 0; i < n; i++) B.coins.push({ x: sx, y: sy, vx: rnd(-50, 50), vy: rnd(-140, -70), t: 0 });
    if (e.T.boss) { B.shake = 7; sfx('boom', 0.6); sfx('roar', 0.5, 0.7); }
    Game.onEnemyKilled(e);
  }

  function addBleed(e, dps) {
    if (e.dead) return;
    e.bleeds.push({ dps, t: 4 });
    if (e.bleeds.length > 3) e.bleeds.sort((a, b) => b.t - a.t).length = 3;
  }

  // ---------- combat helpers ----------
  function unitAtk(u) {
    let a = u.st.atk;
    if (u.st.rage && u.hp < u.maxHp * 0.5) a *= 1 + u.st.rage;
    return a;
  }

  function rollDmg(u, base) {
    const M = Game.mods;
    const crit = Math.random() < M.crit + u.st.crit;
    return { dmg: base * rnd(0.9, 1.1) * (crit ? M.critDmg + u.st.critDmg : 1), crit };
  }

  // Count-based species abilities apply to bites, blades and fireballs alike.
  function abilityMods(u, e) {
    const st = u.st, jaw = 1 + st.jaw, has = (k) => st.abs.includes(k);
    const m = { mult: 1, stun: 0, kb: st.role >= 2 ? 3 : 7, label: null };
    if (has('tyrant') && u.atkN % 4 === 0) { m.mult += 2 * jaw; m.label = '폭군의 일격!'; }
    if (has('headbutt') && u.atkN % 4 === 0) { m.mult += 1 * jaw; m.stun = 1; m.label = '박치기!'; }
    if (has('horn') && u.atkN % 3 === 0) { m.mult += 0.6 * jaw; m.kb = 40; m.label = '뿔 밀치기!'; }
    if (has('charge') && u.lastTgt !== e) { m.mult += 1.5 * jaw; m.kb = Math.max(m.kb, 18); m.label = '돌진 물어뜯기!'; }
    if (has('club') && Math.random() < 0.25) { m.mult += 0.5 * jaw; m.stun = Math.max(m.stun, 1.5); m.label = '꼬리 곤봉!'; }
    u.lastTgt = e;
    return m;
  }

  function onHitEffects(u, e, dmg) {
    const st = u.st, jaw = 1 + st.jaw;
    if (st.abs.includes('bleed') || st.abs.includes('dive')) addBleed(e, unitAtk(u) * 0.25 * jaw);
    if (st.abs.includes('whip')) {
      for (const o of B.enemies) {
        if (o === e || o.dead) continue;
        if (Math.abs(o.x - e.x) < 34 && Math.abs(o.y - e.y) < LANE_SP * 1.6) hurtEnemy(o, dmg * 0.4 * jaw, { kb: 5 });
      }
    }
  }

  function findTarget(u) {
    const role = u.st.role;
    const sx = B.px + u.ox;
    if (role === 0 && u.idx > 0) return null;
    if (role === 1 && u.idx > 1) return null;
    if (role <= 1) {
      const reach = u.st.front + (u.idx === 1 ? RANK_SP + 8 : 10);
      let best = null, bd = Infinity;
      for (const e of B.enemies) {
        if (e.dead) continue;
        const dy = Math.abs(e.y - u.y);
        if (dy > (e.raid ? 70 : LANE_SP * 1.3)) continue;
        const dx = (e.x - e.front) - sx;
        if (dx > reach || e.x < sx - 24) continue;
        const score = dx + dy * 2;
        if (score < bd) { bd = score; best = e; }
      }
      return best;
    }
    const range = role === 3 ? 240 : 300;
    const cands = [];
    for (const e of B.enemies) {
      if (e.dead || e.x - B.camX > VW + 4) continue;
      if (e.x - sx <= range) cands.push(e);
    }
    if (!cands.length) return null;
    cands.sort((a, b) => a.x - b.x);
    return cands[Math.floor(Math.random() * Math.min(3, cands.length))];
  }

  function mouth(u) {
    const d = depth(u.y);
    return { x: B.px + u.ox + u.st.mouthX * d, y: u.y + u.st.mouthY * d };
  }

  function shoot(u, e) {
    const m = abilityMods(u, e);
    const from = mouth(u);
    const fire = u.st.fire > 0;
    const sp = fire ? 260 : 430;
    const dist = Math.hypot(e.x - from.x, e.y - from.y);
    B.projs.push({
      kind: fire ? 'fireball' : 'blade', from: 's', x0: from.x, y0: from.y, x: from.x, y: from.y, tx: e.x, ty: e.y - e.h * 0.4,
      target: e, t: 0, dur: Math.max(0.1, dist / sp), arc: fire ? 22 : 6, base: unitAtk(u) * m.mult * (fire ? u.st.fire : 1),
      splash: fire ? 18 + 5 * traitLv(u.r, 'fire') : 0, src: u, mods: m, color: lvColor(u.r.lv), size: fire ? 1 + 0.15 * traitLv(u.r, 'fire') : 1,
    });
    if (m.label) addText(from.x, from.y - 10, m.label, 'ability');
    if (fire) sfx('fire', 0.2, rnd(0.9, 1.15), 70);
    else sfx('click', 0.25, 1.6, 50);
  }

  function meleeHit(u, e) {
    const m = abilityMods(u, e);
    const { dmg, crit } = rollDmg(u, unitAtk(u) * m.mult);
    hurtEnemy(e, dmg, { crit, kb: m.kb, stun: m.stun });
    onHitEffects(u, e, dmg);
    if (m.label) addText(B.px + u.ox, u.y - u.st.h - 6, m.label, 'ability');
    B.fx.push({ kind: 'bite', x: e.x - e.front * 0.6, y: e.y - e.h * 0.55, t: 0, dur: 0.22, crit, s: 0.8 + Math.min(0.6, u.st.size * 0.4) });
    sfx(crit ? 'crit' : 'bite', crit ? 0.5 : 0.35, rnd(0.9, 1.1), 40);
  }

  function unitStrike(u, e) {
    if (!e || e.dead) e = findTarget(u);
    if (!e) return;
    u.atkN++;
    if (u.st.role === 2) {
      shoot(u, e);
      if ((u.st.abs.includes('blade')) && Math.random() < 0.25) {
        setTimeoutFx(0.12, () => { if (!u.dead && B.units.includes(u)) { const t2 = e.dead ? findTarget(u) : e; if (t2) shoot(u, t2); } });
      }
      return;
    }
    meleeHit(u, e);
  }

  // The front rank crashes into the wild line at the end of a charge.
  function chargeImpact() {
    let hit = false;
    for (const lane of B.lanes) {
      const u = lane[0];
      if (!u || u.st.role > 1) continue;
      const sx = B.px + u.ox;
      for (const e of B.enemies) {
        if (e.dead || Math.abs(e.y - u.y) > (e.raid ? 70 : LANE_SP * 0.8) || (e.x - e.front) - sx > u.st.front + 26) continue;
        hurtEnemy(e, unitAtk(u) * 0.8, { kb: 16 });
        hit = true;
      }
    }
    if (!hit) return;
    B.shake = Math.max(B.shake, 4);
    addText(B.px - 20, laneY0 - 26, '돌격!', 'skillName', '#ffe08a');
    for (let l = 0; l < LANES; l += 2) B.fx.push({ kind: 'spark', x: B.px + 30, y: laneY(l) - 16, t: 0, dur: 0.22, crit: true });
    sfx('stomp', 0.6, 0.8);
    sfx('roar', 0.3, 1.3);
  }

  function enemyStrike(e) {
    const T = e.T;
    if (e.raid) { raidBite(e); return; }
    if (T.proj) {
      // Spit lands on the first two ranks; the archers in the back stay out of reach.
      const pool = [];
      for (const lane of B.lanes) for (const u of lane) if (u.idx <= 1) pool.push(u);
      if (!pool.length) return;
      const u = pool[Math.floor(Math.random() * pool.length)];
      const x0 = e.x - e.front, y0 = e.y - e.h * 0.6;
      const tx = B.px + u.ox, ty = u.y - u.st.h * 0.5;
      B.projs.push({ kind: 'venom', from: 'e', x0, y0, x: x0, y: y0, tx, ty, target: u, t: 0,
        dur: Math.max(0.1, Math.hypot(tx - x0, ty - y0) / 250), arc: 16, base: e.atk, src: e });
      sfx('drop', 0.15, 0.6, 60);
      return;
    }
    const u = B.lanes[e.lane][0];
    if (!u) return;
    if ((e.x - e.front) - (B.px + u.ox + u.st.front) > 14) return;
    hurtUnit(u, e.atk * rnd(0.9, 1.1), e);
    B.fx.push({ kind: 'bite', x: B.px + u.ox + u.st.front * 0.6, y: u.y - u.st.h * 0.5, t: 0, dur: 0.18, enemy: true, s: e.scale });
    if (T.cleave) {
      for (const dl of [-1, 1]) {
        const o = B.lanes[e.lane + dl] && B.lanes[e.lane + dl][0];
        if (o) hurtUnit(o, e.atk * 0.6, e);
      }
      B.shake = Math.max(B.shake, 3);
      sfx('stomp', 0.4, 0.8);
    } else sfx('hit', 0.3, 0.85, 50);
  }

  // ---------- raid ----------
  function startRaid(lv) {
    B.raid = { lv, t: RAID.time, dmg: 0, hp: 0, spawnT: 1.8, volleyT: 4, roarT: 8, over: false, endT: 0, stage: B.stage, won: false };
    B.enemies = []; B.projs = []; B.boss = null; B.pending = false; B.waveActive = false; B.wave = 0;
    B.state = 'run';
    setBanner(RAID.name, RAID.place + ' · 제한 시간 ' + RAID.time + '초', '#d998ff', 2.2);
    sfx('roar', 0.8, 0.6);
  }

  function spawnRaidBoss() {
    const R = B.raid;
    const look = { sp: 0, hue: 0, raid: true };
    const d = Engine.dims(look);
    const scale = 2.1;
    const hp = RAID.hp(R.lv, Game.S.maxStage);
    const e = {
      id: nextFx++, type: 'raid', raid: true, T: { name: RAID.name, boss: true, spd: 14, aspd: 2.6, gold: 0 }, sp: 0, look,
      x: B.camX + VW + 140, y: laneY(LANES / 2 - 0.5) + 4, lane: 2, hp, maxHp: hp, atk: RAID.atk(R.lv, Game.S.maxStage),
      cd: 1.5, anim: null, hitT: 0, dead: false, deathT: 0, slowT: 0, stunT: 0, scale,
      w: d.w * DINO_S * scale, h: d.h * DINO_S * scale, front: d.w * DINO_S * scale * 0.42,
      seed: 0, rand: 0.5, moving: true, kb: 0, bleeds: [], walkT: 0,
    };
    R.hp = hp;
    R.boss = e;
    B.enemies.push(e);
    B.boss = e;
    B.shake = 6;
    sfx('roar', 0.9, 0.55);
  }

  function raidBite(e) {
    const lanes = [1, 2, 3, 4];
    let any = false;
    for (let l = 0; l < LANES; l++) {
      const u = B.lanes[l][0];
      if (!u || (e.x - e.front) - (B.px + u.ox + u.st.front) > 24) continue;
      hurtUnit(u, e.atk * (lanes.includes(l) ? 1 : 0.6) * rnd(0.9, 1.1), e);
      B.fx.push({ kind: 'bite', x: B.px + u.ox + u.st.front * 0.6, y: u.y - u.st.h * 0.5, t: 0, dur: 0.2, enemy: true, violet: true, s: 1.4 });
      any = true;
    }
    if (any) { B.shake = Math.max(B.shake, 5); sfx('crit', 0.6, 0.6); }
  }

  function updateRaid(dt) {
    const R = B.raid;
    if (R.over) {
      R.endT -= dt;
      if (R.endT <= 0) endRaid();
      return;
    }
    if (R.spawnT > 0) { R.spawnT -= dt; if (R.spawnT <= 0) spawnRaidBoss(); return; }
    const e = R.boss;
    if (e && e.dead) { finishRaid(true); return; }
    R.t -= dt;
    if (R.t <= 0) { finishRaid(false); return; }
    if (!e || B.state !== 'run') return;
    const close = e.x - e.front - B.px < 160;
    R.volleyT -= dt;
    if (R.volleyT <= 0 && close && B.units.length) {
      R.volleyT = 4;
      const m = { x: e.x - e.w * 0.32, y: e.y - e.h * 0.72 };
      for (let i = 0; i < 3; i++) {
        setTimeoutFx(i * 0.18, () => {
          if (!B.units.length || e.dead) return;
          const u = B.units[Math.floor(Math.random() * B.units.length)];
          const tx = B.px + u.ox, ty = u.y - u.st.h * 0.5;
          B.projs.push({ kind: 'darkfire', from: 'e', x0: m.x, y0: m.y, x: m.x, y: m.y, tx, ty, target: u, t: 0,
            dur: Math.max(0.2, Math.hypot(tx - m.x, ty - m.y) / 230), arc: 30, base: e.atk * 0.7, src: e, splash: 20 });
          sfx('fire', 0.35, 0.6, 40);
        });
      }
    }
    R.roarT -= dt;
    if (R.roarT <= 0 && close) {
      R.roarT = 9;
      addText(e.x - e.w * 0.2, e.y - e.h - 8, '망자의 포효!', 'skillName', '#d998ff');
      B.fx.push({ kind: 'ring', x: e.x - e.w * 0.3, y: laneY0 + 2.5 * LANE_SP, t: 0, dur: 0.9, color: '185,92,255', max: 300 });
      B.flash = { color: 'rgba(120,40,200,', t: 0, dur: 0.4 };
      B.shake = Math.max(B.shake, 8);
      e.anim = { t: 0, dur: 1.5, at: 0.4, hit: true };
      for (const u of [...B.units]) { hurtUnit(u, u.maxHp * 0.06 + e.atk * 0.35, null); u.cd += 0.8; }
      sfx('roar', 0.9, 0.5);
    }
  }

  function finishRaid(won) {
    const R = B.raid;
    R.over = true; R.won = won; R.endT = won ? 4.8 : 2.4;
    if (!won && R.boss && !R.boss.dead) {
      R.boss.dead = true; R.boss.deathT = 0; R.boss.fadeOnly = true;
      B.boss = null;
    }
    setBanner(won ? '사룡 토벌!' : '시간 초과', won ? '사룡 티라노사우루스가 안식에 듭니다' : '사룡이 어둠 속으로 물러납니다', won ? '#d998ff' : '#ffb0a6', 2.4);
    sfx(won ? 'clear' : 'fail', 0.8);
    Game.onRaidEnd({ won, lv: R.lv, frac: won ? 1 : clamp(R.dmg / (R.hp || 1), 0, 1) });
  }

  function endRaid() {
    const stage = B.raid.stage;
    B.raid = null;
    B.enemies = []; B.projs = []; B.boss = null;
    startStage(stage);
    setBanner('진격 재개', 'STAGE ' + F.stageLabel(stage), '#ffe9a8', 1.6);
  }

  // ---------- update ----------
  function update(dt) {
    B.time += dt;
    if (B.shake > 0) B.shake = Math.max(0, B.shake - dt * 25);
    if (B.aspdT > 0) B.aspdT -= dt;
    const ch = B.raid ? -1 : F.chapterIdx(B.stage);
    if (ch !== B.chapter) { if (B.chapter !== null) B.chapterFade = 1; B.chapter = ch; }
    if (B.chapterFade > 0) B.chapterFade = Math.max(0, B.chapterFade - dt * 1.2);

    let nearest = Infinity;
    for (const e of B.enemies) if (!e.dead) nearest = Math.min(nearest, e.x - e.front - B.px);
    B.engaged = nearest < 130;
    const wasMarching = B.marching;
    const front = B.lanes.reduce((m, l) => (l[0] && l[0].st.role <= 1 ? Math.max(m, l[0].st.front) : m), 24);
    B.marching = B.state === 'run' && aliveCount() > 0 && nearest > front + 20 && !(B.raid && B.raid.over);
    B.charging = B.marching && nearest < 170;
    if (B.marching) {
      B.px += MARCH * Game.mods.march * (B.charging ? 2 : 1) * dt;
      B.marchT += dt;
      B.dustT -= dt;
      if (B.dustT <= 0) {
        B.dustT = B.charging ? 0.05 : 0.13;
        const l = Math.floor(Math.random() * LANES);
        const lane = B.lanes[l];
        const back = lane.length ? slotX(l, lane[lane.length - 1].rank) : -RANK_SP * 3;
        B.fx.push({ kind: 'dust', x: B.px + back - 14 + rnd(-6, 6), y: laneY(l) - 2, t: 0, dur: 0.45 });
      }
    } else {
      if (wasMarching && B.marchT > 0.6 && nearest < front + 50) chargeImpact();
      B.marchT = 0;
    }
    B.camX = B.px - FRONT_X;

    updateUnits(dt);
    updateEnemies(dt);
    updateProjs(dt);
    updateFx(dt);
    updateSkills(dt);
    if (B.raid) { updateRaid(dt); updateWipe(dt); } else updateWaves(dt);
    updateTexts(dt);
    updateCoins(dt);
    if (B.banner) { B.banner.t += dt; if (B.banner.t > B.banner.dur) B.banner = null; }
    if (B.flash) { B.flash.t += dt; if (B.flash.t > B.flash.dur) B.flash = null; }
  }

  function updateUnits(dt) {
    const aspd = Game.mods.aspd * (B.aspdT > 0 ? 1 + B.aspdV : 1);
    const fighting = B.state === 'run';
    for (const u of B.units) {
      const tx = slotX(u.lane, u.rank), ty = laneY(u.lane);
      u.ox += (tx - u.ox) * Math.min(1, dt * 4);
      if (Math.abs(u.y - ty) > 0.3) u.y += Math.sign(ty - u.y) * Math.min(Math.abs(ty - u.y), 40 * dt);
      else u.y = ty;
      if (u.spawnT > 0) u.spawnT -= dt;
      if (u.hitT > 0) u.hitT -= dt;
      if (u.shieldT > 0) { u.shieldT -= dt; if (u.shieldT <= 0) u.shield = 0; }
      const heal = (B.marching ? 0.01 : 0) + u.st.regen;
      if (heal && u.hp < u.maxHp) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * heal * dt);
      // Brachio's ground quake: every 5 seconds, every wild dinosaur close to the front.
      if (u.st.abs.includes('quake') && fighting) {
        u.quakeT -= dt;
        if (u.quakeT <= 0) {
          const near = B.enemies.filter((e) => !e.dead && e.x - e.front - (B.px + u.ox) < 120);
          if (near.length) {
            u.quakeT = 5;
            for (const e of near) hurtEnemy(e, unitAtk(u) * 1.5 * (1 + u.st.jaw), { kb: 6 });
            B.fx.push({ kind: 'quake', x: B.px + u.ox + 40, y: u.y, t: 0, dur: 0.6 });
            B.shake = Math.max(B.shake, 3);
            sfx('stomp', 0.5, 0.7);
          } else u.quakeT = 0.5;
        }
      }
      u.cd -= dt * aspd;
      if (u.fly) { updateDive(u, dt); continue; }
      if (u.anim) {
        u.anim.t += dt;
        if (!u.anim.hit && u.anim.t >= u.anim.dur * u.anim.at) { u.anim.hit = true; if (fighting) unitStrike(u, u.anim.target); }
        if (u.anim.t >= u.anim.dur) u.anim = null;
      } else if (u.cd <= 0 && u.spawnT <= 0 && fighting) {
        const tgt = findTarget(u);
        if (tgt) {
          u.cd = u.st.interval;
          if (u.st.role === 3) {
            u.fly = { t: 0, dur: 0.95, target: tgt, hit: false, sx: 0, sy: 0 };
            sfx('fire', 0.15, 1.8, 80);
          } else {
            const dur = Math.min(0.6, (u.st.interval / aspd) * 0.8);
            u.anim = { t: 0, dur, at: u.st.role >= 2 ? 0.55 : 0.5, target: tgt, hit: false };
          }
        } else u.cd = 0.1;
      }
    }
    for (const u of B.dying) u.deathT += dt;
    B.dying = B.dying.filter((u) => u.deathT < 2.1);
  }

  // Pteranodon: soar from the back rank to the target and back again.
  function updateDive(u, dt) {
    const f = u.fly;
    f.t += dt;
    const q = f.t / f.dur;
    const e = f.target;
    if (e && !e.dead) { f.tx = e.x - e.front * 0.3 - (B.px + u.ox); f.ty = e.y - e.h * 0.55 - u.y + 18; }
    const out = q < 0.45 ? q / 0.45 : 1 - (q - 0.45) / 0.55;
    const ease = out * out * (3 - 2 * out);
    u.fx = (f.tx || 0) * ease;
    u.fy = (f.ty || 0) * ease - Math.sin(Math.min(1, q) * Math.PI) * 26;
    if (Math.random() < 0.5) B.fx.push({ kind: 'wind', x: B.px + u.ox + u.fx, y: u.y + u.fy - 22, t: 0, dur: 0.3 });
    if (!f.hit && q >= 0.45) {
      f.hit = true;
      if (e && !e.dead && B.state === 'run') {
        u.atkN++;
        meleeHit(u, e);
        B.fx.push({ kind: 'ring', x: e.x, y: e.y - e.h * 0.5, t: 0, dur: 0.35, color: '220,240,255', max: 40 });
      }
    }
    if (q >= 1) { u.fly = null; u.fx = 0; u.fy = 0; }
  }

  function updateEnemies(dt) {
    const fighting = B.state === 'run';
    for (const e of B.enemies) {
      if (e.dead) { e.deathT += dt; continue; }
      const T = e.T;
      if (e.hitT > 0) e.hitT -= dt;
      if (e.slowT > 0) e.slowT -= dt;
      if (e.bleeds.length) {
        let d = 0;
        for (const b of e.bleeds) { const s = Math.min(dt, b.t); d += b.dps * s; b.t -= dt; }
        e.bleeds = e.bleeds.filter((b) => b.t > 0);
        e.bleedAcc = (e.bleedAcc || 0) + d;
        e.bleedTick = (e.bleedTick || 0) + dt;
        if (e.bleedTick >= 0.5) {
          e.bleedTick = 0;
          const amt = e.bleedAcc; e.bleedAcc = 0;
          hurtEnemy(e, amt, { bleed: true });
          B.fx.push({ kind: 'drip', x: e.x + rnd(-8, 8), y: e.y - e.h * 0.5, t: 0, dur: 0.5 });
          if (e.dead) continue;
        }
      }
      if (e.kb > 0) { e.x += e.kb * 9 * dt; e.kb = Math.max(0, e.kb - dt * 60); }
      e.moving = false;
      if (e.stunT > 0) { e.stunT -= dt; e.anim = null; continue; }
      if (e.anim) {
        e.anim.t += dt;
        if (!e.anim.hit && e.anim.t >= e.anim.dur * (e.anim.at || 0.55)) { e.anim.hit = true; if (fighting) enemyStrike(e); }
        if (e.anim.t >= e.anim.dur) e.anim = null;
      }
      if (!fighting) continue;
      const spd = T.spd * (e.slowT > 0 ? 0.5 : 1);
      e.cd -= dt;
      if (T.range) {
        const want = B.px + T.range * (0.75 + 0.25 * e.rand);
        if (e.x > want) { e.x -= spd * dt; e.moving = true; }
        else if (e.cd <= 0 && !e.anim && aliveCount()) {
          e.anim = { t: 0, dur: 0.55, at: 0.55, hit: false };
          e.cd = T.aspd;
        }
        continue;
      }
      if (e.raid) {
        let stopX = -Infinity;
        for (const lane of B.lanes) if (lane[0]) stopX = Math.max(stopX, B.px + lane[0].ox + lane[0].st.front + e.front - 10);
        if (e.x > stopX + 0.5) { e.x = Math.max(stopX, e.x - spd * dt); e.moving = true; }
        if (e.x - stopX < 12 && e.cd <= 0 && !e.anim) { e.anim = { t: 0, dur: 1.5, at: 0.5, hit: false }; e.cd = T.aspd; }
        continue;
      }
      // Melee dinosaurs keep to a lane and queue behind each other.
      if (!B.lanes[e.lane].length) {
        let bl = -1, bd = 99;
        for (let l = 0; l < LANES; l++) if (B.lanes[l].length && Math.abs(l - e.lane) < bd) { bd = Math.abs(l - e.lane); bl = l; }
        if (bl >= 0) e.lane = bl;
      }
      const ty = laneY(e.lane);
      if (Math.abs(e.y - ty) > 0.5) { e.y += Math.sign(ty - e.y) * Math.min(Math.abs(ty - e.y), 45 * dt); e.moving = true; }
      const blocker = B.lanes[e.lane][0];
      const stopX = blocker ? B.px + blocker.ox + blocker.st.front + e.front - 4 : -Infinity;
      let ahead = -Infinity, aheadW = 0;
      for (const o of B.enemies) {
        if (o === e || o.dead || o.lane !== e.lane || o.T.range || o.raid || o.x >= e.x) continue;
        if (o.x > ahead) { ahead = o.x; aheadW = o.w; }
      }
      const minX = Math.max(stopX, ahead + Math.max(26, (aheadW + e.w) * 0.42));
      if (e.x > minX + 0.5) { e.x = Math.max(minX, e.x - spd * dt); e.moving = true; }
      else if (blocker && e.x < stopX - 1) { e.x = Math.min(stopX, e.x + spd * dt); e.moving = true; }
      if (blocker && e.x - stopX < 6 && e.cd <= 0 && !e.anim) {
        e.anim = { t: 0, dur: T.boss ? 0.75 : 0.5, at: 0.55, hit: false };
        e.cd = T.aspd;
      }
    }
    B.enemies = B.enemies.filter((e) => !e.dead || e.deathT < (e.raid ? 5 : 2));
  }

  function updateProjs(dt) {
    for (const p of B.projs) {
      p.t += dt;
      if (p.target && !p.target.dead && !p.fixed) {
        if (p.from === 'e') { p.tx = B.px + p.target.ox; p.ty = p.target.y - p.target.st.h * 0.5; }
        else { p.tx = p.target.x; p.ty = p.target.y - p.target.h * 0.4; }
      }
      const q = Math.min(1, p.t / p.dur);
      const nx = lerp(p.x0, p.tx, q);
      const ny = lerp(p.y0, p.ty, q) - Math.sin(q * Math.PI) * p.arc;
      p.ang = Math.atan2(ny - p.y, nx - p.x);
      p.x = nx; p.y = ny;
      if (p.kind === 'fireball' || p.kind === 'darkfire' || p.kind === 'rock') {
        p.trail = (p.trail || 0) + dt;
        if (p.trail > 0.025) { p.trail = 0; B.fx.push({ kind: 'ember', x: p.x, y: p.y, t: 0, dur: 0.35, dark: p.kind === 'darkfire', s: p.size || 1 }); }
      }
      if (q >= 1) { p.done = true; projHit(p); }
    }
    B.projs = B.projs.filter((p) => !p.done);
  }

  function projHit(p) {
    if (p.onHit) { p.onHit(p); return; }
    if (p.from === 's') {
      let e = p.target && !p.target.dead ? p.target : null;
      if (!e) for (const o of B.enemies) if (!o.dead && Math.abs(o.x - p.tx) < 18 && Math.abs(o.y - o.h * 0.4 - p.ty) < 20) { e = o; break; }
      const u = p.src;
      const m = p.mods || { stun: 0, kb: 3 };
      if (p.splash) {
        B.fx.push({ kind: 'fireboom', x: p.tx, y: p.ty, t: 0, dur: 0.4, s: p.size || 1 });
        const { dmg, crit } = rollDmg(u, p.base);
        for (const o of B.enemies) {
          if (o.dead) continue;
          const inside = o === e || (Math.abs(o.x - p.tx) < p.splash + o.w * 0.25 && Math.abs(o.y - o.h * 0.4 - p.ty) < p.splash * 0.9);
          if (!inside) continue;
          hurtEnemy(o, o === e ? dmg : dmg * 0.6, { crit: crit && o === e, kb: m.kb, stun: o === e ? m.stun : 0 });
        }
        if (e) onHitEffects(u, e, dmg);
        sfx('boom', 0.16, 1.5, 70);
        return;
      }
      if (!e) return;
      const { dmg, crit } = rollDmg(u, p.base);
      hurtEnemy(e, dmg, { crit, kb: m.kb, stun: m.stun });
      onHitEffects(u, e, dmg);
      B.fx.push({ kind: 'slash', x: p.tx, y: p.ty, t: 0, dur: 0.2, color: p.color, ang: p.ang });
      sfx('hit', 0.25, 1.3, 50);
      return;
    }
    // wild projectiles
    if (p.splash) {
      B.fx.push({ kind: 'fireboom', x: p.tx, y: p.ty, t: 0, dur: 0.45, s: 1.2, dark: true });
      for (const u of [...B.units]) {
        if (Math.abs(B.px + u.ox - p.tx) < p.splash + 6 && Math.abs(u.y - u.st.h * 0.5 - p.ty) < p.splash) hurtUnit(u, p.base * (u === p.target ? 1 : 0.5), null);
      }
      return;
    }
    B.fx.push({ kind: 'splat', x: p.tx, y: p.ty, t: 0, dur: 0.35 });
    if (p.target && !p.target.dead) hurtUnit(p.target, p.base * rnd(0.9, 1.1), null);
  }

  function updateWipe(dt) {
    if (B.state !== 'wipe') return false;
    B.stateT -= dt;
    if (B.stateT <= 0) {
      for (const e of B.enemies) if (!e.dead) B.fx.push({ kind: 'poof', x: e.x, y: e.y - 12, t: 0, dur: 0.6, s: e.scale });
      B.enemies = []; B.projs = []; B.boss = null;
      B.state = 'run';
      if (B.raid) {
        const stage = B.raid.stage;
        if (!B.raid.over) Game.onRaidEnd({ won: false, lv: B.raid.lv, frac: clamp(B.raid.dmg / (B.raid.hp || 1), 0, 1) });
        B.raid = null;
        startStage(stage);
        Game.onWipe(true);
      } else {
        B.wave = 0; B.waveActive = false; B.pending = true; B.pendT = 1.6;
        Game.onWipe(false);
      }
    }
    return true;
  }

  function updateWaves(dt) {
    if (updateWipe(dt)) return;
    if (B.enemies.some((e) => !e.dead)) return;
    if (B.pending) {
      B.pendT -= dt;
      if (B.pendT <= 0) { B.pending = false; spawnWave(); }
      return;
    }
    if (B.waveActive) {
      B.waveActive = false;
      if (B.wave >= WAVES_PER_STAGE - 1) {
        const gems = Game.onStageCleared(B.stage);
        if (!Game.S.farm) B.stage++;
        B.wave = 0;
        setBanner('STAGE CLEAR!', (Game.S.farm ? '반복 사냥 · ' : '') + '호박석 +' + gems, '#7dff8a', 1.6);
        sfx('clear', 0.7);
        B.pending = true; B.pendT = 2.0;
      } else { B.wave++; B.pending = true; B.pendT = 0.5; }
    } else { B.pending = true; B.pendT = 0.8; }
  }

  // ---------- skills ----------
  // Skills grow with the legion: a higher-level herd casts stronger skills.
  function heroAtk() {
    let n = 0, m = 0;
    for (const u of B.units) { m += lvMult(u.r.lv); n++; }
    return 10 * Game.mods.atk * Game.mods.skill * (n ? m / n : 1);
  }

  function onScreenEnemies() {
    return B.enemies.filter((e) => !e.dead && e.x - B.camX < VW + (e.raid ? 120 : -4) && e.x - B.camX > FRONT_X - 30);
  }

  function clusterTarget(r = 50) {
    const vis = onScreenEnemies();
    let best = null, bn = -1;
    for (const a of vis) {
      let n = a.T.boss ? 2 : 0;
      for (const b of vis) if (Math.abs(b.x - a.x) < r && Math.abs(b.y - a.y) < r * 0.8) n++;
      if (n > bn) { bn = n; best = a; }
    }
    return best ? { x: Math.min(best.x, B.camX + VW - 20), y: best.y - Math.min(best.h * 0.4, 20), e: best } : null;
  }

  function aoe(x, y, r, dmg, opt = {}) {
    let hit = 0;
    for (const e of B.enemies) {
      if (e.dead) continue;
      const dx = Math.max(0, Math.abs(e.x - x) - e.w * 0.3), dy = (e.y - e.h * 0.4 - y) * 1.3;
      if (dx * dx + dy * dy <= r * r) { hurtEnemy(e, dmg * rnd(0.92, 1.08), { skill: true, ...opt }); hit++; }
    }
    return hit;
  }

  function armyCenter() {
    let n = 0, x = 0;
    for (const u of B.units) { x += B.px + u.ox; n++; }
    return { x: n ? x / n : B.px - 60, y: laneY0 + 2.5 * LANE_SP };
  }

  function skillProj(kind, from, to, dur, onHit, arc = 0, size = 1) {
    B.projs.push({ kind, from: 'x', x0: from.x, y0: from.y, x: from.x, y: from.y, tx: to.x, ty: to.y,
      target: to.e || null, fixed: !to.e, t: 0, dur, arc, size, onHit, ang: 0 });
  }

  const SKILL_FN = {
    meteor(v) {
      const t = clusterTarget();
      if (!t) return false;
      skillProj('rock', { x: t.x + 120, y: -40 }, t, 0.55, (p) => {
        aoe(p.tx, p.ty, 58, heroAtk() * v / 100);
        boom(p.tx, p.ty, 1.3); B.shake = Math.max(B.shake, 4);
        sfx('boom', 0.6);
      }, 0, 1);
      sfx('fire', 0.4, 0.7);
      return true;
    },
    spikes(v) {
      const t = clusterTarget(70);
      if (!t) return false;
      for (let i = 0; i < 16; i++) {
        const tx = t.x + rnd(-55, 55), ty = laneY(Math.floor(rnd(0, LANES))) - 12;
        const from = { x: tx - 70, y: -20 };
        setTimeoutFx(i * 0.05, () => {
          skillProj('spike', from, { x: tx, y: ty }, 0.45, (p) => {
            aoe(p.tx, p.ty, 20, heroAtk() * v / 100);
            B.fx.push({ kind: 'dust', x: p.tx, y: p.ty + 10, t: 0, dur: 0.3 });
          });
          if (i % 4 === 0) sfx('hit', 0.3, 1.5);
        });
      }
      return true;
    },
    glacier(v) {
      const vis = onScreenEnemies();
      if (!vis.length) return false;
      const counts = new Array(LANES).fill(0);
      for (const e of vis) counts[clamp(e.lane, 0, LANES - 1)]++;
      const lane = counts.indexOf(Math.max(...counts));
      const y = laneY(lane) - 14;
      const hitSet = new Set();
      B.fx.push({ kind: 'lance', x: B.px + 10, y, t: 0, dur: 1.1, speed: 420, update(f) {
        for (const e of B.enemies) {
          if (e.dead || hitSet.has(e)) continue;
          if (Math.abs(e.y - 14 - y) < (e.raid ? 70 : 26) && f.x >= e.x - e.front) {
            hitSet.add(e);
            hurtEnemy(e, heroAtk() * v / 100, { skill: true, slow: 3 });
            B.fx.push({ kind: 'frost', x: e.x, y: e.y - e.h * 0.5, t: 0, dur: 0.4 });
          }
        }
      } });
      sfx('zap', 0.4, 0.7);
      return true;
    },
    thunder(v) {
      const vis = onScreenEnemies();
      if (!vis.length) return false;
      const targets = vis.sort(() => Math.random() - 0.5).slice(0, 5);
      const cx = targets.reduce((a, e) => a + e.x, 0) / targets.length;
      B.fx.push({ kind: 'cloud', x: cx, y: Math.max(18, groundY - 100), t: 0, dur: 1.3 });
      targets.forEach((e, i) => setTimeoutFx(0.15 + i * 0.12, () => {
        if (e.dead) return;
        B.fx.push({ kind: 'bolt', x: e.x, y: e.y - e.h * 0.4, top: Math.max(18, groundY - 92), t: 0, dur: 0.28, seed: Math.random() * 1000 });
        hurtEnemy(e, heroAtk() * v / 100, { skill: true, stun: 0.8 });
        sfx('zap', 0.4, 1.3);
      }));
      return true;
    },
    poison(v) {
      const t = clusterTarget(60);
      if (!t) return false;
      B.fx.push({ kind: 'field', field: 'poison', x: t.x, y: t.y + 16, r: 62, t: 0, dur: 5, tick: 0, update(f, dt) {
        f.tick -= dt;
        if (f.tick <= 0) { f.tick = 0.5; aoe(f.x, f.y - 14, f.r, heroAtk() * v / 100); }
      } });
      sfx('boom', 0.3, 1.6);
      return true;
    },
    hunt(v) {
      if (!B.engaged) return false;
      B.aspdT = 7; B.aspdV = v / 100;
      const c = armyCenter();
      B.fx.push({ kind: 'icon', icon: ICON.skillUrl('hunt'), x: c.x, y: laneY0 - 40, t: 0, dur: 1.0, size: 50 });
      B.flash = { color: 'rgba(255,60,40,', t: 0, dur: 0.35 };
      sfx('roar', 0.6, 1.1);
      return true;
    },
    wall(v) {
      if (!B.engaged) return false;
      for (const u of B.units) { u.shield = u.maxHp * v / 100; u.shieldT = 8; }
      const c = armyCenter();
      B.fx.push({ kind: 'icon', icon: ICON.skillUrl('wall'), x: c.x, y: laneY0 - 40, t: 0, dur: 1.0, size: 50 });
      sfx('reveal', 0.4, 0.8);
      return true;
    },
    volcano(v) {
      const t = clusterTarget(70);
      if (!t) return false;
      B.fx.push({ kind: 'field', field: 'lava', x: t.x, y: t.y + 16, r: 72, t: 0, dur: 5, tick: 0, update(f, dt) {
        f.tick -= dt;
        if (f.tick <= 0) { f.tick = 0.5; aoe(f.x, f.y - 14, f.r, heroAtk() * v / 100); }
      } });
      boom(t.x, t.y, 1);
      sfx('boom', 0.5, 0.8);
      return true;
    },
    vortex(v) {
      if (!onScreenEnemies().length) return false;
      const hitSet = new Set();
      B.fx.push({ kind: 'wave', x: B.px + 6, y: laneY0 + 2.5 * LANE_SP, t: 0, dur: 1.6, speed: 260, update(f) {
        for (const e of B.enemies) {
          if (e.dead || hitSet.has(e) || f.x < e.x - e.front) continue;
          hitSet.add(e);
          hurtEnemy(e, heroAtk() * v / 100, { skill: true, kb: 30 });
        }
      } });
      sfx('fire', 0.6, 1.3);
      return true;
    },
    rain(v) {
      let need = false;
      for (const u of B.units) if (u.hp < u.maxHp * 0.75) need = true;
      if (!need) return false;
      const c = armyCenter();
      B.fx.push({ kind: 'rain', x: c.x, y: Math.max(24, laneY0 - 70), t: 0, dur: 1.6 });
      for (const u of B.units) {
        u.hp = Math.min(u.maxHp, u.hp + u.maxHp * v / 100);
        B.fx.push({ kind: 'heal', x: B.px + u.ox, y: u.y - u.st.h * 0.6, t: -Math.random() * 0.4, dur: 0.9 });
      }
      sfx('heal', 0.6);
      return true;
    },
    roar(v) {
      const vis = onScreenEnemies();
      if (!vis.length) return false;
      const c = armyCenter();
      B.fx.push({ kind: 'ring', x: c.x + 40, y: laneY0 + 2.5 * LANE_SP, t: 0, dur: 0.9, color: '255,220,140', max: 420 });
      B.fx.push({ kind: 'ring', x: c.x + 40, y: laneY0 + 2.5 * LANE_SP, t: -0.15, dur: 0.9, color: '255,160,80', max: 380 });
      setTimeoutFx(0.3, () => {
        for (const e of onScreenEnemies()) hurtEnemy(e, heroAtk() * v / 100 * rnd(0.92, 1.08), { skill: true, kb: 12 });
        B.flash = { color: 'rgba(255,240,200,', t: 0, dur: 0.4 };
        B.shake = Math.max(B.shake, 6);
      });
      sfx('roar', 0.9, 0.85);
      return true;
    },
    primal(v) {
      const t = clusterTarget(80);
      if (!t) return false;
      B.fx.push({ kind: 'pillar', x: t.x, y: t.y + 18, t: 0, dur: 1.4 });
      setTimeoutFx(0.35, () => {
        aoe(t.x, t.y, 95, heroAtk() * v / 100, { stun: 1.2, kb: 14 });
        B.fx.push({ kind: 'crater', x: t.x, y: t.y + 20, t: 0, dur: 3.5 });
        boom(t.x, t.y, 2.2);
        B.flash = { color: 'rgba(255,200,120,', t: 0, dur: 0.45 };
        B.shake = Math.max(B.shake, 11);
        sfx('boom', 0.9, 0.7);
      });
      sfx('roar', 0.6, 0.6);
      return true;
    },
  };

  function boom(x, y, s) {
    B.fx.push({ kind: 'boom', x, y, t: 0, dur: 0.5, s });
    B.fx.push({ kind: 'smoke', x, y: y + 6, t: 0, dur: 0.9, s });
  }

  function setTimeoutFx(delay, fn) { B.fx.push({ kind: 'timer', t: -delay, dur: 0, fn }); }

  function castSkill(id) {
    const sk = SKILL_BY_ID[id];
    if (!sk || (B.cd[id] || 0) > 0 || B.state !== 'run' || !B.units.length) return false;
    const lv = (Game.S.skills[id] && Game.S.skills[id].lv) || 1;
    if (!SKILL_FN[id](F.skillValue(sk, lv))) return false;
    B.cd[id] = sk.cd;
    const c = armyCenter();
    addText(c.x, laneY0 - 30, sk.name + '!', 'skillName', LV_COLORS[sk.grade]);
    return true;
  }

  function updateSkills(dt) {
    for (const id in B.cd) if (B.cd[id] > 0) B.cd[id] -= dt;
    B.castGap -= dt;
    if (!Game.S.auto || B.state !== 'run' || B.castGap > 0 || !aliveCount()) return;
    for (const id of Game.S.equip) {
      if (id && (B.cd[id] || 0) <= 0 && castSkill(id)) { B.castGap = 0.4; break; }
    }
  }

  // ---------- fx / text / coins ----------
  function updateFx(dt) {
    for (const f of B.fx) {
      f.t += dt;
      if (f.kind === 'timer') { if (f.t >= 0) { f.fired = true; f.fn(); } continue; }
      if (f.t < 0) continue;
      if (f.speed) f.x += f.speed * dt;
      if (f.update) f.update(f, dt);
    }
    B.fx = B.fx.filter((f) => (f.kind === 'timer' ? !f.fired : f.t < f.dur));
  }

  function addText(x, y, text, kind, color) {
    if (B.texts.length > 70) B.texts.shift();
    B.texts.push({ x, y, text, kind, color, t: 0, dur: kind === 'skillName' ? 1.1 : kind === 'ability' ? 0.9 : 0.75 });
  }
  function updateTexts(dt) {
    for (const t of B.texts) t.t += dt;
    B.texts = B.texts.filter((t) => t.t < t.dur);
  }

  function updateCoins(dt) {
    const a = B.goldAnchor;
    for (const c of B.coins) {
      c.t += dt;
      if (c.t < 0.45) { c.vy += 420 * dt; c.x += c.vx * dt; c.y += c.vy * dt; }
      else {
        const dx = a.x - c.x, dy = a.y - c.y, d = Math.hypot(dx, dy) || 1;
        const sp = 300 + (c.t - 0.45) * 1600;
        c.x += dx / d * sp * dt; c.y += dy / d * sp * dt;
        if (d < 14) c.done = true;
      }
    }
    if (B.coins.some((c) => c.done)) Game.coinArrived();
    B.coins = B.coins.filter((c) => !c.done && c.t < 3);
  }

  function setBanner(text, sub, color, dur) { B.banner = { text, sub, color, t: 0, dur }; }

  // ---------- drawing ----------
  function hash(n) {
    n = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
    n ^= n >>> 13; n = Math.imul(n, 0xc2b2ae35); n ^= n >>> 16;
    return (n >>> 0) / 4294967296;
  }

  function glow(x, y, r, rgb, a) {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }

  function star(x, y, r, rot, color, a) {
    g.save();
    g.globalAlpha *= a;
    g.translate(x, y); g.rotate(rot);
    g.fillStyle = color;
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const rr = i % 2 ? r * 0.28 : r;
      const an = i * Math.PI / 4;
      g.lineTo(Math.cos(an) * rr, Math.sin(an) * rr);
    }
    g.closePath(); g.fill();
    g.restore();
  }

  function puff(x, y, r, color, a) {
    g.globalAlpha = a;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, color); gr.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 1;
  }

  function crescent(x, y, r, ang, color, a) {
    g.save();
    g.globalAlpha *= a;
    g.translate(x, y); g.rotate(ang);
    g.fillStyle = color;
    g.beginPath();
    g.arc(0, 0, r, -1.25, 1.25);
    g.arc(-r * 0.45, 0, r * 0.82, 1.1, -1.1, true);
    g.closePath(); g.fill();
    g.restore();
  }

  function drawIcon(src, x, y, size, rot, alpha) {
    const im = IMG(src);
    if (!im) return;
    const w = size, h = size * im.naturalHeight / im.naturalWidth;
    if (rot || alpha != null) {
      g.save();
      if (alpha != null) g.globalAlpha *= alpha;
      g.translate(x, y); if (rot) g.rotate(rot);
      g.drawImage(im, -w / 2, -h / 2, w, h);
      g.restore();
    } else g.drawImage(im, x - w / 2, y - h / 2, w, h);
  }

  function unitPose(u) {
    if (u.anim) {
      const q = Math.min(1, u.anim.t / u.anim.dur);
      return { motion: 'attack', t: q, lunge: u.st.role <= 1 ? Math.sin(q * Math.PI) * 40 : 0, time: B.time };
    }
    if (u.fly) return { motion: 'attack', t: Math.min(0.99, u.fly.t / u.fly.dur), time: B.time };
    return { motion: 'walk', t: B.time + u.seed, moving: B.marching || u.st.role === 3, pace: B.charging ? 1.6 : 1,
      squash: B.marching ? 1 : 1 + 0.012 * Math.sin(B.time * 2.7 + u.seed), time: B.time };
  }

  function enemyPose(e) {
    const slow = e.raid ? 1 / 3 : 1;
    if (e.dead) return { motion: 'death', t: e.fadeOnly ? 0 : e.deathT * slow, time: B.time, seed: e.seed };
    if (e.anim) return { motion: 'attack', t: Math.min(1, e.anim.t / e.anim.dur), lunge: e.T.range ? 0 : Math.sin(Math.min(1, e.anim.t / e.anim.dur) * Math.PI) * 30, time: B.time, seed: e.seed };
    const p = { motion: 'walk', t: (B.time + e.seed) * slow, moving: e.moving || !!e.raid, time: B.time, seed: e.seed };
    if (e.stunT > 0) p.tilt = Math.sin(B.time * 20) * 0.05;
    if (!e.moving) p.squash = 1 + 0.012 * Math.sin(B.time * 2.7 + e.seed);
    return p;
  }

  const drawList = [];
  function drawUnits() {
    drawList.length = 0;
    for (const u of B.units) drawList.push({ y: u.y + (u.fly ? 30 : 0), x: B.px + u.ox, u });
    for (const u of B.dying) drawList.push({ y: u.y, x: u.wx, u, dying: true });
    for (const e of B.enemies) drawList.push({ y: e.y, x: e.x, e });
    drawList.sort((a, b) => a.y - b.y || a.x - b.x);

    // shadows + level auras first
    for (const it of drawList) {
      if (it.u) {
        const u = it.u, d = depth(u.y);
        const x = it.x - B.camX;
        const w = u.st.w * d;
        g.globalAlpha = it.dying ? Math.max(0, 1 - Math.max(0, u.deathT - 1.4) / 0.7) : 1;
        if (!it.dying) {
          const lvl = u.r.lv;
          const cycle = Math.floor((lvl - 1) / LV_COLORS.length);
          g.fillStyle = lvColor(lvl);
          g.globalAlpha = 0.34 + (cycle ? 0.12 * Math.sin(B.time * 4 + u.seed) : 0);
          g.beginPath(); g.ellipse(x, u.y, w * 0.36, 4.5 * d, 0, 0, Math.PI * 2); g.fill();
          if (cycle) {
            g.strokeStyle = lvColor(lvl); g.lineWidth = 1.2;
            g.globalAlpha = 0.5 + 0.3 * Math.sin(B.time * 5 + u.seed);
            g.beginPath(); g.ellipse(x, u.y, w * 0.42 + 2, 5.6 * d + 1, 0, 0, Math.PI * 2); g.stroke();
          }
          g.globalAlpha = 1;
        }
        g.fillStyle = 'rgba(30,20,10,0.28)';
        g.beginPath(); g.ellipse(x, u.y, w * 0.3, 3.4 * d, 0, 0, Math.PI * 2); g.fill();
      } else {
        const e = it.e, d = depth(e.y);
        g.globalAlpha = e.dead ? Math.max(0, 1 - Math.max(0, e.deathT - (e.raid ? 3.5 : 1.4)) / 0.6) : 1;
        if (e.T.boss && !e.dead) {
          g.fillStyle = e.raid ? 'rgba(150,60,255,0.32)' : 'rgba(255,40,30,0.3)';
          g.beginPath(); g.ellipse(it.x - B.camX, e.y, e.w * 0.42 * d, 7 * d * e.scale * 0.6, 0, 0, Math.PI * 2); g.fill();
        }
        g.fillStyle = 'rgba(30,20,10,0.3)';
        g.beginPath(); g.ellipse(it.x - B.camX, e.y, e.w * 0.3 * d, 3.6 * d * Math.max(1, e.scale * 0.7), 0, 0, Math.PI * 2); g.fill();
      }
    }
    g.globalAlpha = 1;

    for (const it of drawList) {
      if (it.u) {
        const u = it.u, d = depth(u.y);
        let x = it.x - B.camX, y = u.y;
        const s = DINO_S * u.st.size * d;
        let pose;
        if (it.dying) {
          pose = { motion: 'death', t: u.deathT, time: B.time };
          g.globalAlpha = Math.max(0, 1 - Math.max(0, u.deathT - 1.4) / 0.7);
        } else {
          pose = unitPose(u);
          if (u.st.role === 3 && !u.fly) pose.lift = 14 + Math.sin(B.time * 3 + u.seed) * 3;
          if (u.fly) { x += u.fx; y += u.fy - 14; }
          if (u.spawnT > 0) {
            if (u.spawnT > 0.32) continue;
            const q = 1 - u.spawnT / 0.32;
            pose.squash = 0.4 + q * 0.6;
            g.globalAlpha = Math.min(1, q * 2);
          }
        }
        Engine.drawDino(g, u.look, x, y, s, false, pose, !it.dying && u.hitT > 0.07 ? 0.7 : 0);
        g.globalAlpha = 1;
        if (!it.dying && u.shield > 0) {
          g.globalAlpha = 0.26 + 0.08 * Math.sin(B.time * 6 + u.seed);
          g.fillStyle = '#9fe6ff';
          g.beginPath(); g.ellipse(x, y - u.st.h * 0.45, u.st.w * 0.42, u.st.h * 0.62, 0, 0, Math.PI * 2); g.fill();
          g.globalAlpha = 1;
        }
      } else {
        const e = it.e;
        const d = depth(e.y);
        const x = e.x - B.camX;
        if (x < -80 || x > VW + 200) continue;
        const pose = enemyPose(e);
        if (e.dead) g.globalAlpha = Math.max(0, 1 - Math.max(0, e.deathT - (e.raid ? 3.5 : 1.4)) / 0.6);
        if (e.raid && e.dead && e.fadeOnly) g.globalAlpha = Math.max(0, 1 - e.deathT / 1.5);
        Engine.drawDino(g, e.look, x, e.y, DINO_S * e.scale * d, true, pose, e.hitT > 0.07 && !e.T.boss ? 0.7 : e.hitT > 0.07 ? 0.3 : 0);
        g.globalAlpha = 1;
        if (e.slowT > 0 && !e.dead) {
          g.globalAlpha = 0.28; g.fillStyle = '#8fd8ff';
          g.beginPath(); g.ellipse(x, e.y - e.h * 0.45, e.w * 0.4, e.h * 0.6, 0, 0, Math.PI * 2); g.fill();
          g.globalAlpha = 1;
        }
        if (e.stunT > 0 && !e.dead) {
          for (let i = 0; i < 3; i++) {
            const a = B.time * 5 + i * 2.1;
            star(x + Math.cos(a) * 10 * d, e.y - e.h * d - 4 + Math.sin(a) * 3, 4, a, '#fff3a0', 1);
          }
        }
      }
    }

    // health bars on top
    for (const it of drawList) {
      if (it.dying) continue;
      const u = it.u || it.e;
      if (u.dead || u.hp >= u.maxHp - 0.01 || (it.e && it.e.T.boss)) continue;
      const d = depth(u.y);
      let x = it.x - B.camX;
      let y = u.y - (it.u ? u.st.h : u.h) * d - 4;
      if (it.u && u.fly) { x += u.fx; y += u.fy - 14; }
      if (it.u && u.st.role === 3 && !u.fly) y -= 14;
      const w = 18 * d;
      g.fillStyle = 'rgba(20,10,10,0.75)';
      g.fillRect(x - w / 2 - 1, y - 1, w + 2, 4);
      g.fillStyle = it.u ? '#5ee05a' : '#ff5148';
      g.fillRect(x - w / 2, y, w * clamp(u.hp / u.maxHp, 0, 1), 2);
    }
  }

  function drawProjs() {
    for (const p of B.projs) {
      const x = p.x - B.camX, y = p.y;
      if (p.kind === 'fireball' || p.kind === 'darkfire') {
        const dark = p.kind === 'darkfire';
        const s = (p.size || 1) * (dark ? 1.4 : 1);
        g.globalCompositeOperation = 'lighter';
        glow(x, y, 11 * s, dark ? '170,70,255' : '255,140,40', 0.75);
        g.globalCompositeOperation = 'source-over';
        g.fillStyle = dark ? '#d9a6ff' : '#ffd84a';
        g.beginPath(); g.arc(x, y, 3.6 * s, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#fff8e0';
        g.beginPath(); g.arc(x + Math.cos(p.ang) * s, y + Math.sin(p.ang) * s, 1.8 * s, 0, Math.PI * 2); g.fill();
      } else if (p.kind === 'blade') {
        g.globalCompositeOperation = 'lighter';
        crescent(x - Math.cos(p.ang) * 6, y - Math.sin(p.ang) * 6, 6, p.ang, 'rgba(160,240,255,0.35)', 1);
        g.globalCompositeOperation = 'source-over';
        crescent(x, y, 7, p.ang, '#e8fbff', 1);
        crescent(x, y, 5, p.ang, p.color, 0.7);
      } else if (p.kind === 'venom') {
        g.fillStyle = '#9dff5c';
        g.beginPath(); g.arc(x, y, 3.2, 0, Math.PI * 2); g.fill();
        g.globalAlpha = 0.5; g.beginPath(); g.arc(x - Math.cos(p.ang) * 5, y - Math.sin(p.ang) * 5, 2, 0, Math.PI * 2); g.fill();
        g.globalAlpha = 1;
      } else if (p.kind === 'rock') {
        g.globalCompositeOperation = 'lighter';
        glow(x, y, 30, '255,120,30', 0.7);
        g.globalCompositeOperation = 'source-over';
        g.fillStyle = '#6b4a35';
        g.beginPath(); g.arc(x, y, 12, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#8a6448';
        g.beginPath(); g.arc(x - 3, y - 3, 6, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#2b1a0e'; g.lineWidth = 1.5;
        g.beginPath(); g.arc(x, y, 12, 0, Math.PI * 2); g.stroke();
      } else if (p.kind === 'spike') {
        g.save(); g.translate(x, y); g.rotate(p.ang);
        g.fillStyle = '#fff4dc'; g.strokeStyle = '#2b1a0e'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(9, 0); g.lineTo(-7, -3); g.lineTo(-7, 3); g.closePath(); g.fill(); g.stroke();
        g.restore();
      }
    }
  }

  function drawGroundFx() {
    for (const f of B.fx) {
      if (f.t < 0) continue;
      const x = f.x - B.camX, q = f.t / f.dur;
      if (f.kind === 'field') {
        const a = Math.min(1, f.t * 4) * Math.min(1, (f.dur - f.t) * 2);
        const col = f.field === 'poison' ? '120,220,60' : '255,90,20';
        g.globalAlpha = 0.5 * a;
        const gr = g.createRadialGradient(x, f.y, 0, x, f.y, f.r);
        gr.addColorStop(0, `rgba(${col},0.9)`); gr.addColorStop(1, `rgba(${col},0)`);
        g.fillStyle = gr;
        g.beginPath(); g.ellipse(x, f.y, f.r, f.r * 0.45, 0, 0, Math.PI * 2); g.fill();
        g.globalAlpha = a;
        for (let i = 0; i < 9; i++) {
          const ang = i * 0.9 + f.t * (f.field === 'poison' ? 0.6 : 1.4);
          const fx = x + Math.cos(ang) * f.r * 0.6 * ((i % 3 + 1) / 3);
          const fy = f.y + Math.sin(ang) * f.r * 0.22 - 6;
          const fl = 0.8 + 0.25 * Math.sin(f.t * 12 + i);
          const rise = (f.t * 30 + i * 9) % 22;
          g.globalAlpha = a * 0.7;
          g.fillStyle = f.field === 'poison' ? '#9dff5c' : (i % 2 ? '#ffd84a' : '#ff6a1e');
          g.beginPath(); g.arc(fx, fy - rise, 3 * fl, 0, Math.PI * 2); g.fill();
        }
        g.globalAlpha = 1;
      } else if (f.kind === 'crater') {
        g.globalAlpha = Math.min(1, (f.dur - f.t) / 1.0) * 0.55;
        g.fillStyle = '#2a1a10';
        g.beginPath(); g.ellipse(x, f.y, 50, 13, 0, 0, Math.PI * 2); g.fill();
        g.globalAlpha = 1;
      } else if (f.kind === 'beam') {
        const a = Math.sin(Math.min(1, q) * Math.PI);
        g.strokeStyle = f.color; g.lineWidth = 2 * a;
        g.globalAlpha = a;
        g.beginPath(); g.ellipse(x, f.y, 16 + q * 14, 5 + q * 4, 0, 0, Math.PI * 2); g.stroke();
        g.globalAlpha = 1;
      } else if (f.kind === 'quake') {
        g.strokeStyle = `rgba(80,50,20,${1 - q})`; g.lineWidth = 2;
        g.beginPath(); g.ellipse(x, f.y, 20 + q * 90, 4 + q * 12, 0, 0, Math.PI * 2); g.stroke();
      }
    }
  }

  function drawFx() {
    for (const f of B.fx) {
      if (f.t < 0 || f.kind === 'timer' || f.kind === 'field' || f.kind === 'crater' || f.kind === 'quake') continue;
      const x = f.x - B.camX, q = Math.min(1, f.t / f.dur);
      switch (f.kind) {
        case 'beam': {
          const a = Math.sin(q * Math.PI);
          const w = (f.big ? 30 : 20) * (1 - q * 0.5);
          g.globalCompositeOperation = 'lighter';
          const gr = g.createLinearGradient(0, f.y - 160, 0, f.y);
          gr.addColorStop(0, 'rgba(255,255,255,0)');
          gr.addColorStop(1, f.color);
          g.globalAlpha = a * 0.45;
          g.fillStyle = gr;
          g.fillRect(x - w / 2, f.y - 160, w, 160);
          g.globalAlpha = 1;
          star(x, f.y - 26 - q * 26, 8 + 6 * a, B.time * 3, '#ffffff', a);
          g.globalCompositeOperation = 'source-over';
          break;
        }
        case 'egg': {
          const size = 18;
          if (q < 0.55) {
            const wob = Math.sin(f.t * 40) * 0.25 * (q / 0.55);
            const drop = q < 0.15 ? (1 - q / 0.15) * 60 : 0;
            drawIcon(ICON.lvEggUrl(f.lv), x, f.y - size * 0.55 - drop, size, wob);
          } else {
            const u = (q - 0.55) / 0.45;
            drawIcon(ICON.lvEggUrl(f.lv, true), x - u * 8, f.y - size * 0.55 + u * 4, size * 0.62, -u * 1.2, 1 - u);
            drawIcon(ICON.lvEggUrl(f.lv, true), x + u * 10, f.y - size * 0.7 - u * 6, size * 0.5, u * 1.5, 1 - u);
            if (f.bred) {
              for (let i = 0; i < 3; i++) {
                g.globalAlpha = 1 - u;
                g.fillStyle = '#ff7ab8';
                const hx = x + (i - 1) * 9, hy = f.y - 24 - u * 22 - i * 3;
                g.beginPath(); g.arc(hx - 2, hy, 2.4, 0, Math.PI * 2); g.arc(hx + 2, hy, 2.4, 0, Math.PI * 2);
                g.moveTo(hx - 4.3, hy + 0.8); g.lineTo(hx, hy + 5); g.lineTo(hx + 4.3, hy + 0.8); g.fill();
                g.globalAlpha = 1;
              }
            }
          }
          break;
        }
        case 'poof':
          puff(x, f.y - q * 10, (14 + q * 12) * f.s, 'rgba(225,210,180,0.7)', 1 - q);
          break;
        case 'dust':
          puff(x, f.y, 6 + q * 7, 'rgba(200,180,140,0.6)', 1 - q);
          break;
        case 'spark':
          g.globalCompositeOperation = 'lighter';
          star(x, f.y, (f.crit ? 11 : 7) * (0.6 + q), q * 2, '#fff6c0', 1 - q);
          g.globalCompositeOperation = 'source-over';
          break;
        case 'bite': {
          const col = f.enemy ? (f.violet ? '#c58bff' : '#ff6a5a') : f.crit ? '#ffd33d' : '#ffffff';
          g.strokeStyle = col; g.lineWidth = 2.2 * (1 - q) + 0.5; g.lineCap = 'round';
          g.globalAlpha = 1 - q;
          const r = 9 * f.s * (0.7 + q * 0.5);
          for (let i = -1; i <= 1; i++) {
            g.beginPath();
            g.arc(x + i * 3, f.y + i * 4, r, -2.2 + (f.enemy ? Math.PI : 0), -0.9 + (f.enemy ? Math.PI : 0));
            g.stroke();
          }
          g.globalAlpha = 1;
          break;
        }
        case 'slash':
          g.globalAlpha = 1 - q;
          crescent(x, f.y, 6 + q * 6, f.ang, '#ffffff', 1);
          g.globalAlpha = 1;
          break;
        case 'ember':
          g.globalCompositeOperation = 'lighter';
          glow(x, f.y - q * 4, (4 + q * 3) * f.s, f.dark ? '160,70,255' : '255,120,30', 0.6 * (1 - q));
          g.globalCompositeOperation = 'source-over';
          break;
        case 'fireboom': {
          g.globalCompositeOperation = 'lighter';
          glow(x, f.y, (10 + q * 18) * f.s, f.dark ? '170,80,255' : '255,150,50', 0.9 * (1 - q));
          glow(x, f.y, (5 + q * 8) * f.s, '255,255,220', 0.8 * (1 - q));
          g.globalCompositeOperation = 'source-over';
          break;
        }
        case 'splat':
          g.fillStyle = `rgba(150,255,90,${1 - q})`;
          for (let i = 0; i < 4; i++) { const a = i * 1.6; g.beginPath(); g.arc(x + Math.cos(a) * q * 8, f.y + Math.sin(a) * q * 6, 2 * (1 - q) + 0.5, 0, Math.PI * 2); g.fill(); }
          break;
        case 'drip':
          g.fillStyle = `rgba(200,20,20,${1 - q})`;
          g.beginPath(); g.ellipse(x, f.y + q * 10, 1.6, 2.4, 0, 0, Math.PI * 2); g.fill();
          break;
        case 'wind':
          g.strokeStyle = `rgba(230,245,255,${0.6 * (1 - q)})`; g.lineWidth = 1.2;
          g.beginPath(); g.moveTo(x - 10 - q * 6, f.y); g.lineTo(x + 4, f.y); g.stroke();
          break;
        case 'boom':
          g.globalCompositeOperation = 'lighter';
          glow(x, f.y - q * 6, 30 * f.s * (0.5 + q * 0.8), '255,150,50', 1 - q * q);
          glow(x, f.y - q * 6, 14 * f.s * (0.5 + q * 0.5), '255,240,200', 1 - q);
          g.globalCompositeOperation = 'source-over';
          break;
        case 'smoke':
          for (let i = 0; i < 4; i++) puff(x + (i - 1.5) * 10 * f.s, f.y - q * 18 - (i % 2) * 6, (14 + q * 14) * f.s, 'rgba(90,80,75,0.55)', (1 - q) * 0.8);
          break;
        case 'ring': {
          const r = (f.max || 120) * q;
          g.strokeStyle = `rgba(${f.color || '255,240,200'},${1 - q})`; g.lineWidth = 4 * (1 - q) + 1;
          g.beginPath(); g.ellipse(x, f.y, r, r * 0.3, 0, 0, Math.PI * 2); g.stroke();
          break;
        }
        case 'frost':
          star(x, f.y, 8 + q * 4, q, '#d8f6ff', 1 - q);
          break;
        case 'lance': {
          const lx = f.x - B.camX;
          g.globalCompositeOperation = 'lighter';
          const gr = g.createLinearGradient(lx - 80, 0, lx, 0);
          gr.addColorStop(0, 'rgba(120,210,255,0)'); gr.addColorStop(1, 'rgba(160,230,255,0.7)');
          g.fillStyle = gr; g.fillRect(lx - 80, f.y - 5, 80, 10);
          g.globalCompositeOperation = 'source-over';
          crescent(lx, f.y, 14, 0, '#e8fbff', 1);
          crescent(lx - 3, f.y, 10, 0, '#7fd6ff', 0.8);
          break;
        }
        case 'wave': {
          const wx = f.x - B.camX;
          const a = Math.min(1, (f.dur - f.t) * 3);
          for (let i = 0; i < 6; i++) {
            const yy = laneY0 - 10 + i * LANE_SP * 1.1;
            crescent(wx - (i % 2) * 8, yy, 13, B.time * 14 + i, 'rgba(200,255,245,0.9)', a);
            crescent(wx - (i % 2) * 8, yy, 9, B.time * 14 + i + 2, 'rgba(60,200,180,0.8)', a);
          }
          break;
        }
        case 'cloud': {
          const a = Math.min(1, f.t * 5, (f.dur - f.t) * 4);
          const flash = q < 0.85 && Math.sin(f.t * 30) > 0;
          for (let i = 0; i < 6; i++) puff(x + (i - 2.5) * 16, f.y + (i % 2) * 6, 22, flash ? 'rgba(200,190,255,0.95)' : 'rgba(90,85,120,0.95)', a);
          break;
        }
        case 'bolt': {
          g.strokeStyle = 'rgba(220,180,255,0.95)'; g.lineWidth = 3 * (1 - q) + 1;
          g.shadowColor = '#b46cff'; g.shadowBlur = 10;
          g.beginPath(); g.moveTo(x, f.top);
          for (let i = 1; i <= 7; i++) {
            const ny = lerp(f.top, f.y, i / 7);
            const nx = x + (i < 7 ? (hash(Math.floor(f.seed) + i) - 0.5) * 22 : 0);
            g.lineTo(nx, ny);
          }
          g.stroke();
          g.shadowBlur = 0;
          star(x, f.y, 12, q * 3, '#fff6a0', 1 - q);
          break;
        }
        case 'icon': {
          const s = q < 0.2 ? q / 0.2 * 1.2 : q < 0.3 ? 1.2 - (q - 0.2) : 1;
          drawIcon(f.icon, x, f.y - q * 16, f.size * s, 0, q > 0.7 ? (1 - q) / 0.3 : 1);
          break;
        }
        case 'rain': {
          const a = Math.min(1, f.t * 4, (f.dur - f.t) * 3);
          for (let i = 0; i < 5; i++) puff(x + (i - 2) * 22, f.y + (i % 2) * 5, 20, 'rgba(235,255,250,0.95)', a);
          g.strokeStyle = `rgba(120,255,190,${0.8 * a})`; g.lineWidth = 1.5;
          for (let i = 0; i < 14; i++) {
            const dx = (hash(i * 7) - 0.5) * 120, sp = (f.t * 160 + hash(i) * 60) % 80;
            g.beginPath(); g.moveTo(x + dx, f.y + 10 + sp); g.lineTo(x + dx - 2, f.y + 16 + sp); g.stroke();
          }
          break;
        }
        case 'heal':
          g.globalAlpha = 1 - q;
          g.fillStyle = '#7dff8a';
          g.fillRect(x - 1.2, f.y - q * 22 - 4, 2.4, 8);
          g.fillRect(x - 4, f.y - q * 22 - 1.2, 8, 2.4);
          g.globalAlpha = 1;
          break;
        case 'pillar': {
          const a = Math.min(1, f.t * 6) * (1 - Math.max(0, q - 0.6) / 0.4);
          const w = 26 + Math.sin(f.t * 30) * 3;
          g.globalCompositeOperation = 'lighter';
          const gr = g.createLinearGradient(0, 0, 0, f.y);
          gr.addColorStop(0, 'rgba(255,80,30,0)'); gr.addColorStop(0.5, `rgba(255,120,40,${0.8 * a})`); gr.addColorStop(1, `rgba(255,230,140,${a})`);
          g.fillStyle = gr; g.fillRect(x - w / 2, 0, w, f.y);
          glow(x, f.y - 8, 50, '255,160,60', 0.8 * a);
          g.globalCompositeOperation = 'source-over';
          break;
        }
      }
    }
  }

  function drawTexts() {
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    for (const t of B.texts) {
      const q = t.t / t.dur;
      const x = t.x - B.camX;
      let size = 10, color = '#ffffff', y = t.y - q * 22, font = FONT;
      if (t.kind === 'crit') { size = 14; color = '#ffd33d'; }
      else if (t.kind === 'skill') { size = 12; color = '#ffa13d'; }
      else if (t.kind === 'bleed') { size = 9; color = '#ff6a6a'; }
      else if (t.kind === 'ability') { size = 11; color = '#ffe9a8'; y = t.y - q * 16; }
      else if (t.kind === 'skillName') { size = 15; color = t.color; y = t.y - q * 14; font = FONT_B; }
      const pop = q < 0.12 ? 1 + (0.12 - q) * 4 : 1;
      g.globalAlpha = q > 0.7 ? (1 - q) / 0.3 : 1;
      g.font = `${Math.round(size * pop)}px ${font}`;
      g.lineWidth = 3;
      g.strokeStyle = 'rgba(30,15,10,0.9)';
      g.strokeText(t.text, x, y);
      g.fillStyle = color;
      g.fillText(t.text, x, y);
    }
    g.globalAlpha = 1;
  }

  function drawCoins() {
    for (const c of B.coins) drawIcon(ICON.url('meat'), c.x, c.y, 11, c.t * 6);
  }

  function drawBanner() {
    const b = B.banner;
    if (!b) return;
    const q = b.t / b.dur;
    const s = b.t < 0.18 ? 1.5 - b.t / 0.18 * 0.5 : 1;
    const a = q > 0.8 ? (1 - q) / 0.2 : 1;
    const y = Math.max(78, laneY0 - 74);
    g.save();
    g.globalAlpha = a;
    const gr = g.createLinearGradient(0, 0, VW, 0);
    gr.addColorStop(0, 'rgba(20,12,6,0)'); gr.addColorStop(0.25, 'rgba(20,12,6,0.55)');
    gr.addColorStop(0.75, 'rgba(20,12,6,0.55)'); gr.addColorStop(1, 'rgba(20,12,6,0)');
    g.fillStyle = gr;
    g.fillRect(0, y - 26, VW, b.sub ? 58 : 46);
    g.translate(VW / 2, y);
    g.scale(s, s);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    g.font = `28px ${FONT_B}`;
    g.lineWidth = 6; g.strokeStyle = '#2a1408';
    g.strokeText(b.text, 0, 0);
    g.fillStyle = b.color;
    g.fillText(b.text, 0, 0);
    if (b.sub) {
      g.font = `12px ${FONT}`;
      g.lineWidth = 3;
      g.strokeText(b.sub, 0, 22);
      g.fillStyle = '#fff';
      g.fillText(b.sub, 0, 22);
    }
    g.restore();
  }

  function draw() {
    g.setTransform(dpr * k, 0, 0, dpr * k, 0, 0);
    g.imageSmoothingQuality = 'high';
    g.save();
    if (B.shake > 0) g.translate(rnd(-1, 1) * B.shake, rnd(-1, 1) * B.shake * 0.6);
    Backdrop.draw(g, B.chapter == null ? 0 : B.chapter, B.camX, B.time, VW, VH, groundY);
    drawGroundFx();
    drawUnits();
    drawProjs();
    drawFx();
    drawTexts();
    g.restore();
    drawCoins();
    if (B.flash) {
      g.fillStyle = B.flash.color + (0.45 * (1 - B.flash.t / B.flash.dur)) + ')';
      g.fillRect(0, 0, VW, VH);
    }
    if (B.chapterFade > 0) {
      g.fillStyle = B.raid ? `rgba(20,0,40,${B.chapterFade})` : `rgba(255,250,235,${B.chapterFade})`;
      g.fillRect(0, 0, VW, VH);
    }
    drawBanner();
  }

  // ---------- public ----------
  function startStage(stage) {
    B.stage = stage; B.wave = 0; B.waveActive = false; B.pending = true; B.pendT = 1.0;
    B.enemies = []; B.projs = []; B.boss = null;
  }

  function armySnapshot() {
    return B.units.map((u) => ({ ...u.r, h: Math.round(u.hp / u.maxHp * 100) / 100, l: u.lane }));
  }

  function restoreArmy(list) {
    B.units = [];
    for (let l = 0; l < LANES; l++) B.lanes[l] = [];
    for (const r of list) {
      const rec = { ...r };
      const hp = rec.h, lane = rec.l;
      delete rec.h; delete rec.l;
      if (SPECIES[rec.sp]) addDino(rec, { hp: Math.max(0.2, hp || 1), lane, quiet: true });
    }
  }

  const units = () => B.units;
  const unitAt = (lane, rank) => B.lanes[lane].find((u) => u.rank === rank) || null;
  const unitById = (id) => B.units.find((u) => u.id === id) || null;

  return {
    B, init, resize, update, draw, addDino, removeUnit, refreshStats, castSkill, startStage, mergeAll, mergePair, mergeCount,
    armySnapshot, restoreArmy, aliveCount, units, unitAt, unitById, toVirtual, setBanner, startRaid, calcStats,
    get VH() { return VH; },
  };
})();
