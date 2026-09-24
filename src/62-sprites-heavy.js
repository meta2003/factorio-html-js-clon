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

  // Small smoke loop for a stack whose mouth is at (cx, cy). The sprite canvas ends at the
  // building's footprint, so puffs rise only through the space above the mouth and fade out
  // before reaching the top edge (a puff cut off by the edge reads as a pale rectangle).
  // (L.smokePuffs' `scale` is a radius multiplier; the old sprite-sized values filled the
  // whole canvas with translucent grey, a light box around every working building.)
  function stackSmoke(ctx, cx, cy, frame, W) {
    for (var i = 0; i < 3; i++) {
      var t = (((frame | 0) + i * 5) % 16) / 16;
      var r = W * (0.025 + t * 0.045);
      var room = Math.max(0, cy - r);
      var y = cy - t * room * 0.9, x = cx + Math.sin(i * 2.4 + t * 2) * W * 0.03;
      var edgeFade = Math.min(1, Math.max(0, (y - r) / (W * 0.04)));
      var a = 0.38 * (1 - t) * (cy > W * 0.06 ? edgeFade : 1);
      if (a <= 0.02) continue;
      ctx.fillStyle = 'rgba(205,205,200,' + a.toFixed(2) + ')';
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
  }

  // Fire inside a dark opening, clipped to whatever path the caller set up: glowing coal bed,
  // three flickering flame tongues and a hot core. `k` animates (working frame 0..15).
  function flames(ctx, cx, baseY, w, h, frame) {
    var f = frame | 0;
    L.glow(ctx, cx, baseY - h * 0.1, w * 0.95, '#FF7A1E', flicker(f, 1.35, 0.55, 0.3));
    for (var i = 0; i < 3; i++) {
      var fx = cx + (i - 1) * w * 0.26, fh = h * (0.55 + 0.25 * Math.sin(f * 0.9 + i * 2.1)) * (i === 1 ? 1.15 : 0.85);
      var fw = w * (i === 1 ? 0.2 : 0.15), sway = Math.sin(f * 0.7 + i * 1.7) * w * 0.04;
      var g = ctx.createLinearGradient(fx, baseY, fx, baseY - fh);
      g.addColorStop(0, '#FFF2B0'); g.addColorStop(0.35, '#FFB43C'); g.addColorStop(0.8, 'rgba(230,80,20,0.75)'); g.addColorStop(1, 'rgba(200,50,10,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(fx - fw, baseY);
      ctx.quadraticCurveTo(fx - fw * 0.9, baseY - fh * 0.55, fx + sway, baseY - fh);
      ctx.quadraticCurveTo(fx + fw * 0.9, baseY - fh * 0.55, fx + fw, baseY);
      ctx.closePath(); ctx.fill();
    }
    // coal bed
    for (var j = 0; j < 7; j++) {
      var ex = cx + (j - 3) * w * 0.13, ey = baseY - h * 0.02 - (j % 2) * h * 0.05;
      ctx.fillStyle = (j + f) % 3 === 0 ? '#FFE08A' : ((j % 2) ? '#E8561A' : '#FF9A30');
      ctx.beginPath(); ctx.arc(ex, ey, w * 0.075, 0, Math.PI * 2); ctx.fill();
    }
  }

  // ---------------------------------------------------------------------
  // stone-furnace (2x2, not rotatable): a squat beehive kiln of stacked, staggered field
  // stones, a stone-ringed flue on top and an arched fire mouth with voussoirs in front.
  // ---------------------------------------------------------------------
  function kilnPath(ctx, W, H) {
    var l = W * 0.06, r = W * 0.94, b = H * 0.94, t = H * 0.07;
    ctx.beginPath();
    ctx.moveTo(l + W * 0.06, b);
    ctx.quadraticCurveTo(l, b, l, b - H * 0.08);
    ctx.bezierCurveTo(l - W * 0.01, H * 0.42, W * 0.12, t, W * 0.5, t);
    ctx.bezierCurveTo(W * 0.88, t, r + W * 0.01, H * 0.42, r, b - H * 0.08);
    ctx.quadraticCurveTo(r, b, r - W * 0.06, b);
    ctx.closePath();
  }
  function stoneKiln(ctx, W, H, rng) {
    kilnPath(ctx, W, H); ctx.fillStyle = '#3E372F'; ctx.fill(); // mortar
    ctx.save(); kilnPath(ctx, W, H); ctx.clip();
    var palette = ['#9A907E', '#8E8474', '#A89E88', '#817868', '#948B7A', '#B0A690', '#7A7263'];
    var rows = 7, top = H * 0.07, rowH = (H * 0.87) / rows;
    for (var ry = 0; ry < rows; ry++) {
      var y = top + ry * rowH, x = W * 0.02 - (ry % 2) * W * 0.09 - rng() * W * 0.04;
      var shade = -8 + ry * 3; // courses darken slightly toward the ground
      while (x < W) {
        var sw = W * (0.14 + rng() * 0.1), sh = rowH * (0.84 + rng() * 0.1);
        var col = L.darken(palette[(rng() * palette.length) | 0], Math.max(0, shade));
        var sx = x + W * 0.008, sy = y + (rowH - sh) * 0.5, rr = sh * 0.38;
        var g = ctx.createLinearGradient(sx, sy, sx + sw * 0.3, sy + sh);
        g.addColorStop(0, L.lighten(col, 26)); g.addColorStop(0.5, col); g.addColorStop(1, L.darken(col, 30));
        L.roundRectPath(ctx, sx, sy, sw - W * 0.016, sh, rr); ctx.fillStyle = g; ctx.fill();
        ctx.strokeStyle = 'rgba(28,24,18,0.55)'; ctx.lineWidth = 1; ctx.stroke();
        x += sw;
      }
    }
    // Rounded-form shading: lit from the top-left, darker toward the right and the base.
    var side = ctx.createLinearGradient(0, 0, W, 0);
    side.addColorStop(0, 'rgba(255,255,255,0.10)'); side.addColorStop(0.45, 'rgba(0,0,0,0)'); side.addColorStop(1, 'rgba(0,0,0,0.30)');
    ctx.fillStyle = side; ctx.fillRect(0, 0, W, H);
    var vert = ctx.createLinearGradient(0, 0, 0, H);
    vert.addColorStop(0, 'rgba(255,255,240,0.14)'); vert.addColorStop(0.5, 'rgba(0,0,0,0)'); vert.addColorStop(1, 'rgba(0,0,0,0.28)');
    ctx.fillStyle = vert; ctx.fillRect(0, 0, W, H);
    ctx.restore();
    kilnPath(ctx, W, H); ctx.strokeStyle = 'rgba(14,12,10,0.9)'; ctx.lineWidth = Math.max(1.5, W * 0.022); ctx.stroke();
  }
  // Flue on top: a ring of lighter capstones around a dark shaft that glows while working.
  function kilnFlue(ctx, cx, cy, rx, ry, working, frame) {
    ctx.fillStyle = '#6E665A';
    ctx.beginPath(); ctx.ellipse(cx, cy, rx * 1.45, ry * 1.5, 0, 0, Math.PI * 2); ctx.fill();
    var n = 10;
    for (var i = 0; i < n; i++) {
      var a0 = i / n * Math.PI * 2, a1 = (i + 0.82) / n * Math.PI * 2;
      var lit = Math.cos((a0 + a1) / 2 + 2.3); // top-left brighter
      ctx.fillStyle = L.adjust('#A0978A', Math.round(lit * 22));
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx * 1.45, ry * 1.5, 0, a0, a1);
      ctx.ellipse(cx, cy, rx * 1.02, ry * 1.04, 0, a1, a0, true);
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#15110D';
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    if (working) {
      ctx.save(); ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.clip();
      L.glow(ctx, cx, cy + ry * 0.4, rx * 1.3, '#FF8A2A', flicker(frame, 1.1, 0.5, 0.35));
      ctx.restore();
    }
    ctx.strokeStyle = 'rgba(14,12,10,0.85)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(cx, cy, rx * 1.45, ry * 1.5, 0, 0, Math.PI * 2); ctx.stroke();
  }
  // Arched fire mouth framed by wedge-shaped voussoir stones.
  function kilnMouth(ctx, cx, bottomY, w, h, working, frame) {
    var ring = w * 0.2, topY = bottomY - h;
    // voussoir ring
    archPath(ctx, cx, topY - ring, w + ring * 2, h + ring); ctx.fillStyle = '#B3A994'; ctx.fill();
    var springY = topY + h * 0.42, r0 = w * 0.5, r1 = r0 + ring, n = 7;
    for (var i = 0; i < n; i++) {
      var a0 = Math.PI + i / n * Math.PI, a1 = Math.PI + (i + 1) / n * Math.PI;
      ctx.beginPath();
      ctx.arc(cx, springY, r1, a0 + 0.02, a1 - 0.02, false);
      ctx.arc(cx, springY, r0, a1 - 0.02, a0 + 0.02, true);
      ctx.closePath();
      ctx.fillStyle = L.adjust('#A99F8A', Math.round(Math.cos((a0 + a1) / 2 + 0.8) * 18));
      ctx.fill(); ctx.strokeStyle = 'rgba(28,24,18,0.6)'; ctx.lineWidth = 1; ctx.stroke();
    }
    // jamb stones
    for (var s = 0; s < 2; s++) {
      var jx = s ? cx + r0 : cx - r1;
      L.rectBevel(ctx, jx, springY, ring, bottomY - springY, s ? '#8E8474' : '#A69C87', { dark: '#6A6254', light: '#BDB39C', outlineColor: 'rgba(28,24,18,0.6)', outlineWidth: 1 });
    }
    // opening
    archPath(ctx, cx, topY, w, h); ctx.fillStyle = '#17120E'; ctx.fill();
    ctx.save(); archPath(ctx, cx, topY, w, h); ctx.clip();
    if (working) flames(ctx, cx, bottomY, w, h, frame);
    else {
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(cx - w / 2, topY, w * 0.35, h); // inner shadow
      for (var e = 0; e < 5; e++) {
        ctx.fillStyle = e % 2 ? 'rgba(120,45,20,0.55)' : 'rgba(70,40,30,0.8)';
        ctx.beginPath(); ctx.arc(cx + (e - 2) * w * 0.15, bottomY - h * 0.05, w * 0.07, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
    archPath(ctx, cx, topY, w, h); ctx.strokeStyle = '#0C0A08'; ctx.lineWidth = Math.max(1.5, w * 0.04); ctx.stroke();
    if (working) L.glow(ctx, cx, bottomY, w * 1.25, '#FF8A2A', 0.22 + 0.1 * Math.sin((frame | 0) * 1.35)); // warm spill on the stones
  }
  function paintStoneFurnaceHeavy(ctx, W, H, frame, dir, def, type, opts) {
    var working = !!(opts && opts.working);
    stoneKiln(ctx, W, H, seed(type, 1, 9));
    kilnFlue(ctx, W * 0.5, H * 0.24, W * 0.13, H * 0.07, working, frame);
    kilnMouth(ctx, W * 0.5, H * 0.94, W * 0.34, H * 0.34, working, frame);
    if (working) stackSmoke(ctx, W * 0.5, H * 0.2, frame, W);
  }

  // ---------------------------------------------------------------------
  // steel-furnace (2x2): heavy chamfered steel housing with bolted corner plates around a
  // round crucible lined with refractory brick (molten glow while working), a slotted fire
  // door on the front and an exhaust stack in the back corner.
  // ---------------------------------------------------------------------
  function paintSteelFurnaceHeavy(ctx, W, H, frame, dir, def, type, opts) {
    var working = !!(opts && opts.working);
    var col = L.entColors(def)[0] || '#5E6873';
    var f = frame | 0;
    // plinth + housing
    chamferPanel(ctx, W * 0.03, H * 0.05, W * 0.94, H * 0.9, W * 0.14, L.darken(col, 22), { hi: 14, lo: 22 });
    chamferPanel(ctx, W * 0.09, H * 0.08, W * 0.82, H * 0.78, W * 0.11, col, {});
    // bolted corner plates
    var cp = W * 0.17, corners = [[W * 0.1, H * 0.09], [W * 0.73, H * 0.09], [W * 0.1, H * 0.68], [W * 0.73, H * 0.68]];
    for (var i = 0; i < 4; i++) {
      var c = corners[i];
      L.panel(ctx, c[0], c[1], cp, cp, L.darken(col, 12), { r: W * 0.02, hi: 18, lo: 20 });
      L.rivets(ctx, [[c[0] + cp * 0.3, c[1] + cp * 0.3], [c[0] + cp * 0.7, c[1] + cp * 0.7]], W * 0.018);
    }
    // crucible: steel collar, refractory brick ring, pit
    var cx = W * 0.5, cy = H * 0.44, R = W * 0.29, rb = W * 0.23, rp = W * 0.16;
    L.disc(ctx, cx, cy, R, '#7A858F', { hi: 40, lo: 45 });
    var n = 14;
    for (var b = 0; b < n; b++) {
      var a0 = b / n * Math.PI * 2 + 0.03, a1 = (b + 1) / n * Math.PI * 2 - 0.03;
      ctx.beginPath(); ctx.arc(cx, cy, rb, a0, a1); ctx.arc(cx, cy, rp, a1, a0, true); ctx.closePath();
      var lit = Math.cos((a0 + a1) / 2 - 0.8); // inner wall: lit side faces away from the light
      ctx.fillStyle = L.adjust(b % 2 ? '#8A4A32' : '#7A3F2A', Math.round(lit * 16));
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(10,8,6,0.9)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, rb, 0, Math.PI * 2); ctx.stroke();
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, rp, 0, Math.PI * 2); ctx.clip();
    if (working) {
      var g = ctx.createRadialGradient(cx - rp * 0.15, cy - rp * 0.1, rp * 0.05, cx, cy, rp);
      var hot = flicker(f, 1.2, 0.75, 0.25);
      g.addColorStop(0, 'rgba(255,248,200,' + hot.toFixed(2) + ')'); g.addColorStop(0.45, '#FFB030'); g.addColorStop(0.85, '#D2501A'); g.addColorStop(1, '#6A200C');
      ctx.fillStyle = g; ctx.fillRect(cx - rp, cy - rp, rp * 2, rp * 2);
      // slow-moving crust on the melt
      for (var k = 0; k < 4; k++) {
        var ang = k * 1.7 + f * 0.25, dd = rp * (0.35 + 0.15 * (k % 2));
        ctx.fillStyle = 'rgba(140,40,10,0.35)';
        ctx.beginPath(); ctx.ellipse(cx + Math.cos(ang) * dd, cy + Math.sin(ang) * dd, rp * 0.22, rp * 0.12, ang, 0, Math.PI * 2); ctx.fill();
      }
    } else {
      var gi = ctx.createRadialGradient(cx - rp * 0.3, cy - rp * 0.3, 0, cx, cy, rp);
      gi.addColorStop(0, '#2A221C'); gi.addColorStop(1, '#0E0B09');
      ctx.fillStyle = gi; ctx.fillRect(cx - rp, cy - rp, rp * 2, rp * 2);
      ctx.fillStyle = 'rgba(120,40,16,0.35)';
      ctx.beginPath(); ctx.arc(cx + rp * 0.15, cy + rp * 0.2, rp * 0.3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(10,8,6,0.95)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, rp, 0, Math.PI * 2); ctx.stroke();
    if (working) L.glow(ctx, cx, cy, R * 1.25, '#FF8A2A', flicker(f, 1.2, 0.18, 0.12));
    // fire door with glowing slots
    var dx = W * 0.36, dy = H * 0.76, dw = W * 0.28, dh = H * 0.13;
    L.panel(ctx, dx, dy, dw, dh, L.darken(col, 28), { r: W * 0.015, hi: 12, lo: 18 });
    var slotA = working ? flicker(f, 1.5, 0.55, 0.4) : 0;
    for (var sl = 0; sl < 4; sl++) {
      var sx = dx + dw * (0.12 + sl * 0.21), sy = dy + dh * 0.28, sw = dw * 0.13, sh = dh * 0.44;
      ctx.fillStyle = '#100C09'; ctx.fillRect(sx, sy, sw, sh);
      if (working) { ctx.fillStyle = 'rgba(255,150,50,' + slotA.toFixed(2) + ')'; ctx.fillRect(sx, sy + sh * 0.2, sw, sh * 0.8); }
    }
    if (working) L.glow(ctx, dx + dw / 2, dy + dh, dw * 0.8, '#FF7A2A', slotA * 0.35);
    // exhaust stack, back-right corner
    var sxc = W * 0.8, syc = H * 0.14, sr = W * 0.075;
    L.disc(ctx, sxc, syc, sr, '#4A5057', { hi: 30, lo: 35 });
    ctx.fillStyle = '#0E0C0B'; ctx.beginPath(); ctx.arc(sxc, syc, sr * 0.58, 0, Math.PI * 2); ctx.fill();
    if (working) stackSmoke(ctx, sxc, syc, frame, W);
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
    if (working) stackSmoke(ctx, W * 0.785, H * 0.02, frame, W);
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
    if (working) stackSmoke(ctx, W * 0.79, 0, frame, W);
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
