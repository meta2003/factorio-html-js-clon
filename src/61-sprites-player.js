// 61-sprites-player.js — the player character drawn after the real Factorio engineer
// (base/graphics/entity/character: level1 idle / running / mining, 8 directions; reference: the
// "Factorio HD" frames collected in snouz/factorio_free_graphics_for_modders).
//
// What the reference looks like: a stocky engineer in dark grey padded armour, with the player
// colour (orange by default, applied through the vanilla mask) on the shoulder pads, forearm
// cuffs, a chest stripe and the thigh pads; a rounded grey helmet with a bright head lamp, dark
// gloves and heavy boots, and a backpack with a red-handled pickaxe and an axe sticking out.
//
// The figure is posed from a small 3D skeleton and projected with the game's top-down 3/4 view,
// so all 8 facings and the walk cycle stay consistent: every body part is a shaded capsule or
// ellipsoid, drawn back to front. F.sprites.player(dir, frame, facing8): dir 0..3 is the
// simulation's facing, facing8 (0 = north, clockwise) the finer facing the renderer derives from
// the player's movement; frame 0 = standing, 1..8 = walk cycle. The canvas is 0.6:1
// (width:height) with the feet at 93% of its height, as the renderer expects.
(function () {
  'use strict';
  if (!F.sprites) return;
  var L = F.sprites.lib, PX = (L && L.PX) || 64;

  var COL = {
    suit: ['#1C1E20', '#46494C', '#7A7E82'], armour: ['#26282A', '#5A5E62', '#9A9EA2'],
    player: ['#6A3006', '#D8741C', '#FFB060'], helmet: ['#2A2C2E', '#6E7276', '#C0C4C8'],
    glove: ['#101010', '#2E2E2C', '#5A5A56'], boot: ['#0C0C0C', '#262422', '#4E4A46'],
    pack: ['#2A221A', '#6A5846', '#A08A70'], handle: ['#3A1408', '#8A3A1E', '#C8744A'],
    steel: ['#2A2A2A', '#8A8C8E', '#D8DADC'],
  };
  var CAM_Y = 0.56, CAM_Z = 0.94; // ground y and height -> screen y

  // project a local body point (u right, v forward, z up; metres) for facing angle th
  function projector(th, S, ox, oy) {
    var rx = Math.cos(th), ry = Math.sin(th), fx = Math.sin(th), fy = -Math.cos(th);
    return function (u, v, z) {
      var X = u * rx + v * fx, Y = u * ry + v * fy;
      return { x: ox + X * S, y: oy + (Y * CAM_Y - z * CAM_Z) * S, d: Y * 0.8 + z * 0.35 };
    };
  }
  // screen-space silhouette of an ellipsoid with radii (a,b,c) along (u,v,z)
  function ellipsoidAxes(th, a, b, c, S) {
    var rx = Math.cos(th), ry = Math.sin(th), fx = Math.sin(th), fy = -Math.cos(th);
    // projection columns for u, v, z
    var m = [[rx * a, fx * b, 0], [ry * CAM_Y * a, fy * CAM_Y * b, -CAM_Z * c]];
    var e11 = 0, e12 = 0, e22 = 0;
    for (var i = 0; i < 3; i++) { e11 += m[0][i] * m[0][i]; e12 += m[0][i] * m[1][i]; e22 += m[1][i] * m[1][i]; }
    var tr = e11 + e22, det = e11 * e22 - e12 * e12, disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
    var l1 = tr / 2 + disc, l2 = Math.max(0, tr / 2 - disc);
    var ang = Math.abs(e12) < 1e-9 ? (e11 >= e22 ? 0 : Math.PI / 2) : Math.atan2(l1 - e11, e12);
    return { r1: Math.sqrt(l1) * S, r2: Math.sqrt(l2) * S, ang: ang };
  }
  function shadeFill(ctx, x, y, r, c) {
    var g = ctx.createRadialGradient(x - r * 0.4, y - r * 0.45, r * 0.1, x, y, r * 1.1);
    g.addColorStop(0, c[2]); g.addColorStop(0.45, c[1]); g.addColorStop(1, c[0]);
    return g;
  }
  function drawEllipsoid(ctx, p, ax, c) {
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(ax.ang);
    ctx.beginPath(); ctx.ellipse(0, 0, ax.r1 + 0.9, ax.r2 + 0.9, 0, 0, Math.PI * 2); ctx.fillStyle = '#0A0A0A'; ctx.fill();
    ctx.rotate(-ax.ang);
    var r = Math.max(ax.r1, ax.r2);
    ctx.rotate(ax.ang);
    ctx.beginPath(); ctx.ellipse(0, 0, ax.r1, ax.r2, 0, 0, Math.PI * 2);
    ctx.rotate(-ax.ang); ctx.fillStyle = shadeFill(ctx, 0, 0, r, c); ctx.fill();
    ctx.restore();
  }
  function drawCapsule(ctx, a, b, r, c) {
    ctx.save(); ctx.lineCap = 'round';
    ctx.strokeStyle = '#0A0A0A'; ctx.lineWidth = r * 2 + 1.8; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.strokeStyle = c[1]; ctx.lineWidth = r * 2; ctx.stroke();
    ctx.strokeStyle = c[0]; ctx.globalAlpha = 0.55; ctx.lineWidth = r * 0.8;
    ctx.beginPath(); ctx.moveTo(a.x + r * 0.45, a.y + r * 0.35); ctx.lineTo(b.x + r * 0.45, b.y + r * 0.35); ctx.stroke();
    ctx.strokeStyle = c[2]; ctx.globalAlpha = 0.65; ctx.lineWidth = r * 0.55;
    ctx.beginPath(); ctx.moveTo(a.x - r * 0.4, a.y - r * 0.35); ctx.lineTo(b.x - r * 0.4, b.y - r * 0.35); ctx.stroke();
    ctx.restore();
  }

  var cache = new Map();
  var FRAMES = 9;
  F.sprites.player = function (dir, frame, facing8) {
    if (!F.sprites.enabled) return { width: 0, height: 0 };
    var f8 = facing8 == null ? (((dir | 0) % 4 + 4) % 4) * 2 : ((facing8 | 0) % 8 + 8) % 8;
    frame = ((frame | 0) % FRAMES + FRAMES) % FRAMES;
    var key = f8 + '|' + frame, c = cache.get(key);
    if (c) return c;
    var H = Math.round(PX * 2.1), W = Math.round(H * 0.6);
    c = L.newCanvas(W, H);
    var ctx = L.ctxOf(c);
    var S = H * 0.56, th = f8 / 8 * Math.PI * 2;
    var walking = frame > 0, ph = (frame - 1) / 8 * Math.PI * 2;
    var bob = walking ? Math.abs(Math.cos(ph)) * 0.025 : 0;
    var P = projector(th, S, W / 2, H * 0.93);
    var parts = [];
    function cap(a, b, r, col) { var pa = P(a[0], a[1], a[2]), pb = P(b[0], b[1], b[2]); parts.push({ d: (pa.d + pb.d) / 2, draw: function () { drawCapsule(ctx, pa, pb, r * S, col); } }); }
    function ell(p, rad, col, extra) {
      var pp = P(p[0], p[1], p[2]), ax = ellipsoidAxes(th, rad[0], rad[1], rad[2], S);
      parts.push({ d: pp.d + (extra || 0), draw: function () { drawEllipsoid(ctx, pp, ax, col); } });
    }
    function custom(p, dz, fn) { var pp = P(p[0], p[1], p[2]); parts.push({ d: pp.d + (dz || 0), draw: function () { fn(pp); } }); }

    // legs: stride and knee lift from the walk phase
    [-1, 1].forEach(function (side) {
      var s = walking ? Math.sin(ph + (side > 0 ? Math.PI : 0)) : 0, lift = walking ? Math.max(0, Math.cos(ph + (side > 0 ? Math.PI : 0))) * 0.08 : 0;
      var hip = [side * 0.12, 0, 0.8 + bob], foot = [side * 0.13, s * 0.22, 0.08 + lift], knee = [side * 0.13, s * 0.11 + 0.05 + lift * 0.6, 0.43 + lift * 0.8 + bob * 0.5];
      cap(hip, knee, 0.115, COL.suit);
      ell([hip[0] + side * 0.03, hip[1] + (knee[1] - hip[1]) * 0.45 + 0.07, hip[2] + (knee[2] - hip[2]) * 0.45], [0.07, 0.05, 0.1], COL.player, 0.03);
      cap(knee, [foot[0], foot[1] - 0.02, foot[2] + 0.07], 0.1, COL.armour);
      ell([foot[0], foot[1] + 0.04, foot[2]], [0.095, 0.16, 0.08], COL.boot);
    });
    // pelvis and belt
    ell([0, 0, 0.83 + bob], [0.23, 0.17, 0.12], COL.suit);
    custom([0, 0.15, 0.86 + bob], 0.05, function (p) { ctx.fillStyle = 'rgba(20,16,10,0.9)'; ctx.fillRect(p.x - 0.16 * S, p.y - 0.02 * S, 0.32 * S, 0.04 * S); });
    // torso with the chest plate and the player-colour stripe
    ell([0, 0.01, 1.1 + bob], [0.28, 0.19, 0.27], COL.armour);
    ell([0, 0.12, 1.13 + bob], [0.18, 0.08, 0.16], COL.suit, 0.03);
    custom([0, 0.19, 1.18 + bob], 0.06, function () {
      var a = P(-0.15, 0.19, 1.2 + bob), b = P(0.15, 0.19, 1.2 + bob);
      ctx.strokeStyle = COL.player[1]; ctx.lineWidth = 0.05 * S; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    });
    // backpack with a pickaxe and an axe
    ell([0, -0.25, 1.1 + bob], [0.22, 0.12, 0.25], COL.pack);
    cap([0.1, -0.32, 0.9 + bob], [-0.05, -0.34, 1.6 + bob], 0.028, COL.handle);
    cap([-0.2, -0.37, 1.55 + bob], [0.1, -0.33, 1.66 + bob], 0.036, COL.steel);
    cap([-0.12, -0.3, 0.94 + bob], [0.12, -0.34, 1.48 + bob], 0.026, COL.handle);
    ell([0.14, -0.35, 1.48 + bob], [0.06, 0.025, 0.07], COL.steel);
    // arms swinging opposite to the legs
    [-1, 1].forEach(function (side) {
      var s = walking ? -Math.sin(ph + (side > 0 ? Math.PI : 0)) : 0;
      var sh = [side * 0.32, 0, 1.27 + bob], el = [side * 0.36, s * 0.13 + 0.02, 1.02 + bob], ha = [side * 0.35, s * 0.22 + 0.1, 0.8 + bob];
      cap(sh, el, 0.09, COL.suit);
      cap(el, ha, 0.085, COL.armour);
      cap([el[0], el[1] + (ha[1] - el[1]) * 0.35, el[2] + (ha[2] - el[2]) * 0.35], [el[0], el[1] + (ha[1] - el[1]) * 0.75, el[2] + (ha[2] - el[2]) * 0.75], 0.09, COL.player);
      ell(ha, [0.075, 0.075, 0.07], COL.glove, 0.01);
      ell([side * 0.31, 0, 1.31 + bob], [0.13, 0.13, 0.09], COL.player, 0.02);
    });
    // helmet, face shield and the head lamp
    ell([0, 0.03, 1.5 + bob], [0.16, 0.16, 0.15], COL.helmet);
    custom([0, 0.15, 1.49 + bob], 0.08, function () {
      var fc = P(0, 0.145, 1.47 + bob), ax = ellipsoidAxes(th, 0.1, 0.025, 0.07, S);
      ctx.save(); ctx.translate(fc.x, fc.y); ctx.rotate(ax.ang);
      ctx.beginPath(); ctx.ellipse(0, 0, ax.r1, ax.r2, 0, 0, Math.PI * 2); ctx.fillStyle = '#16181A'; ctx.fill();
      ctx.restore();
      var lp = P(0, 0.16, 1.6 + bob);
      var g = ctx.createRadialGradient(lp.x, lp.y, 0, lp.x, lp.y, 0.06 * S);
      g.addColorStop(0, '#FFFFFF'); g.addColorStop(0.5, '#FFF4C8'); g.addColorStop(1, 'rgba(255,240,200,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(lp.x, lp.y, 0.06 * S, 0, Math.PI * 2); ctx.fill();
    });

    // soft ground shadow, then the parts back to front
    var shg = ctx.createRadialGradient(W / 2 + 4, H * 0.93, 0, W / 2 + 4, H * 0.93, 0.3 * S);
    shg.addColorStop(0, 'rgba(0,0,0,0.42)'); shg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = shg; ctx.beginPath(); ctx.ellipse(W / 2 + 4, H * 0.93, 0.32 * S, 0.12 * S, 0, 0, Math.PI * 2); ctx.fill();
    parts.sort(function (a, b) { return a.d - b.d; });
    parts.forEach(function (p) { p.draw(); });
    cache.set(key, c);
    return c;
  };
})();
