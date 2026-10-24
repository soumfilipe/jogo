// Onde os saves ficam guardados.
//
// Todos os backends têm a mesma interface:
//   list()            -> [meta, ...]   (mais recente primeiro)
//   load(id)          -> save (texto JSON ou objeto; readSave aceita os dois)
//   write(id, save)   -> grava o objeto de save
//   remove(id)
//
// - FileBackend: conversa com o server.js, que grava arquivos em ./saves/
// - IndexedDBBackend: banco do navegador, usado quando o jogo é aberto sem o
//   servidor (ex.: GitHub Pages). Cabe centenas de MB e grava sem travar a tela.
// - BrowserBackend: localStorage (~5 MB), só para navegadores sem IndexedDB

import { SaveError, isValidSaveId, validateSaveShape } from './format.js';

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

// Dois "object stores": "meta" guarda só os metadados (para listar rápido, sem
// carregar cidades inteiras) e "saves" guarda o save completo. Os dois são
// gravados na mesma transação, então nunca ficam fora de sincronia.
const DB_NAME = 'jogo';
const DB_VERSION = 1;

export class IndexedDBBackend {
  constructor(db) {
    this.db = db;
    this.kind = 'indexeddb';
    this.label = 'Navegador (IndexedDB)';
  }

  static async open(factory = globalThis.indexedDB, name = DB_NAME) {
    if (!factory) throw new SaveError('NO_INDEXEDDB', 'IndexedDB indisponível.');
    const db = await new Promise((resolve, reject) => {
      const req = factory.open(name, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('saves')) db.createObjectStore('saves');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new SaveError('DB_BLOCKED', 'Feche outras abas do jogo e recarregue.'));
    });
    // Outra aba atualizando o banco: fecha esta conexão para não bloqueá-la.
    db.onversionchange = () => db.close();
    return new IndexedDBBackend(db);
  }

  async list() {
    const metas = await this.#run('meta', 'readonly', (tx) => tx.objectStore('meta').getAll());
    return sortByUpdated(metas);
  }

  async load(id) {
    const save = await this.#run('saves', 'readonly', (tx) => tx.objectStore('saves').get(id));
    if (save === undefined) throw new SaveError('NOT_FOUND', `Save "${id}" não encontrado.`);
    return save;
  }

  async write(id, save) {
    if (!isValidSaveId(id)) throw new SaveError('INVALID_ID', `Id de save inválido: ${id}`);
    try {
      await this.#run(['meta', 'saves'], 'readwrite', (tx) => {
        tx.objectStore('saves').put(save, id);
        tx.objectStore('meta').put({ ...save.meta, id });
      });
    } catch (error) {
      if (error?.name === 'QuotaExceededError') {
        throw new SaveError('STORAGE_FULL', 'Sem espaço no navegador para salvar. Exporte para arquivo.');
      }
      throw error;
    }
  }

  async remove(id) {
    await this.#run(['meta', 'saves'], 'readwrite', (tx) => {
      tx.objectStore('saves').delete(id);
      tx.objectStore('meta').delete(id);
    });
  }

  /**
   * Copia os saves do localStorage (versões antigas do jogo) para cá e só
   * então os apaga de lá, liberando o espaço. Devolve quantos foram copiados.
   */
  async migrateFrom(storage, prefix = 'jogo:save:') {
    if (!storage) return 0;
    const keys = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key?.startsWith(prefix)) keys.push(key);
    }
    let moved = 0;
    for (const key of keys) {
      let save;
      try {
        save = validateSaveShape(JSON.parse(storage.getItem(key)));
      } catch {
        continue; // Corrompido: deixa onde está.
      }
      const id = key.slice(prefix.length);
      if (!isValidSaveId(id)) continue;
      await this.write(id, save);
      storage.removeItem(key);
      moved++;
    }
    return moved;
  }

  // Executa uma transação e resolve com o resultado do pedido devolvido por
  // `fn` quando a transação termina (só aí os dados estão gravados).
  #run(stores, mode, fn) {
    return new Promise((resolve, reject) => {
      let tx;
      try {
        tx = this.db.transaction(stores, mode);
      } catch (error) {
        reject(error);
        return;
      }
      const req = fn(tx);
      tx.oncomplete = () => resolve(req?.result);
      tx.onerror = () => reject(tx.error || req?.error);
      tx.onabort = () => reject(tx.error || new SaveError('ABORTED', 'Gravação cancelada pelo navegador.'));
    });
  }
}

/**
 * Usa o servidor de arquivos se ele estiver rodando; senão o IndexedDB do
 * navegador; e o localStorage só se o IndexedDB não abrir (ex.: modo privado
 * de alguns navegadores).
 */
export async function detectBackend({ timeoutMs = 1500 } = {}) {
  if (location.protocol === 'http:' || location.protocol === 'https:') {
    try {
      const res = await fetch('/api/health', { signal: AbortSignal.timeout(timeoutMs) });
      if (res.ok && (await res.json()).saves === true) return new FileBackend();
    } catch {
      // Sem servidor: cai no armazenamento do navegador.
    }
  }
  try {
    const backend = await IndexedDBBackend.open();
    try {
      backend.migrated = await backend.migrateFrom(globalThis.localStorage);
    } catch (error) {
      console.warn('Não foi possível migrar os saves do localStorage:', error);
    }
    // Pede ao navegador para não apagar os saves quando faltar espaço.
    navigator.storage?.persist?.().catch(() => {});
    return backend;
  } catch (error) {
    console.warn('IndexedDB indisponível, usando localStorage:', error);
    return new BrowserBackend();
  }
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
