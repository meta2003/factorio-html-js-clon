// Scenario tests for src/05-data-expansion.js / src/06-i18n-expansion.js.
// Pure data checks: no world/tick state needed. See design/EXPANSION.md §2-§5.
'use strict';

// Ids EXPANSION.md §3 says must exist as items.
const EXPECTED_ITEM_IDS = [
  'plastic-bar', 'sulfur', 'solid-fuel', 'battery', 'engine-unit', 'electric-engine-unit',
  'advanced-circuit', 'processing-unit', 'flying-robot-frame', 'low-density-structure',
  'rocket-fuel', 'rocket-control-unit', 'satellite',
  'chemical-science-pack', 'production-science-pack', 'utility-science-pack', 'space-science-pack',
  'pumpjack', 'oil-refinery', 'chemical-plant', 'storage-tank', 'rail', 'train-stop',
  'locomotive', 'cargo-wagon', 'roboport', 'logistic-robot',
  'passive-provider-chest', 'storage-chest', 'requester-chest', 'rocket-silo',
];

// Ids EXPANSION.md §4 says must exist as recipes.
const EXPECTED_RECIPE_IDS = [
  'basic-oil-processing', 'advanced-oil-processing', 'heavy-oil-cracking', 'light-oil-cracking',
  'plastic-bar', 'sulfur', 'sulfuric-acid', 'lubricant',
  'solid-fuel-from-petroleum-gas', 'solid-fuel-from-light-oil',
  'battery', 'electric-engine-unit', 'processing-unit', 'rocket-fuel', 'engine-unit',
  'advanced-circuit', 'flying-robot-frame', 'low-density-structure', 'rocket-control-unit',
  'satellite', 'rocket-part', 'chemical-science-pack', 'production-science-pack', 'utility-science-pack',
  'pumpjack', 'oil-refinery', 'chemical-plant', 'storage-tank', 'rail', 'locomotive', 'cargo-wagon',
  'train-stop', 'roboport', 'logistic-robot', 'passive-provider-chest', 'storage-chest',
  'requester-chest', 'rocket-silo',
];

// Ids EXPANSION.md §5 says must exist as techs.
const EXPECTED_TECH_IDS = [
  'fluid-handling', 'oil-processing', 'plastics', 'sulfur-processing', 'advanced-electronics',
  'engine', 'chemical-science-pack', 'railway', 'automated-rail-transportation',
  'advanced-oil-processing', 'lubricant', 'electric-engine', 'battery', 'robotics',
  'logistic-robotics', 'advanced-electronics-2', 'low-density-structure', 'production-science-pack',
  'utility-science-pack', 'rocket-fuel', 'rocket-control-unit', 'rocket-silo',
];

const EXPECTED_FLUID_IDS = [
  'water', 'steam', 'crude-oil', 'heavy-oil', 'light-oil', 'petroleum-gas', 'lubricant', 'sulfuric-acid',
];

// Raw items that are never crafted by a recipe (hand-mined resources / fuels present from the start).
const RAW_ITEMS = new Set(['iron-ore', 'copper-ore', 'coal', 'stone', 'wood']);
// Fluids obtained directly from the world (pumpjack / offshore pump), not from a recipe's fluidResults.
const RAW_FLUIDS = new Set(['crude-oil', 'water']);

