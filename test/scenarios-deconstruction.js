// Scenario tests for src/54-deconstruction.js (deconstruction planner) and the robot side in
// src/53-construction.js. Helpers copied from test/scenarios-construction.js.
'use strict';

function ticks(F, n) { for (let i = 0; i < n; i++) F.tick(); }
function fresh(F, seed = 42) { F.newGame({ seed }); return F.state; }
function spawn(F) { const s = F.world.spawn; return { x: Math.round(s.x), y: Math.round(s.y) }; }

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
        if (Math.abs(tx - px) <= 2 && Math.abs(ty - py) <= 2) ok = false;
      }
      if (ok && found++ >= skip) return { x, y };
    }
  }
  throw new Error('no flat area found');
}

// Nearest tile with the given feature (1 tree, 2/3 rock) to (x, y) within `radius`, whose
// orthogonal neighbours are not entities (so it can be a ghost target).
function findFeature(F, x, y, radius, kinds = [1]) {
  for (let r = 0; r <= radius; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    const tx = x + dx, ty = y + dy;
    if (kinds.indexOf(F.world.feature(tx, ty)) >= 0 && !F.world.entityAt(tx, ty)) return { x: tx, y: ty };
  }
  return null;
}

function place(F, assert, type, x, y, dir = 0) {
  F.api.give(type, 1);
  const e = F.api.place(type, x, y, dir, { fromInventory: true });
  assert(e, `place ${type} at ${x},${y}`);
  return e;
}

// Unpowered roboport (robots fly at 20 %: slow but no solar plant needed) + storage chest.
function setup(F, assert, robots = 5, opts = {}) {
  const a = findFlat(F, 8, 5);
  const rp = place(F, assert, 'roboport', a.x, a.y, 0);
  const chest = opts.noStorage ? null : place(F, assert, 'storage-chest', a.x + 5, a.y + 1, 0);
  if (robots) F.api.insertInto(rp, 'construction-robot', robots);
  return { a, rp, chest, cx: a.x + 2, cy: a.y + 2 };
}

function runUntil(F, pred, max) {
  for (let i = 0; i < max; i++) { if (pred()) return i; F.tick(); }
  return pred() ? max : -1;
}

function groundCount(F, id) {
  let n = 0;
  for (const k in F.state.ground) if (F.state.ground[k] && F.state.ground[k].id === id) n += F.state.ground[k].count;
  return n;
}

