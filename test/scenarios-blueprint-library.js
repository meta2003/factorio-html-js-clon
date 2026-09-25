// Scenario tests for src/55-blueprint-library.js (blueprint strings + library).
'use strict';

function fresh(F, seed = 42) { F.newGame({ seed }); return F.state; }

const SAMPLE = {
  w: 7, h: 4, entities: [
    { type: 'rail', x: 0, y: 3, dir: 0 },
    { type: 'assembling-machine-1', x: 0, y: 0, dir: 0, settings: { recipe: 'iron-gear-wheel' } },
    { type: 'inserter', x: 3, y: 1, dir: 1 },
    { type: 'underground-belt', x: 5, y: 2, dir: 1, settings: { io: 'out' } },
    { type: 'requester-chest', x: 4, y: 1, dir: 0, settings: { requests: [{ id: 'iron-plate', count: 50 }, null, null, null, null, null] } },
    { type: 'train-stop', x: 1, y: 2, dir: 0, settings: { name: 'Železarna' } },
  ],
};

function key(bp) {
  return bp.entities.map(e => `${e.type}@${e.x},${e.y}/${e.dir}:${JSON.stringify(e.settings || null)}`).sort().join(' | ');
}

// Build a string by hand (bypassing encode) so we can feed hostile/odd payloads.
function rawString(obj) {
  const json = JSON.stringify(obj);
  return 'FB1' + Buffer.from(json, 'utf8').toString('base64');
}

