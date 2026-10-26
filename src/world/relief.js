// Relevo: a altura fica nos cantos dos tiles (state.map.elevation, com
// (W+1)×(H+1) cantos). O canto (cx, cy) é o ponto (cx, cy) do mundo; o tile
// (x, y) tem os cantos (x, y), (x+1, y), (x+1, y+1) e (x, y+1).
//
// Cantos vizinhos na horizontal ou vertical diferem no máximo RELIEF.maxStep
// (ver constrain). A água fica no nível 0.

import { BRIDGE, RELIEF, TERRAIN } from './catalog.js';

/** Índice do canto (cx, cy). */
export const cornerIndex = (map, cx, cy) => cy * (map.width + 1) + cx;

/** Alturas dos 4 cantos do tile: [noroeste, nordeste, sudeste, sudoeste]. */
export function cornerHeights(map, tile) {
  const e = map.elevation;
  const W = map.width + 1;
  const x = tile % map.width;
  const y = (tile - x) / map.width;
  if (!e) return [0, 0, 0, 0];
  const i = y * W + x;
  return [e[i], e[i + 1], e[i + W + 1], e[i + W]];
}

/** Declive do tile: canto mais alto menos o mais baixo. */
export function slopeOf(map, tile) {
  const c = cornerHeights(map, tile);
  return Math.max(c[0], c[1], c[2], c[3]) - Math.min(c[0], c[1], c[2], c[3]);
}

/** Encosta íngreme demais para rua ou prédio. */
export const isSteep = (map, tile) => slopeOf(map, tile) > RELIEF.maxBuildSlope;

/** Altura média do tile. */
export function tileHeight(map, tile) {
  const c = cornerHeights(map, tile);
  return (c[0] + c[1] + c[2] + c[3]) / 4;
}

/**
 * Base de um prédio num lote size×size: [canto mais baixo, base]. A base é a
 * altura média dos cantos (o prédio fica meio encaixado no morro); em lote
 * inclinado, uma fundação desce da base até o canto mais baixo.
 */
export function lotBase(map, tile, size = 1) {
  if (!map.elevation) return [0, 0];
  const W = map.width + 1;
  const x = tile % map.width;
  const y = (tile - x) / map.width;
  let low = Infinity;
  let sum = 0;
  for (let dy = 0; dy <= size; dy++) {
    for (let dx = 0; dx <= size; dx++) {
      const h = map.elevation[(y + dy) * W + x + dx];
      low = Math.min(low, h);
      sum += h;
    }
  }
  return [low, Math.round(sum / ((size + 1) * (size + 1)))];
}

/** Altura (contínua) do ponto (x, y) do mundo: interpola os cantos do tile. */
export function heightAt(map, x, y) {
  const e = map.elevation;
  if (!e) return 0;
  const tx = Math.min(map.width - 1, Math.max(0, Math.floor(x)));
  const ty = Math.min(map.height - 1, Math.max(0, Math.floor(y)));
  const fx = Math.min(1, Math.max(0, x - tx));
  const fy = Math.min(1, Math.max(0, y - ty));
  const W = map.width + 1;
  const i = ty * W + tx;
  const top = e[i] + (e[i + 1] - e[i]) * fx;
  const bottom = e[i + W] + (e[i + W + 1] - e[i + W]) * fx;
  return top + (bottom - top) * fy;
}

/** Altura do que se pisa no ponto: o chão, ou o tabuleiro da ponte sobre a água. */
export function surfaceAt(map, x, y) {
  const h = heightAt(map, x, y);
  const t = Math.floor(y) * map.width + Math.floor(x);
  return map.road?.[t] && map.terrain?.[t] === TERRAIN.WATER ? h + BRIDGE.deck : h;
}

/**
 * Faz valer o degrau máximo entre cantos vizinhos baixando os que passam
 * (nunca sobe nada). `fixed` (opcional): cantos que não podem mudar — os
 * vizinhos se ajustam a eles, subindo se preciso. Varre até estabilizar.
 */
export function constrain(map, fixed = null) {
  const e = map.elevation;
  const W = map.width + 1;
  const H = map.height + 1;
  const step = RELIEF.maxStep;
  for (let pass = 0; pass < 64; pass++) {
    let changed = false;
    const fix = (i, j) => {
      // Sem cantos fixos: baixa o mais alto. Com fixo, mexe no outro.
      if (e[i] > e[j] + step) {
        if (fixed?.[i] && !fixed[j]) e[j] = e[i] - step;
        else e[i] = e[j] + step;
        changed = true;
      }
    };
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (x > 0) (fix(i, i - 1), fix(i - 1, i));
        if (y > 0) (fix(i, i - W), fix(i - W, i));
      }
    }
    if (!changed) return;
  }
}

/**
 * Cidades de saves sem relevo: os cantos dos tiles com rua, zona, parque ou
 * prédio (`lots`: [{ tile, size }]) vão para o nível 0 e o resto do terreno
 * desce em rampa até eles. Assim a cidade antiga continua plana.
 */
export function flattenDeveloped(map, lots) {
  const W = map.width + 1;
  const fixed = new Uint8Array(map.elevation.length);
  const flat = (tile, size = 1) => {
    const x = tile % map.width;
    const y = (tile - x) / map.width;
    for (let dy = 0; dy <= size; dy++) {
      for (let dx = 0; dx <= size; dx++) {
        const i = (y + dy) * W + x + dx;
        map.elevation[i] = 0;
        fixed[i] = 1;
      }
    }
  };
  for (let t = 0; t < map.width * map.height; t++) if (map.road[t] || map.zone[t] || map.park?.[t]) flat(t);
  for (const { tile, size } of lots) flat(tile, size);
  constrain(map, fixed);
}
