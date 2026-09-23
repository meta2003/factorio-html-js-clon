# Factorio technology tree — early & mid game (automation / logistic / military science)

Facet key: `technology-tree`
Scope: every base-game technology whose research cost uses only **automation (red)**, **logistic (green)** and/or **military (grey)** science packs, plus the 2.0 "trigger" technologies that precede them, lab mechanics, the research queue, and the recipes available without any research.

Version policy: **primary values are Factorio 2.0 base game** (current wiki = 2.0.x; wiki infoboxes are bot-generated from game data). Where **1.1** differs, the 1.1 value is given in the same row or in the "1.1 vs 2.0" section. 1.1 values come from pre-October-2024 revisions of the same wiki infobox pages (fetched via the wiki API) and from the official `wube/factorio-data` 1.1.110 prototype dump. Everything not marked "1.1" is identical in both versions.

Notation: `count × time` = number of research **units** × seconds per unit. Each unit consumes **one of every listed pack**. So "Logistics 2: 200 × 30 s, red+green" = 200 automation packs + 200 logistic packs, 6 000 lab-seconds with one unmodified lab.

Sources are cited per section. Master list at the end.

---

## 1. Science packs

Source: https://wiki.factorio.com/Science_pack (recipes), https://wiki.factorio.com/Automation_science_pack_(research), https://wiki.factorio.com/Logistic_science_pack_(research), https://wiki.factorio.com/Military_science_pack_(research)

| Pack | Colour | Recipe (per craft) | Craft time | Output | Raw cost per pack | Recipe unlocked by |
|---|---|---|---|---|---|---|
| Automation science pack (`automation-science-pack`) | red | 1 copper plate + 1 iron gear wheel | 5 s | 1 | 2 iron plate + 1 copper plate | **2.0:** trigger tech "Automation science pack" (craft 1 lab). **1.1:** available from start |
| Logistic science pack (`logistic-science-pack`) | green | 1 inserter + 1 transport belt | 6 s | 1 | 5.5 iron plate + 1.5 copper plate | Research "Logistic science pack" (75 × 5 s, red) |
| Military science pack (`military-science-pack`) | grey/black | 1 piercing rounds magazine + 1 grenade + 2 stone walls | 10 s | **2** | 5.75 iron plate + 0.5 copper plate + 5 coal + 10 stone (per pack) | Research "Military science pack" (30 × 15 s, red+green) |
| Chemical science pack (`chemical-science-pack`) — next tier, listed for context | blue | 1 sulfur + 3 advanced circuit + 2 engine unit | 24 s | **2** | 12 iron + 7.5 copper + 1.5 coal + 38.46 crude oil (per pack) | Research "Chemical science pack" (75 × 10 s, red+green) |

Wiki wording: "Researching technologies requires a certain number of different types of science packs, which is then multiplied by a certain value to get the tech cost."

---

## 2. Labs

Source: https://wiki.factorio.com/Lab, https://wiki.factorio.com/Research

### 2.1 Lab entity

| Property | Value |
|---|---|
| Recipe | 10 electronic circuit + 10 iron gear wheel + 4 transport belt → 1 lab, **2 s** (raw: 36 iron plate + 15 copper plate) |
| Footprint | **3 × 3 tiles** |
| Health | **150** (2.0 quality tiers: uncommon 195, rare 240, epic 285, legendary 375 — Space Age only) |
| Energy | **60 kW** electric |
| Research speed | **1** (quality: 1.3 / 1.6 / 1.9 / 2.5 — Space Age only) |
| Module slots | **2** |
| Stack size | 10 |
| Recipe availability | **2.0:** unlocked by trigger tech "Electronics" (craft 10 copper plates). **1.1:** available from start |

### 2.2 How research is consumed

