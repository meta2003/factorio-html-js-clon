# Factio — hard engineering constraints (non-negotiable)

These rules apply to every source module. The architect extends them in `design/ARCHITECTURE.md`; nothing here may be relaxed.

## Deliverable
- ONE self-contained HTML file: `build/Factio.html`, produced by `node build/build.js` from `src/template.html` + `src/style.css` + `src/NN-name.js` (concatenated in filename order into a single inline `<script>`).
- No external resources of any kind: no CDN scripts, no fonts, no images, no fetch. Everything (sprites, icons, sounds if any) is generated procedurally in JavaScript at runtime.
- Must run from `file://` (double-click on the Desktop) in current Chrome/Edge/Firefox. No ES modules (`import`/`export`), no build-time transpiling; write plain ES2020 that runs as one classic script.
- Must never write `</script>` literally inside JS strings (build escapes it anyway).

## Global namespace and module shape
- Exactly one global: `F` (declared in `src/00-core.js` as `var F = window.F = {};` — `var`, so later modules can reference it as a plain identifier in the shared scope).
- Every module is top-level code wrapped in an IIFE: `(function () { 'use strict'; ... })();` and registers its API on `F` (e.g. `F.data`, `F.world`, `F.belts`, `F.render`, `F.ui`).
- Modules communicate ONLY through the `F.*` APIs defined in `design/ARCHITECTURE.md`. No hidden globals, no cross-module private access.
- Module load order = filename order. A module may call another module's functions at runtime, but must not touch `F.<other>` at load time except for registering data/definitions (`00-core.js` and `01-data.js` load first and are the only ones other modules may read at load time).

## Headless contract (automated tests depend on this)
- If `window.HEADLESS === true`: no module may touch `document`, `requestAnimationFrame`, `addEventListener`, `localStorage` or canvas at load time; the render/UI/input modules must lazily no-op. `F.boot()` must NOT be called automatically. (In the real page, `99-main.js` calls `F.boot()` at the end when `!window.HEADLESS`.)
- The simulation must be fully runnable without DOM:
  - `F.newGame({ seed })` — creates `F.state` (a plain JSON-serialisable object tree; no class instances, no functions, no Maps/Sets inside `F.state` — use arrays/objects/typed arrays converted on save).
  - `F.tick()` — advances the simulation exactly one tick (1/60 s), deterministic for a given seed and input sequence.
  - `F.save()` → JSON string; `F.load(json)` → restores `F.state` and rebuilds all derived caches (spatial indexes, belt chains, power networks).
  - Test helpers (all in `F.api`, usable both by the UI and by tests): `F.api.place(entityId, tx, ty, dir)` → entity or null, `F.api.remove(tx, ty)`, `F.api.give(itemId, count)` (adds to player inventory), `F.api.inventoryCount(itemId)`, `F.api.entityAt(tx, ty)`, `F.api.setRecipe(entity, recipeId)`, `F.api.insertInto(entity, itemId, count)`, `F.api.findResource(itemId, radius)` → `{x,y}` of nearest ore tile of that kind near spawn, `F.api.teleport(x,y)`, `F.api.craft(recipeId, count)`, `F.api.research(techId)`, `F.api.chunkPollution(cx,cy)`, `F.api.stats()` → counts of entities/items/enemies.
- Rendering is separate from simulation: `F.render.frame(dtMs)` draws the current state; it must never mutate `F.state`.

## Determinism & performance
- All randomness through `F.rng` (seeded, e.g. mulberry32/xorshift stored in `F.state.rng`). Never `Math.random()` in simulation code (UI-only cosmetic randomness may use it).
- Fixed timestep: 60 ticks/s, accumulator in main loop, max 5 ticks per frame to avoid spiral of death.
- Entities live in `F.state.entities` (array of plain objects with numeric `id`), plus a tile→entityId spatial map rebuilt on load. World tiles stored per chunk (32×32) in typed arrays (terrain, resource kind, resource amount).
- Rendering culls to visible chunks; sprites cached on offscreen canvases per (entity type, direction, frame).
- Target: 60 fps with 2000 entities and 5000 belt items in Chrome on an office laptop; `F.tick()` under 1 ms in the headless test at 500 entities.

## Coding conventions
- `'use strict'`, `const`/`let`, no `with`, no `eval`, no `new Function`.
- All user-facing strings go through `F.t(key, params)`. `src/02-i18n.js` provides `F.i18n.add(lang, {key: text})`, `F.i18n.setLang('sl'|'en')` and `F.t`. Every module registers ITS OWN strings at load time for both languages (`F.i18n.add('sl', {...}); F.i18n.add('en', {...});`) — Slovenian is the default UI language, English the fallback. No hardcoded UI text in code paths; keys are namespaced by module (`ui.inventory`, `ent.stone_furnace`, `help.controls`).
- Every entity type defined in data (`F.data.entities[id]`) with `size:[w,h]`, `rotatable`, `health`, `category`, `recipe`, `behaviour` key; behaviour code registered as `F.behaviours[key] = { create(e), tick(e), onRemove(e), gui?(e) }`.
- Comments in English; UI text in Slovenian.
- Files must stay under ~1500 lines; split if larger (`30-belts.js`, `31-inserters.js`, …).

## Verification tools
- `node build/build.js` — build; `node build/build.js --deploy` — build and copy to `~/Desktop/Factio.html`.
- `node test/headless.js --ticks 3600` — loads the built HTML under Node with DOM stubs, runs `F.newGame({seed:42})`, 3600 ticks, save/load round-trip, then every scenario in `test/scenarios.js` (`module.exports = { scenarioName(F, window, assert) {...} }`).
- Browser playtest: open `build/Factio.html` in the in-app browser, check the console for errors.
