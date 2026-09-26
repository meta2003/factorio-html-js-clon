// 10-world.js — chunks, map generation, tiles, resources, trees/rocks, water,
// tile->entity map, placement validation. See design/ARCHITECTURE.md §5 and
// design/GDD.md §2 (World).
//
// Pure, deterministic, seeded generation: every random decision derives from
// F.rng.local(...) (a seeded closure) or F.util.hash2, never from F.rng.next()/
// int()/chance() (the mutable global simulation RNG). This makes chunk
// generation order-independent, as required by the GDD and ARCHITECTURE.
(function () {
  'use strict';

  // ---------------------------------------------------------------------
  // Enums / constants
  // ---------------------------------------------------------------------

  // Terrain ids. Water = ids < 2 (per ARCHITECTURE §5). Land ids grouped into
  // families of 2 (grass-dry, grass) / 2 (dirt) / 2 (sand) plus one desert id,
  // matching the task's "2-5 grass variants, 6-7 dirt, 8-9 sand, 10 red desert"
  // layout; ARCHITECTURE explicitly allows any ordering as long as water < 2.
  const TERRAIN = {
    DEEPWATER: 0,
    WATER: 1,
    GRASS_DRY1: 2, GRASS_DRY2: 3,
    GRASS1: 4, GRASS2: 5,
    DIRT1: 6, DIRT2: 7,
    SAND1: 8, SAND2: 9,
    RED_DESERT: 10,
  };

  // Fill colours per terrain id, taken from GDD §2.4 (fill + speckle colour
  // reused as the second variant of each 2-variant family).
  const TERRAIN_COLOR = [
    '#143A55', // 0 deep water
    '#1F4F6E', // 1 water
    '#6E8A3A', // 2 dry grass (fill)
    '#5F6B3C', // 3 dry grass (speckle variant)
    '#5B7A33', // 4 grass (fill)
    '#4E6A2C', // 5 grass (speckle variant)
    '#9A7B55', // 6 dirt (fill)
    '#86694A', // 7 dirt (speckle variant)
    '#C2A66B', // 8 sand (fill)
    '#AD915B', // 9 sand (speckle variant)
    '#A87246', // 10 red desert
  ];

  // RES.CRUDE_OIL / RES_ITEM[5] / RES_COLOR[5] — design/EXPANSION.md §6.4: there is
  // no crude-oil ITEM, the resource id just names the fluid a well produces; see
  // oilYieldFor()/maybePlaceOilWells() below for well generation.
  const RES = { NONE: 0, IRON_ORE: 1, COPPER_ORE: 2, COAL: 3, STONE: 4, CRUDE_OIL: 5 };
  const RES_ITEM = [null, 'iron-ore', 'copper-ore', 'coal', 'stone', 'crude-oil'];
  const RES_COLOR = ['#000000', '#8B96A3', '#B87333', '#2B2B2B', '#ABA9A0', '#1A1614'];

  const FEATURE = { NONE: 0, TREE: 1, ROCK_BIG: 2, ROCK_HUGE: 3 };
  const TREE_HP = 50;          // GDD §2.6
  const ROCK_BIG_HP = 500;     // GDD §2.7
  const ROCK_HUGE_HP = 2000;   // GDD §2.7

  const MAP_LIMIT = 4096;                // GDD §2.1 / §0.3
  const STARTING_LAKE_DISTANCE = 38;     // GDD §0.3 STARTING_LAKE_DISTANCE
  const LAKE_RADIUS = 9;                 // GDD §2.3 LAKE_RADIUS
  const SAFE_RADIUS_ENEMY = 200;         // GDD §0.3 SAFE_RADIUS_ENEMY
  const ENEMY_FREQ = 1;                  // GDD §7.9.5

  // Deterministic salts for the various noise channels / random decisions
  // (hashed once at module load; cheap ints reused every tile).
  const SALT = {
    ELEV: F.util.hashStr('elev'),
    LAKE: F.util.hashStr('lake'),
    MOIST: F.util.hashStr('moist'),
    AUX: F.util.hashStr('aux'),
    JITTER: F.util.hashStr('jitter'),
    FOREST: F.util.hashStr('forest'),
    BLOB: F.util.hashStr('blob'),
    SANDV: F.util.hashStr('sandv'),
    DIRTV: F.util.hashStr('dirtv'),
    GRASSDV: F.util.hashStr('grassdv'),
    GRASSV: F.util.hashStr('grassv'),
    TREE: F.util.hashStr('tree'),
    ROCK: F.util.hashStr('rock'),
    BASE: F.util.hashStr('base'),
    LAKEANGLE: F.util.hashStr('lakeAngle'),
    OIL: F.util.hashStr('oil'),
    OILCLUSTER: F.util.hashStr('oilCluster'),
    OILANGLE: F.util.hashStr('oilAngle'),
  };

  // ---------------------------------------------------------------------
  // Noise primitives (GDD §2.2): 2-D value noise with smoothstep
  // interpolation + fBm. Deterministic from F.util.hash2 (no Math.random).
  // ---------------------------------------------------------------------

  const hash2 = F.util.hash2;

  function latticeValue(ix, iy, seed) {
    // hash2 -> uint32 -> [-1, 1]
    return (hash2(ix, iy, seed) / 4294967296) * 2 - 1;
  }

  // Lattice-corner memo, one slot per (noise channel, octave). Chunk
  // generation walks tiles in scanline order, so every octave coarser than a
  // tile keeps landing in the same lattice cell for many consecutive calls;
  // the cached corners are exactly what latticeValue() would return, so the
  // generated world is bit-for-bit unchanged — only the hashing is skipped.
  const CH = { ELEV: 0, LAKE: 1, MOIST: 2, AUX: 3, FOREST: 4, BLOB: 5, SANDV: 6, DIRTV: 7, GRASSDV: 8, GRASSV: 9 };
  const MAX_OCTAVES = 4;
  const CELL_SLOTS = 10 * MAX_OCTAVES;
  const cellIx = new Float64Array(CELL_SLOTS);
  const cellIy = new Float64Array(CELL_SLOTS);
  const cellSeed = new Float64Array(CELL_SLOTS).fill(-1); // seeds are uint32, so -1 = empty
  const cellV = new Float64Array(CELL_SLOTS * 4);

  function noise2D(x, y, seed, slot) {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const c = slot * 4;
    let v00, v10, v01, v11;
    if (cellIx[slot] === ix && cellIy[slot] === iy && cellSeed[slot] === seed) {
      v00 = cellV[c]; v10 = cellV[c + 1]; v01 = cellV[c + 2]; v11 = cellV[c + 3];
    } else {
      v00 = cellV[c] = latticeValue(ix, iy, seed);
      v10 = cellV[c + 1] = latticeValue(ix + 1, iy, seed);
      v01 = cellV[c + 2] = latticeValue(ix, iy + 1, seed);
      v11 = cellV[c + 3] = latticeValue(ix + 1, iy + 1, seed);
      cellIx[slot] = ix; cellIy[slot] = iy; cellSeed[slot] = seed;
    }
    const x0 = v00 + (v10 - v00) * sx;
    const x1 = v01 + (v11 - v01) * sx;
    return x0 + (x1 - x0) * sy;
  }

  // fbm(x,y,octaves,persistence,saltHash,seed,channel) — normalised to
  // roughly [-1,1]. `channel` (a CH id) only picks the memo slots.
  function fbm(x, y, octaves, persistence, saltHash, seed, channel) {
    let sum = 0, amp = 1, maxAmp = 0, freq = 1;
    const base = (seed ^ saltHash) >>> 0;
    const slot0 = channel * MAX_OCTAVES;
    for (let o = 0; o < octaves; o++) {
      sum += amp * noise2D(x * freq, y * freq, (base + o * 2654435761) >>> 0, slot0 + o);
      maxAmp += amp;
      amp *= persistence;
      freq *= 2;
    }
    return maxAmp > 0 ? sum / maxAmp : 0;
  }

  function inMapLimit(tx, ty) {
    return tx >= -MAP_LIMIT && tx <= MAP_LIMIT && ty >= -MAP_LIMIT && ty <= MAP_LIMIT;
  }

  function variant(tx, ty, seed, saltHash, n, channel) {
    // Low-frequency patches (~7-tile blobs) with a little per-tile jitter, so terrain
    // variants form natural-looking patches instead of per-tile checkerboard noise.
    const v = 0.5 + 0.5 * fbm(tx / 7, ty / 7, 2, 0.5, saltHash, seed, channel) + (hash2(tx, ty, (seed ^ saltHash) >>> 0) % 100) / 1000;
    const k = Math.floor(v * n);
    return k < 0 ? 0 : k >= n ? n - 1 : k;
  }

  // ---------------------------------------------------------------------
  // World parameters derived once per seed (lake centre, guaranteed starting
  // ore patches) — GDD §2.3, §2.5.2. Pure function of `seed`, cached.
  // ---------------------------------------------------------------------

  let paramsCache = null;

  // ---------------------------------------------------------------------
  // Delta-save support (see design/ARCHITECTURE.md §5, §18 and the report):
  // chunks are regenerated deterministically from (seed, cx, cy) on load, so
  // only per-tile *overrides* relative to a fresh regeneration need to be
  // persisted, plus the small pollution/spawnerCount numbers already kept on
  // the chunk. `pendingDeltas` holds delta records for chunks that were part
  // of a loaded save but have not been regenerated (visited) yet this
  // session; F.world.ensureChunk consumes (and removes) an entry the first
  // time it generates that chunk. Module-level, like `_tileMap` — not part
  // of F.state (rebuilt/repopulated via F.world.importChunks on load).
  // ---------------------------------------------------------------------
  let pendingDeltas = new Map(); // chunkKey -> { cx, cy, pollution, spawnerCount, delta }

  // Records a per-tile override into chunk.delta (lazily created), keyed by
  // tile index (as ARCHITECTURE's example: {amount:{"i":value}, feature:{"i":0}}).
  function markDelta(chunk, field, i, value) {
    if (field === 'feature') chunk._fv = (chunk._fv || 0) + 1; // lets caches (tree counts) notice
    if (!chunk.delta) chunk.delta = {};
    const bucket = chunk.delta[field] || (chunk.delta[field] = {});
    bucket[i] = value;
  }

  function hasAnyKeys(o) { return !!o && Object.keys(o).length > 0; }

  // Applies a delta record (amount/feature/featHp overrides) onto a freshly
  // generated chunk. Mirrors what mineResource/removeFeature/damageFeature
  // do at runtime, so a regenerated+patched chunk is indistinguishable from
  // the same chunk kept live in memory the whole time.
  function applyDelta(chunk, delta) {
    if (!delta) return;
    if (delta.amount) {
      for (const k in delta.amount) {
        const i = +k, v = delta.amount[k];
        chunk.amount[i] = v;
        if (v <= 0) chunk.res[i] = 0; // fully mined tiles also clear the resource kind
      }
    }
    if (delta.feature) {
      for (const k in delta.feature) {
        const i = +k, v = delta.feature[k];
        chunk.feature[i] = v;
        if (v === 0) chunk.featHp[i] = 0;
      }
    }
    if (delta.featHp) {
      for (const k in delta.featHp) chunk.featHp[+k] = delta.featHp[k];
    }
  }

  // Builds a { cx, cy, pollution, spawnerCount, delta } export record, or
  // null when the chunk has nothing worth saving (per the task: only chunks
  // with a non-empty delta or non-zero pollution/spawnerCount are exported).
  function chunkExportRecord(cx, cy, pollution, spawnerCount, delta) {
    pollution = pollution || 0;
    spawnerCount = spawnerCount || 0;
    const has = !!delta && (hasAnyKeys(delta.amount) || hasAnyKeys(delta.feature) || hasAnyKeys(delta.featHp));
    if (!has && !pollution && !spawnerCount) return null;
    return { cx: cx, cy: cy, pollution: pollution, spawnerCount: spawnerCount, delta: delta || {} };
  }

  // Legacy (SAVE_VERSION 1) support: those saves carried an object map of
  // FULL chunks (real terrain/res/amount/feature/featHp typed arrays,
  // already decoded from base64 by F.load's generic decoder) instead of
  // deltas. Diff a legacy chunk against a fresh regeneration (same seed) to
  // recover an equivalent delta record, so old saves keep loading correctly
  // under the new compact format. Pure function; does not touch F.state.
  function legacyChunkToDelta(oldChunk, seed) {
    const fresh = genChunk(oldChunk.cx, oldChunk.cy, seed);
    const oldAmount = oldChunk.amount, oldFeature = oldChunk.feature, oldFeatHp = oldChunk.featHp;
    const delta = {};
    for (let i = 0; i < 1024; i++) {
      const fa = fresh.amount[i];
      const la = (oldAmount && oldAmount.length > i) ? oldAmount[i] : fa;
      if (la !== fa) { if (!delta.amount) delta.amount = {}; delta.amount[i] = la; }
      const ff = fresh.feature[i];
      const lf = (oldFeature && oldFeature.length > i) ? oldFeature[i] : ff;
      if (lf !== ff) { if (!delta.feature) delta.feature = {}; delta.feature[i] = lf; }
      const fh = fresh.featHp[i];
      const lh = (oldFeatHp && oldFeatHp.length > i) ? oldFeatHp[i] : fh;
      if (lh !== fh) { if (!delta.featHp) delta.featHp = {}; delta.featHp[i] = lh; }
    }
    return { cx: oldChunk.cx, cy: oldChunk.cy, pollution: oldChunk.pollution || 0, spawnerCount: oldChunk.spawnerCount || 0, delta: delta };
  }

  // rq and Q taken verbatim from the GDD §2.5.2 table.
  const STARTING_PATCH_DEFS = [
    { ore: 'stone', angleOffDeg: 72, dist: 28, Q: 320000, rq: 1.1 / 7 },
    { ore: 'coal', angleOffDeg: 144, dist: 28, Q: 640000, rq: 1.1 / 7 },
    { ore: 'iron-ore', angleOffDeg: 216, dist: 32, Q: 800000, rq: 1.5 / 7 },
    { ore: 'copper-ore', angleOffDeg: 288, dist: 28, Q: 640000, rq: 1.2 / 7 },
  ];

  function getParams(seed) {
    if (paramsCache && paramsCache.seed === seed) return paramsCache;
    // rand(seed, "lakeAngle") — a deterministic local generator, not the
    // mutable global F.rng.
    const angleRng = F.rng.local(seed, SALT.LAKEANGLE, 0);
    const lakeAngle = angleRng() * Math.PI * 2;
    const lakeCentre = {
      x: Math.cos(lakeAngle) * STARTING_LAKE_DISTANCE,
      y: Math.sin(lakeAngle) * STARTING_LAKE_DISTANCE,
    };
    const theta0 = lakeAngle;
    const startingPatches = STARTING_PATCH_DEFS.map(function (def) {
      const ang = theta0 + def.angleOffDeg * Math.PI / 180;
      const cx = Math.cos(ang) * def.dist;
      const cy = Math.sin(ang) * def.dist;
      const r = Math.min(32, def.rq * Math.cbrt(def.Q));
      const h = Math.cbrt(def.Q) / ((Math.PI / 3) * def.rq * def.rq);
      return { ore: def.ore, cx: cx, cy: cy, r: r, h: h, richnessDistMult: 1 };
    });
    // Guaranteed oil well cluster (design/EXPANSION.md §6.4): one cluster somewhere
    // 70-110 tiles from spawn, angle independent of the lake/ore angle. Deterministic
    // per seed via its own F.rng.local stream; the chunk containing this point forces
    // a cluster placement in maybePlaceOilWells() regardless of the per-chunk roll.
    const oilRng = F.rng.local(seed, SALT.OILANGLE, 0);
    const oilAngle = oilRng() * Math.PI * 2;
    const oilDist = 70 + oilRng() * 40;
    const oilX = Math.cos(oilAngle) * oilDist, oilY = Math.sin(oilAngle) * oilDist;
    const oilGuaranteed = {
      cx: F.util.floorDiv(Math.round(oilX), 32),
      cy: F.util.floorDiv(Math.round(oilY), 32),
    };
    paramsCache = { seed: seed, lakeAngle: lakeAngle, lakeCentre: lakeCentre, startingPatches: startingPatches, oilGuaranteed: oilGuaranteed };
    return paramsCache;
  }

  // ---------------------------------------------------------------------
  // Regular (beyond-start) ore regions — GDD §2.5.3. 512x512-tile regions,
  // cached per (seed, rx, ry) since the search is not free (up to 8 tries
  // per ore) but is a pure function of its key.
  // ---------------------------------------------------------------------

  const regionCache = new Map();
  const ORES = ['iron-ore', 'copper-ore', 'coal', 'stone'];
  const BASE_DENSITY = { 'iron-ore': 10, 'copper-ore': 8, 'coal': 8, 'stone': 4 };

  function elevationAt(tx, ty, seed, params) {
    const d = Math.hypot(tx, ty);
    let e = fbm(tx / 96, ty / 96, 4, 0.6, SALT.ELEV, seed, CH.ELEV) + 0.35;
    e = Math.max(e, 0.6 - d / 100); // starting plateau: guaranteed land near spawn
    const lc = params.lakeCentre;
    const lake = (Math.hypot(tx - lc.x, ty - lc.y) - LAKE_RADIUS) / 8;
    // The lake term is lake + 0.25 * fbm with fbm in [-1, 1]; when even its
    // minimum stays above e the min() below cannot change e, so skip the
    // noise (0.26 leaves margin for rounding).
    if (lake - 0.26 > e) return e;
    return Math.min(e, lake + 0.25 * fbm(tx / 6, ty / 6, 3, 0.5, SALT.LAKE, seed, CH.LAKE));
  }

  function regionPatches(seed, rx, ry) {
    const key = seed + ':' + rx + ',' + ry;
    const cached = regionCache.get(key);
    if (cached) return cached;
    const params = getParams(seed);
    const patches = [];
    for (let oi = 0; oi < ORES.length; oi++) {
      const ore = ORES[oi];
      const oreSalt = F.util.hashStr(ore);
      const rng = F.rng.local(seed ^ oreSalt, rx, ry);
      const spotCount = Math.floor(0.655 + rng());
      if (spotCount < 1) continue;
      let found = null;
      for (let attempt = 0; attempt < 8 && !found; attempt++) {
        const cx = rx * 512 + rng() * 512;
        const cy = ry * 512 + rng() * 512;
        const d = Math.hypot(cx, cy);
        if (d <= 120) continue;
        if (elevationAt(cx, cy, seed, params) <= 0.15) continue; // must be land
        let tooClose = false;
        for (let i = 0; i < params.startingPatches.length && !tooClose; i++) {
          const sp = params.startingPatches[i];
          if (Math.hypot(cx - sp.cx, cy - sp.cy) < 40) tooClose = true;
        }
        for (let i = 0; i < patches.length && !tooClose; i++) {
          if (Math.hypot(cx - patches[i].cx, cy - patches[i].cy) < 40) tooClose = true;
        }
        if (tooClose) continue;
        found = { cx: cx, cy: cy, d: d };
      }
      if (!found) continue;
      const sed = Math.max(0, found.d - 300);
      const eff = F.util.clamp(sed, 0, 1300);
      const density = BASE_DENSITY[ore] * (1 + eff / 1300) * F.util.clamp((found.d - 120) / 300, 0, 1);
      const Qbase = density * 1000000 / 2.5;
      const Q = Qbase * (0.25 + 1.75 * rng());
      const rq = (1 / 10) * ((ore === 'iron-ore' || ore === 'copper-ore') ? 1.10 : 1.0);
      const richnessDistMult = Math.max(1, (1300 + sed) / 2600);
      const r = Math.min(32, rq * Math.cbrt(Q));
      const h = Math.cbrt(Q) / ((Math.PI / 3) * rq * rq);
      patches.push({ ore: ore, cx: found.cx, cy: found.cy, r: r, h: h, richnessDistMult: richnessDistMult });
    }
    regionCache.set(key, patches);
    return patches;
  }

  function gatherPatchesForChunk(seed, cx, cy, params) {
    const list = params.startingPatches.slice();
    const tx0 = cx * 32, ty0 = cy * 32, tx1 = tx0 + 31, ty1 = ty0 + 31;
    const rx0 = F.util.floorDiv(tx0 - 32, 512), rx1 = F.util.floorDiv(tx1 + 32, 512);
    const ry0 = F.util.floorDiv(ty0 - 32, 512), ry1 = F.util.floorDiv(ty1 + 32, 512);
    for (let ry = ry0; ry <= ry1; ry++) {
      for (let rx = rx0; rx <= rx1; rx++) {
        const rps = regionPatches(seed, rx, ry);
        for (let i = 0; i < rps.length; i++) {
          const p = rps[i];
          if (p.cx + p.r < tx0 || p.cx - p.r > tx1 || p.cy + p.r < ty0 || p.cy - p.r > ty1) continue;
          list.push(p);
        }
      }
    }
    return list;
  }

  // ---------------------------------------------------------------------
  // Per-tile terrain / moisture fields
  // ---------------------------------------------------------------------

  function moistureAt(tx, ty, seed) {
    // The jitter term samples noise at integer coordinates, where the
    // interpolation weights are 0 and noise2D reduces to the lattice value.
    return 0.5 + 0.5 * fbm(tx / 256, ty / 256, 4, 0.5, SALT.MOIST, seed, CH.MOIST)
      + 0.04 * latticeValue(tx, ty, (seed ^ SALT.JITTER) >>> 0);
  }

  function auxAt(tx, ty, seed) {
    return 0.5 + 0.5 * fbm(tx / 512, ty / 512, 3, 0.5, SALT.AUX, seed, CH.AUX);
  }

  function terrainIdFor(tx, ty, seed, e, moisture, aux) {
    if (e < -0.5) return TERRAIN.DEEPWATER;
    if (e < 0) return TERRAIN.WATER;
    if (moisture < 0.22 && aux < 0.5) return TERRAIN.SAND1 + variant(tx, ty, seed, SALT.SANDV, 2, CH.SANDV);
    if (moisture < 0.35 && aux >= 0.5) return TERRAIN.RED_DESERT;
    if (moisture < 0.45) return TERRAIN.DIRT1 + variant(tx, ty, seed, SALT.DIRTV, 2, CH.DIRTV);
    if (moisture < 0.62) return TERRAIN.GRASS_DRY1 + variant(tx, ty, seed, SALT.GRASSDV, 2, CH.GRASSDV);
    return TERRAIN.GRASS1 + variant(tx, ty, seed, SALT.GRASSV, 2, CH.GRASSV);
  }

  function biomeTerm(moisture) {
    if (moisture > 0.55) return 0.35;
    if (moisture >= 0.4) return 0.1;
    if (moisture < 0.3) return -0.3;
    return 0;
  }

  // Places a tree or rock feature into chunk.feature[i]/featHp[i] if the roll
  // succeeds. Only called on land tiles with no ore. GDD §2.6 / §2.7.
  function featureFor(tx, ty, seed, d, moisture, chunk, i) {
    const clearMult = F.util.clamp((d - 64) / 64, 0, 1); // no trees within 64, full density from 128
    if (clearMult > 0) {
      const forestBase = fbm(tx / 48, ty / 48, 3, 0.5, SALT.FOREST, seed, CH.FOREST) - 0.5 + 0.2 * 1 /* TREE_COVERAGE */ + biomeTerm(moisture);
      const p = F.util.clamp(forestBase, 0, 0.7) * clearMult;
      if (p > 0) {
        const u = hash2(tx, ty, (seed ^ SALT.TREE) >>> 0) / 4294967296;
        if (u < p) { chunk.feature[i] = FEATURE.TREE; chunk.featHp[i] = TREE_HP; return; }
      }
    }
    if (moisture < 0.45 && d > 40) {
      const u2 = hash2(tx, ty, (seed ^ SALT.ROCK) >>> 0) / 4294967296;
      if (u2 < 0.0025) { chunk.feature[i] = FEATURE.ROCK_BIG; chunk.featHp[i] = ROCK_BIG_HP; return; }
      if (u2 < 0.0025 + 0.0006) { chunk.feature[i] = FEATURE.ROCK_HUGE; chunk.featHp[i] = ROCK_HUGE_HP; return; }
    }
  }

  // ---------------------------------------------------------------------
  // Crude-oil wells (design/EXPANSION.md §6.4): sparse single-tile resource
  // tiles (RES.CRUDE_OIL), generated deterministically per chunk (order
  // independent — every random decision below comes from F.rng.local or
  // F.util.hash2, never F.rng.next()). Clusters of 3-8 wells, >=3 tiles apart
  // (within the same chunk — spacing across a chunk boundary is not enforced,
  // a deliberate simplification mirroring maybePlaceSpawners()'s chunk-local
  // placement above). Runs AFTER the main terrain/resource/feature loop so it
  // can read chunk.terrain directly (must NOT call F.world.isLand/resource
  // here: the chunk is not yet stored in F.state.world.chunks while genChunk
  // is still running, so that would recurse into a duplicate generation).
  // ---------------------------------------------------------------------

  // yield% in [60,400], richer with distance from spawn (EXPANSION §6.4).
  function oilYieldFor(dist, rng) {
    const base = 60 + Math.min(300, Math.max(0, dist - 60) * 0.5);
    const jitter = 0.7 + rng() * 0.6; // 0.7..1.3
    return F.util.clamp(Math.round(base * jitter), 60, 400);
  }

  function maybePlaceOilWells(cx, cy, chunk, seed, params) {
    const ccx = cx * 32 + 16, ccy = cy * 32 + 16;
    const dist = Math.hypot(ccx, ccy);
    const guaranteed = !!(params.oilGuaranteed && params.oilGuaranteed.cx === cx && params.oilGuaranteed.cy === cy);
    if (!guaranteed) {
      if (dist <= 60) return; // no wells near spawn
      const hv = F.util.hash2(cx, cy, (seed ^ SALT.OIL) >>> 0) / 4294967296;
      if (hv >= 0.18) return; // ~18% chance per eligible chunk
    }
    const rng = F.rng.local((seed ^ SALT.OILCLUSTER) >>> 0, cx, cy);
    const count = 3 + Math.floor(rng() * 6); // 3..8 wells
    const placed = [];
    let guard = 0;
    while (placed.length < count && guard++ < 300) {
      const lx = Math.floor(rng() * 32), ly = Math.floor(rng() * 32);
      const i = ly * 32 + lx;
      if (chunk.terrain[i] < 2) continue; // water: wells only on land
      let tooClose = false;
      for (let k = 0; k < placed.length; k++) {
        const dx = lx - placed[k].lx, dy = ly - placed[k].ly;
        if (dx * dx + dy * dy < 9) { tooClose = true; break; } // >= 3 tiles apart
      }
      if (tooClose) continue;
      const tx = cx * 32 + lx, ty = cy * 32 + ly;
      const amount = oilYieldFor(Math.hypot(tx, ty), rng);
      chunk.res[i] = RES.CRUDE_OIL;
      chunk.amount[i] = amount;
      chunk.feature[i] = 0; chunk.featHp[i] = 0; // clear any tree/rock so the well tile is clean
      placed.push({ lx: lx, ly: ly });
    }
  }

  // ---------------------------------------------------------------------
  // Chunk generation
  // ---------------------------------------------------------------------

  function chunkKey(cx, cy) { return cx + ',' + cy; }

  // Hot-path chunk lookup for the per-tile queries below (drills ask for resources every
  // tick): a numeric-key Map in front of ensureChunk, reset whenever the chunk store object
  // is replaced (new game / load). Chunks are never removed from a live store.
  let fastStore = null;
  const fastChunks = new Map();
  function tileChunk(tx, ty) {
    const cx = Math.floor(tx / 32), cy = Math.floor(ty / 32);
    const store = F.state.world.chunks;
    if (store !== fastStore) { fastStore = store; fastChunks.clear(); }
    const k = (cx + 0x8000) * 0x10000 + (cy + 0x8000);
    let c = fastChunks.get(k);
    if (c === undefined) { c = F.world.ensureChunk(cx, cy); fastChunks.set(k, c); }
    return c;
  }
  function tileIndex(tx, ty) { return (ty - Math.floor(ty / 32) * 32) * 32 + (tx - Math.floor(tx / 32) * 32); }

  // `seedOverride`: used only by legacyChunkToDelta to regenerate a chunk
  // for a seed that isn't (yet) F.state.world.seed during save migration;
  // the normal ensureChunk() path omits it and reads F.state.world.seed.
  function genChunk(cx, cy, seedOverride) {
    const seed = (typeof seedOverride === 'number') ? (seedOverride >>> 0) : F.state.world.seed;
    const params = getParams(seed);
    const chunk = {
      cx: cx, cy: cy,
      terrain: new Uint8Array(1024),
      res: new Uint8Array(1024),
      amount: new Uint32Array(1024),
      feature: new Uint8Array(1024),
      featHp: new Uint16Array(1024),
      pollution: 0,
      spawnerCount: 0,
      delta: null, // lazily created by markDelta() on first mutation (mineResource/removeFeature/damageFeature)
    };
    const patches = gatherPatchesForChunk(seed, cx, cy, params);
    const tx0 = cx * 32, ty0 = cy * 32;
    for (let ly = 0; ly < 32; ly++) {
      for (let lx = 0; lx < 32; lx++) {
        const tx = tx0 + lx, ty = ty0 + ly;
        const i = ly * 32 + lx;
        const e = elevationAt(tx, ty, seed, params);
        if (e < 0) { chunk.terrain[i] = e < -0.5 ? TERRAIN.DEEPWATER : TERRAIN.WATER; continue; } // water: no resource, no feature
        const moisture = moistureAt(tx, ty, seed);
        // aux only decides sand vs red desert, i.e. only matters when moisture < 0.35.
        const aux = moisture < 0.35 ? auxAt(tx, ty, seed) : 0;
        chunk.terrain[i] = terrainIdFor(tx, ty, seed, e, moisture, aux);

        // Resource: highest-amount overlapping patch wins.
        let bestAmt = 0, bestOre = 0, blob = NaN;
        for (let p = 0; p < patches.length; p++) {
          const patch = patches[p];
          const dx = tx - patch.cx, dy = ty - patch.cy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist >= patch.r) continue;
          if (blob !== blob) blob = fbm(tx / 5, ty / 5, 2, 0.5, SALT.BLOB, seed, CH.BLOB); // same for every patch: compute once
          const amt = Math.round(patch.h * (1 - dist / patch.r) * (1 + 0.25 * blob) * (patch.richnessDistMult || 1));
          if (amt > bestAmt) { bestAmt = amt; bestOre = RES[oreEnumName(patch.ore)]; }
        }
        if (bestAmt > 0) {
          chunk.res[i] = bestOre;
          chunk.amount[i] = bestAmt;
        } else {
          featureFor(tx, ty, seed, Math.hypot(tx, ty), moisture, chunk, i);
        }
      }
    }
    maybePlaceOilWells(cx, cy, chunk, seed, params);
    return chunk;
  }

  function oreEnumName(id) {
    switch (id) {
      case 'iron-ore': return 'IRON_ORE';
      case 'copper-ore': return 'COPPER_ORE';
      case 'coal': return 'COAL';
      case 'stone': return 'STONE';
      default: return 'NONE';
    }
  }

  // ---------------------------------------------------------------------
  // Enemy base placement (GDD §7.9.5) — called once, right after a chunk is
  // generated. Guarded: no-op if F.combat / F.combat.placeSpawner is absent
  // (that module may not be loaded/present, e.g. in isolated tests).
  // ---------------------------------------------------------------------

  function maybePlaceSpawners(cx, cy, chunk) {
    if (!F.combat || typeof F.combat.placeSpawner !== 'function') return;
    try {
      const seed = F.state.world.seed;
      const centerX = cx * 32 + 16, centerY = cy * 32 + 16;
      const d = Math.hypot(centerX, centerY);
      if (d <= SAFE_RADIUS_ENEMY) return;
      const intensity = Math.min(d, 2400) / 325;
      const pBase = (10 + 3 * intensity) * 0.001024 * ENEMY_FREQ;
      const hv = F.util.hash2(cx, cy, (seed ^ SALT.BASE) >>> 0) / 4294967296;
      if (hv >= pBase) return;
      const rng = F.rng.local((seed ^ SALT.BASE) >>> 0, cx, cy);
      const baseCx = centerX + (rng() * 2 - 1) * 8;
      const baseCy = centerY + (rng() * 2 - 1) * 8;
      const nSpawners = 2 + Math.floor(3 * Math.min(d, 2400) / 2400);
      const placed = [];
      let guard = 0;
      while (placed.length < nSpawners && guard++ < 200) {
        const ang = rng() * Math.PI * 2;
        const rad = rng() * 15;
        // Simplification: clamp candidate spawner tiles to this chunk so
        // placement never depends on a neighbouring chunk's generation
        // (keeps chunk generation order-independent and self-contained;
        // see report "assumptions").
        let px = F.util.clamp(Math.round(baseCx + Math.cos(ang) * rad), cx * 32, cx * 32 + 31);
        let py = F.util.clamp(Math.round(baseCy + Math.sin(ang) * rad), cy * 32, cy * 32 + 31);
        if (!F.world.isLand(px, py)) continue;
        let ok = true;
        for (let i = 0; i < placed.length; i++) {
          if (Math.hypot(px - placed[i].x, py - placed[i].y) < 6) { ok = false; break; }
        }
        if (!ok) continue;
        placed.push({ x: px, y: py });
      }
      for (let i = 0; i < placed.length; i++) {
        try {
          const sp = F.combat.placeSpawner(placed[i].x, placed[i].y);
          // spawnerCount is what lets a spawner-only chunk (no mining, no
          // pollution) still be included by F.world.exportChunks() and thus
          // skip a second (duplicate) spawner roll via maybePlaceSpawners
          // when regenerated after load — see F.world.ensureChunk.
          if (sp) chunk.spawnerCount = (chunk.spawnerCount || 0) + 1;
        }
        catch (err) { F.log.warn('placeSpawner failed', err); }
      }
    } catch (err) {
      F.log.error('maybePlaceSpawners', err);
    }
  }

  // ---------------------------------------------------------------------
  // Tile -> entity spatial map (module-level cache, NOT part of F.state).
  // ---------------------------------------------------------------------

  function fallbackTiles(e) {
    const w = e.w || 1, h = e.h || 1;
    const arr = [];
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) arr.push([e.x + i, e.y + j]);
    return arr;
  }

  function entityCollides(e) {
    if (!e) return false;
    if (F.data && F.data.entities && F.data.entities[e.type]) {
      return F.data.entities[e.type].collides !== false;
    }
    return true; // conservative default when data is unavailable
  }

  // ---------------------------------------------------------------------
  // Public API — F.world (design/ARCHITECTURE.md §5)
  // ---------------------------------------------------------------------

  const TERRAIN_NAME_KEY = [
    'world.terrain.deepwater', 'world.terrain.water',
    'world.terrain.grass_dry', 'world.terrain.grass_dry',
    'world.terrain.grass', 'world.terrain.grass',
    'world.terrain.dirt', 'world.terrain.dirt',
    'world.terrain.sand', 'world.terrain.sand',
    'world.terrain.red_desert',
  ];
  const FEATURE_NAME_KEY = [null, 'world.feature.tree', 'world.feature.rock_big', 'world.feature.rock_huge'];

  F.world = {
    TERRAIN: TERRAIN,
    RES: RES,
    RES_ITEM: RES_ITEM,
    TERRAIN_COLOR: TERRAIN_COLOR,
    RES_COLOR: RES_COLOR,
    FEATURE: FEATURE,

    // Fixed spawn point (GDD §2.1): tile (0,0), player at world (0.5, 0.5).
    spawn: { x: 0.5, y: 0.5 },

    _tileMap: new Map(),

    chunkKey: chunkKey,

    newWorld: function (seed) {
      seed = (seed >>> 0) || 1;
      F.state.world = { seed: seed, chunks: {} };
      F.world._tileMap = new Map();
      pendingDeltas = new Map(); // fresh game: discard any deltas left from a previous loaded game
      // Generate the spawn neighbourhood eagerly (radius 4 chunks), which
      // also guarantees the lake + 4 starting patches are materialised.
      for (let dy = -4; dy <= 4; dy++) {
        for (let dx = -4; dx <= 4; dx++) F.world.ensureChunk(dx, dy);
      }
    },

    ensureChunk: function (cx, cy) {
      cx = Math.floor(cx); cy = Math.floor(cy);
      const key = chunkKey(cx, cy);
      let chunk = F.state.world.chunks[key];
      if (chunk) return chunk;
      chunk = genChunk(cx, cy);
      F.state.world.chunks[key] = chunk;
      const pending = pendingDeltas.get(key);
      if (pending) {
        // This chunk was part of a loaded save: apply the saved per-tile
        // overrides + pollution/spawnerCount, and DO NOT re-run spawner
        // placement — any spawners it had already exist as real entities
        // restored from F.state.entities, so re-rolling here would place
        // duplicates (see report / ARCHITECTURE §5 & §12).
        applyDelta(chunk, pending.delta);
        chunk.pollution = pending.pollution || 0;
        chunk.spawnerCount = pending.spawnerCount || 0;
        chunk.delta = pending.delta || null;
        pendingDeltas.delete(key);
      } else {
        maybePlaceSpawners(cx, cy, chunk);
      }
      return chunk;
    },

    chunkAt: function (tx, ty) {
      if (!F.state || !F.state.world) return null;
      const cx = F.util.floorDiv(Math.floor(tx), 32), cy = F.util.floorDiv(Math.floor(ty), 32);
      return F.state.world.chunks[chunkKey(cx, cy)] || null;
    },

    chunkOf: function (tx, ty) {
      tx = Math.floor(tx); ty = Math.floor(ty);
      const cx = F.util.floorDiv(tx, 32), cy = F.util.floorDiv(ty, 32);
      const lx = tx - cx * 32, ly = ty - cy * 32;
      return [cx, cy, ly * 32 + lx];
    },

    terrain: function (tx, ty) {
      tx = Math.floor(tx); ty = Math.floor(ty);
      return tileChunk(tx, ty).terrain[tileIndex(tx, ty)];
    },

    isWater: function (tx, ty) { return F.world.terrain(tx, ty) < 2; },
    isLand: function (tx, ty) { return inMapLimit(tx, ty) && F.world.terrain(tx, ty) >= 2; },

    resource: function (tx, ty) {
      tx = Math.floor(tx); ty = Math.floor(ty);
      const chunk = tileChunk(tx, ty), i = tileIndex(tx, ty);
      const idx = chunk.res[i];
      if (!idx) return null;
      return { item: RES_ITEM[idx], amount: chunk.amount[i] };
    },
    // Ore left on a tile (0 when none) — resource() without the allocation, for hot paths.
    resourceAmount: function (tx, ty) {
      tx = Math.floor(tx); ty = Math.floor(ty);
      const chunk = tileChunk(tx, ty), i = tileIndex(tx, ty);
      return chunk.res[i] ? chunk.amount[i] : 0;
    },

    mineResource: function (tx, ty, n) {
      n = (n === undefined) ? 1 : Math.max(0, n);
      const r = F.world.chunkOf(tx, ty);
      const chunk = F.world.ensureChunk(r[0], r[1]);
      const i = r[2];
      const idx = chunk.res[i];
      if (!idx) return null;
      // Crude-oil wells are pumpjack-only (EXPANSION §6.4): not hand-minable and not
      // targetable by burner/electric drills. Guarded here (rather than hidden from
      // F.world.resource(), which pumpjack placement/pickers still need to see) so
      // every caller of mineResource gets a consistent "nothing happened" result.
      if (idx === RES.CRUDE_OIL) return null;
      const item = RES_ITEM[idx];
      const remain = Math.max(0, chunk.amount[i] - n);
      chunk.amount[i] = remain;
      if (remain <= 0) { chunk.res[i] = 0; chunk.amount[i] = 0; }
      markDelta(chunk, 'amount', i, chunk.amount[i]);
      if (F.render && typeof F.render.invalidateChunk === 'function') {
        try { F.render.invalidateChunk(r[0], r[1]); } catch (err) { /* rendering is best-effort */ }
      }
      return item;
    },

    feature: function (tx, ty) {
      tx = Math.floor(tx); ty = Math.floor(ty);
      return tileChunk(tx, ty).feature[tileIndex(tx, ty)];
    },

    removeFeature: function (tx, ty) {
      const r = F.world.chunkOf(tx, ty);
      const chunk = F.world.ensureChunk(r[0], r[1]);
      const i = r[2];
      chunk.feature[i] = 0; chunk.featHp[i] = 0;
      markDelta(chunk, 'feature', i, 0);
      markDelta(chunk, 'featHp', i, 0);
      if (F.render && typeof F.render.invalidateChunk === 'function') {
        try { F.render.invalidateChunk(r[0], r[1]); } catch (err) { /* best-effort */ }
      }
    },

    damageFeature: function (tx, ty, dmg) {
      const r = F.world.chunkOf(tx, ty);
      const chunk = F.world.ensureChunk(r[0], r[1]);
      const i = r[2];
      if (!chunk.feature[i]) return false;
      const hp = Math.max(0, chunk.featHp[i] - Math.max(0, dmg || 0));
      chunk.featHp[i] = hp;
      if (hp <= 0) {
        chunk.feature[i] = 0; chunk.featHp[i] = 0;
        markDelta(chunk, 'feature', i, 0);
        markDelta(chunk, 'featHp', i, 0);
        return true;
      }
      markDelta(chunk, 'featHp', i, hp);
      return false;
    },

    passable: function (tx, ty) {
      if (!inMapLimit(tx, ty)) return false;
      if (!F.world.isLand(tx, ty)) return false;
      if (F.world.feature(tx, ty) !== 0) return false;
      const e = F.world.entityAt(tx, ty);
      if (e && entityCollides(e)) return false;
      return true;
    },

    buildable: function (tx, ty) {
      if (!inMapLimit(tx, ty)) return false;
      if (!F.world.isLand(tx, ty)) return false;
      if (F.world.feature(tx, ty) !== 0) return false;
      if (F.world.entityAt(tx, ty)) return false;
      return true;
    },

    entityAt: function (tx, ty) {
      if (!F.world._tileMap) return null;
      return F.world._tileMap.get(F.util.key(Math.floor(tx), Math.floor(ty))) || null;
    },

    setEntityTiles: function (entity, present) {
      if (!entity) return;
      const tiles = (F.entities && typeof F.entities.tiles === 'function') ? F.entities.tiles(entity) : fallbackTiles(entity);
      for (let i = 0; i < tiles.length; i++) {
        const tx = tiles[i][0], ty = tiles[i][1];
        const key = F.util.key(tx, ty);
        if (present) {
          F.world._tileMap.set(key, entity);
        } else if (F.world._tileMap.get(key) === entity) {
          F.world._tileMap.delete(key);
        }
      }
    },

    forEachChunkInRect: function (tx0, ty0, tx1, ty1, fn) {
      if (tx0 > tx1) { const t = tx0; tx0 = tx1; tx1 = t; }
      if (ty0 > ty1) { const t = ty0; ty0 = ty1; ty1 = t; }
      const cx0 = F.util.floorDiv(Math.floor(tx0), 32), cx1 = F.util.floorDiv(Math.floor(tx1), 32);
      const cy0 = F.util.floorDiv(Math.floor(ty0), 32), cy1 = F.util.floorDiv(Math.floor(ty1), 32);
      for (let cy = cy0; cy <= cy1; cy++) {
        for (let cx = cx0; cx <= cx1; cx++) fn(F.world.ensureChunk(cx, cy));
      }
    },

    findResourceNear: function (item, x, y, radius) {
      const idx = RES_ITEM.indexOf(item);
      if (idx <= 0) { F.log.warn('findResourceNear: unknown item', item); return null; }
      radius = radius || 200;
      let best = null, bestDist = Infinity;
      const cx0 = F.util.floorDiv(Math.floor(x - radius), 32), cx1 = F.util.floorDiv(Math.floor(x + radius), 32);
      const cy0 = F.util.floorDiv(Math.floor(y - radius), 32), cy1 = F.util.floorDiv(Math.floor(y + radius), 32);
      for (let ccy = cy0; ccy <= cy1; ccy++) {
        for (let ccx = cx0; ccx <= cx1; ccx++) {
          const chunk = F.world.ensureChunk(ccx, ccy);
          const tx0 = ccx * 32, ty0 = ccy * 32;
          for (let ly = 0; ly < 32; ly++) {
            for (let lx = 0; lx < 32; lx++) {
              const i = ly * 32 + lx;
              if (chunk.res[i] !== idx) continue;
              const tx = tx0 + lx, ty = ty0 + ly;
              const d = Math.hypot(tx - x, ty - y);
              if (d > radius) continue;
              if (d < bestDist) { bestDist = d; best = { x: tx, y: ty, amount: chunk.amount[i] }; }
            }
          }
        }
      }
      return best;
    },

    // EXPANSION §6.4: same search as findResourceNear but fixed to crude-oil,
    // used by the pumpjack placement rule / oil-feature scenarios.
    findOilNear: function (x, y, radius) {
      return F.world.findResourceNear('crude-oil', x, y, radius);
    },

    tileInfo: function (tx, ty) {
      const r = F.world.chunkOf(tx, ty);
      const chunk = F.world.ensureChunk(r[0], r[1]);
      const i = r[2];
      const tId = chunk.terrain[i];
      const resIdx = chunk.res[i];
      const featId = chunk.feature[i];
      return {
        tx: tx, ty: ty,
        terrain: tId,
        terrainName: F.t(TERRAIN_NAME_KEY[tId] || 'world.terrain.unknown'),
        water: tId < 2,
        resource: resIdx ? { item: RES_ITEM[resIdx], amount: chunk.amount[i] } : null,
        feature: featId,
        featureName: featId ? F.t(FEATURE_NAME_KEY[featId]) : null,
        pollution: chunk.pollution,
      };
    },

    // Lazy generation around the player, at most 2 chunks per tick, nearest
    // ring first, within a 3-chunk radius (called once per tick by
    // 80-game.js, phase 1).
    tick: function () {
      if (!F.state || !F.state.player || !F.state.world) return;
      try {
        const px = F.state.player.x, py = F.state.player.y;
        const pcx = F.util.floorDiv(Math.floor(px), 32);
        const pcy = F.util.floorDiv(Math.floor(py), 32);
        let budget = 2;
        for (let r = 0; r <= 3 && budget > 0; r++) {
          for (let dy = -r; dy <= r && budget > 0; dy++) {
            for (let dx = -r; dx <= r && budget > 0; dx++) {
              if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
              const cx = pcx + dx, cy = pcy + dy;
              const key = chunkKey(cx, cy);
              if (!F.state.world.chunks[key]) {
                F.world.ensureChunk(cx, cy);
                budget--;
              }
            }
          }
        }
      } catch (err) {
        F.log.error('F.world.tick', err); // never throw during a tick
      }
    },

    // Rebuilds the tile -> entity map from F.state.entities (called after
    // F.load, per ARCHITECTURE §18).
    rebuild: function () {
      F.world._tileMap = new Map();
      if (!F.state || !F.state.entities) return;
      for (let i = 0; i < F.state.entities.length; i++) {
        F.world.setEntityTiles(F.state.entities[i], true);
      }
    },

    // ---------------------------------------------------------------------
    // Delta save/load (see the module header comment above `paramsCache`).
    // Called by F.save()/F.load() in 80-game.js INSTEAD OF walking
    // F.state.world.chunks' typed arrays: chunks are regenerated
    // deterministically from the seed, so only small per-tile overrides +
    // pollution/spawnerCount need to round-trip.
    // ---------------------------------------------------------------------

    // -> array of { cx, cy, pollution, spawnerCount, delta } — only for
    // chunks that have a non-empty delta or non-zero pollution/spawnerCount.
    // Covers both chunks currently live in F.state.world.chunks (this
    // session regenerated/mutated them) and chunks that arrived from a
    // loaded save but haven't been visited (regenerated) yet this session —
    // otherwise their deltas would be silently dropped by a save taken
    // before the player ever wanders back into them.
    exportChunks: function () {
      const out = [];
      const chunks = F.state && F.state.world && F.state.world.chunks;
      if (chunks) {
        for (const key in chunks) {
          if (!Object.prototype.hasOwnProperty.call(chunks, key)) continue;
          const c = chunks[key];
          if (!c) continue;
          const rec = chunkExportRecord(c.cx, c.cy, c.pollution, c.spawnerCount, c.delta);
          if (rec) out.push(rec);
        }
      }
      pendingDeltas.forEach(function (pending, key) {
        if (chunks && chunks[key]) return; // already regenerated & exported above
        const rec = chunkExportRecord(pending.cx, pending.cy, pending.pollution, pending.spawnerCount, pending.delta);
        if (rec) out.push(rec);
      });
      return out;
    },

    // Stores `list` as pending per-chunk deltas and (re)initialises
    // F.state.world to the live { seed, chunks:{} } shape; F.world.ensureChunk
    // regenerates a chunk on demand and applies its pending delta (if any)
    // the first time it's touched. Accepts either the new compact array
    // format (SAVE_VERSION >= 2) or a legacy SAVE_VERSION 1 object map of
    // full chunks (real typed arrays, already decoded by F.load), which is
    // diffed against a fresh regeneration to recover an equivalent delta —
    // this is the "keep the decoder path" backward-compat requirement.
    importChunks: function (list, seed) {
      seed = (seed >>> 0) || 1;
      F.state.world = { seed: seed, chunks: {} };
      pendingDeltas = new Map();
      if (!list) return;
      if (Array.isArray(list)) {
        for (let i = 0; i < list.length; i++) {
          const rec = list[i];
          if (!rec || typeof rec.cx !== 'number' || typeof rec.cy !== 'number') continue;
          pendingDeltas.set(chunkKey(rec.cx, rec.cy), {
            cx: rec.cx, cy: rec.cy,
            pollution: rec.pollution || 0,
            spawnerCount: rec.spawnerCount || 0,
            delta: rec.delta || {},
          });
        }
        return;
      }
      if (typeof list === 'object') {
        for (const key in list) {
          if (!Object.prototype.hasOwnProperty.call(list, key)) continue;
          const oc = list[key];
          if (!oc || typeof oc.cx !== 'number' || typeof oc.cy !== 'number') continue;
          const rec = legacyChunkToDelta(oc, seed);
          pendingDeltas.set(chunkKey(rec.cx, rec.cy), rec);
        }
      }
    },
  };

  // ---------------------------------------------------------------------
  // i18n (module #10 — F.i18n exists by the time modules >= 10 load).
  // ---------------------------------------------------------------------


  F.i18n.add('en', {
    'world.terrain.deepwater': 'Deep water',
    'world.terrain.water': 'Water',
    'world.terrain.sand': 'Sand',
    'world.terrain.red_desert': 'Red desert',
    'world.terrain.dirt': 'Dirt',
    'world.terrain.grass_dry': 'Dry grass',
    'world.terrain.grass': 'Grass',
    'world.terrain.unknown': 'Unknown terrain',
    'world.feature.tree': 'Tree',
    'world.feature.rock_big': 'Big rock',
    'world.feature.rock_huge': 'Huge rock',
  });
})();
