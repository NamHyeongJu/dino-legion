'use strict';
// Game tables: levels, species, traits, enemies, skills, upgrades, chapters, quests, formulas.

const LANES = 6;          // files (rows on screen)
const RANKS = 5;          // ranks (depth of the formation)
const SLOTS = LANES * RANKS;
const NEST_SLOTS = 6;     // breeding pairs
const TRAIT_CAP = 4;

// Levels have no names: the colour walks the rainbow and wraps every seven levels.
const LV_COLORS = ['#ff5a52', '#ff9b2f', '#ffd83a', '#5fd35a', '#3fa8ff', '#5b63ff', '#b45cff'];
const lvColor = (lv) => LV_COLORS[(Math.max(1, lv) - 1) % LV_COLORS.length];
const lvMult = (lv) => Math.pow(1.8, lv - 1);

// Species and sheets follow Dino Nest's current roster (Assets/Resources/DinoNest/Creatures).
// role: 0 front-line melee, 1 reaches from the second rank, 2 ranged, 3 flier (dives from the back).
// Ranged and fliers always hold the rearmost rank; the fire trait turns any dinosaur ranged.
const SPECIES = [
  { key: 'Rex', name: '티라노사우루스', short: '티라노', role: 0, atk: 14, hp: 120, aspd: 0.85, size: 1.05,
    ab: 'tyrant', abName: '폭군의 일격', abDesc: '4번째 공격마다 300% 피해' },
  { key: 'Stego', name: '스테고사우루스', short: '스테고', role: 0, atk: 9, hp: 160, aspd: 0.9, size: 0.92,
    ab: 'whip', abName: '꼬리채찍', abDesc: '뒤돌아 꼬리를 휘둘러 주변 적에게도 40% 피해, 받은 근접 피해 15% 반사' },
  { key: 'Spino', name: '스피노사우루스', short: '스피노', role: 0, atk: 11, hp: 140, aspd: 0.9, size: 1.04,
    ab: 'bleed', abName: '출혈 물어뜯기', abDesc: '적중 시 4초간 초당 25% 출혈, 최대 3중첩' },
  { key: 'Allo', name: '알로사우루스', short: '알로', role: 0, atk: 12, hp: 115, aspd: 1.05, size: 1.0,
    ab: 'charge', abName: '돌진 물어뜯기', abDesc: '새 표적을 처음 물어뜯을 때 250% 피해 + 밀치기' },
  { key: 'Pachy', name: '파키케팔로사우루스', short: '파키', role: 0, atk: 10, hp: 135, aspd: 0.95, size: 0.9,
    ab: 'headbutt', abName: '박치기', abDesc: '4번째 공격마다 200% 피해 + 1초 기절' },
  { key: 'Trike', name: '트리케라톱스', short: '트리케라', role: 0, atk: 9, hp: 210, aspd: 0.85, size: 1.0,
    ab: 'horn', abName: '뿔 밀치기', abDesc: '3번째 공격마다 160% 피해 + 크게 밀쳐냄' },
  { key: 'Raptor', name: '벨로키랍토르', short: '랩터', role: 2, atk: 6.5, hp: 95, aspd: 1.3, size: 0.62,
    ab: 'blade', abName: '바람칼날', abDesc: '후열에서 발톱 칼날 발사, 25% 확률로 2연사' },
  { key: 'Ptero', name: '프테라노돈', short: '프테라', role: 3, atk: 11, hp: 140, aspd: 0.9, size: 0.6,
    ab: 'dive', abName: '급강하 돌진', abDesc: '후열에서 날아올라 돌진 후 복귀, 적중 시 출혈' },
  { key: 'Sauropod', name: '브라키오사우루스', short: '브라키오', role: 1, atk: 8, hp: 280, aspd: 0.6, size: 1.0,
    ab: 'quake', abName: '대지 진동', abDesc: '긴 목으로 2열에서 공격, 5초마다 근접한 모든 적에게 150% 피해' },
  { key: 'Ankylo', name: '안킬로사우루스', short: '안킬로', role: 0, atk: 10, hp: 230, aspd: 0.75, size: 1.0,
    ab: 'club', abName: '꼬리 곤봉', abDesc: '25% 확률로 꼬리 곤봉 150% 피해 + 1.5초 기절' },
];
const SP_COUNT = SPECIES.length;
const ROLE_NAMES = ['전열 근접', '2열 공격', '후열 원거리', '후열 비행'];

