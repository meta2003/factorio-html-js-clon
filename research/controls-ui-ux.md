# Factorio – Controls, UI and UX conventions (research facet: `controls-ui-ux`)

Scope: default PC key bindings, mouse/modifier conventions, character stats, inventory / crafting / quickbar GUIs, every early-game entity GUI, tooltips, map & minimap, alerts, placement rules, and the visual conventions (tile size, animations, colours) needed to build a faithful browser clone. Values are Factorio 1.1 / 2.0 base game (Space Age-only content is marked). Prototype numbers were taken from the official `wube/factorio-data` repository (master = 2.0); wiki pages are cited per table.

Units: 1 tile = 1 m; the game runs at 60 ticks per second (all "per tick" values × 60 = per second).

---

## 1. Core world/rendering constants

| Constant | Value | Source |
|---|---|---|
| Ticks per second (UPS) | 60 | (engine constant, used everywhere in prototypes) |
| Tile size at zoom 1.0 (normal-res sprites) | 32 × 32 px (high-res sprites are 64 px drawn at scale 0.5) | https://lua-api.factorio.com/latest/types/SpriteParameters.html , https://forums.factorio.com/viewtopic.php?t=80720 |
| Default world zoom | 1.0 (F9 snaps back to it in debug; Shift+F9 = 2×) | https://forums.factorio.com/viewtopic.php?t=117775 |
| Minimum world zoom (max zoom-out) in freeplay | 0.3 (map editor allows 0.1) | https://forums.factorio.com/viewtopic.php?t=125041 |
| Default map-view zoom | ≈ 0.031; map labels hide below ≈ 0.0157 | https://forums.factorio.com/viewtopic.php?t=47850 |
| Chunk | 32 × 32 tiles (1024 tiles); map generated chunk by chunk, 20 chunks around each player | https://wiki.factorio.com/Map_structure (redirect of /Chunk) |
| Max map | 2,000,000 × 2,000,000 tiles | same |
| View | top-down 2-D, 45°-ish "2.5-D" sprites, north = up, entity coordinates are tile centres (odd-sized entities) or tile corners (even-sized entities) | (engine convention) |
| Directions | 16-way `defines.direction`: 0 = north, 4 = east, 8 = south, 12 = west (most buildings only use these 4; belts/rails use 8) | https://lua-api.factorio.com/latest/defines.html |
| GUI slot size | 40 × 40 px; inventory grids are 10 slots wide (`slot_table_column_count = 10`, `slot_table_width = 400`) | `core/prototypes/style.lua` (factorio-data) |
| Entity GUI preview button | 400 × 152 px (10 slots wide × 4 slots high − 8) | `core/prototypes/style.lua` |

---

## 2. Player character

Source: https://wiki.factorio.com/Player and prototype `character` in `base/prototypes/entity/entities.lua` (factorio-data master).

| Property | Prototype value | Derived / wiki value |
|---|---|---|
| Max health | 250 (`max_health`) | +50 per "Health" research level (wiki) |
| Health regeneration | `healing_per_tick = 0.15` | 9 HP/s (2.0 data; wiki text still says 6 HP/s); starts a few seconds after last damage |
| Running speed | `running_speed = 0.15` tiles/tick | 9 tiles/s (wiki quotes 8.9 tiles/s ≈ 32 km/h) |
| Mining speed | `mining_speed = 0.5` | hand-mines 1 s ore in 2 s (see §5) |
| Crafting speed | 1 (CharacterPrototype default `crafting_speed = 1`) | hand-craft time = recipe time |
| Build distance | `build_distance = 10` tiles | can place entities up to 10 tiles away (was 6 before 0.17) |
| Reach distance (interact/open GUIs, mine entities) | `reach_distance = 10` | |
| Reach for resources (hand-mining ore/trees/rocks) | `reach_resource_distance = 2.7` | |
| Drop item distance (Z) | `drop_item_distance = 10` | |
| Item pickup distance (F / auto pickup) | `item_pickup_distance = 1`, `loot_pickup_distance = 2` | |
| Main inventory | `inventory_size = 80` | +10 Toolbelt research; modular armor 90, power armor 100, MK2 110 |
| Gun slots / ammo slots / armor slot | 3 / 3 / 1 (`guns_inventory_size` default 3) | |
| Collision box | {{-0.2,-0.2},{0.2,0.2}} (0.4 × 0.4 tile) | 1×1 for placement purposes |
| Selection box | {{-0.4,-1.4},{0.4,0.2}} (0.8 wide × 1.6 tall) | |
| Vision | reveals 5 × 5 chunks around the character continuously | wiki |
| Flashlight | light `intensity 0.4, size 25` – auto on at night | |
| Combat timers | `ticks_to_keep_gun 600`, `ticks_to_keep_aiming_direction 100`, `ticks_to_stay_in_combat 600` | 10 s / 1.67 s / 10 s |
| Damage tint | `{0.12, 0, 0, 0}` (red flash) | |
| Crafting categories | `{"crafting", "hand-crafting"}` (NOT `smelting`, `crafting-with-fluid`, `advanced-crafting`) | this is why ores, fluids, engine units can't be hand-crafted |
| Mining categories | `{"basic-solid"}` | can't hand-mine crude oil / uranium (needs acid) |
| Respawn time | 10 s (default) | https://lua-api.factorio.com/latest/prototypes/CharacterPrototype.html |
| Animation | idle 22 frames × 8 directions at 0.15 frames/tick; running 22 frames × 8 directions at 0.6 frames/tick (≈37 ticks per loop); with gun 18 directions | `base/prototypes/entity/character-animations.lua` |

---

## 3. Default PC controls (Factorio 2.0; 1.1 identical unless noted)

Source: https://wiki.factorio.com/Keyboard_bindings , https://wiki.factorio.com/Tutorial:Keyboard_shortcuts , https://wiki.factorio.com/Tutorial:Quick_start_guide

### 3.1 Movement & basic interaction

