// Terra Incognita: a world-building map. Everything runs in the page; the world is kept in localStorage.
(() => {
'use strict';

// ------------------------------------------------------------------ constants
const W = 480, H = 300, N = W * H;
const KM = 10;                 // km per cell
const LEAGUE = 4.8;            // km per league
const LAT0 = 58, LAT_SPAN = 27, LON0 = -12, LON_SPAN = 61;
const MAX_ELEV = 5200, MAX_DEPTH = 5400;
const RIVER_T = 70, LAKE_MIN = 0.003;
const DEFAULT_SEED = 20417;
const STORE_KEY = 'terra-incognita/world/v1', PREF_KEY = 'terra-incognita/prefs/v1';
const F_DISPLAY = '"IM Fell English", Georgia, serif';
const F_SC = '"IM Fell English SC", "IM Fell English", Georgia, serif';
const F_MONO = '"IBM Plex Mono", ui-monospace, Menlo, monospace';

// ------------------------------------------------------------------ utils
const $ = (s, el = document) => el.querySelector(s);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hash3(a, b, c) { let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 1274126177)) | 0; h = Math.imul(h ^ (h >>> 13), 1103515245); h ^= h >>> 16; return h >>> 0; }
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
function shuffle(a, rng) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const fmtInt = n => Math.round(n).toLocaleString('en-US');
function roundSig(v, d) { const m = Math.pow(10, Math.floor(Math.log10(Math.max(1, v))) - d + 1); return Math.round(v / m) * m; }
function hexRgb(hex) { const n = parseInt(hex.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function hexA(hex, a) { const [r, g, b] = hexRgb(hex); return `rgba(${r},${g},${b},${a})`; }
function shade(hex, k) { const [r, g, b] = hexRgb(hex); return `rgb(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)})`; }
const cellAt = (x, y) => clamp(Math.floor(y), 0, H - 1) * W + clamp(Math.floor(x), 0, W - 1);
function fmtDeg(v, pos, neg) { const a = Math.abs(v); let d = Math.floor(a), m = Math.round((a - d) * 60); if (m === 60) { d++; m = 0; } return `${d}°${String(m).padStart(2, '0')}′${v >= 0 ? pos : neg}`; }
const fmtPos = (x, y) => `${fmtDeg(LAT0 - (y / H) * LAT_SPAN, 'N', 'S')} ${fmtDeg(LON0 + (x / W) * LON_SPAN, 'E', 'W')}`;
function compass(dx, dy) { const a = Math.atan2(-dy, dx); const dirs = ['east', 'northeast', 'north', 'northwest', 'west', 'southwest', 'south', 'southeast']; return dirs[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8]; }

// ------------------------------------------------------------------ noise
function makeNoise(seed) {
  const rnd = mulberry32(seed);
  const p = new Uint8Array(256); for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
  const perm = new Uint8Array(512), pm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) { perm[i] = p[i & 255]; pm[i] = perm[i] % 12; }
  const G = [1, 1, -1, 1, 1, -1, -1, -1, 1, 0, -1, 0, 1, 0, -1, 0, 0, 1, 0, -1, 0, 1, 0, -1];
  const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
  return function (xin, yin) {
    let n0 = 0, n1 = 0, n2 = 0;
    const s = (xin + yin) * F2, i = Math.floor(xin + s), j = Math.floor(yin + s);
    const t = (i + j) * G2, x0 = xin - (i - t), y0 = yin - (j - t);
    const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2, x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;
    let t0 = 0.5 - x0 * x0 - y0 * y0; if (t0 > 0) { const g = pm[ii + perm[jj]] * 2; t0 *= t0; n0 = t0 * t0 * (G[g] * x0 + G[g + 1] * y0); }
    let t1 = 0.5 - x1 * x1 - y1 * y1; if (t1 > 0) { const g = pm[ii + i1 + perm[jj + j1]] * 2; t1 *= t1; n1 = t1 * t1 * (G[g] * x1 + G[g + 1] * y1); }
    let t2 = 0.5 - x2 * x2 - y2 * y2; if (t2 > 0) { const g = pm[ii + 1 + perm[jj + 1]] * 2; t2 *= t2; n2 = t2 * t2 * (G[g] * x2 + G[g + 1] * y2); }
    return 70 * (n0 + n1 + n2);
  };
}
function fbm(nz, x, y, oct) { let a = 1, f = 1, s = 0, norm = 0; for (let o = 0; o < oct; o++) { s += a * nz(x * f, y * f); norm += a; a *= 0.5; f *= 2.03; } return s / norm; }

// ------------------------------------------------------------------ world vocab
const SHAPES = {
  blank: { label: 'Blank ocean', blank: true, freq: 1.6, warp: 0, amp: 0, ridge: 0, land: 0, mask: () => 0 },
  continent: { label: 'Continent', freq: 2.1, warp: 0.5, amp: 0.8, ridge: 0.5, land: 0.40, mask: (x, y) => { const dx = (x - 0.5) / 0.52, dy = (y - 0.5) / 0.5; return 0.5 - Math.sqrt(dx * dx + dy * dy); } },
  archipelago: { label: 'Archipelago', freq: 3.4, warp: 0.45, amp: 1.0, ridge: 0.35, land: 0.27, mask: (x, y) => { const dx = (x - 0.5) / 0.6, dy = (y - 0.5) / 0.55; return 0.15 - Math.sqrt(dx * dx + dy * dy) * 0.35; } },
  twin: { label: 'Twin lands', freq: 2.3, warp: 0.5, amp: 0.8, ridge: 0.5, land: 0.38, mask: (x, y) => { const a = Math.hypot((x - 0.28) / 0.24, (y - 0.42) / 0.36), b = Math.hypot((x - 0.73) / 0.23, (y - 0.58) / 0.36); return 0.5 - Math.min(a, b) * 0.9; } },
  inland: { label: 'Inland sea', freq: 2.3, warp: 0.5, amp: 0.75, ridge: 0.45, land: 0.5, mask: (x, y) => { const d = Math.hypot((x - 0.5) / 0.5, (y - 0.5) / 0.5); return 0.45 - Math.abs(d - 0.62) * 1.9; } },
};

const TONGUES = {
  north: { label: 'Northern', on: ['h', 'k', 't', 'v', 'sk', 'st', 'br', 'g', 'r', 'th', 's', 'fr', 'bj', 'ul', 'as'], vo: ['a', 'e', 'i', 'o', 'u', 'ei', 'ja', 'y', 'au'], co: ['rd', 'n', 'k', 'ld', 'rn', 'm', 'l', 'rk', 'ng', 'r'], suf: ['heim', 'vik', 'holm', 'gard', 'fjord', 'stad', 'by', 'havn', 'dal', 'nes'], realmSuf: ['land', 'mark', 'rike', 'heim'], titles: ['Kingdom', 'Jarldom', 'Hold'] },
  imperial: { label: 'Imperial', on: ['c', 'v', 't', 'l', 'm', 's', 'p', 'r', 'f', 'd', 'aur', 'val', 'cor', 'ser'], vo: ['a', 'e', 'i', 'o', 'u', 'ae', 'ia', 'io'], co: ['n', 's', 'r', 'l', 'x', 'nt'], suf: ['ium', 'ora', 'ana', 'ia', 'ano', 'essa', 'entum', 'ica', 'ona'], realmSuf: ['ia', 'ium', 'ora'], titles: ['Empire', 'Republic', 'Principality'] },
  sylvan: { label: 'Sylvan', on: ['l', 'th', 's', 'n', 'm', 'el', 'f', 'gw', 'r', 'v', 'cael', 'ith', 'al'], vo: ['a', 'e', 'i', 'ae', 'ie', 'o', 'ea', 'ia'], co: ['n', 'l', 'th', 'r', 's', 'nd'], suf: ['ion', 'ath', 'iel', 'ond', 'wen', 'dor', 'las', 'orn', 'ien'], realmSuf: ['dor', 'wen', 'lond', 'thas'], titles: ['Realm', 'Court', 'Kingdom'] },
  ember: { label: 'Ember', on: ['k', 'g', 'd', 'b', 't', 'z', 'kr', 'gr', 'dr', 'th', 'br', 'n'], vo: ['a', 'u', 'o', 'ar', 'ur', 'e'], co: ['k', 'rn', 'z', 'g', 'm', 'd', 'rk', 'nd', 'l'], suf: ['grim', 'dun', 'kar', 'zad', 'dur', 'gol', 'mek', 'hald'], realmSuf: ['dur', 'kar', 'zad'], titles: ['Holds', 'Thanedom', 'Under-Kingdom'] },
  vale: { label: 'Vale', compound: true, pre: ['Ash', 'Black', 'Brad', 'Dun', 'Elm', 'Frost', 'Green', 'Hart', 'Kings', 'Mar', 'Oak', 'Red', 'Stan', 'Thorn', 'West', 'Wolf', 'Wych', 'Ald', 'Bram', 'Ever', 'Fern', 'Glen', 'Hollow', 'Iron', 'Lark', 'Mill', 'North', 'Raven', 'Salt', 'Silver', 'Stone', 'Wen'], suf: ['ford', 'wick', 'ham', 'ton', 'bury', 'ley', 'mere', 'by', 'stead', 'wold', 'holt', 'combe', 'gate', 'bridge', 'moor', 'field', 'haven', 'dale'], realmSuf: ['shire', 'land', 'mark', 'reach'], titles: ['Kingdom', 'Commonwealth', 'Duchy', 'March'] },
  lilting: { label: 'Lilting', on: ['l', 'm', 'n', 'h', 'w', 't', 'k', 'p', 'v', ''], vo: ['a', 'e', 'o', 'ai', 'ua', 'i', 'ae', 'eo'], co: ['n', 'l'], suf: ['ani', 'ora', 'eli', 'una', 'ahi', 'ino'], realmSuf: ['ea', 'ani', 'ora'], titles: ['Confederacy', 'Queendom', 'League'] },
};
const TONGUE_IDS = Object.keys(TONGUES);
const ALL_TITLES = [...new Set(TONGUE_IDS.flatMap(t => TONGUES[t].titles).concat(['Free Cities', 'Theocracy', 'Empire', 'Kingdom']))];
const REALM_COLORS = ['#B4473A', '#3A6EA5', '#7B4F9C', '#C18A1E', '#2C8779', '#A33F6D', '#5D7F2B', '#CF6A36', '#4A549A'];

function makeName(tg, rng, o = {}) {
  const T = TONGUES[tg] || TONGUES.vale;
  for (let tries = 0; tries < 30; tries++) {
    let n;
    if (T.compound) {
      const a = pick(rng, T.pre); let b = pick(rng, o.realm ? T.realmSuf : T.suf);
      if (a.slice(-1).toLowerCase() === b[0]) b = b.slice(1);
      n = a + b;
    } else {
      const syl = () => pick(rng, T.on) + pick(rng, T.vo) + (rng() < 0.5 ? pick(rng, T.co) : '');
      n = syl(); if (rng() < 0.55) n += syl();
      if (o.realm) n += pick(rng, T.realmSuf);
      else if (!o.bare && rng() < 0.4) n += pick(rng, T.suf);
    }
    n = n.toLowerCase().replace(/(.)\1\1+/g, '$1$1');
    if (n.length < 3 || n.length > 12) continue;
    if (/[^aeiouy]{4,}/.test(n) || /[aeiouy]{4,}/.test(n)) continue;
    return n[0].toUpperCase() + n.slice(1);
  }
  return 'Nameless';
}

const B = { OCEAN: 0, LAKE: 1, ICE: 2, SNOW: 3, TUNDRA: 4, TAIGA: 5, STEPPE: 6, GRASS: 7, TFOREST: 8, TRAIN: 9, DESERT: 10, SAVANNA: 11, TROP: 12, JUNGLE: 13, ALPINE: 14, MARSH: 15 };
const BIOME_NAME = ['Open sea', 'Lake', 'Ice sheet', 'Snowfield', 'Tundra', 'Boreal forest', 'Steppe', 'Grassland', 'Temperate forest', 'Temperate rainforest', 'Desert', 'Savanna', 'Tropical forest', 'Jungle', 'Alpine rock', 'Marshland'];
const TER = [[0, 0, 0], [74, 128, 154], [232, 238, 240], [245, 246, 243], [163, 167, 146], [76, 104, 82], [194, 183, 126], [151, 175, 99], [88, 133, 72], [58, 110, 72], [221, 197, 146], [190, 176, 103], [86, 143, 70], [44, 111, 64], [139, 133, 121], [102, 132, 104]];
const ATL = [[0, 0, 0], [184, 205, 199], [244, 240, 228], [248, 245, 236], [220, 212, 182], [196, 196, 158], [229, 212, 164], [222, 213, 166], [206, 204, 156], [194, 198, 152], [237, 214, 164], [228, 208, 156], [204, 204, 150], [188, 196, 142], [212, 200, 176], [204, 206, 172]];
const FERT = [0, 0, 0, 0, 0.1, 0.35, 0.5, 1, 0.85, 0.6, 0.1, 0.7, 0.75, 0.45, 0, 0.3];
const GOODS = { 4: ['furs', 'walrus ivory'], 5: ['furs', 'pitch', 'timber'], 6: ['horses', 'wool'], 7: ['grain', 'wool', 'cheese'], 8: ['timber', 'honey', 'apples'], 9: ['timber', 'amber'], 10: ['salt', 'glass', 'dates'], 11: ['cattle', 'hides'], 12: ['dyes', 'cane sugar'], 13: ['spices', 'rare woods'], 14: ['silver', 'slate'], 15: ['peat', 'eels', 'reeds'], 2: ['whale oil'], 3: ['ice'] };

const KINDS = { capital: { label: 'Capital', claim: 0 }, city: { label: 'City', claim: 0.22 }, town: { label: 'Town', claim: 0.42 }, village: { label: 'Village', claim: 0.6 }, landmark: { label: 'Landmark' } };
const POP = { capital: [60000, 240000], city: [16000, 70000], town: [2500, 14000], village: [180, 1600] };
const LANDMARKS = {
  ruin: { label: 'Ruin', fmt: ['Ruins of %', '% Ruins', 'Old %'] },
  tower: { label: 'Tower', fmt: ['% Tower', 'Tower of %', 'The % Spire'] },
  temple: { label: 'Temple', fmt: ['Temple of %', 'Shrine of %', '% Abbey'] },
  cave: { label: 'Cave', fmt: ['% Caves', 'Hollow of %', 'The % Deep'] },
  battle: { label: 'Battlefield', fmt: ['Field of %', '% Field', 'Plain of %'] },
  monument: { label: 'Monument', fmt: ['The % Stone', '% Obelisk', 'Pillar of %'] },
};
const landmarkName = (sub, tg, rng) => pick(rng, LANDMARKS[sub].fmt).replace('%', makeName(tg, rng, { bare: true }));
const realmDisplay = r => r.title === 'Free Cities' ? `Free Cities of ${r.name}` : `The ${r.title} of ${r.name}`;
const realmMid = r => r.display.replace(/^The /, 'the ');
const kindLabel = p => p.kind === 'landmark' ? (LANDMARKS[p.sub] || LANDMARKS.ruin).label : KINDS[p.kind].label;

// ------------------------------------------------------------------ state
let world = null;
const ui = {
  tool: 'select', brush: { size: 10, strength: 5 }, settleKind: 'town', landmarkKind: 'ruin', labelKind: 'region', labelText: '',
  sketch: { mode: 'land', rough: 5, height: 'medium', width: 9, valley: 4 },
  style: 'terrain', layers: { realms: true, rivers: true, labels: true, names: true, grid: true }, selected: null, tab: 'inspect',
};
const D = {
  biome: new Uint8Array(N), temp: new Float32Array(N), tN: new Float32Array(N),
  filled: new Float32Array(N), down: new Int32Array(N), acc: new Float32Array(N), order: new Int32Array(N), lake: new Uint8Array(N), lakeF: new Float32Array(N),
  vis: new Uint8Array(N), isR: new Uint8Array(N), hasUp: new Uint8Array(N), mouth: new Int32Array(N),
  owner: new Int16Array(N), cost: new Float64Array(N), ind: new Float32Array(N), tmp: new Float32Array(N), dist: new Int16Array(N), q: new Int32Array(N),
  realms: [], borders: [], coast: new Path2D(), contours: null, riverPaths: [], riverLabels: [], glyphs: [], riverNames: new Map(),
};
const view = { s: 1, s0: 1, ox: 0, oy: 0, cw: 0, ch: 0, dpr: 1 };

const mkCanvas = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); return { c, x, img: x.createImageData(W, H) }; };
const L_SEA = mkCanvas(), L_LAND = mkCanvas(), L_TINT = mkCanvas();

function elevM(i) { const h = world.h[i], s = world.sea; if (h < s) return -MAX_DEPTH * Math.pow((s - h) / s, 0.85); return MAX_ELEV * Math.pow((h - s) / (1 - s), 1.6); }
const seaTemp = y => -7 + (y / H) * 35;
const precip = i => 90 + Math.pow(world.m[i], 1.3) * 2900;
const isLand = i => world.h[i] >= world.sea;

// ------------------------------------------------------------------ min-heap
const heap = {
  k: new Float64Array(1 << 18), v: new Int32Array(1 << 18), n: 0, lastKey: 0,
  clear() { this.n = 0; },
  push(key, val) {
    if (this.n >= this.k.length) { const k2 = new Float64Array(this.k.length * 2); k2.set(this.k); this.k = k2; const v2 = new Int32Array(this.v.length * 2); v2.set(this.v); this.v = v2; }
    const K = this.k, V = this.v; let i = this.n++;
    while (i > 0) { const p = (i - 1) >> 1; if (K[p] <= key) break; K[i] = K[p]; V[i] = V[p]; i = p; }
    K[i] = key; V[i] = val;
  },
  pop() {
    const K = this.k, V = this.v, top = V[0]; this.lastKey = K[0];
    const n = --this.n;
    if (n > 0) {
      const key = K[n], val = V[n]; let i = 0;
      for (;;) { const l = 2 * i + 1; if (l >= n) break; const r = l + 1; const c = (r < n && K[r] < K[l]) ? r : l; if (K[c] >= key) break; K[i] = K[c]; V[i] = V[c]; i = c; }
      K[i] = key; V[i] = val;
    }
    return top;
  },
};
const NBX = [-1, 1, 0, 0, -1, 1, -1, 1], NBY = [0, 0, -1, 1, -1, -1, 1, 1], NBD = [1, 1, 1, 1, 1.4142, 1.4142, 1.4142, 1.4142];

// ------------------------------------------------------------------ generation
function generateTerrain(seed, shape) {
  const cfg = SHAPES[shape] || SHAPES.continent;
  const nA = makeNoise(seed), nB = makeNoise(seed ^ 0x5bd1e995), nC = makeNoise(seed + 7919), nD = makeNoise(seed * 31 + 17);
  const rng = mulberry32(seed + 3);
  const o = [rng() * 100, rng() * 100, rng() * 100, rng() * 100];
  const v = new Float32Array(N), m = new Float32Array(N);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x, nx = x / W, ny = y / H;
      const px = x / H * cfg.freq, py = y / H * cfg.freq;
      if (cfg.blank) {
        v[i] = 0.5 * clamp(0.6 + fbm(nA, px + o[0], py + o[1], 5) * 0.45, 0.12, 0.93);
      } else {
        const wx = fbm(nB, px * 0.8 + o[0], py * 0.8 + o[1], 3) * cfg.warp;
        const wy = fbm(nB, px * 0.8 + o[2], py * 0.8 + o[3], 3) * cfg.warp;
        const e = fbm(nA, px + wx, py + wy, 6);
        let val = e * cfg.amp + cfg.mask(nx, ny);
        let r = 0, a = 0.6, f = 1.8;
        for (let k = 0; k < 4; k++) { const n = 1 - Math.abs(nC(px * f + o[1] + wx, py * f + o[2] + wy)); r += a * n * n; a *= 0.5; f *= 2.1; }
        val += Math.pow(Math.max(0, r - 0.4), 1.5) * cfg.ridge * 2.5 * smooth(-0.1, 0.3, val);
        const ed = Math.min(Math.min(nx, 1 - nx) * W / H, Math.min(ny, 1 - ny));
        const fall = smooth(0, 0.12, ed);
        v[i] = val * fall - (1 - fall) * 0.8;
      }
      let mo = 0.52 + fbm(nD, px * 1.1 + o[3], py * 1.1 + o[0], 5) * 0.95;
      mo -= 0.3 * Math.exp(-(((ny - 0.84) / 0.1) ** 2));
      mo += 0.08 * Math.exp(-(((ny - 0.45) / 0.18) ** 2));
      m[i] = clamp(mo, 0, 1);
    }
  }
  if (cfg.blank) return { h: v, m };
  const sorted = Float32Array.from(v).sort();
  const q = sorted[Math.floor((1 - cfg.land) * N)], mn = sorted[0], mx = sorted[N - 1];
  const h = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const val = v[i];
    h[i] = val < q ? 0.5 * Math.pow((val - mn) / (q - mn), 0.7) * 0.998 : 0.5 + 0.5 * Math.pow((val - q) / (mx - q), 1.35);
  }
  return { h, m };
}
function computeTN() {
  const nz = makeNoise(world.seed + 99);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) D.tN[y * W + x] = fbm(nz, x / H * 1.2, y / H * 1.2, 3) * 1.4;
}
function fillPits() {
  const h = world.h;
  for (let i = 0; i < N; i++) if (h[i] >= world.sea && D.filled[i] - h[i] > 0 && D.filled[i] - h[i] < 0.012) h[i] = D.filled[i];
}

