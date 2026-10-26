import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILDINGS, CONSUMPTION, ECONOMY, MIXED, ZONE, capacityOf, floorsOf } from '../src/world/catalog.js';
import { openJobs } from '../src/world/runtime.js';
import { TECH_BY_ID } from '../src/world/techs.js';
import { applyCommand, rectTiles } from '../src/world/commands.js';
import { advance, prepare } from '../src/systems/simulation.js';
import { completeTech } from '../src/systems/research.js';
import { computeDemand } from '../src/systems/demand.js';
import { computeLandValue } from '../src/systems/landvalue.js';
import { countOccupancy } from '../src/systems/traffic.js';
import { monthlyBudget } from '../src/systems/economy.js';
import { consumption } from '../src/systems/utilities.js';
import { minEduFor } from '../src/systems/education.js';
import { TICKS_PER_DAY } from '../src/core/time.js';
import { checksum, createSave, readSave } from '../src/save/format.js';
import { testCity } from './helpers.js';

const S = 48;
const isMixed = (b) => BUILDINGS[b.type].zone === ZONE.MIXED;

/** Cidade de teste com duas faixas residenciais (y = 13 e 33) rezoneadas como mistas. */
function mixedCity(seed = 3, days = 30) {
  const { state, rt } = testCity({ seed });
  for (const y of [13, 33]) {
    const r = applyCommand(state, rt, { type: 'zone', zone: ZONE.MIXED, tiles: rectTiles(S, 1, y, S - 2, y + 3) });
    assert.ok(r.ok, 'zona mista não depende de pesquisa');
  }
  advance(state, rt, TICKS_PER_DAY * days);
  return { state, rt };
}

test('prédios mistos: três níveis, térreo de lojas e consumo somado', () => {
  const types = Object.keys(BUILDINGS).filter((id) => BUILDINGS[id].zone === ZONE.MIXED);
  assert.deepEqual(types.map((id) => BUILDINGS[id].level), [1, 2, 3]);
  for (const id of types) {
    const info = BUILDINGS[id];
    assert.ok(info.residents > 0 && info.shop > 0 && !info.jobs, id);
    // O térreo é um andar a mais, sem moradores.
    assert.equal(floorsOf(info), info.residents / info.perFloor + 1);
    const c = consumption(info);
    const R = CONSUMPTION[ZONE.RESIDENTIAL];
    const C = CONSUMPTION[ZONE.COMMERCIAL];
    assert.equal(c.power, Math.ceil(info.residents * R.power + info.shop * C.power));
    assert.equal(c.water, Math.ceil(info.residents * R.water + info.shop * C.water));
  }
  // Andares a mais só somam moradores.
  const torre = { type: 'misto_torre', floors: floorsOf(BUILDINGS.misto_torre) + 2 };
  assert.equal(capacityOf(torre), 16 + 2 * 4);
  assert.equal(TECH_BY_ID.get('uso_misto').ready, true);
});

test('zona mista cresce com a demanda residencial: moradores em cima, funcionários no térreo', () => {
  const { state, rt } = mixedCity();
  const mixed = state.buildings.filter(isMixed);
  assert.ok(mixed.length > 20, `cresceram ${mixed.length}`);
  let residents = 0;
  let workers = 0;
  for (const b of mixed) {
    const info = BUILDINGS[b.type];
    residents += rt.residents.get(b.id).size;
    workers += rt.workers.get(b.id).size;
    assert.ok(rt.workers.get(b.id).size <= info.shop);
    assert.equal(openJobs(rt, b), b.abandoned === undefined ? info.shop - rt.workers.get(b.id).size : 0);
    assert.equal(rt.companiesIn.get(b.id).length, 0, 'o térreo não tem empresas');
    assert.equal(minEduFor(rt, b.type) <= minEduFor(rt, 'escritorios'), true);
  }
  assert.ok(residents > 0 && workers > 0, `${residents} moradores, ${workers} no térreo`);
  // Subiram de nível como as casas.
  assert.ok(mixed.some((b) => BUILDINGS[b.type].level >= 2));

  // Demanda: moradores contam na moradia, vagas do térreo no comércio.
  const shops = mixed.filter((b) => b.abandoned === undefined).reduce((s, b) => s + BUILDINGS[b.type].shop, 0);
  const before = computeDemand(state, rt).commercial;
  const b = mixed.find((x) => x.abandoned === undefined);
  b.abandoned = state.time.tick;
  assert.equal(computeDemand(state, rt).commercial, before + BUILDINGS[b.type].shop);
  delete b.abandoned;
  assert.ok(shops > 0);

  // Imposto: os funcionários do térreo pagam como comércio.
  const withShops = monthlyBudget(state, rt).income;
  const active = mixed.filter((x) => x.abandoned === undefined);
  for (const x of active) x.abandoned = state.time.tick;
  const without = monthlyBudget(state, rt).income;
  for (const x of active) delete x.abandoned;
  const shopWorkers = active.reduce((s, x) => s + rt.workers.get(x.id).size, 0);
  assert.ok(shopWorkers > 0);
  assert.ok(withShops.commercial > without.commercial, `${withShops.commercial} > ${without.commercial}`);
  assert.ok(withShops.commercial - without.commercial <= Math.ceil(shopWorkers * ECONOMY.incomePerJob * state.economy.taxes.commercial * 2));
});

