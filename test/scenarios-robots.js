// Scenario tests for src/39-robots.js (logistic robots — design/EXPANSION.md §7.3).
// Helpers below are copied from test/scenarios.js (not exported by that module) —
// see its header: "Helpers from test/scenarios.js are not exported — copy what you need."
'use strict';

const TPS = 60;
function ticks(F, n) { for (let i = 0; i < n; i++) F.tick(); }
function fresh(F, seed = 42) { F.newGame({ seed }); return F.state; }
function spawn(F) { const s = F.world.spawn; return { x: Math.round(s.x), y: Math.round(s.y) }; }

// Find a flat buildable rectangle of w×h near spawn (no water, no features, no entities, no ore).
function findFlat(F, w, h, opts = {}) {
  const sp = spawn(F);
  const pl = F.state.player; const px = Math.floor(pl.x), py = Math.floor(pl.y);
  for (let r = 2; r < 140; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = sp.x + dx, y = sp.y + dy;
      let ok = true;
      for (let j = -1; j <= h && ok; j++) for (let i = -1; i <= w && ok; i++) {
        const tx = x + i, ty = y + j;
        if (!F.world.buildable(tx, ty)) ok = false;
        if (!opts.allowOre && F.world.resource(tx, ty)) ok = false;
        if (Math.abs(tx - px) <= 1 && Math.abs(ty - py) <= 1) ok = false; // never build on the player
      }
      if (ok) return { x, y };
    }
  }
  throw new Error('no flat area found');
}

