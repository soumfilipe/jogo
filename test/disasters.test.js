import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILDINGS, DISASTERS, TERRAIN } from '../src/world/catalog.js';
import { applyCommand } from '../src/world/commands.js';
import { vacancies } from '../src/world/runtime.js';
import { advance, prepare } from '../src/systems/simulation.js';
import { completeTech } from '../src/systems/research.js';
import { monthlyBudget } from '../src/systems/economy.js';
import { updateClosures } from '../src/systems/races.js';
import { mod } from '../src/systems/mods.js';
import {
  dailyDisasters, floodThreshold, floodZone, spreadFires,
} from '../src/systems/disasters.js';
import { slopeOf } from '../src/world/relief.js';
import { TICKS_PER_DAY } from '../src/core/time.js';
import { createSave, readSave, checksum } from '../src/save/format.js';
import { testCity } from './helpers.js';

const S = 48;
const T = (x, y) => y * S + x;

/** Cidade de teste com um rio na borda direita (x >= 44) e alguns dias de vida. */
function riverCity(seed = 2) {
  const { state, rt } = testCity({ seed });
  for (let y = 0; y < S; y++) for (let x = 44; x < S; x++) state.map.terrain[T(x, y)] = TERRAIN.WATER;
  advance(state, rt, TICKS_PER_DAY * 12);
  return { state, rt };
}

/** Chuva de 30 dias acima do limite do clima (e o dia de hoje sem chuva). */
function soak(state) {
  state.weather.rain = new Array(30).fill(floodThreshold(state) / 20);
  state.weather.today = { ...state.weather.today, mm: 0, kind: 'nublado' };
  state.weather.dry = 0;
}

/** Roda a virada do dia até `done()` (o sorteio pode demorar umas vezes). */
function until(state, rt, done, tries = 60) {
  for (let i = 0; i < tries && !done(); i++) dailyDisasters(state, rt);
  return done();
}

test('enchente: chuva demais alaga a terra baixa perto do rio, fecha ruas, danifica e cobra o reparo', () => {
  const { state, rt } = riverCity();
  // Sem chuva acumulada, nada.
  for (let i = 0; i < 30; i++) dailyDisasters(state, rt);
  assert.equal(state.disasters.floods.length, 0);

  soak(state);
  assert.ok(until(state, rt, () => state.disasters.floods.length > 0), 'alagou');
  const flood = state.disasters.floods[0];
  const zone = floodZone(state);
  assert.ok(flood.tiles.length > 0 && flood.tiles.length <= DISASTERS.flood.maxTiles);
  assert.ok(flood.tiles.every((t) => zone[t] && t % S >= 44 - DISASTERS.flood.radius), 'só terra baixa perto da água');
  // Ruas alagadas fecham.
  updateClosures(state, rt);
  const roads = flood.tiles.filter((t) => state.map.road[t]);
  assert.ok(roads.length > 0);
  assert.ok(roads.every((t) => rt.blocked?.[t] === 1));
  // Prédios danificados: fechados e com reparo cobrado no mês.
  const damaged = state.buildings.filter((b) => b.damaged);
  assert.ok(damaged.length > 0, 'algum prédio danificado');
  assert.ok(damaged.every((b) => vacancies(rt, b) === 0));
  assert.ok(monthlyBudget(state, rt).expenses.rebuild > 0);
  assert.ok(state.news.pending.some((e) => e.kind === 'enchente'));
  assert.equal(state.disasters.log.at(-1).kind, 'enchente');

  // A água baixa, as ruas reabrem e os prédios são consertados.
  state.weather.rain = [];
  advance(state, rt, flood.until - state.time.tick + TICKS_PER_DAY);
  assert.equal(state.disasters.floods.length, 0);
  updateClosures(state, rt);
  assert.ok(!rt.blocked || roads.every((t) => !rt.blocked[t]));
  advance(state, rt, TICKS_PER_DAY * DISASTERS.repairDays);
  assert.ok(!state.buildings.some((b) => b.damaged));
});

test('opção dos desastres: desligados nunca acontecem; raros acontecem menos', () => {
  const count = (level) => {
    let floods = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const { state, rt } = riverCity(seed);
      assert.ok(applyCommand(state, rt, { type: 'disasters', level }).ok);
      for (let i = 0; i < 20; i++) {
        soak(state);
        state.disasters.floods = [];
        state.disasters.log = []; // sem o intervalo entre enchentes
        dailyDisasters(state, rt);
        floods += state.disasters.floods.length;
      }
    }
    return floods;
  };
  assert.equal(count('off'), 0);
  const rare = count('rare');
  const normal = count('normal');
  assert.ok(rare < normal, `${rare} < ${normal}`);
  assert.equal(applyCommand(riverCity().state, riverCity().rt, { type: 'disasters', level: 'muitos' }).ok, false);
});

test('drenagem e cidade-esponja: enchentes menores', () => {
  const { state, rt } = riverCity(4);
  completeTech(state, rt, 'drenagem');
  completeTech(state, rt, 'cidade_esponja');
  assert.ok(Math.abs(mod(rt, 'floodDamage') - 0.15) < 1e-9);
  soak(state);
  assert.ok(until(state, rt, () => state.disasters.floods.length > 0));
  assert.ok(state.disasters.floods[0].tiles.length <= Math.round(DISASTERS.flood.maxTiles * 0.15));
});