| Action | Default | Notes |
|---|---|---|
| Move up / left / down / right | W / A / S / D | 8-directional; diagonal speed is normalised |
| Mine (resource, tree, rock, or pick up a built entity) | **hold Right mouse button** | 1.1 wiki tutorial: "Hold right mouse button over resources to gather them". (The 2.0 bindings table lists "Mine" under the same slot.) A circular progress indicator fills over the cursor while mining. |
| Build / place item in cursor | **Left mouse button** | Left-click with a placeable item in the cursor; hold and drag to place lines |
| Open entity GUI | Left click on the entity (empty cursor) | Only entities with a GUI (furnace, chest, assembler, …) |
| Build ghost | Shift + Left click | Places a blue translucent ghost instead of the real entity |
| Force build (mark trees/rocks/cliffs in the way for deconstruction) | Shift held while placing blueprints | |
| Super-forced build (mark colliding *buildings* for deconstruction too) | Ctrl + Shift + Left click | 2.0 |
| Rotate | R (clockwise), Shift + R (counter-clockwise) | Works on the item in cursor and on already-built entities under the cursor; also reverses undergrounds, pumps, locomotives; on assembling machine 2/3 rotates the fluid input position |
| Flip horizontal / vertical (blueprints, some entities) | H / V | 2.0 |
| Pipette | Q | With empty cursor: grabs the hovered entity's item (from inventory, or a ghost-item if none available / setting enabled). Over a resource tile it picks a mining drill. Over a ghost it picks the ghost's item; pressing again revives the ghost. With a full cursor: **clears the cursor** (returns item to inventory) |
| Clear cursor | Q | same key |
| Pick up items from ground | F (hold) | picks up items within 1 tile (loot 2 tiles) |
| Drop one item from cursor | Z | drops on ground / belt in front (up to 10 tiles) |
| Toggle Alt-mode ("Show info") | Alt | see §7 |
| Open character screen (inventory + crafting) | E | E also **closes** any open GUI and confirms windows |
| Close GUI / open main menu | Esc | Esc closes the topmost GUI; with none open it opens the pause/main menu |
| Technology screen | T | |
| World map | M (or Tab in 2.0) | |
| Production statistics | P | |
| Logistic networks | L | |
| Blueprint library | B | |
| Train overview | O | |
| Toggle console / chat | ` (grave) | |
| Shoot nearest enemy / shoot selected | Space / Shift + Space | |
| Next weapon | C | |
| Enter/leave vehicle | Enter | |
| Zoom in / out | Mouse wheel up / down | |
| Pause | Pause | Shift+Space in 2.0 pauses with tile grid visible |
| Undo / Redo | Ctrl + Z / Ctrl + Y (or Ctrl + Shift + Z) | works for building, deconstruction orders, ghosts |
| Copy / Cut / Paste (blueprint clipboard) | Ctrl + C / Ctrl + X / Ctrl + V | drag a box to copy; paste places ghosts |
| Copy entity settings / Paste entity settings | Shift + Right click / Shift + Left click | recipes, filters, circuit settings, train schedules; hold paste and drag over many entities |
| Toggle rail layer | G | 2.0 |
| Factoriopedia | Alt + Left click on any item/entity/recipe | 2.0 |
| Larger / smaller tile brush (landfill, concrete) | Numpad + / Numpad − | 1×1 … 10×10 |
| Make blueprint / deconstruction planner / upgrade planner | Alt + B / Alt + D / Alt + U | |
| Toggle personal roboport / exoskeleton / logistics | Alt + F / Alt + E / Alt + L | |
| Red / green / copper wire | Alt + R / Alt + G / Alt + C | 2.0 (1.1 used wire items) |
| Character tabs | F1 logistics, F2 character info, F3 crafting | 2.0 |
| Activate tooltip ("?" extended tooltip) | Shift (hold while hovering) | |
| Scroll tooltip | Shift + wheel | |
| Rotate active quickbars | X | |
| Quickbar shortcut 1–10 | 1 2 3 4 5 6 7 8 9 0 | |
| Select quickbar page 1–10 | Shift + 1 … Shift + 0 | |
| Focus search | Ctrl + F | in crafting / tech screens |

### 3.2 Inventory / cursor operations (mouse + modifiers)

Source: https://wiki.factorio.com/Keyboard_bindings (Inventory operations), https://wiki.factorio.com/Tutorial:Keyboard_shortcuts , https://wiki.factorio.com/Tutorial:Quick_start_guide

| Action | Input | Behaviour |
|---|---|---|
| Pick up / put down a stack | Left click on slot | Cursor holds a stack; left click on an empty slot puts it down; on a same-item slot merges; on a different item swaps |
| Take half of a stack into cursor | Right click on slot ("cursor split") | takes ceil(n/2) |
| Put one item from cursor into slot | Right click with cursor full | |
| Stack transfer (move whole stack to the *other* open inventory) | Shift + Left click | e.g. from player inventory into chest/furnace/assembler and back. Shift-click in the crafting panel crafts "all". |
| Stack split transfer (move half a stack across) | Shift + Right click | |
| Inventory transfer (move **all items of that type**) | Ctrl + Left click on a stack | "ctrl-click for everything"; Ctrl + Left click on an *empty* slot moves the entire inventory across |
| Inventory split (half of all of that type) | Ctrl + Right click | |
| Fast entity transfer (no GUI open) | Ctrl + Left click on an entity in the world | Empty hand: grabs the entity's contents (furnace output, lab packs, chest). Item in hand: inserts as much as possible (fuel goes to fuel slot, ore to input, ammo to turret). Hold and drag over many entities. |
| Fast entity split | Ctrl + Right click on entity | same with half |
| Set / toggle slot filter | Middle mouse button on inventory slot | also car trunks, wagons |
| Copy / paste inventory filter | Shift + Right / Shift + Left click | |
| Open item's own GUI (blueprint, book, planner) | Right click on the item | |
| Drag-distribute | hold Left click with stack in cursor and drag over slots/entities | evenly splits the stack across entities |
| Craft 1 / 5 / all | Left / Right / Shift + Left click on recipe | see §6 |
| Cancel 1 / 5 / all queued crafts | Left / Right / Shift + Left click on queue icon | |

### 3.3 Selection tools (blueprint, deconstruction planner, upgrade planner)

| Action | Input |
|---|---|
| Select area | hold Left click and drag |
| Alternative select (deconstruction: cancel; blueprint: only whitelist) | Shift + Left drag |
| Reverse select (deconstruction: only trees/rocks) | Right drag (2.0 "Reverse select") |
| Super-forced deconstruction | Ctrl + Shift + Left drag |
| Cancel current tool | Q |

Source: https://wiki.factorio.com/Deconstruction_planner , https://wiki.factorio.com/Blueprint

---

## 4. Cursor & placement conventions

Sources: https://wiki.factorio.com/Tutorial:Quick_start_guide , https://wiki.factorio.com/Tutorial:Keyboard_shortcuts , https://wiki.factorio.com/Ghost , https://wiki.factorio.com/Blueprint , https://forums.factorio.com/viewtopic.php?t=26520 , prototype data.

* Selecting a placeable item (click it in inventory/quickbar) puts it in the **cursor**; the cursor shows the item icon with its count. Moving over the world shows a **placement preview** of the entity, snapped to the tile grid: **green** tint/outline = can build, **red** = blocked. Even-sized entities (2×2 boiler side, 2×2 turret) snap to tile corners; odd-sized (1×1, 3×3) snap to tile centres.
* Left click builds one; **hold left click and move** to drag-build a line: belts follow the mouse and auto-turn corners; **electric poles** drag-place automatically at maximum wire reach (and earlier if an unpowered entity needs power); underground belts/pipes auto-place pairs at max distance; pipes and walls chain. Ctrl + Left click = "build with obstacle avoidance" (2.0).
* Rotation state (R) is remembered per item type while it is in the cursor.
* **Ghosts** (Shift + click, blueprint paste, copy-paste, or an entity dying after Construction robotics research): semi-transparent blue marker. Constants: shader ghost tint RGBA(147,168,255,77) (shader-less RGBA(15,133,255,112)), tile ghost RGBA(46,153,242,255), ghost map colour (0.57,0.38,0.57). Player-placed ghosts last forever; ghosts of destroyed entities last 1 week of game time (purple time bar). A ghost is built by placing the real item over it or by construction robots. Ghosts are removed by mining (right-click) or a deconstruction planner. (https://wiki.factorio.com/Ghost , `core/prototypes/utility-constants.lua`)
* **Collision**: an entity can only be placed if its `collision_box` overlaps no other object-layer entity, the player, cliffs or water (`building_collision_mask` = item, object, player, water_tile, meltable). Collision boxes are slightly smaller than the footprint so neighbouring 1×1 entities can sit flush (belt 0.8×0.8, pole 0.3×0.3, chest 0.7×0.7, 3×3 machines 2.4×2.4 or 2.7×2.7). Selection boxes (the highlight rectangle when hovering) are the full footprint.
* **Mining drills must have at least one minable resource tile inside their mining area**; otherwise placement (and even ghost placement) is refused ("Nope, sorry" – dev answer, https://forums.factorio.com/viewtopic.php?t=26520). A drill whose patch later depletes stays and shows status `no_minable_resources` (red light).
* **Offshore pump** – `tile_buildability_rules`: its own body (0.8×0.8 area) must stand on ground tiles (not water); the 2 × 1 area in front of it must be water tiles. It must be placed on a shoreline facing the water; output pipe connection is on the land side. (prototype `offshore-pump`, https://wiki.factorio.com/Offshore_pump)
* Landfill / tiles are placed with a square brush 1×1 … 10×10 (Numpad +/−).
* Entities placed over an existing entity of the same "fast replace group" (stone furnace → steel furnace, belt tier upgrades, inserter tiers) replace it in place and keep contents (https://wiki.factorio.com/Steel_furnace).
* Removing an entity: hold **right click** over it – a radial progress ring fills for `mining_time / mining_speed` seconds (stone furnace 0.2 s → 0.4 s by hand); the entity and all its contents go to the player inventory (if full, it can't be mined).
* Undo (Ctrl+Z) restores removed entities as ghosts and cancels deconstruction orders.

---

## 5. Hand mining

Source: https://wiki.factorio.com/Mining , https://wiki.factorio.com/Tree , https://wiki.factorio.com/Rock , resource prototypes.

**Formula (drills):** production rate = mining speed ÷ mining time (items/s); seconds per item = mining time ÷ mining speed.

**Formula (player):** rate = (1 + force bonus) × (1 + character bonus) × 0.5 ÷ mining time. Steel axe research adds +100% force bonus → effective speed 1.0.

| Target | `mining_time` | Yield | Seconds by hand (speed 0.5) | With Steel axe (1.0) |
|---|---|---|---|---|
| Iron ore / Copper ore / Coal / Stone tile | 1 | 1 ore | 2.0 s | 1.0 s |
| Uranium ore | 2 | needs sulfuric acid – cannot be hand-mined | – | – |
| Tree (alive) | 0.55 | 4 wood | 1.1 s | 0.55 s |
| Dead tree | 0.5 | 2 wood | 1.0 s | 0.5 s |
| Big rock / big sandy rock (500 HP) | 2 | 20 stone (sandy 19–25) | 4 s | 2 s |
| Huge rock (2000 HP) | 3 | 24–50 stone + 24–50 coal | 6 s | 3 s |
| Stone furnace / assembler / lab / chest (entity pickup) | 0.2 | the entity + contents | 0.4 s | 0.2 s |
| Burner mining drill | 0.3 | | 0.6 s | 0.3 s |
| Gun turret | 0.5 | | 1.0 s | 0.5 s |
| Transport belt, small pole, wooden chest, offshore pump | 0.1 | | 0.2 s | 0.1 s |

Hand-mining a resource tile removes 1 unit from that tile's amount; when a tile reaches 0 it disappears. Mining continues as long as right-click is held; the player must be within `reach_resource_distance` 2.7 tiles. Mining produces ore "particle" sparks and a repeating pickaxe sound.

---

## 6. Character GUI: inventory, crafting menu, crafting queue

Sources: https://wiki.factorio.com/Player , https://wiki.factorio.com/Crafting , https://wiki.factorio.com/Tutorial:Quick_start_guide , https://wiki.factorio.com/Stack , `base/prototypes/item-groups.lua`, `core/prototypes/style.lua`.

### 6.1 Layout (opened with E)
* Window centred on screen; **left panel = main inventory** (80 slots, 10 columns × 8 rows, 40 px slots; grows to 9–11 rows with bonuses), below/around it: 1 armor slot, 3 gun slots with 3 ammo slots beside them, and (after research) logistic trash slots. A "sort inventory" toggle and a search field exist (2.0).
* **Right panel = crafting recipes** ("Four large buttons at top organize recipes into categories" – the item-group tabs), each tab a grid of recipe icons (10 per row) grouped by subgroup rows.
* Tabs across the top of the window (1.1/2.0): **Crafting**, **Logistics** (personal requests), **Character** (bonuses: mining speed, crafting speed, running speed, inventory slots, reach, health).
* Opening the GUI of a container/machine shows the **player inventory on the left and the entity GUI on the right** so items can be shift-clicked between them.
* E or Esc closes; E also works while holding an item (the item stays in the cursor).

### 6.2 Crafting tabs (item groups) – exact order and subgroups
Only groups that contain craftable recipes are shown as tabs; in the base game the crafting menu shows **Logistics, Production, Intermediate products, Combat** (2.0 Space Age adds **Space**; "Fluids", "Signals", "Tiles", "Enemies" groups exist but are not crafting tabs).

| Group (tab) | order | Subgroups (rows), in order |
|---|---|---|
| logistics | a | storage (chests) · belt (belts, undergrounds, splitters) · inserter · energy-pipe-distribution (poles, pipes, pumps, tanks) · train-transport · transport (car, tank, spidertron) · logistic-network (robots, roboports, logistic chests) · circuit-network · terrain (landfill, concrete, cliff explosives) |
| production | b | tool (repair pack, blueprints in 1.1) · energy (boiler, steam engine, solar, accumulator, nuclear) · extraction-machine (drills, pumpjack) · smelting-machine (furnaces) · production-machine (assemblers, refinery, chem plant, centrifuge, lab) · module · space-related (rocket silo, satellite) |
| intermediate-products | c | fluid-recipes · raw-resource (wood, ores) · raw-material (plates, bricks, sulfur, plastic, …) · barrel · fill-barrel · empty-barrel · intermediate-product (gears, cable, circuits, engines, …) · intermediate-recipe · uranium-processing · science-pack · internal-process |
| combat | e | gun · ammo · capsule (grenades, fish, robots capsules) · armor · equipment · utility-equipment · military-equipment · defensive-structure (walls, gates, mines) · turret · ammo-category |

Source: `base/prototypes/item-groups.lua` (factorio-data master).

### 6.3 Hand-crafting behaviour
| Rule | Detail |
|---|---|
| Craft 1 / 5 / all | Left click / Right click / Shift + Left click on a recipe icon |
| Recipe availability colouring | Craftable now: normal icon. Ingredients missing but craftable from raw materials in inventory: still craftable, missing intermediates are listed in **orange** in the tooltip and are **chain-crafted automatically** (e.g. clicking Inserter with only plates queues gears, cable, circuit, then inserter). Not craftable at all: greyed / red count. |
| Crafting time | recipe `energy_required` ÷ character crafting speed (1.0) – e.g. iron gear 0.5 s, pipe 0.5 s, burner drill 2 s, electric drill 2 s, lab 2 s, gun turret 8 s |
| Materials | taken from inventory **when queued** (pre-emptively); cancelling returns them |
| Queue display | icons in the **bottom-left corner** of the screen, one per queued recipe with count; the active one shows a progress bar (orange fill) that empties per item; intermediates appear in a different colour |
| Cancel | Left click icon = cancel 1, Right = cancel 5, Shift + Left = cancel all of that item |
| Crafting continues | while walking, mining and with GUIs closed; the queue is unlimited in practice |
| Not hand-craftable | anything in categories the character lacks: smelting (ores → plates), anything with a fluid ingredient, `advanced-crafting` (engine unit), and recipes flagged not hand-craftable |
| Tooltip on a recipe | shows ingredients with counts (red if missing), crafting time, products, "Total raw" list, and the item tooltip(s) for the product(s) |

---

## 7. Quickbar and shortcut bar

Sources: https://wiki.factorio.com/Quickbar , https://www.factorio.com/blog/post/fff-278 , https://forums.factorio.com/viewtopic.php?t=65929 , https://wiki.factorio.com/Shortcut_bar

| Property | Value |
|---|---|
| Position | bottom-centre of the screen, always visible; the **shortcut bar** sits to its right; alerts appear to the right of that |
| Slots per bar | 10 (keys 1 2 3 4 5 6 7 8 9 0 map to the **top visible bar**) |
| Number of bars (pages) | 10 (100 shortcuts total) |
| Bars visible at once | 1–4 (Settings → Interface → "Active quickbars"; shipped as 1 in 0.17, 2 in 1.1/2.0) |
| Slot semantics | a slot is a **filter/link** to an item type, not storage; the number under the icon = count of that item in the main inventory; 0 → icon greyed with no number |
| Assign | Left click empty slot with item in cursor, or Left click empty slot with empty cursor → item picker window; Middle click clears |
| Use | Left click (or number key) → puts the full stack into the cursor; Right click → half stack; clicking with something in cursor swaps |
| Switch page | Shift + 1…0 selects which page is on top; X rotates; the small numbered button at the left of each bar opens a page selector |
| Ghost items | with "Pick ghost item if no items are available" enabled, selecting an owned-0 item gives a ghost cursor |
| Accepted contents | any item, blueprints, books, deconstruction/upgrade planners |

Shortcut bar (default up to 12 icons, more rows via settings): Toggle Alt-mode, Undo, Redo, Cut, Copy, Paste, blank Blueprint, Blueprint book, Deconstruction planner, Upgrade planner, Import string, toggle personal roboport / exoskeleton, red/green/copper wire, remotes. In 2.0 most of these unlock with Construction robotics; in 1.1 they are available from the start.

---

## 8. Alt-mode ("Show info", Alt)

Sources: https://wiki.factorio.com/Tutorial:Keyboard_shortcuts , https://wiki.factorio.com/Tutorial:Quick_start_guide , https://wiki.factorio.com/Electric_mining_drill

Toggled with Alt (also a shortcut-bar button). It draws overlays on top of entities:

| Entity | Overlay |
|---|---|
| Assembling machine / furnace / chemical plant | icon of the current recipe (product) centred on the machine (`recipe_icon_scale` 2.5 in chart) ; furnaces show the current smelting product |
| Inserters | a small arrow showing drop direction (option "show inserter arrows") ; filter inserters show filter icons |
| Chests / containers | up to the first few item types with counts (small icons in a row) |
| Belts | items are always visible; alt mode adds nothing (underground belts show direction arrows) |
| Turrets | ammo icon and a small bar |
| Mining drills | output arrow direction (always shown) |
| Fluid machines | fluid icons on each input/output connection |
| Splitters | filter item and priority arrows |
| Train stops / lamps / combinators | names, colour, signals |
| Electric poles | wire connections drawn always; alt mode does not change them |
| Status | every crafting machine, drill, lab, turret etc. shows a 3-colour **status light** on its sprite: green = working, yellow = output full / low power / disabled by circuit / missing fluid, red = no minable resources / no power / no fuel. Also small **warning icons** float over entities: no power (yellow bolt), no fuel, no ammo, no minable resources, fluid mixing, pipeline overextended |

---

## 9. Tooltips and Factoriopedia

Sources: https://www.factorio.com/blog/post/fff-318 , https://www.factorio.com/blog/post/fff-397 , https://wiki.factorio.com/Tutorial:Quick_start_guide , https://wiki.factorio.com/Version_history/0.17.0

* Tooltips appear on hover after a short delay, next to the cursor, dark semi-transparent panel with blur/shadow, caption colour (255,230,192) and the same layout style as technology tooltips.
* **Item tooltip** (same everywhere – inventory, recipe, request): item name (bold caption), description, then categorised property lines: stack size, then entity properties if the item places an entity (health, dimensions e.g. "2×2", energy consumption "90 kW (burner)", crafting speed, mining speed, mining area, range, rotation speed, supply area, wire reach, storage size, fluid capacity, pollution). Fuel items show fuel value (coal 4 MJ) and vehicle bonuses.
* **Recipe tooltip** (crafting menu, assembler recipe picker): recipe name, ingredients (icon, count – red when missing, orange when craftable-intermediate), crafting time (e.g. "0.5 s"), products, "Total raw" (raw resources needed – can be hidden in settings), plus a stacked "multi-tooltip" with the product item's tooltip. Pressing Shift shows the extended "?" tooltip (controls hints).
* **Entity tooltip in world** (hover any entity): name, health bar (only when damaged), state information (fuel remaining, fluid contents and temperature, current recipe, contents of chests, power satisfaction), and the "Ctrl + click / Shift + click" hints.
* **Factoriopedia** (2.0): Alt + Left click on anything opens an encyclopedia window with item/recipe/entity merged entries, "made in", "ingredient of", unlocking technology, and browsing history arrows.

---

## 10. Entity GUIs

Common frame conventions (all entity windows): dark grey panel, title bar with the entity's name (caption colour), a "×" close button at the right, optional preview thumbnail of the entity (400×152 px camera view of the building) at the top, a **status line** (coloured dot + text, e.g. "Working", "No power", "Output full", "No fuel", "Low power", "No minable resources", "No ingredients", "No recipe", "Missing science packs", "No ammo") and the player's inventory in a separate window to the left. Windows close with E or Esc. Slot rows are 40 px slots.

Progress bars: orange fill (`gui_color.orange` 0.98,0.66,0.22 – ≈#FAA838) on a dark track; burner heat/fuel bars are red-orange; fluid bars are the fluid's colour (water blue, steam white-grey); power bars green/yellow/red.

### 10.1 Stone furnace (also steel furnace, electric furnace)

Sources: https://wiki.factorio.com/Stone_furnace , https://wiki.factorio.com/Steel_furnace , https://wiki.factorio.com/Electric_furnace , https://wiki.factorio.com/Iron_plate , https://wiki.factorio.com/Steel_plate , https://wiki.factorio.com/Stone_brick , https://lua-api.factorio.com/latest/prototypes/FurnacePrototype.html , prototype data.

| Stat | Stone furnace | Steel furnace | Electric furnace |
|---|---|---|---|
| Footprint | 2×2 (collision 1.4×1.4) | 2×2 | 3×3 (collision 2.4×2.4) |
| Health | 200 | 300 | 350 |
| Crafting speed | 1 | 2 | 2 |
| Energy | 90 kW burner (fuel: wood/coal/solid/rocket/nuclear, `fuel_inventory_size` 1) | 90 kW burner | 180 kW electric + 6 kW drain |
| Pollution | 2/min | 4/min | 1/min |
| Module slots | 0 | 0 | 2 |
| Input slots (`source_inventory_size`) | 1 | 1 | 1 |
| Output slots (`result_inventory_size`) | 1 | 1 | 1 |
| Recipe | 5 stone, 0.5 s | 6 steel + 10 stone brick, 3 s | 5 adv. circuit + 10 steel + 10 brick, 5 s |
| Stack size | 50 | 50 | 50 |
| Mining time | 0.2 | 0.2 | 0.2 |

GUI (burner furnace): title "Stone furnace"; status line; a **fuel slot** at the left with a **burner heat bar** (red, drains as the current fuel item burns – a 4 MJ coal lasts 4 MJ ÷ 90 kW = 44.4 s); the **source (input) slot** on the left, a horizontal **progress bar** in the middle (fills over recipe time ÷ crafting speed), and the **result (output) slot** on the right. The furnace **auto-selects the recipe from the inserted item** (no recipe picker): iron ore → iron plate 3.2 s; copper ore → copper plate 3.2 s; 2 stone → stone brick 3.2 s; 5 iron plate → steel plate 16 s (needs Steel processing). Inserting a different item into the source slot is refused while a different product sits in the output ("cannot be smelted" message). Output slot holds one stack (100 plates); when full, status = "Output full" and smelting stops. Electric furnace additionally has 2 module slots and no fuel slot.

Output rates at speed 1: plates 0.3125/s, steel 0.0625/s; coal consumption 0.0225/s.

### 10.2 Assembling machines

Sources: https://wiki.factorio.com/Assembling_machine_1 , _2 , _3 ; https://factorio.com/blog/post/fff-426 ; prototype data.

| Stat | AM1 | AM2 | AM3 |
|---|---|---|---|
| Footprint | 3×3 (collision 2.4×2.4) | 3×3 | 3×3 |
| Health | 300 | 350 | 400 |
| Crafting speed | 0.5 | 0.75 | 1.25 |
| Energy | 75 kW + 2.5 kW drain | 150 kW + 5 kW drain | 375 kW + 12.5 kW drain |
| Pollution | 4/min | 3/min | 2/min |
| Module slots | 0 | 2 | 4 |
| Fluids | no | yes (input pipe at one side, rotate with R) | yes |
| Crafting categories | crafting, advanced-crafting | + crafting-with-fluid | + crafting-with-fluid |
| Recipe | 3 circuits + 5 gears + 9 iron, 0.5 s | AM1 + 3 circuits + 5 gears + 2 steel, 0.5 s | 2 AM2 + 4 speed modules, 0.5 s |
| Unlock | Automation | Automation 2 | Automation 3 |

Craft time = recipe time ÷ crafting speed (gear 0.5 s → 1.0 s in AM1). Ingredient limit: in 1.1/2.0 there is no per-tier ingredient cap (removed in 0.17); machines buffer ingredients for a couple of crafts and inserters stop feeding when the buffer holds ≥ 2 crafts' worth.

GUI: when no recipe is set, opening the machine shows the **recipe selection window**: item-group tabs across the top (same groups as the crafting menu, only recipes this machine can craft), rows of recipe icons, a search box (Ctrl+F); hovering shows the recipe tooltip, clicking picks it and returns to the machine GUI. Machine GUI: title, status line, entity preview, the **recipe icon/name** at the left (clicking it re-opens the picker; 2.0: clicking opens Factoriopedia for the recipe; a separate "change recipe" button exists), **ingredient slots** (one per ingredient, greyed icon with count shown as "have/need"), an arrow with the **progress bar**, and the **product/output slot** (one slot, acts like a normal inventory slot). Below: module slots (AM2/3) and the "Crafting speed" / "Energy consumption" info lines. **Changing the recipe** returns all ingredients and products in the machine to the player's inventory (spilled on the ground if it doesn't fit). Shift + Right click / Shift + Left click copies/pastes a recipe between machines. With alt-mode the chosen product icon is drawn over the machine.

### 10.3 Chests (containers)

Sources: https://wiki.factorio.com/Wooden_chest , https://wiki.factorio.com/Iron_chest , https://wiki.factorio.com/Steel_chest , https://wiki.factorio.com/Stack , prototype data.

| Chest | Slots | Health | Recipe | Mining time |
|---|---|---|---|---|
| Wooden chest | 16 | 100 | 2 wood, 0.5 s | 0.1 |
| Iron chest | 32 | 200 | 8 iron plate, 0.5 s | 0.2 |
| Steel chest | 48 | 350 | 8 steel plate, 0.5 s | 0.2 |

All 1×1 (collision 0.7×0.7), stack size 50. GUI: title, a grid of item slots (rows of up to 10 – wooden chest 2 rows of 8, larger chests wrap at the panel width), player inventory to the left for shift-click transfers. A small **red "X" button** ("limit slots") at the top right of the grid: click it then click a slot to limit the usable slot count – slots beyond the limit are drawn with a red X overlay and inserters/robots won't fill them (the "inventory limit bar"). Contents are shown in alt-mode. Ctrl+click on the chest in the world fast-transfers.

### 10.4 Lab

Sources: https://wiki.factorio.com/Lab , https://wiki.factorio.com/Research , https://wiki.factorio.com/Science_pack , prototype `lab`.

| Stat | Value |
|---|---|
| Footprint | 3×3 (collision 2.4×2.4) |
| Health | 150 |
| Energy | 60 kW electric |
| Research speed | 1 (`researching_speed = 1`) |
| Module slots | 2 |
| Recipe | 10 circuits + 10 gears + 4 transport belts, 2 s |
| Stack | 10 |
| Science pack slots (in this order, 1 slot each) | automation (red), logistic (green), military (grey/black), chemical (cyan/blue), production (purple), utility (yellow), space (white) [+ Space Age packs] |

GUI: title, status ("Working" / "No research in progress" / "Missing science packs" / "No power"), a row of **7 science pack slots** filtered to one pack type each (only the packs the current research needs light up), the **current research** name with icon and a **progress bar**, and 2 module slots. Labs consume one pack of each required type per **research unit** (`unit.time` seconds per unit at speed 1); packs lose durability gradually and are destroyed at the end of the unit. Research time with L labs at speed S: T = unit_time × unit_count ÷ (L × S). Research speed bonuses are multiplicative with module speed. Ctrl+click on a lab in the world grabs its packs.

### 10.5 Mining drills

Sources: https://wiki.factorio.com/Burner_mining_drill , https://wiki.factorio.com/Electric_mining_drill , https://wiki.factorio.com/Mining , `base/prototypes/entity/mining-drill.lua`.

| Stat | Burner mining drill | Electric mining drill |
|---|---|---|
| Footprint | 2×2 (collision 1.4×1.4) | 3×3 (collision 2.7×2.7) |
| Mining area | 2×2 (`resource_searching_radius` 0.99) | 5×5 (`resource_searching_radius` 2.49 – 1 tile beyond the body on each side) |
| Mining speed | 0.25/s | 0.5/s (uranium 0.25/s) |
| Energy | 150 kW burner (1 fuel slot) | 90 kW electric |
| Pollution | 12/min | 10/min |
| Health | 150 | 300 |
| Module slots | 0 | 3 |
| Output vector | {-0.35, -1.3} → the tile in front (north when unrotated), slightly left | {0, -1.85} → the tile directly in front, centre |
| Recipe | 3 gears + 3 iron + 1 stone furnace, 2 s | 3 circuits + 5 gears + 10 iron, 2 s |
| Mining time (pickup) | 0.3 | 0.3 |
| Animation | 32 frames, 0.5 frames/tick, forward-then-backward | 30 frames, 0.4 frames/tick |

Items are dropped onto the output tile: onto a belt (far/near lane depending on orientation), directly into a chest, furnace or machine covering that tile, or on the ground (a small pile forms and the drill stops when the ground item exists). The output direction is shown by an **arrow on the sprite**; rotate with R.

GUI: title, status, entity preview, **"Expected resources"** (2.0) / **resource count remaining** in the mining area (e.g. "Iron ore: 1,254") shown as an icon with number, a **mining progress bar**, the burner drill additionally shows the **fuel slot** and burner heat bar ("Amount of fuel in the mining drill", "Depletion of 1 unit of fuel" – wiki), the electric drill shows 3 module slots and energy usage. Status light: green working, yellow output blocked / low power, red depleted. Two burner drills facing each other on coal refuel each other.

### 10.6 Gun turret

Sources: https://wiki.factorio.com/Gun_turret , `base/prototypes/entity/turrets.lua`.

| Stat | Value |
|---|---|
| Footprint | 2×2 (collision 1.4×1.4) |
| Health | 400 |
| Range | 18 tiles (drawn as a circle when hovering/placing; `turret_range_color` (0.8,0.25,0.25)) |
| Rate of fire | cooldown 6 ticks → 10 shots/s |
| Rotation speed | 0.015 turns/tick (324°/s); preparing/folding 0.08 |
| Ammo inventory | **1 ammo slot** (`inventory_size = 1`); inserters fill only up to `automated_ammo_count = 10` magazines |
| Ammo | firearm magazine (10 rounds, 5 physical dmg), piercing rounds (8 physical + 5 piercing? – see combat facet), uranium rounds |
| Recipe | 10 copper + 10 gears + 20 iron, 8 s |
| Stack | 50; mining time 0.5 |
| Power | none |

GUI: title, status ("Working" / "No ammo"), entity preview, the single **ammo slot** with the magazine count and a small **ammo bar**, "Kills: N" counter, and the damage/ shooting speed bonus lines from research. The turret folds/unfolds (animation) when a target enters range and turns towards it. Warning icon over turret when out of ammo; alert `turret_out_of_ammo` / `turret_fire`.

### 10.7 Boiler

Sources: https://wiki.factorio.com/Boiler , https://wiki.factorio.com/Power_production , https://forums.factorio.com/viewtopic.php?t=66886 , prototype `boiler`.

| Stat | Value |
|---|---|
| Footprint | 3 wide × 2 deep (collision 2.58×1.58; selection {{-1.5,-1},{1.5,1}}) |
| Health | 200 |
| Energy consumption | 1.8 MW burner (`fuel_inventory_size` 1, chemical fuels) |
| Output | 60 steam/s at 165 °C from 6 water/s (1 water → 10 steam, 300 kJ per water) |
| Fluid boxes | water in/out 200 units (water passes straight through, connections on the two short ends), steam out 200 units (separate pipe on the long side, `mode = output-to-separate-pipe`) |
| Pollution | 30/min |
| Recipe | 1 stone furnace + 4 pipes, 0.5 s |
| Coal use | 1 coal (4 MJ) per 2.22 s = 0.45/s |

GUI: title, status, preview, the **fuel slot** and burner bar, the **water fluid bar** (blue, "Water 200/200, 15 °C") and the **steam fluid bar** (grey-white, "Steam N/200, 165 °C"), and "Energy consumption 1.8 MW". Ratio: 1 offshore pump : 20 boilers : 40 steam engines (1.1 wiki) – with 2.0 numbers 1 : 200 : 400 (pump output raised to 1200/s).

### 10.8 Steam engine

Sources: https://wiki.factorio.com/Steam_engine , prototype `steam-engine`.

| Stat | Value |
|---|---|
| Footprint | 3 wide × 5 long (collision 2.5×4.7; selection {{-1.5,-2.5},{1.5,2.5}}) |
| Health | 400 |
| Max power output | 900 kW (`effectivity` 1, `fluid_usage_per_tick` 0.5 → 30 steam/s, `maximum_temperature` 165 °C) |
| Fluid box | 200 steam; two ports at the short ends → chainable |
| Recipe | 8 gears + 10 iron + 5 pipes, 0.5 s |
| Stack | 10 |
| Pollution | none |

GUI: title, status ("Working" / "Not connected to electric network" / "Not enough steam"), entity preview, **"Power output: N kW"** with a bar (current ÷ 900 kW), and the **steam fluid bar** with amount and temperature; info lines "Fluid consumption 30/s", "Maximum temperature 165 °C", "Maximum power output 900 kW". Engines throttle automatically to the network's demand.

### 10.9 Electric poles and the electric network GUI

Sources: https://wiki.factorio.com/Small_electric_pole , Medium_electric_pole , Big_electric_pole , Substation , https://wiki.factorio.com/Electric_system , prototype data.

| Pole | Footprint | Health | Wire reach (`maximum_wire_distance`) | Supply area (`supply_area_distance`) | Recipe |
|---|---|---|---|---|---|
| Small electric pole | 1×1 (collision 0.3×0.3) | 100 | 7.5 tiles | 5×5 (2.5) | 1 wood + 2 copper cable → 2, 0.5 s |
| Medium electric pole | 1×1 | 100 | 9 | 7×7 (3.5) | 2 cable + 4 iron stick + 2 steel, 0.5 s |
| Big electric pole | 2×2 (collision 1.3×1.3) | 150 | 32 | 4×4 (2) | 4 cable + 8 iron stick + 5 steel, 0.5 s |
| Substation | 2×2 | 200 | 18 | 18×18 (9) | 5 adv. circuit + 6 cable + 10 steel, 0.5 s |

Placement preview shows the **supply area as a translucent blue square** and copper wires to poles in reach; when holding a pole and dragging, poles are auto-placed at maximum reach. Shift + Left click on a pole removes its cables; clicking two poles with a copper cable toggles a connection. Unpowered consumers show a **yellow lightning-bolt warning icon**; low power shows a red/yellow "low power" icon.

**Electric network GUI** (left-click any pole): title "Electric network", three bars – **Satisfaction** (consumption ÷ production; green, turns yellow when demand exceeds supply, red when <50 % satisfied), **Production** (current ÷ maximum capacity) and **Accumulator charge** (stored joules); then two tabs/columns **Consumption** and **Production** listing every consumer/producer type with icon, count and kW sorted by draw, plus a **graph** panel with time-range buttons **5 s, 1 m, 10 m, 1 h, 10 h, 50 h** (the displayed watts are averages over the range). Brownout: all machines slow proportionally to the satisfaction; drain (idle consumption, e.g. inserter 0.4 kW, AM1 2.5 kW) is always drawn.

### 10.10 Offshore pump

Source: https://wiki.factorio.com/Offshore_pump , prototype.

| Stat | Value |
|---|---|
| Footprint | 1 wide × 2 deep (collision {{-0.6,-1.05},{0.6,0.3}}) – body on land, intake over water |
| Health | 150 |
| Output | 1200 water/s (`pumping_speed` 20 per tick); no power or fuel needed |
| Fluid box | 100 |
| Recipe | 2 gears + 3 pipes, 0.5 s |
| Stack | 20; mining time 0.1 |

GUI: title, status, preview, a fluid bar "Water N/100" and "Pumping speed 1200/s". Placement preview turns green only on a shoreline tile with water in front (the water side is highlighted).

### 10.11 Inserters (for arm animation and GUI)

Sources: https://wiki.factorio.com/Inserter , https://wiki.factorio.com/Inserters , https://wiki.factorio.com/Burner_inserter , Long-handed_inserter , Fast_inserter , prototype data (`entities.lua`).

| Inserter | Health | `rotation_speed` (turns/tick) | °/s | `extension_speed` (tiles/tick) | Pickup / drop | Energy | Drain | Recipe |
|---|---|---|---|---|---|---|---|---|
| Burner | 100 | 0.013 | 281 | 0.035 | {0,-1} / {0,1.2} | 50 kJ per move + 50 kJ per rotation (≈144 kW burner peak) | – | 1 gear + 1 iron, 0.5 s |
| Inserter (yellow) | 150 | 0.014 | 302 | 0.035 | 1 tile behind / 1 tile in front | 5 kJ + 5 kJ (≈13–15 kW) | 0.4 kW | 1 circuit + 1 gear + 1 iron, 0.5 s |
| Long-handed | 160 | 0.02 | 432 | 0.05 | {0,-2} / {0,2.2} (2 tiles) | 5 kJ + 5 kJ (≈21 kW) | 0.4 kW | inserter + 1 gear + 1 iron, 0.5 s |
| Fast | 150 | 0.04 | 864 | 0.1 | 1 / 1 | 7 kJ + 7 kJ (≈59 kW) | 0.5 kW | inserter + 2 circuits + 2 iron, 0.5 s |
| Bulk (stack) | 160 | 0.04 | 864 | 0.1 | 1 / 1 | 20 kJ + 20 kJ | 1 kW | 2.0 |

All 1×1 (collision 0.3×0.3, selection {{-0.4,-0.35},{0.4,0.45}}), stack 50, `filter_count` 5 (2.0: every inserter can filter). Behaviour: the base sits on the tile, the arm **picks up from the tile behind** (pickup_position) and **drops on the tile in front** (insert_position 1.2 → far edge → **far lane** of a belt). One cycle = 180° swing there + 180° back: yellow inserter 0.5 ÷ 0.014 ≈ 36 ticks per half turn → ≈1.2 s per item (≈0.83–0.86 items/s chest-to-chest; wiki 0.86). Arm animation: the sprite is drawn as a rotating hand (`hand_base_picture` 32×136 px, open and closed hand variants) that extends/retracts (`extension_speed`) between the two positions; the hand shows the carried item icon at half size. Inserters never drop on the ground unless the target tile is empty ground... (they *do* place on ground when nothing is there – used to feed burner drills). Direction arrow drawn in alt-mode. Inserter GUI (1.1 only for filter/circuit; 2.0 for all): title, status, "filters" 5 slots, whitelist/blacklist, stack size override, circuit-network toggles.

### 10.12 Belts, undergrounds, splitters (numbers for rendering)

Sources: https://wiki.factorio.com/Transport_belt , https://wiki.factorio.com/Belt_transport_system , https://wiki.factorio.com/Underground_belt , https://wiki.factorio.com/Splitter , `base/prototypes/entity/transport-belts.lua`.

| Belt tier | `speed` tiles/tick | tiles/s | items/s (2 lanes) | Animation frames | Frames advanced per tick (= speed × `animation_speed_coefficient` 32) | Underground max gap (`max_distance`) | Recipe |
|---|---|---|---|---|---|---|---|
| Transport belt (yellow) | 0.03125 | 1.875 | 15 | 16 | 1 → full loop every 16 ticks (0.27 s) | 4 tiles gap (`max_distance` 5) | 1 gear + 1 iron → 2, 0.5 s |
| Fast (red) | 0.0625 | 3.75 | 30 | 32 | 2 → loop every 16 ticks | 6 (7) | |
| Express (blue) | 0.09375 | 5.625 | 45 | 32 | 3 → loop every 10.7 ticks | 8 (9) | |

Belts: 1×1 (collision 0.8×0.8), health 150, stack 100, 2 lanes, **4 items per lane per tile (8 per tile)**, item spacing 0.25 tile, belt sprite sheet has 20 direction variants (4 straight, 8 curves, endings). Items drawn on lanes at ±0.25 tile from centre. Belt drag-placement auto-turns; placing a belt facing into the side of another belt sideloads onto the near lane. Underground belts: 10 iron + 5 belts → 2, 1 s; placing the second half auto-pairs; R flips in/out. Splitter: 1×2 (collision 1.8×0.8), 170 HP, 5 circuits + 5 iron + 4 belts, 1 s; GUI: input priority (left/right), output priority, filter slot.

---

## 11. Entity status values (for status lines and lights)

Source: https://lua-api.factorio.com/latest/defines.html (`defines.entity_status`, `defines.entity_status_diode`). Diode colours: **green**, **yellow**, **red**.

Early-game relevant statuses and typical colour: `working` (green), `normal` (green), `no_power` (red), `low_power` (yellow), `no_fuel` (red), `disabled_by_control_behavior` (yellow), `marked_for_deconstruction`, `not_plugged_in_electric_network` (red), `no_recipe` (yellow), `no_ingredients` (yellow), `no_input_fluid`, `no_research_in_progress` (yellow), `no_minable_resources` (red), `low_input_fluid`, `fluid_ingredient_shortage`, `full_output` (yellow), `not_enough_space_in_output`, `full_burnt_result_output`, `item_ingredient_shortage` (yellow), `missing_required_fluid`, `missing_science_packs` (yellow), `waiting_for_source_items` (inserters, yellow), `waiting_for_space_in_destination` (yellow), `no_ammo` (red), `disabled`, `pipeline_overextended`, `recipe_not_researched`, `charging`/`discharging`/`fully_charged` (accumulators), `ghost`.

---

## 12. Technology screen and research

Sources: https://wiki.factorio.com/Research , https://wiki.factorio.com/Technologies , https://wiki.factorio.com/Automation_(research) , Logistics_(research) , Electronics_(research) , Logistic_science_pack_(research) , Toolbelt_(research) , `base/prototypes/technology.lua`.

* Open with **T**. Full-screen window: on the left a list/filter (2.0 search), the centre is the **technology tree** drawn as boxes with the tech icon, name, cost (science pack icons × count and time per unit) connected by prerequisite lines; available techs are highlighted, researched ones dimmed, queued ones outlined (dependents of a queued tech are shown in orange). Clicking a tech shows its detail panel (effects/unlocked recipes with icons, cost "N × [packs] , T s each", prerequisites) with a **"Start research" / "Add to queue"** button; Shift + click starts it immediately.
* **Research queue** (top-left of the tech screen; 1.1 default availability "always"): up to 7 entries. The **current research progress bar** with the tech icon is shown permanently in the top-right corner of the HUD (above the minimap); clicking it opens the tech screen. A "research finished" sound + on-screen message plays on completion.
* Cost model: `unit_count` × (`unit_time` s, ingredients). Research time = unit_time × unit_count ÷ (labs × speed).

| Technology | Prereq | Cost (packs × units, time per unit) | Unlocks |
|---|---|---|---|
| Steam power (2.0 trigger) | – | craft 50 iron plate | pipe, boiler, steam engine |
| Electronics (2.0 trigger; 1.1: 30 red × 15 s after Automation) | – | craft 10 copper plate | copper cable, circuit, inserter, lab, small pole |
| Automation science pack (2.0 trigger) | steam power, electronics | craft a lab | red pack recipe |
| **Automation** | automation science pack | 10 × red, 10 s (100 s with 1 lab) | Assembling machine 1, long-handed inserter |
| Logistics | automation science pack | 20 × red, 15 s | underground belt, splitter |
| Logistic science pack | automation science pack | 75 × red, 5 s | green pack |
| Steel processing | automation science pack | 50 × red, 5 s | steel plate, steel chest |
| Military | automation science pack | 10 × red, 15 s | SMG, shotgun, shells |
| Turrets (gun-turret) | automation science pack | 10 × red, 10 s | gun turret |
| Fast inserter | automation science pack | 30 × red, 15 s | fast inserter |
| Lamp (optics) | automation science pack | 10 × red, 15 s | small lamp |
| Stone wall | automation science pack | 10 × red, 10 s | stone wall |
| Steel axe (2.0 trigger; 1.1: 50 red × 30 s) | steel processing | craft 50 steel | +100 % hand mining speed |
| Toolbelt | logistic science pack | 100 × (red+green), 30 s | +10 inventory slots |
| Automation 2 | automation, steel, green pack | 40 × (red+green), 15 s | AM2 |
| Advanced material processing | steel, green pack | 75 × (red+green), 30 s | steel furnace |
| Solar energy | steel, green pack | 250 × (red+green), 30 s | solar panel |
| Electric energy distribution 1 | steel, green pack | 120 × (red+green), 30 s | medium/big pole, iron stick |
| Engine | steel, green pack | 100 × (red+green), 15 s | engine unit |
| Logistics 2 | logistics, green pack | 200 × (red+green), 30 s | fast belts |
| Military 2 | military, steel, green pack | 20 × (red+green), 15 s | piercing rounds, grenade |
| Railway | logistics 2, engine | 75 × (red+green), 30 s | rails, locomotive, wagon |
| Automobilism | logistics 2, engine | 100 × (red+green), 30 s | car |
| Construction robotics | robotics | 100 × (red+green+blue), 30 s | roboport, construction robot, ghosts on death |

Science pack recipes: automation = 1 copper + 1 gear, 5 s; logistic = 1 belt + 1 inserter, 6 s; military = 1 piercing mag + 1 grenade + 2 walls → 2, 10 s; chemical = 1 sulfur + 3 adv. circuit + 2 engine → 2, 24 s. Stack size 200 (space 2000). (https://wiki.factorio.com/Science_pack)

---

## 13. Map view and minimap

Sources: https://wiki.factorio.com/User:Amarula/Minimap , https://wiki.factorio.com/Tutorial:Quick_start_guide , https://wiki.factorio.com/Radar , https://wiki.factorio.com/Map_structure , `core/prototypes/utility-constants.lua`, `resources.lua`, `tiles.lua`.

* **Minimap**: top-right corner of the HUD. From top: the research progress bar, a row of icon buttons (Blueprint library B, Production stats P, Bonuses, Tutorials, Trains, Achievements; 2.0 also an alerts-settings button), then the square **map overview** centred on the player (player = white/orange dot with the player colour; other players; enemies **bright red**; resources in their map colours; terrain colours; trains). Clicking it opens the full map at that spot. Only charted chunks are drawn; the character charts 5×5 chunks around itself, a radar 7×7 chunks continuously (224×224 tiles) and scans one distant chunk of a 29×29-chunk area every 33.3 s at 300 kW.
* **Map view (M / Tab)**: full-screen chart, drag with left mouse, wheel zooms (default ≈0.031, labels hide below 0.0157; zooming in far enough switches to a live "zoomed-to-world" view of charted areas). Hovering a resource patch shows its type and total amount; right-click adds/removes a **map tag** (label with any icon); a second icon row toggles overlays: logistic networks, electric networks, turret coverage, pollution (red cloud), train stop names, player names; 2.0 adds a resource search / pin panel (FFF-426). Ctrl + Alt + click pings a location for other players.
* **Chart colours** (`utility-constants.lua`, RGB 0–1 or 0–255 as written):

| Element | Colour |
|---|---|
| Default friendly building | (0, 0.38, 0.57) ≈ #006191 |
| Enemy (biters, spawners) | (1, 0.1, 0.1) ≈ #FF1A1A; enemy territory overlay RGBA(77,8,8,77) |
| Entity ghost | (0.57, 0.38, 0.57) ≈ #916191 |
| Transport belt / splitter / underground | (0.8,0.63,0.28) #CCA147 / (1,0.82,0) #FFD100 / (0.44,0.36,0) #705C00 |
| Wall / gate | (0.8,0.85,0.8) #CCD9CC / (0.5,0.5,0.5) |
| Ammo turret / electric turret / fluid turret | (202,167,24) #CAA718 / (0.85,0.18,0.18) #D92E2E / (0.92,0.46,0.1) |
| Pipe / pipe-to-ground / pump / storage tank | (69,130,165) / (25,103,150) / (109,154,181) / (131,166,188) |
| Generator (steam engine) / solar panel / accumulator / beacon / roboport | (0,127,160) / (0.12,0.13,0.14) / (0.48,0.48,0.48) / (7,68,104) / (211,207,136) |
| Trees | (0.19,0.39,0.19, α 0.40) |
| Rail / elevated rail | (0.55,0.55,0.55) / (0.73,0.73,0.73) |
| Electric pole (overlay) | (0,158,163) #009EA3 |
| Deconstruction mark | (0.75,0.2,0.2); active (1,0,0) |
| Turret range overlay | (0.8,0.25,0.25); world range circle (0.05,0.1,0.05,0.15) |
| Train path | white; preview outline green; current outline red |
| Player circle | size 3 px, colour = player colour (default (0.869,0.5,0.130) ≈ #DE8021) |
| Iron ore / copper ore / coal / stone / uranium / crude oil | (0.415,0.525,0.580) #6A8694 / (0.803,0.388,0.215) #CD6337 / (0,0,0) / (0.690,0.611,0.427) #B09C6D / (0,0.7,0) / (0.78,0.2,0.77) |
| Water / deep water | (51,83,95) #33535F / (38,64,73) #264049 |
| Grass-1 … 4 | (55,53,11) #37350B, (66,57,15), (65,52,28), (59,40,18) |
| Dirt-1 … 7 / dry dirt | (141,104,60) #8D683C … (80,54,28) / (94,66,37) |
| Sand-1 … 3 | (138,103,58) … (115,83,47) |
| Red desert 0 … 3 | (103,70,32) … (128,93,52) |
| Stone path / concrete / refined concrete / hazard concrete / landfill | (86,82,74) / (63,61,59) / (49,48,45) / (176,142,39) / (57,39,26) |

---

## 14. Alerts

Source: https://wiki.factorio.com/Alerts , https://lua-api.factorio.com/latest/defines.html (`defines.alert_type`), `utility-constants.lua` (`default_alert_icon_scale` 0.5).

Alerts appear as **flashing icons to the right of the quickbar** (bottom centre) with a count of affected entities; hovering shows text and an **arrow on the minimap/map pointing to the location**; clicking an alert opens the map centred on it; a sound plays on the first occurrence. Alert types can be toggled/muted in the button above the minimap.

| Alert (`defines.alert_type`) | Text | Duration |
|---|---|---|
| `entity_under_attack` | "X objects are being damaged" | 10 s |
| `entity_destroyed` | "X objects were destroyed" | 30 s |
| `turret_fire` | turret is shooting | 5 s |
| `turret_out_of_ammo` (2.0) | turret has no ammo | – |
| `no_material_for_construction` | robots lack materials | 10 s |
| `not_enough_construction_robots` | | 10 s |
| `not_enough_repair_packs` | | 10 s |
| `train_out_of_fuel` | | 5 s |
| `train_no_path` | | – |
| `no_storage` | logistic network has no storage | 5 s |
| `fluid_mixing`, `pipeline_overextended` | | – |
| `custom` | programmable speaker | 10 s |

In addition, **per-entity warning icons** are drawn over the entity in the world (not in the alert bar): no power (electric bolt), low power, no fuel, no ammo, no minable resources, fluid mixing, pipeline overextended, disconnected from network, roboport out of storage, train path failures, entity marked for deconstruction (red X), marked for upgrade.

---

## 15. Deconstruction and blueprints (visuals)

Sources: https://wiki.factorio.com/Deconstruction_planner , https://wiki.factorio.com/Blueprint

* Deconstruction planner: red-bordered item (Alt+D or shortcut bar). Drag a **red selection rectangle**; a tooltip lists what will be affected; selected entities get a **red "X" marker** and are mined by construction robots (or by hand). Shift-drag = **blue rectangle** that cancels. Filters: 30 entity + 30 tile slots, whitelist/blacklist, tile modes Normal/Always/Never/Only, special filters (ghosts, items on ground, tile ghosts). Robots return items to logistic storage or the player; trees give wood, rocks stone; cliffs need explosives. Ctrl+Z undoes orders.
* Blueprint: Alt+B or shortcut; drag a **green rectangle**; selected entities highlighted with a green square; a setup window with icons and a "Create blueprint" button; placing shows the whole layout at the cursor (R rotates, H/V flip, Shift = force build marks obstacles). Max 10 000 × 10 000 tiles.
* Copy/paste (Ctrl+C/V) uses the same visuals with a temporary blueprint.

---

## 16. Visual conventions

Sources: SpriteParameters docs, prototype files listed above, `utility-constants.lua`, `style.lua`.

* **Projection**: strictly top-down 2-D at 32 px per tile at zoom 1 (64 px high-res); sprites are pre-rendered 3-D models with baked shadows towards south-east; entities have separate shadow layers; a day/night cycle darkens the world (lamps/flashlight at night).
* **Health bars**: a small horizontal bar under the entity, shown only when damaged, green → yellow → red as health drops; the character's own health is a bar bottom-left (or in the character GUI). Damage flashes the sprite (`damage_hit_tint`).
* **Selection**: hovering an entity draws its selection box outline (white/yellow corners); resources use `resource_outline_selection_color` white.
* **Belt animation**: sprite strip of 16 (yellow) / 32 (red, blue) frames; advance `speed × 32` frames per tick (1 / 2 / 3), so the texture scrolls exactly with item motion (0.03125 tile per tick for yellow). Items on belts are drawn as item icons at about 0.5 tile size, 4 per lane per tile, moving continuously.
* **Inserter animation**: rotates the arm sprite around the base by `rotation_speed` turns per tick (yellow 0.014 → 5.04° per tick), extends/contracts by `extension_speed`; open hand while travelling to pickup, closed hand while carrying; the item icon rides on the hand.
* **Mining drill animation**: electric drill 30-frame drilling loop at 0.4 frames/tick with a spinning drill head and a small output arrow; burner drill 32-frame ping-pong loop at 0.5 frames/tick; both emit dark smoke when working.
* **Furnace**: fire glow/light in the mouth while burning (burner), smoke.
* **Assembler**: rotating gear/pistons animation only while crafting; recipe icon overlay in alt-mode.
* **Steam engine**: flywheel spins while producing; **boiler** flames and smoke while burning.
* **Character**: 8-direction sprites, running loop 22 frames; a light cone at night.
* **Ghosts**: blue translucent (tints above) with a striped/blurred look; **deconstruction**: red X; upgrade: yellow arrow.
* **Turret range**: red translucent circle while placing/hovering (radius 18).
* **Power supply area**: translucent blue square while placing poles; copper wires drawn as sagging lines between poles (reach 7.5 / 9 / 32 / 18).

### 16.1 Colour palette of the main items
Map colours are official (`resources.lua`); the icon colours are approximate hex samples of the in-game icon and should be tuned visually.

| Item | Official map colour | Icon description / approx. hex |
|---|---|---|
| Iron ore | (0.415,0.525,0.580) #6A8694 | bluish-grey lumpy chunks with light-blue highlights ≈ #6C8399 |
| Copper ore | (0.803,0.388,0.215) #CD6337 | orange-brown chunks with bright orange highlights ≈ #C9662F |
| Coal | (0,0,0) | black shiny chunks with dark-blue/grey highlights ≈ #1E1E1E |
| Stone | (0.690,0.611,0.427) #B09C6D | grey-tan angular rocks ≈ #A8956B |
| Wood | – | brown log ≈ #8B5A2B |
| Iron plate | – | light grey/silver flat plate with darker edge ≈ #B8BEC4 |
| Copper plate | – | warm orange-copper plate ≈ #D27C3C |
| Steel plate | – | slightly bluish, darker steel bar ≈ #8B9AA8 |
| Stone brick | – | tan brick ≈ #A6906A |
| Iron gear wheel | – | mid-grey gear ≈ #9C9C9C |
| Copper cable | – | coiled orange wire ≈ #D98A4F |
| Electronic circuit | – | **green** PCB with copper traces ≈ #3F8F3F (traces #C57A3B) |
| Advanced circuit | – | red PCB ≈ #B83A2E |
| Processing unit | – | blue PCB ≈ #3A6FB0 |
| Automation science pack | – | red flask ≈ #D9422B |
| Logistic science pack | – | green flask ≈ #3EB44A |
| Military science pack | – | grey/black ≈ #5C5C5C |
| Chemical science pack | – | cyan-blue ≈ #2E9FD6 |
| Production science pack | – | purple ≈ #9B4FBF |
| Utility science pack | – | yellow ≈ #E8C21B |
| Space science pack | – | white ≈ #E6E6E6 |
| Transport belt / fast / express | (0.8,0.63,0.28) | yellow #E0B31E / red #C93B2B / blue #3B7BC8 |
| Inserter (yellow) / long-handed (red) / fast (blue) / burner (grey) | – | #E4B21C / #C24A2A / #2F7FC1 / #777 |
| Water (fluid icon) / steam | (51,83,95) | blue #4A90D9 / light grey-white #DDE3E8 |

### 16.2 GUI palette (`core/prototypes/style.lua`, `gui_color`)

| Token | Value |
|---|---|
| Caption / heading text | (255,230,192) #FFE6C0 |
| Orange (progress bars, highlights) | (0.98,0.66,0.22) ≈ #FAA838; light orange (1,0.74,0.40) |
| Green / red / blue / purple text | (0,1,0) / (255,142,142) #FF8E8E / (128,206,240) #80CEF0 / (0.821,0.44,0.998) |
| Grey text / disabled | (0.5,0.5,0.5) / (179,179,179) |
| Subheader font | (241,190,100), hovered (255,230,192) |
| Glow (selected slot) | default (255,174,0,128); red (255,166,123,128); green (34,255,75,128); blue (34,181,255,128) |
| Button glows | green confirm (135,216,139,128); red back/cancel (254,90,90,128) |
| Remark / link colour | (34,181,255) |
| Search-match background | (109,86,5) |
| Shadows | (0,0,0,0.35); dirt border (15,7,3,100) |
| Panel background (from the tileset – approximate) | dark grey ≈ #313031 frame, ≈ #404040 inset slots, ≈ #8E8E8E default buttons |
| Pie progress (crafting queue) | (0.98,0.66,0.22,0.5) |

---

## 17. Stack sizes (for inventory maths)

Source: https://wiki.factorio.com/Stack

| Stack | Items |
|---|---|
| 1 | nuclear fuel, artillery shell, satellite, blueprints/planners |
| 5 | locomotive, wagons |
| 10 | lab, roboport, rocket fuel, steam engine, low-density structure |
| 20 | offshore pump, pumpjack, some equipment |
| 50 | ores, coal, stone, modules, drills, furnaces, assemblers, chests, inserters, turrets, poles, robots, solid fuel, radar, boiler |
| 100 | iron/copper/steel plate, gears, stone brick, concrete, pipes, belts, undergrounds, walls, wood, iron sticks |
| 200 | circuits, copper cable, magazines, shells, science packs (except space) |
| 2000 | space science pack |

---

## 18. Fuel values (burner GUIs)

Source: https://wiki.factorio.com/Fuel . Burn time (s) = fuel value (MJ) ÷ consumption (MW).

| Fuel | Energy | 90 kW furnace | 150 kW burner drill | 1.8 MW boiler |
|---|---|---|---|---|
| Wood | 2 MJ | 22.2 s | 13.3 s | 1.11 s |
| Coal | 4 MJ | 44.4 s | 26.7 s | 2.22 s |
| Solid fuel | 12 MJ | 133 s | 80 s | 6.67 s |
| Rocket fuel | 100 MJ | 1111 s | 667 s | 55.6 s |
| Nuclear fuel | 1.21 GJ | – | – | 672 s |

---

## 19. Miscellaneous recipe times used by the GUIs above

| Recipe | Ingredients → product | Time | Made in |
|---|---|---|---|
| Iron plate | 1 iron ore → 1 | 3.2 s | furnace |
| Copper plate | 1 copper ore → 1 | 3.2 s | furnace |
| Stone brick | 2 stone → 1 | 3.2 s | furnace |
| Steel plate | 5 iron plate → 1 | 16 s | furnace (Steel processing) |
| Iron gear wheel | 2 iron plate → 1 | 0.5 s | hand / assembler |
| Copper cable | 1 copper plate → 2 | 0.5 s | hand / assembler |
| Electronic circuit | 1 iron plate + 3 copper cable → 1 | 0.5 s | hand / assembler |
| Pipe | 1 iron plate → 1 | 0.5 s | hand / assembler |
| Transport belt | 1 iron plate + 1 gear → 2 | 0.5 s | hand / assembler |
| Inserter | 1 circuit + 1 gear + 1 iron plate → 1 | 0.5 s | hand / assembler |
| Small electric pole | 1 wood + 2 copper cable → 2 | 0.5 s | hand / assembler |
| Wooden chest | 2 wood → 1 | 0.5 s | hand / assembler |
| Stone furnace | 5 stone → 1 | 0.5 s | hand / assembler |
| Burner mining drill | 3 gear + 3 iron plate + 1 stone furnace → 1 | 2 s | hand / assembler |
| Electric mining drill | 3 circuit + 5 gear + 10 iron plate → 1 | 2 s | hand / assembler |
| Assembling machine 1 | 3 circuit + 5 gear + 9 iron plate → 1 | 0.5 s | hand / assembler |
| Lab | 10 circuit + 10 gear + 4 belt → 1 | 2 s | hand / assembler |
| Boiler | 1 stone furnace + 4 pipe → 1 | 0.5 s | hand / assembler |
| Steam engine | 8 gear + 10 iron plate + 5 pipe → 1 | 0.5 s | hand / assembler |
| Offshore pump | 2 gear + 3 pipe → 1 | 0.5 s | hand / assembler |
| Gun turret | 10 copper plate + 10 gear + 20 iron plate → 1 | 8 s | hand / assembler |
| Radar | 5 circuit + 5 gear + 10 iron plate → 1 | 0.5 s | hand / assembler |
| Automation science pack | 1 copper plate + 1 gear → 1 | 5 s | hand / assembler |
| Logistic science pack | 1 inserter + 1 belt → 1 | 6 s | hand / assembler |

Freeplay start inventory (wiki Iron plate): the player starts with 8 iron plates, 1 burner mining drill, 1 stone furnace, 1 pistol, 10 firearm magazines (1.1 default freeplay), plus a crashed ship with more.

---

## 20. Source URLs

- https://wiki.factorio.com/Keyboard_bindings
- https://wiki.factorio.com/Tutorial:Keyboard_shortcuts
- https://wiki.factorio.com/Tutorial:Quick_start_guide
- https://wiki.factorio.com/Player
- https://wiki.factorio.com/Mining
- https://wiki.factorio.com/Tree
- https://wiki.factorio.com/Rock
- https://wiki.factorio.com/Crafting
- https://wiki.factorio.com/Quickbar
- https://wiki.factorio.com/Shortcut_bar
- https://wiki.factorio.com/Ghost
- https://wiki.factorio.com/Blueprint
- https://wiki.factorio.com/Deconstruction_planner
- https://wiki.factorio.com/Stone_furnace , https://wiki.factorio.com/Steel_furnace , https://wiki.factorio.com/Electric_furnace
- https://wiki.factorio.com/Assembling_machine_1 , https://wiki.factorio.com/Assembling_machine_2 , https://wiki.factorio.com/Assembling_machine_3
- https://wiki.factorio.com/Lab , https://wiki.factorio.com/Research , https://wiki.factorio.com/Technologies , https://wiki.factorio.com/Science_pack
- https://wiki.factorio.com/Automation_(research) , https://wiki.factorio.com/Logistics_(research) , https://wiki.factorio.com/Electronics_(research) , https://wiki.factorio.com/Logistic_science_pack_(research) , https://wiki.factorio.com/Toolbelt_(research)
- https://wiki.factorio.com/Burner_mining_drill , https://wiki.factorio.com/Electric_mining_drill
- https://wiki.factorio.com/Gun_turret
- https://wiki.factorio.com/Boiler , https://wiki.factorio.com/Steam_engine , https://wiki.factorio.com/Offshore_pump , https://wiki.factorio.com/Power_production
- https://wiki.factorio.com/Small_electric_pole , https://wiki.factorio.com/Medium_electric_pole , https://wiki.factorio.com/Big_electric_pole , https://wiki.factorio.com/Substation , https://wiki.factorio.com/Electric_system
- https://wiki.factorio.com/Wooden_chest , https://wiki.factorio.com/Iron_chest , https://wiki.factorio.com/Steel_chest , https://wiki.factorio.com/Stack
- https://wiki.factorio.com/Transport_belt , https://wiki.factorio.com/Belt_transport_system , https://wiki.factorio.com/Underground_belt , https://wiki.factorio.com/Splitter
- https://wiki.factorio.com/Inserter , https://wiki.factorio.com/Inserters , https://wiki.factorio.com/Burner_inserter , https://wiki.factorio.com/Long-handed_inserter , https://wiki.factorio.com/Fast_inserter
- https://wiki.factorio.com/Pipe , https://wiki.factorio.com/Radar , https://wiki.factorio.com/Map_structure , https://wiki.factorio.com/User:Amarula/Minimap
- https://wiki.factorio.com/Alerts
- https://wiki.factorio.com/Fuel
- https://wiki.factorio.com/Iron_plate , https://wiki.factorio.com/Copper_plate , https://wiki.factorio.com/Steel_plate , https://wiki.factorio.com/Stone_brick , https://wiki.factorio.com/Iron_gear_wheel , https://wiki.factorio.com/Copper_cable , https://wiki.factorio.com/Electronic_circuit
- https://wiki.factorio.com/Version_history/0.17.0
- https://lua-api.factorio.com/latest/defines.html
- https://lua-api.factorio.com/latest/prototypes/CharacterPrototype.html
- https://lua-api.factorio.com/latest/prototypes/FurnacePrototype.html
- https://lua-api.factorio.com/latest/types/SpriteParameters.html
- https://raw.githubusercontent.com/wube/factorio-data/master/base/prototypes/entity/entities.lua
- https://raw.githubusercontent.com/wube/factorio-data/master/base/prototypes/entity/resources.lua
- https://raw.githubusercontent.com/wube/factorio-data/master/base/prototypes/entity/transport-belts.lua
- https://raw.githubusercontent.com/wube/factorio-data/master/base/prototypes/entity/mining-drill.lua
- https://raw.githubusercontent.com/wube/factorio-data/master/base/prototypes/entity/turrets.lua
- https://raw.githubusercontent.com/wube/factorio-data/master/base/prototypes/entity/character-animations.lua
- https://raw.githubusercontent.com/wube/factorio-data/master/base/prototypes/item-groups.lua
- https://raw.githubusercontent.com/wube/factorio-data/master/base/prototypes/technology.lua
- https://raw.githubusercontent.com/wube/factorio-data/master/base/prototypes/tile/tiles.lua
- https://raw.githubusercontent.com/wube/factorio-data/master/core/prototypes/utility-constants.lua
- https://raw.githubusercontent.com/wube/factorio-data/master/core/prototypes/style.lua
- https://www.factorio.com/blog/post/fff-318 (tooltips) , https://www.factorio.com/blog/post/fff-278 (quickbar) , https://factorio.com/blog/post/fff-426 (assembler GUI) , https://www.factorio.com/blog/post/fff-397 (Factoriopedia)
- https://forums.factorio.com/viewtopic.php?t=26520 (drills need ore) , https://forums.factorio.com/viewtopic.php?t=125041 (zoom limits) , https://forums.factorio.com/viewtopic.php?t=117775 , https://forums.factorio.com/viewtopic.php?t=66886 (boiler/engine GUI) , https://forums.factorio.com/viewtopic.php?t=65929 (quickbar guide) , https://forums.factorio.com/viewtopic.php?t=80720 (32 px per tile)
