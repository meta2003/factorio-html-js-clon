// 64-sprites-logistics.js — painter pack overriding the flat-box placeholders for logistics
// entities (chests, poles, stone-wall; inserters and pipes live in 64-sprites-inserters/-pipes.js) with layered, top-lit industrial
// art. See design/BUILDING-ART.md for the painter contract/style and src/60-sprites.js "Building
// art library" for the shared helpers (F.sprites.lib). Registers via F.sprites.definePainter;
// never edits 60-sprites.js. Deterministic only (no Math.random — none of these entities need
// per-instance variation).
(function () {
  'use strict';
  if (!F.sprites || !F.sprites.definePainter) return;
  var L = F.sprites.lib;

  // -----------------------------------------------------------------------
  // Chests — inset ~84% square body (spec), lid seam ~32% down, latch/lock straddling the
  // seam, per-material trim (wood planks+brackets / iron rivets / steel bands+lock).
  // -----------------------------------------------------------------------
  function paintChest(ctx, W, H, frame, dir, def, type) {
    var col = L.entColors(def), c1 = col[0], c2 = col[1];
    var pad = W * 0.08, x = pad, y = pad, w = W - pad * 2, h = H - pad * 2;
    var lidH = h * 0.34, bodyY = y + lidH + h * 0.025, bodyH = h - lidH - h * 0.025;
    L.panel(ctx, x, y, w, lidH, L.lighten(c1, 6), { r: w * 0.06, hi: 34, lo: 16 });
    L.panel(ctx, x, bodyY, w, bodyH, c2, { r: w * 0.06, hi: 12, lo: 32 });
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(x + w * 0.04, y + lidH - h * 0.012, w * 0.92, h * 0.028);

    if (type === 'wooden-chest') {
      ctx.strokeStyle = L.darken(c1, 30); ctx.lineWidth = Math.max(1, w * 0.02);
      for (var i = 1; i < 4; i++) {
        var lx = x + w * i / 4;
        ctx.beginPath(); ctx.moveTo(lx, bodyY + bodyH * 0.06); ctx.lineTo(lx, bodyY + bodyH * 0.94); ctx.stroke();
      }
      ctx.strokeStyle = L.darken(c1, 15); ctx.lineWidth = Math.max(1, w * 0.012);
      ctx.beginPath(); ctx.moveTo(x + w * 0.03, y + lidH * 0.5); ctx.lineTo(x + w * 0.97, y + lidH * 0.5); ctx.stroke();
      // iron corner brackets (L-shaped) at all four corners of the whole silhouette
      var bs = w * 0.17, bt = bs * 0.26, bracketCol = '#4A4D50';
      [[x, y, 1, 1], [x + w - bs, y, -1, 1], [x, y + h - bs, 1, -1], [x + w - bs, y + h - bs, -1, -1]].forEach(function (p) {
        var bx = p[0], by = p[1];
        ctx.fillStyle = bracketCol;
        ctx.fillRect(bx, p[3] > 0 ? by : by + bs - bt, bs, bt);
        ctx.fillRect(p[2] > 0 ? bx : bx + bs - bt, by, bt, bs);
        ctx.strokeStyle = '#141414'; ctx.lineWidth = 1;
        ctx.strokeRect(bx, p[3] > 0 ? by : by + bs - bt, bs, bt);
        ctx.strokeRect(p[2] > 0 ? bx : bx + bs - bt, by, bt, bs);
      });
      L.rivets(ctx, [[x + bs * 0.5, y + bs * 0.5], [x + w - bs * 0.5, y + bs * 0.5],
        [x + bs * 0.5, y + h - bs * 0.5], [x + w - bs * 0.5, y + h - bs * 0.5]], w * 0.018);
    } else if (type === 'iron-chest') {
      L.rivets(ctx, [[x + w * 0.08, y + h * 0.08], [x + w * 0.92, y + h * 0.08],
        [x + w * 0.08, y + h * 0.92], [x + w * 0.92, y + h * 0.92],
        [x + w * 0.08, y + lidH * 0.5], [x + w * 0.92, y + lidH * 0.5]], w * 0.026);
    } else { // steel-chest: darker reinforced bands + lock
      var bandCol = L.darken(c1, 22);
      ctx.fillStyle = bandCol;
      ctx.fillRect(x + w * 0.16, bodyY, w * 0.07, bodyH);
      ctx.fillRect(x + w * 0.77, bodyY, w * 0.07, bodyH);
      ctx.strokeStyle = '#141414'; ctx.lineWidth = 1;
      ctx.strokeRect(x + w * 0.16, bodyY, w * 0.07, bodyH);
      ctx.strokeRect(x + w * 0.77, bodyY, w * 0.07, bodyH);
      L.rivets(ctx, [[x + w * 0.195, bodyY + bodyH * 0.18], [x + w * 0.195, bodyY + bodyH * 0.82],
        [x + w * 0.805, bodyY + bodyH * 0.18], [x + w * 0.805, bodyY + bodyH * 0.82]], w * 0.02);
    }

    // latch (wooden/iron) or lock (steel) straddling the lid seam
    if (type === 'steel-chest') {
      var lr = w * 0.075;
      L.disc(ctx, x + w * 0.5, y + lidH, lr, '#2A2C2E', { hi: 40, lo: 30, outlineWidth: 1.4 });
      ctx.fillStyle = '#141414'; ctx.fillRect(x + w * 0.5 - lr * 0.16, y + lidH, lr * 0.32, lr * 1.1);
    } else {
      var lw = w * 0.16, lh = h * 0.1;
      L.panel(ctx, x + w / 2 - lw / 2, y + lidH - lh * 0.5, lw, lh, L.darken(c1, 40), { r: lh * 0.3, rim: false, outlineWidth: 1 });
      ctx.fillStyle = L.lighten(c1, 55);
      ctx.beginPath(); ctx.arc(x + w / 2, y + lidH, lw * 0.13, 0, Math.PI * 2); ctx.fill();
    }
  }

  // -----------------------------------------------------------------------
  // Electric poles — small footprint, top-down: footing shadow, shaft, cross-arm with
  // insulators at the wire attach point (~0.35 tile above centre). Mostly transparent.
  // -----------------------------------------------------------------------
  function paintPole(ctx, W, H, frame, dir, def) {
    var wood = def.id === 'small-electric-pole';
    var col = wood ? '#8B5A2B' : '#8A9399';
    var dark = wood ? '#4A2E14' : '#4A5157';
    var cx = W / 2, baseY = H * 0.9, topY = H * 0.12;
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath(); ctx.ellipse(cx, baseY + H * 0.02, W * 0.13, H * 0.045, 0, 0, Math.PI * 2); ctx.fill();
    L.cylinder(ctx, cx - W * 0.045, topY, W * 0.09, baseY - topY, col, false, { r: W * 0.02 });
    if (!wood) {
      // steel lattice cross-bracing on the shaft
      ctx.strokeStyle = L.darken(col, 30); ctx.lineWidth = Math.max(1, W * 0.018);
      ctx.beginPath();
      ctx.moveTo(cx - W * 0.043, topY + (baseY - topY) * 0.12); ctx.lineTo(cx + W * 0.043, topY + (baseY - topY) * 0.42);
      ctx.moveTo(cx + W * 0.043, topY + (baseY - topY) * 0.12); ctx.lineTo(cx - W * 0.043, topY + (baseY - topY) * 0.42);
      ctx.moveTo(cx - W * 0.043, topY + (baseY - topY) * 0.44); ctx.lineTo(cx + W * 0.043, topY + (baseY - topY) * 0.74);
      ctx.moveTo(cx + W * 0.043, topY + (baseY - topY) * 0.44); ctx.lineTo(cx - W * 0.043, topY + (baseY - topY) * 0.74);
      ctx.stroke();
    }
    var armY = H / 2 - 0.35 * L.PX;
    var armW = wood ? W * 0.4 : W * 0.56, armH = H * 0.045;
    L.cylinder(ctx, cx - armW / 2, armY - armH / 2, armW, armH, dark, true, { r: armH * 0.4 });
    var insCol = wood ? '#C9772E' : '#B9C2C9';
    L.disc(ctx, cx - armW * 0.42, armY, W * 0.045, insCol, { outlineWidth: 1 });
    L.disc(ctx, cx + armW * 0.42, armY, W * 0.045, insCol, { outlineWidth: 1 });
    L.disc(ctx, cx, armY, W * 0.05, insCol, { outlineWidth: 1 });
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

  F.sprites.definePainter(['wooden-chest', 'iron-chest', 'steel-chest'], paintChest);
  F.sprites.definePainter(['small-electric-pole', 'medium-electric-pole'], paintPole);
  F.sprites.definePainter(['stone-wall'], paintWall);
})();
