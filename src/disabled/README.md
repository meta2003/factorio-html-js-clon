# src/disabled/

Code and data that is **not** part of the current build. `build/build.js` only
reads top-level `src/NN-*.js` files (`fs.readdirSync(src)`, no recursion), so
anything in this directory is automatically excluded — nothing here needs to
be deleted or commented out, it just needs to stay out of `src/`.

Two independent features are disabled right now:

- **Combat** (`F.FEATURES.combat = false` in `src/00-core.js`): no biters, no
  turrets/walls, no pistol/ammo, no evolution/attacks. Pollution itself still
  spreads, gets absorbed and shows on the map — only the parts of it that fed
  the enemy AI are turned off.
- **i18n / Slovenian**: the build is English-only. `F.t()`/`F.i18n` still
  exist and work exactly as before; there is just only one language
  registered (`'en'`).

They can be re-enabled independently of each other.

## Files here

- `35-combat.js` — the entire combat module (`F.combat`, `F.units`, turret/
  wall/spawner behaviours, player weapon tick, unit AI), moved out unchanged.
- `03-data-combat.js` — the combat-only rows removed from `src/01-data.js`:
  items (pistol, submachine-gun, firearm-magazine, piercing-rounds-magazine,
  gun-turret, stone-wall, repair-pack), recipes for the same, entities
  (gun-turret, stone-wall, biter-spawner), techs (military, gun-turret,
  stone-wall, military-2, physical-projectile-damage-1/2,
  weapon-shooting-speed-1/2), the starting-inventory pistol+ammo, and the
  `electronics` tech's `repair-pack` unlock. It calls `F.data.extend(...)`
  (a small hook `01-data.js` exposes for exactly this) to merge everything
  back in, plus `F.i18n.add('en'/'sl', ...)` for the item/entity/tech names.
  Small/medium/big biter *units* are not data-driven (see `35-combat.js`'s
  own `UNIT_DEFS`), so only their i18n display names live here.
- `02-i18n-sl.js` — every Slovenian string that used to ship in the build:
  `02-i18n.js`'s own SL table (minus the combat item/entity/tech names,
  which live in `03-data-combat.js` instead) plus the small per-module
  `F.i18n.add('sl', {...})` blocks that used to live in `10-world.js`,
  `20-entities.js`, `34-research.js`, `36-pollution.js`, `40-player.js`,
  `70-ui.js`, `71-ui-windows.js`, `75-input.js` and `80-game.js`.

## Re-enabling combat

1. Move `src/disabled/35-combat.js` and `src/disabled/03-data-combat.js`
   into `src/` (keep their filenames — `build/build.js` sorts `src/NN-*.js`
   files by filename, and `03-data-combat.js` calls both `F.data.extend()`
   (defined by `01-data.js`) and `F.i18n.add()` (defined by `02-i18n.js`),
   so it must load after both; "03-data-combat.js" already sorts right
   after "02-i18n.js" and before "10-world.js", which does that).
