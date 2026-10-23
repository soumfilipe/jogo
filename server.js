// Servidor local do jogo. Sem dependências: só Node >= 18.
//
//   npm start            -> http://localhost:8080
//   PORT=3000 npm start  -> outra porta
//   SAVES_DIR=/caminho   -> outra pasta de saves
//
// Serve os arquivos estáticos do jogo e expõe uma API pequena que grava os
// saves como arquivos .json em ./saves/:
//
//   GET    /api/health
//   GET    /api/saves        -> lista os metadados dos saves
//   GET    /api/saves/:id    -> conteúdo do save
//   PUT    /api/saves/:id    -> grava (cria ou substitui) o save
//   DELETE /api/saves/:id    -> apaga o save (vai para saves/.trash/)

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SaveError, validateSaveShape, isValidSaveId } from './src/save/format.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const MAX_BODY_BYTES = 20 * 1024 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
};

// Pastas do projeto que não devem ser servidas como arquivo estático.
const PRIVATE_DIRS = new Set(['saves', 'node_modules', 'test']);

export function createServer({ savesDir = path.join(ROOT, 'saves') } = {}) {
  const store = new SaveStore(savesDir);

  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) {
        await handleApi(req, res, url.pathname, store);
      } else {
        await serveStatic(req, res, url.pathname);
      }
    } catch (error) {
      if (res.headersSent) {
        console.error(error);
        res.destroy();
      } else if (error instanceof SaveError) {
        sendJson(res, statusFor(error.code), { error: error.message, code: error.code });
      } else {
        console.error(error);
        sendJson(res, 500, { error: 'Erro interno do servidor.', code: 'INTERNAL' });
      }
    }
  });
}

async function handleApi(req, res, pathname, store) {
  if (pathname === '/api/health' && req.method === 'GET') {
    return sendJson(res, 200, { ok: true, saves: true });
  }

  if (pathname === '/api/saves' && req.method === 'GET') {
    return sendJson(res, 200, await store.list());
  }

  const match = pathname.match(/^\/api\/saves\/([^/]+)$/);
  if (match) {
    const id = decodeURIComponent(match[1]);
    if (!isValidSaveId(id)) throw new SaveError('INVALID_ID', 'Id de save inválido.');

    switch (req.method) {
      case 'GET': {
        const text = await store.read(id);
        res.writeHead(200, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
        return res.end(text);
      }
      case 'PUT': {
        const save = JSON.parse(await readBody(req));
        validateSaveShape(save);
        if (save.meta.id !== id) {
          throw new SaveError('INVALID_ID', 'O id do save não confere com a URL.');
        }
        await store.write(id, save);
        return sendJson(res, 200, save.meta);
      }
      case 'DELETE':
        await store.remove(id);
        res.writeHead(204);
        return res.end();
    }
  }

  sendJson(res, 404, { error: 'Rota não encontrada.', code: 'NOT_FOUND' });
}

class SaveStore {
  constructor(dir) {
    this.dir = dir;
  }

  file(id) {
    return path.join(this.dir, `${id}.json`);
  }

  async list() {
    await fs.mkdir(this.dir, { recursive: true });
    const names = (await fs.readdir(this.dir)).filter((n) => n.endsWith('.json'));
    const metas = [];
    for (const name of names) {
      try {
        const save = JSON.parse(await fs.readFile(path.join(this.dir, name), 'utf8'));
        metas.push({ ...validateSaveShape(save).meta, sizeBytes: (await fs.stat(path.join(this.dir, name))).size });
      } catch {
        // Arquivo estranho ou corrompido na pasta: não aparece na lista.
      }
    }
    return metas.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }

  async read(id) {
    try {
      return await fs.readFile(this.file(id), 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') throw new SaveError('NOT_FOUND', `Save "${id}" não encontrado.`);
      throw error;
    }
  }

  // Grava num arquivo temporário e renomeia: se o jogo/PC cair no meio, o
  // save antigo continua inteiro. A versão anterior fica em .bak.
  async write(id, save) {
    await fs.mkdir(this.dir, { recursive: true });
    const target = this.file(id);
    const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(save, null, 2), 'utf8');
    await fs.copyFile(target, `${target}.bak`).catch(() => {});
    await fs.rename(tmp, target);
  }

  // Não apaga de verdade: move para saves/.trash/ para poder recuperar.
  async remove(id) {
    const trash = path.join(this.dir, '.trash');
    await fs.mkdir(trash, { recursive: true });
    try {
      await fs.rename(this.file(id), path.join(trash, `${id}.${Date.now()}.json`));
    } catch (error) {
      if (error.code === 'ENOENT') throw new SaveError('NOT_FOUND', `Save "${id}" não encontrado.`);
      throw error;
    }
    await fs.rm(`${this.file(id)}.bak`, { force: true });
  }
}

async function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return sendJson(res, 405, { error: 'Método não permitido.', code: 'METHOD' });
  }

  let relative;
  try {
    relative = decodeURIComponent(pathname);
  } catch {
    return sendJson(res, 400, { error: 'URL inválida.', code: 'BAD_URL' });
  }
  if (relative.endsWith('/')) relative += 'index.html';

  const filePath = path.resolve(ROOT, `.${relative}`);
  const parts = path.relative(ROOT, filePath).split(path.sep);
  const forbidden =
    !filePath.startsWith(ROOT + path.sep) ||
    PRIVATE_DIRS.has(parts[0]) ||
    parts.some((p) => p.startsWith('.'));
  if (forbidden) return sendJson(res, 404, { error: 'Não encontrado.', code: 'NOT_FOUND' });

  try {
    const body = await fs.readFile(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    sendJson(res, 404, { error: 'Não encontrado.', code: 'NOT_FOUND' });
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new SaveError('TOO_LARGE', 'Save grande demais.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  }).then((text) => {
    try {
      JSON.parse(text);
    } catch {
      throw new SaveError('INVALID_JSON', 'Corpo da requisição não é JSON válido.');
    }
    return text;
  });
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function statusFor(code) {
  if (code === 'NOT_FOUND') return 404;
  if (code === 'TOO_LARGE') return 413;
  return 400;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 8080;
  const savesDir = process.env.SAVES_DIR ? path.resolve(process.env.SAVES_DIR) : undefined;
  // Só escuta em localhost: o jogo e os saves não ficam expostos na rede.
  createServer({ savesDir }).listen(port, '127.0.0.1', () => {
    console.log(`Jogo rodando em http://localhost:${port}`);
    console.log(`Saves em ${savesDir || path.join(ROOT, 'saves')}`);
  });
}
