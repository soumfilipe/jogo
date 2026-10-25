import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILDINGS, CHILDCARE, EDU, TERRAIN, ZONE } from '../src/world/catalog.js';
import { createWorld } from '../src/world/world.js';
import { addBuilding, setJob } from '../src/world/runtime.js';
import { applyCommand, lineTiles } from '../src/world/commands.js';
import { prepare } from '../src/systems/simulation.js';
import { createCitizen } from '../src/agents/citizens.js';
import { enrollStudents } from '../src/systems/education.js';
import { homeStress, overloadedParents, productivity, updateStress } from '../src/systems/childcare.js';
import { computeCoverage } from '../src/systems/services.js';
import { computeWellbeing } from '../src/systems/wellbeing.js';
import { monthlyBudget } from '../src/systems/economy.js';
import { completeTech } from '../src/systems/research.js';
import { isUnlocked } from '../src/systems/mods.js';

const W = 60;

function town() {
  const state = createWorld({ width: W, height: W, seed: 12 });
  state.map.terrain.fill(TERRAIN.GRASS);
  state.utilities.imported = { power: true, water: true };
  state.economy.money = 10_000_000;
  const rt = prepare(state);
  applyCommand(state, rt, { type: 'road', tiles: lineTiles(W, 0, 5, W - 1, 5) });
  return { state, rt };
}

/** Casa com uma família: dois adultos empregados, um avô e uma criança de `kidAge` anos. */
function family(state, rt, x, kidAge = 2) {
  applyCommand(state, rt, { type: 'zone', zone: ZONE.RESIDENTIAL, tiles: [6 * W + x] });
  const home = addBuilding(state, rt, 'apartamentos', 6 * W + x);
  const office = state.buildings.find((b) => b.type === 'hospital') ?? addBuilding(state, rt, 'hospital', 2 * W + 40);
  const mom = createCitizen(state, rt, home, { age: 30, edu: EDU.MEDIO, lastName: `Silva${x}` });
  const dad = createCitizen(state, rt, home, { age: 32, edu: EDU.MEDIO, lastName: `Silva${x}` });
  const grandpa = createCitizen(state, rt, home, { age: 70, lastName: `Silva${x}` });
  const kid = createCitizen(state, rt, home, { age: kidAge, edu: EDU.NONE, lastName: `Silva${x}` });
  const neighbor = createCitizen(state, rt, home, { age: 40, lastName: `Souza${x}` });
  for (const c of [mom, dad, neighbor]) setJob(rt, c, office.id, 480, 1020, null);
  return { home, mom, dad, grandpa, kid, neighbor };
}

test('pais que trabalham, com filho de 0 a 5 anos fora da creche, rendem 40%', () => {
  const { state, rt } = town();
  const f = family(state, rt, 10);
  const over = overloadedParents(state, rt);
  assert.equal(over.get(f.mom.id), 1, 'sem creche: penalidade cheia');
  assert.ok(over.has(f.dad.id));
  assert.ok(!over.has(f.grandpa.id), 'quem não trabalha não perde produtividade');
  assert.ok(!over.has(f.neighbor.id), 'outra família na mesma casa não é afetada');
  assert.equal(productivity(over, f.mom.id), CHILDCARE.productivity);

  // Filho de 6 anos já está fora da faixa da creche.
  const older = family(state, rt, 20, 6);
  assert.ok(!overloadedParents(state, rt).has(older.mom.id));
});

test('creche desde o começo: com vaga a penalidade cai para 25%; com Educação infantil, some', () => {
  const { state, rt } = town();
  assert.equal(isUnlocked(rt, 'creche'), true, 'creche liberada desde o começo');
  const f = family(state, rt, 10);
  const without = monthlyBudget(state, rt).income.residential;
  const creche = addBuilding(state, rt, 'creche', 4 * W + 11);
  for (let i = 0; i < BUILDINGS.creche.jobs; i++) rt.workers.get(creche.id).add(-1 - i);
  enrollStudents(state, rt);
  assert.equal(f.kid.stage, 'creche');
  const partial = overloadedParents(state, rt);
  assert.equal(partial.get(f.mom.id), CHILDCARE.enrolled);
  assert.ok(Math.abs(productivity(partial, f.mom.id) - (1 - (1 - CHILDCARE.productivity) * CHILDCARE.enrolled)) < 1e-9);
  const withCreche = monthlyBudget(state, rt).income.residential;
  assert.ok(withCreche > without);

  // Estresse sobe bem mais devagar com o filho na creche e para em 25%.
  updateStress(state, rt);
  assert.ok(Math.abs(f.mom.stress - CHILDCARE.rise * CHILDCARE.enrolled) < 1e-9);
  for (let d = 0; d < 200; d++) updateStress(state, rt);
  assert.equal(f.mom.stress, CHILDCARE.enrolled);

  completeTech(state, rt, 'jardim_infancia');
  assert.equal(overloadedParents(state, rt).size, 0);
  assert.ok(monthlyBudget(state, rt).income.residential > withCreche);
});

test('estresse sobe a cada dia sem creche, baixa depois, e tira satisfação da casa', () => {
  const { state, rt } = town();
  const f = family(state, rt, 10);
  const calm = family(state, rt, 30, 8);
  for (let d = 0; d < 10; d++) updateStress(state, rt);
  assert.ok(Math.abs(f.mom.stress - 10 * CHILDCARE.rise) < 1e-9);
  assert.equal(calm.mom.stress, undefined);
  assert.ok(homeStress(rt, f.home) > 0);

  computeCoverage(state, rt);
  computeWellbeing(state, rt);
  const stressed = rt.wellbeing.get(f.home.id);
  const relaxed = rt.wellbeing.get(calm.home.id);
  assert.ok(stressed.satisfaction < relaxed.satisfaction && stressed.health < relaxed.health);

  // A criança faz 6 anos: o estresse baixa até sumir.
  f.kid.age = 6;
  for (let d = 0; d < 10; d++) updateStress(state, rt);
  assert.equal(f.mom.stress, undefined);
});
