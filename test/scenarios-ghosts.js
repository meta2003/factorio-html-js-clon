// Scenario tests for src/51-ghosts.js (entity ghosts: planned buildings).
// Helpers copied from test/scenarios-robots.js (scenario files do not share helpers).
'use strict';

function ticks(F, n) { for (let i = 0; i < n; i++) F.tick(); }
function fresh(F, seed = 42) { F.newGame({ seed }); return F.state; }
function spawn(F) { const s = F.world.spawn; return { x: Math.round(s.x), y: Math.round(s.y) }; }

// Flat buildable w×h rectangle near spawn (no water, features, entities or ore), clear of the player.
function findFlat(F, w, h) {
  const sp = spawn(F);
  const pl = F.state.player; const px = Math.floor(pl.x), py = Math.floor(pl.y);
  for (let r = 2; r < 140; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = sp.x + dx, y = sp.y + dy;
      let ok = true;
      for (let j = -1; j <= h && ok; j++) for (let i = -1; i <= w && ok; i++) {
        const tx = x + i, ty = y + j;
        if (!F.world.buildable(tx, ty) || F.world.resource(tx, ty)) ok = false;
        if (Math.abs(tx - px) <= 1 && Math.abs(ty - py) <= 1) ok = false;
      }
      if (ok) return { x, y };
    }
  }
  throw new Error('no flat area found');
}

// Empty the player's inventory and hand so item counts are exact.
function clearInventory(F) {
  const p = F.state.player;
  for (let i = 0; i < p.inv.length; i++) p.inv[i] = null;
  p.cursor = null;
}

