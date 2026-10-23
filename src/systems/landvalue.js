// Valor do terreno e poluição, de 0 a 1 por tile. São derivados do estado
// (ficam no runtime) e recalculados toda hora, logo antes de serem usados,
// para que carregar um save não mude o resultado da simulação.
//
// Valor do terreno sobe com natureza por perto (água, floresta), comércio
// e movimento (prédios em volta), e cai com a poluição das indústrias.

import { BUILDINGS, TERRAIN, ZONE } from '../world/catalog.js';

const NATURE_RADIUS = 4;
const COMMERCE_RADIUS = 8;
const ACTIVITY_RADIUS = 8;
const POLLUTION_RADIUS = 6;

// Quanto de cada coisa por perto já conta como "máximo".
const NATURE_FULL = 20;
const COMMERCE_FULL = 15;
const ACTIVITY_FULL = 80;
const POLLUTION_FULL = 12;

export function computeLandValue(state, rt) {
  const { width, height, terrain } = state.map;
  const n = width * height;
  const nature = new Float32Array(n);
  const commerce = new Float32Array(n);
  const activity = new Float32Array(n);
  const industry = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    if (terrain[i] === TERRAIN.WATER || terrain[i] === TERRAIN.FOREST) nature[i] = 1;
    else if (terrain[i] === TERRAIN.SAND) nature[i] = 0.5;
  }
  for (const b of state.buildings) {
    const info = BUILDINGS[b.type];
    // Prédios grandes contam no tile de origem com o peso da área inteira.
    const weight = info.level * info.size * info.size;
    activity[b.tile] += info.size * info.size;
    if (info.zone === ZONE.COMMERCIAL) commerce[b.tile] += weight;
    if (info.zone === ZONE.INDUSTRIAL) industry[b.tile] += weight;
    if (info.utility) industry[b.tile] += info.utility.pollution;
  }

  const natureSum = boxSum(nature, width, height, NATURE_RADIUS);
  const commerceSum = boxSum(commerce, width, height, COMMERCE_RADIUS);
  const activitySum = boxSum(activity, width, height, ACTIVITY_RADIUS);
  const pollutionSum = boxSum(industry, width, height, POLLUTION_RADIUS);

  const { landValue, pollution } = rt;
  for (let i = 0; i < n; i++) {
    const p = Math.min(1, pollutionSum[i] / POLLUTION_FULL);
    pollution[i] = p;
    const value = 0.25
      + 0.3 * Math.min(1, natureSum[i] / NATURE_FULL)
      + 0.25 * Math.min(1, commerceSum[i] / COMMERCE_FULL)
      + 0.3 * Math.min(1, activitySum[i] / ACTIVITY_FULL)
      - 0.55 * p;
    landValue[i] = Math.min(1, Math.max(0, value));
  }
}

/** Soma de cada quadrado (2r+1)x(2r+1) em volta de cada tile (separável). */
export function boxSum(src, width, height, r) {
  const rows = new Float32Array(src.length);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    let sum = 0;
    for (let x = 0; x <= Math.min(r, width - 1); x++) sum += src[row + x];
    for (let x = 0; x < width; x++) {
      rows[row + x] = sum;
      const add = x + r + 1;
      const drop = x - r;
      if (add < width) sum += src[row + add];
      if (drop >= 0) sum -= src[row + drop];
    }
  }
  const out = new Float32Array(src.length);
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let y = 0; y <= Math.min(r, height - 1); y++) sum += rows[y * width + x];
    for (let y = 0; y < height; y++) {
      out[y * width + x] = sum;
      const add = y + r + 1;
      const drop = y - r;
      if (add < height) sum += rows[add * width + x];
      if (drop >= 0) sum -= rows[drop * width + x];
    }
  }
  return out;
}
