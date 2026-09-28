// 62-sprites-furnaces.js — stone, steel and electric furnaces drawn after the real Factorio
// sprites (base/graphics/entity/{stone,steel,electric}-furnace; references: the vanilla-based
// bases in kirazy/reskins-bobs and Bob's electric-furnace.png). hr = 64 px per tile like our
// sprites, so the numbers are hr pixels of the footprint (128 for 2x2, 192 for 3x3).
//
// What the reference looks like:
//   - stone furnace: a squat stepped pyramid of sandy stone blocks with dark mortar, sloped
//     sides, a square flue on the flat top and an arched fire mouth low in the front face; fire
//     glows in the mouth and the flue while smelting;
//   - steel furnace: a dark oily steel block with a tangle of brass pipes on the top-left, a tall
//     black chimney stack at the back right and a wide brass-framed fire window at the front;
//   - electric furnace: blue-grey steel machinery — two round fan housings with three-bladed
//     propellers (spinning while working), a louvred vent, three white pressure cylinders, pipes
//     along the edges and a teal-grey front skirt with a riveted heater window whose coils glow
//     orange while working.
// Frame 0..15 loops while working; idle = cold and still.
(function () {
  'use strict';
  if (!F.sprites || !F.sprites.definePainter) return;
  var L = F.sprites.lib;

  function hash(a, b) {
    var h = (a * 374761393 + b * 668265263) | 0;
    h = (h ^ (h >>> 13)) * 1274126177 | 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function poly(ctx, pts, k) {
    ctx.beginPath(); ctx.moveTo(pts[0][0] * k, pts[0][1] * k);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] * k, pts[i][1] * k);
    ctx.closePath();
  }
  function flicker(f, i) { return 0.75 + 0.25 * Math.sin((f / 16) * Math.PI * 2 * (i ? 2 : 1) + i); }
  function grime(ctx, k, size, n, seed) {
    ctx.save(); ctx.globalCompositeOperation = 'source-atop';
    for (var i = 0; i < n; i++) {
      var h = hash(i, seed);
      ctx.fillStyle = h < 0.65 ? 'rgba(20,14,8,' + (0.12 + 0.18 * hash(i, 5)).toFixed(2) + ')' : 'rgba(255,245,230,' + (0.06 + 0.08 * hash(i, 6)).toFixed(2) + ')';
      var sz = (0.8 + 1.6 * hash(i, 8)) * k;
      ctx.fillRect(size * hash(i, 3) * k, size * hash(i, 4) * k, sz, sz);
    }
    ctx.restore();
  }
  // Fire bed inside the current path (clip): glowing coals + flickering flames.
  function fire(ctx, x, y, w, h, k, f) {
    var g = ctx.createLinearGradient(0, y * k, 0, (y + h) * k);
    g.addColorStop(0, 'rgba(255,120,30,0.25)'); g.addColorStop(0.55, '#E8641C'); g.addColorStop(1, '#FFD27A');
    ctx.fillStyle = g; ctx.fillRect(x * k, y * k, w * k, h * k);
    for (var i = 0; i < 5; i++) {
      var fx = x + w * (0.15 + i * 0.18), fh = h * (0.45 + 0.35 * flicker(f, i) * hash(i, 3));
      ctx.fillStyle = i % 2 ? 'rgba(255,220,120,0.9)' : 'rgba(255,160,50,0.85)';
      ctx.beginPath(); ctx.moveTo((fx - w * 0.08) * k, (y + h) * k); ctx.quadraticCurveTo(fx * k, (y + h - fh * 1.3) * k, (fx + w * 0.08) * k, (y + h) * k); ctx.fill();
    }
  }
  // Fire light on the building only (source-atop): light spilling onto transparent pixels would
  // turn into a dark ring in the silhouette shadow 60-sprites.js casts.
  function glow(ctx, cx, cy, r, k, a) {
    ctx.save(); ctx.globalCompositeOperation = 'source-atop';
    L.glow(ctx, cx * k, cy * k, r * k, '#FF8A2A', a);
    ctx.restore();
  }

  // ---------------------------------------------------------------------
  // Stone furnace (2x2 = 128)
  // ---------------------------------------------------------------------
  var STONE = '#A38C68', STONE_HI = '#C9B48C', STONE_LO = '#4E4A46', MORTAR = '#2A231B', STONE_GREY = '#5E5B55';
  function stoneBlocks(ctx, x0, y0, x1, y1, rows, k, seed, shade) {
    var rh = (y1 - y0) / rows;
    for (var r = 0; r < rows; r++) {
      var y = y0 + r * rh, n = 4 + (r % 2), bw = (x1 - x0) / n, off = r % 2 ? -bw / 2 : 0;
      for (var c = 0; c <= n; c++) {
        var bx = Math.max(x0, x0 + off + c * bw), bx1 = Math.min(x1, x0 + off + (c + 1) * bw);
        if (bx1 - bx < 2) continue;
        var t = hash(seed + r * 7 + c, 3), grey = (r >= rows * 0.45) || hash(seed + c, r) < 0.25;
        ctx.fillStyle = shade ? L.mix(STONE_LO, '#2E2B28', t * 0.6) : L.mix(grey ? STONE_GREY : STONE, grey ? '#3E3C38' : STONE_HI, t * 0.5);
        ctx.fillRect((bx + 0.6) * k, (y + 0.6) * k, (bx1 - bx - 1.2) * k, (rh - 1.2) * k);
        ctx.fillStyle = 'rgba(255,245,220,0.18)'; ctx.fillRect((bx + 0.6) * k, (y + 0.6) * k, (bx1 - bx - 1.2) * k, 1 * k);
      }
    }
  }
  function paintStoneFurnace(ctx, W, H, frame, dir, def, type, opts) {
    var k = W / 128, working = !!(opts && opts.working), f = working ? frame & 15 : 0;
    ctx.clearRect(0, 0, W, H);
    // mortar body (outline of the whole pyramid)
    poly(ctx, [[36, 12], [92, 12], [118, 114], [10, 114]], k); ctx.fillStyle = MORTAR; ctx.fill();
    // sloped sides: lit west, shaded east
    ctx.save(); poly(ctx, [[36, 14], [44, 14], [30, 112], [12, 112]], k); ctx.clip(); stoneBlocks(ctx, 10, 14, 46, 112, 9, k, 1, false); ctx.fillStyle = 'rgba(255,240,210,0.12)'; ctx.fillRect(0, 0, W, H); ctx.restore();
    ctx.save(); poly(ctx, [[84, 14], [92, 14], [116, 112], [98, 112]], k); ctx.clip(); stoneBlocks(ctx, 82, 14, 118, 112, 9, k, 2, true); ctx.restore();
    // top platform with the flue
    poly(ctx, [[40, 14], [88, 14], [92, 40], [36, 40]], k); ctx.fillStyle = STONE; ctx.fill();
    ctx.save(); poly(ctx, [[40, 14], [88, 14], [92, 40], [36, 40]], k); ctx.clip(); stoneBlocks(ctx, 36, 14, 92, 40, 2, k, 3, false); ctx.restore();
    ctx.fillStyle = '#1A140E'; ctx.fillRect(48 * k, 18 * k, 32 * k, 16 * k);
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(48 * k, 18 * k, 32 * k, 4 * k);
    if (working) { var fg = ctx.createRadialGradient(64 * k, 28 * k, 1, 64 * k, 28 * k, 14 * k); fg.addColorStop(0, 'rgba(255,170,60,' + (0.8 * flicker(f, 1)).toFixed(2) + ')'); fg.addColorStop(1, 'rgba(255,90,20,0)'); ctx.fillStyle = fg; ctx.fillRect(48 * k, 18 * k, 32 * k, 16 * k); }
    // stepped front face
    poly(ctx, [[36, 40], [92, 40], [100, 112], [28, 112]], k); ctx.fillStyle = MORTAR; ctx.fill();
    ctx.save(); poly(ctx, [[36, 40], [92, 40], [100, 112], [28, 112]], k); ctx.clip(); stoneBlocks(ctx, 28, 40, 100, 112, 6, k, 4, false); ctx.restore();
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(36 * k, 40 * k, 56 * k, 2 * k);
    // fire mouth: stone lintel + dark arch
    ctx.fillStyle = STONE; ctx.fillRect(44 * k, 66 * k, 40 * k, 8 * k);
    ctx.fillStyle = MORTAR; ctx.fillRect(44 * k, 73 * k, 40 * k, 1.2 * k);
    var arch = function () { ctx.beginPath(); ctx.moveTo(50 * k, 112 * k); ctx.lineTo(50 * k, 84 * k); ctx.quadraticCurveTo(64 * k, 74 * k, 78 * k, 84 * k); ctx.lineTo(78 * k, 112 * k); ctx.closePath(); };
    arch(); ctx.fillStyle = '#120D09'; ctx.fill();
    if (working) { ctx.save(); arch(); ctx.clip(); fire(ctx, 50, 86, 28, 26, k, f); ctx.restore(); glow(ctx, 64, 106, 34, k, 0.35 * flicker(f, 0)); }
    arch(); ctx.strokeStyle = MORTAR; ctx.lineWidth = 1.2 * k; ctx.stroke();
    // front step blocks each side of the mouth
    ctx.fillStyle = STONE; ctx.fillRect(38 * k, 104 * k, 12 * k, 10 * k); ctx.fillRect(78 * k, 104 * k, 12 * k, 10 * k);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(38 * k, 112 * k, 12 * k, 2 * k); ctx.fillRect(78 * k, 112 * k, 12 * k, 2 * k);
    grime(ctx, k, 128, 700, 17);
  }

  // ---------------------------------------------------------------------
  // Steel furnace (2x2 = 128)
  // ---------------------------------------------------------------------
  var BRASS = '#B08A3E', BRASS_HI = '#F0D38A', BRASS_LO = '#5A4216';
  function pipe(ctx, pts, w, k) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    var path = function () { ctx.beginPath(); ctx.moveTo(pts[0][0] * k, pts[0][1] * k); for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] * k, pts[i][1] * k); };
    path(); ctx.strokeStyle = '#1A140A'; ctx.lineWidth = (w + 2) * k; ctx.stroke();
    path(); ctx.strokeStyle = BRASS; ctx.lineWidth = w * k; ctx.stroke();
    ctx.save(); ctx.translate(-w * 0.18 * k, -w * 0.22 * k); path(); ctx.strokeStyle = BRASS_HI; ctx.lineWidth = w * 0.3 * k; ctx.stroke(); ctx.restore();
  }
  function paintSteelFurnace(ctx, W, H, frame, dir, def, type, opts) {
    var k = W / 128, working = !!(opts && opts.working), f = working ? frame & 15 : 0;
    ctx.clearRect(0, 0, W, H);
    // body: top face + front face
    L.roundRectPath(ctx, 10 * k, 22 * k, 108 * k, 60 * k, 6 * k);
    var tg = ctx.createLinearGradient(0, 22 * k, 0, 82 * k); tg.addColorStop(0, '#4A4E42'); tg.addColorStop(1, '#23261F');
    ctx.fillStyle = tg; ctx.fill();
    L.roundRectPath(ctx, 8 * k, 70 * k, 112 * k, 48 * k, 4 * k);
    var fg = ctx.createLinearGradient(8 * k, 0, 120 * k, 0); fg.addColorStop(0, '#4A4E44'); fg.addColorStop(0.5, '#34382F'); fg.addColorStop(1, '#1C1F1A');
    ctx.fillStyle = fg; ctx.fill(); ctx.strokeStyle = '#0F100D'; ctx.lineWidth = 1 * k; ctx.stroke();
    ctx.fillStyle = 'rgba(160,110,40,0.35)'; ctx.fillRect(8 * k, 70 * k, 112 * k, 2 * k);
    // brass pipe tangle on the top-left
    pipe(ctx, [[18, 60], [18, 36], [30, 26], [52, 26]], 7, k);
    pipe(ctx, [[26, 66], [26, 44], [44, 44], [60, 44], [60, 58]], 6, k);
    pipe(ctx, [[40, 30], [40, 16], [58, 12], [74, 16], [74, 30]], 6, k);
    pipe(ctx, [[48, 58], [48, 36], [66, 36]], 5, k);
    pipe(ctx, [[12, 70], [12, 54], [22, 30]], 5, k);
    pipe(ctx, [[62, 66], [70, 60], [70, 40], [82, 32]], 5, k);
    pipe(ctx, [[30, 36], [34, 22], [50, 18]], 4, k);
    [[18, 48], [40, 26], [60, 50], [26, 56]].forEach(function (p) { L.disc(ctx, p[0] * k, p[1] * k, 3.2 * k, '#6A5A3A', { outlineWidth: 0.8 * k }); });
    // chimney stack: bulbous base and tall black stack
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(96 * k, 66 * k, 20 * k, 10 * k, 0, 0, Math.PI * 2); ctx.fill();
    L.cylinder(ctx, 80 * k, 38 * k, 32 * k, 30 * k, '#2E332C', false, { r: 10 * k });
    L.cylinder(ctx, 86 * k, 4 * k, 20 * k, 44 * k, '#1F221E', false, { r: 3 * k });
    ctx.fillStyle = BRASS_LO; ctx.fillRect(86 * k, 22 * k, 20 * k, 3 * k);
    ctx.fillStyle = '#0A0B09'; ctx.beginPath(); ctx.ellipse(96 * k, 6 * k, 8 * k, 3.5 * k, 0, 0, Math.PI * 2); ctx.fill();
    if (working) { ctx.fillStyle = 'rgba(255,140,50,' + (0.5 * flicker(f, 1)).toFixed(2) + ')'; ctx.beginPath(); ctx.ellipse(96 * k, 6.5 * k, 6 * k, 2.5 * k, 0, 0, Math.PI * 2); ctx.fill(); }
    // brass-framed fire window
    L.roundRectPath(ctx, 28 * k, 82 * k, 64 * k, 28 * k, 4 * k);
    var bg = ctx.createLinearGradient(0, 82 * k, 0, 110 * k); bg.addColorStop(0, BRASS_HI); bg.addColorStop(0.5, BRASS); bg.addColorStop(1, BRASS_LO);
    ctx.fillStyle = bg; ctx.fill(); ctx.strokeStyle = '#1A140A'; ctx.lineWidth = 1 * k; ctx.stroke();
    L.roundRectPath(ctx, 34 * k, 87 * k, 52 * k, 18 * k, 3 * k); ctx.fillStyle = '#0C0A08'; ctx.fill();
    if (working) { ctx.save(); L.roundRectPath(ctx, 34 * k, 87 * k, 52 * k, 18 * k, 3 * k); ctx.clip(); fire(ctx, 34, 87, 52, 18, k, f); ctx.restore(); glow(ctx, 60, 108, 36, k, 0.35 * flicker(f, 0)); }
    // feet
    ctx.fillStyle = '#15160F'; ctx.fillRect(10 * k, 116 * k, 12 * k, 5 * k); ctx.fillRect(106 * k, 116 * k, 12 * k, 5 * k);
    grime(ctx, k, 128, 700, 23);
  }

  // ---------------------------------------------------------------------
  // Electric furnace (3x3 = 192)
  // ---------------------------------------------------------------------
  var BLUE = '#4E626E', BLUE_HI = '#8EA4B0', BLUE_LO = '#1E282E', SKIRT = '#4F6765', RUSTC = 'rgba(160,98,46,';
  function fan(ctx, cx, cy, r, ang, k) {
    L.disc(ctx, cx * k, cy * k, (r + 3) * k, '#3E4A52', { outlineWidth: 1 * k });
    ctx.fillStyle = '#121518'; ctx.beginPath(); ctx.arc(cx * k, cy * k, r * k, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.translate(cx * k, cy * k); ctx.rotate(ang);
    for (var b = 0; b < 3; b++) {
      ctx.rotate(Math.PI * 2 / 3);
      ctx.fillStyle = '#9AA4AA'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(r * 0.5 * k, -r * 0.35 * k, r * 0.92 * k, -r * 0.1 * k); ctx.lineTo(r * 0.85 * k, r * 0.18 * k); ctx.quadraticCurveTo(r * 0.4 * k, r * 0.1 * k, 0, 0); ctx.fill();
    }
    ctx.restore();
    L.disc(ctx, cx * k, cy * k, r * 0.22 * k, '#6E777C', { outlineWidth: 0.6 * k });
  }
  function tank(ctx, x, y, w, h, k) {
    L.cylinder(ctx, x * k, y * k, w * k, h * k, '#C8D2D8', true, { r: h * 0.45 * k });
    ctx.fillStyle = RUSTC + '0.4)'; ctx.fillRect((x + w * 0.2) * k, (y + h * 0.7) * k, w * 0.5 * k, h * 0.2 * k);
    ctx.fillStyle = '#2A3036'; ctx.fillRect((x + w * 0.45) * k, y * k, 2 * k, h * k);
  }
  function paintElectricFurnace(ctx, W, H, frame, dir, def, type, opts) {
    var k = W / 192, working = !!(opts && opts.working), f = working ? frame & 15 : 0, ang = f / 16 * Math.PI * 2 / 3;
    ctx.clearRect(0, 0, W, H);
    // main body
    L.roundRectPath(ctx, 10 * k, 12 * k, 172 * k, 118 * k, 8 * k);
    var bg = ctx.createLinearGradient(0, 12 * k, 0, 130 * k); bg.addColorStop(0, BLUE_HI); bg.addColorStop(0.2, BLUE); bg.addColorStop(1, BLUE_LO);
    ctx.fillStyle = bg; ctx.fill(); ctx.strokeStyle = '#11161A'; ctx.lineWidth = 1.2 * k; ctx.stroke();
    // pipes along the west and east edges
    [[6, 30, 6, 150], [186, 24, 186, 150]].forEach(function (p) { L.cylinder(ctx, (p[0] - 4) * k, p[1] * k, 8 * k, (p[3] - p[1]) * k, '#A9B4BA', false, { r: 3 * k }); });
    // louvred vent + fans
    L.roundRectPath(ctx, 30 * k, 18 * k, 40 * k, 20 * k, 6 * k); ctx.fillStyle = '#2C353C'; ctx.fill(); ctx.strokeStyle = '#11161A'; ctx.stroke();
    ctx.fillStyle = '#9AA6AE'; for (var v = 0; v < 5; v++) ctx.fillRect((34 + v * 7) * k, 21 * k, 3 * k, 14 * k);
    fan(ctx, 88, 30, 13, ang, k);
    fan(ctx, 52, 68, 17, -ang * 1.3, k);
    // dark core block + three white pressure cylinders
    L.roundRectPath(ctx, 82 * k, 50 * k, 30 * k, 50 * k, 4 * k); ctx.fillStyle = '#2A3238'; ctx.fill();
    tank(ctx, 116, 36, 44, 16, k); tank(ctx, 120, 60, 44, 16, k); tank(ctx, 116, 84, 44, 16, k);
    L.cylinder(ctx, 140 * k, 14 * k, 34 * k, 12 * k, '#7E8C94', true, { r: 4 * k });
    ctx.fillStyle = '#2C353C'; for (var g2 = 0; g2 < 4; g2++) ctx.fillRect((146 + g2 * 7) * k, 16 * k, 3 * k, 8 * k);
    // extra piping and rust streaks
    L.cylinder(ctx, 66 * k, 50 * k, 8 * k, 54 * k, '#9AA6AC', false, { r: 2 * k });
    L.cylinder(ctx, 112 * k, 101 * k, 54 * k, 6 * k, '#9AA6AC', true, { r: 2 * k });
    L.cylinder(ctx, 20 * k, 96 * k, 50 * k, 7 * k, '#9AA6AC', true, { r: 2 * k });
    ctx.fillStyle = RUSTC + '0.55)'; ctx.fillRect(74 * k, 40 * k, 6 * k, 30 * k); ctx.fillRect(112 * k, 106 * k, 30 * k, 4 * k); ctx.fillRect(14 * k, 60 * k, 5 * k, 26 * k);
    // teal-grey front skirt with the riveted heater window
    poly(ctx, [[22, 112], [170, 112], [184, 186], [8, 186]], k);
    var sg = ctx.createLinearGradient(0, 112 * k, 0, 186 * k); sg.addColorStop(0, L.lighten(SKIRT, 25)); sg.addColorStop(0.3, SKIRT); sg.addColorStop(1, L.darken(SKIRT, 35));
    ctx.fillStyle = sg; ctx.fill(); ctx.strokeStyle = '#11161A'; ctx.lineWidth = 1.2 * k; ctx.stroke();
    poly(ctx, [[22, 112], [40, 112], [30, 186], [8, 186]], k); ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fill();
    poly(ctx, [[152, 112], [170, 112], [184, 186], [162, 186]], k); ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fill();
    ctx.fillStyle = RUSTC + '0.5)'; ctx.fillRect(22 * k, 112 * k, 148 * k, 3 * k);
    L.roundRectPath(ctx, 64 * k, 124 * k, 64 * k, 52 * k, 12 * k); ctx.fillStyle = '#8E9A9E'; ctx.fill(); ctx.strokeStyle = '#11161A'; ctx.stroke();
    for (var b = 0; b < 16; b++) { // bolt ring around the window
      var t = b / 16 * Math.PI * 2;
      ctx.fillStyle = '#E2E6E8'; ctx.beginPath(); ctx.arc((96 + Math.cos(t) * 27) * k, (150 + Math.sin(t) * 21) * k, 1.2 * k, 0, Math.PI * 2); ctx.fill();
    }
    L.roundRectPath(ctx, 72 * k, 132 * k, 48 * k, 36 * k, 8 * k); ctx.fillStyle = '#0D0F10'; ctx.fill();
    ctx.save(); L.roundRectPath(ctx, 72 * k, 132 * k, 48 * k, 36 * k, 8 * k); ctx.clip();
    var hot = working ? 0.6 + 0.4 * flicker(f, 0) : 0;
    if (working) { var hg = ctx.createRadialGradient(96 * k, 160 * k, 2 * k, 96 * k, 150 * k, 30 * k); hg.addColorStop(0, 'rgba(255,200,100,' + (0.9 * hot).toFixed(2) + ')'); hg.addColorStop(1, 'rgba(255,90,20,0)'); ctx.fillStyle = hg; ctx.fillRect(72 * k, 132 * k, 48 * k, 36 * k); }
    ctx.strokeStyle = working ? 'rgba(255,' + Math.round(150 + 70 * hot) + ',80,1)' : '#4A4F52'; ctx.lineWidth = 3 * k; ctx.lineCap = 'round';
    for (var c = 0; c < 4; c++) { ctx.beginPath(); ctx.moveTo((80 + c * 11) * k, 146 * k); ctx.lineTo((80 + c * 11) * k, 166 * k); ctx.stroke(); }
    ctx.restore();
    if (working) glow(ctx, 96, 176, 40, k, 0.3 * hot);
    grime(ctx, k, 192, 1400, 29);
  }

  F.sprites.definePainter(['stone-furnace'], paintStoneFurnace);
  F.sprites.definePainter(['steel-furnace'], paintSteelFurnace);
  F.sprites.definePainter(['electric-furnace'], paintElectricFurnace);
})();