// Raid: the spectral rex from Dino Nest's 망자의 분지.
const RAID = {
  name: '사룡 티라노사우루스', place: '사룡의 밤 · 망자의 분지', time: 90, maxTickets: 3, ticketSecs: 30 * 60,
  hp: (lv, s) => F.enemyHp(Math.max(3, s)) * 150 * Math.pow(1.45, lv - 1),
  atk: (lv, s) => F.enemyAtk(Math.max(3, s)) * 3 * Math.pow(1.18, lv - 1),
  amber: (lv) => 150 + 50 * lv,
  meat: (lv, s) => F.goldPerKill(s) * (160 + 40 * lv),
};
const RAID_CHAPTER = { name: '망자의 분지', sky: ['#090512', '#44205f'], far: '#291336', far2: '#382045', mid: '#180c25', mid2: '#100919', grass: '#52315e', dirt: ['#25182f', '#100b19'], moon: true, fog: true, flies: true, spirit: true };

// v: value per trait level I-III.
const TRAITS = {
  fire: { name: '불꽃 숨결', tag: '원거리', v: [1, 1.15, 1.3], color: '#ff7a2e', desc: (v) => `원거리 전환 · 맨 후열로 이동해 공격력 ${fmtPct(v)} 파이어볼 발사` },
  fury: { name: '난폭함', v: [0.15, 0.3, 0.5], color: '#ff6b5e', desc: (v) => `공격력 +${fmtPct(v)}` },
  swift: { name: '빠른 발', v: [0.12, 0.24, 0.4], color: '#7fe0ff', desc: (v) => `공격 속도 +${fmtPct(v)}` },
  hide: { name: '두꺼운 가죽', v: [0.2, 0.4, 0.7], color: '#c9a56b', desc: (v) => `체력 +${fmtPct(v)}` },
  fang: { name: '날카로운 이빨', v: [0.08, 0.16, 0.25], color: '#fff1a8', desc: (v) => `치명타 확률 +${fmtPct(v)}p` },
  hunt: { name: '사냥 본능', v: [0.4, 0.8, 1.4], color: '#ffb04a', desc: (v) => `치명 피해 +${fmtPct(v)}` },
  giant: { name: '거대 유전자', v: [0.08, 0.16, 0.25], color: '#b58cff', desc: (v) => `몸집 +${fmtPct(v)}, 공격·체력 +${fmtPct(v * 0.8)}` },
  regen: { name: '재생력', v: [0.01, 0.02, 0.035], color: '#7dff8a', desc: (v) => `초당 체력 ${(v * 100).toFixed(1)}% 회복` },
  pack: { name: '무리 본능', v: [0.04, 0.08, 0.14], color: '#ffd24a', desc: (v) => `무리 전체 공격력 +${fmtPct(v)}` },
  glut: { name: '대식가', v: [0.1, 0.2, 0.35], color: '#ff9a6b', desc: (v) => `무리 고기 획득 +${fmtPct(v)}` },
  egg: { name: '알 수집가', v: [0.04, 0.08, 0.14], color: '#fff6d8', desc: (v) => `부화 시 레벨 +1 확률 +${fmtPct(v)}p (무리)` },
  jaw: { name: '강철 턱', v: [0.25, 0.5, 0.9], color: '#c0c8d8', desc: (v) => `고유 능력 피해 +${fmtPct(v)}` },
  rage: { name: '광폭화', v: [0.3, 0.6, 1.0], color: '#ff3b3b', desc: (v) => `체력 50% 이하일 때 공격력 +${fmtPct(v)}` },
};
const TRAIT_IDS = Object.keys(TRAITS);
const ROMAN = ['', 'Ⅰ', 'Ⅱ', 'Ⅲ'];
const traitV = (k, l) => TRAITS[k].v[Math.max(1, Math.min(3, l)) - 1];

// Recruit level -> hatch level odds (percent for Lv.1..Lv.6).
const RECRUIT_ODDS = [
  [80, 18, 2, 0, 0, 0],
  [70, 24, 5, 1, 0, 0],
  [60, 28, 9, 2.6, 0.4, 0],
  [50, 30, 14, 5, 1, 0],
  [40, 32, 18, 7.5, 2.3, 0.2],
  [32, 32, 22, 10, 3.5, 0.5],
  [25, 31, 25, 13, 5.2, 0.8],
  [18, 30, 28, 16, 6.8, 1.2],
  [12, 28, 30, 19, 9, 2],
  [8, 24, 32, 22, 11, 3],
];
const RECRUIT_XP = [15, 35, 70, 120, 190, 280, 400, 560, 760];

