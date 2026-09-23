// 50-api.js — high-level actions shared by UI, input and tests.
// See design/ARCHITECTURE.md §15 (API contract) and design/GDD.md §6.2 (placement
// validity), §9.3/§9.11 (drag placing, shift/ctrl click fast-transfer semantics).
//
// This module is a thin orchestration layer: it never owns simulation state of its
// own (no F.state.api.*), it only reads/writes F.state through other modules' APIs
// (or, where ARCHITECTURE.md leaves a gap — see "local fallbacks" below — directly
// through F.state.player.inv / F.ground, exactly like those other modules would).
//
// Many modules this file calls (F.world, F.belts, F.power, F.fluids, F.player,
// F.pollution, F.combat) are defined in files that load AFTER 50-api.js in the
// build (10-world.js is before, but 30-…40-… are after — see ARCHITECTURE §1's
// load-order table: 50-api.js sits between 40-player.js and 60-sprites.js, so by
// the time F.api's functions actually RUN at game time those modules exist; but
// this file itself must not assume any of them exist at its own load time, and
// even at run time a partial build/test harness may omit one). Every call into
// another module is therefore guarded with `typeof x === 'function'` and falls
// back to a safe no-op / local implementation, per the task's "safe when a module
// is missing" rule.
(function () {
  'use strict';

  // =====================================================================
  // Local fallback constants (not present in F.C per design/00-core.js —
  // see report "assumptions"): MAP_LIMIT is only specified in GDD §2.
  // =====================================================================
  var MAP_LIMIT = 4096; // GDD §2: ±4096 tiles (128 chunks each way)

  // =====================================================================
  // Small internal helpers
  // =====================================================================

  function safeEntityDef(type) {
    if (!F.data || typeof F.data.entityDef !== 'function') return null;
    try { return F.data.entityDef(type); } catch (err) { F.log.warn('F.api: unknown entity type', type); return null; }
  }

  function safeRecipeDef(id) {
    if (!id || !F.data || typeof F.data.recipeDef !== 'function') return null;
    try { return F.data.recipeDef(id); } catch (err) { F.log.warn('F.api: unknown recipe', id); return null; }
  }

  function itemExists(id) {
    return !!(F.data && F.data.items && F.data.items[id]);
  }

  function playerInv() {
    return (F.state && F.state.player && Array.isArray(F.state.player.inv)) ? F.state.player.inv : null;
  }

  // give `count` of `id` to the player, letting F.player own the logic when it
  // exists (it may also spill to the ground when full via giveOrDrop); falls
  // back to a raw F.inv.add on the player's inventory array otherwise.
  function giveToPlayer(id, count) {
    if (!id || !(count > 0)) return 0;
    if (F.player && typeof F.player.giveOrDrop === 'function') { F.player.giveOrDrop(id, count); return count; }
    const inv = playerInv();
    if (!inv) { F.log.warn('F.api: no player inventory to give into'); return 0; }
    const leftover = F.inv.add(inv, id, count);
    if (leftover > 0) dropNearFallback(id, leftover, F.state.player.x, F.state.player.y);
    return count - leftover;
  }

  // take `count` of `id` away from the player. Returns how much was actually removed.
  function takeFromPlayer(id, count) {
    if (!id || !(count > 0)) return 0;
    if (F.player && typeof F.player.take === 'function') return F.player.take(id, count) || 0;
    const inv = playerInv();
    if (!inv) return 0;
    return F.inv.remove(inv, id, count);
  }

  function playerCount(id) {
    if (F.player && typeof F.player.count === 'function') return F.player.count(id);
    const inv = playerInv();
    return inv ? F.inv.count(inv, id) : 0;
  }

  function dropNearFallback(id, count, x, y) {
    if (!id || !(count > 0)) return;
    if (F.ground && typeof F.ground.dropNear === 'function') { F.ground.dropNear(x, y, id, count); return; }
    if (F.ground && typeof F.ground.drop === 'function') F.ground.drop(Math.round(x), Math.round(y), id, count);
  }

  // Give to the player, spilling to the ground near (x,y) for whatever doesn't fit
  // (used by F.api.remove, which knows the removed entity's position).
  function giveOrDropAt(id, count, x, y) {
    if (!id || !(count > 0)) return;
    if (F.player && typeof F.player.giveOrDrop === 'function') { F.player.giveOrDrop(id, count); return; }
    const inv = playerInv();
    if (!inv) { dropNearFallback(id, count, x, y); return; }
    const leftover = F.inv.add(inv, id, count);
    if (leftover > 0) dropNearFallback(id, leftover, x, y);
  }

  // ---------------------------------------------------------------------
  // Placement dirty-flagging: mark belts/power/fluids dirty and invalidate
  // the renderer's chunk cache after a topology-affecting change (place,
  // remove, rotate). Every sub-step is guarded — a module that has not
  // loaded yet simply contributes nothing.
  // ---------------------------------------------------------------------

  function fluidTopologyEntity(def) {
    const b = def && def.behaviour;
    return b === 'pipe' || b === 'offshore_pump' || b === 'boiler' || b === 'engine';
  }

  function powerTopologyEntity(def) {
    return !!(def && def.behaviour === 'pole');
  }

  function chunkKeysForEntity(e) {
    const out = [];
    if (!F.world || typeof F.world.chunkOf !== 'function' || typeof F.entities.tiles !== 'function') return out;
    const tiles = F.entities.tiles(e);
    const seen = Object.create(null);
    for (let i = 0; i < tiles.length; i++) {
      const co = F.world.chunkOf(tiles[i][0], tiles[i][1]);
      const k = co[0] + ',' + co[1];
      if (!seen[k]) { seen[k] = true; out.push(co); }
    }
    return out;
  }

  function afterTopologyChange(e, def) {
    def = def || safeEntityDef(e.type);
    if (!def) return;
    if (F.belts && typeof F.belts.markDirty === 'function' && typeof F.entities.tiles === 'function') {
      const tiles = F.entities.tiles(e);
      for (let i = 0; i < tiles.length; i++) {
        const tx = tiles[i][0], ty = tiles[i][1];
        F.belts.markDirty(tx, ty);
        // also nudge the 4 orthogonal neighbours so adjacent belts re-derive
        // their shape (curve/side-load) around the entity that just changed.
        for (let d = 0; d < 4; d++) {
          const v = F.C.DIRS[d];
          F.belts.markDirty(tx + v[0], ty + v[1]);
        }
      }
    }
    if (powerTopologyEntity(def) && F.power && typeof F.power.markDirty === 'function') F.power.markDirty();
    if (fluidTopologyEntity(def) && F.fluids && typeof F.fluids.markDirty === 'function') F.fluids.markDirty();
    if (F.render && typeof F.render.invalidateChunk === 'function') {
      const cks = chunkKeysForEntity(e);
      for (let i = 0; i < cks.length; i++) F.render.invalidateChunk(cks[i][0], cks[i][1]);
    }
  }

  // ---------------------------------------------------------------------
  // Placement validity helpers
  // ---------------------------------------------------------------------

  // Local fallback mirroring 32-machines.js's drillRegion()/findNextOreTile() area
  // math (not exposed on F.machines), used only to answer "is there ore here at
  // all" for canPlace — see report "assumptions".
  function drillAreaHasOre(def, tx, ty, dir) {
    if (!F.world || typeof F.world.resource !== 'function') return true; // world not loaded yet — permissive
    const area = (def.drill && def.drill.area) || 2;
    const fp = F.entities.footprint(def, dir);
    const fw = fp[0], fh = fp[1];
    const ring = Math.max(0, Math.floor((area - Math.max(fw, fh)) / 2));
    const x0 = tx - ring, y0 = ty - ring, x1 = tx + fw - 1 + ring, y1 = ty + fh - 1 + ring;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const r = F.world.resource(x, y);
        if (r && r.amount > 0) return true;
      }
    }
    return false;
  }

  // Local fallback for the offshore pump's "water in front" rule (GDD §6.10 /
  // ARCHITECTURE §10): used only when F.fluids.canPlacePump is not available.
  function pumpHasWaterInFront(tx, ty, dir) {
    if (F.fluids && typeof F.fluids.canPlacePump === 'function') return F.fluids.canPlacePump(tx, ty, dir);
    if (!F.world || typeof F.world.isWater !== 'function') return true; // world not loaded yet — permissive
    const v = F.C.DIRS[dir & 3];
    return F.world.isWater(tx + v[0], ty + v[1]) && F.world.isWater(tx + v[0] * 2, ty + v[1] * 2);
  }

  function withinReach(tx, ty, w, h) {
    if (F.player && typeof F.player.inReach === 'function') {
      return F.player.inReach(tx + (w - 1) / 2, ty + (h - 1) / 2);
    }
    if (!F.state || !F.state.player) return true; // no player yet — permissive
    const p = F.state.player;
    const nx = F.util.clamp(p.x, tx, tx + w);
    const ny = F.util.clamp(p.y, ty, ty + h);
    return F.util.dist(p.x, p.y, nx, ny) <= (F.C.REACH || 10);
  }

  function canPlace(type, tx, ty, dir, opts) {
    opts = opts || {};
    dir = (dir | 0) & 3;
    const def = safeEntityDef(type);
    if (!def) return { ok: false, reason: 'collision' };
    if (def.natural) { F.log.warn('F.api.canPlace: entity is natural, not player-placeable', type); return { ok: false, reason: 'collision' }; }
    if (Array.isArray(def.allowedDirs) && def.allowedDirs.indexOf(dir) === -1) return { ok: false, reason: 'collision' };

    const fp = F.entities.footprint(def, dir);
    const w = fp[0], h = fp[1];

    if (tx < -MAP_LIMIT || ty < -MAP_LIMIT || (tx + w - 1) > MAP_LIMIT || (ty + h - 1) > MAP_LIMIT) {
      return { ok: false, reason: 'collision' };
    }

    if (def.behaviour === 'offshore-pump' || def.behaviour === 'offshore_pump') {
      // Own footprint tile(s) must be ordinary buildable land; the water check is
      // the separate "2 tiles in front" rule via F.fluids.canPlacePump.
      if (F.world && typeof F.world.buildable === 'function') {
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
          if (!F.world.buildable(tx + i, ty + j)) return { ok: false, reason: 'collision' };
        }
      }
      if (!pumpHasWaterInFront(tx, ty, dir)) return { ok: false, reason: 'no_water' };
    } else if (F.world && typeof F.world.buildable === 'function') {
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const x = tx + i, y = ty + j;
        if (!F.world.buildable(x, y)) {
          if (typeof F.world.isWater === 'function' && F.world.isWater(x, y)) return { ok: false, reason: 'water' };
          return { ok: false, reason: 'collision' };
        }
      }
    }
    // Never build on top of the player (0.4x0.4 collision box) unless the entity is walkable (belts etc.).
    if (def.collides !== false && F.state && F.state.player && !F.state.player.dead) {
      const pl = F.state.player;
      const x0 = Math.floor(pl.x - 0.2), x1 = Math.floor(pl.x + 0.2), y0 = Math.floor(pl.y - 0.2), y1 = Math.floor(pl.y + 0.2);
      if (x1 >= tx && x0 < tx + w && y1 >= ty && y0 < ty + h) return { ok: false, reason: 'collision' };
    }

    if (def.behaviour === 'drill' && !drillAreaHasOre(def, tx, ty, dir)) {
      return { ok: false, reason: 'no_resource' };
    }

    if (F.fluids && typeof F.fluids.canConnect === 'function' && !F.fluids.canConnect(type, tx, ty, dir)) {
      return { ok: false, reason: 'fluid_mix' };
    }

    if (opts.checkReach && !withinReach(tx, ty, w, h)) {
      return { ok: false, reason: 'out_of_reach' };
    }

    return { ok: true, reason: null };
  }

  // ---------------------------------------------------------------------
  // place / remove / rotate
  // ---------------------------------------------------------------------

  function place(type, tx, ty, dir, opts) {
    opts = opts || {};
    dir = (dir | 0) & 3;
    const chk = canPlace(type, tx, ty, dir, opts);
    if (!chk.ok) return null;

    const def = safeEntityDef(type); // re-fetched but cheap; canPlace already validated it exists
    const itemId = (def && def.minable) || type;

    if (opts.fromInventory) {
      if (takeFromPlayer(itemId, 1) < 1) { F.log.warn('F.api.place: no', itemId, 'in inventory'); return null; }
    }

    const e = F.entities.create(type, tx, ty, dir);
    if (!e) {
      if (opts.fromInventory) giveToPlayer(itemId, 1); // roll back the consumed item
      return null;
    }
    afterTopologyChange(e, def);
    return e;
  }

  function remove(tx, ty, opts) {
    opts = opts || {};
    const toInventory = opts.toInventory !== false; // default true per ARCHITECTURE §15
    if (!F.world || typeof F.world.entityAt !== 'function') { F.log.warn('F.api.remove: F.world not available'); return false; }
    const e = F.world.entityAt(tx, ty);
    if (!e) return false;
    const def = safeEntityDef(e.type);
    if (!def) return false;
    if (def.natural) { F.log.warn('F.api.remove: cannot remove a natural entity', e.type); return false; }

    // Some behaviours (furnace/assembler/drill/inserter/lab) already move their
    // own contents to ground or to the player inside their onRemove() — which
    // F.entities.remove() calls unconditionally regardless of the `dropItems`
    // option. To avoid double-handling those items we only take responsibility
    // for contents ourselves when the behaviour defines no onRemove() at all
    // (e.g. chests) — see report "assumptions" for the P1 gap this leaves
    // (furnace/assembler/drill contents always land on the ground, never in the
    // player's inventory, because their onRemove() hardcodes F.ground).
    const beh = F.behaviours[def.behaviour];
    const behHandlesContents = !!(beh && typeof beh.onRemove === 'function');
    let contents = null;
    if (!behHandlesContents) {
      try { contents = F.entities.contents(e); } catch (err) { contents = []; }
    }

    const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
    const itemId = def.minable;

    const ok = F.entities.remove(e, { dropItems: false });
    if (!ok) return false;

    if (contents) {
      for (let i = 0; i < contents.length; i++) {
        const id = contents[i][0], count = contents[i][1];
        if (!id || !count) continue;
        if (toInventory) giveOrDropAt(id, count, cx, cy); else dropNearFallback(id, count, cx, cy);
      }
    }
    if (itemId) {
      if (toInventory) giveOrDropAt(itemId, 1, cx, cy); else dropNearFallback(itemId, 1, cx, cy);
    }

    afterTopologyChange(e, def);
    return true;
  }

  function nextDirFor(def, cur) {
    if (Array.isArray(def.allowedDirs) && def.allowedDirs.length) {
      const idx = def.allowedDirs.indexOf(cur);
      const ni = (idx === -1) ? 0 : (idx + 1) % def.allowedDirs.length;
      return def.allowedDirs[ni];
    }
    return (cur + 1) & 3;
  }

  function rotate(tx, ty) {
    if (!F.world || typeof F.world.entityAt !== 'function') { F.log.warn('F.api.rotate: F.world not available'); return false; }
    const e = F.world.entityAt(tx, ty);
    if (!e) return false;
    const def = safeEntityDef(e.type);
    if (!def || !def.rotatable) return false;

    const newDir = nextDirFor(def, e.dir);
    if (newDir === e.dir) return false;
    const newFp = F.entities.footprint(def, newDir);

    const canSetTiles = F.world && typeof F.world.setEntityTiles === 'function';
    if (canSetTiles) F.world.setEntityTiles(e, false); // free old tiles so self-collision doesn't block the check

    let blocked = false;
    if (F.world && typeof F.world.buildable === 'function' && (newFp[0] !== e.w || newFp[1] !== e.h)) {
      for (let j = 0; j < newFp[1] && !blocked; j++) {
        for (let i = 0; i < newFp[0] && !blocked; i++) {
          if (!F.world.buildable(e.x + i, e.y + j)) blocked = true;
        }
      }
    }
    if (blocked) {
      if (canSetTiles) F.world.setEntityTiles(e, true); // restore old footprint, unchanged
      return false;
    }

    e.dir = newDir;
    e.w = newFp[0];
    e.h = newFp[1];
    if (canSetTiles) F.world.setEntityTiles(e, true);

    afterTopologyChange(e, def);
    F.events.emit('entity:placed', e); // closest documented event for "shape/orientation changed"; UI refresh hook
    return true;
  }

  // ---------------------------------------------------------------------
  // give / inventoryCount / entityAt / teleport / findResource
  // ---------------------------------------------------------------------

  function give(id, count) {
    if (!id || !(count > 0)) return count || 0;
    if (F.player && typeof F.player.give === 'function') return F.player.give(id, count);
    const inv = playerInv();
    if (!inv) { F.log.warn('F.api.give: no player inventory'); return count; }
    return F.inv.add(inv, id, count);
  }

  function inventoryCount(id) { return playerCount(id); }

  function entityAt(tx, ty) {
    return (F.world && typeof F.world.entityAt === 'function') ? F.world.entityAt(tx, ty) : null;
  }

  function teleport(x, y) {
    if (!F.state || !F.state.player) { F.log.warn('F.api.teleport: no player state'); return false; }
    F.state.player.x = x;
    F.state.player.y = y;
    return true;
  }

  function findResource(item, radius) {
    radius = (radius == null) ? 200 : radius;
    if (!F.world || typeof F.world.findResourceNear !== 'function' || !F.world.spawn) {
      F.log.warn('F.api.findResource: F.world not available'); return null;
    }
    const sp = F.world.spawn;
    const r = F.world.findResourceNear(item, sp.x, sp.y, radius);
    return r ? { x: r.x, y: r.y } : null;
  }

  // ---------------------------------------------------------------------
  // setRecipe / insertInto
  // ---------------------------------------------------------------------

  function setRecipe(entity, id) {
    if (!entity) return false;
    if (F.machines && typeof F.machines.setRecipe === 'function') return F.machines.setRecipe(entity, id);
    F.log.warn('F.api.setRecipe: F.machines not available'); return false;
  }

  // Picks the inventory GROUP (from F.entities.inventories(entity)) that best
  // matches `item`'s kind, per the fuel/input/ammo/else-main rule the task
  // spells out for both insertInto's fallback and transferStack. Shared here so
  // the two stay consistent.
  function pickInvGroupForItem(entity, item) {
    const groups = (F.entities && typeof F.entities.inventories === 'function') ? F.entities.inventories(entity) : [];
    if (!groups || !groups.length) return null;
    const idef = F.data && F.data.items && F.data.items[item];
    let wantName = 'main';
    if (idef && idef.fuel > 0) {
      wantName = 'fuel';
    } else if (idef && idef.ammo) {
      wantName = 'ammo';
    } else {
      let isIngredient = false;
      if (F.data && typeof F.data.smeltingFor === 'function') isIngredient = !!F.data.smeltingFor(item);
      if (!isIngredient && entity.recipe) {
        const rdef = safeRecipeDef(entity.recipe);
        if (rdef) isIngredient = rdef.ingredients.some(function (ing) { return ing[0] === item; });
      }
      if (isIngredient) wantName = 'input';
    }
    let grp = null;
    for (let i = 0; i < groups.length; i++) if (groups[i] && groups[i].name === wantName) { grp = groups[i]; break; }
    if (!grp) for (let i = 0; i < groups.length; i++) if (groups[i] && groups[i].name === 'main') { grp = groups[i]; break; }
    if (!grp) grp = groups[0];
    return grp;
  }

  function forceInsertByKind(entity, item, count) {
    const grp = pickInvGroupForItem(entity, item);
    if (!grp || !grp.inv) return 0;
    const ignoreStack = grp.name !== 'main';
    const leftover = F.inv.add(grp.inv, item, count, ignoreStack ? { ignoreStack: true } : undefined);
    return count - leftover;
  }

  function insertInto(entity, item, count) {
    if (!entity || entity._removed) return 0;
    if (!itemExists(item)) { F.log.warn('F.api.insertInto: unknown item', item); return 0; }
    if (!(count > 0)) return 0;
    const def = safeEntityDef(entity.type);
    if (!def) return 0;
    const beh = F.behaviours[def.behaviour];
    if (beh && typeof beh.insert === 'function') {
      let n = 0;
      try { n = beh.insert(entity, item, count, { manual: true }); } catch (err) { F.log.error('F.api.insertInto', entity.type, err); n = 0; }
      return (typeof n === 'number' && n > 0) ? n : 0;
    }
    return forceInsertByKind(entity, item, count);
  }

  // ---------------------------------------------------------------------
  // craft / research / chunkPollution / stats
  // ---------------------------------------------------------------------

  function craft(recipeId, n) {
    if (F.player && typeof F.player.enqueue === 'function') return !!F.player.enqueue(recipeId, n);
    F.log.warn('F.api.craft: F.player not available'); return false;
  }

  function research(techId) {
    if (F.research && typeof F.research.start === 'function') return !!F.research.start(techId);
    F.log.warn('F.api.research: F.research not available'); return false;
  }

  function chunkPollution(cx, cy) {
    return (F.pollution && typeof F.pollution.chunkValue === 'function') ? F.pollution.chunkValue(cx, cy) : 0;
  }

  function stats() {
    let entC = 0;
    if (F.entities && typeof F.entities.stats === 'function') {
      try { entC = F.entities.stats().count; } catch (err) { entC = 0; }
    } else if (F.state && F.state.entities) {
      entC = F.state.entities.length;
    }
    const units = (F.state && Array.isArray(F.state.units)) ? F.state.units.length : 0;
    let spawners = 0;
    if (F.entities && typeof F.entities.ofType === 'function') {
      try { spawners = F.entities.ofType('biter-spawner').length; } catch (err) { spawners = 0; }
    }
    let beltItems = 0;
    if (F.belts && typeof F.belts.count === 'function' && typeof F.belts.isBeltLike === 'function' &&
        F.entities && typeof F.entities.all === 'function') {
      const all = F.entities.all();
      for (let i = 0; i < all.length; i++) {
        const e = all[i];
        if (e && !e._removed && F.belts.isBeltLike(e)) { try { beltItems += F.belts.count(e); } catch (err) { /* ignore */ } }
      }
    }
    const tick = (F.state && F.state.tick) || 0;
    let researchDone = 0;
    if (F.state && F.state.research && F.state.research.done) researchDone = Object.keys(F.state.research.done).length;
    return { entities: entC, units: units, spawners: spawners, beltItems: beltItems, tick: tick, researchDone: researchDone };
  }

  // ---------------------------------------------------------------------
  // placeLine — drag-placing helper (GDD §9.11). Not exercised by the test
  // suite; implemented as a straightforward Bresenham walk along the given
  // (tx0,ty0)-(tx1,ty1) segment, placing `type` (facing the single supplied
  // `dir` — no per-segment auto-turning, since that is 75-input.js's job of
  // slicing a mouse path into straight sub-segments and calling this once per
  // segment with the right `dir`) at every tile, skipping tiles that already
  // hold the same type+dir (no re-consumption) and tiles where canPlace fails
  // (an obstacle interrupts the drag but does not abort it, per GDD §9.11
  // "other entities place wherever the footprint fits along the path"),
  // stopping the whole walk as soon as the player's inventory of the item runs
  // out. Poles are spaced out at roughly their wire reach instead of one per
  // tile (GDD §9.11 "poles auto-place at maximum wire reach") — see report
  // "assumptions" for this simplification.
  // ---------------------------------------------------------------------

  function linePoints(x0, y0, x1, y1) {
    const pts = [];
    const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    let x = x0, y = y0;
    let guard = 0;
    while (guard++ < 100000) {
      pts.push([x, y]);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x += sx; }
      if (e2 <= dx) { err += dx; y += sy; }
    }
    return pts;
  }

  function placeLine(type, tx0, ty0, tx1, ty1, dir) {
    const def = safeEntityDef(type);
    if (!def) return [];
    const itemId = def.minable || type;
    const pts = linePoints(tx0 | 0, ty0 | 0, tx1 | 0, ty1 | 0);
    const placed = [];
    const isPole = !!def.pole;
    const step = isPole ? Math.max(1, Math.floor((def.pole.reach || 1) * 0.9)) : 1;

    for (let i = 0; i < pts.length; i++) {
      if (isPole && (i % step) !== 0 && i !== pts.length - 1) continue;
      if (inventoryCount(itemId) <= 0) break; // stops the drag entirely once out of items
      const tx = pts[i][0], ty = pts[i][1];
      const existing = entityAt(tx, ty);
      if (existing && existing.type === type && existing.dir === (dir & 3)) continue; // already there
      const chk = canPlace(type, tx, ty, dir);
      if (!chk.ok) continue; // obstacle — skip, keep dragging
      const e = place(type, tx, ty, dir, { fromInventory: true });
      if (e) placed.push(e);
    }
    return placed;
  }

  // ---------------------------------------------------------------------
  // transferStack — GDD §9.3 shift-click / ctrl-click semantics between the
  // player's inventory and an open entity's inventory. `target` is either the
  // sentinel string 'player' (or the live F.state.player object) to move
  // TOWARDS the player, or an entity object to move TOWARDS that entity (the
  // matching sub-inventory — fuel/input/ammo/main — is chosen automatically
  // from the item's kind via pickInvGroupForItem, same rule as insertInto's
  // fallback). `opts.all` = true implements ctrl-click ("move all items of
  // that type"); default/false implements shift-click ("move the whole
  // stack"). See report "assumptions" for the extra `opts` 4th parameter,
  // which ARCHITECTURE.md's short signature `(fromInv, index, toEntityOrPlayer)`
  // does not show but the task text's shift/ctrl-click requirement needs.
  // ---------------------------------------------------------------------

  function isPlayerTarget(t) {
    return t === 'player' || (F.state && F.state.player && t === F.state.player);
  }

  function transferItems(fromInv, toInv, id, want, ignoreStack) {
    if (want <= 0) return 0;
    const avail = F.inv.count(fromInv, id);
    const clamped = Math.min(want, avail);
    if (clamped <= 0) return 0;
    const leftover = F.inv.add(toInv, id, clamped, ignoreStack ? { ignoreStack: true } : undefined);
    const added = clamped - leftover;
    if (added > 0) F.inv.remove(fromInv, id, added);
    return added;
  }

  function transferStack(fromInv, index, target, opts) {
    opts = opts || {};
    if (!Array.isArray(fromInv) || index == null || index < 0 || index >= fromInv.length) return 0;
    const slot = fromInv[index];
    if (!slot || !slot.id) return 0;
    const item = slot.id;
    const wantCount = opts.all ? F.inv.count(fromInv, item) : slot.count;

    let toInv = null, ignoreStack = false;
    if (isPlayerTarget(target)) {
      toInv = playerInv();
      if (!toInv) { F.log.warn('F.api.transferStack: player inventory unavailable'); return 0; }
    } else if (target && target.type) {
      const grp = pickInvGroupForItem(target, item);
      if (!grp || !grp.inv) { F.log.warn('F.api.transferStack: no matching inventory on', target.type, 'for', item); return 0; }
      toInv = grp.inv;
      ignoreStack = grp.name !== 'main';
    } else {
      F.log.warn('F.api.transferStack: invalid target'); return 0;
    }

    const moved = transferItems(fromInv, toInv, item, wantCount, ignoreStack);
    if (moved > 0) F.events.emit('inventory:changed', { item: item, count: moved });
    return moved;
  }

  // ---------------------------------------------------------------------
  // cheat — dev helpers (also used by tests per ARCHITECTURE §15).
  // ---------------------------------------------------------------------

  function unlockAll() {
    if (!F.data || !F.data.techs) { F.log.warn('F.api.cheat.unlockAll: F.data not available'); return; }
    if (!F.state) { F.log.warn('F.api.cheat.unlockAll: no active game'); return; }
    if (!F.state.research) F.state.research = {};
    const r = F.state.research;
    if (!r.done) r.done = {};
    for (const id in F.data.techs) if (Object.prototype.hasOwnProperty.call(F.data.techs, id)) r.done[id] = true;
    r.current = null;
    r.queue = [];
    r.unitsDone = 0;
    r.unitProgress = 0;
    F.log.info('[cheat] unlockAll: every technology marked done');
  }

  // Not part of GDD §4's balanced starting inventory — a generous developer kit
  // covering one of every early-game building so a fresh save can be tested by
  // hand quickly. See report "assumptions".
  var STARTER_KIT = [
    ['iron-plate', 100], ['copper-plate', 100], ['stone', 50], ['coal', 100], ['wood', 20],
    ['iron-gear-wheel', 50], ['copper-cable', 50], ['electronic-circuit', 50], ['iron-stick', 20], ['pipe', 30],
    ['transport-belt', 50], ['underground-belt', 10], ['splitter', 5],
    ['burner-inserter', 20], ['inserter', 20], ['long-handed-inserter', 5], ['fast-inserter', 5],
    ['stone-furnace', 10], ['steel-furnace', 4],
    ['burner-mining-drill', 5], ['electric-mining-drill', 5],
    ['assembling-machine-1', 5], ['assembling-machine-2', 2], ['lab', 2],
    ['small-electric-pole', 30], ['medium-electric-pole', 10],
    ['offshore-pump', 2], ['boiler', 4], ['steam-engine', 8], ['solar-panel', 10], ['accumulator', 10],
    ['wooden-chest', 10], ['iron-chest', 10], ['steel-chest', 5],
    ['automation-science-pack', 100], ['logistic-science-pack', 100],
    // pistol/submachine-gun/firearm-magazine/piercing-rounds-magazine/gun-turret/
    // stone-wall/repair-pack removed (F.FEATURES.combat off) — see src/disabled/README.md.
    ['radar', 2], ['small-lamp', 20],
  ];

  function giveStarterBase() {
    for (let i = 0; i < STARTER_KIT.length; i++) give(STARTER_KIT[i][0], STARTER_KIT[i][1]);
    F.log.info('[cheat] giveStarterBase: starter kit added to inventory');
  }

  // =====================================================================
  // Public API (design/ARCHITECTURE.md §15)
  // =====================================================================
  F.api = {
    canPlace: canPlace,
    place: place,
    remove: remove,
    rotate: rotate,
    give: give,
    inventoryCount: inventoryCount,
    entityAt: entityAt,
    teleport: teleport,
    findResource: findResource,
    setRecipe: setRecipe,
    insertInto: insertInto,
    craft: craft,
    research: research,
    chunkPollution: chunkPollution,
    stats: stats,
    placeLine: placeLine,
    transferStack: transferStack,
    cheat: {
      unlockAll: unlockAll,
      giveStarterBase: giveStarterBase,
    },
  };

  // No i18n keys registered here: F.api has no user-facing text of its own —
  // canPlace()'s `reason` codes and status strings are consumed and translated
  // by 70-ui.js (their key names are fixed by the enum in ARCHITECTURE §15 /
  // GDD §6.2, not chosen by this module).
})();
