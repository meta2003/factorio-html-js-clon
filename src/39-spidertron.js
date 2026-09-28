// 39-spidertron.js — the spidertron: a vehicle the player places, boards (Enter / G) and walks
// around with W A S D. Like in Factorio it strides over buildings, belts and trees on eight
// long legs (only water stops it) and carries an 80-slot trunk (open it by clicking the body,
// mine it to pick it up with its contents).
//
// State: F.state.spiders = [{ id, x, y, heading, vx, vy, inv }] (saved with the game) and
// F.state.player.ridingSpider = id while aboard. The legs are animation only: their feet live
// in a render-side cache here and step procedurally (a foot that falls too far behind its rest
// spot under the body lifts and swings ahead, legs of alternating groups taking turns), so
// they never touch the simulation. Art: 67-sprites-spidertron.js.
//
// Registration follows 38-trains.js: F.game/F.render/F.input hooks through their queues,
// F.api / F.player / F.ui ones deferred to F.game.onRebuild (see that file's header).
(function () {
  'use strict';

  var MAX_SPEED = 0.26;     // tiles/tick (~15.6 tiles/s; the player walks 8.9)
  var ACCEL = 0.12;         // fraction of the way to the target velocity per tick
  var TRUNK = 80;
  var BOARD_RANGE = 3;
  var BODY_H = 2.1;        // body height above the ground, tiles
  var LEG_REACH = 3.0;      // rest radius of the feet, tiles
  var STEP_AT = 1.2;        // a foot this far from its rest spot steps
  var STEP_MS = 150;

  function spiders() { return (F.state && F.state.spiders) || []; }
  function byId(id) { var l = spiders(); for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i]; return null; }
  function nextId() { var m = 0; spiders().forEach(function (s) { if (s.id > m) m = s.id; }); return m + 1; }
  function isWater(x, y) { return F.world.terrain(Math.floor(x), Math.floor(y)) < 2; }
  // the body can stand wherever the ground under it and just around it is not water
  function canStand(x, y) {
    if (isWater(x, y)) return false;
    for (var i = 0; i < 4; i++) { var a = i * Math.PI / 2; if (isWater(x + Math.cos(a) * 0.8, y + Math.sin(a) * 0.8)) return false; }
    return true;
  }

  // ---------------------------------------------------------------------------------------
  // Placement (F.api.registerVirtual).
  // ---------------------------------------------------------------------------------------
  function tooClose(x, y) { return spiders().some(function (s) { return F.util.dist(s.x, s.y, x, y) < 2.5; }); }
  var placer = {
    canPlace: function (tx, ty) {
      if (!canStand(tx + 0.5, ty + 0.5)) return { ok: false, reason: 'water' };
      if (tooClose(tx + 0.5, ty + 0.5)) return { ok: false, reason: 'collision' };
      return { ok: true };
    },
    place: function (tx, ty, dir) {
      if (!placer.canPlace(tx, ty).ok) return null;
      var v = F.util.dirVec(dir || 0);
      var s = { id: nextId(), x: tx + 0.5, y: ty + 0.5, heading: Math.atan2(v[1], v[0]), vx: 0, vy: 0, inv: F.inv.create(TRUNK) };
      if (!F.state.spiders) F.state.spiders = [];
      F.state.spiders.push(s);
      return s;
    },
    previewDraw: function (ctx, tx, ty, dir, ok, camera) {
      if (!F.sprites || !F.sprites.spidertronBody) return;
      var v = F.util.dirVec(dir || 0), spr = F.sprites.spidertronBody(Math.atan2(v[1], v[0]));
      if (!spr) return;
      var s = F.C.TILE * camera.zoom / 64, p = camera.toScreen(tx + 0.5, ty + 0.5 - BODY_H * 0.9);
      ctx.save(); ctx.globalAlpha = 0.6;
      ctx.drawImage(spr, p[0] - 128 * s, p[1] - 128 * s, 256 * s, 256 * s);
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = ok ? 'rgba(60,220,90,0.45)' : 'rgba(230,60,60,0.5)';
      ctx.fillRect(p[0] - 128 * s, p[1] - 128 * s, 256 * s, 256 * s);
      ctx.restore();
    },
  };

  // ---------------------------------------------------------------------------------------
  // Picker: click the body to open the trunk, mine it to pick it up.
  // ---------------------------------------------------------------------------------------
  function hitSpider(wx, wy) {
    var l = spiders();
    for (var i = l.length - 1; i >= 0; i--) {
      var s = l[i], dx = wx - s.x, dy = wy - (s.y - BODY_H * 0.9);
      if (dx * dx + dy * dy <= 1.6) return s;
    }
    return null;
  }
  function mineSpider(s) {
    var p = F.state.player;
    if (p && p.ridingSpider === s.id) exitSpider(p, s);
    if (F.player && F.player.giveOrDrop) {
      F.player.giveOrDrop('spidertron', 1);
      s.inv.forEach(function (st) { if (st) F.player.giveOrDrop(st.id, st.count); });
    }
    var i = F.state.spiders.indexOf(s);
    if (i >= 0) F.state.spiders.splice(i, 1);
    legCache.delete(s.id);
    return true;
  }
  function pickSpider(wx, wy) {
    var s = hitSpider(wx, wy);
    if (!s) return null;
    return {
      kind: 'spidertron', label: 'spidertron',
      open: function () { if (F.ui && F.ui.open) F.ui.open('spidertron', { id: s.id }); },
      mine: function () { return mineSpider(s); },
      mineTime: 0.5,
    };
  }

  // ---------------------------------------------------------------------------------------
  // Boarding and driving.
  // ---------------------------------------------------------------------------------------
  function exitSpider(p, s) {
    p.ridingSpider = null;
    if (!s) return;
    // step off beside the body, on the first free spot found
    for (var r = 1.2; r <= 3; r += 0.6) for (var k = 0; k < 8; k++) {
      var a = k / 8 * Math.PI * 2 + Math.PI / 2, x = s.x + Math.cos(a) * r, y = s.y + Math.sin(a) * r;
      if (!isWater(x, y) && !(F.world.entityAt && F.world.entityAt(Math.floor(x), Math.floor(y)))) { p.x = x; p.y = y; return; }
    }
    p.x = s.x; p.y = s.y;
  }
  function toggleSpider() {
    var p = F.state && F.state.player;
    if (!p || p.ridingTrain) return false;
    if (p.ridingSpider) { exitSpider(p, byId(p.ridingSpider)); return true; }
    var best = null, bd = BOARD_RANGE;
    spiders().forEach(function (s) { var d = F.util.dist(p.x, p.y, s.x, s.y); if (d <= bd) { bd = d; best = s; } });
    if (!best) return false;
    p.ridingSpider = best.id;
    return true;
  }
  F._inputKeys = F._inputKeys || {};
  (F._inputKeys['enter'] = F._inputKeys['enter'] || []).push(function () { return toggleSpider(); });
  (F._inputKeys['g'] = F._inputKeys['g'] || []).push(function () { return toggleSpider(); });

  function spiderMoveOverride(p, input) {
    if (!p.ridingSpider) return false;
    var s = byId(p.ridingSpider);
    if (!s) { p.ridingSpider = null; return false; }
    var mx = (input && input.mx) || 0, my = (input && input.my) || 0, len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    s.vx += (mx * MAX_SPEED - s.vx) * ACCEL;
    s.vy += (my * MAX_SPEED - s.vy) * ACCEL;
    if (Math.abs(s.vx) < 1e-4 && !mx) s.vx = 0;
    if (Math.abs(s.vy) < 1e-4 && !my) s.vy = 0;
    if (s.vx && canStand(s.x + s.vx, s.y)) s.x += s.vx; else s.vx = 0;
    if (s.vy && canStand(s.x, s.y + s.vy)) s.y += s.vy; else s.vy = 0;
    if (Math.hypot(s.vx, s.vy) > 0.02) {
      // turn the body smoothly toward the direction of travel
      var want = Math.atan2(s.vy, s.vx), d = want - s.heading;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      s.heading += d * 0.2;
    }
    p.x = s.x; p.y = s.y;
    if (mx || my) p.dir = Math.abs(mx) >= Math.abs(my) ? (mx >= 0 ? 1 : 3) : (my >= 0 ? 2 : 0);
    return true;
  }

  // ---------------------------------------------------------------------------------------
  // Legs (render-side) and drawing.
  // ---------------------------------------------------------------------------------------
  var legCache = new Map();
  function legAngle(i) { return (i + 0.5) / 8 * Math.PI * 2; }
  function restSpot(s, i, lead) {
    var a = s.heading + legAngle(i);
    return [s.x + Math.cos(a) * LEG_REACH + s.vx * lead, s.y + Math.sin(a) * LEG_REACH * 0.9 + s.vy * lead];
  }
  function updateLegs(s, now) {
    var L = legCache.get(s.id);
    if (!L) {
      L = { feet: [] };
      for (var i = 0; i < 8; i++) { var r = restSpot(s, i, 0); L.feet.push({ x: r[0], y: r[1], step: null, lift: 0 }); }
      legCache.set(s.id, L);
    }
    var moving = Math.hypot(s.vx, s.vy) > 0.02, group = Math.floor(now / STEP_MS) & 1;
    for (var j = 0; j < 8; j++) {
      var f = L.feet[j];
      if (f.step) {
        // the landing spot moves with the body, so a stepping foot keeps up at any speed
        var t = Math.min(1, (now - f.step.t0) / STEP_MS), aim = restSpot(s, j, moving ? 10 : 0);
        f.x = f.step.fx + (aim[0] - f.step.fx) * t;
        f.y = f.step.fy + (aim[1] - f.step.fy) * t;
        f.lift = Math.sin(t * Math.PI) * 0.6;
        if (t >= 1) { f.step = null; f.lift = 0; }
        continue;
      }
      var rest = restSpot(s, j, 0), far = F.util.dist(f.x, f.y, rest[0], rest[1]);
      if (far > 6) { f.x = rest[0]; f.y = rest[1]; continue; } // teleport / load
      // alternate groups take turns; a foot left far behind steps regardless, and once the
      // body stops the feet settle back under it
      var limit = moving ? STEP_AT : 0.35;
      if (far > limit && ((j & 1) === group || far > STEP_AT * 2)) f.step = { fx: f.x, fy: f.y, t0: now };
    }
    return L;
  }
  function renderSpiders(ctx, rect, cam) {
    var list = spiders();
    if (!list.length || !F.sprites || !F.sprites.spidertronBody) return;
    var now = F.util.now(), tpx = F.C.TILE * cam.zoom, k = tpx / 64;
    list.forEach(function (s) {
      if (s.x < rect.x0 - 5 || s.x > rect.x1 + 5 || s.y < rect.y0 - 5 || s.y > rect.y1 + 7) return;
      var legs = updateLegs(s, now);
      var moving = Math.hypot(s.vx, s.vy) > 0.02;
      var bob = moving ? Math.sin(now / STEP_MS * Math.PI) * 0.06 : Math.sin(now / 900) * 0.03;
      var bz = BODY_H + bob;
      var ground = cam.toScreen(s.x, s.y), body = cam.toScreen(s.x, s.y - bz * 0.9);
      // shadow cast on the ground (light from the top-left)
      var sg = ctx.createRadialGradient(ground[0] + tpx * 0.9, ground[1] + tpx * 0.5, 0, ground[0] + tpx * 0.9, ground[1] + tpx * 0.5, tpx * 1.2);
      sg.addColorStop(0, 'rgba(0,0,0,0.4)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sg; ctx.beginPath(); ctx.ellipse(ground[0] + tpx * 0.9, ground[1] + tpx * 0.5, tpx * 1.5, tpx * 0.85, 0, 0, Math.PI * 2); ctx.fill();
      // legs: hips round the underside ring, knees high above, feet on the ground
      var drawn = legs.feet.map(function (f, i) {
        var a = s.heading + legAngle(i);
        var hx = s.x + Math.cos(a) * 0.6, hy = s.y + Math.sin(a) * 0.55;
        var kx = s.x + (f.x - s.x) * 0.5, ky = s.y + (f.y - s.y) * 0.5, kz = bz + 1.7 + (f.lift || 0) * 0.5;
        return {
          back: f.y < s.y,
          hip: cam.toScreen(hx, hy - (bz - 0.2) * 0.9), knee: cam.toScreen(kx, ky - kz * 0.9),
          foot: cam.toScreen(f.x, f.y - (f.lift || 0) * 0.9), fs: cam.toScreen(f.x + (f.lift || 0) * 0.6, f.y + (f.lift || 0) * 0.3),
        };
      });
      drawn.forEach(function (l) { // foot shadows
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(l.fs[0] + tpx * 0.08, l.fs[1] + tpx * 0.04, tpx * 0.12, tpx * 0.06, 0, 0, Math.PI * 2); ctx.fill();
      });
      drawn.forEach(function (l) { if (l.back) F.sprites.drawSpidertronLeg(ctx, l.hip, l.knee, l.foot, tpx); });
      var spr = F.sprites.spidertronBody(s.heading);
      if (spr) ctx.drawImage(spr, body[0] - 128 * k, body[1] - 128 * k, 256 * k, 256 * k);
      drawn.forEach(function (l) { if (!l.back) F.sprites.drawSpidertronLeg(ctx, l.hip, l.knee, l.foot, tpx); });
    });
  }

  F._renderHooks = F._renderHooks || {
    layers: { floor: [], objects: [], air: [], overlay: [] },
    entityOpts: {}, minimapColors: {}, hidePlayerFns: [], altOverlayFns: [],
  };
  F._renderHooks.layers.air.push(renderSpiders);
  F._renderHooks.hidePlayerFns.push(function () { return !!(F.state && F.state.player && F.state.player.ridingSpider); });

  // ---------------------------------------------------------------------------------------
  // Trunk window.
  // ---------------------------------------------------------------------------------------
  function renderWindow(root, payload) {
    while (root.firstChild) root.removeChild(root.firstChild);
    var s = payload && byId(payload.id);
    if (!s) { root.appendChild(document.createTextNode('—')); return; }
    var name = document.createElement('div'); name.className = 'f-entity-name'; name.textContent = F.t('item.spidertron') + ' — #' + s.id;
    root.appendChild(name);
    var hint = document.createElement('div'); hint.className = 'f-hint'; hint.textContent = F.t('ui.spidertron.trunk');
    root.appendChild(hint);
    var grid = document.createElement('div'); grid.className = 'f-slot-grid'; grid.style.gridTemplateColumns = 'repeat(10,1fr)';
    for (var i = 0; i < s.inv.length; i++) {
      var cell = null;
      if (F.ui && typeof F.ui.slot === 'function') { try { cell = F.ui.slot(s.inv, i, { transferTarget: 'player' }); } catch (err) { cell = null; } }
      if (!cell) { cell = document.createElement('div'); cell.className = 'f-slot'; }
      grid.appendChild(cell);
    }
    root.appendChild(grid);
  }

  // ---------------------------------------------------------------------------------------
  // Deferred registration (see 38-trains.js).
  // ---------------------------------------------------------------------------------------
  var apiDone = false, playerDone = false, uiDone = false;
  function registerLate() {
    if (!apiDone && F.api && typeof F.api.registerVirtual === 'function') {
      F.api.registerVirtual('spidertron', placer);
      F.api.addPicker(pickSpider);
      apiDone = true;
    }
    if (!playerDone && F.player && typeof F.player.addMoveOverride === 'function') {
      F.player.addMoveOverride(spiderMoveOverride);
      playerDone = true;
    }
    if (!uiDone && F.ui && typeof F.ui.registerWindow === 'function') {
      F.ui.registerWindow('spidertron', {
        create: function (payload) {
          var body = document.createElement('div'); body.className = 'f-win-content f-win-spidertron';
          var frame = (typeof F.ui.windowFrame === 'function') ? F.ui.windowFrame(F.t('item.spidertron'), body) : body;
          renderWindow(body, payload); frame._contentEl = body; return frame;
        },
        refresh: function (frameEl, payload) { try { renderWindow(frameEl._contentEl || frameEl, payload); } catch (err) { F.log.error('[spidertron] refresh failed', err); } },
      });
      uiDone = true;
    }
  }
  F.game = F.game || {};
  (F.game._onNewGame = F.game._onNewGame || []).push(function () { F.state.spiders = []; legCache.clear(); });
  (F.game._onRebuild = F.game._onRebuild || []).push(function () {
    if (!F.state) return;
    if (!Array.isArray(F.state.spiders)) F.state.spiders = [];
    if (F.state.player && F.state.player.ridingSpider && !byId(F.state.player.ridingSpider)) F.state.player.ridingSpider = null;
    legCache.clear();
    registerLate();
  });
  (F._helpTabs = F._helpTabs || []).push('spidertron');

  F.spidertron = {
    list: spiders, byId: byId, board: toggleSpider,
    feet: function (id) { var L = legCache.get(id); return L ? L.feet.map(function (f) { return [f.x, f.y]; }) : null; },
  };

  F.i18n.add('en', {
    'item.spidertron': 'Spidertron',
    'item.spidertron.desc': 'A walking vehicle on eight long legs. Place it, board it with Enter or G (within 3 tiles) and walk with W A S D — it strides over buildings, belts and trees, only water stops it. Click it to open its 80-slot trunk; mine it to pick it up with its contents. Stack: 1.',
    'ent.spidertron': 'Spidertron',
    'tech.spidertron': 'Spidertron',
    'tech.spidertron.desc': 'Cost 500 of each science pack up to utility, requires Rocket control unit, Low density structure and Efficiency module 3. Unlocks the spidertron.',
    'ui.spidertron.trunk': 'Trunk',
    'ui.tab.spidertron': 'Spidertron',
    'help.spidertron': 'The spidertron is a walking vehicle researched late in the game (Spidertron technology). Craft it and place it like any building, then stand within 3 tiles and press Enter or G to board it; the same key steps out again.\n\nWhile aboard, W A S D walk it about 75% faster than you can run. Its eight legs step over buildings, belts, pipes and trees, so it goes straight across your base; only water (lakes and the sea) stops it.\n\nClick its body to open the 80-slot trunk and move items in or out, like a chest. To pick the spidertron up, mine it (hold right-click on the body): you get the spidertron back together with everything in its trunk.',
  });
})();
