# Factio — module architecture and API contracts

Read `ENGINEERING-CONSTRAINTS.md` first (it wins on any conflict). Data values (stats, recipes, techs, strings) come from `GDD.md`.

**Precedence rule:** `GDD.md` is authoritative for *game values and behaviour* (numbers, recipes, tech costs, rules, UI content). `ARCHITECTURE.md` is authoritative for *code structure, naming, state shape and APIs* — where the GDD sketches field names or code layout (e.g. `CONST`, `entityGrid`, `oreAmount`, a `Map` of chunks) follow this document instead. GDD §14 ("Module breakdown") and §8.3 (tech schema) are superseded by this document — same ideas, different file names and API names; use the ones here. Two deliberate additions to the GDD's entity list: **`solar-panel`** (3×3, 60 kW peak, day/night factor, tech `solar-energy`) and **`accumulator`** (2×2, 5 MJ, 300 kW, tech `electric-energy-accumulators`) ARE in scope (P1) because the test-suite uses solar power as a simple power source; take their stats and recipes from `research/entities-and-machines.md`, `research/items-and-recipes.md` and tech costs from `research/technology-tree.md`. Note that solar output at tick 0 is 100 % (day). This document defines **code structure, state shape and the exact `F.*` API every module exposes**, so that modules written in parallel integrate without edits. If you need something from another module that is not listed here, implement a local fallback inside your own module and mention it in your report — do not invent new cross-module APIs.

## 1. Files (load order = filename order)

| File | Namespace(s) it defines | Responsibility |
|---|---|---|
| `00-core.js` | `F`, `F.C` (constants), `F.rng`, `F.util`, `F.events`, `F.log` | namespace, constants, seeded RNG, helpers, event bus |
| `01-data.js` | `F.data` | pure data: items, recipes, entity definitions, technologies, categories (from GDD tables) |
| `02-i18n.js` | `F.i18n`, `F.t` | language mechanism + names/descriptions of all data (sl + en) + help text ("Navodila") |
| `10-world.js` | `F.world` | chunks, map generation, tiles, resources, trees/rocks, water, tile→entity map, placement validation |
| `20-entities.js` | `F.entities`, `F.behaviours`, `F.inv`, `F.ground` | entity lifecycle, inventories, ground items, damage/health |
| `30-belts.js` | `F.belts` | transport belts, underground belts, splitters (lane model) |
| `31-inserters.js` | `F.inserters` | burner/normal/long/fast/filter inserters |
| `32-machines.js` | `F.machines` | furnaces, assembling machines, mining drills, chests, labs (behaviours) |
| `33-power.js` | `F.power`, `F.fluids` | electric poles + networks, offshore pump, pipes, boiler, steam engine, solar, accumulator |
| `34-research.js` | `F.research` | technology state, research progress (labs call into it), unlock queries |
| `35-combat.js` | `F.combat`, `F.units` | damage model, gun turrets, walls, player weapons, enemy units (biters), spawners |
| `36-pollution.js` | `F.pollution` | per-chunk pollution, spreading, absorption, attack triggering, evolution factor |
| `40-player.js` | `F.player` | player state, movement, mining, hand crafting queue, quickbar, reach, death/respawn |
| `50-api.js` | `F.api` | high-level actions shared by UI, input and tests (place/remove/mine/craft/…) |
| `60-sprites.js` | `F.sprites` | procedural sprites & item icons cached on offscreen canvases |
| `61-render.js` | `F.render`, `F.camera` | canvas world rendering, terrain chunk cache, animations, overlays, minimap image |
| `70-ui.js` | `F.ui` | DOM UI framework: windows, slots, tooltips, HUD, quickbar, alerts, minimap, menu |
| `71-ui-windows.js` | `F.ui.windows.*` | inventory+crafting window, all entity GUIs, tech tree window, help ("Navodila") window, save/load window |
| `75-input.js` | `F.input` | keyboard/mouse handling, placement cursor, drag placing, hotkeys |
| `80-game.js` | `F.newGame`, `F.tick`, `F.save`, `F.load`, `F.boot`, `F.game` | orchestrates tick phases, serialisation, autosave, main loop |
| `99-main.js` | — | `if (!window.HEADLESS) F.boot();` |
| `style.css` | — | all CSS (dark industrial theme; see §12) |
| `template.html` | — | fixed; contains `<canvas id="game">` and `<div id="ui">` |

Every file: `(function () { 'use strict'; /* … */ })();`. Only `00-core.js` uses `var F = window.F = {};` outside an IIFE.

### Disabled features

Two features listed in the table above are currently switched off and excluded from `build/Factio.html` — see `src/disabled/README.md` for the full re-enable procedure:

- **Combat** (`F.FEATURES.combat = false`, `00-core.js`): `35-combat.js` (`F.combat`, `F.units`) and the combat-only rows of `01-data.js` (pistol/submachine-gun/ammo items, gun-turret/stone-wall/biter-spawner entities, military/turret/wall/damage/shooting-speed techs) live in `src/disabled/35-combat.js` and `src/disabled/03-data-combat.js` instead. Every other module's combat-adjacent code path (spawner placement in `10-world.js`, evolution/attacks in `36-pollution.js`, weapon/ammo/shooting/death in `40-player.js`, the HUD weapon/health/evolution widgets in `70-ui.js`/`71-ui-windows.js`, `75-input.js`'s Space/C handling, `F.load`'s tolerance for old saves) is guarded with `F.FEATURES.combat` (or a plain `F.combat` presence check) rather than removed, so pollution itself still spreads/absorbs/shows on the map.
- **i18n / Slovenian**: the build is English-only. `02-i18n.js` registers only `'en'`; every Slovenian string (its own SL table plus the small per-module `F.i18n.add('sl', …)` blocks) lives, unregistered, in `src/disabled/02-i18n-sl.js`. `F.t()`/`F.i18n` are otherwise unchanged.

## 2. Core conventions (`00-core.js`)

