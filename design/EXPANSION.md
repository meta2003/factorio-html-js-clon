# Factio expansion: oil, trains, logistic robots, rocket silo

This document is the SINGLE SOURCE OF TRUTH for the expansion. Several agents work in parallel,
each owning specific files (section 9). Never edit a file you do not own; if you need something from
another area that is not specified here, implement a guarded local fallback and mention it in your report.
Read also: `design/ARCHITECTURE.md` (existing APIs), `design/ENGINEERING-CONSTRAINTS.md`,
`design/BUILDING-ART.md` (art contract). Code style: ES5-ish like the rest (`var`, `function`, IIFE
`(function () { 'use strict'; ... })();`), English only, no external assets, must run headless
(`window.HEADLESS` → no DOM/canvas; sprites return dummies).

Build/test WITHOUT clobbering other agents:
`node build/build.js --out build/_<yourname>.html` then
`node test/headless.js --html build/_<yourname>.html --ticks 600 --summary [--only <substr>]`.
The runner loads `test/scenarios.js` plus every `test/scenarios-*.js`. Scenario shape:
`module.exports = { my_scenario(F, assert, window) { ...; return 'note'; } }`. Helpers from
test/scenarios.js are not exported — copy what you need.

## 1. Progression overview

Science packs: red `automation-science-pack`, green `logistic-science-pack` (existing), NEW:
blue `chemical-science-pack`, purple `production-science-pack`, yellow `utility-science-pack`,
white `space-science-pack` (trophy — produced only by launching a rocket, not used by any tech).
Labs get **5 pack slots** (`def.lab.slots = 5`).

Oil → plastic/sulfur → advanced circuits + engines → blue science → advanced oil, lubricant,
batteries, electric engines, processing units → robots, purple & yellow science → rocket parts →
rocket silo → launch (victory).
Trains unlock at green (railway) — a mid-game logistics option.

## 2. Fluids

`F.data.fluids = { id: { id, color, color2 } }` (owned by data file). Display names via i18n
`fluid.<id>`. Ids and colours:

| id | color | color2 |
|---|---|---|
| water | #3F7FD9 | #7FB2F0 |
| steam | #D8D8D8 | #FFFFFF |
| crude-oil | #2B2522 | #5A4636 |
| heavy-oil | #A5501F | #D07A3A |
| light-oil | #E0A92E | #F4D06A |
| petroleum-gas | #8C5BA8 | #C39AD8 |
| lubricant | #3E8E4E | #7CC48A |
| sulfuric-acid | #CFCF2F | #F0F07A |

Fluid amounts are plain units; pipes hold 100, storage tank 25000.

## 3. Items (new)

Row shape as ITEM_ROWS in 01-data.js: [id, stack, fuelMJ, category, place|null, iconShape, color, color2].
`iconShape` values marked (NEW) are drawn by the new icon painters (`F.sprites.defineIcon`).

| id | stack | fuel | category | place | icon | color | color2 |
|---|---|---|---|---|---|---|---|
| plastic-bar | 100 | 0 | intermediate | – | plastic (NEW) | #E8E8E8 | #B8B8B8 |
| sulfur | 50 | 0 | intermediate | – | powder (NEW) | #E6D335 | #B8A520 |
| solid-fuel | 50 | 12 | intermediate | – | fuel-block (NEW) | #6E6A5E | #3A3830 |
| battery | 200 | 0 | intermediate | – | battery-cell (NEW) | #B8B8B8 | #C44A2A |
| engine-unit | 50 | 0 | intermediate | – | engine (NEW) | #8A8F94 | #5A5F64 |
| electric-engine-unit | 50 | 0 | intermediate | – | engine (NEW) | #4E7FB0 | #2F4F70 |
| advanced-circuit | 200 | 0 | intermediate | – | pcb | #B03030 | #E0B040 |
| processing-unit | 100 | 0 | intermediate | – | pcb | #2F55B0 | #E0B040 |
| flying-robot-frame | 50 | 0 | intermediate | – | robot-frame (NEW) | #9AA3AA | #D9A520 |
| low-density-structure | 50 | 0 | intermediate | – | lds (NEW) | #C98A3A | #8A8F94 |
| rocket-fuel | 10 | 100 | intermediate | – | fuel-cell (NEW) | #D9422B | #F0A020 |
| rocket-control-unit | 10 | 0 | intermediate | – | pcb | #3FA35A | #E0D040 |
| satellite | 1 | 0 | intermediate | – | satellite (NEW) | #C8CCD0 | #2B4C7E |
| chemical-science-pack | 200 | 0 | science | – | flask | #3A8FD9 | – |
| production-science-pack | 200 | 0 | science | – | flask | #9B4FD1 | – |
| utility-science-pack | 200 | 0 | science | – | flask | #E8C832 | – |
| space-science-pack | 2000 | 0 | science | – | flask | #F2F2F2 | – |
| pumpjack | 20 | 0 | production | pumpjack | – | #6E767C | – |
| oil-refinery | 10 | 0 | production | oil-refinery | – | #7A8590 | – |
| chemical-plant | 10 | 0 | production | chemical-plant | – | #6E8C6E | – |
| storage-tank | 50 | 0 | logistics | storage-tank | – | #8A8F94 | – |
| rail | 100 | 0 | logistics | rail | – | #8A8F94 | #6B4A2A |
| train-stop | 10 | 0 | logistics | train-stop | – | #C9A227 | – |
| locomotive | 5 | 0 | logistics | – (vehicle) | locomotive (NEW) | #C24A2A | #3A3D40 |
| cargo-wagon | 5 | 0 | logistics | – (vehicle) | wagon (NEW) | #8A8F94 | #5A4636 |
| roboport | 10 | 0 | logistics | roboport | – | #8A8F94 | #D9A520 |
| logistic-robot | 50 | 0 | logistics | – | robot (NEW) | #D9C040 | #8A8F94 |
| passive-provider-chest | 50 | 0 | logistics | passive-provider-chest | – | #C43A3A | – |
| storage-chest | 50 | 0 | logistics | storage-chest | – | #D9B830 | – |
| requester-chest | 50 | 0 | logistics | requester-chest | – | #3A7FD9 | – |
| rocket-silo | 1 | 0 | production | rocket-silo | – | #8A8F94 | – |

