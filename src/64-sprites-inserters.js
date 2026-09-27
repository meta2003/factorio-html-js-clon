// 64-sprites-inserters.js — inserters drawn after the real Factorio sprites
// (base/graphics/entity/<inserter>/: platform, hand-base, hand-open, hand-closed + shadows).
//
// What the reference looks like:
//   - platform: a raised ring in the tier colour (burner dark grey, inserter yellow, long-handed
//     red, fast blue) around a rusty turntable disc with concentric grooves and bolt heads,
//     standing on three curved tubular legs with flat feet. One leg (drawn as a doubled bar)
//     points in the inserter's direction, the other two splay out backwards; the art is not
//     rotated but drawn per direction with the same top-down/3-4 view as the rest of the world
//     (the soft south-east shadow is added by 60-sprites.js from the silhouette);
//   - hand base: a tier-coloured rod from the turntable pivot up to a brass elbow joint;
//   - hand: a tier-coloured "ladder" plate with dark windows ending in a dark crossbar with two
//     pale bone-coloured fingers (spread when open, tilted inward when closed);
//   - the arm swings around the pivot on a half circle (it does not slide through the centre),
//     raised off the ground, with its shadow on the ground.
// The platform is a normal cached painter; the arm is drawn every frame by 61-render.js through
// F.sprites.drawInserterArm (cheap canvas ops, scaled to the zoom).
(function () {
  'use strict';
  if (!F.sprites || !F.sprites.definePainter) return;
  var L = F.sprites.lib;

  var TIER = {
    'burner-inserter': { base: '#5F5A56', hi: '#9A938D', lo: '#2C2927' },
    'inserter': { base: '#D9A91D', hi: '#FFE27C', lo: '#7A5A08' },
    'long-handed-inserter': { base: '#B8281B', hi: '#F0735A', lo: '#560E07' },
    'fast-inserter': { base: '#2F83C8', hi: '#8FCBFF', lo: '#123E66' },
  };
  function tierOf(type) { return TIER[type] || TIER['inserter']; }
  F.sprites.inserterTier = tierOf;

  // World-space unit vector of direction d (0=N,1=E,2=S,3=W) and its angle.
  function dirAngle(d) { return [-Math.PI / 2, 0, Math.PI / 2, Math.PI][d & 3]; }

  // Curved tubular leg from the ring edge down to a foot on the ground (world px).
  function legPath(ctx, hx, hy, ang, rIn, rOut, lift) {
    var c = Math.cos(ang), s = Math.sin(ang);
    var x0 = hx + c * rIn, y0 = hy + s * rIn;
    var x2 = hx + c * rOut, y2 = hy + s * rOut + lift;
    var x1 = hx + c * (rIn + (rOut - rIn) * 0.75), y1 = hy + s * (rIn + (rOut - rIn) * 0.75) - lift * 0.35;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(x1, y1, x2, y2);
    return [x2, y2];
  }
  function strokeLeg(ctx, hx, hy, ang, rIn, rOut, lift, w, t, off) {
    var px = -Math.sin(ang) * off, py = Math.cos(ang) * off;
    var hx2 = hx + px, hy2 = hy + py;
    ctx.lineCap = 'round';
    legPath(ctx, hx2, hy2, ang, rIn, rOut, lift); ctx.strokeStyle = '#140F0C'; ctx.lineWidth = w + 2.2; ctx.stroke();
    legPath(ctx, hx2, hy2, ang, rIn, rOut, lift); ctx.strokeStyle = t.base; ctx.lineWidth = w; ctx.stroke();
    // highlight along the lit (upper-left) side of the tube
    ctx.save(); ctx.translate(-w * 0.22, -w * 0.25);
    legPath(ctx, hx2, hy2, ang, rIn, rOut, lift); ctx.strokeStyle = L.rgba(t.hi, 0.75); ctx.lineWidth = w * 0.3; ctx.stroke();
    ctx.restore();
  }

  function paintInserterPlatform(ctx, W, H, frame, dir, def, type) {
    var t = tierOf(type), k = W / 64;
    ctx.clearRect(0, 0, W, H);
    // undo the caller's rotation: the platform is drawn per direction in world orientation
    ctx.save();
    ctx.translate(W / 2, H / 2); ctx.rotate(-(dir & 3) * Math.PI / 2); ctx.translate(-W / 2, -H / 2);
    var hx = 32 * k, hy = 29 * k, a0 = dirAngle(dir);
    var legs = [
      { ang: a0, rOut: 28 * k, dbl: true },
      { ang: a0 + Math.PI * 0.76, rOut: 30 * k },
      { ang: a0 - Math.PI * 0.76, rOut: 30 * k },
    ];
    var lift = 5 * k, lw = 5.2 * k, rIn = 12 * k;
    // legs behind the ring first (those pointing up/north), then the ring, then the front legs
    function drawLeg(lg) {
      if (lg.dbl) { strokeLeg(ctx, hx, hy, lg.ang, rIn, lg.rOut, lift, lw * 0.55, t, -2.1 * k); strokeLeg(ctx, hx, hy, lg.ang, rIn, lg.rOut, lift, lw * 0.55, t, 2.1 * k); }
      else strokeLeg(ctx, hx, hy, lg.ang, rIn, lg.rOut, lift, lw, t, 0);
      // foot plate
      var c = Math.cos(lg.ang), s = Math.sin(lg.ang), fx = hx + c * lg.rOut, fy = hy + s * lg.rOut + lift;
      ctx.save(); ctx.translate(fx, fy); ctx.rotate(lg.ang);
      ctx.fillStyle = '#1A1411'; ctx.fillRect(-2.8 * k, -4.8 * k, 5.6 * k, 9.6 * k);
      ctx.fillStyle = L.darken(t.base, 18); ctx.fillRect(-2 * k, -4 * k, 4 * k, 8 * k);
      ctx.restore();
    }
    legs.forEach(function (lg) { if (Math.sin(lg.ang) < -0.1) drawLeg(lg); });
    // ring: side band (front lip visible from the south) + top rim (geometry below is at 1/1.3 scale)
    ctx.save(); ctx.translate(hx, hy); ctx.scale(1.3, 1.3); ctx.translate(-hx, -hy);
    ctx.fillStyle = '#140F0C'; ctx.beginPath(); ctx.ellipse(hx, hy + 2.2 * k, 12.6 * k, 11.6 * k, 0, 0, Math.PI * 2); ctx.fill();
    var sg = ctx.createLinearGradient(0, hy - 10 * k, 0, hy + 13 * k);
    sg.addColorStop(0, t.base); sg.addColorStop(1, t.lo);
    ctx.fillStyle = sg; ctx.beginPath(); ctx.ellipse(hx, hy + 2 * k, 11.8 * k, 10.8 * k, 0, 0, Math.PI * 2); ctx.fill();
    var rg = ctx.createLinearGradient(hx - 10 * k, hy - 10 * k, hx + 10 * k, hy + 10 * k);
    rg.addColorStop(0, t.hi); rg.addColorStop(0.45, t.base); rg.addColorStop(1, L.darken(t.base, 25));
    ctx.fillStyle = rg; ctx.beginPath(); ctx.ellipse(hx, hy, 11.8 * k, 10.6 * k, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#140F0C'; ctx.lineWidth = 0.9 * k; ctx.stroke();
    // turntable inside the ring
    ctx.fillStyle = '#1C1612'; ctx.beginPath(); ctx.ellipse(hx, hy + 0.4 * k, 8.8 * k, 7.9 * k, 0, 0, Math.PI * 2); ctx.fill();
    var tg = ctx.createRadialGradient(hx - 2.5 * k, hy - 2.5 * k, 1 * k, hx, hy, 8 * k);
    tg.addColorStop(0, '#A89886'); tg.addColorStop(0.6, '#7B6A5A'); tg.addColorStop(1, '#4A3D33');
    ctx.fillStyle = tg; ctx.beginPath(); ctx.ellipse(hx, hy, 7.8 * k, 7 * k, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(30,22,16,0.8)'; ctx.lineWidth = 0.7 * k;
    [5.6, 3.6].forEach(function (r) { ctx.beginPath(); ctx.ellipse(hx, hy, r * k, r * 0.9 * k, 0, 0, Math.PI * 2); ctx.stroke(); });
    ctx.fillStyle = 'rgba(122,70,40,0.5)';
    ctx.beginPath(); ctx.ellipse(hx + 2 * k, hy + 2.5 * k, 3 * k, 1.6 * k, 0.5, 0, Math.PI * 2); ctx.fill();
    for (var b = 0; b < 8; b++) { // bolt heads around the turntable
      var ba = b * Math.PI / 4 + Math.PI / 8, bx = hx + Math.cos(ba) * 6.7 * k, by = hy + Math.sin(ba) * 6 * k;
      ctx.fillStyle = '#2A211B'; ctx.beginPath(); ctx.arc(bx + 0.3 * k, by + 0.3 * k, 0.9 * k, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#D8CFC4'; ctx.beginPath(); ctx.arc(bx, by, 0.65 * k, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#3A2F28'; ctx.beginPath(); ctx.arc(hx, hy, 1.8 * k, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    legs.forEach(function (lg) { if (Math.sin(lg.ang) >= -0.1) drawLeg(lg); });
    ctx.restore();
  }

  // Arm, drawn per frame in screen space. P = pivot, E = elbow, G = gripper (screen px, already
  // lifted by their heights), SP/SE/SG = the same points projected on the ground (shadow).
  // u = screen px per tile. drawHeld(x, y) paints the carried item between the crossbar and
  // the fingers (null when the hand is empty/open).
  function seg(ctx, ax, ay, bx, by) { ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); }
  F.sprites.drawInserterArm = function (ctx, type, P, E, G, SP, SE, SG, u, drawHeld) {
    var t = tierOf(type), closed = !!drawHeld;
    var rodW = Math.max(1.5, 0.13 * u), plateW = Math.max(2, 0.19 * u);
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // shadow on the ground
    ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = rodW;
    seg(ctx, SP[0], SP[1], SE[0], SE[1]);
    ctx.lineWidth = plateW; seg(ctx, SE[0], SE[1], SG[0], SG[1]);
    var gdx = SG[0] - SE[0], gdy = SG[1] - SE[1], gl = Math.hypot(gdx, gdy) || 1;
    ctx.lineWidth = Math.max(1, 0.07 * u);
    seg(ctx, SG[0] - gdy / gl * 0.2 * u, SG[1] + gdx / gl * 0.2 * u, SG[0] + gdy / gl * 0.2 * u, SG[1] - gdx / gl * 0.2 * u);
    // hand base: tier-coloured rod from the pivot to the elbow
    ctx.strokeStyle = '#140F0C'; ctx.lineWidth = rodW + Math.max(1, 0.045 * u); seg(ctx, P[0], P[1], E[0], E[1]);
    ctx.strokeStyle = t.base; ctx.lineWidth = rodW; seg(ctx, P[0], P[1], E[0], E[1]);
    ctx.strokeStyle = L.rgba(t.hi, 0.6); ctx.lineWidth = rodW * 0.3;
    seg(ctx, P[0] - rodW * 0.2, P[1] - rodW * 0.2, E[0] - rodW * 0.2, E[1] - rodW * 0.2);
    // hand: ladder plate from the elbow to the gripper
    var dx = G[0] - E[0], dy = G[1] - E[1], len = Math.hypot(dx, dy) || 1;
    ctx.save();
    ctx.translate(E[0], E[1]); ctx.rotate(Math.atan2(dy, dx));
    var hw = plateW / 2, bar = 0.2 * u;
    ctx.fillStyle = '#140F0C'; ctx.fillRect(-hw * 0.6, -hw - 1, len + hw * 0.6, plateW + 2);
    var pg = ctx.createLinearGradient(0, -hw, 0, hw);
    pg.addColorStop(0, t.hi); pg.addColorStop(0.35, t.base); pg.addColorStop(1, t.lo);
    ctx.fillStyle = pg; ctx.fillRect(-hw * 0.6 + 0.5, -hw, len + hw * 0.6 - 1, plateW);
    // dark windows along the plate
    var nWin = Math.max(1, Math.round(len / (0.2 * u)));
    if (u >= 18) {
      ctx.fillStyle = 'rgba(40,20,14,0.75)';
      for (var i = 0; i < nWin; i++) {
        var wx = (i + 0.2) * len / nWin;
        if (wx > len - bar * 0.9) break;
        ctx.fillRect(wx, -hw * 0.5, len / nWin * 0.55, hw);
      }
    }
    // crossbar at the gripper end (perpendicular), dark joint block in the middle
    var cw = closed ? 0.36 * u : 0.46 * u, ct = Math.max(1.5, 0.07 * u);
    ctx.fillStyle = '#140F0C'; ctx.fillRect(len - ct, -cw / 2 - 1, ct * 2 + 1, cw + 2);
    ctx.fillStyle = L.darken(t.base, 10); ctx.fillRect(len - ct + 0.5, -cw / 2, ct * 2, cw);
    ctx.fillStyle = '#2C2622'; ctx.fillRect(len - ct * 1.6, -hw * 0.9, ct * 2.6, hw * 1.8);
    ctx.restore();
    // brass elbow joint
    var jr = Math.max(1.2, 0.075 * u);
    var jg = ctx.createRadialGradient(E[0] - jr * 0.3, E[1] - jr * 0.3, jr * 0.1, E[0], E[1], jr);
    jg.addColorStop(0, '#F1C98A'); jg.addColorStop(0.6, '#B07A3A'); jg.addColorStop(1, '#5A3A18');
    ctx.fillStyle = jg; ctx.beginPath(); ctx.arc(E[0], E[1], jr, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#140F0C'; ctx.lineWidth = Math.max(0.8, 0.02 * u); ctx.stroke();
    // carried item, then the fingers over it
    var ux = dx / len, uy = dy / len, px = -uy, py = ux;
    if (drawHeld) drawHeld(G[0] + ux * 0.08 * u, G[1] + uy * 0.08 * u);
    var fl = 0.2 * u, fw = Math.max(1.2, 0.06 * u), tilt = closed ? 0.45 : 0;
    ctx.lineCap = 'round';
    [-1, 1].forEach(function (sd) {
      var bx = G[0] + px * sd * cw / 2 + ux * ct, by = G[1] + py * sd * cw / 2 + uy * ct;
      var ex = bx + (ux * Math.cos(tilt) - px * sd * Math.sin(tilt)) * fl, ey = by + (uy * Math.cos(tilt) - py * sd * Math.sin(tilt)) * fl;
      ctx.strokeStyle = '#2A241E'; ctx.lineWidth = fw + Math.max(1, 0.03 * u); seg(ctx, bx, by, ex, ey);
      ctx.strokeStyle = '#D9D2BE'; ctx.lineWidth = fw; seg(ctx, bx, by, ex, ey);
    });
    ctx.restore();
  };

  F.sprites.definePainter(['burner-inserter', 'inserter', 'long-handed-inserter', 'fast-inserter'], paintInserterPlatform);
})();
