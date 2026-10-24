// Natureza na tela: árvores (densidade e tipos) e profundidade da água.
// A densidade da mata vem do estado (state.map.forest, que cresce com o
// tempo); o resto é derivado da semente do mapa e das coordenadas.

import { hash2 } from '../core/rng.js';
import { TERRAIN } from '../world/catalog.js';

// --- Árvores ----------------------------------------------------------------

const PINES = ['#2f6b34', '#2a5f30', '#356f3a', '#24572b'];
const LEAVES = ['#4f8f3f', '#5a9a46', '#44833a', '#68a24c', '#3f7a36'];
const AUTUMN = ['#c98a2e', '#b5652b', '#d4a93a'];
const BUSHES = ['#4d8a3c', '#5b9645', '#447d36'];
export const TRUNK = '#6b4a2b';

/**
 * Árvores de um tile, de trás para frente: { u, v, kind, size, color }.
 * (u, v) é a posição dentro do tile (0 a 1); size é a escala (1 = normal).
 */
export function treesFor(state, x, y) {
  const { width, height, terrain, forest, road, zone } = state.map;
  const tile = y * width + x;
  const seed = state.seed;
  let count = 0;

  if (terrain[tile] === TERRAIN.FOREST) {
    count = Math.max(1, forest[tile]); // 1 a 6 árvores
  } else if (terrain[tile] === TERRAIN.GRASS && !road[tile] && !zone[tile]) {
    // Árvores soltas: mais comuns na borda da mata, raras no campo aberto.
    const nearForest =
      (x > 0 && terrain[tile - 1] === TERRAIN.FOREST) ||
      (x < width - 1 && terrain[tile + 1] === TERRAIN.FOREST) ||
      (y > 0 && terrain[tile - width] === TERRAIN.FOREST) ||
      (y < height - 1 && terrain[tile + width] === TERRAIN.FOREST);
    const r = hash2(x, y, seed + 9);
    if (nearForest ? r < 0.45 : r < 0.025) count = nearForest && r < 0.12 ? 2 : 1;
  }
  if (count === 0) return [];

  const trees = [];
  for (let k = 0; k < count; k++) {
    const h = (s) => hash2(x * 7 + k, y * 13 + k, seed + s);
    const kindRoll = h(1);
    // Mais pinheiros nas matas fechadas, mais copas e arbustos nas bordas.
    const pineShare = count >= 4 ? 0.55 : 0.3;
    const kind = kindRoll < pineShare ? 'pinheiro' : kindRoll < 0.88 ? 'copa' : 'arbusto';
    const palette = kind === 'pinheiro' ? PINES : kind === 'arbusto' ? BUSHES : h(5) < 0.12 ? AUTUMN : LEAVES;
    trees.push({
      u: 0.15 + h(2) * 0.7,
      v: 0.15 + h(3) * 0.7,
      kind,
      size: 0.75 + h(4) * 0.55,
      color: palette[Math.floor(h(6) * palette.length)],
    });
  }
  return trees.sort((a, b) => a.u + a.v - (b.u + b.v));
}

// --- Água -------------------------------------------------------------------

const depthCache = new WeakMap();

/**
 * Profundidade aparente da água (0 = margem, 1 = longe da terra), pela
 * fração de água em volta. Calculada uma vez por mapa: a água não muda.
 */
export function waterDepth(state) {
  const terrain = state.map.terrain;
  let depth = depthCache.get(terrain);
  if (!depth) {
    const { width, height } = state.map;
    depth = new Float32Array(width * height);
    const r = 3;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (terrain[y * width + x] !== TERRAIN.WATER) continue;
        let water = 0;
        let total = 0;
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            total++;
            if (terrain[ny * width + nx] === TERRAIN.WATER) water++;
          }
        }
        depth[y * width + x] = (water / total - 0.5) * 2;
      }
    }
    depthCache.set(terrain, depth);
  }
  return depth;
}

// --- Ruído --------------------------------------------------------------------

export function smoothNoise(x, y, seed) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const sx = fade(x - x0);
  const sy = fade(y - y0);
  const a = hash2(x0, y0, seed);
  const b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed);
  const d = hash2(x0 + 1, y0 + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

const fade = (t) => t * t * (3 - 2 * t);
