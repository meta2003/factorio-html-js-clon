// Scenario tests for modules: src/07-data-modules.js (data), src/35-modules.js (slots/effects)
// and their use in src/32-machines.js. Helpers copied from test/scenarios.js.
'use strict';

const TPS = 60;
function ticks(F, n) { for (let i = 0; i < n; i++) F.tick(); }
function fresh(F, seed = 42) { F.newGame({ seed }); return F.state; }
function spawn(F) { const s = F.world.spawn; return { x: Math.round(s.x), y: Math.round(s.y) }; }

function findFlat(F, w, h, skip = 0) {
  const sp = spawn(F);
  const pl = F.state.player; const px = Math.floor(pl.x), py = Math.floor(pl.y);
  let found = 0;
  for (let r = 2; r < 160; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = sp.x + dx, y = sp.y + dy;
      let ok = true;
      for (let j = -1; j <= h && ok; j++) for (let i = -1; i <= w && ok; i++) {
        const tx = x + i, ty = y + j;
        if (!F.world.buildable(tx, ty) || F.world.resource(tx, ty)) ok = false;
        if (Math.abs(tx - px) <= 1 && Math.abs(ty - py) <= 1) ok = false;
      }
      if (ok && found++ >= skip) return { x, y };
    }
  }
  throw new Error('no flat area found');
}

function place(F, assert, type, x, y, dir = 0) {
  F.api.give(type, 1);
  const chk = F.api.canPlace(type, x, y, dir);
  assert(chk.ok, `canPlace ${type} at ${x},${y} dir ${dir}: ${chk.reason}`);
  const e = F.api.place(type, x, y, dir, { fromInventory: true });
  assert(e, `place ${type} at ${x},${y}`);
  return e;
}

function placeAnywhereNear(F, assert, type, cx, cy, radius, dir = 0) {
  for (let r = 0; r <= radius; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    if (F.api.canPlace(type, cx + dx, cy + dy, dir).ok) return place(F, assert, type, cx + dx, cy + dy, dir);
  }
  assert(false, `no room for ${type} near ${cx},${cy}`);
}

// Solar plant of at least kW: two rows of panels with a line of small poles between them (every
// pole touches the panel above and below it), wired with small poles to a pole next to `consumer`.
function solarPower(F, assert, consumer, kW) {
  const cols = Math.max(1, Math.ceil(kW / 120));
  const area = findFlat(F, 3 * cols, 7);
  for (let i = 0; i < cols; i++) {
    place(F, assert, 'solar-panel', area.x + 3 * i, area.y, 0);
    place(F, assert, 'solar-panel', area.x + 3 * i, area.y + 4, 0);
    if (i) place(F, assert, 'small-electric-pole', area.x + 3 * i + 1, area.y + 3, 0);
  }
  let px = area.x + 1, py = area.y + 3;
  place(F, assert, 'small-electric-pole', px, py, 0);
  const tx = consumer.x - 1, ty = consumer.y - 1;
  let guard = 0;
  while ((Math.abs(px - tx) > 5 || Math.abs(py - ty) > 5) && guard++ < 80) {
    const nx = px + Math.sign(tx - px) * Math.min(5, Math.abs(tx - px));
    const ny = py + Math.sign(ty - py) * Math.min(5, Math.abs(ty - py));
    const p = placeAnywhereNear(F, assert, 'small-electric-pole', nx, ny, 2, 0);
    px = p.x; py = p.y;
  }
  const last = placeAnywhereNear(F, assert, 'small-electric-pole', tx, ty, 1, 0);
  ticks(F, 2);
  return last;
}

function outCount(F, e, id) {
  const g = F.entities.inventories(e).find(i => i.name === 'output');
  return g ? F.inv.count(g.inv, id) : 0;
}
function playerCount(F, id) { return F.inv.count(F.state.player.inv, id); }

// Records the kW each entity asks F.power.request for on the next tick.
function measureKW(F, entities) {
  const orig = F.power.request;
  const seen = new Map();
  F.power.request = function (e, kW) { if (entities.includes(e)) seen.set(e, kW); return orig.apply(this, arguments); };
  try { F.tick(); } finally { F.power.request = orig; }
  return entities.map(e => seen.get(e));
}

