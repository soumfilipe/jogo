import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng, random } from '../src/core/rng.js';
import { calendar, TICKS_PER_DAY } from '../src/core/time.js';
import { advance, prepare } from '../src/systems/simulation.js';
import { findRoadPath } from '../src/agents/pathfinding.js';
import { applyCommand, lineTiles, planCommand, rectTiles } from '../src/world/commands.js';
import { createWorld } from '../src/world/world.js';
import { TERRAIN, ZONE, COSTS } from '../src/world/catalog.js';
import { createSave, readSave, checksum, encodeState } from '../src/save/format.js';
import { testCity } from './helpers.js';
import * as SHIFT_HELPERS from '../src/agents/citizens.js';

const at = (state, hour, minute = 0) => {
  const day = Math.floor(state.time.tick / TICKS_PER_DAY);
  let target = day * TICKS_PER_DAY + hour * 60 + minute;
  if (target <= state.time.tick) target += TICKS_PER_DAY;
  return target - state.time.tick;
};

test('RNG com a mesma semente gera a mesma sequência', () => {
  const a = createRng(99);
  const b = createRng(99);
  const seqA = Array.from({ length: 5 }, () => random(a));
  assert.deepEqual(seqA, Array.from({ length: 5 }, () => random(b)));
  assert.notDeepEqual(seqA, Array.from({ length: 5 }, () => random(createRng(100))));
});

test('calendário a partir do tick', () => {
  assert.deepEqual(calendar(0), { minuteOfDay: 0, hour: 0, minute: 0, day: 1, month: 1, year: 1 });
  const c = calendar(TICKS_PER_DAY * 30 * 12 + TICKS_PER_DAY * 31 + 8 * 60 + 5);
  assert.deepEqual(c, { minuteOfDay: 485, hour: 8, minute: 5, day: 2, month: 2, year: 2 });
});

test('mundo 256x256 tem terreno variado e determinístico', () => {
  const a = createWorld({ seed: 7 });
  const b = createWorld({ seed: 7 });
  assert.equal(a.map.width, 256);
  assert.deepEqual(a.map.terrain, b.map.terrain);
  const kinds = new Set(a.map.terrain);
  assert.ok(kinds.has(TERRAIN.GRASS) && kinds.has(TERRAIN.WATER) && kinds.has(TERRAIN.FOREST));
});

test('pathfinding segue as estradas e falha sem ligação', () => {
  const state = createWorld({ width: 10, height: 10, seed: 1 });
  const W = 10;
  for (const t of [...lineTiles(W, 0, 0, 9, 0), ...lineTiles(W, 9, 0, 9, 9)]) state.map.road[t] = 1;
  const path = findRoadPath(state.map, 0, 99);
  assert.equal(path.length, 19);
  assert.equal(path[0], 0);
  assert.equal(path.at(-1), 99);
  for (let i = 1; i < path.length; i++) {
    const d = Math.abs(path[i] - path[i - 1]);
    assert.ok(d === 1 || d === W, 'passos entre vizinhos');
  }
  state.map.road[5] = 0;
  assert.equal(findRoadPath(state.map, 0, 99), null);
});

test('comandos validam terreno, custo e dinheiro', () => {
  const state = createWorld({ width: 16, height: 16, seed: 3 });
  state.map.terrain.fill(TERRAIN.GRASS);
  state.map.terrain[2] = TERRAIN.WATER;
  state.map.terrain[3] = TERRAIN.FOREST;
  const rt = prepare(state);
  const tiles = lineTiles(16, 0, 0, 5, 0);

  const plan = planCommand(state, rt, { type: 'road', tiles });
  assert.equal(plan.tiles.length, 5, 'não constrói na água');
  assert.equal(plan.cost, 5 * COSTS.road + COSTS.clearForest);

  const before = state.economy.money;
  assert.ok(applyCommand(state, rt, { type: 'road', tiles }).ok);
  assert.equal(state.economy.money, before - plan.cost);
  assert.equal(state.map.terrain[3], TERRAIN.GRASS, 'estrada derruba a floresta');

  const zone = applyCommand(state, rt, { type: 'zone', zone: ZONE.RESIDENTIAL, tiles: rectTiles(16, 0, 0, 2, 1) });
  assert.equal(zone.count, 3, 'só zoneia fora da estrada');

  state.economy.money = 0;
  const broke = applyCommand(state, rt, { type: 'road', tiles: lineTiles(16, 0, 5, 9, 5) });
  assert.equal(broke.ok, false);
  assert.match(broke.reason, /insuficiente/);
});

test('cidade cresce e cidadãos fazem a rotina casa -> trabalho -> casa', () => {
  const { state, rt } = testCity();
  advance(state, rt, TICKS_PER_DAY * 4);

  assert.ok(state.buildings.length > 50, `prédios: ${state.buildings.length}`);
  assert.ok(state.citizens.length > 100, `população: ${state.citizens.length}`);
  const employed = state.citizens.filter((c) => c.job !== null);
  assert.ok(employed.length > state.citizens.length * 0.5, 'maioria empregada');

  advance(state, rt, at(state, 11));
  const dayShift = employed.filter((c) => c.shift === 'diurno');
  const atWork = dayShift.filter((c) => c.state === 'trabalho').length;
  assert.ok(atWork > dayShift.length * 0.9, `às 11h, turno diurno no trabalho: ${atWork}/${dayShift.length}`);

  advance(state, rt, at(state, 23, 59));
  const notNight = state.citizens.filter((c) => c.shift !== 'noturno');
  assert.ok(notNight.every((c) => c.state === 'casa'), 'fora do turno da noite, todos em casa à meia-noite');
});

