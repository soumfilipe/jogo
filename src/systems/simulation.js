// Um tick da simulação (1 minuto de jogo). A ordem dos sistemas é fixa para
// que a mesma semente sempre produza a mesma cidade.

import { TICKS_PER_DAY, TICKS_PER_MONTH } from '../core/time.js';
import { buildRuntime } from '../world/runtime.js';
import { updateCitizens, assignJobs } from '../agents/citizens.js';
import { computeDemand } from './demand.js';
import { growBuildings, moveIn, upgradeBuildings } from './growth.js';
import { computeLandValue } from './landvalue.js';
import { closeMonth } from './economy.js';
import { applyUtilityEffects, computeUtilities } from './utilities.js';
import { convertLegacyJobs, openCompanies, reviewCompanies } from './companies.js';

export function tick(state, rt) {
  state.time.tick++;
  const t = state.time.tick;

  updateCitizens(state, rt);

  if (t % 60 === 0) {
    computeDemand(state, rt);
    // Recalculado aqui, logo antes do uso, e nunca lido de um cálculo antigo:
    // assim o resultado não depende de quando o save foi carregado.
    computeLandValue(state, rt);
    rt.landValueVersion = (rt.landValueVersion || 0) + 1;
    computeUtilities(state, rt);
    // Uma vez por dia: efeitos da falta de energia/água e, depois, prédios
    // lotados sobem de nível (têm prioridade sobre lotes novos).
    if (t % TICKS_PER_DAY === 0) {
      applyUtilityEffects(state, rt);
      reviewCompanies(state, rt);
      computeUtilities(state, rt);
      upgradeBuildings(state, rt);
      computeDemand(state, rt);
    }
    // Andares vagos são alugados antes de surgirem prédios novos.
    openCompanies(state, rt);
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
  convertLegacyJobs(state, rt);
  computeDemand(state, rt);
  computeUtilities(state, rt);
  computeLandValue(state, rt); // para os mapas e o painel; a simulação recalcula antes de usar
  return rt;
}