// ------------------------------------------------------------------ hydrology
function hydrology() {
  const h = world.h, sea = world.sea, filled = D.filled, down = D.down, order = D.order, acc = D.acc, vis = D.vis;
  vis.fill(0); down.fill(-1); heap.clear();
  let cnt = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (h[i] < sea) {
      vis[i] = 1; filled[i] = h[i];
      for (let k = 0; k < 8; k++) { const nx = x + NBX[k], ny = y + NBY[k]; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; if (h[ny * W + nx] >= sea) { heap.push(sea, i); break; } }
    } else if (x === 0 || y === 0 || x === W - 1 || y === H - 1) {
      vis[i] = 1; filled[i] = h[i]; order[cnt++] = i; heap.push(h[i], i);
    }
  }
  while (heap.n) {
    const c = heap.pop(), key = heap.lastKey, cx = c % W, cy = (c / W) | 0;
    for (let k = 0; k < 8; k++) {
      const nx = cx + NBX[k], ny = cy + NBY[k]; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const n = ny * W + nx; if (vis[n]) continue;
      vis[n] = 1; const f = h[n] > key + 1e-6 ? h[n] : key + 1e-6; filled[n] = f; down[n] = c; order[cnt++] = n; heap.push(f, n);
    }
  }
  acc.fill(0);
  for (let i = 0; i < N; i++) if (h[i] >= sea) acc[i] = 0.25 + world.m[i];
  for (const sp of world.springs || []) { const i = cellAt(sp.x, sp.y); if (h[i] >= sea) acc[i] += sp.flow; }
  for (let k = cnt - 1; k >= 0; k--) { const i = order[k], d = down[i]; if (d >= 0 && h[d] >= sea) acc[d] += acc[i]; }
  for (let i = 0; i < N; i++) { const l = (h[i] >= sea && filled[i] - h[i] > LAKE_MIN) ? 1 : 0; D.lake[i] = l; D.lakeF[i] = l; }
}

function computeClimate(x0 = 0, y0 = 0, x1 = W - 1, y1 = H - 1) {
  x0 = Math.max(0, x0 | 0); y0 = Math.max(0, y0 | 0); x1 = Math.min(W - 1, x1 | 0); y1 = Math.min(H - 1, y1 | 0);
  const h = world.h, sea = world.sea;
  for (let y = y0; y <= y1; y++) {
    const Ts = seaTemp(y);
    for (let x = x0; x <= x1; x++) {
      const i = y * W + x, E = elevM(i);
      const T = Ts + D.tN[i] * 3 - (E > 0 ? E * 0.0065 : 0);
      D.temp[i] = T;
      let b;
      if (h[i] < sea) b = B.OCEAN;
      else if (D.lake[i]) b = B.LAKE;
      else {
        const P = precip(i);
        if (T < -6) b = E > 1200 ? B.SNOW : B.ICE;
        else if (E > 2500) b = T < 1 ? B.SNOW : B.ALPINE;
        else if (T < 0) b = B.TUNDRA;
        else if (E < 70 && P > 2150) b = B.MARSH;
        else if (T < 6) b = P < 320 ? B.STEPPE : B.TAIGA;
        else if (T < 18) b = P < 320 ? B.STEPPE : P < 720 ? B.GRASS : P < 1500 ? B.TFOREST : B.TRAIN;
        else b = P < 420 ? B.DESERT : P < 950 ? B.SAVANNA : P < 1850 ? B.TROP : B.JUNGLE;
      }
      D.biome[i] = b;
    }
  }
}

// ------------------------------------------------------------------ contours
function contourInto(f, lv, out, keep) {
  const seg = (ax, ay, bx, by) => { if (keep && !keep((ax + bx) / 2, (ay + by) / 2)) return; out(ax, ay, bx, by); };
  for (let y = 0; y < H - 1; y++) {
    for (let x = 0; x < W - 1; x++) {
      const i = y * W + x, a = f[i], b = f[i + 1], c = f[i + W + 1], d = f[i + W];
      const code = (a > lv ? 8 : 0) | (b > lv ? 4 : 0) | (c > lv ? 2 : 0) | (d > lv ? 1 : 0);
      if (code === 0 || code === 15) continue;
      const X = x + 0.5, Y = y + 0.5;
      const T = () => [X + (lv - a) / (b - a), Y], R = () => [X + 1, Y + (lv - b) / (c - b)], Bo = () => [X + (lv - d) / (c - d), Y + 1], Le = () => [X, Y + (lv - a) / (d - a)];
      const S = (p, q) => seg(p[0], p[1], q[0], q[1]);
      switch (code) {
        case 1: case 14: S(Le(), Bo()); break;
        case 2: case 13: S(Bo(), R()); break;
        case 3: case 12: S(Le(), R()); break;
        case 4: case 11: S(T(), R()); break;
        case 6: case 9: S(T(), Bo()); break;
        case 7: case 8: S(Le(), T()); break;
        case 5: { const ctr = (a + b + c + d) / 4 > lv; if (ctr) { S(Le(), T()); S(Bo(), R()); } else { S(T(), R()); S(Le(), Bo()); } break; }
        case 10: { const ctr = (a + b + c + d) / 4 > lv; if (ctr) { S(T(), R()); S(Le(), Bo()); } else { S(Le(), T()); S(Bo(), R()); } break; }
      }
    }
  }
}
function pathFromContour(f, lv, path, keep) { contourInto(f, lv, (ax, ay, bx, by) => { path.moveTo(ax, ay); path.lineTo(bx, by); }, keep); return path; }
function chainPath(f, lv, keep) {
  const segs = []; contourInto(f, lv, (ax, ay, bx, by) => segs.push(ax, ay, bx, by), keep);
  const n = segs.length / 4, key = (x, y) => Math.round(x * 64) * 100003 + Math.round(y * 64);
  const map = new Map(); const add = (k, s) => { const l = map.get(k); if (l) l.push(s); else map.set(k, [s]); };
  for (let s = 0; s < n; s++) { add(key(segs[s * 4], segs[s * 4 + 1]), s); add(key(segs[s * 4 + 2], segs[s * 4 + 3]), s); }
  const used = new Uint8Array(n), path = new Path2D();
  const extend = (pts) => {
    for (;;) {
      const ex = pts[pts.length - 2], ey = pts[pts.length - 1]; const l = map.get(key(ex, ey)); let found = -1;
      if (l) for (const s of l) if (!used[s]) { found = s; break; }
      if (found < 0) return;
      used[found] = 1; const o = found * 4;
      if (key(segs[o], segs[o + 1]) === key(ex, ey)) pts.push(segs[o + 2], segs[o + 3]); else pts.push(segs[o], segs[o + 1]);
    }
  };
  for (let s = 0; s < n; s++) {
    if (used[s]) continue; used[s] = 1; const o = s * 4;
    const fwd = [segs[o], segs[o + 1], segs[o + 2], segs[o + 3]]; extend(fwd);
    const back = [segs[o + 2], segs[o + 3], segs[o], segs[o + 1]]; extend(back);
    const pts = []; for (let k = back.length - 2; k >= 2; k -= 2) pts.push(back[k], back[k + 1]); for (let k = 0; k < fwd.length; k++) pts.push(fwd[k]);
    smoothLine(path, pts);
  }
  return path;
}
function smoothLine(path, pts) {
  const n = pts.length / 2; if (n < 2) return;
  path.moveTo(pts[0], pts[1]);
  if (n === 2) { path.lineTo(pts[2], pts[3]); return; }
  for (let j = 1; j < n - 1; j++) { const x = pts[j * 2], y = pts[j * 2 + 1], nx = pts[j * 2 + 2], ny = pts[j * 2 + 3]; path.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2); }
  path.lineTo(pts[(n - 1) * 2], pts[(n - 1) * 2 + 1]);
}
function buildCoast() {
  const p = new Path2D(); pathFromContour(world.h, world.sea, p); pathFromContour(D.lakeF, 0.5, p); D.coast = p;
}
function buildContours() {
  if (ui.style !== 'atlas') { D.contours = null; return; }
  const p = new Path2D(), sea = world.sea;
  for (const M of [350, 900, 1700, 2700, 3800]) { const e = Math.pow(M / MAX_ELEV, 1 / 1.6); pathFromContour(world.h, sea + e * (1 - sea), p); }
  D.contours = p;
}

// ------------------------------------------------------------------ rivers
const jit = (i, k) => ((hash3(i, k, 911) & 1023) / 1023 - 0.5) * 0.55;
const cxOf = i => (i % W) + 0.5 + jit(i, 1), cyOf = i => ((i / W) | 0) + 0.5 + jit(i, 2);
const riverBucket = a => clamp(Math.floor(Math.log2(a / RIVER_T) * 1.4), 0, 7);
function buildRivers() {
  const h = world.h, sea = world.sea, acc = D.acc, down = D.down, lake = D.lake, isR = D.isR, hasUp = D.hasUp, vis = D.vis;
  isR.fill(0); hasUp.fill(0); vis.fill(0); D.mouth.fill(-1);
  for (let i = 0; i < N; i++) if (h[i] >= sea && !lake[i] && acc[i] > RIVER_T) isR[i] = 1;
  for (let i = 0; i < N; i++) if (isR[i]) { const d = down[i]; if (d >= 0) hasUp[d] = 1; }
  const paths = Array.from({ length: 8 }, () => new Path2D());
  const mouths = [];
  for (let i = 0; i < N; i++) {
    if (!isR[i] || hasUp[i]) continue;
    let cur = i; const cells = [];
    for (let guard = 0; guard < 4000; guard++) {
      cells.push(cur); if (vis[cur]) break; vis[cur] = 1;
      const d = down[cur]; if (d < 0) { mouths.push(cur); break; }
      if (h[d] < sea) { mouths.push(cur); cells.push(d); break; }
      if (lake[d] || !isR[d]) { cells.push(d); break; }
      cur = d;
    }
    let run = [], rb = -1;
    for (let j = 0; j < cells.length - 1; j++) {
      const b = riverBucket(acc[cells[j]]);
      if (!run.length) { run.push(cxOf(cells[j]), cyOf(cells[j])); rb = b; }
      else if (b !== rb) { smoothLine(paths[rb], run); run = [cxOf(cells[j]), cyOf(cells[j])]; rb = b; }
      run.push(cxOf(cells[j + 1]), cyOf(cells[j + 1]));
    }
    if (run.length >= 4) smoothLine(paths[rb], run);
  }
  D.riverPaths = paths;
  D.riverNames = new Map();
  mouths.sort((a, b) => acc[b] - acc[a]);
  const labels = [];
  for (const m of mouths) {
    if (labels.length >= 4 || acc[m] < RIVER_T * 8) break;
    const stem = [m]; let cur = m;
    for (let g = 0; g < 500; g++) {
      const cx = cur % W, cy = (cur / W) | 0; let best = -1, ba = 0;
      for (let k = 0; k < 8; k++) { const nx = cx + NBX[k], ny = cy + NBY[k]; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const n = ny * W + nx; if (down[n] === cur && isR[n] && acc[n] > ba) { ba = acc[n]; best = n; } }
      if (best < 0) break; stem.push(best); cur = best;
    }
    if (stem.length < 26) continue;
    const k = Math.floor(stem.length * 0.45), a = stem[k - 6], b = stem[k + 6], p = stem[k];
    let ang = Math.atan2(cyOf(b) - cyOf(a), cxOf(b) - cxOf(a)); if (ang > Math.PI / 2) ang -= Math.PI; if (ang < -Math.PI / 2) ang += Math.PI;
    labels.push({ x: cxOf(p) + Math.sin(ang) * 1.8, y: cyOf(p) - Math.cos(ang) * 1.8, ang, name: riverName(m).full });
  }
  D.riverLabels = labels;
}
function mouthOf(i) {
  const path = []; let cur = i;
  for (let g = 0; g < 5000; g++) {
    if (D.mouth[cur] >= 0) { const m = D.mouth[cur]; for (const c of path) D.mouth[c] = m; return m; }
    path.push(cur); const d = D.down[cur];
    if (d < 0 || world.h[d] < world.sea) { for (const c of path) D.mouth[c] = cur; return cur; }
    cur = d;
  }
  return i;
}
function riverName(m) {
  let r = D.riverNames.get(m); if (r) return r;
  const rng = mulberry32(hash3(m, world.seed, 77));
  const tg = TONGUE_IDS[hash3(m, world.seed, 5) % TONGUE_IDS.length];
  const core = makeName(tg, rng, { bare: true });
  r = rng() < 0.55 ? { full: `River ${core}`, on: `the River ${core}` } : { full: `The ${core}`, on: `the ${core}` };
  D.riverNames.set(m, r); return r;
}

// ------------------------------------------------------------------ atlas glyphs
function buildGlyphs() {
  const g = []; D.glyphs = g;
  if (ui.style !== 'atlas') return;
  const h = world.h, sea = world.sea, seed = world.seed;
  const S1 = 5.4;
  for (let gy = 0; gy * S1 < H; gy++) for (let gx = 0; gx * S1 < W; gx++) {
    const r = hash3(gx, gy, seed ^ 0x9e37); const x = (gx + ((r & 255) / 255) * 0.8 + 0.1) * S1, y = (gy + (((r >>> 8) & 255) / 255) * 0.8 + 0.1) * S1;
    if (x >= W - 1 || y >= H - 1) continue; const i = (y | 0) * W + (x | 0); if (h[i] < sea || D.lake[i]) continue;
    const E = elevM(i);
    if (E > 1450) g.push({ t: 0, x, y, z: 2.4 + clamp((E - 1450) / 2600, 0, 1) * 3.2, snow: D.biome[i] === B.SNOW });
    else if (E > 700 && ((r >>> 16) & 3) === 0) g.push({ t: 1, x, y, z: 1.7 });
  }
  const S2 = 3.3;
  for (let gy = 0; gy * S2 < H; gy++) for (let gx = 0; gx * S2 < W; gx++) {
    const r = hash3(gx, gy, seed ^ 0x51f1); const x = (gx + ((r & 255) / 255) * 0.9 + 0.05) * S2, y = (gy + (((r >>> 8) & 255) / 255) * 0.9 + 0.05) * S2;
    if (x >= W - 1 || y >= H - 1) continue; const i = (y | 0) * W + (x | 0); if (h[i] < sea || D.lake[i]) continue;
    if (elevM(i) > 1250) continue;
    const b = D.biome[i];
    if (b === B.TAIGA) g.push({ t: 3, x, y, z: 1 });
    else if (b === B.TFOREST || b === B.TRAIN || b === B.TROP || b === B.JUNGLE) { if (b !== B.TFOREST || ((r >>> 16) & 3) !== 0) g.push({ t: 2, x, y, z: 1 }); }
    else if (b === B.MARSH && ((r >>> 16) & 1) === 0) g.push({ t: 4, x, y, z: 1 });
    else if (b === B.DESERT && ((r >>> 16) & 7) === 0) g.push({ t: 5, x, y, z: 1 });
  }
  g.sort((a, b) => a.y - b.y);
}

// ------------------------------------------------------------------ politics
function territories() {
  const caps = world.places.filter(p => p.kind === 'capital' && p.realm);
  D.realms = caps.map((p, idx) => ({
    idx, place: p, area: 0, pop: 0, count: 0, lx: p.x, ly: p.y,
    get name() { return p.realm.name; }, get title() { return p.realm.title; }, get color() { return p.realm.color; },
    get tongue() { return p.tongue; }, get display() { return realmDisplay(p.realm); },
  }));
  const own = D.owner, cost = D.cost, h = world.h, sea = world.sea, Lim = 115;
  const run = seeds => {
    own.fill(-1); cost.fill(Infinity); heap.clear();
    for (const s of seeds) { const i = cellAt(s.x, s.y); if (s.c < cost[i]) { cost[i] = s.c; own[i] = s.r; heap.push(s.c, i); } }
    while (heap.n) {
      const c = heap.pop(); if (heap.lastKey > cost[c]) continue;
      const cx = c % W, cy = (c / W) | 0;
      for (let k = 0; k < 8; k++) {
        const nx = cx + NBX[k], ny = cy + NBY[k]; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const n = ny * W + nx; let step;
        if (h[n] < sea) step = 4.5;
        else { const b = D.biome[n]; step = 1 + 4.5 * (h[n] - sea) / (1 - sea) + (D.lake[n] ? 3 : 0) + ((b === B.DESERT || b === B.ICE || b === B.SNOW) ? 1.2 : 0); }
        const nc = cost[c] + step * NBD[k];
        if (nc < cost[n] && nc <= Lim) { cost[n] = nc; own[n] = own[c]; heap.push(nc, n); }
      }
    }
  };
  run(D.realms.map(r => ({ x: r.place.x, y: r.place.y, c: 0, r: r.idx })));
  const seeds = D.realms.map(r => ({ x: r.place.x, y: r.place.y, c: 0, r: r.idx }));
  for (const p of world.places) {
    if (p.kind === 'capital' || p.kind === 'landmark') continue;
    const o = own[cellAt(p.x, p.y)]; if (o >= 0) seeds.push({ x: p.x, y: p.y, c: KINDS[p.kind].claim * Lim, r: o });
  }
  run(seeds);
  const sx = D.realms.map(() => 0), sy = D.realms.map(() => 0);
  for (let i = 0; i < N; i++) { const o = own[i]; if (o >= 0 && h[i] >= sea) { const r = D.realms[o]; r.area++; sx[o] += i % W; sy[o] += (i / W) | 0; } }
  for (const r of D.realms) {
    if (!r.area) continue;
    let cx = sx[r.idx] / r.area + 0.5, cy = sy[r.idx] / r.area + 0.5;
    if (own[cellAt(cx, cy)] !== r.idx || !isLand(cellAt(cx, cy))) {
      let bd = Infinity, bi = -1;
      for (let i = 0; i < N; i++) if (own[i] === r.idx && h[i] >= sea) { const d = (i % W - cx) ** 2 + (((i / W) | 0) - cy) ** 2; if (d < bd) { bd = d; bi = i; } }
      if (bi >= 0) { cx = bi % W + 0.5; cy = ((bi / W) | 0) + 0.5; }
    }
    const cp = r.place;
    if (Math.hypot(cx - cp.x, cy - cp.y) < 16) {
      for (const dy of [15, -15, 22, -22]) { const j = cellAt(cp.x, cp.y + dy); if (own[j] === r.idx && h[j] >= sea) { cx = cp.x; cy = cp.y + dy; break; } }
    }
    r.lx = cx; r.ly = cy;
  }
  for (const p of world.places) { if (p.kind === 'landmark') continue; const o = own[cellAt(p.x, p.y)]; if (o >= 0) { D.realms[o].pop += p.pop || 0; D.realms[o].count++; } }
}
function blur(a) {
  const t = D.tmp;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; t[i] = (a[x > 0 ? i - 1 : i] + a[i] + a[x < W - 1 ? i + 1 : i]) / 3; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; a[i] = (t[y > 0 ? i - W : i] + t[i] + t[y < H - 1 ? i + W : i]) / 3; }
}
function buildBorders() {
  const ind = D.ind, own = D.owner, h = world.h, sea = world.sea;
  const keep = (mx, my) => h[cellAt(mx, my)] >= sea;
  D.borders = D.realms.map(r => { for (let i = 0; i < N; i++) ind[i] = own[i] === r.idx ? 1 : 0; blur(ind); blur(ind); return chainPath(ind, 0.5, keep); });
}
function renderTint() {
  const d = L_TINT.img.data; d.fill(0);
  const cols = D.realms.map(r => hexRgb(r.color));
  for (let i = 0; i < N; i++) { const o = D.owner[i]; if (o >= 0 && world.h[i] >= world.sea && !D.lake[i]) { const c = cols[o], p = i * 4; d[p] = c[0]; d[p + 1] = c[1]; d[p + 2] = c[2]; d[p + 3] = 74; } }
  L_TINT.x.putImageData(L_TINT.img, 0, 0);
}

