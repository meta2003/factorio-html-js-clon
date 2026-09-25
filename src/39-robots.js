// 39-robots.js — logistic robots: roboport + logistic-chest behaviours, roboport
// networks (union of overlapping 50x50 areas), robot dispatch/flight simulation,
// rendering (air layer + alt-mode logistic area overlay) and entity GUIs.
// See design/EXPANSION.md §7.3 (spec), §6.1/§6.5/§6.6 (hook APIs — this file loads
// BEFORE 80-game.js/61-render.js/70-ui.js/75-input.js, so it uses the queue-array
// snippets documented there instead of calling F.game/F.render/F.ui directly at
// load time). Data (item/entity/tech defs, i18n names) already exist in
// src/05-data-expansion.js and src/06-i18n-expansion.js; sprites already exist in
// src/67-sprites-robots.js (F.sprites.robot/robotShadow + the roboport/chest
// painters, which read opts.working / def.roboport.radius themselves).
//
// Public API this file adds: F.robots = { networks(), networkOf(entity),
// stats(net), markDirty(), count() }. F.behaviours['roboport'] and
// F.behaviours['logistic-chest'] are registered on the shared F.behaviours
// registry (20-entities.js, loaded before this file).
//
// Local assumptions (documented per EXPANSION.md's "guarded local fallback"
// instruction — no existing API covered these):
//  - No shared item picker exists yet in 71-ui-windows.js (grepped: nothing is
//    exposed on F.ui for it), so the requester-chest GUI below builds a small
//    self-contained modal (grid of item icons) directly with DOM calls, exactly
//    like F.ui's own confirmDialog() does elsewhere in this codebase.
//  - Power: EXPANSION.md's own generated ent.roboport.desc text (06-i18n-
//    expansion.js) says "50 kW plus 25 kW per active robot" for the whole
//    network, matching §7.3's "(just request 50 + 25 x busyRobots kW)" — each
//    roboport requests a flat 50 kW drain every tick, and ONE roboport per
//    network (roboports[0] in the network's own list) additionally requests
//    25 kW x (robots active in that network) so the network's total demand
//    matches the spec exactly without per-robot bookkeeping across roboports.
//  - Networks/chest membership are rebuilt with a plain O(n^2) roboport-pair
//    scan on the (assumed small) roboport count whenever a roboport or
//    logistic-chest is placed/removed (design/EXPANSION.md §7.3: "rebuilt
//    lazily when roboports placed/removed").
//  - Reservation of chest contents against double-dispatch is done by
//    physically removing the reserved items from the source chest's inventory
//    (and the chosen roboport's robot slot) at dispatch time rather than a
//    separate "reserved" ledger — this already guarantees two dispatches never
//    claim the same units, and the item is conceptually "carried" by the robot
//    from that moment even though its on-screen position only reaches the
//    provider a little later.
(function () {
  'use strict';

  // =====================================================================
  // Tunables (EXPANSION.md §7.3)
  // =====================================================================
  var ROBOT_SPEED = 0.05;          // tiles/tick, full power
  var ROBOT_UNPOWERED_FACTOR = 0.2; // 20% speed when the network has no power
  var ROBOT_CAPACITY = 4;          // items carried per trip
  var DISPATCH_INTERVAL = 30;      // ticks between dispatch passes
  var ROBOPORT_BASE_KW = 50;
  var ROBOPORT_PER_ROBOT_KW = 25;

  // =====================================================================
  // Small local helpers
  // =====================================================================
  function safeDef(type) {
    var d = F.data && F.data.entities && F.data.entities[type];
    return d || null;
  }
  function centerOf(e) {
    if (F.entities && typeof F.entities.center === 'function') return F.entities.center(e);
    return [e.x + (e.w || 1) / 2, e.y + (e.h || 1) / 2];
  }
  function roboportRadius(def) {
    return (def && def.roboport && def.roboport.radius) || 25;
  }

  // =====================================================================
  // Networks — union of roboports whose 50x50 (radius 25) areas overlap;
  // logistic chests join the network whose roboport area contains them.
  // Rebuilt lazily (dirty flag flipped by entity:placed/entity:removed).
  // =====================================================================
  var networksDirty = true;
  var networks = [];       // [{ id, roboports:[ids], provider:[ids], storage:[ids], requester:[ids] }]
  var netById = {};        // id -> network
  var netOfRoboport = {};  // roboportId -> network
  var netOfChest = {};     // chestId -> network

  function markNetworksDirty() { networksDirty = true; }

  function isRoboportOrChest(e) {
    if (!e) return false;
    var def = safeDef(e.type);
    return !!(def && (def.behaviour === 'roboport' || def.behaviour === 'logistic-chest'));
  }
  F.events.on('entity:placed', function (e) { if (isRoboportOrChest(e)) markNetworksDirty(); });
  F.events.on('entity:removed', function (e) { if (isRoboportOrChest(e)) markNetworksDirty(); });

  function areasOverlap(a, b, defA, defB) {
    var ra = roboportRadius(defA), rb = roboportRadius(defB);
    var ca = centerOf(a), cb = centerOf(b);
    return Math.abs(ca[0] - cb[0]) <= (ra + rb) && Math.abs(ca[1] - cb[1]) <= (ra + rb);
  }

  function rebuildNetworks() {
    networksDirty = false;
    networks = []; netById = {}; netOfRoboport = {}; netOfChest = {};

    var roboports = (F.entities && F.entities.ofType) ? F.entities.ofType('roboport') : [];
    var parent = {};
    for (var i = 0; i < roboports.length; i++) parent[roboports[i].id] = roboports[i].id;
    function find(x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
    function uni(a, b) { var ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; }

    for (var i2 = 0; i2 < roboports.length; i2++) {
      var defA = safeDef(roboports[i2].type);
      for (var j2 = i2 + 1; j2 < roboports.length; j2++) {
        var defB = safeDef(roboports[j2].type);
        if (defA && defB && areasOverlap(roboports[i2], roboports[j2], defA, defB)) {
          uni(roboports[i2].id, roboports[j2].id);
        }
      }
    }

    var groups = {}; // root -> [entities]
    for (var k = 0; k < roboports.length; k++) {
      var root = find(roboports[k].id);
      if (!groups[root]) groups[root] = [];
      groups[root].push(roboports[k]);
    }
    var idx = 0;
    Object.keys(groups).forEach(function (root) {
      var members = groups[root];
      var net = { id: 'net' + (idx++), roboports: [], provider: [], storage: [], requester: [] };
      for (var m = 0; m < members.length; m++) {
        net.roboports.push(members[m].id);
        netOfRoboport[members[m].id] = net;
      }
      networks.push(net);
      netById[net.id] = net;
    });

    var chestTypes = ['passive-provider-chest', 'storage-chest', 'requester-chest'];
    var chestKind = { 'passive-provider-chest': 'provider', 'storage-chest': 'storage', 'requester-chest': 'requester' };
    for (var ci = 0; ci < chestTypes.length; ci++) {
      var list = (F.entities && F.entities.ofType) ? F.entities.ofType(chestTypes[ci]) : [];
      for (var li = 0; li < list.length; li++) {
        var chest = list[li];
        var cc = centerOf(chest);
        var chosen = null;
        for (var ni = 0; ni < networks.length && !chosen; ni++) {
          var net2 = networks[ni];
          for (var ri = 0; ri < net2.roboports.length; ri++) {
            var rp = F.entities.byId(net2.roboports[ri]);
            if (!rp) continue;
            var rdef = safeDef(rp.type);
            var rc = centerOf(rp);
            var radius = roboportRadius(rdef);
            if (Math.abs(cc[0] - rc[0]) <= radius && Math.abs(cc[1] - rc[1]) <= radius) { chosen = net2; break; }
          }
        }
        if (chosen) {
          chosen[chestKind[chestTypes[ci]]].push(chest.id);
          netOfChest[chest.id] = chosen;
        }
      }
    }
  }

  function ensureNetworks() { if (networksDirty) rebuildNetworks(); }
  function getNetworkById(id) { ensureNetworks(); return netById[id] || null; }

  function networkPowered(net) {
    for (var i = 0; i < net.roboports.length; i++) {
      var e = F.entities.byId(net.roboports[i]);
      if (e && F.power && F.power.hasNetwork(e) && F.power.satisfaction(e) > 0) return true;
    }
    return false;
  }

  // Any logistic or construction robot of this network in the air?
  function netBusy(net) {
    var lists = [(F.state && F.state.robots) || [], (F.state && F.state.cbots) || []];
    for (var l = 0; l < lists.length; l++) {
      for (var i = 0; i < lists[l].length; i++) if (lists[l][i].net === net.id) return true;
    }
    return false;
  }

  // =====================================================================
  // Behaviours
  // =====================================================================
  if (!F.behaviours) F.behaviours = {};

  // Two one-slot robot inventories: `robots` (logistic robots) and `cbots` (construction
  // robots, flown by 53-construction.js). No onRemove on purpose: networks are rebuilt by
  // the entity:removed listener above, and without onRemove F.api.remove hands the robots
  // (and a logistic chest's contents) back to the player instead of destroying them.
  function robotInv(e, item) {
    if (item === 'logistic-robot') return e.robots;
    if (item === 'construction-robot') return e.cbots;
    return null;
  }

  F.behaviours['roboport'] = {
    create: function (e) {
      e.robots = F.inv.create(1);
      e.cbots = F.inv.create(1);
      e.repair = null;
      markNetworksDirty();
    },
    wake: function (e) {
      if (!Array.isArray(e.robots)) e.robots = F.inv.create(1);
      if (!Array.isArray(e.cbots)) e.cbots = F.inv.create(1);
      if (e.repair === undefined) e.repair = null;
    },
    accepts: function (e, item) {
      var inv = robotInv(e, item);
      if (!inv) return 0;
      var stack = F.inv.stackSize(item);
      var have = F.inv.count(inv, item);
      return Math.max(0, stack - have);
    },
    insert: function (e, item, count) {
      var inv = robotInv(e, item);
      if (!inv) return 0;
      var remaining = F.inv.add(inv, item, count);
      return count - remaining;
    },
    take: function (e, filter) { return F.inv.takeOne(e.robots, filter) || F.inv.takeOne(e.cbots, filter); },
    inventories: function (e) { return [{ name: 'robots', inv: e.robots }, { name: 'cbots', inv: e.cbots }]; },
    status: function (e) {
      if (!F.power || !F.power.hasNetwork(e)) return 'not_connected';
      if (F.power.satisfaction(e) <= 0) return 'no_power';
      var net = netOfRoboport[e.id];
      if (net && netBusy(net)) return 'working';
      return 'idle';
    },
  };

  F.behaviours['logistic-chest'] = {
    create: function (e) {
      var def = safeDef(e.type);
      var slots = (def && def.chest && def.chest.slots) || 48;
      e.inv = F.inv.create(slots);
      e.mode = (def && def.logistic && def.logistic.mode) || 'storage';
      if (e.mode === 'requester') e.requests = [null, null, null, null, null, null];
      markNetworksDirty();
    },
    wake: function (e) {
      var def = safeDef(e.type);
      if (!e.mode) e.mode = (def && def.logistic && def.logistic.mode) || 'storage';
      if (!Array.isArray(e.inv)) e.inv = F.inv.create((def && def.chest && def.chest.slots) || 48);
      if (e.mode === 'requester' && !Array.isArray(e.requests)) e.requests = [null, null, null, null, null, null];
      if (e.mode === 'requester' && e.requests.length < 6) { while (e.requests.length < 6) e.requests.push(null); }
    },
    accepts: function (e, item) { return F.behaviours.chest.accepts(e, item); },
    insert: function (e, item, count) { return F.behaviours.chest.insert(e, item, count); },
    take: function (e, filter) { return F.behaviours.chest.take(e, filter); },
    inventories: function (e) { return [{ name: 'main', inv: e.inv }]; },
    status: function (e) { return F.inv.isEmpty(e.inv) ? 'idle' : 'working'; },
  };

  // =====================================================================
  // Robot flight helpers
  // =====================================================================
  var nextRobotId = 1;

  function moveToward(r, tx, ty, speed) {
    var dx = tx - r.x, dy = ty - r.y;
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d <= speed || d < 1e-6) { r.x = tx; r.y = ty; return true; }
    r.x += dx / d * speed; r.y += dy / d * speed;
    return false;
  }

  function removeRobot(r) {
    var arr = F.state.robots;
    var idx = arr.indexOf(r);
    if (idx >= 0) arr.splice(idx, 1);
  }

  // Drop cargo into the nearest storage/provider chest with room, else onto
  // the ground near the robot's current position (EXPANSION.md §7.3).
  function dropCargoNear(r, item, count) {
    if (count <= 0) return;
    var candidates = [].concat(
      (F.entities && F.entities.ofType) ? F.entities.ofType('storage-chest') : [],
      (F.entities && F.entities.ofType) ? F.entities.ofType('passive-provider-chest') : []
    );
    var best = null, bestD = Infinity;
    for (var i = 0; i < candidates.length; i++) {
      var c = candidates[i]; if (!c || c._removed) continue;
      var cc = centerOf(c);
      var d = F.util.dist(r.x, r.y, cc[0], cc[1]);
      if (d < bestD) { bestD = d; best = c; }
    }
    var left = count;
    if (best) {
      var inserted = 0;
      try { inserted = F.entities.insertItem(best, item, count) || 0; } catch (err) { inserted = 0; }
      left = count - inserted;
    }
    if (left > 0) F.ground.dropNear(r.x, r.y, item, left);
  }

  // Resolve (or re-resolve) which roboport a robot should dock at: nearest
  // roboport still standing in its own network, else nearest roboport
  // anywhere (network dissolved), else none (EXPANSION.md §7.3 removal
  // handling: "returns to another roboport, or if none, drops on the ground").
  function resolveDock(r) {
    var t = r.task;
    var candidates = [];
    var net = getNetworkById(r.net);
    if (net) {
      for (var i = 0; i < net.roboports.length; i++) {
        var e = F.entities.byId(net.roboports[i]);
        if (e) candidates.push(e);
      }
    }
    if (!candidates.length && F.entities && F.entities.ofType) candidates = F.entities.ofType('roboport').slice();
    if (!candidates.length) { t.dockId = null; return; }
    var best = null, bestD = Infinity;
    for (var j = 0; j < candidates.length; j++) {
      var c = centerOf(candidates[j]);
      var d = F.util.dist(r.x, r.y, c[0], c[1]);
      if (d < bestD) { bestD = d; best = candidates[j]; }
    }
    t.dockId = best ? best.id : null;
  }

  function tickRobotFlight(r) {
    var net = getNetworkById(r.net);
    var powered = net ? networkPowered(net) : false;
    var speed = ROBOT_SPEED * (powered ? 1 : ROBOT_UNPOWERED_FACTOR);
    var t = r.task;
    if (!t) { removeRobot(r); return; }

    if (t.stage === 'toPickup') {
      if (moveToward(r, t.pickupX, t.pickupY, speed)) { t.cargo = true; t.stage = 'toDrop'; }
      return;
    }
    if (t.stage === 'toDrop') {
      if (moveToward(r, t.dropX, t.dropY, speed)) {
        var dst = F.entities.byId(t.toId);
        var delivered = 0;
        if (dst && !dst._removed) {
          try { delivered = F.entities.insertItem(dst, t.item, t.count) || 0; } catch (err) { delivered = 0; }
        }
        var leftover = t.count - delivered;
        if (leftover > 0) dropCargoNear(r, t.item, leftover);
        t.cargo = false;
        t.stage = 'toDock';
        resolveDock(r);
      }
      return;
    }
    if (t.stage === 'toDock') {
      var dock = (t.dockId != null) ? F.entities.byId(t.dockId) : null;
      if (!dock || dock._removed) { resolveDock(r); dock = (t.dockId != null) ? F.entities.byId(t.dockId) : null; }
      if (!dock) {
        // Nowhere left to dock: the robot itself becomes a ground item.
        F.ground.dropNear(r.x, r.y, 'logistic-robot', 1);
        removeRobot(r);
        return;
      }
      var c2 = centerOf(dock);
      if (moveToward(r, c2[0], c2[1], speed)) {
        var left = F.inv.add(dock.robots, 'logistic-robot', 1);
        if (left > 0) F.ground.dropNear(r.x, r.y, 'logistic-robot', left);
        removeRobot(r);
      }
      return;
    }
    // Unknown stage (should never happen) — fail safe instead of spinning forever.
    removeRobot(r);
  }

  // =====================================================================
  // Dispatch (every DISPATCH_INTERVAL ticks)
  // =====================================================================
  function findProviderWithItem(net, itemId) {
    var lists = [net.provider, net.storage];
    for (var li = 0; li < lists.length; li++) {
      var ids = lists[li];
      for (var i = 0; i < ids.length; i++) {
        var c = F.entities.byId(ids[i]);
        if (c && !c._removed && F.inv.count(c.inv, itemId) > 0) return c;
      }
    }
    return null;
  }

  function findIdleRoboport(net, near) {
    var nc = centerOf(near);
    var best = null, bestD = Infinity;
    for (var i = 0; i < net.roboports.length; i++) {
      var e = F.entities.byId(net.roboports[i]);
      if (!e || e._removed) continue;
      if (F.inv.count(e.robots, 'logistic-robot') <= 0) continue;
      var c = centerOf(e);
      var d = F.util.dist(nc[0], nc[1], c[0], c[1]);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  function dispatchNetwork(net) {
    var incoming = {}; // "requesterId|item" -> already-inbound count
    var robots = F.state.robots;
    for (var i = 0; i < robots.length; i++) {
      var r = robots[i];
      if (r.net !== net.id || !r.task) continue;
      var key = r.task.toId + '|' + r.task.item;
      incoming[key] = (incoming[key] || 0) + r.task.count;
    }

    for (var qi = 0; qi < net.requester.length; qi++) {
      var reqE = F.entities.byId(net.requester[qi]);
      if (!reqE || reqE._removed || !Array.isArray(reqE.requests)) continue;
      for (var si = 0; si < reqE.requests.length; si++) {
        var slotReq = reqE.requests[si];
        if (!slotReq || !slotReq.id || !(slotReq.count > 0)) continue;
        var have = F.inv.count(reqE.inv, slotReq.id);
        var key2 = reqE.id + '|' + slotReq.id;
        var inbound = incoming[key2] || 0;
        var shortfall = slotReq.count - have - inbound;
        if (shortfall <= 0) continue;
        var want = Math.min(shortfall, ROBOT_CAPACITY);

        var src = findProviderWithItem(net, slotReq.id);
        if (!src) continue;
        var idle = findIdleRoboport(net, src);
        if (!idle) continue;

        var take = Math.min(want, F.inv.count(src.inv, slotReq.id));
        if (take <= 0) continue;

        F.inv.remove(src.inv, slotReq.id, take);
        F.inv.remove(idle.robots, 'logistic-robot', 1);

        var pc = centerOf(src), dc = centerOf(reqE), hc = centerOf(idle);
        F.state.robots.push({
          id: nextRobotId++,
          net: net.id,
          x: hc[0], y: hc[1],
          home: idle.id,
          task: {
            item: slotReq.id, count: take,
            fromId: src.id, toId: reqE.id,
            pickupX: pc[0], pickupY: pc[1],
            dropX: dc[0], dropY: dc[1],
            stage: 'toPickup', cargo: false, dockId: null,
          },
        });
        incoming[key2] = inbound + take;
      }
    }
  }

  function dispatchAll() {
    for (var i = 0; i < networks.length; i++) dispatchNetwork(networks[i]);
  }

  // =====================================================================
  // Main tick phase (EXPANSION.md §7.3: "after 'inserters'")
  // =====================================================================
  function robotsTick() {
    if (!F.state || !F.state.robots) return;
    ensureNetworks();

    var roboports = (F.entities && F.entities.ofType) ? F.entities.ofType('roboport') : [];
    var busyByNet = {};
    var robots = F.state.robots;
    for (var i = 0; i < robots.length; i++) {
      var r = robots[i];
      busyByNet[r.net] = (busyByNet[r.net] || 0) + 1;
    }
    for (var ri = 0; ri < roboports.length; ri++) {
      if (F.power && typeof F.power.request === 'function') F.power.request(roboports[ri], ROBOPORT_BASE_KW);
    }
    if (F.power && typeof F.power.request === 'function') {
      Object.keys(busyByNet).forEach(function (netId) {
        var net = netById[netId];
        if (!net || !net.roboports.length) return;
        var coord = F.entities.byId(net.roboports[0]);
        if (coord) F.power.request(coord, ROBOPORT_PER_ROBOT_KW * busyByNet[netId]);
      });
    }

    if ((F.state.tick % DISPATCH_INTERVAL) === 0) dispatchAll();

    for (var j = F.state.robots.length - 1; j >= 0; j--) {
      tickRobotFlight(F.state.robots[j]);
    }
  }

  // EXPANSION.md §6.1 queue pattern: 39-robots.js loads before 80-game.js, so
  // F.game.addTickPhase/onNewGame/onRebuild don't exist yet — push straight
  // onto the queue arrays 80-game.js itself adopts once it loads.
  F.game = F.game || {};
  (F.game._onNewGame = F.game._onNewGame || []).push(function () { F.state.robots = []; });
  (F.game._onRebuild = F.game._onRebuild || []).push(function () {
    if (!Array.isArray(F.state.robots)) F.state.robots = [];
    var maxId = 0;
    for (var i = 0; i < F.state.robots.length; i++) {
      if (F.state.robots[i] && F.state.robots[i].id > maxId) maxId = F.state.robots[i].id;
    }
    nextRobotId = maxId + 1;
    markNetworksDirty();
  });
  (F.game._tickPhases = F.game._tickPhases || []).push({ name: 'robots', after: 'inserters', fn: robotsTick });

  // =====================================================================
  // F.robots public API
  // =====================================================================
  F.robots = {
    networks: function () { ensureNetworks(); return networks; },
    networkOf: function (e) {
      ensureNetworks();
      if (!e) return null;
      var def = safeDef(e.type);
      if (!def) return null;
      if (def.behaviour === 'roboport') return netOfRoboport[e.id] || null;
      if (def.behaviour === 'logistic-chest') return netOfChest[e.id] || null;
      return null;
    },
    stats: function (net) {
      if (!net) return null;
      var idle = 0;
      for (var i = 0; i < net.roboports.length; i++) {
        var e = F.entities.byId(net.roboports[i]);
        if (e) idle += F.inv.count(e.robots, 'logistic-robot');
      }
      var busy = 0;
      var robots = (F.state && F.state.robots) || [];
      for (var j = 0; j < robots.length; j++) if (robots[j].net === net.id) busy++;
      return {
        robots: idle + busy, idle: idle, busy: busy,
        chests: { provider: net.provider.length, storage: net.storage.length, requester: net.requester.length },
      };
    },
    markDirty: markNetworksDirty,
    isPowered: function (net) { return !!net && networkPowered(net); },
    count: function () { return ((F.state && F.state.robots) || []).length; },
    ROBOT_SPEED: ROBOT_SPEED,
    ROBOT_CAPACITY: ROBOT_CAPACITY,
    DISPATCH_INTERVAL: DISPATCH_INTERVAL,
  };

  // =====================================================================
  // Rendering (EXPANSION.md §6.5 queue snippet — F.render does not exist yet
  // at this file's load time; both this file's direct pushes and 61-render.js's
  // own F.render.addLayer/entityOpts/altOverlay/minimapColor wrappers read and
  // write the same F._renderHooks object).
  // =====================================================================
  F._renderHooks = F._renderHooks || {
    layers: { floor: [], objects: [], air: [], overlay: [] },
    entityOpts: {},
    minimapColors: {},
    hidePlayerFns: [],
    altOverlayFns: [],
  };
  var RH = F._renderHooks;

  // Roboport working animation: pulses while its network has any active robot.
  RH.entityOpts['roboport'] = function (e, def, tick) {
    var net = netOfRoboport[e.id];
    var working = !!(net && netBusy(net));
    var frame = working ? Math.floor(tick / 4) % 16 : 0;
    return { frame: frame, opts: { working: working } };
  };

  // Air layer: flying robots (shadow at ground level, sprite hovering ~0.6
  // tile higher with a gentle bob, small cargo pip while carrying).
  RH.layers.air.push(function (ctx, rect, cam) {
    if (!F.sprites || !F.sprites.enabled) return;
    var list = (F.state && F.state.robots) || [];
    if (!list.length) return;
    var tilePx = F.C.TILE * (cam.zoom || 1);
    var sizePx = tilePx * 0.75;
    var hoverPx = tilePx * 0.6;
    var tick = (F.state && F.state.tick) || 0;
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      if (r.x < rect.x0 - 2 || r.x > rect.x1 + 2 || r.y < rect.y0 - 2 || r.y > rect.y1 + 2) continue;
      var sp = cam.toScreen(r.x, r.y);
      var bob = Math.sin((tick + r.id * 11) / 20) * tilePx * 0.05;
      var shadow = F.sprites.robotShadow();
      if (shadow && shadow.width) ctx.drawImage(shadow, sp[0] - sizePx / 2, sp[1] - sizePx / 2, sizePx, sizePx);
      var frame = Math.floor((tick + r.id * 5) / 4) % 8;
      var sprite = F.sprites.robot('logistic-robot', frame);
      if (sprite && sprite.width) ctx.drawImage(sprite, sp[0] - sizePx / 2, sp[1] - sizePx / 2 - hoverPx - bob, sizePx, sizePx);
      if (r.task && r.task.cargo && F.sprites.item) {
        try {
          var pip = F.sprites.item(r.task.item, Math.max(8, sizePx * 0.4));
          if (pip && pip.width) ctx.drawImage(pip, sp[0] - pip.width / 2, sp[1] - hoverPx * 0.35, pip.width, pip.height);
        } catch (err) { /* icon may be missing for an unusual item id — never crash rendering */ }
      }
    }
  });

  // Alt-mode: orange dashed square showing a roboport's logistic area. Drawn
  // for every roboport whenever alt-mode is on (drawAltOverlay in 61-render.js
  // already gates this whole call on F.render.altMode, so this is exactly the
  // "always in alt mode" option from EXPANSION.md §7.3).
  RH.altOverlayFns.push(function (ctx, e, def, sx, sy, tilePx) {
    if (!def || def.behaviour !== 'roboport') return;
    var fp = (F.entities && F.entities.footprint) ? F.entities.footprint(def, e.dir) : (def.size || [4, 4]);
    var cx = sx + fp[0] * tilePx / 2, cy = sy + fp[1] * tilePx / 2;
    var half = roboportRadius(def) * tilePx;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,165,0,0.85)';
    ctx.lineWidth = Math.max(1, tilePx * 0.05);
    if (ctx.setLineDash) ctx.setLineDash([tilePx * 0.4, tilePx * 0.25]);
    ctx.strokeRect(cx - half, cy - half, half * 2, half * 2);
    ctx.restore();
  });

  RH.minimapColors['roboport'] = '#D9A520';
  RH.minimapColors['logistic-chest'] = '#3A7FD9';

  // =====================================================================
  // GUIs (EXPANSION.md §6.6 queue snippet — F.ui does not exist yet at this
  // file's load time; F._entityGUIs is the same registry F.ui.registerEntityGUI
  // writes to once 70-ui.js has loaded).
  // =====================================================================
  F._entityGUIs = F._entityGUIs || {};

  // Small self-contained item picker modal (no shared one is exposed on F.ui —
  // see the file header assumptions). Only ever invoked from a live entity GUI,
  // i.e. never under HEADLESS.
  function openItemPicker(onPick) {
    if (typeof document === 'undefined') { if (onPick) onPick(null); return; }
    var backdrop = document.createElement('div');
    backdrop.className = 'f-modal-backdrop';
    backdrop.style.position = 'fixed'; backdrop.style.left = '0'; backdrop.style.top = '0';
    backdrop.style.right = '0'; backdrop.style.bottom = '0';
    backdrop.style.background = 'rgba(0,0,0,0.55)'; backdrop.style.zIndex = '99998';
    backdrop.style.display = 'flex'; backdrop.style.alignItems = 'center'; backdrop.style.justifyContent = 'center';

    var panel = document.createElement('div');
    panel.className = 'f-panel f-item-picker';
    panel.style.maxWidth = '440px'; panel.style.maxHeight = '70vh'; panel.style.overflow = 'auto';
    panel.style.padding = '10px'; panel.style.display = 'grid';
    panel.style.gridTemplateColumns = 'repeat(8, 1fr)'; panel.style.gap = '4px';
    panel.style.background = '#232323'; panel.style.border = '1px solid #0f0f0f';

    function cleanup() { if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop); }

    var ids = (F.data && F.data.order && F.data.order.items) || Object.keys((F.data && F.data.items) || {});
    for (var i = 0; i < ids.length; i++) {
      (function (id) {
        var it = F.data.items[id];
        if (!it) return;
        var cell = document.createElement('div');
        cell.style.width = '36px'; cell.style.height = '36px'; cell.style.cursor = 'pointer';
        cell.style.borderRadius = '3px';
        cell.title = F.t ? F.t('item.' + id) : id;
        var url = null;
        if (F.sprites && typeof F.sprites.itemURL === 'function') {
          try { url = F.sprites.itemURL(id); } catch (err) { url = null; }
        }
        if (url) { cell.style.backgroundImage = 'url(' + url + ')'; cell.style.backgroundSize = 'cover'; }
        else { cell.style.background = (it.icon && it.icon.color) || '#5a5a5a'; }
        cell.addEventListener('click', function () { cleanup(); if (onPick) onPick(id); });
        panel.appendChild(cell);
      })(ids[i]);
    }

    backdrop.addEventListener('click', function (ev) { if (ev.target === backdrop) { cleanup(); if (onPick) onPick(null); } });
    backdrop.appendChild(panel);
    document.body.appendChild(backdrop);
  }

  F._entityGUIs['roboport'] = function (root, e, def, h) {
    h.header(root, e, def);
    root.appendChild(h.el('div', 'f-section-title', F.t('ui.robots.slot')));
    if (!Array.isArray(e.cbots)) e.cbots = F.inv.create(1);
    root.appendChild(h.row(
      h.labeled(F.t('item.logistic-robot'), h.slotGrid(e.robots, { cols: 1 })),
      h.labeled(F.t('item.construction-robot'), h.slotGrid(e.cbots, { cols: 1 }))));

    var net = F.robots.networkOf(e);
    var stats = net ? F.robots.stats(net) : null;
    if (stats) {
      var netInfo = h.el('div', 'f-hint',
        F.t('item.logistic-robot') + ': ' + F.t('ui.robots.total') + ' ' + stats.robots + '  ' +
        F.t('ui.robots.idle') + ' ' + stats.idle + '  ' +
        F.t('ui.robots.busy') + ' ' + stats.busy);
      root.appendChild(netInfo);
      var chestInfo = h.el('div', 'f-hint',
        F.t('ui.robots.chests') + ': ' +
        stats.chests.provider + ' ' + F.t('ui.robots.provider') + ', ' +
        stats.chests.storage + ' ' + F.t('ui.robots.storage') + ', ' +
        stats.chests.requester + ' ' + F.t('ui.robots.requester'));
      root.appendChild(chestInfo);
      var cs = (F.construction && F.construction.stats) ? F.construction.stats(net) : null;
      if (cs) {
        root.appendChild(h.el('div', 'f-hint',
          F.t('item.construction-robot') + ': ' + F.t('ui.robots.idle') + ' ' + cs.idle + '  ' +
          F.t('ui.robots.busy') + ' ' + cs.busy + '  ·  ' + F.t('ui.robots.ghosts') + ' ' + cs.ghosts));
        if (cs.missing > 0) root.appendChild(h.el('div', 'f-hint f-warn', F.t('ui.robots.missing', { n: cs.missing })));
      }
    } else {
      root.appendChild(h.el('div', 'f-hint', F.t('ui.robots.noNetwork')));
    }
  };

  function requesterRequestRow(h, e, idx) {
    var slotReq = e.requests[idx];
    var iconBox = h.el('div', 'f-icon f-request-icon');
    iconBox.style.width = '34px'; iconBox.style.height = '34px'; iconBox.style.cursor = 'pointer';
    iconBox.style.pointerEvents = 'auto';
    if (slotReq && slotReq.id) {
      var url = null;
      if (F.sprites && typeof F.sprites.itemURL === 'function') {
        try { url = F.sprites.itemURL(slotReq.id); } catch (err) { url = null; }
      }
      if (url) { iconBox.style.backgroundImage = 'url(' + url + ')'; iconBox.style.backgroundSize = 'cover'; }
      else {
        var it = F.data.items[slotReq.id];
        iconBox.style.background = (it && it.icon && it.icon.color) || '#5a5a5a';
      }
    } else {
      iconBox.style.background = '#262626'; iconBox.style.color = '#888';
      iconBox.style.textAlign = 'center'; iconBox.style.lineHeight = '34px';
      iconBox.textContent = '+';
    }
    iconBox.addEventListener('click', function (ev) {
      ev.preventDefault();
      openItemPicker(function (itemId) {
        if (!itemId) return;
        var stackDefault = (F.data.items[itemId] && F.data.items[itemId].stack) || 50;
        e.requests[idx] = { id: itemId, count: stackDefault };
        h.refresh();
      });
    });

    var countInput = document.createElement('input');
    countInput.type = 'number'; countInput.min = '0'; countInput.step = '1';
    countInput.className = 'f-request-count';
    countInput.style.width = '64px';
    countInput.value = slotReq ? String(slotReq.count) : '0';
    countInput.addEventListener('change', function () {
      var v = Math.max(0, parseInt(countInput.value, 10) || 0);
      if (!e.requests[idx] || !e.requests[idx].id) return;
      if (v <= 0) e.requests[idx] = null; else e.requests[idx].count = v;
      h.refresh();
    });

    var clearBtn = h.button('x', function () { e.requests[idx] = null; h.refresh(); });
    return h.row(iconBox, countInput, clearBtn);
  }

  F._entityGUIs['logistic-chest'] = function (root, e, def, h) {
    h.header(root, e, def);
    if (e.mode === 'requester') {
      root.appendChild(h.el('div', 'f-section-title', F.t('ui.robots.requests')));
      if (!Array.isArray(e.requests)) e.requests = [null, null, null, null, null, null];
      for (var i = 0; i < 6; i++) root.appendChild(requesterRequestRow(h, e, i));
    }
    root.appendChild(h.el('div', 'f-section-title', F.t('ui.slots')));
    root.appendChild(h.slotGrid(e.inv, { cols: 8 }));
  };

  // =====================================================================
  // i18n — ui.robots.* keys owned by this module (EXPANSION.md §9: feature
  // modules add their own UI-label i18n with this prefix). F.i18n already
  // exists at this file's load time (02-i18n.js loads first).
  // =====================================================================
  if (F.i18n && F.i18n.add) {
    F.i18n.add('en', {
      'ui.robots.slot': 'Robots',
      'ui.robots.network': 'Network',
      'ui.robots.total': 'Total',
      'ui.robots.idle': 'Idle',
      'ui.robots.busy': 'Busy',
      'ui.robots.chests': 'Chests',
      'ui.robots.provider': 'provider',
      'ui.robots.storage': 'storage',
      'ui.robots.requester': 'requester',
      'ui.robots.requests': 'Requests',
      'ui.robots.noNetwork': 'Not in range of a roboport network',
      'ui.robots.ghosts': 'ghosts in range',
      'ui.robots.missing': '{n} ghosts are missing materials (put the buildings in a provider or storage chest)',
    });
  }
})();
