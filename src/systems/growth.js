// Crescimento: prédios surgem em tiles zoneados com acesso a estrada quando
// há demanda, sobem de nível quando estão lotados num terreno valorizado,
// e moradores se mudam para casas com vaga.

import {
  BUILDINGS, DAYS_BETWEEN_UPGRADES, LAND_VALUE_FOR_LEVEL, LARGE_BUILDINGS, LEVELS, MAX_LEVEL, ZONE,
} from '../world/catalog.js';
import { addBuilding, findAccessRoad, vacancies } from '../world/runtime.js';
import { consumption, isServed, RESOURCES, reserve, spare } from './utilities.js';
import { chance, pick, randomInt } from '../core/rng.js';
import { TICKS_PER_DAY } from '../core/time.js';
import { createCitizen } from '../agents/citizens.js';
import { isBuildable } from '../world/world.js';

const DEMAND_KEY = {
  [ZONE.RESIDENTIAL]: 'residential',
  [ZONE.COMMERCIAL]: 'commercial',
  [ZONE.INDUSTRIAL]: 'industrial',
};
const GROW_CHANCE = 0.08;
const LARGE_CHANCE = 0.3;
// Prédios grandes só aparecem depois que a cidade tem este tamanho.
const LARGE_MIN_POPULATION = 300;
const UPGRADE_CHANCE = 0.15;
const MAX_MOVE_IN_PER_HOUR = 12;

export function capacity(info) {
  return info.residents || info.jobs;
}

/** Valor do terreno exigido para um prédio grande: o mesmo do nível 2. */
function largeLandValue(zone) {
  return LAND_VALUE_FOR_LEVEL[zone][2];
}

export function growBuildings(state, rt) {
  const remaining = { ...rt.demand };
  const { zone, road } = state.map;
  const total = zone.length;
  const allowLarge = rt.stats.population >= LARGE_MIN_POPULATION;
  // Começa num ponto aleatório para não favorecer o canto do mapa.
  const start = randomInt(state.rng, 0, total - 1);

  for (let i = 0; i < total; i++) {
    const tile = (start + i) % total;
    const z = zone[tile];
    if (!isFreeLot(state, rt, tile)) continue;
    const key = DEMAND_KEY[z];
    if (remaining[key] <= 0) continue;
    const access = findAccessRoad(state, rt, tile);
    if (access < 0) continue;
    // Só cresce onde a rede tem energia e água sobrando para o prédio novo.
    if (!fits(state, rt, access, consumption(BUILDINGS[LEVELS[z][1][0]]))) continue;
    if (!chance(state.rng, GROW_CHANCE)) continue;

    let type = pick(state.rng, LEVELS[z][1]);
    const large = pick(state.rng, LARGE_BUILDINGS[z]);
    if (
      allowLarge &&
      remaining[key] >= Math.min(capacity(BUILDINGS[large]) / 4, 8) &&
      rt.landValue[tile] >= largeLandValue(z) &&
      isFreeBlock(state, rt, tile, BUILDINGS[large].size, z) &&
      fits(state, rt, access, consumption(BUILDINGS[large])) &&
      chance(state.rng, LARGE_CHANCE)
    ) {
      type = large;
    }
    addBuilding(state, rt, type, tile);
    reserve(state, rt, access, consumption(BUILDINGS[type]));
    remaining[key] -= capacity(BUILDINGS[type]);
  }
}

/**
 * Sobe de nível prédios 1x1 lotados, com terreno valorizado, desde que a
 * demanda da zona não seja negativa. O upgrade não "gasta" demanda: as vagas
 * ou moradias novas é que puxam o resto da cidade a crescer junto.
 */
export function upgradeBuildings(state, rt) {
  const tick = state.time.tick;

  for (const b of state.buildings) {
    const info = BUILDINGS[b.type];
    if (info.utility || info.size !== 1 || info.level >= MAX_LEVEL) continue;
    if (tick - (b.upgradedAt ?? b.builtAt) < DAYS_BETWEEN_UPGRADES * TICKS_PER_DAY) continue;
    if (rt.demand[DEMAND_KEY[info.zone]] < 0) continue;

    if (b.abandoned !== undefined || !isServed(rt, b)) continue;
    const occupied = info.residents ? rt.residents.get(b.id).size : rt.workers.get(b.id).size;
    if (occupied < capacity(info)) continue;
    const next = info.level + 1;
    if (rt.landValue[b.tile] < LAND_VALUE_FOR_LEVEL[info.zone][next]) continue;
    // O nível seguinte consome mais: precisa caber na rede.
    const access = rt.access.get(b.id);
    const nextNeed = consumption(BUILDINGS[LEVELS[info.zone][next][0]]);
    const now = consumption(info);
    const extra = { power: nextNeed.power - now.power, water: nextNeed.water - now.water };
    if (!fits(state, rt, access, extra)) continue;
    if (!chance(state.rng, UPGRADE_CHANCE)) continue;

    reserve(state, rt, access, extra);
    b.type = pick(state.rng, LEVELS[info.zone][next]);
    b.upgradedAt = tick;
    rt.mapVersion++;
  }
}

/** O que falta para o prédio subir de nível (para o painel de inspeção). */
export function upgradeBlockers(state, rt, b) {
  const info = BUILDINGS[b.type];
  if (info.utility || info.size !== 1 || info.level >= MAX_LEVEL) return null;
  const next = info.level + 1;
  const needed = LAND_VALUE_FOR_LEVEL[info.zone][next];
  const occupied = info.residents ? rt.residents.get(b.id).size : rt.workers.get(b.id).size;
  const blockers = [];
  const service = rt.service?.get(b.id);
  if (service && !service.power) blockers.push('energia');
  if (service && !service.water) blockers.push('água');
  if (occupied < capacity(info)) blockers.push(info.residents ? 'ficar lotado de moradores' : 'ficar com todas as vagas preenchidas');
  if (rt.landValue[b.tile] < needed) {
    blockers.push(`valor do terreno ${pct(needed)} (agora ${pct(rt.landValue[b.tile])})`);
  }
  if (rt.demand[DEMAND_KEY[info.zone]] < 0) blockers.push('demanda na zona');
  return { next, blockers };
}

const pct = (v) => `${Math.round(v * 100)}%`;

function fits(state, rt, access, need) {
  return RESOURCES.every((res) => need[res] <= 0 || spare(state, rt, access, res) >= need[res]);
}

function isFreeLot(state, rt, tile, z = state.map.zone[tile]) {
  return (
    z !== ZONE.NONE &&
    state.map.zone[tile] === z &&
    !state.map.road[tile] &&
    !rt.buildingAt[tile] &&
    isBuildable(state, tile)
  );
}

function isFreeBlock(state, rt, tile, size, z) {
  const { width, height } = state.map;
  const x = tile % width;
  const y = (tile - x) / width;
  if (x + size > width || y + size > height) return false;
  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) {
      if (!isFreeLot(state, rt, tile + dy * width + dx, z)) return false;
    }
  }
  return true;
}

export function moveIn(state, rt) {
  let arrivals = Math.min(rt.demand.attraction, MAX_MOVE_IN_PER_HOUR);
  if (arrivals <= 0) return;
  for (const b of state.buildings) {
    if (arrivals <= 0) break;
    if (vacancies(rt, b) <= 0 || rt.access.get(b.id) < 0 || !isServed(rt, b)) continue;
    createCitizen(state, rt, b);
    arrivals--;
  }
}
