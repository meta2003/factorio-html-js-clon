# Factio — Game Design Document

Version 1.0 — 2026-09-22 — Lead design. Status: **ready for parallel implementation**.

Factio is a faithful, scaled-down Factorio clone that ships as **one self-contained HTML file** (HTML + CSS + vanilla JavaScript, Canvas 2D, no external assets, no network, all graphics procedural). UI language: **Slovenian**, with an English toggle.

This document is written for engineers implementing the game in parallel modules. Every number that comes from the research corpus (`research/*.md`, itself compiled from the official Factorio wiki and the `wube/factorio-data` prototypes) is used as-is. Where a value had to be simplified or chosen, the row/paragraph says **[simplified]** or **[chosen]** and gives the value we ship with.

---

## 0. Reading guide, dataset policy, conventions

### 0.1 Dataset policy

| Decision | Choice | Why |
|---|---|---|
| Base ruleset | **Factorio 1.1.110, normal difficulty** for recipes, entity stats, inserter speeds, boiler water:steam (1:1), tech costs | Research names 1.1 as the canonical clone reference; 1.1 early game has no "trigger technologies", so everything a new player needs is available from tick 0 (simpler onboarding). |
| Pollution tile absorption | **2.0 values** (grass 0.000018/s per tile, water 0.000025/s) | 2.0 values are the currently documented ones and are ~2.5× more forgiving, which suits a 2–4 h game with fewer trees than a real map. |
| Belt physics | Factorio fixed-point model (256 positions per tile, 64 spacing, 8 pos/tick yellow) | Exact and integer-only. |
| Fluid model | **2.0 "segment" model** (one amount per connected pipe run) | Far simpler than the 1.1 per-box flow solver; only water and steam exist in Factio, so 1.1 pipe-length throughput limits are irrelevant at our scale. |
| Quality tiers, modules, expensive mode | none | out of scope |

### 0.2 Units and conventions used everywhere

| Term | Meaning |
|---|---|
| tick | 1/60 s. All simulation runs at 60 ticks/s. Per-second rates are divided by 60 when applied per tick. |
| tile | world unit; drawn 32 px at zoom 1.0. Entity footprint `w×h` is given for the entity facing **north**. |
| direction | integer `0 = N, 1 = E, 2 = S, 3 = W`. Rotating clockwise = `(d + 1) & 3`. Footprint for E/W = `h×w`. |
| anchor | top-left tile of an entity's footprint (`ax, ay`). Odd-sized entities snap to the tile under the cursor; even-sized entities snap so the cursor is at the shared corner (`ax = round(mouseX − w/2)`). |
| J / W | joule / watt. `kW → J/tick = W / 60` (e.g. 90 kW = 1 500 J/tick). Fuel: coal 4 000 000 J, wood 2 000 000 J. |
| PU | pollution unit (per chunk float). |
| id | every item, recipe, entity, tech has a kebab-case string id identical to Factorio's internal name where one exists (e.g. `iron-gear-wheel`). Code, save files and i18n keys use these ids. |
| stack | items per inventory slot (item table §4). |

### 0.3 Global constants (single `CONST` object in code)

| Constant | Value |
|---|---|
| `TICKS_PER_SECOND` | 60 |
| `TILE_PX` | 32 |
| `CHUNK_SIZE` | 32 tiles |
| `MAP_LIMIT` | ±4 096 tiles (128 chunks each way); beyond is `out-of-map` (black, impassable) **[chosen]** |
| `BELT_POS_PER_TILE` | 256 |
| `BELT_ITEM_SPACING` | 64 |
| `PLAYER_REACH` | 10 tiles (build, open GUI, pick up entity, hand-mine resources — see §3) |
| `SAFE_RADIUS_ENEMY` | 200 tiles (no spawners inside) |
| `STARTING_LAKE_DISTANCE` | 38 tiles |
| `AUTOSAVE_INTERVAL` | 60 s |
| `INSERTER_SWING_REF` | 1.166 s (reference inserter swing for insertion limits) |

---

## 1. Vision & scope

### 1.1 Vision

"The factory must grow" in a browser tab. Factio reproduces the first 2–4 hours of Factorio's core loop with faithful numbers: hand-mine → burner drills and stone furnaces → belts and inserters → steam power → labs and red science → assemblers → green science → gun turrets and walls holding off pollution-driven biter attacks. The joy is the same as the original: visible bottlenecks (backed-up belt, idle inserter), clean ratios (1 boiler : 2 engines, 48 stone furnaces per belt, 5 : 6 red : green assemblers) and the moment a block "just runs".

### 1.2 Target experience

| Milestone | Target wall-clock for a first-time player |
|---|---|
| First burner drill feeding a furnace | 5 min |
| Coal delivery automated with belts + burner inserters | 30–45 min |
| Steam power online, first electric drills/inserters | 45–75 min |
| First lab, Automation researched | 60–90 min |
| Red science automated in assemblers | 90–120 min |
| Logistic science pack researched, green science automated | 1.5–2.5 h |
| First biter attack repelled by turrets | 2–3 h (depends on pollution) |
| Logistics 2 / Automation 2 / Electric energy distribution 1 researched ("end of content") | 3–4 h |

### 1.3 In scope

- Infinite-ish chunked world, seeded procedural generation, lakes, four ores, trees, rocks.
- Player character with health, hand mining, 80-slot inventory, hand-crafting queue, pistol/SMG, death & respawn.
- 31 placeable entity types (§6), 51 items (§4), 46 recipes (§5), 23 technologies (§8).
- Belts (yellow + fast), undergrounds, splitters; four inserter tiers; chests; pipes; steam power; small/medium poles; burner + electric drills; stone + steel furnaces; assembling machine 1 + 2; lab; radar; lamp; gun turret; stone wall.
- Electricity network with satisfaction/brownout; water/steam fluid segments.
- Pollution per chunk with diffusion and absorption; evolution factor; biter spawners outside a 200-tile safe radius; small/medium/big biters; pollution-triggered attack groups; retaliation.
- Research with lab chains; technology screen.
- Full GUI: HUD, quickbar, inventory/crafting, entity GUIs, tooltips, alerts, minimap and full map, alt-mode overlay, in-game instructions panel ("Navodila").
- Save/load: JSON in `localStorage`, autosave, export/import via textarea.
- Slovenian UI with English toggle.
- Cosmetic day/night cycle (P2, §11.9) — no gameplay effect except lamps.

### 1.4 Out of scope (explicitly)

Oil, fluids other than water and steam, trains, robots/logistic network, circuit network, blueprints/ghosts/undo, express belts, bulk/filter inserters (all inserters are plain), big poles/substations, solar/accumulators, electric furnace, assembling machine 3, modules, armor/equipment, grenades/shotgun/flamethrower, spitters, worms, enemy expansion, cliffs, landfill/concrete/paths, fish, car, rocket, achievements, multiplayer, peaceful mode toggle (P2: a checkbox at new-game time is cheap — see §15).

### 1.5 Priorities

P0 = must ship; P1 = should ship; P2 = nice to have. Every feature below carries a priority tag where it is not obviously P0.

---

## 2. World

### 2.1 Structure

| Property | Value |
|---|---|
| Tile | 1×1; 32 px at zoom 1. |
| Chunk | 32×32 tiles = 1 024 tiles. Key `"cx,cy"` with `cx = floor(tileX / 32)`. Stored in a `Map`. |
| Chunk contents | `terrain: Uint8Array(1024)` (terrain id), `ore: Uint8Array(1024)` (0 none, 1 iron, 2 copper, 3 coal, 4 stone), `oreAmount: Uint32Array(1024)`, `entityGrid: Int32Array(1024)` (entity id occupying the tile, −1 = free; multi-tile entities write their id into every covered tile), `entities: Set<id>` (entities whose anchor is in the chunk), `pollution: number`, `trees: array`, `generated: bool`, `renderCache: {canvas, dirty}`. |
| Generation trigger | A chunk is generated the first time it is touched: (a) it intersects the viewport expanded by 2 chunks, (b) it is within 3 chunks of the player, (c) any entity/unit/attack group enters it, (d) a radar reveals it (§6.28). Generation is **order-independent**: every random decision is derived from `hash(seed, cx, cy, purpose)` or from region-level RNGs (§2.5), never from the order of generation. |
| Map limit | `|tileX|, |tileY| ≤ 4096`; beyond that `out-of-map` (black, impassable, unbuildable). |
| Spawn | tile (0, 0). Player spawns at world position (0.5, 0.5). |
| Charting | A chunk is "charted" (drawn on the minimap/map) once generated and either within 5×5 chunks of the player at some time or scanned by a radar. Uncharted chunks are black on the map. |

### 2.2 Noise primitives

