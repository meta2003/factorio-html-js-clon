// 32-machines.js — furnaces, assembling machines, mining drills, labs, radar, lamp.
// See design/ARCHITECTURE.md §9 and GDD §6.13-6.20, §7.2, §7.4.1.
// Registers behaviours: 'furnace', 'assembler', 'drill', 'lab', 'radar', 'lamp' on F.behaviours,
// plus the F.machines API (setRecipe, craftTime, status, tick, insertLimit, activity).
(function () {
  'use strict';

  F.machines = {};

  // ---------------------------------------------------------------------
  // Local assumptions / fallbacks (documented in the report):
  // - F.data.smeltingFor(item) -> recipeId|null is the documented lookup; if 01-data.js
  //   does not provide it (not in ARCHITECTURE §3 verbatim), we fall back to a small local
  //   table mapping raw item -> smelting recipe id (recipe id == result item id, matching
  //   the F.data.recipes keying convention in ARCHITECTURE §3).
  // - "steel-plate" smelting is gated on F.research.isRecipeUnlocked('steel-plate') exactly
  //   as instructed; if F.research is not yet loaded/available we conservatively treat it
  //   as locked (never smelt steel) rather than silently allowing it.
  // - Mining time (GDD §6.13: rate = mining_speed / mining_time) is not exposed anywhere in
  //   the data schema, so a local MINING_TIME = 1s constant is used (matches the GDD's own
  //   worked numbers: burner speed 0.25 / 1 = 0.25 ore/s, electric 0.5 / 1 = 0.5 ore/s).
  // - Radar's far-scan target chunk is chosen via a locally generated ring-by-ring spiral
  //   offset table (29x29 square around the radar's chunk), since no shared spiral helper
  //   is defined elsewhere.
  // - Lab's accepted science-pack limit uses the current tech's cost.time via the same
  //   1.166s formula as crafting; with no tech selected a generous default (10) is used so
  //   inserters can still pre-stock packs.
  // ---------------------------------------------------------------------

  const MINING_TIME = 1; // seconds; see assumptions above

  const SMELT_FALLBACK = {
    'iron-ore': 'iron-plate',
    'copper-ore': 'copper-plate',
    'stone': 'stone-brick',
    'iron-plate': 'steel-plate',
  };

  // ---------------------------------------------------------------------
  // small shared helpers
  // ---------------------------------------------------------------------

  function safeEntityDef(type) {
    try { return F.data.entityDef(type); } catch (err) { F.log.warn('machines: unknown entity type', type); return null; }
  }
  function safeRecipeDef(id) {
    if (!id) return null;
    try { return F.data.recipeDef(id); } catch (err) { F.log.warn('machines: unknown recipe', id); return null; }
  }
  function stackSizeOf(id) {
    if (F.inv && typeof F.inv.stackSize === 'function') return F.inv.stackSize(id);
    const it = F.data.items[id];
    return (it && it.stack) || 100;
  }
  function isFuelItem(id) {
    const it = F.data.items[id];
    return !!(it && it.fuel > 0);
  }
  function footprintOf(def, dir) {
    if (F.entities && typeof F.entities.footprint === 'function') return F.entities.footprint(def, dir);
    const size = def.size || [1, 1];
    return (dir & 1) ? [size[1], size[0]] : [size[0], size[1]];
  }
  // one slot of output that can only hold one item type up to its stack size
  function canFit(outInv, id, amt) {
    const slot = outInv[0];
    if (!slot) return true;
    if (slot.id !== id) return false;
    return slot.count + amt <= stackSizeOf(id);
  }
  function craftsLimit(timeSeconds, speedVal) {
    const t = timeSeconds / (speedVal || 1);
    if (!(t > 0)) return 2;
    const crafts = 1 + Math.ceil(1.166 / t);
    return F.util.clamp(crafts, 2, 100);
  }
  function emitPollution(e, def, sat) {
    if (F.pollution && typeof F.pollution.emit === 'function' && def.pollution) {
      F.pollution.emit(e, def.pollution / 3600 * sat);
    }
  }
  function spillInventory(e, inv) {
    if (!inv) return;
    for (let i = 0; i < inv.length; i++) {
      const s = inv[i];
      if (s) {
        if (F.ground && typeof F.ground.dropNear === 'function') F.ground.dropNear(e.x, e.y, s.id, s.count);
        inv[i] = null;
      }
    }
  }
  function returnToPlayer(e, inv) {
    if (!inv) return;
    for (let i = 0; i < inv.length; i++) {
      const s = inv[i];
      if (s) {
        if (F.player && typeof F.player.giveOrDrop === 'function') F.player.giveOrDrop(s.id, s.count);
        else if (F.ground && typeof F.ground.dropNear === 'function') F.ground.dropNear(e.x, e.y, s.id, s.count);
        inv[i] = null;
      }
    }
  }

  // ---------------------------------------------------------------------
  // power / fuel — shared by every machine behaviour
  // ---------------------------------------------------------------------

  // Returns satisfaction 0..1 for this tick and (for burner machines) consumes fuel.
  // `working` = true when the machine intends to make progress THIS tick.
  function chargePower(e, def, working) {
    const energy = def.energy || { type: 'none', usage: 0, drain: 0 };
    if (energy.type === 'electric') {
      const usage = energy.usage || 0;
      const drain = energy.drain || 0;
      const kW = working ? usage + drain : drain;
      if (F.power && typeof F.power.request === 'function') return F.power.request(e, kW);
      return 1; // power module not present yet — assume unlimited so other modules can be tested
    }
    if (energy.type === 'burner') {
      if (!working) return 1; // idle burner machines draw nothing and are never "unsatisfied"
      return chargeBurnerFuel(e, energy);
    }
    return 1; // 'none'
  }

  function chargeBurnerFuel(e, energy) {
    if (e.fuelJ == null) e.fuelJ = 0;
    const usageKW = energy.usage || 0;
    const neededPerTick = usageKW * 1000 / 60; // J
    if (e.fuelJ < neededPerTick) refuelFrom(e);
    if (e.fuelJ >= neededPerTick) {
      e.fuelJ -= neededPerTick;
      return 1;
    }
    return 0; // out of fuel
  }

  function refuelFrom(e) {
    if (!e.fuel) return;
    const slot = e.fuel[0];
    if (!slot) return;
    const it = F.data.items[slot.id];
    if (!it || !(it.fuel > 0)) return;
    slot.count--;
    e.fuelJ = (e.fuelJ || 0) + it.fuel * 1e6; // MJ -> J
    if (slot.count <= 0) e.fuel[0] = null;
  }

  // ---------------------------------------------------------------------
  // smelting recipe lookup (furnace)
  // ---------------------------------------------------------------------

  function smeltRecipeFor(item) {
    let recipeId;
    if (F.data && typeof F.data.smeltingFor === 'function') recipeId = F.data.smeltingFor(item);
    else recipeId = SMELT_FALLBACK[item] || null;
    if (recipeId && typeof recipeId === 'object') recipeId = recipeId.id; // F.data.smeltingFor returns a recipe object
    if (!recipeId) return null;
    if (recipeId === 'steel-plate') {
      if (F.research && typeof F.research.isRecipeUnlocked === 'function') {
        return F.research.isRecipeUnlocked('steel-plate') ? recipeId : null;
      }
      return null; // conservative: research module not ready -> steel refused
    }
    return recipeId;
  }
  function furnaceSpeed(def) {
    return (def.furnace && def.furnace.speed) || def.speed || 1;
  }

  // =======================================================================
  // FURNACE  (GDD §6.14, §7.4.1)
  // =======================================================================

  // Electric furnaces (def.energy.type 'electric') share this behaviour but have no fuel slot:
  // e.fuel stays null, so they refuse fuel items and list no 'fuel' inventory.
  function isBurnerDef(def) { return !!(def && def.energy && def.energy.type === 'burner'); }

  const furnaceBehaviour = {
    create(e) {
      e.fuel = isBurnerDef(safeEntityDef(e.type)) ? F.inv.create(1) : null;
      e.input = F.inv.create(1);
      e.output = F.inv.create(1);
      e.recipe = null;
      e.progress = 0;
      e.fuelJ = 0;
    },
    onRemove(e) {
      spillInventory(e, e.fuel);
      spillInventory(e, e.input);
      spillInventory(e, e.output);
    },
    accepts(e, item) {
      if (isFuelItem(item) && e.fuel) return Math.max(0, 5 - F.inv.count(e.fuel, item));
      const recipeId = smeltRecipeFor(item);
      if (!recipeId) return 0;
      if (e.input[0] && e.input[0].id !== item) return 0;
      const rdef = safeRecipeDef(recipeId);
      if (!rdef) return 0;
      const def = safeEntityDef(e.type);
      const ing = rdef.ingredients.find(([id]) => id === item) || rdef.ingredients[0];
      const amount = ing ? ing[1] : 1;
      const limit = craftsLimit(rdef.time, furnaceSpeed(def)) * amount;
      return Math.max(0, limit - F.inv.count(e.input, item));
    },
    insert(e, item, count) {
      if (isFuelItem(item) && e.fuel) {
        const remaining = F.inv.add(e.fuel, item, count, { ignoreStack: true });
        return count - remaining;
      }
      const recipeId = smeltRecipeFor(item);
      if (!recipeId) return 0;
      if (e.input[0] && e.input[0].id !== item) return 0;
      const remaining = F.inv.add(e.input, item, count, { ignoreStack: true });
      const added = count - remaining;
      if (added > 0) e.recipe = recipeId;
      return added;
    },
    take(e, filter) { return F.inv.takeOne(e.output, filter); },
    inventories(e) {
      const out = [];
      if (e.fuel) out.push({ name: 'fuel', inv: e.fuel });
      out.push({ name: 'input', inv: e.input }, { name: 'output', inv: e.output });
      return out;
    },
    status(e) { return e._status || 'idle'; },
    tick(e, def) { furnaceTick(e, def || safeEntityDef(e.type)); },
  };

  function furnaceTick(e, def) {
    if (!def) return;
    const speedVal = furnaceSpeed(def);
    // keep the recipe of a craft in progress (its input was already consumed at craft start)
    const recipeId = (e.progress > 0 && e.recipe) ? e.recipe : (e.input[0] ? smeltRecipeFor(e.input[0].id) : null);
    e.recipe = recipeId;
    const rdef = safeRecipeDef(recipeId);
    const midCraft = e.progress > 0;
    let canStart = false;
    let statusReason = 'no_ingredients';
    let ing = null, res = null;

    if (rdef) {
      ing = rdef.ingredients[0];
      res = rdef.results[0];
      if (midCraft) {
        canStart = true;
      } else {
        const haveEnough = F.inv.count(e.input, ing[0]) >= ing[1];
        const outOk = canFit(e.output, res[0], res[1]);
        if (haveEnough && outOk) canStart = true;
        else statusReason = !haveEnough ? 'no_ingredients' : 'output_full';
      }
    }

    const sat = chargePower(e, def, canStart);
    if (canStart && sat > 0) {
      if (!midCraft) F.inv.remove(e.input, ing[0], ing[1]);
      e.progress += (speedVal / rdef.time / 60) * sat;
      if (e.progress >= 1) {
        e.progress = 0;
        F.inv.add(e.output, res[0], res[1], { ignoreStack: true });
      }
      e._act = sat;
      e._status = 'working';
      emitPollution(e, def, sat);
    } else {
      e._act = 0;
      if (!rdef) e._status = 'no_ingredients';
      else if (sat <= 0) e._status = (def.energy && def.energy.type === 'burner') ? 'no_fuel' : 'no_power';
      else e._status = statusReason;
    }
  }

  F.behaviours.furnace = furnaceBehaviour;

  // =======================================================================
  // ASSEMBLER  (GDD §6.15, §7.4.1)
  // =======================================================================

  function assemblerSpeed(def) {
    return (def.assembler && def.assembler.speed) || def.speed || 1;
  }

  const assemblerBehaviour = {
    create(e) {
      e.recipe = null;
      e.input = [];   // one slot per ingredient, rebuilt by setRecipe
      e.output = F.inv.create(1);
      e.progress = 0;
    },
    onRemove(e) {
      returnToPlayer(e, e.input);
      spillInventory(e, e.output);
    },
    accepts(e, item) {
      if (!e.recipe) return 0;
      const rdef = safeRecipeDef(e.recipe);
      if (!rdef) return 0;
      const ing = rdef.ingredients.find(([id]) => id === item);
      if (!ing) return 0;
      const def = safeEntityDef(e.type);
      const limit = craftsLimit(rdef.time, assemblerSpeed(def)) * ing[1];
      return Math.max(0, limit - F.inv.count(e.input, item));
    },
    insert(e, item, count) {
      if (!e.recipe) return 0;
      const rdef = safeRecipeDef(e.recipe);
      if (!rdef || !rdef.ingredients.some(([id]) => id === item)) return 0;
      const remaining = F.inv.add(e.input, item, count, { ignoreStack: true });
      return count - remaining;
    },
    take(e, filter) { return F.inv.takeOne(e.output, filter); },
    inventories(e) {
      return [
        { name: 'input', inv: e.input },
        { name: 'output', inv: e.output },
      ];
    },
    status(e) { return e._status || 'idle'; },
    tick(e, def) { assemblerTick(e, def || safeEntityDef(e.type)); },
  };

  function assemblerTick(e, def) {
    if (!def) return;
    const speedVal = assemblerSpeed(def);
    const rdef = safeRecipeDef(e.recipe);
    const midCraft = e.progress > 0;
    let canStart = false;
    let statusReason = 'no_ingredients';

    if (rdef) {
      if (midCraft) {
        canStart = true;
      } else {
        const haveAll = rdef.ingredients.every(([id, amt]) => F.inv.count(e.input, id) >= amt);
        const res = rdef.results[0];
        const outOk = canFit(e.output, res[0], res[1]);
        if (haveAll && outOk) canStart = true;
        else statusReason = !haveAll ? 'no_ingredients' : 'output_full';
      }
    }

    const sat = chargePower(e, def, canStart);
    if (canStart && sat > 0) {
      if (!midCraft) rdef.ingredients.forEach(([id, amt]) => F.inv.remove(e.input, id, amt));
      e.progress += (speedVal / rdef.time / 60) * sat;
      if (e.progress >= 1) {
        e.progress = 0;
        const res = rdef.results[0];
        F.inv.add(e.output, res[0], res[1], { ignoreStack: true });
      }
      e._act = sat;
      e._status = 'working';
      emitPollution(e, def, sat);
    } else {
      e._act = 0;
      if (!rdef) e._status = 'no_recipe';
      else if (sat <= 0) e._status = (def.energy && def.energy.type === 'burner') ? 'no_fuel' : 'no_power';
      else e._status = statusReason;
    }
  }

  F.behaviours.assembler = assemblerBehaviour;

  // EXPANSION.md §6.3: recipe categories an assembler will accept (default: hand + advanced,
  // i.e. everything the crafting grid + assembler recipe picker already showed pre-expansion).
  function assemblerCategories(def) { return (def.assembler && def.assembler.categories) || ['crafting', 'advanced']; }

  function assemblerSetRecipe(e, id) {
    const def = safeEntityDef(e.type);
    if (!def || def.behaviour !== 'assembler') { F.log.warn('machines.setRecipe: not an assembler', e && e.type); return false; }
    returnToPlayer(e, e.input);
    e.progress = 0;
    if (id == null) { e.recipe = null; e.input = []; return true; }
    const rdef = safeRecipeDef(id);
    if (!rdef) return false;
    if (assemblerCategories(def).indexOf(rdef.category) === -1) {
      F.log.warn('machines.setRecipe: recipe category not allowed for this assembler', id, rdef.category);
      return false;
    }
    // Plain assemblers have no fluid boxes (that is the generic 'crafter' behaviour's job,
    // see EXPANSION.md §7.1) — refuse a fluid recipe rather than silently dropping its fluids.
    if ((rdef.fluidIngredients && rdef.fluidIngredients.length) || (rdef.fluidResults && rdef.fluidResults.length)) {
      F.log.warn('machines.setRecipe: recipe has fluids, not settable on a plain assembler', id);
      return false;
    }
    e.recipe = id;
    e.input = rdef.ingredients.map(() => null);
    return true;
  }

  // =======================================================================
  // DRILL  (GDD §6.13)
  // =======================================================================

  function drillSpeed(def) { return (def.drill && def.drill.speed) || def.speed || 0.25; }

  function drillRegion(e, def) {
    const area = (def.drill && def.drill.area) || 2;
    const [fw, fh] = footprintOf(def, e.dir);
    const ring = Math.max(0, Math.floor((area - Math.max(fw, fh)) / 2));
    return [e.x - ring, e.y - ring, e.x + fw - 1 + ring, e.y + fh - 1 + ring];
  }

  function findNextOreTile(e, x0, y0, x1, y1) {
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    const total = Math.max(1, w * h);
    if (e.rrIndex == null) e.rrIndex = 0;
    for (let k = 0; k < total; k++) {
      const idx = (e.rrIndex + k) % total;
      const tx = x0 + (idx % w), ty = y0 + Math.floor(idx / w);
      if (F.world.resourceAmount(tx, ty) > 0) {
        e.rrIndex = (idx + 1) % total;
        return { tx, ty };
      }
    }
    return null;
  }

  function drillOutputTile(e, def) {
    const off = (def.drill && def.drill.output) || [0, -1];
    const [dx, dy] = F.util.rotVec(off, e.dir);
    return [e.x + dx, e.y + dy];
  }

  // Attempts to push e.held out. Returns true when e.held has been fully placed (cleared).
  function drillTryOutput(e, def) {
    if (!e.held) return true;
    const [tx, ty] = drillOutputTile(e, def);
    const target = F.world.entityAt ? F.world.entityAt(tx, ty) : null;
    if (target) {
      if (F.belts && typeof F.belts.isBeltLike === 'function' && F.belts.isBeltLike(target)) {
        const sideDir = F.util.oppDir(e.dir);
        if (F.belts.insertFromSide(target, sideDir, e.held.id)) { e.held = null; return true; }
        return false;
      }
      if (F.entities && typeof F.entities.insertItem === 'function') {
        const n = F.entities.insertItem(target, e.held.id, e.held.count);
        if (n >= e.held.count) { e.held = null; return true; }
        if (n > 0) e.held.count -= n;
        return false;
      }
      return false;
    }
    // empty ground
    if (F.ground && typeof F.ground.drop === 'function') {
      const existing = typeof F.ground.at === 'function' ? F.ground.at(tx, ty) : null;
      if (existing && existing.id !== e.held.id) return false;
      const leftover = F.ground.drop(tx, ty, e.held.id, e.held.count);
      if (!leftover) { e.held = null; return true; }
      e.held.count = leftover;
      return false;
    }
    return false;
  }

  const drillBehaviour = {
    create(e) {
      const def = safeEntityDef(e.type);
      if (def && def.energy && def.energy.type === 'burner') { e.fuel = F.inv.create(1); e.fuelJ = 0; }
      e.progress = 0;
      e.target = null;
      e.held = null;
      e.rrIndex = 0;
    },
    onRemove(e) {
      if (e.fuel) spillInventory(e, e.fuel);
      if (e.held) {
        if (F.ground && typeof F.ground.dropNear === 'function') F.ground.dropNear(e.x, e.y, e.held.id, e.held.count);
        e.held = null;
      }
    },
    accepts(e, item) {
      if (!e.fuel) return 0; // electric drills have no fuel slot
      if (!isFuelItem(item)) return 0;
      return Math.max(0, 5 - F.inv.count(e.fuel, item));
    },
    insert(e, item, count) {
      if (!e.fuel || !isFuelItem(item)) return 0;
      const remaining = F.inv.add(e.fuel, item, count, { ignoreStack: true });
      return count - remaining;
    },
    inventories(e) {
      const list = [];
      if (e.fuel) list.push({ name: 'fuel', inv: e.fuel });
      return list;
    },
    status(e) { return e._status || 'idle'; },
    tick(e, def) { drillTick(e, def || safeEntityDef(e.type)); },
  };

  function drillTick(e, def) {
    if (!def) return;
    if (e.held) drillTryOutput(e, def);

    let working = false, statusReason = null;
    if (e.held) {
      statusReason = 'output_full';
    } else {
      if (!e.target || !F.world.resourceAmount(e.target.tx, e.target.ty)) {
        const [x0, y0, x1, y1] = drillRegion(e, def);
        e.target = findNextOreTile(e, x0, y0, x1, y1);
      }
      if (!e.target) statusReason = 'no_minable_resources';
      else working = true;
    }

    const speedVal = drillSpeed(def);
    const sat = chargePower(e, def, working);
    if (working && sat > 0) {
      e.progress += (speedVal / MINING_TIME / 60) * sat;
      if (e.progress >= 1) {
        e.progress -= 1;
        const item = F.world.mineResource(e.target.tx, e.target.ty, 1);
        if (item) e.held = { id: item, count: 1 };
        if (F.world.resourceAmount(e.target.tx, e.target.ty) <= 0) e.target = null;
        emitPollution(e, def, sat);
        if (e.held) drillTryOutput(e, def);
      }
      e._act = sat;
      e._status = 'working';
    } else {
      e._act = 0;
      if (statusReason) e._status = statusReason;
      else e._status = (def.energy && def.energy.type === 'burner') ? 'no_fuel' : 'no_power';
    }
  }

  F.behaviours.drill = drillBehaviour;

  // =======================================================================
  // LAB  (GDD §6.16)
  // =======================================================================

  function labSpeed(def) { return (def.lab && def.lab.speed) || def.speed || 1; }

  function labLimit() {
    if (F.state && F.state.research && F.state.research.current && F.data && typeof F.data.techDef === 'function') {
      try {
        const t = F.data.techDef(F.state.research.current);
        return craftsLimit(t.cost.time, 1);
      } catch (err) { /* fall through to default */ }
    }
    return 10;
  }

  function labHasRequiredPacks(e) {
    if (F.state && F.state.research && F.state.research.current && F.data && typeof F.data.techDef === 'function') {
      try {
        const t = F.data.techDef(F.state.research.current);
        return t.cost.packs.every(([id]) => F.inv.count(e.packs, id) >= 1);
      } catch (err) { /* fall through */ }
    }
    return !F.inv.isEmpty(e.packs);
  }

  // EXPANSION.md §6.3: lab slot count comes from def.lab.slots (default 2, existing labs).
  function labSlots(def) { return (def && def.lab && def.lab.slots) || 2; }

  const labBehaviour = {
    create(e) {
      const def = safeEntityDef(e.type);
      e.packs = F.inv.create(labSlots(def));
      e.progress = 0;
    },
    onRemove(e) { spillInventory(e, e.packs); },
    // EXPANSION.md §6.3: grow an older save's smaller (e.g. 2-slot) pack inventory up to the
    // current def size (e.g. 5 for the expansion's labs) instead of losing/ignoring extra packs.
    wake(e) {
      const def = safeEntityDef(e.type);
      const slots = labSlots(def);
      if (Array.isArray(e.packs) && e.packs.length < slots) {
        while (e.packs.length < slots) e.packs.push(null);
      }
    },
    accepts(e, item) {
      const it = F.data.items[item];
      if (!it || it.category !== 'science') return 0;
      const idx = (() => {
        for (let i = 0; i < e.packs.length; i++) if (e.packs[i] && e.packs[i].id === item) return i;
        for (let i = 0; i < e.packs.length; i++) if (!e.packs[i]) return i;
        return -1;
      })();
      if (idx === -1) return 0;
      const have = e.packs[idx] ? e.packs[idx].count : 0;
      return Math.max(0, labLimit() - have);
    },
    insert(e, item, count) {
      const it = F.data.items[item];
      if (!it || it.category !== 'science') return 0;
      const remaining = F.inv.add(e.packs, item, count, { ignoreStack: true });
      return count - remaining;
    },
    take(e, filter) { return F.inv.takeOne(e.packs, filter); },
    inventories(e) { return [{ name: 'packs', inv: e.packs }]; },
    status(e) { return e._status || 'idle'; },
    tick(e, def) { labTick(e, def || safeEntityDef(e.type)); },
  };

  function labTick(e, def) {
    if (!def) return;
    const hasTech = !!(F.state && F.state.research && F.state.research.current);
    const speedVal = labSpeed(def);
    const sat = chargePower(e, def, hasTech);
    if (!hasTech) { e._act = 0; e._status = 'no_research'; return; }
    if (sat <= 0) { e._act = 0; e._status = (def.energy && def.energy.type === 'burner') ? 'no_fuel' : 'no_power'; return; }
    if (F.research && typeof F.research.labTick === 'function') F.research.labTick(e, speedVal * sat);
    const ok = labHasRequiredPacks(e);
    e._act = sat;
    e._status = ok ? 'working' : 'missing_science_packs';
    if (ok) emitPollution(e, def, sat);
  }

  F.behaviours.lab = labBehaviour;

  // =======================================================================
  // RADAR  (GDD §6.19)
  // =======================================================================

  const FAR_SCAN_RADIUS = 14; // (29 - 1) / 2
  const FAR_SCAN_OFFSETS = buildSpiralOffsets(FAR_SCAN_RADIUS);
  function buildSpiralOffsets(r) {
    const out = [];
    for (let ring = 1; ring <= r; ring++) {
      for (let x = -ring; x <= ring; x++) out.push([x, -ring]);
      for (let y = -ring + 1; y <= ring; y++) out.push([ring, y]);
      for (let x = ring - 1; x >= -ring; x--) out.push([x, ring]);
      for (let y = ring - 1; y >= -ring + 1; y--) out.push([-ring, y]);
    }
    return out;
  }

  const radarBehaviour = {
    create(e) {
      const def = safeEntityDef(e.type);
      if (def && def.energy && def.energy.type === 'burner') { e.fuel = F.inv.create(1); e.fuelJ = 0; }
      e.farJ = 0;
      e.farOff = 0;
    },
    onRemove(e) { if (e.fuel) spillInventory(e, e.fuel); },
    inventories(e) { return e.fuel ? [{ name: 'fuel', inv: e.fuel }] : []; },
    status(e) { return e._status || 'idle'; },
    tick(e, def) { radarTick(e, def || safeEntityDef(e.type)); },
  };

  function radarTick(e, def) {
    if (!def) return;
    const sat = chargePower(e, def, true);
    e._act = sat;
    if (sat <= 0) { e._status = (def.energy && def.energy.type === 'burner') ? 'no_fuel' : 'no_power'; return; }
    e._status = 'working';
    emitPollution(e, def, sat);

    const chunkOf = F.world.chunkOf(e.x, e.y);
    const cx = chunkOf[0], cy = chunkOf[1];
    if (F.state.tick % 60 === 0) {
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) F.world.ensureChunk(cx + dx, cy + dy);
    }

    e.farJ = (e.farJ || 0) + 5000 * sat;
    if (e.farJ >= 10e6) {
      e.farJ -= 10e6;
      if (e.farOff == null) e.farOff = 0;
      const chunks = (F.state.world && F.state.world.chunks) || {};
      let guard = 0;
      while (guard++ < FAR_SCAN_OFFSETS.length) {
        const off = FAR_SCAN_OFFSETS[e.farOff % FAR_SCAN_OFFSETS.length];
        e.farOff = (e.farOff + 1) % FAR_SCAN_OFFSETS.length;
        const tcx = cx + off[0], tcy = cy + off[1];
        const key = typeof F.world.chunkKey === 'function' ? F.world.chunkKey(tcx, tcy) : (tcx + ',' + tcy);
        if (!chunks[key]) { F.world.ensureChunk(tcx, tcy); break; }
      }
    }
  }

  F.behaviours.radar = radarBehaviour;

  // =======================================================================
  // LAMP  (GDD §6.20)
  // =======================================================================

  const lampBehaviour = {
    create(e) { e.powered = false; },
    status(e) { return e._status || 'idle'; },
    tick(e, def) { lampTick(e, def || safeEntityDef(e.type)); },
  };

  function lampTick(e, def) {
    if (!def) return;
    const sat = chargePower(e, def, true);
    e.powered = sat > 0;
    e._act = sat;
    e._status = sat > 0 ? 'working' : 'no_power';
  }

  F.behaviours.lamp = lampBehaviour;

  // =======================================================================
  // F.machines public API
  // =======================================================================

  const HANDLERS = {
    furnace: furnaceTick,
    assembler: assemblerTick,
    drill: drillTick,
    lab: labTick,
    radar: radarTick,
    lamp: lampTick,
  };

  F.machines.setRecipe = function (e, id) {
    return assemblerSetRecipe(e, id);
  };

  F.machines.craftTime = function (e) {
    const def = safeEntityDef(e.type);
    if (!def) return 0;
    if (def.behaviour === 'furnace') {
      const rdef = safeRecipeDef(e.recipe);
      return rdef ? rdef.time / furnaceSpeed(def) : 0;
    }
    if (def.behaviour === 'assembler') {
      const rdef = safeRecipeDef(e.recipe);
      return rdef ? rdef.time / assemblerSpeed(def) : 0;
    }
    return 0;
  };

  F.machines.status = function (e) {
    const def = safeEntityDef(e.type);
    const b = def && F.behaviours[def.behaviour];
    if (b && typeof b.status === 'function') return b.status(e);
    return e._status || 'idle';
  };

  F.machines.insertLimit = function (e, item) {
    const def = safeEntityDef(e.type);
    const b = def && F.behaviours[def.behaviour];
    if (b && typeof b.accepts === 'function') return b.accepts(e, item);
    return 0;
  };

  F.machines.activity = function (e) {
    return F.util.clamp(e._act || 0, 0, 1);
  };

  // EXPANSION.md §6.3: F.machines.recipesFor(e) -> unlocked recipe ids valid for this machine.
  // Used by the (existing and new) recipe pickers. Two families of machine can craft recipes:
  //  - assemblers: def.assembler.categories (default ['crafting','advanced']), and they cannot
  //    take a recipe with fluid ingredients/results (see assemblerSetRecipe above) so those are
  //    filtered out here too, before the player ever sees them in a picker.
  //  - anything else whose def carries `crafter.categories` (oil refinery, chemical plant, §7.1) —
  //    those DO handle fluids, so no filtering beyond category + unlock state.
  // Recipes hidden from every picker regardless (category not in either list) are simply absent.
  F.machines.recipesFor = function (e) {
    const def = safeEntityDef(e.type);
    if (!def) return [];
    let categories, excludeFluidRecipes;
    if (def.behaviour === 'assembler') {
      categories = assemblerCategories(def);
      excludeFluidRecipes = true;
    } else if (def.crafter && Array.isArray(def.crafter.categories)) {
      categories = def.crafter.categories;
      excludeFluidRecipes = false;
    } else {
      return [];
    }
    const out = [];
    const recipes = (F.data && F.data.recipes) || {};
    for (const id in recipes) {
      if (!Object.prototype.hasOwnProperty.call(recipes, id)) continue;
      const rdef = recipes[id];
      if (categories.indexOf(rdef.category) === -1) continue;
      if (excludeFluidRecipes && ((rdef.fluidIngredients && rdef.fluidIngredients.length) || (rdef.fluidResults && rdef.fluidResults.length))) continue;
      if (F.research && typeof F.research.isRecipeUnlocked === 'function' && !F.research.isRecipeUnlocked(id)) continue;
      out.push(id);
    }
    return out;
  };

  function hasHandler(e) {
    const def = e._def || (e._def = safeEntityDef(e.type));
    return !!(def && HANDLERS[def.behaviour]);
  }
  F.machines.tick = function () {
    const list = F.entities.filtered ? F.entities.filtered('machines', hasHandler) : F.entities.all();
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e) continue;
      // e._def: the entity's definition, cached on the entity (runtime-only: '_' keys are not saved)
      const def = e._def || (e._def = safeEntityDef(e.type));
      if (!def) continue;
      const fn = HANDLERS[def.behaviour];
      if (!fn) continue;
      try { fn(e, def); } catch (err) { F.log.error('machines.tick failed for', e.type, e.id, err); }
    }
  };
})();