test('uso misto (pesquisa): quem mora e trabalha em prédio misto perto vai a pé e não pesa no trânsito', () => {
  const { state, rt } = mixedCity(5, 20);
  const walkers = () => state.citizens.filter((c) => c.mode === 'pe');
  // Sem a pesquisa, ninguém vai a pé.
  const day = Math.floor(state.time.tick / TICKS_PER_DAY) + 1;
  advance(state, rt, day * TICKS_PER_DAY + 7 * 60 - state.time.tick);
  let seen = 0;
  for (let m = 0; m < 120; m += 5) {
    advance(state, rt, 5);
    seen += walkers().length;
  }
  assert.equal(seen, 0);

  completeTech(state, rt, 'uso_misto');
  advance(state, rt, (day + 1) * TICKS_PER_DAY + 6 * 60 - state.time.tick);
  let walked = null;
  for (let m = 0; m < 240 && !walked; m += 2) {
    advance(state, rt, 2);
    walked = walkers().find((c) => rt.movers.has(c.id) && state.map.road[Math.floor(c.y) * S + Math.floor(c.x)]);
  }
  assert.ok(walked, 'alguém indo a pé');
  const home = rt.buildingById.get(walked.home);
  const work = rt.buildingById.get(walked.job);
  assert.ok(isMixed(home) && isMixed(work));
  const d = Math.abs((home.tile % S) - (work.tile % S)) + Math.abs(Math.floor(home.tile / S) - Math.floor(work.tile / S));
  assert.ok(d <= MIXED.walkRadius);
  // Não ocupa a rua: a ocupação não muda se ele sumir dos viajantes.
  const t = Math.floor(walked.y) * S + Math.floor(walked.x);
  countOccupancy(state, rt);
  const withIt = rt.occupancy[t];
  rt.movers.delete(walked.id);
  countOccupancy(state, rt);
  rt.movers.add(walked.id);
  assert.equal(rt.occupancy[t], withIt);
});

test('uso misto (pesquisa): o terreno perto dos prédios mistos valoriza', () => {
  const { state, rt } = mixedCity(3, 15);
  const b = state.buildings.find(isMixed);
  computeLandValue(state, rt);
  const before = rt.landValue[b.tile];
  const far = 45 * S + 45; // longe de qualquer misto
  const farBefore = rt.landValue[far];
  completeTech(state, rt, 'uso_misto');
  computeLandValue(state, rt);
  assert.ok(Math.abs(rt.landValue[b.tile] - Math.min(1, before + 0.05)) < 1e-6);
  assert.equal(rt.landValue[far], farBefore);
});

test('salvar e carregar uma cidade mista dá o mesmo resultado; save v20 abre', () => {
  const { state: a, rt: ra } = mixedCity(7, 12);
  completeTech(a, ra, 'uso_misto');
  advance(a, ra, TICKS_PER_DAY + 7 * 60 + 13);
  const { state: b } = readSave(JSON.stringify(createSave(a, { id: 'misto' })));
  const rb = prepare(b);
  advance(a, ra, TICKS_PER_DAY * 3);
  advance(b, rb, TICKS_PER_DAY * 3);
  assert.deepEqual(b.buildings, a.buildings);
  assert.deepEqual(b.citizens.map((c) => [c.x, c.y, c.state, c.mode, c.job]), a.citizens.map((c) => [c.x, c.y, c.state, c.mode, c.job]));
  assert.deepEqual(b.economy, a.economy);

  const v20 = createSave(a, { id: 'v20' });
  v20.version = 20;
  v20.checksum = checksum(v20.data);
  assert.equal(readSave(JSON.stringify(v20)).state.buildings.length, a.buildings.length);
});
