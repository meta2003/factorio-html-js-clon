// 01-data.js — pure data: items, recipes, entity definitions, technologies.
// See design/ARCHITECTURE.md §3. Values transcribed from design/GDD.md §3,4,5,6,8
// and (for solar-panel / accumulator, out of GDD scope but in-scope per ARCHITECTURE)
// research/entities-and-machines.md §9, research/items-and-recipes.md, research/technology-tree.md.
// This module defines DATA ONLY: no i18n strings (02-i18n.js owns all item.*/ent.*/tech.* text),
// no DOM/canvas access, no F.rng usage (nothing here is randomised).
(function () {
  'use strict';

  var items = {};
  var recipes = {};
  var entities = {};
  var techs = {};

  // ---------------------------------------------------------------------
  // 1. ITEMS (GDD §4 — 51 items + solar-panel + accumulator = 53)
  // ---------------------------------------------------------------------
  // Row shape: [id, stack, fuelMJ, category, placeEntityId|null, iconShape, color, color2|null, ammo|null]
  var ITEM_ROWS = [
    ['iron-ore', 50, 0, 'resource', null, 'ore', '#6C8399', '#9FB3C4', null],
    ['copper-ore', 50, 0, 'resource', null, 'ore', '#C9662F', '#E8925A', null],
    ['coal', 50, 4, 'resource', null, 'ore', '#1E1E1E', '#4A4F5A', null],
    ['stone', 50, 0, 'resource', null, 'ore', '#A8956B', '#D2C39A', null],
    ['wood', 100, 2, 'resource', null, 'log', '#8B5A2B', '#C08A4E', null],
    ['iron-plate', 100, 0, 'intermediate', null, 'plate', '#B8BEC4', '#7E868C', null],
    ['copper-plate', 100, 0, 'intermediate', null, 'plate', '#D27C3C', '#8F4F22', null],
    ['steel-plate', 100, 0, 'intermediate', null, 'bar', '#8B9AA8', '#4E5A66', null],
    ['stone-brick', 100, 0, 'intermediate', null, 'brick', '#A6906A', '#6E5F44', null],
    ['iron-gear-wheel', 100, 0, 'intermediate', null, 'gear', '#9C9C9C', '#4A4A4A', null],
    ['copper-cable', 200, 0, 'intermediate', null, 'coil', '#D98A4F', null, null],
    ['electronic-circuit', 200, 0, 'intermediate', null, 'pcb', '#3F8F3F', '#C57A3B', null],
    ['iron-stick', 100, 0, 'intermediate', null, 'rods', '#A9AFB5', null, null],
    ['pipe', 100, 0, 'logistics', 'pipe', 'tube', '#8FA3B0', '#5A6A74', null],
    ['automation-science-pack', 200, 0, 'science', null, 'flask', '#D9422B', null, null],
    ['logistic-science-pack', 200, 0, 'science', null, 'flask', '#3EB44A', null, null],
    // Combat items (pistol, submachine-gun, firearm-magazine, piercing-rounds-magazine,
    // gun-turret, stone-wall, repair-pack) removed — see src/disabled/01_data-combat.js
    // and src/disabled/README.md (F.FEATURES.combat off).
    ['wooden-chest', 50, 0, 'logistics', 'wooden-chest', 'box', '#A5773E', null, null],
    ['iron-chest', 50, 0, 'logistics', 'iron-chest', 'box', '#9AA3AA', null, null],
    ['steel-chest', 50, 0, 'logistics', 'steel-chest', 'box', '#6F7C8A', null, null],
    ['transport-belt', 100, 0, 'logistics', 'transport-belt', 'belt', '#E0B31E', '#4D3D0A', null],
    ['fast-transport-belt', 100, 0, 'logistics', 'fast-transport-belt', 'belt', '#C93B2B', null, null],
    ['underground-belt', 50, 0, 'logistics', 'underground-belt', 'belt', '#E0B31E', '#6E5A1E', null],
    ['fast-underground-belt', 50, 0, 'logistics', 'fast-underground-belt', 'belt', '#C93B2B', null, null],
    ['splitter', 50, 0, 'logistics', 'splitter', 'belt', '#E0B31E', null, null],
    ['fast-splitter', 50, 0, 'logistics', 'fast-splitter', 'belt', '#C93B2B', null, null],
    ['burner-inserter', 50, 0, 'logistics', 'burner-inserter', 'inserter', '#777777', '#3A3A3A', null],
    ['inserter', 50, 0, 'logistics', 'inserter', 'inserter', '#E4B21C', null, null],
    ['long-handed-inserter', 50, 0, 'logistics', 'long-handed-inserter', 'inserter', '#C24A2A', null, null],
    ['fast-inserter', 50, 0, 'logistics', 'fast-inserter', 'inserter', '#2F7FC1', null, null],
    ['pipe-to-ground', 50, 0, 'logistics', 'pipe-to-ground', 'tube', '#8FA3B0', '#5A4A3A', null],
    ['small-electric-pole', 50, 0, 'logistics', 'small-electric-pole', 'pole', '#8B5A2B', '#C9772E', null],
    ['medium-electric-pole', 50, 0, 'logistics', 'medium-electric-pole', 'pole', '#7C8790', null, null],
    ['offshore-pump', 20, 0, 'production', 'offshore-pump', 'pump', '#6C8C9C', null, null],
    ['boiler', 50, 0, 'production', 'boiler', 'boiler', '#6B5A4A', '#E0602A', null],
    ['steam-engine', 10, 0, 'production', 'steam-engine', 'engine', '#7A8590', null, null],
    ['burner-mining-drill', 50, 0, 'production', 'burner-mining-drill', 'drill', '#6E6A60', null, null],
    ['electric-mining-drill', 50, 0, 'production', 'electric-mining-drill', 'drill', '#5E6C7A', '#D9A520', null],
    ['stone-furnace', 50, 0, 'production', 'stone-furnace', 'furnace', '#8C8072', '#E0602A', null],
    ['steel-furnace', 50, 0, 'production', 'steel-furnace', 'furnace', '#5E6873', null, null],
    ['assembling-machine-1', 50, 0, 'production', 'assembling-machine-1', 'machine', '#7B8A5A', null, null],
    ['assembling-machine-2', 50, 0, 'production', 'assembling-machine-2', 'machine', '#5A7B8A', null, null],
    ['lab', 10, 0, 'production', 'lab', 'dome', '#4A8AA8', null, null],
    ['radar', 50, 0, 'production', 'radar', 'dish', '#8A9AA5', null, null],
    ['small-lamp', 50, 0, 'logistics', 'small-lamp', 'lamp', '#E8E4C0', null, null],
    // P1 additions (ARCHITECTURE.md intro): solar power test-suite support.
    ['solar-panel', 50, 0, 'production', 'solar-panel', 'panel', '#2B4C7E', '#16314F', null],
    ['accumulator', 50, 0, 'production', 'accumulator', 'battery', '#2E5E3E', '#163019', null],
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
    if (row[8]) def.ammo = row[8];
    items[id] = def;
  });

  // ---------------------------------------------------------------------
  // 2. RECIPES (GDD §5 — 46 recipes + solar-panel + accumulator = 48)
  // ---------------------------------------------------------------------
  // Row shape: [id, ingredients[[id,n]...], results[[id,n]...], time, category, unlockedBy|null]
  var RECIPE_ROWS = [
    // 5.1 Smelting (furnace only)
    ['iron-plate', [['iron-ore', 1]], [['iron-plate', 1]], 3.2, 'smelting', null],
    ['copper-plate', [['copper-ore', 1]], [['copper-plate', 1]], 3.2, 'smelting', null],
    ['stone-brick', [['stone', 2]], [['stone-brick', 1]], 3.2, 'smelting', null],
    ['steel-plate', [['iron-plate', 5]], [['steel-plate', 1]], 16, 'smelting', 'steel-processing'],
    // 5.2 Intermediates
    ['iron-gear-wheel', [['iron-plate', 2]], [['iron-gear-wheel', 1]], 0.5, 'crafting', null],
    ['copper-cable', [['copper-plate', 1]], [['copper-cable', 2]], 0.5, 'crafting', null],
    ['electronic-circuit', [['iron-plate', 1], ['copper-cable', 3]], [['electronic-circuit', 1]], 0.5, 'crafting', null],
    ['iron-stick', [['iron-plate', 1]], [['iron-stick', 2]], 0.5, 'crafting', null],
    ['pipe', [['iron-plate', 1]], [['pipe', 1]], 0.5, 'crafting', null],
    // 5.3 Science
    ['automation-science-pack', [['copper-plate', 1], ['iron-gear-wheel', 1]], [['automation-science-pack', 1]], 5, 'crafting', null],
    ['logistic-science-pack', [['inserter', 1], ['transport-belt', 1]], [['logistic-science-pack', 1]], 6, 'crafting', 'logistic-science-pack'],
    // 5.4 Military — removed, see src/disabled/01_data-combat.js (F.FEATURES.combat off).
    // 5.5 Logistics
    ['wooden-chest', [['wood', 2]], [['wooden-chest', 1]], 0.5, 'crafting', null],
    ['iron-chest', [['iron-plate', 8]], [['iron-chest', 1]], 0.5, 'crafting', null],
    ['steel-chest', [['steel-plate', 8]], [['steel-chest', 1]], 0.5, 'crafting', 'steel-processing'],
    ['transport-belt', [['iron-plate', 1], ['iron-gear-wheel', 1]], [['transport-belt', 2]], 0.5, 'crafting', null],
    ['fast-transport-belt', [['iron-gear-wheel', 5], ['transport-belt', 1]], [['fast-transport-belt', 1]], 0.5, 'crafting', 'logistics-2'],
    ['underground-belt', [['iron-plate', 10], ['transport-belt', 5]], [['underground-belt', 2]], 1, 'crafting', 'logistics'],
    ['fast-underground-belt', [['iron-gear-wheel', 40], ['underground-belt', 2]], [['fast-underground-belt', 2]], 2, 'crafting', 'logistics-2'],
    ['splitter', [['electronic-circuit', 5], ['iron-plate', 5], ['transport-belt', 4]], [['splitter', 1]], 1, 'crafting', 'logistics'],
    ['fast-splitter', [['splitter', 1], ['iron-gear-wheel', 10], ['electronic-circuit', 10]], [['fast-splitter', 1]], 2, 'crafting', 'logistics-2'],
    ['burner-inserter', [['iron-plate', 1], ['iron-gear-wheel', 1]], [['burner-inserter', 1]], 0.5, 'crafting', null],
    ['inserter', [['electronic-circuit', 1], ['iron-gear-wheel', 1], ['iron-plate', 1]], [['inserter', 1]], 0.5, 'crafting', null],
    ['long-handed-inserter', [['iron-gear-wheel', 1], ['iron-plate', 1], ['inserter', 1]], [['long-handed-inserter', 1]], 0.5, 'crafting', 'automation'],
    ['fast-inserter', [['electronic-circuit', 2], ['iron-plate', 2], ['inserter', 1]], [['fast-inserter', 1]], 0.5, 'crafting', 'fast-inserter'],
    ['pipe-to-ground', [['pipe', 10], ['iron-plate', 5]], [['pipe-to-ground', 2]], 0.5, 'crafting', null],
    ['small-electric-pole', [['wood', 1], ['copper-cable', 2]], [['small-electric-pole', 2]], 0.5, 'crafting', null],
    ['medium-electric-pole', [['iron-stick', 4], ['steel-plate', 2], ['copper-plate', 2]], [['medium-electric-pole', 1]], 0.5, 'crafting', 'electric-energy-distribution-1'],
    ['small-lamp', [['electronic-circuit', 1], ['copper-cable', 3], ['iron-plate', 1]], [['small-lamp', 1]], 0.5, 'crafting', 'optics'],
    // 5.6 Production and power
    ['stone-furnace', [['stone', 5]], [['stone-furnace', 1]], 0.5, 'crafting', null],
    ['steel-furnace', [['steel-plate', 6], ['stone-brick', 10]], [['steel-furnace', 1]], 3, 'crafting', 'advanced-material-processing'],
    ['burner-mining-drill', [['iron-gear-wheel', 3], ['stone-furnace', 1], ['iron-plate', 3]], [['burner-mining-drill', 1]], 2, 'crafting', null],
    ['electric-mining-drill', [['electronic-circuit', 3], ['iron-gear-wheel', 5], ['iron-plate', 10]], [['electric-mining-drill', 1]], 2, 'crafting', null],
    ['assembling-machine-1', [['electronic-circuit', 3], ['iron-gear-wheel', 5], ['iron-plate', 9]], [['assembling-machine-1', 1]], 0.5, 'crafting', 'automation'],
    ['assembling-machine-2', [['steel-plate', 2], ['electronic-circuit', 3], ['iron-gear-wheel', 5], ['assembling-machine-1', 1]], [['assembling-machine-2', 1]], 0.5, 'crafting', 'automation-2'],
    ['offshore-pump', [['electronic-circuit', 2], ['pipe', 1], ['iron-gear-wheel', 1]], [['offshore-pump', 1]], 0.5, 'crafting', null],
    ['boiler', [['stone-furnace', 1], ['pipe', 4]], [['boiler', 1]], 0.5, 'crafting', null],
    ['steam-engine', [['iron-gear-wheel', 8], ['pipe', 5], ['iron-plate', 10]], [['steam-engine', 1]], 0.5, 'crafting', null],
    ['lab', [['electronic-circuit', 10], ['iron-gear-wheel', 10], ['transport-belt', 4]], [['lab', 1]], 2, 'crafting', null],
    ['radar', [['electronic-circuit', 5], ['iron-gear-wheel', 5], ['iron-plate', 10]], [['radar', 1]], 0.5, 'crafting', 'electronics'],
    // gun-turret / stone-wall recipes removed, see src/disabled/01_data-combat.js.
    // P1 additions — solar-panel recipe from research/items-and-recipes.md; accumulator recipe
    // substitutes the out-of-scope 'battery' ingredient with copper-plate (see report "assumptions").
    ['solar-panel', [['copper-plate', 5], ['electronic-circuit', 15], ['steel-plate', 5]], [['solar-panel', 1]], 10, 'crafting', 'solar-energy'],
    ['accumulator', [['iron-plate', 2], ['copper-plate', 5]], [['accumulator', 1]], 10, 'crafting', 'electric-energy-accumulators'],
  ];

  // crafting-menu tab follows the RESULT item's top-level category; 'resource' and 'science'
  // items have no tab of their own in the 4-tab UI (ARCHITECTURE §3), so they fold into
  // 'intermediate' (science packs are intermediate products of the tech chain).
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
    var id = row[0], ingredients = row[1], results = row[2], time = row[3], category = row[4], unlockedBy = row[5];
    var resultItem = items[results[0][0]];
    var tab = resultItem ? tabForCategory(resultItem.category) : 'intermediate';
    recipes[id] = {
      id: id,
      ingredients: ingredients,
      results: results,
      time: time,
      category: category,
      hand: category === 'crafting',
      tab: tab,
      unlockedBy: unlockedBy,
    };
  });

  // ---------------------------------------------------------------------
  // 3. ENTITIES (GDD §6 — 31 placeable + solar-panel + accumulator + naturals)
  // ---------------------------------------------------------------------
  function baseEntity(o) {
    // Fill in shared defaults so each row below only states what differs.
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

  // -- Storage --------------------------------------------------------
  entities['wooden-chest'] = baseEntity({ id: 'wooden-chest', size: [1, 1], health: 100, behaviour: 'chest', minable: 'wooden-chest', category: 'logistics', mineTime: 0.1, chest: { slots: 16 } });
  entities['iron-chest'] = baseEntity({ id: 'iron-chest', size: [1, 1], health: 200, behaviour: 'chest', minable: 'iron-chest', category: 'logistics', mineTime: 0.2, chest: { slots: 32 } });
  entities['steel-chest'] = baseEntity({ id: 'steel-chest', size: [1, 1], health: 350, behaviour: 'chest', minable: 'steel-chest', category: 'logistics', mineTime: 0.2, chest: { slots: 48 } });

  // -- Belts ------------------------------------------------------------
  entities['transport-belt'] = baseEntity({ id: 'transport-belt', size: [1, 1], rotatable: true, health: 150, behaviour: 'belt', minable: 'transport-belt', category: 'logistics', layer: 'belt', collides: false, mineTime: 0.1, belt: { tier: 'yellow', speed: 8 } });
  entities['fast-transport-belt'] = baseEntity({ id: 'fast-transport-belt', size: [1, 1], rotatable: true, health: 160, behaviour: 'belt', minable: 'fast-transport-belt', category: 'logistics', layer: 'belt', collides: false, mineTime: 0.1, belt: { tier: 'fast', speed: 16 } });
  entities['underground-belt'] = baseEntity({ id: 'underground-belt', size: [1, 1], rotatable: true, health: 150, behaviour: 'underground', minable: 'underground-belt', category: 'logistics', layer: 'belt', collides: false, mineTime: 0.1, underground: { tier: 'yellow', speed: 8, maxGap: 4 } });
  entities['fast-underground-belt'] = baseEntity({ id: 'fast-underground-belt', size: [1, 1], rotatable: true, health: 160, behaviour: 'underground', minable: 'fast-underground-belt', category: 'logistics', layer: 'belt', collides: false, mineTime: 0.1, underground: { tier: 'fast', speed: 16, maxGap: 6 } });
  entities['splitter'] = baseEntity({ id: 'splitter', size: [2, 1], rotatable: true, health: 170, behaviour: 'splitter', minable: 'splitter', category: 'logistics', layer: 'belt', collides: false, mineTime: 0.1, splitter: { tier: 'yellow', speed: 8 } });
  entities['fast-splitter'] = baseEntity({ id: 'fast-splitter', size: [2, 1], rotatable: true, health: 180, behaviour: 'splitter', minable: 'fast-splitter', category: 'logistics', layer: 'belt', collides: false, mineTime: 0.1, splitter: { tier: 'fast', speed: 16 } });

  // -- Inserters ----------------------------------------------------------
  // rotationSpeed = turns/tick = 0.5 / half-swing-ticks (GDD §6.7).
  entities['burner-inserter'] = baseEntity({ id: 'burner-inserter', size: [1, 1], rotatable: true, health: 100, behaviour: 'inserter', minable: 'burner-inserter', category: 'logistics', mineTime: 0.1, energy: { type: 'burner', usage: 94.2, drain: 0 }, inserter: { rotationSpeed: 0.01, reach: 1, burner: true, filter: false } });
  entities['inserter'] = baseEntity({ id: 'inserter', size: [1, 1], rotatable: true, health: 150, behaviour: 'inserter', minable: 'inserter', category: 'logistics', mineTime: 0.1, energy: { type: 'electric', usage: 13.2, drain: 0.4 }, inserter: { rotationSpeed: 0.014, reach: 1, burner: false, filter: false } });
  entities['long-handed-inserter'] = baseEntity({ id: 'long-handed-inserter', size: [1, 1], rotatable: true, health: 160, behaviour: 'inserter', minable: 'long-handed-inserter', category: 'logistics', mineTime: 0.1, energy: { type: 'electric', usage: 18.4, drain: 0.4 }, inserter: { rotationSpeed: 0.02, reach: 2, burner: false, filter: false } });
  entities['fast-inserter'] = baseEntity({ id: 'fast-inserter', size: [1, 1], rotatable: true, health: 150, behaviour: 'inserter', minable: 'fast-inserter', category: 'logistics', mineTime: 0.1, energy: { type: 'electric', usage: 46.7, drain: 0.5 }, inserter: { rotationSpeed: 0.04, reach: 1, burner: false, filter: false } });

  // -- Fluids ---------------------------------------------------------------
  entities['pipe'] = baseEntity({ id: 'pipe', size: [1, 1], rotatable: false, health: 100, behaviour: 'pipe', minable: 'pipe', category: 'logistics', mineTime: 0.1, pipe: { capacity: 100 } });
  // pipe-to-ground shares the 'pipe' behaviour (segment/fluidbox rules are identical); the extra
  // `groundPipe` field carries the underground-pairing data the power/fluids module needs.
  entities['pipe-to-ground'] = baseEntity({ id: 'pipe-to-ground', size: [1, 1], rotatable: true, health: 150, behaviour: 'pipe-to-ground', minable: 'pipe-to-ground', category: 'logistics', mineTime: 0.1, pipe: { capacity: 100 }, groundPipe: { tier: 'yellow', maxGap: 9 } });

  // -- Power ------------------------------------------------------------------
  entities['small-electric-pole'] = baseEntity({ id: 'small-electric-pole', size: [1, 1], rotatable: false, health: 100, behaviour: 'pole', minable: 'small-electric-pole', category: 'logistics', collides: false, layer: 'pole', mineTime: 0.1, pole: { reach: 7.5, supply: 2.5 } });
  entities['medium-electric-pole'] = baseEntity({ id: 'medium-electric-pole', size: [1, 1], rotatable: false, health: 100, behaviour: 'pole', minable: 'medium-electric-pole', category: 'logistics', collides: false, layer: 'pole', mineTime: 0.1, pole: { reach: 9, supply: 3.5 } });
  // Footprint simplified to 1x1 (from Factorio's 1x2) per GDD §6.1 row 18.
  entities['offshore-pump'] = baseEntity({ id: 'offshore-pump', size: [1, 1], rotatable: true, health: 150, behaviour: 'offshore-pump', minable: 'offshore-pump', category: 'production', mineTime: 0.1, offshore_pump: { rate: 1200 } });
  entities['boiler'] = baseEntity({ id: 'boiler', size: [3, 2], rotatable: true, health: 200, behaviour: 'boiler', minable: 'boiler', category: 'production', pollution: 30, mineTime: 0.2, energy: { type: 'burner', usage: 1800, drain: 0 }, boiler: { fuelPower: 1800, steamRate: 60 } });
  // N/E only per GDD §6.1 row 20 (S/W are the same shape); allowedDirs is a local extension.
  entities['steam-engine'] = baseEntity({ id: 'steam-engine', size: [3, 5], rotatable: true, allowedDirs: [0, 1], health: 400, behaviour: 'engine', minable: 'steam-engine', category: 'production', mineTime: 0.3, engine: { power: 900, steamRate: 30 } });
  entities['solar-panel'] = baseEntity({ id: 'solar-panel', size: [3, 3], rotatable: false, health: 200, behaviour: 'solar', minable: 'solar-panel', category: 'production', mineTime: 0.2, solar: { peak: 60 } });
  entities['accumulator'] = baseEntity({ id: 'accumulator', size: [2, 2], rotatable: false, health: 150, behaviour: 'accumulator', minable: 'accumulator', category: 'production', mineTime: 0.2, accumulator: { capacity: 5000, flow: 300 } });

  // -- Extraction & smelting ----------------------------------------------
  entities['burner-mining-drill'] = baseEntity({ id: 'burner-mining-drill', size: [2, 2], rotatable: true, health: 150, behaviour: 'drill', minable: 'burner-mining-drill', category: 'production', pollution: 12, mineTime: 0.3, energy: { type: 'burner', usage: 150, drain: 0 }, drill: { speed: 0.25, area: 2, output: [0, -1] } });
  entities['electric-mining-drill'] = baseEntity({ id: 'electric-mining-drill', size: [3, 3], rotatable: true, health: 300, behaviour: 'drill', minable: 'electric-mining-drill', category: 'production', pollution: 10, mineTime: 0.3, energy: { type: 'electric', usage: 90, drain: 3 }, drill: { speed: 0.5, area: 5, output: [1, -1] } });
  entities['stone-furnace'] = baseEntity({ id: 'stone-furnace', size: [2, 2], rotatable: false, health: 200, behaviour: 'furnace', minable: 'stone-furnace', category: 'production', pollution: 2, mineTime: 0.2, energy: { type: 'burner', usage: 90, drain: 0 }, speed: 1, furnace: { speed: 1 } });
  entities['steel-furnace'] = baseEntity({ id: 'steel-furnace', size: [2, 2], rotatable: false, health: 300, behaviour: 'furnace', minable: 'steel-furnace', category: 'production', pollution: 4, mineTime: 0.2, energy: { type: 'burner', usage: 90, drain: 0 }, speed: 2, furnace: { speed: 2 } });

  // -- Machines --------------------------------------------------------------
  // ingredientSlots: GDD says "one per ingredient, no limit"; 6 is a [chosen] generous cap.
  entities['assembling-machine-1'] = baseEntity({ id: 'assembling-machine-1', size: [3, 3], rotatable: false, health: 300, behaviour: 'assembler', minable: 'assembling-machine-1', category: 'production', pollution: 4, mineTime: 0.2, energy: { type: 'electric', usage: 75, drain: 2.5 }, speed: 0.5, assembler: { speed: 0.5, ingredientSlots: 6 } });
  entities['assembling-machine-2'] = baseEntity({ id: 'assembling-machine-2', size: [3, 3], rotatable: false, health: 350, behaviour: 'assembler', minable: 'assembling-machine-2', category: 'production', pollution: 3, mineTime: 0.2, energy: { type: 'electric', usage: 150, drain: 5 }, speed: 0.75, assembler: { speed: 0.75, ingredientSlots: 6 } });
  entities['lab'] = baseEntity({ id: 'lab', size: [3, 3], rotatable: false, health: 150, behaviour: 'lab', minable: 'lab', category: 'production', mineTime: 0.2, energy: { type: 'electric', usage: 60, drain: 2 }, lab: { speed: 1 } });

  // -- Combat ----------------------------------------------------------------- removed, see src/disabled/01_data-combat.js.

  // -- Misc production ---------------------------------------------------------
  entities['radar'] = baseEntity({ id: 'radar', size: [3, 3], rotatable: false, health: 250, behaviour: 'radar', minable: 'radar', category: 'production', mineTime: 0.3, energy: { type: 'electric', usage: 300, drain: 0 }, radar: { reveal: 7, farScanEnergy: 10000000, farScanChunks: 29 } });
  entities['small-lamp'] = baseEntity({ id: 'small-lamp', size: [1, 1], rotatable: false, health: 100, behaviour: 'lamp', minable: 'small-lamp', category: 'logistics', mineTime: 0.1, energy: { type: 'electric', usage: 5, drain: 0 }, lamp: { radius: 10 } });

  // -- Natural (not player-placeable) ------------------------------------------
  // biter-spawner removed, see src/disabled/01_data-combat.js.
  entities['player-corpse'] = baseEntity({ id: 'player-corpse', size: [1, 1], rotatable: false, natural: true, collides: false, health: null, behaviour: 'corpse', minable: null, category: null, mineTime: null, corpse: {} });

  // ---------------------------------------------------------------------
  // 4. TECHNOLOGIES (GDD §8 — 23 techs + solar-energy + electric-energy-accumulators = 25)
  // ---------------------------------------------------------------------
  var R = 'automation-science-pack', G = 'logistic-science-pack';
  function packs(r, g) { var p = [[R, 1]]; if (g) p.push([G, 1]); return p; }

  // Row: [id, prereq[], packs r/g, count, time, unlocks[], effects[], tier]
  var TECH_ROWS = [
    // 8.1 Red-only tier
    ['automation', [], false, 10, 10, ['assembling-machine-1', 'long-handed-inserter'], [], 1],
    ['logistics', [], false, 20, 15, ['underground-belt', 'splitter'], [], 1],
    ['optics', [], false, 10, 15, ['small-lamp'], [], 1],
    ['steel-processing', [], false, 50, 5, ['steel-plate', 'steel-chest'], [], 1],
    ['logistic-science-pack', [], false, 75, 5, ['logistic-science-pack'], [], 1],
    // military, gun-turret, stone-wall techs removed, see src/disabled/01_data-combat.js.
    ['electronics', ['automation'], false, 30, 15, ['radar'], [], 1],
    ['fast-inserter', ['electronics'], false, 30, 15, ['fast-inserter'], [], 1],
    ['steel-axe', ['steel-processing'], false, 50, 30, [], [{ type: 'bonus', key: 'miningBonus', value: 1.0 }], 1],
    // physical-projectile-damage-1, weapon-shooting-speed-1 removed (combat-only).
    // 8.2 Red + green tier
    ['automation-2', ['electronics', 'steel-processing', 'logistic-science-pack'], true, 40, 15, ['assembling-machine-2'], [], 2],
    ['advanced-material-processing', ['steel-processing', 'logistic-science-pack'], true, 75, 30, ['steel-furnace'], [], 2],
    ['electric-energy-distribution-1', ['electronics', 'steel-processing', 'logistic-science-pack'], true, 120, 30, ['medium-electric-pole'], [], 2],
    ['logistics-2', ['logistics', 'logistic-science-pack'], true, 200, 30, ['fast-transport-belt', 'fast-underground-belt', 'fast-splitter'], [], 2],
    // military-2 removed, see src/disabled/01_data-combat.js.
    ['toolbelt', ['logistic-science-pack'], true, 100, 30, [], [{ type: 'bonus', key: 'inventoryBonus', value: 10 }], 2],
    ['research-speed-1', ['automation-2'], true, 100, 30, [], [{ type: 'bonus', key: 'labSpeedBonus', value: 0.20 }], 2],
    ['research-speed-2', ['research-speed-1'], true, 200, 30, [], [{ type: 'bonus', key: 'labSpeedBonus', value: 0.30 }], 2],
    // physical-projectile-damage-2, weapon-shooting-speed-2 removed (combat-only).
    // P1 additions (research/technology-tree.md). electric-energy-accumulators' real prereq
    // "EED 1 + Battery" is simplified to just EED 1: Battery tech/item is out of Factio's scope.
    ['solar-energy', ['steel-processing', 'logistic-science-pack'], true, 250, 30, ['solar-panel'], [], 2],
    ['electric-energy-accumulators', ['electric-energy-distribution-1'], true, 150, 30, ['accumulator'], [], 2],
  ];

  TECH_ROWS.forEach(function (row) {
    var id = row[0], prereq = row[1], green = row[2], count = row[3], time = row[4], unlocks = row[5], effects = row[6], tier = row[7];
    techs[id] = {
      id: id,
      prereq: prereq,
      cost: { packs: packs(0, green), count: count, time: time },
      unlocks: unlocks,
      effects: effects,
      tier: tier,
    };
  });

  // ---------------------------------------------------------------------
  // 5. Order tables (display order in the UI)
  // ---------------------------------------------------------------------
  var itemOrder = ITEM_ROWS.map(function (r) { return r[0]; });
  var recipesByTab = { logistics: [], production: [], intermediate: [], combat: [] };
  RECIPE_ROWS.forEach(function (row) { recipesByTab[recipes[row[0]].tab].push(row[0]); });
  var techOrder = TECH_ROWS.map(function (r) { return r[0]; });

  var startingRecipes = RECIPE_ROWS.filter(function (r) { return r[5] === null; }).map(function (r) { return r[0]; });

  // ---------------------------------------------------------------------
  // 6. Public API + helpers
  // ---------------------------------------------------------------------
  function itemDef(id) { var d = items[id]; if (!d) throw new Error('unknown item id: ' + id); return d; }
  function recipeDef(id) { var d = recipes[id]; if (!d) throw new Error('unknown recipe id: ' + id); return d; }
  function entityDef(id) { var d = entities[id]; if (!d) throw new Error('unknown entity id: ' + id); return d; }
  function techDef(id) { var d = techs[id]; if (!d) throw new Error('unknown tech id: ' + id); return d; }

  // recipe id whose furnace input is `itemId` (category 'smelting'), or null.
  // Called for every candidate item by furnace-feeding inserters each tick, so hits are
  // memoised. Recipes may be registered later at runtime, but they are iterated after the
  // existing ones and so can never displace an earlier match; a hit is re-validated in case
  // its recipe was replaced. Misses are not cached (a later recipe may add a match).
  var smeltingHit = Object.create(null);
  function isSmeltingOf(r, itemId) {
    return r.category === 'smelting' && r.ingredients.length && r.ingredients[0][0] === itemId;
  }
  function smeltingFor(itemId) {
    var hit = smeltingHit[itemId];
    if (hit && recipes[hit.id] === hit && isSmeltingOf(hit, itemId)) return hit;
    for (var id in recipes) {
      var r = recipes[id];
      if (isSmeltingOf(r, itemId)) { smeltingHit[itemId] = r; return r; }
    }
    return null;
  }
  function fuelValue(itemId) { var it = items[itemId]; return it ? (it.fuel || 0) : 0; }
  function isPlaceable(itemId) { var it = items[itemId]; return !!(it && it.place); }

  // pistol/firearm-magazine removed from the starting kit (F.FEATURES.combat
  // off) — see src/disabled/01_data-combat.js for the full-combat kit.
  var startingInventory = [['iron-plate', 8], ['burner-mining-drill', 1], ['stone-furnace', 1], ['wood', 1]];

  // ---------------------------------------------------------------------
  // 6b. F.data.extend(patch) — re-registration hook for disabled content
  // (see src/disabled/README.md). Accepts rows in the exact same shapes as
  // ITEM_ROWS/RECIPE_ROWS/TECH_ROWS above, plus already-built entity def
  // objects (as passed to baseEntity()), so a disabled module can just move
  // its own row tables back in unchanged and call this once. Never called by
  // this build (F.FEATURES.combat is off) — exercised only if combat/i18n
  // content is moved back into src/.
  // ---------------------------------------------------------------------
  function extend(patch) {
    patch = patch || {};
    (patch.items || []).forEach(function (row) {
      var id = row[0];
      var def = {
        id: id, stack: row[1], fuel: row[2], category: row[3],
        place: row[4] || undefined, icon: { shape: row[5], color: row[6], color2: row[7] || null },
      };
      if (row[8]) def.ammo = row[8];
      items[id] = def;
      itemOrder.push(id);
    });
    (patch.recipes || []).forEach(function (row) {
      var id = row[0], ingredients = row[1], results = row[2], time = row[3], category = row[4], unlockedBy = row[5];
      var resultItem = items[results[0][0]];
      var tab = resultItem ? tabForCategory(resultItem.category) : 'intermediate';
      recipes[id] = { id: id, ingredients: ingredients, results: results, time: time, category: category, hand: category === 'crafting', tab: tab, unlockedBy: unlockedBy };
      if (!recipesByTab[tab]) recipesByTab[tab] = [];
      recipesByTab[tab].push(id);
    });
    (patch.entities || []).forEach(function (def) { entities[def.id] = baseEntity(def); });
    (patch.techs || []).forEach(function (row) {
      var id = row[0], prereq = row[1], green = row[2], count = row[3], time = row[4], unlocks = row[5], effects = row[6], tier = row[7];
      techs[id] = { id: id, prereq: prereq, cost: { packs: packs(0, green), count: count, time: time }, unlocks: unlocks, effects: effects, tier: tier };
      techOrder.push(id);
    });
    // Patch an existing tech's unlocks list (e.g. 'electronics' loses
    // 'repair-pack' when combat is off; extend() adds it back).
    if (patch.techUnlockAdditions) {
      Object.keys(patch.techUnlockAdditions).forEach(function (tid) {
        if (techs[tid]) techs[tid].unlocks = techs[tid].unlocks.concat(patch.techUnlockAdditions[tid]);
      });
    }
    if (Array.isArray(patch.startingInventory)) {
      patch.startingInventory.forEach(function (pair) { startingInventory.push(pair); });
    }
    if (Array.isArray(patch.startingRecipes)) {
      patch.startingRecipes.forEach(function (id) { startingRecipes.push(id); });
    }
    runSelfCheck();
  }

  F.data = {
    items: items,
    recipes: recipes,
    entities: entities,
    techs: techs,
    order: { items: itemOrder, recipesByTab: recipesByTab, techs: techOrder },
    startingRecipes: startingRecipes,
    startingInventory: startingInventory,
    itemDef: itemDef,
    recipeDef: recipeDef,
    entityDef: entityDef,
    techDef: techDef,
    smeltingFor: smeltingFor,
    fuelValue: fuelValue,
    isPlaceable: isPlaceable,
    extend: extend,
  };

  // ---------------------------------------------------------------------
  // 7. Self-check (load-time; logs warnings only, never throws). Factored
  // into a named function so F.data.extend() can re-run it after merging
  // disabled content back in (see above).
  // ---------------------------------------------------------------------
  function runSelfCheck() {
    var warn = (F.log && F.log.warn) ? F.log.warn : function () {};
    var w = 0;
    function check(cond, msg) { if (!cond) { warn('[01-data] ' + msg); w++; } }

    Object.keys(recipes).forEach(function (rid) {
      var r = recipes[rid];
      r.ingredients.forEach(function (ing) { check(!!items[ing[0]], 'recipe ' + rid + ': unknown ingredient ' + ing[0]); });
      r.results.forEach(function (res) { check(!!items[res[0]], 'recipe ' + rid + ': unknown result ' + res[0]); });
      if (r.unlockedBy) check(!!techs[r.unlockedBy], 'recipe ' + rid + ': unknown unlockedBy tech ' + r.unlockedBy);
    });

    Object.keys(entities).forEach(function (eid) {
      var e = entities[eid];
      if (!e.natural) check(items[eid] && items[eid].place === eid, 'entity ' + eid + ': no item with place === ' + eid);
    });

    Object.keys(items).forEach(function (iid) {
      var it = items[iid];
      if (it.place) check(!!entities[it.place], 'item ' + iid + ': place references unknown entity ' + it.place);
    });

    Object.keys(techs).forEach(function (tid) {
      var t = techs[tid];
      t.prereq.forEach(function (p) { check(!!techs[p], 'tech ' + tid + ': unknown prereq ' + p); });
      t.unlocks.forEach(function (u) { check(!!recipes[u], 'tech ' + tid + ': unknown unlocked recipe ' + u); });
      t.cost.packs.forEach(function (p) { check(!!items[p[0]], 'tech ' + tid + ': unknown pack item ' + p[0]); });
    });

    if (w === 0) { if (F.log && F.log.info) F.log.info('[01-data] self-check passed: ' + Object.keys(items).length + ' items, ' + Object.keys(recipes).length + ' recipes, ' + Object.keys(entities).length + ' entities, ' + Object.keys(techs).length + ' techs'); }
  }
  runSelfCheck();
})();
