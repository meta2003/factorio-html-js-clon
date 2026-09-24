// Scenario tests for the Phase A core hook APIs implemented by the "A-sim" agent
// (design/EXPANSION.md §6.3, §6.4): F.inserters.addResolver, F.entities.*'s _ops
// fallback, F.api.addPlaceRule/registerVirtual/placeVirtual/addPicker, crude-oil
// wells (F.world.findOilNear / F.world.mineResource guard), F.player.addMoveOverride.
// Executed by test/headless.js alongside test/scenarios.js. Each scenario receives
// (F, assert, window) and may return a note string.
'use strict';

function ticks(F, n) { for (let i = 0; i < n; i++) F.tick(); }
function fresh(F, seed) { F.newGame({ seed: seed == null ? 42 : seed }); return F.state; }

module.exports = {
  // ---------------------------------------------------------------------
  // 10-world.js: crude-oil wells
  // ---------------------------------------------------------------------
  oil_wells_near_70_to_110(F, assert) {
    fresh(F, 42);
    const sp = F.world.spawn;
    const well = F.world.findOilNear(sp.x, sp.y, 130);
    assert(well, 'a crude-oil well exists within 130 tiles of spawn (guaranteed cluster is 70-110 out)');
    const d = Math.hypot(well.x - sp.x, well.y - sp.y);
    // the guaranteed cluster's wells scatter a little inside their chunk around the
    // 70-110 target distance; allow one chunk (32 tiles) of slack either side.
    assert(d >= 40 && d <= 145, `well at distance ${d.toFixed(1)} should be roughly 70-110 tiles out`);
    assert(well.amount >= 60 && well.amount <= 400, `well amount ${well.amount} in [60,400]`);
    assert(F.world.RES.CRUDE_OIL === 5, 'RES.CRUDE_OIL === 5');
    assert(F.world.RES_ITEM[5] === 'crude-oil', 'RES_ITEM[5] === crude-oil');
    const res = F.world.resource(well.x, well.y);
    assert(res && res.item === 'crude-oil' && res.amount === well.amount, 'F.world.resource() reports the well');
    return `well at ${well.x},${well.y} (${d.toFixed(0)} tiles, ${well.amount}%)`;
  },

  oil_wells_deterministic(F, assert) {
    fresh(F, 99);
    const sp = F.world.spawn;
    const a = F.world.findOilNear(sp.x, sp.y, 200);
    fresh(F, 99);
    const b = F.world.findOilNear(sp.x, sp.y, 200);
    assert(a && b, 'well found both times');
    assert(a.x === b.x && a.y === b.y && a.amount === b.amount, 'same seed -> same well (order-independent generation)');
  },

  oil_well_not_hand_or_drill_minable(F, assert) {
    fresh(F, 42);
    const sp = F.world.spawn;
    const well = F.world.findOilNear(sp.x, sp.y, 200);
    assert(well, 'a well exists');
    const before = F.world.resource(well.x, well.y);
    const item = F.world.mineResource(well.x, well.y, 1);
    assert(item === null, 'F.world.mineResource returns null for a crude-oil tile');
    const after = F.world.resource(well.x, well.y);
    assert(after && after.amount === before.amount, 'well amount unchanged by mineResource');
  },

  // ---------------------------------------------------------------------
  // 50-api.js: addPlaceRule
  // ---------------------------------------------------------------------
  place_rule_rejects(F, assert) {
    fresh(F, 42);
    const sp = { x: Math.round(F.world.spawn.x), y: Math.round(F.world.spawn.y) };
    // Find two distinct free 2x2 buildable spots (stone-furnace footprint):
    // one will be rejected by the rule, the other proves the rule is scoped.
    function findFree2x2(ox, oy) {
      const px = Math.floor(F.state.player.x), py = Math.floor(F.state.player.y);
      for (let r = 2; r < 80; r++) {
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = ox + dx, y = oy + dy;
          if (Math.abs(x - px) <= 2 && Math.abs(y - py) <= 2) continue; // stay clear of the player's own collision box
          if (F.world.buildable(x, y) && F.world.buildable(x + 1, y) && F.world.buildable(x, y + 1) && F.world.buildable(x + 1, y + 1) &&
              !F.world.resource(x, y) && !F.world.resource(x + 1, y) && !F.world.resource(x, y + 1) && !F.world.resource(x + 1, y + 1)) {
            return { x: x, y: y };
          }
        }
      }
      return null;
    }
    const rejectSpot = findFree2x2(sp.x, sp.y);
    assert(rejectSpot, 'found a free tile to target with the place rule');
    F.api.addPlaceRule('furnace', function (def, tx, ty, dir) {
      return (tx === rejectSpot.x && ty === rejectSpot.y) ? 'test_reason' : null;
    });
    const chk = F.api.canPlace('stone-furnace', rejectSpot.x, rejectSpot.y, 0);
    assert(!chk.ok && chk.reason === 'test_reason', 'registered place rule rejects with its reason: got ' + JSON.stringify(chk));
    // sanity: the rule is scoped to the exact tile, elsewhere placement is unaffected by it
    const freeSpot = findFree2x2(sp.x + 40, sp.y + 40);
    assert(freeSpot, 'found a second free tile for the sanity check');
    const chk2 = F.api.canPlace('stone-furnace', freeSpot.x, freeSpot.y, 0);
    assert(chk2.ok, 'unaffected tile still places fine: ' + JSON.stringify(chk2));
  },

  // ---------------------------------------------------------------------
  // 50-api.js: registerVirtual / getVirtual / placeVirtual
  // ---------------------------------------------------------------------
  virtual_place_consumes_item(F, assert) {
    fresh(F, 42);
    let placedAt = null;
    F.api.registerVirtual('iron-plate', {
      canPlace(tx, ty, dir) { return { ok: true }; },
      place(tx, ty, dir) { placedAt = { tx, ty, dir }; return { kind: 'test-virtual', x: tx, y: ty, dir: dir }; },
    });
    assert(F.api.getVirtual('iron-plate'), 'getVirtual returns the registered spec');
    const before = F.api.inventoryCount('iron-plate');
    assert(before > 0, 'player starts with iron-plate for this test to be meaningful');
    const obj = F.api.placeVirtual('iron-plate', 500, 500, 0, { fromInventory: true });
    assert(obj && obj.kind === 'test-virtual', 'placeVirtual returns the placed object');
    assert(placedAt && placedAt.tx === 500 && placedAt.ty === 500, 'place() received the right tile');
    assert(F.api.inventoryCount('iron-plate') === before - 1, 'placeVirtual consumed exactly one item from inventory');

    // canPlace:false -> refused, no consumption
    F.api.registerVirtual('copper-plate', { canPlace() { return { ok: false, reason: 'nope' }; }, place() { return { kind: 'x' }; } });
    const before2 = F.api.inventoryCount('copper-plate');
    const obj2 = F.api.placeVirtual('copper-plate', 501, 500, 0, { fromInventory: true });
    assert(obj2 === null, 'placeVirtual refused when canPlace says not ok');
    assert(F.api.inventoryCount('copper-plate') === before2, 'refused placement does not consume the item');
  },

  // ---------------------------------------------------------------------
  // 50-api.js: addPicker / pickAt
  // ---------------------------------------------------------------------
  picker_returns_first_match(F, assert) {
    fresh(F, 42);
    F.api.addPicker(function (wx, wy) { return null; }); // always misses
    F.api.addPicker(function (wx, wy) {
      if (Math.abs(wx - 777.5) < 0.01 && Math.abs(wy - 777.5) < 0.01) return { kind: 'test-pick', label: 'Test' };
      return null;
    });
    const hit = F.api.pickAt(777.5, 777.5);
    assert(hit && hit.kind === 'test-pick', 'pickAt returns the first non-null picker result');
    const miss = F.api.pickAt(1.5, 1.5);
    assert(miss === null, 'pickAt returns null when no picker matches');
  },

  // ---------------------------------------------------------------------
  // 31-inserters.js + 20-entities.js: resolver-provided virtual container
  // ---------------------------------------------------------------------
  inserter_moves_item_into_resolver_container(F, assert) {
    fresh(F, 42);
    // F.world.spawn is FLOAT (player centre), not a tile coordinate — round it,
    // otherwise every tile computed below (and the resolver's own x/y) ends up
    // fractional and never matches the inserter's (integer) pickup/drop tiles.
    const sp = { x: Math.round(F.world.spawn.x), y: Math.round(F.world.spawn.y) };
    // Find a flat 3-tile-wide strip (chest, inserter, virtual-container tile) away from other stuff.
    let base = null;
    for (let r = 2; r < 100 && !base; r++) {
      for (let dy = -r; dy <= r && !base; dy++) for (let dx = -r; dx <= r && !base; dx++) {
        const x = sp.x + dx, y = sp.y + dy;
        let ok = true;
        for (let i = -1; i <= 2 && ok; i++) { // covers chest(x), inserter(x+1), container(x+2)
          if (!F.world.buildable(x + i, y) || F.world.resource(x + i, y)) ok = false;
        }
        const px = Math.floor(F.state.player.x), py = Math.floor(F.state.player.y);
        if (Math.abs(x - px) <= 2 && Math.abs(y - py) <= 2) ok = false;
        if (ok) base = { x, y };
      }
    }
    assert(base, 'found a 3-tile-wide flat strip');

    // Layout: chest at base.x (source) -> burner-inserter at base.x+1 facing EAST (dir 1, so its
    // pickup/behind tile = base.x, drop/front tile = base.x+2) -> virtual container resolver-provided
    // at base.x+2 (like a stopped train wagon: a duck-typed object with `_ops` instead of a grid entity).
    const container = { type: 'test-wagon', x: base.x + 2, y: base.y, inv: [] };
    container._ops = {
      accepts(item) { return 50; }, // always room
      insert(item, count) { container.inv.push({ id: item, count: count }); return count; },
      take() { return null; },
    };
    F.inserters.addResolver(function (tx, ty) {
      return (tx === container.x && ty === container.y) ? container : null;
    });

    F.api.give('wooden-chest', 1);
    F.api.give('burner-inserter', 1);
    F.api.give('coal', 5);
    F.api.give('iron-plate', 10);

    const chestOk = F.api.canPlace('wooden-chest', base.x, base.y, 0);
    assert(chestOk.ok, 'can place source chest: ' + JSON.stringify(chestOk));
    const chest = F.api.place('wooden-chest', base.x, base.y, 0, { fromInventory: true });
    assert(chest, 'chest placed');
    F.api.insertInto(chest, 'iron-plate', 10);

    const ins = F.api.place('burner-inserter', base.x + 1, base.y, 1, { fromInventory: true });
    assert(ins, 'inserter placed between chest and virtual container');
    F.api.insertInto(ins, 'coal', 2);

    ticks(F, 300);

    let total = 0;
    for (let i = 0; i < container.inv.length; i++) total += container.inv[i].count;
    assert(total > 0, 'inserter moved at least one iron-plate into the resolver-provided virtual container (got ' + total + ')');
    return `moved ${total} iron-plate into virtual container`;
  },

  // ---------------------------------------------------------------------
  // 20-entities.js: _ops fallback used directly (no inserter involved)
  // ---------------------------------------------------------------------
  entities_ops_fallback_direct(F, assert) {
    fresh(F, 42);
    const store = [];
    const obj = {
      type: 'not-a-real-entity-type',
      _ops: {
        accepts(item) { return item === 'wood' ? 10 : 0; },
        insert(item, count) { if (item !== 'wood') return 0; store.push(count); return count; },
        take(filterFn) { return store.length ? 'wood' : null; },
      },
    };
    assert(F.entities.canAcceptItem(obj, 'wood') === 10, 'canAcceptItem falls back to _ops.accepts');
    assert(F.entities.canAcceptItem(obj, 'stone') === 0, '_ops.accepts respected for non-matching item');
    assert(F.entities.insertItem(obj, 'wood', 3) === 3, 'insertItem falls back to _ops.insert');
    assert(store[0] === 3, '_ops.insert actually ran');
    assert(F.entities.takeItem(obj, null) === 'wood', 'takeItem falls back to _ops.take');
  },

  // ---------------------------------------------------------------------
  // 40-player.js: addMoveOverride
  // ---------------------------------------------------------------------
  player_move_override_blocks_walking(F, assert) {
    fresh(F, 42);
    const p = F.state.player;
    const x0 = p.x, y0 = p.y;
    let called = 0;
    F.player.addMoveOverride(function (pl, input) {
      called++;
      return true; // claim we handled movement -> normal walking must be skipped
    });
    F.tick(); // one tick with default (zero) input; override always returns true regardless
    assert(called >= 1, 'move override was consulted');
    // Feed explicit WASD-like input via F.input.state when available, else fall back to F.tick()
    // alone (F.state.player moves only through F.player.tick(F.input.state) per ARCHITECTURE §18).
    if (F.input && F.input.state) { F.input.state.mx = 1; F.input.state.my = 0; }
    ticks(F, 10);
    if (F.input && F.input.state) { F.input.state.mx = 0; F.input.state.my = 0; }
    assert(p.x === x0 && p.y === y0, 'player position unchanged while an override claims the movement step');
  },
};
