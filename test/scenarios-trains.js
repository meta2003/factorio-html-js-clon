// Scenario tests for the trains feature (src/38-trains.js). See design/EXPANSION.md §7.2.
// Each scenario receives (F, assert, window) and may return a note string.
'use strict';

// ---- helpers copied from test/scenarios.js (not exported by that module) ----
function fresh(F, seed) { F.newGame({ seed: seed == null ? 42 : seed }); return F.state; }
function ticks(F, n) { for (let i = 0; i < n; i++) F.tick(); }
function spawn(F) { const s = F.world.spawn; return { x: Math.round(s.x), y: Math.round(s.y) }; }

// Find a flat buildable rectangle of w×h near spawn (no water, no features, no entities, no ore).
function findFlat(F, w, h) {
  const sp = spawn(F);
  const pl = F.state.player; const px = Math.floor(pl.x), py = Math.floor(pl.y);
  for (let r = 2; r < 160; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = sp.x + dx, y = sp.y + dy;
      let ok = true;
      for (let j = -1; j <= h && ok; j++) for (let i = -1; i <= w && ok; i++) {
        const tx = x + i, ty = y + j;
        if (!F.world.buildable(tx, ty)) ok = false;
        if (F.world.resource(tx, ty)) ok = false;
        if (Math.abs(tx - px) <= 1 && Math.abs(ty - py) <= 1) ok = false; // never build on the player
      }
      if (ok) return { x, y };
    }
  }
  throw new Error('no flat area found');
}

// Builds a straight rail line of `len` tiles starting at (x0,y0) going east, plus a train-stop
// one tile south of each end (orthogonally adjacent to the rail, per EXPANSION.md §7.2). Returns
// { x0, y0, len, stopA, stopB } (stopA at the west end, stopB at the east end).
function buildLine(F, assert, x0, y0, len) {
  for (let i = 0; i < len; i++) {
    const e = F.api.place('rail', x0 + i, y0, 0, { fromInventory: false });
    assert(e, 'place rail at ' + (x0 + i) + ',' + y0);
  }
  const stopA = F.api.place('train-stop', x0, y0 + 1, 0, { fromInventory: false });
  assert(stopA, 'place train-stop A');
  const stopB = F.api.place('train-stop', x0 + len - 1, y0 + 1, 0, { fromInventory: false });
  assert(stopB, 'place train-stop B');
  return { x0, y0, len, stopA, stopB };
}