// ------------------------------------------------------------------ base render
function renderBase(x0 = 0, y0 = 0, x1 = W - 1, y1 = H - 1) {
  x0 = Math.max(0, x0 | 0); y0 = Math.max(0, y0 | 0); x1 = Math.min(W - 1, x1 | 0); y1 = Math.min(H - 1, y1 | 0);
  const atlas = ui.style === 'atlas', h = world.h, sea = world.sea, sd = L_SEA.img.data, ld = L_LAND.img.data, bio = D.biome;
  const K = atlas ? 4.5 : 11;
  const shallow = atlas ? [201, 216, 208] : [104, 166, 182];
  const beach = atlas ? [238, 226, 192] : [219, 205, 160];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * W + x, p = i * 4, hv = h[i];
      if (hv < sea) {
        const d = (sea - hv) / sea; let r, g, b;
        if (atlas) { const t = smooth(0, 0.35, d); r = lerp(201, 170, t); g = lerp(216, 194, t); b = lerp(208, 192, t); }
        else if (d < 0.1) { const t = d / 0.1; r = lerp(104, 54, t); g = lerp(166, 112, t); b = lerp(182, 144, t); }
        else { const t = smooth(0.1, 0.7, d); r = lerp(54, 24, t); g = lerp(112, 56, t); b = lerp(144, 90, t); }
        sd[p] = r; sd[p + 1] = g; sd[p + 2] = b; sd[p + 3] = 255; ld[p + 3] = 0;
        continue;
      }
      const bi = bio[i]; const c = atlas ? ATL[bi] : TER[bi];
      let r = c[0], g = c[1], b = c[2];
      if (bi !== B.LAKE) {
        const E = elevM(i);
        if (E < 60 && bi !== B.ICE && bi !== B.SNOW && bi !== B.MARSH && D.temp[i] > 3 &&
          ((x > 0 && h[i - 1] < sea) || (x < W - 1 && h[i + 1] < sea) || (y > 0 && h[i - W] < sea) || (y < H - 1 && h[i + W] < sea))) {
          r = lerp(r, beach[0], 0.7); g = lerp(g, beach[1], 0.7); b = lerp(b, beach[2], 0.7);
        }
        if (!atlas) { if (bi !== B.SNOW && bi !== B.ICE) { const k = smooth(900, 3200, E) * 0.55; r = lerp(r, 128, k); g = lerp(g, 118, k); b = lerp(b, 104, k); } }
        else { const k = 1 - smooth(500, 3800, E) * 0.16 + ((hash3(x, y, 3) & 15) - 7.5) * 0.004; r *= k; g *= k; b *= k; }
        const xl = x > 0 ? i - 1 : i, xr = x < W - 1 ? i + 1 : i, yu = y > 0 ? i - W : i, yd = y < H - 1 ? i + W : i;
        const sh = clamp(1 + ((h[xr] - h[xl]) + (h[yd] - h[yu])) * K, 0.6, 1.3);
        r *= sh; g *= sh; b *= sh;
      }
      ld[p] = r; ld[p + 1] = g; ld[p + 2] = b; ld[p + 3] = 255;
      sd[p] = shallow[0]; sd[p + 1] = shallow[1]; sd[p + 2] = shallow[2]; sd[p + 3] = 255;
    }
  }
  L_SEA.x.putImageData(L_SEA.img, 0, 0, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
  L_LAND.x.putImageData(L_LAND.img, 0, 0, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
}

function recomputeTerrain() { snapToSave(world.h); snapToSave(world.m); hydrology(); computeClimate(); buildRivers(); buildCoast(); buildContours(); buildGlyphs(); renderBase(); }
function recomputePolitics() { territories(); buildBorders(); renderTint(); }
function recomputeAll() { recomputeTerrain(); recomputePolitics(); requestDraw(); refreshPanels(); }

// ------------------------------------------------------------------ places
function fertility(i) {
  let f = 0.6 + FERT[D.biome[i]] * 0.7; const x = i % W, y = (i / W) | 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const j = ny * W + nx; if (world.h[j] < world.sea) f += 0.03; else if (D.isR[j]) f += 0.04; }
  return f;
}
function rollPop(kind, i, rng) { const r = POP[kind]; if (!r) return 0; return roundSig(r[0] * Math.pow(r[1] / r[0], rng()) * fertility(i), 2); }
function newRealm(tongue, rng) {
  const used = new Set(world.places.filter(p => p.realm).map(p => p.realm.color));
  const free = REALM_COLORS.filter(c => !used.has(c));
  return { name: makeName(tongue, rng, { realm: true }), title: pick(rng, TONGUES[tongue].titles), color: free.length ? pick(rng, free) : pick(rng, REALM_COLORS) };
}
function makePlace(kind, x, y, rng, o = {}) {
  const i = cellAt(x, y), own = D.owner[i];
  const tongue = o.tongue || (own >= 0 && D.realms[own] ? D.realms[own].tongue : pick(rng, TONGUE_IDS));
  const p = { id: world.nextId++, kind, x, y, tongue, name: '', lore: '', pop: 0 };
  if (kind === 'landmark') { p.sub = o.sub || 'ruin'; p.name = landmarkName(p.sub, tongue, rng); }
  else { p.name = makeName(tongue, rng); p.pop = rollPop(kind, i, rng); }
  if (kind === 'capital') p.realm = newRealm(tongue, rng);
  return p;
}
function siteScore(i) {
  const h = world.h, sea = world.sea; let s = FERT[D.biome[i]]; const x = i % W, y = (i / W) | 0; let river = 0, coast = false;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const j = ny * W + nx; if (h[j] < sea) coast = true; else if (D.acc[j] > RIVER_T) river = Math.max(river, D.acc[j]); }
  if (river) s += 0.5 + Math.min(0.6, Math.log2(river / RIVER_T) * 0.15);
  if (coast) s += 0.55;
  if (elevM(i) < 400) s += 0.15;
  return s;
}
function landmarkFits(sub, E, b, coastal) {
  switch (sub) {
    case 'ruin': return E < 1200 && [B.GRASS, B.TFOREST, B.TRAIN, B.DESERT, B.STEPPE, B.SAVANNA, B.JUNGLE].includes(b);
    case 'tower': return E > 500 && E < 2200;
    case 'temple': return E > 1400 || coastal;
    case 'cave': return E > 900 && E < 2600;
    case 'battle': return E < 700 && [B.GRASS, B.STEPPE, B.SAVANNA].includes(b);
    default: return E < 1500;
  }
}
function nearWater(i, r) { const x = i % W, y = (i / W) | 0; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; if (world.h[ny * W + nx] < world.sea) return true; } return false; }
function populate(seed) {
  const rng = mulberry32(seed * 7 + 13);
  world.places = []; world.labels = [];
  const h = world.h, sea = world.sea;
  let land = 0; for (let i = 0; i < N; i++) if (h[i] >= sea) land++;
  const cands = [];
  for (let k = 0; k < 9000; k++) {
    const i = (rng() * N) | 0; if (h[i] < sea || D.lake[i]) continue;
    const x = i % W, y = (i / W) | 0; if (x < 4 || y < 4 || x > W - 5 || y > H - 5) continue;
    const b = D.biome[i]; if (elevM(i) > 1800 || b === B.ICE || b === B.SNOW || b === B.ALPINE) continue;
    cands.push({ i, x: x + 0.5, y: y + 0.5, s: siteScore(i) + rng() * 0.5 });
  }
  cands.sort((a, b) => b.s - a.s);
  const nRealms = clamp(Math.round(land / 15000) + 1, 2, 5);
  const tongues = shuffle(TONGUE_IDS.slice(), rng);
  const far = (c, list, d) => list.every(p => (p.x - c.x) ** 2 + (p.y - c.y) ** 2 >= d * d);
  const caps = [];
  for (const minD of [85, 65, 45]) { for (const c of cands) { if (caps.length >= nRealms) break; if (far(c, caps, minD)) caps.push(c); } if (caps.length >= nRealms) break; }
  caps.forEach((c, k) => world.places.push(makePlace('capital', c.x, c.y, rng, { tongue: tongues[k % tongues.length] })));
  territories();
  for (const r of D.realms) {
    for (const [kind, count, minD] of [['city', 1, 24], ['town', 3, 15], ['village', 4, 9]]) {
      let left = count;
      for (const c of cands) { if (!left) break; if (D.owner[c.i] !== r.idx || !far(c, world.places, minD)) continue; world.places.push(makePlace(kind, c.x, c.y, rng)); left--; }
    }
  }
  let free = 3;
  for (const c of cands) { if (!free) break; if (D.owner[c.i] !== -1 || !far(c, world.places, 12)) continue; world.places.push(makePlace('village', c.x, c.y, rng)); free--; }
  for (const sub of Object.keys(LANDMARKS)) {
    for (let k = 0; k < 4000; k++) {
      const i = (rng() * N) | 0; if (h[i] < sea || D.lake[i]) continue;
      const x = i % W + 0.5, y = ((i / W) | 0) + 0.5; if (x < 8 || y < 8 || x > W - 8 || y > H - 8) continue;
      if (!landmarkFits(sub, elevM(i), D.biome[i], nearWater(i, 1)) || !far({ x, y }, world.places, 10)) continue;
      world.places.push(makePlace('landmark', x, y, rng, { sub })); break;
    }
  }
  territories();
  autoLabels(rng);
}
function autoLabels(rng) {
  const h = world.h, sea = world.sea, dist = D.dist, q = D.q; dist.fill(-1); let qh = 0, qt = 0;
  for (let i = 0; i < N; i++) if (h[i] >= sea) { dist[i] = 0; q[qt++] = i; }
  while (qh < qt) {
    const c = q[qh++], x = c % W, y = (c / W) | 0;
    for (let k = 0; k < 4; k++) { const nx = x + NBX[k], ny = y + NBY[k]; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const n = ny * W + nx; if (dist[n] < 0) { dist[n] = dist[c] + 1; q[qt++] = n; } }
  }
  const tg = () => D.realms.length ? pick(rng, D.realms).tongue : pick(rng, TONGUE_IDS);
  let first = null;
  for (let pass = 0; pass < 2; pass++) {
    const core = makeName(tg(), rng, { bare: true });
    const text = (pass === 0 ? pick(rng, ['The % Ocean', 'The % Sea', 'Sea of %']) : pick(rng, ['Gulf of %', 'The % Sound', 'Bay of %', 'The % Sea'])).replace('%', core);
    const size = pass ? 5.5 : 7, half = Math.ceil(text.length * size * 0.36) + 6;
    let best = -1, bd = pass ? 11 : 8;
    for (let y = 26; y < H - 24; y++) for (let x = half; x < W - half; x++) {
      if (x > W - 70 && y < 44) continue;
      const i = y * W + x; if (dist[i] > bd && (!first || Math.hypot(x - first.x, y - first.y) > 150)) { bd = dist[i]; best = i; }
    }
    if (best < 0) continue;
    const x = best % W + 0.5, y = ((best / W) | 0) + 0.5;
    world.labels.push({ id: world.nextId++, kind: 'sea', text, x, y, size, angle: 0 });
    if (!first) first = { x, y };
  }
  const peaks = [];
  for (let k = 0; k < 5000; k++) { const i = (rng() * N) | 0; if (h[i] >= sea && elevM(i) > 2100) peaks.push(i); }
  peaks.sort((a, b) => h[b] - h[a]);
  const chosen = [];
  for (const i of peaks) { const x = i % W, y = (i / W) | 0; if (x < 50 || x > W - 50 || y < 16 || y > H - 20) continue; if (chosen.every(c => Math.hypot(c.x - x, c.y - y) > 110)) chosen.push({ x, y }); if (chosen.length >= 2) break; }
  for (const c of chosen) {
    const text = pick(rng, ['The % Mountains', 'The % Peaks', 'The % Range', 'Spine of %', 'The % Teeth']).replace('%', makeName(tg(), rng, { bare: true }));
    world.labels.push({ id: world.nextId++, kind: 'range', text, x: c.x + 0.5, y: c.y + 5.5, size: 4.6, angle: Math.round((rng() - 0.5) * 24) });
  }
}
function worldTitle(shape, rng, tg) {
  const a = makeName(tg, rng, { realm: true });
  switch (shape) {
    case 'archipelago': return pick(rng, [`The ${a} Isles`, `The Isles of ${a}`]);
    case 'blank': return 'Untitled world';
    case 'twin': return `${a} and ${makeName(pick(rng, TONGUE_IDS), rng, { realm: true })}`;
    case 'inland': return pick(rng, [`The ${a} Basin`, `The Shores of ${a}`]);
    default: return pick(rng, [a, `The Lands of ${a}`, `The Known World of ${a}`]);
  }
}
function newWorld(seed, shape, opts = {}) {
  if (world && !opts.noUndo) pushUndo({ h: true, m: true, meta: true, world: true });
  const t = generateTerrain(seed, shape);
  if (!world) world = { h: t.h, m: t.m }; else { world.h.set(t.h); world.m.set(t.m); }
  Object.assign(world, { seed, shape, sea: 0.5, places: [], labels: [], springs: [], nextId: 1 });
  computeTN(); hydrology(); fillPits(); snapToSave(world.h); snapToSave(world.m); hydrology(); computeClimate(); buildRivers();
  populate(seed);
  const rng = mulberry32(seed + 404);
  world.name = worldTitle(shape, rng, D.realms.length ? D.realms[0].tongue : 'vale');
  ui.selected = null;
  recomputeAll();
}

// ------------------------------------------------------------------ undo
const undoStack = [], redoStack = [];
// A snapshot marked world was taken just before the whole world was replaced (a new world, or a file opened).
function takeSnap(parts) {
  const s = {};
  if (parts.world) s.world = true;
  if (parts.h) s.h = world.h.slice();
  if (parts.m) s.m = world.m.slice();
  if (parts.meta) s.meta = JSON.stringify({ name: world.name, seed: world.seed, shape: world.shape, sea: world.sea, places: world.places, labels: world.labels, springs: world.springs || [], nextId: world.nextId });
  return s;
}
function pushUndo(parts) { undoStack.push(takeSnap(parts)); if (undoStack.length > 30) undoStack.shift(); redoStack.length = 0; updateUndoButtons(); }
function applySnap(s) {
  const inv = takeSnap({ h: !!s.h, m: !!s.m, meta: !!s.meta, world: !!s.world });
  if (s.h) world.h.set(s.h);
  if (s.m) world.m.set(s.m);
  if (s.meta) {
    const o = JSON.parse(s.meta); if (!o.springs) o.springs = [];
    // Notes aren't part of undo, so a place that is still there keeps what was written in it since. Not across a new
    // world, though: its places reuse the old world's ids.
    if (!s.world) { const notes = new Map(world.places.map(p => [p.id, p.lore])); for (const p of o.places) if (notes.has(p.id)) p.lore = notes.get(p.id); }
    const seedChanged = o.seed !== world.seed; Object.assign(world, o); if (seedChanged) computeTN();
  }
  return inv;
}
function undo() { const s = undoStack.pop(); if (!s) return; redoStack.push(applySnap(s)); afterRestore(); }
function redo() { const s = redoStack.pop(); if (!s) return; undoStack.push(applySnap(s)); afterRestore(); }
function afterRestore() {
  if (ui.selected && ui.selected.type !== 'loc' && !findSel(ui.selected)) ui.selected = null;
  recomputeAll(); updateUndoButtons(); markDirty(); syncWorldTab();
}
function updateUndoButtons() { $('#btnUndo').disabled = !undoStack.length; $('#btnRedo').disabled = !redoStack.length; }

// ------------------------------------------------------------------ persistence
function b64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
function unb64(str) { const s = atob(str); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
// The save keeps heights and rainfall in steps of 1/65535. The terrain is rounded to those steps before rivers, lakes
// and borders are worked out, so the map on screen is exactly the one a reload brings back.
function snapToSave(a) { for (let i = 0; i < a.length; i++) a[i] = Math.round(clamp(a[i], 0, 1) * 65535) / 65535; }
function packF(a) { const u = new Uint16Array(a.length); for (let i = 0; i < a.length; i++) u[i] = Math.round(clamp(a[i], 0, 1) * 65535); return b64(new Uint8Array(u.buffer)); }
function unpackF(str) { const b = unb64(str); const u = new Uint16Array(b.buffer, 0, b.length >> 1); const f = new Float32Array(N); for (let i = 0; i < N; i++) f[i] = u[i] / 65535; return f; }
function serialize() {
  return JSON.stringify({ format: 'terra-incognita', version: 1, name: world.name, seed: world.seed, shape: world.shape, sea: world.sea, W, H, h: packF(world.h), m: packF(world.m), places: world.places, labels: world.labels, springs: world.springs || [], nextId: world.nextId, savedAt: new Date().toISOString() });
}
function loadObj(o) {
  if (!o || o.format !== 'terra-incognita' || o.W !== W || o.H !== H || typeof o.h !== 'string') throw new Error('bad');
  const h = unpackF(o.h), m = unpackF(o.m);
  if (!world) world = { h, m }; else { world.h.set(h); world.m.set(m); }
  Object.assign(world, { name: String(o.name || 'Untitled world'), seed: o.seed | 0, shape: SHAPES[o.shape] ? o.shape : 'continent', sea: clamp(+o.sea || 0.5, 0.4, 0.6), places: Array.isArray(o.places) ? o.places : [], labels: Array.isArray(o.labels) ? o.labels : [], nextId: o.nextId | 0 || 1,
    springs: Array.isArray(o.springs) ? o.springs.filter(sp => sp && isFinite(sp.x) && isFinite(sp.y)).map(sp => ({ x: clamp(+sp.x, 0, W), y: clamp(+sp.y, 0, H), flow: clamp(+sp.flow || 0, 0, 500) })) : [] });
  for (const p of world.places) { if (!KINDS[p.kind]) p.kind = 'village'; if (!TONGUES[p.tongue]) p.tongue = 'vale'; p.name = String(p.name || 'Nameless'); p.lore = String(p.lore || ''); }
  computeTN();
}
let saveTimer = 0;
function markDirty() { clearTimeout(saveTimer); saveTimer = setTimeout(saveLocal, 900); }
function saveLocal() {
  try { localStorage.setItem(STORE_KEY, serialize()); setSaveNote('Autosaved in this browser at ' + new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + '.'); }
  catch (e) { setSaveNote('This browser would not keep an autosave. Use Save world file to keep your work.', true); }
}
function loadLocal() { try { const s = localStorage.getItem(STORE_KEY); if (!s) return false; loadObj(JSON.parse(s)); return true; } catch (e) { return false; } }
function savePrefs() { try { localStorage.setItem(PREF_KEY, JSON.stringify({ style: ui.style, layers: ui.layers, brush: ui.brush, sketch: ui.sketch })); } catch (e) { } }
function loadPrefs() { try { const p = JSON.parse(localStorage.getItem(PREF_KEY) || 'null'); if (p) { if (p.style === 'atlas' || p.style === 'terrain') ui.style = p.style; Object.assign(ui.layers, p.layers || {}); Object.assign(ui.brush, p.brush || {}); Object.assign(ui.sketch, p.sketch || {}); } } catch (e) { } }
function setSaveNote(t, warn) { const el = $('#wSaveNote'); el.textContent = t; el.classList.toggle('warn', !!warn); }

// ------------------------------------------------------------------ claude runtime (optional)
const CL = (window.claude && typeof window.claude.use === 'function') ? window.claude : null;
let sampleFn = null, downloadsNS;
const dlReady = CL ? CL.use('downloads').then(d => { downloadsNS = d; }).catch(() => { downloadsNS = null; }) : Promise.resolve(downloadsNS = null);
if (CL) CL.use('sample').then(s => { sampleFn = s; if (ui.selected && ui.selected.type === 'place') renderInspector(); }).catch(() => { });

// ------------------------------------------------------------------ drawing
let needsDraw = false, plateColor = '#C4CFD3';
function refreshPlate() { plateColor = getComputedStyle(document.documentElement).getPropertyValue('--plate').trim() || '#C4CFD3'; requestDraw(); }
function requestDraw() { if (needsDraw) return; needsDraw = true; requestAnimationFrame(() => { needsDraw = false; draw(); }); }
function draw() {
  if (!world || !view.cw) return;
  drawMap(ctx, view.dpr, view.cw, view.ch, view, { plate: plateColor });
}
const LM_PATHS = {
  ruin: { d: 'M-5.5 3.2h11v1.6h-11z M-4.6 3.2v-7h2v7z M-1 3.2v-4.2h2v4.2z M2.6 3.2v-8.6h2v8.6z', fill: true },
  tower: { d: 'M-2.6 5V-4H-3.4V-7H-1.9V-5.6H-0.7V-7H0.7V-5.6H1.9V-7H3.4V-4H2.6V5Z', fill: true },
  temple: { d: 'M-5.5 -2.5L0 -6.5L5.5 -2.5Z M-4.6 -1.6h1.6v5h-1.6z M-0.8 -1.6h1.6v5h-1.6z M3 -1.6h1.6v5H3z M-5.6 3.6h11.2v1.4H-5.6z', fill: true },
  cave: { d: 'M-6 4.5A6 6.5 0 0 1 6 4.5Z', fill: true, inner: 'M-2.4 4.5A2.4 3.2 0 0 1 2.4 4.5Z' },
  battle: { d: 'M-5 5L5 -5M5 5L-5 -5M-4.6 1.4L-1.4 4.6M1.4 4.6L4.6 1.4', fill: false },
  monument: { d: 'M-2.2 4.5L-1.3 -5.2L0 -7.5L1.3 -5.2L2.2 4.5Z M-4 4.5h8v1.4h-8z', fill: true },
};
for (const k in LM_PATHS) { LM_PATHS[k].p = new Path2D(LM_PATHS[k].d); if (LM_PATHS[k].inner) LM_PATHS[k].ip = new Path2D(LM_PATHS[k].inner); }
function starPath(c, X, Y, R, r) { c.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r : R; c.lineTo(X + Math.cos(a) * rr, Y + Math.sin(a) * rr); } c.closePath(); }
function haloText(c, text, X, Y, fill, halo, lw) { if (halo) { c.lineWidth = lw; c.strokeStyle = halo; c.lineJoin = 'round'; c.strokeText(text, X, Y); } c.fillStyle = fill; c.fillText(text, X, Y); }

