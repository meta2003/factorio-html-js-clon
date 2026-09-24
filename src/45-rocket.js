// 45-rocket.js — rocket silo: behaviour 'rocket-silo' (build parts -> ready -> launching ->
// cooldown), F.state.rocket (launches, firstLaunchTick), the victory window, the entity GUI
// and the launch-animation render layer. See design/EXPANSION.md §7.4 (spec), §6.1 (game-loop
// hooks), §6.5 (render hooks), §6.6 (UI/help/entity-GUI hooks) and its "Implementation notes"
// (exact early-registration snippets for a file that loads before 70-ui.js/61-render.js/80-game.js).
//
// Owns: src/45-rocket.js, test/scenarios-rocket.js only. Data (item/recipe/entity defs, the
// 'rocket-part' recipe, techs) lives in 05-data-expansion.js; all display strings live in
// 06-i18n-expansion.js (status.building/ready/launching/cooldown, help.rocket, item/ent/tech.*)
// — this file only adds the ui.rocket.* GUI labels and ui.tab.rocket help-tab label it needs
// itself (EXPANSION.md §9: "Feature modules may add extra i18n keys they need (UI labels)").
//
// Load order: this file (45) runs AFTER 20-entities.js/33-power.js (F.behaviours/F.inv/F.power
// already exist) but BEFORE 50-api.js/60-sprites.js/61-render.js/70-ui.js/71-ui-windows.js/
// 80-game.js. Every call into one of those later modules therefore happens lazily, from inside
// a function invoked at tick/render/GUI time (by which point the whole build has loaded) —
// never at this file's own top-level load time — except the three documented early-registration
// idioms below (F._renderHooks / F._entityGUIs / F._helpTabs / F.game._tickPhases&co.), which are
// plain-object pushes designed to be safe at load time regardless of order.
(function () {
  'use strict';

  // =========================================================================
  // Constants
  // =========================================================================
  var PART_RECIPE_ID = 'rocket-part';
  var SATELLITE_ITEM = 'satellite';
  var REWARD_ITEM = 'space-science-pack';
  var SATELLITE_REWARD = 1000;

  var DOOR_OPEN_TICKS = 120;   // 2 s: 'ready' stage door-open / rocket-reveal animation
  var DOOR_CLOSE_TICKS = 120;  // 2 s: doors re-close during the first part of 'cooldown'
  var LAUNCH_TICKS = 1200;     // 20 s
  var COOLDOWN_TICKS = 300;    // 5 s
  var RISE_TILES = 30;         // how far (in tiles) the rocket rises over the full launch
  var SMOKE_TICKS = 180;       // 3 s: smoke puffs only during the first part of launching
  var FLASH_TICKS = 20;        // light flash only in the very first frames of launching

  // =========================================================================
  // i18n — this module's own UI labels (ui.rocket.*) + the rocket help tab's label
  // (ui.tab.rocket; the tab body text, help.rocket, is already registered by
  // 06-i18n-expansion.js). status.building/ready/launching/cooldown are likewise
  // already registered there. F.i18n already exists at this file's load time
  // (02-i18n.js loads first), so this can run at the top level.
  // =========================================================================
  if (F.i18n && F.i18n.add) {
    F.i18n.add('en', {
      'ui.tab.rocket': 'Rocket silo',
      'ui.rocket.input': 'Rocket parts',
      'ui.rocket.satellite': 'Satellite',
      'ui.rocket.output': 'Output',
      'ui.rocket.parts': 'Parts: {done}/{needed}',
      'ui.rocket.craftProgress': 'Building part',
      'ui.rocket.launch': 'Launch',
      'ui.rocket.launchConfirm': 'The rocket will be lost. Launch without a satellite anyway?',
      'ui.rocket.autoLaunch': 'Auto-launch when ready',
      'ui.rocket.victoryTitle': 'ROCKET LAUNCHED!',
      'ui.rocket.victorySubtitle': 'Humanity has reached space. The journey continues.',
      'ui.rocket.victoryWindowTitle': 'Victory',
      'ui.rocket.continue': 'Continue playing',
      'ui.rocket.timePlayed': 'Time played',
      'ui.rocket.launches': 'Rockets launched',
      'ui.rocket.itemTypes': 'Item types produced',
      'ui.rocket.itemsProduced': 'Items produced',
      'ui.rocket.researchDone': 'Technologies researched',
      'ui.rocket.entitiesBuilt': 'Structures built',
    });
  }
  (F._helpTabs = F._helpTabs || []).push('rocket');

  // =========================================================================
  // Small local helpers (duplicated rather than imported — 32-machines.js's
  // equivalents are private to that module's closure; see EXPANSION.md's "guarded
  // local fallback" rule in its header).
  // =========================================================================
  function safeEntityDef(type) {
    try { return F.data.entityDef(type); } catch (err) { F.log.warn('rocket: unknown entity type', type); return null; }
  }
  function safeRecipeDef(id) {
    if (!id) return null;
    try { return F.data.recipeDef(id); } catch (err) { F.log.warn('rocket: unknown recipe', id); return null; }
  }
  function partRecipeDef() { return safeRecipeDef(PART_RECIPE_ID); }
  // Per-ingredient amount for one rocket-part craft, read from the recipe itself
  // (05-data-expansion.js) rather than hard-coded, so this file stays correct if
  // the recipe's amounts ever change. Returns 0 for anything that is not an
  // ingredient of 'rocket-part'.
  function ingredientAmount(item) {
    var rdef = partRecipeDef();
    if (!rdef) return 0;
    for (var i = 0; i < rdef.ingredients.length; i++) if (rdef.ingredients[i][0] === item) return rdef.ingredients[i][1];
    return 0;
  }
  // Same insertion-buffer formula as furnace/assembler inputs (ARCHITECTURE.md §8):
  // roughly 1.166s worth of crafts, clamped 2..100, so inserters don't hoard more
  // than ~2 rocket-parts' worth of any one ingredient.
  function craftsLimit(timeSeconds, speedVal) {
    var t = timeSeconds / (speedVal || 1);
    if (!(t > 0)) return 2;
    var crafts = 1 + Math.ceil(1.166 / t);
    return F.util.clamp(crafts, 2, 100);
  }
  function partsNeededOf(def) { return (def && def.rocketSilo && def.rocketSilo.partsNeeded) || 20; }

  function chargePower(e, def, working) {
    var energy = (def && def.energy) || { type: 'none', usage: 0, drain: 0 };
    if (energy.type !== 'electric') return 1;
    var kW = working ? (energy.usage || 0) + (energy.drain || 0) : (energy.drain || 0);
    if (F.power && typeof F.power.request === 'function') return F.power.request(e, kW);
    return 1; // power module not present (partial build) — assume unlimited
  }

  function spillInventory(e, inv) {
    if (!inv) return;
    for (var i = 0; i < inv.length; i++) {
      var s = inv[i];
      if (s) {
        if (F.ground && typeof F.ground.dropNear === 'function') F.ground.dropNear(e.x, e.y, s.id, s.count);
        inv[i] = null;
      }
    }
  }

  // =========================================================================
  // Behaviour 'rocket-silo' (EXPANSION.md §7.4)
  // =========================================================================
  var rocketSiloBehaviour = {
    create: function (e) {
      e.input = F.inv.create(3);      // low-density-structure / rocket-fuel / rocket-control-unit
      e.satellite = F.inv.create(1);  // 'satellite' only, max 1
      e.output = F.inv.create(1);     // space-science-pack, ignoreStack on add
      e.parts = 0;
      e.progress = 0;
      e.stage = 'building';           // 'building' | 'ready' | 'launching' | 'cooldown'
      e.stageT = 0;
      e.autoLaunch = false;
    },
    // Defensive resilience for an older/partial save missing a field (this is a
    // brand-new entity type, so this should never actually trigger in practice —
    // kept for consistency with every other behaviour's wake()).
    wake: function (e) {
      if (!Array.isArray(e.input)) e.input = F.inv.create(3);
      while (e.input.length < 3) e.input.push(null);
      if (!Array.isArray(e.satellite)) e.satellite = F.inv.create(1);
      if (!Array.isArray(e.output)) e.output = F.inv.create(1);
      if (typeof e.parts !== 'number') e.parts = 0;
      if (typeof e.progress !== 'number') e.progress = 0;
      if (!e.stage) e.stage = 'building';
      if (typeof e.stageT !== 'number') e.stageT = 0;
      if (typeof e.autoLaunch !== 'boolean') e.autoLaunch = false;
    },
    onRemove: function (e) {
      spillInventory(e, e.input);
      spillInventory(e, e.satellite);
      spillInventory(e, e.output);
    },
    accepts: function (e, item) {
      var perCraft = ingredientAmount(item);
      if (perCraft > 0) {
        var rdef = partRecipeDef();
        var limit = rdef ? craftsLimit(rdef.time, 1) * perCraft : perCraft * 2;
        var have = F.inv.count(e.input, item);
        return Math.max(0, limit - have);
      }
      if (item === SATELLITE_ITEM) {
        var s = e.satellite[0];
        if (s && s.id !== SATELLITE_ITEM) return 0;
        return Math.max(0, 1 - (s ? s.count : 0));
      }
      return 0;
    },
    insert: function (e, item, count) {
      if (ingredientAmount(item) > 0) {
        var remaining = F.inv.add(e.input, item, count, { ignoreStack: true });
        return count - remaining;
      }
      if (item === SATELLITE_ITEM) {
        var s = e.satellite[0];
        if (s && s.id !== SATELLITE_ITEM) return 0;
        var have = s ? s.count : 0;
        var add = Math.min(count, 1 - have);
        if (add <= 0) return 0;
        if (!s) e.satellite[0] = { id: SATELLITE_ITEM, count: add }; else s.count += add;
        return add;
      }
      return 0;
    },
    take: function (e, filter) { return F.inv.takeOne(e.output, filter); },
    inventories: function (e) {
      return [
        { name: 'input', inv: e.input },
        { name: 'satellite', inv: e.satellite },
        { name: 'output', inv: e.output },
      ];
    },
    status: function (e) { return e._status || e.stage || 'building'; },
  };
  F.behaviours['rocket-silo'] = rocketSiloBehaviour;

  // =========================================================================
  // Tick logic (per-entity state machine)
  // =========================================================================
  function ensureRocketState() {
    if (!F.state.rocket || typeof F.state.rocket !== 'object') F.state.rocket = { launches: 0, firstLaunchTick: null };
  }

  function tickBuilding(e, def) {
    var rdef = partRecipeDef();
    var needed = partsNeededOf(def);
    var midCraft = e.progress > 0;
    var haveAll = false;
    if (rdef) {
      haveAll = true;
      for (var i = 0; i < rdef.ingredients.length; i++) {
        var ing = rdef.ingredients[i];
        if (F.inv.count(e.input, ing[0]) < ing[1]) { haveAll = false; break; }
      }
    }
    var canStart = !!rdef && e.parts < needed && (midCraft || haveAll);
    var sat = chargePower(e, def, canStart);
    if (canStart && sat > 0) {
      if (!midCraft) {
        for (var j = 0; j < rdef.ingredients.length; j++) F.inv.remove(e.input, rdef.ingredients[j][0], rdef.ingredients[j][1]);
      }
      e.progress += (1 / rdef.time / 60) * sat;
      e._working = true;
      if (e.progress >= 1) {
        e.progress = 0;
        e.parts++;
        if (e.parts >= needed) { e.stage = 'ready'; e.stageT = 0; }
      }
      e._status = 'building';
    } else {
      e._working = false;
      e._status = (sat <= 0) ? 'no_power' : 'building';
    }
  }

  function tickReady(e, def) {
    chargePower(e, def, false);
    e._working = false;
    e._status = 'ready';
    var hasSat = !!(e.satellite[0] && e.satellite[0].id === SATELLITE_ITEM);
    if (e.autoLaunch && hasSat) rocketLaunch(e);
  }

  function completeLaunch(e) {
    var hadSat = !!(e.satellite[0] && e.satellite[0].id === SATELLITE_ITEM);
    if (hadSat) {
      F.inv.remove(e.satellite, SATELLITE_ITEM, 1);
      F.inv.add(e.output, REWARD_ITEM, SATELLITE_REWARD, { ignoreStack: true });
    }
    e.parts = 0;
    e.progress = 0;
    ensureRocketState();
    var isFirst = F.state.rocket.launches === 0;
    F.state.rocket.launches++;
    if (isFirst) {
      F.state.rocket.firstLaunchTick = F.state.tick;
      if (F.ui && typeof F.ui.open === 'function') F.ui.open('victory', {});
    }
    F.events.emit('rocket:launched', { entity: e, first: isFirst, satellite: hadSat, launches: F.state.rocket.launches });
    e.stage = 'cooldown';
    e.stageT = 0;
  }

  function tickLaunching(e, def) {
    chargePower(e, def, false);
    e._working = true;
    e._status = 'launching';
    if (e.stageT >= LAUNCH_TICKS) completeLaunch(e);
  }

  function tickCooldown(e, def) {
    chargePower(e, def, false);
    e._working = false;
    e._status = 'cooldown';
    if (e.stageT >= COOLDOWN_TICKS) { e.stage = 'building'; e.stageT = 0; }
  }

  function rocketSiloTickOne(e) {
    var def = safeEntityDef(e.type);
    if (!def) return;
    if (e.stage === 'building') { e.stageT = 0; tickBuilding(e, def); return; }
    e.stageT = (e.stageT || 0) + 1;
    if (e.stage === 'ready') tickReady(e, def);
    else if (e.stage === 'launching') tickLaunching(e, def);
    else if (e.stage === 'cooldown') tickCooldown(e, def);
    else { e.stage = 'building'; e.stageT = 0; tickBuilding(e, def); }
  }

  function tickAllRocketSilos() {
    if (!F.entities || typeof F.entities.ofType !== 'function') return;
    var list = F.entities.ofType('rocket-silo');
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (!e || e._removed) continue;
      try { rocketSiloTickOne(e); } catch (err) { F.log.error('rocket-silo tick failed', e.id, err); }
    }
  }

  // =========================================================================
  // F.rocket — public API
  // =========================================================================
  // F.rocket.launch(e, opts={force}) -> bool. Only valid from stage 'ready'.
  // Requires a satellite aboard unless opts.force is set (the GUI calls with
  // force only after F.ui.confirm — "the rocket will be lost"); autoLaunch
  // (tickReady above) never needs force since it only fires when a satellite
  // is already aboard.
  function rocketLaunch(e, opts) {
    opts = opts || {};
    if (!e || e.stage !== 'ready') return false;
    var hasSat = !!(e.satellite && e.satellite[0] && e.satellite[0].id === SATELLITE_ITEM);
    if (!hasSat && !opts.force) return false;
    e.stage = 'launching';
    e.stageT = 0;
    return true;
  }
  F.rocket = { launch: rocketLaunch };

  // =========================================================================
  // Game-loop hooks (EXPANSION.md §6.1 — queue pattern, safe at load time
  // regardless of whether 80-game.js has loaded yet).
  // =========================================================================
  F.game = F.game || {};
  (F.game._onNewGame = F.game._onNewGame || []).push(function () {
    F.state.rocket = { launches: 0, firstLaunchTick: null };
  });
  (F.game._onRebuild = F.game._onRebuild || []).push(function () {
    ensureRocketState();
    if (typeof F.state.rocket.launches !== 'number') F.state.rocket.launches = 0;
    if (F.state.rocket.firstLaunchTick === undefined) F.state.rocket.firstLaunchTick = null;
    registerVictoryWindow(); // F.ui (70-ui.js) is guaranteed loaded by the time any rebuild runs
  });
  (F.game._tickPhases = F.game._tickPhases || []).push({ name: 'rocket', after: 'machines', fn: tickAllRocketSilos });

  // =========================================================================
  // Victory window (F.ui.registerWindow — not in EXPANSION.md's early-queue list,
  // so it is registered lazily from the onRebuild hook above instead, by which
  // point 70-ui.js has always finished loading; F.ui.registerWindow itself is a
  // plain object-registry write with no DOM access, so calling it repeatedly
  // across newGame/load is harmless). Built from F.ui's own primitives only
  // (windowFrame/iconEl/close) rather than 71-ui-windows.js's private helpers,
  // which this file cannot reach. Inline styles per EXPANSION.md's own
  // suggestion ("or use inline styles") since style.css is not this file's.
  // =========================================================================
  function addStatRow(box, label, value) {
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:space-between;gap:16px;padding:2px 0;';
    var l = document.createElement('span'); l.textContent = label; l.style.color = '#aaa';
    var v = document.createElement('span'); v.textContent = value; v.style.color = '#ffe6c0'; v.style.fontWeight = '600';
    row.appendChild(l); row.appendChild(v);
    box.appendChild(row);
  }

  function createVictoryWindow() {
    if (typeof window !== 'undefined' && window.HEADLESS) return null; // F.ui.open already no-ops headless; extra guard is cheap
    var body = document.createElement('div');
    body.style.cssText = 'padding:4px 2px;min-width:340px;max-width:420px;text-align:center;';

    if (F.ui && typeof F.ui.iconEl === 'function') {
      var icon = F.ui.iconEl(SATELLITE_ITEM, 64);
      icon.style.margin = '0 auto 8px';
      body.appendChild(icon);
    }

    var title = document.createElement('div');
    title.textContent = F.t('ui.rocket.victoryTitle');
    title.style.cssText = 'font-size:24px;font-weight:800;color:#ffa500;text-shadow:0 0 10px rgba(255,165,0,.55);margin-bottom:4px;letter-spacing:.5px;';
    body.appendChild(title);

    var subtitle = document.createElement('div');
    subtitle.textContent = F.t('ui.rocket.victorySubtitle');
    subtitle.style.cssText = 'color:#e0dcd3;margin-bottom:14px;';
    body.appendChild(subtitle);

    var statsBox = document.createElement('div');
    statsBox.style.cssText = 'background:#262626;border:1px solid #0f0f0f;border-radius:3px;padding:10px 12px;margin-bottom:14px;text-align:left;';
    body.appendChild(statsBox);

    var timeSec = ((F.state && F.state.tick) || 0) / (F.C.TPS || 60);
    addStatRow(statsBox, F.t('ui.rocket.timePlayed'), (F.util && F.util.fmtTime) ? F.util.fmtTime(timeSec) : Math.round(timeSec) + 's');
    addStatRow(statsBox, F.t('ui.rocket.launches'), String((F.state && F.state.rocket && F.state.rocket.launches) || 0));

    var stStats = F.state && F.state.stats;
    if (stStats && stStats.produced) {
      var producedTypes = Object.keys(stStats.produced);
      var producedTotal = 0;
      for (var i = 0; i < producedTypes.length; i++) producedTotal += stStats.produced[producedTypes[i]] || 0;
      addStatRow(statsBox, F.t('ui.rocket.itemTypes'), String(producedTypes.length));
      addStatRow(statsBox, F.t('ui.rocket.itemsProduced'), String(producedTotal));
    }
    var researchDone = (F.state && F.state.research && F.state.research.done) ? Object.keys(F.state.research.done).length : 0;
    addStatRow(statsBox, F.t('ui.rocket.researchDone'), String(researchDone));
    var entCount = (F.api && typeof F.api.stats === 'function') ? F.api.stats().entities : ((F.state && F.state.entities) || []).length;
    addStatRow(statsBox, F.t('ui.rocket.entitiesBuilt'), String(entCount));

    var btn = document.createElement('button');
    btn.className = 'f-btn';
    btn.textContent = F.t('ui.rocket.continue');
    btn.style.cssText = 'font-size:14px;padding:8px 20px;background:#3a7a3a;border-color:#1c3d1c;color:#eafbea;';
    btn.addEventListener('click', function () { if (F.ui && F.ui.close) F.ui.close('victory'); });
    body.appendChild(btn);

    if (F.ui && typeof F.ui.windowFrame === 'function') return F.ui.windowFrame(F.t('ui.rocket.victoryWindowTitle'), body);
    return body;
  }

  function registerVictoryWindow() {
    if (!F.ui || typeof F.ui.registerWindow !== 'function') return;
    F.ui.registerWindow('victory', { create: createVictoryWindow });
  }

  // =========================================================================
  // Entity GUI (EXPANSION.md §6.6 early-queue snippet — F._entityGUIs, safe at
  // load time; 71-ui-windows.js's dispatch consults this before its own
  // built-in ENTITY_RENDERERS table).
  // =========================================================================
  (F._entityGUIs = F._entityGUIs || {})['rocket-silo'] = function (root, e, def, h) {
    h.header(root, e, def);

    var needed = partsNeededOf(def);
    root.appendChild(h.labeled(F.t('ui.rocket.parts', { done: e.parts, needed: needed }),
      h.bar(needed ? e.parts / needed : 0, '#e39827', e.parts + '/' + needed)));

    if (e.stage === 'building') {
      root.appendChild(h.labeled(F.t('ui.rocket.craftProgress'),
        h.bar(e.progress || 0, '#5eb663', Math.round((e.progress || 0) * 100) + '%')));
    }

    root.appendChild(h.row(
      h.labeled(F.t('ui.rocket.input'), h.slotGrid(e.input, { cols: 3, target: e, filter: function (id) { return ingredientAmount(id) > 0; } })),
      h.labeled(F.t('ui.rocket.satellite'), h.slotGrid(e.satellite, { cols: 1, target: e, filter: function (id) { return id === SATELLITE_ITEM; } })),
      h.labeled(F.t('ui.rocket.output'), h.slotGrid(e.output, { cols: 1, target: e, filter: function (id) { return id === REWARD_ITEM; } }))
    ));

    var hasSat = !!(e.satellite[0] && e.satellite[0].id === SATELLITE_ITEM);
    var canLaunch = e.stage === 'ready';
    var launchBtn = h.button(F.t('ui.rocket.launch'), function () {
      if (!canLaunch) return;
      if (hasSat) {
        rocketLaunch(e);
        h.refresh();
      } else if (F.ui && typeof F.ui.confirm === 'function') {
        F.ui.confirm(F.t('ui.rocket.launchConfirm')).then(function (ok) {
          if (ok) rocketLaunch(e, { force: true });
          h.refresh();
        });
      } else {
        rocketLaunch(e, { force: true });
        h.refresh();
      }
    });
    if (!canLaunch && launchBtn.setAttribute) launchBtn.setAttribute('disabled', 'disabled');
    root.appendChild(launchBtn);

    var autoRow = h.el('label', 'f-row');
    autoRow.style.cursor = 'pointer';
    var chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.checked = !!e.autoLaunch;
    chk.addEventListener('change', function () { e.autoLaunch = chk.checked; });
    autoRow.appendChild(chk);
    var lbl = document.createElement('span');
    lbl.textContent = ' ' + F.t('ui.rocket.autoLaunch');
    autoRow.appendChild(lbl);
    root.appendChild(autoRow);
  };

  // =========================================================================
  // Render hooks (EXPANSION.md §6.5 early-queue snippet — F._renderHooks, safe
  // at load time). entityOpts drives the base painter's pit-light blink while
  // actively crafting/launching; the 'objects' layer draws the door-opening
  // overlay + the free-flying rocket sprite during ready/launching/cooldown.
  // =========================================================================
  F._renderHooks = F._renderHooks || {
    layers: { floor: [], objects: [], air: [], overlay: [] },
    entityOpts: {},
    minimapColors: {},
    hidePlayerFns: [],
    altOverlayFns: [],
  };

  F._renderHooks.entityOpts['rocket-silo'] = function (e, def, tick) {
    var working = !!e._working || e.stage === 'launching';
    return { frame: tick, opts: { working: working } };
  };

  // Deterministic 0..1 jitter from a numeric seed (Math.sin trick) — no F.rng
  // (which would advance F.state.rng.s and mutate state from a render layer),
  // no Math.random (non-reproducible frame-to-frame for the same seed).
  function jitter01(seed) {
    var x = Math.sin(seed * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  }

  function drawSmokePuffs(ctx, e, stageT, centerPx, tpx) {
    var n = 6;
    var spreadFrac = F.util.clamp(stageT / SMOKE_TICKS, 0, 1);
    for (var i = 0; i < n; i++) {
      var seed = (e.id || 1) * 97 + i * 13.37;
      var jr = jitter01(seed);
      var jr2 = jitter01(seed + 4.21);
      var angle = jr * Math.PI * 2;
      var spread = spreadFrac * tpx * 4.5 * (0.4 + 0.6 * jr2);
      var px = centerPx[0] + Math.cos(angle) * spread;
      var py = centerPx[1] + Math.sin(angle) * spread * 0.55;
      var alpha = Math.max(0, 0.32 * (1 - spreadFrac));
      if (alpha <= 0) continue;
      var r = tpx * (0.5 + 0.6 * jr2);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#D8D4C8';
      ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  function drawOneSilo(ctx, e, cam, tpx) {
    var stage = e.stage, stageT = e.stageT || 0;
    if (stage === 'building') return; // static painter's own closed doors are enough

    var open01 = 0, showRocket = false, launchT = 0;
    if (stage === 'ready') { open01 = F.util.clamp(stageT / DOOR_OPEN_TICKS, 0, 1); showRocket = true; }
    else if (stage === 'launching') { open01 = 1; showRocket = true; launchT = F.util.clamp(stageT / LAUNCH_TICKS, 0, 1); }
    else if (stage === 'cooldown') { open01 = F.util.clamp(1 - stageT / DOOR_CLOSE_TICKS, 0, 1); showRocket = false; }

    if (F.sprites && typeof F.sprites.rocketSiloDoors === 'function') {
      var doorsCanvas = F.sprites.rocketSiloDoors(open01);
      if (doorsCanvas && doorsCanvas.width) {
        var p0 = cam.toScreen(e.x, e.y);
        ctx.drawImage(doorsCanvas, p0[0], p0[1], tpx * 9, tpx * 9);
      }
    }

    if (!showRocket) return;

    var cx = e.x + 4.5, cy = e.y + 4.5;
    var centerPx = cam.toScreen(cx, cy);

    if (stage === 'launching' && stageT < SMOKE_TICKS) drawSmokePuffs(ctx, e, stageT, centerPx, tpx);

    var reveal = stage === 'ready' ? F.util.clamp(stageT / DOOR_OPEN_TICKS, 0, 1) : 1;
    var easedRise = launchT * launchT; // ease-in: slow start, accelerating
    var scale = stage === 'launching' ? (0.85 + 0.3 * launchT) : (0.55 + 0.3 * reveal);
    var flame = 0;
    if (stage === 'launching') flame = F.util.clamp(1 + Math.floor(easedRise * 6 + ((F.state.tick || 0) % 3) / 3), 1, 7);

    var rocketCanvas = (F.sprites && typeof F.sprites.rocket === 'function') ? F.sprites.rocket(flame) : null;
    if (rocketCanvas && rocketCanvas.width) {
      var rw = tpx * 2 * scale, rh = tpx * 6 * scale;
      var riseAdditionalPx = easedRise * RISE_TILES * tpx;
      var baseY = centerPx[1] + tpx * 0.4;
      var drawX = centerPx[0] - rw / 2;
      var drawY = baseY - rh - riseAdditionalPx;
      if (stage === 'ready') drawY += (1 - reveal) * tpx * 3; // rises into view as the doors open
      ctx.drawImage(rocketCanvas, drawX, drawY, rw, rh);
    }

    if (stage === 'launching' && stageT < FLASH_TICKS && ctx.createRadialGradient) {
      var flashAlpha = (1 - stageT / FLASH_TICKS) * 0.55;
      if (flashAlpha > 0) {
        var grad = ctx.createRadialGradient(centerPx[0], centerPx[1], 0, centerPx[0], centerPx[1], tpx * 5);
        grad.addColorStop(0, 'rgba(255,255,255,' + flashAlpha.toFixed(2) + ')');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.save();
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(centerPx[0], centerPx[1], tpx * 5, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    }
  }

  // Never mutates F.state — only reads entity fields (id/x/y/stage/stageT),
  // F.state.tick and draws to ctx, per EXPANSION.md §6.5 / ARCHITECTURE.md §16.
  function drawRocketLayer(ctx, rect, cam) {
    if (typeof window !== 'undefined' && window.HEADLESS) return; // extra guard; F.render.frame() already no-ops headless
    if (!F.entities || typeof F.entities.ofType !== 'function') return;
    var list = F.entities.ofType('rocket-silo');
    if (!list || !list.length) return;
    var tpx = F.C.TILE * (cam.zoom || 1);
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (!e || e._removed) continue;
      if (e.x + 9 < rect.x0 || e.x > rect.x1 || e.y + 9 < rect.y0 || e.y > rect.y1) continue;
      try { drawOneSilo(ctx, e, cam, tpx); } catch (err) { F.log.error('rocket-silo render failed', e.id, err); }
    }
  }
  F._renderHooks.layers.objects.push(drawRocketLayer);
})();