module.exports = {
  train_rail_mask_and_junction(F, assert) {
    fresh(F, 1);
    const a = findFlat(F, 6, 6);
    // a plus-shaped junction: straight run + one branch, so the centre tile gets a 3-bit mask.
    for (let i = 0; i < 5; i++) F.api.place('rail', a.x + i, a.y + 2, 0, { fromInventory: false });
    F.api.place('rail', a.x + 2, a.y + 1, 0, { fromInventory: false });
    const centre = F.world.entityAt(a.x + 2, a.y + 2);
    assert(centre && centre.type === 'rail', 'centre tile is a rail');
    assert(typeof centre.mask === 'number' && centre.mask > 0, 'rail mask computed: ' + centre.mask);
    // bit0=N,1=E,2=S,3=W — centre should have N(branch), E, W bits set (not S).
    assert((centre.mask & 1) !== 0, 'mask has N bit (branch above)');
    assert((centre.mask & 2) !== 0, 'mask has E bit');
    assert((centre.mask & 8) !== 0, 'mask has W bit');
    assert((centre.mask & 4) === 0, 'mask has no S bit (nothing there)');
    return 'mask=' + centre.mask;
  },

  train_stop_requires_adjacent_rail(F, assert) {
    fresh(F, 2);
    const a = findFlat(F, 4, 4);
    const chk = F.api.canPlace('train-stop', a.x, a.y, 0);
    assert(!chk.ok && chk.reason === 'no_rail', 'train-stop refused without adjacent rail: ' + JSON.stringify(chk));
    F.api.place('rail', a.x, a.y, 0, { fromInventory: false });
    const chk2 = F.api.canPlace('train-stop', a.x, a.y + 1, 0);
    assert(chk2.ok, 'train-stop allowed next to a rail: ' + JSON.stringify(chk2));
  },

  train_place_couple_schedule_arrive(F, assert) {
    fresh(F, 3);
    const a = findFlat(F, 16, 4);
    const line = buildLine(F, assert, a.x, a.y, 14);

    const locoCar = F.api.placeVirtual('locomotive', a.x + 3, a.y, 1, { fromInventory: false });
    assert(locoCar && locoCar.kind === 'locomotive', 'locomotive placed');
    assert(F.state.trains.length === 1, 'one train exists after placing the locomotive');
    const train = F.state.trains[0];
    assert(train.cars.length === 1, 'train has 1 car');

    const wagonCar = F.api.placeVirtual('cargo-wagon', a.x + 1, a.y, 1, { fromInventory: false });
    assert(wagonCar && wagonCar.kind === 'cargo-wagon', 'wagon placed');
    assert(F.state.trains.length === 1, 'wagon coupled onto the same train (no second train created)');
    assert(train.cars.length === 2, 'train now has 2 cars: ' + train.cars.length);

    // fuel the locomotive
    const leftover = F.inv.add(locoCar.fuel, 'coal', 20);
    assert(leftover < 20, 'coal accepted into the fuel slots');

    train.manual = false;
    train.schedule = [
      { stop: line.stopB.name, wait: 'time', time: 1 },
      { stop: line.stopA.name, wait: 'time', time: 1 },
    ];
    train.cur = 0;

    let arrived = false;
    for (let i = 0; i < 4000 && !arrived; i++) {
      F.tick();
      if (train.state === 'waiting') arrived = true;
    }
    assert(arrived, 'train reached "waiting" state within 4000 ticks (state=' + train.state + ', speed=' + train.speed + ')');
    assert(train.cars.length === 2, 'still 2 cars on arrival');

    // It should also depart again (wait:'time' 1s = 60 ticks) and head all the way back to stop A —
    // this is a straight dead-end line, so departing means reversing back along the same track it
    // just arrived on (no loop/wye to turn around on). Checking actual DISPLACEMENT over a real
    // window (not just a transient 'moving' state on a single tick — tickWaitCondition sets
    // state='moving' the instant the wait completes, before route validity for the new leg has
    // even been checked, so a one-tick state peek is not a reliable progress signal) is what
    // caught the real bug this test originally missed: the first route recomputation after a stop
    // was excluding the tile the train just came from as a forbidden "U-turn", which is exactly
    // the only rail neighbour at a dead end — that permanently stuck the train in 'no_path'
    // instead of letting it reverse. See src/38-trains.js autoTick()'s route computation.
    const posAtArrival = F.trains.carTransform(train, 0);
    let sawMoving = false;
    for (let i = 0; i < 600; i++) { F.tick(); if (train.state === 'moving') sawMoving = true; }
    assert(sawMoving, 'train shows "moving" at some point after its wait condition (state=' + train.state + ')');
    const posLater = F.trains.carTransform(train, 0);
    const moved = Math.hypot(posLater.x - posAtArrival.x, posLater.y - posAtArrival.y);
    assert(moved > 1, 'train actually made progress back toward stop A, not stuck oscillating in no_path (moved ' + moved.toFixed(3) + ' tiles, state=' + train.state + ')');
    assert(train.state !== 'no_path', 'train is not stuck in no_path after departing (state=' + train.state + ')');

    return 'arrived after schedule, cur=' + train.cur + ', moved ' + moved.toFixed(1) + ' back';
  },

  train_wagon_inserter_loading(F, assert) {
    fresh(F, 4);
    const a = findFlat(F, 16, 6);
    const line = buildLine(F, assert, a.x, a.y, 10);

    const locoCar = F.api.placeVirtual('locomotive', a.x + 6, a.y, 3, { fromInventory: false }); // dir 3 = west-facing
    assert(locoCar, 'locomotive placed');
    const train = F.state.trains[0];
    F.inv.add(locoCar.fuel, 'coal', 20);
    const wagonCar = F.api.placeVirtual('cargo-wagon', a.x + 8, a.y, 3, { fromInventory: false });
    assert(wagonCar, 'wagon placed');
    assert(train.cars.length === 2, 'coupled');

    train.manual = false;
    train.schedule = [{ stop: line.stopA.name, wait: 'inactivity', time: 2 }];
    train.cur = 0;

    let arrived = false;
    for (let i = 0; i < 3000 && !arrived; i++) { F.tick(); if (train.state === 'waiting') arrived = true; }
    assert(arrived, 'train reached stop A (state=' + train.state + ')');

    // Find the tile the wagon is actually parked over, then place a chest + inserter feeding it.
    const wi = train.cars.indexOf(wagonCar);
    const tr = F.trains.carTransform(train, wi);
    assert(tr, 'wagon transform available');
    const wagonTx = Math.floor(tr.x), wagonTy = Math.floor(tr.y);
    assert(F.trains.isRail(wagonTx, wagonTy), 'wagon sits over a rail tile');

    // Chest + inserter go on the row below the rail line: inserter directly south of the wagon's
    // tile (front, dir 0/north, reaches the rail tile), chest one further tile south (its pickup/
    // behind tile).
    const insTile = wagonTy + 1;
    const chestY = insTile + 1;
    const chest = F.api.place('wooden-chest', wagonTx, chestY, 0, { fromInventory: false });
    assert(chest, 'chest placed');
    F.inv.add(chest.inv, 'iron-plate', 40);
    const ins = F.api.place('burner-inserter', wagonTx, insTile, 0, { fromInventory: false }); // dir 0 = faces north = toward the rail
    assert(ins, 'inserter placed');
    F.inv.add(ins.fuel, 'coal', 5);

    const before = F.inv.count(wagonCar.inv, 'iron-plate');
    for (let i = 0; i < 600; i++) F.tick();
    const after = F.inv.count(wagonCar.inv, 'iron-plate');
    assert(after > before, 'wagon received iron-plate from the chest via the inserter (before=' + before + ' after=' + after + ')');
    return 'wagon iron-plate=' + after;
  },

  train_save_load_keeps_moving(F, assert) {
    fresh(F, 5);
    // Long enough route that a handful of ticks can never already have completed the trip
    // (with accel 0.002/tick and brake 0.004/tick a short trip can fully arrive+wait well
    // within a couple hundred ticks — see report — so this uses both a long route and a
    // 2-stop back-and-forth schedule, and only checks for *continued progress* post-load
    // rather than a specific pre-save state, so it is robust regardless of exactly which
    // phase (accelerating/cruising/braking/waiting) the train happens to be in at save time).
    const a = findFlat(F, 20, 4);
    const line = buildLine(F, assert, a.x, a.y, 18);
    const locoCar = F.api.placeVirtual('locomotive', a.x + 2, a.y, 1, { fromInventory: false });
    const train = F.state.trains[0];
    F.inv.add(locoCar.fuel, 'coal', 20);
    train.manual = false;
    train.schedule = [
      { stop: line.stopB.name, wait: 'time', time: 1 },
      { stop: line.stopA.name, wait: 'time', time: 1 },
    ];
    train.cur = 0;
    ticks(F, 20); // just enough to leave 'stopped' behind; nowhere near the 17-tile-away stop yet
    assert(train.state !== 'waiting', 'train has not already arrived before save: ' + train.state);
    const posBefore = F.trains.carTransform(train, 0);
    const curBefore = train.cur;

    const s = F.save();
    assert(typeof s === 'string' && s.length > 0, 'save produced a string');
    assert(F.load(s), 'load succeeded');

    const trains2 = F.state.trains;
    assert(trains2.length === 1, 'train survives save/load');
    const train2 = trains2[0];
    assert(train2.cars.length === 1 && train2.cars[0].kind === 'locomotive', 'car list intact after load');
    assert(train2.schedule && train2.schedule.length === 2, 'schedule survives save/load');
    // Generous budget: reach the far stop, wait, and depart again — regardless of exactly
    // where in that cycle we resumed.
    ticks(F, 1500);
    const posAfter = F.trains.carTransform(train2, 0);
    const moved = Math.hypot(posAfter.x - posBefore.x, posAfter.y - posBefore.y);
    assert(moved > 0.5 || train2.cur !== curBefore, 'train continued its schedule after load (moved ' + moved.toFixed(3) + ' tiles, cur ' + curBefore + '->' + train2.cur + ')');
    return 'moved ' + moved.toFixed(2) + ' tiles post-load';
  },

  train_rail_removed_under_train_no_crash(F, assert) {
    fresh(F, 6);
    const a = findFlat(F, 16, 4);
    const line = buildLine(F, assert, a.x, a.y, 12);
    const locoCar = F.api.placeVirtual('locomotive', a.x + 2, a.y, 1, { fromInventory: false });
    const train = F.state.trains[0];
    F.inv.add(locoCar.fuel, 'coal', 20);
    train.manual = false;
    train.schedule = [{ stop: line.stopB.name, wait: 'time', time: 1 }];
    train.cur = 0;
    ticks(F, 60);

    // Remove a rail tile a few steps ahead of the train's current head tile.
    const headXY = F.util.unkey(train.path[0]);
    const removeAt = { x: headXY[0] + 4, y: headXY[1] };
    let removed = false;
    if (F.world.entityAt(removeAt.x, removeAt.y) && F.world.entityAt(removeAt.x, removeAt.y).type === 'rail') {
      removed = F.api.remove(removeAt.x, removeAt.y, { toInventory: false });
    }
    assert(removed, 'removed a rail tile ahead of the train');

    let threw = null;
    try { ticks(F, 1000); } catch (err) { threw = err; }
    assert(!threw, 'simulation did not crash after removing a rail under the route: ' + (threw && threw.message));
    assert(train.state === 'no_path' || train.state === 'waiting' || train.state === 'moving', 'train state stays sane: ' + train.state);
    return 'state=' + train.state;
  },

  train_boarding_sets_player_position(F, assert) {
    fresh(F, 7);
    const a = findFlat(F, 10, 4);
    for (let i = 0; i < 6; i++) F.api.place('rail', a.x + i, a.y, 0, { fromInventory: false });
    const locoCar = F.api.placeVirtual('locomotive', a.x + 2, a.y, 1, { fromInventory: false });
    assert(locoCar, 'locomotive placed');
    const train = F.state.trains[0];
    ticks(F, 5); // let the (single-tile) path settle so carTransform is stable

    // Teleport the player next to the locomotive (within the 3-tile board range).
    F.state.player.x = train.path.length ? (F.util.unkey(train.path[0])[0] + 0.5) : a.x + 2.5;
    F.state.player.y = (F.util.unkey(train.path[0])[1] + 0.5) + 1;
    F.state.player.ridingTrain = null;

    const handlers = (F._inputKeys && F._inputKeys['enter']) || [];
    assert(handlers.length > 0, 'an "enter" key handler is registered');
    let handled = false;
    for (let i = 0; i < handlers.length && !handled; i++) handled = !!handlers[i]({});
    assert(handled, '"enter" handler reports it handled boarding');
    assert(F.state.player.ridingTrain === train.id, 'player is now riding the train');

    F.tick(); // runs F.player.tick, which applies the move override
    const locoPos = F.trains.carTransform(train, 0);
    const dx = Math.abs(F.state.player.x - locoPos.x), dy = Math.abs(F.state.player.y - locoPos.y);
    assert(dx < 0.05 && dy < 0.05, 'player position snapped to the locomotive (dx=' + dx.toFixed(3) + ' dy=' + dy.toFixed(3) + ')');

    // Leaving again should clear ridingTrain.
    let left = false;
    for (let i = 0; i < handlers.length && !left; i++) left = !!handlers[i]({});
    assert(F.state.player.ridingTrain === null, 'leaving clears ridingTrain');
    return 'boarded train #' + train.id;
  },
};
