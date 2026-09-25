// 72-ui-techtree.js — the technology tree window (T).
//
// A prerequisite graph instead of tier columns: every technology is a node card placed in a
// column by its depth (longest prerequisite chain), with curved links from each prerequisite.
// The view pans (drag the background) and zooms (mouse wheel, +/− buttons, "Fit"), a search
// box highlights matching technologies (by tech name or by what they unlock), and hovering a
// node lights up the chain it needs. Clicking a node opens its details on the right: cost with
// science-pack icons, what it unlocks, effects, prerequisites and follow-ups, and buttons to
// research it now, queue it, or queue it together with every missing prerequisite
// (F.research.queueWithPrereqs). Double-click does the most useful of those at once.
//
// The window is built once per open and then updated IN PLACE (classes, progress bars, the
// header and queue strip) on a timer and on 'research:done', so pan/zoom, hover and clicks are
// never lost to a re-render. DOM only — no simulation state is mutated except through the
// F.research API. Registered straight on 70-ui.js's F.ui.registerWindow (create/refresh).
(function () {
  'use strict';

  var HEADLESS = (typeof window !== 'undefined' && window.HEADLESS === true);
  if (HEADLESS) return;

  F.i18n.add('en', {
    'ui.tt.search': 'Search technologies or items…',
    'ui.tt.fit': 'Fit',
    'ui.tt.fitTitle': 'Show the whole tree',
    'ui.tt.center': 'Current',
    'ui.tt.centerTitle': 'Centre on the current research',
    'ui.tt.zoomIn': 'Zoom in',
    'ui.tt.zoomOut': 'Zoom out',
    'ui.tt.hint': 'Drag to pan · wheel to zoom · click a technology for details · double-click to research',
    'ui.tt.research': 'Research',
    'ui.tt.researchChain': 'Research with prerequisites ({n})',
    'ui.tt.queue': 'Add to queue',
    'ui.tt.dequeue': 'Remove from queue',
    'ui.tt.cancel': 'Stop research',
    'ui.tt.researched': 'Researched',
    'ui.tt.state.done': 'Researched',
    'ui.tt.state.current': 'Researching',
    'ui.tt.state.queued': 'Queued',
    'ui.tt.state.available': 'Available',
    'ui.tt.state.locked': 'Locked',
    'ui.tt.cost': 'Cost',
    'ui.tt.perUnit': '{t} s per unit',
    'ui.tt.totalTime': '{t} lab-seconds in total',
    'ui.tt.unlocks': 'Unlocks',
    'ui.tt.effects': 'Effects',
    'ui.tt.requires': 'Requires',
    'ui.tt.leadsTo': 'Leads to',
    'ui.tt.none': 'Nothing',
    'ui.tt.queueEmpty': 'Queue empty — double-click a technology to research it',
    'ui.tt.noResearch': 'No research in progress',
    'ui.tt.units': '{done} / {total}',
    'ui.tt.missing': '{n} prerequisites not researched yet',
    'recipe.rocket-part': 'Rocket part',
    'ui.tt.selectHint': 'Select a technology to see its details.',
    'ui.tt.queueChipTitle': '{name} — click to remove from the queue',
    'ui.tt.effect.labSpeedBonus': 'Lab research speed +{v}%',
    'ui.tt.effect.miningBonus': 'Manual mining speed +{v}%',
    'ui.tt.effect.inventoryBonus': 'Inventory +{v} slots',
    'ui.tt.legend.done': 'researched',
    'ui.tt.legend.available': 'available',
    'ui.tt.legend.current': 'in progress',
    'ui.tt.legend.locked': 'locked',
  });

  var NODE_W = 184, NODE_H = 72, GAP_X = 64, GAP_Y = 14, PAD = 40;
  var ZOOM_MIN = 0.2, ZOOM_MAX = 1.6;
  var EFFECT_ICON = { labSpeedBonus: 'lab', miningBonus: 'electric-mining-drill', inventoryBonus: 'steel-chest' };
  // Recipes without an item or fluid result borrow the icon of the building that makes them.
  var RECIPE_ICON = { 'rocket-part': 'rocket-silo' };

  // View state kept across opens (pan/zoom/selection feel persistent, like Factorio's).
  var view = { x: null, y: null, zoom: 1, selected: null, search: '' };

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function esc(s) { return F.util.escapeHtml(String(s)); }
  function t(key, params) { return F.t(key, params); }
  function fmtNum(n) { return (Math.round(n * 10) / 10).toString(); }

  // ---------------------------------------------------------------------
  // Data helpers
  // ---------------------------------------------------------------------
  function techIds() { return (F.data.order.techs || Object.keys(F.data.techs)).filter(function (id) { return F.data.techs[id]; }); }
  function info(id) { return F.research.techInfo(id); }
  function stateOf(inf) {
    return inf.done ? 'done' : inf.isCurrent ? 'current' : inf.queued ? 'queued' : inf.available ? 'available' : 'locked';
  }
  function recipeIcon(rid) {
    var r = F.data.recipes[rid];
    if (!r) return { item: F.data.items[rid] ? rid : null };
    if (RECIPE_ICON[rid]) return { item: RECIPE_ICON[rid] };
    if (r.results && r.results.length) return { item: r.results[0][0] };
    if (r.fluidResults && r.fluidResults.length) return { fluid: r.fluidResults[0][0] };
    return {};
  }
  function recipeName(rid) {
    if (F.i18n.has('recipe.' + rid)) return t('recipe.' + rid);
    var ic = recipeIcon(rid);
    if (ic.item) return t('item.' + ic.item);
    if (ic.fluid) return t('fluid.' + ic.fluid);
    return rid;
  }
  function techIcon(id) {
    var def = F.data.techs[id];
    for (var i = 0; i < def.unlocks.length; i++) {
      var ic = recipeIcon(def.unlocks[i]);
      if (ic.item || ic.fluid) return ic;
    }
    var eff = def.effects && def.effects[0];
    if (eff && EFFECT_ICON[eff.key]) return { item: EFFECT_ICON[eff.key] };
    return { item: 'automation-science-pack' };
  }
  function iconNode(ic, size) {
    if (ic && ic.fluid && F.sprites && F.sprites.fluidIconURL) {
      var d = el('div', 'f-icon');
      d.style.width = size + 'px'; d.style.height = size + 'px';
      try { d.style.backgroundImage = 'url(' + F.sprites.fluidIconURL(ic.fluid) + ')'; } catch (err) { /* no icon */ }
      return d;
    }
    return F.ui.iconEl(ic && ic.item, size);
  }
  function packColor(pack) {
    var it = F.data.items[pack];
    return (it && it.icon && it.icon.color) || '#888';
  }
  function effectText(eff) {
    var v = eff.key === 'inventoryBonus' ? eff.value : Math.round(eff.value * 100);
    var key = 'ui.tt.effect.' + eff.key;
    return F.i18n.has(key) ? t(key, { v: v }) : eff.key + ' +' + v;
  }

  // ---------------------------------------------------------------------
  // Layout: depth columns, barycentre ordering, transitive-reduced links.
  // ---------------------------------------------------------------------
  function computeLayout() {
    var ids = techIds();
    var T = F.data.techs;
    var depth = {};
    function d(id) {
      if (depth[id] != null) return depth[id];
      depth[id] = 0; // cycle guard
      var m = -1;
      T[id].prereq.forEach(function (p) { if (T[p]) m = Math.max(m, d(p)); });
      depth[id] = m + 1;
      return depth[id];
    }
    ids.forEach(d);

    // ancestors, for the transitive reduction and for chain highlighting
    var anc = {};
    function ancestors(id) {
      if (anc[id]) return anc[id];
      var set = {};
      anc[id] = set;
      T[id].prereq.forEach(function (p) {
        if (!T[p]) return;
        set[p] = true;
        var a = ancestors(p);
        for (var k in a) set[k] = true;
      });
      return set;
    }
    ids.forEach(ancestors);

    // Links drawn: prerequisites not already implied by another prerequisite.
    var links = {}; // id -> [prereq]
    var children = {};
    ids.forEach(function (id) { children[id] = []; });
    ids.forEach(function (id) {
      var pre = T[id].prereq.filter(function (p) { return T[p]; });
      links[id] = pre.filter(function (p) {
        return !pre.some(function (q) { return q !== p && anc[q][p]; });
      });
      T[id].prereq.forEach(function (p) { if (children[p]) children[p].push(id); });
    });

    var maxD = 0;
    ids.forEach(function (id) { if (depth[id] > maxD) maxD = depth[id]; });
    var cols = [];
    for (var c = 0; c <= maxD; c++) cols.push([]);
    ids.forEach(function (id) { cols[depth[id]].push(id); });

    // Barycentre sweeps (forward on drawn links' parents, backward on drawn children).
    var index = {};
    function reindex() { cols.forEach(function (col) { col.forEach(function (id, i) { index[id] = i; }); }); }
    reindex();
    var drawnChildren = {};
    ids.forEach(function (id) { drawnChildren[id] = []; });
    ids.forEach(function (id) { links[id].forEach(function (p) { drawnChildren[p].push(id); }); });
    function bary(list, fallback) {
      if (!list.length) return fallback;
      var s = 0; list.forEach(function (x) { s += index[x]; }); return s / list.length;
    }
    for (var pass = 0; pass < 6; pass++) {
      for (var ci = 1; ci < cols.length; ci++) {
        var keyF = {};
        cols[ci].forEach(function (id) { keyF[id] = bary(links[id], index[id]); });
        cols[ci].sort(function (a, b) { return keyF[a] - keyF[b] || index[a] - index[b]; });
        reindex();
      }
      for (var cj = cols.length - 2; cj >= 0; cj--) {
        var keyB = {};
        cols[cj].forEach(function (id) { keyB[id] = bary(drawnChildren[id], index[id]); });
        cols[cj].sort(function (a, b) { return keyB[a] - keyB[b] || index[a] - index[b]; });
        reindex();
      }
    }

    // Vertical placement: each node wants the mean y of its drawn parents; nodes in a column
    // keep their order and never overlap. Column 0 is packed from the top.
    var pos = {};
    var rowH = NODE_H + GAP_Y;
    cols.forEach(function (col, cIdx) {
      var x = PAD + cIdx * (NODE_W + GAP_X);
      var wants = col.map(function (id) {
        if (cIdx === 0 || !links[id].length) return null;
        var s = 0; links[id].forEach(function (p) { s += pos[p].y; }); return s / links[id].length;
      });
      var prev = -Infinity;
      var ys = col.map(function (id, i) {
        var want = wants[i] != null ? wants[i] : (prev === -Infinity ? PAD : prev + rowH);
        var y = Math.max(want, prev + rowH, PAD);
        prev = y;
        return y;
      });
      // Pull the block back up where that does not break the "no overlap" rule, so a column
      // that got pushed down by one crowded spot stays centred on its parents.
      if (cIdx > 0) {
        var over = 0, n = 0;
        ys.forEach(function (y, i) { if (wants[i] != null) { over += y - wants[i]; n++; } });
        var shift = n ? Math.min(over / n, ys[0] - PAD) : 0;
        if (shift > 0) ys = ys.map(function (y) { return y - shift; });
      }
      col.forEach(function (id, i) { pos[id] = { x: x, y: ys[i] }; });
    });

    var w = 0, h = 0;
    ids.forEach(function (id) { w = Math.max(w, pos[id].x + NODE_W + PAD); h = Math.max(h, pos[id].y + NODE_H + PAD); });
    return { ids: ids, pos: pos, links: links, children: children, anc: anc, width: w, height: h };
  }

  // ---------------------------------------------------------------------
  // Window
  // ---------------------------------------------------------------------
  var ui = null; // the live window's element refs (null when closed)

  function build(root) {
    var lay = computeLayout();
    var nodes = {};

    root.innerHTML = '';
    root.className = 'f-win-content f-win-tech tt-root';

    // ---- header: current research, queue, search, zoom ----
    var head = el('div', 'tt-head');
    var cur = el('div', 'tt-cur');
    var curIcon = el('div', 'tt-cur-icon');
    var curText = el('div', 'tt-cur-text');
    var curName = el('div', 'tt-cur-name');
    var curBar = el('div', 'tt-bar'); var curFill = el('div', 'tt-bar-fill'); curBar.appendChild(curFill);
    var curUnits = el('div', 'tt-cur-units');
    curText.appendChild(curName); curText.appendChild(curBar); curText.appendChild(curUnits);
    var curStop = el('button', 'f-btn tt-cur-stop', '■');
    curStop.type = 'button'; curStop.title = t('ui.tt.cancel');
    curStop.addEventListener('click', function () { F.research.cancel(); update(true); });
    cur.appendChild(curIcon); cur.appendChild(curText); cur.appendChild(curStop);
    cur.addEventListener('click', function (ev) {
      if (ev.target === curStop) return;
      var c = F.state.research.current; if (c) { select(c); centerOn(c, true); }
    });
    head.appendChild(cur);

    var queue = el('div', 'tt-queue');
    head.appendChild(queue);

    var tools = el('div', 'tt-tools');
    var search = el('input', 'tt-search');
    search.type = 'search'; search.placeholder = t('ui.tt.search'); search.value = view.search;
    search.addEventListener('input', function () { view.search = search.value; applyHighlight(); });
    search.addEventListener('keydown', function (ev) {
      ev.stopPropagation();
      if (ev.key === 'Enter') { var m = matches(); if (m.length) { select(m[0]); centerOn(m[0], true); } }
      if (ev.key === 'Escape') { search.value = ''; view.search = ''; applyHighlight(); search.blur(); }
    });
    tools.appendChild(search);
    function tool(text, title, fn) {
      var b = el('button', 'f-btn tt-tool', text); b.type = 'button'; b.title = title;
      b.addEventListener('click', fn); tools.appendChild(b); return b;
    }
    tool('−', t('ui.tt.zoomOut'), function () { zoomAt(view.zoom / 1.25); });
    tool('+', t('ui.tt.zoomIn'), function () { zoomAt(view.zoom * 1.25); });
    tool(t('ui.tt.fit'), t('ui.tt.fitTitle'), function () { fit(true); });
    tool(t('ui.tt.center'), t('ui.tt.centerTitle'), function () {
      var c = F.state.research.current || view.selected; if (c) centerOn(c, true);
    });
    head.appendChild(tools);
    root.appendChild(head);

    // ---- main: graph viewport + detail panel ----
    var main = el('div', 'tt-main');
    var vp = el('div', 'tt-view');
    var canvas = el('div', 'tt-canvas');
    canvas.style.width = lay.width + 'px'; canvas.style.height = lay.height + 'px';
    var SVGNS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('class', 'tt-links');
    svg.setAttribute('width', lay.width); svg.setAttribute('height', lay.height);
    canvas.appendChild(svg);

    var linkEls = []; // { from, to, path }
    lay.ids.forEach(function (id) {
      lay.links[id].forEach(function (p) {
        var a = lay.pos[p], b = lay.pos[id];
        var x1 = a.x + NODE_W, y1 = a.y + NODE_H / 2, x2 = b.x, y2 = b.y + NODE_H / 2;
        var dx = Math.max(30, (x2 - x1) * 0.5);
        var path = document.createElementNS(SVGNS, 'path');
        path.setAttribute('d', 'M' + x1 + ',' + y1 + ' C' + (x1 + dx) + ',' + y1 + ' ' + (x2 - dx) + ',' + y2 + ' ' + x2 + ',' + y2);
        svg.appendChild(path);
        linkEls.push({ from: p, to: id, path: path });
      });
    });

    lay.ids.forEach(function (id) {
      var def = F.data.techs[id];
      var n = el('div', 'tt-node');
      n.style.left = lay.pos[id].x + 'px'; n.style.top = lay.pos[id].y + 'px';
      n.style.width = NODE_W + 'px'; n.style.height = NODE_H + 'px';
      var stripe = el('div', 'tt-stripe');
      def.cost.packs.forEach(function (p) { var s = el('span'); s.style.background = packColor(p[0]); stripe.appendChild(s); });
      n.appendChild(stripe);
      var ic = el('div', 'tt-node-icon'); ic.appendChild(iconNode(techIcon(id), 36)); n.appendChild(ic);
      var body = el('div', 'tt-node-body');
      body.appendChild(el('div', 'tt-node-name', t('tech.' + id)));
      var cost = el('div', 'tt-node-cost');
      def.cost.packs.forEach(function (p) { var dot = el('span', 'tt-flask'); dot.style.background = packColor(p[0]); cost.appendChild(dot); });
      cost.appendChild(el('span', 'tt-node-count', '× ' + def.cost.count));
      cost.appendChild(el('span', 'tt-node-time', def.cost.time + ' s'));
      body.appendChild(cost);
      n.appendChild(body);
      var bar = el('div', 'tt-node-bar'); var fill = el('div', 'tt-node-fill'); bar.appendChild(fill); n.appendChild(bar);
      var badge = el('div', 'tt-badge'); n.appendChild(badge);
      n.addEventListener('mouseenter', function () { hoverId = id; applyHighlight(); });
      n.addEventListener('mouseleave', function () { if (hoverId === id) { hoverId = null; applyHighlight(); } });
      n.addEventListener('click', function (ev) { ev.stopPropagation(); select(id); });
      n.addEventListener('dblclick', function (ev) { ev.stopPropagation(); researchSmart(id); });
      canvas.appendChild(n);
      nodes[id] = { el: n, fill: fill, badge: badge, sig: '' };
    });
    vp.appendChild(canvas);

    var legend = el('div', 'tt-legend');
    ['done', 'available', 'current', 'locked'].forEach(function (s) {
      var item = el('span', 'tt-legend-item');
      item.appendChild(el('span', 'tt-legend-swatch tt-sw-' + s));
      item.appendChild(document.createTextNode(t('ui.tt.legend.' + s)));
      legend.appendChild(item);
    });
    legend.appendChild(el('span', 'tt-legend-hint', t('ui.tt.hint')));
    vp.appendChild(legend);
    main.appendChild(vp);

    var side = el('div', 'tt-side');
    main.appendChild(side);
    root.appendChild(main);

    var hoverId = null;

    // ---- pan & zoom ----
    function applyView() {
      canvas.style.transform = 'translate(' + view.x + 'px,' + view.y + 'px) scale(' + view.zoom + ')';
      vp.style.backgroundPosition = view.x + 'px ' + view.y + 'px';
      vp.style.backgroundSize = (24 * view.zoom) + 'px ' + (24 * view.zoom) + 'px';
    }
    // Keep at least a margin of the tree on screen: a tree larger than the view can be panned
    // until its edge reaches the margin; a smaller one can move freely inside the view.
    function clampView() {
      var vw = vp.clientWidth || 800, vh = vp.clientHeight || 500, m = 80;
      var cw = lay.width * view.zoom, ch = lay.height * view.zoom;
      view.x = F.util.clamp(view.x, Math.min(m, vw - cw - m), Math.max(m, vw - cw - m));
      view.y = F.util.clamp(view.y, Math.min(m, vh - ch - m), Math.max(m, vh - ch - m));
    }
    function zoomAt(z, px, py) {
      z = F.util.clamp(z, ZOOM_MIN, ZOOM_MAX);
      var vw = vp.clientWidth || 800, vh = vp.clientHeight || 500;
      if (px == null) { px = vw / 2; py = vh / 2; }
      var wx = (px - view.x) / view.zoom, wy = (py - view.y) / view.zoom;
      view.zoom = z;
      view.x = px - wx * z; view.y = py - wy * z;
      clampView(); applyView();
    }
    function fit(animate) {
      var vw = vp.clientWidth || 800, vh = vp.clientHeight || 500;
      view.zoom = F.util.clamp(Math.min(vw / lay.width, vh / lay.height), ZOOM_MIN, 1);
      view.x = (vw - lay.width * view.zoom) / 2; view.y = (vh - lay.height * view.zoom) / 2;
      smooth(animate); applyView();
    }
    function centerOn(id, animate) {
      var p = lay.pos[id]; if (!p) return;
      var vw = vp.clientWidth || 800, vh = vp.clientHeight || 500;
      if (view.zoom < 0.7) view.zoom = 0.9;
      view.x = vw / 2 - (p.x + NODE_W / 2) * view.zoom;
      view.y = vh / 2 - (p.y + NODE_H / 2) * view.zoom;
      clampView(); smooth(animate); applyView();
    }
    function smooth(on) {
      canvas.classList.toggle('tt-smooth', !!on);
      if (on) window.setTimeout(function () { canvas.classList.remove('tt-smooth'); }, 260);
    }
    var drag = null;
    vp.addEventListener('pointerdown', function (ev) {
      if (ev.button !== 0 || ev.target.closest('.tt-node') || ev.target.closest('.tt-legend')) return;
      drag = { sx: ev.clientX, sy: ev.clientY, x: view.x, y: view.y, moved: false };
      vp.setPointerCapture(ev.pointerId);
      vp.classList.add('tt-dragging');
    });
    vp.addEventListener('pointermove', function (ev) {
      if (!drag) return;
      var dx = ev.clientX - drag.sx, dy = ev.clientY - drag.sy;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      view.x = drag.x + dx; view.y = drag.y + dy;
      clampView(); applyView();
    });
    function endDrag(ev) {
      if (!drag) return;
      if (!drag.moved && ev.type === 'pointerup') { view.selected = null; renderSide(); applyHighlight(); }
      drag = null; vp.classList.remove('tt-dragging');
    }
    vp.addEventListener('pointerup', endDrag);
    vp.addEventListener('pointercancel', endDrag);
    vp.addEventListener('wheel', function (ev) {
      ev.preventDefault();
      var r = vp.getBoundingClientRect();
      zoomAt(view.zoom * Math.pow(1.0015, -ev.deltaY), ev.clientX - r.left, ev.clientY - r.top);
    }, { passive: false });

    // ---- highlight (hover chain, selection, search) ----
    function matches() {
      var q = view.search.trim().toLowerCase();
      if (!q) return [];
      return lay.ids.filter(function (id) {
        if (t('tech.' + id).toLowerCase().indexOf(q) >= 0) return true;
        return F.data.techs[id].unlocks.some(function (u) { return recipeName(u).toLowerCase().indexOf(q) >= 0; });
      });
    }
    function applyHighlight() {
      var focus = hoverId || view.selected;
      var lit = null;
      if (focus) {
        lit = {}; lit[focus] = true;
        for (var a in lay.anc[focus]) if (!F.research.isDone(a)) lit[a] = true;
        F.data.techs[focus].prereq.forEach(function (p) { lit[p] = true; }); // direct needs, even if done
        lay.children[focus].forEach(function (c) { lit[c] = true; });
      }
      var m = matches(), hit = null;
      if (view.search.trim()) { hit = {}; m.forEach(function (id) { hit[id] = true; }); }
      lay.ids.forEach(function (id) {
        var n = nodes[id].el;
        n.classList.toggle('tt-selected', id === view.selected);
        n.classList.toggle('tt-match', !!(hit && hit[id]));
        // Hover dims hard (a quick look at one chain); a selection only fades the rest a bit.
        var dim = (hit && !hit[id]) || (!hit && lit && !lit[id]);
        n.classList.toggle('tt-dim', !!(dim && (hit || hoverId)));
        n.classList.toggle('tt-fade', !!(dim && !hit && !hoverId));
      });
      linkEls.forEach(function (l) {
        var on = !!(lit && lit[l.from] && lit[l.to] && (l.to === focus || lay.anc[focus][l.to] || l.from === focus));
        var done = F.research.isDone(l.from);
        l.path.setAttribute('class', 'tt-link' + (done ? ' tt-link-done' : '') + (on ? ' tt-link-lit' : '') + ((hoverId || hit) && !on ? ' tt-link-dim' : ''));
      });
    }

    // ---- actions ----
    function select(id) {
      view.selected = id;
      renderSide(); applyHighlight();
    }
    function researchSmart(id) {
      var inf = info(id);
      if (!inf || inf.done) return;
      if (inf.available) F.research.start(id);
      else F.research.queueWithPrereqs(id);
      select(id);
      update(true);
    }

    // ---- detail panel ----
    var sideSig = '';
    function chip(id) {
      var inf = info(id);
      var c = el('button', 'tt-chip tt-chip-' + stateOf(inf));
      c.type = 'button';
      c.appendChild(iconNode(techIcon(id), 20));
      c.appendChild(el('span', null, inf.name));
      c.addEventListener('click', function () { select(id); centerOn(id, true); });
      return c;
    }
    function section(title) {
      var s = el('div', 'tt-sec');
      s.appendChild(el('div', 'tt-sec-title', title));
      side.appendChild(s);
      return s;
    }
    function tip(node, htmlFn) {
      node.addEventListener('mouseenter', function (ev) { F.ui.tooltip(htmlFn(), ev.clientX, ev.clientY); });
      node.addEventListener('mousemove', function (ev) { F.ui.tooltip(htmlFn(), ev.clientX, ev.clientY); });
      node.addEventListener('mouseleave', function () { F.ui.hideTooltip(); });
    }
    function renderSide() {
      var id = view.selected;
      var inf = id ? info(id) : null;
      sideSig = inf ? id + '|' + stateOf(inf) + '|' + F.research.missingChain(id).length + '|' + F.state.research.queue.length : '';
      side.innerHTML = '';
      F.ui.hideTooltip();
      if (!inf) {
        side.appendChild(el('div', 'tt-side-empty', t('ui.tt.selectHint')));
        return;
      }
      var def = F.data.techs[id];
      var st = stateOf(inf);
      var top = el('div', 'tt-side-top');
      var bigIc = el('div', 'tt-side-icon tt-state-' + st); bigIc.appendChild(iconNode(techIcon(id), 56));
      top.appendChild(bigIc);
      var tt = el('div', 'tt-side-title');
      tt.appendChild(el('div', 'tt-side-name', inf.name));
      tt.appendChild(el('span', 'tt-pill tt-pill-' + st, t('ui.tt.state.' + st)));
      top.appendChild(tt);
      side.appendChild(top);
      if (inf.desc && inf.desc !== 'tech.' + id + '.desc') side.appendChild(el('div', 'tt-desc', inf.desc));

      // progress
      var pb = el('div', 'tt-bar tt-side-bar'); var pf = el('div', 'tt-bar-fill'); pb.appendChild(pf);
      pf.style.width = (inf.fraction * 100).toFixed(1) + '%';
      var pl = el('div', 'tt-side-units', t('ui.tt.units', { done: Math.floor(inf.unitsDone), total: inf.unitsTotal }));
      if (!inf.done) { side.appendChild(pb); side.appendChild(pl); }
      ui.sideFill = pf; ui.sideUnits = pl;

      // actions
      var acts = el('div', 'tt-actions');
      function act(text, cls, fn, disabled) {
        var b = el('button', 'f-btn tt-act ' + (cls || ''), text); b.type = 'button';
        if (disabled) b.disabled = true;
        b.addEventListener('click', function () { fn(); update(true); });
        acts.appendChild(b);
      }
      var missing = F.research.missingChain(id);
      if (inf.done) act(t('ui.tt.researched'), 'tt-act-done', function () {}, true);
      else if (inf.isCurrent) act(t('ui.tt.cancel'), '', function () { F.research.cancel(); });
      else {
        if (inf.available) act(t('ui.tt.research'), 'tt-act-primary', function () { F.research.start(id); });
        else act(t('ui.tt.researchChain', { n: missing.length - (missing.indexOf(F.state.research.current) >= 0 ? 1 : 0) }), 'tt-act-primary', function () { F.research.queueWithPrereqs(id); });
        if (inf.queued) act(t('ui.tt.dequeue'), '', function () { F.research.dequeue(id); });
        else if (inf.available) act(t('ui.tt.queue'), '', function () { F.research.queue(id); });
      }
      side.appendChild(acts);
      if (!inf.done && !inf.available) side.appendChild(el('div', 'tt-note', t('ui.tt.missing', { n: missing.length - 1 })));

      // cost
      var cs = section(t('ui.tt.cost'));
      var packs = el('div', 'tt-packs');
      def.cost.packs.forEach(function (p) {
        var pk = el('div', 'tt-pack');
        pk.appendChild(F.ui.iconEl(p[0], 32));
        pk.appendChild(el('span', null, '× ' + (p[1] * def.cost.count)));
        tip(pk, function () { return F.ui.itemTooltipHtml(p[0]); });
        packs.appendChild(pk);
      });
      cs.appendChild(packs);
      cs.appendChild(el('div', 'tt-note', t('ui.tt.perUnit', { t: def.cost.time }) + ' · ' + t('ui.tt.totalTime', { t: fmtNum(def.cost.time * def.cost.count) })));

      // unlocks + effects
      if (def.unlocks.length) {
        var us = section(t('ui.tt.unlocks'));
        var grid = el('div', 'tt-unlocks');
        def.unlocks.forEach(function (u) {
          var row = el('div', 'tt-unlock');
          row.appendChild(iconNode(recipeIcon(u), 32));
          row.appendChild(el('span', null, recipeName(u)));
          tip(row, function () {
            return F.ui.recipeTooltipHtml ? F.ui.recipeTooltipHtml(u) : esc(recipeName(u));
          });
          grid.appendChild(row);
        });
        us.appendChild(grid);
      }
      if (def.effects && def.effects.length) {
        var es = section(t('ui.tt.effects'));
        def.effects.forEach(function (eff) { es.appendChild(el('div', 'tt-effect', effectText(eff))); });
      }

      // graph neighbours
      var rq = section(t('ui.tt.requires'));
      if (def.prereq.length) { var rw = el('div', 'tt-chips'); def.prereq.forEach(function (p) { if (F.data.techs[p]) rw.appendChild(chip(p)); }); rq.appendChild(rw); }
      else rq.appendChild(el('div', 'tt-note', t('ui.tt.none')));
      var kids = lay.children[id];
      if (kids.length) {
        var lt = section(t('ui.tt.leadsTo'));
        var kw = el('div', 'tt-chips'); kids.forEach(function (c) { kw.appendChild(chip(c)); }); lt.appendChild(kw);
      }
    }

    // ---- live update (in place) ----
    function update(force) {
      var r = F.state && F.state.research;
      if (!r) return;
      // nodes
      lay.ids.forEach(function (id) {
        var inf = info(id); if (!inf) return;
        var st = stateOf(inf);
        var qi = r.queue.indexOf(id);
        var sig = st + '|' + qi;
        var nd = nodes[id];
        if (sig !== nd.sig) {
          nd.sig = sig;
          nd.el.className = nd.el.className.replace(/\btt-s-\w+\b/g, '').trim() + ' tt-s-' + st;
          nd.badge.textContent = st === 'done' ? '✓' : st === 'current' ? '▶' : qi >= 0 ? String(qi + 1) : '';
        }
        var frac = inf.done ? 0 : inf.fraction;
        nd.fill.style.width = (frac * 100).toFixed(1) + '%';
        nd.el.classList.toggle('tt-has-progress', frac > 0);
      });
      // header
      var cid = r.current;
      if (cid !== ui.curId || force) {
        ui.curId = cid;
        curIcon.innerHTML = '';
        if (cid) curIcon.appendChild(iconNode(techIcon(cid), 36));
        curName.textContent = cid ? t('tech.' + cid) : t('ui.tt.noResearch');
        cur.classList.toggle('tt-cur-idle', !cid);
        curStop.style.display = cid ? '' : 'none';
      }
      if (cid) {
        var ci = info(cid);
        curFill.style.width = (ci.fraction * 100).toFixed(1) + '%';
        curUnits.textContent = t('ui.tt.units', { done: Math.floor(ci.unitsDone), total: ci.unitsTotal }) + ' · ' + Math.floor(ci.fraction * 100) + '%';
      } else { curFill.style.width = '0%'; curUnits.textContent = ''; }
      var qsig = r.queue.join(',');
      if (qsig !== ui.queueSig || force) {
        ui.queueSig = qsig;
        queue.innerHTML = '';
        if (!r.queue.length) queue.appendChild(el('div', 'tt-queue-empty', t('ui.tt.queueEmpty')));
        r.queue.forEach(function (qid, i) {
          var q = el('button', 'tt-qchip');
          q.type = 'button';
          q.title = t('ui.tt.queueChipTitle', { name: t('tech.' + qid) });
          q.appendChild(iconNode(techIcon(qid), 28));
          q.appendChild(el('span', 'tt-qnum', String(i + 1)));
          q.addEventListener('click', function () { F.research.dequeue(qid); update(true); });
          q.addEventListener('contextmenu', function (ev) { ev.preventDefault(); select(qid); centerOn(qid, true); });
          queue.appendChild(q);
        });
      }
      // detail panel: rebuild only when its content would change; else just move the bar.
      var sel = view.selected;
      var sinf = sel ? info(sel) : null;
      var ssig = sinf ? sel + '|' + stateOf(sinf) + '|' + F.research.missingChain(sel).length + '|' + r.queue.length : '';
      if (ssig !== sideSig || force) renderSide();
      else if (sinf && ui.sideFill) {
        ui.sideFill.style.width = (sinf.fraction * 100).toFixed(1) + '%';
        ui.sideUnits.textContent = t('ui.tt.units', { done: Math.floor(sinf.unitsDone), total: sinf.unitsTotal });
      }
      if (force) applyHighlight();
    }

    ui = { root: root, update: update, curId: undefined, queueSig: null, sideFill: null, sideUnits: null, centerOn: centerOn, fit: fit, select: select };
    update(true);
    renderSide();
    applyHighlight();

    // First layout needs real viewport size: position once the window is in the DOM.
    window.requestAnimationFrame(function () {
      if (view.x == null) {
        var start = F.state.research.current || view.selected;
        if (start) centerOn(start, false);
        else {
          view.zoom = 0.9; view.x = 20; view.y = 20; clampView(); applyView();
        }
      } else { clampView(); applyView(); }
    });
    applyView();
  }

  var timer = null;
  function startTimer() {
    if (timer) window.clearInterval(timer);
    timer = window.setInterval(function () {
      if (!ui || !document.body.contains(ui.root) || !F.ui.isOpen('tech')) {
        window.clearInterval(timer); timer = null; ui = null; F.ui.hideTooltip(); return;
      }
      try { ui.update(false); } catch (err) { F.log.error('techtree: update failed', err); }
    }, 200);
  }
  F.events.on('research:done', function () { if (ui && document.body.contains(ui.root)) ui.update(true); });

  F.ui.registerWindow('tech', {
    create: function () {
      var body = el('div');
      var frame = F.ui.windowFrame(t('ui.technologies'), body);
      frame.classList.add('tt-window');
      if (frame._bodyEl) frame._bodyEl.classList.add('tt-body');
      build(body);
      frame._contentEl = body;
      startTimer();
      return frame;
    },
    // 70-ui.js calls refresh every few frames; the window's own 200 ms timer already keeps it live.
    refresh: function () {},
    onClose: function () { if (timer) { window.clearInterval(timer); timer = null; } ui = null; F.ui.hideTooltip(); },
  });

  // Small API for other modules (e.g. a HUD research button): open the tree on a technology.
  F.ui.openTech = function (techId) {
    if (techId) view.selected = techId;
    if (!F.ui.isOpen('tech')) F.ui.open('tech');
    if (ui && techId) { ui.select(techId); ui.centerOn(techId, true); }
  };
})();
