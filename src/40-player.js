// 40-player.js — player state, movement, mining, hand crafting queue, quickbar,
// reach, damage/death/respawn, weapon input.
// See design/ARCHITECTURE.md §14 (state shape, API) and design/GDD.md §3 (Player),
// §9.2/§9.3 (crafting menu / queue semantics), §6.23 (ground items), §7.10 (player damage).
//
// Pure simulation module: no DOM access anywhere, safe to run fully headless.
//
// ---------------------------------------------------------------------------
// Notable design decisions where the source documents disagree or are silent
// (see the "assumptions" list returned in this module's build report too):
//
//  1. Death/respawn behaviour: ARCHITECTURE §14's inline comment says
//     "death -> drop nothing, respawn ... with full inventory kept
//     (simplification, GDD)" — but GDD §3's Death row (the authoritative
//     source for *behaviour* per the precedence rule at the top of
//     ARCHITECTURE.md) and this module's task brief both describe a
//     `player-corpse` holding the full inventory and a respawn with only a
//     starting pistol + 10 magazines. We follow GDD/the task brief: on death
//     the whole inventory (+ cursor + gun + ammo) is moved into a
//     `player-corpse` entity (if that entity type exists in F.data — it is
//     guarded so a build missing the entity still degrades safely, only
//     losing the items instead of crashing), the player's inventory is
//     cleared, and `respawn()` re-equips a fresh pistol + 10 firearm
//     magazines with an otherwise empty inventory.
//
//  2. Player auto-fire resolution: ARCHITECTURE §12 says "player auto-fire
//     handled by F.player", but GDD §7.2's tick table puts "player shooting"
//     in the Combat phase (7), after Input & player (phase 2), and this
//     module's task brief says explicitly to just set
//     `F.state.player.shooting` "for F.combat". We follow the task brief and
//     GDD's phase ordering: this module only turns the `shoot` input into
//     the `shooting` flag (and applies the GDD movement slowdown while
//     shooting) — target acquisition, ammo consumption, cooldown and damage
//     are 35-combat.js's responsibility.
//
//  3. `F.data.startingInventory` (ARCHITECTURE §3) is a flat list including
//     `pistol` and `firearm-magazine`; the task brief says to seed the
//     80-slot inventory from exactly that list. GDD's starting-kit table
//     additionally says the pistol/magazines belong "in gun slot"/"in ammo
//     slot" (separate from the 80 general slots). To satisfy both without
//     double-counting items, `init()` adds the whole list to the general
//     inventory first, then equips whatever pistol/firearm-magazine ended up
//     there into the dedicated `weapon`/`ammo` slots (removing them from the
//     general inventory in the process).
//
//  4. State field naming: ARCHITECTURE §14 names the equipped-gun field
//     `weapon` (a `'pistol'|'submachine-gun'|null` item id); the task brief
//     refers to "weapon/ammo slots (gun, ammo)". We keep ARCHITECTURE's
//     field name `weapon` (naming is ARCHITECTURE's call per the precedence
//     rule) and add `ammo` (`{id,count}|null`, the magazine stack) and
//     `inventoryBonus` (number) as the task brief asks, plus `ammoRounds`
//     (rounds left in the front magazine of the ammo stack — needed so
//     F.combat can consume rounds one at a time without also having to know
//     about magazine stacking) and `shooting` (bool, this tick's fire input).
//
//  5. `F.player.tick(input)`'s documented input shape (ARCHITECTURE §14) is
//     `{ mx, my, mine, shoot }`. GDD §6.23 additionally asks for an "F"
//     ground-pickup action, which isn't in that shape. We add an optional
//     `input.pickup` boolean (ignored/false-safe when absent) for 75-input.js
//     to set on the F key; documented here as a local extension since
//     ARCHITECTURE does not define one.
//
//  6. "Walking on belts carried at belt speed" (GDD §3) is implemented as a
//     best-effort optional feature: if the tile under the player's centre is
//     a belt-like entity (via F.belts.isBeltLike + the entity def's
//     belt/underground speed field), an extra drift vector is added to the
//     player's movement this tick. Guarded so a missing/partial F.belts API
//     degrades to "no carry" instead of throwing.
//
//  7. Hand-crafting auto-chain planning (`canCraft`/`enqueue`) resolves the
//     full ingredient tree against a *snapshot* of the current inventory
//     (a local pool), recursively substituting a chain-craft for any
//     shortage of an item that itself has a `hand:true`, research-unlocked
//     recipe whose sole result is that item (mirrors Factorio's own
//     auto-chain-crafting). Only true shortages of non-craftable (or
//     locked/non-hand) items end up in `missing`. `enqueue()` recomputes the
//     same plan and commits it: raw items are removed from the real
//     inventory once, then the chain entries (leaves first) and the
//     requested recipe are appended to `craftQueue`.
//
//  8. `F.entities.contents(e)` (mentioned in the task brief) is not part of
//     ARCHITECTURE's `F.entities` API; picking up a placed entity instead
//     uses `F.api.remove(tx, ty)` exactly as ARCHITECTURE §15 documents it
//     ("used by tests & right-click mining completion ... contents + item to
//     player inventory"). A local fallback (gather `F.entities.inventories`
//     contents + `def.minable`, then `F.entities.remove`) is used only if
//     `F.api.remove` is unavailable, e.g. an earlier partial build.
//
//  9. Dead trees: ARCHITECTURE §5's `feature` enum only has a single "tree"
//     value (1) — it does not distinguish living/dead the way GDD §2.6 does.
//     Since 10-world.js owns that enum, this module treats every `feature
//     === 1` tile as a living tree (4 wood, 0.55 s) — the only case this
//     module can actually resolve from the documented world API.
//
// 10. F.FEATURES.combat is off in this build (src/disabled/README.md): the
//     weapon/ammo fields still exist (so save shape/other modules are
//     unchanged) but always stay null — respawn()/equipFromInventory() no
//     longer equip a pistol (it no longer exists in F.data.items), and
//     shootTick()/damage() are guarded so shooting and taking damage are
//     both no-ops. 75-input.js also stops Space from ever setting the
//     `shoot` input flag.
// ---------------------------------------------------------------------------

