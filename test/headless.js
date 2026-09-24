// Headless smoke/scenario runner for build/Factio.html under Node (no browser).
// Usage: node test/headless.js [--ticks N] [--scenarios test/scenarios.js] [--seed S] [--html path]
// Contract expected from the game (see design/ARCHITECTURE.md):
//   window.HEADLESS === true  -> modules must not auto-boot the DOM UI / rAF loop
//   window.F  : global namespace; F.newGame({seed}), F.tick() (one 1/60 s step), F.state, F.save() -> string, F.load(string)
const fs = require('fs'), path = require('path'), vm = require('vm');
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i !== -1 ? argv[i + 1] : d; };
const TICKS = parseInt(opt('--ticks', '3600'), 10);
const SEED = parseInt(opt('--seed', '42'), 10);
const htmlPath = opt('--html', path.resolve(__dirname, '../build/Factio.html'));
const html = fs.readFileSync(htmlPath, 'utf8');
const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
if (!scripts.length) { console.error('no <script> blocks found'); process.exit(2); }

// ---- minimal DOM / canvas stubs ----
function makeCtx() {
  const state = { fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, font: '10px sans-serif', globalAlpha: 1, imageSmoothingEnabled: false, textAlign: 'left', textBaseline: 'alphabetic', lineCap: 'butt', lineJoin: 'miter', shadowBlur: 0, shadowColor: '', globalCompositeOperation: 'source-over', filter: 'none', lineDashOffset: 0 };
  return new Proxy(state, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'measureText') return (s) => ({ width: String(s).length * 6, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 });
      if (k === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h) * 4), width: w, height: h });
      if (k === 'createImageData') return (w, h) => ({ data: new Uint8ClampedArray(Math.max(1, (typeof w === 'object' ? w.width * w.height : w * h)) * 4), width: w, height: h });
      if (k === 'createPattern') return () => ({});
      if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createConicGradient') return () => ({ addColorStop() {} });
      if (k === 'getTransform') return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
      if (k === 'isPointInPath' || k === 'isPointInStroke') return () => false;
      if (k === 'getLineDash') return () => [];
      if (k === 'canvas') return t.__canvas;
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}
const registry = new Map();
function makeEl(tag) {
  const el = {
    tagName: String(tag).toUpperCase(), nodeType: 1, style: {}, children: [], childNodes: [], parentNode: null, id: '', className: '',
    classList: { _s: new Set(), add(...c) { c.forEach(x => this._s.add(x)); }, remove(...c) { c.forEach(x => this._s.delete(x)); }, toggle(c, f) { if (f === undefined) f = !this._s.has(c); if (f) this._s.add(c); else this._s.delete(c); return f; }, contains(c) { return this._s.has(c); } },
    dataset: {}, attributes: {}, width: 1280, height: 720, clientWidth: 1280, clientHeight: 720, offsetWidth: 1280, offsetHeight: 720, offsetLeft: 0, offsetTop: 0, scrollTop: 0, scrollLeft: 0, scrollHeight: 0, scrollWidth: 0, innerHTML: '', innerText: '', textContent: '', value: '', checked: false, disabled: false, hidden: false, title: '', selectionStart: 0, selectionEnd: 0, tabIndex: 0,
    appendChild(c) { this.children.push(c); this.childNodes.push(c); c.parentNode = this; return c; },
    append(...cs) { cs.forEach(c => { if (typeof c === 'object') this.appendChild(c); }); },
    prepend(...cs) { cs.forEach(c => { if (typeof c === 'object') this.appendChild(c); }); },
    removeChild(c) { this.children = this.children.filter(x => x !== c); this.childNodes = this.children.slice(); return c; },
    replaceChildren(...cs) { this.children = []; this.childNodes = []; cs.forEach(c => { if (typeof c === 'object') this.appendChild(c); }); },
    replaceWith() {}, insertBefore(c) { return this.appendChild(c); }, insertAdjacentHTML() {}, insertAdjacentElement(p, c) { return this.appendChild(c); },
    remove() { if (this.parentNode) this.parentNode.removeChild(this); },
    setAttribute(k, v) { this.attributes[k] = String(v); if (k === 'id') this.id = String(v); },
    getAttribute(k) { return k in this.attributes ? this.attributes[k] : null; }, hasAttribute(k) { return k in this.attributes; }, removeAttribute(k) { delete this.attributes[k]; },
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
    querySelector() { return makeEl('div'); }, querySelectorAll() { return []; }, closest() { return null; }, contains() { return false; }, matches() { return false; },
    getBoundingClientRect() { return { left: 0, top: 0, width: this.width, height: this.height, right: this.width, bottom: this.height, x: 0, y: 0 }; },
    focus() {}, blur() {}, click() {}, select() {}, scrollIntoView() {}, requestPointerLock() {}, requestFullscreen() { return Promise.resolve(); }, setPointerCapture() {}, releasePointerCapture() {},
    getContext() { if (!this._ctx) { this._ctx = makeCtx(); this._ctx.__canvas = this; } return this._ctx; }, toDataURL() { return 'data:,'; }, toBlob(cb) { if (cb) cb(null); },
    get firstChild() { return this.children[0] || null; }, get lastChild() { return this.children[this.children.length - 1] || null; }, get firstElementChild() { return this.children[0] || null; },
  };
  return el;
}
function byId(id) { if (!registry.has(id)) { const e = makeEl('div'); e.id = id; registry.set(id, e); } return registry.get(id); }
const storage = (() => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), clear: () => m.clear(), key: i => [...m.keys()][i] ?? null, get length() { return m.size; } }; })();
class EvtStub { constructor(type, init) { this.type = type; Object.assign(this, init || {}); } preventDefault() {} stopPropagation() {} stopImmediatePropagation() {} }
const rafQueue = [];
const window = {
  HEADLESS: true, innerWidth: 1280, innerHeight: 720, outerWidth: 1280, outerHeight: 720, devicePixelRatio: 1, scrollX: 0, scrollY: 0,
  addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
  requestAnimationFrame(cb) { rafQueue.push(cb); return rafQueue.length; }, cancelAnimationFrame() {},
  setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask, structuredClone,
  performance: { now: () => Number(process.hrtime.bigint() / 1000000n) },
  localStorage: storage, sessionStorage: storage, console, Math, JSON, Date, Object, Array, Number, String, Boolean, Symbol, Map, Set, WeakMap, WeakSet, Promise, Error, TypeError, RangeError, SyntaxError, Reflect, Proxy, Function,
  Uint8Array, Uint16Array, Uint32Array, Int8Array, Int16Array, Int32Array, Float32Array, Float64Array, Uint8ClampedArray, ArrayBuffer, DataView, TextEncoder, TextDecoder, RegExp, BigInt,
  parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent, encodeURI, decodeURI, escape, unescape,
  btoa: s => Buffer.from(String(s), 'binary').toString('base64'), atob: s => Buffer.from(String(s), 'base64').toString('binary'),
  navigator: { userAgent: 'headless', language: 'sl', languages: ['sl'], platform: 'Win32', clipboard: { writeText: () => Promise.resolve(), readText: () => Promise.resolve('') } },
  location: { href: 'file:///Factio.html', search: '', hash: '', protocol: 'file:', reload() {} }, history: { pushState() {}, replaceState() {} },
  screen: { width: 1280, height: 720 }, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {} }),
  getComputedStyle: () => ({ getPropertyValue: () => '' }),
  alert() {}, confirm() { return true; }, prompt() { return null; }, open() { return null; }, focus() {}, blur() {}, scrollTo() {},
  Image: class { constructor() { this.onload = null; this.width = 1; this.height = 1; } set src(v) { this._src = v; } get src() { return this._src; } },
  OffscreenCanvas: class { constructor(w, h) { const e = makeEl('canvas'); e.width = w; e.height = h; return e; } },
  Path2D: class { constructor() {} moveTo() {} lineTo() {} arc() {} arcTo() {} rect() {} roundRect() {} closePath() {} addPath() {} bezierCurveTo() {} quadraticCurveTo() {} ellipse() {} },
  Event: EvtStub, CustomEvent: EvtStub, KeyboardEvent: EvtStub, MouseEvent: EvtStub, WheelEvent: EvtStub, PointerEvent: EvtStub, TouchEvent: EvtStub, UIEvent: EvtStub,
  ResizeObserver: class { observe() {} unobserve() {} disconnect() {} }, MutationObserver: class { observe() {} disconnect() {} }, IntersectionObserver: class { observe() {} unobserve() {} disconnect() {} },
  AudioContext: undefined, webkitAudioContext: undefined, Audio: class { play() { return Promise.resolve(); } pause() {} },
  Blob: class { constructor(parts) { this.parts = parts; this.size = 0; } }, URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} }, FileReader: class { readAsText() {} },
  crypto: { getRandomValues(a) { for (let i = 0; i < a.length; i++) a[i] = (Math.random() * 256) | 0; return a; }, randomUUID: () => 'uuid' },
  fetch: () => Promise.reject(new Error('no network in headless')),
  HTMLElement: function () {}, HTMLCanvasElement: function () {}, Element: function () {}, Node: function () {},
};
window.window = window; window.self = window; window.globalThis = window; window.top = window; window.parent = window;
window.document = {
  body: makeEl('body'), head: makeEl('head'), documentElement: makeEl('html'), readyState: 'complete', hidden: false, visibilityState: 'visible', activeElement: null, title: '', pointerLockElement: null, fullscreenElement: null,
  createElement: makeEl, createElementNS: (ns, t) => makeEl(t), createTextNode: t => ({ textContent: String(t), nodeType: 3 }), createDocumentFragment: () => makeEl('fragment'),
  getElementById: byId, querySelector: sel => (sel && sel.startsWith('#') && !/[\s>.\[]/.test(sel) ? byId(sel.slice(1)) : makeEl('div')), querySelectorAll: () => [],
  addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; }, exitPointerLock() {}, exitFullscreen() { return Promise.resolve(); }, hasFocus() { return true; },
  fonts: { ready: Promise.resolve(), load: () => Promise.resolve() }, execCommand() { return true; },
};
byId('game').tagName = 'CANVAS'; byId('game').width = 1280; byId('game').height = 720;

