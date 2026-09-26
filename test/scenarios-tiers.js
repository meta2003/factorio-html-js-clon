// Scenario tests for src/07-data-tiers.js (higher building tiers) and the research queue's
// prerequisite-chain support in src/34-research.js. Also a whole-game data check: every
// technology is reachable and every ingredient has a source.
// Helpers copied from test/scenarios.js (scenario files do not share helpers).
'use strict';

const TPS = 60;
function ticks(F, n) { for (let i = 0; i < n; i++) F.tick(); }
function fresh(F, seed = 42) { F.newGame({ seed }); return F.state; }
function spawn(F) { const s = F.world.spawn; return { x: Math.round(s.x), y: Math.round(s.y) }; }

function findFlat(F, w, h) {
  const sp = spawn(F);
  const pl = F.state.player; const px = Math.floor(pl.x), py = Math.floor(pl.y);
  for (let r = 2; r < 160; r++) {
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

function place(F, assert, type, x, y, dir = 0) {
  F.api.give(type, 1);
  const chk = F.api.canPlace(type, x, y, dir);
  assert(chk.ok, `canPlace ${type} at ${x},${y} dir ${dir}: ${chk.reason}`);
  const e = F.api.place(type, x, y, dir, { fromInventory: true });
  assert(e, `place ${type} at ${x},${y}`);
  return e;
}

// A solar field with one substation in its middle-left: powers everything within the
// substation's 18×18 area. Returns the area origin (consumers go at x+1.., y+7..).
function solarBlock(F, assert, panels) {
  const a = findFlat(F, 18, 18);
  for (let i = 0; i < panels; i++) place(F, assert, 'solar-panel', a.x + 3 * (i % 6), a.y + 3 * Math.floor(i / 6), 0);
  const rows = Math.ceil(panels / 6);
  const sub = place(F, assert, 'substation', a.x + 8, a.y + 3 * rows, 0);
  return { a, sub, freeY: a.y + 3 * rows + 2 };
}

function beltRun(F, assert, type, x, y, n) {
  const belts = [];
  for (let i = 0; i < n; i++) belts.push(place(F, assert, type, x + i, y, 1));
  return belts;
}
function beltArrivals(F, belts, seconds) {
  let arrived = 0;
  const last = belts[belts.length - 1];
  for (let t = 0; t < seconds * TPS; t++) {
    F.belts.canInsert(belts[0], 0, 0) && F.belts.insert(belts[0], 0, 0, 'iron-ore');
    F.belts.canInsert(belts[0], 1, 0) && F.belts.insert(belts[0], 1, 0, 'iron-ore');
    F.tick();
    while (F.belts.take(last, null)) arrived++;
  }
  return arrived;
}

module.exports = {
  tiers_data_is_complete(F, assert) {
    fresh(F);
    const ids = ['express-transport-belt', 'express-underground-belt', 'express-splitter', 'filter-inserter',
      'stack-inserter', 'big-electric-pole', 'substation', 'electric-furnace', 'assembling-machine-3'];
    for (const id of ids) {
      assert(F.data.items[id] && F.data.items[id].place === id, `item ${id} places its entity`);
      assert(F.data.entities[id], `entity ${id}`);
      const r = F.data.recipes[id];
      assert(r && r.results[0][0] === id, `recipe ${id}`);
      assert(r.unlockedBy && F.data.techs[r.unlockedBy].unlocks.indexOf(id) >= 0, `${id} unlocked by ${r.unlockedBy}`);
      assert(F.i18n.has('item.' + id) && F.i18n.has('ent.' + id), `${id} has names`);
      assert(F.data.order.items.indexOf(id) >= 0, `${id} in item order`);
    }
    assert(!F.research.isRecipeUnlocked('assembling-machine-3'), 'AM3 locked at start');
    return ids.length + ' new buildings';
  },

  tech_tree_reachable_and_sourced(F, assert) {
    fresh(F);
    const T = F.data.techs;
    // Acyclic and every prerequisite exists: DFS with colouring.
    const colour = {};
    const visit = (id, path) => {
      assert(T[id], `tech ${id} exists (from ${path})`);
      if (colour[id] === 2) return;
      assert(colour[id] !== 1, `cycle through ${id}`);
      colour[id] = 1;
      T[id].prereq.forEach(p => visit(p, id));
      colour[id] = 2;
    };
    Object.keys(T).forEach(id => visit(id, 'root'));
    // Every science pack a tech costs is unlocked no later than the tech itself.
    const ancestors = (id, acc = new Set()) => { T[id].prereq.forEach(p => { if (!acc.has(p)) { acc.add(p); ancestors(p, acc); } }); return acc; };
    for (const id of Object.keys(T)) {
      const anc = ancestors(id);
      for (const [pack] of T[id].cost.packs) {
        const rec = F.data.recipes[pack];
        assert(rec, `pack ${pack} has a recipe`);
        assert(!rec.unlockedBy || anc.has(rec.unlockedBy), `${id} needs ${pack}, unlocked by ${rec.unlockedBy}, which is not a prerequisite`);
      }
    }
    // Every recipe ingredient is a resource or produced by some recipe (items and fluids).
    const made = new Set(), fluidsMade = new Set(['water', 'crude-oil']);
    for (const r of Object.values(F.data.recipes)) {
      r.results.forEach(([id]) => made.add(id));
      (r.fluidResults || []).forEach(([id]) => fluidsMade.add(id));
    }
    ['rocket-part'].forEach(id => made.add(id));
    for (const r of Object.values(F.data.recipes)) {
      for (const [id] of r.ingredients) {
        const it = F.data.items[id];
        assert(it.category === 'resource' || made.has(id), `recipe ${r.id}: nothing makes ${id}`);
      }
      for (const [id] of (r.fluidIngredients || [])) assert(fluidsMade.has(id), `recipe ${r.id}: nothing makes fluid ${id}`);
    }
    return Object.keys(T).length + ' techs, ' + Object.keys(F.data.recipes).length + ' recipes';
  },

  express_belt_is_faster(F, assert) {
    fresh(F);
    const a = findFlat(F, 12, 4);
    const fast = beltRun(F, assert, 'fast-transport-belt', a.x, a.y + 1, 10);
    const exp = beltRun(F, assert, 'express-transport-belt', a.x, a.y + 3, 10);
    ticks(F, 2);
    const nFast = beltArrivals(F, fast, 20);
    const nExp = beltArrivals(F, exp, 20);
    assert(nExp > nFast * 1.2, `express ${nExp} vs fast ${nFast}`);
    return `fast ${nFast}, express ${nExp} in 20 s`;
  },

  express_underground_pairs_over_8(F, assert) {
    fresh(F);
    const a = findFlat(F, 12, 3);
    const inE = place(F, assert, 'express-underground-belt', a.x, a.y + 1, 1);
    const outE = place(F, assert, 'express-underground-belt', a.x + 9, a.y + 1, 1);
    ticks(F, 2);
    assert(inE.pairId === outE.id || outE.pairId === inE.id, `express undergrounds pair across a gap of 8 (in ${inE.pairId}, out ${outE.pairId})`);
  },

  electric_furnace_smelts_without_fuel(F, assert) {
    fresh(F);
    const { a, freeY } = solarBlock(F, assert, 4);
    const fur = place(F, assert, 'electric-furnace', a.x + 2, freeY, 0);
    assert(fur.fuel === null, 'no fuel slot');
    assert(F.entities.canAcceptItem(fur, 'coal') === 0, 'refuses coal');
    const names = F.entities.inventories(fur).map(i => i.name);
    assert(names.indexOf('fuel') < 0, `inventories ${names}`);
    assert(F.api.insertInto(fur, 'iron-ore', 10) > 0, 'accepts ore');
    ticks(F, 10 * TPS);
    const plates = F.inv.count(fur.output, 'iron-plate');
    assert(plates >= 5, `smelted ${plates} plates in 10 s (speed 2 -> 1.6 s each)`);
    // Save/load keeps it fuel-less and working.
    F.load(F.save());
    const f2 = F.api.entityAt(fur.x, fur.y);
    assert(f2 && f2.fuel === null && f2.type === 'electric-furnace', 'reloaded');
    return plates + ' plates';
  },

  assembling_machine_3_is_fastest(F, assert) {
    fresh(F);
    const { a, freeY } = solarBlock(F, assert, 12);
    const am2 = place(F, assert, 'assembling-machine-2', a.x + 1, freeY, 0);
    const am3 = place(F, assert, 'assembling-machine-3', a.x + 5, freeY, 0);
    for (const m of [am2, am3]) F.api.setRecipe(m, 'iron-gear-wheel');
    const made = { a2: 0, a3: 0 };
    for (let t = 0; t < 10 * TPS; t++) {
      for (const m of [am2, am3]) {
        if (F.inv.count(m.input, 'iron-plate') < 4) F.api.insertInto(m, 'iron-plate', 4);
      }
      F.tick();
      for (const [k, m] of [['a2', am2], ['a3', am3]]) {
        const n = F.inv.count(m.output, 'iron-gear-wheel');
        if (n) { F.inv.remove(m.output, 'iron-gear-wheel', n); made[k] += n; }
      }
    }
    assert(made.a3 > made.a2 * 1.4, `AM3 ${made.a3} vs AM2 ${made.a2} gears`);
    assert(made.a3 >= 20, `AM3 made ${made.a3} gears in 10 s (expect ≈ 25)`);
    return `AM2 ${made.a2}, AM3 ${made.a3}`;
  },

  filter_inserter_moves_only_filtered(F, assert) {
    fresh(F);
    const { a, freeY } = solarBlock(F, assert, 2);
    const src = place(F, assert, 'iron-chest', a.x + 2, freeY, 0);
    const ins = place(F, assert, 'filter-inserter', a.x + 2, freeY + 1, 2); // picks north, drops south
    const dst = place(F, assert, 'iron-chest', a.x + 2, freeY + 2, 0);
    F.api.insertInto(src, 'iron-plate', 20);
    F.api.insertInto(src, 'copper-plate', 20);
    ins.filter[0] = 'copper-plate';
    ticks(F, 8 * TPS);
    const cu = F.inv.count(dst.inv, 'copper-plate'), fe = F.inv.count(dst.inv, 'iron-plate');
    assert(cu >= 5 && fe === 0, `moved copper ${cu}, iron ${fe}`);
    ins.filterMode = 'blacklist';
    ticks(F, 4 * TPS);
    assert(F.inv.count(dst.inv, 'iron-plate') > 0, 'blacklist mode moves the other item');
    return `copper ${cu}`;
  },

  stack_inserter_moves_stacks(F, assert) {
    fresh(F);
    const { a, freeY } = solarBlock(F, assert, 4);
    const pairs = [['fast-inserter', a.x + 2], ['stack-inserter', a.x + 5]].map(([type, x]) => {
      const src = place(F, assert, 'iron-chest', x, freeY, 0);
      const ins = place(F, assert, type, x, freeY + 1, 2);
      const dst = place(F, assert, 'iron-chest', x, freeY + 2, 0);
      F.api.insertInto(src, 'iron-plate', 200);
      return { type, ins, dst };
    });
    let maxHand = 0;
    for (let t = 0; t < 10 * TPS; t++) {
      F.tick();
      const h = pairs[1].ins.hand; if (h && h.count > maxHand) maxHand = h.count;
    }
    const nFast = F.inv.count(pairs[0].dst.inv, 'iron-plate'), nStack = F.inv.count(pairs[1].dst.inv, 'iron-plate');
    assert(maxHand === 4, `stack hand ${maxHand}`);
    assert(nStack >= nFast * 3, `stack ${nStack} vs fast ${nFast}`);
    return `fast ${nFast}, stack ${nStack}`;
  },

  substation_and_big_pole_coverage(F, assert) {
    fresh(F);
    const { sub } = solarBlock(F, assert, 1);
    // A lamp 8 tiles away from the substation is covered; one 11 tiles away is not.
    const lampNear = place(F, assert, 'small-lamp', sub.x + 9, sub.y + 1, 0);
    ticks(F, 2);
    assert(F.power.hasNetwork(lampNear), 'lamp within the 18×18 area is powered');
    // Coverage is x-8..x+9 around the 2×2 substation: a lamp at +11 is outside it.
    const lampFar = place(F, assert, 'small-lamp', sub.x + 11, sub.y + 1, 0);
    ticks(F, 2);
    assert(!F.power.hasNetwork(lampFar), 'lamp outside the 18×18 area is not covered');
    // Two big poles 25 tiles apart get wired.
    const b = findFlat(F, 28, 2);
    const p1 = place(F, assert, 'big-electric-pole', b.x, b.y, 0);
    const p2 = place(F, assert, 'big-electric-pole', b.x + 25, b.y, 0);
    assert(p2.wires.indexOf(p1.id) >= 0, 'big poles wire over 25 tiles');
  },

  pipe_to_ground_passes_under_other_pipes(F, assert) {
    fresh(F);
    const a = findFlat(F, 9, 5);
    const y = a.y + 2;
    // a north-south pipe line in the middle, a pipe-to-ground pair crossing under it
    for (let j = 0; j < 5; j++) place(F, assert, 'pipe', a.x + 4, a.y + j, 0);
    const inE = place(F, assert, 'pipe-to-ground', a.x + 2, y, 1);   // east: front faces east
    const outE = place(F, assert, 'pipe-to-ground', a.x + 6, y, 3);  // west: front faces west
    assert(inE.pairId === outE.id && outE.pairId === inE.id, 'pair forms under the crossing pipe');
    F.fluids.rebuild();
    const mid = F.api.entityAt(a.x + 4, y);
    assert(inE.fb._seg === outE.fb._seg && mid.fb._seg !== inE.fb._seg, 'the crossing pipe stays a separate segment');
    // another pipe-to-ground on the same axis in between ends the search
    fresh(F);
    const b = findFlat(F, 9, 3);
    const p1 = place(F, assert, 'pipe-to-ground', b.x, b.y + 1, 1);
    place(F, assert, 'pipe-to-ground', b.x + 3, b.y + 1, 1);
    const p3 = place(F, assert, 'pipe-to-ground', b.x + 6, b.y + 1, 3);
    assert(!p1.pairId && p3.pairId && p3.pairId !== p1.id, 'pairs with the nearest pipe-to-ground only');
  },

  research_queue_with_prerequisites(F, assert) {
    fresh(F);
    const target = 'automation-3';
    const chain = F.research.missingChain(target);
    assert(chain[chain.length - 1] === target && chain.length > 10, `chain of ${chain.length}`);
    assert(F.research.queueWithPrereqs(target), 'queued');
    const r = F.state.research;
    assert(r.current && F.data.techs[r.current].prereq.length === 0, `started a root tech (${r.current})`);
    assert(r.queue.length === chain.length - 1, `queue ${r.queue.length} of ${chain.length - 1}`);
    // Every queued tech comes after its own queued prerequisites.
    const pos = {}; [r.current].concat(r.queue).forEach((id, i) => { pos[id] = i; });
    for (const id of r.queue) for (const p of F.data.techs[id].prereq) if (pos[p] != null) assert(pos[p] < pos[id], `${p} before ${id}`);
    // Finish techs one by one: the queue advances through the whole chain.
    let guard = 0;
    while (r.current && guard++ < 100) {
      r.unitsDone = F.data.techs[r.current].cost.count;
      F.research.tick();
    }
    assert(F.research.isDone(target), 'target researched at the end of the chain');
    assert(r.queue.length === 0, 'queue drained');
    assert(!F.research.queueWithPrereqs(target), 'nothing to queue once done');
    // dequeue removes an entry.
    fresh(F);
    F.research.queueWithPrereqs('logistics-2');
    const q = F.state.research.queue.slice();
    assert(q.length > 0 && F.research.dequeue(q[0]) && F.state.research.queue.indexOf(q[0]) < 0, 'dequeue');
    return chain.length + ' techs in chain';
  },
};
