// 36-pollution.js — per-chunk pollution, absorption, diffusion, spawner attack
// banks and the enemy evolution factor.
// See design/ARCHITECTURE.md §13 and design/GDD.md §7.7 (pollution), §7.8
// (evolution), §2.6 (tree absorption), §7.9.2 (spawner attack bank).
// Pure simulation module: no DOM access, safe to run fully headless.
(function () {
  'use strict';

  // ---------------------------------------------------------------------
  // i18n — this module registers only its own `ui.pollution.*` keys, for
  // whichever UI/minimap code later wants to label the pollution overlay
  // and the evolution readout. Everything else here is pure simulation.
  // ---------------------------------------------------------------------
  F.i18n.add('en', {
    'ui.pollution.label': 'Pollution',
    'ui.pollution.chunkTooltip': 'Chunk pollution: {n}',
    'ui.pollution.total': 'Total pollution: {n}',
    'ui.pollution.evolution': 'Enemy evolution: {pct}%',
  });

  // ---------------------------------------------------------------------
  // Constants (GDD §7.7, §7.8, §2.6, §7.9.1/§7.9.2/§7.9.3).
  // ---------------------------------------------------------------------
  const ABSORB_PER_SEC = {
    water: 0.000025,
    grassDirt: 0.000018,
    sandDesert: 0.000015,
    treeEach: 0.001, // living tree, GDD §2.6 ("living −0.001 PU/s each")
  };
  // Pollution cost to join an attack group, per GDD §7.9.1.
  const UNIT_COSTS = { 'small-biter': 4, 'medium-biter': 20, 'big-biter': 80 };
  const MIN_UNIT_COST = 4;
  const MOST_EXPENSIVE_COST = 80;
  const MAX_BANK = 3 * MOST_EXPENSIVE_COST; // GDD §7.9.2 "3 × mostExpensiveSpawnableCost"
  const SPAWNER_TYPE = 'biter-spawner';
  // Spawn-weight table, GDD §7.9.3: piecewise-linear points (evolution, weight).
  const WEIGHT_POINTS = {
    'small-biter': [[0.0, 0.3], [0.6, 0.0]],
    'medium-biter': [[0.2, 0.0], [0.6, 0.3], [0.7, 0.1]],
    'big-biter': [[0.5, 0.0], [1.0, 0.4]],
  };
  const ATTACK_BANK_THRESHOLD = 20;      // GDD §7.7 "if pollution > 20"
  const DIFFUSE_THRESHOLD = 15;          // GDD §7.7 "pollution ≥ 15"
  const DIFFUSE_SHARE = 0.02;            // 2 % to each of 4 neighbours
  const OVERLAY_FLOOR = 50, OVERLAY_CAP = 150; // GDD §7.7 map overlay
  const EVO_TIME_PER_SEC = 0.000004;     // GDD §7.8 time factor
  const EVO_POLLUTION_FACTOR = 0.0000009; // GDD §7.8 pollution factor
  const EVO_SPAWNER_DESTROYED = 0.002;   // GDD §7.8 destroy factor
  const SPEND_GUARD = 20;                // safety cap on bank-spend loop per spawner per cycle

  // ---------------------------------------------------------------------
  // Module-owned state, lazily created and defensively repaired (mirrors
  // the pattern used by 34-research.js's state() helper). Not listed in
  // ARCHITECTURE.md §18's F.newGame sketch (that listing is not
  // exhaustive of every module's own scratch state), but plain
  // JSON-safe data so F.save()/F.load() round-trip it for free.
  //   F.state.pollution = {
  //     emittedAccum: 0,   // PU emitted map-wide since the last 64-tick update (for the evolution pollution factor)
  //     pending: {},       // "cx,cy" -> PU waiting to be applied once that chunk is generated (GDD §7.7 diffusion note)
  //   }
  // ---------------------------------------------------------------------
  function state() {
    if (!F.state) return null;
    let p = F.state.pollution;
    if (!p || typeof p !== 'object') p = F.state.pollution = {};
    if (typeof p.emittedAccum !== 'number' || !isFinite(p.emittedAccum)) p.emittedAccum = 0;
    if (!p.pending || typeof p.pending !== 'object') p.pending = {};
    return p;
  }

  // F.state.enemies.evoTotal is the raw accumulator (per task/ARCHITECTURE
  // §13); F.state.enemies.evolution is kept in sync as the displayed 0..1
  // value so F.combat.evolution() (ARCHITECTURE §12) can read it directly
  // without re-deriving the formula.
  function enemiesState() {
    if (!F.state) return null;
    let e = F.state.enemies;
    if (!e || typeof e !== 'object') e = F.state.enemies = {};
    if (typeof e.evoTotal !== 'number' || !isFinite(e.evoTotal)) e.evoTotal = 0;
    if (typeof e.killedSpawners !== 'number') e.killedSpawners = 0;
    e.evolution = e.evoTotal / (1 + e.evoTotal);
    return e;
  }

  // ---------------------------------------------------------------------
  // Small cross-module helpers with safe fallbacks (per ENGINEERING-
  // CONSTRAINTS / ARCHITECTURE preamble: "if you need something from
  // another module that is not listed here, implement a local fallback").
  // ---------------------------------------------------------------------
  function chunkKeyOf(cx, cy) {
    if (F.world && typeof F.world.chunkKey === 'function') return F.world.chunkKey(cx, cy);
    return cx + ',' + cy; // matches F.util.key(tx,ty) formatting used elsewhere
  }

  function unkeyChunk(key) {
    if (F.util && typeof F.util.unkey === 'function') return F.util.unkey(key);
    const i = key.indexOf(',');
    return [parseInt(key.slice(0, i), 10), parseInt(key.slice(i + 1), 10)];
  }

  // Resolve the chunk an entity's emissions belong to. Uses the entity's
  // top-left tile (footprint straddling a chunk edge is a rare, accepted
  // simplification — GDD does not specify sub-chunk emission splitting).
  function chunkOfEntity(entity) {
    if (!entity || typeof entity.x !== 'number' || typeof entity.y !== 'number') return null;
    if (F.world && typeof F.world.chunkOf === 'function') {
      const r = F.world.chunkOf(entity.x, entity.y);
      return { cx: r[0], cy: r[1] };
    }
    return { cx: Math.floor(entity.x / F.C.CHUNK), cy: Math.floor(entity.y / F.C.CHUNK) };
  }

  // `create` = true also generates the chunk if missing (used by emit(),
  // since an entity's home chunk should already exist in practice — this
  // is just a defensive fallback). `create` = false (queries) never
  // generates, matching F.world.chunkAt's no-generation contract.
  function getChunk(cx, cy, create) {
    if (!F.state || !F.state.world) return null;
    if (!F.state.world.chunks) F.state.world.chunks = {};
    const key = chunkKeyOf(cx, cy);
    let c = F.state.world.chunks[key];
    if (!c && create && F.world && typeof F.world.ensureChunk === 'function') {
      try { c = F.world.ensureChunk(cx, cy); } catch (err) { F.log.warn('[pollution] ensureChunk failed', err); c = null; }
    }
    return c || null;
  }

  // ---------------------------------------------------------------------
  // Terrain classification, memoized. ARCHITECTURE.md §5 only guarantees
  // "water = ids < 2"; the remaining ids may be reordered by F.world, so
  // we classify by name via F.world.TERRAIN when available and fall back
  // to the documented example ordering (2-6 grass/dirt, 7-9 sand/desert)
  // otherwise. Cached once (terrain ids are static for the session).
  // ---------------------------------------------------------------------
  let terrainClassCache = null;
  function buildTerrainClassCache() {
    terrainClassCache = {};
    if (F.world && F.world.TERRAIN && typeof F.world.TERRAIN === 'object') {
      for (const name in F.world.TERRAIN) {
        if (!Object.prototype.hasOwnProperty.call(F.world.TERRAIN, name)) continue;
        const id = F.world.TERRAIN[name];
        const n = String(name).toUpperCase();
        let cat;
        if (n.indexOf('WATER') >= 0) cat = 'water';
        else if (n.indexOf('SAND') >= 0 || n.indexOf('DESERT') >= 0) cat = 'sandDesert';
        else cat = 'grassDirt';
        terrainClassCache[id] = cat;
      }
    } else {
      for (let i = 0; i < 10; i++) terrainClassCache[i] = i < 2 ? 'water' : (i <= 6 ? 'grassDirt' : 'sandDesert');
    }
  }
  function classifyTerrain(id) {
    if (!terrainClassCache) buildTerrainClassCache();
    const cat = terrainClassCache[id];
    return cat || 'grassDirt';
  }

  // ---------------------------------------------------------------------
  // emit() — public API. Adds pollution directly to the entity's chunk
  // (per-tick small increments from machines, e.g. ARCHITECTURE §9:
  // "F.pollution.emit(e, def.pollution / 3600 * activity)"), and tracks
  // the map-wide emitted total for the evolution "pollution factor"
  // (GDD §7.8), applied once per 64-tick update in spread().
  // ---------------------------------------------------------------------
  function emit(entity, amount) {
    if (!F.state) return;
    if (typeof amount !== 'number' || !isFinite(amount) || amount <= 0) return; // 0/negative/NaN: silent no-op
    const loc = chunkOfEntity(entity);
    if (!loc) { F.log.warn('[pollution] emit: invalid entity', entity); return; }
    const chunk = getChunk(loc.cx, loc.cy, true);
    if (!chunk) { F.log.warn('[pollution] emit: no chunk at', loc.cx, loc.cy); return; }
    chunk.pollution = (chunk.pollution || 0) + amount;
    const st = state();
    if (st) st.emittedAccum += amount;
  }

  // ---------------------------------------------------------------------
  // Evolution (GDD §7.8).
  // ---------------------------------------------------------------------
  function addEvo(delta) {
    if (!delta || !isFinite(delta)) return;
    const e = enemiesState();
    if (!e) return;
    e.evoTotal = Math.max(0, e.evoTotal + delta);
    e.evolution = e.evoTotal / (1 + e.evoTotal);
  }

  function evolution() {
    const e = enemiesState();
    return e ? F.util.clamp(e.evolution, 0, 1) : 0;
  }

  // Destroy factor: +0.002 per spawner destroyed (ARCHITECTURE §13 wires
  // this through F.events; F.combat is expected to emit it on death).
  F.events.on('spawner:destroyed', function () { addEvo(EVO_SPAWNER_DESTROYED); });

  // ---------------------------------------------------------------------
  // Spawn-weight table (GDD §7.9.3): piecewise-linear interpolation, 0
  // before the first point, held constant after the last.
  // ---------------------------------------------------------------------
  function weightAt(points, e) {
    if (e <= points[0][0]) return e === points[0][0] ? points[0][1] : 0;
    for (let i = 1; i < points.length; i++) {
      if (e <= points[i][0]) {
        const x0 = points[i - 1][0], y0 = points[i - 1][1], x1 = points[i][0], y1 = points[i][1];
        const t = x1 === x0 ? 0 : (e - x0) / (x1 - x0);
        return y0 + (y1 - y0) * t;
      }
    }
    return points[points.length - 1][1];
  }

  function pickUnitType(evo) {
    const types = Object.keys(WEIGHT_POINTS);
    let sum = 0;
    const w = {};
    for (let i = 0; i < types.length; i++) {
      const v = Math.max(0, weightAt(WEIGHT_POINTS[types[i]], evo));
      w[types[i]] = v; sum += v;
    }
    if (sum <= 0) return { type: 'small-biter', cost: UNIT_COSTS['small-biter'] };
    let r = F.rng.next() * sum; // F.rng only — deterministic simulation RNG
    for (let i = 0; i < types.length; i++) {
      r -= w[types[i]];
      if (r <= 0) return { type: types[i], cost: UNIT_COSTS[types[i]] };
    }
    const last = types[types.length - 1];
    return { type: last, cost: UNIT_COSTS[last] };
  }

  // ---------------------------------------------------------------------
  // Per-chunk absorption cache (GDD §7.7 absorption table, §2.6 trees).
  // Terrain tile counts never change post-generation, so they are cached
  // once (chunk._pol.terrainDone). Tree counts change over time (mining,
  // fire) and are rescanned every 64-tick update, as the task specifies.
  // The Chunk shape in ARCHITECTURE.md §5 has a single `feature` id for
  // living trees (no separate dead-tree id, no leaf-loss stage storage),
  // so dead-tree absorption (-0.0001 PU/s) and the stage-based decay of
  // living-tree absorption are not represented; every `feature === 1`
  // tile is counted as one living tree at full absorption. This is a
  // documented simplification forced by the available state shape.
  // Cache lives under `chunk._pol` so F.save() strips it (keys starting
  // with '_' are not persisted) and it is rebuilt lazily after load.
  // ---------------------------------------------------------------------
  function ensureChunkCache(chunk) {
    if (!chunk._pol) chunk._pol = {};
    const c = chunk._pol;
    if (!c.terrainDone && chunk.terrain) {
      let water = 0, grass = 0, sand = 0;
      for (let i = 0; i < chunk.terrain.length; i++) {
        const cat = classifyTerrain(chunk.terrain[i]);
        if (cat === 'water') water++; else if (cat === 'sandDesert') sand++; else grass++;
      }
      c.water = water; c.grass = grass; c.sand = sand;
      c.terrainDone = true;
    }
    let trees = 0;
    if (chunk.feature) {
      for (let i = 0; i < chunk.feature.length; i++) if (chunk.feature[i] === 1) trees++;
    }
    c.trees = trees;
    return c;
  }

  function absorbChunk(chunk) {
    const c = ensureChunkCache(chunk);
    const perSec = (c.water || 0) * ABSORB_PER_SEC.water
      + (c.grass || 0) * ABSORB_PER_SEC.grassDirt
      + (c.sand || 0) * ABSORB_PER_SEC.sandDesert
      + (c.trees || 0) * ABSORB_PER_SEC.treeEach;
    const absorb = 64 * perSec;
    chunk.pollution = Math.max(0, (chunk.pollution || 0) - absorb);
  }

  // ---------------------------------------------------------------------
  // Spawner attack banks (GDD §7.9.2). F.combat owns spawner entities and
  // the `units`/`cooldown` fields (ARCHITECTURE §12); this module adds a
  // `bank` field to spawner entities it manages, since the bank is purely
  // pollution-side bookkeeping. F.combat.spawnAttack(chunk, pollutionCost)
  // is called once per affordable unit; the cost passed also identifies
  // which unit tier was chosen (4/20/80 -> small/medium/big), so combat
  // can spawn the matching unit into the chunk's gathering group without
  // this module needing to know unit-spawning internals (assumption,
  // since ARCHITECTURE.md only gives the (chunk, pollutionCost) shape).
  // ---------------------------------------------------------------------
  function collectSpawnersByChunk() {
    const out = {};
    if (!F.entities || typeof F.entities.ofType !== 'function') return out;
    if (!F.world || typeof F.world.chunkOf !== 'function') return out;
    let list;
    try { list = F.entities.ofType(SPAWNER_TYPE) || []; }
    catch (err) { F.log.warn('[pollution] ofType(' + SPAWNER_TYPE + ') failed', err); return out; }
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e || typeof e.x !== 'number' || typeof e.y !== 'number') continue;
      const r = F.world.chunkOf(e.x, e.y);
      const key = chunkKeyOf(r[0], r[1]);
      (out[key] || (out[key] = [])).push(e);
    }
    return out;
  }

  function handleSpawnerBank(chunk, spawners) {
    // F.FEATURES.combat off: no spawners ever get placed (10-world.js guards
    // that on F.combat), so `spawners` is always empty in practice — this
    // guard also keeps a stray spawner from an old save (see F.load's
    // sanitizer in 80-game.js, which drops those entities anyway) inert.
    if (!F.FEATURES || !F.FEATURES.combat) return;
    if (!spawners || spawners.length === 0) return;
    spawners.sort(function (a, b) { return (a.id || 0) - (b.id || 0); }); // deterministic order
    for (let i = 0; i < spawners.length; i++) {
      const sp = spawners[i];
      if ((chunk.pollution || 0) > ATTACK_BANK_THRESHOLD) {
        const take = ATTACK_BANK_THRESHOLD + 0.01 * chunk.pollution;
        chunk.pollution = Math.max(0, chunk.pollution - take);
        sp.bank = Math.min((sp.bank || 0) + take, MAX_BANK);
      }
      let guard = 0;
      while ((sp.bank || 0) >= MIN_UNIT_COST && guard++ < SPEND_GUARD) {
        const pick = pickUnitType(evolution());
        if ((sp.bank || 0) < pick.cost) break; // afford a cheaper type next cycle instead
        if (!F.combat || typeof F.combat.spawnAttack !== 'function') {
          F.log.warn('[pollution] F.combat.spawnAttack unavailable; spawner bank left unspent');
          break;
        }
        sp.bank -= pick.cost;
        try { F.combat.spawnAttack(chunk, pick.cost); }
        catch (err) { F.log.error('[pollution] F.combat.spawnAttack threw', err); break; }
      }
    }
  }

  // ---------------------------------------------------------------------
  // Diffusion (GDD §7.7): 2 % of a chunk's pollution (chunks >= 15 only)
  // flows to each of its 4 neighbours, using the pre-diffusion snapshot
  // so multiple chunks exchange independently in the same update rather
  // than chaining through each other. Flow into a non-generated neighbour
  // is still deducted from the source and stashed in a pending map,
  // applied once that chunk is generated (checked every update).
  // ---------------------------------------------------------------------
  function applyPending(chunks) {
    const st = state();
    if (!st) return;
    for (const key in st.pending) {
      if (!Object.prototype.hasOwnProperty.call(st.pending, key)) continue;
      const chunk = chunks[key];
      if (chunk) {
        chunk.pollution = (chunk.pollution || 0) + st.pending[key];
        delete st.pending[key];
      }
    }
  }

  function diffuse(chunks) {
    const keys = Object.keys(chunks);
    const snap = {};
    for (let i = 0; i < keys.length; i++) snap[keys[i]] = chunks[keys[i]].pollution || 0;
    const deltas = {};
    const st = state();
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const p = snap[k];
      if (p < DIFFUSE_THRESHOLD) continue;
      const chunk = chunks[k];
      let cx = chunk.cx, cy = chunk.cy;
      if (typeof cx !== 'number' || typeof cy !== 'number') { const xy = unkeyChunk(k); cx = xy[0]; cy = xy[1]; }
      const give = DIFFUSE_SHARE * p;
      const neigh = [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]];
      for (let j = 0; j < 4; j++) {
        const nk = chunkKeyOf(neigh[j][0], neigh[j][1]);
        deltas[k] = (deltas[k] || 0) - give;
        if (chunks[nk]) deltas[nk] = (deltas[nk] || 0) + give;
        else if (st) st.pending[nk] = (st.pending[nk] || 0) + give;
      }
    }
    for (const k in deltas) {
      if (!Object.prototype.hasOwnProperty.call(deltas, k)) continue;
      chunks[k].pollution = Math.max(0, (chunks[k].pollution || 0) + deltas[k]);
    }
  }

  // ---------------------------------------------------------------------
  // Periodic update, every 64 ticks: apply pending diffusion for newly
  // generated chunks, absorb + spend spawner banks per chunk, add this
  // window's emitted pollution to the evolution factor, then diffuse.
  // ---------------------------------------------------------------------
  function spread() {
    if (!F.state || !F.state.world || !F.state.world.chunks) return;
    const chunks = F.state.world.chunks;
    applyPending(chunks);
    const spawnersByChunk = collectSpawnersByChunk();
    for (const key in chunks) {
      if (!Object.prototype.hasOwnProperty.call(chunks, key)) continue;
      const chunk = chunks[key];
      absorbChunk(chunk);
      handleSpawnerBank(chunk, spawnersByChunk[key]);
    }
    // F.FEATURES.combat off: pollution keeps spreading/absorbing/showing on
    // the map (above), but it no longer feeds enemy evolution (below —
    // there is nothing left to evolve).
    const st = state();
    if (F.FEATURES && F.FEATURES.combat && st && st.emittedAccum > 0) addEvo(st.emittedAccum * EVO_POLLUTION_FACTOR);
    if (st) st.emittedAccum = 0;
    diffuse(chunks);
  }

  function evolutionTimeStep() { addEvo(EVO_TIME_PER_SEC); }

  // Called every tick (phase 9, ARCHITECTURE §18). Cheap when neither
  // cadence fires; never throws (module runs inside the main tick loop).
  function tick() {
    if (!F.state) return;
    try {
      const t = F.state.tick || 0;
      if (F.FEATURES && F.FEATURES.combat && t % 60 === 0) evolutionTimeStep();
      if (t % 64 === 0) spread();
    } catch (err) {
      F.log.error('[pollution] tick() failed', err);
    }
  }

  // ---------------------------------------------------------------------
  // Queries for the map/minimap and F.api.
  // ---------------------------------------------------------------------
  function chunkValue(cx, cy) {
    const chunk = getChunk(cx, cy, false);
    if (chunk) return chunk.pollution || 0;
    const st = state();
    return (st && st.pending[chunkKeyOf(cx, cy)]) || 0;
  }

  function total() {
    let sum = 0;
    const chunks = F.state && F.state.world && F.state.world.chunks;
    if (chunks) for (const k in chunks) { if (Object.prototype.hasOwnProperty.call(chunks, k)) sum += chunks[k].pollution || 0; }
    return sum;
  }

  // GDD §7.7 map overlay: chunks >= 50 PU tinted red, alpha in [0.15, 0.6]
  // scaled between the 50 (floor) and 150 (cap) display thresholds.
  function overlayAlpha(cx, cy) {
    const p = chunkValue(cx, cy);
    if (p < OVERLAY_FLOOR) return 0;
    return F.util.clamp((p - OVERLAY_FLOOR) / (OVERLAY_CAP - OVERLAY_FLOOR), 0.15, 0.6);
  }

  F.pollution = {
    emit: emit,
    tick: tick,
    spread: spread,
    chunkValue: chunkValue,
    total: total,
    overlayAlpha: overlayAlpha,
    evolution: evolution,
  };
})();
