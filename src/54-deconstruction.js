// 54-deconstruction.js — deconstruction planner: marks buildings, trees and rocks for
// removal; construction robots (53-construction.js) then take them down and carry the
// items to storage chests. The player can still mine marked things by hand.
//
// State: F.state.decon = { entities: [entityId, ...], features: ["x,y", ...] } — JSON-plain.
// Entity marks are dropped when the entity is removed; feature marks are dropped lazily
// when the tree/rock is gone (mined by hand, say).
//
// F.deconstruction:
//   mark(x0, y0, x1, y1) -> { entities, features, ghosts }   mark everything touching the
//                         tile rect; ghosts there are cancelled right away
//   unmark(x0, y0, x1, y1) -> { entities, features }
//   markEntity(e) / markFeature(tx, ty) / isMarked(e) / featureMarked(tx, ty)
//   targets() -> [{ key: 'e:<id>' | 'f:<x>,<y>', x, y }]      live marks (centre coords)
//   deconstruct(key, collect) -> bool   remove the target, pushing [itemId, count] pairs
//                         (building + contents, or wood/stone/coal) onto `collect`
//   count() -> number of marks
//
// Ghosts may now be planned over trees and rocks: F.ghosts marks them for deconstruction
// (see 51-ghosts.js) and robots only build a ghost once its tiles are clear.
(function () {
  'use strict';

  F.i18n.add('en', {
    'decon.marked': 'Marked {n} for deconstruction',
    'decon.unmarked': 'Cancelled deconstruction of {n}',
    'decon.nothing': 'Nothing to deconstruct here',
  });

  // =====================================================================
  // State
  // =====================================================================
  var entSet = new Set();           // entity ids (runtime mirror of F.state.decon.entities)
  var featSet = new Set();          // "x,y"

  function store() {
    if (!F.state) return null;
    var s = F.state.decon;
    if (!s || typeof s !== 'object') s = F.state.decon = { entities: [], features: [] };
    if (!Array.isArray(s.entities)) s.entities = [];
    if (!Array.isArray(s.features)) s.features = [];
    return s;
  }

  function sync() {
    var s = store();
    if (!s) return;
    s.entities = Array.from(entSet);
    s.features = Array.from(featSet);
  }

  F.game = F.game || {};
  (F.game._onNewGame = F.game._onNewGame || []).push(function () {
    entSet = new Set(); featSet = new Set();
    F.state.decon = { entities: [], features: [] };
  });
  (F.game._onRebuild = F.game._onRebuild || []).push(function () {
    var s = store();
    entSet = new Set(); featSet = new Set();
    for (var i = 0; i < s.entities.length; i++) {
      var e = F.entities.byId(s.entities[i]);
      if (e && !e._removed) entSet.add(e.id);
    }
    for (var j = 0; j < s.features.length; j++) if (typeof s.features[j] === 'string') featSet.add(s.features[j]);
    sync();
  });

  F.events.on('entity:removed', function (e) {
    if (e && entSet.delete(e.id)) sync();
  });

  // =====================================================================
  // Marking
  // =====================================================================
  function deconstructible(e) {
    if (!e || e._removed) return false;
    var def = F.data.entities[e.type];
    return !!(def && !def.natural && def.minable);
  }

  function markEntity(e) {
    if (!deconstructible(e) || entSet.has(e.id)) return false;
    entSet.add(e.id); sync();
    return true;
  }

  function markFeature(tx, ty) {
    var k = tx + ',' + ty;
    if (featSet.has(k) || !F.world.feature(tx, ty)) return false;
    featSet.add(k); sync();
    return true;
  }

  function isMarked(e) { return !!e && entSet.has(e.id); }
  function featureMarked(tx, ty) { return featSet.has(tx + ',' + ty); }

  function rectOf(x0, y0, x1, y1) {
    return { ax: Math.min(x0, x1), bx: Math.max(x0, x1), ay: Math.min(y0, y1), by: Math.max(y0, y1) };
  }

  function entitiesIn(r) {
    var out = [];
    var all = F.entities.all();
    for (var i = 0; i < all.length; i++) {
      var e = all[i];
      if (!deconstructible(e)) continue;
      if (e.x > r.bx || e.y > r.by || e.x + e.w - 1 < r.ax || e.y + e.h - 1 < r.ay) continue;
      out.push(e);
    }
    return out;
  }

  function mark(x0, y0, x1, y1) {
    var r = rectOf(x0, y0, x1, y1);
    var res = { entities: 0, features: 0, ghosts: 0 };
    var es = entitiesIn(r);
    for (var i = 0; i < es.length; i++) if (!entSet.has(es[i].id)) { entSet.add(es[i].id); res.entities++; }
    for (var y = r.ay; y <= r.by; y++) {
      for (var x = r.ax; x <= r.bx; x++) {
        var k = x + ',' + y;
        if (!featSet.has(k) && F.world.feature(x, y)) { featSet.add(k); res.features++; }
      }
    }
    if (F.ghosts) {
      var gs = F.ghosts.inRect(r.ax, r.ay, r.bx, r.by);
      for (var g = 0; g < gs.length; g++) if (F.ghosts.remove(gs[g])) res.ghosts++;
    }
    sync();
    return res;
  }

  function unmark(x0, y0, x1, y1) {
    var r = rectOf(x0, y0, x1, y1);
    var res = { entities: 0, features: 0 };
    var es = entitiesIn(r);
    for (var i = 0; i < es.length; i++) if (entSet.delete(es[i].id)) res.entities++;
    for (var y = r.ay; y <= r.by; y++) {
      for (var x = r.ax; x <= r.bx; x++) if (featSet.delete(x + ',' + y)) res.features++;
    }
    sync();
    return res;
  }

  // =====================================================================
  // Targets for robots
  // =====================================================================
  function targets() {
    var out = [];
    var stale = false;
    entSet.forEach(function (id) {
      var e = F.entities.byId(id);
      if (!e || e._removed) { entSet.delete(id); stale = true; return; }
      out.push({ key: 'e:' + id, x: e.x + e.w / 2, y: e.y + e.h / 2 });
    });
    featSet.forEach(function (k) {
      var xy = F.util.unkey(k);
      if (!F.world.feature(xy[0], xy[1])) { featSet.delete(k); stale = true; return; }
      out.push({ key: 'f:' + k, x: xy[0] + 0.5, y: xy[1] + 0.5 });
    });
    if (stale) sync();
    return out;
  }

  // Yields match hand mining in 40-player.js (completeMining).
  function featureYield(kind, collect) {
    if (kind === 1) collect.push(['wood', 4]);
    else if (kind === 2) collect.push(['stone', 20]);
    else if (kind === 3) { collect.push(['stone', 24 + F.rng.int(27)]); collect.push(['coal', 24 + F.rng.int(27)]); }
  }

  function deconstruct(key, collect) {
    if (typeof key !== 'string') return false;
    if (key.charAt(0) === 'e') {
      var id = +key.slice(2);
      var e = F.entities.byId(id);
      if (!e || e._removed || !entSet.has(id)) return false;
      return F.api.remove(e.x, e.y, { collect: collect });
    }
    var k = key.slice(2);
    if (!featSet.has(k)) return false;
    var xy = F.util.unkey(k);
    var kind = F.world.feature(xy[0], xy[1]);
    featSet.delete(k); sync();
    if (!kind) return false;
    F.world.removeFeature(xy[0], xy[1]);
    featureYield(kind, collect);
    return true;
  }

  function stillMarked(key) {
    if (typeof key !== 'string') return false;
    if (key.charAt(0) === 'e') return entSet.has(+key.slice(2));
    return featSet.has(key.slice(2));
  }

  // =====================================================================
  // Rendering: red cross over everything marked
  // =====================================================================
  F._renderHooks = F._renderHooks || {
    layers: { floor: [], objects: [], air: [], overlay: [] },
    entityOpts: {}, minimapColors: {}, hidePlayerFns: [], altOverlayFns: [],
  };

  function cross(ctx, cam, x, y, w, h) {
    var size = F.C.TILE * (cam.zoom || 1);
    var p = cam.toScreen(x, y);
    var pw = w * size, ph = h * size;
    var m = Math.min(pw, ph) * 0.18;
    ctx.fillStyle = 'rgba(200,40,30,0.18)';
    ctx.fillRect(p[0], p[1], pw, ph);
    ctx.strokeStyle = 'rgba(255,70,50,0.9)';
    ctx.lineWidth = Math.max(1.5, size * 0.08);
    ctx.beginPath();
    ctx.moveTo(p[0] + m, p[1] + m); ctx.lineTo(p[0] + pw - m, p[1] + ph - m);
    ctx.moveTo(p[0] + pw - m, p[1] + m); ctx.lineTo(p[0] + m, p[1] + ph - m);
    ctx.stroke();
  }

  F._renderHooks.layers.overlay.push(function (ctx, rect, cam) {
    if (!F.sprites || !F.sprites.enabled || (!entSet.size && !featSet.size)) return;
    ctx.save();
    entSet.forEach(function (id) {
      var e = F.entities.byId(id);
      if (!e || e.x > rect.x1 + 1 || e.y > rect.y1 + 1 || e.x + e.w < rect.x0 - 1 || e.y + e.h < rect.y0 - 1) return;
      cross(ctx, cam, e.x, e.y, e.w, e.h);
    });
    featSet.forEach(function (k) {
      var xy = F.util.unkey(k);
      if (xy[0] < rect.x0 - 1 || xy[0] > rect.x1 + 1 || xy[1] < rect.y0 - 1 || xy[1] > rect.y1 + 1) return;
      cross(ctx, cam, xy[0], xy[1], 1, 1);
    });
    ctx.restore();
  });

  F.deconstruction = {
    mark: mark,
    unmark: unmark,
    markEntity: markEntity,
    markFeature: markFeature,
    isMarked: isMarked,
    featureMarked: featureMarked,
    targets: targets,
    deconstruct: deconstruct,
    stillMarked: stillMarked,
    count: function () { return entSet.size + featSet.size; },
  };
})();
