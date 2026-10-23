// Onde os saves ficam guardados.
//
// Todos os backends têm a mesma interface:
//   list()            -> [meta, ...]   (mais recente primeiro)
//   load(id)          -> texto JSON do save
//   write(id, save)   -> grava o objeto de save
//   remove(id)
//
// - FileBackend: conversa com o server.js, que grava arquivos em ./saves/
// - BrowserBackend: localStorage, usado quando o jogo é aberto sem o servidor

import { SaveError, isValidSaveId } from './format.js';

export class FileBackend {
  constructor(baseUrl = '/api/saves') {
    this.baseUrl = baseUrl;
    this.kind = 'file';
    this.label = 'Arquivos em saves/';
  }

  async list() {
    const res = await fetch(this.baseUrl);
    await assertOk(res);
    return res.json();
  }

  async load(id) {
    const res = await fetch(this.#url(id));
    await assertOk(res);
    return res.text();
  }

  async write(id, save, { keepalive = false } = {}) {
    const res = await fetch(this.#url(id), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(save),
      keepalive,
    });
    await assertOk(res);
  }

  async remove(id) {
    const res = await fetch(this.#url(id), { method: 'DELETE' });
    await assertOk(res);
  }

  #url(id) {
    if (!isValidSaveId(id)) throw new SaveError('INVALID_ID', `Id de save inválido: ${id}`);
    return `${this.baseUrl}/${id}`;
  }
}

export class BrowserBackend {
  constructor(storage = globalThis.localStorage, prefix = 'jogo:save:') {
    this.storage = storage;
    this.prefix = prefix;
    this.kind = 'browser';
    this.label = 'Navegador (sem servidor)';
  }

  async list() {
    const metas = [];
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (!key.startsWith(this.prefix)) continue;
      try {
        metas.push(JSON.parse(this.storage.getItem(key)).meta);
      } catch {
        // Entrada corrompida: ignora na listagem.
      }
    }
    return sortByUpdated(metas);
  }

  async load(id) {
    const text = this.storage.getItem(this.prefix + id);
    if (text === null) throw new SaveError('NOT_FOUND', `Save "${id}" não encontrado.`);
    return text;
  }

  async write(id, save) {
    try {
      this.storage.setItem(this.prefix + id, JSON.stringify(save));
    } catch {
      throw new SaveError('STORAGE_FULL', 'Sem espaço no navegador para salvar. Exporte para arquivo.');
    }
  }

  async remove(id) {
    this.storage.removeItem(this.prefix + id);
  }
}

/** Usa o servidor de arquivos se ele estiver rodando; senão, o navegador. */
export async function detectBackend({ timeoutMs = 1500 } = {}) {
  if (location.protocol === 'http:' || location.protocol === 'https:') {
    try {
      const res = await fetch('/api/health', { signal: AbortSignal.timeout(timeoutMs) });
      if (res.ok && (await res.json()).saves === true) return new FileBackend();
    } catch {
      // Sem servidor: cai no armazenamento do navegador.
    }
  }
  return new BrowserBackend();
}

export function sortByUpdated(metas) {
  return metas.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

async function assertOk(res) {
  if (res.ok) return;
  let body = {};
  try {
    body = await res.json();
  } catch {
    // Resposta sem JSON.
  }
  throw new SaveError(body.code || `HTTP_${res.status}`, body.error || `Erro ${res.status} no servidor.`);
}
