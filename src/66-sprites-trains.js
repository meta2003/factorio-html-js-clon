// 66-sprites-trains.js — rail/train-stop painters + free-moving vehicle sprites for the trains
// expansion feature (src/38-trains.js, design/EXPANSION.md §7.2 & §8). See design/BUILDING-ART.md
// for the painter contract/style and src/60-sprites.js "Building art library" for F.sprites.lib.
// Registers via F.sprites.definePainter; never edits 60-sprites.js. Deterministic only (rail
// ballast speckle uses F.rng.local, a seeded PRNG — not Math.random — so cached output is stable).
(function () {
  'use strict';
  if (!F.sprites || !F.sprites.definePainter) return;
  var L = F.sprites.lib;

  // =========================================================================================
  // Rail (1x1, layer 'floor'). opts.mask: bit0=N,1=E,2=S,3=W of connected neighbour rails.
  // Gravel ballast bed (full tile, opaque — keeps the auto soft-shadow from reading as the tile
  // "floating": see report) + wooden sleepers + two steel rails (dark body, bright top strip).
  // Rail gauge = ±0.22 tile from the track centreline; centrelines always run edge-mid to
  // edge-mid so neighbouring rail tiles join without a seam.
  // =========================================================================================
  var GAUGE_F = 0.22, RAIL_W_F = 0.075, RAIL_HI_F = 0.34, TIE_LEN_F = 0.66, TIE_TH_F = 0.11;

  function ballastBed(ctx, W, H) {
    ctx.fillStyle = '#6E655A'; ctx.fillRect(0, 0, W, H);
    var rng = F.rng.local(11, 29, 53);
    var n = 22;
    for (var i = 0; i < n; i++) {
      var x = rng() * W, y = rng() * H, r = (0.018 + rng() * 0.03) * W;
      ctx.globalAlpha = 0.5 + rng() * 0.3;
      ctx.fillStyle = rng() < 0.5 ? '#8A8074' : '#54493E';
      ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.72, rng() * Math.PI, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // subtle top-left/bottom-right ambient gradient — carries the "light from top-left" cue
    // across the whole flat bed without needing a per-segment lighting model.
    var g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, 'rgba(255,255,255,0.06)'); g.addColorStop(1, 'rgba(0,0,0,0.10)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }

  // Wooden sleeper (tie) centred at (x,y), long axis perpendicular to the rail direction
  // `angle` (radians, world/local space — rails are not rotatable so local == world here).
  function drawTie(ctx, x, y, angle, len, th) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
    ctx.fillStyle = '#3E2C1E'; ctx.fillRect(-th * 0.55, -len / 2, th * 1.1, len);
    ctx.fillStyle = '#4A3626'; ctx.fillRect(-th / 2, -len / 2, th, len);
    ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(-th * 0.16, -len / 2, th * 0.2, len);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = Math.max(1, th * 0.1);
    ctx.strokeRect(-th / 2, -len / 2, th, len);
    ctx.restore();
  }
  // One rail (dark steel body + a narrower bright top strip along the same centreline) between
  // two points — used for both straight segments and (pre-offset) arc chords via line calls.
  function strokeRailLine(ctx, x1, y1, x2, y2, railW, hiW) {
    ctx.lineCap = 'butt';
    ctx.strokeStyle = '#2A2D30'; ctx.lineWidth = railW;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.strokeStyle = '#D8DCDE'; ctx.lineWidth = hiW;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }
  function strokeRailArc(ctx, px, py, r, a0, a1, railW, hiW) {
    ctx.lineCap = 'butt';
    ctx.strokeStyle = '#2A2D30'; ctx.lineWidth = railW;
    ctx.beginPath(); ctx.arc(px, py, r, a0, a1); ctx.stroke();
    ctx.strokeStyle = '#D8DCDE'; ctx.lineWidth = hiW;
    ctx.beginPath(); ctx.arc(px, py, r, a0, a1); ctx.stroke();
  }
  // Straight rail segment (ties + both rails) from (x1,y1) to (x2,y2).
  function railStraightSeg(ctx, x1, y1, x2, y2, gauge, railW, hiW, tieLen, tieTh, tieCount) {
    var dx = x2 - x1, dy = y2 - y1, len = Math.sqrt(dx * dx + dy * dy) || 1;
    var ux = dx / len, uy = dy / len, nx = -uy, ny = ux, angle = Math.atan2(dy, dx);
    for (var i = 0; i < tieCount; i++) {
      var t = (i + 0.5) / tieCount;
      drawTie(ctx, x1 + dx * t, y1 + dy * t, angle, tieLen, tieTh);
    }
    for (var s = -1; s <= 1; s += 2) {
      var ox = nx * gauge * s, oy = ny * gauge * s;
      strokeRailLine(ctx, x1 + ox, y1 + oy, x2 + ox, y2 + oy, railW, hiW);
    }
  }
  // Curved rail segment: quarter arc centred at (px,py) radius r sweeping a0..a1 (radians).
  function railArcSeg(ctx, px, py, r, a0, a1, gauge, railW, hiW, tieLen, tieTh, tieCount) {
    for (var i = 0; i < tieCount; i++) {
      var t = (i + 0.5) / tieCount, phi = a0 + (a1 - a0) * t;
      drawTie(ctx, px + r * Math.cos(phi), py + r * Math.sin(phi), phi + Math.PI / 2, tieLen, tieTh);
    }
    strokeRailArc(ctx, px, py, r - gauge, a0, a1, railW, hiW);
    strokeRailArc(ctx, px, py, r + gauge, a0, a1, railW, hiW);
  }
  // Adjacent-bit pair -> pivot corner + angle sweep (quarter arc), corner shared by the two
  // connected edges so the arc's tangent at each edge-mid point is exactly perpendicular to
  // that edge — matching a straight rail arriving from the neighbouring tile (seamless join).
  function curveFor(mask, W, H) {
    switch (mask) {
      case 3: return { cx: W, cy: 0, a0: Math.PI / 2, a1: Math.PI };       // N+E
      case 6: return { cx: W, cy: H, a0: Math.PI, a1: 3 * Math.PI / 2 };   // E+S
      case 12: return { cx: 0, cy: H, a0: 3 * Math.PI / 2, a1: 2 * Math.PI }; // S+W
      case 9: return { cx: 0, cy: 0, a0: 0, a1: Math.PI / 2 };             // W+N
      default: return null;
    }
  }
  function countBits(m) { var c = 0; for (var i = 0; i < 4; i++) if (m & (1 << i)) c++; return c; }
  // Small steel frog/switch plate (NOT a disc) marking where two rails physically cross —
  // a thin lighter plate set diamond-wise, per the visual-review fix (junctions previously drew
  // a big black disc that read as a manhole cover instead of trackwork).
  function drawFrogPlate(ctx, cx, cy, size) {
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(Math.PI / 4);
    L.panel(ctx, -size / 2, -size / 2, size, size, '#9AA1A6', { r: size * 0.2, hi: 26, lo: 18, outlineWidth: 1.1 });
    ctx.restore();
  }

  function paintRail(ctx, W, H, frame, dir, def, type, opts) {
    var mask = (opts && opts.mask != null) ? opts.mask : 0;
    var cx = W / 2, cy = H / 2;
    var gauge = W * GAUGE_F, railW = Math.max(1.4, W * RAIL_W_F), hiW = Math.max(0.8, railW * RAIL_HI_F);
    var tieLen = W * TIE_LEN_F, tieTh = Math.max(2, W * TIE_TH_F);
    ballastBed(ctx, W, H);
    var bits = countBits(mask);
    if (bits >= 3) {
      // Junction: draw a full straight THROUGH line for each axis that has both opposite bits
      // set (N+S and/or E+W), plus a centre->edge branch stub for any lone bit left over (the
      // stem of a T). A cross (all 4 bits) draws both through lines and no stubs. Finishes with
      // a small frog/switch plate at the crossing point instead of a disc.
      var hasNS = (mask & 5) === 5, hasEW = (mask & 10) === 10;
      if (hasNS) railStraightSeg(ctx, cx, 0, cx, H, gauge, railW, hiW, tieLen, tieTh, 5);
      if (hasEW) railStraightSeg(ctx, 0, cy, W, cy, gauge, railW, hiW, tieLen, tieTh, 5);
      for (var d = 0; d < 4; d++) {
        if (!(mask & (1 << d))) continue;
        var opp = (d + 2) & 3;
        if (mask & (1 << opp)) continue; // part of a through line already drawn above
        var v = F.util.dirVec(d);
        railStraightSeg(ctx, cx, cy, cx + v[0] * W / 2, cy + v[1] * H / 2, gauge, railW, hiW, tieLen * 0.9, tieTh, 3);
      }
      drawFrogPlate(ctx, cx, cy, W * 0.16);
      return;
    }
    var curve = bits === 2 ? curveFor(mask, W, H) : null;
    if (curve) {
      railArcSeg(ctx, curve.cx, curve.cy, W / 2, curve.a0, curve.a1, gauge, railW, hiW, tieLen, tieTh, 5);
      return;
    }
    // 0 bits (default), 1 bit ("treat as straight through that axis"), or 2 opposite bits.
    var axisNS = bits === 0 ? true : (mask & 5) !== 0; // bit0=N(1) or bit2=S(4)
    if (axisNS) railStraightSeg(ctx, cx, 0, cx, H, gauge, railW, hiW, tieLen, tieTh, 5);
    else railStraightSeg(ctx, 0, cy, W, cy, gauge, railW, hiW, tieLen, tieTh, 5);
  }

  // =========================================================================================
  // Train stop (1x1): concrete base, post, coloured station-sign board, lamp on top.
  // =========================================================================================
  function paintTrainStop(ctx, W, H) {
    L.foundation(ctx, W, H, '#7A7C7E');
    var px = W * 0.5, postW = W * 0.1;
    L.panel(ctx, W * 0.36, H * 0.82, W * 0.28, H * 0.1, '#4A4D50', { r: W * 0.02, hi: 10, lo: 20 });
    L.panel(ctx, px - postW / 2, H * 0.28, postW, H * 0.58, '#5A5D60', { r: postW * 0.25, hi: 20, lo: 26 });
    var signW = W * 0.52, signH = H * 0.22, signX = px - signW / 2, signY = H * 0.16;
    L.panel(ctx, signX, signY, signW, signH, '#C9A227', { r: signH * 0.16, hi: 30, lo: 22 });
    ctx.fillStyle = 'rgba(20,16,6,0.55)';
    ctx.fillRect(signX + signW * 0.12, signY + signH * 0.4, signW * 0.76, signH * 0.18);
    L.disc(ctx, px, H * 0.14, W * 0.07, '#FFE9A8', { hi: 15, lo: 15 });
    L.glow(ctx, px, H * 0.14, W * 0.34, '#FFE29A', 0.3);
  }

  F.sprites.definePainter(['rail'], paintRail);
  F.sprites.definePainter(['train-stop'], paintTrainStop);

  // =========================================================================================
  // Rail signal / chain signal (1x1, rotatable: painted facing north = the rail tile it
  // guards). frame = aspect from 38-trains.js: 0 green, 1 red, 2 yellow. Concrete pad, a mast
  // with a three-lamp head (only the current lamp lit) and a small pointer toward the rail.
  // The chain signal gets a blue band on its head so the two read apart at a glance.
  // =========================================================================================
  var LAMP_ON = ['#4CF26A', '#FF4436', '#FFD23A'];
  var LAMP_OFF = ['#1F4A28', '#4A1C18', '#4A4018'];
  function paintRailSignal(ctx, W, H, frame, dir, def, type) {
    var chain = type === 'rail-chain-signal';
    var aspect = (frame | 0) % 3;
    L.foundation(ctx, W, H, '#7A7C7E');
    // pointer toward the guarded rail (top edge)
    ctx.fillStyle = '#E8E2C8';
    ctx.beginPath(); ctx.moveTo(W * 0.5, H * 0.03); ctx.lineTo(W * 0.62, H * 0.13); ctx.lineTo(W * 0.38, H * 0.13); ctx.closePath(); ctx.fill();
    L.panel(ctx, W * 0.45, H * 0.6, W * 0.1, H * 0.3, '#4A4D50', { r: W * 0.03, hi: 18, lo: 24 });
    var hx = W * 0.3, hy = H * 0.16, hw = W * 0.4, hh = H * 0.5;
    L.panel(ctx, hx, hy, hw, hh, '#2B2E31', { r: hw * 0.28, hi: 14, lo: 22 });
    if (chain) { ctx.fillStyle = '#3F86D0'; ctx.fillRect(hx + hw * 0.08, hy + hh * 0.9, hw * 0.84, hh * 0.08); }
    // lamp order top->bottom: red, yellow, green (railway convention)
    var order = [1, 2, 0];
    for (var i = 0; i < 3; i++) {
      var k = order[i], cy = hy + hh * (0.2 + i * 0.29), on = k === aspect;
      L.disc(ctx, W * 0.5, cy, W * 0.085, on ? LAMP_ON[k] : LAMP_OFF[k], { hi: on ? 25 : 8, lo: 15 });
      if (on) L.glow(ctx, W * 0.5, cy, W * 0.3, LAMP_ON[k], 0.45);
    }
  }
  F.sprites.definePainter(['rail-signal', 'rail-chain-signal'], paintRailSignal);

  // =========================================================================================
  // Vehicles: free-moving sprites (not F.sprites.entity — trains sit between tiles and rotate
  // to the rail tangent, so the feature module draws these directly). 128x192 px = 2x3 tiles at
  // 64 px/tile, facing NORTH, cached per (type,frame). NO shadow baked in (design/EXPANSION.md
  // §6.5: "shadow NOT included (feature draws a soft shadow)").
  // =========================================================================================
  // Bogie frame + wheels, drawn BEFORE the body panel so the hull covers the middle of the
  // truck — from top-down only a small wheel-flange peek should read at the body's sides.
  function drawBogieHidden(ctx, cx, y, w, h) {
    L.panel(ctx, cx - w / 2, y - h / 2, w, h, '#2C2E30', { r: h * 0.22, hi: 10, lo: 16, outlineWidth: 1.2 });
    for (var i = -1; i <= 1; i++) {
      L.disc(ctx, cx + i * w * 0.34, y, h * 0.42, '#17181A', { hi: 16, lo: 8, outlineWidth: 1 });
    }
  }
  // Tiny wheel-flange nub drawn AFTER the body, centred exactly on the body's side edge so only
  // ~half its radius (a few px) is visible poking out beyond the hull.
  function drawWheelFlange(ctx, x, y, r) {
    L.disc(ctx, x, y, r, '#1C1E20', { hi: 22, lo: 8, outlineWidth: 1 });
  }
  function drawFlangePair(ctx, xLeft, xRight, y, spread, r) {
    [-1, 1].forEach(function (s) {
      drawWheelFlange(ctx, xLeft, y + s * spread, r);
      drawWheelFlange(ctx, xRight, y + s * spread, r);
    });
  }
  function paintLocomotiveVehicle(ctx, W, H, frame) {
    var cx = W / 2, body = '#8A3A22', trim = '#3A3D40';
    var bodyX = W * 0.12, bodyW = W * 0.76, bodyRight = bodyX + bodyW;
    var flangeR = W * 0.035; // ~4-5px peek beyond the hull once the body is drawn on top

    // --- bogies first (hidden under the hull once it's painted) ---
    var bogieFrontY = H * 0.345, bogieRearY = H * 0.865, bogieH = bodyW * 0.30;
    drawBogieHidden(ctx, cx, bogieFrontY, bodyW * 0.84, bogieH);
    drawBogieHidden(ctx, cx, bogieRearY, bodyW * 0.84, bogieH);

    // --- hull (rear 2/3: engine bay under a raised roof) ---
    L.panel(ctx, bodyX, H * 0.32, bodyW, H * 0.60, body, { r: W * 0.06, hi: 20, lo: 30 });

    // --- long sloped nose hood at the front (top), tapering from the hull up toward a
    // near-flat buffer beam at the very top — longer/more gradual than a stubby wedge. ---
    var noseBaseY = H * 0.34, noseTopY = H * 0.05;
    ctx.beginPath();
    ctx.moveTo(bodyX, noseBaseY);
    ctx.lineTo(bodyX + bodyW * 0.05, noseTopY + H * 0.035);
    ctx.quadraticCurveTo(cx, noseTopY - H * 0.015, bodyRight - bodyW * 0.05, noseTopY + H * 0.035);
    ctx.lineTo(bodyRight, noseBaseY);
    ctx.closePath();
    var ng = ctx.createLinearGradient(bodyX, 0, bodyRight, 0);
    ng.addColorStop(0, L.lighten(body, 28)); ng.addColorStop(0.5, L.lighten(body, 6)); ng.addColorStop(1, L.darken(body, 28));
    ctx.fillStyle = ng; ctx.fill();
    ctx.strokeStyle = 'rgba(10,10,10,0.9)'; ctx.lineWidth = 2; ctx.stroke();

    // front buffer beam: flat strip right at the top edge with yellow/black hazard chevrons
    var beamW = bodyW * 0.62, beamX = cx - beamW / 2, beamH = noseTopY * 0.85;
    L.hazardStripe(ctx, beamX, 0, beamW, beamH, beamH * 0.5);

    // small red/white marker lights flanking the buffer beam
    L.disc(ctx, beamX - W * 0.02, beamH * 0.5, W * 0.018, '#E8402C', { hi: 30, lo: 10, outlineWidth: 0.8 });
    L.disc(ctx, beamX + beamW + W * 0.02, beamH * 0.5, W * 0.018, '#F2F2E8', { hi: 30, lo: 10, outlineWidth: 0.8 });

    // front grille under the headlights
    L.vent(ctx, cx - bodyW * 0.16, H * 0.225, bodyW * 0.32, H * 0.045, 5, false);
    // headlights — flicker/brighten over the 8-frame loop
    var flick = 0.55 + 0.45 * Math.abs(Math.sin((frame / 8) * Math.PI));
    var lampX = bodyW * 0.24;
    [-1, 1].forEach(function (s) {
      L.glow(ctx, cx + s * lampX, H * 0.175, W * 0.16, '#FFE9A0', 0.28 * flick);
      L.disc(ctx, cx + s * lampX, H * 0.175, W * 0.042, '#FFF3C4', { hi: 10, lo: 10 });
    });

    // cab in the front third: windscreen + dark side windows
    L.inset(ctx, bodyX + bodyW * 0.12, H * 0.365, bodyW * 0.76, H * 0.10, '#141C22');
    ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(cx, H * 0.365); ctx.lineTo(cx, H * 0.465); ctx.stroke();
    L.inset(ctx, bodyX + bodyW * 0.08, H * 0.485, bodyW * 0.26, H * 0.075, '#141C22');
    L.inset(ctx, bodyX + bodyW * 0.66, H * 0.485, bodyW * 0.26, H * 0.075, '#141C22');

    // body trim band separating cab from the engine hood
    ctx.fillStyle = L.darken(body, 20); ctx.fillRect(bodyX, H * 0.58, bodyW, H * 0.025);
    L.rivets(ctx, [[bodyX + bodyW * 0.06, H * 0.58], [bodyRight - bodyW * 0.06, H * 0.58]], W * 0.018);

    // raised roof over the rear half: engine bay with radiator grilles + fans
    var roofX = bodyX + bodyW * 0.07, roofW = bodyW * 0.86, roofY = H * 0.615, roofH = H * 0.20;
    L.panel(ctx, roofX, roofY, roofW, roofH, L.lighten(body, 4), { r: W * 0.03, hi: 24, lo: 18, outlineWidth: 1.3 });
    L.vent(ctx, roofX + roofW * 0.08, roofY + roofH * 0.18, roofW * 0.84, roofH * 0.64, 6, true);
    var fanA = 0.16 + 0.14 * (0.5 + 0.5 * Math.sin((frame / 8) * Math.PI * 2 + 1.4));
    L.glow(ctx, cx - roofW * 0.19, roofY + roofH * 0.5, W * 0.11, '#B9C2C9', fanA);
    L.glow(ctx, cx + roofW * 0.19, roofY + roofH * 0.5, W * 0.11, '#B9C2C9', fanA);
    L.disc(ctx, cx - roofW * 0.19, roofY + roofH * 0.5, W * 0.045, trim, { hi: 30, lo: 20, outlineWidth: 1 });
    L.disc(ctx, cx + roofW * 0.19, roofY + roofH * 0.5, W * 0.045, trim, { hi: 30, lo: 20, outlineWidth: 1 });

    // rear engine housing louvres, below the raised roof
    L.vent(ctx, bodyX + bodyW * 0.1, H * 0.83, bodyW * 0.8, H * 0.05, 7, true);

    // wheel flanges poking out beyond the hull sides (drawn AFTER the hull/nose/roof so they
    // read as peeking out from underneath, not sitting on top of the bodywork)
    drawFlangePair(ctx, bodyX, bodyRight, bogieFrontY, bogieH * 0.28, flangeR);
    drawFlangePair(ctx, bodyX, bodyRight, bogieRearY, bogieH * 0.28, flangeR);

    // buffer/coupler nubs top and bottom
    ctx.fillStyle = '#22201C';
    ctx.fillRect(cx - W * 0.05, H * 0.965, W * 0.03, H * 0.03);
    ctx.fillRect(cx + W * 0.02, H * 0.965, W * 0.03, H * 0.03);
  }
  function paintWagonVehicle(ctx, W, H, frame) {
    var cx = W / 2, body = '#8A8F94';
    // Hull spans end-to-end (~6..186px of the 192px height) so it fully covers the bogies —
    // only the side wheel-flanges should peek out, per the visual-review fix (bogies previously
    // stuck out past the hull's top/bottom ends as black blobs).
    var bodyX = W * 0.10, bodyW = W * 0.80, bodyY = H * (6 / 192), bodyH = H * (180 / 192), bodyRight = bodyX + bodyW;
    var rim = W * 0.05;
    var flangeR = W * 0.035;

    // --- bogies first (hidden under the hull once it's painted; inset well within the hull
    // span so the panel below fully covers them top and bottom) ---
    var bogieFrontY = H * 0.165, bogieRearY = H * 0.845, bogieH = bodyW * 0.30;
    drawBogieHidden(ctx, cx, bogieFrontY, bodyW * 0.82, bogieH);
    drawBogieHidden(ctx, cx, bogieRearY, bodyW * 0.82, bogieH);

    L.panel(ctx, bodyX, bodyY, bodyW, bodyH, body, { r: W * 0.05, hi: 18, lo: 26 });
    // open top: dark brown-grey interior floor inset within the rim (not pure black)
    L.inset(ctx, bodyX + rim, bodyY + rim, bodyW - rim * 2, bodyH - rim * 2, '#3A342E', W * 0.03);
    var ix = bodyX + rim, iy = bodyY + rim, iw = bodyW - rim * 2, ih = bodyH - rim * 2;
    // cargo hint: a couple of crate-ish blocks sitting in the interior (idle-static)
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(ix + iw * 0.12, iy + ih * 0.15, iw * 0.3, ih * 0.16);
    ctx.fillStyle = 'rgba(0,0,0,0.16)'; ctx.fillRect(ix + iw * 0.52, iy + ih * 0.62, iw * 0.34, ih * 0.16);
    // 2 cross-braces spanning the open top (structural bracing struts)
    ctx.fillStyle = L.darken(body, 15);
    var brace1Y = iy + ih * 0.36, brace2Y = iy + ih * 0.70, braceH = ih * 0.06;
    ctx.fillRect(ix, brace1Y, iw, braceH);
    ctx.fillRect(ix, brace2Y, iw, braceH);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(ix, brace1Y, iw, braceH * 0.3);
    ctx.fillRect(ix, brace2Y, iw, braceH * 0.3);
    // vertical ribs along the outer walls
    ctx.strokeStyle = L.darken(body, 30); ctx.lineWidth = Math.max(1, W * 0.025);
    for (var i = 1; i < 6; i++) {
      var lx = bodyX + bodyW * i / 6;
      ctx.beginPath(); ctx.moveTo(lx, bodyY); ctx.lineTo(lx, bodyY + bodyH); ctx.stroke();
    }
    // top/bottom rim bands
    ctx.fillStyle = L.darken(body, 18);
    ctx.fillRect(bodyX, bodyY, bodyW, rim * 0.5);
    ctx.fillRect(bodyX, bodyY + bodyH - rim * 0.5, bodyW, rim * 0.5);
    // thin top rim highlight — the lit top edge of the open steel rim
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = Math.max(1, W * 0.014);
    ctx.beginPath(); ctx.moveTo(bodyX + rim * 0.3, bodyY + rim * 0.18); ctx.lineTo(bodyRight - rim * 0.3, bodyY + rim * 0.18); ctx.stroke();
    L.rivets(ctx, [[bodyX + bodyW * 0.08, bodyY + rim * 0.25], [bodyX + bodyW * 0.92, bodyY + rim * 0.25],
      [bodyX + bodyW * 0.08, bodyY + bodyH - rim * 0.25], [bodyX + bodyW * 0.92, bodyY + bodyH - rim * 0.25]], W * 0.02);
    // end walls (front/back), slightly darker
    ctx.fillStyle = L.darken(body, 12);
    ctx.fillRect(bodyX, bodyY, bodyW, rim * 0.9);
    ctx.fillRect(bodyX, bodyY + bodyH - rim * 0.9, bodyW, rim * 0.9);

    // wheel flanges poking out beyond the hull sides, drawn last (after the body)
    drawFlangePair(ctx, bodyX, bodyRight, bogieFrontY, bogieH * 0.28, flangeR);
    drawFlangePair(ctx, bodyX, bodyRight, bogieRearY, bogieH * 0.28, flangeR);

    // small grey buffer/coupler stubs at both ends, flush with the hull's end walls
    var bufW = W * 0.03, bufGap = W * 0.02;
    ctx.fillStyle = '#5A5D60';
    ctx.fillRect(cx - bufGap - bufW, 0, bufW, bodyY);
    ctx.fillRect(cx + bufGap, 0, bufW, bodyY);
    ctx.fillRect(cx - bufGap - bufW, bodyY + bodyH, bufW, H - (bodyY + bodyH));
    ctx.fillRect(cx + bufGap, bodyY + bodyH, bufW, H - (bodyY + bodyH));
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1;
    ctx.strokeRect(cx - bufGap - bufW, 0, bufW, bodyY);
    ctx.strokeRect(cx + bufGap, 0, bufW, bodyY);
    ctx.strokeRect(cx - bufGap - bufW, bodyY + bodyH, bufW, H - (bodyY + bodyH));
    ctx.strokeRect(cx + bufGap, bodyY + bodyH, bufW, H - (bodyY + bodyH));
  }

  var vehicleCache = new Map();
  // F.sprites.vehicle(type, frame) -> canvas, design/EXPANSION.md §6.5. 'locomotive'|'cargo-wagon',
  // 128x192 (2x3 tiles @ 64px/tile), facing NORTH, no shadow baked in, frame 0..7.
  F.sprites.vehicle = function (type, frame) {
    if (!F.sprites.enabled) return { width: 128, height: 192 };
    frame = ((frame | 0) % 8 + 8) % 8;
    var key = type + '|' + frame;
    var c = vehicleCache.get(key);
    if (c) return c;
    var W = 128, H = 192;
    c = L.newCanvas(W, H);
    var ctx = L.ctxOf(c);
    if (type === 'cargo-wagon') paintWagonVehicle(ctx, W, H, frame);
    else paintLocomotiveVehicle(ctx, W, H, frame); // default/'locomotive'
    vehicleCache.set(key, c);
    return c;
  };

  // =========================================================================================
  // Item icons — locomotive (front-ish 3/4 miniature) and wagon (side miniature), readable at
  // 32px. defineIcon is added concurrently elsewhere; guard the call per the task brief.
  // =========================================================================================
  if (F.sprites.defineIcon) {
    F.sprites.defineIcon('locomotive', function (ctx, S, def) {
      var c1 = (def.icon && def.icon.color) || '#C24A2A', c2 = (def.icon && def.icon.color2) || '#3A3D40';
      var x = S * 0.24, y = S * 0.12, w = S * 0.52, h = S * 0.7;
      L.panel(ctx, x, y, w, h, c1, { r: w * 0.2, hi: 22, lo: 26 });
      ctx.beginPath();
      ctx.moveTo(x, y + h * 0.22); ctx.quadraticCurveTo(x + w * 0.5, -h * 0.08, x + w, y + h * 0.22);
      ctx.lineTo(x + w, y); ctx.lineTo(x, y); ctx.closePath();
      ctx.fillStyle = L.lighten(c1, 22); ctx.fill();
      L.inset(ctx, x + w * 0.18, y + h * 0.32, w * 0.64, h * 0.2, '#1E2A33', w * 0.08);
      ctx.fillStyle = c2; ctx.fillRect(x - w * 0.03, y + h * 0.84, w * 1.06, h * 0.12);
    });
    F.sprites.defineIcon('rail-signal', function (ctx, S, def) {
      var band = (def.icon && def.icon.color2) || '#3FC35A';
      L.panel(ctx, S * 0.46, S * 0.62, S * 0.08, S * 0.3, '#5A5D60', { r: S * 0.02, hi: 14, lo: 20 });
      L.panel(ctx, S * 0.3, S * 0.08, S * 0.4, S * 0.58, '#2B2E31', { r: S * 0.12, hi: 14, lo: 22 });
      L.disc(ctx, S * 0.5, S * 0.2, S * 0.07, '#FF4436', { hi: 20, lo: 15 });
      L.disc(ctx, S * 0.5, S * 0.36, S * 0.07, '#4A4018', { hi: 8, lo: 15 });
      L.disc(ctx, S * 0.5, S * 0.52, S * 0.07, '#4CF26A', { hi: 20, lo: 15 });
      ctx.fillStyle = band; ctx.fillRect(S * 0.3, S * 0.62, S * 0.4, S * 0.05);
    });
    F.sprites.defineIcon('wagon', function (ctx, S, def) {
      var c1 = (def.icon && def.icon.color) || '#8A8F94', c2 = (def.icon && def.icon.color2) || '#5A4636';
      var x = S * 0.16, y = S * 0.24, w = S * 0.68, h = S * 0.52;
      L.panel(ctx, x, y, w, h, c1, { r: w * 0.1, hi: 18, lo: 26 });
      L.inset(ctx, x + w * 0.1, y + h * 0.14, w * 0.8, h * 0.5, L.darken(c2, 10), w * 0.04);
      ctx.strokeStyle = L.darken(c1, 25); ctx.lineWidth = Math.max(1, S * 0.03);
      for (var i = 1; i < 4; i++) {
        var lx = x + w * i / 4;
        ctx.beginPath(); ctx.moveTo(lx, y); ctx.lineTo(lx, y + h); ctx.stroke();
      }
      ctx.fillStyle = c2; ctx.fillRect(x, y + h * 0.84, w, h * 0.18);
    });
  }
})();
