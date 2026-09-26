# factorio-html-js-clon — Factio

A Factorio-like factory game in plain HTML, CSS and JavaScript. It builds into **one self-contained
HTML file**: no server, no dependencies and no external assets. Every sprite is drawn procedurally
on a canvas.

Mine ore, smelt it, craft, run belts and inserters, build power (boiler, steam engine, solar),
put up assembling machines and research the tech tree. The in-game help is under **Instructions** (H / F1).

Mid and late game (see `design/EXPANSION.md`):

- **Oil processing**: pumpjacks on crude-oil wells, oil refineries, chemical plants, storage tanks,
  eight fluids (plastic, sulfur, sulfuric acid, lubricant, solid fuel, batteries…).
- **Trains**: rails (drag to place), train stops, locomotives and cargo wagons, automatic
  schedules, inserters loading wagons at stations, riding and manual driving.
- **Robots**: roboports, logistic robots, passive provider / storage / requester chests;
  construction robots that build ghosts and pasted blueprints from logistic chests, and take
  down whatever the deconstruction planner (X) marks — buildings, trees and rocks.
- **Ghosts and blueprints**: plan buildings as ghosts (Shift+click), copy an area (Ctrl+C) and
  paste it rotated elsewhere (Ctrl+V); build ghosts by hand or let construction robots do it.
  A blueprint library (L) keeps named blueprints across games and shares them as text strings.
- **Rocket silo**: build rocket parts, load a satellite and launch — the victory screen.
- **Higher building tiers**: express belts / undergrounds / splitters (Logistics 3), filter and
  stack inserters, the electric furnace (no fuel), assembling machine 3, the big electric pole
  (30-tile wires) and the substation (18×18 supply area).
- **Technology tree (T)**: a prerequisite graph you can pan (drag) and zoom (wheel). Hover a
  technology to light up the chain it needs, search by technology or item name, and open the
  detail panel for cost, unlocks and links. "Research with prerequisites" (or a double-click)
  queues the whole missing chain in order.
- Science: red, green, blue (chemical), purple (production), yellow (utility) and space packs.

> Current build: English only, and combat (biters, turrets, weapons) is switched off. That code is
> kept in `src/disabled/` and can be turned back on (see `src/disabled/README.md`).

## Build and play

Requires Node.js (no npm packages).

```bash
node build/build.js            # -> build/Factio.html (open it in a browser)
node build/build.js --deploy   # also copies it to the Desktop
```

## Tests

```bash
node test/headless.js --ticks 3600 --summary
```

The headless runner loads the built game with DOM stubs and runs the scenarios in
`test/scenarios.js`, covering mining, smelting, belts, inserters, power, research and save/load.

### Playthrough test: a bot wins the game

```bash
node build/build.js && node test/playthrough.js           # full game, ~4 min: PASS when the rocket launches
node test/playthrough.js --quick                           # smoke test, ~20 s: up to chemical science
node test/playthrough.js --until oil-processing --verbose  # stop at any milestone, with the bot's log
```

`test/bot/` is a bot that starts a new game (seed 42) with the normal starting kit and plays it to
the first rocket launch, the game's victory condition — about 3 hours of game time, 34
technologies and ~3300 buildings. It only does what a player can do: mine and craft by hand,
place buildings from the inventory, put items into and take them out of buildings, set
recipes and pick research. The one shortcut is that it teleports instead of walking; there
are no belts or inserters either — the bot carries everything itself, with a warehouse of
chests as its stock. Exit code 0 means it won; on failure the last lines of its log are printed.
Runs are deterministic (same seed, same game); seeds 42, 7 and 123 all end in a launch after
3–3¼ hours of game time.

| File | What |
|---|---|
| `test/playthrough.js` | the runner: options `--seed`, `--max-minutes`, `--until`, `--quick`, `--verbose`, `--debug`, `--save` |
| `test/bot/bot.js` | map scan, research order, production planner (demand → backlog per recipe → machines), expansion rules, power blocks, oil campus, rocket |
| `test/bot/machines.js` | building orders and machine service (fuel, ingredients, outputs, recipes) |
| `test/bot/pipes.js` | fluid router (A* with underground pipes, one fluid per network) |
| `test/bot/space.js` | building spots, reserved areas, power poles |
| `test/bot/hands.js` | player actions and the stock (inventory + warehouse chests) |

## Layout

| Path | What |
|---|---|
| `src/NN-*.js` | game modules (expansion: `05/06` data+text, `37-oil`, `38-trains`, `39-robots`, `45-rocket`; `51-ghosts` planned buildings, `52-blueprints` copy/paste, `53-construction` construction robots, `54-deconstruction` deconstruction planner, `55-blueprint-library` library + strings; `07-data-tiers` higher building tiers; `72-ui-techtree` technology tree window), concatenated in filename order (see `design/ARCHITECTURE.md`) |
| `src/60-sprites.js`, `src/62..69-sprites-*.js` | procedural art: sprite library + building painter packs |
| `src/disabled/` | code kept out of the build (combat, Slovenian translation) |
| `src/template.html`, `src/style.css` | page shell and UI styles |
| `design/` | game design doc, architecture/API contracts, engineering constraints, art brief |
| `research/` | notes on Factorio mechanics used for the design |
| `test/` | headless test runner and scenarios; `test/bot/` + `test/playthrough.js` the playthrough bot |

## Controls

| Key | Action |
|---|---|
| WASD | move |
| Left click | place / open an entity |
| Right click (hold) | mine / remove |
| R (Shift+R) | rotate |
| Q | pipette (pick the entity under the cursor) |
| Shift + left click / drag | place ghosts (planned buildings) instead of buildings |
| Left click on a ghost (empty hand) | build it from the inventory |
| Right click on a ghost | cancel it |
| Ctrl+C or B, then drag | copy an area into a blueprint |
| Ctrl+V | take the last copied blueprint into the hand |
| R / left click / Q (blueprint in hand) | rotate / paste as ghosts / drop |
| X, then drag (Shift+drag cancels) | deconstruction planner: mark buildings, trees, rocks for robots |
| Ctrl+X, then drag | cut: copy an area and mark its buildings for deconstruction |
| L | blueprint library: save, reuse, export/import blueprint strings (FB1…) |
| E | inventory and crafting |
| T | technology tree (drag to pan, wheel to zoom, double-click to research) |
| M | map |
| H / F1 | instructions |
| F | pick up items nearby |
| Z | drop one item |
| Alt | alt mode (show machine contents) |
| 1–0 | quickbar |
| Esc | menu (save / load / new game) |
| Enter / G | board or leave the nearest locomotive |
| W / S, A / D (riding) | throttle / brake a manual train, pick the branch at the next junction |