Vehicle items carry `vehicle: 'locomotive'|'cargo-wagon'` and no `place` (they are placed by the
virtual placer API, §6.4). Placeable items (with `place`) get their icon as an entity miniature
automatically.

## 4. Recipes (new)

Row: [id, items-in, items-out, time, category, unlockedBy, fluidsIn, fluidsOut]. `fluidsIn/Out`
are `[[fluidId, amount], ...]` stored on the recipe as `fluidIngredients` / `fluidResults`
(NOT in `ingredients`/`results`, so item code never sees fluids). `hand` = category === 'crafting'.
Categories: `crafting` (hand + assemblers), `advanced` (assemblers only), `oil-processing`
(refinery), `chemistry` (chemical plant), `rocket-building` (silo only, hidden from menus).

| id | items in | items out | time | category | unlockedBy | fluids in | fluids out |
|---|---|---|---|---|---|---|---|
| basic-oil-processing | – | – | 5 | oil-processing | oil-processing | crude-oil 100 | petroleum-gas 45 |
| advanced-oil-processing | – | – | 5 | oil-processing | advanced-oil-processing | crude-oil 100, water 50 | heavy-oil 25, light-oil 45, petroleum-gas 55 |
| heavy-oil-cracking | – | – | 2 | chemistry | advanced-oil-processing | heavy-oil 40, water 30 | light-oil 30 |
| light-oil-cracking | – | – | 2 | chemistry | advanced-oil-processing | light-oil 30, water 30 | petroleum-gas 20 |
| plastic-bar | coal 1 | plastic-bar 2 | 1 | chemistry | plastics | petroleum-gas 20 | – |
| sulfur | – | sulfur 2 | 1 | chemistry | sulfur-processing | water 30, petroleum-gas 30 | – |
| sulfuric-acid | sulfur 5, iron-plate 1 | – | 1 | chemistry | sulfur-processing | water 100 | sulfuric-acid 50 |
| lubricant | – | – | 1 | chemistry | lubricant | heavy-oil 10 | lubricant 10 |
| solid-fuel-from-petroleum-gas | – | solid-fuel 1 | 2 | chemistry | oil-processing | petroleum-gas 20 | – |
| solid-fuel-from-light-oil | – | solid-fuel 1 | 2 | chemistry | advanced-oil-processing | light-oil 10 | – |
| battery | iron-plate 1, copper-plate 1 | battery 1 | 4 | chemistry | battery | sulfuric-acid 20 | – |
| electric-engine-unit | engine-unit 1, electronic-circuit 2 | electric-engine-unit 1 | 10 | chemistry | electric-engine | lubricant 15 | – |
| processing-unit | electronic-circuit 20, advanced-circuit 2 | processing-unit 1 | 10 | chemistry | advanced-electronics-2 | sulfuric-acid 5 | – |
| rocket-fuel | solid-fuel 10 | rocket-fuel 1 | 30 | chemistry | rocket-fuel | light-oil 10 | – |
| engine-unit | steel-plate 1, iron-gear-wheel 1, pipe 2 | engine-unit 1 | 10 | advanced | engine | – | – |
| advanced-circuit | plastic-bar 2, copper-cable 4, electronic-circuit 2 | advanced-circuit 1 | 6 | crafting | advanced-electronics | – | – |
| flying-robot-frame | electric-engine-unit 1, battery 2, steel-plate 1, electronic-circuit 3 | flying-robot-frame 1 | 20 | crafting | robotics | – | – |
| low-density-structure | copper-plate 20, steel-plate 2, plastic-bar 5 | low-density-structure 1 | 20 | crafting | low-density-structure | – | – |
| rocket-control-unit | processing-unit 1, battery 1 | rocket-control-unit 1 | 30 | crafting | rocket-control-unit | – | – |
| satellite | low-density-structure 20, solar-panel 10, accumulator 10, radar 5, processing-unit 20, rocket-fuel 20 | satellite 1 | 5 | crafting | rocket-silo | – | – |
| rocket-part | low-density-structure 10, rocket-fuel 10, rocket-control-unit 10 | – (progress in silo) | 3 | rocket-building | rocket-silo | – | – |
| chemical-science-pack | engine-unit 2, advanced-circuit 3, sulfur 1 | chemical-science-pack 2 | 24 | crafting | chemical-science-pack | – | – |
| production-science-pack | rail 10, steel-furnace 1, advanced-circuit 2 | production-science-pack 3 | 21 | crafting | production-science-pack | – | – |
| utility-science-pack | flying-robot-frame 2, low-density-structure 3, processing-unit 2 | utility-science-pack 3 | 21 | crafting | utility-science-pack | – | – |
| pumpjack | steel-plate 5, iron-gear-wheel 10, electronic-circuit 5, pipe 10 | pumpjack 1 | 5 | crafting | oil-processing | – | – |
| oil-refinery | steel-plate 15, iron-gear-wheel 10, stone-brick 10, electronic-circuit 10, pipe 10 | oil-refinery 1 | 8 | crafting | oil-processing | – | – |
| chemical-plant | steel-plate 5, iron-gear-wheel 5, electronic-circuit 5, pipe 5 | chemical-plant 1 | 5 | crafting | oil-processing | – | – |
| storage-tank | iron-plate 20, steel-plate 5 | storage-tank 1 | 3 | crafting | fluid-handling | – | – |
| rail | stone 1, iron-stick 1, steel-plate 1 | rail 2 | 0.5 | crafting | railway | – | – |
| locomotive | engine-unit 20, electronic-circuit 10, steel-plate 30 | locomotive 1 | 4 | crafting | railway | – | – |
| cargo-wagon | iron-gear-wheel 10, iron-plate 20, steel-plate 20 | cargo-wagon 1 | 1 | crafting | railway | – | – |
| train-stop | electronic-circuit 5, iron-plate 6, iron-stick 6, steel-plate 3 | train-stop 1 | 0.5 | crafting | automated-rail-transportation | – | – |
| roboport | steel-plate 45, iron-gear-wheel 45, advanced-circuit 45 | roboport 1 | 5 | crafting | logistic-robotics | – | – |
| logistic-robot | flying-robot-frame 1, advanced-circuit 2 | logistic-robot 1 | 0.5 | crafting | logistic-robotics | – | – |
| passive-provider-chest | steel-chest 1, electronic-circuit 3, advanced-circuit 1 | passive-provider-chest 1 | 0.5 | crafting | logistic-robotics | – | – |
| storage-chest | steel-chest 1, electronic-circuit 3, advanced-circuit 1 | storage-chest 1 | 0.5 | crafting | logistic-robotics | – | – |
| requester-chest | steel-chest 1, electronic-circuit 3, advanced-circuit 1 | requester-chest 1 | 0.5 | crafting | logistic-robotics | – | – |
| rocket-silo | steel-plate 100, electric-engine-unit 20, processing-unit 20, pipe 50, stone-brick 100 | rocket-silo 1 | 30 | crafting | rocket-silo | – | – |

