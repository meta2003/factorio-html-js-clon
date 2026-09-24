// 61-render.js — canvas world rendering: camera, terrain chunk cache, entity/belt/unit
// drawing, overlays (placement preview, alt-mode, mining ring, selection, night, status
// icons, damage flashes) and the minimap / full-map image.
// See design/ARCHITECTURE.md §16 (F.camera / F.render contract) and design/GDD.md §11
// (rendering rules), §9.8/9.9 (minimap + alt-mode) and §9.11 (placement preview).
//
// Defines: F.camera, F.render.
//
// HARD RULE: F.render.frame() must NEVER mutate F.state and must NEVER call anything
// that generates world data (e.g. F.world.ensureChunk/terrain/resource) — chunk
// generation is the job of F.world.tick() (simulation phase). This module only reads
// already-generated chunks via F.world.chunkAt(), which never generates.
//
// Everything that touches `document`/canvas is lazy: nothing at load time, guarded by
// `window.HEADLESS` inside init()/frame()/minimap()/mapImage() so the module is a safe
// no-op under the headless test harness (design/ENGINEERING-CONSTRAINTS.md "Headless
// contract"). This module has no user-facing text of its own (pure canvas drawing —
// labels/tooltips belong to 70-ui.js), so it registers no F.i18n keys.
(function () {
  'use strict';

  // =====================================================================
  // Render-owned state (NOT F.state — must never be serialised, never part
  // of the simulation). Lives entirely in this closure.
  // =====================================================================
  var canvasEl = null, ctx = null, ready = false;
  var viewW = 800, viewH = 600, dpr = 1;
  var frameCount = 0;

  // Terrain chunk cache: key "cx,cy" -> { canvas, ctx, cx, cy, lastUsed(ms), dirty }
  var chunkCache = new Map();
  var GC_INTERVAL_MS = 500;
  var GC_MAX_AGE_MS = 10000;
  var CHUNK_CACHE_CAP = 64;
  var gcAccum = 0;

  // Camera smoothing / player animation bookkeeping.
  var camInited = false;
  var playerPrev = null;   // { x, y }
  var playerAnimT = 0;

  // Damage flashes / destruction puffs, keyed by entity id (never on F.state).
  var damageFlash = new Map(); // id -> tick of last damage
  var destroyFlash = [];       // [{x,y,tick}]

  // Minimap base-image cache (rebuilt every ~30 frames per GDD §11.8).
  var minimapOut = null;   // output canvas returned to callers
  var minimapBase = null;  // { canvas, builtAtFrame }

  // Off-screen scratch canvas for the night/lighting cutout pass.
  var nightScratch = null; // { canvas, ctx }

  // World-reset detection (new game / load): clears every cache below so a
  // previous world's terrain/entities never leak into the new one.
  var lastWorldSeed;

  function resetCaches() {
    chunkCache.clear();
    minimapBase = null;
    damageFlash.clear();
    destroyFlash.length = 0;
    playerPrev = null;
    camInited = false;
  }

  function checkWorldReset() {
    var seed = F.state && F.state.world && F.state.world.seed;
    if (seed !== lastWorldSeed) { lastWorldSeed = seed; resetCaches(); }
  }

  // =====================================================================
  // Defensive registry queue (design/EXPANSION.md §6.5). Feature files 37-oil.js/38-trains.js/
  // 39-robots.js/45-rocket.js load BEFORE this module (load order 05..45 < 60-sprites < 61-render),
  // so `F.render` does not exist yet when they run — they cannot call F.render.addLayer() etc.
  // directly. Instead everything (both those early callers AND F.render's own wrapper functions
  // below) reads/writes this single plain object hung off `F`, created by whichever module runs
  // first. See EXPANSION.md §6.5 for the exact snippet early-loading files should use.
  // =====================================================================
  var RH = F._renderHooks = F._renderHooks || {
    layers: { floor: [], objects: [], air: [], overlay: [] },
    entityOpts: {},     // behaviour -> fn(e, def, tick) -> {frame, opts}
    minimapColors: {},  // behaviour|layer -> color
    hidePlayerFns: [],  // fn() -> bool
    altOverlayFns: [],  // fn(ctx, e, def, sx, sy, tilePx)
  };
  // A feature file that already pushed layer functions before this module's own layer buckets
  // existed (shouldn't happen given the fixed shape above, but stay defensive) would otherwise
  // be silently dropped.
  ['floor', 'objects', 'air', 'overlay'].forEach(function (z) { RH.layers[z] = RH.layers[z] || []; });

  // =====================================================================
  // F.camera — pure math, safe to call at any time (no DOM access).
  // =====================================================================
  var camera = {
    x: 0, y: 0, zoom: 1,
    toScreen: toScreen,
    toWorld: toWorld,
    visibleTileRect: visibleTileRect,
  };
  F.camera = camera;

  function tilePx() { return F.C.TILE * (camera.zoom || 1); }

  function toScreen(tx, ty) {
    var t = tilePx();
    return [(tx - camera.x) * t + viewW / 2, (ty - camera.y) * t + viewH / 2];
  }
  function toWorld(px, py) {
    var t = tilePx();
    return [camera.x + (px - viewW / 2) / t, camera.y + (py - viewH / 2) / t];
  }
  function visibleTileRect() {
    var t = tilePx();
    var halfW = (viewW / 2) / t, halfH = (viewH / 2) / t;
    return {
      x0: Math.floor(camera.x - halfW) - 1,
      y0: Math.floor(camera.y - halfH) - 1,
      x1: Math.ceil(camera.x + halfW) + 1,
      y1: Math.ceil(camera.y + halfH) + 1,
    };
  }

  function updateCamera(dtMs) {
    var p = F.state && F.state.player;
    if (!p) return;
    if (!camInited) { camera.x = p.x; camera.y = p.y; camInited = true; return; }
    var t = 1 - Math.exp(-dtMs / 110); // smooth, framerate-independent follow
    camera.x += (p.x - camera.x) * t;
    camera.y += (p.y - camera.y) * t;
  }

  // =====================================================================
  // F.render registry hooks (design/EXPANSION.md §6.5): addLayer / entityOpts / minimapColor /
  // hidePlayerWhen / altOverlay. All of these are thin wrappers over the RH object above so a
  // call from a feature file that loaded before this module (via the direct-RH snippet) and a
  // call made through F.render after this module has loaded land in the exact same place.
  // =====================================================================
  function addLayer(z, fn) {
    if (typeof fn !== 'function') return;
    if (!RH.layers[z]) { F.log.warn('[render] addLayer: unknown layer "' + z + '"'); RH.layers[z] = []; }
    RH.layers[z].push(fn);
  }
  function runLayer(z, rect) {
    var arr = RH.layers[z];
    if (!arr || !arr.length) return;
    for (var i = 0; i < arr.length; i++) {
      try { arr[i](ctx, rect, camera); } catch (err) { F.log.error('[render] addLayer("' + z + '") hook', err); }
    }
  }
  function registerEntityOpts(behaviour, fn) { if (typeof fn === 'function') RH.entityOpts[behaviour] = fn; }
  function registerMinimapColor(behaviourOrLayer, color) { RH.minimapColors[behaviourOrLayer] = color; }
  function registerHidePlayerWhen(fn) { if (typeof fn === 'function') RH.hidePlayerFns.push(fn); }
  function registerAltOverlay(fn) { if (typeof fn === 'function') RH.altOverlayFns.push(fn); }
  function playerHidden() {
    for (var i = 0; i < RH.hidePlayerFns.length; i++) {
      try { if (RH.hidePlayerFns[i]()) return true; } catch (err) { F.log.error('[render] hidePlayerWhen hook', err); }
    }
    return false;
  }

  // =====================================================================
  // Canvas lifecycle (DOM-touching — lazy only, never at load time).
  // =====================================================================
  function resize() {
    if (!canvasEl || !ctx) return;
    dpr = window.devicePixelRatio || 1;
    var cssW = canvasEl.clientWidth || window.innerWidth || viewW;
    var cssH = canvasEl.clientHeight || window.innerHeight || viewH;
    viewW = cssW; viewH = cssH;
    var pw = Math.max(1, Math.round(cssW * dpr));
    var ph = Math.max(1, Math.round(cssH * dpr));
    if (canvasEl.width !== pw) canvasEl.width = pw;
    if (canvasEl.height !== ph) canvasEl.height = ph;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
  }

  function init(canvas) {
    if (window.HEADLESS) { F.log.info('F.render.init: skipped (HEADLESS)'); return; }
    if (!canvas || !canvas.getContext) { F.log.error('F.render.init: invalid canvas'); return; }
    canvasEl = canvas;
    ctx = canvasEl.getContext('2d');
    if (!ctx) { F.log.error('F.render.init: 2d context unavailable'); return; }
    resize();
    try { window.addEventListener('resize', resize); } catch (err) { F.log.warn('F.render.init: addEventListener failed', err); }
    ready = true;
  }

  // =====================================================================
  // Terrain chunk cache (GDD §11.2/11.3/11.4). Never generates chunks —
  // only reads what F.world already produced (F.world.chunkAt, no gen).
  // =====================================================================
  function chunkKey(cx, cy) { return cx + ',' + cy; }

  function oreStage(amount) {
    if (!(amount > 0)) return 4;
    if (amount > 4000) return 0;
    if (amount > 2000) return 1;
    if (amount > 800) return 2;
    return 3;
  }

  // Terrain id at a chunk-local (lx,ly), following into neighbouring chunks via
  // F.world.chunkAt (read-only, never generates — GDD/ARCHITECTURE hard rule for this
  // module). Returns -1 when the neighbour chunk isn't generated yet (caller must treat
  // that as "unknown, don't blend" rather than a real terrain id).
  function terrainAt(chunk, lx, ly) {
    if (lx >= 0 && lx < F.C.CHUNK && ly >= 0 && ly < F.C.CHUNK) return chunk.terrain[ly * F.C.CHUNK + lx];
    var wtx = chunk.cx * F.C.CHUNK + lx, wty = chunk.cy * F.C.CHUNK + ly;
    var nchunk = (F.world && F.world.chunkAt) ? F.world.chunkAt(wtx, wty) : null;
    if (!nchunk) return -1;
    var nlx = ((wtx % F.C.CHUNK) + F.C.CHUNK) % F.C.CHUNK, nly = ((wty % F.C.CHUNK) + F.C.CHUNK) % F.C.CHUNK;
    return nchunk.terrain[nly * F.C.CHUNK + nlx];
  }

  var FOAM = 'rgba(214,238,238,0.85)';
  // One soft, irregular blob per differing edge (jittered offset/radius) instead of a
  // straight gradient line — the overlap between this tile's blob and the neighbour tile's
  // own blob (drawn when IT is processed) is what removes the hard per-tile boundary (task
  // brief problem #1 "soft blending between terrain types ... no hard per-tile squares").
  function blendEdge(c, x0, y0, T, dx, dy, ownWater, nId, nWater, rng) {
    var mx = x0 + T * (0.5 + dx * 0.5), my = y0 + T * (0.5 + dy * 0.5);
    var jx = (dx === 0) ? (rng() - 0.5) * T * 0.5 : 0, jy = (dy === 0) ? (rng() - 0.5) * T * 0.5 : 0;
    var r = T * (0.55 + rng() * 0.25);
    var color = (ownWater !== nWater) ? FOAM : F.sprites.terrainColor(nId);
    var g = c.createRadialGradient(mx + jx, my + jy, 0, mx + jx, my + jy, r);
    g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.save(); c.globalAlpha = (ownWater !== nWater) ? 0.30 : 0.5; c.fillStyle = g;
    c.beginPath(); c.arc(mx + jx, my + jy, r, 0, Math.PI * 2); c.fill(); c.restore();
  }

  // ---------------------------------------------------------------------
  // Smooth ground (see buildChunkCanvas). Value noise on an integer lattice hashed from
  // world coordinates, so every chunk computes identical values along shared borders.
  // ---------------------------------------------------------------------
  var GROUND_CELL = 4;
  var groundRGB = null, grainPattern = null;
  function groundPalette() {
    if (groundRGB) return groundRGB;
    groundRGB = [];
    for (var id = 0; id <= 10; id++) {
      var hx = (F.sprites && F.sprites.terrainColor) ? F.sprites.terrainColor(id) : '#806040';
      groundRGB.push([parseInt(hx.slice(1, 3), 16), parseInt(hx.slice(3, 5), 16), parseInt(hx.slice(5, 7), 16)]);
    }
    // ids 2/3, 4/5, 6/7, 8/9 are per-tile fill/speckle variants of one terrain family: use the
    // family average so variants do not show up as a tile pattern (noise supplies variation).
    for (var fam = 2; fam <= 8; fam += 2) {
      var m = [0, 1, 2].map(function (ch) { return (groundRGB[fam][ch] + groundRGB[fam + 1][ch]) / 2; });
      groundRGB[fam] = m; groundRGB[fam + 1] = m;
    }
    return groundRGB;
  }
  function vnoise(x, y, seed) {
    var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    var h = F.util.hash2, k = 1 / 4294967296;
    var a = h(xi, yi, seed) * k, b = h(xi + 1, yi, seed) * k, c = h(xi, yi + 1, seed) * k, d = h(xi + 1, yi + 1, seed) * k;
    var top = a + (b - a) * u, bot = c + (d - c) * u;
    return top + (bot - top) * v;
  }
  function paintGround(c, chunk, entry) {
    var CH = F.C.CHUNK, T = F.C.TILE, N = CH * T / GROUND_CELL, W2 = CH + 2;
    var pal = groundPalette();
    var G = new Int8Array(W2 * W2), missing = false, gx, gy;
    for (gy = -1; gy <= CH; gy++) for (gx = -1; gx <= CH; gx++) {
      var t = terrainAt(chunk, gx, gy);
      if (t < 0) { missing = true; t = chunk.terrain[F.util.clamp(gy, 0, CH - 1) * CH + F.util.clamp(gx, 0, CH - 1)]; }
      G[(gy + 1) * W2 + gx + 1] = t;
    }
    // The per-sample ground is expensive (~40 ms) and depends only on terrain, so each chunk
    // keeps its small ground canvas; ore/feature rebuilds (mining, trees) just reuse it.
    var groundScratch = entry.groundSmall;
    if (groundScratch && !entry.groundStale) { G = null; }
    else {
    entry.borderMissing = missing;
    entry.groundStale = false;
    if (!groundScratch) { groundScratch = entry.groundSmall = document.createElement('canvas'); groundScratch.width = N; groundScratch.height = N; }
    var gctx = groundScratch.getContext('2d');
    if (!gctx || !gctx.createImageData) return;
    var img = gctx.createImageData(N, N), d = img.data;
    var DP = new Float32Array(W2 * W2), anyWater = false;
    for (gy = -1; gy <= CH; gy++) for (gx = -1; gx <= CH; gx++) {
      if (G[(gy + 1) * W2 + gx + 1] >= 2) continue;
      anyWater = true;
      var wc = 0;
      for (var dy2 = -2; dy2 <= 2; dy2++) for (var dx2 = -2; dx2 <= 2; dx2++) {
        var tt = (gx + dx2 >= -1 && gx + dx2 <= CH && gy + dy2 >= -1 && gy + dy2 <= CH) ? G[(gy + dy2 + 1) * W2 + gx + dx2 + 1] : terrainAt(chunk, gx + dx2, gy + dy2);
        if (tt >= 0 && tt < 2) wc++; else if (tt < 0) wc += 0.5;
      }
      DP[(gy + 1) * W2 + gx + 1] = wc / 25;
    }
    var shallowW = [pal[1][0] * 1.15, pal[1][1] * 1.15, pal[1][2] * 1.1], deepW = [pal[0][0] * 0.85, pal[0][1] * 0.85, pal[0][2] * 0.9];
    var seed = ((F.state && F.state.world && F.state.world.seed) || 1) | 0;
    var step = GROUND_CELL / T, ox = chunk.cx * CH, oy = chunk.cy * CH;
    var sand = pal[8];
    var ts = [0, 0, 0, 0], ws = [0, 0, 0, 0];
    for (var py = 0; py < N; py++) {
      var ly = (py + 0.5) * step;
      for (var px = 0; px < N; px++) {
        var lx = (px + 0.5) * step, wx = ox + lx, wy = oy + ly;
        var qx = lx - 0.5 + (vnoise(wx * 0.45, wy * 0.45, seed + 11) - 0.5) * 0.8;
        var qy = ly - 0.5 + (vnoise(wx * 0.45, wy * 0.45, seed + 23) - 0.5) * 0.8;
        var ix = Math.floor(qx), iy = Math.floor(qy), fx = qx - ix, fy = qy - iy;
        fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
        var bi = (iy + 1) * W2 + ix + 1;
        ts[0] = G[bi]; ts[1] = G[bi + 1]; ts[2] = G[bi + W2]; ts[3] = G[bi + W2 + 1];
        ws[0] = (1 - fx) * (1 - fy); ws[1] = fx * (1 - fy); ws[2] = (1 - fx) * fy; ws[3] = fx * fy;
        var lr = 0, lg = 0, lb = 0, lw = 0, wr = 0, wg = 0, wb = 0, ww = 0;
        for (var q = 0; q < 4; q++) {
          var col = pal[ts[q]] || sand, w = ws[q];
          if (ts[q] < 2) { wr += col[0] * w; wg += col[1] * w; wb += col[2] * w; ww += w; }
          else { lr += col[0] * w; lg += col[1] * w; lb += col[2] * w; lw += w; }
        }
        if (lw > 0) { lr /= lw; lg /= lw; lb /= lw; } else { lr = sand[0] * 0.8; lg = sand[1] * 0.8; lb = sand[2] * 0.8; }
        if (ww > 0) { wr /= ww; wg /= ww; wb /= ww; }
        var n1 = vnoise(wx * 0.16, wy * 0.16, seed + 5), n2 = vnoise(wx * 0.8, wy * 0.8, seed + 7);
        var edge = ww + (n2 - 0.5) * 0.14;
        var R, Gc, B, k = (py * N + px) * 4;
        // land colour
        var shade = 0.88 + n1 * 0.16 + n2 * 0.07;
        var LR = lr * shade, LG = lg * shade, LB = lb * shade;
        if (edge > 0.34) { var wet = 1 - 0.28 * F.util.clamp((edge - 0.34) / 0.16, 0, 1); LR *= wet; LG *= wet; LB *= wet * 1.02; }
        // blend factor over a narrow band around the shoreline (anti-aliased edge)
        var aw = F.util.clamp((edge - 0.45) / 0.1, 0, 1); aw = aw * aw * (3 - 2 * aw);
        if (aw > 0) {
          var dp = DP[bi] * ws[0] + DP[bi + 1] * ws[1] + DP[bi + W2] * ws[2] + DP[bi + W2 + 1] * ws[3];
          var depth = F.util.clamp((dp - 0.45) / 0.55 + (n1 - 0.5) * 0.25, 0, 1);
          depth = depth * depth * (3 - 2 * depth);
          var dm = 1 + (n2 - 0.5) * 0.06;
          var WR = (shallowW[0] + (deepW[0] - shallowW[0]) * depth) * dm;
          var WG = (shallowW[1] + (deepW[1] - shallowW[1]) * depth) * dm;
          var WB = (shallowW[2] + (deepW[2] - shallowW[2]) * depth) * dm;
          var foam = F.util.clamp(1 - Math.abs(edge - 0.53) / 0.05, 0, 1) * 0.5;
          if (foam > 0) { WR += (205 - WR) * foam; WG += (228 - WG) * foam; WB += (226 - WB) * foam; }
          R = LR + (WR - LR) * aw; Gc = LG + (WG - LG) * aw; B = LB + (WB - LB) * aw;
        } else { R = LR; Gc = LG; B = LB; }
        d[k] = R; d[k + 1] = Gc; d[k + 2] = B; d[k + 3] = 255;
      }
    }
    gctx.putImageData(img, 0, 0);
    }
    c.save();
    c.imageSmoothingEnabled = true;
    c.drawImage(groundScratch, 0, 0, N, N, 0, 0, CH * T, CH * T);
    // fine grain: a 256px speck pattern (1024 is a multiple, so it tiles across chunks)
    if (!grainPattern) {
      var gc = document.createElement('canvas'); gc.width = 256; gc.height = 256;
      var g2 = gc.getContext('2d'), rng = F.rng.local(3, 5, 7);
      for (var s = 0; s < 2600; s++) {
        g2.fillStyle = rng() < 0.6 ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,240,0.07)';
        var sz = rng() < 0.8 ? 1 : 2;
        g2.fillRect(Math.floor(rng() * 256), Math.floor(rng() * 256), sz, sz);
      }
      grainPattern = c.createPattern(gc, 'repeat');
    }
    if (grainPattern) { c.fillStyle = grainPattern; c.fillRect(0, 0, CH * T, CH * T); }
    c.restore();
  }
  // Sparse small details per land tile (pebbles, grass tufts) at hashed positions.
  function paintGroundDetail(c, chunk) {
    var CH = F.C.CHUNK, T = F.C.TILE;
    var seed = ((F.state && F.state.world && F.state.world.seed) || 1) | 0;
    for (var ly = 0; ly < CH; ly++) for (var lx = 0; lx < CH; lx++) {
      var i = ly * CH + lx, t = chunk.terrain[i];
      if (t < 2 || chunk.res[i]) continue;
      var h = F.util.hash2(chunk.cx * CH + lx, chunk.cy * CH + ly, seed ^ 0x5151);
      if (h % 100 >= 22) continue;
      var x = lx * T + 4 + ((h >>> 8) % 24), y = ly * T + 4 + ((h >>> 13) % 24);
      if (t >= 2 && t <= 5 && (h & 1)) {
        c.strokeStyle = t <= 3 ? 'rgba(60,70,25,0.55)' : 'rgba(40,70,25,0.55)'; c.lineWidth = 1.2;
        c.beginPath();
        c.moveTo(x - 2, y + 2); c.lineTo(x - 3, y - 3);
        c.moveTo(x, y + 2); c.lineTo(x, y - 4);
        c.moveTo(x + 2, y + 2); c.lineTo(x + 3, y - 2);
        c.stroke();
      } else {
        var r = 1.2 + ((h >>> 20) & 3) * 0.5;
        c.fillStyle = 'rgba(0,0,0,0.22)'; c.beginPath(); c.ellipse(x + 0.8, y + 0.9, r, r * 0.75, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = 'rgba(205,195,170,0.45)'; c.beginPath(); c.ellipse(x, y, r, r * 0.75, 0, 0, Math.PI * 2); c.fill();
      }
    }
  }

  // Terrain chunk canvases are 1024 px; drawing them far below that size is slow (at zoom
  // 0.3 each visible chunk cost ~0.1 ms per frame, and the big sources also make Chrome
  // flush and rasterise mid-frame, which showed up as slow belt/entity draws at zoom 0.5).
  // When zoomed out, draw from a cached half-size copy while that copy still covers the
  // target (in device pixels), so the source is never scaled up. At zoom >= 1 (or 0.5 on a
  // 2x display) the full canvas is used exactly as before.
  var mipCache = new WeakMap(); // canvas -> [half, quarter, ...]; buildChunkCanvas drops stale ones
  function mipFor(img, dw, dh) {
    var tw = dw * dpr, th = dh * dpr;
    if (!(img.width >= 2 * tw && img.height >= 2 * th)) return img;
    var levels = mipCache.get(img);
    if (!levels) { levels = []; mipCache.set(img, levels); }
    var src = img;
    for (var lvl = 0; src.width >= 2 * tw && src.height >= 2 * th && src.width >= 4 && src.height >= 4; lvl++) {
      var next = levels[lvl];
      if (!next) {
        next = document.createElement('canvas');
        next.width = Math.ceil(src.width / 2); next.height = Math.ceil(src.height / 2);
        var nctx = next.getContext('2d');
        nctx.imageSmoothingEnabled = true;
        nctx.drawImage(src, 0, 0, next.width, next.height);
        levels[lvl] = next;
      }
      src = next;
    }
    return src;
  }

  function buildChunkCanvas(entry, chunk) {
    var px = F.C.CHUNK * F.C.TILE; // 1024
    if (!entry.canvas) {
      entry.canvas = document.createElement('canvas');
      entry.canvas.width = px; entry.canvas.height = px;
      entry.ctx = entry.canvas.getContext('2d');
    }
    var c = entry.ctx, T = F.C.TILE;
    mipCache.delete(entry.canvas); // repainted in place: drop its now-stale mip levels
    c.clearRect(0, 0, px, px);
    var waterRects = [];
    var ly, lx, i;
    // Pass 1+2: smooth ground painted per 4px sample in WORLD coordinates (domain-warped
    // bilinear blend of neighbouring tile colours + value noise), so there is no tile grid,
    // no chunk seam and no repeating blob pattern. Water keeps a crisp organic shoreline.
    paintGround(c, chunk, entry);
    for (ly = 0; ly < F.C.CHUNK; ly++) for (lx = 0; lx < F.C.CHUNK; lx++) {
      if (chunk.terrain[ly * F.C.CHUNK + lx] < 2) waterRects.push(lx * T, ly * T);
    }
    paintGroundDetail(c, chunk);
    // Ore (drawn for a 1-tile border too, because ore sprites overhang their tile and
    // would otherwise be cut off in a straight line at the chunk edge).
    if (F.sprites && F.sprites.ore) {
      for (ly = -1; ly <= F.C.CHUNK; ly++) {
        for (lx = -1; lx <= F.C.CHUNK; lx++) {
          var och = chunk, olx = lx, oly = ly;
          if (lx < 0 || ly < 0 || lx >= F.C.CHUNK || ly >= F.C.CHUNK) {
            och = F.world.chunkAt(chunk.cx * F.C.CHUNK + lx, chunk.cy * F.C.CHUNK + ly);
            if (!och) continue;
            olx = ((lx % F.C.CHUNK) + F.C.CHUNK) % F.C.CHUNK; oly = ((ly % F.C.CHUNK) + F.C.CHUNK) % F.C.CHUNK;
          }
          var oi = oly * F.C.CHUNK + olx, ores = och.res[oi];
          if (!ores) continue;
          var ov = F.util.hash2(chunk.cx * F.C.CHUNK + lx, chunk.cy * F.C.CHUNK + ly, 9) % 4;
          var ospr = F.sprites.ore(ores, oreStage(och.amount[oi]), ov);
          if (ospr) c.drawImage(ospr, lx * T - T * 0.25, ly * T - T * 0.25, T * 1.5, T * 1.5);
        }
      }
    }
    // Pass 3: trees/rocks on top of the ground and ore.
    for (ly = 0; ly < F.C.CHUNK; ly++) {
      for (lx = 0; lx < F.C.CHUNK; lx++) {
        i = ly * F.C.CHUNK + lx;
        var feat = chunk.feature[i];
        if (feat === 1 && F.sprites && F.sprites.tree) {
          var wtx2 = chunk.cx * F.C.CHUNK + lx, wty2 = chunk.cy * F.C.CHUNK + ly;
          var tv = F.util.hash2(wtx2, wty2, 2) % 3;
          var tspr2 = F.sprites.tree(tv);
          if (tspr2) c.drawImage(tspr2, lx * T - T * 0.25, ly * T - T * 0.6, T * 1.5, T * 1.5);
        } else if ((feat === 2 || feat === 3) && F.sprites && F.sprites.rock) {
          var rspr = F.sprites.rock(feat === 3 ? 'huge' : 'big');
          if (rspr) c.drawImage(rspr, lx * T, ly * T, T, T);
        }
      }
    }
    // Cheap per-frame water shimmer (task brief "subtle animated shimmer") is drawn live in
    // drawTerrain() by clipping to this Path2D of the chunk's water tiles, built once here.
    if (waterRects.length && typeof Path2D !== 'undefined') {
      var path = new Path2D();
      for (var wi = 0; wi < waterRects.length; wi += 2) path.rect(waterRects[wi], waterRects[wi + 1], T, T);
      entry.waterPath = path;
    } else {
      entry.waterPath = null;
    }
  }

  function getChunkEntry(cx, cy) {
    var chunk = (F.world && F.world.chunkAt) ? F.world.chunkAt(cx * F.C.CHUNK, cy * F.C.CHUNK) : null;
    if (!chunk) return null; // not generated yet — nothing to draw (never generate here)
    var key = chunkKey(cx, cy);
    var entry = chunkCache.get(key);
    if (!entry) { entry = { canvas: null, ctx: null, cx: cx, cy: cy, lastUsed: 0, dirty: true }; chunkCache.set(key, entry); }
    entry.lastUsed = F.util.now();
    // A chunk built before its neighbours existed guessed their border terrain; rebuild it
    // once all 8 neighbours are generated so shared borders match exactly.
    if (entry.borderMissing && !entry.dirty && ((entry.borderCheck = (entry.borderCheck || 0) + 1) % 30 === 0)) {
      var all = true;
      for (var ny = -1; ny <= 1 && all; ny++) for (var nx = -1; nx <= 1 && all; nx++) {
        if ((nx || ny) && !F.world.chunkAt((cx + nx) * F.C.CHUNK, (cy + ny) * F.C.CHUNK)) all = false;
      }
      if (all) { entry.dirty = true; entry.groundStale = true; }
    }
    if (entry.dirty || !entry.canvas) {
      try { buildChunkCanvas(entry, chunk); } catch (err) { F.log.error('F.render: buildChunkCanvas', cx, cy, err); }
      entry.dirty = false;
    }
    return entry;
  }

  function invalidateChunk(cx, cy) {
    var e = chunkCache.get(chunkKey(cx, cy));
    if (e) e.dirty = true;
  }

  function gcChunks(dtMs) {
    gcAccum += dtMs;
    if (gcAccum < GC_INTERVAL_MS) return;
    gcAccum = 0;
    var now = F.util.now();
    var entries = [];
    chunkCache.forEach(function (e) { entries.push(e); });
    for (var i = 0; i < entries.length; i++) {
      if (now - entries[i].lastUsed > GC_MAX_AGE_MS) chunkCache.delete(chunkKey(entries[i].cx, entries[i].cy));
    }
    if (chunkCache.size > CHUNK_CACHE_CAP) {
      entries = [];
      chunkCache.forEach(function (e) { entries.push(e); });
      entries.sort(function (a, b) { return a.lastUsed - b.lastUsed; });
      var excess = chunkCache.size - CHUNK_CACHE_CAP;
      for (var j = 0; j < excess; j++) chunkCache.delete(chunkKey(entries[j].cx, entries[j].cy));
    }
  }

  // Water shimmer: cheap per-frame overlay — clip to the chunk's precomputed water-tile
  // path (built once in buildChunkCanvas), then fill two large, slowly-drifting diagonal
  // gradient bands. Cost is one clip + two gradient fills per visible water-containing
  // chunk (never per tile, never per frame for chunks with no water at all).
  function drawWaterShimmer(entry, p0, size, chunkPx) {
    if (!entry.waterPath) return;
    var t = (F.state.tick || 0) * 0.01;
    ctx.save();
    ctx.translate(p0[0], p0[1]);
    ctx.scale(size / chunkPx, size / chunkPx);
    ctx.clip(entry.waterPath);
    var span = chunkPx * 1.6;
    var off = ((t * 40) % span + span) % span - span * 0.5;
    var g = ctx.createLinearGradient(off - span * 0.5, 0, off + span * 0.5, chunkPx);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.48, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.10)');
    g.addColorStop(0.52, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, chunkPx, chunkPx);
    ctx.restore();
  }

  function drawTerrain(rect) {
    var cx0 = F.util.floorDiv(rect.x0, F.C.CHUNK), cx1 = F.util.floorDiv(rect.x1, F.C.CHUNK);
    var cy0 = F.util.floorDiv(rect.y0, F.C.CHUNK), cy1 = F.util.floorDiv(rect.y1, F.C.CHUNK);
    var chunkPx = F.C.CHUNK * F.C.TILE;
    var shimmer = camera.zoom >= 0.75; // GDD §11.7 "zoomed out: skip [cheap extras]"
    for (var cy = cy0; cy <= cy1; cy++) {
      for (var cx = cx0; cx <= cx1; cx++) {
        var entry = getChunkEntry(cx, cy);
        if (!entry || !entry.canvas) continue;
        var p0 = toScreen(cx * F.C.CHUNK, cy * F.C.CHUNK);
        var size = chunkPx * camera.zoom;
        ctx.drawImage(mipFor(entry.canvas, size, size), p0[0], p0[1], size, size);
        if (shimmer) drawWaterShimmer(entry, p0, size, chunkPx);
      }
    }
  }

  // =====================================================================
  // Small shared drawing helpers.
  // =====================================================================
  function inRectEntity(e, rect) {
    return !(e.x + e.w < rect.x0 || e.x > rect.x1 || e.y + e.h < rect.y0 || e.y > rect.y1);
  }

  function entityCenter(e) {
    return F.entities && F.entities.center ? F.entities.center(e) : [e.x + e.w / 2, e.y + e.h / 2];
  }

  var itemShadowCache = new Map();
  // Silhouette of an item icon in a flat colour (black = drop shadow, white = light rim).
  function itemShadow(id, spr, color) {
    var key = id + '|' + (color || '#000');
    var c = itemShadowCache.get(key);
    if (c !== undefined) return c;
    c = null;
    try {
      c = document.createElement('canvas'); c.width = spr.width; c.height = spr.height;
      var x = c.getContext('2d');
      x.drawImage(spr, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = color || '#000'; x.fillRect(0, 0, c.width, c.height);
    } catch (err) { c = null; }
    itemShadowCache.set(key, c);
    return c;
  }
  var beltItemCache = new Map();
  function beltItemSprite(id, spr) {
    var c = beltItemCache.get(id);
    if (c !== undefined) return c;
    c = null;
    try {
      var sh = itemShadow(id, spr, '#000'), rim = itemShadow(id, spr, '#fff');
      c = document.createElement('canvas'); c.width = 40; c.height = 40;
      var x = c.getContext('2d');
      if (sh) { x.globalAlpha = 0.5; x.drawImage(sh, 4 + 2.9, 4 + 3.8, 32, 32); }
      if (rim) { x.globalAlpha = 0.3; x.drawImage(rim, 4 - 1.6, 4 - 1.6, 32, 32); }
      x.globalAlpha = 1; x.drawImage(spr, 4, 4, 32, 32);
    } catch (err) { c = null; }
    beltItemCache.set(id, c);
    return c;
  }
  function drawItemIcon(id, px, py, size, outline) {
    var spr = (F.sprites && F.sprites.item) ? F.sprites.item(id, 32) : null;
    if (outline && spr) {
      // One pre-baked image per item type: soft drop shadow + faint light rim + icon, so a
      // belt item costs a single drawImage (hundreds of belt items per frame).
      var comp = beltItemSprite(id, spr);
      if (comp) { ctx.drawImage(comp, px - size * 0.625, py - size * 0.625, size * 1.25, size * 1.25); return; }
    }
    if (spr) { ctx.drawImage(spr, px - size / 2, py - size / 2, size, size); return; }
    var def = F.data.items[id];
    ctx.fillStyle = (def && def.icon && def.icon.color) || '#888';
    ctx.fillRect(px - size / 2, py - size / 2, size, size);
  }

  function drawEntitySpriteRect(e, spr) {
    var p0 = toScreen(e.x, e.y);
    var size = F.C.TILE * camera.zoom;
    if (spr) {
      ctx.drawImage(spr, p0[0], p0[1], e.w * size, e.h * size);
    } else {
      ctx.fillStyle = '#3a3a3a';
      ctx.fillRect(p0[0], p0[1], e.w * size, e.h * size);
    }
  }

  function entityStatus(e) {
    var def = F.data.entities[e.type];
    if (!def || !def.behaviour) return 'idle';
    try {
      if (def.behaviour === 'inserter' && F.inserters && F.inserters.status) return F.inserters.status(e);
      if (F.machines && F.machines.status && (def.behaviour === 'furnace' || def.behaviour === 'assembler' || def.behaviour === 'drill' || def.behaviour === 'lab' || def.behaviour === 'chest')) return F.machines.status(e);
      var beh = F.behaviours && F.behaviours[def.behaviour];
      if (beh && beh.status) return beh.status(e);
    } catch (err) { /* status lookup is best-effort for rendering only */ }
    return 'idle';
  }

  // =====================================================================
  // Ground items (GDD §6.23 / §11.4 "ground item").
  // =====================================================================
  function drawGroundItems(rect) {
    var g = F.state && F.state.ground;
    if (!g) return;
    var size = F.C.TILE * camera.zoom * 0.55;
    for (var key in g) {
      var it = g[key]; if (!it) continue;
      var xy = F.util.unkey(key), tx = xy[0], ty = xy[1];
      if (tx < rect.x0 - 1 || tx > rect.x1 + 1 || ty < rect.y0 - 1 || ty > rect.y1 + 1) continue;
      var p = toScreen(tx + 0.5, ty + 0.5);
      ctx.save();
      ctx.globalAlpha = 0.3; ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.ellipse(p[0], p[1] + size * 0.32, size * 0.42, size * 0.18, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      drawItemIcon(it.id, p[0], p[1], size);
    }
  }

  // =====================================================================
  // Belts + belt items (GDD §7 lane model via F.belts; §11.4/§11.6 visuals).
  // =====================================================================
  function beltSpeed(def) {
    if (def.belt) return def.belt.speed;
    if (def.underground) return def.underground.speed;
    if (def.splitter) return def.splitter.speed;
    return 8;
  }

  // End caps for straight belts: bit0 = nothing feeds this belt from behind (start of a line),
  // bit1 = nothing ahead accepts its items (open end of a line).
  function beltLikeAt(tx, ty) {
    var o = F.world && F.world.entityAt ? F.world.entityAt(tx, ty) : null;
    if (!o || o._removed) return null;
    var d = F.data.entities[o.type];
    return d && d.layer === 'belt' ? o : null;
  }
  function beltCaps(e) {
    var v = F.util.dirVec(e.dir), cap = 0, bd, fd;
    var bk = beltLikeAt(e.x - v[0], e.y - v[1]);
    if (bk) bd = F.data.entities[bk.type];
    var fedFromBehind = bk && bk.dir === e.dir && !(bd.underground && bk.io !== 'out');
    if (!fedFromBehind) cap |= 1;
    var fr = beltLikeAt(e.x + v[0], e.y + v[1]);
    if (fr) fd = F.data.entities[fr.type];
    var accepts = fr && (fd.belt ? fr.dir !== F.util.oppDir(e.dir) : (fr.dir === e.dir && !(fd.underground && fr.io === 'out')));
    if (!accepts) cap |= 2;
    return cap;
  }

  function drawBelts(rect) {
    var list = F.state && F.state.entities; if (!list) return;
    var i, e, def;
    for (i = 0; i < list.length; i++) {
      e = list[i]; if (e._removed) continue;
      def = F.data.entities[e.type]; if (!def || def.layer !== 'belt') continue;
      if (!inRectEntity(e, rect)) continue;
      // 16 frames = one rib period (1/4 tile); items advance 1/4 tile per step, so the ribs
      // move exactly with the items.
      var step = (F.belts && F.belts.stepTicks) ? F.belts.stepTicks(e) : Math.round(64 / beltSpeed(def));
      var frame = Math.floor((F.state.tick || 0) * 16 / step) % 16;
      var opts = def.underground ? { io: e.io === 'out' ? 'out' : 'in' } : null;
      if (def.belt) {
        if (e.curve) opts = { shape: e.curve > 0 ? 1 : -1 };
        else { var cap = beltCaps(e); if (cap) opts = { cap: cap }; }
      }
      var spr = (F.sprites && F.sprites.entity) ? F.sprites.entity(e.type, e.dir, frame, opts) : null;
      drawEntitySpriteRect(e, spr);
    }
    // Second pass so items always sit visually above every belt base tile.
    var lowZoom = camera.zoom < 0.75;
    for (i = 0; i < list.length; i++) {
      e = list[i]; if (e._removed) continue;
      def = F.data.entities[e.type]; if (!def || def.layer !== 'belt') continue;
      if (!inRectEntity(e, rect)) continue;
      if (!F.belts || !F.belts.items || !F.belts.laneWorldPos) continue;
      var items;
      try { items = F.belts.items(e); } catch (err) { continue; }
      if (!items || !items.length) continue;
      for (var k = 0; k < items.length; k++) {
        var id = items[k][0], lane = items[k][1], pos = items[k][2];
        var wp;
        try { wp = F.belts.laneWorldPos(e, lane, pos); } catch (err2) { continue; }
        if (!wp) continue;
        var p = toScreen(wp[0], wp[1]);
        if (lowZoom) {
          var idef = F.data.items[id];
          ctx.fillStyle = (idef && idef.icon && idef.icon.color) || '#ccc';
          ctx.fillRect(p[0] - 2, p[1] - 2, 4, 4);
        } else {
          drawItemIcon(id, p[0], p[1], F.C.TILE * camera.zoom * 0.34, true);
        }
      }
    }
  }

  // =====================================================================
  // Non-belt entities (GDD §11.2 layer order). Culled + y-sorted.
  // =====================================================================
  // Returns { floor, rest }: entities with def.layer === 'floor' (rails, design/EXPANSION.md §6.5)
  // are drawn in their own earlier pass (after belts, before other entities) via drawEntities too,
  // just called on `floor` first — see frameInner. Both arrays are y-sorted independently.
  function collectVisibleEntities(rect) {
    var list = F.state && F.state.entities; if (!list) return { floor: [], rest: [] };
    var floor = [], rest = [];
    for (var i = 0; i < list.length; i++) {
      var e = list[i]; if (e._removed) continue;
      var def = F.data.entities[e.type]; if (!def) continue;
      if (def.layer === 'belt') continue; // drawn by drawBelts
      if (!inRectEntity(e, rect)) continue;
      (def.layer === 'floor' ? floor : rest).push(e);
    }
    var bySort = function (a, b) { return (a.y + a.h) - (b.y + b.h); };
    floor.sort(bySort); rest.sort(bySort);
    return { floor: floor, rest: rest };
  }

  function isFluidCapable(type) {
    var def = F.data.entities[type];
    // storage-tank (design/EXPANSION.md §6.5/§7.1) has a port at the centre of all 4 edges, same
    // "connects on every side" shape as pipe, so it counts for a neighbouring pipe's connector
    // mask too. oil-refinery/chemical-plant/pumpjack are deliberately NOT included here: their
    // fluid ports sit at specific points along a multi-tile edge (not every point), so a
    // neighbour-mask (which assumes any point on the edge connects) would misrepresent them.
    return !!(def && (def.pipe || def.groundPipe || def.boiler || def.engine || def.offshore_pump || def.behaviour === 'storage-tank'));
  }
  // opts.fluid for the pipe/pipe-to-ground/storage-tank painters (design/EXPANSION.md §6.5):
  // F.fluids.fluidOf is added by another agent, so guard both its existence and any error inside
  // it (a not-yet-loaded/partial F.fluids must never break rendering).
  function addFluidOpt(e, opts) {
    if (!F.fluids || !F.fluids.fluidOf) return;
    try { var fl = F.fluids.fluidOf(e); if (fl) opts.fluid = fl; } catch (err) { /* best-effort */ }
  }

  // Neighbour bitmask (bit0=N,1=E,2=S,3=W) for tile-adjacent auto-shaping — shared by
  // pipes/pipe-to-ground (fluid network) and stone-wall (same-type neighbours only).
  function neighbourMask(e, test) {
    var mask = 0;
    for (var d = 0; d < 4; d++) {
      var v = F.C.DIRS[d];
      var ent = (F.world && F.world.entityAt) ? F.world.entityAt(e.x + v[0], e.y + v[1]) : null;
      if (ent && test(ent)) mask |= (1 << d);
    }
    return mask;
  }
  // Pipes also show a connector toward point-ported machines (refinery, chemical plant, pumpjack)
  // when one of that machine's fluid ports sits on the adjacent tile facing this pipe.
  function portFacing(ent, tx, ty, dir) {
    if (!F.fluids || !F.fluids.connections) return false;
    var ports; try { ports = F.fluids.connections(ent); } catch (err) { return false; }
    for (var i = 0; ports && i < ports.length; i++) {
      if (ports[i].x === tx && ports[i].y === ty && ports[i].dir === dir) return true;
    }
    return false;
  }
  function pipeConnMask(e) {
    var mask = 0;
    for (var d = 0; d < 4; d++) {
      var v = F.C.DIRS[d], nx = e.x + v[0], ny = e.y + v[1];
      var ent = (F.world && F.world.entityAt) ? F.world.entityAt(nx, ny) : null;
      if (ent && (isFluidCapable(ent.type) || portFacing(ent, nx, ny, (d + 2) % 4))) mask |= (1 << d);
    }
    return mask;
  }
  function wallConnMask(e) { return neighbourMask(e, function (ent) { return ent.type === 'stone-wall'; }); }

  // Working-animation frame: a 16-step bucket (matches the belt chevron strip's cache
  // convention, GDD §11.6) so cached-canvas identity (type|dir|frame|opts) stays bounded —
  // every gear/flywheel/drill-bob/flame-flicker/dish rotation loops over ≤16 canvases per
  // (type,dir,opts) instead of one new canvas per tick (which would defeat the sprite cache).
  var ANIM_FRAMES = 16;
  function animFrame(divisor) {
    return Math.floor((F.state.tick || 0) / (divisor || 4)) % ANIM_FRAMES;
  }

  function drawEntities(list) {
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      var def = F.data.entities[e.type];
      var frame = 0, opts = null;
      if (def.behaviour === 'pipe' || def.behaviour === 'pipe-to-ground') {
        opts = { mask: pipeConnMask(e) };
        addFluidOpt(e, opts);
      } else if (def.behaviour === 'storage-tank') {
        opts = {};
        addFluidOpt(e, opts);
      } else if (def.behaviour === 'wall') {
        opts = { mask: wallConnMask(e) };
      } else if (def.drill || def.assembler || def.furnace || def.boiler || def.engine) {
        var working = entityStatus(e) === 'working';
        frame = working ? animFrame(4) : 0;
        opts = { working: working };
      } else if (def.lab) {
        var labWorking = entityStatus(e) === 'working';
        frame = labWorking ? animFrame(6) : 0;
        opts = { working: labWorking };
      } else if (def.radar) {
        frame = animFrame(8);
      } else if (def.lamp) {
        opts = { lit: entityStatus(e) === 'working' };
      } else if (def.accumulator) {
        var cap = def.accumulator.capacity || 1;
        frame = F.util.clamp(Math.round(((e.charge || 0) / cap) * 4), 0, 4);
      } else if (def.spawner) {
        frame = animFrame(5);
      } else if (RH.entityOpts[def.behaviour]) {
        // F.render.entityOpts registry (design/EXPANSION.md §6.5): per-behaviour frame/opts for
        // new machines not covered by the built-in chain above. Default (no registration): frame 0,
        // opts {} (i.e. the `var frame = 0, opts = null;` above, equivalent for F.sprites.entity).
        try {
          var custom = RH.entityOpts[def.behaviour](e, def, F.state.tick || 0);
          frame = (custom && custom.frame) || 0;
          opts = (custom && custom.opts) || {};
        } catch (err) { F.log.error('[render] entityOpts("' + def.behaviour + '")', err); }
      }
      var spr = (F.sprites && F.sprites.entity) ? F.sprites.entity(e.type, e.dir, frame, opts) : null;
      drawEntitySpriteRect(e, spr);
    }
  }

  // =====================================================================
  // Inserter arms (GDD §11.6: 2-segment arm, held item icon at the hand).
  // =====================================================================
  function drawInserterArms(list) {
    if (!F.inserters || !F.inserters.armPos) return;
    for (var i = 0; i < list.length; i++) {
      var e = list[i], def = F.data.entities[e.type];
      if (!def || def.behaviour !== 'inserter') continue;
      var hand;
      try { hand = F.inserters.armPos(e); } catch (err) { continue; }
      if (!hand) continue;
      var c = entityCenter(e);
      var base = toScreen(c[0], c[1]);
      var tip = toScreen(hand[0], hand[1]);
      var dx = tip[0] - base[0], dy = tip[1] - base[1];
      var len = Math.hypot(dx, dy) || 1;
      var perp = [-dy / len, dx / len];
      var bend = 6 * camera.zoom;
      var mx = (base[0] + tip[0]) / 2 + perp[0] * bend;
      var my = (base[1] + tip[1]) / 2 + perp[1] * bend;

      // Arm colour = the inserter's own item icon colour (burner grey, inserter yellow,
      // long-handed red, fast blue) so each tier reads distinctly even mid-swing.
      var armColor = '#caa15a';
      try {
        var idef = F.data.itemDef(def.minable);
        if (idef && idef.icon && idef.icon.color) armColor = idef.icon.color;
      } catch (errIcon) { /* keep default */ }

      // Two shaded segments (dark outline pass, then a slightly thinner coloured fill pass)
      // plus joint discs at the base pivot, elbow and wrist so the arm reads as a mechanical
      // two-bar linkage rather than a bare line.
      var armW = Math.max(1.5, 4 * camera.zoom);
      ctx.save();
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = '#161208';
      ctx.lineWidth = armW + Math.max(1, 1.6 * camera.zoom);
      ctx.beginPath(); ctx.moveTo(base[0], base[1]); ctx.lineTo(mx, my); ctx.lineTo(tip[0], tip[1]); ctx.stroke();
      ctx.strokeStyle = armColor;
      ctx.lineWidth = armW;
      ctx.beginPath(); ctx.moveTo(base[0], base[1]); ctx.lineTo(mx, my); ctx.lineTo(tip[0], tip[1]); ctx.stroke();
      ctx.restore();

      var jr = Math.max(1.2, 2.8 * camera.zoom);
      ctx.save();
      ctx.fillStyle = '#3A3A3A'; ctx.strokeStyle = '#141414'; ctx.lineWidth = Math.max(1, camera.zoom);
      ctx.beginPath(); ctx.arc(base[0], base[1], jr * 1.15, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(mx, my, jr, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(tip[0], tip[1], jr * 0.85, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.restore();

      var held = F.inserters.holding ? F.inserters.holding(e) : null;
      var handDir = [(tip[0] - mx) / len, (tip[1] - my) / len];
      var handPerp = [-handDir[1], handDir[0]];
      var hs = 3.2 * camera.zoom;
      ctx.save();
      ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = Math.max(1, 2 * camera.zoom); ctx.lineCap = 'round';
      if (held) {
        // closed grip: a short bracket clamped around the carried item icon.
        ctx.beginPath();
        ctx.moveTo(tip[0] - handPerp[0] * hs + handDir[0] * hs, tip[1] - handPerp[1] * hs + handDir[1] * hs);
        ctx.lineTo(tip[0] - handPerp[0] * hs, tip[1] - handPerp[1] * hs);
        ctx.lineTo(tip[0] + handPerp[0] * hs, tip[1] + handPerp[1] * hs);
        ctx.lineTo(tip[0] + handPerp[0] * hs + handDir[0] * hs, tip[1] + handPerp[1] * hs + handDir[1] * hs);
        ctx.stroke();
        drawItemIcon(held, tip[0], tip[1], F.C.TILE * camera.zoom * 0.4, true);
      } else {
        // open hand: two short prongs (GDD §11.6 "open: two short prongs when empty").
        ctx.beginPath();
        ctx.moveTo(tip[0] - handPerp[0] * hs, tip[1] - handPerp[1] * hs);
        ctx.lineTo(tip[0] - handPerp[0] * hs + handDir[0] * hs * 1.4, tip[1] - handPerp[1] * hs + handDir[1] * hs * 1.4);
        ctx.moveTo(tip[0] + handPerp[0] * hs, tip[1] + handPerp[1] * hs);
        ctx.lineTo(tip[0] + handPerp[0] * hs + handDir[0] * hs * 1.4, tip[1] + handPerp[1] * hs + handDir[1] * hs * 1.4);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // =====================================================================
  // Turret heads (barrel toward target angle; base sprite already drawn).
  // =====================================================================
  function drawTurretHeads(list) {
    for (var i = 0; i < list.length; i++) {
      var e = list[i], def = F.data.entities[e.type];
      if (!def || def.behaviour !== 'turret') continue;
      var c = entityCenter(e);
      var p = toScreen(c[0], c[1]);
      var dv = F.C.DIRS[e.dir & 3];
      var angle = (typeof e.angle === 'number') ? e.angle : Math.atan2(dv[1], dv[0]);
      var len = F.C.TILE * camera.zoom * 0.9;
      ctx.save();
      ctx.strokeStyle = '#2b2b2b';
      ctx.lineWidth = Math.max(2, 4 * camera.zoom);
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0] + Math.cos(angle) * len, p[1] + Math.sin(angle) * len); ctx.stroke();
      ctx.restore();
    }
  }

  // =====================================================================
  // Pole wires — sagging quadratic curves between wired poles (§11.4).
  // =====================================================================
  function drawWire(c1, c2) {
    var p1 = toScreen(c1[0], c1[1] - 0.35), p2 = toScreen(c2[0], c2[1] - 0.35);
    var mx = (p1[0] + p2[0]) / 2, my = (p1[1] + p2[1]) / 2 + 6 * camera.zoom;
    ctx.save();
    ctx.strokeStyle = 'rgba(35,32,28,0.85)';
    ctx.lineWidth = Math.max(1, camera.zoom);
    ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.quadraticCurveTo(mx, my, p2[0], p2[1]); ctx.stroke();
    ctx.restore();
  }

  function drawPoleWires(list) {
    for (var i = 0; i < list.length; i++) {
      var e = list[i], def = F.data.entities[e.type];
      if (!def || def.layer !== 'pole') continue;
      if (!Array.isArray(e.wires)) continue;
      var c1 = entityCenter(e);
      for (var j = 0; j < e.wires.length; j++) {
        var otherId = e.wires[j];
        if (otherId <= e.id) continue; // draw each wire once
        var other = F.entities.byId ? F.entities.byId(otherId) : null;
        if (!other) continue;
        drawWire(c1, entityCenter(other));
      }
    }
  }

  // =====================================================================
  // Units, corpses, tracers, health bars.
  // =====================================================================
  function drawHealthBarAt(p, size, health, maxHealth) {
    if (!(maxHealth > 0) || health == null || health >= maxHealth) return;
    var w = 24 * camera.zoom, h = 3 * camera.zoom;
    var frac = F.util.clamp(health / maxHealth, 0, 1);
    var color = frac > 0.66 ? '#5eb663' : frac > 0.33 ? '#e8c34a' : '#ff3f3f';
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(p[0] - w / 2, p[1] - size * 0.6 - h, w, h);
    ctx.fillStyle = color; ctx.fillRect(p[0] - w / 2, p[1] - size * 0.6 - h, w * frac, h);
  }

  var UNIT_COLOR = { 'small-biter': '#8B2E2E', 'medium-biter': '#A33C2A', 'big-biter': '#6E2A6E' };
  function unitMaxHealth(u) {
    if (u.maxHealth) return u.maxHealth;
    if (F.combat && F.combat.unitDef) { try { var d = F.combat.unitDef(u.type); return d && d.health; } catch (err) { return null; } }
    return null;
  }

  function drawUnits(rect) {
    var units = F.state && F.state.units; if (!units) return;
    var size = F.C.TILE * camera.zoom;
    for (var i = 0; i < units.length; i++) {
      var u = units[i];
      if (u.x < rect.x0 - 2 || u.x > rect.x1 + 2 || u.y < rect.y0 - 2 || u.y > rect.y1 + 2) continue;
      var p = toScreen(u.x, u.y);
      var spr = (F.sprites && F.sprites.unit) ? F.sprites.unit(u.type, F.state.tick || 0) : null;
      if (spr) {
        ctx.drawImage(spr, p[0] - size / 2, p[1] - size / 2, size, size);
      } else {
        ctx.fillStyle = UNIT_COLOR[u.type] || '#8B2E2E';
        ctx.beginPath(); ctx.arc(p[0], p[1], size * 0.28, 0, Math.PI * 2); ctx.fill();
      }
      drawHealthBarAt(p, size, u.health, unitMaxHealth(u));
    }
  }

  // No documented state shape for enemy corpses; this defensively reads either
  // F.state.corpses or F.combat.corpses if a later module exposes one (see report
  // "assumptions" — degrades to a silent no-op otherwise).
  function drawCorpses(rect) {
    var arr = (F.state && F.state.corpses) || (F.combat && F.combat.corpses);
    if (!Array.isArray(arr) || !arr.length) return;
    var size = F.C.TILE * camera.zoom;
    for (var i = 0; i < arr.length; i++) {
      var c = arr[i]; if (!c || c.x == null || c.y == null) continue;
      if (c.x < rect.x0 - 1 || c.x > rect.x1 + 1 || c.y < rect.y0 - 1 || c.y > rect.y1 + 1) continue;
      var p = toScreen(c.x, c.y);
      ctx.save(); ctx.globalAlpha = 0.85; ctx.fillStyle = '#3a3a3a';
      ctx.beginPath(); ctx.ellipse(p[0], p[1], size * 0.36, size * 0.18, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  // Tracer shape is not part of the documented API; reads a few plausible field
  // names defensively (see report "assumptions") and skips anything unrecognised.
  function drawTracers() {
    var arr = F.combat && F.combat.tracers;
    if (!Array.isArray(arr) || !arr.length) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,240,180,0.9)';
    ctx.lineWidth = Math.max(1, 2 * camera.zoom);
    for (var i = 0; i < arr.length; i++) {
      var t = arr[i]; if (!t) continue;
      var x0 = t.x0 != null ? t.x0 : (t.from && t.from.x);
      var y0 = t.y0 != null ? t.y0 : (t.from && t.from.y);
      var x1 = t.x1 != null ? t.x1 : (t.to && t.to.x);
      var y1 = t.y1 != null ? t.y1 : (t.to && t.to.y);
      if (x0 == null || y0 == null || x1 == null || y1 == null) continue;
      var p0 = toScreen(x0, y0), p1 = toScreen(x1, y1);
      ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke();
    }
    ctx.restore();
  }

  // =====================================================================
  // Player sprite.
  // =====================================================================
  function drawPlayer(dtMs) {
    var p = F.state && F.state.player; if (!p) return;
    var moving = false;
    if (playerPrev) { var dx = p.x - playerPrev.x, dy = p.y - playerPrev.y; moving = (dx * dx + dy * dy) > 1e-8; }
    playerAnimT = moving ? playerAnimT + dtMs : 0;
    playerPrev = { x: p.x, y: p.y };
    // F.render.hidePlayerWhen (design/EXPANSION.md §6.5, e.g. hidden while riding a train). Bail
    // out after the animation/position bookkeeping above so a later un-hide resumes smoothly.
    if (playerHidden()) return;
    var scr = toScreen(p.x, p.y);
    var size = F.C.TILE * camera.zoom * 1.4;
    var frame = Math.floor(playerAnimT / 100) % 8;
    var spr = (F.sprites && F.sprites.player) ? F.sprites.player(p.dir || 0, frame) : null;
    if (spr) {
      ctx.drawImage(spr, scr[0] - size / 2, scr[1] - size, size, size);
    } else {
      ctx.fillStyle = '#DE8021';
      ctx.fillRect(scr[0] - size * 0.22, scr[1] - size, size * 0.44, size);
    }
  }

  // =====================================================================
  // Placement preview (GDD §9.11): tint + range/supply/area overlays.
  // =====================================================================
  function drawSquareOutline(cx, cy, sizeTiles, color) {
    var half = sizeTiles / 2;
    var p0 = toScreen(cx - half, cy - half), p1 = toScreen(cx + half, cy + half);
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 2;
    ctx.strokeRect(p0[0], p0[1], p1[0] - p0[0], p1[1] - p0[1]);
    ctx.restore();
  }
  function drawCircleOutline(cx, cy, radiusTiles, color) {
    var p = toScreen(cx, cy), r = radiusTiles * F.C.TILE * camera.zoom;
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  function drawPlacementPreview() {
    var pv = F.input && F.input.preview; if (!pv || !pv.type) return;
    // Virtual placers (vehicles, EXPANSION §6.4/§6.6): the placer may draw its own ghost via
    // previewDraw(ctx, tx, ty, dir, ok, camera); otherwise a 1x1 green/red tile outline.
    if (pv.virtual) {
      var vp = F.api && F.api.getVirtual ? F.api.getVirtual(pv.type) : null;
      ctx.save();
      if (vp && typeof vp.previewDraw === 'function') {
        try { vp.previewDraw(ctx, pv.tx, pv.ty, pv.dir || 0, !!pv.ok, camera); } catch (err) { F.log.warn('[render] previewDraw', err); }
      } else {
        var vs = F.C.TILE * camera.zoom, vq = toScreen(pv.tx, pv.ty);
        ctx.fillStyle = pv.ok ? 'rgba(60,220,90,0.35)' : 'rgba(230,60,60,0.4)';
        ctx.fillRect(vq[0], vq[1], vs, vs);
        ctx.strokeStyle = pv.ok ? 'rgba(90,240,120,0.9)' : 'rgba(255,90,90,0.9)';
        ctx.lineWidth = 2; ctx.strokeRect(vq[0] + 1, vq[1] + 1, vs - 2, vs - 2);
      }
      ctx.restore();
      return;
    }
    var def = F.data.entities[pv.type]; if (!def) return;
    var fp = (F.entities && F.entities.footprint) ? F.entities.footprint(def, pv.dir || 0) : (def.size || [1, 1]);
    var w = fp[0], h = fp[1];
    var p0 = toScreen(pv.tx, pv.ty);
    var size = F.C.TILE * camera.zoom;
    var spr = (F.sprites && F.sprites.entity) ? F.sprites.entity(pv.type, pv.dir || 0, 0) : null;
    var tint = pv.ok ? 'rgba(60,220,90,0.45)' : 'rgba(230,60,60,0.5)';
    ctx.save();
    ctx.globalAlpha = 0.65;
    if (spr) {
      ctx.drawImage(spr, p0[0], p0[1], w * size, h * size);
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = tint;
      ctx.fillRect(p0[0], p0[1], w * size, h * size);
      ctx.globalCompositeOperation = 'source-over';
    } else {
      ctx.fillStyle = tint;
      ctx.fillRect(p0[0], p0[1], w * size, h * size);
    }
    ctx.restore();

    var cx = pv.tx + w / 2, cy = pv.ty + h / 2;
    if (def.pole) drawSquareOutline(cx, cy, def.pole.supply * 2, 'rgba(255,200,80,0.55)');
    if (def.turret) drawCircleOutline(cx, cy, def.turret.range, 'rgba(255,80,80,0.4)');
    if (def.drill) drawSquareOutline(cx, cy, def.drill.area, 'rgba(255,220,120,0.4)');
  }

  // =====================================================================
  // Mining progress ring (GDD §11.6) + selection box (GDD §9.1 hover).
  // =====================================================================
  function drawMiningRing() {
    var m = F.input && F.input.mining; if (!m) return;
    var p = toScreen(m.tx + 0.5, m.ty + 0.5);
    var r = F.C.TILE * camera.zoom * 0.45;
    var frac = F.util.clamp(m.progress || 0, 0, 1);
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#FAA838'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(p[0], p[1], r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac); ctx.stroke();
    ctx.restore();
  }

  function cornerBracket(x, y, len, sx, sy) {
    ctx.beginPath();
    ctx.moveTo(x, y + len * sy);
    ctx.lineTo(x, y);
    ctx.lineTo(x + len * sx, y);
    ctx.stroke();
  }

  function drawSelectionBox() {
    var h = F.input && F.input.hover; if (!h) return;
    var e = (h.entity) ? h.entity : (h.w != null && h.x != null ? h : null);
    if (!e) return;
    var p0 = toScreen(e.x, e.y);
    var size = F.C.TILE * camera.zoom;
    var w = e.w * size, hh = e.h * size;
    var cl = Math.min(10, w * 0.3, hh * 0.3);
    ctx.save();
    ctx.strokeStyle = '#fff5c0'; ctx.lineWidth = 2;
    cornerBracket(p0[0], p0[1], cl, 1, 1);
    cornerBracket(p0[0] + w, p0[1], cl, -1, 1);
    cornerBracket(p0[0], p0[1] + hh, cl, 1, -1);
    cornerBracket(p0[0] + w, p0[1] + hh, cl, -1, -1);
    ctx.restore();
  }

  // =====================================================================
  // Alt-mode overlay (GDD §9.9).
  // =====================================================================
  function recipeResultIcon(recipeId) {
    var r = F.data.recipes[recipeId];
    return (r && r.results && r.results[0]) ? r.results[0][0] : recipeId;
  }

  function drawBar(x, y, w, h, frac) {
    frac = F.util.clamp(frac, 0, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#FAA838'; ctx.fillRect(x, y, w * frac, h);
  }

  function ammoCountOf(e) {
    if (!e.ammo) return null;
    var n = 0;
    for (var i = 0; i < e.ammo.length; i++) { var s = e.ammo[i]; if (s) n += s.count; }
    return n;
  }

  function drawArrowToFront(e) {
    if (!F.entities || !F.entities.front) return;
    var front = F.entities.front(e, 1);
    var c = entityCenter(e);
    var p0 = toScreen(c[0], c[1]), p1 = toScreen(front[0] + 0.5, front[1] + 0.5);
    ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke();
    ctx.restore();
  }

  function drawAltOverlay(list) {
    for (var i = 0; i < list.length; i++) {
      var e = list[i], def = F.data.entities[e.type]; if (!def) continue;
      var c = entityCenter(e);
      var p = toScreen(c[0], c[1]);
      var size = F.C.TILE * camera.zoom;
      if ((def.behaviour === 'assembler' || def.behaviour === 'furnace') && e.recipe) {
        drawItemIcon(recipeResultIcon(e.recipe), p[0], p[1] - size * 0.7, size * 0.5);
      }
      if (def.behaviour === 'chest' && Array.isArray(e.inv)) {
        var shown = 0;
        for (var s = 0; s < e.inv.length && shown < 4; s++) {
          var slot = e.inv[s]; if (!slot) continue;
          drawItemIcon(slot.id, p[0] + (shown - 1.5) * size * 0.3, p[1] - size * 0.7, size * 0.26);
          shown++;
        }
      }
      if (def.behaviour === 'turret') {
        var n = ammoCountOf(e);
        if (n != null) drawBar(p[0] - size * 0.4, p[1] - size * 0.8, size * 0.8, size * 0.12, n / (def.turret.ammoLimit || 10));
      }
      if (def.behaviour === 'inserter' || def.drill) drawArrowToFront(e);
      // F.render.altOverlay (design/EXPANSION.md §6.5): per-entity alt-mode extras for behaviours
      // not handled by the built-in cases above (e.g. recipe icon on a chemical plant). sx/sy are
      // the entity's top-left screen position (matching drawEntitySpriteRect's convention).
      if (RH.altOverlayFns.length) {
        var p0 = toScreen(e.x, e.y);
        for (var af = 0; af < RH.altOverlayFns.length; af++) {
          try { RH.altOverlayFns[af](ctx, e, def, p0[0], p0[1], size); }
          catch (err) { F.log.error('[render] altOverlay hook', err); }
        }
      }
    }
  }

  // =====================================================================
  // Status lights / warning icons (GDD §11.6 — always shown, alt or not).
  // =====================================================================
  function statusColor(st) {
    if (st === 'no_power' || st === 'no_fuel' || st === 'not_connected' || st === 'no_ammo' ||
        st === 'no_minable_resources' || st === 'no_recipe' || st === 'no_ingredients' || st === 'no_water' || st === 'no_steam' || st === 'no_pair' || st === 'missing_science_packs' || st === 'no_research') return '#ff3f3f';
    return '#ffcf3f';
  }

  function drawWarningGlyph(x, y, st) {
    var r = 6 * Math.max(0.6, camera.zoom);
    ctx.save();
    ctx.fillStyle = statusColor(st);
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#1b1b1b';
    if (st === 'no_power' || st === 'low_power') {
      ctx.beginPath();
      ctx.moveTo(x - 1, y - r * 0.6); ctx.lineTo(x + 1.5, y - 0.3); ctx.lineTo(x - 0.3, y - 0.3);
      ctx.lineTo(x + 1, y + r * 0.6); ctx.lineTo(x - 1.5, y + 0.3); ctx.lineTo(x + 0.3, y + 0.3);
      ctx.closePath(); ctx.fill();
    } else if (st === 'no_fuel') {
      ctx.beginPath(); ctx.moveTo(x, y - r * 0.6); ctx.lineTo(x + r * 0.5, y + r * 0.5); ctx.lineTo(x - r * 0.5, y + r * 0.5); ctx.closePath(); ctx.fill();
    } else if (st === 'not_connected') {
      ctx.beginPath(); ctx.moveTo(x, y - r * 0.55); ctx.lineTo(x + r * 0.55, y + r * 0.4); ctx.lineTo(x - r * 0.55, y + r * 0.4); ctx.closePath(); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(x, y, r * 0.4, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }

  var STATUS_SKIP = { chest: 1, wall: 1, pole: 1, corpse: 1, static: 1 };
  function drawStatusIcons(list) {
    for (var i = 0; i < list.length; i++) {
      var e = list[i], def = F.data.entities[e.type];
      if (!def || !def.behaviour || STATUS_SKIP[def.behaviour]) continue;
      var st = entityStatus(e);
      if (!st || st === 'idle' || st === 'working') continue;
      var p = toScreen(e.x + e.w, e.y);
      drawWarningGlyph(p[0], p[1], st);
    }
  }

  // =====================================================================
  // Damage flashes + health bars (listens to F.events; load-time listener
  // registration only, no DOM/canvas touched until frame() actually runs).
  // =====================================================================
  F.events.on('entity:damaged', function (payload) {
    var e = payload && payload.entity; if (!e) return;
    damageFlash.set(e.id, (F.state && F.state.tick) || 0);
  });
  F.events.on('entity:destroyed', function (e) {
    if (!e) return;
    var c = entityCenter(e);
    destroyFlash.push({ x: c[0], y: c[1], tick: (F.state && F.state.tick) || 0 });
  });

  function drawDamageFlashes(list) {
    var tick = (F.state && F.state.tick) || 0;
    for (var i = 0; i < list.length; i++) {
      var e = list[i], def = F.data.entities[e.type];
      var maxH = def && def.health;
      if (maxH && e.health != null && e.health < maxH) {
        var c = entityCenter(e);
        drawHealthBarAt(toScreen(c[0], c[1] - e.h / 2), F.C.TILE * camera.zoom, e.health, maxH);
      }
      var last = damageFlash.get(e.id);
      if (last != null && tick - last < 8) {
        var p0 = toScreen(e.x, e.y), size = F.C.TILE * camera.zoom;
        ctx.save();
        ctx.globalAlpha = 0.35 * (1 - (tick - last) / 8);
        ctx.fillStyle = '#ff3030';
        ctx.fillRect(p0[0], p0[1], e.w * size, e.h * size);
        ctx.restore();
      }
    }
    if ((frameCount % 120) === 0) {
      var stale = [];
      damageFlash.forEach(function (t, id) { if (tick - t > 600) stale.push(id); });
      for (var s = 0; s < stale.length; s++) damageFlash.delete(stale[s]);
    }
    for (var j = destroyFlash.length - 1; j >= 0; j--) {
      var d = destroyFlash[j];
      if (tick - d.tick > 20) { destroyFlash.splice(j, 1); continue; }
      var pp = toScreen(d.x, d.y);
      ctx.save();
      ctx.globalAlpha = 0.5 * (1 - (tick - d.tick) / 20);
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(pp[0], pp[1], 10 * camera.zoom * (1 + (tick - d.tick) / 20), 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  // =====================================================================
  // Night overlay (GDD §11.9, cosmetic; solar daylight drives darkness).
  // =====================================================================
  function getNightScratch() {
    var w = Math.max(1, Math.round(viewW)), h = Math.max(1, Math.round(viewH));
    if (!nightScratch || nightScratch.canvas.width !== w || nightScratch.canvas.height !== h) {
      var c = document.createElement('canvas'); c.width = w; c.height = h;
      nightScratch = { canvas: c, ctx: c.getContext('2d') };
    }
    return nightScratch;
  }

  function cutHole(octx, x, y, r) {
    var grad = octx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(0,0,0,1)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    octx.fillStyle = grad;
    octx.beginPath(); octx.arc(x, y, r, 0, Math.PI * 2); octx.fill();
  }

  function drawNightOverlay() {
    var daylight = 1;
    if (F.power && typeof F.power.daylight === 'function') {
      try { daylight = F.power.daylight(); } catch (err) { daylight = 1; }
    }
    var darkness = F.util.clamp(1 - daylight, 0, 1) * 0.42;
    if (darkness < 0.01) return;
    var off = getNightScratch(), octx = off.ctx;
    octx.clearRect(0, 0, viewW, viewH);
    octx.fillStyle = 'rgba(10,15,40,' + darkness.toFixed(3) + ')';
    octx.fillRect(0, 0, viewW, viewH);
    octx.globalCompositeOperation = 'destination-out';
    var p = F.state && F.state.player;
    if (p) { var ps = toScreen(p.x, p.y); cutHole(octx, ps[0], ps[1], 6 * F.C.TILE * camera.zoom); }
    if (F.entities && F.entities.ofType) {
      var lamps = F.entities.ofType('small-lamp') || [];
      for (var i = 0; i < lamps.length; i++) {
        var e = lamps[i];
        if (entityStatus(e) !== 'working') continue;
        var c = entityCenter(e), ps2 = toScreen(c[0], c[1]);
        cutHole(octx, ps2[0], ps2[1], 10 * F.C.TILE * camera.zoom);
      }
      // Working furnaces/boilers glow at night too (GDD §11.9 "furnace/boiler mouths radius 2").
      var glowTypes = ['stone-furnace', 'steel-furnace', 'boiler'];
      for (var gt = 0; gt < glowTypes.length; gt++) {
        var list = F.entities.ofType(glowTypes[gt]) || [];
        for (var j = 0; j < list.length; j++) {
          var ge = list[j];
          if (entityStatus(ge) !== 'working') continue;
          var gc = entityCenter(ge), gp = toScreen(gc[0], gc[1]);
          cutHole(octx, gp[0], gp[1], 2 * F.C.TILE * camera.zoom);
        }
      }
    }
    octx.globalCompositeOperation = 'source-over';
    ctx.drawImage(off.canvas, 0, 0);
  }

  // =====================================================================
  // Main frame (GDD §11.2 pipeline order). Never mutates F.state.
  // =====================================================================
  function frameInner(dtMs) {
    checkWorldReset();
    frameCount++;
    updateCamera(dtMs);
    camera.zoom = F.util.clamp(camera.zoom || 1, 0.25, 3);

    if (canvasEl && (canvasEl.clientWidth !== viewW || canvasEl.clientHeight !== viewH)) resize();

    ctx.save();
    ctx.clearRect(0, 0, viewW, viewH);
    ctx.fillStyle = '#0a1420';
    ctx.fillRect(0, 0, viewW, viewH);

    var rect = visibleTileRect();
    drawTerrain(rect);
    drawGroundItems(rect);
    drawBelts(rect);

    // F.render.addLayer('floor', ...) (design/EXPANSION.md §6.5): after belts, before entities.
    runLayer('floor', rect);
    var collected = collectVisibleEntities(rect);
    // Entities with def.layer === 'floor' (rails): drawn after belts, before other entities.
    drawEntities(collected.floor);
    var vis = collected.rest;
    drawEntities(vis);
    // Floor-layer entities (rails/train-stops) also participate in the generic passes below
    // (inserter arms/turret heads/pole wires are all no-ops for them; status/alt/damage flash
    // support "just works" for any new floor-layer entity without extra wiring).
    var allVis = collected.floor.concat(vis);
    drawInserterArms(allVis);
    drawTurretHeads(allVis);
    drawPoleWires(allVis);
    drawUnits(rect);
    drawCorpses(rect);
    drawTracers();
    // F.render.addLayer('objects', ...): after entities & inserter arms, before player.
    runLayer('objects', rect);
    drawPlayer(dtMs);
    // F.render.addLayer('air', ...): after player, before previews.
    runLayer('air', rect);
    drawPlacementPreview();
    drawMiningRing();
    drawSelectionBox();
    if (F.render.altMode) drawAltOverlay(allVis);
    drawStatusIcons(allVis);
    drawDamageFlashes(allVis);
    // F.render.addLayer('overlay', ...): after status icons, before night.
    runLayer('overlay', rect);
    drawNightOverlay();

    ctx.restore();
    gcChunks(dtMs);
  }

  function frame(dtMs) {
    if (window.HEADLESS || !ready || !ctx) return; // headless / not initialised: no-op
    dtMs = (typeof dtMs === 'number' && dtMs > 0) ? Math.min(dtMs, 250) : 16.7;
    try { frameInner(dtMs); }
    catch (err) { F.log.error('F.render.frame', err); try { ctx.restore(); } catch (e2) { /* ignore */ } }
  }

  // =====================================================================
  // Minimap (GDD §9.8/§11.8) and full map image.
  // =====================================================================
  var MINIMAP_ENTITY_COLOR_BELT = '#CCA147', MINIMAP_ENTITY_COLOR_WALL = '#CCD9CC',
      MINIMAP_ENTITY_COLOR_TURRET = '#CAA718', MINIMAP_ENTITY_COLOR_POLE = '#009EA3',
      MINIMAP_ENTITY_COLOR_DEFAULT = '#006191';

  function minimapEntityColor(def) {
    // F.render.minimapColor (design/EXPANSION.md §6.5): checked first so new behaviours/layers
    // (rails, trains, robots, rocket-silo, ...) get their own dot colour instead of the generic
    // default; existing built-ins below are unaffected unless a feature explicitly overrides them.
    var custom = RH.minimapColors[def.behaviour];
    if (custom == null) custom = RH.minimapColors[def.layer];
    if (custom != null) return custom;
    if (def.layer === 'belt') return MINIMAP_ENTITY_COLOR_BELT;
    if (def.layer === 'wall') return MINIMAP_ENTITY_COLOR_WALL;
    if (def.behaviour === 'turret') return MINIMAP_ENTITY_COLOR_TURRET;
    if (def.layer === 'pole') return MINIMAP_ENTITY_COLOR_POLE;
    return MINIMAP_ENTITY_COLOR_DEFAULT;
  }

  // '#rrggbb' -> [r, g, b] (colour tables are parsed once and cached).
  function hexRgb(hex) {
    var n = parseInt(String(hex).slice(1, 7), 16) || 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  var mapRgb = null;
  function mapColors() {
    if (mapRgb) return mapRgb;
    var tc = (F.world && F.world.TERRAIN_COLOR) || [], rc = (F.world && F.world.RES_COLOR) || [];
    mapRgb = { terrain: [], res: [], fallback: hexRgb('#274233'), empty: hexRgb('#111111') };
    for (var i = 0; i < 256; i++) {
      mapRgb.terrain.push(tc[i] ? hexRgb(tc[i]) : mapRgb.fallback);
      mapRgb.res.push(rc[i] ? hexRgb(rc[i]) : null);
    }
    return mapRgb;
  }

  function drawPollutionOnMap(mctx, chunk, tx0, ty0, pxPerTile) {
    if (chunk.pollution > 15) {
      var mx0 = (chunk.cx * F.C.CHUNK - tx0) * pxPerTile, my0 = (chunk.cy * F.C.CHUNK - ty0) * pxPerTile;
      var s0 = F.C.CHUNK * pxPerTile;
      mctx.save();
      mctx.globalAlpha = F.util.clamp(chunk.pollution / 500, 0, 0.5);
      mctx.fillStyle = '#a02020'; mctx.fillRect(mx0, my0, s0, s0);
      mctx.restore();
    }
  }

  function mapWindow(sizePx, chunkRadius) {
    var p = F.state && F.state.player;
    var centerTx = p ? p.x : 0, centerTy = p ? p.y : 0;
    var tilesSpan = chunkRadius * 2 * F.C.CHUNK;
    var pxPerTile = sizePx / tilesSpan;
    var tx0 = Math.floor(centerTx - tilesSpan / 2), ty0 = Math.floor(centerTy - tilesSpan / 2);
    return { centerTx: centerTx, centerTy: centerTy, tilesSpan: tilesSpan, pxPerTile: pxPerTile, tx0: tx0, ty0: ty0 };
  }

  function buildMapImage(canvasTarget, sizePx, chunkRadius) {
    var mctx = canvasTarget.getContext('2d');
    var w = mapWindow(sizePx, chunkRadius);
    // Terrain/ore: one pixel write per map pixel into an ImageData (sampling the tile under
    // the pixel centre) instead of one fillRect per tile block — the latter was ~40k canvas
    // calls per minimap refresh, a visible hitch every 30 frames.
    var CH = F.C.CHUNK, col = mapColors();
    var img = mctx.createImageData(sizePx, sizePx), d = img.data;
    var inv = 1 / w.pxPerTile;
    for (var py = 0, o = 0; py < sizePx; py++) {
      var ty = Math.floor(w.ty0 + (py + 0.5) * inv);
      var cy = F.util.floorDiv(ty, CH), rowBase = (ty - cy * CH) * CH;
      var lastCx = NaN, chunk = null, cx0 = 0;
      for (var px = 0; px < sizePx; px++, o += 4) {
        var tx = Math.floor(w.tx0 + (px + 0.5) * inv);
        var cxx = F.util.floorDiv(tx, CH);
        if (cxx !== lastCx) {
          lastCx = cxx; cx0 = cxx * CH;
          chunk = (F.world && F.world.chunkAt) ? F.world.chunkAt(tx, ty) : null;
        }
        var rgb;
        if (!chunk) rgb = col.empty;
        else {
          var i = rowBase + (tx - cx0);
          rgb = (chunk.res[i] && col.res[chunk.res[i]]) || col.terrain[chunk.terrain[i]];
        }
        d[o] = rgb[0]; d[o + 1] = rgb[1]; d[o + 2] = rgb[2]; d[o + 3] = 255;
      }
    }
    mctx.putImageData(img, 0, 0);
    var cx0c = F.util.floorDiv(w.tx0, CH), cx1c = F.util.floorDiv(w.tx0 + w.tilesSpan, CH);
    var cy0c = F.util.floorDiv(w.ty0, CH), cy1c = F.util.floorDiv(w.ty0 + w.tilesSpan, CH);
    for (var ccy = cy0c; ccy <= cy1c; ccy++) {
      for (var ccx = cx0c; ccx <= cx1c; ccx++) {
        var pc = (F.world && F.world.chunkAt) ? F.world.chunkAt(ccx * CH, ccy * CH) : null;
        if (pc) drawPollutionOnMap(mctx, pc, w.tx0, w.ty0, w.pxPerTile);
      }
    }
    var ents = F.state && F.state.entities;
    if (ents) {
      for (var i = 0; i < ents.length; i++) {
        var e = ents[i]; if (e._removed) continue;
        var def = F.data.entities[e.type]; if (!def) continue;
        var mx = (e.x + e.w / 2 - w.tx0) * w.pxPerTile, my = (e.y + e.h / 2 - w.ty0) * w.pxPerTile;
        if (mx < 0 || mx > sizePx || my < 0 || my > sizePx) continue;
        mctx.fillStyle = minimapEntityColor(def);
        mctx.fillRect(mx - 1, my - 1, 2, 2);
      }
    }
  }

  function drawLiveOverlay(canvasTarget, sizePx, chunkRadius) {
    var mctx = canvasTarget.getContext('2d');
    var w = mapWindow(sizePx, chunkRadius);
    var units = F.state && F.state.units;
    if (units && units.length) {
      mctx.fillStyle = '#FF1A1A';
      for (var i = 0; i < units.length; i++) {
        var u = units[i];
        var mx = (u.x - w.tx0) * w.pxPerTile, my = (u.y - w.ty0) * w.pxPerTile;
        if (mx < 0 || mx > sizePx || my < 0 || my > sizePx) continue;
        mctx.fillRect(mx - 1, my - 1, 2, 2);
      }
    }
    var p = F.state && F.state.player;
    if (p) {
      var mx2 = (p.x - w.tx0) * w.pxPerTile, my2 = (p.y - w.ty0) * w.pxPerTile;
      mctx.fillStyle = '#DE8021';
      mctx.beginPath(); mctx.arc(mx2, my2, 2.5, 0, Math.PI * 2); mctx.fill();
    }
  }

  var MINIMAP_CHUNK_RADIUS = 6;

  function minimap(sizePx) {
    if (window.HEADLESS) return null;
    sizePx = sizePx || 200;
    try {
      if (!minimapOut || minimapOut.width !== sizePx) {
        minimapOut = document.createElement('canvas');
        minimapOut.width = sizePx; minimapOut.height = sizePx;
      }
      if (!minimapBase || minimapBase.canvas.width !== sizePx || (frameCount - minimapBase.builtAtFrame) >= 30) {
        if (!minimapBase || minimapBase.canvas.width !== sizePx) {
          var bc = document.createElement('canvas'); bc.width = sizePx; bc.height = sizePx;
          minimapBase = { canvas: bc, builtAtFrame: -999 };
        }
        buildMapImage(minimapBase.canvas, sizePx, MINIMAP_CHUNK_RADIUS);
        minimapBase.builtAtFrame = frameCount;
      }
      var octx = minimapOut.getContext('2d');
      octx.clearRect(0, 0, sizePx, sizePx);
      octx.drawImage(minimapBase.canvas, 0, 0);
      drawLiveOverlay(minimapOut, sizePx, MINIMAP_CHUNK_RADIUS);
    } catch (err) { F.log.error('F.render.minimap', err); }
    return minimapOut;
  }

  function mapImage(chunkRadius) {
    if (window.HEADLESS) return null;
    chunkRadius = chunkRadius || 8;
    var sizePx = chunkRadius * 2 * F.C.CHUNK;
    var c = document.createElement('canvas');
    c.width = sizePx; c.height = sizePx;
    try {
      buildMapImage(c, sizePx, chunkRadius);
      drawLiveOverlay(c, sizePx, chunkRadius);
    } catch (err) { F.log.error('F.render.mapImage', err); }
    return c;
  }

  // =====================================================================
  // Public API (design/ARCHITECTURE.md §16, design/EXPANSION.md §6.5). Merges onto whatever
  // F.render already is (defensively — nothing else currently creates F.render before this module
  // runs, but a future early-loading file might start doing so the same way F._renderHooks does)
  // instead of clobbering it, and only defaults altMode if nothing set it already.
  // =====================================================================
  F.render = F.render || {};
  F.render.init = init;
  F.render.frame = frame;
  F.render.invalidateChunk = invalidateChunk;
  F.render.minimap = minimap;
  F.render.mapImage = mapImage;
  if (F.render.altMode === undefined) F.render.altMode = false; // toggled by 75-input.js on Alt (GDD §9.12)
  F.render.addLayer = addLayer;
  F.render.entityOpts = registerEntityOpts;
  F.render.minimapColor = registerMinimapColor;
  F.render.hidePlayerWhen = registerHidePlayerWhen;
  F.render.altOverlay = registerAltOverlay;
})();
