// Small shared helpers for the playthrough bot (test/bot/*).
'use strict';

const key = (x, y) => x + ',' + y;
const DIRV = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // N E S W, matches F.C.DIRS

// Axis-aligned rectangle helpers: { x, y, w, h } in tiles.
function rectsOverlap(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}
function grow(r, m) { return { x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m }; }

// Squares around (cx, cy) in rings of increasing Chebyshev radius.
function* spiral(cx, cy, maxR) {
  yield [cx, cy];
  for (let r = 1; r <= maxR; r++) {
    for (let i = -r; i < r; i++) {
      yield [cx + i, cy - r];
      yield [cx + r, cy + i];
      yield [cx - i, cy + r];
      yield [cx - r, cy - i];
    }
  }
}

// Min-heap keyed by .f, used by the pipe router.
class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(n) {
    const a = this.a; a.push(n);
    let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (a[p].f <= a[i].f) break; [a[p], a[i]] = [a[i], a[p]]; i = p; }
  }
  pop() {
    const a = this.a; const top = a[0]; const last = a.pop();
    if (a.length) {
      a[0] = last; let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]]; i = m;
      }
    }
    return top;
  }
}

module.exports = { key, DIRV, rectsOverlap, grow, spiral, Heap };
