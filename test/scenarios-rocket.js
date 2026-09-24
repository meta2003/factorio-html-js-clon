// Scenario tests for the rocket silo (src/45-rocket.js). See design/EXPANSION.md §7.4.
// Helpers copied from test/scenarios.js (not exported by that module).
'use strict';

const TPS = 60;
function ticks(F, n) { for (let i = 0; i < n; i++) F.tick(); }
function fresh(F, seed = 42) { F.newGame({ seed }); return F.state; }
function spawn(F) { const s = F.world.spawn; return { x: Math.round(s.x), y: Math.round(s.y) }; }

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
        if (Math.abs(tx - px) <= 1 && Math.abs(ty - py) <= 1) ok = false;
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

// Like test/scenarios.js's placeAnywhereNear, but first clears any tree/rock feature on each
// candidate tile (F.world.buildable() refuses a tile with a feature on it — see ARCHITECTURE.md
// §5 — and a 1x1 pole has no reason to be blocked by a tree it could just as well stand next to).
// This is what makes the rocket silo's long solar-to-consumer pole chain (below) robust against
// whatever trees/rocks happen to be scattered along the path on a given seed; only real obstacles
// (water, other entities) still count against `radius`.
function placeAnywhereNearClearing(F, assert, type, cx, cy, radius, dir = 0) {
  for (let r = 0; r <= radius; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    const tx = cx + dx, ty = cy + dy;
    if (F.world.feature(tx, ty)) F.world.removeFeature(tx, ty);
    if (F.api.canPlace(type, tx, ty, dir).ok) return place(F, assert, type, tx, ty, dir);
  }
  assert(false, `no room for ${type} near ${cx},${cy} (radius ${radius})`);
}

// Build a solar plant of at least kW and connect it with small poles to a pole adjacent to
// `consumer`. Unlike test/scenarios.js's version (fine for the small (<=few hundred kW) loads
// it's used for there), the rocket silo needs 1000 kW = 17 solar panels spread over 51 tiles, far
// wider than one small-electric-pole's 5x5 supply area (reach 7.5, supply half-width 2.5) can
// cover — so this copy gives EVERY panel its own pole (poles 3 tiles apart are well within wire
// reach of each other, so the whole row still joins into one network) instead of a single pole
// for the row. The connecting chain from that row to `consumer` walks in short (<=3 tile) hops
// with a generous (radius 4, feature-clearing) search per hop so consecutive poles always stay
// within wire reach (7.5) even when a hop has to dodge water — see placeAnywhereNearClearing.
function solarPower(F, assert, consumer, kW) {
  const n = Math.max(1, Math.ceil(kW / 60));
  const area = findFlat(F, 3 * n + 1, 6);
  const rowPoles = [];
  for (let i = 0; i < n; i++) {
    place(F, assert, 'solar-panel', area.x + 3 * i, area.y, 0);
    rowPoles.push(place(F, assert, 'small-electric-pole', area.x + 3 * i + 1, area.y + 3, 0));
  }
  let px = rowPoles[0].x, py = rowPoles[0].y;
  const tx = consumer.x - 1, ty = consumer.y - 1;
  let guard = 0;
  while ((Math.abs(px - tx) > 3 || Math.abs(py - ty) > 3) && guard++ < 200) {
    const nx = px + Math.sign(tx - px) * Math.min(3, Math.abs(tx - px));
    const ny = py + Math.sign(ty - py) * Math.min(3, Math.abs(ty - py));
    const p = placeAnywhereNearClearing(F, assert, 'small-electric-pole', nx, ny, 4, 0);
    px = p.x; py = p.y;
  }
  const last = placeAnywhereNearClearing(F, assert, 'small-electric-pole', tx, ty, 4, 0);
  ticks(F, 2);
  return last;
}

const PART_ITEMS = ['low-density-structure', 'rocket-fuel', 'rocket-control-unit'];

// Places a powered (1000 kW) rocket silo and returns its entity.
function buildPoweredSilo(F, assert, seed) {
  fresh(F, seed);
  const a = findFlat(F, 11, 11);
  const e = place(F, assert, 'rocket-silo', a.x, a.y, 0);
  solarPower(F, assert, e, 1000);
  ticks(F, 5);
  return e;
}

// Keeps topping off the silo's 3 input slots (like a real inserter would: only ever inserting up
// to F.entities.canAcceptItem's current room, not an arbitrary amount — F.api.insertInto/behaviour
// insert() do not self-limit, by the same convention as the furnace/assembler inputs) and ticks
// until `stage` is reached (or the tick budget runs out). Returns the number of ticks actually run.
function feedUntilStage(F, e, stage, maxTicks) {
  let t = 0;
  while (e.stage !== stage && t < maxTicks) {
    for (const id of PART_ITEMS) {
      const room = F.entities.canAcceptItem(e, id);
      if (room > 0) F.api.insertInto(e, id, room);
    }
    F.tick();
    t++;
  }
  return t;
}

