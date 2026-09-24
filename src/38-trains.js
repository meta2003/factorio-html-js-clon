// 38-trains.js — rail/train-stop entities, F.state.trains simulation (movement, fuel,
// scheduling, coupling), placement, picking, inserter access, player riding and rendering.
// See design/EXPANSION.md (single source of truth) §6 (hook APIs) and §7.2 (trains spec).
//
// LOAD ORDER (design/EXPANSION.md §6.1/§6.5/§6.6): this file sits between 36-pollution.js and
// 40-player.js, i.e. it loads AFTER F.entities/F.behaviours/F.inv/F.ground(20), F.belts(30),
// F.inserters(31), F.machines(32), F.power/F.fluids(33), F.research(34), F.pollution(36) —
// all of those already exist and are called directly — but BEFORE F.player(40), F.api(50),
// F.sprites(60), F.render(61), F.ui(70/71), F.input(75) and F.game(80). Anything from those
// later modules is therefore either:
//   (a) registered via the exact queue snippets EXPANSION.md documents for F.game/F.render
//       hooks and for F.input's addKey/addDragKind (direct writes onto plain registry objects
//       these later modules adopt once they load), or
//   (b) for APIs EXPANSION.md does NOT give a queue snippet for (F.api.addPlaceRule/
//       registerVirtual/addPicker, F.player.addMoveOverride, F.ui.registerWindow) — a local
//       guarded fallback: registration is deferred to the F.game.onRebuild hook (which itself
//       uses the queue pattern), which only ever runs from F.newGame()/F.load(), i.e. after
//       every src/*.js file has finished loading. Each registration is idempotent (a module
		// level flag) so it runs exactly once even though onRebuild fires on every new game/load.