function drawMap(c, k, vw, vh, v, opt) {
  const s = v.s, ox = v.ox, oy = v.oy, atlas = ui.style === 'atlas', L = ui.layers, zr = s / v.s0;
  const small = clamp(Math.sqrt(v.s0 / 1.9), 0.78, 1); // names and icons shrink a little on a phone-sized map
  const INK = atlas ? '#46351f' : '#14222b';
  const HALO = atlas ? 'rgba(241,231,203,0.92)' : 'rgba(250,251,251,0.9)';
  c.setTransform(k, 0, 0, k, 0, 0);
  c.fillStyle = opt.plate; c.fillRect(0, 0, vw, vh);
  // map frame shadow
  c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(ox + 3, oy + 4, W * s, H * s);

  c.setTransform(k * s, 0, 0, k * s, k * ox, k * oy);
  c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
  c.drawImage(L_SEA.c, 0, 0, W, H);
  c.lineJoin = 'round'; c.lineCap = 'round';
  if (atlas) {
    for (const w of [7.5, 5, 2.6]) { c.lineWidth = w; c.strokeStyle = 'rgba(70,98,102,0.32)'; c.stroke(D.coast); c.lineWidth = Math.max(0, w - 1.1 / s); c.strokeStyle = 'rgb(201,216,208)'; c.stroke(D.coast); }
  }
  c.drawImage(L_LAND.c, 0, 0, W, H);
  if (L.realms && D.realms.length) { c.drawImage(L_TINT.c, 0, 0, W, H); }
  if (atlas && D.contours) { c.lineWidth = 0.7 / s; c.strokeStyle = 'rgba(110,82,50,0.32)'; c.stroke(D.contours); }
  if (L.rivers) {
    c.strokeStyle = atlas ? '#6c95a0' : '#3b7ba0';
    for (let b = 0; b < 8; b++) { c.lineWidth = Math.max(0.9 / s, 0.22 + b * 0.15); c.stroke(D.riverPaths[b]); }
  }
  c.lineWidth = (atlas ? 1.3 : 0.9) / s; c.strokeStyle = atlas ? 'rgba(70,52,30,0.85)' : 'rgba(16,38,52,0.55)'; c.stroke(D.coast);
  if (L.realms) {
    for (const r of D.realms) {
      const p = D.borders[r.idx]; if (!p) continue;
      c.setLineDash([]); c.lineWidth = 4.5 / s; c.strokeStyle = hexA(r.color, 0.42); c.stroke(p);
      c.setLineDash([4 / s, 3 / s]); c.lineWidth = 1.1 / s; c.strokeStyle = atlas ? 'rgba(70,52,30,.85)' : 'rgba(18,28,34,.72)'; c.stroke(p);
    }
    c.setLineDash([]);
  }
  if (L.grid) {
    c.lineWidth = 0.6 / s; c.strokeStyle = atlas ? 'rgba(80,60,36,0.22)' : 'rgba(255,255,255,0.22)';
    c.beginPath();
    for (let lat = 35; lat <= 55; lat += 5) { const y = (LAT0 - lat) / LAT_SPAN * H; c.moveTo(0, y); c.lineTo(W, y); }
    for (let lon = -10; lon <= 45; lon += 5) { const x = (lon - LON0) / LON_SPAN * W; c.moveTo(x, 0); c.lineTo(x, H); }
    c.stroke();
  }

  // ---- screen space
  c.setTransform(k, 0, 0, k, 0, 0);
  const X0 = ox, Y0 = oy, MW = W * s, MH = H * s;
  c.save(); c.beginPath(); c.rect(X0, Y0, MW, MH); c.clip();
  if (atlas) drawGlyphs(c, v, vw, vh);
  if (L.grid && zr > 0.7) {
    c.font = `10px ${F_MONO}`; c.fillStyle = atlas ? 'rgba(70,52,30,0.75)' : 'rgba(255,255,255,0.8)'; c.textBaseline = 'top'; c.textAlign = 'left';
    // Label every 5°, or every 10° when the map is small enough that they'd run together; keep clear of the compass.
    const lonStep = 5 / LON_SPAN * W * s < 46 ? 10 : 5, latStep = 5 / LAT_SPAN * H * s < 26 ? 10 : 5;
    for (let lat = 35; lat <= 55; lat += 5) { if (lat % latStep) continue; const y = oy + (LAT0 - lat) / LAT_SPAN * H * s; c.fillText(`${lat}°N`, Math.max(X0, 0) + 6, y + 3); }
    for (let lon = -10; lon <= 45; lon += 5) { if (lon % lonStep) continue; const x = ox + (lon - LON0) / LON_SPAN * W * s; if (x > Math.min(vw, X0 + MW) - 84) continue; c.fillText(`${Math.abs(lon)}°${lon < 0 ? 'W' : 'E'}`, x + 4, Math.max(Y0, 0) + 6); }
  }
  if (L.realms) drawRealmNames(c, v, atlas);
  if (L.rivers && L.labels && zr >= 0.95) {
    for (const r of D.riverLabels) {
      const fs = 11 * clamp(Math.pow(zr, 0.3), 1, 1.5) * small;
      c.save(); c.translate(ox + r.x * s, oy + r.y * s); c.rotate(r.ang);
      c.font = `italic ${fs}px ${F_DISPLAY}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.letterSpacing = `${(fs * 0.12).toFixed(1)}px`;
      haloText(c, r.name, 0, 0, atlas ? '#3f6570' : '#1e5877', HALO, 3);
      c.restore();
    }
    c.letterSpacing = '0px';
  }
  if (L.labels) drawUserLabels(c, v, atlas, HALO, opt);
  drawPlaces(c, v, vw, vh, atlas, INK, HALO, opt, small);
  if (!opt.export) drawSelection(c, v, atlas);
  if (!opt.export && sketchDraft) drawSketch(c, v);
  c.restore();

  // neatline
  c.strokeStyle = INK; c.lineWidth = 1.4; c.strokeRect(X0 - 0.5, Y0 - 0.5, MW + 1, MH + 1);
  c.lineWidth = 0.7; c.strokeStyle = atlas ? 'rgba(70,52,30,.7)' : (opt.export ? 'rgba(20,34,43,.6)' : 'rgba(20,34,43,.45)'); c.strokeRect(X0 - 4.5, Y0 - 4.5, MW + 9, MH + 9);

  if (!opt.export) drawCursor(c, v);
  drawCompass(c, Math.min(vw - 46, X0 + MW - 40), Math.max(46, Y0 + 42), 21, INK, HALO);
  drawScale(c, Math.max(16, X0 + 14), Math.min(vh - 18, Y0 + MH - 16), s, INK, HALO, Math.min(150, MW * 0.3));
}
function drawGlyphs(c, v, vw, vh) {
  const s = v.s, ink = '#4a3920', paper = 'rgba(236,224,190,1)', shadeCol = 'rgba(92,70,40,0.38)';
  c.lineJoin = 'round'; c.lineCap = 'round';
  for (const g of D.glyphs) {
    const X = v.ox + g.x * s, Y = v.oy + g.y * s;
    if (X < -40 || Y < -40 || X > vw + 40 || Y > vh + 40) continue;
    if (g.t === 0) {
      const hg = g.z * s, w = hg * 0.95, pk = X - w * 0.08;
      c.beginPath(); c.moveTo(X - w, Y); c.lineTo(pk, Y - hg); c.lineTo(X + w, Y); c.closePath(); c.fillStyle = paper; c.fill();
      c.beginPath(); c.moveTo(pk, Y - hg); c.lineTo(X + w, Y); c.lineTo(X + w * 0.15, Y); c.closePath(); c.fillStyle = shadeCol; c.fill();
      if (g.snow) { c.beginPath(); c.moveTo(pk, Y - hg); c.lineTo(pk - w * 0.32, Y - hg * 0.66); c.lineTo(pk + w * 0.34, Y - hg * 0.64); c.closePath(); c.fillStyle = '#fbf8ef'; c.fill(); }
      c.beginPath(); c.moveTo(X - w, Y); c.lineTo(pk, Y - hg); c.lineTo(X + w, Y); c.lineWidth = Math.max(0.8, s * 0.2); c.strokeStyle = ink; c.stroke();
    } else if (g.t === 1) {
      const w = g.z * s; c.beginPath(); c.arc(X, Y, w, Math.PI * 1.1, Math.PI * 1.9); c.lineWidth = Math.max(0.7, s * 0.16); c.strokeStyle = 'rgba(74,57,32,0.7)'; c.stroke();
    } else if (g.t === 2) {
      const r = Math.max(1.5, 0.85 * s); c.beginPath(); c.arc(X, Y - r, r, 0, Math.PI * 2); c.fillStyle = '#a4ad78'; c.fill(); c.lineWidth = Math.max(0.6, s * 0.14); c.strokeStyle = 'rgba(62,70,36,0.85)'; c.stroke();
      c.beginPath(); c.moveTo(X, Y); c.lineTo(X, Y + r * 0.6); c.stroke();
    } else if (g.t === 3) {
      const r = Math.max(1.6, 0.95 * s); c.beginPath(); c.moveTo(X, Y - r * 2.1); c.lineTo(X + r * 0.8, Y); c.lineTo(X - r * 0.8, Y); c.closePath(); c.fillStyle = '#8c9a6c'; c.fill(); c.lineWidth = Math.max(0.6, s * 0.14); c.strokeStyle = 'rgba(52,62,34,0.85)'; c.stroke();
    } else if (g.t === 4) {
      const r = Math.max(1.4, 0.8 * s); c.beginPath(); c.moveTo(X - r, Y); c.lineTo(X - r * 1.3, Y - r); c.moveTo(X, Y); c.lineTo(X, Y - r * 1.4); c.moveTo(X + r, Y); c.lineTo(X + r * 1.3, Y - r); c.lineWidth = Math.max(0.6, s * 0.14); c.strokeStyle = 'rgba(70,90,60,0.8)'; c.stroke();
    } else if (g.t === 5) {
      const r = Math.max(1.6, 1.1 * s); c.beginPath(); c.moveTo(X - r * 1.4, Y); c.quadraticCurveTo(X - r * 0.2, Y - r, X + r * 1.4, Y); c.lineWidth = Math.max(0.6, s * 0.14); c.strokeStyle = 'rgba(120,90,50,0.6)'; c.stroke();
    }
  }
}
function drawRealmNames(c, v, atlas) {
  const s = v.s;
  for (const r of D.realms) {
    if (r.area < 40) continue;
    const sz = clamp(Math.sqrt(r.area) / 7.5, 4.2, 11) * s * 0.92; if (sz < 8) continue;
    const X = v.ox + r.lx * s, Y = v.oy + r.ly * s;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `italic ${Math.max(10, sz * 0.42)}px ${F_DISPLAY}`; c.letterSpacing = '1px';
    haloText(c, `The ${r.title} of`, X, Y - sz * 0.78, shade(r.color, 0.55), atlas ? 'rgba(241,231,203,0.6)' : 'rgba(255,255,255,0.55)', 2.5);
    c.font = `${sz}px ${F_SC}`; c.letterSpacing = `${(sz * 0.26).toFixed(1)}px`;
    haloText(c, r.name, X, Y, shade(r.color, 0.62), atlas ? 'rgba(241,231,203,0.6)' : 'rgba(255,255,255,0.55)', Math.max(2.5, sz * 0.12));
  }
  c.letterSpacing = '0px';
}
function labelStyle(l, atlas) {
  if (l.kind === 'sea') return { font: 'italic', face: F_DISPLAY, fill: atlas ? '#35565f' : 'rgba(226,241,246,0.95)', halo: atlas ? 'rgba(205,219,212,0.8)' : null, sp: 0.22 };
  if (l.kind === 'range') return { font: 'italic', face: F_DISPLAY, fill: atlas ? '#58401f' : '#35291a', halo: atlas ? 'rgba(241,231,203,0.85)' : 'rgba(250,248,240,0.8)', sp: 0.16 };
  return { font: '', face: F_SC, fill: atlas ? '#4a3820' : '#1d2a31', halo: atlas ? 'rgba(241,231,203,0.85)' : 'rgba(250,251,251,0.8)', sp: 0.3 };
}
function drawUserLabels(c, v, atlas) {
  const s = v.s;
  for (const l of world.labels) {
    const fs = l.size * s; if (fs < 6) continue;
    const st = labelStyle(l, atlas);
    c.save(); c.translate(v.ox + l.x * s, v.oy + l.y * s); c.rotate((l.angle || 0) * Math.PI / 180);
    c.font = `${st.font} ${fs}px ${st.face}`; c.letterSpacing = `${(fs * st.sp).toFixed(1)}px`; c.textAlign = 'center'; c.textBaseline = 'middle';
    haloText(c, l.text, 0, 0, st.fill, st.halo, Math.max(2, fs * 0.16));
    c.restore();
  }
  c.letterSpacing = '0px';
}
const P_ORDER = { landmark: 0, village: 1, town: 2, city: 3, capital: 4 };
function drawPlaces(c, v, vw, vh, atlas, INK, HALO, opt, small = 1) {
  const s = v.s, zr = s / v.s0, sc = clamp(Math.pow(zr, 0.22), 1, 1.35) * small;
  const list = world.places.slice().sort((a, b) => P_ORDER[a.kind] - P_ORDER[b.kind]);
  const iconHalo = atlas ? '#f1e7cb' : '#ffffff';
  for (const p of list) {
    const X = v.ox + p.x * s, Y = v.oy + p.y * s;
    if (X < -60 || Y < -30 || X > vw + 200 || Y > vh + 30) continue;
    let rr = 4;
    c.lineJoin = 'round';
    if (p.kind === 'capital') {
      starPath(c, X, Y, 7 * sc, 3 * sc); c.lineWidth = 3.4; c.strokeStyle = iconHalo; c.stroke();
      c.fillStyle = p.realm ? p.realm.color : '#999'; c.fill(); c.lineWidth = 1.2; c.strokeStyle = INK; c.stroke(); rr = 7 * sc;
    } else if (p.kind === 'city') {
      c.beginPath(); c.arc(X, Y, 4.6 * sc, 0, Math.PI * 2); c.fillStyle = iconHalo; c.fill(); c.lineWidth = 1.7; c.strokeStyle = INK; c.stroke();
      c.beginPath(); c.arc(X, Y, 1.8 * sc, 0, Math.PI * 2); c.fillStyle = INK; c.fill(); rr = 4.6 * sc;
    } else if (p.kind === 'town') {
      c.beginPath(); c.arc(X, Y, 3.4 * sc, 0, Math.PI * 2); c.fillStyle = INK; c.fill(); c.lineWidth = 1.5; c.strokeStyle = iconHalo; c.stroke(); rr = 3.4 * sc;
    } else if (p.kind === 'village') {
      c.beginPath(); c.arc(X, Y, 2.3 * sc, 0, Math.PI * 2); c.fillStyle = INK; c.fill(); c.lineWidth = 1.2; c.strokeStyle = iconHalo; c.stroke(); rr = 2.3 * sc;
    } else {
      const lm = LM_PATHS[p.sub] || LM_PATHS.ruin;
      c.save(); c.translate(X, Y); c.scale(sc * 1.05, sc * 1.05);
      c.lineWidth = lm.fill ? 3 : 4.2; c.strokeStyle = iconHalo; c.lineCap = 'round'; c.stroke(lm.p);
      if (lm.fill) { c.fillStyle = INK; c.fill(lm.p); if (lm.ip) { c.fillStyle = iconHalo; c.fill(lm.ip); } }
      else { c.lineWidth = 1.7; c.strokeStyle = INK; c.stroke(lm.p); }
      c.restore(); rr = 6 * sc;
    }
    if (!ui.layers.names) continue;
    const show = opt.allNames || p.kind === 'capital' || p.kind === 'city' || (p.kind === 'town' && zr >= 1.2) || (p.kind === 'village' && zr >= 1.9) || (p.kind === 'landmark' && zr >= 1.5) || (ui.selected && ui.selected.id === p.id);
    if (!show) continue;
    const base = { capital: 15, city: 13.5, town: 12.5, village: 11.5, landmark: 11.5 }[p.kind] * sc;
    c.font = p.kind === 'capital' ? `${base}px ${F_SC}` : (p.kind === 'village' || p.kind === 'landmark') ? `italic ${base}px ${F_DISPLAY}` : `${base}px ${F_DISPLAY}`;
    c.letterSpacing = p.kind === 'capital' ? '0.6px' : '0px';
    c.textAlign = 'left'; c.textBaseline = 'middle';
    haloText(c, p.name, X + rr + 4, Y + 0.5, INK, HALO, 3.2);
  }
  c.letterSpacing = '0px';
}
function findSel(sel) {
  if (!sel) return null;
  if (sel.type === 'place') return world.places.find(p => p.id === sel.id) || null;
  if (sel.type === 'label') return world.labels.find(l => l.id === sel.id) || null;
  return sel;
}
function drawSelection(c, v, atlas) {
  const sel = ui.selected; if (!sel) return; const o = findSel(sel); if (!o) return;
  const X = v.ox + o.x * v.s, Y = v.oy + o.y * v.s;
  const acc = atlas ? '#8a4b12' : '#c68a1a';
  if (sel.type === 'place') {
    c.beginPath(); c.arc(X, Y, 12, 0, Math.PI * 2); c.lineWidth = 4.5; c.strokeStyle = 'rgba(255,255,255,0.85)'; c.stroke(); c.lineWidth = 2; c.strokeStyle = acc; c.stroke();
  } else if (sel.type === 'label') {
    const fs = o.size * v.s, st = labelStyle(o, atlas);
    c.save(); c.translate(X, Y); c.rotate((o.angle || 0) * Math.PI / 180);
    c.font = `${st.font} ${fs}px ${st.face}`; c.letterSpacing = `${(fs * st.sp).toFixed(1)}px`;
    const w = c.measureText(o.text).width;
    c.setLineDash([4, 3]); c.lineWidth = 1.5; c.strokeStyle = acc; c.strokeRect(-w / 2 - 6, -fs * 0.7, w + 12, fs * 1.4); c.setLineDash([]);
    c.restore(); c.letterSpacing = '0px';
  } else {
    c.lineWidth = 3.5; c.strokeStyle = 'rgba(255,255,255,0.85)'; c.beginPath(); c.moveTo(X - 9, Y); c.lineTo(X + 9, Y); c.moveTo(X, Y - 9); c.lineTo(X, Y + 9); c.stroke();
    c.lineWidth = 1.6; c.strokeStyle = acc; c.stroke();
    c.beginPath(); c.arc(X, Y, 5, 0, Math.PI * 2); c.stroke();
  }
}
function drawCursor(c, v) {
  if (!hover || !BRUSH_TOOLS.has(ui.tool)) return;
  const R = ui.brush.size * v.s;
  c.beginPath(); c.arc(hover.x, hover.y, R, 0, Math.PI * 2); c.lineWidth = 3; c.strokeStyle = 'rgba(255,255,255,0.75)'; c.stroke();
  c.setLineDash([5, 4]); c.lineWidth = 1.3; c.strokeStyle = 'rgba(15,25,32,0.9)'; c.stroke(); c.setLineDash([]);
  const sym = { raise: '+', lower: '−', smooth: '~', rain: '≈', drought: '☼' }[ui.tool];
  c.font = `600 14px ${F_MONO}`; c.textAlign = 'center'; c.textBaseline = 'middle';
  haloText(c, sym, hover.x, hover.y, 'rgba(15,25,32,0.95)', 'rgba(255,255,255,0.85)', 3);
}
function drawCompass(c, X, Y, R, ink, halo) {
  c.save(); c.translate(X, Y);
  c.beginPath(); c.arc(0, 0, R * 0.78, 0, Math.PI * 2); c.fillStyle = halo; c.fill(); c.lineWidth = 0.8; c.strokeStyle = ink; c.stroke();
  for (let k = 7; k >= 0; k--) {
    const a = k * Math.PI / 4 - Math.PI / 2, long = k % 2 === 0, r1 = long ? R : R * 0.58, w = R * (long ? 0.17 : 0.13);
    const tx = Math.cos(a) * r1, ty = Math.sin(a) * r1, lx = Math.cos(a - Math.PI / 2) * w, ly = Math.sin(a - Math.PI / 2) * w;
    c.beginPath(); c.moveTo(0, 0); c.lineTo(tx, ty); c.lineTo(lx, ly); c.closePath(); c.fillStyle = ink; c.fill();
    c.beginPath(); c.moveTo(0, 0); c.lineTo(tx, ty); c.lineTo(-lx, -ly); c.closePath(); c.fillStyle = halo; c.fill(); c.lineWidth = 0.7; c.strokeStyle = ink; c.stroke();
  }
  c.font = `${13}px ${F_SC}`; c.textAlign = 'center'; c.textBaseline = 'bottom';
  haloText(c, 'N', 0, -R - 1, ink, halo, 3);
  c.restore();
}
function drawScale(c, X, Y, s, ink, halo, maxLen = 150) {
  const ppl = s * LEAGUE / KM; let lg = 5;
  for (const n of [5, 10, 20, 25, 50, 100, 150, 200, 250, 300, 500, 1000]) if (n * ppl <= maxLen) lg = n;
  const len = lg * ppl, seg = len / 4;
  c.save();
  c.fillStyle = halo; c.fillRect(X - 6, Y - 22, len + 62, 30);
  for (let k = 0; k < 4; k++) { c.fillStyle = k % 2 ? halo : ink; c.fillRect(X + k * seg, Y - 3, seg, 5); }
  c.lineWidth = 1; c.strokeStyle = ink; c.strokeRect(X + 0.5, Y - 2.5, len, 5);
  c.font = `10.5px ${F_MONO}`; c.fillStyle = ink; c.textBaseline = 'bottom'; c.textAlign = 'left';
  c.fillText('0', X - 2, Y - 6); c.textAlign = 'center'; c.fillText(`${lg} leagues`, X + len, Y - 6);
  c.restore();
}

// ------------------------------------------------------------------ view
const canvas = $('#map'), ctx = canvas.getContext('2d');
function computeS0() { const m = view.cw < 500 ? 12 : 26; view.s0 = Math.max(0.2, Math.min((view.cw - m * 2) / W, (view.ch - m * 2) / H)); }
function fitView() { computeS0(); view.s = view.s0; view.ox = (view.cw - W * view.s) / 2; view.oy = (view.ch - H * view.s) / 2; requestDraw(); }
function clampView() {
  const mw = W * view.s, mh = H * view.s, pad = 80;
  view.ox = mw <= view.cw ? clamp(view.ox, 0, view.cw - mw) : clamp(view.ox, view.cw - mw - pad, pad);
  view.oy = mh <= view.ch ? clamp(view.oy, 0, view.ch - mh) : clamp(view.oy, view.ch - mh - pad, pad);
}
function zoomAt(sx, sy, f) {
  const ns = clamp(view.s * f, view.s0 * 0.9, view.s0 * 10);
  const wx = (sx - view.ox) / view.s, wy = (sy - view.oy) / view.s;
  view.s = ns; view.ox = sx - wx * ns; view.oy = sy - wy * ns; clampView(); requestDraw();
}
function centerOn(x, y) {
  if (view.s < view.s0 * 1.8) view.s = view.s0 * 2.2;
  view.ox = view.cw / 2 - x * view.s; view.oy = view.ch / 2 - y * view.s; clampView(); requestDraw();
}
function resize() {
  const r = $('#mapwrap').getBoundingClientRect(); const cw = Math.max(1, r.width), ch = Math.max(1, r.height);
  const first = !view.cw, wasFit = Math.abs(view.s - view.s0) < 1e-6;
  const cx = view.cw ? (view.cw / 2 - view.ox) / view.s : W / 2, cy = view.ch ? (view.ch / 2 - view.oy) / view.s : H / 2;
  view.cw = cw; view.ch = ch; view.dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(cw * view.dpr); canvas.height = Math.round(ch * view.dpr);
  if (first || wasFit) fitView(); else { computeS0(); view.ox = cw / 2 - cx * view.s; view.oy = ch / 2 - cy * view.s; clampView(); }
  draw();
}
const toWorld = (sx, sy) => ({ x: (sx - view.ox) / view.s, y: (sy - view.oy) / view.s });

// ------------------------------------------------------------------ tools
const ICONS = {
  sketch: '<path d="M2.5 16.8c1.6-1.3 2.9.4 4.6-.8 1-.7 1.3-1.7 2.4-1.9"/><path d="m10.2 12.4 6.3-6.3a1.7 1.7 0 0 0-2.4-2.4L7.8 10l-.7 3.1z"/>',
  select: '<path d="M5 2.8 15.5 9.3l-4.7 1 2.7 5.1-2 1.1-2.7-5.1L5 14.8z" fill="currentColor" stroke="none"/>',
  raise: '<path d="m2 17 5-7 3 4 2-3 6 6"/><path d="M14.5 8V2.5M12 5l2.5-2.5L17 5"/>',
  lower: '<path d="M2 5h4l3 6h2l3-6h4"/><path d="M10 13v5m-2.5-2.5L10 18l2.5-2.5"/>',
  smooth: '<path d="M2 8c2.5-4 5-4 8 0s5.5 4 8 0"/><path d="M2 14c2.5-1.5 5-1.5 8 0s5.5 1.5 8 0"/>',
  rain: '<path d="M6 12a3.5 3.5 0 1 1 1-6.9A4.5 4.5 0 0 1 15.5 7 3 3 0 0 1 15 12z"/><path d="m7 15-1 2.5M11 15l-1 2.5M15 15l-1 2.5"/>',
  drought: '<circle cx="10" cy="10" r="3.5"/><path d="M10 1.8v2.4M10 15.8v2.4M1.8 10h2.4M15.8 10h2.4M4.2 4.2 5.9 5.9M14.1 14.1l1.7 1.7M4.2 15.8l1.7-1.7M14.1 5.9l1.7-1.7"/>',
  settle: '<path d="M3 17V8h2V6h2v2h2V5h2v3h2V6h2v2h2v9z"/><path d="M8.5 17v-3.5h3V17"/>',
  landmark: '<path d="M8.2 17 9 5.5 10 3l1 2.5.8 11.5z"/><path d="M5 17h10"/>',
  label: '<path d="M4 5.5V3h12v2.5M10 3v14M7.5 17h5"/>',
  erase: '<path d="M8 17h9M3.5 12.5l7-7a1.5 1.5 0 0 1 2.1 0l2.9 2.9a1.5 1.5 0 0 1 0 2.1L9 17H6.5z"/><path d="m7 9 4.5 4.5"/>',
};
const TOOLS = [
  { id: 'select', key: 'v', label: 'Select and pan' }, 0,
  { id: 'sketch', key: 'p', label: 'Sketch coastlines and ranges' },
  { id: 'raise', key: 'r', label: 'Raise land' }, { id: 'lower', key: 'l', label: 'Lower land' }, { id: 'smooth', key: 's', label: 'Smooth terrain' },
  { id: 'rain', key: 'w', label: 'Make wetter' }, { id: 'drought', key: 'd', label: 'Make drier' }, 0,
  { id: 'settle', key: 'c', label: 'Found a settlement' }, { id: 'landmark', key: 'm', label: 'Mark a landmark' }, { id: 'label', key: 't', label: 'Add a map label' }, 0,
  { id: 'erase', key: 'e', label: 'Remove places and labels' },
];
const BRUSH_TOOLS = new Set(['raise', 'lower', 'smooth', 'rain', 'drought']);
const svgIcon = (inner, sz = 20) => `<svg width="${sz}" height="${sz}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
function buildToolbar() {
  $('#tools').innerHTML = TOOLS.map(t => t ? `<button class="tool" data-tool="${t.id}" aria-pressed="${ui.tool === t.id}" aria-label="${t.label}" title="${t.label} (${t.key.toUpperCase()})">${svgIcon(ICONS[t.id])}</button>` : '<div class="tool-sep" aria-hidden="true"></div>').join('');
  $('#tools').addEventListener('click', e => { const b = e.target.closest('[data-tool]'); if (b) setTool(b.dataset.tool); });
}
function setTool(id) {
  ui.tool = id;
  document.querySelectorAll('#tools .tool').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tool === id)));
  renderToolOpts(); updateCursor(); requestDraw();
}
function chipGroup(name, opts, cur, g) { return `<div class="chips" role="group" aria-label="${name}">${opts.map(([v, l]) => `<button class="chip" data-g="${g}" data-v="${v}" aria-pressed="${v === cur}">${l}</button>`).join('')}</div>`; }
const ROUGH_WORD = ['smooth', 'gentle', 'gentle', 'gentle', 'natural', 'natural', 'natural', 'rugged', 'rugged', 'jagged', 'jagged'];
function renderToolOpts() {
  const el = $('#toolOpts'), t = ui.tool, name = TOOLS.find(x => x && x.id === t).label;
  let h = `<span class="tname">${name}</span>`;
  if (BRUSH_TOOLS.has(t)) {
    h += `<label class="opt" for="optSize">Brush <input type="range" id="optSize" min="2" max="40" value="${ui.brush.size}"><output id="optSizeOut">${ui.brush.size}</output></label>
      <label class="opt" for="optStr">Strength <input type="range" id="optStr" min="1" max="10" value="${ui.brush.strength}"><output id="optStrOut">${ui.brush.strength}</output></label>
      <span class="hint">${t === 'rain' || t === 'drought' ? 'Rainfall shifts forests, grassland and desert.' : 'Hold and drag. Rivers and borders settle when you let go.'}</span>`;
  } else if (t === 'sketch') {
    const sk = ui.sketch;
    h += chipGroup('Sketch mode', [['land', 'Land'], ['sea', 'Sea'], ['range', 'Mountain range'], ['river', 'River']], sk.mode, 'skmode');
    if (sk.mode === 'river') h += `<label class="opt" for="optValley">Valley <input type="range" id="optValley" min="2" max="12" value="${sk.valley}"><output id="optValleyOut">${sk.valley}</output></label>`;
    else if (sk.mode === 'range') h += `<label class="opt" for="optWidth">Width <input type="range" id="optWidth" min="3" max="24" value="${sk.width}"><output id="optWidthOut">${sk.width}</output></label>`;
    else h += `<label class="opt" for="optRough">Coast <input type="range" id="optRough" min="0" max="10" value="${sk.rough}"><output id="optRoughOut" style="min-width:6.5ch">${ROUGH_WORD[sk.rough]}</output></label>`;
    if (sk.mode === 'land' || sk.mode === 'range') h += `<span class="opt">Height ${chipGroup('Height', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']], sk.height, 'skh')}</span>`;
    h += `<span class="hint">${sk.mode === 'land' ? 'Draw a loop. Land rises inside it.' : sk.mode === 'sea' ? 'Draw a loop to flood it: bays, straits, inland seas.' : sk.mode === 'river' ? 'Draw from the source toward the sea. A valley forms so the water follows your line.' : 'Draw along the ridge line.'}</span>`;
  } else if (t === 'settle') {
    h += chipGroup('Settlement size', [['capital', 'Capital'], ['city', 'City'], ['town', 'Town'], ['village', 'Village']], ui.settleKind, 'settle') + `<span class="hint">${ui.settleKind === 'capital' ? 'A capital founds a new realm.' : 'Click dry land to found it.'}</span>`;
  } else if (t === 'landmark') {
    h += chipGroup('Landmark kind', Object.entries(LANDMARKS).map(([k, v]) => [k, v.label]), ui.landmarkKind, 'landmark');
  } else if (t === 'label') {
    h += chipGroup('Label style', [['region', 'Region'], ['sea', 'Sea'], ['range', 'Mountains']], ui.labelKind, 'label') + `<label class="sr" for="optLabelText">Label text</label><input class="txt" id="optLabelText" placeholder="Text (blank for a name)" value="${esc(ui.labelText)}">`;
  } else if (t === 'erase') {
    h += `<span class="hint">Click a place or label to remove it. Undo brings it back.</span>`;
  } else {
    h += `<span class="hint">Drag to pan. Scroll or pinch to zoom. Click a place or any spot to read about it.</span>`;
  }
  el.innerHTML = h;
  const sz = $('#optSize'); if (sz) { sz.oninput = () => { ui.brush.size = +sz.value; $('#optSizeOut').textContent = sz.value; savePrefs(); }; }
  const st = $('#optStr'); if (st) { st.oninput = () => { ui.brush.strength = +st.value; $('#optStrOut').textContent = st.value; savePrefs(); }; }
  el.querySelectorAll('.chip').forEach(b => b.onclick = () => {
    const g = b.dataset.g, v = b.dataset.v;
    if (g === 'settle') ui.settleKind = v; else if (g === 'landmark') ui.landmarkKind = v; else if (g === 'label') ui.labelKind = v;
    else if (g === 'skmode') ui.sketch.mode = v; else if (g === 'skh') ui.sketch.height = v;
    if (g === 'skmode' || g === 'skh') savePrefs();
    renderToolOpts();
  });
  const lt = $('#optLabelText'); if (lt) lt.oninput = () => { ui.labelText = lt.value; };
  const ro = $('#optRough'); if (ro) ro.oninput = () => { ui.sketch.rough = +ro.value; $('#optRoughOut').textContent = ROUGH_WORD[ui.sketch.rough]; savePrefs(); };
  const va = $('#optValley'); if (va) va.oninput = () => { ui.sketch.valley = +va.value; $('#optValleyOut').textContent = va.value; savePrefs(); };
  const wd = $('#optWidth'); if (wd) wd.oninput = () => { ui.sketch.width = +wd.value; $('#optWidthOut').textContent = wd.value; savePrefs(); };
}
function updateCursor() {
  if (gesture && (gesture.type === 'pan' || (gesture.type === 'click' && gesture.moved))) canvas.style.cursor = 'grabbing';
  else if (spaceDown) canvas.style.cursor = 'grab';
  else if (BRUSH_TOOLS.has(ui.tool)) canvas.style.cursor = 'none';
  else if (ui.tool === 'select') canvas.style.cursor = hoverHit ? 'pointer' : 'grab';
  else canvas.style.cursor = 'crosshair';
}

