import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILDINGS, EDU, FIRE, TERRAIN, ZONE } from '../src/world/catalog.js';
import { createWorld } from '../src/world/world.js';
import { addBuilding } from '../src/world/runtime.js';
import { applyCommand, lineTiles } from '../src/world/commands.js';
import { advance, prepare } from '../src/systems/simulation.js';
import { createCitizen } from '../src/agents/citizens.js';
import { computeCoverage } from '../src/systems/services.js';
import { applyEmigration, closeHealthMonth, computeWellbeing, mortalityFactor } from '../src/systems/wellbeing.js';
import { applyFires } from '../src/systems/fire.js';
import { POLICIES, policyCost } from '../src/systems/policies.js';
import { completeTech } from '../src/systems/research.js';
import { mod } from '../src/systems/mods.js';
import { monthlyBudget } from '../src/systems/economy.js';
import { enrollStudents } from '../src/systems/education.js';
import { computeUtilities } from '../src/systems/utilities.js';
import { createSave, readSave, checksum } from '../src/save/format.js';
import { TICKS_PER_DAY } from '../src/core/time.js';
import { EFFECTS } from '../src/world/techs.js';
import { testCity } from './helpers.js';

const W = 60;

function town() {
  const state = createWorld({ width: W, height: W, seed: 3 });
  state.map.terrain.fill(TERRAIN.GRASS);
  state.utilities.imported = { power: true, water: true };
  state.economy.money = 10_000_000;
  const rt = prepare(state);
  applyCommand(state, rt, { type: 'road', tiles: lineTiles(W, 0, 5, W - 1, 5) });
  computeUtilities(state, rt);
  return { state, rt };
}

/** Prédio do jogador já com funcionários (para cobrir sem esperar contratação). */
function staffed(state, rt, type, tile) {
  const b = addBuilding(state, rt, type, tile);
  for (let i = 0; i < BUILDINGS[type].jobs; i++) rt.workers.get(b.id).add(-1 - i - b.id * 1000);
  return b;
}

function home(state, rt, x, people = 4) {
  applyCommand(state, rt, { type: 'zone', zone: ZONE.RESIDENTIAL, tiles: [6 * W + x] });
  const b = addBuilding(state, rt, 'apartamentos', 6 * W + x);
  for (let i = 0; i < people; i++) createCitizen(state, rt, b, { age: 30, edu: EDU.FUNDAMENTAL });
  return b;
}

test('cobertura: cai com a distância, some fora do raio e sem funcionários', () => {
  const { state, rt } = town();
  const h = staffed(state, rt, 'hospital', 3 * W + 10);
  const empty = addBuilding(state, rt, 'delegacia', 3 * W + 40);
  computeCoverage(state, rt);
  const at = (x, y) => rt.coverage.saude[y * W + x];
  assert.ok(at(11, 4) > at(20, 4), 'mais perto, mais cobertura');
  assert.ok(at(20, 4) > 0);
  assert.equal(at(50, 4), 0, 'fora do raio');
  assert.equal(rt.coverage.policia[3 * W + 40], 0, 'delegacia sem funcionários não cobre');
  assert.ok(h);
  assert.ok(empty);
});

test('bem-estar: hospital melhora a saúde, polícia baixa o crime, e os dois a satisfação', () => {
  const { state, rt } = town();
  const near = home(state, rt, 12);
  const far = home(state, rt, 55);
  staffed(state, rt, 'hospital', 3 * W + 10);
  staffed(state, rt, 'delegacia', 4 * W + 14);
  computeCoverage(state, rt);
  computeWellbeing(state, rt);
  const a = rt.wellbeing.get(near.id);
  const b = rt.wellbeing.get(far.id);
  assert.ok(a.health > b.health, `saúde ${a.health} > ${b.health}`);
  assert.ok(a.crime < b.crime, `crime ${a.crime} < ${b.crime}`);
  assert.ok(a.satisfaction > b.satisfaction, `satisfação ${a.satisfaction} > ${b.satisfaction}`);
  assert.ok(mortalityFactor(state, rt, rt.citizenById.get([...rt.residents.get(near.id)][0]))
    < mortalityFactor(state, rt, rt.citizenById.get([...rt.residents.get(far.id)][0])), 'mais saúde, menos mortes');
});

test('emigração: casa muito insatisfeita perde uma família inteira', () => {
  const { state, rt } = town();
  const b = home(state, rt, 20);
  computeCoverage(state, rt);
  computeWellbeing(state, rt);
  rt.wellbeing.get(b.id).satisfaction = 0;
  let left = 0;
  for (let i = 0; i < 40 && left === 0; i++) left = applyEmigration(state, rt);
  assert.ok(left > 0);
});