// Inheritance modes for nest births (percent).
const BREED_MODES = [
  { id: 'father', name: '아비 유전', p: 20, desc: '아비의 종·색·특성을 그대로' },
  { id: 'mother', name: '어미 유전', p: 20, desc: '어미의 종·색·특성을 그대로' },
  { id: 'both', name: '양친 유전', p: 25, desc: '양쪽 특성을 모두 물려받음 (최대 4개)' },
  { id: 'mix', name: '혼합 유전', p: 35, desc: '두 종의 고유 능력을 함께 가진 혼종 · 색이 섞이고 같은 특성은 강화' },
];
const MUTATION = 0.08;

// Wild dinosaurs: grayscale with burning red eyes, as in Dino Nest.
const ENEMY_TYPES = {
  grunt: { name: '야생 공룡', pool: [0, 2, 3, 4, 5, 9], hp: 1, atk: 1, spd: 30, aspd: 1.3, gold: 1 },
  spitter: { name: '야생 랩터', pool: [6], range: 130, proj: 'venom', hp: 0.65, atk: 0.75, spd: 28, aspd: 2.2, gold: 1.2, scale: 1.25 },
  brute: { name: '광폭 공룡', pool: [0, 3, 2], hp: 1.7, atk: 1.8, spd: 42, aspd: 1.0, gold: 1.6, scale: 1.12 },
  armored: { name: '갑각 공룡', pool: [9, 5, 1], hp: 2.8, atk: 0.7, spd: 22, aspd: 1.4, gold: 1.8, scale: 1.05 },
  boss: { name: '무리의 우두머리', pool: [0, 2, 5, 8], hp: 18, atk: 3, spd: 20, aspd: 1.7, cleave: true, gold: 14, scale: 1.5, boss: true },
  warlord: { name: '태고의 폭군', pool: [0, 2], hp: 45, atk: 4.5, spd: 18, aspd: 1.8, cleave: true, gold: 45, scale: 1.8, boss: true },
};

const WAVES_PER_STAGE = 5; // the last one is the boss wave
const STAGES_PER_CHAPTER = 10;

// Painted backdrops from Dino Nest's chapter palettes.
const CHAPTERS = [
  { name: '고사리 평원', sky: ['#78c4e8', '#f2e2aa'], far: '#86ad84', far2: '#a7c59c', mid: '#3d7a35', mid2: '#2c5a29', grass: '#6f9a3a', dirt: ['#7d5d36', '#5f4528'], sun: '#fff6c9' },
  { name: '안개 늪지', sky: ['#8fb0a6', '#dde2c2'], far: '#789887', far2: '#91ab9b', mid: '#335b48', mid2: '#264536', grass: '#4f7044', dirt: ['#4f4a32', '#3a3626'], sun: '#f4f6e6', fog: true },
  { name: '붉은 협곡', sky: ['#f0a05c', '#f8d59c'], far: '#c1674a', far2: '#d98c63', mid: '#8a4530', mid2: '#6b3323', grass: '#a87a40', dirt: ['#8a5530', '#6b3f22'], sun: '#fff1c0' },
  { name: '화산 기슭', sky: ['#2c2136', '#b6462e'], far: '#3c2526', far2: '#56302a', mid: '#271d1c', mid2: '#1b1413', grass: '#4d3d30', dirt: ['#3a2c22', '#2a1f18'], volcano: true, embers: true },
  { name: '달빛 밀림', sky: ['#141f3b', '#3a5181'], far: '#22345a', far2: '#2d426f', mid: '#13253b', mid2: '#0c1a2b', grass: '#2b4237', dirt: ['#22302a', '#18221d'], moon: true, flies: true },
];

