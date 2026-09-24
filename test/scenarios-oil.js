// Scenario tests for src/37-oil.js (oil processing: pumpjack, oil refinery, chemical plant,
// storage tank). See design/EXPANSION.md §7.1. Mirrors test/scenarios.js's shape/helpers (not
// exported there, so copied below) — module.exports = { name(F, assert, window) => void|string }.
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

function clearArea(F, x, y, w, h) {
  for (let j = -1; j <= h; j++) for (let i = -1; i <= w; i++) {
    const e = F.world.entityAt(x + i, y + j);
    if (e) F.api.remove(x + i, y + j, { toInventory: false });
    if (F.world.feature(x + i, y + j)) F.world.removeFeature(x + i, y + j);
  }
}

function place(F, assert, type, x, y, dir = 0) {
  F.api.give(type, 1);
  const chk = F.api.canPlace(type, x, y, dir);
  assert(chk.ok, `canPlace ${type} at ${x},${y} dir ${dir}: ${chk.reason}`);
  const e = F.api.place(type, x, y, dir, { fromInventory: true });
  assert(e, `place ${type} at ${x},${y}`);
  return e;
}

// Build a solar plant of at least kW and connect it with small poles to a pole adjacent to `consumer`.
// Solar panels give full output at tick 0 (day). Returns the pole next to the consumer.
// A pole only counts a generator toward its network when the generator has a tile inside that
// pole's SUPPLY area (half-width 2.5, i.e. a ~5x5 square) — not merely within wire reach (7.5) — so
// a single pole under a long row of panels leaves the far panels uncounted even though they're
// wire-connected. Give every panel its own adjacent pole so each is guaranteed supply coverage;
// consecutive poles (3 tiles apart) easily wire-link into one network on their own.
function solarPower(F, assert, consumer, kW) {
  const n = Math.max(1, Math.ceil(kW / 60));
  const area = findFlat(F, 3 * n + 1, 6);
  const rowPoles = [];
  for (let i = 0; i < n; i++) {
    place(F, assert, 'solar-panel', area.x + 3 * i, area.y, 0);
    rowPoles.push(placeAnywhereNear(F, assert, 'small-electric-pole', area.x + 3 * i + 1, area.y + 3, 1, 0));
  }
  let px = rowPoles[rowPoles.length - 1].x, py = rowPoles[rowPoles.length - 1].y;
  const tx = consumer.x - 1, ty = consumer.y - 1;
  let guard = 0;
  // Each hop's small-electric-pole is searched within a radius-2 fallback of an ideal target up to
  // HOP tiles from the previous pole — the ACTUAL placed spot can therefore land up to ~2.83 tiles
  // off that ideal target (worst case, diagonal). With HOP=5 that pushed some real inter-pole
  // distances to ~7.8, just over the pole's own 7.5 wire reach, silently splitting the chain into
  // two disconnected networks (no exception — placeAnywhereNear always finds *a* buildable tile,
  // it just isn't necessarily wired to the previous pole). HOP=4 keeps the worst case (~6.83) safely
  // under reach.
  const HOP = 4;
  while ((Math.abs(px - tx) > HOP || Math.abs(py - ty) > HOP) && guard++ < 100) {
    const nx = px + Math.sign(tx - px) * Math.min(HOP, Math.abs(tx - px));
    const ny = py + Math.sign(ty - py) * Math.min(HOP, Math.abs(ty - py));
    const p = placeAnywhereNear(F, assert, 'small-electric-pole', nx, ny, 2, 0);
    assert(Math.hypot(p.x - px, p.y - py) <= 7.4, `pole chain hop stayed within wire reach (${p.x},${p.y} from ${px},${py})`);
    px = p.x; py = p.y;
  }
  const last = placeAnywhereNear(F, assert, 'small-electric-pole', tx, ty, 1, 0);
  assert(Math.hypot(last.x - px, last.y - py) <= 7.4, `final pole stayed within wire reach of the chain (${last.x},${last.y} from ${px},${py})`);
  ticks(F, 2);
  const info = F.power.netInfo(consumer);
  assert(info.capacity >= kW * 0.95, `solarPower delivered enough capacity for ${kW}kW (got ${info.capacity})`);
  return last;
}

function placeAnywhereNear(F, assert, type, cx, cy, radius, dir = 0) {
  for (let r = 0; r <= radius; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    if (F.api.canPlace(type, cx + dx, cy + dy, dir).ok) return place(F, assert, type, cx + dx, cy + dy, dir);
  }
  assert(false, `no room for ${type} near ${cx},${cy}`);
}

