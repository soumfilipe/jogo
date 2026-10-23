import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createSave, readSave, rleEncode, rleDecode, encodeSaveCode, decodeSaveCode,
  makeSaveId, isValidSaveId, SAVE_VERSION,
} from '../src/save/format.js';
import { createNewState, placeTile, stepDay, TILE } from '../src/game/state.js';

function sampleState() {
  const state = createNewState({ name: 'São Paulo' });
  for (let x = 0; x < 10; x++) placeTile(state, x, 3, TILE.ROAD);
  placeTile(state, 5, 4, TILE.RESIDENTIAL);
  for (let i = 0; i < 95; i++) stepDay(state);
  return state;
}

test('save -> JSON -> load devolve o mesmo estado', () => {
  const state = sampleState();
  const save = createSave(state, { id: 'sao-paulo-abc123' });
  const { state: loaded, save: read } = readSave(JSON.stringify(save));
  assert.deepEqual(loaded, state);
  assert.ok(loaded.map.tiles instanceof Uint8Array);
  assert.equal(read.version, SAVE_VERSION);
  assert.equal(read.meta.name, 'São Paulo');
  assert.equal(read.meta.summary.date.month, state.time.month);
});

test('mapa vazio vira um save pequeno', () => {
  const save = createSave(createNewState(), { id: 'vazio' });
  assert.ok(JSON.stringify(save).length < 2000);
});

test('rle ida e volta', () => {
  const tiles = Uint8Array.from([0, 0, 0, 1, 2, 2, 0]);
  assert.deepEqual(rleEncode(tiles), [3, 0, 1, 1, 2, 2, 1, 0]);
  assert.deepEqual(rleDecode(rleEncode(tiles), tiles.length), tiles);
  assert.throws(() => rleDecode([3, 0], 4), { code: 'INVALID_SHAPE' });
});

test('detecta save editado/corrompido', () => {
  const save = createSave(sampleState(), { id: 'teste' });
  save.data.economy.money = 999_999_999;
  assert.throws(() => readSave(save), { code: 'CHECKSUM' });
  assert.doesNotThrow(() => readSave(save, { allowChecksumMismatch: true }));
});

test('rejeita arquivos que não são saves', () => {
  assert.throws(() => readSave('não é json'), { code: 'INVALID_JSON' });
  assert.throws(() => readSave('{"foo":1}'), { code: 'WRONG_FORMAT' });
  const save = createSave(sampleState(), { id: 'teste' });
  assert.throws(() => readSave({ ...save, version: SAVE_VERSION + 1 }), { code: 'TOO_NEW' });
  assert.throws(() => readSave({ ...save, meta: { ...save.meta, id: '../etc' } }), { code: 'INVALID_SHAPE' });
});

test('código de save ida e volta (com acentos)', () => {
  const save = createSave(sampleState(), { id: 'teste' });
  const code = encodeSaveCode(save);
  assert.match(code, /^JOGO1:[A-Za-z0-9+/=]+$/);
  assert.deepEqual(readSave(decodeSaveCode(code)).save, save);
  assert.throws(() => decodeSaveCode('lixo'), { code: 'INVALID_CODE' });
});

test('ids de save são seguros para nome de arquivo', () => {
  const id = makeSaveId('Cidade Ñova / ../../etc');
  assert.ok(isValidSaveId(id), id);
  assert.ok(isValidSaveId(`auto-${id}`));
  for (const bad of ['', '../x', 'a/b', 'A', '.hidden', 'x'.repeat(65)]) {
    assert.equal(isValidSaveId(bad), false, bad);
  }
});