module.exports = {
  modules_data_and_research(F, assert) {
    const D = F.data;
    const kinds = ['speed', 'productivity', 'efficiency'];
    for (const k of kinds) for (const t of [1, 2, 3]) {
      const id = k + '-module' + (t > 1 ? '-' + t : '');
      assert(D.items[id] && D.items[id].module && D.items[id].module.kind === k, `item ${id} is a ${k} module`);
      assert(D.recipes[id] && D.techs[D.recipes[id].unlockedBy], `recipe ${id} unlocked by a tech`);
      assert(F.t('item.' + id) !== 'item.' + id, `item ${id} has a name`);
    }
    assert(D.entities['assembling-machine-3'].moduleSlots === 4, 'AM3 has 4 slots');
    assert(D.entities['assembling-machine-2'].moduleSlots === 2, 'AM2 has 2 slots');
    assert(D.entities['electric-furnace'].moduleSlots === 2, 'electric furnace has 2 slots');
    assert(D.entities['electric-mining-drill'].moduleSlots === 3, 'electric drill has 3 slots');
    for (const id of ['assembling-machine-1', 'stone-furnace', 'steel-furnace', 'burner-mining-drill']) {
      assert(!D.entities[id].moduleSlots, `${id} takes no modules`);
    }
    fresh(F);
    assert(!F.research.isRecipeUnlocked('speed-module'), 'speed module locked at start');
    assert(D.techs['speed-module'].prereq.includes('advanced-electronics'), 'speed module needs advanced electronics');
    assert(D.techs['speed-module-3'].cost.packs.length === 5, 'tier 3 needs all five science packs');
    return `${kinds.length * 3} modules, 2 new machines`;
  },

  modules_speed_module_speeds_up_assembler(F, assert) {
    fresh(F);
    const a = findFlat(F, 8, 4);
    const plain = place(F, assert, 'assembling-machine-2', a.x, a.y, 0);
    const fast = place(F, assert, 'assembling-machine-2', a.x + 4, a.y, 0);
    for (const m of [plain, fast]) {
      assert(F.api.setRecipe(m, 'iron-gear-wheel') !== false, 'set recipe');
      F.api.insertInto(m, 'iron-plate', 60);
    }
    F.api.give('speed-module', 3);
    assert(F.api.insertInto(fast, 'speed-module', 3) === 2, 'only 2 modules fit in AM2');
    assert(fast.modules.filter(Boolean).length === 2, 'two slots filled');
    assert(Math.abs(F.modules.effects(fast).speed - 1.4) < 1e-9, 'speed factor 1.4');
    solarPower(F, assert, plain, 200);
    solarPower(F, assert, fast, 350);
    const [kwPlain, kwFast] = measureKW(F, [plain, fast]);
    assert(Math.abs(kwFast - (150 * 2 + 5)) < 1e-6 && Math.abs(kwPlain - 155) < 1e-6, `energy +100% with 2 speed modules (${kwPlain} -> ${kwFast} kW)`);
    ticks(F, 8 * TPS);
    const n0 = outCount(F, plain, 'iron-gear-wheel'), n1 = outCount(F, fast, 'iron-gear-wheel');
    // 0.5 s recipe: speed 0.75 → 12 gears in 8 s, speed 1.05 → ~16.8
    assert(n0 === 12, `plain AM2 made 12 gears (got ${n0})`);
    assert(n1 === 16, `AM2 with 2 speed modules made 16 gears (got ${n1})`);
  },

  modules_efficiency_cuts_power_with_floor(F, assert) {
    fresh(F);
    const a = findFlat(F, 4, 4);
    const m = place(F, assert, 'assembling-machine-3', a.x, a.y, 0);
    F.api.setRecipe(m, 'iron-gear-wheel');
    F.api.insertInto(m, 'iron-plate', 50);
    F.api.insertInto(m, 'efficiency-module', 1);
    assert(Math.abs(F.modules.effects(m).energy - 0.7) < 1e-9, 'one efficiency module: 70% energy');
    F.api.insertInto(m, 'efficiency-module-3', 3);
    assert(Math.abs(F.modules.effects(m).energy - 0.2) < 1e-9, 'energy never below 20%');
    solarPower(F, assert, m, 300);
    const [kw] = measureKW(F, [m]);
    assert(Math.abs(kw - (375 * 0.2 + 12.5)) < 1e-6, `AM3 asks for 20% of 375 kW + drain (got ${kw})`);
    assert(Math.abs(F.modules.effects(m).pollution - 0.2) < 1e-9, 'pollution scales down with energy');
  },

  modules_productivity_bonus_and_restrictions(F, assert) {
    fresh(F);
    const a = findFlat(F, 4, 4);
    const m = place(F, assert, 'assembling-machine-3', a.x, a.y, 0);
    assert(F.api.setRecipe(m, 'iron-chest') !== false, 'set a non-intermediate recipe');
    F.api.give('productivity-module-3', 4);
    assert(F.api.insertInto(m, 'productivity-module-3', 4) === 0, 'productivity refused for iron chests');
    F.api.setRecipe(m, 'iron-gear-wheel');
    assert(F.api.insertInto(m, 'productivity-module-3', 4) === 4, 'four productivity modules on gears');
    const fx = F.modules.effects(m);
    assert(Math.abs(fx.productivity - 0.4) < 1e-9 && Math.abs(fx.speed - 0.4) < 1e-9, 'productivity +40%, speed x0.4');
    F.api.insertInto(m, 'iron-plate', 100);
    solarPower(F, assert, m, 1650); // 375 kW x (1 + 4 x 0.8) + drain
    // speed 1.25 x 0.4 = 0.5 → one gear per second
    ticks(F, 20 * TPS + 10);
    const gears = outCount(F, m, 'iron-gear-wheel');
    const plates = F.inv.count(m.input, 'iron-plate');
    const crafted = (100 - plates) / 2;
    assert(crafted >= 19 && crafted <= 21, `~20 crafts in 20 s (got ${crafted})`);
    assert(gears === crafted + Math.floor(crafted * 0.4 + 1e-9) || gears === crafted + Math.floor(crafted * 0.4 + 1e-9) - 1,
      `+40% free gears (${crafted} crafts -> ${gears} gears)`);
    // switching to a recipe productivity cannot help hands the modules back
    const before = playerCount(F, 'productivity-module-3');
    F.api.setRecipe(m, 'iron-chest');
    assert(m.modules.every(s => !s), 'modules removed on recipe change');
    assert(playerCount(F, 'productivity-module-3') === before + 4, 'modules returned to the player');
    return `${crafted} crafts -> ${gears} gears`;
  },

  modules_electric_furnace_no_fuel(F, assert) {
    fresh(F);
    // skip spots another scenario's leftover place rule may reject (hooks tests register one for furnaces)
    let a = null;
    for (let k = 0; k < 20 && !a; k++) { const c = findFlat(F, 4, 4, k); if (F.api.canPlace('electric-furnace', c.x, c.y, 0).ok) a = c; }
    const fur = place(F, assert, 'electric-furnace', a.x, a.y, 0);
    assert(!fur.fuel, 'no fuel slot');
    assert(F.entities.canAcceptItem(fur, 'coal') === 0, 'coal is not accepted');
    assert(F.entities.inventories(fur).every(g => g.name !== 'fuel'), 'no fuel inventory');
    F.api.insertInto(fur, 'iron-ore', 50);
    F.api.insertInto(fur, 'productivity-module-3', 2);
    assert(fur.modules.filter(Boolean).length === 2, 'two productivity modules in');
    ticks(F, 60);
    assert(fur._status === 'no_power', `unpowered electric furnace waits for power (${fur._status})`);
    solarPower(F, assert, fur, 500); // 180 kW x 2.6 + drain
    // speed 2 x 0.7 = 1.4 → 3.2 s / 1.4 ≈ 2.29 s per plate
    ticks(F, 23 * TPS);
    const plates = outCount(F, fur, 'iron-plate');
    assert(plates >= 11 && plates <= 13, `~12 plates in 23 s incl. +20% bonus (got ${plates})`);
    return `${plates} plates`;
  },

  modules_drill_productivity_does_not_deplete(F, assert) {
    fresh(F);
    const r = F.api.findResource('iron-ore', 160);
    assert(r, 'iron ore found');
    let drill = null, chest = null;
    for (let oy = -10; oy <= 10 && !drill; oy++) for (let ox = -10; ox <= 10 && !drill; ox++) {
      const x = r.x + ox, y = r.y + oy;
      let ore = 0; for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) if (F.world.resource(x + i, y + j)) ore++;
      if (ore < 9) continue;
      for (let d = 0; d < 4 && !drill; d++) {
        if (!F.api.canPlace('electric-mining-drill', x, y, d).ok) continue;
        F.api.give('electric-mining-drill', 1);
        const e = F.api.place('electric-mining-drill', x, y, d, { fromInventory: true });
        if (!e) continue;
        const f = F.entities.front(e);
        if (F.api.canPlace('iron-chest', f[0], f[1], 0).ok) { drill = e; chest = place(F, assert, 'iron-chest', f[0], f[1], 0); }
        else F.api.remove(x, y, { toInventory: false });
      }
    }
    assert(drill && chest, 'electric drill on ore with a chest in front');
    F.api.give('productivity-module-3', 3);
    assert(F.api.insertInto(drill, 'productivity-module-3', 3) === 3, 'three productivity modules in the drill');
    let oreBefore = 0;
    const reg = [];
    for (let j = -1; j <= 3; j++) for (let i = -1; i <= 3; i++) reg.push([drill.x + i, drill.y + j]);
    for (const [x, y] of reg) { const res = F.world.resource(x, y); if (res) oreBefore += res.amount; }
    solarPower(F, assert, drill, 330); // 90 kW x 3.4 + drain
    ticks(F, 60 * TPS);
    let oreAfter = 0;
    for (const [x, y] of reg) { const res = F.world.resource(x, y); if (res) oreAfter += res.amount; }
    const mined = oreBefore - oreAfter;
    const got = F.inv.count(F.entities.inventories(chest)[0].inv, 'iron-ore') + (drill.held ? drill.held.count : 0);
    // speed 0.5 x 0.55 = 0.275 ore/s → ~16 mined in 60 s, +30% bonus
    assert(mined >= 14 && mined <= 18, `~16 ore taken from the ground (got ${mined})`);
    assert(got === mined + Math.floor(mined * 0.3 + 1e-9) || got === mined + Math.floor(mined * 0.3 + 1e-9) - 1,
      `bonus ore on top of mined ore (${mined} mined -> ${got} delivered)`);
    return `${mined} mined -> ${got} delivered`;
  },

  modules_hand_only_returned_and_saved(F, assert) {
    fresh(F);
    const a = findFlat(F, 6, 4);
    const m = place(F, assert, 'assembling-machine-2', a.x, a.y, 0);
    F.api.setRecipe(m, 'iron-gear-wheel');
    const ins = place(F, assert, 'burner-inserter', a.x + 3, a.y + 1, 3); // faces west: chest → machine
    const chest = place(F, assert, 'iron-chest', a.x + 4, a.y + 1, 0);
    F.api.insertInto(ins, 'coal', 2);
    F.api.insertInto(chest, 'speed-module', 5);
    ticks(F, 5 * TPS);
    assert(!m.modules || m.modules.every(s => !s), 'inserters never put modules into machines');
    assert(F.entities.canAcceptItem(m, 'speed-module') === 0, 'speed module is not an ingredient');
    // shift-click from the player's inventory
    F.api.give('speed-module', 2);
    const inv = F.state.player.inv;
    const idx = inv.findIndex(s => s && s.id === 'speed-module');
    const moved = F.api.transferStack(inv, idx, m);
    assert(moved === 2 && m.modules.filter(Boolean).length === 2, `shift-click moved 2 modules (got ${moved})`);
    // save / load keeps them
    const s = F.save();
    F.newGame({ seed: 1 });
    assert(F.load(s), 'load ok');
    const m2 = F.world.entityAt(a.x, a.y);
    assert(m2 && m2.modules && m2.modules.filter(Boolean).length === 2, 'modules survive save/load');
    assert(Math.abs(F.modules.effects(m2).speed - 1.4) < 1e-9, 'effects restored');
    // mining the machine returns them
    const before = playerCount(F, 'speed-module');
    F.api.remove(a.x, a.y, { toInventory: true });
    assert(playerCount(F, 'speed-module') === before + 2, 'modules returned when the machine is mined');
  },

  modules_old_save_without_modules(F, assert) {
    fresh(F);
    const a = findFlat(F, 4, 4);
    const m = place(F, assert, 'assembling-machine-2', a.x, a.y, 0);
    delete m.modules;
    const s = F.save();
    F.newGame({ seed: 3 });
    assert(F.load(s), 'load ok');
    const m2 = F.world.entityAt(a.x, a.y);
    assert(F.modules.effects(m2) === F.modules.NONE, 'no modules → neutral effects');
    assert(F.api.insertInto(m2, 'speed-module', 1) === 1, 'slots created on demand');
  },
};
