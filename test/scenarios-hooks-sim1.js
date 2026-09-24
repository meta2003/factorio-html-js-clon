// Scenario tests for the Phase A core hook APIs (design/EXPANSION.md §6.1-6.3), owned by the
// A-sim agent (80-game.js, 33-power.js, 32-machines.js). See test/scenarios.js for the runner
// contract; helpers below are copied from there (not exported by that file).
'use strict';

function ticks(F, n) { for (let i = 0; i < n; i++) F.tick(); }
function fresh(F, seed) { F.newGame({ seed: seed || 42 }); return F.state; }
function spawn(F) { const s = F.world.spawn; return { x: Math.round(s.x), y: Math.round(s.y) }; }

// A synthetic 1x1 fluid entity registered via F.fluids.registerEntity (EXPANSION.md §6.2),
// standing in for a not-yet-written feature entity (e.g. the oil pack's storage-tank/refinery).
// Its single box ('fb') has one 'any' port facing north (dir 0), like a pipe's own north port,
// so a plain pipe placed just north of it will connect to it.
const TEST_TANK_TYPE = 'hooks-sim1-tank';
let tankRegistered = false;
function ensureTestTank(F) {
  if (!F.data.entities[TEST_TANK_TYPE]) {
    F.data.entities[TEST_TANK_TYPE] = {
      id: TEST_TANK_TYPE, size: [1, 1], rotatable: false, health: 10,
      behaviour: TEST_TANK_TYPE, category: 'production', collides: true, layer: 'object',
    };
  }
  if (!tankRegistered) {
    F.fluids.registerEntity(TEST_TANK_TYPE, {
      boxes(e) { return [['fb', e.fb]]; },
      ports(e, def) { return [{ x: e.x, y: e.y, dir: 0, kind: 'any', boxKey: 'fb' }]; },
    });
    F.behaviours[TEST_TANK_TYPE] = {
      create(e) { e.fb = { fluid: null, amount: 0, cap: 1000 }; F.fluids.markDirty(); },
      onRemove() { F.fluids.markDirty(); },
      status() { return 'working'; },
    };
    tankRegistered = true;
  }
}

// A synthetic assembler-behaviour entity with a custom def.assembler.categories, to test that
// F.machines.setRecipe / recipesFor respect a non-default category list (§6.3).
const TEST_ASSEMBLER_TYPE = 'hooks-sim1-assembler';
function ensureTestAssembler(F) {
  if (!F.data.entities[TEST_ASSEMBLER_TYPE]) {
    F.data.entities[TEST_ASSEMBLER_TYPE] = {
      id: TEST_ASSEMBLER_TYPE, size: [3, 3], rotatable: false, health: 300,
      behaviour: 'assembler', category: 'production', energy: { type: 'none', usage: 0, drain: 0 },
      speed: 1, assembler: { speed: 1, ingredientSlots: 6, categories: ['hooks-sim1-category'] },
    };
  }
}

// Synthetic lab defs: one with def.lab.slots=5 (EXPANSION.md §1: "labs get 5 pack slots"), one
// with no `slots` field at all, to check the pre-expansion default independently of whatever
// slot count 05-data-expansion.js gives the real 'lab' entity (owned by the data agent, not us).
const TEST_LAB5_TYPE = 'hooks-sim1-lab5';
const TEST_LAB_DEFAULT_TYPE = 'hooks-sim1-lab-default';
function ensureTestLabs(F) {
  if (!F.data.entities[TEST_LAB5_TYPE]) {
    F.data.entities[TEST_LAB5_TYPE] = {
      id: TEST_LAB5_TYPE, size: [3, 3], rotatable: false, health: 150,
      behaviour: 'lab', category: 'production', energy: { type: 'electric', usage: 60, drain: 2 },
      lab: { speed: 1, slots: 5 },
    };
  }
  if (!F.data.entities[TEST_LAB_DEFAULT_TYPE]) {
    F.data.entities[TEST_LAB_DEFAULT_TYPE] = {
      id: TEST_LAB_DEFAULT_TYPE, size: [3, 3], rotatable: false, health: 150,
      behaviour: 'lab', category: 'production', energy: { type: 'electric', usage: 60, drain: 2 },
      lab: { speed: 1 }, // no `slots` -> must default to 2
    };
  }
}