2. In `src/00-core.js`, flip `F.FEATURES.combat` to `true`.
3. Every combat-off guard in the codebase reads `F.FEATURES.combat` (or, in
   most of `35-combat.js`'s own callers, just checks whether `F.combat`
   exists) — flipping the flag and restoring the module is enough to bring
   all of it back:
   - `10-world.js`: `maybePlaceSpawners` already checks `F.combat` — nothing
     to change.
   - `36-pollution.js`: `tick()`/`spread()` check `F.FEATURES.combat` before
     running `evolutionTimeStep()`/feeding evolution from pollution;
     `handleSpawnerBank()` checks it too (though it would already no-op
     with `spawners` empty).
   - `40-player.js`: `shootTick()`, `damage()`, `respawn()` and
     `equipFromInventory()` all check `F.FEATURES.combat`.
   - `50-api.js`: re-add the removed rows to `STARTER_KIT` if you want the
     debug "give starter kit" cheat to include weapons/turrets/walls again
     (`['pistol', 1], ['submachine-gun', 1], ['firearm-magazine', 100],
     ['piercing-rounds-magazine', 50], ['gun-turret', 10], ['stone-wall',
     50], ['repair-pack', 10]`).
   - `75-input.js`: `updateShoot()` checks `F.FEATURES.combat` before ever
     setting `input.state.shoot`/`aimAt`.
   - `70-ui.js`: `COMBAT_UI` (top of the file) gates whether the HUD
     weapon/ammo box, player health bar and evolution readout get built at
     all, and whether their refresh functions do anything. It also drives
     the `ALERT_DURATION_TICKS`/`ALERT_ICON_COLOR`/`STATUS_COLOR` entries
     for `attack`/`entity_destroyed`/`turret_out_of_ammo`/`no_ammo`, which
     were removed outright (re-add them alongside `35-combat.js`'s alert
     kinds if you restore this).
   - `71-ui-windows.js`: `CRAFT_TABS` includes `'combat'` only when
     `F.FEATURES.combat` is true. The `ENTITY_TURRET` window renderer
     (ammo slots, range, kills) and its `no_ammo`/`turret_out_of_ammo`
     status-colour entries were deleted outright — re-add them from git
     history / the backup in `backups/` if you restore combat, since they
     depended on the `gun-turret` entity existing.
   - `80-game.js`: `fallbackPlayer()`'s `weapon` field, and `F.load`'s
     `sanitizeRemovedContent()` (which drops entities/items the current
     `F.data` doesn't know about and clears `F.state.units` when combat is
     off) both key off the same flag / `F.data` contents, so they adapt
     automatically once step 1 is done.
4. Rebuild (`node build/build.js`) and run
   `node test/headless.js --scenarios test/disabled-scenarios.js --ticks 3600 --summary`
   for the combat-specific scenario (`turret_kills_biter`), and re-check
   `test/scenarios.js`'s `combat_disabled` scenario — it will now correctly
   fail (it asserts combat is *off*), so either delete it or gate it on
   `F.FEATURES.combat` the same way this README describes for the app code.

## Re-enabling Slovenian

1. Move `src/disabled/02-i18n-sl.js` into `src/`.
2. In `src/02-i18n.js`, restore Slovenian as a supported language:
   ```js
   var LANGS = ['sl', 'en'];       // was: ['en']
   var currentLang = 'sl';         // or keep 'en' as the default, your call
   var tables = { sl: Object.create(null), en: Object.create(null) };
   ```
   and restore `F.i18n.setLang` to actually switch (it is currently a
   no-op guard: `setLang(lang) { if (LANGS.indexOf(lang) < 0) {...; return;} }`
   — once `'sl'` is back in `LANGS` that same code already lets it through,
   no further change needed there).
3. Re-add a language switcher to the UI: `src/71-ui-windows.js`'s
   `renderHelp()` and `renderMenu()` each had a `['sl', 'en']`-driven button
   row (search this file's git history / `backups/` for `langRow`,
   `F.i18n.setLang`) that called `F.i18n.setLang(lang)` and re-rendered.
4. Set `<html lang="…">` in `src/template.html` back to `"sl"` if Slovenian
   should be the default again.
5. If combat is also being re-enabled, `03-data-combat.js` already calls
   `F.i18n.add('sl', {...})` for the combat item/entity/tech names — it
   just silently no-ops until step 2 above registers `'sl'` as a language.
6. Rebuild and re-check `test/scenarios.js`'s `english_only` scenario — like
   `combat_disabled` above, it will now correctly fail (it asserts English
   is the *only* language), so update or remove it.

## Why this split (`03-data-combat.js` vs `02-i18n-sl.js`)

Combat's own item/entity/tech *names* (in both languages) travel with the
combat data in `03-data-combat.js`, not with the general Slovenian table,
so that "combat back, Slovenian still off" and "Slovenian back, combat still
off" both work sensibly without one re-enable step silently depending on the
other file also being restored.
