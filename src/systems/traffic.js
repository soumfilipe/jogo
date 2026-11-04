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

/**
 * Velocidade e capacidade de cada tipo de rua, com os modificadores, numa
 * tabela por tipo. Os modificadores só mudam quando rt.mods é refeito (ver
 * systems/mods.js), então a tabela é guardada até lá: assim o movimento de
 * milhares de carros por minuto não monta textos nem consulta mapas.
 */
export function roadTables(rt) {
  let t = rt.roadTables;
  if (t && t.mods === rt.mods) return t;
  const speed = [];
  const capacity = [];
  const capMod = mod(rt, 'roadCapacity');
  for (const [value, type] of Object.entries(ROAD_TYPES)) {
    speed[value] = type.speed * mod(rt, `speed.${type.id}`);
    capacity[value] = type.capacity * capMod;
  }
  t = rt.roadTables = { mods: rt.mods, speed, capacity, congestion: mod(rt, 'congestion') };
  return t;
}

/** Capacidade de um tile de rua do tipo `type` (carros ao mesmo tempo). */
export function roadCapacity(rt, type) {
  return roadTables(rt).capacity[type];
}

/** Velocidade do tipo de rua, com os modificadores (ex.: onda verde nas avenidas). */
export function roadSpeed(rt, type) {
  return roadTables(rt).speed[type];
}

// Tipos de rua só de pedestres (calçadão), por valor do tipo.
const PEDESTRIAN = new Uint8Array(256);
for (const [value, type] of Object.entries(ROAD_TYPES)) if (type.pedestrian) PEDESTRIAN[value] = 1;

// Quanto um viajante pesa na rua, por modo de transporte (0 para quem anda
// em trilho, corredor ou a pé); sem modo (carro) pesa 1.
const MODE_WEIGHT = new Map(Object.entries(TRAFFIC.modes).map(([id, m]) => [id, m.ignoresTraffic ? 0 : TRAFFIC.busShare]));

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
  const occupied = rt.occupied;
  for (let i = 0; i < occupied.length; i++) occ[occupied[i]] = 0;
  occupied.length = 0;
  const road = state.map.road;
  for (const c of rt.movers.citizens()) {
    const mode = c.mode;
    const w = mode ? MODE_WEIGHT.get(mode) : 1;
    if (!w) continue;
    const t = Math.floor(c.y) * width + Math.floor(c.x);
    if (PEDESTRIAN[road[t]] === 1) continue; // a pé, no calçadão
    if (occ[t] === 0) occupied.push(t);
    occ[t] += w;
  }
  // Turistas andando de carro.
  for (const id of rt.visitorMovers ?? []) {
    const v = rt.visitorById.get(id);
    const t = Math.floor(v.y) * width + Math.floor(v.x);
    if (PEDESTRIAN[road[t]] === 1) continue;
    if (occ[t] === 0) occupied.push(t);
    occ[t] += 1;
  }
  return occ;
}

/** Fator de velocidade (0 a 1) pelo engarrafamento no tile. */
export function congestionFactor(rt, tile, type) {
  const t = roadTables(rt);
  const excess = Math.max(0, rt.occupancy[tile] / t.capacity[type] - 1);
  return 1 / (1 + TRAFFIC.slowdown * excess * t.congestion);
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
  const { capacity } = roadTables(rt);
  for (let t = 0; t < road.length; t++) {
    if (!road[t]) {
      map[t] = NaN;
      continue;
    }
    const load = Math.min(1, occ[t] / capacity[road[t]] / 2);
    const now = 1 - load;
    map[t] = Number.isNaN(map[t]) ? now : map[t] * 0.6 + now * 0.4;
  }
}