module.exports = {
  expansion_ids_exist(F, assert) {
    const D = F.data;
    for (const id of EXPECTED_ITEM_IDS) assert(D.items[id], `§3 item missing: ${id}`);
    for (const id of EXPECTED_RECIPE_IDS) assert(D.recipes[id], `§4 recipe missing: ${id}`);
    for (const id of EXPECTED_TECH_IDS) assert(D.techs[id], `§5 tech missing: ${id}`);
    for (const id of EXPECTED_FLUID_IDS) assert(D.fluids && D.fluids[id], `§2 fluid missing: ${id}`);
    assert(typeof D.fluidDef === 'function', 'F.data.fluidDef is a function');
    for (const id of EXPECTED_FLUID_IDS) assert(D.fluidDef(id) && D.fluidDef(id).id === id, `fluidDef(${id}) works`);
    assert(D.entities.lab && D.entities.lab.lab && D.entities.lab.lab.slots === 5, 'lab has 5 pack slots');
    return `${EXPECTED_ITEM_IDS.length} items, ${EXPECTED_RECIPE_IDS.length} recipes, ${EXPECTED_TECH_IDS.length} techs, ${EXPECTED_FLUID_IDS.length} fluids`;
  },

  expansion_vehicle_items_have_no_place(F, assert) {
    const D = F.data;
    assert(D.items.locomotive.vehicle === 'locomotive' && !D.items.locomotive.place, 'locomotive item: vehicle set, no place');
    assert(D.items['cargo-wagon'].vehicle === 'cargo-wagon' && !D.items['cargo-wagon'].place, 'cargo-wagon item: vehicle set, no place');
    assert(!D.entities.locomotive, 'no grid entity def for locomotive (placed virtually)');
    assert(!D.entities['cargo-wagon'], 'no grid entity def for cargo-wagon (placed virtually)');
  },

  expansion_recipes_hand_flag_matches_category(F, assert) {
    const D = F.data;
    for (const rid of EXPECTED_RECIPE_IDS) {
      const r = D.recipes[rid];
      assert(r.hand === (r.category === 'crafting'), `recipe ${rid}: hand flag matches category === 'crafting'`);
    }
    // Fluid-only recipes have an empty item results array and tab 'intermediate'.
    for (const rid of ['basic-oil-processing', 'advanced-oil-processing', 'heavy-oil-cracking', 'light-oil-cracking', 'sulfuric-acid', 'lubricant', 'rocket-part']) {
      const r = D.recipes[rid];
      assert(Array.isArray(r.results) && r.results.length === 0, `recipe ${rid}: empty item results`);
      assert(r.tab === 'intermediate', `recipe ${rid}: tab is 'intermediate' (got ${r.tab})`);
    }
  },

  expansion_tech_graph_acyclic_and_reachable(F, assert) {
    const D = F.data;
    const ids = Object.keys(D.techs);
    // Acyclic: DFS with a recursion-stack check over the WHOLE tech graph (base + expansion).
    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = new Map(ids.map((id) => [id, WHITE]));
    function visit(id, path) {
      color.set(id, GRAY);
      for (const p of D.techs[id].prereq) {
        assert(D.techs[p], `tech ${id}: prereq ${p} exists`);
        if (color.get(p) === GRAY) assert(false, `tech graph has a cycle: ${path.concat(p).join(' -> ')}`);
        if (color.get(p) === WHITE) visit(p, path.concat(p));
      }
      color.set(id, BLACK);
    }
    for (const id of ids) if (color.get(id) === WHITE) visit(id, [id]);

    // Reachable from roots: every tech's prereq chain bottoms out at a root (a tech with
    // no prereqs). The graph is already proven acyclic above (and every prereq checked to
    // exist), so plain recursion terminates; NOT using a "seen" set here on purpose — two
    // sibling branches legitimately sharing an ancestor (a diamond in the DAG, e.g. two
    // prereqs both eventually requiring steel-processing) is normal, not a re-visit bug.
    function reachesRoot(id) {
      const t = D.techs[id];
      if (t.prereq.length === 0) return true;
      return t.prereq.every(reachesRoot);
    }
    for (const id of EXPECTED_TECH_IDS) assert(reachesRoot(id), `tech ${id}: reaches a root tech (no prereq) through its prereq chain`);
  },

  expansion_every_ingredient_is_producible_or_raw(F, assert) {
    const D = F.data;
    const itemProducers = new Set(); // item ids produced by SOME recipe's results
    const fluidProducers = new Set(); // fluid ids produced by SOME recipe's fluidResults
    for (const rid of Object.keys(D.recipes)) {
      const r = D.recipes[rid];
      for (const [id] of r.results) itemProducers.add(id);
      for (const [id] of (r.fluidResults || [])) fluidProducers.add(id);
    }
    for (const rid of EXPECTED_RECIPE_IDS) {
      const r = D.recipes[rid];
      for (const [id] of r.ingredients) {
        assert(RAW_ITEMS.has(id) || itemProducers.has(id), `recipe ${rid}: ingredient ${id} is raw or produced by a recipe`);
      }
      for (const [id] of (r.fluidIngredients || [])) {
        assert(RAW_FLUIDS.has(id) || fluidProducers.has(id), `recipe ${rid}: fluid ingredient ${id} is raw (pumpjack/offshore pump) or produced by a recipe`);
      }
    }
  },

  expansion_entities_have_expected_fields(F, assert) {
    const D = F.data;
    const e = D.entities;
    assert(e.pumpjack.size[0] === 3 && e.pumpjack.size[1] === 3 && e.pumpjack.rotatable, 'pumpjack 3x3 rotatable');
    assert(e['oil-refinery'].size[0] === 5 && e['oil-refinery'].size[1] === 5, 'oil-refinery 5x5');
    assert(e['oil-refinery'].crafter && e['oil-refinery'].crafter.fluidIn === 2 && e['oil-refinery'].crafter.fluidOut === 3, 'oil-refinery crafter fluid ports');
    assert(e['chemical-plant'].size[0] === 3 && e['chemical-plant'].crafter && e['chemical-plant'].crafter.fluidIn === 2 && e['chemical-plant'].crafter.fluidOut === 2, 'chemical-plant 3x3 crafter fluid ports');
    assert(e['storage-tank'].rotatable, 'storage-tank rotatable');
    assert(e.rail.layer === 'floor' && e.rail.collides === false && !e.rail.rotatable, 'rail floor, no collide, not rotatable');
    assert(e['train-stop'].size[0] === 1 && e['train-stop'].size[1] === 1, 'train-stop 1x1');
    assert(e.roboport.size[0] === 4 && e.roboport.size[1] === 4, 'roboport 4x4');
    for (const id of ['passive-provider-chest', 'storage-chest', 'requester-chest']) {
      assert(e[id].behaviour === 'logistic-chest', `${id}: logistic-chest behaviour`);
      assert(e[id].chest && e[id].chest.slots === 48, `${id}: 48 slots`);
      assert(e[id].logistic && e[id].logistic.mode, `${id}: logistic.mode set`);
    }
    assert(e['passive-provider-chest'].logistic.mode === 'passive-provider', 'passive-provider-chest mode');
    assert(e['storage-chest'].logistic.mode === 'storage', 'storage-chest mode');
    assert(e['requester-chest'].logistic.mode === 'requester', 'requester-chest mode');
    assert(e['rocket-silo'].size[0] === 9 && e['rocket-silo'].size[1] === 9 && !e['rocket-silo'].rotatable, 'rocket-silo 9x9 not rotatable');
    assert(e['rocket-silo'].mineTime === 1, 'rocket-silo mineTime 1');
    assert(e['rocket-silo'].energy.usage === 1000 && e['rocket-silo'].energy.drain === 50, 'rocket-silo 1000kW/drain 50kW');
  },

  expansion_i18n_keys_present(F, assert) {
    const D = F.data;
    for (const id of EXPECTED_ITEM_IDS) assert(F.i18n.has('item.' + id), `i18n item.${id} present`);
    for (const id of ['pumpjack', 'oil-refinery', 'chemical-plant', 'storage-tank', 'rail', 'train-stop', 'roboport', 'passive-provider-chest', 'storage-chest', 'requester-chest', 'rocket-silo']) {
      assert(F.i18n.has('ent.' + id), `i18n ent.${id} present`);
    }
    for (const id of EXPECTED_TECH_IDS) assert(F.i18n.has('tech.' + id), `i18n tech.${id} present`);
    for (const id of EXPECTED_FLUID_IDS) assert(F.i18n.has('fluid.' + id), `i18n fluid.${id} present`);
    for (const id of ['basic-oil-processing', 'advanced-oil-processing', 'heavy-oil-cracking', 'light-oil-cracking', 'sulfuric-acid', 'lubricant', 'solid-fuel-from-petroleum-gas', 'solid-fuel-from-light-oil', 'rocket-part']) {
      assert(F.i18n.has('recipe.' + id), `i18n recipe.${id} present (id has no matching/empty item result)`);
    }
    for (const id of ['oil', 'trains', 'robots', 'rocket']) assert(F.i18n.has('help.' + id), `i18n help.${id} present`);
    assert(F.i18n.has('status.no_oil'), 'i18n status.no_oil present');
    assert(F.i18n.has('reason.no_rail') && F.i18n.has('reason.no_resource'), 'i18n reason.no_rail / reason.no_resource present');
  },
};
