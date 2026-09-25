// Scenario tests for rail signals and chain signals (src/38-trains.js "Rail signals").
// Each scenario receives (F, assert, window) and may return a note string.
'use strict';

// ---- helpers (same shape as test/scenarios-trains.js) ----
function fresh(F, seed) { F.newGame({ seed: seed == null ? 42 : seed }); return F.state; }
function ticks(F, n) { for (let i = 0; i < n; i++) F.tick(); }
function spawn(F) { const s = F.world.spawn; return { x: Math.round(s.x), y: Math.round(s.y) }; }

function findFlat(F, w, h) {
  const sp = spawn(F);
  const pl = F.state.player; const px = Math.floor(pl.x), py = Math.floor(pl.y);
  for (let r = 2; r < 200; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = sp.x + dx, y = sp.y + dy;
      let ok = true;
      for (let j = -1; j <= h && ok; j++) for (let i = -1; i <= w && ok; i++) {
        const tx = x + i, ty = y + j;
        if (!F.world.buildable(tx, ty)) ok = false;
        if (F.world.resource(tx, ty)) ok = false;
        if (Math.abs(tx - px) <= 1 && Math.abs(ty - py) <= 1) ok = false;
      }
      if (ok) return { x, y };
    }
  }
  throw new Error('no flat area found');
}

function place(F, assert, type, x, y, dir) {
  const e = F.api.place(type, x, y, dir || 0, { fromInventory: false });
  assert(e, 'place ' + type + ' at ' + x + ',' + y);
  return e;
}
// Straight east-west line of rail; returns nothing (callers place stops/signals themselves).
function railLine(F, assert, x0, y0, len) { for (let i = 0; i < len; i++) place(F, assert, 'rail', x0 + i, y0); }

// A locomotive (dir 1 = facing east) with fuel, on automatic, scheduled to one stop.
function autoTrain(F, assert, x, y, dir, stopName) {
  const loco = F.api.placeVirtual('locomotive', x, y, dir, { fromInventory: false });
  assert(loco, 'locomotive placed at ' + x + ',' + y);
  const train = F.state.trains[F.state.trains.length - 1];
  F.inv.add(loco.fuel, 'coal', 20);
  train.manual = false;
  train.schedule = [{ stop: stopName, wait: 'time', time: 1 }];
  train.cur = 0;
  return train;
}
// A parked locomotive: manual, no fuel, never moves by itself.
function parkedTrain(F, assert, x, y) {
  const loco = F.api.placeVirtual('locomotive', x, y, 1, { fromInventory: false });
  assert(loco, 'parked locomotive placed at ' + x + ',' + y);
  return F.state.trains[F.state.trains.length - 1];
}
function headX(F, train) { return F.util.unkey(train.path[0])[0]; }
function removeTrain(F, train) { const i = F.state.trains.indexOf(train); if (i >= 0) F.state.trains.splice(i, 1); }
function runUntil(F, n, fn) { for (let i = 0; i < n; i++) { F.tick(); if (fn()) return i + 1; } return -1; }