test('incêndio: sem bombeiros vira ruína (e moradores saem); com bombeiros no raio, apagam', () => {
  const saved = { ...FIRE };
  try {
    FIRE.dailyChance = 1;
    FIRE.spreadChance = 0;
    const one = town();
    const b = home(one.state, one.rt, 20);
    computeCoverage(one.state, one.rt);
    const burned = applyFires(one.state, one.rt);
    assert.deepEqual(burned, [b.id]);
    assert.equal(b.burned, true);
    assert.equal(one.rt.residents.get(b.id).size, 0);

    const two = town();
    const c = home(two.state, two.rt, 20);
    const station = staffed(two.state, two.rt, 'quartel_bombeiros', 4 * W + 20);
    two.rt.coverage = null;
    computeCoverage(two.state, two.rt);
    // Força cobertura total no prédio para não depender do sorteio.
    two.rt.coverage.bombeiros[c.tile] = 1;
    assert.deepEqual(applyFires(two.state, two.rt), []);
    assert.equal(c.burned, undefined);
    assert.ok(station);
  } finally {
    Object.assign(FIRE, saved);
  }
});

test('leis: só com a tecnologia; custam por mês e mudam o jogo', () => {
  const { state, rt } = town();
  home(state, rt, 20, 10);
  assert.match(applyCommand(state, rt, { type: 'policy', id: 'saude_familia', on: true }).reason, /Saúde da família/);
  completeTech(state, rt, 'saude_familia');
  completeTech(state, rt, 'codigo_incendio');
  assert.ok(applyCommand(state, rt, { type: 'policy', id: 'saude_familia', on: true }).ok);
  assert.ok(applyCommand(state, rt, { type: 'policy', id: 'codigo_incendio', on: true }).ok);
  assert.equal(policyCost(state, rt, 'saude_familia'), Math.round(10 * POLICIES.saude_familia.cost.perResident));
  assert.equal(mod(rt, 'fireRisk'), 0.6);
  assert.ok(mod(rt, 'health', 0) >= 0.1);
  assert.equal(monthlyBudget(state, rt).expenses.policies, policyCost(state, rt, 'saude_familia'));
  assert.ok(applyCommand(state, rt, { type: 'policy', id: 'codigo_incendio', on: false }).ok);
  assert.equal(mod(rt, 'fireRisk'), 1);
  assert.deepEqual(state.policies.active, ['saude_familia']);
});

test('toda lei tem tecnologia e toda tecnologia de lei aponta para uma lei', () => {
  for (const [id, p] of Object.entries(POLICIES)) {
    assert.ok(EFFECTS[p.tech]?.some((e) => e.policy === id), `${id} sem tecnologia`);
  }
  for (const [tech, effects] of Object.entries(EFFECTS)) {
    for (const e of effects) if (e.policy) assert.ok(POLICIES[e.policy], `${tech} aponta para ${e.policy}`);
  }
});

test('educação de jovens e adultos: com a lei, adulto sem estudo vai à escola à noite', () => {
  const { state, rt } = town();
  const b = home(state, rt, 12, 0);
  staffed(state, rt, 'escola', 4 * W + 12);
  const adult = createCitizen(state, rt, b, { age: 35, edu: EDU.NONE });
  enrollStudents(state, rt);
  assert.equal(adult.stage, null);
  completeTech(state, rt, 'eja');
  applyCommand(state, rt, { type: 'policy', id: 'eja', on: true });
  enrollStudents(state, rt);
  assert.equal(adult.stage, 'eja');
});

test('epidemia: cidade grande com saúde baixa pode ter uma', () => {
  const { state, rt } = town();
  rt.cityWellbeing = { health: 0.1, crime: 0, satisfaction: 0.5 };
  for (let i = 0; i < 600; i++) state.citizens.push({ id: -i });
  let started = false;
  for (let i = 0; i < 200 && !started; i++) started = closeHealthMonth(state, rt);
  assert.ok(started);
  assert.ok(state.health.epidemicUntil > state.time.tick);
});

test('save v10 ganha leis, epidemia e médias de bem-estar', () => {
  const { state, rt } = testCity();
  advance(state, rt, TICKS_PER_DAY);
  const v10 = createSave(state, { id: 'v10' });
  delete v10.data.policies;
  delete v10.data.health;
  delete v10.data.wellbeing;
  v10.version = 10;
  v10.checksum = checksum(v10.data);
  const { state: migrated } = readSave(JSON.stringify(v10));
  assert.deepEqual(migrated.policies, { active: [] });
  assert.equal(migrated.health.epidemicUntil, 0);
  prepare(migrated);
});

test('cidade com serviços: mesma semente, mesmo resultado; salvar no meio do dia não muda nada', () => {
  const build = () => {
    const { state, rt } = testCity({ seed: 41 });
    for (const [b, x, y] of [['hospital', 20, 3], ['delegacia', 10, 8], ['quartel_bombeiros', 24, 13]]) {
      applyCommand(state, rt, { type: 'place', building: b, tile: y * 48 + x });
    }
    return { state, rt };
  };
  const a = build();
  advance(a.state, a.rt, TICKS_PER_DAY * 10 + 600);
  const { state: loaded } = readSave(JSON.stringify(createSave(a.state, { id: 'meio-do-dia' })));
  const rtLoaded = prepare(loaded);
  advance(a.state, a.rt, TICKS_PER_DAY * 5);
  advance(loaded, rtLoaded, TICKS_PER_DAY * 5);
  assert.deepEqual(loaded.citizens, a.state.citizens);
  assert.deepEqual(loaded.wellbeing, a.state.wellbeing);
  const b = build();
  advance(b.state, b.rt, TICKS_PER_DAY * 15 + 600);
  assert.deepEqual(b.state.citizens, a.state.citizens);
});
