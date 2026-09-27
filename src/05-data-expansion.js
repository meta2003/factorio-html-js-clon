// 05-data-expansion.js — expansion data: fluids, items, recipes, entity definitions and
// technologies for oil processing, trains, logistic robots and the rocket silo.
// See design/EXPANSION.md (single source of truth) §2-§5 and §7 (entity defs).
// DATA ONLY: no i18n strings (06-i18n-expansion.js owns all item.*/ent.*/tech.*/fluid.* text),
// no DOM/canvas access, no F.rng usage. Loads after 01-data.js (file sort order), so
// F.data already exists here; we extend the same items/recipes/entities/techs objects and
// order arrays in place (extend() in 01-data.js only understands the old row shapes and does
// not know about fluids, so this file writes directly into F.data.* and runs its own
// self-check instead of using F.data.extend()).
(function () {
  'use strict';

  var D = F.data;

  // ---------------------------------------------------------------------
  // 1. FLUIDS (EXPANSION.md §2)
  // ---------------------------------------------------------------------
  var FLUID_ROWS = [
    ['water', '#3F7FD9', '#7FB2F0'],
    ['steam', '#D8D8D8', '#FFFFFF'],
    ['crude-oil', '#2B2522', '#5A4636'],
    ['heavy-oil', '#A5501F', '#D07A3A'],
    ['light-oil', '#E0A92E', '#F4D06A'],
    ['petroleum-gas', '#8C5BA8', '#C39AD8'],
    ['lubricant', '#3E8E4E', '#7CC48A'],
    ['sulfuric-acid', '#CFCF2F', '#F0F07A'],
  ];
  var fluids = {};
  FLUID_ROWS.forEach(function (row) {
    fluids[row[0]] = { id: row[0], color: row[1], color2: row[2] };
  });
  D.fluids = fluids;
  D.fluidDef = function (id) {
    var f = fluids[id];
    if (!f) throw new Error('unknown fluid id: ' + id);
    return f;
  };

  // ---------------------------------------------------------------------
  // 2. ITEMS (EXPANSION.md §3)
  // ---------------------------------------------------------------------
  // Row shape mirrors ITEM_ROWS in 01-data.js: [id, stack, fuelMJ, category, place|null,
  // iconShape, color, color2|null, vehicle|null].
  var ITEM_ROWS = [
    ['plastic-bar', 100, 0, 'intermediate', null, 'plastic', '#E8E8E8', '#B8B8B8', null],
    ['sulfur', 50, 0, 'intermediate', null, 'powder', '#E6D335', '#B8A520', null],
    ['solid-fuel', 50, 12, 'intermediate', null, 'fuel-block', '#6E6A5E', '#3A3830', null],
    ['battery', 200, 0, 'intermediate', null, 'battery-cell', '#B8B8B8', '#C44A2A', null],
    ['engine-unit', 50, 0, 'intermediate', null, 'engine', '#8A8F94', '#5A5F64', null],
    ['electric-engine-unit', 50, 0, 'intermediate', null, 'engine', '#4E7FB0', '#2F4F70', null],
    ['advanced-circuit', 200, 0, 'intermediate', null, 'pcb', '#B03030', '#E0B040', null],
    ['processing-unit', 100, 0, 'intermediate', null, 'pcb', '#2F55B0', '#E0B040', null],
    ['flying-robot-frame', 50, 0, 'intermediate', null, 'robot-frame', '#9AA3AA', '#D9A520', null],
    ['low-density-structure', 50, 0, 'intermediate', null, 'lds', '#C98A3A', '#8A8F94', null],
    ['rocket-fuel', 10, 100, 'intermediate', null, 'fuel-cell', '#D9422B', '#F0A020', null],
    ['rocket-control-unit', 10, 0, 'intermediate', null, 'pcb', '#3FA35A', '#E0D040', null],
    ['satellite', 1, 0, 'intermediate', null, 'satellite', '#C8CCD0', '#2B4C7E', null],
    ['chemical-science-pack', 200, 0, 'science', null, 'flask', '#3A8FD9', null, null],
    ['production-science-pack', 200, 0, 'science', null, 'flask', '#9B4FD1', null, null],
    ['utility-science-pack', 200, 0, 'science', null, 'flask', '#E8C832', null, null],
    ['space-science-pack', 2000, 0, 'science', null, 'flask', '#F2F2F2', null, null],
    ['pumpjack', 20, 0, 'production', 'pumpjack', 'pump', '#6E767C', null, null],
    ['oil-refinery', 10, 0, 'production', 'oil-refinery', 'machine', '#7A8590', null, null],
    ['chemical-plant', 10, 0, 'production', 'chemical-plant', 'machine', '#6E8C6E', null, null],
    ['storage-tank', 50, 0, 'logistics', 'storage-tank', 'tube', '#8A8F94', null, null],
    ['rail', 100, 0, 'logistics', 'rail', 'rods', '#8A8F94', '#6B4A2A', null],
    ['train-stop', 10, 0, 'logistics', 'train-stop', 'pole', '#C9A227', null, null],
    ['rail-signal', 50, 0, 'logistics', 'rail-signal', 'rail-signal', '#3A3D40', '#3FC35A', null],
    ['rail-chain-signal', 50, 0, 'logistics', 'rail-chain-signal', 'rail-signal', '#3A3D40', '#4A9FE0', null],
    ['locomotive', 5, 0, 'logistics', null, 'locomotive', '#C24A2A', '#3A3D40', 'locomotive'],
    ['cargo-wagon', 5, 0, 'logistics', null, 'wagon', '#8A8F94', '#5A4636', 'cargo-wagon'],
    ['roboport', 10, 0, 'logistics', 'roboport', 'dish', '#8A8F94', '#D9A520', null],
    ['logistic-robot', 50, 0, 'logistics', null, 'robot', '#D9C040', '#8A8F94', null],
    ['construction-robot', 50, 0, 'logistics', null, 'robot', '#E07A2A', '#8A8F94', null],
    ['passive-provider-chest', 50, 0, 'logistics', 'passive-provider-chest', 'box', '#C43A3A', null, null],
    ['storage-chest', 50, 0, 'logistics', 'storage-chest', 'box', '#D9B830', null, null],
    ['requester-chest', 50, 0, 'logistics', 'requester-chest', 'box', '#3A7FD9', null, null],
    ['rocket-silo', 1, 0, 'production', 'rocket-silo', 'machine', '#8A8F94', null, null],
  ];

  ITEM_ROWS.forEach(function (row) {
    var id = row[0];
    var def = {
      id: id,
      stack: row[1],
      fuel: row[2],
      category: row[3],
      place: row[4] || undefined,
      icon: { shape: row[5], color: row[6], color2: row[7] || null },
    };
    if (row[8]) def.vehicle = row[8];
    D.items[id] = def;
    D.order.items.push(id);
  });

  // ---------------------------------------------------------------------
  // 3. RECIPES (EXPANSION.md §4)
  // ---------------------------------------------------------------------
  // Row: [id, ingredients[[id,n]...], results[[id,n]...], time, category, unlockedBy,
  //       fluidIngredients[[fluidId,n]...], fluidResults[[fluidId,n]...]]
  var RECIPE_ROWS = [
    ['basic-oil-processing', [], [], 5, 'oil-processing', 'oil-processing',
      [['crude-oil', 100]], [['petroleum-gas', 45]]],
    ['advanced-oil-processing', [], [], 5, 'oil-processing', 'advanced-oil-processing',
      [['crude-oil', 100], ['water', 50]], [['heavy-oil', 25], ['light-oil', 45], ['petroleum-gas', 55]]],
    ['heavy-oil-cracking', [], [], 2, 'chemistry', 'advanced-oil-processing',
      [['heavy-oil', 40], ['water', 30]], [['light-oil', 30]]],
    ['light-oil-cracking', [], [], 2, 'chemistry', 'advanced-oil-processing',
      [['light-oil', 30], ['water', 30]], [['petroleum-gas', 20]]],
    ['plastic-bar', [['coal', 1]], [['plastic-bar', 2]], 1, 'chemistry', 'plastics',
      [['petroleum-gas', 20]], []],
    ['sulfur', [], [['sulfur', 2]], 1, 'chemistry', 'sulfur-processing',
      [['water', 30], ['petroleum-gas', 30]], []],
    ['sulfuric-acid', [['sulfur', 5], ['iron-plate', 1]], [], 1, 'chemistry', 'sulfur-processing',
      [['water', 100]], [['sulfuric-acid', 50]]],
    ['lubricant', [], [], 1, 'chemistry', 'lubricant',
      [['heavy-oil', 10]], [['lubricant', 10]]],
    ['solid-fuel-from-petroleum-gas', [], [['solid-fuel', 1]], 2, 'chemistry', 'oil-processing',
      [['petroleum-gas', 20]], []],
    ['solid-fuel-from-light-oil', [], [['solid-fuel', 1]], 2, 'chemistry', 'advanced-oil-processing',
      [['light-oil', 10]], []],
    ['battery', [['iron-plate', 1], ['copper-plate', 1]], [['battery', 1]], 4, 'chemistry', 'battery',
      [['sulfuric-acid', 20]], []],
    ['electric-engine-unit', [['engine-unit', 1], ['electronic-circuit', 2]], [['electric-engine-unit', 1]], 10, 'chemistry', 'electric-engine',
      [['lubricant', 15]], []],
    ['processing-unit', [['electronic-circuit', 20], ['advanced-circuit', 2]], [['processing-unit', 1]], 10, 'chemistry', 'advanced-electronics-2',
      [['sulfuric-acid', 5]], []],
    ['rocket-fuel', [['solid-fuel', 10]], [['rocket-fuel', 1]], 30, 'chemistry', 'rocket-fuel',
      [['light-oil', 10]], []],
    ['engine-unit', [['steel-plate', 1], ['iron-gear-wheel', 1], ['pipe', 2]], [['engine-unit', 1]], 10, 'advanced', 'engine', [], []],
    ['advanced-circuit', [['plastic-bar', 2], ['copper-cable', 4], ['electronic-circuit', 2]], [['advanced-circuit', 1]], 6, 'crafting', 'advanced-electronics', [], []],
    ['flying-robot-frame', [['electric-engine-unit', 1], ['battery', 2], ['steel-plate', 1], ['electronic-circuit', 3]], [['flying-robot-frame', 1]], 20, 'crafting', 'robotics', [], []],
    ['low-density-structure', [['copper-plate', 20], ['steel-plate', 2], ['plastic-bar', 5]], [['low-density-structure', 1]], 20, 'crafting', 'low-density-structure', [], []],
    ['rocket-control-unit', [['processing-unit', 1], ['battery', 1]], [['rocket-control-unit', 1]], 30, 'crafting', 'rocket-control-unit', [], []],
    ['satellite', [['low-density-structure', 20], ['solar-panel', 10], ['accumulator', 10], ['radar', 5], ['processing-unit', 20], ['rocket-fuel', 20]], [['satellite', 1]], 5, 'crafting', 'rocket-silo', [], []],
    ['rocket-part', [['low-density-structure', 10], ['rocket-fuel', 10], ['rocket-control-unit', 10]], [], 3, 'rocket-building', 'rocket-silo', [], []],
    ['chemical-science-pack', [['engine-unit', 2], ['advanced-circuit', 3], ['sulfur', 1]], [['chemical-science-pack', 2]], 24, 'crafting', 'chemical-science-pack', [], []],
    ['production-science-pack', [['rail', 10], ['steel-furnace', 1], ['advanced-circuit', 2]], [['production-science-pack', 3]], 21, 'crafting', 'production-science-pack', [], []],
    ['utility-science-pack', [['flying-robot-frame', 2], ['low-density-structure', 3], ['processing-unit', 2]], [['utility-science-pack', 3]], 21, 'crafting', 'utility-science-pack', [], []],
    ['pumpjack', [['steel-plate', 5], ['iron-gear-wheel', 10], ['electronic-circuit', 5], ['pipe', 10]], [['pumpjack', 1]], 5, 'crafting', 'oil-processing', [], []],
    ['oil-refinery', [['steel-plate', 15], ['iron-gear-wheel', 10], ['stone-brick', 10], ['electronic-circuit', 10], ['pipe', 10]], [['oil-refinery', 1]], 8, 'crafting', 'oil-processing', [], []],
    ['chemical-plant', [['steel-plate', 5], ['iron-gear-wheel', 5], ['electronic-circuit', 5], ['pipe', 5]], [['chemical-plant', 1]], 5, 'crafting', 'oil-processing', [], []],
    ['storage-tank', [['iron-plate', 20], ['steel-plate', 5]], [['storage-tank', 1]], 3, 'crafting', 'fluid-handling', [], []],
    ['rail', [['stone', 1], ['iron-stick', 1], ['steel-plate', 1]], [['rail', 2]], 0.5, 'crafting', 'railway', [], []],
    ['locomotive', [['engine-unit', 20], ['electronic-circuit', 10], ['steel-plate', 30]], [['locomotive', 1]], 4, 'crafting', 'railway', [], []],
    ['cargo-wagon', [['iron-gear-wheel', 10], ['iron-plate', 20], ['steel-plate', 20]], [['cargo-wagon', 1]], 1, 'crafting', 'railway', [], []],
    ['train-stop', [['electronic-circuit', 5], ['iron-plate', 6], ['iron-stick', 6], ['steel-plate', 3]], [['train-stop', 1]], 0.5, 'crafting', 'automated-rail-transportation', [], []],
    ['rail-signal', [['electronic-circuit', 1], ['iron-plate', 5]], [['rail-signal', 1]], 0.5, 'crafting', 'rail-signals', [], []],
    ['rail-chain-signal', [['electronic-circuit', 1], ['iron-plate', 5]], [['rail-chain-signal', 1]], 0.5, 'crafting', 'rail-signals', [], []],
    ['roboport', [['steel-plate', 45], ['iron-gear-wheel', 45], ['advanced-circuit', 45]], [['roboport', 1]], 5, 'crafting', 'construction-robotics', [], []],
    ['construction-robot', [['flying-robot-frame', 1], ['electronic-circuit', 2]], [['construction-robot', 1]], 0.5, 'crafting', 'construction-robotics', [], []],
    ['logistic-robot', [['flying-robot-frame', 1], ['advanced-circuit', 2]], [['logistic-robot', 1]], 0.5, 'crafting', 'logistic-robotics', [], []],
    ['passive-provider-chest', [['steel-chest', 1], ['electronic-circuit', 3], ['advanced-circuit', 1]], [['passive-provider-chest', 1]], 0.5, 'crafting', 'logistic-robotics', [], []],
    ['storage-chest', [['steel-chest', 1], ['electronic-circuit', 3], ['advanced-circuit', 1]], [['storage-chest', 1]], 0.5, 'crafting', 'logistic-robotics', [], []],
    ['requester-chest', [['steel-chest', 1], ['electronic-circuit', 3], ['advanced-circuit', 1]], [['requester-chest', 1]], 0.5, 'crafting', 'logistic-robotics', [], []],
    ['rocket-silo', [['steel-plate', 100], ['electric-engine-unit', 20], ['processing-unit', 20], ['pipe', 50], ['stone-brick', 100]], [['rocket-silo', 1]], 30, 'crafting', 'rocket-silo', [], []],
  ];

  // Mirrors 01-data.js's tabForCategory: crafting-menu tab follows the RESULT item's
  // top-level category; recipes with no item results (fluid-only) fall into 'intermediate'.
  function tabForCategory(cat) {
    switch (cat) {
      case 'logistics': return 'logistics';
      case 'production': return 'production';
      case 'combat': return 'combat';
      case 'intermediate':
      case 'science':
      case 'resource':
      default: return 'intermediate';
    }
  }

  RECIPE_ROWS.forEach(function (row) {
    var id = row[0], ingredients = row[1], results = row[2], time = row[3], category = row[4],
      unlockedBy = row[5], fluidIngredients = row[6], fluidResults = row[7];
    var resultItem = results.length ? D.items[results[0][0]] : null;
    var tab = resultItem ? tabForCategory(resultItem.category) : 'intermediate';
    D.recipes[id] = {
      id: id,
      ingredients: ingredients,
      results: results,
      time: time,
      category: category,
      hand: category === 'crafting',
      tab: tab,
      unlockedBy: unlockedBy,
      fluidIngredients: fluidIngredients,
      fluidResults: fluidResults,
    };
    if (!D.order.recipesByTab[tab]) D.order.recipesByTab[tab] = [];
    D.order.recipesByTab[tab].push(id);
  });

  // ---------------------------------------------------------------------
  // 4. ENTITIES (EXPANSION.md §7) — reimplements 01-data.js's baseEntity() defaults
  // locally since that helper is private to 01-data.js's closure.
  // ---------------------------------------------------------------------
  function baseEntity(o) {
    return Object.assign({
      rotatable: false,
      natural: false,
      collides: true,
      layer: 'object',
      pollution: 0,
      energy: { type: 'none', usage: 0, drain: 0 },
      mineTime: 0.2,
    }, o);
  }

  // -- Oil (§7.1) ---------------------------------------------------------
  D.entities['pumpjack'] = baseEntity({
    id: 'pumpjack', size: [3, 3], rotatable: true, health: 300, behaviour: 'pumpjack',
    minable: 'pumpjack', category: 'production', pollution: 10, mineTime: 0.3,
    energy: { type: 'electric', usage: 90, drain: 3 },
  });
  D.entities['oil-refinery'] = baseEntity({
    id: 'oil-refinery', size: [5, 5], rotatable: true, health: 500, behaviour: 'crafter',
    minable: 'oil-refinery', category: 'production', pollution: 6, mineTime: 0.4,
    energy: { type: 'electric', usage: 420, drain: 14 },
    crafter: { categories: ['oil-processing'], speed: 1, fluidIn: 2, fluidOut: 3 },
  });
  D.entities['chemical-plant'] = baseEntity({
    id: 'chemical-plant', size: [3, 3], rotatable: true, health: 350, behaviour: 'crafter',
    minable: 'chemical-plant', category: 'production', pollution: 4, mineTime: 0.3,
    energy: { type: 'electric', usage: 210, drain: 7 },
    crafter: { categories: ['chemistry'], speed: 1, fluidIn: 2, fluidOut: 2 },
  });
  D.entities['storage-tank'] = baseEntity({
    id: 'storage-tank', size: [3, 3], rotatable: true, health: 300, behaviour: 'storage-tank',
    minable: 'storage-tank', category: 'logistics', mineTime: 0.3,
  });

  // -- Trains (§7.2) --------------------------------------------------------
  // rail: floor layer, no collision, not rotatable (connectivity is purely 4-neighbour).
  D.entities['rail'] = baseEntity({
    id: 'rail', size: [1, 1], rotatable: false, collides: false, layer: 'floor', health: 60,
    behaviour: 'rail', minable: 'rail', category: 'logistics', mineTime: 0.1,
  });
  // train-stop: local guarded decision — EXPANSION.md §7.2 does not state rotatable
  // explicitly, but a stop's facing direction determines which side trains approach
  // from (used elsewhere in the spec's "R rotates" convention), so this is rotatable.
  D.entities['train-stop'] = baseEntity({
    id: 'train-stop', size: [1, 1], rotatable: true, health: 150, behaviour: 'train-stop',
    minable: 'train-stop', category: 'logistics', mineTime: 0.2,
  });
  // rail-signal / rail-chain-signal: 1x1 next to a rail, like the train stop; the facing
  // direction picks which neighbouring rail tile it guards (38-trains.js "Rail signals").
  D.entities['rail-signal'] = baseEntity({
    id: 'rail-signal', size: [1, 1], rotatable: true, health: 100, behaviour: 'rail-signal',
    minable: 'rail-signal', category: 'logistics', mineTime: 0.1, signal: { chain: false },
  });
  D.entities['rail-chain-signal'] = baseEntity({
    id: 'rail-chain-signal', size: [1, 1], rotatable: true, health: 100, behaviour: 'rail-signal',
    minable: 'rail-chain-signal', category: 'logistics', mineTime: 0.1, signal: { chain: true },
  });
  // locomotive/cargo-wagon are NOT grid entities (placed via F.api.registerVirtual per
  // §6.4); they have items (with `vehicle`) but intentionally no F.data.entities def.

  // -- Robots (§7.3) ---------------------------------------------------------
  D.entities['roboport'] = baseEntity({
    id: 'roboport', size: [4, 4], rotatable: false, health: 400, behaviour: 'roboport',
    minable: 'roboport', category: 'logistics', mineTime: 0.3,
    energy: { type: 'electric', usage: 50, drain: 50 },
    roboport: { radius: 25, constructionRadius: 55 }, // logistic 50x50, construction 110x110
  });
  D.entities['passive-provider-chest'] = baseEntity({
    id: 'passive-provider-chest', size: [1, 1], rotatable: false, health: 350, behaviour: 'logistic-chest',
    minable: 'passive-provider-chest', category: 'logistics', mineTime: 0.2,
    chest: { slots: 48 }, logistic: { mode: 'passive-provider' },
  });
  D.entities['storage-chest'] = baseEntity({
    id: 'storage-chest', size: [1, 1], rotatable: false, health: 350, behaviour: 'logistic-chest',
    minable: 'storage-chest', category: 'logistics', mineTime: 0.2,
    chest: { slots: 48 }, logistic: { mode: 'storage' },
  });
  D.entities['requester-chest'] = baseEntity({
    id: 'requester-chest', size: [1, 1], rotatable: false, health: 350, behaviour: 'logistic-chest',
    minable: 'requester-chest', category: 'logistics', mineTime: 0.2,
    chest: { slots: 48 }, logistic: { mode: 'requester' },
  });

  // -- Rocket silo (§7.4) ------------------------------------------------------
  D.entities['rocket-silo'] = baseEntity({
    id: 'rocket-silo', size: [9, 9], rotatable: false, health: 2000, behaviour: 'rocket-silo',
    minable: 'rocket-silo', category: 'production', mineTime: 1,
    energy: { type: 'electric', usage: 1000, drain: 50 },
    rocketSilo: { partsNeeded: 20 },
  });

  // Lab grows from 2 to 5 science-pack slots (EXPANSION.md §1/§6.3).
  if (D.entities.lab && D.entities.lab.lab) D.entities.lab.lab.slots = 5;

  // ---------------------------------------------------------------------
  // 5. TECHNOLOGIES (EXPANSION.md §5)
  // ---------------------------------------------------------------------
  var PACK_ITEM = {
    R: 'automation-science-pack',
    G: 'logistic-science-pack',
    B: 'chemical-science-pack',
    P: 'production-science-pack',
    Y: 'utility-science-pack',
  };
  function packsFor(letters) {
    return letters.split('').map(function (ch) { return [PACK_ITEM[ch], 1]; });
  }
  function tierFor(letters) {
    if (letters.indexOf('P') !== -1 || letters.indexOf('Y') !== -1) return 4;
    if (letters.indexOf('B') !== -1) return 3;
    return 2; // R+G only
  }

  // Row: [id, prereq[], packLetters, count, time, unlocks[]]
  var TECH_ROWS = [
    ['fluid-handling', ['logistic-science-pack', 'steel-processing'], 'RG', 50, 15, ['storage-tank']],
    ['oil-processing', ['fluid-handling'], 'RG', 100, 30, ['pumpjack', 'oil-refinery', 'chemical-plant', 'basic-oil-processing', 'solid-fuel-from-petroleum-gas']],
    ['plastics', ['oil-processing'], 'RG', 200, 30, ['plastic-bar']],
    ['sulfur-processing', ['oil-processing'], 'RG', 150, 30, ['sulfur', 'sulfuric-acid']],
    ['advanced-electronics', ['plastics', 'electronics'], 'RG', 200, 15, ['advanced-circuit']],
    ['engine', ['steel-processing', 'logistic-science-pack'], 'RG', 100, 15, ['engine-unit']],
    ['chemical-science-pack', ['advanced-electronics', 'sulfur-processing', 'engine'], 'RG', 75, 10, ['chemical-science-pack']],
    ['railway', ['logistics-2', 'engine'], 'RG', 75, 30, ['rail', 'locomotive', 'cargo-wagon']],
    ['automated-rail-transportation', ['railway'], 'RG', 75, 30, ['train-stop']],
    ['rail-signals', ['automated-rail-transportation'], 'RG', 100, 30, ['rail-signal', 'rail-chain-signal']],
    ['advanced-oil-processing', ['chemical-science-pack'], 'RGB', 75, 30, ['advanced-oil-processing', 'heavy-oil-cracking', 'light-oil-cracking', 'solid-fuel-from-light-oil']],
    ['lubricant', ['advanced-oil-processing'], 'RGB', 50, 30, ['lubricant']],
    ['electric-engine', ['lubricant'], 'RGB', 50, 30, ['electric-engine-unit']],
    ['battery', ['sulfur-processing', 'chemical-science-pack'], 'RGB', 150, 30, ['battery']],
    ['robotics', ['electric-engine', 'battery'], 'RGB', 75, 30, ['flying-robot-frame']],
    // construction-robotics comes first and unlocks the roboport (a recipe has one unlocking tech).
    ['construction-robotics', ['robotics'], 'RGB', 100, 30, ['roboport', 'construction-robot']],
    ['logistic-robotics', ['construction-robotics'], 'RGB', 250, 30, ['logistic-robot', 'passive-provider-chest', 'storage-chest', 'requester-chest']],
    ['advanced-electronics-2', ['chemical-science-pack'], 'RGB', 300, 30, ['processing-unit']],
    ['low-density-structure', ['chemical-science-pack', 'plastics'], 'RGB', 300, 45, ['low-density-structure']],
    ['production-science-pack', ['advanced-electronics-2', 'railway'], 'RGB', 100, 30, ['production-science-pack']],
    ['utility-science-pack', ['robotics', 'advanced-electronics-2', 'low-density-structure'], 'RGB', 100, 30, ['utility-science-pack']],
    ['rocket-fuel', ['advanced-oil-processing', 'production-science-pack'], 'RGBP', 300, 45, ['rocket-fuel']],
    ['rocket-control-unit', ['utility-science-pack', 'production-science-pack'], 'RGBPY', 300, 45, ['rocket-control-unit']],
    ['rocket-silo', ['rocket-fuel', 'rocket-control-unit', 'low-density-structure'], 'RGBPY', 500, 60, ['rocket-silo', 'rocket-part', 'satellite']],
  ];

  TECH_ROWS.forEach(function (row) {
    var id = row[0], prereq = row[1], letters = row[2], count = row[3], time = row[4], unlocks = row[5];
    D.techs[id] = {
      id: id,
      prereq: prereq,
      cost: { packs: packsFor(letters), count: count, time: time },
      unlocks: unlocks,
      effects: [],
      tier: tierFor(letters),
    };
    D.order.techs.push(id);
  });

  // ---------------------------------------------------------------------
  // 6. Self-check (load-time; logs warnings only, never throws).
  // ---------------------------------------------------------------------
  function runSelfCheck() {
    var warn = (F.log && F.log.warn) ? F.log.warn : function () {};
    var w = 0;
    function check(cond, msg) { if (!cond) { warn('[05-data-expansion] ' + msg); w++; } }

    Object.keys(D.recipes).forEach(function (rid) {
      var r = D.recipes[rid];
      (r.ingredients || []).forEach(function (ing) { check(!!D.items[ing[0]], 'recipe ' + rid + ': unknown ingredient ' + ing[0]); });
      (r.results || []).forEach(function (res) { check(!!D.items[res[0]], 'recipe ' + rid + ': unknown result ' + res[0]); });
      (r.fluidIngredients || []).forEach(function (fi) { check(!!fluids[fi[0]], 'recipe ' + rid + ': unknown fluid ingredient ' + fi[0]); });
      (r.fluidResults || []).forEach(function (fo) { check(!!fluids[fo[0]], 'recipe ' + rid + ': unknown fluid result ' + fo[0]); });
      if (r.unlockedBy) check(!!D.techs[r.unlockedBy], 'recipe ' + rid + ': unknown unlockedBy tech ' + r.unlockedBy);
    });

    Object.keys(D.entities).forEach(function (eid) {
      var e = D.entities[eid];
      if (!e.natural) check(D.items[eid] && D.items[eid].place === eid, 'entity ' + eid + ': no item with place === ' + eid);
    });

    Object.keys(D.items).forEach(function (iid) {
      var it = D.items[iid];
      if (it.place) check(!!D.entities[it.place], 'item ' + iid + ': place references unknown entity ' + it.place);
    });

    Object.keys(D.techs).forEach(function (tid) {
      var t = D.techs[tid];
      t.prereq.forEach(function (p) { check(!!D.techs[p], 'tech ' + tid + ': unknown prereq ' + p); });
      t.unlocks.forEach(function (u) { check(!!D.recipes[u], 'tech ' + tid + ': unknown unlocked recipe ' + u); });
      t.cost.packs.forEach(function (p) { check(!!D.items[p[0]], 'tech ' + tid + ': unknown pack item ' + p[0]); });
    });

    if (w === 0) {
      if (F.log && F.log.info) {
        F.log.info('[05-data-expansion] self-check passed: ' + FLUID_ROWS.length + ' fluids, ' +
          ITEM_ROWS.length + ' new items, ' + RECIPE_ROWS.length + ' new recipes, ' +
          TECH_ROWS.length + ' new techs');
      }
    }
  }
  runSelfCheck();
})();