// Finds a crude-oil well the pumpjack can actually be centred on (buildable, not the found well
// itself if it happens to be blocked — wells cluster within a few tiles of each other per
// EXPANSION.md §6.4, so a small local scan around the closest one gives alternates).
function findPumpjackSpot(F, assert) {
  const sp = spawn(F);
  const well = F.world.findOilNear(sp.x, sp.y, 260);
  assert(well, 'a crude-oil well exists within 260 tiles of spawn');
  const candidates = [{ x: well.x, y: well.y }];
  for (let dy = -10; dy <= 10; dy++) for (let dx = -10; dx <= 10; dx++) {
    if (dx === 0 && dy === 0) continue;
    const tx = well.x + dx, ty = well.y + dy;
    const r = F.world.resource(tx, ty);
    if (r && r.item === 'crude-oil') candidates.push({ x: tx, y: ty });
  }
  for (const c of candidates) {
    clearArea(F, c.x - 1, c.y - 1, 3, 3);
    if (F.api.canPlace('pumpjack', c.x - 1, c.y - 1, 0).ok) return { x: c.x - 1, y: c.y - 1 };
  }
  assert(false, `no buildable pumpjack spot among ${candidates.length} well candidate(s)`);
  return null;
}

// Clears exactly one tile (entity + feature), unlike clearArea's 1-tile-margin sweep — needed
// right next to an entity we must NOT touch (clearArea's margin would clip its footprint, see
// the pumpjack case below).
function clearTile(F, x, y) {
  const e = F.world.entityAt(x, y);
  if (e) F.api.remove(x, y, { toInventory: false });
  if (F.world.feature(x, y)) F.world.removeFeature(x, y);
}

// Extends a pipe line from (x,y) stepping (dx,dy) each tile, stopping at the first blocked tile.
// The FIRST tile of the line sits directly against the source entity's port (pumpjack/refinery);
// clearArea's 1-tile margin sweep would reach back onto that entity's own footprint and mine it
// as collateral damage, so this clears only the exact pipe tile instead.
function extendPipeLine(F, assert, x, y, dx, dy, maxLen) {
  const pipes = [];
  let px = x, py = y;
  for (let i = 0; i < maxLen; i++) {
    clearTile(F, px, py);
    if (!F.api.canPlace('pipe', px, py, 0).ok) break;
    pipes.push(place(F, assert, 'pipe', px, py, 0));
    px += dx; py += dy;
  }
  return pipes;
}

// Places a storage-tank adjacent to `end` (a pipe entity) such that one of its ports connects
// back to `end`'s tile. Mirrors test/scenarios.js's steam_power_chain boiler/engine search.
function connectTankTo(F, assert, end) {
  let tank = null;
  search: for (let d = 0; d < 4; d++) for (let oy = -3; oy <= 3; oy++) for (let ox = -3; ox <= 3; ox++) {
    const tx = end.x + ox, ty = end.y + oy;
    if (!F.api.canPlace('storage-tank', tx, ty, d).ok) continue;
    F.api.give('storage-tank', 1);
    const t = F.api.place('storage-tank', tx, ty, d, { fromInventory: true });
    if (!t) continue;
    const ok = F.fluids.connections(t).some(p => p.x + F.C.DIRS[p.dir][0] === end.x && p.y + F.C.DIRS[p.dir][1] === end.y);
    if (ok) { tank = t; break search; }
    F.api.remove(tx, ty, { toInventory: false });
  }
  return tank;
}

