// 65-sprites-refinery.js — the chemical plant, the oil refinery and the storage tank drawn after
// the real Factorio sprites (base/graphics/entity/chemical-plant: 220x292 hr frames, shift
// (0.5,-9); oil-refinery: 386x430, shift (0,-7.5); storage-tank: 219x215, shift (-0.25,3.75);
// references: the vanilla chemical plant in Bob's mods, the vanilla 2.0 refinery and tank frames
// collected in snouz/factorio_free_graphics_for_modders and Bob's mods).
//
// Every painter draws in the reference's own hr pixel grid and maps it onto the footprint canvas.
// The chemical plant's chimney and the refinery's towers stand well above their footprint in the
// originals; our canvas is exactly the footprint, so those two are squashed vertically a little
// (and the chimney shortened) to fit.
//
// What the references look like:
//   - chemical plant: a tangle of bolted steel pipes round a yellow domed tank (left), a dark
//     round vessel with a big inspection window wrapped by an orange band (right), a tall chimney
//     with a bent white vent, a yellow cross-shaped valve block, red hand wheels, a round gauge,
//     and flanged pipe risers at the four corners (the fluid connections);
//   - oil refinery: a big distillation tower (cream insulated top with a glowing rim, rusty lower
//     half, a railed platform round it), a slim cream column, a dark column with a crenellated
//     crown, a grey capsule tank, a teal scaffold tank on the left, rusty pipe racks, steel lattice
//     girders, two huge grey elbow pipes at the bottom corners and flanged risers at its ports;
//   - storage tank: a wide weathered steel tank with a shallow riveted dome, a hub with radiating
//     pipes on top, a riveted inspection hatch at the front, pipe work and hand wheels at the
//     corners and side clamps.
(function () {
  'use strict';
  if (!F.sprites || !F.sprites.definePainter) return;

  function hash(a, b) {
    var h = (a * 374761393 + b * 668265263) | 0;
    h = (h ^ (h >>> 13)) * 1274126177 | 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function rgba(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  function fluidColor(fluid) {
    try { if (fluid && F.data.fluids[fluid] && F.data.fluids[fluid].color) return F.data.fluids[fluid].color; } catch (e) { /* no fluid table */ }
    return null;
  }

  // pipe/metal palettes: d = outline, m = body, l = lit side, h = specular
  var STEEL = { d: '#181612', m: '#5C564C', l: '#8C8474', h: '#CCC4B2' };
  var RUSTP = { d: '#1C120A', m: '#664630', l: '#90684A', h: '#C4A080' };
  var YEL = { d: '#462C04', m: '#AE7812', l: '#D6A030', h: '#F8DC8A' };
  var WHITE = { d: '#34302A', m: '#AAA496', l: '#D2CCBE', h: '#F4F0E6' };
  var GREY = { d: '#141814', m: '#525850', l: '#7A8076', h: '#AEB2A6' };

  // polyline with rounded bends of radius rr (pipe elbows)
  function path(ctx, pts, rr) {
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length - 1; i++) ctx.arcTo(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], rr || 0);
    ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
  }
  // points along a chain of quadratic curves: [p0, c1, p1, c2, p2, ...] (smooth big elbows)
  function curve(pts, n) {
    var out = [pts[0]];
    for (var i = 0; i + 2 < pts.length; i += 2) {
      var a = pts[i], c = pts[i + 1], b = pts[i + 2];
      for (var j = 1; j <= n; j++) {
        var t = j / n, u = 1 - t;
        out.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]);
      }
    }
    return out;
  }
  // A pipe along a polyline: dark outline, body, lit band and specular line offset to the
  // upper left, so any run reads as a lit cylinder.
  function tube(ctx, pts, r, P) {
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'butt';
    var rr = r * 1.7;
    path(ctx, pts, rr); ctx.strokeStyle = P.d; ctx.lineWidth = r * 2; ctx.stroke();
    path(ctx, pts, rr); ctx.strokeStyle = P.m; ctx.lineWidth = r * 1.64; ctx.stroke();
    ctx.translate(-r * 0.24, -r * 0.24);
    path(ctx, pts, rr); ctx.strokeStyle = P.l; ctx.lineWidth = r * 0.72; ctx.stroke();
    ctx.translate(-r * 0.16, -r * 0.16);
    path(ctx, pts, rr); ctx.strokeStyle = rgba(P.h, 0.7); ctx.lineWidth = r * 0.2; ctx.stroke();
    ctx.translate(r * 0.9, r * 0.9);
    path(ctx, pts, rr); ctx.strokeStyle = rgba(P.d, 0.45); ctx.lineWidth = r * 0.36; ctx.stroke();
    ctx.restore();
  }
  // bolted flange collar across a pipe at (x,y); ang = pipe direction
  function flange(ctx, x, y, r, ang, P) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    var w = r * 0.62, hh = r * 1.3;
    ctx.fillStyle = P.d; ctx.fillRect(-w / 2 - 0.6, -hh - 0.6, w + 1.2, hh * 2 + 1.2);
    var g = ctx.createLinearGradient(0, -hh, 0, hh);
    g.addColorStop(0, P.l); g.addColorStop(0.35, P.m); g.addColorStop(1, P.d);
    ctx.fillStyle = g; ctx.fillRect(-w / 2, -hh, w, hh * 2);
    ctx.fillStyle = rgba(P.h, 0.35); ctx.fillRect(-w / 2, -hh, w * 0.3, hh * 2);
    ctx.fillStyle = rgba(P.d, 0.9);
    for (var i = -1; i <= 1; i += 1) { ctx.beginPath(); ctx.arc(0, i * hh * 0.7, Math.max(0.6, r * 0.13), 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }
  // vertical cylinder seen from above-front: body from y0 to y1, top ellipse ry
  function cylV(ctx, cx, rx, ry, y0, y1, P, top) {
    var g = ctx.createLinearGradient(cx - rx, 0, cx + rx, 0);
    g.addColorStop(0, P.d); g.addColorStop(0.25, P.l); g.addColorStop(0.45, P.m); g.addColorStop(1, P.d);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(cx - rx, y0); ctx.lineTo(cx - rx, y1); ctx.ellipse(cx, y1, rx, ry, 0, Math.PI, 0, true);
    ctx.lineTo(cx + rx, y0); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = P.d; ctx.lineWidth = 1; ctx.stroke();
    if (top !== false) {
      ctx.beginPath(); ctx.ellipse(cx, y0, rx, ry, 0, 0, Math.PI * 2);
      var tg = ctx.createLinearGradient(cx - rx, y0 - ry, cx + rx, y0 + ry);
      tg.addColorStop(0, P.h); tg.addColorStop(0.5, P.l); tg.addColorStop(1, P.m);
      ctx.fillStyle = tg; ctx.fill(); ctx.strokeStyle = P.d; ctx.stroke();
    }
  }
  // flanged pipe riser (a fluid connection): short cylinder with a bolted rim and a dark bore
  function riser(ctx, cx, cy, rx, ry, h, P, seed) {
    cylV(ctx, cx, rx * 0.86, ry * 0.86, cy, cy + h, P, false);
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    var g = ctx.createLinearGradient(cx - rx, cy - ry, cx + rx, cy + ry);
    g.addColorStop(0, P.h); g.addColorStop(0.45, P.l); g.addColorStop(1, P.d);
    ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = P.d; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(cx, cy + ry * 0.08, rx * 0.62, ry * 0.56, 0, 0, Math.PI * 2);
    var bg = ctx.createRadialGradient(cx + rx * 0.1, cy + ry * 0.2, 0, cx, cy, rx * 0.62);
    bg.addColorStop(0, '#0C0A08'); bg.addColorStop(1, '#3A342C');
    ctx.fillStyle = bg; ctx.fill();
    ctx.fillStyle = rgba(P.d, 0.85);
    for (var i = 0; i < 10; i++) {
      var a = i / 10 * Math.PI * 2 + (seed || 0);
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * rx * 0.82, cy + Math.sin(a) * ry * 0.8, Math.max(0.7, rx * 0.05), 0, Math.PI * 2); ctx.fill();
    }
  }
  function dome(ctx, cx, cy, rx, ry, c0, c1, c2) {
    var g = ctx.createRadialGradient(cx - rx * 0.35, cy - ry * 0.4, rx * 0.05, cx, cy, Math.max(rx, ry) * 1.05);
    g.addColorStop(0, c0); g.addColorStop(0.5, c1); g.addColorStop(1, c2);
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(20,14,8,0.8)'; ctx.lineWidth = 1; ctx.stroke();
  }
  function wheel(ctx, x, y, r, col) {
    ctx.save(); ctx.lineWidth = Math.max(1, r * 0.3);
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.beginPath(); ctx.ellipse(x + 0.6, y + 0.8, r, r * 0.8, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = col; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.8, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = Math.max(0.8, r * 0.18);
    ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.moveTo(x, y - r * 0.8); ctx.lineTo(x, y + r * 0.8); ctx.stroke();
    ctx.fillStyle = '#2A2420'; ctx.beginPath(); ctx.arc(x, y, r * 0.25, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  function bolts(ctx, pts, r, col) {
    ctx.fillStyle = col || 'rgba(20,16,12,0.85)';
    pts.forEach(function (p) { ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, Math.PI * 2); ctx.fill(); });
  }
  function grime(ctx, seed, x0, y0, x1, y1, n, cols) {
    ctx.save(); ctx.globalCompositeOperation = 'source-atop';
    for (var i = 0; i < n; i++) {
      ctx.fillStyle = cols[Math.floor(hash(i, seed) * cols.length) % cols.length];
      ctx.fillRect(x0 + (x1 - x0) * hash(i, seed + 1), y0 + (y1 - y0) * hash(i, seed + 2), 1 + 2 * hash(i, seed + 3), 1 + 2.6 * hash(i, seed + 4));
    }
    ctx.restore();
  }
  // rust runs: short vertical streaks below a line
  function streaks(ctx, seed, x0, x1, y, len, n, col) {
    for (var i = 0; i < n; i++) {
      var x = x0 + (x1 - x0) * hash(i, seed), l = len * (0.4 + 0.6 * hash(i, seed + 1));
      var g = ctx.createLinearGradient(0, y, 0, y + l);
      g.addColorStop(0, rgba(col, 0.55)); g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g; ctx.fillRect(x, y, 1.2 + 1.5 * hash(i, seed + 2), l);
    }
  }
  // Draw world-aligned (undo the caller's rotation), then map the reference grid: reference
  // point (cx, cy) lands on the canvas centre, scaled by sx/sy on top of 64 px per tile.
  function begin(ctx, W, H, dir, cx, cy, sx, sy) {
    ctx.save();
    ctx.translate(W / 2, H / 2); ctx.rotate(-dir * Math.PI / 2); ctx.scale(sx, sy); ctx.translate(-cx, -cy);
  }

  // -----------------------------------------------------------------------
  // Chemical plant (3x3) — reference 220x292, footprint centre (109,164).
  // -----------------------------------------------------------------------
  function paintChemicalPlant(ctx, W, H, frame, dir, def, type, opts) {
    var k = W / 192, working = !!(opts && opts.working), f = working ? frame & 15 : 0;
    begin(ctx, W, H, dir, 109, 158, k * 1.0, k * 0.8);
    // back corner risers
    riser(ctx, 45, 62, 24, 10, 30, STEEL, 0.2);
    riser(ctx, 172, 62, 24, 10, 30, STEEL, 0.5);
    // right: dark vessel with an orange band and the inspection window
    cylV(ctx, 149, 49, 26, 124, 226, { d: '#141412', m: '#46463E', l: '#6A6A5E', h: '#9A9A8C' });
    ctx.save(); ctx.beginPath(); ctx.ellipse(149, 164, 52, 36, 0, -0.55 * Math.PI, 0.5 * Math.PI); ctx.strokeStyle = '#3A2408'; ctx.lineWidth = 11; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(149, 164, 52, 36, 0, -0.55 * Math.PI, 0.5 * Math.PI); ctx.strokeStyle = '#C08420'; ctx.lineWidth = 8; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(147, 162, 52, 36, 0, -0.5 * Math.PI, 0.1 * Math.PI); ctx.strokeStyle = 'rgba(255,220,120,0.6)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#1A1A16'; ctx.fillRect(126, 182, 60, 42);
    var liq = fluidColor('light-oil') || '#C8A040';
    var wg = ctx.createLinearGradient(124, 180, 188, 224);
    wg.addColorStop(0, working ? '#7C9484' : '#626A62'); wg.addColorStop(0.6, working ? '#3E5A48' : '#343A34'); wg.addColorStop(1, '#161C18');
    ctx.fillStyle = wg; ctx.fillRect(130, 186, 52, 34);
    if (working) { // swirling liquid behind the glass
      ctx.save(); ctx.beginPath(); ctx.rect(130, 186, 52, 34); ctx.clip();
      for (var s = 0; s < 6; s++) {
        var ph = (f / 16 + s / 6) * Math.PI * 2;
        ctx.fillStyle = 'rgba(170,220,160,0.28)';
        ctx.beginPath(); ctx.ellipse(156 + Math.cos(ph) * 22, 204 + Math.sin(ph) * 10, 7, 3, ph, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    void liq;
    ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.beginPath(); ctx.moveTo(132, 220); ctx.lineTo(150, 186); ctx.lineTo(158, 186); ctx.lineTo(140, 220); ctx.fill();
    bolts(ctx, [[128, 184], [184, 184], [128, 222], [184, 222], [156, 184], [156, 222]], 1.3, '#8A8676');
    // left: yellow tank — lower body, then the dome
    cylV(ctx, 58, 36, 12, 150, 205, YEL, false);
    ctx.strokeStyle = '#3A2A10'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(38, 158); ctx.lineTo(64, 198); ctx.moveTo(64, 158); ctx.lineTo(38, 198); ctx.moveTo(38, 158); ctx.lineTo(38, 200); ctx.moveTo(64, 158); ctx.lineTo(64, 200); ctx.stroke();
    dome(ctx, 66, 120, 47, 40, '#F6D27C', '#C08A1E', '#4E3208');
    // chimney with its rope band, and the bent white vent next to it
    cylV(ctx, 80, 12, 6, 40, 112, RUSTP, true);
    ctx.fillStyle = '#100C08'; ctx.beginPath(); ctx.ellipse(80, 40, 8, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#8A7420'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.ellipse(80, 72, 13, 4, 0, 0, Math.PI); ctx.stroke();
    tube(ctx, [[104, 96], [104, 58], [114, 50]], 7, WHITE);
    ctx.fillStyle = '#E8E4DA'; ctx.beginPath(); ctx.ellipse(116, 49, 5, 7, -0.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2A2622'; ctx.beginPath(); ctx.ellipse(117, 49, 3, 5, -0.6, 0, Math.PI * 2); ctx.fill();
    // steel arch over the top
    tube(ctx, [[58, 96], [60, 70], [104, 66], [114, 84]], 9, STEEL);
    flange(ctx, 72, 67, 9, 0, STEEL); flange(ctx, 96, 66, 9, 0, STEEL); flange(ctx, 59, 86, 9, Math.PI / 2, STEEL);
    // gearbox / pump motor in the middle
    ctx.fillStyle = '#26282A'; ctx.fillRect(112, 68, 32, 42);
    var mg = ctx.createLinearGradient(112, 0, 144, 0); mg.addColorStop(0, '#4A4E50'); mg.addColorStop(0.35, '#7A7E7C'); mg.addColorStop(1, '#2E3032');
    ctx.fillStyle = mg; ctx.fillRect(114, 70, 28, 38);
    ctx.fillStyle = '#1A1C1C'; for (var v = 0; v < 4; v++) ctx.fillRect(117 + v * 6, 78, 3, 20);
    ctx.fillStyle = '#5E6260'; ctx.fillRect(118, 62, 20, 9);
    // right loop pipe from the back riser with its red wheel
    tube(ctx, [[166, 80], [180, 96], [182, 128], [170, 140]], 8, STEEL);
    flange(ctx, 181, 110, 8, Math.PI / 2, STEEL);
    wheel(ctx, 172, 76, 6, '#B8202A');
    // yellow cross block
    tube(ctx, [[112, 136], [170, 136]], 10, YEL);
    ctx.fillStyle = YEL.d; ctx.fillRect(127, 117, 34, 38);
    var yg = ctx.createLinearGradient(128, 118, 160, 154); yg.addColorStop(0, YEL.h); yg.addColorStop(0.35, YEL.l); yg.addColorStop(1, YEL.m);
    ctx.fillStyle = yg; ctx.fillRect(128, 118, 32, 36);
    bolts(ctx, [[132, 122], [156, 122], [132, 150], [156, 150]], 1.4);
    flange(ctx, 112, 136, 11, 0, YEL); flange(ctx, 166, 136, 11, 0, YEL);
    // yellow elbow out of the dome
    tube(ctx, [[82, 116], [92, 136], [94, 162]], 11, YEL);
    flange(ctx, 86, 124, 11, 1.1, YEL);
    // left vertical pipe down to the bottom-left cluster
    tube(ctx, [[30, 112], [30, 214], [48, 228]], 9, RUSTP);
    flange(ctx, 30, 140, 9, Math.PI / 2, RUSTP); flange(ctx, 30, 196, 9, Math.PI / 2, RUSTP);
    // grey pipe from the cross block down and left
    tube(ctx, [[144, 150], [144, 176], [130, 190], [102, 190], [98, 214]], 10, STEEL);
    ctx.strokeStyle = 'rgba(20,18,16,0.45)'; ctx.lineWidth = 0.8;
    for (var c = 0; c < 5; c++) { ctx.beginPath(); ctx.moveTo(135, 160 + c * 5); ctx.lineTo(153, 160 + c * 5); ctx.stroke(); }
    // bottom: big grey elbow, rusty cluster, gauge, wheels
    tube(ctx, [[112, 212], [116, 240], [150, 246]], 13, STEEL);
    flange(ctx, 114, 224, 13, Math.PI / 2, STEEL);
    tube(ctx, [[40, 226], [80, 228], [100, 240], [100, 266]], 10, RUSTP);
    tube(ctx, [[62, 236], [62, 268]], 8, RUSTP);
    flange(ctx, 66, 228, 10, 0, RUSTP); flange(ctx, 100, 252, 10, Math.PI / 2, RUSTP);
    wheel(ctx, 94, 208, 6, '#B8202A'); wheel(ctx, 100, 252, 6, '#B8202A');
    ctx.beginPath(); ctx.ellipse(170, 222, 24, 20, 0, 0, Math.PI * 2);
    var gg = ctx.createLinearGradient(146, 202, 194, 242); gg.addColorStop(0, STEEL.h); gg.addColorStop(0.5, STEEL.m); gg.addColorStop(1, STEEL.d);
    ctx.fillStyle = gg; ctx.fill(); ctx.strokeStyle = STEEL.d; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(170, 222, 15, 12, 0, 0, Math.PI * 2);
    var glass = ctx.createRadialGradient(165, 217, 1, 170, 222, 15); glass.addColorStop(0, '#C8D8B8'); glass.addColorStop(1, '#4A5A46');
    ctx.fillStyle = glass; ctx.fill();
    bolts(ctx, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(function (i) { var a = i / 12 * Math.PI * 2; return [170 + Math.cos(a) * 19.5, 222 + Math.sin(a) * 16]; }), 1.1);
    // front corner risers (fluid connections) — the ground-facing half of the bore is dark
    riser(ctx, 45, 252, 25, 10, 20, STEEL, 0.1);
    riser(ctx, 172, 252, 25, 10, 20, STEEL, 0.7);
    grime(ctx, 301, 0, 20, 220, 292, 2600, ['rgba(26,16,8,0.3)', 'rgba(26,16,8,0.22)', 'rgba(150,74,26,0.26)', 'rgba(255,240,210,0.1)']);
    ctx.restore();
  }

  // -----------------------------------------------------------------------
  // Oil refinery (5x5) — reference 354x381 (the trimmed 2.0 frame), footprint centre (179,201).
  // -----------------------------------------------------------------------
  var REF_PORTS = { fin: [[-1, 2], [1, 2]], fout: [[-2, -2], [0, -2], [2, -2]] };
  var RUST = { d: '#1C0C04', m: '#5E2A10', l: '#86421E', h: '#B86A3A' };
  var CREAM = { d: '#3E3830', m: '#A8A090', l: '#CAC4B4', h: '#F2EEE2' };
  var DSTEEL = { d: '#1C1E1C', m: '#50544E', l: '#747A70', h: '#A8ACA0' };
  function segmented(ctx, x0, x1, y0, y1, rows, seed) {
    ctx.strokeStyle = 'rgba(40,24,12,0.5)'; ctx.lineWidth = 1.1;
    var rh = (y1 - y0) / rows;
    for (var r = 1; r < rows; r++) { ctx.beginPath(); ctx.moveTo(x0, y0 + r * rh); ctx.lineTo(x1, y0 + r * rh); ctx.stroke(); }
    for (r = 0; r < rows; r++) {
      var off = (r & 1) ? 0.5 : 0, n = Math.max(2, Math.round((x1 - x0) / 34));
      for (var c = 1; c < n; c++) {
        var x = x0 + (x1 - x0) * ((c - off) / n);
        if (x <= x0 + 2 || x >= x1 - 2) continue;
        ctx.beginPath(); ctx.moveTo(x, y0 + r * rh); ctx.lineTo(x, y0 + (r + 1) * rh); ctx.stroke();
      }
    }
    streaks(ctx, seed, x0, x1, y0, (y1 - y0) * 0.7, Math.round((x1 - x0) / 3), '#5A2408');
    streaks(ctx, seed + 7, x0, x1, y0 + (y1 - y0) * 0.3, (y1 - y0) * 0.5, Math.round((x1 - x0) / 5), '#C86A2A');
  }
  function truss(ctx, x0, y0, x1, y1, n, vertical) {
    ctx.strokeStyle = '#1A1A18'; ctx.lineWidth = 3;
    ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
    ctx.strokeStyle = '#6E706A'; ctx.lineWidth = 1.6;
    ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
    ctx.lineWidth = 1.1; ctx.beginPath();
    for (var i = 0; i < n; i++) {
      if (vertical) { var a = y0 + (y1 - y0) * i / n, b = y0 + (y1 - y0) * (i + 1) / n; ctx.moveTo(x0, a); ctx.lineTo(x1, b); ctx.moveTo(x1, a); ctx.lineTo(x0, b); }
      else { var p = x0 + (x1 - x0) * i / n, q = x0 + (x1 - x0) * (i + 1) / n; ctx.moveTo(p, y0); ctx.lineTo(q, y1); ctx.moveTo(p, y1); ctx.lineTo(q, y0); }
    }
    ctx.stroke();
  }
  function paintOilRefinery(ctx, W, H, frame, dir, def, type, opts) {
    var k = W / 320, working = !!(opts && opts.working), f = working ? frame & 15 : 0;
    begin(ctx, W, H, dir, 179, 196, k * 0.95, k * 0.9);
    var i;
    // back output risers (only at their real place when facing north)
    if (dir === 0) REF_PORTS.fout.forEach(function (p, j) { riser(ctx, 179 + p[0] * 64, 38, 26, 11, 24, STEEL, j); });
    // left scaffold tank
    ctx.fillStyle = '#1C2220'; ctx.fillRect(10, 46, 68, 178);
    var sg = ctx.createLinearGradient(12, 0, 76, 0); sg.addColorStop(0, '#34403C'); sg.addColorStop(0.3, '#62706A'); sg.addColorStop(1, '#2A3230');
    ctx.fillStyle = sg; ctx.fillRect(12, 48, 64, 174);
    ctx.fillStyle = '#4A5650'; [52, 132, 212].forEach(function (y) { ctx.fillRect(10, y, 68, 7); });
    ctx.fillStyle = '#2A302C'; [14, 70].forEach(function (x) { ctx.fillRect(x, 48, 5, 174); });
    bolts(ctx, [[22, 56], [66, 56], [22, 136], [66, 136], [22, 216], [66, 216]], 1.6, '#A8B0A8');
    cylV(ctx, 44, 7, 3, 58, 70, STEEL, true);
    // back pipe rack on the right
    tube(ctx, [[196, 94], [336, 94]], 5, RUSTP);
    tube(ctx, [[190, 110], [262, 110], [262, 150]], 4.5, RUSTP);
    [286, 318].forEach(function (x) { tube(ctx, [[x, 60], [x, 150]], 4.5, RUSTP); });
    tube(ctx, [[240, 62], [240, 94]], 4, RUSTP);
    // grey capsule tank (right)
    dome(ctx, 300, 192, 38, 44, '#C4C2B4', '#7A7C70', '#2A2C26');
    ctx.strokeStyle = 'rgba(170,80,30,0.7)'; ctx.lineWidth = 2;
    [-0.5, 0, 0.5].forEach(function (o) { ctx.beginPath(); ctx.ellipse(300, 192 + o * 40, 38 * Math.sqrt(1 - o * o * 0.9), 6, 0, 0, Math.PI); ctx.stroke(); });
    // vertical truss behind the middle
    truss(ctx, 192, 150, 214, 320, 6, true);
    // main tower: rusty lower half, platform ring, cream insulated top with the glowing rim
    ctx.beginPath(); ctx.ellipse(128, 138, 74, 27, 0, Math.PI, 0); ctx.strokeStyle = '#2A1408'; ctx.lineWidth = 7; ctx.stroke();
    ctx.strokeStyle = '#7A4A30'; ctx.lineWidth = 4; ctx.stroke();
    cylV(ctx, 128, 54, 20, 118, 292, RUST, false);
    segmented(ctx, 76, 180, 130, 290, 5, 11);
    cylV(ctx, 128, 50, 18, 46, 126, CREAM, false);
    segmented(ctx, 80, 176, 50, 124, 3, 23);
    ctx.beginPath(); ctx.ellipse(128, 46, 50, 18, 0, 0, Math.PI * 2); ctx.fillStyle = '#E6E0D2'; ctx.fill(); ctx.strokeStyle = '#4A4238'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(128, 46, 40, 13, 0, 0, Math.PI * 2); ctx.fillStyle = working ? '#FF8A30' : '#B0501E'; ctx.fill();
    ctx.beginPath(); ctx.ellipse(128, 47, 30, 9, 0, 0, Math.PI * 2); ctx.fillStyle = '#1E120A'; ctx.fill();
    if (working) {
      var fl = 0.7 + 0.3 * Math.sin(f / 16 * Math.PI * 4);
      var gl = ctx.createRadialGradient(128, 44, 2, 128, 44, 46);
      gl.addColorStop(0, 'rgba(255,200,110,' + (0.6 * fl).toFixed(2) + ')'); gl.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.save(); ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = gl; ctx.fillRect(80, 20, 96, 60); ctx.restore();
      for (i = 0; i < 6; i++) { // soft flame tongues rising out of the rim
        var fx = 104 + i * 9.5 + 3 * Math.sin(f + i), fh = 12 + 12 * hash(i, f) * fl, fg = ctx.createRadialGradient(fx, 46 - fh * 0.4, 1, fx, 46 - fh * 0.4, fh * 0.7);
        fg.addColorStop(0, 'rgba(255,236,160,0.95)'); fg.addColorStop(0.45, 'rgba(255,150,50,0.7)'); fg.addColorStop(1, 'rgba(255,90,20,0)');
        ctx.fillStyle = fg; ctx.beginPath(); ctx.ellipse(fx, 46 - fh * 0.4, 5, fh * 0.6, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.beginPath(); ctx.ellipse(128, 138, 74, 27, 0, 0, Math.PI); ctx.strokeStyle = '#2A1408'; ctx.lineWidth = 7; ctx.stroke();
    ctx.strokeStyle = '#8A5634'; ctx.lineWidth = 4; ctx.stroke();
    // rust pipe from the tower top down its left side
    tube(ctx, [[114, 48], [114, 22], [92, 16], [84, 30], [84, 100], [70, 118]], 7, RUSTP);
    // slim cream column
    cylV(ctx, 174, 22, 8, 150, 292, CREAM, true);
    segmented(ctx, 152, 196, 156, 290, 5, 37);
    dome(ctx, 174, 150, 16, 8, '#FFFDF0', '#D0C8B8', '#6A6254');
    ctx.fillStyle = '#C86A2A'; ctx.beginPath(); ctx.arc(174, 144, 4, 0, Math.PI * 2); ctx.fill();
    // dark column with the crenellated crown
    ctx.beginPath(); ctx.ellipse(246, 128, 46, 16, 0, Math.PI, 0); ctx.strokeStyle = '#6A3A1C'; ctx.lineWidth = 4; ctx.stroke();
    cylV(ctx, 246, 20, 7, 110, 334, DSTEEL, false);
    streaks(ctx, 51, 228, 264, 120, 120, 8, '#9A4A18');
    cylV(ctx, 246, 24, 9, 74, 118, CREAM, false);
    ctx.beginPath(); ctx.ellipse(246, 76, 24, 9, 0, 0, Math.PI * 2); ctx.fillStyle = '#0E0C0A'; ctx.fill();
    for (i = 0; i < 9; i++) { // crenellations round the crown rim
      var ca = Math.PI * (0.05 + i / 8 * 0.9), cxn = 246 - Math.cos(ca) * 22, cyn = 76 + Math.sin(ca) * 8;
      ctx.fillStyle = '#1E1A14'; ctx.fillRect(cxn - 3.6, cyn - 15, 7.2, 16);
      ctx.fillStyle = i < 4 ? '#E4DECE' : '#B8B0A0'; ctx.fillRect(cxn - 2.8, cyn - 14, 5.6, 14);
    }
    ctx.beginPath(); ctx.ellipse(246, 128, 46, 16, 0, 0, Math.PI); ctx.strokeStyle = '#8A4A22'; ctx.lineWidth = 4; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(246, 232, 40, 14, 0, 0, Math.PI * 2); ctx.strokeStyle = '#7A4424'; ctx.lineWidth = 4; ctx.stroke();
    // front pipe runs and the girders
    truss(ctx, 140, 322, 226, 360, 5, false);
    tube(ctx, [[112, 262], [112, 300], [290, 300]], 5, RUSTP);
    tube(ctx, [[124, 322], [252, 322], [266, 296]], 5, GREY);
    tube(ctx, [[196, 250], [220, 250], [220, 286]], 4, RUSTP);
    // the two big grey elbows at the bottom corners
    tube(ctx, curve([[100, 214], [44, 232], [42, 280], [40, 346], [112, 348]], 10), 22, GREY);
    flange(ctx, 72, 226, 22, -0.3, GREY); flange(ctx, 42, 290, 22, Math.PI / 2, GREY); flange(ctx, 98, 347, 22, 0, GREY);
    tube(ctx, curve([[300, 234], [326, 262], [318, 300], [312, 334], [278, 336]], 10), 16, GREY);
    flange(ctx, 321, 280, 16, 1.6, GREY);
    // front input risers
    if (dir === 0) REF_PORTS.fin.forEach(function (p, j) { riser(ctx, 179 + p[0] * 64, 350, 24, 10, 14, STEEL, j + 3); });
    grime(ctx, 401, 0, 0, 354, 381, 4400, ['rgba(26,14,6,0.3)', 'rgba(26,14,6,0.22)', 'rgba(150,70,24,0.26)', 'rgba(255,240,215,0.1)']);
    ctx.restore();
    // turned refinery: flanged risers at the rotated port positions (the art above stays
    // world-aligned, so only the connections move)
    if (dir !== 0) {
      ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(-dir * Math.PI / 2);
      var t = W / 5;
      REF_PORTS.fout.concat(REF_PORTS.fin).forEach(function (p, j) {
        var v = F.util.rotVec([p[0], p[1] * 1.1], dir);
        ctx.save(); ctx.translate(v[0] * t, v[1] * t); ctx.scale(k * 0.95, k * 0.9); riser(ctx, 0, 0, 24, 10, 14, STEEL, j); ctx.restore();
      });
      ctx.restore();
    }
  }

  // -----------------------------------------------------------------------
  // Storage tank (3x3) — reference 219x215, footprint centre (110,100).
  // -----------------------------------------------------------------------
  var TSTEEL = { d: '#1C1610', m: '#645A4C', l: '#8E8270', h: '#C8BCA6' };
  function paintStorageTank(ctx, W, H, frame, dir, def, type, opts) {
    var k = W / 192, fc = fluidColor(opts && opts.fluid);
    begin(ctx, W, H, dir, 110, 100, k * 0.98, k * 0.98);
    // corner pipe work behind the tank
    cylV(ctx, 32, 14, 5, 6, 64, TSTEEL, true);
    cylV(ctx, 188, 14, 5, 6, 64, TSTEEL, true);
    tube(ctx, [[104, 16], [168, 16]], 5, TSTEEL);
    [14, 206].forEach(function (x) { ctx.fillStyle = '#3A3028'; ctx.fillRect(x - 4, 10, 8, 180); ctx.fillStyle = '#6A5A48'; for (var b = 0; b < 9; b++) ctx.fillRect(x - 4, 16 + b * 20, 8, 3); });
    // front wall
    ctx.beginPath(); ctx.moveTo(40, 96); ctx.lineTo(44, 160); ctx.quadraticCurveTo(110, 206, 176, 160); ctx.lineTo(180, 96); ctx.closePath();
    var fw = ctx.createLinearGradient(40, 0, 180, 0);
    fw.addColorStop(0, '#2A241E'); fw.addColorStop(0.3, '#5A5044'); fw.addColorStop(0.55, '#4A4238'); fw.addColorStop(1, '#221C16');
    ctx.fillStyle = fw; ctx.fill(); ctx.strokeStyle = '#141008'; ctx.lineWidth = 1.2; ctx.stroke();
    streaks(ctx, 61, 50, 170, 120, 50, 22, '#6A3614');
    // shallow dome with its riveted rim
    ctx.beginPath(); ctx.ellipse(110, 68, 82, 56, 0, 0, Math.PI * 2);
    var dg = ctx.createRadialGradient(96, 50, 6, 110, 68, 88);
    dg.addColorStop(0, '#A89C86'); dg.addColorStop(0.55, '#766A58'); dg.addColorStop(1, '#3A3228');
    ctx.fillStyle = dg; ctx.fill(); ctx.strokeStyle = '#1E1812'; ctx.lineWidth = 1.4; ctx.stroke();
    ctx.save(); ctx.beginPath(); ctx.ellipse(110, 68, 82, 56, 0, 0, Math.PI * 2); ctx.clip();
    for (var st = 0; st < 10; st++) {
      var sx = 40 + 140 * hash(st, 71), sy = 20 + 90 * hash(st, 72), sr = 8 + 14 * hash(st, 73);
      var rg = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
      rg.addColorStop(0, hash(st, 74) < 0.6 ? 'rgba(150,70,30,0.35)' : 'rgba(230,222,205,0.25)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg; ctx.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
    }
    ctx.strokeStyle = 'rgba(40,30,20,0.35)'; ctx.lineWidth = 1;
    for (var sp = 0; sp < 8; sp++) { var a = sp / 8 * Math.PI * 2; ctx.beginPath(); ctx.moveTo(110, 58); ctx.lineTo(110 + Math.cos(a) * 90, 58 + Math.sin(a) * 62); ctx.stroke(); }
    ctx.restore();
    var rim = [];
    for (var rv = 0; rv < 40; rv++) { var ra = rv / 40 * Math.PI * 2; rim.push([110 + Math.cos(ra) * 78, 68 + Math.sin(ra) * 52.5]); }
    bolts(ctx, rim, 1.2, 'rgba(210,200,180,0.7)');
    // hub and the pipes radiating from it
    tube(ctx, [[96, 48], [54, 42], [48, 70], [48, 96]], 4, TSTEEL);
    tube(ctx, [[122, 58], [176, 90]], 2.5, TSTEEL);
    ctx.beginPath(); ctx.ellipse(110, 58, 30, 17, 0, 0, Math.PI * 2);
    var hg = ctx.createLinearGradient(80, 41, 140, 75); hg.addColorStop(0, '#C8BEAA'); hg.addColorStop(1, '#4E4438');
    ctx.fillStyle = hg; ctx.fill(); ctx.strokeStyle = '#1E1812'; ctx.stroke();
    bolts(ctx, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(function (i) { var a = i / 10 * Math.PI * 2; return [110 + Math.cos(a) * 25, 58 + Math.sin(a) * 13.5]; }), 1.2, '#2A2218');
    cylV(ctx, 110, 12, 6, 44, 56, TSTEEL, true);
    tube(ctx, [[108, 44], [108, 0]], 5, TSTEEL); // north connection
    // side clamps (east/west connections)
    [[14, 56], [164, 206]].forEach(function (s, i) {
      ctx.fillStyle = '#1E1812'; ctx.fillRect(s[0], 92, s[1] - s[0], 28);
      var cg = ctx.createLinearGradient(0, 93, 0, 119); cg.addColorStop(0, '#A89C86'); cg.addColorStop(1, '#3E3428');
      ctx.fillStyle = cg; ctx.fillRect(s[0] + 1, 93, s[1] - s[0] - 2, 26);
      bolts(ctx, [[s[0] + 6, 99], [s[1] - 6, 99], [s[0] + 6, 113], [s[1] - 6, 113]], 1.3);
      tube(ctx, [[i ? 184 : 36, 120], [i ? 184 : 36, 168]], 5, TSTEEL);
    });
    // front corner risers with hand wheels
    riser(ctx, 44, 162, 26, 10, 26, TSTEEL, 0.3);
    riser(ctx, 176, 162, 26, 10, 26, TSTEEL, 0.8);
    wheel(ctx, 22, 40, 7, '#8A8272'); wheel(ctx, 198, 52, 7, '#8A8272'); wheel(ctx, 52, 150, 6, '#8A8272');
    // riveted inspection hatch; its glass shows the stored fluid
    ctx.fillStyle = '#1A1510'; ctx.fillRect(92, 132, 36, 50);
    var hc = ctx.createLinearGradient(93, 133, 127, 181); hc.addColorStop(0, '#9A907E'); hc.addColorStop(1, '#4A4034');
    ctx.fillStyle = hc; ctx.fillRect(93, 133, 34, 48);
    ctx.fillStyle = '#1E1A14'; ctx.fillRect(99, 140, 22, 34);
    if (fc) { ctx.fillStyle = rgba(fc, 0.8); ctx.fillRect(100, 152, 20, 21); ctx.fillStyle = rgba(fc, 0.3); ctx.fillRect(100, 141, 20, 11); }
    else { ctx.fillStyle = '#6E6656'; ctx.fillRect(100, 141, 20, 32); }
    ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(101, 142, 4, 30);
    bolts(ctx, [[96, 136], [124, 136], [96, 158], [124, 158], [96, 178], [124, 178]], 1.3, '#C8BEAA');
    tube(ctx, [[110, 184], [110, 200]], 5, TSTEEL); // south connection
    grime(ctx, 501, 0, 0, 219, 215, 2600, ['rgba(26,16,8,0.3)', 'rgba(26,16,8,0.22)', 'rgba(150,76,30,0.26)', 'rgba(255,245,225,0.1)']);
    ctx.restore();
  }

  F.sprites.definePainter('chemical-plant', paintChemicalPlant);
  F.sprites.definePainter('oil-refinery', paintOilRefinery);
  F.sprites.definePainter('storage-tank', paintStorageTank);
})();
