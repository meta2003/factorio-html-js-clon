// The bot's buildings: a registry by kind, the per-step "walk around the factory" that empties
// outputs into the warehouse and loads inputs/fuel (like a player hand-feeding machines), and
// builders that choose a spot for each kind of building and hook it up (power, pipes).
'use strict';
const { key } = require('./util');

const FUEL = ['solid-fuel', 'coal', 'wood'];

function createMachines(ctx) {
  const F = ctx.F;
  const H = ctx.hands;
  const S = ctx.hands.stock;
  const list = [];            // all records
  const byCls = {};           // cls -> [records]
  function add(rec) { list.push(rec); (byCls[rec.cls] = byCls[rec.cls] || []).push(rec); return rec; }
  function of(cls) { return (byCls[cls] || []).filter(r => !r.e._removed); }
  function count(cls) { return of(cls).length; }

  // ------------------------------------------------------------------ feeding
  function fuelItem() { for (const f of FUEL) if (S.count(f) > 0) return f; return null; }
  function refuel(e, want) {
    const g = (F.entities.inventories(e) || []).find(x => x.name === 'fuel');
    if (!g) return;
    let have = 0; for (const s of g.inv) if (s) have += s.count * (F.data.items[s.id].fuel || 0);
    const needMJ = want * 4 - have;
    if (needMJ <= 0) return;
    const f = fuelItem(); if (!f) { ctx.short('coal'); return; }
    H.put(e, f, Math.ceil(needMJ / F.data.items[f].fuel));
  }
  function ingredientsOf(r) { return F.data.recipes[r].ingredients; }
  function craftsIn(e, recipe) {
    let n = Infinity;
    for (const [id, k] of ingredientsOf(recipe)) n = Math.min(n, Math.floor(H.countIn(e, id, 'input') / k));
    return n === Infinity ? 0 : n;
  }
  function speedOf(e) {
    const d = F.data.entities[e.type];
    return (d.assembler && d.assembler.speed) || (d.furnace && d.furnace.speed) || (d.crafter && d.crafter.speed) || d.speed || 1;
  }
  // Load a crafting machine with enough for `seconds` of work (bounded by `maxCrafts`).
  function loadCrafts(rec, seconds, maxCrafts) {
    const e = rec.e, r = F.data.recipes[rec.recipe];
    const perCraft = r.time / speedOf(e);
    const want = Math.min(maxCrafts == null ? Infinity : maxCrafts, Math.max(1, Math.ceil(seconds / perCraft)));
    const have = craftsIn(e, rec.recipe);
    if (have >= want) { rec.starved = 0; return have; }
    let can = want - have;
    for (const [id, k] of r.ingredients) can = Math.min(can, Math.floor(S.count(id) / k));
    // never load more than the plan still wants of this recipe (see planner quota)
    if (ctx.quota) can = Math.min(can, Math.max(0, ctx.quota.get(rec.recipe) || 0));
    if (can <= 0) {
      if (have === 0 && e.progress <= 0) { rec.starved = (rec.starved || 0) + 1; for (const [id, k] of r.ingredients) if (S.count(id) < k) ctx.short(id); }
      return have;
    }
    rec.starved = 0;
    for (const [id, k] of r.ingredients) H.put(e, id, k * can);
    if (ctx.quota) ctx.quota.set(rec.recipe, (ctx.quota.get(rec.recipe) || 0) - can);
    return have + can;
  }

  function service(rec) {
    const e = rec.e;
    switch (rec.cls) {
      case 'drill':
        // leave ore in the chest while there is plenty in stock: a full chest stops the drill
        if (rec.chest && S.count(rec.ore) < ctx.cfg.oreStock) H.takeAll(rec.chest);
        if (F.data.entities[e.type].energy.type === 'burner') refuel(e, 5);
        break;
      case 'furnace': {
        H.takeAll(e, ['output']);
        if (e.fuel) refuel(e, 8);
        // a furnace switches to its next recipe once the previous ore is used up
        if (rec.next && !(e.progress > 0)) {
          if (e.input[0]) H.takeAll(e, ['input']); // leftovers (e.g. 3 plates when steel needs 5)
          rec.recipe = rec.next; rec.next = null;
        }
        if (rec.recipe && !rec.next && rec.maxCrafts !== 0) {
          const r = F.data.recipes[rec.recipe];
          const ing = r.ingredients[0];
          const inside = e.input[0];
          if (inside && inside.id !== ing[0]) break; // still smelting the previous ore
          const perCraft = r.time / speedOf(e);
          const want = Math.ceil(ctx.cfg.loadSeconds / perCraft) * ing[1];
          const have = inside ? inside.count : 0;
          if (have < want) {
            let n = Math.min(want - have, S.count(ing[0]));
            if (ctx.quota) n = Math.min(n, Math.max(0, (ctx.quota.get(rec.recipe) || 0) * ing[1]));
            if (n > 0 && ctx.quota) ctx.quota.set(rec.recipe, (ctx.quota.get(rec.recipe) || 0) - Math.ceil(n / ing[1]));
            if (n > 0) { H.put(e, ing[0], n); rec.starved = 0; } else if (!have && !e.progress) { rec.starved = (rec.starved || 0) + 1; ctx.short(ing[0]); }
          }
        }
        break;
      }
      case 'asm':
      case 'chem':
      case 'refinery':
        H.takeAll(e, ['output']);
        if (rec.recipe && F.data.recipes[rec.recipe].ingredients.length) loadCrafts(rec, ctx.cfg.loadSeconds, rec.maxCrafts);
        break;
      case 'lab': {
        const want = ctx.research.packsWanted();
        for (const p of want) {
          const have = H.countIn(e, p);
          if (have < 10) H.put(e, p, 10 - have);
        }
        break;
      }
      case 'boiler':
        refuel(e, 25);
        break;
      case 'silo':
        ctx.rocket.service(rec);
        break;
      default:
        break;
    }
  }
  function serviceAll() {
    // outputs first (so this step's products are available to everyone), then inputs by priority
    for (const rec of list) if (!rec.e._removed) service(rec);
  }

  // ------------------------------------------------------------------ recipes
  function setRecipe(rec, recipe) {
    if (rec.recipe === recipe) return true;
    let ok;
    if (rec.cls === 'asm') ok = F.machines.setRecipe(rec.e, recipe);
    else if (rec.cls === 'chem' && recipe == null) ok = F.oil.setRecipe(rec.e, null);
    else if (rec.cls === 'chem' || rec.cls === 'refinery') ok = F.oil.setRecipe(rec.e, recipe);
    else ok = true;
    if (ok) { rec.recipe = recipe; rec.starved = 0; rec.since = F.state.tick; }
    return ok;
  }

  // ------------------------------------------------------------------ building
  // A build order waits until its item is in stock, then picks a spot, clears trees on it,
  // places the building and runs `after(e)`.
  const orders = [];
  function order(o) { o.id = orderSeq++; orders.push(o); return o; }
  let orderSeq = 1;
  function pending(tag) { return orders.filter(o => !tag || o.tag === tag).length; }
  function processOrders() {
    let finds = 0;
    for (let i = 0; i < orders.length; i++) {
      const o = orders[i];
      if (o.cancel && o.cancel()) { if (o.spot) ctx.space.release(o.rect); orders.splice(i--, 1); continue; }
      const item = F.data.entities[o.type].minable || o.type;
      if (S.toHand(item, 1) < 1) { ctx.need(item, 1, o.prio); continue; }
      if (!o.spot) {
        // looking for a spot scans a large area: at most two searches per step, and an order
        // that found none waits a while before trying again
        if (finds >= 2 || (o.retryAt && F.state.tick < o.retryAt)) continue;
        finds++;
        o.spot = o.find();
        if (!o.spot) o.retryAt = F.state.tick + 600 * Math.min(4, (o.misses || 0) + 1);
        if (!o.spot) { o.misses = (o.misses || 0) + 1; if (o.misses > 20) { ctx.log('no spot for ' + o.type + ' (' + (o.tag || '') + '), dropping order'); orders.splice(i--, 1); } continue; }
        const fp = F.entities.footprint(F.data.entities[o.type], o.spot.dir || 0);
        o.rect = { x: o.spot.x, y: o.spot.y, w: fp[0], h: fp[1] };
        ctx.space.reserve(o.rect, o.tag || o.type);
      }
      if (!ctx.space.clear(o.rect)) continue;
      ctx.space.release(o.rect);
      const e = H.place(o.type, o.spot.x, o.spot.y, o.spot.dir || 0);
      if (!e) {
        const chk = F.api.canPlace(o.type, o.spot.x, o.spot.y, o.spot.dir || 0);
        ctx.log('could not place ' + o.type + ' at ' + o.spot.x + ',' + o.spot.y + ': ' + chk.reason);
        o.spot = null; o.misses = (o.misses || 0) + 1;
        if (o.misses > 20) orders.splice(i--, 1);
        continue;
      }
      orders.splice(i--, 1);
      try { if (o.after) o.after(e); } catch (err) { ctx.log('after(' + o.type + ') failed: ' + (err && err.stack || err)); }
    }
  }

  // Powered buildings are re-checked every planning pass until connected.
  const unpowered = new Set();
  function wantPower(e) { unpowered.add(e); }
  const powerWait = new Map();
  let audit = 0;
  function powerPass() {
    // every so often, re-check that every electric building really is on the main network
    if (++audit % 15 === 0) for (const r of list) if (!r.e._removed && F.data.entities[r.e.type].energy.type === 'electric' && !ctx.space.onMain(r.e)) unpowered.add(r.e);
    for (const e of unpowered) {
      if (e._removed) { unpowered.delete(e); continue; }
      const w = powerWait.get(e) || 0;
      if (w > 0) { powerWait.set(e, w - 1); continue; }
      if (ctx.space.ensurePowered(e)) { unpowered.delete(e); powerWait.delete(e); }
      else powerWait.set(e, 3);
    }
  }

  // Fluid connections still to be made: { e, box, fluid }.
  const unpiped = [];
  function wantPipe(e, box, fluid) { unpiped.push({ e, box, fluid, tries: 0 }); }
  function pipePass() {
    for (let i = 0; i < unpiped.length; i++) {
      const u = unpiped[i];
      if (u.e._removed) { unpiped.splice(i--, 1); continue; }
      if (!ctx.oil.hasNetwork(u.fluid, u.e)) { ctx.oil.seed(u.fluid, u.e); continue; }
      const r = ctx.pipes.connect(u.e, u.box, u.fluid);
      if (r === 'done') unpiped.splice(i--, 1);
      else if (r === 'fail') { u.tries++; if (u.tries === 3 || u.tries % 50 === 0) ctx.log('cannot route ' + u.fluid + ' to ' + u.e.type + '#' + u.e.id + ' at ' + u.e.x + ',' + u.e.y + ' ' + u.box + ' (try ' + u.tries + ') ' + JSON.stringify(ctx.lastRouteFail)); }
    }
  }

  // ------------------------------------------------------------------ spot finders
  function gridSpot(w, h, anchor) {
    const a = anchor || ctx.anchors.factory;
    // machines on a 4-tile lattice leave one-tile lanes for poles
    return ctx.space.findSpot(w, h, a[0], a[1], { pitch: 4, originX: a[0] % 4, originY: a[1] % 4, margin: 0, maxFeatures: 4, radius: 40, test: r => laneFree(r) });
  }
  // keep the lane tiles around a lattice slot free of other buildings
  function laneFree(r) {
    for (let x = r.x - 1; x <= r.x + r.w; x++) for (const y of [r.y - 1, r.y + r.h]) if (ctx.space.isReserved(x, y)) return false;
    return true;
  }

  function registerAndPower(cls, extra) {
    return e => {
      const rec = add(Object.assign({ cls, e }, extra || {}));
      if (F.data.entities[e.type].energy.type === 'electric') { wantPower(e); ctx.space.ensurePowered(e); }
      return rec;
    };
  }

  function buildAsm(type) {
    return order({ type, tag: 'asm', prio: 1, find: () => gridSpot(3, 3), after: registerAndPower('asm') });
  }
  function buildFurnace(type) {
    const sz = F.data.entities[type].size[0];
    return order({ type, tag: 'furnace', prio: 1, find: () => gridSpot(sz, sz, ctx.anchors.smelting), after: registerAndPower('furnace') });
  }
  function buildLab() {
    return order({ type: 'lab', tag: 'lab', prio: 1, find: () => gridSpot(3, 3, ctx.anchors.labs), after: registerAndPower('lab') });
  }
  function buildChest() {
    const type = F.research.isRecipeUnlocked('steel-chest') && S.count('steel-chest') > 0 ? 'steel-chest' : 'iron-chest';
    return order({ type, tag: 'chest', prio: 0, find: () => ctx.space.findSpot(1, 1, ctx.anchors.home[0], ctx.anchors.home[1], { margin: 0, maxFeatures: 1, radius: 45, test: r => (r.x + r.y) % 2 === 0 }),
      after: e => { S.addChest(e); } });
  }

  // Mining drill on an ore patch with an iron chest at its output tile.
  function drillSpot(type, ore) {
    const def = F.data.entities[type];
    const patch = ctx.world.patch(ore);
    if (!patch) return null;
    const sz = def.size[0];
    const pitchX = sz, pitchY = sz + 1;
    const out = def.drill.output;
    let best = null;
    for (let y = patch.y0 + 1; y <= patch.y1 - 1; y += pitchY) for (let x = patch.x0; x <= patch.x1; x += pitchX) {
      const cx = x + out[0], cy = y + out[1];
      if (!ctx.space.tileOk(cx, cy, true) || F.world.feature(cx, cy)) continue;
      let okRect = true, ore0 = 0;
      for (let j = 0; j < sz && okRect; j++) for (let i = 0; i < sz; i++) {
        if (!ctx.space.tileOk(x + i, y + j, true)) { okRect = false; break; }
        const r = F.world.resource(x + i, y + j); if (r && r.item === ore) ore0 += r.amount;
      }
      if (!okRect || ore0 < 2000) continue;
      if (!F.api.canPlace(type, x, y, 0).ok) continue;
      const d = Math.hypot(x - patch.cx, y - patch.cy);
      if (!best || d < best.d) best = { x, y, dir: 0, d, cx, cy };
    }
    return best;
  }
  function buildDrill(type, ore) {
    const o = order({ type, tag: 'drill:' + ore, prio: 0, find: () => {
      const s = drillSpot(type, ore);
      if (s) { o.chestAt = [s.cx, s.cy]; ctx.space.reserve({ x: s.cx, y: s.cy, w: 1, h: 1 }, 'drill-chest'); }
      return s;
    }, after: e => {
      const rec = add({ cls: 'drill', e, ore, chest: null });
      ctx.space.release({ x: o.chestAt[0], y: o.chestAt[1], w: 1, h: 1 });
      order({ type: 'iron-chest', tag: 'drill-chest', prio: 0, find: () => ({ x: o.chestAt[0], y: o.chestAt[1], dir: 0 }), after: c => { rec.chest = c; } });
      if (def(type).energy.type === 'electric') { wantPower(e); ctx.space.ensurePowered(e); }
    } });
    return o;
  }
  function def(t) { return F.data.entities[t]; }

  return { list, add, of, count, serviceAll, setRecipe, order, orders, pending, processOrders, powerPass, pipePass, wantPower, wantPipe,
    buildAsm, buildFurnace, buildLab, buildChest, buildDrill, gridSpot, registerAndPower, loadCrafts, refuel, speedOf, craftsIn, unpowered };
}

module.exports = { createMachines, FUEL };