module.exports = {
  // pumpjack on a well + pipe + storage tank fills with crude-oil (EXPANSION.md §7.1: yield%,
  // extraction rate, F.fluids segment plumbing all exercised end to end).
  oil_pumpjack_fills_storage_tank(F, assert) {
    fresh(F);
    const spot = findPumpjackSpot(F, assert);
    const pump = place(F, assert, 'pumpjack', spot.x, spot.y, 0);
    assert(typeof pump.yield === 'number' && pump.yield >= 20 && pump.yield <= 400, `pumpjack seeded a yield% (${pump.yield})`);

    const ports = F.fluids.connections(pump);
    assert(ports.length === 1, `pumpjack has exactly one fluid port (got ${ports.length})`);
    const port = ports[0];
    assert(port.kind === 'crude-oil', `pumpjack port kind is crude-oil (got ${port.kind})`);
    const [dx, dy] = F.C.DIRS[port.dir];
    const pipes = extendPipeLine(F, assert, port.x + dx, port.y + dy, dx, dy, 5);
    assert(pipes.length >= 1, `at least one pipe placed from the pumpjack (${pipes.length})`);

    const tank = connectTankTo(F, assert, pipes[pipes.length - 1]);
    assert(tank, 'storage tank connected to the pumpjack pipe line');

    solarPower(F, assert, pump, 90);
    const yieldAtStart = pump.yield;
    const seconds = 20;
    ticks(F, seconds * TPS);

    const seg = F.fluids.segmentInfo(tank);
    assert(seg && seg.fluid === 'crude-oil', `tank carries crude-oil (${JSON.stringify(seg)})`);
    assert(F.power.isPowered(pump), 'pumpjack reports powered');
    // EXPANSION.md §7.1: yield%/100*10 crude/s while powered; allow generous slack for the power
    // ramp-up tick and yield decay, but this must be in the right ballpark, not just "> 0".
    const expected = (yieldAtStart / 100) * 10 * seconds;
    assert(seg.amount > expected * 0.3, `tank crude-oil roughly tracks the extraction rate (got ${seg.amount.toFixed(1)}, expected ~${expected.toFixed(1)} at yield ${yieldAtStart.toFixed(1)}%)`);
    return `tank crude-oil=${seg.amount.toFixed(1)} pump yield=${pump.yield.toFixed(2)}%`;
  },

  // oil-refinery running basic-oil-processing produces petroleum-gas into a connected tank.
  oil_refinery_basic_oil_processing(F, assert) {
    fresh(F);
    F.api.cheat.unlockAll();
    const area = findFlat(F, 8, 8);
    const refinery = place(F, assert, 'oil-refinery', area.x, area.y, 0);
    assert(F.oil.setRecipe(refinery, 'basic-oil-processing'), 'oil-refinery accepts basic-oil-processing');
    assert(refinery.recipe === 'basic-oil-processing', 'recipe recorded on the entity');

    // Feed crude-oil directly into fin[0] (bypasses needing a working pumpjack for this scenario;
    // the pumpjack->pipe->tank path is covered by oil_pumpjack_fills_storage_tank above).
    const accepted = F.fluids.push(refinery.fin[0], 'crude-oil', 2000);
    assert(accepted > 0, `crude-oil accepted into fin[0] (${accepted})`);

    // fout[0] (petroleum-gas, basic-oil-processing's only fluid result) sits on the north edge at
    // local x=0 (EXPANSION.md §7.1), i.e. world (refinery.x, refinery.y) facing north with dir=0.
    const pipes = extendPipeLine(F, assert, refinery.x, refinery.y - 1, 0, -1, 4);
    assert(pipes.length >= 1, `pipe placed on the refinery's petroleum-gas output (${pipes.length})`);
    const tank = connectTankTo(F, assert, pipes[pipes.length - 1]);
    assert(tank, 'storage tank connected to the petroleum-gas pipe');

    solarPower(F, assert, refinery, 420);
    ticks(F, 30 * TPS);

    const seg = F.fluids.segmentInfo(tank);
    assert(seg && seg.fluid === 'petroleum-gas' && seg.amount > 0, `petroleum-gas reached the tank (${JSON.stringify(seg)})`);
    return `petroleum-gas in tank=${seg.amount.toFixed(1)}`;
  },

  // chemical-plant running plastic-bar (needs petroleum-gas fluid + coal item) produces plastic-bar.
  oil_chemical_plant_plastic_bar(F, assert) {
    fresh(F);
    F.api.cheat.unlockAll();
    const area = findFlat(F, 6, 6);
    const plant = place(F, assert, 'chemical-plant', area.x, area.y, 0);
    assert(F.oil.setRecipe(plant, 'plastic-bar'), 'chemical-plant accepts plastic-bar');

    const accepted = F.fluids.push(plant.fin[0], 'petroleum-gas', 500);
    assert(accepted > 0, `petroleum-gas accepted into fin[0] (${accepted})`);

    F.api.give('coal', 20);
    const inserted = F.api.insertInto(plant, 'coal', 20);
    assert(inserted > 0, `coal inserted into the chemical plant (${inserted})`);

    solarPower(F, assert, plant, 210);
    ticks(F, 10 * TPS);

    const made = F.inv.count(plant.output, 'plastic-bar');
    assert(made >= 2, `plastic-bar produced (${made})`);
    assert(F.inv.count(plant.input, 'coal') < 20, 'coal was consumed by crafting');
    return `plastic-bar=${made}`;
  },

  // Water and crude-oil pipes must never merge into one segment (EXPANSION.md §6.2's generalised
  // mixing guard extended to the new fluids), whether probed via F.fluids.canConnect directly or
  // via a real F.api.canPlace attempt (which should surface reason 'fluid_mix').
  oil_pipes_cannot_merge_different_fluids(F, assert) {
    fresh(F);
    const sp = spawn(F);
    const tx = sp.x + 90, ty = sp.y + 90;
    clearArea(F, tx - 1, ty - 4, 3, 8);

    const tank = F.entities.create('storage-tank', tx, ty, 0); // 3x3; north port at (tx+1, ty)
    F.fluids.push(tank.fb, 'crude-oil', 500);
    const pipeC = F.entities.create('pipe', tx + 1, ty - 1, 0);
    F.fluids.markDirty();
    const segC = F.fluids.segmentInfo(pipeC);
    assert(segC && segC.fluid === 'crude-oil', `pipe joined the tank's crude-oil segment (${JSON.stringify(segC)})`);

    const pipeW = F.entities.create('pipe', tx + 1, ty - 3, 0); // two tiles further north (not adjacent yet)
    F.fluids.push(pipeW.fb, 'water', 500);
    F.fluids.markDirty();
    const segW = F.fluids.segmentInfo(pipeW);
    assert(segW && segW.fluid === 'water', `separate water pipe segment (${JSON.stringify(segW)})`);

    // Bridge tile (tx+1, ty-2) is adjacent to both pipeC (south) and pipeW (north).
    const canConnect = F.fluids.canConnect('pipe', tx + 1, ty - 2, 0);
    assert(canConnect === false, 'canConnect refuses a pipe bridging crude-oil and water segments');

    F.api.give('pipe', 1);
    const chk = F.api.canPlace('pipe', tx + 1, ty - 2, 0);
    assert(chk.ok === false && chk.reason === 'fluid_mix', `F.api.canPlace refuses the bridge with reason fluid_mix (got ${JSON.stringify(chk)})`);
    return 'bridge blocked, reason=' + chk.reason;
  },

  // Save/load round trip keeps a working refinery: recipe, mid-craft progress and fluid box
  // contents all survive, and crafting resumes and completes after reload.
  oil_refinery_save_load_roundtrip(F, assert) {
    fresh(F);
    F.api.cheat.unlockAll();
    const area = findFlat(F, 7, 7);
    const refinery = place(F, assert, 'oil-refinery', area.x, area.y, 0);
    assert(F.oil.setRecipe(refinery, 'basic-oil-processing'), 'recipe set before save');
    F.fluids.push(refinery.fin[0], 'crude-oil', 2000);
    solarPower(F, assert, refinery, 420);

    ticks(F, 2 * TPS); // partial craft only (basic-oil-processing takes 5 s = 300 ticks); fluids are
    // consumed/produced gradually (proportional to progress made each tick, see src/37-oil.js), so
    // by now fin[0] is partially drained and fout[0] already holds some petroleum-gas.
    const progressBefore = refinery.progress;
    assert(progressBefore > 0 && progressBefore < 1, `refinery mid-craft before save (progress=${progressBefore})`);
    const finBefore = refinery.fin[0].amount, foutBefore = refinery.fout[0].amount;
    assert(finBefore > 0 && finBefore < 100, `crude-oil partially consumed before save (${finBefore})`);
    assert(foutBefore > 0, `some petroleum-gas already produced before save (${foutBefore})`);

    const s = F.save();
    assert(s, 'save produced a payload');
    F.load(s);

    const list = F.entities.ofType('oil-refinery');
    assert(list.length === 1, `reloaded refinery present (${list.length})`);
    const reloaded = list[0];
    assert(reloaded.recipe === 'basic-oil-processing', `recipe survived reload (${reloaded.recipe})`);
    assert(Math.abs(reloaded.progress - progressBefore) < 1e-6, `craft progress survived reload (${reloaded.progress} vs ${progressBefore})`);
    const finInfo = F.fluids.segmentInfo(reloaded, 'fin0');
    assert(finInfo && Math.abs(finInfo.amount - finBefore) < 1e-6, `crude-oil in fin[0] survived reload (${JSON.stringify(finInfo)} vs ${finBefore})`);
    const foutInfo = F.fluids.segmentInfo(reloaded, 'fout0');
    assert(foutInfo && Math.abs(foutInfo.amount - foutBefore) < 1e-6, `petroleum-gas in fout[0] survived reload (${JSON.stringify(foutInfo)} vs ${foutBefore})`);

    ticks(F, 5 * TPS); // enough to finish the in-flight craft (well past the remaining ~3 s)
    assert(reloaded.fout[0].amount > foutBefore, `refinery kept producing after reload (${reloaded.fout[0].amount} > ${foutBefore})`);
    return `progress@save=${progressBefore.toFixed(2)} gas@save=${foutBefore.toFixed(1)} gas@end=${reloaded.fout[0].amount.toFixed(1)}`;
  },
};