module.exports = {
  // §6.1 F.game.addTickPhase(name, after, fn): registers a phase that runs right after a named
  // built-in phase, every tick, wrapped in the same error-isolating runTickPhase as the built-ins.
  hooks_tick_phase_runs(F, assert) {
    fresh(F);
    let count = 0;
    let sawStateExists = false;
    F.game.addTickPhase('hooks-sim1-counter', 'fluids', function () {
      count++;
      sawStateExists = !!F.state; // hook fires inside a live tick, F.state must be set up
    });
    const before = count;
    F.tick();
    F.tick();
    F.tick();
    assert(count === before + 3, `registered tick phase ran once per tick (count=${count})`);
    assert(sawStateExists, 'registered tick phase saw a live F.state');

    // error isolation: a throwing hook must not prevent the rest of the tick (or other hooks)
    // from running, and must not throw out of F.tick() itself. Throws only once (registrations
    // are permanent for the rest of this shared headless process, across every other scenario
    // file's own F.newGame calls) so it doesn't spam console.error forever after this scenario.
    let thrown = false, afterThrow = 0;
    F.game.addTickPhase('hooks-sim1-thrower', 'fluids', function () { if (!thrown) { thrown = true; throw new Error('boom'); } });
    F.game.addTickPhase('hooks-sim1-after-thrower', 'fluids', function () { afterThrow++; });
    let threw = false;
    try { F.tick(); } catch (err) { threw = true; }
    assert(!threw, 'a throwing registered phase does not escape F.tick()');
    assert(afterThrow === 1, 'a later registered phase still ran after an earlier one threw');
    return 'ticks=' + count;
  },

  // §6.1 F.game.onNewGame(fn) / F.game.onRebuild(fn): onNewGame runs once per F.newGame (state
  // built, before rebuildAll); onRebuild runs at the end of every rebuildAll (newGame AND load).
  hooks_new_game_and_rebuild_hooks(F, assert) {
    let newGameCalls = 0, rebuildCalls = 0, sawEntitiesArrayOnNewGame = false;
    F.game.onNewGame(function () {
      newGameCalls++;
      sawEntitiesArrayOnNewGame = Array.isArray(F.state && F.state.entities);
    });
    F.game.onRebuild(function () { rebuildCalls++; });

    fresh(F, 7);
    assert(newGameCalls === 1, `onNewGame ran once per F.newGame (calls=${newGameCalls})`);
    assert(sawEntitiesArrayOnNewGame, 'onNewGame saw F.state already built (entities array present)');
    const afterNewGame = rebuildCalls;
    assert(afterNewGame >= 1, `onRebuild ran during F.newGame's rebuildAll (calls=${afterNewGame})`);

    const s = F.save();
    assert(s, 'save produced a payload');
    F.load(s);
    assert(rebuildCalls === afterNewGame + 1, `onRebuild ran again on F.load (calls=${rebuildCalls})`);
    assert(newGameCalls === 1, 'onNewGame does NOT run again on F.load');
    return 'newGame=' + newGameCalls + ' rebuild=' + rebuildCalls;
  },

  // §6.2 F.fluids.registerEntity: a registered entity's box takes part in segment building
  // exactly like a boiler/pipe box — here a fluid id the base game never had (crude-oil).
  hooks_registered_fluid_entity_joins_segment(F, assert) {
    fresh(F);
    ensureTestTank(F);
    const sp = spawn(F);
    const tx = sp.x + 60, ty = sp.y + 60; // well clear of spawn patches/lake

    const tank = F.entities.create(TEST_TANK_TYPE, tx, ty, 0);
    assert(tank, 'test tank created');
    const pipe = F.entities.create('pipe', tx, ty - 1, 0); // north of the tank, facing its port
    assert(pipe, 'pipe created north of the tank');

    F.fluids.push(tank.fb, 'crude-oil', 40);
    F.fluids.markDirty();

    const segTank = F.fluids.segmentInfo(tank);
    const segPipe = F.fluids.segmentInfo(pipe);
    assert(segTank && segTank.fluid === 'crude-oil', `tank segment carries crude-oil (${JSON.stringify(segTank)})`);
    assert(segPipe && segPipe.fluid === 'crude-oil', `pipe joined the tank's crude-oil segment (${JSON.stringify(segPipe)})`);
    assert(segPipe.amount > 0, 'crude-oil amount flowed into the joined pipe');
    assert(F.fluids.fluidOf(pipe) === 'crude-oil', `F.fluids.fluidOf(pipe) reports crude-oil (${F.fluids.fluidOf(pipe)})`);
    assert(F.fluids.fluidOf(tank) === 'crude-oil', 'F.fluids.fluidOf(tank) (registered entity, first box) reports crude-oil');

    // extending the SAME fluid must be allowed
    assert(F.fluids.canConnect('pipe', tx, ty - 2, 0) === true, 'extending a crude-oil pipe with another crude-oil pipe is allowed');
    return 'segment fluid=' + segPipe.fluid + ' amount=' + segPipe.amount.toFixed(1);
  },

  // §6.2 generalised mixing guard: two different fluids (one carried by a registered entity,
  // one by a plain pipe) must never be connectable, exactly like water/steam pre-expansion.
  hooks_mixing_guard_blocks_different_fluids(F, assert) {
    fresh(F);
    ensureTestTank(F);
    const sp = spawn(F);
    const tx = sp.x + 60, ty = sp.y + 70; // separate area from the previous scenario

    const tank = F.entities.create(TEST_TANK_TYPE, tx, ty, 0);
    const pipeC = F.entities.create('pipe', tx, ty - 1, 0); // crude-oil pipe (via the tank)
    F.fluids.push(tank.fb, 'crude-oil', 30);

    const pipeW = F.entities.create('pipe', tx, ty - 3, 0); // water pipe, two tiles further north
    F.fluids.push(pipeW.fb, 'water', 30);
    F.fluids.markDirty();

    // sanity: the two pre-existing segments really do differ before we probe the bridge tile
    const before = F.fluids.canConnect; // (not used, just documents intent)
    const segC = F.fluids.segmentInfo(pipeC), segW = F.fluids.segmentInfo(pipeW);
    assert(segC.fluid === 'crude-oil' && segW.fluid === 'water', `distinct segments before bridging (${JSON.stringify(segC)} / ${JSON.stringify(segW)})`);

    // the bridge tile (tx, ty-2) is adjacent to pipeC (south) AND pipeW (north): a plain pipe
    // placed there would connect both fluids at once and must be refused.
    const ok = F.fluids.canConnect('pipe', tx, ty - 2, 0);
    assert(ok === false, 'canConnect refuses a pipe that would bridge crude-oil and water');
    return 'canConnect(bridge)=' + ok;
  },

  // §6.3 lab slots: def.lab.slots (default 2, and a def-driven 5 for the expansion's labs);
  // an older save's smaller packs inventory grows to the def size on wake().
  hooks_lab_slots_from_def(F, assert) {
    fresh(F);
    ensureTestLabs(F);
    const sp = spawn(F);
    const lab = F.entities.create(TEST_LAB5_TYPE, sp.x + 60, sp.y + 80, 0);
    assert(Array.isArray(lab.packs) && lab.packs.length === 5, `def.lab.slots=5 -> 5 pack slots (got ${lab.packs && lab.packs.length})`);

    // no def.lab.slots at all -> the pre-expansion default of 2 slots.
    const plainLab = F.entities.create(TEST_LAB_DEFAULT_TYPE, sp.x + 66, sp.y + 80, 0);
    assert(Array.isArray(plainLab.packs) && plainLab.packs.length === 2, `no lab.slots -> default 2 slots (got ${plainLab.packs && plainLab.packs.length})`);

    // simulate an older save: shrink a 5-slot lab's packs back to 2, then wake() it.
    lab.packs = [null, null];
    F.behaviours.lab.wake(lab);
    assert(lab.packs.length === 5, `wake() grew an old 2-slot pack inventory to the def size (got ${lab.packs.length})`);
    return 'slots=' + lab.packs.length;
  },

  // §6.3 assembler recipe category filter + F.machines.recipesFor.
  hooks_assembler_category_filter(F, assert) {
    fresh(F);
    ensureTestAssembler(F);

    // register one throwaway recipe in the custom category so recipesFor has something to find;
    // real category data (oil-processing/chemistry/...) is owned by 05-data-expansion.js.
    if (!F.data.recipes['hooks-sim1-recipe']) {
      F.data.recipes['hooks-sim1-recipe'] = {
        id: 'hooks-sim1-recipe', ingredients: [['iron-plate', 1]], results: [['iron-gear-wheel', 1]],
        time: 0.5, category: 'hooks-sim1-category', hand: false, tab: 'intermediate', unlockedBy: null,
      };
    }

    const sp = spawn(F);
    const std = F.entities.create('assembling-machine-1', sp.x + 60, sp.y + 90, 0);
    const custom = F.entities.create(TEST_ASSEMBLER_TYPE, sp.x + 66, sp.y + 90, 0);

    // default categories ['crafting','advanced']: a 'smelting' recipe must be refused...
    assert(F.machines.setRecipe(std, 'iron-plate') === false, 'default assembler refuses a smelting-category recipe');
    assert(std.recipe == null, 'refused setRecipe left the assembler recipe-less');
    // ...but a 'crafting' recipe is fine.
    assert(F.machines.setRecipe(std, 'iron-gear-wheel') === true, 'default assembler accepts a crafting-category recipe');
    assert(F.machines.recipesFor(std).indexOf('iron-gear-wheel') !== -1, 'recipesFor(std) includes the crafting recipe');
    assert(F.machines.recipesFor(std).indexOf('hooks-sim1-recipe') === -1, 'recipesFor(std) excludes the custom-category recipe');

    // a custom-category assembler accepts recipes in ITS category and rejects plain 'crafting'... wait,
    // 'crafting' is not in its categories list either, so a crafting recipe must also be refused here.
    assert(F.machines.setRecipe(custom, 'iron-gear-wheel') === false, 'custom-category assembler refuses a crafting recipe not in its categories');
    assert(F.machines.setRecipe(custom, 'hooks-sim1-recipe') === true, 'custom-category assembler accepts its own category');
    assert(F.machines.recipesFor(custom).indexOf('hooks-sim1-recipe') !== -1, 'recipesFor(custom) includes its own category recipe');
    assert(F.machines.recipesFor(custom).indexOf('iron-gear-wheel') === -1, 'recipesFor(custom) excludes a recipe outside its categories');

    return 'std.recipe=' + std.recipe + ' custom.recipe=' + custom.recipe;
  },
};
