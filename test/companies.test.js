import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BUILDINGS, COMPANY_CLOSE_DAYS, COMPANY_GRACE_DAYS, SECTORS, TERRAIN, ZONE, buildingFloors, capacityOf,
} from '../src/world/catalog.js';
import { createWorld } from '../src/world/world.js';
import { addBuilding, companyJobs, leasedJobs, openJobs, removeBuilding } from '../src/world/runtime.js';
import { applyCommand, lineTiles } from '../src/world/commands.js';
import { advance, prepare } from '../src/systems/simulation.js';
import { foundCompanies, openCompanies, reviewCompanies, vacantFloors } from '../src/systems/companies.js';
import { computeDemand } from '../src/systems/demand.js';
import { computeUtilities } from '../src/systems/utilities.js';
import { createCitizen, hire } from '../src/agents/citizens.js';
import { TICKS_PER_DAY } from '../src/core/time.js';
import { checksum, createSave, readSave, SAVE_VERSION } from '../src/save/format.js';
import { testCity } from './helpers.js';

// Empresas: alugam andares dos prédios comerciais e industriais e dão as vagas.

const W = 24;

function world() {
  const state = createWorld({ width: W, height: W, seed: 8 });
  state.map.terrain.fill(TERRAIN.GRASS);
  state.utilities.imported = { power: true, water: true };
  state.economy.money = 1_000_000;
  const rt = prepare(state);
  applyCommand(state, rt, { type: 'road', tiles: lineTiles(W, 0, 5, W - 1, 5) });
  return { state, rt };
}

/** Prédio com empresas em todos os andares e um morador por vaga ao lado. */
function staffed(type, floors) {
  const { state, rt } = world();
  const b = addBuilding(state, rt, type, 6 * W + 5);
  if (floors) b.floors = floors;
  foundCompanies(state, rt, b);
  const home = addBuilding(state, rt, 'apartamentos', 4 * W + 5);
  home.floors = 40;
  return { state, rt, b, home };
}

test('prédio novo nasce alugado: empresas cobrem os andares e dão as vagas', () => {
  const { state, rt, b } = staffed('escritorios', 7);
  assert.deepEqual(vacantFloors(rt, b), []);
  assert.equal(leasedJobs(rt, b), capacityOf(b));
  assert.equal(openJobs(rt, b), capacityOf(b));
  const list = rt.companiesIn.get(b.id);
  let next = 0;
  for (const co of list) {
    assert.equal(co.floor, next, 'andares seguidos, sem sobreposição');
    assert.ok(co.floors >= 1 && co.floors <= 3);
    assert.ok(['varejo', 'escritorio'].includes(SECTORS[co.sector].kind));
    if (co.floor > 0) assert.equal(SECTORS[co.sector].kind, 'escritorio');
    assert.ok(co.name.length > 3);
    next += co.floors;
  }
  assert.equal(next, buildingFloors(b));
  assert.equal(state.companies.length, list.length);

  // Indústria: uma empresa só, no prédio inteiro.
  const { rt: rt2, b: plant } = staffed('complexo');
  assert.equal(rt2.companiesIn.get(plant.id).length, 1);
  assert.equal(SECTORS[rt2.companiesIn.get(plant.id)[0].sector].kind, 'industria');
});

test('contratação: cada funcionário entra numa empresa, com o turno do setor dela', () => {
  const { state, rt, b, home } = staffed('loja');
  const [co] = rt.companiesIn.get(b.id);
  co.sector = 'bar'; // bar: só tarde e noite
  for (let i = 0; i < companyJobs(rt, co) + 2; i++) hire(state, rt, createCitizen(state, rt, home), b);
  const workers = [...rt.workers.get(b.id)].map((id) => rt.citizenById.get(id));
  assert.equal(workers.length, companyJobs(rt, co), 'não contrata além das vagas');
  for (const c of workers) {
    assert.equal(c.company, co.id);
    assert.ok(['tarde', 'noturno'].includes(c.shift), c.shift);
  }
  assert.equal(openJobs(rt, b), 0);
});

test('andar vago não tem vagas e recebe empresa nova quando há demanda', () => {
  const { state, rt, b } = staffed('escritorios');
  b.floors = 5; // cresceu um andar
  assert.deepEqual(vacantFloors(rt, b), [4]);
  assert.equal(leasedJobs(rt, b), capacityOf(b) - BUILDINGS.escritorios.perFloor);
  computeDemand(state, rt);
  assert.equal(rt.stats.jobs, leasedJobs(rt, b), 'a demanda só conta andares alugados');

  computeUtilities(state, rt);
  rt.demand.commercial = 0;
  for (let i = 0; i < 200; i++) openCompanies(state, rt);
  assert.deepEqual(vacantFloors(rt, b), [4], 'sem demanda, fica vago');

  rt.demand.commercial = 100;
  for (let i = 0; i < 200 && vacantFloors(rt, b).length; i++) openCompanies(state, rt);
  assert.deepEqual(vacantFloors(rt, b), []);
  assert.equal(rt.companiesIn.get(b.id).at(-1).floor, 4);
  assert.ok(rt.demand.commercial < 100, 'a empresa nova gasta demanda');
});

