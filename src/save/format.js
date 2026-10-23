// Formato do arquivo de salvamento.
//
// Este módulo não depende do navegador nem do Node: é usado pelo jogo
// (para gerar/ler saves) e pelo servidor (para validar o que vai para disco).
//
// Estrutura de um arquivo de save:
// {
//   "format":   "jogo-save",       // identifica o tipo de arquivo
//   "version":  1,                 // versão do FORMATO (para migrações)
//   "meta":     { id, name, ... }, // informações leves, usadas na lista de saves
//   "checksum": "a1b2c3d4",        // detecta arquivo corrompido/editado
//   "data":     { ... }            // estado do jogo, já codificado
// }

export const SAVE_FORMAT = 'jogo-save';
export const SAVE_VERSION = 1;
export const GAME_VERSION = '0.1.0';
export const SAVE_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

const SAVE_CODE_PREFIX = 'JOGO1:';

export class SaveError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'SaveError';
    this.code = code;
  }
}

// Migrações do formato: a chave é a versão de ORIGEM e a função devolve o
// save na versão seguinte. Quando o formato mudar, aumente SAVE_VERSION e
// adicione aqui a migração da versão anterior, por exemplo:
//
//   1: (save) => {
//     save.data.economy.loans = [];
//     save.version = 2;
//     return save;
//   },
const MIGRATIONS = {};

// ---------------------------------------------------------------------------
// Criação e leitura
// ---------------------------------------------------------------------------

/** Monta o objeto de save a partir do estado do jogo. */
export function createSave(state, meta) {
  if (!meta || !isValidSaveId(meta.id)) {
    throw new SaveError('INVALID_ID', `Id de save inválido: ${meta && meta.id}`);
  }
  const data = encodeState(state);
  const now = new Date().toISOString();
  return {
    format: SAVE_FORMAT,
    version: SAVE_VERSION,
    meta: {
      id: meta.id,
      // Id da partida: igual a "id", exceto no save automático (auto-<gameId>).
      gameId: meta.gameId || meta.id,
      name: meta.name || state.city.name,
      autosave: Boolean(meta.autosave),
      gameVersion: GAME_VERSION,
      createdAt: meta.createdAt || now,
      updatedAt: now,
      playTimeSeconds: Math.floor(state.playTimeSeconds || 0),
      summary: summarize(state),
    },
    checksum: checksum(data),
    data,
  };
}

/**
 * Lê um save (texto JSON ou objeto já parseado), valida, aplica migrações e
 * devolve { save, state }. Lança SaveError se algo estiver errado.
 */
export function readSave(input, { allowChecksumMismatch = false } = {}) {
  let save = input;
  if (typeof input === 'string') {
    try {
      save = JSON.parse(input);
    } catch {
      throw new SaveError('INVALID_JSON', 'O arquivo de save não é um JSON válido.');
    }
  }

  validateSaveShape(save);

  if (!allowChecksumMismatch && checksum(save.data) !== save.checksum) {
    throw new SaveError('CHECKSUM', 'O save parece corrompido ou foi editado manualmente.');
  }

  save = migrate(save);
  return { save, state: decodeState(save.data) };
}

/** Valida a estrutura mínima de um save. Usado também pelo servidor. */
export function validateSaveShape(save) {
  if (!save || typeof save !== 'object' || Array.isArray(save)) {
    throw new SaveError('INVALID_SHAPE', 'Save vazio ou com formato inesperado.');
  }
  if (save.format !== SAVE_FORMAT) {
    throw new SaveError('WRONG_FORMAT', 'Este arquivo não é um save deste jogo.');
  }
  if (!Number.isInteger(save.version) || save.version < 1) {
    throw new SaveError('INVALID_SHAPE', 'Versão do save ausente ou inválida.');
  }
  if (save.version > SAVE_VERSION) {
    throw new SaveError(
      'TOO_NEW',
      `Save criado por uma versão mais nova do jogo (formato ${save.version}, suportado até ${SAVE_VERSION}).`,
    );
  }
  if (!save.meta || typeof save.meta !== 'object' || !isValidSaveId(save.meta.id)) {
    throw new SaveError('INVALID_SHAPE', 'Metadados do save ausentes ou inválidos.');
  }
  if (typeof save.checksum !== 'string' || !save.data || typeof save.data !== 'object') {
    throw new SaveError('INVALID_SHAPE', 'Dados do save ausentes.');
  }
  return save;
}

