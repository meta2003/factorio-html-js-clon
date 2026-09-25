// 64-sprites-logistics.js — painter pack overriding the flat-box placeholders for logistics
// entities (chests, inserter bases, poles, pipes, stone-wall) with layered, top-lit industrial
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
  // Inserter bases — octagonal bolted plate + coloured motor housing + pivot hub. Compact
  // (~70% tile) so the arm/belts/chests around it stay readable. The arm itself is drawn
  // separately every frame by 61-render.js's drawInserterArms.
  // -----------------------------------------------------------------------
  function octagonPath(ctx, cx, cy, r) {
    ctx.beginPath();
    for (var i = 0; i < 8; i++) {
      var a = Math.PI / 8 + i * Math.PI / 4;
      var px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }
  function paintInserterBase(ctx, W, H, frame, dir, def, type) {
    var col = L.entColors(def), c1 = col[0], c2 = col[1];
    var cx = W / 2, cy = H / 2, r = Math.min(W, H) * 0.35;
    var plate = '#585D61';
    octagonPath(ctx, cx, cy, r);
    var g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.05, cx, cy, r);
    g.addColorStop(0, L.lighten(plate, 22)); g.addColorStop(1, L.darken(plate, 26));
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(12,12,12,0.9)'; ctx.lineWidth = Math.max(1, r * 0.08); ctx.stroke();
    var boltPts = [];
    for (var i = 0; i < 8; i++) {
      var a = Math.PI / 8 + i * Math.PI / 4;
      boltPts.push([cx + Math.cos(a) * r * 0.82, cy + Math.sin(a) * r * 0.82]);
    }
    L.rivets(ctx, boltPts, r * 0.09);
    // coloured motor housing (colour = the item's own icon colour: burner grey, inserter
    // yellow, long-handed red, fast blue — see F.data.itemDef colours)
    L.disc(ctx, cx, cy, r * 0.6, c1, { hi: 45, lo: 32 });
    if (type === 'burner-inserter') {
      L.glow(ctx, cx, cy + r * 0.06, r * 0.3, '#FF8A2A', 0.5);
      ctx.fillStyle = 'rgba(255,138,42,0.85)';
      ctx.beginPath(); ctx.arc(cx, cy + r * 0.06, r * 0.12, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#1A1410'; ctx.lineWidth = 1; ctx.stroke();
    }
    // pivot hub (arm attaches here)
    L.disc(ctx, cx, cy, r * 0.22, c2, { hi: 30, lo: 38, outlineWidth: Math.max(1, r * 0.05) });
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
  // Pipes — neighbour-mask-driven segments (L.cylinder) from the centre to each connected
  // edge, joined by a central hub (bends/T/cross) or a single mid collar (straight runs),
  // with L.pipeNub flanges where the pipe meets the tile edge. Isolated = short capped stub.
  // pipe-to-ground: fixed geometry per spec — visible stub on the local-south (BACK) edge,
  // concrete/metal ground hatch with a dark mouth on the local-north side.
  // -----------------------------------------------------------------------
  function pipeCollar(ctx, cx, cy, angle, thick) {
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(angle);
    L.panel(ctx, -thick * 0.66, -thick * 0.15, thick * 1.32, thick * 0.3, '#6E787E', { r: thick * 0.07, rim: false, outlineWidth: 1 });
    L.rivets(ctx, [[0, -thick * 0.1], [0, thick * 0.1]], thick * 0.06);
    ctx.restore();
  }
  function pipeRun(ctx, cx, cy, d, len, thick, col) {
    var v = F.util.dirVec(d);
    if (v[0] === 0) L.cylinder(ctx, cx - thick / 2, v[1] < 0 ? cy - len : cy, thick, len, col, false, { r: thick * 0.1 });
    else L.cylinder(ctx, v[0] < 0 ? cx - len : cx, cy - thick / 2, len, thick, col, true, { r: thick * 0.1 });
  }
  function paintPipeToGround(ctx, W, H, cx, cy, thick, col) {
    var stubLen = Math.min(W, H) * 0.36;
    L.cylinder(ctx, cx - thick / 2, cy, thick, stubLen, col, false, { r: thick * 0.1 });
    L.pipeNub(ctx, cx, Math.min(H * 0.96, cy + stubLen), 2, thick * 1.05);
    L.disc(ctx, cx, cy, thick * 0.5, L.darken(col, 6), { outlineWidth: 1.2 });
    var hw = W * 0.64, hh = H * 0.42, hx = cx - hw / 2, hy = H * 0.06;
    L.panel(ctx, hx, hy, hw, hh, '#6E7478', { r: hh * 0.16, hi: 18, lo: 22 });
    L.inset(ctx, hx + hw * 0.18, hy + hh * 0.22, hw * 0.64, hh * 0.56, '#0A0B0C', hh * 0.14);
    L.rivets(ctx, [[hx + hw * 0.1, hy + hh * 0.16], [hx + hw * 0.9, hy + hh * 0.16],
      [hx + hw * 0.1, hy + hh * 0.84], [hx + hw * 0.9, hy + hh * 0.84]], thick * 0.06);
  }
  function paintPipe(ctx, W, H, frame, dir, def, type, opts) {
    var col = '#8FA3B0';
    var thick = Math.min(W, H) * 0.32;
    var cx = W / 2, cy = H / 2;
    if (type === 'pipe-to-ground') { paintPipeToGround(ctx, W, H, cx, cy, thick, col); return; }

    var mask = (opts && opts.mask != null) ? opts.mask : 0;
    var edge = Math.min(W, H) * 0.5 - thick * 0.16;

    if (mask === 0) {
      var stubLen = Math.min(W, H) * 0.46;
      L.cylinder(ctx, cx - thick / 2, cy - stubLen / 2, thick, stubLen, col, false, { r: thick * 0.12 });
      L.disc(ctx, cx, cy - stubLen / 2, thick * 0.5, L.darken(col, 10), { outlineWidth: 1.4 });
      L.disc(ctx, cx, cy + stubLen / 2, thick * 0.5, L.darken(col, 10), { outlineWidth: 1.4 });
      return;
    }

    var straightNS = mask === 5, straightEW = mask === 10; // N|S=1|4, E|W=2|8
    if (straightNS || straightEW) {
      if (straightNS) L.cylinder(ctx, cx - thick / 2, 0, thick, H, col, false, { r: thick * 0.1 });
      else L.cylinder(ctx, 0, cy - thick / 2, W, thick, col, true, { r: thick * 0.1 });
      pipeCollar(ctx, cx, cy, straightNS ? 0 : Math.PI / 2, thick);
      var ends = straightNS ? [0, 2] : [1, 3];
      for (var k = 0; k < 2; k++) {
        var v0 = F.util.dirVec(ends[k]);
        L.pipeNub(ctx, cx + v0[0] * edge, cy + v0[1] * edge, ends[k], thick * 1.05);
      }
      return;
    }

    var stubLen2 = Math.min(W, H) * 0.5;
    for (var d = 0; d < 4; d++) {
      if (!(mask & (1 << d))) continue;
      pipeRun(ctx, cx, cy, d, stubLen2, thick, col);
      var v = F.util.dirVec(d);
      L.pipeNub(ctx, cx + v[0] * edge, cy + v[1] * edge, d, thick * 1.05);
    }
    L.disc(ctx, cx, cy, thick * 0.58, L.darken(col, 6), { hi: 35, lo: 32 });
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
  F.sprites.definePainter(['burner-inserter', 'inserter', 'long-handed-inserter', 'fast-inserter', 'filter-inserter', 'stack-inserter'], paintInserterBase);
  F.sprites.definePainter(['small-electric-pole', 'medium-electric-pole'], paintPole);
  F.sprites.definePainter(['pipe', 'pipe-to-ground'], paintPipe);
  F.sprites.definePainter(['stone-wall'], paintWall);
})();
