// 63-sprites-lab.js — the lab drawn after the real Factorio sprite (base/graphics/entity/lab/
// lab.png: 194x174 hr frames, 33-frame working loop; reference: the vanilla-based lab2.png in
// Bob's mods). hr = 64 px per tile like our sprites, so numbers are hr pixels of 192x192.
//
// What the reference looks like: a geodesic glass dome filling the footprint — dark smoky
// green-grey glass triangles held by pale brass struts meeting in round nodes, a dark steel
// base ring around the bottom with small coloured status panels, strong glass reflections on
// the upper-left. While researching, light pulses inside the dome and the base panels glow.
(function () {
  'use strict';
  if (!F.sprites || !F.sprites.definePainter) return;
  var L = F.sprites.lib;

  var CX = 96, CY = 100, RX = 86, RY = 74, LIFT = 26; // dome footprint ellipse and apex height

  function hash(a, b) {
    var h = (a * 374761393 + b * 668265263) | 0;
    h = (h ^ (h >>> 13)) * 1274126177 | 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  // Point on the dome: angle a around the vertical axis, t = 0 (apex) .. 1 (base rim).
  function P(a, t) {
    var r = Math.sin(t * Math.PI / 2), h = Math.cos(t * Math.PI / 2);
    return [CX + Math.cos(a) * RX * r, CY + Math.sin(a) * RY * r - h * LIFT];
  }
  function paintLab(ctx, W, H, frame, dir, def, type, opts) {
    var k = W / 192, working = !!(opts && opts.working), f = working ? frame & 15 : 0;
    var pulse = working ? 0.5 + 0.5 * Math.sin(f / 16 * Math.PI * 2) : 0;
    ctx.clearRect(0, 0, W, H);
    // steel base ring
    ctx.fillStyle = '#1E2224'; ctx.beginPath(); ctx.ellipse(CX * k, (CY + 8) * k, (RX + 4) * k, (RY + 6) * k, 0, 0, Math.PI * 2); ctx.fill();
    var bg = ctx.createLinearGradient(0, (CY - RY) * k, 0, (CY + RY + 12) * k); bg.addColorStop(0, '#5E666A'); bg.addColorStop(1, '#2A2F32');
    ctx.fillStyle = bg; ctx.beginPath(); ctx.ellipse(CX * k, (CY + 5) * k, (RX + 2) * k, (RY + 3) * k, 0, 0, Math.PI * 2); ctx.fill();
    // glass dome
    ctx.save(); ctx.beginPath(); ctx.ellipse(CX * k, CY * k, RX * k, RY * k, 0, 0, Math.PI * 2); ctx.clip();
    var gg = ctx.createRadialGradient((CX - 30) * k, (CY - 50) * k, 4 * k, CX * k, CY * k, RX * 1.1 * k);
    gg.addColorStop(0, '#8FA6A0'); gg.addColorStop(0.35, '#4E605C'); gg.addColorStop(0.8, '#2A3432'); gg.addColorStop(1, '#161C1B');
    ctx.fillStyle = gg; ctx.fillRect(0, 0, W, H);
    if (working) { // research light inside
      var ig = ctx.createRadialGradient(CX * k, (CY - 6) * k, 2 * k, CX * k, CY * k, 60 * k);
      ig.addColorStop(0, 'rgba(190,235,255,' + (0.35 + 0.35 * pulse).toFixed(2) + ')'); ig.addColorStop(1, 'rgba(120,200,255,0)');
      ctx.fillStyle = ig; ctx.fillRect(0, 0, W, H);
    }
    // facets and struts of a 5-fold geodesic dome: apex, a ring of 5, a ring of 10 (every other
    // node under the ring of 5) and the rim ring of 10 offset by half a step
    var nodes = [[P(0, 0)], [], [], []], i, j;
    for (i = 0; i < 5; i++) nodes[1].push(P(-Math.PI / 2 + i * Math.PI * 2 / 5, 0.36));
    for (j = 0; j < 10; j++) nodes[2].push(P(-Math.PI / 2 + j * Math.PI * 2 / 10, 0.7));
    for (j = 0; j < 10; j++) nodes[3].push(P(-Math.PI / 2 + (j + 0.5) * Math.PI * 2 / 10, 1));
    var r1 = nodes[1], r2 = nodes[2], r3 = nodes[3], tris = [];
    for (i = 0; i < 5; i++) {
      var n1 = (i + 1) % 5;
      tris.push([nodes[0][0], r1[i], r1[n1]]);
      tris.push([r1[i], r2[2 * i], r2[2 * i + 1]]);
      tris.push([r1[i], r2[2 * i + 1], r1[n1]]);
      tris.push([r1[n1], r2[2 * i + 1], r2[(2 * i + 2) % 10]]);
    }
    for (j = 0; j < 10; j++) {
      tris.push([r2[j], r3[j], r2[(j + 1) % 10]]);
      tris.push([r3[j], r3[(j + 1) % 10], r2[(j + 1) % 10]]);
    }
    tris.forEach(function (t, i) {
      ctx.beginPath(); ctx.moveTo(t[0][0] * k, t[0][1] * k); ctx.lineTo(t[1][0] * k, t[1][1] * k); ctx.lineTo(t[2][0] * k, t[2][1] * k); ctx.closePath();
      var cy = (t[0][1] + t[1][1] + t[2][1]) / 3, cx = (t[0][0] + t[1][0] + t[2][0]) / 3;
      var lit = (cx < CX ? 0.1 : 0) + (cy < CY ? 0.08 : 0) + 0.08 * hash(i, 3);
      ctx.fillStyle = i % 2 ? 'rgba(255,255,255,' + lit.toFixed(2) + ')' : 'rgba(0,0,0,' + (0.12 + 0.1 * hash(i, 5)).toFixed(2) + ')';
      ctx.fill();
    });
    ctx.lineCap = 'round';
    tris.forEach(function (t) {
      ctx.beginPath(); ctx.moveTo(t[0][0] * k, t[0][1] * k); ctx.lineTo(t[1][0] * k, t[1][1] * k); ctx.lineTo(t[2][0] * k, t[2][1] * k); ctx.closePath();
      ctx.strokeStyle = 'rgba(30,24,16,0.8)'; ctx.lineWidth = 4.2 * k; ctx.stroke();
    });
    tris.forEach(function (t) {
      ctx.beginPath(); ctx.moveTo(t[0][0] * k, t[0][1] * k); ctx.lineTo(t[1][0] * k, t[1][1] * k); ctx.lineTo(t[2][0] * k, t[2][1] * k); ctx.closePath();
      ctx.strokeStyle = '#C9B48A'; ctx.lineWidth = 2.4 * k; ctx.stroke();
    });
    // big reflection on the upper-left glass
    var rg = ctx.createLinearGradient((CX - 70) * k, (CY - 70) * k, (CX - 10) * k, (CY - 10) * k);
    rg.addColorStop(0, 'rgba(255,255,255,0.28)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = rg; ctx.beginPath(); ctx.ellipse((CX - 38) * k, (CY - 36) * k, 34 * k, 22 * k, -0.6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // nodes
    nodes.forEach(function (ring) { ring.forEach(function (n) { L.disc(ctx, n[0] * k, n[1] * k, 2.6 * k, '#D8C69C', { outlineWidth: 0.6 * k }); }); });
    ctx.strokeStyle = '#141718'; ctx.lineWidth = 1.2 * k; ctx.beginPath(); ctx.ellipse(CX * k, CY * k, RX * k, RY * k, 0, 0, Math.PI * 2); ctx.stroke();
    // status panels around the base (front half)
    for (var p = 0; p < 7; p++) {
      var pa = Math.PI * (0.12 + p * 0.127), px = CX + Math.cos(pa) * (RX - 2), py = CY + Math.sin(pa) * (RY - 1) + 4;
      ctx.fillStyle = '#2A2F33'; ctx.fillRect((px - 5) * k, (py - 4) * k, 10 * k, 8 * k);
      var on = working && ((p + f) % 4 !== 0);
      ctx.fillStyle = on ? 'rgba(150,220,255,0.95)' : '#6A5C7A';
      ctx.fillRect((px - 3) * k, (py - 2) * k, 6 * k, 4 * k);
    }
    // weathering
    ctx.save(); ctx.globalCompositeOperation = 'source-atop';
    for (var s = 0; s < 400; s++) { ctx.fillStyle = hash(s, 7) < 0.6 ? 'rgba(20,16,10,0.18)' : 'rgba(255,250,235,0.1)'; ctx.fillRect(192 * hash(s, 1) * k, 192 * hash(s, 2) * k, 1.2 * k, 1.2 * k); }
    ctx.restore();
  }

  F.sprites.definePainter('lab', paintLab);
})();
