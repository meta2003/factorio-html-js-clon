// A bot that plays Factio from a new game to the first rocket launch.
//
// It plays by the player's rules (see hands.js): it mines, hand-crafts, places buildings from
// its inventory, hand-feeds machines and empties them, sets recipes and starts research. It
// never spawns items. Once a second (STEP ticks) it walks the factory; every few seconds it
// re-plans: what to produce (a small MRP over the recipe graph), which recipe each machine
// runs, and what to build next.
'use strict';
const { key, spiral } = require('./util');
const { createHands } = require('./hands');
const { createSpace } = require('./space');
const { createPipes } = require('./pipes');
const { createMachines } = require('./machines');

const DEFAULTS = {
  step: 30,             // ticks between factory walks
  planEvery: 4,         // walks between re-plans
  loadSeconds: 20,      // how much work a machine is loaded with per visit
  maxAsm: 90, maxFurnaces: 230, maxLabs: 30, maxDrillsPerOre: 120, maxPowerUnits: 40,
  oilRadius: 120, maxPumpjacks: 20,
  oreStock: 4000,       // ore kept in the warehouse before drills are left to fill up
};

// Technologies in the order the bot researches them (each with its missing prerequisites).
const RESEARCH_ORDER = [
  'automation', 'logistic-science-pack', 'electronics', 'steel-processing', 'electric-energy-distribution-1',
  'automation-2', 'advanced-material-processing', 'fluid-handling', 'oil-processing', 'steel-axe', 'research-speed-1',
  'plastics', 'sulfur-processing', 'advanced-electronics', 'engine', 'chemical-science-pack', 'research-speed-2',
  'advanced-oil-processing', 'lubricant', 'electric-engine', 'battery', 'advanced-electronics-2', 'low-density-structure',
  'railway', 'production-science-pack', 'robotics', 'utility-science-pack', 'solar-energy', 'electric-energy-accumulators',
  'rocket-fuel', 'rocket-control-unit', 'rocket-silo',
];

// Chemical plant recipes the bot runs, and which fluid each needs water for.
// Fluids made in chemical plants from items; the planner treats them as intermediates.
const MADE_FLUIDS = ['sulfuric-acid', 'lubricant'];
const CHEM_RECIPES = ['plastic-bar', 'sulfur', 'sulfuric-acid', 'lubricant', 'battery', 'electric-engine-unit', 'processing-unit',
  'rocket-fuel', 'solid-fuel-from-light-oil', 'solid-fuel-from-petroleum-gas', 'heavy-oil-cracking', 'light-oil-cracking'];

