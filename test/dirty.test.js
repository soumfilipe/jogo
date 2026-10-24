import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addBuilding, removeBuilding, touchMap } from '../src/world/runtime.js';
import { applyCommand } from '../src/world/commands.js';
import { testCity } from './helpers.js';

// O renderizador redesenha só os trechos que a simulação marcou como alterados.

function clean(rt) {
  rt.dirtyAll = false;
  rt.dirtyTiles.length = 0;
}

test('prédio novo ou demolido marca só o trecho dele', () => {
  const { state, rt } = testCity();
  clean(rt);
  const b = addBuilding(state, rt, 'condominio', 10 * 48 + 10);
  assert.deepEqual(rt.dirtyTiles, [10 * 48 + 10, 2]);
  assert.equal(rt.dirtyAll, false);
  removeBuilding(state, rt, b.id);
  assert.deepEqual(rt.dirtyTiles, [10 * 48 + 10, 2, 10 * 48 + 10, 2]);
});

test('ações do jogador e mudanças nas ruas pedem redesenho completo', () => {
  const { state, rt } = testCity();
  clean(rt);
  applyCommand(state, rt, { type: 'zone', zone: 1, tiles: [5] });
  assert.equal(rt.dirtyAll, true);
  assert.equal(rt.dirtyTiles.length, 0);
});

test('sem ninguém desenhando, a lista não cresce sem limite', () => {
  const { rt } = testCity();
  clean(rt);
  const version = rt.mapVersion;
  for (let i = 0; i < 5000; i++) touchMap(rt, i % 100);
  assert.equal(rt.dirtyAll, true);
  assert.equal(rt.dirtyTiles.length, 0);
  assert.equal(rt.mapVersion, version + 5000);
});