// ------------------------------------------------------------------ brush
let stroke = null;
function startStroke(sx, sy) {
  pushUndo(ui.tool === 'rain' || ui.tool === 'drought' ? { m: true } : { h: true });
  stroke = { tool: ui.tool, x: sx, y: sy, lx: sx, ly: sy };
  requestAnimationFrame(strokeFrame);
}
function strokeFrame() {
  if (!stroke) return;
  const r = ui.brush.size, a = toWorld(stroke.lx, stroke.ly), b = toWorld(stroke.x, stroke.y);
  const len = Math.hypot(b.x - a.x, b.y - a.y), sp = Math.max(0.6, r * 0.3), n = Math.max(1, Math.ceil(len / sp)), amt = 1 / Math.sqrt(n);
  let bx0 = W, by0 = H, bx1 = 0, by1 = 0;
  for (let k = 1; k <= n; k++) {
    const t = k / n, px = lerp(a.x, b.x, t), py = lerp(a.y, b.y, t);
    dab(stroke.tool, px, py, r, amt);
    bx0 = Math.min(bx0, px - r); by0 = Math.min(by0, py - r); bx1 = Math.max(bx1, px + r); by1 = Math.max(by1, py + r);
  }
  stroke.lx = stroke.x; stroke.ly = stroke.y;
  computeClimate(bx0 - 2, by0 - 2, bx1 + 2, by1 + 2); renderBase(bx0 - 2, by0 - 2, bx1 + 2, by1 + 2);
  if (stroke.tool !== 'rain' && stroke.tool !== 'drought') { buildCoast(); buildContours(); }
  buildGlyphs();
  requestDraw(); updateStatus();
  requestAnimationFrame(strokeFrame);
}
function dab(tool, cx, cy, r, amt) {
  const st = ui.brush.strength, h = world.h, m = world.m, r2 = r * r;
  const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(W - 1, Math.ceil(cx + r)), y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(H - 1, Math.ceil(cy + r));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d2 = dx * dx + dy * dy; if (d2 >= r2) continue;
    const q = 1 - d2 / r2, w = q * q * amt, i = y * W + x;
    switch (tool) {
      case 'raise': h[i] = Math.min(1, h[i] + 0.0012 * st * w); break;
      case 'lower': h[i] = Math.max(0, h[i] - 0.0012 * st * w); break;
      case 'smooth': {
        let sum = 0, c = 0;
        for (let yy = Math.max(0, y - 1); yy <= Math.min(H - 1, y + 1); yy++) for (let xx = Math.max(0, x - 1); xx <= Math.min(W - 1, x + 1); xx++) { sum += h[yy * W + xx]; c++; }
        h[i] = lerp(h[i], sum / c, Math.min(1, w * 0.12 * st)); break;
      }
      case 'rain': m[i] = Math.min(1, m[i] + 0.006 * st * w); break;
      case 'drought': m[i] = Math.max(0, m[i] - 0.006 * st * w); break;
    }
  }
}
function endStroke() {
  if (!stroke) return; stroke = null;
  recomputeAll(); markDirty();
}

