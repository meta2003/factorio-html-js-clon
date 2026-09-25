// 51-ghosts.js — entity ghosts: planned buildings that exist only as a translucent outline
// until someone builds them (by hand today; construction robots and blueprints build on
// the same store later).
//
// Ghosts are NOT entities. They live in their own store, F.state.ghosts = { nextId, list },
// with a tile -> ghost map kept here, so belts/power/fluids/inserters/robots never see them
// and every existing system behaves exactly as before. A ghost is a plain JSON object:
//   { id, type /* F.data.entities id */, x, y, dir, w, h, settings: null | {...} }
// `settings` is what captureSettings() read off a real entity (recipe, inserter filters,
// splitter priorities, requester slots, train-stop name, ...) and is applied to the entity
// that eventually gets built on the ghost.
//
// Rules:
//   - A ghost may only go where the real entity could go (F.api.canPlace, except that the
//     player standing there, and trees/rocks — which get marked for deconstruction — do not
//     block it). It never overlaps a real entity.
//   - Placing a ghost over other ghosts replaces them (an identical ghost is kept instead).
//   - Whenever a real entity is created (F.entities.create -> 'entity:placed'), every ghost
//     under its footprint is removed; a ghost of the same type at the same anchor tile hands
//     its settings over first. So building "on top of" a ghost by any route fulfils it.
//
// F.ghosts:
//   canPlace(type, tx, ty, dir) -> { ok, reason }
//   place(type, tx, ty, dir, settings?) -> ghost | null
//   at(tx, ty) -> ghost | null        byId(id) -> ghost | null
//   all() -> array (live list; do not mutate)       count() -> n
//   remove(ghost) -> bool             removeAt(tx, ty) -> bool
//   setDir(ghost, dir) -> bool        (same footprint only; used by belt drags)
//   itemFor(ghostOrType) -> item id that builds it
//   build(ghost, opts?) -> entity | null   hand-build from the player's inventory
//                                          (opts.fromInventory default true, opts.checkReach)
//   captureSettings(entity) -> settings | null     applySettings(entity, settings)
//   inRect(x0, y0, x1, y1) -> ghosts overlapping the tile rect (inclusive)
//   blockedByFeature(ghost) -> bool      a tree/rock still stands on it (planned over one: it
//                                          is marked for deconstruction, 54-deconstruction.js)
//   drawSprite(ctx, cam, type, dir, tx, ty, settings, bad)  draw a planned entity (blue, or
//                                          red when `bad`); also used by blueprint previews
//
// Registers: onNewGame/onRebuild hooks (queue pattern, design/EXPANSION.md §6.1) and an
// 'objects' + 'overlay' render layer (F._renderHooks, EXPANSION §6.5). Headless safe.
(function () {
  'use strict';

  F.i18n.add('en', {
    'ghost.label': 'Ghost: {name}',
    'ghost.missing': 'Missing {name}',
    'ghost.too_far': 'Too far to build',
    'ghost.blocked': 'Cannot build here',
  });

  // =====================================================================
  // State + tile map
  // =====================================================================
  var tileMap = new Map(); // "x,y" -> ghost (runtime cache, rebuilt on load)

  function store() {
    if (!F.state) return null;
    var g = F.state.ghosts;
    if (!g || typeof g !== 'object' || !Array.isArray(g.list)) {
      g = F.state.ghosts = { nextId: 1, list: [] };
    }
    if (typeof g.nextId !== 'number') g.nextId = 1;
    return g;
  }

  function key(x, y) { return x + ',' + y; }

  function setTiles(g, present) {
    for (var j = 0; j < g.h; j++) {
      for (var i = 0; i < g.w; i++) {
        var k = key(g.x + i, g.y + j);
        if (present) tileMap.set(k, g);
        else if (tileMap.get(k) === g) tileMap.delete(k);
      }
    }
  }

  function rebuild() {
    tileMap = new Map();
    var s = store();
    if (!s) return;
    var maxId = 0;
    var kept = [];
    for (var i = 0; i < s.list.length; i++) {
      var g = s.list[i];
      if (!g || typeof g.type !== 'string' || !F.data.entities[g.type]) continue; // removed content
      var fp = F.entities.footprint(F.data.entities[g.type], g.dir & 3);
      g.w = fp[0]; g.h = fp[1];
      kept.push(g);
      setTiles(g, true);
      if (g.id > maxId) maxId = g.id;
    }
    s.list = kept;
    if (s.nextId <= maxId) s.nextId = maxId + 1;
  }

  F.game = F.game || {};
  (F.game._onNewGame = F.game._onNewGame || []).push(function () {
    F.state.ghosts = { nextId: 1, list: [] };
    tileMap = new Map();
  });
  (F.game._onRebuild = F.game._onRebuild || []).push(rebuild);

  // =====================================================================
  // Queries
  // =====================================================================
  function at(tx, ty) { return tileMap.get(key(tx, ty)) || null; }

  function byId(id) {
    var s = store();
    if (!s) return null;
    for (var i = 0; i < s.list.length; i++) if (s.list[i].id === id) return s.list[i];
    return null;
  }

  function all() { var s = store(); return s ? s.list : []; }
  function count() { return all().length; }

  function itemFor(g) {
    var type = typeof g === 'string' ? g : (g && g.type);
    var def = type && F.data.entities[type];
    return (def && def.minable) || type || null;
  }

  // Unique ghosts overlapping a tile rect (inclusive bounds).
  function inRect(x0, y0, x1, y1) {
    var out = [];
    var list = all();
    for (var i = 0; i < list.length; i++) {
      var g = list[i];
      if (g.x > x1 || g.y > y1 || g.x + g.w - 1 < x0 || g.y + g.h - 1 < y0) continue;
      out.push(g);
    }
    return out;
  }

  function overlapping(tx, ty, w, h) {
    var seen = [];
    for (var j = 0; j < h; j++) {
      for (var i = 0; i < w; i++) {
        var g = tileMap.get(key(tx + i, ty + j));
        if (g && seen.indexOf(g) < 0) seen.push(g);
      }
    }
    return seen;
  }

  // =====================================================================
  // Place / remove
  // =====================================================================
  function placeableDef(type) {
    var def = F.data.entities[type];
    if (!def || def.natural) return null;
    var item = def.minable;
    if (!item || !F.data.items[item] || F.data.items[item].place !== type) return null;
    return def;
  }

  function canPlace(type, tx, ty, dir) {
    if (!placeableDef(type)) return { ok: false, reason: 'collision' };
    tx = tx | 0; ty = ty | 0;
    // Trees and rocks do not block a ghost: place() marks them for deconstruction.
    var chk = F.api.canPlace(type, tx, ty, (dir | 0) & 3, { ignorePlayer: true, ignoreFeatures: !!F.deconstruction });
    // A planned train stop may lean on a planned rail (blueprints place both as ghosts);
    // building the stop by hand still needs the real rail first.
    if (!chk.ok && chk.reason === 'no_rail' && hasGhostNeighbour(tx, ty, 'rail')) return { ok: true, reason: null };
    return chk;
  }

  function hasGhostNeighbour(tx, ty, behaviour) {
    for (var d = 0; d < 4; d++) {
      var v = F.C.DIRS[d];
      var g = tileMap.get(key(tx + v[0], ty + v[1]));
      var gd = g && F.data.entities[g.type];
      if (gd && gd.behaviour === behaviour) return true;
    }
    return false;
  }

  function cloneSettings(s) {
    return s ? JSON.parse(JSON.stringify(s)) : null;
  }

  function place(type, tx, ty, dir, settings) {
    var s = store();
    if (!s) return null;
    tx = tx | 0; ty = ty | 0; dir = (dir | 0) & 3;
    var chk = canPlace(type, tx, ty, dir);
    if (!chk.ok) return null;
    var def = F.data.entities[type];
    var fp = F.entities.footprint(def, dir);
    var over = overlapping(tx, ty, fp[0], fp[1]);
    for (var i = 0; i < over.length; i++) {
      var o = over[i];
      if (o.type === type && o.x === tx && o.y === ty && o.dir === dir) {
        if (settings) o.settings = cloneSettings(settings);
        return o;
      }
    }
    for (var k = 0; k < over.length; k++) remove(over[k]);
    var g = { id: s.nextId++, type: type, x: tx, y: ty, dir: dir, w: fp[0], h: fp[1], settings: cloneSettings(settings) };
    s.list.push(g);
    setTiles(g, true);
    if (F.deconstruction) {
      for (var fy = 0; fy < fp[1]; fy++) for (var fx = 0; fx < fp[0]; fx++) {
        if (F.world.feature(tx + fx, ty + fy)) F.deconstruction.markFeature(tx + fx, ty + fy);
      }
    }
    F.events.emit('ghost:placed', g);
    return g;
  }

  function remove(g) {
    var s = store();
    if (!s || !g) return false;
    var i = s.list.indexOf(g);
    if (i < 0) return false;
    s.list.splice(i, 1);
    setTiles(g, false);
    F.events.emit('ghost:removed', g);
    return true;
  }

  // True while a tree or rock still stands on the ghost's footprint (robots wait for it).
  function blockedByFeature(g) {
    for (var j = 0; j < g.h; j++) for (var i = 0; i < g.w; i++) if (F.world.feature(g.x + i, g.y + j)) return true;
    return false;
  }

  function removeAt(tx, ty) {
    var g = at(tx, ty);
    return g ? remove(g) : false;
  }

  function setDir(g, dir) {
    if (!g) return false;
    dir = (dir | 0) & 3;
    var def = F.data.entities[g.type];
    if (!def || !def.rotatable) return false;
    var fp = F.entities.footprint(def, dir);
    if (fp[0] !== g.w || fp[1] !== g.h) return false;
    g.dir = dir;
    return true;
  }

  // =====================================================================
  // Settings: what a ghost remembers about the entity it stands for.
  // Plain keys are copied only when the freshly built entity already has
  // that key (its behaviour's create() initialised it), so a setting can
  // never leak onto an entity type that does not understand it.
  // =====================================================================
  var PLAIN_KEYS = ['filter', 'filterMode', 'inPrio', 'outPrio', 'requests', 'autoLaunch'];

  // Values every freshly created entity already has: not worth remembering.
  function isDefault(v) {
    if (v === undefined || v === null || v === false || v === 0) return true;
    if (Array.isArray(v)) {
      for (var i = 0; i < v.length; i++) if (v[i] !== null && v[i] !== undefined) return false;
      return true;
    }
    return false;
  }

  function captureSettings(e) {
    if (!e) return null;
    var def = F.data.entities[e.type];
    var out = {};
    var any = false;
    if (e.recipe && def && (def.behaviour === 'assembler' || def.behaviour === 'crafter')) { out.recipe = e.recipe; any = true; }
    for (var i = 0; i < PLAIN_KEYS.length; i++) {
      var k = PLAIN_KEYS[i];
      if (isDefault(e[k])) continue;
      out[k] = JSON.parse(JSON.stringify(e[k]));
      any = true;
    }
    // A filter mode means nothing without a filter (every inserter carries one).
    if (out.filterMode !== undefined && out.filter === undefined) {
      delete out.filterMode;
      any = Object.keys(out).length > 0;
    }
    if (def && def.behaviour === 'train-stop' && e.name) { out.name = e.name; any = true; }
    // Entrance or exit: an exit built before its entrance must not turn into an entrance.
    if (def && def.behaviour === 'underground' && (e.io === 'in' || e.io === 'out')) { out.io = e.io; any = true; }
    return any ? out : null;
  }

  function applySettings(e, s) {
    if (!e || !s) return;
    var def = F.data.entities[e.type];
    if (!def) return;
    if (s.recipe) {
      try {
        if (def.behaviour === 'crafter' && F.oil && typeof F.oil.setRecipe === 'function') F.oil.setRecipe(e, s.recipe);
        else if (def.behaviour === 'assembler') F.api.setRecipe(e, s.recipe);
      } catch (err) { F.log.warn('[ghosts] recipe not applied', e.type, s.recipe, err); }
    }
    for (var i = 0; i < PLAIN_KEYS.length; i++) {
      var k = PLAIN_KEYS[i];
      if (s[k] === undefined || !(k in e)) continue;
      e[k] = JSON.parse(JSON.stringify(s[k]));
    }
    if (def.behaviour === 'train-stop' && typeof s.name === 'string' && s.name) e.name = s.name.slice(0, 40);
    if (def.behaviour === 'underground' && s.io && F.belts && typeof F.belts.setUndergroundIO === 'function') F.belts.setUndergroundIO(e, s.io);
  }

  // A real entity appeared: clear every ghost under it, handing the settings of a
  // matching ghost (same type, same anchor) to the new entity.
  F.events.on('entity:placed', function (e) {
    if (!e || e._removed || !tileMap.size) return;
    var over = overlapping(e.x, e.y, e.w || 1, e.h || 1);
    for (var i = 0; i < over.length; i++) {
      var g = over[i];
      if (g.type === e.type && g.x === e.x && g.y === e.y && g.settings) applySettings(e, g.settings);
      remove(g);
    }
  });

  // =====================================================================
  // Hand building
  // =====================================================================
  // Builds `g` from the player's inventory. Returns the entity, or null with
  // F.ghosts.lastFailure set to 'missing' | 'too_far' | 'blocked'.
  function build(g, opts) {
    opts = opts || {};
    ghosts.lastFailure = null;
    if (!g || all().indexOf(g) < 0) { ghosts.lastFailure = 'blocked'; return null; }
    var fromInventory = opts.fromInventory !== false;
    var item = itemFor(g);
    if (fromInventory && F.api.inventoryCount(item) < 1) { ghosts.lastFailure = 'missing'; return null; }
    var chk = F.api.canPlace(g.type, g.x, g.y, g.dir, { checkReach: !!opts.checkReach });
    if (!chk.ok) { ghosts.lastFailure = chk.reason === 'out_of_reach' ? 'too_far' : 'blocked'; return null; }
    var e = F.api.place(g.type, g.x, g.y, g.dir, { fromInventory: fromInventory });
    if (!e) { ghosts.lastFailure = 'blocked'; return null; }
    // The 'entity:placed' listener above already removed the ghost and applied its settings.
    return e;
  }

  // =====================================================================
  // Rendering (browser only; no-ops headless because F.sprites is disabled)
  // =====================================================================
  var GHOST_TINT = 'rgba(110,190,255,0.6)';
  var BAD_TINT = 'rgba(255,80,70,0.65)';
  var tintCaches = Object.create(null); // colour -> WeakMap(sprite canvas -> tinted copy)

  function tinted(spr, color) {
    if (!spr || !spr.width || typeof WeakMap !== 'function' || typeof document === 'undefined') return null;
    var cache = tintCaches[color] || (tintCaches[color] = new WeakMap());
    var c = cache.get(spr);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = spr.width; c.height = spr.height;
    var x = c.getContext('2d');
    x.drawImage(spr, 0, 0);
    x.globalCompositeOperation = 'source-atop';
    x.fillStyle = color;
    x.fillRect(0, 0, c.width, c.height);
    cache.set(spr, c);
    return c;
  }

  // Draws one planned entity (a ghost, or an entry of a blueprint preview) at tile
  // (tx, ty): the entity sprite tinted blue — or red when `bad` — with a dashed outline.
  function drawSprite(ctx, cam, type, dir, tx, ty, settings, bad) {
    var def = F.data.entities[type];
    if (!def) return;
    var fp = F.entities.footprint(def, dir & 3);
    var size = F.C.TILE * (cam.zoom || 1);
    var p = cam.toScreen(tx, ty);
    var w = fp[0] * size, h = fp[1] * size;
    var opts = (def.behaviour === 'underground' && settings && settings.io) ? { io: settings.io } : null;
    var spr = null;
    try { spr = F.sprites.entity(type, dir & 3, 0, opts); } catch (err) { spr = null; }
    var color = bad ? BAD_TINT : GHOST_TINT;
    var t = tinted(spr, color);
    ctx.save();
    if (t) {
      ctx.globalAlpha = 0.55;
      ctx.drawImage(t, p[0], p[1], w, h);
    } else {
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = color;
      ctx.fillRect(p[0], p[1], w, h);
    }
    ctx.globalAlpha = 0.8;
    ctx.strokeStyle = bad ? 'rgba(255,120,110,0.9)' : 'rgba(140,205,255,0.9)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(p[0] + 1.5, p[1] + 1.5, w - 3, h - 3);
    ctx.restore();
  }

  F._renderHooks = F._renderHooks || {
    layers: { floor: [], objects: [], air: [], overlay: [] },
    entityOpts: {}, minimapColors: {}, hidePlayerFns: [], altOverlayFns: [],
  };

  F._renderHooks.layers.objects.push(function (ctx, rect, cam) {
    if (!F.sprites || !F.sprites.enabled || !tileMap.size) return;
    var list = inRect(rect.x0 - 1, rect.y0 - 1, rect.x1 + 1, rect.y1 + 1);
    for (var i = 0; i < list.length; i++) {
      var g = list[i];
      drawSprite(ctx, cam, g.type, g.dir, g.x, g.y, g.settings, false);
    }
  });

  // Hover highlight for the ghost under the cursor (real entities get the selection box).
  F._renderHooks.layers.overlay.push(function (ctx, rect, cam) {
    if (!F.sprites || !F.sprites.enabled || !tileMap.size || !F.input || !F.input.worldCursor) return;
    var c = F.input.worldCursor();
    var g = at(c[0], c[1]);
    if (!g) return;
    var size = F.C.TILE * (cam.zoom || 1);
    var p = cam.toScreen(g.x, g.y);
    ctx.save();
    ctx.strokeStyle = '#bfe3ff';
    ctx.lineWidth = 2;
    ctx.strokeRect(p[0], p[1], g.w * size, g.h * size);
    ctx.restore();
  });

  var ghosts = {
    canPlace: canPlace,
    place: place,
    at: at,
    byId: byId,
    all: all,
    count: count,
    remove: remove,
    removeAt: removeAt,
    setDir: setDir,
    itemFor: itemFor,
    build: build,
    captureSettings: captureSettings,
    applySettings: applySettings,
    inRect: inRect,
    drawSprite: drawSprite,
    blockedByFeature: blockedByFeature,
    lastFailure: null,
  };
  F.ghosts = ghosts;
})();
