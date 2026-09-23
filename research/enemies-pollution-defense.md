# Factorio — Enemies, Pollution and Defense (reference for a browser clone)

Facet key: `enemies-pollution-defense`
Compiled 2026-09-22 from the official wiki (wiki.factorio.com), the official Lua API docs (lua-api.factorio.com) and the official prototype data repository (github.com/wube/factorio-data, `master` = 2.0 line, tag `1.1.110` = 1.1 line). Where 1.1 and 2.0 differ, both values are given and labelled. Values without a label are identical in 1.1 and 2.0.

Conventions used everywhere below:

| Unit | Meaning |
|---|---|
| tick | 1/60 s (game runs at 60 UPS) |
| tile | 1 m; also the unit of all distances/ranges |
| chunk | 32 × 32 tiles = 1024 tiles |
| speed | prototype `movement_speed` is in tiles/tick; ×60 = tiles/s; ×216 = km/h (as shown in-game) |
| resistance "D/P%" | flat decrease D then percentage P (see section 12 for the formula) |
| PU | pollution unit |

---

## 1. Pollution

### 1.1 Pollution produced per minute (at 100 % activity, no modules)

Source: https://wiki.factorio.com/Pollution and prototype fields `emissions_per_minute` in `base/prototypes/entity/entities.lua`, `mining-drill.lua` (identical in 1.1.110 and master).

| Entity | PU / minute | Notes |
|---|---|---|
| Burner mining drill | 12 | |
| Electric mining drill | 10 | |
| Pumpjack | 10 | |
| Stone furnace | 2 | |
| Steel furnace | 4 | |
| Electric furnace | 1 | |
| Boiler | 30 | the single biggest early polluter |
| Assembling machine 1 | 4 | |
| Assembling machine 2 | 3 | |
| Assembling machine 3 | 2 | |
| Oil refinery | 6 | |
| Chemical plant | 4 | |
| Centrifuge | 4 | |
| Burner generator (prototype exists, not craftable in vanilla) | 10 | |
| Fire / burning tree | 0.3 | wiki |
| Steam engine, steam turbine, offshore pump, pump, inserters (all incl. burner inserter), belts, lab, radar, solar panel, accumulator, poles, turrets, walls, roboports, trains | 0 | no `emissions_per_minute` field |
| Trees (healthy, max leaves) | −0.06 (= −0.001 PU/s per tree) | absorber, see 1.3 |
| Dead tree | −0.006 (= −0.0001 PU/s) | absorber |

Rules (wiki "Pollution"):
* Emission is proportional to actual activity: a machine that is idle emits nothing; a machine that works at 50 % duty emits 50 %.
* Pollution is also proportional to energy consumption: `final pollution per minute = base pollution × energy usage multiplier × pollution multiplier` (modules). Efficiency modules therefore reduce pollution; speed/productivity modules increase it (they raise energy use and have an explicit +pollution stat).
* Burner machines: pollution is per the entity, fuel type does not change it (vanilla base game).
* 2.0 Space Age additions (for completeness): foundry 6, electromagnetic plant 4, cryogenic plant 6, recycler 2, big mining drill 40, heating tower 100, biolab 8, crusher 1, biochamber −1, captive biter spawner −1.

### 1.2 Storage, update interval, spreading

Source: https://wiki.factorio.com/Pollution ; `base/prototypes/map-settings.lua` (identical values in 1.1.110 and master); https://lua-api.factorio.com/latest/concepts/PollutionMapSettings.html

* Pollution is stored **per chunk (32×32 tiles)** as one floating-point number ("an abstract cloud").
* The chunk value is updated **every 64 ticks** (wiki: "4 ticks more than a game-second"). The map-settings comments say the constants are "values for 60 ticks (1 simulated second)".
* Each update: add emissions of all entities in the chunk, subtract absorption of tiles/trees/spawners, then diffuse.
* **Diffusion**: as soon as a chunk holds ≥ `min_to_diffuse` = **15 PU**, it gives `diffusion_ratio` = **2 %** of its pollution to **each** of its 4 cardinal neighbours per update (so up to 8 % leaves per update). Pollution is never lost by diffusion, only moved.
* **Absorption** (`ageing` = 1.0 = "absorption modifier 100 %"): every tile absorbs `absorptions_per_second` (2.0 name) / `pollution_absorption_per_second` (1.1 name) PU per second. Chunk absorption = Σ over its 1024 tiles + trees + spawners. A chunk cannot go below 0.
* Map display: values < `min_to_show_per_chunk` = 50 are drawn as 50; values > `expected_max_per_chunk` = 150 are drawn as 150 (only visualisation).

| Map setting (`map_settings.pollution`) | Default | Meaning |
|---|---|---|
| enabled | true | |
| diffusion_ratio | 0.02 | share given to a neighbouring chunk |
| min_to_diffuse | 15 | chunk must hold this much to start diffusing |
| ageing | 1 | multiplier on tile absorption ("absorption modifier") |
| expected_max_per_chunk | 150 | visual cap |
| min_to_show_per_chunk | 50 | visual floor |
| min_pollution_to_damage_trees | 60 | trees start losing leaves above this |
| pollution_with_max_forest_damage | 150 | |
| pollution_per_tree_damage | 50 | |
| pollution_restored_per_tree_damage | 10 | "absorbed per damaged tree" |
| max_pollution_to_restore_trees | 20 | 1.1 only (removed in 2.0) |
| enemy_attack_pollution_consumption_modifier | 1 | "attack cost modifier" (multiplies the PU cost of every attacking unit) |

### 1.3 Absorption by tiles (per tile per second, and per full chunk per minute)

Source 2.0: `base/prototypes/tile/tile-pollution-values.lua` + `tiles.lua` (master); 2.0 wiki table on https://wiki.factorio.com/Pollution. Source 1.1: `base/prototypes/tile/tiles.lua` tag 1.1.110 lines 15–23.

| Tile family | 2.0 per tile / s | 2.0 per chunk / min (×1024×60) | 1.1 per tile / s | 1.1 per chunk / min |
|---|---|---|---|---|
| water, deepwater, water-green, water-shallow, water-mud | 0.000025 | 1.536 | 0.000005 | 0.3072 |
| grass-1..4 | 0.000018 | 1.10592 | 0.0000075 | 0.4608 |
| dirt-1..7, dry-dirt | 0.000018 | 1.10592 | 0.0000066 | 0.4055 |
| sand-1..3 | 0.000015 | 0.9216 | 0.0000058 | 0.3564 |
| red-desert-0..3 | 0.000015 | 0.9216 | 0.0000066 | 0.4055 |
| nuclear-ground | 0.0000125 (= water × 0.5) | 0.768 | 0.0000025 | 0.1536 |
| out-of-map (map edge) | 0.0001 | 6.144 | 0.00001 | 0.6144 |
| stone path, concrete (all variants), refined concrete, landfill, lab tiles | 0 | 0 | 0 | 0 |

Trees (`base/prototypes/entity/trees.lua`, both versions): healthy tree `emissions_per_second = −0.001` (= −0.06 PU/min each); dead tree / dry tree −0.0001. The wiki lists per leaf stage: stage 0 (full) −0.001/s, stage 1 −0.00067/s, stage 2 −0.00033/s, stage 3 (bare) 0. A dense forest chunk (≈ 100–200 trees) therefore absorbs roughly 6–12 PU/min, far more than the ground.

Tree damage (wiki + settings): when a chunk's pollution exceeds **60 PU** trees in it start to lose leaves / turn grey; each such damage step removes **10 PU** from the chunk (`pollution_restored_per_tree_damage`), and damage becomes maximal at 150 PU. A fully bare tree absorbs nothing.

