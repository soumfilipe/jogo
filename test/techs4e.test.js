import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILDINGS, ECONOMY, EDU } from '../src/world/catalog.js';
import { TECH_BY_ID } from '../src/world/techs.js';
import { applyCommand, rectTiles } from '../src/world/commands.js';
import { advance, prepare } from '../src/systems/simulation.js';
import { completeTech } from '../src/systems/research.js';
import { mod, utilityOutput } from '../src/systems/mods.js';
import { minEduFor } from '../src/systems/education.js';
import { computeUtilities } from '../src/systems/utilities.js';
import { computeCoverage } from '../src/systems/services.js';
import { computeWellbeing } from '../src/systems/wellbeing.js';
import { closeMonth, pppPayment } from '../src/systems/economy.js';
import { demandForecast, forecastText } from '../src/systems/census.js';
import { canWork } from '../src/agents/citizens.js';
import { TICKS_PER_DAY } from '../src/core/time.js';
import { createSave, readSave } from '../src/save/format.js';
import { testCity } from './helpers.js';

const S = 48;
const at = (x, y) => y * S + x;
const SIX = ['combate_epidemias', 'mrna', 'estatistica', 'ppp', 'baterias_rede', 'nuclear'];

test('as seis tecnologias da 4e-a podem ser pesquisadas', () => {
  for (const id of SIX) assert.equal(TECH_BY_ID.get(id).ready, true, id);
});

test('saúde: epidemias metade das vezes com a saúde sanitária e 3x mais curtas com o mRNA', () => {
  const { state, rt } = testCity();
  assert.equal(mod(rt, 'epidemicChance'), 1);
  completeTech(state, rt, 'combate_epidemias');
  completeTech(state, rt, 'mrna');
  assert.equal(mod(rt, 'epidemicChance'), 0.5);
  assert.ok(Math.abs(mod(rt, 'epidemicLength') - 1 / 3) < 1e-9);
});

test('censo: mapas de escolaridade e desemprego por casa; previsão da demanda', () => {
  const { state, rt } = testCity({ seed: 3 });
  advance(state, rt, TICKS_PER_DAY * 8);
  computeCoverage(state, rt);
  computeWellbeing(state, rt);
  const home = state.buildings.find((b) => rt.residents.get(b.id)?.size > 2);
  const people = [...rt.residents.get(home.id)].map((id) => rt.citizenById.get(id));
  const edu = people.reduce((s, c) => s + (c.edu ?? 0), 0) / people.length / EDU.POS;
  assert.ok(Math.abs(rt.eduMap[home.tile] - edu) < 1e-6);
  const workers = people.filter((c) => c.job !== null || canWork(c));
  if (workers.length) assert.ok(Math.abs(rt.jobsMap[home.tile] - workers.filter((c) => c.job !== null).length / workers.length) < 1e-6);

  // Previsão: só com a pesquisa e com dados de pelo menos 7 dias.
  assert.equal(forecastText(rt), '');
  completeTech(state, rt, 'estatistica');
  rt.demandTrend = [];
  assert.match(forecastText(rt), /coletando/);
  for (let d = 0; d < 20; d++) rt.demandTrend.push({ day: d, residential: d, commercial: 5, industrial: 10 - d, rural: 0 });
  const f = demandForecast(rt);
  assert.equal(f.residential.dir, 'sobe');
  assert.equal(f.commercial.dir, 'estavel');
  assert.equal(f.industrial.dir, 'cai');
  assert.ok(f.residential.future <= 25);
  assert.match(forecastText(rt), /R ↑ subindo, C → estável, I ↓ caindo/);
  // A simulação guarda uma amostra por dia.
  advance(state, rt, TICKS_PER_DAY * 2);
  assert.ok(rt.demandTrend.length >= 1);
});

