// Crescimento: prédios surgem em tiles zoneados com acesso a estrada quando
// há demanda; moradores se mudam para casas com vaga.

import { BUILDINGS, BUILDING_FOR_ZONE, ZONE } from '../world/catalog.js';
import { addBuilding, findAccessRoad, vacancies } from '../world/runtime.js';
import { chance, randomInt } from '../core/rng.js';
import { createCitizen } from '../agents/citizens.js';
import { isBuildable } from '../world/world.js';

const DEMAND_KEY = {
  [ZONE.RESIDENTIAL]: 'residential',
  [ZONE.COMMERCIAL]: 'commercial',
  [ZONE.INDUSTRIAL]: 'industrial',
};
const GROW_CHANCE = 0.08;
const MAX_MOVE_IN_PER_HOUR = 12;

export function growBuildings(state, rt) {
  const remaining = { ...rt.demand };
  const { zone, road } = state.map;
  const total = zone.length;
  // Começa num ponto aleatório para não favorecer o canto do mapa.
  const start = randomInt(state.rng, 0, total - 1);

  for (let i = 0; i < total; i++) {
    const tile = (start + i) % total;
    const z = zone[tile];
    if (z === ZONE.NONE || road[tile] || rt.buildingAt[tile]) continue;
    const key = DEMAND_KEY[z];
    if (remaining[key] <= 0 || !isBuildable(state, tile)) continue;
    if (findAccessRoad(state, rt, tile) < 0) continue;
    if (!chance(state.rng, GROW_CHANCE)) continue;

    const type = BUILDING_FOR_ZONE[z];
    addBuilding(state, rt, type, tile);
    const info = BUILDINGS[type];
    remaining[key] -= info.residents || info.jobs;
  }
}

export function moveIn(state, rt) {
  let arrivals = Math.min(rt.demand.attraction, MAX_MOVE_IN_PER_HOUR);
  if (arrivals <= 0) return;
  for (const b of state.buildings) {
    if (arrivals <= 0) break;
    if (vacancies(rt, b) <= 0 || rt.access.get(b.id) < 0) continue;
    createCitizen(state, rt, b);
    arrivals--;
  }
}