function createBot(F, options) {
  const cfg = Object.assign({}, DEFAULTS, options || {});
  const logs = [];
  const ctx = {
    F, cfg,
    stats: { placed: 0, poles: 0, pipes: 0, itemsMoved: 0, handCrafts: 0 },
    log(msg) { const line = fmtTime() + ' ' + msg; logs.push(line); if (cfg.verbose) console.log(line); },
  };
  function fmtTime() {
    const s = Math.floor((F.state.tick || 0) / 60);
    return '[' + String(Math.floor(s / 3600)).padStart(1, '0') + ':' + String(Math.floor(s / 60) % 60).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0') + ']';
  }

  // ------------------------------------------------------------------ demand bookkeeping
  const needs = new Map();   // item -> {qty, prio} requested by builders this planning cycle
  const shortages = new Map();
  ctx.need = (item, qty, prio) => {
    const p = prio == null ? 0 : prio;
    const cur = needs.get(item);
    if (!cur) needs.set(item, { qty, prio: p });
    else { cur.qty = Math.max(cur.qty, qty); cur.prio = Math.min(cur.prio, p); }
  };
  ctx.short = item => shortages.set(item, (shortages.get(item) || 0) + 1);

  ctx.space = createSpace(ctx);
  ctx.hands = createHands(ctx);
  ctx.pipes = createPipes(ctx);
  ctx.machines = createMachines(ctx);
  const H = ctx.hands, S = H.stock, M = ctx.machines;

  // ------------------------------------------------------------------ the map
  const world = ctx.world = (function () {
    const sp = F.world.spawn;
    const patches = {};
    function scan() {
      const R = 220, x0 = Math.round(sp.x) - R, y0 = Math.round(sp.y) - R, N = 2 * R + 1;
      const seen = new Uint8Array(N * N);
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        if (seen[j * N + i]) continue;
        const r = F.world.resource(x0 + i, y0 + j);
        if (!r || r.item === 'crude-oil') continue;
        const st = [[i, j]]; seen[j * N + i] = 1;
        let n = 0, amount = 0, mx = 1e9, my = 1e9, Mx = -1e9, My = -1e9, sx = 0, sy = 0;
        while (st.length) {
          const [a, b] = st.pop();
          const rr = F.world.resource(x0 + a, y0 + b);
          n++; amount += rr.amount; sx += a; sy += b;
          mx = Math.min(mx, a); Mx = Math.max(Mx, a); my = Math.min(my, b); My = Math.max(My, b);
          for (const [da, db] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const c = a + da, d = b + db;
            if (c < 0 || d < 0 || c >= N || d >= N || seen[d * N + c]) continue;
            const q = F.world.resource(x0 + c, y0 + d);
            if (q && q.item === r.item) { seen[d * N + c] = 1; st.push([c, d]); }
          }
        }
        if (n < 40) continue;
        const p = { item: r.item, n, amount, x0: x0 + mx, y0: y0 + my, x1: x0 + Mx, y1: y0 + My, cx: x0 + Math.round(sx / n), cy: y0 + Math.round(sy / n) };
        p.dist = Math.hypot(p.cx - sp.x, p.cy - sp.y);
        (patches[r.item] = patches[r.item] || []).push(p);
      }
    }
    scan();
    for (const k of Object.keys(patches)) patches[k].sort((a, b) => a.dist - b.dist);
    let water = null;
    for (const [x, y] of spiral(Math.round(sp.x), Math.round(sp.y), 150)) if (F.world.isWater(x, y)) { water = [x, y]; break; }
    const wells = [];
    for (let y = -cfg.oilRadius; y <= cfg.oilRadius; y++) for (let x = -cfg.oilRadius; x <= cfg.oilRadius; x++) {
      const r = F.world.resource(Math.round(sp.x) + x, Math.round(sp.y) + y);
      if (r && r.item === 'crude-oil') wells.push({ x: Math.round(sp.x) + x, y: Math.round(sp.y) + y, amount: r.amount, d: Math.hypot(x, y) });
    }
    wells.sort((a, b) => a.d - b.d);
    return { patch: ore => (patches[ore] || [])[0], patchesOf: ore => patches[ore] || [], patches, water, wells, spawn: [Math.round(sp.x), Math.round(sp.y)] };
  })();

  // Anchors: where each part of the base grows from.
  (function anchors() {
    const sp = world.spawn;
    // the factory goes on open land away from ore; start at spawn and let the spot finder spread
    const w = world.water || [sp[0] + 20, sp[1] + 20];
    ctx.anchors = {
      home: [sp[0] + 4, sp[1] + 4],
      factory: [sp[0] + 20, sp[1] + 6],
      smelting: [sp[0] + 8, sp[1] - 4],
      labs: [sp[0] + 30, sp[1] + 10],
      water: w,
      campus: [w[0] + 30, w[1] + 4],
    };
  })();

  // ------------------------------------------------------------------ research
  const research = ctx.research = (function () {
    let queued = 0;
    function update() {
      const r = F.state.research;
      while (queued < RESEARCH_ORDER.length && r.queue.length < 3) {
        const id = RESEARCH_ORDER[queued];
        if (F.research.isDone(id) || r.current === id || r.queue.indexOf(id) >= 0) { queued++; continue; }
        if (!F.research.queueWithPrereqs(id)) break;
        queued++;
      }
      if (!r.current && r.queue.length) F.research.start(r.queue[0]);
    }
    // packs for the running tech and the next queued one
    function packsWanted() {
      const r = F.state.research;
      const out = new Set();
      for (const id of [r.current].concat(r.queue.slice(0, 1))) if (id) for (const [p] of F.data.techs[id].cost.packs) out.add(p);
      return [...out];
    }
    // science packs still to be consumed by the queued research
    // Packs for the running tech (current=true) or for the running tech and the next two
    // (packs for techs far ahead would only tie up plates).
    function packDemand(current) {
      const r = F.state.research;
      const need = new Map();
      const ids = (current ? [r.current] : [r.current].concat(r.queue.slice(0, 2))).filter(Boolean);
      for (const id of ids) {
        const inf = F.research.techInfo(id);
        const left = inf.unitsTotal - inf.unitsDone;
        for (const [p, k] of inf.cost.packs) need.set(p, (need.get(p) || 0) + left * k);
      }
      // Packs already inside labs count as delivered — but a lab only works with a full set,
      // so packs still missing from individual labs are always wanted.
      const labs = M.of('lab');
      for (const p of need.keys()) {
        let inside = 0, missing = 0;
        for (const rec of labs) { const c = H.countIn(rec.e, p); inside += c; missing += Math.max(0, 10 - c); }
        need.set(p, Math.min(need.get(p), Math.max(need.get(p) - inside, missing)));
      }
      return need;
    }
    return { update, packsWanted, packDemand };
  })();

  // ------------------------------------------------------------------ power plant
  // Blocks of steam units: a row of boilers with two steam engines stacked north of each.
  // Units are 4 tiles apart; the 1-tile lane between them carries the water pipe from boiler
  // to boiler and the poles that pick up the engines on both sides. One offshore pump feeds
  // the first boiler.
  const power = ctx.power = (function () {
    const blocks = [];
    const generators = [];
    const UNITS = 8;
    let noRoomLogged = false;
    function newBlock() {
      const a = ctx.anchors.water;
      const rect = ctx.space.findSpot(4 * UNITS + 1, 12, a[0], a[1], { margin: 2, maxFeatures: 10, radius: 130 });
      if (!rect) { if (!noRoomLogged) ctx.log('no room for a power block'); noRoomLogged = true; return null; }
      const b = { x: rect.x + 1, y: rect.y, units: 0, rect, water: 'water:power' + blocks.length };
      ctx.anchors[b.water] = [rect.x, rect.y + 11];
      // the block and a one-tile ring around it: engines' steam ports face that ring, and no
      // other pipe may ever pass there
      ctx.space.reserve({ x: rect.x - 1, y: rect.y - 1, w: rect.w + 2, h: rect.h + 2 }, 'power');
      // the lanes stay free for pipes and poles
      for (let k = 0; k <= UNITS; k++) { const lane = { x: b.x - 1 + 4 * k, y: rect.y, w: 1, h: 12 }; ctx.space.release(lane); ctx.space.markNoPipe(lane); }
      // ...except the lane tile where the pipe from boiler to boiler goes (no pole there)
      for (let k = 1; k < UNITS; k++) ctx.space.reserve({ x: b.x - 1 + 4 * k, y: b.y + 11, w: 1, h: 1 }, 'boiler-pipe');
      // the water pipe leaves the block through the ring west of the first boiler
      ctx.space.release({ x: b.x - 2, y: b.y + 11, w: 1, h: 1 });
      blocks.push(b);
      ctx.log('power block at ' + b.x + ',' + b.y);
      return b;
    }
    let pendingUnits = 0;
    function units() { return blocks.reduce((s, b) => s + b.units, 0); }
    function addUnit() {
      let b = blocks.find(x => x.units < UNITS);
      if (!b) b = newBlock();
      if (!b) return false;
      const k = b.units++;
      pendingUnits++;
      const bx = b.x + 4 * k;
      const release = (x, y, w, h) => ctx.space.release({ x, y, w, h });
      M.order({ type: 'boiler', tag: 'power', prio: 0, find: () => { release(bx, b.y + 10, 3, 2); return { x: bx, y: b.y + 10, dir: 0 }; },
        after: e => {
          M.add({ cls: 'boiler', e, block: b });
          // the power plant has its own water network ('water:power'), apart from the campus
          // each power block has its own offshore pump and water network ('water:power<n>')
          ctx.pipes.registerEntity(e, box => box === 'water' ? b.water : 'steam:' + e.id);
          if (k === 0) M.wantPipe(e, 'water', b.water);
          else M.order({ type: 'pipe', tag: 'power', prio: 0, find: () => { release(bx - 1, b.y + 11, 1, 1); return { x: bx - 1, y: b.y + 11, dir: 0 }; }, after: () => ctx.pipes.registerPipe(bx - 1, b.y + 11, b.water) });
        } });
      for (const dy of [5, 0]) {
        M.order({ type: 'steam-engine', tag: 'power', prio: 0, find: () => { release(bx, b.y + dy, 3, 5); return { x: bx, y: b.y + dy, dir: 0 }; },
          after: e => {
            generators.push(e);
            M.add({ cls: 'engine', e });
            ctx.pipes.registerEntity(e, () => 'steam:' + e.id);
            M.wantPower(e); ctx.space.ensurePowered(e);
          } });
      }
      return true;
    }
    function stats() {
      const g = generators[0];
      if (!g) return null;
      const i = F.power.netInfo(g);
      return i && i.id != null ? i : null;
    }
    return { addUnit, units, stats, generators, blocks };
  })();

  // ------------------------------------------------------------------ oil
  const oil = ctx.oil = (function () {
    const seeds = {};      // fluid -> entity that started its network (tank / pump)
    const seeding = {};
    function hasNetwork(fluid) { return !!seeds[fluid] || fluid.startsWith('steam:'); }
    function fluidMap(type, recipe) {
      const d = F.data.entities[type];
      if (d.behaviour === 'crafter') {
        const r = F.data.recipes[recipe];
        return box => {
          if (box.startsWith('fin')) { const f = (r.fluidIngredients || [])[+box.slice(3)]; return f ? f[0] : null; }
          if (box.startsWith('fout')) { const f = (r.fluidResults || [])[+box.slice(4)]; return f ? f[0] : null; }
          return null;
        };
      }
      return () => null;
    }
    // Start the network of `fluid`: an offshore pump for water, a storage tank otherwise.
    function seed(fluid) {
      if (seeds[fluid] || seeding[fluid]) return;
      seeding[fluid] = true;
      if (fluid.startsWith('water')) {
        const anchor = fluid === 'water' ? ctx.anchors.campus : (ctx.anchors[fluid] || ctx.anchors.water);
        M.order({ type: 'offshore-pump', tag: 'oil', prio: 0, find: () => pumpSpot(anchor, fluid),
          after: e => { seeds[fluid] = e; ctx.pipes.registerEntity(e, () => fluid); ctx.pipes.markNetworked(e, fluid); } });
        return;
      }
      M.order({ type: 'storage-tank', tag: 'oil', prio: 0, find: () => campusSpot('storage-tank', null, () => fluid),
        after: e => { seeds[fluid] = e; ctx.pipes.registerEntity(e, () => fluid); ctx.pipes.markNetworked(e, fluid); M.add({ cls: 'tank', e, fluid }); } });
    }
    function pumpSpot(anchor, fluid) {
      for (const [x, y] of spiral(anchor[0], anchor[1], 90)) {
        if (!F.world.isLand(x, y) || ctx.space.isReserved(x, y)) continue;
        for (let d = 0; d < 4; d++) {
          if (!F.api.canPlace('offshore-pump', x, y, d).ok) continue;
          if (!ctx.pipes.spotPortsOk('offshore-pump', x, y, d, () => fluid)) continue;
          const back = ctx.pipes.portTiles('offshore-pump', x, y, d)[0];
          if (!ctx.space.tileOk(back.ax, back.ay, false)) continue;
          void anchor;
          ctx.pipes.reservePorts('offshore-pump', x, y, d, () => fluid);
          return { x, y, dir: d };
        }
      }
      return null;
    }
    // A spot for a fluid building on the campus, with room around it for pipes.
    function campusSpot(type, recipe, fluidOf) {
      const d = F.data.entities[type];
      const sz = d.size[0];
      const a = ctx.anchors.campus;
      for (let dir = 0; dir < 1; dir++) {
        const r = ctx.space.findSpot(sz, sz, a[0], a[1], { margin: 3, maxFeatures: 6, radius: 120, pitch: 1,
          test: rr => ctx.pipes.spotPortsOk(type, rr.x, rr.y, dir, fluidOf) });
        if (r) { ctx.pipes.reservePorts(type, r.x, r.y, dir, fluidOf); return { x: r.x, y: r.y, dir }; }
      }
      return null;
    }
    function buildCrafter(type, recipe, tag) {
      const fm = fluidMap(type, recipe);
      return M.order({ type, tag: tag || ('chem:' + recipe), prio: 0, recipe, find: () => campusSpot(type, recipe, fm),
        after: e => {
          const rec = M.add({ cls: type === 'oil-refinery' ? 'refinery' : 'chem', e, recipe: null });
          M.setRecipe(rec, recipe);
          ctx.pipes.registerEntity(e, fm);
          M.wantPower(e); ctx.space.ensurePowered(e);
          const r = F.data.recipes[recipe];
          const again = () => buildCrafter(type, recipe, tag);
          (r.fluidIngredients || []).forEach(([f], i) => M.wantPipe(e, 'fin' + i, f, again));
          (r.fluidResults || []).forEach(([f], i) => M.wantPipe(e, 'fout' + i, f, again));
        } });
    }
    const jacks = new Set();
    function buildPumpjack(w) {
      if (jacks.has(key(w.x, w.y))) return;
      jacks.add(key(w.x, w.y));
      M.order({ type: 'pumpjack', tag: 'pumpjack', prio: 0, find: () => {
        for (let dir = 0; dir < 4; dir++) {
          if (!F.api.canPlace('pumpjack', w.x - 1, w.y - 1, dir).ok) continue;
          if (!ctx.pipes.spotPortsOk('pumpjack', w.x - 1, w.y - 1, dir, () => 'crude-oil')) continue;
          ctx.pipes.reservePorts('pumpjack', w.x - 1, w.y - 1, dir, () => 'crude-oil');
          return { x: w.x - 1, y: w.y - 1, dir };
        }
        const r = { x: w.x - 1, y: w.y - 1, w: 3, h: 3 };
        ctx.space.clear(r);
        return null;
      }, after: e => {
        M.add({ cls: 'pumpjack', e });
        ctx.pipes.registerEntity(e, () => 'crude-oil');
        M.wantPower(e); ctx.space.ensurePowered(e);
        M.wantPipe(e, 'fb', 'crude-oil', () => { jacks.delete(key(w.x, w.y)); if ((w.moves = (w.moves || 0) + 1) < 3) buildPumpjack(w); });
      } });
    }
    function tankLevel(fluid) {
      const t = seeds[fluid];
      if (!t || fluid.startsWith('water')) return null;
      F.fluids.segmentInfo(t);
      const seg = t.fb && t.fb._seg;
      if (!seg) return null;
      return { amount: seg.amount, capacity: seg.capacity, frac: seg.capacity ? seg.amount / seg.capacity : 0, fluid: seg.fluid };
    }
    return { hasNetwork, seed, buildCrafter, buildPumpjack, tankLevel, fluidMap, seeds, jacks };
  })();

  // ------------------------------------------------------------------ rocket
  const rocket = ctx.rocket = (function () {
    let ordered = false;
    function ensure() {
      if (ordered || !F.research.isDone('rocket-silo')) return;
      ordered = true;
      M.order({ type: 'rocket-silo', tag: 'silo', prio: 0, find: () => {
        const a = ctx.anchors.factory;
        const r = ctx.space.findSpot(9, 9, a[0], a[1], { margin: 1, maxFeatures: 12, radius: 70 });
        return r && { x: r.x, y: r.y, dir: 0 };
      }, after: M.registerAndPower('silo') });
    }
    function service(rec) {
      const e = rec.e;
      H.takeAll(e, ['output']);
      if (e.stage === 'building') {
        const r = F.data.recipes['rocket-part'];
        const partsLeft = 20 - e.parts;
        for (const [id, k] of r.ingredients) {
          const have = H.countIn(e, id, 'input');
          const want = Math.min(k * 3, k * partsLeft);
          if (have < want) H.put(e, id, want - have);
        }
      }
      if (!e.satellite[0] && S.count('satellite') > 0) H.put(e, 'satellite', 1);
      if (e.stage === 'ready' && e.satellite[0]) {
        if (F.rocket.launch(e)) ctx.log('ROCKET LAUNCH started (satellite aboard)');
      }
    }
    function demand() {
      if (!F.research.isDone('rocket-silo')) return [];
      const silo = M.of('silo')[0];
      const partsLeft = silo ? 20 - silo.e.parts : 20;
      const out = [];
      for (const [id, k] of F.data.recipes['rocket-part'].ingredients) {
        const inside = silo ? H.countIn(silo.e, id, 'input') : 0;
        out.push([id, Math.max(0, k * partsLeft - inside)]);
      }
      if (!silo || !silo.e.satellite[0]) out.push(['satellite', 1]);
      return out;
    }
    return { ensure, service, demand };
  })();

  // ------------------------------------------------------------------ production planning
  const planner = (function () {
    const producer = {};
    const recipesFor = {};
    for (const r of Object.values(F.data.recipes)) for (const [id] of r.results) (recipesFor[id] = recipesFor[id] || []).push(r.id);
    // Fluids a chemical plant makes from items (sulfuric acid, lubricant) are planned like
    // intermediates, so their plants get built and loaded; refinery fluids are not (raw).
    for (const f of MADE_FLUIDS) recipesFor[f] = [f];
    const ingr = r => MADE_FLUIDS.length ? r.ingredients.concat((r.fluidIngredients || []).filter(([f]) => MADE_FLUIDS.indexOf(f) >= 0)) : r.ingredients;
    const outOf = (r, item) => (r.results.find(x => x[0] === item) || (r.fluidResults || []).find(x => x[0] === item) || [item, 1])[1];
    function recipeFor(item) {
      if (item === 'solid-fuel') return F.research.isRecipeUnlocked('solid-fuel-from-light-oil') ? 'solid-fuel-from-light-oil' : 'solid-fuel-from-petroleum-gas';
      if (producer[item] !== undefined) return producer[item];
      const list = recipesFor[item] || [];
      producer[item] = list.find(r => r === item) || list[0] || null;
      return producer[item];
    }
    function classOf(recipe) {
      const c = F.data.recipes[recipe].category;
      if (c === 'smelting') return 'furnace';
      if (c === 'crafting' || c === 'advanced') return 'asm';
      if (c === 'chemistry') return 'chem';
      if (c === 'oil-processing') return 'refinery';
      if (c === 'rocket-building') return 'silo';
      return null;
    }
    // products before ingredients
    const topo = [];
    (function () {
      const seen = new Set();
      function visit(item) {
        if (seen.has(item)) return; seen.add(item);
        const r = recipesFor[item];
        if (r) for (const rid of r) for (const [ing] of ingr(F.data.recipes[rid])) visit(ing);
        topo.push(item);
      }
      for (const id of Object.keys(F.data.items).concat(MADE_FLUIDS)) visit(id);
      topo.reverse();
    })();

    const W = [1000, 30, 1];
    let last = { backlog: new Map(), raw: new Map(), spare: new Map() };
    function plan(demands) {
      const left = new Map(S.totals);
      let spare = null;
      const backlog = new Map(); // recipe -> [crafts p0, p1, p2]
      const raw = new Map();
      for (let p = 0; p < 3; p++) {
        if (p === 1) spare = new Map(left);
        const gross = new Map();
        for (const d of demands) if (d.prio === p && d.qty > 0) gross.set(d.item, (gross.get(d.item) || 0) + d.qty);
        if (!gross.size) continue;
        for (const item of topo) {
          const need = gross.get(item); if (!need) continue;
          const use = Math.min(left.get(item) || 0, need);
          if (use) left.set(item, (left.get(item) || 0) - use);
          const net = need - use; if (net <= 0) continue;
          const rid = recipeFor(item);
          if (!rid || !F.research.isRecipeUnlocked(rid)) { raw.set(item, (raw.get(item) || 0) + net); continue; }
          const r = F.data.recipes[rid];
          const out = outOf(r, item);
          const crafts = Math.ceil(net / out);
          let b = backlog.get(rid); if (!b) { b = [0, 0, 0]; backlog.set(rid, b); }
          b[p] += crafts;
          for (const [ing, k] of ingr(r)) gross.set(ing, (gross.get(ing) || 0) + k * crafts);
        }
      }
      last = { backlog, raw, spare: spare || new Map(left) };
      // quota: crafts the machines may be loaded with until the next plan — the backlog minus
      // what is already loaded into machines of that recipe
      const quota = new Map();
      for (const [rid, b] of backlog) quota.set(rid, b[0] + b[1] + b[2]);
      for (const rec of M.list) {
        if (rec.e._removed || !rec.recipe || !quota.has(rec.recipe)) continue;
        const r = F.data.recipes[rec.recipe];
        const inside = rec.cls === 'furnace' ? Math.floor((rec.e.input[0] ? rec.e.input[0].count : 0) / r.ingredients[0][1]) : M.craftsIn(rec.e, rec.recipe);
        quota.set(rec.recipe, quota.get(rec.recipe) - inside);
      }
      ctx.quota = quota;
      return last;
    }
    function weight(rid) { const b = last.backlog.get(rid); if (!b) return 0; const t = F.data.recipes[rid].time; return (b[0] * W[0] + b[1] * W[1] + b[2] * W[2]) * t; }
    function crafts(rid) { const b = last.backlog.get(rid); return b ? b[0] + b[1] + b[2] : 0; }
    function seconds(cls) { let s = 0; for (const [rid, b] of last.backlog) if (classOf(rid) === cls) s += (b[0] + b[1] + b[2]) * F.data.recipes[rid].time; return s; }
    function feasible(rid) { for (const [id, k] of F.data.recipes[rid].ingredients) if (S.count(id) < k) return false; return true; }

    // Share the machines of one class among the recipes with work, highest weight first.
    function assign(cls, horizon) {
      const recs = M.of(cls);
      if (!recs.length) return;
      const cands = [];
      for (const [rid] of last.backlog) if (classOf(rid) === cls && crafts(rid) > 0) cands.push(rid);
      const target = new Map();
      // machines per recipe: enough for its backlog within the horizon, and no more than the
      // ingredients in stock can keep busy for ~15 s (the rest go to the ingredients' recipes)
      const speed = M.speedOf(recs[0].e);
      const capCache = new Map();
      const cap = rid => {
        if (capCache.has(rid)) return capCache.get(rid);
        const r = F.data.recipes[rid];
        let feed = Infinity;
        for (const [id, k] of r.ingredients) feed = Math.min(feed, Math.floor(S.count(id) / k));
        const byBacklog = Math.max(1, Math.ceil(crafts(rid) * r.time / (speed * horizon)));
        const byStock = feed === Infinity ? byBacklog : Math.ceil(feed * r.time / (speed * 15));
        const c = Math.min(byBacklog, byStock);
        capCache.set(rid, c);
        return c;
      };
      for (let n = 0; n < recs.length; n++) {
        let best = null, bw = 0;
        for (const rid of cands) {
          const t = target.get(rid) || 0;
          if (t >= cap(rid)) continue;
          const w = weight(rid) / (t + 1);
          if (w > bw) { bw = w; best = rid; }
        }
        if (!best) break;
        target.set(best, (target.get(best) || 0) + 1);
      }
      // keep machines already on a wanted recipe, free the rest
      const have = new Map();
      const free = [];
      // A machine that is loaded (or was switched less than a minute ago) keeps its recipe
      // while that still has work, even over the target: switching drops the craft in progress
      // and hands the ingredients back, and the targets move with the stock every plan.
      const settled = rec => cls !== 'furnace' && crafts(rec.recipe) > 0 && (rec.starved || 0) < 3 &&
        (rec.e.progress > 0 || M.craftsIn(rec.e, rec.recipe) > 0 || F.state.tick - (rec.since || 0) < 3600);
      for (const rec of recs) {
        const cur = rec.next || rec.recipe;
        const t = target.get(cur) || 0;
        const h = have.get(cur) || 0;
        if (cur && ((h < t && (rec.starved || 0) < 3) || settled(rec))) have.set(cur, h + 1);
        else free.push(rec);
      }
      if (cls === 'furnace') free.sort((a, b) => (a.e.input[0] ? 1 : 0) - (b.e.input[0] ? 1 : 0)).reverse();
      for (const [rid, t] of target) {
        let h = have.get(rid) || 0;
        while (h < t && free.length) {
          const rec = free.pop();
          if (cls === 'furnace') {
            const busy = (rec.e.input[0] && F.data.recipes[rid].ingredients[0][0] !== rec.e.input[0].id) || (rec.e.progress > 0 && rec.recipe !== rid);
            if (busy) rec.next = rid; else { rec.recipe = rid; rec.next = null; }
            rec.starved = 0;
          }
          else if (!M.setRecipe(rec, rid)) continue;
          h++;
        }
        have.set(rid, h);
      }
      for (const rec of recs) {
        const cur = rec.next || rec.recipe;
        if (!cur) continue;
        const n = recs.filter(r => (r.next || r.recipe) === cur).length || 1;
        rec.maxCrafts = Math.ceil(crafts(cur) / n) + 1;
      }
      // idle machines keep their recipe (no churn) but are not loaded beyond demand
      for (const rec of free) if (!target.get(rec.next || rec.recipe)) rec.maxCrafts = 0;
    }

    // The player hand-crafts whatever is in the backlog that no working machine is on,
    // highest priority first; lower-priority crafts only use what priority-0 work leaves over.
    function handCraft() {
      if (H.craftQueueSeconds() > 3) return;
      let urgentWork = false;
      for (const [, b] of last.backlog) if (b[0] > 0) urgentWork = true;
      const cands = [];
      for (const [rid, b] of last.backlog) {
        const r = F.data.recipes[rid];
        if (!r.hand || !F.research.isRecipeUnlocked(rid)) continue;
        const prio = b[0] ? 0 : b[1] ? 1 : 2;
        const onAsm = M.of('asm').filter(x => x.recipe === rid && !x.starved).length;
        if (onAsm && (prio > 0 || onAsm * 30 >= b[0] * r.time)) continue;
        if (prio > 0 && urgentWork && !r.ingredients.every(([id, k]) => (last.spare.get(id) || 0) >= k)) continue;
        cands.push([rid, prio, b[0] || b[1] || b[2]]);
      }
      cands.sort((a, b) => a[1] - b[1] || F.data.recipes[a[0]].time - F.data.recipes[b[0]].time);
      for (const [rid, , n] of cands) {
        const k = Math.max(1, Math.min(n, Math.ceil(8 / F.data.recipes[rid].time)));
        for (let m = k; m >= 1; m = Math.floor(m / 2)) if (H.craft(rid, m)) { ctx.stats.handCrafts += m; return; }
      }
    }
    return { plan, assign, handCraft, weight, crafts, seconds, recipeFor, classOf, last: () => last, feasible };
  })();
  ctx.planner = planner;

  // ------------------------------------------------------------------ expansion rules
  const flags = {};
  function once(name, fn) { if (!flags[name]) { flags[name] = true; fn(); } }
  function orderCount(tag) { return M.pending(tag); }
  function best(types) { for (const t of types) if (F.research.isRecipeUnlocked(t)) return t; return types[types.length - 1]; }

  function bootstrap() {
    // Early hand work: stone and coal from rocks, then ore by hand while the first drills run.
    const drills = M.of('drill');
    if (!H.mining()) {
      const want = [['stone', 25], ['coal', 20], ['iron-ore', 30], ['copper-ore', 10]];
      for (const [item, n] of want) {
        if (S.count(item) + (item === 'iron-ore' ? S.count('iron-plate') : 0) >= n) continue;
        if ((item === 'stone' || item === 'coal') && mineRock()) return;
        const p = world.patch(item);
        if (p) { const t = nearestOreTile(p); if (t) { H.mine({ x: t[0], y: t[1], kind: 'ore', left: 10 }); return; } }
      }
      if (drills.length < 6) { const p = world.patch('iron-ore'); const t = p && nearestOreTile(p); if (t) H.mine({ x: t[0], y: t[1], kind: 'ore', left: 10 }); }
    }
  }
  function mineRock() {
    const sp = world.spawn;
    for (const [x, y] of spiral(sp[0], sp[1], 45)) {
      const f = F.world.feature(x, y);
      if (f === 2 || f === 3) { H.mine({ x, y, kind: 'feature' }); return true; }
    }
    return false;
  }
  function nearestOreTile(p) {
    for (const [x, y] of spiral(p.cx, p.cy, 30)) {
      const r = F.world.resource(x, y);
      if (r && r.item === p.item && !F.world.entityAt(x, y) && !F.world.feature(x, y)) return [x, y];
    }
    return null;
  }
  function wood() {
    // trees for small poles, while medium poles are not researched yet
    if (H.mining() || S.count('wood') >= 10 || F.research.isRecipeUnlocked('medium-electric-pole')) return;
    const sp = world.spawn;
    for (const [x, y] of spiral(sp[0], sp[1], 110)) if (F.world.feature(x, y) === 1) { H.mine({ x, y, kind: 'feature' }); return; }
  }

  function drillCount(ore) { return M.of('drill').filter(r => r.ore === ore).length + orderCount('drill:' + ore); }

  function expand() {
    const electric = power.generators.length > 0;
    const drillType = electric ? 'electric-mining-drill' : 'burner-mining-drill';
    const furnaceType = F.research.isRecipeUnlocked('steel-furnace') ? 'steel-furnace' : 'stone-furnace';
    const asmType = best(['assembling-machine-2', 'assembling-machine-1']);

    // warehouse
    if (S.freeSlots() < 16 + 4 * S.chests.length / 10 && orderCount('chest') < 2 && F.research) M.buildChest();

    // mining: burner drills first, electric once there is power. More drills while the ore
    // the plan still needs would take the current drills over three minutes to mine.
    const ores = ['iron-ore', 'copper-ore', 'coal', 'stone'];
    const minDrills = electric ? { 'iron-ore': 8, 'copper-ore': 6, 'coal': 4, 'stone': 2 } : { 'iron-ore': 4, 'copper-ore': 2, 'coal': 2, 'stone': 1 };
    const chestless = M.of('drill').filter(r => !r.chest).length + orderCount('drill-chest');
    const drillsIdle = M.of('drill').filter(r => F.data.entities[r.e.type].energy.type === 'electric' && !ctx.space.onMain(r.e)).length;
    const raw = planner.last().raw;
    ctx.drillBlock = { chestless, drillsIdle };
    for (const ore of ores) {
      if (chestless > 1 || drillsIdle > 0) break;
      const have = drillCount(ore);
      if (orderCount('drill:' + ore) >= 2 || have >= cfg.maxDrillsPerOre || S.count(ore) > 3000) continue;
      const rate = M.of('drill').filter(r => r.ore === ore).reduce((t, r) => t + F.data.entities[r.e.type].drill.speed, 0);
      let deficit = (raw.get(ore) || 0) - S.count(ore);
      if (ore === 'coal') deficit = Math.max(deficit, 1500 - S.count('coal'));
      if (ore === 'iron-ore') deficit += (raw.get('iron-plate') || 0);
      if (ore === 'copper-ore') deficit += (raw.get('copper-plate') || 0);
      // furnaces smelting this ore want ~1 ore per 3.2 s each (per unit of furnace speed)
      const smelters = M.of('furnace').filter(r => r.recipe && F.data.recipes[r.recipe].ingredients[0][0] === ore).reduce((t, r) => t + M.speedOf(r.e) / 3.2, 0);
      // iron is the one resource that limits the whole game (a single patch): once there is
      // power, keep adding iron drills until the patch is full; copper follows iron
      const always = electric && (ore === 'iron-ore' || (ore === 'copper-ore' && have < 0.6 * drillCount('iron-ore')));
      if (have < minDrills[ore] || always || deficit / Math.max(0.1, rate) > 60 || (smelters > rate * 1.1 && deficit > 0)) M.buildDrill(drillType, ore);
    }

    // furnaces: more only while ore piles up and the furnaces have a backlog
    const smeltBacklog = planner.seconds('furnace');
    const nf = M.count('furnace') + orderCount('furnace');
    const oreWaiting = S.count('iron-ore') + S.count('copper-ore') + S.count('stone');
    const starvedF = M.of('furnace').filter(r => r.starved > 2).length;
    const minF = electric ? 6 : 3;
    const wantMoreF = nf < minF || (smeltBacklog / Math.max(1, nf) > 40 && oreWaiting > 30 * nf && starvedF === 0);
    if (wantMoreF && nf < cfg.maxFurnaces && orderCount('furnace') < 2) M.buildFurnace(furnaceType);
    // at the cap, swap slow stone furnaces for steel ones (twice the speed)
    if (wantMoreF && nf >= cfg.maxFurnaces && furnaceType === 'steel-furnace' && orderCount('furnace') === 0 && M.of('furnace').some(r => r.e.type === 'stone-furnace')) {
      const o = M.buildFurnace('steel-furnace');
      const after = o.after;
      o.after = e => {
        after(e);
        const old = M.of('furnace').find(r => r.e.type === 'stone-furnace' && !(r.e.progress > 0));
        if (old) H.remove(old.e);
      };
    }

    if (!electric) {
      // first power: one steam unit (orders build it once the items exist)
      if (M.count('drill') >= 4 && power.units() === 0) power.addUnit();
      return;
    }
    // power: keep 25% headroom
    // power: add a steam unit when demand nears capacity — only while every boiler runs
    const ps = power.stats();
    // A boiler still without water or fuel after three minutes will not come right (its pipe
    // could not be laid): its block takes no more units — the water runs through the boilers —
    // and it no longer holds up the expansion.
    for (const r of M.of('boiler')) {
      const st = statusOf(r.e);
      if (st !== 'no_water' && st !== 'no_fuel') { r.badSince = 0; continue; }
      if (!r.badSince) r.badSince = F.state.tick;
      if (F.state.tick - r.badSince > 3 * 3600 && !r.given) {
        r.given = true;
        if (r.block) r.block.units = Math.max(r.block.units, 8);
        ctx.log('boiler at ' + r.e.x + ',' + r.e.y + ' has ' + st + ': giving up on it and closing its power block');
      }
    }
    const boilersOk = M.of('boiler').every(r => !r.badSince || r.given);
    if (ps && boilersOk && power.units() < cfg.maxPowerUnits && orderCount('power') === 0) {
      if (ps.demand > 0.75 * ps.capacity || (ps.satisfaction < 0.9 && ps.demand > 0.5 * ps.capacity)) power.addUnit();
    }
    // labs
    const nl = M.count('lab') + orderCount('lab');
    const packDemand = research.packDemand();
    let packsIdle = 0; for (const p of research.packsWanted()) packsIdle += S.count(p);
    if ((nl < 2 || (packsIdle > 60 && nl < cfg.maxLabs)) && orderCount('lab') === 0 && [...packDemand.values()].some(v => v > 0)) M.buildLab();
    // assemblers
    if (F.research.isDone('automation')) {
      const na = M.count('asm') + orderCount('asm');
      const asmBacklog = planner.seconds('asm') / Math.max(1, na);
      const starvedA = M.of('asm').filter(r => r.starved > 1 || !r.recipe).length;
      if ((na < 4 || (asmBacklog > 60 && starvedA <= na * 0.15)) && na < cfg.maxAsm && orderCount('asm') < 2) M.buildAsm(asmType);
    }
    // oil
    if (F.research.isDone('oil-processing')) {
      for (const w of world.wells.slice(0, cfg.maxPumpjacks)) oil.buildPumpjack(w);
      // basic refineries until advanced oil processing: add one while crude backs up and
      // petroleum runs dry
      const basic = M.of('refinery').filter(r => r.recipe === 'basic-oil-processing').length + M.orders.filter(o => o.recipe === 'basic-oil-processing').length;
      const crudeL = oil.tankLevel('crude-oil'), petL = oil.tankLevel('petroleum-gas');
      if (!F.research.isDone('advanced-oil-processing') && (basic === 0 || basic < 5 && !M.orders.some(o => o.recipe === 'basic-oil-processing') &&
          crudeL && crudeL.frac > 0.5 && (!petL || petL.frac < 0.1))) oil.buildCrafter('oil-refinery', 'basic-oil-processing', 'refinery');
    }
    // advanced refineries make about twice the petroleum per crude: once two of them are
    // connected, the basic ones are taken down (their crude goes to the advanced ones)
    const adv = M.of('refinery').filter(r => r.recipe === 'advanced-oil-processing' && ctx.pipes.boxOf(r.e, 'fin0')._connected && ctx.pipes.boxOf(r.e, 'fout2')._connected);
    if (adv.length >= 2) for (const r of M.of('refinery').filter(x => x.recipe === 'basic-oil-processing')) { ctx.log('removing basic refinery at ' + r.e.x + ',' + r.e.y); H.remove(r.e); }
    if (F.research.isDone('advanced-oil-processing')) {
      const nr = M.of('refinery').filter(r => r.recipe === 'advanced-oil-processing').length + M.orders.filter(o => o.recipe === 'advanced-oil-processing').length;
      const crude = oil.tankLevel('crude-oil');
      if (nr < 1 || (crude && crude.frac > 0.3 && nr < 6 && M.orders.filter(o => o.recipe === 'advanced-oil-processing').length === 0)) oil.buildCrafter('oil-refinery', 'advanced-oil-processing', 'refinery');
      // cracking keeps the refinery outputs flowing
      for (const [fluid, rec] of [['heavy-oil', 'heavy-oil-cracking'], ['light-oil', 'light-oil-cracking']]) {
        const lv = oil.tankLevel(fluid);
        const n = chemCount(rec);
        if (n === 0 || (lv && lv.frac > 0.5 && n < 6)) buildChem(rec);
      }
    }
    // chemical plants follow demand
    for (const rec of CHEM_RECIPES) {
      if (!F.research.isRecipeUnlocked(rec) || rec.endsWith('cracking')) continue;
      const crafts = planner.crafts(rec);
      const n = chemCount(rec);
      if (crafts > 0 && (n === 0 || (planner.crafts(rec) * F.data.recipes[rec].time / n > 90 && n < 8))) buildChem(rec);
    }
    // plants whose recipe takes no items (sulfur) would run forever: pause them while stock is high
    for (const rec of M.of('chem')) {
      const want = rec.wanted || rec.recipe;
      if (!want) continue;
      const r = F.data.recipes[want];
      if (r.ingredients.length || !r.results.length) continue;
      const out = r.results[0][0];
      const wanted = planner.crafts(want) > 0 || planner.crafts(planner.recipeFor(out) || want) > 0;
      // solid fuel is also the petroleum sink: a full petroleum network would stop the refineries
      const lv = out === 'solid-fuel' && oil.tankLevel(r.fluidIngredients[0][0]);
      const sink = !!(lv && lv.frac > 0.6);
      if (rec.recipe && S.count(out) > 400 && !wanted && !sink) { rec.wanted = want; M.setRecipe(rec, null); rec.recipe = null; }
      else if (!rec.recipe && (S.count(out) < 150 || wanted || sink)) M.setRecipe(rec, want);
    }
    // light oil goes to solid fuel (rocket fuel) while that is wanted: cracking only takes the
    // surplus
    const lightWanted = planner.crafts('solid-fuel-from-light-oil') > 0 || planner.crafts('rocket-fuel') > 0;
    const light = oil.tankLevel('light-oil');
    for (const rec of M.of('chem').filter(r => (r.recipe || r.wanted) === 'light-oil-cracking')) {
      const frac = light ? light.frac : 0;
      if (rec.recipe && lightWanted && frac < 0.4) { rec.wanted = rec.recipe; M.setRecipe(rec, null); rec.recipe = null; }
      else if (!rec.recipe && (!lightWanted || frac > 0.7)) M.setRecipe(rec, 'light-oil-cracking');
    }
    // a petroleum sink so refineries never stall: solid fuel for the boilers
    const pet = oil.tankLevel('petroleum-gas');
    if (pet && pet.frac > 0.8 && chemCount('solid-fuel-from-petroleum-gas') < 3) buildChem('solid-fuel-from-petroleum-gas');
    rocket.ensure();
  }
  function statusOf(e) {
    const b = F.behaviours[F.data.entities[e.type].behaviour];
    return b && b.status ? b.status(e) : e._status;
  }
  function chemCount(recipe) { return M.of('chem').filter(r => (r.recipe || r.wanted) === recipe).length + M.orders.filter(o => o.recipe === recipe).length; }
  function buildChem(recipe) { if (M.orders.some(o => o.recipe === recipe)) return; oil.buildCrafter('chemical-plant', recipe); }

  // ------------------------------------------------------------------ demand list
  function demands() {
    const d = [];
    for (const [item, n] of needs) d.push({ item, qty: n.qty, prio: n.prio });
    for (const o of M.orders) {
      const item = F.data.entities[o.type].minable || o.type;
      if (!needs.has(item)) d.push({ item, qty: 1 + M.orders.filter(x => (F.data.entities[x.type].minable || x.type) === item).length - 1, prio: o.prio == null ? 0 : o.prio });
    }
    // a standing stock of poles and pipes, so new buildings can be hooked up right away
    const pole = ctx.space.poleType();
    d.push({ item: pole, qty: 20 + 3 * M.unpowered.size, prio: 0 });
    if (F.research.isDone('oil-processing')) { d.push({ item: 'pipe', qty: 100, prio: 1 }); d.push({ item: 'pipe-to-ground', qty: 10, prio: 1 }); }
    for (const [id, n] of rocket.demand()) d.push({ item: id, qty: n, prio: 1 });
    // research: a few minutes of packs ahead, not the whole tree (that would tie up the plates)
    // (the running tech first: the next ones' packs only get what it leaves over)
    const now = research.packDemand(true);
    for (const [p, n] of now) if (n > 0) d.push({ item: p, qty: Math.min(n, 200), prio: 1 });
    for (const [p, n] of research.packDemand()) {
      const rest = Math.min(n, 200) - Math.min(now.get(p) || 0, 200);
      if (rest > 0) d.push({ item: p, qty: rest, prio: 2 });
    }
    // keep fuel for the boilers and burner buildings
    return d;
  }

  // ------------------------------------------------------------------ main loop
  let steps = 0;
  const milestones = [];
  function milestone(name) {
    if (milestones.some(m => m.name === name)) return;
    milestones.push({ name, tick: F.state.tick });
    ctx.log('MILESTONE ' + name);
  }
  F.events.on('research:done', ev => { ctx.log('research done: ' + ev.id); if (ev.id === 'oil-processing' || ev.id === 'automation' || ev.id === 'rocket-silo' || ev.id === 'chemical-science-pack' || ev.id === 'production-science-pack' || ev.id === 'utility-science-pack') milestone('research ' + ev.id); });
  F.events.on('rocket:launched', ev => { milestone('rocket launched' + (ev.satellite ? ' with satellite' : '')); });

  function step() {
    steps++;
    H.tickMining();
    S.refresh();
    M.serviceAll();
    S.refresh();
    M.processOrders();
    if (steps % cfg.planEvery === 1) {
      research.update();
      if (power.generators.length && !milestones.some(m => m.name === 'electricity')) { const ps = power.stats(); if (ps && ps.capacity > 0) milestone('electricity'); }
      bootstrap();
      wood();
      expand();
      M.powerPass();
      M.pipePass();
      checkFluids();
      planner.plan(demands());
      for (const cls of ['asm', 'furnace']) planner.assign(cls, cls === 'furnace' ? 60 : 30);
      planner.handCraft();
      needs.clear();
      shortages.clear();
    }
    if (S.chests.length && H.stock.handFree() < 30) S.stash();
  }
  function debug() {
    const cls = {};
    for (const r of M.list) if (!r.e._removed) cls[r.cls] = (cls[r.cls] || 0) + 1;
    const ord = {};
    for (const o of M.orders) ord[o.tag || o.type] = (ord[o.tag || o.type] || 0) + 1;
    const top = [...S.totals].sort((a, b) => b[1] - a[1]).slice(0, 18).map(([k, v]) => k + ':' + v).join(' ');
    const bl = [...planner.last().backlog].map(([r, b]) => [r, b]).sort((a, b) => planner.weight(b[0]) - planner.weight(a[0])).slice(0, 10).map(([r, b]) => r + '=' + b.join('/')).join(' ');
    const asm = M.of('asm').map(r => (r.recipe || '-') + (r.starved ? '!' : '')).join(',');
    const util = {};
    for (const r of M.list) {
      if (r.e._removed) continue;
      const st = statusOf(r.e);
      const u = util[r.cls] = util[r.cls] || {};
      u[st] = (u[st] || 0) + 1;
    }
    const utilStr = Object.entries(util).map(([c, u]) => c + '{' + Object.entries(u).map(([k, v]) => k + ':' + v).join(',') + '}').join(' ');
    const perOre = {};
    for (const r of M.of('drill')) perOre[r.ore] = (perOre[r.ore] || 0) + 1;
    // fluid crafters: recipe -> status counts, with the fluid levels of one of them
    const fc = {};
    for (const r of M.of('chem').concat(M.of('refinery'))) {
      const k = r.recipe || r.wanted || '-';
      const g = fc[k] = fc[k] || { n: {}, box: '' };
      const st = statusOf(r.e); g.n[st] = (g.n[st] || 0) + 1;
      if (!g.box && st !== 'working') g.box = [...(r.e.fin || []), ...(r.e.fout || [])].map(b => { const x = b._seg || b; return (x.fluid || '?') + ':' + Math.round(x.amount); }).join('/');
    }
    const fcStr = Object.entries(fc).map(([k, g]) => k + JSON.stringify(g.n).replace(/"/g, '') + (g.box ? '[' + g.box + ']' : '')).join(' ');
    return '  machines ' + JSON.stringify(cls) + ' drills ' + JSON.stringify(perOre) + ' block ' + JSON.stringify(ctx.drillBlock) + '\n  status ' + utilStr + '\n  fluid-crafters ' + fcStr + '\n  orders ' + JSON.stringify(ord) + '\n  stock ' + top +
      '\n  backlog ' + bl + '\n  asm ' + asm + '\n  craftQ ' + F.state.player.craftQueue.map(q => q.recipe + 'x' + q.count).join(',') +
      '\n  power ' + M.of('boiler').map(r => 'B' + statusOf(r.e) + '(w' + Math.round((r.e.water._seg || r.e.water).amount) + ')').join(' ') + ' ' + M.of('engine').map(r => 'E' + statusOf(r.e)).join(' ') +
      ' pumps ' + F.entities.all().filter(e => e.type === 'offshore-pump').map(e => e.x + ',' + e.y + ':' + statusOf(e) + ':' + Math.round((e.fb._seg || e.fb).amount)).join(' ') +
      '\n  unpowered ' + M.unpowered.size + ' mining ' + JSON.stringify(F.input.state.mine) + flows();
  }
  // What was taken out of / put into buildings since the last report (hand crafting not included).
  function flows() {
    const f = ctx.flow; let out = '';
    for (const item of ['iron-ore', 'iron-plate', 'steel-plate', 'copper-plate', 'electronic-circuit']) {
      const sum = m => [...(m.get(item) || new Map()).values()].reduce((a, b) => a + b, 0);
      const top = [...(f.used.get(item) || new Map())].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => k + ':' + v).join(' ');
      out += '\n  flow ' + item + ' made ' + sum(f.made) + ' used ' + sum(f.used) + ' <- ' + top;
    }
    const made = [...f.made].map(([k, m]) => [k, [...m.values()].reduce((a, b) => a + b, 0)]).sort((a, b) => b[1] - a[1]).slice(0, 30);
    out += '\n  made ' + made.map(([k, v]) => k + ':' + v).join(' ');
    const placed = [...f.used].filter(([, m]) => m.get('placed')).map(([k, m]) => k + ':' + m.get('placed')).join(' ');
    out += '\n  placed ' + placed;
    f.made.clear(); f.used.clear();
    return out;
  }
  // Every fluid network must carry only its own fluid; a mix would stall its machines for good.
  const mixed = new Set();
  function checkFluids() {
    for (const f of Object.keys(oil.seeds)) {
      if (f.startsWith('water')) continue;
      const lv = oil.tankLevel(f);
      if (lv && lv.fluid && lv.fluid !== f && !mixed.has(f)) { mixed.add(f); ctx.log('FLUID MIX: the ' + f + ' network holds ' + lv.fluid); }
    }
  }
  function victory() { return !!(F.state.rocket && F.state.rocket.launches > 0); }
  function summary() {
    const byType = {};
    for (const e of F.entities.all()) if (!e._removed) byType[e.type] = (byType[e.type] || 0) + 1;
    return {
      tick: F.state.tick, time: fmtTime(), victory: victory(), milestones: milestones.map(m => ({ name: m.name, time: '[' + Math.floor(m.tick / 3600) + ' min]' })),
      researched: Object.keys(F.state.research.done).length, current: F.state.research.current,
      entities: Object.values(byType).reduce((a, b) => a + b, 0), byType, stats: ctx.stats,
      power: power.stats() && { capacity: Math.round(power.stats().capacity), demand: Math.round(power.stats().demand), satisfaction: +power.stats().satisfaction.toFixed(2) },
    };
  }
  return { step, victory, summary, debug, milestones, logs, ctx, cfg };
}

module.exports = { createBot, RESEARCH_ORDER };
