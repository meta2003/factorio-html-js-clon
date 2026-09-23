# Factorio — Items & Recipes (early/mid game, up to logistic + military science, steel, gun turrets)

KEY: `items-and-recipes`
Compiled 2026-09-22. Scope: everything needed up to and including logistic (green) science, military (grey) science, steel and gun turrets. Oil-chain items are out of scope except where an in-scope item depends on them (battery → accumulator).

## 0. Versions and sources (read this first)

Two data sets were used and are labelled throughout:

| Label | What it is | Source |
|---|---|---|
| **1.1** | Base game 1.1.110 prototype data (`data.raw`), *normal* recipe difficulty. This is the canonical "1.1" data and is the primary reference for the clone. | `wube/factorio-data` git tag `1.1.110`: https://github.com/wube/factorio-data/tree/1.1.110/base/prototypes (files `recipe.lua`, `item.lua`, `technology.lua`, `fluid.lua`, `entity/entities.lua`, `entity/mining-drill.lua`, `entity/turrets.lua`, `entity/trees.lua`, `entity/resources.lua`, `entity/projectiles.lua`) |
| **2.0** | Base game 2.0 (git `master`, 2.0.7x era) prototype data, cross-checked against the live wiki (which documents 2.0). | https://github.com/wube/factorio-data/tree/master/base/prototypes and https://wiki.factorio.com |

Unless a row says otherwise, **1.1 and 2.0 are identical**. Where 2.0 differs it is listed explicitly in the "2.0 diff" column or in §11.

Units: 1 game second = 60 ticks. Prototype speeds are stored per tick; multiply by 60 for per-second values. Energy strings like `90kW` are exact prototype values.

---

## 1. Crafting mechanics (rules the engine must implement)

Source: https://wiki.factorio.com/Crafting , https://lua-api.factorio.com/latest/classes/LuaForce.html (manual_crafting_speed_modifier), character prototype in `entities.lua` (1.1).

| Rule | Value |
|---|---|
| Actual craft duration | `recipe.energy_required / crafting_speed` seconds. Default `energy_required` when omitted in the prototype = **0.5 s**. |
| Player (hand) crafting speed | **1.0** (Lua API: "actual crafting speed will be multiplied by `1 + manual_crafting_speed_modifier`", default modifier 0). So hand-crafting time = recipe time. |
| Which recipes are hand-craftable | Character prototype `crafting_categories = {"crafting"}` → **only recipes in category `crafting`** (the default category). Not hand-craftable: `smelting` (all plates, bricks, steel), `advanced-crafting` (engine unit), `chemistry` (battery), `crafting-with-fluid`. Wiki: "Ores can only be smelted in a furnace", "Any recipe that involves liquids must be processed in a machine", "Engine units must be crafted in an assembling machine". |
| Hand-crafting chains | Manual crafting automatically crafts missing *hand-craftable* intermediates (e.g. crafting an inserter by hand also crafts the gear, cable and circuit); assembling machines do not chain. Left-click = 1, right-click = 5, shift-click = max. |
| Assembling machine 1 categories (1.1) | `crafting`, `basic-crafting`, `advanced-crafting` → AM1 **can** make engine units; cannot take fluids. |
| Assembling machine 2 / 3 categories | `basic-crafting`, `crafting`, `advanced-crafting`, `crafting-with-fluid` |
| Furnace category | `smelting` only (stone, steel, electric furnace) |
| Chemical plant category | `chemistry` (battery) |
| Electric drain rule | For electric machines drain = `energy_usage / 30` unless overridden (AM1 75 kW → 2.5 kW, AM2 150 kW → 5 kW, AM3 375 kW → 12.5 kW, electric furnace 180 kW → 6 kW, lab 60 kW → 2 kW, electric mining drill 90 kW → 3 kW). Inserters set drain explicitly (see §7.2). |
| Player stats (1.1 `character`) | max_health 250; healing 0.15 HP/tick (after not being in combat); running_speed 0.15 tiles/tick (= 9 tiles/s); reach / build distance 10 tiles; inventory 80 slots (+10 with Toolbelt research); mining_speed 0.5; tool (melee) damage 8 physical; item_pickup_distance 1; loot_pickup_distance 2. Freeplay start items: 1 burner mining drill, 1 stone furnace, 8 iron plates, 1 pistol + 10 firearm magazines (wiki). |
| Mining rate | `items/s = mining_speed / resource.mining_time` (wiki Mining page). Ores have mining_time 1 → player 0.5/s (2 s per ore, 1/s after Steel axe +100%), burner drill 0.25/s, electric drill 0.5/s. |

---

## 2. Master recipe table — 1.1.110 normal difficulty

Legend: **Time** = `energy_required` (s); **Out** = result count; **Cat.** = recipe category (`crafting` unless stated); **Hand** = hand-craftable (yes iff category = `crafting`); **Made in** = machines whose categories include the recipe category; **Unlock (1.1)** = technology that enables the recipe in 1.1 (`start` = enabled from game start). Ingredient short names: Fe = iron plate, Cu = copper plate.