(function () {
  'use strict';

  // =========================================================================================
  // Constants (EXPANSION.md §7.2).
  // =========================================================================================
  var MAX_SPEED = 0.2;        // tiles/tick (12 tiles/s)
  var ACCEL = 0.002;          // tiles/tick^2
  var BRAKE = 0.004;          // tiles/tick^2
  var CAR_SPACING = 3;        // tiles between car centres
  var CAR_HALF_LEN = 1.3;     // half a car's physical length (car length ~2.6)
  var FUEL_BURN_KW = 600;     // locomotive fuel draw while not parked at a station
  var COUPLE_MAX_DIST = 4;    // rail-graph tiles (~3.5 tiles straight-line per spec, rounded up)

  // =========================================================================================
  // Small tile/rail helpers.
  // =========================================================================================
  function isRail(tx, ty) {
    var e = (F.world && F.world.entityAt) ? F.world.entityAt(tx, ty) : null;
    if (!e) return false;
    var def = F.data.entities[e.type];
    return !!(def && def.behaviour === 'rail');
  }
  function isRailKey(key) { var xy = F.util.unkey(key); return isRail(xy[0], xy[1]); }
  function tileCenterOf(key) { var xy = F.util.unkey(key); return [xy[0] + 0.5, xy[1] + 0.5]; }
  function isFuelItem(id) { var it = F.data.items[id]; return !!(it && it.fuel > 0); }

  function railNeighborsOf(key) {
    var xy = F.util.unkey(key), tx = xy[0], ty = xy[1];
    var out = [];
    for (var d = 0; d < 4; d++) {
      var v = F.util.dirVec(d);
      var ntx = tx + v[0], nty = ty + v[1];
      if (isRail(ntx, nty)) out.push(F.util.key(ntx, nty));
    }
    return out;
  }

  // Plain BFS shortest path over the rail-tile adjacency graph. `excludeFirst`, when given,
  // is treated as already-visited so the very first hop cannot go back the way the train came
  // (EXPANSION.md §7.2 "no U-turns"); subsequent hops are naturally excluded by BFS's own
  // visited set. Returns an array of tile keys fromKey..toKey inclusive, or null.
  function railShortestPath(fromKey, toKey, excludeFirst) {
    if (fromKey === toKey) return [fromKey];
    var visited = Object.create(null);
    visited[fromKey] = true;
    if (excludeFirst) visited[excludeFirst] = true;
    var queue = [fromKey];
    var prev = Object.create(null);
    var qi = 0, guard = 0;
    while (qi < queue.length && guard++ < 40000) {
      var cur = queue[qi++];
      var nbrs = railNeighborsOf(cur);
      for (var i = 0; i < nbrs.length; i++) {
        var nk = nbrs[i];
        if (visited[nk]) continue;
        visited[nk] = true;
        prev[nk] = cur;
        if (nk === toKey) {
          var path = [nk], c = nk;
          while (c !== fromKey) { c = prev[c]; path.push(c); }
          path.reverse();
          return path;
        }
        queue.push(nk);
      }
    }
    return null;
  }

  // =========================================================================================
  // Rail behaviour (mask maintenance) + train-stop behaviour (name, station-rail lookup).
  // =========================================================================================
  function computeMask(tx, ty) {
    var m = 0;
    for (var d = 0; d < 4; d++) { var v = F.util.dirVec(d); if (isRail(tx + v[0], ty + v[1])) m |= (1 << d); }
    return m;
  }
  function refreshRailMask(e) { e.mask = computeMask(e.x, e.y); }
  function refreshNeighborRailMasks(tx, ty) {
    for (var d = 0; d < 4; d++) {
      var v = F.util.dirVec(d);
      var ne = (F.world && F.world.entityAt) ? F.world.entityAt(tx + v[0], ty + v[1]) : null;
      if (ne) { var def = F.data.entities[ne.type]; if (def && def.behaviour === 'rail') refreshRailMask(ne); }
    }
  }
  function rebuildAllRailMasks() {
    var list = (F.entities && F.entities.ofType) ? F.entities.ofType('rail') : [];
    for (var i = 0; i < list.length; i++) refreshRailMask(list[i]);
  }

  // Set once by rail create/onRemove; consulted (and cleared) at the top of trainsTick() so
  // every active train drops its cached route and re-evaluates the rail graph fresh the very
  // next tick after any rail is placed/removed anywhere (EXPANSION.md §7.2 "create/onRemove
  // mark topology dirty"). We do not otherwise cache a global rail graph — F.world.entityAt
  // lookups are cheap enough at the scale these tests/worlds run at (see final report).
  var railTopologyDirty = false;

  // Inserter access while stopped at a station (EXPANSION.md §7.2). NOTE (local guarded
  // fallback, see report): F.inserters.tileTarget() only ever consults an F.inserters.
  // addResolver() resolver when F.world.entityAt(tx,ty) is null (31-inserters.js) — but every
  // tile a train sits on always HAS a grid entity (the rail itself), so a resolver alone would
  // never actually be reached there. We still register a resolver below (harmless, matches the
  // documented API), but the functional path is the rail behaviour's own accepts/insert/take/
  // inventories, which look up whichever car of a 'waiting' train currently covers that tile
  // and delegate to it — this is what F.entities.canAcceptItem/insertItem/takeItem actually
  // dispatch to for a rail tile (20-entities.js: def+behaviour lookup happens before any _ops
  // fallback).
  function carAtStoppedTile(tx, ty) {
    var list = (F.state && F.state.trains) || [];
    for (var ti = 0; ti < list.length; ti++) {
      var train = list[ti];
      if (train.state !== 'waiting') continue;
      for (var ci = 0; ci < train.cars.length; ci++) {
        var tr = carTransform(train, ci);
        if (!tr) continue;
        if (Math.abs(tr.x - (tx + 0.5)) <= 1.0 && Math.abs(tr.y - (ty + 0.5)) <= 1.0) return train.cars[ci];
      }
    }
    return null;
  }

  F.behaviours.rail = {
    create: function (e) { refreshRailMask(e); refreshNeighborRailMasks(e.x, e.y); railTopologyDirty = true; },
    onRemove: function (e) { refreshNeighborRailMasks(e.x, e.y); railTopologyDirty = true; },
    status: function () { return 'idle'; },
    accepts: function (e, item) { var car = carAtStoppedTile(e.x, e.y); return car ? buildCarResolverObj(car)._ops.accepts(item) : 0; },
    insert: function (e, item, count) { var car = carAtStoppedTile(e.x, e.y); return car ? buildCarResolverObj(car)._ops.insert(item, count) : 0; },
    take: function (e, filterFn) { var car = carAtStoppedTile(e.x, e.y); return car ? buildCarResolverObj(car)._ops.take(filterFn) : null; },
    inventories: function (e) {
      var car = carAtStoppedTile(e.x, e.y);
      if (!car) return [];
      if (car.inv) return [{ name: 'main', inv: car.inv }];
      if (car.fuel) return [{ name: 'fuel', inv: car.fuel }];
      return [];
    },
  };

  function defaultStopName() {
    var used = Object.create(null);
    var list = (F.entities && F.entities.ofType) ? F.entities.ofType('train-stop') : [];
    for (var i = 0; i < list.length; i++) if (list[i].name) used[list[i].name] = true;
    var n = 1;
    while (used['Stop ' + n]) n++;
    return 'Stop ' + n;
  }
  function stationRailTile(stopE) {
    for (var d = 0; d < 4; d++) {
      var v = F.util.dirVec(d);
      var tx = stopE.x + v[0], ty = stopE.y + v[1];
      if (isRail(tx, ty)) return F.util.key(tx, ty);
    }
    return null;
  }
  function resolveStop(name) {
    var list = (F.entities && F.entities.ofType) ? F.entities.ofType('train-stop') : [];
    for (var i = 0; i < list.length; i++) if (list[i].name === name) return list[i];
    return null;
  }

  F.behaviours['train-stop'] = {
    create: function (e) { e.name = defaultStopName(); },
    status: function () { return 'idle'; },
  };

  function trainStopPlaceRule(def, tx, ty, dir) {
    for (var d = 0; d < 4; d++) { var v = F.util.dirVec(d); if (isRail(tx + v[0], ty + v[1])) return null; }
    return 'no_rail';
  }

  // =========================================================================================
  // Train state helpers (EXPANSION.md §7.2 state shape).
  // =========================================================================================
  function nextTrainId() {
    var max = 0, list = (F.state && F.state.trains) || [];
    for (var i = 0; i < list.length; i++) if (list[i].id > max) max = list[i].id;
    return max + 1;
  }
  function makeLocoCar() { return { kind: 'locomotive', fuel: F.inv.create(3), fuelJ: 0 }; }
  function makeWagonCar() { return { kind: 'cargo-wagon', inv: F.inv.create(40) }; }

  function createTrain(cars, headKey, dir) {
    var train = {
      id: nextTrainId(), cars: cars, path: [headKey], headPos: 0, speed: 0,
      manual: true, schedule: [], cur: 0, state: 'stopped', waitTicks: 0,
    };
    // Runtime-only hint (not saved) so the very first move of a freshly placed train respects
    // the facing the player rotated to before placing, without needing to pre-occupy a second
    // tile (which would block a wagon coupling directly behind it — see report).
    var xy = F.util.unkey(headKey);
    var bv = F.util.dirVec(F.util.oppDir(dir || 0));
    var behindKey = F.util.key(xy[0] + bv[0], xy[1] + bv[1]);
    train._prevHint = isRailKey(behindKey) ? behindKey : null;
    if (!F.state.trains) F.state.trains = [];
    F.state.trains.push(train);
    return train;
  }
  function findTrainById(id) {
    var list = (F.state && F.state.trains) || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function findLocoIndex(train) {
    for (var i = 0; i < train.cars.length; i++) if (train.cars[i].kind === 'locomotive') return i;
    return -1;
  }
  function findLoco(train) { var i = findLocoIndex(train); return i >= 0 ? train.cars[i] : null; }
  function neededPathLen(train) { return Math.max(2, Math.ceil(train.cars.length * CAR_SPACING) + 2); }
  function trimPath(train) {
    var need = neededPathLen(train);
    if (train.path.length > need) train.path.length = need;
    if (!train.path.length) train.path = [F.util.key(0, 0)]; // paranoia guard, should never trigger
  }

  // Position on the polyline of tiles the train has occupied, `t` tiles behind the very front
  // of the train (t=0 => the head/nose). See this file's report for the derivation: the head
  // sits `headPos` (0..1) of the way from path[1] to path[0]; walking further back consumes
  // exactly one tile of arc-length per path index after that.
  function pointBehindHead(train, t) {
    var path = train.path;
    if (!path || !path.length) return null;
    if (path.length === 1) { var c = tileCenterOf(path[0]); return { x: c[0], y: c[1] }; }
    var hp = train.headPos || 0;
    if (t <= hp) {
      var c0 = tileCenterOf(path[0]), c1 = tileCenterOf(path[1]);
      var frac = hp > 1e-6 ? (hp - t) : 0;
      return { x: c1[0] + (c0[0] - c1[0]) * frac, y: c1[1] + (c0[1] - c1[1]) * frac };
    }
    var u = t - hp;
    var k = Math.floor(u) + 1;
    var localFrac = u - (k - 1);
    var maxIdx = path.length - 1;
    var idxA = Math.min(k, maxIdx), idxB = Math.min(k + 1, maxIdx);
    if (idxA === idxB) localFrac = 0;
    var ca = tileCenterOf(path[idxA]), cb = tileCenterOf(path[idxB]);
    return { x: ca[0] + (cb[0] - ca[0]) * localFrac, y: ca[1] + (cb[1] - ca[1]) * localFrac };
  }
  function carArcOffset(i) { return CAR_HALF_LEN + i * CAR_SPACING; }
  function carTransform(train, i) {
    var t = carArcOffset(i);
    var p = pointBehindHead(train, t);
    if (!p) return null;
    var ahead = pointBehindHead(train, Math.max(0, t - 0.2));
    var behind = pointBehindHead(train, t + 0.2);
    var ax = ahead ? ahead.x : p.x, ay = ahead ? ahead.y : p.y;
    var bx = behind ? behind.x : p.x, by = behind ? behind.y : p.y;
    var angle = (Math.abs(ax - bx) > 1e-9 || Math.abs(ay - by) > 1e-9) ? Math.atan2(ay - by, ax - bx) : 0;
    return { x: p.x, y: p.y, angle: angle };
  }

  function tileOccupiedByOtherTrain(key, exceptId) {
    var list = (F.state && F.state.trains) || [];
    for (var i = 0; i < list.length; i++) {
      var t = list[i];
      if (t.id === exceptId) continue;
      if (t.path && t.path.indexOf(key) !== -1) return true;
    }
    return false;
  }
  function carOccupiesTile(tx, ty) { return tileOccupiedByOtherTrain(F.util.key(tx, ty), -1); }

  function wagonsOf(train) { return train.cars.filter(function (c) { return c.kind === 'cargo-wagon'; }); }
  function wagonsFull(train) {
    var w = wagonsOf(train); if (!w.length) return false;
    return w.every(function (c) { return c.inv.every(function (s) { return s != null; }); });
  }
  function wagonsEmpty(train) {
    var w = wagonsOf(train); if (!w.length) return true;
    return w.every(function (c) { return c.inv.every(function (s) { return s == null; }); });
  }
  function wagonContentSignature(train) {
    var total = 0;
    wagonsOf(train).forEach(function (c) { c.inv.forEach(function (s) { if (s) total += s.count; }); });
    return total;
  }

  // =========================================================================================
  // Fuel.
  // =========================================================================================
  function refillLocoFuel(loco) {
    if (!loco.fuel) return;
    for (var i = 0; i < loco.fuel.length; i++) {
      var s = loco.fuel[i];
      if (s && isFuelItem(s.id)) {
        var idef = F.data.items[s.id];
        s.count--;
        loco.fuelJ = (loco.fuelJ || 0) + idef.fuel * 1e6; // MJ -> J
        if (s.count <= 0) loco.fuel[i] = null;
        return;
      }
    }
  }
  function ensureFuel(loco) {
    if (loco.fuelJ == null) loco.fuelJ = 0;
    var neededPerTick = FUEL_BURN_KW * 1000 / 60;
    if (loco.fuelJ < neededPerTick) refillLocoFuel(loco);
    if (loco.fuelJ >= neededPerTick) { loco.fuelJ -= neededPerTick; return true; }
    return false;
  }

  // =========================================================================================
  // Movement.
  // =========================================================================================
  // Advances the train up to `dist` tiles, crossing tile boundaries as needed. `nextTileFn()`
  // supplies the next tile key to move into (auto: from the cached route; manual: from local
  // junction choice). Handles rail-missing ('no_path') and same-tile collision ('waiting')
  // without ever throwing — a broken/incomplete rail network just stops the train.
  function moveBy(train, dist, nextTileFn) {
    var remaining = dist, guard = 0;
    while (remaining > 1e-9 && guard++ < 8) {
      var toNext = 1 - train.headPos;
      if (remaining < toNext - 1e-9) { train.headPos += remaining; remaining = 0; break; }
      remaining -= toNext;
      var nextKey = null;
      try { nextKey = nextTileFn(); } catch (err) { F.log.error('[trains] nextTileFn threw', err); nextKey = null; }
      if (!nextKey || !isRailKey(nextKey)) { train.headPos = 1; train.state = 'no_path'; train.speed = 0; return; }
      if (tileOccupiedByOtherTrain(nextKey, train.id)) { train.headPos = 0.999; train.state = 'waiting'; train.speed = 0; return; }
      train.path.unshift(nextKey);
      trimPath(train);
      train.headPos = 0;
      if (train._route && train._route.length > 1) train._route.shift();
    }
  }

  function dirBetweenKeys(fromKey, toKey) {
    var a = F.util.unkey(fromKey), b = F.util.unkey(toKey);
    var dx = b[0] - a[0], dy = b[1] - a[1];
    for (var d = 0; d < 4; d++) { var v = F.util.dirVec(d); if (v[0] === dx && v[1] === dy) return d; }
    return 0;
  }
  function pickNextTileManual(train, mx) {
    var currentKey = train.path[0];
    var prevKey = train.path.length > 1 ? train.path[1] : train._prevHint;
    var nbrs = railNeighborsOf(currentKey).filter(function (k) { return k !== prevKey; });
    if (!nbrs.length) return null;
    if (nbrs.length === 1 || prevKey == null) return nbrs[0];
    var curDir = dirBetweenKeys(prevKey, currentKey);
    var choices = nbrs.map(function (k) {
      var d = dirBetweenKeys(currentKey, k);
      var side = ((d - curDir) + 4) % 4; // 0 straight, 1 right, 2 back(excluded already), 3 left
      return { k: k, side: side };
    }).filter(function (c) { return c.side !== 2; });
    if (!choices.length) return null;
    var straight = null, left = null, right = null, i;
    for (i = 0; i < choices.length; i++) {
      if (choices[i].side === 0) straight = choices[i];
      else if (choices[i].side === 3) left = choices[i];
      else if (choices[i].side === 1) right = choices[i];
    }
    if (mx < -0.3) return (left || straight || choices[0]).k;
    if (mx > 0.3) return (right || straight || choices[0]).k;
    return (straight || choices[0]).k;
  }

  function routeValid(train, stationKey) {
    var r = train._route;
    if (!r || !r.length) return false;
    if (r[0] !== train.path[0]) return false;
    if (r[r.length - 1] !== stationKey) return false;
    return true;
  }

  function tickWaitCondition(train) {
    train.waitTicks = (train.waitTicks || 0) + 1;
    var entry = train.schedule[train.cur % train.schedule.length];
    var done;
    if (entry.wait === 'time') {
      done = train.waitTicks >= Math.round((entry.time || 0) * 60);
    } else if (entry.wait === 'full') {
      done = wagonsFull(train);
    } else if (entry.wait === 'empty') {
      done = wagonsEmpty(train);
    } else if (entry.wait === 'inactivity') {
      var sig = wagonContentSignature(train);
      if (sig !== train._waitBaseline) { train._waitBaseline = sig; train._waitBaselineTick = F.state.tick; }
      done = (F.state.tick - (train._waitBaselineTick == null ? F.state.tick : train._waitBaselineTick)) >= Math.round((entry.time || 1) * 60);
    } else {
      done = true; // unknown wait kind: never stall forever
    }
    if (done) {
      train.cur = (train.cur + 1) % train.schedule.length;
      train.state = 'moving';
      train.waitTicks = 0;
      train._route = null;
    }
  }

  function autoTick(train, loco) {
    if (!isRail.apply(null, F.util.unkey(train.path[0]))) { train.state = 'no_path'; train.speed = Math.max(0, (train.speed || 0) - BRAKE); return; }
    if (!train.schedule || !train.schedule.length) { train.state = 'stopped'; train.speed = Math.max(0, (train.speed || 0) - BRAKE); return; }
    if (train.state === 'waiting') { tickWaitCondition(train); return; }

    var entry = train.schedule[train.cur % train.schedule.length];
    var stopE = resolveStop(entry.stop);
    var stationKey = stopE ? stationRailTile(stopE) : null;
    if (!stationKey) { train.state = 'no_path'; train.speed = Math.max(0, (train.speed || 0) - BRAKE); return; }

    if (!routeValid(train, stationKey)) {
      // Prefer a route that doesn't immediately backtrack the way the train just came (no
      // U-turns while there's an alternative); but at a single-track dead end / spur terminus
      // the ONLY rail neighbour of the current tile IS the one behind — excluding it would make
      // every point-to-point shuttle route permanently unreachable ('no_path' forever) once the
      // train stops there, even though reversing back the same track is exactly what a real
      // train does at a terminus. So: try the no-U-turn route first, and fall back to an
      // unrestricted BFS (which can only ever pick the excluded neighbour when literally nothing
      // else connects, since a plain shortest path never revisits a tile anyway).
      var exclude = train.path.length > 1 ? train.path[1] : train._prevHint;
      var r = railShortestPath(train.path[0], stationKey, exclude) || railShortestPath(train.path[0], stationKey, null);
      if (!r) { train.state = 'no_path'; train.speed = Math.max(0, (train.speed || 0) - BRAKE); train._route = null; return; }
      train._route = r;
    }

    var remaining = (1 - train.headPos) + (train._route.length - 1);
    if (remaining <= 0.02 && train._route.length <= 1) {
      train.headPos = 1; train.speed = 0; train.state = 'waiting'; train.waitTicks = 0;
      train._waitBaseline = wagonContentSignature(train); train._waitBaselineTick = F.state.tick;
      return;
    }

    var fuelOk = ensureFuel(loco);
    if (!fuelOk) {
      train.state = 'no_fuel';
      train.speed = Math.max(0, train.speed - BRAKE);
      moveBy(train, train.speed, function () { return train._route && train._route.length > 1 ? train._route[1] : null; });
      return;
    }

    var brakeDist = (train.speed * train.speed) / (2 * BRAKE);
    if (remaining <= brakeDist) train.speed = Math.max(0, train.speed - BRAKE);
    else train.speed = Math.min(MAX_SPEED, train.speed + ACCEL);
    train.state = 'moving';
    moveBy(train, train.speed, function () { return train._route && train._route.length > 1 ? train._route[1] : null; });
  }

  function manualTick(train, loco, riding) {
    if (!isRail.apply(null, F.util.unkey(train.path[0]))) { train.state = 'no_path'; train.speed = Math.max(0, (train.speed || 0) - BRAKE); return; }
    var mx = 0, my = 0;
    if (riding && F.input && F.input.state) { mx = F.input.state.mx || 0; my = F.input.state.my || 0; }
    var fuelOk = ensureFuel(loco);
    if (!fuelOk) {
      train.state = 'no_fuel';
      train.speed = Math.max(0, train.speed - BRAKE);
      if (train.speed > 0) moveBy(train, train.speed, function () { return pickNextTileManual(train, mx); });
      return;
    }
    if (my < -0.2) train.speed = Math.min(MAX_SPEED, train.speed + ACCEL);
    else if (my > 0.2) train.speed = Math.max(0, train.speed - BRAKE);
    else train.speed = Math.max(0, train.speed - ACCEL * 0.5); // gentle coast-down with no input
    train.state = train.speed > 0.0005 ? 'moving' : 'stopped';
    if (train.speed > 0) moveBy(train, train.speed, function () { return pickNextTileManual(train, mx); });
  }

  function trainTick(train) {
    if (!train.cars || !train.cars.length) return;
    var loco = findLoco(train);
    if (!loco) { train.speed = 0; train.state = 'stopped'; trimPath(train); return; }
    var riding = !!(F.state.player && F.state.player.ridingTrain === train.id);
    if (train.manual) manualTick(train, loco, riding);
    else autoTick(train, loco);
    trimPath(train);
  }

  function trainsTick() {
    var trains = F.state && F.state.trains;
    if (!trains || !trains.length) return;
    if (railTopologyDirty) {
      railTopologyDirty = false;
      for (var i = 0; i < trains.length; i++) trains[i]._route = null;
    }
    for (var t = 0; t < trains.length; t++) {
      try { trainTick(trains[t]); }
      catch (err) { F.log.error('[trains] trainTick failed for train', trains[t] && trains[t].id, err); trains[t].state = 'no_path'; trains[t].speed = 0; }
    }
  }

  // =========================================================================================
  // Coupling / placement (F.api.registerVirtual, EXPANSION.md §6.4/§7.2).
  // =========================================================================================
  function nearestRailKeyTo(x, y) {
    var key = F.util.key(Math.floor(x), Math.floor(y));
    return isRailKey(key) ? key : null;
  }
  function tryCouple(wagonKey) {
    var list = (F.state && F.state.trains) || [];
    for (var i = 0; i < list.length; i++) {
      var t = list[i];
      var tailIdx = t.cars.length - 1;
      var tailPt = pointBehindHead(t, carArcOffset(tailIdx) + CAR_HALF_LEN);
      if (!tailPt) continue;
      var tailKey = nearestRailKeyTo(tailPt.x, tailPt.y);
      if (!tailKey) continue;
      var seg = railShortestPath(tailKey, wagonKey, null);
      if (seg && seg.length >= 2 && (seg.length - 1) <= COUPLE_MAX_DIST) {
        var car = makeWagonCar();
        t.cars.push(car);
        for (var s = 1; s < seg.length; s++) t.path.push(seg[s]);
        return car;
      }
    }
    return null;
  }

  var locomotivePlacer = {
    canPlace: function (tx, ty, dir) {
      if (!isRail(tx, ty)) return { ok: false, reason: 'no_rail' };
      if (carOccupiesTile(tx, ty)) return { ok: false, reason: 'collision' };
      return { ok: true };
    },
    place: function (tx, ty, dir) {
      var key = F.util.key(tx, ty);
      if (!isRail(tx, ty) || carOccupiesTile(tx, ty)) return null;
      var train = createTrain([makeLocoCar()], key, dir);
      return train.cars[0];
    },
    previewDraw: previewDrawVehicle('locomotive'),
  };
  var wagonPlacer = {
    canPlace: function (tx, ty, dir) {
      if (!isRail(tx, ty)) return { ok: false, reason: 'no_rail' };
      if (carOccupiesTile(tx, ty)) return { ok: false, reason: 'collision' };
      return { ok: true };
    },
    place: function (tx, ty, dir) {
      var key = F.util.key(tx, ty);
      if (!isRail(tx, ty) || carOccupiesTile(tx, ty)) return null;
      var coupled = tryCouple(key);
      if (coupled) return coupled;
      var train = createTrain([makeWagonCar()], key, dir);
      return train.cars[0];
    },
    previewDraw: previewDrawVehicle('cargo-wagon'),
  };

  function previewDrawVehicle(kind) {
    return function (ctx, tx, ty, dir, ok, camera) {
      if (!F.sprites || !F.sprites.enabled || !F.sprites.vehicle) return;
      var tpx = F.C.TILE * camera.zoom;
      var scr = camera.toScreen(tx + 0.5, ty + 0.5);
      var scale = tpx / 64;
      var w = 128 * scale, h = 192 * scale;
      var dv = F.util.dirVec(dir || 0);
      var ang = Math.atan2(dv[1], dv[0]) + Math.PI / 2;
      var spr = F.sprites.vehicle(kind, 0);
      ctx.save();
      ctx.translate(scr[0], scr[1]);
      ctx.rotate(ang);
      ctx.globalAlpha = 0.6;
      if (spr) ctx.drawImage(spr, -w / 2, -h / 2, w, h);
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = ok ? 'rgba(60,220,90,0.45)' : 'rgba(230,60,60,0.5)';
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.restore();
    };
  }

  // =========================================================================================
  // Picker (hit-test cars) + mining.
  // =========================================================================================
  function hitTestCar(wx, wy) {
    var list = (F.state && F.state.trains) || [];
    for (var ti = 0; ti < list.length; ti++) {
      var train = list[ti];
      for (var ci = 0; ci < train.cars.length; ci++) {
        var tr = carTransform(train, ci);
        if (!tr) continue;
        var dx = wx - tr.x, dy = wy - tr.y;
        var ca = Math.cos(-tr.angle), sa = Math.sin(-tr.angle);
        var lx = dx * ca - dy * sa, ly = dx * sa + dy * ca;
        if (Math.abs(lx) <= CAR_HALF_LEN && Math.abs(ly) <= 0.6) return { train: train, carIndex: ci };
      }
    }
    return null;
  }
  function mineCar(train, ci) {
    var car = train.cars[ci];
    if (!car) return false;
    if (F.player && F.player.giveOrDrop) F.player.giveOrDrop(car.kind, 1);
    var contentsInv = car.inv || car.fuel;
    if (contentsInv) {
      for (var i = 0; i < contentsInv.length; i++) {
        var s = contentsInv[i];
        if (s && F.player && F.player.giveOrDrop) F.player.giveOrDrop(s.id, s.count);
      }
    }
    train.cars.splice(ci, 1);
    if (!train.cars.length) {
      var idx = F.state.trains.indexOf(train);
      if (idx >= 0) F.state.trains.splice(idx, 1);
      if (F.state.player && F.state.player.ridingTrain === train.id) F.state.player.ridingTrain = null;
    } else if (F.state.player && F.state.player.ridingTrain === train.id && findLocoIndex(train) < 0) {
      F.state.player.ridingTrain = null;
    }
    return true;
  }
  function pickCarAt(wx, wy) {
    var hit = hitTestCar(wx, wy);
    if (!hit) return null;
    var train = hit.train, ci = hit.carIndex;
    return {
      kind: 'train-car',
      label: train.cars[ci] ? train.cars[ci].kind : 'train-car',
      open: function () { if (F.ui && F.ui.open) F.ui.open('train-car', { trainId: train.id, carIndex: ci }); },
      mine: function () { return mineCar(train, ci); },
      mineTime: 0.5,
    };
  }

  // =========================================================================================
  // Inserter access while stopped at a station (F.inserters exists at THIS file's load time —
  // 31-inserters.js loads before 38-trains.js — so this is called directly, no deferral).
  // =========================================================================================
  function buildCarResolverObj(car) {
    if (car.kind === 'cargo-wagon') {
      return {
        type: 'cargo-wagon-car',
        _ops: {
          accepts: function (item) {
            var stack = F.inv.stackSize(item), free = 0;
            for (var i = 0; i < car.inv.length; i++) { var s = car.inv[i]; if (!s) free += stack; else if (s.id === item) free += Math.max(0, stack - s.count); }
            return free;
          },
          insert: function (item, count) { var leftover = F.inv.add(car.inv, item, count); return count - leftover; },
          take: function (filterFn) { return F.inv.takeOne(car.inv, filterFn); },
        },
      };
    }
    return {
      type: 'locomotive-car',
      _ops: {
        accepts: function (item) {
          if (!isFuelItem(item)) return 0;
          var stack = F.inv.stackSize(item), free = 0;
          for (var i = 0; i < car.fuel.length; i++) { var s = car.fuel[i]; if (!s) free += stack; else if (s.id === item) free += Math.max(0, stack - s.count); }
          return free;
        },
        insert: function (item, count) { if (!isFuelItem(item)) return 0; var leftover = F.inv.add(car.fuel, item, count); return count - leftover; },
        take: function () { return null; },
      },
    };
  }
  F.inserters.addResolver(function (tx, ty) {
    var list = (F.state && F.state.trains) || [];
    for (var ti = 0; ti < list.length; ti++) {
      var train = list[ti];
      if (train.state !== 'waiting') continue; // only while genuinely stopped at a scheduled station
      for (var ci = 0; ci < train.cars.length; ci++) {
        var tr = carTransform(train, ci);
        if (!tr) continue;
        if (Math.abs(tr.x - (tx + 0.5)) <= 1.0 && Math.abs(tr.y - (ty + 0.5)) <= 1.0) return buildCarResolverObj(train.cars[ci]);
      }
    }
    return null;
  });

  // =========================================================================================
  // Player riding: addKey('enter'/'g') (F._inputKeys queue, EXPANSION.md §6.6),
  // F.player.addMoveOverride (no documented queue for this one — deferred via onRebuild, see
  // header comment), F.render.hidePlayerWhen (F._renderHooks queue, EXPANSION.md §6.5).
  // =========================================================================================
  function toggleRide() {
    var p = F.state && F.state.player;
    if (!p) return true;
    if (p.ridingTrain) {
      var train = findTrainById(p.ridingTrain);
      p.ridingTrain = null;
      if (train) {
        var li = findLocoIndex(train);
        var tr = li >= 0 ? carTransform(train, li) : null;
        if (tr) { p.x = tr.x + 0.9; p.y = tr.y; }
      }
      return true;
    }
    var best = null, bestD = 3.0001;
    var list = (F.state && F.state.trains) || [];
    for (var i = 0; i < list.length; i++) {
      var train = list[i];
      var li = findLocoIndex(train);
      if (li < 0) continue;
      var tr = carTransform(train, li);
      if (!tr) continue;
      var d = F.util.dist(p.x, p.y, tr.x, tr.y);
      if (d <= 3 && d < bestD) { bestD = d; best = train; }
    }
    if (best) p.ridingTrain = best.id;
    return true;
  }
  F._inputKeys = F._inputKeys || {};
  (F._inputKeys['enter'] = F._inputKeys['enter'] || []).push(function () { return toggleRide(); });
  (F._inputKeys['g'] = F._inputKeys['g'] || []).push(function () { return toggleRide(); });

  function trainMoveOverride(p, input) {
    if (!p.ridingTrain) return false;
    var train = findTrainById(p.ridingTrain);
    if (!train) { p.ridingTrain = null; return false; }
    var li = findLocoIndex(train);
    if (li < 0) { p.ridingTrain = null; return false; }
    var tr = carTransform(train, li);
    if (!tr) return false;
    p.x = tr.x; p.y = tr.y;
    return true;
  }

  F._dragKinds = F._dragKinds || {};
  F._dragKinds['rail'] = 'line';

  F._renderHooks = F._renderHooks || {
    layers: { floor: [], objects: [], air: [], overlay: [] },
    entityOpts: {}, minimapColors: {}, hidePlayerFns: [], altOverlayFns: [],
  };
  F._renderHooks.layers.objects.push(function (ctx, rect, cam) { renderTrains(ctx, rect, cam); });
  F._renderHooks.entityOpts['rail'] = function (e) { return { frame: 0, opts: { mask: e.mask || 0 } }; };
  F._renderHooks.minimapColors['rail'] = '#8a8f94';
  F._renderHooks.hidePlayerFns.push(function () { return !!(F.state && F.state.player && F.state.player.ridingTrain); });

  // =========================================================================================
  // Locomotive smoke — a small real-time particle system, kept entirely OUT of F.state (a
  // render-only cache here in this closure, keyed by train id) so it never affects
  // determinism/save data. F.sprites.lib.smokePuffs is NOT used here: that helper bakes its
  // output into a per-frame CACHED sprite canvas at native (unzoomed) pixel scale, which is
  // the wrong tool for a live, screen-space, per-tick particle stream — using it directly
  // against screen pixel coordinates produced puffs several tiles wide that drifted far off
  // (see report). Puffs: spawn at the exhaust (roof, rear half of the loco), start at 0.15
  // tile radius growing to 0.6 tile over a 1.2 s lifetime, alpha 0.35 -> 0, dark-to-light grey,
  // drifting gently up/back; emitted at a rate proportional to speed while moving, or a slow
  // occasional wisp while idle with fuel; capped at ~40 live puffs per train.
  // =========================================================================================
  var smokeState = new Map(); // trainId -> { puffs: [{x,y,vx,vy,born}], lastSpawnMs }
  var SMOKE_LIFE_MS = 1200, SMOKE_CAP = 40;
  F.events.on('game:new', function () { smokeState.clear(); });
  F.events.on('game:loaded', function () { smokeState.clear(); });

  function updateAndDrawSmoke(ctx, cam, train, loco, exX, exY, nowMs) {
    var st = smokeState.get(train.id);
    if (!st) { st = { puffs: [], lastSpawnMs: 0 }; smokeState.set(train.id, st); }
    var speed = train.speed || 0;
    var moving = speed > 0.004;
    var hasFuel = !!(loco && loco.fuelJ > 0);
    var spawnIntervalMs = moving ? Math.max(55, 260 - speed * 900) : (hasFuel ? 950 : Infinity);
    if (isFinite(spawnIntervalMs) && (nowMs - st.lastSpawnMs) >= spawnIntervalMs && st.puffs.length < SMOKE_CAP) {
      st.lastSpawnMs = nowMs;
      st.puffs.push({
        x: exX + (Math.random() - 0.5) * 0.06,
        y: exY + (Math.random() - 0.5) * 0.06,
        vx: (Math.random() - 0.5) * 0.06,     // tiles/s horizontal drift
        vy: -0.28 - Math.random() * 0.18,     // tiles/s upward drift
        born: nowMs,
      });
    }
    var tilePx = F.C.TILE * cam.zoom;
    var kept = [];
    for (var i = 0; i < st.puffs.length; i++) {
      var p = st.puffs[i];
      var age = nowMs - p.born;
      if (age >= SMOKE_LIFE_MS) continue;
      var t = age / SMOKE_LIFE_MS;
      var ageS = age / 1000;
      var scr = cam.toScreen(p.x + p.vx * ageS, p.y + p.vy * ageS);
      var rPx = (0.15 + 0.45 * t) * tilePx;
      var alpha = 0.35 * (1 - t);
      var g = Math.round(85 + 110 * t); // #555 -> lighter grey as the puff ages/expands
      ctx.fillStyle = 'rgba(' + g + ',' + g + ',' + g + ',' + alpha.toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(scr[0], scr[1], rPx, 0, Math.PI * 2); ctx.fill();
      kept.push(p);
    }
    st.puffs = kept;
  }

  // =========================================================================================
  // Rendering: cars rotated along the rail tangent, soft shadow, locomotive smoke.
  // =========================================================================================
  function renderTrains(ctx, rect, cam) {
    if (!F.sprites || !F.sprites.enabled || !F.sprites.vehicle) return;
    var trains = F.state && F.state.trains; if (!trains || !trains.length) return;
    var tpx = F.C.TILE * cam.zoom, scale = tpx / 64;
    var frame = Math.floor((F.state.tick || 0) / 4) % 8;
    var nowMs = F.util.now();
    for (var ti = 0; ti < trains.length; ti++) {
      var train = trains[ti];
      for (var ci = 0; ci < train.cars.length; ci++) {
        var car = train.cars[ci];
        var tr = carTransform(train, ci);
        if (!tr) continue;
        if (tr.x < rect.x0 - 3 || tr.x > rect.x1 + 3 || tr.y < rect.y0 - 3 || tr.y > rect.y1 + 3) continue;
        var scr = cam.toScreen(tr.x, tr.y);
        var w = 128 * scale, h = 192 * scale;
        ctx.save();
        ctx.translate(scr[0], scr[1]);
        ctx.rotate(tr.angle + Math.PI / 2);
        // soft shadow, offset toward light-from-top-left convention
        ctx.fillStyle = 'rgba(0,0,0,0.32)';
        ctx.beginPath();
        ctx.ellipse(w * 0.05, h * 0.05, w * 0.30, h * 0.40, 0, 0, Math.PI * 2);
        ctx.fill();
        var spr = F.sprites.vehicle(car.kind, frame);
        if (spr) ctx.drawImage(spr, -w / 2, -h / 2, w, h);
        ctx.restore();
        if (car.kind === 'locomotive') {
          // Exhaust point: roof, rear half of the loco — 0.5 tile behind the car's centre
          // along the direction of travel.
          var exX = tr.x - Math.cos(tr.angle) * 0.5, exY = tr.y - Math.sin(tr.angle) * 0.5;
          try { updateAndDrawSmoke(ctx, cam, train, car, exX, exY, nowMs); } catch (err) { /* best-effort, never break rendering */ }
        }
      }
    }
  }

  // =========================================================================================
  // GUI: train-stop (F._entityGUIs queue, EXPANSION.md §6.6 — safe to write directly, no F.ui
  // needed) and train cars (F.ui.registerWindow — no documented queue, deferred via onRebuild).
  // =========================================================================================
  (F._entityGUIs = F._entityGUIs || {})['train-stop'] = function (root, e, def, h) {
    h.header(root, e, def);
    var row = h.el('div', 'f-row');
    var input = document.createElement('input');
    input.type = 'text';
    input.value = e.name || '';
    input.maxLength = 40;
    input.style.cssText = 'width:150px;';
    input.addEventListener('change', function () { e.name = input.value.slice(0, 40) || e.name; h.refresh(); });
    row.appendChild(input);
    root.appendChild(row);
    var heading = (F.state.trains || []).filter(function (t) { return (t.schedule || []).some(function (s) { return s.stop === e.name; }); });
    var wrap = h.el('div', 'f-hint');
    if (!heading.length) wrap.textContent = F.t('ui.trains.none');
    else heading.forEach(function (t) { wrap.appendChild(h.el('div', null, '#' + t.id + ' — ' + F.t('status.' + (t.state || 'stopped')))); });
    root.appendChild(h.labeled(F.t('ui.trains.heading'), wrap));
  };

  function miniSlot(inv, i) {
    if (F.ui && typeof F.ui.slot === 'function') { try { return F.ui.slot(inv, i, { transferTarget: 'player' }); } catch (err) { /* fall through */ } }
    var d = document.createElement('div'); d.className = 'f-slot'; return d;
  }
  function miniSlotGrid(inv, cols) {
    var grid = document.createElement('div');
    grid.className = 'f-slot-grid';
    grid.style.gridTemplateColumns = 'repeat(' + cols + ',1fr)';
    for (var i = 0; i < inv.length; i++) grid.appendChild(miniSlot(inv, i));
    return grid;
  }
  function el(tag, cls, text) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (text != null) d.textContent = text;
    return d;
  }

  function renderWagonWindow(root, train, car) {
    while (root.firstChild) root.removeChild(root.firstChild);
    root.appendChild(el('div', 'f-entity-name', F.t('item.cargo-wagon') + ' — #' + train.id));
    root.appendChild(el('div', 'f-status', F.t('status.' + (train.state || 'stopped'))));
    root.appendChild(miniSlotGrid(car.inv, 8));
  }
  function renderLocoWindow(root, train, car) {
    while (root.firstChild) root.removeChild(root.firstChild);
    function rerender() { renderLocoWindow(root, train, car); }
    root.appendChild(el('div', 'f-entity-name', F.t('item.locomotive') + ' — #' + train.id));
    root.appendChild(el('div', 'f-status', F.t('status.' + (train.state || 'stopped'))));
    root.appendChild(el('div', 'f-row-label', F.t('ui.trains.fuel')));
    root.appendChild(miniSlotGrid(car.fuel, 3));

    var modeBtn = document.createElement('button'); modeBtn.type = 'button'; modeBtn.className = 'f-btn';
    modeBtn.textContent = train.manual ? F.t('ui.trains.manual') : F.t('ui.trains.auto');
    modeBtn.addEventListener('click', function () { train.manual = !train.manual; rerender(); });
    root.appendChild(modeBtn);

    root.appendChild(el('div', 'f-row-label', F.t('ui.trains.schedule')));
    var list = el('div', 'f-trains-schedule');
    (train.schedule || []).forEach(function (entry, idx) {
      var row = el('div', 'f-row');
      var label = (idx + 1) + '. ' + entry.stop + ' [' + F.t('ui.trains.wait.' + entry.wait) +
        ((entry.wait === 'time' || entry.wait === 'inactivity') ? ' ' + (entry.time || 0) + 's' : '') + ']';
      row.appendChild(el('span', null, label));
      var up = document.createElement('button'); up.type = 'button'; up.className = 'f-btn-small'; up.textContent = '↑';
      up.addEventListener('click', function () { if (idx > 0) { var t0 = train.schedule[idx]; train.schedule[idx] = train.schedule[idx - 1]; train.schedule[idx - 1] = t0; rerender(); } });
      var down = document.createElement('button'); down.type = 'button'; down.className = 'f-btn-small'; down.textContent = '↓';
      down.addEventListener('click', function () { if (idx < train.schedule.length - 1) { var t0 = train.schedule[idx]; train.schedule[idx] = train.schedule[idx + 1]; train.schedule[idx + 1] = t0; rerender(); } });
      var rm = document.createElement('button'); rm.type = 'button'; rm.className = 'f-btn-small'; rm.textContent = '✕';
      rm.addEventListener('click', function () { train.schedule.splice(idx, 1); if (train.cur >= train.schedule.length) train.cur = 0; rerender(); });
      row.appendChild(up); row.appendChild(down); row.appendChild(rm);
      list.appendChild(row);
    });
    root.appendChild(list);

    var addRow = el('div', 'f-row');
    var sel = document.createElement('select');
    (F.entities.ofType('train-stop') || []).forEach(function (se) {
      var o = document.createElement('option'); o.value = se.name; o.textContent = se.name; sel.appendChild(o);
    });
    var waitSel = document.createElement('select');
    ['time', 'full', 'empty', 'inactivity'].forEach(function (w) {
      var o = document.createElement('option'); o.value = w; o.textContent = F.t('ui.trains.wait.' + w); waitSel.appendChild(o);
    });
    var secInput = document.createElement('input'); secInput.type = 'number'; secInput.value = '5'; secInput.style.width = '50px';
    var addBtn = document.createElement('button'); addBtn.type = 'button'; addBtn.className = 'f-btn';
    addBtn.textContent = F.t('ui.trains.addStop');
    addBtn.addEventListener('click', function () {
      if (!sel.value) return;
      train.schedule = train.schedule || [];
      train.schedule.push({ stop: sel.value, wait: waitSel.value, time: parseFloat(secInput.value) || 0 });
      rerender();
    });
    addRow.appendChild(sel); addRow.appendChild(waitSel); addRow.appendChild(secInput); addRow.appendChild(addBtn);
    root.appendChild(addRow);
  }
  function renderCarWindow(root, payload) {
    var train = payload && findTrainById(payload.trainId);
    var car = train && train.cars[payload.carIndex];
    while (root.firstChild) root.removeChild(root.firstChild);
    if (!train || !car) { root.appendChild(document.createTextNode('—')); return; }
    if (car.kind === 'locomotive') renderLocoWindow(root, train, car);
    else renderWagonWindow(root, train, car);
  }

  // =========================================================================================
  // Deferred registration (see header comment): F.api.*, F.player.addMoveOverride,
  // F.ui.registerWindow are not available at this file's own load time. Each flag below makes
  // its registration idempotent even though onRebuild fires on every new game / load.
  // =========================================================================================
  var apiRegistered = false;
  function ensureApiRegistered() {
    if (apiRegistered) return;
    if (!F.api || typeof F.api.addPlaceRule !== 'function') return;
    F.api.addPlaceRule('train-stop', trainStopPlaceRule);
    F.api.registerVirtual('locomotive', locomotivePlacer);
    F.api.registerVirtual('cargo-wagon', wagonPlacer);
    F.api.addPicker(pickCarAt);
    apiRegistered = true;
  }
  var playerRegistered = false;
  function ensurePlayerRegistered() {
    if (playerRegistered) return;
    if (!F.player || typeof F.player.addMoveOverride !== 'function') return;
    F.player.addMoveOverride(trainMoveOverride);
    playerRegistered = true;
  }
  var uiRegistered = false;
  function ensureUiRegistered() {
    if (uiRegistered) return;
    if (!F.ui || typeof F.ui.registerWindow !== 'function') return;
    F.ui.registerWindow('train-car', {
      create: function (payload) {
        var body = document.createElement('div');
        body.className = 'f-win-content f-win-train-car';
        var title = 'Train';
        var frame = (typeof F.ui.windowFrame === 'function') ? F.ui.windowFrame(title, body) : body;
        renderCarWindow(body, payload);
        frame._contentEl = body;
        return frame;
      },
      refresh: function (frameEl, payload) { try { renderCarWindow(frameEl._contentEl || frameEl, payload); } catch (err) { F.log.error('[trains] train-car refresh failed', err); } },
    });
    uiRegistered = true;
  }

  (F._helpTabs = F._helpTabs || []).push('trains');

  // =========================================================================================
  // F.game hooks (EXPANSION.md §6.1 queue pattern — F.game does not exist yet at this file's
  // load time either).
  // =========================================================================================
  F.game = F.game || {};
  (F.game._tickPhases = F.game._tickPhases || []).push({ name: 'trains', after: 'belts', fn: trainsTick });
  (F.game._onNewGame = F.game._onNewGame || []).push(function () { F.state.trains = []; });
  (F.game._onRebuild = F.game._onRebuild || []).push(function () {
    if (!F.state) return;
    if (!Array.isArray(F.state.trains)) F.state.trains = []; // default for old saves
    rebuildAllRailMasks();
    ensureApiRegistered();
    ensurePlayerRegistered();
    ensureUiRegistered();
  });

  // =========================================================================================
  // Public API (F.trains.*) — for tests and any other module that wants to inspect trains.
  // =========================================================================================
  F.trains = {
    list: function () { return (F.state && F.state.trains) || []; },
    findById: findTrainById,
    carTransform: carTransform,
    isRail: isRail,
    stationRailTile: stationRailTile,
    resolveStop: resolveStop,
  };

  // =========================================================================================
  // i18n — this module's own UI labels (design/EXPANSION.md §9: feature modules add extra
  // i18n keys with the `ui.<feature>.*` prefix). Status/reason strings for trains are already
  // provided by 06-i18n-expansion.js (status.moving/waiting/stopped/no_path, reason.no_rail).
  // =========================================================================================
  F.i18n.add('en', {
    'ui.tab.trains': 'Trains',
    'ui.trains.fuel': 'Fuel',
    'ui.trains.schedule': 'Schedule',
    'ui.trains.addStop': 'Add stop',
    'ui.trains.auto': 'Auto',
    'ui.trains.manual': 'Manual',
    'ui.trains.heading': 'Trains heading here',
    'ui.trains.none': 'None',
    'ui.trains.wait.time': 'time',
    'ui.trains.wait.full': 'full cargo',
    'ui.trains.wait.empty': 'empty cargo',
    'ui.trains.wait.inactivity': 'inactivity',
  });
})();
