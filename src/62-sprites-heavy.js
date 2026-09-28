// 62-sprites-heavy.js — higher-detail procedural building art for a subset of production
// entities (burner mining drill, offshore-pump; furnaces, the electric drill, the boiler and the
// steam engine live in 62-sprites-furnaces.js / 62-sprites-drill.js / 62-sprites-steam.js). Registers replacement painters via F.sprites.definePainter (design/
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

  F.sprites.definePainter(['burner-mining-drill'], paintBurnerDrillHeavy);
  F.sprites.definePainter(['offshore-pump'], paintOffshorePumpHeavy);
})();
