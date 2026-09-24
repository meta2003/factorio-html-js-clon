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
  // Industrial detailing shared by the furnaces and drills: weathering, raised housings
  // (lit top face + darker front face, the game's slight top-down-from-the-south view),
  // cast-iron grates and the auger drill bit both drills use.
  // ---------------------------------------------------------------------
  // Grime speckles (deterministic via rng).
  function grime(ctx, x, y, w, h, rng, n, color) {
    ctx.fillStyle = color || 'rgba(18,14,10,0.16)';
    for (var i = 0; i < n; i++) {
      var r = Math.min(w, h) * (0.01 + rng() * 0.035);
      ctx.beginPath(); ctx.arc(x + rng() * w, y + rng() * h, r, 0, Math.PI * 2); ctx.fill();
    }
  }
  // Run-down stains (rust, soot) starting at y and fading downwards.
  function streaks(ctx, x, y, w, h, rng, n, color) {
    for (var i = 0; i < n; i++) {
      var sx = x + rng() * w, sw = w * (0.015 + rng() * 0.035), sl = h * (0.35 + rng() * 0.65);
      var g = ctx.createLinearGradient(0, y, 0, y + sl);
      g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(sx, y, sw, sl);
    }
  }
  // Raised housing: top face (x, y, w, d) and a front face of height h below it.
  function housing(ctx, x, y, w, d, h, color, r) {
    var fg = ctx.createLinearGradient(0, y + d, 0, y + d + h);
    fg.addColorStop(0, L.darken(color, 22)); fg.addColorStop(1, L.darken(color, 50));
    L.roundRectPath(ctx, x, y + d - r, w, h + r, r); ctx.fillStyle = fg; ctx.fill();
    ctx.strokeStyle = 'rgba(10,10,10,0.9)'; ctx.lineWidth = 1.5; ctx.stroke();
    L.panel(ctx, x, y, w, d, color, { r: r, hi: 22, lo: 26 });
  }
  // Horizontal seam with a row of rivets.
  function rivetSeam(ctx, x0, x1, y, n, r) {
    ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath(); ctx.moveTo(x0, y + 1.2); ctx.lineTo(x1, y + 1.2); ctx.stroke();
    var pts = [];
    for (var i = 0; i < n; i++) pts.push([x0 + (x1 - x0) * (i + 0.5) / n, y]);
    L.rivets(ctx, pts, r);
  }
  // Heavy cast-iron door frame with vertical grate bars over a (possibly burning) fire box.
  function fireGrate(ctx, x, y, w, h, working, frame, bars) {
    L.rectBevel(ctx, x - w * 0.1, y - h * 0.12, w * 1.2, h * 1.24, '#2E2A27', { light: '#4A4440', dark: '#171412', outlineColor: '#0B0A09', outlineWidth: 1.5 });
    ctx.fillStyle = '#120E0B'; ctx.fillRect(x, y, w, h);
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    if (working) flames(ctx, x + w / 2, y + h, w, h * 1.1, frame);
    else {
      ctx.fillStyle = 'rgba(110,40,16,0.5)';
      for (var e = 0; e < 4; e++) { ctx.beginPath(); ctx.arc(x + w * (0.2 + e * 0.2), y + h * 0.92, w * 0.07, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.restore();
    for (var b = 1; b < bars; b++) {
      var bx = x + w * b / bars;
      ctx.fillStyle = '#1E1B19'; ctx.fillRect(bx - w * 0.035, y, w * 0.07, h);
      ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(bx - w * 0.035, y, w * 0.02, h);
    }
    if (working) L.glow(ctx, x + w / 2, y + h, w * 1.1, '#FF8A2A', flicker(frame, 1.35, 0.22, 0.14));
  }
  // Round exhaust stack seen from above: shaded collar, sooty lip, dark bore (+ inner glow).
  function stack(ctx, cx, cy, r, color, working, frame) {
    L.disc(ctx, cx, cy, r, color, { hi: 36, lo: 40 });
    ctx.fillStyle = '#1A1714'; ctx.beginPath(); ctx.arc(cx, cy, r * 0.66, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#060504'; ctx.beginPath(); ctx.arc(cx + r * 0.06, cy + r * 0.08, r * 0.5, 0, Math.PI * 2); ctx.fill();
    if (working) L.glow(ctx, cx, cy, r * 0.8, '#FF7A2A', flicker(frame, 1.1, 0.25, 0.2));
  }
  // Vertical auger (screw drill bit) hanging from topY; `phase` 0..1 scrolls the flights so
  // it appears to turn; the tip ends at topY + len.
  function auger(ctx, cx, topY, len, r, phase) {
    var tip = r * 1.8;
    function path() {
      ctx.beginPath();
      ctx.moveTo(cx - r, topY); ctx.lineTo(cx + r, topY);
      ctx.lineTo(cx + r, topY + len - tip); ctx.lineTo(cx, topY + len); ctx.lineTo(cx - r, topY + len - tip);
      ctx.closePath();
    }
    var g = ctx.createLinearGradient(cx - r, 0, cx + r, 0);
    g.addColorStop(0, '#4A4F55'); g.addColorStop(0.3, '#C9CED3'); g.addColorStop(0.55, '#8D949B'); g.addColorStop(1, '#33373B');
    path(); ctx.fillStyle = g; ctx.fill();
    ctx.save(); path(); ctx.clip();
    var pitch = r * 1.25;
    for (var k = -2; k < len / pitch + 2; k++) {
      var yy = topY + (k + phase) * pitch;
      ctx.strokeStyle = 'rgba(15,15,15,0.6)'; ctx.lineWidth = r * 0.38;
      ctx.beginPath(); ctx.moveTo(cx - r, yy + r * 0.55); ctx.lineTo(cx + r, yy - r * 0.55); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = r * 0.14;
      ctx.beginPath(); ctx.moveTo(cx - r, yy + r * 0.2); ctx.lineTo(cx + r, yy - r * 0.9); ctx.stroke();
    }
    ctx.restore();
    path(); ctx.strokeStyle = 'rgba(10,10,10,0.9)'; ctx.lineWidth = 1.3; ctx.stroke();
  }
  // I-beam post of a drill gantry, from (x, y0) down to y1 (a vertical member).
  function post(ctx, x, y0, y1, w, color) {
    L.rectBevel(ctx, x - w / 2, y0, w, y1 - y0, color, { light: L.lighten(color, 30), dark: L.darken(color, 35), outlineColor: '#101010', outlineWidth: 1.2 });
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x - w * 0.12, y0, w * 0.24, y1 - y0);
  }
  // Loose ore in an output chute (neutral grey-brown: the chute doesn't know the ore type).
  function oreInChute(ctx, x, y, w, h, frame, working, rng) {
    var cols = ['#5E5750', '#4A443E', '#6E665C', '#3C3732'];
    for (var i = 0; i < 9; i++) {
      var ox = x + w * (0.15 + rng() * 0.7), oy = y + h * (0.2 + rng() * 0.7);
      if (working) oy = y + ((oy - y + (frame | 0) * h * 0.07) % h);
      ctx.fillStyle = cols[i % cols.length];
      ctx.beginPath(); ctx.arc(ox, oy, w * (0.07 + rng() * 0.05), 0, Math.PI * 2); ctx.fill();
    }
  }

  // ---------------------------------------------------------------------
  // stone-furnace (2x2, not rotatable): cut-stone block furnace held together by riveted
  // iron straps and corner angle-irons, a cast-iron fire door with grate on the front and a
  // square iron flue collar on top; soot above the door.
  // ---------------------------------------------------------------------
  function stoneCourses(ctx, x, y, w, h, rows, rng, shadeTop, shadeBottom) {
    var palette = ['#8F8676', '#857C6D', '#9B9280', '#7A7264', '#A39A86', '#8A8272'];
    var rowH = h / rows;
    for (var ry = 0; ry < rows; ry++) {
      var yy = y + ry * rowH, xx = x - (ry % 2) * w * 0.12 - rng() * w * 0.05;
      var shade = shadeTop + (shadeBottom - shadeTop) * (ry / Math.max(1, rows - 1));
      while (xx < x + w) {
        var sw = w * (0.2 + rng() * 0.12);
        var col = L.adjust(palette[(rng() * palette.length) | 0], Math.round(shade));
        L.rectBevel(ctx, xx + 1, yy + 1, sw - 2, rowH - 2, col, { light: L.lighten(col, 20), dark: L.darken(col, 28), outlineColor: 'rgba(30,26,20,0.75)', outlineWidth: 1 });
        // chisel marks
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.fillRect(xx + sw * (0.2 + rng() * 0.5), yy + rowH * (0.3 + rng() * 0.3), sw * 0.12, 1);
        xx += sw;
      }
    }
  }
  function paintStoneFurnaceHeavy(ctx, W, H, frame, dir, def, type, opts) {
    var working = !!(opts && opts.working);
    var rng = seed(type, 1, 9);
    var x = W * 0.06, w = W * 0.88, top = H * 0.08, faceY = H * 0.56, bot = H * 0.95;
    // mortar bed / silhouette
    L.roundRectPath(ctx, x, top, w, bot - top, W * 0.07); ctx.fillStyle = '#3A342D'; ctx.fill();
    ctx.save(); L.roundRectPath(ctx, x, top, w, bot - top, W * 0.07); ctx.clip();
    stoneCourses(ctx, x, top, w, faceY - top, 4, rng, 8, 0);        // top face (lit)
    stoneCourses(ctx, x, faceY, w, bot - faceY, 3, rng, -22, -38);  // front face (shade)
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x, faceY, w, H * 0.02); // eave shadow
    streaks(ctx, W * 0.3, faceY, W * 0.4, H * 0.12, rng, 5, 'rgba(15,12,10,0.35)'); // soot
    ctx.restore();
    L.roundRectPath(ctx, x, top, w, bot - top, W * 0.07); ctx.strokeStyle = '#0E0C0A'; ctx.lineWidth = 2; ctx.stroke();
    // iron straps: around the top edge and across the front face, with rivets
    var iron = '#3B3A38';
    L.rectBevel(ctx, x, faceY - H * 0.035, w, H * 0.05, iron, { light: '#5A5754', dark: '#232120', outlineColor: '#0E0D0C', outlineWidth: 1 });
    L.rivets(ctx, [[x + w * 0.08, faceY - H * 0.01], [x + w * 0.36, faceY - H * 0.01], [x + w * 0.64, faceY - H * 0.01], [x + w * 0.92, faceY - H * 0.01]], W * 0.016);
    L.rectBevel(ctx, x, bot - H * 0.1, w, H * 0.045, iron, { light: '#5A5754', dark: '#232120', outlineColor: '#0E0D0C', outlineWidth: 1 });
    L.rivets(ctx, [[x + w * 0.08, bot - H * 0.078], [x + w * 0.92, bot - H * 0.078]], W * 0.016);
    // corner angle irons
    for (var s = 0; s < 2; s++) {
      var cx0 = s ? x + w - W * 0.07 : x;
      L.rectBevel(ctx, cx0, top + H * 0.05, W * 0.07, bot - top - H * 0.08, s ? '#2E2D2B' : '#46443F', { light: '#5E5B56', dark: '#1D1C1A', outlineColor: '#0E0D0C', outlineWidth: 1 });
      L.rivets(ctx, [[cx0 + W * 0.035, top + H * 0.14], [cx0 + W * 0.035, top + H * 0.33]], W * 0.014);
    }
    // square cast-iron flue collar on the top face
    var fx = W * 0.36, fy = H * 0.14, fw = W * 0.28, fh = H * 0.24;
    L.rectBevel(ctx, fx, fy, fw, fh, '#403D3A', { light: '#66625C', dark: '#221F1D', outlineColor: '#0B0A09', outlineWidth: 1.5 });
    L.inset(ctx, fx + fw * 0.2, fy + fh * 0.2, fw * 0.6, fh * 0.6, '#0C0A08', fw * 0.05);
    if (working) {
      L.glow(ctx, fx + fw / 2, fy + fh * 0.55, fw * 0.55, '#FF8A2A', flicker(frame, 1.1, 0.55, 0.3));
      stackSmoke(ctx, fx + fw / 2, fy + fh * 0.4, frame, W);
    }
    L.rivets(ctx, [[fx + fw * 0.1, fy + fh * 0.1], [fx + fw * 0.9, fy + fh * 0.1], [fx + fw * 0.1, fy + fh * 0.9], [fx + fw * 0.9, fy + fh * 0.9]], W * 0.013);
    // cast-iron fire door on the front face
    fireGrate(ctx, W * 0.34, H * 0.66, W * 0.32, H * 0.2, working, frame, 4);
  }

  // ---------------------------------------------------------------------
  // steel-furnace (2x2): dark riveted steel housing with cooling ribs, a bolted crucible
  // flange (refractory brick, molten glow while working) on top, a wide grated fire window
  // with a hazard-striped kick plate on the front, twin exhaust stacks and rust/soot runs.
  // ---------------------------------------------------------------------
  function paintSteelFurnaceHeavy(ctx, W, H, frame, dir, def, type, opts) {
    var working = !!(opts && opts.working);
    var f = frame | 0, rng = seed(type, 4, 2);
    var steel = '#4C535B';
    // housing: top face + front face
    housing(ctx, W * 0.05, H * 0.07, W * 0.9, H * 0.55, H * 0.32, steel, W * 0.05);
    ctx.save(); L.roundRectPath(ctx, W * 0.05, H * 0.07, W * 0.9, H * 0.87, W * 0.05); ctx.clip();
    grime(ctx, W * 0.05, H * 0.07, W * 0.9, H * 0.55, rng, 26);
    streaks(ctx, W * 0.08, H * 0.62, W * 0.84, H * 0.3, rng, 7, 'rgba(110,55,25,0.35)'); // rust runs on the front
    ctx.restore();
    // cooling ribs down both sides of the top face
    for (var side = 0; side < 2; side++) {
      var rx = side ? W * 0.8 : W * 0.09;
      for (var k = 0; k < 5; k++) {
        var ry = H * (0.14 + k * 0.09);
        L.rectBevel(ctx, rx, ry, W * 0.11, H * 0.05, '#5A626B', { light: '#7C858F', dark: '#2E3338', outlineColor: '#111', outlineWidth: 1 });
      }
    }
    // crucible flange: bolted steel ring, brick lining, melt
    var cx = W * 0.5, cy = H * 0.35, R = W * 0.25, rb = W * 0.19, rp = W * 0.13;
    L.disc(ctx, cx, cy, R, '#6A737C', { hi: 34, lo: 44 });
    var bolts = [];
    for (var bI = 0; bI < 12; bI++) { var a = bI / 12 * Math.PI * 2; bolts.push([cx + Math.cos(a) * R * 0.87, cy + Math.sin(a) * R * 0.87]); }
    L.rivets(ctx, bolts, W * 0.014);
    var n = 12;
    for (var b = 0; b < n; b++) {
      var a0 = b / n * Math.PI * 2 + 0.035, a1 = (b + 1) / n * Math.PI * 2 - 0.035;
      ctx.beginPath(); ctx.arc(cx, cy, rb, a0, a1); ctx.arc(cx, cy, rp, a1, a0, true); ctx.closePath();
      ctx.fillStyle = L.adjust(b % 2 ? '#7E4430' : '#6C3A28', Math.round(Math.cos((a0 + a1) / 2 - 0.8) * 14));
      ctx.fill();
    }
    ctx.strokeStyle = '#0A0806'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, cy, rb, 0, Math.PI * 2); ctx.stroke();
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, rp, 0, Math.PI * 2); ctx.clip();
    if (working) {
      var g = ctx.createRadialGradient(cx - rp * 0.15, cy - rp * 0.1, rp * 0.05, cx, cy, rp);
      g.addColorStop(0, 'rgba(255,246,200,' + flicker(f, 1.2, 0.75, 0.25).toFixed(2) + ')');
      g.addColorStop(0.45, '#FFAA2E'); g.addColorStop(0.85, '#C8481A'); g.addColorStop(1, '#5A1A0A');
      ctx.fillStyle = g; ctx.fillRect(cx - rp, cy - rp, rp * 2, rp * 2);
      for (var c = 0; c < 4; c++) {
        var ang = c * 1.7 + f * 0.25, dd = rp * (0.35 + 0.15 * (c % 2));
        ctx.fillStyle = 'rgba(130,36,10,0.35)';
        ctx.beginPath(); ctx.ellipse(cx + Math.cos(ang) * dd, cy + Math.sin(ang) * dd, rp * 0.22, rp * 0.12, ang, 0, Math.PI * 2); ctx.fill();
      }
    } else {
      ctx.fillStyle = '#0E0B09'; ctx.fillRect(cx - rp, cy - rp, rp * 2, rp * 2);
      ctx.fillStyle = 'rgba(120,40,16,0.35)'; ctx.beginPath(); ctx.arc(cx + rp * 0.15, cy + rp * 0.2, rp * 0.3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = '#0A0806'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, rp, 0, Math.PI * 2); ctx.stroke();
    if (working) L.glow(ctx, cx, cy, R * 1.2, '#FF8A2A', flicker(f, 1.2, 0.16, 0.1));
    // twin exhaust stacks in the back corners
    stack(ctx, W * 0.16, H * 0.1, W * 0.075, '#3E444A', working, frame);
    stack(ctx, W * 0.84, H * 0.1, W * 0.075, '#3E444A', working, frame);
    if (working) { stackSmoke(ctx, W * 0.16, H * 0.1, frame, W); stackSmoke(ctx, W * 0.84, H * 0.1, frame + 7, W); }
    // front face: seam, wide grated fire window, hazard kick plate
    rivetSeam(ctx, W * 0.08, W * 0.92, H * 0.66, 6, W * 0.013);
    fireGrate(ctx, W * 0.26, H * 0.7, W * 0.48, H * 0.12, working, frame, 6);
    L.hazardStripe(ctx, W * 0.1, H * 0.86, W * 0.8, H * 0.05, W * 0.04);
  }

  // ---------------------------------------------------------------------
  // burner-mining-drill (2x2, rotatable, output north of the left column): rusty riveted iron
  // chassis, a gantry carrying the drive gearbox over a screw auger that turns and bobs
  // while working, drive gear, ore chute on the output side, stoked firebox on the front and
  // a smoking stack at the back.
  // ---------------------------------------------------------------------
  function paintBurnerDrillHeavy(ctx, W, H, frame, dir, def, type, opts) {
    var working = !!(opts && opts.working);
    var f = frame | 0, rng = seed(type, 3, 3);
    var rust = '#6B5847';
    // skids
    L.rectBevel(ctx, W * 0.04, H * 0.2, W * 0.07, H * 0.76, '#2B2621', { outlineColor: '#0E0C0A', outlineWidth: 1 });
    L.rectBevel(ctx, W * 0.89, H * 0.2, W * 0.07, H * 0.76, '#2B2621', { outlineColor: '#0E0C0A', outlineWidth: 1 });
    // ore chute to the output tile (north of the left column)
    var chx = W * 0.12, chw = W * 0.28;
    ctx.fillStyle = '#2C2622';
    ctx.beginPath(); ctx.moveTo(chx, 0); ctx.lineTo(chx + chw, 0); ctx.lineTo(chx + chw * 0.9, H * 0.3); ctx.lineTo(chx + chw * 0.1, H * 0.3); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#0E0C0A'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.save(); ctx.clip(); oreInChute(ctx, chx, 0, chw, H * 0.3, f, working, seed(type, 7, 7)); ctx.restore();
    // chassis
    housing(ctx, W * 0.08, H * 0.24, W * 0.84, H * 0.46, H * 0.24, rust, W * 0.04);
    ctx.save(); L.roundRectPath(ctx, W * 0.08, H * 0.24, W * 0.84, H * 0.7, W * 0.04); ctx.clip();
    grime(ctx, W * 0.08, H * 0.24, W * 0.84, H * 0.46, rng, 30, 'rgba(60,30,12,0.22)');
    streaks(ctx, W * 0.1, H * 0.7, W * 0.8, H * 0.22, rng, 8, 'rgba(120,58,22,0.45)');
    ctx.restore();
    rivetSeam(ctx, W * 0.1, W * 0.9, H * 0.3, 6, W * 0.014);
    rivetSeam(ctx, W * 0.1, W * 0.9, H * 0.74, 6, W * 0.014);
    // shaft hole under the auger
    var ax = W * 0.4;
    ctx.fillStyle = '#0D0B09'; ctx.beginPath(); ctx.ellipse(ax, H * 0.6, W * 0.1, H * 0.045, 0, 0, Math.PI * 2); ctx.fill();
    // drive gear beside the gantry
    var gearA = working ? (f / 16) * (Math.PI * 2 / 10) * 2 : 0;
    L.gearShape(ctx, W * 0.72, H * 0.46, W * 0.12, W * 0.035, 10, gearA, '#7A7F84', '#222');
    // auger (bobs and turns)
    var bob = working ? Math.sin(f / 16 * Math.PI * 2) * H * 0.025 : -H * 0.03;
    auger(ctx, ax, H * 0.22 + bob, H * 0.4, W * 0.055, working ? (f % 4) / 4 : 0);
    // gantry: two posts + cross beam + gearbox
    post(ctx, W * 0.2, H * 0.1, H * 0.46, W * 0.06, '#4E4A45');
    post(ctx, W * 0.6, H * 0.1, H * 0.46, W * 0.06, '#4E4A45');
    L.rectBevel(ctx, W * 0.15, H * 0.1, W * 0.5, H * 0.07, '#57524C', { light: '#7A746C', dark: '#2C2926', outlineColor: '#0E0C0A', outlineWidth: 1.2 });
    L.panel(ctx, ax - W * 0.1, H * 0.06, W * 0.2, H * 0.15, '#5E574F', { r: W * 0.02 });
    L.rivets(ctx, [[ax - W * 0.06, H * 0.1], [ax + W * 0.06, H * 0.1], [ax - W * 0.06, H * 0.18], [ax + W * 0.06, H * 0.18]], W * 0.012);
    // stoked firebox on the front face
    fireGrate(ctx, W * 0.56, H * 0.77, W * 0.26, H * 0.12, working, frame, 4);
    // exhaust stack, back-right
    stack(ctx, W * 0.82, H * 0.2, W * 0.07, '#3A342E', working, frame);
    if (working) stackSmoke(ctx, W * 0.82, H * 0.2, frame, W);
  }

  // ---------------------------------------------------------------------
  // electric-mining-drill (3x3, rotatable, output north of the centre column): heavy steel
  // base on four hydraulic outriggers, geared turntable, tall gantry with a finned electric
  // motor over the screw auger (same family look as the burner drill), ore chute, status
  // LED and hazard-striped edges.
  // ---------------------------------------------------------------------
  function paintElectricDrillHeavy(ctx, W, H, frame, dir, def, type, opts) {
    var working = !!(opts && opts.working);
    var f = frame | 0, rng = seed(type, 5, 1);
    var steel = L.entColors(def)[0] || '#5E6C7A';
    // hydraulic outriggers to foot pads in the corners
    var feet = [[0.1, 0.12], [0.9, 0.12], [0.1, 0.9], [0.9, 0.9]];
    for (var i = 0; i < 4; i++) {
      var fx = W * feet[i][0], fy = H * feet[i][1], bx = W * (feet[i][0] < 0.5 ? 0.24 : 0.76), by = H * (feet[i][1] < 0.5 ? 0.26 : 0.74);
      ctx.strokeStyle = '#1A1C1E'; ctx.lineWidth = W * 0.05; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(fx, fy); ctx.stroke();
      ctx.strokeStyle = '#8A949C'; ctx.lineWidth = W * 0.022;
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo((bx + fx) / 2, (by + fy) / 2); ctx.stroke();
      ctx.lineCap = 'butt';
      L.rectBevel(ctx, fx - W * 0.055, fy - H * 0.05, W * 0.11, H * 0.1, '#35393D', { outlineColor: '#0E0E0E', outlineWidth: 1.2 });
    }
    // ore chute to the output tile
    var chx = W * 0.39, chw = W * 0.22;
    ctx.fillStyle = '#26282A';
    ctx.beginPath(); ctx.moveTo(chx, 0); ctx.lineTo(chx + chw, 0); ctx.lineTo(chx + chw * 0.92, H * 0.2); ctx.lineTo(chx + chw * 0.08, H * 0.2); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#0E0E0E'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.save(); ctx.clip(); oreInChute(ctx, chx, 0, chw, H * 0.2, f, working, seed(type, 8, 8)); ctx.restore();
    // base housing
    var bx0 = W * 0.14, by0 = H * 0.16, bw = W * 0.72, bd = H * 0.56, bh = H * 0.14;
    housing(ctx, bx0, by0, bw, bd, bh, steel, W * 0.05);
    ctx.save(); L.roundRectPath(ctx, bx0, by0, bw, bd + bh, W * 0.05); ctx.clip();
    grime(ctx, bx0, by0, bw, bd, rng, 30);
    streaks(ctx, bx0, by0 + bd, bw, bh, rng, 6, 'rgba(20,18,16,0.35)');
    ctx.restore();
    L.hazardStripe(ctx, bx0 + bw * 0.05, by0 + bd + bh * 0.3, bw * 0.9, bh * 0.45, W * 0.028);
    // geared turntable
    var cx = W * 0.5, cy = H * 0.46, tr = W * 0.25;
    var ringA = working ? (f / 16) * (Math.PI * 2 / 24) * 2 : 0;
    L.gearShape(ctx, cx, cy, tr, tr * 0.8, 24, ringA, '#6E777F', '#2B2F33');
    L.disc(ctx, cx, cy, tr * 0.78, '#4A5158', { hi: 30, lo: 40 });
    ctx.fillStyle = '#0D0D0D'; ctx.beginPath(); ctx.ellipse(cx, cy + H * 0.04, W * 0.08, H * 0.04, 0, 0, Math.PI * 2); ctx.fill();
    // auger under the gantry (lifts a little while working)
    var lift = working ? (Math.sin(f / 16 * Math.PI * 2) * 0.5 + 0.5) * H * 0.03 : 0;
    auger(ctx, cx, H * 0.2 - lift, H * 0.3, W * 0.04, working ? (f % 4) / 4 : 0);
    // gantry posts + beam
    post(ctx, W * 0.29, H * 0.14, H * 0.5, W * 0.045, '#3E444A');
    post(ctx, W * 0.71, H * 0.14, H * 0.5, W * 0.045, '#3E444A');
    L.rectBevel(ctx, W * 0.26, H * 0.12, W * 0.48, H * 0.05, '#4C545C', { light: '#6E7880', dark: '#262A2E', outlineColor: '#0E0E0E', outlineWidth: 1.2 });
    // finned electric motor on the beam
    var mx = cx - W * 0.1, my = H * 0.05, mw = W * 0.2, mh = H * 0.12;
    L.cylinder(ctx, mx, my, mw, mh, '#59636C', true, { r: mh * 0.3 });
    for (var fin = 1; fin < 7; fin++) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(mx + mw * fin / 7 - 1, my + mh * 0.15, 2, mh * 0.7); }
    L.hazardStripe(ctx, mx + mw * 0.3, my + mh * 0.82, mw * 0.4, mh * 0.18, W * 0.015);
    // power cable from the motor down to the base
    ctx.strokeStyle = '#141414'; ctx.lineWidth = W * 0.018;
    ctx.beginPath(); ctx.moveTo(mx + mw, my + mh * 0.5); ctx.quadraticCurveTo(W * 0.84, H * 0.1, W * 0.8, H * 0.3); ctx.stroke();
    // status LED
    var lx = W * 0.8, ly = H * 0.34;
    L.inset(ctx, lx - W * 0.03, ly - W * 0.03, W * 0.06, W * 0.06, '#151515', W * 0.01);
    ctx.fillStyle = working ? '#4BE07A' : '#1F3A28';
    ctx.beginPath(); ctx.arc(lx, ly, W * 0.018, 0, Math.PI * 2); ctx.fill();
    if (working) L.glow(ctx, lx, ly, W * 0.07, '#5EE68A', 0.8);
    L.rivets(ctx, [[bx0 + bw * 0.06, by0 + bd * 0.08], [bx0 + bw * 0.94, by0 + bd * 0.08], [bx0 + bw * 0.06, by0 + bd * 0.92], [bx0 + bw * 0.94, by0 + bd * 0.92]], W * 0.012);
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
