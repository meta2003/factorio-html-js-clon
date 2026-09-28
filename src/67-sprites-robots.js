// 67-sprites-robots.js — Factorio-like art for the logistic-robotics family: the roboport
// building painter (the logistic chests live in 64-sprites-chests.js), the flying
// logistic/construction robot sprites (+ shadow), and
// item icons for robot/robot-frame/battery-cell/engine. See design/BUILDING-ART.md for the
// painter contract/style and design/EXPANSION.md §6.5/§7.3/§8 for the exact APIs this file must
// expose. Registers via F.sprites.definePainter / a local F.sprites.robot·robotShadow pair /
// F.sprites.defineIcon (guarded — added concurrently by another agent); never edits 60-sprites.js.
// Pure drawing module, ES5 style, deterministic (no Math.random).
(function () {
  'use strict';
  if (!F.sprites || !F.sprites.definePainter) return;
  var L = F.sprites.lib;

  // -----------------------------------------------------------------------
  // Roboport (4x4 = 256 hr px) drawn after the real Factorio sprite (base/graphics/entity/
  // roboport/roboport-base.png 228x277, doors, antenna; reference: the vanilla base in
  // kirazy/reskins-bobs and the tier recolours in Bob's mods): a dark steel octagonal tower
  // with a big hatch in a bronze rim on top (its doors slide open while robots come and go), two
  // riveted plates and a machinery block with pipes and a vent on the front, blue-painted corner
  // arms ending in white charging brackets with red cables, and a rotating antenna on a lattice
  // mast. Idle: doors shut, antenna still.
  // -----------------------------------------------------------------------
  function rpHash(a, b) {
    var h = (a * 374761393 + b * 668265263) | 0;
    h = (h ^ (h >>> 13)) * 1274126177 | 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function rpPoly(ctx, pts, k) {
    ctx.beginPath(); ctx.moveTo(pts[0][0] * k, pts[0][1] * k);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] * k, pts[i][1] * k);
    ctx.closePath();
  }
  function rpStrut(ctx, ax, ay, bx, by, w, k) {
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#141619'; ctx.lineWidth = (w + 2) * k; ctx.beginPath(); ctx.moveTo(ax * k, ay * k); ctx.lineTo(bx * k, by * k); ctx.stroke();
    ctx.strokeStyle = '#4C6CA4'; ctx.lineWidth = w * k; ctx.stroke();
    ctx.strokeStyle = 'rgba(170,200,240,0.55)'; ctx.lineWidth = w * 0.3 * k;
    ctx.beginPath(); ctx.moveTo((ax - w * 0.2) * k, (ay - w * 0.2) * k); ctx.lineTo((bx - w * 0.2) * k, (by - w * 0.2) * k); ctx.stroke();
  }
  // White charging bracket (a U-shaped claw) at the end of a corner arm; sparks while charging.
  function rpBracket(ctx, x, y, ang, k, spark) {
    ctx.save(); ctx.translate(x * k, y * k); ctx.rotate(ang);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    var claw = function () { ctx.beginPath(); ctx.moveTo(-8 * k, -9 * k); ctx.lineTo(-8 * k, 4 * k); ctx.lineTo(8 * k, 4 * k); ctx.lineTo(8 * k, -9 * k); };
    claw(); ctx.strokeStyle = '#141619'; ctx.lineWidth = 6 * k; ctx.stroke();
    claw(); ctx.strokeStyle = '#D6D6D0'; ctx.lineWidth = 3.6 * k; ctx.stroke();
    if (spark) { L.glow(ctx, 0, -3 * k, 12 * k, '#8CF0FF', 0.7); ctx.fillStyle = '#F2FFFF'; ctx.beginPath(); ctx.arc(0, -3 * k, 2.2 * k, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }
  function rpCable(ctx, pts, k) {
    ctx.strokeStyle = '#B0201A'; ctx.lineWidth = 1.6 * k; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(pts[0][0] * k, pts[0][1] * k);
    for (var i = 1; i < pts.length - 1; i += 2) ctx.quadraticCurveTo(pts[i][0] * k, pts[i][1] * k, pts[i + 1][0] * k, pts[i + 1][1] * k);
    ctx.stroke();
  }
  function rpSteel(ctx, x0, y0, x1, y1, k, base) {
    var g = ctx.createLinearGradient(x0 * k, 0, x1 * k, 0);
    g.addColorStop(0, L.lighten(base, 30)); g.addColorStop(0.45, base); g.addColorStop(1, L.darken(base, 40));
    return g;
  }
  function rpRivets(ctx, pts, k) { pts.forEach(function (p) { ctx.fillStyle = '#16181A'; ctx.beginPath(); ctx.arc((p[0] + 0.5) * k, (p[1] + 0.5) * k, 1.4 * k, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#D0D2D0'; ctx.beginPath(); ctx.arc(p[0] * k, p[1] * k, 1 * k, 0, Math.PI * 2); ctx.fill(); }); }
  function paintRoboport(ctx, W, H, frame, dir, def, type, opts) {
    var k = W / 256, working = !!(opts && opts.working), f = working ? frame & 15 : 0;
    ctx.clearRect(0, 0, W, H);
    // corner arms with charging brackets (behind the tower)
    var arms = [[76, 96, 30, 36, -0.7], [180, 96, 226, 36, 0.7], [70, 180, 28, 158, -1.9], [186, 180, 228, 158, 1.9]];
    arms.forEach(function (a, i) {
      rpStrut(ctx, a[0], a[1], a[2], a[3], 9, k);
      rpStrut(ctx, a[0], a[1] + 16, (a[0] + a[2]) / 2, (a[1] + a[3]) / 2 + 12, 6, k);
      rpCable(ctx, [[a[0], a[1] + 6], [(a[0] + a[2]) / 2 + 6, (a[1] + a[3]) / 2 + 14], [a[2], a[3] + 8]], k);
      rpBracket(ctx, a[2], a[3], a[4], k, working && ((f >> 2) & 3) === i);
    });
    // octagonal tower
    var body = [[80, 34], [176, 34], [198, 66], [202, 204], [194, 250], [62, 250], [54, 204], [58, 66]];
    ctx.save(); ctx.translate(4 * k, 4 * k); rpPoly(ctx, body, k); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill(); ctx.restore();
    rpPoly(ctx, body, k); ctx.fillStyle = rpSteel(ctx, 54, 0, 202, 0, k, '#666A6E'); ctx.fill();
    ctx.strokeStyle = '#121416'; ctx.lineWidth = 1.2 * k; ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(58 * k, 124 * k, 144 * k, 3 * k);
    // light side frames up the tower flanks, panel seams, small side boxes
    [[56, 70, 64, 246], [192, 70, 200, 246]].forEach(function (f) {
      var fg = ctx.createLinearGradient(f[0] * k, 0, f[2] * k, 0); fg.addColorStop(0, '#C8CCCE'); fg.addColorStop(1, '#6A6E72');
      ctx.fillStyle = fg; ctx.fillRect(f[0] * k, f[1] * k, (f[2] - f[0]) * k, (f[3] - f[1]) * k);
      ctx.strokeStyle = '#121416'; ctx.lineWidth = 0.8 * k; ctx.strokeRect(f[0] * k, f[1] * k, (f[2] - f[0]) * k, (f[3] - f[1]) * k);
      rpRivets(ctx, [[(f[0] + f[2]) / 2, 90], [(f[0] + f[2]) / 2, 150], [(f[0] + f[2]) / 2, 210]], k);
    });
    ctx.strokeStyle = 'rgba(10,12,14,0.6)'; ctx.lineWidth = 1 * k;
    [[66, 164, 190, 164], [128, 128, 128, 164]].forEach(function (l) { ctx.beginPath(); ctx.moveTo(l[0] * k, l[1] * k); ctx.lineTo(l[2] * k, l[3] * k); ctx.stroke(); });
    L.panel(ctx, 40 * k, 112 * k, 18 * k, 30 * k, '#7A7E82', { r: 2 * k, hi: 20, lo: 30, outlineWidth: 0.8 * k });
    L.panel(ctx, 198 * k, 112 * k, 18 * k, 30 * k, '#5E6266', { r: 2 * k, hi: 16, lo: 30, outlineWidth: 0.8 * k });
    // antenna mast + small boxes on the top edge
    ctx.fillStyle = '#26292C'; ctx.fillRect(90 * k, 6 * k, 14 * k, 34 * k);
    ctx.strokeStyle = '#6A6E72'; ctx.lineWidth = 1 * k;
    for (var m = 0; m < 4; m++) { ctx.beginPath(); ctx.moveTo(90 * k, (8 + m * 8) * k); ctx.lineTo(104 * k, (16 + m * 8) * k); ctx.moveTo(104 * k, (8 + m * 8) * k); ctx.lineTo(90 * k, (16 + m * 8) * k); ctx.stroke(); }
    var aa = working ? f / 16 * Math.PI * 2 : 0.4;
    ctx.save(); ctx.translate(97 * k, 6 * k); ctx.scale(1, 0.45);
    ctx.strokeStyle = '#C8CCD0'; ctx.lineWidth = 2.4 * k; ctx.lineCap = 'round';
    for (var s = 0; s < 4; s++) { var sa = aa + s * Math.PI / 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(sa) * 14 * k, Math.sin(sa) * 14 * k); ctx.stroke(); }
    ctx.restore();
    L.panel(ctx, 116 * k, 16 * k, 22 * k, 20 * k, '#3C4044', { r: 2 * k, hi: 20, lo: 30, outlineWidth: 0.8 * k });
    L.cylinder(ctx, 156 * k, 18 * k, 5 * k, 22 * k, '#B8BCC0', false, { r: 2 * k });
    L.cylinder(ctx, 164 * k, 18 * k, 5 * k, 22 * k, '#B8BCC0', false, { r: 2 * k });
    // hatch housing: raised octagon, bronze rim, opening / doors
    var hx = 128, hy = 86;
    var oct = function (rx, ry) { var p = []; for (var i = 0; i < 12; i++) { var t = Math.PI / 12 + i * Math.PI / 6; p.push([hx + Math.cos(t) * rx, hy + Math.sin(t) * ry]); } return p; };
    rpPoly(ctx, oct(68, 54), k); ctx.fillStyle = rpSteel(ctx, 64, 0, 192, 0, k, '#6C7074'); ctx.fill(); ctx.strokeStyle = '#121416'; ctx.stroke();
    rpPoly(ctx, oct(56, 44), k);
    var rg = ctx.createLinearGradient(0, 48 * k, 0, 124 * k); rg.addColorStop(0, '#C8925E'); rg.addColorStop(0.5, '#8A5634'); rg.addColorStop(1, '#4A2C18');
    ctx.fillStyle = rg; ctx.fill(); ctx.strokeStyle = '#1A100A'; ctx.stroke();
    for (var b = 0; b < 16; b++) { var bt = b / 16 * Math.PI * 2; rpRivets(ctx, [[hx + Math.cos(bt) * 50.5, hy + Math.sin(bt) * 39.5]], k); }
    rpPoly(ctx, oct(45, 35), k); ctx.fillStyle = '#050404'; ctx.fill();
    if (working) { var ig = ctx.createRadialGradient(hx * k, (hy + 6) * k, 2 * k, hx * k, hy * k, 38 * k); ig.addColorStop(0, 'rgba(160,30,20,0.35)'); ig.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = ig; rpPoly(ctx, oct(45, 35), k); ctx.fill(); }
    else { // closed doors: two plates meeting in the middle
      ctx.save(); rpPoly(ctx, oct(45, 35), k); ctx.clip();
      [[hy - 36, hy], [hy, hy + 36]].forEach(function (d, i) {
        var dg = ctx.createLinearGradient(0, d[0] * k, 0, d[1] * k); dg.addColorStop(0, i ? '#6A6E72' : '#9A9EA2'); dg.addColorStop(1, i ? '#3A3E42' : '#5E6266');
        ctx.fillStyle = dg; ctx.fillRect((hx - 46) * k, d[0] * k, 92 * k, (d[1] - d[0]) * k);
      });
      ctx.fillStyle = '#0E1012'; ctx.fillRect((hx - 46) * k, (hy - 1) * k, 92 * k, 2 * k);
      ctx.restore();
    }
    // riveted plates
    [[88, 134, 38, 26], [136, 134, 40, 26]].forEach(function (p) {
      L.panel(ctx, p[0] * k, p[1] * k, p[2] * k, p[3] * k, '#8A8E90', { r: 1.5 * k, hi: 24, lo: 30, outlineWidth: 0.8 * k });
      rpRivets(ctx, [[p[0] + 4, p[1] + 4], [p[0] + p[2] - 4, p[1] + 4], [p[0] + 4, p[1] + p[3] - 4], [p[0] + p[2] - 4, p[1] + p[3] - 4]], k);
    });
    // machinery block: vent box, pipes, rusty copper pipe
    L.panel(ctx, 70 * k, 168 * k, 54 * k, 80 * k, '#4A4E52', { r: 2 * k, hi: 20, lo: 34, outlineWidth: 1 * k });
    L.vent(ctx, 76 * k, 196 * k, 38 * k, 28 * k, 5, false);
    L.panel(ctx, 128 * k, 172 * k, 66 * k, 76 * k, '#555A5E', { r: 2 * k, hi: 20, lo: 34, outlineWidth: 1 * k });
    [104, 114].forEach(function (x) { L.cylinder(ctx, x * k, 170 * k, 6 * k, 80 * k, '#A8ACB0', false, { r: 2 * k }); });
    ctx.lineWidth = 4 * k; ctx.lineCap = 'round'; ctx.strokeStyle = '#B8BCC0';
    ctx.beginPath(); ctx.moveTo(146 * k, 196 * k); ctx.lineTo(146 * k, 178 * k); ctx.quadraticCurveTo(151 * k, 172 * k, 156 * k, 178 * k); ctx.lineTo(156 * k, 196 * k); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(164 * k, 196 * k); ctx.lineTo(164 * k, 178 * k); ctx.quadraticCurveTo(169 * k, 172 * k, 174 * k, 178 * k); ctx.lineTo(174 * k, 196 * k); ctx.stroke();
    L.cylinder(ctx, 140 * k, 200 * k, 8 * k, 40 * k, '#9A6A44', false, { r: 2 * k });
    rpRivets(ctx, [[134, 206], [150, 206], [166, 206], [182, 206], [188, 230]], k);
    // weathering
    ctx.save(); ctx.globalCompositeOperation = 'source-atop';
    for (var g = 0; g < 1600; g++) {
      var h = rpHash(g, 41);
      ctx.fillStyle = h < 0.6 ? 'rgba(15,12,10,0.2)' : (h < 0.75 ? 'rgba(130,70,36,0.3)' : 'rgba(255,250,240,0.1)');
      ctx.fillRect(256 * rpHash(g, 1) * k, 256 * rpHash(g, 2) * k, (1 + rpHash(g, 3)) * k, (1 + rpHash(g, 4)) * k);
    }
    ctx.restore();
  }

  F.sprites.definePainter(['roboport'], paintRoboport);

  // -----------------------------------------------------------------------
  // Flying robots drawn after the real Factorio sprites (base/graphics/entity/{logistic,
  // construction}-robot: 16 flight directions; references: the vanilla silhouettes and tint masks
  // in kirazy/reskins-bobs, the construction robot recolour in Bob's mods, the old vanilla icons):
  //   - logistic robot: a dark body between two light grey shield panels, two small fins on top,
  //     short legs, a red running light;
  //   - construction robot: a dark round turbine with radial vanes inside a yellow shell that
  //     wraps its back, a red light, and two dark tool arms trailing behind.
  // dir 0..15 is the flight direction (0 = north, clockwise); frame 0..7 is the hover/blink
  // cycle.
  // -----------------------------------------------------------------------
  var ROBOT_SIZE = 48;
  function stub(w, h) { return { width: w || 0, height: h || 0 }; }
  var robotCache = new Map();
  var robotShadowCache = null;

  function paintLogisticBot(ctx, S, frame, th) {
    var u = S / 48;
    var shield = function (sx) {
      ctx.beginPath(); ctx.moveTo(sx * 5 * u, -9 * u); ctx.lineTo(sx * 13 * u, -6 * u); ctx.lineTo(sx * 14 * u, 3 * u); ctx.lineTo(sx * 9 * u, 11 * u); ctx.lineTo(sx * 4.5 * u, 7 * u); ctx.closePath();
    };
    // legs
    ctx.strokeStyle = '#1C1D1F'; ctx.lineWidth = 2.4 * u; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-4 * u, 9 * u); ctx.lineTo(-6 * u, 15 * u); ctx.moveTo(4 * u, 9 * u); ctx.lineTo(6 * u, 15 * u); ctx.stroke();
    ctx.fillStyle = '#3A3B3E'; ctx.fillRect(-2.5 * u, 11 * u, 5 * u, 4 * u);
    // dark body
    var bg = ctx.createRadialGradient(-3 * u, -6 * u, 1 * u, 0, 0, 13 * u);
    bg.addColorStop(0, '#5C5E62'); bg.addColorStop(0.6, '#2E2F32'); bg.addColorStop(1, '#141517');
    ctx.fillStyle = bg; ctx.beginPath(); ctx.ellipse(0, 0, 8.5 * u, 12 * u, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#0C0D0E'; ctx.lineWidth = 0.9 * u; ctx.stroke();
    // fins
    [-1, 1].forEach(function (sx) {
      ctx.fillStyle = '#C9C9C2'; ctx.beginPath(); ctx.ellipse(sx * 6.5 * u, -13 * u, 4.5 * u, 1.8 * u, sx * 0.35, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#1A1B1C'; ctx.lineWidth = 0.7 * u; ctx.stroke();
    });
    // shield panels
    [-1, 1].forEach(function (sx) {
      shield(sx);
      var g = ctx.createLinearGradient(sx * 4 * u, -9 * u, sx * 14 * u, 11 * u);
      g.addColorStop(0, sx < 0 ? '#EDEDE6' : '#C4C4BC'); g.addColorStop(1, sx < 0 ? '#9A9A92' : '#6E6E68');
      ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = '#141516'; ctx.lineWidth = 0.9 * u; ctx.stroke();
    });
    // running light + sensor
    var blink = (frame % 8) < 3, lx = Math.sin(th || 0) * 3 * u, ly = -8 * u + (1 - Math.cos(th || 0)) * 5 * u;
    if (blink) L.glow(ctx, lx, ly, 6 * u, '#FF4A3A', 0.6);
    ctx.fillStyle = blink ? '#FF5A48' : '#6A1E18'; ctx.beginPath(); ctx.arc(lx, ly, 1.6 * u, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#8AA0A8'; ctx.beginPath(); ctx.arc(0, -2 * u, 1.3 * u, 0, Math.PI * 2); ctx.fill();
  }
  // Construction robot seen at the usual 3/4 angle: the turbine is an ellipse over a short dark
  // body; the yellow shell wraps the side facing away from the flight direction (heading th),
  // the tool arms hang down.
  function paintConstructionBot(ctx, S, frame, th) {
    var u = S / 48, cy = -2 * u, rx = 11 * u, ry = 9.5 * u;
    var back = Math.atan2(Math.cos(th), -Math.sin(th)); // screen angle of the robot's back
    var sw = Math.sin((frame % 8) / 8 * Math.PI * 2) * 1.2, lx = -Math.sin(th) * 2;
    // tool arms hanging below
    ctx.strokeStyle = '#26221E'; ctx.lineWidth = 2.2 * u; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(-4 * u, 8 * u); ctx.lineTo((-7 + lx + sw) * u, 14 * u); ctx.lineTo((-5 + lx + sw) * u, 18 * u);
    ctx.moveTo(4 * u, 8 * u); ctx.lineTo((7 + lx - sw) * u, 14 * u); ctx.lineTo((5 + lx - sw) * u, 18 * u); ctx.stroke();
    // body side + turbine face
    ctx.fillStyle = '#1A1816'; ctx.beginPath(); ctx.ellipse(0, cy + 4 * u, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(-rx, cy, rx * 2, 4 * u);
    ctx.fillStyle = '#141312'; ctx.beginPath(); ctx.ellipse(0, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2E2B28'; ctx.beginPath(); ctx.ellipse(0, cy, rx * 0.86, ry * 0.86, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#6E6862'; ctx.lineWidth = 1.2 * u;
    var rot = (frame % 8) / 8 * Math.PI / 6;
    for (var v = 0; v < 12; v++) {
      var a = rot + v * Math.PI / 6;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * rx * 0.36, cy + Math.sin(a) * ry * 0.36); ctx.lineTo(Math.cos(a) * rx * 0.82, cy + Math.sin(a) * ry * 0.82); ctx.stroke();
    }
    ctx.fillStyle = '#5A5550'; ctx.beginPath(); ctx.ellipse(0, cy, rx * 0.3, ry * 0.3, 0, 0, Math.PI * 2); ctx.fill();
    // yellow shell around the back: side band (4 px lower, darker) then the top face
    var sector = function (dy) {
      ctx.beginPath(); ctx.ellipse(0, cy + dy, rx * 1.24, ry * 1.26, 0, back - 1.45, back + 1.45);
      ctx.ellipse(0, cy + dy, rx * 0.9, ry * 0.9, 0, back + 1.45, back - 1.45, true); ctx.closePath();
    };
    sector(3.5 * u); ctx.fillStyle = '#7A5C10'; ctx.fill();
    sector(0);
    var sg = ctx.createLinearGradient(-13 * u, -12 * u, 13 * u, 10 * u);
    sg.addColorStop(0, '#F4DC6C'); sg.addColorStop(0.5, '#D8B234'); sg.addColorStop(1, '#8A6A12');
    ctx.fillStyle = sg; ctx.fill(); ctx.strokeStyle = '#2A200A'; ctx.lineWidth = 0.9 * u; ctx.stroke();
    // lugs on the shell ends and the red light at the back
    [back - 1.2, back + 1.2].forEach(function (t) {
      ctx.fillStyle = '#C8A22C'; ctx.beginPath(); ctx.arc(Math.cos(t) * rx * 1.12, cy + Math.sin(t) * ry * 1.12, 2 * u, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#2A200A'; ctx.lineWidth = 0.7 * u; ctx.stroke();
    });
    var bx = Math.cos(back) * rx * 1.1, by = cy + Math.sin(back) * ry * 1.1 + 2 * u, blink = (frame % 8) < 3;
    if (blink) L.glow(ctx, bx, by, 5 * u, '#FF4A3A', 0.6);
    ctx.fillStyle = blink ? '#FF4A3A' : '#6A1E18'; ctx.beginPath(); ctx.arc(bx, by, 1.5 * u, 0, Math.PI * 2); ctx.fill();
  }
  // The logistic robot keeps its upright look in every flight direction (as in the reference);
  // only its running light and a little lean follow the heading.
  function paintRobot(ctx, S, frame, type, dir) {
    var th = (dir | 0) / 16 * Math.PI * 2;
    ctx.save(); ctx.translate(S / 2, S / 2);
    if (type === 'construction-robot') paintConstructionBot(ctx, S, frame, th);
    else { ctx.transform(1, 0, Math.sin(th) * 0.12, 1, 0, 0); paintLogisticBot(ctx, S, frame, th); }
    ctx.restore();
  }

  // F.sprites.robot(type, frame, dir16?) -> cached 48x48 canvas (design/EXPANSION.md §6.5).
  F.sprites.robot = function (type, frame, dir) {
    if (!F.sprites.enabled) return stub(ROBOT_SIZE, ROBOT_SIZE);
    frame = ((frame | 0) % 8 + 8) % 8; dir = ((dir | 0) % 16 + 16) % 16;
    var key = type + '|' + frame + '|' + dir;
    var c = robotCache.get(key);
    if (c) return c;
    c = L.newCanvas(ROBOT_SIZE, ROBOT_SIZE);
    paintRobot(L.ctxOf(c), ROBOT_SIZE, frame, type, dir);
    robotCache.set(key, c);
    return c;
  };
  // F.sprites.robotDir(robot) -> flight direction 0..15 (0 = north, clockwise), from how the
  // robot moved since it was last drawn. Kept in a WeakMap on the render side; never touches
  // the robot object itself (rendering must not mutate F.state).
  var robotHeading = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  F.sprites.robotDir = function (r) {
    if (!robotHeading || !r) return 8;
    var h = robotHeading.get(r);
    if (!h) { h = { x: r.x, y: r.y, dir: 8 }; robotHeading.set(r, h); return h.dir; }
    var dx = r.x - h.x, dy = r.y - h.y;
    if (dx * dx + dy * dy > 0.0004) {
      h.dir = ((Math.round(Math.atan2(dx, -dy) / (Math.PI * 2) * 16) % 16) + 16) % 16;
      h.x = r.x; h.y = r.y;
    }
    return h.dir;
  };

  // F.sprites.robotShadow() -> cached 48x48 soft dark ellipse (design/EXPANSION.md §6.5).
  F.sprites.robotShadow = function () {
    if (!F.sprites.enabled) return stub(ROBOT_SIZE, ROBOT_SIZE);
    if (robotShadowCache) return robotShadowCache;
    var c = L.newCanvas(ROBOT_SIZE, ROBOT_SIZE);
    var ctx = L.ctxOf(c);
    ctx.save(); ctx.globalAlpha = 0.32; ctx.fillStyle = '#000000';
    ctx.beginPath(); ctx.ellipse(ROBOT_SIZE * 0.5, ROBOT_SIZE * 0.58, ROBOT_SIZE * 0.32, ROBOT_SIZE * 0.16, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    robotShadowCache = c;
    return c;
  };

  // -----------------------------------------------------------------------
  // Item icons — guarded: F.sprites.defineIcon is registered by a concurrently-developed art
  // pack; if it hasn't loaded yet this block is a silent no-op (per task brief).
  // -----------------------------------------------------------------------
  if (F.sprites.defineIcon) {
    // 'robot' — the drone itself, front-facing mini render (reuses the body/pod/light shapes at
    // icon scale so it reads consistently with the in-world sprite).
    F.sprites.defineIcon('robot', function (ctx, S, def) {
      ctx.save(); ctx.translate(S * 0.5, S * 0.5); ctx.scale(1.25, 1.25); ctx.translate(-S * 0.5, -S * 0.5);
      paintRobot(ctx, S, 0, def && def.id === 'construction-robot' ? 'construction-robot' : 'logistic-robot', 0);
      ctx.restore();
    });

    // 'robot-frame' — unpowered grey wireframe chassis (flying-robot-frame intermediate item):
    // same silhouette as the robot but unlit, no cargo pod, dashed outline reading "incomplete".
    F.sprites.defineIcon('robot-frame', function (ctx, S, def) {
      var col = (def && def.icon && def.icon.color) || '#9AA3AA';
      var cx = S / 2, cy = S * 0.54, bodyW = S * 0.52, bodyH = S * 0.44;
      L.panel(ctx, cx - bodyW / 2, cy - bodyH / 2, bodyW, bodyH, L.mix(col, '#2A2E30', 0.35), { r: Math.min(bodyW, bodyH) * 0.3, hi: 14, lo: 20 });
      ctx.save();
      ctx.setLineDash([S * 0.05, S * 0.045]);
      ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, S * 0.045);
      L.roundRectPath(ctx, cx - bodyW / 2, cy - bodyH / 2, bodyW, bodyH, Math.min(bodyW, bodyH) * 0.3);
      ctx.stroke();
      ctx.restore();
      var nac = [[cx - bodyW * 0.52, cy - bodyH * 0.52], [cx + bodyW * 0.52, cy - bodyH * 0.52],
        [cx - bodyW * 0.52, cy + bodyH * 0.52], [cx + bodyW * 0.52, cy + bodyH * 0.52]];
      for (var i = 0; i < 4; i++) { ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(nac[i][0], nac[i][1], S * 0.05, 0, Math.PI * 2); ctx.stroke(); }
      L.disc(ctx, cx, cy - bodyH * 0.08, bodyH * 0.14, '#1E2022', { hi: 10, lo: 10, outlineWidth: 1 });
    });

    // 'battery-cell' — cylindrical battery, silver body with a red positive-terminal cap.
    F.sprites.defineIcon('battery-cell', function (ctx, S, def) {
      var col = (def && def.icon && def.icon.color) || '#B8B8B8';
      var capCol = (def && def.icon && def.icon.color2) || '#C44A2A';
      var w = S * 0.38, x = S * 0.31, y = S * 0.2, h = S * 0.68;
      L.cylinder(ctx, x, y + h * 0.12, w, h * 0.88, col, false, { r: w * 0.16 });
      L.disc(ctx, x + w / 2, y + h * 0.12, w * 0.5, L.lighten(col, 10), { hi: 45, lo: 25, outlineWidth: 1 });
      var capH = h * 0.2;
      L.cylinder(ctx, x + w * 0.16, y, w * 0.68, capH * 1.2, capCol, false, { r: w * 0.1 });
      L.disc(ctx, x + w * 0.5, y, w * 0.34, L.lighten(capCol, 15), { hi: 45, lo: 25, outlineWidth: 1 });
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = Math.max(1, S * 0.02);
      ctx.beginPath(); ctx.moveTo(x + w * 0.5, y + h * 0.35); ctx.lineTo(x + w * 0.5, y + h * 0.32); ctx.stroke();
      ctx.strokeStyle = '#3A3A3A'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, y + h * 0.55); ctx.lineTo(x + w, y + h * 0.55); ctx.stroke();
    });

    // 'engine' — engine block with two pistons, tinted by def.icon.color/color2 (grey for
    // engine-unit, blue for electric-engine-unit — data-driven, no hard-coded item ids here).
    F.sprites.defineIcon('engine', function (ctx, S, def) {
      var col = (def && def.icon && def.icon.color) || '#8A8F94';
      var col2 = (def && def.icon && def.icon.color2) || L.darken(col, 35);
      var bw = S * 0.6, bh = S * 0.42, bx = S * 0.2, by = S * 0.4;
      L.panel(ctx, bx, by, bw, bh, col, { r: bh * 0.16, hi: 22, lo: 30 });
      var pistW = bw * 0.16;
      for (var i = 0; i < 2; i++) {
        var px2 = bx + bw * (0.28 + i * 0.44) - pistW / 2;
        L.cylinder(ctx, px2, by - S * 0.22, pistW, S * 0.24, col2, false, { r: pistW * 0.3 });
        L.disc(ctx, px2 + pistW / 2, by - S * 0.22, pistW * 0.5, L.lighten(col2, 20), { hi: 40, lo: 20, outlineWidth: 1 });
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = Math.max(1, S * 0.018);
      ctx.beginPath(); ctx.moveTo(bx + bw * 0.5, by + bh * 0.1); ctx.lineTo(bx + bw * 0.5, by + bh * 0.9); ctx.stroke();
      L.rivets(ctx, [[bx + bw * 0.12, by + bh * 0.82], [bx + bw * 0.88, by + bh * 0.82]], S * 0.02);
    });
  }
})();
