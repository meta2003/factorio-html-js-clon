# Factorio map generation (Part A) and browser/JS Factorio-like clone survey (Part B)

KEY: `map-generation-and-browser-clones`
Scope: Factorio 1.1 / 2.0 base game values (version noted where they differ). Everything marked **[verified]** comes from a fetched source cited next to it; anything marked **[approx]** or **[recalled]** is my own estimate or memory and should be treated as a starting point, not as ground truth.

---

## PART A — MAP GENERATION

### A0. Coordinate system, tiles and chunks

| Fact | Value | Source |
|---|---|---|
| Tile size | 1 tile ≈ 1 m (verified in-game: 250 tiles at 57.777 m/s = 260 ticks) | https://wiki.factorio.com/Map_structure |
| Chunk size | 32 × 32 tiles = 1024 tiles | https://wiki.factorio.com/Map_structure |
| Game tick | 60 ticks / s (1 tick = 1/60 s) | https://wiki.factorio.com/Map_structure (speed example), https://forums.factorio.com/viewtopic.php?f=18&t=100292 |
| Max map | 2,000,000 tiles per side (± 1,000,000 from centre), 4 × 10¹² tiles; width/height = 0 in settings = "infinite" | https://wiki.factorio.com/Map_generator, https://lua-api.factorio.com/latest/concepts/MapGenSettings.html |
| Lazy generation | "20 chunks distance in each direction around each player is slowly generated over time, or immediately if revealed directly and not yet generated." | https://wiki.factorio.com/Map_structure |
| Hidden buffer | An invisible buffer of ≈ 3 chunks is generated around charted terrain (for enemies / artillery) | https://wiki.factorio.com/Map_generator |
| Chunk-scoped systems | map gen & charting, pollution & spore spread, enemy expansion, first stage of enemy path-finding, whole-chunk sleeping when nothing is active | https://wiki.factorio.com/Map_structure |
| Grid alignment | All buildings snap to the tile grid; exceptions: land mines, vehicles, enemies, **trees**, decoratives | https://wiki.factorio.com/Map_structure |
| Charting sources | players, radars, roboports, spidertrons, artillery shells reveal chunks (chunk granularity) | https://wiki.factorio.com/Map_structure |
| Pollution spread | starts when a chunk holds ≥ 15 pollution; 2 % per 64 ticks to each of 4 neighbours (both directions) | https://wiki.factorio.com/Pollution |

Implementation note (derived): store the world as a `Map<chunkKey, Chunk>` where `chunkX = floor(tileX / 32)`; a chunk holds a 1024-entry tile array (terrain id, ore id, ore amount) plus entity lists. Generate a chunk the first time anything within ~20 chunks of a player (or the viewport + 3 chunks) touches it.

---

### A1. Map generator: modes, sliders, presets, defaults

