// 64-sprites-chests.js — the wooden, iron and steel chests and the three logistic chests drawn
// after the real Factorio sprites (base/graphics/entity/{wooden,iron,steel}-chest and
// logistic-chest: hr frames 62x72 / 66x76 / 64x80 / 66x74; reference: the vanilla chests collected
// in snouz/factorio_free_graphics_for_modders). Every painter draws in the reference's own pixel
// grid (2x hr, i.e. 128 px per tile) and maps it onto the 1-tile canvas with a slight squash, since
// the originals overhang the tile by up to a quarter tile and our canvas is exactly the footprint.
//
// What the references look like (top face of the lid seen from above, front face below it):
//   - wooden chest: a picture frame of light mitred boards round four recessed planks; the front is
//     a darker frame with four planks and light edges under each;
//   - iron chest: a light steel rim round a rusty grey lid with a latch, sloping lid sides, a dark
//     band with rivets, a mottled teal/rust front panel and a row of big rivets at the foot;
//   - steel chest: a pale steel lid of vertical corrugated slats in a chunky frame, a dark front of
//     vertical slats with a lock plate and strap, rusty feet;
//   - logistic chests: a coloured lid plate with four bolts and a round grey iris hatch, side clips,
//     a coloured louvre panel in a dark steel body and a dark base with corner brackets.
(function () {
  'use strict';
  if (!F.sprites || !F.sprites.definePainter) return;

  var SX = 0.94, SY = 0.86; // reference px -> canvas px (on top of the 128 -> 64 halving)

  function hash(a, b) {
    var h = (a * 374761393 + b * 668265263) | 0;
    h = (h ^ (h >>> 13)) * 1274126177 | 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function rgb(c, a) { return a == null ? 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')' : 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function mix(c, d, t) { return [Math.round(c[0] + (d[0] - c[0]) * t), Math.round(c[1] + (d[1] - c[1]) * t), Math.round(c[2] + (d[2] - c[2]) * t)]; }
  function poly(ctx, pts, fill) {
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  }
  function rect(ctx, x0, y0, x1, y1, fill) { ctx.fillStyle = fill; ctx.fillRect(x0, y0, x1 - x0, y1 - y0); }
  function vgrad(ctx, y0, y1, c0, c1) { var g = ctx.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, c0); g.addColorStop(1, c1); return g; }
  function hgrad(ctx, x0, x1, c0, c1) { var g = ctx.createLinearGradient(x0, 0, x1, 0); g.addColorStop(0, c0); g.addColorStop(1, c1); return g; }
  function rrect(ctx, x0, y0, x1, y1, r) {
    ctx.beginPath(); ctx.moveTo(x0 + r, y0); ctx.arcTo(x1, y0, x1, y1, r); ctx.arcTo(x1, y1, x0, y1, r);
    ctx.arcTo(x0, y1, x0, y0, r); ctx.arcTo(x0, y0, x1, y0, r); ctx.closePath();
  }
  // soft stain (rust, dirt) — radial falloff, drawn source-atop by the callers' grime passes
  function blot(ctx, x, y, r, c, a) {
    var g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgb(c, a)); g.addColorStop(1, rgb(c, 0));
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  function rivet(ctx, x, y, r, c) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.beginPath(); ctx.arc(x + r * 0.35, y + r * 0.45, r * 1.1, 0, Math.PI * 2); ctx.fill();
    var g = ctx.createRadialGradient(x - r * 0.4, y - r * 0.4, r * 0.1, x, y, r);
    g.addColorStop(0, rgb(mix(c, [255, 255, 245], 0.55))); g.addColorStop(1, rgb(mix(c, [0, 0, 0], 0.35)));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  // speckle/streak weathering over everything painted so far inside the box
  function grime(ctx, seed, x0, y0, x1, y1, n, cols) {
    ctx.save(); ctx.globalCompositeOperation = 'source-atop';
    for (var i = 0; i < n; i++) {
      var h = hash(i, seed), c = cols[Math.floor(h * cols.length) % cols.length];
      ctx.fillStyle = c;
      ctx.fillRect(x0 + (x1 - x0) * hash(i, seed + 1), y0 + (y1 - y0) * hash(i, seed + 2), 1 + 2.2 * hash(i, seed + 3), 1 + 1.6 * hash(i, seed + 4));
    }
    ctx.restore();
  }
  // Map the reference grid onto the canvas: (cx, cy) = centre of the reference sprite's body.
  function place(ctx, W, H, cx, cy) {
    var k = W / 64;
    ctx.translate(W / 2, H / 2); ctx.scale(k * 0.5 * SX, k * 0.5 * SY); ctx.translate(-cx, -cy);
  }

  // -----------------------------------------------------------------------
  // Wooden chest — reference 124x144, body x 2..122, y 2..144.
  // -----------------------------------------------------------------------
  function woodGrain(ctx, x0, y0, x1, y1, seed, c, a) {
    ctx.save(); ctx.beginPath(); ctx.rect(x0, y0, x1 - x0, y1 - y0); ctx.clip();
    ctx.strokeStyle = rgb(c, a); ctx.lineWidth = 0.7;
    for (var i = 0; i < 5; i++) {
      var y = y0 + (y1 - y0) * (0.15 + 0.7 * hash(i, seed)), s = x0 + (x1 - x0) * hash(i, seed + 1) * 0.5;
      ctx.beginPath(); ctx.moveTo(s, y);
      ctx.bezierCurveTo(s + 20, y + (hash(i, seed + 2) - 0.5) * 3, s + 45, y + (hash(i, seed + 3) - 0.5) * 3, s + 30 + (x1 - x0) * 0.5 * hash(i, seed + 4), y + (hash(i, seed + 5) - 0.5) * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
  function paintWoodenChest(ctx, W, H) {
    ctx.save(); place(ctx, W, H, 62, 73);
    // --- lid: mitred frame boards round a recess of four planks
    rect(ctx, 15, 15, 109, 63, '#2E200B');
    var planks = [[16, 26.5], [27.5, 39.5], [40.5, 51.5], [52.5, 62.5]];
    planks.forEach(function (p, i) {
      ctx.fillStyle = vgrad(ctx, p[0], p[1], '#DDAF66', '#A8793A');
      ctx.fillRect(15, p[0], 94, p[1] - p[0]);
      woodGrain(ctx, 15, p[0], 109, p[1], 11 + i * 7, [110, 72, 28], 0.45);
      rect(ctx, 15, p[1] - 1, 109, p[1], 'rgba(60,38,12,0.5)');
    });
    // shade under the top board and the left board
    ctx.fillStyle = vgrad(ctx, 15, 22, 'rgba(30,18,4,0.7)', 'rgba(30,18,4,0)'); ctx.fillRect(15, 15, 94, 7);
    ctx.fillStyle = hgrad(ctx, 15, 24, 'rgba(30,18,4,0.55)', 'rgba(30,18,4,0)'); ctx.fillRect(15, 15, 9, 48);
    poly(ctx, [[2, 2], [122, 2], [109, 15], [15, 15]], vgrad(ctx, 2, 15, '#D6A45C', '#B98A45'));   // top board
    poly(ctx, [[2, 2], [15, 15], [15, 63], [2, 76]], hgrad(ctx, 2, 15, '#8C6230', '#A87A40'));      // left board
    poly(ctx, [[122, 2], [122, 76], [109, 63], [109, 15]], hgrad(ctx, 109, 122, '#C8964F', '#A6773A')); // right board
    poly(ctx, [[15, 63], [109, 63], [122, 76], [2, 76]], vgrad(ctx, 63, 76, '#EAC486', '#C99A56'));   // front lip
    woodGrain(ctx, 2, 2, 122, 15, 3, [120, 80, 34], 0.4);
    woodGrain(ctx, 2, 63, 122, 76, 5, [140, 96, 44], 0.35);
    ctx.strokeStyle = 'rgba(60,38,12,0.55)'; ctx.lineWidth = 0.8;
    [[2, 2, 15, 15], [122, 2, 109, 15], [15, 63, 2, 76], [109, 63, 122, 76]].forEach(function (m) {
      ctx.beginPath(); ctx.moveTo(m[0], m[1]); ctx.lineTo(m[2], m[3]); ctx.stroke();
    });
    // --- front face: darker frame round four planks
    rect(ctx, 2, 76, 122, 144, '#3F2C0F');
    rect(ctx, 14, 86, 110, 134, '#241807');
    var fp = [[87, 98.5], [99.5, 110.5], [111.5, 122], [123, 133.5]];
    fp.forEach(function (p, i) {
      ctx.fillStyle = vgrad(ctx, p[0], p[1], '#4A3414', '#5E421A'); ctx.fillRect(14, p[0], 96, p[1] - p[0]);
      woodGrain(ctx, 14, p[0], 110, p[1], 41 + i * 5, [30, 20, 6], 0.5);
      rect(ctx, 14, p[1] - 1.2, 110, p[1], 'rgba(196,146,72,' + (0.3 + i * 0.1).toFixed(2) + ')');
    });
    ctx.fillStyle = hgrad(ctx, 2, 14, '#4E3715', '#654820'); ctx.fillRect(2, 76, 12, 68);    // left post
    ctx.fillStyle = hgrad(ctx, 110, 122, '#6E4F22', '#56401A'); ctx.fillRect(110, 76, 12, 68); // right post
    rect(ctx, 14, 76, 110, 86, '#5A4019');                                                    // top rail
    ctx.fillStyle = vgrad(ctx, 134, 144, '#76562A', '#4A3413'); ctx.fillRect(14, 134, 96, 10); // bottom rail
    rect(ctx, 14, 133.5, 110, 135, 'rgba(210,160,84,0.7)');
    ctx.fillStyle = vgrad(ctx, 76, 88, 'rgba(12,6,0,0.75)', 'rgba(12,6,0,0)'); ctx.fillRect(2, 76, 120, 12); // lid shadow
    ctx.fillStyle = hgrad(ctx, 14, 22, 'rgba(12,6,0,0.5)', 'rgba(12,6,0,0)'); ctx.fillRect(14, 86, 8, 48);
    grime(ctx, 71, 2, 2, 122, 144, 700, ['rgba(40,24,6,0.28)', 'rgba(40,24,6,0.2)', 'rgba(255,230,170,0.12)']);
    ctx.restore();
  }

  // -----------------------------------------------------------------------
  // Iron chest — reference 132x152, body x 2..130, y 0..140.
  // -----------------------------------------------------------------------
  function paintIronChest(ctx, W, H) {
    ctx.save(); place(ctx, W, H, 66, 71);
    // sloping lid sides (the lid top is narrower than the body)
    poly(ctx, [[17, 0], [66, 0], [66, 70], [3, 70]], hgrad(ctx, 3, 30, '#4A3C33', '#6E5E52'));
    poly(ctx, [[115, 0], [66, 0], [66, 70], [129, 70]], hgrad(ctx, 102, 129, '#8C7A6A', '#6A5A4E'));
    // lid top: bright rim, rusty grey inner panel
    rrect(ctx, 21, 1, 111, 64, 4); ctx.fillStyle = vgrad(ctx, 1, 64, '#C6BCAE', '#958A7C'); ctx.fill();
    ctx.fillStyle = hgrad(ctx, 21, 30, 'rgba(255,252,240,0.45)', 'rgba(255,252,240,0)'); ctx.fillRect(21, 3, 9, 60);
    rect(ctx, 28, 8, 104, 57, '#9C8A7E');
    ctx.save(); ctx.beginPath(); ctx.rect(28, 8, 76, 49); ctx.clip();
    ctx.fillStyle = vgrad(ctx, 8, 57, '#B09E92', '#8E7E72'); ctx.fillRect(28, 8, 76, 49);
    for (var b = 0; b < 14; b++) blot(ctx, 28 + 76 * hash(b, 21), 8 + 49 * hash(b, 22), 5 + 9 * hash(b, 23), hash(b, 24) < 0.55 ? [160, 86, 52] : [200, 190, 180], 0.35);
    ctx.fillStyle = vgrad(ctx, 8, 14, 'rgba(20,14,10,0.55)', 'rgba(20,14,10,0)'); ctx.fillRect(28, 8, 76, 6);
    ctx.fillStyle = hgrad(ctx, 28, 34, 'rgba(20,14,10,0.45)', 'rgba(20,14,10,0)'); ctx.fillRect(28, 8, 6, 49);
    ctx.restore();
    rect(ctx, 28, 56, 104, 58, 'rgba(250,245,230,0.55)');
    // latch: dark base block with a light handle loop
    rrect(ctx, 44, 38, 88, 57, 4); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill();
    rrect(ctx, 45, 36, 87, 55, 4); ctx.fillStyle = vgrad(ctx, 36, 55, '#3E3C38', '#1E1D1B'); ctx.fill();
    ctx.strokeStyle = '#DCDAD2'; ctx.lineWidth = 2.6; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(55, 44); ctx.lineTo(55, 36); ctx.lineTo(77, 36); ctx.lineTo(77, 44); ctx.stroke();
    ctx.strokeStyle = '#1A1917'; ctx.lineWidth = 0.8; ctx.strokeRect(53.5, 34.5, 25, 10);
    rect(ctx, 58, 46, 75, 49, '#E6E4DC'); rect(ctx, 58, 49, 75, 50, '#55524C');
    // lid lower lip and the dark band under it
    rect(ctx, 3, 63, 129, 66, '#C8BCAE');
    ctx.fillStyle = vgrad(ctx, 66, 77, '#4A4038', '#2C2520'); ctx.fillRect(3, 66, 126, 11);
    // body
    rect(ctx, 3, 76, 129, 138, '#3E342C');
    poly(ctx, [[3, 72], [11, 76], [11, 138], [2, 139]], '#2E241F');      // left side face
    poly(ctx, [[129, 72], [121, 76], [121, 138], [130, 139]], '#57483C'); // right side face
    [86, 100, 114, 128].forEach(function (y) { rivet(ctx, 6.5, y, 1.6, [120, 100, 84]); rivet(ctx, 125.5, y, 1.6, [150, 128, 108]); });
    // front panel: teal/green paint under rust
    poly(ctx, [[16, 86], [116, 86], [118, 127], [14, 127]], '#453E30');
    ctx.save(); poly(ctx, [[16, 86], [116, 86], [118, 127], [14, 127]]); ctx.clip();
    ctx.fillStyle = vgrad(ctx, 86, 127, '#50493A', '#3C3528'); ctx.fillRect(14, 86, 104, 41);
    for (var t = 0; t < 12; t++) blot(ctx, 14 + 104 * hash(t, 31), 86 + 41 * hash(t, 32), 6 + 10 * hash(t, 33), hash(t, 34) < 0.5 ? [70, 110, 100] : [150, 80, 36], 0.45);
    ctx.fillStyle = vgrad(ctx, 86, 94, 'rgba(10,8,6,0.7)', 'rgba(10,8,6,0)'); ctx.fillRect(14, 86, 104, 8);
    ctx.restore();
    ctx.strokeStyle = '#1E1814'; ctx.lineWidth = 1.2; poly(ctx, [[16, 86], [116, 86], [118, 127], [14, 127]]); ctx.stroke();
    [24, 51, 79, 106].forEach(function (x) { rivet(ctx, x, 81, 1.8, [160, 140, 116]); });
    // foot rim with the big rivets and a toothed lower edge
    ctx.fillStyle = vgrad(ctx, 127, 139, '#4A3E34', '#2A221D'); ctx.fillRect(4, 127, 124, 12);
    [18, 42, 66, 90, 114].forEach(function (x) { rivet(ctx, x, 133, 3.2, [176, 150, 116]); });
    ctx.fillStyle = '#231C17';
    for (var z = 5; z < 127; z += 4) { ctx.beginPath(); ctx.moveTo(z, 139); ctx.lineTo(z + 2, 141); ctx.lineTo(z + 4, 139); ctx.fill(); }
    grime(ctx, 83, 2, 0, 130, 141, 900, ['rgba(30,20,14,0.3)', 'rgba(150,80,40,0.28)', 'rgba(255,240,220,0.12)']);
    ctx.restore();
  }

  // -----------------------------------------------------------------------
  // Steel chest — reference 128x160, body x 0..126, y 0..148.
  // -----------------------------------------------------------------------
  function paintSteelChest(ctx, W, H) {
    ctx.save(); place(ctx, W, H, 63, 74);
    // lid: chunky pale steel frame round vertical corrugated slats
    rect(ctx, 0, 2, 126, 80, '#9A8A94');
    rect(ctx, 10, 10, 116, 71, '#5C4650');
    var slats = [[21, 31], [40, 50], [59, 69], [76, 87], [95, 105], [110, 116]];
    slats.forEach(function (s, i) {
      ctx.fillStyle = hgrad(ctx, s[0], s[1], '#D2C6CC', '#A2949C'); ctx.fillRect(s[0], 10, s[1] - s[0], 61);
      rect(ctx, s[1] - 1.2, 10, s[1], 71, 'rgba(40,24,32,0.6)');
      rect(ctx, s[0], 10, s[0] + 1, 71, 'rgba(255,255,255,0.5)');
      void i;
    });
    [[10, 21], [31, 40], [50, 59], [69, 76], [87, 95], [105, 110]].forEach(function (s) {
      ctx.fillStyle = hgrad(ctx, s[0], s[1], '#665260', '#7C6872'); ctx.fillRect(s[0], 10, s[1] - s[0], 61);
    });
    ctx.fillStyle = vgrad(ctx, 10, 18, 'rgba(20,10,16,0.65)', 'rgba(20,10,16,0)'); ctx.fillRect(10, 10, 106, 8);
    ctx.fillStyle = vgrad(ctx, 2, 10, '#C8BCC4', '#A09098'); ctx.fillRect(0, 2, 126, 8);    // top rail
    ctx.fillStyle = hgrad(ctx, 0, 10, '#8E7E88', '#B8AAB2'); ctx.fillRect(0, 2, 10, 72);      // left post
    ctx.fillStyle = hgrad(ctx, 116, 126, '#BEB0B8', '#96868F'); ctx.fillRect(116, 2, 10, 72); // right post
    rect(ctx, 5, 10, 6.5, 70, 'rgba(40,24,32,0.55)'); rect(ctx, 120, 10, 121.5, 70, 'rgba(40,24,32,0.4)');
    // chunky corner blocks
    [[0, 0], [110, 0]].forEach(function (c) {
      rrect(ctx, c[0], c[1], c[0] + 16, c[1] + 12, 3); ctx.fillStyle = vgrad(ctx, 0, 12, '#E2D8DE', '#9C8C96'); ctx.fill();
      ctx.strokeStyle = 'rgba(30,18,24,0.6)'; ctx.lineWidth = 0.8; ctx.stroke();
    });
    ctx.fillStyle = vgrad(ctx, 70, 80, '#D0C4CA', '#8A7A84'); ctx.fillRect(0, 70, 126, 10); // lid front lip
    rect(ctx, 0, 79, 126, 81, '#2A1E1C');
    // front: dark frame, vertical slats, lock plate and strap
    rect(ctx, 0, 81, 126, 140, '#5E5046');
    ctx.fillStyle = hgrad(ctx, 0, 13, '#4E4038', '#6A5A4E'); ctx.fillRect(0, 81, 13, 59);
    rect(ctx, 13, 86, 114, 136, '#2A2019');
    [[17, 31], [35, 47], [53, 62], [66, 74], [78, 90], [94, 108]].forEach(function (s, i) {
      ctx.fillStyle = hgrad(ctx, s[0], s[1], '#3C3026', '#4E4032'); ctx.fillRect(s[0], 87, s[1] - s[0], 48);
      rect(ctx, s[0], 87, s[0] + 0.8, 135, 'rgba(160,140,100,' + (0.25 + 0.2 * hash(i, 9)).toFixed(2) + ')');
    });
    rect(ctx, 40, 87, 41.2, 135, 'rgba(190,170,130,0.55)'); rect(ctx, 96, 87, 97.2, 135, 'rgba(190,170,130,0.5)');
    ctx.fillStyle = vgrad(ctx, 86, 95, 'rgba(8,6,4,0.75)', 'rgba(8,6,4,0)'); ctx.fillRect(13, 86, 101, 9);
    // lock
    ctx.fillStyle = vgrad(ctx, 104, 136, '#56584A', '#3A3C30'); ctx.fillRect(57, 102, 10, 34);
    rect(ctx, 57, 102, 58, 136, 'rgba(210,200,170,0.5)');
    rrect(ctx, 51, 88, 75, 102, 1.5); ctx.fillStyle = '#3C3A32'; ctx.fill();
    ctx.strokeStyle = '#B8B0A0'; ctx.lineWidth = 1.2; ctx.stroke();
    rrect(ctx, 52, 97, 75, 105, 1.5); ctx.fillStyle = vgrad(ctx, 97, 105, '#E2DCCC', '#8C8676'); ctx.fill();
    rect(ctx, 52, 104, 75, 105.5, 'rgba(10,8,6,0.7)');
    // foot: rusty lower rail and corner feet
    ctx.fillStyle = vgrad(ctx, 136, 146, '#5A4230', '#3A2618'); ctx.fillRect(0, 136, 126, 10);
    rect(ctx, 13, 136, 114, 137.2, 'rgba(210,180,130,0.55)');
    rrect(ctx, 0, 138, 14, 148, 2); ctx.fillStyle = '#4A3020'; ctx.fill();
    rrect(ctx, 112, 138, 126, 148, 2); ctx.fillStyle = '#5A3A24'; ctx.fill();
    // rust
    ctx.save(); ctx.globalCompositeOperation = 'source-atop';
    [[4, 140, 12], [122, 142, 10], [2, 60, 8], [124, 20, 7], [30, 138, 9], [100, 90, 8], [8, 100, 9]].forEach(function (r, i) {
      blot(ctx, r[0], r[1], r[2], [160, 84, 36], 0.55 + 0.1 * hash(i, 4));
    });
    ctx.restore();
    grime(ctx, 97, 0, 0, 126, 148, 1000, ['rgba(40,24,30,0.3)', 'rgba(150,84,44,0.25)', 'rgba(255,245,250,0.16)']);
    ctx.restore();
  }

  // -----------------------------------------------------------------------
  // Logistic chests — reference 132x144, body x 2..131, y 2..144; colours sampled per mode.
  // -----------------------------------------------------------------------
  var LOGI = {
    'passive-provider-chest': { top: [236, 96, 84], bot: [190, 70, 60], lo: [118, 28, 20], louv: [168, 38, 28] },
    'storage-chest': { top: [216, 172, 64], bot: [178, 140, 50], lo: [96, 74, 12], louv: [150, 116, 22] },
    'requester-chest': { top: [108, 172, 198], bot: [86, 138, 160], lo: [22, 60, 72], louv: [44, 110, 128] },
  };
  function paintLogisticChest(ctx, W, H, frame, dir, def, type) {
    var c = LOGI[type] || LOGI['storage-chest'];
    ctx.save(); place(ctx, W, H, 66, 73);
    // dark steel body flaring out towards the base
    poly(ctx, [[9, 50], [123, 50], [128, 122], [4, 122]], '#433A2E');
    poly(ctx, [[9, 50], [21, 62], [17, 120], [4, 122]], hgrad(ctx, 4, 20, '#2A241C', '#3A3228'));   // left side face
    poly(ctx, [[123, 50], [111, 62], [115, 120], [128, 122]], hgrad(ctx, 111, 128, '#4E4638', '#6A6050')); // right side face
    rect(ctx, 127 - 1.4, 60, 127, 120, rgb(c.louv, 0.55));
    ctx.fillStyle = vgrad(ctx, 56, 68, '#6E5A44', '#3E3428'); poly(ctx, [[12, 56], [120, 56], [112, 68], [20, 68]]); ctx.fill();
    // louvre panel
    var LP = [[26, 70], [106, 70], [110, 118], [22, 118]];
    poly(ctx, LP, rgb(c.lo));
    ctx.save(); poly(ctx, LP); ctx.clip();
    for (var i = 0; i < 7; i++) {
      var y0 = 71 + i * 6.8;
      ctx.fillStyle = vgrad(ctx, y0, y0 + 5.4, rgb(mix(c.louv, [255, 255, 255], 0.18)), rgb(mix(c.louv, [0, 0, 0], 0.25)));
      ctx.fillRect(20, y0, 92, 5.4);
      rect(ctx, 20, y0, 112, y0 + 0.8, rgb(mix(c.louv, [255, 240, 230], 0.4), 0.8));
    }
    ctx.fillStyle = vgrad(ctx, 70, 78, 'rgba(6,4,2,0.75)', 'rgba(6,4,2,0)'); ctx.fillRect(20, 70, 92, 8);
    ctx.fillStyle = hgrad(ctx, 22, 30, 'rgba(6,4,2,0.55)', 'rgba(6,4,2,0)'); ctx.fillRect(20, 70, 10, 48);
    ctx.restore();
    ctx.strokeStyle = '#1C1812'; ctx.lineWidth = 1.2; poly(ctx, LP); ctx.stroke();
    // base with corner brackets
    ctx.fillStyle = vgrad(ctx, 118, 144, '#3A3A32', '#24241E'); ctx.fillRect(4, 118, 124, 26);
    rect(ctx, 30, 121, 102, 141, '#2E302A');
    rect(ctx, 30, 121, 102, 122, 'rgba(200,190,160,0.25)');
    [[4, 30, 1], [102, 128, -1]].forEach(function (b) {
      var x0 = b[0], x1 = b[1];
      poly(ctx, [[x0, 116], [x1, 116], [x1, 144], [x0, 144]], vgrad(ctx, 116, 144, '#57534A', '#34322C'));
      ctx.strokeStyle = '#161410'; ctx.lineWidth = 1; ctx.strokeRect(x0 + 0.5, 116.5, x1 - x0 - 1, 27);
      var xi = b[2] > 0 ? x0 + 7 : x1 - 7, xo = b[2] > 0 ? x1 - 6 : x0 + 6;
      rivet(ctx, xi, 124, 2.2, [150, 144, 128]); rivet(ctx, xi, 137, 2.2, [150, 144, 128]); rivet(ctx, xo, 137, 2.2, [150, 144, 128]);
    });
    // side clips
    [[4, 16], [116, 128]].forEach(function (s, i) {
      ctx.strokeStyle = '#1A1814'; ctx.lineWidth = 4.4; ctx.strokeRect(s[0] + 2, 18, s[1] - s[0] - 4, 22);
      ctx.strokeStyle = i ? '#B4AE9E' : '#8A8474'; ctx.lineWidth = 2.4; ctx.strokeRect(s[0] + 2, 18, s[1] - s[0] - 4, 22);
    });
    // coloured lid plate
    rrect(ctx, 14, 3, 118, 58, 6); ctx.fillStyle = rgb(mix(c.bot, [0, 0, 0], 0.4)); ctx.fill();
    rrect(ctx, 14, 2, 118, 55, 6); ctx.fillStyle = vgrad(ctx, 2, 55, rgb(c.top), rgb(c.bot)); ctx.fill();
    ctx.save(); rrect(ctx, 14, 2, 118, 55, 6); ctx.clip();
    ctx.fillStyle = hgrad(ctx, 14, 26, 'rgba(0,0,0,0.3)', 'rgba(0,0,0,0)'); ctx.fillRect(14, 2, 12, 53);
    rect(ctx, 14, 2, 118, 3.5, 'rgba(255,255,255,0.35)');
    ctx.restore();
    // bolts
    [[25, 9], [107, 9], [27, 48], [105, 48]].forEach(function (p) {
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.arc(p[0] + 1, p[1] + 1.2, 4.6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath();
      for (var j = 0; j < 6; j++) { var a = j * Math.PI / 3 + 0.3; ctx.lineTo(p[0] + Math.cos(a) * 4.2, p[1] + Math.sin(a) * 4.2); }
      ctx.closePath(); ctx.fillStyle = '#5A544A'; ctx.fill();
      ctx.fillStyle = '#9A9282'; ctx.beginPath(); ctx.arc(p[0] - 0.6, p[1] - 0.6, 2, 0, Math.PI * 2); ctx.fill();
    });
    // iris hatch
    var hx = 66, hy = 29, rx = 29, ry = 22;
    ctx.beginPath(); ctx.ellipse(hx, hy + 1.5, rx + 3, ry + 3, 0, 0, Math.PI * 2); ctx.fillStyle = rgb(mix(c.bot, [0, 0, 0], 0.55)); ctx.fill();
    ctx.beginPath(); ctx.ellipse(hx, hy, rx + 2, ry + 2, 0, 0, Math.PI * 2); ctx.fillStyle = '#3A342C'; ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.ellipse(hx, hy, rx, ry, 0, 0, Math.PI * 2); ctx.clip();
    var ig = ctx.createRadialGradient(hx - 8, hy - 8, 2, hx, hy, rx);
    ig.addColorStop(0, '#B4AC96'); ig.addColorStop(0.7, '#8A826E'); ig.addColorStop(1, '#5E5848');
    ctx.fillStyle = ig; ctx.fillRect(hx - rx, hy - ry, rx * 2, ry * 2);
    ctx.fillStyle = vgrad(ctx, hy - ry, hy - ry + 7, 'rgba(0,0,0,0.5)', 'rgba(0,0,0,0)'); ctx.fillRect(hx - rx, hy - ry, rx * 2, 7);
    // four curved iris blades meeting at the centre
    for (var q = 0; q < 4; q++) {
      var a0 = q * Math.PI / 2 - Math.PI / 4;
      ctx.beginPath(); ctx.moveTo(hx, hy);
      ctx.quadraticCurveTo(hx + Math.cos(a0 + 0.9) * rx * 0.6, hy + Math.sin(a0 + 0.9) * ry * 0.6, hx + Math.cos(a0) * rx * 1.05, hy + Math.sin(a0) * ry * 1.05);
      ctx.strokeStyle = 'rgba(30,26,20,0.85)'; ctx.lineWidth = 1.4; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(hx + 1, hy + 1);
      ctx.quadraticCurveTo(hx + Math.cos(a0 + 0.9) * rx * 0.6 + 1, hy + Math.sin(a0 + 0.9) * ry * 0.6 + 1, hx + Math.cos(a0) * rx * 1.05 + 1, hy + Math.sin(a0) * ry * 1.05 + 1);
      ctx.strokeStyle = 'rgba(230,224,206,0.35)'; ctx.lineWidth = 0.8; ctx.stroke();
    }
    ctx.restore();
    ctx.beginPath(); ctx.ellipse(hx, hy, rx + 2, ry + 2, 0, 0.9 * Math.PI, 1.6 * Math.PI);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1; ctx.stroke();
    grime(ctx, 113 + type.length, 2, 2, 131, 144, 900, ['rgba(20,16,10,0.3)', 'rgba(120,70,30,0.22)', 'rgba(255,250,240,0.12)']);
    ctx.restore();
  }

  F.sprites.definePainter('wooden-chest', paintWoodenChest);
  F.sprites.definePainter('iron-chest', paintIronChest);
  F.sprites.definePainter('steel-chest', paintSteelChest);
  F.sprites.definePainter(['passive-provider-chest', 'storage-chest', 'requester-chest'], paintLogisticChest);
})();
