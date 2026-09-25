// Scenario tests for src/53-construction.js (construction robots build ghosts), plus the
// roboport second robot slot and the "mining a roboport/logistic chest keeps its contents" fix.
// Helpers copied from test/scenarios-robots.js (scenario files do not share helpers).
'use strict';

function ticks(F, n) { for (let i = 0; i < n; i++) F.tick(); }
function fresh(F, seed = 42) { F.newGame({ seed }); return F.state; }
function spawn(F) { const s = F.world.spawn; return { x: Math.round(s.x), y: Math.round(s.y) }; }

function findFlat(F, w, h, skip = 0) {
  const sp = spawn(F);
  const pl = F.state.player; const px = Math.floor(pl.x), py = Math.floor(pl.y);
  let found = 0;
  for (let r = 2; r < 200; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = sp.x + dx, y = sp.y + dy;
      let ok = true;
      for (let j = -1; j <= h && ok; j++) for (let i = -1; i <= w && ok; i++) {
        const tx = x + i, ty = y + j;
        if (!F.world.buildable(tx, ty) || F.world.resource(tx, ty) || F.ghosts.at(tx, ty)) ok = false;
        if (Math.abs(tx - px) <= 2 && Math.abs(ty - py) <= 2) ok = false;
      }
      if (ok && found++ >= skip) return { x, y };
    }
  }
  throw new Error('no flat area found');
}

function place(F, assert, type, x, y, dir = 0) {
  F.api.give(type, 1);
  const e = F.api.place(type, x, y, dir, { fromInventory: true });
  assert(e, `place ${type} at ${x},${y}`);
  return e;
}

function placeAnywhereNear(F, assert, type, cx, cy, radius, dir = 0) {
  for (let r = 0; r <= radius; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    if (F.api.canPlace(type, cx + dx, cy + dy, dir).ok) return place(F, assert, type, cx + dx, cy + dy, dir);
  }
  assert(false, `no room for ${type} near ${cx},${cy}`);
}

function solarPower(F, assert, consumer, kW) {
  const n = Math.max(1, Math.ceil(kW / 60));
  const area = findFlat(F, 3 * n + 1, 6, 6);
  for (let i = 0; i < n; i++) place(F, assert, 'solar-panel', area.x + 3 * i, area.y, 0);
  let px = area.x + 1, py = area.y + 3;
  place(F, assert, 'small-electric-pole', px, py, 0);
  const tx = consumer.x - 1, ty = consumer.y - 1;
  let guard = 0;
  while ((Math.abs(px - tx) > 5 || Math.abs(py - ty) > 5) && guard++ < 80) {
    const nx = px + Math.sign(tx - px) * Math.min(5, Math.abs(tx - px));
    const ny = py + Math.sign(ty - py) * Math.min(5, Math.abs(ty - py));
    const p = placeAnywhereNear(F, assert, 'small-electric-pole', nx, ny, 2, 0);
    px = p.x; py = p.y;
  }
  placeAnywhereNear(F, assert, 'small-electric-pole', tx, ty, 1, 0);
  ticks(F, 2);
}

// Roboport + storage chest side by side in a flat 12x6 area, robots stocked, powered.
function setup(F, assert, robots = 5, opts = {}) {
  const a = findFlat(F, 12, 6);
  const rp = place(F, assert, 'roboport', a.x, a.y, 0);
  const chest = place(F, assert, 'storage-chest', a.x + 5, a.y + 1, 0);
  if (robots) assert(F.api.insertInto(rp, 'construction-robot', robots) === robots, 'roboport takes construction robots');
  if (opts.power !== false) solarPower(F, assert, rp, 200);
  return { a, rp, chest };
}

function runUntil(F, pred, max) {
  for (let i = 0; i < max; i++) { if (pred()) return i; F.tick(); }
  return pred() ? max : -1;
}

