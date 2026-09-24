// 65-sprites-oil.js — procedural art for the oil-processing chain: pumpjack, oil-refinery,
// chemical-plant, storage-tank, the crude-oil well resource tile, and item icons for the new
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
  // Chamfered (cut-corner) steel plate — same top-lit gradient/rim/outline treatment as
  // L.panel, following an octagon silhouette. Duplicated locally per the pattern already used
  // by 62-/63-sprites-*.js (the shared lib only has rounded rects).
  function chamferPath(ctx, x, y, w, h, c) {
    ctx.beginPath();
    ctx.moveTo(x + c, y); ctx.lineTo(x + w - c, y); ctx.lineTo(x + w, y + c);
    ctx.lineTo(x + w, y + h - c); ctx.lineTo(x + w - c, y + h); ctx.lineTo(x + c, y + h);
    ctx.lineTo(x, y + h - c); ctx.lineTo(x, y + c); ctx.closePath();
  }
  function chamferPanel(ctx, x, y, w, h, c, color, opts) {
    opts = opts || {};
    var g = ctx.createLinearGradient(x, y, x + w * 0.35, y + h);
    g.addColorStop(0, L.lighten(color, opts.hi != null ? opts.hi : 26));
    g.addColorStop(0.45, color);
    g.addColorStop(1, L.darken(color, opts.lo != null ? opts.lo : 30));
    chamferPath(ctx, x, y, w, h, c); ctx.fillStyle = g; ctx.fill();
    ctx.save(); chamferPath(ctx, x, y, w, h, c); ctx.clip();
    var lw = Math.max(1, Math.min(w, h) * 0.035);
    ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = lw * 2;
    ctx.beginPath(); ctx.moveTo(x, y + h - c); ctx.lineTo(x, y + c); ctx.lineTo(x + c, y); ctx.lineTo(x + w - c, y); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.30)';
    ctx.beginPath(); ctx.moveTo(x + c, y + h); ctx.lineTo(x + w - c, y + h); ctx.lineTo(x + w, y + h - c); ctx.lineTo(x + w, y + c); ctx.stroke();
    ctx.restore();
    chamferPath(ctx, x, y, w, h, c);
    ctx.strokeStyle = 'rgba(12,12,12,0.9)'; ctx.lineWidth = Math.max(1.5, L.PX * 0.03); ctx.stroke();
  }
  // Nodding-donkey horsehead silhouette: (x,y) is the NOSE tip (frontmost point, where the
  // bridle cable attaches) — the northmost point of the whole mechanism, sitting right over the
  // well. The head mass hooks DOWN and to one side from there, back toward the beam/pivot (never
  // further north than the nose), so it never needs headroom above the beam tip. s = overall size.
  function drawHorseHead(ctx, x, y, s) {
    ctx.save(); ctx.translate(x, y);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(s * 0.05, s * 0.3, s * 0.34, s * 0.42);
    ctx.quadraticCurveTo(s * 0.64, s * 0.5, s * 0.6, s * 0.8);
    ctx.quadraticCurveTo(s * 0.52, s * 1.04, s * 0.16, s * 1.0);
    ctx.quadraticCurveTo(-s * 0.1, s * 0.92, -s * 0.08, s * 0.56);
    ctx.quadraticCurveTo(-s * 0.1, s * 0.2, 0, 0);
    ctx.closePath();
    var g = ctx.createLinearGradient(-s * 0.1, 0, s * 0.5, s * 0.9);
    g.addColorStop(0, '#5A6068'); g.addColorStop(1, '#2A2E32');
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(12,12,12,0.9)'; ctx.lineWidth = Math.max(1.2, s * 0.05); ctx.stroke();
    ctx.restore();
  }
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
  // Pumpjack (3x3, dir 0 = north). Redesigned so the classic "nodding donkey" silhouette
  // dominates the footprint: a long thick walking beam spans ~80% of the tile along the
  // north-south axis (horsehead at the north end over the well head, tail/counterweight-block at
  // the south end), a tall splay-legged samson-post A-frame stands at the centre pivot, and a
  // small motor/gearbox skid with two rotating crank-arm counterweights sits at the south end —
  // all on a plain concrete pad (no big flat panel) with margins for the auto shadow. Since the
  // beam is drawn along a fixed vertical axis (no true 2D rotation, which would mostly just
  // shift it sideways at this near-vertical rest angle), the rocking motion is instead shown as
  // the head arm's rendered length pulsing (perspective foreshortening) plus a vertical bob of
  // the head tip, while the crank/counterweights spin a full continuous turn — all driven by one
  // shared phase so they read as one connected mechanism. frame 0 -> phase 0 -> rest/idle pose.
  // ---------------------------------------------------------------------
  function paintPumpjack(ctx, W, H, frame, dir, def, type, opts) {
    var minWH = Math.min(W, H);
    L.foundation(ctx, W, H, '#6C706E'); // plain concrete pad, nothing else spans the footprint

    var cx = W * 0.5, pivotY = H * 0.5;
    var headArm0 = H * 0.36, tailArm = H * 0.42; // beam half-lengths at rest: ~0.78H span (~80%)
    var wellY = H * 0.06;

    var phase = (frame / 16) * Math.PI * 2;
    var bob = Math.sin(phase);                     // 0 at frame 0 -> idle rest pose
    // Head-arm "foreshortening" + a vertical bob of the tip together sell the rocking motion;
    // amplitudes are kept small enough that even at the extremes (bob=+-1) the tip stays inside
    // the tile and never crosses the well (bob=-1 -> nose almost touches the well = bottom of
    // stroke; bob=+1 -> nose furthest from the well = top of stroke).
    var headArm = headArm0 * (1 - 0.15 * bob);
    var headTipY = pivotY - headArm + bob * (H * 0.03);
    var tailTipY = pivotY + tailArm;

    // ---- output pipe: well -> north-edge nub, drawn first so the mechanism reads on top near
    // the well casing. ----
    var nub = minWH * 0.095;
    ctx.strokeStyle = '#6E7A82'; ctx.lineWidth = nub * 0.55;
    ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, wellY); ctx.stroke();
    L.pipeNub(ctx, cx, 0, 0, nub);

    // ---- rusty well-head ring, centre-north. ----
    var wellR = minWH * 0.095;
    L.disc(ctx, cx, wellY, wellR, '#7A4A28', { hi: 18, lo: 32, outlineWidth: Math.max(1.4, minWH * 0.018) });
    L.disc(ctx, cx, wellY, wellR * 0.48, '#241A14', { hi: 6, lo: 10, outlineWidth: 1.1 });
    L.rivets(ctx, [[cx - wellR * 0.8, wellY], [cx + wellR * 0.8, wellY]], wellR * 0.16);

    // ---- motor/gearbox skid + crank, south end, offset east of the beam's vertical axis. ----
    var crankCx = cx + minWH * 0.28, crankCy = H * 0.76, crankR = minWH * 0.1;
    var skidW = minWH * 0.34, skidH = H * 0.09;
    L.panel(ctx, crankCx - skidW * 0.5, crankCy + crankR * 0.7, skidW, skidH, '#33383D', { r: minWH * 0.018, hi: 12, lo: 24 });
    var mhw = minWH * 0.3, mhh = H * 0.15, mhx = crankCx - mhw * 0.5, mhy = crankCy - mhh * 0.55;
    L.panel(ctx, mhx, mhy, mhw, mhh, '#C9A227', { r: minWH * 0.02, hi: 22, lo: 30 });
    L.vent(ctx, mhx + mhw * 0.08, mhy + mhh * 0.6, mhw * 0.4, mhh * 0.3, 3, true);
    L.rivets(ctx, [[mhx + mhw * 0.12, mhy + mhh * 0.14], [mhx + mhw * 0.88, mhy + mhh * 0.14]], minWH * 0.012);

    // ---- samson post (A-frame): tall, splayed legs, standing at the centre pivot. ----
    var postBaseY = pivotY + minWH * 0.2, postSpread = minWH * 0.16;
    ctx.strokeStyle = '#2A2E32'; ctx.lineWidth = Math.max(2.4, minWH * 0.032); ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - postSpread, postBaseY); ctx.lineTo(cx, pivotY); ctx.lineTo(cx + postSpread, postBaseY);
    ctx.stroke();
    ctx.strokeStyle = '#454C54'; ctx.lineWidth = Math.max(1.6, minWH * 0.018);
    ctx.beginPath(); ctx.moveTo(cx - postSpread * 0.55, postBaseY - minWH * 0.06); ctx.lineTo(cx + postSpread * 0.55, postBaseY - minWH * 0.06); ctx.stroke();

    // ---- crank hub + two big counterweight arms, spinning a full continuous turn. ----
    L.disc(ctx, crankCx, crankCy, crankR * 0.36, '#454C54', { hi: 30, lo: 30, outlineWidth: 1.2 });
    var cwR = crankR * 0.6, pin = [crankCx, crankCy];
    [0, Math.PI].forEach(function (off) {
      var a = phase + off;
      var ax = crankCx + Math.cos(a) * crankR * 0.86, ay = crankCy + Math.sin(a) * crankR * 0.86;
      ctx.strokeStyle = '#33383D'; ctx.lineWidth = Math.max(2, minWH * 0.026); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(crankCx, crankCy); ctx.lineTo(ax, ay); ctx.stroke();
      L.disc(ctx, ax, ay, cwR, '#2A2E32', { hi: 26, lo: 20, outlineWidth: Math.max(1.4, minWH * 0.018) });
      ctx.strokeStyle = 'rgba(217,165,32,0.7)'; ctx.lineWidth = Math.max(1, minWH * 0.01);
      ctx.beginPath(); ctx.arc(ax, ay, cwR * 0.6, 0, Math.PI * 2); ctx.stroke();
      if (off === 0) pin = [crankCx + Math.cos(a) * crankR * 0.5, crankCy + Math.sin(a) * crankR * 0.5];
    });
    L.disc(ctx, pin[0], pin[1], crankR * 0.14, '#1A1A1A', { outlineWidth: 1 });

    // ---- pitman arm: static tail tip -> rotating crank pin. ----
    ctx.strokeStyle = '#9AA3A8'; ctx.lineWidth = Math.max(1.8, minWH * 0.02); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx, tailTipY); ctx.lineTo(pin[0], pin[1]); ctx.stroke();

    // ---- walking beam: long, thick, dark-steel bar from the tail tip through the pivot to the
    // animated head tip, with a brass/yellow accent stripe (Factorio palette). ----
    var beamW = minWH * 0.115;
    ctx.beginPath();
    ctx.moveTo(cx - beamW * 0.5, tailTipY);
    ctx.lineTo(cx - beamW * 0.4, headTipY + beamW * 0.35);
    ctx.lineTo(cx, headTipY);
    ctx.lineTo(cx + beamW * 0.4, headTipY + beamW * 0.35);
    ctx.lineTo(cx + beamW * 0.5, tailTipY);
    ctx.closePath();
    var bg = ctx.createLinearGradient(cx - beamW * 0.5, 0, cx + beamW * 0.5, 0);
    bg.addColorStop(0, '#5A6068'); bg.addColorStop(0.5, '#33383D'); bg.addColorStop(1, '#1E2124');
    ctx.fillStyle = bg; ctx.fill();
    ctx.strokeStyle = 'rgba(12,12,12,0.9)'; ctx.lineWidth = Math.max(1.4, minWH * 0.014); ctx.stroke();
    ctx.strokeStyle = 'rgba(217,165,32,0.85)'; ctx.lineWidth = Math.max(1.2, minWH * 0.012);
    ctx.beginPath(); ctx.moveTo(cx, tailTipY - minWH * 0.03); ctx.lineTo(cx, headTipY + beamW * 0.5); ctx.stroke();
    L.disc(ctx, cx, pivotY, beamW * 0.32, '#C9A227', { hi: 45, lo: 25, outlineWidth: 1.4 }); // brass pivot bolt

    // ---- counterweight block riding the beam's tail end. ----
    L.panel(ctx, cx - beamW * 0.62, tailTipY - minWH * 0.045, beamW * 1.24, minWH * 0.07, '#2A2E32', { r: minWH * 0.014, hi: 14, lo: 24 });

    // ---- horsehead at the animated head tip. ----
    drawHorseHead(ctx, cx, headTipY, minWH * 0.3);

    // ---- bridle cable: horsehead nose -> polished rod into the well. ----
    ctx.strokeStyle = '#1C1C1C'; ctx.lineWidth = Math.max(1.4, minWH * 0.013);
    ctx.beginPath(); ctx.moveTo(cx, headTipY); ctx.lineTo(cx, wellY - wellR * 0.1); ctx.stroke();
  }

  // ---------------------------------------------------------------------
  // Oil refinery (5x5). Inputs south edge x=1,3 (fin[0],fin[1]); outputs north edge x=0,2,4
  // (fout[0..2]). Three tall distillation towers + two horizontal tanks on a raised deck, an
  // overhead pipe rack feeding the output header, walkway grating, a gas-flare stack that
  // ignites (animated flame + warm tower lights) while opts.working, dark/unlit when idle.
  // ---------------------------------------------------------------------
  function paintOilRefinery(ctx, W, H, frame, dir, def, type, opts) {
    var working = !!(opts && opts.working);
    var i;
    L.foundation(ctx, W, H, '#54585A');
    L.panel(ctx, W * 0.05, H * 0.08, W * 0.9, H * 0.84, '#61666A', { r: W * 0.015, hi: 10, lo: 18 });

    // ---- fluid ports ----
    var inXs = [1.5 / 5 * W, 3.5 / 5 * W];
    var outXs = [0.5 / 5 * W, 2.5 / 5 * W, 4.5 / 5 * W];
    var nub = W * 0.045, headerY = H * 0.1;
    ctx.strokeStyle = '#6E7A82';
    for (i = 0; i < inXs.length; i++) {
      ctx.lineWidth = nub * 0.7;
      ctx.beginPath(); ctx.moveTo(inXs[i], H); ctx.lineTo(inXs[i], H * 0.82); ctx.stroke();
      L.pipeNub(ctx, inXs[i], H, 2, nub);
    }
    ctx.lineWidth = nub * 0.55;
    ctx.beginPath(); ctx.moveTo(outXs[0], headerY); ctx.lineTo(outXs[2], headerY); ctx.stroke();
    for (i = 0; i < outXs.length; i++) {
      ctx.beginPath(); ctx.moveTo(outXs[i], 0); ctx.lineTo(outXs[i], headerY); ctx.stroke();
      L.pipeNub(ctx, outXs[i], 0, 0, nub);
    }

    // ---- distillation towers (west side) ----
    var towers = [
      { x: 0.18 * W, w: 0.1 * W, top: 0.18 * H, base: 0.84 * H },
      { x: 0.32 * W, w: 0.11 * W, top: 0.12 * H, base: 0.84 * H },
      { x: 0.46 * W, w: 0.095 * W, top: 0.24 * H, base: 0.84 * H },
    ];
    for (i = 0; i < towers.length; i++) {
      var t = towers[i], th = t.base - t.top;
      L.cylinder(ctx, t.x - t.w / 2, t.top, t.w, th, '#8C979E', false, { r: t.w * 0.14 });
      L.disc(ctx, t.x, t.top, t.w * 0.5, '#7C8790', { hi: 40, lo: 30 });
      L.hazardStripe(ctx, t.x - t.w / 2, t.base - th * 0.08, t.w, th * 0.05, t.w * 0.14);
      L.rivets(ctx, [[t.x - t.w * 0.3, t.top + th * 0.3], [t.x + t.w * 0.3, t.top + th * 0.3],
        [t.x - t.w * 0.3, t.top + th * 0.62], [t.x + t.w * 0.3, t.top + th * 0.62]], t.w * 0.05);
      ctx.strokeStyle = '#6E7A82'; ctx.lineWidth = t.w * 0.16;
      ctx.beginPath(); ctx.moveTo(t.x, t.top); ctx.lineTo(t.x, headerY); ctx.stroke();
      ctx.fillStyle = working ? '#FFCB7A' : '#3A3E42';
      ctx.beginPath(); ctx.arc(t.x, t.top + th * 0.14, t.w * 0.09, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#141414'; ctx.lineWidth = 1; ctx.stroke();
      if (working) L.glow(ctx, t.x, t.top + th * 0.14, t.w * 0.5, '#FFCB7A', 0.5);
    }

    // ---- horizontal storage tanks (east side) ----
    var tanks = [
      { x: 0.64 * W, y: 0.42 * H, w: 0.28 * W, h: 0.13 * H },
      { x: 0.62 * W, y: 0.62 * H, w: 0.3 * W, h: 0.14 * H },
    ];
    for (i = 0; i < tanks.length; i++) {
      var tk = tanks[i];
      L.cylinder(ctx, tk.x, tk.y, tk.w, tk.h, '#6C7268', true, { r: tk.h * 0.5 });
      L.disc(ctx, tk.x, tk.y + tk.h / 2, tk.h / 2, '#5C6258', { hi: 40, lo: 30 });
      L.disc(ctx, tk.x + tk.w, tk.y + tk.h / 2, tk.h / 2, '#5C6258', { hi: 40, lo: 30 });
    }

    // walkway grating between the towers and tanks.
    ctx.strokeStyle = 'rgba(0,0,0,0.14)'; ctx.lineWidth = 1;
    for (var gy = H * 0.3; gy < H * 0.84; gy += H * 0.05) { ctx.beginPath(); ctx.moveTo(W * 0.07, gy); ctx.lineTo(W * 0.56, gy); ctx.stroke(); }

    // ---- gas flare (south-east corner) ----
    var flx = W * 0.87, flBase = H * 0.86, flTop = H * 0.28;
    L.cylinder(ctx, flx - W * 0.018, flTop, W * 0.036, flBase - flTop, '#3A3E42', false, { r: W * 0.01 });
    L.panel(ctx, flx - W * 0.05, flBase, W * 0.1, H * 0.05, '#454C54', { r: W * 0.01 });
    if (working) {
      var flick = 0.6 + 0.4 * Math.sin(frame * 1.7);
      L.glow(ctx, flx, flTop, W * 0.14, '#FF8A2A', 0.35 * flick);
      ctx.save(); ctx.translate(flx, flTop);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(-W * 0.03 * flick, -H * 0.05, -W * 0.012, -H * (0.09 + 0.02 * flick));
      ctx.quadraticCurveTo(0, -H * 0.12, W * 0.012, -H * (0.09 + 0.02 * flick));
      ctx.quadraticCurveTo(W * 0.03 * flick, -H * 0.05, 0, 0);
      ctx.closePath();
      var fg = ctx.createLinearGradient(0, 0, 0, -H * 0.12);
      fg.addColorStop(0, '#FFD27A'); fg.addColorStop(0.5, '#FF8A2A'); fg.addColorStop(1, 'rgba(255,138,42,0)');
      ctx.fillStyle = fg; ctx.fill();
      ctx.restore();
    }
  }

  // ---------------------------------------------------------------------
  // Chemical plant (3x3). Inputs south edge x=0,2; outputs north edge x=0,2. Chamfered housing,
  // a glass dome over a two-blade mixer that spins over a 16-frame loop + rising bubbles while
  // opts.working; idle -> mixer frozen, liquid dim, dome flat, lights off.
  // ---------------------------------------------------------------------
  function paintChemicalPlant(ctx, W, H, frame, dir, def, type, opts) {
    var working = !!(opts && opts.working);
    L.foundation(ctx, W, H, '#54585A');
    var bx = W * 0.1, by = H * 0.14, bw = W * 0.8, bh = H * 0.72, cut = Math.min(bw, bh) * 0.18;
    chamferPanel(ctx, bx, by, bw, bh, cut, '#5E6A56', { lo: 32 });
    L.rivets(ctx, [[bx + cut * 0.5, by + cut * 0.5], [bx + bw - cut * 0.5, by + cut * 0.5],
      [bx + cut * 0.5, by + bh - cut * 0.5], [bx + bw - cut * 0.5, by + bh - cut * 0.5]], W * 0.018);

    // ports: south x=0,2 (inputs), north x=0,2 (outputs), with short risers into the housing.
    var px0 = 0.5 / 3 * W, px2 = 2.5 / 3 * W, nub = W * 0.07;
    L.pipeNub(ctx, px0, H, 2, nub); L.pipeNub(ctx, px2, H, 2, nub);
    L.pipeNub(ctx, px0, 0, 0, nub); L.pipeNub(ctx, px2, 0, 0, nub);
    ctx.strokeStyle = '#6E7A82'; ctx.lineWidth = nub * 0.6;
    [px0, px2].forEach(function (x) {
      ctx.beginPath(); ctx.moveTo(x, H); ctx.lineTo(x, by + bh); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, by); ctx.stroke();
    });

    // glass dome over the mixer, centred in the upper housing.
    var cx = W / 2, cy = by + bh * 0.38, R = Math.min(W, H) * 0.26;
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
    var liqColor = working ? '#6FCB6A' : '#3A4A3A';
    ctx.fillStyle = L.rgba(liqColor, working ? 0.55 : 0.3);
    ctx.fillRect(cx - R, cy + R * 0.08, R * 2, R * 1.2);
    if (working) {
      for (var bI = 0; bI < 5; bI++) {
        var bt = (((frame | 0) + bI * 3) % 16) / 16;
        var bx2 = cx + Math.sin(bI * 2.1) * R * 0.5, by2 = cy + R * 0.5 - bt * R * 0.9;
        ctx.fillStyle = 'rgba(255,255,255,' + (0.5 * (1 - bt)).toFixed(2) + ')';
        ctx.beginPath(); ctx.arc(bx2, by2, R * 0.05 * (1 + bt), 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
    var dg = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.05, cx, cy, R);
    dg.addColorStop(0, 'rgba(255,255,255,0.35)');
    dg.addColorStop(0.6, working ? 'rgba(160,225,240,0.15)' : 'rgba(120,150,160,0.12)');
    dg.addColorStop(1, 'rgba(90,120,130,0.08)');
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fillStyle = dg; ctx.fill();
    ctx.strokeStyle = 'rgba(12,12,12,0.6)'; ctx.lineWidth = Math.max(1.5, W * 0.02); ctx.stroke();

    // mixer shaft + blades, visible through the glass; spins only while working.
    var mAngle = working ? (frame / 16) * Math.PI * 2 : 0;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(mAngle);
    ctx.strokeStyle = '#8C979E'; ctx.lineWidth = Math.max(1.6, W * 0.02); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-R * 0.55, 0); ctx.lineTo(R * 0.55, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -R * 0.4); ctx.lineTo(0, R * 0.4); ctx.stroke();
    ctx.restore();
    L.disc(ctx, cx, cy, R * 0.1, '#454C54', { outlineWidth: 1.2 });

    // status lights.
    var lampY = by + cut * 0.7;
    [[bx + cut * 0.5, lampY], [bx + bw - cut * 0.5, lampY]].forEach(function (p) {
      if (working) L.glow(ctx, p[0], p[1], W * 0.05, '#6FE68A', 0.5);
      ctx.fillStyle = working ? '#6FE68A' : '#3A4038';
      ctx.beginPath(); ctx.arc(p[0], p[1], W * 0.016, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(12,12,12,0.85)'; ctx.lineWidth = 1; ctx.stroke();
    });
  }

  // ---------------------------------------------------------------------
  // Storage tank (3x3). Big round tank on a square base, pipe stubs at the centre of all four
  // edges, a small level window tinted by opts.fluid's colour (grey fallback).
  // ---------------------------------------------------------------------
  function paintStorageTank(ctx, W, H, frame, dir, def, type, opts) {
    var color = fluidColor(opts && opts.fluid);
    L.foundation(ctx, W, H, '#57595A');
    var bx = W * 0.12, by = H * 0.12, bw = W * 0.76, bh = H * 0.76;
    L.panel(ctx, bx, by, bw, bh, '#5E6268', { r: W * 0.03, hi: 14, lo: 22 });
    L.rivets(ctx, [[bx + bw * 0.06, by + bh * 0.06], [bx + bw * 0.94, by + bh * 0.06],
      [bx + bw * 0.06, by + bh * 0.94], [bx + bw * 0.94, by + bh * 0.94]], W * 0.02);

    var cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.36;
    L.disc(ctx, cx, cy, R, '#8C979E', { hi: 40, lo: 34, outlineWidth: Math.max(1.6, W * 0.02) });
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
    ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = Math.max(1, W * 0.012);
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.62, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    L.disc(ctx, cx, cy, R * 0.28, '#9AA3A8', { hi: 55, lo: 20, outlineWidth: 1.4 });

    // level window, tinted by the carried fluid.
    var ww = R * 0.5, wh = R * 0.32, wx = cx - ww / 2, wy = cy + R * 0.32;
    L.inset(ctx, wx, wy, ww, wh, '#141618', wh * 0.2);
    ctx.save();
    L.roundRectPath(ctx, wx + ww * 0.08, wy + wh * 0.12, ww * 0.84, wh * 0.76, wh * 0.14); ctx.clip();
    ctx.fillStyle = L.rgba(color, 0.75); ctx.fillRect(wx, wy + wh * 0.4, ww, wh);
    ctx.fillStyle = L.rgba(color, 0.35); ctx.fillRect(wx, wy, ww, wh * 0.4);
    ctx.restore();
    ctx.strokeStyle = 'rgba(12,12,12,0.7)'; ctx.lineWidth = 1.2;
    L.roundRectPath(ctx, wx + ww * 0.08, wy + wh * 0.12, ww * 0.84, wh * 0.76, wh * 0.14); ctx.stroke();

    // pipe connections at the centre of all four edges, with short risers to the tank body.
    var nub = Math.min(W, H) * 0.11;
    L.pipeNub(ctx, W * 0.5, 0, 0, nub);
    L.pipeNub(ctx, W, H * 0.5, 1, nub);
    L.pipeNub(ctx, W * 0.5, H, 2, nub);
    L.pipeNub(ctx, 0, H * 0.5, 3, nub);
    ctx.strokeStyle = '#6E7A82'; ctx.lineWidth = nub * 0.5;
    ctx.beginPath(); ctx.moveTo(W * 0.5, 0); ctx.lineTo(W * 0.5, cy - R); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W, H * 0.5); ctx.lineTo(cx + R, H * 0.5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W * 0.5, H); ctx.lineTo(W * 0.5, cy + R); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, H * 0.5); ctx.lineTo(cx - R, H * 0.5); ctx.stroke();
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
  F.sprites.definePainter('oil-refinery', paintOilRefinery);
  F.sprites.definePainter('chemical-plant', paintChemicalPlant);
  F.sprites.definePainter('storage-tank', paintStorageTank);
})();
