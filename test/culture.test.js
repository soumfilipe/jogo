import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILDINGS, CULTURE, ROAD_TYPES, TERRAIN } from '../src/world/catalog.js';
import { createWorld } from '../src/world/world.js';
import { addBuilding } from '../src/world/runtime.js';
import { applyCommand, lineTiles, roadCost } from '../src/world/commands.js';
import { advance, prepare } from '../src/systems/simulation.js';
import { completeTech } from '../src/systems/research.js';
import { createRng } from '../src/core/rng.js';
import { TICKS_PER_DAY, TICKS_PER_MONTH } from '../src/core/time.js';
import {
  activeGenres, closeCultureMonth, createCulture, nowShowing, ranking, showingAppeal, workCurve,
} from '../src/systems/culture.js';
import { attractionAppeal } from '../src/systems/events.js';
import { countOccupancy } from '../src/systems/traffic.js';
import { computeLandValue } from '../src/systems/landvalue.js';
import { isUnlocked } from '../src/systems/mods.js';
import { findRoadPath } from '../src/agents/pathfinding.js';
import { createSave, readSave, checksum } from '../src/save/format.js';
import { encodeTable, decodeTable } from '../src/save/table.js';
import { testCity } from './helpers.js';

const W = 60;

function town() {
  const state = createWorld({ width: W, height: W, seed: 8 });
  state.map.terrain.fill(TERRAIN.GRASS);
  state.utilities.imported = { power: true, water: true };
  state.economy.money = 10_000_000;
  const rt = prepare(state);
  applyCommand(state, rt, { type: 'road', tiles: lineTiles(W, 0, 5, W - 1, 5) });
  return { state, rt };
}

test('cena inicial: mesma semente, mesmos artistas; gêneros dependem do ano do mundo', () => {
  const a = createCulture(createRng(1), 1910);
  const b = createCulture(createRng(1), 1910);
  assert.deepEqual(a, b);
  assert.ok(a.artists.length > 20);
  assert.ok(!('rock' in a.genres), 'sem rock em 1910');
  assert.ok(a.artists.every((x) => CULTURE.genres[x.genre].from <= 1910));
  assert.ok(activeGenres(1995).includes('funk'));
  assert.ok(!activeGenres(1995).includes('choro'), 'o choro não tem mais novatos');
  const late = createCulture(createRng(1), 2000);
  assert.ok('funk' in late.genres && 'rock' in late.genres);
  // Nomes inventados: bandas no plural, companhias de teatro.
  assert.ok(a.artists.some((x) => x.kind === 'teatro' && x.name.startsWith('Cia. ')));
});

test('carreira: a fama anda todo mês, veteranos caem, novatos chegam em janeiro', () => {
  const { state, rt } = town();
  const before = new Map(state.culture.artists.map((x) => [x.id, x.fame]));
  state.time.tick = 5 * TICKS_PER_MONTH; // junho: sem novatos
  const count = state.culture.artists.length;
  closeCultureMonth(state, rt);
  assert.ok(state.culture.artists.some((x) => before.has(x.id) && x.fame !== before.get(x.id)));
  assert.ok(state.culture.artists.length <= count);

  // Janeiro: novatos com pouca fama, estreando no ano do mundo.
  state.time.tick = 12 * TICKS_PER_MONTH;
  const ids = new Set(state.culture.artists.map((x) => x.id));
  closeCultureMonth(state, rt);
  const rookies = state.culture.artists.filter((x) => !ids.has(x.id));
  assert.ok(rookies.length >= CULTURE.newBase);
  assert.ok(rookies.every((x) => x.fame < 0.2 && x.debut === Math.floor(state.research.world)));

  // Veterano esquecido acaba se aposentando.
  const old = state.culture.artists[0];
  Object.assign(old, { fame: 0, trend: -1, debut: state.research.world - 60 });
  for (let i = 0; i < CULTURE.retireMonths + 1; i++) closeCultureMonth(state, rt);
  assert.ok(!state.culture.artists.includes(old));
  assert.ok(ranking(state.culture).length <= CULTURE.maxArtists);
});

test('filmes e peças: temporada com auge; cinema e teatro atraem pelo que está em cartaz', () => {
  const work = { id: 1, kind: 'filme', title: 'X', genre: 'drama', quality: 0.8, premiere: 10 * TICKS_PER_DAY, peak: 20, run: 60 };
  assert.equal(workCurve(work, 0), 0, 'antes da estreia');
  assert.ok(Math.abs(workCurve(work, 30 * TICKS_PER_DAY) - 0.8) < 1e-9, 'auge');
  assert.ok(workCurve(work, 50 * TICKS_PER_DAY) < 0.8);
  assert.equal(workCurve(work, 80 * TICKS_PER_DAY), 0, 'saiu de cartaz');

  const { state } = town();
  const tick = state.time.tick;
  assert.ok(nowShowing(state.culture, 'filme', tick).length > 0);
  const appeal = showingAppeal(state.culture, 'filme', tick);
  assert.ok(appeal > 0);
  assert.equal(attractionAppeal('cinema', {}, state.culture, tick), appeal);
  assert.equal(attractionAppeal('teatro', {}, state.culture, tick), showingAppeal(state.culture, 'peca', tick));
});