// Dino Nest's twelve skills. grade 0-5 uses the first six rainbow colours.
const SKILLS = [
  { id: 'meteor', name: '운석 낙하', grade: 0, cd: 6, base: 380, per: 45, desc: (v) => `적 무리에 운석을 떨어뜨려 공격력 ${v}% 범위 피해` },
  { id: 'spikes', name: '가시 폭풍', grade: 0, cd: 8, base: 130, per: 16, desc: (v) => `가시 16개를 쏟아부어 각각 ${v}% 피해` },
  { id: 'glacier', name: '빙하 칼날', grade: 1, cd: 7, base: 380, per: 45, desc: (v) => `전방을 관통하는 빙하 칼날 ${v}% 피해 + 3초 둔화` },
  { id: 'thunder', name: '번개 발톱', grade: 1, cd: 8, base: 320, per: 38, desc: (v) => `적 5마리에게 번개 ${v}% 피해 + 기절` },
  { id: 'poison', name: '독 안개', grade: 2, cd: 10, base: 75, per: 9, desc: (v) => `독 안개 5초, 0.5초마다 ${v}% 피해` },
  { id: 'hunt', name: '사냥의 함성', grade: 2, cd: 15, base: 60, per: 6, buff: true, desc: (v) => `7초간 공룡 공격 속도 +${v}%` },
  { id: 'wall', name: '대지 방벽', grade: 3, cd: 16, base: 30, per: 3, buff: true, desc: (v) => `8초간 모든 공룡에게 최대 체력 ${v}% 보호막` },
  { id: 'volcano', name: '화산 폭발', grade: 3, cd: 12, base: 120, per: 14, desc: (v) => `용암 장판 5초, 0.5초마다 ${v}% 피해` },
  { id: 'vortex', name: '칼날 소용돌이', grade: 3, cd: 13, base: 650, per: 78, desc: (v) => `전장을 휩쓰는 칼날 소용돌이 ${v}% 피해 + 넉백` },
  { id: 'rain', name: '치유의 비', grade: 4, cd: 18, base: 40, per: 3, buff: true, desc: (v) => `모든 공룡 체력 ${v}% 회복` },
  { id: 'roar', name: '포효', grade: 4, cd: 16, base: 850, per: 100, desc: (v) => `대지를 울리는 포효, 화면의 모든 적에게 ${v}% 피해` },
  { id: 'primal', name: '태고의 분노', grade: 5, cd: 20, base: 2200, per: 260, desc: (v) => `태고의 화염 기둥 ${v}% 피해 + 기절` },
];
const SKILL_BY_ID = Object.fromEntries(SKILLS.map((s) => [s.id, s]));
const SKILL_ODDS = [44, 30, 16, 7, 2.5, 0.5];
const SKILL_SLOT_UNLOCK = [0, 0, 0, 3, 8, 15]; // max stage index required
const SKILL_MAX_LV = 30;
const SKILL_COST = { one: 50, ten: 450 };

const UPGRADES = [
  { id: 'atk', name: '공격 본능', icon: 'claw', cost: 25, rate: 1.13,
    val: (l) => Math.pow(1.06, l), show: (v) => '+' + fmtPct(v - 1) },
  { id: 'hp', name: '생존 본능', icon: 'heart', cost: 25, rate: 1.13,
    val: (l) => Math.pow(1.065, l), show: (v) => '+' + fmtPct(v - 1) },
  { id: 'aspd', name: '질주 본능', icon: 'bolt', cost: 60, rate: 1.22, max: 40,
    val: (l) => 1 + 0.025 * l, show: (v) => '+' + fmtPct(v - 1) },
  { id: 'crit', name: '포식 본능 (치명타)', icon: 'fang', cost: 80, rate: 1.2, max: 50,
    val: (l) => 0.05 + 0.006 * l, show: (v) => fmtPct(v) },
  { id: 'critDmg', name: '급소 공격 (치명 피해)', icon: 'skull', cost: 100, rate: 1.17,
    val: (l) => 1.5 + 0.12 * l, show: (v) => fmtPct(v) },
  { id: 'skill', name: '태고의 힘 (스킬 피해)', icon: 'flame', cost: 150, rate: 1.15,
    val: (l) => 1 + 0.06 * l, show: (v) => '+' + fmtPct(v - 1) },
  { id: 'armor', name: '비늘 갑옷', icon: 'shield', cost: 120, rate: 1.18,
    val: (l) => 1 - 1 / (1 + 0.035 * l), show: (v) => '피해 -' + fmtPct(v) },
  { id: 'gold', name: '사냥꾼의 감 (고기)', icon: 'meat', cost: 60, rate: 1.17,
    val: (l) => 1 + 0.06 * l, show: (v) => '+' + fmtPct(v - 1) },
  { id: 'march', name: '진격 속도', icon: 'foot', cost: 200, rate: 1.3, max: 20,
    val: (l) => 1 + 0.05 * l, show: (v) => '+' + fmtPct(v - 1) },
];
const UPGRADE_BY_ID = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));

// ---------- formulas ----------
const F = {
  enemyHp: (s) => 30 * Math.pow(1.175, s),
  enemyAtk: (s) => 7 * Math.pow(1.165, s),
  goldPerKill: (s) => 3 * Math.pow(1.14, s),
  summonCost: (s) => Math.round(20 * Math.pow(1.14, s)),
  upgradeCost: (u, lv) => Math.round(u.cost * Math.pow(u.rate, lv)),
  stageGems: (s) => 10 + Math.floor(s / 5) * 2,
  stageLabel: (s) => `${Math.floor(s / STAGES_PER_CHAPTER) + 1}-${(s % STAGES_PER_CHAPTER) + 1}`,
  chapterIdx: (s) => Math.floor(s / STAGES_PER_CHAPTER) % CHAPTERS.length,
  chapter: (s) => CHAPTERS[Math.floor(s / STAGES_PER_CHAPTER) % CHAPTERS.length],
  skillValue: (sk, lv) => sk.base + sk.per * (lv - 1),
  skillNeed: (lv) => lv + 1,
};

