import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RELIEF, TERRAIN, ZONE } from '../src/world/catalog.js';
import { createWorld } from '../src/world/world.js';
import { generateElevation, generateTerrain } from '../src/world/terrain.js';
import { cornerHeights, heightAt, isSteep, lotBase, slopeOf } from '../src/world/relief.js';
import { applyCommand, lineTiles, planCommand, rectTiles } from '../src/world/commands.js';
import { addBuilding } from '../src/world/runtime.js';
import { advance, prepare } from '../src/systems/simulation.js';
import { createSave, readSave, checksum } from '../src/save/format.js';
import { createCamera, screenToTile, worldToScreen } from '../src/render/camera.js';
import { TICKS_PER_DAY } from '../src/core/time.js';
import { testCity } from './helpers.js';

/** Confere o degrau máximo entre cantos vizinhos. */
function maxStepOf(map) {
  const W = map.width + 1;
  let worst = 0;
  for (let y = 0; y <= map.height; y++) {
    for (let x = 0; x <= map.width; x++) {
      const i = y * W + x;
      if (x < map.width) worst = Math.max(worst, Math.abs(map.elevation[i] - map.elevation[i + 1]));
      if (y < map.height) worst = Math.max(worst, Math.abs(map.elevation[i] - map.elevation[i + W]));
    }
  }
  return worst;
}

test('relevo gerado pela semente: determinístico, degrau limitado, água no nível 0, morros de verdade', () => {
  const a = createWorld({ width: 96, height: 96, seed: 77 });
  const b = createWorld({ width: 96, height: 96, seed: 77 });
  assert.deepEqual(a.map.elevation, b.map.elevation);
  assert.equal(a.map.elevation.length, 97 * 97);
  assert.ok(maxStepOf(a.map) <= RELIEF.maxStep);
  let top = 0;
  for (let t = 0; t < 96 * 96; t++) {
    if (a.map.terrain[t] === TERRAIN.WATER) assert.deepEqual(cornerHeights(a.map, t), [0, 0, 0, 0]);
    if (a.map.terrain[t] === TERRAIN.SAND) assert.ok(Math.max(...cornerHeights(a.map, t)) <= 2);
  }
  for (const h of a.map.elevation) top = Math.max(top, h);
  assert.ok(top >= 8 && top <= RELIEF.maxLevel, `pico ${top}`);
  // Mapa grande: tem encostas íngremes, mas a maior parte é construível.
  const terrain = generateTerrain(256, 256, 999);
  const big = { width: 256, height: 256, elevation: generateElevation(terrain, 256, 256, 999) };
  let steep = 0;
  for (let t = 0; t < 256 * 256; t++) steep += isSteep(big, t) ? 1 : 0;
  assert.ok(steep > 50 && steep < 256 * 256 * 0.1, `${steep} tiles íngremes`);
});

test('declive, encosta, base do prédio e altura interpolada', () => {
  const { state } = testCity();
  const map = state.map;
  const W = map.width + 1;
  // Tile (10, 10): cantos 0, 2, 6, 4.
  map.elevation[10 * W + 10] = 0;
  map.elevation[10 * W + 11] = 2;
  map.elevation[11 * W + 11] = 6;
  map.elevation[11 * W + 10] = 4;
  const t = 10 * map.width + 10;
  assert.deepEqual(cornerHeights(map, t), [0, 2, 6, 4]);
  assert.equal(slopeOf(map, t), 6);
  assert.equal(isSteep(map, t), 6 > RELIEF.maxBuildSlope);
  assert.deepEqual(lotBase(map, t), [0, 3]);
  assert.equal(heightAt(map, 10.5, 10.5), 3);
  assert.equal(heightAt(map, 11, 10), 2);
});

