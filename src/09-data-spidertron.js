// 09-data-spidertron.js — spidertron data: the item (a vehicle, placed through the virtual
// placer in 39-spidertron.js, so it has no F.data.entities def), its recipe and technology.
// DATA ONLY, same rules as 05-data-expansion.js / 07-data-modules.js (the text lives with the
// feature in 39-spidertron.js).
//
// Factorio 1.1's recipe (exoskeletons, fusion reactors, a rocket launcher, a raw fish, ...) uses
// items this game does not have, so it is rebuilt from the closest ones that exist: rocket
// control units and low density structure as in the original, electric engines for the legs,
// radars for its sensors and efficiency modules standing in for its reactor equipment.
(function () {
  'use strict';

  var D = F.data;

  // [id, stack, fuelMJ, category, place|null, iconShape, color, color2|null, vehicle|null]
  D.items['spidertron'] = {
    id: 'spidertron', stack: 1, fuel: 0, category: 'logistics', place: undefined,
    icon: { shape: 'spidertron', color: '#6A6E72', color2: '#D8741C' }, vehicle: 'spidertron',
  };
  D.order.items.push('spidertron');

  D.recipes['spidertron'] = {
    id: 'spidertron',
    ingredients: [['rocket-control-unit', 16], ['low-density-structure', 150], ['electric-engine-unit', 16], ['efficiency-module-3', 2], ['radar', 2]],
    results: [['spidertron', 1]], time: 10, category: 'crafting', hand: true, tab: 'logistics',
    unlockedBy: 'spidertron', fluidIngredients: [], fluidResults: [],
  };
  if (!D.order.recipesByTab.logistics) D.order.recipesByTab.logistics = [];
  D.order.recipesByTab.logistics.push('spidertron');

  D.techs['spidertron'] = {
    id: 'spidertron', prereq: ['rocket-control-unit', 'low-density-structure', 'efficiency-module-3'],
    cost: {
      packs: [['automation-science-pack', 1], ['logistic-science-pack', 1], ['chemical-science-pack', 1],
        ['production-science-pack', 1], ['utility-science-pack', 1]],
      count: 500, time: 30,
    },
    unlocks: ['spidertron'], effects: [], tier: 4,
  };
  D.order.techs.push('spidertron');
})();
