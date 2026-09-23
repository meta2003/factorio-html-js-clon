'use strict';
// Diagnostic scenarios (not part of the regular suite). Run: node test/headless.js --ticks 60 --scenarios test/debug.js
const S = require('./scenarios.js');
function ticks(F, n) { for (let i = 0; i < n; i++) F.tick(); }
function findFlat(F, w, h) {
  const sp = F.world.spawn; const sx = Math.round(sp.x), sy = Math.round(sp.y);
  for (let r = 2; r < 140; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    const x = sx + dx, y = sy + dy; let ok = true;
    for (let j = -1; j <= h && ok; j++) for (let i = -1; i <= w && ok; i++) { if (!F.world.buildable(x + i, y + j) || F.world.resource(x + i, y + j)) ok = false; }
    if (ok) return { x, y };
  }
  throw new Error('no flat');
}
function place(F, type, x, y, dir) { F.api.give(type, 1); const c = F.api.canPlace(type, x, y, dir || 0); if (!c.ok) throw new Error('canPlace ' + type + ' ' + c.reason); const e = F.api.place(type, x, y, dir || 0, { fromInventory: true }); if (!e) throw new Error('place failed'); return e; }
const strip = o => JSON.stringify(o, (k, v) => (k.startsWith('_') ? undefined : v));

module.exports = {
  dbg_furnace_rate(F) {
    F.newGame({ seed: 42 });
    const a = findFlat(F, 2, 2);
    const e = place(F, 'stone-furnace', a.x, a.y, 0);
    F.api.insertInto(e, 'coal', 2); F.api.insertInto(e, 'iron-ore', 4);
    const log = [];
    for (let i = 1; i <= 800; i++) { F.tick(); if (i % 40 === 0 || i < 4) log.push(i + ':' + e.progress.toFixed(3) + '/' + (e.input[0] ? e.input[0].count : 0) + '/' + (e.output[0] ? e.output[0].count : 0) + '/' + Math.round(e.fuelJ / 1000) + 'kJ/' + (e._status || '?')); }
    return log.join(' ');
  },
  dbg_furnace(F) {
    F.newGame({ seed: 42 });
    const a = findFlat(F, 2, 2);
    const e = place(F, 'stone-furnace', a.x, a.y, 0);
    F.api.insertInto(e, 'coal', 2); F.api.insertInto(e, 'iron-ore', 4);
    const before = strip(e);
    ticks(F, 300);
    return 'before=' + before + ' after=' + strip(e) + ' status=' + (F.machines.status ? F.machines.status(e) : '?') + ' smeltingFor=' + JSON.stringify(F.data.smeltingFor ? F.data.smeltingFor('iron-ore') : null) + ' tickFns=' + ['machines', 'power', 'fluids', 'inserters', 'belts', 'combat', 'pollution', 'research', 'player', 'world'].map(m => m + ':' + (F[m] && typeof F[m].tick)).join(',');
  },
  dbg_power(F) {
    F.newGame({ seed: 42 });
    const a = findFlat(F, 8, 6);
    const solar = place(F, 'solar-panel', a.x, a.y, 0);
    const pole = place(F, 'small-electric-pole', a.x + 3, a.y + 1, 0);
    const src = place(F, 'iron-chest', a.x + 4, a.y + 3, 0);
    const ins = place(F, 'inserter', a.x + 5, a.y + 3, 1);
    const dst = place(F, 'iron-chest', a.x + 6, a.y + 3, 0);
    F.api.insertInto(src, 'iron-plate', 5);
    ticks(F, 200);
    return 'daylight=' + F.power.daylight() + ' netInfo(pole)=' + JSON.stringify(F.power.netInfo(pole)) + ' netInfo(ins)=' + JSON.stringify(F.power.netInfo(ins)) + ' hasNet=' + F.power.hasNetwork(ins) + ' sat=' + F.power.satisfaction(ins) + ' ins=' + strip(ins) + ' solar=' + strip(solar) + ' pole=' + strip(pole) + ' dst=' + strip(dst.inv);
  },
  dbg_pump(F) {
    F.newGame({ seed: 42 });
    const sp = F.world.spawn; const sx = Math.round(sp.x), sy = Math.round(sp.y);
    let pump = null, info = '';
    outer: for (let r = 1; r < 90; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      for (let d = 0; d < 4; d++) if (F.api.canPlace('offshore-pump', sx + dx, sy + dy, d).ok) { F.api.give('offshore-pump', 1); pump = F.api.place('offshore-pump', sx + dx, sy + dy, d, { fromInventory: true }); info = (sx + dx) + ',' + (sy + dy) + ' d' + d; break outer; }
    }
    return 'pump=' + info + ' ' + strip(pump) + ' conns=' + JSON.stringify(F.fluids.connections(pump)) + ' beh=' + F.data.entities['offshore-pump'].behaviour + ' registered=' + Object.keys(F.behaviours).join('|');
  },
  dbg_turret(F) {
    F.newGame({ seed: 42 });
    const a = findFlat(F, 10, 8);
    const t2 = place(F, 'gun-turret', a.x + 5, a.y + 4, 0);
    const u = F.combat.spawnUnit('small-biter', a.x + 6, a.y + 6.5);
    const log = [];
    for (let i = 0; i < 300; i++) { F.tick(); if (i % 60 === 0) log.push(JSON.stringify({ i, ux: +u.x.toFixed(2), uy: +u.y.toFixed(2), st: u.state, tgt: u.target, hp: t2.health, uh: u.health })); }
    return log.join(' ');
  },
  dbg_craft(F) {
    F.newGame({ seed: 42 });
    const b = F.api.inventoryCount('iron-plate');
    F.api.give('iron-plate', 10);
    F.api.craft('iron-gear-wheel', 2);
    ticks(F, 65);
    return 'start plates=' + b + ' now=' + F.api.inventoryCount('iron-plate') + ' gears=' + F.api.inventoryCount('iron-gear-wheel') + ' queue=' + JSON.stringify(F.state.player.craftQueue);
  },
};
