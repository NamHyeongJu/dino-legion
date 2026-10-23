'use strict';
// DOM interface: top bar, battle HUD, action bar, tab panels, breeding nest, raid, options.

const UI = (() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const el = (tag, cls, html) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  };
  const sfx = (n, v, r) => Engine.Sfx.play(n, v, r);
  const MEAT = () => ICON.html('meat');
  const AMBER = () => ICON.html('amber');
  const lvTag = (lv, cls = '') => `<span class="lvb ${cls}" style="--lc:${lvColor(lv)}">Lv.${lv}</span>`;
  const sexTag = (s) => `<span class="sex ${s}">${sexMark(s)}</span>`;
  const traitChip = (k, l) => `<span class="tchip" style="--tc:${TRAITS[k].color}">${TRAITS[k].name} ${ROMAN[l]}</span>`;
  const lookOf = (r) => ({ sp: r.sp, hue: r.hue });
  const money = (cur) => (Game.infinite() ? '∞' : fmt(Game.S[cur]));

  let tab = 'upgrade';
  let mult = 1;
  let acc = 0;
  let slowAcc = 0;
  let lastEquipSig = '';
  let selectedId = 0;
  let armyDirty = true;
  let laidSlot = -1, laidT = 0;

  // ---------- helpers ----------
  function setText(node, v) {
    if (node && node._v !== v) { node._v = v; node.textContent = v; }
  }

  // Tap fires on release; holding repeats; moving the finger (scrolling) cancels.
  function holdRepeat(btn, fn) {
    let t1 = 0, t2 = 0, sx = 0, sy = 0, active = false, repeated = false;
    const stop = () => { clearTimeout(t1); clearInterval(t2); active = false; };
    btn.addEventListener('pointerdown', (ev) => {
      Engine.Sfx.unlock();
      stop();
      active = true; repeated = false; sx = ev.clientX; sy = ev.clientY;
      t1 = setTimeout(() => {
        if (!active) return;
        repeated = true;
        if (fn(false) === false) { stop(); return; }
        t2 = setInterval(() => { if (fn(true) === false) stop(); }, 120);
      }, 420);
    });
    btn.addEventListener('pointermove', (ev) => {
      if (active && !repeated && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 12) stop();
    });
    btn.addEventListener('pointerup', () => { if (active && !repeated) fn(false); stop(); });
    btn.addEventListener('pointercancel', stop);
    btn.addEventListener('pointerleave', stop);
    btn.addEventListener('contextmenu', (ev) => ev.preventDefault());
  }

  function tap(node, fn) {
    node.addEventListener('click', (ev) => { Engine.Sfx.unlock(); fn(ev); });
  }

  // ---------- toasts ----------
  function toast(text, kind = '', color) {
    const box = $('#toasts');
    const t = el('div', 'toast ' + kind, text);
    if (color) t.style.setProperty('--gc', color);
    box.prepend(t);
    while (box.children.length > 3) box.lastChild.remove();
    setTimeout(() => t.classList.add('out'), 2000);
    setTimeout(() => t.remove(), 2400);
  }

  function hatchToast(res) {
    const r = res.rec;
    const egg = `<img class="tw" src="${ICON.lvEggUrl(r.lv)}" alt="">`;
    const who = `${lvTag(r.lv)} ${dinoName(r)} ${sexTag(r.sex)}`;
    let msg;
    if (res.bred) {
      msg = `${egg}둥지 ${res.slot + 1} <b class="pink">♥</b> ${who} <span class="mode">${res.mode.name}${res.mutated ? ' · 돌연변이!' : ''}</span>`;
    } else msg = `${egg}둥지 ${res.slot + 1} 야생 알 → ${who}`;
    if (res.eggBonus) msg += ' <span class="mode">알 수집가 +1</span>';
    toast(msg, res.bred || r.lv >= 4 ? 'big' : '', res.bred ? '#ff7ab8' : lvColor(r.lv));
    laidSlot = res.slot; laidT = 1.2;
    armyDirty = true;
  }

  // ---------- modal ----------
  function openModal(html, opts = {}) {
    const m = $('#modal');
    m.innerHTML = `<div class="sheet ${opts.cls || ''}">${opts.noClose ? '' : '<button class="xbtn" aria-label="닫기">✕</button>'}${html}</div>`;
    m.hidden = false;
    m.onclick = (ev) => { if (ev.target === m && !opts.locked) closeModal(); };
    const x = $('.xbtn', m);
    if (x) tap(x, () => { sfx('close', 0.5); closeModal(); });
    sfx('open', 0.4);
    return m.firstChild;
  }
  function closeModal() { const m = $('#modal'); m.hidden = true; m.innerHTML = ''; }

  // ---------- build ----------
  function init() {
    $('#iconMeat').src = ICON.url('meat');
    $('#iconAmber').src = ICON.url('amber');
    $('#iconMeat2').src = ICON.url('meat');
    $('#iconPower').src = ICON.url('crown');
    $('#btnMenu img').src = ICON.url('gear');
    $('#armyBox img').src = ICON.url('foot');
    $('#btnRaid img').src = ICON.url('skull');
    $('#questReward').previousElementSibling.src = ICON.url('amber');
    $$('#nav img').forEach((im) => { im.src = ICON.url(im.dataset.icon); });
    Engine.portrait($('#avatar'), { sp: 0, hue: 0 }, { pad: 0 });

    buildActionBar();
    buildUpgradeTab();
    buildArmyTab();
    buildSkillTab();
    buildSummonTab();
    buildHud();

    for (const b of $$('#nav button')) tap(b, () => { sfx('click', 0.5); switchTab(b.dataset.tab); });
    switchTab('upgrade');

    tap($('#btnMenu'), openOptions);
    tap($('#btnRaid'), openRaid);
    tap($('#btnSpeed'), () => {
      Game.S.speed = Game.S.speed >= 3 ? 1 : Game.S.speed + 1;
      sfx('click', 0.5);
      updateHudButtons();
    });
    tap($('#btnSound'), () => {
      Game.S.sound = !Game.S.sound;
      Engine.Sfx.on = Game.S.sound;
      updateHudButtons();
    });
    updateHudButtons();
    window.addEventListener('resize', onResize);
    onResize();
  }

  function onResize() {
    Battle.resize();
    const cv = $('#cv').getBoundingClientRect();
    const gp = $('#iconMeat').getBoundingClientRect();
    Battle.B.goldAnchor = Battle.toVirtual(gp.left + gp.width / 2 - cv.left, gp.top + gp.height / 2 - cv.top);
  }

  function updateHudButtons() {
    $('#btnSpeed').textContent = 'x' + Game.S.speed;
    $('#btnSpeed').classList.toggle('on', Game.S.speed > 1);
    $('#btnSound').classList.toggle('off', !Game.S.sound);
  }

  function switchTab(id) {
    tab = id;
    for (const b of $$('#nav button')) b.classList.toggle('on', b.dataset.tab === id);
    for (const t of $$('.tab')) t.hidden = t.id !== 'tab-' + id;
    $('#panel').scrollTop = 0;
    armyDirty = true;
    refreshTab(true);
  }

  // ---------- HUD ----------
  function buildHud() {
    const pips = $('#wavePips');
    for (let i = 0; i < WAVES_PER_STAGE; i++) pips.append(el('i', i === WAVES_PER_STAGE - 1 ? 'boss' : ''));
    tap($('#btnChallenge'), () => Game.challenge());
    tap($('#questBox'), () => {
      if (Game.claimQuest()) {
        const q = $('#questBox');
        q.classList.remove('claim'); void q.offsetWidth; q.classList.add('claim');
      }
    });
  }

  function updateHud() {
    const B = Battle.B;
    if (B.raid) setText($('#stageName'), '☠ ' + RAID_CHAPTER.name + ' · 레이드 Lv.' + B.raid.lv);
    else setText($('#stageName'), F.stageLabel(B.stage) + '  ' + F.chapter(B.stage).name + (Game.S.farm ? ' (반복)' : ''));
    $('#btnChallenge').hidden = !Game.S.farm || !!B.raid;
    $('#wavePips').hidden = !!B.raid;
    $$('#wavePips i').forEach((p, i) => {
      p.classList.toggle('done', i < B.wave);
      p.classList.toggle('cur', i === B.wave);
    });
    const boss = B.boss;
    const bb = $('#bossBar');
    if (boss && !boss.dead && B.enemies.includes(boss)) {
      bb.hidden = false;
      bb.classList.toggle('raid', !!boss.raid);
      setText($('.bname', bb), boss.raid ? `${RAID.name} · Lv.${B.raid.lv}` : boss.T.name);
      $('.bbar i', bb).style.width = Math.max(0, boss.hp / boss.maxHp * 100) + '%';
      setText($('.bhp', bb), (boss.raid ? Math.ceil(Math.max(0, B.raid.t)) + '초 · ' : '') + fmt(Math.max(0, boss.hp)));
    } else if (B.raid && !B.raid.over) {
      bb.hidden = false; bb.classList.add('raid');
      setText($('.bname', bb), '다가오는 사룡…');
      $('.bbar i', bb).style.width = '100%';
      setText($('.bhp', bb), Math.ceil(B.raid.t) + '초');
    } else bb.hidden = true;

    const q = Game.questState();
    setText($('#questText'), q.def.kind.text(q.def.target));
    setText($('#questProg'), `${fmt(q.cur)}/${fmt(q.def.target)}`);
    $('#questBox .qbar i').style.width = Math.min(100, q.cur / q.def.target * 100) + '%';
    $('#questBox').classList.toggle('done', q.done);
    setText($('#questReward'), '' + q.def.reward);
    setText($('#questNo'), '퀘스트 ' + (Game.S.quest.i + 1));

    const alive = Battle.aliveCount();
    setText($('#armyCount'), `${alive}/${SLOTS}`);
    $('#armyBox').classList.toggle('low', alive < SLOTS * 0.5);

    const rs = Game.raidStatus();
    setText($('#raidTickets'), rs.tickets === Infinity ? '∞' : '' + rs.tickets);
    $('#btnRaid').classList.toggle('active', rs.active);
    $('#btnRaid').classList.toggle('ready', !rs.active && rs.tickets > 0);
  }

  // ---------- action bar ----------
  function buildActionBar() {
    const box = $('#skillSlots');
    for (let i = 0; i < 6; i++) {
      const s = el('button', 'sslot', '<img class="sk" alt=""><div class="cdmask"></div><span class="cdt"></span><span class="lock">🔒</span>');
      tap(s, () => {
        const id = Game.S.equip[i];
        if (!id) { switchTab('skill'); return; }
        if (!Game.S.auto) {
          if (Battle.castSkill(id)) sfx('click', 0.4); else sfx('deny', 0.4);
        } else showSkillDetail(id);
      });
      box.append(s);
    }
    tap($('#btnAuto'), () => {
      Game.S.auto = !Game.S.auto;
      sfx('click', 0.6);
      toast(Game.S.auto ? '스킬 자동 사용 <b>ON</b>' : '스킬 자동 사용 <b>OFF</b> — 슬롯을 눌러 직접 사용');
    });
    $('#hatchEgg').src = ICON.lvEggUrl(3);
    holdRepeat($('#btnSummon'), (repeat) => (Game.hatchOne(repeat) ? true : false));
  }

  function updateActionBar() {
    const S = Game.S;
    const unlocked = Game.unlockedSlots();
    const sig = S.equip.join(',') + '|' + unlocked;
    const slots = $$('#skillSlots .sslot');
    if (sig !== lastEquipSig) {
      lastEquipSig = sig;
      slots.forEach((s, i) => {
        const id = S.equip[i];
        s.classList.toggle('locked', i >= unlocked);
        s.classList.toggle('empty', !id && i < unlocked);
        const img = $('.sk', s);
        if (id) { img.src = ICON.skillUrl(id); img.hidden = false; s.style.setProperty('--gc', LV_COLORS[SKILL_BY_ID[id].grade]); }
        else { img.hidden = true; s.style.removeProperty('--gc'); }
      });
    }
    slots.forEach((s, i) => {
      const id = S.equip[i];
      if (!id) return;
      const cd = Battle.B.cd[id] || 0;
      const p = Math.max(0, Math.min(1, cd / SKILL_BY_ID[id].cd));
      $('.cdmask', s).style.setProperty('--p', (p * 360) + 'deg');
      setText($('.cdt', s), cd > 0.05 ? (cd >= 1 ? '' + Math.ceil(cd) : cd.toFixed(1)) : '');
      s.classList.toggle('ready', cd <= 0.05);
    });
    $('#btnAuto').classList.toggle('on', S.auto);

    const empty = SLOTS - Battle.aliveCount();
    const cost = Game.summonCost();
    const btn = $('#btnSummon');
    setText($('#summonCost'), Game.infinite() ? '무료' : fmt(cost));
    const badge = $('#emptyBadge');
    setText(badge, '' + empty);
    badge.hidden = empty <= 0;
    const afford = Game.canPay('meat', cost);
    btn.classList.toggle('ready', empty > 0 && afford);
    btn.classList.toggle('poor', !afford);
    btn.classList.toggle('full', empty <= 0);
    setText($('#summonLabel'), empty > 0 ? '알 부화' : '방진 만원');
    setText($('#nestHint'), `교배 둥지 ${Game.nestPairs()}/${NEST_SLOTS}`);
    $('#tutHand').hidden = !(S.tut === 0 && empty > 0 && afford);
  }

  function bumpBadge() {
    const b = $('#emptyBadge');
    b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump');
  }

  function pulseGold() {
    const p = $('#goldPill');
    p.classList.remove('pulse'); void p.offsetWidth; p.classList.add('pulse');
  }

  // ---------- upgrade tab ----------
  function buildUpgradeTab() {
    const t = $('#tab-upgrade');
    t.innerHTML = `<div class="tabhead"><h2>능력치 강화</h2><div class="seg" id="multSeg">
      <button data-m="1" class="on">x1</button><button data-m="10">x10</button><button data-m="max">MAX</button></div></div>
      <div class="list" id="upList"></div>
      <p class="hint">버튼을 길게 누르면 연속 강화됩니다</p>`;
    for (const b of $$('#multSeg button', t)) tap(b, () => {
      mult = b.dataset.m === 'max' ? 'max' : +b.dataset.m;
      $$('#multSeg button', t).forEach((x) => x.classList.toggle('on', x === b));
      sfx('click', 0.4);
      refreshTab(true);
    });
    const list = $('#upList', t);
    for (const u of UPGRADES) {
      const row = el('div', 'row', `
        <div class="ico"><img src="${ICON.url(u.icon)}" alt=""></div>
        <div class="info"><div class="nm">${u.name} <span class="lv"></span></div><div class="val"></div></div>
        <button class="buy"><span class="cost">${MEAT()}<span class="cv"></span></span><span class="lbl">강화</span></button>`);
      row.dataset.id = u.id;
      list.append(row);
      holdRepeat($('.buy', row), () => Game.buyUpgrade(u.id, mult));
    }
  }

  function refreshUpgradeTab() {
    for (const row of $$('#upList .row')) {
      const u = UPGRADE_BY_ID[row.dataset.id];
      const lv = Game.S.upg[u.id] || 0;
      const { total, count } = Game.upgradeQuote(u, mult);
      const maxed = u.max != null && lv >= u.max;
      setText($('.lv', row), 'Lv.' + lv);
      const cur = u.show(u.val(lv));
      $('.val', row).innerHTML = maxed ? `<b>${cur}</b> <em>MAX</em>` : `${cur} → <b>${u.show(u.val(lv + Math.max(1, count)))}</b>`;
      setText($('.cv', row), maxed ? '-' : Game.infinite() ? '무료' : fmt(total));
      setText($('.lbl', row), maxed ? '최대' : count > 1 ? `강화 +${count}` : '강화');
      $('.buy', row).classList.toggle('dis', maxed || !count || !Game.canPay('meat', total));
    }
  }

  // ---------- army tab ----------
  function buildArmyTab() {
    const t = $('#tab-army');
    t.innerHTML = `<div class="tabhead"><h2>공룡 군단</h2><div class="armystat">${ICON.html('crown')}<b id="armyPower">0</b></div></div>
      <div class="gradebar" id="gradeBar"></div>
      <div class="formation-wrap"><div class="flabel"><span>◀ 후열 (원거리·비행)</span><span>전열 ▶</span></div><div class="formation" id="formation"></div></div>
      <div class="sinfo" id="dinoInfo"></div>
      <div class="armybtns"><button class="btn purple" id="btnMerge">${ICON.html('spark')}<span>자동 합성</span></button>
        <button class="btn gold" id="btnFill"><img class="ci" src="${ICON.lvEggUrl(2)}" alt=""><span>빈자리 모두 부화</span></button></div>
      <p class="hint">같은 레벨 공룡 2마리 → 다음 레벨 1마리 (종 상관없음). 공룡을 끌어 같은 레벨 공룡 위에 놓으면 직접 합성, 둥지 칸에 놓으면 교배 둥지로 보냅니다.</p>
      <div class="nesthead"><h2>${ICON.html('nest')} 교배 둥지</h2><span class="sub" id="nestSub"></span></div>
      <div class="nestgrid" id="nestGrid"></div>
      <p class="hint">둥지에 들어간 공룡은 방진에서 빠져 안전하게 쉽니다. 알을 부화하면 6개 둥지 중 하나가 무작위로 골라져 —
        암수 한 쌍이 있으면 <b class="pink">그 쌍의 새끼</b>가, 비어 있으면 <b>야생 공룡</b>이 태어납니다. 6쌍을 모두 채우면 내가 고른 공룡만 태어나요!</p>`;
    const grid = $('#formation', t);
    for (let l = 0; l < LANES; l++) {
      for (let c = 0; c < RANKS; c++) {
        const cell = el('div', 'cell', '<canvas></canvas><span class="clv"></span><span class="csex"></span><span class="cmark"></span><i class="hp"><b></b></i>');
        cell.dataset.lane = l;
        cell.dataset.rank = RANKS - 1 - c;
        grid.append(cell);
      }
    }
    setupDrag(grid);
    const ng = $('#nestGrid', t);
    for (let i = 0; i < NEST_SLOTS; i++) {
      const card = el('div', 'nest', `<span class="nno">${i + 1}</span>
        <button class="nslot m" data-sex="m"><canvas></canvas><span class="nlv"></span><span class="nplus">${sexMark('m')}<small>수컷</small></span></button>
        <button class="nheart">♥</button>
        <button class="nslot f" data-sex="f"><canvas></canvas><span class="nlv"></span><span class="nplus">${sexMark('f')}<small>암컷</small></span></button>`);
      card.dataset.slot = i;
      for (const b of $$('.nslot', card)) {
        b.dataset.slot = i;
        tap(b, () => nestSlotTap(i, b.dataset.sex));
      }
      tap($('.nheart', card), () => showBreedPreview(i));
      ng.append(card);
    }
    tap($('#btnFill', t), () => Game.hatchFill());
    tap($('#btnMerge', t), () => { Game.merge(); armyDirty = true; refreshArmyTab(true); });
  }

  // Drag a dinosaur onto another of the same level to merge, or onto a nest slot to breed.
  function setupDrag(grid) {
    let drag = null;
    const cellUnit = (cell) => cell && Battle.unitAt(+cell.dataset.lane, +cell.dataset.rank);
    grid.addEventListener('pointerdown', (ev) => {
      const cell = ev.target.closest('.cell');
      const u = cellUnit(cell);
      if (!u) return;
      Engine.Sfx.unlock();
      drag = { u, cell, sx: ev.clientX, sy: ev.clientY, moved: false, ghost: null, id: ev.pointerId };
    });
    window.addEventListener('pointermove', (ev) => {
      if (!drag || ev.pointerId !== drag.id) return;
      if (!drag.moved && Math.hypot(ev.clientX - drag.sx, ev.clientY - drag.sy) > 8) {
        drag.moved = true;
        const gh = el('div', 'dragghost');
        const c = document.createElement('canvas');
        gh.append(c);
        document.body.append(gh);
        Engine.portrait(c, lookOf(drag.u.r));
        drag.ghost = gh;
        drag.cell.classList.add('dragging');
        for (const cell of $$('#formation .cell')) {
          const o = cellUnit(cell);
          cell.classList.toggle('mergeable', !!o && o !== drag.u && o.r.lv === drag.u.r.lv);
        }
        for (const s of $$('.nslot')) s.classList.toggle('droppable', s.dataset.sex === drag.u.r.sex);
      }
      if (drag.moved) {
        drag.ghost.style.transform = `translate(${ev.clientX - 34}px, ${ev.clientY - 26}px)`;
        drag.y = ev.clientY;
        if (!drag.scroll) drag.scroll = requestAnimationFrame(autoScroll);
        ev.preventDefault();
      }
    }, { passive: false });
    // Scroll the panel while a dragged dinosaur hovers near its top or bottom edge (to reach the nest).
    function autoScroll() {
      if (!drag || !drag.moved) return;
      const p = $('#panel'), r = p.getBoundingClientRect();
      if (drag.y > r.bottom - 56) p.scrollTop += Math.min(14, (drag.y - (r.bottom - 56)) * 0.4 + 3);
      else if (drag.y < r.top + 40) p.scrollTop -= Math.min(14, ((r.top + 40) - drag.y) * 0.4 + 3);
      drag.scroll = requestAnimationFrame(autoScroll);
    }
    const end = (ev) => {
      if (!drag || ev.pointerId !== drag.id) return;
      const d = drag;
      drag = null;
      if (d.scroll) cancelAnimationFrame(d.scroll);
      for (const cell of $$('#formation .cell')) cell.classList.remove('mergeable', 'dragging');
      for (const s of $$('.nslot')) s.classList.remove('droppable');
      if (d.ghost) d.ghost.remove();
      if (!d.moved) { selectedId = d.u.id; sfx('click', 0.4); armyDirty = true; refreshArmyTab(true); return; }
      if (ev.type === 'pointercancel') return;
      const target = document.elementFromPoint(ev.clientX, ev.clientY);
      const cell = target && target.closest('.cell');
      const slot = target && target.closest('.nslot');
      if (cell) {
        const o = cellUnit(cell);
        if (o && o !== d.u) { const m = Game.mergeTwo(o, d.u); if (m) selectedId = m.id; }
      } else if (slot) {
        if (slot.dataset.sex !== d.u.r.sex) { toast(`${sexMark(d.u.r.sex)} 공룡은 ${sexMark(slot.dataset.sex)} 칸에 넣을 수 없습니다`); sfx('deny', 0.5); }
        else if (Game.nestPut(+slot.dataset.slot, slot.dataset.sex, d.u.id)) toast(`둥지 ${+slot.dataset.slot + 1}에 ${dinoShort(d.u.r)} ${sexMark(d.u.r.sex)} 배치`);
      }
      armyDirty = true;
      refreshArmyTab(true);
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  }

  function cellPaint(cell, u, force) {
    const sid = u ? u.id + ':' + u.r.lv + ':' + u.r.hue + ':' + u.r.sp : '';
    if (!force && cell._sid === sid) return;
    cell._sid = sid;
    cell.className = 'cell' + (u ? '' : ' empty');
    if (u) cell.style.setProperty('--lc', lvColor(u.r.lv)); else cell.style.removeProperty('--lc');
    Engine.portrait($('canvas', cell), u ? lookOf(u.r) : null);
    $('.clv', cell).textContent = u ? 'Lv.' + u.r.lv : '';
    const sx = $('.csex', cell);
    sx.textContent = u ? sexMark(u.r.sex) : '';
    sx.className = 'csex ' + (u ? u.r.sex : '');
    const mk = [];
    if (u && hasTrait(u.r, 'fire')) mk.push('🔥');
    if (u && u.r.lock) mk.push('🔒');
    if (u && isHybrid(u.r)) mk.push('🧬');
    $('.cmark', cell).textContent = mk.join('');
  }

  function refreshArmyTab(force) {
    if (force) armyDirty = true;
    const units = Battle.units();
    for (const cell of $$('#formation .cell')) {
      const u = Battle.unitAt(+cell.dataset.lane, +cell.dataset.rank);
      cellPaint(cell, u, armyDirty);
      if (u) $('.hp b', cell).style.width = Math.max(0, u.hp / u.maxHp * 100) + '%';
      cell.classList.toggle('sel', !!u && u.id === selectedId);
    }
    if (armyDirty) {
      const counts = new Map();
      for (const u of units) counts.set(u.r.lv, (counts.get(u.r.lv) || 0) + 1);
      const lvls = [...counts.keys()].sort((a, b) => a - b);
      $('#gradeBar').innerHTML = `<span class="tot">병력 <b>${units.length}</b>/${SLOTS}</span>` +
        lvls.map((lv) => `<span class="chip" style="--gc:${lvColor(lv)}">Lv.${lv} × ${counts.get(lv)}</span>`).join('');
      refreshNest();
    }
    setText($('#armyPower'), fmt(Game.power()));
    refreshDinoInfo(armyDirty);
    const cost = Game.summonCost();
    const empty = SLOTS - units.length;
    const n = Game.infinite() ? empty : Math.min(empty, Math.floor(Game.S.meat / cost));
    $('#btnFill span').textContent = empty ? `빈자리 ${empty}칸 부화 (${n}마리)` : '방진 만원';
    $('#btnFill').classList.toggle('dis', !n);
    const m = Battle.mergeCount();
    $('#btnMerge span').textContent = m ? `자동 합성 ${m}회` : '자동 합성';
    $('#btnMerge').classList.toggle('dis', !m);
    armyDirty = false;
  }

  function abilityLines(r) {
    const list = [SPECIES[r.sp]];
    if (isHybrid(r)) list.push(SPECIES[r.sp2]);
    return list.map((s) => `<div class="abil"><b>${s.abName}</b> ${s.abDesc}</div>`).join('');
  }

  function refreshDinoInfo(force) {
    const info = $('#dinoInfo');
    const u = selectedId ? Battle.unitById(selectedId) : null;
    if (!u) {
      if (info._sid !== 0) {
        info._sid = 0;
        info.innerHTML = '<p class="hint">공룡을 눌러 정보를 확인하세요 · 근접 공룡은 앞열, 원거리(🔥 불꽃 숨결)·비행 공룡은 항상 맨 후열로 이동합니다</p>';
      }
      return;
    }
    const r = u.r;
    const sig = u.id + ':' + r.lv + ':' + r.lock + ':' + r.tr.length;
    if (force || info._sid !== sig) {
      info._sid = sig;
      const role = ROLE_NAMES[dinoRole(r)];
      info.innerHTML = `<canvas class="big"></canvas><div class="sd">
        <div class="sn">${lvTag(r.lv)} ${dinoName(r)} ${sexTag(r.sex)}</div>
        <div class="ss">${role} · ${r.gen}세대${r.pa ? ' · 부모 ' + r.pa : ''}</div>
        <div class="ss">공격력 <b class="sa"></b> · 체력 <b class="sh"></b> · 공격 간격 ${u.st.interval.toFixed(2)}초</div>
        <div class="tlist">${r.tr.length ? r.tr.map(([k, l]) => traitChip(k, l)).join('') : '<span class="none">특성 없음</span>'}</div>
        ${abilityLines(r)}
        <div class="ibtns"><button class="btn small pinkb" id="iNest">${ICON.html('nest')}둥지로</button>
          <button class="btn small ${r.lock ? 'gold' : 'gray'}" id="iLock">${r.lock ? '🔒 잠금됨' : '🔓 잠금'}</button></div></div>`;
      Engine.portrait($('canvas', info), lookOf(r));
      tap($('#iLock', info), () => {
        r.lock = !r.lock;
        sfx('click', 0.5);
        toast(r.lock ? '잠금: 자동 합성에서 제외됩니다' : '잠금 해제');
        armyDirty = true; refreshArmyTab(true);
      });
      tap($('#iNest', info), () => sendToNest(u));
    }
    setText($('.sa', info), fmt(u.st.atk));
    setText($('.sh', info), `${fmt(Math.max(0, u.hp))}/${fmt(u.maxHp)}`);
  }

  // Put a dinosaur in the first nest slot of its sex that is free (or the first incomplete pair).
  function sendToNest(u) {
    const sex = u.r.sex;
    const nest = Game.S.nest;
    let slot = nest.findIndex((p) => !p[sex] && p[sex === 'm' ? 'f' : 'm']);
    if (slot < 0) slot = nest.findIndex((p) => !p[sex]);
    if (slot < 0) { pickNestSlot(u); return; }
    if (Game.nestPut(slot, sex, u.id)) {
      toast(`둥지 ${slot + 1}에 ${dinoShort(u.r)} ${sexMark(sex)} 배치 — 방진에서 빠졌습니다`);
      selectedId = 0;
      armyDirty = true; refreshArmyTab(true);
    }
  }

  function pickNestSlot(u) {
    const sex = u.r.sex;
    const rows = Game.S.nest.map((p, i) => `<button class="prow" data-i="${i}"><span class="pn">둥지 ${i + 1}</span>
      <span>${p[sex] ? `교체: ${lvTag(p[sex].lv)} ${dinoShort(p[sex])}` : '빈 칸'}</span></button>`).join('');
    const sheet = openModal(`<h2 class="mtitle">어느 둥지에 넣을까요?</h2><p class="hint">${sexMark(sex)} 칸이 모두 차 있습니다. 교체하면 기존 공룡은 방진으로 돌아갑니다.</p><div class="plist">${rows}</div>`, { cls: 'small' });
    for (const b of $$('.prow', sheet)) tap(b, () => {
      if (Game.nestPut(+b.dataset.i, sex, u.id)) { selectedId = 0; closeModal(); armyDirty = true; refreshArmyTab(true); }
    });
  }

  function refreshNest() {
    const S = Game.S;
    for (const card of $$('#nestGrid .nest')) {
      const i = +card.dataset.slot;
      const pair = S.nest[i];
      for (const b of $$('.nslot', card)) {
        const r = pair[b.dataset.sex];
        const sid = r ? r.id + ':' + r.lv : '';
        if (b._sid !== sid) {
          b._sid = sid;
          b.classList.toggle('filled', !!r);
          if (r) b.style.setProperty('--lc', lvColor(r.lv)); else b.style.removeProperty('--lc');
          Engine.portrait($('canvas', b), r ? lookOf(r) : null);
          $('.nlv', b).textContent = r ? 'Lv.' + r.lv : '';
        }
      }
      card.classList.toggle('complete', !!(pair.m && pair.f));
    }
    setText($('#nestSub'), `완성 ${Game.nestPairs()}/${NEST_SLOTS}쌍 · 부화 시 ${Math.round(Game.nestPairs() / NEST_SLOTS * 100)}% 교배 공룡`);
  }

  function nestSlotTap(slot, sex) {
    sfx('click', 0.4);
    const r = Game.S.nest[slot][sex];
    if (!r) { openPicker(slot, sex); return; }
    const sheet = openModal(`<div class="ndetail"><canvas class="big"></canvas><div>
      <div class="sn">${lvTag(r.lv)} ${dinoName(r)} ${sexTag(r.sex)}</div>
      <div class="ss">${ROLE_NAMES[dinoRole(r)]} · ${r.gen}세대${r.pa ? ' · 부모 ' + r.pa : ''}</div>
      <div class="tlist">${r.tr.length ? r.tr.map(([k, l]) => traitChip(k, l)).join('') : '<span class="none">특성 없음</span>'}</div></div></div>
      ${abilityLines(r)}
      <div class="mbtns"><button class="btn green" id="nBack">방진으로 복귀</button><button class="btn pinkb" id="nSwap">다른 공룡으로 교체</button></div>`, { cls: 'small' });
    Engine.portrait($('canvas', sheet), lookOf(r));
    tap($('#nBack', sheet), () => { if (Game.nestTake(slot, sex)) { closeModal(); armyDirty = true; refreshArmyTab(true); } });
    tap($('#nSwap', sheet), () => openPicker(slot, sex));
  }

  function openPicker(slot, sex) {
    const list = Battle.units().filter((u) => u.r.sex === sex).sort((a, b) => b.r.lv - a.r.lv || b.r.tr.length - a.r.tr.length);
    const rows = list.map((u) => `<button class="prow" data-id="${u.id}"><canvas></canvas><div class="pd">
      <div>${lvTag(u.r.lv)} ${dinoName(u.r)} ${sexTag(u.r.sex)}</div>
      <div class="tlist">${u.r.tr.map(([k, l]) => traitChip(k, l)).join('') || '<span class="none">특성 없음</span>'}</div></div></button>`).join('');
    const sheet = openModal(`<h2 class="mtitle">둥지 ${slot + 1} · ${sexMark(sex)} ${sex === 'm' ? '아비' : '어미'} 선택</h2>
      <p class="hint">선택한 공룡은 방진에서 빠져 둥지로 들어갑니다</p>
      <div class="plist">${rows || `<p class="hint">방진에 ${sexMark(sex)} 공룡이 없습니다</p>`}</div>`, { cls: 'picker' });
    $$('.prow', sheet).forEach((b) => {
      const u = Battle.unitById(+b.dataset.id);
      Engine.portrait($('canvas', b), lookOf(u.r));
      tap(b, () => {
        if (Game.nestPut(slot, sex, u.id)) {
          if (selectedId === u.id) selectedId = 0;
          closeModal();
          toast(`둥지 ${slot + 1}에 ${dinoShort(u.r)} ${sexMark(sex)} 배치`);
          armyDirty = true; refreshArmyTab(true);
        }
      });
    });
  }

  function showBreedPreview(slot) {
    const p = Game.S.nest[slot];
    sfx('click', 0.4);
    if (!p.m || !p.f) {
      toast(`둥지 ${slot + 1}: 암수 한 쌍을 넣으면 교배 공룡이 태어납니다 (지금은 야생 알)`);
      return;
    }
    const dad = p.m, mom = p.f;
    const shared = dad.tr.filter(([k]) => mom.tr.some((t) => t[0] === k)).map(([k]) => k);
    const minLv = Math.floor((dad.lv + mom.lv) / 4);
    const sheet = openModal(`<h2 class="mtitle">둥지 ${slot + 1} 유전 미리보기</h2>
      <div class="pair"><div class="pp"><canvas></canvas><div>${lvTag(dad.lv)} ${dinoShort(dad)} ${sexTag('m')}</div><div class="tlist">${dad.tr.map(([k, l]) => traitChip(k, l)).join('') || '<span class="none">특성 없음</span>'}</div></div>
        <div class="ph">♥</div>
        <div class="pp"><canvas></canvas><div>${lvTag(mom.lv)} ${dinoShort(mom)} ${sexTag('f')}</div><div class="tlist">${mom.tr.map(([k, l]) => traitChip(k, l)).join('') || '<span class="none">특성 없음</span>'}</div></div></div>
      <div class="modes">${BREED_MODES.map((m) => `<div class="moderow"><b>${m.name}</b><span>${m.p}%</span><small>${m.desc}</small></div>`).join('')}
        <div class="moderow"><b>돌연변이</b><span>${Math.round(MUTATION * 100)}%</span><small>새로운 특성 1개 + 새로운 색</small></div></div>
      <p class="hint">${dad.sp !== mom.sp ? `혼합 유전이면 ${SPECIES[dad.sp].short}·${SPECIES[mom.sp].short} 혼종이 태어나 두 종의 고유 능력을 모두 가집니다. ` : ''}
        ${shared.length ? `공통 특성(${shared.map((k) => TRAITS[k].name).join(', ')})은 혼합 유전에서 한 단계 강화됩니다. ` : ''}
        새끼 레벨은 최소 Lv.${Math.max(1, minLv)} (부모 평균 레벨의 절반) · 성별은 무작위</p>`, { cls: 'small' });
    const cs = $$('.pp canvas', sheet);
    Engine.portrait(cs[0], lookOf(dad));
    Engine.portrait(cs[1], lookOf(mom), { flip: true });
  }

  // ---------- skill tab ----------
  function buildSkillTab() {
    const t = $('#tab-skill');
    t.innerHTML = `<div class="tabhead"><h2>스킬 장착</h2><span class="sub">자동 사용 · 쿨타임마다 발동</span></div>
      <div class="equiprow" id="equipRow"></div>
      <div class="tabhead"><h2>보유 스킬</h2><button class="btn green small" id="btnLvAll">일괄 강화</button></div>
      <div class="skillgrid" id="skillGrid"></div>`;
    const row = $('#equipRow', t);
    for (let i = 0; i < 6; i++) {
      const s = el('button', 'eslot', '<img class="sk" alt=""><span class="lk"></span>');
      tap(s, () => {
        const id = Game.S.equip[i];
        if (id) showSkillDetail(id);
      });
      row.append(s);
    }
    const grid = $('#skillGrid', t);
    for (const sk of SKILLS) {
      const c = el('button', 'scard', `<div class="art"><img src="${ICON.skillUrl(sk.id)}" alt=""></div>
        <div class="sname">${sk.name}</div><div class="slv"></div><div class="sbar"><i></i><span></span></div><em class="eq">장착</em>`);
      c.dataset.id = sk.id;
      c.style.setProperty('--gc', LV_COLORS[sk.grade]);
      tap(c, () => showSkillDetail(sk.id));
      grid.append(c);
    }
    tap($('#btnLvAll', t), () => {
      if (Game.levelAllSkills()) { sfx('buy', 0.6); toast('스킬 일괄 강화 완료!'); }
      else { sfx('deny', 0.5); toast('강화할 수 있는 스킬이 없습니다'); }
      refreshTab(true);
    });
  }

  function refreshSkillTab() {
    const S = Game.S;
    const unlocked = Game.unlockedSlots();
    $$('#equipRow .eslot').forEach((s, i) => {
      const id = S.equip[i];
      s.classList.toggle('locked', i >= unlocked);
      const img = $('.sk', s);
      if (id) { img.src = ICON.skillUrl(id); img.hidden = false; s.style.setProperty('--gc', LV_COLORS[SKILL_BY_ID[id].grade]); }
      else { img.hidden = true; s.style.removeProperty('--gc'); }
      $('.lk', s).textContent = i >= unlocked ? F.stageLabel(SKILL_SLOT_UNLOCK[i]) + ' 도달' : '';
    });
    let canLv = false;
    for (const c of $$('#skillGrid .scard')) {
      const id = c.dataset.id;
      const own = S.skills[id];
      c.classList.toggle('owned', !!own);
      c.classList.toggle('equipped', S.equip.includes(id));
      if (own) {
        const need = F.skillNeed(own.lv);
        const maxed = own.lv >= SKILL_MAX_LV;
        $('.slv', c).textContent = 'Lv.' + own.lv;
        $('.sbar i', c).style.width = maxed ? '100%' : Math.min(100, own.n / need * 100) + '%';
        $('.sbar span', c).textContent = maxed ? 'MAX' : `${own.n}/${need}`;
        const up = !maxed && own.n >= need;
        c.classList.toggle('canup', up);
        if (up) canLv = true;
      } else {
        $('.slv', c).textContent = '미보유';
        $('.sbar span', c).textContent = '';
        $('.sbar i', c).style.width = '0%';
        c.classList.remove('canup');
      }
    }
    $('#btnLvAll').classList.toggle('dis', !canLv);
  }

  function showSkillDetail(id) {
    const sk = SKILL_BY_ID[id];
    const own = Game.S.skills[id];
    const color = LV_COLORS[sk.grade];
    const lv = own ? own.lv : 1;
    const v = F.skillValue(sk, lv);
    const nv = F.skillValue(sk, lv + 1);
    const equipped = Game.S.equip.includes(id);
    const need = F.skillNeed(lv);
    const sheet = openModal(`
      <div class="skd" style="--gc:${color}">
        <div class="skart"><img src="${ICON.skillUrl(id)}" alt=""></div>
        <div class="skt"><span class="gtag" style="--gc:${color}">${'★'.repeat(sk.grade + 1)}</span><h3>${sk.name}</h3><p>${own ? 'Lv.' + lv : '미보유'} · 쿨타임 ${sk.cd}초</p></div>
      </div>
      <p class="desc">${sk.desc(v)}</p>
      ${own && lv < SKILL_MAX_LV ? `<p class="next">다음 레벨: ${sk.desc(nv)}</p>` : ''}
      <div class="mbtns">
        ${own ? `<button class="btn ${equipped ? 'gray' : 'green'}" id="mEquip">${equipped ? '해제' : '장착'}</button>
        <button class="btn gold ${own.n >= need && lv < SKILL_MAX_LV ? '' : 'dis'}" id="mLv">강화 (${own.n}/${need})</button>`
        : '<p class="hint">부화 탭의 스킬 소환에서 획득할 수 있습니다</p>'}
      </div>`, { cls: 'small' });
    const eq = $('#mEquip', sheet);
    if (eq) tap(eq, () => {
      const r = Game.toggleEquip(id);
      if (r === 'full') { toast('빈 슬롯이 없습니다. 장착 중인 스킬을 먼저 해제하세요'); sfx('deny', 0.5); return; }
      sfx('drop', 0.5);
      closeModal(); refreshTab(true);
    });
    const lvb = $('#mLv', sheet);
    if (lvb) tap(lvb, () => {
      if (Game.levelSkill(id)) { sfx('buy', 0.6); showSkillDetail(id); refreshTab(true); }
      else sfx('deny', 0.5);
    });
  }

  // ---------- hatch tab ----------
  function buildSummonTab() {
    const t = $('#tab-summon');
    t.innerHTML = `
      <div class="bigcard recruit">
        <div class="bc-head"><img src="${ICON.lvEggUrl(4)}" alt=""><div><h3>알 부화</h3>
          <p>둥지 <b id="rLv">Lv.1</b> · 부화할수록 높은 레벨 알 확률 증가</p><div class="xpbar"><i id="rXp"></i><span id="rXpT"></span></div></div></div>
        <div class="odds" id="rOdds"></div>
        <p class="hint left" id="rNest"></p>
        <div class="bc-btns"><button class="btn gold" id="sOne">${MEAT()}<span id="sOneC"></span><small>1회 부화</small></button>
          <button class="btn orange" id="sFill">${MEAT()}<span id="sFillC"></span><small id="sFillL">빈자리 부화</small></button></div>
      </div>
      <div class="bigcard raid">
        <div class="bc-head"><canvas id="raidArt"></canvas><div><h3>☠ ${RAID.name}</h3>
          <p>${RAID.place} · 제한 시간 ${RAID.time}초 레이드</p><p>레이드 <b id="rdLv"></b> · 입장권 <b id="rdT"></b></p></div></div>
        <div class="bc-btns one"><button class="btn violet" id="rdGo">사룡에게 도전</button></div>
      </div>
      <div class="bigcard skills">
        <div class="bc-head"><img src="${ICON.skillUrl('primal')}" alt=""><div><h3>스킬 소환</h3>
          <p>장착한 스킬은 전투 중 자동으로 발동합니다</p></div></div>
        <div class="odds" id="kOdds"></div>
        <div class="bc-btns"><button class="btn purple" id="kOne">${AMBER()}<span>${SKILL_COST.one}</span><small>1회 소환</small></button>
          <button class="btn purple strong" id="kTen">${AMBER()}<span>${SKILL_COST.ten}</span><small>10회 소환</small></button></div>
      </div>
      <div class="bigcard codex"><h3>공룡 도감</h3><div class="splist">${SPECIES.map((s, i) => `<div class="spc"><canvas data-sp="${i}"></canvas>
        <div><b>${s.name}</b> <span class="role">${ROLE_NAMES[s.role]}</span><div class="abil"><b>${s.abName}</b> ${s.abDesc}</div></div></div>`).join('')}</div></div>
      <div class="bigcard codex"><h3>특성 도감 <span class="sub">Ⅰ → Ⅲ</span></h3><div class="trlist">${TRAIT_IDS.map((k) => `<div class="trr">${traitChip(k, 1)}
        <span>${TRAITS[k].desc(TRAITS[k].v[0])} <b>(Ⅲ: ${fmtPct(TRAITS[k].v[2])})</b></span></div>`).join('')}</div></div>`;
    holdRepeat($('#sOne', t), (repeat) => (Game.hatchOne(repeat) ? true : false));
    tap($('#sFill', t), () => Game.hatchFill());
    tap($('#kOne', t), () => Game.skillSummon(1));
    tap($('#kTen', t), () => Game.skillSummon(10));
    tap($('#rdGo', t), openRaid);
    $('#kOdds', t).innerHTML = SKILL_ODDS.map((p, i) => `<span class="chip" style="--gc:${LV_COLORS[i]}">${'★'.repeat(i + 1)} ${p}%</span>`).join('');
  }

  function paintSummonArt() {
    for (const c of $$('#tab-summon .spc canvas')) Engine.portrait(c, { sp: +c.dataset.sp, hue: 0 });
    Engine.portrait($('#raidArt'), { sp: 0, raid: true }, { pose: { motion: 'walk', t: 0, time: 1 } });
  }

  function refreshSummonTab(force) {
    if (force) paintSummonArt();
    const R = Game.S.recruit;
    const lv = R.lv;
    const need = RECRUIT_XP[lv];
    setText($('#rLv'), 'Lv.' + (lv + 1));
    $('#rXp').style.width = need ? Math.min(100, R.xp / need * 100) + '%' : '100%';
    setText($('#rXpT'), need ? `${R.xp}/${need}` : 'MAX');
    const odds = RECRUIT_ODDS[Math.min(lv, RECRUIT_ODDS.length - 1)];
    const ro = $('#rOdds');
    if (ro._sig !== 'o' + lv) {
      ro._sig = 'o' + lv;
      ro.innerHTML = odds.map((p, i) => (p ? `<span class="chip" style="--gc:${lvColor(i + 1)}">Lv.${i + 1} ${p}%</span>` : '')).join('');
    }
    const pairs = Game.nestPairs();
    setText($('#rNest'), `교배 둥지 ${pairs}/${NEST_SLOTS}쌍 완성 → 부화의 ${Math.round(pairs / NEST_SLOTS * 100)}%가 내가 고른 부모의 새끼, 나머지는 야생 공룡`);
    const cost = Game.summonCost();
    const empty = SLOTS - Battle.aliveCount();
    const n = Game.infinite() ? empty : Math.min(empty, Math.floor(Game.S.meat / cost));
    setText($('#sOneC'), Game.infinite() ? '무료' : fmt(cost));
    setText($('#sFillC'), Game.infinite() ? '무료' : fmt(cost * Math.max(1, n)));
    setText($('#sFillL'), `빈자리 부화 (${n}마리)`);
    $('#sOne').classList.toggle('dis', !empty || !Game.canPay('meat', cost));
    $('#sFill').classList.toggle('dis', !n);
    $('#kOne').classList.toggle('dis', !Game.canPay('amber', SKILL_COST.one));
    $('#kTen').classList.toggle('dis', !Game.canPay('amber', SKILL_COST.ten));
    const rs = Game.raidStatus();
    setText($('#rdLv'), 'Lv.' + rs.lv);
    setText($('#rdT'), rs.tickets === Infinity ? '∞' : `${rs.tickets}/${RAID.maxTickets}`);
    $('#rdGo').classList.toggle('dis', rs.active || !rs.tickets);
  }

  function refreshTab(force) {
    if (tab === 'upgrade') refreshUpgradeTab();
    else if (tab === 'army') refreshArmyTab(force);
    else if (tab === 'skill') refreshSkillTab();
    else if (tab === 'summon') refreshSummonTab(force);
  }

  // ---------- results ----------
  function showSkillResults(res) {
    const cards = res.map((r, i) => {
      const color = LV_COLORS[r.sk.grade];
      return `<div class="rcard g${r.sk.grade}" style="--gc:${color};--d:${i * 0.12}s">
        <div class="inner"><div class="back"><img src="${ICON.url('amber')}" alt=""></div>
        <div class="front"><img class="ic" src="${ICON.skillUrl(r.sk.id)}" alt=""><b>${r.sk.name}</b><span>${r.isNew ? 'NEW!' : '+1'}</span></div></div></div>`;
    }).join('');
    const again = res.length === 10 ? SKILL_COST.ten : SKILL_COST.one * res.length;
    const sheet = openModal(`<h2 class="mtitle">스킬 소환 결과</h2><div class="rgrid n${res.length}">${cards}</div>
      <div class="mbtns"><button class="btn green" id="mOk">확인</button>
      <button class="btn purple ${Game.canPay('amber', again) ? '' : 'dis'}" id="mAgain">${AMBER()}${Game.infinite() ? '무료' : again} 다시 소환</button></div>`, { cls: 'results', locked: true, noClose: true });
    $$('.rcard', sheet).forEach((c, i) => setTimeout(() => {
      c.classList.add('open');
      const gr = +c.className.match(/g(\d)/)[1];
      sfx(gr >= 3 ? 'reveal' : 'click', gr >= 3 ? 0.6 : 0.35, 1 + i * 0.03);
    }, 250 + i * 140));
    tap($('#mOk', sheet), () => { closeModal(); refreshTab(true); });
    tap($('#mAgain', sheet), () => { Game.skillSummon(res.length); });
  }

  function showFillResults(list) {
    if (!list.length) return;
    const bred = list.filter((r) => r.bred).length;
    const top = Math.max(...list.map((r) => r.rec.lv));
    toast(`공룡 ${list.length}마리 부화! 교배 <b class="pink">${bred}</b> · 야생 ${list.length - bred} · 최고 ${lvTag(top)}`, 'big', bred ? '#ff7ab8' : lvColor(top));
    armyDirty = true;
  }

  function offlinePopup(secs, meat, claim) {
    const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60);
    const sheet = openModal(`<h2 class="mtitle">방치 보상</h2>
      <div class="chest"><img src="${ICON.url('meat')}" alt=""></div>
      <p class="desc center">군단이 ${h ? h + '시간 ' : ''}${m}분 동안 사냥했습니다</p>
      <div class="reward">${ICON.html('meat')}<b>+${fmt(meat)}</b></div>
      <div class="mbtns"><button class="btn gold" id="mClaim">받기</button></div>`, { cls: 'small', locked: true, noClose: true });
    tap($('#mClaim', sheet), (ev) => {
      ev.currentTarget.disabled = true;
      claim();
      $('.chest', sheet).classList.add('open');
      sfx('buy', 0.7);
      setTimeout(closeModal, 600);
    });
  }

  // ---------- raid ----------
  function openRaid() {
    const rs = Game.raidStatus();
    const lv = rs.lv;
    const next = rs.next ? `다음 충전 ${Math.floor(rs.next / 60000)}분 ${Math.floor(rs.next / 1000) % 60}초` : '가득 참';
    const sheet = openModal(`<div class="raidhead"><canvas></canvas></div>
      <h2 class="mtitle violet">☠ ${RAID.name}</h2>
      <p class="desc center">${RAID.place}<br>거대한 해골 사룡을 ${RAID.time}초 안에 쓰러뜨리세요.<br>보랏빛 화염구와 <b>망자의 포효</b>를 조심하세요!</p>
      <div class="setrow"><span>레이드 레벨</span><b>Lv.${lv}</b></div>
      <div class="setrow"><span>처치 보상</span><b>${AMBER()} ${RAID.amber(lv)} · ${MEAT()} ${fmt(RAID.meat(lv, Game.S.maxStage))}</b></div>
      <div class="setrow"><span>입장권</span><b>${rs.tickets === Infinity ? '∞ (무한 재화)' : `${rs.tickets}/${RAID.maxTickets} · ${next}`}</b></div>
      <p class="hint">실패해도 입힌 피해 비율만큼 보상의 일부를 받습니다. 처치하면 레이드 레벨이 올라갑니다.</p>
      <div class="mbtns"><button class="btn violet ${rs.active || !rs.tickets ? 'dis' : ''}" id="rGo">${rs.active ? '레이드 진행 중' : '도전하기'}</button></div>`, { cls: 'small raidsheet' });
    Engine.portrait($('canvas', sheet), { sp: 0, raid: true }, { pose: { motion: 'walk', t: 0, time: 1 } });
    tap($('#rGo', sheet), () => { if (Game.startRaid()) closeModal(); });
  }

  function raidResult(r) {
    setTimeout(() => {
      const sheet = openModal(`<h2 class="mtitle violet">${r.won ? '사룡 토벌 성공!' : '사룡 레이드 종료'}</h2>
        <p class="desc center">레이드 Lv.${r.lv} · 입힌 피해 <b>${Math.round(r.frac * 100)}%</b>${r.won ? '<br>다음 레이드 레벨이 열렸습니다' : ''}</p>
        <div class="reward">${AMBER()}<b>+${fmt(r.amber)}</b></div>
        <div class="reward">${MEAT()}<b>+${fmt(r.meat)}</b></div>
        <div class="mbtns"><button class="btn green" id="rOk">확인</button></div>`, { cls: 'small' });
      tap($('#rOk', sheet), closeModal);
    }, 1400);
  }

  // ---------- options (cheats + reset) ----------
  function openOptions() {
    const S = Game.S;
    const sheet = openModal(`<h2 class="mtitle">옵션</h2>
      <h4 class="osec">일반</h4>
      <div class="setrow"><span>효과음</span><button class="btn small ${S.sound ? 'green' : 'gray'}" id="oSnd">${S.sound ? '켜짐' : '꺼짐'}</button></div>
      <div class="setrow"><span>전투 속도</span><div class="seg" id="oSpd">${[1, 2, 3].map((v) => `<button data-v="${v}" class="${S.speed === v ? 'on' : ''}">x${v}</button>`).join('')}</div></div>
      <h4 class="osec cheat">치트</h4>
      <div class="setrow"><span>재화 무한대<small>고기·호박석·레이드 입장권을 소모하지 않습니다</small></span>
        <button class="toggle ${S.cheat.inf ? 'on' : ''}" id="oInf" aria-label="재화 무한대"><i></i></button></div>
      <h4 class="osec danger">데이터</h4>
      <div class="setrow"><span>진행도 초기화<small>공룡·둥지·재화·스테이지를 모두 지우고 처음부터</small></span>
        <button class="btn small red" id="oReset">초기화</button></div>
      <h4 class="osec">기록</h4>
      <div class="setrow"><span>최고 스테이지</span><b>${F.stageLabel(S.maxStage)}</b></div>
      <div class="setrow"><span>처치한 야생 공룡</span><b>${fmt(S.stats.kills)}</b></div>
      <div class="setrow"><span>부화한 알 (교배)</span><b>${fmt(S.stats.summons)} (${fmt(S.stats.bred)})</b></div>
      <div class="setrow"><span>사룡 토벌</span><b>${fmt(S.raid.wins)}회</b></div>`, { cls: 'small' });
    tap($('#oSnd', sheet), () => { S.sound = !S.sound; Engine.Sfx.on = S.sound; updateHudButtons(); openOptions(); });
    for (const b of $$('#oSpd button', sheet)) tap(b, () => { S.speed = +b.dataset.v; updateHudButtons(); openOptions(); });
    tap($('#oInf', sheet), () => {
      Game.setInfinite(!S.cheat.inf);
      sfx(S.cheat.inf ? 'reveal' : 'click', 0.6);
      toast(S.cheat.inf ? '치트: 재화 무한대 <b>ON</b>' : '치트: 재화 무한대 <b>OFF</b>', 'big', S.cheat.inf ? LV_COLORS[2] : '#888');
      armyDirty = true;
      openOptions();
    });
    let armed = false;
    tap($('#oReset', sheet), (ev) => {
      if (!armed) { armed = true; ev.currentTarget.textContent = '정말요? 한 번 더'; sfx('deny', 0.5); return; }
      Game.reset();
    });
  }

  // ---------- per-frame ----------
  function tick(dt) {
    acc += dt;
    slowAcc += dt;
    updateActionBar();
    if (laidT > 0) {
      laidT -= dt;
      const card = $(`#nestGrid .nest[data-slot="${laidSlot}"]`);
      if (card) card.classList.toggle('laid', laidT > 0);
    }
    if (acc >= 0.1) {
      acc = 0;
      setText($('#gold'), money('meat'));
      setText($('#gems'), money('amber'));
      setText($('#power'), fmt(Game.power()));
      updateHud();
      $('#nav button[data-tab=army]').classList.toggle('badge', Battle.mergeCount() > 0);
      $('#nav button[data-tab=skill]').classList.toggle('badge', Object.entries(Game.S.skills).some(([, o]) => o.lv < SKILL_MAX_LV && o.n >= F.skillNeed(o.lv)));
    }
    if (slowAcc >= 0.25) {
      slowAcc = 0;
      refreshTab(false);
    }
  }

  return {
    init, tick, toast, hatchToast, showSkillResults, showFillResults, offlinePopup, bumpBadge, pulseGold,
    refreshTab, openModal, closeModal, raidResult, markArmy: () => { armyDirty = true; },
  };
})();
