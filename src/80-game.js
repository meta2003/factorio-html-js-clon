// 80-game.js — game orchestration: new-game setup, the tick phase order,
// save/load serialisation, the real-time main loop, autosave/slots and boot.
// See design/ARCHITECTURE.md §18, GDD.md §7.1 (game loop), §7.2 (tick order),
// §9.14 (new game / pause menu) and §10 (save / load).
//
// Defines: F.newGame, F.tick, F.save, F.load, F.boot, F.game.
(function () {
  'use strict';

  // =====================================================================
  // Small internal helpers
  // =====================================================================

  // Run `fn`, logging (not throwing) on failure. Used for one-shot setup
  // code (F.newGame / F.load), as opposed to `runTickPhase` below which is
  // used for the 60x/s hot path and rate-limits its own logging.
  function safe(label, fn) {
    try { fn(); } catch (err) { F.log.error('[80-game] ' + label + ' failed', err); }
  }

  // A cryptographically-uninteresting but reasonably spread 32-bit seed for
  // "new game, no seed given". This runs before F.state exists (it IS the
  // thing that seeds F.rng), so it is necessarily outside F.rng's own
  // domain — this is meta/bootstrap code, not simulation code.
  function randomSeed() {
    try {
      if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
        const a = new Uint32Array(1);
        window.crypto.getRandomValues(a);
        return a[0] >>> 0;
      }
    } catch (err) { /* fall through */ }
    return (Math.random() * 0xffffffff) >>> 0;
  }

  // F.player.init() is documented in ARCHITECTURE.md §14 but the 40-player.js
  // module that provides it may not be present in every build of this
  // workspace yet. When it is missing we still want F.state.player to be a
  // usable, save-round-trippable object (matching the §14 shape) instead of
  // null, so the rest of the simulation and the headless tests have
  // something sane to look at. Real 40-player.js code, once present,
  // overrides this entirely by defining F.player.init.
  function fallbackPlayer() {
    const inv = new Array(80).fill(null);
    try {
      if (F.data && Array.isArray(F.data.startingInventory) && F.inv && typeof F.inv.add === 'function') {
        for (let i = 0; i < F.data.startingInventory.length; i++) {
          const pair = F.data.startingInventory[i];
          F.inv.add(inv, pair[0], pair[1]);
        }
      }
    } catch (err) { F.log.warn('[80-game] fallbackPlayer: could not fill starting inventory', err); }
    const sx = (F.world && F.world.spawn) ? F.world.spawn.x : 0.5;
    const sy = (F.world && F.world.spawn) ? F.world.spawn.y : 0.5;
    return {
      x: sx, y: sy, dir: 0, health: 250, maxHealth: 250,
      inv: inv, craftQueue: [], quickbar: new Array(10).fill(null), cursor: null,
      mining: null, dead: false, respawnIn: 0, weapon: null, shootCd: 0, regenCd: 0,
    };
  }

  // Rebuild every module's runtime (non-F.state) caches. Used after both
  // F.newGame (harmless no-ops on an empty state) and F.load (essential).
  // Order fixed by ARCHITECTURE §18.
  function rebuildAll() {
    safe('F.world.rebuild', function () { if (F.world && typeof F.world.rebuild === 'function') F.world.rebuild(); });
    safe('F.entities.rebuild', function () { if (F.entities && typeof F.entities.rebuild === 'function') F.entities.rebuild(); });
    safe('F.belts.rebuild', function () { if (F.belts && typeof F.belts.rebuild === 'function') F.belts.rebuild(); });
    safe('F.power.rebuild', function () { if (F.power && typeof F.power.rebuild === 'function') F.power.rebuild(); });
    safe('F.fluids.rebuild', function () { if (F.fluids && typeof F.fluids.rebuild === 'function') F.fluids.rebuild(); });
    safe('F.research.wake', function () { if (F.research && typeof F.research.wake === 'function') F.research.wake(); });
    safe('F.player.wake', function () { if (F.player && typeof F.player.wake === 'function') F.player.wake(); });
    runOnRebuildHooks(); // EXPANSION.md §6.1: feature modules' F.game.onRebuild(fn) hooks — runs on both newGame and load
  }

  // ---------------------------------------------------------------------
  // EXPANSION.md §6.1 hook runners. F.game._tickPhases/_onRebuild/_onNewGame
  // are plain arrays that may already exist by the time this file runs (see
  // the "queue pattern" note where F.game is built, below): feature files
  // that load BEFORE this one (37-, 38-, 39-, 45-) push directly onto those
  // arrays because F.game.addTickPhase/onRebuild/onNewGame do not exist yet
  // at their load time. This file adopts whatever is already queued instead
  // of discarding it (see the F.game merge below).
  // ---------------------------------------------------------------------
  function runOnRebuildHooks() {
    const hooks = (F.game && F.game._onRebuild) || [];
    for (let i = 0; i < hooks.length; i++) safe('game.onRebuild hook #' + i, hooks[i]);
  }
  function runOnNewGameHooks() {
    const hooks = (F.game && F.game._onNewGame) || [];
    for (let i = 0; i < hooks.length; i++) safe('game.onNewGame hook #' + i, hooks[i]);
  }

  // =====================================================================
  // F.newGame
  // =====================================================================

  F.newGame = function (opts) {
    opts = opts || {};
    let seed = opts.seed;
    if (seed === undefined || seed === null || seed === '') seed = randomSeed();
    seed = seed >>> 0;

    // Build the state tree per ARCHITECTURE §18. Field order matches the doc.
    F.state = {
      version: F.C.SAVE_VERSION,
      seed: seed,
      tick: 0,
      rng: { s: seed || 1 },
      world: null,
      entities: [],
      nextId: 1,
      ground: {},
      units: [],
      player: null,
      research: { current: null, unitsDone: 0, unitProgress: 0, done: {}, queue: [] },
      enemies: { evolution: 0, killedSpawners: 0 },
      stats: { produced: {}, consumed: {} },
      alerts: [],
      settings: { peaceful: !!opts.peaceful },
    };

    // Canonical reseed through F.rng (00-core.js owns the RNG-state shape).
    F.rng.seed(seed);

    safe('F.world.newWorld', function () {
      if (F.world && typeof F.world.newWorld === 'function') F.world.newWorld(seed);
      else F.log.warn('[80-game] F.world.newWorld missing (10-world.js not loaded)');
    });

    safe('F.player.init', function () {
      if (F.player && typeof F.player.init === 'function') F.player.init();
      else F.state.player = fallbackPlayer();
    });

    // EXPANSION.md §6.1: F.game.onNewGame(fn) hooks — state object exists (top-level
    // feature keys like F.state.trains get created here), rebuild caches happen next.
    runOnNewGameHooks();

    rebuildAll();

    F.state.tick = 0;
    tickPhaseErrorsLogged = Object.create(null); // fresh game: re-arm phase error logging
    if (F.events && typeof F.events.emit === 'function') F.events.emit('game:new', { seed: seed });
    return F.state;
  };

  // =====================================================================
  // F.tick — the fixed-timestep simulation step (ARCHITECTURE §18 / GDD §7.2)
  // =====================================================================

  // One log line per phase per game (not per tick) so a persistently broken
  // module cannot flood the console at 60 Hz.
  let tickPhaseErrorsLogged = Object.create(null);
  function runTickPhase(name, fn) {
    try {
      fn();
    } catch (err) {
      if (!tickPhaseErrorsLogged[name]) {
        tickPhaseErrorsLogged[name] = true;
        F.log.error('[tick] phase "' + name + '" threw (further errors from this phase are suppressed this game):', err);
      }
    }
  }

  // EXPANSION.md §6.1: F.game.addTickPhase(name, after, fn) — run every phase
  // registered against `afterName` right after the built-in phase of that
  // name runs, in registration order, each wrapped in the same runTickPhase
  // error-isolation/profiling as the built-ins (a broken feature phase logs
  // once and never blocks the rest of the tick).
  function runRegisteredPhasesAfter(afterName) {
    const list = F.game && F.game._tickPhases;
    if (!list || !list.length) return;
    for (let i = 0; i < list.length; i++) {
      const reg = list[i];
      if (!reg || reg.after !== afterName) continue;
      runTickPhase(reg.name || (afterName + ':hook' + i), reg.fn);
    }
  }

  function expireAlerts() {
    const alerts = F.state.alerts;
    if (!alerts || !alerts.length) return;
    let changed = false;
    const kept = [];
    for (let i = 0; i < alerts.length; i++) {
      const a = alerts[i];
      if (a && typeof a.expiresAtTick === 'number' && a.expiresAtTick <= F.state.tick) { changed = true; continue; }
      kept.push(a);
    }
    if (changed) F.state.alerts = kept;
  }

  function maybeAutosave() {
    if (typeof window === 'undefined' || window.HEADLESS) return; // never touch localStorage under headless
    const now = F.util.now();
    if (!F.game.lastAutosave) { F.game.lastAutosave = now; return; }
    if (now - F.game.lastAutosave < 60000) return;
    F.game.lastAutosave = now;
    try {
      const s = F.save();
      if (!s) return;
      if (s.length > 4 * 1024 * 1024) F.log.warn('[80-game] save exceeds 4 MB (' + s.length + ' bytes); consider exporting');
      window.localStorage.setItem('factio.save', s);
      if (F.events && typeof F.events.emit === 'function') F.events.emit('game:autosaved', {});
    } catch (err) {
      F.log.warn('[80-game] autosave failed (storage blocked?)', err);
      if (F.events && typeof F.events.emit === 'function') F.events.emit('game:save-blocked', {});
    }
  }

  F.tick = function () {
    if (!F.state) { (F.game._warnedNoState || (F.game._warnedNoState = true, F.log.warn('[80-game] F.tick called before F.newGame/F.load'))); return; }

    runTickPhase('world', function () { if (F.world && typeof F.world.tick === 'function') F.world.tick(); });
    runRegisteredPhasesAfter('world');
    runTickPhase('player', function () { if (F.player && typeof F.player.tick === 'function') F.player.tick(F.input && F.input.state); });
    runRegisteredPhasesAfter('player');
    runTickPhase('power', function () { if (F.power && typeof F.power.tick === 'function') F.power.tick(); });
    runRegisteredPhasesAfter('power');
    runTickPhase('fluids', function () { if (F.fluids && typeof F.fluids.tick === 'function') F.fluids.tick(); });
    runRegisteredPhasesAfter('fluids');
    runTickPhase('machines', function () { if (F.machines && typeof F.machines.tick === 'function') F.machines.tick(); });
    runRegisteredPhasesAfter('machines');
    runTickPhase('inserters', function () { if (F.inserters && typeof F.inserters.tick === 'function') F.inserters.tick(); });
    runRegisteredPhasesAfter('inserters');
    runTickPhase('belts', function () { if (F.belts && typeof F.belts.tick === 'function') F.belts.tick(); });
    runRegisteredPhasesAfter('belts');
    runTickPhase('combat', function () { if (F.combat && typeof F.combat.tick === 'function') F.combat.tick(); });
    runRegisteredPhasesAfter('combat');
    runTickPhase('pollution', function () { if (F.pollution && typeof F.pollution.tick === 'function') F.pollution.tick(); });
    runRegisteredPhasesAfter('pollution');
    runTickPhase('research', function () { if (F.research && typeof F.research.tick === 'function') F.research.tick(); });
    runRegisteredPhasesAfter('research');
    runTickPhase('bookkeeping', function () {
      if (F.entities && typeof F.entities.flushRemovals === 'function') F.entities.flushRemovals();
      expireAlerts();
      maybeAutosave();
      F.state.tick++;
    });
  };

  // =====================================================================
  // Save / load — generic deep-walk serialiser (ARCHITECTURE §18).
  // Typed arrays -> {"$u8"|"$u16"|"$u32"|"$i32"|"$f32": base64}. Keys
  // starting with '_' (runtime caches, e.g. entity._ ) are stripped. Cycles
  // are broken (F.state never legitimately contains one; see constraints).
  //
  // Note: this generic full-state format is what ARCHITECTURE.md §18
  // specifies for F.save/F.load (typed-array-safe deep walk); GDD.md §10.2
  // additionally sketches a smaller delta-based schema (oreDelta, only-
  // dirty chunks, etc). Per the precedence rule at the top of
  // ARCHITECTURE.md, structural/format decisions follow ARCHITECTURE.md,
  // so that is what is implemented here — see "assumptions" in the report.
  // =====================================================================

  const TYPED_ENCODE = [
    [typeof Uint8Array !== 'undefined' ? Uint8Array : null, '$u8'],
    [typeof Uint16Array !== 'undefined' ? Uint16Array : null, '$u16'],
    [typeof Uint32Array !== 'undefined' ? Uint32Array : null, '$u32'],
    [typeof Int32Array !== 'undefined' ? Int32Array : null, '$i32'],
    [typeof Float32Array !== 'undefined' ? Float32Array : null, '$f32'],
  ];
  const TYPED_DECODE = {
    $u8: typeof Uint8Array !== 'undefined' ? Uint8Array : null,
    $u16: typeof Uint16Array !== 'undefined' ? Uint16Array : null,
    $u32: typeof Uint32Array !== 'undefined' ? Uint32Array : null,
    $i32: typeof Int32Array !== 'undefined' ? Int32Array : null,
    $f32: typeof Float32Array !== 'undefined' ? Float32Array : null,
  };

  function bytesToBase64(bytes) {
    const CHUNK = 0x8000;
    const parts = [];
    for (let i = 0; i < bytes.length; i += CHUNK) {
      parts.push(String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK)));
    }
    return window.btoa(parts.join(''));
  }
  function base64ToBytes(b64) {
    const bin = window.atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  function encodeTypedArray(value) {
    for (let i = 0; i < TYPED_ENCODE.length; i++) {
      const Ctor = TYPED_ENCODE[i][0];
      if (Ctor && value instanceof Ctor) {
        const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
        const out = {};
        out[TYPED_ENCODE[i][1]] = bytesToBase64(bytes);
        return out;
      }
    }
    return null;
  }
  function decodeTypedArrayIfMatch(value) {
    if (!value || typeof value !== 'object') return undefined;
    const keys = Object.keys(value);
    if (keys.length !== 1) return undefined;
    const tag = keys[0];
    const Ctor = TYPED_DECODE[tag];
    if (!Ctor || typeof value[tag] !== 'string') return undefined;
    const bytes = base64ToBytes(value[tag]);
    const len = bytes.byteLength / Ctor.BYTES_PER_ELEMENT;
    return new Ctor(bytes.buffer, bytes.byteOffset, len);
  }

  function cloneForSave(value, seen) {
    if (value === null || typeof value !== 'object') return value;
    const typed = encodeTypedArray(value);
    if (typed) return typed;
    if (seen.has(value)) { F.log.warn('[80-game] F.save: cyclic reference dropped'); return null; }
    seen.add(value);
    let out;
    if (Array.isArray(value)) {
      out = new Array(value.length);
      for (let i = 0; i < value.length; i++) out[i] = cloneForSave(value[i], seen);
    } else {
      out = {};
      for (const key in value) {
        if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
        if (key.charCodeAt(0) === 95 /* '_' */) continue; // strip runtime caches
        const v = value[key];
        if (typeof v === 'function') continue;
        out[key] = cloneForSave(v, seen);
      }
    }
    seen.delete(value);
    return out;
  }

  function decodeForLoad(value) {
    if (value === null || typeof value !== 'object') return value;
    const typed = decodeTypedArrayIfMatch(value);
    if (typed !== undefined) return typed;
    if (Array.isArray(value)) {
      const out = new Array(value.length);
      for (let i = 0; i < value.length; i++) out[i] = decodeForLoad(value[i]);
      return out;
    }
    const out = {};
    for (const key in value) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
      out[key] = decodeForLoad(value[key]);
    }
    return out;
  }

  // Version migration hook. v1 -> v2 changed only how F.state.world.chunks
  // is encoded (full per-chunk typed arrays -> compact per-chunk deltas);
  // that reshaping is shape-based (old saves carry an object map of full
  // chunks, new ones an array of delta records) and handled directly in
  // F.load() via F.world.importChunks(), so no field-by-field step is
  // needed here for it. Add v2->v3 etc. below as the format evolves further.
  function migrate(state, fromVersion) {
    let v = fromVersion || 1;
    if (v < 2) v = 2; // world.chunks reshaping handled in F.load(), not here
    while (v < F.C.SAVE_VERSION) {
      F.log.warn('[80-game] F.load: no migration step defined for version ' + v + ' -> ' + (v + 1));
      break;
    }
    state.version = F.C.SAVE_VERSION;
    return state;
  }

  function computeNextId(entities) {
    let max = 0;
    if (Array.isArray(entities)) {
      for (let i = 0; i < entities.length; i++) {
        const e = entities[i];
        if (e && typeof e.id === 'number' && e.id > max) max = e.id;
      }
    }
    return max + 1;
  }

  F.save = function () {
    if (!F.state) { F.log.warn('[80-game] F.save: no active game'); return null; }
    try {
      // F.state.world.chunks is NEVER walked/typed-array-encoded by the
      // generic cloner below: it can hold thousands of generated chunks
      // (~9 KB each of raw terrain/res/amount/feature/featHp) after a long
      // play session, which is exactly the localStorage-quota problem this
      // save format exists to avoid. Detach it for the clone (restored
      // immediately after, even on error) and replace it with
      // F.world.exportChunks()'s compact delta-only encoding instead — see
      // F.world.exportChunks/importChunks in 10-world.js and F.C.SAVE_VERSION
      // in 00-core.js.
      const liveChunks = F.state.world && F.state.world.chunks;
      if (F.state.world) F.state.world.chunks = undefined;
      let tree;
      try {
        tree = cloneForSave(F.state, new Set());
      } finally {
        if (F.state.world) F.state.world.chunks = liveChunks;
      }
      if (tree.world) {
        tree.world.chunks = (F.world && typeof F.world.exportChunks === 'function') ? F.world.exportChunks() : [];
      }
      tree.magic = 'FACTIO';
      tree.version = F.C.SAVE_VERSION;
      tree.savedAt = new Date().toISOString();
      return JSON.stringify(tree);
    } catch (err) {
      F.log.error('[80-game] F.save failed', err);
      return null;
    }
  };

  // ---------------------------------------------------------------------
  // Tolerate old saves that still reference removed content (task: combat
  // off — an old save's localStorage payload may hold turrets, walls,
  // spawners, biter units, a pistol or ammo, none of which exist in
  // F.data any more). Two rules, applied to a freshly-decoded save before
  // it becomes F.state:
  //   1. Drop any F.state.entities[] entry whose type is not in
  //      F.data.entities (silently removes gun-turret/stone-wall/
  //      biter-spawner entities from an old save).
  //   2. Drop any inventory stack `{id, count}` anywhere in the save tree
  //      whose item is not in F.data.items (player.inv/.cursor/.ammo,
  //      chest/furnace/assembler slots, ground items, ...).
  // F.state.units (biter units — a separate array, not in F.data.entities)
  // is cleared outright when combat is off, since nothing can process it.
  // ---------------------------------------------------------------------
  function sanitizeItemRefs(node, seen) {
    if (!node || typeof node !== 'object') return;
    if (seen.has(node)) return;
    seen.add(node);
    if (ArrayBuffer.isView(node)) return; // typed arrays: nothing to sanitize
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        const v = node[i];
        if (v && typeof v === 'object' && typeof v.id === 'string' && typeof v.count === 'number') {
          if (!F.data || !F.data.items || !F.data.items[v.id]) { node[i] = null; continue; }
        }
        sanitizeItemRefs(v, seen);
      }
      return;
    }
    for (const k in node) {
      if (!Object.prototype.hasOwnProperty.call(node, k)) continue;
      const v = node[k];
      if (v && typeof v === 'object' && typeof v.id === 'string' && typeof v.count === 'number') {
        if (!F.data || !F.data.items || !F.data.items[v.id]) { node[k] = null; continue; }
      }
      sanitizeItemRefs(v, seen);
    }
  }

  function sanitizeRemovedContent(state) {
    try {
      if (Array.isArray(state.entities) && F.data && F.data.entities) {
        const before = state.entities.length;
        state.entities = state.entities.filter(function (e) { return e && typeof e.type === 'string' && !!F.data.entities[e.type]; });
        if (state.entities.length !== before) F.log.warn('[80-game] F.load: dropped ' + (before - state.entities.length) + ' entities of a removed type');
      }
      if (!F.FEATURES || !F.FEATURES.combat) state.units = [];
      if (typeof state.player === 'object' && state.player) {
        const p = state.player;
        if (typeof p.weapon === 'string' && (!F.data || !F.data.items || !F.data.items[p.weapon])) p.weapon = null;
        if (!F.FEATURES || !F.FEATURES.combat) { p.weapon = null; p.ammo = null; p.ammoRounds = 0; }
      }
      sanitizeItemRefs(state, new Set());
    } catch (err) {
      F.log.error('[80-game] F.load: sanitizeRemovedContent failed', err);
    }
  }

  F.load = function (json) {
    try {
      const raw = typeof json === 'string' ? JSON.parse(json) : json;
      if (!raw || typeof raw !== 'object') { F.log.error('[80-game] F.load: invalid payload'); return false; }
      if (raw.magic && raw.magic !== 'FACTIO') F.log.warn('[80-game] F.load: unexpected magic "' + raw.magic + '"');
      const version = raw.version || 1;
      if (version > F.C.SAVE_VERSION) { F.log.error('[80-game] F.load: save version ' + version + ' is newer than supported ' + F.C.SAVE_VERSION); return false; }

      let state = decodeForLoad(raw);
      delete state.magic;
      delete state.savedAt;
      state = migrate(state, version);

      // World chunks are restored separately by F.world.importChunks, which
      // accepts either the new compact delta array (SAVE_VERSION >= 2) or a
      // legacy object map of full chunks (SAVE_VERSION 1) and regenerates
      // chunks lazily/deterministically via F.world.ensureChunk as they're
      // next touched — see F.save() and 10-world.js. Pull the raw payload
      // out now so F.state.world never briefly holds that foreign shape.
      const worldSeed = (state.world && typeof state.world.seed === 'number') ? (state.world.seed >>> 0) : ((state.seed >>> 0) || 1);
      const rawWorldChunks = state.world ? state.world.chunks : null;
      state.world = null;

      // Defensive defaults so a hand-edited / partial save never crashes load.
      if (!Array.isArray(state.entities)) state.entities = [];
      if (!state.ground || typeof state.ground !== 'object') state.ground = {};
      if (!Array.isArray(state.units)) state.units = [];
      if (!Array.isArray(state.alerts)) state.alerts = [];
      if (!state.stats || typeof state.stats !== 'object') state.stats = { produced: {}, consumed: {} };
      if (!state.enemies || typeof state.enemies !== 'object') state.enemies = { evolution: 0, killedSpawners: 0 };
      if (!state.research || typeof state.research !== 'object') state.research = { current: null, unitsDone: 0, unitProgress: 0, done: {}, queue: [] };
      if (!state.settings || typeof state.settings !== 'object') state.settings = { peaceful: false };
      if (typeof state.tick !== 'number') state.tick = 0;
      if (typeof state.nextId !== 'number') state.nextId = computeNextId(state.entities);
      if (!state.rng || typeof state.rng.s !== 'number') state.rng = { s: (state.seed >>> 0) || 1 };

      sanitizeRemovedContent(state);

      F.state = state;
      tickPhaseErrorsLogged = Object.create(null); // loaded game: re-arm phase error logging

      safe('F.world.importChunks', function () {
        if (F.world && typeof F.world.importChunks === 'function') F.world.importChunks(rawWorldChunks, worldSeed);
        else F.log.warn('[80-game] F.world.importChunks missing (10-world.js not loaded)');
      });

      rebuildAll();

      F.game.lastAutosave = F.util.now();
      if (F.events && typeof F.events.emit === 'function') F.events.emit('game:loaded', {});
      return true;
    } catch (err) {
      F.log.error('[80-game] F.load failed', err);
      return false;
    }
  };

  // =====================================================================
  // F.game — real-time loop, autosave, slots, export/import (GDD §7.1, §10)
  // =====================================================================

  const TICK_MS = 1000 / F.C.TPS; // 16.666...

  let rafHandle = null;
  let lastFrameTime = 0;
  let budgetMs = 0;

  function hasSavedGame() {
    try { return typeof window !== 'undefined' && !!window.localStorage.getItem('factio.save'); }
    catch (err) { return false; }
  }

  function showBootError(err) {
    try {
      if (typeof document === 'undefined') return;
      let div = document.getElementById('factio-error-overlay');
      if (!div) {
        div = document.createElement('div');
        div.id = 'factio-error-overlay';
        div.style.cssText = 'position:fixed;inset:0;background:rgba(27,27,27,0.95);color:#ff3f3f;' +
          'font:13px/1.5 monospace;padding:24px;z-index:99999;overflow:auto;white-space:pre-wrap;';
        document.body.appendChild(div);
      }
      const msg = (F.t ? F.t('game.boot_error') : 'Factio je naletel na napako in se je ustavil.');
      div.textContent = msg + '\n\n' + ((err && err.stack) || String(err));
    } catch (err2) { /* nothing more we can do */ }
  }

  function onVisibilityChange() {
    try {
      if (typeof document === 'undefined') return;
      if (document.hidden) {
        budgetMs = 0; // drop backlog while hidden; we never simulate offline
      } else {
        lastFrameTime = F.util.now();
      }
    } catch (err) { /* ignore */ }
  }

  function loopFrame(now) {
    try {
      if (!F.game.running || F.game.paused) {
        lastFrameTime = now;
        rafHandle = window.requestAnimationFrame(loopFrame);
        return;
      }
      let delta = now - lastFrameTime;
      lastFrameTime = now;
      if (!(delta >= 0) || delta > 60000) delta = 0; // guard against clock weirdness
      budgetMs += Math.min(delta, 250); // clamp so a tab-switch doesn't cause a spiral

      let steps = 0;
      while (budgetMs >= TICK_MS && steps < 5) {
        F.tick();
        budgetMs -= TICK_MS;
        steps++;
      }
      if (steps === 5) budgetMs = 0; // drop the backlog: the game slows instead of freezing

      if (F.render && typeof F.render.frame === 'function') F.render.frame(delta);
      if (F.ui && typeof F.ui.update === 'function') F.ui.update();

      rafHandle = window.requestAnimationFrame(loopFrame);
    } catch (err) {
      F.log.error('[80-game] fatal error escaped the main loop, stopping', err);
      F.game.running = false;
      rafHandle = null;
      showBootError(err);
    }
  }

  // EXPANSION.md §6.1: F.game must exist early enough for feature files that
  // load BEFORE this one (37-, 38-, 39-, 45- ...) to register hooks. Those
  // files cannot call F.game.addTickPhase/onRebuild/onNewGame (this file
  // hasn't run yet, so those functions don't exist) — instead they use the
  // "queue pattern": push straight onto F.game._tickPhases/_onRebuild/
  // _onNewGame, creating F.game and the arrays if needed, e.g.:
  //   F.game = F.game || {};
  //   (F.game._tickPhases = F.game._tickPhases || []).push({ name: 'my-feature', after: 'fluids', fn: tickMyFeature });
  //   (F.game._onNewGame = F.game._onNewGame || []).push(function () { F.state.myFeature = []; });
  //   (F.game._onRebuild = F.game._onRebuild || []).push(function () { /* rebuild runtime caches */ });
  // So: MERGE onto any F.game object that already exists (Object.assign),
  // never replace it wholesale, and adopt (not discard) whatever got queued.
  F.game = F.game || {};
  if (!Array.isArray(F.game._tickPhases)) F.game._tickPhases = [];
  if (!Array.isArray(F.game._onRebuild)) F.game._onRebuild = [];
  if (!Array.isArray(F.game._onNewGame)) F.game._onNewGame = [];

  Object.assign(F.game, {
    running: false,
    paused: false,
    speed: 1,
    lastAutosave: 0,
    hasSavedGame: hasSavedGame,

    // addTickPhase(name, after, fn): fn() runs every tick right after the named
    // built-in phase (see the list in runRegisteredPhasesAfter's call sites
    // above), wrapped in the same error-isolating runTickPhase as the built-ins.
    // Multiple registrations against the same `after` run in registration order.
    addTickPhase: function (name, after, fn) { F.game._tickPhases.push({ name: name, after: after, fn: fn }); },
    // onRebuild(fn): fn() runs at the end of rebuildAll() — after F.newGame AND after F.load.
    onRebuild: function (fn) { F.game._onRebuild.push(fn); },
    // onNewGame(fn): fn() runs once F.state exists but before rebuildAll() (new game only).
    onNewGame: function (fn) { F.game._onNewGame.push(fn); },

    loop: function () {
      if (typeof window === 'undefined' || window.HEADLESS) return; // never drive rAF under headless
      if (rafHandle !== null) return; // already running
      F.game.running = true;
      lastFrameTime = F.util.now();
      budgetMs = 0;
      rafHandle = window.requestAnimationFrame(loopFrame);
      if (!F.game._hooked) {
        F.game._hooked = true;
        try { document.addEventListener('visibilitychange', onVisibilityChange); } catch (err) { /* ignore */ }
        try { window.addEventListener('beforeunload', function () { maybeAutosave(); }); } catch (err) { /* ignore */ }
      }
    },

    pause: function () { F.game.paused = true; },
    resume: function () { F.game.paused = false; lastFrameTime = F.util.now(); },

    saveToSlot: function (name) {
      try {
        const s = F.save();
        if (!s) return false;
        window.localStorage.setItem('factio.slot.' + name, s);
        if (F.events && typeof F.events.emit === 'function') F.events.emit('game:saved', { slot: name });
        return true;
      } catch (err) { F.log.error('[80-game] saveToSlot failed', err); return false; }
    },
    loadFromSlot: function (name) {
      try {
        const s = window.localStorage.getItem('factio.slot.' + name);
        if (!s) return false;
        return F.load(s);
      } catch (err) { F.log.error('[80-game] loadFromSlot failed', err); return false; }
    },
    listSlots: function () {
      const out = [];
      try {
        const ls = window.localStorage;
        for (let i = 0; i < ls.length; i++) {
          const k = ls.key(i);
          if (k && k.indexOf('factio.slot.') === 0) out.push(k.slice('factio.slot.'.length));
        }
      } catch (err) { F.log.warn('[80-game] listSlots failed', err); }
      return out;
    },

    exportString: function () { return F.save(); },
    importString: function (s) { return F.load(s); },

    newGameWithSeed: function (seed) { return F.newGame({ seed: seed }); },
  });

  // =====================================================================
  // F.boot — real-page entry point (never called under HEADLESS; see
  // 99-main.js). GDD §9.14.
  // =====================================================================

  F.boot = function () {
    if (typeof window === 'undefined' || window.HEADLESS) { F.log.warn('[80-game] F.boot called under HEADLESS; ignoring'); return; }
    try {
      const canvas = document.getElementById('game');
      if (F.render && typeof F.render.init === 'function') F.render.init(canvas);
      if (F.ui && typeof F.ui.init === 'function') F.ui.init();
      if (F.input && typeof F.input.init === 'function') F.input.init(canvas);

      if (hasSavedGame()) {
        // Load the autosave right away so the world exists behind the menu (Esc just closes it);
        // fall back to a fresh game if the save is unreadable.
        let loaded = false;
        try { const raw = window.localStorage.getItem('factio.save'); loaded = !!raw && !!F.load(raw); } catch (err) { F.log.warn('[80-game] autosave load failed', err); }
        if (!loaded) F.newGame({ seed: randomSeed() });
        if (F.ui && typeof F.ui.open === 'function') F.ui.open('menu', { continueAvailable: true });
        else F.log.warn('[80-game] a save exists but F.ui is not loaded; open the menu manually');
      } else {
        F.newGame({ seed: randomSeed() });
        if (F.ui && typeof F.ui.open === 'function') F.ui.open('help', {});
      }

      F.game.loop();
    } catch (err) {
      F.log.error('[80-game] F.boot failed', err);
      showBootError(err);
    }
  };

  // =====================================================================
  // i18n (module #80 — F.i18n exists by the time modules >= 10 load).
  // =====================================================================

  F.i18n.add('en', {
    'game.boot_error': 'Factio hit an error and stopped.',
    'game.save_blocked': 'Saving is not possible (the browser is blocking storage).',
    'game.autosaved': 'Autosaved',
    'game.saved': 'Saved',
    'game.loaded': 'Game loaded',
  });
})();
