// Listas de objetos com os mesmos campos (cidadãos, prédios) gravadas em
// colunas: os nomes dos campos aparecem uma vez só, e cada coluna usa a
// forma mais curta para os valores dela.
//
// { "$table": n, "columns": { campo: coluna, ... } }, e cada coluna é:
//   { "v": [...] }                  valores como estão
//   { "delta": [...] }              inteiros em ordem crescente (ids): diferenças
//   { "dict": [...], "idx": [...] } textos que se repetem (turno, estado)
//   { "moves": [...] }              rotas (lista de tiles) como passos, ver encodeMoves
// mais "missing": [linhas] quando o campo não existe em algumas linhas.

import { SaveError } from './format.js';

/** `moves`: { campo: largura do mapa } dos campos que são rotas. */
export function encodeTable(rows, { moves = {} } = {}) {
  const keys = [];
  const seen = new Set();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        keys.push(key);
      }
    }
  }
  const columns = {};
  for (const key of keys) {
    const missing = [];
    const values = rows.map((row, i) => {
      if (key in row) return row[key];
      missing.push(i);
      return null;
    });
    const col = key in moves ? { moves: values.map((v) => (v === null ? null : encodeMoves(v, moves[key]))) } : encodeColumn(values);
    if (missing.length) col.missing = missing;
    columns[key] = col;
  }
  return { $table: rows.length, columns };
}

export function decodeTable(table, { moves = {} } = {}) {
  if (!table || !Number.isInteger(table.$table) || !table.columns || typeof table.columns !== 'object') {
    throw new SaveError('INVALID_SHAPE', 'Lista do save corrompida.');
  }
  const n = table.$table;
  const rows = Array.from({ length: n }, () => ({}));
  for (const [key, col] of Object.entries(table.columns)) {
    const values = decodeColumn(col, n, moves[key]);
    const missing = new Set(col.missing || []);
    for (let i = 0; i < n; i++) if (!missing.has(i)) rows[i][key] = values[i];
  }
  return rows;
}

function encodeColumn(values) {
  if (values.length > 1 && values.every((v, i) => Number.isInteger(v) && (i === 0 || v >= values[i - 1]))) {
    return { delta: values.map((v, i) => (i === 0 ? v : v - values[i - 1])) };
  }
  if (values.every((v) => v === null || typeof v === 'string')) {
    const dict = [...new Set(values)];
    // Só compensa quando os textos se repetem bastante.
    if (dict.length * 4 <= values.length) {
      const index = new Map(dict.map((v, i) => [v, i]));
      return { dict, idx: values.map((v) => index.get(v)) };
    }
  }
  return { v: values };
}

function decodeColumn(col, n, width) {
  let values;
  if (Array.isArray(col.v)) {
    values = col.v;
  } else if (Array.isArray(col.delta)) {
    values = [];
    let acc = 0;
    for (const d of col.delta) values.push((acc += d));
  } else if (Array.isArray(col.dict) && Array.isArray(col.idx)) {
    values = col.idx.map((i) => col.dict[i]);
  } else if (Array.isArray(col.moves) && Number.isInteger(width)) {
    values = col.moves.map((m) => (m === null ? null : decodeMoves(m, width)));
  }
  if (!values || values.length !== n) throw new SaveError('INVALID_SHAPE', 'Lista do save corrompida.');
  return values;
}

// Rota como texto: o primeiro tile em número e, depois, uma letra por passo
// para um vizinho (r = +1, l = -1, d = +largura, u = -largura). Saltos maiores
// (do lote até a rua) vão como número seguido de vírgula.
// Ex.: [19772, 19516, 19517, 19518] -> "19772,urr"
const STEPS = { r: 1, l: -1 };

export function encodeMoves(path, width) {
  let out = '';
  for (let i = 0; i < path.length; i++) {
    const d = i === 0 ? null : path[i] - path[i - 1];
    if (d === 1) out += 'r';
    else if (d === -1) out += 'l';
    else if (d === width) out += 'd';
    else if (d === -width) out += 'u';
    else out += `${path[i]},`;
  }
  return out;
}

export function decodeMoves(text, width) {
  if (typeof text !== 'string') throw new SaveError('INVALID_SHAPE', 'Rota do save corrompida.');
  const path = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch >= '0' && ch <= '9') {
      const end = text.indexOf(',', i);
      if (end < 0) throw new SaveError('INVALID_SHAPE', 'Rota do save corrompida.');
      path.push(Number(text.slice(i, end)));
      i = end + 1;
      continue;
    }
    const step = STEPS[ch] ?? (ch === 'd' ? width : ch === 'u' ? -width : null);
    if (step === null || path.length === 0) throw new SaveError('INVALID_SHAPE', 'Rota do save corrompida.');
    path.push(path[path.length - 1] + step);
    i++;
  }
  return path;
}