module.exports = {
  decon_mark_unmark_and_save(F, assert) {
    fresh(F);
    const a = findFlat(F, 6, 2);
    const c1 = place(F, assert, 'wooden-chest', a.x, a.y);
    const c2 = place(F, assert, 'iron-chest', a.x + 1, a.y);
    F.ghosts.place('wooden-chest', a.x + 3, a.y, 0);
    const res = F.deconstruction.mark(a.x, a.y, a.x + 3, a.y);
    assert(res.entities === 2 && res.ghosts === 1, 'marked 2 entities, cancelled 1 ghost: ' + JSON.stringify(res));
    assert(F.deconstruction.isMarked(c1) && F.deconstruction.isMarked(c2), 'both marked');
    assert(F.ghosts.count() === 0, 'ghost cancelled');
    const again = F.deconstruction.mark(a.x, a.y, a.x + 3, a.y);
    assert(again.entities === 0, 'marking twice counts nothing new');
    const un = F.deconstruction.unmark(a.x + 1, a.y, a.x + 1, a.y);
    assert(un.entities === 1 && !F.deconstruction.isMarked(c2) && F.deconstruction.isMarked(c1), 'unmark one');
    // A tree somewhere near spawn.
    const sp = spawn(F);
    const tree = findFeature(F, sp.x, sp.y, 120);
    assert(tree, 'a tree exists');
    assert(F.deconstruction.mark(tree.x, tree.y, tree.x, tree.y).features === 1, 'tree marked');
    assert(F.deconstruction.featureMarked(tree.x, tree.y), 'featureMarked');
    // Save/load keeps marks; an old save without the key loads clean.
    const json = F.save();
    fresh(F, 5);
    assert(F.deconstruction.count() === 0, 'new game has no marks');
    assert(F.load(json), 'loaded');
    assert(F.deconstruction.isMarked(F.api.entityAt(a.x, a.y)) && F.deconstruction.featureMarked(tree.x, tree.y), 'marks restored');
    assert(F.deconstruction.count() === 2, 'two marks: ' + F.deconstruction.count());
    // Mining by hand clears the marks.
    F.api.remove(a.x, a.y);
    F.world.removeFeature(tree.x, tree.y);
    assert(F.deconstruction.targets().length === 0 && F.deconstruction.count() === 0, 'marks dropped when the targets are gone');
    const tree2 = JSON.parse(json); delete tree2.decon;
    assert(F.load(JSON.stringify(tree2)) && F.deconstruction.count() === 0, 'old save loads');
    return 'ok';
  },

  decon_robots_take_down_chest_with_contents(F, assert) {
    fresh(F);
    const { rp, chest } = setup(F, assert, 2);
    const t = findFlat(F, 1, 1, 10);
    const box = place(F, assert, 'iron-chest', t.x, t.y);
    F.api.insertInto(box, 'copper-plate', 40);
    F.deconstruction.mark(t.x, t.y, t.x, t.y);
    const n = runUntil(F, () => !F.api.entityAt(t.x, t.y), 60 * 120);
    assert(n >= 0, 'chest taken down');
    runUntil(F, () => F.construction.count() === 0, 60 * 300);
    assert(F.construction.count() === 0, 'robot home');
    assert(F.inv.count(chest.inv, 'iron-chest') === 1, 'chest item in storage');
    assert(F.inv.count(chest.inv, 'copper-plate') === 40, 'contents in storage: ' + F.inv.count(chest.inv, 'copper-plate'));
    assert(F.inv.count(rp.cbots, 'construction-robot') === 2, 'robots back');
    assert(F.deconstruction.count() === 0, 'mark gone');
    return 'took ' + n + ' ticks';
  },

  decon_robots_cut_trees_for_wood(F, assert) {
    fresh(F);
    const { chest, cx, cy } = setup(F, assert, 4);
    const tree = findFeature(F, cx, cy, 50);
    assert(tree, 'tree within the construction area');
    F.deconstruction.mark(tree.x - 1, tree.y - 1, tree.x + 1, tree.y + 1);
    const marked = F.deconstruction.count();
    assert(marked >= 1, 'marked ' + marked);
    runUntil(F, () => F.deconstruction.count() === 0 && F.construction.count() === 0, 60 * 400);
    assert(F.deconstruction.count() === 0, 'all cut');
    assert(!F.world.feature(tree.x, tree.y), 'tree gone');
    assert(F.inv.count(chest.inv, 'wood') >= 4, 'wood in storage: ' + F.inv.count(chest.inv, 'wood'));
    return marked + ' features, wood=' + F.inv.count(chest.inv, 'wood');
  },

  decon_waits_without_storage_chest(F, assert) {
    fresh(F);
    const { rp } = setup(F, assert, 2, { noStorage: true });
    const t = findFlat(F, 1, 1, 10);
    place(F, assert, 'wooden-chest', t.x, t.y);
    F.deconstruction.mark(t.x, t.y, t.x, t.y);
    ticks(F, 60 * 5);
    const st = F.construction.stats(F.robots.networkOf(rp));
    assert(st.decon === 1 && st.noStorage === 1 && st.busy === 0, 'waiting for storage: ' + JSON.stringify(st));
    assert(F.api.entityAt(t.x, t.y), 'still standing');
    return 'ok';
  },

  decon_ghost_over_tree_cut_then_built(F, assert) {
    fresh(F);
    const { chest, cx, cy } = setup(F, assert, 4);
    F.api.insertInto(chest, 'wooden-chest', 1);
    const tree = findFeature(F, cx, cy, 50);
    assert(tree, 'tree in range');
    assert(!F.api.canPlace('wooden-chest', tree.x, tree.y, 0).ok, 'a real chest cannot go on the tree');
    const g = F.ghosts.place('wooden-chest', tree.x, tree.y, 0);
    assert(g, 'ghost allowed over the tree');
    assert(F.deconstruction.featureMarked(tree.x, tree.y), 'tree marked automatically');
    assert(F.ghosts.blockedByFeature(g), 'ghost waits for the tree');
    F.api.give('wooden-chest', 1);
    assert(!F.ghosts.build(g) && F.ghosts.lastFailure === 'blocked', 'hand build blocked by the tree');
    const n = runUntil(F, () => F.api.entityAt(tree.x, tree.y), 60 * 400);
    assert(n >= 0, 'tree cut and chest built');
    assert(!F.world.feature(tree.x, tree.y), 'tree gone');
    assert(F.inv.count(chest.inv, 'wood') >= 4, 'wood stored');
    return 'built after ' + n + ' ticks';
  },

  decon_target_mined_by_hand_mid_flight(F, assert) {
    fresh(F);
    const { rp, chest } = setup(F, assert, 1);
    const t = findFlat(F, 1, 1, 14);
    const box = place(F, assert, 'wooden-chest', t.x, t.y);
    F.api.insertInto(box, 'iron-plate', 10);
    F.deconstruction.mark(t.x, t.y, t.x, t.y);
    runUntil(F, () => F.construction.count() > 0, 60 * 5);
    assert(F.construction.count() === 1, 'robot on its way');
    const plates0 = F.api.inventoryCount('iron-plate');
    F.api.remove(t.x, t.y); // the player gets there first
    assert(F.api.inventoryCount('iron-plate') === plates0 + 10, 'player got the contents');
    runUntil(F, () => F.construction.count() === 0, 60 * 300);
    assert(F.construction.count() === 0 && F.inv.count(rp.cbots, 'construction-robot') === 1, 'robot came home');
    assert(F.inv.count(chest.inv, 'iron-plate') === 0 && groundCount(F, 'iron-plate') === 0, 'nothing duplicated');
    return 'ok';
  },

  decon_out_of_range_untouched(F, assert) {
    fresh(F);
    const { cx, cy } = setup(F, assert, 2);
    let far = null;
    for (let d = 70; d < 200 && !far; d++) if (F.api.canPlace('wooden-chest', cx + d, cy, 0).ok) far = { x: cx + d, y: cy };
    assert(far, 'far tile');
    place(F, assert, 'wooden-chest', far.x, far.y);
    F.deconstruction.mark(far.x, far.y, far.x, far.y);
    ticks(F, 60 * 5);
    assert(F.api.entityAt(far.x, far.y) && F.construction.count() === 0, 'far chest untouched');
    return 'ok';
  },
};
