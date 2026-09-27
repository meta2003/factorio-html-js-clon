// 64-sprites-belts.js — transport belts, underground belts and splitters drawn after the real
// Factorio belt sprites (base/graphics/entity/transport-belt, 1.1/2.0 "hr" set: 64 px per tile,
// which is exactly our 2x sprite scale, so the measurements below are in those pixels).
//
// What the reference looks like (north-flowing straight belt, 64x64):
//   - a grey-brown rubber belt of "slats", one every 16 px (4 per tile);
//   - each slat = two flat side wings (x 5..18 and 45..58, 12 px tall, 3-4 px dark gap between
//     slats) joined by a centre chevron band 26 px wide whose apex points in the flow direction
//     and whose arms drop 7-8 px; consecutive chevrons only have a thin dark seam between them;
//   - a tier-coloured arrowhead (yellow / red) fills the tip of the chevron: on every 2nd slat
//     for the basic belt (16-frame loop = half a tile), every 4th for fast (32 frames = 1 tile);
//   - a thin light metal lip with bolts on the west edge, a dark side wall on the east edge;
//     horizontal belts instead show the side frame (dark mechanism + rusty rail with rivets)
//     along their south edge, since the camera looks slightly from the south;
//   - curves fan the same slats around the inner corner, with a riveted metal guard on the
//     outer arc and the dark mechanism visible between the guard and the belt.
// Everything is drawn in "belt space" (u across 0..64 left->right, v along 0..64 with flow
// toward v = 0) and mapped through a transform, so the straight belt, the curve (polar map)
// and the belts under splitters/undergrounds share one slat routine.
//
// Animation: FRAMES_PER_RIB frames move the slats by one slat (1/4 tile). A full loop is
// FRAMES_PER_RIB * tier.ribs frames so the arrow spacing (2 or 4 slats) loops seamlessly;
// F.sprites.beltFrames(def) tells the renderer how many frames to cycle through.
(function () {
  'use strict';
  if (!F.sprites || !F.sprites.definePainter) return;
  var L = F.sprites.lib;

  var FRAMES_PER_RIB = 8;
  var TIER = {
    yellow: { base: '#E4AF1C', hi: '#FFE484', lo: '#7E5A06', line: '#4A3303', ribs: 2 },
    fast: { base: '#D8391F', hi: '#FF917A', lo: '#6C1408', line: '#3E0A03', ribs: 4 },
  };
  function tierOf(def) {
    var b = (def && (def.belt || def.underground || def.splitter)) || {};
    return TIER[b.tier === 'fast' ? 'fast' : 'yellow'];
  }
  F.sprites.beltFramesPerRib = FRAMES_PER_RIB;
  F.sprites.beltFrames = function (def) { return FRAMES_PER_RIB * tierOf(def).ribs; };

  // Belt rubber palette, sampled from the reference sprite.
  var PAD = '#6E5B54', PAD_HI = '#8A7770', PAD_LO = '#46332C';
  var SEAM = '#2E1F18', GAP = '#1B120E', GRAIN = 'rgba(46,32,26,0.4)';
  var METAL = '#8E847F', METAL_HI = '#B4ABA6', METAL_LO = '#4E4440', RUST = 'rgba(122,70,40,0.45)';

  // World light comes from the top-left. Returns the local-space unit vector pointing toward the
  // light for a sprite painted facing north and rotated clockwise by `dir` quarter turns.
  function lightDir(dir, mirror) {
    var up = [[0, -1], [-1, 0], [0, 1], [1, 0]][dir & 3];
    var left = [[-1, 0], [0, 1], [1, 0], [0, -1]][dir & 3];
    var x = up[0] + left[0] * 0.45, y = up[1] + left[1] * 0.45, n = Math.sqrt(x * x + y * y);
    return [(mirror ? -x : x) / n, y / n];
  }

  function hash(a, b) {
    var h = (a * 374761393 + b * 668265263) | 0;
    h = (h ^ (h >>> 13)) * 1274126177 | 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  // Trace a belt-space polygon through transform T; `sub` > 1 subdivides edges (curves).
  function tracePoly(ctx, pts, T, sub) {
    ctx.beginPath();
    for (var i = 0; i < pts.length; i++) {
      var a = pts[i], b = pts[(i + 1) % pts.length];
      if (i === 0) { var p0 = T(a[0], a[1]); ctx.moveTo(p0[0], p0[1]); }
      for (var s = 1; s <= sub; s++) {
        var t = s / sub, p = T(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t);
        ctx.lineTo(p[0], p[1]);
      }
    }
    ctx.closePath();
  }
  function traceLine(ctx, pts, T, sub) {
    ctx.beginPath();
    var p0 = T(pts[0][0], pts[0][1]); ctx.moveTo(p0[0], p0[1]);
    for (var i = 1; i < pts.length; i++) {
      var a = pts[i - 1], b = pts[i];
      for (var s = 1; s <= sub; s++) {
        var t = s / sub, p = T(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t);
        ctx.lineTo(p[0], p[1]);
      }
    }
  }
  // Fill a shape, then an inner bevel: highlight just inside the edges facing the light, shade
  // inside the edges facing away (the path is re-stroked shifted and clipped to the shape).
  function bevelShape(ctx, path, fill, hi, lo, lx, ly, w, outline, outlineW) {
    path(); ctx.fillStyle = fill; ctx.fill();
    ctx.save(); path(); ctx.clip();
    ctx.lineWidth = w * 2; ctx.lineJoin = 'round';
    ctx.save(); ctx.translate(-lx * w, -ly * w); path(); ctx.strokeStyle = hi; ctx.stroke(); ctx.restore();
    ctx.save(); ctx.translate(lx * w, ly * w); path(); ctx.strokeStyle = lo; ctx.stroke(); ctx.restore();
    ctx.restore();
    if (outline) { path(); ctx.strokeStyle = outline; ctx.lineWidth = outlineW; ctx.stroke(); }
  }

  // The moving rubber surface between u = a..b, v = 0..64 (belt units), mapped through T.
  // k = canvas px per belt unit (for line widths). light = [lx,ly] local light vector.
  function paintSlats(ctx, T, sub, k, a, b, frame, tier, light) {
    var lx = light[0], ly = light[1];
    var P = 16, cycle = tier.ribs, nFrames = FRAMES_PER_RIB * cycle;
    var f = ((frame % nFrames) + nFrames) % nFrames;
    var off = f / FRAMES_PER_RIB * P;
    var cx = (a + b) / 2, hw = (b - a) * 0.225, xL = cx - hw, xR = cx + hw, drop = 7.5, wingH = 13.4;
    // dark underlay: shows through as the gaps between slats
    tracePoly(ctx, [[a, -2], [b, -2], [b, 66], [a, 66]], T, sub); ctx.fillStyle = GAP; ctx.fill();
    for (var kk = -3; kk <= 4 + cycle; kk++) {
      var A = kk * P - off; // apex of this slat's chevron
      if (A > 66 || A + P + wingH < -2) continue;
      var slot = ((kk % cycle) + cycle) % cycle;
      // One rubber cleat = the chevron (apex A, arms reaching the grooves at A + drop) plus the
      // pair of side wings hanging off its lower arms (tops at A + P). Wing and chevron are one
      // piece; a groove only runs where a wing meets the NEXT cleat's chevron.
      var wt = A + P + 0.3, wb = A + P + wingH, c = 3.2, c2 = 1.2, bB = A + P + drop - 0.35;
      var cleat = [
        [cx, A + 0.35], [xR, A + drop + 0.35], [xR, wt],
        [b - 0.5 - c, wt], [b - 0.5 - c2, wt + 0.4], [b - 0.5, wt + c], [b - 0.5, wb - c], [b - 0.5 - c2, wb - 0.4], [b - 0.5 - c, wb],
        [xR, wb], [xR, bB], [cx, A + P - 0.35], [xL, bB], [xL, wb],
        [a + 0.5 + c, wb], [a + 0.5 + c2, wb - 0.4], [a + 0.5, wb - c], [a + 0.5, wt + c], [a + 0.5 + c2, wt + 0.4], [a + 0.5 + c, wt],
        [xL, wt], [xL, A + drop + 0.35],
      ];
      bevelShape(ctx, function () { tracePoly(ctx, cleat, T, sub); }, PAD, PAD_HI, PAD_LO, lx, ly, 1.0 * k, SEAM, 0.8 * k);
      // rubber grain: short streaks fixed per cleat so they travel with it
      ctx.strokeStyle = GRAIN; ctx.lineWidth = 0.7 * k; ctx.lineCap = 'round';
      for (var wi = 0; wi < 2; wi++) {
        var x0 = wi ? xR + 2 : a + 2.5, x1 = wi ? b - 2.5 : xL - 2;
        for (var g = 0; g < 3; g++) {
          var h1 = hash(slot * 7 + wi * 3 + g, 11), h2 = hash(slot * 5 + wi, g + 3);
          var gx = x0 + (x1 - x0) * h1 * 0.7, gl = (x1 - x0) * (0.2 + h2 * 0.3), gy = wt + 3 + g * 3 + h2 * 1.5;
          traceLine(ctx, [[gx, gy], [Math.min(x1, gx + gl), gy]], T, sub > 1 ? 3 : 1); ctx.stroke();
        }
      }
      ctx.lineWidth = 0.6 * k;
      for (var gc = 0; gc < 3; gc++) {
        var hc = hash(slot * 13 + gc, 29), gyc = A + drop + 2.5 + gc * 3.5, side = gc % 2 ? 1 : -1;
        traceLine(ctx, [[cx + side * (hw - 3 - hc * 3), gyc + 1], [cx + side * (1.5 + hc * 2), gyc - drop * 0.4]], T, sub > 1 ? 3 : 1); ctx.stroke();
      }
      // tier-coloured arrowhead in the tip of the chevron
      if (slot === 0) {
        var arrow = [[cx, A - 0.6], [xR + 0.5, A + drop - 0.2], [xR - 4, A + drop + 0.2], [cx, A + drop * 0.62], [xL + 4, A + drop + 0.2], [xL - 0.5, A + drop - 0.2]];
        bevelShape(ctx, function () { tracePoly(ctx, arrow, T, sub); }, tier.base, tier.hi, tier.lo, lx, ly, 0.6 * k, tier.lo, 0.5 * k);
        // the little rust-orange studs at the arrow's corners
        ctx.fillStyle = '#8A4A2A';
        var s1 = T(xL - 0.2, A + drop), s2 = T(xR + 0.2, A + drop);
        ctx.fillRect(s1[0] - 0.6 * k, s1[1] - 0.6 * k, 1.2 * k, 1.2 * k);
        ctx.fillRect(s2[0] - 0.6 * k, s2[1] - 0.6 * k, 1.2 * k, 1.2 * k);
      }
    }
  }

  function bolt(ctx, x, y, r) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.arc(x + r * 0.3, y + r * 0.3, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#B3AAA5'; ctx.beginPath(); ctx.arc(x, y, r * 0.85, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.35, 0, Math.PI * 2); ctx.fill();
  }

  // Which local side of a straight belt faces world south / west (for the side frame + lip).
  // dir 0: left = west; dir 1: right = south; dir 2: right = west; dir 3: left = south.
  function beltSides(dir) {
    dir &= 3;
    if (dir === 0) return { a: 3.5, b: 58, left: 'lip', right: 'wall' };
    if (dir === 2) return { a: 6, b: 60.5, left: 'wall', right: 'lip' };
    if (dir === 1) return { a: 2.5, b: 53, left: 'top', right: 'frame' };
    return { a: 11, b: 61.5, left: 'frame', right: 'top' };
  }
  // Side decorations of a straight belt in belt units (identity-mapped, x0 = left edge in px).
  function paintSide(ctx, kind, x, w, k, H, isLeft) {
    var X = x * k, Wd = w * k;
    if (kind === 'lip') { // light metal lip with bolts (world-west edge of a vertical belt)
      var g = ctx.createLinearGradient(X, 0, X + Wd, 0);
      g.addColorStop(0, isLeft ? METAL_HI : METAL_LO); g.addColorStop(0.5, METAL); g.addColorStop(1, isLeft ? METAL_LO : METAL_HI);
      ctx.fillStyle = g; ctx.fillRect(X, 0, Wd, H);
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(isLeft ? X + Wd - 0.8 * k : X, 0, 0.8 * k, H);
      bolt(ctx, X + Wd / 2, 8 * k, 1.2 * k); bolt(ctx, X + Wd / 2, 40 * k, 1.2 * k);
    } else if (kind === 'wall') { // side wall in shadow (world-east edge)
      var gw = ctx.createLinearGradient(X, 0, X + Wd, 0);
      gw.addColorStop(0, isLeft ? '#120D0B' : '#3A2E29'); gw.addColorStop(1, isLeft ? '#3A2E29' : '#120D0B');
      ctx.fillStyle = gw; ctx.fillRect(X, 0, Wd, H);
    } else if (kind === 'top') { // thin lip along the world-north edge of a horizontal belt
      ctx.fillStyle = METAL_LO; ctx.fillRect(X, 0, Wd, H);
      ctx.fillStyle = METAL; ctx.fillRect(isLeft ? X : X + Wd * 0.4, 0, Wd * 0.6, H);
    } else { // 'frame': the belt's side frame seen from the south — mechanism gap + riveted rail
      var gapW = 3.2 * k, railW = Wd - gapW;
      var gx = isLeft ? X + railW : X, rx = isLeft ? X : X + gapW;
      ctx.fillStyle = '#0E0B09'; ctx.fillRect(gx, 0, gapW, H);
      ctx.fillStyle = '#4C4744';
      for (var t = 0; t < 4; t++) ctx.fillRect(gx + gapW * 0.2, (t * 16 + 5) * k, gapW * 0.6, 5 * k);
      var gr = ctx.createLinearGradient(rx, 0, rx + railW, 0);
      // the rail's lit face is the one toward the belt (world north)
      gr.addColorStop(0, isLeft ? '#3E3531' : '#B4AAA4'); gr.addColorStop(0.35, '#8D837E');
      gr.addColorStop(0.7, '#6A5F5A'); gr.addColorStop(1, isLeft ? '#B4AAA4' : '#3E3531');
      ctx.fillStyle = gr; ctx.fillRect(rx, 0, railW, H);
      ctx.fillStyle = RUST;
      for (var r = 0; r < 5; r++) ctx.fillRect(rx + railW * hash(r, 3) * 0.7, (r * 13 + 4) * k, railW * 0.3, 2.5 * k);
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(isLeft ? rx : rx + railW - 0.9 * k, 0, 0.9 * k, H);
      for (var b = 0; b < 2; b++) { // brackets + rivets
        var by = (b * 32 + 12) * k;
        ctx.fillStyle = '#5A504B'; ctx.fillRect(rx + railW * 0.15, by - 3 * k, railW * 0.7, 6 * k);
        ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(rx + railW * 0.15, by + 2.2 * k, railW * 0.7, 0.8 * k);
        bolt(ctx, rx + railW / 2, by, 1.3 * k);
      }
    }
  }

  // Straight belt filling a W x H (1 tile) area, flow toward local north.
  function paintStraight(ctx, W, H, frame, dir, tier, cap) {
    var k = W / 64, sd = beltSides(dir), light = lightDir(dir, false);
    var T = function (u, v) { return [u * k, v * k]; };
    paintSlats(ctx, T, 1, k, sd.a, sd.b, frame, tier, light);
    paintSide(ctx, sd.left, 0, sd.a, k, H, true);
    paintSide(ctx, sd.right, sd.b, 64 - sd.b, k, H, false);
    if (cap & 1) paintEnd(ctx, W, H, k, false);
    if (cap & 2) paintEnd(ctx, W, H, k, true);
  }
  // Open end of a belt line: the slats roll down over the end roller (darkening), rounded corners.
  function paintEnd(ctx, W, H, k, atTop) {
    var d = 7 * k, y0 = atTop ? 0 : H - d;
    var g = ctx.createLinearGradient(0, atTop ? d : H - d, 0, atTop ? 0 : H);
    g.addColorStop(0, 'rgba(12,8,6,0)'); g.addColorStop(0.6, 'rgba(12,8,6,0.45)'); g.addColorStop(1, 'rgba(12,8,6,0.9)');
    ctx.fillStyle = g; ctx.fillRect(0, y0, W, d);
    var r = 4 * k, ey = atTop ? 0 : H;
    ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = '#000';
    [0, W].forEach(function (ex) {
      var sx = ex === 0 ? 1 : -1, sy = atTop ? 1 : -1;
      ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex + sx * r, ey);
      ctx.arc(ex + sx * r, ey + sy * r, r, atTop ? -Math.PI / 2 : Math.PI / 2, ex === 0 ? Math.PI : 0, (ex === 0) === atTop);
      ctx.closePath(); ctx.fill();
    });
    ctx.restore();
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(r, atTop ? 0 : H - 0.8 * k, W - 2 * r, 0.8 * k);
  }

  function paintBelt(ctx, W, H, frame, dir, def, type, opts) {
    var tier = tierOf(def);
    ctx.clearRect(0, 0, W, H); // belts are flat: no square drop shadow
    if (opts && opts.shape) { paintCurve(ctx, W, H, frame, dir, tier, opts.shape); return; }
    paintStraight(ctx, W, H, frame, dir, tier, (opts && opts.cap) | 0);
  }

  // Curve (shape 1: enters from the right edge, pivot = top-right corner; -1 mirrored), flow
  // exits the top edge. Belt space maps to polar coordinates around the pivot: u -> radius
  // 64 - u (so the item lanes at radius 16/48 line up with F.belts.laneWorldPos), v -> angle.
  function paintCurve(ctx, W, H, frame, dir, tier, shape) {
    var k = W / 64, mirror = shape < 0;
    ctx.save();
    if (mirror) { ctx.translate(W, 0); ctx.scale(-1, 1); }
    var px = W, py = 0, A0 = Math.PI / 2, A1 = Math.PI;
    var T = function (u, v) {
      var r = (64 - u) * k, th = A1 - (v / 64) * (A1 - A0);
      return [px + r * Math.cos(th), py + r * Math.sin(th)];
    };
    function ring(r0, r1, fill) {
      ctx.beginPath(); ctx.arc(px, py, r1 * k, A0, A1); if (r0 > 0) ctx.arc(px, py, r0 * k, A1, A0, true); else ctx.lineTo(px, py);
      ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
    }
    // soft ground shadow, then the dark mechanism under the whole quarter disc
    ctx.save(); ctx.translate(2.5 * k, 3 * k); ring(0, 64, 'rgba(0,0,0,0.28)'); ctx.restore();
    ring(0, 63.5, '#15100D');
    // hints of rollers/gears inside the mechanism gap
    for (var m = 0; m < 5; m++) {
      var ma = A0 + (A1 - A0) * (m + 0.5) / 5, mr = 58.2 * k;
      ctx.fillStyle = m % 2 ? '#3E3935' : '#57514D';
      ctx.beginPath(); ctx.arc(px + mr * Math.cos(ma), py + mr * Math.sin(ma), 1.6 * k, 0, Math.PI * 2); ctx.fill();
    }
    var light = lightDir(dir, mirror);
    paintSlats(ctx, T, 6, k, 7, 61, frame, tier, light);
    // riveted metal guard on the outer arc
    var gg = ctx.createRadialGradient(px, py, 59.5 * k, px, py, 64 * k);
    gg.addColorStop(0, '#3A302C'); gg.addColorStop(0.3, '#A39893'); gg.addColorStop(0.65, '#7C706A'); gg.addColorStop(1, '#3F3531');
    ring(59.5, 63.8, gg);
    ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.lineWidth = 0.8 * k;
    ctx.beginPath(); ctx.arc(px, py, 63.8 * k, A0, A1); ctx.stroke();
    ctx.beginPath(); ctx.arc(px, py, 59.5 * k, A0, A1); ctx.stroke();
    ctx.fillStyle = RUST;
    for (var rs = 0; rs < 6; rs++) {
      var ra = A0 + (A1 - A0) * hash(rs, 7), rr = 61.5 * k;
      ctx.beginPath(); ctx.arc(px + rr * Math.cos(ra), py + rr * Math.sin(ra), 1.4 * k, 0, Math.PI * 2); ctx.fill();
    }
    for (var bI = 1; bI <= 3; bI++) {
      var ba = A0 + (A1 - A0) * bI / 4, br = 61.7 * k;
      bolt(ctx, px + br * Math.cos(ba), py + br * Math.sin(ba), 1.3 * k);
    }
    // small hub over the inner corner
    ring(0, 3.5, '#2A221E');
    ctx.restore();
  }

  // Underground belt: a tier-coloured hood with dark chevron stripes between two rusty riveted
  // posts, the tunnel mouth facing the visible belt. 'in' = entrance (belt comes from the back,
  // hood over the front), 'out' = exit (hood over the back, belt leaves at the front).
  function paintUnderground(ctx, W, H, frame, dir, def, type, opts) {
    var io = (opts && opts.io) || 'in', tier = tierOf(def), k = W / 64, out = io === 'out';
    ctx.clearRect(0, 0, W, H);
    // the visible belt half
    ctx.save(); ctx.beginPath();
    if (out) ctx.rect(0, 0, W, H * 0.5); else ctx.rect(0, H * 0.5, W, H * 0.5);
    ctx.clip();
    paintStraight(ctx, W, H, frame, dir, tier, 0);
    ctx.restore();
    // y() mirrors the structure for the exit so the mouth always faces the open belt
    function y(v) { return (out ? 64 - v : v) * k; }
    var hx = 9 * k, hw = 46 * k;
    // tunnel mouth: dark opening swallowing the belt
    var m0 = y(36), m1 = y(46), mt = Math.min(m0, m1), mh = Math.abs(m1 - m0);
    var mg = ctx.createLinearGradient(0, y(36), 0, y(46));
    mg.addColorStop(0, '#050403'); mg.addColorStop(0.7, 'rgba(8,6,5,0.85)'); mg.addColorStop(1, 'rgba(8,6,5,0)');
    ctx.fillStyle = mg; ctx.fillRect(hx - 2 * k, mt, hw + 4 * k, mh);
    // ground shadow of the hood
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(hx + 3 * k, Math.min(y(3), y(38)) + 3 * k, hw, Math.abs(y(38) - y(3)));
    // hood plate
    var t0 = Math.min(y(3), y(37)), th = Math.abs(y(37) - y(3));
    L.roundRectPath(ctx, hx, t0, hw, th, 2.5 * k);
    var hg = ctx.createLinearGradient(0, t0, 0, t0 + th);
    hg.addColorStop(0, L.lighten(tier.base, 22)); hg.addColorStop(0.5, tier.base); hg.addColorStop(1, L.darken(tier.base, 22));
    ctx.fillStyle = hg; ctx.fill();
    ctx.save(); L.roundRectPath(ctx, hx, t0, hw, th, 2.5 * k); ctx.clip();
    // mottled paint
    for (var n = 0; n < 26; n++) {
      ctx.fillStyle = n % 2 ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.12)';
      ctx.fillRect(hx + hw * hash(n, 1), t0 + th * hash(n, 2), (1 + 2 * hash(n, 3)) * k, (1 + hash(n, 4)) * k);
    }
    // three dark chevrons pointing in the flow direction (local north)
    ctx.strokeStyle = 'rgba(70,52,46,0.9)'; ctx.lineWidth = 3 * k; ctx.lineJoin = 'miter';
    var cy0 = t0 + th * 0.3;
    for (var c = 0; c < 3; c++) {
      var cy = cy0 + c * th * 0.24;
      ctx.beginPath(); ctx.moveTo(hx - 2 * k, cy + 7 * k); ctx.lineTo(W / 2, cy); ctx.lineTo(hx + hw + 2 * k, cy + 7 * k); ctx.stroke();
    }
    ctx.restore();
    L.roundRectPath(ctx, hx, t0, hw, th, 2.5 * k); ctx.strokeStyle = tier.line; ctx.lineWidth = 1 * k; ctx.stroke();
    // lip over the mouth
    var lipY = out ? y(37) - 0 : y(37) - 3 * k;
    var lg = ctx.createLinearGradient(0, lipY, 0, lipY + 3 * k);
    lg.addColorStop(0, '#A0958F'); lg.addColorStop(1, '#4C413C');
    ctx.fillStyle = lg; ctx.fillRect(hx, lipY, hw, 3 * k);
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(hx, out ? lipY : lipY + 2.4 * k, hw, 0.6 * k);
    // rusty riveted posts on both sides, running the full length of the frame
    var p0 = Math.min(y(1), y(58)), ph = Math.abs(y(58) - y(1));
    [[3 * k, 7 * k], [54 * k, 7 * k]].forEach(function (p, i) {
      var pg = ctx.createLinearGradient(p[0], 0, p[0] + p[1], 0);
      pg.addColorStop(0, '#B1A6A0'); pg.addColorStop(0.45, '#7F726C'); pg.addColorStop(1, '#3F3430');
      L.roundRectPath(ctx, p[0], p0, p[1], ph, 1.5 * k); ctx.fillStyle = pg; ctx.fill();
      ctx.fillStyle = RUST;
      for (var r = 0; r < 4; r++) ctx.fillRect(p[0] + p[1] * 0.2, p0 + ph * hash(r + i * 4, 9), p[1] * 0.6, 3 * k);
      L.roundRectPath(ctx, p[0], p0, p[1], ph, 1.5 * k); ctx.strokeStyle = '#1A1411'; ctx.lineWidth = 0.9 * k; ctx.stroke();
      for (var b = 0; b < 4; b++) bolt(ctx, p[0] + p[1] / 2, p0 + ph * (0.1 + b * 0.26), 1.2 * k);
    });
  }

  // Splitter (2 wide x 1 deep, flow toward local north): two running belts under a mechanical
  // housing — tier-coloured front plates arched over each belt, then the grey gearbox with
  // capsule covers, gears, a steel bar and the drive chain along the back.
  function paintSplitter(ctx, W, H, frame, dir, def) {
    var tier = tierOf(def), k = H / 64, half = W / 2;
    ctx.clearRect(0, 0, W, H);
    for (var s = 0; s < 2; s++) {
      ctx.save(); ctx.translate(s * half, 0); ctx.beginPath(); ctx.rect(0, 0, half, H); ctx.clip();
      paintStraight(ctx, half, H, frame, dir, tier, 0);
      ctx.restore();
    }
    var X = function (u) { return u * k; };
    var nF = FRAMES_PER_RIB * tier.ribs, ang = (frame % nF) / nF * Math.PI * 2;
    // housing shadow + body
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    L.roundRectPath(ctx, X(5), X(19), X(122), X(38), X(4)); ctx.fill();
    var bg = ctx.createLinearGradient(0, X(18), 0, X(54));
    bg.addColorStop(0, '#6B6560'); bg.addColorStop(0.5, '#4E4844'); bg.addColorStop(1, '#2C2724');
    L.roundRectPath(ctx, X(3), X(17), X(122), X(37), X(4)); ctx.fillStyle = bg; ctx.fill();
    ctx.strokeStyle = '#141110'; ctx.lineWidth = X(1); ctx.stroke();
    // capsule covers (left belt) and inset panels (right belt)
    [[10, 25], [29, 25]].forEach(function (c) {
      var cg = ctx.createLinearGradient(X(c[0]), 0, X(c[0] + 15), 0);
      cg.addColorStop(0, '#A9B0B6'); cg.addColorStop(0.5, '#737A80'); cg.addColorStop(1, '#3E4347');
      L.roundRectPath(ctx, X(c[0]), X(c[1]), X(15), X(13), X(6)); ctx.fillStyle = cg; ctx.fill();
      ctx.strokeStyle = '#171513'; ctx.lineWidth = X(0.9); ctx.stroke();
      L.roundRectPath(ctx, X(c[0] + 3), X(c[1] + 3), X(9), X(7), X(3.5)); ctx.fillStyle = 'rgba(30,32,34,0.55)'; ctx.fill();
    });
    [[66, 28, 22], [95, 28, 24]].forEach(function (p) {
      L.inset(ctx, X(p[0]), X(p[1]), X(p[2]), X(7), '#3A3E42', X(2));
      ctx.fillStyle = 'rgba(190,196,200,0.35)'; ctx.fillRect(X(p[0] + 2), X(p[1] + 1.5), X(p[2] - 4), X(1.2));
    });
    // gears, turning with the belt
    L.gearShape(ctx, X(52), X(31), X(7.5), X(2.4), 10, ang, '#8C8580', '#1E1A18');
    L.gearShape(ctx, X(84), X(38), X(5), X(1.6), 8, -ang * 1.5, '#9A6A45', '#1E1A18');
    // steel bar with a slot
    var sg = ctx.createLinearGradient(0, X(41), 0, X(47));
    sg.addColorStop(0, '#C5C0BC'); sg.addColorStop(0.5, '#8E8884'); sg.addColorStop(1, '#4A4542');
    ctx.fillStyle = sg; ctx.fillRect(X(6), X(41), X(116), X(5.5));
    ctx.fillStyle = '#1A1715'; ctx.fillRect(X(68), X(42.5), X(28), X(2.2));
    ctx.fillStyle = RUST; ctx.fillRect(X(100), X(41.5), X(14), X(4)); ctx.fillRect(X(18), X(47), X(10), X(3));
    // drive chain along the back edge (links shift with the animation)
    var shift = (frame % FRAMES_PER_RIB) / FRAMES_PER_RIB * 4;
    ctx.fillStyle = '#211D1B'; ctx.fillRect(X(8), X(48), X(112), X(4));
    ctx.fillStyle = '#6E6862';
    for (var lnk = 8 + shift; lnk < 118; lnk += 4) ctx.fillRect(X(lnk), X(48.6), X(2.2), X(2.8));
    // tier-coloured front plates, one arched plate over each belt
    for (var p = 0; p < 2; p++) {
      var x0 = 4 + p * 62, x1 = x0 + 58, xm = (x0 + x1) / 2;
      var plate = function () {
        ctx.beginPath();
        ctx.moveTo(X(x0), X(18)); ctx.lineTo(X(xm - 10), X(18)); ctx.lineTo(X(xm - 5), X(13.5)); ctx.lineTo(X(xm + 5), X(13.5));
        ctx.lineTo(X(xm + 10), X(18)); ctx.lineTo(X(x1), X(18)); ctx.lineTo(X(x1), X(24.5)); ctx.lineTo(X(xm + 10), X(24.5));
        ctx.lineTo(X(xm + 5), X(20.5)); ctx.lineTo(X(xm - 5), X(20.5)); ctx.lineTo(X(xm - 10), X(24.5)); ctx.lineTo(X(x0), X(24.5));
        ctx.closePath();
      };
      var pg = ctx.createLinearGradient(0, X(13), 0, X(25));
      pg.addColorStop(0, tier.hi); pg.addColorStop(0.4, tier.base); pg.addColorStop(1, tier.lo);
      plate(); ctx.fillStyle = pg; ctx.fill();
      ctx.strokeStyle = tier.line; ctx.lineWidth = X(0.9); ctx.stroke();
      bolt(ctx, X(x0 + 3), X(21), X(1.2)); bolt(ctx, X(x1 - 3), X(21), X(1.2));
    }
  }

  F.sprites.definePainter(['transport-belt', 'fast-transport-belt'], paintBelt);
  F.sprites.definePainter(['underground-belt', 'fast-underground-belt'], paintUnderground);
  F.sprites.definePainter(['splitter', 'fast-splitter'], paintSplitter);
})();
