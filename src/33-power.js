// 33-power.js — F.power (electric poles/networks, solar, accumulators, steam engines)
//               F.fluids (fluid boxes/segments: pipes, pipe-to-ground, offshore pump, boiler, engine)
// See design/ARCHITECTURE.md §10 and design/GDD.md §6.9-6.12, §7.5, §7.6,
// research/entities-and-machines.md §9 and research/transport-belts-inserters-power-mechanics.md §4.4.
//
// Both F.power and F.fluids are defined in this one file/IIFE, so the two share private module state
// directly (no public plumbing needed for F.power.tick() to read the fluid segment a steam engine sits on).
(function () {
  'use strict';

  // ---------------------------------------------------------------------
  // small shared helpers
  // ---------------------------------------------------------------------
  function kWtoJ(kW) { return kW * 1000 / 60; }     // kW (rate) -> J for this tick (1/60 s)
  function JtoKW(J) { return J * 60 / 1000; }

  function safeDef(type) {
    try { return F.data.entityDef(type); } catch (err) { F.log.warn('[power] unknown entity type', type); return null; }
  }

  // ===========================================================================================
  // FLUIDS
  // ===========================================================================================

  // registries of entities that own fluid boxes, rebuilt (rescanned) only when fluidDirty
  let pipes = [];
  let pipeToGrounds = [];
  let pumps = [];
  let boilers = [];
  let fluidEngines = [];
  let registeredFluidEnts = [];  // entities whose behaviour was registered via F.fluids.registerEntity
  let segments = [];          // [{ id, fluid, amount, capacity, boxes:[box,...] }]
  let fluidDirty = true;

  // EXPANSION.md §6.2: F.fluids.registerEntity(behaviour, { boxes(e)->[[boxKey,box],...], ports(e,def)->[{x,y,dir,kind,boxKey}] })
  // Lets feature modules (oil refinery, chemical plant, storage tank, ...) plug their entities into
  // the exact same segment-building/mixing-guard machinery the built-in pipe/boiler/engine/pump use
  // below, without this file knowing anything about their fields. Keyed by def.behaviour.
  const fluidRegistry = {};
  function registerFluidEntity(behaviour, spec) {
    if (!behaviour || !spec || typeof spec.boxes !== 'function' || typeof spec.ports !== 'function') {
      F.log.warn('[fluids] registerEntity: behaviour and {boxes(e),ports(e,def)} are required', behaviour);
      return;
    }
    fluidRegistry[behaviour] = spec;
  }

  // Ports for an entity's fluid boxes. Each port: { x, y, dir, kind, boxKey }
  // dir is the OUTWARD direction the port faces (F.C.DIRS index); (x,y) is the world tile that
  // carries the port. Offsets below are defined relative to the entity's own footprint centre in
  // its dir-0 (north-facing) orientation, then rotated with F.util.rotVec/rotDir by e.dir — this
  // keeps the transform correct even though the footprint's w/h swap for dir 1/3, because a vector
  // measured from the centre stays valid under a pure rotation regardless of box shape.
  function portsOf(e, def) {
    const ports = [];
    switch (def.behaviour) {
      case 'pipe': {
        for (let d = 0; d < 4; d++) ports.push({ x: e.x, y: e.y, dir: d, kind: 'any', boxKey: 'fb' });
        break;
      }
      case 'pipe-to-ground': {
        // visible connection is on the BACK side; the front side links underground to the pair (not a world port)
        const d = F.util.oppDir(e.dir);
        ports.push({ x: e.x, y: e.y, dir: d, kind: 'any', boxKey: 'fb' });
        break;
      }
      case 'offshore-pump': {
        // pump faces water in front (e.dir); its pipe connection is on the back tile side
        const d = F.util.oppDir(e.dir);
        ports.push({ x: e.x, y: e.y, dir: d, kind: 'water', boxKey: 'fb' });
        break;
      }
      case 'boiler': {
        const [w, h] = F.entities.footprint(def, e.dir);
        const cx = e.x + (w - 1) / 2, cy = e.y + (h - 1) / 2;
        const specs = [
          { off: [-1, 0.5], dir: 3, kind: 'water' },   // west end of back row
          { off: [1, 0.5], dir: 1, kind: 'water' },    // east end of back row
          { off: [0, -0.5], dir: 0, kind: 'steam' },   // front row centre
        ];
        for (const s of specs) {
          const ro = F.util.rotVec(s.off, e.dir);
          const rd = F.util.rotDir(s.dir, e.dir);
          ports.push({ x: Math.round(cx + ro[0]), y: Math.round(cy + ro[1]), dir: rd, kind: s.kind, boxKey: s.kind === 'water' ? 'water' : 'steam' });
        }
        break;
      }
      case 'engine': {
        const [w, h] = F.entities.footprint(def, e.dir);
        const cx = e.x + (w - 1) / 2, cy = e.y + (h - 1) / 2;
        const specs = [ { off: [0, -2], dir: 0 }, { off: [0, 2], dir: 2 } ]; // both short ends
        for (const s of specs) {
          const ro = F.util.rotVec(s.off, e.dir);
          const rd = F.util.rotDir(s.dir, e.dir);
          ports.push({ x: Math.round(cx + ro[0]), y: Math.round(cy + ro[1]), dir: rd, kind: 'steam', boxKey: 'steam' });
        }
        break;
      }
      default: {
        // EXPANSION.md §6.2: unknown behaviours consult the registry instead of returning nothing.
        const spec = fluidRegistry[def.behaviour];
        if (spec) {
          try { return spec.ports(e, def) || []; }
          catch (err) { F.log.error('[fluids] registered ports() threw for', def.behaviour, err); return []; }
        }
        break;
      }
    }
    return ports;
  }

  // Resolves an entity's fluid box by boxKey. Built-in behaviours store their box(es) directly as
  // entity properties (e.fb, e.water, e.steam) named exactly like the boxKey portsOf() emits for
  // them, so a plain property read is enough. Registered behaviours are free to hold their boxes
  // however they like (e.g. an array like `e.fin[0]`) as long as boxes(e) reports them under the
  // same boxKey strings their ports(e,def) uses — fall back to that when the direct property is
  // missing, so §6.2's "boxes with fluid null adopt the first fluid pushed" etc. all work for them.
  function boxForKey(e, def, boxKey) {
    if (e[boxKey] !== undefined) return e[boxKey];
    const spec = def && fluidRegistry[def.behaviour];
    if (!spec) return null;
    let boxes;
    try { boxes = spec.boxes(e) || []; } catch (err) { F.log.error('[fluids] registered boxes() threw for', def.behaviour, err); return null; }
    for (let i = 0; i < boxes.length; i++) if (boxes[i][0] === boxKey) return boxes[i][1];
    return null;
  }

  function rebuildFluids() {
    pipes = []; pipeToGrounds = []; pumps = []; boilers = []; fluidEngines = []; registeredFluidEnts = [];
    const boxRecords = [];          // { e, key, box }
    const boxIndex = new Map();     // "id:key" -> index
    function addBox(e, key, box) {
      if (!box) return;
      boxIndex.set(e.id + ':' + key, boxRecords.length);
      boxRecords.push({ e, key, box });
    }

    const all = F.entities.all();
    for (let i = 0; i < all.length; i++) {
      const e = all[i];
      // removed entities stay in the list until the end of the tick (flushRemovals); a rebuild
      // in between must not connect through them
      if (e._removed) continue;
      const def = safeDef(e.type); if (!def) continue;
      switch (def.behaviour) {
        case 'pipe': pipes.push(e); addBox(e, 'fb', e.fb); break;
        case 'pipe-to-ground': pipeToGrounds.push(e); addBox(e, 'fb', e.fb); break;
        case 'offshore-pump': pumps.push(e); addBox(e, 'fb', e.fb); break;
        case 'boiler': boilers.push(e); addBox(e, 'water', e.water); addBox(e, 'steam', e.steam); break;
        case 'engine': fluidEngines.push(e); addBox(e, 'steam', e.steam); break;
        default: {
          // EXPANSION.md §6.2: unknown behaviours consult the registry (oil refinery,
          // chemical plant, storage tank, ...) — same box collection as the built-ins above.
          const spec = fluidRegistry[def.behaviour];
          if (spec) {
            registeredFluidEnts.push(e);
            let boxes;
            try { boxes = spec.boxes(e) || []; }
            catch (err) { F.log.error('[fluids] registered boxes() threw for', def.behaviour, err); boxes = []; }
            for (let bi = 0; bi < boxes.length; bi++) addBox(e, boxes[bi][0], boxes[bi][1]);
          }
          break;
        }
      }
    }

    const parent = boxRecords.map((_, i) => i);
    function find(x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
    function uni(a, b) { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; }

    // underground pairs: direct union regardless of geometric adjacency
    for (const e of pipeToGrounds) {
      if (e.pairId) {
        const ia = boxIndex.get(e.id + ':fb');
        const ib = boxIndex.get(e.pairId + ':fb');
        if (ia != null && ib != null) uni(ia, ib);
      }
    }

    // adjacency via ports facing each other
    const allFluidEnts = [].concat(pipes, pipeToGrounds, pumps, boilers, fluidEngines, registeredFluidEnts);
    const entPorts = new Map();
    const portMap = new Map(); // "x,y:dir" -> [{kind, idx}]
    for (const e of allFluidEnts) {
      const def = safeDef(e.type); if (!def) continue;
      const ports = portsOf(e, def);
      entPorts.set(e.id, ports);
      for (const p of ports) {
        const idx = boxIndex.get(e.id + ':' + p.boxKey);
        if (idx == null) continue;
        const key = p.x + ',' + p.y + ':' + p.dir;
        let arr = portMap.get(key); if (!arr) { arr = []; portMap.set(key, arr); }
        arr.push({ kind: p.kind, idx });
      }
    }
    for (const e of allFluidEnts) {
      const ports = entPorts.get(e.id); if (!ports) continue;
      for (const p of ports) {
        const idx = boxIndex.get(e.id + ':' + p.boxKey); if (idx == null) continue;
        const [dx, dy] = F.util.dirVec(p.dir);
        const nx = p.x + dx, ny = p.y + dy, ndir = F.util.oppDir(p.dir);
        const key = nx + ',' + ny + ':' + ndir;
        const cands = portMap.get(key); if (!cands) continue;
        for (const c of cands) {
          if (c.idx === idx) continue;
          if (p.kind !== 'any' && c.kind !== 'any' && p.kind !== c.kind) continue; // refuse mixing
          uni(idx, c.idx);
        }
      }
    }

    const groups = new Map();
    for (let i = 0; i < boxRecords.length; i++) { const r = find(i); let g = groups.get(r); if (!g) { g = []; groups.set(r, g); } g.push(i); }
    segments = [];
    let segId = 0;
    for (const idxs of groups.values()) {
      let fluid = null, amount = 0, capacity = 0;
      const boxes = [];
      for (const i of idxs) { const rec = boxRecords[i]; capacity += rec.box.cap; amount += rec.box.amount; if (rec.box.fluid) fluid = rec.box.fluid; boxes.push(rec.box); }
      const seg = { id: segId++, fluid, amount, capacity, boxes };
      for (const b of boxes) b._seg = seg;
      segments.push(seg);
    }
    fluidDirty = false;
  }

  function maybeRebuildFluids() { if (fluidDirty) rebuildFluids(); }

  function equalizeSegments() {
    for (const seg of segments) {
      if (!seg.boxes.length || seg.capacity <= 0) continue;
      // boxes only change through their segment: skip segments unchanged since the last pass
      if (seg._eqAmount === seg.amount && seg._eqFluid === seg.fluid) continue;
      seg._eqAmount = seg.amount; seg._eqFluid = seg.fluid;
      const frac = F.util.clamp(seg.amount / seg.capacity, 0, 1);
      const fluid = seg.amount > 0 ? seg.fluid : null;
      for (const box of seg.boxes) { box.amount = box.cap * frac; box.fluid = fluid; box._seg = seg; }
    }
  }

  function fluidsPush(box, fluid, amount) {
    if (!box || amount <= 0) return 0;
    const seg = box._seg;
    if (!seg) {
      if (box.fluid && box.fluid !== fluid) return 0;
      const room = box.cap - box.amount; const acc = F.util.clamp(amount, 0, room);
      box.amount += acc; if (acc > 0) box.fluid = fluid; return acc;
    }
    if (seg.fluid && seg.fluid !== fluid) return 0;
    const room = seg.capacity - seg.amount; const acc = F.util.clamp(amount, 0, room);
    seg.amount += acc; if (acc > 0) seg.fluid = fluid;
    return acc;
  }

  function fluidsPull(box, fluid, amount) {
    if (!box || amount <= 0) return 0;
    const seg = box._seg;
    if (!seg) {
      if (box.fluid !== fluid) return 0;
      const got = Math.min(amount, box.amount); box.amount -= got; if (box.amount <= 1e-9) { box.amount = 0; box.fluid = null; } return got;
    }
    if (seg.fluid !== fluid) return 0;
    const got = Math.min(amount, seg.amount); seg.amount -= got; if (seg.amount <= 1e-9) { seg.amount = 0; seg.fluid = null; }
    return got;
  }

  function refuelBoiler(e) {
    if (F.inv.isEmpty(e.fuel)) return;
    const id = F.inv.firstItem(e.fuel);
    let idef; try { idef = F.data.itemDef(id); } catch (err) { idef = null; }
    if (idef && idef.fuel) { F.inv.remove(e.fuel, id, 1); e.fuelJ += idef.fuel * 1e6; }
  }

  function tickBoiler(e) {
    const def = safeDef(e.type); if (!def) return;
    const fuelPowerKW = (def.boiler && def.boiler.fuelPower) || 1800;
    const burnJ = kWtoJ(fuelPowerKW);
    const waterSeg = e.water._seg, steamSeg = e.steam._seg;
    const waterAmt = waterSeg ? waterSeg.amount : e.water.amount;
    const steamRoom = steamSeg ? (steamSeg.capacity - steamSeg.amount) : (e.steam.cap - e.steam.amount);
    e.progress = burnJ > 0 ? F.util.clamp(e.fuelJ / burnJ, 0, 1) : 0;
    if (waterAmt >= 1 && steamRoom >= 1) {
      if (e.fuelJ < burnJ) refuelBoiler(e);
      if (e.fuelJ >= burnJ) {
        fluidsPull(e.water, 'water', 1);
        fluidsPush(e.steam, 'steam', 1);
        e.fuelJ -= burnJ;
        e._active = true;
      } else e._active = false;
    } else e._active = false;
  }

  function fluidsTick() {
    maybeRebuildFluids();
    for (const e of pumps) {
      const def = safeDef(e.type);
      const rateS = (def && def.offshore_pump && def.offshore_pump.rate) || 1200;
      fluidsPush(e.fb, 'water', rateS / F.C.TPS);
    }
    for (const e of boilers) tickBoiler(e);
    equalizeSegments();
  }

  function fluidsConnections(e) {
    const def = safeDef(e.type); if (!def) return [];
    return portsOf(e, def).map(p => ({ x: p.x, y: p.y, dir: p.dir, kind: p.kind }));
  }

  function fluidsSegmentInfo(e, boxKey) {
    maybeRebuildFluids();
    let box;
    if (boxKey) {
      box = boxForKey(e, safeDef(e.type), boxKey);
    } else {
      box = e.fb || e.steam || e.water;
      if (!box) {
        // EXPANSION.md §6.2: "keeps working for new entities (first box)" — registered
        // behaviours with no fb/water/steam property fall back to their first declared box.
        const def = safeDef(e.type);
        const spec = def && fluidRegistry[def.behaviour];
        if (spec) {
          let boxes; try { boxes = spec.boxes(e) || []; } catch (err) { boxes = []; }
          if (boxes.length) box = boxes[0][1];
        }
      }
    }
    if (!box) return null;
    const seg = box._seg;
    if (seg) return { fluid: seg.fluid, amount: seg.amount, capacity: seg.capacity };
    return { fluid: box.fluid, amount: box.amount, capacity: box.cap };
  }

  // EXPANSION.md §6.2: F.fluids.fluidOf(e) -> fluid id of the first box of a pipe/tank/registered
  // entity, or null (used by the renderer to tint pipes/tanks by contents).
  function fluidsFluidOf(e) {
    const info = fluidsSegmentInfo(e);
    return (info && info.fluid) || null;
  }

  function fluidsCanConnect(type, tx, ty, dir) {
    maybeRebuildFluids();
    const def = safeDef(type); if (!def) return true;
    const phantom = { id: -1, x: tx, y: ty, dir: dir || 0 };
    const ports = portsOf(phantom, def);
    let seen = null;
    for (const p of ports) {
      const [dx, dy] = F.util.dirVec(p.dir);
      const nx = p.x + dx, ny = p.y + dy, ndir = F.util.oppDir(p.dir);
      const other = (F.world && F.world.entityAt) ? F.world.entityAt(nx, ny) : null;
      if (!other) continue;
      const odef = safeDef(other.type); if (!odef) continue;
      const oports = portsOf(other, odef);
      for (const op of oports) {
        if (op.x !== nx || op.y !== ny || op.dir !== ndir) continue;
        if (p.kind !== 'any' && op.kind !== 'any' && p.kind !== op.kind) return false;
        const obox = boxForKey(other, odef, op.boxKey);
        const oseg = obox && obox._seg;
        const ofluid = oseg ? oseg.fluid : (obox && obox.fluid);
        if (ofluid) { if (seen && seen !== ofluid) return false; seen = ofluid; }
      }
    }
    return true;
  }

  function fluidsCanPlacePump(tx, ty, dir) {
    if (!F.world || !F.world.isLand || !F.world.isWater) return false;
    if (!F.world.isLand(tx, ty)) return false;
    const [dx, dy] = F.util.dirVec(dir || 0);
    return F.world.isWater(tx + dx, ty + dy);
  }

  F.fluids = {
    tick: fluidsTick,
    markDirty() { fluidDirty = true; },
    rebuild: rebuildFluids,
    connections: fluidsConnections,
    segmentInfo: fluidsSegmentInfo,
    fluidOf: fluidsFluidOf,
    push: fluidsPush,
    pull: fluidsPull,
    canConnect: fluidsCanConnect,
    canPlacePump: fluidsCanPlacePump,
    registerEntity: registerFluidEntity,
  };

  // ===========================================================================================
  // POWER
  // ===========================================================================================

  let poles = [];
  let networks = new Map();     // netId -> { id, reqAccum(J), reqByType, satisfaction, demandKW, supplyKW, capacityKW, producers, consumersSnapshot }
  let coverage = new Map();     // "tx,ty" -> netId
  let powerDirty = true;
  let epoch = 0;

  function rebuildPower() {
    poles = [];
    const all = F.entities.all();
    for (let i = 0; i < all.length; i++) {
      const e = all[i];
      if (e._removed) continue; // see rebuildFluids
      const def = safeDef(e.type); if (!def) continue;
      if (def.behaviour === 'pole') poles.push(e);
    }

    const parent = new Map();
    for (const p of poles) parent.set(p.id, p.id);
    function find(x) { let r = x; while (parent.get(r) !== r) r = parent.get(r); while (parent.get(x) !== r) { const nx = parent.get(x); parent.set(x, r); x = nx; } return r; }
    function uni(a, b) { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); }
    for (const p of poles) {
      if (!Array.isArray(p.wires)) continue;
      for (const wid of p.wires) if (parent.has(wid)) uni(p.id, wid);
    }
    const rootMinId = new Map();
    for (const p of poles) { const r = find(p.id); const cur = rootMinId.get(r); if (cur == null || p.id < cur) rootMinId.set(r, p.id); }

    const oldNetworks = networks;
    networks = new Map();
    coverage = new Map();
    const sortedPoles = poles.slice().sort((a, b) => a.id - b.id); // earlier-placed pole claims overlapping tiles
    for (const p of sortedPoles) {
      const netId = rootMinId.get(find(p.id));
      let net = networks.get(netId);
      if (!net) {
        const old = oldNetworks.get(netId);
        net = old || { id: netId, reqAccum: 0, reqByType: {}, satisfaction: 1, demandKW: 0, supplyKW: 0, capacityKW: 0, producers: [], consumersSnapshot: {} };
        net.id = netId;
        networks.set(netId, net);
      }
      const def = safeDef(p.type);
      // `supply` is the half-width of the supplied square around the pole's centre. For a 1x1
      // pole, 2.5 -> tiles within 2 of the pole tile (5x5); a 2x2 substation's 9 -> 18x18.
      const half = (def && def.pole && def.pole.supply) || 2.5;
      const w = (def && def.size && def.size[0]) || 1, h = (def && def.size && def.size[1]) || 1;
      const ex = Math.floor(half - w / 2), ey = Math.floor(half - h / 2);
      for (let dx = -ex; dx <= w - 1 + ex; dx++) {
        for (let dy = -ey; dy <= h - 1 + ey; dy++) {
          const key = F.util.key(p.x + dx, p.y + dy);
          if (!coverage.has(key)) coverage.set(key, netId);
        }
      }
    }
    epoch++;
    powerDirty = false;
  }

  function maybeRebuildPower() { if (powerDirty) rebuildPower(); }

  function resolveNetId(e) {
    maybeRebuildPower();
    if (e._netEpoch === epoch) return e._net;
    let found = null;
    const tiles = (F.entities && F.entities.tiles) ? F.entities.tiles(e) : [[e.x, e.y]];
    for (let i = 0; i < tiles.length; i++) {
      const key = F.util.key(tiles[i][0], tiles[i][1]);
      if (coverage.has(key)) { found = coverage.get(key); break; }
    }
    e._net = found; e._netEpoch = epoch;
    return found;
  }

  function daylight() {
    const cycle = F.C.DAY_TICKS || 25200;
    const t = ((F.state.tick % cycle) + cycle) % cycle / cycle;
    if (t >= 0.75 || t < 0.25) return 1;
    if (t < 0.45) return F.util.clamp(1 - (t - 0.25) / 0.2, 0, 1);
    if (t < 0.55) return 0;
    return F.util.clamp((t - 0.55) / 0.2, 0, 1);
  }

  function powerRequest(e, kW) {
    const netId = resolveNetId(e);
    if (netId == null) return 0;
    const net = networks.get(netId); if (!net) return 0;
    const J = kWtoJ(kW);
    net.reqAccum += J;
    const t = e.type;
    let rec = net.reqByType[t]; if (!rec) { rec = { count: 0, kW: 0 }; net.reqByType[t] = rec; }
    rec.count++; rec.kW += kW;
    return net.satisfaction != null ? net.satisfaction : 1;
  }

  const GENERATOR_BEHAVIOURS = { solar: 1, engine: 1, accumulator: 1 };
  function isGenerator(e) {
    const def = e._def || (e._def = safeDef(e.type));
    return !!(def && GENERATOR_BEHAVIOURS[def.behaviour]);
  }
  function powerTick() {
    maybeRebuildPower();
    maybeRebuildFluids();

    // fresh per-tick classification of generators, scanning once (kept out of the lazy pole rebuild
    // so solar/engine/accumulator entities are always picked up without needing to markDirty the
    // pole topology on every generator placed/removed).
    const buckets = new Map(); // netId -> { solarJ, solarCount, engSegs: Map, accList: [] }
    function bucketOf(netId) { let b = buckets.get(netId); if (!b) { b = { solarJ: 0, solarCount: 0, engSegs: new Map(), accList: [] }; buckets.set(netId, b); } return b; }

    const all = F.entities.filtered ? F.entities.filtered('generators', isGenerator) : F.entities.all();
    for (let i = 0; i < all.length; i++) {
      const e = all[i];
      const def = e._def || (e._def = safeDef(e.type)); if (!def) continue;
      if (def.behaviour === 'solar') {
        const netId = resolveNetId(e); if (netId == null) continue;
        const b = bucketOf(netId);
        const peak = (def.solar && def.solar.peak) || 60;
        b.solarJ += kWtoJ(peak) * daylight();
        b.solarCount++;
      } else if (def.behaviour === 'engine') {
        const netId = resolveNetId(e); if (netId == null) continue;
        const b = bucketOf(netId);
        const seg = e.steam && e.steam._seg;
        const segKey = seg || e; // isolated engine (no fluid segment yet) gets its own bucket
        let grp = b.engSegs.get(segKey); if (!grp) { grp = { seg, engines: [], def }; b.engSegs.set(segKey, grp); }
        grp.engines.push(e);
      } else if (def.behaviour === 'accumulator') {
        const netId = resolveNetId(e); if (netId == null) continue;
        bucketOf(netId).accList.push(e);
      }
    }

    for (const net of networks.values()) {
      const b = buckets.get(net.id) || { solarJ: 0, solarCount: 0, engSegs: new Map(), accList: [] };
      const D = net.reqAccum; net.reqAccum = 0;
      const consumersSnapshot = net.reqByType; net.reqByType = {};

      let engineCapTotal = 0;
      for (const grp of b.engSegs.values()) {
        const n = grp.engines.length;
        const powerKW = (grp.def.engine && grp.def.engine.power) || 900;
        const capJ = n * kWtoJ(powerKW);
        const segAvailJ = (grp.seg && grp.seg.fluid === 'steam') ? grp.seg.amount * 30000 : 0;
        grp.supply = Math.min(segAvailJ, capJ);
        engineCapTotal += grp.supply;
      }

      let accDischargeAvail = 0, accChargeRoom = 0;
      const accInfo = [];
      for (const e of b.accList) {
        const def = safeDef(e.type);
        const flowJ = kWtoJ((def && def.accumulator && def.accumulator.flow) || 300);
        const capJ = ((def && def.accumulator && def.accumulator.capacity) || 5000) * 1000;
        const stored = e.stored || 0;
        accDischargeAvail += Math.min(stored, flowJ);
        accChargeRoom += Math.min(capJ - stored, flowJ);
        accInfo.push({ e, flowJ, capJ, stored });
      }

      const Ggen = b.solarJ + engineCapTotal;
      let delivered, satisfaction, engineDrawTotal = 0, accDrawTotal = 0, chargeTotal = 0;
      if (Ggen >= D) {
        delivered = D; satisfaction = 1;
        const solarUsed = Math.min(b.solarJ, D);
        engineDrawTotal = Math.max(0, D - solarUsed);
        const surplus = Ggen - D;
        chargeTotal = Math.min(surplus, accChargeRoom);
        const solarSurplus = Math.max(0, b.solarJ - solarUsed);
        const chargeFromSolar = Math.min(solarSurplus, chargeTotal);
        engineDrawTotal += (chargeTotal - chargeFromSolar);
      } else {
        const avail = Ggen + accDischargeAvail;
        delivered = Math.min(D, avail);
        satisfaction = D > 0 ? delivered / D : 1;
        engineDrawTotal = engineCapTotal;
        accDrawTotal = Math.max(0, delivered - Ggen);
      }

      // draw steam proportionally to each segment's share of engine capacity, split equally
      // among that segment's own engines (redistribution across segments never happens, per GDD §7.5)
      const scale = engineCapTotal > 0 ? Math.min(1, engineDrawTotal / engineCapTotal) : 0;
      for (const grp of b.engSegs.values()) {
        const drawJ = grp.supply * scale;
        if (drawJ > 0 && grp.seg) fluidsPull(grp.engines[0].steam, 'steam', drawJ / 30000);
        const per = grp.engines.length ? drawJ / grp.engines.length : 0;
        for (const e of grp.engines) e.output = JtoKW(per);
      }

      if (accDrawTotal > 1e-6) {
        for (const a of accInfo) {
          const cand = Math.min(a.flowJ, a.stored);
          const share = accDischargeAvail > 0 ? accDrawTotal * (cand / accDischargeAvail) : 0;
          const take = Math.min(cand, share);
          a.e.stored = Math.max(0, a.stored - take);
          a.e._flow = -JtoKW(take);
        }
      } else if (chargeTotal > 1e-6) {
        for (const a of accInfo) {
          const room = Math.min(a.flowJ, a.capJ - a.stored);
          const share = accChargeRoom > 0 ? chargeTotal * (room / accChargeRoom) : 0;
          const give = Math.min(room, share);
          a.e.stored = a.stored + give;
          a.e._flow = JtoKW(give);
        }
      } else {
        for (const a of accInfo) a.e._flow = 0;
      }

      net.satisfaction = satisfaction;
      net.demandKW = JtoKW(D);
      net.supplyKW = JtoKW(delivered);
      net.capacityKW = JtoKW(Ggen + accDischargeAvail);
      net.consumersSnapshot = consumersSnapshot;
      net.producers = [
        { type: 'solar-panel', count: b.solarCount, kW: JtoKW(b.solarJ) },
        { type: 'steam-engine', count: Array.from(b.engSegs.values()).reduce((s, g) => s + g.engines.length, 0), kW: JtoKW(engineDrawTotal) },
        { type: 'accumulator', count: accInfo.length, kW: JtoKW(accDrawTotal - chargeTotal) },
      ].filter(p => p.count > 0);
    }
  }

  function netInfo(e) {
    const netId = resolveNetId(e);
    if (netId == null) return { id: null, demand: 0, supply: 0, capacity: 0, satisfaction: 0, producers: [], consumers: [] };
    const net = networks.get(netId);
    if (!net) return { id: null, demand: 0, supply: 0, capacity: 0, satisfaction: 0, producers: [], consumers: [] };
    const consumers = Object.keys(net.consumersSnapshot || {}).map(t => ({ type: t, count: net.consumersSnapshot[t].count, kW: net.consumersSnapshot[t].kW }));
    return {
      id: net.id,
      demand: net.demandKW || 0,
      supply: net.supplyKW || 0,
      capacity: net.capacityKW || 0,
      satisfaction: net.satisfaction != null ? net.satisfaction : 1,
      producers: net.producers || [],
      consumers,
    };
  }

  F.power = {
    request: powerRequest,
    tick: powerTick,
    networkOf(e) { return resolveNetId(e); },
    netInfo,
    hasNetwork(e) { return resolveNetId(e) != null; },
    isPowered(e) { const id = resolveNetId(e); if (id == null) return false; const net = networks.get(id); return !!net && net.satisfaction > 0; },
    satisfaction(e) { const id = resolveNetId(e); if (id == null) return 0; const net = networks.get(id); return net ? net.satisfaction : 0; },
    daylight,
    markDirty() { powerDirty = true; },
    rebuild: rebuildPower,
  };

  // ===========================================================================================
  // BEHAVIOURS
  // ===========================================================================================

  F.behaviours['pole'] = {
    create(e) {
      maybeRebuildPower(); // ensure `poles` (module list) is current, e itself is already in F.state.entities
      e.wires = [];
      const def = safeDef(e.type);
      const reach = (def && def.pole && def.pole.reach) || 7.5;
      const [cx, cy] = F.entities.center(e);
      const cands = [];
      for (const p of poles) {
        if (p.id === e.id) continue;
        const pdef = safeDef(p.type);
        const preach = (pdef && pdef.pole && pdef.pole.reach) || 7.5;
        const [px, py] = F.entities.center(p);
        const d = F.util.dist(cx, cy, px, py);
        if (d <= Math.min(reach, preach)) cands.push({ p, d });
      }
      cands.sort((a, b) => a.d - b.d);
      for (const c of cands.slice(0, 5)) {
        e.wires.push(c.p.id);
        if (!c.p.wires) c.p.wires = [];
        if (c.p.wires.indexOf(e.id) < 0) c.p.wires.push(e.id);
      }
      F.power.markDirty();
    },
    onRemove(e) {
      if (Array.isArray(e.wires)) {
        for (const wid of e.wires) {
          const other = F.entities.byId(wid);
          if (other && Array.isArray(other.wires)) {
            const i = other.wires.indexOf(e.id);
            if (i >= 0) other.wires.splice(i, 1);
          }
        }
      }
      F.power.markDirty();
    },
    status() { return 'working'; },
  };

  F.behaviours['offshore-pump'] = {
    create(e) { e.fb = { fluid: null, amount: 0, cap: 100 }; F.fluids.markDirty(); },
    onRemove() { F.fluids.markDirty(); },
    status(e) {
      const seg = e.fb._seg;
      const full = seg ? seg.amount >= seg.capacity : e.fb.amount >= e.fb.cap;
      return full ? 'output_full' : 'working';
    },
  };

  F.behaviours['pipe'] = {
    create(e) { e.fb = { fluid: null, amount: 0, cap: 100 }; F.fluids.markDirty(); },
    onRemove() { F.fluids.markDirty(); },
    status() { return 'working'; },
  };

  F.behaviours['pipe-to-ground'] = {
    create(e) {
      e.fb = { fluid: null, amount: 0, cap: 50 };
      e.pairId = 0;
      const [dx, dy] = F.util.dirVec(e.dir);
      // The pair is the nearest pipe-to-ground on this line; anything else on the surface in
      // between (pipes, belts, buildings) is passed underneath. Another pipe-to-ground on the
      // same axis ends the search, paired or not, so parallel lines never cross-link.
      for (let g = 1; g <= 10; g++) {
        const tx = e.x + dx * g, ty = e.y + dy * g;
        const other = (F.world && F.world.entityAt) ? F.world.entityAt(tx, ty) : null;
        if (!other) continue;
        const odef = safeDef(other.type);
        if (!odef || odef.behaviour !== 'pipe-to-ground' || (other.dir & 1) !== (e.dir & 1)) continue;
        if (!other.pairId && other.dir === F.util.oppDir(e.dir)) { e.pairId = other.id; other.pairId = e.id; }
        break;
      }
      F.fluids.markDirty();
    },
    onRemove(e) {
      if (e.pairId) { const other = F.entities.byId(e.pairId); if (other) other.pairId = 0; }
      F.fluids.markDirty();
    },
    status(e) { return e.pairId ? 'working' : 'no_pair'; },
  };

  F.behaviours['boiler'] = {
    create(e) {
      e.fuel = F.inv.create(1);
      e.fuelJ = 0;
      e.water = { fluid: null, amount: 0, cap: 200 };
      e.steam = { fluid: null, amount: 0, cap: 200 };
      e.progress = 0;
      F.fluids.markDirty();
    },
    onRemove() { F.fluids.markDirty(); },
    accepts(e, item) {
      let idef; try { idef = F.data.itemDef(item); } catch (err) { return 0; }
      if (!idef || !idef.fuel) return 0;
      return F.inv.canAdd(e.fuel, item, 1) ? 5 : 0;
    },
    insert(e, item, count) {
      let idef; try { idef = F.data.itemDef(item); } catch (err) { return 0; }
      if (!idef || !idef.fuel) return 0;
      const remaining = F.inv.add(e.fuel, item, count);
      return count - remaining;
    },
    inventories(e) { return [{ name: 'fuel', inv: e.fuel }]; },
    status(e) {
      if (F.inv.isEmpty(e.fuel) && e.fuelJ <= 0) return 'no_fuel';
      const waterSeg = e.water._seg; const wAmt = waterSeg ? waterSeg.amount : e.water.amount;
      if (wAmt < 1) return 'no_water';
      const steamSeg = e.steam._seg; const sRoom = steamSeg ? (steamSeg.capacity - steamSeg.amount) : (e.steam.cap - e.steam.amount);
      if (sRoom < 1) return 'output_full';
      return e._active ? 'working' : 'idle';
    },
  };

  F.behaviours['engine'] = {
    create(e) { e.steam = { fluid: null, amount: 0, cap: 200 }; e.output = 0; F.fluids.markDirty(); },
    onRemove() { F.fluids.markDirty(); },
    status(e) {
      if (!F.power.hasNetwork(e)) return 'not_connected';
      const seg = e.steam._seg; const amt = seg ? seg.amount : e.steam.amount;
      if (amt <= 0) return 'no_steam';
      return e.output > 0 ? 'working' : 'idle';
    },
  };

  F.behaviours['solar'] = {
    create() { /* no per-entity state beyond the common entity record */ },
    status(e) {
      if (!F.power.hasNetwork(e)) return 'not_connected';
      return F.power.daylight() > 0 ? 'working' : 'idle';
    },
  };

  F.behaviours['accumulator'] = {
    create(e) { e.stored = 0; e._flow = 0; },
    status(e) {
      if (!F.power.hasNetwork(e)) return 'not_connected';
      return e._flow ? 'working' : 'idle';
    },
  };
})();
