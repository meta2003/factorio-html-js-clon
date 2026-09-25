// 75-input.js — keyboard/mouse handling, placement cursor, drag placing, hotkeys.
// See design/ARCHITECTURE.md §17 and GDD.md §9.11 (placement/drag), §9.12 (key bindings),
// §9.2/9.3 (quickbar / cursor semantics), §3 (reach, mining).
//
// Defines F.input:
//   F.input.init(canvas)                          — binds keyboard/mouse (guarded, HEADLESS no-op)
//   F.input.state = { mx, my, mine, shoot, aimAt } — consumed by F.player.tick(input) every sim tick
//   F.input.preview = { type, tx, ty, dir, ok, reason, virtual, previewDraw } — placement preview,
//                                                      recomputed every frame. `virtual`/`previewDraw`
//                                                      are set for virtual placer items (design/
//                                                      EXPANSION.md §6.4/§6.6) — see this module's
//                                                      final report for what 61-render.js should do
//                                                      with them.
//   F.input.hover                                  — entity under the cursor (or null)
//   F.input.mining                                  — mirror of F.state.player.mining (grid mining),
//                                                      or a picker-mining progress record in the same
//                                                      {tx,ty,progress} shape (design/EXPANSION.md §6.6)
//   F.input.worldCursor() -> [tx,ty]                — hovered tile (integers)
//   F.input.screenCursor() -> [px,py]               — mouse position in canvas pixels
//   F.input.frame()                                 — recompute preview/hover/mining (idempotent;
//                                                      called by our own rAF loop and safe to call
//                                                      again from 61-render.js/80-game.js if they want to)
//   F.input.addKey(key, fn(ev)->bool)               — extra hotkey, consulted before the built-in
//                                                      switch (design/EXPANSION.md §6.6)
//   F.input.addDragKind(behaviour, 'line')          — extra drag-placement kind (rails)
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
  // `virtual`/`previewDraw` are a Factio-local extension for virtual placers
  // (design/EXPANSION.md §6.4/§6.6, e.g. locomotives/wagons): when true, `type`
  // is an item id (not an F.data.entities type) placed via F.api.placeVirtual,
  // footprint is always 1x1, and `previewDraw` — when the placer exposed one —
  // is the ghost-drawing function 61-render.js should call instead of its
  // normal sprite-tint preview. See this module's final report for exactly
  // what 61-render.js needs to do with these two fields.
  input.preview = { type: null, tx: 0, ty: 0, dir: 0, ok: false, reason: null, virtual: false, previewDraw: null, ghost: false };
  input.hover = null;
  input.mining = null;
  // Ghost cursor (51-ghosts.js): an item id held "as a ghost" when the player has none of it
  // (pipette / quickbar on an item not in the inventory). Clicking places ghosts. Not saved.
  input.ghostCursor = null;
  // Blueprints (52-blueprints.js). `selecting` = copy tool active: { start: [tx,ty]|null,
  // end: [tx,ty]|null } while dragging a box. `blueprint` = a blueprint held for pasting:
  // { bp }, with its top-left tile under the cursor in `blueprintAnchor`. Not saved.
  input.selecting = null;
  input.blueprint = null;
  input.blueprintAnchor = null;

  // =========================================================================
  // Internal (DOM-bound) state — only touched after init().
  // =========================================================================
  var canvasEl = null;
  var mouse = { x: 0, y: 0 };
  var keysDown = Object.create(null);   // lowercase key -> bool, for WASD/arrows
  var leftDown = false, rightDown = false;
  var spaceDown = false, cDown = false;
  var shiftDown = false;                // Shift+click plans ghosts instead of building
  var cursorDirByType = Object.create(null); // remembered rotation per placeable item type
  var windowStack = [];                 // names this module opened, for Esc to unwind
  var dragging = null;                  // active drag-placement session, or null
  var rafId = null;

  var hoverTx = 0, hoverTy = 0;         // last computed hovered tile (integers)
  var hoverWx = 0, hoverWy = 0;         // last computed hovered tile (continuous / float)
  var pickerMineState = null;           // { key, startMs, mineTime } — right-click-hold mining of an F.api.addPicker() result

  // =========================================================================
  // Expansion registries (design/EXPANSION.md §6.6). Feature modules
  // (src/37-oil.js, 38-trains.js, 39-robots.js, 45-rocket.js) load BEFORE
  // this file (filename order 37/38/39/45 < 75), so F.input does not exist
  // yet at their load time. They therefore register directly onto plain F.*
  // objects (created with `X = X || {}` so whoever runs first wins the
  // creation), and F.input.addKey()/addDragKind() below are sugar over the
  // same objects for anything that registers after this file has run. See
  // the exact snippet appended to design/EXPANSION.md §6.6.
  //   F._inputKeys: lowercase key -> [fn(ev)->bool, ...], consulted before
  //     the built-in switch in onKeyDown (first handler to return true wins).
  //   F._dragKinds: entity behaviour -> 'line' (place along the drag path,
  //     no rotation logic — like walls/pipes; rails use this).
  // =========================================================================
  F._inputKeys = F._inputKeys || {};
  F._dragKinds = F._dragKinds || {};
  function addKey(key, fn) {
    if (!key || typeof fn !== 'function') { F.log.warn('F.input.addKey: invalid args', key); return; }
    var k = String(key).toLowerCase();
    (F._inputKeys[k] = F._inputKeys[k] || []).push(fn);
  }
  function addDragKind(behaviour, kind) {
    if (!behaviour) return;
    F._dragKinds[behaviour] = kind;
  }

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
  // Right-click-hold mining of an F.api.addPicker() result (design/EXPANSION.md
  // §6.4/§6.6): pickers are consulted BEFORE grid entities, so a picker that
  // claims this world position (even one with no `.mine`) fully replaces the
  // grid-entity/resource mine check below for this tile. Progress is tracked
  // in real time here (this module's own rAF-driven state) rather than via
  // F.state.player.mining, since F.player.tick only knows about tile-grid
  // targets — but the result is written into F.input.mining in the exact same
  // {tx,ty,progress} shape so 61-render.js's existing mining-ring drawer just
  // works for pickers too, unchanged.
  function computePickerMine() {
    if (!F.api || typeof F.api.pickAt !== 'function') return false;
    var p;
    try { p = F.api.pickAt(hoverWx, hoverWy); } catch (err) { p = null; F.log.warn('[input] F.api.pickAt threw', err); }
    if (!p) return false;
    if (typeof p.mine !== 'function') { pickerMineState = null; return true; } // picker owns this tile, but isn't minable
    var key = hoverTx + ',' + hoverTy;
    var need = (p.mineTime != null) ? p.mineTime : 0.5;
    var now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    if (!pickerMineState || pickerMineState.key !== key) pickerMineState = { key: key, startMs: now, mineTime: need };
    var elapsedS = (now - pickerMineState.startMs) / 1000;
    input.mining = { tx: hoverTx, ty: hoverTy, progress: F.util.clamp(elapsedS / pickerMineState.mineTime, 0, 1) };
    if (elapsedS >= pickerMineState.mineTime) {
      try { p.mine(); } catch (err) { F.log.warn('[input] picker.mine failed', err); }
      pickerMineState = null;
      input.mining = null;
    }
    return true;
  }

  function computeMineTarget() {
    input.state.mine = null;
    if (!rightDown) { pickerMineState = null; lastCancelTile = null; return; }
    if (textFocused()) { pickerMineState = null; return; }
    if (cancelGhostsAlongDrag()) { pickerMineState = null; return; }
    if (!F.player || !F.player.inReach || !F.player.inReach(hoverTx, hoverTy)) { pickerMineState = null; return; }
    if (computePickerMine()) return;
    pickerMineState = null;
    var hasTarget = false;
    try {
      if (F.world.resource(hoverTx, hoverTy)) hasTarget = true;
      else if (F.world.feature(hoverTx, hoverTy)) hasTarget = true;
      else if (F.world.entityAt(hoverTx, hoverTy)) hasTarget = true;
    } catch (e) { F.log.warn('[input] mine target check failed', e); }
    if (hasTarget) input.state.mine = [hoverTx, hoverTy];
  }

  // Right mouse over a ghost cancels it instantly, at any distance. While the button
  // is held, every tile the cursor crossed since the last frame is swept too, so a
  // fast drag cancels a whole line of ghosts. Returns true if the hovered tile had one.
  var lastCancelTile = null;
  function cancelGhostsAlongDrag() {
    if (!F.ghosts) return false;
    var from = lastCancelTile || [hoverTx, hoverTy];
    lastCancelTile = [hoverTx, hoverTy];
    var line = tileLine(from[0], from[1], hoverTx, hoverTy);
    var hit = false;
    for (var i = 0; i < line.length; i++) {
      if (F.ghosts.removeAt(line[i][0], line[i][1]) && i === line.length - 1) hit = true;
    }
    return hit;
  }

  function clearPreview() {
    input.preview.type = null; input.preview.ok = false; input.preview.reason = null;
    input.preview.virtual = false; input.preview.previewDraw = null; input.preview.ghost = false;
  }

  // Virtual placer preview (design/EXPANSION.md §6.4/§6.6): the cursor item
  // has no F.data.entities def of its own (vehicles carry `vehicle: ...`, no
  // `place` — see EXPANSION.md §3) but IS registered via F.api.registerVirtual.
  // Footprint is always 1x1 (no computeAnchor odd/even logic needed); ok/red
  // comes from the placer's OWN canPlace(tx,ty,dir), not F.api.canPlace.
  function computeVirtualPreview(cursor) {
    if (!F.api || typeof F.api.getVirtual !== 'function') return false;
    var vdef;
    try { vdef = F.api.getVirtual(cursor.id); } catch (err) { vdef = null; }
    if (!vdef) return false;
    var dir = cursorDirByType[cursor.id] || 0;
    var tx = hoverTx, ty = hoverTy;
    var chk = { ok: false, reason: null };
    try { chk = (vdef.canPlace && vdef.canPlace(tx, ty, dir)) || chk; } catch (err) { F.log.warn('[input] virtual canPlace threw', err); }
    input.preview.type = cursor.id;
    input.preview.virtual = true;
    input.preview.tx = tx; input.preview.ty = ty; input.preview.dir = dir;
    input.preview.ok = !!chk.ok; input.preview.reason = chk.reason || null;
    input.preview.previewDraw = (typeof vdef.previewDraw === 'function') ? vdef.previewDraw : null;
    return true;
  }

  // Ghost planning is active when the hand holds a ghost cursor, or a real
  // placeable stack while Shift is held.
  function ghostMode(cursor) {
    if (!F.ghosts) return false;
    return cursor ? shiftDown : !!input.ghostCursor;
  }

  function computePreview() {
    var cursor = getCursor();
    if (cursor) { input.ghostCursor = null; input.selecting = null; input.blueprint = null; } // a real stack in hand replaces them
    input.blueprintAnchor = null;
    if (input.selecting) { clearPreview(); return; }
    if (input.blueprint) {
      clearPreview();
      var bp = input.blueprint.bp;
      input.blueprintAnchor = computeAnchor(hoverWx, hoverWy, bp.w, bp.h);
      return;
    }
    var itemId = cursor ? cursor.id : input.ghostCursor;
    if (!itemId) { clearPreview(); return; }
    var itemDef = F.data.items[itemId];
    if (itemDef && itemDef.place) {
      var type = itemDef.place;
      var def = F.data.entities[type];
      if (!def) { clearPreview(); return; }
      var ghost = ghostMode(cursor);
      input.preview.virtual = false;
      input.preview.previewDraw = null;
      input.preview.ghost = ghost;
      var dir = def.rotatable ? (cursorDirByType[type] || 0) : 0;
      var fp = F.entities.footprint(def, dir);
      var anchor = computeAnchor(hoverWx, hoverWy, fp[0], fp[1]);
      var tx = anchor[0], ty = anchor[1];
      var chk = { ok: false, reason: null };
      try {
        chk = (ghost ? F.ghosts.canPlace(type, tx, ty, dir) : F.api.canPlace(type, tx, ty, dir, { checkReach: true })) || chk;
      } catch (e) { F.log.warn('[input] canPlace threw', e); }
      input.preview.type = type;
      input.preview.tx = tx; input.preview.ty = ty; input.preview.dir = dir;
      input.preview.ok = !!chk.ok; input.preview.reason = chk.reason || null;
      return;
    }
    if (cursor && computeVirtualPreview(cursor)) { input.preview.ghost = false; return; }
    clearPreview();
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
    if (input.selecting && input.selecting.start && leftDown) input.selecting.end = [hoverTx, hoverTy];
  };

  // =========================================================================
  // Blueprints: Ctrl+C / B starts the copy tool (drag a box), Ctrl+V takes the
  // last copy back into the hand. While a blueprint is held: click pastes it as
  // ghosts, R / Shift+R rotates, Q or Esc drops it.
  // =========================================================================
  function emptyHand() {
    var p = getPlayer();
    if (p && p.cursor) {
      if (F.player.giveOrDrop) F.player.giveOrDrop(p.cursor.id, p.cursor.count);
      p.cursor = null;
    }
    input.ghostCursor = null;
    dragging = null;
  }

  function startCopyTool() {
    if (!F.blueprints) return;
    emptyHand();
    input.blueprint = null;
    input.selecting = { start: null, end: null };
  }

  function pasteClipboard() {
    if (!F.blueprints) return;
    var bp = F.blueprints.clipboard();
    if (!bp) { if (F.ui && F.ui.toast) F.ui.toast(F.t('bp.no_clipboard')); return; }
    emptyHand();
    input.selecting = null;
    input.blueprint = { bp: bp };
  }

  function clearBlueprintModes() {
    if (!input.selecting && !input.blueprint) return false;
    input.selecting = null;
    input.blueprint = null;
    input.blueprintAnchor = null;
    return true;
  }

  function finishSelection() {
    var sel = input.selecting;
    if (!sel || !sel.start) return;
    var end = sel.end || sel.start;
    var bp = F.blueprints.create(sel.start[0], sel.start[1], end[0], end[1]);
    if (!bp) {
      input.selecting = { start: null, end: null }; // stay in the copy tool, try again
      if (F.ui && F.ui.toast) F.ui.toast(F.t('bp.empty'));
      return;
    }
    F.blueprints.setClipboard(bp);
    input.selecting = null;
    input.blueprint = { bp: F.blueprints.clipboard() };
    if (F.ui && F.ui.toast) F.ui.toast(F.t('bp.copied', { n: bp.entities.length }));
  }

  function pasteHeldBlueprint() {
    var a = input.blueprintAnchor;
    if (!input.blueprint || !a) return;
    var r = F.blueprints.place(input.blueprint.bp, a[0], a[1]);
    if (F.ui && F.ui.toast) {
      var msg = F.t('bp.placed', { n: r.placed });
      if (r.blocked) msg += ' — ' + F.t('bp.blocked', { n: r.blocked });
      F.ui.toast(msg);
    }
  }

  // =========================================================================
  // Drag placement (GDD §9.11): belts auto-turn along the mouse path; poles
  // space themselves at max wire reach; walls/pipes/other placeable entities
  // chain along every tile the path touches, skipping collisions.
  // =========================================================================
  function beginDrag(type, ghost) {
    var def = F.data.entities[type];
    dragging = {
      type: type,
      def: def,
      ghost: !!ghost, // plan ghosts along the path instead of consuming items
      ghostIds: Object.create(null), // ghosts placed by this drag (see overlapsOwnDragGhost)
      beltLike: def.behaviour === 'belt' || def.behaviour === 'underground' || def.behaviour === 'splitter',
      poleLike: def.behaviour === 'pole',
      // 'line' drag kinds (F.input.addDragKind, design/EXPANSION.md §6.6 —
      // rails) behave exactly like walls/pipes: place along the drag path
      // (auto L-shape from tileLine's Bresenham stepping) with no rotation
      // logic at all.
      chainLike: def.behaviour === 'wall' || def.behaviour === 'pipe' || (F._dragKinds && F._dragKinds[def.behaviour] === 'line'),
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
          var pg = dragging.ghost ? F.ghosts.at(prevTx, prevTy) : null;
          if (pg && pg.type === type && pg.dir !== dir && dragging.visited[prevTx + ',' + prevTy] && def.behaviour === 'belt') F.ghosts.setDir(pg, dir);
          var pe = dragging.ghost ? null : F.world.entityAt(prevTx, prevTy);
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

    if (placed && !dragging.ghost) {
      if (remainingOf(type) <= 0) dragging = null; // stops the drag when the hand and the inventory are empty
    }
  }

  // The cursor "hand" is a real stack taken out of the inventory (quickbar / pipette / slot clicks),
  // so placement consumes from the cursor first and only falls back to the inventory.
  function cursorHolds(type) {
    var p = getPlayer();
    return !!(p && p.cursor && p.cursor.id === type && p.cursor.count > 0);
  }
  function overlapsOwnDragGhost(type, tx, ty, dir) {
    var fp = F.entities.footprint(F.data.entities[type], dir);
    for (var j = 0; j < fp[1]; j++) for (var i = 0; i < fp[0]; i++) {
      var o = F.ghosts.at(tx + i, ty + j);
      if (o && dragging.ghostIds[o.id] && !(o.type === type && o.x === tx && o.y === ty && o.dir === dir)) return true;
    }
    return false;
  }
  function safePlace(type, tx, ty, dir) {
    if (dragging && dragging.ghost) {
      try {
        // Ghosts replace the ghosts they overlap — but never ones this same drag just
        // placed, or dragging a 3x3 ghost would keep overwriting its own previous step.
        if (overlapsOwnDragGhost(type, tx, ty, dir)) return null;
        var g = F.ghosts.place(type, tx, ty, dir);
        if (g) dragging.ghostIds[g.id] = true;
        return g;
      } catch (e) { F.log.warn('[input] ghost place failed', type, tx, ty, dir, e); return null; }
    }
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
  // F.api.addPicker() results (design/EXPANSION.md §6.4/§6.6): consulted
  // BEFORE grid entities, only when the cursor is empty (a held item always
  // wins — placement/virtual-placement above takes priority).
  function tryPicker(wx, wy) {
    if (!F.api || typeof F.api.pickAt !== 'function') return false;
    var p;
    try { p = F.api.pickAt(wx, wy); } catch (err) { p = null; F.log.warn('[input] F.api.pickAt threw', err); }
    if (!p) return false;
    if (typeof p.open === 'function') { try { p.open(); } catch (err) { F.log.warn('[input] picker.open failed', err); } }
    return true; // picker owns this position either way — no fallthrough to grid entities/ground
  }

  function handleLeftDown() {
    if (textFocused()) return;
    input.frame();
    var cursor = getCursor();
    if (input.selecting) { input.selecting.start = [hoverTx, hoverTy]; input.selecting.end = [hoverTx, hoverTy]; return; }
    if (input.blueprint) { pasteHeldBlueprint(); return; }
    if (input.preview.type && input.preview.ghost) { beginDrag(input.preview.type, true); return; }
    if (cursor && input.preview.type) {
      // Virtual placer items (design/EXPANSION.md §6.4/§6.6, e.g. vehicles):
      // placed with one click via F.api.placeVirtual, not the belt-style drag
      // used for normal F.data.entities placement. Mirrors safePlace()'s
      // cursorHolds() handling below: the cursor "hand" already holds this
      // item (that's what drove the preview), so it's consumed from THERE
      // (fromInventory:false + shrinkCursor) rather than from the bag —
      // F.api.placeVirtual's fromInventory:true only decrements
      // F.state.player.inv (F.player.take), which is empty of this item
      // whenever it is entirely sitting on the cursor (the normal case after
      // a quickbar/slot pick), so passing true here would silently fail.
      if (input.preview.virtual) {
        if (input.preview.ok && F.api && typeof F.api.placeVirtual === 'function') {
          var itemId = input.preview.type;
          var fromHand = cursorHolds(itemId);
          var placedV = null;
          try { placedV = F.api.placeVirtual(itemId, input.preview.tx, input.preview.ty, input.preview.dir, { fromInventory: !fromHand }); }
          catch (err) { F.log.warn('[input] placeVirtual failed', err); }
          if (placedV && fromHand) shrinkCursor(1);
        }
        return;
      }
      beginDrag(input.preview.type);
      return;
    }
    if (!cursor && tryPicker(hoverWx, hoverWy)) return;
    if (!cursor && buildGhostAt(hoverTx, hoverTy)) return;
    if (input.hover) {
      if (F.ui && F.ui.open) { F.ui.open('entity', input.hover); windowStack.push('entity'); }
      return;
    }
    tryPickupGround(hoverTx, hoverTy);
  }

  function handleLeftUp() {
    dragging = null;
    if (input.selecting && input.selecting.start) finishSelection();
  }

  // Left click with an empty hand on a ghost builds it from the inventory (within reach).
  function buildGhostAt(tx, ty) {
    if (!F.ghosts) return false;
    var g = F.ghosts.at(tx, ty);
    if (!g) return false;
    if (F.ghosts.build(g, { checkReach: true })) return true;
    var why = F.ghosts.lastFailure;
    var msg = why === 'missing' ? F.t('ghost.missing', { name: F.t('item.' + F.ghosts.itemFor(g)) })
      : why === 'too_far' ? F.t('ghost.too_far') : F.t('ghost.blocked');
    if (F.ui && F.ui.toast) F.ui.toast(msg);
    return true;
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
    if (input.blueprint) { input.blueprint = { bp: F.blueprints.rotate(input.blueprint.bp, ccw ? -1 : 1) }; return; }
    var cursor = getCursor();
    if (!cursor && input.ghostCursor) cursor = { id: input.ghostCursor, count: 0 };
    if (cursor) {
      var itemDef = F.data.items[cursor.id];
      var type = itemDef && itemDef.place;
      var def = type && F.data.entities[type];
      if (def && def.rotatable) {
        var cur = cursorDirByType[type] || 0;
        cursorDirByType[type] = def.allowedDirs ? nextAllowedDir(def.allowedDirs, cur, ccw) : F.util.rotDir(cur, ccw ? -1 : 1);
        return;
      }
      // Virtual placer items (design/EXPANSION.md §6.4, e.g. locomotives/
      // wagons): no F.data.entities def to key the remembered dir off, so use
      // the item id itself.
      if (!def && F.api && typeof F.api.getVirtual === 'function') {
        var vdef;
        try { vdef = F.api.getVirtual(cursor.id); } catch (err) { vdef = null; }
        if (vdef) {
          var curV = cursorDirByType[cursor.id] || 0;
          cursorDirByType[cursor.id] = F.util.rotDir(curV, ccw ? -1 : 1);
        }
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
    if (input.ghostCursor) { input.ghostCursor = null; return; }
    if (clearBlueprintModes()) return;
    var hov = input.hover || (F.ghosts ? F.ghosts.at(hoverTx, hoverTy) : null);
    if (hov) {
      var def = F.data.entities[hov.type];
      var itemId = def && def.minable;
      if (itemId && F.player.count && F.player.count(itemId) > 0) {
        var cnt = F.player.count(itemId);
        var taken = F.player.take(itemId, cnt);
        if (taken > 0) { p.cursor = { id: itemId, count: taken }; cursorDirByType[itemId] = hov.dir || 0; }
      } else if (itemId && F.ghosts && F.data.items[itemId] && F.data.items[itemId].place === hov.type) {
        // None in the inventory: pick it up as a ghost cursor instead.
        input.ghostCursor = itemId;
        cursorDirByType[hov.type] = hov.dir || 0;
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

  // Fallback list only used if F.ui.topWindow() is somehow unavailable (it
  // always is — 70-ui.js defines it unconditionally — this is defensive).
  var KNOWN_WINDOWS = ['entity', 'inventory', 'tech', 'help', 'map', 'menu', 'death'];
  function onEscape() {
    if (clearBlueprintModes()) return;
    if (!F.ui) return;
    for (var i = windowStack.length - 1; i >= 0; i--) {
      var name = windowStack[i];
      if (F.ui.isOpen(name)) { F.ui.close(name); windowStack.splice(i, 1); return; }
      windowStack.splice(i, 1);
    }
    // windowStack only tracks windows THIS module opened (toggleWindow/the
    // entity-open in handleLeftDown). A window a feature GUI opened directly
    // (e.g. F.ui.open('trainCar', ...) from a custom entity GUI's own button
    // — design/EXPANSION.md §6.6) is still closed here: F.ui.topWindow()
    // covers every registered window that is currently open, not just the
    // hardcoded KNOWN_WINDOWS list.
    var top = (typeof F.ui.topWindow === 'function') ? F.ui.topWindow() : null;
    if (top) { F.ui.close(top); return; }
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
    if (input.ghostCursor) { input.ghostCursor = null; return; }
    if (clearBlueprintModes()) return;
    var itemId = p.quickbar[idx];
    if (!itemId || !F.player.count) return;
    var count = F.player.count(itemId);
    if (count <= 0) {
      // Nothing left of a placeable item: hold it as a ghost cursor.
      var qdef = F.data.items[itemId];
      if (F.ghosts && qdef && qdef.place) input.ghostCursor = itemId;
      return;
    }
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
    shiftDown = !!e.shiftKey;
    if (textFocused()) return;
    var key = e.key;
    var lower = key.length === 1 ? key.toLowerCase() : key.toLowerCase();

    if ((e.ctrlKey || e.metaKey) && lower === 's') { e.preventDefault(); quickSave(); return; }
    if ((e.ctrlKey || e.metaKey) && lower === 'c') { e.preventDefault(); startCopyTool(); return; }
    if ((e.ctrlKey || e.metaKey) && lower === 'v') { e.preventDefault(); pasteClipboard(); return; }

    if (MOVE_KEYS[lower]) {
      keysDown[lower] = true; updateMoveAxis();
      if (lower.indexOf('arrow') === 0) e.preventDefault();
      return;
    }
    if (e.repeat) return; // one-shot actions below don't auto-repeat

    // F.input.addKey() handlers (design/EXPANSION.md §6.6) run before the
    // built-in switch below, after the text-input focus guard above. The
    // first handler to return true stops here (and prevents the default
    // browser action); anything else falls through to the built-in switch.
    var customHandlers = F._inputKeys && F._inputKeys[lower];
    if (customHandlers && customHandlers.length) {
      for (var ci = 0; ci < customHandlers.length; ci++) {
        var handled = false;
        try { handled = !!customHandlers[ci](e); } catch (err) { F.log.warn('[input] custom key handler failed', lower, err); }
        if (handled) { e.preventDefault(); return; }
      }
    }

    switch (lower) {
      case 'r': rotate(e.shiftKey); e.preventDefault(); break;
      case 'q': pipette(); break;
      case 'e': toggleWindow('inventory'); break;
      case 't': toggleWindow('tech'); break;
      case 'm': toggleWindow('map'); break;
      case 'h': case 'f1': toggleWindow('help'); e.preventDefault(); break;
      case 'f': pickupNearby(); break;
      case 'z': dropOne(); break;
      case 'b': startCopyTool(); break;
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
    shiftDown = !!e.shiftKey;
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

  function onMouseMove(e) { updateMouseFromEvent(e); shiftDown = !!e.shiftKey; }

  function onMouseDown(e) {
    updateMouseFromEvent(e);
    shiftDown = !!e.shiftKey;
    if (e.button === 0) { leftDown = true; handleLeftDown(); }
    else if (e.button === 2) {
      if (input.selecting) { input.selecting = null; return; } // right click cancels the copy tool
      rightDown = true; lastCancelTile = null; input.frame();
    }
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
    leftDown = false; rightDown = false; spaceDown = false; cDown = false; shiftDown = false;
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
  input.addKey = addKey;
  input.addDragKind = addDragKind;
})();
