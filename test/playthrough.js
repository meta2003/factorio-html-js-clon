// Full playthrough test: a bot plays a new game until the first rocket launch.
//
//   node build/build.js && node test/playthrough.js            # the test (exit code 0 = won)
//   node test/playthrough.js --seed 7 --verbose                 # another map, with the bot's log
//   node test/playthrough.js --quick                            # smoke test: stop at chemical science (~20 s)
//   node test/playthrough.js --until oil-processing             # stop at any milestone
//
// Options: --seed N (42) · --max-minutes N game minutes before giving up (240) · --until TEXT
// stop successfully at the first milestone containing TEXT · --quick = --until chemical-science-pack ·
// --verbose print the bot's log ·
// --every N progress line every N game minutes (10, a multiple of 10) · --debug bot state with
// each progress line (reads more of the game state, so it can change the run) ·
// --save FILE write the final save.
'use strict';
const fs = require('fs');
const { loadGame } = require('./lib/load-game');
const { createBot } = require('./bot/bot');

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i !== -1 ? argv[i + 1] : d; };
const SEED = parseInt(opt('--seed', '42'), 10);
const MAX_MIN = parseFloat(opt('--max-minutes', '240'));
const UNTIL = opt('--until', argv.includes('--quick') ? 'chemical-science-pack' : null);
const EVERY = parseFloat(opt('--every', '10'));
const VERBOSE = argv.includes('--verbose');

const wall0 = Date.now();
const { F } = loadGame(opt('--html', undefined));
F.newGame({ seed: SEED });
const bot = createBot(F, { verbose: VERBOSE });

const maxTicks = MAX_MIN * 3600;
let nextReport = 10 * 3600;
let result = 'timeout';
let tickMs = 0;
while (F.state.tick < maxTicks) {
  bot.step();
  const t0 = Date.now();
  for (let i = 0; i < bot.cfg.step; i++) F.tick();
  tickMs += Date.now() - t0;
  if (bot.victory()) { result = 'victory'; break; }
  if (UNTIL && bot.milestones.some(m => m.name.includes(UNTIL))) { result = 'milestone'; break; }
  // The report is taken every 10 game minutes whatever --every says: reading the power
  // network can make the game recompute it, so the cadence must not depend on the options.
  if (F.state.tick >= nextReport) {
    nextReport += 10 * 3600;
    const s = bot.summary();
    if (Math.round(F.state.tick / 3600) % EVERY !== 0) continue;
    if (argv.includes('--debug')) console.log(bot.debug());
    console.log(`${s.time} research=${s.researched} now=${s.current || '-'} entities=${s.entities} power=${s.power ? s.power.demand + '/' + s.power.capacity + 'kW' : '-'} wall=${((Date.now() - wall0) / 1000).toFixed(1)}s`);
  }
}

const s = bot.summary();
const wall = (Date.now() - wall0) / 1000;
console.log('');
for (const m of s.milestones) console.log('  ' + m.time.padEnd(10) + m.name);
console.log(`\ngame time ${s.time}, ${s.entities} entities, ${s.researched} technologies, wall ${wall.toFixed(1)} s (simulation ${(tickMs / 1000).toFixed(1)} s, bot ${(wall - tickMs / 1000).toFixed(1)} s)`);
if (opt('--save', null)) fs.writeFileSync(opt('--save'), F.save());
if (result === 'timeout') {
  console.log('\nlast log lines:\n' + bot.logs.slice(-25).join('\n'));
  console.log('\nFAIL: no rocket launched within ' + MAX_MIN + ' game minutes');
  process.exit(1);
}
console.log(result === 'victory' ? '\nPASS: rocket launched — the bot won the game' : '\nPASS: reached milestone "' + UNTIL + '"');
process.exit(0);