- Research progress of a technology is divided into **units**. Each unit has a **time** (seconds) and a **pack cost** (one of each listed pack type per unit).
- A lab must hold **at least one of every pack type** the technology needs; it then works on one unit at a time, using up the packs over the unit time (the packs' "durability" bar drains).
- Only **one technology is researched at a time** (globally, per force), but **any number of labs** work on it in parallel — each lab independently consumes packs and contributes units.
- Inserters can insert **and remove** science packs from labs, so labs can be **chained** (lab → inserter → lab); packs pass down the chain.
- Speed modules raise lab speed, productivity modules lower it (and add bonus progress: "productivity bonuses apply each tick; the productivity bar is simply cosmetic"), efficiency modules reduce the 60 kW draw.

### 2.3 Research time formula (wiki)

`T = (T0 × P) / (L × S)` seconds, where

- `T0` = seconds per unit (shown in the research screen),
- `P` = number of units ("price"),
- `L` = number of labs working,
- `S` = lab speed = `(1 + Br) × (1 + Mr)`; `Br` = lab research speed bonus from the "Lab research speed" technologies (0.20, 0.50, …), `Mr` = sum of module speed effects (speed modules positive, productivity modules negative). The research bonus is **multiplicative** with module effects; different module effects are additive with each other.

Example: Logistics 2 (200 × 30 s) with 4 plain labs = 200 × 30 / (4 × 1) = 1 500 s = 25 min. With 10 labs and Lab research speed 1 (+20 %): 200 × 30 / (10 × 1.2) = 500 s.

### 2.4 Lab research speed technologies

Source: https://wiki.factorio.com/Lab_research_speed_(research)

| Level | Cost | Prereq | Bonus | Cumulative |
|---|---|---|---|---|
| Lab research speed 1 (`research-speed-1`) | 100 × 30 s, red+green | Automation 2 | +20 % | 20 % |
| Lab research speed 2 (`research-speed-2`) | 200 × 30 s, red+green | LRS 1 | +30 % | 50 % |
| Lab research speed 3 | 250 × 30 s, red+green+chemical | LRS 2 | +40 % | 90 % |
| Lab research speed 4 | 500 × 30 s, red+green+chemical | LRS 3 | +50 % | 140 % |
| Lab research speed 5 | 500 × 30 s, +production | LRS 4 | +50 % | 190 % |
| Lab research speed 6 | 500 × 30 s, +utility | LRS 5 | +60 % | 250 % |

Only levels 1–2 are reachable with red+green.

---

## 3. Research GUI and queue

Source: https://wiki.factorio.com/Research, https://factorio.com/blog/post/fff-254, https://wiki.factorio.com/Version_history/0.17.0, https://wiki.factorio.com/Map_generator

| Mechanic | Detail |
|---|---|
| Open technology screen | **T** key (Switch: ZL + −). Left side: list of technologies; main pane: tree view. |
| Selecting research | Any technology whose prerequisites are all researched can be started. "The currently active research can be changed at any time; if another research is in progress, that progress will be saved" (partial progress is kept per technology; GUI shows saved progress since 0.17.77). |
| Progress display | Current research + progress bar in the **top-right** corner. |
| Research queue | Added in **0.17.0**. Queued technologies are shown in the **upper-left** corner. Add: press *Start research* while a tech is selected, **double-click** a tech, or **Shift + left-click** (Switch: ZR + A). Remove: hover the tech in the queue display and press the red X. The queue can be **reordered** at any time. When a queued tech is not yet available, techs that depend on it "may become available to be added to the queue as well and are displayed in orange" (i.e. prerequisites are queued implicitly/greyed until researched). |
| Queue length | Vanilla queue holds **7** technologies (community/mod documentation — the wiki itself does not state the number; FFF-254 describes an earlier 0.16-experimental version that held 5). |
| Queue availability | **2.0:** always on. **1.1:** map setting "Research queue availability" — *After victory (rocket launch)* (default before 1.1.92), *Always*, *Never*; "enabled by default for new games" since **1.1.92**; console `/enable-research-queue` turns it on without disabling achievements. |
| Technology price multiplier | Map-generator advanced setting, **default 1**; multiplies every technology's unit count. Marathon preset = **4**. The wiki notes the cost of **Automation** "is not affected by the technology price multiplier". |
| 1.1 "expensive" mode | 1.1 had an *expensive recipes/technology* difficulty whose `expensive-cost-multiplier` was **4×** the normal unit count (e.g. Logistic science pack 300 units, Solar energy 1000 units). Removed in 2.0. |
| Trigger technologies (2.0) | Some 2.0 technologies have **no pack cost**; they complete automatically when the player performs an action (craft N items, mine an entity). They still need their prerequisites. See §5. |
| SPM graph | Since 2.0.7 the production GUI shows a science-per-minute graph. |

---

## 4. Recipes available WITHOUT any research

Source: `wube/factorio-data` recipe.lua (`enabled = false` flags) at https://raw.githubusercontent.com/wube/factorio-data/master/base/prototypes/recipe.lua and https://raw.githubusercontent.com/wube/factorio-data/1.1.110/base/prototypes/recipe.lua ; https://wiki.factorio.com/Pistol ; https://wiki.factorio.com/Pipe_to_ground

### 4.1 Factorio 2.0 — starting recipes (12)

| Recipe | Ingredients | Craft time | Output |
|---|---|---|---|
| Iron plate | 1 iron ore | 3.2 s (furnace) | 1 |
| Copper plate | 1 copper ore | 3.2 s (furnace) | 1 |
| Stone brick | 2 stone | 3.2 s (furnace) | 1 |
| Iron gear wheel | 2 iron plate | 0.5 s | 1 |
| Wooden chest | 2 wood | 0.5 s | 1 |
| Iron chest | 8 iron plate | 0.5 s | 1 |
| Transport belt | 1 iron plate + 1 iron gear wheel | 0.5 s | **2** |
| Burner inserter | 1 iron plate + 1 iron gear wheel | 0.5 s | 1 |
| Burner mining drill | 3 iron gear wheel + 1 stone furnace + 3 iron plate | 2 s | 1 |
| Stone furnace | 5 stone | 0.5 s | 1 |
| Light armor | 40 iron plate | 3 s | 1 |
| Firearm magazine | 4 iron plate | 1 s | 1 |

Everything else is `enabled = false` in 2.0 and comes from a technology — including copper cable, electronic circuit, inserter, lab, small electric pole (→ *Electronics* trigger), pipe, pipe-to-ground, offshore pump, boiler, steam engine (→ *Steam power* trigger), automation science pack (→ *Automation science pack* trigger), electric mining drill, radar, repair pack (each has its own 2.0 research), iron stick (→ EED 1 / Railway / Concrete / Circuit network). The **pistol recipe was removed in 2.0.7**; in freeplay the player spawns with a pistol and 10 firearm magazines.

### 4.2 Factorio 1.1 — starting recipes (28)

| Recipe | Ingredients | Craft time | Output |
|---|---|---|---|
| Iron plate / Copper plate / Stone brick | as above | 3.2 s | 1 |
| Iron gear wheel | 2 iron plate | 0.5 s | 1 |
| Iron stick | 1 iron plate | 0.5 s | 2 |
| Copper cable | 1 copper plate | 0.5 s | 2 |
| Electronic circuit | 1 iron plate + 3 copper cable | 0.5 s | 1 |
| Wooden chest | 2 wood | 0.5 s | 1 |
| Iron chest | 8 iron plate | 0.5 s | 1 |
| Transport belt | 1 iron plate + 1 iron gear wheel | 0.5 s | 2 |
| Burner inserter | 1 iron plate + 1 iron gear wheel | 0.5 s | 1 |
| Inserter | 1 electronic circuit + 1 iron gear wheel + 1 iron plate | 0.5 s | 1 |
| Pipe | 1 iron plate | 0.5 s | 1 |
| Pipe to ground | 5 iron plate + 10 pipe | 0.5 s | 2 |
| Offshore pump | 2 electronic circuit + 1 pipe + 1 iron gear wheel | 0.5 s | 1 |
| Boiler | 1 stone furnace + 4 pipe | 0.5 s | 1 |
| Steam engine | 8 iron gear wheel + 5 pipe + 10 iron plate | 0.5 s | 1 |
| Burner mining drill | 3 iron gear wheel + 1 stone furnace + 3 iron plate | 2 s | 1 |
| Electric mining drill | 3 electronic circuit + 5 iron gear wheel + 10 iron plate | 2 s | 1 |
| Stone furnace | 5 stone | 0.5 s | 1 |
| Small electric pole | 1 wood + 2 copper cable | 0.5 s | 2 |
| Lab | 10 electronic circuit + 10 iron gear wheel + 4 transport belt | 2 s | 1 |
| Radar | 5 electronic circuit + 5 iron gear wheel + 10 iron plate | 0.5 s | 1 |
| Repair pack | 2 electronic circuit + 2 iron gear wheel | 0.5 s | 1 |
| Automation science pack | 1 copper plate + 1 iron gear wheel | 5 s | 1 |
| Pistol | 5 copper plate + 5 iron plate | 5 s | 1 |
| Firearm magazine | 4 iron plate | 1 s | 1 |
| Light armor | 40 iron plate | 3 s | 1 |

(2.0 crafting times of the shared recipes are the same as 1.1 except where another facet says otherwise.)

---

## 5. Tier 0 — 2.0 trigger technologies (no science packs)

Source: https://wiki.factorio.com/Steam_power_(research), https://wiki.factorio.com/Electronics_(research), https://wiki.factorio.com/Automation_science_pack_(research), https://wiki.factorio.com/Steel_axe_(research), https://wiki.factorio.com/Oil_processing_(research), https://wiki.factorio.com/Uranium_processing_(research), https://wiki.factorio.com/Technologies (all infobox fields read via `api.php?action=parse&page=Infobox:<name>`). All introduced in **2.0.7**.

| Technology (internal) | Prerequisites | Trigger | Unlocks | Leads to |
|---|---|---|---|---|
| Steam power (`steam-power`) | none | craft **50 iron plate** | boiler, offshore pump, pipe, pipe to ground, steam engine | Automation science pack |
| Electronics (`electronics`) | none | craft **10 copper plate** | copper cable, electronic circuit, inserter, lab, small electric pole | Automation science pack |
| Automation science pack (`automation-science-pack`) | Steam power + Electronics | craft **1 lab** | automation science pack (recipe) | Automation, Electric mining drill, Fast inserter, Gun turret, Lamp, Logistic science pack, Logistics, Military, Radar, Repair pack, Steel processing, Stone wall |
| Steel axe (`steel-axe`) | Steel processing | craft **50 steel plate** | character mining speed **+100 %** (0.5 → 1.0) | — |
| Oil processing (`oil-processing`) | Oil gathering | mine **1 crude oil** | oil refinery, basic oil processing, chemical plant, solid fuel from petroleum gas | Flammables, Plastics, Sulfur processing |
| Uranium processing (`uranium-processing`) | Uranium mining (needs chemical packs → out of scope) | mine **1 uranium ore** | centrifuge, uranium processing | Kovarex, Nuclear power, Uranium ammo |

1.1 equivalents: **Electronics** was a normal research (30 × 15 s red, prereq Automation, no recipe unlocks — a gate tech); **Steel axe** was 50 × 30 s red (prereq Steel processing); **Oil processing** was 100 × 30 s red+green (prereq Fluid handling) and also unlocked the **pumpjack**; **Uranium processing** was 200 × 30 s red+green+chemical (prereqs Chemical science pack + Concrete). Steam power / Automation science pack did not exist (their recipes were starting recipes).

---

## 6. Red-only technologies (automation science pack)

Source: individual wiki pages `https://wiki.factorio.com/<Name>_(research)` and their `Infobox:` pages; 1.1 values from `factorio-data` 1.1.110 technology.lua.

| Technology (internal) | Prereqs (2.0) | Cost | Total packs / lab-s | Unlocks (2.0) | Leads to | 1.1 differences |
|---|---|---|---|---|---|---|
| **Automation** (`automation`) | Automation science pack | **10 × 10 s** | 10 red / 100 s | assembling machine 1, long-handed inserter | Automation 2 | 1.1: no prereqs |
| **Logistics** (`logistics`) | Automation science pack | **20 × 15 s** | 20 red / 300 s | underground belt, splitter | Logistics 2 | 1.1: no prereqs |
| **Electric mining drill** (`electric-mining-drill`) — new in 2.0.7 | Automation science pack | **25 × 10 s** | 25 red / 250 s | electric mining drill | (Big mining drill, Space Age) | 1.1: drill is a starting recipe |
| **Radar** (`radar`) — new in 2.0.7 | Automation science pack | **20 × 10 s** | 20 red / 200 s | radar | Artillery, Rocket silo, Spidertron | 1.1: starting recipe |
| **Repair pack** (`repair-pack`) — new in 2.0.7 | Automation science pack | **25 × 10 s** | 25 red / 250 s | repair pack | — | 1.1: starting recipe |
| **Gun turret** (`gun-turret`) ("Turrets") | Automation science pack | **10 × 10 s** | 10 red / 100 s | gun turret | — | 1.1: no prereqs |
| **Military** (`military`) | Automation science pack | **10 × 15 s** | 10 red / 150 s | submachine gun, shotgun, shotgun shells | Military 2, Heavy armor, Physical projectile damage 1, Weapon shooting speed 1 | 1.1: no prereqs |
| **Stone wall** (`stone-wall`) | Automation science pack | **10 × 10 s** | 10 red / 100 s | stone wall | Gate, Military science pack | 1.1: no prereqs |
| **Lamp** (`lamp`) — 1.1 name **Optics** (`optics`) | Automation science pack | **10 × 15 s** | 10 red / 150 s | small lamp | Solar energy | 1.1: no prereqs; Optics was a prereq of Solar energy |
| **Fast inserter** (`fast-inserter`) | Automation science pack | **30 × 15 s** | 30 red / 450 s | fast inserter | Bulk inserter | 1.1: prereq Electronics; also unlocked **filter inserter** (removed in 2.0) |
| **Steel processing** (`steel-processing`) | Automation science pack | **50 × 5 s** | 50 red / 250 s | steel plate, steel chest | Advanced material processing, Automation 2, EED 1, Engine, Heavy armor, Military 2, Solar energy, Steel axe | 1.1: no prereqs |
| **Logistic science pack** (`logistic-science-pack`) | Automation science pack | **75 × 5 s** | 75 red / 375 s | logistic science pack | Advanced material processing, Automation 2, Circuit network, EED 1, Engine, Landfill, Logistics 2, Military 2, PPD 2, Solar energy, Toolbelt, WSS 2 | 1.1: no prereqs |
| **Heavy armor** (`heavy-armor`) | Military + Steel processing | **30 × 30 s** | 30 red / 900 s | heavy armor | Modular armor | same |
| **Physical projectile damage 1** (`physical-projectile-damage-1`) | Military | **100 × 30 s** | 100 red / 3 000 s | bullet damage +10 %, shotgun shell damage +10 %, gun turret damage +10 % | PPD 2 | same |
| **Weapon shooting speed 1** (`weapon-shooting-speed-1`) | Military | **100 × 30 s** | 100 red / 3 000 s | bullet shooting speed +10 %, shotgun shell +10 % | WSS 2 | same |
| **Electronics** (1.1 only as research) | Automation | 30 × 15 s | 30 red / 450 s | nothing (gate) | Fast inserter, Automation 2, EED 1, Solar energy, Circuit network | 2.0: trigger tech |
| **Steel axe** (1.1 only as research) | Steel processing | 50 × 30 s | 50 red / 1 500 s | mining speed +100 % | — | 2.0: trigger tech |

---

## 7. Red + green technologies (automation + logistic science packs)

Source: wiki pages / `Infobox:` pages for each tech (URLs in §12); 1.1 values from pre-2.0 infobox revisions and 1.1.110 technology.lua.

### 7.1 Production, power, logistics

| Technology (internal) | Prereqs (2.0) | Cost | Total packs / lab-s | Unlocks | Leads to | 1.1 differences |
|---|---|---|---|---|---|---|
| **Automation 2** (`automation-2`) | Automation + Steel processing + Logistic science pack | **40 × 15 s** | 40 R + 40 G / 600 s | assembling machine 2 | Concrete, Fluid handling, Lab research speed 1 | 1.1 prereqs: Electronics + Steel processing + LSP |
| **Logistics 2** (`logistics-2`) | Logistics + LSP | **200 × 30 s** | 200 R + 200 G / 6 000 s | fast transport belt, fast underground belt, fast splitter | Automobilism, Bulk inserter, Railway | same |
| **Toolbelt** (`toolbelt`) | LSP | **100 × 30 s** | 100 R + 100 G / 3 000 s | character inventory **+10 slots** | — | same |
| **Electric energy distribution 1** (`electric-energy-distribution-1`) | Steel processing + LSP | **120 × 30 s** | 120 R + 120 G / 3 600 s | medium electric pole, big electric pole, iron stick (2.0) | Electric energy accumulators, EED 2 | 1.1 prereqs also Electronics; no iron stick |
| **Solar energy** (`solar-energy`) | Steel processing + LSP | **250 × 30 s** | 250 R + 250 G / 7 500 s | solar panel | Portable solar panel, Rocket silo | 1.1 prereqs: Electronics + LSP + Optics + Steel processing; led to Space science pack |
| **Electric energy accumulators** (`electric-energy-accumulators`) | EED 1 + Battery | **150 × 30 s** | 150 R + 150 G / 4 500 s | accumulator | Rocket silo (1.1: Space science pack) | same cost & prereqs (Battery needs oil → mid game) |
| **Advanced material processing** (`advanced-material-processing`) | Steel processing + LSP | **75 × 30 s** | 75 R + 75 G / 2 250 s | steel furnace | AMP 2, Concrete, Low density structure | same |
| **Concrete** (`concrete`) | Advanced material processing + Automation 2 | **250 × 30 s** | 250 R + 250 G / 7 500 s | concrete, hazard concrete, refined concrete, refined hazard concrete, iron stick (2.0) | Artillery, Rocket silo, Uranium mining | 1.1: also led to Uranium processing |
| **Engine** (`engine`) | Steel processing + LSP | **100 × 15 s** | 100 R + 100 G / 1 500 s | engine unit | Automobilism, Fluid handling, Railway | same |
| **Landfill** (`landfill`) | LSP | **50 × 30 s** | 50 R + 50 G / 1 500 s | landfill | — | same |
| **Lab research speed 1** (`research-speed-1`) | Automation 2 | **100 × 30 s** | 100 R + 100 G / 3 000 s | lab speed +20 % | LRS 2 | same |
| **Lab research speed 2** (`research-speed-2`) | LRS 1 | **200 × 30 s** | 200 R + 200 G / 6 000 s | lab speed +30 % (cum. 50 %) | LRS 3 (chemical) | same |
| **Circuit network** (`circuit-network`) | LSP | **100 × 15 s** | 100 R + 100 G / 1 500 s | arithmetic combinator, decider combinator, constant combinator, power switch, programmable speaker, display panel (2.0), iron stick (2.0) | Advanced combinators (2.0) | 1.1 prereqs: Electronics + LSP; unlocked red wire & green wire instead of display panel/iron stick |
| **Railway** (`railway`) | Logistics 2 + Engine | **75 × 30 s** | 75 R + 75 G / 2 250 s | rail (straight), locomotive, cargo wagon, iron stick (2.0) | Automated rail transportation, Braking force 1, Fluid wagon, Production science pack | same cost/prereqs |
| **Automated rail transportation** (`automated-rail-transportation`) | Railway | **200 × 30 s** (2.0) | 200 R + 200 G / 6 000 s | train stop, rail signal, rail chain signal | — | **1.1: 75 × 30 s**, train stop only; signals were a separate tech **Rail signals** (`rail-signals`, 100 × 30 s red+green, prereq Automated rail transportation) — removed in 2.0 |
| **Fluid wagon** (`fluid-wagon`) | Fluid handling + Railway | **200 × 30 s** | 200 R + 200 G / 6 000 s | fluid wagon | — | same |
| **Automobilism** (`automobilism`) | Logistics 2 + Engine | **100 × 30 s** | 100 R + 100 G / 3 000 s | car | Tank | same |
| **Fluid handling** (`fluid-handling`) | Automation 2 + Engine | **50 × 15 s** | 50 R + 50 G / 750 s | storage tank, pump, barrel, fill/empty barrel recipes (water, crude oil, heavy oil, light oil, petroleum gas, lubricant, sulfuric acid) | Fluid wagon, Oil gathering (2.0) / Oil processing (1.1) | same cost |
| **Oil gathering** (`oil-gathering`) — new in 2.0.7 | Fluid handling | **100 × 30 s** | 100 R + 100 G / 3 000 s | pumpjack | Oil processing (trigger) | 1.1: pumpjack came from Oil processing (100 × 30 s) |
| **Plastics** (`plastics`) | Oil processing | **200 × 30 s** | 200 R + 200 G / 6 000 s | plastic bar | Advanced circuit | same |
| **Sulfur processing** (`sulfur-processing`) | Oil processing | **150 × 30 s** | 150 R + 150 G / 4 500 s | sulfur, sulfuric acid | Battery, Chemical science pack, Explosives | same |
| **Battery** (`battery`) | Sulfur processing | **150 × 30 s** | 150 R + 150 G / 4 500 s | battery | Personal battery, Electric energy accumulators, Laser, Robotics | same |
| **Advanced circuit** (`advanced-circuit`) — 1.1 name **Advanced electronics** (`advanced-electronics`) | Plastics | **200 × 15 s** | 200 R + 200 G / 3 000 s | advanced circuit | Bulk inserter, Chemical science pack, Mining productivity 1, Modular armor, Modules | rename only |
| **Chemical science pack** (`chemical-science-pack`) | Advanced circuit + Sulfur processing | **75 × 10 s** | 75 R + 75 G / 750 s | chemical science pack | (blue-science tier) | same |
| **Flammables** (`flammables`) | Oil processing | **50 × 30 s** | 50 R + 50 G / 1 500 s | (no recipe — gate) | Flamethrower, Rocket fuel, Rocketry | same |
| **Explosives** (`explosives`) | Sulfur processing | **100 × 15 s** | 100 R + 100 G / 1 500 s | explosives | Cliff explosives, Land mines, Military 4, Rocketry, Tank | same |
| **Cliff explosives** (`cliff-explosives`) | Explosives + Military 2 | **200 × 15 s** | 200 R + 200 G / 3 000 s | cliff explosives (+ enables cliff deconstruction) | — | same in base 2.0 (Space Age moves it to Vulcanus: 500 × 30 s with metallurgic packs) |
| **Modules** (`modules`) | Advanced circuit | **100 × 30 s** | 100 R + 100 G / 3 000 s | (no recipe — gate) | Speed module, Efficiency module, Productivity module | 1.1 prereq: Advanced electronics |
| **Speed module** (`speed-module`) | Modules | **50 × 30 s** | 50 R + 50 G / 1 500 s | speed module (1) | Speed module 2, Automation 3, Destroyer | same |
| **Efficiency module** (`efficiency-module`; 1.1 internal `effectivity-module`) | Modules | **50 × 30 s** | 50 R + 50 G / 1 500 s | efficiency module (1) | Efficiency module 2 | internal rename only |
| **Productivity module** (`productivity-module`) | Modules | **50 × 30 s** | 50 R + 50 G / 1 500 s | productivity module (1) | Productivity module 2, Production science pack | same |
| **Mining productivity 1** (`mining-productivity-1`) | Advanced circuit | **250 × 60 s** | 250 R + 250 G / 15 000 s | mining drill productivity **+10 %** | Mining productivity 2 (chemical) | 1.1 prereq: Advanced electronics |
| **Bulk inserter** (`bulk-inserter`) — 1.1 **Stack inserter** (`stack-inserter`) | Fast inserter + Logistics 2 + Advanced circuit | **150 × 30 s** | 150 R + 150 G / 4 500 s | bulk inserter; bulk-inserter capacity +1 | Inserter capacity bonus 1 | 1.1 also unlocked stack filter inserter (removed in 2.0) |
| **Inserter capacity bonus 1** (`inserter-capacity-bonus-1`) | Bulk inserter | **200 × 30 s** | 200 R + 200 G / 6 000 s | 2.0: regular inserter +1 (→2), bulk inserter +1 (→3) | ICB 2 | 1.1: stack inserter +1 (→3) only |
| **Inserter capacity bonus 2** (`inserter-capacity-bonus-2`) | ICB 1 | **250 × 30 s** | 250 R + 250 G / 7 500 s | 2.0: inserter +1 (→3), bulk +1 (→4) | ICB 3 (chemical) | 1.1: inserter +1 (→2), stack +1 (→4) |

### 7.2 Military & armor (red + green)

| Technology (internal) | Prereqs (2.0) | Cost | Total packs / lab-s | Unlocks / bonus | Leads to | 1.1 differences |
|---|---|---|---|---|---|---|
| **Military 2** (`military-2`) | Military + Steel processing + LSP | **20 × 15 s** | 20 R + 20 G / 300 s | piercing rounds magazine, grenade | Cliff explosives, Gate, Military science pack, Stronger explosives 1 | same |
| **Military science pack** (`military-science-pack`) | Military 2 + Stone wall | **30 × 15 s** | 30 R + 30 G / 450 s | military science pack | Defender, Energy shield equipment, Flamethrower, Land mines, Laser turret*, Laser shooting speed 1*, Laser weapons damage 1*, Military 3*, PPD 3, Rocketry, Stronger explosives 2, WSS 3, Portable fission reactor* (*need chemical too) | same |
| **Gate** (`gate`) | Stone wall + Military 2 | **100 × 30 s** | 100 R + 100 G / 3 000 s | gate | — | same |
| **Stronger explosives 1** (`stronger-explosives-1`) | Military 2 | **100 × 30 s** | 100 R + 100 G / 3 000 s | grenade (incl. cluster grenade) damage **+25 %** | SE 2 | same |
| **Physical projectile damage 2** (`physical-projectile-damage-2`) | PPD 1 + LSP | **200 × 30 s** | 200 R + 200 G / 6 000 s | bullet +10 %, shotgun shell +10 %, gun turret +10 % (cum. 20 %) | PPD 3 | same |
| **Weapon shooting speed 2** (`weapon-shooting-speed-2`) | WSS 1 + LSP | **200 × 30 s** | 200 R + 200 G / 6 000 s | bullet +20 %, shotgun shell +20 % (cum. 30 %) | WSS 3 | same |
| **Modular armor** (`modular-armor`) | Heavy armor + Advanced circuit | **100 × 30 s** | 100 R + 100 G / 3 000 s | modular armor | Power armor, Portable solar panel | 1.1 prereq: Advanced electronics |
| **Portable solar panel** (`solar-panel-equipment`) | Modular armor + Solar energy | **100 × 15 s** | 100 R + 100 G / 1 500 s | portable solar panel (equipment) | Personal battery, Belt immunity, Discharge defense, Energy shield, Exoskeleton, Nightvision, Personal laser defense, Personal roboport | same |
| **Personal battery** (`battery-equipment`) | Battery + Portable solar panel | **50 × 15 s** | 50 R + 50 G / 750 s | personal battery (equipment) | Personal battery MK2 | same |
| **Nightvision equipment** (`night-vision-equipment`) | Portable solar panel | **50 × 15 s** | 50 R + 50 G / 750 s | nightvision equipment | — | same |
| **Belt immunity equipment** (`belt-immunity-equipment`) | Portable solar panel | **50 × 15 s** | 50 R + 50 G / 750 s | belt immunity equipment | — | same |

---

## 8. Red + green + grey technologies (automation + logistic + military science packs)

Source: https://wiki.factorio.com/Flamethrower_(research), https://wiki.factorio.com/Land_mines_(research), https://wiki.factorio.com/Defender_(research), https://wiki.factorio.com/Rocketry_(research), https://wiki.factorio.com/Energy_shield_equipment_(research), https://wiki.factorio.com/Stronger_explosives_(research), https://wiki.factorio.com/Refined_flammables_(research), https://wiki.factorio.com/Physical_projectile_damage_(research), https://wiki.factorio.com/Weapon_shooting_speed_(research), https://wiki.factorio.com/Follower_robot_count_(research)

| Technology (internal) | Prereqs | Cost | Total packs / lab-s | Unlocks / bonus | Leads to | 1.1 differences |
|---|---|---|---|---|---|---|
| **Flamethrower** (`flamethrower`) | Flammables + Military science pack | **50 × 30 s** | 50 each / 1 500 s | flamethrower, flamethrower ammo, flamethrower turret | Refined flammables 1 | same |
| **Land mines** (`land-mine`) | Explosives + Military science pack | **100 × 30 s** | 100 each / 3 000 s | land mine (recipe: 2 explosives + 1 steel plate → 4, 5 s; 250 explosion dmg, 2.5-tile trigger, 6-tile damage radius) | — | same |
| **Defender** (`defender`) | Military science pack | **100 × 30 s** | 100 each / 3 000 s | defender capsule; raises max follower robots (wiki: cumulative follower count is 10 after FRC 1 because Defender itself adds +4 on top of the base 1) | Distractor, Follower robot count 1 | same |
| **Follower robot count 1** (`follower-robot-count-1`) | Defender | **100 × 30 s** | 100 each / 3 000 s | +5 follower robots (cum. 10) | FRC 2 | (1.1 level costs not re-verified) |
| **Follower robot count 2** (`follower-robot-count-2`) | FRC 1 | **200 × 30 s** | 200 each / 6 000 s | +10 (cum. 20) | FRC 3 (chemical) | |
| **Rocketry** (`rocketry`) | Explosives + Flammables + Military science pack | **120 × 15 s** | 120 each / 1 800 s | rocket launcher, rocket | Atomic bomb, Explosive rocketry, Spidertron | same |
| **Energy shield equipment** (`energy-shield-equipment`) | Military science pack + Portable solar panel | **150 × 15 s** | 150 each / 2 250 s | energy shield (equipment) | Energy shield MK2 | same |
| **Stronger explosives 2** (`stronger-explosives-2`) | SE 1 + Military science pack | **200 × 30 s** | 200 each / 6 000 s | grenade +20 % (cum. 45 %), land mine +20 % | SE 3 (chemical) | same |
| **Refined flammables 1** (`refined-flammables-1`) | Flamethrower | **100 × 30 s** | 100 each / 3 000 s | flamethrower ammo +20 %, flamethrower turret +20 % | RF 2 | same |
| **Refined flammables 2** (`refined-flammables-2`) | RF 1 | **200 × 30 s** | 200 each / 6 000 s | +20 % (cum. 40 %) | RF 3 (chemical) | same |
| **Physical projectile damage 3** (`physical-projectile-damage-3`) | PPD 2 + Military science pack | **300 × 60 s** | 300 each / 18 000 s | bullet +20 %, shotgun shell +20 %, gun turret +20 % (cum. 40 %) | PPD 4 | same |
| **Physical projectile damage 4** (`physical-projectile-damage-4`) | PPD 3 | **400 × 60 s** | 400 each / 24 000 s | +20 % each (cum. 60 %) | PPD 5 (chemical) | same |
| **Weapon shooting speed 3** (`weapon-shooting-speed-3`) | WSS 2 + Military science pack | **300 × 60 s** | 300 each / 18 000 s | bullet +20 %, shotgun shell +20 %, rocket +50 % (cum. bullets 50 %) | WSS 4 | same |
| **Weapon shooting speed 4** (`weapon-shooting-speed-4`) | WSS 3 | **400 × 60 s** | 400 each / 24 000 s | bullet +30 %, shotgun shell +30 %, rocket +70 % (cum. bullets 80 %) | WSS 5 (chemical) | same |

Next tier (needs **chemical** packs, listed only so the boundary is clear): Military 3 (100 × 30 s, R+G+M+C: poison capsule, slowdown capsule, piercing shotgun shells [1.1: combat shotgun]), Laser (→ Laser turret 150 × 30 s R+G+M), Tank, Braking force 1 (100 × 30 s R+G+C), Lab research speed 3, PPD 5, WSS 5, SE 3, RF 3, Mining productivity 2, Uranium mining, Advanced oil processing, Electric engine, Robotics, etc.

---

## 9. Bonus technology chains — full ladders (for reference)

Source: https://wiki.factorio.com/Physical_projectile_damage_(research), https://wiki.factorio.com/Weapon_shooting_speed_(research), https://wiki.factorio.com/Stronger_explosives_(research), https://wiki.factorio.com/Mining_productivity_(research), https://wiki.factorio.com/Inserter_capacity_bonus_(research)

### 9.1 Physical projectile damage (bullets, shotgun shells, gun turrets; from level 5 also cannon shells)

| Level | Cost | Packs | Per level | Cumulative |
|---|---|---|---|---|
| 1 | 100 × 30 s | R | +10 % | 10 % |
| 2 | 200 × 30 s | R G | +10 % | 20 % |
| 3 | 300 × 60 s | R G M | +20 % | 40 % |
| 4 | 400 × 60 s | R G M | +20 % | 60 % |
| 5 | 500 × 60 s | R G M C | +20 % | 80 % |
| 6 | 600 × 60 s | R G M C U | +40 % | 120 % |
| 7+ (infinite) | 2^(L−7) × 1000 × 60 s | R G M C U Space | +40 % | — |

### 9.2 Weapon shooting speed (bullets, shotgun shells; rockets from level 3; cannon shells later)

| Level | Cost | Packs | Per level (bullets) | Cumulative |
|---|---|---|---|---|
| 1 | 100 × 30 s | R | +10 % | 10 % |
| 2 | 200 × 30 s | R G | +20 % | 30 % |
| 3 | 300 × 60 s | R G M | +20 % (rocket +50 %) | 50 % |
| 4 | 400 × 60 s | R G M | +30 % (rocket +70 %) | 80 % |
| 5 | 500 × 60 s | R G M C | +30 % | 110 % |
| 6 | 600 × 60 s | R G M C U | +40 % | 150 % |

### 9.3 Stronger explosives (grenades; land mines from 2; rockets later)

| Level | Cost | Packs | Per level | Cumulative |
|---|---|---|---|---|
| 1 | 100 × 30 s | R G | +25 % | 25 % |
| 2 | 200 × 30 s | R G M | +20 % | 45 % |
| 3 | 300 × 60 s | R G M C | +20 % | 65 % |
| 4 | 400 × 60 s | R G M C U | +20 % | 85 % |
| 5–6 | 500 / 600 × 60 s | + Space | +20 % | 105 / 125 % |
| 7+ | 2^(L−7) × 1000 | + Space | +20 % | — |

### 9.4 Mining productivity

| Level | Cost | Packs | Bonus |
|---|---|---|---|
| 1 | 250 × 60 s | R G | +10 % |
| 2 | 500 × 60 s | R G C | +10 % |
| 3 | 1000 × 60 s | R G C P U | +10 % |
| 4+ | 2500 × (L−3) × 60 s | + Space | +10 % per level |

### 9.5 Inserter capacity bonus (2.0 values; 1.1 in brackets)

| Level | Cost | Packs | Regular inserter | Bulk (1.1 stack) inserter |
|---|---|---|---|---|
| base | — | — | 1 | 2 |
| 1 | 200 × 30 s | R G | +1 → 2 (1.1: no change) | +1 → 3 |
| 2 | 250 × 30 s | R G | +1 → 3 (1.1: +1 → 2) | +1 → 4 |
| 3 | 250 × 30 s | R G C | +1 → 4 (1.1: —) | +1 → 5 |
| 4 | 250 × 30 s | R G C P | +1 → 5 | +1 → 6 |
| 5 | 300 × 30 s | R G C P | +2 → 7 | +2 → 8 |
| 6 | 400 × 30 s | R G C P | +2 → 9 | +2 → 10 |
| 7 | 600 × 30 s | R G C P U | +1 → 10 (1.1: +1 → 3) | +2 → 12 |

---

## 10. Dependency list (2.0) — prerequisites per technology

Compact adjacency for implementers. Internal name → prerequisites (internal names). "ASP" = `automation-science-pack`, "LSP" = `logistic-science-pack`, "MSP" = `military-science-pack`.

| Tech | Prereqs | Tech | Prereqs |
|---|---|---|---|
| steam-power | — | electronics | — |
| automation-science-pack | steam-power, electronics | automation | ASP |
| logistics | ASP | electric-mining-drill | ASP |
| radar | ASP | repair-pack | ASP |
| gun-turret | ASP | military | ASP |
| stone-wall | ASP | lamp | ASP |
| fast-inserter | ASP | steel-processing | ASP |
| logistic-science-pack | ASP | steel-axe | steel-processing |
| heavy-armor | military, steel-processing | physical-projectile-damage-1 | military |
| weapon-shooting-speed-1 | military | military-2 | military, steel-processing, LSP |
| military-science-pack | military-2, stone-wall | gate | stone-wall, military-2 |
| stronger-explosives-1 | military-2 | automation-2 | automation, steel-processing, LSP |
| logistics-2 | logistics, LSP | toolbelt | LSP |
| electric-energy-distribution-1 | steel-processing, LSP | solar-energy | steel-processing, LSP |
| advanced-material-processing | steel-processing, LSP | concrete | advanced-material-processing, automation-2 |
| engine | steel-processing, LSP | landfill | LSP |
| research-speed-1 | automation-2 | research-speed-2 | research-speed-1 |
| circuit-network | LSP | railway | logistics-2, engine |
| automated-rail-transportation | railway | fluid-wagon | fluid-handling, railway |
| automobilism | logistics-2, engine | fluid-handling | automation-2, engine |
| oil-gathering | fluid-handling | oil-processing (trigger) | oil-gathering |
| plastics | oil-processing | sulfur-processing | oil-processing |
| battery | sulfur-processing | advanced-circuit | plastics |
| chemical-science-pack | advanced-circuit, sulfur-processing | electric-energy-accumulators | electric-energy-distribution-1, battery |
| flammables | oil-processing | explosives | sulfur-processing |
| cliff-explosives | explosives, military-2 | modules | advanced-circuit |
| speed-module | modules | efficiency-module | modules |
| productivity-module | modules | mining-productivity-1 | advanced-circuit |
| bulk-inserter | fast-inserter, logistics-2, advanced-circuit | inserter-capacity-bonus-1 | bulk-inserter |
| physical-projectile-damage-2 | physical-projectile-damage-1, LSP | weapon-shooting-speed-2 | weapon-shooting-speed-1, LSP |
| modular-armor | heavy-armor, advanced-circuit | solar-panel-equipment | modular-armor, solar-energy |
| battery-equipment | battery, solar-panel-equipment | night-vision-equipment | solar-panel-equipment |
| belt-immunity-equipment | solar-panel-equipment | energy-shield-equipment | MSP, solar-panel-equipment |
| flamethrower | flammables, MSP | land-mine | explosives, MSP |
| defender | MSP | follower-robot-count-1 | defender |
| rocketry | explosives, flammables, MSP | stronger-explosives-2 | stronger-explosives-1, MSP |
| refined-flammables-1 | flamethrower | refined-flammables-2 | refined-flammables-1 |
| physical-projectile-damage-3 | physical-projectile-damage-2, MSP | physical-projectile-damage-4 | physical-projectile-damage-3 |
| weapon-shooting-speed-3 | weapon-shooting-speed-2, MSP | weapon-shooting-speed-4 | weapon-shooting-speed-3 |

1.1 prerequisite deltas: automation/logistics/optics/gun-turret/military/stone-wall/steel-processing/logistic-science-pack have **no** prerequisites; electronics ← automation; fast-inserter ← electronics; automation-2 ← electronics, steel-processing, LSP; electric-energy-distribution-1 ← electronics, steel-processing, LSP; solar-energy ← optics, electronics, steel-processing, LSP; circuit-network ← electronics, LSP; oil-processing ← fluid-handling (normal research); rail-signals ← automated-rail-transportation; stack-inserter ← fast-inserter, logistics-2, advanced-electronics; modules/mining-productivity-1/modular-armor ← advanced-electronics; steel-axe ← steel-processing (normal research).

---

## 11. Typical early-game research order (derived from the tables)

1. (2.0) craft 50 iron plates → Steam power; craft 10 copper plates → Electronics; craft a lab → Automation science pack.
2. Automation (10 red) → Logistics (20) → Electric mining drill (25, 2.0) → Gun turret (10) / Military (10) / Stone wall (10) as needed → Steel processing (50) → Logistic science pack (75) → Radar (20, 2.0), Repair pack (25, 2.0), Fast inserter (30), Lamp (10).
   Total red-only core: ≈ 10+20+25+10+10+10+50+75 = 210 red packs.
3. Green tier: Automation 2 (40) → Military 2 (20) → Military science pack (30) → Engine (100) → Logistics 2 (200) → Toolbelt (100) → EED 1 (120) → Advanced material processing (75) → Railway (75) / Automobilism (100) → Fluid handling (50) → Oil gathering (100, 2.0) → mine crude oil → Plastics (200) / Sulfur processing (150) → Advanced circuit (200) → Chemical science pack (75).
4. Grey tier in parallel: PPD 1–4, WSS 1–4, Stronger explosives 1–2, Flamethrower, Land mines, Defender, Rocketry.

---

## 12. 1.1 → 2.0 change summary (tech tree)

| Change | Detail |
|---|---|
| New trigger techs (2.0.7) | Steam power (craft 50 iron plate), Electronics (craft 10 copper plate; now unlocks copper cable, electronic circuit, inserter, lab, small pole), Automation science pack (craft 1 lab), Steel axe (craft 50 steel plate; was 50 × 30 s red), Oil processing (mine crude oil; was 100 × 30 s R+G), Uranium processing (mine uranium ore; was 200 × 30 s R+G+C). |
| New pack-cost techs (2.0.7) | Electric mining drill 25 × 10 s red; Radar 20 × 10 s red; Repair pack 25 × 10 s red; Oil gathering 100 × 30 s R+G (pumpjack). These recipes were starting recipes (or part of Oil processing) in 1.1. |
| Renames | Optics → Lamp; Advanced electronics → Advanced circuit; Stack inserter → Bulk inserter; effectivity-module → efficiency-module (internal); Battery equipment → Personal battery (already in 0.17). |
| Removed | Rail signals research (signals now in Automated rail transportation, whose cost rose 75 → 200 units); Filter inserter & Stack filter inserter (all inserters have filters); red/green wire recipes (wires are free); Pistol recipe; expensive/marathon 4× tech multiplier mode (replaced by the price-multiplier slider only). |
| Recipe moves | Iron stick is no longer a starting recipe — unlocked by EED 1, Railway, Concrete or Circuit network. Display panel added to Circuit network. |
| Prerequisite simplification | Tier-1 techs now require "Automation science pack"; Electronics research no longer gates Automation 2 / EED 1 / Circuit network / Fast inserter; Solar energy no longer needs Optics. |
| Research queue | Always enabled in 2.0 (default since 1.1.92); 1.1 had the "Research queue availability" map setting. |
| Labs | Unchanged stats (60 kW, 3×3, speed 1, 2 module slots); quality tiers only with Space Age. |

---

## 13. Sources

Primary (wiki, 2.0):
- https://wiki.factorio.com/Technologies
- https://wiki.factorio.com/Research
- https://wiki.factorio.com/Lab
- https://wiki.factorio.com/Science_pack
- https://wiki.factorio.com/Map_generator
- https://wiki.factorio.com/Automation_(research) · https://wiki.factorio.com/Logistics_(research) · https://wiki.factorio.com/Electronics_(research) · https://wiki.factorio.com/Gun_turret_(research) · https://wiki.factorio.com/Military_(research) · https://wiki.factorio.com/Military_2_(research) · https://wiki.factorio.com/Stone_wall_(research) · https://wiki.factorio.com/Steel_processing_(research) · https://wiki.factorio.com/Logistic_science_pack_(research) · https://wiki.factorio.com/Automation_2_(research) · https://wiki.factorio.com/Fast_inserter_(research) · https://wiki.factorio.com/Logistics_2_(research) · https://wiki.factorio.com/Steel_axe_(research) · https://wiki.factorio.com/Weapon_shooting_speed_(research) · https://wiki.factorio.com/Physical_projectile_damage_(research) · https://wiki.factorio.com/Lamp_(research) (Optics redirects here) · https://wiki.factorio.com/Toolbelt_(research) · https://wiki.factorio.com/Electric_energy_distribution_1_(research) · https://wiki.factorio.com/Solar_energy_(research) · https://wiki.factorio.com/Electric_energy_accumulators_(research) · https://wiki.factorio.com/Military_science_pack_(research) · https://wiki.factorio.com/Heavy_armor_(research) · https://wiki.factorio.com/Engine_(research) · https://wiki.factorio.com/Landfill_(research) · https://wiki.factorio.com/Railway_(research) · https://wiki.factorio.com/Automobilism_(research) · https://wiki.factorio.com/Gate_(research) · https://wiki.factorio.com/Circuit_network_(research) · https://wiki.factorio.com/Repair_pack_(research) · https://wiki.factorio.com/Stronger_explosives_(research) · https://wiki.factorio.com/Steam_power_(research) · https://wiki.factorio.com/Automation_science_pack_(research) · https://wiki.factorio.com/Electric_mining_drill_(research) · https://wiki.factorio.com/Radar_(research) · https://wiki.factorio.com/Oil_gathering_(research) · https://wiki.factorio.com/Oil_processing_(research) · https://wiki.factorio.com/Fluid_handling_(research) · https://wiki.factorio.com/Advanced_material_processing_(research) · https://wiki.factorio.com/Concrete_(research) · https://wiki.factorio.com/Modular_armor_(research) · https://wiki.factorio.com/Modules_(research) · https://wiki.factorio.com/Speed_module_(research) · https://wiki.factorio.com/Efficiency_module_(research) · https://wiki.factorio.com/Productivity_module_(research) · https://wiki.factorio.com/Mining_productivity_(research) · https://wiki.factorio.com/Lab_research_speed_(research) · https://wiki.factorio.com/Bulk_inserter_(research) · https://wiki.factorio.com/Inserter_capacity_bonus_(research) · https://wiki.factorio.com/Military_3_(research) · https://wiki.factorio.com/Rocketry_(research) · https://wiki.factorio.com/Flamethrower_(research) · https://wiki.factorio.com/Land_mines_(research) · https://wiki.factorio.com/Land_mine · https://wiki.factorio.com/Defender_(research) · https://wiki.factorio.com/Follower_robot_count_(research) · https://wiki.factorio.com/Refined_flammables_(research) · https://wiki.factorio.com/Braking_force_(research) · https://wiki.factorio.com/Fluid_wagon_(research) · https://wiki.factorio.com/Automated_rail_transportation_(research) · https://wiki.factorio.com/Uranium_processing_(research) · https://wiki.factorio.com/Cliff_explosives_(research) · https://wiki.factorio.com/Plastics_(research) · https://wiki.factorio.com/Sulfur_processing_(research) · https://wiki.factorio.com/Battery_(research) · https://wiki.factorio.com/Advanced_circuit_(research) · https://wiki.factorio.com/Chemical_science_pack_(research) · https://wiki.factorio.com/Flammables_(research) · https://wiki.factorio.com/Explosives_(research) · https://wiki.factorio.com/Nightvision_equipment_(research) · https://wiki.factorio.com/Belt_immunity_equipment_(research) · https://wiki.factorio.com/Portable_solar_panel_(research) · https://wiki.factorio.com/Personal_battery_(research) · https://wiki.factorio.com/Energy_shield_equipment_(research) · https://wiki.factorio.com/Pistol · https://wiki.factorio.com/Pipe_to_ground · https://wiki.factorio.com/Version_history/0.17.0
- Infobox data read through the wiki API, e.g. https://wiki.factorio.com/api.php?action=parse&page=Infobox:Modules_(research)&prop=wikitext&format=json ; 1.1 values from pre-2.0 revisions of the same infobox pages (`&oldid=<revid>`), e.g. revisions 169272 (Logistic science pack), 174715 (Solar energy), 168886 (Circuit network), 168913 (Fluid handling), 175082 (Oil processing), 196742 (Modules), 183412 (Speed module), 168955 (Productivity module), 168895 (Efficiency module), 168942 (Nightvision), 168968 (Portable solar panel), 168879 (Personal battery), 168903 (Energy shield), 175200 (Uranium processing), 168951 (Plastics), 175199 (Sulfur processing), 168881 (Belt immunity), 174712 (Accumulators), 182537 (Inserter capacity bonus), and https://wiki.factorio.com/Archive:Rail_signals_(research) (Infobox:Rail_signals_(research)).

Secondary:
- Official prototype dump: https://raw.githubusercontent.com/wube/factorio-data/master/base/prototypes/technology.lua and https://raw.githubusercontent.com/wube/factorio-data/1.1.110/base/prototypes/technology.lua ; recipe files https://raw.githubusercontent.com/wube/factorio-data/master/base/prototypes/recipe.lua and https://raw.githubusercontent.com/wube/factorio-data/1.1.110/base/prototypes/recipe.lua (used for starting-recipe `enabled` flags and to cross-check counts; note the fetch tool truncates these files after ~energy-shield-equipment, so later entries were taken from the wiki).
- https://factorio.com/blog/post/fff-254 (research queue history)
- https://mods.factorio.com/mod/factorio-research-queue (states the vanilla 7-technology queue limit)
