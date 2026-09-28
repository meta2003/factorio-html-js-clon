// 64-sprites-logistics.js — painter pack overriding the flat-box placeholders for logistics
// entities (electric poles after the real Factorio sprites, stone-wall; chests, inserters and pipes live in 64-sprites-chests/-inserters/-pipes.js) with layered, top-lit industrial
// art. See design/BUILDING-ART.md for the painter contract/style and src/60-sprites.js "Building
// art library" for the shared helpers (F.sprites.lib). Registers via F.sprites.definePainter;
// never edits 60-sprites.js. Deterministic only (no Math.random — none of these entities need
// per-instance variation).
(function () {
  'use strict';
  if (!F.sprites || !F.sprites.definePainter) return;
  var L = F.sprites.lib;

  // -----------------------------------------------------------------------
  // Electric poles drawn after the real Factorio sprites (base/graphics/entity/small-electric-
  // pole: hr 72x220, shift (1.5,-42.5), copper wire point 2.6 tiles up; medium-electric-pole:
  // hr 84x252, shift (3.5,-44), copper wire point ~3.1 tiles up; references: the vanilla frames
  // collected in snouz/factorio_free_graphics_for_modders).
  //   - small pole: a round orange-brown wooden post, charred toward the foot, standing in a
  //     blue-grey steel sleeve with gusset feet; at the top a steel Y-head carrying three white
  //     ceramic insulators with short green / yellow / red jumper wires;
  //   - medium pole: a tapering bronze-coloured steel lattice tower with X bracing and a dark
  //     side web, topped by a small platform with the insulators.
  // Like the originals they stand well above their tile: F.sprites.poleTall(type) is a
  // 320x256 px canvas (5x4 tiles at 64 px/tile) with the tile centre at POLE_ANCHOR, including
  // the long shadow the pole casts to the right; the renderer draws poles with it and hangs the
  // wires at F.sprites.poleWireHeight(type) tiles. The 1x1 painter (icons, ghosts, previews)
  // shows the same pole shrunk onto its tile.
  // -----------------------------------------------------------------------
  var POLE_ANCHOR = [48, 224];
  var POLE_WIRE = { 'small-electric-pole': 2.72, 'medium-electric-pole': 3.2 };
  function insulator(ctx, x, y) {
    ctx.fillStyle = '#1A1A1A'; ctx.fillRect(x - 1.2, y, 2.4, 6);
    for (var i = 0; i < 3; i++) {
      ctx.fillStyle = '#2A2A2A'; ctx.beginPath(); ctx.ellipse(x, y - i * 3.2, 4.6, 2.2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = i === 2 ? '#FFFFFF' : '#D8DADC'; ctx.beginPath(); ctx.ellipse(x - 0.3, y - i * 3.2 - 0.4, 3.8, 1.6, 0, 0, Math.PI * 2); ctx.fill();
    }
  }
  function jumper(ctx, pts, col) {
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.strokeStyle = '#141414'; ctx.lineWidth = 3; ctx.stroke(); ctx.strokeStyle = col; ctx.lineWidth = 1.8; ctx.stroke();
    ctx.restore();
  }
  function poleShadow(ctx, h, w) {
    // long soft shadow on the ground, cast to the right (light from the top-left)
    ctx.save(); ctx.translate(POLE_ANCHOR[0], POLE_ANCHOR[1]);
    var len = h * 0.95;
    var g = ctx.createLinearGradient(0, 0, len, 0); g.addColorStop(0, 'rgba(0,0,0,0.42)'); g.addColorStop(1, 'rgba(0,0,0,0.2)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(4, -w * 0.5 + 6); ctx.lineTo(len, 2); ctx.lineTo(len + 16, 6); ctx.lineTo(len, 10); ctx.lineTo(4, w * 0.5 + 6); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  function paintSmallPoleTall(ctx) {
    poleShadow(ctx, 176, 10);
    ctx.save(); ctx.translate(POLE_ANCHOR[0], POLE_ANCHOR[1]);
    // steel foot: plate, gussets and sleeve
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(3, 12, 20, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1C2226'; ctx.beginPath(); ctx.moveTo(-20, 12); ctx.lineTo(-6, -8); ctx.lineTo(6, -8); ctx.lineTo(22, 12); ctx.lineTo(8, 16); ctx.lineTo(-6, 16); ctx.closePath(); ctx.fill();
    var fg = ctx.createLinearGradient(-20, 0, 22, 0); fg.addColorStop(0, '#9AB0BC'); fg.addColorStop(0.45, '#6A808C'); fg.addColorStop(1, '#2E3A42');
    ctx.fillStyle = fg; ctx.beginPath(); ctx.moveTo(-18, 11); ctx.lineTo(-5, -6); ctx.lineTo(5, -6); ctx.lineTo(20, 11); ctx.lineTo(7, 14.5); ctx.lineTo(-5, 14.5); ctx.closePath(); ctx.fill();
    var sg = ctx.createLinearGradient(-10, 0, 10, 0); sg.addColorStop(0, '#A8BCC8'); sg.addColorStop(0.35, '#7A909C'); sg.addColorStop(1, '#2E3A42');
    ctx.fillStyle = '#1C2226'; ctx.fillRect(-10.5, -40, 21, 40);
    ctx.fillStyle = sg; ctx.fillRect(-9.5, -39, 19, 38);
    ctx.fillStyle = 'rgba(20,26,30,0.7)'; ctx.fillRect(-9.5, -32, 19, 2); ctx.fillRect(-9.5, -12, 19, 2);
    // wooden post, charred toward the foot
    ctx.fillStyle = '#1E120A'; ctx.fillRect(-8, -180, 16, 144);
    var wg = ctx.createLinearGradient(-7, 0, 7, 0); wg.addColorStop(0, '#E8A050'); wg.addColorStop(0.35, '#C87A30'); wg.addColorStop(1, '#6A3A14');
    ctx.fillStyle = wg; ctx.fillRect(-7, -180, 14, 142);
    var cg = ctx.createLinearGradient(0, -90, 0, -38); cg.addColorStop(0, 'rgba(20,10,4,0)'); cg.addColorStop(1, 'rgba(20,10,4,0.85)');
    ctx.fillStyle = cg; ctx.fillRect(-7, -90, 14, 52);
    ctx.strokeStyle = 'rgba(70,34,10,0.5)'; ctx.lineWidth = 0.8;
    for (var i = 0; i < 7; i++) { var gx = -5 + i * 1.7; ctx.beginPath(); ctx.moveTo(gx, -178); ctx.lineTo(gx + Math.sin(i) * 1.2, -40); ctx.stroke(); }
    // steel Y-head with insulators and jumpers
    ctx.fillStyle = '#1C2226'; ctx.fillRect(-9, -190, 18, 14);
    ctx.fillStyle = '#8CA0AC'; ctx.fillRect(-8, -189, 16, 12);
    ctx.save(); ctx.lineCap = 'round';
    [[-8, -186, -28, -196], [8, -186, 28, -192], [0, -188, -2, -202]].forEach(function (a) {
      ctx.strokeStyle = '#1C2226'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(a[2], a[3]); ctx.stroke();
      ctx.strokeStyle = '#8CA0AC'; ctx.lineWidth = 3.6; ctx.stroke();
    });
    ctx.restore();
    jumper(ctx, [[-28, -198], [-18, -194], [-4, -190]], '#58B83A');
    jumper(ctx, [[-4, -190], [6, -189], [18, -191]], '#E8C83A');
    jumper(ctx, [[18, -191], [28, -193]], '#D83A2A');
    insulator(ctx, -28, -198); insulator(ctx, -2, -204); insulator(ctx, 28, -194);
    ctx.restore();
  }
  function paintMediumPoleTall(ctx) {
    poleShadow(ctx, 206, 26);
    ctx.save(); ctx.translate(POLE_ANCHOR[0], POLE_ANCHOR[1]);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(4, 14, 28, 8, 0, 0, Math.PI * 2); ctx.fill();
    // dark side web (the lattice's shaded face)
    ctx.fillStyle = '#1E140C'; ctx.beginPath(); ctx.moveTo(8, -150); ctx.lineTo(26, 14); ctx.lineTo(4, 14); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#3A2616'; ctx.beginPath(); ctx.moveTo(9, -140); ctx.lineTo(23, 12); ctx.lineTo(8, 12); ctx.closePath(); ctx.fill();
    // tapering lattice: two legs, rungs and X braces
    var legs = function (t) { return [-20 + 11 * t, 20 - 11 * t]; }; // x of the two legs at height fraction t (0 foot, 1 top)
    var y0 = 16, y1 = -206;
    function Y(t) { return y0 + (y1 - y0) * t; }
    ctx.lineCap = 'round';
    function bar(xa, ya, xb, yb, w, c) { ctx.strokeStyle = '#1A0E06'; ctx.lineWidth = w + 2; ctx.beginPath(); ctx.moveTo(xa, ya); ctx.lineTo(xb, yb); ctx.stroke(); ctx.strokeStyle = c; ctx.lineWidth = w; ctx.stroke(); }
    var n = 11;
    for (var i = 0; i < n; i++) {
      var t0 = i / n, t1 = (i + 1) / n, a = legs(t0), b = legs(t1);
      bar(a[0], Y(t0), b[1], Y(t1), 2, '#9A6232');
      bar(a[1], Y(t0), b[0], Y(t1), 2, '#7A4A22');
      bar(b[0], Y(t1), b[1], Y(t1), 2.4, '#B87A42');
    }
    var f = legs(0), tp = legs(1);
    bar(f[0], y0, tp[0], y1, 4, '#D09A60');
    bar(f[1], y0, tp[1], y1, 4, '#8A5A2E');
    ctx.fillStyle = 'rgba(255,220,170,0.6)'; ctx.fillRect(f[0] - 1.6, y0 - 2, 1.2, 2);
    // bolt dots along the legs
    ctx.fillStyle = '#F0C890';
    for (i = 1; i < n; i++) { var l = legs(i / n); ctx.fillRect(l[0] - 0.8, Y(i / n) - 0.8, 1.6, 1.6); }
    // head platform with insulators
    ctx.fillStyle = '#1A0E06'; ctx.beginPath(); ctx.moveTo(-22, -210); ctx.lineTo(18, -214); ctx.lineTo(26, -204); ctx.lineTo(-14, -198); ctx.closePath(); ctx.fill();
    var hg = ctx.createLinearGradient(-20, -214, 24, -198); hg.addColorStop(0, '#F0C090'); hg.addColorStop(0.5, '#C08450'); hg.addColorStop(1, '#6A4020');
    ctx.fillStyle = hg; ctx.beginPath(); ctx.moveTo(-20, -209.5); ctx.lineTo(17, -213); ctx.lineTo(24, -204.5); ctx.lineTo(-13, -199.5); ctx.closePath(); ctx.fill();
    ctx.save(); ctx.lineCap = 'round';
    [[-14, -206, -30, -210], [18, -208, 32, -202]].forEach(function (a2) {
      ctx.strokeStyle = '#1A0E06'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(a2[0], a2[1]); ctx.lineTo(a2[2], a2[3]); ctx.stroke();
      ctx.strokeStyle = '#B87A42'; ctx.lineWidth = 3; ctx.stroke();
    });
    ctx.restore();
    jumper(ctx, [[-30, -212], [-20, -206], [-6, -205]], '#58B83A');
    jumper(ctx, [[2, -210], [14, -206], [24, -204]], '#E8C83A');
    jumper(ctx, [[24, -204], [32, -204]], '#D83A2A');
    insulator(ctx, -30, -212); insulator(ctx, 2, -216); insulator(ctx, 32, -204);
    ctx.restore();
  }
  var poleTallCache = {};
  F.sprites.poleTall = function (type) {
    if (!F.sprites.enabled) return null;
    if (poleTallCache[type]) return poleTallCache[type];
    var c = L.newCanvas(320, 256), ctx = L.ctxOf(c);
    if (type === 'medium-electric-pole') paintMediumPoleTall(ctx); else paintSmallPoleTall(ctx);
    poleTallCache[type] = { canvas: c, ax: POLE_ANCHOR[0], ay: POLE_ANCHOR[1] };
    return poleTallCache[type];
  };
  F.sprites.poleWireHeight = function (type) { return POLE_WIRE[type] || 2.7; };
  // 1x1 painter: the tall pole shrunk onto its tile (icons, ghosts, placement previews)
  function paintPole(ctx, W, H, frame, dir, def, type) {
    var t = F.sprites.poleTall(type); if (!t) return;
    var s = H / 232, x0 = W / 2 - t.ax * s, y0 = H * 0.9 - t.ay * s;
    ctx.drawImage(t.canvas, 0, 0, 96, 256, x0, y0, 96 * s, 256 * s);
  }

  // -----------------------------------------------------------------------
  // Stone wall — central stone-block body (top-lit, brick mortar lines) with unbordered
  // extension slabs toward each connected neighbour so adjoining wall tiles read as one
  // continuous run; open sides keep the body's outline.
  // -----------------------------------------------------------------------
  function brickTexture(ctx, x, y, w, h, mortar) {
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    var rows = 3, bw = w / 2;
    ctx.strokeStyle = mortar; ctx.lineWidth = Math.max(1, Math.min(w, h) * 0.03);
    for (var r = 1; r < rows; r++) {
      var ly = y + h * r / rows;
      ctx.beginPath(); ctx.moveTo(x, ly); ctx.lineTo(x + w, ly); ctx.stroke();
    }
    for (var r2 = 0; r2 < rows; r2++) {
      var off = (r2 % 2 === 0) ? 0 : bw / 2;
      var ry0 = y + h * r2 / rows, ry1 = y + h * (r2 + 1) / rows;
      for (var lx = x + off; lx < x + w - 1; lx += bw) {
        ctx.beginPath(); ctx.moveTo(lx, ry0); ctx.lineTo(lx, ry1); ctx.stroke();
      }
    }
    ctx.restore();
  }
  function paintWall(ctx, W, H, frame, dir, def, type, opts) {
    var mask = (opts && opts.mask != null) ? opts.mask : 0;
    var stone = '#8C8273', mortar = 'rgba(58,52,42,0.55)';
    var margin = Math.min(W, H) * 0.05;
    var bw = W * 0.46, bh = H * 0.46, bx = (W - bw) / 2, by = (H - bh) / 2;
    L.panel(ctx, bx, by, bw, bh, stone, { r: Math.min(bw, bh) * 0.08, hi: 22, lo: 26 });
    brickTexture(ctx, bx, by, bw, bh, mortar);
    for (var d = 0; d < 4; d++) {
      if (!(mask & (1 << d))) continue;
      var v = F.util.dirVec(d);
      if (v[0] === 0) {
        var y0 = v[1] < 0 ? margin : by + bh, y1 = v[1] < 0 ? by : H - margin;
        L.panel(ctx, bx, y0, bw, y1 - y0, stone, { r: 0, rim: true, outline: false });
      } else {
        var x0 = v[0] < 0 ? margin : bx + bw, x1 = v[0] < 0 ? bx : W - margin;
        L.panel(ctx, x0, by, x1 - x0, bh, stone, { r: 0, rim: true, outline: false });
      }
    }
  }

  F.sprites.definePainter(['small-electric-pole', 'medium-electric-pole'], paintPole);
  F.sprites.definePainter(['stone-wall'], paintWall);
})();