test('empresa sem gente fecha, demite e deixa o andar vago', () => {
  const { state, rt, b, home } = staffed('mercado');
  const [first, second] = rt.companiesIn.get(b.id);
  for (let i = 0; i < companyJobs(rt, first); i++) hire(state, rt, createCitizen(state, rt, home), b);
  const one = createCitizen(state, rt, home);
  hire(state, rt, one, b);
  assert.equal(one.company, second.id);

  // No prazo para contratar, nada fecha.
  for (let d = 0; d < COMPANY_CLOSE_DAYS; d++) reviewCompanies(state, rt);
  assert.equal(state.companies.length, 2);

  state.time.tick += COMPANY_GRACE_DAYS * TICKS_PER_DAY;
  for (let d = 0; d < COMPANY_CLOSE_DAYS - 1; d++) reviewCompanies(state, rt);
  assert.equal(second.understaffedDays, COMPANY_CLOSE_DAYS - 1);
  reviewCompanies(state, rt);
  assert.deepEqual(state.companies, [first], 'a lotada continua');
  assert.equal(one.job, null);
  assert.equal(one.company, null);
  assert.deepEqual(vacantFloors(rt, b), [1]);
});

test('demolir o prédio fecha as empresas dele', () => {
  const { state, rt, b, home } = staffed('escritorios');
  const c = createCitizen(state, rt, home);
  hire(state, rt, c, b);
  removeBuilding(state, rt, b.id);
  assert.equal(state.companies.length, 0);
  assert.equal(rt.companyById.size, 0);
  assert.equal(c.company, null);
});

test('numa cidade rodando, todo emprego do comércio e da indústria é de uma empresa', () => {
  const { state, rt } = testCity({ size: 48, seed: 4 });
  advance(state, rt, TICKS_PER_DAY * 12);
  assert.ok(state.companies.length > 10);
  const workers = state.citizens.filter((c) => c.job !== null);
  assert.ok(workers.length > 50);
  for (const c of workers) {
    const info = BUILDINGS[rt.buildingById.get(c.job).type];
    if (info.zone === ZONE.COMMERCIAL || info.zone === ZONE.INDUSTRIAL) {
      assert.equal(rt.companyById.get(c.company)?.building, c.job, `${c.name} sem empresa no prédio`);
    }
  }
  for (const co of state.companies) assert.ok(rt.companyWorkers.get(co.id).size <= companyJobs(rt, co));
});

test('save com empresas; save antigo ganha empresas e ninguém perde o emprego', () => {
  const { state, rt } = testCity({ size: 32, seed: 6 });
  advance(state, rt, TICKS_PER_DAY * 6 + 60);
  const save = createSave(state, { id: 'empresas' });
  const { state: loaded } = readSave(JSON.stringify(save));
  assert.deepEqual(loaded.companies, state.companies);
  assert.deepEqual(loaded.citizens, state.citizens);

  // Save do formato 6: sem empresas, e cidadãos sem o campo company.
  const v6 = JSON.parse(JSON.stringify(save));
  delete v6.data.companies;
  const old = readSave(JSON.stringify(save)).state; // cópia para montar as colunas
  for (const c of old.citizens) delete c.company;
  v6.data.citizens = createSave({ ...old, companies: [] }, { id: 'x' }).data.citizens;
  v6.version = 6;
  v6.checksum = checksum(v6.data);
  const { save: migrated, state: converted } = readSave(JSON.stringify(v6));
  assert.equal(migrated.version, SAVE_VERSION);
  assert.equal(converted.legacyJobs, true);
  assert.equal(converted.companies.length, 0);

  const rt2 = prepare(converted);
  assert.equal(converted.legacyJobs, undefined);
  assert.ok(converted.companies.length > 0);
  for (const c of converted.citizens) {
    const before = state.citizens.find((x) => x.id === c.id);
    assert.equal(c.job, before.job, 'mesmo emprego');
    assert.equal(c.shift, before.shift, 'mesmo turno');
    assert.equal(c.departWork, before.departWork, 'mesmo horário');
    if (c.job === null) continue;
    const info = BUILDINGS[rt2.buildingById.get(c.job).type];
    if (info.zone === ZONE.COMMERCIAL || info.zone === ZONE.INDUSTRIAL) {
      assert.equal(rt2.companyById.get(c.company).building, c.job);
    } else {
      assert.equal(c.company, null);
    }
  }
  for (const b of converted.buildings) {
    const info = BUILDINGS[b.type];
    if (info.zone !== ZONE.COMMERCIAL && info.zone !== ZONE.INDUSTRIAL) continue;
    assert.deepEqual(vacantFloors(rt2, b), [], 'todos os andares alugados');
  }
  // E a cidade segue rodando, com os empregos nas empresas.
  const employed = converted.citizens.filter((c) => c.job !== null).length;
  advance(converted, rt2, TICKS_PER_DAY);
  assert.ok(converted.citizens.filter((c) => c.job !== null).length >= employed * 0.9);
});
