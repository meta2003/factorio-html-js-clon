// 30-belts.js — transport belts, underground belts and splitters.
// Simplified SLOT model (ARCHITECTURE.md §7): every lane of a belt tile has 4 slots
// (index 0 = entrance, 3 = exit). A tier advances one slot every `stepTicks` ticks
// (yellow: 8 ticks -> 32 ticks per tile -> 1.875 tiles/s, 7.5 items/s per lane).
// Public positions are reported as pos = slot*64 + 32 (+ animation), so pos 128 = slot 2.
(function () {
  'use strict';

  const belts = F.belts = {};
  const DIRS = F.C.DIRS;
  const SLOTS = 4;
  const rot = F.util.rotDir;
  const opp = F.util.oppDir;
  const key = F.util.key;

  let dirty = true;
  let order = [];                 // nodes, downstream first
  let nodeByKey = new Map();      // "tx,ty" -> node

  // ---------- helpers ----------
  function def(e) { return e ? F.data.entities[e.type] : null; }
  function kind(e) { const d = def(e); return d ? d.behaviour : null; }
  function isSplitter(e) { return kind(e) === 'splitter'; }
  function speedOf(e) { const d = def(e) || {}; const b = d.belt || d.underground || d.splitter || {}; return b.speed || 8; }
  function stepTicks(e) { return Math.max(1, Math.round(64 / speedOf(e))); }
  function emptyLane() { return [null, null, null, null]; }
  function emptyLanes() { return [emptyLane(), emptyLane()]; }
  function nearLaneOf(dir, sideDir) { return sideDir === rot(dir, 3) ? 0 : 1; } // lane 0 lies on the left of travel
  function halfTiles(e) {
    switch (e.dir & 3) {
      case 0: return [[e.x, e.y], [e.x + 1, e.y]];
      case 1: return [[e.x, e.y], [e.x, e.y + 1]];
      case 2: return [[e.x + 1, e.y], [e.x, e.y]];
      default: return [[e.x, e.y + 1], [e.x, e.y]];
    }
  }
  function ensureFields(e) {
    const k = kind(e);
    if (k === 'splitter') {
      if (!Array.isArray(e.lanes) || e.lanes.length !== 2 || !Array.isArray(e.lanes[0]) || !Array.isArray(e.lanes[0][0])) e.lanes = [emptyLanes(), emptyLanes()];
      if (!Array.isArray(e.toggle)) e.toggle = [0, 0];
      if (e.filter === undefined) e.filter = null;
      if (e.inPrio === undefined) e.inPrio = 0;
      if (e.outPrio === undefined) e.outPrio = 0;
    } else {
      if (!Array.isArray(e.lanes) || e.lanes.length !== 2 || !Array.isArray(e.lanes[0])) e.lanes = emptyLanes();
      for (let l = 0; l < 2; l++) while (e.lanes[l].length < SLOTS) e.lanes[l].push(null);
      if (k === 'belt' && e.curve === undefined) e.curve = 0;
      if (k === 'underground') { if (e.io !== 'in' && e.io !== 'out') e.io = 'in'; if (e.pairId === undefined) e.pairId = 0; if (e.gap === undefined) e.gap = 0; }
    }
  }
  // lane array for a public lane index (splitters: half*2 + lane)
  function laneArr(e, lane) {
    if (!e || !e.lanes) return null;
    if (isSplitter(e)) { const h = (lane >> 1) & 1; return e.lanes[h] ? e.lanes[h][lane & 1] : null; }
    return e.lanes[lane & 1] || null;
  }
  function allLanes(e) {
    if (!e || !e.lanes) return [];
    if (isSplitter(e)) return [e.lanes[0][0], e.lanes[0][1], e.lanes[1][0], e.lanes[1][1]];
    return e.lanes;
  }
  function slotOf(pos) { const s = Math.floor((pos || 0) / 64); return s < 0 ? 0 : s > 3 ? 3 : s; }

  belts.isBeltLike = function (e) { if (!e || e._removed) return false; const k = kind(e); return k === 'belt' || k === 'underground' || k === 'splitter'; };
  belts.stepTicks = stepTicks;
  belts.speedOf = speedOf;
  belts.nearLane = function (e, sideDir) { return nearLaneOf(e.dir, sideDir); };
  belts.halfTiles = halfTiles;

  // ---------- topology ----------
  function makeNode(e, half, tx, ty) {
    return { e, half, tx, ty, dir: e.dir & 3, lanes: half < 0 ? e.lanes : e.lanes[half], next: null, mode: 'straight', targetLane: 0,
      step: stepTicks(e), backFeeder: null, sideFeeders: null, curveFeeder: null, frontNode: null, skip2: -1, processedAt: -1 };
  }

  function rebuild() {
    dirty = false;
    nodeByKey = new Map();
    const nodes = [];
    const list = (F.state && F.state.entities) || [];
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!belts.isBeltLike(e)) continue;
      ensureFields(e);
      if (isSplitter(e)) {
        const ht = halfTiles(e);
        for (let h = 0; h < 2; h++) { const n = makeNode(e, h, ht[h][0], ht[h][1]); nodes.push(n); nodeByKey.set(key(n.tx, n.ty), n); }
      } else {
        const n = makeNode(e, -1, e.x, e.y); nodes.push(n); nodeByKey.set(key(e.x, e.y), n);
      }
    }
    // feeders
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const v = DIRS[n.dir];
      const t = nodeByKey.get(key(n.tx + v[0], n.ty + v[1])) || null;
      n.frontNode = t;
      if (!t || t.dir === opp(n.dir)) continue;
      if (kind(n.e) === 'underground' && n.e.io === 'in') continue; // entrances feed only their partner
      if (t.dir === n.dir) t.backFeeder = n;
      else (t.sideFeeders || (t.sideFeeders = [])).push(n);
    }
    // curves
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (kind(n.e) !== 'belt') continue;
      let curve = 0;
      if (!n.backFeeder && n.sideFeeders && n.sideFeeders.length === 1) {
        const f = n.sideFeeders[0];
        curve = (n.dir === rot(f.dir, 1)) ? 1 : -1;
        n.curveFeeder = f;
      }
      n.e.curve = curve;
    }
    // next links
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      n.next = null;
      const ke = kind(n.e);
      if (ke === 'underground' && n.e.io === 'in') {
        const p = n.e.pairId ? F.entities.byId(n.e.pairId) : null;
        const pn = p && !p._removed ? nodeByKey.get(key(p.x, p.y)) : null;
        if (pn && pn.e === p) { n.next = pn; n.mode = 'straight'; }
        continue;
      }
      const t = n.frontNode;
      if (!t || t.dir === opp(n.dir)) continue;
      const kt = kind(t.e);
      if (t.dir === n.dir) {
        if (kt === 'underground' && t.e.io === 'out') continue;   // the hood blocks straight feeds
        n.next = t; n.mode = 'straight';
      } else {
        if (kt === 'splitter') continue;                            // splitters accept straight feeds only
        if (kt === 'belt' && n.e.curve === undefined) { /* noop */ }
        if (kt === 'belt' && t.e.curve !== 0 && t.curveFeeder === n) { n.next = t; n.mode = 'straight'; }
        else { n.next = t; n.mode = 'side'; n.targetLane = nearLaneOf(t.dir, opp(n.dir)); }
      }
    }
    // downstream-first order: walk next-chains, append in reverse
    order = [];
    const state = new Map();
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (state.has(n)) continue;
      const path = [];
      let cur = n;
      while (cur && !state.has(cur)) { state.set(cur, 1); path.push(cur); cur = cur.next; }
      for (let j = path.length - 1; j >= 0; j--) { state.set(path[j], 2); order.push(path[j]); }
    }
  }
  belts.rebuild = rebuild;
  belts.markDirty = function () { dirty = true; };
  belts.nodeAt = function (tx, ty) { if (dirty) rebuild(); return nodeByKey.get(key(tx, ty)) || null; };

  // ---------- simulation ----------
  belts.tick = function () {
    if (!F.state) return;
    if (dirty) rebuild();
    const tick = F.state.tick | 0;
    for (let i = 0; i < order.length; i++) {
      const n = order[i];
      if (tick % n.step !== 0) continue;
      if (n.e._removed) continue;
      n.processedAt = tick;
      const lanes = n.lanes;
      for (let l = 0; l < 2; l++) {
        const lane = lanes[l];
        // exit slot -> next node
        if (lane[3] !== null && n.next && !n.next.e._removed) {
          const nx = n.next;
          if (n.mode === 'straight') {
            const tl = nx.lanes[l];
            if (tl[0] === null) { tl[0] = lane[3]; lane[3] = null; }
          } else {
            const tl = nx.lanes[n.targetLane];
            if (tl[2] === null) { tl[2] = lane[3]; lane[3] = null; if (nx.processedAt !== tick) nx.skip2 = tick; }
          }
        }
        for (let s = 2; s >= 0; s--) {
          if (lane[s] === null) continue;
          if (s === 2 && n.skip2 === tick) continue; // arrived this tick from a side-load / splitter routing
          if (s === 1 && n.half >= 0) {
            // splitter routing at the middle of the half: alternate between the two output halves per lane
            const e = n.e;
            const pref = e.toggle[l] & 1;
            const own = lane, other = e.lanes[1 - n.half][l];
            const first = (pref === n.half) ? own : other;
            const second = (first === own) ? other : own;
            if (first[2] === null) {
              first[2] = lane[1]; lane[1] = null; e.toggle[l] = 1 - pref;
              if (first !== own) markSkip(e, 1 - n.half, tick);
            } else if (second[2] === null) {
              second[2] = lane[1]; lane[1] = null;
              if (second !== own) markSkip(e, 1 - n.half, tick);
            }
            continue;
          }
          if (lane[s + 1] === null) { lane[s + 1] = lane[s]; lane[s] = null; }
        }
      }
    }
  };
  function markSkip(e, half, tick) {
    const ht = halfTiles(e);
    const n = nodeByKey.get(key(ht[half][0], ht[half][1]));
    if (n && n.e === e && n.processedAt !== tick) n.skip2 = tick;
  }

  // ---------- item access ----------
  belts.canInsert = function (e, lane, pos) { const a = laneArr(e, lane); return !!a && a[slotOf(pos)] === null; };
  belts.insert = function (e, lane, pos, item) {
    if (!item || !belts.isBeltLike(e)) return false;
    ensureFields(e);
    const a = laneArr(e, lane); if (!a) return false;
    const s = slotOf(pos);
    if (a[s] !== null) return false;
    a[s] = item;
    return true;
  };
  // sideDir = direction from the belt towards the feeding entity
  belts.insertFromSide = function (e, sideDir, item) {
    if (!item || !belts.isBeltLike(e)) return false;
    ensureFields(e);
    const parallel = (sideDir === e.dir) || (sideDir === opp(e.dir));
    const lane = parallel ? 1 : nearLaneOf(e.dir, sideDir);
    const a = laneArr(e, lane); if (!a) return false;
    if (a[2] !== null) return false;
    a[2] = item;
    return true;
  };
  belts.lanePositionForInserter = function (e, insDir) {
    const parallel = (insDir === e.dir) || (insDir === opp(e.dir));
    return { lane: parallel ? 1 : nearLaneOf(e.dir, insDir), pos: 128 };
  };
  function laneOrder(e, preferLane) {
    const n = isSplitter(e) ? 4 : 2;
    const out = [];
    const p = (preferLane == null) ? -1 : (preferLane | 0);
    if (p >= 0 && p < n) out.push(p);
    for (let i = 0; i < n; i++) if (i !== p) out.push(i);
    return out;
  }
  belts.peek = function (e, filterFn, preferLane) {
    if (!belts.isBeltLike(e) || !e.lanes) return null;
    const lanes = allLanes(e);
    const lo = laneOrder(e, preferLane);
    for (let i = 0; i < lo.length; i++) {
      const a = lanes[lo[i]]; if (!a) continue;
      for (let s = 3; s >= 0; s--) { const it = a[s]; if (it !== null && (!filterFn || filterFn(it))) return [lo[i], s]; }
    }
    return null;
  };
  belts.take = function (e, filterFn, preferLane) {
    const p = belts.peek(e, filterFn, preferLane);
    if (!p) return null;
    const a = laneArr(e, p[0]);
    const it = a[p[1]];
    a[p[1]] = null;
    return it;
  };
  belts.count = function (e) {
    if (!e || !e.lanes) return 0;
    const lanes = allLanes(e); let c = 0;
    for (let i = 0; i < lanes.length; i++) { const a = lanes[i]; if (!a) continue; for (let s = 0; s < SLOTS; s++) if (a[s] !== null) c++; }
    return c;
  };
  function nodeFor(e, half) {
    if (dirty) rebuild();
    if (half >= 0) { const ht = halfTiles(e); return nodeByKey.get(key(ht[half][0], ht[half][1])) || null; }
    return nodeByKey.get(key(e.x, e.y)) || null;
  }
  // [[item, lane, pos]] with pos animated towards the next slot when it is free
  belts.items = function (e) {
    const out = [];
    if (!e || !e.lanes) return out;
    const tick = F.state ? (F.state.tick | 0) : 0;
    const step = stepTicks(e);
    const phase = (tick % step) / step;
    const lanes = allLanes(e);
    const spl = isSplitter(e);
    for (let li = 0; li < lanes.length; li++) {
      const a = lanes[li]; if (!a) continue;
      const half = spl ? (li >> 1) : -1;
      let node = null;
      for (let s = 0; s < SLOTS; s++) {
        const it = a[s]; if (it === null) continue;
        let pos = s * 64 + 32;
        if (s < 3) { if (a[s + 1] === null) pos += phase * 64; }
        else {
          if (!node) node = nodeFor(e, half);
          if (node && node.next && node.mode === 'straight' && !node.next.e._removed && node.next.lanes[li & 1][0] === null) pos += phase * 64;
        }
        out.push([it, li, pos]);
      }
    }
    return out;
  };
  // float tile coordinates of an item at `pos` (0..255, may exceed 255 for animation) on a lane
  belts.laneWorldPos = function (e, lane, pos) {
    let tx = e.x, ty = e.y, l = lane & 1;
    if (isSplitter(e)) { const ht = halfTiles(e); const h = (lane >> 1) & 1; tx = ht[h][0]; ty = ht[h][1]; }
    const d = e.dir & 3;
    const f = DIRS[d], r = DIRS[(d + 1) & 3];
    const cx = tx + 0.5, cy = ty + 0.5;
    const side = l === 0 ? -0.25 : 0.25;
    let t = pos / 256;
    if (kind(e) === 'belt' && e.curve) {
      // quarter arc around the pivot corner between the entry side and the exit side
      const s = e.curve === 1 ? rot(d, 1) : rot(d, 3);      // side where the feeder sits
      const sv = DIRS[s];
      const px = cx + 0.5 * (sv[0] + f[0]), py = cy + 0.5 * (sv[1] + f[1]);
      const inner = (e.curve === 1) === (l === 1);
      const R = inner ? 0.25 : 0.75;
      const u0x = -f[0], u0y = -f[1], u1x = -sv[0], u1y = -sv[1];
      const tt = t > 1 ? 1 : t < 0 ? 0 : t;
      const th = tt * Math.PI / 2;
      const c = Math.cos(th), sn = Math.sin(th);
      let x = px + R * (c * u0x + sn * u1x), y = py + R * (c * u0y + sn * u1y);
      if (t > 1) { x += (t - 1) * f[0]; y += (t - 1) * f[1]; }
      return [x, y];
    }
    return [cx + f[0] * (t - 0.5) + r[0] * side, cy + f[1] * (t - 0.5) + r[1] * side];
  };
  belts.dropAll = function (e) {
    if (!e || !e.lanes) return;
    const lanes = allLanes(e);
    const c = F.entities && F.entities.center ? F.entities.center(e) : [e.x + 0.5, e.y + 0.5];
    for (let i = 0; i < lanes.length; i++) {
      const a = lanes[i]; if (!a) continue;
      for (let s = 0; s < SLOTS; s++) {
        const it = a[s]; if (it === null) continue;
        a[s] = null;
        if (F.ground && F.ground.dropNear) F.ground.dropNear(c[0], c[1], it, 1);
      }
    }
  };

  // ---------- undergrounds ----------
  function unpair(e) {
    if (!e.pairId) return;
    const p = F.entities.byId(e.pairId);
    if (p && p.pairId === e.id) { p.pairId = 0; p.gap = 0; }
    e.pairId = 0; e.gap = 0;
  }
  function pairUnderground(e) {
    const d = def(e); const ug = (d && d.underground) || { maxGap: 4, tier: 'yellow' };
    e.io = 'in'; e.pairId = 0; e.gap = 0;
    const v = DIRS[e.dir & 3];
    const same = o => o && o !== e && !o._removed && kind(o) === 'underground' && (o.dir & 3) === (e.dir & 3) && ((def(o).underground || {}).tier === ug.tier);
    // behind: an unpaired entrance -> we become its exit
    for (let i = 1; i <= ug.maxGap + 1; i++) {
      const o = F.world.entityAt(e.x - v[0] * i, e.y - v[1] * i);
      if (!o || o === e) continue;
      if (same(o)) {
        if (o.io === 'in' && !o.pairId) { e.io = 'out'; e.pairId = o.id; o.pairId = e.id; e.gap = o.gap = i - 1; return; }
        break;
      }
    }
    // ahead: an unpaired exit -> we become its entrance
    for (let i = 1; i <= ug.maxGap + 1; i++) {
      const o = F.world.entityAt(e.x + v[0] * i, e.y + v[1] * i);
      if (!o || o === e) continue;
      if (same(o)) {
        if (o.io === 'out' && !o.pairId) { e.io = 'in'; e.pairId = o.id; o.pairId = e.id; e.gap = o.gap = i - 1; return; }
        break;
      }
    }
  }
  // Force an underground's role ('in' = entrance, 'out' = exit), e.g. when a ghost or
  // blueprint remembers it: an exit built before its entrance would otherwise become an
  // unpaired entrance. Pairs with a matching unpaired partner in range when there is one.
  belts.setUndergroundIO = function (e, io) {
    if (!e || kind(e) !== 'underground' || (io !== 'in' && io !== 'out')) return false;
    if (e.io === io && e.pairId) return true;
    unpair(e);
    pairUnderground(e);
    if (e.io !== io) {
      unpair(e);
      e.io = io;
      const d = def(e); const ug = (d && d.underground) || { maxGap: 4, tier: 'yellow' };
      const v = DIRS[e.dir & 3], s = io === 'out' ? -1 : 1, want = io === 'out' ? 'in' : 'out';
      for (let i = 1; i <= ug.maxGap + 1; i++) {
        const o = F.world.entityAt(e.x + v[0] * i * s, e.y + v[1] * i * s);
        if (!o || o === e) continue;
        if (kind(o) === 'underground' && (o.dir & 3) === (e.dir & 3) && ((def(o).underground || {}).tier === ug.tier)) {
          if (o.io === want && !o.pairId) { e.pairId = o.id; o.pairId = e.id; e.gap = o.gap = i - 1; }
          break;
        }
      }
    }
    dirty = true;
    return true;
  };

  belts.onRotate = function (e) {
    if (!belts.isBeltLike(e)) return;
    if (kind(e) === 'underground') { unpair(e); pairUnderground(e); }
    dirty = true;
  };

  // ---------- behaviours ----------
  function acceptsCount(e) {
    ensureFields(e);
    const lanes = allLanes(e); let free = 0;
    for (let i = 0; i < lanes.length; i++) for (let s = 0; s < SLOTS; s++) if (lanes[i][s] === null) free++;
    return free;
  }
  function insertAny(e, item, count) {
    ensureFields(e);
    let n = 0;
    const lanes = allLanes(e);
    for (let s = 0; s < SLOTS && n < count; s++) for (let i = 0; i < lanes.length && n < count; i++) if (lanes[i][s] === null) { lanes[i][s] = item; n++; }
    return n;
  }
  const common = {
    wake(e) { ensureFields(e); dirty = true; },
    accepts(e, item) { return item ? acceptsCount(e) : 0; },
    insert(e, item, count) { return insertAny(e, item, count == null ? 1 : count); },
    take(e, filter) { return belts.take(e, filter || null, 0); },
    inventories() { return []; },
    status(e) { return (kind(e) === 'underground' && !e.pairId) ? 'no_pair' : (belts.count(e) ? 'working' : 'idle'); },
  };
  F.behaviours.belt = Object.assign({}, common, {
    create(e) { e.lanes = emptyLanes(); e.curve = 0; dirty = true; },
    onRemove(e) { belts.dropAll(e); dirty = true; },
  });
  F.behaviours.underground = Object.assign({}, common, {
    create(e) { e.lanes = emptyLanes(); pairUnderground(e); dirty = true; },
    onRemove(e) { belts.dropAll(e); unpair(e); dirty = true; },
  });
  F.behaviours.splitter = Object.assign({}, common, {
    create(e) { e.lanes = [emptyLanes(), emptyLanes()]; e.toggle = [0, 0]; e.filter = null; e.inPrio = 0; e.outPrio = 0; dirty = true; },
    onRemove(e) { belts.dropAll(e); dirty = true; },
  });

  F.events.on('entity:placed', function () { dirty = true; });
  F.events.on('entity:removed', function () { dirty = true; });
})();
