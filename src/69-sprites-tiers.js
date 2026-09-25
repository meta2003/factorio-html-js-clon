// 69-sprites-tiers.js — building art for the higher tiers added by 07-data-tiers.js: the
// electric furnace, the big electric pole and the substation. (Express belts reuse the belt
// painters with their own tier colours in 60-sprites.js; the filter/stack inserters reuse the
// inserter base painter; assembling machine 3 is a palette of 63-sprites-machines.js.)
// Same contract as the other painter packs (design/BUILDING-ART.md): registered through
// F.sprites.definePainter, pure drawing, deterministic, ES5 style.
(function () {
  'use strict';
  if (!F.sprites || !F.sprites.definePainter) return;

  var L = F.sprites.lib;

  // ---------------------------------------------------------------------
  // Electric furnace (3×3) — pale steel housing, no chimney. A round recessed heating
  // chamber in the middle with concentric induction coils that glow orange while working,
  // four corner radiator vents and a cable conduit with insulators along the top edge.
  // ---------------------------------------------------------------------
  function paintElectricFurnace(ctx, W, H, frame, dir, def, type, opts) {
    var working = !!(opts && opts.working);
    var t = (Math.sin(frame / 16 * Math.PI * 2) + 1) / 2; // 0..1, loops over 16 frames
    L.foundation(ctx, W, H, '#5A5E61');

    var bx = W * 0.07, by = H * 0.09, bw = W * 0.86, bh = H * 0.84;
    L.panel(ctx, bx, by, bw, bh, '#9AA3AB', { r: W * 0.06, lo: 36 });

    // corner radiators
    var vw = bw * 0.2, vh = bh * 0.2;
    [[bx + bw * 0.04, by + bh * 0.06], [bx + bw * 0.76, by + bh * 0.06],
      [bx + bw * 0.04, by + bh * 0.74], [bx + bw * 0.76, by + bh * 0.74]].forEach(function (p) {
      L.vent(ctx, p[0], p[1], vw, vh, 4, false);
    });

    // top conduit: a dark cable duct with three ceramic insulators
    L.cylinder(ctx, bx + bw * 0.28, by + bh * 0.05, bw * 0.44, bh * 0.07, '#3A3F44', true, { r: bh * 0.03 });
    [0.36, 0.5, 0.64].forEach(function (f) {
      L.disc(ctx, bx + bw * f, by + bh * 0.085, W * 0.022, '#D8DDE0', { outlineWidth: 1 });
    });

    // heating chamber: steel flange, dark well, coils, hot core
    var cx = W / 2, cy = by + bh * 0.54, R = Math.min(W, H) * 0.27;
    L.disc(ctx, cx, cy, R * 1.12, '#7B848C', { outlineWidth: Math.max(1.5, W * 0.015) });
    L.inset(ctx, cx - R, cy - R, R * 2, R * 2, '#17191B', R);
    if (working) L.glow(ctx, cx, cy, R * 1.6, '#FF7A22', 0.35 + 0.25 * t);
    for (var ring = 0; ring < 3; ring++) {
      var rr = R * (0.86 - ring * 0.24);
      var hot = working ? (0.55 + 0.35 * t) : 0.25;
      ctx.strokeStyle = working ? L.rgba(ring === 2 ? '#FFD27A' : '#FF8A34', hot) : 'rgba(120,60,40,0.55)';
      ctx.lineWidth = Math.max(1.5, R * 0.1);
      ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.fillStyle = working ? L.rgba('#FFE3A8', 0.65 + 0.3 * t) : '#3A2A22';
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.16, 0, Math.PI * 2); ctx.fill();

    // four clamp bolts on the flange
    L.rivets(ctx, [[cx, cy - R * 1.02], [cx + R * 1.02, cy], [cx, cy + R * 1.02], [cx - R * 1.02, cy]], W * 0.018);

    // lightning plate (it runs on electricity) + status lamp
    var px = bx + bw * 0.44, py = by + bh * 0.87, pw = bw * 0.12, ph = bh * 0.09;
    L.panel(ctx, px, py, pw, ph, '#D9A520', { r: ph * 0.2, rim: false, outlineWidth: 1 });
    ctx.fillStyle = '#1A1A1A';
    ctx.beginPath();
    ctx.moveTo(px + pw * 0.58, py + ph * 0.12); ctx.lineTo(px + pw * 0.3, py + ph * 0.56); ctx.lineTo(px + pw * 0.5, py + ph * 0.56);
    ctx.lineTo(px + pw * 0.4, py + ph * 0.9); ctx.lineTo(px + pw * 0.72, py + ph * 0.42); ctx.lineTo(px + pw * 0.52, py + ph * 0.42);
    ctx.closePath(); ctx.fill();
    var lx = bx + bw * 0.62, ly = by + bh * 0.915;
    if (working) L.glow(ctx, lx, ly, W * 0.035, '#6FE68A', 0.6);
    ctx.fillStyle = working ? '#6FE68A' : '#3A4038';
    ctx.beginPath(); ctx.arc(lx, ly, W * 0.013, 0, Math.PI * 2); ctx.fill();
  }

  // ---------------------------------------------------------------------
  // Big electric pole (2×2) — a steel lattice tower seen from above: four splayed legs on
  // concrete footings converging on a central mast, X-bracing between the legs, and a wide
  // cross-arm with three insulators at the wire attach height (0.35 tile above centre, the
  // point 61-render.js's drawWire uses).
  // ---------------------------------------------------------------------
  function paintBigPole(ctx, W, H) {
    var steel = '#8A949C', dark = '#4A5157';
    var cx = W / 2, cy = H / 2 + H * 0.06;
    var feet = [[W * 0.16, H * 0.2], [W * 0.84, H * 0.2], [W * 0.16, H * 0.9], [W * 0.84, H * 0.9]];
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(cx, H * 0.6, W * 0.4, H * 0.32, 0, 0, Math.PI * 2); ctx.fill();
    feet.forEach(function (f) { L.panel(ctx, f[0] - W * 0.07, f[1] - H * 0.05, W * 0.14, H * 0.1, '#8F8C84', { r: W * 0.02, rim: false, outlineWidth: 1 }); });
    // legs
    ctx.lineCap = 'round';
    feet.forEach(function (f) {
      ctx.strokeStyle = 'rgba(12,12,12,0.9)'; ctx.lineWidth = Math.max(3, W * 0.055);
      ctx.beginPath(); ctx.moveTo(f[0], f[1]); ctx.lineTo(cx, cy); ctx.stroke();
      ctx.strokeStyle = steel; ctx.lineWidth = Math.max(2, W * 0.035);
      ctx.beginPath(); ctx.moveTo(f[0], f[1]); ctx.lineTo(cx, cy); ctx.stroke();
    });
    // X-bracing between neighbouring legs, at two heights
    ctx.strokeStyle = L.darken(steel, 18); ctx.lineWidth = Math.max(1, W * 0.014);
    [0.35, 0.65].forEach(function (k) {
      var pts = feet.map(function (f) { return [f[0] + (cx - f[0]) * k, f[1] + (cy - f[1]) * k]; });
      var ring = [pts[0], pts[1], pts[3], pts[2], pts[0]];
      ctx.beginPath(); ctx.moveTo(ring[0][0], ring[0][1]);
      for (var i = 1; i < ring.length; i++) ctx.lineTo(ring[i][0], ring[i][1]);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]); ctx.lineTo(pts[3][0], pts[3][1]);
      ctx.moveTo(pts[1][0], pts[1][1]); ctx.lineTo(pts[2][0], pts[2][1]);
      ctx.stroke();
    });
    // mast
    L.cylinder(ctx, cx - W * 0.035, H * 0.16, W * 0.07, cy - H * 0.16, steel, false, { r: W * 0.02 });
    // cross-arm + insulators
    var armY = H / 2 - 0.35 * L.PX, armW = W * 0.78, armH = H * 0.05;
    L.cylinder(ctx, cx - armW / 2, armY - armH / 2, armW, armH, dark, true, { r: armH * 0.4 });
    [-0.42, 0, 0.42].forEach(function (f) {
      L.disc(ctx, cx + armW * f, armY, W * 0.035, '#B9C2C9', { outlineWidth: 1 });
    });
    ctx.lineCap = 'butt';
  }

  // ---------------------------------------------------------------------
  // Substation (2×2) — a squat transformer cabinet on a plinth: ribbed cooling fins on both
  // sides, a blue high-voltage band, a hazard-striped front and a gantry with three large
  // insulators on top where the wires attach.
  // ---------------------------------------------------------------------
  function paintSubstation(ctx, W, H) {
    L.foundation(ctx, W, H, '#5C5F61');
    var bx = W * 0.12, by = H * 0.2, bw = W * 0.76, bh = H * 0.68;
    L.panel(ctx, bx, by, bw, bh, '#6E8290', { r: W * 0.05, lo: 34 });
    // cooling fins
    L.vent(ctx, bx + bw * 0.04, by + bh * 0.22, bw * 0.16, bh * 0.56, 5, false);
    L.vent(ctx, bx + bw * 0.8, by + bh * 0.22, bw * 0.16, bh * 0.56, 5, false);
    // high-voltage band + warning stripes
    ctx.fillStyle = L.rgba('#3FA9E0', 0.9);
    ctx.fillRect(bx + bw * 0.22, by + bh * 0.12, bw * 0.56, bh * 0.07);
    L.hazardStripe(ctx, bx + bw * 0.26, by + bh * 0.8, bw * 0.48, bh * 0.1, W * 0.03);
    // transformer core: a round tank lid
    L.disc(ctx, W / 2, by + bh * 0.5, Math.min(bw, bh) * 0.22, '#8C9AA4', { outlineWidth: Math.max(1.5, W * 0.015) });
    L.rivets(ctx, [[W / 2 - bw * 0.14, by + bh * 0.5], [W / 2 + bw * 0.14, by + bh * 0.5]], W * 0.015);
    // gantry with insulators (wire attach height = 0.35 tile above centre)
    var armY = H / 2 - 0.35 * L.PX, armW = W * 0.66, armH = H * 0.045;
    L.cylinder(ctx, W / 2 - W * 0.025, armY, W * 0.05, by - armY + bh * 0.1, '#4A5157', false, { r: W * 0.015 });
    L.cylinder(ctx, W / 2 - armW / 2, armY - armH / 2, armW, armH, '#3E454B', true, { r: armH * 0.4 });
    [-0.4, 0, 0.4].forEach(function (f) {
      var x = W / 2 + armW * f;
      L.cylinder(ctx, x - W * 0.025, armY - H * 0.08, W * 0.05, H * 0.08, '#C9D1D6', false, { r: W * 0.012 });
      L.disc(ctx, x, armY - H * 0.08, W * 0.03, '#E4E9EC', { outlineWidth: 1 });
    });
  }

  F.sprites.definePainter(['electric-furnace'], paintElectricFurnace);
  F.sprites.definePainter(['big-electric-pole'], paintBigPole);
  F.sprites.definePainter(['substation'], paintSubstation);
})();