module.exports = {
  signal_splits_track_into_blocks(F, assert) {
    fresh(F, 11);
    const a = findFlat(F, 14, 4);
    railLine(F, assert, a.x, a.y, 12);
    const chk = F.api.canPlace('rail-signal', a.x + 3, a.y + 3, 0);
    assert(!chk.ok && chk.reason === 'no_rail', 'signal refused away from rails: ' + JSON.stringify(chk));
    assert(F.trains.blockOf(a.x + 2, a.y) === F.trains.blockOf(a.x + 9, a.y), 'unsignalled line is one block');

    const sig = place(F, assert, 'rail-signal', a.x + 5, a.y + 1, 0); // south of the rail, facing north
    assert(F.trains.signalRailTile(sig) === F.util.key(a.x + 5, a.y), 'signal guards the rail tile it faces');
    const west = F.trains.blockOf(a.x + 4, a.y), east = F.trains.blockOf(a.x + 6, a.y);
    assert(west != null && east != null && west !== east, 'signal splits the line into two blocks: ' + west + '/' + east);
    assert(F.trains.blockOf(a.x + 5, a.y) === null, 'the signal tile itself is a boundary, not in a block');
    assert(F.trains.signalAspect(sig) === 0, 'signal is green with no trains around');

    parkedTrain(F, assert, a.x + 9, a.y);
    assert(F.trains.signalAspect(sig) === 1, 'signal turns red once a train stands in a neighbouring block');

    F.api.remove(a.x + 5, a.y + 1, { toInventory: false });
    assert(F.trains.blockOf(a.x + 4, a.y) === F.trains.blockOf(a.x + 6, a.y), 'removing the signal merges the blocks again');
    return 'blocks ' + west + '/' + east;
  },

  signal_holds_train_until_block_clears(F, assert) {
    fresh(F, 12);
    const a = findFlat(F, 32, 4);
    railLine(F, assert, a.x, a.y, 30);
    const stop = place(F, assert, 'train-stop', a.x + 29, a.y + 1, 0);
    const sigX = a.x + 12;
    const sig = place(F, assert, 'rail-signal', sigX, a.y + 1, 0);
    const blocker = parkedTrain(F, assert, a.x + 20, a.y);
    const train = autoTrain(F, assert, a.x + 2, a.y, 1, stop.name);

    const waited = runUntil(F, 1500, () => train.state === 'wait_signal');
    assert(waited > 0, 'train stops for the red signal (state=' + train.state + ', head x=' + headX(F, train) + ')');
    ticks(F, 120);
    assert(train.state === 'wait_signal', 'train keeps waiting while the block is occupied (state=' + train.state + ')');
    assert(headX(F, train) === sigX - 1, 'train waits right in front of the signal tile (head x=' + headX(F, train) + ', signal x=' + sigX + ')');
    assert(F.trains.signalAspect(sig) === 1, 'signal shows red');

    // Survives a save/load while held.
    assert(F.load(F.save()), 'save/load while waiting at the signal');
    const t2 = F.state.trains.find(t => !t.manual);
    ticks(F, 60);
    assert(t2.state === 'wait_signal' && headX(F, t2) === sigX - 1, 'still held at the signal after load (state=' + t2.state + ')');

    removeTrain(F, F.state.trains.find(t => t.manual));
    const arrived = runUntil(F, 2000, () => t2.state === 'waiting');
    assert(arrived > 0, 'train drives on and reaches the stop once the block is free (state=' + t2.state + ', head x=' + headX(F, t2) + ')');
    return 'held ' + waited + ' ticks in, arrived ' + arrived + ' ticks after the block cleared';
  },

  chain_signal_waits_before_junction_block(F, assert) {
    // Rail: x0..x0+29. Chain signal at +8, rail signal at +14, a parked train at +18 (in the
    // block after the rail signal). The block +9..+13 (the "junction") is free, but its exit is
    // red, so the chain signal must keep the train out of it.
    fresh(F, 13);
    const a = findFlat(F, 32, 4);
    railLine(F, assert, a.x, a.y, 30);
    const stop = place(F, assert, 'train-stop', a.x + 29, a.y + 1, 0);
    const chain = place(F, assert, 'rail-chain-signal', a.x + 8, a.y + 1, 0);
    const exit = place(F, assert, 'rail-signal', a.x + 14, a.y + 1, 0);
    parkedTrain(F, assert, a.x + 18, a.y);
    const train = autoTrain(F, assert, a.x + 2, a.y, 1, stop.name);

    const waited = runUntil(F, 1500, () => train.state === 'wait_signal');
    assert(waited > 0, 'train waits (state=' + train.state + ')');
    ticks(F, 60);
    assert(headX(F, train) === a.x + 7, 'train waits at the chain signal, outside the junction block (head x=' + (headX(F, train) - a.x) + ')');
    assert(F.trains.signalAspect(chain) === 2, 'chain signal shows yellow (block free, exit red): ' + F.trains.signalAspect(chain));
    assert(F.trains.signalAspect(exit) === 1, 'exit signal shows red');

    removeTrain(F, F.state.trains.find(t => t.manual));
    const arrived = runUntil(F, 2000, () => train.state === 'waiting');
    assert(arrived > 0, 'train passes both signals once the exit clears (state=' + train.state + ')');
    return 'chain held the train at +7';
  },

  rail_signal_in_same_spot_lets_train_into_block(F, assert) {
    // Same layout with a plain rail signal instead of the chain signal: the train enters the
    // middle block and stops at the exit signal — the behaviour chain signals exist to avoid.
    fresh(F, 14);
    const a = findFlat(F, 32, 4);
    railLine(F, assert, a.x, a.y, 30);
    const stop = place(F, assert, 'train-stop', a.x + 29, a.y + 1, 0);
    place(F, assert, 'rail-signal', a.x + 8, a.y + 1, 0);
    place(F, assert, 'rail-signal', a.x + 14, a.y + 1, 0);
    parkedTrain(F, assert, a.x + 18, a.y);
    const train = autoTrain(F, assert, a.x + 2, a.y, 1, stop.name);
    const waited = runUntil(F, 1500, () => train.state === 'wait_signal');
    assert(waited > 0, 'train waits (state=' + train.state + ')');
    ticks(F, 60);
    assert(headX(F, train) === a.x + 13, 'train drove into the middle block and waits at the exit signal (head x=' + (headX(F, train) - a.x) + ')');
    return 'held at +13';
  },

  chain_signal_reserves_exit_block(F, assert) {
    // A train that passes a chain signal reserves the blocks up to and including the one after
    // the exit signal, so a train waiting at another signal into that block stays red.
    fresh(F, 15);
    const a = findFlat(F, 40, 4);
    railLine(F, assert, a.x, a.y, 38);
    const stop = place(F, assert, 'train-stop', a.x + 37, a.y + 1, 0);
    place(F, assert, 'rail-chain-signal', a.x + 8, a.y + 1, 0);
    place(F, assert, 'rail-signal', a.x + 14, a.y + 1, 0);
    place(F, assert, 'rail-signal', a.x + 30, a.y + 1, 0);
    const train = autoTrain(F, assert, a.x + 2, a.y, 1, stop.name);
    const exitBlock = F.trains.blockOf(a.x + 20, a.y);
    // Run until the nose is inside the junction block (between the chain and exit signals).
    const inside = runUntil(F, 1500, () => { const x = headX(F, train) - a.x; return x >= 9 && x <= 12; });
    assert(inside > 0, 'train entered the junction block');
    assert(Array.isArray(train._reserved) && train._reserved.indexOf(exitBlock) !== -1, 'exit block reserved: ' + JSON.stringify(train._reserved));
    // Nobody else may enter the exit block now, although no train stands in it yet.
    assert(!F.trains.blockFree(exitBlock), 'exit block counts as taken for other trains');
    assert(F.trains.blockFree(exitBlock, train.id), 'but not for the train holding the reservation');
    const arrived = runUntil(F, 2000, () => train.state === 'waiting');
    assert(arrived > 0, 'train arrives');
    assert(!train._reserved, 'reservations are released once the blocks were entered: ' + JSON.stringify(train._reserved));
    return 'reserved block ' + exitBlock;
  },

  signals_let_two_trains_share_a_loop(F, assert) {
    // A rectangular one-way loop (both trains run clockwise) with two stations and rail signals
    // all around. Without signals the second train would ride up on the first; with them both
    // keep circulating and neither ever has to stop for a train right in front of it.
    fresh(F, 16);
    const W = 30, H = 12;
    const a = findFlat(F, W + 2, H + 2);
    const x0 = a.x + 1, y0 = a.y + 1, x1 = x0 + W - 1, y1 = y0 + H - 1;
    for (let x = x0; x <= x1; x++) { place(F, assert, 'rail', x, y0); place(F, assert, 'rail', x, y1); }
    for (let y = y0 + 1; y < y1; y++) { place(F, assert, 'rail', x0, y); place(F, assert, 'rail', x1, y); }
    // Stations on the top and bottom straights (inside the loop), signals outside the loop.
    const stopTop = place(F, assert, 'train-stop', x0 + 20, y0 + 1, 0);
    const stopBot = place(F, assert, 'train-stop', x0 + 9, y1 - 1, 0);
    for (const sx of [x0 + 3, x0 + 12, x0 + 23]) place(F, assert, 'rail-signal', sx, y0 - 1, 2); // above top, facing south
    for (const sx of [x0 + 5, x0 + 16, x0 + 26]) place(F, assert, 'rail-signal', sx, y1 + 1, 0); // below bottom, facing north
    place(F, assert, 'rail-signal', x1 + 1, y0 + 6, 3); // right side, facing west
    place(F, assert, 'rail-signal', x0 - 1, y0 + 6, 1); // left side, facing east

    // Two single-locomotive trains on the top straight heading east (clockwise).
    const t1 = autoTrain(F, assert, x0 + 8, y0, 1, stopTop.name);
    const t2 = autoTrain(F, assert, x0 + 1, y0, 1, stopTop.name);
    for (const t of [t1, t2]) t.schedule = [{ stop: stopTop.name, wait: 'time', time: 1 }, { stop: stopBot.name, wait: 'time', time: 1 }];

    let visits1 = 0, visits2 = 0, prev1 = t1.state, prev2 = t2.state, blocked = 0, sigWaits = 0;
    for (let i = 0; i < 9000; i++) {
      F.tick();
      if (t1.state === 'waiting' && prev1 !== 'waiting') visits1++;
      if (t2.state === 'waiting' && prev2 !== 'waiting') visits2++;
      if (t1.state === 'wait_train' || t2.state === 'wait_train') blocked++;
      if (t2.state === 'wait_signal' && prev2 !== 'wait_signal') sigWaits++;
      prev1 = t1.state; prev2 = t2.state;
    }
    assert(visits1 >= 4 && visits2 >= 4, 'both trains keep visiting stations (t1=' + visits1 + ', t2=' + visits2 + ', states ' + t1.state + '/' + t2.state + ')');
    assert(blocked === 0, 'no train ever had to stop right behind another (' + blocked + ' ticks)');
    assert(sigWaits > 0, 'signals actually held a train at some point');
    return 'visits ' + visits1 + '/' + visits2 + ', signal stops ' + sigWaits;
  },

  signal_items_and_tech(F, assert) {
    const D = F.data;
    for (const id of ['rail-signal', 'rail-chain-signal']) {
      assert(D.items[id] && D.items[id].place === id, id + ': item places the entity');
      assert(D.entities[id] && D.entities[id].behaviour === 'rail-signal' && D.entities[id].rotatable, id + ': rotatable rail-signal entity');
      assert(D.recipes[id] && D.recipes[id].unlockedBy === 'rail-signals', id + ': recipe unlocked by rail-signals');
      assert(F.i18n.has('item.' + id) && F.i18n.has('ent.' + id), id + ': i18n');
    }
    assert(D.entities['rail-chain-signal'].signal.chain === true && D.entities['rail-signal'].signal.chain === false, 'chain flag');
    assert(D.techs['rail-signals'] && D.techs['rail-signals'].prereq.indexOf('automated-rail-transportation') !== -1, 'rail-signals tech after automated rail transportation');
    assert(F.i18n.has('status.wait_signal'), 'i18n status.wait_signal');
  },
};
