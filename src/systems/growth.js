// Crescimento: prédios surgem em tiles zoneados com acesso a estrada quando
// há demanda, sobem de nível quando estão lotados num terreno valorizado,
// depois ganham andares (os tipos `tall`) até o limite da densidade da zona,
// e moradores se mudam para casas com vaga.

import {
  BUILDINGS, DAYS_BETWEEN_UPGRADES, DENSITY, DENSITY_INFO, LAND_VALUE_FOR_LEVEL, LARGE_BUILDINGS, LEVELS,
  MAX_LEVEL, ZONE, buildingFloors, capacityOf, landValueForFloor, maxFloorsFor,
} from '../world/catalog.js';
import { addBuilding, findAccessRoad, touchMap, vacancies } from '../world/runtime.js';
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
      allowsLarge(state, tile, BUILDINGS[large]) &&
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
 * Faz crescer prédios lotados num terreno valorizado, desde que a demanda da
 * zona não seja negativa: 1x1 sobem de nível e, no nível máximo, os tipos
 * `tall` ganham um andar por vez, até o limite da densidade da zona. Crescer
 * não "gasta" demanda: as vagas ou moradias novas é que puxam o resto da
 * cidade a crescer junto.
 */
export function upgradeBuildings(state, rt) {
  const tick = state.time.tick;

  for (const b of state.buildings) {
    const step = nextStep(state, b);
    if (!step || step.limited) continue;
    const info = BUILDINGS[b.type];
    if (tick - (b.upgradedAt ?? b.builtAt) < DAYS_BETWEEN_UPGRADES * TICKS_PER_DAY) continue;
    if (rt.demand[DEMAND_KEY[info.zone]] < 0) continue;

    if (b.abandoned !== undefined || !isServed(rt, b)) continue;
    if (occupied(rt, b) < capacityOf(b)) continue;
    if (rt.landValue[b.tile] < step.landValue) continue;
    // O passo seguinte consome mais: precisa caber na rede.
    const access = rt.access.get(b.id);
    const now = consumption(info, capacityOf(b));
    const extra = { power: step.need.power - now.power, water: step.need.water - now.water };
    if (!fits(state, rt, access, extra)) continue;
    if (!chance(state.rng, UPGRADE_CHANCE)) continue;

    reserve(state, rt, access, extra);
    if (step.floor) {
      b.floors = step.floor;
    } else {
      b.type = pick(state.rng, LEVELS[info.zone][step.level]);
      delete b.floors;
    }
    b.upgradedAt = tick;
    touchMap(rt, b.tile, info.size);
  }
}

/**
 * Próximo passo de crescimento do prédio:
 *   { level, label, landValue, need }   sobe para o nível `level`
 *   { floor, label, landValue, need }   ganha o andar número `floor`
 *   { limited: densidade }              só cresceria numa densidade maior
 *   null                                chegou ao máximo
 */
function nextStep(state, b) {
  const info = BUILDINGS[b.type];
  if (info.utility) return null;
  const density = densityOf(state, info, b.tile);
  if (info.size === 1 && info.level < MAX_LEVEL) {
    const level = info.level + 1;
    if (level > DENSITY_INFO[density].maxLevel) return { limited: DENSITY_INFO[density] };
    return {
      level,
      label: `nível ${level}`,
      landValue: LAND_VALUE_FOR_LEVEL[info.zone][level],
      need: consumption(BUILDINGS[LEVELS[info.zone][level][0]]),
    };
  }
  if (!info.tall) return null;
  const floor = buildingFloors(b) + 1;
  if (floor > maxFloorsFor(info, density)) {
    return floor <= maxFloorsFor(info, DENSITY.HIGH) ? { limited: DENSITY_INFO[density] } : null;
  }
  return {
    floor,
    label: `${floor}º andar`,
    landValue: landValueForFloor(info, floor),
    need: consumption(info, capacityOf(b) + info.perFloor),
  };
}

/**
 * O que falta para o prédio crescer (para o painel de inspeção): null no
 * máximo, { limited } quando só a densidade da zona impede, ou
 * { next, label, blockers }.
 */
export function upgradeBlockers(state, rt, b) {
  const step = nextStep(state, b);
  if (!step || step.limited) return step;
  const info = BUILDINGS[b.type];
  const blockers = [];
  const service = rt.service?.get(b.id);
  if (service && !service.power) blockers.push('energia');
  if (service && !service.water) blockers.push('água');
  if (occupied(rt, b) < capacityOf(b)) blockers.push(info.residents ? 'ficar lotado de moradores' : 'ficar com todas as vagas preenchidas');
  if (rt.landValue[b.tile] < step.landValue) {
    blockers.push(`valor do terreno ${pct(step.landValue)} (agora ${pct(rt.landValue[b.tile])})`);
  }
  if (rt.demand[DEMAND_KEY[info.zone]] < 0) blockers.push('demanda na zona');
  return { next: step.level ?? step.floor, label: step.label, blockers };
}

const occupied = (rt, b) => (BUILDINGS[b.type].residents ? rt.residents.get(b.id) : rt.workers.get(b.id)).size;

/** Densidade que vale para um prédio no tile: a indústria não tem limite. */
function densityOf(state, info, tile) {
  return info.zone === ZONE.INDUSTRIAL ? DENSITY.HIGH : state.map.density[tile];
}

/** Prédios grandes só nascem onde todo o terreno permite o nível máximo. */
function allowsLarge(state, tile, info) {
  const width = state.map.width;
  for (let dy = 0; dy < info.size; dy++) {
    for (let dx = 0; dx < info.size; dx++) {
      const density = densityOf(state, info, tile + dy * width + dx);
      if (DENSITY_INFO[density].maxLevel < MAX_LEVEL) return false;
    }
  }
  return true;
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
