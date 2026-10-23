// Geração do terreno a partir da semente: ruído de valor em várias oitavas.

import { TERRAIN } from './catalog.js';
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