**Modes** [verified, https://wiki.factorio.com/Map_generator]: *Normal* = endless terrain; *Island* = one island around spawn, endless ocean beyond.

**Seed**: 32-bit unsigned integer; same settings + different seed → very different maps. Noise variables available to expressions: `map_seed`, `map_seed_small` (low 16 bits), `map_seed_normalized` (0–1) [verified, https://lua-api.factorio.com/latest/auxiliary/noise-expressions.html].

**Resource sliders** [verified, wiki Map_generator]:

| Slider | Meaning | Example |
|---|---|---|
| Frequency | number of patches per area | 200 % ≈ double the patches in a given area |
| Size | area of each patch | 200 % = patch surface area doubled |
| Richness | ore per tile | 200 % ≈ each tile / oil well holds double |

The internal multiplier type is `MapGenSize` (a float; 1 = 100 %). [recalled] The in-game slider spans roughly 17 %–600 % (1/6 … 6×) — not confirmed by a fetched page.

**Terrain tab** [verified, wiki Map_generator]:

| Setting | Effect |
|---|---|
| Water scale | spacing between lakes: smaller = swampier, larger = big oceans / landmasses. Internally `control:water:frequency` = `segmentation_multiplier` (inverse of scale) |
| Water coverage | overall amount of water: lower = small lakes, higher = large oceans. Internally shifts the water level (`wlc_elevation_offset`) |
| Trees scale / coverage | distance between forests / forest density |
| Cliffs frequency | how many cliff lines |
| Cliffs continuity | how long and unbroken cliff lines are (`control:cliffs:richness`) |
| Moisture bias / scale | grass vs desert distribution |
| Terrain type (aux) bias / scale | red desert vs sand distribution |
| Starting area size | multiplier for the "biter free zone radius" (default 1). Since 0.17 it does NOT change starting-resource placement |

**Map-settings defaults** [verified, wiki Map_generator + gist map-settings.json https://gist.github.com/MKuckert/2db1dc4afcaefb9ead7dbc57fb33a024]:

| Setting | Default |
|---|---|
| Enemy expansion | enabled, max distance 7 chunks, group size 5–20, cooldown 4–60 min (14400–216000 ticks) |
| Evolution | time factor 40 (0.000004 / tick), destroy factor 200 (0.002), pollution factor 9 (0.0000009) |
| Pollution | enabled, absorption modifier 100 %, attack cost modifier 100 %, min pollution to damage trees 60, absorbed per damaged tree 10, diffusion ratio 2 % (0.02) |
| Technology price multiplier | 1 |
| Cliff settings (1.1 example json) | `cliff_elevation_0`, `cliff_elevation_interval`, `richness` — [recalled] vanilla defaults 10 / 40 / 1 (the gist example uses 10 / 10 / 4) |
| terrain_segmentation | "inverse of map scale" (1 = default) |

**Presets** [verified, https://raw.githubusercontent.com/wube/factorio-data/master/base/prototypes/map-gen-presets.lua and https://wiki.factorio.com/Map_generator]:

| Preset | Changes vs default (all sliders centred = 1.0) |
|---|---|
| Default | none |
| Rich resources | richness "very-good" (200 %) for iron, copper, stone, coal, uranium, crude oil |
| Marathon | technology price multiplier 4 |
| Death world | enemy base frequency very-high (200 %), size very-big (200 %), starting area small (75 %), evolution time factor 0.00002 (200), pollution factor 0.0000012 (12), pollution ageing/absorption 0.5 (50 %), attack cost modifier 0.5, base dispatch cooldown 600 s |
| Death world marathon | as Death world + tech ×4, time factor 0.000015 (150), pollution factor 0.0000010 (10), attack cost modifier 0.8 |
| Rail world | all resources frequency 0.333, size 3; water frequency 0.5 / size 1.5 (wiki: "200 % scale, 150 % coverage"); enemy base size 1; evolution time factor 0.000002 (20); enemy expansion disabled |
| Ribbon world | all resources frequency 3, size 0.5, richness 2; water frequency 4 / size 0.25 (wiki: 25 % coverage & size); cliffs frequency 0.25, size 0.75; starting area 3; map height 128 tiles |
| Island | terrain type "island"; trees frequency 1, size 0.5 (50 % coverage) |

**Starting area guarantees** [verified, wiki Map_generator + FFF-258 https://factorio.com/blog/post/fff-258]:
- At least one patch each of **coal, iron ore, copper ore, stone**; usually exactly one patch each, clustered close together.
- **Never** uranium ore or crude oil.
- **Always a lake** (regardless of water settings) — needed for the offshore pump.
- **Never cliffs**.
- Starting-area size setting no longer affects resource placement (fixed radius, see A4).
- Trees are cleared within 128 tiles of spawn with a 64-tile fade border (see A5).
- Richness of starting patches is "slightly influenced by the frequency setting" (formula in A4).

---

### A2. Terrain tiles (natural ground + water)

#### A2.1 Tile table — colours, walking, friction, biome rectangle

`map_color` = exact minimap colour from `tiles.lua` [verified, https://raw.githubusercontent.com/wube/factorio-data/master/base/prototypes/tile/tiles.lua]. The *biome rectangle* is the autoplace range `{{aux_min, moisture_min}, {aux_max, moisture_max}}` from 1.1 `tiles.lua` [verified, https://raw.githubusercontent.com/wube/factorio-data/1.1.110/base/prototypes/tile/tiles.lua]; 2.0 uses the same numbers via `expression_in_range_base(aux_min, moisture_min, aux_max, moisture_max)` where −10 / 11 mean "unbounded". Layer = draw priority (higher layer wins when two tiles overlap at chunk edges).

| Tile | map_color RGB | hex | walk speed | vehicle friction | layer | biome rectangle(s) (aux, moisture) | approx in-game texture colour **[approx]** |
|---|---|---|---|---|---|---|---|
| grass-1 | 55,53,11 | #37350B | 1.0 | 1.6 | 26 | aux 0–1, moisture 0.7–1.0 (wettest) | #5B7A33 mid green |
| grass-2 | 66,57,15 | #42390F | 1.0 | 1.6 | 28 | aux 0.45–1, moisture 0.45–0.8 | #6E8A3A yellow-green |
| grass-3 | 65,52,28 | #41341C | 1.0 | 1.6 | 29 | aux 0–0.65, moisture 0.6–0.9 | #6A7C46 grey-green |
| grass-4 | 59,40,18 | #3B2812 | 1.0 | 1.6 | 30 | aux 0–0.55, moisture 0.5–0.7 | #5F6B3C dark olive |
| dry-dirt | 94,66,37 | #5E4225 | 1.0 | 1.4 | 18 | aux 0.45–0.55, moisture 0–0.35 | #9A7B55 |
| dirt-1 | 141,104,60 | #8D683C | 1.0 | 1.4 | 19 | aux 0–0.45, moisture 0.25–0.3; also aux 0.4–0.45, moisture 0–0.25 | #A98A5E |
| dirt-2 | 136,96,59 | #88603B | 1.0 | 1.4 | 20 | aux 0–0.45, moisture 0.3–0.35 | #A5875C |
| dirt-3 | 133,92,53 | #855C35 | 1.0 | 1.4 | 21 | aux 0–0.55, moisture 0.35–0.4 | #9E8158 |
| dirt-4 | 103,72,43 | #67482B | 1.0 | 1.4 | 22 | aux 0.55–0.6, moisture 0–0.35; also aux 0.6–1, moisture 0.3–0.35 | #8B6E4B |
| dirt-5 | 91,63,38 | #5B3F26 | 1.0 | 1.4 | 23 | aux 0–0.55, moisture 0.4–0.45 | #86694A |
| dirt-6 | 80,55,31 | #50371F | 1.0 | 1.4 | 24 | aux 0–0.55, moisture 0.45–0.5 | #7C6144 |
| dirt-7 | 80,54,28 | #50361C | 1.0 | 1.4 | 25 | aux 0–0.55, moisture 0.5–0.55 | #765C40 |
| sand-1 | 138,103,58 | #8A673A | 1.0 | 1.8 | 8 | aux 0–0.25, moisture 0–0.15 (+ beach peak near water) | #C2A66B pale khaki |
| sand-2 | 128,93,52 | #805D34 | 1.0 | 1.8 | 9 | aux 0–0.3, moisture 0.15–0.2 (+ …) | #B89B63 |
| sand-3 | 115,83,47 | #73532F | 1.0 | 1.8 | 10 | aux 0–0.4, moisture 0.2–0.25; also aux 0.3–0.4, moisture 0–0.2 | #AD915B |
| red-desert-0 | 103,70,32 | #674620 | 1.0 | 1.6 | 31 | aux 0.55–1, moisture 0.35–0.5 | #9C6A42 |
| red-desert-1 | 116,81,39 | #745127 | 1.0 | 1.6 | 14 | aux 0.6–0.7, moisture 0–0.3 (+ …) | #A87246 |
| red-desert-2 | 116,84,43 | #74542B | 1.0 | 1.6 | 15 | aux 0.7–0.8, moisture 0–0.25 (+ …) | #AE7A4C |
| red-desert-3 | 128,93,52 | #805D34 | 1.0 | 1.6 | 16 | aux 0.8–1, moisture 0–0.2 (driest, reddest) | #B5834F |
| water | 51,83,95 | #33535F | 1.0 (impassable) | — | 3 | elevation ≤ 0 (`water_base(0,100)`) | #1F4F6E blue-teal |
| deepwater | 38,64,73 | #264049 | impassable | — | 3 | elevation ≤ −2 (`water_base(-2,200)`) | #143A55 dark blue |
| water-green / deepwater-green | 31,48,18 / 24,38,17 | #1F3012 / #182611 | impassable | — | 3 | not auto-placed on Nauvis (scenario/editor) | murky green |
| water-shallow | 82,98,92 | #52625C | 0.8 (−20 %) | — | 6 | not natural on Nauvis (tutorials; Gleba in Space Age) | #4E7A80 |
| water-mud | 65,89,90 | #41595A | 0.7 (−30 %) | — | 7 | idem | #4F6B6A |
| landfill (placed) | 57,39,26 | #39271A | 1.0 | — | 60 | player-placed on water | dark dirt |
| stone-path (placed) | 86,82,74 | #56524A | 1.3 | 1.1 | 11 | — | grey bricks |
| concrete (placed) | 63,61,59 | #3F3D3B | 1.4 | 0.8 | 13 | — | grey |
| refined-concrete (placed) | 49,48,45 | #31302D | 1.5 | 0.8 | 17 | — | dark grey |
| hazard-concrete (placed) | 176,142,39 | #B08E27 | 1.4 | 0.8 | 15 | — | yellow/black stripes |
| nuclear-ground | 48,40,35 | #302823 | 1.0 | 1.6 | 33 | created by atomic bomb | dark scorched |
| out-of-map | 0,0,0 | #000000 | — | — | 0 | outside finite map | black |

Placed path tiles: stone brick +30 %, concrete/hazard +40 %, refined +50 % walking speed; paths **stop pollution absorption** of the ground beneath [verified, https://wiki.factorio.com/Tile].

#### A2.2 How the game picks a ground tile (the biome function)

[verified, 1.1 tiles.lua + https://forums.factorio.com/viewtopic.php?t=31293 + lua-api noise docs]
1. Compute three scalar noise fields per tile: **elevation**, **moisture** (0–1; low = sandy, high = grassy) and **aux** ("terrain type", 0–1; low = sand, high = red desert), plus **temperature** (°C, only used by trees / enemies).
2. If `elevation ≤ 0` → water; if `elevation ≤ −2` → deep water (numbers from `water_base(0,100)` / `water_base(-2,200)`).
3. Otherwise each ground tile has one or more rectangles in (aux, moisture) space (table above). Fitness of a tile = `min(peak(moisture, rect), peak(aux, rect))` where `peak` is 1 inside the range and ramps to 0 outside (1.1 helper `auxwater_rect_to_noise_expression`), plus a small per-tile noise layer (`noise_layer_noise(k)` in 2.0) so borders are ragged. Highest fitness wins.
4. Noise parameters [verified, core `noise-programs.lua` 1.1.110 and master]:
   - moisture (1.1): `multioctave(seed, seed1=6, 4 octaves, persistence 1.5, 1/3)(x, y, input 1/256, output 1/8) + 3/8`, bias/scale sliders applied; 2.0: input scale `control:moisture:frequency / 256`, output 0.125.
   - aux (1.1): base 0.5, seed1 7, 4 octaves, input scale 1/2048, output 1/4, clamped 0–1.
   - temperature (1.1): `multioctave(seed, 5, 4, 3)(x, y, 1/32, 1/20)` + `average_sea_level_temperature = 15`; 2.0: input `control:temperature:frequency / 32`, output 1/20.
   Practical reading: moisture varies over ~256-tile features, aux over ~2048-tile features (large regions of "sand world" vs "red-desert world"), temperature over ~32-tile features.

#### A2.3 Pollution absorption per tile

| Tile family | 2.0 wiki, per tile per second | 2.0 per chunk per minute | 1.1 `tiles.lua` per tile per second |
|---|---|---|---|
| water, deepwater (+green) | 0.000025 | 1.536 | 0.000005 |
| grass 1–4 | 0.000018 | 1.10592 | 0.0000075 |
| dirt 1–7, dry dirt | 0.000018 | 1.10592 | 0.0000066 |
| red desert 0–3 | 0.000015 | 0.9216 | 0.0000066 |
| sand 1–3 | 0.000015 | 0.9216 | 0.0000058 |
| nuclear ground | 0.0000125 | 0.768 | — |
| paths / concrete / landfill | 0 | 0 | 0 |
| out-of-map | 0.0001 | 6.144 | — |

Sources: https://wiki.factorio.com/Pollution (2.0), https://raw.githubusercontent.com/wube/factorio-data/1.1.110/base/prototypes/tile/tiles.lua (1.1).

#### A2.4 Water, landfill, fish, offshore pump

| Item | Value | Source |
|---|---|---|
| Water / deep water | impassable for players & vehicles; nothing buildable on it; shallow water walkable (−20 %/−30 % speed) but not buildable; offshore pumps allowed where water meets land | https://wiki.factorio.com/Water |
| Landfill | 2.0: 50 stone → 1 landfill, 0.5 s, stack 100; 1.1 (before 2.0.7): 20 stone. Converts water tile to `landfill`; mining it back possible since 2.0.7. Fish under it are destroyed | https://wiki.factorio.com/Landfill |
| Raw fish | spawned in water only at generation (`autoplace influence = 0.01` per water tile in 1.1), never respawn; entity 20 HP; mining 0.4 s gives 5 fish; heals 80 HP; stack 100 | https://wiki.factorio.com/Raw_fish, 1.1.110 entities.lua |
| Offshore pump | 2×1 footprint on a shoreline; 1200 water/s (2.0 normal quality); no power; 150 HP; recipe (2.0) 2 iron gear + 3 pipe, 3 s | https://wiki.factorio.com/Offshore_pump |

---

### A3. Elevation, lakes, the starting lake, cliffs

#### A3.1 Elevation → water (1.1 "0_17-lakes-elevation", verified from core/prototypes/noise-programs.lua 1.1.110)

Term by term (all constants verified unless marked):
1. **Base noise**: `simple_variable_persistence_multioctave_noise`, 5 octaves, persistence 0.75, input scale 1/8 (fixed), output scale 1. (For `make_0_12like_lakes`: roughness noise = `terrain_octaves − 2` octaves, amplitude 1/2, input 1/2, persistence 0.7, clamped to [0.1, 0.9] after +0.3; lakes noise = full `terrain_octaves` (default 8), output scale 1/8, input 1/2, persistence from roughness.)
2. **Bias**: `lakes + bias`, `bias = 20` (Island preset: `bias = −1000` and `segmentation_multiplier / 4`, which makes everything ocean except the starting plateau → an island).
3. **Starting plateau** (guarantees land at spawn): `starting_plateau_basis(6-octave noise, seed1 = 2) + 20 + map.finite_water_level − distance × segmentation_multiplier / 10`.
4. **Combine**: `elevation = max(lakes + bias, starting_plateau)`.
5. **Water level correction** (`water_level_correct`): `max(map.wlc_elevation_minimum, elevation + map.wlc_elevation_offset)` — the *water coverage* slider is the offset; the minimum prevents −∞ for "no water".
6. **Scale**: divide by `segmentation_multiplier` (= water *scale* slider inverse; multiply x, y, distance inputs by it, divide outputs by it — https://togos.github.io/togos-example-noise-programs/).
7. **Starting lake**: `elevation = min(elevation, starting_lake_bottom)` where (1.1) `starting_lake_distance = distance_from(x, y, starting_lake_positions, 1024)`, `minimal_starting_lake_depth = 4`, and `starting_lake_noise = multioctave(seed, seed1 = 14, 5 octaves, persistence 0.75, input 1/8, output 1)` is added so the shore is irregular. 2.0 core equivalent: `elevation_magnitude × (−3 + (starting_lake_distance + starting_lake_noise) / 8) / 8` with `elevation_magnitude = 20`, lake noise 4 octaves, `octave_input_scale_multiplier 0.5`, persistence 0.68, input 1/8, output 0.8.
8. **Water rule**: tile is water where final elevation < 0; deep water < −2 (A2.2).
9. `starting_lake_positions` is a `MapPositionList` "calculated from starting positions and map seed" by the engine (not in Lua) [verified, lua-api noise-expressions]. **[approx]** in practice the lake centre lies a few dozen tiles from spawn in a seed-dependent direction; a clone can pick a random angle and radius ≈ 30–80 tiles.

Practical clone recipe (derived): `e = fbm(x/64, y/64, 5 octaves, 0.75) × 20 + 20`; `e = max(e, 20 + 20 − dist/10)` (plateau); `e = min(e, dist_to_lake_center − 4 + 2·noise)`; `water = e < 0`, `deep = e < −2`. FFF-390 confirms 2.0 keeps the same idea: land weight 1 and water > 1, starting area handled with distance terms [https://factorio.com/blog/post/fff-390].

#### A3.2 Cliffs

| Property | Value | Source |
|---|---|---|
| Nature | entities, not tiles; "no elevation is actually present" (visual trick); underground belts/pipes pass beneath; driving into them does no damage; nothing dropped when removed | https://wiki.factorio.com/Cliff |
| Placement grid | `grid_size = {4, 4}`, `grid_offset = {0, 0.5}` (1.1 data dump); FFF-219: cliffs sit on edges of 4×4-tile cells | https://raw.githubusercontent.com/DedlySpyder/FactorioRawData/main/data_raw/cliff/cliff, https://factorio.com/blog/post/fff-219 |
| Piece collision | top-level `collision_box {{-1,-0.5},{1,0.5}}` (each of the 20 orientations has its own bounding box; pieces are roughly 4 tiles long × 2 tall visually) | same dump |
| Orientations | 20: `west_to_east, north_to_south, east_to_west, south_to_north, west_to_north, north_to_east, east_to_south, south_to_west, west_to_south, north_to_west, east_to_north, south_to_east, west_to_none, none_to_east, east_to_none, none_to_west, north_to_none, none_to_south, south_to_none, none_to_north` | same dump; lua-api CliffPrototype ("16 configurations" + 4 none-endings) |
| map_color | 144,119,87 = #907757 | same dump |
| Generation rule | mark a 4×4 cell edge as "cliff-crossing" when elevation crosses a threshold contour `cliff_elevation_0 + k × cliff_elevation_interval` ([recalled] defaults 10 / 40); multiply by an independent **cliffiness** noise (1.1: `0.5 + clamp(2-octave noise, seed1 123, input 1/32, …)`, range 0.5–1.5, × `control:cliffs:richness` = continuity slider) to create gaps; then remove crossing edges until no cell has more than 2 crossing edges; never inside the starting area | https://factorio.com/blog/post/fff-219, 1.1.110 noise-programs.lua, https://lua-api.factorio.com/latest/auxiliary/noise-expressions.html (`cliff_elevation_0`, `cliff_elevation_interval`, `cliff_smoothing`, `cliff_richness` constants) |
| Removal | Cliff explosives: recipe 10 explosives + 1 grenade + 1 barrel (Space Age: +10 calcite), 8 s; stack 20; throw range 10 (15 legendary); effect radius 1.5; 2 shots/s; only usable on cliffs; damages nothing else; construction robots can use them; atomic bomb also removes cliffs | https://wiki.factorio.com/Cliff_explosives |

Clone recipe (derived): after elevation, for each 4×4 cell compute `floor((e − e0) / interval)` at the 4 corners; edges whose two ends differ in level and whose `cliffiness × noise > threshold` become cliff segments; run the "≤ 2 crossing edges per cell" pruning; render with the orientation table. Skip cliffs inside the starting radius (≈ 120–200 tiles).

---

### A4. Resources (iron, copper, coal, stone, uranium, crude oil)

#### A4.1 Prototype values

[verified, https://raw.githubusercontent.com/wube/factorio-data/master/base/prototypes/entity/resources.lua (2.0) and 1.1.110 (same numbers), https://wiki.factorio.com/Iron_ore, https://wiki.factorio.com/Uranium_ore, https://wiki.factorio.com/Crude_oil]

| Resource | map_color (0–1) | hex | mining time | stack | base_density | base_spots_per_km² | random_probability | random_spot_size (min–max) | regular_rq_factor_mult | starting_rq_factor_mult | starting area? | candidate_spot_count | sprite stage thresholds (ore/tile) | variations |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| iron-ore | 0.415, 0.525, 0.580 | #6A8694 | 1 s | 50 | 10 | 2.5 (default) | 1 | 0.25–2 | 1.10 | 1.5 | yes | 22 | 15000, 9500, 5500, 2900, 1300, 400, 150, 80 | 8 × 8 stages |
| copper-ore | 0.803, 0.388, 0.215 | #CD6337 | 1 s | 50 | 8 | 2.5 | 1 | 0.25–2 | 1.10 | 1.2 | yes | 22 | same | 8 × 8 |
| coal | 0, 0, 0 | #000000 | 1 s | 50 | 8 | 2.5 | 1 | 0.25–2 | 1.0 | 1.1 | yes | 21 (default) | same | 8 × 8 |
| stone | 0.690, 0.611, 0.427 | #B09C6D | 1 s | 50 | 4 | 2.5 | 1 | 0.25–2 | 1.0 | 1.1 | yes | 21 | same | 8 × 8 |
| uranium-ore | 0, 0.7, 0 | #00B300 (green glow at night) | 2 s, needs 10 sulfuric acid per 10 ore, electric/big drill only | 50 | 0.9 | 1.25 | 1 | 2–4 | 1.0 | — | **no** | 21 | 10000, 6330, 3670, 1930, 870, 270, 100, 50 | 8 × 8 |
| crude-oil | 0.78, 0.2, 0.77 | #C733C4 | 1 s per cycle (pumpjack) | fluid | 8.2 | 1.8 | 1/48 | 1–1 | 1.0 | — | **no** | 21 | single stage | 1 |

Crude-oil extra fields: `minimum = 60000`, `normal = 300000`, `infinite = true`, `infinite_depletion_amount = 10`, `additional_richness = 220000`, `resource_patch_search_radius = 12`, minable fluid amount 10. Interpretation [verified, https://wiki.factorio.com/Crude_oil]: 1 % yield = 300 pumpjack cycles, so `normal 300000 / 10 per cycle = 30000 cycles = 100 %`; a well never drops below 20 % (60000); output per cycle = yield % × 10 (cap 1000 units); one cycle = 1 s without modules; depletion only while cycles > 6000 and > 20 % of initial. Oil "patches" are sparse single-tile wells (`random_spot_size 1`, `random_probability 1/48` → about 1 in 48 tiles of the spot cone becomes a well) that the game groups for display within 12 tiles.

Sprite behaviour (for drawing): every ore tile picks 1 of 8 sprite variations by position hash and shows stage `s` where `s` is the first index with `amount ≥ threshold[s]` (stage 0 = ≥ 15000, richest/densest look; stage 7 = ≤ 80, nearly empty). Draw ore as clustered speckles in the resource colour on top of the ground tile, denser for lower stage index.

#### A4.2 The spot-noise placement algorithm (how patches are laid out)

[verified, https://raw.githubusercontent.com/wube/factorio-data/1.1.110/core/lualib/resource-autoplace.lua; FFF-258 https://factorio.com/blog/post/fff-258; lua-api noise docs]

Constants (defaults in the lib):
- `region_size = 1024` tiles (regular patches); `candidate_spot_count = 21` (iron/copper 22); starting region `region_size = 240` (2 × 120), `candidate_spot_count = 32`.
- `starting_resource_placement_radius = 120` tiles.
- `regular_patch_fade_in_distance = 300` tiles; `double_density_distance = 1300` tiles ("distance at which patches have twice as much stuff in them"); `regular_blob_amplitude_maximum_distance = spot_enlargement_maximum_distance = 1300`.
- `random_spot_size_minimum = 0.25`, `maximum = 2.00` (per-spot quantity jitter).
- `regular_rq_factor = multiplier × 1/10`, `starting_rq_factor = multiplier × 1/7` ("rq_factor is the ratio of the radius of a patch to the cube root of its quantity").
- blob amplitude multipliers 1/8 (regular and starting); `basement_value = min(−6 × regular_blob_amplitude_maximum, −6 × starting_blob_amplitude)`; `maximum_spot_basement_radius = 128`.
- `minimum_favorability_for_full_placement = 1/2`; `starting_spot_count = frequency_multiplier`.

Algorithm per region (FFF-258): generate `candidate_spot_count` random points in each region; compute density, quantity, radius, favourability at each; sort by favourability; keep points until the region's target quantity (average density × area) is reached. Each kept spot is a **cone** (rich centre, zero at the radius) perturbed by low-amplitude blob noise and lowered by a constant "basement" so that noise does not add quantity. Spots can "avoid water" because unsuitable candidates get low favourability and are skipped.

Formulas:
```
frequency_multiplier = control:<ore>:frequency ; size_multiplier = control:<ore>:size ; richness_multiplier = control:<ore>:richness
density_multiplier   = frequency_multiplier × size_multiplier
spots_per_km2_near_start = base_spots_per_km2 × frequency_multiplier

size_effective_distance(d) = d − 300                    (for ores that also have starting placement; ≈ d otherwise)
effective_distance         = clamp(size_effective_distance(d), 0, 1300)
regular_density(d) = base_density × density_multiplier × (1 + effective_distance / 1300) × clamp((d − 120) / 300, 0, 1)
regular_spot_quantity_base(d) = regular_density(d) × 1,000,000 / spots_per_km2_near_start
regular_spot_quantity = random(0.25 … 2) × regular_spot_quantity_base(d)
spot_radius = min(32, regular_rq_factor × quantity^(1/3))            (tiles)
spot_height = quantity^(1/3) / ((π/3) × rq_factor²)                  (ore per tile at the cone centre, before richness multipliers)
richness_distance_multiplier = max(1, (1300 + sed) / (1300 + 1300))   sed = size_effective_distance(d)
richness_per_tile = cone_value × richness_multiplier × richness_post_multiplier × richness_distance_multiplier + additional_richness, at least minimum_richness
probability = clamp(richness, 0, 1)  (ore exists where the cone is positive; random_penalty(1/random_probability) thins oil to 1/48 of tiles)
```
Reading the formulas: (1) no regular patches within 120 tiles; they fade in from 120 to 420 tiles. (2) From 300 to 1600 tiles from the origin, patch **quantity** grows linearly up to 2× (patches get bigger/richer). (3) Beyond 1600 tiles the per-tile **richness multiplier** grows linearly: `(1300 + (d − 300)) / 2600` → 2× at d = 3900, 4× at d = 9100, 10× at d ≈ 24700 tiles. (4) Default density per km² for iron = 10 → with 2.5 spots/km² a typical regular iron spot near the start targets `10 × 10⁶ / 2.5 = 4 M` ore × random(0.25–2) ⇒ ~1 M–8 M; copper/coal 3.2 M base; stone 1.6 M; uranium 0.72 M × random(2–4).

Starting area formulas [verified, same file]:
```
starting_frequency_multiplier = (frequency_multiplier − 1) × 0.5 + 1
starting_amount   = 40000 × base_density × starting_frequency_multiplier × size_multiplier
starting_area_spot_quantity = starting_amount / (1/2) / starting_spot_count   (starting_spot_count = frequency_multiplier)
starting_spot_radius = starting_rq_factor × quantity^(1/3)
starting_feasibility = clamp((elevation − 1) / 10, 0, 1) × [distance < 120]     (must be on land well above water level)
starting_favorability = starting_feasibility × 2 − distance / 120 + random(0.5)
```
At 100 % settings this gives design targets of **iron ≈ 800 k, copper ≈ 640 k, coal ≈ 640 k, stone ≈ 320 k** per starting patch (one patch each), radii ≈ `0.214 × 800000^(1/3) ≈ 19.9` tiles for iron, `0.171 × 640000^(1/3) ≈ 14.7` copper, `0.157 × 86 ≈ 13.5` coal, `0.157 × 68 ≈ 10.8` stone — i.e. a starting iron patch is roughly a 40-tile-wide blob with a few thousand ore in the centre tiles [derived]. Empirical reports agree in magnitude: ~2000 ore/tile near spawn (0.13, https://forums.factorio.com/viewtopic.php?t=40210); "iron in the starting area … about 3–4× more quantity" than copper since 0.15 (https://steamcommunity.com/app/427520/discussions/0/3247565033754774471/); 0.15 max settings 500 k–1.5 M starting totals vs 5–30 M elsewhere, lowest settings 100–200 k (https://forums.factorio.com/viewtopic.php?t=45744); far patches reach 20 M ore/tile and 50–100 M totals.

FFF-258 design intent: starting patches use a *separate* spot-noise expression, merged with the regular one via `max`; "starting area resources are usually in one ore patch each" and "cluster relatively close together".

Uranium and oil: `has_starting_area_placement = false` → never inside the starting radius; fade in 120→420 tiles like other regular patches; uranium spots are 2–4× the base quantity (few, large, ~0.9 density), oil 1.8 spots/km² of sparse wells.

---

### A5. Trees and forests

#### A5.1 Entity values

| Property | Living tree (tree-01 … tree-09 and colour variants) | Dead / dry trees | Source |
|---|---|---|---|
| max_health | 50 | 20 | https://wiki.factorio.com/Tree, data dump tree-01 / dead-dry-hairy-tree |
| mining time | 0.55 s | 0.5 s | same |
| yield | 4 wood | 2 wood | https://wiki.factorio.com/Wood |
| pollution | −0.001 /s at full leaves; −0.00067 (stage 1), −0.00033 (stage 2), 0 (stage 3, min leaves) | −0.0001 /s | https://wiki.factorio.com/Tree, trees.lua `tree_emissions` / `dead_tree_emissions` |
| collision_box | {{−0.4, −0.4}, {0.4, 0.4}} (0.8 × 0.8 tile; trees do not snap to the grid) | dead-dry-hairy-tree {{−0.6, −0.6}, {0.6, 0.6}} | data dump |
| selection_box / drawing_box | {{−0.9, −2.2}, {0.9, 0.6}} / {{−0.9, −3.9}, {0.9, 0.6}} (canopy drawn ~3.9 tiles above the trunk base) | {{−0.8, −0.8}, {0.8, 0.8}} | data dump |
| variations | 12 sprite variations (a–l) per type, sprites 66–620 px at scale 0.5; 4 leaf stages, leaves tintable | 12 | trees.lua, wiki |
| corpse / remains | `tree-XX-stump` | — | data dump |
| wood | fuel 2 MJ, stack 100, player starts with 1 wood; only raw material not automatable in base game | | https://wiki.factorio.com/Wood |

Pollution damage [verified, wiki Tree/Pollution]: when a chunk's pollution > 60 (map setting "minimum damage to trees"), once per second some trees in the chunk get a chance to lose one leaf stage (33 % or 50 % damage) or turn one stage greyer (6.7 %); each damaged tree absorbs 10 pollution; a tree stops degrading when grey % + lost-leaves % > 120 %.

#### A5.2 Tree types, biomes, colours

[verified, https://raw.githubusercontent.com/wube/factorio-data/master/base/prototypes/entity/trees.lua]

| Type | temperature (°C) | moisture | biome name | map_color | leaf tint palette (RGB) |
|---|---|---|---|---|---|
| tree-01 | 0–15 | 0.6–2.0 | wet, cold | 34,102,34 #226622 | 156,255,224; 118,243,152; 116,215,227; 221,209,80; 131,242,90; 83,185,138; 71,224,74; 230,242,41 |
| tree-02 | 0–15 | 0.4–0.8 | moist, cold | 107,144,62 #6B903E | 191,255,111; 209,200,152; 252,255,133; 230,178,94; 190,215,132; 204,175,110; 240,255,120; 194,208,87; 222,255,169; 150,201,111 |
| tree-02-red | 0–15 | 0.2–0.6 | — | 154,113,32 #9A7120 | 227,143,88; 226,196,94; 255,176,130; 221,189,103; 255,183,183; 255,149,65; 236,159,72; 255,127,62; 209,113,81; 207,118,60; 255,152,98; 255,135,135; 202,107,80; 212,128,90; 255,101,101; 255,117,117 |
| tree-03 | 15–45 | 0.4–0.8 | moist, hot | 119,128,48 #778030 | 230,253,66; 255,223,87; 170,187,65; 216,70,70; 179,238,95; 255,234,82; 238,171,71; 219,173,91; 231,214,129 |
| tree-04 | 13–17 | 0.7–2.0 | wet, medium | 70,120,100 #467864 | 213,255,156; 196,255,116; 212,255,150; 213,255,159; 146,211,235; 93,222,227; 186,255,167; 146,226,123; 56,188,125; 172,227,177; 183,255,200; 169,141,207 |
| tree-05 | 15–45 | 0.6–2.0 | wet, hot | 104,136,50 #688832 | 186,227,93; 211,241,139; 195,228,114; 200,242,94; 161,222,75; 182,216,67; 188,209,112; 190,231,54; 178,179,79; 173,173,82; 172,173,81; 167,168,96; 253,255,115 |
| tree-06 | 0–15 | 0.1–0.4 | dry, cold | 67,75,58 #434B3A | 108,135,42; 95,125,32; 150,170,70; 160,178,84 |
| tree-06-brown | 0–15 | 0.1–0.4 | — | 89,69,42 #59452A | 101,83,49; 110,98,65; 135,113,72 |
| tree-07 | 13–17 | 0.5–1.0 | moist, medium | 85,123,64 #557B40 | 184,239,125; 199,254,108; 125,203,83; 176,234,107; 165,226,103; 197,245,96; 146,208,73; 160,221,95; 191,236,131 |
| tree-08 | 13–17 | 0.2/0.3–0.7 | medium | 85,111,72 #556F48 | 71,133,73; 53,116,58; 82,147,85; 64,128,72 |
| tree-08-brown / -red | 13–17 | 0.2–0.7 | — | 107,85,62 #6B553E / 120,73,48 #784930 | brown: 94,83,64; 107,99,77; 124,110,87 — red: 148,74,54; 165,89,68; 195,117,91 |
| tree-09 | 15–45 | 0.2–0.6 | medium, hot | 119,128,48 #778030 | 204,232,107; 161,200,73; 185,220,99; 211,238,125; 135,180,54; 164,210,81; 210,239,110 |
| tree-09-brown / -red | 15–45 | 0.2–0.6 | — | #6B553E / #784930 | brown: 145,111,64; 160,129,84; 187,157,103 — red: 186,84,49; 194,100,65; 218,124,86 |
| dead-dry-hairy-tree, dead-grey-trunk, dead-tree-desert, dry-hairy-tree, dry-tree | dry areas (peaks-based, `max_probability 0.005` for dead-dry-hairy) | | deserts | (none) | grey / brown trunks |

#### A5.3 Forest density and the starting clearing

[verified, master trees.lua]
- Base tree probability expression: `min(0, distance/20 − 3) − 0.5 + 0.2 × control:trees:size + multioctave_noise(input_scale = 1/N × control:trees:frequency) + biome ramps(temperature, moisture)` → tree placed where the result is > 0 (the `distance/20 − 3` term is 0 beyond 60 tiles). Per-tree "richness" (leaf stage / variation) = `clamp(random_penalty_at(6, 1), 0, 1)`.
- **Starting clearing**: `starting_area_clearing_radius = 128`, `starting_area_clearing_border_width = 64` (peak influence −0.25, `distance_optimal 0, distance_range 64, distance_max_range 192`) → essentially no trees within 128 tiles of spawn, ramping to normal density by ~192 tiles.
- Trees are not grid-aligned; jitter their positions inside the tile. Collision 0.8 × 0.8 lets the player squeeze between trunks ("smaller bounding boxes, so it is easier to walk through forest" — wiki Tree).
- Clone recipe (derived): `forest = fbm(x/48, y/48, 3 oct) − 0.5 + 0.2 × coverage`; if `forest + biome_fit(temp, moist) > 0` and `dist > 128 + rand×64`, place a tree with probability ∝ forest; pick the type from the temperature/moisture table; tint leaves with a random entry of that type's palette; draw canopy 2–4 tiles above the base with a shadow.

---

### A6. Rocks (huge / big / sand)

[verified, https://raw.githubusercontent.com/DedlySpyder/FactorioRawData/main/data_raw/simple-entity/{rock-huge,rock-big,sand-rock-big} (1.1-era names; 2.0 renamed them huge-rock / big-rock / big-sand-rock) and https://wiki.factorio.com/Rock]

| Rock | collision_box (tiles) | selection_box | HP | mining time | yield | map_color | sprites | autoplace |
|---|---|---|---|---|---|---|---|---|
| rock-huge / huge-rock | {{−1.5, −1.1}, {1.5, 1.1}} (3.0 × 2.2) | {{−1.7, −1.3}, {1.7, 1.3}} | 2000 | 3 s | 24–50 stone **and** 24–50 coal | 129,105,78 #81694E | 16 | noise layer "rocks", octaves −2, water(moisture) optimal 0.825 range 0.175, aux optimal 0.5 range 0.5 |
| rock-big / big-rock | {{−1, −0.9}, {1, 1}} (2 × 1.9) | {{−1.2, −1.2}, {1.2, 1.2}} | 500 | 2 s | 20 stone (loot on destruction 9–25 in 1.1; since 2.0.7 destroyed rocks give nothing) | same | 20 | coverage 0.0025, max_probability 0.175, sharpness 0.7, same peaks |
| sand-rock-big / big-sand-rock | {{−0.75, −0.75}, {0.75, 0.75}} (1.5 × 1.5) | {{−1, −1}, {1, 0.75}} | 500 | 2 s | 19–25 stone | same | 16 | noise layer "rocks" (sand/desert look) |

Notes: `count_as_rock_for_filtered_deconstruction = true`; robots mine rocks instantly; rocks damage vehicles that hit them (high HP + impact resistance); they are `simple-entity` obstacles placed sparsely by a low-probability noise (≈ 0.25 % coverage) mostly in dry/desert regions. Draw as grey-brown boulders 1.5–3 tiles wide with a drop shadow.

---

### A7. Enemies and the "starting area" (brief, for completeness)

- `starting_area` (MapGenSize, default 1) is a "multiplier for 'biter free zone radius'" [verified, gist map-gen-settings example]; the starting area is "an almost circular radius around the spawn point that does not contain enemy bases" [verified, wiki Map_generator]; worm tier and base density increase with distance [verified, https://wiki.factorio.com/Enemies]. The exact base radius is not exposed in fetched Lua ([recalled] on the order of 150–200 tiles at 100 %; enemy-base spot noise then fades in beyond it).
- Death-world preset uses starting area 0.75, Ribbon world 3.

---

### A8. Palette cheat-sheet for procedural drawing

Exact minimap colours (`map_color`, from prototypes):
- Ground: grass-1 #37350B, grass-2 #42390F, grass-3 #41341C, grass-4 #3B2812, dry-dirt #5E4225, dirt-1 #8D683C … dirt-7 #50361C, sand-1 #8A673A, sand-2 #805D34, sand-3 #73532F, red-desert-0 #674620 … red-desert-3 #805D34, water #33535F, deepwater #264049, landfill #39271A, stone path #56524A, concrete #3F3D3B, refined #31302D, hazard #B08E27, nuclear ground #302823.
- Resources: iron #6A8694, copper #CD6337, coal #000000, stone #B09C6D, uranium #00B300, crude oil #C733C4.
- Trees: #226622, #6B903E, #778030, #467864, #688832, #434B3A, #557B40, #556F48 (+ brown #59452A/#6B553E, red #9A7120/#784930). Rocks #81694E. Cliffs #907757.

**[approx]** Suggested in-game (zoomed-in) texture palette, eyeballed from the game's tiles — grass greens #5B7A33 / #6E8A3A / #6A7C46 / #5F6B3C with darker speckle; dirt #9A7B55–#765C40; sand #C2A66B–#AD915B; red desert #9C6A42–#B5834F; water #1F4F6E with lighter #2A6A8C ripples; deep water #143A55; ore: draw 6–12 rounded specks per tile in the resource colour (iron slightly bluish grey, copper orange, coal near-black with grey highlights, stone beige, uranium bright green with glow at night), speck count scaled by sprite stage; oil: purple-black pool 1 tile with a dark shine.

---

## PART B — BROWSER / JS FACTORIO-LIKE GAMES AND ENGINE WRITE-UPS

### B0. Factorio's own belt implementation (the reference design)

| Fact | Value | Source |
|---|---|---|
| Item positions | fixed point, 1/256 tile ("All transport lines use fixed point positions with a resolution of 1/256" — boskid) | https://forums.factorio.com/viewtopic.php?f=18&t=100292 |
| Belt speeds | yellow 8/256 tile per tick (1.875 tiles/s, 32 ticks per tile), red 16 (3.75 t/s, 16 ticks), blue 24 (5.625 t/s, ~10.67 ticks), turbo 32 (7.5 t/s) | same + https://wiki.factorio.com/Transport_belts/Physics |
| Item spacing | 64/256 = 0.25 tile → 4 items per lane per tile (8 per tile), throughput per lane 7.5 / 15 / 22.5 / 30 items/s | same |
| Curve lane lengths | inner corner 106/256, outer corner 295/256 of a tile; splitter input line 179/256, output 0.5, 51/256 buffer | forum thread above |
| Two lanes | independent lanes; inserters only pick items logically on the tile in front of them | wiki Transport_belts/Physics |
| History | 0.12: items stopped being entities; became structs on invisible "rails"; collision = distance to the item ahead only; belt update −20 % time | https://www.factorio.com/blog/post/fff-82 |
| 0.15 optimisation | consecutive belts merged into one **transport line** sharing one item array; items store the **gap to the next item**, not absolute positions; moving a line = increment the terminal gap (two integers) instead of touching every item; "whenever a belt compresses – it will stay that way forever" ⇒ cache the index of the last positive gap (only ever decreases) ⇒ amortised O(1); inserters track absolute positions incrementally; lines are kept short (~9 tiles) under inserters/side-loads but up to ~100 tiles elsewhere; splitters are natural line boundaries; result ×50–100 on belt movement, ×5–10 overall | https://www.factorio.com/blog/post/fff-176 |

### B1. Surveyed projects

#### B1.1 FactorishJS (msakuta) — pure JS, DOM-rendered
Source: https://github.com/msakuta/FactorishJS, https://raw.githubusercontent.com/msakuta/FactorishJS/master/FactorishJS.js
- Implements: ore miners, transport belts, inserters, furnaces, assemblers, water well → boiler → steam engine, pipes/fluid boxes, inventories, recipe UI, minimap, manual harvesting, "god mode" (no player body).
- Architecture: single `FactorishJS.html` + `FactorishJS.js` + `perlinNoise.js` + `xorshift.js`; world is a flat 1-D array `board[x + y × size]` of `Tile {ironOre, copperOre, coalOre, structure}`; viewport 16 × 12 tiles with scrolling.
- Terrain: Perlin noise per ore type with different seeds (8/9/10), scaled like `noise × 4000 − 3000`; the ore with the highest positive value wins the tile → clustered patches.
- Items on belts: a **global `objects` array of `DropItem {type, x, y}` with fractional coordinates independent of tiles**; each belt's `objectResponse()` pushes items in its direction and clamps to tile edges; items just stop at a belt end unless the next tile also moves them. Inserters: per-frame check of source/destination with a cooldown timer.
- Loop: `setInterval(run, 50)` = 20 ticks/s; all objects then all tiles updated each tick. Rendering = DOM divs with background images, updated selectively.
- Save: whole state serialised to JSON via per-tile/structure `serialize()` into `localStorage['FactorishJSGameSave']` every 100 ticks.
- Pitfalls observed: every item iterated every tick regardless of viewport; no spacing enforcement between belt items at the belt layer; DOM proliferation stutters on large worlds; flickering harvest bar. Lesson: DOM per tile does not scale — use canvas; enforce spacing on the belt, not in the item.

#### B1.2 FactorishWasm (msakuta) — Rust/WASM + canvas/WebGL
Sources: https://github.com/msakuta/FactorishWasm, `src/terrain.rs`, `src/drop_items.rs`, `src/transport_belt.rs`, `src/inserter.rs`
- Implements: belts, underground belts, splitters, inserters, mining drills, furnaces (stone/electric), assemblers, chests, electric poles + power network, offshore pump/boiler/steam engine, pipes/underground pipes, labs + research, minimap, scenarios; save = download/upload a file.
- Terrain: chunks of **16 × 16 tiles** in a `HashMap<(cx, cy), Chunk>`; tile = `{water: bool, ore: (type, amount), image (neighbour-water bitmask for shore edges), grass_image}`; Perlin per ore + ocean noise with thresholds; ore amount = `noise × factor × distance-based multiplier` (exponential distance term), highest of four ores wins; a post-pass computes shore sprites across chunk borders; each chunk keeps a pre-rendered minimap buffer.
- Items: `GenSet` (generational ids) of `DropItem {type, x, y}` plus a **spatial hash** `HashMap<chunk, Vec<id>>` (chunk = `INDEX_CHUNK_SIZE × TILE_SIZE`); hit test = distance ≤ `DROP_ITEM_SIZE = 8 px` on both axes (16 px square); swap-remove from the chunk vector.
- Belt: constant speed `0.25 px-units per tick`; moves along rotation delta; snaps the perpendicular coordinate to the tile centre-line (this is how it fakes lanes/curves); belt itself enforces no spacing (spacing comes from the item hit test).
- Inserter: two states (`hold_item == None` → picking, else dropping); `INSERTER_TIME = 20` ticks cooldown per action; picks loose items at the input tile first, then the input structure's `can_output()`; **only picks up if the destination `can_input(item)`** (avoids holding an item forever); drops into structure `input()` or as a loose item on a "movable" tile (belt); arm drawn as 2 segments animated by `phase = cooldown / 20`.
- Lessons: generational ids + spatial hash makes item lookup O(1); checking the destination before pickup is the simplest inserter-deadlock guard; per-chunk minimap caches.

#### B1.3 shapez.io (tobspr) — JS + Canvas 2D, MIT, the most complete open-source reference
Sources: https://github.com/tobspr-games/shapez.io, `src/js/core/config.js`, `src/js/game/belt_path.js`, `src/js/game/systems/belt.js`, `src/js/game/systems/item_ejector.js`, `src/js/game/map_chunk.js`, `src/js/game/map_view.js`, `src/js/core/buffer_maintainer.js`, `src/js/game/time/game_time.js`, `src/js/savegame/savegame.js`, `src/js/platform/browser/storage_indexed_db.js`, https://deepwiki.com/tobspr-games/shapez.io/3.2-belt-and-item-transportation
- Constants: `tileSize 32 px`, `mapChunkSize 16 tiles` (512 px world), `mapChunkOverviewMinZoom 0.9` (below it chunks render as low-res "overview" buffers, `CHUNK_OVERLAY_RES = 3`), `beltSpeedItemsPerSecond 2` (× tier), `minerSpeedItemsPerSecond 0.4`, `itemSpacingOnBelts 0.63 tile`, `minimumTickRate 25`, `maximumTickRate 500`, zoom 0.1–3 (initial 1.9), belt sprite animation 14 frames, `backgroundCacheDPI 2`, buffer GC every 0.5 s.
- Game loop (`game_time.js`): fixed timestep; per frame `logicTimeBudget += deltaMs × speedMultiplier`; run logic ticks while budget ≥ `deltaMs` (`1000 / tickRate`), capped at `max(3, maxLogicStepsInQueue × tickRate / 60)` steps; pausing zeroes the budget (no spiral of death); rendering runs at rAF rate.
- **BeltPath** (`belt_path.js`): a *sequence of connected belt entities* with one item list: `spacingToFirstItem` + array of `[distanceToNext, item]` pairs (distance in tiles along the path; the last entry's distance = gap to the path end); `totalLength` = Σ per-belt effective lengths (straight 1, curves shorter/longer); `update()` walks items **from the end backwards**, gives each the velocity `beltSpeed × dt`, clamps against the item ahead by `itemSpacingOnBelts`, tracks a "compressed" prefix to skip work; when the last item's distance hits 0 it calls the cached **acceptor** (next building / next path) and, on success, propagates the "excess velocity" backwards so animation timing stays exact; `tryAcceptItem()` at the path start requires `spacingToFirstItem ≥ itemSpacingOnBelts` and pre-advances the new item by one tick; `extendOnEnd/extendOnBeginning/extendByPath/deleteEntityOnEnd/deleteEntityOnStart/deleteEntityOnPathSplitIntoTwo` rebuild lengths and clamp/redistribute item distances (items on removed belts are lost); rendering computes world positions via `computePositionFromProgress()` (finds the belt containing the progress and asks it for the local transform) and batches equal adjacent items into "stacks" to cut draw calls; a "potato mode" draws one representative item per path unless hovered; comments call out floating-point epsilon comparisons and ±0.02-tile tolerance in integrity checks; asserts prevent circular paths.
- **BeltSystem**: on belt added → find supplying belt (behind, must point into me) and follow-up belt (ahead, must accept my direction); merge two paths / extend one / create a single-entity path; on removal → delete single path, trim endpoint, or split into two; neighbours within a 1-tile buffer recompute their curve variant (rotation) after any change; each tick iterates all paths; belt sprites are drawn per chunk with frame = `time × speed × 14 × (126/42)`.
- **ItemEjector / ItemAcceptor** (the inserter-equivalent): each ejector slot caches its target (belt path or acceptor slot) — cache rebuilt only for tiles inside a **stale-area** rectangle when Ejector/Acceptor/Belt components change; each slot has `progress 0…1` incremented by `2 × dt × beltBaseSpeed × itemSpacingOnBelts`; at 1.0 it tries `beltPath.tryAcceptItem()` or `tryPassOverItem()` (processor, underground, storage, filter…); items in flight are drawn interpolated, capped by `maxProgress = (0.5 + spacingToFirstItem − itemSpacing) × 2` so they never overlap belt items.
- **Map chunks** (`map_chunk.js`): per chunk `lowerLayer[x][y]` (resource items), `contents[x][y]` (entities), `wireContents[x][y]`, `containedEntities`, `renderIteration` for cache keys; resource patches generated with an RNG seeded from `"x|y|seed"`; hard-coded patches at chunks (0,0) red, (−1,0) CuCuCuCu, (0,−1) RuRuRuRu, (−1,−1) green, (5,−2) SuSuSuSu; elsewhere patch chance `(0.9 − clamp(distChunks/25, 0, 1) × 0.5) / 4`; patch size `max(2, round(1 + clamp(distChunks/8, 0, 4)))`; a patch = `patchSize` overlapping circles (radius `min(1+i, patchSize)`, offset `(n−i)/2 + 2`, ellipse scale 0.9–1.1, fractional centre jitter) placed with a border `ceil(patchSize/2 + 3)` so it stays inside the chunk; only empty cells filled; content choice depends on distance (blue only > 2 chunks; star/windmill only ≥ 7 chunks; weights 100 rect, 50 + 2d circle, 20 + d star, 6 + d/2 windmill). Lesson: **generate patches per chunk with a chunk-seeded RNG so any chunk can be regenerated independently** — but keep patches inside chunk borders or handle spill-over deterministically.
- **Map view / caching** (`map_view.js`, `buffer_maintainer.js`): visible rect → tile rect → chunk range; draw order per chunk: background (grid + resource patches; grid pattern cached in an offscreen canvas at DPI 2 and drawn with `createPattern`) → belt underlay → belts → dynamic foreground (ejectors, acceptors, miners, items) → static foreground (buildings) → wires overlay; `BufferMaintainer` keeps `Map<key, Map<subKey, canvas>>`, frees canvases unused for the last GC iteration (GC every 0.5 s), tracks VRAM as `w × h × 4`, marks context-lost canvases; at zoom < 0.9 the game draws pre-rendered "aggregate" overview buffers (`chunkAggregateSize × mapChunkSize` tiles).
- **Save/load**: JSON `{version: 1010, dump, stats, lastUpdate, mods}`; sequential migrations `migrate1009to1010()…` (saves < 1000 rejected); `BasicSerializableObject` per component; browser backend = **IndexedDB** db `app_storage` v10, store `files` keyed by filename (private mode blocks it → user alert). Lesson: version your JSON from day one and write migrations; prefer IndexedDB (or at least compress) because localStorage caps at ~5 MB.

#### B1.4 Factorio-web-game (BartoszOsiej) — TypeScript + custom Canvas 2D engine
Source: https://github.com/BartoszOsiej/Factorio-web-game
- Conveyors, inserters, pipes, research tree, pollution + evolution, combat, co-op via Supabase Realtime; React 18 overlay for menus; engine ≈ 2500 lines: `engine.ts` (update/render loop, placement, inventory), `renderer.ts` (10 layer methods), `systems.ts` (supply chains, belts, pipes, AI, pollution), `world.ts`/`noise.ts` (chunk-based infinite Perlin world); tick-based simulation with decoupled render; cloud saves. Lesson: keep render code in one module with explicit layers; a ~2.5 k-line engine is enough for a playable clone.

#### B1.5 IsoFactory (JavsonOf/main) — single-file canvas build
Source: https://github.com/JavsonOf/main
- Isometric idle factory; modules `iso.js, entities.js, engine.js, products.js, economy.js, binding.js, audio.js, ui.js` concatenated by `build.js` into one **181 KB `isofactory.html`** (no server, no network).
- Fixed **1/60 s** simulation step with an accumulator and **max 5 steps per frame** ("a backgrounded tab can't spiral"), free-running rAF render; ~4.9 ms median frame at ~100 draw commands; painter's-algorithm depth `depth = (gx+gy) × 1000 + gz × 10 + layer`, render list sorted once per frame.
- Autosave every 5 s + on `visibilitychange`/`unload` to localStorage with in-memory fallback (private mode); loads discard corrupt JSON and clamp hostile values; offline earnings 55 % capped at 24 h. Lessons: build script → one HTML; pooled render commands; rate-based income instead of discrete events survives throttled tabs.

#### B1.6 Mindustry (Anuken) — Java/libGDX, per-tile conveyor arrays (design still relevant)
Source: https://raw.githubusercontent.com/Anuken/Mindustry/master/core/src/mindustry/world/blocks/distribution/Conveyor.java
- Each conveyor tile stores parallel arrays `ids[]`, `xs[]` (lateral 0–1), `ys[]` (longitudinal 0–1), `len` ≤ capacity **3**; `itemSpace = 0.4`; update walks items **in reverse**, advances by `speed × delta`, clamps against the item ahead (and the next block's first item when aligned); at `ys ≥ 1` the item is passed to the front block (`pass()` checks team + `acceptItem`); `minitem` = smallest `ys` decides acceptance: front feed needs `minitem ≥ itemSpace`, side feed needs `minitem > 0.7` and inserts at `ys = 0.5`; `clogHeat` accumulates when jammed; rendering rotates `(xs, ys)` by the tile rotation; deterministic depth sort avoids flicker; save = `len` then per item `id (short), xs × 127 (byte), ys × 255 − 128 (byte)`. Lessons: per-tile arrays are simpler than paths and serialise compactly; a per-tile capacity + `minitem` gives cheap back-pressure; quantise positions to bytes for saves.

#### B1.7 Jactorio (jaihysc) — C++/OpenGL clone, devlog lessons
Sources: https://github.com/jaihysc/Jactorio, https://github.com/jaihysc/Jactorio/wiki/Devlog
- 32-tile chunks; conveyor data was stored **per chunk, capping a conveyor group at 32 tiles** — the author calls this a mistake ("stop working at long distances"); recommends global storage of lines since updates iterate all of them anyway; "items get stuck on bending terminations" (threshold at curve ends); "2 lane swapping is meh" on splitters; inserters used to re-compress items. Lessons: do not tie belt segments to chunk boundaries; handle curve end thresholds explicitly.

#### B1.8 joyveyor (GRITui) — engine-agnostic C++ conveyor library
Source: https://github.com/GRITui/joyveyor
- SoA item pool; per belt an **arc-length-sorted position array** ("items move uniformly so relative order is preserved — no per-tick resort"); splitters 1:N (round-robin / ratio / priority, ≤ 4 outputs), mergers N:1 with bounded FIFO (64); back-pressure = `HeldBackpressure` state + entry gate closes when the next belt/queue is full; **per-tick order: sinks consume → nodes dispatch → belts move in reverse topological order → sources spawn → bookkeeping**; fixed **30 Hz** ticks with render interpolation; sub-stepping so an item never moves more than half a cell per step; GPU instancing per item type per visible chunk; belts drawn as instanced segments with scrolling UV; 32-bit handles instead of pointers; conservation invariants asserted.

#### B1.9 theor.xyz — "Conveyor belts à la Satisfactory with DOTS" (design write-up)
Source: https://theor.xyz/dots-burst-satisfactory-belts/
- Item = `{type, distanceToNext}` only; distances in **fixed point** (`BeltDistanceSubDiv = 16` → decrement by 1 per update); belts split into segments with prev/next refs; **process from the last segment backwards** (each parallel job starts at a segment with no `next`) so downstream space is known; transfer when distance hits 0 and `DistanceToInsertAtStart` of the next segment allows; items with distance > SubDiv can move without checking downstream; 1.3 M items in 11 ms, 10 M in 10 ms (rendering dominated); add iteration counters to loops while debugging; per-segment render culling works well.

#### B1.10 "Factorio's Belt Bug" (pubby.games)
Source: https://pubby.games/factorio.html
- A full **circular belt jams** with the naive "pessimistic" algorithm (move an item only if the space ahead is proven free — on a full loop nothing is proven free). Fix: "optimistic" algorithm — assume everything moves, then mark the positions that are actually blocked (starting from real blockers such as full inputs), with priority rules at merges. Lesson: treat blocking as a propagated flag, not as a per-item look-ahead, or loops deadlock.

#### B1.11 Factory Idle (Baldurans, Kongregate, closed source)
Sources: https://factoryidle.fandom.com/wiki/Conveyor, https://www.kongregate.com/en/games/baldurans/factory-idle
- Grid of variously sized components joined by conveyors; **1 item per tick per conveyor**, "packages" (an icon = N items after upgrades) keep the tick math trivial; inputs/outputs and crossings are resolved in a fixed clockwise order **top → right → bottom → left** everywhere; corner / 2-way / 4-way conveyor pieces. Lessons that worked: deterministic tie-break order for competing inputs; coarse ticks (a few per second) are fine for an idle-style UI; drag-to-lay belts.

#### B1.12 Other browser projects found (short notes)
- **Blocks and Belts** (itch.io, closed): pure JS + WebGL2, procedurally generated planet, belts, tech tree, combat/boss — shows WebGL2 is viable for a Factorio-like in browser [https://itch.io/t/1871013/blocks-and-belts].
- **Idle Grid Factory** (mezeman1.github.io/idle-factory-grid): browser idle factory with belts, tunnels under a bus, smelting; no repo details retrievable.
- **Industry Idle** (fishpondstudio, GPL-3, TypeScript, Cocos Creator 2.4): factory/economy idle without spatial belts [https://github.com/fishpondstudio/IndustryIdle].
- **DSPONLINE** (snowsnow0926, PolyForm-NC, React 19 + React Flow): "2D infinite canvas factory idle" that models logistics as a **node graph**, not tiles — deterministic production, offline calc, local saves + snapshots + cloud [https://github.com/snowsnow0926/DSPONLINE]. Alternative if tile belts are out of budget.
- **Brasero/factory-game** (React + TS + Vite, Canvas): monorepo with `packages/engine` (pure tick-based world, single `World` source of truth) and `apps/web` (React HUD via `useSyncExternalStore`); conveyors, separators, groupers, save/load [https://github.com/Brasero/factory-game].
- **GitHub topic factory-game** lists small JS canvas games (robot-islands, Gridworks, redirect-loop, Blueprint) — none with a documented belt engine [https://github.com/topics/factory-game]. GitHub topic `factorio?l=javascript` contains only tools (blueprint renderers, calculators), no clones.
- **Automation Empire** (DOG HOGGLER, 2019) is a Steam/PC game, not web [https://store.steampowered.com/app/1112790/Automation_Empire/]. **Mindustry** is Java (desktop/mobile), **Jactorio** C++ — desktop only. osgameclones lists only Jactorio and Mindustry for Factorio [https://osgameclones.com/factorio/].
- **Unity forum "fixed tick system for factory game"**: consensus toward event-driven building updates (subscribe only when a building can work), per-building output buffers so machines don't stall, and "input → process → output" phases; ECS demo reached 60 fps with 1 M items [https://discussions.unity.com/t/fixed-tick-system-for-factorie-game/1624158].

### B2. Design lessons for a single-file canvas Factorio-like (synthesised)

**Simulation loop**
1. Fixed timestep (60 ticks/s like Factorio, or 30 Hz like joyveyor) with an accumulator, hard cap on catch-up steps (IsoFactory 5, shapez.io `max(3, …)`), zero the budget on pause/visibility loss; render on rAF and interpolate item positions by `alpha = budget / dt` if you tick slower than 60.
2. Keep all game state in plain objects/typed arrays separate from rendering (Brasero, Factorio-web-game); UI reads snapshots.
3. Per-tick order (joyveyor / shapez.io): consumers (assemblers, chests, sinks) → routers (splitters, mergers) → belts from downstream to upstream → producers/ejectors (miners, inserter drops) → bookkeeping. Updating belts *downstream first* means each belt already knows how much room the next belt has.

**Belts**
4. Store items **per belt segment/path**, not as world objects (Factorio 0.12/0.15, shapez.io, theor). Either (a) *path model*: merged straight runs with `[gapToNext, item]` pairs and O(1) movement by adjusting the head gap (Factorio/shapez.io), or (b) *per-tile model*: arrays of ≤ 4 (Factorio density) or 3 (Mindustry) items with progress 0–1 per lane (Mindustry). (b) is simpler to implement in one file and to serialise; (a) is faster for long buses.
5. Use **integer / fixed-point** positions (Factorio 256 per tile, theor 16 sub-divisions) or at least quantised floats with epsilon compares; shapez.io's comments show the float pain (epsilon, ±0.02 tolerances).
6. Enforce spacing on the belt (`minitem`, `spacingToFirstItem`), never rely on item-vs-item collision searches (FactorishJS pitfall).
7. Two lanes: keep separate item lists per lane; side-loading inserts at the tile's midpoint (Mindustry `ys = 0.5`); curves have different lane lengths (Factorio inner 106/256, outer 295/256) — if you ignore that, keep both lanes at 1.0 but expect visual drift at corners.
8. Recompute belt connectivity only for the 1-tile neighbourhood of a changed tile (shapez.io); cache "next belt / acceptor" per belt or ejector and invalidate via a dirty-rect ("stale area") rather than global rebuilds.
9. Handle loops with an optimistic "everything moves unless flagged blocked" pass (pubby) or make the head-gap update independent of the tail.

**Inserters**
10. State machine `idle → picking → holding → dropping` with tick cooldowns (FactorishWasm 20 ticks); check `destination.canAccept(item)` before picking up; pick from the tile in front (belt lane or container), drop on the far lane / container; when the drop target is full keep holding and retry (no re-pick).
11. Inserters and machines should only tick when they can act (event/subscription lists — Unity thread, Factorio's inactive-chunk sleeping).

**World, chunks, generation**
12. Chunks of 16 or 32 tiles in a `Map` keyed by `"cx,cy"`; generate lazily around the viewport + margin; **seed the chunk RNG from (cx, cy, mapSeed)** (shapez.io `"x|y|seed"`) so generation is order-independent; do resource-patch placement with region-scoped spot selection (Factorio) or chunk-contained blobs (shapez.io) so chunk borders never cut patches unpredictably.
13. Cache each chunk's terrain (ground + ore speckles + shore edges) to an **offscreen canvas** once, redraw only when a tile changes (`renderIteration` key); draw belts/items/buildings per frame only for visible chunks; garbage-collect unused chunk canvases after a few seconds (shapez.io 0.5 s GC tick); track VRAM as `w×h×4`.
14. Compute shore/edge sprites in a post-pass that can read neighbouring chunks (FactorishWasm).
15. Zoomed-out mode: draw pre-baked low-res chunk overview buffers (shapez.io threshold zoom 0.9) instead of entities.

**Save/load**
16. JSON with a `version` number and sequential migrations (shapez.io 1010); serialise belts compactly (Mindustry: `len` + byte-quantised positions); autosave on interval + `visibilitychange`/`beforeunload`; wrap storage in try/catch with an in-memory fallback (IsoFactory); prefer IndexedDB over localStorage for saves > 1–2 MB, or compress; validate/clamp loaded values.

**UI patterns that worked**
17. Hotbar/toolbar with counts (FactorishJS), transparent placement preview, `R` rotate, drag-to-lay belts and rapid placement while holding the mouse (FrowningBoat devlog, Factory Idle), click a building → inventory window with drag-drop (FactorishJS), recipe picker showing inputs/outputs/time, minimap with viewport rectangle, hover-highlight of the belt path being inspected (shapez.io potato mode), "simplified rendering" toggle for weak devices.

### B3. Common pitfalls checklist

| Pitfall | Why it happens | Mitigation (source) |
|---|---|---|
| Belt deadlock on full loops | pessimistic per-item look-ahead | optimistic blocked-flag propagation (pubby); Factorio's gap model has no per-item look-ahead |
| Items jam at curve ends / segment boundaries | end-of-segment threshold vs. next-segment acceptance | explicit transfer when distance = 0 **and** next has room (theor); Jactorio "stuck on bending terminations" |
| Update-order artefacts (gaps appear, throughput drops) | upstream belt updated before downstream knows its free space | update downstream → upstream; propagate excess velocity back on hand-off (shapez.io) |
| Float drift in item positions | accumulating `speed × dt` | fixed point (Factorio 1/256, theor 1/16) or quantise; epsilon compares |
| Belt segments capped by chunk size | storing lines per chunk | store lines globally (Jactorio lesson) |
| O(n) item iteration every tick | global item list (FactorishJS) | per-belt lists; sleeping entities; spatial hash for loose items (FactorishWasm) |
| DOM rendering | one element per tile | canvas with cached chunk layers |
| Spiral of death after tab switch | unbounded catch-up | cap logic steps per frame; reset budget on pause |
| Cache invalidation bugs on belt place/remove | connectivity caches stale | 1-tile neighbourhood recompute + stale-area rects (shapez.io) |
| Inserter holds an item forever | picked without checking destination | check `can_input` first (FactorishWasm); retry on drop |
| Patches cut by chunk borders | per-chunk generation of world-scale features | region/spot selection (Factorio) or keep blobs inside chunk with a border (shapez.io) |
| Lost items when belts are deleted | items on removed segment | accept the loss (shapez.io) or spill to ground / player inventory |
| localStorage quota / private mode exceptions | 5 MB cap, blocked storage | try/catch, in-memory fallback, IndexedDB (shapez.io, IsoFactory) |
| Non-deterministic ordering of competing inputs | iteration order varies | fixed clockwise priority (Factory Idle top→right→bottom→left), deterministic iteration (joyveyor) |

---

### Sources (all fetched)
- https://wiki.factorio.com/Map_generator
- https://wiki.factorio.com/Map_structure
- https://wiki.factorio.com/Tree
- https://wiki.factorio.com/Wood
- https://wiki.factorio.com/Rock
- https://wiki.factorio.com/Cliff
- https://wiki.factorio.com/Cliff_explosives
- https://wiki.factorio.com/Iron_ore
- https://wiki.factorio.com/Crude_oil
- https://wiki.factorio.com/Uranium_ore
- https://wiki.factorio.com/Pollution
- https://wiki.factorio.com/Offshore_pump
- https://wiki.factorio.com/Water
- https://wiki.factorio.com/Landfill
- https://wiki.factorio.com/Raw_fish
- https://wiki.factorio.com/Tile
- https://wiki.factorio.com/Enemies
- https://wiki.factorio.com/Transport_belts/Physics
- https://lua-api.factorio.com/latest/auxiliary/noise-expressions.html
- https://lua-api.factorio.com/latest/concepts/MapGenSettings.html
- https://lua-api.factorio.com/latest/prototypes/CliffPrototype.html
- https://raw.githubusercontent.com/wube/factorio-data/master/base/prototypes/entity/resources.lua
- https://raw.githubusercontent.com/wube/factorio-data/1.1.110/base/prototypes/entity/resources.lua
- https://raw.githubusercontent.com/wube/factorio-data/master/base/prototypes/tile/tiles.lua
- https://raw.githubusercontent.com/wube/factorio-data/1.1.110/base/prototypes/tile/tiles.lua
- https://raw.githubusercontent.com/wube/factorio-data/master/base/prototypes/entity/trees.lua
- https://raw.githubusercontent.com/wube/factorio-data/1.1.110/base/prototypes/entity/trees.lua
- https://raw.githubusercontent.com/wube/factorio-data/1.1.110/base/prototypes/entity/entities.lua
- https://raw.githubusercontent.com/wube/factorio-data/1.1.110/core/lualib/resource-autoplace.lua
- https://raw.githubusercontent.com/wube/factorio-data/master/core/lualib/resource-autoplace.lua
- https://raw.githubusercontent.com/wube/factorio-data/1.1.110/core/prototypes/noise-programs.lua
- https://raw.githubusercontent.com/wube/factorio-data/master/core/prototypes/noise-programs.lua
- https://raw.githubusercontent.com/wube/factorio-data/master/core/lualib/autoplace_utils.lua
- https://raw.githubusercontent.com/wube/factorio-data/master/base/prototypes/map-gen-presets.lua
- https://raw.githubusercontent.com/DedlySpyder/FactorioRawData/main/data_raw/simple-entity/rock-huge
- https://raw.githubusercontent.com/DedlySpyder/FactorioRawData/main/data_raw/simple-entity/rock-big
- https://raw.githubusercontent.com/DedlySpyder/FactorioRawData/main/data_raw/simple-entity/sand-rock-big
- https://raw.githubusercontent.com/DedlySpyder/FactorioRawData/main/data_raw/cliff/cliff
- https://raw.githubusercontent.com/DedlySpyder/FactorioRawData/main/data_raw/tree/tree-01
- https://raw.githubusercontent.com/DedlySpyder/FactorioRawData/main/data_raw/tree/dead-dry-hairy-tree
- https://factorio.com/blog/post/fff-258
- https://factorio.com/blog/post/fff-219
- https://factorio.com/blog/post/fff-390
- https://www.factorio.com/blog/post/fff-176
- https://www.factorio.com/blog/post/fff-82
- https://togos.github.io/togos-example-noise-programs/
- https://forums.factorio.com/viewtopic.php?t=40210
- https://forums.factorio.com/viewtopic.php?t=53984
- https://forums.factorio.com/viewtopic.php?t=40505
- https://forums.factorio.com/viewtopic.php?t=45744
- https://forums.factorio.com/viewtopic.php?f=18&t=100292
- https://forums.factorio.com/viewtopic.php?t=31293
- https://steamcommunity.com/app/427520/discussions/0/3247565033754774471/
- https://gist.github.com/MKuckert/2db1dc4afcaefb9ead7dbc57fb33a024
- https://github.com/msakuta/FactorishJS
- https://raw.githubusercontent.com/msakuta/FactorishJS/master/FactorishJS.js
- https://github.com/msakuta/FactorishWasm
- https://raw.githubusercontent.com/msakuta/FactorishWasm/master/src/terrain.rs
- https://raw.githubusercontent.com/msakuta/FactorishWasm/master/src/drop_items.rs
- https://raw.githubusercontent.com/msakuta/FactorishWasm/master/src/transport_belt.rs
- https://raw.githubusercontent.com/msakuta/FactorishWasm/master/src/inserter.rs
- https://github.com/tobspr-games/shapez.io (config.js, belt_path.js, systems/belt.js, systems/item_ejector.js, map_chunk.js, map_view.js, core/buffer_maintainer.js, time/game_time.js, savegame/savegame.js, platform/browser/storage_indexed_db.js)
- https://deepwiki.com/tobspr-games/shapez.io/3.2-belt-and-item-transportation
- https://deepwiki.com/tobspr-games/shapez.io/3-game-mechanics
- https://github.com/BartoszOsiej/Factorio-web-game
- https://github.com/JavsonOf/main
- https://raw.githubusercontent.com/Anuken/Mindustry/master/core/src/mindustry/world/blocks/distribution/Conveyor.java
- https://github.com/jaihysc/Jactorio
- https://github.com/jaihysc/Jactorio/wiki/Devlog
- https://github.com/GRITui/joyveyor
- https://theor.xyz/dots-burst-satisfactory-belts/
- https://pubby.games/factorio.html
- https://factoryidle.fandom.com/wiki/Conveyor
- https://www.kongregate.com/en/games/baldurans/factory-idle
- https://itch.io/t/1871013/blocks-and-belts
- https://mezeman1.github.io/idle-factory-grid/
- https://github.com/fishpondstudio/IndustryIdle
- https://github.com/snowsnow0926/DSPONLINE
- https://github.com/Brasero/factory-game
- https://github.com/topics/factory-game
- https://osgameclones.com/factorio/
- https://store.steampowered.com/app/1112790/Automation_Empire/
- https://discussions.unity.com/t/fixed-tick-system-for-factorie-game/1624158
- https://frowningboat8.itch.io/factory-game-prototype/devlog/760961/factory-game-conveyor-update
