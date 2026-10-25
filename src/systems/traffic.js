// Trânsito: quantos carros há em cada tile de rua e quanto isso atrasa quem
// passa por ali.
//
// A cada tick, a ocupação é contada a partir das posições dos cidadãos em
// viagem (que estão no estado): assim tudo aqui é derivado, e carregar um save
// no meio do trânsito continua igual. Cada carro conta 1; quem vai de ônibus
// conta TRAFFIC.busShare (o ônibus leva muitos); metrô, VLT e BRT não ocupam
// as ruas dos carros.
//
// Velocidade num tile = velocidade do tipo de rua (ROAD_TYPES) ÷
//   (1 + slowdown × excesso), com excesso = max(0, ocupação ÷ capacidade − 1).

import { ROAD_TYPES, TRAFFIC } from '../world/catalog.js';
import { mod } from './mods.js';

/** Capacidade de um tile de rua do tipo `type` (carros ao mesmo tempo). */
export function roadCapacity(rt, type) {
  return ROAD_TYPES[type].capacity * mod(rt, 'roadCapacity');
}

/** Velocidade do tipo de rua, com os modificadores (ex.: onda verde nas avenidas). */
export function roadSpeed(rt, type) {
  return ROAD_TYPES[type].speed * mod(rt, `speed.${ROAD_TYPES[type].id}`);
}

/** Quanto um viajante pesa na rua (0 para quem anda em trilho ou corredor). */
function weightOf(c) {
  if (!c.mode) return 1;
  return TRAFFIC.modes[c.mode].ignoresTraffic ? 0 : TRAFFIC.busShare;
}

/**
 * Conta a ocupação de cada tile de rua agora. Usa um Float32Array reaproveitado
 * e a lista dos tiles tocados, para zerar só eles na próxima vez.
 */
export function countOccupancy(state, rt) {
  const { width } = state.map;
  const n = width * state.map.height;
  if (!rt.occupancy || rt.occupancy.length !== n) {
    rt.occupancy = new Float32Array(n);
    rt.occupied = [];
  }
  const occ = rt.occupancy;
  for (const t of rt.occupied) occ[t] = 0;
  rt.occupied.length = 0;
  const road = state.map.road;
  for (const id of rt.movers) {
    const c = rt.citizenById.get(id);
    const w = weightOf(c);
    if (!w) continue;
    const t = Math.floor(c.y) * width + Math.floor(c.x);
    if (ROAD_TYPES[road[t]]?.pedestrian) continue; // a pé, no calçadão
    if (occ[t] === 0) rt.occupied.push(t);
    occ[t] += w;
  }
  // Turistas andando de carro.
  for (const id of rt.visitorMovers ?? []) {
    const v = rt.visitorById.get(id);
    const t = Math.floor(v.y) * width + Math.floor(v.x);
    if (ROAD_TYPES[road[t]]?.pedestrian) continue;
    if (occ[t] === 0) rt.occupied.push(t);
    occ[t] += 1;
  }
  return occ;
}

/** Fator de velocidade (0 a 1) pelo engarrafamento no tile. */
export function congestionFactor(rt, tile, type) {
  const excess = Math.max(0, rt.occupancy[tile] / roadCapacity(rt, type) - 1);
  return 1 / (1 + TRAFFIC.slowdown * excess * mod(rt, 'congestion'));
}

/**
 * Mapa de trânsito (só para a tela): ocupação ÷ capacidade em cada rua,
 * suavizada hora a hora. 1 = livre, 0 = parado. Não entra na simulação.
 */
export function updateTrafficMap(state, rt) {
  const { road } = state.map;
  let map = rt.trafficMap;
  if (!map || map.length !== road.length) {
    map = rt.trafficMap = new Float32Array(road.length).fill(NaN);
  }
  const occ = countOccupancy(state, rt);
  for (let t = 0; t < road.length; t++) {
    if (!road[t]) {
      map[t] = NaN;
      continue;
    }
    const load = Math.min(1, occ[t] / roadCapacity(rt, road[t]) / 2);
    const now = 1 - load;
    map[t] = Number.isNaN(map[t]) ? now : map[t] * 0.6 + now * 0.4;
  }
}
