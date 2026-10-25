import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILDINGS, EDU, FOOD, TERRAIN, ZONE } from '../src/world/catalog.js';
import { createWorld } from '../src/world/world.js';
import { addBuilding } from '../src/world/runtime.js';
import { applyCommand, lineTiles, rectTiles } from '../src/world/commands.js';
import { advance, prepare } from '../src/systems/simulation.js';
import { completeTech } from '../src/systems/research.js';
import { createCitizen } from '../src/agents/citizens.js';
import { foundCompanies } from '../src/systems/companies.js';
import { farmOutput, foodBalance } from '../src/systems/food.js';
import { computeCoverage } from '../src/systems/services.js';
import { computeWellbeing } from '../src/systems/wellbeing.js';
import { monthlyBudget } from '../src/systems/economy.js';
import { computeMods, levelUnlocked, mod } from '../src/systems/mods.js';
import { isServed } from '../src/systems/utilities.js';
import { createSave, readSave, checksum } from '../src/save/format.js';
import { upgradeBlockers } from '../src/systems/growth.js';
import { leasedJobs } from '../src/world/runtime.js';
import { TICKS_PER_DAY } from '../src/core/time.js';
import { testCity } from './helpers.js';

const W = 60;

function town() {
  const state = createWorld({ width: W, height: W, seed: 9 });
  state.map.terrain.fill(TERRAIN.GRASS);
  state.utilities.imported = { power: true, water: true };
  state.economy.money = 10_000_000;
  const rt = prepare(state);
  applyCommand(state, rt, { type: 'road', tiles: lineTiles(W, 0, 5, W - 1, 5) });
  return { state, rt };
}

/** Fazenda com as vagas preenchidas por moradores de uma casa. */
function staffedFarm(state, rt, type, tile) {
  applyCommand(state, rt, { type: 'zone', zone: ZONE.RURAL, tiles: [tile] });
  const farm = addBuilding(state, rt, type, tile);
  foundCompanies(state, rt, farm);
  for (let i = 0; i < BUILDINGS[type].jobs; i++) rt.workers.get(farm.id).add(-1 - i - farm.id * 1000);
  return farm;
}

function home(state, rt, x, people = 4) {
  applyCommand(state, rt, { type: 'zone', zone: ZONE.RESIDENTIAL, tiles: [6 * W + x] });
  const b = addBuilding(state, rt, 'apartamentos', 6 * W + x);
  for (let i = 0; i < people; i++) createCitizen(state, rt, b, { age: 30, edu: EDU.FUNDAMENTAL });
  return b;
}

test('fazendas crescem na zona rural sem energia e água, enquanto a cidade importa comida', () => {
  const { state, rt } = testCity({ utilities: false, size: 48 });
  applyCommand(state, rt, { type: 'zone', zone: ZONE.RURAL, tiles: rectTiles(48, 2, 3, 8, 6) });
  advance(state, rt, TICKS_PER_DAY * 3);
  const farms = state.buildings.filter((b) => BUILDINGS[b.type].zone === ZONE.RURAL);
  assert.ok(farms.length > 0, 'nasceram fazendas');
  assert.ok(farms.every((b) => isServed(rt, b)), 'fazenda funciona fora da rede');
  assert.equal(rt.companiesIn.get(farms[0].id).length, 1, 'uma empresa por fazenda');
});

test('balanço: falta vira importação no orçamento; sobra vira exportação', () => {
  const { state, rt } = town();
  home(state, rt, 10, 40);
  let f = foodBalance(state, rt);
  assert.equal(f.production, 0);
  assert.ok(Math.abs(f.consumption - 40 * FOOD.perResident * (1 + FOOD.waste)) < 1e-9);
  assert.equal(monthlyBudget(state, rt).expenses.food, Math.round(f.consumption * FOOD.importPrice));

  staffedFarm(state, rt, 'sitio', 4 * W + 20);
  staffedFarm(state, rt, 'sitio', 4 * W + 21);
  f = foodBalance(state, rt);
  assert.equal(f.production, 2 * BUILDINGS.sitio.food);
  assert.equal(f.imported, 0);
  assert.equal(monthlyBudget(state, rt).income.food, Math.round(f.exported * FOOD.exportPrice));
});