test('encosta íngreme não recebe rua nem prédio; declive encarece', () => {
  const { state, rt } = testCity();
  const map = state.map;
  const W = map.width + 1;
  // Uma rampa forte em x = 20..21 (y = 30..32), longe das ruas da cidade de teste.
  for (let y = 29; y <= 34; y++) {
    for (let x = 0; x <= map.width; x++) map.elevation[y * W + x] = x >= 21 ? 8 : 0;
  }
  const steepTile = 31 * map.width + 20; // cantos 0 e 8
  assert.ok(isSteep(map, steepTile));
  const road = applyCommand(state, rt, { type: 'road', tiles: [steepTile] });
  assert.equal(road.ok, false);
  // Rampa suave (declive 4): constrói, mais caro que no plano.
  for (let y = 29; y <= 34; y++) for (let x = 0; x <= map.width; x++) map.elevation[y * W + x] = x >= 21 ? 4 : 0;
  const flat = planCommand(state, rt, { type: 'road', tiles: [31 * map.width + 27] }).cost;
  const slope = planCommand(state, rt, { type: 'road', tiles: [31 * map.width + 20] }).cost;
  assert.equal(slope, flat * (1 + RELIEF.slopeCost));
});

test('crescimento não ocupa encosta íngreme', () => {
  const { state, rt } = testCity({ seed: 3 });
  const map = state.map;
  const W = map.width + 1;
  // A faixa residencial y = 3..6 vira serrilhado íngreme (0, 8, 0, 8...).
  for (let y = 3; y <= 7; y++) for (let x = 0; x <= map.width; x++) map.elevation[y * W + x] = x % 2 ? 8 : 0;
  // O degrau passa do limite de propósito: só a regra de construção importa aqui.
  advance(state, rt, TICKS_PER_DAY * 10);
  for (const b of state.buildings) {
    const y = Math.floor(b.tile / map.width);
    if (y >= 3 && y <= 6) assert.fail(`prédio #${b.id} na encosta`);
  }
  assert.ok(state.buildings.length > 10, 'o resto da cidade cresceu');
});

test('terraplanagem: sobe, desce e aplaina; vizinhos em rampa; prédio e água ficam; cobra por nível', () => {
  const { state, rt } = testCity();
  const map = state.map;
  const W = map.width + 1;
  // Miolo da quadra entre as ruas y = 37 e 42: as calçadas sobem em rampa.
  const area = rectTiles(map.width, 20, 39, 23, 40);
  const free = area.filter((t) => !map.road[t]);
  const money = state.economy.money;
  const up = applyCommand(state, rt, { type: 'terrain', mode: 'raise', tiles: free });
  assert.ok(up.ok, up.reason);
  assert.ok(up.cost > 0 && money - state.economy.money === up.cost);
  const c = (x, y) => map.elevation[y * W + x];
  assert.equal(c(21, 40), 1);
  for (let i = 0; i < 6; i++) applyCommand(state, rt, { type: 'terrain', mode: 'raise', tiles: free });
  assert.equal(c(21, 40), 7);
  assert.ok(maxStepOf(map) <= RELIEF.maxStep, 'vizinhos em rampa');
  assert.ok(c(19, 40) >= 3, 'o vizinho subiu junto');
  // Aplainar na altura do primeiro tile.
  const level = applyCommand(state, rt, { type: 'terrain', mode: 'level', tiles: rectTiles(map.width, 18, 40, 25, 43).filter((t) => !map.road[t]) });
  assert.ok(level.ok, level.reason);
  const lower = applyCommand(state, rt, { type: 'terrain', mode: 'lower', tiles: area });
  assert.ok(lower.ok, lower.reason);

  // Embaixo de prédio não muda.
  const b = state.buildings[0] ?? addBuilding(state, rt, 'casa', 3 * map.width + 3);
  const under = applyCommand(state, rt, { type: 'terrain', mode: 'raise', tiles: [b.tile] });
  assert.equal(under.ok, false);
  // Na água: os cantos encostados nela não mudam.
  map.terrain[45 * map.width + 45] = TERRAIN.WATER;
  const before = c(45, 45);
  applyCommand(state, rt, { type: 'terrain', mode: 'raise', tiles: rectTiles(map.width, 44, 44, 46, 46) });
  assert.equal(c(45, 45), before);
});