```js
F.C = {
  TILE: 32,                 // px per tile at zoom 1
  CHUNK: 32,                // tiles per chunk side
  TPS: 60,                  // ticks per second
  BELT_LEN: 256,            // lane positions per straight tile
  BELT_SPACING: 64,         // min distance between items on a lane
  BELT_CURVE_INNER: 106, BELT_CURVE_OUTER: 295,
  DIRS: [[0,-1],[1,0],[0,1],[-1,0]],   // 0=N 1=E 2=S 3=W (y grows downwards)
  REACH: 10,                // player build/mine reach in tiles
  SAVE_VERSION: 1,
};
F.rng = {
  seed(n),            // reseeds F.state.rng (called by newGame/load)
  next(),             // float in [0,1)
  int(n),             // integer in [0,n)
  range(a,b),         // float in [a,b)
  chance(p),          // boolean
  local(seedA, seedB, seedC) // returns an independent generator function () => float, seeded from ints (for chunk generation — order independent)
};
F.util = { key(tx,ty) -> "tx,ty", unkey(k) -> [tx,ty], clamp, lerp, dist(x1,y1,x2,y2), dirVec(d) -> [dx,dy], rotDir(d,n), oppDir(d), floorDiv(a,b), now() (perf time or Date), hash2(x,y,seed) -> uint32, hashStr(s) };
F.events = { on(name, fn), off(name, fn), emit(name, payload) };   // sync, used for UI refresh: 'entity:placed','entity:removed','inventory:changed','research:done','alert', 'entity:opened','entity:closed'
F.log = { info(...), warn(...), error(...) };  // console wrappers, silent when HEADLESS && !window.VERBOSE
```
RNG: mulberry32 over `F.state.rng.s` (uint32). `F.rng.local(a,b,c)` = mulberry32 seeded with `hash2(a,b,c)` returning a closure; used by world generation so chunks are order independent.

## 3. Data (`01-data.js`)

```js
F.data = {
  items: {                                    // by item id (snake_case English, e.g. 'iron-plate')
    'iron-plate': { id, stack: 100, fuel: 0 /* MJ */, category: 'intermediate'|'resource'|'logistics'|'production'|'combat'|'science', place: 'stone-furnace' /* entity id if placeable, else undefined */, ammo: {damage, magazineSize}? , icon: { shape, color, color2 } }
  },
  recipes: {                                  // by recipe id (== result item id for 1-result recipes)
    'iron-gear-wheel': { id, ingredients: [['iron-plate', 2]], results: [['iron-gear-wheel', 1]], time: 0.5, category: 'crafting'|'smelting'|'advanced', hand: true, tab: 'logistics'|'production'|'intermediate'|'combat', unlockedBy: null|'tech-id' }
  },
  entities: {                                 // by entity id
    'stone-furnace': { id, size: [2,2], rotatable: false, health: 200, behaviour: 'furnace', minable: 'stone-furnace' /* item returned */, category, pollution: 2 /* per minute at full activity */, energy: { type: 'burner'|'electric'|'none', usage: 90 /* kW */, drain: 0 }, speed: 1, layer: 'object'|'belt'|'pole'|'wall', collides: true, /* + behaviour specific fields */ }
  },
  techs: {                                    // by tech id
    automation: { id, prereq: [], cost: { packs: [['automation-science-pack',1]], count: 10, time: 10 }, unlocks: ['assembling-machine-1','long-handed-inserter'], effects: [ /* {type:'bonus', key:'miningBonus'|'inventoryBonus'|'bulletDamage'|'turretDamage'|'bulletSpeed'|'labSpeedBonus', value: 0.1} */ ], tier: 1|2 }
  },
  order: { items: [...ids in display order], recipesByTab: { logistics: [...], ... }, techs: [...] },
  startingRecipes: [...recipe ids available without research],
  startingInventory: [['iron-plate',8],['pistol',1],['firearm-magazine',10],['burner-mining-drill',1],['stone-furnace',1],['wood',1]],
  itemDef(id), recipeDef(id), entityDef(id), techDef(id)   // helpers that throw with a clear message on unknown id
};
```
Entity defs may carry `natural: true` (spawners): no item, not craftable, not placeable by the player. Every other entity id MUST have an item with `place` equal to the entity id.

Behaviour specific entity fields (used by modules): `belt: {tier, speed /* positions per tick: 8,16,24 */}`, `underground: {tier, speed, maxGap}`, `splitter`, `inserter: {rotationSpeed /* turns per tick */, reach: 1|2, burner: bool, filter: bool}`, `furnace: {speed}`, `assembler: {speed, ingredientSlots}`, `drill: {speed, area /* 2 or 5 */, output: [dx,dy] /* tile in front relative to top-left when dir=0 */}`, `chest: {slots}`, `lab: {speed}`, `pole: {reach, supply /* half-width */}`, `offshore_pump: {rate: 1200}`, `boiler: {fuelPower: 1800 /* kW */, steamRate: 60}`, `engine: {power: 900, steamRate: 30}`, `solar: {peak: 60}`, `accumulator: {capacity: 5000 /* kJ */, flow: 300}`, `turret: {range: 18, rate: 10 /* shots per s */, ammoLimit: 10}`, `wall`, `spawner: {…}`, `pipe: {capacity: 100}`.

Directions and sizes: `size` is given for `dir=0` (north). For `dir` 1 or 3 the footprint is `[h,w]`. `F.entities.footprint(def, dir) -> [w,h]`.

## 4. i18n (`02-i18n.js`)

```js
F.i18n = { lang: 'sl', add(lang, table), setLang(lang), has(key), langs: ['sl','en'] };
F.t(key, params?)   // returns table[lang][key] ?? table.en[key] ?? key ; params {n: 5} replaces {n}
```
Ids everywhere are kebab-case (`iron-plate`, `stone-furnace`, `small-biter`, `automation-science-pack`). Key conventions: `item.<id>`, `item.<id>.desc`, `ent.<id>`, `ent.<id>.desc`, `tech.<id>`, `tech.<id>.desc`, `cat.<name>`, `ui.*` (UI module), `help.*` (help text sections, Markdown-ish plain text with `\n`), `alert.*`, `tip.*`. `02-i18n.js` provides ALL `item.*`, `ent.*`, `tech.*`, `cat.*`, `help.*` strings in both languages; UI modules add their own `ui.*` keys. `F.i18n.setLang` emits `events 'lang:changed'`; UI re-renders open windows. Language persists in `localStorage['factio.lang']` (guarded).

