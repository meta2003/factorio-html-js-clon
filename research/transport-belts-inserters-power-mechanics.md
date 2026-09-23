# Factorio simulation mechanics: belts, inserters, mining drills, electric network, fluids

Research facet key: `transport-belts-inserters-power-mechanics`
Compiled 2026-09-22 from the official wiki (https://wiki.factorio.com), the official prototype data repository (https://github.com/wube/factorio-data, `master` = 2.0.x and tag `1.1.110` = 1.1), the Lua API prototype docs (https://lua-api.factorio.com) and, for a few belt/pipe details, the Factorio forums and Friday Facts. Values are base game, **Factorio 2.0 (normal quality)** unless marked **[1.1]**. Where 1.1 and 2.0 differ, both are given so the implementer can pick one consistent ruleset.

---

## 0. Units and conventions (read first)

| Concept | Value | Source |
|---|---|---|
| Game tick | 1/60 s; all simulation is per tick | https://wiki.factorio.com/Time |
| Energy per tick | 1 J/tick = 60 W; a device rated P watts consumes P/60 J per tick | https://wiki.factorio.com/Electric_system |
| Tile | 1 x 1 unit; entity positions are tile-centre based; a "3x3" entity is centred on a tile, a "2x2" on a tile corner | prototype `collision_box` values below |
| Belt position unit | 1 tile = 256 "positions" (internal fixed point, 8 fractional bits, minimum step 1/256 = 0.00390625) | https://wiki.factorio.com/Transport_belts/Physics , https://lua-api.factorio.com/latest/prototypes/TransportBeltConnectablePrototype.html |
| Fluid unit | 1 "unit"; a pipe holds 100 | https://wiki.factorio.com/Pipe |
| Fuel values | Wood 2 MJ, Coal 4 MJ, Solid fuel 12 MJ, Rocket fuel 100 MJ, Nuclear fuel 1.21 GJ; burn time (s) = fuel value (MJ) / device consumption (MW) | https://wiki.factorio.com/Fuel |
| Deconstruct ("mining") time of most of these buildings | 0.1 s (boiler 0.2 s, steam engine 0.3 s) | infoboxes |
| Direction vectors in prototypes | `{x, y}` with **north = -y**; every `pickup_position`, `insert_position`, `vector_to_place_result` and pipe connection below is given for the entity facing north; rotate by 90 degree steps for other facings | https://lua-api.factorio.com/latest/prototypes/MiningDrillPrototype.html |

---

## 1. Transport belts

### 1.1 Belt tiers

Source: https://wiki.factorio.com/Belt_transport_system , https://wiki.factorio.com/Transport_belts/Physics , https://wiki.factorio.com/Transport_belt , https://wiki.factorio.com/Fast_transport_belt , https://wiki.factorio.com/Express_transport_belt , prototype file `base/prototypes/entity/transport-belts.lua` (2.0) / `entities.lua` (1.1).

| Tier | Prototype `speed` (tiles/tick) | Speed (tiles/s) | Positions/tick (of 256) | Items/s per lane | Items/s both lanes | Health | Tech | Recipe (crafting time; ingredients -> output) |
|---|---|---|---|---|---|---|---|---|
| Transport belt (yellow) | 0.03125 (=1/32) | 1.875 | 8 | 7.5 | 15 | 150 | none (Logistics for the splitter/underground) | 0.5 s; 1 iron gear wheel + 1 iron plate -> 2 belts |
| Fast transport belt (red) | 0.0625 (=1/16) | 3.75 | 16 | 15 | 30 | 160 | Logistics 2 | 0.5 s; 5 iron gear wheel + 1 transport belt -> 1 |
| Express transport belt (blue) | 0.09375 (=3/32) | 5.625 | 24 | 22.5 | 45 | 170 | Logistics 3 | 0.5 s; 10 iron gear wheel + 1 fast transport belt + 20 lubricant -> 1 |
| Turbo belt (Space Age only, not base game) | 0.125 | 7.5 | 32 | 30 | 60 | - | - | - |

Other infobox data (all tiers): dimensions 1x1, stack size 100, prototype `collision_box = {{-0.4,-0.4},{0.4,0.4}}` (1.1: `{{-0.4,-0.35},{0.4,0.35}}`), max density 8 items per tile. Lua API note: `speed x 480 = items/second` (480 = 4 items/lane x 2 lanes x 60 ticks). FFF-276 (https://www.factorio.com/blog/post/fff-276): a tile is 32 px; belts move an integer number of pixels per tick (1/2/3 px for yellow/red/blue), item spacing is 8 px so exactly 4 items per lane per tile; 0.17 raised yellow throughput from 13.33 to 15 items/s.

### 1.2 Lane and item model (the part an engine must reproduce)

Source: https://wiki.factorio.com/Transport_belts/Physics , https://wiki.factorio.com/Belt_transport_system

* Every belt tile has **2 lanes** (left and right, relative to the belt direction). Each lane is an independent queue.
* Items are **points with a minimum spacing**: on a saturated belt consecutive items on a lane are exactly **64 positions = 0.25 tile** apart, so a straight tile holds **4 items per lane, 8 per tile**, regardless of tier.
* A straight lane is **256 positions** long. Each tick every item on a lane advances by the belt's positions/tick (8/16/24) unless the item ahead of it (or the lane end) is closer than 64 positions, in which case it moves up to that limit and stops ("compression"). Items never overtake and never change lanes on their own.
* Items reaching the end of the last belt of a line **do not fall off**: they stop at the last position and queue up. ("Items on transport belts don't go off the belt at the end.") Items marked for deconstruction are not moved.
* Straight lane lengths in positions (both lanes of a straight tile: 256). **Curved tile**: inner lane **106** positions, outer lane **295** positions (ratio 295/256 = 1.152). Items move at the same positions/tick on both lanes, so the inner lane of a turn carries items through faster in time and holds fewer of them (106/64 -> at most 2 spacing slots, outer 295/64 -> 4-5). This is why a saturated belt through a corner has more items on the outside than the inside.
* Underground belt entrance and exit tiles: **256 positions per lane each**.
* Splitter: **128 positions plus an invisible internal buffer of 51 positions** per lane.
* Side-loading (see 1.3): an item that joins a straight tile from the side has **68** positions of travel left on that tile if it was "sideloaded late" and **188** if "sideloaded early" (the two lanes of the feeding belt hit the target tile 120 positions apart).

### 1.3 Belt topology rules (connect / curve / side-load / end)

Source: https://wiki.factorio.com/Belt_transport_system (rules), https://wiki.factorio.com/Transport_belts/Physics (numbers).

1. **Straight continuation**: a belt whose front faces the back of another belt of the same direction hands items over lane-to-lane (left to left, right to right).
2. **Curve**: a belt tile becomes a curve when exactly one belt feeds it from one side and nothing feeds it from directly behind. Items keep their lane through the curve (left lane stays left), using the 106/295 lane lengths above. The curve's direction is the tile's own facing; it accepts input from the side belt only.
3. **Side-loading**: when a belt points into the side of a belt that is already fed from behind (or is fed from both sides), it does not curve; instead **both lanes of the feeding belt are put onto the single lane of the target that is nearest to the feeder** (the "near lane"). The far lane of the target is untouched. Side-loaded items only enter when there is a 64-position gap on the target lane at the join point; otherwise the feeder backs up.
4. **Belt end**: items stop at the end of the lane. A belt pointing head-on into a belt facing the opposite way, or into a non-belt entity, is an end.
5. **Side-loading onto an underground belt tile**: "The half of the underground belt tile with a belt can accept input from the side. The other half (with a tunnel entrance) blocks incoming items." So feeding a belt into the side of an underground entrance/exit passes only one lane of the feeder (the one that lands on the belt half) and blocks the other; this is the standard **lane filter** trick. A single reversed underground belt therefore blocks one lane of a belt.
6. **Merging / unmerging**: belts merge by feeding into another belt; unmerging requires a splitter filter or the underground-belt lane block above.
7. **Belt speed matching**: different tiers connect freely; items simply move at the speed of the tile they are on.
8. Belts can be connected to the circuit network (enable/disable, read contents pulse/hold) - cosmetic for a clone.

### 1.4 Underground belts

Source: https://wiki.factorio.com/Underground_belt , https://wiki.factorio.com/Fast_underground_belt , https://wiki.factorio.com/Express_underground_belt , https://wiki.factorio.com/Belt_transport_system , prototype `max_distance`.

| Tier | Speed | Prototype `max_distance` | Max gap between entrance and exit (tiles) | Health | Tech | Recipe |
|---|---|---|---|---|---|---|
| Underground belt | 15 items/s | 5 | 4 | 150 | Logistics | 1 s; 10 iron plate + 5 transport belt -> 2 |
| Fast underground belt | 30 items/s | 7 | 6 | 160 | Logistics 2 | 2 s; 40 iron gear wheel + 2 underground belt -> 2 |
| Express underground belt | 45 items/s | 9 | 8 | 170 | Logistics 3 | 2 s; 80 iron gear wheel + 2 fast underground belt + 40 lubricant -> 2 |

Rules:
* `max_distance` is the largest allowed distance in tiles between the entrance tile and the exit tile centre-to-centre; the wiki phrases the same thing as "maximum underground distance of 4 tiles" for yellow (i.e. up to 4 free tiles in between, entrance and exit occupy 2 more).
* Entrance and exit must be the **same tier** and face the same direction (one is "input", the other "output"); a newly placed entrance pairs with the nearest matching exit within range. A pair may pass under anything (other belts, buildings, water) as long as both ends are on land.
* Each visible tile behaves as a normal 256-position belt lane pair; the hidden tunnel adds capacity: "An underground belt pair that bridges a gap of 4 tiles stores up to 44 items. An express underground belt pair at max length stores up to 72 items."
* Items keep their lanes through the tunnel; the exit tile's belt half can be side-loaded like a belt (only one lane, rule 1.3.5).

### 1.5 Splitters

Source: https://wiki.factorio.com/Splitter , https://wiki.factorio.com/Fast_splitter , https://wiki.factorio.com/Express_splitter , https://wiki.factorio.com/Belt_transport_system , https://wiki.factorio.com/Transport_belts/Physics .

| Tier | Speed | Health | Tech | Recipe |
|---|---|---|---|---|
| Splitter | 15 items/s | 170 | Logistics | 1 s; 5 electronic circuit + 5 iron plate + 4 transport belt -> 1 |
| Fast splitter | 30 items/s | 180 | Logistics 2 | 2 s; 10 electronic circuit + 10 iron gear wheel + 1 splitter -> 1 |
| Express splitter | 45 items/s | 190 | Logistics 3 | 2 s; 10 advanced circuit + 10 iron gear wheel + 1 fast splitter + 80 lubricant -> 1 |

Geometry: 2 tiles wide, 1 tile long (prototype `collision_box = {{-0.9,-0.4},{0.9,0.4}}` facing north); two input belt slots at the back, two output belt slots at the front; stack size 50.

Behaviour (quotes from the wiki):
* "Splitters are a 2x1 entity that splits incoming items on belts from up to two input to up to two outputs, in a 1:1 ratio." "The items are placed in 1:1 relation on the outgoing belts."
* Per-lane, per-item alternation: "The left and right lane splitting is now completely independent. The decision whether item goes to left or right output is now independent of the item type." **Lanes are preserved**: a left-lane item stays on the left lane of whichever output belt it goes to.
* "If one of the outputs is fully backed-up and the splitter cannot split evenly, it will put all input on its other output." "Splitter now has a maximum memory of 5 items when forced to send items on one side because the other one is blocked" (i.e. it remembers up to 5 items of imbalance and compensates once the blocked side frees up).
* Two inputs are consumed alternately (also per lane); with one output the splitter merges two belts 1:1.
* **Input priority** (left/right/none): "first try to consume the specified input side, and will only consume the other input once there is a gap on the prioritized input belt."
* **Output priority**: "try to redirect all incoming items to the specified output, and will only output on the other output once the specified output is full."
* **Filter** (one item type, plus a chosen filter output side): items matching the filter go only to the filter side, all other items only to the other side; if the filter side is full, matching items wait (they never leak to the other side).
* "The speed of the splitter is the same as its relevant type of belt, so in order to properly join/split belts, the splitter must be the same speed as the incoming belts."
* Internal length per lane: 128 positions + 51-position hidden buffer.

---

## 2. Inserters

### 2.1 Tier data, Factorio 2.0

Sources: prototype file `base/prototypes/entity/entities.lua` (2.0 master) for the raw numbers; https://wiki.factorio.com/Inserters ; individual pages https://wiki.factorio.com/Burner_inserter , https://wiki.factorio.com/Inserter , https://wiki.factorio.com/Long-handed_inserter , https://wiki.factorio.com/Fast_inserter , https://wiki.factorio.com/Bulk_inserter .

| Inserter | `rotation_speed` (rotations/tick) | Degrees/s | `extension_speed` (tiles/tick) | `pickup_position` | `insert_position` | Energy per movement / per rotation | Drain | Max power (wiki) | Base hand size | Filter slots | Health | Recipe (0.5 s each) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Burner inserter | 0.013 | 281 | 0.035 | {0,-1} | {0,1.2} | 50 kJ / 50 kJ (burner, 1 fuel slot) | none | 144 kW | 1 | 5 | 100 | 1 iron gear wheel + 1 iron plate |
| Inserter (yellow) | 0.014 | 302 | 0.035 | {0,-1} | {0,1.2} | 5 kJ / 5 kJ | 0.4 kW | 15.1 kW | 1 | 5 | 150 | 1 electronic circuit + 1 iron gear wheel + 1 iron plate |
| Long-handed inserter | 0.02 | 432 | 0.05 | {0,-2} | {0,2.2} | 5 kJ / 5 kJ | 0.4 kW | 21.4 kW | 1 | 5 | 160 | 1 inserter + 1 iron gear wheel + 1 iron plate |
| Fast inserter | 0.04 | 864 | 0.1 | {0,-1} | {0,1.2} | 7 kJ / 7 kJ | 0.5 kW | 59.3 kW | 1 | 5 | 150 | 2 electronic circuit + 1 inserter + 2 iron plate |
| Bulk inserter (was "stack inserter") | 0.04 | 864 | 0.1 | {0,-1} | {0,1.2} | 20 kJ / 20 kJ | 1 kW | 169 kW | 1 in prototype, +1 from its unlock technology = 2 | 5 | 160 | 1 advanced circuit + 15 electronic circuit + 1 fast inserter + 15 iron gear wheel |

All inserters: 1x1, `collision_box {{-0.15,-0.15},{0.15,0.15}}`, stack size 50, electric ones use `usage_priority = "secondary-input"`. In 2.0 **every inserter has 5 filter slots** (whitelist/blacklist); the separate filter inserter was removed in 2.0.7.

### 2.2 Tier data, Factorio 1.1 (for a 1.1-faithful clone)

Source: prototype file at tag `1.1.110`; https://wiki.factorio.com/index.php?title=Inserters&oldid=198466 (May 2024 revision); https://wiki.factorio.com/Filter_inserter (archived).

| Inserter [1.1] | rotation_speed | extension_speed | Energy per movement/rotation | Drain | Max power | Base hand size | Filter slots | Ticks per full cycle (wiki) | Chest-to-chest items/s (hand 1 / +2 / +7 research) |
|---|---|---|---|---|---|---|---|---|---|
| Burner | 0.01 | 0.0214 | 50 kJ | none | 94.2 kW | 1 | 0 | 100 | 0.60 / 1.20 / 1.80 |
| Inserter | 0.014 | 0.03 | 5 kJ | 0.4 kW | 13.6 kW | 1 | 0 | 72 | 0.83 / 1.67 / 2.50 |
| Long-handed | 0.02 | 0.0457 | 5 kJ | 0.4 kW | 18.1 kW | 1 | 0 | 50 | 1.20 / 2.40 / 3.60 |
| Fast | 0.04 | 0.07 | 7 kJ | 0.5 kW | 46.7 kW | 1 | 0 | 26 | 2.31 / 4.62 / 6.92 |
| Filter | 0.04 | 0.07 | 8 kJ | 0.5 kW | 52.4 kW | 1 | 5 | 26 | as fast |
| Stack | 0.04 | 0.07 | 20 kJ | 1 kW | 132.4 kW | 2 (`stack = true`) | 0 | 26 | 2.31 / 9.23 / 27.69 |
| Stack filter | 0.04 | 0.07 | 20 kJ | 1 kW | 132.4 kW | 2 | 1 | 26 | as stack |

Pickup/insert vectors are identical to 2.0. The wiki's 1.1 rule for tick counts: "If the rotation speed of an inserter would result in an odd number of ticks per full turn, the actual number of ticks per full turn for this inserter is the next higher even number" (one cycle = two half-turns).

### 2.3 Swing timing and throughput

Source: https://wiki.factorio.com/Inserters (speed tables) and prototype numbers above.

* An inserter cycle is: rotate 180 degrees from pickup to drop (half turn), drop, rotate back 180 degrees, pick up. Rotation and extension happen simultaneously; `pickup_position` is 1.0 tile behind and `insert_position` 1.2 tiles in front, so the arm also extends 0.2 tile during each half turn (0.2 / 0.035 = 6 ticks for a yellow inserter, less than the rotation time, so rotation dominates).
* Half-turn ticks = 0.5 / rotation_speed, rounded: [1.1] rounded up (burner 50, yellow 36, long 25, fast 13 -> cycles 100/72/50/26 ticks). [2.0] the wiki lists cycles of **76 / 70 / 48 / 24 / 24** ticks for burner / yellow / long-handed / fast / bulk, i.e. one tick less per half turn (ceil((0.5 - rotation_speed) / rotation_speed)).
* Chest-to-chest throughput = hand size x 60 / cycle ticks. 2.0 wiki values (normal quality, no research): burner 0.79/s, yellow 0.86/s, long-handed 1.25/s, fast 2.5/s, bulk 2.5/s with hand 1 (5/s with hand 2, 10/s with hand 4, 30/s with hand 12).
* "Chest to chest transfer transfers the entire hand size during a single tick, so most of the time is spent during the swing to and from." Dropping onto a belt is slower: "One item is removed from the inserter's hand every tick" and each item needs a 64-position gap under the hand, so e.g. a fast inserter reaches ~2.5 items/s onto any belt, a 12-hand bulk inserter ~13.85 items/s onto an express belt (52 ticks for 12 items, see https://robbieg8s.wordpress.com/2020/01/24/factorio-inserter-mechanics/ for the tick-by-tick drop sequence 2,3,3,2,3,3,2,3,3,1,1 + 13 ticks return).
* Picking from a moving belt: the hand **chases** items (`chases_belt_items = true`); slow inserters "may have trouble grabbing moving items from red/blue turning belts if the item is on the far side" (curve outer lane), and the yellow inserter "is not fast enough to pick up items moving on the far side of a curving express transport belt".

### 2.4 Inserter <-> belt lane rules

Source: https://wiki.factorio.com/Inserters ("Transport belt interaction"), https://forums.factorio.com/viewtopic.php?t=26645 .

* **Drop**: "Inserters place the item on the furthest lane. If a belt is in the same orientation as the inserter, the item will be placed on the right-hand lane, from the belt's perspective." On a curve the inserter always places on the far side. Mechanically this follows from `insert_position = {0, 1.2}`: the drop point is 0.2 tile beyond the centre of the tile in front, i.e. on the lane away from the inserter for a perpendicular belt.
* **Pickup**: "Inserters prefer taking items from the nearest lane. If the nearest lane is empty, the inserter will take from the far lane." For a belt running parallel/anti-parallel to the inserter (or a curve) it prefers the belt's **left** lane, then the right. An inserter can take from both lanes and from underground belt ends and splitter tiles.
* An inserter drops onto a belt only when the drop point has a free 64-position gap; otherwise it waits with the item in hand.
* An inserter takes from behind and places in front: "They can move items from behind and place them in front of them." Rotating the inserter swaps the two tiles. Long-handed reaches 2 tiles both ways.

### 2.5 What inserters take from and put into

Source: https://wiki.factorio.com/Inserters , https://wiki.factorio.com/Gun_turret , https://wiki.factorio.com/Burner_inserter .

Sources (pickup): transport/underground belts and splitters (both lanes), items lying on the **ground**, chests and logistic chests, **output slots** of furnaces / assembling machines / labs (science packs) / mining-drill outputs, vehicles and cargo wagons (only when stopped at a station or manual), other inserters' drop tiles (ground). Inserters never take from a machine's input/ingredient slots or its fuel slot.

Targets (drop): belts (far lane), splitters, ground (item dropped on the tile if nothing is there; the tile then holds one item and blocks until picked up), chests, machine **input slots** (only items the machine's current recipe needs), **fuel slots** of burner devices (boilers, furnaces, burner drills, burner inserters, locomotives, reactors - only valid fuel items), **ammo slots** of turrets (gun turret: magazines), labs (science packs), cargo wagons/cars (stopped).

Rules:
* "Inserters will not pick up any items that cannot be inserted into the adjacent entity." If the target cannot accept anything the inserter idles with an empty hand over the source; if it already holds an item the target refuses, it waits holding it (a classic jam).
* Inserters "will not fill up the entire target inventory" (see limits in 2.6).
* Electric inserters need power (see 2.7); a **burner inserter** burns fuel only while moving ("consumes no fuel while idle"), and **self-refuels/leeches**: "will add fuel to its own supply if it picks any up"; when its fuel reaches zero it pulls a fuel item from its source for itself.
* Fuel cannot be inserted into a moving train.

### 2.6 Automatic insertion limits ("ingredient limit")

Source: https://wiki.factorio.com/Inserters section "Insertion limits" (2.0 text, 1.1 text identical in substance per revision oldid=198466); https://wiki.factorio.com/Gun_turret ; https://wiki.factorio.com/Assembling_machine_1 .

Inserters stop inserting into a target once it holds at least the following, so that items keep flowing to machines further down the line:

| Target | Limit |
|---|---|
| Assembling machines, furnaces, chemical plants, refineries, centrifuges (ingredients) | "The ingredients for 1 craft in addition to the ingredients for the number of crafts that can be completed (rounded up) during one full normal quality standard inserter swing (1.166 seconds); but at least the ingredients for 2 crafts and at most the ingredients for 100 crafts." I.e. `crafts = clamp(1 + ceil(1.166 / (recipe_time / crafting_speed)), 2, 100)`; limit per ingredient = `crafts x ingredient_amount`. For any recipe that takes >= 1.166 s in the machine this is exactly the widely quoted "**2x the recipe amount**" rule (e.g. 2 iron ore in a stone furnace, 4 iron plate for gears in an assembler at speed 0.5 needs 0.5/0.5 = 1 s per craft -> 1 + 2 = 3 crafts -> 6 plates). |
| Fuel slots (boilers, furnaces, burner drills, burner inserters, reactors) | maximum 5 fuel items |
| Gun turret | maximum 10 magazines (`automated_ammo_count = 10`) |
| Artillery turret | maximum 5 shells |
| Labs | science packs for 1 research unit + those completable during one swing, min 2, max 100 units |
| Chests, belts, ground | no limit (until full) |

"Assembling machine input slot can contain more than the usual stack size when the recipe requirement demands it." Manual insertion by the player is not limited.

### 2.7 Hand size (stack size bonus) research

Source: https://wiki.factorio.com/Inserter_capacity_bonus_(research) ; `base/prototypes/technology.lua` (2.0 and 1.1 identical).

| Research level | Non-bulk inserters hand size | Bulk/stack inserter hand size |
|---|---|---|
| none (bulk/stack inserter unlock tech gives bulk +1) | 1 | 2 |
| 1 | 1 | 3 |
| 2 | 2 | 4 |
| 3 | 2 | 5 |
| 4 | 2 | 6 |
| 5 | 2 | 8 |
| 6 | 2 | 10 |
| 7 | 3 | 12 |

Each level is 30 s per unit; levels 1-2 use automation+logistic packs (200 units), later levels add chemical/production packs (level 5: 300, 6: 400, 7: 600 units).

### 2.8 Inserter power model

Source: https://wiki.factorio.com/Inserters ("Power consumption"), prototype `energy_per_movement`, `energy_per_rotation`, `drain`.

* Electric inserters draw the **drain** every tick whether or not they move (0.4 kW yellow/long, 0.5 kW fast, 1 kW bulk).
* While rotating: `energy_per_rotation x rotation_speed x 60` W (yellow 5 kJ x 0.014 x 60 = 4.2 kW; fast 16.8 kW; long 6 kW; bulk 48 kW; burner 39 kW). While extending: `energy_per_movement x extension_speed x 60` W (yellow 10.5 kW; fast 42 kW; long 15 kW; bulk 120 kW; burner 105 kW). Max power = drain + both (matches the wiki infobox numbers in 2.1).
* Wiki per-cycle energy (2.0): burner 66.9 kJ, yellow 6.65 kJ, long 7 kJ, fast 8.12 kJ, bulk 46.4 kJ; item-drop "spike" durations 5/5/4/1/1 ticks.
* Under a brownout an electric inserter receives energy proportionally to network satisfaction and therefore moves proportionally slower (all electric machines do, see 4.5). With no power it stops but keeps holding its item.
* Burner inserter: burner energy source, effectivity 1, 1 fuel slot; 144 kW while moving (2.0) / 94.2 kW [1.1]; accepts wood, coal, solid fuel, rocket fuel, nuclear fuel.

---

## 3. Mining drills

### 3.1 Drill data

Source: https://wiki.factorio.com/Burner_mining_drill , https://wiki.factorio.com/Electric_mining_drill , https://wiki.factorio.com/Mining , `base/prototypes/entity/mining-drill.lua` (2.0), Lua API https://lua-api.factorio.com/latest/prototypes/MiningDrillPrototype.html .

| Property | Burner mining drill | Electric mining drill |
|---|---|---|
| Footprint | 2x2 (`collision_box {{-0.7,-0.7},{0.7,0.7}}`) | 3x3 (`collision_box {{-1.35,-1.35},{1.35,1.35}}`) |
| Mining area | 2x2 (`resource_searching_radius = 0.99`) - exactly its own footprint | 5x5 (`resource_searching_radius = 2.49`) - footprint plus 1 tile ring |
| `mining_speed` | 0.25 | 0.5 |
| Output rate on iron/copper/coal/stone (mining time 1) | 0.25 items/s | 0.5 items/s (uranium: 0.25/s, needs sulfuric acid) |
| Energy | 150 kW burner (effectivity 1, 1 fuel slot, fuels wood/coal/solid/rocket/nuclear) | 90 kW electric (`secondary-input`) |
| Pollution | 12 / min | 10 / min |
| Output position `vector_to_place_result` (facing north) | {-0.35, -1.3} (2.0); {-0.5, -1.3} [1.1] -> the tile directly in front of the drill's **left (west) column** | {0, -1.85} -> the tile directly in front of the **centre column** |
| Module slots | 0 | 3 |
| Resource categories | basic-solid (iron, copper, coal, stone) | basic-solid (+ uranium ore with acid) |
| Health | 150 | 300 |
| Recipe | 2 s; 3 iron gear wheel + 3 iron plate + 1 stone furnace -> 1 | 2 s; 3 electronic circuit + 5 iron gear wheel + 10 iron plate -> 1 |
| Stack size | 50 | 50 |
| Items per coal | "about 7" (4 MJ / 150 kW = 26.7 s x 0.25/s = 6.67) | - |

The Lua API explains the radius: 2.49 gives a 5x5 area and 0.99 a 2x2 area (0.01 margin). Fluid box for the electric drill: volume 200 with three connectors that appear only when placed on uranium, allowing acid to pass through adjacent drills.

### 3.2 Mining mechanics

Source: https://wiki.factorio.com/Mining , https://wiki.factorio.com/Electric_mining_drill , https://wiki.factorio.com/Map_generator , `base/prototypes/entity/resources.lua`, `core/lualib/resource-autoplace.lua` (1.1.110).

* Production rate (items/s) = `mining_speed / mining_time_of_resource` x (1 + mining productivity bonus). Seconds per item = mining_time / mining_speed. Resource mining times: iron ore 1, copper ore 1, coal 1, stone 1, uranium ore 2 (Space Age: scrap 0.5, calcite 1, tungsten 5). Player hand mining: (1 + modifier) x 0.5 / mining_time.
* Each mined item subtracts 1 from the `amount` of one resource tile inside the area (`resource_drain_rate_percent` = 100 for both drills). When a tile reaches 0 it disappears; when no tile remains in the area the drill stops (a red/no-resource status). Which tile is mined next is not specified by the wiki; any policy (round-robin or random among remaining tiles) reproduces the observable behaviour. The drill's tooltip shows the sum of all tiles in its area, and placement requires the area to overlap at least one resource tile.
* The drill accumulates progress per tick (`mining_speed / mining_time / 60` per tick at 100 % power) and emits one item when progress >= 1. With productivity, a second bar fills and emits bonus items.
* Output: the item is placed **directly** (no inserter) onto whatever occupies the output tile - a belt, a chest, a furnace/assembler input, a wagon. On a belt running across the drill's front the item lands on the **near lane** (the lane on the drill's side): the output vectors put the item only 0.35 tile (electric, {0,-1.85} with the 3x3 edge at -1.5) or 0.3 tile (burner, {-0.35,-1.3} with the 2x2 edge at -1.0) into the front tile. Two rows of drills facing each other across one belt therefore fill both lanes; a belt running away from the drill receives the item on the lane matching that offset. If the output tile is blocked (belt lane full, chest full) the drill pauses with its item held ("Yellow light = The drill's ability to dispense resources is blocked"). If the output tile is empty ground the item is dropped on the ground and the drill then waits.
* Burner drill fuel: burns 150 kW only while mining; it does **not** refuel itself; two burner drills facing each other on coal refuel each other, or a belt + burner inserter does.
* Ore amounts per tile (richness): map-generation constants from `resource-autoplace.lua`: total ore guaranteed in the starting area = `40000 x base_density` (x size and half-weighted frequency sliders) with base densities iron 10, copper 8, coal 8, stone 4 -> roughly **400 k iron, 320 k copper, 320 k coal, 160 k stone** in the start patches at default settings; `starting_resource_placement_radius = 120` tiles; patch radius scales with the cube root of the patch quantity (`rq_factor` 1/7 x 1.5 for starting iron); regular patches fade in from 300 tiles out and double their density by 1300 tiles further out; beyond that the per-tile richness multiplier keeps rising. Players report about 2000 ore/tile near spawn on richest settings and 100 k+ per tile far away (https://forums.factorio.com/viewtopic.php?t=40210). Practical clone values: a few hundred to ~1500 ore per tile near spawn, denser towards the centre of a patch. Richness slider: "If richness is set to 200%, each ore tile and oil field contains about double the amount." Uranium and oil never spawn in the starting area.

---

## 4. Electric network

### 4.1 Core accounting model

Source: https://wiki.factorio.com/Electric_system , https://lua-api.factorio.com/latest/types/ElectricEnergySource.html , https://lua-api.factorio.com/latest/types/ElectricUsagePriority.html .

* Energy is tracked per tick in joules (1 J/tick = 60 W). Every electric consumer has an energy buffer; each tick it asks the network for enough energy to fill it (its rated usage/60 plus drain/60). `drain` is "How much energy (per second) will be continuously removed from the energy buffer" even when idle; for machines the default drain is 1/30 of energy usage (assembling machine 1: 75 kW usage + 2.5 kW drain; assembling machine 2: 150 + 5 kW = 155 kW shown in the wiki). Inserters and pumps have explicit drains (2.8, 5.1).
* A machine only works when its buffer has the energy for the tick; the fraction it receives scales its speed (4.5).
* Priorities (`usage_priority` values): `primary-input` (laser turrets, rocket silo - "the most important machines"), `secondary-input` (all normal machines), `secondary-output` (steam engines/turbines), `tertiary` (accumulators, both charge and discharge), `solar` (solar panels), `lamp`.

### 4.2 Poles, wire reach and supply area

Source: https://wiki.factorio.com/Small_electric_pole , https://wiki.factorio.com/Medium_electric_pole , https://wiki.factorio.com/Big_electric_pole , https://wiki.factorio.com/Substation , https://wiki.factorio.com/Electric_system , prototypes `maximum_wire_distance` / `supply_area_distance`.

| Pole | Footprint | Wire reach (tiles, centre to centre) | Supply area (`supply_area_distance` = half-width) | Health | Tech | Recipe (0.5 s) |
|---|---|---|---|---|---|---|
| Small electric pole | 1x1 | 7.5 | 5x5 (2.5) | 100 | none | 2 copper cable + 1 wood -> 2 |
| Medium electric pole | 1x1 | 9 | 7x7 (3.5) | 100 | Electric energy distribution 1 | 2 copper cable + 4 iron stick + 2 steel plate -> 1 ([1.1]: 2 copper plate instead of cables) |
| Big electric pole | 2x2 | 32 (2.0); **30** [1.1] | 4x4 (2) | 150 | Electric energy distribution 1 | 4 copper cable + 8 iron stick + 5 steel plate -> 1 ([1.1]: 2 copper plate) |
| Substation | 2x2 | 18 | 18x18 (9) | 200 | Electric energy distribution 2 | 5 advanced circuit + 6 copper cable + 10 steel plate -> 1 ([1.1]: 5 copper plate) |

Rules:
* Two poles connect if their centre distance is within the wire reach of **both** poles. A newly placed pole auto-connects to the closest poles first, will not form a triangle of three mutually connected poles, and has at most 5 auto-connections. Connected poles form one **electric network**; all generators and consumers whose supply-area-covered tiles belong to poles of the same network are pooled.
* A consumer/generator is powered when **any tile of its collision box overlaps the supply area square** of any pole of the network. Supply area is centred on the pole (an odd square for 1x1 poles, even square for 2x2 poles).
* Networks with no wire between them are independent (accumulators can be used to bridge/isolate).

### 4.3 Steam power chain

Source: https://wiki.factorio.com/Offshore_pump , https://wiki.factorio.com/Boiler , https://wiki.factorio.com/Steam_engine , https://wiki.factorio.com/Steam , https://wiki.factorio.com/Power_production , prototype files.

| Entity | Footprint | Key numbers | Fluid connections (facing north) | Health | Recipe |
|---|---|---|---|---|---|
| Offshore pump | 1x1 on the shore with water required in the 2 tiles in front ([1.1]: 1x2) | `pumping_speed = 20` units/tick = **1200 water/s**, no energy needed (2.0 prototype has `energy_usage 60kW` with a `void` energy source), fluid box 100, supply is infinite | output at the back: 2.0 `position {0,0} direction south`; [1.1] `{0, 1}` | 150 | 0.5 s; 2 iron gear wheel + 3 pipe -> 1 ([1.1]: 2 electronic circuit + 1 iron gear wheel + 1 pipe) |
| Boiler | 3 wide x 2 tall (`collision_box {{-1.29,-0.79},{1.29,0.79}}`) | consumes **1.8 MW** of fuel (burner, effectivity 1, 1 fuel slot, 30 pollution/min); heats water to **165 C**; produces **60 steam/s**; water in: **6/s** in 2.0 ("1 Water will now produce 10 Steam" since 2.0.7, 300 kJ per water unit) / **60/s** [1.1] (1 water -> 1 steam); both fluid boxes volume 200 (1.1: base_area 1, height 2) | water: both short ends of the bottom row, pass-through (`input-output`): 2.0 `{-1,0.5} west` and `{1,0.5} east`; [1.1] `{-2,0.5}` and `{2,0.5}`; steam output top centre: 2.0 `{0,-0.5} north`, [1.1] `{0,-1.5}` | 200 | 0.5 s; 4 pipe + 1 stone furnace -> 1 |
| Steam engine | 3 x 5 (`collision_box {{-1.25,-2.35},{1.25,2.35}}`), rotatable in 2 directions | `fluid_usage_per_tick = 0.5` = **30 steam/s** max; `maximum_temperature = 165`, `minimum_temperature = 100`; effectivity 1 -> **900 kW** max; `usage_priority secondary-output`; fluid box 200 | steam in/out at both short ends (chainable): 2.0 `{0,-2} north` and `{0,2} south`; [1.1] `{0,-3}` and `{0,3}` | 400 | 0.5 s; 8 iron gear wheel + 10 iron plate + 5 pipe -> 1 |

Energy bookkeeping: steam stores 200 J per unit per degree C above 15 C, so 165 C steam carries **30 kJ/unit**; 30 units/s x 30 kJ = 900 kW. Boiler: 1.8 MW / 30 kJ = 60 steam/s. Steam hotter than 165 C gives a steam engine no extra power (excess is wasted). Ratios: **1 boiler : 2 steam engines**; [1.1] **1 offshore pump : 20 boilers : 40 engines**; 2.0 **1 : 200 : 400**. A yellow belt of coal (15/s x 4 MJ = 60 MW) feeds 33.3 boilers. A boiler burns one coal every 2.22 s at full load.

Dynamic behaviour: steam engines "automatically adjust their power production and steam usage based on the current demands" - they consume only as much steam per tick as the network asks of them (demand share / 900 kW x 0.5 units), and boilers only burn fuel while their steam output box has room, so a lightly loaded plant burns fuel proportionally. Boiler heating progress: convert water to steam as long as there is water in the input box and room in the output box, consuming 1.8 MW/60 = 30 kJ per tick of fuel energy for 1 steam unit (2.0: 0.1 water) per tick.

### 4.4 Solar panels, accumulators, day/night

Source: https://wiki.factorio.com/Solar_panel , https://wiki.factorio.com/Accumulator , https://wiki.factorio.com/Time , https://wiki.factorio.com/Power_production , prototypes.

| Entity | Footprint | Numbers | Health | Recipe |
|---|---|---|---|---|
| Solar panel | 3x3 | `production = 60kW` peak, **42 kW average** over a Nauvis day; `usage_priority solar`; no pollution | 200 | 10 s; 5 copper plate + 15 electronic circuit + 5 steel plate -> 1 |
| Accumulator | 2x2 | `buffer_capacity = 5 MJ`, `input_flow_limit = output_flow_limit = 300 kW`, `usage_priority tertiary` | 150 | 10 s; 5 battery + 2 iron plate -> 1 |

Day/night (Nauvis defaults): a full day is **25200 ticks = 420 s = 7 minutes**; time of day `t = (tick mod 25200) / 25200`:

| Phase | t start | t end | Ticks | Seconds | Solar output |
|---|---|---|---|---|---|
| day | 0.75 | 0.25 (wrapping) | 12600 | 210 | 100 % |
| sunset (dusk) | 0.25 | 0.45 | 5040 | 84 | linear 100 % -> 0 % |
| night | 0.45 | 0.55 | 2520 | 42 | 0 % |
| sunrise (dawn) | 0.55 | 0.75 | 5040 | 84 | linear 0 % -> 100 % |

Average = 60 kW x (210 + 42 + 42)/420 = 42 kW. Ratio for constant output through the night: **0.84 accumulators per solar panel** (about 21 : 25), and 23.8 panels per MW of average demand ("20:24:1 accumulators : panels : MW").

Accumulator behaviour: "stores a limited amount of energy when available production exceeds demand, and releases it in the opposite case"; lower delivery priority than any other source, so it charges only from surplus and discharges only when solar + generators cannot meet demand; charge/discharge each capped at 300 kW (5 kJ per tick). A network can hold both charging and discharging accumulators only if they are on different networks.

### 4.5 Per-tick network resolution ("satisfaction")

Source: https://wiki.factorio.com/Electric_system ("Electricity is provided on a priority basis"), https://wiki.factorio.com/Accumulator , forum threads on satisfaction (https://forums.factorio.com/viewtopic.php?t=78674).

Generation priority order (wiki): 1. solar panels at their current output; 2. (Space Age lightning); 3. steam engines / turbines / fusion, sharing the remaining demand **equally** among themselves; 4. accumulators, last resort. Consumers: `primary-input` machines are served before `secondary-input` ones. Per tick, for one network:

1. Demand `D` = sum over consumers of (energy they can still fit in their buffer this tick, normally usage/60 + drain/60).
2. Available supply: `S_solar` = sum of panel output x daylight factor / 60 (produced whether used or not); `S_gen` = sum over engines of min(900 kW/60, steam available x 30 kJ); `S_acc` = sum over accumulators of min(stored, 300 kW/60).
3. Deliver to consumers: `delivered = min(D, S_solar + S_gen + S_acc)`, drawing solar first, then generators (equal share of what is still needed, capped per engine, steam consumed accordingly), then accumulators.
4. **Satisfaction** = delivered / D (shown green at 100 %, yellow below, red at 0). When production is short, "the electricity will be evenly spread across all machines in the network (based on each machine's demand), and all machines will slow down proportionally to the power available." Wiki example: 300 kW demand and 180 kW supply -> every machine runs at 60 % speed (crafting progress, mining progress, inserter rotation per tick are multiplied by satisfaction). Drain is still taken, so a heavily browned-out machine may make no progress at all.
5. Surplus: if `S_solar + S_gen_capacity > D`, accumulators charge with the surplus, each capped at 300 kW (5 kJ/tick) and by its remaining capacity; unused solar output is simply lost; steam engines throttle so no steam is consumed for unneeded energy.

Consumer reference values (electric, normal quality): assembling machine 1 75 kW + 2.5 kW drain (crafting speed 0.5), assembling machine 2 150 kW + 5 kW (0.75), assembling machine 3 375 kW + 12.5 kW (1.25), electric furnace 180 kW (speed 2), lab 60 kW, electric mining drill 90 kW, pump 29 kW + 1 kW drain, radar 300 kW, inserters see 2.1. Burner machines: stone furnace 90 kW (speed 1, pollution 2/min), steel furnace 90 kW (speed 2), burner drill 150 kW, boiler 1.8 MW.

---

## 5. Fluids

### 5.1 Fluid entities

Source: https://wiki.factorio.com/Pipe , https://wiki.factorio.com/Pipe_to_ground , https://wiki.factorio.com/Storage_tank , https://wiki.factorio.com/Pump , prototypes.

| Entity | Footprint | Capacity (units) | Other | Health | Recipe |
|---|---|---|---|---|---|
| Pipe | 1x1 | 100 | connects on all 4 sides to any adjacent fluid connection | 100 | 0.5 s; 1 iron plate -> 1 |
| Pipe to ground | 1x1 (pair) | 100 per pair total ("the gap does not store any fluids") | `max_underground_distance = 10` -> up to 9 free tiles between the two ends; connects only front (to the pair) and back | 150 | 0.5 s; 5 iron plate + 10 pipe -> 2 |
| Storage tank | 3x3 | 25 000 | 4 connections (one per side, at alternating corners) | 500 | 3 s; 20 iron plate + 5 steel plate -> 1 |
| Pump | 1x2 | 400 (2.0) | `pumping_speed = 20`/tick = **1200/s** in 2.0; [1.1] 200/tick = **12000/s**; 29 kW + 1 kW drain (wiki: 30 kW); one-way "diode", blocks back-flow; connects only front and back; circuit-controllable | 180 | 2 s; 1 engine unit + 1 pipe + 1 steel plate -> 1 |
| Offshore pump / boiler / steam engine | see 4.3 | 100 / 200+200 / 200 | | | |

General rules: a pipe network (segment) can contain only **one fluid type** at a time; placing a pipe that would connect two different fluids fails ("the pipe won't be placed"); a fluid can be flushed (deleted) from the GUI. Fluids have a temperature (default 15 C; boiler steam 165 C; heat-exchanger steam 500 C); mixing temperatures averages by volume. Barrels can carry every base fluid except steam.

### 5.2 Factorio 2.0 fluid model (recommended for a clone)

Source: https://wiki.factorio.com/Fluid_system (2.0 text), https://www.factorio.com/blog/post/fff-416 .

* "Pipes, underground pipes, and storage tanks are merged into fluid segments." A segment stores one number (amount) and one fluid type/temperature; "Fluid pushed to a segment will be immediately available at any point along a segment." There is "no longer a realistic fluid flow through pipes"; distance does not matter as long as the segment's bounding box stays within **320 x 320 tiles** (10 x 10 chunks); beyond that a pump is needed.
* All containers in a segment are always filled to the **same percentage** (12 550 units in a 25 000 tank + 100 pipe -> 50 % each: 12 500 + 50).
* Each machine connection can move at most **100 units per tick = 6000/s** (theoretical); in practice about **4200/s** because a machine's pull rate scales with the segment's fill level: "if a segment is half full, then the pulling rate is half of the maximum". Machines push into a segment at unlimited rate while there is room.
* Pumps split segments and act as one-way valves; a pump directly attached to a tank can pull at its full rate.
* Boiler/steam engine placement: the boiler's two water ends chain boilers side by side; its steam outlet feeds a line of engines end to end (each engine passes steam through to the next).

### 5.3 Factorio 1.1 fluid model (only if 1.1 fidelity is wanted)

Source: https://wiki.factorio.com/index.php?title=Fluid_system&oldid=195623 (December 2023 revision), https://forums.factorio.com/viewtopic.php?t=103145 .

* Every pipe/machine fluid box has its own level; "all connected tanks and pipes are treated as a single vessel in that the level of fluid must be equal in all parts"; "the flow rate between pipes is dependent on pressure (the difference in level between the adjacent entities)". The engine evaluates one fluid box and its neighbours at a time (build-order dependent), each tick moving `(level_A - level_B) x 0.4 + previous_flow x 0.59`, capped at the box capacity per tick (100 for a pipe = 6000/s), with a small inertia term. Pumps (12000/s) ignore the balance and block back-flow.
* Resulting maximum throughput between two pumps as a function of pipe count (wiki table, u/s): 0 pipes 12000; 1: 6000; 2: 3000; 3: 2250; 4: 1909; 5: 1714; 6: 1588; 7: 1500; 8: 1434; 9: 1384; 10: 1344; 11: 1312; 12: 1285; 17: 1200; 20: 1169; 30: 1112; 50: 1067; 100: 1033; 150: 1022; 200: 1004; 201: 999; 261: 799; 300: 707; 400: 546; 500: 445; 600: 375; 800: 286; 1000: 230. Formulas: `1 <= pipes < 197: flow = 10000 / (3 x pipes - 1) + 1000`; `pipes >= 197: flow = 240000 / (pipes + 39)`. Practical consequence in 1.1: one offshore pump (1200/s) can feed its 20 boilers through up to 17 pipes; two boilers in series between pumps halve the flow (6000).
* 1.1 fluid boxes were defined by `base_area`, `height`, `base_level` (pipe: base_area 1, capacity = base_area x height x 100 = 100; tank base_area 250 -> 25 000; boiler input base_level -1 (pulls), output base_level +1 (pushes)).

---

## 6. Related container/machine facts needed by the inserter and drill logic

Source: https://wiki.factorio.com/Wooden_chest , https://wiki.factorio.com/Iron_chest , https://wiki.factorio.com/Steel_chest , https://wiki.factorio.com/Stone_furnace , https://wiki.factorio.com/Assembling_machine_1 , https://wiki.factorio.com/Gun_turret , prototypes.

| Entity | Footprint | Slots / relevant numbers | Health | Recipe |
|---|---|---|---|---|
| Wooden chest | 1x1 | 16 slots | 100 | 0.5 s; 2 wood -> 1 |
| Iron chest | 1x1 | 32 slots | 200 | 0.5 s; 8 iron plate -> 1 |
| Steel chest | 1x1 | 48 slots | 350 | 0.5 s; 8 steel plate -> 1 |
| Stone furnace | 2x2 | 1 input slot, 1 output slot, 1 fuel slot; crafting speed 1; 90 kW burner; smelting recipes 3.2 s (iron/copper plate, stone brick), 16 s (steel from 5 iron plate); pollution 2/min | 200 | 0.5 s; 5 stone -> 1 |
| Assembling machine 1 | 3x3 | crafting speed 0.5; 75 kW + 2.5 kW drain; 0 module slots; cannot use fluids; ingredient slots hold more than a stack when the recipe needs it | 300 | 0.5 s; 3 electronic circuit + 5 iron gear wheel + 9 iron plate -> 1 |
| Gun turret | 2x2 | range 18; ammo slot; inserters add at most 10 magazines; rotation_speed 0.015 | 400 | 8 s; 10 copper plate + 10 iron gear wheel + 20 iron plate -> 1 |
| Lab | 3x3 | 60 kW; researching_speed 1; 2 module slots | 150 | - |

---

## 7. Minimal faithful ruleset for a browser clone (summary of the above, no code)

1. **Tick** at 60 Hz; belts move items 8/16/24 positions of 256 per tile per tick; two lanes per tile; items are points spaced >= 64 positions; lane lengths 256 straight, 106 inner / 295 outer on curves; items stop at belt ends; a tile with one side feeder and no back feeder is a curve, otherwise side feeders dump both their lanes onto the target's near lane; underground belts pair same-tier ends up to 4/6/8 tiles apart and their exposed halves accept only one side-loaded lane; splitters alternate per lane per item, preserve lanes, send everything to the free side when one side is blocked, and support input/output priority and one filter.
2. **Inserters** pick from the tile behind and drop on the tile in front (2 tiles for long-handed), drop on the far lane (right lane if parallel), pick the near lane first, take only items the target accepts, respect the insertion limit (`max(2, min(100, 1 + ceil(1.166 s / craft time)))` crafts of ingredients; 5 fuel; 10 magazines), swing with 0.5/rotation_speed ticks per half turn (0.013/0.014/0.02/0.04/0.04 rotations per tick), carry a hand of 1 item (bulk 2, growing with research), draw drain + per-movement energy, and burner ones burn 50 kJ per movement and refuel themselves.
3. **Drills** mine `mining_speed / mining_time` items per second (0.25 burner, 0.5 electric) from tiles in a 2x2 / 5x5 area, subtract 1 ore per item from a tile, and place output directly on the tile in front (electric: centre column; burner: left column), pausing when it is blocked.
4. **Electric network**: poles connect within the smaller wire reach (7.5 / 9 / 30-32 / 18), power entities overlapping their 5x5 / 7x7 / 4x4 / 18x18 supply squares; per tick sum demand, supply solar -> steam engines (equal share, 900 kW each from 30 steam/s at 165 C, fed by boilers burning 1.8 MW for 60 steam/s from an offshore pump's 1200 water/s) -> accumulators (5 MJ, 300 kW); satisfaction = delivered/demand scales every machine's progress; surplus charges accumulators; solar follows the 25200-tick day (210 s full, 84 s ramps, 42 s dark).
5. **Fluids**: treat every connected run of pipes/tanks as one segment with a single amount (100 per pipe, 25 000 per tank), one fluid type, instant availability, 100 units per tick per machine connection, and pumps (1200/s) as one-way segment boundaries.

---

## 8. Sources

Official wiki (primary):
* https://wiki.factorio.com/Belt_transport_system
* https://wiki.factorio.com/Transport_belts/Physics
* https://wiki.factorio.com/Transport_belt , https://wiki.factorio.com/Fast_transport_belt , https://wiki.factorio.com/Express_transport_belt
* https://wiki.factorio.com/Underground_belt , https://wiki.factorio.com/Fast_underground_belt , https://wiki.factorio.com/Express_underground_belt
* https://wiki.factorio.com/Splitter , https://wiki.factorio.com/Fast_splitter , https://wiki.factorio.com/Express_splitter
* https://wiki.factorio.com/Inserters (2.0) and https://wiki.factorio.com/index.php?title=Inserters&oldid=198466 (1.1-era revision)
* https://wiki.factorio.com/Burner_inserter , https://wiki.factorio.com/Inserter , https://wiki.factorio.com/Long-handed_inserter , https://wiki.factorio.com/Fast_inserter , https://wiki.factorio.com/Bulk_inserter , https://wiki.factorio.com/Filter_inserter , https://wiki.factorio.com/Stack_inserter
* https://wiki.factorio.com/Inserter_capacity_bonus_(research)
* https://wiki.factorio.com/Burner_mining_drill , https://wiki.factorio.com/Electric_mining_drill , https://wiki.factorio.com/Mining , https://wiki.factorio.com/Map_generator , https://wiki.factorio.com/Iron_ore , https://wiki.factorio.com/Coal
* https://wiki.factorio.com/Electric_system , https://wiki.factorio.com/Power_production
* https://wiki.factorio.com/Offshore_pump , https://wiki.factorio.com/Boiler , https://wiki.factorio.com/Steam_engine , https://wiki.factorio.com/Steam , https://wiki.factorio.com/Fuel
* https://wiki.factorio.com/Small_electric_pole , https://wiki.factorio.com/Medium_electric_pole , https://wiki.factorio.com/Big_electric_pole , https://wiki.factorio.com/Substation
* https://wiki.factorio.com/Solar_panel , https://wiki.factorio.com/Accumulator , https://wiki.factorio.com/Time
* https://wiki.factorio.com/Fluid_system (2.0) and https://wiki.factorio.com/index.php?title=Fluid_system&oldid=195623 (1.1-era revision)
* https://wiki.factorio.com/Pipe , https://wiki.factorio.com/Pipe_to_ground , https://wiki.factorio.com/Storage_tank , https://wiki.factorio.com/Pump
* https://wiki.factorio.com/Wooden_chest , https://wiki.factorio.com/Iron_chest , https://wiki.factorio.com/Steel_chest , https://wiki.factorio.com/Stone_furnace , https://wiki.factorio.com/Assembling_machine_1 , https://wiki.factorio.com/Gun_turret

Prototype data and API docs:
* https://github.com/wube/factorio-data (files `base/prototypes/entity/entities.lua`, `transport-belts.lua`, `mining-drill.lua`, `resources.lua`, `turrets.lua`, `base/prototypes/technology.lua`, `core/lualib/resource-autoplace.lua`; `master` for 2.0 and tag `1.1.110` for 1.1)
* https://lua-api.factorio.com/latest/prototypes/InserterPrototype.html
* https://lua-api.factorio.com/latest/prototypes/MiningDrillPrototype.html
* https://lua-api.factorio.com/latest/prototypes/TransportBeltConnectablePrototype.html
* https://lua-api.factorio.com/latest/prototypes/UndergroundBeltPrototype.html
* https://lua-api.factorio.com/latest/types/ElectricEnergySource.html
* https://lua-api.factorio.com/latest/types/ElectricUsagePriority.html

Complementary:
* https://www.factorio.com/blog/post/fff-276 (belt item spacing)
* https://www.factorio.com/blog/post/fff-416 (Fluids 2.0)
* https://forums.factorio.com/viewtopic.php?t=103145 (1.1 pipe throughput measurements)
* https://forums.factorio.com/viewtopic.php?t=26645 (inserter far-lane behaviour)
* https://forums.factorio.com/viewtopic.php?t=40210 (ore richness by distance)
* https://robbieg8s.wordpress.com/2020/01/24/factorio-inserter-mechanics/ (tick-level inserter-to-belt timing)
