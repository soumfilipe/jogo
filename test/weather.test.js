import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILDINGS, CLIMATES, TERRAIN, WEATHER } from '../src/world/catalog.js';
import { createWorld } from '../src/world/world.js';
import { applyCommand, bridgeSpan, lineTiles, planCommand } from '../src/world/commands.js';
import { advance, prepare } from '../src/systems/simulation.js';
import { completeTech } from '../src/systems/research.js';
import { consumption } from '../src/systems/utilities.js';
import { findRoadPath } from '../src/agents/pathfinding.js';
import { createWeather, dayWeather, forecast, monthRisk, rain30, updateWeather } from '../src/systems/weather.js';
import { TICKS_PER_DAY } from '../src/core/time.js';
import { createSave, readSave, checksum } from '../src/save/format.js';
import { testCity } from './helpers.js';

test('cada clima: chuva média do ano perto da tabela, verão e inverno no lugar certo', () => {
  for (const [id, c] of Object.entries(CLIMATES)) {
    const years = 20;
    const months = new Array(12).fill(0);
    let hot = 0;
    for (let d = 0; d < 360 * years; d++) {
      const w = dayWeather(99, id, d);
      months[Math.floor(d / 30) % 12] += w.mm / years;
      hot += w.hot;
      assert.ok(['sol', 'nublado', 'chuva', 'tempestade'].includes(w.kind));
      assert.equal(w.kind === 'tempestade', w.mm >= WEATHER.storm);
    }
    const total = months.reduce((s, v) => s + v, 0);
    const expected = c.rain.reduce((s, v) => s + v, 0);
    assert.ok(Math.abs(total - expected) / expected < 0.15, `${id}: ${Math.round(total)} mm/ano contra ${expected}`);
    // O mês mais chuvoso da tabela chove mais que o mais seco.
    const wet = c.rain.indexOf(Math.max(...c.rain));
    const dry = c.rain.indexOf(Math.min(...c.rain));
    assert.ok(months[wet] > months[dry], id);
    assert.ok(hot < 360 * years * 0.2, `${id}: calor demais`);
  }
  // Semiárido: secas longas; temperado: dias de frio.
  let longest = 0;
  let dry = 0;
  for (let d = 0; d < 360 * 5; d++) {
    dry = dayWeather(7, 'semiarido', d).mm >= 1 ? 0 : dry + 1;
    longest = Math.max(longest, dry);
  }
  assert.ok(longest >= 45, `seca máxima ${longest}`);
  let cold = 0;
  for (let d = 0; d < 360 * 3; d++) cold += dayWeather(7, 'temperado', d).cold;
  assert.ok(cold > 10);
});

test('o tempo do dia vira à meia-noite, guarda a chuva e os dias secos, e não mexe no sorteio da simulação', () => {
  const { state, rt } = testCity({ seed: 8 });
  assert.equal(state.weather.climate, 'subtropical');
  const rngBefore = state.rng.s;
  const f = forecast(state, rt);
  assert.equal(f.length, WEATHER.forecast);
  assert.equal(state.rng.s, rngBefore, 'a previsão não sorteia nada');
  advance(state, rt, TICKS_PER_DAY * 5);
  const day = Math.floor(state.time.tick / TICKS_PER_DAY);
  assert.equal(state.weather.today.day, day);
  assert.equal(state.weather.rain.length, 5);
  // A previsão de antes bate com o tempo que veio.
  assert.deepEqual(state.weather.today, dayWeather(state.seed, 'subtropical', day));
  assert.deepEqual(f[0], dayWeather(state.seed, 'subtropical', 1));
  assert.equal(rain30(state), state.weather.rain.reduce((s, v) => s + v, 0));
  // Dias secos contam seguidos e zeram com chuva.
  state.weather.today = { ...state.weather.today, mm: 0 };
  state.weather.dry = 3;
  state.time.tick += TICKS_PER_DAY;
  updateWeather(state, rt);
  assert.equal(state.weather.dry, 4);
});

test('Ciência do clima: previsão de 7 dias e risco do mês', () => {
  const { state, rt } = testCity();
  completeTech(state, rt, 'clima');
  assert.equal(forecast(state, rt).length, 7);
  state.weather.climate = 'tropical';
  assert.deepEqual(monthRisk(state), { flood: 'alto', drought: 'baixo' }); // janeiro
  state.time.tick = TICKS_PER_DAY * 30 * 7; // agosto
  assert.equal(monthRisk(state).drought, 'alto');
});

