// 37-oil.js — Oil processing: pumpjack, oil refinery, chemical plant, storage tank.
// See design/EXPANSION.md §7.1 (spec), §6.2 (F.fluids.registerEntity), §6.1 (tick-phase/queue
// pattern for files loading before 80-game.js), §6.4 (F.api.addPlaceRule), §6.5 (F.render queue),
// §6.6 (F.ui/F.input queue). Also design/ARCHITECTURE.md §9-10 (assembler/fluids patterns this
// mirrors) and §3 (data schema). Data (items/recipes/entity defs/fluids/techs) already lives in
// 05-data-expansion.js; i18n names/status strings in 06-i18n-expansion.js; sprites (painters +
// icons) already in 65-sprites-oil.js — this file wires BEHAVIOUR only.
//
// Registers: F.behaviours['crafter'|'pumpjack'|'storage-tank'], F.fluids.registerEntity(...) for
// each, F.oil.setRecipe(e,id), a tick phase 'oil' (after 'fluids'), a pumpjack placement rule, an
// entity GUI for each behaviour, and F.render entityOpts/altOverlay/minimapColor hooks.
//
// Load order: this file (37) loads AFTER 05-data-expansion(05)/06-i18n-expansion(06)/10-world(10)/
// 20-entities(20)/30-belts(30)/31-inserters(31)/32-machines(32)/33-power(33)/34-research(34)/
// 36-pollution(36) — so F.data/F.behaviours/F.inv/F.fluids/F.power/F.machines/F.research all exist
// already and are called directly at load time where needed (F.fluids.registerEntity below). It
// loads BEFORE 40-player(40)/50-api(50)/60-sprites(60)/61-render(61)/70-ui(70)/75-input(75)/
// 80-game(80), so any call into THOSE modules from code that runs at LOAD time (not at game-runtime,
// when everything has finished loading) must go through the documented queue patterns instead.
(function () {
  'use strict';

  // =========================================================================================
  // Local assumptions / fallbacks (see final report):
  // - Fluid box cap for crafter fin/fout boxes: EXPANSION.md §7.1 says "fluid output box cap 100
  //   × results" without full precision; every recipe's single fluid ingredient/result amount here
  //   is <= 100 (sulfuric-acid's water 100 is the max), so a flat cap of 100 per box (matching the
  //   existing pipe's cap of 100) is used for both fin and fout boxes uniformly.
  // - craftsLimit()/emitPollution()/chargePower() duplicate small private helpers from
  //   32-machines.js (not exported on F.machines) — same formulas, reimplemented locally.
  // - F.api.addPlaceRule (§6.4, owned by 50-api.js) has NO documented early-registration queue,
  //   unlike F.game/F.render/F.ui/F.input (§6.1/§6.5/§6.6) — and 50-api.js loads AFTER this file,
  //   so `F.api` does not exist at this file's load time; calling F.api.addPlaceRule directly here
  //   would throw. Fixed with a local fallback: the pumpjack "no_resource" rule is registered
  //   lazily, once, from inside the F.game._onRebuild queue (§6.1) — onRebuild hooks only run when
  //   F.newGame()/F.load() is actually CALLED at game runtime, by which point every module
  //   (including 50-api.js) has finished loading. Idempotent (registers once).
  // - 50-api.js's afterTopologyChange()/fluidTopologyEntity() allowlist (used by F.api.rotate) only
  //   knows about 'pipe'|'offshore_pump'|'boiler'|'engine', not the new 'crafter'|'pumpjack'|
  //   'storage-tank' behaviours, so rotating an already-placed oil entity would not by itself
  //   trigger F.fluids.markDirty() and its ports would go stale. Fixed locally: the oil tick phase
  //   detects e.dir changes itself and calls F.fluids.markDirty() (one-tick lag, harmless). Placement
  //   itself is unaffected (create() already marks dirty, like every other fluid behaviour does).
  // - F.state.stats.produced/consumed exists (80-game.js) but 32-machines.js's furnace/assembler do
  //   not populate it, so this file matches that (no stats tracking) rather than introducing new
  //   behaviour other machines don't have.
  // =========================================================================================

  function safeEntityDef(type) {
    try { return F.data.entityDef(type); } catch (err) { F.log.warn('[oil] unknown entity type', type); return null; }
  }
  function safeRecipeDef(id) {
    if (!id) return null;
    try { return F.data.recipeDef(id); } catch (err) { F.log.warn('[oil] unknown recipe', id); return null; }
  }
  function craftsLimit(timeSeconds, speedVal) {
    var t = timeSeconds / (speedVal || 1);
    if (!(t > 0)) return 2;
    var crafts = 1 + Math.ceil(1.166 / t);
    return F.util.clamp(crafts, 2, 100);
  }
  function emitPollution(e, def, sat) {
    if (F.pollution && typeof F.pollution.emit === 'function' && def.pollution) {
      F.pollution.emit(e, def.pollution / 3600 * sat);
    }
  }
  // Electric-only power charging (every oil entity is electric per 05-data-expansion.js); mirrors
  // 32-machines.js's chargePower() for the 'electric' branch.
  function chargePower(e, def, working) {
    var energy = def.energy || { type: 'none', usage: 0, drain: 0 };
    if (energy.type !== 'electric') return 1;
    var kW = working ? (energy.usage || 0) + (energy.drain || 0) : (energy.drain || 0);
    if (F.power && typeof F.power.request === 'function') return F.power.request(e, kW);
    return 1;
  }
  function returnInputToPlayer(inv, x, y) {
    if (!inv) return;
    for (var i = 0; i < inv.length; i++) {
      var s = inv[i];
      if (s) {
        if (F.player && typeof F.player.giveOrDrop === 'function') F.player.giveOrDrop(s.id, s.count);
        else if (F.ground && typeof F.ground.dropNear === 'function') F.ground.dropNear(x, y, s.id, s.count);
        inv[i] = null;
      }
    }
  }
  function spillInventory(inv, x, y) {
    if (!inv) return;
    for (var i = 0; i < inv.length; i++) {
      var s = inv[i];
      if (s) {
        if (F.ground && typeof F.ground.dropNear === 'function') F.ground.dropNear(x, y, s.id, s.count);
        inv[i] = null;
      }
    }
  }
  // Current available amount/fluid of a box, preferring its segment (matches 33-power.js's own
  // internal convention of reading through box._seg when present).
  function boxState(box) {
    if (!box) return { fluid: null, amount: 0, cap: 0 };
    var seg = box._seg;
    return seg ? { fluid: seg.fluid, amount: seg.amount, cap: seg.capacity } : { fluid: box.fluid, amount: box.amount, cap: box.cap };
  }

  // =========================================================================================
  // Fluid port templates (EXPANSION.md §7.1), defined for dir=0 (north) as an offset from the
  // entity's own centre tile + an outward direction, then rotated at runtime with F.util.rotVec/
  // rotDir exactly like the boiler pattern in 33-power.js. Squares (3x3/5x5), so the centre tile
  // is the same regardless of rotation, but the port offsets still need rotating.
  // =========================================================================================
  var CRAFTER_PORTS = {
    'oil-refinery': {
      fin: [{ off: [-1, 2], dir: 2 }, { off: [1, 2], dir: 2 }],
      fout: [{ off: [-2, -2], dir: 0 }, { off: [0, -2], dir: 0 }, { off: [2, -2], dir: 0 }],
    },
    'chemical-plant': {
      fin: [{ off: [-1, 1], dir: 2 }, { off: [1, 1], dir: 2 }],
      fout: [{ off: [-1, -1], dir: 0 }, { off: [1, -1], dir: 0 }],
    },
  };
  var TANK_PORTS = [
    { off: [0, -1], dir: 0 }, { off: [1, 0], dir: 1 }, { off: [0, 1], dir: 2 }, { off: [-1, 0], dir: 3 },
  ];

  function entityCentre(e, def) {
    var fp = F.entities.footprint(def, e.dir);
    return [e.x + (fp[0] - 1) / 2, e.y + (fp[1] - 1) / 2];
  }
  function rotatedPort(cx, cy, spec, dir, kind, boxKey) {
    var ro = F.util.rotVec(spec.off, dir);
    var rd = F.util.rotDir(spec.dir, dir);
    return { x: Math.round(cx + ro[0]), y: Math.round(cy + ro[1]), dir: rd, kind: kind, boxKey: boxKey };
  }

  function crafterPorts(e, def) {
    var tmpl = CRAFTER_PORTS[e.type];
    if (!tmpl) return [];
    var c = entityCentre(e, def);
    var out = [];
    var i;
    for (i = 0; i < tmpl.fin.length; i++) out.push(rotatedPort(c[0], c[1], tmpl.fin[i], e.dir, 'any', 'fin' + i));
    for (i = 0; i < tmpl.fout.length; i++) out.push(rotatedPort(c[0], c[1], tmpl.fout[i], e.dir, 'any', 'fout' + i));
    return out;
  }
  function crafterBoxes(e) {
    var out = [];
    var i;
    for (i = 0; i < e.fin.length; i++) out.push(['fin' + i, e.fin[i]]);
    for (i = 0; i < e.fout.length; i++) out.push(['fout' + i, e.fout[i]]);
    return out;
  }

  function pumpjackPorts(e, def) {
    var c = entityCentre(e, def);
    return [rotatedPort(c[0], c[1], { off: [0, -1], dir: 0 }, e.dir, 'crude-oil', 'fb')];
  }
  function pumpjackBoxes(e) { return [['fb', e.fb]]; }

  function tankPorts(e, def) {
    var c = entityCentre(e, def);
    var out = [];
    for (var i = 0; i < TANK_PORTS.length; i++) out.push(rotatedPort(c[0], c[1], TANK_PORTS[i], e.dir, 'any', 'fb'));
    return out;
  }
  function tankBoxes(e) { return [['fb', e.fb]]; }

  // F.fluids (33-power.js) is already loaded at this point (33 < 37) — safe to call directly.
  F.fluids.registerEntity('crafter', { boxes: crafterBoxes, ports: crafterPorts });
  F.fluids.registerEntity('pumpjack', { boxes: pumpjackBoxes, ports: pumpjackPorts });
  F.fluids.registerEntity('storage-tank', { boxes: tankBoxes, ports: tankPorts });

  // =========================================================================================
  // BEHAVIOUR: crafter (oil-refinery, chemical-plant)
  // =========================================================================================

  function crafterCreate(e) {
    var def = safeEntityDef(e.type);
    e.recipe = null;
    e.progress = 0;
    e.input = F.inv.create(4);
    e.output = F.inv.create(2);
    var fin = (def && def.crafter && def.crafter.fluidIn) || 0;
    var fout = (def && def.crafter && def.crafter.fluidOut) || 0;
    e.fin = []; for (var i = 0; i < fin; i++) e.fin.push({ fluid: null, amount: 0, cap: 100 });
    e.fout = []; for (var j = 0; j < fout; j++) e.fout.push({ fluid: null, amount: 0, cap: 100 });
    e.workingTicks = 0;
    e._lastDir = e.dir;
    F.fluids.markDirty();
  }
  function crafterOnRemove(e) {
    returnInputToPlayer(e.input, e.x, e.y);
    spillInventory(e.output, e.x, e.y);
    F.fluids.markDirty();
  }
  function crafterAccepts(e, item) {
    if (!e.recipe) return 0;
    var rdef = safeRecipeDef(e.recipe); if (!rdef) return 0;
    var ing = null;
    for (var i = 0; i < rdef.ingredients.length; i++) if (rdef.ingredients[i][0] === item) { ing = rdef.ingredients[i]; break; }
    if (!ing) return 0;
    var def = safeEntityDef(e.type);
    var speedVal = (def && def.crafter && def.crafter.speed) || 1;
    var limit = craftsLimit(rdef.time, speedVal) * ing[1];
    return Math.max(0, limit - F.inv.count(e.input, ing[0]));
  }
  function crafterInsert(e, item, count) {
    if (!e.recipe) return 0;
    var rdef = safeRecipeDef(e.recipe); if (!rdef) return 0;
    var isIngredient = false;
    for (var i = 0; i < rdef.ingredients.length; i++) if (rdef.ingredients[i][0] === item) { isIngredient = true; break; }
    if (!isIngredient) return 0;
    var remaining = F.inv.add(e.input, item, count, { ignoreStack: true });
    return count - remaining;
  }
  function crafterTake(e, filter) { return F.inv.takeOne(e.output, filter); }
  function crafterInventories(e) {
    return [{ name: 'input', inv: e.input }, { name: 'output', inv: e.output }];
  }
  function crafterStatus(e) { return e._status || 'idle'; }

  F.behaviours['crafter'] = {
    create: crafterCreate,
    onRemove: crafterOnRemove,
    accepts: crafterAccepts,
    insert: crafterInsert,
    take: crafterTake,
    inventories: crafterInventories,
    status: crafterStatus,
  };

  // Revised design (see report): a crafter's fluid ingredients/results are consumed/produced
  // GRADUALLY, proportional to the progress made THIS tick — like the boiler pulling ~1 water/tick
  // rather than requiring its whole 100-unit batch to be sitting in the (often much larger, shared)
  // segment before a craft can even begin. Item ingredients are still consumed as one batch at the
  // true start of a cycle (matches the assembler/furnace convention). This also means there is no
  // separate "how much have I banked so far" buffer to lose on save/load — e.progress and the fin/
  // fout boxes' own (segment-backed) amounts are the only state, and both are ordinary saved fields.
  function crafterTick(e, def) {
    if (e._lastDir !== e.dir) { e._lastDir = e.dir; F.fluids.markDirty(); }
    var rdef = safeRecipeDef(e.recipe);
    if (!rdef) { e._act = 0; e._status = e.recipe ? 'no_ingredients' : 'no_recipe'; return; }

    var midCraft = e.progress > 0;
    var speedVal = (def.crafter && def.crafter.speed) || 1;

    // Items + a first output-room sanity check are only gated at the true start of a cycle.
    var itemsOk = true, outItemsOk = true;
    if (!midCraft) {
      itemsOk = rdef.ingredients.every(function (ing) { return F.inv.count(e.input, ing[0]) >= ing[1]; });
      outItemsOk = rdef.results.every(function (res) { return F.inv.canAdd(e.output, res[0], res[1], { ignoreStack: true }); });
    }
    if (!itemsOk || !outItemsOk) {
      chargePower(e, def, false);
      e._act = 0;
      e._status = !itemsOk ? 'no_ingredients' : 'output_full';
      return;
    }

    var sat = chargePower(e, def, true);
    var wantDelta = (speedVal / rdef.time / 60) * sat;
    var fi = rdef.fluidIngredients || [], fo = rdef.fluidResults || [];
    var ratio = wantDelta > 0 ? 1 : 0;
    var i, need, avail, s, giveAmt, room;

    // Peek (don't consume yet): how much of THIS tick's pro-rated fluid need can actually be met,
    // and is there room for THIS tick's pro-rated fluid output — scale wantDelta down to match
    // (the crafter actively pulls only what a slow-filling segment can currently supply, instead of
    // stalling forever waiting for a large one-shot batch to appear).
    for (i = 0; i < fi.length && ratio > 0; i++) {
      need = fi[i][1] * wantDelta;
      if (need <= 0) continue;
      var box = e.fin[i];
      if (!box) { ratio = 0; break; }
      var bs = boxState(box);
      avail = (bs.fluid && bs.fluid !== fi[i][0]) ? 0 : bs.amount;
      ratio = Math.min(ratio, F.util.clamp(avail / need, 0, 1));
    }
    for (i = 0; i < fo.length && ratio > 0; i++) {
      giveAmt = fo[i][1] * wantDelta;
      if (giveAmt <= 0) continue;
      var obox = e.fout[i];
      if (!obox) { ratio = 0; break; }
      s = boxState(obox);
      if (s.fluid && s.fluid !== fo[i][0]) { ratio = 0; break; }
      room = s.cap - s.amount;
      ratio = Math.min(ratio, F.util.clamp(room / giveAmt, 0, 1));
    }

    var actualDelta = wantDelta * ratio;
    if (actualDelta > 0) {
      if (!midCraft) rdef.ingredients.forEach(function (ing) { F.inv.remove(e.input, ing[0], ing[1]); });
      for (i = 0; i < fi.length; i++) { var pullAmt = fi[i][1] * actualDelta; if (pullAmt > 0) F.fluids.pull(e.fin[i], fi[i][0], pullAmt); }
      for (i = 0; i < fo.length; i++) { var pushAmt = fo[i][1] * actualDelta; if (pushAmt > 0) F.fluids.push(e.fout[i], fo[i][0], pushAmt); }
      e.progress += actualDelta;
      if (e.progress >= 1) {
        e.progress = 0;
        rdef.results.forEach(function (res) { F.inv.add(e.output, res[0], res[1], { ignoreStack: true }); });
      }
      e._act = sat;
      e._status = 'working';
      e.workingTicks = (e.workingTicks || 0) + 1;
      emitPollution(e, def, sat);
    } else {
      e._act = 0;
      if (sat <= 0) e._status = 'no_power';
      else e._status = (fi.length && ratio < 1) ? 'no_ingredients' : 'output_full';
    }
  }

  // F.oil.setRecipe(e, id) — EXPANSION.md §7.1: validates category against def.crafter.categories
  // and research unlock, resets fluid box fluids, returns leftover input items to the player.
  // (F.api.setRecipe/F.machines.setRecipe only handle the 'assembler' behaviour and will reject a
  // crafter entity — this is the crafter-specific entry point; the recipe-picker GUI below calls it.)
  function oilSetRecipe(e, id) {
    var def = safeEntityDef(e.type);
    if (!def || def.behaviour !== 'crafter') { F.log.warn('F.oil.setRecipe: not a crafter', e && e.type); return false; }
    returnInputToPlayer(e.input, e.x, e.y);
    e.progress = 0;
    e.fin.forEach(function (b) { b.fluid = null; b.amount = 0; });
    e.fout.forEach(function (b) { b.fluid = null; b.amount = 0; });
    F.fluids.markDirty();
    if (id == null) { e.recipe = null; return true; }
    var rdef = safeRecipeDef(id);
    if (!rdef) return false;
    var cats = (def.crafter && def.crafter.categories) || [];
    if (cats.indexOf(rdef.category) === -1) {
      F.log.warn('F.oil.setRecipe: recipe category not allowed for this crafter', id, rdef.category);
      return false;
    }
    if (F.research && typeof F.research.isRecipeUnlocked === 'function' && !F.research.isRecipeUnlocked(id)) {
      F.log.warn('F.oil.setRecipe: recipe not unlocked yet', id);
      return false;
    }
    if ((rdef.fluidIngredients || []).length > e.fin.length || (rdef.fluidResults || []).length > e.fout.length) {
      F.log.warn('F.oil.setRecipe: recipe needs more fluid boxes than this crafter has', id);
      return false;
    }
    e.recipe = id;
    return true;
  }

  // =========================================================================================
  // BEHAVIOUR: pumpjack
  // =========================================================================================

  function pumpjackCreate(e) {
    var def = safeEntityDef(e.type);
    e.fb = { fluid: null, amount: 0, cap: 1000 };
    e._animFrame = 0;
    e._lastDir = e.dir;
    var c = entityCentre(e, def);
    var cx = Math.round(c[0]), cy = Math.round(c[1]);
    var res = (F.world && F.world.resource) ? F.world.resource(cx, cy) : null;
    // Yield % seeded from the well's world amount (60..400, EXPANSION.md §6.4); 100% fallback if
    // somehow missing (should not happen — F.api.addPlaceRule guards this at placement time).
    e.yield = (res && res.item === 'crude-oil') ? res.amount : 100;
    F.fluids.markDirty();
  }
  function pumpjackOnRemove() { F.fluids.markDirty(); }
  function pumpjackStatus(e) { return e._status || 'idle'; }

  F.behaviours['pumpjack'] = {
    create: pumpjackCreate,
    onRemove: pumpjackOnRemove,
    status: pumpjackStatus,
  };

  function pumpjackTick(e, def) {
    if (e._lastDir !== e.dir) { e._lastDir = e.dir; F.fluids.markDirty(); }
    var c = entityCentre(e, def);
    var res = (F.world && F.world.resource) ? F.world.resource(Math.round(c[0]), Math.round(c[1])) : null;
    var hasOil = !!(res && res.item === 'crude-oil');
    var sat = chargePower(e, def, hasOil);
    if (hasOil && sat > 0) {
      var ratePerTick = (e.yield / 100) * 10 / F.C.TPS;
      var accepted = F.fluids.push(e.fb, 'crude-oil', ratePerTick * sat);
      if (accepted > 0) {
        e.yield = Math.max(20, e.yield - accepted * 0.0005);
        e._animFrame = ((e._animFrame || 0) + 1) % 16;
        e._act = sat;
        e._status = 'working';
        emitPollution(e, def, sat);
      } else {
        e._act = 0;
        e._status = 'output_full';
      }
    } else {
      e._act = 0;
      e._status = hasOil ? 'no_power' : 'no_oil';
    }
  }

  // EXPANSION.md §6.4: F.api.addPlaceRule('pumpjack', fn) -> null|'no_resource'. See "local
  // fallbacks" comment above for why this is registered lazily via F.game._onRebuild instead of
  // called directly here.
  function pumpjackPlaceRule(def, tx, ty, dir) {
    var fp = F.entities.footprint(def, dir);
    var cx = tx + Math.floor((fp[0] - 1) / 2), cy = ty + Math.floor((fp[1] - 1) / 2);
    var res = (F.world && F.world.resource) ? F.world.resource(cx, cy) : null;
    if (!res || res.item !== 'crude-oil') return 'no_resource';
    return null;
  }
  var placeRuleRegistered = false;
  function ensurePlaceRuleRegistered() {
    if (placeRuleRegistered) return;
    if (F.api && typeof F.api.addPlaceRule === 'function') {
      F.api.addPlaceRule('pumpjack', pumpjackPlaceRule);
      placeRuleRegistered = true;
    } else {
      F.log.warn('[oil] F.api.addPlaceRule not available; pumpjack no_resource rule not registered this rebuild');
    }
  }

  // =========================================================================================
  // BEHAVIOUR: storage-tank
  // =========================================================================================

  function tankCreate(e) {
    e.fb = { fluid: null, amount: 0, cap: 25000 };
    e._lastDir = e.dir;
    F.fluids.markDirty();
  }
  function tankOnRemove() { F.fluids.markDirty(); }
  function tankStatus() { return 'working'; }

  F.behaviours['storage-tank'] = {
    create: tankCreate,
    onRemove: tankOnRemove,
    status: tankStatus,
  };

  function tankCheckDir(e) {
    if (e._lastDir !== e.dir) { e._lastDir = e.dir; F.fluids.markDirty(); }
  }

  // =========================================================================================
  // Tick phase (EXPANSION.md §7.1: "Tick phase after 'fluids'") — registered via the §6.1 queue
  // pattern since 80-game.js (which owns F.game.addTickPhase) loads after this file.
  // =========================================================================================
  var OIL_BEHAVIOURS = { crafter: 1, pumpjack: 1, 'storage-tank': 1 };
  function isOilEntity(e) {
    var def = e._def || (e._def = safeEntityDef(e.type));
    return !!(def && OIL_BEHAVIOURS[def.behaviour]);
  }
  function oilTick() {
    var list = F.entities.filtered ? F.entities.filtered('oil', isOilEntity) : F.entities.all();
    for (var i = 0; i < list.length; i++) {
      // F.entities.remove() defers the actual splice out of F.state.entities to flushRemovals()
      // (end of tick), so a just-removed entity can still be present here for the rest of this
      // same tick — skip it like every other tick phase implicitly does via behaviour dispatch.
      var e = list[i]; if (!e || e._removed) continue;
      var def = e._def || (e._def = safeEntityDef(e.type)); if (!def) continue;
      if (def.behaviour === 'crafter') crafterTick(e, def);
      else if (def.behaviour === 'pumpjack') pumpjackTick(e, def);
      else if (def.behaviour === 'storage-tank') tankCheckDir(e);
    }
  }

  F.game = F.game || {};
  (F.game._tickPhases = F.game._tickPhases || []).push({ name: 'oil', after: 'fluids', fn: oilTick });
  (F.game._onRebuild = F.game._onRebuild || []).push(ensurePlaceRuleRegistered);

  // =========================================================================================
  // Public API
  // =========================================================================================
  F.oil = {
    setRecipe: oilSetRecipe,
  };

  // =========================================================================================
  // Entity GUIs (EXPANSION.md §6.6 early-registration snippet — F._entityGUIs is created here if
  // 70-ui.js has not loaded yet, adopted as-is once it does).
  // =========================================================================================
  F._entityGUIs = F._entityGUIs || {};

  function crafterCraftTime(e, def) {
    var rdef = safeRecipeDef(e.recipe);
    if (!rdef) return 0;
    return rdef.time / ((def.crafter && def.crafter.speed) || 1);
  }

  F._entityGUIs['crafter'] = function (root, e, def, h) {
    h.header(root, e, def);
    var recipeIds = (F.machines && typeof F.machines.recipesFor === 'function') ? F.machines.recipesFor(e) : [];
    var pickerRow = h.row(
      h.recipePicker(e, recipeIds, e.recipe, function (id) { F.oil.setRecipe(e, id); h.refresh(); }),
      h.button('↺', function () { F.oil.setRecipe(e, null); h.refresh(); })
    );
    root.appendChild(h.labeled(F.t('ui.oil.recipe'), pickerRow));

    var i, finEls = [];
    for (i = 0; i < e.fin.length; i++) finEls.push(h.fluidBar(e.fin[i]));
    if (finEls.length) root.appendChild(h.labeled(F.t('ui.oil.fluidIn'), h.row.apply(h, finEls)));

    var foutEls = [];
    for (i = 0; i < e.fout.length; i++) foutEls.push(h.fluidBar(e.fout[i]));
    if (foutEls.length) root.appendChild(h.labeled(F.t('ui.oil.fluidOut'), h.row.apply(h, foutEls)));

    root.appendChild(h.row(
      h.labeled(F.t('ui.input'), h.slotGrid(e.input, { cols: 4, target: e })),
      h.labeled(F.t('ui.output'), h.slotGrid(e.output, { cols: 2, target: e }))
    ));

    var t = crafterCraftTime(e, def);
    root.appendChild(h.bar(e.progress || 0, '#e39827', t ? F.util.fmt(t, 1) + ' s' : ''));
  };

  F._entityGUIs['pumpjack'] = function (root, e, def, h) {
    h.header(root, e, def);
    var rate = (e.yield || 0) / 100 * 10;
    root.appendChild(h.labeled(F.t('ui.oil.yield'), h.el('div', 'f-hint', F.util.fmt(e.yield || 0, 1) + '%')));
    root.appendChild(h.labeled(F.t('ui.oil.rate'), h.el('div', 'f-hint', F.util.fmt(rate, 2) + '/s')));
    root.appendChild(h.fluidBar(e.fb));
  };

  F._entityGUIs['storage-tank'] = function (root, e, def, h) {
    h.header(root, e, def);
    root.appendChild(h.fluidBar(e.fb));
  };

  // =========================================================================================
  // Rendering hooks (EXPANSION.md §6.5 early-registration snippet — F._renderHooks created here
  // if 61-render.js has not loaded yet).
  // =========================================================================================
  F._renderHooks = F._renderHooks || {
    layers: { floor: [], objects: [], air: [], overlay: [] },
    entityOpts: {},
    minimapColors: {},
    hidePlayerFns: [],
    altOverlayFns: [],
  };

  // crafter: opts.working drives the flare/mixer animation in 65-sprites-oil.js's painters; frame
  // is a free-running clock (used for the refinery's flare flicker), not gated on "working".
  F._renderHooks.entityOpts['crafter'] = function (e) {
    return { frame: e.workingTicks || 0, opts: { working: e._status === 'working' } };
  };
  // pumpjack: frame only advances while actively pumping (EXPANSION.md §7.1).
  F._renderHooks.entityOpts['pumpjack'] = function (e) {
    return { frame: e._animFrame || 0, opts: {} };
  };
  // storage-tank: opts.fluid tints the level window.
  F._renderHooks.entityOpts['storage-tank'] = function (e) {
    return { frame: 0, opts: { fluid: F.fluids.fluidOf(e) } };
  };

  F._renderHooks.minimapColors['crafter'] = '#7A8590';
  F._renderHooks.minimapColors['pumpjack'] = '#6E767C';
  F._renderHooks.minimapColors['storage-tank'] = '#8A8F94';

  // Alt-mode: draw the current recipe's result icon (item or fluid) centred on crafters.
  F._renderHooks.altOverlayFns.push(function (ctx, e, def, sx, sy, tilePx) {
    if (def.behaviour !== 'crafter' || !e.recipe) return;
    var rdef = F.data.recipes[e.recipe]; if (!rdef) return;
    var size = Math.round(tilePx * 0.6);
    var icon = null;
    if (rdef.results && rdef.results.length && F.sprites && typeof F.sprites.item === 'function') {
      icon = F.sprites.item(rdef.results[0][0], size);
    } else if (rdef.fluidResults && rdef.fluidResults.length && F.sprites && typeof F.sprites.fluidIcon === 'function') {
      icon = F.sprites.fluidIcon(rdef.fluidResults[0][0], size);
    }
    if (!icon || !icon.width) return;
    var cx = sx + tilePx * e.w / 2, cy = sy + tilePx * e.h / 2;
    ctx.drawImage(icon, cx - icon.width / 2, cy - icon.height / 2);
  });

  // =========================================================================================
  // i18n — ui.oil.* labels (EXPANSION.md §9: feature modules add their own ui.* keys).
  // =========================================================================================
  F.i18n.add('en', {
    'ui.oil.recipe': 'Recipe',
    'ui.oil.fluidIn': 'Fluid inputs',
    'ui.oil.fluidOut': 'Fluid outputs',
    'ui.oil.yield': 'Yield',
    'ui.oil.rate': 'Rate',
  });
})();
