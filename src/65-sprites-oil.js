// 65-sprites-oil.js — procedural art for the oil-processing chain: the pumpjack (drawn after the
// real Factorio sprite; the oil refinery,
// chemical plant and storage tank live in 65-sprites-refinery.js), the crude-oil well resource
// tile, and item icons for the new
// intermediates (plastic, sulfur powder, solid-fuel block, rocket-fuel cell). Registers via
// F.sprites.definePainter (design/BUILDING-ART.md contract) same as 62/63/64-sprites-*.js; never
// edits src/60-sprites.js. Also exposes F.sprites.fluidTint(ctx,W,H,fluid) (design/EXPANSION.md
// §8) as a small reusable "tinted window" helper other modules (the renderer) can call to show a
// pipe/tank's carried fluid colour without this pack touching the logistics pipe painter.
// Pure drawing module, ES5 style, deterministic (F.rng.local only, no Math.random).
(function () {
  'use strict';
  if (!F.sprites || !F.sprites.definePainter) return;

  var L = F.sprites.lib;

  // ---------------------------------------------------------------------
  // Local helpers
  // ---------------------------------------------------------------------
  // Fluid colour lookup shared by storage-tank's level window and F.sprites.fluidTint. Fluids
  // data (05-data-expansion.js) may not be loaded/populated yet, or the id may be unknown — both
  // fall back to a neutral grey per the task brief.
  function fluidColor(fluid) {
    try {
      if (fluid && F.data && F.data.fluids && F.data.fluids[fluid] && F.data.fluids[fluid].color) return F.data.fluids[fluid].color;
    } catch (e) { /* fluids table not ready */ }
    return '#8A9199';
  }

  // ---------------------------------------------------------------------
  // Pumpjack (3x3, output at the north edge centre when facing north) drawn after the real
  // Factorio sprite (base/graphics/entity/pumpjack: hr-pumpjack-base 261x273 per direction,
  // shift (-2.25,-4.75); hr-pumpjack-horsehead 206x202, 40 frames, shift (-4,-24); references:
  // the vanilla frames collected in snouz/factorio_free_graphics_for_modders and the full-size
  // frames in raiguard/Krastorio2Assets used to align them).
  //
  // What the reference looks like: on the ground, a loop of rust-banded grey pipes with a red
  // motor housing (fan on top) feeding the output; standing over it, seen from the side, a lime
  // green walking beam on a lattice A-frame with the curved horsehead at its west end, the
  // polished rod hanging into a green wellhead of valves and hand wheels, and at the east end a
  // green gearbox whose crank swings two red counterweights while the beam rocks.
  //
  // The ground pipes turn with the facing; the machine is always the same side view (as in the
  // game). Numbers are hr px (64 per tile) with the origin at the footprint centre. The
  // horsehead stands ~0.4 tile higher than the footprint in the original; it is drawn a little
  // lower so it stays on the canvas.
  // ---------------------------------------------------------------------
  var PJ_STEEL = { d: '#161614', m: '#565652', l: '#86867E', h: '#C4C4BC' };
  var PJ_GREEN = { d: '#14240A', m: '#46721C', l: '#6E9E30', h: '#B4D478' };
  function pjPath(ctx, pts, rr) {
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length - 1; i++) ctx.arcTo(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], rr || 0);
    ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
  }
  function pjPipe(ctx, pts, r, P, bands) {
    ctx.save(); ctx.lineJoin = 'round';
    pjPath(ctx, pts, r * 2); ctx.strokeStyle = P.d; ctx.lineWidth = r * 2; ctx.stroke();
    pjPath(ctx, pts, r * 2); ctx.strokeStyle = P.m; ctx.lineWidth = r * 1.6; ctx.stroke();
    ctx.translate(-r * 0.25, -r * 0.25); pjPath(ctx, pts, r * 2); ctx.strokeStyle = P.l; ctx.lineWidth = r * 0.7; ctx.stroke();
    ctx.translate(-r * 0.15, -r * 0.15); pjPath(ctx, pts, r * 2); ctx.strokeStyle = P.h; ctx.globalAlpha = 0.6; ctx.lineWidth = r * 0.2; ctx.stroke();
    ctx.restore();
    // rusty flange bands along the run
    if (bands) for (var i = 0; i + 1 < pts.length; i++) {
      var a = pts[i], b = pts[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.sqrt(dx * dx + dy * dy);
      if (l < 30) continue;
      var mx = a[0] + dx * 0.5, my = a[1] + dy * 0.5;
      ctx.save(); ctx.translate(mx, my); ctx.rotate(Math.atan2(dy, dx));
      ctx.fillStyle = '#1A0E08'; ctx.fillRect(-3, -r * 1.25, 6, r * 2.5);
      ctx.fillStyle = '#8A4A2A'; ctx.fillRect(-2.2, -r * 1.15, 4.4, r * 2.3);
      ctx.restore();
    }
  }
  function pjBox(ctx, x0, y0, x1, y1, P) {
    ctx.fillStyle = P.d; ctx.fillRect(x0 - 1, y0 - 1, x1 - x0 + 2, y1 - y0 + 2);
    var g = ctx.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, P.h); g.addColorStop(0.3, P.l); g.addColorStop(0.7, P.m); g.addColorStop(1, P.d);
    ctx.fillStyle = g; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  }
  function pjSpots(ctx, seed, x0, y0, x1, y1, n) {
    for (var i = 0; i < n; i++) {
      var hx = Math.sin((seed + i) * 12.9898) * 43758.5453, hy = Math.sin((seed + i) * 78.233) * 43758.5453;
      hx -= Math.floor(hx); hy -= Math.floor(hy);
      ctx.fillStyle = i % 3 ? 'rgba(90,40,14,0.45)' : 'rgba(20,16,8,0.4)';
      ctx.fillRect(x0 + (x1 - x0) * hx, y0 + (y1 - y0) * hy, 1.5 + (i % 3), 1.5 + (i % 2));
    }
  }
  // ground pipe loop of the north-facing base (origin = footprint centre), turned with the facing
  function pumpjackBase(ctx, dir) {
    ctx.save(); ctx.rotate(dir * Math.PI / 2);
    // sandy stains where the well works the ground
    ctx.fillStyle = 'rgba(150,120,80,0.25)';
    [[-40, 20, 30, 14], [10, 34, 34, 16], [-10, 60, 26, 10], [40, 10, 20, 12]].forEach(function (b) { ctx.beginPath(); ctx.ellipse(b[0], b[1], b[2], b[3], 0.3, 0, Math.PI * 2); ctx.fill(); });
    pjPipe(ctx, [[-66, -6], [-50, -6], [-50, -56], [40, -56]], 4.5, PJ_STEEL, true);
    pjPipe(ctx, [[-78, 44], [-60, 44], [-40, 30], [-40, -28], [40, -28], [44, -34]], 4.5, PJ_STEEL, true);
    pjPipe(ctx, [[-66, 84], [-44, 84], [-26, 62], [80, 62], [80, -50], [66, -62]], 5, PJ_STEEL, true);
    // output: from the top run up to the north edge, flanged at the connection
    pjPipe(ctx, [[0, -56], [0, -94]], 4.5, PJ_STEEL, false);
    ctx.fillStyle = '#1A0E08'; ctx.fillRect(-9, -95, 18, 7); ctx.fillStyle = '#8A4A2A'; ctx.fillRect(-8, -94, 16, 5);
    ctx.restore();
  }
  // the red motor housing with its fan, placed at the base's (turned) motor spot, drawn upright
  function pumpjackMotor(ctx, dir) {
    var v = F.util.rotVec([66, -72], dir), x = v[0], y = v[1];
    x = Math.max(-66, Math.min(66, x)); y = Math.max(-62, Math.min(74, y));
    pjPipe(ctx, [[x - 12, y + 6], [x - 12, y + 22]], 4.5, PJ_GREEN, false);
    pjPipe(ctx, [[x + 10, y + 6], [x + 10, y + 22]], 4.5, PJ_GREEN, false);
    ctx.fillStyle = '#140606'; ctx.fillRect(x - 30, y - 16, 60, 26);
    var g = ctx.createLinearGradient(0, y - 16, 0, y + 10); g.addColorStop(0, '#F05848'); g.addColorStop(0.5, '#C42418'); g.addColorStop(1, '#6A0E08');
    ctx.fillStyle = g; ctx.fillRect(x - 29, y - 15, 58, 24);
    ctx.fillStyle = 'rgba(40,6,4,0.5)'; for (var i = 0; i < 5; i++) ctx.fillRect(x - 24 + i * 11, y - 12, 2, 18);
    ctx.fillStyle = '#1A1614'; ctx.beginPath(); ctx.ellipse(x, y - 18, 24, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#6A6660'; ctx.beginPath(); ctx.ellipse(x, y - 19, 21, 6.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#2A2622'; ctx.lineWidth = 0.8;
    for (i = 0; i < 12; i++) { var a = i / 12 * Math.PI * 2; ctx.beginPath(); ctx.moveTo(x, y - 19); ctx.lineTo(x + Math.cos(a) * 20, y - 19 + Math.sin(a) * 6); ctx.stroke(); }
  }
  // the machine, side view: origin = footprint centre; `rock` = beam tilt (rad), `ang` = crank
  function pumpjackMachine(ctx, rock, ang) {
    // horsehead-reference coordinates (entity centre at (112,144)), drawn 28 px lower
    ctx.save(); ctx.translate(-112, -144 + 28);
    // wellhead: green casing, grey header, valves and hand wheels
    pjPipe(ctx, [[20, 126], [74, 126]], 6, PJ_STEEL, false);
    pjPipe(ctx, [[46, 150], [70, 150]], 5, PJ_STEEL, false);
    pjPipe(ctx, [[14, 118], [14, 168]], 6.5, PJ_GREEN, false);
    pjPipe(ctx, [[40, 104], [40, 140]], 4.5, PJ_GREEN, false);
    pjPipe(ctx, [[60, 112], [60, 164]], 5, PJ_GREEN, false);
    [[14, 116], [40, 102], [60, 110]].forEach(function (p) { ctx.fillStyle = '#1E3A0C'; ctx.fillRect(p[0] - 7, p[1] - 3, 14, 6); ctx.fillStyle = '#8ACC3E'; ctx.fillRect(p[0] - 6, p[1] - 2.5, 12, 2.5); });
    [[44, 138], [62, 152]].forEach(function (p) {
      ctx.strokeStyle = '#1A1A18'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(p[0], p[1], 7, 6, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#E4E2DA'; ctx.lineWidth = 1.6; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p[0] - 6, p[1]); ctx.lineTo(p[0] + 6, p[1]); ctx.moveTo(p[0], p[1] - 5); ctx.lineTo(p[0], p[1] + 5); ctx.stroke();
    });
    ctx.fillStyle = '#8A4A2A'; ctx.fillRect(4, 158, 22, 6); ctx.fillRect(34, 128, 10, 4);
    // lattice A-frame (samson post) under the pivot
    var legs = [[100, 170, 118, 44], [152, 170, 126, 44], [110, 170, 120, 50], [142, 170, 124, 50]];
    legs.forEach(function (l, i) {
      ctx.strokeStyle = PJ_GREEN.d; ctx.lineWidth = i < 2 ? 12 : 8; ctx.beginPath(); ctx.moveTo(l[0], l[1]); ctx.lineTo(l[2], l[3]); ctx.stroke();
      ctx.strokeStyle = i < 2 ? PJ_GREEN.m : '#2E5212'; ctx.lineWidth = i < 2 ? 9 : 6; ctx.stroke();
      if (i < 2) { ctx.strokeStyle = 'rgba(210,240,140,0.5)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(l[0] - 2, l[1]); ctx.lineTo(l[2] - 2, l[3]); ctx.stroke(); }
    });
    ctx.strokeStyle = '#2E5414'; ctx.lineWidth = 2.4; ctx.beginPath();
    [[104, 150, 146, 120], [148, 150, 108, 120], [108, 120, 142, 94], [140, 120, 112, 94], [112, 94, 136, 70], [134, 94, 116, 70]].forEach(function (b) { ctx.moveTo(b[0], b[1]); ctx.lineTo(b[2], b[3]); });
    ctx.stroke();
    // gearbox and the crank with its two red counterweights
    pjBox(ctx, 136, 100, 176, 146, PJ_GREEN); pjSpots(ctx, 7, 136, 100, 176, 146, 14);
    ctx.fillStyle = '#1A1A18'; ctx.beginPath(); ctx.arc(152, 126, 11, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#6A6A64'; ctx.lineWidth = 1.2; for (var s = 0; s < 6; s++) { var sa = s / 6 * Math.PI * 2 + ang; ctx.beginPath(); ctx.moveTo(152, 126); ctx.lineTo(152 + Math.cos(sa) * 10, 126 + Math.sin(sa) * 10); ctx.stroke(); }
    var cx = 184, cy = 124;
    [0, Math.PI].forEach(function (o) {
      var a = ang + o, px = cx + Math.cos(a) * 16, py = cy + Math.sin(a) * 16;
      ctx.save(); ctx.translate(px, py); ctx.rotate(a);
      ctx.fillStyle = '#240806'; ctx.beginPath(); ctx.ellipse(0, 0, 9, 17, 0, 0, Math.PI * 2); ctx.fill();
      var cg = ctx.createLinearGradient(-8, -16, 8, 16); cg.addColorStop(0, '#E0604A'); cg.addColorStop(0.5, '#A8281A'); cg.addColorStop(1, '#4A0C06');
      ctx.fillStyle = cg; ctx.beginPath(); ctx.ellipse(0, 0, 7.5, 15.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    });
    ctx.fillStyle = '#2A2A26'; ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.fill();
    // walking beam rocking on its bearing, horsehead at the west end
    var pvx = 116, pvy = 40, cr = Math.cos(rock), sr = Math.sin(rock);
    function R(x, y) { var dx = x - pvx, dy = y - pvy; return [pvx + dx * cr - dy * sr, pvy + dx * sr + dy * cr]; }
    // pitman arm: beam tail -> crank pin
    var tail = R(186, 56), pin = [cx + Math.cos(ang) * 16, cy + Math.sin(ang) * 16];
    ctx.strokeStyle = '#141412'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(tail[0], tail[1]); ctx.lineTo(pin[0], pin[1]); ctx.stroke();
    ctx.strokeStyle = '#9A9A92'; ctx.lineWidth = 2.6; ctx.stroke();
    // polished rod from the horsehead into the wellhead
    var nose = R(20, 30), noseLow = R(22, 86);
    ctx.strokeStyle = '#2A2C2E'; ctx.lineWidth = 2.8; ctx.beginPath(); ctx.moveTo(nose[0] - 5, nose[1]); ctx.lineTo(14, 116); ctx.stroke();
    ctx.strokeStyle = '#C8D0D8'; ctx.lineWidth = 1.2; ctx.stroke();
    void noseLow;
    ctx.save(); ctx.translate(pvx, pvy); ctx.rotate(rock); ctx.translate(-pvx, -pvy);
    // beam
    ctx.beginPath(); ctx.moveTo(44, 30); ctx.lineTo(196, 42); ctx.lineTo(196, 60); ctx.lineTo(44, 52); ctx.closePath();
    ctx.fillStyle = PJ_GREEN.d; ctx.fill();
    var bg = ctx.createLinearGradient(0, 30, 0, 60); bg.addColorStop(0, PJ_GREEN.h); bg.addColorStop(0.3, PJ_GREEN.l); bg.addColorStop(0.7, PJ_GREEN.m); bg.addColorStop(1, PJ_GREEN.d);
    ctx.beginPath(); ctx.moveTo(45, 31); ctx.lineTo(195, 43); ctx.lineTo(195, 58.5); ctx.lineTo(45, 50.5); ctx.closePath(); ctx.fillStyle = bg; ctx.fill();
    ctx.fillStyle = 'rgba(210,190,40,0.4)'; ctx.beginPath(); ctx.moveTo(60, 33); ctx.lineTo(150, 40); ctx.lineTo(150, 42.5); ctx.lineTo(60, 35.5); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(20,40,8,0.6)'; ctx.lineWidth = 1; [90, 130, 170].forEach(function (x) { ctx.beginPath(); ctx.moveTo(x, 32 + (x - 44) * 0.079); ctx.lineTo(x, 52 + (x - 44) * 0.05); ctx.stroke(); });
    pjSpots(ctx, 3, 50, 34, 190, 56, 30);
    // horsehead: curved plate hanging from the west end
    ctx.beginPath(); ctx.moveTo(18, 24); ctx.lineTo(46, 20); ctx.quadraticCurveTo(52, 50, 42, 90); ctx.lineTo(28, 92); ctx.quadraticCurveTo(14, 60, 18, 24); ctx.closePath();
    ctx.fillStyle = PJ_GREEN.d; ctx.fill();
    var hg = ctx.createLinearGradient(16, 20, 50, 90); hg.addColorStop(0, PJ_GREEN.h); hg.addColorStop(0.35, PJ_GREEN.l); hg.addColorStop(1, PJ_GREEN.m);
    ctx.beginPath(); ctx.moveTo(19.5, 25.5); ctx.lineTo(45, 22); ctx.quadraticCurveTo(50.5, 50, 41, 88.5); ctx.lineTo(29, 90.5); ctx.quadraticCurveTo(15.5, 60, 19.5, 25.5); ctx.closePath(); ctx.fillStyle = hg; ctx.fill();
    ctx.fillStyle = '#D8E8C0'; ctx.fillRect(18, 22, 28, 4);
    [[30, 40], [31, 66]].forEach(function (p) { ctx.fillStyle = '#1A1A10'; ctx.beginPath(); ctx.arc(p[0], p[1], 4, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = 'rgba(120,60,20,0.6)'; ctx.beginPath(); ctx.arc(p[0], p[1], 6.5, 0, Math.PI * 2); ctx.fill(); });
    pjSpots(ctx, 11, 20, 26, 46, 88, 16);
    ctx.restore();
    // bearing on top of the A-frame
    ctx.fillStyle = '#141412'; ctx.beginPath(); ctx.arc(pvx, pvy + 2, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#5A8A22'; ctx.beginPath(); ctx.arc(pvx, pvy + 2, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#C8CCC8'; ctx.beginPath(); ctx.arc(pvx + 1, pvy + 20, 4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  function paintPumpjack(ctx, W, H, frame, dir, def, type, opts) {
    var k = W / 192, ph = (frame & 15) / 16 * Math.PI * 2;
    ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(-dir * Math.PI / 2); ctx.scale(k, k);
    pumpjackBase(ctx, dir);
    pumpjackMotor(ctx, dir);
    pumpjackMachine(ctx, 0.07 * Math.sin(ph), ph);
    ctx.restore();
    // grime over everything (the sprites are rusty and oil-stained)
    ctx.save(); ctx.globalCompositeOperation = 'source-atop';
    for (var i = 0; i < 1400; i++) {
      var hx = Math.sin(i * 12.9898) * 43758.5453, hy = Math.sin(i * 78.233) * 43758.5453, hc = Math.sin(i * 39.34) * 43758.5453;
      hx -= Math.floor(hx); hy -= Math.floor(hy); hc -= Math.floor(hc);
      ctx.fillStyle = hc < 0.55 ? 'rgba(14,12,6,0.3)' : (hc < 0.8 ? 'rgba(110,56,20,0.26)' : 'rgba(240,240,220,0.1)');
      ctx.fillRect(W * hx, H * hy, k * (1 + 2 * hc), k * (1 + 2.5 * (1 - hc)));
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------------
  // F.sprites.fluidTint — small tinted "level window" helper (design/EXPANSION.md §8) other
  // modules (e.g. the renderer, for pipes) can call to show a fluid's colour without this pack
  // touching 64-sprites-logistics.js's pipe painter.
  // ---------------------------------------------------------------------
  F.sprites.fluidTint = function (ctx, W, H, fluid) {
    var color = fluidColor(fluid);
    var w = W * 0.2, h = H * 0.2, x = (W - w) / 2, y = (H - h) / 2;
    ctx.save();
    L.roundRectPath(ctx, x, y, w, h, Math.min(w, h) * 0.25);
    ctx.fillStyle = L.rgba(color, 0.6); ctx.fill();
    ctx.strokeStyle = 'rgba(12,12,12,0.5)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
  };

  // ---------------------------------------------------------------------
  // Crude-oil well resource art (F.world.RES.CRUDE_OIL = 5). defineOre is added concurrently by
  // another agent, so this call is guarded — harmless no-op if it isn't present yet.
  // ---------------------------------------------------------------------
  if (F.sprites.defineOre) {
    F.sprites.defineOre(5, function (ctx, S, stage, variant) {
      var rng = F.rng.local(5, (stage | 0) + 11, (variant | 0) + 101);
      var cx = S / 2, cy = S / 2;
      var st = F.util.clamp(stage | 0, 0, 4);
      // S is the shared 1.5-tile ore canvas, but wells are single-tile resources and must NOT
      // overhang past the middle 1-tile square (half-extent S/3) — keep well under that with
      // headroom for the *1.12 jitter below.
      var poolR = S * (0.22 + 0.02 * (4 - st) / 4);

      var sides = 9, i, pts = [];
      for (i = 0; i < sides; i++) {
        var a = i / sides * Math.PI * 2, rr = poolR * (0.82 + rng() * 0.3);
        pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.86]);
      }
      function tracePuddle() {
        ctx.beginPath();
        for (var k = 0; k < pts.length; k++) { if (k === 0) ctx.moveTo(pts[k][0], pts[k][1]); else ctx.lineTo(pts[k][0], pts[k][1]); }
        ctx.closePath();
      }

      // dark glossy puddle
      var pg = ctx.createRadialGradient(cx - poolR * 0.3, cy - poolR * 0.35, poolR * 0.05, cx, cy, poolR);
      pg.addColorStop(0, '#2A2420'); pg.addColorStop(0.55, '#171310'); pg.addColorStop(1, '#0A0806');
      tracePuddle(); ctx.fillStyle = pg; ctx.fill();
      tracePuddle(); ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = Math.max(1, S * 0.012); ctx.stroke();

      // rainbow sheen streaks across the surface (additive so they glint over the dark oil).
      ctx.save(); tracePuddle(); ctx.clip();
      ctx.globalCompositeOperation = 'lighter';
      var hues = ['#7A4FB0', '#3F7FD0', '#3FB08A', '#D0B23F'];
      for (i = 0; i < hues.length; i++) {
        var sa = rng() * Math.PI * 2, sx = cx + Math.cos(sa) * poolR * 0.5, sy = cy + Math.sin(sa) * poolR * 0.35;
        var sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, poolR * 0.55);
        sg.addColorStop(0, L.rgba(hues[i], 0.2)); sg.addColorStop(1, L.rgba(hues[i], 0));
        ctx.fillStyle = sg;
        ctx.beginPath(); ctx.ellipse(sx, sy, poolR * 0.55, poolR * 0.22, rng() * Math.PI, 0, Math.PI * 2); ctx.fill();
      }
      // a couple of bright glint streaks
      ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = Math.max(1, S * 0.012);
      ctx.beginPath(); ctx.moveTo(cx - poolR * 0.5, cy - poolR * 0.1); ctx.quadraticCurveTo(cx, cy - poolR * 0.4, cx + poolR * 0.5, cy + poolR * 0.05); ctx.stroke();
      ctx.restore();

      // rusty well-head ring, centred.
      var ringR = S * 0.16;
      ctx.fillStyle = '#5A3420'; ctx.beginPath(); ctx.arc(cx, cy, ringR, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.65)'; ctx.lineWidth = Math.max(1, S * 0.014); ctx.stroke();
      ctx.fillStyle = '#241E1A'; ctx.beginPath(); ctx.arc(cx, cy, ringR * 0.55, 0, Math.PI * 2); ctx.fill();
      var bcount = 6;
      for (i = 0; i < bcount; i++) {
        var ba = i / bcount * Math.PI * 2;
        ctx.fillStyle = '#8C6A4A';
        ctx.beginPath(); ctx.arc(cx + Math.cos(ba) * ringR * 0.8, cy + Math.sin(ba) * ringR * 0.8, ringR * 0.1, 0, Math.PI * 2); ctx.fill();
      }
    });
  }

  // ---------------------------------------------------------------------
  // Item icons. defineIcon is added concurrently by another agent, so guarded like defineOre.
  // ---------------------------------------------------------------------
  if (F.sprites.defineIcon) {
    // plastic — glossy white/cream bar.
    F.sprites.defineIcon('plastic', function (ctx, S, def) {
      var c1 = def.icon.color, c2 = def.icon.color2 || L.darken(c1, 20);
      var w = S * 0.7, h = S * 0.32, x = (S - w) / 2, y = (S - h) / 2;
      L.panel(ctx, x, y, w, h, c1, { r: h * 0.35, hi: 40, lo: 18 });
      ctx.save(); L.roundRectPath(ctx, x, y, w, h, h * 0.35); ctx.clip();
      var g = ctx.createLinearGradient(x, y, x + w * 0.5, y + h);
      g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(0.4, 'rgba(255,255,255,0.08)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
      ctx.restore();
      ctx.strokeStyle = L.rgba(c2, 0.7); ctx.lineWidth = Math.max(1, S * 0.02);
      L.roundRectPath(ctx, x, y, w, h, h * 0.35); ctx.stroke();
    });

    // powder — heaped yellow sulfur mound with granular speckle.
    F.sprites.defineIcon('powder', function (ctx, S, def) {
      var c1 = def.icon.color, c2 = def.icon.color2 || L.darken(c1, 30);
      var rng = F.rng.local(F.util.hashStr('powder-icon'), 3, 7);
      var cx = S * 0.5, cy = S * 0.6, i;
      ctx.fillStyle = c2;
      ctx.beginPath(); ctx.ellipse(cx, cy, S * 0.34, S * 0.2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = c1;
      ctx.beginPath(); ctx.ellipse(cx, cy - S * 0.04, S * 0.3, S * 0.18, 0, 0, Math.PI * 2); ctx.fill();
      for (i = 0; i < 14; i++) {
        var a = rng() * Math.PI * 2, rr = rng() * S * 0.26;
        var px = cx + Math.cos(a) * rr, py = cy - S * 0.05 + Math.sin(a) * rr * 0.55;
        ctx.fillStyle = rng() < 0.5 ? L.lighten(c1, 25) : L.darken(c1, 15);
        ctx.fillRect(px, py, S * 0.02, S * 0.02);
      }
      ctx.strokeStyle = L.rgba(c2, 0.7); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(cx, cy - S * 0.04, S * 0.3, S * 0.18, 0, 0, Math.PI * 2); ctx.stroke();
    });

    // fuel-block — solid pressed brick with grain lines.
    F.sprites.defineIcon('fuel-block', function (ctx, S, def) {
      var c1 = def.icon.color, c2 = def.icon.color2 || L.darken(c1, 30);
      var w = S * 0.62, h = S * 0.46, x = (S - w) / 2, y = (S - h) / 2;
      L.rectBevel(ctx, x, y, w, h, c1, { dark: c2, light: L.lighten(c1, 20) });
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + w * 0.5, y); ctx.lineTo(x + w * 0.5, y + h); ctx.stroke();
      ctx.strokeStyle = L.rgba(c2, 0.5); ctx.lineWidth = 1;
      for (var gy = y + h * 0.25; gy < y + h; gy += h * 0.25) { ctx.beginPath(); ctx.moveTo(x + w * 0.08, gy); ctx.lineTo(x + w * 0.92, gy); ctx.stroke(); }
    });

    // fuel-cell — upright rocket-fuel canister, red/orange, with a hazard band + nose cone.
    F.sprites.defineIcon('fuel-cell', function (ctx, S, def) {
      var c1 = def.icon.color, c2 = def.icon.color2 || L.darken(c1, 30);
      var w = S * 0.34, h = S * 0.62, x = (S - w) / 2, y = (S - h) / 2;
      L.cylinder(ctx, x, y + h * 0.08, w, h * 0.84, c1, false, { r: w * 0.35 });
      ctx.fillStyle = L.lighten(c1, 10);
      ctx.beginPath(); ctx.moveTo(x, y + h * 0.1); ctx.lineTo(x + w / 2, y); ctx.lineTo(x + w, y + h * 0.1); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(12,12,12,0.85)'; ctx.lineWidth = 1; ctx.stroke();
      L.hazardStripe(ctx, x, y + h * 0.42, w, h * 0.14, w * 0.22);
      ctx.fillStyle = c2; ctx.fillRect(x + w * 0.15, y + h * 0.92, w * 0.7, h * 0.08);
    });
  }

  F.sprites.definePainter('pumpjack', paintPumpjack);
})();
