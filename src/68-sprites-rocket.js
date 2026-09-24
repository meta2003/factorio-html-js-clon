// 68-sprites-rocket.js — rocket silo art: the 9x9 painter (concrete pad, launch pit, closed
// hatch doors, gantry towers), the dynamic door-opening overlay (F.sprites.rocketSiloDoors) and
// the free-flying rocket sprite (F.sprites.rocket), plus item icons for low-density-structure and
// satellite. Registers via F.sprites.definePainter / F.sprites.defineIcon (design/BUILDING-ART.md
// + design/EXPANSION.md §6.5/§7.4/§8's contract) — never edits src/60-sprites.js. Pure drawing
// module, ES5 style, deterministic (no Math.random). Light comes from the top-left throughout.
(function () {
  'use strict';
  if (!F.sprites || !F.sprites.definePainter) return;
  var L = F.sprites.lib;

  // =========================================================================
  // Shared geometry — used by both the static painter (closed doors) and the
  // F.sprites.rocketSiloDoors(open01) overlay, so "closed" renders identically in both places.
  // =========================================================================

  // Concrete landing pad: foundation slab + expansion-joint grid + a faint top-left sheen.
  function pad(ctx, W, H) {
    L.foundation(ctx, W, H, '#8C8273');
    var x0 = W * 0.04, y0 = H * 0.04, x1 = W * 0.96, y1 = H * 0.96, cols = 6, i, g;
    ctx.strokeStyle = 'rgba(48,42,34,0.35)'; ctx.lineWidth = Math.max(1, W * 0.004);
    for (i = 1; i < cols; i++) { g = x0 + (x1 - x0) * i / cols; ctx.beginPath(); ctx.moveTo(g, y0); ctx.lineTo(g, y1); ctx.stroke(); }
    for (i = 1; i < cols; i++) { g = y0 + (y1 - y0) * i / cols; ctx.beginPath(); ctx.moveTo(x0, g); ctx.lineTo(x1, g); ctx.stroke(); }
    var wash = ctx.createLinearGradient(x0, y0, x1, y1);
    wash.addColorStop(0, 'rgba(255,255,255,0.08)'); wash.addColorStop(0.5, 'rgba(255,255,255,0)'); wash.addColorStop(1, 'rgba(0,0,0,0.10)');
    ctx.fillStyle = wash; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  }

  // Service/gantry tower: two riveted rail posts + repeated X cross-bracing, a small platform
  // and a warning light at the top. Drawn as a narrow vertical lattice flanking the pit.
  function tower(ctx, cx, y0, y1, w) {
    var x0 = cx - w / 2, x1 = cx + w / 2, segs = 5, i, sy0, sy1;
    ctx.strokeStyle = '#33393F'; ctx.lineWidth = Math.max(2, w * 0.13);
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0, y1); ctx.moveTo(x1, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.strokeStyle = '#5E6C7A'; ctx.lineWidth = Math.max(1, w * 0.06);
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0, y1); ctx.moveTo(x1, y0); ctx.lineTo(x1, y1); ctx.stroke();
    for (i = 0; i < segs; i++) {
      sy0 = y0 + (y1 - y0) * i / segs; sy1 = y0 + (y1 - y0) * (i + 1) / segs;
      ctx.strokeStyle = 'rgba(20,20,20,0.55)'; ctx.lineWidth = Math.max(1, w * 0.045);
      ctx.beginPath(); ctx.moveTo(x0, sy0); ctx.lineTo(x1, sy1); ctx.moveTo(x1, sy0); ctx.lineTo(x0, sy1); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x0, sy1); ctx.lineTo(x1, sy1); ctx.stroke();
    }
    L.rectBevel(ctx, x0 - w * 0.25, y0 - w * 0.3, w * 1.5, w * 0.3, '#454C54', { dark: '#22262A' });
    ctx.fillStyle = '#FF8A2A'; ctx.beginPath(); ctx.arc(cx, y0 - w * 0.45, w * 0.14, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#141210'; ctx.lineWidth = 1; ctx.stroke();
  }

  // Deep circular launch pit: flanged collar, dark radial-gradient hole with concentric depth
  // rings, a top-left rim highlight, and evenly-spaced warning lights around the rim. `frame` +
  // `working` drive a chase-blink over 16 frames; `lit` forces all lights on (used by the doors
  // overlay once the silo is ready, independent of the power-working animation).
  function pit(ctx, cx, cy, R, frame, working, lit) {
    L.disc(ctx, cx, cy, R * 1.07, '#4A4D4F', { hi: 20, lo: 35, outlineWidth: Math.max(2, R * 0.02) });
    var g = ctx.createRadialGradient(cx, cy, R * 0.1, cx, cy, R);
    g.addColorStop(0, '#050505'); g.addColorStop(0.55, '#141210'); g.addColorStop(0.85, '#211D18'); g.addColorStop(1, '#332C24');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
    var ri;
    for (ri = 1; ri <= 3; ri++) {
      ctx.strokeStyle = 'rgba(0,0,0,' + (0.32 + ri * 0.1).toFixed(2) + ')'; ctx.lineWidth = Math.max(1, R * 0.012);
      ctx.beginPath(); ctx.arc(cx, cy, R * (0.28 + ri * 0.2), 0, Math.PI * 2); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(210,220,225,0.5)'; ctx.lineWidth = Math.max(2, R * 0.035);
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.99, Math.PI * 0.95, Math.PI * 1.55); ctx.stroke();
    ctx.strokeStyle = '#0C0A08'; ctx.lineWidth = Math.max(2, R * 0.03);
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    var N = 10, i, a, lx, ly, on;
    for (i = 0; i < N; i++) {
      a = i / N * Math.PI * 2;
      lx = cx + Math.cos(a) * R * 1.07; ly = cy + Math.sin(a) * R * 1.07;
      on = lit ? true : (working ? (((i + ((frame | 0) >> 1)) % N) < N * 0.4) : false);
      if (on) L.glow(ctx, lx, ly, R * 0.09, '#FF8A2A', 0.6);
      ctx.fillStyle = on ? '#FF8A2A' : '#5A2E18';
      ctx.beginPath(); ctx.arc(lx, ly, R * 0.028, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#141210'; ctx.lineWidth = 1; ctx.stroke();
    }
  }

  // One heavy segmented hatch door leaf: a half-disc riveted steel plate with a hazard-striped
  // seam edge, clipped to its half then slid `travel` px away from the centre (0 = closed,
  // seam flush at x=cx — identical whether called from the static painter or the doors overlay).
  function doorLeaf(ctx, cx, cy, R, isLeft, travel) {
    ctx.save();
    ctx.translate(isLeft ? -travel : travel, 0);
    ctx.beginPath();
    if (isLeft) ctx.rect(cx - R - 4, cy - R - 4, R + 4, R * 2 + 8);
    else ctx.rect(cx, cy - R - 4, R + 4, R * 2 + 8);
    ctx.clip();
    L.disc(ctx, cx, cy, R, '#7C8790', { hi: 32, lo: 34, outlineWidth: Math.max(2, R * 0.025) });
    var si;
    for (si = 1; si <= 2; si++) {
      ctx.strokeStyle = 'rgba(0,0,0,0.38)'; ctx.lineWidth = Math.max(1, R * 0.02);
      ctx.beginPath(); ctx.arc(cx, cy, R * si / 3, 0, Math.PI * 2); ctx.stroke();
    }
    var N = 6, i, a, pts = [];
    for (i = 0; i < N; i++) {
      a = isLeft ? (Math.PI * 0.5 + (i / (N - 1)) * Math.PI) : (-Math.PI * 0.5 + (i / (N - 1)) * Math.PI);
      pts.push([cx + Math.cos(a) * R * 0.82, cy + Math.sin(a) * R * 0.82]);
    }
    L.rivets(ctx, pts, R * 0.03);
    L.hazardStripe(ctx, cx - 6, cy - R, 12, R * 2, 5);
    ctx.strokeStyle = '#141210'; ctx.lineWidth = Math.max(2, R * 0.025);
    ctx.beginPath(); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.stroke();
    ctx.restore();
  }

  // Both leaves at once, closed (travel=0) or partway/open (travel>0). Shared by the painter
  // (always closed) and the doors overlay (any travel).
  function doors(ctx, cx, cy, R, travel) {
    doorLeaf(ctx, cx, cy, R, true, travel);
    doorLeaf(ctx, cx, cy, R, false, travel);
  }

  // =========================================================================
  // Painter: 'rocket-silo' (9x9 tiles = 576x576 px). Doors are always CLOSED here — the ready/
  // launch opening animation is layered on top by F.sprites.rocketSiloDoors.
  // =========================================================================
  function paintRocketSilo(ctx, W, H, frame, dir, def, type, opts) {
    var working = !!(opts && opts.working);
    var cx = W * 0.5, cy = H * 0.52, R = W * 0.29;
    var towerOff = R * 1.55, towerW = W * 0.085;
    pad(ctx, W, H);
    tower(ctx, cx - towerOff, H * 0.08, H * 0.92, towerW);
    tower(ctx, cx + towerOff, H * 0.08, H * 0.92, towerW);
    L.pipeNub(ctx, cx, H * 0.015, 0, W * 0.09);
    L.pipeNub(ctx, cx, H * 0.985, 2, W * 0.09);
    L.vent(ctx, cx - R * 0.75, H * 0.9, R * 0.5, H * 0.055, 3, true);
    L.vent(ctx, cx + R * 0.25, H * 0.9, R * 0.5, H * 0.055, 3, true);
    pit(ctx, cx, cy, R, frame, working, false);
    doors(ctx, cx, cy, R, 0);
  }
  F.sprites.definePainter(['rocket-silo'], paintRocketSilo);

  // =========================================================================
  // F.sprites.rocketSiloDoors(open01) -> 576x576 transparent canvas. open01=0 renders doors
  // identical to the painter's closed doors (same geometry, same call); open01=1 slides both
  // leaves clear and re-paints the lit pit so it shows through where the base sprite still has
  // the closed doors baked in underneath. Quantised to 8 steps for caching.
  // =========================================================================
  var DOOR_STEPS = 8;
  var doorsCache = new Map();
  F.sprites.rocketSiloDoors = function (open01) {
    if (!F.sprites.enabled) return { width: 0, height: 0 };
    var t = F.util.clamp(open01 == null ? 0 : open01, 0, 1);
    var q = Math.round(t * (DOOR_STEPS - 1));
    var c = doorsCache.get(q);
    if (c) return c;
    var W = L.PX * 9, H = W;
    c = L.newCanvas(W, H);
    var ctx = L.ctxOf(c);
    var cx = W * 0.5, cy = H * 0.52, R = W * 0.29;
    var tOpen = q / (DOOR_STEPS - 1);
    if (tOpen > 0) pit(ctx, cx, cy, R, 0, false, true);
    doors(ctx, cx, cy, R, tOpen * R * 1.15);
    doorsCache.set(q, c);
    return c;
  };

  // =========================================================================
  // F.sprites.rocket(frame) -> 128x384 canvas (2x6 tiles), nose pointing local north (up).
  // White/grey body, black nose cap, red accent band, blue porthole, 2 fins; frames 1..7 add a
  // growing/flickering exhaust flame (frame 0 = none). Cached per frame (0..7).
  // =========================================================================
  var rocketCache = new Map();
  function paintRocket(ctx, W, H, frame) {
    var cx = W * 0.5, bw = W * 0.34;
    var noseTipY = H * 0.03, bodyTopY = H * 0.16, bodyBotY = H * 0.70, skirtH = H * 0.05;
    // Fins (drawn first so the body/skirt overlap their roots).
    ctx.fillStyle = '#B03030';
    ctx.beginPath();
    ctx.moveTo(cx - bw * 0.46, bodyBotY); ctx.lineTo(cx - bw * 1.35, H * 0.92); ctx.lineTo(cx - bw * 0.4, H * 0.86);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#141210'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + bw * 0.46, bodyBotY); ctx.lineTo(cx + bw * 1.35, H * 0.92); ctx.lineTo(cx + bw * 0.4, H * 0.86);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    // Cylindrical body (vertical axis -> shaded left/right, top-left highlight).
    L.cylinder(ctx, cx - bw / 2, bodyTopY, bw, bodyBotY - bodyTopY, '#D8DBDD', false, { r: bw * 0.4 });
    // Nose cone + black tip cap.
    var noseH = bodyTopY - noseTipY;
    var ng = ctx.createLinearGradient(cx - bw / 2, noseTipY, cx + bw / 2, bodyTopY);
    ng.addColorStop(0, L.darken('#D8DBDD', 30)); ng.addColorStop(0.4, L.lighten('#D8DBDD', 30)); ng.addColorStop(1, L.darken('#D8DBDD', 40));
    ctx.fillStyle = ng;
    ctx.beginPath();
    ctx.moveTo(cx, noseTipY);
    ctx.quadraticCurveTo(cx - bw * 0.5, bodyTopY - noseH * 0.15, cx - bw * 0.5, bodyTopY + 1);
    ctx.lineTo(cx + bw * 0.5, bodyTopY + 1);
    ctx.quadraticCurveTo(cx + bw * 0.5, bodyTopY - noseH * 0.15, cx, noseTipY);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#141210'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#1A1A1A';
    ctx.beginPath(); ctx.arc(cx, noseTipY + noseH * 0.16, bw * 0.09, 0, Math.PI * 2); ctx.fill();
    // Red accent band + porthole + panel seam + rivets.
    var bandY = bodyTopY + (bodyBotY - bodyTopY) * 0.26, bandH = (bodyBotY - bodyTopY) * 0.07;
    ctx.fillStyle = '#C43A3A'; ctx.fillRect(cx - bw / 2, bandY, bw, bandH);
    ctx.strokeStyle = '#141210'; ctx.lineWidth = 1; ctx.strokeRect(cx - bw / 2, bandY, bw, bandH);
    L.disc(ctx, cx, bodyTopY + (bodyBotY - bodyTopY) * 0.14, bw * 0.14, '#3A7FD9', { hi: 50, lo: 30, outlineWidth: 1.5 });
    var seamY = bodyTopY + (bodyBotY - bodyTopY) * 0.55;
    ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx - bw * 0.5, seamY); ctx.lineTo(cx + bw * 0.5, seamY); ctx.stroke();
    L.rivets(ctx, [[cx - bw * 0.3, seamY], [cx + bw * 0.3, seamY]], bw * 0.045);
    // Engine skirt + nozzles.
    L.rectBevel(ctx, cx - bw * 0.56, bodyBotY, bw * 1.12, skirtH, '#4A4D4F', { dark: '#22262A' });
    var nozY = bodyBotY + skirtH + H * 0.015, noz = [-bw * 0.28, 0, bw * 0.28], ni;
    for (ni = 0; ni < noz.length; ni++) L.disc(ctx, cx + noz[ni], nozY, bw * 0.11, '#2A2A2A', { hi: 20, lo: 40, outlineWidth: 1.2 });
    // Exhaust flame (frames 1..7), grows and flickers; kept within the bottom shadow margin.
    if (frame > 0) {
      var t = frame / 7;
      var flameLen = H * (0.05 + 0.14 * t) * (0.85 + 0.3 * ((frame % 3) / 3));
      var flameW = bw * (0.55 + 0.35 * t);
      var fy0 = nozY + H * 0.02;
      var fg = ctx.createLinearGradient(cx, fy0, cx, fy0 + flameLen);
      fg.addColorStop(0, 'rgba(255,255,255,0.95)');
      fg.addColorStop(0.25, 'rgba(255,220,140,0.9)');
      fg.addColorStop(0.6, 'rgba(255,138,42,0.75)');
      fg.addColorStop(1, 'rgba(255,80,20,0)');
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.moveTo(cx - flameW * 0.5, fy0);
      ctx.quadraticCurveTo(cx - flameW * 0.2, fy0 + flameLen * 0.6, cx, fy0 + flameLen);
      ctx.quadraticCurveTo(cx + flameW * 0.2, fy0 + flameLen * 0.6, cx + flameW * 0.5, fy0);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }
  F.sprites.rocket = function (frame) {
    if (!F.sprites.enabled) return { width: 0, height: 0 };
    var f = F.util.clamp(frame | 0, 0, 7);
    var c = rocketCache.get(f);
    if (c) return c;
    var W = L.PX * 2, H = L.PX * 6;
    c = L.newCanvas(W, H);
    paintRocket(L.ctxOf(c), W, H, f);
    rocketCache.set(f, c);
    return c;
  };

  // =========================================================================
  // Item icons: low-density-structure ("lds", copper/orange lattice panel) and "satellite"
  // (grey body + blue solar wings + antenna). F.sprites.defineIcon is added concurrently by
  // another agent — guard its existence.
  // =========================================================================
  if (F.sprites.defineIcon) {
    F.sprites.defineIcon('lds', function (ctx, S, def) {
      var c1 = def.icon.color || '#C98A3A', c2 = def.icon.color2 || '#8A8F94';
      L.rectBevel(ctx, S * 0.12, S * 0.12, S * 0.76, S * 0.76, c1, { dark: L.darken(c1, 30) });
      ctx.save();
      ctx.beginPath(); ctx.rect(S * 0.12, S * 0.12, S * 0.76, S * 0.76); ctx.clip();
      ctx.strokeStyle = c2; ctx.lineWidth = Math.max(1, S * 0.045);
      var i;
      for (i = -2; i <= 6; i++) {
        ctx.beginPath(); ctx.moveTo(S * 0.12 + i * S * 0.19, S * 0.12); ctx.lineTo(S * 0.12 + i * S * 0.19 + S * 0.76, S * 0.88); ctx.stroke();
      }
      ctx.restore();
      ctx.strokeStyle = '#141414'; ctx.lineWidth = 1.2; ctx.strokeRect(S * 0.12, S * 0.12, S * 0.76, S * 0.76);
      L.rivets(ctx, [[S * 0.18, S * 0.18], [S * 0.82, S * 0.18], [S * 0.18, S * 0.82], [S * 0.82, S * 0.82]], S * 0.045);
    });
    F.sprites.defineIcon('satellite', function (ctx, S, def) {
      var c1 = def.icon.color || '#C8CCD0', c2 = def.icon.color2 || '#2B4C7E';
      ctx.fillStyle = c2;
      ctx.fillRect(S * 0.06, S * 0.4, S * 0.28, S * 0.2); ctx.fillRect(S * 0.66, S * 0.4, S * 0.28, S * 0.2);
      ctx.strokeStyle = L.darken(c2, 30); ctx.lineWidth = 1;
      ctx.strokeRect(S * 0.06, S * 0.4, S * 0.28, S * 0.2); ctx.strokeRect(S * 0.66, S * 0.4, S * 0.28, S * 0.2);
      var i, lx1, lx2;
      for (i = 1; i < 3; i++) {
        lx1 = S * 0.06 + S * 0.28 * i / 3; ctx.beginPath(); ctx.moveTo(lx1, S * 0.4); ctx.lineTo(lx1, S * 0.6); ctx.stroke();
        lx2 = S * 0.66 + S * 0.28 * i / 3; ctx.beginPath(); ctx.moveTo(lx2, S * 0.4); ctx.lineTo(lx2, S * 0.6); ctx.stroke();
      }
      ctx.strokeStyle = '#54595E'; ctx.lineWidth = Math.max(1, S * 0.03);
      ctx.beginPath(); ctx.moveTo(S * 0.38, S * 0.5); ctx.lineTo(S * 0.34, S * 0.5); ctx.moveTo(S * 0.62, S * 0.5); ctx.lineTo(S * 0.66, S * 0.5); ctx.stroke();
      ctx.strokeStyle = '#8A8F94'; ctx.lineWidth = Math.max(1, S * 0.035);
      ctx.beginPath(); ctx.moveTo(S * 0.5, S * 0.34); ctx.lineTo(S * 0.5, S * 0.14); ctx.stroke();
      ctx.fillStyle = c1; ctx.beginPath(); ctx.arc(S * 0.5, S * 0.12, S * 0.035, 0, Math.PI * 2); ctx.fill();
      L.rectBevel(ctx, S * 0.38, S * 0.34, S * 0.24, S * 0.32, c1, { dark: L.darken(c1, 30) });
    });
  }
})();
