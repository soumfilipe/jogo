// Valor do terreno e poluição, de 0 a 1 por tile. São derivados do estado
// (ficam no runtime) e recalculados toda hora, logo antes de serem usados,
// para que carregar um save não mude o resultado da simulação.
//
// Valor do terreno sobe com natureza por perto (água, floresta), comércio
// e movimento (prédios em volta), e cai com a poluição das indústrias e dos
// carros e com o barulho de avenidas e vias expressas.

import { BUILDINGS, DISASTERS, MIXED, RELIEF, ROAD_TYPES, TERRAIN, TRAFFIC, WASTE, ZONE } from '../world/catalog.js';
import { isSteep, tileHeight } from '../world/relief.js';
import { burningTiles } from './disasters.js';
import { mod, utilityPollution } from './mods.js';
import { countOccupancy } from './traffic.js';
import { computeWaste } from './waste.js';
import { computeSanitation } from './sanitation.js';

const NATURE_RADIUS = 4;
const COMMERCE_RADIUS = 8;
const ACTIVITY_RADIUS = 8;
const POLLUTION_RADIUS = 6;
const NOISE_RADIUS = 3;

// Quanto de cada coisa por perto já conta como "máximo".
const NATURE_FULL = 20;
const COMMERCE_FULL = 15;
const ACTIVITY_FULL = 80;
const POLLUTION_FULL = 12;
// Perda máxima de valor pelo barulho das vias, e quanto cada ponto de ruído tira.
const NOISE_MAX = 0.2;
const NOISE_WEIGHT = 0.4;

