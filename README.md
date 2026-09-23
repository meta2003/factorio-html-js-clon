# factorio-html-js-clon — Factio

A Factorio-like factory game in plain HTML, CSS and JavaScript. It builds into **one self-contained
HTML file**: no server, no dependencies and no external assets. Every sprite is drawn procedurally
on a canvas.

Mine ore, smelt it, craft, run belts and inserters, build power (boiler, steam engine, solar),
put up assembling machines and research the tech tree. The in-game help is under **Instructions** (H / F1).

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

## Layout

| Path | What |
|---|---|
| `src/NN-*.js` | game modules, concatenated in filename order (see `design/ARCHITECTURE.md`) |
| `src/60-sprites.js`, `src/62..64-sprites-*.js` | procedural art: sprite library + building painter packs |
| `src/disabled/` | code kept out of the build (combat, Slovenian translation) |
| `src/template.html`, `src/style.css` | page shell and UI styles |
| `design/` | game design doc, architecture/API contracts, engineering constraints, art brief |
| `research/` | notes on Factorio mechanics used for the design |
| `test/` | headless test runner and scenarios |

## Controls

| Key | Action |
|---|---|
| WASD | move |
| Left click | place / open an entity |
| Right click (hold) | mine / remove |
| R (Shift+R) | rotate |
| Q | pipette (pick the entity under the cursor) |
| E | inventory and crafting |
| T | technologies |
| M | map |
| H / F1 | instructions |
| F | pick up items nearby |
| Z | drop one item |
| Alt | alt mode (show machine contents) |
| 1–0 | quickbar |
| Esc | menu (save / load / new game) |
