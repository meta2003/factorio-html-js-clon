// Fluid networks: the bot keeps one pipe network per fluid (crude oil, water, heavy oil, ...)
// and connects machine ports to them with an A* router over the tile grid. A pipe connects to
// every pipe next to it, so the router never puts a pipe next to a pipe or port of another
// fluid; where a line must cross another one it goes under it with a pipe-to-ground pair.
'use strict';
const { key, DIRV, Heap } = require('./util');

function createPipes(ctx) {
  const F = ctx.F;
  // conn: tile -> Map(fluid -> Set(source)) — a pipe placed on this tile would connect to these
  // fluids; the source ('ent:<id>' for a building's port, 'pipe') lets a route ignore the ports of
  // the very building it starts from.
  const conn = new Map();
  // keepout: tiles in front of machine ports (reserved for their pipe), tile -> fluid.
  const keepout = new Map();
  const nets = {}; // fluid -> { pipes: count }
  const pipeFluid = new Map(); // tile of a pipe / pipe-to-ground the bot placed -> fluid
  // Port sources already part of their fluid's network ('ent:<id>|fluid'). Only these, and
  // the bot's pipes (always connected), are goals for new routes — never a dangling port.
  const networked = new Set();
  function markNetworked(e, fluid) { networked.add('ent:' + e.id + '|' + fluid); }

  function addConn(x, y, fluid, src) {
    const k = key(x, y);
    let m = conn.get(k); if (!m) { m = new Map(); conn.set(k, m); }
    let s = m.get(fluid); if (!s) { s = new Set(); m.set(fluid, s); }
    s.add(src || 'pipe');
  }
  function isKeepout(x, y) { return keepout.has(key(x, y)); }

  // Port list of a fluid entity with the box each port feeds (same order as the game's own
  // port list: see 33-power.js portsOf and 37-oil.js crafterPorts).
  function portsWithBoxes(e) {
    const ports = F.fluids.connections(e);
    const def = F.data.entities[e.type];
    return ports.map((p, i) => {
      let box = 'fb';
      if (def.behaviour === 'crafter') box = i < e.fin.length ? 'fin' + i : 'fout' + (i - e.fin.length);
      else if (def.behaviour === 'boiler') box = i < 2 ? 'water' : 'steam';
      else if (def.behaviour === 'engine') box = 'steam';
      return { x: p.x, y: p.y, dir: p.dir, box, ax: p.x + DIRV[p.dir][0], ay: p.y + DIRV[p.dir][1] };
    });
  }
  function boxOf(e, box) {
    if (box.startsWith('fin')) return e.fin[+box.slice(3)];
    if (box.startsWith('fout')) return e.fout[+box.slice(4)];
    return e[box];
  }

  // Register a fluid entity: fluidOf(box) says which fluid each of its boxes will carry
  // (null = unused port; nothing may connect there).
  function registerEntity(e, fluidOf) {
    for (const p of portsWithBoxes(e)) {
      const f = fluidOf(p.box) || '#none';
      addConn(p.ax, p.ay, f, 'ent:' + e.id);
      if (!F.world.entityAt(p.ax, p.ay)) keepout.set(key(p.ax, p.ay), f);
    }
  }
  function dropConn(x, y, fluid, src) {
    const m = conn.get(key(x, y)); if (!m) return;
    const s = m.get(fluid); if (!s) return;
    s.delete(src); if (!s.size) m.delete(fluid); if (!m.size) conn.delete(key(x, y));
  }
  function registerPipe(x, y, fluid) {
    pipeFluid.set(key(x, y), fluid);
    for (const [dx, dy] of DIRV) addConn(x + dx, y + dy, fluid, 'pipe:' + x + ',' + y);
    keepout.delete(key(x, y));
    (nets[fluid] = nets[fluid] || { pipes: 0 }).pipes++;
  }
  function unregister(s, fluid) {
    pipeFluid.delete(key(s.x, s.y));
    const src = 'pipe:' + s.x + ',' + s.y;
    if (s.type === 'pipe') for (const [dx, dy] of DIRV) dropConn(s.x + dx, s.y + dy, fluid, src);
    else { const b = DIRV[(s.dir + 2) % 4]; dropConn(s.x + b[0], s.y + b[1], fluid, src); }
  }
  function registerPtg(x, y, dir, fluid) {
    pipeFluid.set(key(x, y), fluid);
    const b = DIRV[(dir + 2) % 4];
    addConn(x + b[0], y + b[1], fluid, 'pipe:' + x + ',' + y);
    keepout.delete(key(x, y));
    (nets[fluid] = nets[fluid] || { pipes: 0 }).pipes++;
  }

  // ------------------------------------------------------------------ routing
  let startKey = null; // the route's first tile may lie inside its own building's reservation
  let selfSrc = null;  // ports of the building being connected are not a goal
  function freeTile(x, y, fluid) {
    if (!F.world.isLand(x, y) || F.world.entityAt(x, y)) return false;
    if (ctx.space.isReserved(x, y) && key(x, y) !== startKey) return false;
    if (banned.size && banned.has(key(x, y))) return false;
    const k = key(x, y);
    const ko = keepout.get(k);
    if (ko !== undefined && ko !== fluid) return false;
    return true;
  }
  function pipeOk(x, y, fluid) {
    if (!freeTile(x, y, fluid)) return false;
    const m = conn.get(key(x, y));
    if (m) for (const f of m.keys()) if (f !== fluid) return false;
    // never next to the reserved tile in front of another fluid's port: that port could
    // then only ever connect to this pipe
    for (const [dx, dy] of DIRV) {
      const ko = keepout.get(key(x + dx, y + dy));
      if (ko !== undefined && ko !== fluid && key(x + dx, y + dy) !== startKey) return false;
    }
    return true;
  }
  function isGoal(x, y, fluid) {
    const m = conn.get(key(x, y));
    const s = m && m.get(fluid);
    if (!s) return false;
    for (const src of s) {
      if (src === selfSrc) continue;
      if (src.startsWith('pipe:') || networked.has(src + '|' + fluid)) return true;
    }
    return false;
  }
  function tileCost(x, y) {
    let c = 1;
    if (F.world.feature(x, y)) c += 4;
    if (F.world.resource(x, y)) c += 3;
    return c;
  }
  function ptgBetweenBlocked(x0, y0, d, m) {
    // no pipe-to-ground on the same axis strictly between the pair, or the pair would not form
    for (let i = 1; i < m; i++) {
      const e = F.world.entityAt(x0 + DIRV[d][0] * i, y0 + DIRV[d][1] * i);
      if (e && e.type === 'pipe-to-ground' && (e.dir & 1) === (d & 1)) return true;
    }
    return false;
  }

  // Route from the start tile (the tile in front of a port) to the fluid's network.
  // Returns a list of steps [{ type:'pipe'|'pipe-to-ground', x, y, dir }] or null.
  const banned = new Set(); // tiles a retried route must avoid (a jump reused them)
  function route(fluid, sx, sy, goalHint, self) {
    startKey = key(sx, sy); selfSrc = self || null;
    try {
      for (let attempt = 0; attempt < 4; attempt++) {
        const steps = routeInner(fluid, sx, sy, goalHint);
        if (!steps) return null;
        const seen = new Set(); let dup = null;
        for (const s of steps) { const k = key(s.x, s.y); if (seen.has(k)) dup = k; seen.add(k); }
        if (!dup) return steps;
        banned.add(dup);
      }
      lastRouteInfo = 'route keeps reusing a tile';
      return null;
    } finally { startKey = null; selfSrc = null; banned.clear(); }
  }
  function routeInner(fluid, sx, sy, goalHint) {
    if (!pipeOk(sx, sy, fluid)) return null;
    if (isGoal(sx, sy, fluid)) return [{ type: 'pipe', x: sx, y: sy, dir: 0 }];
    const gx = goalHint ? goalHint[0] : sx, gy = goalHint ? goalHint[1] : sy;
    const x0 = Math.min(sx, gx) - 30, x1 = Math.max(sx, gx) + 30, y0 = Math.min(sy, gy) - 30, y1 = Math.max(sy, gy) + 30;
    const h = (x, y) => (Math.abs(x - gx) + Math.abs(y - gy)) * 1.05;
    const open = new Heap();
    const best = new Map();
    const start = { x: sx, y: sy, g: 0, f: h(sx, sy), prev: null, via: null };
    open.push(start); best.set(key(sx, sy), 0);
    let expanded = 0;
    lastRouteInfo = null;
    while (open.size && expanded++ < 150000) {
      const n = open.pop();
      if (best.get(key(n.x, n.y)) < n.g) continue;
      if (isGoal(n.x, n.y, fluid) && n.prev) return unwind(n);
      for (let d = 0; d < 4; d++) {
        const [dx, dy] = DIRV[d];
        // plain pipe step
        const nx = n.x + dx, ny = n.y + dy;
        if (nx >= x0 && nx <= x1 && ny >= y0 && ny <= y1 && pipeOk(nx, ny, fluid) && !(n.vt && n.vt.includes(key(nx, ny)))) push(n, nx, ny, n.g + tileCost(nx, ny), null);
        // underground jump: entrance at n+d, exit m tiles further, landing one beyond the exit
        const ex = n.x + dx, ey = n.y + dy;
        if (!freeTile(ex, ey, fluid)) continue;
        for (let m = 2; m <= 10; m++) {
          const ox = ex + dx * m, oy = ey + dy * m, lx = ox + dx, ly = oy + dy;
          if (lx < x0 || lx > x1 || ly < y0 || ly > y1) break;
          if (!freeTile(ox, oy, fluid) || !pipeOk(lx, ly, fluid)) continue;
          if (ptgBetweenBlocked(ex, ey, d, m)) break;
          if (onPath(n, [key(ex, ey), key(ox, oy), key(lx, ly)])) continue;
          push(n, lx, ly, n.g + 8 + m * 0.3 + tileCost(lx, ly), { d, ex, ey, ox, oy });
        }
      }
    }
    lastRouteInfo = { expanded, open: open.size, from: [sx, sy], to: [gx, gy] };
    return null;
    function push(n, x, y, g, via) {
      const k = key(x, y);
      const b = best.get(k);
      if (b !== undefined && b <= g) return;
      best.set(k, g);
      // vt: tiles taken by the path's recent pipe-to-ground pairs (a later pipe may not reuse them)
      let vt = n.vt || null;
      if (via) vt = (vt || []).concat([key(via.ex, via.ey), key(via.ox, via.oy)]).slice(-12);
      open.push({ x, y, g, f: g + h(x, y), prev: n, via, vt });
    }
    // is any of `keys` already used by the path ending at n (pipes and pipe-to-grounds)?
    function onPath(n, keys) {
      let c = n, i = 0;
      while (c && i++ < 60) {
        if (keys.includes(key(c.x, c.y))) return true;
        if (c.via && (keys.includes(key(c.via.ex, c.via.ey)) || keys.includes(key(c.via.ox, c.via.oy)))) return true;
        c = c.prev;
      }
      return false;
    }
    function unwind(n) {
      const steps = [];
      for (let c = n; c; c = c.prev) {
        steps.push({ type: 'pipe', x: c.x, y: c.y, dir: 0 });
        if (c.via) {
          steps.push({ type: 'pipe-to-ground', x: c.via.ox, y: c.via.oy, dir: (c.via.d + 2) % 4 });
          steps.push({ type: 'pipe-to-ground', x: c.via.ex, y: c.via.ey, dir: c.via.d });
        }
      }
      return steps.reverse();
    }
  }

  // Connect port `box` of entity e to the network of `fluid`. goalHint: a tile near the
  // network (for the search heuristic). Returns 'done' | 'wait' (materials/trees) | 'fail'.
  function connect(e, box, fluid, goalHint) {
    const port = portsWithBoxes(e).find(p => p.box === box);
    if (!port) return 'fail';
    const b = boxOf(e, box);
    if (b && b._connected) return 'done';
    const steps = route(fluid, port.ax, port.ay, goalHint || nearestNetTile(fluid, port.ax, port.ay, 'ent:' + e.id), 'ent:' + e.id);
    if (!steps) { ctx.lastRouteFail = lastRouteInfo; return 'fail'; }
    // materials
    const pipesN = steps.filter(s => s.type === 'pipe').length, ptgN = steps.length - pipesN;
    const stock = ctx.hands.stock;
    if (stock.count('pipe') < pipesN || stock.count('pipe-to-ground') < ptgN) {
      ctx.need('pipe', pipesN + 10); if (ptgN) ctx.need('pipe-to-ground', ptgN + 2);
      return 'wait';
    }
    // trees in the way
    let clean = true;
    for (const s of steps) if (F.world.feature(s.x, s.y)) { clean = false; ctx.space.clear({ x: s.x, y: s.y, w: 1, h: 1 }); }
    if (!clean) return 'wait';
    const tiles = new Set(steps.map(s => key(s.x, s.y)));
    if (tiles.size !== steps.length) { ctx.lastRouteFail = 'route reuses a tile'; return 'fail'; }
    for (const s of steps) {
      const chk = F.api.canPlace(s.type, s.x, s.y, s.dir, { ignorePlayer: true });
      if (!chk.ok) { ctx.lastRouteFail = s.type + ' at ' + s.x + ',' + s.y + ': ' + chk.reason; return 'fail'; }
    }
    const placed = [];
    const rollback = why => {
      ctx.log('pipe to ' + e.type + '#' + e.id + ' rolled back: ' + why);
      for (const p of placed.reverse()) { const pe = F.world.entityAt(p.x, p.y); if (pe) ctx.hands.remove(pe); unregister(p, fluid); }
      return 'fail';
    };
    for (const s of steps) {
      const pe = ctx.hands.place(s.type, s.x, s.y, s.dir);
      if (!pe) return rollback('placement failed at ' + s.x + ',' + s.y + ' (' + s.type + '): ' + F.api.canPlace(s.type, s.x, s.y, s.dir).reason);
      placed.push(s);
      if (s.type === 'pipe') registerPipe(s.x, s.y, fluid); else registerPtg(s.x, s.y, s.dir, fluid);
    }
    // the port must now share a segment with the rest of the network
    const seed = ctx.oil && ctx.oil.seeds[fluid];
    if (seed && seed !== e) {
      const seedBox = portsWithBoxes(seed)[0].box;
      if (!sameSegment(e, box, seed, seedBox)) return rollback('not in the ' + fluid + ' segment');
    }
    ctx.stats.pipes += steps.length;
    if (b) b._connected = true;
    markNetworked(e, fluid);
    lastTile[fluid] = [port.ax, port.ay];
    return 'done';
  }
  const lastTile = {};
  let lastRouteInfo = null;
  function nearestNetTile(fluid, x, y, self) {
    let best = null, bd = Infinity;
    for (const [k, m] of conn) {
      const s = m.get(fluid);
      if (!s || ![...s].some(src => src !== self && (src.startsWith('pipe:') || networked.has(src + '|' + fluid)))) continue;
      const i = k.indexOf(','); const tx = +k.slice(0, i), ty = +k.slice(i + 1);
      const d = Math.abs(tx - x) + Math.abs(ty - y);
      if (d < bd && (tx !== x || ty !== y)) { bd = d; best = [tx, ty]; }
    }
    return best;
  }

  // Can a fluid building of `type` go at (x, y, dir) with its ports carrying fluidOf(box)?
  // Every used port needs a free tile (or a pipe of its own fluid) in front of it, every
  // unused port must face no pipe, and no port may face a tile reserved for another fluid.
  function spotPortsOk(type, x, y, dir, fluidOf) {
    const def = F.data.entities[type];
    const ph = { id: -1, type, x, y, dir, fin: new Array((def.crafter && def.crafter.fluidIn) || 0), fout: new Array((def.crafter && def.crafter.fluidOut) || 0) };
    for (const p of portsWithBoxes(ph)) {
      const f = fluidOf(p.box);
      const k = key(p.ax, p.ay);
      const ent = F.world.entityAt(p.ax, p.ay);
      if (ent) {
        if (!f || pipeFluid.get(k) !== f) return false;
        continue;
      }
      if (!f) continue;
      if (!F.world.isLand(p.ax, p.ay) || ctx.space.isReserved(p.ax, p.ay)) return false;
      const ko = keepout.get(k);
      if (ko !== undefined && ko !== f) return false;
      for (const [dx, dy] of DIRV) {
        const n = keepout.get(key(p.ax + dx, p.ay + dy));
        if (n !== undefined && n !== f) return false;
        if (pipeFluid.has(key(p.ax + dx, p.ay + dy)) && pipeFluid.get(key(p.ax + dx, p.ay + dy)) !== f) return false;
      }
      const c = conn.get(k);
      if (c) for (const cf of c.keys()) if (cf !== f) return false;
    }
    return true;
  }
  // Hold the tiles in front of a planned building's ports until it is built and piped.
  function reservePorts(type, x, y, dir, fluidOf) {
    for (const p of portTiles(type, x, y, dir)) {
      const f = fluidOf(p.box) || '#none';
      if (!F.world.entityAt(p.ax, p.ay)) keepout.set(key(p.ax, p.ay), f);
    }
  }
  function portTiles(type, x, y, dir) {
    const def = F.data.entities[type];
    const ph = { id: -1, type, x, y, dir, fin: new Array((def.crafter && def.crafter.fluidIn) || 0), fout: new Array((def.crafter && def.crafter.fluidOut) || 0) };
    return portsWithBoxes(ph);
  }

  // Are two boxes in the same fluid segment right now?
  function sameSegment(e1, box1, e2, box2) {
    F.fluids.segmentInfo(e1); // rebuilds the segments only if something changed
    const a = boxOf(e1, box1), b = boxOf(e2, box2);
    return !!(a && b && a._seg && a._seg === b._seg);
  }

  return { _conn: conn, _keepout: keepout, pipeOk, reservePorts, markNetworked, registerEntity, registerPipe, registerPtg, connect, route, sameSegment, isKeepout, portsWithBoxes, boxOf, nets, spotPortsOk, portTiles, pipeFluid };
}

module.exports = { createPipes };