export function computeLandValue(state, rt) {
  const { width, height, terrain } = state.map;
  const n = width * height;
  const nature = new Float32Array(n);
  const commerce = new Float32Array(n);
  const activity = new Float32Array(n);
  const industry = new Float32Array(n);
  const mixed = new Float32Array(n);
  const view = new Float32Array(n);

  // Rio poluído pelo esgoto vale menos como paisagem (e aparece no mapa de poluição).
  const river = computeSanitation(state, rt).river;
  const parkValue = mod(rt, 'parkValue');
  for (let i = 0; i < n; i++) {
    if (terrain[i] === TERRAIN.WATER) nature[i] = 1 - 0.5 * river;
    // Parque vale mais (e mais ainda na cidade-esponja).
    else if (terrain[i] === TERRAIN.FOREST) nature[i] = state.map.park?.[i] ? 1.6 * parkValue : 1;
    else if (terrain[i] === TERRAIN.SAND) nature[i] = 0.5;
  }
  const industryPollution = mod(rt, 'pollution.industry');
  const farmPollution = mod(rt, 'pollution.farm', 0);
  for (const b of state.buildings) {
    const info = BUILDINGS[b.type];
    // Prédios grandes contam no tile de origem com o peso da área inteira.
    const weight = info.level * info.size * info.size;
    activity[b.tile] += info.size * info.size;
    if (info.zone === ZONE.COMMERCIAL) commerce[b.tile] += weight;
    // Térreo do prédio misto: comércio de bairro, conta pela metade.
    if (info.shop) {
      commerce[b.tile] += weight / 2;
      mixed[b.tile] = 1;
    }
    if (info.zone === ZONE.INDUSTRIAL) industry[b.tile] += weight * industryPollution;
    // Fazendas só poluem com adubo e agrotóxicos.
    if (info.zone === ZONE.RURAL) industry[b.tile] += weight * farmPollution;
    if (info.utility) industry[b.tile] += utilityPollution(rt, b.type);
  }
  // Fumaça das queimadas.
  for (const t of burningTiles(state)) industry[t] += DISASTERS.wildfire.smoke;
  // Lixo sem coleta polui em volta.
  const waste = computeWaste(state, rt);
  for (const b of state.buildings) {
    const s = waste.status.get(b.id);
    if (s && s.waste > 0 && s.by === null) industry[b.tile] += WASTE.pollution * s.waste;
  }
  // Carros na rua agora (contados das posições em viagem, que estão no estado).
  const occupancy = countOccupancy(state, rt);
  const carPollution = TRAFFIC.carPollution * mod(rt, 'pollution.traffic');
  const noise = new Float32Array(n);
  const road = state.map.road;
  for (let i = 0; i < n; i++) {
    if (!road[i]) continue;
    const type = ROAD_TYPES[road[i]];
    // Engarrafado não polui sem limite: conta até o dobro da capacidade da via.
    industry[i] += Math.min(occupancy[i], 2 * type.capacity) * carPollution;
    noise[i] = type.noise;
    // Calçadão: o movimento de pedestres valoriza como comércio.
    if (type.commerce) commerce[i] += type.commerce;
  }
  // Tecnologias que valorizam o terreno (em toda a cidade ou numa zona).
  const bonusAll = mod(rt, 'landValue.all', 0);
  const bonusCommercial = mod(rt, 'landValue.commercial', 0);
  const zone = state.map.zone;
  // Sinal de celular: torres valorizam o terreno no raio delas.
  const signal = new Float32Array(n);
  for (const b of state.buildings) {
    const s = BUILDINGS[b.type].utility?.signal;
    if (!s || rt.workers.get(b.id).size === 0) continue;
    const bx = b.tile % width;
    const by = (b.tile - bx) / width;
    for (let y = Math.max(0, by - s.radius); y <= Math.min(height - 1, by + s.radius); y++) {
      for (let x = Math.max(0, bx - s.radius); x <= Math.min(width - 1, bx + s.radius); x++) {
        if (Math.abs(x - bx) + Math.abs(y - by) <= s.radius) signal[y * width + x] = Math.max(signal[y * width + x], s.landValue);
      }
    }
  }

  const natureSum = boxSum(nature, width, height, NATURE_RADIUS);
  const commerceSum = boxSum(commerce, width, height, COMMERCE_RADIUS);
  const activitySum = boxSum(activity, width, height, ACTIVITY_RADIUS);
  const pollutionSum = boxSum(industry, width, height, POLLUTION_RADIUS);
  const noiseSum = boxSum(noise, width, height, NOISE_RADIUS);
  const noiseMod = mod(rt, 'noise');
  // Uso misto (pesquisa): o terreno perto dos prédios mistos valoriza.
  const bonusMixed = mod(rt, 'mixedLand', 0);
  const mixedSum = bonusMixed ? boxSum(mixed, width, height, MIXED.landRadius) : null;

  const { landValue, pollution } = rt;
  // Mapa de relevo: altura de 0 a 1 (−1 nas encostas íngremes; NaN na água).
  if (!rt.reliefMap || rt.reliefMap.length !== n) rt.reliefMap = new Float32Array(n);
  const relief = rt.reliefMap;
  for (let i = 0; i < n; i++) {
    const water = terrain[i] === TERRAIN.WATER;
    const h = water ? 0 : tileHeight(state.map, i);
    relief[i] = water ? NaN : isSteep(state.map, i) ? -1 : h / RELIEF.maxLevel;
    // Vista do alto valoriza.
    view[i] = RELIEF.viewBonus * Math.min(1, Math.max(0, (h - RELIEF.viewFrom) / 16));
  }
  for (let i = 0; i < n; i++) {
    const p = Math.min(1, pollutionSum[i] / POLLUTION_FULL);
    pollution[i] = terrain[i] === TERRAIN.WATER ? Math.max(p, river) : p;
    const value = 0.25
      + 0.3 * Math.min(1, natureSum[i] / NATURE_FULL)
      + 0.25 * Math.min(1, commerceSum[i] / COMMERCE_FULL)
      + 0.3 * Math.min(1, activitySum[i] / ACTIVITY_FULL)
      - 0.55 * p
      - Math.min(NOISE_MAX, noiseSum[i] * NOISE_WEIGHT) * noiseMod
      + bonusAll
      + signal[i]
      + (zone[i] === ZONE.COMMERCIAL ? bonusCommercial : 0)
      + (mixedSum && mixedSum[i] > 0 ? bonusMixed : 0)
      + view[i];
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