module.exports = {
  rocket_silo_reaches_ready(F, assert) {
    const e = buildPoweredSilo(F, assert, 101);
    const t = feedUntilStage(F, e, 'ready', 6000);
    assert(e.stage === 'ready', `silo reached ready (stage=${e.stage}, parts=${e.parts}/20) after ${t} ticks`);
    return `ready after ${t} ticks, parts=${e.parts}`;
  },

  rocket_launch_with_satellite_autolaunch_gives_reward(F, assert) {
    const e = buildPoweredSilo(F, assert, 102);
    feedUntilStage(F, e, 'ready', 6000);
    assert(e.stage === 'ready', 'reached ready before satellite test');
    assert(F.api.insertInto(e, 'satellite', 1) === 1, 'satellite inserted');
    e.autoLaunch = true;
    ticks(F, 2);
    assert(e.stage === 'launching', `autolaunch triggered launching (stage=${e.stage})`);
    ticks(F, 1200 + 30);
    assert(e.stage === 'cooldown' || e.stage === 'building', `launch sequence completed (stage=${e.stage})`);
    const outCount = F.inv.count(e.output, 'space-science-pack');
    assert(outCount === 1000, `output has 1000 space-science-pack (got ${outCount})`);
    assert(F.state.rocket.launches === 1, `F.state.rocket.launches === 1 (got ${F.state.rocket.launches})`);
    assert(F.state.rocket.firstLaunchTick != null, 'firstLaunchTick recorded');
    return `launches=${F.state.rocket.launches} output=${outCount}`;
  },

  rocket_launch_without_satellite_gives_no_reward(F, assert) {
    const e = buildPoweredSilo(F, assert, 103);
    feedUntilStage(F, e, 'ready', 6000);
    assert(e.stage === 'ready', 'reached ready without satellite');
    assert(F.rocket.launch(e) === false, 'launch refused without satellite and without force');
    assert(F.rocket.launch(e, { force: true }) === true, 'forced launch without satellite succeeds');
    assert(e.stage === 'launching', 'forced launch enters launching stage');
    ticks(F, 1200 + 30);
    const outCount = F.inv.count(e.output, 'space-science-pack');
    assert(outCount === 0, `no reward without a satellite (got ${outCount})`);
    assert(F.state.rocket.launches === 1, `launch still counted (got ${F.state.rocket.launches})`);
    return `outCount=${outCount} launches=${F.state.rocket.launches}`;
  },

  rocket_save_load_during_launching_resumes(F, assert) {
    const e = buildPoweredSilo(F, assert, 104);
    feedUntilStage(F, e, 'ready', 6000);
    assert(F.api.insertInto(e, 'satellite', 1) === 1, 'satellite inserted');
    assert(F.rocket.launch(e) === true, 'manual launch with satellite succeeds');
    ticks(F, 300);
    assert(e.stage === 'launching', 'mid-launch before save');
    const midStageT = e.stageT;
    assert(midStageT > 0 && midStageT < 1200, `stageT partway through launch (got ${midStageT})`);

    const json = F.save();
    assert(F.load(json), 'load succeeds');

    const e2 = F.entities.ofType('rocket-silo')[0];
    assert(e2, 'silo entity present after load');
    assert(e2.stage === 'launching', `resumed in launching stage (stage=${e2.stage})`);
    assert(e2.stageT >= midStageT - 1, `stageT preserved across save/load (was ${midStageT}, now ${e2.stageT})`);

    ticks(F, 1200 - midStageT + 30);
    assert(e2.stage === 'cooldown' || e2.stage === 'building', `launch completed after resume (stage=${e2.stage})`);
    const outCount = F.inv.count(e2.output, 'space-science-pack');
    assert(outCount === 1000, `reward present after resumed launch (got ${outCount})`);
    return `resumed ok, output=${outCount}`;
  },

  rocket_inserter_feeds_low_density_structure(F, assert) {
    fresh(F, 105);
    const a = findFlat(F, 13, 11);
    const e = place(F, assert, 'rocket-silo', a.x, a.y, 0);
    const chest = place(F, assert, 'wooden-chest', a.x - 2, a.y, 0);
    assert(F.api.insertInto(chest, 'low-density-structure', 50) > 0, 'chest stocked with LDS');
    const inserter = place(F, assert, 'burner-inserter', a.x - 1, a.y, 1); // dir 1 (east): picks from chest (west), drops into the silo (east)
    assert(F.api.insertInto(inserter, 'coal', 5) > 0, 'inserter fuelled');
    ticks(F, 6 * TPS);
    const gotLDS = F.inv.count(e.input, 'low-density-structure');
    assert(gotLDS > 0, `burner inserter fed low-density-structure into the silo input (got ${gotLDS})`);
    return `input LDS=${gotLDS}`;
  },
};