// ------------------------------------------------------------------ sketch
let sketchDraft = null, sketchCount = 0;
const HEIGHT_AMP = { low: 0.09, medium: 0.16, high: 0.28 }, RANGE_AMP = { low: 0.2, medium: 0.32, high: 0.46 };
function chamfer(mask, bw, bh, target) {
  const d = new Float32Array(bw * bh), BIG = 1e6, D2 = 1.4142;
  for (let i = 0; i < d.length; i++) d[i] = mask[i] === target ? BIG : 0;
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    const i = y * bw + x; let v = d[i]; if (!v) continue;
    if (x > 0) v = Math.min(v, d[i - 1] + 1);
    if (y > 0) { v = Math.min(v, d[i - bw] + 1); if (x > 0) v = Math.min(v, d[i - bw - 1] + D2); if (x < bw - 1) v = Math.min(v, d[i - bw + 1] + D2); }
    d[i] = v;
  }
  for (let y = bh - 1; y >= 0; y--) for (let x = bw - 1; x >= 0; x--) {
    const i = y * bw + x; let v = d[i]; if (!v) continue;
    if (x < bw - 1) v = Math.min(v, d[i + 1] + 1);
    if (y < bh - 1) { v = Math.min(v, d[i + bw] + 1); if (x < bw - 1) v = Math.min(v, d[i + bw + 1] + D2); if (x > 0) v = Math.min(v, d[i + bw - 1] + D2); }
    d[i] = v;
  }
  return d;
}
function sketchNoise(k) { sketchCount++; return makeNoise(hash3(world.seed, sketchCount + (Date.now() & 0xffff), k)); }
function sketchLoop(pts, mode) {
  const n = pts.length / 2;
  let area = 0; for (let k = 0, j = n - 1; k < n; j = k++) area += (pts[2 * j] * pts[2 * k + 1] - pts[2 * k] * pts[2 * j + 1]);
  if (n < 3 || Math.abs(area / 2) < 8) { toast('Draw a bigger loop. The shape closes itself when you let go.'); return; }
  const h = world.h, sea = world.sea, amp = ui.sketch.rough * 1.3, rel = HEIGHT_AMP[ui.sketch.height] || HEIGHT_AMP.medium;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let k = 0; k < n; k++) { minX = Math.min(minX, pts[2 * k]); maxX = Math.max(maxX, pts[2 * k]); minY = Math.min(minY, pts[2 * k + 1]); maxY = Math.max(maxY, pts[2 * k + 1]); }
  const M = Math.ceil(amp * 1.5 + 16);
  const bx0 = clamp(Math.floor(minX) - M, 0, W - 1), bx1 = clamp(Math.ceil(maxX) + M, 0, W - 1), by0 = clamp(Math.floor(minY) - M, 0, H - 1), by1 = clamp(Math.ceil(maxY) + M, 0, H - 1);
  const bw = bx1 - bx0 + 1, bh = by1 - by0 + 1, inside = new Uint8Array(bw * bh), xs = [];
  for (let y = 0; y < bh; y++) {
    const yc = by0 + y + 0.5; xs.length = 0;
    for (let k = 0, j = n - 1; k < n; j = k++) { const x1 = pts[2 * j], y1 = pts[2 * j + 1], x2 = pts[2 * k], y2 = pts[2 * k + 1]; if ((y1 > yc) !== (y2 > yc)) xs.push(x1 + (yc - y1) / (y2 - y1) * (x2 - x1)); }
    xs.sort((a, b) => a - b);
    for (let q = 0; q + 1 < xs.length; q += 2) { const xa = Math.max(0, Math.ceil(xs[q] - 0.5 - bx0)), xb = Math.min(bw - 1, Math.floor(xs[q + 1] - 0.5 - bx0)); for (let x = xa; x <= xb; x++) inside[y * bw + x] = 1; }
  }
  const dIn = chamfer(inside, bw, bh, 1), dOut = chamfer(inside, bw, bh, 0);
  let maxIn = 0; for (let i = 0; i < inside.length; i++) if (inside[i] && dIn[i] > maxIn) maxIn = dIn[i];
  const R = clamp(maxIn * 0.65, 4, 45), nz1 = sketchNoise(1), nz2 = sketchNoise(2), nz3 = sketchNoise(3);
  pushUndo({ h: true });
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    const li = y * bw + x, gx = bx0 + x, gy = by0 + y, gi = gy * W + gx;
    const sd = inside[li] ? dIn[li] - 0.5 : -(dOut[li] - 0.5);
    const d = sd + (amp ? fbm(nz1, gx * 0.07, gy * 0.07, 4) * amp + fbm(nz2, gx * 0.025, gy * 0.025, 3) * amp * 0.9 : 0);
    if (mode === 'land') {
      if (d > 0) {
        const t = smooth(0, R, d), hn = fbm(nz3, gx * 0.045, gy * 0.045, 4);
        h[gi] = Math.max(h[gi], sea + 0.004 + rel * t * clamp(0.5 + 0.75 * hn, 0.1, 1.25));
      } else if (-d < 14 && h[gi] < sea) h[gi] = Math.max(h[gi], sea - 0.006 - 0.16 * smooth(0, 14, -d));
    } else {
      if (d > 0) h[gi] = Math.min(h[gi], sea - 0.006 - 0.2 * smooth(0, R, d));
      else if (-d < 6 && h[gi] >= sea) h[gi] = Math.min(h[gi], sea + 0.002 + (h[gi] - sea) * smooth(0, 6, -d));
    }
  }
  settleSketch(bx0, by0, bx1, by1);
  toast(mode === 'land' ? 'Land raised. Rivers and borders have been redrawn.' : 'Flooded. The coast has been redrawn.', { label: 'Undo', fn: undo });
}
function sketchRange(raw) {
  const pts = [raw[0], raw[1]];
  for (let k = 2; k < raw.length; k += 2) if (Math.hypot(raw[k] - pts[pts.length - 2], raw[k + 1] - pts[pts.length - 1]) >= 1.2) pts.push(raw[k], raw[k + 1]);
  const n = pts.length / 2;
  let L = 0; const cum = [0]; for (let k = 1; k < n; k++) { L += Math.hypot(pts[2 * k] - pts[2 * k - 2], pts[2 * k + 1] - pts[2 * k - 1]); cum.push(L); }
  if (n < 2 || L < 6) { toast('Draw a longer line along where the peaks should run.'); return; }
  const h = world.h, sea = world.sea, Wd = ui.sketch.width, amp = RANGE_AMP[ui.sketch.height] || RANGE_AMP.medium, sh = Wd * 1.8;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let k = 0; k < n; k++) { minX = Math.min(minX, pts[2 * k]); maxX = Math.max(maxX, pts[2 * k]); minY = Math.min(minY, pts[2 * k + 1]); maxY = Math.max(maxY, pts[2 * k + 1]); }
  const bx0 = clamp(Math.floor(minX - sh) - 1, 0, W - 1), bx1 = clamp(Math.ceil(maxX + sh) + 1, 0, W - 1), by0 = clamp(Math.floor(minY - sh) - 1, 0, H - 1), by1 = clamp(Math.ceil(maxY + sh) + 1, 0, H - 1);
  const nz1 = sketchNoise(4), nz2 = sketchNoise(5), taper = Math.min(Wd * 1.2, L / 3);
  pushUndo({ h: true });
  for (let gy = by0; gy <= by1; gy++) for (let gx = bx0; gx <= bx1; gx++) {
    const px = gx + 0.5, py = gy + 0.5; let bd = Infinity, bs = 0;
    for (let k = 0; k < n - 1; k++) {
      const ax = pts[2 * k], ay = pts[2 * k + 1], vx = pts[2 * k + 2] - ax, vy = pts[2 * k + 3] - ay, ll = vx * vx + vy * vy;
      const t = ll ? clamp(((px - ax) * vx + (py - ay) * vy) / ll, 0, 1) : 0;
      const d = Math.hypot(px - ax - vx * t, py - ay - vy * t);
      if (d < bd) { bd = d; bs = cum[k] + t * Math.sqrt(ll); }
    }
    const gi = gy * W + gx;
    const wob = Wd * (1 + 0.35 * fbm(nz2, gx * 0.06, gy * 0.06, 3));
    if (bd < wob) {
      const f = 1 - bd / wob, prof = Math.pow(f * f * (3 - 2 * f), 1.3);
      const rn = 1 - Math.abs(nz1(gx * 0.11, gy * 0.11)), along = 0.8 + 0.4 * fbm(nz2, gx * 0.035 + 20, gy * 0.035, 3);
      const tp = smooth(0, taper, bs) * smooth(0, taper, L - bs);
      h[gi] = Math.max(h[gi], sea + 0.004 + amp * prof * tp * (0.45 + 0.55 * rn) * along);
    } else if (bd < wob * 1.8 && h[gi] < sea) h[gi] = Math.max(h[gi], sea - 0.008 - 0.14 * smooth(wob, wob * 1.8, bd));
  }
  settleSketch(bx0, by0, bx1, by1);
  toast('Mountains raised. Valleys they block drain through a gorge at the lowest pass.', { label: 'Undo', fn: undo });
}
function resample(raw, step) {
  const out = [raw[0], raw[1]]; let px = raw[0], py = raw[1];
  for (let k = 2; k < raw.length; k += 2) {
    const x = raw[k], y = raw[k + 1]; let d = Math.hypot(x - px, y - py);
    while (d >= step) { const t = step / d; px += (x - px) * t; py += (y - py) * t; out.push(px, py); d = Math.hypot(x - px, y - py); }
  }
  const lx = raw[raw.length - 2], ly = raw[raw.length - 1];
  if (Math.hypot(lx - px, ly - py) > 0.2) out.push(lx, ly);
  return out;
}
function sketchRiver(raw) {
  let pts = resample(raw, 0.7);
  const h = world.h, sea = world.sea;
  let n = pts.length / 2;
  const hAt = k => h[cellAt(pts[2 * k], pts[2 * k + 1])];
  if (n < 4) { toast('Draw a longer river, from its source toward the sea.'); return; }
  // Water runs toward the end that touches the sea, or else toward the lower end.
  const wet0 = hAt(0) < sea, wet1 = hAt(n - 1) < sea;
  if ((wet0 && !wet1) || (!wet0 && !wet1 && hAt(0) < hAt(n - 1))) { const r = []; for (let k = n - 1; k >= 0; k--) r.push(pts[2 * k], pts[2 * k + 1]); pts = r; }
  let first = 0; while (first < n && hAt(first) < sea) first++;
  if (first >= n - 2) { toast('Rivers need dry land to run across. Start the line on land.'); return; }
  let last = n - 1; for (let k = first; k < n; k++) if (hAt(k) < sea) { last = k; break; }
  // A bed that only ever runs downhill and sits below the lowest ground on either side of the line, so the water
  // can't spill out of the valley sideways. It never goes below sea level on land.
  const Wv = ui.sketch.valley, reach = Math.max(1.5, Wv * 0.8);
  const lowAround = k => {
    const cx = pts[2 * k], cy = pts[2 * k + 1]; let lo = Infinity;
    for (let y = Math.floor(cy - reach); y <= Math.ceil(cy + reach); y++) for (let x = Math.floor(cx - reach); x <= Math.ceil(cx + reach); x++) {
      if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 > reach * reach) continue;
      const v = h[cellAt(x, y)]; if (v < lo) lo = v;
    }
    return Math.max(lo, sea);
  };
  const bed = new Float32Array(n); let prev = Infinity;
  for (let k = first; k <= last; k++) {
    if (hAt(k) < sea) { bed[k] = sea + 0.0003; continue; }
    const b = Math.max(Math.min(prev - 2e-5, lowAround(k) - 0.004), sea + 0.0004 + 2e-6 * (last - k));
    bed[k] = b; prev = b;
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let k = first; k <= last; k++) { minX = Math.min(minX, pts[2 * k]); maxX = Math.max(maxX, pts[2 * k]); minY = Math.min(minY, pts[2 * k + 1]); maxY = Math.max(maxY, pts[2 * k + 1]); }
  const bx0 = clamp(Math.floor(minX - Wv) - 1, 0, W - 1), bx1 = clamp(Math.ceil(maxX + Wv) + 1, 0, W - 1), by0 = clamp(Math.floor(minY - Wv) - 1, 0, H - 1), by1 = clamp(Math.ceil(maxY + Wv) + 1, 0, H - 1);
  pushUndo({ h: true, meta: true });
  for (let gy = by0; gy <= by1; gy++) for (let gx = bx0; gx <= bx1; gx++) {
    const gi = gy * W + gx; if (h[gi] < sea) continue;
    const px = gx + 0.5, py = gy + 0.5; let bd = Infinity, bb = 0;
    for (let k = first; k < last; k++) {
      const ax = pts[2 * k], ay = pts[2 * k + 1], vx = pts[2 * k + 2] - ax, vy = pts[2 * k + 3] - ay, ll = vx * vx + vy * vy;
      const t = ll ? clamp(((px - ax) * vx + (py - ay) * vy) / ll, 0, 1) : 0;
      const d = Math.hypot(px - ax - vx * t, py - ay - vy * t);
      if (d < bd) { bd = d; bb = lerp(bed[k], bed[k + 1], t); }
    }
    if (bd < Wv) {
      // A flat channel about two cells wide at the bed, then banks rising to the old ground at the valley's edge.
      const f = bd <= 1 ? 0 : Math.pow((bd - 1) / Math.max(1, Wv - 1), 1.4);
      const target = bb + (h[gi] - bb) * f; if (target < h[gi]) h[gi] = Math.max(target, sea + 0.0003);
    }
  }
  if (!world.springs) world.springs = [];
  world.springs.push({ x: pts[2 * first], y: pts[2 * first + 1], flow: RIVER_T * 1.25 });
  settleSketch(bx0, by0, bx1, by1);
  toast(hAt(last) < sea ? 'River drawn. It gathers tributaries as rain drains into its valley.' : 'River drawn. It ends inland, so it finds its own way on from there.', { label: 'Undo', fn: undo });
}
// Cut a gorge from the bottom of a basin, along its overflow route, until the ground falls away on the far side.
function breach(pit) {
  const h = world.h, sea = world.sea, down = D.down;
  let run = h[pit], c = down[pit], guard = 0;
  while (c >= 0 && h[c] >= sea && guard++ < 4000) {
    run -= 1e-5;
    if (h[c] > run) {
      const cut = Math.max(run, sea + 1e-4), cx = c % W, cy = (c / W) | 0;
      for (let k = 0; k < 8; k++) {
        const nx = cx + NBX[k], ny = cy + NBY[k]; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const n = ny * W + nx; if (h[n] > cut) h[n] = Math.min(h[n], cut + (h[n] - cut) * 0.55 + 0.0005);
      }
      h[c] = cut;
    } else run = h[c];
    c = down[c];
  }
}
// After a sketch, let the land drain: shallow basins it created are filled, deep ones get a gorge through
// their lowest pass. Lakes that existed before the sketch are left alone.
function settleSketch(x0, y0, x1, y1) {
  const h = world.h, sea = world.sea, prev = undoStack[undoStack.length - 1].h, oldLake = D.lake.slice();
  const X0 = Math.max(0, x0 - 24), X1 = Math.min(W - 1, x1 + 24), Y0 = Math.max(0, y0 - 24), Y1 = Math.min(H - 1, y1 + 24);
  const inBasin = i => h[i] >= sea && D.filled[i] - h[i] > 1e-4;
  for (let pass = 0; pass < 4; pass++) {
    hydrology();
    const seen = new Uint8Array(N), stack = []; let touched = 0;
    for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) {
      const s0 = y * W + x; if (seen[s0] || !inBasin(s0)) continue;
      const comp = []; let pit = s0, deep = 0, old = false;
      seen[s0] = 1; stack.push(s0);
      while (stack.length) {
        const c = stack.pop(); comp.push(c);
        if (oldLake[c]) old = true;
        const dd = D.filled[c] - h[c]; if (dd > deep) deep = dd; if (h[c] < h[pit]) pit = c;
        const cx = c % W, cy = (c / W) | 0;
        for (let k = 0; k < 8; k++) { const nx = cx + NBX[k], ny = cy + NBY[k]; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const n = ny * W + nx; if (!seen[n] && inBasin(n)) { seen[n] = 1; stack.push(n); } }
      }
      if (old) continue;
      if (deep < 0.02) for (const c of comp) h[c] = D.filled[c];
      else breach(pit);
      touched++;
    }
    if (!touched) break;
  }
  hydrology();
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = y * W + x; if (h[i] >= sea && h[i] !== prev[i] && D.filled[i] > h[i]) h[i] = D.filled[i]; }
  recomputeAll(); markDirty();
}
function finishSketch() {
  const d = sketchDraft; sketchDraft = null; if (!d) return;
  if (d.mode === 'range') sketchRange(d.pts); else if (d.mode === 'river') sketchRiver(d.pts); else sketchLoop(d.pts, d.mode);
  requestDraw();
}
function drawSketch(c, v) {
  const P = sketchDraft.pts, n = P.length / 2; if (n < 2) return;
  const mode = sketchDraft.mode;
  c.save(); c.lineJoin = 'round'; c.lineCap = 'round';
  c.beginPath(); for (let k = 0; k < n; k++) { const X = v.ox + P[2 * k] * v.s, Y = v.oy + P[2 * k + 1] * v.s; if (k) c.lineTo(X, Y); else c.moveTo(X, Y); }
  if (mode === 'river') {
    c.lineWidth = Math.max(5, ui.sketch.valley * 2 * v.s); c.strokeStyle = 'rgba(46,112,150,0.22)'; c.stroke();
    c.lineWidth = 4.5; c.strokeStyle = 'rgba(255,255,255,0.7)'; c.stroke();
    c.lineWidth = 2.4; c.strokeStyle = '#1d5f88'; c.stroke();
    c.beginPath(); c.arc(v.ox + P[0] * v.s, v.oy + P[1] * v.s, 4, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill(); c.lineWidth = 1.5; c.stroke();
  } else if (mode === 'range') {
    c.lineWidth = Math.max(4, ui.sketch.width * 2 * v.s); c.strokeStyle = 'rgba(128,92,44,0.3)'; c.stroke();
    c.lineWidth = 2; c.setLineDash([6, 4]); c.strokeStyle = 'rgba(72,46,16,0.95)'; c.stroke(); c.setLineDash([]);
  } else {
    c.closePath(); c.fillStyle = mode === 'land' ? 'rgba(222,196,122,0.4)' : 'rgba(24,74,124,0.38)'; c.fill();
    c.lineWidth = 4; c.strokeStyle = 'rgba(255,255,255,0.75)'; c.stroke();
    c.lineWidth = 1.8; c.strokeStyle = mode === 'land' ? '#5a4415' : '#0f3656'; c.stroke();
    c.beginPath(); c.arc(v.ox + P[0] * v.s, v.oy + P[1] * v.s, 4, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill(); c.lineWidth = 1.5; c.stroke();
  }
  c.restore();
}

// ------------------------------------------------------------------ pointer
const ptrs = new Map(); let gesture = null, hover = null, hoverHit = null, spaceDown = false;
function local(e) { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
function hitTest(sx, sy) {
  let best = null, bd = 14 * 14;
  for (const p of world.places) { const X = view.ox + p.x * view.s, Y = view.oy + p.y * view.s, d = (X - sx) ** 2 + (Y - sy) ** 2; if (d < bd) { bd = d; best = { type: 'place', id: p.id }; } }
  if (best) return best;
  if (!ui.layers.labels) return null;
  const atlas = ui.style === 'atlas';
  for (let k = world.labels.length - 1; k >= 0; k--) {
    const l = world.labels[k], fs = l.size * view.s, st = labelStyle(l, atlas);
    ctx.save(); ctx.font = `${st.font} ${fs}px ${st.face}`; ctx.letterSpacing = `${(fs * st.sp).toFixed(1)}px`; const w = ctx.measureText(l.text).width; ctx.restore();
    const a = -(l.angle || 0) * Math.PI / 180, dx = sx - (view.ox + l.x * view.s), dy = sy - (view.oy + l.y * view.s);
    const rx = dx * Math.cos(a) - dy * Math.sin(a), ry = dx * Math.sin(a) + dy * Math.cos(a);
    if (Math.abs(rx) < w / 2 + 6 && Math.abs(ry) < fs * 0.7 + 4) return { type: 'label', id: l.id };
  }
  return null;
}
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId);
  const pt = local(e); ptrs.set(e.pointerId, pt);
  if (ptrs.size === 2) {
    if (stroke) endStroke();
    if (sketchDraft) { sketchDraft = null; requestDraw(); }
    const [a, b] = [...ptrs.values()];
    gesture = { type: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; return;
  }
  if (ptrs.size > 2) return;
  if (e.button === 1 || e.button === 2 || spaceDown) { gesture = { type: 'pan', lx: pt.x, ly: pt.y }; updateCursor(); return; }
  if (e.button !== 0) return;
  const w = toWorld(pt.x, pt.y);
  if (ui.tool === 'sketch') {
    if (w.x >= 0 && w.y >= 0 && w.x < W && w.y < H) { sketchDraft = { mode: ui.sketch.mode, pts: [w.x, w.y] }; gesture = { type: 'sketch' }; requestDraw(); }
    else gesture = { type: 'pan', lx: pt.x, ly: pt.y };
    return;
  }
  if (BRUSH_TOOLS.has(ui.tool)) { if (w.x >= 0 && w.y >= 0 && w.x < W && w.y < H) { startStroke(pt.x, pt.y); gesture = { type: 'stroke' }; } else gesture = { type: 'pan', lx: pt.x, ly: pt.y }; return; }
  if (ui.tool === 'select') {
    const hit = hitTest(pt.x, pt.y);
    if (hit) { select(hit); const o = findSel(hit); gesture = { type: 'drag', hit, sx: pt.x, sy: pt.y, gx: w.x - o.x, gy: w.y - o.y, moved: false }; return; }
  }
  gesture = { type: 'click', sx: pt.x, sy: pt.y, lx: pt.x, ly: pt.y, moved: false };
});
canvas.addEventListener('pointermove', e => {
  const pt = local(e);
  if (e.pointerType !== 'touch') hover = pt;
  if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, pt);
  const g = gesture;
  if (g) {
    if (g.type === 'pinch' && ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y) || 1, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      view.ox += mx - g.mx; view.oy += my - g.my; zoomAt(mx, my, d / g.d); g.d = d; g.mx = mx; g.my = my;
    } else if (g.type === 'pan' || g.type === 'click') {
      if (g.type === 'click' && !g.moved && Math.hypot(pt.x - g.sx, pt.y - g.sy) > 4) { g.moved = true; updateCursor(); }
      if (g.type === 'pan' || g.moved) { view.ox += pt.x - g.lx; view.oy += pt.y - g.ly; clampView(); requestDraw(); }
      g.lx = pt.x; g.ly = pt.y;
    } else if (g.type === 'stroke' && stroke) { stroke.x = pt.x; stroke.y = pt.y; }
    else if (g.type === 'sketch' && sketchDraft) {
      const w = toWorld(pt.x, pt.y), P = sketchDraft.pts, wx = clamp(w.x, 0, W), wy = clamp(w.y, 0, H);
      if (Math.hypot(wx - P[P.length - 2], wy - P[P.length - 1]) >= 0.6) { P.push(wx, wy); requestDraw(); }
    }
    else if (g.type === 'drag') {
      if (!g.moved && Math.hypot(pt.x - g.sx, pt.y - g.sy) > 3) { g.moved = true; pushUndo({ meta: true }); }
      if (g.moved) { const o = findSel(g.hit); if (o) { const w = toWorld(pt.x, pt.y); o.x = clamp(w.x - g.gx, 0.5, W - 0.5); o.y = clamp(w.y - g.gy, 0.5, H - 0.5); requestDraw(); } }
    }
  } else if (ui.tool === 'select' && e.pointerType !== 'touch') {
    const hh = hitTest(pt.x, pt.y); if (!!hh !== !!hoverHit) { hoverHit = hh; updateCursor(); }
  }
  scheduleStatus();
  if (BRUSH_TOOLS.has(ui.tool)) requestDraw();
});
function endPointer(e) {
  const pt = local(e); const had = ptrs.has(e.pointerId); ptrs.delete(e.pointerId);
  if (!had) return;
  const g = gesture;
  if (g && g.type === 'pinch') { if (ptrs.size === 0) gesture = null; else { const [a] = [...ptrs.values()]; gesture = { type: 'pan', lx: a.x, ly: a.y }; } return; }
  gesture = null;
  if (!g) return;
  if (g.type === 'stroke') endStroke();
  else if (g.type === 'sketch') { if (e.type === 'pointerup') finishSketch(); else { sketchDraft = null; requestDraw(); } }
  else if (g.type === 'click' && !g.moved && e.type === 'pointerup') handleClick(pt.x, pt.y);
  else if (g.type === 'drag' && g.moved) {
    const o = findSel(g.hit);
    if (g.hit.type === 'place' && o && o.kind !== 'landmark') recomputePolitics();
    requestDraw(); renderInspector(); markDirty();
  }
  updateCursor();
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('pointerleave', e => { if (e.pointerType !== 'touch') { hover = null; scheduleStatus(); requestDraw(); } });
canvas.addEventListener('wheel', e => {
  e.preventDefault(); const pt = local(e);
  const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
  zoomAt(pt.x, pt.y, Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0016)));
}, { passive: false });

function handleClick(sx, sy) {
  const w = toWorld(sx, sy);
  const inside = w.x >= 0 && w.y >= 0 && w.x < W && w.y < H;
  const t = ui.tool;
  if (t === 'select') { select(inside ? { type: 'loc', x: w.x, y: w.y } : null); return; }
  if (t === 'erase') {
    const hit = hitTest(sx, sy); if (!hit) { toast('Nothing to remove there. Click a place or a label.'); return; }
    removeSel(hit); return;
  }
  if (!inside) return;
  if (t === 'settle' || t === 'landmark') {
    const i = cellAt(w.x, w.y);
    if (!isLand(i) || D.lake[i]) { toast(t === 'settle' ? 'Settlements need dry land. Try the shore.' : 'Landmarks need dry land.'); return; }
    pushUndo({ meta: true });
    const p = t === 'settle' ? makePlace(ui.settleKind, w.x, w.y, Math.random) : makePlace('landmark', w.x, w.y, Math.random, { sub: ui.landmarkKind });
    world.places.push(p);
    if (p.kind !== 'landmark') recomputePolitics();
    select({ type: 'place', id: p.id });
    toast(p.kind === 'capital' ? `Founded ${p.name}, capital of ${realmDisplay(p.realm).replace(/^The /, 'the ')}.` : p.kind === 'landmark' ? `Marked ${p.name}.` : `Founded ${p.name}.`);
    markDirty(); refreshCodex(); return;
  }
  if (t === 'label') addLabel(w.x, w.y, ui.labelKind, ui.labelText.trim());
}
function addLabel(x, y, kind, text) {
  pushUndo({ meta: true });
  const tg = D.owner[cellAt(x, y)] >= 0 ? D.realms[D.owner[cellAt(x, y)]].tongue : pick(Math.random, TONGUE_IDS);
  const core = makeName(tg, Math.random, { bare: true });
  const auto = kind === 'sea' ? pick(Math.random, ['The % Sea', 'Bay of %', 'Gulf of %', 'The % Sound']) : kind === 'range' ? pick(Math.random, ['The % Mountains', 'The % Hills', 'The % Range']) : pick(Math.random, ['The % Downs', 'The % Wold', 'The % Reach', '%', 'The % Wastes', 'The % Weald']);
  const l = { id: world.nextId++, kind, text: text || auto.replace('%', core), x, y, size: kind === 'sea' ? 6 : kind === 'range' ? 4.6 : 5, angle: 0 };
  world.labels.push(l); select({ type: 'label', id: l.id }); markDirty();
}
function removeSel(sel) {
  const o = findSel(sel); if (!o) return;
  pushUndo({ meta: true });
  if (sel.type === 'place') { world.places = world.places.filter(p => p.id !== o.id); if (o.kind !== 'landmark') recomputePolitics(); }
  else world.labels = world.labels.filter(l => l.id !== o.id);
  if (ui.selected && ui.selected.type === sel.type && ui.selected.id === sel.id) ui.selected = null;
  toast(`Removed ${sel.type === 'place' ? o.name : 'the label'}.`, { label: 'Undo', fn: undo });
  requestDraw(); renderInspector(); refreshCodex(); markDirty();
}

