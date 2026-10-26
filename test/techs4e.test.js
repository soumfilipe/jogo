import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILDINGS, ECONOMY, EDU, ZONE } from '../src/world/catalog.js';
import { setJob } from '../src/world/runtime.js';
import { computeDemand } from '../src/systems/demand.js';
import { commutersIn, commutersOut, metroActive } from '../src/systems/metro.js';
import { TECH_BY_ID } from '../src/world/techs.js';
import { applyCommand, planCommand, rectTiles } from '../src/world/commands.js';
import { advance, prepare } from '../src/systems/simulation.js';
import { completeTech } from '../src/systems/research.js';
import { mod, utilityOutput } from '../src/systems/mods.js';
import { minEduFor } from '../src/systems/education.js';
import { computeUtilities } from '../src/systems/utilities.js';
import { computeCoverage } from '../src/systems/services.js';
import { computeWellbeing } from '../src/systems/wellbeing.js';
import { closeMonth, monthlyBudget, pppPayment } from '../src/systems/economy.js';
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

// --- 4e-b: habitação social, impressão 3D, bairro planejado, região metropolitana ---

test('as quatro tecnologias da 4e-b podem ser pesquisadas', () => {
  for (const id of ['habitacao_social', 'impressao_3d', 'plano_piloto', 'regiao_metropolitana']) {
    assert.equal(TECH_BY_ID.get(id).ready, true, id);
  }
});

test('conjunto habitacional: recebe moradores, não cobra imposto residencial e deixa mais satisfeito', () => {
  const { state, rt } = testCity({ seed: 6 });
  advance(state, rt, TICKS_PER_DAY * 6);
  applyCommand(state, rt, { type: 'bulldoze', tiles: rectTiles(S, 3, 3, 4, 4) });
  assert.match(applyCommand(state, rt, { type: 'place', building: 'conjunto_habitacional', tile: at(3, 3) }).reason, /tecnologia/);
  completeTech(state, rt, 'habitacao_social');
  const money = state.economy.money;
  assert.ok(applyCommand(state, rt, { type: 'place', building: 'conjunto_habitacional', tile: at(3, 3) }).ok);
  assert.equal(money - state.economy.money, BUILDINGS.conjunto_habitacional.utility.cost);
  const housing = state.buildings.find((b) => b.type === 'conjunto_habitacional');
  advance(state, rt, TICKS_PER_DAY * 4);
  const residents = [...rt.residents.get(housing.id)].map((id) => rt.citizenById.get(id));
  assert.ok(residents.length > 0, 'gente se mudou para o conjunto');
  assert.ok(rt.service.get(housing.id)?.power && rt.service.get(housing.id)?.water, 'com energia e água');

  // Imposto residencial: os moradores do conjunto não contam.
  const working = residents.filter((c) => c.job !== null);
  const before = monthlyBudget(state, rt).income.residential;
  for (const c of working) c.home = state.buildings.find((b) => rt.residents.get(b.id)?.size && b !== housing).id;
  const after = monthlyBudget(state, rt).income.residential;
  if (working.length) assert.ok(after > before, 'os mesmos trabalhadores fora do conjunto pagam imposto');
  for (const c of working) c.home = housing.id;

  computeCoverage(state, rt);
  computeWellbeing(state, rt);
  assert.ok(rt.wellbeing.get(housing.id).satisfaction > 0);

  // Impressão 3D: 40% mais barato.
  const full = BUILDINGS.conjunto_habitacional.utility.cost;
  completeTech(state, rt, 'impressao_3d');
  assert.ok(Math.abs(mod(rt, 'cost.conjunto_habitacional') - 0.6) < 1e-9);
  assert.equal(planCommand(state, rt, { type: 'place', building: 'conjunto_habitacional', tile: at(20, 3) }).cost, Math.round(full * 0.6 * mod(rt, 'cost.utilities') * mod(rt, 'buildCost')));
});

