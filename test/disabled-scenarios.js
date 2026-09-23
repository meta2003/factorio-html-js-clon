// Disabled-feature scenarios for Factio — NOT run by the default
// `node test/headless.js --ticks 3600 --summary` (that uses test/scenarios.js).
//
// These exercise combat (gun-turret, biter units, F.combat), which is
// excluded from the current build (F.FEATURES.combat off — see
// src/disabled/README.md). To run this file, first move
// src/disabled/35-combat.js and src/disabled/01_data-combat.js back into
// src/, set F.FEATURES.combat = true in src/00-core.js, rebuild, and then:
//   node test/headless.js --scenarios test/disabled-scenarios.js --ticks 3600 --summary
'use strict';

const TPS = 60;
function ticks(F, n) { for (let i = 0; i < n; i++) F.tick(); }
function fresh(F, seed = 42) { F.newGame({ seed }); return F.state; }

function findFlat(F, w, h, opts = {}) {
  const sp = F.world.spawn;
  const spx = Math.round(sp.x), spy = Math.round(sp.y);
  const pl = F.state.player; const px = Math.floor(pl.x), py = Math.floor(pl.y);
  for (let r = 2; r < 140; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = spx + dx, y = spy + dy;
      let ok = true;
      for (let j = -1; j <= h && ok; j++) for (let i = -1; i <= w && ok; i++) {
        const tx = x + i, ty = y + j;
        if (!F.world.buildable(tx, ty)) ok = false;
        if (!opts.allowOre && F.world.resource(tx, ty)) ok = false;
        if (Math.abs(tx - px) <= 1 && Math.abs(ty - py) <= 1) ok = false;
      }
      if (ok) return { x, y };
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

module.exports = {
  turret_kills_biter(F, assert) {
    fresh(F);
    const a = findFlat(F, 10, 8);
    const t = place(F, assert, 'gun-turret', a.x, a.y, 0);
    assert(F.api.insertInto(t, 'firearm-magazine', 5) === 5, 'ammo inserted');
    const u = F.combat.spawnUnit('small-biter', a.x + 8, a.y + 1);
    assert(u && u.health > 0, 'unit spawned');
    ticks(F, 5 * TPS);
    assert(F.state.units.indexOf(u) === -1 || u.health <= 0, 'small biter killed by turret within 5 s');
    assert(F.api.remove(a.x, a.y, { toInventory: false }), 'remove the armed turret before the second part');
    const t2 = place(F, assert, 'gun-turret', a.x + 5, a.y + 4, 0);
    const hp = t2.health;
    F.combat.spawnUnit('small-biter', a.x + 6, a.y + 6.5);
    ticks(F, 5 * TPS);
    assert(t2.health < hp, `biter damages an unarmed turret (${hp} → ${t2.health})`);
  },
};