### 1.4 Absorption by enemy spawners and conversion into attackers

Source: https://wiki.factorio.com/Pollution (2.0 text), https://wiki.factorio.com/Enemies, prototype `biter-spawner` / `spitter-spawner` (`enemies.lua`).

* Prototype: 1.1 `pollution_absorption_absolute = 20`, `pollution_absorption_proportional = 0.01`; 2.0 `absorptions_per_second = { pollution = { absolute = 20, proportional = 0.01 } }`.
* Wiki (2.0): "If a chunk's pollution is greater than 20, each enemy spawner absorbs **20 + 0.01 × [chunk's pollution]** every 64 ticks." Absorbed pollution is credited to the spawner.
* The wiki adds a cap: a spawner will not bank more than **3 × the pollution cost of the most expensive unit it can currently spawn** (so pollution is not hoarded forever).
* Each unit type has a pollution price (`pollution_to_join_attack` 1.1 / `absorptions_to_join_attack` 2.0). When the spawner's banked pollution reaches the price of a unit it chooses a unit type according to the evolution-weighted table (section 4.2), spawns it and sends it to the gathering attack group. The price is multiplied by `enemy_attack_pollution_consumption_modifier` (default 1).

| Unit | Pollution cost to join an attack |
|---|---|
| Small biter | 4 |
| Small spitter | 4 |
| Medium spitter | 12 |
| Medium biter | 20 |
| Big spitter | 30 |
| Big biter | 80 |
| Behemoth spitter | 200 |
| Behemoth biter | 400 |

Worked example: one boiler (30 PU/min) reaching a nest with nothing absorbing in between finances 7.5 small biters per minute at evolution 0.

### 1.5 Pollution and the map