vm.createContext(window);
const t0 = Date.now();
try {
  // Inside a vm context every free-variable lookup (F, Math, ...) goes through the contextified
  // global's interceptors, which made the game ~15x slower here than in a browser. Running the
  // page's scripts as one function whose parameters shadow the hottest globals (same values the
  // lookups resolved to before) makes those plain local reads; `var F` becomes a local as well
  // and stays reachable as window.F, which 00-core.js assigns explicitly.
  const HOT = ['window', 'document', 'Math', 'JSON', 'Object', 'Array', 'Number', 'String', 'Map', 'Set', 'performance'];
  const code = '(function (' + HOT.join(', ') + ') {' + scripts.join('\n;\n') + '\n}).call(this, ' + HOT.join(', ') + ');';
  vm.runInContext(code, window, { filename: 'Factio.html#script0', timeout: 60000 });
} catch (e) { console.error('LOAD ERROR:', (e && e.stack) || e); process.exit(3); }
const F = window.F;
if (!F) { console.error('window.F namespace missing'); process.exit(4); }
for (const fn of ['newGame', 'tick']) if (typeof F[fn] !== 'function') { console.error('F.' + fn + ' is not a function'); process.exit(5); }

const report = { loadMs: Date.now() - t0, ticks: 0, errors: [], scenarios: [] };
try {
  F.newGame({ seed: SEED });
  const t1 = Date.now();
  for (let i = 0; i < TICKS; i++) { F.tick(); report.ticks++; }
  report.tickMs = Date.now() - t1;
  report.msPerTick = +(report.tickMs / Math.max(1, TICKS)).toFixed(4);
  if (typeof F.save === 'function' && typeof F.load === 'function') {
    const s = F.save(); report.saveBytes = typeof s === 'string' ? s.length : JSON.stringify(s).length;
    F.load(s); for (let i = 0; i < 120; i++) F.tick(); report.reloadOk = true;
  }
} catch (e) { report.errors.push('RUN ERROR: ' + ((e && e.stack) || e)); }

