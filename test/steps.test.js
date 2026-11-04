import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advance, tickSteps } from '../src/systems/simulation.js';
import { checksum, createSave, createSaveSteps, encodeState, readSave, saveBytes, saveJson } from '../src/save/format.js';
import { TICKS_PER_DAY } from '../src/core/time.js';
import { testCity } from './helpers.js';

// Tick e save em etapas (o laço do jogo para no meio para desenhar a tela).

test('tick em etapas: mesmo resultado do tick inteiro, mesmo parando no meio', () => {
  const a = testCity({ seed: 31 });
  const b = testCity({ seed: 31 });
  advance(a.state, a.rt, TICKS_PER_DAY * 2 + 30);
  let pauses = 0;
  for (let i = 0; i < TICKS_PER_DAY * 2 + 30; i++) {
    const steps = tickSteps(b.state, b.rt);
    while (!steps.next().done) pauses++;
  }
  assert.ok(pauses > 48, `parou ${pauses} vezes`);
  assert.equal(checksum(encodeState(b.state)), checksum(encodeState(a.state)));
});

test('save em etapas: o mesmo save, e o texto guardado é o do JSON', () => {
  const { state, rt } = testCity({ seed: 32 });
  advance(state, rt, TICKS_PER_DAY + 500);
  const steps = createSaveSteps(state, { id: 'etapas' });
  let r;
  let pauses = 0;
  while (!(r = steps.next()).done) pauses++;
  const staged = r.value;
  assert.ok(pauses > 5);
  const whole = createSave(state, { id: 'etapas' });
  staged.meta.updatedAt = whole.meta.updatedAt;
  staged.meta.createdAt = whole.meta.createdAt;
  assert.equal(staged.checksum, whole.checksum);
  assert.deepEqual(staged, whole);
  // O texto guardado é o mesmo de JSON.stringify e carrega a mesma cidade.
  const fresh = createSave(state, { id: 'texto' });
  assert.equal(saveJson(fresh), JSON.stringify(fresh));
  const { state: loaded } = readSave(saveJson(fresh));
  assert.equal(checksum(encodeState(loaded)), checksum(encodeState(state)));
  // Os bytes em UTF-8 (para mandar ao servidor) são o mesmo texto, com acentos e emoji.
  state.city.name = 'São Gonçalo 🏙️';
  const named = createSave(state, { id: 'bytes' });
  assert.equal(new TextDecoder().decode(saveBytes(named)), saveJson(named));
});
