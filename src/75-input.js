// 75-input.js — keyboard/mouse handling, placement cursor, drag placing, hotkeys.
// See design/ARCHITECTURE.md §17 and GDD.md §9.11 (placement/drag), §9.12 (key bindings),
// §9.2/9.3 (quickbar / cursor semantics), §3 (reach, mining).
//
// Defines F.input:
//   F.input.init(canvas)                          — binds keyboard/mouse (guarded, HEADLESS no-op)
//   F.input.state = { mx, my, mine, shoot, aimAt } — consumed by F.player.tick(input) every sim tick
//   F.input.preview = { type, tx, ty, dir, ok, reason } — placement preview, recomputed every frame
//   F.input.hover                                  — entity under the cursor (or null)
//   F.input.mining                                  — mirror of F.state.player.mining, for the renderer
//   F.input.worldCursor() -> [tx,ty]                — hovered tile (integers)
//   F.input.screenCursor() -> [px,py]               — mouse position in canvas pixels
//   F.input.frame()                                 — recompute preview/hover/mining (idempotent;
//                                                      called by our own rAF loop and safe to call
//                                                      again from 61-render.js/80-game.js if they want to)
//
// Headless contract: this module must NEVER touch document/canvas/addEventListener/rAF at load
// time. F.input.init() is only ever called by 80-game.js's F.boot() when !window.HEADLESS, so all
// DOM/event wiring happens lazily inside init(). The exported state objects are plain data and are
// safe to read (and, for tests, to write directly) even when init() was never called.
(function () {
  'use strict';

  var input = {};
  F.input = input;

  // -----------------------------------------------------------------------
  // i18n — this module's own user-facing strings (toasts). Module # >= 10,
  // F.i18n already exists at load time (02-i18n.js loads first).
  // -----------------------------------------------------------------------

  F.i18n.add('en', {
    'input.saved': 'Game saved',
    'input.too_far': 'Too far',
    'input.inventory_full': 'Inventory is full',
  });

  // =========================================================================
  // Public, always-present state (plain data; readable/writable even headless
  // so tests may drive F.player.tick(F.input.state) directly per ARCHITECTURE §14).
  // =========================================================================
  input.state = { mx: 0, my: 0, mine: null, shoot: false, aimAt: null };
  input.preview = { type: null, tx: 0, ty: 0, dir: 0, ok: false, reason: null };
  input.hover = null;
  input.mining = null;

  // =========================================================================
  // Internal (DOM-bound) state — only touched after init().
  // =========================================================================
  var canvasEl = null;
  var mouse = { x: 0, y: 0 };
  var keysDown = Object.create(null);   // lowercase key -> bool, for WASD/arrows
  var leftDown = false, rightDown = false;
  var spaceDown = false, cDown = false;
  var cursorDirByType = Object.create(null); // remembered rotation per placeable item type
  var windowStack = [];                 // names this module opened, for Esc to unwind
  var dragging = null;                  // active drag-placement session, or null
  var rafId = null;

  var hoverTx = 0, hoverTy = 0;         // last computed hovered tile (integers)
  var hoverWx = 0, hoverWy = 0;         // last computed hovered tile (continuous / float)

  // =========================================================================
  // Small helpers
  // =========================================================================

  function textFocused() {
    try {
      var el = document.activeElement;
      if (!el) return false;
      var tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!el.isContentEditable;
    } catch (e) { return false; }
  }

  // direction of movement from (x0,y0) to (x1,y1), snapped to the dominant axis (0=N,1=E,2=S,3=W).
  function dirFromDelta(dx, dy) {
    if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 1 : 3;
    return dy >= 0 ? 2 : 0;
  }

  // integer tile line from (x0,y0) to (x1,y1) inclusive (Bresenham).
  function tileLine(x0, y0, x1, y1) {
    var pts = [];
    var dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    var sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    var err = dx + dy, x = x0, y = y0, guard = 0;
    while (true) {
      pts.push([x, y]);
      if ((x === x1 && y === y1) || ++guard > 4096) break;
      var e2 = 2 * err;
      if (e2 >= dy) { err += dy; x += sx; }
      if (e2 <= dx) { err += dx; y += sy; }
    }
    return pts;
  }

  // Anchor rule (GDD §9.11 / task spec): per axis, an odd footprint dimension
  // centres on the hovered tile (floor of the continuous cursor position);
  // an even dimension snaps to the nearest tile corner (round of the
  // continuous position), matching Factorio's odd/even placement convention.
  function computeAnchor(wx, wy, w, h) {
    var tx0 = (w % 2 === 1) ? (Math.floor(wx) - (w - 1) / 2) : (Math.round(wx) - w / 2);
    var ty0 = (h % 2 === 1) ? (Math.floor(wy) - (h - 1) / 2) : (Math.round(wy) - h / 2);
    return [tx0, ty0];
  }

  function getPlayer() { return F.state && F.state.player; }
  function getCursor() { var p = getPlayer(); return p ? p.cursor : null; }

  // =========================================================================
  // Per-frame recomputation: hover entity, mining mirror, placement preview,
  // and (while a drag is active) stepping the drag path.
  // =========================================================================
  function computeMineTarget() {
    input.state.mine = null;
    if (!rightDown) return;
    if (textFocused()) return;
    if (!F.player || !F.player.inReach || !F.player.inReach(hoverTx, hoverTy)) return;
    var hasTarget = false;
    try {
      if (F.world.resource(hoverTx, hoverTy)) hasTarget = true;
      else if (F.world.feature(hoverTx, hoverTy)) hasTarget = true;
      else if (F.world.entityAt(hoverTx, hoverTy)) hasTarget = true;
    } catch (e) { F.log.warn('[input] mine target check failed', e); }
    if (hasTarget) input.state.mine = [hoverTx, hoverTy];
  }

  function computePreview() {
    var cursor = getCursor();
    if (!cursor) { input.preview.type = null; input.preview.ok = false; input.preview.reason = null; return; }
    var itemDef = F.data.items[cursor.id];
    if (!itemDef || !itemDef.place) { input.preview.type = null; input.preview.ok = false; input.preview.reason = null; return; }
    var type = itemDef.place;
    var def = F.data.entities[type];
    if (!def) { input.preview.type = null; return; }
    var dir = def.rotatable ? (cursorDirByType[type] || 0) : 0;
    var fp = F.entities.footprint(def, dir);
    var anchor = computeAnchor(hoverWx, hoverWy, fp[0], fp[1]);
    var tx = anchor[0], ty = anchor[1];
    var chk = { ok: false, reason: null };
    try {
      chk = F.api.canPlace(type, tx, ty, dir, { checkReach: true }) || chk;
    } catch (e) { F.log.warn('[input] canPlace threw', e); }
    input.preview.type = type;
    input.preview.tx = tx; input.preview.ty = ty; input.preview.dir = dir;
    input.preview.ok = !!chk.ok; input.preview.reason = chk.reason || null;
  }

  input.frame = function () {
    if (!F.state) return; // no game running yet
    var wx = hoverWx, wy = hoverWy;
    if (F.camera && F.camera.toWorld) {
      try { var w = F.camera.toWorld(mouse.x, mouse.y); wx = w[0]; wy = w[1]; } catch (e) { /* camera not ready */ }
    }
    hoverWx = wx; hoverWy = wy;
    hoverTx = Math.floor(wx); hoverTy = Math.floor(wy);

    input.hover = (F.world && F.world.entityAt) ? F.world.entityAt(hoverTx, hoverTy) : null;
    var p = getPlayer();
    input.mining = p ? (p.mining || null) : null;

    computeMineTarget();
    computePreview();

    if (dragging && leftDown) stepDrag();
  };

  // =========================================================================
  // Drag placement (GDD §9.11): belts auto-turn along the mouse path; poles
  // space themselves at max wire reach; walls/pipes/other placeable entities
  // chain along every tile the path touches, skipping collisions.
  // =========================================================================
  function beginDrag(type) {
    var def = F.data.entities[type];
    dragging = {
      type: type,
      def: def,
      beltLike: def.behaviour === 'belt' || def.behaviour === 'underground' || def.behaviour === 'splitter',
      poleLike: def.behaviour === 'pole',
      chainLike: def.behaviour === 'wall' || def.behaviour === 'pipe',
      visited: Object.create(null),
      lastRaw: null,
      lastPole: null,
    };
    placeAttempt(hoverTx, hoverTy, null, null);
    if (dragging) dragging.lastRaw = [hoverTx, hoverTy]; // placeAttempt ends the drag when the hand/inventory runs out
  }

  function stepDrag() {
    if (dragging.lastRaw && dragging.lastRaw[0] === hoverTx && dragging.lastRaw[1] === hoverTy) return;
    var from = dragging.lastRaw || [hoverTx, hoverTy];
    var line = tileLine(from[0], from[1], hoverTx, hoverTy);
    var prev = dragging.lastRaw;
    for (var i = 0; i < line.length; i++) {
      if (!dragging) return; // drag may have ended mid-loop (inventory exhausted)
      var t = line[i];
      placeAttempt(t[0], t[1], prev ? prev[0] : null, prev ? prev[1] : null);
      prev = t;
    }
    if (dragging) dragging.lastRaw = [hoverTx, hoverTy];
  }

  function placeAttempt(tx, ty, prevTx, prevTy) {
    if (!dragging) return;
    var key = tx + ',' + ty;
    if (dragging.visited[key]) return;
    dragging.visited[key] = true;

    var type = dragging.type, def = dragging.def;
    var placed = null;

    if (dragging.beltLike) {
      var dir = cursorDirByType[type] || 0;
      if (prevTx != null && (tx !== prevTx || ty !== prevTy)) {
        dir = dirFromDelta(tx - prevTx, ty - prevTy);
        // Factorio-style drag: the belt we are leaving turns to face the drag direction
        // (covers the first belt of a drag and corners, including drags started on an existing belt).
        try {
          var pe = F.world.entityAt(prevTx, prevTy);
          if (pe && pe.type === type && pe.dir !== dir && dragging.visited[prevTx + ',' + prevTy] && def.behaviour === 'belt') {
            pe.dir = dir;
            if (F.belts && F.belts.onRotate) F.belts.onRotate(pe);
            if (F.belts && F.belts.markDirty) F.belts.markDirty(prevTx, prevTy);
            if (F.render && F.render.invalidateChunk && F.world.chunkOf) { var cc = F.world.chunkOf(prevTx, prevTy); F.render.invalidateChunk(cc[0], cc[1]); }
          }
        } catch (e) { F.log.warn('[input] belt re-orientation failed', e); }
      }
      placed = safePlace(type, tx, ty, dir);
    } else if (dragging.poleLike) {
      var reach = (def.pole && def.pole.reach) || 5;
      if (!dragging.lastPole || Math.hypot(tx - dragging.lastPole[0], ty - dragging.lastPole[1]) >= reach) {
        placed = safePlace(type, tx, ty, 0);
        if (placed) dragging.lastPole = [tx, ty];
      }
    } else if (dragging.chainLike) {
      placed = safePlace(type, tx, ty, 0);
    } else {
      // Generic entities: fit the footprint using the same anchor rule as the
      // single-click preview, skip tiles where it doesn't fit (no overlap).
      var dir2 = def.rotatable ? (cursorDirByType[type] || 0) : 0;
      var fp = F.entities.footprint(def, dir2);
      var anchor = computeAnchor(tx + 0.5, ty + 0.5, fp[0], fp[1]);
      placed = safePlace(type, anchor[0], anchor[1], dir2);
    }

    if (placed) {
      if (remainingOf(type) <= 0) dragging = null; // stops the drag when the hand and the inventory are empty
    }
  }

  // The cursor "hand" is a real stack taken out of the inventory (quickbar / pipette / slot clicks),
  // so placement consumes from the cursor first and only falls back to the inventory.
  function cursorHolds(type) {
    var p = getPlayer();
    return !!(p && p.cursor && p.cursor.id === type && p.cursor.count > 0);
  }
  function safePlace(type, tx, ty, dir) {
    try {
      var chk = F.api.canPlace(type, tx, ty, dir);
      if (!chk || !chk.ok) return null;
      if (cursorHolds(type)) {
        var placedFromHand = F.api.place(type, tx, ty, dir, { fromInventory: false });
        if (placedFromHand) shrinkCursor(1);
        return placedFromHand;
      }
      return F.api.place(type, tx, ty, dir, { fromInventory: true });
    } catch (e) { F.log.warn('[input] place failed', type, tx, ty, dir, e); return null; }
  }
  function remainingOf(type) {
    var p = getPlayer();
    var n = (p && p.cursor && p.cursor.id === type) ? p.cursor.count : 0;
    try { n += F.api.inventoryCount(type); } catch (e) { /* ignore */ }
    return n;
  }

  // Consume one unit from the cursor "hand" stack (drag placement above deducts
  // straight from the player inventory via F.api.place's fromInventory option;
  // this keeps the cursor's own displayed count — a UI-only mirror — in sync).
  function shrinkCursor(n) {
    var p = getPlayer();
    if (!p || !p.cursor) return;
    p.cursor.count -= (n || 1);
    if (p.cursor.count <= 0) p.cursor = null;
  }

  // =========================================================================
  // Left click: place / open entity GUI / pick up ground item.
  // =========================================================================
  function handleLeftDown() {
    if (textFocused()) return;
    input.frame();
    var cursor = getCursor();
    if (cursor && input.preview.type) {
      beginDrag(input.preview.type);
      return;
    }
    if (input.hover) {
      if (F.ui && F.ui.open) { F.ui.open('entity', input.hover); windowStack.push('entity'); }
      return;
    }
    tryPickupGround(hoverTx, hoverTy);
  }

  function handleLeftUp() {
    dragging = null;
  }

  function tryPickupGround(tx, ty) {
    if (!F.player || !F.player.inReach || !F.player.inReach(tx, ty)) return false;
    var g = F.ground.at(tx, ty);
    if (!g) return false;
    var taken = F.ground.take(tx, ty);
    if (!taken) return false;
    if (F.player.giveOrDrop) F.player.giveOrDrop(taken.id, taken.count);
    else if (F.player.give) {
      var leftover = F.player.give(taken.id, taken.count);
      if (leftover > 0) F.ground.drop(tx, ty, taken.id, leftover);
    }
    return true;
  }

  // F: pick up ground items within 1 tile of the player.
  function pickupNearby() {
    var p = getPlayer();
    if (!p) return;
    var cx = Math.floor(p.x), cy = Math.floor(p.y);
    for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) tryPickupGround(cx + dx, cy + dy);
  }

  // =========================================================================
  // R / Shift+R: rotate cursor item (remembered per type) or hovered entity.
  // =========================================================================
  function nextAllowedDir(list, cur, ccw) {
    var idx = list.indexOf(cur);
    if (idx < 0) idx = 0;
    idx = (idx + (ccw ? -1 : 1) + list.length) % list.length;
    return list[idx];
  }

  function rotate(ccw) {
    var cursor = getCursor();
    if (cursor) {
      var itemDef = F.data.items[cursor.id];
      var type = itemDef && itemDef.place;
      var def = type && F.data.entities[type];
      if (def && def.rotatable) {
        var cur = cursorDirByType[type] || 0;
        cursorDirByType[type] = def.allowedDirs ? nextAllowedDir(def.allowedDirs, cur, ccw) : F.util.rotDir(cur, ccw ? -1 : 1);
      }
      return;
    }
    if (input.hover && F.api.rotate) F.api.rotate(input.hover.x, input.hover.y);
  }

  // =========================================================================
  // Q: pipette / clear cursor.
  // =========================================================================
  function pipette() {
    var p = getPlayer();
    if (!p) return;
    if (p.cursor) {
      if (F.player.giveOrDrop) F.player.giveOrDrop(p.cursor.id, p.cursor.count);
      p.cursor = null;
      return;
    }
    var hov = input.hover;
    if (hov) {
      var def = F.data.entities[hov.type];
      var itemId = def && def.minable;
      if (itemId && F.player.count && F.player.count(itemId) > 0) {
        var cnt = F.player.count(itemId);
        var taken = F.player.take(itemId, cnt);
        if (taken > 0) { p.cursor = { id: itemId, count: taken }; cursorDirByType[itemId] = hov.dir || 0; }
      }
      return;
    }
    // Empty ground tile with an ore patch: pipette a mining drill (electric preferred).
    var res = F.world.resource(hoverTx, hoverTy);
    if (res) {
      var pick = null;
      if (F.player.count && F.player.count('electric-mining-drill') > 0) pick = 'electric-mining-drill';
      else if (F.player.count && F.player.count('burner-mining-drill') > 0) pick = 'burner-mining-drill';
      if (pick) {
        var c = F.player.count(pick);
        var t = F.player.take(pick, c);
        if (t > 0) p.cursor = { id: pick, count: t };
      }
    }
  }

  // =========================================================================
  // Z: drop one item from the cursor onto the ground / belt at the cursor.
  // =========================================================================
  function dropOne() {
    var p = getPlayer();
    if (!p || !p.cursor) return;
    if (!F.player.inReach || !F.player.inReach(hoverTx, hoverTy)) return;
    var ent = F.world.entityAt(hoverTx, hoverTy);
    var placed = false;
    if (ent && F.belts && F.belts.isBeltLike && F.belts.isBeltLike(ent)) {
      if (F.belts.canInsert(ent, 1, 128) && F.belts.insert(ent, 1, 128, p.cursor.id)) placed = true;
      else if (F.belts.canInsert(ent, 0, 128) && F.belts.insert(ent, 0, 128, p.cursor.id)) placed = true;
    }
    if (!placed) {
      var leftover = F.ground.drop(hoverTx, hoverTy, p.cursor.id, 1);
      placed = leftover < 1;
    }
    if (placed) shrinkCursor(1);
  }

  // =========================================================================
  // Window toggling (E/T/M/H/F1) and Esc.
  // =========================================================================
  function toggleWindow(name) {
    if (!F.ui) return;
    if (F.ui.isOpen(name)) {
      F.ui.close(name);
      var i = windowStack.lastIndexOf(name);
      if (i >= 0) windowStack.splice(i, 1);
    } else {
      F.ui.open(name);
      windowStack.push(name);
    }
  }

  var KNOWN_WINDOWS = ['entity', 'inventory', 'tech', 'help', 'map', 'menu', 'death'];
  function onEscape() {
    if (!F.ui) return;
    for (var i = windowStack.length - 1; i >= 0; i--) {
      var name = windowStack[i];
      if (F.ui.isOpen(name)) { F.ui.close(name); windowStack.splice(i, 1); return; }
      windowStack.splice(i, 1);
    }
    for (var j = 0; j < KNOWN_WINDOWS.length; j++) {
      if (F.ui.isOpen(KNOWN_WINDOWS[j])) { F.ui.close(KNOWN_WINDOWS[j]); return; }
    }
    F.ui.open('menu'); windowStack.push('menu');
  }

  // =========================================================================
  // 1-0: quickbar select/put.
  // =========================================================================
  function digitIndex(k) { return k === '0' ? 9 : (k.charCodeAt(0) - '1'.charCodeAt(0)); }

  function quickbarPress(idx) {
    var p = getPlayer();
    if (!p || !p.quickbar || idx < 0 || idx >= p.quickbar.length) return;
    if (p.cursor) {
      if (F.player.giveOrDrop) F.player.giveOrDrop(p.cursor.id, p.cursor.count);
      p.cursor = null;
      return;
    }
    var itemId = p.quickbar[idx];
    if (!itemId || !F.player.count) return;
    var count = F.player.count(itemId);
    if (count <= 0) return;
    var taken = F.player.take(itemId, count);
    if (taken > 0) p.cursor = { id: itemId, count: taken };
  }

  // =========================================================================
  // Alt-mode, zoom, save.
  // =========================================================================
  function toggleAlt() { if (F.render) F.render.altMode = !F.render.altMode; }

  function zoomBy(steps) {
    if (!F.camera || !F.camera.toWorld) return;
    var factor = Math.pow(1.1, steps);
    var before = F.camera.toWorld(mouse.x, mouse.y);
    F.camera.zoom = F.util.clamp((F.camera.zoom || 1) * factor, 0.5, 2.5);
    var after = F.camera.toWorld(mouse.x, mouse.y);
    F.camera.x += (before[0] - after[0]);
    F.camera.y += (before[1] - after[1]);
  }

  function quickSave() {
    try {
      if (F.game && F.game.saveToSlot) F.game.saveToSlot('quicksave');
      else if (F.save) {
        var s = F.save();
        try { if (typeof localStorage !== 'undefined') localStorage.setItem('factio.save', s); } catch (e2) { /* private mode */ }
      }
      if (F.ui && F.ui.toast) F.ui.toast(F.t('input.saved'));
    } catch (e) { F.log.warn('[input] quickSave failed', e); }
  }

  function updateShoot() {
    // F.FEATURES.combat off (src/disabled/README.md): Space/C never set the
    // shoot input flag, so F.player.shootTick always sees shoot=false.
    if (!F.FEATURES || !F.FEATURES.combat) { input.state.shoot = false; input.state.aimAt = null; return; }
    input.state.shoot = spaceDown || cDown;
    // 'aimAt' is a Factio-local extension of the {mx,my,mine,shoot} contract (ARCHITECTURE §14/§17
    // only names those four fields): C aims at the world cursor tile, Space aims at the nearest
    // enemy (F.player.tick should fall back to nearest-enemy targeting when aimAt is null).
    input.state.aimAt = cDown ? [hoverTx, hoverTy] : null;
  }

  // =========================================================================
  // Movement axis (WASD / arrows) — recomputed from held-key state on every
  // keydown/keyup so F.player.tick always reads the live value.
  // =========================================================================
  function updateMoveAxis() {
    var mx = 0, my = 0;
    if (keysDown['a'] || keysDown['arrowleft']) mx -= 1;
    if (keysDown['d'] || keysDown['arrowright']) mx += 1;
    if (keysDown['w'] || keysDown['arrowup']) my -= 1;
    if (keysDown['s'] || keysDown['arrowdown']) my += 1;
    input.state.mx = F.util.clamp(mx, -1, 1);
    input.state.my = F.util.clamp(my, -1, 1);
  }

  var MOVE_KEYS = { 'w': 1, 'a': 1, 's': 1, 'd': 1, 'arrowup': 1, 'arrowdown': 1, 'arrowleft': 1, 'arrowright': 1 };

  // =========================================================================
  // DOM event wiring (lazy — only reached from init(), never at load time).
  // =========================================================================
  function onKeyDown(e) {
    if (textFocused()) return;
    var key = e.key;
    var lower = key.length === 1 ? key.toLowerCase() : key.toLowerCase();

    if ((e.ctrlKey || e.metaKey) && lower === 's') { e.preventDefault(); quickSave(); return; }

    if (MOVE_KEYS[lower]) {
      keysDown[lower] = true; updateMoveAxis();
      if (lower.indexOf('arrow') === 0) e.preventDefault();
      return;
    }
    if (e.repeat) return; // one-shot actions below don't auto-repeat

    switch (lower) {
      case 'r': rotate(e.shiftKey); e.preventDefault(); break;
      case 'q': pipette(); break;
      case 'e': toggleWindow('inventory'); break;
      case 't': toggleWindow('tech'); break;
      case 'm': toggleWindow('map'); break;
      case 'h': case 'f1': toggleWindow('help'); e.preventDefault(); break;
      case 'f': pickupNearby(); break;
      case 'z': dropOne(); break;
      case 'alt': toggleAlt(); e.preventDefault(); break;
      case 'escape': onEscape(); break;
      case ' ': case 'spacebar': spaceDown = true; updateShoot(); e.preventDefault(); break;
      case 'c': cDown = true; updateShoot(); break;
      default: {
        var digit = (key.length === 1 && key >= '0' && key <= '9') ? key : (/^Digit[0-9]$/.test(e.code || '') ? e.code.slice(5) : null);
        if (digit !== null) quickbarPress(digitIndex(digit));
        break;
      }
    }
  }

  function onKeyUp(e) {
    var key = e.key;
    var lower = key.length === 1 ? key.toLowerCase() : key.toLowerCase();
    if (MOVE_KEYS[lower]) { keysDown[lower] = false; updateMoveAxis(); return; }
    if (lower === ' ' || lower === 'spacebar') { spaceDown = false; updateShoot(); return; }
    if (lower === 'c') { cDown = false; updateShoot(); return; }
  }

  function updateMouseFromEvent(e) {
    if (!canvasEl) return;
    var rect = canvasEl.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
  }

  function onMouseMove(e) { updateMouseFromEvent(e); }

  function onMouseDown(e) {
    updateMouseFromEvent(e);
    if (e.button === 0) { leftDown = true; handleLeftDown(); }
    else if (e.button === 2) { rightDown = true; }
  }

  function onMouseUp(e) {
    if (e.button === 0) { leftDown = false; handleLeftUp(); }
    else if (e.button === 2) { rightDown = false; }
  }

  function onWheel(e) {
    e.preventDefault();
    zoomBy(e.deltaY < 0 ? 1 : -1);
  }

  function onContextMenu(e) { e.preventDefault(); }

  function onBlur() {
    keysDown = Object.create(null);
    leftDown = false; rightDown = false; spaceDown = false; cDown = false;
    dragging = null;
    updateMoveAxis(); updateShoot();
    input.state.mine = null;
  }

  function rafLoop() {
    input.frame();
    rafId = window.requestAnimationFrame(rafLoop);
  }

  // =========================================================================
  // Public: F.input.init(canvas)
  // =========================================================================
  input.init = function (canvas) {
    if (window.HEADLESS) return; // headless contract: no DOM/rAF/listeners
    if (typeof document === 'undefined') return;
    canvasEl = canvas || (document.getElementById && document.getElementById('game')) || null;

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    if (canvasEl) {
      canvasEl.addEventListener('mousemove', onMouseMove);
      canvasEl.addEventListener('mousedown', onMouseDown);
      canvasEl.addEventListener('wheel', onWheel, { passive: false });
      canvasEl.addEventListener('contextmenu', onContextMenu);
    }
    // mouseup on window so a drag/mine ends even if the cursor left the canvas.
    window.addEventListener('mouseup', onMouseUp);

    if (rafId == null) rafId = window.requestAnimationFrame(rafLoop);
  };

  // =========================================================================
  // Public helpers (usable headless too — they just read the last computed values).
  // =========================================================================
  input.worldCursor = function () { return [hoverTx, hoverTy]; };
  input.screenCursor = function () { return [mouse.x, mouse.y]; };
  input.isDragging = function () { return !!dragging; };
})();