module.exports = {
  construction_mining_roboport_and_logistic_chest_keeps_contents(F, assert) {
    fresh(F);
    const a = findFlat(F, 8, 4);
    const chest = place(F, assert, 'passive-provider-chest', a.x, a.y);
    F.api.insertInto(chest, 'iron-plate', 30);
    const rp = place(F, assert, 'roboport', a.x + 2, a.y);
    F.api.insertInto(rp, 'logistic-robot', 7);
    F.api.insertInto(rp, 'construction-robot', 4);
    const p0 = F.api.inventoryCount('iron-plate'), l0 = F.api.inventoryCount('logistic-robot'), c0 = F.api.inventoryCount('construction-robot');
    assert(F.api.remove(a.x, a.y) && F.api.remove(a.x + 2, a.y), 'both removed');
    const dp = F.api.inventoryCount('iron-plate') - p0, dl = F.api.inventoryCount('logistic-robot') - l0, dc = F.api.inventoryCount('construction-robot') - c0;
    assert(dp === 30 && dl === 7 && dc === 4, `contents returned: plates ${dp}, logistic ${dl}, construction ${dc}`);
    assert(F.robots.networks().length === 0, 'network gone');
    return 'ok';
  },

  construction_roboport_two_robot_slots(F, assert) {
    fresh(F);
    const a = findFlat(F, 4, 4);
    const rp = place(F, assert, 'roboport', a.x, a.y);
    assert(F.api.insertInto(rp, 'construction-robot', 10) === 10, 'construction robots in');
    assert(F.api.insertInto(rp, 'logistic-robot', 3) === 3, 'logistic robots in');
    assert(F.inv.count(rp.cbots, 'construction-robot') === 10 && F.inv.count(rp.robots, 'logistic-robot') === 3, 'separate slots');
    assert(F.api.insertInto(rp, 'iron-plate', 1) === 0, 'other items refused');
    assert(F.entities.canAcceptItem(rp, 'construction-robot') === 40, 'room for 40 more');
    // Old save: roboport without cbots gets the slot on load.
    const tree = JSON.parse(F.save());
    for (const e of tree.entities) if (e.type === 'roboport') delete e.cbots;
    assert(F.load(JSON.stringify(tree)), 'loaded');
    const rp2 = F.api.entityAt(a.x, a.y);
    assert(Array.isArray(rp2.cbots) && rp2.cbots.length === 1, 'cbots slot added on load');
    return 'ok';
  },

  construction_robot_builds_ghost_from_storage(F, assert) {
    fresh(F);
    const { a, rp, chest } = setup(F, assert, 3);
    F.api.insertInto(chest, 'wooden-chest', 5);
    const t = findFlat(F, 1, 1, 3);
    const g = F.ghosts.place('wooden-chest', t.x, t.y, 0);
    assert(g, 'ghost placed at ' + t.x + ',' + t.y);
    assert(F.construction.networkForTile(t.x, t.y), 'ghost inside the construction area');
    const n = runUntil(F, () => F.api.entityAt(t.x, t.y), 60 * 60);
    assert(n >= 0, 'built within a minute');
    assert(F.ghosts.count() === 0, 'ghost gone');
    assert(F.inv.count(chest.inv, 'wooden-chest') === 4, 'one chest item used');
    runUntil(F, () => F.construction.count() === 0, 60 * 60);
    assert(F.construction.count() === 0 && F.inv.count(rp.cbots, 'construction-robot') === 3, 'robot docked back');
    return 'built after ' + n + ' ticks (' + a.x + ',' + a.y + ')';
  },

  construction_robots_build_pasted_blueprint_with_recipe(F, assert) {
    fresh(F);
    F.api.cheat.unlockAll();
    const { chest } = setup(F, assert, 10);
    F.api.insertInto(chest, 'assembling-machine-1', 2);
    F.api.insertInto(chest, 'inserter', 2);
    const bp = { w: 7, h: 3, entities: [
      { type: 'assembling-machine-1', x: 0, y: 0, dir: 0, settings: { recipe: 'iron-gear-wheel' } },
      { type: 'inserter', x: 3, y: 1, dir: 1 },
      { type: 'assembling-machine-1', x: 4, y: 0, dir: 0, settings: { recipe: 'copper-cable' } },
    ] };
    const t = findFlat(F, 7, 3, 2);
    const res = F.blueprints.place(bp, t.x, t.y);
    assert(res.placed === 3, 'three ghosts: ' + JSON.stringify(res));
    const n = runUntil(F, () => F.ghosts.count() === 0, 60 * 90);
    assert(n >= 0, 'all built, ghosts left: ' + F.ghosts.count());
    const a1 = F.api.entityAt(t.x, t.y), a2 = F.api.entityAt(t.x + 4, t.y), ins = F.api.entityAt(t.x + 3, t.y + 1);
    assert(a1.recipe === 'iron-gear-wheel' && a2.recipe === 'copper-cable', 'recipes applied: ' + a1.recipe + ', ' + a2.recipe);
    assert(ins.type === 'inserter' && ins.dir === 1, 'inserter direction');
    return 'built in ' + n + ' ticks';
  },

  construction_missing_materials_and_out_of_range(F, assert) {
    fresh(F);
    const { rp, chest } = setup(F, assert, 3);
    const t = findFlat(F, 1, 1, 3);
    F.ghosts.place('iron-chest', t.x, t.y, 0); // no iron chest anywhere in the network
    ticks(F, F.construction.DISPATCH + 1);
    const st = F.construction.stats(F.robots.networkOf(rp));
    assert(st.ghosts === 1 && st.missing === 1 && st.busy === 0, 'missing counted: ' + JSON.stringify(st));
    assert(F.construction.count() === 0, 'no robot sent');
    // Far away (beyond 55 tiles): never built even with the item available.
    F.api.insertInto(chest, 'wooden-chest', 5);
    const c = F.entities.center(rp);
    let far = null;
    for (let d = 70; d < 200 && !far; d++) {
      if (F.ghosts.canPlace('wooden-chest', Math.floor(c[0]) + d, Math.floor(c[1]), 0).ok) far = { x: Math.floor(c[0]) + d, y: Math.floor(c[1]) };
    }
    assert(far, 'found a far tile');
    F.ghosts.place('wooden-chest', far.x, far.y, 0);
    assert(!F.construction.networkForTile(far.x, far.y), 'outside coverage');
    ticks(F, 60 * 10);
    assert(!F.api.entityAt(far.x, far.y) && F.ghosts.at(far.x, far.y), 'far ghost untouched');
    assert(F.inv.count(chest.inv, 'wooden-chest') === 5, 'no item taken for it');
    return 'ok';
  },

  construction_ghost_cancelled_mid_flight_returns_item(F, assert) {
    fresh(F);
    const { rp, chest } = setup(F, assert, 1);
    F.api.insertInto(chest, 'wooden-chest', 1);
    const t = findFlat(F, 1, 1, 12);
    const g = F.ghosts.place('wooden-chest', t.x, t.y, 0);
    const n = runUntil(F, () => F.construction.count() > 0, 60 * 5);
    assert(n >= 0, 'robot dispatched');
    assert(F.inv.count(chest.inv, 'wooden-chest') === 0, 'item reserved');
    F.ghosts.remove(g);
    runUntil(F, () => F.construction.count() === 0, 60 * 90);
    assert(F.construction.count() === 0, 'robot came home');
    assert(F.inv.count(chest.inv, 'wooden-chest') === 1, 'item back in the storage chest');
    assert(F.inv.count(rp.cbots, 'construction-robot') === 1, 'robot back in the roboport');
    assert(!F.api.entityAt(t.x, t.y), 'nothing built');
    return 'ok';
  },

  construction_save_load_mid_flight(F, assert) {
    fresh(F);
    const { rp, chest } = setup(F, assert, 2);
    F.api.insertInto(chest, 'wooden-chest', 2);
    const t = findFlat(F, 1, 1, 12);
    F.ghosts.place('wooden-chest', t.x, t.y, 0);
    runUntil(F, () => F.construction.count() > 0, 60 * 5);
    ticks(F, 10);
    const json = F.save();
    assert(F.load(json), 'loaded');
    assert(F.construction.count() === 1, 'robot still flying after load');
    const n = runUntil(F, () => F.api.entityAt(t.x, t.y), 60 * 60);
    assert(n >= 0, 'built after load');
    runUntil(F, () => F.construction.count() === 0, 60 * 60);
    const rp2 = F.api.entityAt(rp.x, rp.y);
    assert(F.inv.count(rp2.cbots, 'construction-robot') === 2, 'both robots home');
    return 'ok';
  },

  construction_roboport_removed_mid_flight(F, assert) {
    fresh(F);
    const { rp, chest } = setup(F, assert, 1, { power: false });
    F.api.insertInto(chest, 'wooden-chest', 1);
    const t = findFlat(F, 1, 1, 12);
    F.ghosts.place('wooden-chest', t.x, t.y, 0);
    runUntil(F, () => F.construction.count() > 0, 60 * 5);
    const r0 = F.api.inventoryCount('construction-robot');
    assert(F.api.remove(rp.x, rp.y), 'roboport mined');
    runUntil(F, () => F.construction.count() === 0, 60 * 300);
    assert(F.construction.count() === 0, 'robot gone from the air');
    let onGround = 0;
    for (const k in F.state.ground) if (F.state.ground[k] && F.state.ground[k].id === 'construction-robot') onGround += F.state.ground[k].count;
    assert(onGround === 1, 'robot dropped itself as an item: ' + onGround);
    assert(F.api.inventoryCount('construction-robot') === r0, 'nothing duplicated into the inventory');
    return 'ok';
  },

  construction_tech_tree(F, assert) {
    fresh(F);
    const D = F.data;
    const t = D.techs['construction-robotics'];
    assert(t && t.prereq.indexOf('robotics') >= 0, 'construction-robotics after robotics');
    assert(t.unlocks.indexOf('roboport') >= 0 && t.unlocks.indexOf('construction-robot') >= 0, 'unlocks roboport + robot');
    assert(D.recipes['roboport'].unlockedBy === 'construction-robotics', 'roboport recipe unlocked by it');
    assert(D.techs['logistic-robotics'].prereq.indexOf('construction-robotics') >= 0, 'logistic robotics comes after');
    assert(D.items['construction-robot'] && !D.items['construction-robot'].place, 'robot item is not placeable');
    assert(F.t('tech.construction-robotics') !== 'tech.construction-robotics', 'tech name translated');
    return 'ok';
  },
};
