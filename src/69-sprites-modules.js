// 69-sprites-modules.js — art for the module expansion (src/07-data-modules.js): the module item
// icon (shape 'module': a circuit card whose colour gives the kind and pips the tier). The electric
// furnace is drawn in 62-sprites-furnaces.js, assembling-machine-3 in 63-sprites-assemblers.js.
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

})();
