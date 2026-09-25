// Scenario tests for src/52-blueprints.js (copy an area, rotate, paste as ghosts).
// Helpers copied from test/scenarios-ghosts.js (scenario files do not share helpers).
'use strict';

function ticks(F, n) { for (let i = 0; i < n; i++) F.tick(); }
function fresh(F, seed = 42) { F.newGame({ seed }); return F.state; }
function spawn(F) { const s = F.world.spawn; return { x: Math.round(s.x), y: Math.round(s.y) }; }

// Flat buildable w×h rectangle (no water, features, entities or ore), clear of the player.
function findFlat(F, w, h, skip = 0) {
  const sp = spawn(F);
  const pl = F.state.player; const px = Math.floor(pl.x), py = Math.floor(pl.y);
  let found = 0;
  for (let r = 2; r < 200; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = sp.x + dx, y = sp.y + dy;
      let ok = true;
      for (let j = -1; j <= h && ok; j++) for (let i = -1; i <= w && ok; i++) {
        const tx = x + i, ty = y + j;
        if (!F.world.buildable(tx, ty) || F.world.resource(tx, ty) || F.ghosts.at(tx, ty)) ok = false;
        if (Math.abs(tx - px) <= 1 && Math.abs(ty - py) <= 1) ok = false;
      }
      if (ok && found++ >= skip) return { x, y };
    }
  }
  throw new Error('no flat area found');
}

function place(F, assert, type, x, y, dir = 0) {
  F.api.give(type, 1);
  const e = F.api.place(type, x, y, dir, { fromInventory: true });
  assert(e, `place ${type} at ${x},${y} dir ${dir}`);
  return e;
}

// Build every ghost by hand (order given), giving the items first.
function buildAll(F, assert, list) {
  for (const g of list) {
    F.api.give(F.ghosts.itemFor(g), 1);
    const e = F.ghosts.build(g);
    assert(e, `build ghost ${g.type} at ${g.x},${g.y}: ${F.ghosts.lastFailure}`);
  }
}

