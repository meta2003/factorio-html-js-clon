# factorio-html-js-clon — Factio

A Factorio-like factory game in plain HTML, CSS and JavaScript. It builds into **one self-contained
HTML file**: no server, no dependencies and no external assets. Every sprite is drawn procedurally
on a canvas.

> **Disclaimer:** Factio is an unofficial, non-commercial fan project. It is not affiliated with,
> endorsed by or connected to Wube Software. Factorio is a trademark of Wube Software Ltd. Factio
> contains no Factorio code, graphics or sounds: all code and art are original.I am making this as a test
> of what can be achived with vibe coding and don't want to harm wube or anybody. If i done harm in any way
> please contact me and i will remove my "work" from github.

Mine ore, smelt it, craft, run belts and inserters, build power (boiler, steam engine, solar),
put up assembling machines and research the tech tree. The in-game help is under **Instructions** (H / F1).

Mid and late game (see `design/EXPANSION.md`):

- **Oil processing**: pumpjacks on crude-oil wells, oil refineries, chemical plants, storage tanks,
  eight fluids (plastic, sulfur, sulfuric acid, lubricant, solid fuel, batteries…).
- **Trains**: rails (drag to place), train stops, locomotives and cargo wagons, automatic
  schedules, inserters loading wagons at stations, riding and manual driving; rail signals and
  chain signals split the network into blocks so several trains can share it.
- **Robots**: roboports, logistic robots, passive provider / storage / requester chests;
  construction robots that build ghosts and pasted blueprints from logistic chests, and take
  down whatever the deconstruction planner (X) marks — buildings, trees and rocks.
- **Ghosts and blueprints**: plan buildings as ghosts (Shift+click), copy an area (Ctrl+C) and
  paste it rotated elsewhere (Ctrl+V); build ghosts by hand or let construction robots do it.
  A blueprint library (L) keeps named blueprints across games and shares them as text strings.
- **Rocket silo**: build rocket parts, load a satellite and launch — the victory screen.
- **Modules**: speed, productivity and efficiency modules (three tiers each) in the module slots of
  assembling machines 2/3, the electric furnace and the electric mining drill; productivity adds
  free extra results, efficiency cuts power (never below 20 %). Help tab "Modules".
- Science: red, green, blue (chemical), purple (production), yellow (utility) and space packs.

> Current build: English only, and combat (biters, turrets, weapons) is switched off. That code is
> kept in `src/disabled/` and can be turned back on (see `src/disabled/README.md`).

## Build and play

Requires Node.js (no npm packages).

```bash
node build/build.js            # -> build/Factio.html (open it in a browser)
node build/build.js --deploy   # also copies it to the Desktop
```

## Deploy

Every push to `main` runs `.github/workflows/deploy.yml`: it builds the game, runs the headless
tests and publishes `build/Factio.html` as `index.html` on the `gh-pages` branch (GitHub Pages
source: *Deploy from a branch → gh-pages / root*). It can also be started by hand from the
*Actions* tab (*Run workflow*).

## Demo save: an advanced late-game world

`saves/advanced-world.json` is a ready-built late-game base: all research done, a steam plant
(12 boilers, 24 engines) plus a solar field with accumulators, iron and copper mines feeding rows
of electric furnaces, an assembly district of assembling machines 3 with modules, labs, an oil
field with a refinery and chemical plants, a rail loop with an automatic train, roboports with
logistic and construction robots, a rocket silo ready to launch and a parked spidertron (another
one is in the inventory). Load it with Esc → *Import save*, paste the file's contents, *Load*.
Regenerate it with `node saves/gen-advanced-world.js` (needs Playwright).

## Tests

```bash
node test/headless.js --ticks 3600 --summary
```

The headless runner loads the built game with DOM stubs and runs the scenarios in
`test/scenarios.js`, covering mining, smelting, belts, inserters, power, research and save/load.

## Layout

| Path | What |
|---|---|
| `src/NN-*.js` | game modules (expansion: `05/06` data+text, `37-oil`, `38-trains`, `39-robots`, `39-spidertron` (with `09` data), `45-rocket`; `51-ghosts` planned buildings, `52-blueprints` copy/paste, `53-construction` construction robots, `54-deconstruction` deconstruction planner, `55-blueprint-library` library + strings; modules: `07/08` data+text, `35-modules` slots and effects), concatenated in filename order (see `design/ARCHITECTURE.md`) |
| `src/60-sprites.js`, `src/62..69-sprites-*.js` | procedural art: sprite library + building painter packs (`61-sprites-player`, `64-sprites-belts`, `-inserters`, `-pipes`, `-chests`, `-logistics` (poles), `63-sprites-assemblers`, `-lab`, `62-sprites-drill`, `-furnaces`, `-ores`, `-steam`, `65-sprites-refinery`, `66-sprites-trains`, `68-sprites-rocket`, `67-sprites-spidertron` and `67-sprites-robots` redraw the player character, belts, undergrounds, splitters, inserters, pipes, chests, electric poles, assemblers, the lab, the electric mining drill, the furnaces, the boiler, the steam engine, the ores on the ground, the pumpjack, the chemical plant, the oil refinery, the storage tank, rails, train stops, signals, the locomotive and cargo wagon, the rocket silo, the roboport and the robots after the real Factorio sprites) |
| `src/disabled/` | code kept out of the build (combat, Slovenian translation) |
| `src/template.html`, `src/style.css` | page shell and UI styles |
| `design/` | game design doc, architecture/API contracts, engineering constraints, art brief |
| `research/` | notes on Factorio mechanics used for the design |
| `test/` | headless test runner and scenarios |
| `saves/` | demo save (advanced world) and the script that builds it |

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
| T | technologies |
| M | map |
| H / F1 | instructions |
| F | pick up items nearby |
| Z | drop one item |
| Alt | alt mode (show machine contents) |
| 1–0 | quickbar |
| Esc | menu (save / load / new game) |
| Enter / G | board or leave the nearest locomotive |
| W / S, A / D (riding) | throttle / brake a manual train, pick the branch at the next junction |
