import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILDINGS, TERRAIN, ZONE } from '../src/world/catalog.js';
import { applyCommand, lineTiles, rectTiles } from '../src/world/commands.js';
import { advance, prepare } from '../src/systems/simulation.js';
import { computeUtilities, roadDistances } from '../src/systems/utilities.js';
import { createWorld } from '../src/world/world.js';
import { createSave, readSave, checksum, encodeState } from '../src/save/format.js';
import { TICKS_PER_DAY } from '../src/core/time.js';
import { testCity } from './helpers.js';

const W = 48;
const at = (x, y) => y * W + x;

/** Cidade de teste sem energia/água importada, com usinas colocadas. */
function poweredCity({ wells = 6, coal = true } = {}) {
  const { state, rt } = testCity({ utilities: false });
  if (coal) assert.ok(applyCommand(state, rt, { type: 'place', building: 'usina_carvao', tile: at(2, 3) }).ok);
  for (let k = 0; k < wells; k++) {
    const r = applyCommand(state, rt, { type: 'place', building: 'poco', tile: at(10 + k * 2, 3) });
    assert.ok(r.ok, r.reason);
  }
  return { state, rt };
}

test('sem usinas e poços, a cidade não cresce', () => {
  const { state, rt } = testCity({ utilities: false });
  advance(state, rt, TICKS_PER_DAY * 2);
  assert.equal(state.buildings.length, 0);
  assert.equal(state.citizens.length, 0);
});

test('com energia e água a cidade cresce, e o consumo cabe na produção', () => {
  const { state, rt } = poweredCity();
  advance(state, rt, TICKS_PER_DAY * 4);
  const homes = state.buildings.filter((b) => !BUILDINGS[b.type].utility);
  assert.ok(homes.length > 30, `prédios: ${homes.length}`);
  assert.ok(state.citizens.length > 50);
  for (const res of ['power', 'water']) {
    const t = rt.utilityTotals[res];
    assert.ok(t.used <= t.supply, `${res}: ${t.used}/${t.supply}`);
  }
  // Quem trabalha numa usina também é cidadão da cidade.
  const plant = state.buildings.find((b) => b.type === 'usina_carvao');
  assert.ok(rt.workers.get(plant.id).size > 0, 'usina contrata');
});

test('regras para colocar serviços públicos', () => {
  const state = createWorld({ width: 20, height: 20, seed: 4 });
  state.map.terrain.fill(TERRAIN.GRASS);
  const rt = prepare(state);
  const w = 20;
  applyCommand(state, rt, { type: 'road', tiles: lineTiles(w, 0, 5, 19, 5) });
  for (let x = 0; x < 20; x++) state.map.terrain[12 * w + x] = TERRAIN.WATER;

  const place = (building, x, y) => applyCommand(state, rt, { type: 'place', building, tile: y * w + x });
  assert.match(place('poco', 3, 8).reason, /encostar numa rua/);
  assert.match(place('poco', 3, 5).reason, /livre/);
  assert.match(place('bomba_agua', 3, 6).reason, /beira de um rio ou lago/);
  assert.match(place('poco', 3, 12).reason, /na água/);

  // Bomba na beira d'água e encostada numa rua.
  applyCommand(state, rt, { type: 'road', tiles: lineTiles(w, 8, 6, 8, 11) });
  assert.ok(place('bomba_agua', 9, 11).ok);
  // Usina 2x2 ocupa os 4 tiles e tira a zona deles.
  applyCommand(state, rt, { type: 'zone', zone: ZONE.RESIDENTIAL, tiles: rectTiles(w, 12, 6, 13, 7) });
  const before = state.economy.money;
  assert.ok(place('usina_solar', 12, 6).ok);
  assert.equal(state.economy.money, before - BUILDINGS.usina_solar.utility.cost);
  for (const t of [6 * w + 12, 6 * w + 13, 7 * w + 12, 7 * w + 13]) {
    assert.ok(rt.buildingAt[t]);
    assert.equal(state.map.zone[t], ZONE.NONE);
  }
  state.economy.money = 0;
  assert.match(place('poco', 16, 6).reason, /insuficiente/);
});