test('fazenda em areia produz metade, até a agricultura tropical; adubo e trator', () => {
  const { state, rt } = town();
  state.map.terrain[4 * W + 30] = TERRAIN.SAND;
  const farm = staffedFarm(state, rt, 'sitio', 4 * W + 30);
  assert.equal(farmOutput(state, rt, farm), BUILDINGS.sitio.food * FOOD.sand);
  completeTech(state, rt, 'agricultura_tropical');
  assert.equal(farmOutput(state, rt, farm), BUILDINGS.sitio.food);
  completeTech(state, rt, 'adubo');
  assert.ok(Math.abs(farmOutput(state, rt, farm) - BUILDINGS.sitio.food * 1.6) < 1e-9);
  assert.ok(mod(rt, 'pollution.farm', 0) > 0, 'adubo polui');

  assert.equal(levelUnlocked(rt, ZONE.RURAL, 2), false);
  completeTech(state, rt, 'trator');
  assert.equal(levelUnlocked(rt, ZONE.RURAL, 2), true);
  assert.equal(levelUnlocked(rt, ZONE.RURAL, 3), false);
  assert.ok(Math.abs(mod(rt, 'jobs.rural.1') - 0.6) < 1e-9);

  // Com menos vagas (trator), a fazenda lotada com as vagas da empresa pode subir de nível.
  applyCommand(state, rt, { type: 'zone', zone: ZONE.RURAL, tiles: [4 * W + 40] });
  const small = addBuilding(state, rt, 'sitio', 4 * W + 40);
  foundCompanies(state, rt, small);
  const jobs = leasedJobs(rt, small);
  assert.ok(jobs < BUILDINGS.sitio.jobs);
  for (let i = 0; i < jobs; i++) rt.workers.get(small.id).add(-500 - i);
  const blockers = upgradeBlockers(state, rt, small).blockers;
  assert.ok(!blockers.some((x) => x.includes('vagas')), blockers.join('; '));
});

test('acesso a alimentos: casa perto do mercado tem mais saúde e satisfação', () => {
  const { state, rt } = town();
  const near = home(state, rt, 12);
  const far = home(state, rt, 55);
  const market = addBuilding(state, rt, 'mercado_municipal', 4 * W + 12);
  rt.workers.get(market.id).add(-1);
  computeCoverage(state, rt);
  computeWellbeing(state, rt);
  assert.ok(rt.coverage.alimentos[near.tile] > 0);
  assert.equal(rt.coverage.alimentos[far.tile], 0);
  const a = rt.wellbeing.get(near.id);
  const b = rt.wellbeing.get(far.id);
  assert.ok(a.health > b.health && a.satisfaction > b.satisfaction);

  // O mercado do bairro (comércio nível 2) também vende alimentos.
  applyCommand(state, rt, { type: 'zone', zone: ZONE.COMMERCIAL, tiles: [6 * W + 50] });
  const shop = addBuilding(state, rt, 'mercado', 6 * W + 50);
  rt.workers.get(shop.id).add(-2);
  computeCoverage(state, rt);
  assert.ok(rt.coverage.alimentos[far.tile] > 0);
});

test('Ceasa barateia a comida importada; mercado municipal começa liberado', () => {
  const { state, rt } = town();
  home(state, rt, 10, 40);
  const before = monthlyBudget(state, rt).expenses.food;
  assert.ok(applyCommand(state, rt, { type: 'place', building: 'mercado_municipal', tile: 4 * W + 2 }).ok);
  completeTech(state, rt, 'ceasa');
  const ceasa = addBuilding(state, rt, 'ceasa', 2 * W + 30);
  rt.workers.get(ceasa.id).add(-3);
  computeMods(state, rt);
  assert.equal(monthlyBudget(state, rt).expenses.food, Math.round(before * 0.8));
});

test('save v12 ganha o imposto rural', () => {
  const { state, rt } = testCity();
  advance(state, rt, TICKS_PER_DAY);
  const v12 = createSave(state, { id: 'v12' });
  delete v12.data.economy.taxes.rural;
  v12.version = 12;
  v12.checksum = checksum(v12.data);
  const { state: migrated } = readSave(JSON.stringify(v12));
  assert.equal(migrated.economy.taxes.rural, 9);
  prepare(migrated);
});

test('cidade com fazendas e mercados: salvar no meio do dia não muda nada', () => {
  const build = () => {
    const { state, rt } = testCity({ seed: 91 });
    applyCommand(state, rt, { type: 'road', tiles: lineTiles(48, 1, 45, 46, 45) });
    applyCommand(state, rt, { type: 'zone', zone: ZONE.RURAL, tiles: rectTiles(48, 1, 43, 46, 44) });
    assert.ok(applyCommand(state, rt, { type: 'place', building: 'mercado_municipal', tile: 8 * 48 + 10 }).ok);
    return { state, rt };
  };
  const a = build();
  advance(a.state, a.rt, TICKS_PER_DAY * 10 + 600);
  assert.ok(a.state.buildings.some((b) => BUILDINGS[b.type].zone === ZONE.RURAL));
  const { state: loaded } = readSave(JSON.stringify(createSave(a.state, { id: 'meio-do-dia' })));
  const rtLoaded = prepare(loaded);
  advance(a.state, a.rt, TICKS_PER_DAY * 5);
  advance(loaded, rtLoaded, TICKS_PER_DAY * 5);
  assert.deepEqual(loaded.citizens, a.state.citizens);
  assert.deepEqual(loaded.buildings, a.state.buildings);
  assert.deepEqual(loaded.wellbeing, a.state.wellbeing);
});
