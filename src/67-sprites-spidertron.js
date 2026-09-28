// 67-sprites-spidertron.js — spidertron art after the real Factorio sprites (base/graphics/
// entity/spidertron: torso body, body bottom, 3-part legs; reference: the "Factorio HD" frames
// collected in snouz/factorio_free_graphics_for_modders).
//
// What the reference looks like: a bulbous gunmetal body resting on a dark round underside ring
// that the legs hang from; a cluster of glowing red eyes (one big lens, several small ones) at
// the front; a rounded hump on the back carrying four rocket tubes lit red, two thin antennas;
// riveted seams and orange player-colour trim. The eight legs are long thin gunmetal struts with
// rusty-brown and cream plating, a knee joint high above the body, and a dark foot tip.
//
//   F.sprites.spidertronBody(heading) -> 256x256 canvas (4x4 tiles at 64 px/tile), the body seen
//     from the game's top-down 3/4 view, turned toward `heading` (radians, 0 = east, like the
//     simulation); cached per 1/16 turn. Its centre is the body centre.
//   F.sprites.drawSpidertronLeg(ctx, hip, knee, foot, s) draws one leg between screen points
//     (s = pixels per tile).
// The rest (feet stepping, drawing order, shadow) is in 39-spidertron.js.
(function () {
  'use strict';
  if (!F.sprites) return;
  var L = F.sprites.lib;

  var GUN = ['#1A1C1E', '#5A5E62', '#A8ACB0'];
  var DARK = ['#0C0C0C', '#2A2A2A', '#5A5A58'];
  var RUST = ['#2A140A', '#7A4424', '#B8784A'];
  var CREAM = ['#4A4034', '#B8AE98', '#ECE6D6'];
  var ORANGE = ['#6A3006', '#D8741C', '#FFB060'];
  var CAM_Y = 0.56, CAM_Z = 0.94;

  function projector(th, S, ox, oy) {
    // local axes: u = right of the heading, v = forward, z = up; th = heading measured
    // clockwise from north on screen (0 = facing up)
    var rx = Math.cos(th), ry = Math.sin(th), fx = Math.sin(th), fy = -Math.cos(th);
    return function (u, v, z) {
      var X = u * rx + v * fx, Y = u * ry + v * fy;
      return { x: ox + X * S, y: oy + (Y * CAM_Y - z * CAM_Z) * S, d: Y * 0.8 + z * 0.35 };
    };
  }
  function ellAxes(th, a, b, c, S) {
    var rx = Math.cos(th), ry = Math.sin(th), fx = Math.sin(th), fy = -Math.cos(th);
    var m = [[rx * a, fx * b, 0], [ry * CAM_Y * a, fy * CAM_Y * b, -CAM_Z * c]];
    var e11 = 0, e12 = 0, e22 = 0;
    for (var i = 0; i < 3; i++) { e11 += m[0][i] * m[0][i]; e12 += m[0][i] * m[1][i]; e22 += m[1][i] * m[1][i]; }
    var tr = e11 + e22, det = e11 * e22 - e12 * e12, disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
    var l1 = tr / 2 + disc, l2 = Math.max(0, tr / 2 - disc);
    var ang = Math.abs(e12) < 1e-9 ? (e11 >= e22 ? 0 : Math.PI / 2) : Math.atan2(l1 - e11, e12);
    return { r1: Math.sqrt(l1) * S, r2: Math.sqrt(l2) * S, ang: ang };
  }
  function shade(ctx, r, c) {
    var g = ctx.createRadialGradient(-r * 0.4, -r * 0.45, r * 0.08, 0, 0, r * 1.1);
    g.addColorStop(0, c[2]); g.addColorStop(0.45, c[1]); g.addColorStop(1, c[0]);
    return g;
  }
  function drawEll(ctx, p, ax, c, glow) {
    ctx.save(); ctx.translate(p.x, p.y);
    ctx.save(); ctx.rotate(ax.ang); ctx.beginPath(); ctx.ellipse(0, 0, ax.r1 + 1, ax.r2 + 1, 0, 0, Math.PI * 2); ctx.restore();
    ctx.fillStyle = '#080808'; ctx.fill();
    ctx.save(); ctx.rotate(ax.ang); ctx.beginPath(); ctx.ellipse(0, 0, ax.r1, ax.r2, 0, 0, Math.PI * 2); ctx.restore();
    ctx.fillStyle = shade(ctx, Math.max(ax.r1, ax.r2), c); ctx.fill();
    if (glow) {
      var g = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(ax.r1, ax.r2) * 2.2);
      g.addColorStop(0, 'rgba(255,60,40,0.45)'); g.addColorStop(1, 'rgba(255,40,20,0)');
      ctx.fillStyle = g; ctx.fillRect(-ax.r1 * 2.5, -ax.r1 * 2.5, ax.r1 * 5, ax.r1 * 5);
    }
    ctx.restore();
  }
  function drawCap(ctx, a, b, r, c) {
    ctx.save(); ctx.lineCap = 'round';
    ctx.strokeStyle = '#080808'; ctx.lineWidth = r * 2 + 1.6; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.strokeStyle = c[1]; ctx.lineWidth = r * 2; ctx.stroke();
    ctx.strokeStyle = c[0]; ctx.globalAlpha = 0.5; ctx.lineWidth = r * 0.8;
    ctx.beginPath(); ctx.moveTo(a.x + r * 0.45, a.y + r * 0.35); ctx.lineTo(b.x + r * 0.45, b.y + r * 0.35); ctx.stroke();
    ctx.strokeStyle = c[2]; ctx.globalAlpha = 0.7; ctx.lineWidth = r * 0.5;
    ctx.beginPath(); ctx.moveTo(a.x - r * 0.4, a.y - r * 0.35); ctx.lineTo(b.x - r * 0.4, b.y - r * 0.35); ctx.stroke();
    ctx.restore();
  }

  var DIRS = 16, bodyCache = new Map();
  F.sprites.spidertronBody = function (heading) {
    if (!F.sprites.enabled) return null;
    // simulation heading: 0 = east; screen facing for the projector: 0 = north, clockwise
    var th = (heading || 0) + Math.PI / 2;
    var b = ((Math.round(th / (Math.PI * 2) * DIRS) % DIRS) + DIRS) % DIRS;
    var c = bodyCache.get(b);
    if (c) return c;
    var W = 256, H = 256;
    c = L.newCanvas(W, H);
    var ctx = L.ctxOf(c), S = 100, a = b / DIRS * Math.PI * 2;
    var P = projector(a, S, W / 2, H / 2 + 0.2 * S), parts = [];
    function ell(p, r, col, dz, glow) { var pp = P(p[0], p[1], p[2]), ax = ellAxes(a, r[0], r[1], r[2], S); parts.push({ d: pp.d + (dz || 0), f: function () { drawEll(ctx, pp, ax, col, glow); } }); }
    function cap(p0, p1, r, col, dz) { var q0 = P(p0[0], p0[1], p0[2]), q1 = P(p1[0], p1[1], p1[2]); parts.push({ d: (q0.d + q1.d) / 2 + (dz || 0), f: function () { drawCap(ctx, q0, q1, r * S, col); } }); }
    // underside ring the legs hang from
    ell([0, 0, -0.18], [0.62, 0.62, 0.16], RUST, -0.5);
    ell([0, 0, -0.26], [0.5, 0.5, 0.1], DARK, -0.4);
    // main body
    ell([0, 0.04, 0.2], [0.78, 0.82, 0.46], GUN);
    // orange trim band and riveted seam round the front half
    for (var i = -4; i <= 4; i++) {
      var an = i / 4 * 1.2;
      ell([Math.sin(an) * 0.74, Math.cos(an) * 0.78, 0.18], [0.07, 0.07, 0.04], i % 2 ? ORANGE : CREAM, 0.05);
    }
    // back hump with the four rocket tubes
    ell([0, -0.42, 0.52], [0.46, 0.34, 0.26], GUN, 0.05);
    for (var t = 0; t < 4; t++) {
      var u = -0.24 + t * 0.16;
      cap([u, -0.58, 0.64], [u, -0.66, 0.7], 0.06, DARK, 0.1);
      ell([u, -0.56, 0.68], [0.035, 0.02, 0.035], ['#5A0A04', '#FF3A20', '#FFC0A0'], 0.12, true);
    }
    // antennas
    cap([0.28, -0.3, 0.66], [0.3, -0.34, 1.35], 0.012, CREAM, 0.1);
    cap([0.36, -0.26, 0.62], [0.38, -0.3, 1.25], 0.012, CREAM, 0.1);
    ell([0.3, -0.34, 1.37], [0.025, 0.025, 0.025], ['#5A0A04', '#FF3A20', '#FFC0A0'], 0.1, true);
    // eyes: one big lens and small ones at the front
    ell([0, 0.78, 0.18], [0.13, 0.08, 0.13], ['#3A0402', '#E0200E', '#FFB0A0'], 0.2, true);
    [[-0.3, 0.7, 0.34], [0.3, 0.7, 0.34], [-0.46, 0.58, 0.16], [0.46, 0.58, 0.16], [-0.16, 0.74, 0.44], [0.16, 0.74, 0.44]].forEach(function (e) {
      ell(e, [0.055, 0.04, 0.055], ['#3A0402', '#E0200E', '#FFB0A0'], 0.2, true);
    });
    // side hatches
    [-1, 1].forEach(function (s) { ell([s * 0.66, -0.04, 0.3], [0.12, 0.2, 0.16], GUN, 0.08); ell([s * 0.7, -0.04, 0.3], [0.06, 0.1, 0.08], DARK, 0.1); });
    parts.sort(function (p, q) { return p.d - q.d; });
    parts.forEach(function (p) { p.f(); });
    // weathering
    ctx.save(); ctx.globalCompositeOperation = 'source-atop';
    for (var g = 0; g < 900; g++) {
      var h1 = Math.sin(g * 12.9898) * 43758.5453, h2 = Math.sin(g * 78.233) * 43758.5453, h3 = Math.sin(g * 39.34) * 43758.5453;
      h1 -= Math.floor(h1); h2 -= Math.floor(h2); h3 -= Math.floor(h3);
      ctx.fillStyle = h3 < 0.6 ? 'rgba(10,10,10,0.25)' : (h3 < 0.8 ? 'rgba(130,70,30,0.2)' : 'rgba(255,255,250,0.12)');
      ctx.fillRect(W * h1, H * h2, 1 + 2 * h3, 1 + 2 * (1 - h3));
    }
    ctx.restore();
    bodyCache.set(b, c);
    return c;
  };

  // One leg from the hip (under the body) up to the knee and down to the foot, all screen points.
  F.sprites.drawSpidertronLeg = function (ctx, hip, knee, foot, s) {
    var up = [(hip[0] + knee[0]) / 2, (hip[1] + knee[1]) / 2];
    drawCap(ctx, { x: hip[0], y: hip[1] }, { x: knee[0], y: knee[1] }, 0.09 * s, GUN);
    drawCap(ctx, { x: up[0], y: up[1] }, { x: knee[0] + (up[0] - knee[0]) * 0.3, y: knee[1] + (up[1] - knee[1]) * 0.3 }, 0.085 * s, RUST);
    var lk = [knee[0] + (foot[0] - knee[0]) * 0.18, knee[1] + (foot[1] - knee[1]) * 0.18];
    var lm = [knee[0] + (foot[0] - knee[0]) * 0.55, knee[1] + (foot[1] - knee[1]) * 0.55];
    drawCap(ctx, { x: knee[0], y: knee[1] }, { x: foot[0], y: foot[1] }, 0.065 * s, GUN);
    drawCap(ctx, { x: lk[0], y: lk[1] }, { x: lm[0], y: lm[1] }, 0.07 * s, CREAM);
    drawCap(ctx, { x: foot[0] + (knee[0] - foot[0]) * 0.12, y: foot[1] + (knee[1] - foot[1]) * 0.12 }, { x: foot[0], y: foot[1] }, 0.05 * s, DARK);
    // knee joint
    ctx.fillStyle = '#080808'; ctx.beginPath(); ctx.arc(knee[0], knee[1], 0.11 * s + 1, 0, Math.PI * 2); ctx.fill();
    var g = ctx.createRadialGradient(knee[0] - 0.04 * s, knee[1] - 0.04 * s, 1, knee[0], knee[1], 0.11 * s);
    g.addColorStop(0, CREAM[2]); g.addColorStop(0.5, RUST[2]); g.addColorStop(1, RUST[0]);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(knee[0], knee[1], 0.11 * s, 0, Math.PI * 2); ctx.fill();
  };

  if (F.sprites.defineIcon) {
    F.sprites.defineIcon('spidertron', function (ctx, S) {
      var body = F.sprites.spidertronBody(-Math.PI / 2);
      ctx.save(); ctx.strokeStyle = '#1A1C1E'; ctx.lineCap = 'round';
      for (var i = 0; i < 8; i++) {
        var a = (i + 0.5) / 8 * Math.PI * 2, hx = S / 2 + Math.cos(a) * S * 0.12, hy = S * 0.5 + Math.sin(a) * S * 0.08;
        var kx = S / 2 + Math.cos(a) * S * 0.3, ky = S * 0.2 + Math.sin(a) * S * 0.12, fx = S / 2 + Math.cos(a) * S * 0.46, fy = S * 0.62 + Math.sin(a) * S * 0.3;
        ctx.lineWidth = Math.max(1.5, S * 0.05); ctx.strokeStyle = '#1A1C1E';
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(kx, ky); ctx.lineTo(fx, fy); ctx.stroke();
        ctx.lineWidth = Math.max(1, S * 0.025); ctx.strokeStyle = '#7A7E82'; ctx.stroke();
      }
      ctx.restore();
      if (body) ctx.drawImage(body, S * 0.08, S * 0.04, S * 0.84, S * 0.84);
    });
  }
})();
