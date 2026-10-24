// Estado do jogo: tudo que é salvo. Só dados simples (objetos, arrays e
// typed arrays), sem classes, para o save ser uma cópia direta.

import { createRng } from '../core/rng.js';
import { ECONOMY, TERRAIN } from './catalog.js';
import { generateTerrain } from './terrain.js';
import { createResearch } from '../systems/research.js';

export const DEFAULT_MAP_SIZE = 256;

export function createWorld({
  name = 'Nova Cidade',
  width = DEFAULT_MAP_SIZE,
  height = DEFAULT_MAP_SIZE,
  seed = (Math.random() * 2 ** 32) >>> 0,
  startMarco = 1,
} = {}) {
  return {
    city: { name },
    seed,
    rng: createRng(seed),
    time: { tick: 7 * 60 }, // começa às 07:00 do dia 1
    playTimeSeconds: 0,
    economy: {
      money: ECONOMY.startMoney,
      // Impostos em % por zona.
      taxes: { residential: ECONOMY.taxDefault, commercial: ECONOMY.taxDefault, industrial: ECONOMY.taxDefault },
      loans: [], //   { id, amount, balance, payment, monthsLeft }
      nextLoanId: 1,
      history: [], // um registro por mês fechado (ver systems/economy.js)
      lastMonth: null,
    },
    map: {
      width,
      height,
      terrain: generateTerrain(width, height, seed),
      zone: new Uint8Array(width * height),
      road: new Uint8Array(width * height),
    },
    buildings: [], // { id, type, tile, builtAt }
    citizens: [], //  ver src/agents/citizens.js
    pathQueue: [], // ids de cidadãos esperando o cálculo de rota
    // Energia e água importadas da região (só em saves anteriores aos serviços
    // públicos; acaba quando o jogador constrói a primeira usina/bomba).
    utilities: { imported: { power: false, water: false } },
    // Pesquisa e tecnologias (ver systems/research.js).
    research: createResearch(startMarco),
    nextId: 1,
  };
}

export function isBuildable(state, tile) {
  return state.map.terrain[tile] !== TERRAIN.WATER;
}