(function () {
  'use strict';

  // ---------------------------------------------------------------------
  // i18n — this module's own ui.player.* keys only.
  // ---------------------------------------------------------------------
  F.i18n.add('en', {
    'ui.player.tooFar': 'Too far',
    'ui.player.inventoryFull': 'Inventory is full',
    'ui.player.deathTitle': 'You died',
    'ui.player.respawning': 'Respawning in {n}s',
    'ui.player.craftQueueFull': 'Cannot craft — missing ingredients',
    'ui.player.noRecipe': 'Unknown recipe',
    'ui.player.notHandCraftable': 'This cannot be hand-crafted',
    'ui.player.locked': 'Recipe not unlocked',
    'ui.player.pickedUp': 'Picked up',
  });

  // ---------------------------------------------------------------------
  // constants (GDD §3)
  // ---------------------------------------------------------------------
  const TPS = F.C.TPS || 60;
  const BASE_SPEED_TPS = 8.9 / TPS;         // tiles/tick, GDD §3 Movement
  const HALF_BOX = 0.2;                     // 0.4x0.4 collision box, half-extent
  const BASE_INV_SLOTS = 80;                // GDD §3 Inventory
  const REGEN_PER_TICK = 6 / TPS;           // 6 HP/s, GDD §3 Health
  const REGEN_DELAY_TICKS = 10 * TPS;       // 10 s without damage before regen resumes
  const RESPAWN_TICKS = 10 * TPS;           // GDD §3 Death
  const DEFAULT_HEALTH = 250;
  const WEAPON_SLOWDOWN = { pistol: 0.8, 'submachine-gun': 0.3 }; // GDD §3 Combat
  const MINE_TIME = { ore: 1.0, tree: 0.55, bigRock: 2.0, hugeRock: 3.0, entityDefault: 0.5 };

  // ---------------------------------------------------------------------
  // small local helpers
  // ---------------------------------------------------------------------

  function state() { return F.state && F.state.player; }

  function recipeDefSafe(id) {
    if (!F.data) return null;
    if (typeof F.data.recipeDef === 'function') {
      try { return F.data.recipeDef(id); } catch (err) { F.log.warn('[player] unknown recipe', id); return null; }
    }
    return (F.data.recipes && F.data.recipes[id]) || null;
  }

  function itemDefSafe(id) {
    return (F.data && F.data.items && F.data.items[id]) || null;
  }

  function entityDefSafe(type) {
    return (F.data && F.data.entities && F.data.entities[type]) || null;
  }

  function miningBonus() {
    try { return (F.research && F.research.bonus) ? (F.research.bonus('miningBonus') || 0) : 0; }
    catch (err) { return 0; }
  }

  function inventoryBonusValue() {
    try { return (F.research && F.research.bonus) ? (F.research.bonus('inventoryBonus') || 0) : 0; }
    catch (err) { return 0; }
  }

  // Grow (never shrink) the player's inventory array to 80 + current inventoryBonus.
  function ensureInventorySize() {
    const p = state(); if (!p || !p.inv) return;
    const bonus = inventoryBonusValue();
    p.inventoryBonus = bonus;
    const wanted = BASE_INV_SLOTS + bonus;
    while (p.inv.length < wanted) p.inv.push(null);
  }

  // ---------------------------------------------------------------------
  // inventory access (ARCHITECTURE §14)
  // ---------------------------------------------------------------------

  function give(id, count) {
    const p = state(); if (!p) return count;
    ensureInventorySize();
    return F.inv.add(p.inv, id, count);
  }

  function giveOrDrop(id, count) {
    if (!id || count <= 0) return;
    const left = give(id, count);
    if (left > 0) {
      const p = state();
      try {
        if (F.ground && typeof F.ground.dropNear === 'function') F.ground.dropNear(p.x, p.y, id, left);
        else if (F.ground && typeof F.ground.drop === 'function') F.ground.drop(Math.round(p.x), Math.round(p.y), id, left);
        else F.log.warn('[player] giveOrDrop: no F.ground, item lost', id, left);
      } catch (err) { F.log.warn('[player] giveOrDrop failed to drop overflow', id, left, err); }
    }
  }

  function take(id, count) {
    const p = state(); if (!p) return 0;
    return F.inv.remove(p.inv, id, count);
  }

  function count(id) {
    const p = state(); if (!p) return 0;
    return F.inv.count(p.inv, id);
  }

  // ---------------------------------------------------------------------
  // hand-crafting queue (GDD §3, §9.2/§9.3)
  // ---------------------------------------------------------------------

  // Recursively resolve the full ingredient tree for `n` crafts of `recipeId`
  // against a snapshot pool of the player's current inventory. See report
  // assumption #7. Returns { ok, missing:[[item,n]...], used:Map, chain:[{recipe,count}] }
  // (chain is leaf-first: sub-crafts that must complete before later entries).
  function planCraft(recipeId, n) {
    const rec = recipeDefSafe(recipeId);
    const missing = new Map();
    const used = new Map();
    const chain = [];
    if (!rec) { missing.set(recipeId, n); return { ok: false, missing: toPairs(missing), used, chain, reason: 'no_recipe' }; }
    if (!rec.hand) return { ok: false, missing: [], used, chain, reason: 'not_hand_craftable' };
    if (F.research && typeof F.research.isRecipeUnlocked === 'function' && !F.research.isRecipeUnlocked(recipeId)) {
      return { ok: false, missing: [], used, chain, reason: 'locked' };
    }

    const pool = new Map();
    const chaining = new Set();

    function poolGet(id) {
      if (!pool.has(id)) pool.set(id, count(id));
      return pool.get(id);
    }

    function reserve(id, qty) {
      if (qty <= 0) return;
      const avail = poolGet(id);
      const take2 = Math.min(avail, qty);
      if (take2 > 0) {
        pool.set(id, avail - take2);
        used.set(id, (used.get(id) || 0) + take2);
        qty -= take2;
      }
      if (qty <= 0) return;
      const sub = F.data && F.data.recipes ? F.data.recipes[id] : null;
      const subUnlocked = !F.research || typeof F.research.isRecipeUnlocked !== 'function' || F.research.isRecipeUnlocked(id);
      if (sub && sub.hand && subUnlocked && sub.results && sub.results.length === 1 && sub.results[0][0] === id && !chaining.has(id)) {
        chaining.add(id);
        const perCraft = sub.results[0][1] || 1;
        const crafts = Math.ceil(qty / perCraft);
        for (let i = 0; i < sub.ingredients.length; i++) reserve(sub.ingredients[i][0], sub.ingredients[i][1] * crafts);
        chain.push({ recipe: id, count: crafts });
        chaining.delete(id);
        return; // shortage considered handled by the chain craft (any deeper shortage already landed in `missing`)
      }
      missing.set(id, (missing.get(id) || 0) + qty);
    }

    for (let i = 0; i < rec.ingredients.length; i++) reserve(rec.ingredients[i][0], rec.ingredients[i][1] * n);
    return { ok: missing.size === 0, missing: toPairs(missing), used, chain, reason: null };
  }

  function toPairs(map) { const out = []; map.forEach((v, k) => out.push([k, v])); return out; }

  function canCraft(recipeId, n) {
    n = n || 1;
    const plan = planCraft(recipeId, n);
    return { ok: plan.ok, missing: plan.missing };
  }

  function enqueue(recipeId, n) {
    n = n || 1;
    const plan = planCraft(recipeId, n);
    if (!plan.ok) return false;
    const p = state(); if (!p) return false;
    // commit: remove the raw items the whole tree actually consumes from the real inventory.
    plan.used.forEach((qty, id) => { if (qty > 0) take(id, qty); });
    for (let i = 0; i < plan.chain.length; i++) {
      const c = plan.chain[i];
      p.craftQueue.push({ recipe: c.recipe, count: c.count, progress: 0 });
    }
    p.craftQueue.push({ recipe: recipeId, count: n, progress: 0 });
    return true;
  }

  function cancelCraft(index) {
    const p = state(); if (!p) return false;
    if (index < 0 || index >= p.craftQueue.length) return false;
    const entry = p.craftQueue[index];
    const rec = recipeDefSafe(entry.recipe);
    if (rec) for (let i = 0; i < rec.ingredients.length; i++) giveOrDrop(rec.ingredients[i][0], rec.ingredients[i][1] * entry.count);
    p.craftQueue.splice(index, 1);
    return true;
  }

  function craftTick() {
    const p = state(); if (!p || !p.craftQueue.length) return;
    const head = p.craftQueue[0];
    const rec = recipeDefSafe(head.recipe);
    if (!rec) { F.log.warn('[player] craftQueue: unknown recipe, dropping', head.recipe); p.craftQueue.shift(); return; }
    const time = rec.time > 0 ? rec.time : 0.001;
    head.progress += 1 / (time * TPS);
    let guard = 0;
    while (head.progress >= 1 && head.count > 0 && guard++ < 1000) {
      head.progress -= 1;
      for (let i = 0; i < rec.results.length; i++) giveOrDrop(rec.results[i][0], rec.results[i][1]);
      head.count--;
    }
    if (head.count <= 0) p.craftQueue.shift();
  }

  // ---------------------------------------------------------------------
  // reach
  // ---------------------------------------------------------------------

  function inReach(tx, ty) {
    const p = state(); if (!p) return false;
    const reach = (F.C && F.C.REACH) || 10;
    return F.util.dist(p.x, p.y, tx + 0.5, ty + 0.5) <= reach;
  }

  // ---------------------------------------------------------------------
  // movement (GDD §3 Movement)
  // ---------------------------------------------------------------------

  function boxPassable(cx, cy) {
    if (!F.world || typeof F.world.passable !== 'function') return true;
    const x0 = Math.floor(cx - HALF_BOX), x1 = Math.floor(cx + HALF_BOX);
    const y0 = Math.floor(cy - HALF_BOX), y1 = Math.floor(cy + HALF_BOX);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      if (!F.world.passable(tx, ty)) return false;
    }
    return true;
  }

  function dirFromVec(mx, my) {
    if (Math.abs(mx) >= Math.abs(my)) return mx >= 0 ? 1 : 3; // E : W
    return my >= 0 ? 2 : 0; // S : N
  }

  // Optional: carry the player along a belt they're standing on (GDD §3, assumption #6).
  function beltCarryVec(x, y) {
    try {
      if (!F.world || typeof F.world.entityAt !== 'function' || !F.belts || typeof F.belts.isBeltLike !== 'function') return [0, 0];
      const ent = F.world.entityAt(Math.floor(x), Math.floor(y));
      if (!ent || !F.belts.isBeltLike(ent)) return [0, 0];
      const def = entityDefSafe(ent.type);
      const b = def && (def.belt || def.underground);
      if (!b || typeof b.speed !== 'number') return [0, 0];
      const tilesPerTick = b.speed / (F.C.BELT_LEN || 256);
      const [dx, dy] = F.util.dirVec(ent.dir || 0);
      return [dx * tilesPerTick, dy * tilesPerTick];
    } catch (err) { return [0, 0]; }
  }

  function moveTick(input) {
    const p = state(); if (!p) return;
    let mx = (input && input.mx) || 0, my = (input && input.my) || 0;
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }

    let speed = BASE_SPEED_TPS;
    if (p.shooting && p.weapon && WEAPON_SLOWDOWN[p.weapon] != null) speed *= WEAPON_SLOWDOWN[p.weapon];

    let dx = mx * speed, dy = my * speed;
    const carry = beltCarryVec(p.x, p.y);
    dx += carry[0]; dy += carry[1];

    if (dx !== 0) { const nx = p.x + dx; if (boxPassable(nx, p.y)) p.x = nx; }
    if (dy !== 0) { const ny = p.y + dy; if (boxPassable(p.x, ny)) p.y = ny; }

    if (mx !== 0 || my !== 0) p.dir = dirFromVec(mx, my);
  }

  // ---------------------------------------------------------------------
  // mining (GDD §3 Hand mining / Picking up entities, §2.6/§2.7 trees & rocks)
  // ---------------------------------------------------------------------

  function isBeltLikeSafe(ent) {
    try { return !!(F.belts && F.belts.isBeltLike && F.belts.isBeltLike(ent)); } catch (err) { return false; }
  }

  // GDD §3 "Picking up entities" mining_time_entity table.
  function entityMineTime(ent, def) {
    if (!def) return MINE_TIME.entityDefault;
    if (ent.type === 'wooden-chest') return 0.1;
    if (isBeltLikeSafe(ent)) return 0.1;
    if (def.behaviour === 'pole' || def.behaviour === 'pipe' || def.behaviour === 'offshore_pump') return 0.1;
    if (def.behaviour === 'furnace' || def.behaviour === 'assembler' || def.behaviour === 'lab' || def.behaviour === 'chest') return 0.2;
    if (def.behaviour === 'drill') return 0.3;
    if (def.behaviour === 'turret') return 0.5;
    return MINE_TIME.entityDefault;
  }

  const NOT_MINABLE_TYPES = { 'player-corpse': true };

  function removeEntityFallback(tx, ty) {
    // Only used if F.api.remove is unavailable (defensive; see report assumption #8).
    const ent = F.world.entityAt(tx, ty);
    if (!ent) return;
    const def = entityDefSafe(ent.type);
    const item = def && def.minable;
    const contents = [];
    try {
      const invs = F.entities.inventories ? F.entities.inventories(ent) : [];
      for (let i = 0; i < invs.length; i++) {
        const slot = invs[i];
        if (!slot || !slot.inv) continue;
        for (let j = 0; j < slot.inv.length; j++) { const st = slot.inv[j]; if (st) contents.push([st.id, st.count]); }
      }
    } catch (err) { F.log.warn('[player] removeEntityFallback: failed to read contents', err); }
    try { F.entities.remove(ent, { dropItems: false }); } catch (err) { F.log.error('[player] removeEntityFallback: remove failed', err); return; }
    if (item) giveOrDrop(item, 1);
    for (let i = 0; i < contents.length; i++) giveOrDrop(contents[i][0], contents[i][1]);
  }

  function completeMining(tx, ty, kind) {
    if (kind === 'entity') {
      if (F.api && typeof F.api.remove === 'function') F.api.remove(tx, ty);
      else removeEntityFallback(tx, ty);
      return;
    }
    if (kind === 'resource') {
      const item = F.world.mineResource ? F.world.mineResource(tx, ty, 1) : null;
      if (item) giveOrDrop(item, 1);
      return;
    }
    if (kind === 'tree') {
      if (F.world.removeFeature) F.world.removeFeature(tx, ty);
      giveOrDrop('wood', 4); // GDD §2.6 (see assumption #9 re: dead trees)
      return;
    }
    if (kind === 'bigRock') {
      if (F.world.removeFeature) F.world.removeFeature(tx, ty);
      giveOrDrop('stone', 20); // GDD §2.7
      return;
    }
    if (kind === 'hugeRock') {
      if (F.world.removeFeature) F.world.removeFeature(tx, ty);
      const stoneN = 24 + F.rng.int(27);  // uniform 24..50, GDD §2.7 (F.rng, never Math.random)
      const coalN = 24 + F.rng.int(27);
      giveOrDrop('stone', stoneN);
      giveOrDrop('coal', coalN);
      return;
    }
  }

  function mineTick(input) {
    const p = state(); if (!p) return;
    const target = input && input.mine;
    if (!target) { p.mining = null; return; }
    const tx = target[0], ty = target[1];
    if (!inReach(tx, ty)) { p.mining = null; return; }

    let kind = null, mineTime = MINE_TIME.entityDefault;
    const ent = (F.world && F.world.entityAt) ? F.world.entityAt(tx, ty) : null;
    if (ent && !NOT_MINABLE_TYPES[ent.type]) {
      const def = entityDefSafe(ent.type);
      if (!def || !def.natural) { kind = 'entity'; mineTime = entityMineTime(ent, def); }
    }
    if (!kind) {
      const feat = (F.world && F.world.feature) ? F.world.feature(tx, ty) : 0;
      if (feat === 1) { kind = 'tree'; mineTime = MINE_TIME.tree; }
      else if (feat === 2) { kind = 'bigRock'; mineTime = MINE_TIME.bigRock; }
      else if (feat === 3) { kind = 'hugeRock'; mineTime = MINE_TIME.hugeRock; }
      else {
        const res = (F.world && F.world.resource) ? F.world.resource(tx, ty) : null;
        if (res) { kind = 'resource'; mineTime = MINE_TIME.ore; }
      }
    }
    if (!kind) { p.mining = null; return; }

    if (!p.mining || p.mining.tx !== tx || p.mining.ty !== ty) p.mining = { tx: tx, ty: ty, progress: 0, kind: kind };
    p.mining.kind = kind;

    // GDD §3: progress per tick = (1 + miningBonus) * 0.5 / mining_time / 60.
    const inc = (1 + miningBonus()) * 0.5 / mineTime / TPS;
    p.mining.progress += inc;
    if (p.mining.progress >= 1) {
      p.mining.progress -= 1;
      completeMining(tx, ty, kind);
      if (kind === 'resource') {
        const res = (F.world && F.world.resource) ? F.world.resource(tx, ty) : null;
        if (!res) p.mining = null;
      } else {
        p.mining = null; // trees/rocks/entities are consumed in one shot
      }
    }
  }

  // ---------------------------------------------------------------------
  // ground pickup (GDD §6.23, assumption #5)
  // ---------------------------------------------------------------------

  function pickupTick(input) {
    if (!input || !input.pickup) return;
    if (!F.ground || typeof F.ground.at !== 'function' || typeof F.ground.take !== 'function') return;
    const p = state(); if (!p) return;
    const cx = Math.round(p.x), cy = Math.round(p.y);
    for (let ty = cy - 1; ty <= cy + 1; ty++) {
      for (let tx = cx - 1; tx <= cx + 1; tx++) {
        if (F.util.dist(p.x, p.y, tx + 0.5, ty + 0.5) > 1.5) continue;
        const g = F.ground.at(tx, ty);
        if (!g) continue;
        const got = F.ground.take(tx, ty);
        if (!got) continue;
        const left = give(got.id, got.count);
        if (left > 0 && typeof F.ground.drop === 'function') F.ground.drop(tx, ty, got.id, left);
      }
    }
  }

  // ---------------------------------------------------------------------
  // shooting input (assumption #2: F.combat resolves the actual shot)
  // ---------------------------------------------------------------------

  function shootTick(input) {
    const p = state(); if (!p) return;
    if (!F.FEATURES || !F.FEATURES.combat) { p.shooting = false; return; }
    p.shooting = !!(input && input.shoot) && !!p.weapon && !p.dead;
  }

  // ---------------------------------------------------------------------
  // damage / regen / death / respawn (GDD §3 Health/Death, §7.10)
  // ---------------------------------------------------------------------

  function regenTick() {
    const p = state(); if (!p) return;
    if (p.regenCd > 0) { p.regenCd--; return; }
    if (p.health < p.maxHealth) p.health = Math.min(p.maxHealth, p.health + REGEN_PER_TICK);
  }

  function damage(amount, source) {
    if (!F.FEATURES || !F.FEATURES.combat) return; // nothing deals damage with combat off
    const p = state(); if (!p || p.dead || !(amount > 0)) return;
    p.health -= amount;
    p.regenCd = REGEN_DELAY_TICKS;
    F.events.emit('player:damaged', { amount: amount, source: source || null });
    if (p.health <= 0) { p.health = 0; die(); }
  }

  function equipItemsIntoCorpse(target) {
    const p = state();
    for (let i = 0; i < p.inv.length; i++) {
      const st = p.inv[i];
      if (st) F.inv.add(target, st.id, st.count, { ignoreStack: true });
    }
    if (p.cursor) F.inv.add(target, p.cursor.id, p.cursor.count, { ignoreStack: true });
    if (p.weapon) F.inv.add(target, p.weapon, 1, { ignoreStack: true });
    if (p.ammo && p.ammo.count > 0) F.inv.add(target, p.ammo.id, p.ammo.count, { ignoreStack: true });
  }

  function die() {
    const p = state(); if (!p || p.dead) return;
    p.dead = true;
    p.respawnIn = RESPAWN_TICKS;
    p.mining = null;
    p.craftQueue.length = 0; // ingredients were already spent at enqueue time; nothing to refund here
    p.shooting = false;

    try {
      if (F.data && F.data.entities && F.data.entities['player-corpse'] && F.entities && typeof F.entities.create === 'function') {
        const tx = Math.floor(p.x), ty = Math.floor(p.y);
        const corpse = F.entities.create('player-corpse', tx, ty, 0);
        if (corpse && F.entities.inventories) {
          const invs = F.entities.inventories(corpse) || [];
          const slot = invs.find(function (s) { return s.name === 'main'; }) || invs[0];
          if (slot && slot.inv) equipItemsIntoCorpse(slot.inv);
          else F.log.warn('[player] die: player-corpse has no inventory slot, items lost');
        } else {
          F.log.warn('[player] die: could not create player-corpse, items lost');
        }
      } else {
        F.log.warn('[player] die: no player-corpse entity defined, items lost');
      }
    } catch (err) { F.log.error('[player] die: corpse handling failed, items lost', err); }

    for (let i = 0; i < p.inv.length; i++) p.inv[i] = null;
    p.cursor = null;
    p.weapon = null;
    p.ammo = null;
    p.ammoRounds = 0;
    F.events.emit('player:died', { x: p.x, y: p.y });
  }

  function respawn() {
    const p = state(); if (!p) return;
    const sp = (F.world && F.world.spawn) ? F.world.spawn : { x: 0, y: 0 };
    p.x = sp.x; p.y = sp.y;
    p.dir = 0;
    p.health = p.maxHealth || DEFAULT_HEALTH;
    p.regenCd = 0;
    p.dead = false;
    p.respawnIn = 0;
    p.mining = null;
    p.shooting = false;
    if (F.FEATURES && F.FEATURES.combat) {
      p.weapon = 'pistol';
      const magSize = (itemDefSafe('firearm-magazine') && itemDefSafe('firearm-magazine').ammo && itemDefSafe('firearm-magazine').ammo.magazineSize) || 10;
      p.ammo = { id: 'firearm-magazine', count: 10 };
      p.ammoRounds = magSize;
    } else {
      p.weapon = null;
      p.ammo = null;
      p.ammoRounds = 0;
    }
    F.events.emit('player:respawned', { x: p.x, y: p.y });
  }

  // ---------------------------------------------------------------------
  // init (GDD §2.9 Starting kit)
  // ---------------------------------------------------------------------

  function equipFromInventory() {
    if (!F.FEATURES || !F.FEATURES.combat) return; // no weapon to auto-equip
    const p = state(); if (!p) return;
    if (!p.weapon && count('pistol') > 0) { take('pistol', 1); p.weapon = 'pistol'; }
    if (!p.ammo) {
      const have = count('firearm-magazine');
      if (have > 0) {
        take('firearm-magazine', have);
        const magSize = (itemDefSafe('firearm-magazine') && itemDefSafe('firearm-magazine').ammo && itemDefSafe('firearm-magazine').ammo.magazineSize) || 10;
        p.ammo = { id: 'firearm-magazine', count: have };
        p.ammoRounds = magSize;
      }
    }
  }

  function init() {
    const sp = (F.world && F.world.spawn) ? F.world.spawn : { x: 0, y: 0 };
    F.state.player = {
      x: sp.x, y: sp.y, dir: 0,
      health: DEFAULT_HEALTH, maxHealth: DEFAULT_HEALTH,
      inv: F.inv.create(BASE_INV_SLOTS),
      craftQueue: [],
      quickbar: new Array(10).fill(null),
      cursor: null,
      mining: null,
      dead: false, respawnIn: 0,
      weapon: null, ammo: null, ammoRounds: 0,
      shootCd: 0, regenCd: 0,
      inventoryBonus: 0,
      shooting: false,
    };
    const p = F.state.player;

    const startList = (F.data && F.data.startingInventory) || [];
    for (let i = 0; i < startList.length; i++) {
      const id = startList[i][0], n = startList[i][1];
      const left = give(id, n);
      if (left > 0) F.log.warn('[player] init: starting item did not fit', id, left);
    }
    for (let i = 0; i < startList.length && i < 10; i++) p.quickbar[i] = startList[i][0];

    equipFromInventory(); // move pistol/firearm-magazine from the general inventory into gun/ammo slots
    ensureInventorySize();
  }

  // ---------------------------------------------------------------------
  // tick
  // ---------------------------------------------------------------------

  function tickImpl(input) {
    const p = state();
    if (!p) return;
    ensureInventorySize();
    if (p.dead) {
      p.respawnIn = Math.max(0, (p.respawnIn || 0) - 1);
      if (p.respawnIn <= 0) respawn();
      return;
    }
    moveTick(input);
    mineTick(input);
    pickupTick(input);
    craftTick();
    shootTick(input);
    regenTick();
  }

  function tick(input) {
    try { tickImpl(input); }
    catch (err) { F.log.error('[player] tick failed', err); }
  }

  // ---------------------------------------------------------------------
  // public API (design/ARCHITECTURE.md §14)
  // ---------------------------------------------------------------------

  F.player = {
    init: init,
    tick: tick,
    give: give,
    giveOrDrop: giveOrDrop,
    take: take,
    count: count,
    canCraft: canCraft,
    enqueue: enqueue,
    cancelCraft: cancelCraft,
    inReach: inReach,
    damage: damage,
    respawn: respawn,
  };
})();