test('bairro planejado: ruas a cada 5 tiles, faixas R, R e C, 30% mais barato', () => {
  const { state, rt } = testCity({ utilities: false });
  state.economy.money = 1_000_000;
  // Área vazia à direita do mapa de teste? Usa um mapa só com grama.
  const W = state.map.width;
  state.map.road.fill(0);
  state.map.zone.fill(0);
  const rt2 = prepare(state);
  const tiles = rectTiles(W, 5, 5, 20, 20);
  assert.match(applyCommand(state, rt2, { type: 'district', tiles }).reason, /tecnologia/);
  completeTech(state, rt2, 'plano_piloto');
  assert.match(applyCommand(state, rt2, { type: 'district', tiles: rectTiles(W, 5, 5, 8, 8) }).reason, /6×6/);
  const plan = planCommand(state, rt2, { type: 'district', tiles });
  const money = state.economy.money;
  assert.ok(applyCommand(state, rt2, { type: 'district', tiles }).ok);
  assert.equal(money - state.economy.money, plan.cost);
  // Ruas no contorno e a cada 5.
  for (const [x, y] of [[5, 5], [20, 20], [10, 7], [7, 15], [15, 12]]) assert.ok(state.map.road[y * W + x], `rua em ${x},${y}`);
  assert.equal(state.map.road[7 * W + 7], 0);
  assert.equal(state.map.zone[7 * W + 7], ZONE.RESIDENTIAL);
  assert.equal(state.map.zone[17 * W + 7], ZONE.COMMERCIAL);
  // Custo: 70% do que custariam as ruas e as zonas separadas.
  const { state: s2 } = testCity({ utilities: false });
  s2.map.road.fill(0);
  s2.map.zone.fill(0);
  const r2 = prepare(s2);
  completeTech(s2, r2, 'plano_piloto');
  const roads = plan.roads;
  const fullCost = planCommand(s2, r2, { type: 'road', road: 1, tiles: roads }).cost
    + planCommand(s2, r2, { type: 'zone', zone: ZONE.RESIDENTIAL, tiles: tiles.filter((t) => !roads.includes(t)) }).cost;
  assert.ok(Math.abs(plan.cost - Math.round(fullCost * 0.7)) <= 1, `${plan.cost} x ${fullCost}`);
});

test('região metropolitana: só com estrada para fora; gente de fora nas vagas e desempregados trabalhando nas vizinhas', () => {
  const { state, rt } = testCity({ seed: 7 });
  advance(state, rt, TICKS_PER_DAY * 8);
  completeTech(state, rt, 'regiao_metropolitana');
  computeDemand(state, rt);
  assert.equal(metroActive(state, rt), false, 'sem estrada saindo do mapa');
  const before = monthlyBudget(state, rt);
  // Estrada até a borda (x = 0).
  assert.ok(applyCommand(state, rt, { type: 'road', tiles: [at(0, 2)] }).ok);
  assert.equal(metroActive(state, rt), true);
  // Força desemprego e vagas abertas para ver os dois lados.
  const jobless = state.citizens.filter((c) => c.job !== null).slice(0, 20);
  for (const c of jobless) setJob(rt, c, null);
  computeDemand(state, rt);
  const out = commutersOut(state, rt);
  assert.ok(out > 0);
  assert.equal(rt.stats.outside, out);
  const inside = commutersIn(state, rt);
  assert.ok(inside.total > 0 && inside.ratio > 0 && inside.ratio <= 0.5);
  const after = monthlyBudget(state, rt);
  assert.ok(after.income.commercial + after.income.industrial > 0);
  assert.ok(after.income.residential > 0);
  assert.ok(before.income.total > 0);

  // Carros de quem vem e vai: aparecem de manhã.
  advance(state, rt, TICKS_PER_DAY - (state.time.tick % TICKS_PER_DAY) + 8 * 60);
  assert.ok(state.visitors.some((v) => v.commute), 'carros da região metropolitana');
  const { state: copy } = readSave(JSON.stringify(createSave(state, { id: 'metro' })));
  const rc = prepare(copy);
  advance(state, rt, 600);
  advance(copy, rc, 600);
  assert.deepEqual(copy.visitors, state.visitors);
});