Source: `base/prototypes/recipe.lua` @ 1.1.110 (https://github.com/wube/factorio-data/blob/1.1.110/base/prototypes/recipe.lua), cross-checked with the individual wiki pages listed in §12.

### 2.1 Smelting (furnaces only, never by hand)

| Result | Out | Time (s) | Ingredients | Cat. | Hand | Made in | Unlock (1.1) | 2.0 diff |
|---|---|---|---|---|---|---|---|---|
| Iron plate | 1 | 3.2 | 1 iron ore | smelting | no | stone/steel/electric furnace | start | – |
| Copper plate | 1 | 3.2 | 1 copper ore | smelting | no | furnaces | start | – |
| Stone brick | 1 | 3.2 | 2 stone | smelting | no | furnaces | start | – |
| Steel plate | 1 | 16 | 5 iron plate | smelting | no | furnaces | Steel processing | – |

### 2.2 Intermediate products

| Result | Out | Time (s) | Ingredients | Cat. | Hand | Made in | Unlock (1.1) | 2.0 diff |
|---|---|---|---|---|---|---|---|---|
| Iron gear wheel | 1 | 0.5 | 2 Fe | crafting | yes | player, AM1/2/3 | start | – |
| Copper cable | 2 | 0.5 | 1 Cu | crafting | yes | player, AM1/2/3 | start | locked behind trigger tech "Electronics" |
| Electronic circuit | 1 | 0.5 | 1 Fe + 3 copper cable | crafting | yes | player, AM1/2/3 | start | locked behind "Electronics" |
| Iron stick | 2 | 0.5 | 1 Fe | crafting | yes | player, AM1/2/3 | start | unlocked by Electric energy distribution 1 |
| Pipe | 1 | 0.5 | 1 Fe | crafting | yes | player, AM1/2/3 | start | unlocked by trigger tech "Steam power" |
| Engine unit | 1 | 10 | 1 steel plate + 1 iron gear wheel + 2 pipe | **advanced-crafting** | **no** | AM1/2/3 only | Engine | – |
| Battery (oil chain; needed for accumulator) | 1 | 4 | 20 sulfuric acid (fluid) + 1 Fe + 1 Cu | **chemistry** | **no** | chemical plant | Battery | – |
| Automation science pack | 1 | 5 | 1 Cu + 1 iron gear wheel | crafting | yes | player, AM1/2/3 | start | trigger tech "Automation science pack" (craft 1 lab) |
| Logistic science pack | 1 | 6 | 1 inserter + 1 transport belt | crafting | yes | player, AM1/2/3 | Logistic science pack | – |
| Military science pack | **2** | 10 | 1 piercing rounds magazine + 1 grenade + 2 stone wall | crafting | yes | player, AM1/2/3 | Military science pack | – |

### 2.3 Logistics

| Result | Out | Time (s) | Ingredients | Cat. | Hand | Made in | Unlock (1.1) | 2.0 diff |
|---|---|---|---|---|---|---|---|---|
| Wooden chest | 1 | 0.5 | 2 wood | crafting | yes | player, AM | start | – |
| Iron chest | 1 | 0.5 | 8 Fe | crafting | yes | player, AM | start | – |
| Steel chest | 1 | 0.5 | 8 steel plate | crafting | yes | player, AM | Steel processing | – |
| Transport belt | **2** | 0.5 | 1 Fe + 1 iron gear wheel | crafting | yes | player, AM | start | – |
| Underground belt | **2** | 1 | 10 Fe + 5 transport belt | crafting | yes | player, AM | Logistics | – |
| Splitter | 1 | 1 | 5 electronic circuit + 5 Fe + 4 transport belt | crafting | yes | player, AM | Logistics | – |
| Fast transport belt | 1 | 0.5 | 5 iron gear wheel + 1 transport belt | crafting | yes | player, AM | Logistics 2 | – |
| Fast underground belt | **2** | 2 | 40 iron gear wheel + 2 underground belt | crafting | yes | player, AM | Logistics 2 | – |
| Fast splitter | 1 | 2 | 1 splitter + 10 iron gear wheel + 10 electronic circuit | crafting | yes | player, AM | Logistics 2 | – |
| Burner inserter | 1 | 0.5 | 1 Fe + 1 iron gear wheel | crafting | yes | player, AM | start | – |
| Inserter | 1 | 0.5 | 1 electronic circuit + 1 iron gear wheel + 1 Fe | crafting | yes | player, AM | start | locked behind "Electronics" |
| Long-handed inserter | 1 | 0.5 | 1 iron gear wheel + 1 Fe + 1 inserter | crafting | yes | player, AM | Automation | – |
| Fast inserter | 1 | 0.5 | 2 electronic circuit + 2 Fe + 1 inserter | crafting | yes | player, AM | Fast inserter | – |
| Filter inserter | 1 | 0.5 | 1 fast inserter + 4 electronic circuit | crafting | yes | player, AM | Fast inserter | **removed in 2.0.7** (every inserter has a filter) |
| Pipe to ground | **2** | 0.5 | 10 pipe + 5 Fe | crafting | yes | player, AM | start | "Steam power" trigger tech |
| Small electric pole | **2** | 0.5 | 1 wood + 2 copper cable | crafting | yes | player, AM | start | "Electronics" trigger tech |
| Medium electric pole | 1 | 0.5 | 4 iron stick + 2 steel plate + **2 Cu** | crafting | yes | player, AM | Electric energy distribution 1 | 2.0: 4 iron stick + 2 steel + **2 copper cable** |
| Big electric pole | 1 | 0.5 | 8 iron stick + 5 steel plate + **5 Cu** | crafting | yes | player, AM | Electric energy distribution 1 | 2.0: 8 iron stick + 5 steel + **4 copper cable** |
| Small lamp | 1 | 0.5 | 1 electronic circuit + 3 copper cable + 1 Fe | crafting | yes | player, AM | Optics | tech renamed "Lamp" |
| Landfill | 1 | 0.5 | **20 stone** | crafting | yes | player, AM | Landfill | 2.0: **50 stone** |
| Rail (straight) | 2 | 0.5 | 1 stone + 1 iron stick + 1 steel plate | crafting | yes | player, AM | Railway | – |

### 2.4 Production / power

| Result | Out | Time (s) | Ingredients | Cat. | Hand | Made in | Unlock (1.1) | 2.0 diff |
|---|---|---|---|---|---|---|---|---|
| Stone furnace | 1 | 0.5 | 5 stone | crafting | yes | player, AM | start | – |
| Steel furnace | 1 | 3 | 6 steel plate + 10 stone brick | crafting | yes | player, AM | Advanced material processing | – |
| Electric furnace (for reference) | 1 | 5 | 10 steel plate + 5 advanced circuit + 10 stone brick | crafting | yes | player, AM | Advanced material processing 2 | – |
| Burner mining drill | 1 | 2 | 3 iron gear wheel + 1 stone furnace + 3 Fe | crafting | yes | player, AM | start | – |
| Electric mining drill | 1 | 2 | 3 electronic circuit + 5 iron gear wheel + 10 Fe | crafting | yes | player, AM | start | 2.0: tech "Electric mining drill" (25 red, 10 s) |
| Assembling machine 1 | 1 | 0.5 | 3 electronic circuit + 5 iron gear wheel + 9 Fe | crafting | yes | player, AM | Automation | – |
| Assembling machine 2 | 1 | 0.5 | 2 steel plate + 3 electronic circuit + 5 iron gear wheel + 1 assembling machine 1 | crafting | yes | player, AM | Automation 2 | – |
| Assembling machine 3 (reference) | 1 | 0.5 | 4 speed module + 2 assembling machine 2 | crafting | yes | player, AM | Automation 3 | – |
| Offshore pump | 1 | 0.5 | **2 electronic circuit + 1 pipe + 1 iron gear wheel** | crafting | yes | player, AM | start | 2.0.7: **3 pipe + 2 iron gear wheel**; "Steam power" trigger tech |
| Boiler | 1 | 0.5 | 1 stone furnace + 4 pipe | crafting | yes | player, AM | start | "Steam power" |
| Steam engine | 1 | 0.5 | 8 iron gear wheel + 5 pipe + 10 Fe | crafting | yes | player, AM | start | "Steam power" |
| Lab | 1 | 2 | 10 electronic circuit + 10 iron gear wheel + 4 transport belt | crafting | yes | player, AM | start | "Electronics" trigger tech |
| Radar | 1 | 0.5 | 5 electronic circuit + 5 iron gear wheel + 10 Fe | crafting | yes | player, AM | start | 2.0: tech "Radar" (20 red, 10 s) |
| Repair pack | 1 | 0.5 | 2 electronic circuit + 2 iron gear wheel | crafting | yes | player, AM | start | 2.0: tech "Repair pack" (25 red, 10 s) |
| Solar panel | 1 | 10 | 5 steel plate + 15 electronic circuit + 5 Cu | crafting | yes | player, AM | Solar energy | – |
| Accumulator | 1 | 10 | 2 Fe + 5 battery | crafting | yes (battery itself is not) | player, AM | Electric energy accumulators | – |
| Car | 1 | 2 | 8 engine unit + 20 Fe + 5 steel plate | crafting | yes | player, AM | Automobilism | – |

### 2.5 Military

| Result | Out | Time (s) | Ingredients | Cat. | Hand | Made in | Unlock (1.1) | 2.0 diff |
|---|---|---|---|---|---|---|---|---|
| Pistol | 1 | 5 | 5 Cu + 5 Fe | crafting | yes | player, AM | start | 2.0.7: recipe **hidden/removed** (player still spawns with one) |
| Submachine gun | 1 | 10 | 10 iron gear wheel + 5 Cu + 10 Fe | crafting | yes | player, AM | Military | – |
| Shotgun | 1 | 10 | 15 Fe + 5 iron gear wheel + 10 Cu + 5 wood | crafting | yes | player, AM | Military | – |
| Firearm magazine | 1 | 1 | 4 Fe | crafting | yes | player, AM | start | – |
| Piercing rounds magazine | **1** | **3** | **1 firearm magazine + 1 steel plate + 5 Cu** | crafting | yes | player, AM | Military 2 | 2.0.46: **2 firearm magazine + 1 steel + 2 Cu → 2 magazines, 6 s** |
| Shotgun shells | 1 | 3 | 2 Cu + 2 Fe | crafting | yes | player, AM | Military | – |
| Grenade | 1 | 8 | 5 Fe + 10 coal | crafting | yes | player, AM | Military 2 | – |
| Gun turret | 1 | 8 | 10 iron gear wheel + 10 Cu + 20 Fe | crafting | yes | player, AM | Gun turret (tech "gun-turret") | – |
| Stone wall | 1 | 0.5 | 5 stone brick | crafting | yes | player, AM | Stone wall | – |
| Gate | 1 | 0.5 | 1 stone wall + 2 steel plate + 2 electronic circuit | crafting | yes | player, AM | Gate | – |
| Light armor | 1 | 3 | 40 Fe | crafting | yes | player, AM | start | – |
| Heavy armor | 1 | 8 | 100 Cu + 50 steel plate | crafting | yes | player, AM | Heavy armor | – |

### 2.6 Non-crafted items (gathered)

| Item | How obtained | Numbers (1.1) | Source |
|---|---|---|---|
| Wood | Mine trees | Live tree: mining_time **0.55 s**, yields **4 wood**, tree health 50. Dead/dry trees: mining_time **0.5 s**, yield **2 wood** (a few dry variants yield 4), health 20. | `entity/trees.lua`; https://wiki.factorio.com/Tree ; https://wiki.factorio.com/Wood |
| Raw fish | Mine a fish (dark spot in water) | `fish` entity: mining_time **0.4 s**, yields **5 raw fish**, health 20. Eating: heals **80 HP** (damage amount −80 physical, use-on-self), cooldown **30 ticks (0.5 s)**. | `entities.lua`, `item.lua`; https://wiki.factorio.com/Raw_fish |
| Iron ore / Copper ore / Stone / Coal | Mine resource patch | mining_time **1 s** each (uranium ore 2 s). | `entity/resources.lua`; https://wiki.factorio.com/Mining |

### 2.7 1.1 "expensive" recipe difficulty (optional, only if the clone wants the toggle)

Source: `recipe.lua` @ 1.1.110, `expensive` blocks. Everything not listed is identical to normal.

| Recipe | Expensive ingredients / time |
|---|---|
| Iron gear wheel | 4 Fe |
| Electronic circuit | 2 Fe + 8 copper cable |
| Pipe | 2 Fe |
| Steel plate | 10 Fe, 32 s |
| Steam engine | 10 gear + 5 pipe + 50 Fe |
| Electric mining drill | 5 circuit + 10 gear + 20 Fe (2 s) |
| Burner mining drill | 6 gear + 2 stone furnace + 6 Fe, 4 s |
| Assembling machine 2 | 5 steel + 5 circuit + 10 gear + 1 AM1 |
| Submachine gun | 15 gear + 20 Cu + 30 Fe |
| Battery | 40 sulfuric acid + 1 Fe + 1 Cu, 5 s |

---

## 3. Raw-material roll-ups (normal difficulty, no productivity)

Derived from §2. "Time" = summed recipe times of the whole chain when hand-crafted (wiki "total raw" figures agree).

| Product | Iron plate | Copper plate | Other | Chain time (s) |
|---|---|---|---|---|
| Iron gear wheel | 2 | – | – | 0.5 |
| Copper cable (×2) | – | 1 | – | 0.5 |
| Electronic circuit | 1 | 1.5 | – | 1.25 |
| Inserter | 4 | 1.5 | – | 2.25 |
| Transport belt (×2) | 3 | – | – | 1.0 |
| Long-handed inserter | 7 | 1.5 | – | 3.25 |
| Fast inserter | 8 | 4.5 | – | 5.25 |
| Splitter | 16 | 7.5 | – | 9.25 |
| Lab | 36 | 15 | – | ~26 |
| Automation science pack | 2 | 1 | – | 5.5 |
| Logistic science pack | 5.5 | 1.5 | – | 8.75 |
| Military science pack (per pack, **1.1**) | 7 | 2.5 | 5 coal, 10 stone | – |
| Military science pack (per pack, **2.0**) | 5.75 | 0.5 | 5 coal, 10 stone | – |
| Engine unit | 4 + 1 steel (=9 Fe) | – | – | 11.5 |
| Repair pack | 6 | 3 | – | 4 |
| Assembling machine 2 | 35 + 2 steel | 9 | – | 13.5 |
| Submachine gun | 30 | 5 | – | 15 |

---

## 4. Item stack sizes

Source: `item.lua` @ 1.1.110 (https://github.com/wube/factorio-data/blob/1.1.110/base/prototypes/item.lua) and https://wiki.factorio.com/Stack

| Stack | Items (1.1) | 2.0 change |
|---|---|---|
| **1** | Light armor, Heavy armor, Car | – |
| **5** | Pistol, Submachine gun, Shotgun | – |
| **10** | Steam engine, Lab, Train stop | – |
| **20** | Offshore pump | – |
| **50** | Iron ore, Copper ore, Stone, Coal, Solid fuel, Wooden chest, Iron chest, Steel chest, Stone furnace, Steel furnace, Electric furnace, Burner mining drill, Electric mining drill, Burner inserter, Inserter, Long-handed inserter, Fast inserter, Filter inserter, Underground belt, Fast underground belt, Splitter, Fast splitter, Boiler, Small/Medium/Big electric pole, Small lamp, Pipe to ground, Assembling machine 1/2/3, Radar, Engine unit, Gun turret, Gate, Solar panel, Accumulator | – |
| **100** | Wood, Raw fish, Iron plate, Copper plate, Steel plate, Iron gear wheel, Iron stick, Stone brick, Pipe, Transport belt, Fast transport belt, Stone wall, Landfill, Rail, Repair pack, Grenade | – |
| **200** | Copper cable, Electronic circuit, Battery, Automation/Logistic/Military science pack, **Firearm magazine, Piercing rounds magazine, Shotgun shells** | 2.0.7: all ammo magazines **200 → 100** |

---

## 5. Fuel values and burner consumption

Source: `item.lua` @ 1.1.110; https://wiki.factorio.com/Fuel ; https://wiki.factorio.com/Coal ; https://wiki.factorio.com/Wood

| Fuel | Fuel value | Vehicle accel. / top speed | Stack | Fuel category |
|---|---|---|---|---|
| Wood | **2 MJ** | 100% / 100% | 100 | chemical |
| Coal | **4 MJ** | 100% / 100% | 50 | chemical |
| Solid fuel | **12 MJ** | 120% / 105% | 50 | chemical |
| Rocket fuel (reference) | 100 MJ | 180% / 115% | 10 (2.0: 20) | chemical |
| Nuclear fuel (reference) | 1.21 GJ | 250% / 115% | 1 | chemical |

**Burner formula** (wiki Fuel page): `burn time (s) = fuel value (J) / device energy consumption (W)`. All base-game burner devices have `effectivity = 1` (1.1), so every joule of fuel is used. Energy is only consumed while the machine is working (furnaces idle when empty; a burner drill idles when its output is blocked). One fuel item is fully consumed before the next is taken; each burner device has a 1-slot fuel inventory (`fuel_inventory_size = 1`).

| Burner device | Consumption | Coal (4 MJ) lasts | Coal per second (working) | Wood (2 MJ) lasts |
|---|---|---|---|---|
| Stone furnace | 90 kW | 44.44 s | 0.0225/s | 22.22 s |
| Steel furnace | 90 kW | 44.44 s | 0.0225/s | 22.22 s |
| Burner mining drill | 150 kW | 26.67 s | 0.0375/s | 13.33 s |
| Boiler | 1.8 MW | 2.22 s | 0.45/s | 1.11 s |
| Burner inserter | 50 kJ per movement + 50 kJ per rotation (1.1); wiki-listed peak 94.2 kW (1.1) / 144 kW (2.0) | ~40 items per coal (1 cycle ≈ 100 kJ) | – | – |
| Car | 150 kW (engine effectivity 0.6) | 26.67 s | 0.0375/s | 13.33 s |

Per-item fuel cost (useful for a sim): stone furnace 90 kW × 3.2 s = **288 kJ per plate/brick** (= 0.072 coal, 0.144 wood); steel plate 90 kW × 16 s = **1.44 MJ** (= 0.36 coal). Steel furnace makes items twice as fast at the same 90 kW → **144 kJ per plate**, 720 kJ per steel. Burner mining drill: 150 kW × 4 s per ore = **600 kJ per ore** (0.15 coal per ore).

---

## 6. Smelting details

Source: furnace prototypes in `entities.lua` @ 1.1.110; https://wiki.factorio.com/Stone_furnace , https://wiki.factorio.com/Steel_furnace , https://wiki.factorio.com/Electric_furnace

| Furnace | Crafting speed | Energy | Footprint | Health | Pollution/min | Module slots | Resistances | Unlock |
|---|---|---|---|---|---|---|---|---|
| Stone furnace | **1** | 90 kW burner | 2×2 | 200 | 2 | 0 | fire 90%, explosion 30%, impact 30% | start |
| Steel furnace | **2** | 90 kW burner | 2×2 | 300 | 4 | 0 | fire 100% | Advanced material processing |
| Electric furnace | **2** | 180 kW electric (drain 6 kW) | 3×3 | 350 | 1 | 2 | fire 80% | Advanced material processing 2 |

All furnaces: 1 input slot, 1 output slot (`source_inventory_size = 1`, `result_inventory_size = 1`), 1 fuel slot for burner types. A furnace auto-selects the recipe from the inserted item (ore → plate, stone → brick, iron plate → steel).

| Smelting recipe | Time (s) | Stone furnace (speed 1) | Steel/Electric (speed 2) | Items/s per furnace (speed 1 / 2) |
|---|---|---|---|---|
| 1 iron ore → 1 iron plate | 3.2 | 3.2 s | 1.6 s | 0.3125 / 0.625 |
| 1 copper ore → 1 copper plate | 3.2 | 3.2 s | 1.6 s | 0.3125 / 0.625 |
| 2 stone → 1 stone brick | 3.2 | 3.2 s | 1.6 s | 0.3125 / 0.625 (consumes 0.625 / 1.25 stone/s) |
| 5 iron plate → 1 steel plate | 16 | 16 s | 8 s | 0.0625 / 0.125 (consumes 0.3125 / 0.625 iron/s) |

Ratios: a full yellow belt (15 ore/s) feeds **48 stone furnaces** or **24 steel/electric furnaces**; one electric mining drill (0.5 ore/s) feeds 1.6 stone furnaces; one burner drill (0.25/s) feeds 0.8 stone furnace. Steel: 1 steel furnace making steel consumes exactly the output of 1 steel furnace making iron plates (0.625 Fe/s).

---

## 7. Entity stats — logistics

### 7.1 Belts (1.1; identical in 2.0)

Source: `entities.lua` @ 1.1.110; https://wiki.factorio.com/Transport_belt , https://wiki.factorio.com/Underground_belt , https://wiki.factorio.com/Splitter , https://wiki.factorio.com/Belt_transport_system

| Entity | speed (tiles/tick) | tiles/s | Items/s (both lanes) | Items/s per lane | Health | Footprint | Mining time | Extra |
|---|---|---|---|---|---|---|---|---|
| Transport belt | 0.03125 | 1.875 | **15** | 7.5 | 150 | 1×1 | 0.1 s | 2 lanes, max 8 items per tile (4 per lane); fire resist 90% |
| Underground belt | 0.03125 | 1.875 | 15 | 7.5 | 150 | 1×1 each end | 0.1 s | `max_distance = 5` → max **4 tiles gap** between the two ends (pair spans 6 tiles); a 4-gap pair holds up to 44 items |
| Splitter | 0.03125 | 1.875 | 15 | 7.5 | 170 | 1×2 | 0.1 s | 1:1 split, keeps lanes; supports filter + input/output priority |
| Fast transport belt | 0.0625 | 3.75 | **30** | 15 | 160 | 1×1 | 0.1 s | |
| Fast underground belt | 0.0625 | 3.75 | 30 | 15 | 160 | 1×1 | 0.1 s | `max_distance = 7` → **6 tiles gap** |
| Fast splitter | 0.0625 | 3.75 | 30 | 15 | 180 | 1×2 | 0.1 s | |
| Express (reference) | 0.09375 | 5.625 | 45 | 22.5 | – | – | – | underground gap 8 |

Throughput derivation: items/s = tiles/s × 8 items/tile (1.875 × 8 = 15).

### 7.2 Inserters

Source: inserter prototypes in `entities.lua` @ 1.1.110 and master; https://wiki.factorio.com/Inserters ; 1.1 peak-power figures from the wiki history/forum (Burner inserter page history "Energy consumption increased from 94.2 kW to 144 kW" in 2.0.7; Inserter page "Max energy consumption increased from 13.6 kW to 15.1 kW"; forum thread https://forums.factorio.com/viewtopic.php?t=49697).

Mechanics: an inserter picks up at `pickup_position` and drops at `insert_position` (1 tile away on opposite sides; long-handed 2 tiles). One transfer = half a turn (0.5 revolution) to the drop side, then half a turn back. `rotation_speed` is in revolutions per tick, `extension_speed` in tiles per tick. Ticks per half turn = ceil(0.5 / rotation_speed). Chest-to-chest throughput (hand size 1) = 60 / (2 × half-turn ticks). Energy: `energy_per_movement` is charged per extension move and `energy_per_rotation` per rotation; electric inserters additionally have a constant `drain`. Hand size is 1 item for all of these until the Inserter capacity bonus researches (+1 for non-stack inserters at levels 2 and 7).

| Inserter | Reach (pickup / drop) | rotation_speed (rev/tick) | °/s | extension_speed (tiles/tick) | Half-turn ticks | Items/s (chest→chest) | energy per movement / per rotation | Drain | Wiki peak power (1.1) | Health | Stack |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Burner inserter (1.1) | 1 / 1 tile | 0.01 | 216 | 0.0214 | 50 | **0.60** | 50 kJ / 50 kJ (burner fuel) | – | 94.2 kW | 100 | 50 |
| Inserter (1.1) | 1 / 1 | 0.014 | 302.4 | 0.03 | 36 | **0.83** | 5 kJ / 5 kJ | 0.4 kW | 13.2 kW (wiki says 13.6 in history) | 150 | 50 |
| Long-handed inserter (1.1) | **2 / 2** | 0.02 | 432 | 0.0457 | 25 | **1.20** | 5 kJ / 5 kJ | 0.4 kW | 18.4 kW | 160 | 50 |
| Fast inserter (1.1) | 1 / 1 | 0.04 | 864 | 0.07 | 13 | **2.31** | 7 kJ / 7 kJ | 0.5 kW | 46.7 kW | 150 | 50 |
| Filter inserter (1.1) | 1 / 1 | 0.04 | 864 | 0.07 | 13 | **2.31** | 8 kJ / 8 kJ | 0.5 kW | 52 kW | 150 | 50 (5 filter slots, whitelist/blacklist) |

2.0 changes (prototype master): burner inserter rotation 0.013 / extension 0.035 (wiki: 281°/s, 144 kW, ≈0.79 items/s); inserter extension 0.035 (15.1 kW, ≈0.86/s); long-handed extension 0.05 (21.4 kW, 1.25/s); fast inserter extension 0.1 (59.3 kW, 2.5/s); filter inserter removed (every inserter gets a filter). All inserters 1×1, mining time 0.1 s, fire resistance 90%. Burner inserter refuels itself from the items it moves and starts with enough energy to move 1 item.

### 7.3 Chests, poles, pipes, lamp

Source: `entities.lua` @ 1.1.110; wiki pages for each item.

| Entity | Footprint | Health | Key numbers | Resistances |
|---|---|---|---|---|
| Wooden chest | 1×1 | 100 | **16 slots**; mining time 0.1 s | – |
| Iron chest | 1×1 | 200 | **32 slots**; mining time 0.2 s | fire 80%, impact 30% |
| Steel chest | 1×1 | 350 | **48 slots**; mining time 0.2 s | fire 90%, impact 60% |
| Small electric pole | 1×1 | 100 | wire reach **7.5** tiles; `supply_area_distance` 2.5 → **5×5** supply area | – |
| Medium electric pole | 1×1 | 100 | wire reach **9**; supply 3.5 → **7×7** | fire 100% |
| Big electric pole | 2×2 | 150 | wire reach **30** (2.0: **32**); supply 2 → **4×4** | fire 100% |
| Pipe | 1×1 | 100 | fluid volume **100** units per pipe; mining time 0.1 s | fire 80%, impact 30% |
| Pipe to ground | 1×1 each end | 150 | `max_underground_distance = 10` → ends up to 10 tiles apart (9-tile gap); the pair stores only 2×100 units | fire 80%, impact 40% |
| Small lamp | 1×1 | 100 | **5 kW** electric; lights ~10-tile radius at night | – |
| Landfill | 1 tile | – | converts 1 water tile to land | – |

---

## 8. Entity stats — production & power

Source: `entities.lua`, `mining-drill.lua`, `fluid.lua` @ 1.1.110; wiki pages Burner_mining_drill, Electric_mining_drill, Assembling_machine_1/2/3, Lab, Offshore_pump, Boiler, Steam_engine, Solar_panel, Accumulator, Radar.

| Entity | Footprint | Health | Energy | Speed / output | Area / other | Pollution/min | Modules |
|---|---|---|---|---|---|---|---|
| Burner mining drill | 2×2 | 150 | 150 kW burner | mining_speed **0.25** → 0.25 ore/s on 1-s ores | `resource_searching_radius` 0.99 → mines the **2×2** under it; outputs to the tile in front | 12 | 0 |
| Electric mining drill | 3×3 | 300 | 90 kW electric (drain 3 kW) | mining_speed **0.5** → 0.5 ore/s (uranium 0.25/s, needs sulfuric acid) | radius 2.49 → **5×5** area; output 1 tile in front (`vector_to_place_result {0,-1.85}`); pickup mining time 0.3 s | 10 | 3 |
| Assembling machine 1 | 3×3 | 300 | 75 kW (drain 2.5 kW) | crafting speed **0.5** (a 0.5 s recipe takes 1 s) | no fluids; categories crafting/basic/advanced | 4 | 0 |
| Assembling machine 2 | 3×3 | 350 | 150 kW (drain 5 kW) | crafting speed **0.75** | fluids OK | 3 | 2 |
| Assembling machine 3 | 3×3 | 400 | 375 kW (drain 12.5 kW) | crafting speed **1.25** | fluids OK | 2 | 4 |
| Lab | 3×3 | 150 | 60 kW (drain 2 kW) | `researching_speed` **1** | consumes 1 of each required pack per "unit"; research duration with 1 lab = unit count × unit time / lab speed | 0 | 2 |
| Offshore pump | 1×2 (1.1; sits on shore) | 150 | none (1.1). 2.0 prototype lists 60 kW with a `void` energy source = still free | `pumping_speed` 20/tick = **1200 water/s** | mining time 0.1 s | 0 | – |
| Boiler | 3×2 | 200 | **1.8 MW** burner | heats water 15 °C → **165 °C** steam. 1.1: water and steam both `heat_capacity` 0.2 kJ/unit/°C → 1.8 MW / (150 °C × 0.2 kJ) = **60 water/s → 60 steam/s**. 2.0: water heat capacity 2 kJ → **6 water/s → 60 steam/s** (1 water = 10 steam) | 2 water in/out connections on the short sides, steam out on top; resist fire 90%, explosion 30%, impact 30% | 30 | – |
| Steam engine | 3×5 | 400 | produces up to **900 kW** | `fluid_usage_per_tick` 0.5 → **30 steam/s**; `maximum_temperature` 165 °C (hotter steam gives no extra power) | 900 kW = 30/s × 150 °C × 0.2 kJ; connections at both short ends; resist fire 70%, impact 30% | 0 | – |
| Solar panel | 3×3 | 200 | produces **60 kW** peak daylight; ≈42 kW average over a Nauvis day (wiki) | – | wiki ratio ≈ 25 panels : 21 accumulators for 24-h supply | 0 | – |
| Accumulator | 2×2 | 150 | capacity **5 MJ**; charge and discharge limit **300 kW** each | full charge/discharge ≈ 16.7 s | `charge_cooldown` 30 ticks, `discharge_cooldown` 60 ticks | 0 | – |
| Radar | 3×3 | 250 | **300 kW** | continuously reveals `max_distance_of_nearby_sector_revealed` 3 chunks → **7×7 chunks**; scans 1 distant chunk per 33.33 s at full power within radius 14 → **29×29 chunks** | rotation 0.01 rev/tick | 0 | – |

Steam power ratio (1.1): 1 offshore pump (1200/s) : **20 boilers** (60 water/s each) : **40 steam engines** (2 per boiler, 30 steam/s each) = 36 MW. (2.0: 1 pump : 200 boilers : 400 engines because of the 1:10 water→steam change.)

---

## 9. Entity stats — military

Source: `item.lua`, `turrets.lua`, `projectiles.lua`, `entities.lua` @ 1.1.110; wiki pages Firearm_magazine, Piercing_rounds_magazine, Pistol, Submachine_gun, Shotgun, Shotgun_shells, Gun_turret, Grenade, Stone_wall, Gate, Repair_pack, Light_armor, Heavy_armor, Car.

### 9.1 Ammo

| Ammo | Rounds per magazine | Damage per shot (1.1) | Type | Stack (1.1 / 2.0) | Used by |
|---|---|---|---|---|---|
| Firearm magazine | 10 | **5** physical | bullet | 200 / 100 | pistol, SMG, gun turret, car |
| Piercing rounds magazine | 10 | **8** physical (wiki 2.0 lists 8) | bullet | 200 / 100 | pistol, SMG, gun turret, car |
| Shotgun shells | 10 | **12 pellets × 5** physical (= 60 per shot; 2.0 wiki: 12 × 8 = 96) | shotgun-shell | 200 / 100 | shotgun |

Damage/speed research: "Physical projectile damage 1" (+10% bullet & shotgun damage and +10% gun-turret damage, multiplicative with ammo), "Weapon shooting speed 1" (+10% rate of fire); stronger explosives 1 gives +25% grenade damage.

### 9.2 Guns and turret

| Weapon | attack cooldown (ticks) | Rate of fire | Range (tiles) | Other |
|---|---|---|---|---|
| Pistol | 15 | **4 shots/s** | **15** | stack 5; direction deviation 0.1; ammo: bullet |
| Submachine gun | 6 | **10 shots/s** | **18** | stack 5; ammo: bullet |
| Shotgun | 60 | **1 shot/s** (2.0 wiki: 1.5/s) | 15 (min range 1) | stack 5; 12 pellets per shell |
| Gun turret (entity) | 6 | **10 shots/s** | **18** | 2×2, health **400**, rotation 0.015 rev/tick (324°/s), preparing/folding 0.08 (12.5 ticks), 1 ammo slot, `automated_ammo_count` 10 (inserters top it up to 10 magazines), no power needed, call-for-help radius 40, mining time 0.5 s, stack 50 |
| Car vehicle gun | – | 15 shots/s (wiki) | 20 | car: health 450, 150 kW burner, weight 700, inventory 80, braking 200 kW, friction 0.002, resist fire 50%, impact 50/30%, acid 20% |

### 9.3 Grenade, walls, repair, armor, fish

| Item | Numbers (1.1) |
|---|---|
| Grenade | throw cooldown 30 ticks (**2/s**), throw range **15**, projectile: area radius **6.5** tiles, **35 explosion** damage to everything in the area; stack 100 |
| Stone wall | 1×1, health **350**, mining time 0.2 s, `repair_speed_modifier` 2; resistances physical 3/20%, impact 45/60%, explosion 10/30%, fire 0/100%, acid 0/80%, laser 0/70%. Blocks melee only; big/behemoth biters can hit over one layer (wiki). |
| Gate | 1×1, health 350, same resistances as wall, `opening_speed` 0.0667/tick (≈15 ticks to open); opens for player/vehicles, not enemies |
| Repair pack | `speed` 2, `durability` **300** → repairs **600 HP** per pack (2 HP per durability point); stack 100 |
| Light armor | resistances physical 3/20%, acid 0/20%, explosion 2/20%, fire 0/10%; infinite durability; stack 1 |
| Heavy armor | physical 6/30%, explosion 20/30%, acid 0/40%, fire 0/30%; infinite; stack 1 |
| Raw fish | heals 80 HP, 0.5 s cooldown, stack 100 |

Resistance notation `decrease/percent`: damage taken = max(0, damage − decrease) × (1 − percent).

---

## 10. Technologies that gate the items above (1.1.110 costs)

Source: `technology.lua` @ 1.1.110 (https://github.com/wube/factorio-data/blob/1.1.110/base/prototypes/technology.lua). A = automation (red) pack, L = logistic (green) pack. Research time with N labs = count × time / (N × lab speed).

| Technology (internal name) | Cost (packs × unit) | Unit time (s) | Prerequisites | Unlocks |
|---|---|---|---|---|
| automation | 10 × A | 10 | – | Assembling machine 1, Long-handed inserter |
| logistics | 20 × A | 15 | – | Underground belt, Splitter |
| electronics | 30 × A | 15 | automation | (nothing in 1.1; prerequisite tech) |
| optics | 10 × A | 15 | – | Small lamp |
| steel-processing | 50 × A | 5 | – | Steel plate, Steel chest |
| logistic-science-pack | 75 × A | 5 | – | Logistic science pack |
| military | 10 × A | 15 | – | Submachine gun, Shotgun, Shotgun shells |
| gun-turret | 10 × A | 10 | – | Gun turret |
| stone-wall | 10 × A | 10 | – | Stone wall |
| fast-inserter | 30 × A | 15 | electronics | Fast inserter, Filter inserter |
| heavy-armor | 30 × A | 30 | military, steel-processing | Heavy armor |
| steel-axe | 50 × A | 30 | steel-processing | +100% player mining speed |
| physical-projectile-damage-1 | 100 × A | 30 | military | +10% bullet/shotgun damage, +10% gun turret |
| weapon-shooting-speed-1 | 100 × A | 30 | military | +10% bullet/shotgun fire rate |
| military-2 | 20 × (A+L) | 15 | military, steel-processing, logistic-science-pack | Piercing rounds magazine, Grenade |
| military-science-pack | 30 × (A+L) | 15 | military-2, stone-wall | Military science pack |
| automation-2 | 40 × (A+L) | 15 | electronics, steel-processing, logistic-science-pack | Assembling machine 2 |
| advanced-material-processing | 75 × (A+L) | 30 | steel-processing, logistic-science-pack | Steel furnace |
| engine | 100 × (A+L) | 15 | steel-processing, logistic-science-pack | Engine unit |
| electric-energy-distribution-1 | 120 × (A+L) | 30 | electronics, steel-processing, logistic-science-pack | Medium electric pole, Big electric pole |
| solar-energy | 250 × (A+L) | 30 | optics, electronics, steel-processing, logistic-science-pack | Solar panel |
| electric-energy-accumulators | 150 × (A+L) | 30 | electric-energy-distribution-1, battery | Accumulator |
| logistics-2 | 200 × (A+L) | 30 | logistics, logistic-science-pack | Fast belt, Fast underground belt, Fast splitter |
| automobilism | 100 × (A+L) | 30 | logistics-2, engine | Car |
| landfill | 50 × (A+L) | 30 | logistic-science-pack | Landfill |
| toolbelt | 100 × (A+L) | 30 | logistic-science-pack | +10 inventory slots |
| research-speed-1 | 100 × (A+L) | 30 | automation-2 | +20% lab speed |
| stronger-explosives-1 | 100 × (A+L) | 30 | military-2 | +25% grenade damage |
| circuit-network | 100 × (A+L) | 15 | electronics, logistic-science-pack | wires, combinators, power switch, speaker |

Available from the start in 1.1 (no research): iron/copper plate, stone brick, gear, cable, circuit, iron stick, pipe, pipe-to-ground, transport belt, burner inserter, inserter, wooden/iron chest, stone furnace, burner & electric mining drill, offshore pump, boiler, steam engine, small electric pole, lab, radar, repair pack, automation science pack, firearm magazine, pistol, light armor.

### 10.1 2.0 differences in the tech tree (for reference)

Source: `technology.lua` @ master; https://wiki.factorio.com/Steam_power_(research) , https://wiki.factorio.com/Electronics_(research) , https://wiki.factorio.com/Automation_science_pack_(research)

| 2.0 trigger technology | Trigger | Unlocks |
|---|---|---|
| steam-power | craft **50 iron plate** | pipe, pipe-to-ground, offshore pump, boiler, steam engine |
| electronics | craft **10 copper plate** | copper cable, electronic circuit, lab, inserter, small electric pole |
| automation-science-pack (prereq: steam-power, electronics) | craft **1 lab** | automation science pack; it is the prerequisite of every early pack-based tech |
| steel-axe (prereq steel-processing) | craft 50 steel plate | +100% mining speed |

Other 2.0 tech changes: radar (20 × A, 10 s), repair-pack (25 × A, 10 s), electric-mining-drill (25 × A, 10 s), lamp (renamed from optics; 10 × A, 15 s), iron stick moved under electric-energy-distribution-1, fast-inserter/automation-2 prerequisites changed (electronics no longer a pack tech). Pack costs of automation, logistics, steel-processing, military, military-2, gun-turret, stone-wall, logistic-science-pack, military-science-pack, engine, EED1, solar-energy, accumulators, advanced-material-processing, automation-2, logistics-2, heavy-armor, automobilism, landfill are unchanged from 1.1.

---

## 11. Consolidated 1.1 → 2.0 differences (items in scope)

| Item / mechanic | 1.1.110 | 2.0 |
|---|---|---|
| Pistol recipe | 5 Cu + 5 Fe, 5 s | recipe hidden (2.0.7); still spawn item |
| Offshore pump recipe | 2 circuit + 1 gear + 1 pipe | 3 pipe + 2 gear (2.0.7) |
| Piercing rounds magazine | 1 firearm mag + 1 steel + 5 Cu → 1, 3 s | 2 firearm mag + 1 steel + 2 Cu → 2, 6 s (2.0.46) |
| Medium / Big electric pole | 2 Cu / 5 Cu | 2 copper cable / 4 copper cable |
| Landfill | 20 stone | 50 stone |
| Filter inserter | exists (4 circuit + fast inserter) | removed; all inserters have filters |
| Ammo stack size | 200 | 100 |
| Inserter speeds/power | see §7.2 (0.6 / 0.83 / 1.2 / 2.31 items/s; 94.2 / 13.2 / 18.4 / 46.7 / 52 kW) | burner 0.013 rev/tick & 0.035 ext (144 kW), inserter ext 0.035 (15.1 kW), long ext 0.05 (21.4 kW), fast ext 0.1 (59.3 kW) |
| Big pole wire reach | 30 | 32 |
| Boiler water:steam | 60 water/s → 60 steam/s (heat cap 0.2 kJ both) | 6 water/s → 60 steam/s (water heat cap 2 kJ) |
| Shotgun rate of fire | 1 shot/s (cooldown 60) | 1.5 shots/s (wiki) |
| Shotgun pellet damage | 5 × 12 | 8 × 12 (wiki) |
| Early tech tree | pack-based from the start | three trigger techs (§10.1); radar/repair pack/electric drill/lamp need research |
| Expensive recipe difficulty | exists | removed |
| Quality tiers | none | exist (the wiki lists uncommon…legendary values; **use the "normal" column**) |

---

## 12. Source URLs

Prototype data (primary, exact numbers):
- https://github.com/wube/factorio-data/tree/1.1.110/base/prototypes (recipe.lua, item.lua, technology.lua, fluid.lua, entity/entities.lua, entity/mining-drill.lua, entity/turrets.lua, entity/trees.lua, entity/resources.lua, entity/projectiles.lua)
- https://github.com/wube/factorio-data/tree/master/base/prototypes (2.0 cross-check: recipe.lua, item.lua, technology.lua, fluid.lua, entity/entities.lua, entity/mining-drill.lua)
- https://lua-api.factorio.com/latest/classes/LuaForce.html (manual_crafting_speed_modifier / manual_mining_speed_modifier)

Official wiki (documents 2.0; history sections used for 1.1 values):
- https://wiki.factorio.com/Crafting , https://wiki.factorio.com/Mining , https://wiki.factorio.com/Fuel , https://wiki.factorio.com/Stack , https://wiki.factorio.com/Player , https://wiki.factorio.com/Belt_transport_system , https://wiki.factorio.com/Inserters
- https://wiki.factorio.com/Iron_plate , https://wiki.factorio.com/Copper_plate , https://wiki.factorio.com/Stone_brick , https://wiki.factorio.com/Steel_plate , https://wiki.factorio.com/Iron_gear_wheel , https://wiki.factorio.com/Copper_cable , https://wiki.factorio.com/Electronic_circuit , https://wiki.factorio.com/Pipe , https://wiki.factorio.com/Iron_stick , https://wiki.factorio.com/Engine_unit , https://wiki.factorio.com/Battery
- https://wiki.factorio.com/Transport_belt , https://wiki.factorio.com/Underground_belt , https://wiki.factorio.com/Splitter , https://wiki.factorio.com/Fast_transport_belt , https://wiki.factorio.com/Fast_underground_belt , https://wiki.factorio.com/Fast_splitter
- https://wiki.factorio.com/Burner_inserter , https://wiki.factorio.com/Inserter , https://wiki.factorio.com/Long-handed_inserter , https://wiki.factorio.com/Fast_inserter , https://wiki.factorio.com/Filter_inserter
- https://wiki.factorio.com/Burner_mining_drill , https://wiki.factorio.com/Electric_mining_drill , https://wiki.factorio.com/Stone_furnace , https://wiki.factorio.com/Steel_furnace , https://wiki.factorio.com/Electric_furnace , https://wiki.factorio.com/Assembling_machine_1 , https://wiki.factorio.com/Assembling_machine_2 , https://wiki.factorio.com/Assembling_machine_3
- https://wiki.factorio.com/Wooden_chest , https://wiki.factorio.com/Iron_chest , https://wiki.factorio.com/Steel_chest , https://wiki.factorio.com/Offshore_pump , https://wiki.factorio.com/Boiler , https://wiki.factorio.com/Steam_engine , https://wiki.factorio.com/Small_electric_pole , https://wiki.factorio.com/Medium_electric_pole , https://wiki.factorio.com/Big_electric_pole , https://wiki.factorio.com/Pipe_to_ground , https://wiki.factorio.com/Lamp , https://wiki.factorio.com/Landfill
- https://wiki.factorio.com/Lab , https://wiki.factorio.com/Automation_science_pack , https://wiki.factorio.com/Logistic_science_pack , https://wiki.factorio.com/Military_science_pack , https://wiki.factorio.com/Radar , https://wiki.factorio.com/Repair_pack , https://wiki.factorio.com/Solar_panel , https://wiki.factorio.com/Accumulator
- https://wiki.factorio.com/Firearm_magazine , https://wiki.factorio.com/Piercing_rounds_magazine , https://wiki.factorio.com/Pistol , https://wiki.factorio.com/Submachine_gun , https://wiki.factorio.com/Shotgun , https://wiki.factorio.com/Shotgun_shells , https://wiki.factorio.com/Gun_turret , https://wiki.factorio.com/Stone_wall , https://wiki.factorio.com/Gate , https://wiki.factorio.com/Grenade , https://wiki.factorio.com/Light_armor , https://wiki.factorio.com/Heavy_armor , https://wiki.factorio.com/Car
- https://wiki.factorio.com/Wood , https://wiki.factorio.com/Tree , https://wiki.factorio.com/Raw_fish , https://wiki.factorio.com/Coal , https://wiki.factorio.com/Iron_ore , https://wiki.factorio.com/Copper_ore , https://wiki.factorio.com/Stone
- https://wiki.factorio.com/Steam_power_(research) , https://wiki.factorio.com/Electronics_(research) , https://wiki.factorio.com/Automation_science_pack_(research)

Community (1.1 inserter power figures): https://forums.factorio.com/viewtopic.php?t=49697 , https://forums.factorio.com/viewtopic.php?t=88432
