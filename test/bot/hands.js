// The bot's hands: everything it does to the game goes through here, and every action is one
// a player can do — walk (see below), mine by hand, hand-craft, place a building from the
// inventory, put items into / take items out of a building, set a recipe, start research.
// Items only ever move between the player's inventory and buildings; nothing is created.
//
// The one simplification: the bot does not walk. It "steps" next to where it wants to act
// (F.api.teleport), because walking only costs game time and would need path-finding.
'use strict';
const { spiral } = require('./util');

function createHands(ctx) {
  const F = ctx.F;
  const P = () => F.state.player;
  const pinv = () => P().inv;

  // ---------------------------------------------------------------- movement / placement
  function standNear(x, y) {
    // A free, walkable tile a few tiles away, so the player never blocks a building spot.
    for (const [tx, ty] of spiral(Math.round(x), Math.round(y), 12)) {
      if (Math.abs(tx - x) < 2 && Math.abs(ty - y) < 2) continue;
      if (!F.world.passable(tx, ty) || F.world.entityAt(tx, ty) || ctx.space.isReserved(tx, ty)) continue;
      F.api.teleport(tx + 0.5, ty + 0.5);
      return true;
    }
    F.api.teleport(x + 0.5, y + 0.5);
    return false;
  }
  function moveOutOf(x, y, w, h) {
    const p = P();
    if (p.x + 0.3 >= x && p.x - 0.3 <= x + w && p.y + 0.3 >= y && p.y - 0.3 <= y + h) standNear(x + w + 2, y + h + 2);
  }

  // Place a building from the inventory. Returns the entity or null.
  function place(type, x, y, dir) {
    const def = F.data.entities[type];
    const item = def.minable || type;
    if (!stock.toHand(item, 1)) return null;
    const fp = F.entities.footprint(def, dir || 0);
    moveOutOf(x, y, fp[0], fp[1]);
    const e = F.api.place(type, x, y, dir || 0, { fromInventory: true });
    if (e) ctx.stats.placed++;
    return e;
  }
  function remove(e) {
    standNear(e.x, e.y);
    return F.api.remove(e.x, e.y);
  }

  // ---------------------------------------------------------------- hand mining
  // One job at a time: { x, y, kind: 'feature' } clears a tree/rock; { x, y, kind: 'ore', left }
  // hand-mines `left` more ore from that tile.
  const jobs = [];
  let cur = null;
  function mine(job) { jobs.push(job); }
  function mining() { return !!cur || jobs.length > 0; }
  function jobDone(j) {
    if (j.kind === 'feature') return !F.world.feature(j.x, j.y);
    if (F.world.entityAt(j.x, j.y)) return true; // something was built on the ore tile
    if (j.kind === 'ore') {
      const r = F.world.resource(j.x, j.y);
      return !r || r.amount <= j.until;
    }
    return true;
  }
  function tickMining() {
    if (cur && jobDone(cur)) cur = null;
    while (!cur && jobs.length) {
      const j = jobs.shift();
      if (j.kind === 'ore') { const r = F.world.resource(j.x, j.y); if (!r) continue; j.until = r.amount - j.left; }
      if (!jobDone(j)) cur = j;
    }
    F.input.state.mine = cur ? [cur.x, cur.y] : null;
    if (cur) {
      const p = P();
      if (Math.hypot(p.x - cur.x - 0.5, p.y - cur.y - 0.5) > 8) standNear(cur.x, cur.y);
    }
  }

  // ---------------------------------------------------------------- hand crafting
  function craftQueueLength() { return P().craftQueue.length; }
  function craftQueueSeconds() {
    let s = 0;
    for (const q of P().craftQueue) { const r = F.data.recipes[q.recipe]; if (r) s += r.time * (q.count - q.progress); }
    return s;
  }
  // Hand-craft n of recipe (ingredients are fetched into the inventory first; the game's own
  // chain-crafting makes missing intermediates). Returns true when queued.
  function craft(recipe, n) {
    const r = F.data.recipes[recipe];
    for (const [id, k] of rawNeedsForHand(recipe, n)) stock.toHand(id, k);
    void r;
    if (!F.player.canCraft(recipe, n).ok) return false;
    return F.player.enqueue(recipe, n);
  }
  // What hand-crafting n of recipe consumes from the inventory, chain-crafting intermediates
  // that are not in stock (mirrors the player's own planCraft).
  function rawNeedsForHand(recipe, n) {
    const need = new Map();
    const avail = new Map();
    const have = id => { if (!avail.has(id)) avail.set(id, stock.count(id)); return avail.get(id); };
    (function add(rid, crafts, depth) {
      const r = F.data.recipes[rid];
      for (const [id, k] of r.ingredients) {
        let want = k * crafts;
        const use = Math.min(have(id), want);
        if (use > 0) { avail.set(id, have(id) - use); need.set(id, (need.get(id) || 0) + use); want -= use; }
        if (want > 0) {
          const sub = F.data.recipes[id];
          if (sub && sub.hand && depth < 6 && F.research.isRecipeUnlocked(id) && sub.results.length === 1 && sub.results[0][0] === id) {
            add(id, Math.ceil(want / sub.results[0][1]), depth + 1);
          } else need.set(id, (need.get(id) || 0) + want);
        }
      }
    })(recipe, n, 0);
    return need;
  }

  // ---------------------------------------------------------------- building inventories
  function invsOf(e) { return F.entities.inventories(e) || []; }
  // Move everything out of the named inventories of e into the player's inventory.
  function takeAll(e, names) {
    let moved = 0;
    for (const g of invsOf(e)) {
      if (names && names.indexOf(g.name) < 0) continue;
      for (let i = 0; i < g.inv.length; i++) {
        const s = g.inv[i]; if (!s) continue;
        let left = F.inv.add(pinv(), s.id, s.count);
        if (left > 0) { stock.stash(); left = F.inv.add(pinv(), s.id, left); }
        const got = s.count - left;
        if (got > 0) { moved += got; ctx.stats.itemsMoved += got; }
        if (left > 0) s.count = left; else g.inv[i] = null;
      }
    }
    return moved;
  }
  // Put up to n of item from the inventory into building e. Returns how many went in.
  function put(e, item, n) {
    if (n <= 0) return 0;
    const have = stock.toHand(item, n);
    const k = Math.min(n, have);
    if (k <= 0) return 0;
    const inserted = F.api.insertInto(e, item, k);
    if (inserted > 0) { F.player.take(item, inserted); ctx.stats.itemsMoved += inserted; }
    return inserted;
  }
  function countIn(e, item, name) {
    let n = 0;
    for (const g of invsOf(e)) if (!name || g.name === name) n += F.inv.count(g.inv, item);
    return n;
  }

  // ---------------------------------------------------------------- stock
  // Storage = the player's inventory + the bot's warehouse chests.
  const stock = {
    chests: [],
    totals: new Map(),
    // item -> chests holding it (kept up to date by this module's own moves); chests with room
    where: new Map(),
    refresh() {
      const t = new Map();
      const where = new Map();
      for (const s of pinv()) if (s) t.set(s.id, (t.get(s.id) || 0) + s.count);
      for (const c of this.chests) for (const s of c.inv) if (s) {
        t.set(s.id, (t.get(s.id) || 0) + s.count);
        let w = where.get(s.id); if (!w) { w = new Set(); where.set(s.id, w); } w.add(c);
      }
      this.totals = t;
      this.where = where;
      this.fullUntil = 0;
    },
    count(id) { return this.totals.get(id) || 0; },
    inHand(id) { return F.inv.count(pinv(), id); },
    // Make sure the inventory holds (up to) n of id, fetching from chests. Returns the
    // inventory count afterwards.
    toHand(id, n) {
      let have = F.inv.count(pinv(), id);
      if (have >= n) return have;
      const w = this.where.get(id);
      if (!w) return have;
      for (const c of w) {
        if (have >= n) break;
        const inChest = F.inv.count(c.inv, id);
        if (!inChest) { w.delete(c); continue; }
        const want = Math.min(n - have, inChest);
        let left = F.inv.add(pinv(), id, want);
        if (left === want) { this.stash(id); left = F.inv.add(pinv(), id, want); }
        const got = want - left;
        F.inv.remove(c.inv, id, got);
        have += got;
      }
      return have;
    },
    // Move the inventory into the warehouse (all of it, except `keep`): first onto chests that
    // already hold the item, then into empty slots.
    stash(keep) {
      const inv = pinv();
      if (this.fullAt === F.state.tick) return; // the warehouse was already full this tick
      for (let i = 0; i < inv.length; i++) {
        const s = inv[i]; if (!s || s.id === keep) continue;
        let w = this.where.get(s.id); if (!w) { w = new Set(); this.where.set(s.id, w); }
        for (const c of w) {
          const left = F.inv.add(c.inv, s.id, s.count);
          s.count = left;
          if (!left) break;
        }
        if (s.count > 0) {
          for (let k = this.fullUntil || 0; k < this.chests.length && s.count > 0; k++) {
            const c = this.chests[k];
            if (c.inv.indexOf(null) < 0) { if (k === (this.fullUntil || 0)) this.fullUntil = k + 1; continue; }
            s.count = F.inv.add(c.inv, s.id, s.count);
            w.add(c);
          }
        }
        if (!s.count) inv[i] = null;
      }
      if ((this.fullUntil || 0) >= this.chests.length) this.fullAt = F.state.tick;
    },
    addChest(c) { this.chests.push(c); this.fullUntil = 0; },
    freeSlots() {
      let n = 0;
      for (const c of this.chests) for (const s of c.inv) if (!s) n++;
      return n;
    },
    handFree() { let n = 0; for (const s of pinv()) if (!s) n++; return n; },
  };

  return { standNear, place, remove, mine, mining, tickMining, craft, craftQueueLength, craftQueueSeconds, takeAll, put, countIn, stock };
}

module.exports = { createHands };