test('locais: teatro desde o começo; arena de eventos vem com o ginásio', () => {
  const { state, rt } = town();
  assert.equal(isUnlocked(rt, 'teatro'), true);
  assert.equal(isUnlocked(rt, 'arena_eventos'), false);
  completeTech(state, rt, 'ginasio');
  assert.equal(isUnlocked(rt, 'arena_eventos'), true);
  assert.ok(BUILDINGS.arena_eventos.utility.tourism);
});

test('calçadão: com a pesquisa; pedestres não engarrafam e o comércio em volta valoriza', () => {
  const { state, rt } = town();
  const street = lineTiles(W, 10, 5, 20, 5);
  assert.match(applyCommand(state, rt, { type: 'road', road: 4, tiles: street }).reason, /Calçadão/);
  computeLandValue(state, rt);
  const before = rt.landValue[7 * W + 15];
  completeTech(state, rt, 'ciclovia_lazer');
  const money = state.economy.money;
  assert.ok(applyCommand(state, rt, { type: 'road', road: 4, tiles: street }).ok);
  assert.equal(state.map.road[5 * W + 15], 4);
  assert.equal(money - state.economy.money, 11 * Math.max(roadCost(rt, 1), roadCost(rt, 4) - roadCost(rt, 1)));
  computeLandValue(state, rt);
  assert.ok(rt.landValue[7 * W + 15] > before, 'comércio em volta valoriza');

  // Quem está no calçadão não ocupa a rua.
  rt.movers.add(-9);
  rt.citizenById.set(-9, { id: -9, x: 15.5, y: 5.5, mode: null });
  countOccupancy(state, rt);
  assert.equal(rt.occupancy[5 * W + 15], 0);
  rt.movers.delete(-9);
  rt.citizenById.delete(-9);

  // E dá para voltar a ser rua.
  assert.ok(applyCommand(state, rt, { type: 'road', road: 1, tiles: [5 * W + 15] }).ok);
  assert.equal(state.map.road[5 * W + 15], 1);
  assert.equal(ROAD_TYPES[4].pedestrian, true);
});

test('rotas evitam o calçadão quando há rua de carro ao lado', () => {
  const { state, rt } = town();
  completeTech(state, rt, 'ciclovia_lazer');
  // Atalho reto pelo calçadão (y=5) ou volta por uma rua paralela (y=8).
  applyCommand(state, rt, { type: 'road', road: 4, tiles: lineTiles(W, 10, 5, 30, 5) });
  applyCommand(state, rt, { type: 'road', tiles: lineTiles(W, 9, 5, 9, 8) });
  applyCommand(state, rt, { type: 'road', tiles: lineTiles(W, 9, 8, 31, 8) });
  applyCommand(state, rt, { type: 'road', tiles: lineTiles(W, 31, 8, 31, 5) });
  const path = findRoadPath(state.map, 5 * W + 5, 5 * W + 35);
  assert.ok(path.includes(8 * W + 20), 'dá a volta pela rua');
});

test('save v14 ganha a cena cultural e a arena de eSports vira arena de eventos', () => {
  const { state, rt } = testCity();
  advance(state, rt, TICKS_PER_DAY);
  const v14 = createSave(state, { id: 'v14' });
  delete v14.data.culture;
  const buildings = decodeTable(v14.data.buildings);
  buildings[0].type = 'arena_esports';
  v14.data.buildings = encodeTable(buildings);
  v14.version = 14;
  v14.checksum = checksum(v14.data);
  const { state: migrated } = readSave(JSON.stringify(v14));
  assert.ok(migrated.culture.artists.length > 0);
  assert.equal(migrated.buildings[0].type, 'arena_eventos');
});

test('a cena evolui igual depois de salvar e carregar', () => {
  const { state: a, rt: ra } = testCity({ seed: 21 });
  advance(a, ra, TICKS_PER_MONTH + 300);
  const { state: b } = readSave(JSON.stringify(createSave(a, { id: 'cena' })));
  const rb = prepare(b);
  advance(a, ra, TICKS_PER_MONTH * 2);
  advance(b, rb, TICKS_PER_MONTH * 2);
  assert.deepEqual(b.culture, a.culture);
});
