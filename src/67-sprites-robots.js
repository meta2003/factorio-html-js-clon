// 67-sprites-robots.js — Factorio-like art for the logistic-robotics family: the roboport
// building painter, the three logistic-chest painters (steel-chest body + coloured band/lid
// panel + logistic symbol), the free-moving 'logistic-robot' top-down sprite (+ shadow), and
// item icons for robot/robot-frame/battery-cell/engine. See design/BUILDING-ART.md for the
// painter contract/style and design/EXPANSION.md §6.5/§7.3/§8 for the exact APIs this file must
// expose. Registers via F.sprites.definePainter / a local F.sprites.robot·robotShadow pair /
// F.sprites.defineIcon (guarded — added concurrently by another agent); never edits 60-sprites.js.
// Pure drawing module, ES5 style, deterministic (no Math.random).
(function () {
  'use strict';
  if (!F.sprites || !F.sprites.definePainter) return;
  var L = F.sprites.lib;

  // -----------------------------------------------------------------------
  // Roboport (4x4) — dark steel platform on a foundation slab, four charging pads at the
  // corners (each a small octagon ring that glows cyan/green when opts.working), a central
  // tower with a rotating radar-like dish and a ring of blinking lights around its base.
  // Idle: pads dim/grey, tower lights dark, dish frozen at frame 0.
  // -----------------------------------------------------------------------
  function chargePad(ctx, cx, cy, r, working, pulse) {
    L.disc(ctx, cx, cy, r, '#4A4E52', { hi: 18, lo: 30, outlineWidth: Math.max(1, r * 0.14) });
    // 8-bolt ring around the pad rim.
    var pts = [];
    for (var i = 0; i < 8; i++) {
      var a = i / 8 * Math.PI * 2;
      pts.push([cx + Math.cos(a) * r * 0.82, cy + Math.sin(a) * r * 0.82]);
    }
    L.rivets(ctx, pts, r * 0.1);
    if (working) L.glow(ctx, cx, cy, r * 1.6, '#5EE6D9', 0.25 + 0.25 * pulse);
    var ringCol = working ? L.mix('#2FA79A', '#8CFCEE', pulse) : '#2A2E30';
    ctx.strokeStyle = ringCol; ctx.lineWidth = Math.max(1.2, r * 0.22);
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = working ? L.lighten(ringCol, 20) : '#1C2022';
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.22, 0, Math.PI * 2); ctx.fill();
  }
  function paintRoboport(ctx, W, H, frame, dir, def, type, opts) {
    var working = !!(opts && opts.working);
    var pulse = (Math.sin(frame / 16 * Math.PI * 2) + 1) / 2; // 0..1, seamless over the loop
    L.foundation(ctx, W, H, '#4E5254');

    // dark steel platform (chamfer-free rounded slab, slightly inset from the foundation).
    var px = W * 0.08, py = H * 0.08, pw = W * 0.84, ph = H * 0.84;
    L.panel(ctx, px, py, pw, ph, '#585D61', { r: Math.min(pw, ph) * 0.05, hi: 16, lo: 30 });
    // hazard corner chamfer trim (reads as an industrial landing pad).
    L.hazardStripe(ctx, px, py + ph * 0.02, pw, ph * 0.045, ph * 0.045);

    // four charging pads at the corners.
    var padR = Math.min(W, H) * 0.1, inset = Math.min(W, H) * 0.185;
    var corners = [[px + inset, py + inset], [px + pw - inset, py + inset],
      [px + inset, py + ph - inset], [px + pw - inset, py + ph - inset]];
    for (var c = 0; c < 4; c++) chargePad(ctx, corners[c][0], corners[c][1], padR, working, pulse);

    // central tower: octagonal base + mast + rotating dish (radar-like) with a ring of
    // blinking lights around the mast base.
    var cx = W / 2, cy = H / 2;
    var baseR = Math.min(W, H) * 0.18;
    L.disc(ctx, cx, cy, baseR, '#6B7278', { hi: 30, lo: 30, outlineWidth: Math.max(1.4, baseR * 0.12) });
    var nLights = 6;
    for (var li = 0; li < nLights; li++) {
      var la = li / nLights * Math.PI * 2;
      var lx = cx + Math.cos(la) * baseR * 0.72, ly = cy + Math.sin(la) * baseR * 0.72;
      var lit = working && ((frame + li * 2) % 16) < 3;
      if (lit) L.glow(ctx, lx, ly, baseR * 0.3, '#FFD27A', 0.7);
      ctx.fillStyle = lit ? '#FFE9A8' : (working ? '#5A4A24' : '#2A2A28');
      ctx.beginPath(); ctx.arc(lx, ly, baseR * 0.09, 0, Math.PI * 2); ctx.fill();
    }
    var mastR = baseR * 0.4, mastH = Math.min(W, H) * 0.16;
    L.cylinder(ctx, cx - mastR, cy - mastH, mastR * 2, mastH, '#454C54', false, { r: mastR * 0.6 });

    var ang = working ? (frame / 16) * Math.PI * 2 : 0;
    var dishY = cy - mastH;
    ctx.save(); ctx.translate(cx, dishY); ctx.rotate(ang);
    var dr = Math.min(W, H) * 0.155;
    var dishG = ctx.createLinearGradient(0, dr * 0.42, 0, -dr * 0.42);
    dishG.addColorStop(0, L.lighten('#8A9AA5', 28)); dishG.addColorStop(0.5, '#8A9AA5'); dishG.addColorStop(1, L.darken('#8A9AA5', 36));
    ctx.beginPath(); ctx.ellipse(0, 0, dr, dr * 0.42, 0, 0, Math.PI * 2); ctx.fillStyle = dishG; ctx.fill();
    ctx.strokeStyle = 'rgba(12,12,12,0.85)'; ctx.lineWidth = Math.max(1.2, dr * 0.13); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = Math.max(1, dr * 0.05);
    for (var ri = 0; ri < 6; ri++) {
      var ra = ri / 6 * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(ra) * dr * 0.92, Math.sin(ra) * dr * 0.42 * 0.92); ctx.stroke();
    }
    if (working) L.glow(ctx, 0, 0, dr * 1.3, '#5EE6D9', 0.22 + 0.2 * pulse);
    ctx.restore();

    // roboport item icon (logistic-robot slot) painted as a small dot beacon on the mast top.
    ctx.fillStyle = working ? '#8CFCEE' : '#3A4144';
    ctx.beginPath(); ctx.arc(cx, dishY, mastR * 0.35, 0, Math.PI * 2); ctx.fill();
  }

  // -----------------------------------------------------------------------
  // Logistic chests — steel-chest silhouette (seam, corner rivets, reinforced bands) with a
  // coloured band/lid panel per mode + a small shape-only logistic glyph on the lid.
  // -----------------------------------------------------------------------
  var CHEST_META = {
    'passive-provider-chest': { band: '#C43A3A', glyph: 'out' },   // outward arrow: robots take from it
    'storage-chest': { band: '#D9B830', glyph: 'box' },            // stacked-box glyph: bulk storage
    'requester-chest': { band: '#3A7FD9', glyph: 'in' },           // inward arrow: robots deliver to it
  };
  function logisticGlyph(ctx, cx, cy, r, kind, col) {
    ctx.save();
    ctx.fillStyle = col; ctx.strokeStyle = 'rgba(12,12,12,0.75)'; ctx.lineWidth = Math.max(1, r * 0.12);
    if (kind === 'box') {
      var s = r * 1.3;
      ctx.fillRect(cx - s / 2, cy - s * 0.32, s, s * 0.64);
      ctx.strokeRect(cx - s / 2, cy - s * 0.32, s, s * 0.64);
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = Math.max(1, r * 0.08);
      ctx.beginPath(); ctx.moveTo(cx - s / 2, cy); ctx.lineTo(cx + s / 2, cy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, cy - s * 0.32); ctx.lineTo(cx, cy + s * 0.32); ctx.stroke();
    } else {
      // arrow into/out of a small ring — shape-only "logistics" glyph, no text.
      var dirSign = kind === 'in' ? 1 : -1;
      var ay0 = cy - r * 1.1 * dirSign, ay1 = cy + r * 0.15 * dirSign;
      ctx.lineWidth = Math.max(1.4, r * 0.28); ctx.lineCap = 'round';
      ctx.strokeStyle = col;
      ctx.beginPath(); ctx.moveTo(cx, ay0); ctx.lineTo(cx, ay1); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.5, ay1 - r * 0.5 * dirSign); ctx.lineTo(cx, ay1); ctx.lineTo(cx + r * 0.5, ay1 - r * 0.5 * dirSign);
      ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy + r * 0.9 * dirSign, r * 0.36, 0, Math.PI * 2);
      ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = 'rgba(12,12,12,0.6)'; ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.restore();
  }
  function paintLogisticChest(ctx, W, H, frame, dir, def, type) {
    var meta = CHEST_META[type] || CHEST_META['storage-chest'];
    var steel = '#8A8F94', steelLo = '#4C5054';
    var pad = W * 0.08, x = pad, y = pad, w = W - pad * 2, h = H - pad * 2;
    var lidH = h * 0.34, bodyY = y + lidH + h * 0.025, bodyH = h - lidH - h * 0.025;

    // lid: coloured band panel (this is the "lid panel" the brief asks for) over a steel lip.
    L.panel(ctx, x, y, w, lidH, meta.band, { r: w * 0.06, hi: 30, lo: 22 });
    L.panel(ctx, x, bodyY, w, bodyH, steel, { r: w * 0.06, hi: 12, lo: 32 });
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(x + w * 0.04, y + lidH - h * 0.012, w * 0.92, h * 0.028);

    // steel reinforcement bands + rivets (matches the 64-sprites-logistics steel-chest look).
    var bandCol = L.darken(steel, 22);
    ctx.fillStyle = bandCol;
    ctx.fillRect(x + w * 0.16, bodyY, w * 0.07, bodyH);
    ctx.fillRect(x + w * 0.77, bodyY, w * 0.07, bodyH);
    ctx.strokeStyle = '#141414'; ctx.lineWidth = 1;
    ctx.strokeRect(x + w * 0.16, bodyY, w * 0.07, bodyH);
    ctx.strokeRect(x + w * 0.77, bodyY, w * 0.07, bodyH);
    L.rivets(ctx, [[x + w * 0.195, bodyY + bodyH * 0.18], [x + w * 0.195, bodyY + bodyH * 0.82],
      [x + w * 0.805, bodyY + bodyH * 0.18], [x + w * 0.805, bodyY + bodyH * 0.82]], w * 0.02);
    L.rivets(ctx, [[x + w * 0.08, y + lidH * 0.5], [x + w * 0.92, y + lidH * 0.5]], w * 0.02);
    void steelLo;

    // small logistic glyph centred on the coloured band.
    logisticGlyph(ctx, x + w * 0.5, y + lidH * 0.5, Math.min(w, h) * 0.1, meta.glyph, L.lighten(meta.band, 55));
  }

  F.sprites.definePainter(['roboport'], paintRoboport);
  F.sprites.definePainter(['passive-provider-chest', 'storage-chest', 'requester-chest'], paintLogisticChest);

  // -----------------------------------------------------------------------
  // F.sprites.robot(type, frame) / F.sprites.robotShadow() — free-moving 48x48 top-down sprite
  // for the 'logistic-robot', cached like F.sprites.turretHead in 60-sprites.js. Facing north:
  // a compact yellow-grey drone body with four small rotor nacelles at the corners, a cargo pod
  // slung underneath, and a blinking status light (frames 0..7 -> a 8-step blink/hover cycle).
  // -----------------------------------------------------------------------
  var ROBOT_SIZE = 48;
  function stub(w, h) { return { width: w || 0, height: h || 0 }; }
  var robotCache = new Map();
  var robotShadowCache = null;

  // Body colour and status-light colours per robot type: logistic robots are yellow with a
  // green light, construction robots (53-construction.js) orange with an amber light.
  var ROBOT_LOOK = {
    'logistic-robot': { body: '#D9C040', glow: '#6FE68A', on: '#8CFCA0', off: '#3A5A3E' },
    'construction-robot': { body: '#E07A2A', glow: '#FFC24A', on: '#FFE08A', off: '#5A4A2E' },
  };

  function paintLogisticRobot(ctx, S, frame, type) {
    var look = ROBOT_LOOK[type] || ROBOT_LOOK['logistic-robot'];
    var cx = S / 2, cy = S / 2;
    var hover = Math.sin((frame % 8) / 8 * Math.PI * 2) * S * 0.02;
    cy += hover;

    // four small rotor nacelles at the body corners, spinning blur (cheap: two crossed strokes).
    var bodyW = S * 0.46, bodyH = S * 0.4;
    var nacR = S * 0.085;
    var nac = [[cx - bodyW * 0.52, cy - bodyH * 0.52], [cx + bodyW * 0.52, cy - bodyH * 0.52],
      [cx - bodyW * 0.52, cy + bodyH * 0.52], [cx + bodyW * 0.52, cy + bodyH * 0.52]];
    var spin = (frame % 4) * (Math.PI / 8);
    for (var i = 0; i < 4; i++) {
      var nx = nac[i][0], ny = nac[i][1];
      ctx.save(); ctx.globalAlpha = 0.55; ctx.strokeStyle = '#C9CDD0'; ctx.lineWidth = Math.max(1, nacR * 0.3);
      ctx.translate(nx, ny); ctx.rotate(spin);
      ctx.beginPath(); ctx.moveTo(-nacR, 0); ctx.lineTo(nacR, 0); ctx.moveTo(0, -nacR); ctx.lineTo(0, nacR); ctx.stroke();
      ctx.restore();
      L.disc(ctx, nx, ny, nacR * 0.55, '#4A4E52', { hi: 30, lo: 30, outlineWidth: 1 });
    }

    // cargo pod slung underneath (drawn before the body so the body overlaps its top edge).
    L.panel(ctx, cx - bodyW * 0.28, cy + bodyH * 0.18, bodyW * 0.56, bodyH * 0.4, '#6E767C',
      { r: bodyH * 0.1, hi: 14, lo: 30, outlineWidth: 1.2 });

    // compact yellow-grey drone body: octagon-ish chassis via a rounded panel.
    L.panel(ctx, cx - bodyW / 2, cy - bodyH / 2, bodyW, bodyH, look.body,
      { r: Math.min(bodyW, bodyH) * 0.3, hi: 32, lo: 26, outlineWidth: 1.4 });
    ctx.fillStyle = '#8A8F94';
    ctx.fillRect(cx - bodyW * 0.14, cy - bodyH * 0.5, bodyW * 0.28, bodyH * 0.22);

    // eye/sensor lens (front, facing local north) + blinking status light on top.
    L.disc(ctx, cx, cy - bodyH * 0.12, bodyH * 0.14, '#2A2C2E', { hi: 40, lo: 20, outlineWidth: 1 });
    var blink = (frame % 8) < 2;
    if (blink) L.glow(ctx, cx, cy + bodyH * 0.02, bodyH * 0.5, look.glow, 0.7);
    ctx.fillStyle = blink ? look.on : look.off;
    ctx.beginPath(); ctx.arc(cx, cy + bodyH * 0.02, bodyH * 0.07, 0, Math.PI * 2); ctx.fill();
  }

  // F.sprites.robot('logistic-robot', frame) -> cached 48x48 canvas (design/EXPANSION.md §6.5).
  F.sprites.robot = function (type, frame) {
    if (!F.sprites.enabled) return stub(ROBOT_SIZE, ROBOT_SIZE);
    frame = ((frame | 0) % 8 + 8) % 8;
    var key = type + '|' + frame;
    var c = robotCache.get(key);
    if (c) return c;
    c = L.newCanvas(ROBOT_SIZE, ROBOT_SIZE);
    var ctx = L.ctxOf(c);
    paintLogisticRobot(ctx, ROBOT_SIZE, frame, type);
    robotCache.set(key, c);
    return c;
  };
  // F.sprites.robotShadow() -> cached 48x48 soft dark ellipse (design/EXPANSION.md §6.5).
  F.sprites.robotShadow = function () {
    if (!F.sprites.enabled) return stub(ROBOT_SIZE, ROBOT_SIZE);
    if (robotShadowCache) return robotShadowCache;
    var c = L.newCanvas(ROBOT_SIZE, ROBOT_SIZE);
    var ctx = L.ctxOf(c);
    ctx.save(); ctx.globalAlpha = 0.32; ctx.fillStyle = '#000000';
    ctx.beginPath(); ctx.ellipse(ROBOT_SIZE * 0.5, ROBOT_SIZE * 0.58, ROBOT_SIZE * 0.32, ROBOT_SIZE * 0.16, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    robotShadowCache = c;
    return c;
  };

  // -----------------------------------------------------------------------
  // Item icons — guarded: F.sprites.defineIcon is registered by a concurrently-developed art
  // pack; if it hasn't loaded yet this block is a silent no-op (per task brief).
  // -----------------------------------------------------------------------
  if (F.sprites.defineIcon) {
    // 'robot' — the drone itself, front-facing mini render (reuses the body/pod/light shapes at
    // icon scale so it reads consistently with the in-world sprite).
    F.sprites.defineIcon('robot', function (ctx, S, def) {
      var body = (def && def.icon && def.icon.color) || '#D9C040';
      var look = (def && ROBOT_LOOK[def.id]) || ROBOT_LOOK['logistic-robot'];
      var cx = S / 2, cy = S * 0.52, bodyW = S * 0.5, bodyH = S * 0.42;
      L.panel(ctx, cx - bodyW * 0.26, cy + bodyH * 0.16, bodyW * 0.52, bodyH * 0.36, '#6E767C', { r: bodyH * 0.1, hi: 10, lo: 26 });
      L.panel(ctx, cx - bodyW / 2, cy - bodyH / 2, bodyW, bodyH, body, { r: Math.min(bodyW, bodyH) * 0.3, hi: 32, lo: 26 });
      var nac = [[cx - bodyW * 0.52, cy - bodyH * 0.52], [cx + bodyW * 0.52, cy - bodyH * 0.52],
        [cx - bodyW * 0.52, cy + bodyH * 0.52], [cx + bodyW * 0.52, cy + bodyH * 0.52]];
      for (var i = 0; i < 4; i++) L.disc(ctx, nac[i][0], nac[i][1], S * 0.06, '#4A4E52', { hi: 30, lo: 30, outlineWidth: 1 });
      L.disc(ctx, cx, cy - bodyH * 0.1, bodyH * 0.16, '#2A2C2E', { hi: 40, lo: 20, outlineWidth: 1 });
      ctx.fillStyle = look.glow; ctx.beginPath(); ctx.arc(cx, cy + bodyH * 0.05, bodyH * 0.09, 0, Math.PI * 2); ctx.fill();
    });

    // 'robot-frame' — unpowered grey wireframe chassis (flying-robot-frame intermediate item):
    // same silhouette as the robot but unlit, no cargo pod, dashed outline reading "incomplete".
    F.sprites.defineIcon('robot-frame', function (ctx, S, def) {
      var col = (def && def.icon && def.icon.color) || '#9AA3AA';
      var cx = S / 2, cy = S * 0.54, bodyW = S * 0.52, bodyH = S * 0.44;
      L.panel(ctx, cx - bodyW / 2, cy - bodyH / 2, bodyW, bodyH, L.mix(col, '#2A2E30', 0.35), { r: Math.min(bodyW, bodyH) * 0.3, hi: 14, lo: 20 });
      ctx.save();
      ctx.setLineDash([S * 0.05, S * 0.045]);
      ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, S * 0.045);
      L.roundRectPath(ctx, cx - bodyW / 2, cy - bodyH / 2, bodyW, bodyH, Math.min(bodyW, bodyH) * 0.3);
      ctx.stroke();
      ctx.restore();
      var nac = [[cx - bodyW * 0.52, cy - bodyH * 0.52], [cx + bodyW * 0.52, cy - bodyH * 0.52],
        [cx - bodyW * 0.52, cy + bodyH * 0.52], [cx + bodyW * 0.52, cy + bodyH * 0.52]];
      for (var i = 0; i < 4; i++) { ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(nac[i][0], nac[i][1], S * 0.05, 0, Math.PI * 2); ctx.stroke(); }
      L.disc(ctx, cx, cy - bodyH * 0.08, bodyH * 0.14, '#1E2022', { hi: 10, lo: 10, outlineWidth: 1 });
    });

    // 'battery-cell' — cylindrical battery, silver body with a red positive-terminal cap.
    F.sprites.defineIcon('battery-cell', function (ctx, S, def) {
      var col = (def && def.icon && def.icon.color) || '#B8B8B8';
      var capCol = (def && def.icon && def.icon.color2) || '#C44A2A';
      var w = S * 0.38, x = S * 0.31, y = S * 0.2, h = S * 0.68;
      L.cylinder(ctx, x, y + h * 0.12, w, h * 0.88, col, false, { r: w * 0.16 });
      L.disc(ctx, x + w / 2, y + h * 0.12, w * 0.5, L.lighten(col, 10), { hi: 45, lo: 25, outlineWidth: 1 });
      var capH = h * 0.2;
      L.cylinder(ctx, x + w * 0.16, y, w * 0.68, capH * 1.2, capCol, false, { r: w * 0.1 });
      L.disc(ctx, x + w * 0.5, y, w * 0.34, L.lighten(capCol, 15), { hi: 45, lo: 25, outlineWidth: 1 });
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = Math.max(1, S * 0.02);
      ctx.beginPath(); ctx.moveTo(x + w * 0.5, y + h * 0.35); ctx.lineTo(x + w * 0.5, y + h * 0.32); ctx.stroke();
      ctx.strokeStyle = '#3A3A3A'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, y + h * 0.55); ctx.lineTo(x + w, y + h * 0.55); ctx.stroke();
    });

    // 'engine' — engine block with two pistons, tinted by def.icon.color/color2 (grey for
    // engine-unit, blue for electric-engine-unit — data-driven, no hard-coded item ids here).
    F.sprites.defineIcon('engine', function (ctx, S, def) {
      var col = (def && def.icon && def.icon.color) || '#8A8F94';
      var col2 = (def && def.icon && def.icon.color2) || L.darken(col, 35);
      var bw = S * 0.6, bh = S * 0.42, bx = S * 0.2, by = S * 0.4;
      L.panel(ctx, bx, by, bw, bh, col, { r: bh * 0.16, hi: 22, lo: 30 });
      var pistW = bw * 0.16;
      for (var i = 0; i < 2; i++) {
        var px2 = bx + bw * (0.28 + i * 0.44) - pistW / 2;
        L.cylinder(ctx, px2, by - S * 0.22, pistW, S * 0.24, col2, false, { r: pistW * 0.3 });
        L.disc(ctx, px2 + pistW / 2, by - S * 0.22, pistW * 0.5, L.lighten(col2, 20), { hi: 40, lo: 20, outlineWidth: 1 });
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = Math.max(1, S * 0.018);
      ctx.beginPath(); ctx.moveTo(bx + bw * 0.5, by + bh * 0.1); ctx.lineTo(bx + bw * 0.5, by + bh * 0.9); ctx.stroke();
      L.rivets(ctx, [[bx + bw * 0.12, by + bh * 0.82], [bx + bw * 0.88, by + bh * 0.82]], S * 0.02);
    });
  }
})();
