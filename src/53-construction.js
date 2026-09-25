// 53-construction.js — construction robots: they build ghosts (51-ghosts.js, and so pasted
// blueprints from 52-blueprints.js) inside a roboport network's construction area.
//
// Rules (Factorio-like, simplified):
//   - Construction robots are items ('construction-robot') kept in a roboport's second robot
//     slot (e.cbots, see 39-robots.js). Networks are the logistic networks of 39-robots.js
//     (roboports whose 50x50 logistic areas overlap); a network's construction area is the
//     union of 110x110 squares (def.roboport.constructionRadius = 55) around its roboports.
//   - Every DISPATCH ticks, each unclaimed ghost inside some network's construction area gets
//     a robot if that network has (a) the ghost's item in a passive-provider or storage chest
//     and (b) an idle construction robot in one of its roboports. The item and the robot are
//     taken out right away (that is the reservation, like 39-robots.js does).
//   - Flight: roboport -> chest (pick up) -> ghost (build, a short welding beam) -> roboport.
//     If the ghost vanished or cannot be built (player standing on it for too long), the
//     robot carries the item back to a storage/provider chest (or drops it on the ground).
//   - A robot whose roboports all disappeared drops itself as an item.
//   - Deconstruction (54-deconstruction.js marks): before building, each pass sends idle
//     robots to marked buildings/trees/rocks in coverage — only when the network has a
//     storage chest. The robot takes the target down (building + contents, or wood/stone/
//     coal) and carries everything to the nearest storage chest with room (the rest lands
//     on the ground next to it). Ghosts whose tiles still hold a tree or rock wait.
//   - Speed 0.06 tiles/tick, 20 % without power; 25 kW per flying robot on the network.
//
// State: F.state.cbots = [{ id, net, x, y, task: { kind: 'build'|'decon', ghostId, type,
//   item, target, fromId, stage, px, py, bx, by, cargo, items, t, tries, retId, dockId } }]
//   — JSON-plain, saved with the game. `items` = [[itemId, count], ...] being carried back.
//
// F.construction:
//   stats(net) -> { idle, busy, ghosts, missing, decon, noStorage }  (from the last pass)
//   count() -> robots in the air        claimed(ghostId) -> bool
//   networkForTile(tx, ty) -> network | null (construction coverage)
//   DISPATCH, SPEED
(function () {
  'use strict';

  var SPEED = 0.06;
  var UNPOWERED = 0.2;
  var DISPATCH = 20;          // ticks between dispatch passes
  var MAX_PER_PASS = 40;      // robots sent per pass across all networks
  var BUILD_TICKS = 18;       // welding beam before the building appears
  var RETRY_TICKS = 30;       // blocked build: wait this long, then try again...
  var MAX_TRIES = 20;         // ...at most this many times (10 s), then bring the item back
  var KW_PER_ROBOT = 25;
  var ITEM = 'construction-robot';

  var nextId = 1;
  var lastStats = Object.create(null); // net.id -> { ghosts, missing }

  // =====================================================================
  // Helpers
  // =====================================================================
  function list() { return (F.state && F.state.cbots) || []; }

  function centerOf(e) { return F.entities.center(e); }

  function cradius(e) {
    var d = F.data.entities[e.type];
    return (d && d.roboport && (d.roboport.constructionRadius || d.roboport.radius)) || 55;
  }

  function roboportsOf(net) {
    var out = [];
    for (var i = 0; i < net.roboports.length; i++) {
      var e = F.entities.byId(net.roboports[i]);
      if (e && !e._removed) out.push(e);
    }
    return out;
  }

  function networks() { return (F.robots && F.robots.networks) ? F.robots.networks() : []; }

  function netById(id) {
    var nets = networks();
    for (var i = 0; i < nets.length; i++) if (nets[i].id === id) return nets[i];
    return null;
  }

  function covers(net, x, y) {
    var rps = roboportsOf(net);
    for (var i = 0; i < rps.length; i++) {
      var c = centerOf(rps[i]), r = cradius(rps[i]);
      if (Math.abs(x - c[0]) <= r && Math.abs(y - c[1]) <= r) return true;
    }
    return false;
  }

  function networkForPoint(x, y) {
    var nets = networks();
    for (var i = 0; i < nets.length; i++) if (covers(nets[i], x, y)) return nets[i];
    return null;
  }

  function ghostCenter(g) { return [g.x + g.w / 2, g.y + g.h / 2]; }

  function dist(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return Math.sqrt(dx * dx + dy * dy); }

  function nearest(entities, x, y, pred) {
    var best = null, bestD = Infinity;
    for (var i = 0; i < entities.length; i++) {
      var e = entities[i];
      if (!e || e._removed || (pred && !pred(e))) continue;
      var c = centerOf(e), d = dist(x, y, c[0], c[1]);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  function chestsOf(net, kinds) {
    var out = [];
    for (var k = 0; k < kinds.length; k++) {
      var ids = net[kinds[k]] || [];
      for (var i = 0; i < ids.length; i++) {
        var e = F.entities.byId(ids[i]);
        if (e && !e._removed && Array.isArray(e.inv)) out.push(e);
      }
    }
    return out;
  }

  function moveToward(r, tx, ty, speed) {
    var dx = tx - r.x, dy = ty - r.y;
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d <= speed || d < 1e-6) { r.x = tx; r.y = ty; return true; }
    r.x += dx / d * speed; r.y += dy / d * speed;
    return false;
  }

  function removeRobot(r) {
    var arr = list();
    var i = arr.indexOf(r);
    if (i >= 0) arr.splice(i, 1);
  }

  function claimedSet() {
    var set = Object.create(null);
    var arr = list();
    for (var i = 0; i < arr.length; i++) {
      var t = arr[i].task;
      if (!t) continue;
      if (t.ghostId) set[t.ghostId] = true;
      if (t.target) set[t.target] = true;
    }
    return set;
  }

  function launch(net, rp, task) {
    F.inv.remove(rp.cbots, ITEM, 1);
    var hc = centerOf(rp);
    list().push({ id: nextId++, net: net.id, x: hc[0], y: hc[1], task: task });
  }

  function idleRoboportNear(net, x, y) {
    return nearest(roboportsOf(net), x, y, function (e) { return Array.isArray(e.cbots) && F.inv.count(e.cbots, ITEM) > 0; });
  }

  // Marked buildings/trees/rocks first, so ghosts planned over trees can follow.
  function dispatchDecon(claimed, budget, hasIdle) {
    if (!F.deconstruction) return 0;
    var list0 = F.deconstruction.targets();
    var sent = 0;
    var storage = Object.create(null);
    for (var i = 0; i < list0.length; i++) {
      var tg = list0[i];
      var net = networkForPoint(tg.x, tg.y);
      if (!net) continue;
      var st = lastStats[net.id];
      st.decon++;
      if (claimed[tg.key]) continue;
      if (storage[net.id] === undefined) storage[net.id] = chestsOf(net, ['storage']).length > 0;
      if (!storage[net.id]) { st.noStorage++; continue; }
      if (sent >= budget || hasIdle[net.id] === false) continue;
      var rp = idleRoboportNear(net, tg.x, tg.y);
      if (!rp) { hasIdle[net.id] = false; continue; }
      launch(net, rp, {
        kind: 'decon', target: tg.key, ghostId: null, stage: 'toBuild',
        bx: tg.x, by: tg.y, cargo: false, items: null, t: 0, tries: 0, retId: null, dockId: null,
      });
      claimed[tg.key] = true;
      sent++;
    }
    return sent;
  }

  // =====================================================================
  // Dispatch
  // =====================================================================
  function dispatch() {
    var ghosts = F.ghosts ? F.ghosts.all() : [];
    var nets = networks();
    lastStats = Object.create(null);
    for (var n = 0; n < nets.length; n++) lastStats[nets[n].id] = { ghosts: 0, missing: 0, decon: 0, noStorage: 0 };
    if (!nets.length) return;

    var claimed = claimedSet();
    var hasIdle = Object.create(null);     // net.id -> false once no robot is left
    var sent = dispatchDecon(claimed, MAX_PER_PASS, hasIdle);
    var sourceCache = Object.create(null); // net|item -> chest|null for this pass
    var sources = Object.create(null);     // net.id -> provider+storage chests

    for (var i = 0; i < ghosts.length; i++) {
      var g = ghosts[i];
      var c = ghostCenter(g);
      var net = networkForPoint(c[0], c[1]);
      if (!net) continue;
      var st = lastStats[net.id];
      st.ghosts++;
      if (claimed[g.id]) continue;
      if (F.ghosts.blockedByFeature(g)) continue; // a marked tree/rock goes first

      var item = F.ghosts.itemFor(g);
      var key = net.id + '|' + item;
      var src = sourceCache[key];
      if (src === undefined || (src && F.inv.count(src.inv, item) <= 0)) {
        if (!sources[net.id]) sources[net.id] = chestsOf(net, ['provider', 'storage']);
        src = nearest(sources[net.id], c[0], c[1], function (ch) { return F.inv.count(ch.inv, item) > 0; });
        sourceCache[key] = src;
      }
      if (!src) { st.missing++; continue; }
      if (sent >= MAX_PER_PASS || hasIdle[net.id] === false) continue;

      var sc = centerOf(src);
      var rp = idleRoboportNear(net, sc[0], sc[1]);
      if (!rp) { hasIdle[net.id] = false; continue; }

      F.inv.remove(src.inv, item, 1);
      launch(net, rp, {
        kind: 'build', ghostId: g.id, type: g.type, item: item, fromId: src.id,
        stage: 'toPickup', px: sc[0], py: sc[1], bx: c[0], by: c[1],
        cargo: false, items: null, t: 0, tries: 0, retId: null, dockId: null,
      });
      claimed[g.id] = true;
      sent++;
    }
  }

  // =====================================================================
  // Flight
  // =====================================================================
  function tryBuild(r) {
    var t = r.task;
    var g = F.ghosts.byId(t.ghostId);
    if (!g || g.type !== t.type) return 'gone';
    var chk = F.api.canPlace(g.type, g.x, g.y, g.dir);
    if (!chk.ok) return 'blocked';
    var e = F.api.place(g.type, g.x, g.y, g.dir, { fromInventory: false });
    // F.ghosts' entity:placed listener removed the ghost and applied its settings.
    return e ? 'built' : 'blocked';
  }

  // Where to bring items: nearest storage chest with room (for the first item), then
  // provider chest, in the robot's network first, then anywhere. null = drop on the ground.
  function returnTarget(r, item) {
    var net = netById(r.net);
    var fits = function (e) { return F.entities.canAcceptItem(e, item) > 0; };
    var pools = [];
    if (net) { pools.push(chestsOf(net, ['storage'])); pools.push(chestsOf(net, ['provider'])); }
    pools.push(F.entities.ofType('storage-chest'));
    pools.push(F.entities.ofType('passive-provider-chest'));
    for (var i = 0; i < pools.length; i++) {
      var e = nearest(pools[i], r.x, r.y, fits);
      if (e) return e;
    }
    return null;
  }

  // Carry t.items (or the unused build item) to a chest; nothing to carry -> fly home.
  function startReturn(r) {
    var t = r.task;
    if (!t.items) t.items = (t.kind !== 'decon' && t.cargo && t.item) ? [[t.item, 1]] : [];
    t.items = t.items.filter(function (it) { return it && it[0] && it[1] > 0; });
    if (!t.items.length) { t.cargo = false; t.stage = 'toDock'; resolveDock(r); return; }
    t.cargo = true;
    var dst = returnTarget(r, t.items[0][0]);
    if (!dst) { dropItems(r.x, r.y, t.items); t.items = null; t.cargo = false; t.stage = 'toDock'; resolveDock(r); return; }
    t.retId = dst.id;
    t.stage = 'toReturn';
  }

  function dropItems(x, y, items) {
    for (var i = 0; i < items.length; i++) if (items[i][1] > 0) F.ground.dropNear(x, y, items[i][0], items[i][1]);
  }

  function deliver(r, dst) {
    var t = r.task, left = [];
    for (var i = 0; i < t.items.length; i++) {
      var id = t.items[i][0], n = t.items[i][1], put = 0;
      try { put = F.entities.insertItem(dst, id, n) || 0; } catch (err) { put = 0; }
      if (put < n) left.push([id, n - put]);
    }
    if (left.length) dropItems(r.x, r.y, left);
    t.items = null; t.cargo = false; t.retId = null;
  }

  function resolveDock(r) {
    var net = netById(r.net);
    var cands = net ? roboportsOf(net) : [];
    if (!cands.length) cands = F.entities.ofType('roboport');
    var best = nearest(cands, r.x, r.y, null);
    r.task.dockId = best ? best.id : null;
  }

  function tickRobot(r, powered) {
    var t = r.task;
    if (!t) { removeRobot(r); return; }
    var speed = SPEED * (powered ? 1 : UNPOWERED);

    switch (t.stage) {
      case 'toPickup':
        if (moveToward(r, t.px, t.py, speed)) { t.cargo = true; t.stage = 'toBuild'; }
        return;
      case 'toBuild': {
        if (t.kind === 'decon') {
          if (!F.deconstruction || !F.deconstruction.stillMarked(t.target)) { t.target = null; startReturn(r); return; }
          if (moveToward(r, t.bx, t.by, speed)) { t.stage = 'building'; t.t = 0; }
          return;
        }
        var g = F.ghosts.byId(t.ghostId);
        if (!g) { startReturn(r); return; }
        var c = ghostCenter(g);
        t.bx = c[0]; t.by = c[1];
        if (moveToward(r, t.bx, t.by, speed)) { t.stage = 'building'; t.t = 0; }
        return;
      }
      case 'building':
        if (++t.t < BUILD_TICKS) return;
        if (t.kind === 'decon') {
          var got = [];
          var ok = F.deconstruction && F.deconstruction.deconstruct(t.target, got);
          t.target = null;
          t.items = ok ? got : null;
          startReturn(r);
          return;
        }
        var res = tryBuild(r);
        if (res === 'built') { t.cargo = false; t.ghostId = null; t.stage = 'toDock'; resolveDock(r); return; }
        if (res === 'gone' || ++t.tries > MAX_TRIES) { t.ghostId = null; startReturn(r); return; }
        t.stage = 'waiting'; t.t = 0; // e.g. the player stands on the spot
        return;
      case 'waiting':
        if (++t.t >= RETRY_TICKS) { t.stage = 'building'; t.t = BUILD_TICKS - 1; }
        return;
      case 'toReturn': {
        var dst = t.retId != null ? F.entities.byId(t.retId) : null;
        if (!dst || dst._removed) { startReturn(r); if (t.stage !== 'toReturn') return; dst = F.entities.byId(t.retId); }
        var dc = centerOf(dst);
        if (moveToward(r, dc[0], dc[1], speed)) { deliver(r, dst); t.stage = 'toDock'; resolveDock(r); }
        return;
      }
      case 'toDock': {
        var dock = t.dockId != null ? F.entities.byId(t.dockId) : null;
        if (!dock || dock._removed) { resolveDock(r); dock = t.dockId != null ? F.entities.byId(t.dockId) : null; }
        if (!dock) { F.ground.dropNear(r.x, r.y, ITEM, 1); removeRobot(r); return; }
        var hc = centerOf(dock);
        if (moveToward(r, hc[0], hc[1], speed)) {
          if (!Array.isArray(dock.cbots)) dock.cbots = F.inv.create(1);
          var left = F.inv.add(dock.cbots, ITEM, 1);
          if (left > 0) F.ground.dropNear(r.x, r.y, ITEM, left);
          removeRobot(r);
        }
        return;
      }
      default:
        removeRobot(r);
    }
  }

  function constructionTick() {
    if (!F.state) return;
    if (!Array.isArray(F.state.cbots)) F.state.cbots = [];
    if (F.state.tick % DISPATCH === 0) dispatch();
    var arr = F.state.cbots;
    if (!arr.length) return;

    var powered = Object.create(null), busy = Object.create(null);
    for (var i = 0; i < arr.length; i++) busy[arr[i].net] = (busy[arr[i].net] || 0) + 1;
    Object.keys(busy).forEach(function (id) {
      var net = netById(id);
      powered[id] = !!(net && F.robots.isPowered(net));
      var rps = net ? roboportsOf(net) : [];
      if (rps.length && F.power && F.power.request) F.power.request(rps[0], KW_PER_ROBOT * busy[id]);
    });
    for (var j = arr.length - 1; j >= 0; j--) tickRobot(arr[j], !!powered[arr[j].net]);
  }

  F.game = F.game || {};
  (F.game._onNewGame = F.game._onNewGame || []).push(function () { F.state.cbots = []; lastStats = Object.create(null); });
  (F.game._onRebuild = F.game._onRebuild || []).push(function () {
    if (!Array.isArray(F.state.cbots)) F.state.cbots = [];
    var max = 0;
    for (var i = 0; i < F.state.cbots.length; i++) if (F.state.cbots[i] && F.state.cbots[i].id > max) max = F.state.cbots[i].id;
    nextId = max + 1;
    lastStats = Object.create(null);
  });
  (F.game._tickPhases = F.game._tickPhases || []).push({ name: 'construction', after: 'inserters', fn: constructionTick });

  // =====================================================================
  // Rendering: robots in the air layer, welding beam while building
  // =====================================================================
  F._renderHooks = F._renderHooks || {
    layers: { floor: [], objects: [], air: [], overlay: [] },
    entityOpts: {}, minimapColors: {}, hidePlayerFns: [], altOverlayFns: [],
  };

  F._renderHooks.layers.air.push(function (ctx, rect, cam) {
    if (!F.sprites || !F.sprites.enabled) return;
    var arr = list();
    if (!arr.length) return;
    var tilePx = F.C.TILE * (cam.zoom || 1);
    var sizePx = tilePx * 0.75, hoverPx = tilePx * 0.6;
    var tick = F.state.tick || 0;
    var shadow = F.sprites.robotShadow();
    for (var i = 0; i < arr.length; i++) {
      var r = arr[i];
      if (r.x < rect.x0 - 2 || r.x > rect.x1 + 2 || r.y < rect.y0 - 2 || r.y > rect.y1 + 2) continue;
      var sp = cam.toScreen(r.x, r.y);
      var bob = Math.sin((tick + r.id * 13) / 20) * tilePx * 0.05;
      var ry = sp[1] - hoverPx - bob;
      if (shadow && shadow.width) ctx.drawImage(shadow, sp[0] - sizePx / 2, sp[1] - sizePx / 2, sizePx, sizePx);
      var t = r.task;
      if (t && (t.stage === 'building' || t.stage === 'waiting') && ((tick + r.id) % 4) < 3) {
        var tgt = cam.toScreen(t.bx, t.by);
        var jx = (Math.random() - 0.5) * tilePx * 0.4, jy = (Math.random() - 0.5) * tilePx * 0.4;
        ctx.save();
        ctx.strokeStyle = 'rgba(255,190,90,0.85)';
        ctx.lineWidth = Math.max(1, tilePx * 0.05);
        ctx.beginPath(); ctx.moveTo(sp[0], ry + sizePx * 0.15); ctx.lineTo(tgt[0] + jx, tgt[1] + jy); ctx.stroke();
        ctx.fillStyle = 'rgba(255,240,180,0.9)';
        ctx.beginPath(); ctx.arc(tgt[0] + jx, tgt[1] + jy, Math.max(1.5, tilePx * 0.06), 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      var spr = F.sprites.robot(ITEM, Math.floor((tick + r.id * 5) / 4) % 8);
      if (spr && spr.width) ctx.drawImage(spr, sp[0] - sizePx / 2, ry - sizePx / 2, sizePx, sizePx);
      var cargoItem = t && t.cargo ? (t.items && t.items.length ? t.items[0][0] : t.item) : null;
      if (cargoItem && F.sprites.item) {
        try {
          var pip = F.sprites.item(cargoItem, Math.max(8, sizePx * 0.4));
          if (pip && pip.width) ctx.drawImage(pip, sp[0] - pip.width / 2, sp[1] - hoverPx * 0.35, pip.width, pip.height);
        } catch (err) { /* never crash rendering over an icon */ }
      }
    }
  });

  // =====================================================================
  // Public API
  // =====================================================================
  F.construction = {
    stats: function (net) {
      if (!net) return null;
      var idle = 0, busy = 0;
      var rps = roboportsOf(net);
      for (var i = 0; i < rps.length; i++) if (Array.isArray(rps[i].cbots)) idle += F.inv.count(rps[i].cbots, ITEM);
      var arr = list();
      for (var j = 0; j < arr.length; j++) if (arr[j].net === net.id) busy++;
      var s = lastStats[net.id] || { ghosts: 0, missing: 0, decon: 0, noStorage: 0 };
      return { idle: idle, busy: busy, ghosts: s.ghosts, missing: s.missing, decon: s.decon, noStorage: s.noStorage };
    },
    count: function () { return list().length; },
    claimed: function (ghostId) { return !!claimedSet()[ghostId]; },
    networkForTile: function (tx, ty) { return networkForPoint(tx + 0.5, ty + 0.5); },
    DISPATCH: DISPATCH,
    SPEED: SPEED,
  };
})();
