// Where to build: a reservation map of the bot's own planned buildings, a spot finder, and
// electric poles that connect every powered building to the main network.
'use strict';
const { key, spiral, grow } = require('./util');

function createSpace(ctx) {
  const F = ctx.F;
  const reserved = new Map(); // "x,y" -> tag

  function isReserved(x, y) { return reserved.has(key(x, y)); }
  function reserve(r, tag) {
    for (let j = 0; j < r.h; j++) for (let i = 0; i < r.w; i++) reserved.set(key(r.x + i, r.y + j), tag || true);
  }
  function release(r) {
    for (let j = 0; j < r.h; j++) for (let i = 0; i < r.w; i++) reserved.delete(key(r.x + i, r.y + j));
  }

  // A tile a building may go on once its tree/rock is mined: land, no entity, not reserved.
  function tileOk(x, y, allowOre) {
    if (!F.world.isLand(x, y) || F.world.entityAt(x, y) || reserved.has(key(x, y)) || ctx.pipes.isKeepout(x, y)) return false;
    if (!allowOre && F.world.resource(x, y)) return false;
    return true;
  }
  function featuresIn(r) {
    let n = 0;
    for (let j = 0; j < r.h; j++) for (let i = 0; i < r.w; i++) if (F.world.feature(r.x + i, r.y + j)) n++;
    return n;
  }
  // Queue hand-mining of every tree/rock in r. Returns true when r is already clear.
  function clear(r) {
    let clean = true;
    for (let j = 0; j < r.h; j++) for (let i = 0; i < r.w; i++) {
      const x = r.x + i, y = r.y + j;
      if (F.world.feature(x, y)) { clean = false; if (!ctx.hands.mining() || !queued.has(key(x, y))) { queued.add(key(x, y)); ctx.hands.mine({ x, y, kind: 'feature' }); } }
    }
    return clean;
  }
  const queued = new Set();

  // Find a w×h rectangle near (ax, ay): every tile of the rectangle grown by `margin` is
  // free land (ore allowed only with opts.allowOre); trees/rocks are allowed (they get mined)
  // up to opts.maxFeatures. With opts.pitch the origin snaps to that lattice.
  function findSpot(w, h, ax, ay, opts) {
    opts = opts || {};
    const margin = opts.margin == null ? 1 : opts.margin;
    const pitch = opts.pitch || 1;
    const maxF = opts.maxFeatures == null ? 6 : opts.maxFeatures;
    const ox = opts.originX || 0, oy = opts.originY || 0;
    for (const [cx, cy] of spiral(Math.round(ax / pitch), Math.round(ay / pitch), opts.radius || 60)) {
      const x = cx * pitch + ox, y = cy * pitch + oy;
      // cheap early outs before scanning the whole rectangle
      if (!tileOk(x, y, opts.allowOre) || !tileOk(x + w - 1, y + h - 1, opts.allowOre)) continue;
      const r = { x, y, w, h };
      const g = grow(r, margin);
      let ok = true;
      for (let j = 0; j < g.h && ok; j++) for (let i = 0; i < g.w && ok; i++) {
        const inside = i >= margin && j >= margin && i < g.w - margin && j < g.h - margin;
        const tx = g.x + i, ty = g.y + j;
        if (inside) { if (!tileOk(tx, ty, opts.allowOre)) ok = false; }
        else if (!F.world.isLand(tx, ty) || reserved.has(key(tx, ty)) || (F.world.entityAt(tx, ty) && !opts.marginEntitiesOk)) ok = false;
      }
      if (!ok) continue;
      if (featuresIn(r) > maxF) continue;
      if (opts.test && !opts.test(r)) continue;
      return r;
    }
    return null;
  }

  // ------------------------------------------------------------------ electric poles
  function poleType() {
    // small poles cost wood, which is scarce: medium poles as soon as they are researched
    return F.research.isRecipeUnlocked('medium-electric-pole') ? 'medium-electric-pole' : 'small-electric-pole';
  }
  function poleDef(t) { return F.data.entities[t].pole; }
  const POLE_TYPES = ['small-electric-pole', 'medium-electric-pole', 'big-electric-pole', 'substation'];
  function allPoles() { const out = []; for (const t of POLE_TYPES) for (const e of F.entities.ofType(t) || []) if (!e._removed) out.push(e); return out; }
  function mainNetId() {
    const g = ctx.power && ctx.power.generators[0];
    if (!g) return null;
    const info = F.power.netInfo(g);
    return info && info.id;
  }
  function onMain(e) {
    const id = mainNetId();
    if (id == null) return false;
    return F.power.hasNetwork(e) && F.power.netInfo(e).id === id;
  }
  function freePoleTile(x, y) {
    return F.world.buildable(x, y) && !F.world.entityAt(x, y) && !reserved.has(key(x, y)) && !ctx.pipes.isKeepout(x, y);
  }

  // Connect building e (or any rect) to the main network with poles. Returns true when e is
  // powered by the main network (possibly after placing poles this call).
  function ensurePowered(e, rect) {
    if (e && onMain(e)) return true;
    const def = e && F.data.entities[e.type];
    const r = rect || { x: e.x, y: e.y, w: F.entities.footprint(def, e.dir)[0], h: F.entities.footprint(def, e.dir)[1] };
    const mainId = mainNetId();
    const cxr = r.x + r.w / 2, cyr = r.y + r.h / 2;
    let net = mainId == null ? [] : allPoles().filter(p => F.power.netInfo(p).id === mainId);
    if (net.length > 40) {
      const near = net.filter(p => Math.abs(p.x - cxr) < 40 && Math.abs(p.y - cyr) < 40);
      if (near.length) net = near;
      else { net.sort((a, b) => Math.hypot(a.x - cxr, a.y - cyr) - Math.hypot(b.x - cxr, b.y - cyr)); net = net.slice(0, 5); }
    }
    const type = poleType();
    const pd = poleDef(type);
    const cover = Math.floor(pd.supply - 0.5);
    // candidate pole tiles around r
    const cands = [];
    for (let y = r.y - cover; y < r.y + r.h + cover; y++) for (let x = r.x - cover; x < r.x + r.w + cover; x++) {
      if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) continue;
      if (freePoleTile(x, y)) cands.push([x, y]);
    }
    if (!cands.length) { ctx.lastPowerFail = 'no free pole tile around'; return false; }
    if (!net.length) {
      // only a generator may start the main network; everything else waits for it
      if (!ctx.power || ctx.power.generators[0] !== e) { ctx.lastPowerFail = 'no main network yet'; return false; }
      const c = cands[0];
      placePole(type, c[0], c[1]);
      return onMain(e);
    }
    const reachOf = p => poleDef(p.type).reach;
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    let best = null;
    for (const c of cands) {
      for (const p of net) {
        const d = dist(c, [p.x + (F.data.entities[p.type].size[0] - 1) / 2, p.y + (F.data.entities[p.type].size[1] - 1) / 2]);
        if (!best || d - Math.min(pd.reach, reachOf(p)) < best.slack) best = { c, p, d, slack: d - Math.min(pd.reach, reachOf(p)) };
      }
    }
    if (best.slack <= -0.2) { placePole(type, best.c[0], best.c[1]); return onMain(e); }
    // Chain poles from the nearest network pole toward the target.
    let from = [best.p.x, best.p.y], fromReach = Math.min(pd.reach, reachOf(best.p));
    const target = best.c;
    for (let guard = 0; guard < 80; guard++) {
      if (dist(from, target) <= fromReach - 0.2) { placePole(type, target[0], target[1]); return onMain(e); }
      const step = fromReach - 0.6;
      const k = step / dist(from, target);
      const ix = from[0] + (target[0] - from[0]) * k, iy = from[1] + (target[1] - from[1]) * k;
      let pick = null;
      for (const [tx, ty] of spiral(Math.round(ix), Math.round(iy), 3)) {
        if (!freePoleTile(tx, ty) || dist([tx, ty], from) > fromReach - 0.2) continue;
        if (!pick || dist([tx, ty], target) < dist(pick, target)) pick = [tx, ty];
      }
      if (!pick) {
        // blocked by trees: clear the ideal tile and try again next time
        clear({ x: Math.round(ix), y: Math.round(iy), w: 1, h: 1 });
        ctx.lastPowerFail = 'chain blocked near ' + Math.round(ix) + ',' + Math.round(iy);
        return false;
      }
      const pole = placePole(type, pick[0], pick[1]);
      if (!pole) { ctx.lastPowerFail = 'no pole item'; return false; }
      from = pick; fromReach = pd.reach;
    }
    return false;
  }
  function placePole(type, x, y) {
    const p = ctx.hands.place(type, x, y, 0);
    if (!p) { ctx.need(type, 4); return null; }
    ctx.stats.poles++;
    return p;
  }

  return { isReserved, reserve, release, tileOk, featuresIn, clear, findSpot, ensurePowered, onMain, mainNetId, poleType };
}

module.exports = { createSpace };