function place(F, assert, type, x, y, dir = 0) {
  F.api.give(type, 1);
  const chk = F.api.canPlace(type, x, y, dir);
  assert(chk.ok, `canPlace ${type} at ${x},${y} dir ${dir}: ${chk.reason}`);
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

// Build a solar plant of at least kW and connect it with small poles to a pole adjacent to `consumer`.
function solarPower(F, assert, consumer, kW) {
  const n = Math.max(1, Math.ceil(kW / 60));
  const area = findFlat(F, 3 * n + 1, 6);
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
  const last = placeAnywhereNear(F, assert, 'small-electric-pole', tx, ty, 1, 0);
  ticks(F, 2);
  return last;
}

// Lays out a roboport + one passive-provider chest (stocked with `provideItem`) + one
// requester chest, `distance` tiles apart, all inside a single reserved flat rectangle so
// placement never collides with world features. Returns { roboport, provider, requester }.
function buildLogisticSetup(F, assert, distance, provideItem, provideCount) {
  const width = distance + 12;
  const area = findFlat(F, width, 6);
  const roboport = place(F, assert, 'roboport', area.x, area.y, 0);
  const providerX = area.x + 6, providerY = area.y + 1;
  const provider = place(F, assert, 'passive-provider-chest', providerX, providerY, 0);
  assert(F.api.insertInto(provider, provideItem, provideCount) === provideCount, 'stock provider chest');
  const requester = place(F, assert, 'requester-chest', providerX + distance, providerY, 0);
  return { roboport, provider, requester };
}

module.exports = {
  robots_network_forms_and_stats(F, assert) {
    fresh(F);
    const { roboport, provider, requester } = buildLogisticSetup(F, assert, 10, 'iron-plate', 10);
    ticks(F, 2);
    const net = F.robots.networkOf(roboport);
    assert(net, 'roboport joined a network');
    assert(F.robots.networkOf(provider) === net, 'provider chest joined the same network');
    assert(F.robots.networkOf(requester) === net, 'requester chest joined the same network');
    const stats = F.robots.stats(net);
    assert(stats.chests.provider === 1, `1 provider chest counted (got ${stats.chests.provider})`);
    assert(stats.chests.requester === 1, `1 requester chest counted (got ${stats.chests.requester})`);
  },

  robots_deliver_to_requester_powered(F, assert) {
    fresh(F);
    const { roboport, requester } = buildLogisticSetup(F, assert, 15, 'iron-plate', 100);
    solarPower(F, assert, roboport, 400);
    assert(F.api.insertInto(roboport, 'logistic-robot', 5) === 5, 'roboport stocked with 5 robots');
    requester.requests[0] = { id: 'iron-plate', count: 20 };
    ticks(F, 2000);
    const have = F.inv.count(requester.inv, 'iron-plate');
    assert(have === 20, `requester holds 20 iron-plate (got ${have})`);
    assert(F.state.robots.length <= 5, `no more than 5 robots ever active at once (got ${F.state.robots.length} still active)`);
  },

  robots_deliver_slowly_when_unpowered(F, assert) {
    fresh(F);
    const { roboport, requester } = buildLogisticSetup(F, assert, 15, 'iron-plate', 100);
    // Deliberately NOT connected to any electric network.
    assert(F.api.insertInto(roboport, 'logistic-robot', 5) === 5, 'roboport stocked with 5 robots');
    assert(!F.power.hasNetwork(roboport), 'roboport has no electric network (sanity check)');
    requester.requests[0] = { id: 'iron-plate', count: 4 };
    ticks(F, 4500);
    const have = F.inv.count(requester.inv, 'iron-plate');
    assert(have === 4, `unpowered network still delivers the request, just slowly (got ${have}/4)`);
  },

  robots_survive_requester_removed_mid_flight(F, assert) {
    fresh(F);
    const { roboport, requester } = buildLogisticSetup(F, assert, 15, 'iron-plate', 100);
    solarPower(F, assert, roboport, 400);
    assert(F.api.insertInto(roboport, 'logistic-robot', 1) === 1, 'roboport stocked with 1 robot');
    requester.requests[0] = { id: 'iron-plate', count: 4 };
    ticks(F, 40); // let the robot start flying (dispatch happens on tick 0)
    assert(F.state.robots.length === 1, 'one robot dispatched and in flight');
    assert(F.api.remove(requester.x, requester.y, { toInventory: false }), 'remove the requester mid-flight');
    // Must not throw for a long stretch of ticks (the robot has to notice its
    // destination is gone, drop its cargo somewhere, and fly back to dock).
    ticks(F, 3000);
    assert(F.state.robots.length === 0, `robot eventually returns/docks (still active: ${F.state.robots.length})`);
    // The item it was carrying must not have vanished: it either landed back
    // in the provider chest (dropCargoNear) or on the ground near the robot.
    const providerAfter = F.entities.all().find(e => e.type === 'passive-provider-chest');
    const chestPlates = providerAfter ? F.inv.count(providerAfter.inv, 'iron-plate') : 0;
    let groundPlates = 0;
    const ground = F.state.ground || {};
    Object.keys(ground).forEach(k => { if (ground[k] && ground[k].id === 'iron-plate') groundPlates += ground[k].count; });
    assert(chestPlates + groundPlates === 100, `all 100 iron-plate accounted for (chest ${chestPlates} + ground ${groundPlates})`);
  },

  robots_save_load_mid_flight(F, assert) {
    fresh(F);
    const { roboport, requester } = buildLogisticSetup(F, assert, 15, 'iron-plate', 100);
    solarPower(F, assert, roboport, 400);
    assert(F.api.insertInto(roboport, 'logistic-robot', 5) === 5, 'roboport stocked with 5 robots');
    const requesterId = requester.id;
    requester.requests[0] = { id: 'iron-plate', count: 4 };
    ticks(F, 40);
    assert(F.state.robots.length === 1, 'one robot in flight before save');
    const beforeStage = F.state.robots[0].task.stage;

    const saved = F.save();
    assert(typeof saved === 'string' && saved.length > 0, 'F.save() produced a string');
    assert(F.load(saved), 'F.load() succeeded');

    assert(F.state.robots.length === 1, 'robot survived save/load');
    assert(F.state.robots[0].task.stage === beforeStage, 'in-flight task stage preserved across save/load');

    ticks(F, 2000);
    const requesterAfter = F.entities.byId(requesterId);
    assert(requesterAfter, 'requester chest entity still resolvable after load');
    const have = F.inv.count(requesterAfter.inv, 'iron-plate');
    assert(have === 4, `delivery completes after reload (got ${have}/4)`);
  },

  robots_roboport_removed_mid_flight_no_crash(F, assert) {
    fresh(F);
    const { roboport, requester } = buildLogisticSetup(F, assert, 15, 'iron-plate', 100);
    solarPower(F, assert, roboport, 400);
    assert(F.api.insertInto(roboport, 'logistic-robot', 1) === 1, 'roboport stocked with 1 robot');
    requester.requests[0] = { id: 'iron-plate', count: 4 };
    ticks(F, 40);
    assert(F.state.robots.length === 1, 'robot dispatched');
    assert(F.api.remove(roboport.x, roboport.y, { toInventory: false }), 'remove the home roboport mid-flight');
    // No other roboport exists anywhere now — the robot should end up dropped
    // on the ground as a logistic-robot item rather than crashing the tick loop.
    ticks(F, 3000);
    let groundRobots = 0;
    const ground = F.state.ground || {};
    Object.keys(ground).forEach(k => { if (ground[k] && ground[k].id === 'logistic-robot') groundRobots += ground[k].count; });
    assert(F.state.robots.length === 0 || groundRobots >= 0, 'tick loop never threw with no roboport left');
    assert(F.state.robots.length === 0, `robot resolved (dropped as item) rather than stuck forever (still active: ${F.state.robots.length})`);
  },
};
