// 62-sprites-drill.js — electric mining drill drawn after the real Factorio sprites
// (base/graphics/entity/electric-mining-drill/: per-direction base N/E/S/W, the drill-head
// animation, output chutes; hr = 64 px per tile like our sprites, so the numbers below are hr
// pixels of the 192x192 footprint). Reference: vanilla prototypes in wube/factorio-data and the
// MK2 recolour of the same sprites in Krastorio2Assets.
//
// What the reference looks like:
//   - an open steel gantry. Seen from north/south: two toothed rack columns up the west and east
//     sides, a crossbeam across the front carrying the output chute (north view) or across the
//     back with the chute below it (south view), A-frame legs with braces in the lower corners;
//     seen from east/west: one long rack beam across the middle, posts behind, A-frames in front
//     and the chute on the output side;
//   - big pale teal-grey painted arms from the drill motor out to the columns, rusty edges;
//   - in the middle the motor with a crown of silver cutter teeth that spins while working, a
//     dark motor body with an orange hose, and the spiral auger boring into churned ground;
//   - drawn per direction in world orientation (the caller's rotation is undone).
// Frame 0..15 loops while working; idle = frozen.
(function () {
  'use strict';
  if (!F.sprites || !F.sprites.definePainter) return;
  var L = F.sprites.lib;

  var STEEL = '#51473F', STEEL_HI = '#A3978D', STEEL_LO = '#1E1A17', RACK = '#6A5D54';
  var TEAL = '#93AEAB', TEAL_HI = '#D2E4E1', TEAL_LO = '#4F6664', RUST = 'rgba(138,78,46,', HOSE = '#B4502C', CHUTE = '#5C6266';

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
  function rustSpots(ctx, x, y, w, h, k, seed, n) {
    for (var i = 0; i < n; i++) {
      ctx.fillStyle = RUST + (0.25 + 0.3 * hash(seed, i)).toFixed(2) + ')';
      ctx.beginPath(); ctx.ellipse((x + w * hash(i, seed + 1)) * k, (y + h * hash(seed + 2, i)) * k, (1.5 + 3 * hash(i, 3)) * k, (1 + 2 * hash(i, 4)) * k, 0, 0, Math.PI * 2); ctx.fill();
    }
  }
  // Toothed rack beam (vertical or horizontal) — dark steel with a ladder of teeth.
  function rack(ctx, x, y, w, h, vertical, k, seed) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect((x + 2) * k, (y + 2) * k, w * k, h * k);
    var g = vertical ? ctx.createLinearGradient(x * k, 0, (x + w) * k, 0) : ctx.createLinearGradient(0, y * k, 0, (y + h) * k);
    g.addColorStop(0, STEEL_HI); g.addColorStop(0.3, RACK); g.addColorStop(1, STEEL_LO);
    ctx.fillStyle = g; ctx.fillRect(x * k, y * k, w * k, h * k);
    ctx.fillStyle = '#1A1614';
    if (vertical) { ctx.fillRect((x + w * 0.3) * k, y * k, w * 0.4 * k, h * k); ctx.fillStyle = '#8E857E'; for (var t = y + 2; t < y + h - 2; t += 5) ctx.fillRect((x + w * 0.3) * k, t * k, w * 0.4 * k, 2 * k); }
    else { ctx.fillRect(x * k, (y + h * 0.3) * k, w * k, h * 0.4 * k); ctx.fillStyle = '#8E857E'; for (var s = x + 2; s < x + w - 2; s += 5) ctx.fillRect(s * k, (y + h * 0.3) * k, 2 * k, h * 0.4 * k); }
    ctx.strokeStyle = '#120F0D'; ctx.lineWidth = 0.9 * k; ctx.strokeRect(x * k, y * k, w * k, h * k);
    rustSpots(ctx, x, y, w, h, k, seed, 4);
  }
  // Plain steel strut between two points.
  function strut(ctx, ax, ay, bx, by, w, k) {
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#120F0D'; ctx.lineWidth = (w + 1.6) * k; ctx.beginPath(); ctx.moveTo(ax * k, ay * k); ctx.lineTo(bx * k, by * k); ctx.stroke();
    ctx.strokeStyle = STEEL; ctx.lineWidth = w * k; ctx.stroke();
    ctx.strokeStyle = 'rgba(200,190,180,0.35)'; ctx.lineWidth = w * 0.3 * k;
    ctx.beginPath(); ctx.moveTo((ax - w * 0.2) * k, (ay - w * 0.2) * k); ctx.lineTo((bx - w * 0.2) * k, (by - w * 0.2) * k); ctx.stroke();
  }
  // A-frame leg: two struts meeting at the top, a foot plate, a cross brace.
  function aframe(ctx, cx, top, bot, spread, k) {
    strut(ctx, cx, top, cx - spread, bot, 4.5, k);
    strut(ctx, cx, top, cx + spread, bot, 4.5, k);
    strut(ctx, cx - spread * 0.6, bot - (bot - top) * 0.4, cx + spread * 0.6, bot - (bot - top) * 0.4, 3, k);
    ctx.fillStyle = '#1C1816'; ctx.fillRect((cx - spread - 5) * k, (bot - 2) * k, (spread * 2 + 10) * k, 5 * k);
  }
  // Painted teal-grey arm plate (polygon) with rusty edges.
  function arm(ctx, pts, k, seed) {
    ctx.save(); ctx.translate(2 * k, 3 * k); poly(ctx, pts, k); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill(); ctx.restore();
    poly(ctx, pts, k);
    var minY = Math.min.apply(null, pts.map(function (p) { return p[1]; })), maxY = Math.max.apply(null, pts.map(function (p) { return p[1]; }));
    var g = ctx.createLinearGradient(0, minY * k, 0, maxY * k);
    g.addColorStop(0, TEAL_HI); g.addColorStop(0.35, TEAL); g.addColorStop(1, TEAL_LO);
    ctx.fillStyle = g; ctx.fill();
    ctx.save(); poly(ctx, pts, k); ctx.clip();
    var minX = Math.min.apply(null, pts.map(function (p) { return p[0]; })), maxX = Math.max.apply(null, pts.map(function (p) { return p[0]; }));
    rustSpots(ctx, minX, minY, maxX - minX, maxY - minY, k, seed, 12);
    ctx.lineWidth = 3 * k; ctx.strokeStyle = RUST + '0.45)'; poly(ctx, pts, k); ctx.stroke();
    ctx.restore();
    poly(ctx, pts, k); ctx.strokeStyle = '#1A1614'; ctx.lineWidth = 1 * k; ctx.stroke();
  }
  function hose(ctx, pts, k) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    var path = function () { ctx.beginPath(); ctx.moveTo(pts[0][0] * k, pts[0][1] * k); for (var i = 1; i < pts.length - 1; i += 2) ctx.quadraticCurveTo(pts[i][0] * k, pts[i][1] * k, pts[i + 1][0] * k, pts[i + 1][1] * k); };
    path(); ctx.strokeStyle = '#2A120A'; ctx.lineWidth = 6 * k; ctx.stroke();
    path(); ctx.strokeStyle = HOSE; ctx.lineWidth = 4 * k; ctx.stroke();
    path(); ctx.strokeStyle = 'rgba(255,190,150,0.45)'; ctx.lineWidth = 1.2 * k; ctx.stroke();
  }
  // Output chute: a dark steel hood with a sloped lip pointing toward (ox, oy).
  function chute(ctx, x, y, w, h, k, horizontal) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect((x + 2) * k, (y + 3) * k, w * k, h * k);
    L.roundRectPath(ctx, x * k, y * k, w * k, h * k, 3 * k);
    var g = horizontal ? ctx.createLinearGradient(0, y * k, 0, (y + h) * k) : ctx.createLinearGradient(x * k, 0, (x + w) * k, 0);
    g.addColorStop(0, L.lighten(CHUTE, 35)); g.addColorStop(0.4, CHUTE); g.addColorStop(1, L.darken(CHUTE, 40));
    ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = '#141210'; ctx.lineWidth = 1 * k; ctx.stroke();
    L.roundRectPath(ctx, (x + w * 0.22) * k, (y + h * 0.22) * k, w * 0.56 * k, h * 0.56 * k, 2 * k); ctx.fillStyle = '#16130F'; ctx.fill();
  }
  // Churned ground where the auger bores in (visible under the open frame).
  function borehole(ctx, cx, cy, rx, ry, k, working, f) {
    ctx.fillStyle = 'rgba(30,22,14,0.55)'; ctx.beginPath(); ctx.ellipse(cx * k, cy * k, rx * k, ry * k, 0, 0, Math.PI * 2); ctx.fill();
    for (var i = 0; i < 16; i++) {
      var a = hash(i, 5) * Math.PI * 2 + (working ? f * 0.2 : 0), r = (0.3 + 0.6 * hash(i, 6));
      ctx.fillStyle = i % 3 ? 'rgba(90,72,54,0.8)' : 'rgba(150,128,100,0.8)';
      ctx.fillRect((cx + Math.cos(a) * rx * r) * k, (cy + Math.sin(a) * ry * r) * k, (1.5 + hash(i, 7) * 2) * k, (1.2 + hash(i, 8) * 1.5) * k);
    }
  }
  // Spiral auger from y0 (wide top) to y1 (tip); the flights scroll down while working.
  function auger(ctx, cx, y0, y1, w, k, f) {
    var path = function () { ctx.beginPath(); ctx.moveTo((cx - w / 2) * k, y0 * k); ctx.lineTo((cx + w / 2) * k, y0 * k); ctx.lineTo((cx + w * 0.18) * k, y1 * k); ctx.lineTo(cx * k, (y1 + 4) * k); ctx.lineTo((cx - w * 0.18) * k, y1 * k); ctx.closePath(); };
    path();
    var g = ctx.createLinearGradient((cx - w / 2) * k, 0, (cx + w / 2) * k, 0);
    g.addColorStop(0, '#2A2624'); g.addColorStop(0.35, '#7E7874'); g.addColorStop(1, '#1C1917');
    ctx.fillStyle = g; ctx.fill();
    ctx.save(); path(); ctx.clip();
    ctx.strokeStyle = 'rgba(15,12,10,0.85)'; ctx.lineWidth = 2.2 * k;
    var off = (f % 16) / 16 * 8;
    for (var y = y0 - 8 + off; y < y1 + 6; y += 8) { ctx.beginPath(); ctx.moveTo((cx - w / 2) * k, y * k); ctx.lineTo((cx + w / 2) * k, (y + 5) * k); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(220,210,200,0.35)'; ctx.lineWidth = 1 * k;
    for (var y2 = y0 - 6 + off; y2 < y1 + 6; y2 += 8) { ctx.beginPath(); ctx.moveTo((cx - w / 2) * k, y2 * k); ctx.lineTo((cx + w / 2) * k, (y2 + 5) * k); ctx.stroke(); }
    ctx.restore();
    path(); ctx.strokeStyle = '#120F0D'; ctx.lineWidth = 0.9 * k; ctx.stroke();
  }
  // Drill head: crown of silver cutter teeth (the ribs shift sideways as it spins), dark motor
  // body below with an orange hose.
  function head(ctx, cx, cy, k, f, spike) {
    var w = 46, h = 30, x = cx - w / 2, y = cy - h / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect((x + 3) * k, (y + 4) * k, w * k, (h + 20) * k);
    // motor body
    L.roundRectPath(ctx, (cx - 16) * k, (y + h - 4) * k, 32 * k, 24 * k, 5 * k);
    var mg = ctx.createLinearGradient((cx - 16) * k, 0, (cx + 16) * k, 0);
    mg.addColorStop(0, '#2C2826'); mg.addColorStop(0.35, '#6A6460'); mg.addColorStop(1, '#1A1715');
    ctx.fillStyle = mg; ctx.fill(); ctx.strokeStyle = '#120F0D'; ctx.lineWidth = 0.9 * k; ctx.stroke();
    // crown
    L.roundRectPath(ctx, x * k, y * k, w * k, h * k, 6 * k);
    var cg = ctx.createLinearGradient(x * k, 0, (x + w) * k, 0);
    cg.addColorStop(0, '#4A4644'); cg.addColorStop(0.3, '#CFCBC6'); cg.addColorStop(0.55, '#9C9793'); cg.addColorStop(1, '#2E2A28');
    ctx.fillStyle = cg; ctx.fill();
    ctx.save(); L.roundRectPath(ctx, x * k, y * k, w * k, h * k, 6 * k); ctx.clip();
    var shift = (f % 16) / 16 * 6;
    for (var r = x - 6 + shift; r < x + w + 6; r += 6) { // teeth ribs
      ctx.fillStyle = 'rgba(20,18,16,0.55)'; ctx.fillRect(r * k, y * k, 1.6 * k, h * k);
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect((r + 1.6) * k, y * k, 1 * k, h * k);
    }
    ctx.fillStyle = 'rgba(20,18,16,0.5)'; ctx.fillRect(x * k, (cy - 1) * k, w * k, 2 * k);
    ctx.restore();
    L.roundRectPath(ctx, x * k, y * k, w * k, h * k, 6 * k); ctx.strokeStyle = '#120F0D'; ctx.lineWidth = 1 * k; ctx.stroke();
    // top cap (teal) + optional spike (south view)
    L.roundRectPath(ctx, (cx - 12) * k, (y - 5) * k, 24 * k, 8 * k, 2 * k); ctx.fillStyle = TEAL; ctx.fill(); ctx.strokeStyle = '#1A1614'; ctx.stroke();
    if (spike) { ctx.fillStyle = '#C9C4BE'; poly(ctx, [[cx - 3, y - 5], [cx + 3, y - 5], [cx, y - 16]], k); ctx.fill(); ctx.strokeStyle = '#1A1614'; ctx.stroke(); }
    hose(ctx, [[cx - 14, y + h + 8], [cx - 26, y + h + 14], [cx - 20, y + h + 24]], k);
  }

  // Clamp block where an arm meets a column.
  function clamp(ctx, x, y, k) {
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect((x - 9) * k, (y - 7) * k, 20 * k, 16 * k);
    L.roundRectPath(ctx, (x - 10) * k, (y - 9) * k, 20 * k, 16 * k, 2 * k);
    var g = ctx.createLinearGradient(0, (y - 9) * k, 0, (y + 7) * k);
    g.addColorStop(0, '#A89C92'); g.addColorStop(1, '#3A322C');
    ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = '#120F0D'; ctx.lineWidth = 0.9 * k; ctx.stroke();
    ctx.fillStyle = '#D6CEC6'; [[-6, -5], [6, -5], [-6, 3], [6, 3]].forEach(function (q) { ctx.beginPath(); ctx.arc((x + q[0]) * k, (y + q[1]) * k, 1 * k, 0, Math.PI * 2); ctx.fill(); });
  }
  // Small painted box (valve housings beside the motor).
  function box(ctx, x, y, w, h, k) {
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect((x + 2) * k, (y + 2) * k, w * k, h * k);
    var g = ctx.createLinearGradient(x * k, 0, (x + w) * k, 0);
    g.addColorStop(0, TEAL_HI); g.addColorStop(0.4, TEAL); g.addColorStop(1, TEAL_LO);
    ctx.fillStyle = g; ctx.fillRect(x * k, y * k, w * k, h * k);
    ctx.strokeStyle = '#1A1614'; ctx.lineWidth = 0.8 * k; ctx.strokeRect(x * k, y * k, w * k, h * k);
    rustSpots(ctx, x, y, w, h, k, x + y, 2);
  }
  // Dirt, rust dust and wear over everything painted so far.
  function grime(ctx, k) {
    ctx.save(); ctx.globalCompositeOperation = 'source-atop';
    for (var i = 0; i < 800; i++) {
      var h = hash(i, 91);
      ctx.fillStyle = h < 0.6 ? 'rgba(20,14,8,' + (0.15 + 0.2 * hash(i, 5)).toFixed(2) + ')' : (h < 0.8 ? RUST + '0.35)' : 'rgba(255,245,230,0.12)');
      var sz = (0.8 + 1.8 * hash(i, 8)) * k;
      ctx.fillRect(192 * hash(i, 3) * k, 192 * hash(i, 4) * k, sz, sz);
    }
    ctx.restore();
  }

  function paintDrill(ctx, W, H, frame, dir, def, type, opts) {
    var k = W / 192, working = !!(opts && opts.working), f = working ? (frame & 15) : 0, d = dir & 3;
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(W / 2, H / 2); ctx.rotate(-d * Math.PI / 2); ctx.translate(-W / 2, -H / 2);
    if (d === 0 || d === 2) {
      var south = d === 2;
      borehole(ctx, 96, 124, 30, 16, k, working, f);
      aframe(ctx, 26, 128, 188, 18, k); aframe(ctx, 166, 128, 188, 18, k);
      rack(ctx, 12, 8, 16, 150, true, k, 1); rack(ctx, 164, 8, 16, 150, true, k, 2);
      if (!south) { // crossbeam across the front with the output chute on top of it
        rack(ctx, 12, 12, 168, 11, false, k, 3);
        chute(ctx, 78, 0, 36, 22, k, false);
      } else {
        rack(ctx, 12, 8, 168, 10, false, k, 3);
        strut(ctx, 26, 146, 166, 146, 5, k);
      }
      auger(ctx, 96, 78, 124, 22, k, f);
      arm(ctx, [[78, 34], [22, 54], [22, 76], [78, 62]], k, 11);
      arm(ctx, [[114, 34], [170, 54], [170, 76], [114, 62]], k, 12);
      clamp(ctx, 20, 66, k); clamp(ctx, 172, 66, k);
      box(ctx, 58, 72, 12, 14, k); box(ctx, 122, 72, 12, 14, k);
      head(ctx, 96, 56, k, f, south);
      hose(ctx, [[22, 104], [40, 140], [30, 176]], k);
      if (south) chute(ctx, 76, 164, 40, 26, k, false);
    } else {
      var east = d === 1, sx = east ? 1 : -1, ox = east ? 0 : 192;
      var X = function (v) { return ox + sx * v; };
      borehole(ctx, 96, 128, 30, 14, k, working, f);
      rack(ctx, 22, 6, 12, 90, true, k, 1); rack(ctx, 158, 6, 12, 90, true, k, 2);
      auger(ctx, 96, 84, 132, 20, k, f);
      rack(ctx, 4, 92, 184, 14, false, k, 3);
      aframe(ctx, X(30), 104, 184, 20, k); aframe(ctx, X(162), 104, 184, 20, k);
      strut(ctx, X(16), 176, X(176), 176, 4, k);
      arm(ctx, [[X(78), 28], [X(28), 16], [X(28), 40], [X(78), 58]], k, 11);
      arm(ctx, [[X(114), 28], [X(164), 16], [X(164), 40], [X(114), 58]], k, 12);
      clamp(ctx, X(28), 28, k); clamp(ctx, X(164), 28, k);
      box(ctx, 60, 58, 12, 14, k); box(ctx, 120, 58, 12, 14, k);
      head(ctx, 96, 44, k, f, false);
      chute(ctx, east ? 166 : 0, 70, 26, 40, k, true);
    }
    ctx.restore();
    grime(ctx, k);
  }

  F.sprites.definePainter(['electric-mining-drill'], paintDrill);
})();
