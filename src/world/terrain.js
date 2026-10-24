// Geração do terreno a partir da semente: ruído de valor em várias oitavas.

import { FOREST, TERRAIN } from './catalog.js';
import { hash2 } from '../core/rng.js';

export function generateTerrain(width, height, seed) {
  const terrain = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const water = fractalNoise(x, y, seed, 48);
      const forest = fractalNoise(x, y, seed + 7919, 24);
      let t = TERRAIN.GRASS;
      if (water < 0.3) t = TERRAIN.WATER;
      else if (water < 0.33) t = TERRAIN.SAND;
      else if (forest > 0.64) t = TERRAIN.FOREST;
      terrain[y * width + x] = t;
    }
  }
  return terrain;
}

/**
 * Densidade inicial das matas (1 a FOREST.maxDensity; 0 fora delas): suave no
 * espaço, com clareiras e trechos fechados.
 */
export function generateForest(terrain, width, height, seed) {
  const forest = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const tile = y * width + x;
      if (terrain[tile] !== TERRAIN.FOREST) continue;
      const d = valueNoise(x / 7, y / 7, seed + 31) * 0.7 + valueNoise(x / 2.5, y / 2.5, seed + 57) * 0.3;
      forest[tile] = Math.min(FOREST.maxDensity, 1 + Math.floor(d * 5.5));
    }
  }
  return forest;
}

function fractalNoise(x, y, seed, scale) {
  let total = 0;
  let amplitude = 1;
  let norm = 0;
  for (let octave = 0; octave < 4; octave++) {
    total += valueNoise(x / scale, y / scale, seed + octave * 101) * amplitude;
    norm += amplitude;
    amplitude *= 0.5;
    scale /= 2;
  }
  return total / norm;
}

function valueNoise(x, y, seed) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const sx = smooth(x - x0);
  const sy = smooth(y - y0);
  const a = hash2(x0, y0, seed);
  const b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed);
  const d = hash2(x0 + 1, y0 + 1, seed);
  return lerp(lerp(a, b, sx), lerp(c, d, sx), sy);
}

const smooth = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;
