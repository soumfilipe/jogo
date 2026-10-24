import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../src/world/world.js';
import { FOREST, TERRAIN, ZONE } from '../src/world/catalog.js';
import { advance, prepare } from '../src/systems/simulation.js';
import { applyCommand } from '../src/world/commands.js';
import { createSave, readSave, SAVE_VERSION } from '../src/save/format.js';
import { generateForest } from '../src/world/terrain.js';
import { TICKS_PER_DAY } from '../src/core/time.js';

function world() {
  const state = createWorld({ width: 32, height: 32, seed: 5 });
  state.map.terrain.fill(TERRAIN.GRASS);
  state.map.forest.fill(0);
  return state;
}

test('mapa novo já tem densidade em toda mata, e só nela', () => {
  const state = createWorld({ width: 64, height: 64, seed: 9 });
  const { terrain, forest } = state.map;
  for (let i = 0; i < terrain.length; i++) {
    if (terrain[i] === TERRAIN.FOREST) assert.ok(forest[i] >= 1 && forest[i] <= FOREST.maxDensity);
    else assert.equal(forest[i], 0);
  }
});

test('matas ficam mais densas e se espalham para a grama vizinha', () => {
  const state = world();
  const W = 32;
  for (let y = 10; y < 22; y++) {
    for (let x = 10; x < 22; x++) {
      state.map.terrain[y * W + x] = TERRAIN.FOREST;
      state.map.forest[y * W + x] = FOREST.spreadDensity;
    }
  }
  const before = state.map.forest.reduce((a, b) => a + b, 0);
  const rt = prepare(state);
  advance(state, rt, 60 * TICKS_PER_DAY);

  const { terrain, forest } = state.map;
  assert.ok(forest.reduce((a, b) => a + b, 0) > before, 'mais árvores');
  assert.ok(forest.some((d) => d === FOREST.maxDensity), 'algum tile chega na densidade máxima');
  assert.ok(forest.every((d) => d <= FOREST.maxDensity));
  let spread = 0;
  for (let i = 0; i < terrain.length; i++) {
    const x = i % W;
    const y = Math.floor(i / W);
    const inside = x >= 10 && x < 22 && y >= 10 && y < 22;
    if (!inside && terrain[i] === TERRAIN.FOREST) {
      spread++;
      assert.ok(forest[i] >= 1);
    }
  }
  assert.ok(spread > 0, 'a mata avançou sobre a grama');
  // Grama longe de mata continua grama.
  assert.equal(terrain[0], TERRAIN.GRASS);
});

test('mata não cresce em estrada, zona, prédio ou água', () => {
  const state = world();
  const W = 32;
  state.map.terrain.fill(TERRAIN.FOREST);
  state.map.forest.fill(FOREST.maxDensity);
  // Faixa central sem mata: estrada, zona, água e grama livre lado a lado.
  for (let x = 0; x < W; x++) {
    for (let y = 14; y < 18; y++) {
      state.map.terrain[y * W + x] = TERRAIN.GRASS;
      state.map.forest[y * W + x] = 0;
    }
    state.map.road[14 * W + x] = 1;
    state.map.zone[15 * W + x] = ZONE.RESIDENTIAL;
    state.map.terrain[16 * W + x] = TERRAIN.WATER;
  }
  const rt = prepare(state);
  advance(state, rt, 90 * TICKS_PER_DAY);
  for (let x = 0; x < W; x++) {
    assert.equal(state.map.terrain[14 * W + x], TERRAIN.GRASS, 'estrada');
    assert.equal(state.map.terrain[15 * W + x], TERRAIN.GRASS, 'zona');
    assert.equal(state.map.terrain[16 * W + x], TERRAIN.WATER, 'água');
  }
  assert.ok([...Array(W).keys()].some((x) => state.map.terrain[17 * W + x] === TERRAIN.FOREST), 'grama livre vira mata');
});

test('derrubar a mata zera a densidade', () => {
  const state = world();
  state.economy.money = 1000;
  state.map.terrain[40] = TERRAIN.FOREST;
  state.map.forest[40] = 4;
  const rt = prepare(state);
  assert.ok(applyCommand(state, rt, { type: 'bulldoze', tiles: [40] }).ok);
  assert.equal(state.map.terrain[40], TERRAIN.GRASS);
  assert.equal(state.map.forest[40], 0);
});

test('save v5 ganha a camada de densidade da mata', () => {
  const state = createWorld({ width: 48, height: 48, seed: 21 });
  const expected = state.map.forest;
  const save = createSave(state, { id: 'mata' });
  // Simula um save antigo: sem a camada de densidade.
  delete save.data.map.forest;
  save.version = 5;
  const { save: migrated, state: loaded } = readSave(save, { allowChecksumMismatch: true });
  assert.equal(migrated.version, SAVE_VERSION);
  assert.deepEqual(loaded.map.forest, expected);
  assert.deepEqual(generateForest(loaded.map.terrain, 48, 48, 21), expected);
});
