// 35-combat.js — F.combat: turrets, walls, biter spawners/units, player weapons, damage model.
// See design/ARCHITECTURE.md §12 and design/GDD.md §6.17/6.18/6.21/6.24, §7.9, §7.10.
(function () {
  'use strict';

  F.combat = {};
  // F.units: the ARCHITECTURE §1 file table lists this namespace but §12 defines no API for it.
  // Local fallback: a thin read-only alias over the unit helpers so the namespace exists.
  F.units = {};

  // ---------------------------------------------------------------------
  // i18n — this module emits alert kinds and reports entity statuses; GDD §12.4/§12.5 give
  // the canonical text for both. ARCHITECTURE only explicitly assigns item/ent/tech/cat/help
  // ownership to 02-i18n.js, not alert.*/status.*, so we register the handful we use ourselves
  // as a defensive fallback (harmless if 02-i18n.js also adds the same keys with the same text).
  // ---------------------------------------------------------------------
  F.i18n.add('sl', {
    'alert.turret_fire': 'Kupola strelja',
    'alert.turret_out_of_ammo': 'Kupola brez streliva',
    'alert.entity_under_attack': 'Napad na objekte!',
    'alert.entity_destroyed': 'Objekti uničeni',
    'status.working': 'Deluje',
    'status.idle': 'Nedejavno',
    'status.no_ammo': 'Ni streliva',
  });
  F.i18n.add('en', {
    'alert.turret_fire': 'Turret firing',
    'alert.turret_out_of_ammo': 'Turret out of ammo',
    'alert.entity_under_attack': 'Objects under attack!',
    'alert.entity_destroyed': 'Objects destroyed',
    'status.working': 'Working',
    'status.idle': 'Idle',
    'status.no_ammo': 'No ammo',
  });

  // ---------------------------------------------------------------------
  // Unit definitions — GDD §7.9.1
  // ---------------------------------------------------------------------
  const UNIT_DEFS = {
    'small-biter': {
      health: 15, regen: 0.01, damage: 7, cooldown: 35, range: 0.5, speed: 0.2,
      collision: 0.4, pollutionCost: 4, spawnTimeMod: 1, earliestEvo: 0, resist: {},
    },
    'medium-biter': {
      health: 75, regen: 0.01, damage: 15, cooldown: 35, range: 1.0, speed: 0.24,
      collision: 0.6, pollutionCost: 20, spawnTimeMod: 1, earliestEvo: 0.20,
      resist: { physical: { flat: 4, pct: 0.10 }, explosion: { flat: 0, pct: 0.10 } },
    },
    'big-biter': {
      health: 375, regen: 0.02, damage: 30, cooldown: 35, range: 1.5, speed: 0.23,
      collision: 0.8, pollutionCost: 80, spawnTimeMod: 3, earliestEvo: 0.50,
      resist: { physical: { flat: 8, pct: 0.10 }, explosion: { flat: 0, pct: 0.10 } },
    },
  };
  const UNIT_TYPES = ['small-biter', 'medium-biter', 'big-biter'];
  const COMMON_UNIT = { vision: 30, minPursueTicks: 600, maxPursueDist: 50, distractionCd: 300 };

  // Spawn weight points — GDD §7.9.3 (piecewise-linear, 0 before first point, flat after last).
  const SPAWN_WEIGHT_POINTS = {
    'small-biter': [[0.0, 0.3], [0.6, 0.0]],
    'medium-biter': [[0.2, 0.0], [0.6, 0.3], [0.7, 0.1]],
    'big-biter': [[0.5, 0.0], [1.0, 0.4]],
  };

  // Entity resistances used by the damage model — GDD §6.1 footnote (line "Resistances (used by §7.10): ...").
  // ARCHITECTURE's F.data.entities sample does not carry a `resist` field, so this table is a local
  // fallback owned by the combat module (it is the only module applying resistances to melee/gunfire).
  const ENTITY_RESIST = {
    'stone-wall': {
      physical: { flat: 3, pct: 0.20 }, impact: { flat: 45, pct: 0.60 },
      explosion: { flat: 10, pct: 0.30 }, fire: { flat: 0, pct: 1.00 },
    },
    'stone-furnace': {
      fire: { flat: 0, pct: 0.90 }, explosion: { flat: 0, pct: 0.30 }, impact: { flat: 0, pct: 0.30 },
    },
    'biter-spawner': {
      physical: { flat: 2, pct: 0.15 }, fire: { flat: 3, pct: 0.60 },
    },
  };

  // Player/turret weapon stats — GDD §3, §6.17, §6.21. Ammo damage/magazine size come from F.data
  // (item.ammo = {damage, magazineSize}) with these as the fallback when data is missing.
  const WEAPON_DEFS = {
    pistol: { range: 15, cooldown: 15 },
    'submachine-gun': { range: 18, cooldown: 6 },
  };
  const TURRET_RANGE = 18;
  const TURRET_COOLDOWN = 6;
  const TURRET_AMMO_SLOT_CAP = 10; // magazines, not rounds
  const DEFAULT_AMMO_DAMAGE = 5;
  const DEFAULT_MAGAZINE_SIZE = 10;

  const MAX_CORPSES = 200;
  const CORPSE_LIFE_TICKS = 600; // 10 s, cosmetic fade window for the renderer

  // ---------------------------------------------------------------------
  // small helpers
  // ---------------------------------------------------------------------
  function safeBonus(key) {
    try {
      if (F.research && typeof F.research.bonus === 'function') return F.research.bonus(key) || 0;
    } catch (err) { F.log.error('combat: research.bonus failed', err); }
    return 0;
  }

  // GDD §7.9.6 damage-vs-resistance formula.
  function resistDmg(D, R, P) {
    R = R || 0; P = P || 0;
    if (D > R + 1) return (D - R) * (1 - P);
    if (D > 1) return (1 - P) / (R - D + 2);
    return (1 - P) / (R + 1);
  }

  function entityResist(type, kind) {
    const r = ENTITY_RESIST[type];
    const e = r && r[kind];
    return e || { flat: 0, pct: 0 };
  }

  function itemAmmo(itemId) {
    const def = F.data && F.data.items ? F.data.items[itemId] : null;
    if (def && def.ammo) return def.ammo;
    return { damage: DEFAULT_AMMO_DAMAGE, magazineSize: DEFAULT_MAGAZINE_SIZE };
  }

  function piecewiseWeight(points, e) {
    if (e < points[0][0]) return 0;
    for (let i = 0; i < points.length - 1; i++) {
      const e0 = points[i][0], w0 = points[i][1], e1 = points[i + 1][0], w1 = points[i + 1][1];
      if (e <= e1) return e1 === e0 ? w0 : w0 + (w1 - w0) * (e - e0) / (e1 - e0);
    }
    return points[points.length - 1][1];
  }

  function pickWeightedType(evo) {
    let total = 0;
    const weights = {};
    for (const t of UNIT_TYPES) { const w = piecewiseWeight(SPAWN_WEIGHT_POINTS[t], evo); weights[t] = w; total += w; }
    if (total <= 0) return 'small-biter';
    let r = F.rng.next() * total;
    for (const t of UNIT_TYPES) { if (r < weights[t]) return t; r -= weights[t]; }
    return UNIT_TYPES[UNIT_TYPES.length - 1];
  }

  // Lazily-created sub-state for this module (not part of the ARCHITECTURE §18 F.newGame shape;
  // local fallback so combat can track unit/group ids across ticks and saves).
  function ensureCombatState() {
    if (!F.state) return;
    if (!F.state.units) F.state.units = [];
    if (!F.state.corpses) F.state.corpses = [];
    if (!F.state.enemies) F.state.enemies = { evolution: 0, killedSpawners: 0 };
    if (!F.state.combat) F.state.combat = { nextUnitId: 1, nextGroupId: 1, groups: {} };
  }

  function findFreeSpotNear(cx, cy, radius) {
    for (let tries = 0; tries < 10; tries++) {
      const ang = F.rng.range(0, Math.PI * 2);
      const r = F.rng.range(0.3, radius);
      const x = cx + Math.cos(ang) * r, y = cy + Math.sin(ang) * r;
      if (F.world && F.world.passable(Math.floor(x), Math.floor(y))) return { x, y };
    }
    return null;
  }

  function entityRadius(e) {
    if (!e) return 0.3;
    return Math.max(e.w || 1, e.h || 1) / 2;
  }

  // ---------------------------------------------------------------------
  // tracers (F.combat.tracers() for the renderer) — cosmetic only, never serialised.
  // ---------------------------------------------------------------------
  let tracerList = [];
  function addTracer(x1, y1, x2, y2, kind) {
    tracerList.push({ x1, y1, x2, y2, kind, life: 3 });
    if (tracerList.length > 64) tracerList.shift();
  }
  function pruneTracers() {
    for (let i = tracerList.length - 1; i >= 0; i--) {
      tracerList[i].life--;
      if (tracerList[i].life <= 0) tracerList.splice(i, 1);
    }
  }
  F.combat.tracers = function () { return tracerList; };

  // ---------------------------------------------------------------------
  // damage helpers
  // ---------------------------------------------------------------------
  function damagePlayer(amount, sourceLabel) {
    const player = F.state.player;
    if (!player || player.dead) return;
    if (F.player && typeof F.player.damage === 'function') { F.player.damage(amount); return; }
    player.health = Math.max(0, (player.health || 0) - amount);
    F.events.emit('alert', { kind: 'entity_under_attack', x: player.x, y: player.y });
  }

  // F.combat.damageUnit(unit, dmg[, damageType, source]) -> destroyed(bool)
  F.combat.damageUnit = function (unit, dmg, damageType, source) {
    if (!unit || unit.health <= 0) return false;
    damageType = damageType || 'physical';
    const def = UNIT_DEFS[unit.type] || UNIT_DEFS['small-biter'];
    const r = def.resist && def.resist[damageType];
    const final = resistDmg(dmg, r ? r.flat : 0, r ? r.pct : 0);
    unit.health -= final;
    if (unit.health <= 0) return true;
    if (source) {
      unit.target = source.kind === 'player' ? { kind: 'player' } : { kind: 'entity', id: source.id };
      unit.state = 'move';
      unit.blockedTicks = 0;
    }
    return false;
  };

  // ---------------------------------------------------------------------
  // public unit queries
  // ---------------------------------------------------------------------
  F.combat.unitDef = function (type) {
    const def = UNIT_DEFS[type];
    if (!def) { F.log.warn('combat: unknown unit type', type); return null; }
    const merged = Object.assign({}, COMMON_UNIT, def);
    return merged;
  };

  F.combat.unitsNear = function (x, y, r) {
    const out = [];
    if (!F.state || !F.state.units) return out;
    for (const u of F.state.units) {
      if (u.health <= 0) continue;
      if (F.util.dist(x, y, u.x, u.y) <= r) out.push(u);
    }
    return out;
  };

  F.combat.nearestUnit = function (x, y, r) {
    let best = null, bestD = Infinity;
    if (!F.state || !F.state.units) return null;
    for (const u of F.state.units) {
      if (u.health <= 0) continue;
      const d = F.util.dist(x, y, u.x, u.y);
      if (d <= r && d < bestD) { bestD = d; best = u; }
    }
    return best;
  };

  F.combat.evolution = function () {
    return (F.state && F.state.enemies && typeof F.state.enemies.evolution === 'number') ? F.state.enemies.evolution : 0;
  };

  F.combat.spawnUnit = function (type, x, y) {
    if (!UNIT_DEFS[type]) { F.log.warn('combat: spawnUnit unknown type', type); return null; }
    ensureCombatState();
    const id = F.state.combat.nextUnitId++;
    const u = { id, type, x, y, health: UNIT_DEFS[type].health, target: null, state: 'idle', cd: 0, groupId: 0, home: 0, blockedTicks: 0 };
    F.state.units.push(u);
    return u;
  };

  F.units.def = F.combat.unitDef;
  F.units.near = F.combat.unitsNear;
  F.units.nearest = F.combat.nearestUnit;

  // ---------------------------------------------------------------------
  // spawner placement (called by world generation — GDD §7.9.5) and attack-group formation
  // (called by F.pollution — GDD §7.9.4, simplified per ARCHITECTURE §12 into one direct call).
  // ---------------------------------------------------------------------
  F.combat.placeSpawner = function (tx, ty) {
    if (!F.world || !F.entities) { F.log.warn('combat: world/entities not ready'); return null; }
    const def = F.data.entities['biter-spawner'];
    const w = (def && def.size && def.size[0]) || 4, h = (def && def.size && def.size[1]) || 4;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      if (!F.world.buildable(tx + i, ty + j)) { F.log.warn('combat: spawner footprint not buildable', tx, ty); return null; }
    }
    const e = F.entities.create('biter-spawner', tx, ty, 0);
    if (!e) return null;
    const c = F.entities.center(e);
    for (let k = 0; k < 7; k++) {
      const spot = findFreeSpotNear(c[0], c[1], 3.5) || { x: c[0], y: c[1] };
      const u = F.combat.spawnUnit('small-biter', spot.x, spot.y);
      if (u) { u.home = e.id; e.units.push(u.id); }
    }
    return e;
  };

  function findBiggestPolluter(ccx, ccy) {
    if (!F.entities || !F.data) return null;
    const cx = ccx * F.C.CHUNK + F.C.CHUNK / 2, cy = ccy * F.C.CHUNK + F.C.CHUNK / 2;
    let best = null, bestPollution = -1, bestD = Infinity;
    for (const e of F.entities.all()) {
      if (!e || e.health <= 0) continue;
      const def = F.data.entities[e.type];
      if (!def || !def.pollution || def.pollution <= 0) continue;
      const d = F.util.dist(cx, cy, e.x, e.y);
      if (d > 480) continue;
      if (def.pollution > bestPollution || (def.pollution === bestPollution && d < bestD)) {
        best = e; bestPollution = def.pollution; bestD = d;
      }
    }
    return best;
  }

  F.combat.spawnAttack = function (chunk, pollutionCost) {
    ensureCombatState();
    let ccx, ccy;
    if (chunk && typeof chunk.cx === 'number') { ccx = chunk.cx; ccy = chunk.cy; }
    else if (Array.isArray(chunk) && chunk.length >= 2) { ccx = chunk[0]; ccy = chunk[1]; }
    else { F.log.warn('combat: spawnAttack bad chunk arg', chunk); return null; }
    if (!F.entities || !F.world) return null;
    const spawners = F.entities.ofType('biter-spawner').filter((sp) => {
      if (sp.health <= 0) return false;
      const loc = F.world.chunkOf(Math.floor(sp.x), Math.floor(sp.y));
      return Math.max(Math.abs(loc[0] - ccx), Math.abs(loc[1] - ccy)) <= 3;
    });
    if (!spawners.length) return null;

    const evo = F.combat.evolution();
    const budget = Math.max(4, pollutionCost || 0);
    let spent = 0, count = 0;
    const gid = F.state.combat.nextGroupId++;
    const spawned = [];
    while (spent < budget && count < 40) {
      const type = pickWeightedType(evo);
      const cost = UNIT_DEFS[type].pollutionCost;
      if (spent + cost > budget && count > 0) break;
      const sp = spawners[count % spawners.length];
      const c = F.entities.center(sp);
      const spot = findFreeSpotNear(c[0], c[1], 4) || { x: c[0], y: c[1] };
      const u = F.combat.spawnUnit(type, spot.x, spot.y);
      if (!u) break;
      u.groupId = gid; u.state = 'move'; u.home = sp.id;
      spawned.push(u);
      spent += cost; count++;
    }
    if (!spawned.length) return null;

    const target = findBiggestPolluter(ccx, ccy);
    for (const u of spawned) u.target = target ? { kind: 'entity', id: target.id } : { kind: 'player' };
    F.state.combat.groups[gid] = { id: gid, chunk: [ccx, ccy], createdTick: F.state.tick, size: spawned.length };
    return gid;
  };

  // ---------------------------------------------------------------------
  // turret behaviour — GDD §6.17
  // ---------------------------------------------------------------------
  function ensureTurretRounds(e) {
    if (e.roundsLeft > 0) return;
    const slot = e.ammo[0];
    if (!slot || slot.count <= 0) { e.roundsLeft = 0; return; }
    const id = slot.id;
    slot.count--;
    if (slot.count <= 0) e.ammo[0] = null;
    e.roundsLeft = itemAmmo(id).magazineSize || DEFAULT_MAGAZINE_SIZE;
    e.ammoType = id;
  }

  function turretFindTarget(cx, cy) {
    let best = null, bestKind = null, bestD = Infinity;
    if (F.state.units) {
      for (const u of F.state.units) {
        if (u.health <= 0) continue;
        const d = F.util.dist(cx, cy, u.x, u.y);
        if (d <= TURRET_RANGE && d < bestD) { bestD = d; best = u; bestKind = 'unit'; }
      }
    }
    if (F.entities) {
      for (const sp of F.entities.ofType('biter-spawner')) {
        if (sp.health <= 0) continue;
        const c = F.entities.center(sp);
        const d = F.util.dist(cx, cy, c[0], c[1]);
        if (d <= TURRET_RANGE && d < bestD) { bestD = d; best = sp; bestKind = 'entity'; }
      }
    }
    return best ? { ref: best, kind: bestKind } : null;
  }

  function turretTick(e) {
    if (!e.ammo) e.ammo = F.inv.create(1);
    if (e.cd === undefined) e.cd = 0;
    if (e.roundsLeft === undefined) e.roundsLeft = 0;
    if (e.cd > 0) e.cd--;
    ensureTurretRounds(e);

    const hasAmmo = e.roundsLeft > 0 || (e.ammo[0] && e.ammo[0].count > 0);
    if (!hasAmmo) {
      if (e._hadAmmo) F.events.emit('alert', { kind: 'turret_out_of_ammo', x: e.x, y: e.y });
      e._hadAmmo = false;
      e._targeting = false;
      return;
    }
    e._hadAmmo = true;

    const c = F.entities.center(e);
    const target = turretFindTarget(c[0], c[1]);
    e._targeting = !!target;
    if (!target || e.cd > 0) return;

    ensureTurretRounds(e);
    if (e.roundsLeft <= 0) return;

    const cdTicks = Math.max(1, Math.round(TURRET_COOLDOWN / (1 + safeBonus('bulletSpeed'))));
    e.cd = cdTicks;
    e.roundsLeft--;

    const ammoDef = itemAmmo(e.ammoType);
    const dmg = ammoDef.damage * (1 + safeBonus('bulletDamage')) * (1 + safeBonus('turretDamage'));

    let x2, y2;
    if (target.kind === 'unit') {
      x2 = target.ref.x; y2 = target.ref.y;
      F.combat.damageUnit(target.ref, dmg, 'physical', { kind: 'entity', id: e.id });
    } else {
      const tc = F.entities.center(target.ref);
      x2 = tc[0]; y2 = tc[1];
      const r = entityResist(target.ref.type, 'physical');
      const final = resistDmg(dmg, r.flat, r.pct);
      F.entities.damage(target.ref, final, { kind: 'entity', id: e.id });
    }
    e.angle = Math.atan2(y2 - c[1], x2 - c[0]);
    const rec = { x1: c[0], y1: c[1], x2, y2, kind: 'turret', life: 3 };
    tracerList.push(rec);
    if (tracerList.length > 64) tracerList.shift();
    e._tracer = rec;
    F.events.emit('alert', { kind: 'turret_fire', x: c[0], y: c[1] });
  }

  F.behaviours.turret = {
    create(e) {
      e.ammo = F.inv.create(1);
      e.angle = 0;
      e.cd = 0;
      e.roundsLeft = 0;
      e.ammoType = null;
    },
    tick(e) { turretTick(e); },
    accepts(e, item) {
      const def = F.data.items[item];
      if (!def || !def.ammo) return 0;
      if (!e.ammo) return 0;
      const slot = e.ammo[0];
      if (slot && slot.id !== item) return 0;
      return Math.max(0, TURRET_AMMO_SLOT_CAP - (slot ? slot.count : 0));
    },
    insert(e, item, count) {
      const room = F.behaviours.turret.accepts(e, item);
      const n = Math.min(room, count);
      if (n <= 0) return 0;
      const slot = e.ammo[0];
      if (!slot) e.ammo[0] = { id: item, count: n }; else slot.count += n;
      return n;
    },
    inventories(e) { return [{ name: 'ammo', inv: e.ammo }]; },
    status(e) {
      const hasAmmo = e.roundsLeft > 0 || (e.ammo && e.ammo[0] && e.ammo[0].count > 0);
      if (!hasAmmo) return 'no_ammo';
      return e._targeting ? 'working' : 'idle';
    },
  };

  // ---------------------------------------------------------------------
  // wall behaviour — GDD §6.18. Blocking is handled by F.world.passable via def.collides;
  // this behaviour only needs to exist so it is a valid registry entry.
  // ---------------------------------------------------------------------
  F.behaviours.wall = {
    create(e) {},
    status() { return 'working'; },
  };

  // ---------------------------------------------------------------------
  // spawner behaviour — GDD §7.9.2 (idle spawning; attack-bank/gathering-group mechanics are
  // superseded by the simpler F.combat.spawnAttack entry point per ARCHITECTURE §12).
  // ---------------------------------------------------------------------
  function spawnerTick(e) {
    if (!e.units) e.units = [];
    if (e.idleCd === undefined) e.idleCd = 60;
    e.idleCd--;
    if (e.idleCd > 0) return;

    e.units = e.units.filter((id) => {
      const u = F.state.units.find((x) => x.id === id);
      return u && u.health > 0;
    });

    const evo = F.combat.evolution();
    let spawnedType = null;
    if (e.units.length < 7) {
      const c = F.entities.center(e);
      let nearby = 0;
      for (const u of F.state.units) {
        if (u.health <= 0) continue;
        if (F.util.dist(u.x, u.y, c[0], c[1]) <= 10) nearby++;
      }
      if (nearby < 5) {
        const type = pickWeightedType(evo);
        const spot = findFreeSpotNear(c[0], c[1], 10);
        if (spot) {
          const u = F.combat.spawnUnit(type, spot.x, spot.y);
          if (u) { u.home = e.id; e.units.push(u.id); spawnedType = type; }
        }
      }
    }
    const mod = spawnedType ? UNIT_DEFS[spawnedType].spawnTimeMod : 1;
    e.idleCd = spawnedType
      ? Math.round(F.util.lerp(360, 150, evo) * mod)
      : 90; // retry shortly when conditions were not met
  }

  F.behaviours.spawner = {
    create(e) {
      e.units = [];
      e.idleCd = F.rng.int(90);
    },
    tick(e) { spawnerTick(e); },
    onRemove(e) {
      F.events.emit('spawner:destroyed', { id: e.id, x: e.x, y: e.y });
      if (F.state.units) for (const u of F.state.units) if (u.home === e.id) u.home = 0;
    },
    status() { return 'working'; },
  };

  // ---------------------------------------------------------------------
  // player weapons — GDD §3, §6.21
  // ---------------------------------------------------------------------
  function ensurePlayerRounds(player) {
    if (player.ammoRoundsLeft === undefined) player.ammoRoundsLeft = 0;
    if (player.ammoRoundsLeft > 0) return true;
    const order = ['piercing-rounds-magazine', 'firearm-magazine'];
    for (const id of order) {
      const have = F.inv.count(player.inv, id);
      if (have <= 0) continue;
      let taken = 0;
      if (F.player && typeof F.player.take === 'function') taken = F.player.take(id, 1) || 0;
      else taken = F.inv.remove(player.inv, id, 1);
      if (taken > 0) {
        player.ammoRoundsLeft = itemAmmo(id).magazineSize || DEFAULT_MAGAZINE_SIZE;
        player.ammoType = id;
        return true;
      }
    }
    return false;
  }

  function playerWeaponId(player) {
    if (player.weapon) return player.weapon;
    if (F.inv.count(player.inv, 'submachine-gun') > 0) return 'submachine-gun';
    if (F.inv.count(player.inv, 'pistol') > 0) return 'pistol';
    return null;
  }

  function playerTick() {
    const player = F.state.player;
    if (!player || player.dead) return;
    if (player.shootCd === undefined) player.shootCd = 0;
    if (player.shootCd > 0) player.shootCd--;
    if (!player.shooting) return;

    const weaponId = playerWeaponId(player);
    const wdef = weaponId ? WEAPON_DEFS[weaponId] : null;
    if (!wdef) return;
    if (player.shootCd > 0) return;

    const target = F.combat.nearestUnit(player.x, player.y, wdef.range);
    if (!target) return;
    if (!ensurePlayerRounds(player)) return;

    player.shootCd = Math.max(1, Math.round(wdef.cooldown / (1 + safeBonus('bulletSpeed'))));
    player.ammoRoundsLeft--;

    const ammoDef = itemAmmo(player.ammoType);
    const dmg = ammoDef.damage * (1 + safeBonus('bulletDamage'));
    F.combat.damageUnit(target, dmg, 'physical', { kind: 'player' });

    const rec = { x1: player.x, y1: player.y, x2: target.x, y2: target.y, kind: 'player', life: 3 };
    tracerList.push(rec);
    if (tracerList.length > 64) tracerList.shift();
    player._tracer = rec;
  }

  // ---------------------------------------------------------------------
  // unit AI — GDD §7.9.4 (simplified straight-line steering with separation & wall-sliding)
  // ---------------------------------------------------------------------
  function wander(u) {
    u.state = 'idle';
    const speed = (UNIT_DEFS[u.type] || UNIT_DEFS['small-biter']).speed * 0.5;
    const atDest = u.wtx === undefined || F.util.dist(u.x, u.y, u.wtx, u.wty) < 0.2;
    if (atDest) {
      if (!F.rng.chance(0.03)) return;
      let hx = u.x, hy = u.y;
      if (u.home) {
        const sp = F.entities.byId(u.home);
        if (sp) { const c = F.entities.center(sp); hx = c[0]; hy = c[1]; }
      }
      const ang = F.rng.range(0, Math.PI * 2), r = F.rng.range(1, 5);
      u.wtx = hx + Math.cos(ang) * r;
      u.wty = hy + Math.sin(ang) * r;
    }
    moveToward(u, u.wtx, u.wty, speed);
  }

  function moveToward(u, tx, ty, speed) {
    let dx = tx - u.x, dy = ty - u.y;
    const d = Math.hypot(dx, dy);
    if (d < 1e-4) return;
    dx /= d; dy /= d;
    let sx = 0, sy = 0;
    const units = F.state.units;
    for (let i = 0; i < units.length; i++) {
      const other = units[i];
      if (other === u || other.health <= 0) continue;
      const ex = u.x - other.x, ey = u.y - other.y;
      const ed = Math.hypot(ex, ey);
      if (ed > 0 && ed < 1.2) { const f = (1.2 - ed) * 0.005; sx += (ex / ed) * f; sy += (ey / ed) * f; }
    }
    const mx = dx * speed + sx, my = dy * speed + sy;
    const nx = u.x + mx, ny = u.y + my;
    const okx = F.world.passable(Math.floor(nx), Math.floor(u.y));
    const oky = F.world.passable(Math.floor(u.x), Math.floor(ny));
    let moved = false;
    if (okx) { u.x = nx; moved = true; }
    if (oky) { u.y = ny; moved = true; }
    if (!moved) {
      u.blockedTicks = (u.blockedTicks || 0) + 1;
      if (u.blockedTicks > 30 && u.target) {
        const bx = Math.floor(u.x + dx), by = Math.floor(u.y + dy);
        const blocker = F.world.entityAt(bx, by);
        if (blocker) { u.target = { kind: 'entity', id: blocker.id }; u.blockedTicks = 0; }
      }
    } else {
      u.blockedTicks = 0;
    }
  }

  function unitAttack(u, def, targetEntity, targetIsPlayer) {
    u.state = 'attack';
    if (u.cd > 0) return;
    u.cd = def.cooldown;
    if (targetIsPlayer) {
      damagePlayer(def.damage);
    } else if (targetEntity) {
      const r = entityResist(targetEntity.type, 'physical');
      const dmg = resistDmg(def.damage, r.flat, r.pct);
      F.events.emit('alert', { kind: 'entity_under_attack', x: targetEntity.x, y: targetEntity.y });
      const destroyed = F.entities.damage(targetEntity, dmg, { kind: 'unit', id: u.id });
      if (destroyed) u.target = null;
    }
  }

  function aiTick() {
    const units = F.state.units;
    if (!units.length) return;
    const player = F.state.player;
    const playerAlive = !!(player && !player.dead && player.health > 0);

    // targetable player-built entities, gathered once per tick for threat scanning
    const threats = [];
    if (F.entities && F.data) {
      for (const e of F.entities.all()) {
        if (!e || e.health <= 0) continue;
        const def = F.data.entities[e.type];
        if (def && !def.natural) threats.push(e);
      }
    }

    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (u.health <= 0) continue;
      const def = UNIT_DEFS[u.type] || UNIT_DEFS['small-biter'];
      if (u.health < def.health) u.health = Math.min(def.health, u.health + def.regen);
      if (u.cd > 0) u.cd--;

      let targetPos = null, targetEntity = null, targetIsPlayer = false;
      if (u.target) {
        if (u.target.kind === 'player') {
          if (playerAlive) { targetPos = [player.x, player.y]; targetIsPlayer = true; }
          else u.target = null;
        } else if (u.target.kind === 'entity') {
          const te = F.entities.byId(u.target.id);
          if (te && te.health > 0) { targetEntity = te; targetPos = F.entities.center(te); }
          else u.target = null;
        }
      }

      if (!u.target) {
        let best = null, bestD = def.vision || COMMON_UNIT.vision || 30, bestKind = null;
        for (const e2 of threats) {
          const c = F.entities.center(e2);
          const d = F.util.dist(u.x, u.y, c[0], c[1]);
          if (d < bestD) { bestD = d; best = e2; bestKind = 'entity'; }
        }
        if (playerAlive) {
          const d = F.util.dist(u.x, u.y, player.x, player.y);
          if (d < bestD) { bestD = d; best = null; bestKind = 'player'; }
        }
        if (bestKind === 'entity' && best) {
          u.target = { kind: 'entity', id: best.id };
          targetEntity = best; targetPos = F.entities.center(best);
        } else if (bestKind === 'player') {
          u.target = { kind: 'player' };
          targetPos = [player.x, player.y]; targetIsPlayer = true;
        } else {
          wander(u);
          continue;
        }
      }

      const range = def.range + (targetEntity ? entityRadius(targetEntity) : 0.25);
      const dist = F.util.dist(u.x, u.y, targetPos[0], targetPos[1]);
      if (dist <= range) {
        unitAttack(u, def, targetEntity, targetIsPlayer);
      } else {
        u.state = 'move';
        moveToward(u, targetPos[0], targetPos[1], def.speed);
      }
    }
  }

  // ---------------------------------------------------------------------
  // death / corpse bookkeeping
  // ---------------------------------------------------------------------
  function finalizeDeaths() {
    const units = F.state.units;
    if (!units.length) return;
    let anyDead = false;
    for (const u of units) if (u.health <= 0) { anyDead = true; break; }
    if (!anyDead) return;
    const alive = [];
    for (const u of units) {
      if (u.health > 0) { alive.push(u); continue; }
      pushCorpse(u.type, u.x, u.y);
    }
    F.state.units = alive;
  }

  function pushCorpse(type, x, y) {
    F.state.corpses.push({ type, x, y, tick: F.state.tick });
    if (F.state.corpses.length > MAX_CORPSES) F.state.corpses.splice(0, F.state.corpses.length - MAX_CORPSES);
  }

  function pruneCorpses() {
    const list = F.state.corpses;
    if (!list.length) return;
    const cutoff = F.state.tick - CORPSE_LIFE_TICKS;
    let i = 0;
    while (i < list.length && list[i].tick < cutoff) i++;
    if (i > 0) list.splice(0, i);
  }

  // ---------------------------------------------------------------------
  // main tick — GDD §7.2 phase 8
  // ---------------------------------------------------------------------
  F.combat.tick = function () {
    if (!F.state) return;
    ensureCombatState();
    try {
      if (F.entities) {
        const turrets = F.entities.ofType('gun-turret');
        for (const t of turrets) if (t.health > 0) turretTick(t);
      }
      playerTick();
      aiTick();
      if (F.entities) {
        const spawners = F.entities.ofType('biter-spawner');
        for (const sp of spawners) if (sp.health > 0) spawnerTick(sp);
      }
      finalizeDeaths();
      pruneTracers();
      pruneCorpses();
    } catch (err) {
      F.log.error('combat.tick failed', err);
    }
  };
})();
