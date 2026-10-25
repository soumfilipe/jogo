import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILDINGS, TERRAIN, TOURISM, ZONE } from '../src/world/catalog.js';
import { createWorld } from '../src/world/world.js';
import { addBuilding } from '../src/world/runtime.js';
import { applyCommand, lineTiles, rectTiles } from '../src/world/commands.js';
import { advance, prepare } from '../src/systems/simulation.js';
import { completeTech } from '../src/systems/research.js';
import { attractionAppeal, todaysEvents } from '../src/systems/events.js';
import { parkTourists, planDay, todaysVisits, touristSpending } from '../src/systems/tourism.js';
import { closeMonth, monthlyBudget } from '../src/systems/economy.js';
import { computeLandValue } from '../src/systems/landvalue.js';
import { createSave, readSave, checksum } from '../src/save/format.js';
import { TICKS_PER_DAY } from '../src/core/time.js';
import { testCity } from './helpers.js';

const W = 60;
const DAY = TICKS_PER_DAY;

function town({ border = true } = {}) {
  const state = createWorld({ width: W, height: W, seed: 6 });
  state.map.terrain.fill(TERRAIN.GRASS);
  state.utilities.imported = { power: true, water: true };
  state.economy.money = 10_000_000;
  const rt = prepare(state);
  applyCommand(state, rt, { type: 'road', tiles: lineTiles(W, border ? 0 : 1, 5, W - 2, 5) });
  return { state, rt };
}

function staffed(state, rt, type, tile) {
  const b = addBuilding(state, rt, type, tile);
  rt.workers.get(b.id).add(-1 - b.id * 1000);
  return b;
}

/** Tick de uma data: dia (1 a 30), mês e ano, à meia-noite. */
const at = (day, month = 1, year = 1) => ((year - 1) * 360 + (month - 1) * 30 + (day - 1)) * DAY;

test('calendário de eventos: jogo no domingo, carnaval e megaevento só com a pesquisa', () => {
  const { state, rt } = town();
  assert.equal(todaysEvents(state, rt, at(7)).game, true, 'dia 7 é domingo');
  assert.equal(todaysEvents(state, rt, at(6)).weekend, true, 'dia 6 é sábado');
  assert.equal(todaysEvents(state, rt, at(3)).weekend, false);
  assert.equal(todaysEvents(state, rt, at(11, 2)).carnaval, false);
  completeTech(state, rt, 'carnaval');
  assert.equal(todaysEvents(state, rt, at(11, 2)).carnaval, true);
  assert.equal(todaysEvents(state, rt, at(20, 2)).carnaval, false);
  completeTech(state, rt, 'megaeventos');
  assert.equal(todaysEvents(state, rt, at(5, 7, 4)).mega, false, 'sem estádio e metrô');
  addBuilding(state, rt, 'estadio', 10 * W + 10);
  addBuilding(state, rt, 'estacao_metro', 20 * W + 10);
  assert.equal(todaysEvents(state, rt, at(5, 7, 4)).mega, true);
  assert.equal(todaysEvents(state, rt, at(5, 7, 5)).mega, false, 'só a cada 4 anos');
  assert.equal(attractionAppeal('estadio', { game: true }), BUILDINGS.estadio.utility.tourism.game);
});

test('turistas só chegam com estrada saindo do mapa (a torcida da cidade vem mesmo sem)', () => {
  const closed = town({ border: false });
  staffed(closed.state, closed.rt, 'museu', 3 * W + 10);
  assert.equal(todaysVisits(closed.state, closed.rt).visits[0].tourists, 0);
  const open = town();
  staffed(open.state, open.rt, 'museu', 3 * W + 10);
  assert.equal(todaysVisits(open.state, open.rt).visits[0].tourists, BUILDINGS.museu.utility.tourism.appeal);
});

test('turistas chegam, visitam, vão embora e gastam; hotel aumenta o gasto', () => {
  const { state, rt } = town();
  const museum = staffed(state, rt, 'museu', 3 * W + 10);
  state.time.tick = at(2);
  planDay(state, rt);
  const appeal = BUILDINGS.museu.utility.tourism.appeal;
  assert.equal(state.tourism.plan.length, appeal);
  assert.equal(state.economy.tourism, appeal * TOURISM.daySpend);
  assert.equal(monthlyBudget(state, rt).income.tourism, appeal * TOURISM.daySpend);

  advance(state, rt, 11 * 60); // até as 11h: alguns chegaram
  assert.ok(state.visitors.length > 0);
  advance(state, rt, 11 * 60); // 22h: todos foram embora
  assert.equal(state.visitors.length, 0);
  assert.ok(museum);

  completeTech(state, rt, 'turismo');
  staffed(state, rt, 'hotel', 3 * W + 20);
  assert.equal(touristSpending(state, rt, 10), 10 * (TOURISM.daySpend + TOURISM.hotelSpend));
  closeMonth(state, rt);
  assert.equal(state.economy.tourism, 0, 'o gasto do mês já entrou na receita');
});

