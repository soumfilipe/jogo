import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer } from '../server.js';
import { createSave, readSave } from '../src/save/format.js';
import { createWorld } from '../src/world/world.js';
import { testCity } from './helpers.js';

let server, base, savesDir;

before(async () => {
  savesDir = await fs.mkdtemp(path.join(os.tmpdir(), 'jogo-saves-'));
  server = createServer({ savesDir });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.close();
  await fs.rm(savesDir, { recursive: true, force: true });
});

const put = (id, body) =>
  fetch(`${base}/api/saves/${id}`, { method: 'PUT', body: typeof body === 'string' ? body : JSON.stringify(body) });

test('grava, lista, lê e apaga um save em arquivo', { timeout: 5000 }, async () => {
  const { state } = testCity({ size: 24 });
  state.city.name = 'Atenas';
  const save = createSave(state, { id: 'atenas-1' });

  assert.equal((await put('atenas-1', save)).status, 200);
  const onDisk = JSON.parse(await fs.readFile(path.join(savesDir, 'atenas-1.json'), 'utf8'));
  assert.deepEqual(onDisk, save);

  const list = await (await fetch(`${base}/api/saves`)).json();
  assert.deepEqual(list.map((m) => m.id), ['atenas-1']);
  assert.equal(list[0].name, 'Atenas');

  const loaded = readSave(await (await fetch(`${base}/api/saves/atenas-1`)).text());
  assert.deepEqual(loaded.state, state);

  // Regravar mantém a versão anterior em .bak
  assert.equal((await put('atenas-1', createSave(state, { id: 'atenas-1' }))).status, 200);
  await fs.access(path.join(savesDir, 'atenas-1.json.bak'));

  assert.equal((await fetch(`${base}/api/saves/atenas-1`, { method: 'DELETE' })).status, 204);
  assert.equal((await fetch(`${base}/api/saves/atenas-1`)).status, 404);
  assert.equal((await fs.readdir(path.join(savesDir, '.trash'))).length, 1);
});

test('rejeita saves inválidos e ids perigosos', { timeout: 5000 }, async () => {
  const save = createSave(createWorld({ width: 8, height: 8, seed: 1 }), { id: 'valido' });
  assert.equal((await put('outro', save)).status, 400);
  assert.equal((await put('valido', '{"x":1}')).status, 400);
  assert.equal((await put('valido', 'nada')).status, 400);
  assert.equal((await put('..%2Fescape', save)).status, 400);
  assert.equal((await fetch(`${base}/api/saves/nao-existe`)).status, 404);
});

test('serve o jogo mas não a pasta de saves nem arquivos fora do projeto', { timeout: 5000 }, async () => {
  assert.equal((await fetch(`${base}/`)).status, 200);
  assert.equal((await fetch(`${base}/src/main.js`)).headers.get('content-type'), 'text/javascript; charset=utf-8');
  assert.equal((await fetch(`${base}/saves/x.json`)).status, 404);
  assert.equal((await fetch(`${base}/.git/config`)).status, 404);
  assert.equal((await fetch(`${base}/%2e%2e/%2e%2e/etc/passwd`)).status, 404);
});
