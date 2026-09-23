# Building art brief (painter packs 62/63/64-sprites-*.js)

Goal: Factorio-like, realistic industrial top-down (slightly 3/4) art for every building, drawn
procedurally with Canvas 2D. Current sprites in src/60-sprites.js are flat bevelled boxes; the new
painters replace them via `F.sprites.definePainter(types, fn)` from separate files.

## Contract
- New file wraps everything in `(function () { 'use strict'; if (!F.sprites || !F.sprites.definePainter) return; ... })();`
  ES5 style (`var`, `function`) like the rest of the codebase. No `ctx.fillText`, no `ctx.filter`,
  no DOM access, no external images. Do NOT edit src/60-sprites.js.
- Painter signature: `function (ctx, W, H, frame, dir, def, type, opts)`.
  - Drawn in LOCAL "facing north" coordinates; the caller rotates for dir 1..3. `W,H` = footprint
    at dir 0 in px = tiles × 64 (sprites are baked at 2×, 64 px per tile).
  - `frame` 0..15 is a looping animation frame (only advances while working); must loop seamlessly
    (frame 15 → 0). Accumulator: frame = charge level 0..4.
  - `opts.working` (bool) for furnace/drill/boiler/engine/assembler/lab; `opts.lit` for lamp;
    `opts.mask` for pipe/wall neighbour bitmask (bit0=N,1=E,2=S,3=W).
- Output is cached per (type, dir, frame, opts), so gradients and detail are fine — but keep each
  painter under ~2 ms.
- The cast shadow is added automatically (south-east, from the painted silhouette). Do NOT draw
  a drop shadow; leave ~3–6 % transparent margin on the south/east sides so the shadow shows.
  Transparent areas are fine and encouraged (non-rectangular silhouettes read better).
- Light comes from the top-left: highlights on top/left edges, darker bottom/right.

## Helpers: `var L = F.sprites.lib;`
`L.panel(ctx,x,y,w,h,color,{r,hi,lo,rim,outline})` top-lit rounded plate ·
`L.inset(ctx,x,y,w,h,color,r)` recessed hole/window · `L.glow(ctx,cx,cy,r,color,alpha)` additive light ·
`L.cylinder(ctx,x,y,w,h,color,horizontal,{r})` shaded tube/tank · `L.disc(ctx,cx,cy,r,color)` dome/cap ·
`L.rivets(ctx,[[x,y],...],r)` · `L.vent(ctx,x,y,w,h,n,vertical)` grille ·
`L.foundation(ctx,W,H,color)` base slab · `L.pipeNub(ctx,x,y,dir,size)` pipe connector at an edge point ·
`L.hazardStripe(ctx,x,y,w,h,stripeW)` · `L.gearShape(ctx,cx,cy,rOut,rHole,teeth,angle,color,holeColor)` ·
`L.smokePuffs(ctx,cx,cy,frame,scale)` · `L.roundRectPath(ctx,x,y,w,h,r)` · colour: `L.lighten/darken(hex,amt)`,
`L.mix(a,b,t)`, `L.rgba(hex,a)` · `L.entColors(def)` → [itemColor, itemColor2] · `L.PX` (=64).

## Style
- Muted industrial palette: steel greys (#6E767C … #9AA3A8), dark iron (#3A3D40), brass/yellow
  accents (#C9A227), stone (#8C8273 …), rust/orange fire (#FF8A2A → #FFD27A).
- Layered construction: foundation slab → body panels → detail (seams, rivets, vents, pipes,
  hatches, warning stripes) → lights. Every building gets a readable silhouette and at least one
  animated/working cue (fire glow, spinning part, blinking light, smoke).
- Idle state = same building, lights off / glow dimmed, parts frozen.
- Keep things legible at 32 px/tile (zoom 1): strong shapes first, fine detail second.

## Verify
`node --check <your file>`, then `node build/build.js` and `node test/headless.js --ticks 3600 --summary`
(all scenarios must PASS). The orchestrator reviews the pixels in a browser afterwards.