Recipes whose items-out list is empty are allowed (fluid-only results); the tab of such a recipe is
'intermediate'; they never appear in the hand-crafting grid (non-hand recipes are shown only in machine
recipe pickers). Crafting grid shows only `hand` recipes; assemblers list `crafting` + `advanced`.

## 5. Technologies (new)

Packs: R=red, G=green, B=blue, P=purple, Y=yellow. Tier: 3 for R+G+B, 4 for anything with P or Y.
Tier-2 techs below (R+G only) keep tier 2.

| id | prereq | packs | count | time | unlocks (recipe ids) |
|---|---|---|---|---|---|
| fluid-handling | logistic-science-pack, steel-processing | RG | 50 | 15 | storage-tank |
| oil-processing | fluid-handling | RG | 100 | 30 | pumpjack, oil-refinery, chemical-plant, basic-oil-processing, solid-fuel-from-petroleum-gas |
| plastics | oil-processing | RG | 200 | 30 | plastic-bar |
| sulfur-processing | oil-processing | RG | 150 | 30 | sulfur, sulfuric-acid |
| advanced-electronics | plastics, electronics | RG | 200 | 15 | advanced-circuit |
| engine | steel-processing, logistic-science-pack | RG | 100 | 15 | engine-unit |
| chemical-science-pack | advanced-electronics, sulfur-processing, engine | RG | 75 | 10 | chemical-science-pack |
| railway | logistics-2, engine | RG | 75 | 30 | rail, locomotive, cargo-wagon |
| automated-rail-transportation | railway | RG | 75 | 30 | train-stop |
| advanced-oil-processing | chemical-science-pack | RGB | 75 | 30 | advanced-oil-processing, heavy-oil-cracking, light-oil-cracking, solid-fuel-from-light-oil |
| lubricant | advanced-oil-processing | RGB | 50 | 30 | lubricant |
| electric-engine | lubricant | RGB | 50 | 30 | electric-engine-unit |
| battery | sulfur-processing, chemical-science-pack | RGB | 150 | 30 | battery |
| robotics | electric-engine, battery | RGB | 75 | 30 | flying-robot-frame |
| logistic-robotics | robotics | RGB | 250 | 30 | roboport, logistic-robot, passive-provider-chest, storage-chest, requester-chest |
| advanced-electronics-2 | chemical-science-pack | RGB | 300 | 30 | processing-unit |
| low-density-structure | chemical-science-pack, plastics | RGB | 300 | 45 | low-density-structure |
| production-science-pack | advanced-electronics-2, railway | RGB | 100 | 30 | production-science-pack |
| utility-science-pack | robotics, advanced-electronics-2, low-density-structure | RGB | 100 | 30 | utility-science-pack |
| rocket-fuel | advanced-oil-processing, production-science-pack | RGBP | 300 | 45 | rocket-fuel |
| rocket-control-unit | utility-science-pack, production-science-pack | RGBPY | 300 | 45 | rocket-control-unit |
| rocket-silo | rocket-fuel, rocket-control-unit, low-density-structure | RGBPY | 500 | 60 | rocket-silo, rocket-part, satellite |


## 6. Core hook APIs (Phase A — implemented in existing files, used by features)

All hooks are additive; existing behaviour must be unchanged when nothing is registered.

### 6.1 Game loop / state (`80-game.js`)
- `F.game.addTickPhase(name, after, fn)` — runs `fn()` every tick right after the named built-in
  phase (`'world'|'player'|'power'|'fluids'|'machines'|'inserters'|'belts'|'combat'|'pollution'|'research'`),
  wrapped like the others (`runTickPhase`). Multiple phases after the same one run in registration order.
- `F.game.onRebuild(fn)` — called at the end of `rebuildAll()` (after newGame and after load).
- `F.game.onNewGame(fn)` — called after the new state is built, before rebuild (use to create
  `F.state.<yourkey>`). Also call your own defaults in `onRebuild` for old saves (`if (!F.state.trains) ...`).
- Top-level state keys owned by features: `F.state.trains`, `F.state.robots`, `F.state.rocket`.
  They must be JSON-plain; runtime caches go under keys starting with `_`.