## 5. World (`10-world.js`)

State: `F.state.world = { seed, chunks: { "cx,cy": Chunk } }`. Chunk:
```js
{ cx, cy,
  terrain: Uint8Array(1024),   // 0 deep water, 1 water, 2 grass1, 3 grass2, 4 grass3, 5 dirt1, 6 dirt2, 7 sand1, 8 sand2, 9 red desert (any ordering; expose F.world.TERRAIN enum; water = ids < 2)
  res: Uint8Array(1024),       // 0 none, 1 iron_ore, 2 copper_ore, 3 coal, 4 stone   (F.world.RES enum + F.world.RES_ITEM = [null,'iron-ore','copper-ore','coal','stone'])
  amount: Uint32Array(1024),   // ore left on tile
  feature: Uint8Array(1024),   // 0 none, 1 tree, 2 rock (big), 3 rock (huge) ; feature health in featHp
  featHp: Uint16Array(1024),
  pollution: 0,                // float, owned by F.pollution
  spawnerCount: 0,             // maintained by F.combat
}
```
Index `i = ly*32 + lx`. Tile helpers use world tile coords (integers; may be negative).

```js
F.world.newWorld(seed)                  // resets F.state.world, generates spawn area (radius 4 chunks), guarantees lake + 4 patches
F.world.ensureChunk(cx, cy) -> Chunk    // generates lazily (deterministic per chunk via F.rng.local(seed, cx, cy))
F.world.chunkAt(tx, ty) -> Chunk|null   // no generation
F.world.chunkOf(tx, ty) -> [cx, cy, i]  // floorDiv + local index
F.world.terrain(tx, ty) -> id           // generates if needed
F.world.isWater(tx, ty), isLand(tx, ty)
F.world.resource(tx, ty) -> {item, amount}|null
F.world.mineResource(tx, ty, n=1) -> item id|null   // decrements amount, clears at 0
F.world.feature(tx, ty) -> 0|1|2|3 ; F.world.removeFeature(tx,ty) ; F.world.damageFeature(tx,ty,dmg) -> true when destroyed
F.world.passable(tx, ty) -> bool        // land, no collides entity, no tree/rock (player and units)
F.world.buildable(tx, ty) -> bool       // land, no feature, no entity
F.world.entityAt(tx, ty) -> entity|null // via tile map (F.world._tileMap Map<key, entity>, maintained by F.entities)
F.world.setEntityTiles(entity, present) // called by F.entities on create/remove; marks all footprint tiles
F.world.forEachChunkInRect(tx0,ty0,tx1,ty1, fn(chunk))
F.world.findResourceNear(item, x, y, radius) -> {x,y,amount}|null
F.world.spawn -> {x, y}                 // spawn point (float tile coords), always land
F.world.chunkKey(cx,cy)
F.world.TERRAIN, F.world.RES, F.world.RES_ITEM, F.world.TERRAIN_COLOR (hex per id), F.world.RES_COLOR
```
Generation parameters live in GDD §2 (noise-based terrain with a guaranteed lake within 25 tiles of spawn and iron/copper/coal/stone patches within 40 tiles, richness by distance, trees cleared near spawn, forests with pollution absorption, no water at spawn tile). Use value-noise/simplex implemented locally (no libraries). Chunks generated only through `ensureChunk`; the renderer and player movement request `ensureChunk` for the neighbourhood (render: visible + 1; player: radius 3 chunks each 60 ticks — done in `F.world.tick()` which `80-game.js` calls).

## 6. Entities, inventories, ground items (`20-entities.js`)

Entity record (plain object, JSON-safe):
```js
{ id: 17, type: 'stone-furnace', x: 10, y: -3, dir: 0, health: 200, w: 2, h: 2, /* behaviour fields */ }
```
`x,y` = top-left tile of the footprint. Behaviour fields are created by `F.behaviours[def.behaviour].create(e)`. Any runtime caches (not saved) go under `e._` (an object recreated on load by `F.behaviours[b].wake?.(e)`); the serializer strips every key starting with `_`.

```js
F.entities.create(type, tx, ty, dir=0) -> entity           // NO validation (use F.api.place for that); registers tiles, calls behaviour.create, emits 'entity:placed'
F.entities.remove(entity, opts={dropItems:true}) -> void     // behaviour.onRemove, unregisters tiles, emits 'entity:removed'
F.entities.byId(id) -> entity|undefined                       // F._byId Map rebuilt on load
F.entities.all() -> Array (F.state.entities, dense array; iterate with index, do not mutate during iteration except via F.entities.remove which defers to end of tick)
F.entities.ofType(type) -> Array (cached per type, invalidated on create/remove)
F.entities.footprint(def, dir) -> [w,h]
F.entities.tiles(entity) -> Array<[tx,ty]>
F.entities.center(entity) -> [cx, cy] (float)
F.entities.front(entity, n=1) -> [tx,ty]   // tile n steps in front of the footprint centre column (used by drills/inserters); for 1x1 entity: x+dx*n, y+dy*n
F.entities.behind(entity, n=1) -> [tx,ty]
F.entities.damage(entity, amount, source) -> bool destroyed  // emits 'entity:damaged'; on 0 health -> remove (no drops) + alert
F.entities.canAcceptItem(entity, item) -> count acceptable (0 = no)  // dispatches to behaviour.accepts?.(e, item) ; used by inserters/drills/player
F.entities.insertItem(entity, item, count) -> inserted count        // behaviour.insert
F.entities.takeItem(entity, filterFn|null) -> item id|null          // behaviour.take (from output slots only)
F.entities.inventories(entity) -> [{name:'fuel'|'input'|'output'|'main'|'ammo', inv, filter?}]  // for GUIs and player transfers
F.behaviours[name] = { create(e), tick?(e), onRemove?(e), wake?(e), accepts?(e,item)->count, insert?(e,item,count)->n, take?(e,filter)->item|null, inventories?(e)->[...], status?(e)-> one of the GDD §6.2 status strings: 'working'|'no_power'|'low_power'|'not_connected'|'no_fuel'|'output_full'|'no_ingredients'|'no_recipe'|'no_minable_resources'|'no_ammo'|'no_research'|'missing_science_packs'|'waiting_for_source'|'waiting_for_space'|'no_steam'|'no_water'|'no_pair'|'idle' }
```
**Inventories** (`F.inv`): an inventory is an `Array` of length N with `null` or `{id, count}` (mutable objects, JSON-safe):
```js
F.inv.create(n) ; F.inv.add(inv, id, count) -> remaining ; F.inv.canAdd(inv, id, count) -> bool ; F.inv.remove(inv, id, count) -> removed ; F.inv.count(inv, id) ; F.inv.has(inv, id, count) ; F.inv.isEmpty(inv) ; F.inv.firstItem(inv, filter?) -> id|null ; F.inv.takeOne(inv, filter?) -> id|null ; F.inv.transfer(from, to, id?, count?) -> moved ; F.inv.stackSize(id) ; F.inv.setStack(inv, i, id, count)
```
Stack limits from `F.data.items[id].stack`. Machine input slots may exceed a stack when a recipe needs it (`F.inv.add(inv, id, count, {ignoreStack:true})`).

