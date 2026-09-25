// 07-data-tiers.js — higher building tiers: express belts (belt / underground / splitter),
// filter and stack inserters, the electric furnace, assembling machine 3, the big electric
// pole and the substation, plus the technologies that unlock them and their English strings.
// DATA ONLY (same rules as 01-data.js / 05-data-expansion.js): no DOM/canvas access, no F.rng.
// Loads after 05-data-expansion.js (file sort order) because several prerequisites
// (lubricant, production-science-pack, advanced-electronics, ...) are expansion techs.
//
// Simplifications [chosen]:
//  - Express belts skip Factorio's lubricant ingredient: assemblers take no fluid inputs here.
//  - Assembling machine 3 uses electric engine units + advanced circuits instead of speed
//    modules (modules are not in the game).
//  - The stack inserter carries a fixed hand of 4 items (no inserter-capacity research).
(function () {
  'use strict';

  var D = F.data;

  // ---------------------------------------------------------------------
  // 1. ITEMS — row shape mirrors 01-data.js ITEM_ROWS.
  // ---------------------------------------------------------------------
  var ITEM_ROWS = [
    ['express-transport-belt', 100, 0, 'logistics', 'express-transport-belt', 'belt', '#3FA9E0', null],
    ['express-underground-belt', 50, 0, 'logistics', 'express-underground-belt', 'belt', '#3FA9E0', '#1E5A7A'],
    ['express-splitter', 50, 0, 'logistics', 'express-splitter', 'belt', '#3FA9E0', null],
    ['filter-inserter', 50, 0, 'logistics', 'filter-inserter', 'inserter', '#9B59D0', null],
    ['stack-inserter', 50, 0, 'logistics', 'stack-inserter', 'inserter', '#5FBF3F', null],
    ['big-electric-pole', 50, 0, 'logistics', 'big-electric-pole', 'pole', '#8A949C', '#5A646C'],
    ['substation', 50, 0, 'logistics', 'substation', 'pole', '#6E8290', '#3FA9E0'],
    ['electric-furnace', 50, 0, 'production', 'electric-furnace', 'furnace', '#A8B0B8', '#E0602A'],
    ['assembling-machine-3', 50, 0, 'production', 'assembling-machine-3', 'machine', '#B89A4A', null],
  ];

  // Insert each new item right after its lower tier in the display order, so the inventory
  // and crafting lists stay grouped by family.
  var AFTER = {
    'express-transport-belt': 'fast-transport-belt',
    'express-underground-belt': 'fast-underground-belt',
    'express-splitter': 'fast-splitter',
    'filter-inserter': 'fast-inserter',
    'stack-inserter': 'filter-inserter',
    'big-electric-pole': 'medium-electric-pole',
    'substation': 'big-electric-pole',
    'electric-furnace': 'steel-furnace',
    'assembling-machine-3': 'assembling-machine-2',
  };
  function insertAfter(list, id, anchor) {
    var at = list.indexOf(anchor);
    if (at < 0) list.push(id); else list.splice(at + 1, 0, id);
  }

  ITEM_ROWS.forEach(function (row) {
    var id = row[0];
    D.items[id] = {
      id: id,
      stack: row[1],
      fuel: row[2],
      category: row[3],
      place: row[4] || undefined,
      icon: { shape: row[5], color: row[6], color2: row[7] || null },
    };
    insertAfter(D.order.items, id, AFTER[id]);
  });

  // ---------------------------------------------------------------------
  // 2. RECIPES — [id, ingredients, results, time, category, unlockedBy]
  // ---------------------------------------------------------------------
  var RECIPE_ROWS = [
    ['express-transport-belt', [['iron-gear-wheel', 10], ['fast-transport-belt', 1]], [['express-transport-belt', 1]], 0.5, 'crafting', 'logistics-3'],
    ['express-underground-belt', [['iron-gear-wheel', 80], ['fast-underground-belt', 2]], [['express-underground-belt', 2]], 2, 'crafting', 'logistics-3'],
    ['express-splitter', [['fast-splitter', 1], ['iron-gear-wheel', 10], ['advanced-circuit', 10]], [['express-splitter', 1]], 2, 'crafting', 'logistics-3'],
    ['filter-inserter', [['fast-inserter', 1], ['electronic-circuit', 4]], [['filter-inserter', 1]], 0.5, 'crafting', 'fast-inserter'],
    ['stack-inserter', [['fast-inserter', 1], ['iron-gear-wheel', 15], ['electronic-circuit', 15], ['advanced-circuit', 1]], [['stack-inserter', 1]], 0.5, 'crafting', 'stack-inserter'],
    ['big-electric-pole', [['iron-stick', 8], ['steel-plate', 5], ['copper-plate', 5]], [['big-electric-pole', 1]], 0.5, 'crafting', 'electric-energy-distribution-1'],
    ['substation', [['steel-plate', 10], ['advanced-circuit', 5], ['copper-plate', 5]], [['substation', 1]], 0.5, 'crafting', 'electric-energy-distribution-2'],
    ['electric-furnace', [['steel-plate', 10], ['advanced-circuit', 5], ['stone-brick', 10]], [['electric-furnace', 1]], 5, 'crafting', 'advanced-material-processing-2'],
    ['assembling-machine-3', [['assembling-machine-2', 2], ['electric-engine-unit', 4], ['advanced-circuit', 4]], [['assembling-machine-3', 1]], 0.5, 'crafting', 'automation-3'],
  ];

  RECIPE_ROWS.forEach(function (row) {
    var id = row[0];
    var resultItem = D.items[row[2][0][0]];
    var tab = resultItem && (resultItem.category === 'logistics' || resultItem.category === 'production') ? resultItem.category : 'intermediate';
    D.recipes[id] = {
      id: id,
      ingredients: row[1],
      results: row[2],
      time: row[3],
      category: row[4],
      hand: row[4] === 'crafting',
      tab: tab,
      unlockedBy: row[5],
      fluidIngredients: [],
      fluidResults: [],
    };
    if (!D.order.recipesByTab[tab]) D.order.recipesByTab[tab] = [];
    insertAfter(D.order.recipesByTab[tab], id, AFTER[id]);
  });

  // ---------------------------------------------------------------------
  // 3. ENTITIES — same defaults as 01-data.js's (private) baseEntity().
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

  // Belts: 24 = one slot every 3 ticks (fast = 4, yellow = 8), see 30-belts.js stepTicks().
  D.entities['express-transport-belt'] = baseEntity({ id: 'express-transport-belt', size: [1, 1], rotatable: true, health: 170, behaviour: 'belt', minable: 'express-transport-belt', category: 'logistics', layer: 'belt', collides: false, mineTime: 0.1, belt: { tier: 'express', speed: 24 } });
  D.entities['express-underground-belt'] = baseEntity({ id: 'express-underground-belt', size: [1, 1], rotatable: true, health: 170, behaviour: 'underground', minable: 'express-underground-belt', category: 'logistics', layer: 'belt', collides: false, mineTime: 0.1, underground: { tier: 'express', speed: 24, maxGap: 8 } });
  D.entities['express-splitter'] = baseEntity({ id: 'express-splitter', size: [2, 1], rotatable: true, health: 190, behaviour: 'splitter', minable: 'express-splitter', category: 'logistics', layer: 'belt', collides: false, mineTime: 0.1, splitter: { tier: 'express', speed: 24 } });

  // Inserters: both swing at fast-inserter speed; `stack` = items carried per swing.
  D.entities['filter-inserter'] = baseEntity({ id: 'filter-inserter', size: [1, 1], rotatable: true, health: 160, behaviour: 'inserter', minable: 'filter-inserter', category: 'logistics', mineTime: 0.1, energy: { type: 'electric', usage: 53, drain: 0.5 }, inserter: { rotationSpeed: 0.04, reach: 1, burner: false, filter: true } });
  D.entities['stack-inserter'] = baseEntity({ id: 'stack-inserter', size: [1, 1], rotatable: true, health: 160, behaviour: 'inserter', minable: 'stack-inserter', category: 'logistics', mineTime: 0.1, energy: { type: 'electric', usage: 133, drain: 1 }, inserter: { rotationSpeed: 0.04, reach: 1, burner: false, filter: false, stack: 4 } });

  // Poles: `supply` is the half-width of the supplied square, `reach` the wire distance.
  D.entities['big-electric-pole'] = baseEntity({ id: 'big-electric-pole', size: [2, 2], rotatable: false, health: 150, behaviour: 'pole', minable: 'big-electric-pole', category: 'logistics', collides: false, layer: 'pole', mineTime: 0.1, pole: { reach: 30, supply: 2 } });
  D.entities['substation'] = baseEntity({ id: 'substation', size: [2, 2], rotatable: false, health: 200, behaviour: 'pole', minable: 'substation', category: 'logistics', collides: false, layer: 'pole', mineTime: 0.1, pole: { reach: 18, supply: 9 } });

  // Electric furnace: the furnace behaviour with electric energy (no fuel slot, see 32-machines.js).
  D.entities['electric-furnace'] = baseEntity({ id: 'electric-furnace', size: [3, 3], rotatable: false, health: 350, behaviour: 'furnace', minable: 'electric-furnace', category: 'production', pollution: 1, mineTime: 0.2, energy: { type: 'electric', usage: 180, drain: 6 }, speed: 2, furnace: { speed: 2 } });
  D.entities['assembling-machine-3'] = baseEntity({ id: 'assembling-machine-3', size: [3, 3], rotatable: false, health: 400, behaviour: 'assembler', minable: 'assembling-machine-3', category: 'production', pollution: 2, mineTime: 0.2, energy: { type: 'electric', usage: 375, drain: 12.5 }, speed: 1.25, assembler: { speed: 1.25, ingredientSlots: 6 } });

  // ---------------------------------------------------------------------
  // 4. TECHNOLOGIES
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
    return letters.indexOf('G') !== -1 ? 2 : 1;
  }

  // Row: [id, prereq[], packLetters, count, time, unlocks[]]
  var TECH_ROWS = [
    ['stack-inserter', ['fast-inserter', 'logistics-2', 'advanced-electronics'], 'RG', 150, 30, ['stack-inserter']],
    ['electric-energy-distribution-2', ['electric-energy-distribution-1', 'chemical-science-pack'], 'RGB', 100, 45, ['substation']],
    ['advanced-material-processing-2', ['advanced-material-processing', 'chemical-science-pack'], 'RGB', 250, 30, ['electric-furnace']],
    ['logistics-3', ['logistics-2', 'lubricant', 'production-science-pack'], 'RGBP', 300, 15, ['express-transport-belt', 'express-underground-belt', 'express-splitter']],
    ['automation-3', ['automation-2', 'electric-engine', 'production-science-pack'], 'RGBP', 150, 60, ['assembling-machine-3']],
  ];
  TECH_ROWS.forEach(function (row) {
    var id = row[0];
    D.techs[id] = {
      id: id,
      prereq: row[1],
      cost: { packs: packsFor(row[2]), count: row[3], time: row[4] },
      unlocks: row[5],
      effects: [],
      tier: tierFor(row[2]),
    };
    D.order.techs.push(id);
  });
  // Existing techs that gain an unlock.
  D.techs['fast-inserter'].unlocks.push('filter-inserter');
  D.techs['electric-energy-distribution-1'].unlocks.push('big-electric-pole');

  // ---------------------------------------------------------------------
  // 5. English strings
  // ---------------------------------------------------------------------
  F.i18n.add('en', {
    'item.express-transport-belt': 'Express transport belt',
    'item.express-transport-belt.desc': 'The fastest belt, 40 items/s; unlocked by Logistics 3. Stack: 100.',
    'item.express-underground-belt': 'Express underground belt',
    'item.express-underground-belt.desc': 'The express version of the underground belt; gap up to 8 tiles. Stack: 50.',
    'item.express-splitter': 'Express splitter',
    'item.express-splitter.desc': 'The express version of the splitter, 40 items/s per belt. Stack: 50.',
    'item.filter-inserter': 'Filter inserter',
    'item.filter-inserter.desc': 'A fast inserter that only moves the items set in its filter (or all but them in blacklist mode). Stack: 50.',
    'item.stack-inserter': 'Stack inserter',
    'item.stack-inserter.desc': 'A fast inserter that moves up to 4 items of one kind per swing. Stack: 50.',
    'item.big-electric-pole': 'Big electric pole',
    'item.big-electric-pole.desc': 'A tall 2×2 pole for long distances: wire reach 30 tiles, supplies only its own 4×4 area. Stack: 50.',
    'item.substation': 'Substation',
    'item.substation.desc': 'A 2×2 pole that powers a large 18×18 area; wire reach 18 tiles. Stack: 50.',
    'item.electric-furnace': 'Electric furnace',
    'item.electric-furnace.desc': 'A 3×3 electric furnace, smelting speed 2, needs no fuel. Stack: 50.',
    'item.assembling-machine-3': 'Assembling machine 3',
    'item.assembling-machine-3.desc': 'The fastest assembling machine, crafting speed 1.25. Stack: 50.',

    'ent.express-transport-belt': 'Express transport belt',
    'ent.express-transport-belt.desc': '1×1, moves items at 40 items/s (both lanes).',
    'ent.express-underground-belt': 'Express underground belt',
    'ent.express-underground-belt.desc': '1×1, carries an express belt up to 8 tiles under obstacles.',
    'ent.express-splitter': 'Express splitter',
    'ent.express-splitter.desc': '2×1, splits and merges express belts.',
    'ent.filter-inserter': 'Filter inserter',
    'ent.filter-inserter.desc': '1×1, electric (53 kW), moves only filtered items; open it to set up to 5 filters.',
    'ent.stack-inserter': 'Stack inserter',
    'ent.stack-inserter.desc': '1×1, electric (133 kW), moves up to 4 items per swing.',
    'ent.big-electric-pole': 'Big electric pole',
    'ent.big-electric-pole.desc': '2×2, wire reach 30 tiles, supply area 4×4.',
    'ent.substation': 'Substation',
    'ent.substation.desc': '2×2, wire reach 18 tiles, supply area 18×18.',
    'ent.electric-furnace': 'Electric furnace',
    'ent.electric-furnace.desc': '3×3, electric (180 kW), smelting speed 2; pollution 1/min.',
    'ent.assembling-machine-3': 'Assembling machine 3',
    'ent.assembling-machine-3.desc': '3×3, electric (375 kW), crafts a chosen recipe at speed 1.25; pollution 2/min.',

    'tech.stack-inserter': 'Stack inserter',
    'tech.stack-inserter.desc': 'An inserter that moves several items at once — great for chests and trains.',
    'tech.electric-energy-distribution-2': 'Electric energy distribution 2',
    'tech.electric-energy-distribution-2.desc': 'The substation: one pole that powers a whole 18×18 block.',
    'tech.advanced-material-processing-2': 'Advanced material processing 2',
    'tech.advanced-material-processing-2.desc': 'The electric furnace: smelting without fuel or coal belts.',
    'tech.logistics-3': 'Logistics 3',
    'tech.logistics-3.desc': 'Express belts, undergrounds and splitters — a third faster than fast belts.',
    'tech.automation-3': 'Automation 3',
    'tech.automation-3.desc': 'Assembling machine 3, the fastest assembler.',
  });

  // ---------------------------------------------------------------------
  // 6. Self-check (warnings only).
  // ---------------------------------------------------------------------
  var warn = (F.log && F.log.warn) ? F.log.warn : function () {};
  RECIPE_ROWS.forEach(function (row) {
    row[1].concat(row[2]).forEach(function (p) { if (!D.items[p[0]]) warn('[07-data-tiers] recipe ' + row[0] + ': unknown item ' + p[0]); });
    if (!D.techs[row[5]]) warn('[07-data-tiers] recipe ' + row[0] + ': unknown tech ' + row[5]);
  });
  TECH_ROWS.forEach(function (row) {
    row[1].forEach(function (p) { if (!D.techs[p]) warn('[07-data-tiers] tech ' + row[0] + ': unknown prereq ' + p); });
  });
})();
