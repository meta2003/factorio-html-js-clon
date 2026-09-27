// 63-sprites-assemblers.js — assembling machines 1/2/3 drawn after the real Factorio sprites
// (base/graphics/entity/assembling-machine-N/: 214x226 hr frames, 32-frame animation; hr = 64 px
// per tile like our sprites, so the numbers below are hr pixels of the 192x192 footprint).
//
// What the reference looks like:
//   - an open box: thick side walls in the tier colour (AM1 grey-green, AM2 blue, AM3 olive),
//     the lit west wall showing its outer face with rivets, the east wall in shadow with diagonal
//     hatching, a thin dark back wall;
//   - a sloped front apron across the south edge: a dark lip, then four riveted panels in the
//     tier colour, chamfered at both ends;
//   - inside, on a worn copper floor plate with long slots: the machinery — bronze gear wheels
//     sticking up over the back wall, a motor can, a copper pipe elbow, a white motor box, a
//     chain down the west side; AM1 has a row of silver gears, AM2/AM3 big crank arms and
//     pistons, AM3 also upright tubes;
//   - all of it moves while the machine works (gears turn, arms swing) and stands still when
//     idle. Frame 0..15 loops.
(function () {
  'use strict';
  if (!F.sprites || !F.sprites.definePainter) return;
  var L = F.sprites.lib;

  var TIER = {
    'assembling-machine-1': { wall: '#7D8782', wallHi: '#AEB6B0', wallLo: '#303634', panel: '#5B6765', lip: '#22221A' },
    'assembling-machine-2': { wall: '#3C6397', wallHi: '#7FA6D6', wallLo: '#16253A', panel: '#34557F', lip: '#1D1E1A' },
    'assembling-machine-3': { wall: '#6F7B3A', wallHi: '#A9B56D', wallLo: '#29300F', panel: '#5E6934', lip: '#1F1C0C' },
  };
  var COPPER = '#7A5640', COPPER_HI = '#C9A488', COPPER_LO = '#34211A', BRONZE = '#A07A45', STEEL = '#AEB2B4';

  function hash(a, b) {
    var h = (a * 374761393 + b * 668265263) | 0;
    h = (h ^ (h >>> 13)) * 1274126177 | 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function poly(ctx, pts, k) {
    ctx.beginPath(); ctx.moveTo(pts[0][0] * k, pts[0][1] * k);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] * k, pts[i][1] * k);
    ctx.closePath();
  }
  function rivet(ctx, x, y, r) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.beginPath(); ctx.arc(x + r * 0.35, y + r * 0.35, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#C9C6BA'; ctx.beginPath(); ctx.arc(x, y, r * 0.8, 0, Math.PI * 2); ctx.fill();
  }
  // Metal gear with a little top-left light (L.gearShape plus shading and a hub).
  function gear(ctx, x, y, r, teeth, ang, color, k) {
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.arc((x + 1.2) * k, (y + 1.6) * k, r * 0.95 * k, 0, Math.PI * 2); ctx.fill();
    L.gearShape(ctx, x * k, y * k, r * k, r * 0.28 * k, teeth, ang, color, '#1E1A16');
    var g = ctx.createRadialGradient((x - r * 0.35) * k, (y - r * 0.4) * k, 0, x * k, y * k, r * k);
    g.addColorStop(0, 'rgba(255,255,255,0.35)'); g.addColorStop(0.6, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,0.3)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x * k, y * k, r * 0.86 * k, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(20,16,12,0.7)'; ctx.lineWidth = 0.8 * k;
    ctx.beginPath(); ctx.arc(x * k, y * k, r * 0.55 * k, 0, Math.PI * 2); ctx.stroke();
  }
  // Upright cylinder seen from above-south (motor can / tube): body then elliptical top.
  function can(ctx, x, y, rx, h, color, k, dark) {
    var ry = rx * 0.62;
    var g = ctx.createLinearGradient((x - rx) * k, 0, (x + rx) * k, 0);
    g.addColorStop(0, L.darken(color, 35)); g.addColorStop(0.35, L.lighten(color, 18)); g.addColorStop(1, L.darken(color, 45));
    ctx.fillStyle = g; ctx.fillRect((x - rx) * k, y * k, rx * 2 * k, h * k);
    ctx.beginPath(); ctx.ellipse(x * k, (y + h) * k, rx * k, ry * k, 0, 0, Math.PI); ctx.fill();
    ctx.fillStyle = L.lighten(color, 10); ctx.beginPath(); ctx.ellipse(x * k, y * k, rx * k, ry * k, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#1B1713'; ctx.lineWidth = 0.8 * k; ctx.stroke();
    if (dark) { ctx.fillStyle = '#2A2521'; ctx.beginPath(); ctx.ellipse(x * k, y * k, rx * 0.6 * k, ry * 0.6 * k, 0, 0, Math.PI * 2); ctx.fill(); }
  }
  // Round bar (pipe, piston rod) from a to b with cylindrical shading.
  function bar(ctx, ax, ay, bx, by, w, color, k) {
    var dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
    ctx.save(); ctx.translate(ax * k, ay * k); ctx.rotate(Math.atan2(dy, dx));
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(0, (-w / 2 + 1.5) * k, len * k, w * k);
    var g = ctx.createLinearGradient(0, -w / 2 * k, 0, w / 2 * k);
    g.addColorStop(0, L.lighten(color, 30)); g.addColorStop(0.35, color); g.addColorStop(1, L.darken(color, 45));
    ctx.fillStyle = g; ctx.fillRect(0, -w / 2 * k, len * k, w * k);
    ctx.strokeStyle = '#1B1713'; ctx.lineWidth = 0.6 * k; ctx.strokeRect(0, -w / 2 * k, len * k, w * k);
    ctx.restore();
  }
  function chain(ctx, x, y0, y1, shift, k) {
    ctx.fillStyle = '#1C1916'; ctx.fillRect((x - 2) * k, y0 * k, 4 * k, (y1 - y0) * k);
    ctx.fillStyle = '#6C665E';
    for (var y = y0 + shift; y < y1 - 2; y += 4) ctx.fillRect((x - 1.4) * k, y * k, 2.8 * k, 2.2 * k);
  }

  function paintAssembler(ctx, W, H, frame, dir, def, type, opts) {
    var t = TIER[type] || TIER['assembling-machine-1'], k = W / 192;
    var working = !!(opts && opts.working), f = working ? (frame & 15) : 0, ph = f / 16 * Math.PI * 2;
    ctx.clearRect(0, 0, W, H);

    // back wall and copper floor
    poly(ctx, [[26, 6], [166, 6], [170, 22], [22, 22]], k); ctx.fillStyle = '#2B2723'; ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(28 * k, 6 * k, 136 * k, 2 * k);
    var fg = ctx.createLinearGradient(0, 20 * k, 0, 146 * k);
    fg.addColorStop(0, COPPER_LO); fg.addColorStop(0.15, COPPER); fg.addColorStop(1, '#8A6146');
    ctx.fillStyle = fg; ctx.fillRect(38 * k, 20 * k, 116 * k, 126 * k);
    ctx.save(); ctx.beginPath(); ctx.rect(38 * k, 20 * k, 116 * k, 126 * k); ctx.clip();
    for (var p = 0; p < 22; p++) { // worn, lighter patches and grime
      ctx.fillStyle = p % 3 ? 'rgba(232,200,170,' + (0.12 + 0.15 * hash(p, 2)).toFixed(2) + ')' : 'rgba(40,24,14,0.25)';
      ctx.beginPath(); ctx.ellipse((40 + 112 * hash(p, 7)) * k, (22 + 120 * hash(p, 9)) * k, (4 + 10 * hash(p, 3)) * k, (2 + 5 * hash(p, 4)) * k, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = 'rgba(245,235,225,0.4)'; ctx.beginPath(); ctx.ellipse(140 * k, 30 * k, 11 * k, 5 * k, 0.2, 0, Math.PI * 2); ctx.fill();
    // long slots in the floor plate + plate seams
    ctx.fillStyle = '#3A2517';
    ctx.fillRect(70 * k, 110 * k, 80 * k, 5 * k); ctx.fillRect(70 * k, 124 * k, 80 * k, 5 * k);
    ctx.fillStyle = 'rgba(255,220,190,0.35)';
    ctx.fillRect(70 * k, 115 * k, 80 * k, 1.2 * k); ctx.fillRect(70 * k, 129 * k, 80 * k, 1.2 * k);
    ctx.strokeStyle = 'rgba(40,24,14,0.5)'; ctx.lineWidth = 1 * k;
    ctx.strokeRect(108 * k, 24 * k, 42 * k, 76 * k);
    // ambient occlusion where the floor meets the walls
    var ao = ctx.createLinearGradient(38 * k, 0, 50 * k, 0); ao.addColorStop(0, 'rgba(0,0,0,0.55)'); ao.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = ao; ctx.fillRect(38 * k, 20 * k, 12 * k, 126 * k);
    ao = ctx.createLinearGradient(154 * k, 0, 144 * k, 0); ao.addColorStop(0, 'rgba(0,0,0,0.6)'); ao.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = ao; ctx.fillRect(144 * k, 20 * k, 10 * k, 126 * k);
    ao = ctx.createLinearGradient(0, 20 * k, 0, 34 * k); ao.addColorStop(0, 'rgba(0,0,0,0.6)'); ao.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = ao; ctx.fillRect(38 * k, 20 * k, 116 * k, 14 * k);
    ctx.restore();

    // machinery, then a light shade over the whole interior (it sits in the box's shadow)
    if (type === 'assembling-machine-1') paintAM1Machinery(ctx, k, ph, f);
    else paintAM23Machinery(ctx, k, ph, f, type === 'assembling-machine-3');
    ctx.save(); ctx.globalCompositeOperation = 'source-atop';
    var sh = ctx.createLinearGradient(0, 0, 0, 146 * k);
    sh.addColorStop(0, 'rgba(18,10,4,0.05)'); sh.addColorStop(1, 'rgba(18,10,4,0.28)');
    ctx.fillStyle = sh; ctx.fillRect(38 * k, 0, 116 * k, 146 * k);
    ctx.restore();

    // side walls: west (lit outer face with rivets) and east (shadow side, hatching)
    poly(ctx, [[14, 26], [26, 14], [40, 14], [40, 150], [14, 150]], k);
    var wg = ctx.createLinearGradient(14 * k, 0, 40 * k, 0);
    wg.addColorStop(0, t.wallHi); wg.addColorStop(0.45, t.wall); wg.addColorStop(0.55, L.darken(t.wall, 18)); wg.addColorStop(1, t.wallLo);
    ctx.fillStyle = wg; ctx.fill(); ctx.strokeStyle = '#141210'; ctx.lineWidth = 1 * k; ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(27 * k, 16 * k, 1.2 * k, 134 * k);
    for (var r = 0; r < 6; r++) rivet(ctx, 20 * k, (34 + r * 20) * k, 1.3 * k);
    poly(ctx, [[152, 14], [166, 14], [178, 26], [178, 150], [152, 150]], k);
    var eg = ctx.createLinearGradient(152 * k, 0, 178 * k, 0);
    eg.addColorStop(0, L.darken(t.wall, 25)); eg.addColorStop(0.45, t.wallLo); eg.addColorStop(1, '#141210');
    ctx.fillStyle = eg; ctx.fill(); ctx.strokeStyle = '#141210'; ctx.lineWidth = 1 * k; ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1.4 * k;
    for (var hI = 0; hI < 7; hI++) { var hy = 26 + hI * 18; ctx.beginPath(); ctx.moveTo(166 * k, (hy + 8) * k); ctx.lineTo(176 * k, hy * k); ctx.stroke(); }
    ctx.fillStyle = L.rgba(t.wallHi, 0.25); ctx.fillRect(152 * k, 14 * k, 1.5 * k, 136 * k);

    // front apron: dark lip, then four riveted panels sloping down to the ground
    poly(ctx, [[14, 146], [178, 146], [178, 152], [14, 152]], k); ctx.fillStyle = t.lip; ctx.fill();
    poly(ctx, [[14, 152], [178, 152], [186, 184], [6, 184]], k);
    var ag = ctx.createLinearGradient(0, 152 * k, 0, 184 * k);
    ag.addColorStop(0, L.darken(t.panel, 30)); ag.addColorStop(0.2, t.panel); ag.addColorStop(1, L.darken(t.panel, 25));
    ctx.fillStyle = ag; ctx.fill(); ctx.strokeStyle = '#141210'; ctx.lineWidth = 1.2 * k; ctx.stroke();
    // chamfered ends of the apron (darker bevels)
    poly(ctx, [[14, 152], [30, 152], [24, 184], [6, 184]], k); ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fill();
    poly(ctx, [[162, 152], [178, 152], [186, 184], [168, 184]], k); ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fill();
    for (var pI = 0; pI < 4; pI++) {
      var x0 = 30 + pI * 33, x1 = x0 + 31;
      var bx0 = x0 - (x0 < 96 ? 3 : -3) * (1 - pI / 3), bx1 = x1;
      poly(ctx, [[x0 + 1.5, 155], [x1 - 1.5, 155], [bx1 - 1, 181], [bx0 + 0.5, 181]], k);
      var pg = ctx.createRadialGradient((x0 + 14) * k, 166 * k, 1 * k, (x0 + 15) * k, 168 * k, 20 * k);
      pg.addColorStop(0, L.lighten(t.panel, 22)); pg.addColorStop(1, L.darken(t.panel, 18));
      ctx.fillStyle = pg; ctx.fill();
      ctx.strokeStyle = 'rgba(20,16,12,0.8)'; ctx.lineWidth = 0.9 * k; ctx.stroke();
      ctx.fillStyle = 'rgba(122,70,40,0.35)';
      ctx.beginPath(); ctx.ellipse((x0 + 8 + 14 * hash(pI, 1)) * k, (170 + 8 * hash(pI, 2)) * k, 5 * k, 2.5 * k, 0, 0, Math.PI * 2); ctx.fill();
      [[x0 + 4, 158], [x1 - 4, 158], [x0 + 4, 178], [x1 - 4, 178], [(x0 + x1) / 2, 158], [(x0 + x1) / 2, 178]].forEach(function (q) { rivet(ctx, q[0] * k, q[1] * k, 1.2 * k); });
    }
    grime(ctx, k);
  }
  // Dirt and wear over everything already painted (only where there are pixels).
  function grime(ctx, k) {
    ctx.save(); ctx.globalCompositeOperation = 'source-atop';
    for (var i = 0; i < 900; i++) {
      var h = hash(i, 71);
      ctx.fillStyle = h < 0.65 ? 'rgba(20,14,8,' + (0.16 + 0.2 * hash(i, 5)).toFixed(2) + ')' : 'rgba(255,245,225,' + (0.06 + 0.1 * hash(i, 6)).toFixed(2) + ')';
      var sz = (1 + 2 * hash(i, 8)) * k;
      ctx.fillRect(192 * hash(i, 3) * k, 192 * hash(i, 4) * k, sz, sz);
    }
    for (var j = 0; j < 22; j++) {
      ctx.fillStyle = j % 3 ? 'rgba(40,28,16,' + (0.14 + 0.16 * hash(j, 13)).toFixed(2) + ')' : 'rgba(120,70,36,0.22)';
      ctx.beginPath(); ctx.ellipse(192 * hash(j, 11) * k, 192 * hash(j, 12) * k, (6 + 12 * hash(j, 14)) * k, (3 + 6 * hash(j, 15)) * k, hash(j, 16) * 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  // White motor housing with a dark top and cooling ribs.
  function motorBox(ctx, x, y, w, h, k) {
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect((x + 2) * k, (y + 2) * k, w * k, h * k);
    var g = ctx.createLinearGradient(x * k, 0, (x + w) * k, 0);
    g.addColorStop(0, '#DAD9D0'); g.addColorStop(0.6, '#AFAEA6'); g.addColorStop(1, '#6E6D66');
    ctx.fillStyle = g; ctx.fillRect(x * k, y * k, w * k, h * k);
    ctx.fillStyle = '#3A3733'; ctx.fillRect(x * k, y * k, w * k, h * 0.22 * k);
    ctx.fillStyle = 'rgba(30,28,25,0.75)';
    for (var v = 0; v < 3; v++) ctx.fillRect((x + 3) * k, (y + h * 0.35 + v * h * 0.2) * k, (w - 6) * k, 1.6 * k);
    ctx.strokeStyle = '#1B1713'; ctx.lineWidth = 0.8 * k; ctx.strokeRect(x * k, y * k, w * k, h * k);
  }
  // Cluster of small dark cylinders (capacitors / valves).
  function cluster(ctx, x, y, n, k) {
    for (var i = 0; i < n; i++) can(ctx, x + i * 8, y + (i % 2) * 3, 3.4, 6, '#3E3B37', k, false);
  }

  function paintAM1Machinery(ctx, k, ph, f) {
    // bronze gear wheels over the back wall, turning against each other
    gear(ctx, 66, 14, 17, 14, ph / 3, BRONZE, k);
    gear(ctx, 99, 12, 18, 14, -ph / 3 + 0.11, '#B08A50', k);
    gear(ctx, 124, 20, 11, 11, ph / 2.2, '#8E9194', k);
    bar(ctx, 44, 0, 50, 40, 6, '#8C8F90', k);
    chain(ctx, 42, 36, 148, (f % 4), k);
    can(ctx, 60, 42, 10, 16, '#C9C9C2', k, true);
    gear(ctx, 80, 44, 15, 13, -ph / 2.5, BRONZE, k);
    bar(ctx, 104, 18, 104, 70, 6, STEEL, k);
    // the row of silver gears
    gear(ctx, 84, 72, 11, 12, ph / 2, '#A9ADB0', k);
    gear(ctx, 104, 74, 9, 10, -ph / 2 * 1.2, '#B6B9BB', k);
    gear(ctx, 122, 74, 9, 10, ph / 2 * 1.2, '#A9ADB0', k);
    gear(ctx, 139, 74, 8, 9, -ph / 2 * 1.35, '#B6B9BB', k);
    bar(ctx, 58, 92, 100, 92, 5, STEEL, k);
    bar(ctx, 22, 104, 62, 104, 9, '#B77B52', k);
    // white motor box (bottom-left) with vents
    motorBox(ctx, 46, 112, 18, 26, k);
    cluster(ctx, 116, 88, 4, k);
    bar(ctx, 132, 30, 132, 60, 5, '#B77B52', k);
    gear(ctx, 136, 28, 7, 9, -ph / 2, BRONZE, k);
    bar(ctx, 72, 136, 150, 136, 4, '#6E6A64', k);
  }

  function paintAM23Machinery(ctx, k, ph, f, am3) {
    gear(ctx, 70, 13, 17, 14, ph / 3, BRONZE, k);
    gear(ctx, 102, 11, 18, 14, -ph / 3 + 0.11, '#B08A50', k);
    chain(ctx, 42, 30, 148, (f % 4), k);
    can(ctx, 58, 36, 10, 14, '#C9C9C2', k, true);
    gear(ctx, 96, 42, 16, 13, -ph / 2.5, BRONZE, k);
    if (am3) { // upright tubes at the back
      can(ctx, 142, -2, 5, 36, '#D2D0C6', k, false);
      can(ctx, 158, 18, 4.5, 28, '#D2D0C6', k, false);
    } else {
      ctx.fillStyle = '#DAD8D0'; ctx.beginPath(); ctx.arc(150 * k, 48 * k, 5 * k, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#1B1713'; ctx.lineWidth = 0.8 * k; ctx.stroke();
    }
    // big crank arms swinging with the work cycle
    var s = Math.sin(ph) * 5;
    bar(ctx, 56, 84, 118 + s, 52, 9, '#7E8286', k);
    bar(ctx, 60, 94, 122 + s, 62, 7, '#6C7074', k);
    var cx = 124 + s, cy = 56;
    ctx.fillStyle = '#3A3836'; ctx.beginPath(); ctx.arc(cx * k, cy * k, 7 * k, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#7E8286'; ctx.beginPath(); ctx.arc(cx * k, cy * k, 3.5 * k, 0, Math.PI * 2); ctx.fill();
    // V-shaped linkages
    var lift = Math.cos(ph) * 4;
    bar(ctx, 98, 118, 110, 78 + lift, 7, '#55595D', k);
    bar(ctx, 110, 78 + lift, 124, 118, 7, '#55595D', k);
    bar(ctx, 122, 118, 136, 82 - lift, 7, '#606468', k);
    bar(ctx, 136, 82 - lift, 148, 118, 7, '#606468', k);
    bar(ctx, 22, 96, 62, 96, 9, '#B77B52', k);
    motorBox(ctx, 46, 108, 18, 26, k);
    cluster(ctx, 66, 60, 3, k);
    gear(ctx, 124, 34, 13, 12, ph / 2.2, '#8E9194', k);
    bar(ctx, 74, 136, 150, 136, 4, '#6E6A64', k);
    can(ctx, 142, 110, 8, 12, '#C9C9C2', k, true);
    if (am3) can(ctx, 128, 132, 6, 8, '#C9C9C2', k, true);
  }

  F.sprites.definePainter(['assembling-machine-1', 'assembling-machine-2', 'assembling-machine-3'], paintAssembler);
})();