All generation uses **2-D value noise with smoothstep interpolation** (or open-simplex — implementer's choice, must be deterministic from a 32-bit seed) and fractional Brownian motion:

```
fbm(x, y, octaves, persistence, seedSalt) = Σ_{o=0}^{octaves−1} persistence^o · noise2D(x·2^o, y·2^o, seed ⊕ hash(seedSalt, o))  normalised to [−1, 1]
```

Seed: 32-bit unsigned integer shown in the new-game dialog ("Seme"). RNG: xorshift32 or mulberry32. `hash(a, b, c, …)` = any 32-bit mix (e.g. FNV-1a over the arguments).

### 2.3 Elevation → water

Per tile (x, y), `d = sqrt(x² + y²)` (distance from spawn):

```
e  = fbm(x/96, y/96, 4, 0.6, "elev") + 0.35          // mean 0.35 → ≈15–20 % of far terrain is water
e  = max(e, 0.6 − d/100)                              // starting plateau: guaranteed land inside ≈60 tiles
lakeDist = distance(tile, LAKE_CENTRE)
e  = min(e, (lakeDist − LAKE_RADIUS) / 8 + 0.25 · fbm(x/6, y/6, 3, 0.5, "lake"))   // guaranteed starting lake
water     = e < 0
deepwater = e < −0.5
```

`LAKE_CENTRE` = spawn + 38 tiles in direction `θ_lake = rand(seed, "lakeAngle") · 2π`; `LAKE_RADIUS = 9` (± the noise term → irregular shore, roughly 15–22 tiles across). This satisfies "water lake near spawn, guaranteed" with an offshore pump site within 30–50 tiles of spawn in every seed.

Shallow water, water-green, mud: **not generated** [simplified].

### 2.4 Ground terrain types and palette

Two more fields: `moisture = 0.5 + 0.5·fbm(x/256, y/256, 4, 0.5, "moist")` (0 dry … 1 wet) and `aux = 0.5 + 0.5·fbm(x/512, y/512, 3, 0.5, "aux")` (0 sandy … 1 red desert), plus a tiny per-tile jitter `j = 0.04·noise2D(x, y, "jitter")` added to moisture so borders are ragged. Factorio's 20+ ground tiles are collapsed to 8 **[simplified]**:

| id | Terrain (SL / EN) | Rule (evaluated in order) | Fill colour | Speckle colour | Minimap colour (official `map_color`) | Pollution absorption / tile / s |
|---|---|---|---|---|---|---|
| 0 | `out-of-map` — Rob sveta / Out of map | outside `MAP_LIMIT` | #000000 | – | #000000 | 0 (impassable) |
| 1 | `deepwater` — Globoka voda / Deep water | e < −0.5 | #143A55 | #1A4763 | #264049 | 0.000025 |
| 2 | `water` — Voda / Water | e < 0 | #1F4F6E | #2A6A8C ripples | #33535F | 0.000025 |
| 3 | `sand` — Pesek / Sand | moisture < 0.22 and aux < 0.5 | #C2A66B | #AD915B | #8A673A | 0.000015 |
| 4 | `red-desert` — Rdeča puščava / Red desert | moisture < 0.35 and aux ≥ 0.5 | #A87246 | #B5834F | #745127 | 0.000015 |
| 5 | `dirt` — Zemlja / Dirt | moisture < 0.45 | #9A7B55 | #86694A | #8D683C | 0.000018 |
| 6 | `grass-dry` — Suha trava / Dry grass | moisture < 0.62 | #6E8A3A | #5F6B3C | #42390F | 0.000018 |
| 7 | `grass` — Trava / Grass | otherwise (wettest) | #5B7A33 | #4E6A2C | #37350B | 0.000018 |

Rendering of terrain is in §11.3 (fill + 5–8 speckles per tile drawn once into the chunk cache). Walk speed is 1.0 on all land tiles; water is impassable for the player, biters and buildings (only the offshore pump may touch it, §6.18).

### 2.5 Resource patches

Four ores: `iron-ore`, `copper-ore`, `coal`, `stone`. Each ore tile stores an integer `amount`; mining subtracts 1 per item; at 0 the ore disappears from the tile.

#### 2.5.1 Patch shape (cone) — shared by starting and regular patches

A patch ("spot") has a centre `(sx, sy)`, a total quantity `Q` and a radius-quantity factor `rq`:

```
r        = min(32, rq · Q^(1/3))                       // radius in tiles
h        = Q^(1/3) / ((π/3) · rq²)                     // ore per tile at the centre
amount(t)= round( h · max(0, 1 − dist(t, centre)/r) · (1 + 0.25 · fbm(tx/5, ty/5, 2, 0.5, "blob")) · RICHNESS_MULT )
```

`RICHNESS_MULT` = 1.0 (config constant). A tile gets the ore whose `amount` is highest if several patches overlap; ore is never written on water tiles. Integral of the cone equals `Q` (the noise term is zero-mean).

#### 2.5.2 Guaranteed starting patches (within ~40 tiles of spawn)

Computed once from the map seed (not per chunk), then applied to every chunk they overlap. Base angle `θ0 = θ_lake` (the lake direction from §2.3); each patch gets an angular jitter of ±10° from `rand(seed, "patchJitter:<ore>")`.

| Ore | Angle | Distance from spawn | Q (official starting amount at 100 % sliders: `40000 × base_density`) | rq (`starting_rq_factor` = mult/7) | Resulting r | Centre ore/tile (h) |
|---|---|---|---|---|---|---|
| stone | θ0 + 72° | 28 | 320 000 | 1.1/7 = 0.1571 | 10.8 | ≈ 2 650 |
| coal | θ0 + 144° | 28 | 640 000 | 0.1571 | 13.5 | ≈ 3 330 |
| iron-ore | θ0 + 216° | 32 | 800 000 | 1.5/7 = 0.2143 | 19.9 | ≈ 1 930 |
| copper-ore | θ0 + 288° | 28 | 640 000 | 1.2/7 = 0.1714 | 14.8 | ≈ 2 800 |

The 72° spacing plus iron at 32 tiles keeps every pair of patches and the lake non-overlapping except for cone edges (< 2 tiles, resolved by "highest amount wins"). All four centres lie inside the guaranteed-land plateau.

#### 2.5.3 Regular patches (beyond the start)

Regions of **512×512 tiles** (key `"rx,ry"`, `rx = floor(x/512)`). For each region and each ore, a region RNG `rng(seed, rx, ry, ore)` decides:

```
expectedSpots = 2.5 spots/km² × 0.262 km² = 0.655            // base_spots_per_km2 = 2.5 for all four ores
spotCount     = floor(0.655 + rng())                          // 0 or 1 (65 %)
for each spot: try up to 8 candidate centres (uniform in region) and keep the first with d > 120, elevation e(centre) > 0.15 (land), and no other ore centre within 40 tiles
   sed  = max(0, d − 300); eff = clamp(sed, 0, 1300)
   density = base_density × (1 + eff/1300) × clamp((d − 120)/300, 0, 1)          // fade-in 120 → 420 tiles
   Qbase = density × 1 000 000 / 2.5
   Q     = Qbase × (0.25 + 1.75 · rng())                                          // random_spot_size 0.25 … 2
   rq    = 1/10 × (iron/copper 1.10, coal/stone 1.0)                              // regular_rq_factor
   richnessDistMult = max(1, (1300 + sed) / 2600)                                 // per-tile richness grows beyond 1 600 tiles
   amount(t) = cone(Q, rq) × richnessDistMult
```

`base_density`: iron 10, copper 8, coal 8, stone 4. Example: a regular iron spot at d = 500 has `Qbase ≈ 4.6 M`, r ≈ 17, centre ≈ 15 000 ore/tile — matching the real game's "far patches are denser". When generating a chunk, evaluate all spots of the 3×3 regions around it (spot radius ≤ 32 < 512, so that is sufficient).

Uranium and crude oil: not generated.

#### 2.5.4 Ore density rendering stages (for §11)

Sprite stage `s` = first index where `amount ≥ threshold[s]`, thresholds `[15000, 9500, 5500, 2900, 1300, 400, 150, 80]`; stage 0 draws 12 speckles per tile, stage 7 draws 2 (§11.3).

### 2.6 Trees

| Property | Value |
|---|---|
| Entity | `tree` (living) and `dead-tree`. Position = tile + jitter (±0.3 tile), so trees are not grid-aligned; collision box 0.8×0.8 tile centred on the trunk. |
| Health | living 50, dead 20 |
| Hand-mining time | living **0.55 s** (`mining_time`), dead 0.5 s → by hand at mining speed 0.5: 1.1 s / 1.0 s |
| Yield | living **4 wood**, dead **2 wood** |
| Pollution absorption | living **−0.001 PU/s** each, dead −0.0001 PU/s. Leaf-loss stages **[simplified]**: a tree in a chunk with pollution > 60 has a 1/600 chance per tick to drop one stage (0 → 1 → 2 → 3); absorption by stage: 0.001 / 0.00067 / 0.00033 / 0; each drop removes 10 PU from the chunk. Stage is only cosmetic otherwise (greyer canopy). |
| Blocking | trees block player movement and building (must be mined, "Ctrl-drag" not needed: mining a tree takes ~1 s). Biters walk through trees **[simplified]** (avoids path-finding around forests). |
| Placement | `forest = fbm(x/48, y/48, 3, 0.5, "forest") − 0.5 + 0.2·TREE_COVERAGE + biome`, `biome = +0.35 if moisture > 0.55, +0.1 if 0.4–0.55, −0.3 if < 0.3`; place a tree on the tile with probability `clamp(forest, 0, 0.7)` when `forest > 0`. `TREE_COVERAGE = 1`. Starting clearing **[simplified from 128/64]**: multiply probability by `clamp((d − 64)/64, 0, 1)` → no trees within 64 tiles of spawn, full density from 128 tiles. Dead trees replace living ones with probability 0.6 where moisture < 0.3 (deserts). Never on water or ore tiles. |
| Type/colour | canopy tint chosen per tile from the biome: grass → `#3D7A3A/#4E8A44/#5B9A4C`, dry grass/dirt → `#6B903E/#778030/#8A9A40`, desert → `#9A7120/#59452A` (dead: trunk `#6B553E`, no canopy). |

Wood is the only non-automatable raw material (needed for wooden chests and small poles: 1 wood → 2 poles). The player starts with 1 wood.

### 2.7 Rocks

| Rock | Footprint (grid-aligned **[simplified]**) | HP | Hand-mining time | Yield | Colour |
|---|---|---|---|---|---|
| `big-rock` — Velika skala | 2×2 | 500 | 2 s (4 s by hand at speed 0.5) | 20 stone | #81694E body, #6A5640 shade |
| `huge-rock` — Ogromna skala | 3×2 | 2000 | 3 s (6 s by hand) | 24–50 stone **and** 24–50 coal (uniform random) | same, bigger |

Placement: for tiles with moisture < 0.45 and d > 40, probability 0.0025 per tile for a big rock, 0.0006 for a huge rock, only if the whole footprint is free land. Rocks block movement and building; they are mined by holding RMB like trees; biters walk around (or through, see trees) **[simplified]**.

### 2.8 Enemy base placement

See §7.9. Summary: no spawner inside `d < 200`; per chunk beyond that, probability of a base `p = (10 + 3·min(d, 2400)/325) · 0.001024 · ENEMY_FREQ` (≈ 1 % near, ≈ 3.3 % at 2400 tiles); a base = `2 + floor(3·min(d,2400)/2400)` spawners within a 15-tile disc, ≥ 6 tiles apart, on land, each with 7 idle small biters.

### 2.9 Starting kit

| Item | Count |
|---|---|
| iron-plate | 8 |
| burner-mining-drill | 1 |
| stone-furnace | 1 |
| wood | 1 |
| pistol | 1 (in gun slot) |
| firearm-magazine | 10 (in ammo slot) |

No crash-site wreckage (P2 cosmetic).

---

## 3. Player

| Property | Value |
|---|---|
| Health | **250 HP**. Regeneration **6 HP/s** (wiki value; prototype 9 HP/s — we use 6 **[chosen]**) starting **10 s** after the last damage taken. |
| Movement | WASD, 8 directions, diagonal normalised. Speed **8.9 tiles/s** = 0.1483 tiles/tick (wiki 8.9; prototype 0.15 → 9.0; we use 8.9 **[chosen]**). Collision box 0.4×0.4 tile; slides along obstacle corners (corner sliding 0.7). Cannot enter water, buildings (except belts — see below), trees, rocks, spawners. Walking on belts: the player is carried at the belt speed in the belt direction (`+1.875 tiles/s`, fast 3.75). |
| Reach | `PLAYER_REACH = 10` tiles (distance from player centre to the target tile centre) for building, opening GUIs, picking up entities, hand-mining resources/trees/rocks, dropping items. Factorio uses 2.7 for resource hand-mining; **[simplified]** to 10 for mouse ergonomics (constant `REACH_RESOURCE`, set to 2.7 for fidelity). Cursor beyond reach: preview drawn red, actions refused, tooltip "Predaleč". |
| Hand mining | Hold **RMB** over an ore tile, tree or rock. Progress per tick = `(1 + miningBonus) · 0.5 / mining_time / 60`; ore mining_time 1 s → one ore every 2.0 s (1.0 s after Steel axe). A circular progress ring is drawn at the cursor. Mining an ore tile subtracts 1 from its amount; at 0 the ore vanishes. Trees/rocks are removed when their mining progress completes (their HP is only for combat). If the inventory is full the mined item is dropped on the ground at the player's feet **[simplified]**. |
| Picking up entities | Hold RMB over an own entity: progress `mining_time_entity / 0.5 / 60` per tick (`mining_time_entity`: belts/poles/pipes/wooden chest/offshore pump 0.1 s, furnace/AM/lab/chest 0.2 s, burner drill/electric drill 0.3 s, turret 0.5 s). The entity item and **all its contents** (slots, fuel, hand of an inserter, items on a belt tile) go to the inventory; if there is no room the pickup is refused ("Inventar je poln"). |
| Inventory | **80 slots** (+10 with Toolbelt). 10 columns. Stack merging by item id. Plus 1 gun slot and 1 ammo slot **[simplified from 3+3]**. |
| Cursor stack | A "hand" stack separate from the inventory; while holding a placeable item the world shows the placement preview. `Q` returns it to the inventory. |
| Hand crafting | Crafting speed 1.0 → craft time = recipe time. Queue (unlimited). Materials are removed when queued; cancelling returns them. Missing hand-craftable intermediates are chain-crafted automatically (they show in orange). Only recipes with `category = crafting` are hand-craftable (never smelting). Crafting continues while walking/mining/with GUIs closed. Left-click 1, right-click 5, Shift+left all possible. |
| Combat | Gun slot: pistol or SMG. Ammo slot: firearm or piercing magazines. Hold **Space** to fire at the nearest enemy within the gun's range; **C** fires toward the cursor. Rounds consumed 1 per shot from the top magazine (10 rounds each). When the ammo slot empties, it auto-refills from the inventory with the same magazine type **[simplified]**. Movement is slowed while firing: ×0.8 pistol, ×0.3 SMG (`movement_slow_down_factor` 0.2 / 0.7). |
| Weapons | Pistol: cooldown 15 ticks (4 shots/s), range 15. SMG: cooldown 6 ticks (10 shots/s), range 18. Damage = ammo damage × (1 + PPD bonus). Rate × (1 + WSS bonus). |
| Death | At 0 HP: a `player-corpse` entity ("Truplo") is placed at the death position holding the entire inventory, gun/ammo and cursor; it never expires **[chosen, 2.0 behaviour]**; opening it (click) shows a chest-like GUI; it disappears when emptied. Game-over overlay "Umrl si" with a 10 s countdown; respawn at spawn (0,0) with 1 pistol + 10 firearm magazines and an otherwise empty inventory. Evolution, research and buildings are untouched. |
| Vision | Charts 5×5 chunks around the player continuously. |
| Bonuses (from research) | `miningBonus` (+1.0 from Steel axe), `inventoryBonus` (+10 Toolbelt), `bulletDamage`, `bulletSpeed`, `turretDamage`, `labSpeed`. |

---

## 4. Items

51 items. Category = crafting-menu tab (§9.4). Colour hint = base colour of the procedural icon (§11.5 gives the drawing recipe per icon class). Fuel value in MJ (empty = not fuel).

| # | id | Slovenian name | English name | Stack | Fuel | Category / subgroup | Icon class & colour hint |
|---|---|---|---|---|---|---|---|
| 1 | `iron-ore` | Železova ruda | Iron ore | 50 | – | intermediate / raw | ore chunks #6C8399, highlight #9FB3C4 |
| 2 | `copper-ore` | Bakrova ruda | Copper ore | 50 | – | intermediate / raw | ore chunks #C9662F, highlight #E8925A |
| 3 | `coal` | Premog | Coal | 50 | 4 | intermediate / raw | ore chunks #1E1E1E, highlight #4A4F5A |
| 4 | `stone` | Kamen | Stone | 50 | – | intermediate / raw | ore chunks #A8956B, highlight #D2C39A |
| 5 | `wood` | Les | Wood | 100 | 2 | intermediate / raw | log #8B5A2B, rings #C08A4E |
| 6 | `iron-plate` | Železna plošča | Iron plate | 100 | – | intermediate / material | plate #B8BEC4, edge #7E868C |
| 7 | `copper-plate` | Bakrena plošča | Copper plate | 100 | – | intermediate / material | plate #D27C3C, edge #8F4F22 |
| 8 | `steel-plate` | Jeklena plošča | Steel plate | 100 | – | intermediate / material | bar #8B9AA8, edge #4E5A66 |
| 9 | `stone-brick` | Kamnita opeka | Stone brick | 100 | – | intermediate / material | brick #A6906A, mortar #6E5F44 |
| 10 | `iron-gear-wheel` | Železni zobnik | Iron gear wheel | 100 | – | intermediate / product | gear #9C9C9C, hole #4A4A4A |
| 11 | `copper-cable` | Bakreni kabel | Copper cable | 200 | – | intermediate / product | coil #D98A4F |
| 12 | `electronic-circuit` | Elektronsko vezje | Electronic circuit | 200 | – | intermediate / product | PCB #3F8F3F, traces #C57A3B |
| 13 | `iron-stick` | Železna palica | Iron stick | 100 | – | intermediate / product | two rods #A9AFB5 |
| 14 | `pipe` | Cev | Pipe | 100 | – | logistics / fluid | grey tube #8FA3B0 with dark ends |
| 15 | `automation-science-pack` | Avtomatizacijski znanstveni paket | Automation science pack | 200 | – | intermediate / science | flask #D9422B |
| 16 | `logistic-science-pack` | Logistični znanstveni paket | Logistic science pack | 200 | – | intermediate / science | flask #3EB44A |
| 17 | `pistol` | Pištola | Pistol | 5 | – | combat / gun | gun silhouette #5A5A5A |
| 18 | `submachine-gun` | Brzostrelka | Submachine gun | 5 | – | combat / gun | gun silhouette #3E3E3E, longer |
| 19 | `firearm-magazine` | Nabojnik | Firearm magazine | 200 | – | combat / ammo | magazine #C9B037 tip #7A6A20 |
| 20 | `piercing-rounds-magazine` | Prebojni nabojnik | Piercing rounds magazine | 200 | – | combat / ammo | magazine #C03A2B tip #6E1E15 |
| 21 | `repair-pack` | Popravljalni komplet | Repair pack | 100 | – | production / tool | wrench+box #C8A24A |
| 22 | `wooden-chest` | Lesen zaboj | Wooden chest | 50 | – | logistics / storage | box #A5773E planks |
| 23 | `iron-chest` | Železen zaboj | Iron chest | 50 | – | logistics / storage | box #9AA3AA rivets |
| 24 | `steel-chest` | Jeklen zaboj | Steel chest | 50 | – | logistics / storage | box #6F7C8A rivets |
| 25 | `transport-belt` | Tekoči trak | Transport belt | 100 | – | logistics / belt | belt #E0B31E arrows #4D3D0A |
| 26 | `fast-transport-belt` | Hitri tekoči trak | Fast transport belt | 100 | – | logistics / belt | belt #C93B2B |
| 27 | `underground-belt` | Podzemni trak | Underground belt | 50 | – | logistics / belt | belt #E0B31E + hood #6E5A1E |
| 28 | `fast-underground-belt` | Hitri podzemni trak | Fast underground belt | 50 | – | logistics / belt | belt #C93B2B + hood |
| 29 | `splitter` | Razdelilnik | Splitter | 50 | – | logistics / belt | 2-wide belt #E0B31E + arrow |
| 30 | `fast-splitter` | Hitri razdelilnik | Fast splitter | 50 | – | logistics / belt | #C93B2B |
| 31 | `burner-inserter` | Vstavljalnik na gorivo | Burner inserter | 50 | – | logistics / inserter | arm #777777 base #3A3A3A |
| 32 | `inserter` | Vstavljalnik | Inserter | 50 | – | logistics / inserter | arm #E4B21C |
| 33 | `long-handed-inserter` | Dolgoroki vstavljalnik | Long-handed inserter | 50 | – | logistics / inserter | arm #C24A2A, longer |
| 34 | `fast-inserter` | Hitri vstavljalnik | Fast inserter | 50 | – | logistics / inserter | arm #2F7FC1 |
| 35 | `pipe-to-ground` | Podzemna cev | Pipe to ground | 50 | – | logistics / fluid | tube #8FA3B0 into ground #5A4A3A |
| 36 | `small-electric-pole` | Mali električni drog | Small electric pole | 50 | – | logistics / power | wooden pole #8B5A2B, wire #C9772E |
| 37 | `medium-electric-pole` | Srednji električni drog | Medium electric pole | 50 | – | logistics / power | steel pole #7C8790 |
| 38 | `offshore-pump` | Obalna črpalka | Offshore pump | 20 | – | production / energy | pump #6C8C9C, blue intake |
| 39 | `boiler` | Kotel | Boiler | 50 | – | production / energy | boiler #6B5A4A with fire #E0602A |
| 40 | `steam-engine` | Parni stroj | Steam engine | 10 | – | production / energy | engine #7A8590 flywheel |
| 41 | `burner-mining-drill` | Rudarski vrtalnik na gorivo | Burner mining drill | 50 | – | production / extraction | drill #6E6A60 with chimney |
| 42 | `electric-mining-drill` | Električni rudarski vrtalnik | Electric mining drill | 50 | – | production / extraction | drill #5E6C7A, yellow #D9A520 |
| 43 | `stone-furnace` | Kamnita peč | Stone furnace | 50 | – | production / smelting | stone block #8C8072, mouth #E0602A |
| 44 | `steel-furnace` | Jeklena peč | Steel furnace | 50 | – | production / smelting | steel block #5E6873, mouth |
| 45 | `assembling-machine-1` | Sestavljalni stroj 1 | Assembling machine 1 | 50 | – | production / machine | box #7B8A5A, gear |
| 46 | `assembling-machine-2` | Sestavljalni stroj 2 | Assembling machine 2 | 50 | – | production / machine | box #5A7B8A, gear |
| 47 | `lab` | Laboratorij | Lab | 10 | – | production / machine | dome #4A8AA8, glow |
| 48 | `gun-turret` | Strelna kupola | Gun turret | 50 | – | combat / turret | turret #CAA718 barrel #3A3A3A |
| 49 | `stone-wall` | Kamniti zid | Stone wall | 100 | – | combat / defense | wall #CCD9CC bricks |
| 50 | `radar` | Radar | Radar | 50 | – | production / machine | dish #8A9AA5 |
| 51 | `small-lamp` | Mala svetilka | Small lamp | 50 | – | logistics / power | lamp #E8E4C0 on post |

Fuel category: every burner device (furnaces, burner drill, burner inserter, boiler) accepts `coal` and `wood`.

---

## 5. Recipes

46 recipes. `Time` = seconds at crafting speed 1 (hand = 1.0; AM1 = 0.5 → ×2; AM2 = 0.75; stone furnace 1; steel furnace 2). `Cat.`: `smelting` (furnace only), `crafting` (hand or assembler). `Unlock`: technology id or `start`. Result count 1 unless stated. `Fe` = iron-plate, `Cu` = copper-plate.

### 5.1 Smelting (furnace only; the furnace picks the recipe from the input item)

| id | Ingredients | Result | Time | Cat. | Unlock |
|---|---|---|---|---|---|
| `iron-plate` | 1 iron-ore | 1 | 3.2 | smelting | start |
| `copper-plate` | 1 copper-ore | 1 | 3.2 | smelting | start |
| `stone-brick` | 2 stone | 1 | 3.2 | smelting | start |
| `steel-plate` | 5 iron-plate | 1 | 16 | smelting | `steel-processing` |

### 5.2 Intermediates

| id | Ingredients | Result | Time | Cat. | Unlock |
|---|---|---|---|---|---|
| `iron-gear-wheel` | 2 Fe | 1 | 0.5 | crafting | start |
| `copper-cable` | 1 Cu | **2** | 0.5 | crafting | start |
| `electronic-circuit` | 1 Fe + 3 copper-cable | 1 | 0.5 | crafting | start |
| `iron-stick` | 1 Fe | **2** | 0.5 | crafting | start |
| `pipe` | 1 Fe | 1 | 0.5 | crafting | start |

### 5.3 Science

| id | Ingredients | Result | Time | Cat. | Unlock |
|---|---|---|---|---|---|
| `automation-science-pack` | 1 Cu + 1 iron-gear-wheel | 1 | 5 | crafting | start |
| `logistic-science-pack` | 1 inserter + 1 transport-belt | 1 | 6 | crafting | `logistic-science-pack` |

### 5.4 Military

| id | Ingredients | Result | Time | Cat. | Unlock |
|---|---|---|---|---|---|
| `pistol` | 5 Cu + 5 Fe | 1 | 5 | crafting | start |
| `submachine-gun` | 10 iron-gear-wheel + 5 Cu + 10 Fe | 1 | 10 | crafting | `military` |
| `firearm-magazine` | 4 Fe | 1 | 1 | crafting | start |
| `piercing-rounds-magazine` | 1 firearm-magazine + 1 steel-plate + 5 Cu | 1 | 3 | crafting | `military-2` |
| `repair-pack` | 2 electronic-circuit + 2 iron-gear-wheel | 1 | 0.5 | crafting | `electronics` |

### 5.5 Logistics

| id | Ingredients | Result | Time | Cat. | Unlock |
|---|---|---|---|---|---|
| `wooden-chest` | 2 wood | 1 | 0.5 | crafting | start |
| `iron-chest` | 8 Fe | 1 | 0.5 | crafting | start |
| `steel-chest` | 8 steel-plate | 1 | 0.5 | crafting | `steel-processing` |
| `transport-belt` | 1 Fe + 1 iron-gear-wheel | **2** | 0.5 | crafting | start |
| `fast-transport-belt` | 5 iron-gear-wheel + 1 transport-belt | 1 | 0.5 | crafting | `logistics-2` |
| `underground-belt` | 10 Fe + 5 transport-belt | **2** | 1 | crafting | `logistics` |
| `fast-underground-belt` | 40 iron-gear-wheel + 2 underground-belt | **2** | 2 | crafting | `logistics-2` |
| `splitter` | 5 electronic-circuit + 5 Fe + 4 transport-belt | 1 | 1 | crafting | `logistics` |
| `fast-splitter` | 1 splitter + 10 iron-gear-wheel + 10 electronic-circuit | 1 | 2 | crafting | `logistics-2` |
| `burner-inserter` | 1 Fe + 1 iron-gear-wheel | 1 | 0.5 | crafting | start |
| `inserter` | 1 electronic-circuit + 1 iron-gear-wheel + 1 Fe | 1 | 0.5 | crafting | start |
| `long-handed-inserter` | 1 iron-gear-wheel + 1 Fe + 1 inserter | 1 | 0.5 | crafting | `automation` |
| `fast-inserter` | 2 electronic-circuit + 2 Fe + 1 inserter | 1 | 0.5 | crafting | `fast-inserter` |
| `pipe-to-ground` | 10 pipe + 5 Fe | **2** | 0.5 | crafting | start |
| `small-electric-pole` | 1 wood + 2 copper-cable | **2** | 0.5 | crafting | start |
| `medium-electric-pole` | 4 iron-stick + 2 steel-plate + 2 Cu | 1 | 0.5 | crafting | `electric-energy-distribution-1` |
| `small-lamp` | 1 electronic-circuit + 3 copper-cable + 1 Fe | 1 | 0.5 | crafting | `optics` |

### 5.6 Production and power

| id | Ingredients | Result | Time | Cat. | Unlock |
|---|---|---|---|---|---|
| `stone-furnace` | 5 stone | 1 | 0.5 | crafting | start |
| `steel-furnace` | 6 steel-plate + 10 stone-brick | 1 | 3 | crafting | `advanced-material-processing` |
| `burner-mining-drill` | 3 iron-gear-wheel + 1 stone-furnace + 3 Fe | 1 | 2 | crafting | start |
| `electric-mining-drill` | 3 electronic-circuit + 5 iron-gear-wheel + 10 Fe | 1 | 2 | crafting | start |
| `assembling-machine-1` | 3 electronic-circuit + 5 iron-gear-wheel + 9 Fe | 1 | 0.5 | crafting | `automation` |
| `assembling-machine-2` | 2 steel-plate + 3 electronic-circuit + 5 iron-gear-wheel + 1 assembling-machine-1 | 1 | 0.5 | crafting | `automation-2` |
| `offshore-pump` | 2 electronic-circuit + 1 pipe + 1 iron-gear-wheel | 1 | 0.5 | crafting | start |
| `boiler` | 1 stone-furnace + 4 pipe | 1 | 0.5 | crafting | start |
| `steam-engine` | 8 iron-gear-wheel + 5 pipe + 10 Fe | 1 | 0.5 | crafting | start |
| `lab` | 10 electronic-circuit + 10 iron-gear-wheel + 4 transport-belt | 1 | 2 | crafting | start |
| `radar` | 5 electronic-circuit + 5 iron-gear-wheel + 10 Fe | 1 | 0.5 | crafting | `electronics` |
| `gun-turret` | 10 iron-gear-wheel + 10 Cu + 20 Fe | 1 | 8 | crafting | `gun-turret` |
| `stone-wall` | 5 stone-brick | 1 | 0.5 | crafting | `stone-wall` |

### 5.7 Raw-material roll-ups (for tooltips "Skupaj surovin" and for balancing)

| Product | Fe | Cu | Other | Hand chain time (s) |
|---|---|---|---|---|
| iron-gear-wheel | 2 | – | – | 0.5 |
| electronic-circuit | 1 | 1.5 | – | 1.25 |
| inserter | 4 | 1.5 | – | 2.25 |
| transport-belt (×2) | 3 | – | – | 1.0 |
| automation-science-pack | 2 | 1 | – | 5.5 |
| logistic-science-pack | 5.5 | 1.5 | – | 8.75 |
| lab | 36 | 15 | – | ≈ 26 |
| assembling-machine-1 | 22 | 4.5 | – | ≈ 6.5 |
| electric-mining-drill | 23 | 4.5 | – | ≈ 6.5 |
| burner-mining-drill | 9 | – | 5 stone | 3.5 |
| steam-engine | 31 | – | – | 7 |
| boiler | 4 | – | 5 stone | 3 |
| gun-turret | 40 | 10 | – | 13 |
| splitter | 16 | 7.5 | – | 9.25 |
| medium-electric-pole | 2 + 2 steel (= 12 Fe) | 2 | – | 1 |

---

## 6. Entities

### 6.1 Master table (31 placeable + 10 non-placeable)

Energy: `B` = burner (1 fuel slot, accepts coal/wood), `E` = electric (consumption while working + drain always), `–` = none. Pollution in PU/min at 100 % activity. `Mine` = player pickup time in s.

| # | id | Footprint | HP | Energy | Drain | Key rate | Pollution | Mine | Recipe item | Rotatable |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `wooden-chest` | 1×1 | 100 | – | – | 16 slots | 0 | 0.1 | yes | no |
| 2 | `iron-chest` | 1×1 | 200 | – | – | 32 slots | 0 | 0.2 | yes | no |
| 3 | `steel-chest` | 1×1 | 350 | – | – | 48 slots | 0 | 0.2 | yes | no |
| 4 | `transport-belt` | 1×1 | 150 | – | – | 1.875 tiles/s, 15 items/s | 0 | 0.1 | yes | 4 dirs |
| 5 | `fast-transport-belt` | 1×1 | 160 | – | – | 3.75 tiles/s, 30 items/s | 0 | 0.1 | yes | 4 dirs |
| 6 | `underground-belt` | 1×1 (pair) | 150 | – | – | as belt; max gap 4 tiles | 0 | 0.1 | yes | 4 dirs + in/out |
| 7 | `fast-underground-belt` | 1×1 (pair) | 160 | – | – | as fast belt; max gap 6 | 0 | 0.1 | yes | 4 dirs + in/out |
| 8 | `splitter` | 2×1 | 170 | – | – | 15 items/s per belt | 0 | 0.1 | yes | 4 dirs |
| 9 | `fast-splitter` | 2×1 | 180 | – | – | 30 items/s per belt | 0 | 0.1 | yes | 4 dirs |
| 10 | `burner-inserter` | 1×1 | 100 | B 94.2 kW while moving | – | 0.60 items/s (100-tick cycle) | 0 | 0.1 | yes | 4 dirs |
| 11 | `inserter` | 1×1 | 150 | E 13.2 kW | 0.4 kW | 0.83 items/s (72-tick cycle) | 0 | 0.1 | yes | 4 dirs |
| 12 | `long-handed-inserter` | 1×1 | 160 | E 18.4 kW | 0.4 kW | 1.20 items/s (50-tick), reach 2 | 0 | 0.1 | yes | 4 dirs |
| 13 | `fast-inserter` | 1×1 | 150 | E 46.7 kW | 0.5 kW | 2.31 items/s (26-tick) | 0 | 0.1 | yes | 4 dirs |
| 14 | `pipe` | 1×1 | 100 | – | – | holds 100 fluid | 0 | 0.1 | yes | auto |
| 15 | `pipe-to-ground` | 1×1 (pair) | 150 | – | – | 100 fluid per pair; max distance 10 (gap 9) | 0 | 0.1 | yes | 4 dirs |
| 16 | `small-electric-pole` | 1×1 | 100 | – | – | supply 5×5, wire reach 7.5 | 0 | 0.1 | yes | no |
| 17 | `medium-electric-pole` | 1×1 | 100 | – | – | supply 7×7, wire reach 9 | 0 | 0.1 | yes | no |
| 18 | `offshore-pump` | 1×1 **[simplified from 1×2]** | 150 | – | – | 1200 water/s (20/tick) | 0 | 0.1 | yes | 4 dirs |
| 19 | `boiler` | 3×2 | 200 | B 1.8 MW | – | 60 water/s → 60 steam/s @165 °C | **30** | 0.2 | yes | 4 dirs |
| 20 | `steam-engine` | 3×5 | 400 | produces ≤ 900 kW | – | consumes ≤ 30 steam/s | 0 | 0.3 | yes | N/E only |
| 21 | `burner-mining-drill` | 2×2 | 150 | B 150 kW | – | 0.25 ore/s, area 2×2 | **12** | 0.3 | yes | 4 dirs |
| 22 | `electric-mining-drill` | 3×3 | 300 | E 90 kW | 3 kW | 0.5 ore/s, area 5×5 | 10 | 0.3 | yes | 4 dirs |
| 23 | `stone-furnace` | 2×2 | 200 | B 90 kW | – | speed 1 (plate / 3.2 s) | 2 | 0.2 | yes | no |
| 24 | `steel-furnace` | 2×2 | 300 | B 90 kW | – | speed 2 | 4 | 0.2 | yes | no |
| 25 | `assembling-machine-1` | 3×3 | 300 | E 75 kW | 2.5 kW | speed 0.5 | 4 | 0.2 | yes | no |
| 26 | `assembling-machine-2` | 3×3 | 350 | E 150 kW | 5 kW | speed 0.75 | 3 | 0.2 | yes | no |
| 27 | `lab` | 3×3 | 150 | E 60 kW | 2 kW | research speed 1 | 0 | 0.2 | yes | no |
| 28 | `gun-turret` | 2×2 | 400 | – | – | range 18, 10 shots/s | 0 | 0.5 | yes | no |
| 29 | `stone-wall` | 1×1 | 350 | – | – | blocks melee | 0 | 0.2 | yes | no |
| 30 | `radar` | 3×3 | 250 | E 300 kW | – | reveals 7×7 chunks; far scan 1 chunk / 33.3 s | 0 | 0.3 | yes | no |
| 31 | `small-lamp` | 1×1 | 100 | E 5 kW | – | light radius 10 at night | 0 | 0.1 | yes | no |
| 32 | `tree` / `dead-tree` | 1×1 (jittered) | 50 / 20 | – | – | §2.6 | −0.06/min | 0.55 / 0.5 | – | – |
| 33 | `big-rock` | 2×2 | 500 | – | – | §2.7 | 0 | 2 | – | – |
| 34 | `huge-rock` | 3×2 | 2000 | – | – | §2.7 | 0 | 3 | – | – |
| 35 | `biter-spawner` | 4×4 **[simplified from 4.4×4.4]** | 350 | – | – | §7.9 | absorbs | not minable | – | – |
| 36 | `small-biter` | unit 0.4×0.4 | 15 | – | – | §7.9 | – | – | – | – |
| 37 | `medium-biter` | unit 0.6×0.6 | 75 | – | – | §7.9 | – | – | – | – |
| 38 | `big-biter` | unit 0.8×0.8 | 375 | – | – | §7.9 | – | – | – | – |
| 39 | `ground-item` | 1 per tile | – | – | – | holds 1 stack (1 item type) | – | pick up with F | – | – |
| 40 | `player-corpse` | 1×1 | – | – | – | holds full inventory | – | – | – | – |
| 41 | `player` | 0.4×0.4 | 250 | – | – | §3 | – | – | – | – |

Resistances (used by §7.10): stone-wall physical 3/20 %, impact 45/60 %, explosion 10/30 %, fire 0/100 %; stone-furnace fire 0/90 %, explosion 0/30 %, impact 0/30 %; medium-biter physical 4/10 %; big-biter physical 8/10 %; spawner physical 2/15 %, fire 3/60 %. Everything else: none.

### 6.2 Common entity data model

```
Entity {
  id: int, type: string, ax: int, ay: int, dir: 0..3, hp: number,
  // per type:
  slots / lanes / fuel / buffer / state / progress / ...
  status: 'working'|'no_power'|'low_power'|'no_fuel'|'output_full'|'no_ingredients'|'no_recipe'|
          'no_minable_resources'|'no_ammo'|'no_research'|'missing_science_packs'|'waiting_for_source'|
          'waiting_for_space'|'not_connected'|'no_steam'|'no_water'|'no_pair'|'idle'
}
```

Placement validity (`canPlace(type, ax, ay, dir)`): every footprint tile must be inside `MAP_LIMIT`, be land (not water, except the rules for the offshore pump), have `entityGrid == −1`, contain no tree/rock/unit/player collision box, and be within `PLAYER_REACH`. Drills additionally need ≥ 1 ore tile in their mining area. Undergrounds/pipe-to-ground additionally need a partner within range (or are placed as an unpaired end, status "Ni para"). Fast-replace **[P1]**: placing a `fast-transport-belt` over a `transport-belt` (any direction), `steel-furnace` over `stone-furnace`, `iron-chest`/`steel-chest` over a smaller chest, higher-tier inserter over lower, replaces in place keeping contents/items; the old item returns to the inventory.

### 6.3 Chests (`wooden-chest`, `iron-chest`, `steel-chest`)

- 16 / 32 / 48 slots, any item. Inserters and drills insert (first matching stack, then first empty slot); inserters take from the first non-empty slot **[chosen]** (Factorio: any slot).
- GUI: slot grid (§9.6.3) with a slot limit "X" bar: slots beyond the limit are drawn with a red X and are ignored by automated insertion.
- Alt-mode: up to 4 item icons with counts.

### 6.4 Transport belts (`transport-belt`, `fast-transport-belt`)

- Two lanes, left and right relative to travel direction; positions 0…L in 1/256 tile units; `speed` 8 (yellow) or 16 (fast) positions/tick; spacing 64 → max 4 items per lane per straight tile (8 per tile).
- Lane length L: straight tile 256; curved tile inner lane **106**, outer lane **295**. Underground belt end tiles 256; splitter halves 256 each (Factorio 128 + 51 buffer **[simplified]**).
- Shape is derived from neighbours (§7.3.2): straight, curve-left, curve-right; the shape decides sprite and lane lengths.
- Items never fall off the end; they stop at `L` (compress).
- Belts need no power and emit no pollution. The player walks on them and is carried.
- Rotating a belt (R over it) re-orients it; items stay on the tile (positions clamped) **[simplified from "items go to inventory"]**. Picking up a belt returns the belt and all items on it.
- Drag-placing (§9.11): holding LMB and moving the mouse lays belts along the path with automatic turning.

### 6.5 Underground belts (`underground-belt`, `fast-underground-belt`)

- Placed as pairs. First placement creates the **entrance** (facing `dir`); the game searches forward along `dir` up to `max_distance` (yellow 5, fast 7, counted centre-to-centre → max gap 4 / 6 free tiles) for an unpaired end of the same tier facing the same direction and pairs with the nearest. The second placement is auto-flipped to an **exit**. R while holding the item flips entrance/exit; R on a placed end reverses the pair.
- Each end is a 256-position lane pair. Entrance: items enter from the back like a belt; when they reach 256 they are transferred to the partner's lane at position 0 (instant tunnel; the tunnel stores nothing — Factorio's 44-item buffer is **[simplified]** away).
- Exit: items continue out of the front like a belt.
- Side-loading onto an end: only one feeder lane passes (the other hits the hood). Rule: feeder belt pointing into the side of an **entrance** → only the feeder lane nearer to the entrance's back half enters, onto the near lane at position 64; into an **exit** → only the feeder lane nearer to the exit's front half enters, at position 192.
- A pair may pass under anything including water.
- Unpaired end: works as a belt stub of length 256 (items stop), status "Ni para", warning icon.

