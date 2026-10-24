// Crescimento das florestas: a cada tick, com uma pequena chance, alguns tiles
// sorteados crescem. Mata livre fica mais densa; grama livre encostada numa
// mata já fechada vira mata nova (densidade 1). Só cresce em tile verde sem
// estrada, zona ou prédio.

import { FOREST, TERRAIN } from '../world/catalog.js';
import { chance, randomInt } from '../core/rng.js';
import { touchMap } from '../world/runtime.js';

export function growForests(state, rt) {
  if (!chance(state.rng, FOREST.growChance)) return;
  const { width, height } = state.map;
  const total = width * height;
  const count = randomInt(state.rng, 1, FOREST.tilesPerTick);
  for (let i = 0; i < count; i++) {
    growTile(state, rt, randomInt(state.rng, 0, total - 1));
  }
}

function growTile(state, rt, tile) {
  const { width, height, terrain, forest, road, zone } = state.map;
  if (road[tile] || zone[tile] || rt.buildingAt[tile]) return;

  if (terrain[tile] === TERRAIN.FOREST) {
    if (forest[tile] >= FOREST.maxDensity) return;
    forest[tile]++;
    touchMap(rt, tile);
    return;
  }
  if (terrain[tile] !== TERRAIN.GRASS) return;

  const x = tile % width;
  const y = (tile - x) / width;
  const dense = (t) => terrain[t] === TERRAIN.FOREST && forest[t] >= FOREST.spreadDensity;
  if (
    (x > 0 && dense(tile - 1)) ||
    (x < width - 1 && dense(tile + 1)) ||
    (y > 0 && dense(tile - width)) ||
    (y < height - 1 && dense(tile + width))
  ) {
    terrain[tile] = TERRAIN.FOREST;
    forest[tile] = 1;
    // Os vizinhos também mudam: árvores soltas aparecem na borda da mata nova.
    touchMap(rt, Math.max(0, y - 1) * width + Math.max(0, x - 1), 3);
  }
}
