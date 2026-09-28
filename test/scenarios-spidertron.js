// Scenario tests for the spidertron (src/39-spidertron.js, data in src/09-data-spidertron.js).
// Each scenario receives (F, assert, window) and may return a note string.
'use strict';

function fresh(F, seed) { F.newGame({ seed: seed == null ? 42 : seed }); return F.state; }
// drive with a held movement direction (F.tick reads F.input.state, like the real input does)
function ticks(F, n, input) {
  const st = F.input.state, mx = st.mx, my = st.my;
  st.mx = (input && input.mx) || 0; st.my = (input && input.my) || 0;
  try { for (let i = 0; i < n; i++) F.tick(); } finally { st.mx = mx; st.my = my; }
}
function spawn(F) { const s = F.world.spawn; return { x: Math.round(s.x), y: Math.round(s.y) }; }
function findFlat(F, w, h) {
  const sp = spawn(F);
  const pl = F.state.player; const px = Math.floor(pl.x), py = Math.floor(pl.y);
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
      if (ok) return { x, y };
    }
  }
  throw new Error('no flat area found');
}
function pressEnter(F) {
  const hs = (F._inputKeys && F._inputKeys['enter']) || [];
  for (let i = 0; i < hs.length; i++) if (hs[i]({})) return true;
  return false;
}

module.exports = {
  spidertron_data_recipe_and_tech(F, assert) {
    fresh(F, 3);
    assert(F.data.items['spidertron'] && F.data.items['spidertron'].vehicle === 'spidertron', 'spidertron item is a vehicle');
    const r = F.data.recipes['spidertron'];
    assert(r && r.unlockedBy === 'spidertron', 'recipe unlocked by the spidertron tech');
    r.ingredients.forEach(([id]) => assert(F.data.items[id], 'ingredient exists: ' + id));
    const t = F.data.techs['spidertron'];
    assert(t && t.prereq.every(p => F.data.techs[p]), 'tech prerequisites exist');
    assert(F.t('item.spidertron') === 'Spidertron', 'item name translated');
  },

  spidertron_place_board_walk_over_buildings(F, assert) {
    fresh(F, 3);
    const a = findFlat(F, 14, 5);
    // a wall of chests across the path
    for (let y = 0; y < 5; y++) assert(F.api.place('iron-chest', a.x + 7, a.y + y, 0, { fromInventory: false }), 'chest placed');
    const s = F.api.placeVirtual('spidertron', a.x + 3, a.y + 2, 1, { fromInventory: false });
    assert(s && F.state.spiders.length === 1, 'spidertron placed');
    F.state.player.x = s.x; F.state.player.y = s.y + 1.5;
    assert(pressEnter(F), 'Enter boards the spidertron');
    assert(F.state.player.ridingSpider === s.id, 'player is aboard');
    const x0 = s.x;
    ticks(F, 60, { mx: 1, my: 0 });
    assert(s.x > a.x + 9, 'walked east over the chest wall (x ' + x0.toFixed(1) + ' -> ' + s.x.toFixed(1) + ')');
    assert(Math.abs(F.state.player.x - s.x) < 1e-6 && Math.abs(F.state.player.y - s.y) < 1e-6, 'player rides along');
    assert(Math.abs(Math.cos(s.heading) - 1) < 0.1, 'body turned to face east');
    const speed = (s.x - x0) / 60;
    assert(speed > 8.9 / 60, 'faster than walking (' + (speed * 60).toFixed(1) + ' tiles/s)');
    assert(pressEnter(F), 'Enter steps out again');
    assert(!F.state.player.ridingSpider, 'player left the spidertron');
    assert(F.util.dist(F.state.player.x, F.state.player.y, s.x, s.y) > 1, 'player set down beside the body');
    return 'walked ' + (s.x - x0).toFixed(1) + ' tiles in 1 s';
  },

  spidertron_stops_at_water(F, assert) {
    fresh(F, 3);
    // find a land tile with water somewhere to its east within 30 tiles
    const sp = spawn(F);
    let start = null;
    for (let r = 0; r < 200 && !start; r++) for (let dy = -r; dy <= r && !start; dy++) for (let dx = -r; dx <= r && !start; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = sp.x + dx, y = sp.y + dy;
      if (F.world.terrain(x, y) < 2) continue;
      for (let k = 3; k < 30; k++) if (F.world.terrain(x + k, y) < 2) { let land = true; for (let j = 0; j < 3; j++) if (F.world.terrain(x + j, y) < 2 || F.world.terrain(x + j, y - 1) < 2 || F.world.terrain(x + j, y + 1) < 2) land = false; if (land) start = { x, y, wx: x + k }; break; }
    }
    if (!start) return 'no shoreline near spawn (skipped)';
    const s = F.api.placeVirtual('spidertron', start.x, start.y, 1, { fromInventory: false });
    assert(s, 'placed on land');
    F.state.player.x = s.x; F.state.player.y = s.y; pressEnter(F);
    const x0 = s.x;
    ticks(F, 300, { mx: 1, my: 0 });
    assert(s.x > x0 + 1, 'walked toward the water first');
    assert(s.x < start.wx, 'stopped before the water (x ' + s.x.toFixed(1) + ', water at ' + start.wx + ')');
    assert(F.world.terrain(Math.floor(s.x), Math.floor(s.y)) >= 2, 'standing on land');
  },

  spidertron_trunk_mine_and_save(F, assert) {
    fresh(F, 3);
    const a = findFlat(F, 6, 6);
    const s = F.api.placeVirtual('spidertron', a.x + 3, a.y + 3, 0, { fromInventory: false });
    assert(s.inv.length === 80, 'trunk has 80 slots');
    F.inv.add(s.inv, 'iron-plate', 150);
    const json = F.save();
    assert(json, 'saved');
    F.load(json);
    const back = F.state.spiders && F.state.spiders[0];
    assert(back && F.inv.count(back.inv, 'iron-plate') === 150, 'spidertron and trunk survive save/load');
    const pick = F.api.pickAt ? F.api.pickAt(back.x, back.y - 1.6) : null;
    assert(pick && pick.kind === 'spidertron', 'picker hits the body');
    const before = F.inv.count(F.state.player.inv, 'iron-plate');
    assert(pick.mine(), 'mined');
    assert(F.state.spiders.length === 0, 'removed from the world');
    assert(F.inv.count(F.state.player.inv, 'spidertron') === 1, 'spidertron item returned');
    assert(F.inv.count(F.state.player.inv, 'iron-plate') - before === 150, 'trunk contents returned');
  },
};
