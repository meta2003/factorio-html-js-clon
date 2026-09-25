// 69-sprites-modules.js — art for the module expansion (src/07-data-modules.js): the module item
// icon (shape 'module': a circuit card whose colour gives the kind and pips the tier) and the
// electric furnace (3x3). assembling-machine-3 shares the assembler painter in 63-sprites-machines.js.
// Pure drawing module, ES5 style, deterministic.
(function () {
  'use strict';
  if (!F.sprites || !F.sprites.definePainter) return;

  var L = F.sprites.lib;

  // ---------------------------------------------------------------------
  // Module icon: dark card with gold contacts, a coloured chip in the middle, tier pips on top.
  // ---------------------------------------------------------------------
  if (F.sprites.defineIcon) {
    F.sprites.defineIcon('module', function (ctx, S, def) {
      var c1 = def.icon.color, c2 = def.icon.color2 || L.lighten(c1, 40);
      var tier = def.icon.tier || 1;
      var x = S * 0.14, y = S * 0.2, w = S * 0.72, h = S * 0.62;
      L.panel(ctx, x, y, w, h, '#3A3F44', { r: S * 0.06, outlineWidth: Math.max(1, S * 0.04) });
      // gold edge contacts
      ctx.fillStyle = '#D9B84A';
      for (var i = 0; i < 5; i++) ctx.fillRect(x + w * (0.12 + i * 0.17), y + h * 0.84, w * 0.09, h * 0.12);
      // chip
      var cx = x + w * 0.2, cy = y + h * 0.2, cw = w * 0.6, ch = h * 0.52;
      var g = ctx.createLinearGradient(cx, cy, cx + cw, cy + ch);
      g.addColorStop(0, c2); g.addColorStop(1, c1);
      ctx.fillStyle = g; ctx.fillRect(cx, cy, cw, ch);
      ctx.strokeStyle = 'rgba(10,10,10,0.8)'; ctx.lineWidth = Math.max(1, S * 0.03); ctx.strokeRect(cx, cy, cw, ch);
      // tier pips above the card
      ctx.fillStyle = '#F2F2F2';
      for (var t = 0; t < tier; t++) {
        ctx.beginPath(); ctx.arc(S * (0.5 + (t - (tier - 1) / 2) * 0.16), S * 0.11, S * 0.055, 0, Math.PI * 2); ctx.fill();
      }
    });
  }

  // ---------------------------------------------------------------------
  // Electric furnace (3x3): brick-red refractory housing on a steel frame, a square heating
  // chamber with glowing coils while working, cooling vents on both sides, no smoke stack.
  // ---------------------------------------------------------------------
  function paintElectricFurnace(ctx, W, H, frame, dir, def, type, opts) {
    var working = !!(opts && opts.working);
    L.foundation(ctx, W, H, '#55585A');
    L.panel(ctx, W * 0.08, H * 0.08, W * 0.84, H * 0.84, '#7A4A3C', { r: W * 0.06 });
    // steel frame bands
    ctx.fillStyle = 'rgba(40,44,48,0.85)';
    ctx.fillRect(W * 0.08, H * 0.2, W * 0.84, H * 0.05);
    ctx.fillRect(W * 0.08, H * 0.76, W * 0.84, H * 0.05);
    L.vent(ctx, W * 0.12, H * 0.32, W * 0.12, H * 0.36, 5, true);
    L.vent(ctx, W * 0.76, H * 0.32, W * 0.12, H * 0.36, 5, true);
    L.rivets(ctx, [[W * 0.14, H * 0.14], [W * 0.86, H * 0.14], [W * 0.14, H * 0.86], [W * 0.86, H * 0.86]], W * 0.018);
    // heating chamber
    var cx = W * 0.3, cy = H * 0.3, cw = W * 0.4, ch = H * 0.4;
    L.inset(ctx, cx, cy, cw, ch, '#1A1210', W * 0.03);
    var pulse = working ? 0.6 + 0.4 * Math.sin(frame / 16 * Math.PI * 2) : 0;
    ctx.lineWidth = Math.max(1.5, W * 0.022);
    for (var i = 0; i < 4; i++) {
      var yy = cy + ch * (0.2 + i * 0.2);
      ctx.strokeStyle = working ? 'rgba(255,' + (120 + Math.round(80 * pulse)) + ',40,0.95)' : '#4A3530';
      ctx.beginPath();
      for (var k = 0; k <= 8; k++) {
        var xx = cx + cw * (0.1 + k * 0.1), dy = (k % 2 ? 1 : -1) * ch * 0.05;
        if (k === 0) ctx.moveTo(xx, yy + dy); else ctx.lineTo(xx, yy + dy);
      }
      ctx.stroke();
    }
    if (working) L.glow(ctx, W / 2, H / 2, W * 0.34, '#FF7A2A', 0.25 + 0.15 * pulse);
    // status lamp
    ctx.fillStyle = working ? '#6FE68A' : '#3A4038';
    ctx.beginPath(); ctx.arc(W * 0.5, H * 0.15, W * 0.022, 0, Math.PI * 2); ctx.fill();
  }

  F.sprites.definePainter('electric-furnace', paintElectricFurnace);
})();
