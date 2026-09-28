// saves/gen-advanced-world.js — builds a very advanced late-game base (seed 42) inside the real
// game and writes it to saves/advanced-world.json (load it with Pause menu -> Import save).
//
//   node build/build.js && node saves/gen-advanced-world.js
// Needs Playwright; set CHROME=/path/to/chromium if Playwright's own browser is not installed.
//
// The base: all research done; a 12-boiler / 24-engine steam plant on the east lake plus a solar
// field with accumulators; iron and copper mines (efficiency modules) on fast belts into rows of
// electric furnaces (productivity + efficiency modules); an assembly district of chest-fed
// assembling machines 3 (intermediates, all science packs, modules, rocket control units, ...);
// labs; an oil field of six pumpjacks piped to a refinery and two chemical plants (plastic, solid
// fuel); a rail loop with two stations and an automatic train; four roboports with 50 logistic
// and 50 construction robots each and logistic chests; a rocket silo with a satellite, ready to
// launch; a parked spidertron and a well-stocked player inventory. Everything is placed through
// F.api, powered by one network, and simulated for 90 s before saving.
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await b.newPage({ viewport: { width: 1400, height: 900 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  await page.goto('file://' + require('path').resolve(__dirname, '../build/Factio.html'));
  await page.waitForTimeout(1200);
  const report = await page.evaluate(() => {
    const log = [], fail = [];
    F.newGame({ seed: 42 });
    F.api.cheat.unlockAll();
    const pl = F.state.player; pl.x = 20; pl.y = -75; // out of the way while building
    let cleared = 0;
    for (let y = -70; y <= 75; y++) for (let x = -35; x <= 100; x++) if (F.world.feature(x, y)) { F.world.removeFeature(x, y); cleared++; }

    function P(type, x, y, dir, quiet) {
      const e = F.api.place(type, x, y, dir || 0, { fromInventory: false });
      if (!e && !quiet) fail.push(type + '@' + x + ',' + y + ' ' + JSON.stringify(F.api.canPlace(type, x, y, dir || 0)));
      return e;
    }
    function fill(e, item, n) { if (!e) return 0; let t = 0, k = 0; while (t < n && k++ < 200) { const got = F.api.insertInto(e, item, n - t); if (!got) break; t += got; } return t; }
    // fills round-robin one stack at a time, so every ingredient sits near the front of the chest
    function chestWith(x, y, items, type) {
      const c = P(type || 'steel-chest', x, y, 0); if (!c) return c;
      const left = items.map(([id, n]) => [id, n]);
      for (let guard = 0; guard < 500 && left.some(l => l[1] > 0); guard++) left.forEach(l => { if (l[1] > 0) { const k = Math.min(l[1], F.inv.stackSize(l[0])); const got = fill(c, l[0], k); l[1] = got ? l[1] - k : 0; } });
      return c;
    }
    function belt(x0, y0, x1, y1, type) {
      const dx = Math.sign(x1 - x0), dy = Math.sign(y1 - y0), dir = dx > 0 ? 1 : dx < 0 ? 3 : dy > 0 ? 2 : 0;
      let x = x0, y = y0; for (;;) { P(type || 'fast-transport-belt', x, y, dir); if (x === x1 && y === y1) break; x += dx; y += dy; }
    }
    function hasOre(x, y, w) { let n = 0; for (let j = 0; j < w; j++) for (let i = 0; i < w; i++) if (F.world.resource(x + i, y + j)) n++; return n; }
    function free(x, y) { return F.api.canPlace('medium-electric-pole', x, y, 0).ok; }

    // ---------------------------------------------------------------- steam power
    const BOILERS = 12, EAST = 8; // 8 boilers east of the pump, 4 west
    function boilerX(px, i) { return i < EAST ? px + 1 + 4 * i : px - 3 - 4 * (i - EAST); }
    function steamOk(px, py) {
      const by = py - 3, C = (t, x, y, d) => F.api.canPlace(t, x, y, d || 0).ok;
      if (!C('offshore-pump', px, py, 2) || !C('pipe', px, py - 1) || !C('pipe', px, py - 2)) return false;
      for (let i = 0; i < BOILERS; i++) {
        const bx = boilerX(px, i);
        if (!C('boiler', bx, by) || !C('steam-engine', bx, by - 5) || !C('steam-engine', bx, by - 10)) return false;
        if (!C('inserter', bx + 1, by + 2) || !C('steel-chest', bx + 1, by + 3) || !C('pipe', bx + 3, by + 1) || !C('pipe', bx + 3, by + 3)) return false;
      }
      return true;
    }
    let pump = null;
    for (let y = 8; y <= 30 && !pump; y++) for (let x = 14; x <= 40 && !pump; x++) {
      if (F.world.terrain(x, y) >= 2 && F.world.terrain(x, y + 1) < 2 && steamOk(x, y)) pump = { x, y };
    }
    log.push('offshore pump ' + JSON.stringify(pump));
    const px = pump.x, py = pump.y, by = py - 3;
    P('offshore-pump', px, py, 2);
    P('pipe', px, py - 1); P('pipe', px, py - 2);
    for (let i = 0; i < BOILERS; i++) {
      const bx = boilerX(px, i);
      const bo = P('boiler', bx, by, 0);
      fill(bo, 'solid-fuel', 50);
      P('steam-engine', bx, by - 5, 0); P('steam-engine', bx, by - 10, 0);
      if (i < EAST - 1) P('pipe', bx + 3, by + 1);
      if (i >= EAST && i < BOILERS - 1) P('pipe', bx - 1, by + 1);
      P('inserter', bx + 1, by + 2, 0);
      chestWith(bx + 1, by + 3, [['solid-fuel', 2400]]);
      P('medium-electric-pole', bx + 3, by - 3); P('medium-electric-pole', bx + 3, by - 8); P('medium-electric-pole', bx + 3, by + 3, 0, true);
    }
    log.push('steam plant boilers ' + BOILERS);

    // ---------------------------------------------------------------- solar field + accumulators
    let panels = 0, accs = 0;
    for (let cj = 0; cj < 3; cj++) for (let ci = 0; ci < 4; ci++) {
      const x0 = 43 + ci * 7, y0 = 17 + cj * 7;
      P('medium-electric-pole', x0 - 1, y0 - 1, 0, true);
      if (ci === 3) { for (let a = 0; a < 3; a++) for (let c = 0; c < 3; c++) if (P('accumulator', x0 + c * 2, y0 + a * 2, 0, true)) accs++; }
      else for (let a = 0; a < 2; a++) for (let c = 0; c < 2; c++) if (P('solar-panel', x0 + c * 3, y0 + a * 3, 0, true)) panels++;
    }
    log.push('solar panels ' + panels + ', accumulators ' + accs);

    // ---------------------------------------------------------------- iron: drills -> belt -> furnaces
    let drills = 0;
    const MODS = (e, id, n) => fill(e, id, n);
    for (let x = -23; x <= 7; x += 3) {
      if (hasOre(x, -33, 3) >= 6) { const d = P('electric-mining-drill', x, -33, 2); if (d) { drills++; MODS(d, 'efficiency-module-3', 3); } }
      if (hasOre(x, -29, 3) >= 6) { const d = P('electric-mining-drill', x, -29, 0); if (d) { drills++; MODS(d, 'efficiency-module-3', 3); } }
    }
    belt(-23, -30, 39, -30);
    for (let x = -22; x <= 10; x += 6) { P('medium-electric-pole', x, -34, 0, true); P('medium-electric-pole', x, -26, 0, true); }
    let furn = 0;
    for (let fx = 13; fx <= 37; fx += 3) {
      const f = P('electric-furnace', fx, -34, 0); if (f) { furn++; fill(f, 'productivity-module-3', 1); fill(f, 'efficiency-module-3', 1); }
      P('fast-inserter', fx + 1, -31, 0); P('fast-inserter', fx + 1, -35, 0);
      if (((fx - 13) / 3) % 2 === 0) { P('medium-electric-pole', fx, -31, 0, true); P('medium-electric-pole', fx, -35, 0, true); }
    }
    belt(13, -36, 41, -36);
    P('fast-inserter', 42, -36, 1); chestWith(43, -36, [['iron-plate', 800]]);
    // ---------------------------------------------------------------- copper
    for (let x = 11; x <= 35; x += 3) {
      if (hasOre(x, -19, 3) >= 6) { const d = P('electric-mining-drill', x, -19, 2); if (d) { drills++; MODS(d, 'efficiency-module-3', 3); } }
      if (hasOre(x, -15, 3) >= 6) { const d = P('electric-mining-drill', x, -15, 0); if (d) { drills++; MODS(d, 'efficiency-module-3', 3); } }
    }
    belt(11, -16, 68, -16);
    for (let x = 12; x <= 38; x += 6) { P('medium-electric-pole', x, -20, 0, true); P('medium-electric-pole', x, -12, 0, true); }
    for (let fx = 43; fx <= 67; fx += 3) {
      const f = P('electric-furnace', fx, -20, 0); if (f) { furn++; fill(f, 'productivity-module-3', 1); fill(f, 'efficiency-module-3', 1); }
      P('fast-inserter', fx + 1, -17, 0); P('fast-inserter', fx + 1, -21, 0);
      if (((fx - 43) / 3) % 2 === 0) { P('medium-electric-pole', fx, -17, 0, true); P('medium-electric-pole', fx, -21, 0, true); }
    }
    belt(43, -22, 70, -22);
    P('fast-inserter', 71, -22, 1); chestWith(72, -22, [['copper-plate', 800]]);
    log.push('mining drills ' + drills + ', electric furnaces ' + furn);

    // ---------------------------------------------------------------- assembly district
    const cellRecipes = ['iron-gear-wheel', 'electronic-circuit', 'advanced-circuit', 'engine-unit', 'low-density-structure', 'rocket-control-unit',
      'automation-science-pack', 'logistic-science-pack', 'chemical-science-pack', 'production-science-pack', 'utility-science-pack', 'flying-robot-frame',
      'speed-module-3', 'fast-inserter', 'fast-transport-belt', 'electric-mining-drill', 'solar-panel', 'accumulator'];
    const usable = cellRecipes.filter(id => { const r = F.data.recipes[id]; return r && r.category === 'crafting' && !(r.fluidIngredients || []).length; });
    let cells = 0;
    usable.forEach((rid, i) => {
      const col = i % 3, row = Math.floor(i / 3);
      const x = 46 + col * 10, y = -54 + row * 4;
      const r = F.data.recipes[rid];
      const inp = chestWith(x, y + 1, r.ingredients.map(([id]) => [id, F.inv.stackSize(id) * Math.floor(48 / r.ingredients.length)]));
      P('fast-inserter', x + 1, y + 1, 1);
      const am = P('assembling-machine-3', x + 2, y, 0);
      if (am) { F.api.setRecipe(am, rid); cells++; fill(am, F.modules.productivityAllowed(am, rid) ? 'productivity-module-3' : 'speed-module-3', 2); fill(am, 'efficiency-module-3', 2); }
      P('fast-inserter', x + 5, y + 1, 1); P('steel-chest', x + 6, y + 1);
      P('medium-electric-pole', x + 1, y, 0, true); P('medium-electric-pole', x + 5, y, 0, true);
      void inp;
    });
    log.push('assembly cells ' + cells + ' / ' + usable.length);

    // ---------------------------------------------------------------- labs
    let labs = 0;
    for (let i = 0; i < 6; i++) {
      const l = P('lab', 46 + i * 4, -60, 0);
      if (l) { labs++; ['automation-science-pack', 'logistic-science-pack', 'chemical-science-pack', 'production-science-pack', 'utility-science-pack'].forEach(id => fill(l, id, 200)); }
      P('medium-electric-pole', 49 + i * 4, -60, 0, true);
    }
    log.push('labs ' + labs);

    // ---------------------------------------------------------------- oil field
    const wells = [[72, 3], [71, 8], [78, 7], [78, 18], [85, 18], [78, 21]];
    const jacks = [];
    wells.forEach(([wx, wy]) => {
      // face the output toward the refinery inputs (83..85, 14)
      let best = 0, bd = 1e9;
      for (let d = 0; d < 4; d++) { const v = F.util.dirVec(d), ox = wx + 2 * v[0], oy = wy + 2 * v[1], dd = Math.hypot(ox - 84, oy - 15); if (dd < bd) { bd = dd; best = d; } }
      const j = P('pumpjack', wx - 1, wy - 1, best); if (j) { const v = F.util.dirVec(best); jacks.push({ e: j, wx, wy, ox: wx + 2 * v[0], oy: wy + 2 * v[1] }); }
    });
    const ref = P('oil-refinery', 82, 9, 0);
    if (ref) F.oil.setRecipe(ref, 'basic-oil-processing');
    const chem1 = P('chemical-plant', 79, 1, 0); if (chem1) F.oil.setRecipe(chem1, 'plastic-bar');
    const chem2 = P('chemical-plant', 86, 1, 0); if (chem2) F.oil.setRecipe(chem2, 'solid-fuel-from-petroleum-gas');
    // pipe routing (BFS over free tiles, never next to a port we don't want)
    const oilPipes = new Set(), gasPipes = new Set();
    function route(from, targets, avoid, net) {
      const key = (x, y) => x + ',' + y, goal = new Set(targets.map(t => key(t[0], t[1])));
      for (const k of net) goal.add(k);
      const prev = new Map([[key(from[0], from[1]), null]]), q = [from];
      while (q.length) {
        const [x, y] = q.shift();
        const k = key(x, y);
        if (goal.has(k) || [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => net.has(key(x + dx, y + dy)))) {
          let c = k; while (c) { const [cx, cy] = c.split(',').map(Number); if (!net.has(c)) { P('pipe', cx, cy); net.add(c); } c = prev.get(c); }
          return true;
        }
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy, nk = key(nx, ny);
          if (prev.has(nk) || Math.abs(nx - 80) > 22 || Math.abs(ny - 10) > 22) continue;
          if (avoid.has(nk) || !F.api.canPlace('pipe', nx, ny, 0).ok) continue;
          prev.set(nk, k); q.push([nx, ny]);
        }
      }
      return false;
    }
    // refinery ports: inputs at y=13 (x 83, 85) -> neighbours y=14; outputs y=9 (x 82,84,86) -> neighbours y=8.
    // chem plant inputs (x0, 3), (x0+2, 3) -> neighbours y=4. Gas first (short), then the oil lines.
    const avoidGas = new Set(['84,8', '86,8', '83,14', '85,14', '81,4', '88,4']);
    P('pipe', 82, 8); gasPipes.add('82,8');
    const g1 = route([79, 4], [], avoidGas, gasPipes), g2 = route([86, 4], [], avoidGas, gasPipes);
    const avoidOil = new Set(['82,8', '84,8', '86,8', '85,14', '79,4', '81,4', '86,4', '88,4']);
    for (const k of gasPipes) { const [x, y] = k.split(',').map(Number); [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => avoidOil.add((x + dx) + ',' + (y + dy))); }
    let routed = 0;
    jacks.forEach(({ ox, oy }) => { if (route([ox, oy], [[83, 14]], avoidOil, oilPipes)) routed++; });
    // chem plants: coal in, product out
    P('fast-inserter', 80, 0, 2); chestWith(80, -1, [['coal', 1000]]);
    P('fast-inserter', 81, 0, 0); P('steel-chest', 81, -1);
    P('fast-inserter', 87, 0, 0); P('steel-chest', 87, -1);
    log.push('pumpjacks ' + jacks.length + ', routed ' + routed + ', gas ' + g1 + '/' + g2);

    // ---------------------------------------------------------------- south: rocket silo, roboports, trains, spidertron
    const silo = P('rocket-silo', 20, 44, 0);
    if (silo) {
      P('fast-inserter', 19, 46, 1); chestWith(18, 46, [['low-density-structure', 400]]);
      P('fast-inserter', 19, 48, 1); chestWith(18, 48, [['rocket-fuel', 200]]);
      P('fast-inserter', 19, 50, 1); chestWith(18, 50, [['rocket-control-unit', 200]]);
      fill(silo, 'satellite', 1);
      silo.parts = 18;
      P('medium-electric-pole', 18, 44); P('medium-electric-pole', 18, 52);
    }
    // train loop
    for (let x = 34; x <= 62; x++) { P('rail', x, 40); P('rail', x, 60); }
    for (let y = 41; y <= 59; y++) { P('rail', 34, y); P('rail', 62, y); }
    const stopA = P('train-stop', 48, 39, 0), stopB = P('train-stop', 48, 61, 0);
    if (stopA) stopA.name = 'Iron Station'; if (stopB) stopB.name = 'Copper Station';
    const loco = F.api.placeVirtual('locomotive', 46, 40, 1, { fromInventory: false });
    const w1 = F.api.placeVirtual('cargo-wagon', 44, 40, 1, { fromInventory: false });
    const w2 = F.api.placeVirtual('cargo-wagon', 41, 40, 1, { fromInventory: false });
    const train = F.state.trains[0];
    if (loco) F.inv.add(loco.fuel, 'solid-fuel', 150);
    if (w1) F.inv.add(w1.inv, 'iron-plate', 3000);
    if (w2) F.inv.add(w2.inv, 'copper-plate', 3000);
    if (train) { train.manual = false; train.schedule = [{ stop: 'Iron Station', wait: 'time', time: 5 }, { stop: 'Copper Station', wait: 'time', time: 5 }]; train.cur = 0; }
    log.push('train cars ' + (train ? train.cars.length : 0));
    // robot network
    let ports = 0;
    [[6, 42], [6, 62], [38, 64], [66, 44]].forEach(([x, y]) => {
      const r = P('roboport', x, y, 0);
      if (r) { ports++; fill(r, 'logistic-robot', 50); fill(r, 'construction-robot', 50); }
      P('medium-electric-pole', x - 1, y, 0, true);
    });
    chestWith(11, 42, [['fast-transport-belt', 400], ['fast-inserter', 200], ['medium-electric-pole', 200], ['assembling-machine-3', 20], ['electric-furnace', 20]], 'storage-chest');
    chestWith(11, 44, [['steel-plate', 2000], ['plastic-bar', 1000], ['iron-gear-wheel', 1000]], 'passive-provider-chest');
    const req = P('requester-chest', 11, 46, 0);
    if (req && req.requests) req.requests[0] = { id: 'iron-gear-wheel', count: 200 };
    log.push('roboports ' + ports);
    const spider = F.api.placeVirtual('spidertron', 30, 64, 1, { fromInventory: false });
    if (spider) { F.inv.add(spider.inv, 'fast-transport-belt', 400); F.inv.add(spider.inv, 'medium-electric-pole', 100); F.inv.add(spider.inv, 'solar-panel', 50); }

    // ---------------------------------------------------------------- mall near spawn
    ['fast-transport-belt', 'fast-inserter', 'electric-mining-drill', 'medium-electric-pole', 'pipe', 'rail'].forEach((rid, i) => {
      const r = F.data.recipes[rid]; if (!r) return;
      const x = -8 + (i % 2) * 10, y = -6 + Math.floor(i / 2) * 5;
      chestWith(x, y + 1, r.ingredients.map(([id]) => [id, F.inv.stackSize(id) * Math.floor(48 / r.ingredients.length)]));
      P('fast-inserter', x + 1, y + 1, 1);
      const am = P('assembling-machine-3', x + 2, y, 0); if (am) { F.api.setRecipe(am, rid); fill(am, 'efficiency-module-3', 2); }
      P('fast-inserter', x + 5, y + 1, 1); P('steel-chest', x + 6, y + 1);
      P('medium-electric-pole', x + 1, y, 0, true);
    });

    // ---------------------------------------------------------------- power: cover and connect everything
    const poleDef = F.data.entities['medium-electric-pole'];
    function poles() { return F.state.entities.filter(e => e.type === 'medium-electric-pole' || e.type === 'small-electric-pole'); }
    function components() {
      const ps = poles(), byId = new Map(ps.map(p => [p.id, p])), seen = new Set(), comps = [];
      ps.forEach(p => {
        if (seen.has(p.id)) return; const c = [], st = [p]; seen.add(p.id);
        while (st.length) { const q = st.pop(); c.push(q); (q.wires || []).forEach(id => { const o = byId.get(id); if (o && !seen.has(id)) { seen.add(id); st.push(o); } }); }
        comps.push(c);
      });
      return comps;
    }
    function nearFree(x, y, r) { for (let d = 0; d <= r; d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue; if (free(x + dx, y + dy)) return [x + dx, y + dy]; } return null; }
    // cover unpowered consumers
    let added = 0;
    F.state.entities.forEach(e => {
      const d = F.data.entities[e.type]; if (!d) return; const gen = d.behaviour === 'solar' || d.behaviour === 'accumulator' || d.behaviour === 'engine'; if (!gen && (!d.energy || d.energy.type !== 'electric')) return;
      if (F.power.networkOf && F.power.networkOf(e) != null) return;
      const c = nearFree(e.x + Math.floor(d.size[0] / 2), e.y + Math.floor(d.size[1] / 2), 3 + Math.max(d.size[0], d.size[1]));
      if (c && P('medium-electric-pole', c[0], c[1], 0, true)) added++;
    });
    // connect every pole component to the one holding the steam engines
    for (let guard = 0; guard < 60; guard++) {
      const comps = components(); if (comps.length <= 1) break;
      comps.sort((a, b) => b.length - a.length);
      const main = comps[0], other = comps[1];
      let best = null;
      main.forEach(p => other.forEach(q => { const dd = Math.hypot(p.x - q.x, p.y - q.y); if (!best || dd < best.d) best = { p, q, d: dd }; }));
      const n = Math.ceil(best.d / 7.5);
      for (let s = 1; s < n; s++) {
        const t = s / n, c = nearFree(Math.round(best.p.x + (best.q.x - best.p.x) * t), Math.round(best.p.y + (best.q.y - best.p.y) * t), 3);
        if (c && P('medium-electric-pole', c[0], c[1], 0, true)) added++;
      }
      if (components().length === comps.length) { fail.push('could not connect component of ' + other.length + ' poles'); break; }
    }
    log.push('extra poles ' + added + ', pole networks ' + components().length);

    // ---------------------------------------------------------------- player
    pl.x = 1.5; pl.y = 12.5;
    [['spidertron', 1], ['speed-module-3', 50], ['productivity-module-3', 50], ['efficiency-module-3', 50], ['logistic-robot', 100], ['construction-robot', 100],
     ['roboport', 10], ['solar-panel', 100], ['accumulator', 100], ['assembling-machine-3', 50], ['electric-furnace', 50], ['fast-transport-belt', 800],
     ['fast-inserter', 200], ['medium-electric-pole', 200], ['rail', 400], ['locomotive', 5], ['cargo-wagon', 10], ['rocket-control-unit', 50],
     ['low-density-structure', 100], ['processing-unit', 200], ['satellite', 2]].forEach(([id, n]) => F.api.give(id, n));
    return { log, fail };
  });
  console.log(report.log.join('\n'));
  if (report.fail.length) console.log('FAILED (' + report.fail.length + '):\n' + report.fail.slice(0, 60).join('\n'));
  // run the base for a while
  const stats = await page.evaluate(() => {
    for (let i = 0; i < 5400; i++) F.tick();
    const count = {}; F.state.entities.forEach(e => { count[e.type] = (count[e.type] || 0) + 1; });
    const working = {}; F.state.entities.forEach(e => { const d = F.data.entities[e.type]; const beh = F.behaviours[d.behaviour]; let s = null; try { s = beh && beh.status ? beh.status(e) : (F.machines && F.machines.status ? F.machines.status(e) : null); } catch (err) {} if (s) { working[e.type + ':' + s] = (working[e.type + ':' + s] || 0) + 1; } });
    const train = F.state.trains[0];
    const silo = F.entities.ofType('rocket-silo')[0];
    return { entities: F.state.entities.length, count, working, train: train && { state: train.state, cur: train.cur }, silo: silo && { parts: silo.parts, stage: silo.stage }, robots: (F.state.robots || []).length + '/' + (F.state.cbots || []).length, tick: F.state.tick };
  });
  console.log(JSON.stringify({ entities: stats.entities, train: stats.train, silo: stats.silo }));
  const json = await page.evaluate(() => F.save());
  fs.writeFileSync(__dirname + '/advanced-world.json', json);
  console.log('saved bytes', json.length);
  await b.close();
})();