test('quando falta, ficam sem os prédios mais longe das fontes', () => {
  const { state, rt } = poweredCity({ wells: 6 });
  advance(state, rt, TICKS_PER_DAY * 4);
  // Corta a água para um único poço: não dá para todos.
  const wells = state.buildings.filter((b) => b.type === 'poco');
  applyCommand(state, rt, { type: 'bulldoze', tiles: wells.slice(1).map((b) => b.tile) });
  computeUtilities(state, rt);

  const dist = roadDistances(state, [rt.access.get(wells[0].id)]);
  const consumers = state.buildings.filter((b) => !BUILDINGS[b.type].utility && b.abandoned === undefined);
  const served = consumers.filter((b) => rt.service.get(b.id).water);
  const dry = consumers.filter((b) => !rt.service.get(b.id).water);
  assert.ok(served.length > 0 && dry.length > 0, `${served.length} com água, ${dry.length} sem`);
  // Do mais perto para o mais longe; um prédio menor mais adiante ainda pode
  // caber na sobra, então a comparação é pela média.
  const avg = (list) => list.reduce((s, b) => s + dist[rt.access.get(b.id)], 0) / list.length;
  assert.ok(avg(served) < avg(dry), `distância média: com água ${avg(served)}, sem água ${avg(dry)}`);
  const t = rt.utilityTotals.water;
  assert.ok(t.used <= t.supply);
});

test('sem energia: moradores vão embora, prédio é abandonado e depois desaba', () => {
  const { state, rt } = poweredCity();
  advance(state, rt, TICKS_PER_DAY * 3);
  const plant = state.buildings.find((b) => b.type === 'usina_carvao');
  const homes = state.buildings.filter((b) => BUILDINGS[b.type].residents > 0);
  const pop = state.citizens.length;
  assert.ok(homes.length > 0 && pop > 0);
  applyCommand(state, rt, { type: 'bulldoze', tiles: [plant.tile] });

  advance(state, rt, TICKS_PER_DAY * 2);
  assert.ok(state.citizens.length < pop, 'gente indo embora');
  advance(state, rt, TICKS_PER_DAY * 6);
  const abandoned = state.buildings.filter((b) => b.abandoned !== undefined);
  assert.ok(abandoned.length > 0, 'prédios abandonados');
  for (const b of abandoned) {
    assert.equal(rt.residents.get(b.id).size + rt.workers.get(b.id).size, 0, 'abandonado fica vazio');
  }
  const zoneTile = abandoned[0].tile;
  advance(state, rt, TICKS_PER_DAY * 16);
  assert.ok(!state.buildings.some((b) => b.abandoned !== undefined && b.id === abandoned[0].id), 'desabou');
  assert.notEqual(state.map.zone[zoneTile], ZONE.NONE, 'a zona continua');
});

test('save antigo importa energia e água até ter usina própria', () => {
  const { state } = testCity({ utilities: false });
  const v2 = createSave(state, { id: 'antigo' });
  delete v2.data.utilities;
  v2.version = 2;
  v2.checksum = checksum(v2.data);
  const { state: migrated } = readSave(JSON.stringify(v2));
  assert.deepEqual(migrated.utilities.imported, { power: true, water: true });

  const rt = prepare(migrated);
  advance(migrated, rt, TICKS_PER_DAY * 2);
  assert.ok(migrated.buildings.length > 0, 'cresce com o importado');
  // Lote fora das zonas, ao lado do fim de uma rua.
  const placed = applyCommand(migrated, rt, { type: 'place', building: 'poco', tile: at(47, 2) });
  assert.ok(placed.ok, placed.reason);
  assert.deepEqual(migrated.utilities.imported, { power: true, water: false }, 'o primeiro poço encerra só a água importada');
});

test('salvar e carregar com serviços públicos continua igual', () => {
  const original = poweredCity({ wells: 2 });
  advance(original.state, original.rt, TICKS_PER_DAY * 3 + 300);
  const { state } = readSave(JSON.stringify(createSave(original.state, { id: 'u' })));
  const loaded = { state, rt: prepare(state) };
  advance(original.state, original.rt, TICKS_PER_DAY * 2);
  advance(loaded.state, loaded.rt, TICKS_PER_DAY * 2);
  assert.equal(checksum(encodeState(loaded.state)), checksum(encodeState(original.state)));
});
