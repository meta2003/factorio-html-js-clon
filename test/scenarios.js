// Scenario tests for Factio — executed by test/headless.js after the smoke run.
// Each scenario receives (F, window, assert) and may return a note string.
// They double as an executable specification of design/ARCHITECTURE.md.
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

function placeAnywhereNear(F, assert, type, cx, cy, radius, dir = 0) {
  for (let r = 0; r <= radius; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    if (F.api.canPlace(type, cx + dx, cy + dy, dir).ok) return place(F, assert, type, cx + dx, cy + dy, dir);
  }
  assert(false, `no room for ${type} near ${cx},${cy}`);
}

// Build a solar plant of at least kW and connect it with small poles to a pole adjacent to `consumer`.
// Solar panels give full output at tick 0 (day). Returns the pole next to the consumer.
function solarPower(F, assert, consumer, kW) {
  const n = Math.max(1, Math.ceil(kW / 60));
  const area = findFlat(F, 3 * n + 1, 6);
  for (let i = 0; i < n; i++) place(F, assert, 'solar-panel', area.x + 3 * i, area.y, 0);
  let px = area.x + 1, py = area.y + 3;
  place(F, assert, 'small-electric-pole', px, py, 0);
  // target: a tile adjacent to the consumer footprint
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

module.exports = {
  world_spawn_and_resources(F, assert) {
    fresh(F);
    const sp = spawn(F);
    assert(F.world.isLand(sp.x, sp.y), 'spawn on land');
    for (const item of ['iron-ore', 'copper-ore', 'coal', 'stone']) {
      const r = F.api.findResource(item, 120);
      assert(r, `${item} patch within 120 tiles of spawn`);
      const d = Math.hypot(r.x - sp.x, r.y - sp.y);
      assert(d <= 80, `${item} within 80 tiles (was ${d.toFixed(0)})`);
    }
    let water = false;
    for (let dy = -60; dy <= 60 && !water; dy++) for (let dx = -60; dx <= 60 && !water; dx++) if (F.world.isWater(sp.x + dx, sp.y + dy)) water = true;
    assert(water, 'water within 60 tiles of spawn');
    const st = F.api.stats();
    assert(typeof st.entities === 'number', 'stats works');
    return `spawn ${sp.x},${sp.y}`;
  },

  world_deterministic(F, assert) {
    fresh(F, 7);
    const a = [];
    for (let i = -40; i < 40; i += 3) a.push(F.world.terrain(i, i), (F.world.resource(i, -i) || {}).amount || 0);
    fresh(F, 7);
    const b = [];
    for (let i = -40; i < 40; i += 3) b.push(F.world.terrain(i, i), (F.world.resource(i, -i) || {}).amount || 0);
    assert(JSON.stringify(a) === JSON.stringify(b), 'same seed → same world');
  },

  place_and_remove(F, assert) {
    fresh(F);
    const a = findFlat(F, 4, 4);
    const before = F.api.inventoryCount('stone-furnace');
    const e = place(F, assert, 'stone-furnace', a.x, a.y, 0);
    assert(F.api.inventoryCount('stone-furnace') === before, 'item consumed from inventory');
    assert(F.world.entityAt(a.x + 1, a.y + 1) === e, 'entityAt covers footprint');
    assert(!F.api.canPlace('wooden-chest', a.x + 1, a.y + 1, 0).ok, 'collision detected');
    assert(F.api.remove(a.x, a.y), 'remove');
    assert(F.api.inventoryCount('stone-furnace') === before + 1, 'item returned');
    assert(!F.world.entityAt(a.x, a.y), 'tile freed');
  },

  furnace_smelts(F, assert) {
    fresh(F);
    const a = findFlat(F, 2, 2);
    const e = place(F, assert, 'stone-furnace', a.x, a.y, 0);
    assert(F.api.insertInto(e, 'coal', 2) === 2, 'coal inserted');
    assert(F.api.insertInto(e, 'iron-ore', 4) === 4, 'ore inserted');
    ticks(F, Math.ceil(3.2 * TPS * 4) + 30);
    const invs = F.entities.inventories(e);
    const out = invs.find(i => i.name === 'output');
    assert(out && F.inv.count(out.inv, 'iron-plate') === 4, `4 iron plates smelted (got ${out ? F.inv.count(out.inv, 'iron-plate') : 'n/a'})`);
    assert(F.entities.takeItem(e, null) === 'iron-plate', 'takeItem from output');
  },

  player_hand_crafting(F, assert) {
    fresh(F);
    F.api.give('iron-plate', 10);
    const plates0 = F.api.inventoryCount('iron-plate'), gears0 = F.api.inventoryCount('iron-gear-wheel');
    const c = F.player.canCraft('iron-gear-wheel', 2);
    assert(c.ok, 'can craft gears');
    assert(F.api.craft('iron-gear-wheel', 2), 'craft enqueued');
    ticks(F, 0.5 * TPS * 2 + 5);
    assert(F.api.inventoryCount('iron-gear-wheel') === gears0 + 2, 'two gears crafted');
    assert(F.api.inventoryCount('iron-plate') === plates0 - 4, 'plates consumed');
    // intermediate auto-crafting: transport belt needs gear + plate
    F.api.give('iron-plate', 3);
    assert(F.api.craft('transport-belt', 1), 'craft belt with auto intermediates');
    ticks(F, 2 * TPS);
    assert(F.api.inventoryCount('transport-belt') >= 2, 'belt recipe yields 2 (auto-crafted intermediate gear)');
    assert(!F.player.canCraft('assembling-machine-1').ok, 'locked recipe cannot be crafted');
  },

  belt_line_throughput_and_lanes(F, assert) {
    fresh(F);
    const N = 12;
    const a = findFlat(F, N + 2, 3);
    const y = a.y + 1;
    const belts = [];
    for (let i = 0; i < N; i++) belts.push(place(F, assert, 'transport-belt', a.x + i, y, 1)); // east
    ticks(F, 2);
    let inserted = 0, arrived = 0;
    const last = belts[N - 1];
    for (let t = 0; t < 20 * TPS; t++) {
      if (F.belts.canInsert(belts[0], 0, 0) && F.belts.insert(belts[0], 0, 0, 'iron-ore')) inserted++;
      if (F.belts.canInsert(belts[0], 1, 0) && F.belts.insert(belts[0], 1, 0, 'copper-ore')) inserted++;
      F.tick();
      let it;
      while ((it = F.belts.take(last, null))) arrived++;
    }
    assert(inserted >= 250, `inserted ${inserted} (expect ≈ 300 for 2 lanes over 20 s)`);
    assert(arrived >= 170, `arrived ${arrived} (expect ≈ (20 s − 6.4 s transit) × 15/s ≈ 200)`);
    // lane preservation + items never fall off the end
    fresh(F);
    const b = findFlat(F, 6, 3);
    const line = [];
    for (let i = 0; i < 5; i++) line.push(place(F, assert, 'transport-belt', b.x + i, b.y + 1, 1));
    ticks(F, 1);
    assert(F.belts.insert(line[0], 0, 0, 'coal'), 'insert on lane 0');
    ticks(F, 5 * 32 + 10);
    const items = F.belts.items(line[4]);
    assert(items.length === 1 && items[0][1] === 0 && items[0][0] === 'coal', `item stays on lane 0 (got ${JSON.stringify(items)})`);
    ticks(F, 200);
    assert(F.belts.count(line[4]) === 1, 'item queued at belt end');
    assert(F.belts.items(line[3]).length === 0, 'item is on the last tile only');
  },

  belt_curve_and_sideload(F, assert) {
    fresh(F);
    const a = findFlat(F, 8, 8);
    const x0 = a.x + 1, y0 = a.y + 2;
    // east 3 tiles, corner facing south, then south 3 tiles
    const b = [];
    for (let i = 0; i < 3; i++) b.push(place(F, assert, 'transport-belt', x0 + i, y0, 1));
    b.push(place(F, assert, 'transport-belt', x0 + 3, y0, 2)); // corner
    for (let j = 1; j <= 3; j++) b.push(place(F, assert, 'transport-belt', x0 + 3, y0 + j, 2));
    ticks(F, 1);
    assert(b[3].curve !== 0, 'corner belt is a curve');
    assert(F.belts.insert(b[0], 0, 0, 'stone') && F.belts.insert(b[0], 1, 0, 'coal'), 'insert both lanes');
    ticks(F, 32 * 9);
    const end = F.belts.items(b[6]);
    assert(end.length === 2, `both items reached the end through the curve (got ${end.length})`);
    assert(end.find(i => i[0] === 'stone')[1] === 0 && end.find(i => i[0] === 'coal')[1] === 1, 'lanes preserved through curve');
    // side-load: a belt from the north into the middle of the straight run (b[1] is fed from behind by b[0])
    const side = place(F, assert, 'transport-belt', x0 + 1, y0 - 1, 2);
    ticks(F, 1);
    assert(b[1].curve === 0, 'fed-from-behind belt stays straight when side-loaded');
    assert(F.belts.insert(side, 0, 0, 'wood') && F.belts.insert(side, 1, 0, 'wood'), 'insert on side feeder');
    ticks(F, 32 * 12);
    const got = F.belts.items(b[6]).filter(i => i[0] === 'wood');
    assert(got.length === 2, `side-loaded items arrived (got ${got.length})`);
    const near = F.belts.nearLane(b[1], 0);
    assert(near === 0, 'near lane of an east belt fed from the north is lane 0 (left)');
    assert(got.every(i => i[1] === near), 'side-loaded items are on the near lane');
  },

  underground_and_splitter(F, assert) {
    fresh(F);
    const a = findFlat(F, 14, 7);
    const y = a.y + 3;
    const b0 = place(F, assert, 'transport-belt', a.x, y, 1);
    const uin = place(F, assert, 'underground-belt', a.x + 1, y, 1);
    place(F, assert, 'wooden-chest', a.x + 3, y, 0); // obstacle above the tunnel (was stone-wall; combat off)
    const uout = place(F, assert, 'underground-belt', a.x + 5, y, 1);
    assert(uin.pairId === uout.id && uout.pairId === uin.id, `underground pair linked (${uin.io}/${uout.io})`);
    const sp = place(F, assert, 'splitter', a.x + 6, y, 1);
    const otherRow = F.world.entityAt(a.x + 6, y + 1) === sp ? y + 1 : y - 1;
    assert(F.world.entityAt(a.x + 6, otherRow) === sp, 'splitter is 2 tiles wide across the travel direction');
    const outA = [], outB = [];
    for (let i = 0; i < 3; i++) { outA.push(place(F, assert, 'transport-belt', a.x + 7 + i, y, 1)); outB.push(place(F, assert, 'transport-belt', a.x + 7 + i, otherRow, 1)); }
    ticks(F, 1);
    let n = 0;
    for (let t = 0; t < 30 * TPS && n < 20; t++) {
      if (F.belts.canInsert(b0, 0, 0) && F.belts.insert(b0, 0, 0, 'iron-plate')) n++;
      F.tick();
    }
    ticks(F, 500);
    const ca = outA.reduce((s, e) => s + F.belts.count(e), 0), cb = outB.reduce((s, e) => s + F.belts.count(e), 0);
    assert(n === 20, `inserted ${n}`);
    assert(ca + cb === 20, `all items passed underground + splitter (${ca}+${cb})`);
    assert(Math.abs(ca - cb) <= 1, `1:1 split (${ca}/${cb})`);
    assert(outA.every(e => F.belts.items(e).every(i => i[1] === 0)), 'lane preserved through splitter');
  },

  burner_inserter_chest_to_chest(F, assert) {
    fresh(F);
    const a = findFlat(F, 3, 3);
    const src = place(F, assert, 'wooden-chest', a.x, a.y, 0);
    const ins = place(F, assert, 'burner-inserter', a.x + 1, a.y, 1); // faces east: pickup west (src), drop east (dst)
    const dst = place(F, assert, 'wooden-chest', a.x + 2, a.y, 0);
    F.api.insertInto(src, 'coal', 5);
    F.api.insertInto(src, 'iron-plate', 20);
    ticks(F, 60 * TPS);
    const dinv = F.entities.inventories(dst)[0].inv;
    const moved = F.inv.count(dinv, 'iron-plate');
    assert(moved >= 20, `burner inserter moved all plates (moved ${moved})`);
    assert(ins.fuel, 'burner inserter has a fuel slot');
  },

  electric_inserter_needs_power(F, assert) {
    fresh(F);
    const a = findFlat(F, 3, 3);
    const src = place(F, assert, 'iron-chest', a.x, a.y, 0);
    const ins = place(F, assert, 'inserter', a.x + 1, a.y, 1);
    const dst = place(F, assert, 'iron-chest', a.x + 2, a.y, 0);
    F.api.insertInto(src, 'iron-plate', 10);
    ticks(F, 5 * TPS);
    assert(F.inv.count(F.entities.inventories(dst)[0].inv, 'iron-plate') === 0, 'nothing moves without power');
    assert(!F.power.isPowered(ins), 'reports unpowered');
    solarPower(F, assert, ins, 60);
    ticks(F, 30 * TPS);
    const moved = F.inv.count(F.entities.inventories(dst)[0].inv, 'iron-plate');
    assert(moved >= 10, `with solar power all 10 plates moved (moved ${moved})`);
    assert(F.power.isPowered(ins), 'reports powered');
  },

  steam_power_chain(F, assert) {
    fresh(F);
    const sp = spawn(F);
    let pump = null, pos = null;
    outer: for (let r = 1; r < 90; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = sp.x + dx, y = sp.y + dy;
      for (let d = 0; d < 4; d++) {
        if (F.api.canPlace('offshore-pump', x, y, d).ok) {
          F.api.give('offshore-pump', 1);
          pump = F.api.place('offshore-pump', x, y, d, { fromInventory: true });
          if (pump) { pos = { x, y, d }; break outer; }
        }
      }
    }
    assert(pump, 'offshore pump placed at a shore');
    const ports = F.fluids.connections(pump);
    assert(ports.length >= 1, 'pump has an output port');
    const port = ports[0];
    const [dx, dy] = F.C.DIRS[port.dir];
    const pipes = [];
    let px = port.x + dx, py = port.y + dy;
    for (let i = 0; i < 6; i++) {
      // only this tile: clearArea's one-tile margin would take the pump itself
      if (F.world.feature(px, py)) F.world.removeFeature(px, py);
      if (!F.api.canPlace('pipe', px, py, 0).ok) break;
      pipes.push(place(F, assert, 'pipe', px, py, 0));
      px += dx; py += dy;
    }
    assert(pipes.length >= 3, `pipes placed (${pipes.length})`);
    const end = pipes[pipes.length - 1];
    let boiler = null;
    search: for (let d = 0; d < 4; d++) for (let oy = -4; oy <= 4; oy++) for (let ox = -4; ox <= 4; ox++) {
      const bx = end.x + ox, by = end.y + oy;
      if (!F.api.canPlace('boiler', bx, by, d).ok) continue;
      F.api.give('boiler', 1);
      const b = F.api.place('boiler', bx, by, d, { fromInventory: true });
      if (!b) continue;
      const ok = F.fluids.connections(b).some(p => p.kind === 'water' && p.x + F.C.DIRS[p.dir][0] === end.x && p.y + F.C.DIRS[p.dir][1] === end.y);
      if (ok) { boiler = b; break search; }
      F.api.remove(bx, by, { toInventory: false });
    }
    assert(boiler, 'boiler connected to the water pipe');
    const sport = F.fluids.connections(boiler).find(p => p.kind === 'steam');
    assert(sport, 'boiler has steam port');
    const tx = sport.x + F.C.DIRS[sport.dir][0], ty = sport.y + F.C.DIRS[sport.dir][1];
    let engine = null;
    search2: for (let d = 0; d < 4; d++) for (let oy = -5; oy <= 5; oy++) for (let ox = -5; ox <= 5; ox++) {
      const ex = tx + ox, ey = ty + oy;
      if (!F.api.canPlace('steam-engine', ex, ey, d).ok) continue;
      F.api.give('steam-engine', 1);
      const e = F.api.place('steam-engine', ex, ey, d, { fromInventory: true });
      if (!e) continue;
      const ok = F.fluids.connections(e).some(p => p.x + F.C.DIRS[p.dir][0] === sport.x && p.y + F.C.DIRS[p.dir][1] === sport.y);
      if (ok) { engine = e; break search2; }
      F.api.remove(ex, ey, { toInventory: false });
    }
    assert(engine, 'steam engine connected to the boiler');
    F.api.insertInto(boiler, 'coal', 5);
    const pole = placeAnywhereNear(F, assert, 'small-electric-pole', engine.x - 1, engine.y - 1, 4, 0);
    ticks(F, 3 * TPS);
    const seg = F.fluids.segmentInfo(pipes[0]);
    assert(seg && seg.fluid === 'water' && seg.amount > 0, `water in pipes (${JSON.stringify(seg)})`);
    const info = F.power.netInfo(pole);
    assert(info && info.capacity >= 899, `network capacity 900 kW (got ${info && info.capacity})`);
    const lab = placeAnywhereNear(F, assert, 'lab', pole.x - 1, pole.y - 1, 3, 0);
    F.api.insertInto(lab, 'automation-science-pack', 10);
    assert(F.api.research('automation'), 'start research automation');
    ticks(F, 2 * TPS);
    assert(F.power.isPowered(lab), 'lab powered by the steam engine');
    const bs = F.fluids.segmentInfo(engine);
    assert(bs && bs.fluid === 'steam', 'steam segment on engine');
    const info2 = F.power.netInfo(pole);
    assert(info2.demand > 0 && info2.satisfaction > 0.99, `lab demand satisfied (${JSON.stringify(info2)})`);
    return `pump@${pos.x},${pos.y} d${pos.d}`;
  },

  burner_drill_mines(F, assert) {
    fresh(F);
    const r = F.api.findResource('iron-ore', 120);
    assert(r, 'iron ore found');
    let drill = null;
    for (let oy = -8; oy <= 8 && !drill; oy++) for (let ox = -8; ox <= 8 && !drill; ox++) {
      const x = r.x + ox, y = r.y + oy;
      let ore = 0; for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) if (F.world.resource(x + i, y + j)) ore++;
      if (ore < 4) continue;
      for (let d = 0; d < 4 && !drill; d++) {
        if (!F.api.canPlace('burner-mining-drill', x, y, d).ok) continue;
        F.api.give('burner-mining-drill', 1);
        const e = F.api.place('burner-mining-drill', x, y, d, { fromInventory: true });
        if (!e) continue;
        const f = F.entities.front(e);
        if (F.api.canPlace('wooden-chest', f[0], f[1], 0).ok) drill = e; else F.api.remove(x, y, { toInventory: false });
      }
    }
    assert(drill, 'burner drill placed on ore with a free output tile');
    F.api.insertInto(drill, 'coal', 3);
    const f = F.entities.front(drill);
    const chest = place(F, assert, 'wooden-chest', f[0], f[1], 0);
    ticks(F, 12 * TPS);
    const got = F.inv.count(F.entities.inventories(chest)[0].inv, 'iron-ore');
    assert(got >= 2 && got <= 4, `burner drill produced ~3 ore in 12 s at 0.25/s (got ${got})`);
    const flat = findFlat(F, 2, 2);
    const chk = F.api.canPlace('burner-mining-drill', flat.x, flat.y, 0);
    assert(!chk.ok && chk.reason === 'no_resource', 'drill cannot be placed without resource');
  },

  assembler_crafts_with_power(F, assert) {
    fresh(F);
    const a = findFlat(F, 5, 5);
    const asm = place(F, assert, 'assembling-machine-1', a.x, a.y, 0);
    assert(F.api.setRecipe(asm, 'iron-gear-wheel') !== false, 'set recipe');
    assert(F.entities.canAcceptItem(asm, 'iron-plate') > 0, 'accepts plates');
    assert(F.entities.canAcceptItem(asm, 'coal') === 0, 'rejects non-ingredients');
    assert(F.api.insertInto(asm, 'iron-plate', 8) === 8, 'plates inserted');
    solarPower(F, assert, asm, 120);
    ticks(F, 8 * TPS);
    const out = F.entities.inventories(asm).find(i => i.name === 'output');
    assert(out && F.inv.count(out.inv, 'iron-gear-wheel') === 4, `4 gears crafted in 8 s at speed 0.5 (got ${out ? F.inv.count(out.inv, 'iron-gear-wheel') : 'n/a'})`);
  },

  research_with_lab(F, assert) {
    fresh(F);
    const a = findFlat(F, 5, 5);
    const lab = place(F, assert, 'lab', a.x, a.y, 0);
    solarPower(F, assert, lab, 120);
    F.api.insertInto(lab, 'automation-science-pack', 10);
    assert(F.research.available().includes('automation'), 'automation available');
    assert(F.api.research('automation'), 'started');
    assert(!F.research.isRecipeUnlocked('assembling-machine-1'), 'AM1 locked before research');
    ticks(F, 10 * 10 * TPS + 120);
    assert(F.research.isDone('automation'), `automation researched (progress ${F.research.progress()})`);
    assert(F.research.isRecipeUnlocked('assembling-machine-1'), 'AM1 unlocked');
  },

  pollution_and_chunks(F, assert) {
    fresh(F);
    const a = findFlat(F, 2, 2);
    const e = place(F, assert, 'stone-furnace', a.x, a.y, 0);
    F.api.insertInto(e, 'coal', 5); F.api.insertInto(e, 'iron-ore', 50);
    const [cx, cy] = F.world.chunkOf(a.x, a.y);
    const p0 = F.api.chunkPollution(cx, cy);
    ticks(F, 60 * TPS);
    const p1 = F.api.chunkPollution(cx, cy);
    assert(p1 > p0, `working furnace pollutes (${p0} → ${p1})`);
    assert(p1 < 5, `roughly 2/min minus absorption (${p1})`);
  },

  // turret_kills_biter moved to test/disabled-scenarios.js — F.combat and
  // the gun-turret/biter-spawner data it exercises are excluded from this
  // build (F.FEATURES.combat off, see src/disabled/README.md).

  save_load_roundtrip(F, assert) {
    fresh(F);
    const a = findFlat(F, 6, 3);
    for (let i = 0; i < 5; i++) place(F, assert, 'transport-belt', a.x + i, a.y, 1);
    F.belts.insert(F.world.entityAt(a.x, a.y), 0, 0, 'coal');
    const chest = place(F, assert, 'wooden-chest', a.x + 5, a.y, 0);
    F.api.insertInto(chest, 'iron-plate', 7);
    ticks(F, 10);
    const s = F.save();
    assert(typeof s === 'string' && s.length > 1000, 'save string');
    assert(!s.includes('"_'), 'no underscore caches serialised');
    const st1 = F.api.stats();
    F.newGame({ seed: 1 });
    assert(F.load(s), 'load ok');
    const st2 = F.api.stats();
    assert(st1.entities === st2.entities && st1.beltItems === st2.beltItems, 'entities & belt items restored');
    const c2 = F.world.entityAt(a.x + 5, a.y);
    assert(c2 && F.inv.count(F.entities.inventories(c2)[0].inv, 'iron-plate') === 7, 'chest contents restored');
    ticks(F, 200);
    assert(F.belts.count(F.world.entityAt(a.x + 4, a.y)) === 1, 'belt item continues after load');
    const s2 = F.save();
    assert(F.load(s2), 'second load');
  },

  save_is_compact(F, assert) {
    fresh(F);
    const r = F.api.findResource('iron-ore', 120);
    assert(r, 'iron ore found near spawn');
    const before = F.world.resource(r.x, r.y).amount;
    F.world.mineResource(r.x, r.y, 5);
    const after1 = F.world.resource(r.x, r.y);
    assert(after1 && after1.amount === before - 5, `resource tile decremented (before ${before}, after ${after1 && after1.amount})`);
    // mine a couple more nearby tiles so more than one delta entry (and
    // possibly more than one chunk) is exercised.
    let mined = 1;
    for (let dy = -3; dy <= 3 && mined < 3; dy++) {
      for (let dx = -3; dx <= 3 && mined < 3; dx++) {
        const tx = r.x + dx, ty = r.y + dy;
        if (tx === r.x && ty === r.y) continue;
        const res = F.world.resource(tx, ty);
        if (res && res.amount > 2) { F.world.mineResource(tx, ty, 2); mined++; }
      }
    }
    ticks(F, 10);
    const s = F.save();
    assert(typeof s === 'string' && s.length > 0, 'save produced a string');
    assert(s.length < 100 * 1024, `save is compact (${s.length} bytes, expect < 100 KB)`);
    assert(!/"terrain"\s*:\s*\{\s*"\$u8"/.test(s), 'no raw typed-array chunk terrain serialised');
    F.newGame({ seed: 999 });
    assert(F.load(s), 'load ok');
    const after2 = F.world.resource(r.x, r.y);
    assert(after2 && after2.amount === before - 5, `mined amount preserved after load (expect ${before - 5}, got ${after2 && after2.amount})`);
    return `mined ${mined} tiles, save ${s.length} bytes`;
  },

  i18n_and_help(F, assert) {
    // English-only build (F.FEATURES.combat's sibling flag: i18n is off too
    // — see src/disabled/README.md). Slovenian-specific assertions moved
    // into the english_only scenario below along with the new checks.
    assert(F.i18n.lang === 'en', 'default English');
    assert(F.t('item.iron-plate').length > 2 && F.t('item.iron-plate') !== 'item.iron-plate', 'iron plate translated');
    const help = F.t('help.controls');
    assert(help.length > 200, 'help text is substantial');
    for (const id of Object.keys(F.data.items)) assert(F.i18n.has('item.' + id), 'missing name for item ' + id);
    for (const id of Object.keys(F.data.entities)) assert(F.i18n.has('ent.' + id), 'missing name for entity ' + id);
    for (const id of Object.keys(F.data.techs)) assert(F.i18n.has('tech.' + id), 'missing name for tech ' + id);
  },

  // -------------------------------------------------------------------------
  // Disabled-features coverage (task: switch off combat + Slovenian, but keep
  // the code/data in src/disabled/ so both can be re-enabled later).
  // -------------------------------------------------------------------------

  combat_disabled(F, assert) {
    assert(F.combat === undefined, 'F.combat is not loaded (src/disabled/35-combat.js is excluded from the build)');

    const combatItemIds = ['pistol', 'submachine-gun', 'firearm-magazine', 'piercing-rounds-magazine', 'repair-pack', 'gun-turret', 'stone-wall'];
    for (const id of combatItemIds) assert(!F.data.items[id], `combat item ${id} must not be in F.data.items`);
    const combatEntityIds = ['gun-turret', 'stone-wall', 'biter-spawner'];
    for (const id of combatEntityIds) assert(!F.data.entities[id], `combat entity ${id} must not be in F.data.entities`);
    const combatTechIds = ['military', 'gun-turret', 'stone-wall', 'military-2', 'physical-projectile-damage-1', 'weapon-shooting-speed-1', 'physical-projectile-damage-2', 'weapon-shooting-speed-2'];
    for (const id of combatTechIds) assert(!F.data.techs[id], `combat tech ${id} must not be in F.data.techs`);
    assert(!F.data.startingInventory.some(row => row[0] === 'pistol' || row[0] === 'firearm-magazine'), 'starting inventory has no pistol/ammo');

    fresh(F, 123);
    // Generate chunks covering a ~200-tile radius around spawn, then run
    // 3600 ticks: with F.combat absent, 10-world.js's maybePlaceSpawners is
    // a guarded no-op, so nothing should ever place a biter-spawner or
    // spawn a unit, however much of the map gets generated.
    const sp = spawn(F);
    const [scx, scy] = F.world.chunkOf(sp.x, sp.y);
    const R = Math.ceil(200 / F.C.CHUNK);
    for (let cy = scy - R; cy <= scy + R; cy++) for (let cx = scx - R; cx <= scx + R; cx++) F.world.ensureChunk(cx, cy);
    ticks(F, 3600);
    assert(F.entities.ofType('biter-spawner').length === 0, 'no spawners after generating a ~200-tile radius + 3600 ticks');
    assert(F.state.units.length === 0, 'no biter units after 3600 ticks');

    // An old save (from before combat was disabled) may still hold a
    // gun-turret entity, a biter unit and a pistol in the player's
    // inventory. F.load must tolerate that silently.
    const s = F.save();
    const obj = JSON.parse(s);
    obj.entities.push({ id: 999999, type: 'gun-turret', x: sp.x + 3, y: sp.y, dir: 0, health: 400, ammo: [{ id: 'firearm-magazine', count: 3 }], cd: 0, roundsLeft: 0, ammoType: null });
    obj.units = [{ id: 1, type: 'small-biter', x: sp.x, y: sp.y, health: 15, target: null, state: 'idle', cd: 0, groupId: 0, home: 0, blockedTicks: 0 }];
    if (obj.player) obj.player.inv[0] = { id: 'pistol', count: 1 };
    const ok = F.load(JSON.stringify(obj));
    assert(ok, 'old save with a turret/unit/pistol loads without throwing');
    assert(F.state.entities.every(e => e.type !== 'gun-turret'), 'turret entity from the old save was dropped on load');
    assert(F.state.units.length === 0, 'biter unit from the old save was dropped on load');
    assert(F.inv.count(F.state.player.inv, 'pistol') === 0, 'pistol stack from the old save was dropped on load');
  },

  english_only(F, assert) {
    assert(F.i18n.langs.length === 1 && F.i18n.langs[0] === 'en', 'only "en" is a registered language');
    assert(F.i18n.lang === 'en', 'default language is en');
    assert(F.t('item.iron-plate') === 'Iron plate', "F.t('item.iron-plate') === 'Iron plate'");

    const helpKeys = ['help.title', 'help.controls', 'help.basics', 'help.progression', 'help.ratios', 'help.tips', 'help.entities'];
    const help = helpKeys.map(k => F.t(k)).join('\n');
    assert(!/[čšžČŠŽ]/.test(help), 'help text has no Slovenian diacritics');
    assert(!/turret|biter|pistol|ammunition|evolution|stone wall/i.test(help), 'help text has no combat advice (turrets/walls/biters/ammunition/evolution/pistol)');

    // No string anywhere in the (English-only) i18n table may contain a
    // Slovenian diacritic — walk every string F.t() can currently return.
    for (const id of Object.keys(F.data.items)) { assert(!/[čšžČŠŽ]/.test(F.t('item.' + id)), 'item.' + id + ' has no diacritics'); }
    for (const id of Object.keys(F.data.entities)) { assert(!/[čšžČŠŽ]/.test(F.t('ent.' + id)), 'ent.' + id + ' has no diacritics'); }
    for (const id of Object.keys(F.data.techs)) { assert(!/[čšžČŠŽ]/.test(F.t('tech.' + id)), 'tech.' + id + ' has no diacritics'); }
  },

  data_integrity(F, assert) {
    const D = F.data;
    for (const [rid, r] of Object.entries(D.recipes)) {
      for (const [id] of r.ingredients) assert(D.items[id], `recipe ${rid}: unknown ingredient ${id}`);
      for (const [id] of r.results) assert(D.items[id], `recipe ${rid}: unknown result ${id}`);
      if (r.unlockedBy) assert(D.techs[r.unlockedBy], `recipe ${rid}: unknown tech ${r.unlockedBy}`);
    }
    for (const [eid, e] of Object.entries(D.entities)) {
      if (!e.natural) assert(D.items[eid] && D.items[eid].place === eid, `entity ${eid} has a placeable item`);
      assert(F.behaviours[e.behaviour], `entity ${eid}: behaviour ${e.behaviour} registered`);
    }
    for (const [tid, t] of Object.entries(D.techs)) {
      for (const p of t.prereq) assert(D.techs[p], `tech ${tid}: unknown prereq ${p}`);
      for (const u of t.unlocks) assert(D.recipes[u], `tech ${tid}: unknown recipe ${u}`);
      for (const [p] of t.cost.packs) assert(D.items[p], `tech ${tid}: unknown pack ${p}`);
    }
    for (const [iid, it] of Object.entries(D.items)) if (it.place) assert(D.entities[it.place], `item ${iid} places unknown entity ${it.place}`);
    const n = Object.keys(D.entities).length;
    assert(n >= 28, `at least 28 entities (got ${n})`);
    return `${Object.keys(D.items).length} items, ${Object.keys(D.recipes).length} recipes, ${n} entities, ${Object.keys(D.techs).length} techs`;
  },

  performance_500_entities(F, assert) {
    fresh(F);
    const a = findFlat(F, 40, 14);
    let placed = 0;
    for (let row = 0; row < 6; row++) {
      for (let i = 0; i < 40; i++) if (F.api.canPlace('transport-belt', a.x + i, a.y + row * 2, 1).ok) { F.api.give('transport-belt', 1); if (F.api.place('transport-belt', a.x + i, a.y + row * 2, 1, { fromInventory: true })) placed++; }
      for (let i = 0; i < 40; i += 2) if (F.api.canPlace('inserter', a.x + i, a.y + row * 2 + 1, 2).ok) { F.api.give('inserter', 1); if (F.api.place('inserter', a.x + i, a.y + row * 2 + 1, 2, { fromInventory: true })) placed++; }
    }
    for (let row = 0; row < 6; row++) for (let i = 0; i < 40; i += 8) F.belts.insert(F.world.entityAt(a.x + i, a.y + row * 2), 0, 0, 'iron-ore');
    const t0 = Date.now();
    ticks(F, 600);
    const ms = (Date.now() - t0) / 600;
    assert(ms < 2.0, `tick time ${ms.toFixed(3)} ms with ${placed} entities (limit 2 ms)`);
    return `${placed} entities, ${ms.toFixed(3)} ms/tick`;
  },
};