**Ground items** (`F.ground`): `F.state.ground = { "tx,ty": {id, count} }` (one item type per tile, count ≤ stack). `F.ground.drop(tx,ty,id,count) -> leftover`, `F.ground.at(tx,ty)`, `F.ground.take(tx,ty,count=all) -> {id,count}|null`, `F.ground.dropNear(x,y,id,count)` spills to nearest free tiles.

## 7. Belts (`30-belts.js`) — SIMPLIFIED SLOT MODEL (supersedes GDD §7.3 internals; the public API is unchanged)

Each belt-like tile has **2 lanes × 4 slots**. A slot holds an item id or `null`. Slot 0 is the entrance, slot 3 the exit. Items advance one slot per **step**; a tier steps every `stepTicks = round(64 / def.belt.speed)` ticks (yellow 8 → 8 ticks per slot = 32 ticks per tile = 1.875 tiles/s = 7.5 items/s per lane; fast 16 → 4 ticks). Positions reported to the outside world are `pos = slot*64 + 32 (+ animation offset)`, so the old 0..255 convention still holds (`pos 128` = slot 2 = the middle of the tile).

Entity fields: belt `{ lanes: [ [4 slots], [4 slots] ], curve: 0|1|-1 }` (1 = right/clockwise turn, −1 = left; derived during rebuild), underground `{ io: 'in'|'out', lanes, pairId, gap }`, splitter `{ lanes: [[left,right],[left,right]] /* half 0 = left half, half 1 = right half, each a lane pair */, toggle: [0,0] /* preferred output half per lane */, filter: null, inPrio: 0, outPrio: 0 }`. Splitter half tiles: dir 0 → half0 (x,y) half1 (x+1,y); dir 1 → (x,y),(x,y+1); dir 2 → (x+1,y),(x,y); dir 3 → (x,y+1),(x,y). For splitters the public `lane` index is `half*2 + lane` (0..3).

Rules:
- Topology (rebuilt lazily after `markDirty`): a node = one tile (splitters have two). `next` of a node is the node on the tile in front unless that node faces the opposite way. Same direction → **straight** hand-off (lane i → slot 0 of lane i; an underground exit refuses straight feeds from behind; splitters accept only straight feeds). Perpendicular → **side-load** into the target's near lane at slot 2, except when the target is a belt with no back feeder and exactly one side feeder: then the target is a **curve** and the hand-off is lane-preserving (lane i → lane i, slot 0). Underground entrance → its paired exit (slot 0, instant, no tunnel buffer).
- Update order: nodes are processed downstream-first (walk `next` chains, push in reverse; cycles cut arbitrarily). Within a lane, slots are processed 3 → 0, so a compressed line shifts as a block. Items at the end of a line stay in slot 3.
- Splitter: when an item moves from slot 1 to slot 2 of a half, it goes to slot 2 of the preferred half (`toggle[lane]`, then flipped) if free, else to the other half if free, else waits. Lanes are preserved.
- Undergrounds pair on placement: look behind (up to maxGap+1 tiles) for an unpaired entrance of the same tier and direction → become the exit; else look ahead for an unpaired exit → become the entrance; else an unpaired entrance. Removal un-pairs the partner.

API (identical names/semantics to the earlier contract):
```js
F.belts.tick() ; F.belts.markDirty(tx,ty) ; F.belts.rebuild() ; F.belts.isBeltLike(e)
F.belts.canInsert(e, lane, pos) -> bool          // slot = clamp(floor(pos/64),0,3) is free
F.belts.insert(e, lane, pos, item) -> bool
F.belts.insertFromSide(e, sideDir, item) -> bool // near lane, slot 2 (feeder behind/ahead → lane 1)
F.belts.take(e, filterFn|null, preferLane) -> item|null   // preferLane first, slots 3→0
F.belts.peek(e, filterFn, preferLane) -> [lane, slot]|null
F.belts.items(e) -> [[item, lane, pos]]           // pos animated between slots for smooth rendering
F.belts.laneWorldPos(e, lane, pos) -> [x, y]      // straight: along the tile; curves: quarter arc, inner radius 0.25 / outer 0.75
F.belts.count(e) ; F.belts.dropAll(e) ; F.belts.nearLane(e, sideDir) ; F.belts.lanePositionForInserter(e, insDir) -> {lane, pos:128}
F.belts.onRotate(e) ; F.belts.stepTicks(e)
Behaviours registered: 'belt', 'underground', 'splitter' (create/onRemove/wake/accepts/insert/take)
```

## 8. Inserters (`31-inserters.js`)

