// 68-sprites-rocket.js — rocket silo art: the 9x9 painter (drawn after the real Factorio silo —
// concrete ring, launch pit, hazard-striped doors, pipes, hoses and machinery), the dynamic
// door-opening overlay (F.sprites.rocketSiloDoors) and
// the free-flying rocket sprite (F.sprites.rocket), plus item icons for low-density-structure and
// satellite. Registers via F.sprites.definePainter / F.sprites.defineIcon (design/BUILDING-ART.md
// + design/EXPANSION.md §6.5/§7.4/§8's contract) — never edits src/60-sprites.js. Pure drawing
// module, ES5 style, deterministic (no Math.random). Light comes from the top-left throughout.
(function () {
  'use strict';
  if (!F.sprites || !F.sprites.definePainter) return;
  var L = F.sprites.lib;

  // =========================================================================
  // Rocket silo (9x9) drawn after the real Factorio sprite (base/graphics/entity/rocket-silo:
  // hr-06-rocket-silo 608x596 shift (3,-1), hr-01-rocket-silo-hole 400x270, hr-04/05 door
  // back/front; references: the vanilla layers collected in snouz/factorio_free_graphics_for_
  // modders). Everything is in hr px of the 608x596 base layer, whose footprint centre is
  // (298,300); the footprint (576 px) fills the canvas.
  //
  // What the reference looks like: a thick weathered blue-grey concrete ring round a big oval
  // launch pit, the pit's far inner wall showing below the rim; two hazard-striped (yellow/black)
  // gridded door leaves meet on a slanted seam over the pit and slide apart under the ring; all
  // round the ring sit bundles of rusty copper pipes, big orange corrugated hoses looping over the
  // top and bottom, olive-green equipment cabinets, dark motor housings and a large turbine fan
  // at the bottom left; small red lights blink on the ring while rocket parts are being built.
  // =========================================================================
  var PIT = { cx: 305, cy: 305, rx: 165, ry: 105 };
  var SEAM_N = [0.95, -0.31]; // normal of the door seam, pointing at the back (upper-right) leaf
  var COPPER = { d: '#1E120A', m: '#5E3A24', l: '#8C6042', h: '#D0A884' };
  var RUSTY = { d: '#1C140E', m: '#5E4838', l: '#8A6C56', h: '#C8AE96' };
  var HOSE = { d: '#2E1608', m: '#84461F', l: '#AE6A3A', h: '#E0A87C' };

  function hsh(a, b) {
    var h = (a * 374761393 + b * 668265263) | 0;
    h = (h ^ (h >>> 13)) * 1274126177 | 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function rgbaHex(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  function siloSpace(ctx, W) { var k = W / 576; ctx.scale(k, k); ctx.translate(288 - 298, 288 - 300); }
  function linePath(ctx, pts, rr) {
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length - 1; i++) ctx.arcTo(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], rr || 0);
    ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
  }
  function pipe(ctx, pts, r, P) {
    var rr = r * 2.2;
    ctx.save(); ctx.lineJoin = 'round';
    linePath(ctx, pts, rr); ctx.strokeStyle = P.d; ctx.lineWidth = r * 2; ctx.stroke();
    linePath(ctx, pts, rr); ctx.strokeStyle = P.m; ctx.lineWidth = r * 1.6; ctx.stroke();
    ctx.translate(-r * 0.25, -r * 0.25);
    linePath(ctx, pts, rr); ctx.strokeStyle = P.l; ctx.lineWidth = r * 0.7; ctx.stroke();
    ctx.translate(-r * 0.15, -r * 0.15);
    linePath(ctx, pts, rr); ctx.strokeStyle = rgbaHex(P.h, 0.7); ctx.lineWidth = r * 0.22; ctx.stroke();
    ctx.restore();
  }
  function curvePts(pts, n) {
    var out = [pts[0]];
    for (var i = 0; i + 2 < pts.length; i += 2) {
      var a = pts[i], c = pts[i + 1], b = pts[i + 2];
      for (var j = 1; j <= n; j++) { var t = j / n, u = 1 - t; out.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]); }
    }
    return out;
  }
  // big corrugated hose: a pipe along a smooth curve with dark ribs across it
  function hose(ctx, ctrl, r) {
    var pts = curvePts(ctrl, 14);
    pipe(ctx, pts, r, HOSE);
    ctx.save(); ctx.strokeStyle = 'rgba(40,16,4,0.55)'; ctx.lineWidth = 1.3;
    var acc = 0;
    for (var i = 1; i < pts.length; i++) {
      var dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1], l = Math.sqrt(dx * dx + dy * dy) || 1;
      acc += l;
      while (acc > 4) {
        acc -= 4; var t = 1 - acc / l, x = pts[i - 1][0] + dx * t, y = pts[i - 1][1] + dy * t, nx = -dy / l * r * 0.85, ny = dx / l * r * 0.85;
        ctx.beginPath(); ctx.moveTo(x - nx, y - ny); ctx.lineTo(x + nx, y + ny); ctx.stroke();
      }
    }
    ctx.restore();
  }
  // olive-green equipment cabinet: front face, lit top, panel seams and rivets
  function cabinet(ctx, x0, y0, x1, y1, top) {
    ctx.fillStyle = '#12140C'; ctx.fillRect(x0 - 1.5, y0 - top - 1.5, x1 - x0 + 3, y1 - y0 + top + 3);
    var tg = ctx.createLinearGradient(0, y0 - top, 0, y0); tg.addColorStop(0, '#C4C890'); tg.addColorStop(1, '#8A9058');
    ctx.fillStyle = tg; ctx.fillRect(x0, y0 - top, x1 - x0, top);
    var fg = ctx.createLinearGradient(x0, 0, x1, 0); fg.addColorStop(0, '#7E8646'); fg.addColorStop(0.35, '#6A7238'); fg.addColorStop(1, '#343A1C');
    ctx.fillStyle = fg; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    ctx.strokeStyle = 'rgba(20,22,10,0.7)'; ctx.lineWidth = 1;
    for (var i = 1; i < 3; i++) { var x = x0 + (x1 - x0) * i / 3; ctx.beginPath(); ctx.moveTo(x, y0 + 3); ctx.lineTo(x, y1 - 3); ctx.stroke(); }
    ctx.fillStyle = 'rgba(230,230,200,0.5)';
    [[x0 + 3, y0 + 3], [x1 - 3, y0 + 3], [x0 + 3, y1 - 3], [x1 - 3, y1 - 3]].forEach(function (p) { ctx.beginPath(); ctx.arc(p[0], p[1], 1.2, 0, Math.PI * 2); ctx.fill(); });
  }
  // dark round motor housing (seen from above) with a bolted cap
  function motor(ctx, cx, cy, r) {
    ctx.fillStyle = '#0C0C0C'; ctx.beginPath(); ctx.arc(cx, cy, r + 1.5, 0, Math.PI * 2); ctx.fill();
    var g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
    g.addColorStop(0, '#8A8680'); g.addColorStop(0.5, '#4A4642'); g.addColorStop(1, '#1C1A18');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(10,10,10,0.6)'; ctx.lineWidth = 1.2;
    for (var i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(cx, cy, r * (0.45 + i * 0.18), Math.PI * 0.9, Math.PI * 1.9); ctx.stroke(); }
    ctx.fillStyle = '#2A2826'; ctx.beginPath(); ctx.arc(cx, cy, r * 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(210,205,195,0.6)'; ctx.beginPath(); ctx.arc(cx - r * 0.08, cy - r * 0.08, r * 0.12, 0, Math.PI * 2); ctx.fill();
  }
  // big turbine: rusty cowling round a dark fan with blades
  function turbine(ctx, cx, cy, r, ang) {
    ctx.fillStyle = '#100C08'; ctx.beginPath(); ctx.ellipse(cx, cy, r + 3, r * 0.9 + 3, 0, 0, Math.PI * 2); ctx.fill();
    var g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r); g.addColorStop(0, '#B08868'); g.addColorStop(0.5, '#6A4E3A'); g.addColorStop(1, '#2A1E16');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(cx, cy, r, r * 0.9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#141210'; ctx.beginPath(); ctx.ellipse(cx + 3, cy + 2, r * 0.72, r * 0.64, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.translate(cx + 3, cy + 2); ctx.scale(1, 0.9); ctx.rotate(ang);
    for (var i = 0; i < 7; i++) {
      ctx.rotate(Math.PI * 2 / 7);
      ctx.fillStyle = i % 2 ? '#5A5E58' : '#6A6E66';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(r * 0.3, -r * 0.2, r * 0.66, -r * 0.08); ctx.lineTo(r * 0.64, r * 0.1); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#C8C8B8'; ctx.beginPath(); ctx.arc(0, 0, r * 0.14, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  function ringPath(ctx) {
    var x0 = 50, y0 = 66, x1 = 552, y1 = 486, r = 190;
    ctx.beginPath(); ctx.moveTo(x0 + r, y0); ctx.arcTo(x1, y0, x1, y1, r); ctx.arcTo(x1, y1, x0, y1, r); ctx.arcTo(x0, y1, x0, y0, r); ctx.arcTo(x0, y0, x1, y0, r); ctx.closePath();
  }
  function holePath(ctx) { ctx.beginPath(); ctx.ellipse(PIT.cx, PIT.cy, PIT.rx, PIT.ry, 0, 0, Math.PI * 2); }
  // the open pit: far inner wall below the rim, then the dark shaft (lit from below when ready)
  function pitInterior(ctx, lit) {
    ctx.save(); holePath(ctx); ctx.clip();
    var g = ctx.createRadialGradient(PIT.cx, PIT.cy + 30, 10, PIT.cx, PIT.cy + 20, PIT.rx);
    g.addColorStop(0, lit ? '#5A4A36' : '#0A0908'); g.addColorStop(0.6, '#161412'); g.addColorStop(1, '#221E1A');
    ctx.fillStyle = g; ctx.fillRect(PIT.cx - PIT.rx, PIT.cy - PIT.ry, PIT.rx * 2, PIT.ry * 2);
    // far wall: a band under the rim, ribbed, fading into the shaft
    var wg = ctx.createLinearGradient(0, PIT.cy - PIT.ry, 0, PIT.cy - PIT.ry + 70);
    wg.addColorStop(0, '#4A4E52'); wg.addColorStop(1, 'rgba(30,30,30,0)');
    ctx.fillStyle = wg; ctx.beginPath(); ctx.ellipse(PIT.cx, PIT.cy, PIT.rx, PIT.ry, 0, Math.PI, 0); ctx.ellipse(PIT.cx, PIT.cy + 60, PIT.rx, PIT.ry, 0, 0, Math.PI, true); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2;
    for (var i = 0; i < 14; i++) { var a = Math.PI * (1.05 + i / 14 * 0.9), x = PIT.cx + Math.cos(a) * PIT.rx, y = PIT.cy + Math.sin(a) * PIT.ry; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 50); ctx.stroke(); }
    ctx.restore();
  }
  // one door leaf: hazard stripes under a skewed frame grid, slid `travel` along the seam normal
  function doorLeaf(ctx, back, travel) {
    var n = back ? SEAM_N : [-SEAM_N[0], -SEAM_N[1]], t = [-SEAM_N[1], SEAM_N[0]];
    ctx.save(); holePath(ctx); ctx.clip();
    ctx.beginPath(); ctx.ellipse(PIT.cx, PIT.cy + 24, PIT.rx - 8, PIT.ry - 6, 0, 0, Math.PI * 2); ctx.clip(); // the doors sit down in the pit
    ctx.translate(n[0] * travel, n[1] * travel);
    // the half-plane of this leaf (seam through the pit centre)
    ctx.beginPath();
    ctx.moveTo(PIT.cx + t[0] * 400, PIT.cy + t[1] * 400); ctx.lineTo(PIT.cx - t[0] * 400, PIT.cy - t[1] * 400);
    ctx.lineTo(PIT.cx - t[0] * 400 + n[0] * 400, PIT.cy - t[1] * 400 + n[1] * 400); ctx.lineTo(PIT.cx + t[0] * 400 + n[0] * 400, PIT.cy + t[1] * 400 + n[1] * 400);
    ctx.closePath(); ctx.clip();
    ctx.fillStyle = '#1A1612'; ctx.fillRect(PIT.cx - 400, PIT.cy - 400, 800, 800);
    // diagonal hazard stripes
    ctx.save(); ctx.translate(PIT.cx, PIT.cy); ctx.rotate(Math.atan2(t[1], t[0]) + Math.PI / 4);
    for (var s = -30; s < 30; s++) { ctx.fillStyle = s & 1 ? '#1A1814' : '#B8901C'; ctx.fillRect(s * 13, -400, 13, 800); }
    ctx.restore();
    // frame grid: bars along and across the seam
    ctx.save(); ctx.translate(PIT.cx, PIT.cy); ctx.rotate(Math.atan2(t[1], t[0]));
    for (var gx = -300; gx <= 300; gx += 58) { ctx.fillStyle = '#0E0C0A'; ctx.fillRect(gx - 4, -400, 8, 800); ctx.fillStyle = '#5A4E44'; ctx.fillRect(gx - 3, -400, 5, 800); ctx.fillStyle = 'rgba(230,210,180,0.35)'; ctx.fillRect(gx - 3, -400, 1.4, 800); }
    for (var gy = back ? 0 : -300; back ? gy <= 300 : gy <= 0; gy += 50) { ctx.fillStyle = '#0E0C0A'; ctx.fillRect(-400, gy - 4, 800, 8); ctx.fillStyle = '#5A4E44'; ctx.fillRect(-400, gy - 3, 800, 5); ctx.fillStyle = 'rgba(230,210,180,0.35)'; ctx.fillRect(-400, gy - 3, 800, 1.4); }
    ctx.restore();
    // shading across the leaf and a bright seam edge
    var lg = ctx.createLinearGradient(PIT.cx - 150, PIT.cy - 100, PIT.cx + 150, PIT.cy + 100);
    lg.addColorStop(0, 'rgba(255,240,200,0.12)'); lg.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = lg; ctx.fillRect(PIT.cx - 400, PIT.cy - 400, 800, 800);
    ctx.strokeStyle = '#0A0806'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(PIT.cx + t[0] * 400, PIT.cy + t[1] * 400); ctx.lineTo(PIT.cx - t[0] * 400, PIT.cy - t[1] * 400); ctx.stroke();
    ctx.restore();
  }
  function siloDoors(ctx, travel) { doorLeaf(ctx, true, travel); doorLeaf(ctx, false, travel); }
  // shadow the rim casts on whatever is in the pit (doors or shaft)
  function rimShadow(ctx) {
    ctx.save(); holePath(ctx); ctx.clip();
    var g = ctx.createLinearGradient(0, PIT.cy - PIT.ry, 0, PIT.cy - PIT.ry + 40);
    g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(PIT.cx - PIT.rx, PIT.cy - PIT.ry, PIT.rx * 2, 40);
    ctx.restore();
  }

  function paintRocketSilo(ctx, W, H, frame, dir, def, type, opts) {
    var working = !!(opts && opts.working), f = frame & 15;
    ctx.save(); siloSpace(ctx, W);
    // the ring's outer wall (its thickness shows below the top surface)
    ctx.save(); ctx.translate(0, 16); ringPath(ctx); ctx.fillStyle = '#1E2226'; ctx.fill(); ctx.restore();
    // concrete ring round the pit
    ctx.save(); ringPath(ctx); ctx.moveTo(PIT.cx + PIT.rx, PIT.cy); ctx.ellipse(PIT.cx, PIT.cy, PIT.rx, PIT.ry, 0, 0, Math.PI * 2); ctx.clip('evenodd');
    var cg = ctx.createLinearGradient(60, 70, 550, 490); cg.addColorStop(0, '#7C8892'); cg.addColorStop(0.5, '#56626C'); cg.addColorStop(1, '#30383E');
    ctx.fillStyle = cg; ctx.fillRect(40, 50, 530, 460);
    for (var i = 0; i < 2600; i++) {
      var h = hsh(i, 3);
      ctx.fillStyle = h < 0.45 ? 'rgba(20,24,28,0.25)' : (h < 0.75 ? 'rgba(200,210,220,0.18)' : 'rgba(140,80,40,0.25)');
      ctx.fillRect(50 + 510 * hsh(i, 4), 60 + 440 * hsh(i, 5), 1 + 3 * hsh(i, 6), 1 + 2 * hsh(i, 7));
    }
    for (i = 0; i < 16; i++) { // rust and water stains
      var sx = 60 + 490 * hsh(i, 11), sy = 70 + 420 * hsh(i, 12), sr = 15 + 30 * hsh(i, 13), sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
      sg.addColorStop(0, hsh(i, 14) < 0.5 ? 'rgba(120,70,36,0.35)' : 'rgba(30,40,50,0.3)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sg; ctx.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
    }
    // inner lip of the rim and the ring's shading toward its outer edge
    ctx.lineWidth = 10; holePath(ctx); ctx.strokeStyle = 'rgba(10,12,14,0.6)'; ctx.stroke();
    var og = ctx.createRadialGradient(PIT.cx, PIT.cy, PIT.rx * 0.9, PIT.cx, PIT.cy, 300);
    og.addColorStop(0, 'rgba(0,0,0,0)'); og.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = og; ctx.fillRect(40, 50, 530, 460);
    ctx.restore();
    ringPath(ctx); ctx.strokeStyle = '#141618'; ctx.lineWidth = 2; ctx.stroke();
    // closed doors in the pit
    pitInterior(ctx, false);
    siloDoors(ctx, 0);
    rimShadow(ctx);
    holePath(ctx); ctx.strokeStyle = '#0E0E0E'; ctx.lineWidth = 3; ctx.stroke();
    // small red lights on the ring, blinking while rocket parts are being built
    [[215, 212], [300, 206], [385, 222], [150, 330], [460, 330], [230, 410], [380, 408]].forEach(function (p, j) {
      var on = working && ((f >> 1) + j) % 4 === 0;
      if (on) L.glow(ctx, p[0], p[1], 14, '#FF4A2A', 0.6);
      ctx.fillStyle = on ? '#FF6A4A' : '#6A1A10'; ctx.fillRect(p[0] - 2.5, p[1] - 1.5, 5, 3);
    });
    // pipe bundles along the edges
    [30, 44, 58].forEach(function (x, j) { pipe(ctx, [[x + 40, 118 + j * 6], [x, 150 + j * 6], [x, 452 - j * 8], [x + 30, 480 - j * 8]], 5.5, COPPER); });
    [548, 562, 576].forEach(function (x, j) { pipe(ctx, [[x - 30, 96 + j * 6], [x, 126 + j * 6], [x, 380 - j * 10], [x - 40, 412 - j * 10]], 5, COPPER); });
    [96, 110].forEach(function (y, j) { pipe(ctx, [[140, y], [480 - j * 20, y], [510 - j * 20, y + 30]], 4.5, RUSTY); });
    [528, 544, 560].forEach(function (y, j) { pipe(ctx, [[150 + j * 10, y], [470, y], [520, y - 30 - j * 8]], 5.5, COPPER); });
    pipe(ctx, [[10, 360], [80, 360], [120, 400], [150, 400]], 5, COPPER);
    pipe(ctx, [[10, 380], [70, 380], [110, 420], [160, 420]], 5, COPPER);
    pipe(ctx, [[10, 400], [60, 400], [100, 440], [170, 440]], 5, COPPER);
    pipe(ctx, [[480, 180], [520, 180], [520, 250]], 6, RUSTY);
    pipe(ctx, [[470, 200], [500, 220], [500, 300]], 4, COPPER);
    // top-left: cabinet and a dark machine
    cabinet(ctx, 52, 44, 128, 102, 18);
    motor(ctx, 100, 180, 34);
    pipe(ctx, [[130, 180], [175, 180], [175, 220]], 6, RUSTY);
    ctx.fillStyle = '#D8D4CC'; ctx.beginPath(); ctx.arc(52, 205, 6, 0, Math.PI * 2); ctx.fill();
    // top: motor dome and the big hose loop
    motor(ctx, 252, 50, 26);
    hose(ctx, [[248, 92], [250, 12], [300, 10], [350, 8], [350, 70], [352, 130], [358, 190]], 13);
    // top-right: turbine block and cabinet
    motor(ctx, 412, 50, 40); motor(ctx, 380, 70, 22);
    cabinet(ctx, 502, 36, 578, 86, 14);
    pipe(ctx, [[430, 100], [460, 130], [460, 190]], 6, COPPER);
    // right: dark box
    ctx.fillStyle = '#0E0E0E'; ctx.fillRect(468, 258, 56, 74);
    var bg = ctx.createLinearGradient(470, 0, 522, 0); bg.addColorStop(0, '#5A5C5E'); bg.addColorStop(1, '#1E2022');
    ctx.fillStyle = bg; ctx.fillRect(470, 260, 52, 70);
    // bottom right: hose loops, dark machine, cabinet
    hose(ctx, [[430, 340], [470, 330], [480, 380], [488, 440], [470, 470]], 12);
    hose(ctx, [[392, 440], [430, 360], [462, 400]], 10);
    ctx.fillStyle = '#0E0E0E'; ctx.fillRect(500, 392, 60, 60);
    var db = ctx.createLinearGradient(502, 0, 558, 0); db.addColorStop(0, '#6A6C6A'); db.addColorStop(1, '#262826');
    ctx.fillStyle = db; ctx.fillRect(502, 394, 56, 56);
    cabinet(ctx, 362, 474, 438, 520, 16);
    // bottom: hose over the front and a cabinet, the turbine at the bottom left
    hose(ctx, [[250, 470], [262, 380], [300, 400], [330, 420], [350, 470], [380, 500], [410, 470]], 11);
    cabinet(ctx, 150, 446, 226, 500, 16);
    turbine(ctx, 102, 512, 50, working ? f / 16 * Math.PI * 2 / 7 : 0);
    pipe(ctx, [[150, 500], [240, 500], [260, 540]], 6, COPPER);
    // more clutter: left-side machines, valves on the right riser pipes, a gantry at the bottom right
    motor(ctx, 60, 280, 22); motor(ctx, 84, 318, 16);
    cabinet(ctx, 18, 222, 60, 256, 12);
    [150, 210, 270, 330].forEach(function (y) { ctx.fillStyle = '#1A120C'; ctx.fillRect(538, y - 4, 44, 8); ctx.fillStyle = '#8C6042'; ctx.fillRect(539, y - 3, 42, 3); });
    ctx.strokeStyle = '#1A1612'; ctx.lineWidth = 4; ctx.strokeRect(490, 474, 64, 70);
    ctx.strokeStyle = '#6A6660'; ctx.lineWidth = 2; ctx.strokeRect(490, 474, 64, 70);
    ctx.beginPath(); ctx.moveTo(490, 474); ctx.lineTo(554, 544); ctx.moveTo(554, 474); ctx.lineTo(490, 544); ctx.moveTo(490, 509); ctx.lineTo(554, 509); ctx.stroke();
    pipe(ctx, [[150, 130], [200, 130], [220, 160], [220, 190]], 5, RUSTY);
    pipe(ctx, [[400, 120], [430, 160], [440, 200]], 5, RUSTY);
    motor(ctx, 196, 158, 14); motor(ctx, 440, 206, 12);
    // weathering over the whole silo
    ctx.save(); ctx.globalCompositeOperation = 'source-atop';
    for (i = 0; i < 3000; i++) {
      var hh = hsh(i, 21);
      ctx.fillStyle = hh < 0.6 ? 'rgba(16,12,8,0.26)' : (hh < 0.8 ? 'rgba(150,80,36,0.22)' : 'rgba(255,245,230,0.1)');
      ctx.fillRect(608 * hsh(i, 22), 596 * hsh(i, 23), 1 + 2 * hsh(i, 24), 1 + 2.5 * hsh(i, 25));
    }
    ctx.restore();
    ctx.restore();
  }
  F.sprites.definePainter(['rocket-silo'], paintRocketSilo);

  // =========================================================================
  // F.sprites.rocketSiloDoors(open01) -> 576x576 transparent canvas laid over the silo: the pit
  // (lit from below once the rocket is up) with both door leaves slid `open01` of the way under
  // the concrete ring, all clipped to the pit. open01 = 0 matches the painter's closed doors.
  // Quantised to 8 steps for caching.
  // =========================================================================
  var DOOR_STEPS = 8;
  var doorsCache = new Map();
  F.sprites.rocketSiloDoors = function (open01) {
    if (!F.sprites.enabled) return { width: 0, height: 0 };
    var t = F.util.clamp(open01 == null ? 0 : open01, 0, 1);
    var q = Math.round(t * (DOOR_STEPS - 1));
    var c = doorsCache.get(q);
    if (c) return c;
    var W = L.PX * 9;
    c = L.newCanvas(W, W);
    var ctx = L.ctxOf(c);
    ctx.save(); siloSpace(ctx, W);
    var tOpen = q / (DOOR_STEPS - 1);
    pitInterior(ctx, tOpen > 0);
    siloDoors(ctx, tOpen * 190);
    rimShadow(ctx);
    ctx.restore();
    doorsCache.set(q, c);
    return c;
  };

  // =========================================================================
  // F.sprites.rocket(frame) -> 128x384 canvas (2x6 tiles), nose pointing local north (up).
  // White/grey body, black nose cap, red accent band, blue porthole, 2 fins; frames 1..7 add a
  // growing/flickering exhaust flame (frame 0 = none). Cached per frame (0..7).
  // =========================================================================
  var rocketCache = new Map();
  function paintRocket(ctx, W, H, frame) {
    var cx = W * 0.5, bw = W * 0.34;
    var noseTipY = H * 0.03, bodyTopY = H * 0.16, bodyBotY = H * 0.70, skirtH = H * 0.05;
    // Fins (drawn first so the body/skirt overlap their roots).
    ctx.fillStyle = '#B03030';
    ctx.beginPath();
    ctx.moveTo(cx - bw * 0.46, bodyBotY); ctx.lineTo(cx - bw * 1.35, H * 0.92); ctx.lineTo(cx - bw * 0.4, H * 0.86);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#141210'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + bw * 0.46, bodyBotY); ctx.lineTo(cx + bw * 1.35, H * 0.92); ctx.lineTo(cx + bw * 0.4, H * 0.86);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    // Cylindrical body (vertical axis -> shaded left/right, top-left highlight).
    L.cylinder(ctx, cx - bw / 2, bodyTopY, bw, bodyBotY - bodyTopY, '#D8DBDD', false, { r: bw * 0.4 });
    // Nose cone + black tip cap.
    var noseH = bodyTopY - noseTipY;
    var ng = ctx.createLinearGradient(cx - bw / 2, noseTipY, cx + bw / 2, bodyTopY);
    ng.addColorStop(0, L.darken('#D8DBDD', 30)); ng.addColorStop(0.4, L.lighten('#D8DBDD', 30)); ng.addColorStop(1, L.darken('#D8DBDD', 40));
    ctx.fillStyle = ng;
    ctx.beginPath();
    ctx.moveTo(cx, noseTipY);
    ctx.quadraticCurveTo(cx - bw * 0.5, bodyTopY - noseH * 0.15, cx - bw * 0.5, bodyTopY + 1);
    ctx.lineTo(cx + bw * 0.5, bodyTopY + 1);
    ctx.quadraticCurveTo(cx + bw * 0.5, bodyTopY - noseH * 0.15, cx, noseTipY);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#141210'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#1A1A1A';
    ctx.beginPath(); ctx.arc(cx, noseTipY + noseH * 0.16, bw * 0.09, 0, Math.PI * 2); ctx.fill();
    // Red accent band + porthole + panel seam + rivets.
    var bandY = bodyTopY + (bodyBotY - bodyTopY) * 0.26, bandH = (bodyBotY - bodyTopY) * 0.07;
    ctx.fillStyle = '#C43A3A'; ctx.fillRect(cx - bw / 2, bandY, bw, bandH);
    ctx.strokeStyle = '#141210'; ctx.lineWidth = 1; ctx.strokeRect(cx - bw / 2, bandY, bw, bandH);
    L.disc(ctx, cx, bodyTopY + (bodyBotY - bodyTopY) * 0.14, bw * 0.14, '#3A7FD9', { hi: 50, lo: 30, outlineWidth: 1.5 });
    var seamY = bodyTopY + (bodyBotY - bodyTopY) * 0.55;
    ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx - bw * 0.5, seamY); ctx.lineTo(cx + bw * 0.5, seamY); ctx.stroke();
    L.rivets(ctx, [[cx - bw * 0.3, seamY], [cx + bw * 0.3, seamY]], bw * 0.045);
    // Engine skirt + nozzles.
    L.rectBevel(ctx, cx - bw * 0.56, bodyBotY, bw * 1.12, skirtH, '#4A4D4F', { dark: '#22262A' });
    var nozY = bodyBotY + skirtH + H * 0.015, noz = [-bw * 0.28, 0, bw * 0.28], ni;
    for (ni = 0; ni < noz.length; ni++) L.disc(ctx, cx + noz[ni], nozY, bw * 0.11, '#2A2A2A', { hi: 20, lo: 40, outlineWidth: 1.2 });
    // Exhaust flame (frames 1..7), grows and flickers; kept within the bottom shadow margin.
    if (frame > 0) {
      var t = frame / 7;
      var flameLen = H * (0.05 + 0.14 * t) * (0.85 + 0.3 * ((frame % 3) / 3));
      var flameW = bw * (0.55 + 0.35 * t);
      var fy0 = nozY + H * 0.02;
      var fg = ctx.createLinearGradient(cx, fy0, cx, fy0 + flameLen);
      fg.addColorStop(0, 'rgba(255,255,255,0.95)');
      fg.addColorStop(0.25, 'rgba(255,220,140,0.9)');
      fg.addColorStop(0.6, 'rgba(255,138,42,0.75)');
      fg.addColorStop(1, 'rgba(255,80,20,0)');
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.moveTo(cx - flameW * 0.5, fy0);
      ctx.quadraticCurveTo(cx - flameW * 0.2, fy0 + flameLen * 0.6, cx, fy0 + flameLen);
      ctx.quadraticCurveTo(cx + flameW * 0.2, fy0 + flameLen * 0.6, cx + flameW * 0.5, fy0);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }
  F.sprites.rocket = function (frame) {
    if (!F.sprites.enabled) return { width: 0, height: 0 };
    var f = F.util.clamp(frame | 0, 0, 7);
    var c = rocketCache.get(f);
    if (c) return c;
    var W = L.PX * 2, H = L.PX * 6;
    c = L.newCanvas(W, H);
    paintRocket(L.ctxOf(c), W, H, f);
    rocketCache.set(f, c);
    return c;
  };

  // =========================================================================
  // Item icons: low-density-structure ("lds", copper/orange lattice panel) and "satellite"
  // (grey body + blue solar wings + antenna). F.sprites.defineIcon is added concurrently by
  // another agent — guard its existence.
  // =========================================================================
  if (F.sprites.defineIcon) {
    F.sprites.defineIcon('lds', function (ctx, S, def) {
      var c1 = def.icon.color || '#C98A3A', c2 = def.icon.color2 || '#8A8F94';
      L.rectBevel(ctx, S * 0.12, S * 0.12, S * 0.76, S * 0.76, c1, { dark: L.darken(c1, 30) });
      ctx.save();
      ctx.beginPath(); ctx.rect(S * 0.12, S * 0.12, S * 0.76, S * 0.76); ctx.clip();
      ctx.strokeStyle = c2; ctx.lineWidth = Math.max(1, S * 0.045);
      var i;
      for (i = -2; i <= 6; i++) {
        ctx.beginPath(); ctx.moveTo(S * 0.12 + i * S * 0.19, S * 0.12); ctx.lineTo(S * 0.12 + i * S * 0.19 + S * 0.76, S * 0.88); ctx.stroke();
      }
      ctx.restore();
      ctx.strokeStyle = '#141414'; ctx.lineWidth = 1.2; ctx.strokeRect(S * 0.12, S * 0.12, S * 0.76, S * 0.76);
      L.rivets(ctx, [[S * 0.18, S * 0.18], [S * 0.82, S * 0.18], [S * 0.18, S * 0.82], [S * 0.82, S * 0.82]], S * 0.045);
    });
    F.sprites.defineIcon('satellite', function (ctx, S, def) {
      var c1 = def.icon.color || '#C8CCD0', c2 = def.icon.color2 || '#2B4C7E';
      ctx.fillStyle = c2;
      ctx.fillRect(S * 0.06, S * 0.4, S * 0.28, S * 0.2); ctx.fillRect(S * 0.66, S * 0.4, S * 0.28, S * 0.2);
      ctx.strokeStyle = L.darken(c2, 30); ctx.lineWidth = 1;
      ctx.strokeRect(S * 0.06, S * 0.4, S * 0.28, S * 0.2); ctx.strokeRect(S * 0.66, S * 0.4, S * 0.28, S * 0.2);
      var i, lx1, lx2;
      for (i = 1; i < 3; i++) {
        lx1 = S * 0.06 + S * 0.28 * i / 3; ctx.beginPath(); ctx.moveTo(lx1, S * 0.4); ctx.lineTo(lx1, S * 0.6); ctx.stroke();
        lx2 = S * 0.66 + S * 0.28 * i / 3; ctx.beginPath(); ctx.moveTo(lx2, S * 0.4); ctx.lineTo(lx2, S * 0.6); ctx.stroke();
      }
      ctx.strokeStyle = '#54595E'; ctx.lineWidth = Math.max(1, S * 0.03);
      ctx.beginPath(); ctx.moveTo(S * 0.38, S * 0.5); ctx.lineTo(S * 0.34, S * 0.5); ctx.moveTo(S * 0.62, S * 0.5); ctx.lineTo(S * 0.66, S * 0.5); ctx.stroke();
      ctx.strokeStyle = '#8A8F94'; ctx.lineWidth = Math.max(1, S * 0.035);
      ctx.beginPath(); ctx.moveTo(S * 0.5, S * 0.34); ctx.lineTo(S * 0.5, S * 0.14); ctx.stroke();
      ctx.fillStyle = c1; ctx.beginPath(); ctx.arc(S * 0.5, S * 0.12, S * 0.035, 0, Math.PI * 2); ctx.fill();
      L.rectBevel(ctx, S * 0.38, S * 0.34, S * 0.24, S * 0.32, c1, { dark: L.darken(c1, 30) });
    });
  }
})();
