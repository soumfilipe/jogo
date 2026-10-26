import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROAD_TYPES, TERRAIN, TRAFFIC, ZONE } from '../src/world/catalog.js';
import { createWorld } from '../src/world/world.js';
import { addBuilding } from '../src/world/runtime.js';
import { applyCommand, lineTiles, roadCost } from '../src/world/commands.js';
import { advance, prepare } from '../src/systems/simulation.js';
import { completeTech } from '../src/systems/research.js';
import { findRoadPath } from '../src/agents/pathfinding.js';
import { congestionFactor, countOccupancy, roadCapacity } from '../src/systems/traffic.js';
import { chooseMode, computeTransit, payFare } from '../src/systems/transit.js';
import { EXPORT, computeFreight, freightFactor } from '../src/systems/logistics.js';
import { computeLandValue } from '../src/systems/landvalue.js';
import { monthlyBudget } from '../src/systems/economy.js';
import { mod } from '../src/systems/mods.js';
import { createSave, readSave, checksum } from '../src/save/format.js';
import { TICKS_PER_DAY } from '../src/core/time.js';
import { testCity } from './helpers.js';

const W = 60;

function town() {
  const state = createWorld({ width: W, height: W, seed: 5 });
  state.map.terrain.fill(TERRAIN.GRASS);
  state.map.elevation.fill(0);
  state.utilities.imported = { power: true, water: true };
  state.economy.money = 10_000_000;
  const rt = prepare(state);
  applyCommand(state, rt, { type: 'road', tiles: lineTiles(W, 0, 5, W - 1, 5) });
  return { state, rt };
}

test('avenida e via expressa: só com a pesquisa; sobre uma rua, paga só a diferença', () => {
  const { state, rt } = town();
  const line = lineTiles(W, 0, 20, 9, 20);
  assert.match(applyCommand(state, rt, { type: 'road', road: 2, tiles: line }).reason, /Via expressa|Avenida/);
  completeTech(state, rt, 'via_expressa');

  const before = state.economy.money;
  assert.ok(applyCommand(state, rt, { type: 'road', road: 2, tiles: line }).ok);
  assert.equal(before - state.economy.money, 10 * roadCost(rt, 2));
  assert.equal(state.map.road[20 * W + 3], 2);

  // Melhorar a rua da linha 5: só a diferença; desenhar de novo não cobra nada.
  const upgrade = lineTiles(W, 0, 5, 9, 5);
  const mid = state.economy.money;
  assert.ok(applyCommand(state, rt, { type: 'road', road: 3, tiles: upgrade }).ok);
  assert.equal(mid - state.economy.money, 10 * (roadCost(rt, 3) - roadCost(rt, 1)));
  assert.equal(state.map.road[5 * W + 4], 3);
  assert.equal(applyCommand(state, rt, { type: 'road', road: 2, tiles: upgrade }).ok, false, 'não piora a via');
});

test('pathfinding: prefere a via expressa mais longa à rua curta', () => {
  const { state, rt } = town();
  completeTech(state, rt, 'via_expressa');
  // De (0,5) a (20,5): reto pela rua (20 tiles) ou um desvio de 26 tiles por via expressa.
  applyCommand(state, rt, { type: 'road', road: 3, tiles: lineTiles(W, 0, 5, 0, 8) });
  applyCommand(state, rt, { type: 'road', road: 3, tiles: lineTiles(W, 0, 8, 20, 8) });
  applyCommand(state, rt, { type: 'road', road: 3, tiles: lineTiles(W, 20, 8, 20, 5) });
  const path = findRoadPath(state.map, 5 * W, 5 * W + 20);
  assert.ok(path.includes(8 * W + 10), 'passa pela expressa');
});

test('engarrafamento: acima da capacidade anda devagar; avenida e semáforo aguentam mais', () => {
  const { state, rt } = town();
  const tile = 5 * W + 10;
  countOccupancy(state, rt);
  rt.occupancy[tile] = 3;
  assert.equal(congestionFactor(rt, tile, 1), 1, 'na capacidade, ainda livre');
  rt.occupancy[tile] = 9;
  const jam = congestionFactor(rt, tile, 1);
  assert.ok(jam < 0.4, `fator ${jam}`);
  assert.ok(congestionFactor(rt, tile, 2) > jam);
  completeTech(state, rt, 'semaforo');
  assert.ok(Math.abs(roadCapacity(rt, 1) - ROAD_TYPES[1].capacity * 1.3) < 1e-9);
  assert.ok(congestionFactor(rt, tile, 1) > jam);
});