test('deslizamento: chuva forte derruba o prédio da encosta íngreme; contenção reduz', () => {
  const { state, rt } = riverCity(5);
  const map = state.map;
  const W = S + 1;
  const b = state.buildings.find((x) => BUILDINGS[x.type].zone && x.abandoned === undefined && x.tile % S > 3 && x.tile % S < 40);
  assert.ok(b);
  // Encosta íngreme em volta do prédio: o canto de cima do lote bem alto
  // (os quatro tiles desse canto encostam no prédio).
  const bx = b.tile % S;
  const by = Math.floor(b.tile / S);
  map.elevation[by * W + bx] = 24;
  assert.ok(slopeOf(map, T(bx, by - 1)) > 4);
  state.weather.today = { ...state.weather.today, mm: 45, kind: 'tempestade' };
  assert.ok(until(state, rt, () => b.abandoned !== undefined, 300), 'deslizou');
  assert.equal(b.ruined, 'deslizamento');
  assert.ok(map.elevation[by * W + bx] < 24, 'a encosta desceu');
  assert.ok(state.news.pending.some((e) => e.kind === 'deslizamento'));
  completeTech(state, rt, 'contencao_encostas');
  assert.equal(mod(rt, 'landslide'), 0.2);
});

test('queimada: na seca, o fogo anda pela mata, vira chão queimado e apaga na chuva; brigada reduz', () => {
  const { state, rt } = riverCity(6);
  const map = state.map;
  // Mata fechada numa faixa sem prédios (y = 44..46, entre a cidade e a borda).
  for (let y = 44; y <= 46; y++) for (let x = 2; x < 40; x++) {
    if (rt.buildingAt[T(x, y)] || map.road[T(x, y)]) continue;
    map.terrain[T(x, y)] = TERRAIN.FOREST;
    map.forest[T(x, y)] = 5;
  }
  state.weather.dry = 50;
  state.weather.today = { ...state.weather.today, mm: 0, kind: 'sol' };
  assert.ok(until(state, rt, () => state.disasters.fires.length > 0), 'pegou fogo');
  const fire = state.disasters.fires[0];
  for (let h = 0; h < 6; h++) {
    for (const t of fire.burning) assert.equal(map.terrain[t], TERRAIN.FOREST, 'só a mata pega fogo');
    spreadFires(state, rt);
  }
  assert.ok(fire.burned > 0);
  assert.ok(map.scar && map.scar.some((v) => v > 0), 'chão queimado');
  // Chuva apaga.
  state.weather.today = { ...state.weather.today, mm: 12, kind: 'chuva' };
  dailyDisasters(state, rt);
  assert.equal(state.disasters.fires.length, 0);
  completeTech(state, rt, 'brigada_florestal');
  assert.equal(mod(rt, 'wildfire'), 0.3);
});

test('defesa civil: prédio com a pesquisa; no raio, estragos menores e reparo na metade do tempo', () => {
  const { state, rt } = riverCity(7);
  const place = { type: 'place', building: 'centro_defesa_civil', tile: T(10, 3) };
  assert.match(applyCommand(state, rt, place).reason, /tecnologia/);
  completeTech(state, rt, 'defesa_civil');
  applyCommand(state, rt, { type: 'bulldoze', tiles: [place.tile] });
  const placed = applyCommand(state, rt, place);
  assert.ok(placed.ok, placed.reason);
  // Cobertura cheia em toda parte: o reparo cai pela metade.
  rt.coverage.defesa.fill(1);
  soak(state);
  const start = state.time.tick;
  // Uma enchente por vez: limpa a anterior a cada tentativa.
  assert.ok(until(state, rt, () => {
    state.disasters.floods = [];
    state.disasters.log = [];
    return state.buildings.some((b) => b.damaged);
  }, 200));
  const b = state.buildings.find((x) => x.damaged);
  const days = (b.damaged.until - start) / TICKS_PER_DAY;
  assert.ok(days <= DISASTERS.repairDays * DISASTERS.defense.repair + 1, `${days} dias`);
});

test('salvar e carregar no meio de uma enchente e de uma queimada dá o mesmo resultado; save 23 abre', () => {
  const { state: a, rt: ra } = riverCity(8);
  for (let y = 44; y <= 46; y++) for (let x = 2; x < 40; x++) {
    if (ra.buildingAt[T(x, y)] || a.map.road[T(x, y)]) continue;
    a.map.terrain[T(x, y)] = TERRAIN.FOREST;
    a.map.forest[T(x, y)] = 5;
  }
  soak(a);
  a.weather.dry = 50;
  until(a, ra, () => a.disasters.floods.length > 0 && a.disasters.fires.length > 0, 200);
  advance(a, ra, 125);
  const { state: b } = readSave(JSON.stringify(createSave(a, { id: 'desastre' })));
  const rb = prepare(b);
  assert.deepEqual(b.disasters, a.disasters);
  advance(a, ra, TICKS_PER_DAY * 2);
  advance(b, rb, TICKS_PER_DAY * 2);
  assert.deepEqual(b.disasters, a.disasters);
  assert.deepEqual(b.buildings, a.buildings);
  assert.deepEqual(b.map.terrain, a.map.terrain);

  const v23 = createSave(a, { id: 'v23' });
  delete v23.data.disasters;
  delete v23.data.settings;
  v23.version = 23;
  v23.checksum = checksum(v23.data);
  const old = readSave(JSON.stringify(v23)).state;
  assert.equal(old.settings.disasters, 'normal');
  assert.deepEqual(old.disasters.floods, []);
});