Entity fields: `{ hand: null|{id,count}, phase: 'pick'|'swing_out'|'drop'|'swing_back', angle: 0..1 /* 0 = at pickup, 1 = at drop */, fuel: inv(1) (burner only), fuelJ: 0, filter: [null x5], filterMode: 'whitelist', stack: 1 }`. Pickup tile = `behind(e, reach)`, drop tile = `front(e, reach)`.
Per tick: electric ones request `drain + (moving ? rotationPower : 0)` via `F.power.request(e, kW)` and scale motion by satisfaction; burner ones burn 50 kJ per half swing (`fuelJ` buffer, refill from `fuel` slot, self-refuel by grabbing fuel from the source when empty). Rotation: `angle += rotationSpeed * 2 * sat` per tick (one half turn = `0.5/rotationSpeed` ticks; 0.014 → 36 ticks per half swing for the yellow inserter).
State machine:
1. `pick`: find a source at the pickup tile: belt (`F.belts.take` with filter `item => targetAccepts(item)`), ground (`F.ground`), entity (`F.entities.takeItem(src, filter)`). Only take an item the current drop target would accept **now** (`targetAccepts`): belts → `canInsert` at drop lane/pos; entity → `F.entities.canAcceptItem(dst, item) > 0` considering the insertion limit (assembler/furnace: `max(2, min(100, 1 + ceil(1.166 / craftTime)))` crafts of that ingredient; fuel slots max 5 items; turret max 10 magazines; lab min 2 packs); ground → tile free; nothing there → drop on ground. Chests: until full. With `filter` set (filter inserters), only matching items.
2. `swing_out` until angle=1 → `drop`: belts `F.belts.insert(dst, lane, pos, item)` (far lane rule: `F.belts.lanePositionForInserter`); entities `F.entities.insertItem`; ground `F.ground.drop`. If refused, wait holding (retry every tick).
3. `swing_back` to angle=0 → `pick`.
`F.inserters.tick()` iterates `F.entities.ofType(...)` for all inserter types. `F.inserters.holding(e)` for renderer; `F.inserters.armPos(e) -> [x,y]` float tile coords of the hand.

## 9. Machines (`32-machines.js`)

Common: every powered machine calls `F.power.request(e, kW)` each tick it wants to work and multiplies progress by the returned satisfaction; burner machines keep `fuel` inv(1) and `fuelJ` (joules buffered), consuming `usage kW * 1000 / 60` J per active tick; `status()` reported for GUIs/alerts. Pollution: `F.pollution.emit(e, def.pollution / 3600 * activity)` per tick while working (activity = satisfaction).
- **furnace** `{ fuel: inv(1), input: inv(1), output: inv(1), recipe: null|id, progress: 0..1, fuelJ }` — recipe auto-selected from the input item via `F.data` smelting recipes (iron-ore→iron-plate, copper-ore→copper-plate, stone→stone-brick, iron-plate→steel-plate ×5→1). `accepts(e,item)`: fuel items → fuel slot (limit 5 when from inserter), smeltable items → input if slot empty or same item (limit 2× recipe amount); take from output only.
- **assembler** `{ recipe: null|id, input: inv(k), output: inv(1), progress }` — `F.machines.setRecipe(e, id|null)` (returns ingredients to player via `F.player.giveOrDrop`), craft when all ingredients present and output has room; time = recipe.time / speed.
- **drill** `{ fuel: inv(1)? (burner), fuelJ, progress, target: null, held: null|item }` — area 2×2 (burner: its own footprint) or 5×5 (electric: footprint + 1 ring); each cycle picks a random remaining resource tile in the area (`F.rng`), progress += speed/60 per tick × sat; on 1: `F.world.mineResource` → `held`; each tick try to output `held` to the tile in front (`F.entities.front(e)`: belt → `F.belts.insertFromSide(belt, oppDir(e.dir), item)`; entity → `insertItem`; empty ground → `F.ground.drop`; blocked → wait, status `output_full`). Burner drill output tile: the tile in front of its LEFT column (dir 0: `[x, y-1]`); electric drill: front of the centre column (`[x+1, y-1]`) — use `def.drill.output` vector rotated by `dir`. `no_resource` when area has none (also blocks placement in `F.api.place`).
- **chest** `{ inv: inv(n) }` — accepts anything until full; take from `inv`.
- **lab** `{ packs: inv(k) /* one slot per pack type */, progress }` — accepts science packs (limit via inserter rule); `F.research.labTick(e, speed*sat)` consumes packs when a unit completes.
- **turret** lives in `35-combat.js` but is registered as a behaviour there.
`F.machines.setRecipe(e, id)`, `F.machines.craftTime(e) -> seconds`, `F.machines.status(e)`, `F.machines.tick()` (ticks furnace/assembler/drill/lab/chest types).

## 10. Power and fluids (`33-power.js`)

**Fluids** (`F.fluids`): fluid boxes belong to entities: pipe `{ fb: {fluid:null|'water'|'steam', amount:0, cap:100} }`, offshore_pump `{ fb: {..., cap:100} }` (output at its back tile? no — output at the tile *behind* the pump; the pump faces the water: the 2 tiles in front must be water), boiler `{ fuel: inv(1), fuelJ, water: {fluid:'water',amount,cap:200}, steam: {fluid:'steam',amount,cap:200}, progress }`, engine `{ steam: {cap:200}, output: 0 /* kW last tick */ }`. Connection points per entity type/dir are defined in this module (boiler: water on both short ends, steam on the front centre; engine: both short ends; pipe: all 4 sides; offshore pump: back). A **segment** = union of connected fluid boxes carrying the same fluid (rebuilt lazily on `F.fluids.markDirty()` after any fluid entity placed/removed; different fluids never merge — placement of a pipe that would merge two different fluids is refused by `F.api.place` via `F.fluids.canConnect(tx,ty,dir)`). Per tick per segment: total amount is spread so every box holds the same fill percentage (2.0 model). Producers push (`F.fluids.push(box, fluid, amount) -> accepted`), consumers pull (`F.fluids.pull(box, fluid, amount) -> got`) against the segment total.
- offshore pump: pushes 1200/60 water per tick into its segment.
- boiler: needs fuel (burner 1800 kW): per active tick converts `min(1 water, room in steam segment)` → 1 steam (1:1 simplification, GDD notes it), consuming 30 kJ fuel; burns only when steam has room.
- steam engine: capacity 900 kW = 0.5 steam/tick; produces what the network asks (see below), consuming steam proportionally.