function waveEnemies(s, w) {
  const boss = w === WAVES_PER_STAGE - 1;
  const n = Math.min(5 + Math.floor(s * 0.5) + w, 18);
  const pool = [['grunt', 10]];
  if (s >= 1) pool.push(['spitter', 3]);
  if (s >= 3) pool.push(['brute', 3]);
  if (s >= 5) pool.push(['armored', 3]);
  const total = pool.reduce((a, p) => a + p[1], 0);
  const list = [];
  const count = boss ? Math.ceil(n * 0.6) : n;
  for (let i = 0; i < count; i++) {
    let r = Math.random() * total;
    for (const [id, wgt] of pool) { r -= wgt; if (r <= 0) { list.push(id); break; } }
  }
  if (boss) list.splice(Math.floor(list.length / 2), 0, (s % STAGES_PER_CHAPTER) === STAGES_PER_CHAPTER - 1 ? 'warlord' : 'boss');
  return list;
}

// Quest chain: kinds cycle, targets grow per tier.
const QUEST_KINDS = [
  { stat: 'kills', text: (n) => `야생 공룡 ${n}마리 처치`, target: (t) => 30 + 30 * t },
  { stat: 'summons', text: (n) => `알 ${n}개 부화`, target: (t) => 8 + 8 * t },
  { stat: 'merges', text: (n) => `공룡 합성 ${n}회`, target: (t) => 3 + 4 * t },
  { stat: 'upgrades', text: (n) => `능력치 강화 ${n}회`, target: (t) => 8 + 6 * t },
  { stat: 'stage', text: (n) => `스테이지 ${F.stageLabel(n - 1)} 도달`, target: (t) => 3 + 4 * t },
  { stat: 'bred', text: (n) => `교배 둥지에서 ${n}마리 탄생`, target: (t) => 2 + 4 * t },
  { stat: 'skillSummons', text: (n) => `스킬 소환 ${n}회`, target: (t) => 5 + 5 * t },
  { stat: 'bosses', text: (n) => `우두머리 ${n}마리 처치`, target: (t) => 1 + 2 * t },
];
function questDef(i) {
  const tier = Math.floor(i / QUEST_KINDS.length);
  const kind = QUEST_KINDS[i % QUEST_KINDS.length];
  return { kind, target: kind.target(tier), reward: 30 + 10 * tier };
}

// ---------- formatting ----------
const UNITS = ['', 'K', 'M', 'B', 'T', 'aa', 'ab', 'ac', 'ad', 'ae', 'af'];
function fmt(n) {
  n = Math.floor(n);
  if (n < 10000) return n.toLocaleString('en-US');
  let i = 0;
  let v = n;
  while (v >= 1000 && i < UNITS.length - 1) { v /= 1000; i++; }
  return (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)) + UNITS[i];
}
function fmtPct(v) {
  const p = v * 100;
  return (p >= 100 ? fmt(p) : p.toFixed(p % 1 ? 1 : 0)) + '%';
}

function pickWeighted(weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < weights.length; i++) { r -= weights[i]; if (r < 0) return i; }
  return weights.length - 1;
}

// ---------- dinosaur records ----------
// { id, sp (species), sp2 (second species of a hybrid, else = sp), lv, sex 'm'|'f', hue (deg),
//   tr [[trait, level]], gen, pa (parents), lock }
const isHybrid = (d) => d.sp2 !== d.sp;
const dinoName = (d) => (isHybrid(d) ? `${SPECIES[d.sp].short}·${SPECIES[d.sp2].short} 혼종` : SPECIES[d.sp].name);
const dinoShort = (d) => (isHybrid(d) ? `${SPECIES[d.sp].short}·${SPECIES[d.sp2].short}` : SPECIES[d.sp].short);
const sexMark = (s) => (s === 'm' ? '♂' : '♀');
const hasTrait = (d, k) => d.tr.some((t) => t[0] === k);
const traitLv = (d, k) => { const t = d.tr.find((x) => x[0] === k); return t ? t[1] : 0; };
// Ranged or flier: these always work their way to the rearmost rank.
const dinoRole = (d) => (hasTrait(d, 'fire') ? 2 : SPECIES[d.sp].role);
const isBackline = (d) => dinoRole(d) >= 2;
