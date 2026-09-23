// 62-sprites-heavy.js — higher-detail procedural building art for a subset of production
// entities (stone-furnace, steel-furnace, burner/electric mining drill, boiler, steam-engine,
// offshore-pump). Registers replacement painters via F.sprites.definePainter (design/
// BUILDING-ART.md's contract); does not edit src/60-sprites.js. Every painter draws in local
// "facing north" coordinates over a w0×h0 px box (px = tiles × 64) — the caller rotates the
// canvas for dir 1..3 and adds the cast shadow, so nothing here special-cases dir or draws its
// own drop shadow. Light comes from the top-left throughout, per the style guide.
(function () {
  'use strict';
  if (!F.sprites || !F.sprites.definePainter) return;
  var L = F.sprites.lib;

  // ---------------------------------------------------------------------
  // Small local helpers (kept in this file so 60-sprites.js stays untouched).
  // ---------------------------------------------------------------------
  // Deterministic per-type RNG generator (never Math.random) — same pile/brick/rivet layout
  // every time a given entity type is painted, per the brief's "varied but deterministic" rule.
  function seed(type, a, b) { return F.rng.local(F.util.hashStr(type), a | 0, b | 0); }
  // Smooth 0..1 pulse driven by the working-animation frame counter (0..15), used for fire/vent
  // flicker and grate glow. base..base+amp range.
  function flicker(frame, speed, base, amp) { return base + amp * (0.5 + 0.5 * Math.sin((frame | 0) * speed)); }

  // Octagon/chamfered-rect path (cut corners) — used for the electric drill's housing.
  function chamferPath(ctx, x, y, w, h, c) {
    ctx.beginPath();
    ctx.moveTo(x + c, y); ctx.lineTo(x + w - c, y); ctx.lineTo(x + w, y + c);
    ctx.lineTo(x + w, y + h - c); ctx.lineTo(x + w - c, y + h); ctx.lineTo(x + c, y + h);
    ctx.lineTo(x, y + h - c); ctx.lineTo(x, y + c); ctx.closePath();
  }
  // Chamfered panel: same top-lit gradient + rim-light + outline treatment as L.panel, but on
  // the cut-corner silhouette above instead of a rounded rect.
  function chamferPanel(ctx, x, y, w, h, c, color, opts) {
    opts = opts || {};
    var g = ctx.createLinearGradient(x, y, x + w * 0.35, y + h);
    g.addColorStop(0, L.lighten(color, opts.hi != null ? opts.hi : 26));
    g.addColorStop(0.45, color);
    g.addColorStop(1, L.darken(color, opts.lo != null ? opts.lo : 30));
    chamferPath(ctx, x, y, w, h, c); ctx.fillStyle = g; ctx.fill();
    ctx.save(); chamferPath(ctx, x, y, w, h, c); ctx.clip();
    var lw = Math.max(1, Math.min(w, h) * 0.06);
    ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = lw * 2;
    ctx.beginPath(); ctx.moveTo(x, y + h - c); ctx.lineTo(x, y + c); ctx.lineTo(x + c, y); ctx.lineTo(x + w - c, y); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.30)';
    ctx.beginPath(); ctx.moveTo(x + c, y + h); ctx.lineTo(x + w - c, y + h); ctx.lineTo(x + w, y + h - c); ctx.lineTo(x + w, y + c); ctx.stroke();
    ctx.restore();
    chamferPath(ctx, x, y, w, h, c);
    ctx.strokeStyle = 'rgba(12,12,12,0.9)'; ctx.lineWidth = Math.max(1.5, Math.min(w, h) * 0.03); ctx.stroke();
  }

  // Rounded-arch path (furnace fire mouth): straight jambs rising to a semicircular head.
  function archPath(ctx, cx, topY, w, h) {
    var springY = topY + h * 0.42, r = w * 0.5;
    ctx.beginPath();
    ctx.moveTo(cx - r, topY + h);
    ctx.lineTo(cx - r, springY);
    ctx.arc(cx, springY, r, Math.PI, 0, false);
    ctx.lineTo(cx + r, topY + h);
    ctx.closePath();
  }

  // Irregular stone-block pile clipped to a squat rounded-dome silhouette (stone-furnace body).
  // Deterministic per (type) via the rng passed in — mortar gaps come from randomly-skipped
  // cells plus the padding between blocks, no separate mortar-line pass needed.
  function stoneDomeMass(ctx, W, H, rng) {
    var x = W * 0.05, y = H * 0.16, w = W * 0.9, h = H * 0.78, r = Math.min(w, h) * 0.4;
    L.roundRectPath(ctx, x, y, w, h, r); ctx.fillStyle = '#463F36'; ctx.fill();
    ctx.save(); L.roundRectPath(ctx, x, y, w, h, r); ctx.clip();
    var palette = ['#948A78', '#8C8072', '#A69A82', '#7D7364', '#9C917C', '#877C6C'];
    var cols = 4, rows = 4, cw = w / cols, ch = h / rows, ix, iy;
    for (iy = 0; iy < rows; iy++) {
      for (ix = 0; ix < cols; ix++) {
        if (rng() < 0.12) continue; // occasional gap — mortar shows through
        var jx = (rng() - 0.5) * cw * 0.3, jy = (rng() - 0.5) * ch * 0.3;
        var bx = x + ix * cw + cw * 0.09 + jx, by = y + iy * ch + ch * 0.09 + jy;
        var bw = cw * 0.82 + rng() * cw * 0.06, bh = ch * 0.82 + rng() * ch * 0.06;
        var col = palette[(rng() * palette.length) | 0];
        L.rectBevel(ctx, bx, by, bw, bh, col, {
          light: L.lighten(col, 22), dark: L.darken(col, 26),
          outlineColor: 'rgba(30,26,20,0.6)', outlineWidth: 1
        });
      }
    }
    var wash = ctx.createLinearGradient(x, y, x, y + h);
    wash.addColorStop(0, 'rgba(255,255,255,0.16)'); wash.addColorStop(0.5, 'rgba(255,255,255,0)'); wash.addColorStop(1, 'rgba(0,0,0,0.20)');
    ctx.fillStyle = wash; ctx.fillRect(x, y, w, h);
    ctx.restore();
    L.roundRectPath(ctx, x, y, w, h, r);
    ctx.strokeStyle = 'rgba(12,12,12,0.85)'; ctx.lineWidth = Math.max(1.5, Math.min(w, h) * 0.025); ctx.stroke();
  }

  // Arched fire mouth with coals + flicker/glow (working) or a faint ember (idle) + warm spill
  // onto the surrounding stonework — shared shape/behaviour, only the working cue differs.
  function fireMouth(ctx, cx, topY, w, h, working, frame) {
    archPath(ctx, cx, topY, w, h); ctx.fillStyle = '#1C1712'; ctx.fill();
    ctx.save(); archPath(ctx, cx, topY, w, h); ctx.clip();
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(cx - w / 2, topY, w * 0.3, h);
    if (working) {
      var flick = flicker(frame, 1.35, 0.55, 0.35);
      L.glow(ctx, cx, topY + h * 0.8, w * 0.9, '#FFB25A', flick * 0.9);
      L.glow(ctx, cx, topY + h * 0.8, w * 0.42, '#FFE9A8', flick);
      var i;
      for (i = 0; i < 4; i++) {
        var ex = cx + (i - 1.5) * w * 0.15, ey = topY + h * 0.86;
        ctx.fillStyle = (i % 2) ? '#FF8A2A' : '#FFD27A';
        ctx.beginPath(); ctx.arc(ex, ey, w * 0.05, 0, Math.PI * 2); ctx.fill();
      }
    } else {
      ctx.fillStyle = 'rgba(150,55,20,0.28)';
      ctx.beginPath(); ctx.arc(cx, topY + h * 0.82, w * 0.07, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    archPath(ctx, cx, topY, w, h); ctx.strokeStyle = '#0C0A08'; ctx.lineWidth = Math.max(1.5, w * 0.045); ctx.stroke();
    if (working) L.glow(ctx, cx, topY + h * 0.98, w * 1.3, '#FF8A2A', 0.14 + 0.1 * Math.sin((frame | 0) * 1.35));
  }

  // ---------------------------------------------------------------------
  // stone-furnace (2x2, not rotatable): rounded pile of stone blocks, arched fire mouth.
  // ---------------------------------------------------------------------
  function paintStoneFurnaceHeavy(ctx, W, H, frame, dir, def, type, opts) {
    var working = !!(opts && opts.working);
    var rng = seed(type, 1, 9);
    stoneDomeMass(ctx, W, H, rng);
    fireMouth(ctx, W * 0.5, H * 0.5, W * 0.4, H * 0.42, working, frame);
    if (working) L.smokePuffs(ctx, W * 0.5, H * 0.14, frame, W * 0.4);
  }

  // ---------------------------------------------------------------------
  // steel-furnace (2x2): riveted steel housing, brick-lined top opening, two glowing vents,
  // small exhaust chimney.
  // ---------------------------------------------------------------------
  function paintSteelFurnaceHeavy(ctx, W, H, frame, dir, def, type, opts) {
    var working = !!(opts && opts.working);
    var col = L.entColors(def)[0] || '#5E6873';
    L.foundation(ctx, W, H, L.darken(col, 6));
    L.panel(ctx, W * 0.05, H * 0.06, W * 0.9, H * 0.86, col, { r: W * 0.07 });
    L.rivets(ctx, [[W * 0.12, H * 0.14], [W * 0.88, H * 0.14], [W * 0.12, H * 0.86], [W * 0.88, H * 0.86],
      [W * 0.5, H * 0.1], [W * 0.5, H * 0.9]], W * 0.02);
    // Top opening: heat-resistant brick lining visible looking down into the furnace.
    var ox = W * 0.28, oy = H * 0.13, ow = W * 0.44, oh = H * 0.22, rr = W * 0.03;
    L.inset(ctx, ox, oy, ow, oh, '#241C16', rr);
    ctx.save(); L.roundRectPath(ctx, ox, oy, ow, oh, rr); ctx.clip();
    var brick1 = '#8A4A32', brick2 = '#6E3A26', bw = ow / 5, bh = oh / 2, r, c;
    for (r = 0; r < 2; r++) { for (c = 0; c < 5; c++) { ctx.fillStyle = ((r + c) % 2) ? brick1 : brick2; ctx.fillRect(ox + c * bw + 1, oy + r * bh + 1, bw - 2, bh - 2); } }
    var openA = working ? flicker(frame, 1.2, 0.5, 0.4) : 0.08;
    L.glow(ctx, ox + ow / 2, oy + oh / 2, ow * 0.65, '#FF9A3C', openA);
    ctx.restore();
    L.roundRectPath(ctx, ox, oy, ow, oh, rr); ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 1.5; ctx.stroke();
    // Two glowing side vents.
    var vy = H * 0.5, vw = W * 0.1, vh = H * 0.28;
    L.vent(ctx, W * 0.07, vy - vh / 2, vw, vh, 4, true);
    L.vent(ctx, W * 0.83, vy - vh / 2, vw, vh, 4, true);
    if (working) {
      var va = flicker(frame, 1.5, 0.32, 0.34);
      L.glow(ctx, W * 0.07 + vw / 2, vy, vw * 1.7, '#FF7A2A', va);
      L.glow(ctx, W * 0.83 + vw / 2, vy, vw * 1.7, '#FF7A2A', va);
    }
    // Small exhaust chimney, back corner — smokes while working.
    L.rectBevel(ctx, W * 0.74, 0, W * 0.12, H * 0.14, '#33363A', { dark: '#1C1E20', light: '#4A4E52' });
    if (working) L.smokePuffs(ctx, W * 0.8, 0, frame, W * 0.5);
  }

  // ---------------------------------------------------------------------
  // burner-mining-drill (2x2, rotatable): iron box on skids, bobbing/spinning bit near the
  // output (left column, north), firebox glow, smoking chimney.
  // ---------------------------------------------------------------------
  function paintBurnerDrillHeavy(ctx, W, H, frame, dir, def, type, opts) {
    var working = !!(opts && opts.working);
    var col = L.entColors(def)[0] || '#6E6A60';
    // Skids poking out from under the box.
    ctx.fillStyle = '#241F1A';
    ctx.fillRect(0, H * 0.86, W * 0.34, H * 0.08); ctx.fillRect(W * 0.62, H * 0.86, W * 0.34, H * 0.08);
    ctx.strokeStyle = '#141210'; ctx.lineWidth = 1;
    ctx.strokeRect(0, H * 0.86, W * 0.34, H * 0.08); ctx.strokeRect(W * 0.62, H * 0.86, W * 0.34, H * 0.08);
    // Main iron box.
    L.panel(ctx, W * 0.06, H * 0.18, W * 0.88, H * 0.68, col, { r: W * 0.05 });
    L.rivets(ctx, [[W * 0.14, H * 0.26], [W * 0.86, H * 0.26], [W * 0.14, H * 0.78], [W * 0.86, H * 0.78]], W * 0.02);
    // Firebox window.
    var fx = W * 0.68, fy = H * 0.58, fr = W * 0.09;
    L.inset(ctx, fx - fr, fy - fr * 0.7, fr * 2, fr * 1.4, '#1A1410', fr * 0.3);
    var fireA = working ? flicker(frame, 1.4, 0.5, 0.4) : 0.14;
    L.glow(ctx, fx, fy, fr * 1.6, '#E9781E', fireA);
    // Small chimney, smokes while working.
    L.rectBevel(ctx, W * 0.72, H * 0.02, W * 0.13, H * 0.18, '#3A342C', { dark: '#1C1810', light: '#4E4638' });
    if (working) L.smokePuffs(ctx, W * 0.785, H * 0.02, frame, W * 0.45);
    // Drill head/bit near the output (left column, north) — bobs and spins while working.
    var bob = working ? Math.sin((frame / 16) * Math.PI * 2) * H * 0.03 : 0;
    var spin = working ? (frame / 16) * Math.PI * 2 : 0;
    var hx = W * 0.28, hy = H * 0.22 + bob, bitLen = H * 0.24;
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(spin);
    var g = ctx.createLinearGradient(0, -bitLen * 0.5, 0, bitLen * 0.5);
    g.addColorStop(0, L.lighten('#B8BEC4', 10)); g.addColorStop(0.5, '#8C939A'); g.addColorStop(1, L.darken('#8C939A', 30));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(0, -bitLen * 0.5); ctx.lineTo(W * 0.055, bitLen * 0.15); ctx.lineTo(0, bitLen * 0.5); ctx.lineTo(-W * 0.055, bitLen * 0.15); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#141210'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-W * 0.02, -bitLen * 0.3); ctx.lineTo(W * 0.02, bitLen * 0.3); ctx.stroke();
    ctx.restore();
    // Output lip, top-left (def.drill.output = left column, north).
    L.arrowShape(ctx, W * 0.22, H * 0.08, W * 0.08, working ? '#E8B31E' : L.darken('#E8B31E', 25));
  }

  // ---------------------------------------------------------------------
  // electric-mining-drill (3x3, rotatable): chamfered steel body on 4 corner legs, hazard
  // stripe, centre drill head with 3-4 spinning arms, north-centre output chute, status light.
  // ---------------------------------------------------------------------
  function paintElectricDrillHeavy(ctx, W, H, frame, dir, def, type, opts) {
    var working = !!(opts && opts.working);
    var col = L.entColors(def)[0] || '#5E6C7A';
    L.foundation(ctx, W, H, '#4E5154');
    var legs = [[0.1, 0.1], [0.9, 0.1], [0.1, 0.9], [0.9, 0.9]], li;
    for (li = 0; li < legs.length; li++) {
      var p = legs[li];
      L.rectBevel(ctx, W * p[0] - W * 0.045, H * p[1] - H * 0.045, W * 0.09, H * 0.09, '#33383D', { dark: '#1C1E20', light: '#454C52' });
    }
    var bx = W * 0.1, by = H * 0.1, bw = W * 0.8, bh = H * 0.8, chamfer = Math.min(bw, bh) * 0.22;
    chamferPanel(ctx, bx, by, bw, bh, chamfer, col, {});
    L.hazardStripe(ctx, bx + bw * 0.06, by + bh * 0.8, bw * 0.88, bh * 0.1, bw * 0.045);
    // Status light: green + glow while working, dark grey idle.
    var lx = bx + bw * 0.86, ly = by + bh * 0.14;
    ctx.fillStyle = working ? '#3FCB63' : '#2A2A2A';
    ctx.beginPath(); ctx.arc(lx, ly, W * 0.025, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#141414'; ctx.lineWidth = 1; ctx.stroke();
    if (working) L.glow(ctx, lx, ly, W * 0.09, '#5EE68A', 0.7);
    // Output chute, north edge, centre column.
    var chx = W * 0.5, chw = W * 0.22, chh = H * 0.1;
    ctx.fillStyle = '#2A2018'; ctx.fillRect(chx - chw / 2, 0, chw, chh);
    ctx.strokeStyle = '#141210'; ctx.lineWidth = 1.5; ctx.strokeRect(chx - chw / 2, 0, chw, chh);
    ctx.fillStyle = working ? 'rgba(217,165,32,0.5)' : 'rgba(217,165,32,0.15)';
    ctx.fillRect(chx - chw * 0.4, chh * 0.15, chw * 0.8, chh * 0.4);
    // Centre drill head: hub + 4 arms, rotates only while working, seamless over 16 frames.
    var cx = W / 2, cy = H / 2, hubR = Math.min(W, H) * 0.1, armR = Math.min(W, H) * 0.32;
    var angle = working ? (frame / 16) * Math.PI * 2 : 0;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(angle);
    var arms = 4, ai;
    for (ai = 0; ai < arms; ai++) {
      var a = ai / arms * Math.PI * 2;
      ctx.save(); ctx.rotate(a);
      var ag = ctx.createLinearGradient(0, -hubR * 0.3, 0, -armR);
      ag.addColorStop(0, '#B8BEC4'); ag.addColorStop(1, '#5A6168');
      ctx.fillStyle = ag;
      ctx.beginPath();
      ctx.moveTo(-Math.min(W, H) * 0.035, -hubR * 0.3); ctx.lineTo(Math.min(W, H) * 0.035, -hubR * 0.3);
      ctx.lineTo(Math.min(W, H) * 0.018, -armR); ctx.lineTo(-Math.min(W, H) * 0.018, -armR); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#141210'; ctx.lineWidth = 1; ctx.stroke();
      ctx.restore();
    }
    L.disc(ctx, 0, 0, hubR, '#D9A520', { hi: 55, lo: 40 });
    ctx.restore();
  }

  // ---------------------------------------------------------------------
  // boiler (3x2, rotatable): horizontal cylindrical tank, front firebox with glowing grate,
  // chimney, water ports on the south row's west/east ends, steam output on the north edge.
  // ---------------------------------------------------------------------
  function paintBoilerHeavy(ctx, W, H, frame, dir, def, type, opts) {
    var working = !!(opts && opts.working);
    L.foundation(ctx, W, H, '#57595A');
    var tx = W * 0.1, ty = H * 0.14, tw = W * 0.72, th = H * 0.5;
    L.cylinder(ctx, tx, ty, tw, th, '#6B5A4A', true, {});
    L.disc(ctx, tx, ty + th / 2, th / 2, '#5A4C3E', { hi: 45, lo: 35 });
    L.disc(ctx, tx + tw, ty + th / 2, th / 2, '#5A4C3E', { hi: 45, lo: 35 });
    L.rivets(ctx, [[tx, ty + th * 0.25], [tx, ty + th * 0.75], [tx + tw, ty + th * 0.25], [tx + tw, ty + th * 0.75]], W * 0.016);
    // Firebox on the front face with a glowing grate when burning.
    var fx = W * 0.32, fy = ty + th * 0.86, fw = W * 0.36, fh = H * 0.24, frr = W * 0.02;
    L.panel(ctx, fx, fy, fw, fh, '#332A22', { r: frr, rim: false });
    var grateA = working ? flicker(frame, 1.3, 0.5, 0.4) : 0.1;
    ctx.save(); L.roundRectPath(ctx, fx + fw * 0.1, fy + fh * 0.15, fw * 0.8, fh * 0.7, fw * 0.05); ctx.clip();
    ctx.fillStyle = '#120E0A'; ctx.fillRect(fx, fy, fw, fh);
    var s;
    for (s = 0; s < 4; s++) { ctx.fillStyle = 'rgba(255,138,42,' + grateA.toFixed(2) + ')'; ctx.fillRect(fx + fw * 0.12, fy + fh * (0.2 + s * 0.18), fw * 0.76, fh * 0.08); }
    ctx.restore();
    L.roundRectPath(ctx, fx, fy, fw, fh, frr); ctx.strokeStyle = '#141210'; ctx.lineWidth = 1.5; ctx.stroke();
    if (working) L.glow(ctx, fx + fw / 2, fy + fh * 0.5, fw * 0.9, '#FF8A2A', grateA * 0.6);
    // Chimney with smoke while working.
    L.rectBevel(ctx, W * 0.74, 0, W * 0.1, H * 0.14, '#4A4038', { dark: '#241E18', light: '#5E5148' });
    if (working) L.smokePuffs(ctx, W * 0.79, 0, frame, W * 0.35);
    // Fluid connections: water in at the south row's west/east ends, steam out on the north edge.
    var nub = Math.min(W, H) * 0.2;
    L.pipeNub(ctx, W * 0.5, 0, 0, nub);
    L.pipeNub(ctx, 0, H * 0.75, 3, nub);
    L.pipeNub(ctx, W, H * 0.75, 1, nub);
  }

  // ---------------------------------------------------------------------
  // steam-engine (3x5, rotatable dirs 0/1): cylinder + piston/crosshead, big spinning flywheel,
  // steam connectors on the short north/south ends, riveted base frame.
  // ---------------------------------------------------------------------
  function paintSteamEngineHeavy(ctx, W, H, frame, dir, def, type, opts) {
    var working = !!(opts && opts.working);
    L.foundation(ctx, W, H, '#4E5154');
    L.rivets(ctx, [[W * 0.08, H * 0.04], [W * 0.92, H * 0.04], [W * 0.08, H * 0.96], [W * 0.92, H * 0.96],
      [W * 0.08, H * 0.5], [W * 0.92, H * 0.5]], W * 0.018);
    // Big steam cylinder, upper third, axis along the long (north-south) side.
    var cw = W * 0.34, ch = H * 0.32, cx = W * 0.5, cy = H * 0.06;
    L.cylinder(ctx, cx - cw / 2, cy, cw, ch, '#7A8590', false, {});
    L.disc(ctx, cx, cy, cw * 0.5, '#6B747E', { hi: 40, lo: 35 });
    // Flywheel, lower half — spins only while working, seamless over 16 frames.
    var fcx = W * 0.5, fcy = H * 0.68, fr = Math.min(W, H * 0.5) * 0.34;
    var pang = working ? (frame / 16) * Math.PI * 2 : 0;
    ctx.save(); ctx.translate(fcx, fcy); ctx.rotate(pang);
    var rimG = ctx.createRadialGradient(-fr * 0.3, -fr * 0.3, fr * 0.1, 0, 0, fr);
    rimG.addColorStop(0, '#8A939C'); rimG.addColorStop(0.75, '#5A6168'); rimG.addColorStop(1, '#33383D');
    ctx.fillStyle = rimG; ctx.beginPath(); ctx.arc(0, 0, fr, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3A3D40'; ctx.beginPath(); ctx.arc(0, 0, fr * 0.78, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#454C54'; ctx.lineWidth = Math.max(2, fr * 0.18);
    var si;
    for (si = 0; si < 6; si++) { var sa = si / 6 * Math.PI * 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(sa) * fr * 0.74, Math.sin(sa) * fr * 0.74); ctx.stroke(); }
    L.disc(ctx, 0, 0, fr * 0.22, '#8C979E', { hi: 50, lo: 35 });
    ctx.strokeStyle = '#141210'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, fr, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    // Piston rod + crosshead sliding between the cylinder and the flywheel, connecting rod to
    // a crank pin on the rim — driven by the same phase as the flywheel spin.
    var rodTopY = cy + ch, rodBotY = fcy - fr * 0.85, stroke = Math.sin(pang) * H * 0.045;
    var chY = (rodTopY + rodBotY) / 2 + stroke;
    ctx.strokeStyle = '#C9CDD0'; ctx.lineWidth = Math.max(2, W * 0.03); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx, rodTopY); ctx.lineTo(cx, chY); ctx.stroke();
    L.rectBevel(ctx, cx - W * 0.07, chY - H * 0.025, W * 0.14, H * 0.05, '#5A6168', { dark: '#2A2E32' });
    var pinAngle = pang - Math.PI / 2;
    var pinX = fcx + Math.cos(pinAngle) * fr * 0.74, pinY = fcy + Math.sin(pinAngle) * fr * 0.74;
    ctx.strokeStyle = '#9AA3A8'; ctx.lineWidth = Math.max(2, W * 0.022);
    ctx.beginPath(); ctx.moveTo(cx, chY); ctx.lineTo(pinX, pinY); ctx.stroke();
    // Steam pipe connectors on the short north/south ends.
    var nub = Math.min(W, H) * 0.15;
    L.pipeNub(ctx, W * 0.5, 0, 0, nub);
    L.pipeNub(ctx, W * 0.5, H, 2, nub);
  }

  // ---------------------------------------------------------------------
  // offshore-pump (1x1, rotatable): intake grate facing north (the water side), pump housing +
  // motor, pipe outlet on the south edge.
  // ---------------------------------------------------------------------
  function paintOffshorePumpHeavy(ctx, W, H, frame, dir, def, type, opts) {
    var col = L.entColors(def)[0] || '#6C8C9C';
    // Intake nozzle/grate reaching the north edge.
    var gx = W * 0.2, gw = W * 0.6, gh = H * 0.32;
    ctx.fillStyle = '#274A5A'; ctx.fillRect(gx, 0, gw, gh);
    L.vent(ctx, gx, 0, gw, gh, 3, true);
    ctx.strokeStyle = '#12242C'; ctx.lineWidth = 1.5; ctx.strokeRect(gx, 0, gw, gh);
    // Pump housing + motor.
    L.panel(ctx, W * 0.14, H * 0.3, W * 0.72, H * 0.42, col, { r: W * 0.08 });
    L.disc(ctx, W * 0.5, H * 0.32, W * 0.14, L.lighten(col, 10), { hi: 50, lo: 35 });
    L.rivets(ctx, [[W * 0.24, H * 0.62], [W * 0.76, H * 0.62]], W * 0.03);
    // Pipe outlet, south edge.
    L.pipeNub(ctx, W * 0.5, H, 2, W * 0.36);
  }

  F.sprites.definePainter(['stone-furnace'], paintStoneFurnaceHeavy);
  F.sprites.definePainter(['steel-furnace'], paintSteelFurnaceHeavy);
  F.sprites.definePainter(['burner-mining-drill'], paintBurnerDrillHeavy);
  F.sprites.definePainter(['electric-mining-drill'], paintElectricDrillHeavy);
  F.sprites.definePainter(['boiler'], paintBoilerHeavy);
  F.sprites.definePainter(['steam-engine'], paintSteamEngineHeavy);
  F.sprites.definePainter(['offshore-pump'], paintOffshorePumpHeavy);
})();