// --scenarios <file> runs one file; default = test/scenarios.js + every test/scenarios-*.js (feature packs).
// --only <substring> keeps just the scenarios whose name contains it.
const scenFiles = opt('--scenarios', null) ? [path.resolve(process.cwd(), opt('--scenarios'))]
  : [path.resolve(__dirname, 'scenarios.js')].concat(fs.readdirSync(__dirname).filter(f => /^scenarios-.*.js$/.test(f)).sort().map(f => path.join(__dirname, f)));
const onlyPat = opt('--only', null);
const scenarios = {};
for (const sp of scenFiles) if (fs.existsSync(sp)) Object.assign(scenarios, require(sp)); // module.exports = { name: (F, assert, window) => void | string, ... }
if (onlyPat) for (const k of Object.keys(scenarios)) if (!k.includes(onlyPat)) delete scenarios[k];
{
  const assert = (cond, msg) => { if (!cond) throw new Error('ASSERT: ' + msg); };
  for (const [name, fn] of Object.entries(scenarios)) {
    const r = { name, ok: true };
    try { const out = fn(F, assert, window); if (out) r.note = String(out); } catch (e) { r.ok = false; r.error = String((e && e.stack) || e).split('\n').slice(0, 6).join('\n'); }
    report.scenarios.push(r);
  }
}
const failed = report.errors.length + report.scenarios.filter(s => !s.ok).length;
const ascii = t => String(t).replace(/[^\x20-\x7e\n]/g, '?');
if (argv.includes('--summary')) {
  console.log(ascii('smoke: ticks=' + report.ticks + ' msPerTick=' + report.msPerTick + ' saveBytes=' + report.saveBytes + ' reloadOk=' + report.reloadOk + ' errors=' + JSON.stringify(report.errors)));
  for (const s of report.scenarios) console.log(ascii((s.ok ? 'PASS ' : 'FAIL ') + s.name + (s.note ? ' -- ' + s.note : '') + (s.ok ? '' : '\n     ' + String(s.error).split('\n').slice(0, 2).join(' | ').slice(0, 400))));
} else console.log(JSON.stringify(report, null, 2));
console.log(failed ? 'FAILED (' + failed + ')' : 'OK');
process.exit(failed ? 1 : 0);
