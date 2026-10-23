// Um tick da simulação (1 minuto de jogo). A ordem dos sistemas é fixa para
// que a mesma semente sempre produza a mesma cidade.

import { TICKS_PER_MONTH } from '../core/time.js';
import { buildRuntime } from '../world/runtime.js';
import { updateCitizens, assignJobs } from '../agents/citizens.js';
import { computeDemand } from './demand.js';
import { growBuildings, moveIn } from './growth.js';
import { closeMonth } from './economy.js';

export function tick(state, rt) {
  state.time.tick++;
  const t = state.time.tick;

  updateCitizens(state, rt);

  if (t % 60 === 0) {
    computeDemand(state, rt);
    growBuildings(state, rt);
    moveIn(state, rt);
    assignJobs(state, rt);
    computeDemand(state, rt);
  }

  if (t % TICKS_PER_MONTH === 0) closeMonth(state, rt);
}

/** Avança vários ticks de uma vez (testes e ferramentas). */
export function advance(state, rt, ticks) {
  for (let i = 0; i < ticks; i++) tick(state, rt);
}

/** Monta os índices derivados de um estado (novo ou recém-carregado). */
export function prepare(state) {
  const rt = buildRuntime(state);
  computeDemand(state, rt);
  return rt;
}
