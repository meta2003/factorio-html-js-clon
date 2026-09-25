// 07-data-modules.js — module data: speed / productivity / efficiency modules (3 tiers each),
// the machines that carry module slots (assembling-machine-3, electric-furnace, plus slot
// counts on the existing assembling-machine-2 and electric-mining-drill) and their
// technologies. DATA ONLY, same rules as 05-data-expansion.js: no i18n strings
// (08-i18n-modules.js owns the text), no DOM/canvas, no F.rng. The effect logic lives in
// src/35-modules.js; 32-machines.js asks it for speed/energy/productivity/pollution factors.
//
// Values follow Factorio 1.1:
//   speed        +20/+30/+50 % speed,   +50/+60/+70 % energy
//   efficiency   -30/-40/-50 % energy
//   productivity +4/+6/+10 % output,   -5/-10/-15 % speed, +40/+60/+80 % energy, +5/+7/+10 % pollution
// Energy and speed never drop below 20 % (clamped in 35-modules.js).
(function () {
  'use strict';

  var D = F.data;

  // ---------------------------------------------------------------------
  // 1. Module effects, by item id. Consumed by F.modules (35-modules.js).
  // ---------------------------------------------------------------------
  var MODULE_ROWS = [
    // [id, kind, tier, speed, consumption, productivity, pollution, color, color2]
    ['speed-module', 'speed', 1, 0.2, 0.5, 0, 0, '#3A7FD9', '#9CC4F2'],
    ['speed-module-2', 'speed', 2, 0.3, 0.6, 0, 0, '#3A7FD9', '#9CC4F2'],
    ['speed-module-3', 'speed', 3, 0.5, 0.7, 0, 0, '#3A7FD9', '#9CC4F2'],
    ['productivity-module', 'productivity', 1, -0.05, 0.4, 0.04, 0.05, '#D9452B', '#F2A08C'],
    ['productivity-module-2', 'productivity', 2, -0.10, 0.6, 0.06, 0.07, '#D9452B', '#F2A08C'],
    ['productivity-module-3', 'productivity', 3, -0.15, 0.8, 0.10, 0.10, '#D9452B', '#F2A08C'],
    ['efficiency-module', 'efficiency', 1, 0, -0.3, 0, 0, '#3FA35A', '#A0DCA8'],
    ['efficiency-module-2', 'efficiency', 2, 0, -0.4, 0, 0, '#3FA35A', '#A0DCA8'],
    ['efficiency-module-3', 'efficiency', 3, 0, -0.5, 0, 0, '#3FA35A', '#A0DCA8'],
  ];

  var modules = {};
  MODULE_ROWS.forEach(function (row) {
    var id = row[0];
    modules[id] = {
      id: id, kind: row[1], tier: row[2],
      effect: { speed: row[3], consumption: row[4], productivity: row[5], pollution: row[6] },
    };
    D.items[id] = {
      id: id, stack: 50, fuel: 0, category: 'module', place: undefined,
      icon: { shape: 'module', color: row[7], color2: row[8], tier: row[2] },
      module: modules[id],
    };
    D.order.items.push(id);
  });
  D.modules = modules;

  // ---------------------------------------------------------------------
  // 2. Machines. moduleSlots on an entity def = how many modules it takes (0/absent = none).
  // Burner machines (stone/steel furnace, burner drill) and assembling-machine-1 take none,
  // as in Factorio.
  // ---------------------------------------------------------------------
  function baseEntity(o) {
    return Object.assign({
      rotatable: false, natural: false, collides: true, layer: 'object', pollution: 0,
      energy: { type: 'none', usage: 0, drain: 0 }, mineTime: 0.2,
    }, o);
  }
  D.entities['assembling-machine-3'] = baseEntity({
    id: 'assembling-machine-3', size: [3, 3], health: 400, behaviour: 'assembler',
    minable: 'assembling-machine-3', category: 'production', pollution: 2, mineTime: 0.2,
    energy: { type: 'electric', usage: 375, drain: 12.5 }, speed: 1.25,
    assembler: { speed: 1.25, ingredientSlots: 6 }, moduleSlots: 4,
  });
  D.entities['electric-furnace'] = baseEntity({
    id: 'electric-furnace', size: [3, 3], health: 350, behaviour: 'furnace',
    minable: 'electric-furnace', category: 'production', pollution: 1, mineTime: 0.2,
    energy: { type: 'electric', usage: 180, drain: 6 }, speed: 2,
    furnace: { speed: 2 }, moduleSlots: 2,
  });
  if (D.entities['assembling-machine-2']) D.entities['assembling-machine-2'].moduleSlots = 2;
  if (D.entities['electric-mining-drill']) D.entities['electric-mining-drill'].moduleSlots = 3;

  [
    ['assembling-machine-3', 'machine', '#8A7A4E'],
    ['electric-furnace', 'machine', '#8C5A4A'],
  ].forEach(function (row) {
    D.items[row[0]] = {
      id: row[0], stack: 50, fuel: 0, category: 'production', place: row[0],
      icon: { shape: row[1], color: row[2], color2: null },
    };
    D.order.items.push(row[0]);
  });

  // ---------------------------------------------------------------------
  // 3. Recipes. Modules are hand-craftable ('crafting'); they go in the production tab.
  // ---------------------------------------------------------------------
  // Row: [id, ingredients, results, time, unlockedBy]
  var RECIPE_ROWS = [
    ['speed-module', [['advanced-circuit', 5], ['electronic-circuit', 5]], 15, 'speed-module'],
    ['productivity-module', [['advanced-circuit', 5], ['electronic-circuit', 5]], 15, 'productivity-module'],
    ['efficiency-module', [['advanced-circuit', 5], ['electronic-circuit', 5]], 15, 'efficiency-module'],
    ['speed-module-2', [['speed-module', 4], ['advanced-circuit', 5], ['processing-unit', 5]], 30, 'speed-module-2'],
    ['productivity-module-2', [['productivity-module', 4], ['advanced-circuit', 5], ['processing-unit', 5]], 30, 'productivity-module-2'],
    ['efficiency-module-2', [['efficiency-module', 4], ['advanced-circuit', 5], ['processing-unit', 5]], 30, 'efficiency-module-2'],
    ['speed-module-3', [['speed-module-2', 5], ['advanced-circuit', 5], ['processing-unit', 5]], 60, 'speed-module-3'],
    ['productivity-module-3', [['productivity-module-2', 5], ['advanced-circuit', 5], ['processing-unit', 5]], 60, 'productivity-module-3'],
    ['efficiency-module-3', [['efficiency-module-2', 5], ['advanced-circuit', 5], ['processing-unit', 5]], 60, 'efficiency-module-3'],
    ['assembling-machine-3', [['speed-module', 4], ['assembling-machine-2', 2]], 0.5, 'automation-3'],
    ['electric-furnace', [['steel-plate', 10], ['advanced-circuit', 5], ['stone-brick', 10]], 5, 'advanced-material-processing-2'],
  ];
  RECIPE_ROWS.forEach(function (row) {
    var id = row[0];
    D.recipes[id] = {
      id: id, ingredients: row[1], results: [[id, 1]], time: row[2], category: 'crafting',
      hand: true, tab: 'production', unlockedBy: row[3], fluidIngredients: [], fluidResults: [],
    };
    if (!D.order.recipesByTab.production) D.order.recipesByTab.production = [];
    D.order.recipesByTab.production.push(id);
  });

  // ---------------------------------------------------------------------
  // 4. Technologies
  // ---------------------------------------------------------------------
  var PACK_ITEM = {
    R: 'automation-science-pack', G: 'logistic-science-pack', B: 'chemical-science-pack',
    P: 'production-science-pack', Y: 'utility-science-pack',
  };
  function packsFor(letters) { return letters.split('').map(function (ch) { return [PACK_ITEM[ch], 1]; }); }
  function tierFor(letters) {
    if (letters.indexOf('P') !== -1 || letters.indexOf('Y') !== -1) return 4;
    if (letters.indexOf('B') !== -1) return 3;
    return 2;
  }
  // Row: [id, prereq[], packLetters, count, time, unlocks[]]
  var TECH_ROWS = [
    ['speed-module', ['advanced-electronics'], 'RG', 50, 30, ['speed-module']],
    ['productivity-module', ['advanced-electronics'], 'RG', 50, 30, ['productivity-module']],
    ['efficiency-module', ['advanced-electronics'], 'RG', 50, 30, ['efficiency-module']],
    ['advanced-material-processing-2', ['advanced-material-processing', 'chemical-science-pack'], 'RGB', 250, 30, ['electric-furnace']],
    ['speed-module-2', ['speed-module', 'advanced-electronics-2'], 'RGB', 75, 30, ['speed-module-2']],
    ['productivity-module-2', ['productivity-module', 'advanced-electronics-2'], 'RGB', 75, 30, ['productivity-module-2']],
    ['efficiency-module-2', ['efficiency-module', 'advanced-electronics-2'], 'RGB', 75, 30, ['efficiency-module-2']],
    ['automation-3', ['speed-module', 'production-science-pack'], 'RGBP', 150, 60, ['assembling-machine-3']],
    ['speed-module-3', ['speed-module-2', 'production-science-pack', 'utility-science-pack'], 'RGBPY', 300, 60, ['speed-module-3']],
    ['productivity-module-3', ['productivity-module-2', 'production-science-pack', 'utility-science-pack'], 'RGBPY', 300, 60, ['productivity-module-3']],
    ['efficiency-module-3', ['efficiency-module-2', 'production-science-pack', 'utility-science-pack'], 'RGBPY', 300, 60, ['efficiency-module-3']],
  ];
  TECH_ROWS.forEach(function (row) {
    D.techs[row[0]] = {
      id: row[0], prereq: row[1], cost: { packs: packsFor(row[2]), count: row[3], time: row[4] },
      unlocks: row[5], effects: [], tier: tierFor(row[2]),
    };
    D.order.techs.push(row[0]);
  });
})();
