// 06-i18n-expansion.js — English strings for the expansion (oil, trains, logistic robots,
// rocket silo): item/entity/tech names & descriptions, fluid names, recipe names for
// recipes whose id differs from (or has no) matching result item, new status/reason
// strings, and help text for the four new help tabs. See design/EXPANSION.md.
// Loads after 02-i18n.js (file sort order) so F.i18n.add already exists.
(function () {
  'use strict';

  var EN = Object.create(null);

  // ---------------------------------------------------------------------
  // Fluids
  // ---------------------------------------------------------------------
  EN['fluid.water'] = 'Water';
  EN['fluid.steam'] = 'Steam';
  EN['fluid.crude-oil'] = 'Crude oil';
  EN['fluid.heavy-oil'] = 'Heavy oil';
  EN['fluid.light-oil'] = 'Light oil';
  EN['fluid.petroleum-gas'] = 'Petroleum gas';
  EN['fluid.lubricant'] = 'Lubricant';
  EN['fluid.sulfuric-acid'] = 'Sulfuric acid';

  // ---------------------------------------------------------------------
  // Items
  // ---------------------------------------------------------------------
  EN['item.plastic-bar'] = 'Plastic bar';
  EN['item.plastic-bar.desc'] = 'Made from coal and petroleum gas in a chemical plant; an ingredient in advanced circuits and structures. Stack: 100.';
  EN['item.sulfur'] = 'Sulfur';
  EN['item.sulfur.desc'] = 'Made from water and petroleum gas in a chemical plant; used for sulfuric acid and chemical science packs. Stack: 50.';
  EN['item.solid-fuel'] = 'Solid fuel';
  EN['item.solid-fuel.desc'] = 'A dense fuel (12 MJ) made from petroleum gas or light oil; also the base ingredient for rocket fuel. Stack: 50.';
  EN['item.battery'] = 'Battery';
  EN['item.battery.desc'] = 'Made from iron plate, copper plate and sulfuric acid; an ingredient in robots and rocket control units. Stack: 200.';
  EN['item.engine-unit'] = 'Engine unit';
  EN['item.engine-unit.desc'] = 'A steel-and-gear mechanical engine, an ingredient in locomotives and electric engine units. Stack: 50.';
  EN['item.electric-engine-unit'] = 'Electric engine unit';
  EN['item.electric-engine-unit.desc'] = 'An engine unit upgraded with a lubricant bath and circuits; used in advanced machines and the rocket silo. Stack: 50.';
  EN['item.advanced-circuit'] = 'Advanced circuit';
  EN['item.advanced-circuit.desc'] = 'A red circuit board made from plastic, copper cable and electronic circuits; an ingredient in most late-game machines. Stack: 200.';
  EN['item.processing-unit'] = 'Processing unit';
  EN['item.processing-unit.desc'] = 'A blue circuit board made from circuits and sulfuric acid; an ingredient in rocket control units. Stack: 100.';
  EN['item.flying-robot-frame'] = 'Flying robot frame';
  EN['item.flying-robot-frame.desc'] = 'The airframe and motor for a logistic robot, built from an electric engine unit, batteries and circuits. Stack: 50.';
  EN['item.low-density-structure'] = 'Low density structure';
  EN['item.low-density-structure.desc'] = 'A light, strong structural part made from copper, steel and plastic; used for rockets and the utility science pack. Stack: 50.';
  EN['item.rocket-fuel'] = 'Rocket fuel';
  EN['item.rocket-fuel.desc'] = 'A powerful fuel (100 MJ) made by compressing solid fuel with light oil; needed for rocket parts. Stack: 10.';
  EN['item.rocket-control-unit'] = 'Rocket control unit';
  EN['item.rocket-control-unit.desc'] = 'A guidance computer made from a processing unit and a battery; an ingredient in rocket parts. Stack: 10.';
  EN['item.satellite'] = 'Satellite';
  EN['item.satellite.desc'] = 'Loaded into the rocket silo before launch; a successful launch with a satellite yields space science packs. Stack: 1.';
  EN['item.chemical-science-pack'] = 'Chemical science pack';
  EN['item.chemical-science-pack.desc'] = 'The blue science pack, needed for oil, robotics and processing-unit research. Stack: 200.';
  EN['item.production-science-pack'] = 'Production science pack';
  EN['item.production-science-pack.desc'] = 'The purple science pack, needed for rocket fuel and other production-tier research. Stack: 200.';
  EN['item.utility-science-pack'] = 'Utility science pack';
  EN['item.utility-science-pack.desc'] = 'The yellow science pack, needed for the rocket control unit and other endgame research. Stack: 200.';
  EN['item.space-science-pack'] = 'Space science pack';
  EN['item.space-science-pack.desc'] = 'The white science pack, a trophy earned only by launching a rocket. Not consumed by any research. Stack: 2000.';
  EN['item.pumpjack'] = 'Pumpjack';
  EN['item.pumpjack.desc'] = 'Extracts crude oil from an oil well beneath it, 90 kW. Stack: 20.';
  EN['item.oil-refinery'] = 'Oil refinery';
  EN['item.oil-refinery.desc'] = 'Turns crude oil (and water) into petroleum gas, light oil and heavy oil, 420 kW. Stack: 10.';
  EN['item.chemical-plant'] = 'Chemical plant';
  EN['item.chemical-plant.desc'] = 'Runs chemistry recipes such as plastic, sulfur, sulfuric acid and lubricant, 210 kW. Stack: 10.';
  EN['item.storage-tank'] = 'Storage tank';
  EN['item.storage-tank.desc'] = 'Holds up to 25000 units of a single fluid; connects to pipes on all four sides. Stack: 50.';
  EN['item.rail'] = 'Rail';
  EN['item.rail.desc'] = 'A track segment for trains; connects automatically to neighbouring rails. Stack: 100.';
  EN['item.train-stop'] = 'Train stop';
  EN['item.train-stop.desc'] = 'Marks a named station; must be placed next to a rail. Trains with it on their schedule stop here. Stack: 10.';
  EN['item.locomotive'] = 'Locomotive';
  EN['item.locomotive.desc'] = 'Pulls a train along rails, burning solid fuel or coal; place it on a rail to start a new train. Stack: 5.';
  EN['item.cargo-wagon'] = 'Cargo wagon';
  EN['item.cargo-wagon.desc'] = 'A 40-slot rolling inventory; place it behind a locomotive on a rail to couple it. Stack: 5.';
  EN['item.roboport'] = 'Roboport';
  EN['item.roboport.desc'] = 'Charges and dispatches robots: logistic robots within a 25-tile radius, construction robots within 55 tiles. Stack: 10.';
  EN['item.logistic-robot'] = 'Logistic robot';
  EN['item.construction-robot'] = 'Construction robot';
  EN['item.construction-robot.desc'] = 'A flying robot that builds ghosts inside a roboport\'s 110×110 construction area, taking the buildings from logistic chests. Stack: 50.';
  EN['item.logistic-robot.desc'] = 'A flying robot that carries items between logistic chests within a roboport network. Stack: 50.';
  EN['item.passive-provider-chest'] = 'Passive provider chest';
  EN['item.passive-provider-chest.desc'] = 'Logistic robots freely take items from this chest to deliver elsewhere. Stack: 50.';
  EN['item.storage-chest'] = 'Storage chest';
  EN['item.storage-chest.desc'] = 'Logistic robots drop surplus items here and take them again when needed. Stack: 50.';
  EN['item.requester-chest'] = 'Requester chest';
  EN['item.requester-chest.desc'] = 'Set up to 6 item requests; logistic robots keep it filled to the requested counts. Stack: 50.';
  EN['item.rocket-silo'] = 'Rocket silo';
  EN['item.rocket-silo.desc'] = 'Crafts rocket parts and launches a rocket, optionally carrying a satellite. Stack: 1.';

  // ---------------------------------------------------------------------
  // Entities
  // ---------------------------------------------------------------------
  EN['ent.pumpjack'] = 'Pumpjack';
  EN['ent.pumpjack.desc'] = '3×3, electric (90 kW), must be centred on a crude-oil well; extracts crude oil; pollution 10/min.';
  EN['ent.oil-refinery'] = 'Oil refinery';
  EN['ent.oil-refinery.desc'] = '5×5, electric (420 kW), runs oil-processing recipes (basic or advanced); pollution 6/min.';
  EN['ent.chemical-plant'] = 'Chemical plant';
  EN['ent.chemical-plant.desc'] = '3×3, electric (210 kW), runs chemistry recipes (plastic, sulfur, sulfuric acid, lubricant…); pollution 4/min.';
  EN['ent.storage-tank'] = 'Storage tank';
  EN['ent.storage-tank.desc'] = '3×3, holds 25000 units of one fluid, pipe connections on all four edges, no power needed.';
  EN['ent.rail'] = 'Rail';
  EN['ent.rail.desc'] = '1×1 track tile; connects to neighbouring rails to form straights, curves and junctions.';
  EN['ent.train-stop'] = 'Train stop';
  EN['ent.train-stop.desc'] = '1×1, must be placed orthogonally next to a rail; names a station for train schedules.';
  EN['ent.roboport'] = 'Roboport';
  EN['ent.roboport.desc'] = '4×4, electric (50 kW plus 25 kW per active robot), covers a 50×50 logistic area centred on itself.';
  EN['ent.passive-provider-chest'] = 'Passive provider chest';
  EN['ent.passive-provider-chest.desc'] = '1×1, 48 slots; robots take items from it, no power needed.';
  EN['ent.storage-chest'] = 'Storage chest';
  EN['ent.storage-chest.desc'] = '1×1, 48 slots; robots both deposit surplus items into it and take from it, no power needed.';
  EN['ent.requester-chest'] = 'Requester chest';
  EN['ent.requester-chest.desc'] = '1×1, 48 slots plus 6 request slots; robots deliver items until each request is met, no power needed.';
  EN['ent.rocket-silo'] = 'Rocket silo';
  EN['ent.rocket-silo.desc'] = '9×9, electric (1000 kW, drain 50 kW), builds rocket parts and launches a rocket.';

  // ---------------------------------------------------------------------
  // Technologies
  // ---------------------------------------------------------------------
  EN['tech.fluid-handling'] = 'Fluid handling';
  EN['tech.fluid-handling.desc'] = 'Cost 50 automation + 50 logistic science packs. Unlocks the storage tank.';
  EN['tech.oil-processing'] = 'Oil processing';
  EN['tech.oil-processing.desc'] = 'Cost 100 automation + 100 logistic science packs. Unlocks the pumpjack, oil refinery, chemical plant and basic oil processing.';
  EN['tech.plastics'] = 'Plastics';
  EN['tech.plastics.desc'] = 'Cost 200 automation + 200 logistic science packs. Unlocks the plastic bar.';
  EN['tech.sulfur-processing'] = 'Sulfur processing';
  EN['tech.sulfur-processing.desc'] = 'Cost 150 automation + 150 logistic science packs. Unlocks sulfur and sulfuric acid.';
  EN['tech.advanced-electronics'] = 'Advanced electronics';
  EN['tech.advanced-electronics.desc'] = 'Cost 200 automation + 200 logistic science packs, requires Plastics and Electronics. Unlocks the advanced circuit.';
  EN['tech.engine'] = 'Engine';
  EN['tech.engine.desc'] = 'Cost 100 automation + 100 logistic science packs. Unlocks the engine unit.';
  EN['tech.chemical-science-pack'] = 'Chemical science pack';
  EN['tech.chemical-science-pack.desc'] = 'Cost 75 automation + 75 logistic science packs. Unlocks crafting the chemical science pack.';
  EN['tech.railway'] = 'Railway';
  EN['tech.railway.desc'] = 'Cost 75 automation + 75 logistic science packs, requires Logistics 2 and Engine. Unlocks rail, locomotive and cargo wagon.';
  EN['tech.automated-rail-transportation'] = 'Automated rail transportation';
  EN['tech.automated-rail-transportation.desc'] = 'Cost 75 automation + 75 logistic science packs. Unlocks the train stop.';
  EN['tech.advanced-oil-processing'] = 'Advanced oil processing';
  EN['tech.advanced-oil-processing.desc'] = 'Cost 75 automation + 75 logistic + 75 chemical science packs. Unlocks advanced oil processing and heavy/light oil cracking.';
  EN['tech.lubricant'] = 'Lubricant';
  EN['tech.lubricant.desc'] = 'Cost 50 automation + 50 logistic + 50 chemical science packs. Unlocks lubricant.';
  EN['tech.electric-engine'] = 'Electric engine';
  EN['tech.electric-engine.desc'] = 'Cost 50 automation + 50 logistic + 50 chemical science packs. Unlocks the electric engine unit.';
  EN['tech.battery'] = 'Battery';
  EN['tech.battery.desc'] = 'Cost 150 automation + 150 logistic + 150 chemical science packs. Unlocks the battery.';
  EN['tech.robotics'] = 'Robotics';
  EN['tech.robotics.desc'] = 'Cost 75 automation + 75 logistic + 75 chemical science packs. Unlocks the flying robot frame.';
  EN['tech.logistic-robotics'] = 'Logistic robotics';
  EN['tech.logistic-robotics.desc'] = 'Cost 250 automation + 250 logistic + 250 chemical science packs. Unlocks the logistic robot and the three logistic chests.';
  EN['tech.construction-robotics'] = 'Construction robotics';
  EN['tech.construction-robotics.desc'] = 'Cost 100 automation + 100 logistic + 100 chemical science packs. Unlocks the roboport and the construction robot, which builds ghosts and blueprints for you.';
  EN['tech.advanced-electronics-2'] = 'Advanced electronics 2';
  EN['tech.advanced-electronics-2.desc'] = 'Cost 300 automation + 300 logistic + 300 chemical science packs. Unlocks the processing unit.';
  EN['tech.low-density-structure'] = 'Low density structure';
  EN['tech.low-density-structure.desc'] = 'Cost 300 automation + 300 logistic + 300 chemical science packs. Unlocks the low density structure.';
  EN['tech.production-science-pack'] = 'Production science pack';
  EN['tech.production-science-pack.desc'] = 'Cost 100 automation + 100 logistic + 100 chemical science packs, requires Advanced electronics 2 and Railway. Unlocks crafting the production science pack.';
  EN['tech.utility-science-pack'] = 'Utility science pack';
  EN['tech.utility-science-pack.desc'] = 'Cost 100 automation + 100 logistic + 100 chemical science packs, requires Robotics, Advanced electronics 2 and Low density structure. Unlocks crafting the utility science pack.';
  EN['tech.rocket-fuel'] = 'Rocket fuel';
  EN['tech.rocket-fuel.desc'] = 'Cost 300 automation + 300 logistic + 300 chemical + 300 production science packs. Unlocks rocket fuel.';
  EN['tech.rocket-control-unit'] = 'Rocket control unit';
  EN['tech.rocket-control-unit.desc'] = 'Cost 300 of every science pack up to utility. Unlocks the rocket control unit.';
  EN['tech.rocket-silo'] = 'Rocket silo';
  EN['tech.rocket-silo.desc'] = 'Cost 500 of every science pack up to utility. Unlocks the rocket silo, rocket part and satellite. The path to victory.';

  // ---------------------------------------------------------------------
  // Recipe names — only for recipes whose id differs from (or has no) matching
  // result item; the UI falls back from F.t('recipe.<id>') to F.t('item.<id>')
  // (see src/70-ui.js quickbar tooltip: F.t('recipe.'+id) !== 'recipe.'+id ? ... : item.*).
  // ---------------------------------------------------------------------
  EN['recipe.basic-oil-processing'] = 'Basic oil processing';
  EN['recipe.advanced-oil-processing'] = 'Advanced oil processing';
  EN['recipe.heavy-oil-cracking'] = 'Heavy oil cracking';
  EN['recipe.light-oil-cracking'] = 'Light oil cracking';
  EN['recipe.sulfuric-acid'] = 'Sulfuric acid';
  EN['recipe.lubricant'] = 'Lubricant';
  EN['recipe.solid-fuel-from-petroleum-gas'] = 'Solid fuel from petroleum gas';
  EN['recipe.solid-fuel-from-light-oil'] = 'Solid fuel from light oil';
  EN['recipe.rocket-part'] = 'Rocket part';

  // ---------------------------------------------------------------------
  // Entity statuses (F.t('status.' + key), same convention as 02-i18n.js).
  // ---------------------------------------------------------------------
  EN['status.no_oil'] = 'No oil well';
  EN['status.no_path'] = 'No path';
  EN['status.moving'] = 'Moving';
  EN['status.waiting'] = 'Waiting';
  EN['status.stopped'] = 'Stopped';
  EN['status.building'] = 'Building rocket';
  EN['status.ready'] = 'Ready to launch';
  EN['status.launching'] = 'Launching';
  EN['status.cooldown'] = 'Cooling down';

  // ---------------------------------------------------------------------
  // Placement reasons (F.t('reason.' + key), consumed by 70-ui.js per design/EXPANSION.md §6.4).
  // ---------------------------------------------------------------------
  EN['reason.no_resource'] = 'Must be centred on a resource';
  EN['reason.no_rail'] = 'Must be placed next to a rail';

  // ---------------------------------------------------------------------
  // Help tabs (F.ui.addHelpTab registers the tab; body text lives here).
  // ---------------------------------------------------------------------
  EN['help.oil'] = 'Oil wells appear as dark, oily ground far from spawn (check the map). A pumpjack must be centred exactly on a well tile; it slowly extracts crude oil (yield decays with use but never runs dry below 20%).\n\nPipe the crude oil to an oil refinery. Basic oil processing (needs only crude oil) makes petroleum gas. Advanced oil processing (needs crude oil + water, unlocked separately) makes heavy oil, light oil and petroleum gas all at once, in larger quantities — always prefer it once available.\n\nHeavy oil is the least useful fluid on its own: crack it into light oil in a chemical plant (heavy-oil cracking, needs water), then crack light oil into petroleum gas (light-oil cracking, also needs water) if you have a surplus. Petroleum gas makes plastic bars (with coal) and, with water, sulfur. Sulfur plus iron plate and water make sulfuric acid, used for batteries and processing units. Heavy oil also makes lubricant, needed for electric engine units.\n\nSolid fuel can be made from spare petroleum gas or light oil and is a strong furnace/vehicle fuel; compressing solid fuel with light oil makes rocket fuel. Use storage tanks (25000 fluid capacity) to buffer any fluid your production or consumption is unbalanced on.';
  EN['help.trains'] = 'Place rail like a belt (drag in a line; corners are handled for you) to connect two points. Place a train stop next to a rail and give it a name — that is where trains you schedule will stop.\n\nTo create a train, place a locomotive on a rail (R rotates it to choose the facing direction before placing); place a cargo wagon on a rail directly behind it (within about 3.5 tiles) to couple it on. Right-click and hold (mine) a car to remove it and get its item back.\n\nBoard the nearest locomotive with Enter or G (within 3 tiles); the same key leaves the train. While riding: W accelerates, S brakes/reverses, and at a junction A or D picks the left or right branch for the next choice point. Open a locomotive to set fuel and edit its schedule (a list of stops with a wait condition: fixed time, until full, until empty, or until inactive); toggle Auto to let it run the schedule itself, or leave it Manual to always drive it yourself. A train waits if the rail ahead is occupied by another train, and shows "No path" if its schedule cannot be reached.\n\nWhile a train is stopped at a station, inserters can load and unload its wagons just like a chest.';
  EN['help.robots'] = 'A roboport charges and dispatches logistic robots over a 50×50 tile area (25-tile radius) centred on itself; place a robot item into its robot slot so it has robots to send out. Overlapping roboports join into one shared network — build several to cover a larger base, and keep them powered (an unpowered network flies its robots at only 20% speed).\n\nThree kinds of logistic chest work with the network: a passive provider chest lets robots freely take items from it; a storage chest lets robots both drop off surplus items and take them again; a requester chest is where you tell the network what you need — open it, use the item picker on any of its 6 request slots to choose an item, and set how many you want. Robots then fly from provider/storage chests to fill the request automatically, as long as a roboport network with those chests is powered and stocked.\n\nEach roboport\'s GUI shows how many robots in its network are idle or busy, and how many logistic chests it covers — useful for spotting a starved or overloaded network.\n\nConstruction robots (second robot slot of the roboport) build ghosts and pasted blueprints on their own: every ghost inside a network\'s construction area (110×110 around each roboport) is built with an item taken from a provider or storage chest of that network. A ghost whose building is in no chest waits — the roboport window shows how many ghosts are missing materials. If the ghost disappears before the robot arrives, it brings the item back to a storage chest.';
  EN['help.rocket'] = 'The rocket silo (9×9) crafts rocket parts from low density structure, rocket fuel and rocket control units, 20 parts per rocket. Feed its three input slots and keep it powered (1000 kW); its progress bar shows parts built so far.\n\nOnce all 20 parts are built the rocket rises into view and the silo is "Ready to launch". Drop a satellite into the satellite slot before launching to get a reward: launching without one is allowed (after a confirmation, since the rocket and any satellite aboard are lost) but produces nothing.\n\nPress Launch (or enable the auto-launch checkbox to launch automatically whenever ready and a satellite is loaded). The launch sequence takes about 20 seconds; a successful launch with a satellite fills the output slot with 1000 space science packs and starts a short cooldown before the silo can build parts again.\n\nYour first successful launch opens a victory screen with your play statistics and a "Continue playing" button — the game keeps going afterwards, and you can launch as many rockets as you like for more space science packs.';

  F.i18n.add('en', EN);
})();