test('dia de jogo: torcida da cidade sai de casa e chega junto para o jogo', () => {
  const { state, rt } = town({ border: false });
  for (let x = 20; x < 40; x++) {
    applyCommand(state, rt, { type: 'zone', zone: ZONE.RESIDENTIAL, tiles: [6 * W + x] });
    addBuilding(state, rt, 'casa', 6 * W + x);
  }
  staffed(state, rt, 'campo_futebol', 3 * W + 10);
  state.time.tick = at(7);
  planDay(state, rt);
  const plan = state.tourism.plan;
  assert.equal(plan.length, Math.round(BUILDINGS.campo_futebol.utility.tourism.game * TOURISM.localFans));
  assert.ok(plan.every((p) => p.fan && p.at >= TOURISM.gameArrive[0] && p.until === TOURISM.gameEnd));
});

test('parque de conservação: só com a pesquisa e em mata; protege, atrai e valoriza', () => {
  const { state, rt } = town();
  const area = rectTiles(W, 10, 20, 14, 24);
  for (const t of area) state.map.terrain[t] = TERRAIN.FOREST;
  assert.match(applyCommand(state, rt, { type: 'park', tiles: area }).reason, /conservação/);
  computeLandValue(state, rt);
  const before = rt.landValue[22 * W + 16];
  completeTech(state, rt, 'parque_nacional');
  assert.ok(applyCommand(state, rt, { type: 'park', tiles: area }).ok);
  assert.equal(state.map.park[22 * W + 12], 1);
  assert.equal(applyCommand(state, rt, { type: 'road', tiles: area }).ok, false, 'não passa rua');
  assert.ok(parkTourists(state, rt) > 0);
  computeLandValue(state, rt);
  assert.ok(rt.landValue[22 * W + 16] > before);
  // Demolir tira o parque, mas não a mata.
  applyCommand(state, rt, { type: 'bulldoze', tiles: [22 * W + 12] });
  assert.equal(state.map.park[22 * W + 12], 0);
  assert.equal(state.map.terrain[22 * W + 12], TERRAIN.FOREST);
});

test('revitalização: indústria abandonada vira centro cultural; transmissão dá receita aos estádios', () => {
  const { state, rt } = town();
  applyCommand(state, rt, { type: 'zone', zone: ZONE.INDUSTRIAL, tiles: [6 * W + 30] });
  const factory = addBuilding(state, rt, 'fabrica', 6 * W + 30);
  assert.match(applyCommand(state, rt, { type: 'revitalize', tile: factory.tile }).reason, /tecnologia/);
  completeTech(state, rt, 'revitalizacao');
  assert.match(applyCommand(state, rt, { type: 'revitalize', tile: factory.tile }).reason, /abandonada/);
  factory.abandoned = state.time.tick;
  assert.ok(applyCommand(state, rt, { type: 'revitalize', tile: factory.tile }).ok);
  assert.equal(rt.buildingById.get(rt.buildingAt[factory.tile]).type, 'centro_cultural');

  const stadium = addBuilding(state, rt, 'estadio', 10 * W + 40);
  for (let i = 0; i < BUILDINGS.estadio.jobs; i++) rt.workers.get(stadium.id).add(-100 - i);
  const without = monthlyBudget(state, rt).income.statal;
  completeTech(state, rt, 'transmissao_esportiva');
  assert.equal(monthlyBudget(state, rt).income.statal - without, BUILDINGS.estadio.utility.income);
});

test('save v13 ganha turistas, plano do dia e a camada dos parques', () => {
  const { state, rt } = testCity();
  advance(state, rt, DAY);
  const v13 = createSave(state, { id: 'v13' });
  delete v13.data.visitors;
  delete v13.data.tourism;
  delete v13.data.economy.tourism;
  delete v13.data.map.park;
  v13.version = 13;
  v13.checksum = checksum(v13.data);
  const { state: migrated } = readSave(JSON.stringify(v13));
  assert.deepEqual(migrated.visitors, []);
  assert.deepEqual(migrated.tourism, { plan: [] });
  assert.equal(migrated.map.park.length, 48 * 48);
  prepare(migrated);
});

test('domingo de jogo: salvar com a torcida na rua e carregar não muda nada', () => {
  const build = () => {
    const { state, rt } = testCity({ seed: 61 });
    completeTech(state, rt, 'futebol_profissional');
    completeTech(state, rt, 'museu');
    applyCommand(state, rt, { type: 'road', tiles: lineTiles(48, 0, 2, 1, 2) });
    for (const [b, x, y] of [['campo_futebol', 18, 8], ['museu', 26, 13]]) {
      applyCommand(state, rt, { type: 'bulldoze', tiles: rectTiles(48, x, y, x + 1, y + 1) });
      assert.ok(applyCommand(state, rt, { type: 'place', building: b, tile: y * 48 + x }).ok, b);
    }
    return { state, rt };
  };
  const a = build();
  // O jogo começa às 7h do dia 1 (segunda): até domingo (dia 7) às 15h30.
  advance(a.state, a.rt, 6 * DAY + 8 * 60 + 30);
  assert.ok(a.state.visitors.length > 0, 'torcida chegando');
  const { state: loaded } = readSave(JSON.stringify(createSave(a.state, { id: 'jogo' })));
  assert.deepEqual(loaded.visitors, a.state.visitors);
  const rtLoaded = prepare(loaded);
  advance(a.state, a.rt, DAY);
  advance(loaded, rtLoaded, DAY);
  assert.deepEqual(loaded.visitors, a.state.visitors);
  assert.deepEqual(loaded.citizens, a.state.citizens);
  assert.equal(loaded.economy.tourism, a.state.economy.tourism);
});
