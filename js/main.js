'use strict';
// Game state, economy, genetics, breeding nest, raid, save/load and the main loop.

const Game = (() => {
  const SAVE_KEY = 'dino-legion-save-v1';
  const sfx = (n, v, r) => Engine.Sfx.play(n, v, r);

  function defaults() {
    return {
      v: 1, meat: 300, amber: 500, stage: 0, maxStage: 0,
      upg: Object.fromEntries(UPGRADES.map((u) => [u.id, 0])),
      recruit: { lv: 0, xp: 0 },
      skills: { meteor: { lv: 1, n: 0 } },
      equip: ['meteor', null, null, null, null, null],
      auto: true, farm: false, army: null,
      nest: Array.from({ length: NEST_SLOTS }, () => ({ m: null, f: null })),
      nextId: 1,
      raid: { lv: 1, tickets: RAID.maxTickets, at: Date.now(), wins: 0 },
      quest: { i: 0, base: 0 },
      stats: { kills: 0, summons: 0, upgrades: 0, skillSummons: 0, bosses: 0, deaths: 0, merges: 0, bred: 0, raids: 0 },
      cheat: { inf: false },
      lastSeen: Date.now(), sound: true, speed: 1, tut: 0,
    };
  }

  const S = defaults();
  const mods = {};
  const herd = { pack: 0, meat: 0, egg: 0 };

  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const d = JSON.parse(raw);
      const base = defaults();
      Object.assign(S, base, d);
      for (const key of ['upg', 'stats', 'recruit', 'quest', 'raid', 'cheat']) S[key] = Object.assign(base[key], d[key]);
      while (S.equip.length < 6) S.equip.push(null);
      if (!Array.isArray(S.nest)) S.nest = base.nest;
      while (S.nest.length < NEST_SLOTS) S.nest.push({ m: null, f: null });
      return true;
    } catch (e) { return false; }
  }

  let resetting = false;
  function save() {
    if (resetting || !booted) return;
    S.army = Battle.armySnapshot();
    S.stage = Battle.B.raid ? Battle.B.raid.stage : Battle.B.stage;
    S.lastSeen = Date.now();
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* storage unavailable */ }
  }

  function reset() {
    resetting = true;
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
    location.reload();
  }

  // ---------- currencies (the infinite cheat skips every deduction) ----------
  const infinite = () => !!S.cheat.inf;
  const canPay = (cur, n) => infinite() || S[cur] >= n;
  function pay(cur, n) {
    if (infinite()) return true;
    if (S[cur] < n) return false;
    S[cur] -= n;
    return true;
  }
  function setInfinite(on) {
    S.cheat.inf = !!on;
    if (on) { refillTickets(); }
    save();
  }

  function recalc() {
    for (const u of UPGRADES) mods[u.id] = u.val(S.upg[u.id] || 0);
    if (booted) Battle.refreshStats();
  }

  // Formation-wide trait auras.
  function armyChanged() {
    herd.pack = 0; herd.meat = 0; herd.egg = 0;
    for (const u of Battle.units()) {
      for (const [k, l] of u.r.tr) {
        if (k === 'pack') herd.pack += traitV(k, l);
        else if (k === 'glut') herd.meat += traitV(k, l);
        else if (k === 'egg') herd.egg += traitV(k, l);
      }
    }
    herd.pack = Math.min(herd.pack, 0.6);
    herd.egg = Math.min(herd.egg, 0.5);
    Battle.refreshStats();
    UI.markArmy();
  }

  // ---------- dinosaur records ----------
  const newId = () => S.nextId++;
  const randSex = () => (Math.random() < 0.5 ? 'm' : 'f');
  const randHue = () => 15 * (2 + Math.floor(Math.random() * 21));

  function rollLevel() {
    return pickWeighted(RECRUIT_ODDS[Math.min(S.recruit.lv, RECRUIT_ODDS.length - 1)]) + 1;
  }

  function rollTraitLevel(lv) {
    if (lv >= 5 && Math.random() < 0.15) return 3;
    if (lv >= 3 && Math.random() < 0.3) return 2;
    return 1;
  }

  function rollTraits(lv) {
    const n = pickWeighted([45, 40, 15]);
    const keys = TRAIT_IDS.filter((k) => k !== 'fire').sort(() => Math.random() - 0.5).slice(0, n);
    const tr = keys.map((k) => [k, rollTraitLevel(lv)]);
    if (Math.random() < 0.2) tr.push(['fire', rollTraitLevel(lv)]);
    return tr;
  }

  function randomRecord(lv, opt = {}) {
    lv = lv || rollLevel();
    const sp = opt.sp != null ? opt.sp : Math.floor(Math.random() * SP_COUNT);
    return {
      id: newId(), sp, sp2: sp, lv, sex: opt.sex || randSex(), hue: Math.random() < 0.07 ? randHue() : 0,
      tr: opt.tr || rollTraits(lv), gen: 1, pa: '', lock: false,
    };
  }

  const cap = (list) => list.sort((a, b) => b[1] - a[1] || (b[0] === 'fire') - (a[0] === 'fire')).slice(0, TRAIT_CAP);

  // Every trait of both, the higher level wins; equal levels may rank up.
  function unionTraits(a, b, upChance) {
    const m = new Map();
    for (const [k, l] of a) m.set(k, [l, 0]);
    for (const [k, l] of b) { const o = m.get(k) || [0, 0]; o[1] = l; m.set(k, o); }
    const out = [];
    for (const [k, [la, lb]] of m) {
      let l = Math.max(la, lb);
      if (la && la === lb && l < 3 && Math.random() < upChance) l++;
      out.push([k, l]);
    }
    return cap(out);
  }

  // Each parent's trait has a 50% chance; traits both parents carry are kept and fused one level up.
  function mixTraits(a, b) {
    const m = new Map();
    for (const [k, l] of a) m.set(k, [l, 0]);
    for (const [k, l] of b) { const o = m.get(k) || [0, 0]; o[1] = l; m.set(k, o); }
    const out = [];
    for (const [k, [la, lb]] of m) {
      if (la && lb) out.push([k, Math.min(3, Math.max(la, lb) + 1)]);
      else if (Math.random() < 0.5) out.push([k, la || lb]);
    }
    return cap(out);
  }

  // Dino Nest's MixHue: average on the colour wheel with a little drift.
  function mixHue(h1, h2) {
    const a = h1 * Math.PI / 180, b = h2 * Math.PI / 180;
    const x = Math.cos(a) + Math.cos(b), y = Math.sin(a) + Math.sin(b);
    let h = x * x + y * y < 1e-6 ? h1 : Math.atan2(y, x) * 180 / Math.PI;
    if (Math.random() < 0.25) h += Math.random() < 0.5 ? -15 : 15;
    const q = Math.round(h / 15) * 15;
    return ((q % 360) + 360) % 360;
  }

  function breed(dad, mom) {
    const mode = BREED_MODES[pickWeighted(BREED_MODES.map((m) => m.p))];
    let sp, sp2, hue, tr;
    if (mode.id === 'father' || mode.id === 'mother') {
      const p = mode.id === 'father' ? dad : mom;
      sp = p.sp; sp2 = p.sp2; hue = p.hue; tr = p.tr.map((t) => [...t]);
    } else if (mode.id === 'both') {
      const p = Math.random() < 0.5 ? dad : mom;
      sp = p.sp; sp2 = p.sp2; hue = mixHue(dad.hue, mom.hue);
      tr = unionTraits(dad.tr, mom.tr, 0.35);
    } else {
      const body = Math.random() < 0.5 ? dad : mom;
      const other = body === dad ? mom : dad;
      sp = body.sp;
      sp2 = other.sp !== sp ? other.sp : other.sp2 !== sp ? other.sp2 : body.sp2;
      hue = mixHue(dad.hue, mom.hue);
      tr = mixTraits(dad.tr, mom.tr);
    }
    let mutated = null;
    if (Math.random() < MUTATION) {
      const fresh = TRAIT_IDS.filter((k) => !tr.some((t) => t[0] === k));
      mutated = fresh[Math.floor(Math.random() * fresh.length)];
      if (tr.length >= TRAIT_CAP) tr[tr.length - 1] = [mutated, 1]; else tr.push([mutated, 1]);
      hue = randHue();
    }
    // Strong parents pass on at least half of their average level.
    const lv = Math.max(rollLevel(), Math.floor((dad.lv + mom.lv) / 4));
    const rec = {
      id: newId(), sp, sp2, lv, sex: randSex(), hue, tr, gen: Math.max(dad.gen, mom.gen) + 1,
      pa: `${dinoShort(dad)}♂ × ${dinoShort(mom)}♀`, lock: false,
    };
    return { rec, mode, mutated };
  }

  function mergedRecord(a, b) {
    return {
      id: a.id, sp: a.sp, sp2: a.sp2, lv: a.lv + 1, sex: a.sex, hue: a.hue,
      tr: unionTraits(a.tr, b.tr, 0), gen: Math.max(a.gen, b.gen), pa: a.pa, lock: a.lock || b.lock,
    };
  }

  // ---------- hatching ----------
  const summonCost = () => F.summonCost(Battle.B.stage);

  // The nest picks one of its six slots: a full pair lays its own egg, an empty slot a wild one.
  function rollHatch() {
    const slot = Math.floor(Math.random() * NEST_SLOTS);
    const pair = S.nest[slot];
    let res;
    if (pair.m && pair.f) {
      const b = breed(pair.m, pair.f);
      res = { rec: b.rec, slot, bred: true, mode: b.mode, mutated: b.mutated };
    } else res = { rec: randomRecord(), slot, bred: false };
    if (herd.egg && Math.random() < herd.egg) { res.rec.lv++; res.eggBonus = true; }
    return res;
  }

  function addRecruitXp(n) {
    const R = S.recruit;
    R.xp += n;
    while (R.lv < RECRUIT_XP.length && R.xp >= RECRUIT_XP[R.lv]) {
      R.xp -= RECRUIT_XP[R.lv];
      R.lv++;
      UI.toast(`둥지 레벨 업! <b>Lv.${R.lv + 1}</b> — 높은 레벨 알 확률 상승`, 'big', LV_COLORS[2]);
      sfx('reveal', 0.6);
    }
    if (R.lv >= RECRUIT_XP.length) R.xp = 0;
  }

  function hatchOne(quiet) {
    if (Battle.B.state === 'wipe') return null;
    if (Battle.aliveCount() >= SLOTS) {
      if (!quiet) { UI.toast('방진이 가득 찼습니다 — 합성하거나 둥지로 보내세요'); sfx('deny', 0.5); }
      return null;
    }
    const cost = summonCost();
    if (!pay('meat', cost)) {
      if (!quiet) { UI.toast('고기가 부족합니다'); sfx('deny', 0.5); }
      return null;
    }
    const res = rollHatch();
    const u = Battle.addDino(res.rec, { drop: true, bred: res.bred });
    S.stats.summons++;
    if (res.bred) S.stats.bred++;
    S.tut = 1;
    addRecruitXp(1);
    UI.hatchToast(res);
    sfx('hatch' + Math.min(5, 2 + res.rec.lv), res.rec.lv >= 4 ? 0.7 : 0.45);
    return u;
  }

  function hatchFill() {
    const cost = summonCost();
    const list = [];
    while (Battle.aliveCount() < SLOTS && canPay('meat', cost) && Battle.B.state !== 'wipe') {
      pay('meat', cost);
      const res = rollHatch();
      Battle.addDino(res.rec, { drop: true, bred: res.bred, quiet: true });
      list.push(res);
      S.stats.summons++;
      if (res.bred) S.stats.bred++;
      addRecruitXp(1);
    }
    if (!list.length) {
      UI.toast(Battle.aliveCount() >= SLOTS ? '방진이 가득 찼습니다' : '고기가 부족합니다');
      sfx('deny', 0.5);
      return;
    }
    armyChanged();
    S.tut = 1;
    UI.showFillResults(list);
    sfx('hatch5', 0.6);
  }

  function merge() {
    if (Battle.B.state === 'wipe') return [];
    const made = Battle.mergeAll();
    if (!made.length) {
      UI.toast('같은 레벨 공룡 2마리가 있어야 합성할 수 있습니다');
      sfx('deny', 0.5);
      return made;
    }
    S.stats.merges += made.length;
    const top = Math.max(...made.map((u) => u.r.lv));
    UI.toast(`합성 ${made.length}회 완료! 최고 <b style="color:${lvColor(top)}">Lv.${top}</b> · 빈자리 ${SLOTS - Battle.aliveCount()}칸`, 'big', lvColor(top));
    sfx('merge' + Math.min(14, top), 0.7);
    return made;
  }

  function mergeTwo(a, b) {
    if (Battle.B.state === 'wipe') return null;
    if (!a || !b || a === b) return null;
    if (a.r.lv !== b.r.lv) { UI.toast('같은 레벨끼리만 합성할 수 있습니다'); sfx('deny', 0.5); return null; }
    const u = Battle.mergePair(a, b);
    if (u) {
      S.stats.merges++;
      UI.toast(`합성! <b style="color:${lvColor(u.r.lv)}">Lv.${u.r.lv}</b> ${dinoName(u.r)} ${sexMark(u.r.sex)}`, 'big', lvColor(u.r.lv));
      sfx('merge' + Math.min(14, u.r.lv), 0.7);
    }
    return u;
  }

  // ---------- breeding nest ----------
  // Putting a dinosaur in the nest takes it out of the formation; the previous occupant returns.
  function nestPut(slot, sex, unitId) {
    const u = Battle.unitById(unitId);
    if (!u || u.r.sex !== sex) return false;
    const pair = S.nest[slot];
    const prev = pair[sex];
    const rec = Battle.removeUnit(u);
    pair[sex] = rec;
    if (prev) Battle.addDino(prev, {});
    sfx('drop', 0.6);
    save();
    return true;
  }

  function nestTake(slot, sex) {
    const pair = S.nest[slot];
    const rec = pair[sex];
    if (!rec) return false;
    if (Battle.aliveCount() >= SLOTS) { UI.toast('방진이 가득 찼습니다'); sfx('deny', 0.5); return false; }
    pair[sex] = null;
    Battle.addDino(rec, {});
    sfx('drop', 0.6);
    save();
    return true;
  }

  const nestPairs = () => S.nest.filter((p) => p.m && p.f).length;

  // ---------- skills ----------
  const unlockedSlots = () => SKILL_SLOT_UNLOCK.filter((v) => S.maxStage >= v).length;

  function skillSummon(n) {
    const cost = n === 10 ? SKILL_COST.ten : SKILL_COST.one * n;
    if (!pay('amber', cost)) { UI.toast('호박석이 부족합니다'); sfx('deny', 0.5); return; }
    const res = [];
    for (let i = 0; i < n; i++) {
      const grade = pickWeighted(SKILL_ODDS);
      const pool = SKILLS.filter((s) => s.grade === grade);
      const sk = pool[Math.floor(Math.random() * pool.length)];
      const own = S.skills[sk.id];
      if (own) { own.n++; res.push({ sk, isNew: false }); }
      else {
        S.skills[sk.id] = { lv: 1, n: 0 };
        res.push({ sk, isNew: true });
        const free = S.equip.findIndex((e, j) => !e && j < unlockedSlots());
        if (free >= 0) S.equip[free] = sk.id;
      }
    }
    S.stats.skillSummons += n;
    UI.showSkillResults(res);
    sfx('reveal', 0.5);
  }

  function levelSkill(id) {
    const o = S.skills[id];
    if (!o || o.lv >= SKILL_MAX_LV) return false;
    const need = F.skillNeed(o.lv);
    if (o.n < need) return false;
    o.n -= need;
    o.lv++;
    return true;
  }

  function levelAllSkills() {
    let any = false;
    for (const id in S.skills) while (levelSkill(id)) any = true;
    return any;
  }

  function toggleEquip(id) {
    const i = S.equip.indexOf(id);
    if (i >= 0) { S.equip[i] = null; return 'off'; }
    const free = S.equip.findIndex((e, j) => !e && j < unlockedSlots());
    if (free < 0) return 'full';
    S.equip[free] = id;
    return 'on';
  }

  // ---------- upgrades ----------
  function upgradeQuote(u, n) {
    let lv = S.upg[u.id] || 0;
    const max = u.max != null ? u.max : Infinity;
    let total = 0, count = 0;
    if (n === 'max') {
      const budget = infinite() ? Infinity : S.meat;
      while (lv < max && count < (infinite() ? 100 : Infinity)) {
        const c = F.upgradeCost(u, lv);
        if (total + c > budget) break;
        total += c; lv++; count++;
      }
      if (!count && lv < max) return { total: F.upgradeCost(u, lv), count: 0 };
    } else {
      for (let i = 0; i < n && lv < max; i++) { total += F.upgradeCost(u, lv); lv++; count++; }
    }
    return { total, count };
  }

  function buyUpgrade(id, n) {
    const u = UPGRADE_BY_ID[id];
    const { total, count } = upgradeQuote(u, n);
    if (!count || !pay('meat', total)) { sfx('deny', 0.4); return false; }
    S.upg[id] += count;
    S.stats.upgrades += count;
    recalc();
    sfx('level', 0.5, 1 + Math.random() * 0.1);
    return true;
  }

  // ---------- battle events ----------
  function onEnemyKilled(e) {
    S.meat += F.goldPerKill(Battle.B.stage) * e.T.gold * mods.gold * (1 + herd.meat);
    S.stats.kills++;
    if (e.T.boss) S.stats.bosses++;
  }

  function onDinoDied() {
    S.stats.deaths++;
    armyChanged();
    UI.bumpBadge();
  }

  // Returns the amber awarded (first clears pay full, repeats a fifth).
  function onStageCleared(stage) {
    const before = unlockedSlots();
    const first = stage + 1 > S.maxStage;
    if (first) S.maxStage = stage + 1;
    const amber = first ? F.stageGems(stage) : Math.floor(F.stageGems(stage) / 5);
    S.amber += amber;
    if (unlockedSlots() > before) UI.toast('스킬 슬롯이 열렸습니다!', 'big', LV_COLORS[4]);
    save();
    return amber;
  }

  function onWipe(raid) {
    const B = Battle.B;
    if (!raid) {
      if (B.stage > 0) B.stage--;
      S.farm = true;
    }
    const n = Math.min(12, SLOTS - Battle.aliveCount());
    for (let i = 0; i < n; i++) Battle.addDino(randomRecord(1, { tr: i % 4 === 3 ? [['fire', 1]] : [] }), { drop: true, quiet: true });
    armyChanged();
    UI.toast(`긴급 소집! 야생 Lv.1 공룡 ${n}마리 합류` + (raid ? '' : ` · ${F.stageLabel(B.stage)} 반복 사냥`), 'big', LV_COLORS[0]);
    save();
  }

  function challenge() {
    if (!S.farm || Battle.B.raid) return;
    S.farm = false;
    Battle.startStage(Math.min(S.maxStage, Battle.B.stage + 1));
    UI.toast('우두머리 도전! 진격합니다', 'big', LV_COLORS[0]);
    sfx('roar', 0.7, 0.9);
  }

  let coinSfxT = 0;
  function coinArrived() {
    if (coinSfxT <= 0) { sfx('coin', 0.35, 1 + Math.random() * 0.2); coinSfxT = 0.08; }
    UI.pulseGold();
  }

  // ---------- raid ----------
  function refillTickets() {
    const R = S.raid;
    const step = RAID.ticketSecs * 1000;
    if (R.tickets >= RAID.maxTickets) { R.at = Date.now(); return; }
    const gained = Math.floor((Date.now() - R.at) / step);
    if (gained > 0) {
      R.tickets = Math.min(RAID.maxTickets, R.tickets + gained);
      R.at = R.tickets >= RAID.maxTickets ? Date.now() : R.at + gained * step;
    }
  }

  function raidStatus() {
    refillTickets();
    const R = S.raid;
    const next = R.tickets >= RAID.maxTickets ? 0 : Math.max(0, R.at + RAID.ticketSecs * 1000 - Date.now());
    return { lv: R.lv, tickets: infinite() ? Infinity : R.tickets, next, active: !!Battle.B.raid };
  }

  function startRaid() {
    if (Battle.B.raid) return false;
    if (Battle.B.state === 'wipe' || !Battle.aliveCount()) { UI.toast('공룡이 있어야 도전할 수 있습니다'); sfx('deny', 0.5); return false; }
    refillTickets();
    if (!infinite()) {
      if (S.raid.tickets <= 0) { UI.toast('레이드 입장권이 없습니다'); sfx('deny', 0.5); return false; }
      if (S.raid.tickets >= RAID.maxTickets) S.raid.at = Date.now();
      S.raid.tickets--;
    }
    S.stats.raids++;
    Battle.startRaid(S.raid.lv);
    save();
    return true;
  }

  function onRaidEnd(r) {
    let amber, meat;
    if (r.won) {
      amber = RAID.amber(r.lv);
      meat = RAID.meat(r.lv, S.maxStage);
      S.raid.lv++;
      S.raid.wins++;
    } else {
      amber = Math.floor(RAID.amber(r.lv) * 0.4 * r.frac);
      meat = RAID.meat(r.lv, S.maxStage) * 0.4 * r.frac;
    }
    S.amber += amber;
    S.meat += meat;
    UI.raidResult({ ...r, amber, meat });
    save();
  }

  // ---------- quests ----------
  function questState() {
    const def = questDef(S.quest.i);
    const cur = def.kind.stat === 'stage' ? S.maxStage + 1 : S.stats[def.kind.stat] - S.quest.base;
    return { def, cur: Math.max(0, Math.min(cur, def.target)), done: cur >= def.target };
  }

  function claimQuest() {
    const q = questState();
    if (!q.done) { UI.toast('퀘스트: ' + q.def.kind.text(q.def.target)); return false; }
    S.amber += q.def.reward;
    S.quest.i++;
    const next = questDef(S.quest.i);
    S.quest.base = next.kind.stat === 'stage' ? 0 : S.stats[next.kind.stat];
    UI.toast(`퀘스트 완료! ${ICON.html('amber', 'tw')} +${q.def.reward}`, 'big', LV_COLORS[1]);
    sfx('clear', 0.7);
    return true;
  }

  // ---------- misc ----------
  function unitPower(u) {
    const st = u.st;
    const dps = (st.atk / st.interval) * (1 + (mods.crit + st.crit) * (mods.critDmg + st.critDmg - 1));
    return dps * 6 * mods.aspd + u.maxHp * 0.5;
  }

  function power() {
    let p = 0;
    for (const u of Battle.units()) p += unitPower(u);
    for (const id of S.equip) if (id && S.skills[id]) p += (SKILL_BY_ID[id].grade + 1) * 60 * S.skills[id].lv * mods.skill * mods.atk;
    return p;
  }

  function starterArmy() {
    // Melee wall up front, two fire-breathers and the raptors/pteranodon in the rear.
    const plan = [
      [0, 'm'], [5, 'f'], [3, 'm'], [9, 'f'], [4, 'm'], [2, 'f'], [1, 'm'], [5, 'm'], [0, 'f'], [3, 'f'],
      [8, 'm'], [8, 'f'], [6, 'm'], [6, 'f'], [7, 'm'], [9, 'm', [['fire', 1]]], [5, 'f', [['fire', 1]]], [2, 'm'],
    ];
    plan.forEach(([sp, sex, tr], i) => {
      Battle.addDino(randomRecord(i % 7 === 0 ? 2 : 1, { sp, sex, tr: tr || (i % 3 === 0 ? [[TRAIT_IDS[1 + (i % 12)], 1]] : []) }), { quiet: true });
    });
  }

  function offline() {
    const secs = (Date.now() - S.lastSeen) / 1000;
    if (secs < 120) return;
    const capped = Math.min(secs, 8 * 3600);
    const meat = F.goldPerKill(S.stage) * mods.gold * 10 * (capped / 60) * 0.5;
    S.lastSeen = Date.now();
    UI.offlinePopup(capped, meat, () => { S.meat += meat; });
  }

  // ---------- loop ----------
  let last = 0, saveT = 0, booted = false;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    coinSfxT -= dt;
    // Each stage is guarded on its own so a drawing glitch never freezes the HUD.
    for (const step of [() => { for (let i = 0; i < S.speed; i++) Battle.update(dt); }, () => Battle.draw(), () => UI.tick(dt)]) {
      try { step(); } catch (e) {
        if (!frame.reported) {
          frame.reported = true;
          console.error(e);
          document.documentElement.dataset.err = String(e && e.stack || e).slice(0, 300);
        }
      }
    }
    saveT += dt;
    if (saveT > 10) { saveT = 0; save(); }
  }

  async function boot() {
    const bar = document.querySelector('#loading .lbar i');
    const list = [...new Set([...Engine.sheetUrls(), ...ICON.allUrls()])];
    let done = 0;
    await Engine.loadAll(list, () => { done++; bar.style.width = (done / list.length * 100) + '%'; });
    try {
      await Promise.race([Promise.all([document.fonts.load('16px "Jua"'), document.fonts.load('16px "Black Han Sans"')]), new Promise((r) => setTimeout(r, 2500))]);
    } catch (e) { /* fonts optional */ }

    const loaded = load();
    Engine.Sfx.on = S.sound;
    recalc();
    Battle.init(document.getElementById('cv'));
    Engine.prewarm();
    if (loaded && S.army) Battle.restoreArmy(S.army);
    if (!Battle.aliveCount() && !loaded) starterArmy();
    booted = true;
    armyChanged();
    Battle.startStage(S.stage);
    UI.init();
    if (loaded) offline();
    document.getElementById('loading').classList.add('gone');

    const unlock = () => Engine.Sfx.unlock();
    window.addEventListener('pointerdown', unlock, { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { save(); return; }
      last = performance.now();
      if (document.getElementById('modal').hidden) offline();
    });
    window.addEventListener('pagehide', save);
    last = performance.now();
    requestAnimationFrame(frame);
  }

  return {
    S, mods, herd, boot, save, reset, summonCost, hatchOne, hatchFill, merge, mergeTwo, mergedRecord,
    nestPut, nestTake, nestPairs, skillSummon, levelSkill, levelAllSkills, toggleEquip, unlockedSlots,
    upgradeQuote, buyUpgrade, onEnemyKilled, onDinoDied, onStageCleared, onWipe, challenge, coinArrived,
    questState, claimQuest, power, unitPower, armyChanged, canPay, infinite, setInfinite,
    raidStatus, startRaid, onRaidEnd,
  };
})();

// Boot through the artifact viewer's hot-update hook when present (progress itself lives in localStorage).
try { if (window.claude && window.claude.hot && window.claude.hot.snapshot) window.claude.hot.snapshot(() => { Game.save(); return {}; }); } catch (e) { /* optional */ }
if (window.claude && window.claude.hot && window.claude.hot.ready) window.claude.hot.ready(() => Game.boot());
else Game.boot();
