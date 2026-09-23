// 34-research.js — technology research state, lab progress, unlock queries.
// See design/ARCHITECTURE.md §11 and design/GDD.md §7.11, §8, §6.16.
// Pure simulation module: no DOM access, safe to run fully headless.
(function () {
  'use strict';

  // ---------------------------------------------------------------------
  // i18n — this module registers only its own `ui.research.*` keys.
  // `tech.<id>` / `tech.<id>.desc` names & descriptions are supplied by
  // 02-i18n.js (per ARCHITECTURE.md §4: "02-i18n.js provides ALL item.*,
  // ent.*, tech.*, cat.*, help.* strings"); this module only *reads* them
  // via F.t() in techInfo(), it never defines them.
  // ---------------------------------------------------------------------
  F.i18n.add('en', {
    'ui.research.title': 'Research',
    'ui.research.tree': 'Technology tree',
    'ui.research.current': 'Current research',
    'ui.research.none': 'No active research',
    'ui.research.queue': 'Queue',
    'ui.research.queueEmpty': 'The queue is empty',
    'ui.research.queueFull': 'Queue is full (max 7)',
    'ui.research.available': 'Available',
    'ui.research.locked': 'Locked',
    'ui.research.done': 'Researched',
    'ui.research.start': 'Start',
    'ui.research.addToQueue': 'Add to queue',
    'ui.research.cancel': 'Cancel',
    'ui.research.prereqMissing': 'Missing prerequisites',
    'ui.research.progress': 'Progress',
    'ui.research.units': 'Units',
    'ui.research.unitsOf': '{done} / {total} units',
    'ui.research.time': 'Time',
    'ui.research.packsNeeded': 'Science packs needed',
    'ui.research.effects': 'Effects',
    'ui.research.unlocks': 'Unlocks',
    'ui.research.completedToast': 'Research finished: {n}',
    'ui.research.tier1': 'Red tier',
    'ui.research.tier2': 'Red + green tier',
    'ui.research.labSpeedBonus': 'Lab speed',
    'ui.research.miningBonus': 'Mining bonus',
    'ui.research.inventoryBonus': 'Inventory bonus',
    // bulletDamage/turretDamage/bulletSpeed bonus labels removed: only the
    // combat-only physical-projectile-damage-*/weapon-shooting-speed-*
    // techs used them, and those are excluded (F.FEATURES.combat off, see
    // src/disabled/README.md).
  });

  const MAX_QUEUE = 7;

  // ---------------------------------------------------------------------
  // internal helpers
  // ---------------------------------------------------------------------

  // Returns F.state.research, lazily filling in fields that 80-game.js's
  // F.newGame() may not have initialised (progressByTech is an addition
  // on top of the base shape in ARCHITECTURE.md §11; the others are
  // defensive against any future shape drift). Never throws.
  function state() {
    if (!F.state) return null;
    let r = F.state.research;
    if (!r) { r = F.state.research = {}; }
    if (r.current === undefined) r.current = null;
    if (typeof r.unitsDone !== 'number') r.unitsDone = 0;
    if (typeof r.unitProgress !== 'number') r.unitProgress = 0;
    if (!r.done || typeof r.done !== 'object') r.done = {};
    if (!Array.isArray(r.queue)) r.queue = [];
    if (!r.progressByTech || typeof r.progressByTech !== 'object') r.progressByTech = {};
    return r;
  }

  // Safe wrapper around F.data.techDef (which throws on unknown ids per
  // ARCHITECTURE.md §3). Logs and returns null instead of throwing so a
  // bad id anywhere never crashes a tick.
  function techDefSafe(id) {
    if (!F.data || typeof F.data.techDef !== 'function') return null;
    try { return F.data.techDef(id); } catch (err) { F.log.warn('[research] unknown tech id', id, err && err.message); return null; }
  }

  // Callers legitimately probe this with plain item ids too (e.g.
  // 40-player.js's hand-craft chain resolver calls isRecipeUnlocked() on
  // every ingredient id while deciding whether it is itself chain-craftable,
  // and many ingredients — 'wood', 'iron-ore', ... — are raw items with no
  // matching recipe). That is expected, not an error, so we warn at most
  // once per distinct unknown id instead of flooding the console every time
  // a GUI re-render re-probes the same ids (see the module's final report).
  const warnedUnknownRecipeIds = {};
  function recipeDefSafe(id) {
    if (!F.data || typeof F.data.recipeDef !== 'function') return null;
    try { return F.data.recipeDef(id); } catch (err) {
      if (!Object.prototype.hasOwnProperty.call(warnedUnknownRecipeIds, id)) {
        warnedUnknownRecipeIds[id] = true;
        F.log.warn('[research] unknown recipe id (treated as always-locked)', id, err && err.message);
      }
      return null;
    }
  }

  function prereqsMet(def, r) {
    const prereq = (def && def.prereq) || [];
    for (let i = 0; i < prereq.length; i++) if (!r.done[prereq[i]]) return false;
    return true;
  }

  function packAmount(pair) { return (pair && pair[1]) || 1; }

  function hasAllPacks(lab, def) {
    const packs = (def.cost && def.cost.packs) || [];
    if (!lab || !lab.packs || !F.inv) return packs.length === 0;
    for (let i = 0; i < packs.length; i++) {
      const id = packs[i][0], need = packAmount(packs[i]);
      if (F.inv.count(lab.packs, id) < need) return false;
    }
    return true;
  }

  // Finalises the currently active tech: marks it done, emits the event,
  // clears active/partial progress and pops+starts the next queued tech.
  // Idempotent (no-op if nothing is current) so both labTick() and tick()
  // may call it safely.
  function finish() {
    const r = state();
    if (!r || !r.current) return;
    const id = r.current;
    const def = techDefSafe(id);
    r.done[id] = true;
    delete r.progressByTech[id];
    r.current = null;
    r.unitsDone = 0;
    r.unitProgress = 0;
    F.log.info('[research] done:', id);
    // Bonus effects are applied lazily by bonus() (it sums over r.done on
    // every call) and recipe unlocks are resolved lazily by
    // isRecipeUnlocked() (it checks recipe.unlockedBy against r.done), so
    // marking `done[id] = true` above is sufficient — nothing further to
    // mutate for `effects`/`unlocks` here.
    F.events.emit('research:done', { id: id, tech: def });
    if (r.queue.length > 0) {
      const next = r.queue.shift();
      start(next);
    }
  }

  // ---------------------------------------------------------------------
  // public API (design/ARCHITECTURE.md §11)
  // ---------------------------------------------------------------------

  function available() {
    const r = state();
    if (!r || !F.data || !F.data.techs) return [];
    const ids = (F.data.order && F.data.order.techs) ? F.data.order.techs : Object.keys(F.data.techs);
    const out = [];
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      if (r.done[id]) continue;
      const def = techDefSafe(id);
      if (!def) continue;
      if (prereqsMet(def, r)) out.push(id);
    }
    return out;
  }

  function start(techId) {
    const r = state();
    if (!r) return false;
    if (r.done[techId]) { F.log.warn('[research] start: already researched', techId); return false; }
    const def = techDefSafe(techId);
    if (!def) return false;
    if (!prereqsMet(def, r)) { F.log.warn('[research] start: prerequisites not met', techId); return false; }
    if (r.current === techId) return true; // already the active tech

    if (r.current) {
      // Stash progress of whatever was active so it can be resumed later.
      r.progressByTech[r.current] = { unitsDone: r.unitsDone, unitProgress: r.unitProgress };
    }
    const saved = r.progressByTech[techId];
    if (saved) {
      r.unitsDone = saved.unitsDone;
      r.unitProgress = saved.unitProgress;
      delete r.progressByTech[techId];
    } else {
      r.unitsDone = 0;
      r.unitProgress = 0;
    }
    r.current = techId;
    const qi = r.queue.indexOf(techId);
    if (qi >= 0) r.queue.splice(qi, 1);
    return true;
  }

  function cancel() {
    const r = state();
    if (!r || !r.current) return false;
    if (r.unitsDone > 0 || r.unitProgress > 0) {
      r.progressByTech[r.current] = { unitsDone: r.unitsDone, unitProgress: r.unitProgress };
    }
    r.current = null;
    r.unitsDone = 0;
    r.unitProgress = 0;
    return true;
  }

  function queue(techId) {
    const r = state();
    if (!r) return false;
    if (r.done[techId]) { F.log.warn('[research] queue: already researched', techId); return false; }
    const def = techDefSafe(techId);
    if (!def) return false;
    if (r.current === techId) return false;
    if (r.queue.indexOf(techId) >= 0) return false;
    if (!r.current) return start(techId); // nothing active -> queueing just starts it
    if (r.queue.length >= MAX_QUEUE) { F.log.warn('[research] queue: full'); return false; }
    r.queue.push(techId);
    return true;
  }

  function isDone(id) {
    const r = state();
    return !!(r && r.done[id]);
  }

  function isRecipeUnlocked(recipeId) {
    const def = recipeDefSafe(recipeId);
    if (!def) return false;
    if (!def.unlockedBy) return true; // starting recipes always unlocked
    return isDone(def.unlockedBy);
  }

  function unlockedRecipes() {
    const out = new Set();
    const recipes = (F.data && F.data.recipes) || {};
    for (const id in recipes) {
      if (Object.prototype.hasOwnProperty.call(recipes, id) && isRecipeUnlocked(id)) out.add(id);
    }
    return out;
  }

  function labTick(lab, speed) {
    const r = state();
    if (!r || !r.current) return;
    if (!lab || !lab.packs) return;
    const def = techDefSafe(r.current);
    if (!def) { r.current = null; return; }
    if (!hasAllPacks(lab, def)) return; // status 'missing_science_packs' handled by 32-machines.js
    const time = (def.cost && def.cost.time) || 1;
    const inc = (speed || 0) / Math.max(0.0001, time) / 60;
    if (inc <= 0) return;
    r.unitProgress += inc;
    const count = (def.cost && def.cost.count) || 1;
    let guard = 0;
    while (r.unitProgress >= 1 && guard++ < 1000) {
      if (!hasAllPacks(lab, def)) { r.unitProgress = F.util.clamp(r.unitProgress, 0, 0.999999); break; }
      r.unitProgress -= 1;
      const packs = (def.cost && def.cost.packs) || [];
      for (let i = 0; i < packs.length; i++) F.inv.remove(lab.packs, packs[i][0], packAmount(packs[i]));
      r.unitsDone++;
      if (r.unitsDone >= count) { finish(); break; }
    }
  }

  function progress() {
    const r = state();
    if (!r || !r.current) return 0;
    const def = techDefSafe(r.current);
    if (!def) return 0;
    const count = (def.cost && def.cost.count) || 1;
    return F.util.clamp((r.unitsDone + r.unitProgress) / count, 0, 1);
  }

  function bonus(key) {
    const r = state();
    if (!r) return 0;
    let total = 0;
    for (const id in r.done) {
      if (!r.done[id]) continue;
      const def = techDefSafe(id);
      if (!def || !def.effects) continue;
      for (let i = 0; i < def.effects.length; i++) {
        const eff = def.effects[i];
        if (eff.type === 'bonus' && eff.key === key) total += eff.value;
      }
    }
    return total;
  }

  function tick() {
    const r = state();
    if (!r || !r.current) return;
    const def = techDefSafe(r.current);
    if (!def) { r.current = null; return; } // dangling reference to a removed/unknown tech — drop it, never throw
    const count = (def.cost && def.cost.count) || 1;
    if (r.unitsDone >= count) finish();
  }

  function techInfo(id) {
    const def = techDefSafe(id);
    if (!def) return null;
    const r = state();
    const done = isDone(id);
    const isCurrent = !!(r && r.current === id);
    const queued = !!(r && r.queue.indexOf(id) >= 0);
    let unitsDone = 0, unitProgress = 0;
    if (isCurrent) {
      unitsDone = r.unitsDone; unitProgress = r.unitProgress;
    } else if (r && r.progressByTech[id]) {
      unitsDone = r.progressByTech[id].unitsDone; unitProgress = r.progressByTech[id].unitProgress;
    }
    const prereq = (def.prereq || []).slice();
    const met = r ? prereqsMet(def, r) : prereq.length === 0;
    const count = (def.cost && def.cost.count) || 1;
    return {
      id: id,
      name: F.t('tech.' + id),
      desc: F.t('tech.' + id + '.desc'),
      tier: def.tier,
      prereq: prereq,
      prereqsMet: met,
      cost: def.cost,
      effects: def.effects || [],
      unlocks: def.unlocks || [],
      done: done,
      isCurrent: isCurrent,
      queued: queued,
      available: !done && met,
      unitsDone: unitsDone,
      unitProgress: unitProgress,
      unitsTotal: count,
      fraction: F.util.clamp((unitsDone + unitProgress) / count, 0, 1),
    };
  }

  F.research = {
    available: available,
    start: start,
    cancel: cancel,
    queue: queue,
    isDone: isDone,
    isRecipeUnlocked: isRecipeUnlocked,
    unlockedRecipes: unlockedRecipes,
    labTick: labTick,
    progress: progress,
    bonus: bonus,
    tick: tick,
    techInfo: techInfo,
  };
})();
