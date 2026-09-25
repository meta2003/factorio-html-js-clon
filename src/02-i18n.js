// 02-i18n.js — language mechanism (F.i18n, F.t) plus the full English string table
// (item/entity/tech names & descriptions, crafting-tab captions, entity status
// strings, alert strings and the in-game "Instructions" help text).
// See design/ARCHITECTURE.md §4.
//
// Disabled features (see src/disabled/README.md): this build is English-only.
// Slovenian used to be the default/only other language; its full string table
// (this file's own table, plus every other module's local F.i18n.add('sl', ...)
// block) now lives in src/disabled/02-i18n-sl.js, unregistered. The Slovenian
// names/descriptions for combat-only items/entities/techs live alongside the
// rest of the disabled combat content in src/disabled/01_data-combat.js instead.
(function () {
  'use strict';

  // ---------------------------------------------------------------------
  // Core mechanism — English only (task: "switch off i18n — the game should
  // be English only"). F.t()/F.i18n stay in place so other modules keep
  // working unmodified, and so src/disabled/02-i18n-sl.js can re-register a
  // 'sl' table if this is ever re-enabled (see src/disabled/README.md).
  // ---------------------------------------------------------------------

  var LANGS = ['en'];
  var currentLang = 'en';

  // One flat key->string map per language; F.i18n.add merges keys into these.
  var tables = { en: Object.create(null) };

  F.i18n = {
    lang: currentLang,
    langs: LANGS.slice(),

    // Merge a table of {key: string} into the given language. Called by every
    // module (including this one) at load time to register its own strings.
    // Re-enabling another language (see src/disabled/README.md) just needs
    // `tables[lang] = Object.create(null)` added back here and `lang` added to
    // LANGS — `add` itself already tolerates any language present in `tables`.
    add: function (lang, table) {
      if (!tables[lang]) { F.log.warn('i18n: unknown language', lang); return; }
      var dst = tables[lang];
      for (var k in table) {
        if (Object.prototype.hasOwnProperty.call(table, k)) dst[k] = table[k];
      }
    },

    // True when a key is defined for the current language, or would resolve
    // via the English fallback (matches what F.t() would actually return).
    has: function (key) {
      return Object.prototype.hasOwnProperty.call(tables[currentLang], key) ||
             Object.prototype.hasOwnProperty.call(tables.en, key);
    },

    // Only 'en' is a supported language in this build — no-op otherwise
    // (kept so 71-ui-windows.js and callers do not need a guard).
    setLang: function (lang) {
      if (LANGS.indexOf(lang) < 0) { F.log.warn('i18n: unknown language', lang); return; }
    },
  };

  // F.t(key, params?) -> table[lang][key] ?? table.en[key] ?? key
  // params is an object whose keys are substituted for "{key}" in the string
  // (covers both named placeholders like {n} and positional ones like {0}).
  F.t = function (key, params) {
    var s = tables[currentLang][key];
    if (s === undefined) s = tables.en[key];
    if (s === undefined) return key;
    if (params) {
      for (var p in params) {
        if (Object.prototype.hasOwnProperty.call(params, p)) {
          s = s.split('{' + p + '}').join(String(params[p]));
        }
      }
    }
    return s;
  };

  // ---------------------------------------------------------------------
  // English string table.
  // ---------------------------------------------------------------------
  var EN = Object.create(null);

  // Items
  EN["item.accumulator"] = "Accumulator";
  EN["item.accumulator.desc"] = "Stores up to 5 MJ of surplus electricity for use at night, up to 300 kW flow. Stack: 50.";
  EN["item.assembling-machine-1"] = "Assembling machine 1";
  EN["item.assembling-machine-1.desc"] = "Crafts a chosen recipe automatically, crafting speed 0.5. Stack: 50.";
  EN["item.assembling-machine-2"] = "Assembling machine 2";
  EN["item.assembling-machine-2.desc"] = "A faster machine, crafting speed 0.75, unlocked by Automation 2. Stack: 50.";
  EN["item.automation-science-pack"] = "Automation science pack";
  EN["item.automation-science-pack.desc"] = "The red science pack, consumed by labs for research. Stack: 200.";
  EN["item.boiler"] = "Boiler";
  EN["item.boiler.desc"] = "Fuel-powered, turns water into steam, 1.8 MW. Stack: 50.";
  EN["item.burner-inserter"] = "Burner inserter";
  EN["item.burner-inserter.desc"] = "Moves items between buildings; powered by coal or wood. Stack: 50.";
  EN["item.burner-mining-drill"] = "Burner mining drill";
  EN["item.burner-mining-drill.desc"] = "Mines ore, powered by coal or wood, 0.25 ore/s. Stack: 50.";
  EN["item.coal"] = "Coal";
  EN["item.coal.desc"] = "Fuel (4 MJ) burned by every fuel-powered machine; also used in several recipes. Stack: 50.";
  EN["item.copper-cable"] = "Copper cable";
  EN["item.copper-cable.desc"] = "Made from copper plate (2 per craft); an ingredient in circuits and poles. Stack: 200.";
  EN["item.copper-ore"] = "Copper ore";
  EN["item.copper-ore.desc"] = "Raw resource mined from copper ore patches; smelted into a copper plate in a furnace. Stack: 50.";
  EN["item.copper-plate"] = "Copper plate";
  EN["item.copper-plate.desc"] = "Smelted from copper ore; used for cable and circuits. Stack: 100.";
  EN["item.electric-mining-drill"] = "Electric mining drill";
  EN["item.electric-mining-drill.desc"] = "A faster, electric drill, 0.5 ore/s. Stack: 50.";
  EN["item.electronic-circuit"] = "Electronic circuit";
  EN["item.electronic-circuit.desc"] = "Made from iron plate and copper cable; an ingredient in more advanced machines. Stack: 200.";
  EN["item.fast-inserter"] = "Fast inserter";
  EN["item.fast-inserter.desc"] = "A fast inserter, 2.31 items/s, unlocked by research. Stack: 50.";
  EN["item.fast-splitter"] = "Fast splitter";
  EN["item.fast-splitter.desc"] = "The fast version of the splitter, 30 items/s per belt. Stack: 50.";
  EN["item.fast-transport-belt"] = "Fast transport belt";
  EN["item.fast-transport-belt.desc"] = "A twice as fast belt, 30 items/s; unlocked by Logistics 2. Stack: 100.";
  EN["item.fast-underground-belt"] = "Fast underground belt";
  EN["item.fast-underground-belt.desc"] = "The fast version of the underground belt; gap up to 6 tiles. Stack: 50.";
  EN["item.inserter"] = "Inserter";
  EN["item.inserter.desc"] = "An electric inserter, 0.83 items/s. Stack: 50.";
  EN["item.iron-chest"] = "Iron chest";
  EN["item.iron-chest.desc"] = "A chest with 32 slots, sturdier than the wooden one. Stack: 50.";
  EN["item.iron-gear-wheel"] = "Iron gear wheel";
  EN["item.iron-gear-wheel.desc"] = "A basic mechanical part, an ingredient in most machines and inserters. Stack: 100.";
  EN["item.iron-ore"] = "Iron ore";
  EN["item.iron-ore.desc"] = "Raw resource mined from iron ore patches; smelted into an iron plate in a furnace. Stack: 50.";
  EN["item.iron-plate"] = "Iron plate";
  EN["item.iron-plate.desc"] = "Smelted from iron ore; the basic building block for gears, sticks and most machines. Stack: 100.";
  EN["item.iron-stick"] = "Iron stick";
  EN["item.iron-stick.desc"] = "Made from iron plate (2 per craft); an ingredient for the medium electric pole. Stack: 100.";
  EN["item.lab"] = "Lab";
  EN["item.lab.desc"] = "Consumes science packs to advance the current research. Stack: 10.";
  EN["item.logistic-science-pack"] = "Logistic science pack";
  EN["item.logistic-science-pack.desc"] = "The green science pack, needed for more advanced research. Stack: 200.";
  EN["item.long-handed-inserter"] = "Long-handed inserter";
  EN["item.long-handed-inserter.desc"] = "An inserter with a reach of 2 tiles, unlocked by Automation. Stack: 50.";
  EN["item.medium-electric-pole"] = "Medium electric pole";
  EN["item.medium-electric-pole.desc"] = "A wider supply area and wire reach of 9 tiles; unlocked by Electric energy distribution 1. Stack: 50.";
  EN["item.offshore-pump"] = "Offshore pump";
  EN["item.offshore-pump.desc"] = "Pumps water from a lake or sea, 1200 water/s. Stack: 20.";
  EN["item.pipe"] = "Pipe";
  EN["item.pipe-to-ground"] = "Pipe to ground";
  EN["item.pipe-to-ground.desc"] = "A pair of pipes that carry a pipeline under an obstacle; range up to 10 tiles. Stack: 50.";
  EN["item.pipe.desc"] = "Carries water or steam between machines; capacity 100 per segment. Stack: 100.";
  EN["item.radar"] = "Radar";
  EN["item.radar.desc"] = "Charts nearby map chunks and gradually scans farther ones. Stack: 50.";
  EN["item.small-electric-pole"] = "Small electric pole";
  EN["item.small-electric-pole.desc"] = "Links nearby machines into an electric network; wire reach 7.5 tiles. Stack: 50.";
  EN["item.small-lamp"] = "Small lamp";
  EN["item.small-lamp.desc"] = "Lights a 10-tile radius around itself at night. Stack: 50.";
  EN["item.solar-panel"] = "Solar panel";
  EN["item.solar-panel.desc"] = "Produces up to 60 kW of electricity during the day, no fuel needed; unlocked by Solar energy. Stack: 10.";
  EN["item.splitter"] = "Splitter";
  EN["item.splitter.desc"] = "Evenly splits items between two neighbouring belts. Stack: 50.";
  EN["item.steam-engine"] = "Steam engine";
  EN["item.steam-engine.desc"] = "Converts steam into electricity, up to 900 kW. Stack: 10.";
  EN["item.steel-chest"] = "Steel chest";
  EN["item.steel-chest.desc"] = "A chest with 48 slots, requires Steel processing. Stack: 50.";
  EN["item.steel-furnace"] = "Steel furnace";
  EN["item.steel-furnace.desc"] = "A faster furnace, crafting speed 2, unlocked by Steel processing. Stack: 50.";
  EN["item.steel-plate"] = "Steel plate";
  EN["item.steel-plate.desc"] = "Smelted from 5 iron plates after researching Steel processing; a tougher material. Stack: 100.";
  EN["item.stone"] = "Stone";
  EN["item.stone-brick"] = "Stone brick";
  EN["item.stone-brick.desc"] = "Smelted from stone; used for the steel furnace. Stack: 100.";
  EN["item.stone-furnace"] = "Stone furnace";
  EN["item.stone-furnace.desc"] = "Smelts ore into plates, crafting speed 1. Stack: 50.";
  EN["item.stone.desc"] = "Raw resource used to build stone furnaces and, once smelted, stone brick. Stack: 50.";
  EN["item.transport-belt"] = "Transport belt";
  EN["item.transport-belt.desc"] = "Moves items along two lanes at 15 items/s. Stack: 100.";
  EN["item.underground-belt"] = "Underground belt";
  EN["item.underground-belt.desc"] = "A pair of tunnels that carry a belt under an obstacle; gap up to 4 tiles. Stack: 50.";
  EN["item.wood"] = "Wood";
  EN["item.wood.desc"] = "Chopped from trees; a fuel (2 MJ) and an ingredient for poles and chests. Stack: 100.";
  EN["item.wooden-chest"] = "Wooden chest";
  EN["item.wooden-chest.desc"] = "A chest with 16 slots for storing any item. Stack: 50.";

  // Entities
  EN["ent.accumulator"] = "Accumulator";
  EN["ent.accumulator.desc"] = "2×2, stores up to 5 MJ of electricity for use at night, up to 300 kW flow.";
  EN["ent.assembling-machine-1"] = "Assembling machine 1";
  EN["ent.assembling-machine-1.desc"] = "3×3, electric (75 kW), crafts a chosen recipe at speed 0.5; pollution 4/min.";
  EN["ent.assembling-machine-2"] = "Assembling machine 2";
  EN["ent.assembling-machine-2.desc"] = "3×3, electric (150 kW), speed 0.75, requires Automation 2; pollution 3/min.";
  EN["ent.big-rock"] = "Big rock";
  EN["ent.big-rock.desc"] = "2×2 rock; mine it (hold RMB) for stone.";
  EN["ent.boiler"] = "Boiler";
  EN["ent.boiler.desc"] = "3×2, fuel-powered (1.8 MW), turns water into steam; pollution 30/min.";
  EN["ent.burner-inserter"] = "Burner inserter";
  EN["ent.burner-inserter.desc"] = "1×1, fuel-powered arm; picks up an item behind itself and drops it in front, 0.60 items/s.";
  EN["ent.burner-mining-drill"] = "Burner mining drill";
  EN["ent.burner-mining-drill.desc"] = "2×2, fuel-powered (150 kW), mines 0.25 ore/s over its own 2×2 area; pollution 12/min.";
  EN["ent.dead-tree"] = "Dead tree";
  EN["ent.dead-tree.desc"] = "A dead tree, yields less wood than a live tree but is quicker to fell.";
  EN["ent.electric-mining-drill"] = "Electric mining drill";
  EN["ent.electric-mining-drill.desc"] = "3×3, electric (90 kW), mines 0.5 ore/s over a 5×5 area; pollution 10/min.";
  EN["ent.fast-inserter"] = "Fast inserter";
  EN["ent.fast-inserter.desc"] = "1×1, fast arm, 46.7 kW, 2.31 items/s.";
  EN["ent.fast-splitter"] = "Fast splitter";
  EN["ent.fast-splitter.desc"] = "2×1, fast version of the splitter, 30 items/s per belt.";
  EN["ent.fast-transport-belt"] = "Fast transport belt";
  EN["ent.fast-transport-belt.desc"] = "1×1, twice as fast belt, 30 items/s.";
  EN["ent.fast-underground-belt"] = "Fast underground belt";
  EN["ent.fast-underground-belt.desc"] = "Fast version of the underground belt; gap up to 6 tiles.";
  EN["ent.ground-item"] = "Item on ground";
  EN["ent.ground-item.desc"] = "A stack of one item lying on the ground; pick it up with F.";
  EN["ent.huge-rock"] = "Huge rock";
  EN["ent.huge-rock.desc"] = "3×2 rock with a large amount of stone.";
  EN["ent.inserter"] = "Inserter";
  EN["ent.inserter.desc"] = "1×1, electric arm, 13.2 kW, 0.83 items/s.";
  EN["ent.iron-chest"] = "Iron chest";
  EN["ent.iron-chest.desc"] = "1×1 chest with 32 slots, sturdier than the wooden one.";
  EN["ent.lab"] = "Lab";
  EN["ent.lab.desc"] = "3×3, electric (60 kW), consumes science packs for the current research.";
  EN["ent.long-handed-inserter"] = "Long-handed inserter";
  EN["ent.long-handed-inserter.desc"] = "1×1, reach of 2 tiles, 18.4 kW, 1.20 items/s.";
  EN["ent.medium-electric-pole"] = "Medium electric pole";
  EN["ent.medium-electric-pole.desc"] = "1×1, supply area 7×7, wire reach 9 tiles.";
  EN["ent.offshore-pump"] = "Offshore pump";
  EN["ent.offshore-pump.desc"] = "1×1, must face water, pumps 1200 water/s with no power needed.";
  EN["ent.pipe"] = "Pipe";
  EN["ent.pipe-to-ground"] = "Pipe to ground";
  EN["ent.pipe-to-ground.desc"] = "A pair of pipes under an obstacle; range up to 10 tiles.";
  EN["ent.pipe.desc"] = "1×1, carries water or steam, capacity 100, connects on all 4 sides.";
  EN["ent.player"] = "Engineer";
  EN["ent.player-corpse"] = "Player corpse";
  EN["ent.player-corpse.desc"] = "A corpse holding the player's inventory after death.";
  EN["ent.player.desc"] = "The engineer you play as; 250 health, an 80-slot inventory.";
  EN["ent.radar"] = "Radar";
  EN["ent.radar.desc"] = "3×3, electric (300 kW), charts nearby and distant parts of the map.";
  EN["ent.small-electric-pole"] = "Small electric pole";
  EN["ent.small-electric-pole.desc"] = "1×1, supply area 5×5, wire reach 7.5 tiles.";
  EN["ent.small-lamp"] = "Small lamp";
  EN["ent.small-lamp.desc"] = "1×1, electric (5 kW), lights a 10-tile radius at night.";
  EN["ent.solar-panel"] = "Solar panel";
  EN["ent.solar-panel.desc"] = "3×3, produces up to 60 kW of electricity during the day, no fuel needed.";
  EN["ent.splitter"] = "Splitter";
  EN["ent.splitter.desc"] = "2×1, evenly splits items between two output belts.";
  EN["ent.steam-engine"] = "Steam engine";
  EN["ent.steam-engine.desc"] = "3×5, converts steam into up to 900 kW of electricity, consuming up to 30 steam/s.";
  EN["ent.steel-chest"] = "Steel chest";
  EN["ent.steel-chest.desc"] = "1×1 chest with 48 slots, the sturdiest, requires Steel processing.";
  EN["ent.steel-furnace"] = "Steel furnace";
  EN["ent.steel-furnace.desc"] = "2×2, fuel-powered (90 kW), smelts at speed 2, requires Steel processing; pollution 4/min.";
  EN["ent.stone-furnace"] = "Stone furnace";
  EN["ent.stone-furnace.desc"] = "2×2, fuel-powered (90 kW), smelts ore into plates at speed 1; pollution 2/min.";
  EN["ent.transport-belt"] = "Transport belt";
  EN["ent.transport-belt.desc"] = "1×1, carries items on two lanes at 15 items/s; needs no power.";
  EN["ent.tree"] = "Tree";
  EN["ent.tree.desc"] = "A natural obstacle; chop it (hold RMB) to get wood.";
  EN["ent.underground-belt"] = "Underground belt";
  EN["ent.underground-belt.desc"] = "A pair of tunnels under an obstacle; gap up to 4 tiles, needs no power.";
  EN["ent.wooden-chest"] = "Wooden chest";
  EN["ent.wooden-chest.desc"] = "1×1 chest with 16 slots for any item; needs no power.";

  // Technologies
  EN["tech.advanced-material-processing"] = "Advanced material processing";
  EN["tech.advanced-material-processing.desc"] = "Cost 75 automation + 75 logistic science packs. Unlocks the steel furnace.";
  EN["tech.automation"] = "Automation";
  EN["tech.automation-2"] = "Automation 2";
  EN["tech.automation-2.desc"] = "Cost 40 automation + 40 logistic science packs. Unlocks assembling machine 2.";
  EN["tech.automation.desc"] = "Cost 10 automation science packs. Unlocks assembling machine 1 and the long-handed inserter.";
  EN["tech.electric-energy-accumulators"] = "Electric energy accumulators";
  EN["tech.electric-energy-accumulators.desc"] = "Unlocks the accumulator, which stores surplus electricity for use at night.";
  EN["tech.electric-energy-distribution-1"] = "Electric energy distribution 1";
  EN["tech.electric-energy-distribution-1.desc"] = "Cost 120 automation + 120 logistic science packs. Unlocks the medium electric pole.";
  EN["tech.electronics"] = "Electronics";
  EN["tech.electronics.desc"] = "Cost 30 automation science packs, requires Automation. Unlocks the radar.";
  EN["tech.fast-inserter"] = "Fast inserter";
  EN["tech.fast-inserter.desc"] = "Cost 30 automation science packs, requires Electronics. Unlocks the fast inserter.";
  EN["tech.logistic-science-pack"] = "Logistic science pack";
  EN["tech.logistic-science-pack.desc"] = "Cost 75 automation science packs. Unlocks crafting the logistic science pack.";
  EN["tech.logistics"] = "Logistics";
  EN["tech.logistics-2"] = "Logistics 2";
  EN["tech.logistics-2.desc"] = "Cost 200 automation + 200 logistic science packs. Unlocks the fast belt, fast underground belt and fast splitter.";
  EN["tech.logistics.desc"] = "Cost 20 automation science packs. Unlocks the underground belt and the splitter.";
  EN["tech.optics"] = "Optics";
  EN["tech.optics.desc"] = "Cost 10 automation science packs. Unlocks the small lamp.";
  EN["tech.research-speed-1"] = "Lab research speed 1";
  EN["tech.research-speed-1.desc"] = "Cost 100 automation + 100 logistic science packs. Increases research speed by 20%.";
  EN["tech.research-speed-2"] = "Lab research speed 2";
  EN["tech.research-speed-2.desc"] = "Cost 200 automation + 200 logistic science packs. Increases research speed by a further 30%.";
  EN["tech.solar-energy"] = "Solar energy";
  EN["tech.solar-energy.desc"] = "Unlocks the solar panel, which produces electricity during the day with no fuel.";
  EN["tech.steel-axe"] = "Steel axe";
  EN["tech.steel-axe.desc"] = "Cost 50 automation science packs, requires Steel processing. Doubles hand mining speed.";
  EN["tech.steel-processing"] = "Steel processing";
  EN["tech.steel-processing.desc"] = "Cost 50 automation science packs. Unlocks steel plate and the steel chest.";
  EN["tech.toolbelt"] = "Toolbelt";
  EN["tech.toolbelt.desc"] = "Cost 100 automation + 100 logistic science packs. Increases inventory size by 10 slots.";

  // Crafting-tab captions
  EN["cat.combat"] = "Combat";
  EN["cat.intermediate"] = "Intermediate products";
  EN["cat.logistics"] = "Logistics";
  EN["cat.production"] = "Production";
  EN["cat.resource"] = "Resources";
  EN["cat.science"] = "Science";

  // Entity statuses
  EN["status.idle"] = "Idle";
  EN["status.low_power"] = "Low power";
  EN["status.missing_science_packs"] = "Missing science packs";
  EN["status.no_fuel"] = "No fuel";
  EN["status.no_ingredients"] = "No ingredients";
  EN["status.no_minable_resources"] = "No minable resources";
  EN["status.no_pair"] = "No pair";
  EN["status.no_power"] = "No power";
  EN["status.no_recipe"] = "No recipe";
  EN["status.no_research"] = "No research in progress";
  EN["status.no_steam"] = "No steam";
  EN["status.no_water"] = "No water";
  EN["status.not_connected"] = "Not connected to a network";
  EN["status.output_full"] = "Output full";
  EN["status.waiting_for_source"] = "Waiting for source items";
  EN["status.waiting_for_space"] = "Waiting for space in destination";
  EN["status.working"] = "Working";

  // Alerts
  EN["alert.attack"] = "Objects under attack!";
  EN["alert.entity_destroyed"] = "Objects destroyed";
  EN["alert.inventory_full"] = "Inventory is full";
  EN["alert.no_fuel"] = "Machines out of fuel";
  EN["alert.no_power"] = "Machines without power";
  EN["alert.research_done"] = "Research finished";

  // In-game instructions ("Instructions"/help panel). Combat/biter/turret/
  // wall/ammunition/pistol advice removed (task A.5 — combat is disabled).
  EN["help.title"] = "Factio game instructions";
  EN["help.controls"] = "Movement: W A S D.\n\nBuilding and mining: pick an item from the inventory or the quickbar (keys 1–10); left click (LMB) places it in the world; hold the left button and drag the mouse to continuously place belts, pipes, walls and poles. Holding the right mouse button (RMB) over ore, a tree, a rock or your own building mines or picks it up.\n\nRotation: R rotates the item in your hand or a placed building clockwise, Shift+R counter-clockwise. Pipette: Q over a building grabs the same item from your inventory into your hand; Q with a full hand empties it.\n\nGhosts (planned buildings): Shift+click (or Shift+drag) with an item in your hand places a blue ghost instead of the building, without using the item. Pipette (Q) or a quickbar key on an item you have none of gives you a ghost cursor that only places ghosts. Left click a ghost with an empty hand to build it from your inventory; right click a ghost to cancel it (from any distance). Building the same item on top of a ghost also fulfils it.\n\nBlueprints: Ctrl+C (or B) turns the cursor into a copy tool — drag a box over buildings and ghosts to copy them, recipes and settings included. The copy is then held in your hand: R / Shift+R rotates it, left click pastes it as ghosts (parts that do not fit show red and are skipped), Q or Esc drops it. Ctrl+V takes the last copy back into your hand. Right click cancels the copy tool. L (or the Blueprints button under the minimap) opens the blueprint library: save the blueprint in your hand under a name, take saved ones back into your hand, and export/import blueprint strings (text starting with FB1) to share them. The library is kept in this browser, across all your games.\n\nDeconstruction: X gives you the deconstruction planner — drag a box to mark buildings, trees and rocks (red cross) for construction robots to take down; Shift+drag cancels marks; ghosts in the box are removed at once. Ctrl+X cuts: copies the area into your hand and marks its buildings. Ghosts may be planned over trees and rocks, which are then marked automatically.\n\nWindows: E opens the inventory and crafting screen (and closes any open window), T opens technologies, M opens the map, H or F1 opens the Instructions, Esc closes the current window or opens the menu.\n\nItems on the ground: F picks them up within a one-tile radius, Z drops one item from your hand onto the ground or belt under the cursor.\n\nTransferring items in windows: Shift+click moves a whole stack to the other open inventory, Ctrl+click moves every item of that type; Ctrl+click on a world building with no window open is a quick transfer.\n\nOther: the mouse wheel zooms the view in and out, Ctrl+S saves immediately, the quickbar uses keys 1–10.";
  EN["help.basics"] = "At the start you have a stone furnace, a burner mining drill and a little iron — enough for the first steps.\n\n1. Find ore. Iron, copper, coal and stone deposits grow around you; check the map (M) to spot them. Hold the right mouse button (RMB) to mine some stone and coal by hand before you start building.\n\n2. Place a stone furnace (needs 5 stone) and the burner mining drill you already carry. Rotate the drill (R) so its arrow points straight into the furnace — mined ore then goes straight in, with no belt or inserter needed. Put coal into both the drill and the furnace as fuel.\n\n3. This basic drill+furnace pair gives you your first iron and copper plates. Place a wooden chest (2 wood) next to the furnace as temporary storage for plates until you have belts. Two coal-burning drills facing each other refuel themselves, so you never have to feed them coal by hand.";
  EN["help.progression"] = "4. Craft transport belts (1 iron plate + 1 gear wheel → 2 belts) and burner inserters. A belt carries coal past the furnaces and drills, and the inserters load it in for you — no more carrying fuel by hand.\n\n5. Power: place an offshore pump by a lake (it must face the water), connect it with pipes to a boiler, and have the boiler feed two steam engines (ratio 1 boiler : 2 engines = 1.8 MW). Place small electric poles (1 wood + 2 copper cable → 2 poles) so their supply areas cover your machines.\n\n6. Once you have power, replace burner drills with electric drills and burner inserters with regular inserters — they need no fuel and work faster.\n\n7. Build a lab (10 circuits + 10 gears + 4 belts) and hand-craft 10 automation science packs (1 copper + 1 gear each). Research Automation (T) — it unlocks assembling machine 1 and the long-handed inserter.\n\n8. Have assembling machine 1 produce gears and circuits, then automation science packs, and belt them to your labs.\n\n9. Research the Logistic science pack (75 automation packs). A logistic pack needs 1 inserter + 1 belt; aim for a ratio of 5 automation-pack machines to 6 logistic-pack machines.\n\n10. From there: Steel processing, Automation 2 and Logistics 2 for a more efficient factory.";
  EN["help.ratios"] = "Power: 1 boiler drives exactly 2 steam engines (1.8 MW combined); a single offshore pump (1200 water/s) can supply up to 20 boilers, i.e. up to 40 steam engines, before it runs out of water.\n\nBelts: one fully loaded yellow belt (15 items/s) matches the output of 48 stone furnaces, 30 electric mining drills, or 60 burner mining drills running at full speed.\n\nMining and smelting: one electric mining drill (0.5 ore/s) roughly feeds 1.6 stone furnaces (a furnace consumes ore at 1 plate per 3.2 s); for cable-to-circuit production aim for roughly 3 copper-cable machines per 2 electronic-circuit machines.\n\nScience: aim for a ratio of 5 automation-science-pack machines to 6 logistic-science-pack machines (an automation pack takes 5 s, a logistic pack 6 s at speed 1) — this keeps labs supplied evenly with both pack types; one automation-pack machine (one pack per 10 s in assembling machine 1) roughly matches the consumption of one lab.\n\nFuel: a furnace burns 1 coal roughly every 44 s, a burner mining drill 1 coal roughly every 27 s, and a boiler 1 coal for roughly every 2.2 s of steam produced.";
  EN["help.tips"] = "- An inserter picks an item up BEHIND itself and drops it IN FRONT (the arrow is visible in alt-mode); onto a belt it always drops on the far lane.\n- A mining drill places mined ore on the tile in front of its arrow — onto a belt, into a chest, into a furnace or into whatever other machine is there.\n- A furnace picks its own recipe from the input item: iron ore → plate, 2 stone → brick, 5 iron plates → steel (once Steel processing is researched).\n- A yellow light above a machine means its output is full or it is short of power; a red light means it is out of fuel, power or ore.\n- If your machines seem slower than expected, check an electric pole — network satisfaction should be as close to 100% as possible.\n- The game autosaves every minute; for a backup, use Esc → Export save and copy the text somewhere safe.\n- Shift+click and Ctrl+click speed up working with chests and machines — you don't need to move items one at a time.";
  EN["help.entities"] = "Burner mining drill: 2×2, runs on coal or wood, mines 0.25 ore/s over its 2×2 area.\nStone furnace: 2×2, runs on coal or wood, smelts one ore into a plate every 3.2 s.\nTransport belt: carries items on two lanes at 15 items/s.\nBurner inserter: picks an item up behind itself and drops it in front, powered by coal or wood.\nOffshore pump: placed next to water, pumps 1200 water/s into the pipe network.\nBoiler: turns water into steam using coal or wood, 1.8 MW.\nSteam engine: converts steam into up to 900 kW of electricity.\nSmall electric pole: links nearby machines and other poles into an electric network, wire reach 7.5 tiles.\nLab: consumes science packs to advance the selected research.\nAssembling machine 1: crafts the chosen recipe from its ingredients, speed 0.5.";

  F.i18n.add('en', EN);
})();
