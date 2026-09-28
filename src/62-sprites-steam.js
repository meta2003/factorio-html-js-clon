// 62-sprites-steam.js — the boiler and the steam engine drawn after the real Factorio sprites
// (base/graphics/entity/boiler: hr-boiler-{N,E,S,W}-idle 269x221 / 216x301 / 260x192 / 196x273;
// steam-engine: hr-steam-engine-V 225x391 and -H 352x257, 32-frame loops; references: the vanilla
// frames collected in snouz/factorio_free_graphics_for_modders, aligned to their full frames with
// the highlight masks in kirazy/reskins-bobs).
//
// What the references look like:
//   - boiler: a squat greenish-grey riveted tank whose front carries a rounded fire door with
//     three slots (the fire glows through them while burning), wrapped in copper pipes; a big
//     flanged steam outlet on the output side, a fat grey water pipe along the input row ending in
//     flanges at both connections, grey elbow pipes, a thin sooty chimney in one corner, feet;
//   - steam engine: three big cream-grey steam cylinders with orange rust runs, each capped by a
//     bolted hub with a valve stem, standing on a dark bed held by rusty orange raking legs; a
//     caged flywheel drum and a train of gears / crank on one side, grey pipe runs, and flanged
//     steam connections at both short ends. The vertical view stacks the cylinders north-south,
//     the horizontal view stands them side by side.
//
// Both are drawn world-aligned (the caller's rotation is undone) so perspective stays right in
// every direction; the boiler rearranges its parts per facing, the engine has one view per axis.
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
  var STEEL = { d: '#181814', m: '#5E605A', l: '#8E9088', h: '#CACCC2' };
  var TANK = { d: '#1A1E1A', m: '#5A6258', l: '#848C80', h: '#BCC4B6' };
  var COPPER = { d: '#2A140A', m: '#8A4A28', l: '#B8703E', h: '#EAB080' };
  var CREAM = { d: '#2A2822', m: '#8A887C', l: '#BEBCAE', h: '#E8E6DA' };
  var RUSTL = { d: '#2A1206', m: '#8A4418', l: '#B8662C', h: '#E09A5A' };

  function path(ctx, pts, rr) {
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length - 1; i++) ctx.arcTo(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], rr || 0);
    ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
  }
  function tube(ctx, pts, r, P) {
    var rr = r * 1.7;
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'butt';
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
  function collar(ctx, x, y, r, ang, P) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    var w = r * 0.6, hh = r * 1.28;
    ctx.fillStyle = P.d; ctx.fillRect(-w / 2 - 0.6, -hh - 0.6, w + 1.2, hh * 2 + 1.2);
    var g = ctx.createLinearGradient(0, -hh, 0, hh); g.addColorStop(0, P.l); g.addColorStop(0.35, P.m); g.addColorStop(1, P.d);
    ctx.fillStyle = g; ctx.fillRect(-w / 2, -hh, w, hh * 2);
    ctx.restore();
  }
  function cylV(ctx, cx, rx, ry, y0, y1, P, top) {
    var g = ctx.createLinearGradient(cx - rx, 0, cx + rx, 0);
    g.addColorStop(0, P.d); g.addColorStop(0.22, P.l); g.addColorStop(0.5, P.m); g.addColorStop(1, P.d);
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
  // flanged pipe mouth facing along (dx,dy): a bolted ring (ellipse squashed across the facing)
  // round a dark bore
  function mouth(ctx, x, y, r, dx, dy, P) {
    var rx = dx ? r * 0.36 : r, ry = dx ? r : r * 0.5;
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    var g = ctx.createLinearGradient(x - rx, y - ry, x + rx, y + ry); g.addColorStop(0, P.h); g.addColorStop(0.5, P.l); g.addColorStop(1, P.d);
    ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = P.d; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(x + dx * rx * 0.1, y + dy * ry * 0.1, rx * 0.66, ry * 0.66, 0, 0, Math.PI * 2);
    var bg = ctx.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry) * 0.66); bg.addColorStop(0, '#0A0806'); bg.addColorStop(1, '#4A3020');
    ctx.fillStyle = bg; ctx.fill();
    ctx.fillStyle = rgba(P.d, 0.9);
    for (var i = 0; i < 10; i++) { var a = i / 10 * Math.PI * 2; ctx.beginPath(); ctx.arc(x + Math.cos(a) * rx * 0.83, y + Math.sin(a) * ry * 0.83, Math.max(0.6, r * 0.06), 0, Math.PI * 2); ctx.fill(); }
  }
  function bolts(ctx, pts, r, col) {
    ctx.fillStyle = col || 'rgba(20,16,12,0.85)';
    pts.forEach(function (p) { ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, Math.PI * 2); ctx.fill(); });
  }
  function rrect(ctx, x0, y0, x1, y1, r) {
    ctx.beginPath(); ctx.moveTo(x0 + r, y0); ctx.arcTo(x1, y0, x1, y1, r); ctx.arcTo(x1, y1, x0, y1, r);
    ctx.arcTo(x0, y1, x0, y0, r); ctx.arcTo(x0, y0, x1, y0, r); ctx.closePath();
  }
  function grime(ctx, seed, x0, y0, x1, y1, n, cols) {
    ctx.save(); ctx.globalCompositeOperation = 'source-atop';
    for (var i = 0; i < n; i++) {
      ctx.fillStyle = cols[Math.floor(hash(i, seed) * cols.length) % cols.length];
      ctx.fillRect(x0 + (x1 - x0) * hash(i, seed + 1), y0 + (y1 - y0) * hash(i, seed + 2), 1 + 2 * hash(i, seed + 3), 1 + 2.6 * hash(i, seed + 4));
    }
    ctx.restore();
  }
  function streaks(ctx, seed, x0, x1, y, len, n, col, a) {
    for (var i = 0; i < n; i++) {
      var x = x0 + (x1 - x0) * hash(i, seed), l = len * (0.3 + 0.7 * hash(i, seed + 1));
      var g = ctx.createLinearGradient(0, y, 0, y + l);
      g.addColorStop(0, rgba(col, a || 0.6)); g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g; ctx.fillRect(x, y, 1.5 + 3 * hash(i, seed + 2), l);
    }
  }
  function gear(ctx, x, y, r, teeth, ang, P) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    ctx.beginPath();
    for (var i = 0; i < teeth * 2; i++) { var a = i / (teeth * 2) * Math.PI * 2, rr = i & 1 ? r * 0.84 : r; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    ctx.closePath();
    var g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r); g.addColorStop(0, P.h); g.addColorStop(0.6, P.m); g.addColorStop(1, P.d);
    ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = P.d; ctx.lineWidth = 0.8; ctx.stroke();
    ctx.fillStyle = rgba(P.d, 0.8); ctx.beginPath(); ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = P.l; ctx.beginPath(); ctx.arc(0, 0, r * 0.22, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = P.m; ctx.lineWidth = r * 0.12;
    for (i = 0; i < 4; i++) { var b = i / 4 * Math.PI * 2; ctx.beginPath(); ctx.moveTo(Math.cos(b) * r * 0.2, Math.sin(b) * r * 0.2); ctx.lineTo(Math.cos(b) * r * 0.55, Math.sin(b) * r * 0.55); ctx.stroke(); }
    ctx.restore();
  }
  function worldAligned(ctx, W, H, dir) {
    ctx.translate(W / 2, H / 2); ctx.rotate(-dir * Math.PI / 2);
  }

  // -----------------------------------------------------------------------
  // Boiler (3x2). Ports (33-power.js, facing north): steam out at the north edge centre, water
  // in/out at the west and east ends of the south row. Drawn in hr px of the world-aligned box
  // (192x128 facing N/S, 128x192 facing E/W), origin at the box's top-left.
  // -----------------------------------------------------------------------
  function paintBoiler(ctx, W, H, frame, dir, def, type, opts) {
    var k = W / 192, working = !!(opts && opts.working), f = frame & 15;
    var horiz = (dir & 1) === 0, bw = horiz ? 192 : 128, bh = horiz ? 128 : 192;
    ctx.save(); worldAligned(ctx, W, H, dir); ctx.scale(k, k); ctx.translate(-bw / 2, -bh / 2);
    // steam side and the water row, in world terms
    var out = [[0, -1], [1, 0], [0, 1], [-1, 0]][dir];
    var wx0, wy0, wx1, wy1; // water pipe ends (flanges at the two input connections)
    if (horiz) { var wy = dir === 0 ? 96 : 32; wx0 = 4; wx1 = 188; wy0 = wy1 = wy; }
    else { var wxc = dir === 1 ? 32 : 96; wy0 = 4; wy1 = 188; wx0 = wx1 = wxc; }
    // tank body box (front face), leaving room for the outlet side
    var tb = horiz ? (dir === 0 ? [50, 30, 144, 116] : [48, 12, 142, 98]) : (dir === 1 ? [22, 44, 108, 148] : [20, 44, 106, 148]);
    // feet and base plate
    ctx.fillStyle = '#1A1814';
    [[tb[0] + 8, tb[3] + 2], [(tb[0] + tb[2]) / 2 - 5, tb[3] + 2], [tb[2] - 18, tb[3] + 2]].forEach(function (p) { ctx.fillRect(p[0], p[1], 10, 8); });
    // the fat water pipe along the input row (behind the tank), flanged at both connections
    tube(ctx, [[wx0, wy0], [wx1, wy1]], 17, STEEL);
    if (horiz) {
      [40, 160].forEach(function (x) { collar(ctx, x, wy0, 17, 0, STEEL); });
      mouth(ctx, wx0, wy0, 20, -1, 0, STEEL); mouth(ctx, wx1, wy1, 20, 1, 0, STEEL);
    } else {
      [30, 166].forEach(function (y) { collar(ctx, wx0, y, 17, Math.PI / 2, STEEL); });
      mouth(ctx, wx0, wy0, 20, 0, -1, STEEL); mouth(ctx, wx1, wy1, 20, 0, 1, STEEL);
    }
    // chimney (back corner)
    var ch = horiz ? (dir === 0 ? [28, 6] : [166, 6]) : (dir === 1 ? [112, 8] : [18, 110]);
    cylV(ctx, ch[0], 7, 3, ch[1], ch[1] + 58, STEEL, true);
    ctx.fillStyle = '#0C0A08'; ctx.beginPath(); ctx.ellipse(ch[0], ch[1], 4.5, 2, 0, 0, Math.PI * 2); ctx.fill();
    streaks(ctx, 11 + dir, ch[0] - 6, ch[0] + 4, ch[1] + 2, 30, 4, '#0C0A08', 0.5);
    if (working) {
      for (var s = 0; s < 3; s++) {
        var t = ((f + s * 5) % 16) / 16;
        ctx.fillStyle = 'rgba(70,66,62,' + (0.35 * (1 - t)).toFixed(2) + ')';
        ctx.beginPath(); ctx.arc(ch[0] + t * 6, ch[1] - 4 - t * 14, 3 + t * 6, 0, Math.PI * 2); ctx.fill();
      }
    }
    // steam outlet
    if (dir === 0) { cylV(ctx, 96, 22, 10, 10, 44, STEEL, false); mouth(ctx, 96, 12, 24, 0, -1, STEEL); }
    else if (dir === 2) { tube(ctx, [[96, 90], [96, 112]], 20, STEEL); mouth(ctx, 96, 116, 24, 0, 1, STEEL); }
    else { var ox = dir === 1 ? 112 : 16; tube(ctx, [[dir === 1 ? 96 : 32, 96], [ox, 96]], 20, STEEL); mouth(ctx, ox, 96, 24, out[0], 0, STEEL); }
    // grey elbows from the water pipe into the tank
    if (horiz) {
      tube(ctx, [[40, wy0], [40, (tb[1] + tb[3]) / 2], [tb[0] + 4, (tb[1] + tb[3]) / 2 - 8]], 9, STEEL);
      tube(ctx, [[160, wy0], [160, tb[1] + 16], [tb[2] - 4, tb[1] + 16]], 10, STEEL);
    } else {
      tube(ctx, [[wx0, 30], [(tb[0] + tb[2]) / 2, 30], [(tb[0] + tb[2]) / 2, tb[1] + 4]], 9, STEEL);
      tube(ctx, [[wx0, 166], [(tb[0] + tb[2]) / 2 + 10, 166], [(tb[0] + tb[2]) / 2 + 10, tb[3] - 4]], 10, STEEL);
    }
    // tank: rounded riveted body with a lit top edge
    rrect(ctx, tb[0], tb[1], tb[2], tb[3], 12);
    var tg = ctx.createLinearGradient(tb[0], 0, tb[2], 0);
    tg.addColorStop(0, TANK.d); tg.addColorStop(0.2, TANK.l); tg.addColorStop(0.55, TANK.m); tg.addColorStop(1, TANK.d);
    ctx.fillStyle = tg; ctx.fill(); ctx.strokeStyle = '#0E100E'; ctx.lineWidth = 1.4; ctx.stroke();
    ctx.save(); rrect(ctx, tb[0], tb[1], tb[2], tb[3], 12); ctx.clip();
    var top = ctx.createLinearGradient(0, tb[1], 0, tb[1] + 14); top.addColorStop(0, 'rgba(220,228,210,0.5)'); top.addColorStop(1, 'rgba(220,228,210,0)');
    ctx.fillStyle = top; ctx.fillRect(tb[0], tb[1], tb[2] - tb[0], 14);
    ctx.restore();
    // rounded top of the tank: a lit band with its own rivet row
    rrect(ctx, tb[0] + 3, tb[1] - 6, tb[2] - 3, tb[1] + 12, 9);
    var tf = ctx.createLinearGradient(0, tb[1] - 6, 0, tb[1] + 12); tf.addColorStop(0, '#A8B0A2'); tf.addColorStop(0.5, '#7C8478'); tf.addColorStop(1, '#4A5048');
    ctx.fillStyle = tf; ctx.fill(); ctx.strokeStyle = '#101210'; ctx.lineWidth = 1; ctx.stroke();
    var rv = [];
    for (var i = 0; i < 9; i++) { var u = tb[0] + 6 + (tb[2] - tb[0] - 12) * i / 8; rv.push([u, tb[1] + 3]); rv.push([u, tb[1] + 16]); rv.push([u, tb[3] - 5]); }
    for (i = 2; i < 6; i++) { var v = tb[1] + (tb[3] - tb[1]) * i / 6; rv.push([tb[0] + 5, v]); rv.push([tb[2] - 5, v]); }
    bolts(ctx, rv, 1.3, 'rgba(200,190,160,0.75)');
    // fire door with three slots (glowing while burning)
    var gx = (tb[0] + tb[2]) / 2, gy = tb[1] + (tb[3] - tb[1]) * 0.36, gw = 30, gh = 28;
    rrect(ctx, gx - gw / 2 - 3, gy - gh / 2 - 3, gx + gw / 2 + 3, gy + gh / 2 + 3, 8); ctx.fillStyle = '#1C1E1A'; ctx.fill();
    rrect(ctx, gx - gw / 2, gy - gh / 2, gx + gw / 2, gy + gh / 2, 7);
    var dg = ctx.createLinearGradient(gx - gw / 2, gy - gh / 2, gx + gw / 2, gy + gh / 2); dg.addColorStop(0, '#9AA296'); dg.addColorStop(1, '#3E443C');
    ctx.fillStyle = dg; ctx.fill();
    var glow = working ? 0.75 + 0.25 * Math.sin(f / 16 * Math.PI * 6) : 0;
    for (i = -1; i <= 1; i++) {
      var sx = gx + i * 8;
      ctx.fillStyle = '#0A0806'; ctx.fillRect(sx - 2.6, gy - 9, 5.2, 18);
      if (working) {
        var fg = ctx.createLinearGradient(0, gy + 9, 0, gy - 9);
        fg.addColorStop(0, 'rgba(255,220,120,' + glow.toFixed(2) + ')'); fg.addColorStop(1, 'rgba(255,110,30,' + (glow * 0.7).toFixed(2) + ')');
        ctx.fillStyle = fg; ctx.fillRect(sx - 2, gy - 8, 4, 16);
      }
    }
    if (working) {
      var gl = ctx.createRadialGradient(gx, gy, 2, gx, gy, 30);
      gl.addColorStop(0, 'rgba(255,150,60,' + (0.35 * glow).toFixed(2) + ')'); gl.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.save(); ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = gl; ctx.fillRect(gx - 30, gy - 30, 60, 60); ctx.restore();
    }
    bolts(ctx, [[gx - gw / 2 + 3, gy - gh / 2 + 3], [gx + gw / 2 - 3, gy - gh / 2 + 3], [gx - gw / 2 + 3, gy + gh / 2 - 3], [gx + gw / 2 - 3, gy + gh / 2 - 3]], 1.2);
    // copper pipe work round the tank
    if (horiz) {
      tube(ctx, [[tb[0] - 6, tb[1] + 4], [tb[0] - 6, tb[3] + 2], [tb[2] + 6, tb[3] + 2]], 2.8, COPPER);
      tube(ctx, [[tb[0] + 4, tb[3] - 20], [tb[2] - 6, tb[3] - 20]], 2.6, COPPER);
      tube(ctx, [[tb[2] + 8, tb[1] + 6], [tb[2] + 8, tb[3] - 14]], 2.4, COPPER);
    } else {
      tube(ctx, [[tb[0] - 5, tb[1] + 4], [tb[0] - 5, tb[3] + 2], [tb[2] + 4, tb[3] + 2]], 2.8, COPPER);
      tube(ctx, [[tb[0] + 6, tb[3] - 16], [tb[2] - 6, tb[3] - 16]], 2.6, COPPER);
    }
    // small gauge
    var gg = [tb[2] - 16, tb[3] - 30];
    ctx.fillStyle = '#1A1A16'; ctx.fillRect(gg[0] - 6, gg[1] - 5, 12, 10);
    ctx.fillStyle = '#C8C8B8'; ctx.fillRect(gg[0] - 4.5, gg[1] - 3.5, 4, 7); ctx.fillRect(gg[0] + 0.5, gg[1] - 3.5, 4, 7);
    grime(ctx, 71 + dir, 0, 0, bw, bh, 1500, ['rgba(20,16,10,0.3)', 'rgba(20,16,10,0.22)', 'rgba(140,72,30,0.24)', 'rgba(255,245,225,0.1)']);
    ctx.restore();
  }

  // -----------------------------------------------------------------------
  // Steam engine (3x5, axis north-south at dir 0, east-west at dir 1). Steam connections at both
  // short ends.
  // -----------------------------------------------------------------------
  function stain(ctx, seed, x0, x1, y0, y1) {
    ctx.save(); ctx.globalCompositeOperation = 'source-atop';
    streaks(ctx, seed, x0, x1, y0, (y1 - y0) * 0.9, Math.round((x1 - x0) / 5), '#B05A1A', 0.55);
    for (var i = 0; i < 6; i++) {
      var x = x0 + (x1 - x0) * hash(i, seed + 9), y = y0 + (y1 - y0) * 0.2 * hash(i, seed + 8), r = 5 + 8 * hash(i, seed + 7);
      var g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(190,100,30,0.55)'); g.addColorStop(1, 'rgba(190,100,30,0)');
      ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.restore();
  }
  // one steam cylinder: body with rust runs, top with a rusty rim, bolted hub and a valve stem
  function steamCyl(ctx, cx, rx, ry, y0, y1, seed) {
    ctx.save();
    ctx.beginPath(); ctx.moveTo(cx - rx, y0); ctx.lineTo(cx - rx, y1); ctx.ellipse(cx, y1, rx, ry, 0, Math.PI, 0, true); ctx.lineTo(cx + rx, y0); ctx.closePath();
    ctx.clip();
    cylV(ctx, cx, rx, ry, y0, y1, CREAM, false);
    streaks(ctx, seed, cx - rx, cx + rx, y0, y1 - y0 + ry, Math.round(rx / 3), '#A0501A', 0.5);
    ctx.restore();
    ctx.beginPath(); ctx.ellipse(cx, y0, rx, ry, 0, 0, Math.PI * 2);
    var tg = ctx.createRadialGradient(cx - rx * 0.3, y0 - ry * 0.3, 2, cx, y0, rx);
    tg.addColorStop(0, '#E6E4D8'); tg.addColorStop(0.6, '#B0AE9E'); tg.addColorStop(1, '#7A7666');
    ctx.fillStyle = tg; ctx.fill(); ctx.strokeStyle = '#2A2620'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(cx, y0, rx - 2, ry - 1.5, 0, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(170,84,26,0.8)'; ctx.lineWidth = 5; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(cx, y0 + 1, rx * 0.5, ry * 0.5, 0, 0, Math.PI * 2); ctx.fillStyle = '#26221C'; ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx, y0, rx * 0.46, ry * 0.46, 0, 0, Math.PI * 2);
    var hg = ctx.createLinearGradient(cx - rx * 0.46, y0 - ry * 0.46, cx + rx * 0.46, y0 + ry * 0.46); hg.addColorStop(0, '#8A8474'); hg.addColorStop(1, '#3A362E');
    ctx.fillStyle = hg; ctx.fill();
    bolts(ctx, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(function (i) { var a = i / 10 * Math.PI * 2; return [cx + Math.cos(a) * rx * 0.4, y0 + Math.sin(a) * ry * 0.4]; }), 1.1, '#C8C4B4');
    // valve stem with a blue-grey knob and linkage
    ctx.fillStyle = '#1A1A18'; ctx.fillRect(cx - 2.5, y0 - 16, 5, 16);
    ctx.fillStyle = '#6A7A86'; ctx.fillRect(cx - 1.8, y0 - 15, 3.6, 14);
    ctx.fillStyle = '#9AAAB6'; ctx.beginPath(); ctx.arc(cx, y0 - 16, 3, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#2A2A26'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(cx + 2, y0 - 12); ctx.lineTo(cx + 12, y0 - 20); ctx.lineTo(cx + 16, y0 - 8); ctx.stroke();
    ctx.strokeStyle = '#8A8C84'; ctx.lineWidth = 1; ctx.stroke();
  }
  function leg(ctx, x0, y0, x1, y1) {
    ctx.save(); ctx.lineCap = 'round';
    ctx.strokeStyle = '#1E0E04'; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.strokeStyle = '#9A4E1E'; ctx.lineWidth = 6.4; ctx.stroke();
    ctx.strokeStyle = 'rgba(230,150,80,0.6)'; ctx.lineWidth = 1.6; ctx.translate(-1.2, -1.2); ctx.stroke();
    ctx.restore();
  }
  // caged flywheel drum on a horizontal axis: ribbed band that scrolls with the phase
  function drumCage(ctx, x0, y0, x1, y1, ph, vertical) {
    ctx.fillStyle = '#141412'; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    var g = vertical ? ctx.createLinearGradient(0, y0, 0, y1) : ctx.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0, '#2A2C28'); g.addColorStop(0.3, '#8A8C84'); g.addColorStop(0.6, '#5A5C56'); g.addColorStop(1, '#1E201C');
    ctx.fillStyle = g; ctx.fillRect(x0 + 2, y0 + 2, x1 - x0 - 4, y1 - y0 - 4);
    ctx.fillStyle = 'rgba(12,12,10,0.8)';
    var n = 9, len = vertical ? (x1 - x0) : (y1 - y0);
    for (var i = 0; i < n; i++) {
      var t = ((i + ph) % n) / n, p = Math.sin(t * Math.PI - Math.PI / 2) * 0.5 + 0.5;
      if (vertical) ctx.fillRect(x0 + 2 + p * (len - 6), y0 + 3, 2.4, y1 - y0 - 6);
      else ctx.fillRect(x0 + 3, y0 + 2 + p * (len - 6), x1 - x0 - 6, 2.4);
    }
    ctx.fillStyle = '#7A3A18';
    if (vertical) { ctx.fillRect(x0, y0, x1 - x0, 4); ctx.fillRect(x0, y1 - 4, x1 - x0, 4); }
    else { ctx.fillRect(x0, y0, 4, y1 - y0); ctx.fillRect(x1 - 4, y0, 4, y1 - y0); }
  }
  // Vertical view — reference 211x374 (steam-engine-V, trimmed), footprint centre (102,204).
  function engineV(ctx, ph, ang, working) {
    // raking legs
    [112, 152, 192, 232, 272, 312].forEach(function (y) { leg(ctx, 158, y, 194, y + 20); });
    [240, 280, 320].forEach(function (y) { leg(ctx, 74, y, 40, y + 20); });
    // bed under the cylinders and the south steam box
    ctx.fillStyle = '#1C1C18'; ctx.fillRect(68, 250, 100, 58);
    var bg = ctx.createLinearGradient(70, 0, 166, 0); bg.addColorStop(0, '#2E302C'); bg.addColorStop(0.3, '#5A5C54'); bg.addColorStop(1, '#262824');
    ctx.fillStyle = bg; ctx.fillRect(70, 252, 96, 54);
    ctx.fillStyle = '#1A1C1C'; ctx.fillRect(70, 296, 72, 52);
    var sb = ctx.createLinearGradient(72, 0, 140, 0); sb.addColorStop(0, '#34404A'); sb.addColorStop(0.35, '#6A7C88'); sb.addColorStop(1, '#2A343C');
    ctx.fillStyle = sb; ctx.fillRect(72, 298, 68, 48);
    bolts(ctx, [[76, 302], [136, 302], [76, 342], [136, 342], [106, 302]], 1.4, '#B8C0C4');
    mouth(ctx, 106, 350, 30, 0, 1, STEEL);
    // right: vertical grey pipe and a dark box
    tube(ctx, [[166, 36], [166, 286]], 5, STEEL);
    ctx.fillStyle = '#1A1C1E'; ctx.fillRect(154, 128, 28, 34); ctx.fillStyle = '#3A4046'; ctx.fillRect(156, 130, 24, 30);
    // left: dark machinery mass, flywheel drum, gears and crank
    ctx.fillStyle = '#161612'; ctx.fillRect(4, 60, 70, 196);
    var lm = ctx.createLinearGradient(4, 0, 74, 0); lm.addColorStop(0, '#1E1E1A'); lm.addColorStop(0.4, '#3E3E36'); lm.addColorStop(1, '#22221E');
    ctx.fillStyle = lm; ctx.fillRect(6, 62, 66, 192);
    [14, 58].forEach(function (x) { tube(ctx, [[x, 150], [x, 250]], 3.5, STEEL); });
    drumCage(ctx, 4, 64, 66, 146, ph * 9, true);
    gear(ctx, 46, 128, 16, 14, ang, { d: '#2A2A26', m: '#C8C8BC', l: '#E8E8DC', h: '#FFFFFF' });
    gear(ctx, 36, 170, 18, 12, -ang * 0.8, STEEL);
    gear(ctx, 26, 214, 12, 10, ang * 1.2, { d: '#2A1A0C', m: '#9A7A3A', l: '#C8A060', h: '#F0D8A0' });
    var crx = 36 + Math.cos(ang) * 10, cry = 170 + Math.sin(ang) * 10;
    ctx.strokeStyle = '#1A1A18'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(crx, cry); ctx.lineTo(70, 236 + Math.sin(ang) * 4); ctx.stroke();
    ctx.strokeStyle = '#9A9A90'; ctx.lineWidth = 2.6; ctx.stroke();
    tube(ctx, [[66, 40], [66, 250]], 5, STEEL);
    tube(ctx, [[96, 20], [66, 20], [66, 40]], 5, STEEL);
    // the three steam cylinders, back to front
    steamCyl(ctx, 118, 44, 27, 40, 120, 21);
    steamCyl(ctx, 118, 44, 27, 108, 186, 22);
    steamCyl(ctx, 118, 44, 27, 174, 262, 23);
    stain(ctx, 31, 74, 162, 40, 262);
    // north steam connection
    mouth(ctx, 106, 8, 22, 0, -1, STEEL);
    if (working) { // wisps from the valve
      ctx.fillStyle = 'rgba(240,240,236,0.25)'; ctx.beginPath(); ctx.arc(128 + ph * 0.4, 20 - ph * 0.6, 4 + ph * 0.3, 0, Math.PI * 2); ctx.fill();
    }
  }
  // Horizontal view — reference 322x235 (steam-engine-H, trimmed), footprint centre (161,129).
  function engineH(ctx, ph, ang, working) {
    [[24, 60], [146, 180], [256, 300]].forEach(function (p) { leg(ctx, p[0] + 12, 186, p[0], 226); leg(ctx, p[1] - 12, 186, p[1], 226); });
    // exhaust stack on the left
    cylV(ctx, 32, 5, 2, 4, 110, STEEL, true);
    // the three cylinders (outer ones first, the middle one in front)
    steamCyl(ctx, 65, 48, 30, 46, 118, 41);
    steamCyl(ctx, 262, 48, 30, 46, 118, 43);
    steamCyl(ctx, 162, 48, 30, 46, 118, 42);
    stain(ctx, 51, 17, 310, 46, 140);
    // machinery band under the cylinders
    ctx.fillStyle = '#141410'; ctx.fillRect(14, 116, 298, 80);
    var mb = ctx.createLinearGradient(0, 120, 0, 192); mb.addColorStop(0, '#4A4C46'); mb.addColorStop(1, '#22241F');
    ctx.fillStyle = mb; ctx.fillRect(20, 120, 286, 72);
    drumCage(ctx, 32, 132, 120, 212, ph * 9, false);
    gear(ctx, 128, 172, 20, 16, ang, { d: '#2A2A26', m: '#C8C8BC', l: '#E8E8DC', h: '#FFFFFF' });
    gear(ctx, 192, 176, 28, 18, -ang * 0.7, STEEL);
    gear(ctx, 226, 164, 20, 14, ang, { d: '#2A1A0C', m: '#9A7A3A', l: '#C8A060', h: '#F0D8A0' });
    gear(ctx, 262, 150, 14, 10, -ang * 1.4, STEEL);
    var px = 192 + Math.cos(ang) * 16, py = 176 + Math.sin(ang) * 16;
    ctx.strokeStyle = '#1A1A18'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(262, 130 + Math.sin(ang) * 3); ctx.stroke();
    ctx.strokeStyle = '#A0A098'; ctx.lineWidth = 3.2; ctx.stroke();
    gear(ctx, 238, 208, 11, 10, ang * 1.8, { d: '#2A1A0C', m: '#9A7A3A', l: '#C8A060', h: '#F0D8A0' });
    // grey pipe runs
    tube(ctx, [[60, 104], [246, 104]], 5, STEEL);
    tube(ctx, [[20, 90], [12, 108], [12, 170], [34, 186]], 5, STEEL);
    tube(ctx, [[248, 104], [300, 104], [300, 180], [284, 196]], 4.5, STEEL);
    // steam connections at both ends
    mouth(ctx, 5, 124, 22, -1, 0, STEEL);
    mouth(ctx, 317, 124, 22, 1, 0, STEEL);
    if (working) {
      ctx.fillStyle = 'rgba(240,240,236,0.25)'; ctx.beginPath(); ctx.arc(32 + ph * 0.3, 4 - ph * 0.5, 3 + ph * 0.3, 0, Math.PI * 2); ctx.fill();
    }
  }
  function paintSteamEngine(ctx, W, H, frame, dir, def, type, opts) {
    var k = W / 192, working = !!(opts && opts.working), f = working ? frame & 15 : 0;
    var ph = f / 16, ang = ph * Math.PI * 2;
    ctx.save(); worldAligned(ctx, W, H, dir);
    if ((dir & 1) === 0) { ctx.scale(k * 0.97, k * 0.88); ctx.translate(-100, -183); engineV(ctx, ph, ang, working); grime(ctx, 81, 0, 0, 211, 374, 2400, ['rgba(20,14,8,0.3)', 'rgba(20,14,8,0.2)', 'rgba(150,76,30,0.24)', 'rgba(255,245,225,0.1)']); }
    else { ctx.scale(k * 1.0, k * 0.85); ctx.translate(-161, -114); engineH(ctx, ph, ang, working); grime(ctx, 82, 0, 0, 322, 235, 2400, ['rgba(20,14,8,0.3)', 'rgba(20,14,8,0.2)', 'rgba(150,76,30,0.24)', 'rgba(255,245,225,0.1)']); }
    ctx.restore();
  }

  F.sprites.definePainter('boiler', paintBoiler);
  F.sprites.definePainter('steam-engine', paintSteamEngine);
})();
