// 63-sprites-machines.js — better procedural building art for the "machine" family: the two
// assembling machines, lab, radar, solar panel, accumulator and small lamp. Registered on top of
// src/60-sprites.js's PAINTERS table via F.sprites.definePainter (design/BUILDING-ART.md's
// contract) — that file is never edited here. Pure drawing module, ES5 style, deterministic
// (F.rng.local only, no Math.random).
(function () {
  'use strict';
  if (!F.sprites || !F.sprites.definePainter) return;

  var L = F.sprites.lib;

  // ---------------------------------------------------------------------
  // Local helpers (chamfered/octagon panel — the shared library only has rounded rects).
  // ---------------------------------------------------------------------
  function chamferPath(ctx, x, y, w, h, cut) {
    ctx.beginPath();
    ctx.moveTo(x + cut, y); ctx.lineTo(x + w - cut, y); ctx.lineTo(x + w, y + cut);
    ctx.lineTo(x + w, y + h - cut); ctx.lineTo(x + w - cut, y + h); ctx.lineTo(x + cut, y + h);
    ctx.lineTo(x, y + h - cut); ctx.lineTo(x, y + cut); ctx.closePath();
  }
  // Chamfered steel plate with the same top-lit gradient + rim-light + outline treatment as
  // L.panel, just following an octagon silhouette instead of a rounded rect.
  function chamferPanel(ctx, x, y, w, h, cut, color, opts) {
    opts = opts || {};
    var g = ctx.createLinearGradient(x, y, x + w * 0.35, y + h);
    g.addColorStop(0, L.lighten(color, opts.hi != null ? opts.hi : 26));
    g.addColorStop(0.45, color);
    g.addColorStop(1, L.darken(color, opts.lo != null ? opts.lo : 32));
    chamferPath(ctx, x, y, w, h, cut);
    ctx.fillStyle = g; ctx.fill();
    if (opts.rim !== false) {
      ctx.save(); chamferPath(ctx, x, y, w, h, cut); ctx.clip();
      var lw = Math.max(1, Math.min(w, h) * 0.035);
      ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = lw * 2;
      ctx.beginPath(); ctx.moveTo(x, y + h - cut); ctx.lineTo(x, y + cut); ctx.lineTo(x + cut, y); ctx.lineTo(x + w - cut, y); ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.30)';
      ctx.beginPath(); ctx.moveTo(x + cut, y + h); ctx.lineTo(x + w - cut, y + h); ctx.lineTo(x + w, y + h - cut); ctx.lineTo(x + w, y + cut); ctx.stroke();
      ctx.restore();
    }
    if (opts.outline !== false) {
      chamferPath(ctx, x, y, w, h, cut);
      ctx.strokeStyle = opts.outlineColor || 'rgba(12,12,12,0.9)';
      ctx.lineWidth = opts.outlineWidth || Math.max(1.5, L.PX * 0.03); ctx.stroke();
    }
  }
  // Small standing cylindrical support post (corner pillar / lamp post / battery terminal).
  function pillar(ctx, cx, cy, r, h, color) {
    L.cylinder(ctx, cx - r, cy - h, r * 2, h, color, false, { r: r * 0.6 });
  }

  // ---------------------------------------------------------------------
  // Assembling machines 1 & 2 — chamfered steel housing on a foundation, corner support
  // pillars, side panels (seam + vents + rivets), a big central rotating work-chamber lid,
  // small status lamps. AM2 = blue-steel tier with brighter trim + extra piping.
  // ---------------------------------------------------------------------
  var AM_PALETTE = {
    'assembling-machine-1': { body: '#6C7960', bodyLo: '#333B2C', accent: '#9FC27A', pillar: '#4E564A', trim: '#C9A227' },
    'assembling-machine-2': { body: '#54697E', bodyLo: '#212C37', accent: '#8FCBEF', pillar: '#3C4A58', trim: '#E7F3FA' },
  };
  function paintAssembler(ctx, W, H, frame, dir, def, type, opts) {
    var working = !!(opts && opts.working);
    var pal = AM_PALETTE[type] || AM_PALETTE['assembling-machine-1'];
    L.foundation(ctx, W, H, '#55585A');

    // corner support pillars, drawn before the housing so its chamfered corners overlap them.
    var pr = W * 0.045, po = W * 0.145;
    var corners = [[po, po], [W - po, po], [po, H - po], [W - po, H - po]];
    for (var ci = 0; ci < 4; ci++) pillar(ctx, corners[ci][0], corners[ci][1] + pr * 1.1, pr, pr * 2.4, pal.pillar);

    // chamfered housing body.
    var hx = W * 0.09, hy = H * 0.08, hw = W * 0.82, hh = H * 0.84, cut = Math.min(hw, hh) * 0.17;
    chamferPanel(ctx, hx, hy, hw, hh, cut, pal.body, { lo: 32 });

    // side seam + vent + rivets (reads as panelling, not a flat box).
    ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = Math.max(1, W * 0.012);
    ctx.beginPath(); ctx.moveTo(hx + hw * 0.18, hy + cut * 0.6); ctx.lineTo(hx + hw * 0.18, hy + hh - cut * 0.6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(hx + hw * 0.82, hy + cut * 0.6); ctx.lineTo(hx + hw * 0.82, hy + hh - cut * 0.6); ctx.stroke();
    L.vent(ctx, hx + hw * 0.03, hy + hh * 0.66, hw * 0.13, hh * 0.24, 4, true);
    L.vent(ctx, hx + hw * 0.84, hy + hh * 0.66, hw * 0.13, hh * 0.24, 4, true);
    L.rivets(ctx, [[hx + cut * 0.55, hy + cut * 0.55], [hx + hw - cut * 0.55, hy + cut * 0.55],
      [hx + cut * 0.55, hy + hh - cut * 0.55], [hx + hw - cut * 0.55, hy + hh - cut * 0.55]], W * 0.02);

    // AM2: brighter trim band + extra piping stubs on the top edge.
    if (type === 'assembling-machine-2') {
      ctx.fillStyle = L.rgba(pal.accent, 0.85); ctx.fillRect(hx + cut * 0.4, hy + hh * 0.09, hw - cut * 0.8, hh * 0.045);
      pillar(ctx, hx + hw * 0.28, hy + H * 0.02, W * 0.022, H * 0.05, pal.pillar);
      pillar(ctx, hx + hw * 0.72, hy + H * 0.02, W * 0.022, H * 0.05, pal.pillar);
    } else {
      ctx.strokeStyle = L.rgba(pal.accent, 0.55); ctx.lineWidth = Math.max(1, W * 0.012);
      ctx.beginPath(); ctx.moveTo(hx + cut * 0.4, hy + hh * 0.12); ctx.lineTo(hx + hw - cut * 0.4, hy + hh * 0.12); ctx.stroke();
    }

    // central circular work chamber: outer flange, rotating lid/gear (frame 0..15 loop), radial
    // slats, warm glow bleeding through when working.
    var cx = W / 2, cy = hy + hh * 0.56, R = Math.min(W, H) * 0.25;
    L.disc(ctx, cx, cy, R * 1.14, L.darken(pal.body, 14), { outlineWidth: Math.max(1.5, W * 0.02) });
    var ang = working ? (frame / 16) * Math.PI * 2 : 0;
    if (working) {
      var pulse = 0.5 + 0.5 * Math.sin(frame / 16 * Math.PI * 2);
      L.glow(ctx, cx, cy, R * 1.5, '#FF8A2A', 0.18 + 0.16 * pulse);
    }
    L.gearShape(ctx, cx, cy, R * 0.88, R * 0.3, 10, ang, L.lighten(pal.body, 22), '#201F1C');
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang);
    for (var si = 0; si < 6; si++) {
      ctx.save(); ctx.rotate(si / 6 * Math.PI * 2);
      ctx.fillStyle = 'rgba(8,8,8,0.32)'; ctx.fillRect(-R * 0.05, -R * 0.26, R * 0.1, R * 0.52);
      ctx.restore();
    }
    ctx.restore();
    if (working) {
      ctx.fillStyle = 'rgba(255,180,100,' + (0.35 + 0.25 * (0.5 + 0.5 * Math.sin(frame / 16 * Math.PI * 2))).toFixed(2) + ')';
      ctx.beginPath(); ctx.arc(cx, cy, R * 0.28, 0, Math.PI * 2); ctx.fill();
    }

    // status lamps near the top edge.
    var lampY = hy + cut * 0.85;
    [[hx + cut * 0.55, lampY], [hx + hw - cut * 0.55, lampY]].forEach(function (p) {
      if (working) L.glow(ctx, p[0], p[1], W * 0.05, '#6FE68A', 0.55);
      ctx.fillStyle = working ? '#6FE68A' : '#3A4038';
      ctx.beginPath(); ctx.arc(p[0], p[1], W * 0.018, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(12,12,12,0.85)'; ctx.lineWidth = 1; ctx.stroke();
    });
  }

  // ---------------------------------------------------------------------
  // Lab — octagonal base, glass dome over a pulsing core, orbiting red/green science-pack dots
  // while working; dark dome when idle.
  // ---------------------------------------------------------------------
  function paintLab(ctx, W, H, frame, dir, def, type, opts) {
    var working = !!(opts && opts.working);
    L.foundation(ctx, W, H, '#54585B');
    var bx = W * 0.08, by = H * 0.14, bw = W * 0.84, bh = H * 0.78, cut = Math.min(bw, bh) * 0.2;
    chamferPanel(ctx, bx, by, bw, bh, cut, '#5B6670', { lo: 32 });
    L.rivets(ctx, [[bx + cut * 0.55, by + cut * 0.55], [bx + bw - cut * 0.55, by + cut * 0.55],
      [bx + cut * 0.55, by + bh - cut * 0.55], [bx + bw - cut * 0.55, by + bh - cut * 0.55]], W * 0.018);

    var cx = W / 2, cy = by + bh * 0.34, R = Math.min(W, H) * 0.32;
    var seamT = (Math.sin(frame / 16 * Math.PI * 2) + 1) / 2; // 0..1, seamless over the 16-frame loop
    var coreA = working ? (0.45 + 0.45 * seamT) : 0.1;
    L.glow(ctx, cx, cy, R * 1.3, '#4FE0F2', coreA);
    ctx.fillStyle = working ? L.lighten('#1C6E82', 8 + 14 * seamT) : '#173238';
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.32, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(12,12,12,0.6)'; ctx.lineWidth = 1; ctx.stroke();

    // glass dome: low-alpha radial gradient over the core, with a rim highlight arc.
    ctx.save();
    var dg = ctx.createRadialGradient(cx - R * 0.32, cy - R * 0.36, R * 0.06, cx, cy, R);
    dg.addColorStop(0, 'rgba(255,255,255,0.40)');
    dg.addColorStop(0.55, working ? 'rgba(160,225,240,0.22)' : 'rgba(120,150,160,0.16)');
    dg.addColorStop(1, 'rgba(90,120,130,0.10)');
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fillStyle = dg; ctx.fill();
    ctx.strokeStyle = 'rgba(12,12,12,0.55)'; ctx.lineWidth = Math.max(1.5, W * 0.022); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = Math.max(1, W * 0.011);
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.94, Math.PI * 1.08, Math.PI * 1.55); ctx.stroke();
    ctx.restore();

    // orbiting science-pack dots — only while working, one full orbit per 16-frame loop.
    if (working) {
      var orbitR = R * 1.3, a1 = frame / 16 * Math.PI * 2, a2 = a1 + Math.PI;
      L.disc(ctx, cx + Math.cos(a1) * orbitR, cy + Math.sin(a1) * orbitR * 0.5, W * 0.05, '#D9422B', { outlineWidth: 1.2 });
      L.disc(ctx, cx + Math.cos(a2) * orbitR, cy + Math.sin(a2) * orbitR * 0.5, W * 0.05, '#3EB44A', { outlineWidth: 1.2 });
    }
  }

  // ---------------------------------------------------------------------
  // Radar — round concrete pad + 4 lattice legs to a centre bearing ring (tower seen from
  // above) with a large parabolic dish (full elongated-ellipse "lens" with a concave shading
  // gradient, radial ribs, rim highlight, feed-horn arm) that pivots on the tile centre and
  // always makes one full revolution per 16-frame loop, whether or not it is "working".
  // ---------------------------------------------------------------------
  function paintRadar(ctx, W, H, frame) {
    var minWH = Math.min(W, H);
    L.foundation(ctx, W, H, '#5C605D');
    var cx = W / 2, cy = H / 2;

    // round concrete pad (with a fainter inner ring so it also reads as "octagonal").
    var padR = minWH * 0.46;
    L.disc(ctx, cx, cy, padR, '#7C7F80', { hi: 20, lo: 26, outlineWidth: Math.max(1.5, W * 0.02) });
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, padR, 0, Math.PI * 2); ctx.clip();
    ctx.strokeStyle = 'rgba(0,0,0,0.16)'; ctx.lineWidth = Math.max(1, W * 0.009);
    ctx.beginPath(); ctx.arc(cx, cy, padR * 0.68, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();

    // centre bearing ring the mast/dish assembly pivots on.
    var bearR = minWH * 0.14;

    // 4 lattice legs from the pad rim to the bearing ring, plus short cross braces.
    ctx.strokeStyle = '#3C434A'; ctx.lineWidth = Math.max(1.4, W * 0.015);
    var legA = [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75];
    for (var li = 0; li < 4; li++) {
      var a = legA[li], a2 = legA[(li + 1) % 4];
      var ex = cx + Math.cos(a) * padR * 0.9, ey = cy + Math.sin(a) * padR * 0.9;
      var ix2 = cx + Math.cos(a) * bearR * 1.15, iy2 = cy + Math.sin(a) * bearR * 1.15;
      ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ix2, iy2); ctx.stroke();
      var mid = (a + a2) / 2;
      ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(cx + Math.cos(mid) * bearR * 1.3, cy + Math.sin(mid) * bearR * 1.3); ctx.stroke();
    }
    L.disc(ctx, cx, cy, bearR, '#454C54', { outlineWidth: Math.max(1.4, W * 0.018) });

    // dish assembly — pivots on the tile centre, on top of the mast, always animated. Kept
    // inside the 3×3 footprint at every angle: rx/ry sized off min(W,H) with headroom to spare.
    var ang = (frame / 16) * Math.PI * 2; // always animated — no opts.working gate
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang);
    var rx = minWH * 0.42, ry = minWH * 0.2;

    // full elongated-ellipse dish, concave shading: light near edge -> dark far edge.
    var dishG = ctx.createLinearGradient(0, ry, 0, -ry);
    dishG.addColorStop(0, L.lighten('#8A9AA5', 30)); dishG.addColorStop(0.5, '#8A9AA5'); dishG.addColorStop(1, L.darken('#8A9AA5', 38));
    ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); ctx.fillStyle = dishG; ctx.fill();
    ctx.strokeStyle = 'rgba(12,12,12,0.85)'; ctx.lineWidth = Math.max(1.5, W * 0.018); ctx.stroke();

    // radial ribs from the dish centre to its rim.
    ctx.strokeStyle = 'rgba(0,0,0,0.26)'; ctx.lineWidth = Math.max(1, W * 0.007);
    for (var ri = 0; ri < 8; ri++) {
      var ra = ri / 8 * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(ra) * rx * 0.94, Math.sin(ra) * ry * 0.94); ctx.stroke();
    }
    // rim highlight along the near edge.
    ctx.strokeStyle = 'rgba(255,255,255,0.32)'; ctx.lineWidth = Math.max(1, W * 0.01);
    ctx.beginPath(); ctx.ellipse(0, 0, rx * 0.96, ry * 0.9, 0, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();

    // feed-horn arm from the dish centre forward, drawn on top of the dish surface.
    ctx.strokeStyle = '#7A8590'; ctx.lineWidth = Math.max(1.4, W * 0.013);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -ry * 0.92); ctx.stroke();
    L.disc(ctx, 0, -ry * 0.96, minWH * 0.045, '#CFE0E8', { outlineWidth: 1 });
    ctx.restore();
  }

  // ---------------------------------------------------------------------
  // Solar panel — dark blue monocrystalline cell grid on an aluminium-framed mount, thin silver
  // bus lines, diagonal sheen, a visible frame edge (mounting thickness) at the bottom.
  // ---------------------------------------------------------------------
  function paintSolarPanel(ctx, W, H) {
    L.panel(ctx, W * 0.04, H * 0.04, W * 0.92, H * 0.92, '#8C949A', { r: W * 0.03, hi: 20, lo: 24 });
    ctx.fillStyle = L.darken('#8C949A', 38); ctx.fillRect(W * 0.06, H * 0.92, W * 0.88, H * 0.045);

    var ix = W * 0.09, iy = H * 0.09, iw = W * 0.82, ih = H * 0.78;
    var cg = ctx.createLinearGradient(ix, iy, ix + iw * 0.3, iy + ih);
    cg.addColorStop(0, L.lighten('#152A4E', 14)); cg.addColorStop(0.5, '#152A4E'); cg.addColorStop(1, L.darken('#152A4E', 18));
    L.roundRectPath(ctx, ix, iy, iw, ih, W * 0.014); ctx.fillStyle = cg; ctx.fill();

    ctx.save(); L.roundRectPath(ctx, ix, iy, iw, ih, W * 0.014); ctx.clip();
    var n = 6;
    ctx.strokeStyle = 'rgba(182,198,208,0.5)'; ctx.lineWidth = Math.max(1, W * 0.006);
    for (var i = 1; i < n; i++) {
      var gx = ix + iw * i / n; ctx.beginPath(); ctx.moveTo(gx, iy); ctx.lineTo(gx, iy + ih); ctx.stroke();
      var gy = iy + ih * i / n; ctx.beginPath(); ctx.moveTo(ix, gy); ctx.lineTo(ix + iw, gy); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(222,232,238,0.55)'; ctx.lineWidth = Math.max(1.2, W * 0.009);
    for (var j = 2; j < n; j += 2) { var bx = ix + iw * j / n; ctx.beginPath(); ctx.moveTo(bx, iy); ctx.lineTo(bx, iy + ih); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(ix, iy + ih / 2); ctx.lineTo(ix + iw, iy + ih / 2); ctx.stroke();
    var sheen = ctx.createLinearGradient(ix, iy, ix + iw * 0.55, iy + ih * 0.65);
    sheen.addColorStop(0, 'rgba(255,255,255,0.30)'); sheen.addColorStop(0.45, 'rgba(255,255,255,0.05)'); sheen.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sheen; ctx.fillRect(ix, iy, iw, ih);
    ctx.restore();
    ctx.strokeStyle = 'rgba(12,12,12,0.85)'; ctx.lineWidth = Math.max(1.5, W * 0.018);
    L.roundRectPath(ctx, ix, iy, iw, ih, W * 0.014); ctx.stroke();
  }

  // ---------------------------------------------------------------------
  // Accumulator — two big cylindrical battery cells on a base with terminals, plus a vertical
  // 5-segment LED charge meter (frame = charge level 0..4, segments lit = level+1).
  // ---------------------------------------------------------------------
  function paintAccumulator(ctx, W, H, frame) {
    var level = F.util.clamp(frame | 0, 0, 4);
    L.foundation(ctx, W, H, '#4C5652');
    L.panel(ctx, W * 0.06, H * 0.64, W * 0.62, H * 0.28, '#3A4440', { r: W * 0.04, hi: 16, lo: 26 });

    var cellW = W * 0.24, cellH = H * 0.5, baseY = H * 0.66;
    var cellXs = [W * 0.14, W * 0.42];
    for (var i = 0; i < cellXs.length; i++) {
      var cx0 = cellXs[i];
      L.cylinder(ctx, cx0, baseY - cellH, cellW, cellH, '#2E5E3E', false, { r: cellW * 0.42 });
      L.disc(ctx, cx0 + cellW / 2, baseY - cellH, cellW * 0.42, '#3E7A50', { outlineWidth: 1.4 });
      L.rivets(ctx, [[cx0 + cellW / 2, baseY - cellH + cellH * 0.03]], W * 0.016);
    }

    // vertical LED charge meter along the right edge.
    var mx = W * 0.72, my0 = H * 0.12, mh = H * 0.5, segH = mh / 5, gap = segH * 0.18;
    L.panel(ctx, mx - W * 0.02, my0 - H * 0.02, W * 0.18, mh + H * 0.04, '#20241F', { r: W * 0.02, rim: false });
    for (var s = 0; s < 5; s++) {
      var segY = my0 + mh - (s + 1) * segH + gap * 0.5, segH2 = segH - gap;
      if (s <= level) {
        L.panel(ctx, mx, segY, W * 0.14, segH2, '#3FCB6F', { r: W * 0.008, hi: 42, lo: 8, rim: false });
        L.glow(ctx, mx + W * 0.07, segY + segH2 / 2, W * 0.16, '#5EE68A', 0.4);
      } else {
        L.inset(ctx, mx, segY, W * 0.14, segH2, '#161C16', W * 0.008);
      }
    }
  }

  // ---------------------------------------------------------------------
  // Small lamp — metal base plate + post + round frosted-glass lamp head; opts.lit switches a
  // warm additive glow + bright lens on, otherwise the glass reads flat grey.
  // ---------------------------------------------------------------------
  function paintLamp(ctx, W, H, frame, dir, def, type, opts) {
    var lit = !!(opts && opts.lit);
    L.panel(ctx, W * 0.22, H * 0.68, W * 0.56, H * 0.2, '#5A5E60', { r: W * 0.05, hi: 20, lo: 28 });
    L.rivets(ctx, [[W * 0.3, H * 0.78], [W * 0.7, H * 0.78]], W * 0.03);
    pillar(ctx, W / 2, H * 0.72, W * 0.08, H * 0.3, '#6E7276');
    ctx.fillStyle = L.darken('#8A8E90', 8);
    ctx.beginPath(); ctx.arc(W / 2, H * 0.32, W * 0.28, Math.PI, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(12,12,12,0.85)'; ctx.lineWidth = 1.5; ctx.stroke();
    if (lit) L.glow(ctx, W / 2, H * 0.38, W * 0.6, '#FFDA8A', 0.5);
    L.disc(ctx, W / 2, H * 0.38, W * 0.228, lit ? '#FFE9A8' : '#7E8890', { hi: lit ? 70 : 30, lo: lit ? 15 : 35, outlineWidth: 1.3 });
    if (lit) { ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.arc(W * 0.43, H * 0.32, W * 0.066, 0, Math.PI * 2); ctx.fill(); }
  }

  F.sprites.definePainter(['assembling-machine-1', 'assembling-machine-2'], paintAssembler);
  F.sprites.definePainter('lab', paintLab);
  F.sprites.definePainter('radar', paintRadar);
  F.sprites.definePainter('solar-panel', paintSolarPanel);
  F.sprites.definePainter('accumulator', paintAccumulator);
  F.sprites.definePainter('small-lamp', paintLamp);
})();
