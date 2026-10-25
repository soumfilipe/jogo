// Estado do jogo: tudo que é salvo. Só dados simples (objetos, arrays e
// typed arrays), sem classes, para o save ser uma cópia direta.

import { createRng } from '../core/rng.js';
import { DENSITY, ECONOMY, TERRAIN } from './catalog.js';
import { generateForest, generateTerrain } from './terrain.js';
import { createResearch } from '../systems/research.js';
import { createEducation } from '../systems/education.js';
import { createPolicies } from '../systems/policies.js';
import { createTourism } from '../systems/tourism.js';

export const DEFAULT_MAP_SIZE = 256;

export function createWorld({
  name = 'Nova Cidade',
  width = DEFAULT_MAP_SIZE,
  height = DEFAULT_MAP_SIZE,
  seed = (Math.random() * 2 ** 32) >>> 0,
  startMarco = 1,
} = {}) {
  const terrain = generateTerrain(width, height, seed);
  return {
    city: { name },
    seed,
    rng: createRng(seed),
    time: { tick: 7 * 60 }, // começa às 07:00 do dia 1
    playTimeSeconds: 0,
    economy: {
      money: ECONOMY.startMoney,
      // Impostos em % por zona.
      taxes: {
        residential: ECONOMY.taxDefault, commercial: ECONOMY.taxDefault, industrial: ECONOMY.taxDefault,
        rural: ECONOMY.taxDefault,
      },
      loans: [], //   { id, amount, balance, payment, monthsLeft }
      nextLoanId: 1,
      history: [], // um registro por mês fechado (ver systems/economy.js)
      lastMonth: null,
      fares: 0, // passagens do transporte público no mês (entram no fechamento)
      tourism: 0, // gasto dos turistas no mês (ver systems/tourism.js)
    },
    map: {
      width,
      height,
      terrain,
      forest: generateForest(terrain, width, height, seed), // densidade da mata (0 = sem)
      zone: new Uint8Array(width * height),
      // Densidade de cada tile zoneado (DENSITY no catálogo).
      density: new Uint8Array(width * height).fill(DENSITY.MEDIUM),
      road: new Uint8Array(width * height),
      // Parques de conservação (1 = tile protegido; ver commands.js).
      park: new Uint8Array(width * height),
    },
    buildings: [], // { id, type, tile, builtAt, floors? } (floors: só se cresceu andares)
    citizens: [], //  ver src/agents/citizens.js
    companies: [], // { id, name, sector, building, floor, floors, foundedAt, understaffedDays? }
    pathQueue: [], // ids de cidadãos esperando o cálculo de rota
    visitors: [], //  turistas andando ou visitando (ver systems/tourism.js)
    tourism: createTourism(),
    // Energia e água importadas da região (só em saves anteriores aos serviços
    // públicos; acaba quando o jogador constrói a primeira usina/bomba).
    utilities: { imported: { power: false, water: false } },
    // Pesquisa e tecnologias (ver systems/research.js).
    research: createResearch(startMarco),
    // Cursos da universidade (ver systems/education.js).
    education: createEducation(),
    // Leis ativas (systems/policies.js), epidemia e médias do dia (wellbeing.js).
    policies: createPolicies(),
    health: { epidemicUntil: 0 },
    wellbeing: { health: 0.55, crime: 0, satisfaction: 0.5 },
    nextId: 1,
  };
}

export function isBuildable(state, tile) {
  return state.map.terrain[tile] !== TERRAIN.WATER;
}
