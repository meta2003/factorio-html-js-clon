// 66-sprites-trains.js — rails, train stop, rail signals and the free-moving locomotive / cargo
// wagon sprites for the trains feature (src/38-trains.js, design/EXPANSION.md §7.2 & §8), drawn
// after the real Factorio art:
//   - rail (base/graphics/entity/rail: stone-path bed, ties, backplates, metals): a gravel bed
//     with a lighter raised strip under the track, dark wooden sleepers with steel tie plates, and
//     two rails with rusty flanks and a polished running top;
//   - train stop (hr-train-stop-{ground,bottom,top}: reference frames in
//     snouz/factorio_free_graphics_for_modders): a rusty grey lattice mast with a horizontal boom
//     reaching over the track and a tinted light box at its tip, service cabinets at the foot;
//   - rail signal: a short steel post with a dark three-lamp head and visors;
//   - locomotive / cargo wagon (the vanilla 256-direction renders, the "Factorio HD" frames in the
//     same collection): the locomotive is dark gunmetal with a slatted cow-catcher, grille and two
//     headlamps at the nose, exposed pipes and cylinders along the front hood, a riveted roof with
//     side vents, a round cap and the red (default train colour) roof panel, and a cab with a
//     riveted hatch at the back; the wagon is three steel sections with corrugated lids, each with
//     two raised handle bars, in a dark riveted frame.
// Our cars are 2x3 tiles against Factorio's ~1.6x6, so the bodies are drawn narrower than the
// canvas to keep them long and slim. Vehicles are cached per 1/16 turn of their heading so their
// shading stays lit from the top-left however the car is turned on the track.
(function () {
  'use strict';
  if (!F.sprites || !F.sprites.definePainter) return;
  var L = F.sprites.lib;

  function hash(a, b) {
    var h = (a * 374761393 + b * 668265263) | 0;
    h = (h ^ (h >>> 13)) * 1274126177 | 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function rgba(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  // =========================================================================================
  // Rail (1x1, layer 'floor'). opts.mask: bit0=N,1=E,2=S,3=W of connected neighbour rails. The
  // track centreline runs edge-mid to edge-mid (straights) or as a quarter arc round the corner
  // shared by two adjacent connections (curves), so neighbouring tiles join without a seam.
  // Everything is in px of a 64 px tile, scaled by k.
  // =========================================================================================
  var GAUGE = 0.28, TIE_STEP = 16;
  function countBits(m) { var c = 0; for (var i = 0; i < 4; i++) if (m & (1 << i)) c++; return c; }
  // track pieces: {s:[x1,y1,x2,y2]} straight or {a:[cx,cy,r,a0,a1]} quarter arc
  function trackPieces(mask) {
    var bits = countBits(mask), out = [];
    if (bits >= 3) {
      if ((mask & 5) === 5) out.push({ s: [32, 0, 32, 64] });
      if ((mask & 10) === 10) out.push({ s: [0, 32, 64, 32] });
      for (var d = 0; d < 4; d++) {
        if (!(mask & (1 << d)) || (mask & (1 << ((d + 2) & 3)))) continue;
        var v = F.util.dirVec(d); out.push({ s: [32, 32, 32 + v[0] * 32, 32 + v[1] * 32] });
      }
      return out;
    }
    var arcs = { 3: [64, 0, Math.PI / 2, Math.PI], 6: [64, 64, Math.PI, 1.5 * Math.PI], 12: [0, 64, 1.5 * Math.PI, 2 * Math.PI], 9: [0, 0, 0, Math.PI / 2] };
    if (bits === 2 && arcs[mask]) { var a = arcs[mask]; return [{ a: [a[0], a[1], 32, a[2], a[3]] }]; }
    var ns = bits === 0 ? true : (mask & 5) !== 0;
    return [ns ? { s: [32, 0, 32, 64] } : { s: [0, 32, 64, 32] }];
  }
  function piecePath(ctx, p, off) {
    ctx.beginPath();
    if (p.s) {
      var dx = p.s[2] - p.s[0], dy = p.s[3] - p.s[1], l = Math.sqrt(dx * dx + dy * dy) || 1, nx = -dy / l * off, ny = dx / l * off;
      ctx.moveTo(p.s[0] + nx, p.s[1] + ny); ctx.lineTo(p.s[2] + nx, p.s[3] + ny);
    } else ctx.arc(p.a[0], p.a[1], p.a[2] + off, p.a[3], p.a[4]);
  }
  // sleepers along a piece: [x, y, angle of the track] every TIE_STEP px, starting half a step in
  function tiesOf(p) {
    var out = [], i, n;
    if (p.s) {
      var dx = p.s[2] - p.s[0], dy = p.s[3] - p.s[1], l = Math.sqrt(dx * dx + dy * dy);
      n = Math.round(l / TIE_STEP);
      for (i = 0; i < n; i++) { var t = (i + 0.5) / n; out.push([p.s[0] + dx * t, p.s[1] + dy * t, Math.atan2(dy, dx)]); }
    } else {
      n = Math.round(p.a[2] * Math.PI / 2 / TIE_STEP);
      for (i = 0; i < n; i++) { var ph = p.a[3] + (p.a[4] - p.a[3]) * (i + 0.5) / n; out.push([p.a[0] + p.a[2] * Math.cos(ph), p.a[1] + p.a[2] * Math.sin(ph), ph + Math.PI / 2]); }
    }
    return out;
  }
  function paintRail(ctx, W, H, frame, dir, def, type, opts) {
    var mask = (opts && opts.mask != null) ? opts.mask : 0, k = W / 64, g = GAUGE * 64;
    ctx.save(); ctx.scale(k, k);
    // gravel bed with a lighter raised strip under the track
    ctx.fillStyle = '#5E5A52'; ctx.fillRect(0, 0, 64, 64);
    var pieces = trackPieces(mask);
    ctx.lineCap = 'butt';
    pieces.forEach(function (p) { piecePath(ctx, p, 0); ctx.strokeStyle = '#6E6A60'; ctx.lineWidth = 58; ctx.stroke(); });
    pieces.forEach(function (p) { piecePath(ctx, p, 0); ctx.strokeStyle = '#7C776C'; ctx.lineWidth = 46; ctx.stroke(); });
    for (var i = 0; i < 420; i++) {
      var h = hash(i, 5);
      ctx.fillStyle = h < 0.45 ? 'rgba(40,36,30,0.35)' : (h < 0.85 ? 'rgba(160,154,142,0.35)' : 'rgba(120,96,70,0.3)');
      var s = 0.8 + 1.4 * hash(i, 6);
      ctx.fillRect(64 * hash(i, 7), 64 * hash(i, 8), s, s * (0.6 + 0.6 * hash(i, 9)));
    }
    // sleepers and their tie plates
    var ties = [];
    pieces.forEach(function (p) { ties = ties.concat(tiesOf(p)); });
    ties.forEach(function (t) {
      ctx.save(); ctx.translate(t[0], t[1]); ctx.rotate(t[2]);
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(-3.4, -24, 7.6, 49);
      var tg = ctx.createLinearGradient(-3.6, 0, 3.6, 0); tg.addColorStop(0, '#6A5644'); tg.addColorStop(0.5, '#4E3E30'); tg.addColorStop(1, '#2E241C');
      ctx.fillStyle = tg; ctx.fillRect(-3.6, -25, 7.2, 50);
      ctx.fillStyle = 'rgba(20,14,8,0.5)'; ctx.fillRect(-3.6, -25, 7.2, 1.2); ctx.fillRect(-3.6, 23.8, 7.2, 1.2);
      [-g, g].forEach(function (o) { ctx.fillStyle = '#2A2826'; ctx.fillRect(-4.4, o - 4, 8.8, 8); ctx.fillStyle = '#4E4C48'; ctx.fillRect(-4.4, o - 4, 8.8, 1.4); });
      ctx.restore();
    });
    // rails: rusty flank, dark base edge, polished running top
    [-g, g].forEach(function (o) {
      pieces.forEach(function (p) { piecePath(ctx, p, o); ctx.strokeStyle = '#1E1A16'; ctx.lineWidth = 5.8; ctx.stroke(); });
      pieces.forEach(function (p) { piecePath(ctx, p, o); ctx.strokeStyle = '#6A4C36'; ctx.lineWidth = 4.2; ctx.stroke(); });
      pieces.forEach(function (p) { piecePath(ctx, p, o - 0.6); ctx.strokeStyle = '#C2BEB6'; ctx.lineWidth = 1.8; ctx.stroke(); });
    });
    ctx.restore();
  }

  // =========================================================================================
  // Train stop (1x1, rotatable). opts.mask = bit of the side the station rail is on (from
  // 38-trains.js), so the boom always reaches over the track; drawn world-aligned.
  // =========================================================================================
  function lattice(ctx, x0, y0, x1, y1, n) {
    ctx.strokeStyle = '#1A1612'; ctx.lineWidth = 3.4;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0, y1); ctx.moveTo(x1, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.strokeStyle = '#8E8680'; ctx.lineWidth = 1.8; ctx.stroke();
    ctx.strokeStyle = '#6A5448'; ctx.lineWidth = 1.1; ctx.beginPath();
    for (var i = 0; i < n; i++) {
      var a = y0 + (y1 - y0) * i / n, b = y0 + (y1 - y0) * (i + 1) / n;
      ctx.moveTo(x0, a); ctx.lineTo(x1, b); ctx.moveTo(x0, b); ctx.lineTo(x1, b);
    }
    ctx.stroke();
  }
  function paintTrainStop(ctx, W, H, frame, dir, def, type, opts) {
    var k = W / 64, mask = (opts && opts.mask) || 1, side = mask & 1 ? 0 : mask & 2 ? 1 : mask & 4 ? 2 : 3;
    ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(-dir * Math.PI / 2); ctx.scale(k, k); ctx.translate(-32, -32);
    // ground: service cabinets and plates round the foot (opposite the track)
    var away = F.util.dirVec((side + 2) & 3);
    var bx = 32 + away[0] * 14, by = 40 + away[1] * 12;
    ctx.fillStyle = '#1A1612'; ctx.fillRect(bx - 11, by - 7, 22, 16);
    var cg = ctx.createLinearGradient(bx - 10, 0, bx + 10, 0); cg.addColorStop(0, '#B8B0A8'); cg.addColorStop(1, '#5E5248');
    ctx.fillStyle = cg; ctx.fillRect(bx - 10, by - 6, 20, 14);
    ctx.fillStyle = '#7A4A30'; ctx.fillRect(bx - 10, by + 4, 20, 4);
    ctx.fillStyle = '#3A3028'; ctx.fillRect(22, 44, 20, 14); ctx.fillStyle = '#6E6258'; ctx.fillRect(23, 45, 18, 3);
    // lattice mast (rises "up" the screen from its foot); with the track to the north the mast
    // stands lower so the boom and its light stay on the tile
    var top = side === 0 ? 26 : 12;
    lattice(ctx, 28, top, 36, 58, 5);
    ctx.fillStyle = '#2A221C'; ctx.fillRect(26, 56, 12, 5);
    // boom from the mast top over the track, light box at its tip
    var v = F.util.dirVec(side), tipX = 32 + v[0] * 24, tipY = top + v[1] * (side === 0 ? 18 : 16);
    ctx.save(); ctx.lineCap = 'round';
    ctx.strokeStyle = '#1A1612'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(32, top); ctx.lineTo(tipX, tipY); ctx.stroke();
    ctx.strokeStyle = '#A0968E'; ctx.lineWidth = 3.4; ctx.stroke();
    ctx.strokeStyle = 'rgba(40,30,24,0.8)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(32, top - 8); ctx.lineTo(tipX, tipY - 2); ctx.stroke();
    ctx.restore();
    var col = '#D2402A';
    ctx.fillStyle = '#141210'; ctx.fillRect(tipX - 8, tipY - 7, 16, 12);
    var lg = ctx.createLinearGradient(0, tipY - 6, 0, tipY + 4); lg.addColorStop(0, '#F07A5A'); lg.addColorStop(1, col);
    ctx.fillStyle = lg; ctx.fillRect(tipX - 7, tipY - 6, 14, 10);
    ctx.fillStyle = 'rgba(255,230,200,0.85)'; ctx.fillRect(tipX - 5, tipY - 4, 10, 2.5);
    var gl = ctx.createRadialGradient(tipX, tipY, 1, tipX, tipY, 16);
    gl.addColorStop(0, 'rgba(255,120,80,0.35)'); gl.addColorStop(1, 'rgba(255,120,80,0)');
    ctx.fillStyle = gl; ctx.fillRect(tipX - 16, tipY - 16, 32, 32);
    ctx.restore();
  }

  // =========================================================================================
  // Rail signal / chain signal (1x1, rotatable: its facing points at the rail tile it guards).
  // frame = aspect from 38-trains.js: 0 green, 1 red, 2 yellow. A short steel post on a base
  // plate carrying a dark head with three hooded lamps (only the current one lit); the chain
  // signal's head has a blue band so the two read apart at a glance. Drawn upright in every
  // facing (world-aligned), nudged toward the guarded rail.
  // =========================================================================================
  var LAMP_ON = ['#4CF26A', '#FF4436', '#FFD23A'];
  var LAMP_OFF = ['#1A3A20', '#3E1814', '#3E3414'];
  function paintRailSignal(ctx, W, H, frame, dir, def, type) {
    var chain = type === 'rail-chain-signal', aspect = (frame | 0) % 3, k = W / 64, v = F.util.dirVec(dir & 3);
    ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(-dir * Math.PI / 2); ctx.scale(k, k); ctx.translate(-32 + v[0] * 8, -32 + v[1] * 4);
    // base plate and post
    ctx.fillStyle = '#1A1816'; ctx.fillRect(21, 48, 22, 12);
    var bg = ctx.createLinearGradient(22, 0, 42, 0); bg.addColorStop(0, '#8A8680'); bg.addColorStop(1, '#4A4642');
    ctx.fillStyle = bg; ctx.fillRect(22, 49, 20, 10);
    [[25, 52], [39, 52], [25, 56], [39, 56]].forEach(function (p) { ctx.fillStyle = '#2A2624'; ctx.fillRect(p[0] - 1, p[1] - 1, 2, 2); });
    ctx.fillStyle = '#1A1816'; ctx.fillRect(28.5, 34, 7, 18);
    var pg = ctx.createLinearGradient(29, 0, 35, 0); pg.addColorStop(0, '#9A968E'); pg.addColorStop(1, '#4E4A44');
    ctx.fillStyle = pg; ctx.fillRect(29.5, 34, 5, 17);
    // head
    ctx.fillStyle = '#0E0E0C'; L.roundRectPath(ctx, 20, 4, 24, 36, 6); ctx.fill();
    var hg = ctx.createLinearGradient(21, 0, 43, 0); hg.addColorStop(0, '#4A4C4C'); hg.addColorStop(0.4, '#2E3030'); hg.addColorStop(1, '#1A1C1C');
    ctx.fillStyle = hg; L.roundRectPath(ctx, 21, 5, 22, 34, 5); ctx.fill();
    if (chain) { ctx.fillStyle = '#3F86D0'; ctx.fillRect(22, 33, 20, 4); }
    var order = [1, 2, 0]; // red, yellow, green top to bottom
    for (var i = 0; i < 3; i++) {
      var kk = order[i], cy = 11 + i * 9.5, on = kk === aspect;
      ctx.fillStyle = '#060606'; ctx.beginPath(); ctx.arc(32, cy, 4.6, 0, Math.PI * 2); ctx.fill();
      var lg = ctx.createRadialGradient(31, cy - 1, 0.5, 32, cy, 3.8);
      lg.addColorStop(0, on ? '#FFFFFF' : LAMP_OFF[kk]); lg.addColorStop(0.4, on ? LAMP_ON[kk] : LAMP_OFF[kk]); lg.addColorStop(1, on ? LAMP_ON[kk] : '#0C0C0A');
      ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(32, cy, 3.8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3A3C3C'; ctx.fillRect(27, cy - 5.4, 10, 1.6); // visor
      if (on) L.glow(ctx, 32, cy, 18, LAMP_ON[kk], 0.45);
    }
    ctx.restore();
  }

  F.sprites.definePainter(['rail'], paintRail);
  F.sprites.definePainter(['train-stop'], paintTrainStop);
  F.sprites.definePainter(['rail-signal', 'rail-chain-signal'], paintRailSignal);

  // =========================================================================================
  // Vehicles: free-moving sprites (not F.sprites.entity — trains sit between tiles and rotate to
  // the rail tangent, so the feature module draws these directly). 128x192 px = 2x3 tiles at
  // 64 px/tile, facing NORTH, no shadow baked in (design/EXPANSION.md §6.5). `lx, ly` is the
  // world light direction (top-left -> bottom-right) turned into the car's own frame.
  // =========================================================================================
  // gradient across a box along the light: lit side bright, far side dark
  function litGrad(ctx, x0, y0, x1, y1, lx, ly, c0, c1, c2) {
    var cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, r = Math.max(8, Math.min(x1 - x0, y1 - y0) * 0.6);
    var g = ctx.createLinearGradient(cx - lx * r, cy - ly * r, cx + lx * r, cy + ly * r);
    g.addColorStop(0, c0); g.addColorStop(0.5, c1); g.addColorStop(1, c2);
    return g;
  }
  function rrect(ctx, x0, y0, x1, y1, r) {
    ctx.beginPath(); ctx.moveTo(x0 + r, y0); ctx.arcTo(x1, y0, x1, y1, r); ctx.arcTo(x1, y1, x0, y1, r);
    ctx.arcTo(x0, y1, x0, y0, r); ctx.arcTo(x0, y0, x1, y0, r); ctx.closePath();
  }
  function rivetRow(ctx, x0, y0, x1, y1, n, col) {
    ctx.fillStyle = col || 'rgba(220,222,222,0.55)';
    for (var i = 0; i <= n; i++) { var t = i / n; ctx.beginPath(); ctx.arc(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, 0.9, 0, Math.PI * 2); ctx.fill(); }
  }
  function grime(ctx, seed, n) {
    ctx.save(); ctx.globalCompositeOperation = 'source-atop';
    for (var i = 0; i < n; i++) {
      var h = hash(i, seed);
      ctx.fillStyle = h < 0.55 ? 'rgba(16,14,12,0.28)' : (h < 0.8 ? 'rgba(120,80,50,0.2)' : 'rgba(255,255,250,0.12)');
      ctx.fillRect(128 * hash(i, seed + 1), 192 * hash(i, seed + 2), 1 + 1.6 * hash(i, seed + 3), 1 + 2.4 * hash(i, seed + 4));
    }
    ctx.restore();
  }
  // running gear: dark underframe, wheel sets peeking out at the sides, buffers and couplers
  function runningGear(ctx, x0, x1, bogies, lx, ly) {
    ctx.fillStyle = '#161614'; ctx.fillRect(x0 + 4, 6, x1 - x0 - 8, 180);
    bogies.forEach(function (y) {
      [-10, 10].forEach(function (o) {
        [x0 - 3, x1 - 5].forEach(function (x) {
          rrect(ctx, x, y + o - 7, x + 8, y + o + 7, 2.5); ctx.fillStyle = '#0E0E0C'; ctx.fill();
          rrect(ctx, x + 1, y + o - 6, x + 7, y + o + 6, 2); ctx.fillStyle = litGrad(ctx, x + 1, y + o - 6, x + 7, y + o + 6, lx, ly, '#6A6A66', '#3A3A38', '#1A1A18'); ctx.fill();
        });
      });
    });
    [[2, 8], [184, 190]].forEach(function (e) {
      ctx.fillStyle = '#1A1A18'; ctx.fillRect(x0 + 8, e[0], x1 - x0 - 16, e[1] - e[0]);
      ctx.fillStyle = '#4A4A46'; [64 - 22, 64 + 16].forEach(function (x) { ctx.fillRect(x, e[0] - 1, 6, e[1] - e[0] + 2); });
      ctx.fillStyle = '#2A2A26'; ctx.fillRect(61, e[0] < 10 ? 0 : 184, 6, 8);
    });
  }
  function paintLocomotiveVehicle(ctx, lx, ly) {
    var X0 = 22, X1 = 106;
    runningGear(ctx, X0, X1, [48, 150], lx, ly);
    // cow-catcher plough and the nose grille with two headlamps
    ctx.beginPath(); ctx.moveTo(28, 22); ctx.lineTo(100, 22); ctx.lineTo(92, 3); ctx.lineTo(36, 3); ctx.closePath();
    ctx.fillStyle = litGrad(ctx, 28, 3, 100, 22, lx, ly, '#8E9090', '#4E5050', '#1E2020'); ctx.fill();
    ctx.strokeStyle = '#0C0C0C'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.strokeStyle = 'rgba(10,10,10,0.7)'; ctx.lineWidth = 1.4;
    for (var s = 0; s < 9; s++) { var sx = 40 + s * 6; ctx.beginPath(); ctx.moveTo(sx, 5); ctx.lineTo(sx + (sx - 64) * 0.12, 21); ctx.stroke(); }
    ctx.fillStyle = 'rgba(230,232,230,0.4)'; ctx.fillRect(36, 3, 56, 1.4);
    rrect(ctx, 30, 18, 98, 34, 4); ctx.fillStyle = '#121212'; ctx.fill();
    rrect(ctx, 31, 19, 97, 33, 3.5); ctx.fillStyle = litGrad(ctx, 31, 19, 97, 33, lx, ly, '#7E8080', '#4A4C4C', '#222424'); ctx.fill();
    ctx.fillStyle = '#0E0E0E'; for (s = 0; s < 8; s++) ctx.fillRect(48 + s * 4.2, 21, 2.2, 10);
    [38, 90].forEach(function (x) {
      var g = ctx.createRadialGradient(x, 26, 0.5, x, 26, 5); g.addColorStop(0, '#FFFFF0'); g.addColorStop(0.5, '#FFE9A0'); g.addColorStop(1, '#8A7A4A');
      ctx.fillStyle = '#0A0A0A'; ctx.beginPath(); ctx.arc(x, 26, 5.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, 26, 4.4, 0, Math.PI * 2); ctx.fill();
      L.glow(ctx, x, 22, 12, '#FFE9A0', 0.35);
    });
    // exposed machinery along the front hood: pipes and cylinders on both flanks
    [[26, 36], [92, 102]].forEach(function (f, i) {
      ctx.fillStyle = '#121210'; ctx.fillRect(f[0], 34, f[1] - f[0], 64);
      for (var c = 0; c < 3; c++) {
        var cy = 40 + c * 20;
        rrect(ctx, f[0] + 1, cy, f[1] - 1, cy + 14, 4); ctx.fillStyle = litGrad(ctx, f[0], cy, f[1], cy + 14, lx, ly, '#A0A2A0', '#5A5C5A', '#262826'); ctx.fill();
        ctx.fillStyle = 'rgba(10,10,10,0.6)'; ctx.fillRect(f[0] + 1, cy + 6, f[1] - f[0] - 2, 1.4);
      }
      ctx.strokeStyle = i ? '#7A5A3A' : '#8A6A48'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo((f[0] + f[1]) / 2, 36); ctx.lineTo((f[0] + f[1]) / 2, 96); ctx.stroke();
    });
    // front hood (narrow) and main hood (wide)
    rrect(ctx, 35, 30, 93, 100, 12); ctx.fillStyle = '#0C0C0C'; ctx.fill();
    rrect(ctx, 36, 31, 92, 99, 11); ctx.fillStyle = litGrad(ctx, 36, 31, 92, 99, lx, ly, '#8E9090', '#545656', '#1E2020'); ctx.fill();
    rrect(ctx, 29, 94, 99, 180, 14); ctx.fillStyle = '#0C0C0C'; ctx.fill();
    rrect(ctx, 30, 95, 98, 179, 13); ctx.fillStyle = litGrad(ctx, 30, 95, 98, 179, lx, ly, '#909292', '#565858', '#1C1E1E'); ctx.fill();
    // red roof panel (the train's default colour, as tinted by the vanilla mask)
    ctx.save(); rrect(ctx, 46, 98, 82, 150, 4); ctx.clip();
    ctx.fillStyle = 'rgba(150,32,20,0.55)'; ctx.fillRect(46, 98, 36, 52);
    ctx.fillStyle = litGrad(ctx, 46, 98, 82, 150, lx, ly, 'rgba(255,200,180,0.25)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.3)'); ctx.fillRect(46, 98, 36, 52);
    ctx.restore();
    ctx.strokeStyle = 'rgba(10,10,10,0.7)'; ctx.lineWidth = 1; rrect(ctx, 46, 98, 82, 150, 4); ctx.stroke();
    // side vent slats on the front hood
    ctx.fillStyle = '#141414';
    for (s = 0; s < 8; s++) { ctx.fillRect(40, 54 + s * 4, 16, 2); ctx.fillRect(72, 54 + s * 4, 16, 2); }
    // round roof cap and a small plate
    ctx.fillStyle = '#0E0E0E'; ctx.beginPath(); ctx.arc(64, 118, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = litGrad(ctx, 55, 109, 73, 127, lx, ly, '#C8CACA', '#8A8C8C', '#4A4C4C'); ctx.beginPath(); ctx.arc(64, 118, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2A2C2C'; ctx.beginPath(); ctx.arc(64, 118, 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1A1A1A'; ctx.fillRect(66, 130, 12, 9); ctx.fillStyle = '#7A7C7C'; ctx.fillRect(67, 131, 10, 7);
    // cab at the back: raised riveted hatch, side window slots
    rrect(ctx, 38, 150, 90, 176, 4); ctx.fillStyle = '#0E0E0E'; ctx.fill();
    rrect(ctx, 39, 151, 89, 175, 3.5); ctx.fillStyle = litGrad(ctx, 39, 151, 89, 175, lx, ly, '#848686', '#4E5050', '#1E2020'); ctx.fill();
    rrect(ctx, 48, 154, 80, 172, 3); ctx.fillStyle = '#1A1C1C'; ctx.fill();
    rrect(ctx, 49, 155, 79, 171, 2.5); ctx.fillStyle = litGrad(ctx, 49, 155, 79, 171, lx, ly, '#8A8C8C', '#545656', '#2A2C2C'); ctx.fill();
    rivetRow(ctx, 51, 157, 77, 157, 7); rivetRow(ctx, 51, 169, 77, 169, 7);
    ctx.fillStyle = '#080A0C'; ctx.fillRect(31, 152, 4, 20); ctx.fillRect(93, 152, 4, 20);
    ctx.fillStyle = 'rgba(120,160,190,0.35)'; ctx.fillRect(31.5, 153, 1.4, 18); ctx.fillRect(93.5, 153, 1.4, 18);
    // rivet rows along the hood edges
    rivetRow(ctx, 39, 34, 39, 96, 12); rivetRow(ctx, 89, 34, 89, 96, 12);
    rivetRow(ctx, 33, 98, 33, 176, 14); rivetRow(ctx, 95, 98, 95, 176, 14);
    grime(ctx, 71, 900);
  }
  function paintWagonVehicle(ctx, lx, ly) {
    var X0 = 20, X1 = 108;
    runningGear(ctx, X0, X1, [40, 152], lx, ly);
    rrect(ctx, X0, 6, X1, 186, 5); ctx.fillStyle = '#121414'; ctx.fill();
    rrect(ctx, X0 + 1, 7, X1 - 1, 185, 4.5); ctx.fillStyle = litGrad(ctx, X0, 7, X1, 185, lx, ly, '#6A6C6E', '#3E4042', '#1C1E20'); ctx.fill();
    [[11, 64], [68, 124], [128, 181]].forEach(function (sg) {
      var y0 = sg[0], y1 = sg[1];
      rrect(ctx, 25, y0, 103, y1, 3); ctx.fillStyle = '#0E1010'; ctx.fill();
      rrect(ctx, 26, y0 + 1, 102, y1 - 1, 2.5); ctx.fillStyle = litGrad(ctx, 26, y0, 102, y1, lx, ly, '#C4C6C6', '#868888', '#3E4040'); ctx.fill();
      // corrugation along the lid
      ctx.save(); rrect(ctx, 26, y0 + 1, 102, y1 - 1, 2.5); ctx.clip();
      for (var x = 30; x < 100; x += 5.5) { ctx.fillStyle = 'rgba(10,12,12,0.4)'; ctx.fillRect(x, y0, 1.3, y1 - y0); ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(x + 1.3, y0, 1, y1 - y0); }
      ctx.restore();
      // two raised handle bars across each lid
      [y0 + (y1 - y0) * 0.3, y0 + (y1 - y0) * 0.7].forEach(function (y) {
        ctx.fillStyle = '#0E0E0E'; ctx.fillRect(38, y - 2.6, 52, 5.6);
        ctx.fillStyle = litGrad(ctx, 38, y - 2, 90, y + 2, lx, ly, '#D4D6D6', '#8C8E8E', '#3E4040'); ctx.fillRect(39, y - 2, 50, 4.2);
      });
      rivetRow(ctx, 28, y0 + 3, 100, y0 + 3, 14); rivetRow(ctx, 28, y1 - 3, 100, y1 - 3, 14);
    });
    // side rails of the frame with rivets, ends a little darker
    rivetRow(ctx, X0 + 2.5, 10, X0 + 2.5, 182, 30); rivetRow(ctx, X1 - 2.5, 10, X1 - 2.5, 182, 30);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(X0 + 1, 7, X1 - X0 - 2, 3); ctx.fillRect(X0 + 1, 182, X1 - X0 - 2, 3);
    grime(ctx, 73, 900);
  }

  var vehicleCache = new Map();
  var DIRS = 16;
  // F.sprites.vehicle(type, frame, rot) -> canvas, design/EXPANSION.md §6.5. 'locomotive' |
  // 'cargo-wagon', 128x192 (2x3 tiles @ 64 px/tile), facing NORTH, no shadow baked in. `rot` is
  // the rotation the caller will draw it with (radians, 0 = north); the shading is lit for it.
  F.sprites.vehicle = function (type, frame, rot) {
    if (!F.sprites.enabled) return { width: 128, height: 192 };
    var r = rot || 0, b = ((Math.round(r / (Math.PI * 2) * DIRS) % DIRS) + DIRS) % DIRS;
    var key = type + '|' + b, c = vehicleCache.get(key);
    if (c) return c;
    c = L.newCanvas(128, 192);
    var ctx = L.ctxOf(c), a = b / DIRS * Math.PI * 2, wx = 0.6, wy = 0.8;
    var lx = wx * Math.cos(a) + wy * Math.sin(a), ly = -wx * Math.sin(a) + wy * Math.cos(a);
    if (type === 'cargo-wagon') paintWagonVehicle(ctx, lx, ly);
    else paintLocomotiveVehicle(ctx, lx, ly); // default/'locomotive'
    vehicleCache.set(key, c);
    return c;
  };

  // =========================================================================================
  // Item icons — locomotive and wagon miniatures, readable at 32px, plus the rail signal.
  // =========================================================================================
  if (F.sprites.defineIcon) {
    F.sprites.defineIcon('locomotive', function (ctx, S) {
      var x = S * 0.26, y = S * 0.1, w = S * 0.48, h = S * 0.8;
      L.panel(ctx, x, y, w, h, '#5E6060', { r: w * 0.16, hi: 30, lo: 30 });
      ctx.fillStyle = '#A8321E'; ctx.fillRect(x + w * 0.28, y + h * 0.42, w * 0.44, h * 0.3);
      ctx.fillStyle = '#1A1A1A'; ctx.fillRect(x + w * 0.1, y + h * 0.04, w * 0.8, h * 0.1);
      ctx.fillStyle = '#FFE9A0'; ctx.beginPath(); ctx.arc(x + w * 0.2, y + h * 0.09, S * 0.03, 0, Math.PI * 2); ctx.arc(x + w * 0.8, y + h * 0.09, S * 0.03, 0, Math.PI * 2); ctx.fill();
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
    F.sprites.defineIcon('wagon', function (ctx, S) {
      var x = S * 0.24, y = S * 0.08, w = S * 0.52, h = S * 0.84;
      L.panel(ctx, x, y, w, h, '#3E4042', { r: w * 0.1, hi: 18, lo: 26 });
      for (var i = 0; i < 3; i++) {
        L.panel(ctx, x + w * 0.1, y + h * (0.04 + i * 0.32), w * 0.8, h * 0.28, '#9A9C9C', { r: w * 0.05, hi: 22, lo: 26 });
        ctx.fillStyle = '#2A2C2C'; ctx.fillRect(x + w * 0.22, y + h * (0.16 + i * 0.32), w * 0.56, h * 0.03);
      }
    });
  }
})();