test('PPP: obra pública sem pagar à vista, contrato de 10 anos, parcela no mês e limite da receita', () => {
  const { state, rt } = testCity({ seed: 4 });
  advance(state, rt, TICKS_PER_DAY * 10);
  applyCommand(state, rt, { type: 'bulldoze', tiles: rectTiles(S, 3, 3, 6, 3) });
  assert.match(applyCommand(state, rt, { type: 'ppp', on: true }).reason, /tecnologia/);
  completeTech(state, rt, 'ppp');
  assert.ok(applyCommand(state, rt, { type: 'ppp', on: true }).ok);
  const money = state.economy.money;
  const r = applyCommand(state, rt, { type: 'place', building: 'biblioteca', tile: at(3, 3) });
  assert.ok(r.ok, r.reason);
  assert.equal(state.economy.money, money, 'nada à vista');
  const contract = state.economy.loans.at(-1);
  assert.equal(contract.kind, 'ppp');
  assert.equal(contract.monthsLeft, ECONOMY.pppMonths);
  assert.match(contract.building, /Biblioteca/);
  assert.equal(contract.payment, pppPayment(rt, BUILDINGS.biblioteca.utility.cost));
  assert.match(applyCommand(state, rt, { type: 'repay', id: contract.id }).reason, /PPP/);

  // Salvar e carregar com o contrato aberto.
  const { state: copy } = readSave(JSON.stringify(createSave(state, { id: 'ppp' })));
  assert.deepEqual(copy.economy.loans, state.economy.loans);
  assert.equal(copy.economy.ppp, true);
  prepare(copy);

  closeMonth(state, rt);
  assert.equal(contract.monthsLeft, ECONOMY.pppMonths - 1);
  assert.ok(contract.balance < contract.amount);

  // Limite: as parcelas de PPP não passam de 20% da receita.
  contract.payment = 10_000_000;
  assert.match(applyCommand(state, rt, { type: 'place', building: 'biblioteca', tile: at(6, 3) }).reason, /PPP passariam/);
  // Sem a opção, paga à vista como sempre.
  applyCommand(state, rt, { type: 'ppp', on: false });
  const m = state.economy.money;
  assert.ok(applyCommand(state, rt, { type: 'place', building: 'biblioteca', tile: at(6, 3) }).ok);
  assert.ok(state.economy.money < m);
});

test('baterias: guardam o excedente solar (até metade); sem renovável, nada', () => {
  const { state, rt } = testCity({ utilities: false });
  state.economy.money = 1_000_000;
  completeTech(state, rt, 'usina_solar');
  completeTech(state, rt, 'baterias_rede');
  assert.ok(applyCommand(state, rt, { type: 'place', building: 'usina_carvao', tile: at(2, 3) }).ok);
  assert.ok(applyCommand(state, rt, { type: 'place', building: 'bateria_rede', tile: at(6, 3) }).ok);
  const battery = state.buildings.find((b) => b.type === 'bateria_rede');
  for (let i = 0; i < BUILDINGS.bateria_rede.jobs; i++) rt.workers.get(battery.id).add(-1 - i);
  const net = () => [...rt.utilityNets.values()].find((e) => e.power.supply > 0).power;
  computeUtilities(state, rt);
  assert.equal(net().stored, 0, 'só carvão: a bateria não guarda nada');
  const coal = net().supply;

  assert.ok(applyCommand(state, rt, { type: 'place', building: 'usina_solar', tile: at(10, 3) }).ok);
  computeUtilities(state, rt);
  const solar = utilityOutput(rt, 'usina_solar', 'power');
  assert.equal(net().stored, Math.round(Math.min(BUILDINGS.bateria_rede.utility.storage, solar * 0.5)));
  assert.equal(net().supply, coal + solar + net().stored);
  // Sem funcionários, a bateria não funciona.
  rt.workers.get(battery.id).clear();
  computeUtilities(state, rt);
  assert.equal(net().stored, 0);
});

test('nuclear: liberada pela pesquisa, 9.000 de energia, exige graduados e água', () => {
  const { state, rt } = testCity({ utilities: false });
  state.economy.money = 1_000_000;
  assert.match(applyCommand(state, rt, { type: 'place', building: 'usina_nuclear', tile: at(2, 3) }).reason, /tecnologia/);
  completeTech(state, rt, 'nuclear');
  assert.equal(utilityOutput(rt, 'usina_nuclear', 'power'), Math.round(9000 * mod(rt, 'output.power')));
  assert.equal(minEduFor(rt, 'usina_nuclear'), EDU.SUPERIOR);
  assert.equal(BUILDINGS.usina_nuclear.utility.pollution, 0);
  assert.match(applyCommand(state, rt, { type: 'place', building: 'usina_nuclear', tile: at(2, 3) }).reason, /rio ou lago/);
});
