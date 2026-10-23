import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../src/world/world.js';
import { TERRAIN, ZONE } from '../src/world/catalog.js';
import { treesFor, waterDepth } from '../src/render/nature.js';

function world() {
  const state = createWorld({ width: 40, height: 40, seed: 3 });
  state.map.terrain.fill(TERRAIN.GRASS);
  return state;
}

test('florestas têm densidade variada e tipos de árvore diferentes', () => {
  const state = world();
  state.map.terrain.fill(TERRAIN.FOREST);
  const counts = new Set();
  const kinds = new Set();
  for (let y = 0; y < 40; y++) {
    for (let x = 0; x < 40; x++) {
      const trees = treesFor(state, x, y);
      counts.add(trees.length);
      for (const t of trees) {
        kinds.add(t.kind);
        assert.ok(t.u > 0 && t.u < 1 && t.v > 0 && t.v < 1, 'árvore dentro do tile');
      }
    }
  }
  assert.ok(Math.min(...counts) >= 1 && Math.max(...counts) >= 5, `quantidades: ${[...counts].sort()}`);
  assert.deepEqual([...kinds].sort(), ['arbusto', 'copa', 'pinheiro']);
  // Sempre o mesmo resultado para o mesmo tile.
  assert.deepEqual(treesFor(state, 7, 9), treesFor(state, 7, 9));
});

test('árvores soltas na borda da mata, nunca em ruas ou zonas', () => {
  const state = world();
  const W = 40;
  for (let y = 0; y < 40; y++) state.map.terrain[y * W + 20] = TERRAIN.FOREST; // uma faixa de mata
  let edge = 0;
  let open = 0;
  for (let y = 0; y < 40; y++) {
    if (treesFor(state, 21, y).length) edge++;
    if (treesFor(state, 5, y).length) open++;
  }
  assert.ok(edge > open, `borda ${edge} x campo aberto ${open}`);

  state.map.road[5 * W + 21] = 1;
  state.map.zone[6 * W + 21] = ZONE.RESIDENTIAL;
  assert.equal(treesFor(state, 21, 5).length, 0);
  assert.equal(treesFor(state, 21, 6).length, 0);
});

test('água mais funda longe da margem', () => {
  const state = world();
  const W = 40;
  for (let y = 10; y < 30; y++) for (let x = 10; x < 30; x++) state.map.terrain[y * W + x] = TERRAIN.WATER;
  const depth = waterDepth(state);
  assert.ok(depth[20 * W + 20] > depth[10 * W + 20], 'centro do lago mais fundo que a margem');
  assert.equal(depth[0], 0, 'terra não tem profundidade');
});