// ------------------------------------------------------------------ status bar
let statusQueued = false;
function scheduleStatus() { if (statusQueued) return; statusQueued = true; requestAnimationFrame(() => { statusQueued = false; updateStatus(); }); }
function updateStatus() {
  const el = $('#status');
  if (!hover) { el.hidden = true; return; }
  const w = toWorld(hover.x, hover.y);
  if (w.x < 0 || w.y < 0 || w.x >= W || w.y >= H) { el.hidden = true; return; }
  const i = cellAt(w.x, w.y), E = elevM(i), water = world.h[i] < world.sea && !D.lake[i];
  const parts = [fmtPos(w.x, w.y), water ? `${fmtInt(-E)} m deep` : `${fmtInt(Math.max(0, E))} m`, BIOME_NAME[D.biome[i]], `${Math.round(D.temp[i])} °C`];
  const own = D.owner[i]; if (own >= 0 && !water && D.realms[own]) parts.push(D.realms[own].name);
  el.textContent = parts.join('  ·  '); el.hidden = false;
}

// ------------------------------------------------------------------ facts
function nearestSeaLabel(x, y) { let best = null, bd = Infinity; for (const l of world.labels) if (l.kind === 'sea') { const d = (l.x - x) ** 2 + (l.y - y) ** 2; if (d < bd) { bd = d; best = l; } } return best ? best.text.replace(/^The /, 'the ') : null; }
function facts(x, y, self) {
  const i = cellAt(x, y), h = world.h, sea = world.sea, water = h[i] < sea, lake = !!D.lake[i], E = elevM(i);
  const f = { i, x, y, water, lake, E, temp: D.temp[i], precip: precip(i), b: D.biome[i], biome: BIOME_NAME[D.biome[i]] };
  f.owner = D.owner[i]; f.realm = f.owner >= 0 ? D.realms[f.owner] : null;
  f.coastal = !water && nearWater(i, 2);
  f.river = null;
  if (!water) { let best = -1, ba = RIVER_T; const cx = i % W, cy = (i / W) | 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const j = ny * W + nx; if (D.isR[j] && D.acc[j] > ba) { ba = D.acc[j]; best = j; } } if (best >= 0) f.river = riverName(mouthOf(best)); }
  let nb = null, nd = Infinity; for (const p of world.places) { if (p === self) continue; const d = Math.hypot(p.x - x, p.y - y); if (d < nd) { nd = d; nb = p; } }
  f.near = nb ? { p: nb, leagues: Math.max(1, Math.round(nd * KM / LEAGUE)), dir: compass(x - nb.x, y - nb.y) } : null;
  f.sea = f.coastal ? nearestSeaLabel(x, y) : null;
  f.goods = [];
  if (!water) {
    const rng = mulberry32(hash3(i, world.seed, 31)); const pool = (GOODS[f.b] || []).slice();
    if (E > 900) pool.push(pick(rng, ['iron', 'copper', 'tin', 'marble']));
    if (f.coastal) pool.push(pick(rng, ['salted fish', 'pearls', 'sea salt']));
    if (f.river) pool.push('river trade');
    shuffle(pool, rng); f.goods = pool.slice(0, 3);
  }
  return f;
}
function factsHTML(f, p) {
  const rows = [];
  rows.push(['Position', `<span class="mono">${fmtPos(f.x, f.y)}</span>`]);
  if (f.water && !f.lake) rows.push(['Depth', `<span class="mono">${fmtInt(-f.E)} m</span>`]);
  else rows.push(['Elevation', `<span class="mono">${fmtInt(Math.max(0, f.E))} m</span>`]);
  rows.push([f.water && !f.lake ? 'Water' : 'Climate', `<span class="mono">${Math.round(f.temp)} °C</span> mean` + (f.water && !f.lake ? '' : ` · <span class="mono">${fmtInt(f.precip)} mm</span> rain`)]);
  if (!f.water || f.lake) rows.push(['Land', esc(f.biome)]);
  if (!f.water) {
    const bits = [f.coastal ? `On the coast of ${esc(f.sea || 'the sea')}` : 'Inland']; if (f.river) bits.push(`on ${esc(f.river.on)}`);
    rows.push(['Setting', bits.join(', ')]);
  }
  rows.push([f.water ? 'Waters of' : 'Realm', f.realm ? `<span class="swatch" style="background:${f.realm.color}"></span> ${esc(f.realm.display)}` : (f.water ? 'No realm' : 'Unclaimed')]);
  if (p && p.pop) rows.push(['Population', `<span class="mono">~${fmtInt(p.pop)}</span>`]);
  if (f.near) rows.push(['Nearest', `${f.near.leagues} league${f.near.leagues === 1 ? '' : 's'} ${f.near.dir} of <button class="link" data-goto="${f.near.p.id}">${esc(f.near.p.name)}</button>`]);
  if (f.goods.length) rows.push(['Goods', esc(f.goods.join(', '))]);
  return `<dl class="facts">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;
}

// ------------------------------------------------------------------ stories
function storyCtx(p) {
  const f = facts(p.x, p.y, p);
  const nearby = world.places.filter(q => q !== p).map(q => ({ q, d: Math.hypot(q.x - p.x, q.y - p.y) })).sort((a, b) => a.d - b.d).slice(0, 6);
  const lm = nearby.find(n => n.q.kind === 'landmark');
  const others = D.realms.filter(r => !f.realm || r.idx !== f.realm.idx);
  const range = world.labels.find(l => l.kind === 'range');
  return {
    f, name: p.name, realm: f.realm, near: f.near ? { name: f.near.p.name, leagues: f.near.leagues, dir: f.near.dir } : null,
    landmark: lm ? lm.q : null, other: others.length ? others[Math.floor(Math.random() * others.length)] : null, range: range ? range.text.replace(/^The /, '') : null,
    coastal: f.coastal, river: f.river, cold: f.temp < 3, dry: f.b === B.DESERT || f.b === B.STEPPE, forest: [B.TFOREST, B.TRAIN, B.TAIGA, B.TROP, B.JUNGLE].includes(f.b), high: f.E > 1100, capital: p.kind === 'capital', nearby,
  };
}
function rumor(p) {
  const c = storyCtx(p), g = c.f.goods[0] || 'grain';
  const T = [
    () => c.coastal && `Fishermen in ${c.name} swear ${c.f.sea || 'the sea'} glows green on moonless nights, and the catch has doubled since it started.`,
    () => c.near && `A caravan bound for ${c.near.name} never arrived. Its cold campfire was found ${c.near.leagues} leagues out, every crate still sealed.`,
    () => c.realm && `${c.realm.display} has doubled the toll on ${g} leaving ${c.name}, and the tax collectors will not say why.`,
    () => c.river && `Every seventh spring ${c.river.on} runs the color of rust for a day. The elders of ${c.name} have been counting, and this is the seventh spring.`,
    () => c.landmark && `Children in ${c.name} sing a rhyme about ${c.landmark.name} that no adult admits to teaching them.`,
    () => `The oldest well in ${c.name} has started bringing up coins instead of water. They are stamped with a face nobody recognizes.`,
    () => c.other && `Envoys from ${realmMid(c.other)} were seen in ${c.name}, buying every map of ${c.range ? 'the ' + c.range : 'the high country'} they could find.`,
    () => c.high && `Shepherds above ${c.name} report a new pass through the peaks, one that was not there last winter.`,
    () => c.cold && `A hunter walked into ${c.name} at midsummer with frost still on their coat and no memory of the last three weeks.`,
    () => c.dry && `A buried street has surfaced in the sands outside ${c.name}. Its lamps are still lit.`,
    () => c.forest && `Woodcutters from ${c.name} refuse to fell any tree carved with a spiral. Each morning there are more spirals.`,
    () => c.capital && `The heir of ${realmMid(c.realm)} has not appeared in public for forty days. The palace says it is a fever.`,
    () => `A stranger in ${c.name} pays in gold for anyone who can read an old map. On the map, ${c.name} is drawn as a lake.`,
    () => !c.realm && `No realm claims ${c.name}, but someone has been collecting its taxes all the same.`,
  ];
  const opts = T.map(fn => fn()).filter(Boolean);
  return opts[Math.floor(Math.random() * opts.length)];
}
function buildPrompt(p) {
  const c = storyCtx(p), f = c.f;
  const L = [];
  L.push(`World: ${world.name}`);
  L.push(`Place: ${p.name}, a ${kindLabel(p).toLowerCase()}${p.pop ? ` of about ${fmtInt(p.pop)} people` : ''}.`);
  L.push(f.realm ? `Realm: ${f.realm.display}${p.kind === 'capital' ? ' (this is its capital)' : ''}. Its people speak the ${TONGUES[f.realm.tongue].label} tongue.` : 'Realm: none. It lies in unclaimed land.');
  L.push(`Terrain: ${f.biome}, ${fmtInt(Math.max(0, f.E))} m above sea level, mean temperature ${Math.round(f.temp)} °C, ${fmtInt(f.precip)} mm of rain a year.`);
  if (f.coastal) L.push(`It sits on the coast of ${f.sea || 'the sea'}.`);
  if (f.river) L.push(`It sits on ${f.river.on}.`);
  if (f.goods.length) L.push(`Local goods: ${f.goods.join(', ')}.`);
  if (c.nearby.length) { L.push('Nearby:'); for (const n of c.nearby) L.push(`- ${n.q.name} (${kindLabel(n.q).toLowerCase()}), ${Math.max(1, Math.round(n.d * KM / LEAGUE))} leagues ${compass(n.q.x - p.x, n.q.y - p.y)}`); }
  if (D.realms.length) L.push(`Realms of this world: ${D.realms.map(r => r.display).join('; ')}.`);
  if (p.lore.trim()) L.push(`The builder's own notes, which are canon:\n${p.lore.trim().slice(0, 2500)}`);
  return `You're helping someone build a fictional world on a map. Write a short history of one place in it.\n\n${L.join('\n')}\n\nWrite two short paragraphs, 140 words at most in total, in the voice of an old gazetteer. Ground the history in the geography above and mention at least one nearby place by name. Respect the builder's notes if there are any. Then add a final separate line that starts with "Hook:" and gives one unresolved mystery a storyteller could use. Plain text only: no headings, no markdown, no lists.`;
}