module.exports = {
  bplib_string_roundtrip(F, assert) {
    fresh(F);
    const bp = F.blueprints.rotate(SAMPLE, 0);
    const s = F.blueprints.encode(bp, 'Rudnik – č, š, ž 🚂');
    assert(typeof s === 'string' && s.startsWith('FB1') && /^[A-Za-z0-9+/=]+$/.test(s.slice(3)), 'printable string');
    // Our base64 must match the standard one (strings are meant to be shared).
    const json = Buffer.from(s.slice(3), 'base64').toString('utf8');
    assert(JSON.parse(json).n === 'Rudnik – č, š, ž 🚂', 'standard base64 + UTF-8 name');
    const d = F.blueprints.decode('  ' + s + '\n');
    assert(d, 'decoded: ' + F.blueprints.lastError);
    assert(d.name === 'Rudnik – č, š, ž 🚂', 'name kept: ' + d.name);
    assert(key(d.bp) === key(bp), 'same layout and settings\n' + key(d.bp) + '\n' + key(bp));
    assert(d.bp.w === bp.w && d.bp.h === bp.h && d.skipped === 0, 'size');
    // Rotated blueprints survive too.
    const r = F.blueprints.rotate(bp, 1);
    assert(key(F.blueprints.decode(F.blueprints.encode(r)).bp) === key(r), 'rotated roundtrip');
    return s.length + ' chars';
  },

  bplib_decode_rejects_bad_input(F, assert) {
    fresh(F);
    const bad = ['', 'hello', 'FB1', 'FB1!!!!', 'FB2' + 'e30=', 'FB1' + 'e30=' /* {} */, rawString({ e: 'x' }),
      rawString({ e: [['wooden-chest', 0.5, 0, 0]] }), rawString({ e: [['wooden-chest', 0, 0, 7]] }),
      rawString({ e: [['wooden-chest', 99999, 0, 0]] })];
    for (const b of bad) {
      assert(F.blueprints.decode(b) === null, 'rejected: ' + b.slice(0, 30));
      assert(F.blueprints.lastError === 'format', 'format error for ' + b.slice(0, 30) + ': ' + F.blueprints.lastError);
    }
    assert(F.blueprints.decode(null) === null, 'null rejected');
    assert(F.blueprints.decode(rawString({ e: [['gun-turret', 0, 0, 0], ['player-corpse', 1, 0, 0]] })) === null &&
      F.blueprints.lastError === 'empty', 'only unknown/unplaceable types -> empty');
    const big = []; for (let i = 0; i < 20001; i++) big.push(['wooden-chest', i % 100, Math.floor(i / 100), 0]);
    assert(F.blueprints.decode(rawString({ e: big })) === null && F.blueprints.lastError === 'too_big', 'too many entities');
    return 'ok';
  },

  bplib_decode_skips_unknown_and_cleans_settings(F, assert) {
    fresh(F);
    const d = F.blueprints.decode(rawString({
      n: 42, // not a string: dropped
      e: [
        ['gun-turret', 0, 0, 0],                                   // disabled content: skipped
        ['wooden-chest', 10, 10, 0, { recipe: 'nope', evil: '<script>' }],
        ['assembling-machine-1', 11, 10, 0, { recipe: 'iron-gear-wheel', filter: ['iron-plate', 'bogus', 3] }],
        ['requester-chest', 14, 10, 0, { requests: [{ id: 'iron-plate', count: 5 }, { id: 'x', count: 1 }, { id: 'coal', count: -3 }, 'z'] }],
        ['splitter', 15, 10, 1, { filter: 'copper-plate', inPrio: 1, outPrio: 7 }],
        ['train-stop', 16, 10, 0, { name: 'x'.repeat(100), io: 'sideways' }],
      ],
    }));
    assert(d, 'decoded: ' + F.blueprints.lastError);
    assert(d.skipped === 1 && d.bp.entities.length === 5, 'one skipped, five kept');
    assert(d.name === '', 'non-string name dropped');
    const by = Object.fromEntries(d.bp.entities.map(e => [e.type, e]));
    assert(by['wooden-chest'].x === 0 && by['wooden-chest'].y === 0, 'normalised to 0,0');
    assert(!by['wooden-chest'].settings, 'unknown recipe and unknown keys dropped');
    assert(by['assembling-machine-1'].settings.recipe === 'iron-gear-wheel', 'valid recipe kept');
    assert(JSON.stringify(by['assembling-machine-1'].settings.filter) === JSON.stringify(['iron-plate', null, null, null, null]), 'filter cleaned');
    const req = by['requester-chest'].settings.requests;
    assert(req.length === 6 && req[0].id === 'iron-plate' && req.slice(1).every(q => q === null), 'requests cleaned: ' + JSON.stringify(req));
    assert(by.splitter.settings.filter === 'copper-plate' && by.splitter.settings.inPrio === 1 && by.splitter.settings.outPrio === undefined, 'splitter settings');
    assert(by['train-stop'].settings.name.length === 40 && by['train-stop'].settings.io === undefined, 'name capped, bad io dropped');
    return 'ok';
  },

  bplib_library_add_rename_remove(F, assert) {
    fresh(F);
    const lib = F.blueprints.library;
    lib.clear();
    assert(lib.list().length === 0, 'empty');
    const bp = F.blueprints.rotate(SAMPLE, 0);
    const a = lib.add('  Smelter  ', bp);
    const b = lib.add('', bp);
    assert(a && b && a.id !== b.id, 'two entries');
    assert(a.name === 'Smelter', 'trimmed name');
    assert(b.name && b.name !== '', 'default name: ' + b.name);
    assert(lib.list()[0] === b, 'newest first');
    assert(lib.add('x', { entities: [] }) === null, 'empty blueprint refused');
    bp.entities.pop();
    assert(lib.get(a.id).bp.entities.length === 6, 'library keeps its own copy');
    assert(lib.rename(a.id, 'Iron line') && lib.get(a.id).name === 'Iron line', 'renamed');
    assert(lib.remove(b.id) && !lib.get(b.id) && lib.list().length === 1, 'removed');
    assert(!lib.remove(999999), 'remove unknown');
    // The library is not part of the save: a new game keeps it.
    fresh(F, 3);
    assert(lib.list().length === 1, 'survives a new game');
    lib.clear();
    return 'ok';
  },
};