- Save version stays 1 (additive fields only).

**Registering from a file that loads BEFORE `80-game.js`** (i.e. any `src/NN-*.js` with `NN < 80`,
which is every Phase B feature file: `37-oil.js`, `38-trains.js`, `39-robots.js`, `45-rocket.js`):
`F.game.addTickPhase`/`onRebuild`/`onNewGame` do not exist yet at your file's load time (`80-game.js`
hasn't run). Do NOT call them directly at load time. Instead push straight onto the same queue arrays
`80-game.js` itself adopts once it loads (it merges onto whatever `F.game` already has, it never
overwrites it) — creating `F.game` and the arrays yourself if they are not there yet:
```js
// at the top level of your IIFE, e.g. 37-oil.js — runs before 80-game.js exists
F.game = F.game || {};
(F.game._tickPhases = F.game._tickPhases || []).push({ name: 'oil', after: 'fluids', fn: oilTick });
(F.game._onNewGame  = F.game._onNewGame  || []).push(function () { /* nothing to init for oil today */ });
(F.game._onRebuild  = F.game._onRebuild  || []).push(function () { rebuildOilRuntimeCaches(); });
```
Each queued tick-phase entry is `{ name, after, fn }` (same three positional args as
`addTickPhase(name, after, fn)`); `onNewGame`/`onRebuild` entries are just the bare `fn`. Once
`80-game.js` loads it runs every queued phase/hook exactly as if you had called
`F.game.addTickPhase(...)` etc. directly — the queue pattern above IS the real, permanent
registration, not a temporary shim; nothing needs to be re-registered later. A file that happens to
load AFTER `80-game.js` (none currently do, but keep this in mind) may call
`F.game.addTickPhase(name, after, fn)` / `F.game.onRebuild(fn)` / `F.game.onNewGame(fn)` directly —
they do the exact same array push under the hood.

### 6.2 Fluids (`33-power.js`)
- `F.fluids.registerEntity(behaviour, { boxes(e) -> [[boxKey, box], ...], ports(e, def) -> [{x, y, dir, kind, boxKey}] })`
  Registered behaviours take part in segment building exactly like the boiler (`portsOf` and the box
  collection consult the registry for unknown behaviours). `kind` is `'any'` or a fluid id; a port with a
  fluid-id kind only connects to ports of kind `'any'` or the same id. `x,y` = world tile inside the
  entity, `dir` = outward direction.
- Box shape stays `{ fluid: null|id, amount, cap }`. A box with `fluid: null` adopts the first fluid
  pushed into it. `F.fluids.push/pull(box, fluid, amount)` work on any box (already true).
- Segments may carry any fluid id; the mixing guard (`canConnect`) must generalise from water/steam
  to any two different fluids.
