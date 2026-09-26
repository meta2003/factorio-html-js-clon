// Headless smoke/scenario runner for build/Factio.html under Node (no browser).
// Usage: node test/headless.js [--ticks N] [--scenarios test/scenarios.js] [--seed S] [--html path]
// Contract expected from the game (see design/ARCHITECTURE.md):
//   window.HEADLESS === true  -> modules must not auto-boot the DOM UI / rAF loop
//   window.F  : global namespace; F.newGame({seed}), F.tick() (one 1/60 s step), F.state, F.save() -> string, F.load(string)
const fs = require('fs'), path = require('path');
const { loadGame } = require('./lib/load-game');
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i !== -1 ? argv[i + 1] : d; };
const TICKS = parseInt(opt('--ticks', '3600'), 10);
const SEED = parseInt(opt('--seed', '42'), 10);
const htmlPath = opt('--html', path.resolve(__dirname, '../build/Factio.html'));
const t0 = Date.now();
let F, window;
try { ({ F, window } = loadGame(htmlPath)); } catch (e) { console.error(String((e && e.message) || e)); process.exit(3); }

const report = { loadMs: Date.now() - t0, ticks: 0, errors: [], scenarios: [] };
try {
  F.newGame({ seed: SEED });
  const t1 = Date.now();
  for (let i = 0; i < TICKS; i++) { F.tick(); report.ticks++; }
  report.tickMs = Date.now() - t1;
  report.msPerTick = +(report.tickMs / Math.max(1, TICKS)).toFixed(4);
  if (typeof F.save === 'function' && typeof F.load === 'function') {
    const s = F.save(); report.saveBytes = typeof s === 'string' ? s.length : JSON.stringify(s).length;
    F.load(s); for (let i = 0; i < 120; i++) F.tick(); report.reloadOk = true;
  }
} catch (e) { report.errors.push('RUN ERROR: ' + ((e && e.stack) || e)); }

// --scenarios <file> runs one file; default = test/scenarios.js + every test/scenarios-*.js (feature packs).
// --only <substring> keeps just the scenarios whose name contains it.
const scenFiles = opt('--scenarios', null) ? [path.resolve(process.cwd(), opt('--scenarios'))]
  : [path.resolve(__dirname, 'scenarios.js')].concat(fs.readdirSync(__dirname).filter(f => /^scenarios-.*.js$/.test(f)).sort().map(f => path.join(__dirname, f)));
const onlyPat = opt('--only', null);
const scenarios = {};
for (const sp of scenFiles) if (fs.existsSync(sp)) Object.assign(scenarios, require(sp)); // module.exports = { name: (F, assert, window) => void | string, ... }
if (onlyPat) for (const k of Object.keys(scenarios)) if (!k.includes(onlyPat)) delete scenarios[k];
{
  const assert = (cond, msg) => { if (!cond) throw new Error('ASSERT: ' + msg); };
  for (const [name, fn] of Object.entries(scenarios)) {
    const r = { name, ok: true };
    try { const out = fn(F, assert, window); if (out) r.note = String(out); } catch (e) { r.ok = false; r.error = String((e && e.stack) || e).split('\n').slice(0, 6).join('\n'); }
    report.scenarios.push(r);
  }
}
const failed = report.errors.length + report.scenarios.filter(s => !s.ok).length;
const ascii = t => String(t).replace(/[^\x20-\x7e\n]/g, '?');
if (argv.includes('--summary')) {
  console.log(ascii('smoke: ticks=' + report.ticks + ' msPerTick=' + report.msPerTick + ' saveBytes=' + report.saveBytes + ' reloadOk=' + report.reloadOk + ' errors=' + JSON.stringify(report.errors)));
  for (const s of report.scenarios) console.log(ascii((s.ok ? 'PASS ' : 'FAIL ') + s.name + (s.note ? ' -- ' + s.note : '') + (s.ok ? '' : '\n     ' + String(s.error).split('\n').slice(0, 2).join(' | ').slice(0, 400))));
} else console.log(JSON.stringify(report, null, 2));
console.log(failed ? 'FAILED (' + failed + ')' : 'OK');
process.exit(failed ? 1 : 0);
