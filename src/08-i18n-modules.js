// 08-i18n-modules.js — English strings for modules (src/07-data-modules.js, src/35-modules.js):
// item/entity/tech names & descriptions, module-slot UI labels and the "Modules" help tab.
(function () {
  'use strict';

  var EN = Object.create(null);

  var KINDS = {
    speed: ['Speed module', 'Makes the machine faster but hungrier for power.'],
    productivity: ['Productivity module', 'Every so often the machine makes one free extra result. Slower and power hungry; only for intermediate products, smelting and mining.'],
    efficiency: ['Efficiency module', 'Cuts the machine\'s power use (never below 20%).'],
  };
  var EFFECTS = {
    'speed-module': 'Speed +20%, energy +50%.',
    'speed-module-2': 'Speed +30%, energy +60%.',
    'speed-module-3': 'Speed +50%, energy +70%.',
    'productivity-module': 'Productivity +4%, speed -5%, energy +40%, pollution +5%.',
    'productivity-module-2': 'Productivity +6%, speed -10%, energy +60%, pollution +7%.',
    'productivity-module-3': 'Productivity +10%, speed -15%, energy +80%, pollution +10%.',
    'efficiency-module': 'Energy -30%.',
    'efficiency-module-2': 'Energy -40%.',
    'efficiency-module-3': 'Energy -50%.',
  };
  ['speed', 'productivity', 'efficiency'].forEach(function (kind) {
    [1, 2, 3].forEach(function (tier) {
      var id = kind + '-module' + (tier > 1 ? '-' + tier : '');
      var name = KINDS[kind][0] + (tier > 1 ? ' ' + tier : '');
      EN['item.' + id] = name;
      EN['item.' + id + '.desc'] = KINDS[kind][1] + ' ' + EFFECTS[id] + ' Put it into a module slot of an assembling machine 2/3, electric furnace or electric mining drill. Stack: 50.';
      EN['tech.' + id] = name;
      EN['tech.' + id + '.desc'] = 'Unlocks the ' + name.toLowerCase() + '.';
    });
  });

  EN['item.assembling-machine-3'] = 'Assembling machine 3';
  EN['item.assembling-machine-3.desc'] = 'The fastest assembling machine (crafting speed 1.25) with 4 module slots. 375 kW. Stack: 50.';
  EN['ent.assembling-machine-3'] = 'Assembling machine 3';
  EN['ent.assembling-machine-3.desc'] = 'Crafting speed 1.25, 4 module slots, 375 kW.';
  EN['item.electric-furnace'] = 'Electric furnace';
  EN['item.electric-furnace.desc'] = 'A 3×3 furnace powered by electricity instead of fuel: crafting speed 2, 2 module slots, 180 kW. Stack: 50.';
  EN['ent.electric-furnace'] = 'Electric furnace';
  EN['ent.electric-furnace.desc'] = 'Smelts like a steel furnace but needs no fuel; 2 module slots, 180 kW.';

  EN['tech.automation-3'] = 'Automation 3';
  EN['tech.automation-3.desc'] = 'Unlocks assembling machine 3 (4 module slots).';
  EN['tech.advanced-material-processing-2'] = 'Advanced material processing 2';
  EN['tech.advanced-material-processing-2.desc'] = 'Unlocks the electric furnace (2 module slots).';

  EN['ui.modules'] = 'Modules';
  EN['ui.modules.speed'] = 'Speed';
  EN['ui.modules.energy'] = 'Energy';
  EN['ui.modules.productivity'] = 'Productivity';
  EN['ui.modules.pollution'] = 'Pollution';
  EN['ui.modules.productivityBar'] = 'Bonus';
  EN['ui.tab.modules'] = 'Modules';

  EN['help.modules'] = 'Modules change how a machine works. Assembling machine 2 has 2 module slots, assembling machine 3 has 4, the electric furnace 2 and the electric mining drill 3. Burner machines and assembling machine 1 take none.\n\nOpen the machine and click a module into one of its module slots, or shift-click a module in your inventory while the machine is open. Inserters never put modules in. Mining or deconstructing the machine gives its modules back.\n\nSpeed modules make the machine faster but use more power. Efficiency modules cut power use (never below 20%), which also lowers pollution. Productivity modules fill a bonus bar with every finished craft or mined ore; each time it is full the machine makes one extra result for free. They slow the machine down, use more power and pollute more, and only work on intermediate products, science packs, smelting and mining: when you switch an assembler to a recipe they cannot help, its productivity modules are returned to you.\n\nEffects from all modules in a machine add up. The machine window shows the combined speed, energy, productivity and pollution change.';

  F.i18n.add('en', EN);
})();