// ------------------------------------------------------------------ inspector
const draft = { placeId: null, text: '', busy: false, kind: '', note: '', ctl: null };
function kindGlyph(p, sz = 16) {
  const c = p.realm ? p.realm.color : 'currentColor';
  if (p.kind === 'capital') return `<svg width="${sz}" height="${sz}" viewBox="-8 -8 16 16" aria-hidden="true"><path d="M0-7 1.8-2.4 6.7-2.2 2.9 1 4.1 5.7 0 3 -4.1 5.7 -2.9 1 -6.7-2.2 -1.8-2.4Z" fill="${c}" stroke="currentColor" stroke-width="1"/></svg>`;
  if (p.kind === 'city') return `<svg width="${sz}" height="${sz}" viewBox="-8 -8 16 16" aria-hidden="true"><circle r="5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle r="2" fill="currentColor"/></svg>`;
  if (p.kind === 'town') return `<svg width="${sz}" height="${sz}" viewBox="-8 -8 16 16" aria-hidden="true"><circle r="4" fill="currentColor"/></svg>`;
  if (p.kind === 'village') return `<svg width="${sz}" height="${sz}" viewBox="-8 -8 16 16" aria-hidden="true"><circle r="2.6" fill="currentColor"/></svg>`;
  const lm = LM_PATHS[p.sub] || LM_PATHS.ruin;
  return `<svg width="${sz}" height="${sz}" viewBox="-8 -8 16 16" aria-hidden="true"><path d="${lm.d}" ${lm.fill ? 'fill="currentColor"' : 'fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"'}/>${lm.inner ? `<path d="${lm.inner}" style="fill:var(--panel)"/>` : ''}</svg>`;
}
function select(sel) {
  ui.selected = sel;
  if (sel) showTab('inspect');
  if (!sel || sel.type !== 'place' || draft.placeId !== sel.id) { if (draft.ctl) draft.ctl.abort(); Object.assign(draft, { placeId: null, text: '', busy: false, kind: '', note: '', ctl: null }); }
  renderInspector(); requestDraw();
}
function renderInspector() {
  const pane = $('#pane-inspect'); const sel = ui.selected; const o = findSel(sel);
  if (!sel || !o) { pane.innerHTML = welcomeHTML(); bindGotos(pane); return; }
  if (sel.type === 'place') { pane.innerHTML = placeHTML(o); bindPlace(o); }
  else if (sel.type === 'label') { pane.innerHTML = labelHTML(o); bindLabel(o); }
  else { pane.innerHTML = locHTML(o); bindLoc(o); }
  bindGotos(pane);
}
function bindGotos(pane) { pane.querySelectorAll('[data-goto]').forEach(b => b.onclick = () => { const p = world.places.find(q => q.id === +b.dataset.goto); if (p) { select({ type: 'place', id: p.id }); centerOn(p.x, p.y); } }); }
const JD_FOOT = `<footer class="jd-foot">  <a href="https://junkdrawer.works/">Part of junkdrawer.works</a>  <span aria-hidden="true">·</span>  <a href="https://junkdrawer.works/privacy.html">Privacy</a></footer>`;
function welcomeHTML() {
  const settl = world.places.filter(p => p.kind !== 'landmark').length, lms = world.places.length - settl;
  let land = 0; for (let i = 0; i < N; i++) if (world.h[i] >= world.sea) land++;
  const cap = world.places.find(p => p.kind === 'capital');
  const head = `<p class="eyebrow">Gazetteer</p><h2 class="display">${esc(world.name)}</h2>`;
  if (!land) return `<div class="welcome">${head}
    <p>Open water, waiting for its first coastline.</p>
    <ul class="tips">
      <li>Pick <b>Sketch</b> on the left, choose <b>Land</b>, and draw a loop on the sea. Land rises inside it, with hills and a natural coast.</li>
      <li>Choose <b>Sea</b> to carve bays, straits and inland seas, <b>Mountain range</b> to draw a ridge line, or <b>River</b> to run water from a source to the coast. Other rivers and lakes form on their own.</li>
      <li>When the land looks right, <b>Found new realms</b> in the World tab fills it with towns, borders and names.</li>
    </ul></div>${JD_FOOT}`;
  const origin = world.shape === 'blank' ? 'Drawn by hand on open water.' : `Grown from seed <span class="mono">${world.seed}</span>.`;
  const stats = world.places.length
    ? `${D.realms.length} realm${D.realms.length === 1 ? '' : 's'}, ${settl} settlement${settl === 1 ? '' : 's'} and ${lms} landmark${lms === 1 ? '' : 's'} across <span class="mono">${fmtInt(land * KM * KM)}</span> km² of land.`
    : `<span class="mono">${fmtInt(land * KM * KM)}</span> km² of land, with no towns or realms yet.`;
  return `<div class="welcome">${head}
    <p>${stats} ${origin}</p>
    <ul class="tips">
      ${world.places.length ? `<li>Click any place or patch of ground to read about it${cap ? `, or start with <button class="link" data-goto="${cap.id}">${esc(cap.name)}</button>` : ''}.</li>` : `<li><b>Found new realms</b> in the World tab fills this land with towns, borders and names. You can also place them yourself with the settle tool.</li>`}
      <li>Use <b>Sketch</b> to draw new coastlines, carve bays, add a mountain range or run a river. <b>Raise</b> and <b>Lower</b> paint the details. Rivers, lakes and borders follow the terrain.</li>
      <li>Found a <b>capital</b> with the settle tool to start a realm of your own.</li>
      <li>Every place has a page for notes. ${CL ? 'Roll a rumor, or ask Claude to draft a history from the geography.' : 'Roll a rumor for a story to start from.'}</li>
    </ul>
  </div>${JD_FOOT}`;
}
function placeHTML(p) {
  const f = facts(p.x, p.y, p);
  const kindOpts = [['capital', 'Capital'], ['city', 'City'], ['town', 'Town'], ['village', 'Village'], ...Object.entries(LANDMARKS).map(([k, v]) => ['landmark:' + k, v.label])];
  const cur = p.kind === 'landmark' ? 'landmark:' + p.sub : p.kind;
  let realm = '';
  if (p.kind === 'capital' && p.realm) {
    realm = `<div class="section"><h3>Realm</h3>
      <div class="field"><label for="rName">Name</label><input type="text" id="rName" value="${esc(p.realm.name)}"></div>
      <div class="field"><label for="rTitle">Title</label><select id="rTitle">${ALL_TITLES.map(t => `<option ${t === p.realm.title ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>
      <div class="field"><label for="rTongue">Tongue</label><select id="rTongue">${TONGUE_IDS.map(t => `<option value="${t}" ${t === p.tongue ? 'selected' : ''}>${TONGUES[t].label}</option>`).join('')}</select></div>
      <div class="field"><span class="h3" style="text-transform:none;letter-spacing:0;font-weight:400;font-size:12px">Color</span><div class="swatches" role="group" aria-label="Realm color">${REALM_COLORS.map(c => `<button data-color="${c}" style="background:${c}" aria-label="Color ${c}" aria-pressed="${c === p.realm.color}"></button>`).join('')}</div></div>
      <p class="note">${f.realm ? `<span class="mono">${fmtInt(f.realm.area * KM * KM)}</span> km², ${f.realm.count} settlement${f.realm.count === 1 ? '' : 's'}, about <span class="mono">${fmtInt(f.realm.pop)}</span> people.` : ''} New places founded here take their names from its tongue.</p>
    </div>`;
  }
  const busy = draft.busy && draft.placeId === p.id;
  return `<div>
      <p class="eyebrow"><span class="glyph">${kindGlyph(p, 15)}</span>${esc(kindLabel(p))}${f.realm ? ` · <span class="swatch" style="background:${f.realm.color}"></span>${esc(f.realm.display)}` : ''}</p>
      <div class="name-row"><label class="sr" for="pName">Name</label><input id="pName" class="name-input" value="${esc(p.name)}" autocomplete="off" spellcheck="false">
      <button class="icon-btn" id="pReroll" title="Suggest another name" aria-label="Suggest another name">${svgIcon('<path d="M16 4v4h-4"/><path d="M15.5 8A6.5 6.5 0 1 0 16 12"/>', 17)}</button></div>
    </div>
    <div class="field"><label for="pKind">Kind</label><select id="pKind">${kindOpts.map(([v, l]) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    ${factsHTML(f, p)}
    ${realm}
    <div class="section"><h3>Chronicle</h3>
      <div class="row">
        <button class="btn sm primary" id="pWrite" ${sampleFn ? '' : 'hidden'}>${busy ? 'Stop' : 'Write its history'}</button>
        <button class="btn sm" id="pRumor">Roll a rumor</button>
      </div>
      <div class="draft" id="draftBox" hidden></div>
      <div class="row" id="draftActions" hidden><button class="btn sm" id="dKeep">Keep in notes</button><button class="btn sm" id="dDiscard">Discard</button></div>
      <p class="note" id="draftNote">${sampleFn ? 'Claude drafts a history from the geography and your notes. Nothing is added until you keep it.' : 'Rumors come from the map around this place. Keep the ones you like.'}</p>
    </div>
    <div class="section"><h3><label for="pLore">Notes and lore</label></h3>
      <textarea id="pLore" placeholder="Who rules here? What do travelers whisper about? Anything you write here also guides the history Claude drafts.">${esc(p.lore)}</textarea>
    </div>
    <button class="link danger" id="pDelete">Remove ${esc(p.name)}</button>`;
}
function renderDraft() {
  const box = $('#draftBox'), act = $('#draftActions'), note = $('#draftNote'), wb = $('#pWrite');
  if (!box || !ui.selected || draft.placeId !== ui.selected.id) return;
  const has = draft.busy || draft.text;
  box.hidden = !has; box.classList.toggle('busy', draft.busy && !draft.text);
  box.textContent = draft.busy && !draft.text ? 'Claude is thinking about this place…' : draft.text;
  act.hidden = draft.busy || !draft.text;
  if (draft.note) { note.textContent = draft.note; note.classList.add('warn'); }
  if (wb) { wb.textContent = draft.busy ? 'Stop' : (draft.kind === 'claude' && draft.text ? 'Write another' : 'Write its history'); wb.hidden = !sampleFn; }
}
const SAMPLE_OFF = ['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed'];
function sampleCopy(code) {
  switch (code) {
    case 'rate_limited': return 'Claude has had a lot of requests from you just now. Try again in a minute.';
    case 'session_expired': return 'Sign in to Claude again, then try once more.';
    case 'refused': return 'Claude declined to write this one. Change the notes and try again.';
    case 'prompt_too_large': return 'The notes are too long to send. Shorten them and try again.';
    case 'empty_completion': return 'Claude came back empty. Try again.';
    default: return 'Could not reach Claude. Try again.';
  }
}
async function writeHistory(p) {
  if (draft.busy && draft.kind === 'claude') { draft.ctl && draft.ctl.abort(); return; }
  if (!sampleFn) return;
  const ctl = new AbortController();
  Object.assign(draft, { placeId: p.id, text: '', busy: true, kind: 'claude', note: '', ctl });
  renderDraft();
  try {
    const res = await sampleFn(buildPrompt(p), { signal: ctl.signal, cache: false, onText: ({ text }) => { if (draft.ctl === ctl) { draft.text = text; renderDraft(); } } });
    if (draft.ctl !== ctl) return;
    draft.text = res.text.trim(); if (res.truncated) draft.note = 'Claude ran out of room, so the draft stops early.';
  } catch (e) {
    if (draft.ctl !== ctl) return;
    const code = e && e.code;
    draft.text = code === 'refused' ? '' : (e && e.text) || '';
    if (SAMPLE_OFF.includes(code)) { sampleFn = null; draft.note = 'Claude is not available on this page, so the history writer is off. Rumors still work.'; }
    else if (code !== 'cancelled') draft.note = sampleCopy(code);
  }
  if (draft.ctl === ctl) { draft.busy = false; draft.ctl = null; }
  renderDraft();
}
function bindPlace(p) {
  // Edits on this page are one undo step, so Undo steps back through them before anything older. Notes stay out of undo.
  let pushed = false; const once = () => { if (!pushed) { pushUndo({ meta: true }); pushed = true; } };
  const nm = $('#pName');
  nm.addEventListener('input', () => { once(); p.name = nm.value; requestDraw(); markDirty(); });
  nm.addEventListener('change', () => { if (!p.name.trim()) { p.name = 'Nameless'; nm.value = p.name; } refreshCodex(); requestDraw(); });
  $('#pReroll').onclick = () => { pushUndo({ meta: true }); p.name = p.kind === 'landmark' ? landmarkName(p.sub, p.tongue, Math.random) : makeName(p.tongue, Math.random); nm.value = p.name; $('#pDelete').textContent = `Remove ${p.name}`; requestDraw(); refreshCodex(); markDirty(); };
  $('#pKind').onchange = e => changeKind(p, e.target.value);
  $('#pLore').addEventListener('input', e => { p.lore = e.target.value; markDirty(); });
  $('#pDelete').onclick = () => removeSel({ type: 'place', id: p.id });
  $('#pRumor').onclick = () => { if (draft.busy) return; Object.assign(draft, { placeId: p.id, text: rumor(p), busy: false, kind: 'rumor', note: '', ctl: null }); renderDraft(); };
  const wb = $('#pWrite'); if (wb) wb.onclick = () => writeHistory(p);
  $('#dKeep').onclick = () => { const ta = $('#pLore'); p.lore = (p.lore.trim() ? p.lore.trimEnd() + '\n\n' : '') + draft.text.trim(); ta.value = p.lore; Object.assign(draft, { text: '', kind: '', note: '' }); renderDraft(); markDirty(); toast('Added to the notes.'); };
  $('#dDiscard').onclick = () => { Object.assign(draft, { text: '', kind: '', note: '' }); renderDraft(); };
  if (p.kind === 'capital' && p.realm) {
    const rn = $('#rName');
    rn.addEventListener('input', () => { once(); p.realm.name = rn.value; requestDraw(); markDirty(); });
    rn.addEventListener('change', () => { if (!p.realm.name.trim()) { p.realm.name = 'Nameless'; rn.value = 'Nameless'; } renderInspector(); refreshCodex(); });
    $('#rTitle').onchange = e => { once(); p.realm.title = e.target.value; requestDraw(); markDirty(); renderInspector(); refreshCodex(); };
    $('#rTongue').onchange = e => { once(); p.tongue = e.target.value; markDirty(); };
    document.querySelectorAll('[data-color]').forEach(b => b.onclick = () => { once(); p.realm.color = b.dataset.color; renderTint(); requestDraw(); markDirty(); renderInspector(); refreshCodex(); });
  }
  renderDraft();
}
function changeKind(p, val) {
  pushUndo({ meta: true });
  const [kind, sub] = val.split(':');
  if (kind === 'landmark') { p.kind = 'landmark'; p.sub = sub; delete p.realm; p.pop = 0; }
  else {
    if (kind === 'capital' && !p.realm) p.realm = newRealm(p.tongue, Math.random);
    if (kind !== 'capital') delete p.realm;
    p.kind = kind; delete p.sub; p.pop = rollPop(kind, cellAt(p.x, p.y), Math.random);
  }
  recomputePolitics(); renderInspector(); refreshCodex(); requestDraw(); markDirty();
}
function labelHTML(l) {
  return `<div><p class="eyebrow">Map label</p>
      <label class="sr" for="lText">Label text</label><input id="lText" class="name-input" value="${esc(l.text)}" autocomplete="off" spellcheck="false"></div>
    <div class="field"><label for="lKind">Style</label><select id="lKind"><option value="region" ${l.kind === 'region' ? 'selected' : ''}>Region</option><option value="sea" ${l.kind === 'sea' ? 'selected' : ''}>Sea or water</option><option value="range" ${l.kind === 'range' ? 'selected' : ''}>Mountains</option></select></div>
    <div class="field"><label for="lSize">Size</label><input type="range" id="lSize" min="3" max="16" step="0.2" value="${l.size}"></div>
    <div class="field"><label for="lAngle">Angle</label><input type="range" id="lAngle" min="-60" max="60" step="1" value="${l.angle || 0}"></div>
    <p class="note">Drag the label on the map with the select tool to move it.</p>
    <button class="link danger" id="lDelete">Remove this label</button>`;
}
function bindLabel(l) {
  let pushed = false; const once = () => { if (!pushed) { pushUndo({ meta: true }); pushed = true; } };
  $('#lText').addEventListener('input', e => { once(); l.text = e.target.value; requestDraw(); markDirty(); });
  $('#lKind').onchange = e => { once(); l.kind = e.target.value; requestDraw(); markDirty(); };
  $('#lSize').addEventListener('input', e => { once(); l.size = +e.target.value; requestDraw(); markDirty(); });
  $('#lAngle').addEventListener('input', e => { once(); l.angle = +e.target.value; requestDraw(); markDirty(); });
  $('#lDelete').onclick = () => removeSel({ type: 'label', id: l.id });
}
function locHTML(o) {
  const f = facts(o.x, o.y, null);
  const title = f.water && !f.lake ? (nearestSeaLabel(o.x, o.y) || 'Open sea').replace(/^the /, 'The ') : f.biome;
  return `<div><p class="eyebrow">Location</p><h2 class="display">${esc(title)}</h2></div>
    ${factsHTML(f, null)}
    ${f.water || f.lake ? '' : `<div class="row"><button class="btn sm" id="locTown">Found a town here</button><button class="btn sm" id="locLabel">Label this spot</button></div>`}`;
}
function bindLoc(o) {
  const t = $('#locTown'); if (t) t.onclick = () => { pushUndo({ meta: true }); const p = makePlace('town', o.x, o.y, Math.random); world.places.push(p); recomputePolitics(); select({ type: 'place', id: p.id }); refreshCodex(); markDirty(); toast(`Founded ${p.name}.`); };
  const l = $('#locLabel'); if (l) l.onclick = () => addLabel(o.x, o.y, 'region', '');
}

// ------------------------------------------------------------------ codex
function refreshCodex() { if (ui.tab === 'codex') renderCodex(); }
function renderCodex() {
  const q = $('#codexQ').value.trim().toLowerCase();
  const match = s => !q || s.toLowerCase().includes(q);
  const ownerOf = p => D.owner[cellAt(p.x, p.y)];
  let h = '';
  const realms = D.realms.filter(r => match(r.display) || match(r.place.name));
  if (realms.length) {
    h += `<div class="group-h">Realms</div><div class="clist">` + realms.map(r => `<button class="crow" data-id="${r.place.id}"><span class="ic"><span class="swatch" style="background:${r.color};width:13px;height:13px"></span></span><span><span class="nm">${esc(r.display)}</span><br><span class="meta">Capital ${esc(r.place.name)}</span></span><span class="meta mono">${fmtInt(r.area * KM * KM)} km²</span></button>`).join('') + `</div>`;
  }
  const groups = D.realms.map(r => ({ title: r.name, color: r.color, items: world.places.filter(p => ownerOf(p) === r.idx) }));
  groups.push({ title: 'Unclaimed lands', color: null, items: world.places.filter(p => ownerOf(p) < 0) });
  let any = false;
  for (const g of groups) {
    const items = g.items.filter(p => match(p.name)).sort((a, b) => P_ORDER[b.kind] - P_ORDER[a.kind] || (b.pop || 0) - (a.pop || 0));
    if (!items.length) continue; any = true;
    h += `<div class="group-h">${g.color ? `<span class="swatch" style="background:${g.color}"></span>` : ''}${esc(g.title)}</div><div class="clist">` + items.map(p => `<button class="crow" data-id="${p.id}"><span class="ic">${kindGlyph(p, 15)}</span><span class="nm">${esc(p.name)}</span><span class="meta">${esc(kindLabel(p))}${p.pop ? ` · <span class="mono">${fmtInt(p.pop)}</span>` : ''}</span></button>`).join('') + `</div>`;
  }
  if (!realms.length && !any) h = `<p class="note">${q ? 'Nothing by that name yet.' : 'No places yet. Use the settle tool to found one.'}</p>`;
  $('#codexList').innerHTML = h;
  $('#codexList').querySelectorAll('.crow').forEach(b => b.onclick = () => { const p = world.places.find(x => x.id === +b.dataset.id); if (p) { select({ type: 'place', id: p.id }); centerOn(p.x, p.y); } });
}

// ------------------------------------------------------------------ tabs, world tab
function showTab(t) {
  ui.tab = t;
  for (const k of ['inspect', 'codex', 'world']) { $('#tab-' + k).setAttribute('aria-selected', String(k === t)); $('#pane-' + k).hidden = k !== t; }
  if (t === 'codex') renderCodex();
  if (t === 'world') syncWorldTab();
}
function landShare() { let land = 0; for (let i = 0; i < N; i++) if (world.h[i] >= world.sea) land++; return land / N; }
function syncWorldTab() {
  $('#worldName').value = world.name;
  $('#wSeed').value = world.seed; $('#wShape').value = world.shape; $('#wSea').value = world.sea;
  $('#wSeaOut').textContent = `${Math.round(landShare() * 100)}% of the map is land`;
  for (const k of ['realms', 'rivers', 'labels', 'names', 'grid']) $('#ly' + k[0].toUpperCase() + k.slice(1)).checked = ui.layers[k];
  $('#styleTerrain').setAttribute('aria-pressed', String(ui.style === 'terrain')); $('#styleAtlas').setAttribute('aria-pressed', String(ui.style === 'atlas'));
}
function refreshPanels() { renderInspector(); refreshCodex(); if (ui.tab === 'world') syncWorldTab(); else $('#worldName').value = world.name; }
function setStyle(st) { if (ui.style === st) return; ui.style = st; buildContours(); buildGlyphs(); renderBase(); syncWorldTab(); requestDraw(); savePrefs(); }
const slug = () => (world.name || 'world').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'world';
function browserDownload(name, data) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: name.endsWith('.json') ? 'application/json' : 'application/octet-stream' });
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
async function saveFile(name, data, done) {
  await dlReady;
  if (!CL) { browserDownload(name, data); toast(done); return; }
  const dl = downloadsNS; if (!dl) { toast('Saving files is not available in this view.'); return; }
  try { await dl.save({ filename: name, data }); toast(done); }
  catch (e) { const c = e && e.code; if (c === 'declined') return; toast(c === 'rate_limited' ? 'A save is already waiting for your answer.' : 'The file could not be saved here.'); }
}
// The whole map at S pixels per cell: what Save map image saves, with every name (or only capitals and cities).
function renderMapImage(S = 4, allNames = true) {
  const M = Math.round(S * 7.5), cw = W * S + M * 2, ch = H * S + M * 2;
  const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
  drawMap(cv.getContext('2d'), 1, cw, ch, { s: S, ox: M, oy: M, s0: allNames ? S / 2 : S }, { plate: ui.style === 'atlas' ? '#E9DFC6' : '#DCE3E5', export: true, allNames });
  return cv;
}
function savePng() {
  const cv = renderMapImage(4);
  cv.toBlob(blob => { if (blob) saveFile(slug() + '.png', blob, 'Map image saved.'); else toast('The image could not be made.'); }, 'image/png');
}
function bindWorldTab() {
  $('#wShape').innerHTML = Object.entries(SHAPES).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
  $('#wGen').onclick = () => { const s = clamp(parseInt($('#wSeed').value, 10) || 1, 1, 999999); newWorld(s, $('#wShape').value); syncWorldTab(); markDirty(); toast(`Generated world ${s}.`, { label: 'Undo', fn: undo }); };
  $('#wBlank').onclick = startBlank;
  $('#wDice').onclick = () => { $('#wSeed').value = 1 + Math.floor(Math.random() * 999998); };
  let seaEditing = false;
  $('#wSea').addEventListener('input', e => {
    if (!seaEditing) { pushUndo({ meta: true }); seaEditing = true; }
    world.sea = +e.target.value; computeClimate(); renderBase(); buildCoast(); buildContours(); buildGlyphs(); requestDraw();
    $('#wSeaOut').textContent = `${Math.round(landShare() * 100)}% of the map is land`;
  });
  $('#wSea').addEventListener('change', () => { seaEditing = false; recomputeAll(); markDirty(); });
  $('#wPopulate').onclick = () => { pushUndo({ meta: true }); populate(1 + Math.floor(Math.random() * 999998)); ui.selected = null; recomputePolitics(); refreshPanels(); requestDraw(); markDirty(); toast('New realms founded.', { label: 'Undo', fn: undo }); };
  $('#wClear').onclick = () => { pushUndo({ meta: true }); world.places = []; world.labels = []; ui.selected = null; recomputePolitics(); refreshPanels(); requestDraw(); markDirty(); toast('Cleared every place and label.', { label: 'Undo', fn: undo }); };
  for (const k of ['realms', 'rivers', 'labels', 'names', 'grid']) $('#ly' + k[0].toUpperCase() + k.slice(1)).onchange = e => { ui.layers[k] = e.target.checked; requestDraw(); savePrefs(); };
  $('#wSaveFile').onclick = () => saveFile(slug() + '.json', serialize(), 'World file saved.');
  $('#wSavePng').onclick = savePng;
  $('#wOpenFile').onclick = () => $('#wFile').click();
  $('#wFile').onchange = e => {
    const file = e.target.files && e.target.files[0]; if (!file) return;
    const rd = new FileReader();
    rd.onload = () => {
      let obj; try { obj = JSON.parse(rd.result); } catch (err) { toast('That file is not a Terra Incognita world.'); return; }
      pushUndo({ h: true, m: true, meta: true, world: true });
      try { loadObj(obj); } catch (err) { undo(); redoStack.length = 0; updateUndoButtons(); toast('That file is not a Terra Incognita world.'); return; }
      ui.selected = null; recomputeAll(); fitView(); syncWorldTab(); markDirty(); toast(`Opened ${world.name}.`, { label: 'Undo', fn: undo });
    };
    rd.readAsText(file); e.target.value = '';
  };
}

function openNewMenu() {
  const m = $('#newMenu'), b = $('#btnNew'), r = b.getBoundingClientRect();
  m.hidden = false; const mw = m.offsetWidth;
  m.style.left = clamp(r.right - mw, 12, window.innerWidth - mw - 12) + 'px'; m.style.top = (r.bottom + 6) + 'px';
  b.setAttribute('aria-expanded', 'true'); $('#mnRandom').focus();
}
function closeNewMenu() { $('#newMenu').hidden = true; $('#btnNew').setAttribute('aria-expanded', 'false'); }
function startBlank() {
  newWorld(1 + Math.floor(Math.random() * 999998), 'blank');
  ui.sketch.mode = 'land'; setTool('sketch'); fitView(); syncWorldTab(); markDirty();
  toast('Blank ocean ready. Draw a loop to raise your first coast.', { label: 'Undo', fn: undo });
}

// ------------------------------------------------------------------ toast
let toastTimer = 0;
function toast(msg, action) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(msg)}</span>` + (action ? `<button type="button">${esc(action.label)}</button>` : '');
  if (action) el.querySelector('button').onclick = () => { el.hidden = true; action.fn(); };
  el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, action ? 6000 : 3200);
}

// ------------------------------------------------------------------ keyboard
window.addEventListener('keydown', e => {
  const tag = (e.target && e.target.tagName) || '';
  const typing = /INPUT|TEXTAREA|SELECT/.test(tag) || (e.target && e.target.isContentEditable);
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
  if (mod && e.key.toLowerCase() === 'y' && !typing) { e.preventDefault(); redo(); return; }
  if (typing || mod || e.altKey) return;
  if (e.key === ' ' && (e.target === document.body || e.target === canvas || !e.target)) { if (!spaceDown) { spaceDown = true; updateCursor(); } e.preventDefault(); return; }
  if (e.key === 'Escape') {
    if (!$('#newMenu').hidden) { closeNewMenu(); $('#btnNew').focus(); return; }
    if (sketchDraft) { sketchDraft = null; gesture = null; requestDraw(); return; }
    select(null); return;
  }
  if ((e.key === 'Delete' || e.key === 'Backspace') && ui.selected && ui.selected.type !== 'loc') { e.preventDefault(); removeSel(ui.selected); return; }
  if (e.key === '[' || e.key === ']') { ui.brush.size = clamp(ui.brush.size + (e.key === ']' ? 2 : -2), 2, 40); renderToolOpts(); requestDraw(); savePrefs(); return; }
  if (e.key === 'f' || e.key === 'F') { fitView(); return; }
  if (e.key === '+' || e.key === '=') { zoomAt(view.cw / 2, view.ch / 2, 1.3); return; }
  if (e.key === '-') { zoomAt(view.cw / 2, view.ch / 2, 1 / 1.3); return; }
  const t = TOOLS.find(x => x && x.key === e.key.toLowerCase()); if (t) setTool(t.id);
});
window.addEventListener('keyup', e => { if (e.key === ' ') { spaceDown = false; updateCursor(); } });
window.addEventListener('blur', () => { spaceDown = false; if (stroke) endStroke(); });

// ------------------------------------------------------------------ init
function init() {
  loadPrefs();
  let firstRun = false;
  if (!loadLocal()) { firstRun = true; newWorld(DEFAULT_SEED, 'continent', { noUndo: true }); }
  else recomputeAll();
  buildToolbar(); renderToolOpts(); bindWorldTab(); syncWorldTab(); updateUndoButtons(); updateCursor();
  let renaming = false; // one undo step per visit to the field
  $('#worldName').addEventListener('focus', () => { renaming = false; });
  $('#worldName').addEventListener('input', e => { if (!renaming) { pushUndo({ meta: true }); renaming = true; } world.name = e.target.value; markDirty(); if (!ui.selected) renderInspector(); });
  $('#btnUndo').onclick = undo; $('#btnRedo').onclick = redo;
  $('#btnNew').onclick = () => $('#newMenu').hidden ? openNewMenu() : closeNewMenu();
  $('#mnRandom').onclick = () => { closeNewMenu(); const s = 1 + Math.floor(Math.random() * 999998); newWorld(s, world.shape && world.shape !== 'blank' ? world.shape : 'continent'); syncWorldTab(); markDirty(); toast(`Generated world ${s}.`, { label: 'Undo', fn: undo }); };
  $('#mnBlank').onclick = () => { closeNewMenu(); startBlank(); };
  document.addEventListener('pointerdown', e => { const m = $('#newMenu'), b = $('#btnNew'); if (!m.hidden && !m.contains(e.target) && !b.contains(e.target)) closeNewMenu(); });
  window.addEventListener('resize', closeNewMenu);
  $('#styleTerrain').onclick = () => setStyle('terrain'); $('#styleAtlas').onclick = () => setStyle('atlas');
  $('#zIn').onclick = () => zoomAt(view.cw / 2, view.ch / 2, 1.35); $('#zOut').onclick = () => zoomAt(view.cw / 2, view.ch / 2, 1 / 1.35); $('#zFit').onclick = fitView;
  for (const k of ['inspect', 'codex', 'world']) $('#tab-' + k).onclick = () => showTab(k);
  $('#codexQ').addEventListener('input', renderCodex);
  if (firstRun) saveLocal();
  refreshPlate();
  new ResizeObserver(resize).observe($('#mapwrap'));
  resize();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', refreshPlate);
  new MutationObserver(refreshPlate).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  if (document.fonts) Promise.all([`16px ${F_DISPLAY}`, `italic 16px ${F_DISPLAY}`, `16px ${F_SC}`, `12px ${F_MONO}`].map(f => document.fonts.load(f).catch(() => { }))).then(requestDraw);
}
init();

// Offline copy, on the real site only (not inside a frame such as the Artifact viewer, and not from a file).
let inFrame = true; try { inFrame = window.top !== window.self; } catch (e) { }
if ('serviceWorker' in navigator && !inFrame && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { }));
}

window.terra = {
  newWorld: (seed, shape = 'continent') => { newWorld(seed, shape); syncWorldTab(); fitView(); },
  startBlank, setStyle, setTool, fitView, select, centerOn,
  places: () => world.places.map(p => ({ id: p.id, kind: p.kind, name: p.name, x: p.x, y: p.y })),
  state: () => {
    let land = 0, rivers = 0, lakes = 0;
    for (let i = 0; i < N; i++) { if (world.h[i] >= world.sea) land++; if (D.isR[i]) rivers++; if (D.lake[i]) lakes++; }
    return { name: world.name, seed: world.seed, shape: world.shape, land, rivers, lakes, realms: D.realms.length, places: world.places.length, labels: world.labels.length, undo: undoStack.length };
  },
  toScreen: (x, y) => ({ x: view.ox + x * view.s, y: view.oy + y * view.s }),
  mapImage: (S = 2, allNames = true) => renderMapImage(S, allNames).toDataURL('image/png'),
  riverNear: (x, y, r = 1.5) => {
    for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
      if (dx * dx + dy * dy > r * r) continue; const i = cellAt(x + dx, y + dy); if (D.isR[i]) return true;
    }
    return false;
  },
};
})();
