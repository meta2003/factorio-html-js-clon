// 70-ui.js — DOM UI framework: windows, slots, tooltips, HUD, quickbar, alerts,
// minimap chrome, cursor stack. See design/ARCHITECTURE.md §17, GDD.md §9.
// Defines: F.ui (init/update/open/close/closeAll/isOpen/registerWindow/windows,
// toast/alert/tooltip/hideTooltip/slot/confirm/progressBar/iconEl).
//
// Window CONTENT (inventory, entity GUIs, tech tree, help, menu) is registered
// from 71-ui-windows.js via F.ui.registerWindow(name, {create(payload)->el, refresh?(el,payload)}).
// This module owns only the generic window chrome (dragging, close button, z-order),
// the always-visible HUD, the reusable slot widget and small helpers (toast/tooltip/
// confirm/progress bar). No simulation state is read destructively; DOM only.
//
// Assumptions (documented, since these are not nailed down by ARCHITECTURE.md):
// - F.api.transferStack(fromInv, index, toEntityOrPlayer) is used for Shift+click.
//   Ctrl+click ("move all of that type") has no matching F.api entry point, so this
//   module resolves a raw target inventory array from opts.transferTarget (accepts a
//   raw inventory array, the string 'player', or an entity — for an entity it picks
//   the first inventory group from F.entities.inventories()) and uses F.inv.transfer
//   locally. If no target/array can be resolved, Ctrl+click falls back to
//   F.api.transferStack once (same as Shift+click) rather than doing nothing.
// - The quickbar (F.state.player.quickbar, an array of item id|null per ARCHITECTURE
//   §14) is rendered by a small dedicated widget, not F.ui.slot(), since it links to
//   an item id + live inventory count rather than a {id,count} stack slot.
// - F.player.cancelCraft(index) has no "how many to cancel" parameter in the
//   documented API, so left/right/shift-click on a crafting-queue entry all cancel
//   that whole queue entry (best available behaviour given the contract).
// - Evolution is only shown once an 'alert' with kind 'attack' has fired this
//   session (not persisted across save/load — purely a HUD-visibility nicety, GDD §9.1).
// - This module injects its own small <style> block (id="f-ui-style") into
//   <head> at init() time rather than depending on the separately authored
//   style.css, so the UI is fully functional and reasonably themed even if that
//   file targets different selectors. It uses an "f-" class prefix throughout to
//   avoid clashing with anything style.css or 71-ui-windows.js might add.
(function () {
  'use strict';

  var HEADLESS = (typeof window !== 'undefined') && !!window.HEADLESS;

  // ===========================================================================
  // Expansion registries (design/EXPANSION.md §6.6). Feature modules
  // (src/37-oil.js, 38-trains.js, 39-robots.js, 45-rocket.js) load BEFORE this
  // file (filename order 37/38/39/45 < 70), so F.ui does not exist yet at
  // their load time. They therefore register directly onto a plain F.*
  // object/array (created with `X = X || {}` so whoever runs first wins the
  // creation and nobody clobbers an earlier registration), and the
  // F.ui.registerEntityGUI() function below is just sugar over the same
  // object for anything that registers after this file has run. See the
  // exact snippet appended to design/EXPANSION.md §6.6.
  // F._entityGUIs: behaviour -> fn(root, e, def, h). Consulted by
  // 71-ui-windows.js's entity-window dispatch BEFORE the built-in
  // ENTITY_RENDERERS table, so a registered GUI always takes precedence.
  // ===========================================================================
  F._entityGUIs = F._entityGUIs || {};
  function registerEntityGUI(behaviour, fn) {
    if (!behaviour || typeof fn !== 'function') { F.log.warn('F.ui.registerEntityGUI: invalid args', behaviour); return; }
    F._entityGUIs[behaviour] = fn;
  }
  // F.FEATURES.combat off (src/disabled/README.md): the weapon/ammo box,
  // player health bar and evolution readout are omitted from the HUD
  // entirely (not just hidden) — see buildTopLeft/buildBottomCenter/
  // buildBottomLeft and refreshTopLeft/refreshHpAndAmmo below.
  var COMBAT_UI = !!(F.FEATURES && F.FEATURES.combat);

  // ===========================================================================
  // i18n — this module's own strings (ui.* per ARCHITECTURE §4 key convention).
  // Registered at load time; 02-i18n.js has already loaded (file order).
  // ===========================================================================
  if (F.i18n && F.i18n.add) {

    F.i18n.add('en', {
      'ui.map': 'Map',
      'ui.tech': 'Technologies',
      'ui.help': 'Instructions',
      'ui.save': 'Save',
      'ui.settings': 'Settings',
      'ui.alt': 'Alt mode',
      'ui.saved': 'Game saved',
      'ui.save_failed': 'Save failed',
      'ui.close': 'Close',
      'ui.yes': 'Yes',
      'ui.no': 'No',
      'ui.clock': 'Time: {t}',
      'ui.evolution': 'Evolution: {p} %',
      'ui.research_none': 'No research',
      'ui.research_progress': '{p} %',
      'ui.stack': 'Stack: {n}',
      'ui.fuel_value': 'Fuel: {n} MJ',
      'ui.dimensions': '{w}×{h}',
      'ui.transfer_hint': 'Ctrl + click: quick transfer',
      'ui.cancel_hint': 'Click: cancel',
      'ui.quickbar_empty': 'Empty slot',
      'ui.hp': 'Health',
      'ui.no_weapon': 'No weapon',
      'ui.ammo': 'Ammo',
      'ui.alerts_none': 'No alerts',
    });
  }

  // ===========================================================================
  // Module state (closures — nothing here is F.state, all DOM/UI-local).
  // ===========================================================================
  var inited = false;
  var root = null;            // #ui
  var hudEl = null;           // HUD layer
  var windowsLayer = null;    // registered windows live here
  var tooltipEl = null;
  var cursorEl = null;
  var toastLayer = null;
  var alertsEl = null;
  var minimapCanvas = null, minimapCtx = null;
  var quickbarEls = [];       // 10 { root, icon, count, key }
  var craftQueueEl = null;
  var hpFillEl = null, hpTextEl = null;
  var ammoIconEl = null, ammoCountEl = null;
  var researchBarEl = null, researchFillEl = null, researchTextEl = null, researchIconEl = null;
  var clockEl = null, evoEl = null;

  var openWindows = new Map();   // name -> { el, payload, factory, titlebar }
  var zTop = 20;
  var mouse = { x: 0, y: 0 };
  var dragging = null;           // { el, dx, dy } while dragging a window titlebar
  var hoverTimer = null;
  var hoverTarget = null;

  var alerts = [];               // [{ kind, x, y, entity, count, expiresAt }]
  var sawAttack = false;

  var frame = 0;

  // slot registry for cheap per-frame visual sync (see registerLiveSlot)
  var liveSlots = [];
  var slotDesc = new WeakMap();  // element -> descriptor (also used by delegated handlers)

  // ===========================================================================
  // Small DOM helpers
  // ===========================================================================
  function el(tag, cls, parent) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (parent) parent.appendChild(e);
    return e;
  }
  function setText(e, s) { if (e && e.textContent !== s) e.textContent = s; }
  function show(e, on) { if (!e) return; var d = on ? '' : 'none'; if (e.style.display !== d) e.style.display = d; }

  function iconUrl(itemId) {
    try {
      if (F.sprites && F.sprites.itemURL) return F.sprites.itemURL(itemId);
    } catch (err) { F.log.error('F.ui: F.sprites.itemURL', itemId, err); }
    return null;
  }

  // Small reusable item icon element (used by slots, queue, alerts, tooltips).
  function iconEl(itemId, size) {
    var d = document.createElement('div');
    d.className = 'f-icon';
    var s = size || 32;
    d.style.width = s + 'px'; d.style.height = s + 'px';
    var url = itemId ? iconUrl(itemId) : null;
    if (url) d.style.backgroundImage = 'url(' + url + ')';
    return d;
  }

  // ===========================================================================
  // Stylesheet injected once at init() — see header comment.
  // ===========================================================================
  var CSS =
    '#ui{position:fixed;inset:0;pointer-events:none;font:13px/1.4 system-ui,sans-serif;color:#e0dcd3;z-index:100;}' +
    '#ui *{box-sizing:border-box;}' +
    '.f-auto{pointer-events:auto;}' +
    '.f-panel{background:#313031;border:2px solid #0f0f0f;box-shadow:inset 0 0 0 1px #4a4a4a;border-radius:2px;}' +
    '.f-hud-region{position:absolute;pointer-events:none;}' +
    '.f-hud-region .f-auto{pointer-events:auto;}' +
    '.f-btn{background:#3a3a3a;border:1px solid #0f0f0f;color:#e0dcd3;border-radius:2px;cursor:pointer;padding:3px 6px;font-size:12px;}' +
    '.f-btn:hover{background:#4a4a4a;}' +
    '.f-btn:active{background:#262626;}' +
    '.f-window{position:absolute;pointer-events:auto;min-width:200px;}' +
    '.f-titlebar{display:flex;align-items:center;justify-content:space-between;background:#3a3a3a;border-bottom:2px solid #0f0f0f;padding:4px 6px;cursor:move;color:#ffe6c0;font-weight:600;}' +
    '.f-close{background:transparent;border:none;color:#e0dcd3;cursor:pointer;font-size:15px;line-height:1;padding:0 4px;}' +
    '.f-close:hover{color:#ff3f3f;}' +
    '.f-body{padding:8px;max-height:80vh;overflow:auto;}' +
    '.f-slot{position:relative;width:40px;height:40px;background:#262626;border:1px solid #0f0f0f;box-shadow:inset 0 0 3px #000;border-radius:2px;cursor:pointer;flex:0 0 auto;}' +
    '.f-slot:hover{background:#3a3a3a;}' +
    '.f-slot.filtered-out{opacity:.35;cursor:not-allowed;}' +
    '.f-slot.readonly{cursor:default;}' +
    '.f-icon{width:32px;height:32px;margin:3px auto 0;background-size:cover;background-position:center;image-rendering:pixelated;pointer-events:none;}' +
    '.f-count{position:absolute;right:2px;bottom:1px;font-size:11px;color:#fff;text-shadow:0 0 2px #000,1px 1px 0 #000;pointer-events:none;}' +
    '.f-tooltip{position:absolute;pointer-events:none;background:rgba(10,10,10,.95);border:1px solid #4a4a4a;color:#e0dcd3;padding:6px 8px;border-radius:2px;max-width:320px;font-size:12px;z-index:10000;white-space:pre-line;}' +
    '.f-tooltip b{color:#ffa500;}' +
    '.f-cursor{position:absolute;pointer-events:none;width:36px;height:36px;z-index:9000;transform:translate(-18px,-18px);}' +
    '.f-cursor .f-icon{width:32px;height:32px;margin:2px;}' +
    '.f-toast-layer{position:absolute;left:50%;top:10%;transform:translateX(-50%);display:flex;flex-direction:column;gap:4px;align-items:center;}' +
    '.f-toast{background:rgba(20,20,20,.9);border:1px solid #4a4a4a;color:#e0dcd3;padding:6px 12px;border-radius:3px;opacity:1;transition:opacity .4s;}' +
    '.f-progress{position:relative;height:14px;background:#1b1b1b;border:1px solid #0f0f0f;border-radius:2px;overflow:hidden;}' +
    '.f-progress-fill{position:absolute;left:0;top:0;bottom:0;width:0%;background:#faa838;}' +
    '.f-hpbar{width:220px;height:14px;position:relative;background:#1b1b1b;border:1px solid #0f0f0f;border-radius:2px;overflow:hidden;}' +
    '.f-hpfill{position:absolute;left:0;top:0;bottom:0;background:#5eb663;}' +
    '.f-hptext{position:absolute;inset:0;text-align:center;font-size:11px;line-height:14px;text-shadow:0 0 2px #000;}' +
    '.f-alert{display:flex;align-items:center;gap:4px;background:rgba(30,10,10,.85);border:1px solid #ff3f3f;color:#ff8e8e;padding:3px 6px;border-radius:2px;cursor:pointer;margin-bottom:3px;animation:f-blink 1s steps(2) infinite;}' +
    '@keyframes f-blink{50%{opacity:.45;}}' +
    '.f-minimap{width:200px;height:200px;display:block;background:#1b1b1b;border:1px solid #0f0f0f;cursor:pointer;}' +
    '.f-minimap-buttons{display:grid;grid-template-columns:repeat(3,1fr);gap:2px;width:200px;margin-top:3px;}' +
    '.f-minimap-buttons .f-btn{padding:2px;font-size:10px;}' +
    '.f-quickbar{display:flex;gap:3px;}' +
    '.f-qslot{position:relative;width:40px;height:40px;background:#262626;border:1px solid #0f0f0f;border-radius:2px;cursor:pointer;}' +
    '.f-qslot:hover{background:#3a3a3a;}' +
    '.f-qslot .f-key{position:absolute;left:2px;top:1px;font-size:10px;color:#aaa;pointer-events:none;}' +
    '.f-qslot .f-count{right:2px;bottom:1px;}' +
    '.f-queue{display:flex;gap:3px;flex-direction:row-reverse;}' +
    '.f-qitem{position:relative;width:32px;height:32px;background:#262626;border:1px solid #0f0f0f;border-radius:2px;cursor:pointer;}' +
    '.f-qitem .f-progress{position:absolute;left:0;right:0;bottom:0;height:3px;border:none;border-radius:0;}' +
    '.f-recipe-btn{display:flex;align-items:center;gap:4px;background:#262626;border:1px solid #0f0f0f;border-radius:2px;padding:4px;cursor:pointer;}' +
    '.f-recipe-btn:hover{background:#3a3a3a;}' +
    '.f-recipe-btn.locked{display:none;}' +
    '.f-status-dot{width:8px;height:8px;border-radius:50%;display:inline-block;margin-right:4px;}' +
    '.f-modal-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.45);pointer-events:auto;}';

  function injectCss() {
    if (document.getElementById('f-ui-style')) return;
    var s = document.createElement('style');
    s.id = 'f-ui-style';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  // ===========================================================================
  // Status colour (GDD §9.6: green working, yellow output/low-power/idle, red no-*)
  // ===========================================================================
  var STATUS_COLOR = {
    working: '#5eb663', idle: '#e0dcd3',
    output_full: '#faa838', low_power: '#faa838', no_ingredients: '#faa838', waiting_for_space: '#faa838', waiting_for_source: '#faa838',
    no_power: '#ff3f3f', not_connected: '#ff3f3f', no_fuel: '#ff3f3f', no_recipe: '#ff3f3f', no_minable_resources: '#ff3f3f',
    // no_ammo removed: only the turret status (35-combat.js, disabled) ever returned it.
    no_research: '#ff3f3f', missing_science_packs: '#ff3f3f', no_water: '#ff3f3f', no_steam: '#ff3f3f', no_pair: '#ff3f3f',
  };
  function statusColor(status) { return STATUS_COLOR[status] || '#e0dcd3'; }

  // ===========================================================================
  // Player cursor stack helpers (F.state.player.cursor per ARCHITECTURE §14).
  // ===========================================================================
  function getCursor() { return (F.state && F.state.player) ? F.state.player.cursor : null; }
  function setCursor(v) { if (F.state && F.state.player) F.state.player.cursor = v || null; }
  function giveToInventory(id, count) {
    if (F.player && F.player.giveOrDrop) { F.player.giveOrDrop(id, count); return; }
    if (F.state && F.state.player && F.inv) F.inv.add(F.state.player.inv, id, count);
  }

  // ===========================================================================
  // F.ui.slot() — reusable inventory slot widget.
  // ===========================================================================
  function resolveInvArray(target) {
    if (Array.isArray(target)) return target;
    if (target === 'player') return F.state && F.state.player && F.state.player.inv;
    if (target && typeof target === 'object' && F.entities && F.entities.inventories) {
      try {
        var groups = F.entities.inventories(target);
        if (groups && groups.length) return groups[0].inv;
      } catch (err) { F.log.error('F.ui: resolveInvArray', err); }
    }
    return null;
  }

  function emitChanged(invArr, index, opts) {
    if (opts && typeof opts.onChange === 'function') { try { opts.onChange(); } catch (err) { F.log.error('F.ui slot onChange', err); } }
    F.events.emit('inventory:changed', { inv: invArr, index: index });
  }

  function doLeftClick(invArr, index, opts) {
    var cursor = getCursor();
    var stack = invArr[index];
    if (!cursor && !stack) return;
    if (!cursor && stack) {
      setCursor({ id: stack.id, count: stack.count });
      invArr[index] = null;
    } else if (cursor && !stack) {
      if (opts.filter && !opts.filter(cursor.id)) return;
      invArr[index] = { id: cursor.id, count: cursor.count };
      setCursor(null);
    } else {
      if (cursor.id === stack.id) {
        var stackSize = F.inv.stackSize(cursor.id);
        var room = Math.max(0, stackSize - stack.count);
        var add = Math.min(room, cursor.count);
        if (add <= 0) {
          // full — swap instead (matches Factorio "swap" behaviour when target is full)
          if (opts.filter && !opts.filter(cursor.id)) return;
          var tmpFull = { id: stack.id, count: stack.count };
          invArr[index] = { id: cursor.id, count: cursor.count };
          setCursor(tmpFull);
        } else {
          stack.count += add;
          cursor.count -= add;
          setCursor(cursor.count > 0 ? cursor : null);
        }
      } else {
        if (opts.filter && !opts.filter(cursor.id)) return;
        var tmp = { id: stack.id, count: stack.count };
        invArr[index] = { id: cursor.id, count: cursor.count };
        setCursor(tmp);
      }
    }
    emitChanged(invArr, index, opts);
  }

  function doRightClick(invArr, index, opts) {
    var cursor = getCursor();
    var stack = invArr[index];
    if (!cursor) {
      if (!stack) return;
      var half = Math.ceil(stack.count / 2);
      setCursor({ id: stack.id, count: half });
      stack.count -= half;
      if (stack.count <= 0) invArr[index] = null;
    } else {
      if (opts.filter && !opts.filter(cursor.id)) return;
      if (stack && stack.id !== cursor.id) return;
      var lim = F.inv.stackSize(cursor.id);
      if (stack && stack.count >= lim) return;
      if (!stack) invArr[index] = { id: cursor.id, count: 1 };
      else stack.count += 1;
      cursor.count -= 1;
      setCursor(cursor.count > 0 ? cursor : null);
    }
    emitChanged(invArr, index, opts);
  }

  function doShiftClick(invArr, index, opts) {
    if (!opts.transferTarget) return;
    if (!invArr[index]) return;
    if (F.api && F.api.transferStack) {
      F.api.transferStack(invArr, index, opts.transferTarget);
      emitChanged(invArr, index, opts);
    }
  }

  function doCtrlClick(invArr, index, opts) {
    if (!opts.transferTarget) return;
    var targetInv = resolveInvArray(opts.transferTarget);
    if (!targetInv) {
      if (F.api && F.api.transferStack && invArr[index]) F.api.transferStack(invArr, index, opts.transferTarget);
      emitChanged(invArr, index, opts);
      return;
    }
    var stack = invArr[index];
    if (stack) F.inv.transfer(invArr, targetInv, stack.id);
    else F.inv.transfer(invArr, targetInv, null); // empty slot + ctrl = move everything (GDD §9.3)
    emitChanged(invArr, index, opts);
  }

  function registerLiveSlot(desc) { liveSlots.push(desc); }

  function refreshSlotVisual(desc) {
    // (containment is checked by pruneAndRefreshSlots; a freshly created, still detached slot must render its initial state here)
    var stack = desc.inv[desc.index];
    var id = stack ? stack.id : null;
    var count = stack ? stack.count : 0;
    if (id !== desc.lastId) {
      desc.lastId = id;
      if (id) {
        var url = iconUrl(id);
        desc.iconEl.style.backgroundImage = url ? 'url(' + url + ')' : '';
        desc.rootEl.classList.add('has-item');
        desc.rootEl.dataset.itemId = id;
        if (!desc.opts.readonly) desc.rootEl.setAttribute('draggable', 'true');
      } else {
        desc.iconEl.style.backgroundImage = '';
        desc.rootEl.classList.remove('has-item');
        delete desc.rootEl.dataset.itemId;
        desc.rootEl.removeAttribute('draggable');
      }
    }
    if (count !== desc.lastCount) {
      desc.lastCount = count;
      setText(desc.countEl, count > 1 ? String(count) : '');
    }
    if (desc.opts.filter) {
      var allowed = !id || desc.opts.filter(id);
      desc.rootEl.classList.toggle('filtered-out', !allowed);
    }
    return true;
  }

  function pruneAndRefreshSlots() {
    var live = [];
    for (var i = 0; i < liveSlots.length; i++) {
      var d = liveSlots[i];
      if (root.contains(d.rootEl)) { refreshSlotVisual(d); live.push(d); }
    }
    liveSlots = live;
  }

  // F.ui.slot(inv, index, opts) -> element. opts: {filter(id)->bool, readonly, onChange, transferTarget}
  function makeSlot(invArr, index, opts) {
    if (HEADLESS || !inited) return null;
    opts = opts || {};
    var wrap = document.createElement('div');
    wrap.className = 'f-slot' + (opts.readonly ? ' readonly' : '');
    var icon = iconEl(null, 32);
    wrap.appendChild(icon);
    var count = document.createElement('div');
    count.className = 'f-count';
    wrap.appendChild(count);
    var desc = { rootEl: wrap, iconEl: icon, countEl: count, inv: invArr, index: index, opts: opts, lastId: undefined, lastCount: undefined };
    slotDesc.set(wrap, desc);
    registerLiveSlot(desc);
    refreshSlotVisual(desc);
    return wrap;
  }

  // ===========================================================================
  // Tooltip
  // ===========================================================================
  function showTooltip(html, x, y) {
    if (HEADLESS || !inited) return;
    tooltipEl.innerHTML = html;
    tooltipEl.style.display = 'block';
    positionTooltip(x, y);
  }
  function positionTooltip(x, y) {
    if (!tooltipEl) return;
    var vw = window.innerWidth || 1280, vh = window.innerHeight || 800;
    var pad = 14;
    var w = tooltipEl.offsetWidth || 220, h = tooltipEl.offsetHeight || 60;
    var px = Math.min(x + pad, vw - w - 4);
    var py = Math.min(y + pad, vh - h - 4);
    tooltipEl.style.left = Math.max(4, px) + 'px';
    tooltipEl.style.top = Math.max(4, py) + 'px';
  }
  function hideTooltip() {
    if (HEADLESS || !inited || !tooltipEl) return;
    tooltipEl.style.display = 'none';
  }

  function itemTooltipHtml(id) {
    var name = F.t('item.' + id);
    var desc = F.t('item.' + id + '.desc');
    var it = F.data.items[id];
    var lines = ['<b>' + F.util.escapeHtml(name) + '</b>'];
    if (desc && desc !== 'item.' + id + '.desc') lines.push(F.util.escapeHtml(desc));
    if (it) {
      if (it.stack) lines.push(F.t('ui.stack', { n: it.stack }));
      if (it.fuel) lines.push(F.t('ui.fuel_value', { n: F.util.fmt(it.fuel, 1) }));
      if (it.place) {
        var edef = F.data.entities[it.place];
        if (edef && edef.size) lines.push(F.t('ui.dimensions', { w: edef.size[0], h: edef.size[1] }));
      }
    }
    return lines.join('<br>');
  }

  // ===========================================================================
  // Toast
  // ===========================================================================
  function toast(text) {
    if (HEADLESS || !inited) return;
    var t = document.createElement('div');
    t.className = 'f-toast';
    t.textContent = text;
    toastLayer.appendChild(t);
    setTimeout(function () {
      t.style.opacity = '0';
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 500);
    }, 2600);
  }

  // ===========================================================================
  // Alerts (GDD §9.10)
  // ===========================================================================
  // attack/entity_destroyed/turret_out_of_ammo alert kinds removed: only
  // 35-combat.js ever emitted them, and it is disabled (F.FEATURES.combat
  // off — see src/disabled/README.md), so those kinds can never occur here.
  var ALERT_DURATION_TICKS = {
    no_power: 600, no_fuel: 600, research_done: 480, inventory_full: 480,
  };
  var ALERT_ICON_COLOR = {
    no_power: '#80cef0', no_fuel: '#faa838', research_done: '#5eb663', inventory_full: '#faa838',
  };

  function nowTick() { return (F.state && F.state.tick) || 0; }

  function pushAlert(kind, x, y, entity) {
    if (kind === 'attack') sawAttack = true;
    var dur = ALERT_DURATION_TICKS[kind] != null ? ALERT_DURATION_TICKS[kind] : 600;
    var existing = null;
    for (var i = 0; i < alerts.length; i++) if (alerts[i].kind === kind) { existing = alerts[i]; break; }
    if (existing) {
      existing.count++;
      existing.expiresAt = nowTick() + dur;
      existing.x = x != null ? x : existing.x;
      existing.y = y != null ? y : existing.y;
      existing.entity = entity || existing.entity;
    } else {
      alerts.push({ kind: kind, x: x, y: y, entity: entity, count: 1, expiresAt: nowTick() + dur });
    }
  }

  function alertFn(kind, entity) {
    if (HEADLESS) return;
    var x, y;
    if (entity) {
      try {
        var c = (F.entities && F.entities.center) ? F.entities.center(entity) : [entity.x, entity.y];
        x = c[0]; y = c[1];
      } catch (err) { x = entity.x; y = entity.y; }
    }
    pushAlert(kind, x, y, entity);
  }

  function onAlertEvent(payload) {
    if (!payload) return;
    pushAlert(payload.kind, payload.x, payload.y, payload.entity);
  }

  function expireAlerts() {
    var t = nowTick();
    var live = [];
    for (var i = 0; i < alerts.length; i++) if (alerts[i].expiresAt > t) live.push(alerts[i]);
    if (live.length !== alerts.length) alerts = live;
  }

  function centerCameraOn(x, y) {
    if (F.camera) { F.camera.x = x; F.camera.y = y; }
  }

  function renderAlerts() {
    if (!alertsEl) return;
    // Rebuild only when the alert set actually changed shape (cheap: compare a signature string).
    var sig = alerts.map(function (a) { return a.kind + ':' + a.count; }).join('|');
    if (alertsEl.dataset.sig === sig) return;
    alertsEl.dataset.sig = sig;
    alertsEl.innerHTML = '';
    for (var i = 0; i < alerts.length; i++) {
      (function (a) {
        var row = document.createElement('div');
        row.className = 'f-alert';
        row.style.borderColor = ALERT_ICON_COLOR[a.kind] || '#ff3f3f';
        var dot = document.createElement('span');
        dot.className = 'f-status-dot';
        dot.style.background = ALERT_ICON_COLOR[a.kind] || '#ff3f3f';
        row.appendChild(dot);
        var label = document.createElement('span');
        label.textContent = F.t('alert.' + a.kind) + (a.count > 1 ? ' ×' + a.count : '');
        row.appendChild(label);
        row.title = F.t('alert.' + a.kind);
        row.addEventListener('click', function () { if (a.x != null && a.y != null) centerCameraOn(a.x, a.y); });
        alertsEl.appendChild(row);
      })(alerts[i]);
    }
  }

  // ===========================================================================
  // Progress bar helper
  // ===========================================================================
  function progressBar(fraction, opts) {
    if (HEADLESS || !inited) return null;
    var wrap = document.createElement('div');
    wrap.className = 'f-progress' + (opts && opts.cls ? ' ' + opts.cls : '');
    var fill = document.createElement('div');
    fill.className = 'f-progress-fill';
    wrap.appendChild(fill);
    var last = -1;
    wrap.update = function (f) {
      f = F.util.clamp(f == null ? 0 : f, 0, 1);
      var pct = Math.round(f * 1000) / 10;
      if (pct !== last) { last = pct; fill.style.width = pct + '%'; }
    };
    wrap.update(fraction || 0);
    return wrap;
  }

  // ===========================================================================
  // Window chrome (generic; content comes from registered factories)
  // ===========================================================================
  var windowRegistry = {}; // name -> { create(payload)->el, refresh?(el,payload) }

  function registerWindow(name, factory) {
    if (!name || !factory || typeof factory.create !== 'function') {
      F.log.warn('F.ui.registerWindow: invalid factory for', name);
      return;
    }
    windowRegistry[name] = factory;
  }

  // Helper 71-ui-windows.js can use to build consistent window chrome:
  // F.ui.windowFrame(titleText, bodyEl) -> rootEl (with .f-titlebar/.f-body wired for drag+close)
  function windowFrame(titleText, bodyEl) {
    var w = document.createElement('div');
    w.className = 'f-window f-panel';
    var bar = document.createElement('div');
    bar.className = 'f-titlebar';
    var t = document.createElement('span');
    t.textContent = titleText || '';
    bar.appendChild(t);
    var close = document.createElement('button');
    close.className = 'f-close';
    close.textContent = '×';
    close.title = F.t('ui.close');
    close.setAttribute('data-f-close', '1');
    bar.appendChild(close);
    w.appendChild(bar);
    var body = document.createElement('div');
    body.className = 'f-body';
    if (bodyEl) body.appendChild(bodyEl);
    w.appendChild(body);
    w._titleEl = t;
    w._bodyEl = body;
    return w;
  }

  function centerWindow(w) {
    var vw = window.innerWidth || 1280, vh = window.innerHeight || 800;
    // Let layout settle before measuring; fall back to sane defaults.
    var ww = w.offsetWidth || 400, wh = w.offsetHeight || 300;
    w.style.left = Math.max(8, (vw - ww) / 2) + 'px';
    w.style.top = Math.max(8, (vh - wh) / 2) + 'px';
  }

  function bringToFront(w) { zTop++; w.style.zIndex = String(zTop); }

  function openWindow(name, payload) {
    if (HEADLESS || !inited) return null;
    var existing = openWindows.get(name);
    if (existing) {
      existing.payload = payload;
      if (existing.factory.refresh) { try { existing.factory.refresh(existing.el, payload); } catch (err) { F.log.error('window refresh', name, err); } }
      bringToFront(existing.el);
      return existing.el;
    }
    var factory = windowRegistry[name];
    if (!factory) { F.log.warn('F.ui.open: no window registered for', name); return null; }
    var w;
    try { w = factory.create(payload); } catch (err) { F.log.error('window create', name, err); return null; }
    if (!w) return null;
    w.dataset.fWindow = name;
    windowsLayer.appendChild(w);
    if (!w.style.left && !w.style.top) centerWindow(w);
    bringToFront(w);
    openWindows.set(name, { el: w, payload: payload, factory: factory });
    if (name === 'entity') F.events.emit('entity:opened', payload && payload.entity);
    return w;
  }

  function closeWindow(name) {
    if (HEADLESS || !inited) return false;
    var inst = openWindows.get(name);
    if (!inst) return false;
    if (inst.factory.onClose) { try { inst.factory.onClose(inst.el, inst.payload); } catch (err) { F.log.error('window onClose', name, err); } }
    if (inst.el.parentNode) inst.el.parentNode.removeChild(inst.el);
    openWindows.delete(name);
    hideTooltip(); // a tooltip anchored to an element inside the window must not outlive it
    if (name === 'entity') F.events.emit('entity:closed', inst.payload && inst.payload.entity);
    return true;
  }

  function closeAllWindows() {
    if (HEADLESS || !inited) return;
    var names = Array.from(openWindows.keys());
    for (var i = 0; i < names.length; i++) closeWindow(names[i]);
  }

  function isOpen(name) { return openWindows.has(name); }

  // Every currently-open window name (any registered window, not just the
  // handful 75-input.js knows by name) and the one with the highest z-index
  // (i.e. topmost / most recently brought to front) — used by 75-input.js's
  // Esc handling so it can close whichever window is on top even when it was
  // opened directly by a feature module (e.g. a train/roboport/rocket GUI
  // calling F.ui.open() from its own click handler) rather than through
  // 75-input.js's own toggleWindow().
  function listOpen() { return Array.from(openWindows.keys()); }
  function topWindow() {
    var top = null, topZ = -1;
    openWindows.forEach(function (inst, name) {
      var z = parseInt(inst.el.style.zIndex || '0', 10) || 0;
      if (z > topZ) { topZ = z; top = name; }
    });
    return top;
  }

  // ===========================================================================
  // Confirm dialog
  // ===========================================================================
  function confirmDialog(text) {
    if (HEADLESS || !inited) return Promise.resolve(false);
    return new Promise(function (resolve) {
      var backdrop = document.createElement('div');
      backdrop.className = 'f-modal-backdrop';
      var body = document.createElement('div');
      var p = document.createElement('div');
      p.style.marginBottom = '10px';
      p.style.maxWidth = '320px';
      p.textContent = text;
      body.appendChild(p);
      var row = document.createElement('div');
      row.style.display = 'flex';
      row.style.gap = '8px';
      row.style.justifyContent = 'flex-end';
      var yes = document.createElement('button');
      yes.className = 'f-btn'; yes.textContent = F.t('ui.yes');
      var no = document.createElement('button');
      no.className = 'f-btn'; no.textContent = F.t('ui.no');
      row.appendChild(yes); row.appendChild(no);
      body.appendChild(row);
      var win = windowFrame('', body);
      win.style.zIndex = String(++zTop + 1000);
      backdrop.style.zIndex = String(zTop + 999);
      function finish(v) {
        if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
        if (win.parentNode) win.parentNode.removeChild(win);
        resolve(v);
      }
      yes.addEventListener('click', function () { finish(true); });
      no.addEventListener('click', function () { finish(false); });
      backdrop.addEventListener('click', function () { finish(false); });
      var closeBtn = win.querySelector('[data-f-close]');
      if (closeBtn) closeBtn.addEventListener('click', function () { finish(false); });
      windowsLayer.appendChild(backdrop);
      windowsLayer.appendChild(win);
      centerWindow(win);
      bringToFront(win);
    });
  }

  // ===========================================================================
  // HUD construction
  // ===========================================================================
  function buildTopLeft(parent) {
    var region = el('div', 'f-hud-region', parent);
    region.style.left = '8px'; region.style.top = '8px';
    var panel = el('div', 'f-panel f-auto', region);
    panel.style.padding = '6px';
    clockEl = el('div', '', panel);
    if (COMBAT_UI) {
      evoEl = el('div', '', panel);
      evoEl.style.color = '#ff8e8e';
    }
    minimapCanvas = document.createElement('canvas');
    minimapCanvas.width = 200; minimapCanvas.height = 200;
    minimapCanvas.className = 'f-minimap';
    panel.appendChild(minimapCanvas);
    minimapCtx = minimapCanvas.getContext && minimapCanvas.getContext('2d');
    var btnRow = el('div', 'f-minimap-buttons', panel);
    var buttons = [
      ['map', 'ui.map'], ['tech', 'ui.tech'], ['help', 'ui.help'],
      ['save', 'ui.save'], ['settings', 'ui.settings'], ['alt', 'ui.alt'],
    ];
    for (var i = 0; i < buttons.length; i++) {
      var b = el('button', 'f-btn', btnRow);
      b.dataset.hudAction = buttons[i][0];
      b.dataset.i18n = buttons[i][1];
      b.textContent = F.t(buttons[i][1]);
    }
  }

  function buildTopRight(parent) {
    var region = el('div', 'f-hud-region', parent);
    region.style.right = '8px'; region.style.top = '8px';
    var panel = el('div', 'f-panel f-auto', region);
    panel.style.padding = '6px'; panel.style.width = '220px'; panel.style.cursor = 'pointer';
    panel.dataset.hudAction = 'tech';
    var row = el('div', '', panel);
    row.style.display = 'flex'; row.style.alignItems = 'center'; row.style.gap = '6px';
    researchIconEl = iconEl(null, 24);
    row.appendChild(researchIconEl);
    researchTextEl = el('span', '', row);
    var bar = progressBar(0);
    if (bar) { panel.appendChild(bar); researchFillEl = bar; }
  }

  function buildBottomCenter(parent) {
    var region = el('div', 'f-hud-region', parent);
    region.style.left = '50%'; region.style.bottom = '8px'; region.style.transform = 'translateX(-50%)';
    var col = el('div', '', region);
    col.style.display = 'flex'; col.style.flexDirection = 'column'; col.style.alignItems = 'center'; col.style.gap = '4px';
    if (COMBAT_UI) {
      var hpWrap = el('div', 'f-hpbar f-auto', col);
      hpFillEl = el('div', 'f-hpfill', hpWrap);
      hpTextEl = el('div', 'f-hptext', hpWrap);
    }
    var bar = el('div', 'f-quickbar f-auto', col);
    for (var i = 0; i < 10; i++) {
      var q = el('div', 'f-qslot', bar);
      q.dataset.qIndex = String(i);
      var key = el('div', 'f-key', q);
      key.textContent = String((i + 1) % 10);
      var qicon = iconEl(null, 32);
      q.appendChild(qicon);
      var qcount = el('div', 'f-count', q);
      quickbarEls.push({ root: q, icon: qicon, count: qcount, lastId: undefined, lastCount: undefined });
    }
  }

  function buildBottomLeft(parent) {
    var region = el('div', 'f-hud-region', parent);
    region.style.left = '8px'; region.style.bottom = '8px';
    var col = el('div', 'f-auto', region);
    col.style.display = 'flex'; col.style.flexDirection = 'column'; col.style.gap = '4px';
    craftQueueEl = el('div', 'f-queue', col);
    if (COMBAT_UI) {
      var ammoRow = el('div', '', col);
      ammoRow.style.display = 'flex'; ammoRow.style.alignItems = 'center'; ammoRow.style.gap = '4px';
      ammoIconEl = iconEl(null, 24);
      ammoRow.appendChild(ammoIconEl);
      ammoCountEl = el('span', '', ammoRow);
    }
  }

  function buildBottomRight(parent) {
    var region = el('div', 'f-hud-region', parent);
    region.style.right = '8px'; region.style.bottom = '8px';
    region.style.maxWidth = '260px';
    alertsEl = el('div', 'f-auto', region);
    alertsEl.dataset.sig = '';
  }

  function buildHud() {
    hudEl = el('div', '', root);
    buildTopLeft(hudEl);
    buildTopRight(hudEl);
    buildBottomCenter(hudEl);
    buildBottomLeft(hudEl);
    buildBottomRight(hudEl);
  }

  // ===========================================================================
  // HUD refresh (cheap, per-frame; heavier bits gated by frame count)
  // ===========================================================================
  function ammoItemFor() {
    // best-effort: whichever magazine the player is carrying (see header assumptions)
    var invArr = F.state && F.state.player && F.state.player.inv;
    if (!invArr) return null;
    if (F.inv.count(invArr, 'piercing-rounds-magazine') > 0) return 'piercing-rounds-magazine';
    if (F.inv.count(invArr, 'firearm-magazine') > 0) return 'firearm-magazine';
    return null;
  }

  function refreshTopLeft() {
    if (!F.state) return;
    setText(clockEl, F.t('ui.clock', { t: F.util.fmtTime(F.state.tick / F.C.TPS) }));
    if (!COMBAT_UI) return; // no evoEl was created; nothing left to refresh
    var ev = (F.combat && F.combat.evolution) ? (F.combat.evolution() || 0) : 0;
    if (sawAttack || ev > 0.05) {
      show(evoEl, true);
      setText(evoEl, F.t('ui.evolution', { p: Math.round(ev * 100) }));
    } else show(evoEl, false);
  }

  function refreshMinimap() {
    if (!minimapCtx) return;
    try {
      if (F.render && F.render.minimap) {
        var img = F.render.minimap(200);
        if (img) { minimapCtx.clearRect(0, 0, 200, 200); minimapCtx.drawImage(img, 0, 0); return; }
      }
    } catch (err) { F.log.error('F.ui: minimap draw', err); }
    minimapCtx.fillStyle = '#1b1b1b';
    minimapCtx.fillRect(0, 0, 200, 200);
  }

  function refreshResearch() {
    if (!F.research) { setText(researchTextEl, F.t('ui.research_none')); return; }
    var id = F.state && F.state.research && F.state.research.current;
    var p = F.research.progress ? (F.research.progress() || 0) : 0;
    if (id) {
      setText(researchTextEl, F.t('tech.' + id) + ' ' + F.t('ui.research_progress', { p: Math.round(p * 100) }));
      var url = iconUrl(id);
      if (researchIconEl.dataset.id !== id) { researchIconEl.dataset.id = id; researchIconEl.style.backgroundImage = url ? 'url(' + url + ')' : ''; }
    } else {
      setText(researchTextEl, F.t('ui.research_none'));
      if (researchIconEl.dataset.id) { researchIconEl.dataset.id = ''; researchIconEl.style.backgroundImage = ''; }
    }
    if (researchFillEl && researchFillEl.update) researchFillEl.update(p);
  }

  function refreshQuickbar() {
    var qb = F.state && F.state.player && F.state.player.quickbar;
    for (var i = 0; i < quickbarEls.length; i++) {
      var w = quickbarEls[i];
      var id = qb ? qb[i] : null;
      var count = id ? (F.player && F.player.count ? F.player.count(id) : F.inv.count(F.state.player.inv, id)) : 0;
      if (id !== w.lastId) {
        w.lastId = id;
        var url = id ? iconUrl(id) : null;
        w.icon.style.backgroundImage = url ? 'url(' + url + ')' : '';
        w.root.dataset.itemId = id || '';
      }
      if (count !== w.lastCount) {
        w.lastCount = count;
        setText(w.count, count > 0 ? String(count) : '');
        w.root.style.opacity = (id && count <= 0) ? '0.4' : '1';
      }
    }
  }

  function refreshHpAndAmmo() {
    if (!COMBAT_UI) return; // no hpFillEl/ammoIconEl were created; nothing to refresh
    var p = F.state && F.state.player;
    if (!p) return;
    var hp = p.health != null ? p.health : 0, max = p.maxHealth || 250;
    var frac = max > 0 ? F.util.clamp(hp / max, 0, 1) : 0;
    if (hpFillEl.dataset.f !== String(frac)) {
      hpFillEl.dataset.f = String(frac);
      hpFillEl.style.width = Math.round(frac * 100) + '%';
      hpFillEl.style.background = frac > 0.5 ? '#5eb663' : (frac > 0.2 ? '#faa838' : '#ff3f3f');
    }
    setText(hpTextEl, Math.round(hp) + '/' + Math.round(max));

    var weapon = p.weapon;
    var ammoId = ammoItemFor();
    if (weapon) {
      var wurl = iconUrl(weapon);
      if (ammoIconEl.dataset.id !== weapon) { ammoIconEl.dataset.id = weapon; ammoIconEl.style.backgroundImage = wurl ? 'url(' + wurl + ')' : ''; }
      var n = ammoId ? F.inv.count(p.inv, ammoId) : 0;
      setText(ammoCountEl, (ammoId ? F.t('item.' + ammoId) + ' ' : '') + n);
    } else {
      if (ammoIconEl.dataset.id) { ammoIconEl.dataset.id = ''; ammoIconEl.style.backgroundImage = ''; }
      setText(ammoCountEl, F.t('ui.no_weapon'));
    }
  }

  function refreshCraftQueue() {
    var q = (F.state && F.state.player && F.state.player.craftQueue) || [];
    var sig = q.map(function (c, i) { return c.recipe + ':' + c.count + ':' + (i === q.length - 1 ? Math.round((c.progress || 0) * 20) : ''); }).join('|');
    if (craftQueueEl.dataset.sig === sig) return;
    craftQueueEl.dataset.sig = sig;
    craftQueueEl.innerHTML = '';
    for (var i = 0; i < q.length; i++) {
      (function (entry, index) {
        var item = document.createElement('div');
        item.className = 'f-qitem';
        var icon = iconEl(entry.recipe, 32);
        icon.style.width = '32px'; icon.style.height = '32px'; icon.style.margin = '0';
        item.appendChild(icon);
        if (entry.count > 1) {
          var c = document.createElement('div');
          c.className = 'f-count';
          c.textContent = String(entry.count);
          item.appendChild(c);
        }
        if (index === q.length - 1) {
          var bar = progressBar(entry.progress || 0);
          if (bar) item.appendChild(bar);
        }
        item.title = F.t('recipe.' + entry.recipe) !== 'recipe.' + entry.recipe ? F.t('recipe.' + entry.recipe) : (F.t('item.' + entry.recipe) + '\n' + F.t('ui.cancel_hint'));
        item.dataset.queueIndex = String(index);
        craftQueueEl.appendChild(item);
      })(q[i], i);
    }
  }

  // ===========================================================================
  // Cursor-follow stack
  // ===========================================================================
  function refreshCursorStack() {
    var c = getCursor();
    if (!c) { show(cursorEl, false); return; }
    show(cursorEl, true);
    cursorEl.style.left = mouse.x + 'px';
    cursorEl.style.top = mouse.y + 'px';
    if (cursorEl.dataset.id !== c.id) {
      cursorEl.dataset.id = c.id;
      var icon = cursorEl.querySelector('.f-icon');
      var url = iconUrl(c.id);
      icon.style.backgroundImage = url ? 'url(' + url + ')' : '';
    }
    var countEl = cursorEl.querySelector('.f-count');
    var text = c.count > 1 ? String(c.count) : '';
    setText(countEl, text);
  }

  // ===========================================================================
  // Language change: rebuild static HUD labels + re-open any open windows fresh
  // ===========================================================================
  function relabelHudButtons() {
    var btns = hudEl.querySelectorAll('[data-i18n]');
    for (var i = 0; i < btns.length; i++) btns[i].textContent = F.t(btns[i].dataset.i18n);
  }

  function onLangChanged() {
    if (HEADLESS || !inited) return;
    relabelHudButtons();
    // Force the next HUD text refresh to re-render (values may be language-dependent).
    craftQueueEl.dataset.sig = '__lang__';
    alertsEl.dataset.sig = '__lang__';
    var names = Array.from(openWindows.keys());
    for (var i = 0; i < names.length; i++) {
      var inst = openWindows.get(names[i]);
      var pos = { left: inst.el.style.left, top: inst.el.style.top, z: inst.el.style.zIndex };
      closeWindow(names[i]);
      var fresh = openWindow(names[i], inst.payload);
      if (fresh) { fresh.style.left = pos.left; fresh.style.top = pos.top; fresh.style.zIndex = pos.z; }
    }
  }

  // ===========================================================================
  // Event delegation
  // ===========================================================================
  function hudAction(action) {
    switch (action) {
      case 'map': openWindow('map', {}); break;
      case 'tech': openWindow('tech', {}); break;
      case 'help': openWindow('help', {}); break;
      case 'settings': openWindow('menu', {}); break;
      case 'save': doSave(); break;
      case 'alt': if (F.render) F.render.altMode = !F.render.altMode; break;
    }
  }

  function doSave() {
    try {
      if (F.game && F.game.saveToSlot) { F.game.saveToSlot('quicksave'); toast(F.t('ui.saved')); return; }
      var s = F.save();
      try { window.localStorage.setItem('factio.save', s); } catch (err) { /* storage blocked */ }
      toast(F.t('ui.saved'));
    } catch (err) {
      F.log.error('F.ui: save', err);
      toast(F.t('ui.save_failed'));
    }
  }

  function findAncestor(target, selector) {
    var n = target;
    while (n && n.nodeType === 1) { if (n.matches(selector)) return n; n = n.parentNode; }
    return null;
  }

  function onRootMouseMove(ev) {
    mouse.x = ev.clientX; mouse.y = ev.clientY;
    if (dragging) {
      dragging.el.style.left = (ev.clientX - dragging.dx) + 'px';
      dragging.el.style.top = (ev.clientY - dragging.dy) + 'px';
      return;
    }
    if (tooltipEl.style.display === 'block') positionTooltip(mouse.x, mouse.y);
  }

  function onRootMouseOver(ev) {
    var slotEl = findAncestor(ev.target, '.f-slot');
    if (slotEl) {
      if (hoverTarget === slotEl) return;
      clearHover();
      hoverTarget = slotEl;
      hoverTimer = setTimeout(function () {
        var desc = slotDesc.get(slotEl);
        if (!desc) return;
        var stack = desc.inv[desc.index];
        if (stack) showTooltip(itemTooltipHtml(stack.id), mouse.x, mouse.y);
      }, 250);
      return;
    }
    var qEl = findAncestor(ev.target, '.f-qslot');
    if (qEl) {
      if (hoverTarget === qEl) return;
      clearHover();
      hoverTarget = qEl;
      hoverTimer = setTimeout(function () {
        var id = qEl.dataset.itemId;
        if (id) showTooltip(itemTooltipHtml(id), mouse.x, mouse.y);
      }, 250);
      return;
    }
    var alertEl2 = findAncestor(ev.target, '.f-alert');
    if (alertEl2 && hoverTarget !== alertEl2) { clearHover(); }
  }

  function onRootMouseOut(ev) {
    var toEl = ev.relatedTarget;
    if (hoverTarget && (!toEl || !hoverTarget.contains(toEl))) clearHover();
  }

  function clearHover() {
    if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }
    hoverTarget = null;
    hideTooltip();
  }

  function onRootMouseDown(ev) {
    var bar = findAncestor(ev.target, '.f-titlebar');
    if (bar && ev.button === 0) {
      var win = findAncestor(ev.target, '.f-window');
      if (win) {
        bringToFront(win);
        var rect = win.getBoundingClientRect();
        dragging = { el: win, dx: ev.clientX - rect.left, dy: ev.clientY - rect.top };
        ev.preventDefault();
      }
      return;
    }
    // middle-click quickbar clear
    if (ev.button === 1) {
      var q = findAncestor(ev.target, '.f-qslot');
      if (q && F.state && F.state.player) {
        F.state.player.quickbar[Number(q.dataset.qIndex)] = null;
        ev.preventDefault();
      }
    }
  }

  function onRootMouseUp() { dragging = null; }

  function quickbarLeftClick(index) {
    var p = F.state && F.state.player;
    if (!p) return;
    var id = p.quickbar[index];
    var cursor = getCursor();
    if (!id) {
      if (cursor) p.quickbar[index] = cursor.id; // assign link from cursor (GDD §9.2)
      return;
    }
    if (cursor) giveToInventory(cursor.id, cursor.count);
    var have = F.player && F.player.count ? F.player.count(id) : F.inv.count(p.inv, id);
    if (have > 0) { F.inv.remove(p.inv, id, have); setCursor({ id: id, count: have }); }
    else setCursor(null);
  }

  function quickbarRightClick(index) {
    var p = F.state && F.state.player;
    if (!p) return;
    var id = p.quickbar[index];
    var cursor = getCursor();
    if (!cursor) {
      if (!id) return;
      var have = F.player && F.player.count ? F.player.count(id) : F.inv.count(p.inv, id);
      if (have <= 0) return;
      var half = Math.ceil(have / 2);
      F.inv.remove(p.inv, id, half);
      setCursor({ id: id, count: half });
    } else {
      F.inv.add(p.inv, cursor.id, 1);
      cursor.count -= 1;
      setCursor(cursor.count > 0 ? cursor : null);
    }
  }

  function onRootClick(ev) {
    var hudBtn = findAncestor(ev.target, '[data-hud-action]');
    if (hudBtn) { hudAction(hudBtn.dataset.hudAction); return; }

    var closeBtn = findAncestor(ev.target, '[data-f-close]');
    if (closeBtn) {
      var win = findAncestor(ev.target, '.f-window');
      if (win && win.dataset.fWindow) closeWindow(win.dataset.fWindow);
      return;
    }

    var slotEl = findAncestor(ev.target, '.f-slot');
    if (slotEl) {
      var desc = slotDesc.get(slotEl);
      if (desc && !desc.opts.readonly) {
        if (ev.shiftKey) doShiftClick(desc.inv, desc.index, desc.opts);
        else if (ev.ctrlKey || ev.metaKey) doCtrlClick(desc.inv, desc.index, desc.opts);
        else doLeftClick(desc.inv, desc.index, desc.opts);
        refreshSlotVisual(desc);
      }
      return;
    }

    var qEl = findAncestor(ev.target, '.f-qslot');
    if (qEl) { quickbarLeftClick(Number(qEl.dataset.qIndex)); return; }

    var qi = findAncestor(ev.target, '.f-qitem');
    if (qi && F.player && F.player.cancelCraft) {
      F.player.cancelCraft(Number(qi.dataset.queueIndex));
      craftQueueEl.dataset.sig = ''; // force re-render next frame
      return;
    }
  }

  function onRootContextMenu(ev) {
    var slotEl = findAncestor(ev.target, '.f-slot');
    if (slotEl) {
      ev.preventDefault();
      var desc = slotDesc.get(slotEl);
      if (desc && !desc.opts.readonly) { doRightClick(desc.inv, desc.index, desc.opts); refreshSlotVisual(desc); }
      return;
    }
    var qEl = findAncestor(ev.target, '.f-qslot');
    if (qEl) { ev.preventDefault(); quickbarRightClick(Number(qEl.dataset.qIndex)); return; }
    var qi = findAncestor(ev.target, '.f-qitem');
    if (qi && F.player && F.player.cancelCraft) {
      ev.preventDefault();
      F.player.cancelCraft(Number(qi.dataset.queueIndex)); // "cancel 5" not representable — see header assumptions
      craftQueueEl.dataset.sig = '';
      return;
    }
  }

  function onRootDragStart(ev) {
    var slotEl = findAncestor(ev.target, '.f-slot[data-item-id]');
    if (slotEl && ev.dataTransfer) { ev.dataTransfer.setData('text/plain', slotEl.dataset.itemId); ev.dataTransfer.effectAllowed = 'copy'; }
  }
  function onRootDragOver(ev) {
    if (findAncestor(ev.target, '.f-qslot')) ev.preventDefault();
  }
  function onRootDrop(ev) {
    var qEl = findAncestor(ev.target, '.f-qslot');
    if (qEl && ev.dataTransfer) {
      var id = ev.dataTransfer.getData('text/plain');
      if (id && F.state && F.state.player) { F.state.player.quickbar[Number(qEl.dataset.qIndex)] = id; ev.preventDefault(); }
    }
  }

  // ===========================================================================
  // Public: init / update
  // ===========================================================================
  function init() {
    if (HEADLESS) return;
    if (inited) return;
    root = document.getElementById('ui');
    if (!root) { F.log.error('F.ui.init: #ui not found'); return; }
    injectCss();

    windowsLayer = el('div', '', root);
    buildHud();
    tooltipEl = el('div', 'f-tooltip', root);
    tooltipEl.style.display = 'none';
    cursorEl = el('div', 'f-cursor', root);
    cursorEl.appendChild(iconEl(null, 32));
    var ccount = el('div', 'f-count', cursorEl);
    show(cursorEl, false);
    toastLayer = el('div', 'f-toast-layer', root);

    root.addEventListener('mousemove', onRootMouseMove);
    root.addEventListener('mouseover', onRootMouseOver);
    root.addEventListener('mouseout', onRootMouseOut);
    root.addEventListener('mousedown', onRootMouseDown);
    root.addEventListener('mouseup', onRootMouseUp);
    root.addEventListener('click', onRootClick);
    root.addEventListener('contextmenu', onRootContextMenu);
    root.addEventListener('dragstart', onRootDragStart);
    root.addEventListener('dragover', onRootDragOver);
    root.addEventListener('drop', onRootDrop);
    window.addEventListener('mouseup', onRootMouseUp);

    F.events.on('lang:changed', onLangChanged);
    F.events.on('alert', onAlertEvent);
    F.events.on('entity:removed', function (e) {
      var inst = openWindows.get('entity');
      if (inst && inst.payload && inst.payload.entity === e) closeWindow('entity');
    });

    inited = true;
  }

  function update() {
    if (HEADLESS || !inited || !F.state) return;
    frame++;
    refreshTopLeft();
    refreshResearch();
    refreshQuickbar();
    refreshHpAndAmmo();
    refreshCraftQueue();
    refreshCursorStack();
    expireAlerts();
    renderAlerts();
    if (frame % 30 === 0) refreshMinimap();
    if (frame % 3 === 0) {
      pruneAndRefreshSlots();
      var names = Array.from(openWindows.keys());
      for (var i = 0; i < names.length; i++) {
        var inst = openWindows.get(names[i]);
        if (inst.factory.refresh) { try { inst.factory.refresh(inst.el, inst.payload); } catch (err) { F.log.error('window refresh', names[i], err); } }
      }
    }
  }

  // ===========================================================================
  // Export
  // ===========================================================================
  F.ui = {
    enabled: !HEADLESS,
    windows: windowRegistry,
    init: init,
    update: update,
    open: openWindow,
    close: closeWindow,
    closeAll: closeAllWindows,
    isOpen: isOpen,
    listOpen: listOpen,
    topWindow: topWindow,
    registerWindow: registerWindow,
    registerEntityGUI: registerEntityGUI,
    windowFrame: windowFrame,
    toast: toast,
    alert: alertFn,
    tooltip: showTooltip,
    hideTooltip: hideTooltip,
    slot: makeSlot,
    confirm: confirmDialog,
    progressBar: progressBar,
    iconEl: iconEl,
    itemTooltipHtml: itemTooltipHtml,
    statusColor: statusColor,
  };
})();