test('terraplanagem recusa deixar uma rua íngreme', () => {
  const { state, rt } = testCity();
  const map = state.map;
  // Ao lado da rua y = 7 (tiles y = 8), sobe 2 vezes um bloco de 1 tile de largura.
  const tiles = lineTiles(map.width, 10, 8, 14, 8);
  let r;
  for (let i = 0; i < 12; i++) {
    r = applyCommand(state, rt, { type: 'terrain', mode: 'raise', tiles });
    if (!r.ok) break;
  }
  assert.equal(r.ok, false);
  assert.match(r.reason, /rua|prédio|terreno/);
  for (let t = 0; t < map.width * map.height; t++) if (map.road[t]) assert.ok(!isSteep(map, t));
});

test('tile sob o mouse com relevo: o topo do morro é selecionado, não o chão atrás', () => {
  const map = { width: 40, height: 40, elevation: new Uint8Array(41 * 41) };
  // Morro de altura 16 nos cantos de 20..24.
  for (let y = 20; y <= 24; y++) for (let x = 20; x <= 24; x++) map.elevation[y * 41 + x] = 16;
  const cam = createCamera(40, 40);
  cam.viewW = 800;
  cam.viewH = 600;
  cam.zoom = 1;
  const [sx, sy] = worldToScreen(cam, 22.5, 22.5, 16);
  assert.deepEqual(screenToTile(cam, sx, sy, map), { x: 22, y: 22 });
  // Sem o mapa, o mesmo ponto cai no chão plano atrás do morro.
  const flat = screenToTile(cam, sx, sy);
  assert.ok(flat.x < 22 && flat.y < 22);
  // No plano, o resultado é o mesmo com ou sem o mapa.
  const [px, py] = worldToScreen(cam, 5.5, 8.5, 0);
  assert.deepEqual(screenToTile(cam, px, py, map), { x: 5, y: 8 });
});

test('salvar e carregar mantém o relevo; save 21 ganha relevo com a cidade plana', () => {
  const { state: a, rt: ra } = testCity({ seed: 4 });
  const W = a.map.width + 1;
  for (let i = 0; i < a.map.elevation.length; i++) a.map.elevation[i] = (i % W) % 7;
  advance(a, ra, TICKS_PER_DAY * 3);
  const { state: b } = readSave(JSON.stringify(createSave(a, { id: 'relevo' })));
  assert.deepEqual(b.map.elevation, a.map.elevation);
  const rb = prepare(b);
  advance(a, ra, TICKS_PER_DAY);
  advance(b, rb, TICKS_PER_DAY);
  assert.deepEqual(b.buildings, a.buildings);

  // Save 21: sem relevo. A migração gera pela semente e aplaina o que a cidade ocupa.
  const world = createWorld({ width: 64, height: 64, seed: 21 });
  prepare(world);
  world.economy.money = 1e6;
  let land = 0;
  for (let t = 0; t < 64 * 64 && !land; t++) if (world.map.terrain[t] !== TERRAIN.WATER && t % 64 < 50) land = t;
  world.map.zone[land] = ZONE.RESIDENTIAL;
  world.map.road[land + 1] = 1;
  const v21 = createSave(world, { id: 'v21' });
  delete v21.data.map.elevation;
  v21.version = 21;
  v21.checksum = checksum(v21.data);
  const { state: migrated } = readSave(JSON.stringify(v21));
  assert.equal(migrated.map.elevation.length, 65 * 65);
  assert.deepEqual(cornerHeights(migrated.map, land), [0, 0, 0, 0]);
  assert.deepEqual(cornerHeights(migrated.map, land + 1), [0, 0, 0, 0]);
  assert.ok(maxStepOf(migrated.map) <= RELIEF.maxStep);
  assert.ok(migrated.map.elevation.some((h) => h > 0), 'o resto ganhou relevo');
});