**Electric network** (`F.power`): poles `{ wires: [ids] }` connect automatically on placement to the nearest poles (≤5, within both reaches, no triangle rule needed); `F.power.rebuild()` computes networks (union-find over wires), and a tile→network map from supply areas (`supply` half-width around the pole centre). Consumer/generator entities get `e._net = id|0` resolved lazily via the coverage map (any footprint tile inside a supply square). Per tick:
```
phase 3 (F.power.tick): for each network: D = Σ requests registered during the previous tick; G = solar·daylight + Σ engines min(900 kW, steam available·30 kJ) + Σ accumulators min(300 kW, stored); delivered = min(D, G); sat = D>0 ? delivered/D : 1; draw solar first, then engines equally (consume steam), then accumulators; surplus of solar+engine capacity charges accumulators (≤300 kW each, ≤5 MJ); reset request accumulator.
F.power.request(e, kW) -> satisfaction (0..1) of e's network for THIS tick; registers kW into the network's request accumulator for the NEXT tick. Entities without a network get 0.
```
`F.power.netInfo(e) -> { id, demand /* kW requested last tick */, supply /* kW delivered */, capacity /* kW available */, satisfaction, producers: [{type,count,kW}], consumers: [{type,count,kW}] }` for GUIs; `F.power.hasNetwork(e)`; `F.power.isPowered(e)` (has a network with satisfaction > 0); `F.power.satisfaction(e) -> 0..1`; `F.power.markDirty()`; `F.power.tick()` (single phase 3 of the tick, see §18).
Fluid helpers required by GUIs and tests: `F.fluids.connections(e) -> [{ x, y, dir, kind: 'water'|'steam'|'any' }]` (world tile inside the entity that carries a port and the OUTWARD direction; two ports connect when they are on adjacent tiles facing each other; pipes have 4 'any' ports), `F.fluids.segmentInfo(e) -> { fluid, amount, capacity }|null`, `F.fluids.markDirty()`, `F.fluids.rebuild()`, `F.fluids.tick()` (offshore pumps push, boilers convert; called by 80-game in phase 3), `F.fluids.canConnect(type, tx, ty, dir) -> bool` (false when it would merge water and steam). Day/night: `F.power.daylight()` from `F.state.tick` (25200-tick cycle, 210 s day, 84 s dusk, 42 s night, 84 s dawn; solar only — no darkness rendering needed, optional dim overlay).
Entities without a network or with a 0 satisfaction network show status `no_power`.

## 11. Research (`34-research.js`)

`F.state.research = { current: null|techId, unitsDone: 0, unitProgress: 0..1, done: { techId: true }, queue: [] }`.
```js
F.research.available() -> [techIds]   // prereqs done, not done
F.research.start(techId) ; F.research.cancel() ; F.research.isDone(id) ; F.research.isRecipeUnlocked(recipeId) -> bool (starting recipes always)
F.research.labTick(lab, speed)        // if current tech and lab has one of each required pack: unitProgress += speed / cost.time / 60 ; on unit complete consume packs (F.inv.remove one of each), unitsDone++ ; when unitsDone == cost.count -> finish(): mark done, emit 'research:done', pop queue
F.research.progress() -> 0..1
F.research.bonus(key) -> number      // sum of applied bonus effects (0 when none); used by player (miningBonus, inventoryBonus), combat (bulletDamage, turretDamage, bulletSpeed), labs (labSpeedBonus)
F.research.tick()                    // phase 10: completes research when unitsDone >= count, applies effects, emits 'research:done', pops queue
F.research.queue(techId) ; F.research.unlockedRecipes() -> Set
```

## 12. Combat, units, spawners (`35-combat.js`)

Units (enemies) are NOT grid entities: `F.state.units = [ { id, type: 'small-biter'|'medium-biter'|'big-biter', x, y (float), health, target: {kind:'entity', id}|{kind:'player'}|null, state: 'idle'|'move'|'attack', cd: 0, groupId } ]`. Spawners are grid entities (behaviour `spawner`, 3×3, health 350, `{ units: [], cooldown }`) created by `F.world` generation outside the safe radius (GDD §7) through `F.combat.placeSpawner(tx,ty)`.
```js
F.combat.tick()                      // units move (straight-line steering with simple obstacle sliding; speed tiles/tick), attack targets in range (cooldown), spawners spawn up to a cap; turrets acquire nearest unit within range and fire if ammo; player auto-fire handled by F.player
F.combat.damageUnit(unit, dmg) ; F.combat.spawnAttack(chunk, pollutionCost) -> forms a group of N units from spawners in/near the chunk and targets the biggest polluter entity (called by F.pollution)
F.combat.unitsNear(x, y, r) -> [units] ; F.combat.evolution() -> 0..1 (from F.state.enemies.evolution updated by F.pollution + time + spawner kills)
F.combat.nearestUnit(x, y, r)
F.combat.spawnUnit(type, x, y) -> unit   // used by spawners and tests
F.combat.unitDef(type) -> { health, damage, speed, range, cooldown, resist }
Behaviours registered here: turret { ammo: inv(1), angle, cd }, wall, spawner
```
Damage numbers, resistances, speeds from GDD §7.

## 13. Pollution (`36-pollution.js`)

`F.pollution.emit(entity, amount)` adds to the entity's chunk; every 64 ticks `F.pollution.spread()` moves 2% to each of 4 neighbours (both directions, chunks with ≥15 only), absorbs per chunk (tiles: grass 0.0000035×1024 per tick… use GDD values; trees absorb more), and for chunks with spawners and pollution ≥ attack threshold calls `F.combat.spawnAttack`. `F.pollution.chunkValue(cx,cy)`, `F.pollution.tick()`, `F.pollution.total()`. Evolution factor updates here (time factor per tick, pollution factor per unit produced, spawner-destroyed factor via `F.events 'spawner:destroyed'`).

