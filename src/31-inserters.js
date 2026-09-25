// 31-inserters.js — burner/normal/long-handed/fast inserters.
// See design/ARCHITECTURE.md §8 (fields, high level API) and design/GDD.md §6.7, §7.4, §7.3.5
// (state machine, timings, energy model, insertion limits).
//
// State machine (GDD §7.4), field names per ARCHITECTURE §8:
//   phase 'pick'       == GDD WAIT_PICKUP
//   phase 'swing_out'  == GDD SWING_TO_DROP
//   phase 'drop'       == GDD WAIT_DROP
//   phase 'swing_back' == GDD SWING_TO_PICKUP
(function () {
  'use strict';

  const FULL_CYCLE_J = 100000;      // 100 kJ per full pick+drop cycle (burner inserters)
  const HALF_CYCLE_J = FULL_CYCLE_J / 2; // 50 kJ burned per half-swing
  const FUEL_SLOT_CAP = 5;          // GDD §7.4.1: burner fuel slots (incl. inserter's own) hold at most 5 items

  // ---------- small local helpers ----------

  function invDef(type) {
    const d = F.data && F.data.entities ? F.data.entities[type] : null;
    return d || null;
  }

  function isFuelItem(id) {
    if (!id) return false;
    const it = F.data.items[id];
    return !!(it && it.fuel > 0);
  }

  // ticks for a half swing, derived from rotationSpeed (turns/tick): halfSwing = round(0.5/rotationSpeed)
  function halfSwingTicks(ins) {
    const rs = (ins && ins.rotationSpeed) || 0.014;
    return Math.max(1, Math.round(0.5 / rs));
  }

  function reachOf(ins) { return (ins && ins.reach) || 1; }
  function stackSizeOf(ins) { return Math.max(1, (ins && ins.stack) || 1); }

  // Resolvers (design/EXPANSION.md §6.3): fn(tx,ty) -> obj|null, consulted when the
  // pickup/drop tile has no grid entity. `obj` is duck-typed like an entity but with
  // an `_ops` object instead of an F.data.entities behaviour (see 20-entities.js's
  // canAcceptItem/insertItem/takeItem fallback) — used by train wagons while stopped.
  const resolvers = [];

  function resolveAt(tx, ty) {
    for (let i = 0; i < resolvers.length; i++) {
      try {
        const r = resolvers[i](tx, ty);
        if (r) return r;
      } catch (err) { F.log.error('inserters resolver threw', err); }
    }
    return null;
  }

  // Resolve what occupies a tile as an inserter source/target: a belt-like entity,
  // another entity, a resolver-provided virtual object, or bare ground.
  function tileTarget(tx, ty) {
    const ent = F.world.entityAt(tx, ty);
    if (ent) {
      if (F.belts.isBeltLike(ent)) return { kind: 'belt', entity: ent, tx, ty };
      return { kind: 'entity', entity: ent, tx, ty };
    }
    const resolved = resolveAt(tx, ty);
    if (resolved) return { kind: 'entity', entity: resolved, tx, ty };
    return { kind: 'ground', tx, ty };
  }

  // Sum of an item currently held anywhere inside an entity's exposed inventories (best-effort;
  // used only for the GDD §7.4.1 second-guard check against F.machines.insertLimit, see below).
  function countItemInEntity(entity, item) {
    let n = 0;
    if (!F.entities.inventories) return n;
    const invs = F.entities.inventories(entity) || [];
    for (let i = 0; i < invs.length; i++) {
      const slot = invs[i];
      if (slot && slot.inv) n += F.inv.count(slot.inv, item);
    }
    return n;
  }

  // Whether `item` may be inserted into entity `dst` right now: F.entities.canAcceptItem is the
  // primary (and normally sufficient) guard; when F.machines exposes an explicit insertLimit
  // helper (GDD §7.4.1 table) we apply it as a second guard, since some limits (e.g. "furnace
  // input slot capped at crafts×amount") depend on data only F.machines fully resolves.
  //
  // The second guard only applies to REAL grid entities: F.machines.insertLimit resolves the
  // limit via F.data.entities[dst.type]'s behaviour and falls back to 0 (its safe default) for
  // anything it doesn't recognise — which is exactly what a resolver-provided virtual object
  // (design/EXPANSION.md §6.3, `dst._ops`, e.g. a train wagon) looks like from its point of view.
  // Applying it there would make every _ops-based insert look "at its limit" (0 >= 0) and never
  // succeed, so those objects rely solely on their own `_ops.accepts` cap instead.
  function entityAcceptsNow(dst, item) {
    const cap = F.entities.canAcceptItem ? F.entities.canAcceptItem(dst, item) : 0;
    if (!cap || cap <= 0) return false;
    const isRealEntity = !!(F.data && F.data.entities && F.data.entities[dst.type]);
    if (isRealEntity && F.machines && typeof F.machines.insertLimit === 'function') {
      try {
        const lim = F.machines.insertLimit(dst, item);
        if (typeof lim === 'number' && isFinite(lim)) {
          if (countItemInEntity(dst, item) >= lim) return false;
        }
      } catch (err) { F.log.warn('inserters: insertLimit check failed', err); }
    }
    return true;
  }

  // Ground target accepts an item only when the tile is free (empty ground, no entity) — GDD §7.4.1.
  function groundAcceptsNow(tx, ty) {
    if (F.world.entityAt(tx, ty)) return false;
    return !F.ground.at(tx, ty);
  }

  function targetAccepts(dropTgt, item) {
    if (!item) return false;
    if (dropTgt.kind === 'belt') {
      const li = F.belts.lanePositionForInserter(dropTgt.entity, dropTgt._insDir);
      const lane = li ? li.lane : 0;
      const pos = (li && li.pos != null) ? li.pos : 128;
      return F.belts.canInsert(dropTgt.entity, lane, pos);
    }
    if (dropTgt.kind === 'entity') return entityAcceptsNow(dropTgt.entity, item);
    return groundAcceptsNow(dropTgt.tx, dropTgt.ty); // ground
  }

  // Inserter filter (GDD §6.7 / ARCHITECTURE §8: filter[5], filterMode). Non-filter inserters
  // (ins.filter falsy) accept anything; filter inserters with an empty filter list also accept
  // anything (matches Factorio's "no filter set = unrestricted").
  function passesOwnFilter(e, ins, item) {
    if (!ins.filter) return true;
    const list = e.filter;
    let any = false;
    for (let i = 0; i < list.length; i++) if (list[i]) { any = true; break; }
    if (!any) return true;
    let has = false;
    for (let i = 0; i < list.length; i++) if (list[i] === item) { has = true; break; }
    return e.filterMode === 'blacklist' ? !has : has;
  }

  // Preferred pickup lane on a belt source (GDD §6.7): perpendicular belt -> near lane relative to
  // the inserter; parallel belt (inserter reaches along the belt's own direction) -> left lane (0).
  function preferredPickupLane(e, belt) {
    const parallel = belt.dir === e.dir || belt.dir === F.util.oppDir(e.dir);
    if (parallel) return 0;
    return F.belts.nearLane(belt, e.dir);
  }

  // Attempt to take one item matching filterFn from a resolved source target. Destructive: only
  // call once the caller has decided it wants whatever comes back.
  function takeFromSource(target, filterFn) {
    if (target.kind === 'belt') {
      return F.belts.take(target.entity, filterFn, preferredPickupLane(target._insE, target.entity)) || null;
    }
    if (target.kind === 'entity') {
      return F.entities.takeItem ? (F.entities.takeItem(target.entity, filterFn) || null) : null;
    }
    // ground
    const g = F.ground.at(target.tx, target.ty);
    if (g && filterFn(g.id)) {
      const got = F.ground.take(target.tx, target.ty, 1);
      return got ? got.id : null;
    }
    return null;
  }

  // ---------- burner fuel handling ----------

  // Drain the inserter's own fuel slot into its energy buffer when the buffer is running low.
  // Keeps at most a bit more than one full cycle buffered so fuel items are consumed one at a time.
  function maintainBurnerFuel(e) {
    if (e.fuelJ >= FULL_CYCLE_J) return;
    if (F.inv.isEmpty(e.fuel)) return;
    const id = F.inv.firstItem(e.fuel);
    if (!id) return;
    const idef = F.data.items[id];
    if (!idef || !(idef.fuel > 0)) { F.log.warn('inserters: non-fuel item in fuel slot', id); return; }
    F.inv.remove(e.fuel, id, 1);
    e.fuelJ += idef.fuel * 1e6; // MJ -> J
  }

  // Insert an item into the inserter's own fuel slot, capped at FUEL_SLOT_CAP, same-item only.
  function insertOwnFuelSlot(e, item) {
    const slot = e.fuel[0];
    if (!slot) { F.inv.setStack(e.fuel, 0, item, 1); return true; }
    if (slot.id === item && slot.count < FUEL_SLOT_CAP) { F.inv.setStack(e.fuel, 0, item, slot.count + 1); return true; }
    return false;
  }

  // When completely out of fuel (buffer empty AND own slot empty), self-refuel by eating a fuel
  // item straight from the pickup source into the fuel slot instead of carrying it to the drop
  // target (GDD §7.4 WAIT_PICKUP note). Returns true if it consumed the tick doing this.
  function trySelfRefuel(e, srcTarget) {
    if (e.fuelJ > 0 || !F.inv.isEmpty(e.fuel)) return false;
    const got = takeFromSource(srcTarget, isFuelItem);
    if (!got) return false;
    if (!insertOwnFuelSlot(e, got)) {
      // slot became full/mismatched between check and take (shouldn't normally happen); drop it back.
      F.ground.dropNear ? F.ground.dropNear(srcTarget.tx, srcTarget.ty, got, 1) : F.ground.drop(srcTarget.tx, srcTarget.ty, got, 1);
    }
    return true;
  }

  // ---------- state machine ----------

  function doPick(e, def, ins, burner) {
    const reach = reachOf(ins);
    const [px, py] = F.entities.behind(e, reach);
    const [dx, dy] = F.entities.front(e, reach);
    const srcTarget = tileTarget(px, py);
    srcTarget._insE = e;

    if (burner && trySelfRefuel(e, srcTarget)) {
      e._status = 'no_fuel';
      return; // spent this tick refuelling; normal pickup resumes next tick
    }

    const dropTgt = tileTarget(dx, dy);
    dropTgt._insDir = e.dir;
    const filterFn = (item) => passesOwnFilter(e, ins, item) && targetAccepts(dropTgt, item);

    const got = takeFromSource(srcTarget, filterFn);
    if (got) {
      e.hand = { id: got, count: 1 };
      // Stack inserters (ins.stack > 1) keep grabbing the same item, up to their hand size,
      // from whatever the source still offers this tick.
      const handMax = stackSizeOf(ins);
      if (handMax > 1) {
        const same = (item) => item === got;
        while (e.hand.count < handMax && takeFromSource(srcTarget, same)) e.hand.count++;
      }
      e.phase = 'swing_out';
      e.t = halfSwingTicks(ins);
      e._status = 'working';
    } else {
      e._status = 'waiting_for_source';
    }
  }

  function doSwing(e, ins, burner, sat, toWaitPhase) {
    const total = halfSwingTicks(ins);
    let progressed = true;
    if (burner) {
      const needed = HALF_CYCLE_J / total;
      if (e.fuelJ >= needed) {
        e.fuelJ -= needed;
        e.t -= 1;
      } else {
        progressed = false;
        e._status = 'no_fuel';
      }
    } else {
      e.t -= sat;
      if (sat <= 0) e._status = 'no_power';
      else if (sat < 1) e._status = 'low_power';
      else e._status = 'working';
    }
    const doneFrac = F.util.clamp(1 - e.t / total, 0, 1);
    e.angle = toWaitPhase === 'drop' ? doneFrac : (1 - doneFrac);
    if (progressed && e.t <= 0) {
      e.t = 0;
      e.phase = toWaitPhase;
      e.angle = toWaitPhase === 'drop' ? 1 : 0;
    }
  }

  function doDrop(e, ins) {
    if (!e.hand) { // defensive: nothing to drop, resume the cycle
      e.phase = 'swing_back';
      e.t = halfSwingTicks(ins);
      return;
    }
    const reach = reachOf(ins);
    const [dx, dy] = F.entities.front(e, reach);
    const dropTgt = tileTarget(dx, dy);
    dropTgt._insDir = e.dir;
    const item = e.hand.id;
    let dropped = 0;

    // One item per tick onto belts and the ground; entities take as many as they accept now.
    // A stack inserter's hand therefore empties over several ticks on a belt (it stays in the
    // 'drop' phase until the hand is empty), like Factorio's.
    if (dropTgt.kind === 'belt') {
      const li = F.belts.lanePositionForInserter(dropTgt.entity, e.dir);
      const lane = li ? li.lane : 0;
      const pos = (li && li.pos != null) ? li.pos : 128;
      if (F.belts.canInsert(dropTgt.entity, lane, pos) && F.belts.insert(dropTgt.entity, lane, pos, item)) dropped = 1;
    } else if (dropTgt.kind === 'entity') {
      while (dropped < e.hand.count && entityAcceptsNow(dropTgt.entity, item)) {
        const n = F.entities.insertItem ? F.entities.insertItem(dropTgt.entity, item, 1) : 0;
        if (n <= 0) break;
        dropped++;
      }
    } else { // ground
      if (groundAcceptsNow(dropTgt.tx, dropTgt.ty)) {
        const leftover = F.ground.drop(dropTgt.tx, dropTgt.ty, item, 1);
        if (leftover === 0) dropped = 1;
      }
    }
    if (dropped > 0) e.hand.count -= dropped;

    if (e.hand.count <= 0) {
      e.hand = null;
      e.phase = 'swing_back';
      e.t = halfSwingTicks(ins);
      e._status = 'working';
    } else {
      e._status = dropped > 0 ? 'working' : 'waiting_for_space';
    }
  }

  function tickOne(e, def) {
    const ins = def.inserter || {};
    const burner = !!ins.burner;

    if (burner) maintainBurnerFuel(e);

    let sat = 1;
    if (!burner) {
      const swinging = e.phase === 'swing_out' || e.phase === 'swing_back';
      const en = def.energy || {};
      const kW = swinging ? (en.usage || 0) : (en.drain || 0);
      sat = F.power && F.power.request ? F.power.request(e, kW) : 1;
    }

    switch (e.phase) {
      case 'pick': doPick(e, def, ins, burner); break;
      case 'swing_out': doSwing(e, ins, burner, sat, 'drop'); break;
      case 'drop': doDrop(e, ins); break;
      case 'swing_back': doSwing(e, ins, burner, sat, 'pick'); break;
      default: e.phase = 'pick'; e.t = 0;
    }
  }

  // ---------- behaviour ----------

  function create(e) {
    const def = invDef(e.type);
    const ins = (def && def.inserter) || {};
    e.hand = null;
    e.phase = 'pick';
    e.angle = 0;
    e.t = 0;
    e.filter = [null, null, null, null, null];
    e.filterMode = 'whitelist';
    e.stack = 1;
    if (ins.burner) {
      e.fuel = F.inv.create(1);
      e.fuelJ = 0;
    }
  }

  function onRemove(e) {
    const [cx, cy] = F.entities.center ? F.entities.center(e) : [e.x, e.y];
    const dropAt = (id, count) => {
      if (!id || !count) return;
      if (F.ground.dropNear) F.ground.dropNear(cx, cy, id, count);
      else F.ground.drop(Math.round(cx), Math.round(cy), id, count);
    };
    if (e.hand) dropAt(e.hand.id, e.hand.count);
    if (e.fuel && e.fuel[0]) dropAt(e.fuel[0].id, e.fuel[0].count);
  }

  function inventoriesFn(e) {
    const out = [];
    if (e.fuel) out.push({ name: 'fuel', inv: e.fuel, filter: isFuelItem });
    return out;
  }

  // Fuel slot is the only thing an outside actor (player, another inserter) can insert into an
  // inserter; GDD §7.4.1 caps burner fuel slots at 5 items.
  function accepts(e, item) {
    if (!e.fuel) return 0;
    if (!isFuelItem(item)) return 0;
    const slot = e.fuel[0];
    if (!slot) return FUEL_SLOT_CAP;
    if (slot.id !== item) return 0;
    return Math.max(0, FUEL_SLOT_CAP - slot.count);
  }

  function insert(e, item, count) {
    if (!e.fuel || !isFuelItem(item)) return 0;
    let n = 0;
    while (n < count && insertOwnFuelSlot(e, item)) n++;
    return n;
  }

  function status(e) { return e._status || 'idle'; }

  F.behaviours.inserter = {
    create,
    tick: tickOne, // not called by a generic dispatcher (F.inserters.tick drives these directly);
                    // kept for introspection/tests and API-shape consistency with other behaviours.
    onRemove,
    inventories: inventoriesFn,
    accepts,
    insert,
    status,
  };

  // ---------- public API (design/ARCHITECTURE.md §8) ----------

  let cachedTypes = null;
  function inserterTypes() {
    if (cachedTypes) return cachedTypes;
    const ids = [];
    for (const id in F.data.entities) {
      if (F.data.entities[id].behaviour === 'inserter') ids.push(id);
    }
    ids.sort();
    cachedTypes = ids;
    return ids;
  }

  F.inserters = {
    tick() {
      const types = inserterTypes();
      for (let ti = 0; ti < types.length; ti++) {
        const type = types[ti];
        const def = F.data.entities[type];
        const list = F.entities.ofType(type);
        if (!list) continue;
        for (let i = 0; i < list.length; i++) {
          try { tickOne(list[i], def); }
          catch (err) { F.log.error('inserters.tick: entity ' + list[i].id + ' (' + type + ')', err); }
        }
      }
    },

    holding(e) { return e.hand ? e.hand.id : null; },

    armPos(e) {
      const def = invDef(e.type);
      const ins = (def && def.inserter) || {};
      const reach = reachOf(ins);
      const [px, py] = F.entities.behind(e, reach);
      const [dx, dy] = F.entities.front(e, reach);
      const a = F.util.clamp(e.angle || 0, 0, 1);
      return [F.util.lerp(px + 0.5, dx + 0.5, a), F.util.lerp(py + 0.5, dy + 0.5, a)];
    },

    pickupTile(e) {
      const def = invDef(e.type);
      const ins = (def && def.inserter) || {};
      return F.entities.behind(e, reachOf(ins));
    },

    dropTile(e) {
      const def = invDef(e.type);
      const ins = (def && def.inserter) || {};
      return F.entities.front(e, reachOf(ins));
    },

    status(e) { return status(e); },

    addResolver(fn) { if (typeof fn === 'function') resolvers.push(fn); },
  };
})();
