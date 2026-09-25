// 35-modules.js — module slots on machines (speed / productivity / efficiency modules).
// Data: src/07-data-modules.js (F.data.modules, item.module, entity def.moduleSlots).
//
// State: a machine with def.moduleSlots > 0 carries `e.modules`, an inventory array of that
// length holding at most one module per slot. It is created lazily (F.modules.inv), so saves
// from before modules existed load unchanged, and it is saved with the entity like any
// other inventory.
//
// 32-machines.js asks F.modules.effects(e) every tick for four factors:
//   speed        multiplies crafting / mining progress         (clamped to >= 0.2)
//   energy       multiplies the machine's usage (not its drain) (clamped to >= 0.2)
//   productivity added to e.prodProgress per finished craft / mined ore; at >= 1 one
//                extra result is produced for free
//   pollution    multiplies emitted pollution (energy factor x (1 + pollution bonus))
//
// Modules only go in by hand (F.api.insertInto / transferStack / the GUI slots), never through
// inserters — behaviours' insert() is untouched. Removing the machine returns its modules to
// the player (F.modules.returnAll, called from the machine behaviours' onRemove).
(function () {
  'use strict';

  var NONE = Object.freeze({ speed: 1, energy: 1, productivity: 0, pollution: 1 });
  var MIN_FACTOR = 0.2;

  function entityDef(e) {
    if (!e) return null;
    return (F.data && F.data.entities && F.data.entities[e.type]) || null;
  }
  function moduleDef(id) {
    var it = id && F.data && F.data.items && F.data.items[id];
    return (it && it.module) || null;
  }

  function isModule(id) { return !!moduleDef(id); }

  function slotsOf(e) {
    var def = entityDef(e);
    return (def && def.moduleSlots) || 0;
  }

  // Module inventory of e (created / grown on demand), or null when e takes no modules.
  function inv(e) {
    var n = slotsOf(e);
    if (!n) return null;
    if (!Array.isArray(e.modules)) e.modules = F.inv.create(n);
    while (e.modules.length < n) e.modules.push(null);
    return e.modules;
  }

  // Productivity only helps intermediate products (Factorio's rule): smelting, and recipes
  // whose first result is an intermediate or a science pack. Mining drills always qualify.
  function productivityAllowed(e, recipeId) {
    var def = entityDef(e);
    if (!def) return false;
    if (def.behaviour === 'drill') return true;
    var rid = recipeId !== undefined ? recipeId : e.recipe;
    if (!rid) return true; // no recipe yet: allowed until one is picked
    var r = F.data.recipes[rid];
    if (!r) return false;
    if (r.category === 'smelting') return true;
    var res = r.results && r.results[0];
    var it = res && F.data.items[res[0]];
    return !!(it && (it.category === 'intermediate' || it.category === 'science'));
  }

  function canInsert(e, id) {
    var m = moduleDef(id);
    if (!m) return false;
    if (m.kind === 'productivity' && !productivityAllowed(e)) return false;
    return true;
  }

  // Puts up to `count` modules of `id` into free slots of e. Returns how many went in.
  function insert(e, id, count) {
    var slots = inv(e);
    if (!slots || !canInsert(e, id)) return 0;
    var n = 0;
    for (var i = 0; i < slots.length && n < count; i++) {
      if (!slots[i]) { slots[i] = { id: id, count: 1 }; n++; }
    }
    return n;
  }

  function giveBack(e, id, count) {
    if (F.player && typeof F.player.giveOrDrop === 'function') F.player.giveOrDrop(id, count);
    else if (F.ground && typeof F.ground.dropNear === 'function') F.ground.dropNear(e.x, e.y, id, count);
  }

  // Keeps e.modules valid after a GUI slot edit: one module per slot, only modules, and no
  // productivity module on a recipe it cannot help. Everything else goes back to the player.
  function normalize(e) {
    var slots = inv(e);
    if (!slots) return;
    for (var i = 0; i < slots.length; i++) {
      var s = slots[i];
      if (!s) continue;
      if (!canInsert(e, s.id)) { giveBack(e, s.id, s.count); slots[i] = null; continue; }
      if (s.count > 1) { giveBack(e, s.id, s.count - 1); s.count = 1; }
    }
  }

  // Called by 32-machines.js after an assembler's recipe changes.
  function onRecipeChanged(e) { if (Array.isArray(e.modules)) normalize(e); }

  function returnAll(e) {
    if (!Array.isArray(e.modules)) return;
    for (var i = 0; i < e.modules.length; i++) {
      var s = e.modules[i];
      if (s) { giveBack(e, s.id, s.count); e.modules[i] = null; }
    }
  }

  // Raw sums of the module effects in e (for the GUI).
  function totals(e) {
    var t = { speed: 0, consumption: 0, productivity: 0, pollution: 0 };
    var slots = Array.isArray(e && e.modules) ? e.modules : null;
    if (!slots) return t;
    for (var i = 0; i < slots.length; i++) {
      var m = slots[i] && moduleDef(slots[i].id);
      if (!m) continue;
      t.speed += m.effect.speed;
      t.consumption += m.effect.consumption;
      t.productivity += m.effect.productivity;
      t.pollution += m.effect.pollution;
    }
    return t;
  }

  function effects(e) {
    if (!e || !Array.isArray(e.modules)) return NONE;
    var any = false;
    for (var i = 0; i < e.modules.length; i++) if (e.modules[i]) { any = true; break; }
    if (!any) return NONE;
    var t = totals(e);
    var energy = Math.max(MIN_FACTOR, 1 + t.consumption);
    return {
      speed: Math.max(MIN_FACTOR, 1 + t.speed),
      energy: energy,
      productivity: Math.max(0, t.productivity),
      pollution: energy * Math.max(0, 1 + t.pollution),
    };
  }

  F.modules = {
    NONE: NONE,
    isModule: isModule,
    def: moduleDef,
    slots: slotsOf,
    inv: inv,
    canInsert: canInsert,
    insert: insert,
    normalize: normalize,
    onRecipeChanged: onRecipeChanged,
    returnAll: returnAll,
    productivityAllowed: productivityAllowed,
    totals: totals,
    effects: effects,
  };

  // "Modules" help tab (label ui.tab.modules, text help.modules in 08-i18n-modules.js).
  (F._helpTabs = F._helpTabs || []).push('modules');
})();