### 6.6 Splitters (`splitter`, `fast-splitter`)

- 2 wide × 1 deep facing `dir`; left half and right half are each a 256-position lane pair (input from the back of that half, output to the front of that half).
- Routing at position 128 of each half's lane: the item is assigned to an output half by a per-lane alternation flag (`nextOut[lane] ∈ {L, R}`; toggles after each successful assignment). Lanes are preserved (a left-lane item lands on the left lane of the chosen output half). If the chosen half's lane has no 64 gap at position 128, the item goes to the other half; if both are blocked it waits (the flag does not toggle). A 5-item imbalance memory **[simplified]** is not implemented.
- Inputs: two input belts consumed alternately per lane when both have items at their front (`nextIn[lane]` flag).
- Settings **[P2]**: input priority, output priority, filter (one item id, filter side). GUI shows three rows of radio buttons and one filter slot.

### 6.7 Inserters (`burner-inserter`, `inserter`, `long-handed-inserter`, `fast-inserter`)

| Inserter | Pickup tile (facing N) | Drop tile | Half-swing ticks | Cycle ticks | items/s | Energy model |
|---|---|---|---|---|---|---|
| burner | (0, +1) i.e. **behind** | (0, −1) **in front** | 50 | 100 | 0.60 | burner: 50 kJ per movement + 50 kJ per rotation → charged as 100 kJ per full cycle **[simplified]**; fuel buffer; **self-refuels** from carried fuel items |
| inserter | (0, +1) | (0, −1) | 36 | 72 | 0.83 | E: drain 0.4 kW always; while swinging 12.8 kW extra (= 13.2 − 0.4) |
| long-handed | (0, +2) | (0, −2) | 25 | 50 | 1.20 | E: drain 0.4 kW; swinging 18.0 kW extra |
| fast | (0, +1) | (0, −1) | 13 | 26 | 2.31 | E: drain 0.5 kW; swinging 46.2 kW extra |

Note on orientation: an inserter's `dir` is the direction it **drops** toward (front). "Behind" is `dir + 2`.

Hand size 1 (no capacity research in scope). Pickup sources: belt (both lanes, prefers the lane nearest to the inserter for a perpendicular belt, left lane for a parallel belt), underground ends, splitter halves, chest (first non-empty slot), furnace **output**, assembler **output**, lab (science packs — for chaining), turret ammo slot (only if the drop target is another turret), ground item. Drop targets: belt far lane (right lane if the belt is parallel to the inserter) at position 128 if there is a 64 gap; chest; furnace input (smeltable items) or fuel slot (fuel); boiler/burner drill/burner inserter fuel; assembler ingredient slots (only ingredients of the current recipe); lab pack slots; turret ammo; ground (if the target tile is empty ground and free of entities). Insertion limits in §7.4. State machine in §7.4.

### 6.8 Pipes (`pipe`, `pipe-to-ground`)

