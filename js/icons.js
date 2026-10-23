'use strict';
// Vector icons (UI + canvas) and painted eggs. Everything is SVG so it stays crisp at any size.

const ICON = (() => {
  const O = '#2b1a0e'; // outline
  const wrap = (body, defs = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${defs ? '<defs>' + defs + '</defs>' : ''}<g stroke="${O}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">${body}</g></svg>`;
  const EGG = 'M32 4C46 4 56 25 56 40C56 53 45 61 32 61C19 61 8 53 8 40C8 25 18 4 32 4Z';

  function egg(c1, c2, spot, crack) {
    const id = 'e' + (c1 + c2).replace(/[^0-9a-f]/gi, '');
    return wrap(`<path d="${EGG}" fill="url(#${id})"/>
      <g stroke="none" fill="${spot}" opacity=".85"><ellipse cx="22" cy="30" rx="5" ry="4"/><ellipse cx="40" cy="20" rx="3.5" ry="3"/>
      <ellipse cx="42" cy="44" rx="6" ry="4.5"/><ellipse cx="24" cy="50" rx="3" ry="2.5"/><ellipse cx="33" cy="35" rx="2.5" ry="2"/></g>
      <path d="M20 16C23 11 27 9 30 9" fill="none" stroke="#fff" stroke-opacity=".75" stroke-width="4"/>
      ${crack ? '<path d="M10 36L19 31L24 37L31 30L37 37L44 31L50 36L56 33" fill="none" stroke-width="3"/>' : ''}`,
    `<radialGradient id="${id}" cx=".38" cy=".3" r=".8"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></radialGradient>`);
  }

  const SVG = {
    meat: wrap(`<path d="M38 32L52 46" stroke-width="10"/><path d="M38 32L52 46" stroke="#f6ead2" stroke-width="5"/>
      <circle cx="55" cy="43" r="5" fill="#f6ead2"/><circle cx="49" cy="49" r="5" fill="#f6ead2"/>
      <path d="M29 7C45 5 52 22 43 33C35 43 14 46 8 36C3 26 13 9 29 7Z" fill="#d9542c"/>
      <path d="M22 14C30 11 37 14 39 20" fill="none" stroke="#ff9f7a" stroke-width="4"/>`),
    amber: wrap(`<path d="M32 4L54 16V46L32 60L10 46V16Z" fill="#f59b1c"/>
      <path d="M32 4L54 16L32 27L10 16Z" fill="#ffcf5e"/><path d="M32 27V60L10 46V16Z" fill="#e0800f"/>
      <path d="M33 33l4 3m-4-3l-4 3m4-3v-5m0 5v6" stroke="#5a2a00" stroke-width="2"/><circle cx="33" cy="31" r="2.6" fill="#5a2a00" stroke="none"/>
      <path d="M17 20L26 15" stroke="#fff6cf" stroke-width="4"/>`),
    gear: wrap(`<circle cx="32" cy="32" r="21" fill="none" stroke="#2b1a0e" stroke-width="15" stroke-dasharray="8.3 8.2"/>
      <circle cx="32" cy="32" r="21" fill="none" stroke="#e8e3d2" stroke-width="10" stroke-dasharray="8.3 8.2" stroke-linecap="butt"/>
      <circle cx="32" cy="32" r="17" fill="#e8e3d2"/><circle cx="32" cy="32" r="7" fill="#5b4a33"/>`),
    claw: wrap(`<path d="M14 54C22 38 26 22 24 8C32 22 32 40 20 56Z" fill="#ff6d5a"/>
      <path d="M28 56C36 40 40 24 38 10C46 24 46 42 34 58Z" fill="#ff6d5a"/>
      <path d="M42 54C49 42 52 30 51 18C57 30 56 44 47 56Z" fill="#ff6d5a"/>`),
    heart: wrap(`<path d="M32 56C10 40 6 28 10 18C14 8 28 8 32 18C36 8 50 8 54 18C58 28 54 40 32 56Z" fill="#ff5a6e"/>
      <path d="M16 20C18 15 22 14 25 15" fill="none" stroke="#ffc2c9" stroke-width="4"/>`),
    bolt: wrap(`<path d="M36 4L12 36H29L24 60L52 24H35L42 4Z" fill="#ffd83a"/>`),
    fang: wrap(`<path d="M12 10H52C52 30 42 44 32 58C22 44 12 30 12 10Z" fill="#fff6e0"/><path d="M20 16C22 28 26 36 31 44" fill="none" stroke="#d7c9a6" stroke-width="3"/>`),
    skull: wrap(`<path d="M10 30C10 14 22 6 34 6C48 6 56 16 56 28C56 36 52 40 48 42V52H20V44C14 42 10 38 10 30Z" fill="#f2ead8"/>
      <circle cx="24" cy="28" r="6" fill="#2b1a0e"/><circle cx="42" cy="28" r="6" fill="#2b1a0e"/><path d="M28 52V46M34 52V46M40 52V46" />`),
    flame: wrap(`<path d="M32 60C18 60 10 50 12 38C14 28 22 24 22 12C30 18 34 24 34 30C38 26 40 20 40 14C50 24 54 34 52 44C50 54 42 60 32 60Z" fill="#ff7a2e"/>
      <path d="M32 58C25 58 21 52 22 46C23 41 28 38 30 32C35 38 42 42 41 49C40 55 37 58 32 58Z" fill="#ffd83a" stroke-width="2"/>`),
    shield: wrap(`<path d="M32 4L54 12V30C54 44 44 54 32 60C20 54 10 44 10 30V12Z" fill="#5cbf5a"/>
      <path d="M18 20Q24 26 30 20Q36 26 42 20Q48 26 50 22M16 32Q22 38 28 32Q34 38 40 32Q46 38 50 33M20 44Q26 50 32 44Q38 50 44 44" fill="none" stroke="#2e7a32" stroke-width="3"/>`),
    foot: wrap(`<path d="M32 60C24 60 20 54 22 46L26 34C28 30 36 30 38 34L42 46C44 54 40 60 32 60Z" fill="#a8743f"/>
      <path d="M26 34L10 14L8 8L16 12L30 30Z" fill="#a8743f"/><path d="M30 30L30 8L32 3L35 8L35 30Z" fill="#a8743f"/><path d="M36 32L52 14L57 10L55 17L40 34Z" fill="#a8743f"/>`),
    lock: wrap(`<path d="M20 28V20C20 12 26 8 32 8C38 8 44 12 44 20V28" fill="none" stroke-width="7"/><path d="M20 28V20C20 12 26 8 32 8C38 8 44 12 44 20V28" fill="none" stroke="#c9ced8" stroke-width="3"/>
      <rect x="12" y="28" width="40" height="30" rx="6" fill="#ffc83a"/><circle cx="32" cy="41" r="4" fill="${O}"/><path d="M32 43V50"/>`),
    unlock: wrap(`<path d="M20 28V20C20 12 26 8 32 8C38 8 44 12 44 18" fill="none" stroke-width="7"/><path d="M20 28V20C20 12 26 8 32 8C38 8 44 12 44 18" fill="none" stroke="#c9ced8" stroke-width="3"/>
      <rect x="12" y="28" width="40" height="30" rx="6" fill="#9aa3b8"/><circle cx="32" cy="41" r="4" fill="${O}"/><path d="M32 43V50"/>`),
    nest: wrap(`<ellipse cx="22" cy="30" rx="9" ry="12" fill="#fff4d6"/><ellipse cx="42" cy="30" rx="9" ry="12" fill="#ffe0a6"/><ellipse cx="32" cy="27" rx="9" ry="12" fill="#e7f6ff"/>
      <path d="M4 34C8 54 56 54 60 34Z" fill="#a8743f"/><path d="M8 38L56 42M10 44L52 38M16 50L50 46" stroke="#6b4423" stroke-width="2.5"/>`),
    dna: wrap(`<path d="M20 4C20 20 44 22 44 32C44 42 20 44 20 60" fill="none" stroke="#7fd6ff" stroke-width="5"/>
      <path d="M44 4C44 20 20 22 20 32C20 42 44 44 44 60" fill="none" stroke="#ff8ad8" stroke-width="5"/>
      <path d="M24 12H40M28 20H36M28 44H36M24 52H40" stroke-width="3"/>`),
    spark: wrap(`<path d="M32 2L38 26L62 32L38 38L32 62L26 38L2 32L26 26Z" fill="#fff1a0"/><circle cx="32" cy="32" r="5" fill="#fff" stroke="none"/>`),
    crown: wrap(`<path d="M8 50L4 18L20 30L32 10L44 30L60 18L56 50Z" fill="#ffd24a"/><rect x="8" y="50" width="48" height="8" rx="3" fill="#f0a020"/>
      <circle cx="32" cy="38" r="4" fill="#ff5a6e"/>`),
    male: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><g fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="26" cy="38" r="15" stroke="${O}" stroke-width="10"/><path d="M37 27L54 10M40 10H54V24" stroke="${O}" stroke-width="10"/><circle cx="26" cy="38" r="15" stroke="#5fb7ff" stroke-width="6"/><path d="M37 27L54 10M40 10H54V24" stroke="#5fb7ff" stroke-width="6"/></g></svg>`,
    female: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><g fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="32" cy="24" r="15" stroke="${O}" stroke-width="10"/><path d="M32 39V60M22 51H42" stroke="${O}" stroke-width="10"/><circle cx="32" cy="24" r="15" stroke="#ff7ac0" stroke-width="6"/><path d="M32 39V60M22 51H42" stroke="#ff7ac0" stroke-width="6"/></g></svg>`,
    egg: egg('#fffaf0', '#e3d3b0', '#b5a27e'),
    eggCrack: egg('#fffaf0', '#e3d3b0', '#b5a27e', true),
  };

  // Skill badges: circle with a painted glyph.
  function badge(c1, c2, glyph) {
    const id = 'b' + (c1 + c2).replace(/[^0-9a-f]/gi, '');
    return wrap(`<circle cx="32" cy="32" r="29" fill="url(#${id})"/>${glyph}`,
      `<radialGradient id="${id}" cx=".4" cy=".35" r=".75"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></radialGradient>`);
  }
  const SKILL_SVG = {
    meteor: badge('#ffb35c', '#7a2b10', `<path d="M10 12L34 30M16 8L38 26M8 20L30 36" stroke="#ffe08a" stroke-width="5"/><circle cx="40" cy="40" r="13" fill="#7b5a44"/><circle cx="36" cy="36" r="3" fill="#5a4030" stroke="none"/><circle cx="45" cy="44" r="4" fill="#5a4030" stroke="none"/>`),
    spikes: badge('#c6f29a', '#2f6a22', `<path d="M14 52L22 16L28 52Z" fill="#fff4dc"/><path d="M26 52L34 8L40 52Z" fill="#fff4dc"/><path d="M38 52L46 20L52 52Z" fill="#fff4dc"/><path d="M8 52H56" stroke-width="4"/>`),
    glacier: badge('#d8f6ff', '#2b6fb8', `<path d="M14 50C30 46 44 32 48 10C54 30 46 50 22 56Z" fill="#e8fbff"/><path d="M22 50C34 44 42 34 46 22" fill="none" stroke="#7fd6ff" stroke-width="3"/>`),
    thunder: badge('#e2b8ff', '#3d1a7a', `<path d="M38 6L18 34H31L26 58L48 26H35L42 6Z" fill="#ffe14a"/><path d="M10 20L18 12M8 32L16 26M48 50L56 44" stroke="#fff" stroke-width="3"/>`),
    poison: badge('#c8ff8a', '#244d12', `<circle cx="24" cy="34" r="11" fill="#8ee05a"/><circle cx="38" cy="28" r="12" fill="#a6f06a"/><circle cx="40" cy="44" r="8" fill="#6fc444"/><circle cx="20" cy="18" r="4" fill="#b8ff7a"/><circle cx="48" cy="14" r="3" fill="#b8ff7a"/>`),
    hunt: badge('#ffb08a', '#8a1d14', `<path d="M14 50C22 36 24 24 22 12C30 24 30 38 20 52Z" fill="#fff"/><path d="M28 52C36 38 38 26 36 14C44 26 44 40 34 54Z" fill="#fff"/><path d="M44 30L50 22L56 30M44 42L50 34L56 42" fill="none" stroke="#ffe08a" stroke-width="4"/>`),
    wall: badge('#e8c79a', '#6b4423', `<path d="M10 54V26H54V54Z" fill="#b58a5a"/><path d="M10 36H54M10 46H54M22 26V36M38 26V36M16 36V46M30 36V46M46 36V46M24 46V54M40 46V54" stroke-width="2.5"/><path d="M14 26L20 12L28 18L36 8L44 18L50 14L54 26" fill="#8fd0ff"/>`),
    volcano: badge('#ff9a5a', '#3a1210', `<path d="M6 56L24 22H40L58 56Z" fill="#5a3a30"/><path d="M24 22C26 30 22 36 26 42M40 22C38 32 42 40 38 48" fill="none" stroke="#ff7a2e" stroke-width="4"/><path d="M26 22C24 12 30 6 32 4C34 8 40 12 38 22Z" fill="#ffd83a"/>`),
    vortex: badge('#a8fff0', '#16635a', `<path d="M32 32C32 26 40 26 40 32C40 40 26 42 24 32C22 20 40 16 46 26C54 38 42 54 28 52C14 50 8 36 14 24" fill="none" stroke="#fff" stroke-width="5"/>`),
    rain: badge('#b8fff0', '#1d7a6a', `<path d="M14 32C8 32 8 22 16 22C16 12 30 10 34 18C40 12 52 16 50 26C56 28 54 34 48 34Z" fill="#fff"/><path d="M20 42L18 48M32 42L30 50M44 42L42 48" stroke="#7fffb0" stroke-width="4"/><path d="M28 56H36M32 52V60" stroke="#7fffb0" stroke-width="3"/>`),
    roar: badge('#ffd38a', '#9a3a0a', `<path d="M12 40C12 28 20 22 30 24L40 20L36 30C40 34 38 42 30 44C22 46 14 46 12 40Z" fill="#7cc36a"/><path d="M24 34L32 30L30 38Z" fill="#fff" stroke-width="2"/><path d="M44 22C50 28 50 38 44 44M50 16C58 26 58 40 50 50" fill="none" stroke="#fff" stroke-width="4"/>`),
    primal: badge('#ffe08a', '#7a0a1a', `<path d="M32 58C20 58 14 48 18 38C20 32 24 30 24 20C30 26 32 30 32 34C36 28 36 18 34 8C46 18 50 32 48 44C46 52 40 58 32 58Z" fill="#ff5a2e"/><path d="M24 40L32 54L40 40Z" fill="#fff6e0"/>`),
  };

  const urlCache = {};
  const toUrl = (svg) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  function url(name) {
    if (!urlCache[name]) urlCache[name] = toUrl(SVG[name] || SKILL_SVG[name]);
    return urlCache[name];
  }
  const skillUrl = (id) => url(id);
  const html = (name, cls = 'ci') => `<img class="${cls}" src="${url(name)}" alt="">`;

  // Eggs tinted by level colour (cycle matches the level rainbow).
  function lvEggUrl(lv, crack) {
    const key = 'egg' + ((lv - 1) % LV_COLORS.length) + (crack ? 'c' : '');
    if (!urlCache[key]) {
      const c = lvColor(lv);
      urlCache[key] = toUrl(egg('#fffdf5', mix(c, '#ffffff', 0.45), c, crack));
    }
    return urlCache[key];
  }

  function mix(a, b, t) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const ch = (s) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
    return '#' + ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1);
  }

  function allUrls() {
    const list = Object.keys(SVG).map(url).concat(Object.keys(SKILL_SVG).map(url));
    for (let i = 1; i <= LV_COLORS.length; i++) list.push(lvEggUrl(i), lvEggUrl(i, true));
    return list;
  }

  return { url, skillUrl, html, lvEggUrl, allUrls, mix };
})();
