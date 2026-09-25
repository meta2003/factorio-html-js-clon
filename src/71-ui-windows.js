// 71-ui-windows.js — inventory+crafting window, all entity GUIs, technology tree
// window, help ("Navodila") window, map window, pause/save/load menu and the
// death overlay. See design/ARCHITECTURE.md §17 and design/GDD.md §9, §10.
//
// This module owns WINDOW CONTENT only. The generic window chrome (draggable
// title bar, the "x" close button, centring, and the E/Esc close shortcuts) is
// 70-ui.js's job (design/ARCHITECTURE.md §1 row for 70-ui.js: "DOM UI framework:
// windows, slots, tooltips, HUD, quickbar, alerts, minimap, menu"). We only
// call F.ui.registerWindow(name, spec) with a spec whose `render(root, payload)`
// fills the content area 70-ui.js gives us.
//
// ---------------------------------------------------------------------------
// Documented local assumptions (ARCHITECTURE.md does not spell these out —
// see the module's final report for the full list):
//  - F.ui.registerWindow(name, spec) is the registration entry point named in
//    this module's task brief; spec shape assumed: { title(payload)->string,
//    render(root, payload), onClose(payload)?, refreshOn: [eventNames],
//    pollFrames: 10 }. If F.ui.registerWindow does not exist at load time we
//    fall back to stashing the spec at F.ui.windows[name] and log a warning.
//  - Because ARCHITECTURE.md defines no per-frame UI event, "refresh ... every
//    10 frames while open" is self-driven with a ~167ms timer loop that stops
//    itself once the window's root is no longer attached to the document (or
//    F.ui.isOpen(name) says it closed), rather than depending on 70-ui.js to
//    call render() on a schedule. Event-based refresh ('inventory:changed',
//    'entity:changed') is ALSO self-subscribed via F.events for the same
//    reason — this makes refreshing correct even if 70-ui.js's own refresh
//    convention differs from ours.
//  - F.ui.slot(inv, index, opts) is used when present (documented in
//    ARCHITECTURE §17); a minimal local fallback renders the same visual
//    (icon + count) with a best-effort click handler when it is missing.
//  - F.ui.tooltip(html, x, y) is used when present; otherwise a small local
//    tooltip <div> is created lazily (never at load time).
//  - Entity runtime field names for behaviours not yet implemented in this
//    workspace (boiler/engine/offshore_pump/pole/turret/splitter/accumulator/
//    solar — homed in 33-power.js/35-combat.js) are taken verbatim from
//    ARCHITECTURE.md §10/§12; one exception: accumulator's live charge field
//    is not named in ARCHITECTURE.md, so `e.charge` (kJ) is assumed. Turret's
//    kill counter is likewise assumed to be `e.kills`. Every read of these
//    guesses is defensive (falls back to 0/"n/a" instead of throwing).
//  - Map window: task brief names `F.render.mapImage`; ARCHITECTURE §16 names
//    `F.render.minimap(sizePx)`. Both are tried, in that order.
//  - New-game-with-seed: task brief names `F.game.newGameWithSeed(seed)`;
//    ARCHITECTURE §18 only documents `F.newGame({seed})`. Both are tried.
// ---------------------------------------------------------------------------
(function () {
  'use strict';

  var HEADLESS = (typeof window !== 'undefined' && window.HEADLESS === true);
  if (HEADLESS) return; // pure DOM-GUI module; the simulation/tests never touch F.ui.*

  var U = F.util;

  // =========================================================================
  // i18n — ui.* keys owned by this module. Several keys duplicate the exact
  // Slovenian/English copy given in GDD.md §12.3 (re-registering the same
  // text under the same key from a second module is harmless — F.i18n.add
  // simply overwrites with an identical value); a few reuse keys other
  // modules already registered (cat.*, status.*, help.*, ui.research.*) by
  // reading them with F.t() rather than redefining them here.
  // =========================================================================

  F.i18n.add('en', {
    'ui.inventory': 'Inventory', 'ui.crafting': 'Crafting', 'ui.technologies': 'Technologies',
    'ui.map': 'Map', 'ui.instructions': 'Instructions', 'ui.settings': 'Settings',
    'ui.language': 'Language', 'ui.volume': 'Volume', 'ui.save': 'Save', 'ui.load': 'Load',
    'ui.export': 'Export save', 'ui.import': 'Import save', 'ui.copy': 'Copy',
    'ui.newGame': 'New game', 'ui.seed': 'Seed', 'ui.peaceful': 'Peaceful mode (no attacks)',
    'ui.start': 'Start', 'ui.continue': 'Continue', 'ui.confirmNewGame': 'The current game will be lost. Continue?',
    'ui.saved': 'Saved', 'ui.saveFailed': 'Saving is not possible (storage blocked by the browser)',
    'ui.invalidSave': 'Invalid save file', 'ui.sort': 'Sort', 'ui.search': 'Search…',
    'ui.close': 'Close', 'ui.showHelpOnStart': 'Show instructions on start',
    'ui.time': 'Time', 'ui.evolution': 'Evolution', 'ui.died': 'You died',
    'ui.respawnIn': 'Respawn in {0} s', 'ui.recipe': 'Recipe', 'ui.chooseRecipe': 'Choose a recipe',
    'ui.ingredients': 'Ingredients', 'ui.craftTime': 'Crafting time', 'ui.totalRaw': 'Total raw',
    'ui.products': 'Products', 'ui.fuel': 'Fuel', 'ui.input': 'Input', 'ui.output': 'Output',
    'ui.progress': 'Progress', 'ui.craftingSpeed': 'Crafting speed', 'ui.expectedResources': 'Expected resources',
    'ui.energyConsumption': 'Energy consumption', 'ui.powerOutput': 'Power output', 'ui.steamConsumption': 'Steam consumption',
    'ui.pumpingSpeed': 'Pumping speed', 'ui.satisfaction': 'Satisfaction', 'ui.production': 'Production',
    'ui.consumption': 'Consumption', 'ui.range': 'Range', 'ui.health': 'Health', 'ui.ammo': 'Ammo',
    'ui.kills': 'Kills', 'ui.fastTransferHint': 'Ctrl + click: fast transfer', 'ui.perMinute': '/min', 'ui.perSecond': '/s',
    'ui.water': 'Water', 'ui.steam': 'Steam', 'ui.charge': 'Charge', 'ui.filter': 'Filter',
    'ui.inPriority': 'Input priority', 'ui.outPriority': 'Output priority', 'ui.producers': 'Producers',
    'ui.consumers': 'Consumers', 'ui.noFilter': 'no filter', 'ui.priorityLeft': 'left', 'ui.priorityRight': 'right',
    'ui.priorityNone': 'none', 'ui.craftable': 'Craftable', 'ui.missing': 'Missing ingredients', 'ui.locked': 'Not researched',
    'ui.tab.controls': 'Controls', 'ui.tab.basics': 'Basics', 'ui.tab.progression': 'How to progress',
    'ui.tab.ratios': 'Ratios', 'ui.tab.tips': 'Tips', 'ui.tab.entities': 'Entities',
    'ui.helpLangToggle': 'Instructions language', 'ui.menu': 'Menu', 'ui.slots': 'Slots', 'ui.contents': 'Contents',
    'ui.slotEmpty': 'empty', 'ui.tier1': 'Red tier', 'ui.tier2': 'Red + green tier',
    'ui.saveSlots': 'Save slots', 'ui.slotName': 'Slot name', 'ui.noSlots': 'No saved slots', 'ui.delete': 'Delete',
    'ui.controlsSummary': 'Key summary', 'ui.exportHint': 'Select and copy the text below, or use the Copy button.',
    'ui.importHint': 'Paste a saved game (JSON) below and click Load.', 'ui.newGameConfirmed': 'New game created',
    'ui.daylight': 'Daylight', 'ui.uses': 'Uses', 'ui.perTile': '/tile', 'ui.notConnected': 'Not connected to a network',
    // Expansion (design/EXPANSION.md §5/§6.6): tier-3/4 tech column labels and
    // the empty-fluid-box label used by the fluidBar() entity-GUI helper.
    'ui.research.tier3': 'Blue tier', 'ui.research.tier4': 'Endgame tier', 'ui.fluidEmpty': 'Empty',
  });

  // =========================================================================
  // Small DOM helpers
  // =========================================================================
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function addRow(parent, label, valueText, extraCls) {
    var r = el('div', 'f-row' + (extraCls ? ' ' + extraCls : ''));
    r.appendChild(el('span', 'f-row-label', label));
    r.appendChild(el('span', 'f-row-value', valueText));
    parent.appendChild(r);
    return r;
  }
  function button(text, cls, onClick) {
    var b = el('button', 'f-btn' + (cls ? ' ' + cls : ''), text);
    b.type = 'button';
    b.addEventListener('click', function (ev) { ev.preventDefault(); onClick(ev); });
    return b;
  }

  // =========================================================================
  // Item icons — use F.sprites when it exists (60-sprites.js), else a plain
  // coloured square with a letter abbreviation so the GUI stays usable before
  // that module is wired in.
  // =========================================================================
  function iconAbbrev(id) {
    if (!id) return '';
    var parts = String(id).split('-');
    var s = '';
    for (var i = 0; i < parts.length && s.length < 3; i++) if (parts[i]) s += parts[i][0];
    return s.toUpperCase();
  }
  function buildIcon(id, size) {
    size = size || 32;
    var box = el('div', 'f-icon');
    box.style.width = size + 'px';
    box.style.height = size + 'px';
    if (!id) return box;
    var url = null;
    if (F.sprites && typeof F.sprites.itemURL === 'function') {
      try { url = F.sprites.itemURL(id); } catch (err) { url = null; }
    }
    if (url) {
      box.style.backgroundImage = 'url(' + url + ')';
      box.style.backgroundSize = 'cover';
    } else {
      var it = (F.data && F.data.items && F.data.items[id]) || null;
      var color = (it && it.icon && it.icon.color) || '#5a5a5a';
      box.style.background = color;
      box.appendChild(el('span', 'f-icon-abbrev', iconAbbrev(id)));
    }
    return box;
  }

  // =========================================================================
  // Fluid helpers (design/EXPANSION.md §2/§6.6). F.data.fluids and
  // F.sprites.fluidIconURL are owned by other agents (D-data / A-view) that
  // may not have loaded yet in a partial build, so both are guarded and fall
  // back to a plain coloured dot when unavailable.
  // =========================================================================
  function fluidDefSafe(fluidId) {
    return (fluidId && F.data && F.data.fluids && F.data.fluids[fluidId]) || null;
  }
  function fluidColorSafe(fluidId) {
    var fdef = fluidDefSafe(fluidId);
    return (fdef && fdef.color) || '#5a7fa0';
  }
  function fluidIconURLSafe(fluidId) {
    if (F.sprites && typeof F.sprites.fluidIconURL === 'function') {
      try { return F.sprites.fluidIconURL(fluidId); } catch (err) { return null; }
    }
    return null;
  }
  // Small inline icon for a fluid line in a tooltip: F.sprites.fluidIconURL
  // when available, else a coloured dot in the fluid's own colour.
  function fluidDotHtml(fluidId) {
    var url = fluidIconURLSafe(fluidId);
    if (url) return '<img src="' + url + '" style="width:10px;height:10px;vertical-align:middle;margin-right:4px;">';
    return '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' +
      fluidColorSafe(fluidId) + ';margin-right:4px;vertical-align:middle;"></span>';
  }
  function fluidLineHtml(fluidId, amount) {
    return fluidDotHtml(fluidId) + U.escapeHtml(F.t('fluid.' + fluidId)) + ' x' + amount;
  }
  // Icon element for a fluid (used by recipePicker() for fluid-only results):
  // F.sprites.fluidIconURL when available, else a coloured circle.
  function buildFluidIcon(fluidId, size) {
    size = size || 32;
    var box = el('div', 'f-icon');
    box.style.width = size + 'px';
    box.style.height = size + 'px';
    var url = fluidIconURLSafe(fluidId);
    if (url) {
      box.style.backgroundImage = 'url(' + url + ')';
      box.style.backgroundSize = 'cover';
    } else {
      box.style.background = fluidColorSafe(fluidId);
      box.style.borderRadius = '50%';
    }
    return box;
  }

  // =========================================================================
  // Tooltip — prefers F.ui.tooltip(html,x,y); falls back to a local element
  // created lazily (never touches `document` at load time).
  // =========================================================================
  var _localTip = null;
  function ensureLocalTip() {
    if (_localTip) return _localTip;
    var d = document.createElement('div');
    d.className = 'f-tooltip';
    d.style.cssText = 'position:fixed;pointer-events:none;z-index:99999;display:none;' +
      'background:rgba(15,15,15,0.96);color:#e0dcd3;border:1px solid #ffa500;padding:6px 9px;' +
      'font-size:13px;line-height:1.5;max-width:340px;border-radius:3px;box-shadow:0 2px 8px rgba(0,0,0,.5);';
    document.body.appendChild(d);
    _localTip = d;
    return d;
  }
  function showTooltip(html, x, y) {
    if (F.ui && typeof F.ui.tooltip === 'function') {
      try { F.ui.tooltip(html, x, y); return; } catch (err) { F.log.warn('F.ui.tooltip failed', err); }
    }
    var d = ensureLocalTip();
    d.innerHTML = html;
    d.style.left = Math.min(x + 16, (window.innerWidth || 1280) - 350) + 'px';
    d.style.top = Math.min(y + 16, (window.innerHeight || 720) - 40) + 'px';
    d.style.display = 'block';
  }
  function hideTooltip() {
    if (F.ui && typeof F.ui.tooltip === 'function') {
      try { F.ui.tooltip(null, 0, 0); return; } catch (err) { /* ignore */ }
    }
    if (_localTip) _localTip.style.display = 'none';
  }
  var tooltipAnchor = null; // element whose tooltip is currently shown (hidden when it leaves the DOM)
  function attachTooltip(elm, htmlFn) {
    elm.addEventListener('mouseenter', function (ev) { tooltipAnchor = elm; showTooltip(typeof htmlFn === 'function' ? htmlFn() : htmlFn, ev.clientX, ev.clientY); });
    elm.addEventListener('mousemove', function (ev) { tooltipAnchor = elm; showTooltip(typeof htmlFn === 'function' ? htmlFn() : htmlFn, ev.clientX, ev.clientY); });
    elm.addEventListener('mouseleave', function () { tooltipAnchor = null; hideTooltip(); });
  }
  function hideOrphanTooltip() {
    if (tooltipAnchor && (!document.body || !document.body.contains(tooltipAnchor))) { tooltipAnchor = null; hideTooltip(); }
  }

  // =========================================================================
  // Slot widget — uses F.ui.slot(inv, index, opts) when present (the shared
  // slot widget owned by 70-ui.js per ARCHITECTURE §17); otherwise a minimal
  // local fallback that shows the icon/count and does a best-effort transfer
  // on click via F.api.transferStack, so the module is not dead in isolation.
  // =========================================================================
  function fallbackSlot(invArr, index, opts) {
    opts = opts || {};
    var s = invArr && invArr[index];
    var d = el('div', 'f-slot');
    d.appendChild(buildIcon(s && s.id, 36));
    if (s && s.count > 1) d.appendChild(el('span', 'f-slot-count', String(s.count)));
    if (opts.filter) d.classList.add('f-slot-filter');
    if (s) {
      attachTooltip(d, function () { return itemTooltipHtml(s.id); });
    }
    d.addEventListener('click', function (ev) {
      ev.preventDefault();
      if (F.api && typeof F.api.transferStack === 'function' && opts.target) {
        try { F.api.transferStack(invArr, index, opts.target); } catch (err) { F.log.warn('transferStack failed', err); }
        if (typeof opts.onChange === 'function') opts.onChange();
      }
    });
    d.addEventListener('contextmenu', function (ev) { ev.preventDefault(); });
    return d;
  }
  function slot(invArr, index, opts) {
    if (F.ui && typeof F.ui.slot === 'function') {
      try { return F.ui.slot(invArr, index, opts); } catch (err) { F.log.warn('F.ui.slot failed, using fallback', err); }
    }
    return fallbackSlot(invArr, index, opts);
  }
  function slotGrid(invArr, cols, opts) {
    var grid = el('div', 'f-slot-grid');
    grid.style.gridTemplateColumns = 'repeat(' + cols + ', 1fr)';
    for (var i = 0; i < invArr.length; i++) grid.appendChild(slot(invArr, i, opts));
    return grid;
  }

  // =========================================================================
  // Status line, bars
  // =========================================================================
  var STATUS_COLOR = {
    working: 'green', idle: 'yellow',
    no_power: 'red', low_power: 'yellow', not_connected: 'red', no_fuel: 'red',
    output_full: 'yellow', no_ingredients: 'red', no_recipe: 'yellow', no_minable_resources: 'red',
    // no_ammo removed: only the turret status (35-combat.js, disabled) ever returned it.
    no_research: 'yellow', missing_science_packs: 'yellow',
    waiting_for_source: 'yellow', waiting_for_space: 'yellow', no_water: 'red', no_steam: 'yellow', no_pair: 'red',
  };
  function statusLine(statusKey) {
    var wrap = el('div', 'f-status');
    var dot = el('span', 'f-dot f-dot-' + (STATUS_COLOR[statusKey] || 'yellow'));
    wrap.appendChild(dot);
    wrap.appendChild(el('span', 'f-status-text', F.t('status.' + statusKey)));
    return wrap;
  }
  function bar(fraction, colorCls, labelText) {
    fraction = U.clamp(fraction || 0, 0, 1);
    var wrap = el('div', 'f-bar ' + (colorCls || ''));
    var fill = el('div', 'f-bar-fill');
    fill.style.width = (fraction * 100).toFixed(1) + '%';
    wrap.appendChild(fill);
    if (labelText != null) wrap.appendChild(el('span', 'f-bar-label', labelText));
    return wrap;
  }
  function sectionTitle(text) { return el('div', 'f-section-title', text); }

  // =========================================================================
  // Item / recipe tooltip HTML builders
  // =========================================================================
  function itemTooltipHtml(id) {
    var it = F.data.items[id];
    if (!it) return U.escapeHtml(id);
    var html = '<b style="color:#ffa500">' + U.escapeHtml(F.t('item.' + id)) + '</b>';
    var desc = F.t('item.' + id + '.desc');
    if (desc && desc !== 'item.' + id + '.desc') html += '<br>' + U.escapeHtml(desc);
    if (it.fuel > 0) html += '<br>' + U.escapeHtml(F.t('ui.fuel')) + ': ' + U.fmt(it.fuel, 1) + ' MJ';
    return html;
  }
  function rawMaterials(recipeId, mult, depth, seen, out) {
    if (depth > 5) return;
    var rdef = F.data.recipes[recipeId];
    if (!rdef) return;
    for (var i = 0; i < rdef.ingredients.length; i++) {
      var id = rdef.ingredients[i][0], amt = rdef.ingredients[i][1] * mult;
      var it = F.data.items[id];
      if (it && it.category === 'resource') {
        out[id] = (out[id] || 0) + amt;
      } else if (F.data.recipes[id] && !seen[id]) {
        seen[id] = true;
        rawMaterials(id, amt, depth + 1, seen, out);
        seen[id] = false;
      } else {
        out[id] = (out[id] || 0) + amt;
      }
    }
  }
  // recipeIconId(recipeId) -> the item id to use as the recipe's icon: its
  // first item result, or (design/EXPANSION.md §4: recipes with an empty
  // items-out list are allowed, e.g. basic-oil-processing) null when the
  // recipe only produces fluids — callers fall back to a fluid icon.
  function recipeIconId(rdef) {
    return (rdef.results && rdef.results.length) ? rdef.results[0][0] : null;
  }
  function recipeTooltipHtml(recipeId) {
    var rdef = F.data.recipes[recipeId];
    if (!rdef) return U.escapeHtml(recipeId);
    var itemResults = rdef.results || [];
    var fluidIngredients = rdef.fluidIngredients || [];
    var fluidResults = rdef.fluidResults || [];
    var resultId = recipeIconId(rdef);
    var fluidResultId = fluidResults.length ? fluidResults[0][0] : null;
    var titleText = resultId ? F.t('item.' + resultId) : (fluidResultId ? F.t('fluid.' + fluidResultId) : recipeId);
    var html = '<b style="color:#ffa500">' + U.escapeHtml(titleText) + '</b>';
    html += '<br><u>' + U.escapeHtml(F.t('ui.ingredients')) + ':</u>';
    for (var i = 0; i < rdef.ingredients.length; i++) {
      var id = rdef.ingredients[i][0], need = rdef.ingredients[i][1];
      var have = (F.player && typeof F.player.count === 'function') ? F.player.count(id) : 0;
      var color = have < need ? '#ff8e8e' : '#e0dcd3';
      html += '<br><span style="color:' + color + '">' + U.escapeHtml(F.t('item.' + id)) + ' x' + need + '</span>';
    }
    for (var fi = 0; fi < fluidIngredients.length; fi++) {
      html += '<br>' + fluidLineHtml(fluidIngredients[fi][0], fluidIngredients[fi][1]);
    }
    html += '<br>' + U.escapeHtml(F.t('ui.craftTime')) + ': ' + U.fmt(rdef.time, 2) + ' s';
    html += '<br><u>' + U.escapeHtml(F.t('ui.products')) + ':</u>';
    for (var j = 0; j < itemResults.length; j++) {
      html += '<br>' + U.escapeHtml(F.t('item.' + itemResults[j][0])) + ' x' + itemResults[j][1];
    }
    for (var fj = 0; fj < fluidResults.length; fj++) {
      html += '<br>' + fluidLineHtml(fluidResults[fj][0], fluidResults[fj][1]);
    }
    var raw = {}, seen = {};
    rawMaterials(recipeId, 1, 0, seen, raw);
    var rawIds = Object.keys(raw);
    if (rawIds.length) {
      html += '<br>' + U.escapeHtml(F.t('ui.totalRaw')) + ': ';
      html += rawIds.map(function (id) { return U.escapeHtml(F.t('item.' + id)) + ' x' + Math.ceil(raw[id]); }).join(', ');
    }
    return html;
  }

  // =========================================================================
  // registerWindow — wraps F.ui.registerWindow (or a local stash) and adds
  // self-driven "refresh on event" + "refresh every ~10 frames" behaviour on
  // top, so windows stay live regardless of how 70-ui.js schedules redraws.
  // =========================================================================
  var lastRoot = {}, lastPayload = {}, refreshGen = {};
  // While a mouse button is held inside the UI, windows must not be re-rendered: a re-render
  // replaces the pressed element, so the browser never fires "click" on release (crafting
  // tabs, recipe buttons and slots then randomly ignore normal-speed clicks).
  var uiPointerDown = false;
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function' && typeof window.addEventListener === 'function') {
    document.addEventListener('pointerdown', function (ev) {
      var t = ev && ev.target;
      if (t && typeof t.closest === 'function' && t.closest('#ui')) uiPointerDown = true;
    }, true);
    var releasePointer = function () { window.setTimeout(function () { uiPointerDown = false; }, 0); };
    window.addEventListener('pointerup', releasePointer, true);
    window.addEventListener('pointercancel', releasePointer, true);
    window.addEventListener('blur', releasePointer);
  }
  function schedulePoll(name, root, payload, renderFn) {
    var myGen = (refreshGen[name] = (refreshGen[name] || 0) + 1);
    var POLL_MS = Math.round(1000 / 60 * 10); // "every 10 frames" at 60 tps
    function tick() {
      if (refreshGen[name] !== myGen) return; // superseded by a newer open/refresh
      if (!root || !document.body || !document.body.contains(root)) return; // window closed/removed
      if (F.ui && typeof F.ui.isOpen === 'function') {
        try { if (!F.ui.isOpen(name)) return; } catch (err) { /* ignore, keep polling */ }
      }
      if (uiPointerDown) { window.setTimeout(tick, 50); return; } // retry right after release
      try { renderFn(root, payload); } catch (err) { F.log.error('ui-windows: refresh failed for', name, err); return; }
      hideOrphanTooltip();
      window.setTimeout(tick, POLL_MS);
    }
    window.setTimeout(tick, POLL_MS);
  }
  // `spec.poll` (default true) gates BOTH periodic refresh paths this module
  // and 70-ui.js can trigger: this module's own ~167ms self-poll timer, and
  // 70-ui.js's F.ui.update() loop, which calls the adapter's refresh(el,
  // payload) for every open window roughly every 3 frames (~20/s). A window
  // that holds live <input>/<textarea> elements a player types into (the
  // pause menu: seed, save-slot name, import textarea) must NOT be
  // unconditionally re-rendered on a timer — every re-render replaces those
  // DOM nodes and silently discards whatever the player was mid-typing.
  // Such windows pass `poll: false` and instead re-render themselves
  // on demand, from their own button handlers, via a direct call to the
  // render function (e.g. `renderMenu(root)` after a slot is saved/deleted
  // or the language toggles) — see renderMenu below.
  function registerWindow(name, spec) {
    var innerRender = spec.render;
    var livePoll = spec.poll !== false;
    spec.render = function (root, payload) {
      lastRoot[name] = root; lastPayload[name] = payload;
      innerRender(root, payload);
      if (livePoll) schedulePoll(name, root, payload, innerRender);
    };
    (spec.refreshOn || []).forEach(function (evt) {
      F.events.on(evt, function () {
        if (!livePoll || uiPointerDown) return; // the self-poll catches up after release
        var root = lastRoot[name], payload = lastPayload[name];
        if (!root || !document.body || !document.body.contains(root)) return;
        if (F.ui && typeof F.ui.isOpen === 'function') {
          try { if (!F.ui.isOpen(name)) return; } catch (err) { /* ignore */ }
        }
        try { innerRender(root, payload); } catch (err) { F.log.error('ui-windows: event refresh failed for', name, err); }
      });
    });
    F.ui = F.ui || {};
    if (typeof F.ui.registerWindow === 'function') {
      // Adapter: 70-ui.js expects { create(payload) -> element, refresh?(el, payload) }.
      F.ui.registerWindow(name, {
        create: function (payload) {
          var body = document.createElement('div');
          body.className = 'f-win-content f-win-' + name;
          var title = (typeof spec.title === 'function') ? spec.title(payload) : (spec.title || name);
          var frame = (typeof F.ui.windowFrame === 'function') ? F.ui.windowFrame(title, body) : body;
          spec.render(body, payload);
          frame._contentEl = body;
          return frame;
        },
        // No-op when !livePoll: 70-ui.js's F.ui.update() calls this every ~3
        // frames for every open window; a no-op here is what stops that
        // generic loop from clobbering live inputs (the self-poll timer
        // above is already skipped via the `livePoll` guard in spec.render).
        // Always a no-op: 70-ui.js would call this every ~3 frames and rebuild the whole window,
        // replacing slots faster than they can be refreshed. Live windows re-render on the
        // slower self-poll timer (schedulePoll) and on events instead.
        refresh: function () {},
        spec: spec,
      });
    } else {
      F.ui.windows = F.ui.windows || {};
      F.ui.windows[name] = spec;
      F.log.warn('ui-windows: F.ui.registerWindow missing, stored window spec at F.ui.windows.' + name);
    }
  }

  // =========================================================================
  // WINDOW: inventory  (80-slot grid + crafting tabs)
  // =========================================================================
  // Crafting tabs (design/EXPANSION.md §6.6): derived from
  // F.data.order.recipesByTab's own keys (so new tabs D-data introduces show
  // up automatically) in a fixed preferred order — logistics, production,
  // intermediate, combat, then any further keys in whatever order
  // Object.keys() gives them — and only kept when at least one HAND recipe
  // (crafting-grid craftable, design/EXPANSION.md §4) in that tab exists;
  // this hides genuinely empty tabs and, as before, the whole combat tab
  // when F.FEATURES.combat is off (its recipesByTab.combat list is empty in
  // that build — see src/disabled/README.md to re-enable it).
  function tabHasHandRecipe(tab) {
    var ids = (F.data.order.recipesByTab && F.data.order.recipesByTab[tab]) || [];
    for (var i = 0; i < ids.length; i++) { var r = F.data.recipes[ids[i]]; if (r && r.hand) return true; }
    return false;
  }
  function computeCraftTabs() {
    var preferred = ['logistics', 'production', 'intermediate', 'combat'];
    var keys = Object.keys((F.data.order && F.data.order.recipesByTab) || {});
    var ordered = preferred.filter(function (k) { return keys.indexOf(k) >= 0; });
    keys.forEach(function (k) { if (ordered.indexOf(k) < 0) ordered.push(k); });
    return ordered.filter(function (tab) {
      if (tab === 'combat' && !(F.FEATURES && F.FEATURES.combat)) return false;
      return tabHasHandRecipe(tab);
    });
  }
  var CRAFT_TABS = computeCraftTabs();
  var craftTabState = { current: CRAFT_TABS[0] || 'logistics' };

  function maxCraftable(recipeId) {
    if (!F.player || typeof F.player.canCraft !== 'function') return 1;
    if (!F.player.canCraft(recipeId, 1).ok) return 0;
    var hi = 1;
    while (hi < 512 && F.player.canCraft(recipeId, hi * 2).ok) hi *= 2;
    var lo = hi, top = Math.min(hi * 2, 512);
    while (lo < top) {
      var mid = Math.ceil((lo + top) / 2);
      if (F.player.canCraft(recipeId, mid).ok) lo = mid; else top = mid - 1;
    }
    return lo;
  }

  function recipeState(id) {
    var unlocked = true;
    if (F.research && typeof F.research.isRecipeUnlocked === 'function') unlocked = F.research.isRecipeUnlocked(id);
    if (!unlocked) return 'locked';
    var ok = true;
    if (F.player && typeof F.player.canCraft === 'function') ok = F.player.canCraft(id, 1).ok;
    return ok ? 'craftable' : 'missing';
  }

  function buildCraftingPanel(root) {
    var panel = el('div', 'f-craft-panel');
    var tabs = el('div', 'f-tabs');
    CRAFT_TABS.forEach(function (tab) {
      var b = el('div', 'f-tab' + (craftTabState.current === tab ? ' f-tab-active' : ''), F.t('cat.' + tab));
      b.addEventListener('click', function () { craftTabState.current = tab; renderInventory(root, lastPayload.inventory); });
      tabs.appendChild(b);
    });
    panel.appendChild(tabs);

    var list = el('div', 'f-recipe-list');
    // Only HAND recipes ever appear in the hand-crafting grid (design/EXPANSION.md
    // §4: a fluid-only recipe like basic-oil-processing sits in the
    // 'intermediate' tab's list too, but is machine-only).
    var ids = ((F.data.order.recipesByTab && F.data.order.recipesByTab[craftTabState.current]) || [])
      .filter(function (id) { var r = F.data.recipes[id]; return r && r.hand; });
    ids.forEach(function (id) {
      var state = recipeState(id);
      var rdef = F.data.recipes[id];
      var resultId = recipeIconId(rdef);
      var b = el('div', 'f-recipe f-recipe-' + state);
      b.appendChild(buildIcon(resultId, 34));
      b.appendChild(el('span', 'f-recipe-name', F.t('item.' + resultId)));
      attachTooltip(b, function () { return recipeTooltipHtml(id); });
      b.addEventListener('click', function (ev) {
        ev.preventDefault();
        if (!F.player || typeof F.player.enqueue !== 'function') return;
        if (ev.shiftKey) F.player.enqueue(id, Math.max(1, maxCraftable(id)));
        else F.player.enqueue(id, 1);
      });
      b.addEventListener('contextmenu', function (ev) {
        ev.preventDefault();
        if (F.player && typeof F.player.enqueue === 'function') F.player.enqueue(id, 5);
      });
      list.appendChild(b);
    });
    panel.appendChild(list);
    return panel;
  }

  function renderInventory(root, payload) {
    clear(root);
    var wrap = el('div', 'f-window-inventory');
    var left = el('div', 'f-panel f-panel-left');
    left.appendChild(sectionTitle(F.t('ui.inventory')));
    var playerInv = (F.state && F.state.player && F.state.player.inv) || [];
    left.appendChild(slotGrid(playerInv, 10, { target: 'player' }));
    wrap.appendChild(left);

    var right = el('div', 'f-panel f-panel-right');
    right.appendChild(sectionTitle(F.t('ui.crafting')));
    right.appendChild(buildCraftingPanel(root));
    wrap.appendChild(right);

    root.appendChild(wrap);
  }
  registerWindow('inventory', {
    title: function () { return F.t('ui.inventory'); },
    render: renderInventory,
    refreshOn: ['inventory:changed'],
  });

  // =========================================================================
  // WINDOW: entity  (dispatch on def.behaviour)
  // =========================================================================
  function resolveEntity(payload) {
    if (!payload) return null;
    if (payload.entity) return payload.entity;
    if (payload.id != null && F.entities && typeof F.entities.byId === 'function') return F.entities.byId(payload.id);
    if (payload.tx != null && payload.ty != null && F.world && typeof F.world.entityAt === 'function') return F.world.entityAt(payload.tx, payload.ty);
    return null;
  }
  function safeStatus(e) {
    if (F.machines && typeof F.machines.status === 'function') { try { return F.machines.status(e); } catch (err) { /* fallthrough */ } }
    if (F.entities && typeof F.entities.canAcceptItem === 'function' && e._status) return e._status;
    return e._status || 'idle';
  }
  function invByName(e, name) {
    var groups = (F.entities && typeof F.entities.inventories === 'function') ? F.entities.inventories(e) : [];
    for (var i = 0; i < groups.length; i++) if (groups[i].name === name) return groups[i].inv;
    return null;
  }

  function renderGenericHeader(root, e, def) {
    var head = el('div', 'f-entity-head');
    head.appendChild(buildIcon(def.minable || e.type, 40));
    head.appendChild(el('span', 'f-entity-name', F.t('ent.' + e.type)));
    root.appendChild(head);
    root.appendChild(statusLine(safeStatus(e)));
  }

  function ENTITY_FURNACE(root, e, def) {
    renderGenericHeader(root, e, def);
    var row = el('div', 'f-row-slots');
    var fuel = invByName(e, 'fuel'); if (fuel) { row.appendChild(labeled(F.t('ui.fuel'), slotGrid(fuel, 1, { target: e }))); }
    var input = invByName(e, 'input'); if (input) row.appendChild(labeled(F.t('ui.input'), slotGrid(input, 1, { target: e })));
    var mid = el('div', 'f-progress-col');
    mid.appendChild(bar(e.progress || 0, 'f-bar-orange'));
    var t = F.machines && typeof F.machines.craftTime === 'function' ? F.machines.craftTime(e) : 0;
    if (t) mid.appendChild(el('div', 'f-hint', U.fmt(t, 1) + ' s'));
    row.appendChild(mid);
    var output = invByName(e, 'output'); if (output) row.appendChild(labeled(F.t('ui.output'), slotGrid(output, 1, { target: e })));
    root.appendChild(row);
    if (def.energy && def.energy.type === 'electric') addRow(root, F.t('ui.energyConsumption'), U.fmtPower(def.energy.usage));
  }

  // Recipe ids offered by an assembler's picker (design/EXPANSION.md §6.6):
  // F.machines.recipesFor(e) when that API exists (it already returns only
  // unlocked recipes valid for this specific machine — e.g. respecting
  // def.assembler.categories / def.crafter.categories for the new oil/chemistry
  // machines); otherwise fall back to this module's pre-existing behaviour
  // (crafting + advanced categories, unlocked, in CRAFT_TABS order).
  function machineRecipeIds(e, def) {
    if (F.machines && typeof F.machines.recipesFor === 'function') {
      try { var r = F.machines.recipesFor(e); if (r) return r; } catch (err) { F.log.warn('ui-windows: F.machines.recipesFor failed', err); }
    }
    var cats = (def.assembler && def.assembler.categories) || ['crafting', 'advanced'];
    var ids = [], seen = {};
    CRAFT_TABS.concat(['intermediate']).forEach(function (tab) {
      (F.data.order.recipesByTab[tab] || []).forEach(function (id) {
        if (seen[id]) return;
        var rdef = F.data.recipes[id];
        if (!rdef || cats.indexOf(rdef.category) < 0) return;
        if (F.research && typeof F.research.isRecipeUnlocked === 'function' && !F.research.isRecipeUnlocked(id)) return;
        seen[id] = true;
        ids.push(id);
      });
    });
    return ids;
  }

  function ENTITY_ASSEMBLER(root, e, def) {
    renderGenericHeader(root, e, def);
    if (!e.recipe) {
      root.appendChild(sectionTitle(F.t('ui.chooseRecipe')));
      var picker = el('div', 'f-recipe-picker');
      var byTab = {};
      machineRecipeIds(e, def).forEach(function (id) {
        var rdef = F.data.recipes[id];
        var tab = (rdef && rdef.tab) || 'intermediate';
        (byTab[tab] = byTab[tab] || []).push(id);
      });
      var tabOrder = CRAFT_TABS.concat(['intermediate']).filter(function (t, i, a) { return a.indexOf(t) === i; });
      Object.keys(byTab).forEach(function (t) { if (tabOrder.indexOf(t) < 0) tabOrder.push(t); });
      var onPick = function (id) {
        if (F.api && typeof F.api.setRecipe === 'function') F.api.setRecipe(e, id);
        else if (F.machines && typeof F.machines.setRecipe === 'function') F.machines.setRecipe(e, id);
      };
      tabOrder.forEach(function (tab) {
        var ids = byTab[tab];
        if (!ids || !ids.length) return;
        picker.appendChild(el('div', 'f-tab-label', F.t('cat.' + tab)));
        picker.appendChild(hRecipePicker(e, ids, e.recipe, onPick));
      });
      root.appendChild(picker);
      return;
    }
    var curDef = F.data.recipes[e.recipe];
    var curIconId = curDef ? recipeIconId(curDef) : null;
    var curFluidId = (curDef && curDef.fluidResults && curDef.fluidResults.length) ? curDef.fluidResults[0][0] : null;
    var curName = curIconId ? F.t('item.' + curIconId) : (curFluidId ? F.t('fluid.' + curFluidId) : e.recipe);
    var head2 = el('div', 'f-recipe-current');
    head2.appendChild(curIconId ? buildIcon(curIconId, 32) : buildFluidIcon(curFluidId, 32));
    head2.appendChild(el('span', null, curName));
    var change = button('↺', 'f-btn-small', function () {
      if (F.api && typeof F.api.setRecipe === 'function') F.api.setRecipe(e, null);
      else if (F.machines && typeof F.machines.setRecipe === 'function') F.machines.setRecipe(e, null);
    });
    head2.appendChild(change);
    root.appendChild(head2);

    var row = el('div', 'f-row-slots');
    var input = invByName(e, 'input'); if (input) row.appendChild(labeled(F.t('ui.input'), slotGrid(input, Math.min(input.length, 3), { target: e })));
    var mid = el('div', 'f-progress-col');
    mid.appendChild(bar(e.progress || 0, 'f-bar-orange'));
    row.appendChild(mid);
    var output = invByName(e, 'output'); if (output) row.appendChild(labeled(F.t('ui.output'), slotGrid(output, 1, { target: e })));
    root.appendChild(row);
    var speedVal = (def.assembler && def.assembler.speed) || def.speed || 1;
    addRow(root, F.t('ui.craftingSpeed'), U.fmt(speedVal, 2));
    if (def.energy && def.energy.type === 'electric') addRow(root, F.t('ui.energyConsumption'), U.fmtPower(def.energy.usage));
  }

  function ENTITY_CHEST(root, e, def) {
    renderGenericHeader(root, e, def);
    var main = invByName(e, 'main') || e.inv || [];
    var cols = main.length >= 40 ? 8 : main.length >= 32 ? 8 : 8;
    root.appendChild(slotGrid(main, cols, { target: e }));
  }

  function ENTITY_LAB(root, e, def) {
    renderGenericHeader(root, e, def);
    var packs = invByName(e, 'packs') || e.packs || [];
    root.appendChild(labeled(F.t('ui.ingredients'), slotGrid(packs, packs.length, { target: e })));
    var researchName = (F.state && F.state.research && F.state.research.current) ?
      F.t('tech.' + F.state.research.current) : F.t('ui.research.none');
    addRow(root, F.t('ui.research.current'), researchName);
    var frac = F.research && typeof F.research.progress === 'function' ? F.research.progress() : 0;
    root.appendChild(bar(frac, 'f-bar-blue', (frac * 100).toFixed(0) + '%'));
  }

  function ENTITY_DRILL(root, e, def) {
    renderGenericHeader(root, e, def);
    var area = (def.drill && def.drill.area) || 2;
    addRow(root, F.t('ui.expectedResources'), '~ (' + area + '×' + area + ')');
    root.appendChild(bar(e.progress || 0, 'f-bar-orange'));
    var fuel = invByName(e, 'fuel');
    if (fuel) root.appendChild(labeled(F.t('ui.fuel'), slotGrid(fuel, 1, { target: e })));
    else if (def.energy && def.energy.type === 'electric') addRow(root, F.t('ui.energyConsumption'), U.fmtPower(def.energy.usage));
  }

  // ENTITY_TURRET (ammo slots + range/kills) removed: no entity has
  // behaviour 'turret' any more — F.FEATURES.combat is off, see
  // src/disabled/README.md. The dispatch table below no longer maps to it.

  function ENTITY_BOILER(root, e, def) {
    renderGenericHeader(root, e, def);
    var fuel = invByName(e, 'fuel') || e.fuel;
    if (fuel) root.appendChild(labeled(F.t('ui.fuel'), slotGrid(fuel, 1, { target: e })));
    var water = e.water || {}, steam = e.steam || {};
    var waterInfo = (F.fluids && typeof F.fluids.segmentInfo === 'function') ? F.fluids.segmentInfo(e) : null;
    var wAmt = (water.amount != null) ? water.amount : (waterInfo ? waterInfo.amount : 0);
    var wCap = water.cap || (waterInfo ? waterInfo.capacity : 200) || 200;
    var sAmt = steam.amount || 0, sCap = steam.cap || 200;
    root.appendChild(labeledBar(F.t('ui.water'), wAmt / wCap, 'f-bar-blue', U.fmt(wAmt, 0) + '/' + U.fmt(wCap, 0)));
    root.appendChild(labeledBar(F.t('ui.steam'), sAmt / sCap, 'f-bar-grey', U.fmt(sAmt, 0) + '/' + U.fmt(sCap, 0)));
    if (def.boiler) addRow(root, F.t('ui.energyConsumption'), U.fmtPower(def.boiler.fuelPower));
  }

  function ENTITY_ENGINE(root, e, def) {
    renderGenericHeader(root, e, def);
    var maxKW = (def.engine && def.engine.power) || 900;
    var out = e.output || 0;
    root.appendChild(labeledBar(F.t('ui.powerOutput'), out / maxKW, 'f-bar-orange', U.fmtPower(out) + ' / ' + U.fmtPower(maxKW)));
    var steam = e.steam || {};
    var sCap = steam.cap || 200, sAmt = steam.amount || 0;
    root.appendChild(labeledBar(F.t('ui.steam'), sAmt / sCap, 'f-bar-grey', U.fmt(sAmt, 0) + '/' + U.fmt(sCap, 0)));
    if (def.engine) addRow(root, F.t('ui.steamConsumption'), U.fmt(def.engine.steamRate, 0) + F.t('ui.perSecond'));
  }

  function ENTITY_OFFSHORE(root, e, def) {
    renderGenericHeader(root, e, def);
    var info = (F.fluids && typeof F.fluids.segmentInfo === 'function') ? F.fluids.segmentInfo(e) : null;
    var amt = info ? info.amount : ((e.fb && e.fb.amount) || 0);
    var cap = info ? info.capacity : ((e.fb && e.fb.cap) || 100);
    root.appendChild(labeledBar(F.t('ui.water'), cap ? amt / cap : 0, 'f-bar-blue', U.fmt(amt, 0) + '/' + U.fmt(cap, 0)));
    if (def.offshore_pump) addRow(root, F.t('ui.pumpingSpeed'), U.fmt(def.offshore_pump.rate, 0) + F.t('ui.perSecond'));
  }

  function ENTITY_POLE(root, e, def) {
    renderGenericHeader(root, e, def);
    var info = (F.power && typeof F.power.netInfo === 'function') ? F.power.netInfo(e) : null;
    if (!info || !info.id) { addRow(root, F.t('ui.satisfaction'), F.t('ui.notConnected')); return; }
    root.appendChild(labeledBar(F.t('ui.satisfaction'), info.satisfaction || 0, 'f-bar-green', ((info.satisfaction || 0) * 100).toFixed(0) + '%'));
    addRow(root, F.t('ui.production'), U.fmtPower(info.capacity || 0));
    addRow(root, F.t('ui.consumption'), U.fmtPower(info.demand || 0));
    root.appendChild(sectionTitle(F.t('ui.producers')));
    (info.producers || []).forEach(function (p) { addRow(root, F.t('ent.' + p.type) + ' x' + p.count, U.fmtPower(p.kW)); });
    root.appendChild(sectionTitle(F.t('ui.consumers')));
    (info.consumers || []).forEach(function (c) { addRow(root, F.t('ent.' + c.type) + ' x' + c.count, U.fmtPower(c.kW)); });
  }

  function ENTITY_INSERTER(root, e, def) {
    renderGenericHeader(root, e, def);
    var fuel = invByName(e, 'fuel');
    if (fuel) root.appendChild(labeled(F.t('ui.fuel'), slotGrid(fuel, 1, { target: e })));
    if (def.inserter && def.inserter.filter && Array.isArray(e.filter)) {
      root.appendChild(sectionTitle(F.t('ui.filter')));
      var grid = el('div', 'f-filter-grid');
      e.filter.forEach(function (fid, idx) {
        var cell = buildIcon(fid, 32);
        cell.classList.add('f-filter-cell');
        cell.title = fid ? F.t('item.' + fid) : F.t('ui.noFilter');
        cell.addEventListener('click', function () {
          var cur = e.filter[idx];
          var pool = F.data.order.items.filter(function (id) { var it = F.data.items[id]; return it && it.category !== 'resource'; });
          var i2 = cur ? pool.indexOf(cur) : -1;
          e.filter[idx] = pool[(i2 + 1) % pool.length] || null;
        });
        cell.addEventListener('contextmenu', function (ev) { ev.preventDefault(); e.filter[idx] = null; });
        grid.appendChild(cell);
      });
      root.appendChild(grid);
    }
  }

  function ENTITY_SPLITTER(root, e, def) {
    renderGenericHeader(root, e, def);
    root.appendChild(sectionTitle(F.t('ui.filter')));
    var filterCell = buildIcon(e.filter, 32);
    filterCell.title = e.filter ? F.t('item.' + e.filter) : F.t('ui.noFilter');
    filterCell.addEventListener('click', function () {
      var pool = F.data.order.items.filter(function (id) { var it = F.data.items[id]; return it && it.category !== 'resource'; });
      var i = e.filter ? pool.indexOf(e.filter) : -1;
      e.filter = (i + 1 < pool.length) ? pool[i + 1] : null;
      if (F.belts && typeof F.belts.markDirty === 'function') F.belts.markDirty(e.x, e.y);
    });
    filterCell.addEventListener('contextmenu', function (ev) {
      ev.preventDefault(); e.filter = null;
      if (F.belts && typeof F.belts.markDirty === 'function') F.belts.markDirty(e.x, e.y);
    });
    root.appendChild(filterCell);
    function prioRow(label, key) {
      var names = { '-1': F.t('ui.priorityLeft'), '0': F.t('ui.priorityNone'), '1': F.t('ui.priorityRight') };
      var r = addRow(root, label, names[String(e[key] || 0)]);
      r.classList.add('f-clickable');
      r.addEventListener('click', function () {
        e[key] = ((e[key] || 0) + 2) % 3 - 1;
        if (F.belts && typeof F.belts.markDirty === 'function') F.belts.markDirty(e.x, e.y);
        renderEntity(root, lastPayload.entity);
      });
    }
    prioRow(F.t('ui.inPriority'), 'inPrio');
    prioRow(F.t('ui.outPriority'), 'outPrio');
  }

  function ENTITY_ACCUMULATOR(root, e, def) {
    renderGenericHeader(root, e, def);
    var cap = (def.accumulator && def.accumulator.capacity) || 5000;
    var charge = (typeof e.charge === 'number') ? e.charge : 0;
    root.appendChild(labeledBar(F.t('ui.charge'), cap ? charge / cap : 0, 'f-bar-blue', U.fmt(charge / 1000, 1) + '/' + U.fmt(cap / 1000, 1) + ' MJ'));
  }

  function ENTITY_SOLAR(root, e, def) {
    renderGenericHeader(root, e, def);
    var peak = (def.solar && def.solar.peak) || 60;
    var daylight = (F.power && typeof F.power.daylight === 'function') ? F.power.daylight() : 1;
    addRow(root, F.t('ui.daylight'), (daylight * 100).toFixed(0) + '%');
    addRow(root, F.t('ui.powerOutput'), U.fmtPower(peak * daylight));
  }

  function ENTITY_CORPSE(root, e, def) {
    renderGenericHeader(root, e, def);
    var main = invByName(e, 'main') || e.inv || [];
    root.appendChild(slotGrid(main, 10, { target: e }));
  }

  var ENTITY_RENDERERS = {
    furnace: ENTITY_FURNACE, assembler: ENTITY_ASSEMBLER, chest: ENTITY_CHEST, lab: ENTITY_LAB,
    drill: ENTITY_DRILL, boiler: ENTITY_BOILER, engine: ENTITY_ENGINE,
    offshore_pump: ENTITY_OFFSHORE, pole: ENTITY_POLE, inserter: ENTITY_INSERTER, splitter: ENTITY_SPLITTER,
    accumulator: ENTITY_ACCUMULATOR, solar: ENTITY_SOLAR, corpse: ENTITY_CORPSE,
  };

  function labeled(labelText, contentEl) {
    var wrap = el('div', 'f-labeled');
    wrap.appendChild(el('div', 'f-labeled-title', labelText));
    wrap.appendChild(contentEl);
    return wrap;
  }
  function labeledBar(labelText, frac, cls, valueText) {
    var wrap = el('div', 'f-labeled f-labeled-bar');
    wrap.appendChild(el('div', 'f-labeled-title', labelText));
    wrap.appendChild(bar(frac, cls, valueText));
    return wrap;
  }

  // =========================================================================
  // F.ui.registerEntityGUI() support (design/EXPANSION.md §6.6). The registry
  // itself (F._entityGUIs, behaviour -> fn(root,e,def,h)) is created/owned by
  // 70-ui.js (which loads just before this file) so early feature modules
  // (37/38/39/45-*.js, which load BEFORE 70-ui.js) can register directly onto
  // it without needing F.ui to exist yet; see that file's header comment and
  // the snippet appended to EXPANSION.md §6.6. A registered GUI always wins
  // over the built-in ENTITY_RENDERERS table below.
  //
  // buildEntityGuiHelpers(root, e, def) -> h — the helper object handed to a
  // registered GUI fn. Thin wrappers around this module's own DOM builders so
  // custom GUIs look and behave exactly like the built-in ones (same slot
  // widget, same tooltip/status/bar look, same recipe-picker semantics).
  // =========================================================================
  function hBar(value01, color, text) {
    // `color` is a real colour (hex/rgb/var(...)), not one of bar()'s fixed
    // f-bar-* classes — lets custom GUIs tint by fluid colour, status colour,
    // etc. Falls back to treating it as a class name for anything that
    // doesn't look like a colour literal, so passing 'f-bar-blue' etc. still
    // works exactly like the internal bar() helper.
    var literal = color && (color[0] === '#' || color.indexOf('rgb') === 0 || color.indexOf('var(') === 0);
    var wrap = bar(value01, literal ? null : color, text);
    if (literal) {
      var fill = wrap.querySelector('.f-bar-fill');
      if (fill) fill.style.background = color;
    }
    return wrap;
  }
  function hFluidBar(box, label) {
    box = box || { fluid: null, amount: 0, cap: 0 };
    var fluidId = box.fluid || null;
    var color = fluidId ? fluidColorSafe(fluidId) : '#4a4a4a';
    var name = label != null ? label : (fluidId ? F.t('fluid.' + fluidId) : F.t('ui.fluidEmpty'));
    var cap = box.cap || 0, amt = box.amount || 0;
    var text = U.fmt(amt, 0) + (cap ? '/' + U.fmt(cap, 0) : '');
    return labeled(name, hBar(cap ? amt / cap : 0, color, text));
  }
  // Grid of recipe buttons (icon of the first item result, or a fluid icon
  // when the recipe has no item result — design/EXPANSION.md §4 fluid-only
  // recipes) with a full ingredients/results/time tooltip; onPick(id) fires
  // on click. `e` (the entity) is accepted for signature parity with the
  // documented API but not required by this implementation.
  function hRecipePicker(e, recipeIds, currentId, onPick) {
    var grid = el('div', 'f-recipe-grid');
    (recipeIds || []).forEach(function (id) {
      var rdef = F.data.recipes[id];
      if (!rdef) return;
      var iconId = recipeIconId(rdef);
      var cell;
      if (iconId) {
        cell = buildIcon(iconId, 34);
      } else {
        var fluidResults = rdef.fluidResults || [];
        cell = buildFluidIcon(fluidResults.length ? fluidResults[0][0] : null, 34);
      }
      cell.classList.add('f-recipe-cell');
      if (id === currentId) cell.classList.add('f-recipe-cell-active');
      cell.style.pointerEvents = 'auto'; // .f-icon is pointer-events:none by default (70-ui.js)
      cell.style.cursor = 'pointer';
      attachTooltip(cell, function () { return recipeTooltipHtml(id); });
      cell.addEventListener('click', function () { if (typeof onPick === 'function') onPick(id); });
      grid.appendChild(cell);
    });
    return grid;
  }
  function hRow() {
    var wrap = el('div', 'f-h-row');
    for (var i = 0; i < arguments.length; i++) if (arguments[i]) wrap.appendChild(arguments[i]);
    return wrap;
  }
  function buildEntityGuiHelpers(root, e, def) {
    return {
      header: renderGenericHeader,
      slotGrid: function (inv, opts) {
        opts = opts || {};
        return slotGrid(inv, opts.cols || (inv && inv.length) || 1, opts);
      },
      labeled: labeled,
      bar: hBar,
      fluidBar: hFluidBar,
      recipePicker: hRecipePicker,
      button: function (text, onClick) { return button(text, null, onClick); },
      row: hRow,
      el: el,
      refresh: function () { renderEntity(root, lastPayload.entity); },
    };
  }

  function renderEntity(root, payload) {
    clear(root);
    var e = resolveEntity(payload);
    if (!e) { root.appendChild(el('div', 'f-hint', '—')); return; }
    var def = null;
    try { def = F.data.entityDef(e.type); } catch (err) { F.log.warn('ui-windows: unknown entity type', e.type); }
    if (!def) { root.appendChild(el('div', 'f-hint', e.type)); return; }
    var customFn = F._entityGUIs && F._entityGUIs[def.behaviour];
    if (customFn) {
      var h = buildEntityGuiHelpers(root, e, def);
      try { customFn(root, e, def, h); } catch (err) { F.log.error('ui-windows: custom entity GUI failed for', e.type, err); }
      return;
    }
    var fn = ENTITY_RENDERERS[def.behaviour];
    if (!fn) { renderGenericHeader(root, e, def); return; }
    try { fn(root, e, def); } catch (err) { F.log.error('ui-windows: entity GUI failed for', e.type, err); }
  }
  registerWindow('entity', {
    title: function (payload) { var e = resolveEntity(payload); return e ? F.t('ent.' + e.type) : ''; },
    render: renderEntity,
    refreshOn: ['entity:changed', 'inventory:changed'],
  });

  // =========================================================================
  // WINDOW: tech — the technology tree lives in its own module, 72-ui-techtree.js
  // (a pannable/zoomable prerequisite graph with a detail panel). It reuses
  // recipeTooltipHtml via F.ui.recipeTooltipHtml, exported here.
  // =========================================================================
  F.ui.recipeTooltipHtml = recipeTooltipHtml;

  // =========================================================================
  // WINDOW: help  ("Navodila")
  // =========================================================================
  // F.ui.addHelpTab(id) (design/EXPANSION.md §6.6): feature modules
  // (37/38/39/45-*.js) load BEFORE this file, so they cannot call
  // F.ui.addHelpTab() at their own load time — they push the tab id onto
  // F._helpTabs directly instead (merge-safe: `F._helpTabs = F._helpTabs ||
  // []`), and any ids already queued there are folded into HELP_TABS here.
  // F.ui.addHelpTab itself (below) is sugar for the same push, for anything
  // that registers after this file has run.
  var HELP_TABS = ['controls', 'basics', 'progression', 'ratios', 'tips', 'entities'];
  (F._helpTabs || []).forEach(function (id) { if (HELP_TABS.indexOf(id) < 0) HELP_TABS.push(id); });
  F.ui.addHelpTab = function (id) {
    if (!id) return;
    F._helpTabs = F._helpTabs || [];
    if (F._helpTabs.indexOf(id) < 0) F._helpTabs.push(id);
    if (HELP_TABS.indexOf(id) < 0) HELP_TABS.push(id);
  };
  var helpTabState = { current: 'controls' };
  function readShowHelpOnStart() {
    try { return window.localStorage.getItem('factio.hideHelpOnStart') !== '1'; } catch (err) { return true; }
  }
  function writeShowHelpOnStart(show) {
    try { window.localStorage.setItem('factio.hideHelpOnStart', show ? '0' : '1'); } catch (err) { /* storage blocked */ }
  }
  function renderHelp(root) {
    clear(root);

    // Language toggle removed: this build is English-only (F.i18n only
    // has an 'en' table — see src/disabled/README.md to re-enable Slovenian).

    var tabs = el('div', 'f-tabs');
    HELP_TABS.forEach(function (t) {
      var b = el('div', 'f-tab' + (helpTabState.current === t ? ' f-tab-active' : ''), F.t('ui.tab.' + t));
      b.addEventListener('click', function () { helpTabState.current = t; renderHelp(root); });
      tabs.appendChild(b);
    });
    root.appendChild(tabs);

    var body = el('div', 'f-help-body f-scroll-box');
    var text = F.t('help.' + helpTabState.current);
    text.split('\n').forEach(function (line) { body.appendChild(el('div', 'f-help-line', line)); });
    root.appendChild(body);

    var chkRow = el('label', 'f-row f-checkbox-row');
    var chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.checked = readShowHelpOnStart();
    chk.addEventListener('change', function () { writeShowHelpOnStart(chk.checked); });
    chkRow.appendChild(chk);
    chkRow.appendChild(document.createTextNode(' ' + F.t('ui.showHelpOnStart')));
    root.appendChild(chkRow);
  }
  registerWindow('help', {
    title: function () { return F.t('ui.instructions'); },
    render: renderHelp,
    refreshOn: [],
  });

  // =========================================================================
  // WINDOW: map  (large map, click to close)
  // =========================================================================
  function getMapCanvas(size) {
    if (F.render && typeof F.render.mapImage === 'function') {
      try { var c = F.render.mapImage(size); if (c) return c; } catch (err) { /* fall through */ }
    }
    if (F.render && typeof F.render.minimap === 'function') {
      try { return F.render.minimap(size); } catch (err) { return null; }
    }
    return null;
  }
  function renderMap(root) {
    clear(root);
    var wrap = el('div', 'f-map-wrap');
    var size = Math.min((window.innerWidth || 900) - 80, (window.innerHeight || 700) - 120, 720);
    var canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    canvas.className = 'f-map-canvas';
    var src = getMapCanvas(size);
    var ctx = canvas.getContext('2d');
    if (src) {
      ctx.drawImage(src, 0, 0, size, size);
    } else {
      ctx.fillStyle = '#1b1b1b'; ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = '#5a5a5a'; ctx.font = '14px sans-serif'; ctx.fillText('—', size / 2, size / 2);
    }
    // player marker at centre (F.render.mapImage/minimap are documented to centre on the player)
    ctx.fillStyle = '#DE8021';
    ctx.beginPath(); ctx.arc(size / 2, size / 2, 4, 0, Math.PI * 2); ctx.fill();
    wrap.appendChild(canvas);
    wrap.addEventListener('click', function () {
      if (F.ui && typeof F.ui.close === 'function') F.ui.close('map');
    });
    root.appendChild(wrap);
  }
  registerWindow('map', {
    title: function () { return F.t('ui.map'); },
    render: renderMap,
    refreshOn: [],
  });

  // =========================================================================
  // WINDOW: menu  (Esc pause menu)
  // =========================================================================
  function startNewGame(seed) {
    if (F.game && typeof F.game.newGameWithSeed === 'function') { F.game.newGameWithSeed(seed); return; }
    if (typeof F.newGame === 'function') { F.newGame({ seed: seed }); return; }
    F.log.warn('ui-windows: no newGame API available');
  }
  // Deletes a save slot directly via localStorage (mirrors the key scheme
  // F.game.saveToSlot/listSlots use, 'factio.slot.<name>' — see 80-game.js)
  // rather than adding a new F.game API: 80-game.js is a simulation module
  // this task must not modify beyond the research-warning fix.
  function deleteSlot(name) {
    try { window.localStorage.removeItem('factio.slot.' + name); return true; }
    catch (err) { F.log.warn('ui-windows: deleteSlot failed', err); return false; }
  }

  // Each section is its own wrapped block (`.f-menu-section`) purely so
  // style.css can lay the pause menu out as a normal centred ~520px window
  // with visually separated sections instead of one flat stack of rows.
  function menuSection(root, titleText) {
    var box = el('div', 'f-menu-section');
    if (titleText) box.appendChild(sectionTitle(titleText));
    root.appendChild(box);
    return box;
  }

  function renderMenu(root) {
    clear(root);

    var top = el('div', 'f-menu-section');
    top.appendChild(button(F.t('ui.continue'), 'f-btn-wide', function () {
      if (F.ui && typeof F.ui.close === 'function') F.ui.close('menu');
    }));
    root.appendChild(top);

    // -- new game --------------------------------------------------------
    var newGameBox = menuSection(root, F.t('ui.newGame'));
    var seedRow = el('div', 'f-row');
    seedRow.appendChild(el('span', 'f-row-label', F.t('ui.seed')));
    var seedInput = document.createElement('input');
    seedInput.type = 'number';
    seedInput.value = String(Math.floor(Math.random() * 1e9));
    seedInput.className = 'f-input';
    seedRow.appendChild(seedInput);
    newGameBox.appendChild(seedRow);
    newGameBox.appendChild(button(F.t('ui.start'), 'f-btn-wide', function () {
      var seed = parseInt(seedInput.value, 10) || 1;
      var proceed = true;
      if (F.ui && typeof F.ui.confirm === 'function' && F.state) {
        try { F.ui.confirm(F.t('ui.confirmNewGame')).then(function (ok) { if (ok) startNewGame(seed); }); proceed = false; } catch (err) { proceed = true; }
      }
      if (proceed) { if (!F.state || window.confirm(F.t('ui.confirmNewGame'))) startNewGame(seed); }
    }));

    // -- save / load slots -------------------------------------------------
    var slotsBox = menuSection(root, F.t('ui.saveSlots'));
    var slotList = el('div', 'f-slot-list');
    var slots = [];
    if (F.game && typeof F.game.listSlots === 'function') { try { slots = F.game.listSlots() || []; } catch (err) { slots = []; } }
    if (!slots.length) slotList.appendChild(el('div', 'f-hint', F.t('ui.noSlots')));
    slots.forEach(function (s) {
      var name = (typeof s === 'string') ? s : (s && s.name) || '?';
      var row = el('div', 'f-row');
      row.appendChild(el('span', 'f-row-label', name));
      var btnGroup = el('span', 'f-row-btns');
      btnGroup.appendChild(button(F.t('ui.load'), 'f-btn-small', function () { if (F.game) F.game.loadFromSlot(name); }));
      btnGroup.appendChild(button(F.t('ui.delete'), 'f-btn-small f-btn-danger', function () { deleteSlot(name); renderMenu(root); }));
      row.appendChild(btnGroup);
      slotList.appendChild(row);
    });
    slotsBox.appendChild(slotList);
    var newSlotRow = el('div', 'f-row');
    var slotNameInput = document.createElement('input');
    slotNameInput.type = 'text';
    slotNameInput.placeholder = F.t('ui.slotName');
    slotNameInput.className = 'f-input';
    newSlotRow.appendChild(slotNameInput);
    newSlotRow.appendChild(button(F.t('ui.save'), 'f-btn-small', function () {
      var name = slotNameInput.value || ('slot-' + Date.now());
      if (F.game && typeof F.game.saveToSlot === 'function') {
        try { F.game.saveToSlot(name); renderMenu(root); } catch (err) { F.log.warn(F.t('ui.saveFailed'), err); }
      }
    }));
    slotsBox.appendChild(newSlotRow);

    // -- export / import -----------------------------------------------------
    var exportBox = menuSection(root, F.t('ui.export'));
    exportBox.appendChild(el('div', 'f-hint', F.t('ui.exportHint')));
    var exportArea = document.createElement('textarea');
    exportArea.className = 'f-textarea';
    exportArea.readOnly = true;
    if (F.game && typeof F.game.exportString === 'function') { try { exportArea.value = F.game.exportString(); } catch (err) { exportArea.value = ''; } }
    exportBox.appendChild(exportArea);
    exportBox.appendChild(button(F.t('ui.copy'), 'f-btn-small', function () {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(exportArea.value);
        else { exportArea.select(); document.execCommand('copy'); }
      } catch (err) { exportArea.select(); }
    }));

    var importBox = menuSection(root, F.t('ui.import'));
    importBox.appendChild(el('div', 'f-hint', F.t('ui.importHint')));
    var importArea = document.createElement('textarea');
    importArea.className = 'f-textarea';
    importBox.appendChild(importArea);
    importBox.appendChild(button(F.t('ui.load'), 'f-btn-small', function () {
      if (F.game && typeof F.game.importString === 'function') {
        var ok = false;
        try { ok = F.game.importString(importArea.value); } catch (err) { ok = false; }
        if (!ok) F.log.warn(F.t('ui.invalidSave'));
      }
    }));

    // -- settings -------------------------------------------------------------
    // Language row removed: this build is English-only (F.i18n only has an
    // 'en' table — see src/disabled/README.md to re-enable Slovenian).
    var settingsBox = menuSection(root, F.t('ui.settings'));

    // -- controls summary (scrollable so it doesn't force the whole window
    // to grow past a sane height; see the module's final report) ----------
    var controlsSummaryBox = menuSection(root, F.t('ui.controlsSummary'));
    var controlsBox = el('div', 'f-help-body f-scroll-box');
    F.t('help.controls').split('\n').forEach(function (line) { controlsBox.appendChild(el('div', 'f-help-line', line)); });
    controlsSummaryBox.appendChild(controlsBox);
  }
  registerWindow('menu', {
    title: function () { return F.t('ui.menu'); },
    render: renderMenu,
    refreshOn: [],
    // See the big comment on `registerWindow` above: this window owns live
    // <input>/<textarea> elements that must survive a periodic re-render.
    poll: false,
  });

  // =========================================================================
  // WINDOW: death  (overlay, countdown, respawn)
  // =========================================================================
  function renderDeath(root) {
    clear(root);
    var wrap = el('div', 'f-death');
    wrap.appendChild(el('div', 'f-death-title', F.t('ui.died')));
    var secs = (F.state && F.state.player) ? Math.max(0, Math.ceil((F.state.player.respawnIn || 0))) : 0;
    wrap.appendChild(el('div', 'f-death-timer', F.t('ui.respawnIn', { 0: secs })));
    root.appendChild(wrap);
    if (secs <= 0 && F.player && typeof F.player.respawn === 'function') {
      try { F.player.respawn(); } catch (err) { /* ignore, will retry on next refresh */ }
      if (F.ui && typeof F.ui.close === 'function') F.ui.close('death');
    }
  }
  registerWindow('death', {
    title: function () { return F.t('ui.died'); },
    render: renderDeath,
    refreshOn: [],
  });
})();