module.exports = {
  blueprint_create_from_entities_and_ghosts(F, assert) {
    fresh(F);
    F.api.cheat.unlockAll();
    const a = findFlat(F, 8, 4);
    const asm = place(F, assert, 'assembling-machine-1', a.x, a.y, 0);
    assert(F.api.setRecipe(asm, 'iron-gear-wheel'), 'recipe');
    place(F, assert, 'inserter', a.x + 3, a.y + 1, 1);
    F.ghosts.place('wooden-chest', a.x + 4, a.y + 1, 0);
    place(F, assert, 'transport-belt', a.x + 6, a.y + 3, 2); // outside the copied box
    const bp = F.blueprints.create(a.x, a.y, a.x + 4, a.y + 2);
    assert(bp, 'blueprint created');
    assert(bp.entities.length === 3, 'three entries: ' + bp.entities.length);
    assert(bp.w === 5 && bp.h === 3, 'size 5x3: ' + bp.w + 'x' + bp.h);
    const byType = Object.fromEntries(bp.entities.map(e => [e.type, e]));
    assert(byType['assembling-machine-1'].x === 0 && byType['assembling-machine-1'].y === 0, 'assembler at 0,0');
    assert(byType['assembling-machine-1'].settings.recipe === 'iron-gear-wheel', 'recipe captured');
    assert(byType.inserter.x === 3 && byType.inserter.y === 1 && byType.inserter.dir === 1, 'inserter offset + dir');
    assert(byType['wooden-chest'] && byType['wooden-chest'].x === 4, 'ghost chest included');
    const n = F.blueprints.count(bp);
    assert(n['assembling-machine-1'] === 1 && n.inserter === 1 && n['wooden-chest'] === 1, 'item count');
    // A box that only clips the edge of an entity still copies it.
    const bp2 = F.blueprints.create(a.x + 2, a.y + 2, a.x + 2, a.y + 2);
    assert(bp2 && bp2.entities.length === 1 && bp2.entities[0].type === 'assembling-machine-1', 'edge overlap copies the assembler');
    const empty = findFlat(F, 3, 3, 5);
    assert(F.blueprints.create(empty.x, empty.y, empty.x + 2, empty.y + 2) === null, 'empty box returns null');
    return 'ok';
  },

  blueprint_rotation_geometry(F, assert) {
    fresh(F);
    const bp = {
      w: 5, h: 4, entities: [
        { type: 'splitter', x: 0, y: 0, dir: 0 },                // 2x1 at top-left
        { type: 'transport-belt', x: 4, y: 0, dir: 1 },          // top-right, going east
        { type: 'steam-engine', x: 0, y: 1, dir: 1 },            // dir 1: 5 wide, 3 tall
      ],
    };
    const r1 = F.blueprints.rotate(bp, 1);
    assert(r1.w === 4 && r1.h === 5, 'rotated bounding box ' + r1.w + 'x' + r1.h);
    const find = (b, t) => b.entities.find(e => e.type === t);
    const sp = find(r1, 'splitter');
    assert(sp.dir === 1, 'splitter now faces east');
    const belt = find(r1, 'transport-belt');
    assert(belt.dir === 2, 'east belt now goes south');
    const eng = find(r1, 'steam-engine');
    assert(eng.dir === 0, 'steam engine dir 1 -> 2 folds onto 0: ' + eng.dir);
    // Four turns come back to the original layout.
    const r4 = F.blueprints.rotate(bp, 4);
    const key = b => b.entities.map(e => `${e.type}@${e.x},${e.y}/${e.dir}`).sort().join(' ');
    assert(key(r4) === key(F.blueprints.rotate(bp, 0)), 'four turns = identity');
    const back = F.blueprints.rotate(r1, -1);
    assert(key(back) === key(F.blueprints.rotate(bp, 0)), 'ccw undoes cw');
    // No two entries overlap after rotating.
    for (const b of [r1, F.blueprints.rotate(bp, 2), F.blueprints.rotate(bp, 3)]) {
      const seen = new Set();
      for (const e of b.entities) {
        const fp = F.entities.footprint(F.data.entities[e.type], e.dir);
        for (let j = 0; j < fp[1]; j++) for (let i = 0; i < fp[0]; i++) {
          const k = (e.x + i) + ',' + (e.y + j);
          assert(!seen.has(k), 'overlap at ' + k);
          assert(e.x + i < b.w && e.y + j < b.h && e.x >= 0 && e.y >= 0, 'inside the box');
          seen.add(k);
        }
      }
    }
    return 'ok';
  },

  blueprint_paste_makes_ghosts_and_builds_working_line(F, assert) {
    fresh(F);
    F.api.cheat.unlockAll();
    // Source: chest -> inserter -> chest, with a burner inserter so no power is needed.
    const a = findFlat(F, 3, 1);
    const src = place(F, assert, 'wooden-chest', a.x, a.y);
    place(F, assert, 'burner-inserter', a.x + 1, a.y, 1);
    place(F, assert, 'wooden-chest', a.x + 2, a.y);
    const bp = F.blueprints.create(a.x, a.y, a.x + 2, a.y);
    assert(bp && bp.entities.length === 3, 'copied 3');
    // Paste rotated 90°: the line now runs top to bottom.
    const rot = F.blueprints.rotate(bp, 1);
    assert(rot.w === 1 && rot.h === 3, 'vertical after rotation');
    const b = findFlat(F, 1, 3, 3);
    const res = F.blueprints.place(rot, b.x, b.y);
    assert(res.placed === 3 && res.blocked === 0, 'placed 3 ghosts: ' + JSON.stringify(res));
    const ins = F.ghosts.at(b.x, b.y + 1);
    assert(ins && ins.type === 'burner-inserter' && ins.dir === 2, 'inserter ghost points south');
    // Pasting again at the same spot changes nothing.
    const again = F.blueprints.place(rot, b.x, b.y);
    assert(F.ghosts.count() === 3 && again.blocked === 0, 'repeat paste is idempotent');
    buildAll(F, assert, F.ghosts.all().slice());
    assert(F.ghosts.count() === 0, 'all ghosts built');
    const top = F.api.entityAt(b.x, b.y), bottom = F.api.entityAt(b.x, b.y + 2), mid = F.api.entityAt(b.x, b.y + 1);
    F.api.insertInto(mid, 'coal', 5);
    F.api.insertInto(top, 'iron-plate', 10);
    ticks(F, 60 * 15);
    const moved = F.inv.count(bottom.inv || bottom.main || [], 'iron-plate') ||
      F.entities.inventories(bottom).reduce((n, g) => n + F.inv.count(g.inv, 'iron-plate'), 0);
    assert(moved > 0, 'rotated copy moves plates top -> bottom: ' + moved);
    assert(src, 'source kept');
    // Pasting over the built copy counts the buildings as existing.
    const over = F.blueprints.place(rot, b.x, b.y);
    assert(over.existing === 3 && over.placed === 0, 'existing buildings recognised: ' + JSON.stringify(over));
    return 'moved ' + moved;
  },

  blueprint_paste_skips_blocked_parts(F, assert) {
    fresh(F);
    const a = findFlat(F, 4, 1);
    const bp = { w: 4, h: 1, entities: [0, 1, 2, 3].map(i => ({ type: 'wooden-chest', x: i, y: 0, dir: 0 })) };
    place(F, assert, 'iron-chest', a.x + 2, a.y); // blocks entry 2
    const ok = F.blueprints.check(bp, a.x, a.y);
    assert(ok.join() === 'true,true,false,true', 'check: ' + ok.join());
    const r = F.blueprints.place(bp, a.x, a.y);
    assert(r.placed === 3 && r.blocked === 1, 'three placed, one blocked: ' + JSON.stringify(r));
    return 'ok';
  },

  blueprint_underground_pair_survives_build_order(F, assert) {
    fresh(F);
    const a = findFlat(F, 5, 1);
    const inn = place(F, assert, 'underground-belt', a.x, a.y, 1);
    const out = place(F, assert, 'underground-belt', a.x + 4, a.y, 1);
    assert(inn.io === 'in' && out.io === 'out' && inn.pairId === out.id, 'source pair');
    const bp = F.blueprints.create(a.x, a.y, a.x + 4, a.y);
    const b = findFlat(F, 5, 1, 2);
    F.blueprints.place(bp, b.x, b.y);
    // Build the EXIT first: without the remembered role it would become an entrance.
    const gExit = F.ghosts.at(b.x + 4, b.y), gEntr = F.ghosts.at(b.x, b.y);
    assert(gExit.settings && gExit.settings.io === 'out', 'exit role remembered');
    buildAll(F, assert, [gExit, gEntr]);
    const e1 = F.api.entityAt(b.x, b.y), e2 = F.api.entityAt(b.x + 4, b.y);
    assert(e1.io === 'in' && e2.io === 'out', 'roles: ' + e1.io + '/' + e2.io);
    assert(e1.pairId === e2.id && e2.pairId === e1.id, 'paired');
    return 'ok';
  },

  blueprint_train_stop_next_to_planned_rail(F, assert) {
    fresh(F);
    F.api.cheat.unlockAll();
    const a = findFlat(F, 4, 2);
    const bp = {
      w: 4, h: 2, entities: [
        { type: 'train-stop', x: 1, y: 1, dir: 0 },
        { type: 'rail', x: 0, y: 0, dir: 0 }, { type: 'rail', x: 1, y: 0, dir: 0 },
        { type: 'rail', x: 2, y: 0, dir: 0 }, { type: 'rail', x: 3, y: 0, dir: 0 },
      ],
    };
    const norm = F.blueprints.rotate(bp, 0); // normalise: rails sorted first
    assert(F.data.entities[norm.entities[0].type].layer === 'floor', 'rails first');
    const ok = F.blueprints.check(norm, a.x, a.y);
    assert(ok.every(Boolean), 'preview valid: ' + ok.join());
    const r = F.blueprints.place(norm, a.x, a.y);
    assert(r.placed === 5 && r.blocked === 0, 'stop planned next to planned rail: ' + JSON.stringify(r));
    return 'ok';
  },

  blueprint_clipboard_saved(F, assert) {
    fresh(F);
    assert(F.blueprints.clipboard() === null, 'empty on new game');
    const a = findFlat(F, 2, 1);
    place(F, assert, 'wooden-chest', a.x, a.y);
    place(F, assert, 'iron-chest', a.x + 1, a.y);
    F.blueprints.setClipboard(F.blueprints.create(a.x, a.y, a.x + 1, a.y));
    const json = F.save();
    fresh(F, 3);
    assert(F.blueprints.clipboard() === null, 'new game clears clipboard');
    assert(F.load(json), 'loaded');
    const cb = F.blueprints.clipboard();
    assert(cb && cb.entities.length === 2 && cb.w === 2, 'clipboard restored');
    // Old save without the key.
    const tree = JSON.parse(json); delete tree.blueprints;
    assert(F.load(JSON.stringify(tree)) && F.blueprints.clipboard() === null, 'old save loads');
    return 'ok';
  },
};
