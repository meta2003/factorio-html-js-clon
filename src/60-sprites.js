// 60-sprites.js — procedural canvas sprites & item icons, cached on offscreen canvases.
// See design/ARCHITECTURE.md §16 and design/GDD.md §11 (rendering recipes), §4 (item icon colour
// hints), §2 (terrain palette). Pure drawing module: no simulation state is read or mutated here.
// Every public function is guarded by F.sprites.enabled (= !window.HEADLESS) and returns a tiny
// DOM-free stub object when headless, per ENGINEERING-CONSTRAINTS.md's headless contract. This
// module never calls ctx.fillText (numbers/labels are the UI layer's job per GDD §11.7), so it
// registers no F.i18n strings of its own.
(function () {
  'use strict';

  var TILE = F.C.TILE;          // 32 — px/tile at zoom 1 (00-core.js constant, safe to read at load time)
  var PX = TILE * 2;            // sprite canvases are baked at 2x for crisp scaling up to zoom ~2

  F.sprites = F.sprites || {};
  F.sprites.enabled = !(typeof window !== 'undefined' && window.HEADLESS);

  function stub(w, h) { return { width: w || 0, height: h || 0 }; }

  // ---------------------------------------------------------------------
  // Canvas + colour helpers
  // ---------------------------------------------------------------------
  function newCanvas(w, h) {
    w = Math.max(1, w | 0); h = Math.max(1, h | 0);
    if (typeof OffscreenCanvas !== 'undefined') {
      try { var oc = new OffscreenCanvas(w, h); if (oc && oc.getContext) return oc; } catch (e) { /* fall through to DOM canvas */ }
    }
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  function ctxOf(canvas) { var ctx = canvas.getContext('2d'); if (ctx) ctx.imageSmoothingEnabled = false; return ctx; }

  function hexToRgb(hex) {
    var h = String(hex || '#888888').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16) || 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgbToHex(r, g, b) {
    r = F.util.clamp(r | 0, 0, 255); g = F.util.clamp(g | 0, 0, 255); b = F.util.clamp(b | 0, 0, 255);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }
  function adjust(hex, amt) { var rgb = hexToRgb(hex); return rgbToHex(rgb[0] + amt, rgb[1] + amt, rgb[2] + amt); }
  function lighten(hex, amt) { return adjust(hex, Math.abs(amt)); }
  function darken(hex, amt) { return adjust(hex, -Math.abs(amt)); }
  // Blend two hex colours (t=0 -> a, t=1 -> b). Used for calm terrain gradients/blending.
  function mix(a, b, t) {
    var ra = hexToRgb(a), rb = hexToRgb(b);
    return rgbToHex(ra[0] + (rb[0] - ra[0]) * t, ra[1] + (rb[1] - ra[1]) * t, ra[2] + (rb[2] - ra[2]) * t);
  }
  // Reduce saturation + compress value range toward a calm mid-tone so raw data colours
  // (which may be picked for contrast/identifiability) read as soft natural ground instead
  // of a high-contrast checkerboard (task brief problem #1). Water keeps more of its hue.
  function softenTerrain(hex, isWater) {
    var rgb = hexToRgb(hex);
    var lum = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
    var deSat = isWater ? 0.10 : 0.30;
    var r = rgb[0] + (lum - rgb[0]) * deSat, g = rgb[1] + (lum - rgb[1]) * deSat, b = rgb[2] + (lum - rgb[2]) * deSat;
    var compress = isWater ? 0.04 : 0.12, mid = isWater ? 110 : 132;
    r += (mid - r) * compress; g += (mid - g) * compress; b += (mid - b) * compress;
    return rgbToHex(r, g, b);
  }

  // ---------------------------------------------------------------------
  // Shared drawing primitives — "rect with shading", bolts, gears, pipes, arrows, jittered polys.
  // Compact & reused by every entity/item painter below.
  // ---------------------------------------------------------------------
  function rectBevel(ctx, x, y, w, h, color, opts) {
    opts = opts || {};
    var edge = Math.max(1, Math.min(w, h) * 0.08);
    ctx.fillStyle = color; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = opts.light || lighten(color, 35);
    ctx.fillRect(x, y, w, edge); ctx.fillRect(x, y, edge, h);
    ctx.fillStyle = opts.dark || darken(color, 35);
    ctx.fillRect(x, y + h - edge, w, edge); ctx.fillRect(x + w - edge, y, edge, h);
    if (opts.outline !== false) {
      ctx.strokeStyle = opts.outlineColor || '#141414';
      ctx.lineWidth = opts.outlineWidth || 2;
      ctx.strokeRect(x + ctx.lineWidth / 2, y + ctx.lineWidth / 2, Math.max(0, w - ctx.lineWidth), Math.max(0, h - ctx.lineWidth));
    }
  }
  function seShadow(ctx, x, y, w, h) {
    ctx.save(); ctx.globalAlpha = 0.3; ctx.fillStyle = '#000000';
    ctx.fillRect(x + w * 0.07, y + h * 0.07, w, h);
    ctx.restore();
  }
  function seShadowEllipse(ctx, cx, cy, rx, ry) {
    ctx.save(); ctx.globalAlpha = 0.3; ctx.fillStyle = '#000000';
    ctx.beginPath(); ctx.ellipse(cx + rx * 0.15, cy + ry * 0.15, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  function bolts(ctx, pts, r, color) {
    ctx.fillStyle = color;
    for (var i = 0; i < pts.length; i++) { ctx.beginPath(); ctx.arc(pts[i][0], pts[i][1], r, 0, Math.PI * 2); ctx.fill(); }
  }
  // Gear: outer/inner teeth ring + centre hole; angle (radians) drives spin animation frames.
  function gearShape(ctx, cx, cy, rOuter, rHole, teeth, angle, color, holeColor) {
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(angle || 0);
    var rInner = rOuter * 0.76;
    ctx.fillStyle = color; ctx.beginPath();
    for (var i = 0; i < teeth * 2; i++) {
      var a = i / (teeth * 2) * Math.PI * 2, r = (i % 2 === 0) ? rOuter : rInner;
      var x = Math.cos(a) * r, y = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = darken(color, 40); ctx.lineWidth = Math.max(1, rOuter * 0.07); ctx.stroke();
    ctx.fillStyle = holeColor || '#2A2A2A';
    ctx.beginPath(); ctx.arc(0, 0, rHole, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  // Pipe/fluid stub from the tile centre toward one of the 4 edges (0=N,1=E,2=S,3=W).
  function pipeStub(ctx, cx, cy, dir, len, thick, color) {
    var v = F.util.dirVec(dir);
    ctx.strokeStyle = color; ctx.lineWidth = thick; ctx.lineCap = 'butt';
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + v[0] * len, cy + v[1] * len); ctx.stroke();
    ctx.fillStyle = darken(color, 30);
    ctx.beginPath(); ctx.arc(cx + v[0] * len, cy + v[1] * len, thick * 0.55, 0, Math.PI * 2); ctx.fill();
  }
  // Small triangular arrow pointing "up" (toward local dir 0 / north) — output/flow direction hints.
  function arrowShape(ctx, cx, cy, size, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx, cy - size); ctx.lineTo(cx + size * 0.8, cy + size * 0.6); ctx.lineTo(cx - size * 0.8, cy + size * 0.6);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = darken(color, 40); ctx.lineWidth = 1; ctx.stroke();
  }
  // Rising smoke puffs baked straight into the 16-frame working-animation loop (render.js
  // buckets `frame` 0..15; GDD §11.6 "puff every 20 ticks, fades over 90 ticks") so boilers/
  // drills/furnaces get animated smoke with zero per-frame (uncached) drawing.
  function smokePuffs(ctx, cx, cy, frame, scale) {
    scale = scale || 1;
    for (var i = 0; i < 3; i++) {
      var t = (((frame | 0) + i * 5) % 16) / 16; // 0..1 life, staggered per puff
      var alpha = 0.32 * (1 - t);
      if (alpha <= 0.02) continue;
      var r = scale * (2.6 + t * 6.5);
      var x = cx + Math.sin(i * 2.4 + t * 1.5) * scale * 3.2, y = cy - t * scale * 20;
      ctx.fillStyle = 'rgba(200,200,200,' + alpha.toFixed(2) + ')';
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
  }
  // A short chimney stack (shared silhouette for boiler/burner-drill/furnace) with an
  // optional smoke loop on top while `working`.
  function drawChimney(ctx, cx, topY, w, h, frame, working) {
    var x = cx - w / 2;
    rectBevel(ctx, x, topY, w, h, '#4A4038', { dark: '#241E18', light: '#5E5148' });
    if (working) smokePuffs(ctx, cx, topY - h * 0.1, frame, w * 0.55);
  }
  // Diagonal yellow/black hazard stripe band clipped to a rect — electric drill + turret trim.
  function hazardStripe(ctx, x, y, w, h, stripeW) {
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.fillStyle = '#1A1A1A'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#D9A520';
    var step = stripeW * 2, diag = w + h;
    for (var sx = -h; sx < diag; sx += step) {
      ctx.beginPath();
      ctx.moveTo(x + sx, y + h); ctx.lineTo(x + sx + h, y);
      ctx.lineTo(x + sx + h + stripeW, y); ctx.lineTo(x + sx + stripeW, y + h);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = '#141414'; ctx.lineWidth = 1; ctx.strokeRect(x, y, w, h);
  }
  // Jittered regular polygon, filled with the current fillStyle (rocks, spawner, ore chunks).
  function fillPoly(ctx, cx, cy, r, sides, rot, jitterFn) {
    ctx.beginPath();
    for (var i = 0; i <= sides; i++) {
      var a = rot + i / sides * Math.PI * 2;
      var rr = r * (jitterFn ? (0.78 + jitterFn() * 0.44) : 1);
      var x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath(); ctx.fill();
  }
  function entColors(def) {
    try { var it = F.data.itemDef(def.minable); return [it.icon.color, it.icon.color2 || darken(it.icon.color, 35)]; }
    catch (e) { return ['#888888', '#555555']; }
  }

  // ---------------------------------------------------------------------
  // Direction rotation wrapper. Every entity painter draws in "facing north" (dir 0) local
  // coordinates over a w0×h0 tile box; this wrapper allocates a canvas sized to the *rotated*
  // footprint (dimensions swap for dir 1/3, matching F.entities.footprint()) and rotates the
  // context so painters never special-case direction — 4-facing sprites fall out of one routine.
  // ---------------------------------------------------------------------
  function drawDirectional(w0Tiles, h0Tiles, dir, painter, softShadow) {
    dir = dir & 3;
    var rotated = (dir === 1 || dir === 3);
    var w0 = w0Tiles * PX, h0 = h0Tiles * PX;
    var W = rotated ? h0 : w0, H = rotated ? w0 : h0;
    var canvas = newCanvas(W, H);
    var ctx = ctxOf(canvas);
    if (!softShadow) {
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.rotate(dir * Math.PI / 2);
      ctx.translate(-w0 / 2, -h0 / 2);
      seShadow(ctx, 0, 0, w0, h0);
      painter(ctx, w0, h0);
      ctx.restore();
      return canvas;
    }
    // Buildings: paint on a scratch canvas, then lay a soft shadow cast from the painted
    // silhouette toward the south-east in WORLD space (so it doesn't rotate with the entity).
    var art = newCanvas(W, H), actx = ctxOf(art);
    actx.imageSmoothingEnabled = true;
    actx.save();
    actx.translate(W / 2, H / 2);
    actx.rotate(dir * Math.PI / 2);
    actx.translate(-w0 / 2, -h0 / 2);
    painter(actx, w0, h0);
    actx.restore();
    var sh = newCanvas(W, H), sctx = ctxOf(sh);
    sctx.drawImage(art, 0, 0);
    sctx.globalCompositeOperation = 'source-in';
    sctx.fillStyle = '#000000'; sctx.fillRect(0, 0, W, H);
    var off = PX * 0.13;
    var taps = [[1, 1, 0.16], [0.8, 0.8, 0.16], [0.6, 0.6, 0.16], [1.15, 0.9, 0.1], [0.9, 1.15, 0.1]];
    for (var i = 0; i < taps.length; i++) {
      ctx.globalAlpha = taps[i][2];
      ctx.drawImage(sh, off * taps[i][0], off * taps[i][1]);
    }
    ctx.globalAlpha = 1;
    ctx.drawImage(art, 0, 0);
    return canvas;
  }

  // ---------------------------------------------------------------------
  // Per-entity painters (drawn in local "north" coordinates, w0×h0 = footprint px at dir 0).
  // Signature: (ctx, W, H, frame, dir, def, type, opts)
  // ---------------------------------------------------------------------
  function paintChest(ctx, W, H, frame, dir, def, type) {
    var col = entColors(def), c1 = col[0], c2 = col[1];
    var x = W * 0.08, y = H * 0.08, w = W * 0.84, h = H * 0.84;
    rectBevel(ctx, x, y, w, h, c1, { dark: c2 });
    ctx.strokeStyle = darken(c1, 50); ctx.lineWidth = Math.max(1, W * 0.03);
    ctx.beginPath(); ctx.moveTo(x, y + h * 0.32); ctx.lineTo(x + w, y + h * 0.32); ctx.stroke();
    if (type === 'wooden-chest') {
      ctx.strokeStyle = darken(c1, 25); ctx.lineWidth = Math.max(1, W * 0.02);
      for (var i = 1; i < 3; i++) { var lx = x + w * i / 3; ctx.beginPath(); ctx.moveTo(lx, y + h * 0.32); ctx.lineTo(lx, y + h); ctx.stroke(); }
    } else {
      bolts(ctx, [[x + w * 0.15, y + h * 0.6], [x + w * 0.5, y + h * 0.6], [x + w * 0.85, y + h * 0.6], [x + w * 0.15, y + h * 0.88], [x + w * 0.85, y + h * 0.88]], W * 0.025, lighten(c1, 45));
    }
    // Latch/lock detail straddling the lid seam (task brief "lid detail").
    var lw = w * 0.16, lh = h * 0.14;
    rectBevel(ctx, x + w / 2 - lw / 2, y + h * 0.32 - lh / 2, lw, lh, darken(c1, 40), { dark: '#141414', outlineWidth: 1 });
    ctx.fillStyle = lighten(c1, 50);
    ctx.beginPath(); ctx.arc(x + w / 2, y + h * 0.32, lw * 0.14, 0, Math.PI * 2); ctx.fill();
  }

  // ---------------------------------------------------------------------
  // Belts, Factorio-style. Local frame: flow goes toward local north (up). Tier-coloured side
  // rails with bolts, a dark rubber surface with chevron ribs (one per lane) that scroll in the
  // flow direction, a lane divider, and optional end caps (opts.cap bit0 = back/start end,
  // bit1 = front/open end). frame 0..15 = one rib period (1/4 tile) of travel; 61-render.js
  // maps the belt's step time to frames so ribs move exactly as fast as the items.
  // ---------------------------------------------------------------------
  var BELT_TIER = {
    yellow: { rail: '#DDAA1C', hi: '#FFE17C', lo: '#7A5A08' },
    fast: { rail: '#C8392A', hi: '#FF8C76', lo: '#6A180E' },
  };
  var BELT_RAIL = 0.10; // rail width as a fraction of the belt width
  function beltTierOf(def) {
    var b = def.belt || def.underground || def.splitter || {};
    return BELT_TIER[b.tier === 'fast' ? 'fast' : 'yellow'];
  }
  function roundRectPath(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }
  function beltBolt(ctx, x, y, r) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.45, 0, Math.PI * 2); ctx.fill();
  }
  function paintRail(ctx, x, w, H, tier) {
    ctx.fillStyle = tier.lo; ctx.fillRect(x, 0, w, H);
    ctx.fillStyle = tier.rail; ctx.fillRect(x + w * 0.12, 0, w * 0.76, H);
    ctx.fillStyle = tier.hi; ctx.fillRect(x + w * 0.12, 0, w * 0.22, H);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x + w * 0.7, 0, w * 0.18, H);
    beltBolt(ctx, x + w * 0.5, H * 0.25, w * 0.2);
    beltBolt(ctx, x + w * 0.5, H * 0.75, w * 0.2);
  }
  // Belt surface (+ rails) filling the rect x0..x0+w, 0..H.
  function paintBeltRun(ctx, x0, w, H, frame, tier) {
    var rw = w * BELT_RAIL, sx = x0 + rw, sw = w - rw * 2;
    var g = ctx.createLinearGradient(sx, 0, sx + sw, 0);
    g.addColorStop(0, '#1C1E20'); g.addColorStop(0.18, '#303336'); g.addColorStop(0.5, '#383B3F');
    g.addColorStop(0.82, '#303336'); g.addColorStop(1, '#1C1E20');
    ctx.fillStyle = g; ctx.fillRect(sx, 0, sw, H);
    var period = H / 4, off = ((frame % 16) + 16) % 16 / 16 * period;
    var lw = Math.max(1, H * 0.032), depth = H * 0.06;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (var y = -off; y < H + period; y += period) {
      for (var ln = 0; ln < 2; ln++) {
        var l = sx + (ln ? sw / 2 : 0) + sw * 0.07, r = sx + (ln ? sw : sw / 2) - sw * 0.07, m = (l + r) / 2;
        ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = lw;
        ctx.beginPath(); ctx.moveTo(l, y + depth + lw); ctx.lineTo(m, y + lw); ctx.lineTo(r, y + depth + lw); ctx.stroke();
        ctx.strokeStyle = '#61666C';
        ctx.beginPath(); ctx.moveTo(l, y + depth); ctx.lineTo(m, y); ctx.lineTo(r, y + depth); ctx.stroke();
      }
    }
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(sx + sw / 2 - lw * 0.8, 0, lw * 1.6, H);
    ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(sx + sw / 2 + lw * 0.8, 0, lw * 0.8, H);
    paintRail(ctx, x0, rw, H, tier);
    paintRail(ctx, x0 + w - rw, rw, H, tier);
  }
  // Rounded rail-coloured end cap across the belt (start or open end of a line).
  function paintBeltCap(ctx, W, H, atTop, tier) {
    var ch = H * 0.13, y = atTop ? 0 : H - ch;
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, atTop ? ch : y - H * 0.03, W, H * 0.03);
    roundRectPath(ctx, W * 0.01, y, W * 0.98, ch, ch * 0.5);
    var g = ctx.createLinearGradient(0, y, 0, y + ch);
    g.addColorStop(0, tier.hi); g.addColorStop(0.45, tier.rail); g.addColorStop(1, tier.lo);
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1; ctx.stroke();
    beltBolt(ctx, W * 0.3, y + ch / 2, ch * 0.2);
    beltBolt(ctx, W * 0.7, y + ch / 2, ch * 0.2);
  }
  function paintBelt(ctx, W, H, frame, dir, def, type, opts) {
    var tier = beltTierOf(def);
    if (def.belt && opts && opts.shape) { paintBeltCurve(ctx, W, H, frame, tier, opts.shape); return; }
    paintBeltRun(ctx, 0, W, H, frame, tier);
    var cap = (opts && opts.cap) | 0;
    if (cap & 1) paintBeltCap(ctx, W, H, false, tier);
    if (cap & 2) paintBeltCap(ctx, W, H, true, tier);
  }
  // Curved belt (shape 1 turns right, -1 turns left; F.belts sets e.curve). Flow exits the top
  // edge; for shape 1 it enters from the right edge (pivot = top-right corner), -1 mirrored.
  // Lane centres sit at radius 0.25/0.75 like F.belts.laneWorldPos.
  function paintBeltCurve(ctx, W, H, frame, tier, shape) {
    ctx.clearRect(0, 0, W, H); // drop the generic square tile shadow: only the arc is solid
    ctx.save();
    if (shape < 0) { ctx.translate(W, 0); ctx.scale(-1, 1); }
    var px = W, py = 0, A0 = Math.PI / 2, A1 = Math.PI, rw = W * BELT_RAIL;
    function band(r0, r1, fill) {
      ctx.beginPath(); ctx.arc(px, py, r1, A0, A1); if (r0 > 0) ctx.arc(px, py, r0, A1, A0, true); else ctx.lineTo(px, py);
      ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
    }
    ctx.save(); ctx.translate(W * 0.04, H * 0.05); band(0, W, 'rgba(0,0,0,0.3)'); ctx.restore();
    var g = ctx.createRadialGradient(px, py, rw, px, py, W - rw);
    g.addColorStop(0, '#1C1E20'); g.addColorStop(0.18, '#303336'); g.addColorStop(0.5, '#383B3F');
    g.addColorStop(0.82, '#303336'); g.addColorStop(1, '#1C1E20');
    band(rw, W - rw, g);
    var lw = Math.max(1, H * 0.032), stepA = (A1 - A0) / 4, offA = ((frame % 16) + 16) % 16 / 16 * stepA;
    var lanes = [[rw, W / 2], [W / 2, W - rw]];
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (var ang = A0 - stepA + offA; ang < A1 + stepA; ang += stepA) {
      for (var li = 0; li < 2; li++) {
        var r0 = lanes[li][0] + (W - 2 * rw) * 0.035, r1 = lanes[li][1] - (W - 2 * rw) * 0.035, rm = (r0 + r1) / 2;
        var apex = ang + (H * 0.06) / rm;
        if (ang < A0 - 0.01 || apex > A1 + 0.01) continue;
        for (var pass = 0; pass < 2; pass++) {
          var sh = pass ? 0 : lw / rm;
          ctx.strokeStyle = pass ? '#61666C' : 'rgba(0,0,0,0.6)'; ctx.lineWidth = lw;
          ctx.beginPath();
          ctx.moveTo(px + r0 * Math.cos(ang - sh), py + r0 * Math.sin(ang - sh));
          ctx.lineTo(px + rm * Math.cos(apex - sh), py + rm * Math.sin(apex - sh));
          ctx.lineTo(px + r1 * Math.cos(ang - sh), py + r1 * Math.sin(ang - sh));
          ctx.stroke();
        }
      }
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = lw * 1.6;
    ctx.beginPath(); ctx.arc(px, py, W / 2, A0, A1); ctx.stroke();
    // rails: outer quarter ring and the small inner corner piece
    band(W - rw, W, tier.lo); band(W - rw * 0.88, W - rw * 0.12, tier.rail); band(W - rw * 0.88, W - rw * 0.62, tier.hi);
    band(0, rw, tier.lo); band(0, rw * 0.88, tier.rail);
    for (var k = 1; k <= 3; k += 2) {
      var ba = A0 + (A1 - A0) * k / 4;
      beltBolt(ctx, px + (W - rw / 2) * Math.cos(ba), py + (W - rw / 2) * Math.sin(ba), rw * 0.2);
    }
    ctx.restore();
  }

  // Underground belt: belt half leading into a tier-coloured hood with a dark tunnel mouth.
  // 'in' (entrance): items arrive from the back (bottom), hood covers the front half.
  // 'out' (exit): hood covers the back half, belt continues out of the front.
  function paintUnderground(ctx, W, H, frame, dir, def, type, opts) {
    var io = (opts && opts.io) || 'in', tier = beltTierOf(def);
    ctx.save(); ctx.beginPath();
    if (io === 'in') ctx.rect(0, H * 0.4, W, H * 0.6); else ctx.rect(0, 0, W, H * 0.6);
    ctx.clip();
    paintBeltRun(ctx, 0, W, H, frame, tier);
    ctx.restore();
    var hy = io === 'in' ? H * 0.02 : H * 0.45, hh = H * 0.53;
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; roundRectPath(ctx, W * 0.06, hy + H * 0.04, W * 0.94, hh, W * 0.1); ctx.fill();
    roundRectPath(ctx, W * 0.03, hy, W * 0.94, hh, W * 0.1);
    var g = ctx.createLinearGradient(0, hy, 0, hy + hh);
    g.addColorStop(0, tier.hi); g.addColorStop(0.35, tier.rail); g.addColorStop(1, tier.lo);
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = '#141414'; ctx.lineWidth = 1.5; ctx.stroke();
    // tunnel mouth on the side that faces the visible belt
    var mh = hh * 0.34, my = io === 'in' ? hy + hh - mh : hy;
    roundRectPath(ctx, W * 0.15, my, W * 0.7, mh, mh * 0.35);
    var mg = ctx.createLinearGradient(0, my, 0, my + mh);
    if (io === 'in') { mg.addColorStop(0, '#050505'); mg.addColorStop(1, '#2A2A2A'); } else { mg.addColorStop(0, '#2A2A2A'); mg.addColorStop(1, '#050505'); }
    ctx.fillStyle = mg; ctx.fill();
    // top plate with a direction arrow
    var ty = io === 'in' ? hy + hh * 0.12 : hy + hh * 0.46, th = hh * 0.4;
    roundRectPath(ctx, W * 0.22, ty, W * 0.56, th, th * 0.25);
    ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fill();
    arrowShape(ctx, W / 2, ty + th * 0.5, th * 0.34, tier.hi);
    beltBolt(ctx, W * 0.12, hy + hh * 0.2, W * 0.035); beltBolt(ctx, W * 0.88, hy + hh * 0.2, W * 0.035);
  }

  // Splitter (2 wide x 1 deep, flow up): two animated belts under a housing with a centre hub.
  function paintSplitter(ctx, W, H, frame, dir, def) {
    var tier = beltTierOf(def), half = W / 2;
    paintBeltRun(ctx, 0, half, H, frame, tier);
    paintBeltRun(ctx, half, half, H, frame, tier);
    var hy = H * 0.26, hh = H * 0.48;
    ctx.fillStyle = 'rgba(0,0,0,0.38)'; roundRectPath(ctx, W * 0.04, hy + H * 0.05, W * 0.94, hh, hh * 0.3); ctx.fill();
    roundRectPath(ctx, W * 0.02, hy, W * 0.96, hh, hh * 0.3);
    var g = ctx.createLinearGradient(0, hy, 0, hy + hh);
    g.addColorStop(0, tier.hi); g.addColorStop(0.35, tier.rail); g.addColorStop(1, tier.lo);
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = '#141414'; ctx.lineWidth = 1.5; ctx.stroke();
    roundRectPath(ctx, W * 0.08, hy + hh * 0.22, W * 0.84, hh * 0.56, hh * 0.2);
    ctx.fillStyle = '#3A3D40'; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1; ctx.stroke();
    for (var v = 0; v < 3; v++) {
      ctx.fillStyle = '#1E2022';
      ctx.fillRect(W * (0.13 + v * 0.05), hy + hh * 0.34, W * 0.025, hh * 0.32);
      ctx.fillRect(W * (0.82 - v * 0.05), hy + hh * 0.34, W * 0.025, hh * 0.32);
    }
    var cx = W / 2, cy = hy + hh / 2, r = hh * 0.36;
    ctx.fillStyle = '#56595D'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#141414'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.strokeStyle = tier.rail; ctx.lineWidth = Math.max(1.5, r * 0.22); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx, cy + r * 0.55); ctx.lineTo(cx, cy); ctx.lineTo(cx - r * 0.5, cy - r * 0.5);
    ctx.moveTo(cx, cy); ctx.lineTo(cx + r * 0.5, cy - r * 0.5); ctx.stroke();
    beltBolt(ctx, W * 0.05, hy + hh / 2, hh * 0.07); beltBolt(ctx, W * 0.95, hy + hh / 2, hh * 0.07);
  }

  function paintInserterBase(ctx, W, H, frame, dir, def) {
    var col = entColors(def)[0];
    var r = Math.min(W, H) * 0.42;
    ctx.fillStyle = '#3A3A3A'; ctx.beginPath(); ctx.arc(W / 2, H / 2, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#141414'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(W / 2, H / 2, r * 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = darken(col, 20); ctx.fillRect(W / 2 - W * 0.05, H * 0.1, W * 0.1, H * 0.3);
  }

  function paintPipe(ctx, W, H, frame, dir, def, type, opts) {
    var col = '#8FA3B0';
    var mask = (opts && opts.mask != null) ? opts.mask : (type === 'pipe-to-ground' ? 4 : 5);
    var cx = W / 2, cy = H / 2, thick = Math.min(W, H) * 0.34, len = Math.min(W, H) * 0.5;
    ctx.fillStyle = '#5A6A74'; ctx.beginPath(); ctx.arc(cx, cy, thick * 0.6, 0, Math.PI * 2); ctx.fill();
    for (var d = 0; d < 4; d++) if (mask & (1 << d)) {
      pipeStub(ctx, cx, cy, d, len, thick, col);
      // flange ring + bolts where the pipe meets the tile edge (task brief "joints and
      // flanges connecting to neighbours").
      var fv = F.util.dirVec(d);
      var flx = cx + fv[0] * len * 0.92, fly = cy + fv[1] * len * 0.92;
      ctx.save(); ctx.translate(flx, fly); ctx.rotate(Math.atan2(fv[1], fv[0]) + Math.PI / 2);
      ctx.fillStyle = darken(col, 20);
      ctx.fillRect(-thick * 0.62, -thick * 0.1, thick * 1.24, thick * 0.2);
      ctx.strokeStyle = '#141414'; ctx.lineWidth = 1; ctx.strokeRect(-thick * 0.62, -thick * 0.1, thick * 1.24, thick * 0.2);
      ctx.restore();
      bolts(ctx, [[flx - fv[1] * thick * 0.4, fly + fv[0] * thick * 0.4], [flx + fv[1] * thick * 0.4, fly - fv[0] * thick * 0.4]], thick * 0.09, '#C9CDD0');
    }
    ctx.strokeStyle = '#141414'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, cy, thick * 0.6, 0, Math.PI * 2); ctx.stroke();
    if (type === 'pipe-to-ground') {
      ctx.fillStyle = '#2A2018'; ctx.beginPath(); ctx.ellipse(cx, cy - len * 0.75, thick * 0.4, thick * 0.22, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#141414'; ctx.lineWidth = 1.5; ctx.stroke();
    }
  }

  function paintPole(ctx, W, H, frame, dir, def) {
    var wood = def.id === 'small-electric-pole';
    var col = wood ? '#8B5A2B' : '#7C8790';
    ctx.fillStyle = darken(col, 10); ctx.fillRect(W * 0.44, H * 0.1, W * 0.12, H * 0.82);
    ctx.strokeStyle = '#141414'; ctx.lineWidth = 1.5; ctx.strokeRect(W * 0.44, H * 0.1, W * 0.12, H * 0.82);
    if (!wood) { ctx.fillStyle = col; ctx.fillRect(W * 0.22, H * 0.26, W * 0.56, H * 0.07); ctx.strokeRect(W * 0.22, H * 0.26, W * 0.56, H * 0.07); }
    bolts(ctx, [[W * 0.5, H * 0.2], [W * 0.5, H * 0.4]], W * 0.03, wood ? '#C9772E' : '#B9C2C9');
  }

  function paintOffshorePump(ctx, W, H, frame, dir, def) {
    rectBevel(ctx, W * 0.12, H * 0.15, W * 0.76, H * 0.6, '#6C8C9C', { dark: darken('#6C8C9C', 30) });
    ctx.fillStyle = '#2F6E8C'; ctx.beginPath(); ctx.ellipse(W / 2, H * 0.15, W * 0.22, H * 0.08, 0, 0, Math.PI * 2); ctx.fill();
    pipeStub(ctx, W / 2, H * 0.78, 2, H * 0.2, W * 0.14, '#8FA3B0');
  }

  function paintBoiler(ctx, W, H, frame, dir, def, type, opts) {
    var working = !!(opts && opts.working);
    rectBevel(ctx, W * 0.03, H * 0.08, W * 0.94, H * 0.68, '#6B5A4A', { dark: '#3E332A' });
    // fire door: dark iron hatch on the front face with an animated flicker when burning.
    rectBevel(ctx, W * 0.36, H * 0.42, W * 0.28, H * 0.3, '#332A22', { dark: '#1C1610', outline: true });
    var flick = working ? (0.6 + 0.4 * Math.sin(frame * 1.3)) : 0.12;
    ctx.fillStyle = 'rgba(224,96,42,' + flick.toFixed(2) + ')';
    ctx.beginPath(); ctx.ellipse(W / 2, H * 0.58, W * 0.16, H * 0.09, 0, 0, Math.PI * 2); ctx.fill();
    drawChimney(ctx, W * 0.8, H * 0.02, W * 0.13, H * 0.16, frame, working);
    pipeStub(ctx, W * 0.06, H * 0.88, 3, W * 0.06, H * 0.1, '#8FA3B0');
    pipeStub(ctx, W * 0.94, H * 0.88, 1, W * 0.06, H * 0.1, '#8FA3B0');
    pipeStub(ctx, W / 2, H * 0.03, 0, H * 0.09, W * 0.1, '#C9CDD0');
  }

  function paintSteamEngine(ctx, W, H, frame, dir, def, type, opts) {
    var working = !!(opts && opts.working);
    rectBevel(ctx, W * 0.05, H * 0.03, W * 0.9, H * 0.94, '#7A8590', { dark: '#454C54' });
    var cx = W / 2, cy = H / 2, r = Math.min(W, H) * 0.22;
    ctx.strokeStyle = '#454C54'; ctx.lineWidth = Math.max(1, r * 0.12);
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    var pang = working ? (frame / 8) * Math.PI * 2 : 0;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(pang);
    for (var i = 0; i < 6; i++) { var a = i / 6 * Math.PI * 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); ctx.stroke(); }
    ctx.restore();
    // Piston rod sliding in/out of a cylinder above the flywheel, driven by the same phase
    // (task brief "piston/flywheel").
    var stroke = Math.sin(pang) * H * 0.09;
    var pcx = cx, pcy = H * 0.2;
    ctx.fillStyle = '#5A6168'; ctx.fillRect(pcx - W * 0.08, pcy - H * 0.06, W * 0.16, H * 0.12);
    ctx.strokeStyle = '#2A2E32'; ctx.lineWidth = 1; ctx.strokeRect(pcx - W * 0.08, pcy - H * 0.06, W * 0.16, H * 0.12);
    ctx.strokeStyle = '#C9CDD0'; ctx.lineWidth = Math.max(1, W * 0.035); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(pcx, pcy); ctx.lineTo(pcx, cy - r * 0.2 + stroke); ctx.stroke();
    pipeStub(ctx, W / 2, H * 0.02, 0, H * 0.06, W * 0.14, '#8FA3B0');
    pipeStub(ctx, W / 2, H * 0.98, 2, H * 0.06, W * 0.14, '#8FA3B0');
  }

  function paintSolarPanel(ctx, W, H) {
    rectBevel(ctx, W * 0.05, H * 0.05, W * 0.9, H * 0.9, '#2B4C7E', { dark: '#16314F' });
    ctx.strokeStyle = '#3E6AA6'; ctx.lineWidth = Math.max(1, W * 0.02);
    for (var i = 1; i < 4; i++) {
      var x = W * (0.05 + 0.9 * i / 4); ctx.beginPath(); ctx.moveTo(x, H * 0.05); ctx.lineTo(x, H * 0.95); ctx.stroke();
      var y = H * (0.05 + 0.9 * i / 4); ctx.beginPath(); ctx.moveTo(W * 0.05, y); ctx.lineTo(W * 0.95, y); ctx.stroke();
    }
    // Diagonal glassy sheen (task brief "cell grid with sheen") — a single cheap gradient
    // band, baked into the cached sprite so it costs nothing per frame.
    ctx.save();
    ctx.beginPath(); ctx.rect(W * 0.05, H * 0.05, W * 0.9, H * 0.9); ctx.clip();
    var sg = ctx.createLinearGradient(W * 0.1, H * 0.05, W * 0.55, H * 0.6);
    sg.addColorStop(0, 'rgba(255,255,255,0.32)'); sg.addColorStop(0.5, 'rgba(255,255,255,0.04)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sg; ctx.fillRect(W * 0.05, H * 0.05, W * 0.9, H * 0.9);
    ctx.restore();
  }

  function paintAccumulator(ctx, W, H, frame) {
    rectBevel(ctx, W * 0.1, H * 0.1, W * 0.8, H * 0.8, '#2E5E3E', { dark: '#163019' });
    var level = F.util.clamp(frame, 0, 4) / 4;
    ctx.fillStyle = '#5EE68A';
    ctx.fillRect(W * 0.22, H * (0.82 - 0.55 * level), W * 0.56, H * 0.55 * level);
    ctx.strokeStyle = '#141414'; ctx.lineWidth = 1.5; ctx.strokeRect(W * 0.22, H * 0.27, W * 0.56, H * 0.55);
  }

  function paintBurnerDrill(ctx, W, H, frame, dir, def, type, opts) {
    var working = !!(opts && opts.working);
    // dark steel body (base plate first, so the chimney/head read as sitting "on" it)
    rectBevel(ctx, W * 0.02, H * 0.72, W * 0.96, H * 0.14, '#413E38', { dark: '#241F1A' });
    rectBevel(ctx, W * 0.06, H * 0.16, W * 0.88, H * 0.62, '#6E6A60', { dark: '#413E38' });
    drawChimney(ctx, W * 0.78, H * 0.0, W * 0.15, H * 0.2, frame, working);
    var bob = Math.sin((frame / 8) * Math.PI * 2) * H * 0.04;
    ctx.fillStyle = working ? '#D9A520' : '#9A7B2E';
    ctx.beginPath(); ctx.moveTo(W * 0.3, H * 0.16 + bob); ctx.lineTo(W * 0.7, H * 0.16 + bob); ctx.lineTo(W / 2, H * 0.03 + bob);
    ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#141414'; ctx.lineWidth = 1.5; ctx.stroke();
    // orange fuel/fire light — the firebox viewport, bright while burning, embers when idle.
    var fireA = working ? (0.55 + 0.35 * Math.sin(frame * 1.4)) : 0.18;
    ctx.fillStyle = 'rgba(233,120,30,' + fireA.toFixed(2) + ')';
    ctx.beginPath(); ctx.arc(W * 0.28, H * 0.82, W * 0.05, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#1A1410'; ctx.lineWidth = 1; ctx.stroke();
    // output tile is in front of the LEFT column (def.drill.output) — arrow near top-left.
    arrowShape(ctx, W * 0.22, H * 0.1, W * 0.09, '#E8B31E');
  }

  function paintElectricDrill(ctx, W, H, frame, dir, def, type, opts) {
    var working = !!(opts && opts.working);
    rectBevel(ctx, W * 0.04, H * 0.04, W * 0.92, H * 0.92, '#5E6C7A', { dark: '#33393F' });
    // four support struts bracing the centre housing to the corners (tripod/quad-leg look).
    ctx.strokeStyle = '#33393F'; ctx.lineWidth = Math.max(1, Math.min(W, H) * 0.035);
    [[0.14, 0.14], [0.86, 0.14], [0.14, 0.86], [0.86, 0.86]].forEach(function (p) {
      ctx.beginPath(); ctx.moveTo(W * p[0], H * p[1]); ctx.lineTo(W / 2, H / 2); ctx.stroke();
    });
    hazardStripe(ctx, W * 0.06, H * 0.86, W * 0.88, H * 0.08, W * 0.045);
    var angle = working ? (frame / 8) * Math.PI * 2 : 0;
    gearShape(ctx, W / 2, H / 2, Math.min(W, H) * 0.3, Math.min(W, H) * 0.08, 10, angle, '#D9A520', '#3A3A3A');
    ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(angle);
    ctx.strokeStyle = '#4A3F0E'; ctx.lineWidth = Math.max(1, Math.min(W, H) * 0.02);
    ctx.beginPath(); ctx.moveTo(-Math.min(W, H) * 0.08, 0); ctx.lineTo(Math.min(W, H) * 0.08, 0); ctx.stroke();
    ctx.restore();
    // output tile is in front of the CENTRE column — arrow top-centre.
    arrowShape(ctx, W / 2, H * 0.08, W * 0.09, '#D9A520');
  }

  function paintFurnace(ctx, W, H, frame, dir, def, type, opts) {
    var working = !!(opts && opts.working);
    var col = entColors(def)[0];
    rectBevel(ctx, W * 0.04, H * 0.04, W * 0.92, H * 0.92, col, { dark: darken(col, 35) });
    if (type === 'steel-furnace') {
      // riveted steel plating instead of stone mortar lines.
      bolts(ctx, [[W * 0.14, H * 0.14], [W * 0.86, H * 0.14], [W * 0.14, H * 0.86], [W * 0.86, H * 0.86]], W * 0.025, lighten(col, 40));
    } else {
      ctx.strokeStyle = darken(col, 20); ctx.lineWidth = Math.max(1, W * 0.015);
      ctx.beginPath(); ctx.moveTo(W * 0.04, H * 0.5); ctx.lineTo(W * 0.96, H * 0.5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(W * 0.5, H * 0.04); ctx.lineTo(W * 0.5, H * 0.96); ctx.stroke();
    }
    drawChimney(ctx, W * 0.78, H * 0.0, W * 0.14, H * 0.16, frame, working);
    var glow = working ? (0.6 + 0.4 * Math.sin(frame * 1.1)) : 0.1;
    var mouths = type === 'steel-furnace' ? [[0.28, 0.72], [0.72, 0.72]] : [[0.5, 0.72]];
    mouths.forEach(function (m) {
      ctx.fillStyle = 'rgba(224,96,42,' + glow.toFixed(2) + ')';
      ctx.beginPath(); ctx.ellipse(W * m[0], H * m[1], W * 0.13, H * 0.09, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#1A1410'; ctx.lineWidth = 1; ctx.stroke();
    });
  }

  function paintAssembler(ctx, W, H, frame, dir, def, type, opts) {
    var working = !!(opts && opts.working);
    var col = entColors(def)[0];
    rectBevel(ctx, W * 0.05, H * 0.05, W * 0.9, H * 0.9, col, { dark: darken(col, 30) });
    // coloured band across the middle (AM2 gets a second, denoting the higher tier) + corner bolts.
    ctx.fillStyle = darken(col, 15); ctx.fillRect(W * 0.05, H * 0.42, W * 0.9, H * 0.1);
    if (type === 'assembling-machine-2') ctx.fillRect(W * 0.05, H * 0.18, W * 0.9, H * 0.06);
    bolts(ctx, [[W * 0.12, H * 0.12], [W * 0.88, H * 0.12], [W * 0.12, H * 0.88], [W * 0.88, H * 0.88]], W * 0.03, lighten(col, 35));
    gearShape(ctx, W / 2, H / 2, Math.min(W, H) * 0.26, Math.min(W, H) * 0.07, 8, working ? (frame / 8) * Math.PI * 2 : 0, lighten(col, 20), '#2A2A2A');
  }

  function paintLab(ctx, W, H, frame, dir, def, type, opts) {
    var working = !!(opts && opts.working);
    rectBevel(ctx, W * 0.08, H * 0.3, W * 0.84, H * 0.66, '#3C6E82', { dark: '#1E3A46', outline: false });
    ctx.fillStyle = '#4A8AA8'; ctx.beginPath(); ctx.arc(W / 2, H * 0.34, Math.min(W, H) * 0.34, Math.PI, 0); ctx.fill();
    var pulse = working ? (0.4 + 0.5 * Math.abs(Math.sin(frame * 0.8))) : 0.15;
    ctx.strokeStyle = 'rgba(120,220,255,' + pulse.toFixed(2) + ')'; ctx.lineWidth = Math.max(2, W * 0.03);
    ctx.beginPath(); ctx.arc(W / 2, H * 0.34, Math.min(W, H) * 0.36, Math.PI, 0); ctx.stroke();
    ctx.strokeStyle = '#141414'; ctx.lineWidth = 2; ctx.strokeRect(W * 0.08, H * 0.3, W * 0.84, H * 0.66);
  }

  function paintTurretBase(ctx, W, H) {
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath(); ctx.ellipse(W / 2, H / 2, W * 0.46, H * 0.46, 0, 0, Math.PI * 2); ctx.fill();
    rectBevel(ctx, W * 0.08, H * 0.08, W * 0.84, H * 0.84, '#8A7A1E', { dark: '#4A3F0E' });
    ctx.fillStyle = '#CAA718'; ctx.beginPath(); ctx.arc(W / 2, H / 2, W * 0.34, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#4A3F0E'; ctx.lineWidth = Math.max(1, W * 0.02); ctx.stroke();
    bolts(ctx, [[W * 0.2, H * 0.2], [W * 0.8, H * 0.2], [W * 0.2, H * 0.8], [W * 0.8, H * 0.8]], W * 0.035, '#CAA718');
  }

  function paintWall(ctx, W, H, frame, dir, def, type, opts) {
    var mask = (opts && opts.mask != null) ? opts.mask : 0;
    ctx.fillStyle = '#CCD9CC'; ctx.fillRect(W * 0.15, H * 0.15, W * 0.7, H * 0.7);
    ctx.strokeStyle = '#8A9A8A'; ctx.lineWidth = Math.max(1, W * 0.03);
    for (var i = 1; i < 3; i++) { var y = H * (0.15 + 0.7 * i / 3); ctx.beginPath(); ctx.moveTo(W * 0.15, y); ctx.lineTo(W * 0.85, y); ctx.stroke(); }
    ctx.strokeStyle = '#141414'; ctx.lineWidth = 2; ctx.strokeRect(W * 0.15, H * 0.15, W * 0.7, H * 0.7);
    for (var d = 0; d < 4; d++) if (mask & (1 << d)) {
      var v = F.util.dirVec(d);
      ctx.fillStyle = '#CCD9CC';
      ctx.fillRect(W / 2 - W * 0.1 + v[0] * W * 0.15, H / 2 - H * 0.1 + v[1] * H * 0.15, W * 0.2, H * 0.2);
    }
  }

  function paintRadar(ctx, W, H, frame) {
    // base plate + a mast the dish pivots on (GDD §11.4 "3×3 base + rotating dish").
    rectBevel(ctx, W * 0.2, H * 0.62, W * 0.6, H * 0.34, '#7A8590', { dark: '#454C54' });
    bolts(ctx, [[W * 0.28, H * 0.9], [W * 0.72, H * 0.9]], W * 0.02, '#454C54');
    ctx.fillStyle = '#454C54'; ctx.fillRect(W * 0.47, H * 0.3, W * 0.06, H * 0.34);
    var cx = W / 2, cy = H * 0.28, dishR = Math.min(W, H) * 0.34;
    // one clean revolution per 16-frame loop — no seam at the frame-15→0 wrap.
    var ang = (frame / 16) * Math.PI * 2;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang);
    ctx.fillStyle = '#8A9AA5';
    ctx.beginPath(); ctx.ellipse(0, 0, dishR, dishR * 0.42, 0, Math.PI, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#141414'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.strokeStyle = '#6A7A85'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-dishR * 0.6, 0); ctx.lineTo(dishR * 0.6, 0); ctx.stroke();
    ctx.fillStyle = '#CFE0E8'; ctx.beginPath(); ctx.arc(0, -dishR * 0.14, dishR * 0.09, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function paintLamp(ctx, W, H, frame, dir, def, type, opts) {
    var lit = !!(opts && opts.lit);
    ctx.fillStyle = '#4A4740'; ctx.beginPath(); ctx.ellipse(W / 2, H * 0.9, W * 0.16, H * 0.06, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#6E6A60'; ctx.fillRect(W * 0.44, H * 0.35, W * 0.12, H * 0.55);
    // small hood/roof over the bulb so it silhouettes as a lamp, not a bare bolt on a post.
    ctx.fillStyle = '#5A564C';
    ctx.beginPath(); ctx.arc(W / 2, H * 0.16, W * 0.24, Math.PI, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#141414'; ctx.lineWidth = 1; ctx.stroke();
    if (lit) { ctx.save(); ctx.globalAlpha = 0.28; ctx.fillStyle = '#FFF3B0'; ctx.beginPath(); ctx.arc(W / 2, H * 0.3, W * 0.46, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
    ctx.fillStyle = lit ? '#FFF3B0' : '#8A8570';
    ctx.beginPath(); ctx.arc(W / 2, H * 0.3, W * 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#141414'; ctx.lineWidth = 1.5; ctx.stroke();
  }

  function paintSpawner(ctx, W, H, frame) {
    var rng = F.rng.local(1, 2, 3);
    ctx.fillStyle = '#6B3A5C';
    fillPoly(ctx, W / 2, H / 2, Math.min(W, H) * 0.44, 9, rng() * Math.PI, rng);
    ctx.strokeStyle = '#3A1F30'; ctx.lineWidth = 2; ctx.stroke();
    var pulse = 0.5 + 0.5 * Math.abs(Math.sin(frame * 0.9));
    for (var i = 0; i < 5; i++) {
      var a = i / 5 * Math.PI * 2 + rng() * 0.3, r = Math.min(W, H) * 0.28;
      ctx.fillStyle = 'rgba(178,120,168,' + pulse.toFixed(2) + ')';
      ctx.beginPath(); ctx.arc(W / 2 + Math.cos(a) * r, H / 2 + Math.sin(a) * r, Math.min(W, H) * 0.06, 0, Math.PI * 2); ctx.fill();
    }
  }

  function paintCorpse(ctx, W, H) {
    // dark low mound + a lying figure silhouette + a small grave marker stick (GDD §11.4
    // "dark grey lying figure" plus the task brief's "small grave marker" flavour).
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath(); ctx.ellipse(W / 2, H * 0.62, W * 0.42, H * 0.22, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(Math.PI / 2.3);
    ctx.fillStyle = '#4A4A4A'; ctx.beginPath(); ctx.ellipse(0, 0, W * 0.38, H * 0.16, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#141414'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = '#8B7355'; ctx.lineWidth = Math.max(1, W * 0.05); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(W * 0.78, H * 0.72); ctx.lineTo(W * 0.78, H * 0.28); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W * 0.68, H * 0.38); ctx.lineTo(W * 0.88, H * 0.38); ctx.stroke();
  }

  function paintDefault(ctx, W, H, frame, dir, def) {
    var col = entColors(def);
    rectBevel(ctx, W * 0.06, H * 0.06, W * 0.88, H * 0.88, col[0], { dark: col[1] });
  }

  // type id -> painter. Covers all 33 placeable entities (GDD §6 + ARCHITECTURE's P1
  // solar-panel/accumulator) plus the 2 non-placeable "natural" entities (spawner, corpse).
  var PAINTERS = {
    'wooden-chest': paintChest, 'iron-chest': paintChest, 'steel-chest': paintChest,
    'transport-belt': paintBelt, 'fast-transport-belt': paintBelt,
    'underground-belt': paintUnderground, 'fast-underground-belt': paintUnderground,
    'splitter': paintSplitter, 'fast-splitter': paintSplitter,
    'burner-inserter': paintInserterBase, 'inserter': paintInserterBase,
    'long-handed-inserter': paintInserterBase, 'fast-inserter': paintInserterBase,
    'pipe': paintPipe, 'pipe-to-ground': paintPipe,
    'small-electric-pole': paintPole, 'medium-electric-pole': paintPole,
    'offshore-pump': paintOffshorePump,
    'boiler': paintBoiler,
    'steam-engine': paintSteamEngine,
    'solar-panel': paintSolarPanel,
    'accumulator': paintAccumulator,
    'burner-mining-drill': paintBurnerDrill,
    'electric-mining-drill': paintElectricDrill,
    'stone-furnace': paintFurnace, 'steel-furnace': paintFurnace,
    'assembling-machine-1': paintAssembler, 'assembling-machine-2': paintAssembler,
    'lab': paintLab,
    'gun-turret': paintTurretBase,
    'stone-wall': paintWall,
    'radar': paintRadar,
    'small-lamp': paintLamp,
    'biter-spawner': paintSpawner,
    'player-corpse': paintCorpse,
  };

  // ---------------------------------------------------------------------
  // Building art library (shared by the 62-sprites-*.js painter packs). Light comes from the
  // top-left; drawDirectional adds the cast shadow, so painters never draw their own.
  // ---------------------------------------------------------------------
  function rgba(hex, a) { var c = hexToRgb(hex); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  // Rounded panel with a top-lit vertical gradient, inner rim light and a dark outline.
  function panel(ctx, x, y, w, h, color, opts) {
    opts = opts || {};
    var r = opts.r != null ? opts.r : Math.min(w, h) * 0.08;
    var g = ctx.createLinearGradient(x, y, x + w * 0.35, y + h);
    g.addColorStop(0, lighten(color, opts.hi != null ? opts.hi : 26));
    g.addColorStop(0.45, color);
    g.addColorStop(1, darken(color, opts.lo != null ? opts.lo : 30));
    roundRectPath(ctx, x, y, w, h, r);
    ctx.fillStyle = g; ctx.fill();
    if (opts.rim !== false) {
      var lw = Math.max(1, Math.min(w, h) * 0.035);
      ctx.save(); roundRectPath(ctx, x, y, w, h, r); ctx.clip();
      ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = lw * 2;
      ctx.beginPath(); ctx.moveTo(x, y + h - r); ctx.lineTo(x, y); ctx.lineTo(x + w - r, y); ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.30)';
      ctx.beginPath(); ctx.moveTo(x + r, y + h); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w, y + r); ctx.stroke();
      ctx.restore();
    }
    if (opts.outline !== false) {
      roundRectPath(ctx, x, y, w, h, r);
      ctx.strokeStyle = opts.outlineColor || 'rgba(12,12,12,0.9)'; ctx.lineWidth = opts.outlineWidth || Math.max(1.5, PX * 0.03); ctx.stroke();
    }
  }
  // Recessed area (hole, window, intake): dark fill with an inner shadow along the top-left.
  function inset(ctx, x, y, w, h, color, r) {
    r = r != null ? r : Math.min(w, h) * 0.12;
    roundRectPath(ctx, x, y, w, h, r); ctx.fillStyle = color || '#1A1C1E'; ctx.fill();
    ctx.save(); roundRectPath(ctx, x, y, w, h, r); ctx.clip();
    var d = Math.max(1.5, Math.min(w, h) * 0.12);
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(x, y, w, d); ctx.fillRect(x, y, d, h);
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(x, y + h - d * 0.5, w, d * 0.5); ctx.fillRect(x + w - d * 0.5, y, d * 0.5, h);
    ctx.restore();
  }
  // Radial light (fire, lamps, LEDs). 'lighter' blending so it brightens what's underneath.
  function glow(ctx, cx, cy, r, color, alpha) {
    var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, rgba(color, alpha)); g.addColorStop(0.4, rgba(color, alpha * 0.5)); g.addColorStop(1, rgba(color, 0));
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  // Cylinder shading: horizontal=true -> axis runs left-right (shaded top->bottom).
  function cylinder(ctx, x, y, w, h, color, horizontal, opts) {
    opts = opts || {};
    var g = horizontal ? ctx.createLinearGradient(x, y, x, y + h) : ctx.createLinearGradient(x, y, x + w, y);
    g.addColorStop(0, darken(color, 25)); g.addColorStop(0.28, lighten(color, 38)); g.addColorStop(0.5, color);
    g.addColorStop(0.85, darken(color, 38)); g.addColorStop(1, darken(color, 55));
    var r = opts.r != null ? opts.r : (horizontal ? h : w) * 0.5;
    roundRectPath(ctx, x, y, w, h, r); ctx.fillStyle = g; ctx.fill();
    if (opts.outline !== false) { ctx.strokeStyle = 'rgba(12,12,12,0.9)'; ctx.lineWidth = Math.max(1.5, PX * 0.03); ctx.stroke(); }
  }
  // Round disc with a spherical-ish gradient (domes, tank caps, bolts heads, lenses).
  function disc(ctx, cx, cy, r, color, opts) {
    opts = opts || {};
    var g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.05, cx, cy, r);
    g.addColorStop(0, lighten(color, opts.hi != null ? opts.hi : 55)); g.addColorStop(0.55, color); g.addColorStop(1, darken(color, opts.lo != null ? opts.lo : 40));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    if (opts.outline !== false) { ctx.strokeStyle = 'rgba(12,12,12,0.9)'; ctx.lineWidth = opts.outlineWidth || Math.max(1, r * 0.08); ctx.stroke(); }
  }
  // Shaded rivets (dark rim + highlight) — nicer than flat bolts().
  function rivets(ctx, pts, r) {
    for (var i = 0; i < pts.length; i++) {
      var x = pts[i][0], y = pts[i][1];
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.arc(x + r * 0.25, y + r * 0.25, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#B8BEC4'; ctx.beginPath(); ctx.arc(x, y, r * 0.85, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.35, 0, Math.PI * 2); ctx.fill();
    }
  }
  // Grille / vent slats inside a rect (n slats, horizontal unless vertical=true).
  function vent(ctx, x, y, w, h, n, vertical) {
    inset(ctx, x, y, w, h, '#15171A', Math.min(w, h) * 0.1);
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    for (var i = 0; i < n; i++) {
      var t = (i + 0.5) / n;
      if (vertical) {
        var sx = x + w * t, sw = w / n * 0.45;
        ctx.fillStyle = '#5A6068'; ctx.fillRect(sx - sw / 2, y, sw, h);
        ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(sx - sw / 2, y, sw * 0.3, h);
      } else {
        var sy = y + h * t, sh = h / n * 0.45;
        ctx.fillStyle = '#5A6068'; ctx.fillRect(x, sy - sh / 2, w, sh);
        ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(x, sy - sh / 2, w, sh * 0.3);
      }
    }
    ctx.restore();
  }
  // Concrete/steel foundation slab under a building footprint.
  function foundation(ctx, W, H, color) {
    panel(ctx, W * 0.03, H * 0.03, W * 0.94, H * 0.94, color || '#57595A', { r: Math.min(W, H) * 0.06, hi: 14, lo: 18 });
  }
  // Pipe connection nub at the local edge point (x,y) facing dir (0=N,1=E,2=S,3=W).
  function pipeNub(ctx, x, y, dir, size) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(dir * Math.PI / 2);
    cylinder(ctx, -size * 0.5, -size * 0.55, size, size * 0.75, '#8C979E', false, { r: size * 0.08 });
    panel(ctx, -size * 0.66, -size * 0.2, size * 1.32, size * 0.3, '#6E787E', { r: size * 0.05, rim: false });
    ctx.restore();
  }
  F.sprites.lib = {
    PX: PX, TILE: TILE, newCanvas: newCanvas, ctxOf: ctxOf,
    hexToRgb: hexToRgb, rgbToHex: rgbToHex, rgba: rgba, adjust: adjust, lighten: lighten, darken: darken, mix: mix,
    roundRectPath: roundRectPath, rectBevel: rectBevel, bolts: bolts, gearShape: gearShape, pipeStub: pipeStub,
    arrowShape: arrowShape, smokePuffs: smokePuffs, hazardStripe: hazardStripe, fillPoly: fillPoly, entColors: entColors,
    panel: panel, inset: inset, glow: glow, cylinder: cylinder, disc: disc, rivets: rivets, vent: vent,
    foundation: foundation, pipeNub: pipeNub,
  };

  var entityCache = new Map();
  // Painter packs (62-sprites-*.js) replace entries in PAINTERS; clears cached canvases.
  F.sprites.definePainter = function (types, fn) {
    [].concat(types).forEach(function (t) { PAINTERS[t] = fn; });
    entityCache.clear();
  };
  function optsKey(opts) {
    if (!opts) return '';
    var s = '';
    if (opts.mask != null) s += 'm' + opts.mask;
    if (opts.io) s += 'i' + opts.io;
    if (opts.working) s += 'w';
    if (opts.lit) s += 'l';
    if (opts.shape) s += 's' + opts.shape;
    if (opts.cap) s += 'c' + opts.cap;
    // Fluid tint (pipe/pipe-to-ground/storage-tank, design/EXPANSION.md §6.5): fluid is one of
    // ~8 ids, so this keeps the cache bounded while still giving each fluid its own canvas.
    if (opts.fluid) s += 'f' + opts.fluid;
    return s;
  }
  // F.sprites.entity(type, dir=0, frame=0, opts?) -> canvas (ARCHITECTURE §16).
  // opts is a local extension (module MAY add extra helpers): {mask} for pipe/wall neighbour
  // bitmasks (bit0=N,1=E,2=S,3=W), {io:'in'|'out'} for underground belt ends, {working:bool} for
  // furnace/boiler/assembler/drill/steam-engine glow & motion, {lit:bool} for the lamp.
  F.sprites.entity = function (type, dir, frame, opts) {
    if (!F.sprites.enabled) return stub();
    var def = F.data.entities[type];
    if (!def) { F.log.warn('[sprites] unknown entity type: ' + type); return stub(); }
    dir = def.rotatable ? ((dir | 0) & 3) : 0;
    frame = frame | 0;
    var key = type + '|' + dir + '|' + frame + '|' + optsKey(opts);
    var c = entityCache.get(key);
    if (c) return c;
    var fn = PAINTERS[type] || paintDefault;
    // No soft cast shadow for belts OR 'floor'-layer entities (rails, design/EXPANSION.md §6.5):
    // rails are flat full-tile ballast, not a raised building, and a cast shadow would visibly
    // darken the neighbouring tile it's drawn toward.
    c = drawDirectional(def.size[0], def.size[1], dir, function (ctx, w0, h0) {
      fn(ctx, w0, h0, frame, dir, def, type, opts);
    }, def.layer !== 'belt' && def.layer !== 'floor');
    entityCache.set(key, c);
    return c;
  };

  // Turret head: drawn separately from the base (ARCHITECTURE §16), quantised into 32 angle
  // buckets (11.25° each) so it's cacheable; angle 0 = pointing local "north"/up.
  var TURRET_HEAD_BUCKETS = 32;
  var turretHeadCache = new Map();
  F.sprites.turretHead = function (angle) {
    if (!F.sprites.enabled) return stub();
    var a = ((angle || 0) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    var bucket = Math.round(a / (Math.PI * 2) * TURRET_HEAD_BUCKETS) % TURRET_HEAD_BUCKETS;
    var c = turretHeadCache.get(bucket);
    if (c) return c;
    var S = PX;
    c = newCanvas(S, S);
    var ctx = ctxOf(c);
    ctx.translate(S / 2, S / 2); ctx.rotate(bucket / TURRET_HEAD_BUCKETS * Math.PI * 2);
    rectBevel(ctx, -S * 0.09, -S * 0.46, S * 0.18, S * 0.5, '#3A3A3A', { outline: true });
    ctx.fillStyle = '#CAA718'; ctx.beginPath(); ctx.arc(0, 0, S * 0.22, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#141414'; ctx.lineWidth = 2; ctx.stroke();
    turretHeadCache.set(bucket, c);
    return c;
  };

  // ---------------------------------------------------------------------
  // Item icons (GDD §11.5). Placeable items (def.place set) render as an "entity miniature" —
  // the entity sprite itself, scaled to fit — which automatically covers every box/belt/
  // inserter/pole/pump/boiler/engine/drill/furnace/machine/dome/turret/wall/dish/lamp/panel/
  // battery icon class in the data table with zero extra code. Everything else gets a dedicated
  // shape-class drawer keyed by F.data.items[id].icon.shape.
  // ---------------------------------------------------------------------
  function drawOreChunks(ctx, S, c1, c2) {
    var rng = F.rng.local((F.util.hashStr(c1) | 0), (F.util.hashStr(c2 || '') | 0), 5);
    for (var i = 0; i < 4; i++) {
      var cx = S * (0.3 + rng() * 0.4), cy = S * (0.3 + rng() * 0.4), r = S * (0.16 + rng() * 0.1);
      ctx.fillStyle = c1; fillPoly(ctx, cx, cy, r, 6, rng() * Math.PI, rng);
      ctx.fillStyle = c2; fillPoly(ctx, cx - r * 0.25, cy - r * 0.25, r * 0.4, 5, rng() * Math.PI, rng);
    }
  }
  function drawLog(ctx, S, c1, c2) {
    rectBevel(ctx, S * 0.15, S * 0.3, S * 0.7, S * 0.4, c1, { dark: c2 });
    ctx.strokeStyle = c2; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(S * 0.85, S * 0.5, S * 0.2, Math.PI * 0.5, Math.PI * 1.5); ctx.stroke();
    ctx.beginPath(); ctx.arc(S * 0.85, S * 0.5, S * 0.1, Math.PI * 0.5, Math.PI * 1.5); ctx.stroke();
  }
  function drawPlate(ctx, S, c1, c2, thin) {
    var h = thin ? S * 0.3 : S * 0.44;
    rectBevel(ctx, S * 0.12, (S - h) / 2, S * 0.76, h, c1, { dark: c2 });
    ctx.strokeStyle = lighten(c1, 30); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(S * 0.16, (S - h) / 2 + h * 0.3); ctx.lineTo(S * 0.84, (S - h) / 2 + h * 0.3); ctx.stroke();
  }
  function drawBrick(ctx, S, c1, c2) {
    rectBevel(ctx, S * 0.14, S * 0.28, S * 0.72, S * 0.44, c1, { dark: c2 });
    ctx.strokeStyle = c2; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(S * 0.5, S * 0.28); ctx.lineTo(S * 0.5, S * 0.72); ctx.stroke();
  }
  function drawCoil(ctx, S, c1) {
    ctx.strokeStyle = c1; ctx.lineWidth = Math.max(2, S * 0.09); ctx.lineCap = 'round';
    for (var i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(S / 2, S * (0.35 + i * 0.16), S * 0.28, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke(); }
  }
  function drawPcb(ctx, S, c1, c2) {
    rectBevel(ctx, S * 0.14, S * 0.14, S * 0.72, S * 0.72, c1, { dark: darken(c1, 30) });
    ctx.strokeStyle = c2 || '#C57A3B'; ctx.lineWidth = Math.max(1, S * 0.035);
    for (var i = 0; i < 3; i++) { var y = S * (0.3 + i * 0.2); ctx.beginPath(); ctx.moveTo(S * 0.2, y); ctx.lineTo(S * 0.55, y); ctx.lineTo(S * 0.65, y - S * 0.06); ctx.stroke(); }
    ctx.fillStyle = '#1A1A1A'; ctx.fillRect(S * 0.6, S * 0.4, S * 0.22, S * 0.22);
  }
  function drawRods(ctx, S, c1) {
    ctx.strokeStyle = c1; ctx.lineWidth = Math.max(2, S * 0.1); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(S * 0.32, S * 0.18); ctx.lineTo(S * 0.32, S * 0.82); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(S * 0.62, S * 0.22); ctx.lineTo(S * 0.62, S * 0.78); ctx.stroke();
  }
  function drawTube(ctx, S, c1, c2) {
    ctx.strokeStyle = c1; ctx.lineWidth = Math.max(3, S * 0.22); ctx.lineCap = 'butt';
    ctx.beginPath(); ctx.moveTo(S * 0.18, S * 0.5); ctx.lineTo(S * 0.82, S * 0.5); ctx.stroke();
    ctx.fillStyle = c2 || darken(c1, 30);
    ctx.beginPath(); ctx.arc(S * 0.18, S * 0.5, S * 0.14, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(S * 0.82, S * 0.5, S * 0.14, 0, Math.PI * 2); ctx.fill();
  }
  function drawFlask(ctx, S, c1) {
    ctx.fillStyle = '#DCE8EC';
    ctx.beginPath(); ctx.moveTo(S * 0.42, S * 0.16); ctx.lineTo(S * 0.42, S * 0.38); ctx.lineTo(S * 0.2, S * 0.82);
    ctx.arc(S * 0.5, S * 0.82, S * 0.3, Math.PI, 0); ctx.lineTo(S * 0.58, S * 0.38); ctx.lineTo(S * 0.58, S * 0.16); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#8FA3B0'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = c1;
    ctx.beginPath(); ctx.moveTo(S * 0.26, S * 0.6); ctx.lineTo(S * 0.74, S * 0.6); ctx.lineTo(S * 0.7, S * 0.72);
    ctx.arc(S * 0.5, S * 0.72, S * 0.2, 0, Math.PI); ctx.lineTo(S * 0.3, S * 0.72); ctx.closePath(); ctx.fill();
  }
  function drawGun(ctx, S, c1) {
    ctx.fillStyle = c1;
    ctx.fillRect(S * 0.2, S * 0.46, S * 0.55, S * 0.12);
    ctx.fillRect(S * 0.4, S * 0.56, S * 0.16, S * 0.26);
    ctx.strokeStyle = darken(c1, 30); ctx.lineWidth = 1; ctx.strokeRect(S * 0.2, S * 0.46, S * 0.55, S * 0.12);
  }
  function drawMagazine(ctx, S, c1, c2) {
    rectBevel(ctx, S * 0.32, S * 0.16, S * 0.36, S * 0.56, c1, { dark: darken(c1, 30), outline: false });
    ctx.fillStyle = c2 || darken(c1, 20); ctx.fillRect(S * 0.32, S * 0.16, S * 0.36, S * 0.12);
    ctx.strokeStyle = '#141414'; ctx.lineWidth = 1.5; ctx.strokeRect(S * 0.32, S * 0.16, S * 0.36, S * 0.56);
  }
  function drawTool(ctx, S, c1) {
    ctx.strokeStyle = c1; ctx.lineWidth = Math.max(2, S * 0.1); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(S * 0.24, S * 0.76); ctx.lineTo(S * 0.62, S * 0.38); ctx.stroke();
    ctx.beginPath(); ctx.arc(S * 0.7, S * 0.3, S * 0.14, 0.3, Math.PI * 1.6); ctx.stroke();
    ctx.strokeStyle = darken(c1, 30); ctx.lineWidth = Math.max(1, S * 0.05);
    ctx.strokeRect(S * 0.18, S * 0.62, S * 0.22, S * 0.22);
  }
  // F.sprites.defineIcon(shape, fn(ctx, S, def)) — registry for new item.icon.shape ids added by
  // expansion art packs (design/EXPANSION.md §6.5). Consulted before the built-in switch below so
  // an art pack can add e.g. 'plastic'/'powder'/'robot' shapes without editing this file. Clears
  // the item caches so already-drawn icons (e.g. drawn before the pack registered) get refreshed.
  var ICON_PAINTERS = {};
  F.sprites.defineIcon = function (shape, fn) {
    ICON_PAINTERS[shape] = fn;
    itemCache.clear();
    itemURLCache.clear();
  };
  function paintItemIcon(ctx, S, def) {
    var custom = ICON_PAINTERS[def.icon.shape];
    if (custom) {
      try { custom(ctx, S, def); return; }
      catch (err) { F.log.error('[sprites] defineIcon painter failed for shape ' + def.icon.shape, err); }
    }
    var c1 = def.icon.color, c2 = def.icon.color2 || darken(c1, 35);
    switch (def.icon.shape) {
      case 'ore': drawOreChunks(ctx, S, c1, c2); break;
      case 'log': drawLog(ctx, S, c1, c2); break;
      case 'plate': drawPlate(ctx, S, c1, c2, false); break;
      case 'bar': drawPlate(ctx, S, c1, c2, true); break;
      case 'brick': drawBrick(ctx, S, c1, c2); break;
      case 'gear': gearShape(ctx, S / 2, S / 2, S * 0.4, S * 0.15, 8, 0, c1, c2); break;
      case 'coil': drawCoil(ctx, S, c1); break;
      case 'pcb': drawPcb(ctx, S, c1, c2); break;
      case 'rods': drawRods(ctx, S, c1); break;
      case 'tube': drawTube(ctx, S, c1, c2); break;
      case 'flask': drawFlask(ctx, S, c1); break;
      case 'gun': drawGun(ctx, S, c1); break;
      case 'magazine': drawMagazine(ctx, S, c1, c2); break;
      case 'tool': drawTool(ctx, S, c1); break;
      default: rectBevel(ctx, S * 0.12, S * 0.12, S * 0.76, S * 0.76, c1, { dark: c2 });
    }
  }

  var itemCache = new Map();
  var itemURLCache = new Map();
  // F.sprites.item(id, size=32) -> canvas (ARCHITECTURE §16), cached per (id,size).
  F.sprites.item = function (id, size) {
    if (!F.sprites.enabled) return stub();
    size = size || 32;
    var key = id + '|' + size;
    var c = itemCache.get(key);
    if (c) return c;
    var def = F.data.items[id];
    if (!def) { F.log.warn('[sprites] unknown item id: ' + id); return stub(size, size); }
    c = newCanvas(size, size);
    var ctx = ctxOf(c);
    if (def.place) {
      var src = F.sprites.entity(def.place, 0, 0);
      var scale = Math.min(size * 0.92 / src.width, size * 0.92 / src.height);
      var dw = src.width * scale, dh = src.height * scale;
      ctx.drawImage(src, (size - dw) / 2, (size - dh) / 2, dw, dh);
    } else {
      paintItemIcon(ctx, size, def);
    }
    itemCache.set(key, c);
    return c;
  };
  // F.sprites.itemURL(id) -> cached data URL (ARCHITECTURE §16), for CSS backgrounds in the DOM
  // UI. Always drawn on a real <canvas> (not OffscreenCanvas, which lacks a sync toDataURL) —
  // only reached when F.sprites.enabled, so `document` is a genuine DOM per the headless contract.
  F.sprites.itemURL = function (id) {
    if (!F.sprites.enabled) return '';
    if (itemURLCache.has(id)) return itemURLCache.get(id);
    var def = F.data.items[id];
    var url = '';
    try {
      var c = document.createElement('canvas'); c.width = 32; c.height = 32;
      var ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;
      if (def && def.place) {
        var src = F.sprites.entity(def.place, 0, 0);
        var scale = Math.min(32 * 0.92 / src.width, 32 * 0.92 / src.height);
        var dw = src.width * scale, dh = src.height * scale;
        ctx.drawImage(src, (32 - dw) / 2, (32 - dh) / 2, dw, dh);
      } else if (def) {
        paintItemIcon(ctx, 32, def);
      }
      url = c.toDataURL('image/png');
    } catch (e) { F.log.warn('[sprites] itemURL failed for ' + id, e); url = ''; }
    itemURLCache.set(id, url);
    return url;
  };

  // ---------------------------------------------------------------------
  // Fluid icons (design/EXPANSION.md §6.5): a generic glossy droplet in a fluid's colours, used
  // by UI tooltips / recipe pickers for any fluid id (existing water/steam or new expansion
  // fluids). Reads F.data.fluids[id].color/color2 when present; falls back to grey so this still
  // draws something sane if the data module hasn't defined that fluid (or loads later).
  // ---------------------------------------------------------------------
  function drawFluidDroplet(ctx, S, c1, c2) {
    var cx = S * 0.5, topY = S * 0.1, r = S * 0.33, cy = S * 0.6;
    ctx.save();
    var grad = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.08, cx, cy, r * 1.15);
    grad.addColorStop(0, lighten(c1, 35));
    grad.addColorStop(0.55, c1);
    grad.addColorStop(1, darken(c1, 25));
    ctx.beginPath();
    ctx.moveTo(cx, topY);
    ctx.bezierCurveTo(cx + r * 1.15, cy - r * 0.75, cx + r, cy + r * 0.35, cx, cy + r);
    ctx.bezierCurveTo(cx - r, cy + r * 0.35, cx - r * 1.15, cy - r * 0.75, cx, topY);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = darken(c2 || c1, 30);
    ctx.lineWidth = Math.max(1, S * 0.035);
    ctx.stroke();
    // glossy highlight
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = c2 || lighten(c1, 40);
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.32, cy - r * 0.08, r * 0.22, r * 0.34, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.restore();
  }
  function fluidColors(fluidId) {
    var fdef = (F.data.fluids && F.data.fluids[fluidId]) || null;
    var c1 = (fdef && fdef.color) || '#7A8288';
    var c2 = (fdef && fdef.color2) || lighten(c1, 30);
    return [c1, c2];
  }
  var fluidIconCache = new Map();
  // F.sprites.fluidIcon(fluidId, size=32) -> canvas (design/EXPANSION.md §6.5), cached per (id,size).
  F.sprites.fluidIcon = function (fluidId, size) {
    if (!F.sprites.enabled) return stub();
    size = size || 32;
    var key = fluidId + '|' + size;
    var c = fluidIconCache.get(key);
    if (c) return c;
    var col = fluidColors(fluidId);
    c = newCanvas(size, size);
    drawFluidDroplet(ctxOf(c), size, col[0], col[1]);
    fluidIconCache.set(key, c);
    return c;
  };
  var fluidIconURLCache = new Map();
  // F.sprites.fluidIconURL(fluidId) -> cached data URL (design/EXPANSION.md §6.5), for CSS
  // backgrounds in the DOM UI — same real-<canvas>-only pattern as F.sprites.itemURL.
  F.sprites.fluidIconURL = function (fluidId) {
    if (!F.sprites.enabled) return '';
    if (fluidIconURLCache.has(fluidId)) return fluidIconURLCache.get(fluidId);
    var url = '';
    try {
      var c = document.createElement('canvas'); c.width = 32; c.height = 32;
      var ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;
      var col = fluidColors(fluidId);
      drawFluidDroplet(ctx, 32, col[0], col[1]);
      url = c.toDataURL('image/png');
    } catch (e) { F.log.warn('[sprites] fluidIconURL failed for ' + fluidId, e); url = ''; }
    fluidIconURLCache.set(fluidId, url);
    return url;
  };

  // ---------------------------------------------------------------------
  // Terrain tiles (GDD §11.3 / §2.4; ids per ARCHITECTURE §5's F.world.TERRAIN enum: 0 deep
  // water, 1 water, 2-4 grass1-3, 5-6 dirt1-2, 7-8 sand1-2, 9 red desert — 10 ids; index 10 is
  // an extra "out-of-map" tile (GDD §2.4 id 0) sprites also supports, 11 ids total). Reads
  // F.world.TERRAIN_COLOR at draw time when that module is loaded (single source of truth for
  // fill hue); falls back to a local palette so this module also works in isolation.
  // ---------------------------------------------------------------------
  var TERRAIN_PALETTE = [
    '#143A55', '#1F4F6E', '#6E8A3A', '#5F6B3C', '#5B7A33', '#4E6A2C',
    '#9A7B55', '#86694A', '#C2A66B', '#AD915B', '#A87246',
  ];
  // Terrain-id families per 10-world.js's TERRAIN enum (this module never edits world data,
  // only reads it — these groupings just pick which cosmetic detail (tuft/pebble/crack) a
  // given id gets). 0-1 water, 2-5 grass(dry/normal), 6-7 dirt, 8-9 sand, 10 red desert.
  function terrainFamily(id) {
    if (id < 2) return 'water';
    if (id < 6) return 'grass';
    if (id < 8) return 'dirt';
    if (id < 10) return 'sand';
    return 'desert';
  }
  function terrainFill(id) {
    try { if (F.world && F.world.TERRAIN_COLOR && F.world.TERRAIN_COLOR[id]) return F.world.TERRAIN_COLOR[id]; } catch (e) { /* module not loaded yet */ }
    return TERRAIN_PALETTE[F.util.clamp(id | 0, 0, TERRAIN_PALETTE.length - 1)];
  }
  // F.sprites.terrainColor(id) -> softened hex fill colour (additive helper, ARCHITECTURE §16
  // lists only terrainTile/ore/tree/rock — this is a small extra export consumed by
  // 61-render.js's cross-tile edge blending so both modules agree on the calmed palette).
  F.sprites.terrainColor = function (id) {
    id = F.util.clamp(id | 0, 0, TERRAIN_PALETTE.length - 1);
    return softenTerrain(terrainFill(id), id < 2);
  };
  F.sprites.terrainIsWater = function (id) { return (id | 0) < 2; };

  var terrainCache = new Map();
  var TERRAIN_VARIANTS = 8; // more variants than the old 4 -> less obvious per-tile repetition
  F.sprites.terrainTile = function (terrainId, variant) {
    if (!F.sprites.enabled) return stub();
    terrainId = F.util.clamp(terrainId | 0, 0, TERRAIN_PALETTE.length - 1);
    variant = ((variant | 0) % TERRAIN_VARIANTS + TERRAIN_VARIANTS) % TERRAIN_VARIANTS;
    var key = terrainId + '|' + variant;
    var c = terrainCache.get(key);
    if (c) return c;
    var S = PX;
    c = newCanvas(S, S);
    var ctx = ctxOf(c);
    var water = terrainId < 2;
    var fam = terrainFamily(terrainId);
    var fill = softenTerrain(terrainFill(terrainId), water);
    var rng = F.rng.local(terrainId, variant, 4177);

    if (water) {
      // Depth shading: soft vertical gradient (GDD "depth shading") baked once per tile.
      var deep = terrainId === 0;
      var top = lighten(fill, deep ? 5 : 9), bot = darken(fill, deep ? 10 : 6);
      var grad = ctx.createLinearGradient(0, 0, 0, S);
      grad.addColorStop(0, top); grad.addColorStop(1, bot);
      ctx.fillStyle = grad; ctx.fillRect(0, 0, S, S);
      // gentle mottling so open water isn't a perfectly flat gradient
      var wr = 3 + Math.floor(rng() * 3);
      for (var wi = 0; wi < wr; wi++) {
        ctx.fillStyle = rng() < 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.05)';
        var wcx = rng() * S, wcy = rng() * S, wr2 = S * (0.18 + rng() * 0.22);
        ctx.beginPath(); ctx.ellipse(wcx, wcy, wr2, wr2 * 0.5, rng() * Math.PI, 0, Math.PI * 2); ctx.fill();
      }
      // ripple strokes (kept subtle; the animated shimmer overlay in 61-render.js adds motion)
      ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = Math.max(1, S * 0.025);
      for (var i = 0; i < 3; i++) {
        var y = S * (0.18 + i * 0.3) + rng() * S * 0.06;
        ctx.beginPath(); ctx.moveTo(0, y);
        for (var x = 0; x <= S; x += S / 10) ctx.lineTo(x, y + Math.sin(x * 0.22 + i + rng()) * S * 0.02);
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = fill; ctx.fillRect(0, 0, S, S);
      var speckLight = lighten(fill, 14), speckDark = darken(fill, 16);
      // Soft low-frequency mottling blobs first (breaks up flat colour at a larger scale than
      // the fine flecks below — this is the "sub-tile noise" the task brief asks for).
      var nb = 3 + Math.floor(rng() * 3);
      for (var b = 0; b < nb; b++) {
        var bx = rng() * S, by = rng() * S, br = S * (0.22 + rng() * 0.3);
        var bg = ctx.createRadialGradient(bx, by, 0, bx, by, br);
        var bc = rng() < 0.5 ? speckLight : speckDark;
        bg.addColorStop(0, bc); bg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.save(); ctx.globalAlpha = 0.10 + rng() * 0.08; ctx.fillStyle = bg;
        ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }
      // fine flecks (GDD §11.3 "slightly lighter/darker shade")
      var n = 7 + Math.floor(rng() * 6);
      for (var j = 0; j < n; j++) {
        var sx = rng() * S, sy = rng() * S, sw = 1 + rng() * 2.2;
        ctx.fillStyle = rng() < 0.5 ? speckLight : speckDark;
        ctx.globalAlpha = 0.5 + rng() * 0.35;
        ctx.fillRect(sx, sy, sw, sw);
      }
      ctx.globalAlpha = 1;
      // Family-specific detail (task brief: pebbles, grass tufts, cracks).
      if (fam === 'grass') {
        var tufts = 3 + Math.floor(rng() * 3);
        ctx.strokeStyle = darken(fill, 30); ctx.lineWidth = Math.max(1, S * 0.02); ctx.lineCap = 'round';
        for (var t = 0; t < tufts; t++) {
          var tx0 = rng() * S, ty0 = rng() * S;
          for (var bl = -1; bl <= 1; bl += 2) {
            ctx.beginPath(); ctx.moveTo(tx0, ty0);
            ctx.quadraticCurveTo(tx0 + bl * S * 0.05, ty0 - S * 0.06, tx0 + bl * S * 0.03, ty0 - S * 0.11);
            ctx.stroke();
          }
        }
      } else if (fam === 'dirt' || fam === 'desert') {
        var cracks = 1 + Math.floor(rng() * 2);
        ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = Math.max(1, S * 0.012);
        for (var cr = 0; cr < cracks; cr++) {
          var px = rng() * S, py = rng() * S;
          ctx.beginPath(); ctx.moveTo(px, py);
          var segs = 2 + Math.floor(rng() * 2);
          for (var sgi = 0; sgi < segs; sgi++) { px += (rng() - 0.5) * S * 0.22; py += (rng() - 0.5) * S * 0.22; ctx.lineTo(px, py); }
          ctx.stroke();
        }
        var pebbles = fam === 'sand' ? 0 : 2 + Math.floor(rng() * 2);
        drawPebbles(ctx, S, rng, pebbles, fill);
      }
      if (fam === 'sand') drawPebbles(ctx, S, rng, 3 + Math.floor(rng() * 3), fill);
    }
    terrainCache.set(key, c);
    return c;
  };
  // Small round pebbles with a tiny highlight — reused by sand/dirt/desert tiles.
  function drawPebbles(ctx, S, rng, count, base) {
    for (var i = 0; i < count; i++) {
      var x = rng() * S, y = rng() * S, r = S * (0.02 + rng() * 0.025);
      ctx.fillStyle = darken(base, 30); ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.75, rng() * Math.PI, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = lighten(base, 25); ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.35, 0, Math.PI * 2); ctx.fill();
    }
  }

  // Ore overlay (GDD §11.3/§2.5.4): res 1..4 (iron/copper/coal/stone per F.world.RES); dot count
  // n = clamp(12 - stage, 2, 12) generalises GDD's 8-threshold stage table to any stage value a
  // caller passes (see report "assumptions").
  var RES_COLOR = { 1: ['#6C8399', '#9FB3C4'], 2: ['#C9662F', '#E8925A'], 3: ['#1E1E1E', '#4A4F5A'], 4: ['#A8956B', '#D2C39A'] };
  var oreCache = new Map();
  // F.sprites.defineOre(resIndex, fn(ctx, S, stage, variant)) — registry for resource tile art
  // beyond the 4 built-in ids (design/EXPANSION.md §6.5, e.g. crude-oil well = res 5). `S` is the
  // full 1.5-tile canvas size (same one F.sprites.ore always allocates, for cache-shape
  // consistency); painters for single-tile resources (wells) should draw centred and NOT
  // overhang past the middle 1-tile square, unlike the built-in overlapping ore chunk art.
  var ORE_PAINTERS = {};
  F.sprites.defineOre = function (resIndex, fn) {
    ORE_PAINTERS[resIndex] = fn;
    oreCache.clear();
  };
  // Dense clustered rock chunks (task brief problem #2: "sparse little dots" -> "dense ore
  // clusters ... several shaded rock chunks with highlights, amount-dependent density").
  // Chunks are jittered polygons (reusing fillPoly) with a dark undershadow + lit facet each,
  // clustered with a per-ore Gaussian-ish spread around the tile centre rather than uniform
  // scatter, so a rich patch reads as a "deposit" instead of confetti.
  // Ore: the canvas is 1.5 tiles (drawn centred on the tile, overhanging 0.25 tile on each
  // side) so neighbouring tiles' chunks overlap and a patch reads as one continuous field.
  // 4 layout variants per (res, stage), picked per tile by the renderer.
  F.sprites.ore = function (res, stage, variant) {
    if (!F.sprites.enabled) return stub();
    variant = (variant | 0) & 3;
    var key = res + '|' + stage + '|' + variant;
    var c = oreCache.get(key);
    if (c) return c;
    var S = Math.round(PX * 1.5), M = (S - PX) / 2;
    c = newCanvas(S, S);
    var ctx = ctxOf(c);
    var custom = ORE_PAINTERS[res];
    if (custom) {
      try { custom(ctx, S, stage | 0, variant); }
      catch (err) { F.log.error('[sprites] defineOre painter failed for res ' + res, err); }
      oreCache.set(key, c);
      return c;
    }
    var pal = RES_COLOR[res];
    if (pal) {
      var st = stage | 0;
      var n = [9, 8, 6, 4, 2][F.util.clamp(st, 0, 4)];
      var rng = F.rng.local((res | 0) * 7 + variant, st, 8191);
      var coal = res === 3;
      var pts = [];
      for (var i = 0; i < n; i++) {
        // stratified over a 3x3 grid inside the tile, jittered so chunks reach the tile edges
        var cell = (i * 4 + variant * 2) % 9;
        pts.push([M + ((cell % 3) + rng()) / 3 * PX, M + (Math.floor(cell / 3) + rng()) / 3 * PX, PX * (0.11 + rng() * 0.07 - st * 0.008)]);
      }
      pts.sort(function (a, b) { return a[1] - b[1]; });
      for (var j = 0; j < pts.length; j++) {
        var x = pts[j][0], y = pts[j][1], r = pts[j][2];
        ctx.save(); ctx.globalAlpha = 0.32; ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.ellipse(x + r * 0.3, y + r * 0.35, r * 1.1, r * 0.75, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        ctx.fillStyle = darken(pal[0], 25);
        fillPoly(ctx, x, y, r, 6, rng() * Math.PI, rng);
        ctx.fillStyle = pal[0];
        fillPoly(ctx, x - r * 0.12, y - r * 0.12, r * 0.82, 6, rng() * Math.PI, rng);
        ctx.fillStyle = pal[1];
        fillPoly(ctx, x - r * 0.32, y - r * 0.32, r * 0.4, 5, rng() * Math.PI, rng);
        if (coal) {
          ctx.save(); ctx.globalAlpha = 0.55; ctx.strokeStyle = '#8892A0'; ctx.lineWidth = Math.max(1, r * 0.16);
          ctx.beginPath(); ctx.moveTo(x - r * 0.35, y - r * 0.05); ctx.lineTo(x + r * 0.15, y - r * 0.5); ctx.stroke();
          ctx.restore();
        }
      }
    } else {
      // Unknown resource id with neither a built-in palette nor a registered defineOre painter
      // (design/EXPANSION.md §6.5 "default fallback for unknown res = dark blob"): a single soft
      // dark blob, centred and not overhanging (consistent with the single-tile convention above).
      ctx.save(); ctx.globalAlpha = 0.4; ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.ellipse(S / 2 + PX * 0.05, S / 2 + PX * 0.06, PX * 0.3, PX * 0.22, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#241F1A';
      fillPoly(ctx, S / 2, S / 2, PX * 0.26, 7, 0.4, F.rng.local(res | 0, 0, 55));
      ctx.fillStyle = '#3A332C';
      fillPoly(ctx, S / 2 - PX * 0.06, S / 2 - PX * 0.06, PX * 0.12, 5, 1.1, F.rng.local(res | 0, 1, 55));
    }
    oreCache.set(key, c);
    return c;
  };

  // Trees: 4 variants (grass / dry-dirt / sparse desert / dead) per GDD §2.6 canopy palette.
  var treeCache = new Map();
  var TREE_PALETTES = [
    { trunk: '#6B4B2A', canopy: ['#3D7A3A', '#4E8A44', '#5B9A4C'] },
    { trunk: '#6B4B2A', canopy: ['#6B903E', '#778030', '#8A9A40'] },
    { trunk: '#5A4020', canopy: ['#9A7120', '#59452A'] },
    { trunk: '#6B553E', canopy: null },
  ];
  F.sprites.tree = function (variant) {
    if (!F.sprites.enabled) return stub();
    variant = ((variant | 0) % TREE_PALETTES.length + TREE_PALETTES.length) % TREE_PALETTES.length;
    var c = treeCache.get(variant);
    if (c) return c;
    var W = PX, H = Math.round(PX * 1.4);
    c = newCanvas(W, H);
    var ctx = ctxOf(c);
    var p = TREE_PALETTES[variant];
    // Soft drop shadow: radial gradient blob (not a flat ellipse) so it reads as diffuse
    // ground shadow rather than a hard silhouette (task brief "soft drop shadow").
    var shx = W * 0.56, shy = H * 0.92;
    var shg = ctx.createRadialGradient(shx, shy, 0, shx, shy, W * 0.34);
    shg.addColorStop(0, 'rgba(0,0,0,0.38)'); shg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save(); ctx.fillStyle = shg;
    ctx.beginPath(); ctx.ellipse(shx, shy, W * 0.34, H * 0.075, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    ctx.fillStyle = p.trunk; ctx.fillRect(W * 0.44, H * 0.55, W * 0.12, H * 0.4);
    ctx.strokeStyle = '#141414'; ctx.lineWidth = 1.5; ctx.strokeRect(W * 0.44, H * 0.55, W * 0.12, H * 0.4);
    if (p.canopy) {
      p.canopy.forEach(function (col, i) {
        var ccx = W * (0.5 + (i - 1) * 0.12), ccy = H * (0.32 - i * 0.03), crx = W * 0.34, cry = H * 0.24;
        // radial-gradient shaded lobe (lit upper-left, darker lower-right) instead of a flat
        // fill, so the canopy reads as a rounded volume (task brief "canopy with shading").
        var cg = ctx.createRadialGradient(ccx - crx * 0.3, ccy - cry * 0.35, crx * 0.1, ccx, ccy, crx * 1.1);
        cg.addColorStop(0, lighten(col, 22)); cg.addColorStop(0.55, col); cg.addColorStop(1, darken(col, 18));
        ctx.fillStyle = cg;
        ctx.beginPath(); ctx.ellipse(ccx, ccy, crx, cry, 0, 0, Math.PI * 2); ctx.fill();
      });
      ctx.strokeStyle = darken(p.canopy[p.canopy.length - 1], 30); ctx.lineWidth = 2; ctx.stroke();
    } else {
      ctx.strokeStyle = '#4A3826'; ctx.lineWidth = Math.max(1, W * 0.04);
      for (var i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(W * 0.5, H * 0.55); ctx.lineTo(W * (0.3 + i * 0.2), H * (0.35 - i * 0.05)); ctx.stroke(); }
    }
    treeCache.set(variant, c);
    return c;
  };

  // Rocks: 'big' (2x2) or 'huge' (3x2) — 3-5 overlapping grey-brown polygons, lighter top facet.
  var rockCache = new Map();
  F.sprites.rock = function (kind) {
    if (!F.sprites.enabled) return stub();
    kind = (kind === 'huge') ? 'huge' : 'big';
    var c = rockCache.get(kind);
    if (c) return c;
    var wTiles = kind === 'huge' ? 3 : 2, hTiles = 2;
    var W = wTiles * PX, H = hTiles * PX;
    c = newCanvas(W, H);
    var ctx = ctxOf(c);
    var rng = F.rng.local(kind === 'huge' ? 99 : 11, 7, 3);
    var n = kind === 'huge' ? 5 : 4;
    // Soft ground shadow first (drop shadow, task brief "rocks with shading").
    var shg = ctx.createRadialGradient(W * 0.55, H * 0.62, 0, W * 0.55, H * 0.62, W * 0.4);
    shg.addColorStop(0, 'rgba(0,0,0,0.4)'); shg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save(); ctx.fillStyle = shg;
    ctx.beginPath(); ctx.ellipse(W * 0.55, H * 0.62, W * 0.4, H * 0.24, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    for (var i = 0; i < n; i++) {
      var cx = W * (0.22 + rng() * 0.56), cy = H * (0.3 + rng() * 0.5), r = Math.min(W, H) * (0.2 + rng() * 0.15);
      var base = i % 2 ? '#81694E' : '#6A5640';
      // radial-gradient facet (light from top-left) instead of a flat fill, matching the
      // building bevel convention used everywhere else in this module.
      var fg = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r * 1.15);
      fg.addColorStop(0, lighten(base, 22)); fg.addColorStop(0.6, base); fg.addColorStop(1, darken(base, 22));
      ctx.fillStyle = fg;
      fillPoly(ctx, cx, cy, r, 5 + Math.floor(rng() * 3), rng() * Math.PI, rng);
    }
    ctx.fillStyle = '#9C8564';
    ctx.beginPath(); ctx.ellipse(W * 0.4, H * 0.32, W * 0.12, H * 0.07, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#141414'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(W * 0.5, H * 0.55, W * 0.36, H * 0.3, 0, 0, Math.PI * 2); ctx.stroke();
    rockCache.set(kind, c);
    return c;
  };

  // Units (biters): 3 sizes/colours (small/medium/big), 4 leg-animation frames.
  var unitCache = new Map();
  var UNIT_STATS = {
    'small-biter': { scale: 0.5, color: '#8B2E2E' },
    'medium-biter': { scale: 0.7, color: '#A33C2A' },
    'big-biter': { scale: 1.0, color: '#6E2A6E' },
  };
  F.sprites.unit = function (type, frame) {
    if (!F.sprites.enabled) return stub();
    frame = ((frame | 0) % 4 + 4) % 4;
    var key = type + '|' + frame;
    var c = unitCache.get(key);
    if (c) return c;
    var st = UNIT_STATS[type] || UNIT_STATS['small-biter'];
    var S = Math.round(PX * Math.max(0.6, st.scale));
    c = newCanvas(S, S);
    var ctx = ctxOf(c);
    ctx.save(); ctx.translate(S / 2, S / 2);
    var legPhase = frame / 4 * Math.PI * 2;
    ctx.strokeStyle = darken(st.color, 20); ctx.lineWidth = Math.max(1, S * 0.05);
    for (var i = 0; i < 6; i++) {
      var side = i < 3 ? -1 : 1, idx = i % 3;
      var ly = S * (-0.2 + idx * 0.2) + Math.sin(legPhase + i) * S * 0.05;
      var lx = side * S * 0.32;
      ctx.beginPath(); ctx.moveTo(0, ly * 0.4); ctx.lineTo(lx, ly); ctx.stroke();
    }
    ctx.fillStyle = st.color; ctx.beginPath(); ctx.ellipse(0, 0, S * 0.28, S * 0.4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#141414'; ctx.lineWidth = 2; ctx.stroke();
    ctx.strokeStyle = lighten(st.color, 30); ctx.lineWidth = Math.max(1, S * 0.04);
    ctx.beginPath(); ctx.moveTo(-S * 0.08, -S * 0.36); ctx.lineTo(-S * 0.16, -S * 0.48); ctx.moveTo(S * 0.08, -S * 0.36); ctx.lineTo(S * 0.16, -S * 0.48); ctx.stroke();
    ctx.restore();
    unitCache.set(key, c);
    return c;
  };

  // Player (GDD §11.4): a stocky engineer in an orange suit with grey armour plates, helmet
  // with visor and a backpack, seen top-down 3/4. Frame 0 is the standing pose, frames 1..8 a
  // walk cycle (swinging leg lifts, arms swing opposite, body bobs). Parts are posed from a
  // small skeleton (hips/knees/feet, shoulders/elbows/hands) and drawn as outlined, shaded
  // shapes. The canvas is 0.6:1 (width:height) and must be drawn at that aspect; the feet sit
  // at 93% of its height.
  var playerCache = new Map();
  var PLAYER_FRAMES = 9; // 0 = standing, 1..8 = walk cycle
  var PC = {
    suit: '#D9862C', suitDark: '#9E5716', armour: '#56585A', armourDark: '#34363A',
    helmet: '#6A6B6C', visor: '#14212A', glove: '#2A2724', boot: '#26231F', pack: '#4A4B4D', line: '#141414',
  };
  F.sprites.player = function (dir, frame) {
    if (!F.sprites.enabled) return stub();
    dir = ((dir | 0) % 4 + 4) % 4; frame = ((frame | 0) % PLAYER_FRAMES + PLAYER_FRAMES) % PLAYER_FRAMES;
    var key = dir + '|' + frame;
    var c = playerCache.get(key);
    if (c) return c;
    var H = Math.round(PX * 2.1), W = Math.round(H * 0.6);
    c = newCanvas(W, H);
    var ctx = c.getContext('2d');
    var u = H / 100, cx = W / 2;
    var walking = frame > 0, phi = (frame - 1) / 8 * Math.PI * 2;
    var bob = walking ? (1 - Math.abs(Math.sin(phi))) * 1.2 * u : 0; // highest when passing, lowest at contact
    var side = dir === 1 || dir === 3;
    if (dir === 3) { ctx.translate(W, 0); ctx.scale(-1, 1); }

    function outlined(pathFn, fill, lw) {
      pathFn(); ctx.strokeStyle = PC.line; ctx.lineWidth = lw || 1.6 * u; ctx.lineJoin = 'round'; ctx.stroke();
      pathFn(); ctx.fillStyle = fill; ctx.fill();
    }
    function limb(x1, y1, x2, y2, w, color) {
      ctx.lineCap = 'round';
      ctx.strokeStyle = PC.line; ctx.lineWidth = w + 1.6 * u;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.strokeStyle = color; ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      // lit edge
      ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = w * 0.3;
      ctx.beginPath(); ctx.moveTo(x1 - w * 0.2, y1); ctx.lineTo(x2 - w * 0.2, y2); ctx.stroke();
    }
    function ellipse(x, y, rx, ry, fill, rot) {
      outlined(function () { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot || 0, 0, Math.PI * 2); }, fill);
    }
    function rrect(x, y, w, h, r, fill) {
      outlined(function () { roundRectPath(ctx, x, y, w, h, r); }, fill);
    }
    function vgrad(y0, y1, a, b) { var g = ctx.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, a); g.addColorStop(1, b); return g; }
    function hgrad(x0, x1, a, b) { var g = ctx.createLinearGradient(x0, 0, x1, 0); g.addColorStop(0, a); g.addColorStop(1, b); return g; }

    // leg state for phase psi: forward -1..1 (towards facing), lift while swinging forward
    function leg(psi) { return walking ? { fwd: Math.sin(psi), lift: Math.max(0, Math.cos(psi)) * 3.2 * u } : { fwd: 0, lift: 0 }; }
    var legL = leg(phi), legR = leg(phi + Math.PI);

    // ground shadow
    var shg = ctx.createRadialGradient(cx, 93 * u, 0, cx, 93 * u, 22 * u);
    shg.addColorStop(0, 'rgba(0,0,0,0.42)'); shg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = shg; ctx.beginPath(); ctx.ellipse(cx, 93 * u, 22 * u, 5 * u, 0, 0, Math.PI * 2); ctx.fill();

    ctx.save(); ctx.translate(0, -bob);
    if (!side) drawFrontBack(dir === 2); else drawSide();
    ctx.restore();
    playerCache.set(key, c);
    return c;

    function drawLegFB(hx, l, facingCam) {
      var fy = 91 * u + bob + (facingCam ? 1 : -1) * l.fwd * 1.8 * u - l.lift;
      var fx = hx + (hx - cx) * 0.1;
      var ky = (63 * u + fy) / 2 - l.lift * 0.3;
      limb(hx, 63 * u, fx, ky, 10.5 * u, darken(PC.suit, 14));
      limb(fx, ky, fx, fy - 2.5 * u, 9.5 * u, PC.suit);
      if (facingCam) rrect(fx - 4.2 * u, ky - 2.2 * u, 8.4 * u, 4.4 * u, 1.6 * u, vgrad(ky - 2 * u, ky + 2 * u, lighten(PC.armour, 22), PC.armourDark)); // knee pad
      var s = 1 + (facingCam ? 1 : -1) * l.fwd * 0.08;
      ellipse(fx, fy, 6 * u * s, 3.8 * u * s, PC.boot);
    }
    function drawArmFB(sx, l, facingCam) {
      var fwd = -l.fwd; // arms swing opposite the leg on the same side
      var hy = 56 * u + (facingCam ? 1 : -1) * fwd * 2.4 * u, hx = sx + (sx - cx) * 0.18;
      var ey = (37 * u + hy) / 2;
      limb(sx, 37 * u, hx, ey, 7 * u, PC.suit);
      limb(hx, ey, hx, hy, 6.5 * u, PC.armour);
      ellipse(hx, hy + 1 * u, 4.3 * u, 4 * u, PC.glove);
    }
    function drawFrontBack(front) {
      var lx = cx - 6 * u, rx = cx + 6 * u;
      // backpack edges peek out behind the shoulders (front) — the pack itself when seen from behind
      if (front) { rrect(cx - 18 * u, 32 * u, 36 * u, 22 * u, 4 * u, PC.pack); }
      drawLegFB(lx, legL, front); drawLegFB(rx, legR, front);
      // torso
      outlined(function () {
        ctx.beginPath();
        ctx.moveTo(cx - 15 * u, 32 * u); ctx.lineTo(cx + 15 * u, 32 * u);
        ctx.quadraticCurveTo(cx + 17 * u, 45 * u, cx + 13.5 * u, 64 * u);
        ctx.lineTo(cx - 13.5 * u, 64 * u);
        ctx.quadraticCurveTo(cx - 17 * u, 45 * u, cx - 15 * u, 32 * u); ctx.closePath();
      }, hgrad(cx - 16 * u, cx + 16 * u, lighten(PC.suit, 18), PC.suitDark));
      if (front) {
        // chest plate + belt + buckle
        rrect(cx - 9 * u, 35 * u, 18 * u, 13 * u, 3 * u, vgrad(35 * u, 48 * u, lighten(PC.armour, 20), PC.armourDark));
        ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(cx - 7 * u, 37 * u, 5 * u, 1.2 * u);
        ctx.fillStyle = '#3FA7D6'; ctx.fillRect(cx + 3 * u, 40 * u, 3 * u, 2 * u);
      } else {
        // backpack with vents and a status light
        rrect(cx - 13 * u, 33 * u, 26 * u, 25 * u, 4 * u, vgrad(33 * u, 58 * u, lighten(PC.pack, 18), darken(PC.pack, 18)));
        for (var v = 0; v < 3; v++) { ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(cx - 9 * u, (38 + v * 4) * u, 18 * u, 1.5 * u); }
        ctx.fillStyle = '#3FA7D6'; ctx.fillRect(cx - 2 * u, 51 * u, 4 * u, 2.5 * u);
      }
      rrect(cx - 12.5 * u, 60 * u, 25 * u, 7 * u, 3 * u, vgrad(60 * u, 67 * u, lighten(PC.armour, 12), PC.armourDark));
      rrect(cx - 13.5 * u, 57 * u, 27 * u, 4.5 * u, 1.2 * u, '#2E2A24');
      if (front) rrect(cx - 2.5 * u, 57.5 * u, 5 * u, 3.5 * u, 0.8 * u, '#B8B0A0');
      rrect(cx + (front ? 6 : -11) * u, 58 * u, 5 * u, 6 * u, 1.2 * u, '#6A5238'); // tool pouch
      drawArmFB(cx - 15.5 * u, legL, front); drawArmFB(cx + 15.5 * u, legR, front);
      // shoulder pads
      ellipse(cx - 13.5 * u, 33 * u, 7 * u, 4.5 * u, vgrad(28 * u, 37 * u, lighten(PC.armour, 24), PC.armourDark), -0.25);
      ellipse(cx + 13.5 * u, 33 * u, 7 * u, 4.5 * u, vgrad(28 * u, 37 * u, lighten(PC.armour, 24), PC.armourDark), 0.25);
      // collar + helmet
      rrect(cx - 7.5 * u, 26 * u, 15 * u, 7 * u, 2.5 * u, PC.armourDark);
      var hy = 19 * u, hr = 11 * u;
      ellipse(cx, hy, hr, hr * 1.02, (function () { var g = ctx.createRadialGradient(cx - hr * 0.4, hy - hr * 0.45, hr * 0.1, cx, hy, hr); g.addColorStop(0, lighten(PC.helmet, 40)); g.addColorStop(1, darken(PC.helmet, 25)); return g; })());
      if (front) {
        rrect(cx - 8.8 * u, hy - 3 * u, 17.6 * u, 8.5 * u, 3.5 * u, vgrad(hy - 3 * u, hy + 5.5 * u, '#26404E', PC.visor));
        ctx.fillStyle = 'rgba(160,220,245,0.7)'; ctx.fillRect(cx - 6.5 * u, hy - 1.5 * u, 5 * u, 1.3 * u);
        ctx.fillStyle = 'rgba(160,220,245,0.35)'; ctx.fillRect(cx - 0.5 * u, hy - 1.5 * u, 2 * u, 1.3 * u);
        ctx.fillStyle = PC.suit; ctx.fillRect(cx - 1.2 * u, hy - hr * 0.95, 2.4 * u, 5 * u); // stripe
      } else {
        ctx.fillStyle = darken(PC.helmet, 18); ctx.fillRect(cx - 1.4 * u, hy - hr * 0.95, 2.8 * u, hr * 1.7);
        ctx.fillStyle = PC.suit; ctx.fillRect(cx - 1.2 * u, hy - hr * 0.95, 2.4 * u, 5 * u);
      }
    }
    function drawSide() {
      var hipX = cx - 0.5 * u;
      function sideLeg(l, far) {
        var fx = hipX + l.fwd * 7 * u, fy = 91 * u + bob - l.lift;
        var kx = (hipX + fx) / 2 + 2 * u + l.lift * 0.4, ky = (63 * u + fy) / 2 - l.lift * 0.2;
        var col = far ? darken(PC.suit, 38) : PC.suit;
        limb(hipX, 63 * u, kx, ky, 10.5 * u, far ? darken(PC.suit, 50) : darken(PC.suit, 14));
        limb(kx, ky, fx, fy - 2.5 * u, 9.5 * u, col);
        if (!far) rrect(kx - 0.5 * u, ky - 3 * u, 4.5 * u, 6 * u, 1.6 * u, hgrad(kx, kx + 4 * u, PC.armourDark, lighten(PC.armour, 20)));
        outlined(function () { roundRectPath(ctx, fx - 4.5 * u, fy - 3 * u, 11 * u, 5.5 * u, 2.2 * u); }, far ? '#191715' : PC.boot);
      }
      function sideArm(l, far) {
        var sx = cx - 2.5 * u, fwd = -l.fwd, hx = sx + fwd * 7 * u, hy = 55 * u - Math.abs(fwd) * 1.5 * u;
        var ex = (sx + hx) / 2 - 0.8 * u, ey = (37 * u + hy) / 2 + 1 * u;
        limb(sx, 37 * u, ex, ey, 6.8 * u, far ? darken(PC.suit, 38) : PC.suit);
        limb(ex, ey, hx, hy, 6.2 * u, far ? darken(PC.armour, 20) : PC.armour);
        ellipse(hx, hy + 0.8 * u, 4.1 * u, 3.8 * u, PC.glove);
      }
      sideArm(legR, true); sideLeg(legR, true);
      // backpack (behind = left when facing east)
      rrect(cx - 17 * u, 32 * u, 11 * u, 26 * u, 3 * u, hgrad(cx - 17 * u, cx - 6 * u, darken(PC.pack, 10), lighten(PC.pack, 14)));
      for (var sv = 0; sv < 3; sv++) { ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(cx - 15 * u, (37 + sv * 4) * u, 7 * u, 1.4 * u); }
      ctx.fillStyle = '#3FA7D6'; ctx.fillRect(cx - 15.5 * u, 51 * u, 2 * u, 3 * u);
      sideLeg(legL, false);
      // torso (profile)
      outlined(function () {
        ctx.beginPath();
        ctx.moveTo(cx - 9 * u, 31 * u); ctx.lineTo(cx + 8 * u, 31 * u);
        ctx.quadraticCurveTo(cx + 14 * u, 42 * u, cx + 9 * u, 64 * u);
        ctx.lineTo(cx - 9.5 * u, 64 * u); ctx.quadraticCurveTo(cx - 11 * u, 46 * u, cx - 9 * u, 31 * u); ctx.closePath();
      }, hgrad(cx - 11 * u, cx + 12 * u, PC.suitDark, lighten(PC.suit, 14)));
      rrect(cx + 3.5 * u, 34 * u, 8.5 * u, 14 * u, 3 * u, vgrad(34 * u, 48 * u, lighten(PC.armour, 20), PC.armourDark)); // chest plate edge
      rrect(cx - 9.5 * u, 60 * u, 18 * u, 7 * u, 3 * u, vgrad(60 * u, 67 * u, lighten(PC.armour, 12), PC.armourDark));
      rrect(cx - 10 * u, 57 * u, 19.5 * u, 4.5 * u, 1.2 * u, '#2E2A24');
      rrect(cx - 3 * u, 58 * u, 5 * u, 6 * u, 1.2 * u, '#6A5238'); // tool pouch
      sideArm(legL, false);
      ellipse(cx - 2.5 * u, 33 * u, 7.5 * u, 5 * u, vgrad(28 * u, 37 * u, lighten(PC.armour, 24), PC.armourDark));
      // helmet with visor facing +x
      rrect(cx - 5.5 * u, 26 * u, 11 * u, 7 * u, 2.5 * u, PC.armourDark);
      var hx = cx + 1 * u, hy = 19 * u, hr = 11 * u;
      ellipse(hx, hy, hr, hr * 1.02, (function () { var g = ctx.createRadialGradient(hx - hr * 0.4, hy - hr * 0.45, hr * 0.1, hx, hy, hr); g.addColorStop(0, lighten(PC.helmet, 40)); g.addColorStop(1, darken(PC.helmet, 25)); return g; })());
      rrect(hx + 1.5 * u, hy - 3 * u, 10.5 * u, 8.5 * u, 3.5 * u, vgrad(hy - 3 * u, hy + 5.5 * u, '#26404E', PC.visor));
      ctx.fillStyle = 'rgba(160,220,245,0.7)'; ctx.fillRect(hx + 5 * u, hy - 1.5 * u, 4 * u, 1.3 * u);
      ctx.fillStyle = PC.suit; ctx.fillRect(hx - 6 * u, hy - hr * 0.95, 8 * u, 2.4 * u);
    }
  };

  // ---------------------------------------------------------------------
  // Small standalone render helpers (GDD §11.6 "etc."). Not cached — cheap, called per-frame
  // by the renderer with continuously varying values (progress/health).
  // ---------------------------------------------------------------------
  F.sprites.progressRing = function (progress, size, opts) {
    if (!F.sprites.enabled) return stub();
    size = size || 24; opts = opts || {};
    var c = newCanvas(size, size);
    var ctx = ctxOf(c);
    var cx = size / 2, cy = size / 2, r = size * 0.4;
    ctx.strokeStyle = opts.bg || 'rgba(0,0,0,0.45)';
    ctx.lineWidth = opts.width || Math.max(2, size * 0.14);
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = opts.fg || '#ffa500'; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * F.util.clamp(progress, 0, 1));
    ctx.stroke();
    return c;
  };
  F.sprites.healthBar = function (pct, w, h) {
    if (!F.sprites.enabled) return stub();
    w = w || 24; h = h || 3;
    var c = newCanvas(w, h);
    var ctx = ctxOf(c);
    ctx.fillStyle = '#1a1a1a'; ctx.fillRect(0, 0, w, h);
    var p = F.util.clamp(pct, 0, 1);
    ctx.fillStyle = p > 0.66 ? '#5eb663' : (p > 0.33 ? '#e0c040' : '#ff3f3f');
    ctx.fillRect(1, 1, Math.max(0, (w - 2) * p), Math.max(0, h - 2));
    return c;
  };
  // Warning glyph: coloured circle + letter (P0 emoji-free vector, GDD §11.6). kind: power/fuel/ammo/link.
  var WARN_GLYPH = { power: ['#ff3f3f', 'P'], fuel: ['#e39827', 'F'], ammo: ['#ff3f3f', 'A'], link: ['#e0c040', '!'] };
  F.sprites.warningIcon = function (kind, size) {
    if (!F.sprites.enabled) return stub();
    size = size || 16;
    var g = WARN_GLYPH[kind] || WARN_GLYPH.link;
    var c = newCanvas(size, size);
    var ctx = ctxOf(c);
    ctx.fillStyle = g[0]; ctx.beginPath(); ctx.arc(size / 2, size / 2, size * 0.46, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#141414'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.fillRect(size * 0.46, size * 0.24, size * 0.08, size * 0.36);
    ctx.fillRect(size * 0.46, size * 0.68, size * 0.08, size * 0.08);
    return c;
  };
})();