## 14. Player (`40-player.js`)

`F.state.player = { x, y (float, centre), dir, health: 250, maxHealth: 250, inv: inv(80), craftQueue: [ {recipe, count, progress} ], quickbar: Array(10) of item id|null, cursor: null|{id,count}, mining: null|{tx,ty,progress}, dead: false, respawnIn: 0, weapon: 'pistol'|'submachine-gun'|null, shootCd, regenCd }`.
```js
F.player.tick(input)   // input = { mx: -1|0|1, my: -1|0|1, mine: null|[tx,ty], shoot: bool } as set by F.input (F.input.state) or by tests; movement 8.9 tiles/s (0.148 tile/tick), 4-direction + diagonal normalised, blocked by F.world.passable (axis-separated sliding); mining: resource tile → 1 ore per (miningTime / 0.5) s = 2 s; tree → 4 wood after 0.55 s… (GDD); entity → picks it up after def.mineTime (default 0.5 s) returning the item(s) + contents to inventory; hand crafting queue: first item progresses at 1× speed, ingredients removed at enqueue time, intermediates auto-queued (F.player.canCraft/enqueue compute the full ingredient tree like Factorio); health regen after 10 s without damage; death → drop nothing, respawn after 10 s at spawn with full inventory kept (simplification, GDD).
F.player.give(id, count) -> leftover ; F.player.giveOrDrop(id,count) ; F.player.take(id, count) -> taken ; F.player.count(id)
F.player.canCraft(recipeId, n=1) -> {ok, missing: [[item, n]]} ; F.player.enqueue(recipeId, n) -> bool ; F.player.cancelCraft(index)
F.player.inReach(tx, ty) -> bool (distance from centre ≤ REACH)
F.player.respawn()
```

## 15. API (`50-api.js`) — used by input, UI and tests

```js
F.api.canPlace(type, tx, ty, dir) -> { ok, reason: 'collision'|'water'|'no_resource'|'no_water'|'fluid_mix'|'out_of_reach'|null }  // reach not checked unless opts.checkReach
F.api.place(type, tx, ty, dir, opts={fromInventory:false}) -> entity|null    // validates; if fromInventory removes 1 item (returns null if none); belts: marks dirty; fluid/power dirty
F.api.remove(tx, ty, opts={toInventory:true}) -> bool                       // mines an entity instantly (used by tests & right-click mining completion); contents + item to player inventory (or ground if full)
F.api.rotate(tx, ty) -> bool
F.api.give(id, count) ; F.api.inventoryCount(id) ; F.api.entityAt(tx,ty) ; F.api.teleport(x,y) ; F.api.findResource(item, radius=200) -> {x,y}|null ; F.api.setRecipe(entity, id) ; F.api.insertInto(entity, id, count) -> inserted ; F.api.craft(recipeId, n) -> bool ; F.api.research(techId) -> bool (starts) ; F.api.chunkPollution(cx,cy) ; F.api.stats() -> { entities, units, spawners, beltItems, tick, researchDone: n }
F.api.placeLine(type, tx0, ty0, tx1, ty1, dir)   // drag placing helper (belts/poles/walls) — stops when inventory empty
F.api.transferStack(fromInv, index, toEntityOrPlayer)  // shift-click transfer semantics used by UI
F.api.cheat = { unlockAll(), giveStarterBase() }  // dev helpers (used by tests; hidden behind a key combo in UI)
```

## 16. Sprites & rendering (`60-sprites.js`, `61-render.js`)

`F.sprites.entity(type, dir, frame=0) -> canvas` (cached; `frame` used by belts (16 frames), inserters (arm drawn separately), drills (animated), assemblers (working)). `F.sprites.item(id, size=32) -> canvas`; `F.sprites.itemURL(id) -> data URL` (cached, for CSS backgrounds in the DOM UI). `F.sprites.terrainTile(terrainId, variant) -> canvas`, `F.sprites.ore(res, stage) -> canvas`, `F.sprites.tree(variant)`, `F.sprites.rock(kind)`, `F.sprites.unit(type, frame)`, `F.sprites.player(dir, frame)`. All drawing is procedural with `ctx` primitives, Factorio-like palette (GDD §11). Under HEADLESS every function returns a dummy object without touching `document` (guard: `F.sprites.enabled = !window.HEADLESS`).

`F.camera = { x, y (float tile coords of the viewport centre), zoom (0.25..3), toScreen(tx,ty)->[px,py], toWorld(px,py)->[tx,ty], visibleTileRect() }`.
`F.render.init(canvas)`, `F.render.frame(dtMs)`: resize handling; layers: terrain chunk caches (offscreen canvas per chunk at 32 px/tile, invalidated by `F.render.invalidateChunk(cx,cy)` which world/entities call when tiles change; GC unused > 10 s) → ground items → belts (+ items) → entities (sorted by y for tall entities) → inserter arms & held items → units → player → placement preview (`F.input.preview`) → alt-mode overlay (`F.render.altMode`) → selection box → damage flashes; minimap image `F.render.minimap(sizePx) -> canvas` (chunk colours: terrain/ore/entities/pollution tint) refreshed every 30 frames. Fog/unexplored: not needed. `F.render.frame` must never mutate `F.state`.

## 17. UI (`70-ui.js`, `71-ui-windows.js`) and input (`75-input.js`)

