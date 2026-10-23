import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createSave, readSave, rleEncode, rleDecode, encodeSaveCode, decodeSaveCode,
  makeSaveId, isValidSaveId, SAVE_VERSION, checksum,
} from '../src/save/format.js';
import { createWorld } from '../src/world/world.js';
import { advance, prepare } from '../src/systems/simulation.js';
import { ZONE } from '../src/world/catalog.js';
import { testCity } from './helpers.js';

function sampleState() {
  const { state, rt } = testCity({ size: 32 });
  state.city.name = 'São Paulo';
  advance(state, rt, 1440 * 2 + 60);
  return state;
}

test('save -> JSON -> load devolve o mesmo estado', () => {
  const state = sampleState();
  const save = createSave(state, { id: 'sao-paulo-abc123' });
  const { state: loaded, save: read } = readSave(JSON.stringify(save));
  assert.deepEqual(loaded, state);
  assert.ok(loaded.map.road instanceof Uint8Array);
  assert.ok(loaded.citizens.length > 0);
  assert.equal(read.version, SAVE_VERSION);
  assert.equal(read.meta.name, 'São Paulo');
  assert.equal(read.meta.summary.population, state.citizens.length);
  assert.deepEqual(read.meta.summary.date, { day: 3, month: 1, year: 1 });
});

test('mapa 256x256 novo vira um save pequeno', () => {
  const save = createSave(createWorld({ seed: 1 }), { id: 'vazio' });
  const size = JSON.stringify(save).length;
  assert.ok(size < 120_000, `${size} bytes`);
});

test('migra save do formato 1 (mapa de tiles único)', () => {
  // Save v1 como o jogo antigo gravava: 4x2, estrada na linha de cima e zonas embaixo.
  const data = {
    city: { name: 'Antiga' },
    time: { year: 1, month: 2, day: 3 },
    playTimeSeconds: 42,
    economy: { money: 1234, taxRate: 0.09 },
    stats: { population: 0 },
    map: { width: 4, height: 2, tiles: [4, 1, 1, 2, 1, 3, 2, 4], encoding: 'rle' },
  };
  const v1 = {
    format: 'jogo-save', version: 1,
    meta: { id: 'antiga', name: 'Antiga', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
    checksum: checksum(data), data,
  };
  const { state, save } = readSave(JSON.stringify(v1));
  assert.equal(save.version, SAVE_VERSION);
  assert.deepEqual([...state.map.road], [1, 1, 1, 1, 0, 0, 0, 0]);
  assert.deepEqual([...state.map.zone], [0, 0, 0, 0, ZONE.RESIDENTIAL, ZONE.COMMERCIAL, ZONE.INDUSTRIAL, ZONE.INDUSTRIAL]);
  assert.equal(state.economy.money, 1234);
  assert.equal(state.time.tick, (30 + 2) * 1440 + 7 * 60);
  // O estado migrado roda normalmente.
  const rt = prepare(state);
  advance(state, rt, 1440);
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