test('transporte público: quem mora e trabalha no raio vai de ônibus (ou do modo mais rápido) e paga passagem', () => {
  const { state, rt } = town();
  const home = { tile: 6 * W + 10 };
  const work = { tile: 6 * W + 14 };
  const far = { tile: 6 * W + 50 };
  assert.match(applyCommand(state, rt, { type: 'place', building: 'ponto_onibus', tile: 4 * W + 12 }).reason, /Ônibus|ônibus/);
  completeTech(state, rt, 'onibus_diesel');
  completeTech(state, rt, 'metro');
  assert.ok(applyCommand(state, rt, { type: 'place', building: 'ponto_onibus', tile: 4 * W + 12 }).ok);
  assert.equal(chooseMode(rt, home, work), 'onibus');
  assert.equal(chooseMode(rt, home, far), null, 'fora do raio vai de carro');
  assert.ok(applyCommand(state, rt, { type: 'place', building: 'estacao_metro', tile: 4 * W + 11 }).ok);
  assert.equal(chooseMode(rt, home, work), 'metro');

  payFare(state, 'metro');
  payFare(state, 'onibus');
  assert.equal(monthlyBudget(state, rt).income.fares, Math.round(TRAFFIC.modes.metro.fare + TRAFFIC.modes.onibus.fare));

  // Demolir a estação tira a cobertura.
  applyCommand(state, rt, { type: 'bulldoze', tiles: [4 * W + 11] });
  computeTransit(state, rt);
  assert.equal(chooseMode(rt, home, work), 'onibus');
});

test('carga: indústria sem terminal ao alcance arrecada menos; o caminhão alcança longe', () => {
  const { state, rt } = town();
  applyCommand(state, rt, { type: 'zone', zone: ZONE.INDUSTRIAL, tiles: [6 * W + 50] });
  const factory = addBuilding(state, rt, 'fabrica', 6 * W + 50);
  computeFreight(state, rt);
  assert.equal(freightFactor(rt, factory), EXPORT.isolated);

  assert.ok(applyCommand(state, rt, { type: 'place', building: 'patio_ferroviario', tile: 3 * W + 2 }).ok);
  assert.equal(freightFactor(rt, factory), EXPORT.isolated, 'a 48 tiles: fora do alcance');
  completeTech(state, rt, 'caminhao');
  computeFreight(state, rt);
  assert.equal(freightFactor(rt, factory), 1);
  assert.equal(mod(rt, 'freightRange'), 10);
});

test('trânsito e ruído: via expressa desvaloriza o terreno em volta', () => {
  const plain = town();
  const loud = town();
  completeTech(loud.state, loud.rt, 'via_expressa');
  applyCommand(loud.state, loud.rt, { type: 'road', road: 3, tiles: lineTiles(W, 0, 5, W - 1, 5) });
  computeLandValue(plain.state, plain.rt);
  computeLandValue(loud.state, loud.rt);
  const t = 7 * W + 30;
  assert.ok(loud.rt.landValue[t] < plain.rt.landValue[t] - 0.05, `${loud.rt.landValue[t]} < ${plain.rt.landValue[t]}`);
  completeTech(loud.state, loud.rt, 'controle_ruido');
  const quiet = loud.rt.landValue[t];
  computeLandValue(loud.state, loud.rt);
  assert.ok(loud.rt.landValue[t] > quiet);
});

test('save v11 ganha as passagens do mês', () => {
  const { state, rt } = testCity();
  advance(state, rt, TICKS_PER_DAY);
  const v11 = createSave(state, { id: 'v11' });
  delete v11.data.economy.fares;
  v11.version = 11;
  v11.checksum = checksum(v11.data);
  const { state: migrated } = readSave(JSON.stringify(v11));
  assert.equal(migrated.economy.fares, 0);
  prepare(migrated);
});

test('cidade com trânsito, ônibus, avenidas e carga: salvar no meio do dia não muda nada', () => {
  const build = () => {
    const { state, rt } = testCity({ seed: 77 });
    for (const id of ['via_expressa', 'onibus_diesel', 'brt', 'semaforo']) completeTech(state, rt, id);
    applyCommand(state, rt, { type: 'road', road: 2, tiles: lineTiles(48, 1, 12, 46, 12) });
    for (const [b, x, y] of [['ponto_onibus', 10, 6], ['estacao_brt', 30, 16], ['patio_ferroviario', 38, 18]]) {
      assert.ok(applyCommand(state, rt, { type: 'place', building: b, tile: y * 48 + x }).ok, b);
    }
    return { state, rt };
  };
  const a = build();
  advance(a.state, a.rt, TICKS_PER_DAY * 10 + 600);
  assert.ok(a.state.citizens.length > 50);
  const { state: loaded } = readSave(JSON.stringify(createSave(a.state, { id: 'meio-do-dia' })));
  const rtLoaded = prepare(loaded);
  advance(a.state, a.rt, TICKS_PER_DAY * 5);
  advance(loaded, rtLoaded, TICKS_PER_DAY * 5);
  assert.deepEqual(loaded.citizens, a.state.citizens);
  assert.equal(loaded.economy.fares, a.state.economy.fares);
  assert.deepEqual(loaded.economy.history, a.state.economy.history);
});