* Pollution has no owner/source once emitted; the game does **not** remember which machine produced it (forum, https://forums.factorio.com/viewtopic.php?t=132318).
* Only the pollution that reaches a chunk containing a spawner does anything hostile. If the cloud never touches a nest, there are no pollution attacks (https://forums.factorio.com/viewtopic.php?t=57274, wiki Enemies "Defense").

---

## 2. Evolution factor

Source: https://wiki.factorio.com/Enemies (Evolution section, identical in the 1.1 revision oldid=201859), `map-settings.lua`, https://lua-api.factorio.com/latest/concepts/EnemyEvolutionMapSettings.html

Per force ("enemy"), starts at 0, range [0, 1). Three sources (`map_settings.enemy_evolution`):

| Source | Setting | Default | Pollution equivalent (wiki) |
|---|---|---|---|
| Time | `time_factor` | 0.000004 per second (= 0.000004/60 per tick) | 267 PU per minute |
| Pollution **produced** (not absorbed) | `pollution_factor` | 0.0000009 per PU | 1 |
| Spawner destroyed | `destroy_factor` | 0.002 per spawner (not worms) | 2222 PU |

Formula (wiki): all increments are summed into `total_evolution`; the displayed factor is
`evolution_factor = total_evolution / (1 + total_evolution)`.
Equivalent incremental form: each marginal increase is multiplied by `(1 − evolution_factor)²` before being added, so the factor asymptotically approaches but never reaches 1.0.

Time-only evolution (no pollution, no kills): `evo(t) = T/(1+T)` with `T = 0.000004 × seconds`. 1 h → 1.4 %; 10 h → 12.6 %.

Reference table (wiki "Enemies"): value needed from a single source to reach a given factor.

| Evolution | Pollution equiv. | Hours equiv. (time only) | Spawners destroyed | New unit types become possible |
|---|---|---|---|---|
| 10 % | 123 k | 7.7 | 56 | — |
| 20 % | 278 k | 17.4 | 125 | Medium biter |
| 25 % | 370 k | 23.1 | 167 | Small spitter |
| 30 % | 476 k | 29.8 | 215 | Medium worm (expansion) |
| 40 % | 741 k | 46.3 | 334 | Medium spitter |
| 50 % | 1.111 M | 69.4 | 500 | Big biter, big spitter, big worm |
| 60 % | 1.667 M | 104.2 | 750 | small biters stop spawning (biter nests) |
| 70 % | 2.592 M | 162.0 | 1167 | small spitters stop spawning |
| 80 % | 4.444 M | 277.8 | 2000 | — |
| 90 % | 10 M | 625.0 | 4500 | Behemoth biter, behemoth spitter, behemoth worm |
| 95 % | 21 M | 1319.4 | 9500 | — |
| 99 % | 110 M | 6875.0 | 49500 | — |

Presets (`map-gen-presets.lua`): death world time_factor 0.00002 / pollution_factor 0.0000012; death world marathon 0.000015 / 0.0000010; rail world time_factor 0.000002. Death-world also sets pollution `ageing = 0.5` and `enemy_attack_pollution_consumption_modifier = 0.5` (0.8 for marathon). The in-game GUI shows these as "time factor 40", "destroy factor 200", "pollution factor 9" (units of 10⁻⁷).

Other effects of evolution: spawner spawn cooldown shrinks (section 4.1); expansion cooldown shrinks and groups grow (section 6); 2.0 only: wild nest max health rises exponentially with evolution up to 10 × (350 → 3500).

---

## 3. Enemy units

Source: prototype data `base/prototypes/entity/enemies.lua` (1.1.110 and master, values identical unless noted), `enemy-constants.lua` / `spitter-projectiles.lua`, `enemy-projectiles.lua`; wiki https://wiki.factorio.com/Enemies and its pre-2.0 revision https://wiki.factorio.com/index.php?title=Enemies&oldid=201859.

### 3.1 Biters (melee)

| | Small biter | Medium biter | Big biter | Behemoth biter |
|---|---|---|---|---|
| Health | 15 | 75 | 375 | 3000 |
| Regeneration (`healing_per_tick`) | 0.01 (0.6 HP/s) | 0.01 (0.6 HP/s) | 0.02 (1.2 HP/s) | 0.1 (6 HP/s) |
| Damage per bite (physical) | 7 | 15 | 30 | 90 |
| Attack cooldown (ticks) | 35 (±15 %) | 35 | 35 | 50 |
| Attacks per second | 1.71 | 1.71 | 1.71 | 1.2 |
| DPS vs unarmoured | 12 | 25.7 | 51.4 | 108 |
| Attack range (tiles, box-to-box) | 0.5 | 1 | 1.5 | 1.5 |
| `movement_speed` (tiles/tick) | 0.2 | 0.24 | 0.23 | 0.3 |
| Speed tiles/s (km/h) | 12 (43.2) | 14.4 (51.8) | 13.8 (49.7) | 18 (64.8) |
| Resistances | none | physical 4/10 %, explosion 0/10 % | physical 8/10 %, explosion 0/10 % | physical 12/10 %, explosion 12/10 % |
| Collision box (tiles) | 0.4 × 0.4 | 0.6 × 0.6 | 0.8 × 0.8 | 0.8 × 0.8 |
| Sprite scale | 0.5 | 0.7 | 1.0 | 1.2 |
| Pollution to join attack | 4 | 20 | 80 | 400 |
| `spawning_time_modifier` (multiplies nest cooldown after spawning it) | 1 | 1 | 3 | 12 |
| Earliest evolution (from nest weight tables) | 0 | 0.20 | 0.50 | 0.90 |

Common unit fields (all biters and spitters): `vision_distance = 30` tiles, `min_pursue_time = 600` ticks (10 s), `max_pursue_distance = 50` tiles, `distraction_cooldown = 300` ticks (5 s), `ai_settings = { destroy_when_commands_fail = true, allow_try_return_to_spawner = true }`, `range_mode = "bounding-box-to-bounding-box"`. Corpses are left behind (decorative).

Reference DPS of a small-biter horde vs a stone wall (350 HP, physical 3/20 %): each bite does (7−3)×0.8 = 3.2 → 5.5 DPS per biter; 10 biters kill a wall segment in ~6.4 s.

### 3.2 Spitters (ranged, acid)

Direct hit and puddle values from `enemy-constants.lua` (`damage_modifier_spitter_*`, `damage_splash_spitter_*`, `range_spitter_*`) and the wiki.

| | Small spitter | Medium spitter | Big spitter | Behemoth spitter |
|---|---|---|---|---|
| Health | 10 | 50 | 200 | 1500 |
| Regeneration | 0.01/tick | 0.01/tick | 0.01/tick | 0.1/tick |
| Direct hit damage (acid) | 12 | 24 | 36 | 60 |
| Attack cooldown | 100 ticks (±15 %) → 0.6 shots/s | 100 | 100 | 100 |
| Range (tiles) | 13 | 14 | 15 | 16 |
| `min_attack_distance` (stops approaching) | 10 | 10 | 10 | 10 |
| Acid puddle damage (acid, per second, wiki) | 7.2 | 28.8 | 130 | 360 |
| Puddle formula | `splash 0.1 × 12 × 6/s` | `0.2 × 24 × 6` | `0.6 × 36 × 6` | `1.0 × 60 × 6` |
| Puddle radius (`stream_radius`) | 1 | 1.25 | 1.35 | 1.75 |
| Slow-down sticker on hit target | 60 % speed for 2 s | 50 % for 2 s | 40 % for 2 s | 30 % for 2 s |
| Movement speed (tiles/tick) | 0.185 | 0.165 | 0.15 | 0.15 |
| Speed tiles/s (km/h) | 11.1 (40.0) | 9.9 (35.6) | 9 (32.4) | 9 (32.4) |
| Resistances | none | explosion 0/10 % | explosion 0/15 % | explosion 0/30 % |
| Collision box | 0.6 × 0.6 | 0.8 × 0.8 | 0.8 × 0.8 | 0.8 × 0.8 |
| Sprite scale | 0.5 | 0.7 | 1.0 | 1.2 |
| Pollution to join attack | 4 | 12 | 30 | 200 |
| `spawning_time_modifier` | 1 | 1 | 3 | 12 |
| Earliest evolution | 0.25 | 0.40 | 0.50 | 0.90 |

Acid puddle ("acid-splash-fire-*", a `fire` prototype): `initial_lifetime = 60×32` ticks (wiki: 32 s), `maximum_lifetime = 1800` ticks, `damage_multiplier_decrease_per_tick = 0.005`, `maximum_damage_multiplier = 3`, damage is applied to anything standing in it. Spitter projectiles arc over walls (walls do not block them). Spitters keep distance ≥ 10 tiles and kite, so they out-range small-arms (pistol 15) only marginally and are out-ranged by gun turrets (18).

### 3.3 Worms (stationary enemy turrets)

Source: `turrets.lua` (both versions), `enemy-constants.lua`/`spitter-projectiles.lua` (ranges, damage), wiki.

| | Small worm | Medium worm | Big worm | Behemoth worm |
|---|---|---|---|---|
| Health 1.1 | 200 | 400 | 750 | 750 |
| Health 2.0 | 200 | 500 | 1500 | 3000 |
| Regeneration | 0.01/tick | 0.015/tick | 0.02/tick | 0.02/tick |
| Range (tiles) | 25 | 30 | 38 | 48 |
| Prepare range (starts to emerge) = range + | 8 → 33 | 16 → 46 | 24 → 62 | 36 → 84 |
| Direct hit (acid) | 36 | 48 | 72 | 96 |
| Puddle damage per second (wiki) | 21.6 | 57.6 | 259 | 691 |
| Puddle radius | 1.4 | 1.55 | 1.75 | 2 |
| Effective attack rate (wiki) | 0.65/s (prototype cooldown 4 ticks + start/end attack animations 0.034/0.016) | 0.65/s | 0.65/s | 0.65/s |
| Resistances 1.1 | none | physical 5/0 %, explosion 5/15 %, fire 2/50 % | physical 10/0 %, explosion 10/30 %, fire 3/70 % | same as big |
| Resistances 2.0 (adds laser) | none | + laser 0/20 % | + laser 0/50 % | + laser 0/80 % |
| Collision box | 1.8 × 1.6 | 2.2 × 2.0 | 2.8 × 2.4 | 2.8 × 2.4 |
| Sprite scale | 0.65 | 0.83 | 1.0 | 1.2 |
| `call_for_help_radius` | 40 | 40 | 40 | 80 |
| Min evolution to be built by expansion (`build_base_evolution_requirement`) | 0 | 0.3 | 0.5 | 0.9 |
| Map-gen distance tier (`enemy_worm_autoplace(n)`, 1.1) | 0 | 2 | 5 | 8 |
| Folding speed | 0.015 (≈ 67 ticks) | 0.015 | 0.015 | 0.015 |
| Preparing speed | 0.024 (≈ 42 ticks) | 0.024 | 0.024 | 0.024 |

Worms only exist at map generation and by expansion; nests never spawn them as mobile units. They attack anything of the player force within range (military targets first) and are counted as military structures.

---

## 4. Spawners (biter nest, spitter nest)

Source: `enemies.lua` (1.1.110 and master), https://lua-api.factorio.com/latest/prototypes/EnemySpawnerPrototype.html, wiki Enemies (1.1 revision: "Spawning interval is interpolated between 360 (0 evolution) and 150 (1 evolution) game ticks (= 6 to 2.5 seconds)").

### 4.1 Stats

| Field | Biter spawner | Spitter spawner |
|---|---|---|
| Health | 350 (2.0: grows with evolution up to 3500) | 350 (same) |
| Regeneration | 0.02/tick (1.2 HP/s) | 0.02/tick |
| Resistances 1.1 | physical 2/15 %, explosion 5/15 %, fire 3/60 % | same |
| Resistances 2.0 | physical 2/15 %, explosion 5/0 %, fire 3/60 % | same |
| Collision box 1.1 | {{−3.2,−2.2},{2.2,2.2}} = 5.4 × 4.4 tiles | same |
| Collision box 2.0 | {{−2.2,−2.2},{2.2,2.2}} = 4.4 × 4.4 tiles | same |
| Selection box | 5 × 5 | 5 × 5 |
| `max_count_of_owned_units` | 7 | 7 |
| `max_friends_around_to_spawn` | 5 | 5 |
| `spawning_cooldown` {evo 0, evo 1} | {360, 150} ticks, linear interpolation by evolution | same |
| `spawning_radius` / `spawning_spacing` 1.1 | 10 / 3 tiles | 10 / 3 |
| `spawning_radius` / `spawning_spacing` 2.0 | 2.0 / 1.0 tiles | 2.0 / 1.0 |
| `max_spawn_shift` / `max_richness_for_spawn_shift` | 0 / 100 | 0 / 100 |
| Pollution absorption | 20 absolute + 1 % proportional (see 1.4) | same |
| `call_for_help_radius` | 50 tiles | 50 |
| `time_to_capture` (2.0 Space Age only) | 1200 ticks | 1800 ticks |
| Evolution on destruction | +0.002 (before squashing) | +0.002 |
| Mining | not minable; must be destroyed | |

Spawn logic (API doc semantics):
* A nest "owns" the units it spawned. It keeps spawning (free, idle defenders) until it owns `max_count_of_owned_units` = 7, or until ≥ 5 friendly units stand inside `spawning_radius`.
* Cooldown between spawns = lerp(360, 150, evolution) ticks, multiplied by the spawned unit's `spawning_time_modifier` (big ×3, behemoth ×12).
* Units spawned for pollution attacks are additional to the idle 7 and leave immediately for the rally point.
* When a nest is attacked it calls every own unit within `call_for_help_radius` = 50 tiles to defend (wiki: "aggro").

### 4.2 Which unit is spawned — `result_units` weight tables

Each entry is a list of (evolution, weight) points; the weight is linearly interpolated between points, held constant beyond the last point, and 0 before the first. Probability of a type = its weight / Σ weights.

Biter spawner (both versions):

| Unit | Points (evolution, weight) |
|---|---|
| small-biter | (0.0, 0.3) (0.6, 0.0) |
| medium-biter | (0.2, 0.0) (0.6, 0.3) (0.7, 0.1) |
| big-biter | (0.5, 0.0) (1.0, 0.4) |
| behemoth-biter | (0.9, 0.0) (1.0, 0.3) |

Spitter spawner (both versions):

| Unit | Points |
|---|---|
| small-biter | (0.0, 0.3) (0.35, 0.0) |
| small-spitter | (0.25, 0.0) (0.5, 0.3) (0.7, 0.0) |
| medium-spitter | (0.4, 0.0) (0.7, 0.3) (0.9, 0.1) |
| big-spitter | (0.5, 0.0) (1.0, 0.4) |
| behemoth-spitter | (0.9, 0.0) (1.0, 0.3) |

Resulting spawn probabilities (computed from the tables):

| Evolution | Biter nest: small / medium / big / behemoth | Spitter nest: small biter / small sp. / medium sp. / big sp. / behemoth sp. |
|---|---|---|
| 0.00 | 100 / 0 / 0 / 0 | 100 / 0 / 0 / 0 / 0 |
| 0.20 | 100 / 0 / 0 / 0 | 100 / 0 / 0 / 0 / 0 |
| 0.30 | 66.7 / 33.3 / 0 / 0 | 41.7 / 58.3 / 0 / 0 / 0 |
| 0.40 | 40 / 60 / 0 / 0 | 0 / 100 / 0 / 0 / 0 |
| 0.50 | 18.2 / 81.8 / 0 / 0 | 0 / 75 / 25 / 0 / 0 |
| 0.60 | 0 / 78.9 / 21.1 / 0 | 0 / 34.9 / 46.5 / 18.6 / 0 |
| 0.70 | 0 / 38.5 / 61.5 / 0 | 0 / 0 / 65.2 / 34.8 / 0 |
| 0.80 | 0 / 29.4 / 70.6 / 0 | 0 / 0 / 45.5 / 54.5 / 0 |
| 0.90 | 0 / 23.8 / 76.2 / 0 | 0 / 0 / 23.8 / 76.2 / 0 |
| 0.95 | 0 / 16.4 / 59.0 / 24.6 | 0 / 0 / 16.4 / 59.0 / 24.6 |
| 1.00 | 0 / 12.5 / 50 / 37.5 | 0 / 0 / 12.5 / 50 / 37.5 |

---

## 5. Attack parties (pollution attacks)

Source: https://wiki.factorio.com/Enemies (Attacks text, same in 1.1 revision), `map-settings.lua` `unit_group`, https://lua-api.factorio.com/latest/concepts/UnitGroupMapSettings.html, https://wiki.factorio.com/Military_units_and_structures, forum threads.

Sequence:
1. Pollution reaches a chunk with a nest → nest absorbs it (1.4) → when the bank covers a unit's price, that unit is spawned and joins a **gathering unit group** near the nest (a rally point).
2. The group gathers for a random time between `min_group_gathering_time` = 3600 ticks (1 min) and `max_group_gathering_time` = 36 000 ticks (10 min) — wiki: "Every 1 to 10 minutes (random) the mustered biters launch an attack." After gathering ends it waits at most `max_wait_time_for_late_members` = 7200 ticks (2 min) for stragglers; new members are not accepted any more.
3. At most `max_gathering_unit_groups` = 30 automatic groups can gather at the same time on a surface; a group holds at most `max_unit_group_size` = 200 units.
4. The group moves as a formation: radius between `min_group_radius` = 5 and `max_group_radius` = 30 tiles (depends on member count); members behind speed up to 140 % (`max_member_speedup_when_behind` 1.4), members ahead slow to 60 %; whole group slows to 30 % if a member lags > 3 × radius (`max_group_member_fallback_factor`); a member > 10 × radius behind is dropped (`member_disown_distance`). `tick_tolerance_when_member_arrives` = 60.
5. **Target**: the group is sent toward the polluting area (wiki: it walks "the shortest path possible, accounting for terrain, but not for player entities"; forum: it follows the pollution gradient chunk to chunk and then uses "find nearest enemy" inside the destination chunk). The game does not remember the original polluter; on arrival units attack any player entity in the target area — preferring things that could have produced pollution — and machines, belts, poles only if they block the path.
6. **Obstacles**: if a wall/structure blocks the path they "attempt to go around", or, if the detour is too long, "attack whatever is in their way to go through."
7. **Distraction / priority**: "If a biter comes in proximity of a military unit or structure, it will prioritize these and attempt to immediately attack them instead." (`distraction_cooldown` 300 ticks; unit `vision_distance` 30 tiles.) Military targets = player character, gun/laser/flamethrower/artillery turrets, combat robots, land mines (only 2 s after placement), cars/tanks/spidertrons; construction/logistic robots are attacked only by already-fighting units. Enemy military targets = all biters/spitters/worms/spawners.
8. **Retaliation**: any unit that is damaged, and any nest that is damaged (calls own units within 50 tiles), attacks the attacker; units pursue for at least 10 s (`min_pursue_time` 600) and up to 50 tiles (`max_pursue_distance`), then give up. Units whose commands fail 3 times are destroyed (`max_failed_behavior_count` = 3 — "solves biters stuck within their own base").
9. In peaceful mode no pollution attack groups are ever formed (section 8.3).

Path finder defaults worth mirroring: `general_entity_collision_penalty` 10, `enemy_with_different_destination_collision_penalty` 30, `stale_enemy_with_same_destination_collision_penalty` 30, `ignore_moving_enemy_collision_distance` 5, `goal_pressure_ratio` 2, `max_steps_worked_per_tick` 1000, `direct_distance_to_consider_short_request` 100 tiles (full list in `map-settings.lua`).

Steering (1.1 `map_settings.steering`): default radius 1.2, separation_force 0.005, separation_factor 1.2; moving radius 3, separation_force 0.01, separation_factor 3.

---

## 6. Enemy expansion (new nests)

Source: `map-settings.lua` (1.1.110 vs master), https://lua-api.factorio.com/latest/concepts/EnemyExpansionMapSettings.html, wiki Enemies.

| Setting (`map_settings.enemy_expansion`) | 1.1 default | 2.0 default | Meaning |
|---|---|---|---|
| enabled | true | true | GUI "Enemy expansion" checkbox |
| max_expansion_distance | 7 chunks | 5 | max distance from an existing base |
| min_expansion_distance | (wiki: 3) | 3 | min distance from existing bases |
| friendly_base_influence_radius | 2 | 6 | |
| enemy_building_influence_radius | 2 | 3 | |
| building_coefficient | 0.1 | 0.5 | |
| other_base_coefficient | 2.0 | 3.0 | |
| neighbouring_chunk_coefficient | 0.5 | 0.5 | |
| neighbouring_base_chunk_coefficient | 0.4 | 0.5 | |
| max_colliding_tiles_coefficient | 0.9 | 0.8 | chunk must have at most this share of unbuildable (water) tiles |
| settler_group_min_size | 5 | 5 | |
| settler_group_max_size | 20 | 10 | |
| evolution_group_size_factor | — | 8.0 | 2.0: size = random(min,max) × 8^evolution |
| min_expansion_cooldown | 4 × 3600 = 14 400 ticks (4 min) | 36 000 (10 min) | |
| max_expansion_cooldown | 60 × 3600 = 216 000 ticks (60 min) | 216 000 (60 min) | |
| build_base_unit_dispatch_cooldown | — | 1800 ticks | 2.0 |

1.1 formulas (comments in `map-settings.lua`):
* `cooldown = lerp(max_expansion_cooldown, min_expansion_cooldown, −e² + 2e)` with e = evolution → 60 min at e=0, 18 min at e=0.5, 4 min at e=1.
* Settler group size = random(5, 20) "multiplied by the evolution factor" (wiki: "5 to 20 enemy units from the closest spawners").
* Chunk score = `1 / (1 + player + base)` where `player = Σ (player buildings on neighbour × 0.1 × 0.5^distance)` over chunks within radius 2, and `base = Σ (enemy bases on neighbour × 2.0 × 0.4^distance)` within radius 2 (Manhattan distance). Candidate chunks: within 7 chunks (min 3) of an existing base, ≤ 90 % unbuildable tiles. The wiki gives the equivalent formula `10/(10 + P0 + P1/2 + P2/4 + 20·B0 + 8·B1 + 3.2·B2)`.
* Every cooldown the game picks a target chunk at random weighted by score, assembles 5–20 units from the nearest nests, they walk there; on arrival "each unit will begin dying in sequence to randomly create a spawner or a worm after some delay. This destroys any entities in the way, including members of the expansion group." Worm type is limited by evolution (medium ≥ 0.3, big ≥ 0.5, behemoth ≥ 0.9). Nests and worms can only be built on land tiles.
* Expansion parties fight anything that blocks them, which is why bases sometimes appear behind walls even without pollution (forum t=57274).
* Rail-world preset disables expansion; peaceful mode also disables it.

---

## 7. Enemy base generation and the starting area

Source: `base/prototypes/entity/enemy-autoplace-utils.lua` (1.1.110), `base/prototypes/noise-expressions.lua` (master), `autoplace-controls.lua`, https://lua-api.factorio.com/latest/concepts/MapGenSize.html, https://lua-api.factorio.com/latest/concepts/MapGenSettings.html, https://wiki.factorio.com/Map_generator.

* Autoplace control `enemy-base` (category "enemy", no richness slider). GUI sliders **Frequency** and **Size**, default 100 %. Supported multiplier range (MapGenSize): 0 ("none") and **1/6 … 6 (17 % … 600 %)**; named steps: very-low/very-small = 50 %, low/small = 1/√2 ≈ 71 %, normal = 100 %, high/big = √2 ≈ 141 %, very-high/very-big = 200 %.
* Wiki: "Frequency determines the number of enemy bases in a given area. It does not affect enemy base size. A setting of 200 % frequency means roughly double the enemy bases can be found in a given area. The size setting adjusts the size of enemy bases. Setting the slider to 200 % means the surface area covered by the enemy bases is doubled."
* **Starting area** slider (`starting_area`, default 1 = 100 %, same 1/6…6 range): "Multiplier for 'biter free zone radius'". Wiki: "The starting area is an almost circular radius around the spawn point that does not contain enemy bases … Increasing its size pushes the bases further out, while decreasing its size generates enemy bases closer to the spawn point." It affects only enemies, not resources. Presets: death world = "small" (≈ 71 %), ribbon world = 3 (300 %).
* Placement formulas (1.1, identical in 2.0):
  * `enemy_base_intensity = clamp(distance, 0, 2400) / 325` ("biter placement stops increasing in intensity after 75 chunks = 2400 tiles").
  * Base (spot) radius in tiles: `sqrt(size_multiplier) × (15 + 4 × intensity)` → 15 tiles near spawn, up to ~44.5 tiles far away at 100 % size.
  * Base density: `bases_per_km² = (10 + 3 × intensity) × frequency_multiplier` → 10 per km² near spawn up to ~32 per km² far out.
  * Starting-area hole: `+ min(0, 20 × (distance / starting_area_radius − 1))` added to the probability, i.e. a penalty of −20 at the spawn point that reaches 0 exactly at `starting_area_radius`; since probability is capped at 0.25 + 0.05 × tier, nothing can be placed until distance ≈ 0.95–0.99 × starting_area_radius. `starting_area_radius` is an engine-provided noise variable = engine base radius × the starting-area slider (the base radius in tiles is not exposed in any prototype file or API doc; it is an internal constant).
  * Distance tiers: `distance_unit = 312` tiles; a spawner/worm with `distance_factor` n is multiplied by `max(0, 1 + (distance − starting_area_radius − 312·n) × 0.002·n)` and its probability is capped at `0.25 + 0.05·n`; tiers: biter/spitter spawners and small worm 0, medium worm 2 (≈ 624 tiles past the starting area), big worm 5 (≈ 1560), behemoth worm 8 (≈ 2496). Random penalty 0.1 is added so that different types mix.
* Spawners and worms are the only enemy entities placed by map generation; the mobile units come from nests (7 idle defenders each).
* Map size: width/height 0 = infinite (practical limit ±1 000 000 tiles); ribbon-world preset height 128.

---

## 8. World settings that concern enemies

Source: https://wiki.factorio.com/Map_generator, https://wiki.factorio.com/Peaceful_mode, https://wiki.factorio.com/Console, `map-gen-presets.lua`.

### 8.1 GUI summary

| Tab / setting | Default | Range / notes |
|---|---|---|
| Enemy bases — Frequency | 100 % | 17–600 % (or "none" via size 0) |
| Enemy bases — Size | 100 % | 17–600 %; size 0/"none" = no enemy bases at all |
| Starting area size | 100 % | 17–600 % |
| Peaceful mode | off | checkbox |
| Enemy expansion — enabled | on | |
| Enemy expansion — max distance | 7 chunks (2.0: 5) | |
| Enemy expansion — group size | 5–20 (2.0: 5–10) | |
| Enemy expansion — cooldown | 4–60 min (2.0: 10–60) | |
| Evolution — time factor | 40 (×10⁻⁷ per s) | |
| Evolution — destroy factor | 200 (×10⁻⁵ per nest) | |
| Evolution — pollution factor | 9 (×10⁻⁷ per PU) | |
| Pollution — enabled | on | |
| Pollution — absorption modifier | 100 % | `ageing` |
| Pollution — attack cost modifier | 100 % | `enemy_attack_pollution_consumption_modifier` |
| Pollution — minimum to damage trees | 60 | |
| Pollution — absorbed per damaged tree | 10 | |
| Pollution — diffusion ratio | 2 % | |

### 8.2 Presets (`map-gen-presets.lua`)

| Preset | Enemy changes |
|---|---|
| Default | none |
| Death world | enemy-base frequency very-high (200 %), size very-big (200 %), starting area small (71 %), time_factor 0.00002, pollution_factor 0.0000012, pollution ageing 0.5, attack cost modifier 0.5 (2.0 also build_base_unit_dispatch_cooldown 600) |
| Death world marathon | same bases, time_factor 0.000015, pollution_factor 0.0000010, ageing 0.5, attack cost 0.8, tech price ×4 |
| Rail world | enemy-base size 1, time_factor 0.000002, expansion disabled |
| Ribbon world | starting area 3 (300 %), height 128 tiles |
| Marathon / Rich resources / Island / Lakes | no enemy changes |

### 8.3 Peaceful mode and "no enemies"

Wiki Peaceful mode (verbatim key sentences): "Enemies don't begin fights, only responding if the player (or a structure) fires at them." "Only the enemies located near the fired shot are aggravated and they do not call other enemies to join them." "The aggravated enemies primarily attack the structures and players that initiated the aggression and also the structures that block their paths." "After destroying their targets, most of the time the aggravated enemies will return to being peaceful, but some of them continue a nonstop rampage where they target nearby structures (but not faraway ones)." "When a map is in peaceful mode, the enemies will not expand." Pollution still exists and still raises evolution and (2.0) nest health, but nests never spend it on attack parties.

Separate option `no_enemies_mode` (MapGenSettings): "Whether enemy creatures will not naturally spawn from spawners, map gen, or trigger effects" — nests/worms are not placed at all.

Console (wiki Console): enable peaceful `/c game.player.surface.peaceful_mode = true` (false to disable); kill all units `/c game.forces["enemy"].kill_all_units()`; destroy every enemy entity `/c local surface=game.player.surface for key, entity in pairs(surface.find_entities_filtered({force="enemy"})) do entity.destroy() end`; disable expansion `/c game.map_settings.enemy_expansion.enabled = false`; set evolution `/c game.forces["enemy"].set_evolution_factor(X, game.player.surface)` (1.1: `game.forces["enemy"].evolution_factor = X`); show evolution `/evolution`; clear pollution `/c game.player.surface.clear_pollution()`; disable pollution `/c game.map_settings.pollution.enabled = false`.

---

## 9. Defense structures

### 9.1 Gun turret

Source: https://wiki.factorio.com/Gun_turret, `turrets.lua` (both versions), `recipe.lua`, `technology.lua`.

| Property | Value |
|---|---|
| Footprint | 2 × 2 tiles (collision box 1.4 × 1.4) |
| Health | 400 (2.0 quality: 520/640/760/1000) |
| Resistances | none |
| Range | 18 tiles (2.0 quality up to 27) |
| Minimum range | 0 |
| Attack cooldown | 6 ticks → 10 shots/s (same as SMG) |
| Rotation speed | 0.015 turns/tick → 66.7 ticks (1.11 s) per 360° |
| Preparing / folding speed | 0.08 → 12.5 ticks (0.21 s) to deploy/undeploy |
| Attacking animation speed | 0.5 |
| Ammo category | bullet (firearm, piercing, uranium magazines) |
| Ammo slot / automated insertion | inserters fill at most `automated_ammo_count` = 10 magazines |
| Power | none |
| `call_for_help_radius` | 40 |
| `alert_when_attacking` | true (map alert) |
| Mining time | 0.5 s |
| Stack size | 50 |
| Recipe | 10 iron gear wheel + 10 copper plate + 20 iron plate → 1, 8 s (raw: 40 iron, 10 copper) |
| Technology | "Gun turret": 10 automation science packs × 10 s (prereq automation science pack) |
| Target priority | nearest enemy in range; 2.0.7+ optional per-turret target priority list |

Damage per bullet by ammo (physical, before research):

| Magazine | Damage / bullet | Rounds / magazine | Turret DPS (10 rounds/s) | Recipe (1.1) | Recipe (2.0) |
|---|---|---|---|---|---|
| Firearm magazine (yellow) | 5 | 10 | 50 | 4 iron plate → 1, 1 s; stack 200 | 4 iron → 1, 1 s; stack 100 |
| Piercing rounds magazine (red) | 8 | 10 | 80 | 1 firearm mag + 1 steel + 5 copper → 1, 3 s; stack 200; tech Military 2 | 2 firearm mags + 1 steel + 2 copper → 2, 6 s; stack 100 |
| Uranium rounds magazine | 24 | 10 | 240 | (needs uranium processing) | |

Research bonuses are multiplicative between the ammo bonus and the turret bonus:
`damage = base × (1 + Σ bullet ammo-damage) × (1 + Σ gun-turret turret-attack)`; `rate = 10/s × (1 + Σ bullet gun-speed)`.

Physical projectile damage (technology.lua, identical 1.1 and 2.0):

| Level | bullet ammo-damage | gun-turret turret-attack | shotgun shell | cannon shell | Cost | Cumulative bullet / turret |
|---|---|---|---|---|---|---|
| 1 | +10 % | +10 % | +10 % | — | 100 × automation, 30 s | 10 / 10 |
| 2 | +10 % | +10 % | +10 % | — | 200 × (automation+logistic), 30 s | 20 / 20 |
| 3 | +20 % | +20 % | +20 % | — | 300 × (a+l+military), 60 s | 40 / 40 |
| 4 | +20 % | +20 % | +20 % | — | 400 × (a+l+m), 60 s | 60 / 60 |
| 5 | +20 % | +20 % | +20 % | +90 % | 500 × (a+l+m+chemical), 60 s | 80 / 80 |
| 6 | +40 % | +40 % | +40 % | +130 % | 600 × (a+l+m+c+utility), 60 s | 120 / 120 |
| 7+ (infinite) | +40 % | +70 % | +40 % | +100 % | 2^(L−7) × 1000 × all six packs, 60 s | +40 / +70 per level |

Example: level 3 researched, yellow ammo: 5 × 1.4 × 1.4 = 9.8 per bullet → 98 DPS per turret.

Weapon shooting speed (gun-speed, bullets): L1 +10 %, L2 +20 %, L3 +20 %, L4 +30 %, L5 +30 %, L6 +40 % (cumulative 150 %); costs 100/200/300/400/500/600 packs like above; also applies to gun turrets.

### 9.2 Stone wall and gate

Source: https://wiki.factorio.com/Stone_wall, `entities.lua`, `recipe.lua`.

| Property | Wall | Gate |
|---|---|---|
| Footprint | 1 × 1 tile (collision box 0.58 × 0.58) | 1 × 1 |
| Health | 350 (2.0 quality up to 875) | 350 |
| Resistances | physical 3/20 %, impact 45/60 %, explosion 10/30 %, fire 0/100 %, acid 0/80 %, laser 0/70 % | identical |
| Recipe | 5 stone brick → 1, 0.5 s | 1 stone wall + 2 steel plate + 2 electronic circuit → 1, 0.5 s |
| Technology | "Stone wall": 10 automation packs × 10 s | Gates |
| Mining time | 0.2 s | 0.1 s |
| Stack size | 100 | 50 |
| Gate behaviour | — | opening_speed 0.0667 (15 ticks), activation_distance 3 tiles, closes after timeout 5 s; opens for player/vehicles, not for enemies |

Behaviour notes (wiki): walls connect visually to 4 neighbours (a closed 2×2 square fills in; purely visual). Walls block melee only; spitter/worm acid arcs over them. Big and behemoth biters have 1.5-tile reach and can bite things directly behind a single wall row. Biters attack walls only when the wall blocks their path or when nothing else is aggroing them; a turret or player nearby is preferred. Repair: walls are repaired with repair packs or construction robots.

Effective HP of a wall vs small biter bite (7 phys): (7−3)×0.8 = 3.2 per bite → 110 bites.

### 9.3 Repair pack

Source: https://wiki.factorio.com/Repair_pack, `item.lua`, `recipe.lua`, https://lua-api.factorio.com/latest/prototypes/RepairToolPrototype.html.

| Property | Value |
|---|---|
| Type | repair-tool |
| Durability | 300 (2.0 quality: 600/900/1200/1800) |
| `speed` | 2 health per durability point → one pack restores **600 HP** in total |
| Use | hold in cursor and left-click / hold on a damaged own-force entity; cannot repair items in inventory, enemies or the character; construction robots use packs from roboports |
| Recipe | 2 electronic circuit + 2 iron gear wheel → 1, 0.5 s (raw 3 copper, 6 iron) |
| Technology | 1.1: available from start; 2.0: "Repair pack" tech, 25 automation packs × 10 s |
| Stack size | 100 |

### 9.4 Turret / defense technologies (costs)

| Technology | Cost | Unlocks |
|---|---|---|
| Military | 10 × automation, 15 s | submachine gun, shotgun, shotgun shells |
| Military 2 | 20 × (automation + logistic), 15 s (prereq steel processing) | piercing rounds magazine, grenade |
| Gun turret | 10 × automation, 10 s | gun turret |
| Stone wall | 10 × automation, 10 s | stone wall |

---

## 10. Player weapons

Source: https://wiki.factorio.com/Pistol, https://wiki.factorio.com/Submachine_gun, `item.lua`, `recipe.lua`.

| | Pistol | Submachine gun |
|---|---|---|
| Ammo category | bullet (firearm / piercing / uranium magazines) | bullet |
| Cooldown | 15 ticks → 4 shots/s | 6 ticks → 10 shots/s |
| Range | 15 tiles (2.0 quality up to 22.5) | 18 tiles (up to 27) |
| Damage modifier | 1.0 (ammo damage as-is) | 1.0 |
| Movement slow-down while firing (`movement_slow_down_factor`) | 0.2 | 0.7 |
| Projectile creation distance | 1.125 | 1.125 |
| DPS with yellow / red / uranium | 20 / 32 / 96 | 50 / 80 / 240 |
| Recipe | 1.1: 5 copper + 5 iron → 1, 5 s (2.0: recipe removed, starter item only) | 10 gears + 5 copper + 10 iron → 1, 10 s (Military) |
| Stack size | 5 | 5 |
| Starting kit (freeplay) | 1 pistol + 10 firearm magazines | — |

Research: the same physical-projectile-damage (bullet part) and weapon-shooting-speed bonuses as for turrets apply; player weapons do not get the turret-attack part.

Shooting: the player auto-targets the nearest enemy in range with the "shoot at enemies" key (space) or shoots at the cursor (C). Magazines are consumed one round per shot; a magazine is 10 rounds.

---

## 11. The player character

Source: https://wiki.factorio.com/Character, `entities.lua` (character, character-corpse), https://lua-api.factorio.com/latest/prototypes/CharacterPrototype.html, https://wiki.factorio.com/Raw_fish.

| Property | Value |
|---|---|
| Max health | 250 (+50 per level of "Health" research where present) |
| Regeneration | `healing_per_tick` 0.15 → 9 HP/s (wiki text says "a few seconds after taking damage, at 6 hit points per second"; prototype value is 0.15/tick) |
| Regeneration pause | `ticks_to_stay_in_combat` = 600 → no regeneration for 10 s after last damage taken |
| Resistances | none |
| Running speed | 0.15 tiles/tick = 9 tiles/s (wiki: 8.9) |
| Collision box | 0.4 × 0.4 tiles |
| Reach / build / drop distance | 10 tiles |
| Resource reach | 2.7 tiles |
| Item pickup / loot pickup | 1 / 2 tiles |
| Enter vehicle distance | 3 |
| Mining speed | 0.5 |
| Inventory | 80 slots (+10 toolbelt research; armors +10/20/30) |
| Corner sliding | 0.7 |
| Healing item | raw fish: −80 physical damage = +80 HP, cooldown 30 ticks (0.5 s), stack 100 |
| Respawn time | 10 s (`respawn_time` default) |

**Death**: at 0 HP the character dies. Wiki: "When a player character is killed it leaves behind a corpse that contains all items that were located in the player's inventory, quickbar, trash slots, and equipment slots." "10 seconds after being killed, the character respawns at the center of the world or at a pre-determined spawn point." The new character has an empty inventory; items are recovered by opening the corpse (mining time 2). Corpse lifetime: 1.1 `time_to_live = 15 × 60 × 60` ticks = 15 minutes, after which the corpse and everything in it vanish; 2.0 `time_to_live = 0` (does not expire). A game-over screen is shown in singleplayer while waiting to respawn; the death is announced in chat with the killer's name (e.g. "was killed by small biter"). Evolution, research, buildings are untouched. The map's spawn point is the initial spawn (0,0) unless changed by script.

---

## 12. Damage and resistance mechanics

Source: https://wiki.factorio.com/Damage.

Damage types: physical, impact, poison, explosion, fire, laser, acid, electric. Resistances have a flat part R and a percentage part P (0–1). For incoming raw damage D the final damage F is:

* if `D > R + 1`: `F = (D − R) × (1 − P)`
* else if `D > 1`: `F = (1 − P) / (R − D + 2)`
* else: `F = (1 − P) / (R + 1)`

(Flat reduction never reduces a hit to 0; a hit weaker than the flat resistance still does a fraction.) Example: 100 damage vs 25 % → 75.

Resistance summary (base game, 1.1 unless noted):

| Entity | physical | explosion | fire | acid | laser | impact |
|---|---|---|---|---|---|---|
| Small biter / small spitter / small worm | — | — | — | — | — | — |
| Medium biter | 4/10 % | 0/10 % | — | — | — | — |
| Big biter | 8/10 % | 0/10 % | — | — | — | — |
| Behemoth biter | 12/10 % | 12/10 % | — | — | — | — |
| Medium spitter | — | 0/10 % | — | — | — | — |
| Big spitter | — | 0/15 % | — | — | — | — |
| Behemoth spitter | — | 0/30 % | — | — | — | — |
| Medium worm | 5/0 % | 5/15 % | 2/50 % | — | 2.0: 0/20 % | — |
| Big worm | 10/0 % | 10/30 % | 3/70 % | — | 2.0: 0/50 % | — |
| Behemoth worm | 10/0 % | 10/30 % | 3/70 % | — | 2.0: 0/80 % | — |
| Biter / spitter nest | 2/15 % | 5/15 % (2.0: 5/0 %) | 3/60 % | — | — | — |
| Stone wall / gate | 3/20 % | 10/30 % | 0/100 % | 0/80 % | 0/70 % | 45/60 % |
| Gun turret | — | — | — | — | — | — |
| Laser turret (1000 HP, range 24, 40-tick cooldown, ×2 damage) | — | — | — | — | — | — |
| Stone furnace (200 HP) | — | 0/30 % | 0/90 % | — | — | 0/30 % |
| Character | — | — | — | — | — | — |

---

## 13. Compact simulation recipe (numbers only, for implementers)

1. World is a grid of 32×32-tile chunks; each chunk stores `pollution` (float ≥ 0).
2. Every 64 ticks, for each chunk: `pollution += Σ entity emissions_per_minute × (64/3600) × activity`; `pollution −= 64 × ageing × (Σ tile absorptions_per_second + Σ tree 0.001 + Σ dead tree 0.0001)`; clamp at 0; for each nest in the chunk, if `pollution > 20`: `take = 20 + 0.01 × pollution`, `pollution −= take`, `nest.bank += take` (cap bank at 3 × cost of its most expensive currently-spawnable unit); then if `pollution ≥ 15` move `0.02 × pollution` to each of the 4 neighbours.
3. Evolution: keep `total`; per second `total += 0.000004 × (1−evo)²`… simplest exact form: keep `T` = Σ raw increments (0.000004/s, 0.0000009 per PU produced, 0.002 per nest destroyed) and display `evo = T/(1+T)`.
4. Nest idle spawning: every `lerp(360,150,evo) × spawning_time_modifier` ticks, if owned units < 7 and < 5 friends within spawning radius, spawn a unit chosen with the weight tables of 4.2 at distance ≤ 10 (1.1) around the nest.
5. Attack spawning: while `bank ≥ cost(unit chosen by 4.2 weights)`: `bank −= cost`, spawn unit, add to the current gathering group of that nest (create one if none; max 30 groups, 200 units each).
6. Group launch: after random 1–10 min gathering (+ up to 2 min for stragglers) move the group toward the highest-pollution neighbouring chunks until a chunk with player entities is reached; attack the nearest player entity, switch to any military target within 30 tiles, chew through blocking walls.
7. Unit combat: melee cooldown 35 ticks (behemoth 50), range 0.5/1/1.5/1.5; spitter cooldown 100 ticks, keep ≥ 10 tiles, range 13–16, leave a 32 s puddle doing (0.1/0.2/0.6/1.0 × 12/24/36/60 × 6) acid per second and a 2 s slow to 60/50/40/30 %.
8. Retaliation: damaged unit or nest → all its units within 50 tiles engage the attacker; pursue ≥ 10 s and ≤ 50 tiles.
9. Expansion (if enabled and not peaceful): every `lerp(60 min, 4 min, 2e−e²)` pick a chunk 3–7 chunks from an existing nest with the score formula of section 6, send 5–20 units, each becomes a nest or worm on arrival.
10. Gun turret: 2×2, 400 HP, rotates 360° in 67 ticks, fires every 6 ticks at nearest enemy ≤ 18 tiles, 5 (yellow) / 8 (red) physical per shot × (1+ammo bonus) × (1+turret bonus), holds ≤ 10 magazines (10 rounds each) via inserters.
11. Wall 1×1, 350 HP, physical 3/20 %; repair pack: 600 HP per pack.
12. Player: 250 HP, 9 HP/s regeneration after 10 s without damage, fish +80 HP, pistol 4 shots/s at 15 tiles, SMG 10 shots/s at 18 tiles; on death drop everything into a corpse (15 min in 1.1), respawn at spawn after 10 s.

---

## 14. Sources

Official wiki
* https://wiki.factorio.com/Pollution
* https://wiki.factorio.com/Enemies
* https://wiki.factorio.com/index.php?title=Enemies&oldid=201859 (last 1.1-era revision, 21 Oct 2024)
* https://wiki.factorio.com/Gun_turret
* https://wiki.factorio.com/Stone_wall
* https://wiki.factorio.com/Repair_pack
* https://wiki.factorio.com/Pistol
* https://wiki.factorio.com/Submachine_gun
* https://wiki.factorio.com/Firearm_magazine
* https://wiki.factorio.com/Piercing_rounds_magazine
* https://wiki.factorio.com/Character
* https://wiki.factorio.com/Raw_fish
* https://wiki.factorio.com/Map_generator
* https://wiki.factorio.com/Peaceful_mode
* https://wiki.factorio.com/Military_units_and_structures
* https://wiki.factorio.com/Damage
* https://wiki.factorio.com/Physical_projectile_damage_(research)
* https://wiki.factorio.com/Weapon_shooting_speed_(research)
* https://wiki.factorio.com/Console

Official prototype data (github.com/wube/factorio-data; `master` = 2.0, tag `1.1.110` = 1.1)
* https://raw.githubusercontent.com/wube/factorio-data/master/base/prototypes/entity/enemies.lua and https://raw.githubusercontent.com/wube/factorio-data/1.1.110/base/prototypes/entity/enemies.lua
* https://raw.githubusercontent.com/wube/factorio-data/master/base/prototypes/entity/turrets.lua and https://raw.githubusercontent.com/wube/factorio-data/1.1.110/base/prototypes/entity/turrets.lua
* https://raw.githubusercontent.com/wube/factorio-data/master/base/prototypes/entity/enemy-constants.lua
* https://raw.githubusercontent.com/wube/factorio-data/master/base/prototypes/entity/enemy-projectiles.lua and https://raw.githubusercontent.com/wube/factorio-data/1.1.110/base/prototypes/entity/spitter-projectiles.lua
* https://raw.githubusercontent.com/wube/factorio-data/master/base/prototypes/entity/entities.lua and https://raw.githubusercontent.com/wube/factorio-data/1.1.110/base/prototypes/entity/entities.lua
* https://raw.githubusercontent.com/wube/factorio-data/master/base/prototypes/entity/mining-drill.lua and https://raw.githubusercontent.com/wube/factorio-data/1.1.110/base/prototypes/entity/mining-drill.lua
* https://raw.githubusercontent.com/wube/factorio-data/master/base/prototypes/entity/trees.lua and https://raw.githubusercontent.com/wube/factorio-data/1.1.110/base/prototypes/entity/trees.lua
* https://raw.githubusercontent.com/wube/factorio-data/master/base/prototypes/tile/tiles.lua, https://raw.githubusercontent.com/wube/factorio-data/master/base/prototypes/tile/tile-pollution-values.lua and https://raw.githubusercontent.com/wube/factorio-data/1.1.110/base/prototypes/tile/tiles.lua
* https://raw.githubusercontent.com/wube/factorio-data/master/base/prototypes/item.lua and https://raw.githubusercontent.com/wube/factorio-data/1.1.110/base/prototypes/item.lua
* https://raw.githubusercontent.com/wube/factorio-data/master/base/prototypes/recipe.lua and https://raw.githubusercontent.com/wube/factorio-data/1.1.110/base/prototypes/recipe.lua
* https://raw.githubusercontent.com/wube/factorio-data/master/base/prototypes/technology.lua and https://raw.githubusercontent.com/wube/factorio-data/1.1.110/base/prototypes/technology.lua
* https://raw.githubusercontent.com/wube/factorio-data/master/base/prototypes/map-settings.lua and https://raw.githubusercontent.com/wube/factorio-data/1.1.110/base/prototypes/map-settings.lua
* https://raw.githubusercontent.com/wube/factorio-data/master/base/prototypes/map-gen-presets.lua and https://raw.githubusercontent.com/wube/factorio-data/1.1.110/base/prototypes/map-gen-presets.lua
* https://raw.githubusercontent.com/wube/factorio-data/master/base/prototypes/noise-expressions.lua and https://raw.githubusercontent.com/wube/factorio-data/1.1.110/base/prototypes/entity/enemy-autoplace-utils.lua
* https://raw.githubusercontent.com/wube/factorio-data/master/base/prototypes/autoplace-controls.lua

Official Lua API docs
* https://lua-api.factorio.com/latest/concepts/PollutionMapSettings.html
* https://lua-api.factorio.com/latest/concepts/EnemyEvolutionMapSettings.html
* https://lua-api.factorio.com/latest/concepts/EnemyExpansionMapSettings.html
* https://lua-api.factorio.com/latest/concepts/UnitGroupMapSettings.html
* https://lua-api.factorio.com/latest/concepts/PathFinderMapSettings.html
* https://lua-api.factorio.com/latest/concepts/MapGenSize.html
* https://lua-api.factorio.com/latest/concepts/MapGenSettings.html
* https://lua-api.factorio.com/latest/prototypes/EnemySpawnerPrototype.html
* https://lua-api.factorio.com/latest/prototypes/UnitPrototype.html
* https://lua-api.factorio.com/latest/prototypes/TurretPrototype.html
* https://lua-api.factorio.com/latest/prototypes/CharacterPrototype.html
* https://lua-api.factorio.com/latest/prototypes/RepairToolPrototype.html

Community (complementary only)
* https://forums.factorio.com/viewtopic.php?t=132318 (how biters pick machines to attack)
* https://forums.factorio.com/viewtopic.php?t=57274 (do biters only attack pollution)
