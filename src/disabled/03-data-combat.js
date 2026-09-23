// src/disabled/03-data-combat.js — DISABLED: combat-only data (F.FEATURES.combat off).
//
// Not part of the build (see src/disabled/README.md). Holds every item,
// recipe, entity and tech that 01-data.js removed when combat was switched
// off: pistol, submachine-gun, firearm-magazine, piercing-rounds-magazine,
// gun-turret, stone-wall, repair-pack, the biter-spawner entity, and the
// military/gun-turret/stone-wall/military-2/physical-projectile-damage-*/
// weapon-shooting-speed-* techs. Small/medium/big biter *units* are not
// data-driven (see src/disabled/35-combat.js's own UNIT_DEFS) so they are
// not listed here — only their i18n display names are (ent.small-biter etc,
// used by tooltips/alerts in the combat module).
//
// To re-enable: move this file AND src/disabled/35-combat.js back into
// src/ (see src/disabled/README.md for the exact steps). Keep this file's
// name as-is: build/build.js sorts src/NN-*.js files by filename, and this
// file calls both F.data.extend (defined by 01-data.js) and F.i18n.add
// (defined by 02-i18n.js), so it must load after both — "03-data-combat.js"
// sorts right after "02-i18n.js" and before "10-world.js", which does that.
(function () {
  'use strict';
  if (!F.data || typeof F.data.extend !== 'function') {
    (F.log && F.log.error ? F.log.error : console.error)('[disabled/03-data-combat] F.data.extend not available — load this after 01-data.js');
    return;
  }

  // Row shapes match 01-data.js's ITEM_ROWS/RECIPE_ROWS/TECH_ROWS exactly.
  var ITEM_ROWS = [
    ['pistol', 5, 0, 'combat', null, 'gun', '#5A5A5A', null, null],
    ['submachine-gun', 5, 0, 'combat', null, 'gun', '#3E3E3E', null, null],
    ['firearm-magazine', 200, 0, 'combat', null, 'magazine', '#C9B037', '#7A6A20', { damage: 5, magazineSize: 10 }],
    ['piercing-rounds-magazine', 200, 0, 'combat', null, 'magazine', '#C03A2B', '#6E1E15', { damage: 8, magazineSize: 10 }],
    ['repair-pack', 100, 0, 'production', null, 'tool', '#C8A24A', null, null],
    ['gun-turret', 50, 0, 'combat', 'gun-turret', 'turret', '#CAA718', '#3A3A3A', null],
    ['stone-wall', 100, 0, 'combat', 'stone-wall', 'wall', '#CCD9CC', null, null],
  ];

  var RECIPE_ROWS = [
    ['pistol', [['copper-plate', 5], ['iron-plate', 5]], [['pistol', 1]], 5, 'crafting', null],
    ['submachine-gun', [['iron-gear-wheel', 10], ['copper-plate', 5], ['iron-plate', 10]], [['submachine-gun', 1]], 10, 'crafting', 'military'],
    ['firearm-magazine', [['iron-plate', 4]], [['firearm-magazine', 1]], 1, 'crafting', null],
    ['piercing-rounds-magazine', [['firearm-magazine', 1], ['steel-plate', 1], ['copper-plate', 5]], [['piercing-rounds-magazine', 1]], 3, 'crafting', 'military-2'],
    ['repair-pack', [['electronic-circuit', 2], ['iron-gear-wheel', 2]], [['repair-pack', 1]], 0.5, 'crafting', 'electronics'],
    ['gun-turret', [['iron-gear-wheel', 10], ['copper-plate', 10], ['iron-plate', 20]], [['gun-turret', 1]], 8, 'crafting', 'gun-turret'],
    ['stone-wall', [['stone-brick', 5]], [['stone-wall', 1]], 0.5, 'crafting', 'stone-wall'],
  ];

  // Entity def objects, as passed to 01-data.js's baseEntity() (F.data.extend
  // applies baseEntity() itself, so defaults like collides/layer/pollution
  // only need to be given here where they differ, exactly as in 01-data.js).
  var ENTITIES = [
    { id: 'gun-turret', size: [2, 2], rotatable: false, health: 400, behaviour: 'turret', minable: 'gun-turret', category: 'combat', mineTime: 0.5, turret: { range: 18, rate: 10, ammoLimit: 10 } },
    { id: 'stone-wall', size: [1, 1], rotatable: false, health: 350, behaviour: 'wall', minable: 'stone-wall', category: 'combat', layer: 'wall', mineTime: 0.2, wall: {} },
    { id: 'biter-spawner', size: [4, 4], rotatable: false, natural: true, health: 350, behaviour: 'spawner', minable: null, category: null, mineTime: null, spawner: {} },
  ];

  var TECH_ROWS = [
    ['military', [], false, 10, 15, ['submachine-gun'], [], 1],
    ['gun-turret', [], false, 10, 10, ['gun-turret'], [], 1],
    ['stone-wall', [], false, 10, 10, ['stone-wall'], [], 1],
    ['physical-projectile-damage-1', ['military'], false, 100, 30, [], [{ type: 'bonus', key: 'bulletDamage', value: 0.10 }, { type: 'bonus', key: 'turretDamage', value: 0.10 }], 1],
    ['weapon-shooting-speed-1', ['military'], false, 100, 30, [], [{ type: 'bonus', key: 'bulletSpeed', value: 0.10 }], 1],
    ['military-2', ['military', 'steel-processing', 'logistic-science-pack'], true, 20, 15, ['piercing-rounds-magazine'], [], 2],
    ['physical-projectile-damage-2', ['physical-projectile-damage-1', 'logistic-science-pack'], true, 200, 30, [], [{ type: 'bonus', key: 'bulletDamage', value: 0.10 }, { type: 'bonus', key: 'turretDamage', value: 0.10 }], 2],
    ['weapon-shooting-speed-2', ['weapon-shooting-speed-1', 'logistic-science-pack'], true, 200, 30, [], [{ type: 'bonus', key: 'bulletSpeed', value: 0.20 }], 2],
  ];

  F.data.extend({
    items: ITEM_ROWS,
    recipes: RECIPE_ROWS,
    entities: ENTITIES,
    techs: TECH_ROWS,
    // 'electronics' unlocked ['radar', 'repair-pack'] originally; 01-data.js
    // trimmed that to just ['radar'] when repair-pack was removed.
    techUnlockAdditions: { electronics: ['repair-pack'] },
    startingInventory: [['pistol', 1], ['firearm-magazine', 10]],
  });

  // i18n for the content above (both languages the original game shipped;
  // 'sl' only actually registers if src/disabled/02-i18n-sl.js — or a
  // restored 02-i18n.js LANGS entry — is also present, see the README).
  F.i18n.add('en', {
    "item.pistol": "Pistol",
    "item.pistol.desc": "The player's starting weapon, range 15, fires 4 shots/s. Stack: 5.",
    "item.submachine-gun": "Submachine gun",
    "item.submachine-gun.desc": "A faster weapon unlocked by the Military research; range 18, fires 10 shots/s. Stack: 5.",
    "item.firearm-magazine": "Firearm magazine",
    "item.firearm-magazine.desc": "10 rounds, 5 physical damage per shot. Stack: 200.",
    "item.piercing-rounds-magazine": "Piercing rounds magazine",
    "item.piercing-rounds-magazine.desc": "10 rounds, 8 physical damage per shot; unlocked by Military 2. Stack: 200.",
    "item.repair-pack": "Repair pack",
    "item.repair-pack.desc": "Restores a total of 600 health to your own damaged buildings. Stack: 100.",
    "item.gun-turret": "Gun turret",
    "item.gun-turret.desc": "Automatically fires at enemies within a range of 18 tiles. Stack: 50.",
    "item.stone-wall": "Stone wall",
    "item.stone-wall.desc": "Blocks movement of enemies and the player. Stack: 100.",
    "ent.gun-turret": "Gun turret",
    "ent.gun-turret.desc": "2×2, no power needed, range 18 tiles, 10 shots/s, needs ammunition loaded.",
    "ent.stone-wall": "Stone wall",
    "ent.stone-wall.desc": "1×1, 350 health, blocks movement of the player and biters.",
    "ent.biter-spawner": "Biter spawner",
    "ent.biter-spawner.desc": "4×4 biter nest; spawns enemies once pollution reaches its vicinity.",
    "ent.small-biter": "Small biter",
    "ent.small-biter.desc": "The weakest enemy, attacks the factory in groups.",
    "ent.medium-biter": "Medium biter",
    "ent.medium-biter.desc": "A stronger enemy, appears at higher evolution.",
    "ent.big-biter": "Big biter",
    "ent.big-biter.desc": "The strongest enemy, rarely encountered in this game.",
    "tech.military": "Military",
    "tech.military.desc": "Cost 10 automation science packs. Unlocks the submachine gun.",
    "tech.gun-turret": "Gun turret",
    "tech.gun-turret.desc": "Cost 10 automation science packs. Unlocks the gun turret.",
    "tech.stone-wall": "Stone wall",
    "tech.stone-wall.desc": "Cost 10 automation science packs. Unlocks the stone wall.",
    "tech.military-2": "Military 2",
    "tech.military-2.desc": "Cost 20 automation + 20 logistic science packs. Unlocks the piercing rounds magazine.",
    "tech.physical-projectile-damage-1": "Physical projectile damage 1",
    "tech.physical-projectile-damage-1.desc": "Cost 100 automation science packs, requires Military. Increases bullet and turret damage by 10%.",
    "tech.weapon-shooting-speed-1": "Weapon shooting speed 1",
    "tech.weapon-shooting-speed-1.desc": "Cost 100 automation science packs, requires Military. Increases shooting speed by 10%.",
    "tech.physical-projectile-damage-2": "Physical projectile damage 2",
    "tech.physical-projectile-damage-2.desc": "Cost 200 automation + 200 logistic science packs. A further 10% bullet and turret damage.",
    "tech.weapon-shooting-speed-2": "Weapon shooting speed 2",
    "tech.weapon-shooting-speed-2.desc": "Cost 200 automation + 200 logistic science packs. A further 20% shooting speed."
  });
  F.i18n.add('sl', {
    "item.pistol": "Pištola",
    "item.pistol.desc": "Začetno orožje igralca, doseg 15, 4 strele na sekundo. Sklad: 5.",
    "item.submachine-gun": "Brzostrelka",
    "item.submachine-gun.desc": "Hitrejše orožje, odklenjeno z raziskavo Vojska; doseg 18, 10 strelov/s. Sklad: 5.",
    "item.firearm-magazine": "Nabojnik",
    "item.firearm-magazine.desc": "10 nabojev, 5 fizične škode na strel. Sklad: 200.",
    "item.piercing-rounds-magazine": "Prebojni nabojnik",
    "item.piercing-rounds-magazine.desc": "10 nabojev, 8 fizične škode na strel; odklenjen z Vojsko 2. Sklad: 200.",
    "item.repair-pack": "Popravljalni komplet",
    "item.repair-pack.desc": "Popravi skupno 600 zdravja na lastnih poškodovanih zgradbah. Sklad: 100.",
    "item.gun-turret": "Strelna kupola",
    "item.gun-turret.desc": "Samodejno strelja na sovražnike v dosegu 18 polj. Sklad: 50.",
    "item.stone-wall": "Kamniti zid",
    "item.stone-wall.desc": "Blokira gibanje sovražnikov in igralca. Sklad: 100.",
    "ent.gun-turret": "Strelna kupola",
    "ent.gun-turret.desc": "2×2, brez energije, doseg 18 polj, 10 strelov/s, potrebuje strelivo.",
    "ent.stone-wall": "Kamniti zid",
    "ent.stone-wall.desc": "1×1, 350 zdravja, blokira gibanje igralca in grizcev.",
    "ent.biter-spawner": "Gnezdo grizcev",
    "ent.biter-spawner.desc": "4×4 gnezdo grizcev; poraja sovražnike, ko onesnaženje doseže njegovo bližino.",
    "ent.small-biter": "Mali grizec",
    "ent.small-biter.desc": "Najšibkejši sovražnik, napada tovarno v skupinah.",
    "ent.medium-biter": "Srednji grizec",
    "ent.medium-biter.desc": "Močnejši sovražnik, pojavi se pri višji evoluciji.",
    "ent.big-biter": "Veliki grizec",
    "ent.big-biter.desc": "Najmočnejši sovražnik, redko srečan v tej igri.",
    "tech.military": "Vojska",
    "tech.military.desc": "Cena 10 rdečih paketov. Odklene brzostrelko.",
    "tech.gun-turret": "Strelna kupola",
    "tech.gun-turret.desc": "Cena 10 rdečih paketov. Odklene strelno kupolo.",
    "tech.stone-wall": "Kamniti zid",
    "tech.stone-wall.desc": "Cena 10 rdečih paketov. Odklene kamniti zid.",
    "tech.military-2": "Vojska 2",
    "tech.military-2.desc": "Cena 20 rdečih + 20 zelenih paketov. Odklene prebojni nabojnik.",
    "tech.physical-projectile-damage-1": "Fizična škoda izstrelkov 1",
    "tech.physical-projectile-damage-1.desc": "Cena 100 rdečih paketov, potrebuje Vojsko. Poveča škodo nabojev in kupol za 10 %.",
    "tech.weapon-shooting-speed-1": "Hitrost streljanja 1",
    "tech.weapon-shooting-speed-1.desc": "Cena 100 rdečih paketov, potrebuje Vojsko. Poveča hitrost streljanja za 10 %.",
    "tech.physical-projectile-damage-2": "Fizična škoda izstrelkov 2",
    "tech.physical-projectile-damage-2.desc": "Cena 200 rdečih + 200 zelenih paketov. Dodatnih 10 % škode nabojev in kupol.",
    "tech.weapon-shooting-speed-2": "Hitrost streljanja 2",
    "tech.weapon-shooting-speed-2.desc": "Cena 200 rdečih + 200 zelenih paketov. Dodatnih 20 % hitrosti streljanja."
  });
})();