test('dia de calor gasta mais energia; chuva espanta turistas dos parques', async () => {
  const { state, rt } = testCity();
  const info = BUILDINGS.apartamentos;
  rt.weatherPower = 1;
  const normal = consumption(info, 16, rt).power;
  rt.weatherPower = WEATHER.hotPower;
  assert.equal(consumption(info, 16, rt).power, Math.ceil(normal * WEATHER.hotPower));
  const { parkTourists } = await import('../src/systems/tourism.js');
  state.map.park = new Uint8Array(state.map.zone.length);
  state.map.park.fill(1, 0, 400);
  state.weather.today = { ...state.weather.today, kind: 'sol' };
  const sunny = parkTourists(state, rt);
  state.weather.today = { ...state.weather.today, kind: 'chuva' };
  const rainy = parkTourists(state, rt);
  assert.ok(rainy > 0 && rainy < sunny);
  assert.ok(Math.abs(rainy - sunny * WEATHER.rainTourists) <= 1);
});

test('pontes: retas, de margem a margem, vão máximo de 4 (16 com a Ponte estaiada); carros atravessam', () => {
  const state = createWorld({ width: 48, height: 48, seed: 3 });
  state.map.terrain.fill(TERRAIN.GRASS);
  state.map.elevation.fill(0);
  state.economy.money = 1e6;
  // Rio vertical de 3 tiles (x = 20..22) e um largo de 9 (x = 30..38).
  for (let y = 0; y < 48; y++) {
    for (let x = 20; x <= 22; x++) state.map.terrain[y * 48 + x] = TERRAIN.WATER;
    for (let x = 30; x <= 38; x++) state.map.terrain[y * 48 + x] = TERRAIN.WATER;
  }
  const rt = prepare(state);
  const short = lineTiles(48, 17, 10, 25, 10);
  const plan = planCommand(state, rt, { type: 'road', tiles: short });
  assert.ok(!plan.reason, plan.reason);
  const flat = planCommand(state, rt, { type: 'road', tiles: lineTiles(48, 2, 10, 10, 10) }).cost;
  assert.ok(plan.cost > flat, 'a ponte custa mais');
  assert.ok(applyCommand(state, rt, { type: 'road', tiles: short }).ok);
  for (let x = 20; x <= 22; x++) assert.equal(state.map.road[10 * 48 + x], 1);
  // Começa ou termina na água, ou faz curva sobre ela: recusa.
  assert.match(planCommand(state, rt, { type: 'road', tiles: lineTiles(48, 15, 20, 21, 20) }).reason, /terra firme/);
  // Curva sobre um lago 3x3 (x = 5..7, y = 40..42): sai da terra e chega na terra, mas dobra na água.
  for (let y = 40; y <= 42; y++) for (let x = 5; x <= 7; x++) state.map.terrain[y * 48 + x] = TERRAIN.WATER;
  assert.match(planCommand(state, rt, { type: 'road', tiles: lineTiles(48, 4, 40, 7, 43) }).reason, /reta/);
  // Vão largo: precisa da pesquisa.
  const wide = lineTiles(48, 27, 14, 41, 14);
  assert.equal(bridgeSpan(rt), 4);
  assert.match(planCommand(state, rt, { type: 'road', tiles: wide }).reason, /Ponte estaiada/);
  completeTech(state, rt, 'ponte_estaiada');
  assert.equal(bridgeSpan(rt), 16);
  assert.ok(applyCommand(state, rt, { type: 'road', tiles: wide }).ok);
  // Rota atravessa as duas pontes.
  applyCommand(state, rt, { type: 'road', tiles: lineTiles(48, 25, 10, 27, 10) });
  applyCommand(state, rt, { type: 'road', tiles: lineTiles(48, 27, 10, 27, 14) });
  const path = findRoadPath(state.map, 17 + 10 * 48, 41 + 14 * 48);
  assert.ok(path && path.includes(21 + 10 * 48) && path.includes(34 + 14 * 48));
});

test('salvar e carregar mantém o tempo; save 22 ganha clima subtropical', () => {
  const { state: a, rt: ra } = testCity({ seed: 6 });
  a.weather = createWeather(a.seed, 'semiarido');
  advance(a, ra, TICKS_PER_DAY * 4 + 300);
  const { state: b } = readSave(JSON.stringify(createSave(a, { id: 'tempo' })));
  assert.deepEqual(b.weather, a.weather);
  const rb = prepare(b);
  advance(a, ra, TICKS_PER_DAY * 3);
  advance(b, rb, TICKS_PER_DAY * 3);
  assert.deepEqual(b.weather, a.weather);
  assert.deepEqual(b.buildings, a.buildings);

  const v22 = createSave(a, { id: 'v22' });
  delete v22.data.weather;
  v22.version = 22;
  v22.checksum = checksum(v22.data);
  const old = readSave(JSON.stringify(v22)).state;
  assert.equal(old.weather.climate, 'subtropical');
  assert.equal(old.weather.today.day, Math.floor(a.time.tick / TICKS_PER_DAY));
  assert.deepEqual(old.weather.rain, []);
});
