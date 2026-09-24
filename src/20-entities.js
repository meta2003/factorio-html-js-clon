// 20-entities.js — entity lifecycle, inventories, ground items, damage/health.
// See design/ARCHITECTURE.md §6 (contract), GDD.md §6.2 (data model), §6.3 (chests),
// §6.23 (ground items), §7.10 (combat resolution / death), §3 (player pickup / corpse).
//
// Defines: F.entities, F.behaviours (registry + 'chest'/'corpse'/'static' entries), F.inv, F.ground.
(function () {
  'use strict';

  // =====================================================================
  // Runtime caches (NOT part of F.state — rebuilt by F.entities.rebuild()
  // after F.load(); also kept in sync incrementally by create()/remove()).
  // =====================================================================
  const byId = new Map();          // id -> entity
  const typeCache = new Map();     // type -> live array of entities (excludes _removed)
  const pendingRemovals = [];      // entities marked _removed, awaiting flushRemovals()

  // ---------------------------------------------------------------------
  // Small internal helpers
  // ---------------------------------------------------------------------

  // footprint(def, dir) -> [w,h]. def.size is given for dir=0 (north);
  // for dir 1 (E) or 3 (W) the footprint swaps to [h,w] (GDD §6.2 note under table).
  function footprint(def, dir) {
    if (!def || !def.size) return [1, 1];
    const w = def.size[0], h = def.size[1];
    return (dir & 1) ? [h, w] : [w, h];
  }

  // Tile n steps beyond the footprint edge in world direction `dir`, centred
  // on the perpendicular axis. For a 1x1 entity this reduces to x+dx*n, y+dy*n.
  // For even widths the centre column is x + floor((w-1)/2) (biased to the
  // lower-index side), matching the burner drill's left-column output and the
  // electric drill's true-centre column from GDD §6.13.
  function edgeTile(e, dir, n) {
    const v = F.C.DIRS[dir & 3];
    const dx = v[0], dy = v[1];
    if (dx !== 0) {
      const fx = e.x + (dx > 0 ? (e.w - 1 + n) : -n);
      const fy = e.y + Math.floor((e.h - 1) / 2);
      return [fx, fy];
    }
    const fy = e.y + (dy > 0 ? (e.h - 1 + n) : -n);
    const fx = e.x + Math.floor((e.w - 1) / 2);
    return [fx, fy];
  }

  function tilesOf(e) {
    const out = [];
    for (let j = 0; j < e.h; j++) for (let i = 0; i < e.w; i++) out.push([e.x + i, e.y + j]);
    return out;
  }

  function centerOf(e) {
    return [e.x + e.w / 2, e.y + e.h / 2];
  }

  function behaviourFor(def) {
    if (!def) return F.behaviours.static;
    return F.behaviours[def.behaviour] || F.behaviours.static;
  }

  function ensureNextId() {
    if (!F.state) return 1;
    if (!F.state.nextId) F.state.nextId = 1;
    return F.state.nextId;
  }

  // Register an entity into the runtime caches + world tile map.
  function registerEntity(e) {
    byId.set(e.id, e);
    const arr = typeCache.get(e.type);
    if (arr) arr.push(e);
    if (F.world && F.world.setEntityTiles) {
      try { F.world.setEntityTiles(e, true); } catch (err) { F.log.error('F.world.setEntityTiles(place)', err); }
    }
  }

  // Unregister from caches + world tile map (tiles are freed immediately even
  // though the dense F.state.entities array splice is deferred to flushRemovals()).
  function unregisterEntity(e) {
    byId.delete(e.id);
    const arr = typeCache.get(e.type);
    if (arr) { const i = arr.indexOf(e); if (i >= 0) arr.splice(i, 1); }
    if (F.world && F.world.setEntityTiles) {
      try { F.world.setEntityTiles(e, false); } catch (err) { F.log.error('F.world.setEntityTiles(remove)', err); }
    }
  }

  // Shared tail of remove()/destroyEntity(): unregister, flag, queue for flush,
  // emit the removal event. Callers add their own extra side effects afterwards.
  function finishRemoval(e) {
    unregisterEntity(e);
    e._removed = true;
    pendingRemovals.push(e);
    F.events.emit('entity:removed', e);
  }

  // =====================================================================
  // F.entities
  // =====================================================================
  const entities = {};

  entities.create = function (type, tx, ty, dir) {
    dir = (dir || 0) & 3;
    if (!F.data || !F.data.entities) { F.log.error('F.entities.create: F.data.entities not loaded'); return null; }
    const def = F.data.entities[type];
    if (!def) { F.log.warn('F.entities.create: unknown entity type', type); return null; }
    const fp = footprint(def, dir);
    const id = ensureNextId();
    F.state.nextId = id + 1;
    const e = {
      id: id,
      type: type,
      x: tx | 0,
      y: ty | 0,
      dir: dir,
      health: (def.health != null) ? def.health : 100,
      w: fp[0],
      h: fp[1],
    };
    if (!F.state.entities) F.state.entities = [];
    F.state.entities.push(e);
    registerEntity(e);
    const beh = behaviourFor(def);
    if (beh.create) {
      try { beh.create(e); } catch (err) { F.log.error('behaviour.create', type, err); }
    }
    F.events.emit('entity:placed', e);
    return e;
  };

  entities.remove = function (entity, opts) {
    opts = opts || {};
    const dropItems = opts.dropItems !== false;
    if (!entity || entity._removed || !byId.has(entity.id)) {
      F.log.warn('F.entities.remove: invalid or already-removed entity');
      return false;
    }
    if (dropItems) {
      try {
        const items = entities.contents(entity);
        if (items.length && F.ground && F.ground.dropNear) {
          const c = centerOf(entity);
          for (let i = 0; i < items.length; i++) F.ground.dropNear(c[0], c[1], items[i][0], items[i][1]);
        }
      } catch (err) { F.log.error('drop contents on remove', entity.type, err); }
    }
    const def = F.data.entities[entity.type];
    const beh = behaviourFor(def);
    if (beh.onRemove) { try { beh.onRemove(entity); } catch (err) { F.log.error('behaviour.onRemove', entity.type, err); } }
    finishRemoval(entity);
    return true;
  };

  entities.flushRemovals = function () {
    if (!pendingRemovals.length) return;
    const arr = F.state.entities;
    if (!arr) { pendingRemovals.length = 0; return; }
    for (let i = arr.length - 1; i >= 0; i--) {
      if (arr[i]._removed) arr.splice(i, 1);
    }
    pendingRemovals.length = 0;
  };

  entities.byId = function (id) { return byId.get(id); };
  entities.all = function () { return F.state.entities || []; };

  entities.ofType = function (type) {
    let arr = typeCache.get(type);
    if (!arr) {
      const src = F.state.entities || [];
      arr = [];
      for (let i = 0; i < src.length; i++) if (src[i].type === type && !src[i]._removed) arr.push(src[i]);
      typeCache.set(type, arr);
    }
    return arr;
  };

  entities.footprint = footprint;
  entities.tiles = tilesOf;
  entities.center = centerOf;
  entities.front = function (e, n) { return edgeTile(e, e.dir, n == null ? 1 : n); };
  entities.behind = function (e, n) { return edgeTile(e, F.util.oppDir(e.dir), n == null ? 1 : n); };

  // resist(D, flatR, pctP) — GDD §7.9.6 damage formula.
  function resistFormula(D, R, P) {
    R = R || 0; P = P || 0;
    if (D > R + 1) return (D - R) * (1 - P);
    if (D > 1) return (1 - P) / (R - D + 2);
    return (1 - P) / (R + 1);
  }

  entities.damage = function (entity, amount, source) {
    if (!entity || entity._removed) return false;
    if (typeof amount !== 'number' || !(amount > 0)) return false;
    const def = F.data.entities[entity.type];
    if (!def) { F.log.warn('F.entities.damage: unknown entity type', entity.type); return false; }
    let dtype = 'physical';
    if (typeof source === 'string') dtype = source;
    else if (source && source.type) dtype = source.type;
    let eff = amount;
    const rd = def.resist && def.resist[dtype];
    if (rd) eff = resistFormula(amount, rd[0], rd[1]);
    if (!(eff >= 0)) eff = 0; // guard NaN / negative from a malformed resist table
    entity.health -= eff;
    F.events.emit('entity:damaged', { entity: entity, amount: eff, source: source });
    if (entity.health <= 0) {
      const beh = behaviourFor(def);
      if (beh.onRemove) { try { beh.onRemove(entity); } catch (err) { F.log.error('behaviour.onRemove(destroy)', entity.type, err); } }
      const c = centerOf(entity);
      finishRemoval(entity);
      // Destruction loses contents (GDD §7.10 "chests spill nothing [simplified]") — no drop step here.
      F.events.emit('entity:destroyed', entity);
      F.events.emit('alert', { kind: 'entity_destroyed', x: c[0], y: c[1], entity: entity });
      return true;
    }
    return false;
  };

  function dispatch(entity, method, fallback) {
    if (!entity || entity._removed) return fallback;
    const def = F.data && F.data.entities && F.data.entities[entity.type];
    if (!def) return fallback;
    const beh = behaviourFor(def);
    const fn = beh[method];
    if (!fn) return fallback;
    try { return fn(entity); } catch (err) { F.log.error('behaviour.' + method, entity.type, err); return fallback; }
  }

  // Non-grid duck-typed objects (design/EXPANSION.md §6.3, e.g. a train wagon
  // exposed via F.inserters.addResolver) carry an `_ops` object instead of a
  // real F.data.entities behaviour: `{ accepts(item)->count, insert(item,count)->n,
  // take(filterFn)->item|null }`. canAcceptItem/insertItem/takeItem fall back
  // to it whenever the normal def/behaviour lookup finds nothing to call.
  entities.canAcceptItem = function (entity, item) {
    if (!entity || entity._removed) return 0;
    const def = F.data && F.data.entities && F.data.entities[entity.type];
    const beh = def && behaviourFor(def);
    if (beh && beh.accepts) {
      try { return beh.accepts(entity, item) || 0; } catch (err) { F.log.error('behaviour.accepts', entity.type, err); return 0; }
    }
    if (entity._ops && typeof entity._ops.accepts === 'function') {
      try { return entity._ops.accepts(item) || 0; } catch (err) { F.log.error('entity._ops.accepts', err); return 0; }
    }
    return 0;
  };

  entities.insertItem = function (entity, item, count) {
    if (!entity || entity._removed) return 0;
    const def = F.data && F.data.entities && F.data.entities[entity.type];
    const beh = def && behaviourFor(def);
    if (beh && beh.insert) {
      try { return beh.insert(entity, item, count) || 0; } catch (err) { F.log.error('behaviour.insert', entity.type, err); return 0; }
    }
    if (entity._ops && typeof entity._ops.insert === 'function') {
      try { return entity._ops.insert(item, count) || 0; } catch (err) { F.log.error('entity._ops.insert', err); return 0; }
    }
    return 0;
  };

  entities.takeItem = function (entity, filterFn) {
    if (!entity || entity._removed) return null;
    const def = F.data && F.data.entities && F.data.entities[entity.type];
    const beh = def && behaviourFor(def);
    if (beh && beh.take) {
      try { return beh.take(entity, filterFn) || null; } catch (err) { F.log.error('behaviour.take', entity.type, err); return null; }
    }
    if (entity._ops && typeof entity._ops.take === 'function') {
      try { return entity._ops.take(filterFn) || null; } catch (err) { F.log.error('entity._ops.take', err); return null; }
    }
    return null;
  };

  entities.inventories = function (entity) {
    if (!entity) return [];
    const def = F.data && F.data.entities && F.data.entities[entity.type];
    if (!def) return [];
    const beh = behaviourFor(def);
    if (!beh.inventories) return [];
    try { return beh.inventories(entity) || []; } catch (err) { F.log.error('behaviour.inventories', entity.type, err); return []; }
  };

  // Everything inside an entity: all its inventories (fuel/input/output/main/ammo),
  // belt items on it (if it is belt-like) and an inserter's held item. Used by the
  // player pickup flow (F.api.remove -> F.entities.remove{dropItems} and by GUIs).
  entities.contents = function (e) {
    if (!e) return [];
    const totals = new Map();
    const add = (id, count) => { if (!id || !count) return; totals.set(id, (totals.get(id) || 0) + count); };
    const invs = entities.inventories(e);
    for (let i = 0; i < invs.length; i++) {
      const grp = invs[i];
      if (!grp || !grp.inv) continue;
      for (let s = 0; s < grp.inv.length; s++) { const slot = grp.inv[s]; if (slot) add(slot.id, slot.count); }
    }
    if (F.belts && F.belts.isBeltLike && F.belts.items && F.belts.isBeltLike(e)) {
      try {
        const items = F.belts.items(e);
        for (let i = 0; i < items.length; i++) add(items[i][0], 1);
      } catch (err) { F.log.error('F.entities.contents: belt items', e.type, err); }
    }
    if (e.hand && e.hand.id) add(e.hand.id, e.hand.count);
    return Array.from(totals.entries());
  };

  // Rebuild every runtime cache after F.load(). Called by 80-game.js.
  entities.rebuild = function () {
    byId.clear();
    typeCache.clear();
    pendingRemovals.length = 0;
    const arr = F.state && F.state.entities;
    if (!arr) return;
    for (let i = 0; i < arr.length; i++) {
      const e = arr[i];
      if (e._removed) continue; // saves never contain this (underscore keys are stripped)
      byId.set(e.id, e);
      const def = F.data && F.data.entities && F.data.entities[e.type];
      const beh = def && behaviourFor(def);
      if (beh && beh.wake) { try { beh.wake(e); } catch (err) { F.log.error('behaviour.wake', e.type, err); } }
    }
  };

  // Small convenience helper (not part of the formal contract, used to help
  // 50-api.js's F.api.stats() report entity counts without re-scanning itself).
  entities.stats = function () {
    const arr = F.state && F.state.entities || [];
    const byType = {};
    let count = 0;
    for (let i = 0; i < arr.length; i++) {
      const e = arr[i];
      if (e._removed) continue;
      count++;
      byType[e.type] = (byType[e.type] || 0) + 1;
    }
    return { count: count, byType: byType };
  };

  F.entities = entities;

  // =====================================================================
  // F.inv — inventory helpers. An inventory is a plain Array(N) of
  // null | {id, count} (mutable objects, JSON-safe). See ARCHITECTURE §6.
  // =====================================================================
  const inv = {};

  inv.create = function (n) {
    const a = new Array(Math.max(0, n | 0));
    for (let i = 0; i < a.length; i++) a[i] = null;
    return a;
  };

  inv.stackSize = function (id) {
    const it = F.data && F.data.items && F.data.items[id];
    if (!it) { F.log.warn('F.inv.stackSize: unknown item', id); return 100; }
    return it.stack || 100;
  };

  function effectiveStack(id, opts) {
    return (opts && opts.ignoreStack) ? Infinity : inv.stackSize(id);
  }

  inv.canAdd = function (invArr, id, count, opts) {
    if (!Array.isArray(invArr)) return false;
    const stack = effectiveStack(id, opts);
    let free = 0;
    for (let i = 0; i < invArr.length; i++) {
      const s = invArr[i];
      if (!s) free += stack;
      else if (s.id === id) free += Math.max(0, stack - s.count);
      if (free >= count) return true;
    }
    return free >= count;
  };

  inv.add = function (invArr, id, count, opts) {
    if (!Array.isArray(invArr)) { F.log.warn('F.inv.add: not an inventory'); return count; }
    if (!id || !(count > 0)) return count || 0;
    const stack = effectiveStack(id, opts);
    let remaining = count;
    for (let i = 0; i < invArr.length && remaining > 0; i++) {
      const s = invArr[i];
      if (s && s.id === id && s.count < stack) {
        const can = Math.min(stack - s.count, remaining);
        s.count += can; remaining -= can;
      }
    }
    for (let i = 0; i < invArr.length && remaining > 0; i++) {
      if (!invArr[i]) {
        const put = Math.min(stack, remaining);
        invArr[i] = { id: id, count: put };
        remaining -= put;
      }
    }
    return remaining;
  };

  inv.remove = function (invArr, id, count) {
    if (!Array.isArray(invArr)) { F.log.warn('F.inv.remove: not an inventory'); return 0; }
    let removed = 0;
    for (let i = 0; i < invArr.length && removed < count; i++) {
      const s = invArr[i];
      if (s && s.id === id) {
        const take = Math.min(s.count, count - removed);
        s.count -= take; removed += take;
        if (s.count <= 0) invArr[i] = null;
      }
    }
    return removed;
  };

  inv.count = function (invArr, id) {
    if (!Array.isArray(invArr)) return 0;
    let n = 0;
    for (let i = 0; i < invArr.length; i++) { const s = invArr[i]; if (s && s.id === id) n += s.count; }
    return n;
  };

  inv.has = function (invArr, id, count) {
    return inv.count(invArr, id) >= (count == null ? 1 : count);
  };

  inv.isEmpty = function (invArr) {
    if (!Array.isArray(invArr)) return true;
    for (let i = 0; i < invArr.length; i++) if (invArr[i]) return false;
    return true;
  };

  inv.firstItem = function (invArr, filter) {
    if (!Array.isArray(invArr)) return null;
    for (let i = 0; i < invArr.length; i++) {
      const s = invArr[i];
      if (s && (!filter || filter(s.id))) return s.id;
    }
    return null;
  };

  inv.takeOne = function (invArr, filter) {
    if (!Array.isArray(invArr)) return null;
    for (let i = 0; i < invArr.length; i++) {
      const s = invArr[i];
      if (s && (!filter || filter(s.id))) {
        const id = s.id;
        s.count -= 1;
        if (s.count <= 0) invArr[i] = null;
        return id;
      }
    }
    return null;
  };

  // Move up to `count` (default: as much as fits) of `id` (default: any item,
  // stack by stack) from `from` to `to`. Returns the total moved.
  inv.transfer = function (from, to, id, count) {
    if (!Array.isArray(from) || !Array.isArray(to)) return 0;
    const limit = (count == null) ? Infinity : count;
    let moved = 0;
    if (id != null) {
      const avail = inv.count(from, id);
      const want = Math.min(limit, avail);
      if (want > 0) {
        const leftover = inv.add(to, id, want);
        const added = want - leftover;
        if (added > 0) { inv.remove(from, id, added); moved += added; }
      }
      return moved;
    }
    for (let i = 0; i < from.length && moved < limit; i++) {
      const s = from[i];
      if (!s) continue;
      const want = Math.min(limit - moved, s.count);
      if (want <= 0) continue;
      const leftover = inv.add(to, s.id, want);
      const added = want - leftover;
      if (added > 0) { inv.remove(from, s.id, added); moved += added; }
    }
    return moved;
  };

  inv.setStack = function (invArr, i, id, count) {
    if (!Array.isArray(invArr) || i < 0 || i >= invArr.length) return;
    if (!id || !(count > 0)) { invArr[i] = null; return; }
    invArr[i] = { id: id, count: count };
  };

  F.inv = inv;

  // =====================================================================
  // F.ground — one item stack per tile. F.state.ground = { "tx,ty": {id,count} }.
  // GDD §6.23.
  // =====================================================================
  const ground = {};

  ground.at = function (tx, ty) {
    const g = F.state && F.state.ground;
    return (g && g[F.util.key(tx, ty)]) || null;
  };

  ground.drop = function (tx, ty, id, count) {
    if (!id || !(count > 0)) return count || 0;
    if (!F.state.ground) F.state.ground = {};
    const key = F.util.key(tx, ty);
    const existing = F.state.ground[key];
    const stack = inv.stackSize(id);
    if (!existing) {
      const put = Math.min(count, stack);
      F.state.ground[key] = { id: id, count: put };
      return count - put;
    }
    if (existing.id !== id) return count; // one item type per tile (GDD §6.23)
    const room = Math.max(0, stack - existing.count);
    const put = Math.min(count, room);
    existing.count += put;
    return count - put;
  };

  ground.take = function (tx, ty, count) {
    const g = F.state && F.state.ground;
    if (!g) return null;
    const key = F.util.key(tx, ty);
    const g0 = g[key];
    if (!g0) return null;
    const take = (count == null) ? g0.count : Math.min(count, g0.count);
    g0.count -= take;
    const result = { id: g0.id, count: take };
    if (g0.count <= 0) delete g[key];
    return result;
  };

  // Spill `count` of `id` onto the ground near float tile coords (x,y),
  // spiralling outward and merging into tiles that already hold the same
  // item. Returns whatever could not be placed (should be 0 in practice).
  ground.dropNear = function (x, y, id, count) {
    if (!id || !(count > 0)) return count || 0;
    let remaining = count;
    const cx = Math.round(x), cy = Math.round(y);
    for (let r = 0; r <= 8 && remaining > 0; r++) {
      for (let dy = -r; dy <= r && remaining > 0; dy++) {
        for (let dx = -r; dx <= r && remaining > 0; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const tx = cx + dx, ty = cy + dy;
          if (F.world && F.world.isLand && !F.world.isLand(tx, ty)) continue;
          remaining = ground.drop(tx, ty, id, remaining);
        }
      }
    }
    return remaining;
  };

  F.ground = ground;

  // =====================================================================
  // Behaviours: 'chest', 'corpse', 'static' (generic no-op fallback).
  // F.behaviours[name] = { create(e), tick?(e), onRemove?(e), wake?(e),
  //   accepts?(e,item)->count, insert?(e,item,count)->n, take?(e,filter)->item|null,
  //   inventories?(e)->[...], status?(e)->string }
  // =====================================================================
  if (!F.behaviours) F.behaviours = {};

  // 'chest' — GDD §6.3: accepts anything until full, take from the first
  // non-empty slot, single 'main' inventory group.
  F.behaviours.chest = {
    create: function (e) {
      const def = F.data.entities[e.type];
      const slots = (def && def.chest && def.chest.slots) || 16;
      e.inv = F.inv.create(slots);
    },
    accepts: function (e, item) {
      const stack = F.inv.stackSize(item);
      let free = 0;
      for (let i = 0; i < e.inv.length; i++) {
        const s = e.inv[i];
        if (!s) free += stack; else if (s.id === item) free += Math.max(0, stack - s.count);
      }
      return free;
    },
    insert: function (e, item, count) {
      const leftover = F.inv.add(e.inv, item, count);
      return count - leftover;
    },
    take: function (e, filter) { return F.inv.takeOne(e.inv, filter); },
    inventories: function (e) { return [{ name: 'main', inv: e.inv }]; },
    status: function (e) { return F.inv.isEmpty(e.inv) ? 'idle' : 'working'; },
  };

  // 'corpse' — player-corpse (GDD §3 "Death"): holds the player's full
  // inventory at death; opened like a chest; removed once fully emptied.
  F.behaviours.corpse = {
    create: function (e) {
      if (!e.inv) {
        const def = F.data.entities[e.type];
        const slots = (def && def.corpse && def.corpse.slots) || 92; // 80 inv + gun/ammo + headroom
        e.inv = F.inv.create(slots);
      }
    },
    accepts: function (e, item) { return F.behaviours.chest.accepts(e, item); },
    insert: function (e, item, count) { return F.behaviours.chest.insert(e, item, count); },
    take: function (e, filter) {
      const id = F.inv.takeOne(e.inv, filter);
      if (id && F.inv.isEmpty(e.inv)) {
        // "it disappears when emptied" (GDD §3)
        F.entities.remove(e, { dropItems: false });
      }
      return id;
    },
    inventories: function (e) { return [{ name: 'main', inv: e.inv }]; },
    status: function () { return 'idle'; },
  };

  // 'static' — generic placeholder for entities with no active behaviour yet
  // (walls/lamps/pipes/poles before their owning module loads, or entities
  // whose behaviour module is simply missing from a partial build). No-op
  // tick, no inventories: guarantees create()/dispatch never crash.
  F.behaviours.static = {
    create: function () {},
    tick: function () {},
    status: function () { return 'idle'; },
  };

  // =====================================================================
  // i18n: this module has no user-facing text of its own, but it is the
  // one that raises the 'entity_destroyed' alert kind, so register the key
  // defensively in case 02-i18n.js / the UI module do not also own it.
  // Re-registration of the same key/value by another module is harmless.
  // =====================================================================
  if (F.i18n && F.i18n.add) {
    F.i18n.add('en', { 'alert.entity_destroyed': 'Objects destroyed' });
  }
})();