- Pipe: connects to all 4 neighbours that are pipes/fluid ports; capacity 100. Rendered shape derived from connections (straight/corner/T/cross/end).
- Pipe-to-ground: connects on the back side (normal connection) and underground on the front side to the partner up to 10 tiles away (gap ≤ 9); pair placed like undergrounds. Capacity 100 per pair (the two ends form one shared 100-unit fluid box, matching §7.6's segment-capacity sum; the underground gap between the two ends stores no fluid).
- Segments and fluid rules in §7.6. Players cannot walk over pipes (they block). Placing a pipe that would join two segments with different fluids is refused ("Mešanje tekočin ni dovoljeno").

### 6.9 Electric poles (`small-electric-pole`, `medium-electric-pole`)

- Supply area: square centred on the pole, side 5 (small) / 7 (medium) tiles. Wire reach 7.5 / 9 tiles centre-to-centre (Euclidean); two poles connect when the distance ≤ min(reach₁, reach₂).
- On placement: auto-connect to up to 5 nearest poles in reach (skip a candidate if it would form a triangle with two already-connected poles — **[P2]**, plain nearest-5 is acceptable).
- A consumer/generator is in the network if **any** of its tiles is inside any supply square of a pole of that network.
- GUI (click on a pole): electric network panel (§9.6.9). Preview shows supply square (blue) and wires to reachable poles. Drag-placing poles: auto-place one at maximum reach along the drag.
- Copper wires are drawn as sagging lines between connected poles (always).

### 6.10 Offshore pump

- 1×1 on a land tile; the tile in front (direction `dir`) must be water; the pipe connection is on the back side. Placement preview green only where valid.
- Produces 20 water/tick into its segment (cap by segment capacity). No power, no fuel. Fluid box 100.
- GUI: fluid bar "Voda N/100", "Črpanje 1200/s".

### 6.11 Boiler

- 3 wide × 2 deep facing N. Back row (south) holds the **water** box (200): pass-through connections at the **west end** and **east end** of the back row (tiles `(ax, ay+1)` west side and `(ax+2, ay+1)` east side) so boilers chain side by side. Front row centre tile `(ax+1, ay)` has the **steam** output (200) pointing north.
- Burner 1.8 MW = 30 000 J/tick. Per tick while it has fuel energy, ≥ 1 water in the water segment and room for 1 steam in the steam segment: consume 1 water, produce 1 steam (165 °C), burn 30 000 J. Coal lasts 133.3 ticks (2.22 s). Pollution 30/min → 0.5 PU/s ×activity.
- Statuses: working / no_fuel / no water ("Ni vode") / output full ("Para polna").
- GUI (§9.6.7): fuel slot + heat bar, water bar, steam bar, "Poraba energije 1,8 MW".

### 6.12 Steam engine

- 3×5, orientation N or E (S/W are the same shape). Steam ports (in/out, pass-through) at the centre of both short ends → chainable end to end. Fluid box 200 (part of the steam segment).
- Per tick the electric network asks it for `E ≤ 15 000 J` (900 kW). It consumes `E / 30 000 · 1` steam units (0.5 units/tick at full load) if available; otherwise it delivers what the steam covers. Steam temperature is always 165 °C in Factio (no heat exchangers) so 1 steam unit = 30 kJ.
- Statuses: working / not connected ("Ni priključen na omrežje") / no steam ("Ni pare"). GUI: "Izhodna moč N kW / 900 kW" bar, steam bar.

### 6.13 Mining drills

| | burner-mining-drill | electric-mining-drill |
|---|---|---|
| Footprint | 2×2 | 3×3 |
| Mining area | its own 2×2 | 5×5 (footprint + 1 ring) |
| Rate | `0.25 / mining_time` = 0.25 ore/s | 0.5 ore/s |
| Energy | 150 kW burner = 2 500 J/tick while mining | 90 kW = 1 500 J/tick while mining + 50 J/tick drain |
| Output tile (facing N) | tile in front of the **left column**: `(ax, ay − 1)` | tile in front of the **centre column**: `(ax + 1, ay − 1)` |
| Pollution | 12/min | 10/min |

Mining: progress per tick `+= mining_speed / mining_time / 60 × satisfaction`; at ≥ 1: pick the next ore tile in the area by round-robin among tiles with amount > 0 **[chosen]**, subtract 1, create the item, subtract 1 from progress. Output placement: if the output tile holds a belt/underground/splitter → **near lane** (the lane on the drill's side for a perpendicular belt; for a belt running parallel to the drill's direction use the belt's right lane **[chosen]**) at position 128 if a 64 gap exists; if it holds a chest/furnace/assembler/lab/turret → insert if accepted (furnace input for ore, chest any); if it is empty ground → drop a `ground-item` (one per tile; the drill then waits until it is gone); otherwise the drill waits with `output_full` (yellow light), holding the item in a 1-item output buffer. When the whole area is empty: `no_minable_resources` (red). Placement requires ≥ 1 ore tile in the area. GUI shows "Pričakovana ruda: <icon> N" (sum of amounts in the area), progress bar, and for the burner drill the fuel slot + heat bar. Two burner drills facing each other on coal refuel each other (output tile = the other drill → fuel slot).

### 6.14 Furnaces (`stone-furnace`, `steel-furnace`)

- Slots: input (1), fuel (1), output (1). Crafting speed 1 / 2. 90 kW burner = 1 500 J/tick while smelting.
- Recipe auto-selected from the input item: iron-ore → iron-plate, copper-ore → copper-plate, stone → stone-brick (needs 2), iron-plate → steel-plate (needs 5, only if `steel-processing` researched — otherwise iron plates are refused as input). Inserting an item that is not smeltable, or a different smeltable while the input slot holds another type, is refused. A different product cannot start until the output slot is empty of the previous product (output holds one item type, up to its stack size).
- Craft start: when input ≥ ingredient count and (output empty or same product with room) → consume input, progress = 0. Progress per tick `+= speed / recipe_time / 60` while fuel energy is available (burn 1 500 J/tick; when the energy buffer is < 1 500 J take one fuel item from the fuel slot: +4 000 000 J for coal, +2 000 000 J for wood). At progress ≥ 1 → product to output.
- Statuses: working / no_fuel / output_full / no_ingredients (idle). GUI §9.6.1.

### 6.15 Assembling machines (`assembling-machine-1`, `assembling-machine-2`)

- Recipe chosen by the player (recipe picker §9.6.2). Ingredient slots = one per ingredient, output slot 1. AM1 speed 0.5 (75 kW + 2.5 kW drain), AM2 speed 0.75 (150 kW + 5 kW). No ingredient count limit. AM2 fluid recipes: none exist in Factio, so AM2 is just faster.
- Craft start when every ingredient slot has ≥ its amount and the output can hold the result: consume ingredients, progress = 0. Progress per tick `+= speed / recipe_time / 60 × satisfaction`; drain always; consumption only while crafting.
- Changing the recipe returns all slot contents to the player (spill to ground if no room).
- Inserter insertion limit per ingredient: `crafts = clamp(1 + ceil(1.166 / (recipe_time / speed)), 2, 100)`, limit = `crafts × amount`. Player insertion unlimited (up to stack).
- Statuses: no_recipe / no_ingredients / working / output_full / no_power / low_power. Alt-mode: recipe product icon centred on the machine.

### 6.16 Lab

- 3×3, 60 kW (+2 kW drain), research speed 1. Two pack slots (automation, logistic), one item type each, up to a stack.
- Works when a technology is being researched and the lab holds ≥ 1 of every pack the technology needs. Progress per tick `+= labSpeed / unit_time / 60 × satisfaction`; at 1 unit: consume one of each pack, `tech.unitsDone += 1`. Multiple labs work in parallel on the same tech. Inserter limit: `units = clamp(1 + ceil(1.166 / unit_time), 2, 100)` packs of each type. Inserters may take packs out of a lab (chaining).
- Statuses: no_research / missing_science_packs / working / no_power. GUI §9.6.4.

### 6.17 Gun turret

- 2×2, 400 HP, range 18 tiles (from the turret centre), cooldown 6 ticks (10 shots/s) × `1/(1 + bulletSpeed)`, rotation 0.015 turns/tick (≈ 67 ticks per 360°) — the turret must face the target within ±5° before firing **[simplified visual, may be skipped: instant aim P2]**. 1 ammo slot; inserters fill up to 10 magazines; player up to a stack. Each shot consumes 1 round (10 per magazine). Damage per shot = ammo damage (5 firearm, 8 piercing) × (1 + bulletDamage) × (1 + turretDamage). Target = nearest enemy unit or spawner within range; retargets when the target dies or leaves range.
- No power. Status: working (target) / idle / no_ammo (red icon + alert). GUI: ammo slot + bar, "Ubojev: N".
- Placement/hover preview shows the range circle (translucent red).

### 6.18 Stone wall

- 1×1, 350 HP, resistances above. Blocks movement of the player and biters and blocks building. Joins visually with neighbours (straight/corner/T/cross variants). Biters attack walls only when they block their path (§7.9.6). Repair with a repair pack (§6.22).

### 6.19 Radar **[P1]**

- 3×3, 300 kW continuous (no work → no draw; at satisfaction < 1 scanning slows proportionally). Continuously charts 7×7 chunks centred on its chunk. Far scan: accumulates `5 000 J/tick × satisfaction` energy; every 10 MJ (33.3 s) it charts one uncharted chunk within a 29×29-chunk square, spiralling outward, and generates it if needed.

### 6.20 Small lamp **[P2]**

- 1×1, 5 kW; when powered (satisfaction > 0) and it is night (§11.9) it draws a light disc of radius 10 tiles that cancels the night overlay.

### 6.21 Player weapons & ammo

See §3. `pistol` range 15, 4 shots/s; `submachine-gun` range 18, 10 shots/s. `firearm-magazine` 10 rounds × 5 physical; `piercing-rounds-magazine` 10 rounds × 8 physical.

### 6.22 Repair pack **[P1]**

- Item with durability 300; hold it in the cursor and hold LMB over a damaged own entity: restores 2 HP per durability point at 20 durability/s (= 40 HP/s) **[chosen rate]**. One pack = 600 HP. Consumed when durability hits 0.

### 6.23 Ground items

- `ground-item`: one per tile, one item type, count ≤ stack. Created by drills/inserters dropping on empty ground, by the player pressing Z (drop 1 from cursor at the cursor tile, within reach) and by full-inventory overflow. Picked up by the player with **F** (all ground items within 1 tile) or automatically by walking over them **[P2]**, and by inserters whose pickup tile holds one. Blocks nothing; rendered as a small icon.

### 6.24 Enemies

See §7.9 for stats and behaviour.

---

## 7. Simulation specification

### 7.1 Game loop

```
requestAnimationFrame(frame):
  budget += min(frameDelta, 250 ms)           // clamp to avoid a spiral after tab switches
  steps = 0
  while budget >= 16.667 ms and steps < 5:    // hard cap 5 ticks per frame
      tick(); budget -= 16.667; steps++
  if steps == 5: budget = 0                   // drop the backlog, game slows instead of freezing
  render(alpha = budget / 16.667)             // alpha used only for player/camera interpolation
```

`visibilitychange` → hidden: pause simulation and zero the budget; on return resume (the game does not simulate offline). Pause menu (Esc) freezes ticks.

### 7.2 Tick order

Every `tick()` runs these phases in this order (a phase may be skipped when its active set is empty):

| # | Phase | Notes |
|---|---|---|
| 1 | Input & player | apply movement, mining progress, cursor actions queued by the UI thread, hand-crafting queue (1 tick of progress on the head recipe) |
| 2 | Electric networks | compute this tick's supply/demand from the **requests registered during the previous tick** and set `network.satisfaction` (§7.5). Generators (steam engines) consume steam here. |
| 3 | Fluids | offshore pumps push water; boilers convert (needs fuel + satisfaction-independent); segment amounts clamp (§7.6). |
| 4 | Machines | drills, furnaces, assemblers, labs, radars, lamps in **entity-id order** (deterministic). Each electric machine registers its energy request for phase 2 of the next tick. |
| 5 | Inserters | state machines (§7.4), in entity-id order |
| 6 | Belts | lines updated downstream-first (§7.3.3) |
| 7 | Combat | turrets pick targets & shoot; player shooting; projectiles are instant (hitscan) **[simplified]**; damage & death; corpses |
| 8 | Enemies | spawner idle spawning, attack banks, unit groups, unit AI/movement (§7.9) |
| 9 | Pollution & evolution | every 64 ticks (tick % 64 == 0): §7.7; evolution time term every 60 ticks |
| 10 | Research | if the current tech's `unitsDone ≥ unitCount`: complete, apply unlocks, pop the queue, alert |
| 11 | Bookkeeping | alerts expiry, statistics, autosave timer, chunk generation queue (max 2 chunks per tick) |

Using the previous tick's requests for satisfaction introduces a 1-tick lag, which is invisible.

Active sets: every entity type keeps a `Set` of entities that may need work (e.g. a furnace with an empty input and nothing incoming sleeps until an inserter/drill/player touches it). Simplest correct rule: an entity is put in the active set whenever any of its slots/buffers/neighbours change; it removes itself when it detects it can make no progress. Belt lines are always active while they hold ≥ 1 item.

### 7.3 Belt model

#### 7.3.1 Data

```
BeltTile { type, dir, shape: 'straight'|'curveL'|'curveR'|'ug_in'|'ug_out'|'split_L'|'split_R',
           lanes: [Lane, Lane],   // 0 = left, 1 = right (relative to dir)
           line: LineRef, partner (undergrounds) }
Lane   { len: 256|106|295, items: [ {item: itemId, pos: int} ... ] sorted by pos ascending (pos = distance travelled along the lane) }
```

Which lane is inner on a curve: `curveR` (belt turns clockwise) → right lane (index 1) is inner (len 106), left is outer (295); `curveL` → the opposite.

#### 7.3.2 Topology (recomputed for the 3×3 neighbourhood of any placed/removed belt-like entity)

For a belt tile T facing `dir`:
- `front(T)` = the tile ahead. T **feeds** `front(T)` if that tile is a belt whose direction is not opposite to `dir`, an underground entrance facing `dir`, or a splitter half facing `dir` (entering from its back).
- Feeders of T: tiles adjacent to T that feed T. `back feeder` = the tile behind T facing `dir`; `side feeders` = the tiles left/right of T facing into T.
- Shape: if there is a back feeder → `straight` (side feeders side-load). Else if exactly one side feeder → curve toward it (`curveL` if the feeder is on T's left). Else `straight` (side feeders, if two, side-load).
- Underground ends and splitter halves are always `straight` shaped for lane purposes; side feeders into them side-load with the single-lane rule (§6.5).
- Lane hand-off `straight → straight`: lane i → lane i. `curve`: lane i → lane i (lanes preserved). Side-load: both feeder lanes → target's near lane, inserted at target position 128 (needs a 64 gap: no target item with pos in (64, 192)).

#### 7.3.3 Lines and update order

A **line** is a maximal chain of belt tiles where each tile feeds the next from the back and the next has no other back feeder (side-loads break lines; splitters and underground tunnels are line boundaries). Lines are rebuilt lazily for the affected tiles after any belt change. Each tick, belt lines are processed in a **topological order** so that a line is updated after the line it feeds (side-load feeders after their target). Cycles (loops) are cut deterministically at the tile with the lowest `(ay × 8192 + ax)` among the loop's tiles; the resulting ≤ 12.5 % throughput loss at that one point is accepted **[simplified]**. Within a line, tiles are processed from the **last tile to the first**, and within a lane items from the front-most (largest pos) to the rear-most.

#### 7.3.4 Movement

For lane `ln` of tile `T` with speed `v`, for item `k` from the last index to 0:

```
target = item.pos + v
limitByNext = (k < last) ? items[k+1].pos − 64 : +∞
if k == last and target > ln.len:                        // wants to leave the tile
    overshoot = target − ln.len
    dest = handoff(T, laneIndex)                          // next tile's lane per §7.3.2, or null at an end
    if dest and (dest.items.length == 0 or dest.items[0].pos ≥ overshoot + 64):
        remove item from ln; insert at dest front with pos = overshoot; continue
    else: target = ln.len                                  // stop at the end
item.pos = min(target, limitByNext)
```

Side-loading is handled by the feeder's hand-off: `dest` = target's near lane, and the insertion is at `pos = 128` (the overshoot is discarded) provided the gap rule around 128 holds; otherwise the feeder item stops at its lane end. For an underground entrance, the front-most item at 256 is moved to the partner exit's lane at `pos = 0` under the same gap rule; if there is no partner the item stops. Splitter routing (§6.6) happens when an item on a splitter half crosses pos 128: it is re-homed to the chosen output half's lane at the same pos (needs a 64 gap there), or stays until possible.

Throughput check: v = 8, spacing 64 → 8 items per 64 ticks per lane = 7.5/s per lane, 15/s per belt. ✓

#### 7.3.5 Inserter/drill interaction points

- Drop at pos 128 of a lane: allowed if no item in that lane has `pos ∈ (64, 192)`.
- Pickup: any item on the preferred lane; choose the one with the largest pos ≤ 192 (so items just placed are not immediately re-picked) else any; fall back to the other lane.
- Items on a belt tile can also be picked up by the player: clicking a belt with an empty cursor opens no GUI; Ctrl+click **[P2]** grabs the items on that tile.

### 7.4 Inserter state machine

```
states: WAIT_PICKUP → SWING_TO_DROP → WAIT_DROP → SWING_TO_PICKUP → WAIT_PICKUP ...
fields: state, t (ticks remaining in the swing), hand (item id or null), energyBuffer (burner), angle (rendering)
```

| State | Each tick |
|---|---|
| `WAIT_PICKUP` | Determine candidate item at the pickup tile: for a machine output/chest/lab: the first item; for a belt: per §7.3.5; ground item; nothing → status `waiting_for_source`. **Before taking**, check `dropTarget.canAccept(item)` (§7.4.1); if refused, do not pick (try other items in a chest/belt lane; else wait). For a burner inserter with `energyBuffer < 100 kJ`: if the candidate is fuel, it eats it first (own fuel slot), then continues. Take the item → `hand = item`, `state = SWING_TO_DROP`, `t = halfSwing`. |
| `SWING_TO_DROP` | Electric: needs energy; `t −= satisfaction` (fractional accumulation), status `low_power` if < 1. Burner: `energyBuffer −= 100 000 / halfSwing / 2` per tick; if empty → `no_fuel` and it stalls (it can still leech: if the hand holds fuel it may consume it — Factorio does this only from picked items; **[simplified]** the burner inserter refuels from its hand item only when the buffer is 0 and the item is fuel and the drop target is not a fuel slot). When `t ≤ 0` → `WAIT_DROP`. |
| `WAIT_DROP` | Try to insert the hand item into the drop target (§7.4.1). Success → `hand = null`, `state = SWING_TO_PICKUP`, `t = halfSwing`. Failure → status `waiting_for_space`, retry next tick (never re-picks). |
| `SWING_TO_PICKUP` | as SWING_TO_DROP; at `t ≤ 0` → `WAIT_PICKUP`. |

Energy request for electric inserters: `drain/60` always + `(maxPower − drain)/60` while in a SWING state. If satisfaction is 0 the inserter freezes holding its item.

#### 7.4.1 `canAccept(target, item)` and insertion limits

| Target | Accept rule / automated limit |
|---|---|
| belt lane | gap rule at pos 128 |
| chest | a slot with the same item and room, or an empty slot below the slot limit |
| furnace | fuel item → fuel slot if `count < 5`; smeltable item → input slot if empty or same item and `count < limit` where `limit = crafts × amount`, `crafts = clamp(1 + ceil(1.166 / (recipe_time / speed)), 2, 100)` (stone furnace iron ore: 1 + ceil(1.166/3.2) = 2 → 2 ore) |
| boiler, burner drill, burner inserter | fuel only, `count < 5` |
| assembler | ingredient of the current recipe, `count < crafts × amount` (AM1 gears: craft 1 s → 1 + 2 = 3 crafts → 6 plates) |
| lab | science pack of a slot type, `count < units` with `units = clamp(1 + ceil(1.166 / unit_time), 2, 100)` |
| gun turret | magazine, `count < 10` |
| ground | tile empty and no entity |
| player-corpse, spawner, tree, rock, pole, pipe, engine, pump, wall, lamp, radar | never |

### 7.5 Electricity network

- **Networks**: union-find over poles connected by wires; rebuilt on pole placement/removal (incremental union on add, full rebuild of the affected component on remove). Each network keeps `consumers` and `generators` sets, derived from supply-area coverage; an entity's network membership is recomputed when it or a pole within 4 tiles changes. An entity covered by poles of two different networks is attached to the one whose pole was placed first **[chosen]**; networks merge when a wire joins them.
- **Per tick (phase 2)** for each network:
  ```
  D  = Σ consumer requests registered last tick (J)          // consumption/60 + drain/60 per consumer
  // G is computed per steam fluid-segment, never per engine: engines are chainable end to end
  // (§6.12) and the recommended 1 boiler : 2 engines ratio (§9.13, §13.3) means multiple engines
  // routinely share one segment's buffered steam, so summing a per-engine "steamAvailable" would
  // count that same buffered steam once per engine sharing it.
  for each distinct steam segment S with ≥ 1 engine in this network:
      nEngines(S)      = number of this network's engines on segment S
      segmentSupply(S)  = min(S.amount × 30000, nEngines(S) × 15000)   // J this tick: capped by both
                                                                        // the segment's buffered steam
                                                                        // and its engines' combined draw
  G  = Σ_segments segmentSupply(S)                              // J this tick
  delivered = min(D, G)
  satisfaction = D > 0 ? delivered / D : 1
  each engine draws its share from its own segment's `segmentSupply(S)` only: split
  `segmentSupply(S) × satisfaction` equally among S's engines (capped at 15000 and at the
  engine's own steam pull for the tick), redistributing a segment's leftover share among its
  own under-supplied engines in a second pass — never across segments, so a lightly-buffered
  segment cannot draw on another segment's steam.
  ```
  Consumers read `network.satisfaction` (clamped 0..1) in phases 4–5 and scale their progress by it; drain is always requested so a browned-out machine may make zero progress.
- No solar/accumulators, so priority handling reduces to the formula above.
- Statuses: a consumer with no network → `not_connected` (red plug icon); satisfaction < 1 → `low_power` (yellow); satisfaction = 0 with a network → `no_power` (red bolt).
- **Network GUI** (click a pole): satisfaction bar (green ≥ 100 %, yellow < 100 %, red < 50 %), production `delivered/G_max`, lists of consumer types (count × kW) and producers, 1-minute history sparkline **[P2]**.

### 7.6 Fluid model (water, steam)

- **Segment** = connected component of fluid boxes (pipes, pipe-to-ground pairs, offshore pump box, boiler water boxes, boiler steam boxes, engine boxes) linked through matching connections. Each segment: `fluid ∈ {null, 'water', 'steam'}`, `amount`, `capacity = Σ box capacities` (pipe 100, pipe-to-ground pair 100, pump 100, boiler water 200, boiler steam 200, engine 200). Rebuilt by flood fill when any fluid entity is placed/removed (only the affected segments).
- Fluid is instantly available anywhere in the segment; every box shows the same fill fraction (`amount/capacity`) in GUIs.
- Per tick: pump `amount += min(20, capacity − amount)` on its water segment (sets `fluid = 'water'`). Boiler: needs `waterSeg.amount ≥ 1` and `steamSeg.amount < steamSeg.capacity` and fuel; moves 1 unit. Engine: pulls `E/30000` units from its steam segment as computed in §7.5. Per-connection limit 100 units/tick — never binding here, may be ignored.
- Mixing: placing a pipe/entity that would connect a water segment to a steam segment is refused. A segment's fluid resets to `null` when its amount reaches 0 **[chosen]** (Factorio keeps the type; this avoids "flush" UI). Removing an entity drops the fluid in its boxes.
- Boiler water pass-through: the two water connections belong to the same water box, so a chain of boilers shares one water segment automatically.
- Ratio checks: 1 pump (1200/s) feeds 20 boilers (60/s each); 1 boiler (60 steam/s) feeds 2 engines (30/s each) = 1.8 MW. ✓

### 7.7 Pollution

- Per chunk `pollution` float ≥ 0. Every 64 ticks:
  ```
  for each generated chunk:
      emit  = Σ_entities emissions_per_minute × activity(0..1 average over the last 64 ticks) × (64 / 3600)
      absorb = 64 × ( Σ_tiles absorption_per_second + Σ_trees stageAbsorb + Σ_deadTrees 0.0001 )
      pollution = max(0, pollution + emit − absorb)
      for each spawner in chunk: if pollution > 20: take = 20 + 0.01 × pollution; pollution −= take; spawner.bank = min(spawner.bank + take, 3 × mostExpensiveSpawnableCost)
  then diffusion (using the values before diffusion): for each chunk with pollution ≥ 15: give 0.02 × pollution to each of its 4 neighbours (generate neighbours lazily only if they already exist; pollution flowing into non-generated chunks accumulates in a sparse map and is applied when the chunk is generated **[chosen]**).
  ```
- Activity: machines accumulate `activeTicks` while working; `activity = activeTicks / 64` then reset.
- Absorption per tile per second: water 0.000025, grass/dry grass/dirt 0.000018, sand/red desert 0.000015 (a full grass chunk absorbs 1.106 PU/min); trees per §2.6. Tree damage per §2.6.
- Evolution contribution: every 64-tick update adds `Σ emit × 0.0000009` to `evoTotal`.
- Map overlay: chunks with pollution ≥ 50 are tinted red on the map/minimap with alpha `clamp((p − 50)/100, 0.15, 0.6)` (display floor 50, cap 150).

### 7.8 Evolution factor

```
evoTotal += 0.000004 per second (every 60 ticks)     // time factor
evoTotal += 0.0000009 × pollutionProduced             // pollution factor (§7.7)
evoTotal += 0.002 per spawner destroyed                // destroy factor
evolution = evoTotal / (1 + evoTotal)                  // displayed 0..1
```

Unlocks: medium biters from 0.20, big biters from 0.50 (weight tables §7.9.3). Time-only: 1 h → 1.4 %, 3 h → 4.1 %. A polluting 3-hour factory typically reaches 10–20 %.

### 7.9 Enemies

#### 7.9.1 Units

| | small-biter | medium-biter | big-biter |
|---|---|---|---|
| HP | 15 | 75 | 375 |
| Regeneration | 0.01 HP/tick | 0.01 | 0.02 |
| Melee damage (physical) | 7 | 15 | 30 |
| Attack cooldown | 35 ticks (1.71/s) | 35 | 35 |
| Attack range (box to box) | 0.5 | 1.0 | 1.5 |
| Speed | 0.2 tiles/tick (12/s) | 0.24 (14.4/s) | 0.23 (13.8/s) |
| Resistances | – | physical 4/10 %, explosion 0/10 % | physical 8/10 %, explosion 0/10 % |
| Collision box | 0.4×0.4 | 0.6×0.6 | 0.8×0.8 |
| Pollution cost to join an attack | 4 | 20 | 80 |
| `spawning_time_modifier` | 1 | 1 | 3 |
| Earliest evolution | 0 | 0.20 | 0.50 |
| Sprite scale | 0.5 | 0.7 | 1.0 |

Common: vision 30 tiles, `min_pursue_time` 600 ticks, `max_pursue_distance` 50 tiles, distraction cooldown 300 ticks. Corpses: decorative sprite fading over 10 s **[simplified]**.

#### 7.9.2 Spawner (`biter-spawner`)

- 4×4, 350 HP, regen 0.02 HP/tick, resistances physical 2/15 %, fire 3/60 %. Not minable; destroying it gives +0.002 evoTotal.
- Owns ≤ 7 idle units. Idle spawning: every `lerp(360, 150, evolution) × spawning_time_modifier` ticks, if owned < 7 and fewer than 5 friendly units stand within 10 tiles, spawn one unit (type by §7.9.3) at a random free land tile within 10 tiles.
- Attack bank: `bank` filled by pollution absorption (§7.7). Every 64 ticks: while `bank ≥ cost(next unit type by weights)`: `bank −= cost`, spawn the unit and add it to the spawner's current **gathering group** (create one if none). Cap: 30 gathering groups on the map, 200 units per group.
- Call for help: when damaged, every owned unit within 50 tiles attacks the attacker.

#### 7.9.3 Spawn weight table (biter spawner)

Weight for a type at evolution `e` = piecewise-linear interpolation of its points (0 before the first point, constant after the last); probability = weight / Σ.

| Unit | Points (e, w) |
|---|---|
| small-biter | (0.0, 0.3) (0.6, 0.0) |
| medium-biter | (0.2, 0.0) (0.6, 0.3) (0.7, 0.1) |
| big-biter | (0.5, 0.0) (1.0, 0.4) |

Resulting shares small/medium/big: e = 0.2: 100/0/0; 0.3: 66.7/33.3/0; 0.4: 40/60/0; 0.5: 18.2/81.8/0; 0.6: 0/78.9/21.1; 0.7: 0/38.5/61.5.

#### 7.9.4 Attack groups

1. A group gathers at a rally point 8 tiles from its spawner **[chosen]** for `gatherTime = rand(3600, 36000)` ticks (1–10 min). After that it accepts late members for up to 7200 ticks (2 min) then launches (if it has ≥ 1 unit).
2. **Target**: the group walks toward pollution: at each chunk boundary it picks the neighbouring chunk with the highest pollution (ties → toward spawn); when it enters a chunk containing player entities it switches to "attack": target = the nearest player entity in the chunk, preferring (a) military targets (player, turret) within 30 tiles, (b) polluters (drills, furnaces, boilers, assemblers), (c) anything else. If no path progress is made for 120 ticks (blocked by a wall/building), the blocking entity becomes the target.
3. Movement **[simplified path-finding]**: units steer straight toward their target with separation (radius 1.2, force 0.005) and slide along blocking entities; a unit that collides with a player-force entity for > 30 ticks attacks it; water is avoided by a 4-direction A* on the chunk grid **[P1]** (P0: treat water as blocking and let units slide; attack groups spawn on land within 200–700 tiles so lakes rarely matter). Group cohesion: members behind the group centre move at 140 %, ahead at 60 % **[P2]**.
4. After destroying its target the group picks the next nearest player entity within 30 tiles; if none, it retreats to its spawner (or despawns after 5 min if the spawner is gone).
5. **Retaliation**: any damaged unit attacks its attacker (pursue ≥ 10 s, ≤ 50 tiles from where it was hit, then return).
6. Walls: attacked only when blocking (rule 2) or when nothing else is in vision. Big biters (range 1.5) can hit a target directly behind a single wall row.

#### 7.9.5 Base placement (map generation)

For every chunk whose centre distance `d > 200`: `intensity = min(d, 2400)/325`; `p_base = (10 + 3·intensity) × 0.001024 × ENEMY_FREQ` (`ENEMY_FREQ = 1`). If `hash(seed, cx, cy, "base") < p_base`: base centre = chunk centre + jitter (±8); `nSpawners = 2 + floor(3 × min(d, 2400)/2400)` (2–5); place them at random points within 15 tiles, ≥ 6 tiles apart, whole footprint on land; each starts with 7 small biters idle around it. A base's spawners share nothing else. Spawners never regenerate once destroyed (no expansion).

#### 7.9.6 Damage formula

```
resist(D, flat R, pct P): if D > R + 1: (D − R) × (1 − P)  else if D > 1: (1 − P) / (R − D + 2)  else: (1 − P) / (R + 1)
```

Small biter vs wall: (7 − 3) × 0.8 = 3.2 per bite → 5.5 DPS; 10 biters ≈ 6.4 s per wall tile. Turret (50 DPS yellow) kills a small biter in 0.3 s, a medium in 1.7 s (after its 4/10 % resistance: (5−4)×0.9 = 0.9 per bullet → 9 DPS! — piercing rounds: (8−4)×0.9 = 3.6 → 36 DPS). This is the intended pressure to research Military 2 and damage upgrades.

### 7.10 Combat resolution

- Hitscan: a shot immediately applies damage to the target; a tracer line is drawn for 3 ticks. Player and turret shots use the same damage/rate bonuses (player: bullet bonuses only).
- Entities at 0 HP are destroyed: contents are lost (chests spill nothing **[simplified]**), belts drop their items, an alert `entity_destroyed` is raised. Units die and leave a corpse sprite. Spawners die → evolution +0.002, owned units become ownerless (they finish their current behaviour then wander/idle).
- Player damage: red screen flash (`damage tint` 0.12 red alpha), HP bar; regeneration pause 10 s.
- `entity_under_attack` alert when an own entity takes damage (10 s), `turret_fire` when a turret shoots (5 s), `turret_out_of_ammo` when a turret's slot empties.

### 7.11 Research

- One active technology at a time plus a queue of up to 7 (`Shift+click` adds to the queue, click starts/prepends). Partial progress is kept per technology when switching.
- `T = unit_time × unit_count / (labs × labSpeed)`; `labSpeed = 1 + researchSpeedBonus` (0.2 after RS1, 0.5 after RS2).
- Completion applies `effects`: recipe unlocks (recipes become visible in the crafting menu and assembler picker), bonuses (`miningBonus += 1`, `inventoryBonus += 10`, `bulletDamage += x`, `turretDamage += x`, `bulletSpeed += x`, `labSpeedBonus += x`).
- HUD: current research icon + progress bar (top-right); "Raziskava končana: <name>" toast + sound (WebAudio beep, §11.10).

---

## 8. Technology tree

23 technologies. Cost = `units × (packs per unit)`, `Time` = seconds per unit at lab speed 1. `Lab-s` = total single-lab seconds. R = automation (red) pack, G = logistic (green) pack. Costs and times are the 1.1.110 values; the only deviation is `electronics`, which in 1.1 unlocks nothing — Factio gives it the 2.0 radar and repair-pack unlocks so the tech is not a dead gate **[chosen]**.

### 8.1 Red-only tier

| id | Slovenian name | English name | Cost | Time | Lab-s | Prerequisites | Effects |
|---|---|---|---|---|---|---|---|
| `automation` | Avtomatizacija | Automation | 10 R | 10 | 100 | – | unlock `assembling-machine-1`, `long-handed-inserter` |
| `logistics` | Logistika | Logistics | 20 R | 15 | 300 | – | unlock `underground-belt`, `splitter` |
| `optics` | Optika | Optics | 10 R | 15 | 150 | – | unlock `small-lamp` |
| `steel-processing` | Predelava jekla | Steel processing | 50 R | 5 | 250 | – | unlock `steel-plate`, `steel-chest` |
| `logistic-science-pack` | Logistični znanstveni paket | Logistic science pack | 75 R | 5 | 375 | – | unlock `logistic-science-pack` |
| `military` | Vojska | Military | 10 R | 15 | 150 | – | unlock `submachine-gun` |
| `gun-turret` | Strelna kupola | Gun turret | 10 R | 10 | 100 | – | unlock `gun-turret` |
| `stone-wall` | Kamniti zid | Stone wall | 10 R | 10 | 100 | – | unlock `stone-wall` |
| `electronics` | Elektronika | Electronics | 30 R | 15 | 450 | `automation` | unlock `radar`, `repair-pack` |
| `fast-inserter` | Hitri vstavljalnik | Fast inserter | 30 R | 15 | 450 | `electronics` | unlock `fast-inserter` |
| `steel-axe` | Jeklena sekira | Steel axe | 50 R | 30 | 1500 | `steel-processing` | `miningBonus += 1.0` (hand mining ×2) |
| `physical-projectile-damage-1` | Fizična škoda izstrelkov 1 | Physical projectile damage 1 | 100 R | 30 | 3000 | `military` | `bulletDamage += 0.10`, `turretDamage += 0.10` |
| `weapon-shooting-speed-1` | Hitrost streljanja 1 | Weapon shooting speed 1 | 100 R | 30 | 3000 | `military` | `bulletSpeed += 0.10` |

### 8.2 Red + green tier

| id | Slovenian name | English name | Cost | Time | Lab-s | Prerequisites | Effects |
|---|---|---|---|---|---|---|---|
| `automation-2` | Avtomatizacija 2 | Automation 2 | 40 R + 40 G | 15 | 600 | `electronics`, `steel-processing`, `logistic-science-pack` | unlock `assembling-machine-2` |
| `advanced-material-processing` | Napredna predelava materialov | Advanced material processing | 75 R + 75 G | 30 | 2250 | `steel-processing`, `logistic-science-pack` | unlock `steel-furnace` |
| `electric-energy-distribution-1` | Distribucija električne energije 1 | Electric energy distribution 1 | 120 R + 120 G | 30 | 3600 | `electronics`, `steel-processing`, `logistic-science-pack` | unlock `medium-electric-pole` |
| `logistics-2` | Logistika 2 | Logistics 2 | 200 R + 200 G | 30 | 6000 | `logistics`, `logistic-science-pack` | unlock `fast-transport-belt`, `fast-underground-belt`, `fast-splitter` |
| `military-2` | Vojska 2 | Military 2 | 20 R + 20 G | 15 | 300 | `military`, `steel-processing`, `logistic-science-pack` | unlock `piercing-rounds-magazine` |
| `toolbelt` | Pas za orodje | Toolbelt | 100 R + 100 G | 30 | 3000 | `logistic-science-pack` | `inventoryBonus += 10` |
| `research-speed-1` | Hitrost raziskav 1 | Lab research speed 1 | 100 R + 100 G | 30 | 3000 | `automation-2` | `labSpeedBonus += 0.20` |
| `research-speed-2` | Hitrost raziskav 2 | Lab research speed 2 | 200 R + 200 G | 30 | 6000 | `research-speed-1` | `labSpeedBonus += 0.30` |
| `physical-projectile-damage-2` | Fizična škoda izstrelkov 2 | Physical projectile damage 2 | 200 R + 200 G | 30 | 6000 | `physical-projectile-damage-1`, `logistic-science-pack` | `bulletDamage += 0.10`, `turretDamage += 0.10` |
| `weapon-shooting-speed-2` | Hitrost streljanja 2 | Weapon shooting speed 2 | 200 R + 200 G | 30 | 6000 | `weapon-shooting-speed-1`, `logistic-science-pack` | `bulletSpeed += 0.20` |

Totals: red-only tier 505 R; red+green tier 1 255 R + 1 255 G. Everything is researchable in any order subject to prerequisites; the tech screen draws the tree in 3 columns (no prereq → depends on red techs → red+green).

### 8.3 Tech data schema

```
{ id, cost: { units, time, packs: ['automation-science-pack', 'logistic-science-pack'?] },
  prereqs: [ids], effects: [ {type:'unlock-recipe', recipe} | {type:'bonus', key, value} ], icon: itemId-or-custom }
```

---

## 9. UI / UX

All UI is HTML/CSS layered over the canvas (DOM windows are fine for GUIs; the world is canvas). Slot size 40 px, 10 columns per inventory row. Fonts: system sans-serif; captions #FFE6C0 on #313031 panels; inset slots #404040; orange progress #FAA838; green text #00FF00, red #FF8E8E, blue #80CEF0. Every visible string is looked up through `t(key)` (§12).

### 9.1 HUD (always visible)

| Region | Content |
|---|---|
| Bottom centre | **Quickbar** (10 slots, keys 1–0), to its right the **alert icons** (flashing, with counts). |
| Bottom left | **Crafting queue** icons with a pie/progress fill on the head item; click = cancel 1, right-click = cancel 5, Shift+click = cancel all. Below it the **player HP bar** (green → yellow → red) with "250/250". Gun + ammo mini-slots with magazine count. |
| Top right | **Current research** icon + progress bar + "42 %"; click opens the tech screen. Below it the **minimap** (200×200 px) with 6 small buttons: Zemljevid (M), Tehnologije (T), Navodila (H), Shrani (Ctrl+S), Nastavitve (Esc), Alt-način (Alt). |
| Top left | Tick-derived clock "Čas: 1:23:45", evolution "Evolucija: 4 %" (only after the first attack or when > 5 %), FPS/UPS in debug mode (F3). |
| Cursor | Holding a stack: icon + count follows the mouse; world shows the placement preview. Hovering a world entity: selection box outline + tooltip after 250 ms. |

### 9.2 Quickbar

10 slots, each a **link** to an item id (not storage). Number under the icon = count in the inventory (0 → greyed). Assign: click an empty slot with an item in the cursor, or with an empty cursor → item picker. Middle-click clears. Left-click / key = take the whole stack into the cursor (clicking with something in the cursor swaps it back). Right-click = half. One bar only **[simplified]**.

### 9.3 Inventory / character window (E)

Centred window, two panels: **left = Inventar** (80/90 slots, 10 columns, gun and ammo slots below, "Razvrsti" button sorts by category then id), **right = Izdelava** with 4 tabs (§9.4). E or Esc closes. When an entity GUI is open, the player inventory panel is shown to its left for Shift-click transfers.

Mouse/modifier operations (identical in inventory, entity slots and quickbar):

| Action | Input |
|---|---|
| Pick up / put down / merge / swap stack | LMB on a slot |
| Take half into cursor; put one from cursor | RMB |
| Move a whole stack to the other open inventory | Shift + LMB |
| Move all items of that type to the other inventory | Ctrl + LMB (Ctrl + LMB on an empty slot moves everything) |
| Fast transfer with a closed GUI: empty hand → grab the entity's output/contents; item in hand → insert as much as possible (fuel → fuel slot, ore → input, ammo → turret) | Ctrl + LMB on a world entity |
| Craft 1 / 5 / all | LMB / RMB / Shift + LMB on a recipe |

### 9.4 Crafting tabs (item groups) — order and rows

| Tab (SL / EN) | Rows (subgroups) |
|---|---|
| Logistika / Logistics | storage (chests) · belts (belt, fast belt, underground, fast underground, splitter, fast splitter) · inserters (burner, inserter, long-handed, fast) · power & fluid (small pole, medium pole, pipe, pipe-to-ground, small lamp) |
| Proizvodnja / Production | tool (repair pack) · energy (offshore pump, boiler, steam engine) · extraction (burner drill, electric drill) · smelting (stone furnace, steel furnace) · machines (AM1, AM2, lab, radar) |
| Vmesni izdelki / Intermediate products | raw (wood, iron ore, copper ore, coal, stone — shown for reference, not craftable) · materials (iron plate, copper plate, steel plate, stone brick — shown greyed, "samo v peči") · products (gear, cable, circuit, iron stick, pipe) · science (red, green) |
| Vojska / Combat | guns (pistol, SMG) · ammo (firearm mag, piercing mag) · defence (stone wall) · turret (gun turret) |

Recipe icon states: craftable now (normal); craftable via chain-crafting (normal, tooltip lists intermediates in orange); missing raw materials (dimmed, red count); not unlocked (hidden). Search box (Ctrl+F) filters by name in the current language.

### 9.5 Tooltips

- **Item**: name (caption), stack size, then entity properties if placeable (dimensions "2×2", energy "90 kW (gorivo)", crafting/mining speed, mining area, range, rotation speed, supply area, wire reach, storage size, fluid capacity, pollution "12/min"); fuel value for fuels ("4 MJ").
- **Recipe**: name, ingredients with counts (red if missing, orange if chain-craftable), time "0,5 s", products, "Skupaj surovin" line, plus the product's item tooltip stacked below.
- **World entity**: name, HP bar only when damaged, state line (fuel remaining, fluid contents, recipe, chest contents up to 4 icons, power satisfaction), hint "Ctrl + klik: hitri prenos".
- **Technology**: name, cost "10 × [R] 10 s", effects with icons, prerequisites.
- Shift while hovering shows the extended tooltip with control hints.

### 9.6 Entity GUIs

Common frame: dark panel, title bar with entity name and "×", **status line** (coloured dot: green working, yellow output full/low power/no ingredients/idle, red no power/no fuel/no ore/no ammo/not connected), the player inventory in a panel to the left. Closed by E, Esc or ×.

1. **Furnace** — fuel slot (left) + vertical red heat bar (fraction of the current fuel item remaining), input slot, horizontal orange progress bar, output slot. No recipe picker.
2. **Assembling machine** — if no recipe: the **recipe picker** (same 4 tabs as crafting, only recipes this machine may craft and that are unlocked, search box); else: recipe icon + name (click to change), ingredient slots with "have/need" counts, arrow + progress bar, output slot, lines "Hitrost izdelave 0,5", "Poraba 75 kW".
3. **Chest** — slot grid (16 → 2 rows of 8; 32 → 4×8; 48 → 5×10), red-X slot-limit button.
4. **Lab** — two pack slots (red, green; the one not needed by the current research is dimmed), current research name/icon + progress bar, "Hitrost raziskav 1,2".
5. **Gun turret** — ammo slot + bar (count/10), "Ubojev: N", "Doseg 18", bonus lines.
6. **Mining drill** — "Pričakovana ruda: [icon] 1 254", progress bar; burner drill: fuel slot + heat bar; electric: "Poraba 90 kW".
7. **Boiler** — fuel slot + heat bar, "Voda 200/200 · 15 °C" blue bar, "Para 120/200 · 165 °C" grey bar, "Poraba energije 1,8 MW".
8. **Steam engine** — "Izhodna moč 640 kW / 900 kW" bar, "Para 90/200", "Poraba pare 30/s".
9. **Electric pole** — network panel: Zadovoljenost (satisfaction) bar, Proizvodnja bar, consumer list (icon, count, kW) and producer list, sparkline **[P2]**.
10. **Offshore pump** — "Voda N/100", "Črpanje 1200/s".
11. **Splitter** **[P2]** — priority radios + filter slot.
12. **Player corpse** — chest-like grid with the stored items.
13. **Radar / lamp / inserter / belt / pipe / wall** — no GUI (tooltip only); inserters show a small GUI with status only **[P2]**.

### 9.7 Technology screen (T)

Full-screen overlay. Left: list of technologies (available highlighted, researched dimmed with a check, queued outlined orange). Centre: tree drawn as boxes (icon, name, cost icons × units, time) connected by prerequisite lines, laid out in 3 columns. Click a tech → detail panel (effects with icons, cost, prerequisites) with buttons "Začni raziskavo" / "Dodaj v vrsto" (queue ≤ 7, shown top-left with drag-free reordering via ▲▼ buttons and an ×). Shift+click starts immediately.

### 9.8 Map (M) and minimap

- Minimap: 200×200 px, 1 px = 1 tile at default (zoom ± with the wheel over it: 0.5–4 px/tile), centred on the player. Draws charted chunks from a per-chunk 32×32 `ImageData` cache (terrain map colours, ore map colours, entities as friendly-building blue #006191, belts #CCA147, walls #CCD9CC, turrets #CAA718, poles #009EA3, enemies #FF1A1A, player #DE8021 dot, pollution red tint). Click → open the full map at that point.
- Full map: fullscreen, drag to pan, wheel to zoom (0.25–8 px/tile), same rendering as the minimap plus labels; hovering an ore patch shows "[icon] Železova ruda: 812 k"; alert arrows; a pollution overlay toggle. Esc/M closes.

### 9.9 Alt-mode overlay (Alt)

Toggles: assembler/furnace product icon over the machine; inserter drop arrow; chest contents (≤ 4 icons); turret ammo icon + bar; drill output arrow (always shown anyway); status lights (small coloured dot at each machine's corner) and warning icons (no power ⚡, no fuel, no ammo, no ore, not connected) which are always shown, alt or not.

### 9.10 Alerts

Icons to the right of the quickbar, flashing, with a count; hover → text; click → open the map centred there; minimap shows an arrow at the edge. Types: `entity_under_attack` "Napad na objekte!" (10 s), `entity_destroyed` "Objekti uničeni" (30 s), `turret_fire` "Kupola strelja" (5 s), `turret_out_of_ammo` "Kupola brez streliva" (until refilled), `no_power` "Stroji brez energije" (10 s, aggregated). A short WebAudio alarm plays on the first occurrence of an attack.

### 9.11 Placement, drag-placing, rotation

- Selecting a placeable item shows a translucent preview snapped to the grid, tinted **green** (valid) or **red** (invalid: collision, water, out of reach, no ore under a drill, no water in front of a pump). Turret preview adds the range circle, pole preview adds the supply square and prospective wires, drill preview outlines its mining area.
- LMB places one; **hold LMB and move** to drag-place: belts follow the mouse path and auto-orient along the movement direction (turning corners), poles auto-place at maximum wire reach, walls/pipes chain on every tile, other entities place wherever the footprint fits along the path (no overlap).
- **R** rotates the item in the cursor (state remembered per item type); **R over a placed entity** rotates it (belts, inserters, drills, pumps, boilers, engines, undergrounds flip). Shift+R rotates counter-clockwise.
- Placing consumes 1 item from the cursor stack; when the stack runs out the cursor empties (and the quickbar re-grabs from the inventory if the item was taken from a quickbar slot **[P2]**).
- **Q** with an empty cursor over an entity = pipette (take that item from the inventory, matching rotation); over an ore tile = electric mining drill if available, else burner drill. Q with a full cursor = clear cursor.
- Holding RMB over an own entity mines it (progress ring). Removing a belt tile returns its items.

### 9.12 Key bindings

| Key | Action |
|---|---|
| W A S D | Move |
| LMB | Build / interact (open GUI) / craft |
| RMB (hold) | Mine resource, tree, rock; pick up own entity |
| R / Shift+R | Rotate cursor item or hovered entity (cw / ccw) |
| Q | Pipette / clear cursor |
| E | Inventory & crafting; also closes any window |
| T | Technologies |
| M | Map |
| F | Pick up items from the ground (within 1 tile) |
| Z | Drop one item from the cursor on the ground / belt at the cursor |
| H or F1 | **Navodila** (instructions panel) |
| Alt | Toggle alt-mode |
| Space (hold) | Shoot the nearest enemy in range |
| C (hold) | Shoot toward the cursor |
| Esc | Close the topmost window; with none open, pause menu (Nadaljuj, Shrani, Naloži, Izvozi/Uvozi, Nastavitve: jezik SL/EN, glasnost, Nova igra) |
| 1 2 3 4 5 6 7 8 9 0 | Quickbar slots |
| Shift + click | Stack transfer / craft all / add research to queue |
| Ctrl + click | Transfer all of a type / fast entity transfer |
| Ctrl + F | Focus search (crafting, recipe picker, tech screen) |
| Ctrl + S | Save now |
| Mouse wheel | Zoom (0.5 … 2.5, ×1.1 per notch, around the cursor) |
| F3 | Debug overlay (FPS, UPS, chunk count, entity count, active sets) |

Bindings are stored in a single `KEYS` table; **[P2]** rebinding UI.

### 9.13 In-game instructions panel — "Navodila" (H / F1) — REQUIRED

A scrollable window (max 720×560 px, tabs across the top) opened with H or F1, from the minimap button, from the pause menu and automatically **on the first start of a new game** (with "Ne prikaži več ob zagonu" checkbox stored in `localStorage`). Tabs: **Upravljanje**, **Kako napredovati**, **Nasveti**, **Razmerja**. Content is part of the i18n table; the Slovenian text below is the authoritative copy (English translation to be produced alongside).

**Upravljanje**

```
Premikanje: W A S D
Kopanje / pobiranje: drži DESNI gumb miške nad rudo, drevesom, skalo ali svojo zgradbo
Gradnja: izberi predmet (inventar ali hitra vrstica 1–0), levi klik postavi; drži in vleci za trakove, cevi, zidove in droge
Vrtenje: R (Shift+R v nasprotno smer) – deluje na predmetu v roki in na postavljeni zgradbi
Pipeta: Q nad zgradbo vzame enak predmet iz inventarja; Q s polno roko roko izprazni
Inventar in izdelava: E   Tehnologije: T   Zemljevid: M   Navodila: H ali F1
Pobiranje s tal: F        Odlaganje: Z       Alt: prikaz vsebine strojev (alt-način)
Streljanje: drži PRESLEDNICO (najbližji sovražnik) ali C (proti kazalcu)
Prenos predmetov: Shift+klik prenese cel sklad, Ctrl+klik prenese vse istovrstne; Ctrl+klik na zgradbi v svetu je hitri prenos
Izdelava: levi klik 1 kos, desni klik 5, Shift+klik največ možno
Povečava: kolesce miške      Shrani: Ctrl+S      Meni: Esc
```

**Kako napredovati** (numbered)

```
1. Poišči rudo. Okoli tebe so železo, baker, premog in kamen (glej zemljevid M). Z desnim gumbom nakoplji nekaj kamna in premoga.
2. Postavi kamnito peč (5 kamna) in vrtalnik na gorivo (že ju imaš). Vrtalnik obrni tako, da puščica kaže v peč – ruda gre naravnost vanjo. V oba daj premog.
3. Ponavljaj: več vrtalnikov na premogu in železu, več peči. Dva vrtalnika, obrnjena drug proti drugemu na premogu, se polnita sama.
4. Izdelaj tekoče trakove (1 zobnik + 1 železo → 2) in vstavljalnike na gorivo. Trak s premogom mimo peči in vrtalnikov, vstavljalniki jih polnijo.
5. Elektrika: obalna črpalka ob jezeru → cevi → kotel (premog) → 2 parna stroja → mali električni drogovi (1 les + 2 kabla → 2 droga). En kotel poganja dva parna stroja.
6. Postavi električne vrtalnike in navadne vstavljalnike – ne potrebujejo goriva.
7. Izdelaj laboratorij in ročno 10 rdečih znanstvenih paketov (1 baker + 1 zobnik). Razišči Avtomatizacijo (T).
8. Sestavljalni stroj 1 naj izdeluje zobnike, nato rdeče pakete. Trak paketov v laboratorije.
9. Razišči Strelno kupolo in Kamniti zid. Onesnaževanje tovarne privabi grizce – postavi kupole s strelivom na strani, od koder pridejo (rdeči oblak na zemljevidu).
10. Razišči Logistični znanstveni paket (75 rdečih). Zeleni paket = 1 vstavljalnik + 1 trak. Razmerje: 5 rdečih : 6 zelenih strojev.
11. Naprej: Predelava jekla, Avtomatizacija 2, Logistika 2, Vojska 2 (prebojni naboji), izboljšave škode.
```

**Nasveti**

```
- Vstavljalnik jemlje ZADAJ in odlaga SPREDAJ (puščica v alt-načinu). Na trak odloži na oddaljeno stran.
- Vrtalnik odlaga na ploščico pred puščico: na trak, v zaboj, v peč ali v drug stroj.
- Peč sama izbere recept po vhodnem predmetu (železova ruda → plošča, 2 kamna → opeka, 5 železnih plošč → jeklo po raziskavi).
- Rumena lučka = izhod poln ali premalo energije, rdeča = ni goriva / energije / rude.
- Če stroji delajo počasi, preveri drog: zadovoljenost omrežja mora biti 100 %.
- Kupole potrebujejo strelivo v kupoli (ročno ali z vstavljalnikom, največ 10 nabojnikov). Zid ustavi grizce, ne pa streljanja.
- Grizci napadajo, ko onesnaženje doseže njihova gnezda. Drevesa in voda vpijajo onesnaženje; kotli in vrtalniki ga proizvajajo največ.
- Igra se shrani samodejno vsako minuto. Izvozi shranjeno igro v besedilo (Esc → Izvozi) za varnostno kopijo.
- Če umreš, so tvoji predmeti v truplu na kraju smrti. Ponovno se pojaviš čez 10 s.
```

**Razmerja**

```
1 kotel : 2 parna stroja (1,8 MW)          1 obalna črpalka : 20 kotlov : 40 parnih strojev
1 poln rumeni trak (15/s) = 48 kamnitih peči = 30 električnih vrtalnikov = 60 vrtalnikov na gorivo
1 električni vrtalnik : 1,6 kamnite peči     3 stroja za kabel : 2 stroja za vezja
5 strojev rdečih paketov : 6 strojev zelenih paketov       1 stroj rdečih paketov (10 s) : 1 laboratorij
Premog: peč 44 s, vrtalnik 27 s, kotel 2,2 s na kos      Vstavljalnik: 0,83 kosa/s, hitri 2,31 kosa/s
```

### 9.14 New game / pause menu

New game dialog: seed (number, random by default), language SL/EN, "Miren način (brez napadov)" checkbox **[P2, default off]**, Start. Pause menu (Esc): Nadaljuj, Shrani, Naloži, Izvozi shranjeno igro, Uvozi shranjeno igro, Nastavitve (jezik, glasnost, prikaži navodila ob zagonu), Nova igra (confirm), Navodila.

---

## 10. Save / load

### 10.1 Storage

- Primary: `localStorage["factio.save"]` (JSON string). Secondary: `localStorage["factio.settings"]` (language, volume, showHelpOnStart, keybinds). All accesses wrapped in try/catch; on quota or private mode failure show "Shranjevanje ni mogoče (brskalnik blokira shranjevanje)" and keep the last save in memory. Typical save size after 3 h: 300–800 kB (the world is regenerated from the seed; only deltas are stored). If a save exceeds 4 MB, warn the player to export.
- Autosave every 60 s of played time and on `visibilitychange` (hidden) and `beforeunload`; manual Ctrl+S; toast "Shranjeno".
- Export: pause menu → textarea containing the JSON (optionally base64 of a deflated string is **out** — plain JSON, "Kopiraj" button using `navigator.clipboard` with a fallback of selecting the text). Import: textarea + "Naloži" button; validates `magic` and `version`, migrates, then replaces the world.

### 10.2 Schema (version 1)

```
{
  magic: "FACTIO", version: 1, savedAt: ISO string, tick: int, seed: uint32,
  player: { x, y, hp, dir, inventory: [ [itemId, count] | null ]*, cursor, gun, ammo, quickbar: [itemId|null]*10,
            bonuses: { mining, inventory, bulletDamage, turretDamage, bulletSpeed, labSpeed }, deadUntilTick },
  research: { researched: [techId], current: techId|null, progress: { techId: unitsDone }, queue: [techId] },
  evolution: { total: number },
  world: {
    oreDelta: { "x,y": amount }*,           // only tiles whose amount differs from generation (mined); 0 = depleted
    removedNaturals: [ "x,y" ]*,            // trees/rocks that were mined
    chunks: { "cx,cy": { pollution, charted: bool } }*,   // only chunks with pollution > 0 or charted
    groundItems: [ {x, y, item, count} ]*
  },
  entities: [ { id, type, ax, ay, dir, hp, ...typeSpecific } ]*,
      // belt: lanes [[ [item,pos],... ], [...]]  (pos as int); underground: partnerId; splitter: nextOut, nextIn
      // inserter: state, t, hand, energy; furnace/AM: slots, progress, fuelEnergy, recipe; chest: slots, limit
      // drill: progress, buffer, fuelEnergy, roundRobin; lab: slots, progress; turret: ammo, kills
      // boiler: fuelEnergy; poles: wires [ids]; segments are rebuilt on load (not saved)
  enemies: { spawners: [ {id, x, y, hp, bank, cooldown, owned: [unitIds]} ], units: [ {id, type, x, y, hp, state, targetId, groupId} ],
             groups: [ {id, spawnerId, state, timer, members} ] },
  alerts: [], stats: { itemsProduced: {...}, killed: int }
}
```

Load procedure: create the world from `seed`, apply `oreDelta` and `removedNaturals` lazily when a chunk is generated (keep both maps in memory; chunk generation consults them), restore entities into the grid, rebuild belt topology/lines, fluid segments, electric networks and active sets, then resume.

Migrations: `migrate(save)` runs `v1→v2…` steps sequentially; unknown newer versions are refused with a message.

---

## 11. Rendering

### 11.1 Canvas layout

One full-window `<canvas>` (device-pixel-ratio aware, `ctx.imageSmoothingEnabled = false` for crisp pixels at integer zooms) plus DOM overlays for GUIs. Camera: centred on the player each frame (interpolated with `alpha` from §7.1); zoom `z ∈ [0.5, 2.5]`; world→screen: `sx = (wx − camX) · 32 · z + W/2`.

### 11.2 Frame pipeline

1. Compute the visible tile rect (viewport ± 1 tile) and chunk range.
2. For each visible chunk: draw its **terrain cache canvas** (1024×1024 px at 32 px/tile, regenerated when `dirty` — ore amounts change often; to avoid regenerating a 1 MB canvas per mined ore, mark only when a tile's ore **stage** (§2.5.4) changes or a tile is depleted).
3. Ground items, then entities sorted by `(ay + h)` (painter's order, bottom edge), in layers: pipes/belts/undergrounds/splitters (layer 0), items on belts (layer 1), other entities (layer 2), inserter arms & drill heads (layer 3), trees/rocks (layer 2 with their base y), units and player (layer 4), wires (layer 5), warning icons/status lights/alt overlays (layer 6), projectile tracers, health bars (layer 7), placement preview (layer 8), night overlay + lights (layer 9), cursor ring/selection box (layer 10).
4. Off-screen chunk caches unused for 10 s are discarded (GC pass every 0.5 s); cap 64 cached chunks.

### 11.3 Procedural terrain and ore

Per tile in the cache: fill rect with the terrain fill colour; draw 5–8 speckles (1–2 px rects) in the speckle colour at hashed positions; water: fill + 2 lighter horizontal ripple strokes; shoreline: 2 px lighter edge on land tiles adjacent to water. Ore: draw `n` rounded 3–5 px dots in the ore colour with a 1 px lighter highlight, `n = 12 − stage` (12 … 5) at hashed positions; coal dots are near-black with grey highlights; depleted tiles draw nothing.

### 11.4 Procedural entity sprites (cached)

Every entity sprite is drawn once per `(type, dir, variant, zoomBucket)` into an offscreen canvas at `32·zb` px per tile (`zb ∈ {1, 2}`: 1 for zoom ≤ 1.25, 2 above; drawImage scales the rest). Cache key string → canvas; total ≤ ~300 canvases. Drawing rules (all with a 2 px darker outline and a soft south-east shadow rectangle at 30 % alpha):

| Entity | Drawing recipe |
|---|---|
| chests | square box, 2 planks (wood) or rivet dots (iron/steel), lighter lid line |
| transport belt | dark base #3A3A3A, two lane stripes in the belt colour, chevrons every 8 px pointing along `dir` (16-frame animation: chevron offset = frame·2 px); curves: same with a quarter-arc path; underground: belt half + a hood (dark trapezoid with an arrow) on the tunnel half; splitter: 2-wide belt with a raised centre bar and a small arrow |
| inserters | base circle + short post in the tier colour; the **arm** is drawn dynamically (§11.6) |
| pipe | grey tube with connection stubs per neighbour; pipe-to-ground: stub + dark hole |
| poles | thin post (wood: brown; medium: grey steel with a crossbar) + insulator dots; wires drawn as quadratic curves with 4 px sag between connected poles |
| offshore pump | blue-grey box with a pipe stub at the back and a blue intake mouth at the front |
| boiler | 3×2 dark iron body, a fire mouth (animated orange/yellow flicker while burning), chimney with smoke puffs while burning, pipe stubs at the water ends and steam outlet |
| steam engine | 3×5 grey casing, a flywheel (circle with spokes) that rotates while producing, pipe stubs at both ends |
| burner drill | 2×2 rusty box, chimney, a drill head triangle on the front edge and a yellow output arrow; head bobs while working (32-frame ping-pong) |
| electric drill | 3×3 blue-grey body, big rotating drill bit in the centre (30-frame loop), yellow arrow at the output edge |
| stone furnace | 2×2 stone-block body with mortar lines, dark mouth glowing orange while burning, smoke |
| steel furnace | 2×2 dark steel body, two mouths |
| assembling machines | 3×3 body (AM1 olive, AM2 teal), central gear that spins while crafting, recipe icon overlay in alt-mode |
| lab | 3×3 dome with a glowing ring that pulses while researching |
| gun turret | 2×2 base plate, rotating turret head with a barrel toward the target; muzzle flash for 2 ticks per shot |
| stone wall | light brick pattern; auto-tiles: straight/corner/T/cross by neighbour mask (16 variants) |
| radar | 3×3 base + rotating dish (0.01 turn/tick) |
| lamp | small post with a bulb; bulb bright when lit |
| trees | trunk rectangle + 2–3 overlapping canopy ellipses in the tint (stage 3: bare branches lines); dead tree: trunk + 3 branch lines |
| rocks | 3–5 overlapping grey-brown polygons with a lighter top facet |
| spawner | 4×4 purple-brown organic blob (#6B3A5C) with pulsing lighter nodules |
| biters | oval body + 6 leg strokes + 2 mandibles in #8B2E2E (small), #A33C2A (medium), #6E2A6E (big), scaled 0.5/0.7/1.0; legs animate while moving |
| player | 0.8×1.6 figure: body rect in orange #DE8021, head circle, 2 legs alternating while running, a gun line when in combat; 8 facings |
| ground item | the item icon at 60 % size with a shadow |
| corpse | dark grey lying figure |

### 11.5 Procedural item icons

32×32 canvases cached per item id (drawn at 64 px and downscaled for 2× zoom). Icon classes: **ore chunks** (3–4 irregular polygons in the base colour with highlight facets), **plate** (rounded rect with a bevel line), **bar** (thinner rect), **brick**, **gear** (circle with 8 teeth and a hole), **coil** (3 concentric arcs), **PCB** (green square with 3 copper trace lines and a dark chip), **rods**, **tube**, **flask** (round bottom, narrow neck, liquid in the pack colour), **gun** (silhouette), **magazine** (rounded rect with a coloured tip), **entity miniature** (the entity sprite scaled to fit 28×28). Numbers are drawn with `ctx.fillText` (bold 11 px, white with a 1 px black outline) at the bottom right of the slot.

### 11.6 Dynamic elements

- **Belt animation**: 16-frame chevron strip per tier; global `beltFrame = (tick × framesPerTick) % 16` with `framesPerTick = speed × 32` (yellow 1, fast 2), so the chevrons scroll at `speed × 32 px` per tick at zoom 1 (yellow 1 px/tick, fast 2 px/tick) — exactly the item motion, matching Factorio.
- **Items on belts**: each lane item is drawn at its lane path point: straight lane at lateral offset ±8 px (0.25 tile) from the centre line, longitudinal `pos/256·32` px; curves: point on a quarter circle of radius 8 px (inner) / 24 px (outer) around the curve's pivot corner. Icon size 16 px (0.5 tile). Batch by item id to reduce state changes.
- **Inserter arm**: angle = `baseAngle(dir) + π · progress` where `progress` goes 0 → 1 during SWING_TO_DROP and 1 → 0 during SWING_TO_PICKUP (`1 − t/halfSwing`); extension = `reach · (1 + 0.2 · sin(π · progress))` tiles; drawn as two 3 px segments (upper arm to an elbow at 55 % of the extension, offset 4 px sideways) ending in a hand: open (two short prongs) when empty, closed with the carried item icon at 12 px.
- **Drill / gear / flywheel / dish** animations driven by `tick` while `status == working`.
- **Smoke**: boilers, burner drills and furnaces emit a puff every 20 ticks while working: grey circle rising 0.3 tile/s, fading over 90 ticks (pool of ≤ 200 particles).
- **Projectiles**: tracer line from muzzle to target for 3 ticks (yellow-white), biter hit flash (white 2 ticks).
- **Health bars**: 24×3 px under damaged entities; green > 66 %, yellow > 33 %, red.
- **Status lights and warning icons**: 6 px dot at the entity's bottom-right corner (green/yellow/red); 16 px warning glyphs (⚡ no power, ⛽ no fuel, ⦸ no ammo/ore, ⚠ not connected) drawn with `fillText` emoji-free vector shapes (P0: coloured circles with a letter).
- **Selection**: hovered entity gets a 1 px white/yellow corner-bracket box; hovered ore tile a white outline while mining.
- **Placement preview**: the entity sprite at 60 % alpha tinted green/red (`globalCompositeOperation = 'source-atop'` on a temp canvas), plus overlays (§9.11).
- **Mining ring**: 24 px circle arc at the cursor, filling clockwise, orange.

### 11.7 Performance targets and rules

- 60 fps with ~3 000 entities, 2 000 belt items and 300 units on screen at zoom 1 on a 2019 laptop; UPS 60 with ~10 000 entities total.
- Rules: never allocate per frame in hot loops (reuse arrays); typed arrays for tile data; `Set`/arrays for active entities; per-chunk entity lists to cull; cache every static sprite; avoid `ctx.save/restore` per entity (set transform manually); text rendering only in the UI layer; DOM updates only when values change (dirty flags); `requestAnimationFrame` render decoupled from ticks.
- Zoomed out (z < 0.75): skip smoke, item icons on belts become 4 px squares in the item colour, warning icons only.

### 11.8 Minimap cache

Per chunk a 32×32 `ImageData` built from map colours (terrain, ore, entities by class, spawners); updated when the chunk's entity set or ore stage changes (throttled to once per second per chunk). Units and the player are drawn live on top.

### 11.9 Day/night **[P2]**

Cycle 25 200 ticks: full light 12 600 ticks, dusk 5 040 (linear), night 2 520, dawn 5 040. Night overlay: full-screen `rgba(10, 15, 40, 0.55 × darkness)` with lights (player flashlight cone radius 12 tiles ahead, lamps radius 10, furnace/boiler mouths radius 2) cut out via `destination-out` on an overlay canvas. Purely cosmetic (enemies and machines ignore it).

### 11.10 Audio **[P1]**

WebAudio-synthesised effects only (no assets): UI click, place (thud), mine (tick), craft done (ping), research done (chord), turret shot (noise burst, throttled), biter bite (low thump), alert (two-tone), death (descending). Master volume in settings; muted until the first user gesture (browser policy).

---

## 12. Slovenian glossary (SL ↔ EN)

All ids map to `{ sl, en }`. The i18n table is a single object `I18N = { sl: {...}, en: {...} }`; `t(key, ...args)` formats with `{0}` placeholders; missing keys fall back to English then to the key. Number formatting: Slovenian decimal comma ("0,5 s"), thousands with a thin space ("12 400"), SI prefixes for energy ("1,8 MW", "4 MJ").

### 12.1 Items and entities

| id | Slovenian | English |
|---|---|---|
| iron-ore | Železova ruda | Iron ore |
| copper-ore | Bakrova ruda | Copper ore |
| coal | Premog | Coal |
| stone | Kamen | Stone |
| wood | Les | Wood |
| iron-plate | Železna plošča | Iron plate |
| copper-plate | Bakrena plošča | Copper plate |
| steel-plate | Jeklena plošča | Steel plate |
| stone-brick | Kamnita opeka | Stone brick |
| iron-gear-wheel | Železni zobnik | Iron gear wheel |
| copper-cable | Bakreni kabel | Copper cable |
| electronic-circuit | Elektronsko vezje | Electronic circuit |
| iron-stick | Železna palica | Iron stick |
| pipe | Cev | Pipe |
| automation-science-pack | Avtomatizacijski znanstveni paket | Automation science pack |
| logistic-science-pack | Logistični znanstveni paket | Logistic science pack |
| pistol | Pištola | Pistol |
| submachine-gun | Brzostrelka | Submachine gun |
| firearm-magazine | Nabojnik | Firearm magazine |
| piercing-rounds-magazine | Prebojni nabojnik | Piercing rounds magazine |
| repair-pack | Popravljalni komplet | Repair pack |
| wooden-chest | Lesen zaboj | Wooden chest |
| iron-chest | Železen zaboj | Iron chest |
| steel-chest | Jeklen zaboj | Steel chest |
| transport-belt | Tekoči trak | Transport belt |
| fast-transport-belt | Hitri tekoči trak | Fast transport belt |
| underground-belt | Podzemni trak | Underground belt |
| fast-underground-belt | Hitri podzemni trak | Fast underground belt |
| splitter | Razdelilnik | Splitter |
| fast-splitter | Hitri razdelilnik | Fast splitter |
| burner-inserter | Vstavljalnik na gorivo | Burner inserter |
| inserter | Vstavljalnik | Inserter |
| long-handed-inserter | Dolgoroki vstavljalnik | Long-handed inserter |
| fast-inserter | Hitri vstavljalnik | Fast inserter |
| pipe-to-ground | Podzemna cev | Pipe to ground |
| small-electric-pole | Mali električni drog | Small electric pole |
| medium-electric-pole | Srednji električni drog | Medium electric pole |
| offshore-pump | Obalna črpalka | Offshore pump |
| boiler | Kotel | Boiler |
| steam-engine | Parni stroj | Steam engine |
| burner-mining-drill | Rudarski vrtalnik na gorivo | Burner mining drill |
| electric-mining-drill | Električni rudarski vrtalnik | Electric mining drill |
| stone-furnace | Kamnita peč | Stone furnace |
| steel-furnace | Jeklena peč | Steel furnace |
| assembling-machine-1 | Sestavljalni stroj 1 | Assembling machine 1 |
| assembling-machine-2 | Sestavljalni stroj 2 | Assembling machine 2 |
| lab | Laboratorij | Lab |
| gun-turret | Strelna kupola | Gun turret |
| stone-wall | Kamniti zid | Stone wall |
| radar | Radar | Radar |
| small-lamp | Mala svetilka | Small lamp |
| water | Voda | Water |
| steam | Para | Steam |
| tree | Drevo | Tree |
| dead-tree | Suho drevo | Dead tree |
| big-rock | Velika skala | Big rock |
| huge-rock | Ogromna skala | Huge rock |
| biter-spawner | Gnezdo grizcev | Biter spawner |
| small-biter | Mali grizec | Small biter |
| medium-biter | Srednji grizec | Medium biter |
| big-biter | Veliki grizec | Big biter |
| ground-item | Predmet na tleh | Item on ground |
| player-corpse | Truplo | Player corpse |
| player | Inženir | Engineer |

Terrain: out-of-map Rob sveta / Out of map; deepwater Globoka voda / Deep water; water Voda / Water; sand Pesek / Sand; red-desert Rdeča puščava / Red desert; dirt Zemlja / Dirt; grass-dry Suha trava / Dry grass; grass Trava / Grass.

Item groups: Logistika / Logistics; Proizvodnja / Production; Vmesni izdelki / Intermediate products; Vojska / Combat.

### 12.2 Technologies

See §8 (Slovenian and English names in the tables). Additional: "Raziskava" Research; "Vrsta raziskav" Research queue; "Začni raziskavo" Start research; "Dodaj v vrsto" Add to queue; "Raziskano" Researched; "Predpogoji" Prerequisites; "Učinki" Effects; "Cena" Cost.

### 12.3 UI strings

| key | Slovenian | English |
|---|---|---|
| ui.inventory | Inventar | Inventory |
| ui.crafting | Izdelava | Crafting |
| ui.technologies | Tehnologije | Technologies |
| ui.map | Zemljevid | Map |
| ui.instructions | Navodila | Instructions |
| ui.settings | Nastavitve | Settings |
| ui.language | Jezik | Language |
| ui.volume | Glasnost | Volume |
| ui.save | Shrani | Save |
| ui.load | Naloži | Load |
| ui.export | Izvozi shranjeno igro | Export save |
| ui.import | Uvozi shranjeno igro | Import save |
| ui.copy | Kopiraj | Copy |
| ui.newGame | Nova igra | New game |
| ui.seed | Seme | Seed |
| ui.peaceful | Miren način (brez napadov) | Peaceful mode (no attacks) |
| ui.start | Začni | Start |
| ui.continue | Nadaljuj | Continue |
| ui.confirmNewGame | Trenutna igra bo izgubljena. Nadaljujem? | The current game will be lost. Continue? |
| ui.saved | Shranjeno | Saved |
| ui.saveFailed | Shranjevanje ni mogoče (brskalnik blokira shranjevanje) | Saving is not possible (storage blocked by the browser) |
| ui.invalidSave | Neveljavna shranjena igra | Invalid save file |
| ui.sort | Razvrsti | Sort |
| ui.search | Išči… | Search… |
| ui.close | Zapri | Close |
| ui.showHelpOnStart | Prikaži navodila ob zagonu | Show instructions on start |
| ui.tab.controls | Upravljanje | Controls |
| ui.tab.progress | Kako napredovati | How to progress |
| ui.tab.tips | Nasveti | Tips |
| ui.tab.ratios | Razmerja | Ratios |
| ui.time | Čas | Time |
| ui.evolution | Evolucija | Evolution |
| ui.tooFar | Predaleč | Too far |
| ui.inventoryFull | Inventar je poln | Inventory is full |
| ui.cannotPlace | Tu ni mogoče graditi | Cannot build here |
| ui.needsOre | Vrtalnik potrebuje rudo | The drill needs ore |
| ui.needsWater | Črpalka potrebuje vodo pred seboj | The pump needs water in front |
| ui.fluidMixing | Mešanje tekočin ni dovoljeno | Fluid mixing is not allowed |
| ui.noPair | Ni para | No pair |
| ui.died | Umrl si | You died |
| ui.respawnIn | Ponovni pojav čez {0} s | Respawn in {0} s |
| ui.killedBy | Ubil te je: {0} | Killed by: {0} |
| ui.researchDone | Raziskava končana: {0} | Research finished: {0} |
| ui.recipe | Recept | Recipe |
| ui.chooseRecipe | Izberi recept | Choose a recipe |
| ui.ingredients | Sestavine | Ingredients |
| ui.craftTime | Čas izdelave | Crafting time |
| ui.totalRaw | Skupaj surovin | Total raw |
| ui.products | Izdelki | Products |
| ui.stackSize | Velikost sklada | Stack size |
| ui.fuelValue | Energijska vrednost | Fuel value |
| ui.fuel | Gorivo | Fuel |
| ui.input | Vhod | Input |
| ui.output | Izhod | Output |
| ui.progress | Napredek | Progress |
| ui.craftingSpeed | Hitrost izdelave | Crafting speed |
| ui.miningSpeed | Hitrost kopanja | Mining speed |
| ui.miningArea | Območje kopanja | Mining area |
| ui.expectedResources | Pričakovana ruda | Expected resources |
| ui.energyConsumption | Poraba energije | Energy consumption |
| ui.powerOutput | Izhodna moč | Power output |
| ui.steamConsumption | Poraba pare | Steam consumption |
| ui.pumpingSpeed | Črpanje | Pumping speed |
| ui.satisfaction | Zadovoljenost | Satisfaction |
| ui.production | Proizvodnja | Production |
| ui.consumption | Poraba | Consumption |
| ui.supplyArea | Območje napajanja | Supply area |
| ui.wireReach | Doseg žice | Wire reach |
| ui.range | Doseg | Range |
| ui.rotationSpeed | Hitrost vrtenja | Rotation speed |
| ui.storageSize | Velikost shrambe | Storage size |
| ui.fluidCapacity | Prostornina tekočine | Fluid capacity |
| ui.pollution | Onesnaževanje | Pollution |
| ui.dimensions | Velikost | Dimensions |
| ui.health | Zdravje | Health |
| ui.ammo | Strelivo | Ammo |
| ui.kills | Ubojev | Kills |
| ui.limitSlots | Omeji število mest | Limit slots |
| ui.fastTransferHint | Ctrl + klik: hitri prenos | Ctrl + click: fast transfer |
| ui.furnaceOnly | samo v peči | furnace only |
| ui.perMinute | /min | /min |
| ui.perSecond | /s | /s |
| ui.tick.debug | Sličic/s {0} · Posodobitev/s {1} | FPS {0} · UPS {1} |

### 12.4 Entity statuses

| key | Slovenian | English |
|---|---|---|
| status.working | Deluje | Working |
| status.idle | Nedejavno | Idle |
| status.no_power | Ni energije | No power |
| status.low_power | Premalo energije | Low power |
| status.not_connected | Ni priključen na omrežje | Not connected to a network |
| status.no_fuel | Ni goriva | No fuel |
| status.output_full | Izhod je poln | Output full |
| status.no_ingredients | Ni sestavin | No ingredients |
| status.no_recipe | Ni recepta | No recipe |
| status.no_minable_resources | Ni rude | No minable resources |
| status.no_ammo | Ni streliva | No ammo |
| status.no_research | Ni raziskave v teku | No research in progress |
| status.missing_science_packs | Manjkajo znanstveni paketi | Missing science packs |
| status.waiting_for_source | Čaka na predmete | Waiting for source items |
| status.waiting_for_space | Čaka na prostor v cilju | Waiting for space in destination |
| status.no_water | Ni vode | No water |
| status.no_steam | Ni pare | No steam |
| status.no_pair | Ni para | No pair |

### 12.5 Alerts

| key | Slovenian | English |
|---|---|---|
| alert.entity_under_attack | Napad na objekte! | Objects under attack! |
| alert.entity_destroyed | Objekti uničeni | Objects destroyed |
| alert.turret_fire | Kupola strelja | Turret firing |
| alert.turret_out_of_ammo | Kupola brez streliva | Turret out of ammo |
| alert.no_power | Stroji brez energije | Machines without power |

---

## 13. Balancing notes

### 13.1 Starting patches and early throughput

- Starting totals (iron 800 k, copper 640 k, coal 640 k, stone 320 k) are the official 100 % values and are ~50× more than a 4-hour game consumes (a 30-drill iron field mines 15/s = 54 k/h). Patch **radii** (20 / 15 / 13.5 / 11 tiles) are what matters: they allow ~30 electric drills on iron and ~15 on copper — enough for one full yellow belt of iron and half a belt of copper, which is the intended ceiling of this game.
- Recommended first setup (matches the Navodila): 4 burner drills on iron feeding 4 stone furnaces directly, 2 self-feeding burner drills on coal, 2 on copper, 1 on stone. Hand-fed coal: a furnace uses 1 coal per 44 s, a burner drill 1 per 27 s.

### 13.2 Science pacing (target: green science in 1–2 h)

| Stage | Packs | Raw cost | Hand/automation time |
|---|---|---|---|
| Automation (10 R) | 10 red | 20 Fe + 10 Cu | hand-craft 10 × 5.5 s ≈ 1 min; research 100 s in 1 lab |
| Core red techs to reach green: logistics 20, gun-turret 10, stone-wall 10, military 10, steel-processing 50, logistic-science-pack 75 | 175 red | 350 Fe + 175 Cu | 1 AM1 makes 0.1 red/s → 29 min; 2 AM1 → 15 min. Lab time with 2 labs: 20·15+10·10+10·10+10·15+50·5+75·5 = 1275 lab-s → 10.6 min |
| Electronics 30 + optics 10 + fast-inserter 30 + steel-axe 50 | 120 red | 240 Fe + 120 Cu | optional, 20 min of 1 AM1 |
| Green tier realistic goal set: military-2 20, automation-2 40, advanced-material-processing 75, toolbelt 100, EED1 120, research-speed-1 100 | 455 R + 455 G | ≈ 3 400 Fe + 1 140 Cu | 2 red + 2 green AM1: red 0.2/s, green 0.167/s → 46 min for green packs; lab-s = 20·15+40·15+75·30+100·30+120·30+100·30 = 12 750 → 4 labs: 53 min |
| Logistics 2 200, PPD2 200, WSS2 200, research-speed-2 200 | 800 R + 800 G | ≈ 6 000 Fe + 2 000 Cu | end-game stretch: 80 min of 2+2 AM1 or 40 min with AM2 |

Timeline check: minute 0–45 burner phase and belts; 45–75 steam power (needs ≈ 100 Fe for pump+boiler+2 engines + poles); 60–90 first lab (36 Fe + 15 Cu) and Automation; 90–120 red science automated (2 AM1 = 44 Fe + 9 Cu), 4 techs done; 120–150 Logistic science pack researched (75 red = 12.5 min of 1 AM1 or 6 min of 2); green automated by ~2.5 h at the latest, in line with the 1–2 h target for an experienced player and ≤ 2.5 h for a first-timer who reads the Navodila.

### 13.3 Power

- First plant: 1 pump : 1 boiler : 2 engines = 1.8 MW; consumes 0.45 coal/s (a burner drill on coal delivers 0.25/s → 2 burner drills or 1 electric drill per boiler).
- Demand references: electric drill 90 kW, AM1 77.5 kW, inserter 13.6 kW, lab 62 kW, radar 300 kW. 1.8 MW runs ≈ 10 drills + 6 AM1 + 2 labs + 30 inserters. Second boiler pair recommended before radar.

### 13.4 Defense pressure

- With the 200-tile safe radius and 2.0 absorption values, a typical factory (2 boilers, 20 burner/electric drills, 20 furnaces, 6 AM1 ≈ 60 + 240 + 60 + 24 = 384 PU/min) forms a cloud reaching ~250–350 tiles after 1.5–2.5 hours. First attacks: 5–15 small biters every 1–10 min. 4 turrets with 10 magazines each hold this indefinitely (50 DPS each; a small biter dies in 3 bullets).
- Medium biters appear at 20 % evolution (~4–6 h of heavy pollution) — beyond the target session, but if reached, yellow ammo drops to 9 DPS per turret against them; Military 2 (piercing, 36 DPS) and PPD 1–2 are the answer. Big biters (50 %) are effectively unreachable in scope.
- Tuning knobs (config constants): `ENEMY_FREQ`, `SAFE_RADIUS_ENEMY`, `POLLUTION_ABSORB_MULT`, `ATTACK_COST_MULT`, `EVO_TIME_FACTOR`; a "Miren način" checkbox sets `peaceful = true` (no attack groups, retaliation only).

### 13.5 Inventory and crafting friction

- 80 slots + stack sizes make hand-carrying 400 ore (8 slots) or 1 600 plates (16 slots) practical; the 10 s corpse rule keeps death cheap.
- Hand-crafting a lab from plates takes ≈ 26 s; an electric drill 6.5 s; a turret 13 s. Queue is unlimited so players can batch 20 belts (10 s) while walking.

---

## 14. Module breakdown for parallel implementation

The shipped artefact is one `factio.html`. During development, modules live in `src/*.js` and a build script (`build/build.js`, Node, no dependencies) concatenates them in order into the HTML between `<script>` tags together with `style.css`. Each module is an IIFE that attaches to a global `F` namespace and touches only the interfaces listed here.

| Module | File | Owns | Depends on |
|---|---|---|---|
| core | `00-core.js` | `CONST`, RNG/hash/noise, `t()` i18n with `I18N` table (§12), event bus, number formatting | – |
| data | `01-data.js` | `ITEMS`, `RECIPES`, `ENTITY_DEFS`, `TECHS` exactly as in §4–§8 (pure data, validated on load by an assert pass: every recipe ingredient exists, every unlock names a recipe/bonus, etc.) | core |
| world | `10-world.js` | chunk store, generation (§2), tile queries, entity grid, natural entities, ore delta maps | core, data |
| entities | `20-entities.js` | entity registry (ids, create/destroy, placement validation, rotation, pickup/contents), slots & inventories helpers, ground items | world, data |
| belts | `30-belts.js` | belt/underground/splitter topology, lines, movement, lane API (`laneCanInsert`, `laneInsert`, `lanePick`) | entities |
| inserters | `31-inserters.js` | state machine (§7.4), `canAccept`/`insert`/`take` adapters for every target type | entities, belts, machines |
| machines | `32-machines.js` | drill, furnace, assembler, lab, radar, lamp, turret update functions; insertion limits | entities, world, power, research |
| power | `33-power.js` | pole networks, supply coverage, per-tick satisfaction, steam engine draw | entities, fluids |
| fluids | `34-fluids.js` | segments, pump/boiler/engine fluid boxes, mixing checks | entities |
| pollution | `35-pollution.js` | per-chunk pollution, diffusion, tree damage, evolution | world, entities |
| enemies | `36-enemies.js` | spawners, units, groups, AI, base generation hook | world, entities, pollution, combat |
| combat | `37-combat.js` | damage/resistances, player and turret shooting, deaths, corpses, alerts | entities |
| research | `38-research.js` | tech state, queue, unlock application, bonuses | data |
| player | `40-player.js` | movement, mining, inventory, cursor, crafting queue, death/respawn, input mapping (`KEYS`) | entities, world, belts |
| sim | `50-sim.js` | tick orchestration (§7.2), active sets, game loop (§7.1), pause | all sim modules |
| render | `60-render.js` | camera, chunk caches, sprite cache, entity/unit drawing, animations, overlays, minimap caches, night | world, entities, player |
| ui | `70-ui.js` | HUD, windows, tooltips, quickbar, tech screen, map, alerts, Navodila, menus | player, research, render (for previews), core |
| save | `80-save.js` | serialise/deserialise, migrations, localStorage, export/import | all |
| main | `90-main.js` | boot, new game, resize, DPR, error overlay | all |

Shared interfaces that must be agreed before parallel work starts (owners in brackets):

- `F.world.getTile(x, y) → {terrain, ore, amount, entityId}`; `F.world.setOre(x, y, amount)`; `F.world.chunkAt(cx, cy)`; `F.world.forEachEntityInRect(...)`. [world]
- `F.ent.create(type, ax, ay, dir) → entity`; `F.ent.remove(id)`; `F.ent.at(x, y)`; `F.ent.footprint(entity) → {x, y, w, h}`; `F.ent.contents(entity) → [[item, count]]`. [entities]
- `F.inv` helpers: `add(inv, item, count) → remaining`, `remove`, `count`, `canAdd`. [entities]
- `F.belts.tryDrop(tile, lane, item)`, `F.belts.tryPick(tile, preferLane) → item|null`, `F.belts.onTileChanged(x, y)`. [belts]
- `F.io.canAccept(entity, item) → bool`, `F.io.insert(entity, item) → bool`, `F.io.takeOutput(entity) → item|null` — a dispatch table by entity type used by inserters, drills and the player's fast transfer. [inserters + machines jointly]
- `F.power.request(entity, joules)`, `F.power.satisfactionOf(entity) → 0..1`, `F.power.onPoleChanged(pole)`. [power]
- `F.fluid.segmentOf(entity, boxIndex)`, `F.fluid.push(seg, fluid, amount) → accepted`, `F.fluid.pull(seg, amount) → got`. [fluids]
- `F.research.isUnlocked(recipeId)`, `F.research.bonus(key)`. [research]
- `F.events.emit('entity:changed', id)` etc. — event names: `entity:placed`, `entity:removed`, `entity:changed`, `tile:changed`, `research:done`, `alert`, `player:died`, `save:done`. [core]
- `F.render.spriteFor(type, dir, variant, zb) → canvas`, `F.render.iconFor(item) → canvas` (also used by UI). [render]

Definition of done for each module: unit-style self-checks runnable from the debug overlay (F3 → "Zaženi teste"): e.g. belts — a 10-tile loop conserves item count; a fully compressed straight belt delivers 15 items/s ± 1 %; inserter chest→chest 0.83 items/s ± 2 %; power — 3 AM1 on 1 engine with no steam gives satisfaction 0; furnace — 1 coal smelts 13–14 plates; pollution — a lone boiler raises its chunk by ≈ 30 PU/min minus absorption.

---

## 15. Decisions log and open questions

### 15.1 Simplifications made (already decided, listed for transparency)

| Topic | Factorio | Factio |
|---|---|---|
| Reach for hand-mining resources | 2.7 tiles | 10 tiles (constant) |
| Offshore pump footprint | 1×2 (1.1) | 1×1 on shore + water in front |
| Underground belt tunnel buffer | 44 items | 0 (instant transfer) |
| Splitter internal length / 5-item memory | 128 + 51 buffer, memory 5 | 256, no memory |
| Curve lane lengths | 106 / 295 | same (kept) |
| Belt loops | exact | one cut point per loop |
| Biter path-finding | full path-finder | steer + slide, chunk A* for water (P1) |
| Biters vs trees | blocked, attack trees | walk through trees |
| Tree leaf damage | per-second chance | 1/600 per tick above 60 PU |
| Player regen | 6 HP/s (wiki) / 9 (proto) | 6 HP/s |
| Corpse expiry | 15 min (1.1) / never (2.0) | never |
| Gun/ammo slots | 3 + 3 | 1 + 1, ammo auto-refill |
| Quickbar pages | 10 | 1 |
| Electronics tech | unlocks nothing (1.1) | unlocks radar + repair pack |
| Furnace GUI | – | identical |
| Inserters from chests | any slot | first non-empty slot |
| Burner inserter leech | from picked items | from hand only when the buffer is empty and the drop target is not a fuel slot |
| Fluid type of an empty segment | kept | reset to null |
| Pollution absorption table | 1.1 values | 2.0 values |
| Ground tiles | 20+ | 8 |
| Trees clearing radius | 128 + 64 | 64 + 64 |
| Repair pack speed | held-click, engine-defined | 40 HP/s |
| Turret aiming | must rotate | rotation drawn, firing gated by ±5° (may be dropped to instant, P2) |

### 15.2 Open questions (not settled by the research)

1. **Starting-area radius for enemies**: Factorio's exact "biter-free radius" is an engine constant not exposed in any prototype; the research puts it on the order of 150–200 tiles. We use the task's 200 tiles; may need tuning after playtests (knob `SAFE_RADIUS_ENEMY`).
2. **Lake position**: `starting_lake_positions` is computed inside the engine; the research only estimates "a few dozen tiles from spawn". Our 38-tile lake at a random angle is a design choice.
3. **Burner inserter 1.1 exact swing**: the 1.1 wiki table says 100 ticks per cycle and 0.60 items/s (rotation 0.01); the 2.0 wiki says 76 ticks / 0.79. We ship 1.1 (0.60); if it feels too slow in the burner phase, switch to 2.0's 0.013 rotation (38-tick half swing).
4. **Drill output lane for a belt parallel to the drill**: the research documents the near-lane rule for perpendicular belts and notes a forum-reported inconsistency for burner drills; we chose "right lane". Verify against the real game if fidelity matters.
5. **Inserter pickup window on belts**: Factorio's hand chases items along the tile; our "any item on the tile, prefer pos ≤ 192" rule reproduces throughput but not the exact grab position. Acceptable unless playtests show visible teleporting.
6. **Yellow-ammo turrets vs medium biters** yield only 9 DPS with the faithful resistance formula; if playtests reach 20 % evolution inside 4 h, consider lowering `EVO_TIME_FACTOR` or the pollution factor rather than changing biter stats.
7. **Radar far-scan on a finite map** (`MAP_LIMIT` 4096): the 29×29-chunk scan area is well inside the limit; nothing to resolve, but confirm chunk generation cost (≈ 2 chunks/tick budget) keeps 60 UPS while a radar runs.
8. **Slovenian term for biter**: "grizec" (from "gristi") is a coinage; alternatives "grizač"/"kuzlač" were considered. Confirm with a native reviewer before final strings.
9. **Save size** with per-item belt positions after 4 hours (estimated 300–800 kB) is fine for localStorage's 5 MB; if larger factories are common, quantise `pos` to a byte and store lanes as strings.
10. **Fast-replace and Ctrl-drag fast transfer** are marked P1/P2; confirm they are wanted for v1.0.
11. **Day/night** is cosmetic P2; decide whether to keep the small lamp/Optics tech if day/night is cut (Optics would then unlock nothing — fold the lamp into Electronics or drop both).
12. **English copy of the Navodila panel**: the Slovenian text is authoritative; the English translation must be written by the UI module owner and reviewed.
