// 64-sprites-pipes.js — pipes and pipes-to-ground drawn after the real Factorio sprites
// (base/graphics/entity/pipe/pipe-*.png, pipe-to-ground/*; hr = 64 px per tile like our sprites,
// so the numbers below are in those pixels).
//
// What the reference looks like:
//   - a pale steel pipe ~37 px thick (vertical run: x 13..50; horizontal run: y 11..47, drawn a
//     little above the tile centre because the pipe stands on the ground), cylindrical shading
//     with the highlight left/top of centre, brown rust blotches;
//   - a bolted flange at every connected edge. Seen from above on north/south joints (a flat
//     ellipse with bolt heads on its top face and a dark front band), from the side on east/west
//     joints (a narrow upright ellipse). Both neighbours draw their half at the shared edge, so
//     together they form one ring;
//   - smooth elbows on corners, T-pieces and crossings where the branch runs into the through
//     pipe, blind flanges / a domed cap on open ends, and a glass window on every other straight
//     piece (fluid colour behind the glass when the pipe carries something);
//   - pipe-to-ground: the pipe runs from its visible connection into a bolted ring lying on the
//     ground (bending down into it), drawn per direction in world orientation.
// Pipes are not rotated (dir 0); pipe-to-ground undoes the caller's rotation.
(function () {
  'use strict';
  if (!F.sprites || !F.sprites.definePainter) return;
  var L = F.sprites.lib;

  var VX0 = 13, VX1 = 50, VCX = 31.5, HY0 = 11, HY1 = 47, HCY = 29; // body extents (64 px tile)
  var EDGE_DARK = '#25211A', RUST = 'rgba(112,70,34,', BOLT = '#C9C4B0';

  function hash(a, b) {
    var h = (a * 374761393 + b * 668265263) | 0;
    h = (h ^ (h >>> 13)) * 1274126177 | 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function bodyGradient(ctx, a0, a1, horizontal, k) {
    var g = horizontal ? ctx.createLinearGradient(0, a0 * k, 0, a1 * k) : ctx.createLinearGradient(a0 * k, 0, a1 * k, 0);
    g.addColorStop(0, '#2A261D'); g.addColorStop(0.1, '#6B695B'); g.addColorStop(0.3, '#A9A791');
    g.addColorStop(0.42, '#B6B6A0'); g.addColorStop(0.6, '#8E8D79'); g.addColorStop(0.82, '#57544A');
    g.addColorStop(1, '#221E17');
    return g;
  }
  // Rust blotches inside the current clip, seeded so every pipe shape keeps its own pattern.
  function rust(ctx, x0, y0, x1, y1, k, seed, n, alongX) {
    for (var i = 0; i < n; i++) {
      var x = x0 + (x1 - x0) * hash(seed, i * 3 + 1), y = y0 + (y1 - y0) * hash(seed, i * 3 + 2);
      var r = (1.5 + 3 * hash(seed, i * 3 + 3)) * k, len = r * (2 + 2.5 * hash(seed + 7, i));
      ctx.fillStyle = RUST + (0.18 + 0.22 * hash(i, seed)).toFixed(2) + ')';
      ctx.beginPath(); ctx.ellipse(x * k, y * k, alongX ? len : r, alongX ? r : len, 0, 0, Math.PI * 2); ctx.fill();
    }
  }
  // Rust gathering toward the pipe ends (next to the flanges).
  function endRust(ctx, x0, y0, x1, y1, k, alongX) {
    var g = alongX ? ctx.createLinearGradient(x0 * k, 0, x1 * k, 0) : ctx.createLinearGradient(0, y0 * k, 0, y1 * k);
    g.addColorStop(0, RUST + '0.45)'); g.addColorStop(0.18, RUST + '0)'); g.addColorStop(0.82, RUST + '0)'); g.addColorStop(1, RUST + '0.45)');
    ctx.fillStyle = g; ctx.fillRect(x0 * k, y0 * k, (x1 - x0) * k, (y1 - y0) * k);
  }
  // Mottled steel: fine light/dark specks inside the current clip.
  function speckle(ctx, x0, y0, x1, y1, k, seed) {
    var n = Math.round((x1 - x0) * (y1 - y0) / 14);
    for (var i = 0; i < n; i++) {
      var h = hash(seed * 31 + i, 17);
      ctx.fillStyle = h < 0.5 ? 'rgba(255,250,230,0.10)' : 'rgba(30,24,16,0.13)';
      ctx.fillRect((x0 + (x1 - x0) * hash(i, seed + 3)) * k, (y0 + (y1 - y0) * hash(seed + 5, i)) * k, (0.8 + h) * k, (0.8 + h) * k);
    }
  }
  function vBody(ctx, y0, y1, k, seed) {
    ctx.fillStyle = bodyGradient(ctx, VX0, VX1, false, k); ctx.fillRect(VX0 * k, y0 * k, (VX1 - VX0) * k, (y1 - y0) * k);
    ctx.save(); ctx.beginPath(); ctx.rect(VX0 * k, y0 * k, (VX1 - VX0) * k, (y1 - y0) * k); ctx.clip();
    speckle(ctx, VX0, Math.max(0, y0), VX1, Math.min(64, y1), k, seed);
    rust(ctx, VX0, y0, VX1, y1, k, seed, 6, false);
    if (y1 - y0 >= 60) endRust(ctx, VX0, y0, VX1, y1, k, false);
    ctx.restore();
  }
  function hBody(ctx, x0, x1, k, seed) {
    ctx.fillStyle = bodyGradient(ctx, HY0, HY1, true, k); ctx.fillRect(x0 * k, HY0 * k, (x1 - x0) * k, (HY1 - HY0) * k);
    ctx.save(); ctx.beginPath(); ctx.rect(x0 * k, HY0 * k, (x1 - x0) * k, (HY1 - HY0) * k); ctx.clip();
    speckle(ctx, Math.max(0, x0), HY0, Math.min(64, x1), HY1, k, seed);
    rust(ctx, x0, HY0, x1, HY1, k, seed, 6, true);
    if (x1 - x0 >= 60) endRust(ctx, x0, HY0, x1, HY1, k, true);
    ctx.restore();
  }
  function bolt(ctx, x, y, r) {
    ctx.fillStyle = '#15120D'; ctx.beginPath(); ctx.arc(x + r * 0.35, y + r * 0.35, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = BOLT; ctx.beginPath(); ctx.arc(x, y, r * 0.8, 0, Math.PI * 2); ctx.fill();
  }
  // Flange on a north/south joint: an upright bolted disc facing the viewer (south), squashed
  // by the view angle, centred at (VCX, cy). The pipe section south of it is drawn afterwards
  // (southStub) and covers the disc's lower middle, which leaves the typical dark arch.
  function flangeDisc(ctx, cy, k) {
    var cx = VCX * k, y = cy * k, rx = 25 * k, ry = 12 * k;
    ctx.fillStyle = '#17140F'; ctx.beginPath(); ctx.ellipse(cx, y + 1.2 * k, rx + 0.8 * k, ry + 0.8 * k, 0, 0, Math.PI * 2); ctx.fill();
    var g = ctx.createLinearGradient(0, y - ry, 0, y + ry);
    g.addColorStop(0, '#6E5D47'); g.addColorStop(0.35, '#4A3E31'); g.addColorStop(1, '#2B241C');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(cx, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(160,140,110,0.45)'; ctx.lineWidth = 0.8 * k;
    ctx.beginPath(); ctx.ellipse(cx, y, rx - 0.8 * k, ry - 0.8 * k, 0, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
    for (var i = 0; i < 16; i++) {
      var a = i / 16 * Math.PI * 2;
      bolt(ctx, cx + Math.cos(a) * 22 * k, y + Math.sin(a) * 9.6 * k, 1.1 * k);
    }
  }
  // The pipe leaving a flange disc toward the south: body with a rounded (cross-section) top.
  function southStub(ctx, cy, y1, k, seed) {
    ctx.save();
    ctx.beginPath(); ctx.ellipse(VCX * k, cy * k, (VX1 - VX0) / 2 * k, 6 * k, 0, Math.PI, Math.PI * 2); ctx.rect(VX0 * k, cy * k, (VX1 - VX0) * k, (y1 - cy) * k); ctx.clip();
    vBody(ctx, cy - 8, y1, k, seed);
    ctx.restore();
  }
  // Blind end on the north side of a pipe that only connects south: a short capped stub.
  function capNorth(ctx, k, seed) {
    var cx = VCX * k, hw = (VX1 - VX0) / 2 * k;
    var g = ctx.createRadialGradient(cx - hw * 0.3, 6 * k, 1 * k, cx, 12 * k, hw * 1.1);
    g.addColorStop(0, '#B8B7A1'); g.addColorStop(0.6, '#86857A'); g.addColorStop(1, '#3A362B');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(cx, 12 * k, hw, 8 * k, 0, 0, Math.PI * 2); ctx.fill();
    vBody(ctx, 12, 20, k, seed);
  }
  // Flange seen from the side (east/west joints): narrow upright ellipse centred at (cx, HCY).
  function flangeSide(ctx, cx, k, facingLeft) {
    var x = cx * k, y = HCY * k, rx = 5 * k, ry = 23.5 * k;
    ctx.fillStyle = '#1B1813'; ctx.beginPath(); ctx.ellipse(x, y + 1.5 * k, rx + 0.8 * k, ry + 0.8 * k, 0, 0, Math.PI * 2); ctx.fill();
    var g = ctx.createLinearGradient(x - rx, 0, x + rx, 0);
    g.addColorStop(0, '#6E5D47'); g.addColorStop(0.55, '#4A3E31'); g.addColorStop(1, '#241E17');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    for (var i = 0; i < 7; i++) { // bolt pins sticking out of the ring
      var by = y + (-19 + i * 6.3) * k, px = x + (facingLeft ? -rx - 0.6 * k : rx + 0.6 * k);
      ctx.fillStyle = '#15120D'; ctx.fillRect(Math.min(x, px) - 0.5 * k, by - 0.9 * k, Math.abs(px - x) + 1.5 * k, 1.8 * k);
      ctx.fillStyle = BOLT; ctx.fillRect(Math.min(x, px), by - 0.6 * k, Math.abs(px - x) + 0.6 * k, 1.1 * k);
    }
  }
  // Domed cap facing the viewer at the south end (single north connection).
  function capSouth(ctx, cy, k) {
    var cx = VCX * k, y = cy * k;
    ctx.fillStyle = '#1B1813'; ctx.beginPath(); ctx.ellipse(cx, y + 1.5 * k, 25.5 * k, 14.5 * k, 0, 0, Math.PI * 2); ctx.fill();
    var rings = [[24.5, 13.5, '#5E4D39'], [19, 10.5, '#7F7B68'], [14, 7.8, '#9B9883'], [9, 5, '#8B8874'], [4.5, 2.6, '#6E6B5C']];
    rings.forEach(function (r, i) {
      ctx.fillStyle = r[2]; ctx.beginPath(); ctx.ellipse(cx, y + i * 0.9 * k, r[0] * k, r[1] * k, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(20,16,12,0.7)'; ctx.lineWidth = 0.7 * k; ctx.stroke();
    });
    for (var i = 0; i < 14; i++) {
      var a = i / 14 * Math.PI * 2;
      bolt(ctx, cx + Math.cos(a) * 21.8 * k, y + Math.sin(a) * 12 * k, 1.05 * k);
    }
  }
  // Elbow between the vertical run on side vy (0 = N, 2 = S) and the horizontal run on hx
  // (1 = E, 3 = W): a quarter of an elliptical tube around the corner the two runs meet in.
  function elbow(ctx, vy, hx, k, seed) {
    var px = hx === 1 ? 64 : 0, py = vy === 0 ? 0 : 64;
    var rx = Math.abs(px - VCX), ry = Math.abs(py - HCY), half = (VX1 - VX0) / 2;
    // quadrant of the tile interior as seen from the corner pivot
    var q = vy === 0 ? (hx === 1 ? 1 : 0) : (hx === 1 ? 2 : 3), start = q * Math.PI / 2, end = start + Math.PI / 2;
    ctx.save();
    ctx.translate(px * k, py * k); ctx.scale(1, ry / rx);
    var g = ctx.createRadialGradient(0, 0, (rx - half) * k, 0, 0, (rx + half) * k);
    g.addColorStop(0, '#2A261D'); g.addColorStop(0.12, '#5E5C50'); g.addColorStop(0.45, '#A9A791');
    g.addColorStop(0.6, '#B3B39D'); g.addColorStop(0.85, '#6B695B'); g.addColorStop(1, '#221E17');
    ctx.beginPath(); ctx.arc(0, 0, (rx + half) * k, start, end); ctx.arc(0, 0, (rx - half) * k, end, start, true); ctx.closePath();
    ctx.fillStyle = g; ctx.fill();
    ctx.clip();
    ctx.scale(1, rx / ry); ctx.translate(-px * k, -py * k);
    rust(ctx, 0, 0, 64, 64, k, seed, 6, false);
    ctx.restore();
  }
  function fluidColor(fluid) {
    try { if (fluid && F.data.fluids && F.data.fluids[fluid] && F.data.fluids[fluid].color) return F.data.fluids[fluid].color; } catch (e) { /* not loaded */ }
    return null;
  }
  // Glass window on a straight piece; shows the carried fluid's colour.
  function pipeWindow(ctx, vertical, k, fluid) {
    var x, y, w, h;
    if (vertical) { x = 18 * k; y = 10 * k; w = 11 * k; h = 38 * k; } else { x = 19 * k; y = 20 * k; w = 26 * k; h = 12 * k; }
    L.roundRectPath(ctx, x - 1.2 * k, y - 1.2 * k, w + 2.4 * k, h + 2.4 * k, 4 * k); ctx.fillStyle = '#4A4436'; ctx.fill();
    L.roundRectPath(ctx, x, y, w, h, 3.5 * k); ctx.fillStyle = '#16140F'; ctx.fill();
    var col = fluidColor(fluid);
    if (col) {
      ctx.save(); L.roundRectPath(ctx, x, y, w, h, 3.5 * k); ctx.clip();
      ctx.fillStyle = L.rgba(col, 0.85); ctx.fillRect(x, vertical ? y + h * 0.15 : y + h * 0.3, w, h);
      ctx.restore();
    }
    var g = vertical ? ctx.createLinearGradient(x, 0, x + w, 0) : ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, 'rgba(255,255,255,0.35)'); g.addColorStop(0.35, 'rgba(255,255,255,0.05)'); g.addColorStop(1, 'rgba(0,0,0,0.3)');
    L.roundRectPath(ctx, x, y, w, h, 3.5 * k); ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = '#15120D'; ctx.lineWidth = 0.8 * k; ctx.stroke();
  }

  function paintPipe(ctx, W, H, frame, dir, def, type, opts) {
    var k = W / 64, mask = (opts && opts.mask) | 0;
    var N = mask & 1, E = mask & 2, S = mask & 4, Wd = mask & 8, n = (N ? 1 : 0) + (E ? 1 : 0) + (S ? 1 : 0) + (Wd ? 1 : 0);
    var seed = mask + 1;
    ctx.clearRect(0, 0, W, H);
    // north flange first: the body in front of it covers its middle
    if (N) flangeDisc(ctx, -4, k);
    if (n === 0) { // lone pipe: short upright piece with a blind top and a cap facing south
      capNorth(ctx, k, seed); flangeDisc(ctx, 20, k); southStub(ctx, 20, 50, k, seed); capSouth(ctx, 50, k); return;
    }
    if (n === 1) {
      if (N) { vBody(ctx, 0, 48, k, seed); capSouth(ctx, 48, k); }
      if (S) { capNorth(ctx, k, seed); flangeDisc(ctx, 20, k); southStub(ctx, 20, 64, k, seed); }
      if (E) { ctx.fillStyle = '#5E5C50'; ctx.beginPath(); ctx.ellipse(8 * k, HCY * k, 3.5 * k, 13 * k, 0, 0, Math.PI * 2); ctx.fill(); hBody(ctx, 12, 64, k, seed); flangeSide(ctx, 12, k, true); }
      if (Wd) { hBody(ctx, 0, 52, k, seed); flangeSide(ctx, 52, k, false); }
    } else if (n === 2 && !((N && S) || (E && Wd))) {
      elbow(ctx, N ? 0 : 2, E ? 1 : 3, k, seed);
    } else {
      // through runs and branches: a branch runs in under the through pipe (the vertical run
      // lies on top at a crossing)
      var hThrough = E && Wd, vThrough = N && S;
      var drawH = function () { if (hThrough) hBody(ctx, 0, 64, k, seed); else if (E) hBody(ctx, VCX, 64, k, seed); else if (Wd) hBody(ctx, 0, VCX, k, seed); };
      var drawV = function () { if (vThrough) vBody(ctx, 0, 64, k, seed + 3); else if (N) vBody(ctx, 0, HCY, k, seed + 3); else if (S) vBody(ctx, HCY, 64, k, seed + 3); };
      if (hThrough && !vThrough) { drawV(); drawH(); } else { drawH(); drawV(); }
      if (n === 2 && opts && (opts.variant | 0) === 1) pipeWindow(ctx, vThrough, k, opts.fluid);
    }
    // flanges at the other connected edges (each neighbour draws the other half of the ring)
    if (S) { flangeDisc(ctx, 60, k); southStub(ctx, 60, 64, k, seed); }
    if (E) flangeSide(ctx, 64, k, true);
    if (Wd) flangeSide(ctx, 0, k, false);
  }

  // Bolted ring lying on the ground where the pipe dives underground.
  function groundRing(ctx, cx, cy, rx, ry, rot, k) {
    ctx.save(); ctx.translate(cx * k, cy * k); ctx.rotate(rot);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(2 * k, 2 * k, rx * k, ry * k, 0, 0, Math.PI * 2); ctx.fill();
    var g = ctx.createLinearGradient(0, -ry * k, 0, ry * k);
    g.addColorStop(0, '#3E342A'); g.addColorStop(0.6, '#5A4B3A'); g.addColorStop(1, '#6E5D47');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, rx * k, ry * k, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#15120D'; ctx.lineWidth = 0.9 * k; ctx.stroke();
    for (var i = 0; i < 12; i++) {
      var a = i / 12 * Math.PI * 2;
      bolt(ctx, Math.cos(a) * (rx - 2.8) * k, Math.sin(a) * (ry - 2.2) * k, 1.1 * k);
    }
    ctx.restore();
  }
  function paintPipeToGround(ctx, W, H, frame, dir, def, type, opts) {
    var k = W / 64, conn = F.util.oppDir(dir & 3), seed = 11 + conn;
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(W / 2, H / 2); ctx.rotate(-(dir & 3) * Math.PI / 2); ctx.translate(-W / 2, -H / 2);
    if (conn === 0) { // from the north edge down into a ring on the ground
      flangeDisc(ctx, -4, k);
      groundRing(ctx, VCX, 50, 26, 12.5, 0, k);
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, 50 * k); ctx.ellipse(VCX * k, 50 * k, 18.5 * k, 7.5 * k, 0, 0, Math.PI * 2); ctx.clip();
      vBody(ctx, 0, 58, k, seed); ctx.restore();
    } else if (conn === 2) { // from the south edge, arching over and down into the ground
      groundRing(ctx, VCX, 38, 26, 11, 0, k);
      vBody(ctx, 30, 64, k, seed);
      var hw = (VX1 - VX0) / 2 * k;
      var g = ctx.createRadialGradient((VCX - 7) * k, 16 * k, 2 * k, VCX * k, 30 * k, hw * 1.15);
      g.addColorStop(0, '#BDBCA6'); g.addColorStop(0.55, '#8E8D79'); g.addColorStop(1, '#3A362B');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(VCX * k, 30 * k, hw, 20 * k, 0, Math.PI, Math.PI * 2); ctx.fill();
      ctx.save(); ctx.beginPath(); ctx.ellipse(VCX * k, 30 * k, hw, 20 * k, 0, Math.PI, Math.PI * 2); ctx.clip();
      speckle(ctx, VX0, 10, VX1, 30, k, seed); rust(ctx, VX0, 10, VX1, 30, k, seed, 3, false); ctx.restore();
      flangeDisc(ctx, 60, k); southStub(ctx, 60, 64, k, seed);
    } else { // from the east / west edge, the end bending down onto a tilted ring
      var east = conn === 1;
      ctx.save(); if (!east) { ctx.translate(W, 0); ctx.scale(-1, 1); }
      groundRing(ctx, 21, 44, 19, 13, -0.35, k);
      var eg = ctx.createRadialGradient(15 * k, 22 * k, 2 * k, 22 * k, (HCY + 3) * k, 21 * k);
      eg.addColorStop(0, '#BDBCA6'); eg.addColorStop(0.55, '#8E8D79'); eg.addColorStop(1, '#3A362B');
      ctx.fillStyle = eg; ctx.beginPath(); ctx.ellipse(24 * k, (HCY + 3) * k, 14 * k, 20 * k, 0, 0, Math.PI * 2); ctx.fill();
      hBody(ctx, 24, 64, k, seed);
      flangeSide(ctx, 64, k, true);
      ctx.restore();
    }
    ctx.restore();
  }

  F.sprites.definePainter(['pipe'], paintPipe);
  F.sprites.definePainter(['pipe-to-ground'], paintPipeToGround);
})();