export function isValidSaveId(id) {
  return typeof id === 'string' && SAVE_ID_PATTERN.test(id);
}

/** Gera um id de save legível a partir do nome da cidade. */
export function makeSaveId(name) {
  const slug = String(name || 'cidade')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'cidade';
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${slug}-${suffix}`;
}

// ---------------------------------------------------------------------------
// "Código de save": o save inteiro em uma linha de texto, para copiar/colar
// ---------------------------------------------------------------------------

export function encodeSaveCode(save) {
  const bytes = new TextEncoder().encode(JSON.stringify(save));
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return SAVE_CODE_PREFIX + btoa(binary);
}

export function decodeSaveCode(code) {
  const trimmed = String(code || '').trim();
  if (!trimmed.startsWith(SAVE_CODE_PREFIX)) {
    throw new SaveError('INVALID_CODE', 'Código de save inválido.');
  }
  try {
    const binary = atob(trimmed.slice(SAVE_CODE_PREFIX.length));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    throw new SaveError('INVALID_CODE', 'Código de save inválido.');
  }
}

// ---------------------------------------------------------------------------
// Codificação do estado
// ---------------------------------------------------------------------------

// O mapa é a maior parte do save e tem longas sequências de tiles iguais,
// então ele é gravado com run-length encoding: [qtd, tile, qtd, tile, ...].
function encodeState(state) {
  const data = structuredClone(state);
  data.map.tiles = rleEncode(state.map.tiles);
  data.map.encoding = 'rle';
  return data;
}

function decodeState(data) {
  const state = structuredClone(data);
  if (state.map.encoding === 'rle') {
    state.map.tiles = rleDecode(state.map.tiles, state.map.width * state.map.height);
  } else {
    state.map.tiles = Uint8Array.from(state.map.tiles);
  }
  delete state.map.encoding;
  return state;
}

export function rleEncode(tiles) {
  const out = [];
  let i = 0;
  while (i < tiles.length) {
    const value = tiles[i];
    let run = 1;
    while (i + run < tiles.length && tiles[i + run] === value) run++;
    out.push(run, value);
    i += run;
  }
  return out;
}

export function rleDecode(runs, expectedLength) {
  if (!Array.isArray(runs) || runs.length % 2 !== 0) {
    throw new SaveError('INVALID_SHAPE', 'Mapa do save corrompido.');
  }
  const tiles = new Uint8Array(expectedLength);
  let pos = 0;
  for (let i = 0; i < runs.length; i += 2) {
    const run = runs[i];
    const value = runs[i + 1];
    if (!Number.isInteger(run) || run < 1 || pos + run > expectedLength) {
      throw new SaveError('INVALID_SHAPE', 'Mapa do save corrompido.');
    }
    tiles.fill(value, pos, pos + run);
    pos += run;
  }
  if (pos !== expectedLength) {
    throw new SaveError('INVALID_SHAPE', 'Mapa do save com tamanho inesperado.');
  }
  return tiles;
}

function summarize(state) {
  return {
    population: state.stats.population,
    money: state.economy.money,
    date: { ...state.time },
  };
}

function migrate(save) {
  let current = save;
  while (current.version < SAVE_VERSION) {
    const step = MIGRATIONS[current.version];
    if (!step) {
      throw new SaveError('NO_MIGRATION', `Não há migração do formato ${current.version}.`);
    }
    current = step(structuredClone(current));
  }
  return current;
}

// FNV-1a 32 bits: rápido, síncrono e igual no navegador e no Node.
// Não é segurança, só detecção de corrupção.
export function checksum(data) {
  const text = JSON.stringify(data);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
