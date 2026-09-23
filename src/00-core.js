// 00-core.js — global namespace, constants, seeded RNG, helpers, event bus.
// See design/ARCHITECTURE.md §2. This is the only file that declares a global (F).
var F = window.F = {};

(function () {
  'use strict';

  F.C = {
    TILE: 32,
    CHUNK: 32,
    TPS: 60,
    BELT_LEN: 256,
    BELT_SPACING: 64,
    BELT_CURVE_INNER: 106,
    BELT_CURVE_OUTER: 295,
    DIRS: [[0, -1], [1, 0], [0, 1], [-1, 0]],
    REACH: 10,
    // v1: F.state.world.chunks was an object map of full per-chunk typed
    // arrays (terrain/res/amount/feature/featHp), which made saves grow by
    // ~9 KB per generated chunk. v2: F.save()/F.load() exchange chunks as a
    // compact delta list (F.world.exportChunks/importChunks in 10-world.js)
    // — chunks are deterministically regenerated from the seed on demand and
    // only per-tile overrides (mined amount, removed features), pollution
    // and spawnerCount are persisted. v1 saves still load (see F.load).
    SAVE_VERSION: 2,
    DAY_TICKS: 25200,
  };

  F.state = null;          // set by F.newGame / F.load (80-game.js)
  F.behaviours = {};       // behaviour registry (20-entities.js documents the shape)

  // Feature flags. combat: false ships this build with all biters/turrets/
  // walls/weapons/ammo removed from data and every combat code path guarded
  // off — see src/disabled/README.md for how to re-enable it.
  F.FEATURES = { combat: false };

  // ---------- hashing ----------
  function hash2(x, y, seed) {
    let h = (seed | 0) ^ 0x9e3779b9;
    h = Math.imul(h ^ (x | 0), 0x85ebca6b); h ^= h >>> 13;
    h = Math.imul(h ^ (y | 0), 0xc2b2ae35); h ^= h >>> 16;
    h = Math.imul(h ^ (h >>> 15), 0x27d4eb2f); h ^= h >>> 13;
    return h >>> 0;
  }
  function hashStr(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- global simulation RNG (state lives in F.state.rng.s) ----------
  function step() {
    const r = F.state.rng;
    r.s = (r.s + 0x6D2B79F5) >>> 0;
    let t = r.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  F.rng = {
    seed(n) { if (!F.state) F.state = {}; F.state.rng = { s: (n >>> 0) || 1 }; },
    next() { return step(); },
    int(n) { return Math.floor(step() * n); },
    range(a, b) { return a + step() * (b - a); },
    chance(p) { return step() < p; },
    pick(arr) { return arr[Math.floor(step() * arr.length)]; },
    local(a, b, c) { return mulberry32(hash2(a | 0, b | 0, c | 0)); },
    mulberry32,
  };

  // ---------- utilities ----------
  F.util = {
    key(tx, ty) { return tx + ',' + ty; },
    unkey(k) { const i = k.indexOf(','); return [parseInt(k.slice(0, i), 10), parseInt(k.slice(i + 1), 10)]; },
    clamp(v, a, b) { return v < a ? a : v > b ? b : v; },
    lerp(a, b, t) { return a + (b - a) * t; },
    dist(x1, y1, x2, y2) { const dx = x2 - x1, dy = y2 - y1; return Math.sqrt(dx * dx + dy * dy); },
    dirVec(d) { return F.C.DIRS[d & 3]; },
    rotDir(d, n) { return (d + n + 4) & 3; },
    oppDir(d) { return (d + 2) & 3; },
    floorDiv(a, b) { return Math.floor(a / b); },
    now() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); },
    hash2,
    hashStr,
    // rotate an offset [dx,dy] given for dir 0 (north) into direction d (clockwise 90° steps)
    rotVec(v, d) {
      let x = v[0], y = v[1];
      for (let i = 0; i < (d & 3); i++) { const t = x; x = -y; y = t; }
      return [x, y];
    },
    fmt(n, digits) { return Number(n).toFixed(digits == null ? 1 : digits).replace(/\.0+$/, ''); },
    fmtPower(kW) { return kW >= 1000 ? F.util.fmt(kW / 1000, 2) + ' MW' : F.util.fmt(kW, 1) + ' kW'; },
    fmtTime(seconds) { const s = Math.max(0, Math.round(seconds)); const m = Math.floor(s / 60), h = Math.floor(m / 60); return h ? h + ':' + String(m % 60).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0') : m + ':' + String(s % 60).padStart(2, '0'); },
    escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
  };

  // ---------- event bus ----------
  const listeners = Object.create(null);
  F.events = {
    on(name, fn) { (listeners[name] || (listeners[name] = [])).push(fn); return fn; },
    off(name, fn) { const l = listeners[name]; if (!l) return; const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); },
    emit(name, payload) {
      const l = listeners[name]; if (!l) return;
      for (let i = 0; i < l.length; i++) { try { l[i](payload); } catch (err) { F.log.error('event ' + name, err); } }
    },
  };

  // ---------- logging ----------
  const quiet = () => !!(window.HEADLESS && !window.VERBOSE);
  F.log = {
    info() { if (!quiet()) console.log.apply(console, arguments); },
    warn() { if (!quiet()) console.warn.apply(console, arguments); },
    error() { console.error.apply(console, arguments); },
  };
})();
