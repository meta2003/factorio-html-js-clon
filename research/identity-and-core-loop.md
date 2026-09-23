# Research: identity-and-core-loop

Facet: game identity ("Factio" vs Factorio), the first ~10 hours of the core loop, progression, win condition, early-game ratios, and the tick/time model.
Target versions: Factorio 1.1 (base game) and 2.0 (base game without Space Age) — differences are flagged where they matter.
Compiled 2026-09-22 from the official wiki (primary) plus forums/guides (complement). Values are the wiki's "normal quality" values unless stated.

Confidence legend used below: **[wiki]** = read directly from wiki.factorio.com this session; **[community]** = from a forum/guide; **[unverified]** = well-known value that could not be fetched this session (a fetch 404'd) — verify before hard-coding.

---

## 1. Is there a game literally called "Factio"?

Searches performed: `"Factio" game`, `"Factio" igra`.

| Query | What came back |
|---|---|
| `"Factio" game` | Every result resolves to **Factorio** (Steam, GOG, Nintendo, Wikipedia, Metacritic, factorio.com). No product named "Factio". |
| `"Factio" igra` | Factorio again, plus unrelated noise: "IGRA" crypto token, "Faction War", the visual novel *Togainu no Chi* (whose in-story game is "Igura"). Nothing named "Factio". |

**Conclusion:** No known game is literally named "Factio". Nothing contradicts the working assumption that the user (writing in Slovene: "igra" = game) means **Factorio**. "Factio" is almost certainly a typo/shortening of Factorio.

Sources: https://store.steampowered.com/app/427520/Factorio/ , https://en.wikipedia.org/wiki/Factorio , https://www.factorio.com/

### 1.1 Factorio identity card

| Fact | Value |
|---|---|
| Developer / publisher | Wube Software (Czech Republic) |
| Early access | 25 Feb 2016 |
| 1.0 release (Win/macOS/Linux) | 14 Aug 2020 |
| Nintendo Switch | 28 Oct 2022 (Switch 2 edition 22 Dec 2025) |
| 2.0 update + Space Age expansion | 21 Oct 2024 (2.0 is a free update; Space Age is paid DLC adding 4 planets: Vulcanus, Fulgora, Gleba, Aquilo) |
| Sales | > 3.5 million copies; Space Age > 400k in first week |
| Reception | Metacritic 90/100 (PC); ~98% positive of ~118k Steam reviews; "Indie Game of the Year 2020" |
| Genre | 2D top-down factory-building / automation / light tower-defense on an infinite procedurally generated world |
| Premise | An engineer crash-lands on the alien planet **Nauvis**, must mine, research and automate until they can build and launch a rocket |
| Modes | Freeplay (main, sandbox with rocket goal), Tutorial/campaign, multiplayer co-op/PvP, "peaceful mode" (enemies never attack), extensive mod support |
| Unofficial motto | "The factory must grow." |

Sources: https://en.wikipedia.org/wiki/Factorio , https://store.steampowered.com/app/427520/Factorio/ , https://www.factorio.com/

---

## 2. Time model: ticks and UPS  [wiki]

Source: https://wiki.factorio.com/Time

| Quantity | Value |
|---|---|
| Base unit of time | the **tick** |
| Ticks per real second at normal speed | **60** (this is the "UPS", updates per second) |
| One in-game second | **60 ticks** (always, even if the simulation lags below 60 UPS; then game seconds are longer than real seconds) |
| Duration of one tick | 1/60 s ≈ 16.667 ms |
| Nauvis day length | **25,200 ticks = 420 s = 7 min** |
| ├ daytime (full light) | 12,600 ticks = 210 s |
| ├ dusk (light decreases linearly) | 5,040 ticks = 84 s |
| ├ night (fully dark) | 2,520 ticks = 42 s |
| └ dawn (light increases linearly) | 5,040 ticks = 84 s |

How everything else hangs off ticks:

| Mechanic | Formula |
|---|---|
| Crafting time | recipe time is given at crafting speed 1.0; actual time = `recipe_time / crafting_speed`. Example: a 10 s recipe takes 20 s in an Assembling machine 1 (speed 0.5). The player hand-crafts at speed 1.0 (1:1 with the recipe time). |
| Mining rate | `mining_speed / mining_time` = items per second. Hand mining: `(1 + mining_speed_modifier) × 0.5 / mining_time`. |
| Research time | `T = (T0 × P) / (L × S)` where T0 = seconds per unit, P = number of units, L = number of labs, S = lab speed = `(1 + research_speed_bonus) × (1 + module_bonus)` (multiplicative). |
| Fuel burn time | `burn_time_s = fuel_value_MJ / power_MW`. Coal (4 MJ) in a 90 kW stone furnace lasts 44.4 s; in a 1.8 MW boiler 2.22 s. |
| Belt movement | belt speed in tiles/s; yellow belt = 1.875 tiles/s = 0.03125 tiles/tick. |
| Inserter rotation | given in turns/tick (e.g. basic inserter 0.014 turns/tick ≈ 302°/s). |
| Pollution absorption by spawners | evaluated every 64 ticks. |

Sources: https://wiki.factorio.com/Time , https://wiki.factorio.com/Crafting , https://wiki.factorio.com/Mining , https://wiki.factorio.com/Research , https://wiki.factorio.com/Fuel

---

## 3. The player character  [wiki]

Source: https://wiki.factorio.com/Player , https://wiki.factorio.com/Crafting , https://wiki.factorio.com/Mining , https://wiki.factorio.com/Pistol

| Stat | Value |
|---|---|
| Health | **250 HP**; regenerates 6 HP/s starting a few seconds after last damage |
| Running speed | **8.9 tiles/s** (≈ 32 km/h; stone path +30%) |
| Footprint | 1×1 |
| Mining speed | **0.5** → hand-mines 1 ore every 2 s (ore mining time = 1 s); Steel axe tech doubles it to 1.0 |
| Hand-crafting speed | 1.0 (recipe time = real time); crafting queue in bottom-left; left-click 1, right-click 5, shift-click max; missing intermediates are auto-chain-crafted (orange text) |
| Cannot hand-craft | smelting recipes (furnace only), any recipe with fluids, engine units |
| Inventory | **80 slots** (+10 with Toolbelt research; armor adds more: 90/100/110 with modular/power/power mk2) |
| Build / reach distance | **10 tiles** (raised from 6 in 0.17) |
| Map reveal around character | 5×5 chunks (chunk = 32×32 tiles) |
| Respawn time | 10 s |
| Starting weapon | Pistol: 4 shots/s, range 15, uses firearm/piercing/uranium magazines; not craftable in 2.0 |

### 3.1 Freeplay starting inventory

| Item | Count | Source / confidence |
|---|---|---|
| Iron plate | 8 | [wiki] Iron_plate page + [community] forum quoting freeplay control.lua |
| Pistol | 1 | [wiki] Pistol page |
| Firearm magazine | 10 | [wiki] Pistol page |
| Burner mining drill | 1 | [wiki] Iron_plate page |
| Stone furnace | 1 | [wiki] Iron_plate page |
| Wood | 1 | [unverified] The Wood page says "starter wood granted at game beginning" exists; the freeplay.lua `created_items` table is widely quoted with `["wood"] = 1` (enough for 2 small electric poles). GitHub fetch 404'd this session. |
| On respawn | 1 pistol + 10 firearm magazines | [unverified] (`respawn_items` in freeplay.lua) |
| Crash-site wreckage | The 8 iron plates are narratively "recovered" from the wreck; ship parts contain "a little bit of resources"; mining the wreck itself takes long and yields nothing. | [official blog FFF-359] |

Sources: https://wiki.factorio.com/Iron_plate , https://wiki.factorio.com/Pistol , https://wiki.factorio.com/Wood , https://factorio.com/blog/post/fff-359 , https://forums.factorio.com/viewtopic.php?t=53782

---

## 4. Map start guarantees  [wiki]

Source: https://wiki.factorio.com/Map_generator , https://wiki.factorio.com/Enemies

| Guarantee / default | Value |
|---|---|
| Starting area always contains | ≥1 patch each of **iron ore, copper ore, coal, stone**, and a **lake** (even with water off); never cliffs |
| Never in starting area | uranium, crude oil, enemy bases |
| Resource richness | increases with distance from spawn |
| Chunk size | 32×32 tiles |
| Enemy expansion (default) | every 4–60 min (weighted by evolution), parties of 5–20 units, max expansion distance 7 chunks from existing nests |
| Enemy attacks | launched every 1–10 min (random) once a nest has absorbed enough pollution; 2-minute grace for stragglers |

---

## 5. Resources, plates and intermediates  [wiki]

### 5.1 Raw resources

| Resource | Mining time | Stack | Fuel value | Notes |
|---|---|---|---|---|
| Iron ore | 1 s | 50 | – | smelt → iron plate |
| Copper ore | 1 s | 50 | – | smelt → copper plate |
| Coal | 1 s | 50 | **4 MJ** | main burner fuel |
| Stone | 1 s | 50 | – | furnaces, bricks |
| Wood | tree mining time 0.55 s (dead tree 0.5 s); big tree gives 4 wood | 100 | **2 MJ** | small poles, wooden chest; not automatable in base game |
| Water | offshore pump, infinite | – | – | 1200 units/s per pump |

Sources: https://wiki.factorio.com/Iron_ore , https://wiki.factorio.com/Coal , https://wiki.factorio.com/Wood , https://wiki.factorio.com/Mining

### 5.2 Fuel table

| Fuel | Energy | Vehicle accel. | Vehicle top speed |
|---|---|---|---|
| Wood | 2 MJ | 100% | 100% |
| Coal | 4 MJ | 100% | 100% |
| Solid fuel | 12 MJ | 120% | 105% |
| Rocket fuel | 100 MJ | 180% | 115% |
| Nuclear fuel | 1.21 GJ | 250% | 115% |

Source: https://wiki.factorio.com/Fuel

### 5.3 Smelting recipes (furnace only; cannot be hand-crafted)

| Product | Ingredients | Time @ speed 1 | Stone furnace (speed 1) output | Steel/Electric furnace (speed 2) output | Stack |
|---|---|---|---|---|---|
| Iron plate | 1 iron ore | **3.2 s** | 0.3125/s | 0.625/s | 100 |
| Copper plate | 1 copper ore | 3.2 s | 0.3125/s | 0.625/s | 100 |
| Stone brick | 2 stone | 3.2 s | 0.3125/s | 0.625/s | 100 |
| Steel plate | **5 iron plate** | **16 s** | 0.0625/s | 0.125/s | 100 |

Sources: https://wiki.factorio.com/Iron_plate , https://wiki.factorio.com/Copper_plate , https://wiki.factorio.com/Stone_brick , https://wiki.factorio.com/Steel_plate , https://wiki.factorio.com/Stone_furnace

### 5.4 Early intermediates (hand-craftable or assembler)

| Product | Ingredients | Time | Output | Stack |
|---|---|---|---|---|
| Iron gear wheel | 2 iron plate | 0.5 s | 1 | 100 |
| Copper cable | 1 copper plate | 0.5 s | **2** | 200 |
| Electronic circuit | 1 iron plate + 3 copper cable | 0.5 s | 1 | 200 (raw ≈ 1 iron + 1.5 copper) |
| Pipe | 1 iron plate | 0.5 s | 1 | 100 |
| Iron stick | 1 iron plate | 0.5 s | 2 | [unverified] |
| Firearm magazine | 4 iron plate | 1 s | 1 (10 rounds, 5 physical dmg/round) | 100 |
| Automation science pack (red) | 1 copper plate + 1 iron gear wheel | **5 s** | 1 | [unverified: 200] |
| Logistic science pack (green) | 1 inserter + 1 transport belt | **6 s** | 1 | [unverified: 200] |

Sources: https://wiki.factorio.com/Iron_gear_wheel , https://wiki.factorio.com/Copper_cable , https://wiki.factorio.com/Electronic_circuit , https://wiki.factorio.com/Pipe , https://wiki.factorio.com/Firearm_magazine , https://wiki.factorio.com/Automation_science_pack , https://wiki.factorio.com/Logistic_science_pack_(research)

---

## 6. Early-game buildings — full stat table  [wiki]

### 6.1 Mining

| Building | Recipe | Craft time | Footprint | Mining area | Mining speed | Energy | Pollution | Health | Stack | Unlock |
|---|---|---|---|---|---|---|---|---|---|---|
| **Burner mining drill** | 3 iron gear + 3 iron plate + 1 stone furnace (raw: 9 iron plate + 5 stone) | 2 s | **2×2** | **2×2** | **0.25/s** | **150 kW burner** | 12/min | 150 | 50 | available at start |
| **Electric mining drill** | 3 electronic circuit + 5 iron gear + 10 iron plate | 2 s | **3×3** | **5×5** | **0.5/s** (0.25/s on uranium) | **90 kW electric** | 10/min | 300 | [50] | 1.1: start; 2.0: "Electric mining drill" tech (25 red × 10 s) |

Derived: a burner drill burns 1 coal per 4 MJ / 0.15 MW = 26.7 s → ≈ 6.7 ore per coal (wiki says "about 7"). A burner drill on coal mines 0.25 coal/s but consumes only 0.0375 coal/s → net +0.2125 coal/s; two drills facing each other on coal refuel each other indefinitely.

Sources: https://wiki.factorio.com/Burner_mining_drill , https://wiki.factorio.com/Electric_mining_drill , https://wiki.factorio.com/Electric_mining_drill_(research)

### 6.2 Smelting

| Building | Recipe | Craft time | Footprint | Crafting speed | Energy | Pollution | Health | Modules | Unlock |
|---|---|---|---|---|---|---|---|---|---|
| **Stone furnace** | 5 stone | 0.5 s | **2×2** | **1** | **90 kW burner** (0.0225 coal/s) | 2/min | 200 | 0 | start |
| **Steel furnace** | 6 steel plate + 10 stone brick | 3 s | 2×2 | **2** | 90 kW burner | 4/min | [unverified 300] | 0 | Advanced material processing |
| **Electric furnace** | 5 advanced circuit + 10 steel plate + 10 stone brick | 5 s | **3×3** | 2 | **180 kW electric** + 6 kW drain | 1/min | 350 | 2 | Advanced material processing 2 |

Sources: https://wiki.factorio.com/Stone_furnace , https://wiki.factorio.com/Steel_furnace , https://wiki.factorio.com/Electric_furnace

### 6.3 Belts and logistics

| Building | Recipe | Craft time | Output | Footprint | Speed | Throughput | Health | Unlock |
|---|---|---|---|---|---|---|---|---|
| **Transport belt (yellow)** | 1 iron gear + 1 iron plate | 0.5 s | **2** | 1×1 | **1.875 tiles/s** | **15 items/s** (7.5 per lane) | 150 | start |
| Fast transport belt (red) | 5 iron gear + 1 transport belt | 0.5 s | 1 | 1×1 | 3.75 tiles/s | 30 items/s | 160 | Logistics 2 |
| Express transport belt (blue) | 10 iron gear + 1 fast belt + 20 lubricant (fluid → AM2/3 only) | 0.5 s | 1 | 1×1 | 5.625 tiles/s | 45 items/s | 170 | Logistics 3 |
| Turbo belt (green, Space Age only) | – | – | – | 1×1 | 7.5 tiles/s | 60 items/s | – | SA |
| **Underground belt (yellow)** | 10 iron plate + 5 transport belt | 1 s | **2** | 1×1 each end | as belt | as belt | 150 | Logistics |
| **Splitter (yellow)** | 5 electronic circuit + 5 iron plate + 4 transport belt | 1 s | 1 | **2×1** | as belt | 15 items/s | 170 | Logistics |
| Wooden chest | 2 wood | 0.5 s | 1 | 1×1 | – | **16 slots** | 100 | start |
| Iron chest | 8 iron plate [unverified] | 0.5 s | 1 | 1×1 | – | 32 slots | [200] | start |
| Steel chest | 8 steel plate [unverified] | 0.5 s | 1 | 1×1 | – | 48 slots | [350] | Steel processing |
| Pipe | 1 iron plate | 0.5 s | 1 | 1×1 | – | holds 100 fluid | 100 | Steam power (2.0) / start (1.1) |

Belt mechanics (source: https://wiki.factorio.com/Belt_transport_system):
- Every belt has **2 lanes**; each straight tile holds **4 items per lane = 8 items per tile** (item spacing 0.25 tile).
- Throughput = speed × 8 items/tile: 1.875 × 8 = 15/s.
- Underground max gap between entrance and exit: **yellow 4 tiles, red 6, blue 8**. A 4-tile yellow underground pair buffers up to 44 items.
- Splitter: splits 1:1 across both outputs, keeps lane position, redirects everything to the other side if one output is blocked; supports input/output priority and an item filter.
- Side-loading: a belt ending on the side of another belt only feeds the near lane.
- Inserters drop onto the **far lane** of a belt (right-hand lane if belt runs parallel to inserter direction); when picking from a perpendicular belt they prefer the **near lane**.

Sources: https://wiki.factorio.com/Transport_belt , https://wiki.factorio.com/Fast_transport_belt , https://wiki.factorio.com/Express_transport_belt , https://wiki.factorio.com/Underground_belt , https://wiki.factorio.com/Splitter , https://wiki.factorio.com/Wooden_chest , https://wiki.factorio.com/Pipe , https://wiki.factorio.com/Belt_transport_system , https://wiki.factorio.com/Inserters

### 6.4 Inserters

| Inserter | Recipe | Craft | Rotation (turns/tick → °/s) | Extension (tiles/tick) | Reach | Items/s chest→chest (no stack bonus) | Energy | Drain | Health | Unlock |
|---|---|---|---|---|---|---|---|---|---|---|
| **Burner inserter** | 1 iron gear + 1 iron plate | 0.5 s | 0.013 → 281°/s | 0.035 | 1 tile | **0.79** | **144 kW burner** (leeches fuel from what it carries) | – | 100 | start |
| **Inserter (yellow)** | 1 electronic circuit + 1 iron gear + 1 iron plate | 0.5 s | 0.014 → 302°/s | 0.035 | 1 tile | **0.86** | 15.1 kW (2.0 wiki figure; 1.1 listed 13.2 kW [unverified]) | 0.4 kW | 150 | Electronics |
| Long-handed inserter | 1 inserter + 1 iron gear + 1 iron plate | 0.5 s | 0.02 → 432°/s | 0.05 | **2 tiles** | 1.25 | 21.4 kW | 0.4 kW | 160 | Automation |
| Fast inserter | 2 electronic circuit + 1 inserter + 2 iron plate | 0.5 s | 0.04 → 864°/s | 0.1 | 1 tile | **2.5** | 59.3 kW | 0.5 kW | 150 | Fast inserter (30 red) |
| Bulk (stack) inserter | – | – | 0.04 | 0.1 | 1 tile | 2.5 (×stack size bonus) | – | – | – | later |

Energy per transfer cycle: burner 66.9 kJ, inserter 6.65 kJ, fast 7.0 kJ. With inserter stack-size bonus +2 / +7 the items/s multiply ×2 / ×3 (e.g. inserter 1.71 / 2.57).

Sources: https://wiki.factorio.com/Inserters , https://wiki.factorio.com/Burner_inserter , https://wiki.factorio.com/Inserter , https://wiki.factorio.com/Long-handed_inserter , https://wiki.factorio.com/Fast_inserter

### 6.5 Steam power chain

| Building | Recipe | Craft | Footprint | Key numbers | Pollution | Health | Unlock |
|---|---|---|---|---|---|---|---|
| **Offshore pump** | 2 iron gear + 3 pipe (raw 7 iron) | 0.5 s | **2×1** (placed on shoreline) | **1200 water/s**, no power or fuel needed, infinite | 0 | 150 | Steam power |
| **Boiler** | 4 pipe + 1 stone furnace (raw 4 iron + 5 stone) | 0.5 s | **3×2** | **1.8 MW burner** consumption; outputs **60 steam/s at 165 °C**; water in: 6/s (2.0, 1 water → 10 steam) / 60/s (1.1, 1 water → 1 steam); burns **0.45 coal/s** (1 coal per 2.22 s) | **30/min** | 200 | Steam power |
| **Steam engine** | 8 iron gear + 10 iron plate + 5 pipe (raw 31 iron) | 0.5 s | **3×5** | **900 kW** max; consumes **30 steam/s** at full load; throttles automatically to demand; steam above 165 °C gives no extra power | 0 | 400 | Steam power |
| **Small electric pole** | 1 wood + 2 copper cable → **2 poles** | 0.5 s | 1×1 | supply area **5×5**, wire reach **7.5 tiles** | 0 | 100 | Electronics |
| Medium electric pole | 2 copper cable + 4 iron stick + 2 steel plate | 0.5 s | 1×1 | supply 7×7, reach 9 | 0 | 100 | Electric energy distribution 1 |
| Big electric pole | 4 copper cable + 8 iron stick + 5 steel plate | 0.5 s | 2×2 | supply 4×4, reach 32 (30 in 1.1) | 0 | 150 | Electric energy distribution 1 |
| Solar panel | 5 copper plate + 15 electronic circuit + 5 steel plate | 10 s | 3×3 | 60 kW peak, **42 kW average** over the day cycle | 0 | 200 | Solar energy |
| Accumulator | – | – | 2×2 | 5 MJ storage | 0 | – | Electric energy accumulators |

Piping layout facts: water enters the boiler on its short ends (pass-through, so boilers chain), steam leaves from the middle of the long side; steam engines connect end-to-end (short-side centers) so 2 engines chain off one boiler. Poles must overlap machines with their supply area; wires auto-connect within reach, max 5 connections per pole.

Electric network behaviour: production is shared evenly; if demand > production every consumer slows proportionally (brownout); priority order: solar → steam engines/turbines → accumulators last. Accumulator ratio: ~0.84 accumulators per solar panel (wiki rule of thumb: **25 panels : 21 accumulators ≈ 1 MW sustained**; Steam guide: 180 : 151).

Sources: https://wiki.factorio.com/Offshore_pump , https://wiki.factorio.com/Boiler , https://wiki.factorio.com/Steam_engine , https://wiki.factorio.com/Small_electric_pole , https://wiki.factorio.com/Medium_electric_pole , https://wiki.factorio.com/Big_electric_pole , https://wiki.factorio.com/Solar_panel , https://wiki.factorio.com/Electric_system , https://wiki.factorio.com/Tutorial:Quick_start_guide

### 6.6 Assembling machines and lab

| Building | Recipe | Craft | Footprint | Crafting / research speed | Energy | Drain | Pollution | Health | Modules | Fluids | Unlock |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **Assembling machine 1** | 3 electronic circuit + 5 iron gear + 9 iron plate (raw 22 iron + 4.5 copper) | 0.5 s | **3×3** | **0.5** | **75 kW** | 2.5 kW | 4/min | 300 | 0 | no | Automation (10 red) |
| Assembling machine 2 | [unverified: 2 steel plate + 3 electronic circuit + 5 iron gear + 1 AM1] | 0.5 s | 3×3 | **0.75** | 150 kW | 5 kW | 3/min | 350 | 2 | yes | Automation 2 |
| Assembling machine 3 | 2 assembling machine 2 + 4 speed module | 0.5 s | 3×3 | 1.25 | 375 kW | 12.5 kW | 2/min | 400 | 4 | yes | Automation 3 |
| **Lab** | 10 electronic circuit + 10 iron gear + 4 transport belt (raw 36 iron + 15 copper) | 2 s | **3×3** | **1.0** | **60 kW** | – | 0 | 150 | 2 | – | Electronics (2.0) / start (1.1) |

Lab mechanics: labs consume one of each required pack per research unit; packs inserted into one lab are passed through to adjacent labs via inserters (lab → inserter → lab chaining). Lab research speed techs: +20%, +30%, +40%, +50%, +50%, +60% (cumulative 250%).

Sources: https://wiki.factorio.com/Assembling_machine_1 , https://wiki.factorio.com/Assembling_machine_2 , https://wiki.factorio.com/Assembling_machine_3 , https://wiki.factorio.com/Lab , https://wiki.factorio.com/Lab_research_speed_(research)

### 6.7 Military (early)

| Item | Recipe | Craft | Footprint | Numbers | Health | Unlock |
|---|---|---|---|---|---|---|
| Pistol | not craftable (2.0) | – | – | 4 shots/s, range 15 | – | start |
| Submachine gun | 5 copper plate + 10 iron gear + 10 iron plate | 10 s | – | **10 shots/s**, range 18, same ammo/damage as pistol | – | Military |
| Firearm magazine | 4 iron plate | 1 s | – | 10 rounds, **5 physical damage** per round | – | start |
| **Gun turret** | 10 copper plate + 10 iron gear + 20 iron plate (raw 40 iron + 10 copper) | 8 s | **2×2** | range **18**, fires **10 rounds/s**, no power needed, inserters can move up to 10 magazines between turrets; damage research upgrades ammo and turret as separate multiplicative bonuses | 400 | Gun turret (10 red) |
| **Wall** | 5 stone brick | 0.5 s | 1×1 | resistances: physical 3/20%, explosion 10/30%, fire 0/100%, impact 45/60%, laser 0/70%; blocks melee only, projectiles fly over; big biters can hit 2 tiles past a wall | 350 | Stone wall (10 red) |

Sources: https://wiki.factorio.com/Pistol , https://wiki.factorio.com/Submachine_gun , https://wiki.factorio.com/Firearm_magazine , https://wiki.factorio.com/Gun_turret , https://wiki.factorio.com/Wall

### 6.8 End-game object (for the goal)

| Building | Recipe | Craft | Footprint | Energy | Notes |
|---|---|---|---|---|---|
| **Rocket silo** | 1000 concrete + 200 electric engine unit + 100 pipe + 200 processing unit + 1000 steel plate | 30 s | **9×9** | 4 MW | crafting speed 1; builds rocket parts internally |
| Rocket part (1.1) | 10 low density structure + 10 rocket fuel + 10 processing unit (base 1.1: called rocket control unit) | 3 s [unverified] | – | – | **100 parts per rocket** |
| Rocket part (2.0 / Space Age) | 1 low density structure + 1 rocket fuel + 1 processing unit | – | – | – | **50 parts per rocket** |
| Launch (1.1 base) | with a **satellite** on board → returns **1000 space science packs**; first launch = **victory screen**, game continues afterwards | | | | |

Sources: https://wiki.factorio.com/Rocket_silo , https://wiki.factorio.com/Rocket_silo_(research)

---

## 7. Technology tree for the first ~10 hours  [wiki]

Science packs: **automation (red)**, logistic (green), military (gray), chemical (blue), production (purple), utility (yellow), space (white). Research cost = `units × (packs per unit)`, each unit taking `T0` seconds in one lab at speed 1.

### 7.1 2.0 trigger technologies (replace "available from start" in 1.1)

| Technology | Trigger (2.0) | Prerequisites | Unlocks |
|---|---|---|---|
| Steam power | craft 50 iron plates | none (fetched page listed "Automation science pack" in the prereq slot; this is most likely the *leads-to* relation — treat as none) | pipe, pipe-to-ground, offshore pump, boiler, steam engine |
| Electronics | craft 10 copper plates | none | copper cable, electronic circuit, inserter, lab, small electric pole |
| Automation science pack | craft a lab | Steam power + Electronics | automation science pack recipe; opens Automation, Logistics, Electric mining drill, Fast inserter, Gun turret, Military, Stone wall, Steel processing, Logistic science pack, Radar, Lamp, Repair pack |
| Steel axe | craft 50 steel plates | Steel processing | +100% manual mining speed (0.5 → 1.0) |

In 1.1 all of these items (pipes, boiler, steam engine, inserter, lab, poles, electric drill) are available from the start without research.

### 7.2 Red-science-only technologies

| Technology | Cost | Time/unit | Total lab-seconds | Prerequisite | Unlocks |
|---|---|---|---|---|---|
| **Automation** | **10 red** | 10 s | 100 s | (automation science pack) | **Assembling machine 1**, long-handed inserter |
| Logistics | 20 red | 15 s | 300 s | automation science pack | underground belt, splitter |
| Electric mining drill (2.0 only) | 25 red | 10 s | 250 s | automation science pack | electric mining drill |
| Gun turret | 10 red | 10 s | 100 s | automation science pack | gun turret |
| Military | 10 red | 15 s | 150 s | automation science pack | submachine gun, shotgun, shotgun shells |
| Stone wall | 10 red | 10 s | 100 s | automation science pack | wall (→ gate, military science pack) |
| Fast inserter | 30 red | 15 s | 450 s | automation science pack | fast inserter |
| Steel processing | **50 red** | 5 s | 250 s | automation science pack | **steel plate**, steel chest |
| Logistic science pack | 75 red [count unverified; wiki page showed "1 red per unit, 5 s"] | 5 s | 375 s | automation science pack | green science recipe (1 inserter + 1 belt → 1, 6 s) |
| Advanced material processing | [unverified: 75 red × 30 s] | | | steel processing | steel furnace |

### 7.3 First red+green technologies

| Technology | Cost | Time/unit | Prerequisites | Unlocks |
|---|---|---|---|---|
| Automation 2 | 40 × (red + green) | 15 s | Automation, Logistic science pack, Steel processing | Assembling machine 2 |
| Electric energy distribution 1 | 120 × (red + green) | 30 s | Logistic science pack, Steel processing | medium + big electric pole |
| Logistics 2 | 200 × (red + green) | 30 s | Logistics, Logistic science pack | fast belt / underground / splitter |
| Lab research speed 1 | 100 × (red + green) | 30 s | Automation 2 | +20% research speed |
| Oil processing (later phase) | red+green [count unverified] | | Fluid handling | pumpjack, oil refinery, chemical plant; basic oil processing = 100 crude → 45 petroleum gas in 5 s; leads to plastic, advanced circuits, chemical (blue) science, solid fuel, lubricant (express belts) |

### 7.4 Final technology (the goal)

| Technology | Cost | Unlocks |
|---|---|---|
| Rocket silo | 1.1: 1000 × (red + green + blue + purple + yellow), 60 s/unit [community + wiki]; 2.x base: 60 s/unit with the same 5 packs; whole tree to reach it ≈ 5,960 red + 5,785 green + 3,350 blue + 1,600 purple + 1,000 yellow | rocket silo, rocket part, satellite (base game) |

Sources: https://wiki.factorio.com/Automation_(research) , https://wiki.factorio.com/Logistics_(research) , https://wiki.factorio.com/Electric_mining_drill_(research) , https://wiki.factorio.com/Gun_turret_(research) , https://wiki.factorio.com/Military_(research) , https://wiki.factorio.com/Stone_wall_(research) , https://wiki.factorio.com/Fast_inserter_(research) , https://wiki.factorio.com/Steel_processing_(research) , https://wiki.factorio.com/Logistic_science_pack_(research) , https://wiki.factorio.com/Steel_axe_(research) , https://wiki.factorio.com/Automation_2_(research) , https://wiki.factorio.com/Electric_energy_distribution_1_(research) , https://wiki.factorio.com/Logistics_2_(research) , https://wiki.factorio.com/Lab_research_speed_(research) , https://wiki.factorio.com/Electronics_(research) , https://wiki.factorio.com/Steam_power_(research) , https://wiki.factorio.com/Automation_science_pack_(research) , https://wiki.factorio.com/Oil_processing , https://wiki.factorio.com/Rocket_silo_(research) , https://steamcommunity.com/sharedfiles/filedetails/?id=2275950965

---

## 8. Enemies and pollution (why defense matters)  [wiki]

### 8.1 Pollution produced (per minute at full activity)

| Source | Pollution/min |
|---|---|
| Boiler | **30** |
| Burner mining drill | **12** |
| Electric mining drill | 10 |
| Assembling machine 1 | 4 |
| Steel furnace | 4 |
| Assembling machine 2 | 3 |
| Stone furnace | **2** |
| Assembling machine 3 | 2 |
| Electric furnace | 1 |
| Steam engine, solar, poles, belts, inserters, labs | 0 |

Absorption: water tiles absorb the most, concrete/paths nothing; a fully-leafed tree ≈ 0.001/s; spawners absorb `20 + 0.01 × chunk_pollution` every 64 ticks when chunk pollution > 20 — that absorbed pollution is what "buys" attackers.

Source: https://wiki.factorio.com/Pollution

### 8.2 Enemy units

| Unit | Health | Damage | Attack speed | Speed | Range | Resist (phys / expl) | Pollution cost to send |
|---|---|---|---|---|---|---|---|
| Small biter | **15** | 7 physical (melee) | 1.71/s | 43.2 km/h | 0.5 | – | 4 |
| Medium biter | 75 | 15 | 1.71/s | 51.8 km/h | 1.0 | 4/10% ; 0/10% | 20 |
| Big biter | 375 | 30 | 1.71/s | 49.7 km/h | 1.5 | 8/10% ; 0/10% | 80 |
| Behemoth biter | 3000 | 90 | 1.2/s | 64.8 km/h | 1.5 | 12/10% ; 12/10% | 400 |
| Small spitter | 10 | 12 acid + 7.2/s puddle | 0.6/s | 40.0 km/h | 13 | – | 4 |
| Medium spitter | 50 | 24 + 28.8/s | – | 35.6 km/h | 14 | 0/10% expl | 12 |
| Big spitter | 200 | 36 + 130/s | – | 32.4 km/h | 15 | 0/15% expl | 30 |
| Behemoth spitter | 1500 | 60 + 360/s | – | 32.4 km/h | 16 | 0/30% expl | 200 |
| Spawner (biter/spitter nest) | **350** → 3500 at max evolution | – | – | – | – | fire 3/60% | – |

(Wiki km/h figures assume 1 tile = 1 m; 43.2 km/h = 12 tiles/s = 0.2 tiles/tick.)

### 8.3 Evolution factor (0.0 → 1.0)

| Source of evolution | Default rate |
|---|---|
| Time | 0.000004 per second (≈ 0.0144 per hour) |
| Pollution produced | 0.0000009 per unit |
| Spawner destroyed | 0.002 per nest |
| Damping | each increase is multiplied by `(1 − evolution)²` |

| Evolution | New enemy appears |
|---|---|
| 20% | medium biter |
| 25% | small spitter |
| 40% | medium spitter |
| 50% | big biter, big spitter |
| 90% | behemoth biter, behemoth spitter |

Behaviour: nests only attack after absorbing pollution; groups gather then attack every 1–10 min; they path to the polluter and prioritise military structures/units on the way; attacking a nest triggers retaliation; expansion parties (5–20 units) every 4–60 min up to 7 chunks from existing nests; none spawn in the starting area.

Sources: https://wiki.factorio.com/Enemies , https://wiki.factorio.com/Pollution , https://wiki.factorio.com/Map_generator

---

## 9. Standard early-game ratios  [wiki + community]

All derived from: `items/s = crafting_speed / recipe_time` and belt = 15 items/s (7.5 per lane).

### 9.1 Power

| Ratio | Value | Why |
|---|---|---|
| Boiler : steam engine | **1 : 2** | 1.8 MW in → 60 steam/s → 2 × 30 steam/s = 2 × 900 kW |
| Offshore pump : boiler : steam engine (1.1, and the universal "practical block") | **1 : 20 : 40 = 36 MW** | 1.1: pump 1200 water/s ÷ 60 water/s per boiler = 20 |
| Offshore pump : boiler : engine (2.0 theoretical) | 1 : 200 : 400 | 2.0.7 fluid rework: boiler uses 6 water/s (1 water → 10 steam); players still build 1:20:40 blocks |
| Coal per boiler | 0.45 coal/s | 1.8 MW ÷ 4 MJ |
| Boilers per full yellow belt of coal | **≈ 33 boilers = 60 MW** | 15 coal/s ÷ 0.45 |
| Burner drills on coal needed per boiler | 1.8 drills (≈ 2) | 0.45 ÷ 0.25 |
| Electric drills on coal per boiler | 0.9 (≈ 1) | 0.45 ÷ 0.5 |
| Solar : accumulator | 25 : 21 (≈ 0.84 acc/panel) for ~1 MW | day/night cycle |

### 9.2 Mining → belt

| Drill | Output | Per yellow belt (15/s) | Per lane (7.5/s) | Per red belt | Per blue belt |
|---|---|---|---|---|---|
| Burner mining drill | 0.25/s | **60** | 30 | 120 | 180 |
| Electric mining drill | 0.5/s | **30** | 15 | 60 | 90 |

### 9.3 Furnaces → belt

| Furnace | Plates/s | Per yellow belt | Per side/lane | Per red belt | Per blue belt |
|---|---|---|---|---|---|
| Stone furnace | 0.3125/s | **48** | 24 | 96 | 144 |
| Steel / electric furnace | 0.625/s | **24** | 12 | 48 | 72 |

### 9.4 Drills per furnace

| Pair | Ratio | Notes |
|---|---|---|
| Burner drill → stone furnace (direct insertion, the classic first setup) | 1 : 1 (drill 0.25/s vs furnace 0.3125/s — furnace 80% busy) | drill's output arrow pointing into the furnace; no belt/inserter needed |
| Electric drill → stone furnace | **5 : 8** (0.5 ÷ 0.3125 = 1.6 furnaces per drill) | community shorthand "1 drill : 1.6 stone furnaces" |
| Electric drill → steel furnace | **5 : 4** (0.8 furnaces per drill) | "1 mine feeds 1 electric/steel smelter" is the common approximation |
| Iron-plate furnace → steel furnace (stone→stone) | **1 : 1** | 0.3125 iron plate/s = exactly 5 plates per 16 s = one steel furnace's input |

### 9.5 Intermediates (same-tier assemblers)

| Chain | Ratio |
|---|---|
| Copper cable assemblers : electronic circuit assemblers | **3 : 2** |
| Iron gear (AM1) | 1 gear/s per AM1, eating 2 iron/s (7.5 AM1 gear makers drain one yellow belt of iron) |
| Red science (5 s) per AM1 | 0.1 packs/s each (AM2: 0.15/s) |
| Green science (6 s) per AM1 | 0.083 packs/s each |
| Red : green assemblers for equal output | **5 : 6** |
| Full base-game science line | red : green : military : blue : production : utility = **5 : 6 : 5 : 12 : 7 : 7** assemblers |
| Labs per red-science AM1 | for a 10 s/unit tech: 1 AM1 feeds 1 lab; for a 30 s/unit tech: 1 AM1 feeds 3 labs (lab eats `1/T0` packs/s) |
| Typical first science block | 2 red + 2 green assemblers feeding 4–6 labs |

### 9.6 Fuel efficiency (stone furnace / burner drill)

| Machine | Fuel burn | Items per coal |
|---|---|---|
| Stone furnace (90 kW) | 1 coal / 44.4 s | ≈ 13.9 plates |
| Burner mining drill (150 kW) | 1 coal / 26.7 s | ≈ 6.7 ore |
| Boiler (1.8 MW) | 1 coal / 2.22 s | 4 MJ → 3.6 MJ electricity (2 engines) |

Sources: https://wiki.factorio.com/Tutorial:Quick_start_guide , https://wiki.factorio.com/Boiler , https://wiki.factorio.com/Steam_engine , https://wiki.factorio.com/Offshore_pump , https://wiki.factorio.com/Stone_furnace , https://wiki.factorio.com/Electronic_circuit , https://wiki.factorio.com/Copper_cable , https://wiki.factorio.com/Solar_panel , https://jeu.video/en/guide/factorio-beginner-ratios , https://steamcommunity.com/sharedfiles/filedetails/?id=2275950965 , https://forums.factorio.com/viewtopic.php?t=84637 , https://taogaming.wordpress.com/2017/05/02/factorio-tutorial-simple-production-ratios/

---

## 10. The core loop and the first ~10 hours

### 10.1 The loop in one paragraph

Mine → smelt → craft → build machines that mine/smelt/craft for you → the new machines demand more raw material and power → expand mining/smelting/power → unlock better machines via research → repeat at a larger scale, while pollution from the growing factory provokes biter attacks that force you to invest in defense. Every layer of automation frees the player from a manual task and simultaneously creates a new bottleneck somewhere upstream or downstream. The rocket launch is the formal goal; the actual pull is watching throughput numbers rise.

### 10.2 Phase-by-phase (typical freeplay; hour estimates are for a first-time player)

| # | Phase (≈ hours) | What the player does | Key entities / numbers | Typical "done when" |
|---|---|---|---|---|
| 0 | Crash landing (0:00) | Skippable cutscene shows the crashed ship; wreckage lies around spawn. Inventory: 8 iron plates, pistol, 10 magazines, 1 burner drill, 1 stone furnace (+1 wood). Starting area is guaranteed to have iron, copper, coal, stone and a lake, and no nests. | Player 250 HP, runs 8.9 tiles/s, reach 10 tiles | Player has looked at the map (`M`) and found the 4 ore patches + water |
| 1 | Hand mining (0:00–0:20) | Hold right-click on ore/trees/rocks. 1 ore per 2 s by hand. Hand-craft stone furnaces (5 stone) and burner drills (9 iron + 5 stone raw). Feed coal or wood by hand. | Hand mine 0.5/s; furnace 0.3125 plates/s | 2–4 burner drills, 2–4 furnaces placed |
| 2 | Burner phase (0:20–1:00) | Burner drill (2×2, mines 2×2 area, 0.25/s, 150 kW) placed so its output arrow drops ore straight into a stone furnace (2×2, 90 kW). Two burner drills facing each other on coal refuel each other. Rule of thumb from the wiki: "twice as many miners on iron than copper". Everything still hand-fed with coal. | 12 pollution/min per drill; ~7 ore per coal | ~8 burner drills, coal self-sufficient, a wooden chest of iron plates |
| 3 | Belts + inserters (0:45–1:30) | Craft transport belts (1 gear + 1 iron → 2, 15 items/s) and burner inserters (1 gear + 1 iron, 0.79 items/s, 144 kW, leeches coal from the belt it moves). Lay a coal belt past drills and furnaces so burner inserters keep them fueled. Chests (16 slots) as buffers. | Belt 1.875 tiles/s, 8 items/tile; underground/splitter locked behind Logistics | Coal delivery automated; first ore belt into a furnace column |
| 4 | Electricity (1:00–2:00) | (2.0: craft 50 iron plates → Steam power; craft 10 copper plates → Electronics.) Offshore pump (2×1, 1200 water/s, free) → pipes → boiler (3×2, 1.8 MW, burns 0.45 coal/s) → 2 steam engines (3×5, 900 kW each) → small electric poles (5×5 supply, 7.5 reach, 1 wood + 2 cable → 2). Feed the boiler with a burner inserter from the coal belt. Practical block 1 pump : 20 boilers : 40 engines = 36 MW; the first build is usually 1 : 1–2 : 2–4. | Boiler 30 pollution/min; steam engine ≈ 31 iron + 5 stone | Electric inserters (0.86/s, 13–15 kW) replace burner inserters; first electric mining drills (3×3, 5×5 area, 0.5/s, 90 kW) |
| 5 | First research (1:30–2:30) | Build a lab (10 circuits + 10 gears + 4 belts, 3×3, 60 kW) — in 2.0 that hand-craft is itself the trigger that unlocks red science. Hand-craft 10 red packs (1 copper + 1 gear, 5 s each) → research **Automation** (10 red × 10 s). Then Logistics (20 red), Gun turret (10 red), Military (10 red), Electric mining drill (2.0: 25 red), Steel processing (50 red), Logistic science pack (75 red). | Research time `T0·P/(L·S)`; 10 × 10 s = 100 s on one lab | Automation done: assembling machine 1 unlocked |
| 6 | Automation (2:00–4:00) | Assembling machine 1 (3×3, speed 0.5, 75 kW, 4 pollution/min, no fluids). First targets: gears, then red science (0.1/s per AM1), then green science (inserter + belt → pack, 6 s) once its tech is done; then a "mall" of belts/inserters/poles/drills. Lab chains passing packs. Classic ratio 5 red : 6 green assemblers; 2+2 feeding 4–6 labs is a common first block. | AM1 0.5 speed → gear every 1 s, red pack every 10 s | Red+green science fully automated; ~4–6 labs running |
| 7 | Logistics & scaling (3:00–6:00) | Underground belts (gap 4) and splitters (2×1) unlocked; smelter columns of 24 stone furnaces per belt side (48 per belt) fed by 30 electric drills per belt; long-handed inserters (reach 2); first "main bus" of 4 iron + 4 copper lanes (community pattern). Power grows to a full 1:20:40 block. | 48 stone furnaces = one yellow belt of plates | Two or more full belts of iron and one of copper |
| 8 | Military / defense (whenever pollution reaches nests; typically hour 2–6) | Pollution cloud (visible on map) reaches a nest → attack groups of small biters (15 HP, 7 dmg) every 1–10 min. Gun turrets (2×2, range 18, 10 rounds/s, 400 HP) fed with firearm magazines (4 iron, 5 dmg × 10 rounds) by hand or belt+inserter; walls (350 HP, 5 bricks) later. SMG (10 shots/s) for the player. Evolution creeps by time (0.000004/s), pollution (0.0000009/unit) and nest kills (0.002); medium biters at 20% evolution. | Turret 40 iron + 10 copper; ammo belt loop | Turret line covering the pollution-facing edge with automated ammo |
| 9 | Steel (4:00–7:00) | Steel processing (50 red): 5 iron plates → 1 steel in 16 s (stone furnace 0.0625/s; one iron furnace feeds exactly one steel furnace). Unlocks steel chest, medium/big poles (with EED1), steel furnace (Advanced material processing: speed 2, same 90 kW, 2×2), Automation 2 (AM2 speed 0.75, fluids), Steel axe (2.0 trigger: craft 50 steel). | | Steel column of 8–16 furnaces; AM2 in science |
| 10 | Oil (7:00–15:00, "later phase") | Pumpjacks on crude oil (never in the starting area) → oil refinery (basic: 100 crude → 45 petroleum gas / 5 s) → chemical plants → plastic → advanced circuits, sulfur, solid fuel, lubricant (express belts) → chemical (blue) science; then trains, robots, modules, purple/yellow science, and finally the rocket silo. | Rocket silo tech: 1000 of each of 5 packs (1.1) | Blue science automated |

Sources: https://wiki.factorio.com/Tutorial:Quick_start_guide , https://factorioguides.com/getting-started/ , https://steamcommunity.com/sharedfiles/filedetails/?id=2275950965 , https://factorio.com/blog/post/fff-359 , plus the entity pages cited in §6–§9.

### 10.3 Win condition and typical goals

| Goal | Detail |
|---|---|
| **Formal win** | Research Rocket silo → build the 9×9 silo (1000 concrete, 1000 steel, 200 processing units, 200 electric engines, 100 pipes) → feed 100 rocket parts (1.1; 50 in 2.0) of low-density structure + rocket fuel + processing units → launch. First launch shows the victory screen; the game **continues** afterwards (space science, infinite research, megabase). In Space Age the launch instead opens interplanetary logistics. |
| Time to first rocket | 40–60 h casual (guides); achievements "There is no spoon" = rocket within **8 h**, "No time for chitchat" = within **15 h**; "Lazy bastard" = rocket with ≤ 111 hand-crafts; "Steam all the way" = no solar; "Raining bullets" = no laser turrets; "Getting on track like a pro" = locomotive within 90 min. |
| Intermediate goals players set themselves | first power; first research; automate red; automate green; first turret line; steel; full 1:20:40 power block; a main bus; electric drills everywhere; oil + blue science; trains; construction robots; purple/yellow science; rocket; then "science per minute" (SPM) targets (e.g. 60 SPM, 1k SPM) and megabases. |
| Production-milestone achievements | Mass production 1/2/3 = 10k / 1M / 20M electronic circuits; Iron throne 1/2/3 = 20k / 200k / 400k iron plates per hour; Circuit veteran 1/2/3 = 1k / 10k / 25k advanced circuits per hour; Computer age 1/2/3 = 500 / 1k / 5k processing units per hour; Solaris = 10 GJ/h solar only; Tech maniac = all non-infinite techs. |

Sources: https://wiki.factorio.com/Rocket_silo , https://wiki.factorio.com/Rocket_silo_(research) , https://wiki.factorio.com/Achievements , https://factorioguides.com/getting-started/ , https://steamcommunity.com/sharedfiles/filedetails/?id=2275950965

### 10.4 What makes the loop satisfying (design analysis)

| Ingredient | How it shows up in the numbers |
|---|---|
| **Visible feedback** | A backed-up belt, an idle inserter, or a starving furnace is literally visible on screen; the factory "tells you" where the bottleneck is. Every machine shows its status (working / no power / no ingredients / output full) and its tooltip shows current vs. max performance (e.g. a steam engine at 40% load). |
| **Bottlenecks migrate** | Fixing one shortage exposes the next: more furnaces → not enough ore → more drills → not enough power → more boilers → not enough coal → more drills... Because every rate is a clean number (0.25, 0.3125, 0.5, 0.86, 15), the player can *calculate* the fix. |
| **Ratios as a puzzle** | 1:2 boilers:engines, 1:20:40, 48 stone furnaces per belt, 3:2 cable:circuit, 5:6 red:green — the game is designed so that "perfect" ratios exist and are discoverable; hitting them feels like solving a puzzle, missing them shows up as a backed-up belt. |
| **Spaghetti → order** | Early factories are ad-hoc "spaghetti" belts; they work but are impossible to expand. The pain of scaling pushes the player to invent structure (main bus, smelter columns, blueprints, later city blocks and trains). Rebuilding a cleaner version of something that already works is a core pleasure. |
| **Exponential scale with a fixed unit** | The unit of progress never changes (one item per tick on a belt), but the scale goes from 1 furnace to thousands; the player's own effort per item drops to ~0. The tension "hand-craft it now vs. automate it" is present from minute 5 to hour 50. |
| **External pressure** | Pollution → biters → evolution is a soft clock: growing faster invites attacks, which forces defensive investment, which needs more production. It keeps the sandbox from being purely static. Peaceful mode removes it for players who want a pure puzzle. |
| **Research as pacing** | Each tech is a small, concrete promise (splitters! electric drills! steel!) with a visible progress bar whose speed is itself something you can engineer (more labs, more science assemblers). |
| **Long-term goal** | The rocket is far enough away to justify everything, but the real reward is the moment a newly built block "just runs" without you. Academic modelling work (Petri-net analysis of Factorio production chains) confirms the whole game reduces to flow-network optimisation, which is why it appeals to engineers. |

Sources: https://gamefoundry.games/blog/factory-games-most-satisfying-automation , https://www.gametruth.com/guides/factorio-production-chain-guide-ratios-and-factory-planning/ , https://www.mdpi.com/2079-9292/13/7/1377 , https://factorioguides.com/getting-started/

---

## 11. Quick implementation checklist for a browser clone (numbers to hard-code first)

| System | Minimum faithful constants |
|---|---|
| Tick | 60 ticks/s; all speeds per tick = per-second ÷ 60 |
| Player | 250 HP, 8.9 tiles/s, mining 0.5, reach 10, 80 slots, start kit (8 iron, drill, furnace, pistol, 10 mags, 1 wood) |
| Ore | mining time 1 s, stack 50; iron/copper/coal/stone patches + water guaranteed near spawn |
| Burner drill | 2×2, area 2×2, 0.25/s, 150 kW, coal 4 MJ, 12 pollution/min |
| Stone furnace | 2×2, speed 1, 90 kW, plate 3.2 s, steel 16 s (5 iron), 2 pollution/min |
| Belt | 1.875 tiles/s, 2 lanes × 4 items/tile, 15 items/s, inserters drop on far lane |
| Inserters | burner 0.79/s 144 kW; yellow 0.86/s; long 1.25/s reach 2; fast 2.5/s |
| Power | pump 1200/s; boiler 1.8 MW → 60 steam/s; engine 900 kW ← 30 steam/s; pole 5×5 / 7.5 reach; 1:20:40 |
| AM1 | 3×3, speed 0.5, 75 kW (+2.5 drain), no fluids |
| Lab | 3×3, 60 kW, speed 1, `T = T0·P/(L·S)` |
| Red science | 1 copper + 1 gear, 5 s; Automation = 10 red × 10 s |
| Defense | small biter 15 HP / 7 dmg; turret 2×2 range 18, 10 rounds/s, 5 dmg/round; wall 350 HP |
| Evolution | time 0.000004/s, pollution 0.0000009, nest 0.002; medium biters at 20% |
| Goal | rocket silo 9×9, 100 parts (1.1) / 50 (2.0) |

---

## 12. All sources consulted

Official wiki (primary):
- https://wiki.factorio.com/Time
- https://wiki.factorio.com/Player
- https://wiki.factorio.com/Crafting
- https://wiki.factorio.com/Mining
- https://wiki.factorio.com/Research
- https://wiki.factorio.com/Fuel
- https://wiki.factorio.com/Map_generator
- https://wiki.factorio.com/Tutorial:Quick_start_guide
- https://wiki.factorio.com/Iron_ore , https://wiki.factorio.com/Iron_plate , https://wiki.factorio.com/Copper_plate , https://wiki.factorio.com/Coal , https://wiki.factorio.com/Wood , https://wiki.factorio.com/Stone_brick , https://wiki.factorio.com/Steel_plate
- https://wiki.factorio.com/Iron_gear_wheel , https://wiki.factorio.com/Copper_cable , https://wiki.factorio.com/Electronic_circuit , https://wiki.factorio.com/Pipe , https://wiki.factorio.com/Firearm_magazine , https://wiki.factorio.com/Automation_science_pack
- https://wiki.factorio.com/Burner_mining_drill , https://wiki.factorio.com/Electric_mining_drill
- https://wiki.factorio.com/Stone_furnace , https://wiki.factorio.com/Steel_furnace , https://wiki.factorio.com/Electric_furnace
- https://wiki.factorio.com/Transport_belt , https://wiki.factorio.com/Fast_transport_belt , https://wiki.factorio.com/Express_transport_belt , https://wiki.factorio.com/Underground_belt , https://wiki.factorio.com/Splitter , https://wiki.factorio.com/Belt_transport_system , https://wiki.factorio.com/Wooden_chest
- https://wiki.factorio.com/Inserters , https://wiki.factorio.com/Burner_inserter , https://wiki.factorio.com/Inserter , https://wiki.factorio.com/Long-handed_inserter , https://wiki.factorio.com/Fast_inserter
- https://wiki.factorio.com/Offshore_pump , https://wiki.factorio.com/Boiler , https://wiki.factorio.com/Steam_engine , https://wiki.factorio.com/Small_electric_pole , https://wiki.factorio.com/Medium_electric_pole , https://wiki.factorio.com/Big_electric_pole , https://wiki.factorio.com/Solar_panel , https://wiki.factorio.com/Electric_system
- https://wiki.factorio.com/Assembling_machine_1 , https://wiki.factorio.com/Assembling_machine_2 , https://wiki.factorio.com/Assembling_machine_3 , https://wiki.factorio.com/Lab
- https://wiki.factorio.com/Pistol , https://wiki.factorio.com/Submachine_gun , https://wiki.factorio.com/Gun_turret , https://wiki.factorio.com/Wall
- https://wiki.factorio.com/Enemies , https://wiki.factorio.com/Pollution
- https://wiki.factorio.com/Rocket_silo , https://wiki.factorio.com/Rocket_silo_(research) , https://wiki.factorio.com/Achievements
- Technology pages: https://wiki.factorio.com/Automation_(research) , https://wiki.factorio.com/Logistics_(research) , https://wiki.factorio.com/Electronics_(research) , https://wiki.factorio.com/Steam_power_(research) , https://wiki.factorio.com/Automation_science_pack_(research) , https://wiki.factorio.com/Electric_mining_drill_(research) , https://wiki.factorio.com/Gun_turret_(research) , https://wiki.factorio.com/Military_(research) , https://wiki.factorio.com/Stone_wall_(research) , https://wiki.factorio.com/Fast_inserter_(research) , https://wiki.factorio.com/Steel_processing_(research) , https://wiki.factorio.com/Logistic_science_pack_(research) , https://wiki.factorio.com/Steel_axe_(research) , https://wiki.factorio.com/Automation_2_(research) , https://wiki.factorio.com/Electric_energy_distribution_1_(research) , https://wiki.factorio.com/Logistics_2_(research) , https://wiki.factorio.com/Lab_research_speed_(research) , https://wiki.factorio.com/Oil_processing

Complementary:
- https://factorio.com/blog/post/fff-359 (crash site intro)
- https://en.wikipedia.org/wiki/Factorio , https://store.steampowered.com/app/427520/Factorio/ , https://www.factorio.com/
- https://steamcommunity.com/sharedfiles/filedetails/?id=2275950965 (High-Level Strategy for New Players)
- https://factorioguides.com/getting-started/ (first 10 hours)
- https://jeu.video/en/guide/factorio-beginner-ratios
- https://taogaming.wordpress.com/2017/05/02/factorio-tutorial-simple-production-ratios/
- https://forums.factorio.com/viewtopic.php?t=84637 , https://forums.factorio.com/viewtopic.php?t=53782
- https://gamefoundry.games/blog/factory-games-most-satisfying-automation
- https://www.gametruth.com/guides/factorio-production-chain-guide-ratios-and-factory-planning/
- https://www.mdpi.com/2079-9292/13/7/1377 (Petri-net model of Factorio)

Pages that returned 404 this session (values marked [unverified] where they would have come from here): wiki `Tutorial:Ratios`, `Game_progression`, `Crash_site`, `Freeplay`, `Enemy_spawner`, `Spawner`, `Biter_spawner`; GitHub `wube/factorio-data` freeplay scenario files; factoriocheatsheet.com is JS-only and returned no content.