- `F.fluids.fluidOf(e)` → fluid id of a pipe/tank box or null (for the renderer's pipe tint), and
  `F.fluids.segmentInfo(e)` keeps working for new entities (first box).

### 6.3 Machines/entities (`32-machines.js`, `31-inserters.js`, `20-entities.js`)
- Labs: `e.packs = F.inv.create(def.lab.slots || 2)`; on wake, grow older saves' 2-slot inventory to
  the def size. Lab data gets `slots: 5` (data file sets `F.data.entities.lab.lab.slots = 5`).
- Assemblers only accept recipes whose category is in `def.assembler.categories`
  (default `['crafting','advanced']`); `F.machines.recipesFor(e) -> [recipeIds]` returns the unlocked
  recipes valid for that machine (used by recipe pickers, also for the new chemistry/refinery machines
  via `def.crafter.categories`, see §7.1).
- `F.inserters.addResolver(fn(tx, ty) -> obj|null)` — consulted when the pickup/drop tile has no grid
  entity. `obj` is duck-typed like an entity: `{ type, ... }` where `F.data.entities[type]`… is NOT
  required; instead `obj._ops = { accepts(item)->count, insert(item,count)->n, take(filterFn)->item|null }`.
  Used by train wagons while stopped.
- `F.entities.canAcceptItem/insertItem/takeItem` fall back to `obj._ops` when present.

### 6.4 API / placement (`50-api.js`)
- `F.api.addPlaceRule(behaviour, fn(def, tx, ty, dir) -> null | reasonString)` — extra validation for a
  behaviour (e.g. pumpjack must be centred on an oil well → `'no_resource'`, train stop must touch a
  rail → `'no_rail'`). Reason strings get i18n `reason.<reason>` if the UI shows them.
- `F.api.registerVirtual(itemId, { canPlace(tx, ty, dir) -> {ok, reason}, place(tx, ty, dir) -> obj|null })`
  and `F.api.placeVirtual(itemId, tx, ty, dir, opts={fromInventory})` — for vehicles. Removes one item
  from the inventory when `fromInventory` and placement succeeds.
- `F.api.addPicker(fn(wx, wy) -> null | { kind, label, open?(), mine?() -> bool, mineTime? })` — lets
  input resolve non-grid objects under the mouse (world float coords): left-click with an empty cursor
  calls `open()`, right-click-hold mines with `mineTime` (s) then calls `mine()` (which returns items to
  the player itself). Pickers are consulted BEFORE grid entities.
- `F.world.RES.CRUDE_OIL = 5`, `RES_ITEM[5] = 'crude-oil'` (there is NO crude-oil item; the resource id
  names the fluid), `RES_COLOR[5] = '#1A1614'`. World gen places sparse wells: in chunks beyond 60 tiles
  from spawn, clusters of 3–8 single-tile wells (spaced ≥3 tiles apart) with probability ~0.18 per chunk,
  plus one guaranteed cluster 70–110 tiles from spawn. `amount` = yield in percent (range 60..400,
  richer with distance). Player cannot hand-mine wells (mining returns nothing / skip in
  `computeMineTarget` when resource item is 'crude-oil'). Ore renderer draws wells via
  `F.sprites.ore(5, stage)` — the art for resource 5 is provided by the oil art pack through
  `F.sprites.defineOre(5, painterFn)`.

### 6.5 Rendering (`61-render.js`, `60-sprites.js`)
- `F.render.addLayer(z, fn(ctx, rect, cam))` — z: `'floor'` (after belts, before entities),
  `'objects'` (after entities & inserter arms, before player), `'air'` (after player, before previews),
  `'overlay'` (after status icons, before night). `rect` = visible tile rect `{x0,y0,x1,y1}`,
  `cam` = `F.camera` (use `cam.toScreen`, `cam.zoom`, tile px = `F.C.TILE * cam.zoom`).
- Entities whose def has `layer: 'floor'` (rails) are drawn in a pass before other entities
  (still via `F.sprites.entity`).
- `F.render.entityOpts(behaviour, fn(e, def, tick) -> { frame, opts })` — per-behaviour sprite
  frame/opts for new machines (working animation). Default: frame 0, opts {}.
- `F.render.minimapColor(behaviourOrLayer, color)`.
- `F.render.hidePlayerWhen(fn() -> bool)` (player sprite hidden while riding a train).
- `F.render.altOverlay(fn(ctx, e, def, sx, sy, tilePx))` — per-entity alt-mode extra drawing
  (e.g. recipe icon on chemical plant) for behaviours not handled already.
- Pipes and storage tanks: the pipe painter receives `opts.fluid` (fluid id or null) and may tint a
  small window stripe by fluid colour; renderer passes `F.fluids.fluidOf(e)`.
- `F.sprites.defineIcon(shape, fn(ctx, S, def))` — icon painters for new `icon.shape` ids
  (S = icon size px; draw centred; item colours in `def.icon.color/color2`).
- `F.sprites.defineOre(resIndex, fn(ctx, S, stage, variant))` — resource tile art.
- `F.sprites.fluidIcon(fluidId, size) -> canvas` and `F.sprites.fluidIconURL(fluidId)` — a droplet /
  circle in the fluid colours (generic; used by UI tooltips and recipe pickers).
- New free-moving sprite APIs (implemented by art packs, used by features):
  `F.sprites.vehicle(type, frame) -> canvas` — `type` 'locomotive'|'cargo-wagon', drawn facing NORTH,
  size 2 × 3 tiles at 64 px/tile (128 × 192), shadow NOT included (feature draws a soft shadow);
  `frame` 0..7 (wheel/smoke animation); locomotive `opts` none.
  `F.sprites.robot(type, frame) -> canvas` — 'logistic-robot', 48 × 48 px (0.75 tile) top-down, facing
  north, 8 frames (blinking light / hover); `F.sprites.robotShadow() -> canvas`.
  `F.sprites.rocket(frame) -> canvas` — rocket seen top-down/at 3/4, 2 × 6 tiles (128 × 384), flame
  included for frames 1..7 (frame 0 = no flame); `F.sprites.rocketSiloDoors(open01) -> canvas` (9×9 tiles,
  576×576, the door/hatch layer drawn over the silo when `open01 > 0`).
  All must return a dummy `{width, height}` object in HEADLESS.

**Implementation notes (A-view, added after implementing §6.5 — read this before calling
`F.render.addLayer`/`entityOpts`/`minimapColor`/`hidePlayerWhen`/`altOverlay` from a feature file):**
Load order is `05-data-expansion, 06-i18n-expansion, 10-world, ..., 37-oil, 38-trains, 39-robots,
40-player, 45-rocket, 50-api, 60-sprites, 61-render, 62..68-sprites-*, 70-ui, ...` — every feature
file (`37-oil.js`/`38-trains.js`/`39-robots.js`/`45-rocket.js`) runs **before** `61-render.js`, so
`F.render` does not exist yet at feature-file load time and `F.render.addLayer(...)` etc. called
directly from one of those files at load time will throw. `F.sprites` (art pack registries
`definePainter`/`defineOre`/`defineIcon`) is NOT affected — art packs (`65..68-sprites-*.js`) load
*after* `60-sprites.js`, so calling those directly is fine (see e.g. `67-sprites-robots.js`'s guard).
For the `F.render.*` registries specifically, use this exact snippet at the top of your feature file
(safe to call at load time regardless of order — it's what `F.render`'s own wrapper functions read
from once `61-render.js` has loaded too, so both paths land in the same place):
```js
F._renderHooks = F._renderHooks || {
  layers: { floor: [], objects: [], air: [], overlay: [] },
  entityOpts: {},     // behaviour -> fn(e, def, tick) -> {frame, opts}
  minimapColors: {},  // behaviour|layer -> color
  hidePlayerFns: [],  // fn() -> bool
  altOverlayFns: [],  // fn(ctx, e, def, sx, sy, tilePx)
};
F._renderHooks.layers.objects.push(function (ctx, rect, cam) { /* draw trains, etc. */ });
F._renderHooks.entityOpts['train-stop'] = function (e, def, tick) { return { frame: 0, opts: {} }; };
F._renderHooks.minimapColors['rail'] = '#8A8F94';
F._renderHooks.hidePlayerFns.push(function () { return !!(F.state.player && F.state.player.ridingTrain); });
F._renderHooks.altOverlayFns.push(function (ctx, e, def, sx, sy, tilePx) { /* ... */ });
```
Once `61-render.js` has loaded you may also call the `F.render.*` wrapper functions directly (both
write to the same `F._renderHooks` object) — e.g. from `62..68-sprites-*.js` or any code that only
runs after `99-main.js` boots. `entityOpts`/`altOverlay` fall back gracefully (default frame 0,
opts `{}`; alt overlay is simply not called) if you never register anything, so a feature file that
hasn't been updated to use the snippet yet just gets no extra rendering rather than a crash — but it
also won't get its custom layer/entityOpts/minimapColor/hidePlayerWhen/altOverlay hooks until it is.
`opts.fluid` (pipe/pipe-to-ground/storage-tank) is included in the sprite cache key, so different
fluids get their own cached canvas (no stale-colour bleed between e.g. water and crude-oil pipes).
`F.sprites.defineOre`'s painter receives the same 1.5-tile canvas size `S` every other ore uses;
single-tile resources (crude-oil well, res 5) should draw centred and NOT overhang past the middle
tile (unlike the built-in overlapping ore-chunk art) — an unregistered/unknown `res` id renders a
plain dark blob rather than nothing.

### 6.6 UI and input (`70-ui.js`, `71-ui-windows.js`, `75-input.js`)
- `F.ui.registerEntityGUI(behaviour, fn(root, e, def, h))` — `h` = helpers exported from the
  entity window: `{ header(root,e,def), slotGrid(inv, opts), labeled(label, el), bar(value01, color, text),
  fluidBar(box, label), recipePicker(e, recipeIds, currentId, onPick), button(text, onClick), row(...els),
  el(tag, cls, text), refresh() }`. Custom GUIs re-render on the entity window's normal refresh cycle.
  The existing assembler GUI switches to `F.machines.recipesFor(e)` for its picker; recipe tooltips
  show fluid ingredients/results with `F.sprites.fluidIconURL` + `F.t('fluid.<id>')`.
- Crafting tabs derive from `F.data.order.recipesByTab` keys in a fixed preferred order
  (`logistics, production, intermediate, combat`, then any new keys); only `hand` recipes appear.
- `F.ui.addHelpTab(id)` — appends a tab to the help window whose body is `F.t('help.' + id)`.
- Tech window: tier labels generalise — tier 3 "Blue tier", tier 4 "Endgame tier"; pack icons come
  from cost.packs (already data-driven). Must still be readable with ~45 techs (scroll).
- `F.input.addKey(key, fn(ev) -> bool handled)` — lowercase key names like the existing switch
  (`'enter'`, `'g'`, `'l'`...). Consulted before the built-in switch; return true to stop.
- Virtual placing: when the cursor holds an item that has a virtual placer (`F.api.registerVirtual`),
  left click calls `F.api.placeVirtual(id, tx, ty, dir, {fromInventory: true})`; preview uses
  `canPlace` (drawn as a green/red tile outline under the cursor, footprint 1×1 plus the placer may
  expose `previewDraw(ctx, tx, ty, dir, ok)` for a nicer ghost).
- Pickers (`F.api.addPicker`) are consulted for left-click open and right-click mining before grid
  entities; mining progress ring works for them too.
- Drag placement: `F.input.addDragKind(behaviour, 'line')` — rails drag like belts (straight lines,
  auto L-shape like belts/pipes); `'line'` means place along the drag path without rotation logic.

**Early registration** (implemented in `70-ui.js`/`75-input.js`, load order 70/75 — AFTER the feature
files 37/38/39/45 that need to call the four APIs above at their own load time). `F.ui`/`F.input` do not
exist yet when 37/38/39/45 run, so register directly onto the plain registry object/array instead
(created with `X = X || {}`/`X || []` so whichever file runs first wins the creation and nobody clobbers
an earlier registration); `F.ui.registerEntityGUI`/`addHelpTab`/`F.input.addKey`/`addDragKind` are sugar
over the exact same registries for anything that registers after 70/75 have run (harmless to call from
either side, or both). Use this exact shape:
```js
// Entity GUI (F.ui.registerEntityGUI) — takes precedence over the built-in ENTITY_RENDERERS.
(F._entityGUIs = F._entityGUIs || {})['my-behaviour'] = function (root, e, def, h) { /* ... */ };

// Help tab (F.ui.addHelpTab) — body is F.t('help.' + id); also register F.t('ui.tab.' + id) for its label.
(F._helpTabs = F._helpTabs || []).push('my-tab');

// Hotkey (F.input.addKey) — consulted before the built-in switch; return true from fn to stop there.
F._inputKeys = F._inputKeys || {};
(F._inputKeys['g'] = F._inputKeys['g'] || []).push(function (ev) { /* ... */ return true; });

// Drag-placement kind (F.input.addDragKind) — 'line' = place along the drag path, no rotation logic.
(F._dragKinds = F._dragKinds || {})['my-behaviour'] = 'line';
```

## 7. Feature specs (Phase B)

### 7.1 Oil (`src/37-oil.js`, tests `test/scenarios-oil.js`)
Generic crafter behaviour **'crafter'** used by `oil-refinery` and `chemical-plant`:
entity fields `{ recipe, progress, input: inv(4), output: inv(2), fin: [box, box] (fluid inputs),
fout: [box, box, box] (fluid outputs), workingTicks }`; `def.crafter = { categories, speed, fluidIn: n,
fluidOut: n }`. Fluid input box i is dedicated to the recipe's i-th fluid ingredient (fluid set on
setRecipe), output box j to the j-th fluid result. Crafts when items + fluids are present and outputs
have room (fluid output box cap 100 × results; stall when full). Power via `F.power.request`.
Ports (dir 0 = north, local coords, rotated with dir):
- oil-refinery 5×5: inputs on the south edge at x=1 (fin[0]) and x=3 (fin[1]); outputs on the north edge
  at x=0 (fout[0]), x=2 (fout[1]), x=4 (fout[2]). Recipe fluid order = table order in §4 (e.g. advanced:
  in crude, water; out heavy, light, gas).
- chemical-plant 3×3: inputs south edge x=0 (fin[0]) and x=2 (fin[1]); outputs north edge x=0 (fout[0])
  and x=2 (fout[1]).
- pumpjack 3×3 behaviour 'pumpjack': centre tile must be a crude-oil well (place rule); output port at
  north edge centre (x=1). Produces `yield% / 100 * 10` crude per second (i.e. per tick /60) while
  powered (90 kW) and output has room; yield decays by 0.0005 % per unit extracted but never below 20%.
  Field `fb` (cap 1000).
- storage-tank 3×3 behaviour 'storage-tank': one box cap 25000, ports at the centre of all four edges.
Entity defs: pumpjack {size [3,3], rotatable, electric 90 kW, pollution 10}, oil-refinery {size [5,5],
rotatable, electric 420 kW, pollution 6, crafter {categories:['oil-processing'], speed 1, fluidIn 2,
fluidOut 3}}, chemical-plant {size [3,3], rotatable, electric 210 kW, pollution 4, crafter
{categories:['chemistry'], speed 1, fluidIn 2, fluidOut 2}}, storage-tank {size [3,3], rotatable}.
Status strings: 'working','no_power','no_recipe','no_ingredients','output_full','no_oil'.
GUIs: recipe picker, fluid bars (in/out), item slots, status, progress. Alt-mode: recipe icon.
Tick phase after 'fluids'. Render: `entityOpts` working animation (pumpjack frame advances only while
working; refinery/chem plant working flag).

### 7.2 Trains (`src/38-trains.js`, tests `test/scenarios-trains.js`)
- `rail` entity 1×1, behaviour 'rail', layer 'floor', collides false, not rotatable. Connectivity = the
  4-neighbour rails (mask bit0 N, 1 E, 2 S, 3 W). A tile with exactly two opposite bits is straight; two
  adjacent bits a curve (quarter arc within the tile); 3–4 bits a junction. Sprite opts `{mask}`.
- `train-stop` 1×1 behaviour 'train-stop', must be orthogonally adjacent to a rail (place rule 'no_rail');
  fields `{ name }` (default "Stop N"). Its "station rail" is the adjacent rail tile (first found N,E,S,W).
- Trains live in `F.state.trains = [{ id, cars: [{ kind:'locomotive'|'cargo-wagon', inv? (wagon: 40 slots),
  fuel? (loco: inv 3), fuelJ }], path: [ "tx,ty", ... ] (rail tiles occupied, head first), headPos (float
  distance along), speed (tiles/tick), manual, schedule: [{ stop, wait: 'time'|'full'|'empty'|'inactivity',
  time }], cur (schedule index), state: 'moving'|'waiting'|'no_path'|'stopped'|'no_fuel', waitTicks }]`.
- Car spacing 3 tiles (car length 2.6 + gap). Max speed 0.2 tiles/tick (12 tiles/s) with acceleration
  0.002/tick and braking 0.004/tick; locomotive burns fuel 600 kW while accelerating/cruising.
  Trains move along the rail graph; pathing = BFS/Dijkstra over rail tiles without reversing (no U-turns;
  junction choice by path). Trains stop when the head reaches the station rail tile of the target stop.
- Placement: locomotive on a rail tile creates a new train facing `dir` (R rotates); a wagon placed on a
  rail tile directly behind an existing train's last car (within 3.5 tiles along the rail) couples to it,
  else creates a wagon-only train (cannot move). Picking up (right-click mine, 0.5 s) removes the car
  and returns its item + contents.
- Collision: a train stops (waits) if the next tile ahead is occupied by another train.
- Wagons while the train is stopped at a station expose inserter access via `F.inserters.addResolver`
  on every tile they cover.
- Player: Enter (and G) boards the nearest locomotive within 3 tiles / leaves (player placed beside
  the train). While riding, W/S accelerate/brake a manual train; A/D choose the branch at the next
  junction (left/right); player position follows the locomotive; player hidden.
- GUI (click a car): locomotive → fuel slots, schedule editor (list of stops with wait condition,
  add stop from list of existing train-stop names, remove, move up/down), Auto/Manual toggle, status;
  wagon → 40-slot inventory. Train stop GUI: rename (text input) + list of trains heading there.
- Draw: `F.render.addLayer('objects', ...)` — each car rotated along the rail tangent at its centre,
  soft shadow, locomotive smoke puffs while moving. Minimap: rails grey, trains orange dots.
- Tick phase after 'belts'.

### 7.3 Logistic robots (`src/39-robots.js`, tests `test/scenarios-robots.js`)
- `roboport` 4×4 behaviour 'roboport', electric: drain 50 kW, +100 kW per robot charging/active
  (just request 50 + 25 × busyRobots kW); fields `{ robots: inv(1) (logistic-robot items), repair: null }`.
  Logistic area: square radius 25 tiles around the centre (50×50). Construction area not used.
  Networks: roboports whose squares overlap belong to one network (union-find, rebuilt on dirty).
- Logistic chests (1×1, behaviour 'logistic-chest', `def.logistic = { mode }`, 48 slots, 'object' layer):
  passive-provider (robots take from it), storage (robots take from it and drop surplus into it),
  requester (`requests: [{ id, count }]` ×6 slots; robots bring items until the chest holds `count`).
  A chest belongs to the network whose area contains it.
- Robots: `F.state.robots = [{ id, net, x, y, task: { kind:'deliver', item, count, from, to, stage }
  , home (roboport id) }]`. Speed 0.05 tiles/tick, carry 1 item stack of up to 1 (upgrade: none) — use
  capacity 4 items for gameplay. Dispatch every 30 ticks: for each requester with a shortfall, reserve
  items in a provider/storage chest, take an idle robot from the nearest roboport of that network
  (robot item is removed from roboport inventory while flying, returned when docking). Flight path
  roboport → provider → requester → nearest roboport. Unpowered network: robots fly at 20 % speed.
- Draw: `F.render.addLayer('air', ...)` robots with shadow offset (hover); alt-mode shows logistic area
  outline of hovered roboport (orange dashed square). GUI: roboport (robot slot, network stats: robots
  total/idle/busy, chests count); requester (6 request slots: pick item via item picker from all items,
  set count via number input) + 48 slots; provider/storage chests reuse chest-like 48-slot GUI.
- Tick phase after 'inserters'.

### 7.4 Rocket silo (`src/45-rocket.js`, tests `test/scenarios-rocket.js`)
- `rocket-silo` 9×9, behaviour 'rocket-silo', electric 1000 kW (drain 50), not rotatable.
  Fields `{ input: inv(3) (LDS, rocket fuel, RCU), parts: 0, partsNeeded: 20, progress, satellite: inv(1),
  output: inv(1) (space-science-pack, stack 2000 → use ignoreStack), stage: 'building'|'ready'|
  'launching'|'cooldown', launchT, autoLaunch: false }`.
  Crafts rocket-part (§4) at speed 1 while powered; when parts == partsNeeded → 'ready' (rocket raised,
  doors open animation 2 s). Launch when satellite present and (autoLaunch or Launch button) → 'launching'
  for 20 s (rocket rises, flame, smoke, screen-shake optional), then 1000 space-science-pack into output,
  parts = 0, stage 'cooldown' 5 s → 'building'. Launch without satellite allowed via button with a
  confirmation ("The rocket will be lost") → no reward.
- `F.state.rocket = { launches: 0, firstLaunchTick: null }`. First launch opens a 'victory' window
  (`F.ui.registerWindow('victory', ...)`) with stats (time played, launches, items produced) and
  "Continue playing" button.
- GUI: input slots, parts progress bar (x / 20), craft progress, satellite slot, output slot, Launch
  button, auto-launch checkbox, status.
- Draw: silo body is a painter (art pack); rocket via `F.render.addLayer('objects')` using
  `F.sprites.rocket(frame)` and `rocketSiloDoors(open01)`; during launch the rocket y-offset rises
  with easing and scales up slightly, flame + smoke puffs.
- Tick phase after 'machines'.

## 8. Art (Phase B art packs) — same contract as BUILDING-ART.md
- `src/65-sprites-oil.js`: painters for pumpjack (animated horse-head beam; 16 frames loop; idle =
  frame 0), oil-refinery (5×5 towers, tanks, pipes; working = flare flame + lights), chemical-plant
  (3×3 glass dome / rotating mixer; working = bubbling + lights), storage-tank (3×3 round tank on a
  base, pipe stubs at the four edge centres, fluid level window tinted by `opts.fluid`), crude-oil
  well resource art (`F.sprites.defineOre(5, ...)`: dark oily puddle with a rusty well-head ring),
  pipe fluid tint (extend via `definePainter('pipe', ...)` wrapping the existing pipe painter? NO —
  pipe painter lives in 64-sprites-logistics.js; instead the oil pack exposes
  `F.sprites.fluidTint(ctx, W, H, fluid)` helper and the logistics pipe painter is left alone.)
  Also icons for: plastic, powder, fuel-block, fuel-cell, and `F.sprites.fluidIcon`.
- `src/66-sprites-trains.js`: rail painter (`opts.mask`; wooden sleepers + two steel rails, curves as
  smooth quarter arcs, junctions), train-stop painter (post with a lit sign/lamp, 1×1),
  `F.sprites.vehicle('locomotive'|'cargo-wagon', frame)` (Factorio-like: red-brown loco with cab, grille,
  headlights; grey open-top wagon with ribs), icons for locomotive, wagon.
- `src/67-sprites-robots.js`: roboport painter (4×4: pad with charging pads at corners, antenna, lights),
  logistic chest painters (steel chest look with coloured band: red provider, yellow storage,
  blue requester), `F.sprites.robot('logistic-robot', frame)`, `robotShadow()`, icons: robot,
  robot-frame, battery-cell, engine.
- `src/68-sprites-rocket.js`: rocket-silo painter (9×9: concrete pad, big circular pit with hatch doors
  closed, gantry arms, hazard stripes, lights; working = blinking lights), `F.sprites.rocket(frame)`,
  `F.sprites.rocketSiloDoors(open01)`, icons: lds, satellite.
All sprites must look like the existing art (Factorio-like, top-left light, muted industrial palette).

## 9. File ownership

| Agent | Owns (may edit) |
|---|---|
| A-sim (hooks) | `80-game.js`, `33-power.js`, `32-machines.js`, `31-inserters.js`, `20-entities.js`, `50-api.js`, `10-world.js`, `40-player.js` |
| A-view (hooks) | `60-sprites.js`, `61-render.js` |
| A-ui (hooks) | `70-ui.js`, `71-ui-windows.js`, `75-input.js`, `style.css` |
| D-data | NEW `src/05-data-expansion.js` (items, fluids, recipes, entity defs for all new entities, techs, lab slots), NEW `src/06-i18n-expansion.js` (all names/descriptions/help text/fluid names/status/reason strings for the expansion, via `F.i18n.add('en', …)`) |
| B-oil | NEW `src/37-oil.js`, `test/scenarios-oil.js` |
| B-trains | NEW `src/38-trains.js`, `test/scenarios-trains.js` |
| B-robots | NEW `src/39-robots.js`, `test/scenarios-robots.js` |
| B-rocket | NEW `src/45-rocket.js`, `test/scenarios-rocket.js` |
| Art-oil / Art-trains / Art-robots / Art-rocket | NEW `src/65..68-sprites-*.js` |

Entity defs for ALL new entities live in `05-data-expansion.js` (so everything agrees on sizes and
fields); feature modules add behaviours, not data. Feature modules may add extra i18n keys they need
(UI labels) with their own `F.i18n.add('en', …)` in their own file using the prefix `ui.<feature>.*`.