test('turnos: poucos à noite e de madrugada, alguns de meio período, e a cidade se move em todos os horários', () => {
  const { pickShift } = SHIFT_HELPERS;
  // Serviços públicos: distribuição exata das frações do catálogo. Nas
  // empresas, as frações do setor (ver SECTORS); na cidade, a mistura delas.
  const counts = {};
  for (let i = 0; i < 1000; i++) counts[pickShift((i + 0.5) / 1000)] = (counts[pickShift((i + 0.5) / 1000)] || 0) + 1;
  assert.deepEqual(counts, { diurno: 800, noturno: 70, madrugada: 30, manha: 50, tarde: 50 });

  const { state, rt } = testCity({ size: 48, seed: 21 });
  advance(state, rt, TICKS_PER_DAY * 4);
  const employed = state.citizens.filter((c) => c.job !== null);
  const share = (s) => employed.filter((c) => c.shift === s).length / employed.length;
  assert.ok(share('noturno') > 0.03 && share('noturno') < 0.12, `noturno: ${share('noturno')}`);
  assert.ok(share('manha') + share('tarde') > 0.05 && share('manha') + share('tarde') < 0.16, 'meio período');

  // Madrugada: o turno da noite está trabalhando.
  advance(state, rt, at(state, 3));
  const night = employed.filter((c) => c.shift === 'noturno');
  assert.ok(night.filter((c) => c.state === 'trabalho').length > night.length * 0.9, 'turno da noite no trabalho às 3h');

  // Madrugada: jornada de 8 a 9 horas a partir da saída de cada um.
  for (const c of employed.filter((x) => x.shift === 'madrugada')) {
    assert.ok(c.departWork <= 4.5 * 60, 'sai até 4h30');
    const hours = (c.departHome - c.departWork + 1440) % 1440;
    assert.ok(hours >= 8 * 60 && hours <= 9 * 60, `jornada de ${hours} min`);
  }

  // Há gente na rua de manhã, na hora do almoço, à tarde, à noite e de madrugada.
  for (const [hour, minute] of [[7, 30], [12, 45], [17, 30], [22, 0], [1, 30], [3, 45], [6, 45]]) {
    advance(state, rt, at(state, hour, minute));
    assert.ok(rt.movers.size > 0, `ninguém na rua às ${hour}h${minute}`);
  }
});

test('demolir prédio e estrada atualiza moradores, empregos e viagens', () => {
  const { state, rt } = testCity();
  advance(state, rt, TICKS_PER_DAY * 3 + at(state, 7, 45));
  assert.ok(rt.movers.size > 0, 'há gente andando');

  const house = state.buildings.find((b) => b.type === 'casa' && rt.residents.get(b.id).size > 0);
  const residents = [...rt.residents.get(house.id)];
  applyCommand(state, rt, { type: 'bulldoze', tiles: [house.tile] });
  for (const id of residents) assert.equal(rt.citizenById.has(id), false, 'moradores vão embora');

  const workplace = state.buildings.find((b) => rt.workers.get(b.id).size > 0);
  const workers = [...rt.workers.get(workplace.id)].map((id) => rt.citizenById.get(id));
  applyCommand(state, rt, { type: 'bulldoze', tiles: [workplace.tile] });
  for (const c of workers) assert.equal(c.job, null, 'funcionários perdem o emprego');

  // Remove todas as estradas: ninguém pode continuar andando nem empregado.
  const roads = [];
  state.map.road.forEach((r, t) => r && roads.push(t));
  applyCommand(state, rt, { type: 'bulldoze', tiles: roads });
  assert.equal(rt.movers.size, 0);
  assert.ok(state.citizens.every((c) => c.job === null && c.state === 'casa'));
  advance(state, rt, TICKS_PER_DAY);
});

test('mesma semente e mesmas ações = mesma cidade (determinismo)', () => {
  const a = testCity({ seed: 55 });
  const b = testCity({ seed: 55 });
  advance(a.state, a.rt, TICKS_PER_DAY * 2 + 333);
  advance(b.state, b.rt, TICKS_PER_DAY * 2 + 333);
  assert.equal(checksum(encodeState(a.state)), checksum(encodeState(b.state)));
});

test('salvar no meio do trânsito e carregar continua exatamente igual', () => {
  const original = testCity({ seed: 77 });
  advance(original.state, original.rt, TICKS_PER_DAY * 3 + at(original.state, 7, 50));
  assert.ok(original.rt.movers.size > 0, 'salva com gente andando');
  assert.ok(original.state.pathQueue.length >= 0);

  const text = JSON.stringify(createSave(original.state, { id: 'transito' }));
  const { state: loadedState } = readSave(text);
  const loaded = { state: loadedState, rt: prepare(loadedState) };
  assert.equal(loaded.rt.movers.size, original.rt.movers.size);

  advance(original.state, original.rt, TICKS_PER_DAY + 500);
  advance(loaded.state, loaded.rt, TICKS_PER_DAY + 500);
  assert.equal(checksum(encodeState(loaded.state)), checksum(encodeState(original.state)));
});