module.exports = {
  ghost_place_does_not_consume_or_create_entity(F, assert) {
    fresh(F);
    clearInventory(F);
    const a = findFlat(F, 3, 3);
    const entsBefore = F.state.entities.length;
    const g = F.ghosts.place('assembling-machine-1', a.x, a.y, 0);
    assert(g, 'ghost placed');
    assert(F.state.entities.length === entsBefore, 'no real entity created');
    assert(F.api.entityAt(a.x + 1, a.y + 1) === null, 'tile has no entity');
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
      assert(F.ghosts.at(a.x + i, a.y + j) === g, `ghost covers ${i},${j}`);
    }
    assert(F.world.buildable(a.x + 1, a.y + 1), 'ghost does not block real building');
    assert(F.ghosts.itemFor(g) === 'assembling-machine-1', 'item for ghost');
    ticks(F, 60);
    assert(F.ghosts.count() === 1, 'ghost survives ticking');
    return 'ghost at ' + a.x + ',' + a.y;
  },

  ghost_placement_validation(F, assert) {
    fresh(F);
    const a = findFlat(F, 4, 2);
    F.api.give('wooden-chest', 1);
    const chest = F.api.place('wooden-chest', a.x, a.y, 0, { fromInventory: true });
    assert(chest, 'real chest placed');
    assert(!F.ghosts.canPlace('wooden-chest', a.x, a.y, 0).ok, 'ghost refused on a real entity');
    assert(!F.ghosts.place('wooden-chest', a.x, a.y, 0), 'place returns null on a real entity');
    // Unknown / non-placeable types are refused.
    assert(!F.ghosts.canPlace('no-such-entity', a.x + 2, a.y, 0).ok, 'unknown type refused');
    // Water is refused.
    let water = null;
    const sp = spawn(F);
    for (let r = 0; r < 200 && !water; r++) for (let dx = -r; dx <= r && !water; dx++) for (let dy = -r; dy <= r && !water; dy++) {
      if (F.world.isWater(sp.x + dx, sp.y + dy)) water = { x: sp.x + dx, y: sp.y + dy };
    }
    assert(water, 'found a water tile');
    assert(!F.ghosts.place('wooden-chest', water.x, water.y, 0), 'ghost refused on water');
    // A ghost may sit under the player (a real chest may not).
    const p = F.state.player;
    const ptx = Math.floor(p.x), pty = Math.floor(p.y);
    if (F.world.buildable(ptx, pty)) {
      assert(!F.api.canPlace('wooden-chest', ptx, pty, 0).ok, 'real chest blocked by the player');
      assert(F.ghosts.place('wooden-chest', ptx, pty, 0), 'ghost allowed under the player');
    }
    return 'ok';
  },

  ghost_replaces_overlapping_ghosts(F, assert) {
    fresh(F);
    const a = findFlat(F, 4, 4);
    const b1 = F.ghosts.place('transport-belt', a.x, a.y, 1);
    const b2 = F.ghosts.place('transport-belt', a.x + 1, a.y, 1);
    assert(b1 && b2 && F.ghosts.count() === 2, 'two belt ghosts');
    const same = F.ghosts.place('transport-belt', a.x, a.y, 1);
    assert(same === b1 && F.ghosts.count() === 2, 'identical ghost is kept, not duplicated');
    const furnace = F.ghosts.place('stone-furnace', a.x, a.y, 0); // 2x2 over both belts
    assert(furnace, 'furnace ghost placed over belt ghosts');
    assert(F.ghosts.count() === 1 && F.ghosts.at(a.x + 1, a.y) === furnace, 'belt ghosts replaced');
    assert(F.ghosts.setDir(furnace, 1) === false, 'non-rotatable ghost not rotated');
    const belt = F.ghosts.place('transport-belt', a.x + 3, a.y + 3, 0);
    assert(F.ghosts.setDir(belt, 2) && belt.dir === 2, 'belt ghost rotated');
    assert(F.ghosts.removeAt(a.x + 3, a.y + 3) && F.ghosts.count() === 1, 'removeAt');
    assert(!F.ghosts.removeAt(a.x + 3, a.y + 3), 'removeAt on empty tile');
    return 'ok';
  },

  ghost_hand_build_consumes_item_and_applies_recipe(F, assert) {
    fresh(F);
    F.api.cheat.unlockAll();
    clearInventory(F);
    const a = findFlat(F, 3, 3);
    const g = F.ghosts.place('assembling-machine-1', a.x, a.y, 0, { recipe: 'iron-gear-wheel' });
    assert(g, 'ghost with recipe');
    assert(!F.ghosts.build(g), 'cannot build without the item');
    assert(F.ghosts.lastFailure === 'missing', 'failure reason missing: ' + F.ghosts.lastFailure);
    assert(F.ghosts.count() === 1, 'ghost kept after a failed build');
    F.api.give('assembling-machine-1', 2);
    const e = F.ghosts.build(g);
    assert(e && e.type === 'assembling-machine-1', 'built');
    assert(e.x === a.x && e.y === a.y, 'built at the ghost position');
    assert(e.recipe === 'iron-gear-wheel', 'recipe applied: ' + e.recipe);
    assert(F.api.inventoryCount('assembling-machine-1') === 1, 'one item consumed');
    assert(F.ghosts.count() === 0 && !F.ghosts.at(a.x, a.y), 'ghost gone');
    return 'recipe=' + e.recipe;
  },

  ghost_build_respects_reach(F, assert) {
    fresh(F);
    const p = F.state.player;
    const a = findFlat(F, 1, 1);
    F.api.give('wooden-chest', 1);
    const g = F.ghosts.place('wooden-chest', a.x, a.y, 0);
    assert(g, 'ghost placed');
    F.api.teleport(a.x + 40.5, a.y + 0.5);
    assert(!F.ghosts.build(g, { checkReach: true }), 'too far to build');
    assert(F.ghosts.lastFailure === 'too_far', 'reason too_far: ' + F.ghosts.lastFailure);
    F.api.teleport(a.x + 3.5, a.y + 0.5);
    assert(F.ghosts.build(g, { checkReach: true }), 'built within reach');
    assert(p.x === a.x + 3.5, 'player not moved');
    return 'ok';
  },

  ghost_fulfilled_by_normal_placement(F, assert) {
    fresh(F);
    F.api.cheat.unlockAll();
    const a = findFlat(F, 6, 3);
    // Same type at the same anchor: settings are handed over.
    const req = [{ id: 'iron-plate', count: 50 }, null, null, null, null, null];
    const rg = F.ghosts.place('requester-chest', a.x, a.y, 0, { requests: req });
    assert(rg, 'requester ghost');
    F.api.give('requester-chest', 1);
    const chestR = F.api.place('requester-chest', a.x, a.y, 0, { fromInventory: true });
    assert(chestR && chestR.requests[0] && chestR.requests[0].id === 'iron-plate' && chestR.requests[0].count === 50, 'requests applied');
    assert(chestR.requests.length === 6, 'six request slots');
    assert(!F.ghosts.at(a.x, a.y), 'requester ghost fulfilled');
    const cap = F.ghosts.captureSettings(chestR);
    assert(cap && cap.requests && cap.requests[0].count === 50, 'requests captured back');
    // A different entity overlapping a ghost removes it without taking its settings.
    const g = F.ghosts.place('assembling-machine-1', a.x + 2, a.y, 0, { recipe: 'iron-gear-wheel' });
    assert(g, 'assembler ghost');
    F.api.give('wooden-chest', 1);
    const chest = F.api.place('wooden-chest', a.x + 3, a.y + 1, 0, { fromInventory: true });
    assert(chest, 'chest placed inside the ghost footprint');
    assert(F.ghosts.count() === 0, 'overlapped ghost removed');
    return 'ok';
  },

  ghost_save_load_roundtrip(F, assert) {
    fresh(F);
    const a = findFlat(F, 6, 3);
    F.ghosts.place('assembling-machine-1', a.x, a.y, 0, { recipe: 'iron-gear-wheel' });
    F.ghosts.place('transport-belt', a.x + 4, a.y, 2);
    const json = F.save();
    assert(json, 'saved');
    fresh(F, 7); // different game in between: ghosts must not leak across
    assert(F.ghosts.count() === 0, 'new game has no ghosts');
    assert(F.load(json), 'loaded');
    assert(F.ghosts.count() === 2, 'two ghosts after load: ' + F.ghosts.count());
    const asm = F.ghosts.at(a.x + 2, a.y + 2);
    assert(asm && asm.type === 'assembling-machine-1' && asm.settings && asm.settings.recipe === 'iron-gear-wheel', 'assembler ghost + recipe restored');
    const belt = F.ghosts.at(a.x + 4, a.y);
    assert(belt && belt.dir === 2, 'belt ghost direction restored');
    const g3 = F.ghosts.place('wooden-chest', a.x + 5, a.y + 2, 0);
    assert(g3 && g3.id > Math.max(asm.id, belt.id), 'ids keep increasing after load');
    return 'ok';
  },

  ghost_old_save_without_ghosts_loads(F, assert) {
    fresh(F);
    const tree = JSON.parse(F.save());
    delete tree.ghosts;
    assert(F.load(JSON.stringify(tree)), 'loaded save without ghosts');
    assert(F.ghosts.count() === 0, 'no ghosts');
    const a = findFlat(F, 1, 1);
    assert(F.ghosts.place('wooden-chest', a.x, a.y, 0), 'can place ghosts afterwards');
    return 'ok';
  },

  ghost_capture_settings_roundtrip(F, assert) {
    fresh(F);
    F.api.cheat.unlockAll();
    const a = findFlat(F, 3, 3);
    F.api.give('assembling-machine-1', 1);
    const e = F.api.place('assembling-machine-1', a.x, a.y, 0, { fromInventory: true });
    assert(F.api.setRecipe(e, 'copper-cable'), 'recipe set');
    const s = F.ghosts.captureSettings(e);
    assert(s && s.recipe === 'copper-cable', 'captured recipe');
    F.api.give('wooden-chest', 1);
    const chest = F.api.place('wooden-chest', a.x + 4, a.y, 0, { fromInventory: true });
    assert(chest && F.ghosts.captureSettings(chest) === null, 'plain chest has no settings');
    F.api.give('inserter', 1);
    const ins = F.api.place('inserter', a.x + 4, a.y + 2, 1, { fromInventory: true });
    assert(ins && F.ghosts.captureSettings(ins) === null, 'default inserter has no settings');
    return 'ok';
  },
};
