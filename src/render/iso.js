// Projeção isométrica (2:1). Coordenadas de mundo em tiles (contínuas, o
// tile (x, y) ocupa [x, x+1) x [y, y+1)); coordenadas "iso" em pixels com
// zoom 1, antes da câmera. `h` é a altura do relevo, em níveis
// (RELIEF.px pixels cada um).

import { RELIEF } from '../world/catalog.js';

export const TILE_W = 64;
export const TILE_H = 32;
export const LEVEL_PX = RELIEF.px;

export function worldToIso(x, y, h = 0) {
  return [(x - y) * (TILE_W / 2), (x + y) * (TILE_H / 2) - h * LEVEL_PX];
}

export function isoToWorld(ix, iy) {
  const a = ix / (TILE_W / 2);
  const b = iy / (TILE_H / 2);
  return [(a + b) / 2, (b - a) / 2];
}
