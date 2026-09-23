# Factorio — Early/Mid-game Placeable Entities and Machines (reference for a browser clone)

Facet key: `entities-and-machines`
Primary source: https://wiki.factorio.com (current pages = Factorio 2.0 base game). Prototype numbers cross-checked against `wube/factorio-data` (GitHub) and https://lua-api.factorio.com. Where 1.1 differs from 2.0, both values are listed. Values marked *(memory, unverified)* were NOT confirmed by a fetched source in this session and should be treated as approximate.

All numbers below are for **Normal quality** (the 2.0 quality system scales health, speed etc.; a clone can ignore quality).

---

## 0. Conventions used in this document

| Term | Meaning |
|---|---|
| tick | 1/60 s. All game logic runs at 60 ticks per second. |
| tile | 1×1 world unit. Entity footprints are given as width × height when the entity faces **north** (its default direction). |
| "front" | The side the entity faces (north by default). Rotating an entity (R key) rotates all offsets by 90° steps. |
| collision_box | Prototype rectangle relative to the entity centre; a 3×3 entity is centred on a tile centre, a 2×2 entity is centred on a tile *corner*. |
| kW / MW | Energy per second. 1 kW = 1 kJ/s. Burner devices convert fuel MJ into these rates. |
| Pollution | Units per minute at full activity (`emissions_per_minute`). |
| Mining time (in infobox) | Time for the *player* to pick the entity up, not gameplay-relevant for a clone except as "deconstruct time". |

Sources: https://wiki.factorio.com/Time, https://lua-api.factorio.com/latest/prototypes/ElectricPolePrototype.html

---

## 1. Shared mechanics

### 1.1 Fuel values and burn time (source: https://wiki.factorio.com/Fuel, https://wiki.factorio.com/Coal, https://wiki.factorio.com/Wood)

| Fuel | Fuel value | Stack size | Notes |
|---|---|---|---|
| Wood | 2 MJ | 100 | Big tree gives 4 wood (mining time 0.55 s); dead tree gives 2 wood (0.5 s). Player starts freeplay with 1 wood. |
| Coal | 4 MJ | 50 | Mined from coal patches, mining time 1 s. |
| Solid fuel | 12 MJ | 50 | Vehicle accel 120 %, top speed 105 %. |
| Rocket fuel | 100 MJ | 10 | Vehicle accel 180 %, top speed 115 %. |
| Nuclear fuel | 1.21 GJ | 1 | Vehicle accel 250 %, top speed 115 %. |

**Burn time (s) = fuel value (MJ) ÷ energy consumption (MW).** Every burner entity in this document has exactly **1 fuel slot** (`fuel_inventory_size = 1`) and accepts the `chemical` fuel category (wood, coal, solid fuel, rocket fuel, nuclear fuel).

Worked examples (coal = 4 MJ):

| Device | Consumption | 1 coal lasts | Output per coal |
|---|---|---|---|
| Stone furnace | 90 kW | 44.4 s | 13.9 iron plates (stone furnace) / 27.8 (steel furnace) |
| Burner mining drill | 150 kW | 26.7 s | ≈ 6.7 (wiki: "about 7") ore |
| Boiler | 1.8 MW | 2.22 s | 133 steam (2.0) ; consumes 0.45 coal/s |
| Burner inserter | 144 kW while moving (2.0) | — | ≈ 58 transfers per coal, 29 per wood (69.4 kJ per transfer) |

### 1.2 Pollution (source: https://wiki.factorio.com/Pollution)

Emitted per minute at full activity:

| Entity | Pollution/min |
|---|---|
| Burner mining drill | 12 |
| Electric mining drill | 10 |
| Stone furnace | 2 |
| Steel furnace | 4 |
| Electric furnace | 1 |
| Assembling machine 1 | 4 |
| Assembling machine 2 | 3 |
| Assembling machine 3 | 2 |
| Boiler | 30 |
| Steam engine, lab, radar, inserters, belts, poles, chests, pumps, solar, accumulator, turrets, walls | 0 |
| (later game) Oil refinery 6, Chemical plant 4, Centrifuge 4, Pumpjack 10 | |

Absorption: grass/dirt tile −0.000018/s per tile (≈ −1.106 per chunk per minute), water tile −0.000025/s (−1.536 per chunk/min), red desert/sand −0.000015/s (−0.92 per chunk/min), paths/landfill 0; tree with full leaves −0.001/s, dead tree −0.0001/s. A chunk (32×32 tiles) starts spreading pollution to its 4 neighbours once it holds ≥ 15.0 pollution, at 2 % per 64 ticks. Final pollution = pollution-multiplier × energy-usage-multiplier × base pollution (modules).

### 1.3 Electric consumption, drain and generator priority (source: https://wiki.factorio.com/Electric_system)

* Electric machines have an **energy consumption** (only while working) plus a **drain** (always, even idle). Example from wiki: an active Assembling machine 2 draws 150 kW + 5 kW = 155 kW.
* A building is connected to a network if **any one of its tiles lies inside a pole's supply area**.
* Generators are used in this order: 1) solar panels (always full output), 2) steam engines/turbines (fill what solar cannot), 3) accumulators (last resort, discharged only when nothing else can meet demand; charge only from surplus).
* Satisfaction bar: yellow if > 50 % satisfied, red if < 50 %; machines slow down proportionally to satisfaction (brownout).

### 1.4 Inserter insertion limits into machines (source: https://wiki.factorio.com/Inserters)

Inserters stop feeding a machine once it holds:

| Target | Limit |
|---|---|
| Fuel slot of boilers, burner inserters, furnaces, burner drills, reactors | stops when **5 or more** fuel items are in the slot |
| Gun turret ammo | **10** magazines |
| Artillery turret | 5 shells |
| Assembling machines, furnaces, chemical plants, refineries, centrifuges (ingredients) | ingredients for 1 craft **plus** the number of crafts (rounded up) that can complete during one standard inserter swing (1.166 s); **minimum ingredients for 2 crafts, maximum for 100 crafts** |
| Labs | analogous formula on research units per swing |

The player may hand-insert far more (up to a full stack per slot).

### 1.5 Intermediate recipes needed to cost the entities (sources: https://wiki.factorio.com/Iron_gear_wheel, /Copper_cable, /Electronic_circuit, /Iron_stick, /Iron_plate, /Copper_plate, /Steel_plate, /Stone_brick)

