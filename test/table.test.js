import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checksum, createSave, readSave, SAVE_VERSION } from '../src/save/format.js';
import { decodeMoves, decodeTable, encodeMoves, encodeTable } from '../src/save/table.js';
import { advance } from '../src/systems/simulation.js';
import { testCity } from './helpers.js';

test('tabela em colunas ida e volta, com campos faltando e nulos', () => {
  const rows = [
    { id: 1, type: 'casa', tile: 50, builtAt: 10 },
    { id: 2, type: 'casa', tile: 40, builtAt: 10, upgradedAt: 900 },
    { id: 7, type: 'loja', tile: 41, builtAt: 30, abandoned: 1200, note: null },
    { id: 9, type: 'casa', tile: 3, builtAt: 31.5 },
  ];
  const table = encodeTable(rows);
  assert.deepEqual(table.columns.id, { delta: [1, 1, 5, 2] });
  const back = decodeTable(JSON.parse(JSON.stringify(table)));
  assert.deepEqual(back, rows);
  assert.equal('abandoned' in back[0], false, 'campo ausente continua ausente (não vira null)');
  assert.deepEqual(decodeTable(encodeTable([])), []);
});

test('rotas viram passos e voltam iguais, inclusive com saltos', () => {
  const W = 256;
  const path = [5000, 4744, 4745, 4746, 5002, 5258, 5257, 5300, 5044];
  const text = encodeMoves(path, W);
  assert.equal(text, '5000,urrddl5300,u');
  assert.deepEqual(decodeMoves(text, W), path);
  assert.throws(() => decodeMoves('r', W), /corrompida/);
  assert.throws(() => decodeMoves('12', W), /corrompida/);
});

test('save do formato 4 (listas de objetos) abre no formato novo', () => {
  const { state, rt } = testCity();
  advance(state, rt, 1440 * 6 + 7.5 * 60);
  assert.ok(state.citizens.some((c) => c.path), 'tem gente viajando');
  const v5 = createSave(state, { id: 'v4' });
  const v4 = JSON.parse(JSON.stringify(v5));
  v4.data.buildings = decodeTable(v4.data.buildings);
  v4.data.citizens = decodeTable(v4.data.citizens, { moves: { path: state.map.width } });
  v4.version = 4;
  v4.checksum = checksum(v4.data);
  const { save, state: loaded } = readSave(JSON.stringify(v4));
  assert.equal(save.version, SAVE_VERSION);
  assert.deepEqual(loaded.citizens, state.citizens);
  assert.deepEqual(loaded.buildings, state.buildings);
  assert.ok(JSON.stringify(v5).length < JSON.stringify(v4).length / 2, 'formato novo bem menor');
});
