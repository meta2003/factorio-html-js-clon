// 62-sprites-ores.js — iron ore, copper ore, coal and stone on the ground drawn after the real
// Factorio resource sheets (base/graphics/entity/{iron-ore,copper-ore,coal,stone}: 8 richness
// stages x 8 variations of 128x128 hr frames; reference: the vanilla sheets collected in
// snouz/factorio_free_graphics_for_modders). Registered through F.sprites.defineOre, which
// overrides the generic chunk art in 60-sprites.js for resource ids 1..4.
//
// What the reference looks like: a loose heap of angular lumps about 1.5 tiles across, each
// lump faceted and lit from the upper left (bright top facets, dark lower-right flanks), with a
// short hard shadow to the lower right, sitting in a halo of fine dust specks. The richest stage
// is a dense heap of ~18 lumps; poorer stages thin out to a few small stones. Colours: iron is
// blue-grey steel with near-white glints, copper orange with peach highlights, coal near-black
// with grey glints, stone tan/sand.
//
// The canvas is the shared 1.5-tile ore canvas (S = 96 px at 64 px per tile), so all numbers
// below are hr pixels of a 96x96 box centred on the tile.
(function () {
  'use strict';
  if (!F.sprites || !F.sprites.defineOre) return;

  function hash(a, b) {
    var h = (a * 374761393 + b * 668265263) | 0;
    h = (h ^ (h >>> 13)) * 1274126177 | 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function mix(c, d, t) { return [c[0] + (d[0] - c[0]) * t, c[1] + (d[1] - c[1]) * t, c[2] + (d[2] - c[2]) * t]; }
  function rgb(c, a) {
    var s = Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]);
    return a == null ? 'rgb(' + s + ')' : 'rgba(' + s + ',' + a + ')';
  }

  var ORE = {
    1: { dark: [40, 50, 60], base: [116, 136, 152], light: [188, 206, 218], hi: [240, 248, 252],
      dust: [[122, 84, 62], [176, 186, 196], [90, 70, 56]], glint: 0.8 },
    2: { dark: [104, 38, 16], base: [192, 92, 46], light: [232, 140, 90], hi: [255, 206, 170],
      dust: [[196, 112, 64], [150, 80, 46], [222, 160, 110]], glint: 0.35 },
    3: { dark: [14, 14, 16], base: [38, 39, 42], light: [66, 68, 73], hi: [150, 156, 166],
      dust: [[34, 28, 22], [52, 46, 40], [24, 20, 16]], glint: 0.9 },
    4: { dark: [96, 78, 44], base: [168, 148, 98], light: [210, 192, 136], hi: [242, 232, 190],
      dust: [[70, 54, 30], [120, 98, 62], [52, 40, 22]], glint: 0 },
  };
  // our stages 0..4 (rich .. depleted) -> reference rows 0, 2, 4, 6, 7
  var COUNT = [16, 12, 9, 6, 3];
  var SIZE = [[8, 14.5], [7.5, 13.5], [7, 12.5], [6.5, 11], [5, 8.5]];
  var SPREAD = [[34, 31], [36, 33], [37, 34], [37, 34], [33, 30]];
  var GAP = [0.62, 0.75, 0.95, 1.2, 1.5]; // minimum lump spacing (x radii sum): dense heaps .. lone stones

  function outline(ctx, pts, ox, oy) {
    ctx.beginPath(); ctx.moveTo(pts[0][0] + ox, pts[0][1] + oy);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] + ox, pts[i][1] + oy);
    ctx.closePath();
  }

  // One faceted lump: an irregular polygon fanned into triangles from an off-centre peak; each
  // facet is shaded by how much its outward direction faces the upper-left light.
  function lump(ctx, x, y, r, seed, P) {
    var n = 7 + Math.floor(hash(seed, 1) * 3), pts = [];
    var rot = hash(seed, 2) * Math.PI * 2, ea = hash(seed, 3) * Math.PI, el = 0.18 + 0.2 * hash(seed, 4);
    for (var i = 0; i < n; i++) {
      var a = rot + i / n * Math.PI * 2 + (hash(seed, 10 + i) - 0.5) * 0.55;
      var rr = r * (0.74 + 0.32 * hash(seed, 30 + i)) * (1 + el * Math.cos(2 * (a - ea)));
      pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.84]);
    }
    // hard cast shadow to the lower right
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; outline(ctx, pts, r * 0.5, r * 0.42); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; outline(ctx, pts, r * 0.26, r * 0.22); ctx.fill();
    var px = x - r * (0.12 + 0.14 * hash(seed, 5)), py = y - r * (0.16 + 0.14 * hash(seed, 6));
    var lit = [];
    for (i = 0; i < n; i++) {
      var p0 = pts[i], p1 = pts[(i + 1) % n];
      var mx = (p0[0] + p1[0]) / 2 - px, my = (p0[1] + p1[1]) / 2 - py, ml = Math.sqrt(mx * mx + my * my) || 1;
      var L = -(mx / ml * 0.62 + my / ml * 0.78);
      var t = Math.max(0, Math.min(1, 0.5 + 0.6 * L + (hash(seed, 50 + i) - 0.5) * 0.22));
      lit.push(L);
      var col = t < 0.5 ? mix(P.dark, P.base, t * 2) : mix(P.base, P.light, (t - 0.5) * 2);
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.closePath();
      ctx.fillStyle = rgb(col); ctx.fill();
      ctx.strokeStyle = rgb(col); ctx.lineWidth = 0.4; ctx.stroke();
    }
    // small flat top face round the peak
    var tf = 0.3 + 0.15 * hash(seed, 7);
    ctx.beginPath();
    for (i = 0; i < n; i++) ctx.lineTo(px + (pts[i][0] - px) * tf, py + (pts[i][1] - py) * tf);
    ctx.closePath(); ctx.fillStyle = rgb(mix(P.base, P.light, 0.75)); ctx.fill();
    // crisp edge highlights on the lit ridges, dark rim on the shaded side
    ctx.lineCap = 'round';
    for (i = 0; i < n; i++) {
      var q0 = pts[i], q1 = pts[(i + 1) % n];
      if (lit[i] > 0.35) {
        ctx.strokeStyle = rgb(P.hi, (0.35 + 0.4 * lit[i]).toFixed(2)); ctx.lineWidth = 0.9;
        ctx.beginPath(); ctx.moveTo(q0[0], q0[1]); ctx.lineTo(q1[0], q1[1]); ctx.stroke();
      } else if (lit[i] < -0.2) {
        ctx.strokeStyle = rgb(mix(P.dark, [0, 0, 0], 0.4), 0.7); ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(q0[0], q0[1]); ctx.lineTo(q1[0], q1[1]); ctx.stroke();
      }
      if (lit[i] > 0 && hash(seed, 70 + i) < 0.5) { // ridge from the peak
        ctx.strokeStyle = rgb(P.hi, 0.3); ctx.lineWidth = 0.6;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(q0[0], q0[1]); ctx.stroke();
      }
    }
    if (P.glint && hash(seed, 8) < P.glint) {
      var gx = px - r * 0.15 + hash(seed, 9) * r * 0.2, gy = py - r * 0.1;
      var g = ctx.createRadialGradient(gx, gy, 0, gx, gy, r * 0.32);
      g.addColorStop(0, rgb(P.hi, 0.95)); g.addColorStop(1, rgb(P.hi, 0));
      ctx.fillStyle = g; ctx.fillRect(gx - r * 0.32, gy - r * 0.32, r * 0.64, r * 0.64);
    }
  }

  function paintOre(res) {
    var P = ORE[res];
    return function (ctx, S, stage, variant) {
      var st = Math.max(0, Math.min(4, stage | 0)), k = S / 96, seed = res * 1000 + st * 50 + variant * 7;
      ctx.save(); ctx.scale(k, k);
      var cx = 48 + (hash(seed, 1) - 0.5) * 12, cy = 49 + (hash(seed, 2) - 0.5) * 12;
      var sx = SPREAD[st][0], sy = SPREAD[st][1];
      // faint soil stain and the dust halo
      var sg = ctx.createRadialGradient(cx, cy, 0, cx, cy, sx * 1.15);
      sg.addColorStop(0, rgb(P.dust[2], 0.16)); sg.addColorStop(1, rgb(P.dust[2], 0));
      ctx.fillStyle = sg; ctx.fillRect(0, 0, 96, 96);
      var nd = 220 + (4 - st) * 70;
      for (var d = 0; d < nd; d++) {
        var gx = (hash(seed + d, 11) + hash(seed + d, 12) + hash(seed + d, 13) - 1.5) / 1.5;
        var gy = (hash(seed + d, 14) + hash(seed + d, 15) + hash(seed + d, 16) - 1.5) / 1.5;
        var dc = P.dust[Math.floor(hash(seed + d, 17) * P.dust.length)];
        ctx.fillStyle = rgb(dc, (0.3 + 0.5 * hash(seed + d, 18)).toFixed(2));
        var ds = 1 + 1.1 * hash(seed + d, 19);
        ctx.fillRect(cx + gx * sx * 1.25, cy + gy * sy * 1.25, ds, ds);
      }
      // lumps: scattered in an ellipse, rejecting heavy overlaps, drawn back to front
      var lumps = [], tries = 0;
      while (lumps.length < COUNT[st] && tries < 400) {
        var a = hash(seed + tries, 21) * Math.PI * 2, rr = Math.pow(hash(seed + tries, 22), 0.7);
        var r = SIZE[st][0] + (SIZE[st][1] - SIZE[st][0]) * hash(seed + tries, 23) * (1 - 0.35 * rr);
        var lx = cx + Math.cos(a) * rr * sx, ly = cy + Math.sin(a) * rr * sy, ok = true;
        lx = Math.max(r + 2, Math.min(94 - r * 1.4, lx)); ly = Math.max(r + 2, Math.min(94 - r * 1.3, ly)); // keep lump + shadow on the canvas
        for (var j = 0; j < lumps.length && ok; j++) {
          var dx = lumps[j][0] - lx, dy = lumps[j][1] - ly;
          if (Math.sqrt(dx * dx + dy * dy) < (lumps[j][2] + r) * GAP[st]) ok = false;
        }
        if (ok) lumps.push([lx, ly, r, seed * 31 + tries]);
        tries++;
      }
      lumps.sort(function (p, q) { return p[1] - q[1]; });
      lumps.forEach(function (l) { lump(ctx, l[0], l[1], l[2], l[3], P); });
      // a few dust specks settle over the lumps' feet
      for (d = 0; d < nd / 4; d++) {
        var fx = (hash(seed + d, 41) + hash(seed + d, 42) - 1) * sx, fy = (hash(seed + d, 43) + hash(seed + d, 44) - 1) * sy;
        ctx.fillStyle = rgb(P.dust[Math.floor(hash(seed + d, 45) * P.dust.length)], 0.35);
        ctx.fillRect(cx + fx, cy + fy, 0.8, 0.8);
      }
      ctx.restore();
    };
  }

  [1, 2, 3, 4].forEach(function (res) { F.sprites.defineOre(res, paintOre(res)); });
})();