| Product | Ingredients | Time | Output | Where | Stack |
|---|---|---|---|---|---|
| Iron plate | 1 iron ore | 3.2 s | 1 | furnace only | 100 |
| Copper plate | 1 copper ore | 3.2 s | 1 | furnace only | 100 |
| Stone brick | 2 stone | 3.2 s | 1 | furnace only | 100 |
| Steel plate | 5 iron plate | 16 s | 1 | furnace only; tech *Steel processing* | 100 |
| Iron gear wheel | 2 iron plate | 0.5 s | 1 | hand / assembler | 100 |
| Copper cable | 1 copper plate | 0.5 s | 2 | hand / assembler | 200 |
| Electronic circuit | 3 copper cable + 1 iron plate | 0.5 s | 1 | hand / assembler | 200 |
| Iron stick | 1 iron plate | 0.5 s | 2 | hand / assembler | 100 |
| Firearm magazine | 4 iron plate | 1 s | 1 | hand / assembler | 100 |
| Piercing rounds magazine | 2.0: 2 copper + 2 firearm mag + 1 steel → 2, 6 s. 1.1: 5 copper + 1 firearm mag + 1 steel → 1, 3 s *(memory)* | | | tech *Military 2* | 100 |

Raw resources: iron ore, copper ore, coal, stone all have **mining time 1 s** and **stack size 50**; uranium ore mining time 2 s (source: https://wiki.factorio.com/Mining, /Iron_ore, /Stone).

Crafting duration = recipe time ÷ crafting speed (player crafting speed = 1). Ores cannot be hand-smelted; fluid recipes cannot be hand-crafted; the player chain-crafts missing intermediates automatically, assembling machines do not (source: https://wiki.factorio.com/Crafting).

---

## 2. Mining drills

Sources: https://wiki.factorio.com/Burner_mining_drill, https://wiki.factorio.com/Electric_mining_drill, https://wiki.factorio.com/Mining, https://lua-api.factorio.com/latest/prototypes/MiningDrillPrototype.html, https://github.com/wube/factorio-data/blob/master/base/prototypes/entity/mining-drill.lua

| Property | Burner mining drill | Electric mining drill |
|---|---|---|
| Footprint | **2×2** (collision box ±0.7) | **3×3** (collision box ±1.35) |
| Health | 150 | 300 |
| Energy | **150 kW burner** (1 fuel slot) | **90 kW electric** (no drain listed) |
| Mining speed | **0.25** | **0.5** |
| Mining area | **2×2** — only the tiles under itself (`resource_searching_radius = 0.99`) | **5×5** — footprint plus 1 tile ring on every side (`resource_searching_radius = 2.49`) |
| Output rate on iron/copper/coal/stone (mining time 1 s) | 0.25 items/s | 0.5 items/s |
| Output rate on uranium (mining time 2 s, needs sulfuric acid) | cannot mine | 0.25 items/s |
| Pollution | 12/min | 10/min |
| Module slots | 0 | 3 |
| Output vector (facing north, relative to centre) | `{-0.35, -1.3}` | `{0, -1.85}` |
| Fluid box | none | 200 units sulfuric-acid input; connectors on west `{-1,0}`, east `{1,0}`, south `{0,1}` (only shown over uranium) |
| Recipe | 3 iron gear + 3 iron plate + 1 stone furnace, **2 s** (raw: 9 iron plate + 5 stone) | 3 electronic circuit + 5 iron gear + 10 iron plate, **2 s** (raw: 23 iron plate + 4.5 copper plate) |
| Technology | none | 1.1: none. 2.0: trigger tech "Electric mining drill" (no science packs) |
| Stack size | 50 | 50 |
| Resource drain | 100 % (each ore mined removes 1 from the patch) | 100 % |

**Mining formula:** `items per second = mining_speed / resource mining_time × (1 + mining productivity bonus)`. Mining productivity research adds +10 % per level (bonus items are free, do not deplete the patch). The drill takes ore evenly from every resource tile inside its area (since 0.7.3); it stops with "no minable resources" when the whole area is empty.

**Output rules (important for the clone):**
* The drill has a yellow arrow on its front edge. It places each mined item at `vector_to_place_result`, i.e. **on the tile directly in front of the drill**. For the 3×3 electric drill this is the tile in front of the *centre* column. For the 2×2 burner drill (`x = -0.35`) it is the tile in front of the **left (west) column** when facing north; rotate accordingly.
* Whatever covers that tile receives the item directly, no inserter needed: a transport belt, underground belt, splitter, chest, furnace (goes to its input slot), assembling machine, wagon, etc. The wiki: "places it in front of the output tile, on a belt or in a machine or chest that covers the output tile".
* Belt lane: the drop point is only 0.35 (electric) / 0.30 (burner) tiles past the drill's edge, i.e. **before the centre of the target tile**, so on a belt running perpendicular to the drill the ore lands on the **near lane** (the lane closest to the drill). This is the opposite of inserters (which drop on the far lane). Two rows of drills facing each other across one belt therefore fill both lanes. (Forum thread https://forums.factorio.com/viewtopic.php?t=88434 documents a small inconsistency for burner drills in some rotations; a clone can simply use "near lane".)
* If nothing is on the output tile the item is dropped on the ground; the drill then waits until that spot is free (only one item can lie there) *(memory, standard in-game behaviour)*.
* If the receiving container/belt is full, the drill pauses ("output full").
* Two burner drills facing each other on a coal patch refuel each other (each outputs into the other's fuel slot).

---

## 3. Furnaces

Sources: https://wiki.factorio.com/Stone_furnace, https://wiki.factorio.com/Steel_furnace, https://wiki.factorio.com/Electric_furnace, https://lua-api.factorio.com/latest/prototypes/FurnacePrototype.html, factorio-data `entities.lua` (stone-furnace: `source_inventory_size = 1`, `result_inventory_size = 1`, `fuel_inventory_size = 1`, `crafting_categories = {"smelting"}`)

| Property | Stone furnace | Steel furnace | Electric furnace |
|---|---|---|---|
| Footprint | **2×2** | **2×2** | **3×3** |
| Health | 200 | 300 | 350 |
| Crafting speed | **1** | **2** | **2** |
| Energy | 90 kW burner | 90 kW burner | **180 kW electric + 6 kW drain** |
| Pollution | 2/min | 4/min | 1/min |
| Module slots | 0 | 0 | 2 |
| Slots | 1 input, 1 fuel, 1 output | 1 input, 1 fuel, 1 output | 1 input, 1 output (no fuel slot) |
| Recipe | **5 stone**, 0.5 s | 6 steel plate + 10 stone brick, 3 s | 5 advanced circuit + 10 steel plate + 10 stone brick, 5 s |
| Technology | none (player starts with 1) | Advanced material processing | Advanced material processing 2 |
| Resistances | explosion 0/30 %, fire 0/90 %, impact 0/30 % | fire 0/100 % | fire 0/80 % |
| Stack size | 50 | 50 | 50 |

**Throughput** (crafting speed ÷ recipe time):

| Product | Recipe time | Stone furnace | Steel / Electric furnace |
|---|---|---|---|
| Iron plate / Copper plate / Stone brick | 3.2 s | 0.3125/s (one every 3.2 s) | 0.625/s (one every 1.6 s) |
| Steel plate | 16 s | 0.0625/s | 0.125/s |
| Coal use | | 0.0225 coal/s | 0.0225 coal/s (steel) |

One full yellow belt of ore (15/s) feeds **48 stone furnaces** or **24 steel/electric furnaces** *(derived: 15 ÷ 0.3125 = 48; 15 ÷ 0.625 = 24)*. Steel furnace can be placed directly over a stone furnace (fast replace).

**Slot mechanics (how a furnace takes input and gives output):**
* **Input slot** (1 slot): accepts only items that have a *smelting* recipe (iron ore, copper ore, stone, iron plate for steel). The furnace **automatically selects the recipe from the item in the input slot** (FurnacePrototype: "furnaces automatically choose their recipe based on input"). Because there is exactly one input slot, only one item type can be inside at a time; an inserter holding a different ore waits until the slot is empty. Inserting a non-smeltable item is refused.
* **Fuel slot** (1 slot, burner furnaces only): any chemical fuel; inserters stop adding at 5 items. The furnace burns fuel only while smelting (energy_usage 90 kW × active time); progress halts without fuel.
* **Output slot** (1 slot): holds one stack of the product (100 plates/bricks). Smelting stops when the next result no longer fits. Inserters **only take from the output slot**, never from input or fuel.
* Changing the input item type (e.g. iron ore → copper ore) is allowed once the input slot is empty; the current in-progress craft completes with the old recipe and the output slot must be emptied before a different product can be produced (a furnace's output slot holds one item type) *(memory)*.
* Smelting progress = crafting speed × time ÷ recipe time; when it reaches 1 the ingredient is consumed and the product appears in the output slot (ingredients are consumed at craft start in the real game; either model is fine for a clone).

---

## 4. Assembling machines

Sources: https://wiki.factorio.com/Assembling_machine_1, /Assembling_machine_2, /Assembling_machine_3, https://wiki.factorio.com/Inserters (insertion limits)

| Property | Assembling machine 1 | Assembling machine 2 | Assembling machine 3 |
|---|---|---|---|
| Footprint | **3×3** | **3×3** | **3×3** |
| Health | 300 | 350 | 400 |
| Crafting speed | **0.5** | **0.75** | **1.25** |
| Energy | **75 kW + 2.5 kW drain** | **150 kW + 5 kW drain** | **375 kW + 12.5 kW drain** |
| Pollution | 4/min | 3/min | 2/min |
| Module slots | 0 | 2 | 4 |
| Fluid recipes | **no** ("Cannot craft with liquids") | yes (pipe connections at centre of a side, rotate with R) | yes |
| Ingredient count limit | **unlimited since 0.17** (was max 2 ingredients before 0.17; AM2 was 4, AM3 was 6 *(memory)*) | unlimited | unlimited |
| Recipe | 3 electronic circuit + 5 iron gear + 9 iron plate, 0.5 s (raw 22 iron + 4.5 copper) | 1 AM1 + 3 electronic circuit + 5 iron gear + 2 steel plate, 0.5 s | 2 AM2 + 4 speed module, 0.5 s |
| Technology | Automation | Automation 2 | Automation 3 |
| Fire resistance | — | 0/70 % | 0/70 % |
| Stack size | 50 | 50 | 50 |

**Mechanics:**
* The player picks a recipe in the GUI; the machine shows one input slot per ingredient and one output slot per product.
* Craft time = recipe time ÷ crafting speed (AM1 makes a 0.5 s gear in 1 s; AM3 in 0.4 s). Only AM3 is faster than hand crafting (speed 1).
* Ingredients are consumed when a craft starts; the product appears in the output slot when progress reaches 100 %. The machine idles with "output full" when the output slot cannot hold the next result (output holds up to one stack) and with "item ingredient shortage" when any ingredient is missing.
* Inserters feed only up to the limit in §1.4 (≥ 2 crafts' worth, ≤ 100 crafts' worth); the player can insert whole stacks.
* Power draw: consumption only while crafting, drain always. If satisfaction < 100 % the crafting speed scales down proportionally.
* Assemblers cannot chain-craft intermediates: a lamp needs separate machines for copper cable, iron sticks, electronic circuits.

---

## 5. Storage chests

Sources: https://wiki.factorio.com/Wooden_chest, /Iron_chest, /Steel_chest (factorio-data: wooden-chest `inventory_size = 16`, iron-chest `32`)

| Chest | Footprint | Health | Slots | Recipe | Technology | Stack |
|---|---|---|---|---|---|---|
| Wooden chest | 1×1 | 100 | **16** | 2 wood, 0.5 s | none | 50 |
| Iron chest | 1×1 | 200 | **32** | 8 iron plate, 0.5 s | none | 50 |
| Steel chest | 1×1 | 350 | **48** | 8 steel plate, 0.5 s | Steel processing | 50 |

Each slot holds one stack (50 ore / 100 plates / 200 circuits...). Inserters and drills can insert; inserters take from any slot. Chests can be limited (red X bar) to fewer slots and connect to the circuit network. Iron chest resistances: fire 0/80 %, impact 0/30 %; steel: fire 0/90 %, impact 0/60 %.

---

## 6. Steam power chain: offshore pump → boiler → steam engine

Sources: https://wiki.factorio.com/Offshore_pump, https://wiki.factorio.com/Boiler, https://wiki.factorio.com/Steam_engine, https://wiki.factorio.com/Power_production, https://wiki.factorio.com/Steam, factorio-data `entities.lua`

| Property | Offshore pump | Boiler | Steam engine |
|---|---|---|---|
| Footprint (facing north) | **1×2** (1 wide, 2 long; collision `{{-0.6,-1.05},{0.6,0.3}}`) | **3×2** (3 wide, 2 deep; collision `{{-1.29,-0.79},{1.29,0.79}}`) | **3×5** (3 wide, 5 long; collision `{{-1.25,-2.35},{1.25,2.35}}`) |
| Health | 150 | 200 | 400 |
| Energy | **none** (needs no power or fuel) | **1.8 MW burner**, 1 fuel slot | produces **900 kW** max |
| Fluid rate | **1200 water/s** (20 per tick) | consumes **6 water/s → 60 steam/s** at 165 °C (2.0, 1 water = 10 steam). 1.1: 60 water/s → 60 steam/s (1:1) | consumes **30 steam/s** (0.5 per tick) at up to 165 °C |
| Fluid buffers | 100 | 200 input + 200 output | 200 |
| Pollution | 0 | **30/min** | 0 |
| Recipe | 2.0: 2 iron gear + 3 pipe, 0.5 s. 1.1: 2 electronic circuit + 1 iron gear + 1 pipe, 0.5 s | 1 stone furnace + 4 pipe, 0.5 s (raw 4 iron + 5 stone) | 8 iron gear + 10 iron plate + 5 pipe, 0.5 s (raw 31 iron) |
| Technology | 1.1: none; 2.0: "Steam power" trigger tech | same | same |
| Stack size | 20 | 50 | 10 |
| Resistances | — | explosion 0/30, fire 0/90, impact 0/30 | fire 0/70, impact 0/30 |

**Placement and pipe connections:**
* **Offshore pump** must stand on the shoreline: since 0.18.10 it is built on the *ground tile adjacent to water* (before that on the water tile adjacent to ground). Its single pipe connection is on the land side (`position {0,0}, direction south` when facing north, i.e. the pump faces the water and outputs behind itself). Output is endless; lake size is irrelevant.
* **Boiler** (facing north, 3 wide × 2 deep): two **water** connections of type input-output at the **west end** `{-1, 0.5}` and **east end** `{1, 0.5}` of the *back* row — water passes straight through, so boilers are chained side-by-side in a line; one **steam** output at the **front centre** `{0, -0.5}` pointing north. Fuel is inserted by an inserter or by hand into any side. Fuel consumption at full load: 1.8 MW ÷ 4 MJ = **0.45 coal/s**; a full yellow belt of coal (15/s) runs ≈ 33 boilers (60 MW).
* **Steam engine** (facing north, 3 wide × 5 long): two input-output ports at the **centre of both short ends** (`{0,-2}` north and `{0,2}` south). Steam passes through, so engines are chained end-to-end. The engine must be inside an electric pole's supply area to feed the grid. Steam hotter than 165 °C gives no extra power.
* **Ratios:** 1 boiler : 2 steam engines (1.8 MW ↔ 2 × 900 kW). 2.0: **1 offshore pump : 200 boilers : 400 engines** (1200 ÷ 6). 1.1: **1 pump : 20 boilers : 40 engines** (1200 ÷ 60) = 36 MW.
* Steam energy: 200 J per unit per °C above 15 °C ambient; 165 °C steam holds 30 kJ/unit → 30 units/s × 30 kJ = 900 kW (matches the engine). Steam engine and boiler run at 100 % efficiency. Water temperature 15 °C.

---

## 7. Pipes

Sources: https://wiki.factorio.com/Pipe, https://wiki.factorio.com/Pipe_to_ground, https://wiki.factorio.com/Fluid_system

| Property | Pipe | Pipe to ground |
|---|---|---|
| Footprint | 1×1 | 1×1 |
| Health | 100 | 150 |
| Fluid capacity | **100** units | 100 units (a pair holds 200 total regardless of length; the gap stores nothing) |
| Recipe | **1 iron plate**, 0.5 s → 1 | 5 iron plate + 10 pipe, 0.5 s → **2** |
| Max underground reach | — | **10 tiles** between the pair (`max_underground_distance = 10`) → gap of **9** tiles |
| Technology | 1.1 none; 2.0 "Steam power" | same |
| Stack size | 100 | 50 |
| Resistances | fire 0/80 %, impact 0/30 % | fire 0/80 %, impact 0/40 % |

Rules: a pipe auto-connects to every adjacent pipe/fluid port on all 4 sides; a pipe-to-ground connects on exactly two opposite sides (one normal connection, one underground). Placing a pipe that would join two different fluids is refused; a pipe holds exactly one fluid type (flush via GUI to empty). Players and enemies cannot walk over pipes. 2.0 flow model: connected pipes form a *segment* with one fluid; throughput is effectively unlimited within a segment up to a 320×320-tile extent (pump needed beyond). Per-connection practical cap ≈ 4200/s (theoretical 6000/s = 100/tick). 1.1 model *(memory, unverified)*: flow degraded with pipe length — ≈ 1200/s up to ~17 pipes, ≈ 1000/s up to ~200 pipes, falling to a few hundred per second over several hundred pipes.

---

## 8. Electric poles

Sources: https://wiki.factorio.com/Small_electric_pole, /Medium_electric_pole, /Big_electric_pole, /Substation, https://wiki.factorio.com/Electric_system, https://lua-api.factorio.com/latest/prototypes/ElectricPolePrototype.html, factorio-data (small-electric-pole `maximum_wire_distance = 7.5`, `supply_area_distance = 2.5`)

| Property | Small electric pole | Medium electric pole | Big electric pole | Substation |
|---|---|---|---|---|
| Footprint | **1×1** | **1×1** | **2×2** | **2×2** |
| Health | 100 | 100 | 150 | 200 |
| Supply area | **5×5** (distance 2.5) | **7×7** (distance 3.5) | **4×4** (distance 2) | **18×18** (distance 9) |
| Wire reach | **7.5** tiles | **9** tiles | **32** tiles (2.0); **30** in 1.1 | **18** tiles |
| Recipe | 1 wood + 2 copper cable, 0.5 s → **2 poles** | 2 copper cable + 4 iron stick + 2 steel plate, 0.5 s → 1 | 4 copper cable + 8 iron stick + 5 steel plate, 0.5 s → 1 | 5 advanced circuit + 6 copper cable + 10 steel plate, 0.5 s → 1 |
| Technology | 1.1 none; 2.0 "Electronics" trigger tech | Electric energy distribution 1 | Electric energy distribution 1 | Electric energy distribution 2 |
| Stack size | 50 | 50 | 50 | 50 |
| Fire resistance | — | 0/100 % | 0/100 % | 0/90 % |

**Rules:**
* Supply area is a square centred on the pole: side = 2 × `supply_area_distance`. A 1×1 pole with distance 2.5 covers 5×5 tiles (the pole's tile plus 2 tiles each way). A 2×2 pole is centred on a tile corner so distance 2 → 4×4 and distance 9 → 18×18.
* A machine is powered if **at least one of its tiles** is inside any supply area of the network.
* Wire reach is the maximum centre-to-centre distance between two poles; when two poles have different reach the **smaller** one applies. Reach is Euclidean, not Manhattan.
* On placement a pole auto-connects to the nearest poles in reach, avoiding 3-pole triangles, up to **5 wires per pole** (`auto_connect_up_to_n_wires = 5`). Wires can also be added/removed manually with copper cable.
* All poles connected by wires form one electric network; every generator/consumer in any pole's supply area belongs to it. Poles also carry red/green circuit wires.

---

## 9. Solar panel and accumulator

Sources: https://wiki.factorio.com/Solar_panel, https://wiki.factorio.com/Accumulator, https://wiki.factorio.com/Time, https://wiki.factorio.com/Power_production

| Property | Solar panel | Accumulator |
|---|---|---|
| Footprint | **3×3** | **2×2** |
| Health | 200 | 150 |
| Output | **60 kW** peak in full daylight; **42 kW** average over a full day/night cycle | **300 kW** max input and **300 kW** max output |
| Storage | — | **5 MJ** (full charge/discharge takes ≈ 17 s at 300 kW) |
| Recipe | 5 copper plate + 15 electronic circuit + 5 steel plate, **10 s** | 5 battery + 2 iron plate, **10 s** |
| Technology | Solar energy | Electric energy accumulators |
| Stack size | 50 | 50 |

**Day/night cycle (Nauvis):** one day = **25,200 ticks = 420 s = 7 min**: full daylight 12,600 ticks (210 s), dusk 5,040 ticks (84 s, light decreases linearly), night 2,520 ticks (42 s, dark), dawn 5,040 ticks (84 s, light increases linearly). Solar output scales linearly with light level, so energy per panel per cycle = 60 kW × (210 + 42 + 42) s = **17,640 kJ** → average 42 kW.

**Ratios:** 0.84 accumulators per solar panel (21 : 25); 23.8 panels per MW of average demand; 1 MW through a night needs 100 MJ = 20 accumulators; rule of thumb 20 accumulators : 24 panels : 1 MW.

Accumulator behaviour: lowest priority — charges only when production exceeds demand, discharges only when other generators cannot satisfy demand.

---

## 10. Lab

Sources: https://wiki.factorio.com/Lab

| Property | Lab |
|---|---|
| Footprint | **3×3** |
| Health | 150 |
| Energy | **60 kW** electric (no drain listed) |
| Research speed | **1** |
| Module slots | 2 |
| Recipe | 10 electronic circuit + 10 iron gear + 4 transport belt, **2 s** (raw 36 iron + 15 copper) |
| Technology | 1.1 none; 2.0 "Electronics" trigger tech |
| Stack size | 10 |

Mechanics: one science-pack slot per pack type (automation, logistic, military, chemical, production, utility, space in 1.1). Only one technology is researched at a time; every lab holding all required packs works in parallel. Time per research unit = technology unit time ÷ effective research speed; effective speed = (1 + lab-research-speed research bonus) × (1 + module bonus) × base speed. Inserters can take packs out of a lab and insert them into the next lab (lab chaining).

---

## 11. Radar

Sources: https://wiki.factorio.com/Radar, factorio-data (`energy_usage = "300kW"`, `energy_per_sector = "10MJ"`, `energy_per_nearby_scan = "250kJ"`, `max_distance_of_sector_revealed = 14`, `max_distance_of_nearby_sector_revealed = 3`)

| Property | Radar |
|---|---|
| Footprint | **3×3** |
| Health | 250 |
| Energy | **300 kW** electric (continuous while powered) |
| Continuous reveal | radius 3 chunks → **7×7 chunks = 224×224 tiles** centred on the radar's chunk; costs 250 kJ per nearby scan |
| Far scan | radius 14 chunks → 29×29 chunks; one chunk per **10 MJ** = **33.33 s** at full power; 792 chunks per full cycle = 7 h 20 min |
| Minimum power to keep continuous coverage | 25 kW |
| Recipe | 5 electronic circuit + 5 iron gear + 10 iron plate, 0.5 s (raw 25 iron + 7.5 copper) |
| Technology | 1.1 none; 2.0 trigger tech "Radar" *(memory)* |
| Resistances | fire 0/70 %, impact 0/30 % |
| Stack size | 50 |

Radars also enable remote map view of charted areas (since 0.15).

---

## 12. Defence: gun turret, ammunition, wall, gate

Sources: https://wiki.factorio.com/Gun_turret, https://wiki.factorio.com/Firearm_magazine, https://wiki.factorio.com/Piercing_rounds_magazine, https://wiki.factorio.com/Stone_wall, https://wiki.factorio.com/Gate, factorio-data `turrets.lua`

### 12.1 Gun turret

| Property | Value |
|---|---|
| Footprint | **2×2** (collision ±0.7) |
| Health | **400** |
| Range | **18** tiles |
| Rate of fire | cooldown **6 ticks → 10 shots/s** (wiki "Shooting speed 10/s") |
| Rotation speed | 0.015 turns/tick (= 324°/s) |
| Preparing / folding speed | 0.08 |
| Ammo inventory | **1 slot**; inserters fill up to **10 magazines** (`automated_ammo_count = 10`) |
| Ammo category | bullet: firearm magazine, piercing rounds magazine, uranium rounds magazine |
| Energy | none |
| Recipe | 10 copper plate + 10 iron gear + 20 iron plate, **8 s** (raw 40 iron + 10 copper) |
| Technology | Gun turret |
| Stack size | 50 |

Damage: each shot consumes 1 round of the magazine (10 rounds per magazine). Firearm magazine = **5 physical** damage per shot; piercing rounds = **8 physical** per shot (60 % more). Physical projectile damage research raises ammo damage and the turret's own bonus as two separate multiplicative bonuses. Turrets auto-target the nearest enemy in range; inserters can move magazines turret-to-turret. Since 2.0.7 turrets can be given target priorities.

### 12.2 Stone wall and gate

| Property | Stone wall | Gate |
|---|---|---|
| Footprint | 1×1 | 1×1 |
| Health | **350** | 350 |
| Resistances (flat / %) | physical 3/20 %, explosion 10/30 %, fire 0/100 %, impact 45/60 %, laser 0/70 %, acid 0/80 % | identical to wall |
| Recipe | **5 stone brick**, 0.5 s → 1 | 1 stone wall + 2 steel plate + 2 electronic circuit, 0.5 s → 1 |
| Technology | Stone wall | Gate |
| Stack size | 100 | 50 |

Wall rules: walls join visually with adjacent walls (a 2×2 block of walls fills its centre visually only). Walls block movement and melee attacks only; ranged attacks (spitters) go over them; big biters can hit 2 tiles away over a single wall. Enemies attack walls only when they block the path to their target. A gate is placed in a line of walls and opens automatically when the player (≈ 4–5 tiles away when walking) or a player vehicle approaches, stays open while they are within ≈ 2–3 tiles, and never opens for biters; a rail gate opens for trains.

---

## 13. Inserters

Sources: https://wiki.factorio.com/Inserters, https://wiki.factorio.com/Burner_inserter, /Inserter, /Long-handed_inserter, /Fast_inserter, /Filter_inserter, factorio-data `entities.lua` (pickup/insert positions, speeds, energy per movement)

| Property | Burner inserter | Inserter (yellow) | Long-handed inserter (red) | Fast inserter (blue) | Filter inserter (1.1 only) |
|---|---|---|---|---|---|
| Footprint | 1×1 | 1×1 | 1×1 | 1×1 | 1×1 |
| Health | 100 | 150 | 160 | 150 | 150 |
| Energy | **144 kW burner** while moving (2.0); 1.1 ≈ 94.2 kW *(memory)*; 1 fuel slot; starts with a 500 kJ buffer | **15.1 kW + 0.4 kW drain** (1.1: 13.2 kW) | **21.4 kW + 0.4 kW drain** (1.1: 18.4 kW) | **59.3 kW + 0.5 kW drain** (1.1: 46.7 kW) | 52 kW + 0.5 kW drain |
| Energy per rotation / per movement | 50 kJ / 50 kJ | 5 kJ / 5 kJ | 5 kJ / 5 kJ | 7 kJ / 7 kJ | 7 kJ / 7 kJ *(memory)* |
| Rotation speed (turns per tick) | **0.013** (281°/s); 1.1: 0.01 | **0.014** (302°/s) | **0.02** (432°/s) | **0.04** (864°/s) | 0.04 |
| Extension speed (tiles per tick) | 0.035; 1.1: 0.0214 | 0.035; 1.1: 0.03 | 0.05; 1.1: 0.0457 | 0.1; 1.1: 0.07 | 0.1; 1.1: 0.07 |
| Ticks per full cycle (chest→chest) | **76** | **70** | **48** | **24** | 24 |
| Items/s chest→chest, hand size 1 | 0.79 | 0.86 | 1.25 | 2.5 | 2.5 |
| Pickup position (facing north) | `{0,-1}` | `{0,-1}` | **`{0,-2}`** | `{0,-1}` | `{0,-1}` |
| Drop position (facing north) | `{0,1.2}` | `{0,1.2}` | **`{0,2.2}`** | `{0,1.2}` | `{0,1.2}` |
| Reach | 1 tile each side | 1 tile each side | **2 tiles each side** | 1 tile | 1 tile |
| Filters | 2.0: all inserters have a filter (5 slots) | | | | 5 filter slots, whitelist/blacklist |
| Recipe | 1 iron gear + 1 iron plate, 0.5 s | 1 electronic circuit + 1 iron gear + 1 iron plate, 0.5 s | 1 inserter + 1 iron gear + 1 iron plate, 0.5 s | 1 inserter + 2 electronic circuit + 2 iron plate, 0.5 s | 1 fast inserter + 4 electronic circuit, 0.5 s |
| Technology | none | 1.1 none; 2.0 "Electronics" | Automation | Fast inserter | Fast inserter (removed in 2.0.7; fast inserter has filters instead) |
| Stack size | 50 | 50 | 50 | 50 | 50 |
| Fire resistance | 0/90 % | 0/90 % | 0/90 % | 0/90 % | 0/90 % |

**Pickup / drop rules:**
* An inserter is a fixed-direction 1×1 entity. It **picks up from the tile directly behind it** and **drops on the tile directly in front of it** (long-handed: 2 tiles behind / 2 tiles in front, skipping the adjacent tiles). The hand swings 180° between the two points; each cycle = rotate to pickup, grab, rotate to drop, release.
* Sources it can take from: ground items, any belt (both lanes, also underground belt ends and splitters), chests, furnace output slot, assembling-machine output, lab, turret ammo, vehicles.
* Targets it can put into: ground (if nothing else is there), belts, chests, furnace input slot (smeltable items) or fuel slot (fuel), boiler/burner-drill/burner-inserter fuel slots, assembling-machine ingredient slots (only ingredients of the selected recipe, up to the §1.4 limit), lab pack slots, turret ammo slots.
* **Belt lane on drop:** the drop point is 1.2 tiles away, i.e. past the centre (1.0) of the target tile, so on a belt running **perpendicular** to the inserter the item lands on the **far lane**. On a belt running **parallel** (same axis) the item goes on the **right-hand lane from the belt's point of view**.
* **Belt lane on pickup:** from a perpendicular belt the inserter prefers the **nearest lane**; from a parallel or curved belt it prefers the belt's left lane. It grabs items moving past its pickup point; slow inserters may miss items on fast belts (yellow inserter cannot reliably pick from express-belt curves).
* Hand size: 1 item by default for all non-stack inserters; "Inserter capacity bonus" research raises it (to 3 for normal inserters in 1.1 *(memory)*).
* Burner inserter: when its own fuel runs out it takes fuel from the items it is moving ("leech"); consumes ≈ 69.4 kJ per transfer.
* Power: drain always; movement energy only while swinging. An unpowered electric inserter stops mid-swing.

---

## 14. Belts, underground belts, splitters

Sources: https://wiki.factorio.com/Transport_belt, /Fast_transport_belt, /Express_transport_belt, /Underground_belt, /Fast_underground_belt, /Express_underground_belt, /Splitter, /Fast_splitter, /Express_splitter, https://wiki.factorio.com/Belt_transport_system, https://lua-api.factorio.com/latest/prototypes/TransportBeltConnectablePrototype.html

### 14.1 Transport belts

| Property | Transport belt (yellow) | Fast transport belt (red) | Express transport belt (blue) |
|---|---|---|---|
| Footprint | 1×1 | 1×1 | 1×1 |
| Health | 150 | 160 | 170 |
| Speed | **1.875 tiles/s** (`speed = 0.03125` tiles/tick) | **3.75 tiles/s** (0.0625) | **5.625 tiles/s** (0.09375) |
| Throughput (both lanes) | **15 items/s** (7.5 per lane) | **30 items/s** | **45 items/s** |
| Density | **8 items per tile** (4 per lane, one item every 0.25 tile) | 8 per tile | 8 per tile |
| Recipe | 1 iron plate + 1 iron gear, 0.5 s → **2 belts** | 1 transport belt + 5 iron gear, 0.5 s → 1 | 1 fast belt + 10 iron gear + 20 lubricant, 0.5 s → 1 (needs AM2/AM3, fluid) |
| Technology | none | Logistics 2 | Logistics 3 |
| Stack size | 100 | 100 | 100 |
| Fire resistance | 0/90 % | 0/50 % | 0/50 % |

Throughput formula from the prototype docs: `items/s = speed × 480` (0.03125 × 480 = 15). Before 0.17 the values were 13.33 / 26.67 / 40 items/s.

### 14.2 Underground belts

| Property | Underground belt | Fast underground belt | Express underground belt |
|---|---|---|---|
| Footprint | 1×1 per end (always placed as an entrance + exit pair) | 1×1 | 1×1 |
| Health | 150 | 160 | 170 |
| Speed | 15 items/s | 30 items/s | 45 items/s |
| Max gap between the two ends | **4 tiles** (`max_distance = 5` counted end-to-end) | **6 tiles** | **8 tiles** |
| Items stored in a max-length pair | 44 (yellow pair over 4-tile gap) | — | 72 (express at max length) |
| Recipe | 10 iron plate + 5 transport belt, 1 s → **2** | 40 iron gear + 2 underground belt, 2 s → **2** | 80 iron gear + 2 fast underground belt + 40 lubricant, 2 s → **2** |
| Technology | Logistics | Logistics 2 | Logistics 3 |
| Stack size | 50 | 50 | 50 |
| Resistances | fire 0/60 %, impact 0/30 % | same | same |

Rules: entrance and exit must lie on the same row/column, face the same direction, and be within the max gap; the game auto-pairs the closest matching end. Each end behaves like half a belt tile (items enter the hood and re-emerge at the exit). Underground belts cannot cross lava/space void (Space Age). Side-loading into an underground end only reaches one lane, because the hood blocks the other — this is the standard "lane filter" trick.

### 14.3 Splitters

| Property | Splitter | Fast splitter | Express splitter |
|---|---|---|---|
| Footprint | **2 wide × 1 deep** (wiki "1×2") | 2×1 | 2×1 |
| Health | 170 | 180 | 190 |
| Speed | 15 items/s per belt | 30 items/s | 45 items/s |
| Recipe | 5 electronic circuit + 5 iron plate + 4 transport belt, 1 s → 1 | 10 electronic circuit + 10 iron gear + 1 splitter, 2 s → 1 | 10 advanced circuit + 10 iron gear + 1 fast splitter + 80 lubricant, 2 s → 1 |
| Technology | Logistics | Logistics 2 | Logistics 3 |
| Stack size | 50 | 50 | 50 |
| Fire resistance | 0/60 % | 0/60 % | 0/60 % |

Rules: up to 2 input belts (back side) and 2 output belts (front side); items are distributed **1 : 1** alternately between the outputs; if one output is blocked, everything goes to the other; **lanes are preserved** (a right-lane item stays on the right lane). Optional settings: input priority (left/right), output priority (left/right), and a filter that sends one chosen item type to one output (the other output gets everything else). A splitter slower than its incoming belt is a bottleneck.

### 14.4 Belt mechanics (source: https://wiki.factorio.com/Belt_transport_system, https://wiki.factorio.com/Transport_belt)

* Every belt tile has **2 lanes** (left and right relative to travel direction), each holding up to 4 items per tile; the belt moves items along at its speed; a full straight belt holds 8 items per tile at every tier.
* Items **do not fall off** the end of a belt; they stop and queue (the belt backs up). A belt must lead directly to the inserter/drill target.
* **Turns/curves:** a belt whose input comes from the side of the previous belt bends; both lanes are kept, the inner lane is shorter (items on it cover fewer tiles per second in world space but per-lane throughput is preserved).
* **Side-loading:** when a belt runs head-on into the *side* of another belt, all its items (both lanes) are merged onto the **near lane** of the target belt only. Head-on into the *side of an underground belt end* only one lane can enter (see 14.2).
* Two belts joining head-to-head (opposite directions) do not connect; a belt pointing into the back of another belt continues it.
* Rotating or replacing a belt with a different direction collects the items on it into the player inventory.
* The player can walk on belts and is carried along; items on the ground are not moved by belts unless placed on one.
* Belts need no power and produce no pollution.

---

## 15. Player character quick reference (for scale; source: https://wiki.factorio.com/Character, https://wiki.factorio.com/Mining)

| Property | Value |
|---|---|
| Health | 250; regenerates 6 HP/s after a few seconds without damage |
| Running speed | 8.9 tiles/s (0.15 tiles/tick) |
| Mining speed | 0.5 → hand-mines an ore (mining time 1 s) every 2 s: rate = (1 + modifier) × 0.5 ÷ mining time |
| Crafting speed | 1 |
| Build / reach distance | 10 tiles (was 6 before 0.17) |
| Inventory | 80 slots (+10 with Toolbelt research) |
| Respawn | 10 s |
| Freeplay start | 1 burner mining drill, 1 stone furnace, 1 wood (plus pistol and firearm magazines *(memory)*) |

---

## 16. Compact constants table for implementation

| Entity | Size | HP | Power/fuel | Key rate | Pollution/min | Recipe (time) |
|---|---|---|---|---|---|---|
| Burner mining drill | 2×2 | 150 | 150 kW burner | 0.25 ore/s, area 2×2 | 12 | 3 gear + 3 iron + 1 stone furnace (2 s) |
| Electric mining drill | 3×3 | 300 | 90 kW | 0.5 ore/s, area 5×5 | 10 | 3 circuit + 5 gear + 10 iron (2 s) |
| Stone furnace | 2×2 | 200 | 90 kW burner | speed 1 (plate / 3.2 s) | 2 | 5 stone (0.5 s) |
| Steel furnace | 2×2 | 300 | 90 kW burner | speed 2 | 4 | 6 steel + 10 brick (3 s) |
| Electric furnace | 3×3 | 350 | 180 kW + 6 kW drain | speed 2 | 1 | 5 adv circuit + 10 steel + 10 brick (5 s) |
| Assembling machine 1 | 3×3 | 300 | 75 kW + 2.5 kW | speed 0.5, no fluids | 4 | 3 circuit + 5 gear + 9 iron (0.5 s) |
| Assembling machine 2 | 3×3 | 350 | 150 kW + 5 kW | speed 0.75, 2 modules | 3 | AM1 + 3 circuit + 5 gear + 2 steel (0.5 s) |
| Assembling machine 3 | 3×3 | 400 | 375 kW + 12.5 kW | speed 1.25, 4 modules | 2 | 2 AM2 + 4 speed module (0.5 s) |
| Wooden chest | 1×1 | 100 | — | 16 slots | 0 | 2 wood (0.5 s) |
| Iron chest | 1×1 | 200 | — | 32 slots | 0 | 8 iron (0.5 s) |
| Steel chest | 1×1 | 350 | — | 48 slots | 0 | 8 steel (0.5 s) |
| Offshore pump | 1×2 | 150 | none | 1200 water/s | 0 | 2 gear + 3 pipe (0.5 s) [1.1: 2 circuit + 1 gear + 1 pipe] |
| Boiler | 3×2 | 200 | 1.8 MW burner | 60 steam/s @165 °C (6 water/s; 1.1: 60 water/s) | 30 | 1 stone furnace + 4 pipe (0.5 s) |
| Steam engine | 3×5 | 400 | 900 kW out | 30 steam/s | 0 | 8 gear + 10 iron + 5 pipe (0.5 s) |
| Pipe | 1×1 | 100 | — | 100 fluid | 0 | 1 iron (0.5 s) |
| Pipe to ground | 1×1 | 150 | — | reach 10 (gap 9) | 0 | 5 iron + 10 pipe → 2 (0.5 s) |
| Small electric pole | 1×1 | 100 | — | supply 5×5, reach 7.5 | 0 | 1 wood + 2 cable → 2 (0.5 s) |
| Medium electric pole | 1×1 | 100 | — | supply 7×7, reach 9 | 0 | 2 cable + 4 stick + 2 steel (0.5 s) |
| Big electric pole | 2×2 | 150 | — | supply 4×4, reach 32 (1.1: 30) | 0 | 4 cable + 8 stick + 5 steel (0.5 s) |
| Substation | 2×2 | 200 | — | supply 18×18, reach 18 | 0 | 5 adv circuit + 6 cable + 10 steel (0.5 s) |
| Lab | 3×3 | 150 | 60 kW | research speed 1 | 0 | 10 circuit + 10 gear + 4 belt (2 s) |
| Radar | 3×3 | 250 | 300 kW | reveal 7×7 chunks; far scan 1 chunk / 33.3 s | 0 | 5 circuit + 5 gear + 10 iron (0.5 s) |
| Gun turret | 2×2 | 400 | none | range 18, 10 shots/s, 10 mags by inserter | 0 | 10 copper + 10 gear + 20 iron (8 s) |
| Stone wall | 1×1 | 350 | — | blocks melee | 0 | 5 brick (0.5 s) |
| Gate | 1×1 | 350 | — | opens for player/vehicles | 0 | 1 wall + 2 steel + 2 circuit (0.5 s) |
| Solar panel | 3×3 | 200 | 60 kW peak / 42 kW avg | day 420 s | 0 | 5 copper + 15 circuit + 5 steel (10 s) |
| Accumulator | 2×2 | 150 | 300 kW in/out | 5 MJ | 0 | 5 battery + 2 iron (10 s) |
| Burner inserter | 1×1 | 100 | 144 kW burner | 0.79 items/s, reach 1 | 0 | 1 gear + 1 iron (0.5 s) |
| Inserter | 1×1 | 150 | 15.1 kW + 0.4 kW | 0.86 items/s, reach 1 | 0 | 1 circuit + 1 gear + 1 iron (0.5 s) |
| Long-handed inserter | 1×1 | 160 | 21.4 kW + 0.4 kW | 1.25 items/s, reach 2 | 0 | 1 inserter + 1 gear + 1 iron (0.5 s) |
| Fast inserter | 1×1 | 150 | 59.3 kW + 0.5 kW | 2.5 items/s, reach 1 | 0 | 1 inserter + 2 circuit + 2 iron (0.5 s) |
| Filter inserter (1.1) | 1×1 | 150 | 52 kW + 0.5 kW | 2.5 items/s, 5 filters | 0 | 1 fast inserter + 4 circuit (0.5 s) |
| Transport belt | 1×1 | 150 | — | 1.875 tiles/s, 15 items/s | 0 | 1 iron + 1 gear → 2 (0.5 s) |
| Fast transport belt | 1×1 | 160 | — | 3.75 tiles/s, 30 items/s | 0 | 1 belt + 5 gear (0.5 s) |
| Express transport belt | 1×1 | 170 | — | 5.625 tiles/s, 45 items/s | 0 | 1 fast belt + 10 gear + 20 lubricant (0.5 s) |
| Underground belt (y/r/b) | 1×1 ×2 | 150/160/170 | — | gap 4 / 6 / 8 | 0 | 10 iron + 5 belt → 2 (1 s); 40 gear + 2 ug → 2 (2 s); 80 gear + 2 fast ug + 40 lubricant → 2 (2 s) |
| Splitter (y/r/b) | 2×1 | 170/180/190 | — | 1:1 split, lanes kept | 0 | 5 circuit + 5 iron + 4 belt (1 s); 10 circuit + 10 gear + 1 splitter (2 s); 10 adv circuit + 10 gear + 1 fast splitter + 80 lubricant (2 s) |

---

## 17. Sources

Wiki (primary):
* https://wiki.factorio.com/Burner_mining_drill
* https://wiki.factorio.com/Electric_mining_drill
* https://wiki.factorio.com/Mining
* https://wiki.factorio.com/Stone_furnace
* https://wiki.factorio.com/Steel_furnace
* https://wiki.factorio.com/Electric_furnace
* https://wiki.factorio.com/Assembling_machine_1
* https://wiki.factorio.com/Assembling_machine_2
* https://wiki.factorio.com/Assembling_machine_3
* https://wiki.factorio.com/Wooden_chest
* https://wiki.factorio.com/Iron_chest
* https://wiki.factorio.com/Steel_chest
* https://wiki.factorio.com/Offshore_pump
* https://wiki.factorio.com/Boiler
* https://wiki.factorio.com/Steam_engine
* https://wiki.factorio.com/Power_production
* https://wiki.factorio.com/Steam
* https://wiki.factorio.com/Pipe
* https://wiki.factorio.com/Pipe_to_ground
* https://wiki.factorio.com/Fluid_system
* https://wiki.factorio.com/Small_electric_pole
* https://wiki.factorio.com/Medium_electric_pole
* https://wiki.factorio.com/Big_electric_pole
* https://wiki.factorio.com/Substation
* https://wiki.factorio.com/Electric_system
* https://wiki.factorio.com/Solar_panel
* https://wiki.factorio.com/Accumulator
* https://wiki.factorio.com/Time
* https://wiki.factorio.com/Lab
* https://wiki.factorio.com/Radar
* https://wiki.factorio.com/Gun_turret
* https://wiki.factorio.com/Firearm_magazine
* https://wiki.factorio.com/Piercing_rounds_magazine
* https://wiki.factorio.com/Stone_wall
* https://wiki.factorio.com/Gate
* https://wiki.factorio.com/Inserters
* https://wiki.factorio.com/Burner_inserter
* https://wiki.factorio.com/Inserter
* https://wiki.factorio.com/Long-handed_inserter
* https://wiki.factorio.com/Fast_inserter
* https://wiki.factorio.com/Filter_inserter
* https://wiki.factorio.com/Transport_belt
* https://wiki.factorio.com/Fast_transport_belt
* https://wiki.factorio.com/Express_transport_belt
* https://wiki.factorio.com/Belt_transport_system
* https://wiki.factorio.com/Underground_belt
* https://wiki.factorio.com/Fast_underground_belt
* https://wiki.factorio.com/Express_underground_belt
* https://wiki.factorio.com/Splitter
* https://wiki.factorio.com/Fast_splitter
* https://wiki.factorio.com/Express_splitter
* https://wiki.factorio.com/Fuel
* https://wiki.factorio.com/Pollution
* https://wiki.factorio.com/Crafting
* https://wiki.factorio.com/Character
* https://wiki.factorio.com/Iron_plate, /Copper_plate, /Steel_plate, /Stone_brick, /Iron_gear_wheel, /Copper_cable, /Electronic_circuit, /Iron_stick, /Coal, /Wood, /Iron_ore, /Stone

Prototype data / API docs (secondary):
* https://github.com/wube/factorio-data/blob/master/base/prototypes/entity/mining-drill.lua
* https://raw.githubusercontent.com/wube/factorio-data/master/base/prototypes/entity/entities.lua
* https://raw.githubusercontent.com/wube/factorio-data/master/base/prototypes/entity/turrets.lua
* https://lua-api.factorio.com/latest/prototypes/MiningDrillPrototype.html
* https://lua-api.factorio.com/latest/prototypes/FurnacePrototype.html
* https://lua-api.factorio.com/latest/prototypes/InserterPrototype.html
* https://lua-api.factorio.com/latest/prototypes/ElectricPolePrototype.html
* https://lua-api.factorio.com/latest/prototypes/TransportBeltConnectablePrototype.html
* https://lua-api.factorio.com/latest/prototypes/BoilerPrototype.html

Community (tertiary):
* https://forums.factorio.com/viewtopic.php?t=88434 (burner drill output offset)
* https://forums.factorio.com/viewtopic.php?t=46496 (big pole reach 30 → 32)