DOM under `#ui` (pointer-events only on UI elements; the canvas receives everything else). `F.ui.init()`, `F.ui.update()` (called every frame; cheap — only re-render dirty widgets), `F.ui.open(windowName, payload)`, `F.ui.close(name)`, `F.ui.closeAll()`, `F.ui.isOpen(name)`, `F.ui.toast(text)`, `F.ui.alert(kind, entity)` (alerts list bottom-right with icons: attack, no power, no fuel, turret out of ammo, machine idle), `F.ui.tooltip(html, x, y)`, `F.ui.slot(inv, index, opts) -> element` (shared slot widget: icon, count, click/shift/ctrl semantics via `F.api.transferStack`), `F.ui.confirm(text) -> Promise<bool>`.
Windows in `71-ui-windows.js`: `inventory` (left: 80-slot inventory; right: crafting tabs logistics/production/intermediate/combat/science with recipe buttons showing availability & tooltip with ingredients; hand-crafting queue shown bottom-left of HUD), `entity` (dispatch by behaviour: furnace, assembler (recipe picker grid), chest, lab, drill (resource left), turret (ammo), boiler, engine (power), pole (network stats), inserter (filter slots), splitter (filter/priority)), `tech` (tree as list grouped by tier; shows cost, prerequisites, unlocks, start/queue button, progress bar), `help` ("Navodila": sections controls / basics / progression / ratios / tips; SL/EN toggle; opened with H or F1 and on first launch), `menu` (Esc: continue, new game (seed input), save, load, export/import JSON textarea, language, controls), `death` overlay.
HUD: top-left: minimap (canvas 200×200) + coordinates + tick time; top-right: research progress; bottom-centre: quickbar (10 slots; keys 1-0; middle-click to assign the item in cursor / drag from inventory); bottom-left: crafting queue; bottom-right: alerts; health bar above quickbar; cursor item follows the mouse.
Input (`F.input.init(canvas)`, `F.input.state` = `{mx,my,mine,shoot}` read by `F.player.tick`): WASD/arrows move; left click on world: place cursor item (or open entity GUI when cursor empty); right mouse held: mine (resource/tree/rock/entity under cursor within reach; progress bar drawn by renderer at `F.input.mining`); `R` rotate cursor/hovered entity; `Q` pipette (pick hovered entity's item into cursor from inventory); `E` inventory toggle / close; `T` tech; `M` minimap toggle large map; `H`/`F1` help; `Esc` menu/close; `F` pick up ground item; `Alt` toggle alt-mode; `Space` shoot nearest enemy; `1-0` quickbar; mouse wheel zoom; shift+click/ctrl+click in GUIs; drag with left button places belts/poles/walls continuously; `Delete`-free (remove via mining). Placement preview (`F.input.preview = {type, tx, ty, dir, ok}`) rendered by `61-render.js`.

## 18. Game orchestration (`80-game.js`)

```js
F.newGame({ seed }) : builds F.state = { version, seed, tick: 0, rng: {s}, world, entities: [], nextId: 1, ground: {}, units: [], player, research, enemies: { evolution: 0, killedSpawners: 0 }, stats: {produced: {}, consumed: {}}, alerts: [], settings: { peaceful: false } } ; F.world.newWorld(seed) ; F.player.init() (starting inventory) ; rebuilds caches ; F.state.tick = 0.
F.tick() : order (matches GDD §7.2) —
  1. F.world.tick()                 (lazy chunk generation around the player, max 2 chunks per tick)
  2. F.player.tick(F.input.state)   (movement, mining, hand-crafting queue, shooting input)
  3. F.power.tick()                 (per network: D = requests registered last tick; G = solar·daylight + engines limited by steam + accumulators; delivered = min(D,G); satisfaction = D>0 ? delivered/D : 1; engines consume steam for their share, accumulators charge with surplus / discharge; reset request accumulators)
  4. F.fluids.tick()                (offshore pumps push 20 water/tick; boilers convert 1 water -> 1 steam per tick while fuelled and there is room; segments clamp)
  5. F.machines.tick()              (drills, furnaces, assemblers, labs, radars, lamps — entity-id order; each electric machine registers its request via F.power.request for the NEXT tick's satisfaction and uses THIS tick's satisfaction to scale progress)
  6. F.inserters.tick()             (entity-id order)
  7. F.belts.tick()                 (lines downstream-first)
  8. F.combat.tick()                (turrets, player shots, units, spawners, damage/death)
  9. F.pollution.tick()             (every 64 ticks: emit/absorb/diffuse/attack banks; evolution time term every 60 ticks)
  10. F.research.tick()             (complete research when unitsDone >= count; unlocks; alert)
  11. F.entities.flushRemovals(); alerts expiry; autosave timer; F.state.tick++
F.save() -> JSON string   // deep-copies state, converts typed arrays to base64 (`{"$u8":"..."}`, `{"$u16":..}`, `{"$u32":..}`), strips keys starting with '_'
F.load(json) -> bool      // parse, migrate by version, decode typed arrays, set F.state, rebuild: F.world (tile map), F.entities (byId, ofType, wake), F.belts.rebuild(), F.power.rebuild(), F.fluids.rebuild()
F.game = { running, paused, speed: 1, lastAutosave, loop() (rAF: accumulator, max 5 ticks per frame, F.render.frame, F.ui.update), autosave every 60 s to localStorage 'factio.save' (try/catch), saveToSlot(name), loadFromSlot(name), listSlots(), exportString(), importString(s) }
F.boot() : F.sprites/render/ui/input init ; if localStorage has 'factio.save' show menu with Continue, else newGame with random seed and open help; start loop.
```

## 19. Testing contract

`test/headless.js` loads the built file with `window.HEADLESS = true`, calls `F.newGame({seed:42})`, runs 3600 ticks, save/load round-trip, then scenarios from `test/scenarios.js`. Scenario authors use `F.api.*`, `F.entities.*`, `F.belts.*` as specified above. Modules therefore must be **fully functional without DOM** (only sprites/render/ui/input are DOM-bound and must no-op headlessly).

## 20. CSS (`style.css`)

Dark industrial look: background `#1b1b1b`, panels `#313031` with 2px border `#0f0f0f` and inner light edge `#4a4a4a`, text `#e0dcd3`, accent orange `#ffa500`/`#e39827`, green ok `#5eb663`, red `#ff3f3f`. Slot 40×40 px, dark `#262626` with inset shadow; hover `#3a3a3a`. Windows centred, draggable by title bar. `#game` is full-screen `position:fixed; inset:0`; `#ui` overlays with `pointer-events:none`, children opt in with `pointer-events:auto`. Font: system sans-serif, 13–14 px. Tooltips: black translucent with orange title. Must be readable at 1366×768.
