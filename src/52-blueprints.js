// 52-blueprints.js — blueprints: a copied area of buildings (and ghosts) that can be
// rotated and pasted elsewhere as ghosts (see 51-ghosts.js), then built by hand.
//
// A blueprint is plain JSON:
//   { w, h, entities: [{ type, x, y, dir, settings? }] }
// x/y are the entity's top-left tile relative to the blueprint's top-left, w/h the size
// of the bounding box of all entities. `settings` is F.ghosts.captureSettings() output
// (recipe, filters, requester slots, underground role, ...). Entities are sorted rails
// first, then top-to-bottom, left-to-right, so pasting is deterministic and planned rails
// exist before the train stops next to them.
//
// F.blueprints:
//   create(x0, y0, x1, y1) -> blueprint | null   copy every player-built entity and ghost
//                                                 touching the tile rect (inclusive)
//   rotate(bp, turns=1) -> new blueprint          90° clockwise per turn (negative = ccw;
//                                                 0 = just a normalised copy)
//   check(bp, ox, oy) -> [bool]                   per entity: can it be planned at offset?
//   place(bp, ox, oy) -> { placed, existing, blocked }   plan ghosts with the top-left at
//                                                 (ox, oy); an identical real building
//                                                 already there counts as `existing`
//   count(bp) -> { itemId: n }                    items needed to build it
//   clipboard() / setClipboard(bp)                last copied blueprint, kept in the save
//                                                 (F.state.blueprints.clipboard)
//
// The copy tool and paste cursor live in 75-input.js (F.input.selecting / F.input.blueprint);
// this file draws them via an 'air' render layer. Headless safe.
(function () {
  'use strict';

  F.i18n.add('en', {
    'bp.empty': 'Nothing to copy here',
    'bp.copied': 'Copied {n} buildings — click to place, R to rotate, Q to drop',
    'bp.placed': 'Planned {n} ghosts',
    'bp.blocked': '{n} could not be placed',
    'bp.no_clipboard': 'Nothing copied yet (Ctrl+C or B, then drag over buildings)',
  });

  // =====================================================================
  // State
  // =====================================================================
  function store() {
    if (!F.state) return null;
    var s = F.state.blueprints;
    if (!s || typeof s !== 'object') s = F.state.blueprints = { clipboard: null };
    return s;
  }

  F.game = F.game || {};
  (F.game._onNewGame = F.game._onNewGame || []).push(function () { F.state.blueprints = { clipboard: null }; });
  (F.game._onRebuild = F.game._onRebuild || []).push(function () {
    var s = store();
    if (s && s.clipboard) s.clipboard = sanitize(s.clipboard);
  });

  // Drop entries whose entity type no longer exists (old saves); null when nothing is left.
  function sanitize(bp) {
    if (!bp || !Array.isArray(bp.entities)) return null;
    var list = bp.entities.filter(function (en) { return en && placeable(en.type); });
    if (!list.length) return null;
    return normalise(list.map(function (en) { return { type: en.type, x: en.x | 0, y: en.y | 0, dir: (en.dir | 0) & 3, settings: en.settings || null }; }));
  }

  function clipboard() { var s = store(); return s ? s.clipboard : null; }
  function setClipboard(bp) { var s = store(); if (s) s.clipboard = bp ? clone(bp) : null; }

  // =====================================================================
  // Helpers
  // =====================================================================
  function clone(v) { return JSON.parse(JSON.stringify(v)); }

  function placeable(type) {
    var def = F.data.entities[type];
    if (!def || def.natural || !def.minable) return false;
    var item = F.data.items[def.minable];
    return !!(item && item.place === type);
  }

  function footprint(type, dir) { return F.entities.footprint(F.data.entities[type], dir & 3); }

  function isFloor(type) { var d = F.data.entities[type]; return !!(d && d.layer === 'floor'); }

  // Shift entries so the bounding box starts at 0,0, sort them, and compute w/h.
  function normalise(list) {
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (var i = 0; i < list.length; i++) {
      var en = list[i], fp = footprint(en.type, en.dir);
      if (en.x < minX) minX = en.x;
      if (en.y < minY) minY = en.y;
      if (en.x + fp[0] - 1 > maxX) maxX = en.x + fp[0] - 1;
      if (en.y + fp[1] - 1 > maxY) maxY = en.y + fp[1] - 1;
    }
    var out = list.map(function (en) {
      var o = { type: en.type, x: en.x - minX, y: en.y - minY, dir: en.dir & 3 };
      if (en.settings) o.settings = clone(en.settings);
      return o;
    });
    out.sort(function (a, b) {
      var fa = isFloor(a.type) ? 0 : 1, fb = isFloor(b.type) ? 0 : 1;
      return (fa - fb) || (a.y - b.y) || (a.x - b.x);
    });
    return { w: maxX - minX + 1, h: maxY - minY + 1, entities: out };
  }

  // =====================================================================
  // create / rotate
  // =====================================================================
  function create(x0, y0, x1, y1) {
    var ax = Math.min(x0, x1), bx = Math.max(x0, x1), ay = Math.min(y0, y1), by = Math.max(y0, y1);
    var list = [];
    var ents = F.entities.all();
    for (var i = 0; i < ents.length; i++) {
      var e = ents[i];
      if (!e || e._removed || !placeable(e.type)) continue;
      if (e.x > bx || e.y > by || e.x + e.w - 1 < ax || e.y + e.h - 1 < ay) continue;
      list.push({ type: e.type, x: e.x, y: e.y, dir: e.dir & 3, settings: F.ghosts.captureSettings(e) });
    }
    var gs = F.ghosts.inRect(ax, ay, bx, by);
    for (var j = 0; j < gs.length; j++) {
      var g = gs[j];
      list.push({ type: g.type, x: g.x, y: g.y, dir: g.dir & 3, settings: g.settings || null });
    }
    if (!list.length) return null;
    return normalise(list);
  }

  // Direction after turning an entity clockwise `turns` times, respecting allowedDirs
  // (a steam engine only has N/E: S and W look the same, so they fold onto them).
  function turnDir(type, dir, turns) {
    var def = F.data.entities[type];
    if (!def.rotatable) return 0;
    var d = (dir + turns) & 3;
    if (Array.isArray(def.allowedDirs) && def.allowedDirs.indexOf(d) < 0) {
      d = def.allowedDirs.indexOf(d & 1) >= 0 ? (d & 1) : def.allowedDirs[0];
    }
    return d;
  }

  function rotate(bp, turns) {
    turns = (((turns == null ? 1 : turns) % 4) + 4) % 4;
    var cur = normalise(bp.entities);
    for (var t = 0; t < turns; t++) {
      var H = cur.h;
      var list = cur.entities.map(function (en) {
        var fp = footprint(en.type, en.dir);
        // A tile (x, y) moves to (H-1-y, x); the entity's new top-left follows from its
        // footprint. Non-rotatable entities are all square, so their footprint is unchanged.
        return { type: en.type, x: H - en.y - fp[1], y: en.x, dir: turnDir(en.type, en.dir, 1), settings: en.settings || null };
      });
      cur = normalise(list);
    }
    return cur;
  }

  // =====================================================================
  // check / place
  // =====================================================================
  function existingMatch(en, tx, ty) {
    var e = F.world.entityAt(tx, ty);
    return !!(e && !e._removed && e.type === en.type && e.x === tx && e.y === ty && (e.dir & 3) === (en.dir & 3));
  }

  function check(bp, ox, oy) {
    var out = [];
    if (!bp) return out;
    var rails = null;
    for (var i = 0; i < bp.entities.length; i++) {
      var en = bp.entities[i], tx = ox + en.x, ty = oy + en.y;
      if (existingMatch(en, tx, ty)) { out.push(true); continue; }
      var chk = F.ghosts.canPlace(en.type, tx, ty, en.dir);
      if (!chk.ok && chk.reason === 'no_rail') {
        // The blueprint's own rails are planned first when pasting (see normalise()).
        if (!rails) rails = railTiles(bp);
        chk = { ok: nextToRail(rails, en.x, en.y) };
      }
      out.push(!!chk.ok);
    }
    return out;
  }

  function railTiles(bp) {
    var set = Object.create(null);
    for (var i = 0; i < bp.entities.length; i++) {
      var d = F.data.entities[bp.entities[i].type];
      if (d && d.behaviour === 'rail') set[bp.entities[i].x + ',' + bp.entities[i].y] = true;
    }
    return set;
  }

  function nextToRail(set, x, y) {
    for (var d = 0; d < 4; d++) {
      var v = F.C.DIRS[d];
      if (set[(x + v[0]) + ',' + (y + v[1])]) return true;
    }
    return false;
  }

  function place(bp, ox, oy) {
    var res = { placed: 0, existing: 0, blocked: 0 };
    if (!bp) return res;
    // Earlier entries of this paste must not be replaced by later overlapping ones.
    var own = Object.create(null);
    for (var i = 0; i < bp.entities.length; i++) {
      var en = bp.entities[i], tx = ox + en.x, ty = oy + en.y;
      if (existingMatch(en, tx, ty)) { res.existing++; continue; }
      if (overlapsOwn(en, tx, ty, own)) { res.blocked++; continue; }
      var g = F.ghosts.place(en.type, tx, ty, en.dir, en.settings || null);
      if (g) { own[g.id] = true; res.placed++; } else res.blocked++;
    }
    return res;
  }

  function overlapsOwn(en, tx, ty, own) {
    var fp = footprint(en.type, en.dir);
    for (var j = 0; j < fp[1]; j++) for (var i = 0; i < fp[0]; i++) {
      var g = F.ghosts.at(tx + i, ty + j);
      if (g && own[g.id]) return true;
    }
    return false;
  }

  function count(bp) {
    var out = {};
    if (!bp) return out;
    for (var i = 0; i < bp.entities.length; i++) {
      var item = F.ghosts.itemFor(bp.entities[i].type);
      out[item] = (out[item] || 0) + 1;
    }
    return out;
  }

  // =====================================================================
  // Rendering: copy-tool selection box and the paste preview (browser only)
  // =====================================================================
  var checkCache = { bp: null, key: '', frame: 0, result: [] };
  var frameNo = 0;

  function cachedCheck(bp, ox, oy) {
    frameNo++;
    var k = ox + ',' + oy;
    // Re-validate when the cursor moves, the blueprint changes, or twice a second anyway
    // (the world under a still cursor can change too).
    if (checkCache.bp !== bp || checkCache.key !== k || frameNo - checkCache.frame > 30) {
      checkCache.bp = bp; checkCache.key = k; checkCache.frame = frameNo;
      checkCache.result = check(bp, ox, oy);
    }
    return checkCache.result;
  }

  F._renderHooks = F._renderHooks || {
    layers: { floor: [], objects: [], air: [], overlay: [] },
    entityOpts: {}, minimapColors: {}, hidePlayerFns: [], altOverlayFns: [],
  };

  F._renderHooks.layers.air.push(function (ctx, rect, cam) {
    if (!F.sprites || !F.sprites.enabled || !F.input) return;
    var size = F.C.TILE * (cam.zoom || 1);

    var sel = F.input.selecting;
    if (sel) {
      var c = F.input.worldCursor();
      var a = sel.start || c, b = sel.start ? (sel.end || c) : c;
      var x0 = Math.min(a[0], b[0]), y0 = Math.min(a[1], b[1]);
      var x1 = Math.max(a[0], b[0]) + 1, y1 = Math.max(a[1], b[1]) + 1;
      var p0 = cam.toScreen(x0, y0), p1 = cam.toScreen(x1, y1);
      // Copy: blue. Cut (copy + deconstruct): orange. Deconstruction planner: red, or green
      // while Shift is held (cancels marks).
      var col = sel.mode === 'decon' ? (sel.unmark ? [110, 220, 120] : [255, 90, 70]) : sel.mode === 'cut' ? [255, 170, 70] : [120, 200, 255];
      var rgba = function (a) { return 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',' + a + ')'; };
      ctx.save();
      if (sel.start) {
        // Outline everything the box would affect.
        ctx.strokeStyle = rgba(0.9);
        ctx.lineWidth = 2;
        var ents = F.entities.all();
        for (var i = 0; i < ents.length; i++) {
          var e = ents[i];
          if (!e || e._removed || !placeable(e.type)) continue;
          if (e.x >= x1 || e.y >= y1 || e.x + e.w <= x0 || e.y + e.h <= y0) continue;
          var q = cam.toScreen(e.x, e.y);
          ctx.strokeRect(q[0] + 2, q[1] + 2, e.w * size - 4, e.h * size - 4);
        }
        if (sel.mode === 'decon' && (x1 - x0) * (y1 - y0) <= 40000) {
          for (var fy = Math.max(y0, rect.y0 - 1); fy < Math.min(y1, rect.y1 + 2); fy++) {
            for (var fx = Math.max(x0, rect.x0 - 1); fx < Math.min(x1, rect.x1 + 2); fx++) {
              if (!F.world.feature(fx, fy)) continue;
              var fq = cam.toScreen(fx, fy);
              ctx.strokeRect(fq[0] + 3, fq[1] + 3, size - 6, size - 6);
            }
          }
        }
        ctx.fillStyle = rgba(0.12);
        ctx.fillRect(p0[0], p0[1], p1[0] - p0[0], p1[1] - p0[1]);
      }
      ctx.strokeStyle = rgba(1);
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(p0[0], p0[1], p1[0] - p0[0], p1[1] - p0[1]);
      ctx.restore();
      return;
    }

    var held = F.input.blueprint;
    if (held && held.bp && F.input.blueprintAnchor) {
      var ox = F.input.blueprintAnchor[0], oy = F.input.blueprintAnchor[1];
      var ok = cachedCheck(held.bp, ox, oy);
      for (var k = 0; k < held.bp.entities.length; k++) {
        var en = held.bp.entities[k];
        F.ghosts.drawSprite(ctx, cam, en.type, en.dir, ox + en.x, oy + en.y, en.settings, !ok[k]);
      }
    }
  });

  F.blueprints = {
    create: create,
    rotate: rotate,
    check: check,
    place: place,
    count: count,
    clipboard: clipboard,
    setClipboard: setClipboard,
  };
})();
