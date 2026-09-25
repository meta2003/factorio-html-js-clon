// 55-blueprint-library.js — blueprint library and blueprint strings.
//
// Library: named blueprints kept across games (like Factorio's personal library) in the
// browser's localStorage under 'factio.blueprints' — or only in memory when there is no
// storage (headless tests, private mode). Not part of the save file.
//
// Blueprint strings: "FB1" + base64(UTF-8 JSON { n: name, e: [[type, x, y, dir, settings?]] }).
// Decoding validates everything, since strings come from other players: unknown entity
// types are skipped, settings are reduced to known keys with sane values, and sizes/counts
// are capped. Positions are re-normalised (F.blueprints.rotate(bp, 0)).
//
// Extends F.blueprints (52-blueprints.js):
//   encode(bp, name?) -> string
//   decode(str) -> { name, bp, skipped } | null   (null: F.blueprints.lastError says why:
//                                                  'format' | 'empty' | 'too_big')
//   sanitizeSettings(settings) -> settings | null
//   library.list() -> [{ id, name, bp, created }]   (newest first; do not mutate)
//   library.add(name, bp) -> entry     library.get(id)     library.remove(id) -> bool
//   library.rename(id, name) -> bool   library.clear()
//
// UI: window 'blueprints' (L key or the HUD "Blueprints" button): save the blueprint in
// hand / the last copy, import a string, and per entry use (take it into the hand),
// export (string, also copied to the system clipboard when allowed), rename, delete.
(function () {
  'use strict';

  F.i18n.add('en', {
    'ui.blueprints': 'Blueprints',
    'bpl.title': 'Blueprint library',
    'bpl.current': 'Blueprint in hand / last copy',
    'bpl.none': 'Nothing copied yet — press Ctrl+C (or B) and drag over buildings.',
    'bpl.save': 'Save to library',
    'bpl.default_name': 'Blueprint {n}',
    'bpl.import': 'Import a blueprint string',
    'bpl.import_btn': 'Import',
    'bpl.import_ph': 'Paste a string starting with FB1…',
    'bpl.imported': 'Imported "{name}"',
    'bpl.skipped': '{n} unknown buildings were left out',
    'bpl.err.format': 'Not a valid blueprint string',
    'bpl.err.empty': 'The string holds no buildings this game knows',
    'bpl.err.too_big': 'Blueprint is too big',
    'bpl.library': 'Library',
    'bpl.empty': 'The library is empty.',
    'bpl.size': '{w}×{h}, {n} buildings',
    'bpl.use': 'Use',
    'bpl.export': 'Export',
    'bpl.delete': 'Delete',
    'bpl.delete_q': 'Delete blueprint "{name}"?',
    'bpl.copied': 'Blueprint string copied',
    'bpl.string': 'Blueprint string (select and copy):',
    'bpl.saved': 'Saved "{name}" to the library',
  });

  var PREFIX = 'FB1';
  var MAX_ENTITIES = 20000;
  var MAX_COORD = 2000;
  var STORAGE_KEY = 'factio.blueprints';

  // =====================================================================
  // base64 + UTF-8 (own implementation: works headless and in any browser)
  // =====================================================================
  var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  var B64_INDEX = (function () { var m = Object.create(null); for (var i = 0; i < 64; i++) m[B64.charAt(i)] = i; return m; })();

  function utf8Bytes(str) {
    var bin = encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function (m, h) { return String.fromCharCode(parseInt(h, 16)); });
    var out = new Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function utf8String(bytes) {
    var parts = [];
    for (var i = 0; i < bytes.length; i++) parts.push('%' + (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16));
    return decodeURIComponent(parts.join(''));
  }

  function b64encode(bytes) {
    var out = '';
    for (var i = 0; i < bytes.length; i += 3) {
      var a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
      var n = (a << 16) | ((b || 0) << 8) | (c || 0);
      out += B64.charAt((n >> 18) & 63) + B64.charAt((n >> 12) & 63) +
        (b === undefined ? '=' : B64.charAt((n >> 6) & 63)) + (c === undefined ? '=' : B64.charAt(n & 63));
    }
    return out;
  }

  function b64decode(str) {
    str = str.replace(/[\s=]+/g, '');
    if (!/^[A-Za-z0-9+/]*$/.test(str) || str.length % 4 === 1) return null;
    var bytes = [];
    for (var i = 0; i < str.length; i += 4) {
      var n = 0, k = 0;
      for (; k < 4 && i + k < str.length; k++) n |= B64_INDEX[str.charAt(i + k)] << (18 - 6 * k);
      bytes.push((n >> 16) & 255);
      if (k > 2) bytes.push((n >> 8) & 255);
      if (k > 3) bytes.push(n & 255);
    }
    return bytes;
  }

  // =====================================================================
  // Settings validation (strings are untrusted)
  // =====================================================================
  function itemOk(id) { return typeof id === 'string' && !!F.data.items[id]; }
  function int(v, lo, hi) { return typeof v === 'number' && isFinite(v) && Math.floor(v) === v && v >= lo && v <= hi; }

  function sanitizeSettings(s) {
    if (!s || typeof s !== 'object' || Array.isArray(s)) return null;
    var out = {};
    if (typeof s.recipe === 'string' && F.data.recipes[s.recipe]) out.recipe = s.recipe;
    if (Array.isArray(s.filter) && s.filter.length <= 5) {
      var f = s.filter.map(function (v) { return itemOk(v) ? v : null; });
      if (f.some(function (v) { return v; })) { while (f.length < 5) f.push(null); out.filter = f; }
    } else if (itemOk(s.filter)) {
      out.filter = s.filter; // splitter filter
    }
    if (out.filter && (s.filterMode === 'whitelist' || s.filterMode === 'blacklist')) out.filterMode = s.filterMode;
    if (int(s.inPrio, -1, 1) && s.inPrio) out.inPrio = s.inPrio;
    if (int(s.outPrio, -1, 1) && s.outPrio) out.outPrio = s.outPrio;
    if (Array.isArray(s.requests) && s.requests.length <= 6) {
      var r = s.requests.map(function (q) {
        return (q && itemOk(q.id) && int(q.count, 1, 1000000)) ? { id: q.id, count: q.count } : null;
      });
      if (r.some(function (q) { return q; })) { while (r.length < 6) r.push(null); out.requests = r; }
    }
    if (s.autoLaunch === true) out.autoLaunch = true;
    if (typeof s.name === 'string' && s.name) out.name = s.name.slice(0, 40);
    if (s.io === 'in' || s.io === 'out') out.io = s.io;
    return Object.keys(out).length ? out : null;
  }

  // =====================================================================
  // Encode / decode
  // =====================================================================
  function encode(bp, name) {
    var e = bp.entities.map(function (en) {
      var row = [en.type, en.x, en.y, en.dir & 3];
      if (en.settings) row.push(en.settings);
      return row;
    });
    var json = JSON.stringify({ n: String(name || ''), e: e });
    return PREFIX + b64encode(utf8Bytes(json));
  }

  function fail(why) { F.blueprints.lastError = why; return null; }

  function decode(str) {
    F.blueprints.lastError = null;
    if (typeof str !== 'string') return fail('format');
    str = str.trim();
    if (str.slice(0, PREFIX.length) !== PREFIX) return fail('format');
    var bytes = b64decode(str.slice(PREFIX.length));
    if (!bytes) return fail('format');
    var obj;
    try { obj = JSON.parse(utf8String(bytes)); } catch (err) { return fail('format'); }
    if (!obj || typeof obj !== 'object' || !Array.isArray(obj.e)) return fail('format');
    if (obj.e.length > MAX_ENTITIES) return fail('too_big');
    var list = [], skipped = 0;
    for (var i = 0; i < obj.e.length; i++) {
      var row = obj.e[i];
      if (!Array.isArray(row) || typeof row[0] !== 'string' || !int(row[1], -MAX_COORD, MAX_COORD) ||
          !int(row[2], -MAX_COORD, MAX_COORD) || !int(row[3], 0, 3)) return fail('format');
      if (!placeable(row[0])) { skipped++; continue; }
      list.push({ type: row[0], x: row[1], y: row[2], dir: row[3], settings: sanitizeSettings(row[4]) });
    }
    if (!list.length) return fail('empty');
    var bp = F.blueprints.rotate({ entities: list }, 0); // normalise position + order
    if (bp.w > MAX_COORD || bp.h > MAX_COORD) return fail('too_big');
    var name = typeof obj.n === 'string' ? obj.n.slice(0, 60) : '';
    return { name: name, bp: bp, skipped: skipped };
  }

  function placeable(type) {
    var def = F.data.entities[type];
    if (!def || def.natural || !def.minable) return false;
    var item = F.data.items[def.minable];
    return !!(item && item.place === type);
  }

  // =====================================================================
  // Library (localStorage, or memory)
  // =====================================================================
  var entries = null; // loaded lazily (never at load time: headless contract)
  var nextId = 1;

  function storage() {
    try {
      if (typeof window === 'undefined' || window.HEADLESS || !window.localStorage) return null;
      return window.localStorage;
    } catch (err) { return null; }
  }

  function load() {
    if (entries) return entries;
    entries = [];
    var st = storage();
    if (!st) return entries;
    var raw = null;
    try { raw = st.getItem(STORAGE_KEY); } catch (err) { raw = null; }
    if (!raw) return entries;
    var data;
    try { data = JSON.parse(raw); } catch (err) { F.log.warn('[blueprints] library unreadable, starting empty'); return entries; }
    var list = (data && Array.isArray(data.entries)) ? data.entries : [];
    for (var i = 0; i < list.length; i++) {
      var en = list[i];
      if (!en || typeof en.s !== 'string') continue;
      // Stored as strings: the same validation as imports (types may have changed since).
      var d = decode(en.s);
      if (!d) continue;
      var id = int(en.id, 1, 1e9) ? en.id : nextId;
      entries.push({ id: id, name: typeof en.name === 'string' ? en.name : d.name, bp: d.bp, created: en.created || 0 });
      if (id >= nextId) nextId = id + 1;
    }
    return entries;
  }

  function persist() {
    var st = storage();
    if (!st) return;
    var data = { v: 1, entries: entries.map(function (en) { return { id: en.id, name: en.name, created: en.created, s: encode(en.bp, en.name) }; }) };
    try { st.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (err) { F.log.warn('[blueprints] could not store the library', err); }
  }

  function cleanName(name, fallbackN) {
    name = (typeof name === 'string' ? name : '').trim().slice(0, 60);
    return name || F.t('bpl.default_name', { n: fallbackN });
  }

  var library = {
    list: function () { return load(); },
    get: function (id) {
      var l = load();
      for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i];
      return null;
    },
    add: function (name, bp) {
      if (!bp || !Array.isArray(bp.entities) || !bp.entities.length) return null;
      var l = load();
      var en = { id: nextId++, name: cleanName(name, l.length + 1), bp: JSON.parse(JSON.stringify(bp)), created: Date.now() };
      l.unshift(en);
      persist();
      return en;
    },
    remove: function (id) {
      var l = load();
      for (var i = 0; i < l.length; i++) if (l[i].id === id) { l.splice(i, 1); persist(); return true; }
      return false;
    },
    rename: function (id, name) {
      var en = library.get(id);
      if (!en) return false;
      en.name = cleanName(name, id);
      persist();
      return true;
    },
    clear: function () { entries = []; persist(); },
  };

  F.blueprints = F.blueprints || {};
  F.blueprints.encode = encode;
  F.blueprints.decode = decode;
  F.blueprints.sanitizeSettings = sanitizeSettings;
  F.blueprints.library = library;
  F.blueprints.lastError = null;

  // =====================================================================
  // UI (browser only). The window is registered from an onRebuild hook, which only runs
  // after every file (70-ui.js included) has loaded — same approach as 45-rocket.js.
  // =====================================================================
  function el(tag, css, text) {
    var e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (text != null) e.textContent = text;
    return e;
  }

  function button(text, onClick, css) {
    var b = el('button', css || '', text);
    b.className = 'f-btn';
    b.addEventListener('click', function (ev) { ev.preventDefault(); onClick(); });
    return b;
  }

  function toast(msg) { if (F.ui && F.ui.toast) F.ui.toast(msg); }

  // Small top-down sketch: each building as a rectangle in its item colour.
  function preview(bp, px) {
    var c = document.createElement('canvas');
    c.width = px; c.height = px;
    c.style.cssText = 'background:#1b1b1b;border:1px solid #0f0f0f;flex:0 0 auto;';
    var ctx = c.getContext && c.getContext('2d');
    if (!ctx) return c;
    var s = Math.min((px - 4) / bp.w, (px - 4) / bp.h);
    var ox = (px - bp.w * s) / 2, oy = (px - bp.h * s) / 2;
    for (var i = 0; i < bp.entities.length; i++) {
      var en = bp.entities[i];
      var def = F.data.entities[en.type];
      var fp = F.entities.footprint(def, en.dir);
      var item = F.data.items[def.minable];
      ctx.fillStyle = (item && item.icon && item.icon.color) || '#8a8f94';
      var inset = s >= 4 ? 0.5 : 0;
      ctx.fillRect(ox + en.x * s + inset, oy + en.y * s + inset, fp[0] * s - inset * 2, fp[1] * s - inset * 2);
    }
    return c;
  }

  function sizeText(bp) { return F.t('bpl.size', { w: bp.w, h: bp.h, n: bp.entities.length }); }

  function section(body, title) {
    var h = el('div', 'color:#ffe6c0;font-weight:600;margin:10px 0 4px;', title);
    body.appendChild(h);
  }

  function currentBlueprint() {
    if (F.input && F.input.blueprint && F.input.blueprint.bp) return F.input.blueprint.bp;
    return F.blueprints.clipboard ? F.blueprints.clipboard() : null;
  }

  var exportBox = null; // textarea showing the last exported string

  function render(body) {
    while (body.firstChild) body.removeChild(body.firstChild);
    body.style.cssText = 'min-width:420px;max-width:480px;max-height:70vh;overflow:auto;padding:2px 4px;';

    // --- current blueprint ---
    section(body, F.t('bpl.current'));
    var cur = currentBlueprint();
    if (!cur) {
      body.appendChild(el('div', 'color:#aaa;', F.t('bpl.none')));
    } else {
      var row = el('div', 'display:flex;gap:8px;align-items:center;');
      row.appendChild(preview(cur, 56));
      var col = el('div', 'display:flex;flex-direction:column;gap:4px;flex:1;');
      col.appendChild(el('div', 'color:#aaa;', sizeText(cur)));
      var nameIn = el('input', 'width:100%;box-sizing:border-box;');
      nameIn.type = 'text';
      nameIn.className = 'f-input';
      nameIn.value = F.t('bpl.default_name', { n: library.list().length + 1 });
      col.appendChild(nameIn);
      col.appendChild(button(F.t('bpl.save'), function () {
        var en = library.add(nameIn.value, cur);
        if (en) toast(F.t('bpl.saved', { name: en.name }));
        render(body);
      }));
      row.appendChild(col);
      body.appendChild(row);
    }

    // --- import ---
    section(body, F.t('bpl.import'));
    var ta = el('textarea', 'min-height:46px;height:46px;box-sizing:border-box;');
    ta.className = 'f-textarea';
    ta.placeholder = F.t('bpl.import_ph');
    body.appendChild(ta);
    var msg = el('div', 'color:#ff8e8e;min-height:14px;');
    var imp = button(F.t('bpl.import_btn'), function () {
      var d = decode(ta.value);
      if (!d) { msg.textContent = F.t('bpl.err.' + (F.blueprints.lastError || 'format')); return; }
      var en = library.add(d.name, d.bp);
      toast(F.t('bpl.imported', { name: en.name }) + (d.skipped ? ' — ' + F.t('bpl.skipped', { n: d.skipped }) : ''));
      render(body);
    });
    body.appendChild(imp);
    body.appendChild(msg);

    // --- library ---
    section(body, F.t('bpl.library'));
    exportBox = el('textarea', 'display:none;min-height:46px;height:46px;box-sizing:border-box;margin-bottom:6px;');
    exportBox.className = 'f-textarea';
    exportBox.readOnly = true;
    var list = library.list();
    if (!list.length) body.appendChild(el('div', 'color:#aaa;', F.t('bpl.empty')));
    body.appendChild(exportBox);
    list.forEach(function (en) { body.appendChild(entryRow(body, en)); });
  }

  function entryRow(body, en) {
    var row = el('div', 'display:flex;gap:8px;align-items:center;padding:4px 0;border-top:1px solid #333;');
    row.appendChild(preview(en.bp, 48));
    var col = el('div', 'display:flex;flex-direction:column;gap:3px;flex:1;min-width:0;');
    var nameIn = el('input', 'width:100%;box-sizing:border-box;');
    nameIn.type = 'text';
    nameIn.className = 'f-input';
    nameIn.value = en.name;
    nameIn.addEventListener('change', function () { library.rename(en.id, nameIn.value); nameIn.value = en.name; });
    col.appendChild(nameIn);
    col.appendChild(el('div', 'color:#aaa;font-size:11px;', sizeText(en.bp)));
    var btns = el('div', 'display:flex;gap:4px;');
    btns.appendChild(button(F.t('bpl.use'), function () {
      if (F.input && F.input.holdBlueprint) F.input.holdBlueprint(en.bp);
      if (F.ui && F.ui.close) F.ui.close('blueprints');
    }));
    btns.appendChild(button(F.t('bpl.export'), function () {
      var s = encode(en.bp, en.name);
      exportBox.style.display = 'block';
      exportBox.value = s;
      exportBox.focus();
      exportBox.select();
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(s).then(function () { toast(F.t('bpl.copied')); }, function () { /* selection is enough */ });
        }
      } catch (err) { /* no clipboard access: the selected text can be copied by hand */ }
    }));
    var del = btns.appendChild(button(F.t('bpl.delete'), function () {
      var go = function (ok) { if (ok) { library.remove(en.id); render(body); } };
      var q = F.t('bpl.delete_q', { name: en.name });
      if (F.ui && F.ui.confirm) F.ui.confirm(q).then(go); else go(true);
    }));
    del.style.cssText = 'background:#5a2323;border-color:#2a0f0f;color:#ffd9d9;';
    col.appendChild(btns);
    row.appendChild(col);
    return row;
  }

  function createWindow() {
    if (typeof window !== 'undefined' && window.HEADLESS) return null;
    var body = el('div');
    render(body);
    return F.ui.windowFrame(F.t('bpl.title'), body);
  }

  var registered = false;
  F.game = F.game || {};
  (F.game._onRebuild = F.game._onRebuild || []).push(function () {
    if (registered || !F.ui || typeof F.ui.registerWindow !== 'function') return;
    F.ui.registerWindow('blueprints', { create: createWindow });
    registered = true;
  });

  // L toggles the library window.
  F._inputKeys = F._inputKeys || {};
  (F._inputKeys['l'] = F._inputKeys['l'] || []).push(function () {
    if (!F.ui) return false;
    if (F.ui.isOpen('blueprints')) F.ui.close('blueprints'); else F.ui.open('blueprints', {});
    return true;
  });
})();
