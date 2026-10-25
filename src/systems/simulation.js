// Um tick da simulação (1 minuto de jogo). A ordem dos sistemas é fixa para
// que a mesma semente sempre produza a mesma cidade.

import { TICKS_PER_DAY, TICKS_PER_MONTH } from '../core/time.js';
import { buildRuntime } from '../world/runtime.js';
import { updateCitizens, assignJobs } from '../agents/citizens.js';
import { computeDemand } from './demand.js';
import { growBuildings, moveIn, upgradeBuildings } from './growth.js';
import { computeLandValue } from './landvalue.js';
import { closeMonth } from './economy.js';
import { computeMods } from './mods.js';
import { closeResearchMonth, grantLegacyResearch } from './research.js';
import { applyUtilityEffects, computeUtilities } from './utilities.js';
import { convertLegacyJobs, openCompanies, reviewCompanies } from './companies.js';
import { growForests } from './forest.js';
import { closeDemographyMonth } from './demography.js';
import { enrollStudents, refreshSchoolMap } from './education.js';
import { computeCoverage } from './services.js';
import { applyEmigration, closeHealthMonth, computeWellbeing } from './wellbeing.js';
import { applyFires } from './fire.js';
import { computeTransit } from './transit.js';
import { computeFreight } from './logistics.js';
import { updateTrafficMap } from './traffic.js';
import { collectWaste } from './waste.js';
import { indexVisitors, planDay, updateVisitors } from './tourism.js';
import { closeCultureMonth } from './culture.js';
import { runEventsOfDay } from './agenda.js';
import { closeSportsMonth, runSportsOfDay } from './sports.js';
import { startRacesOfDay, updateClosures, updateRaces } from './races.js';
import { updateStress } from './childcare.js';
import { dailyNews, monthlyNews, noteRushHour } from './news.js';

export function tick(state, rt) {
  state.time.tick++;
  const t = state.time.tick;
  // Corrida de rua: fecha e abre o percurso (antes das rotas do minuto).
  updateRaces(state, rt);

  updateCitizens(state, rt);
  updateVisitors(state, rt);
  growForests(state, rt);

  if (t % 60 === 0) {
    computeMods(state, rt);
    computeTransit(state, rt);
    updateTrafficMap(state, rt);
    // Rush das 8h: quanto das ruas está parado (para as notícias).
    if (t % TICKS_PER_DAY === 8 * 60) noteRushHour(state, rt);
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
      enrollStudents(state, rt);
      // Pais sem creche para o filho pequeno: o estresse do dia (depois das matrículas).
      updateStress(state, rt);
      // Bem-estar do dia: cobertura dos serviços, saúde, crime e satisfação;
      // depois quem está insatisfeito se muda e os incêndios do dia.
      computeCoverage(state, rt);
      computeFreight(state, rt);
      computeWellbeing(state, rt);
      state.wellbeing = { ...rt.cityWellbeing };
      // O lixo do dia vai para os lixões e aterros (com a situação usada acima).
      collectWaste(state, rt, rt.waste);
      applyEmigration(state, rt);
      applyFires(state, rt);
      computeUtilities(state, rt);
      upgradeBuildings(state, rt);
      computeDemand(state, rt);
      // Turistas de hoje (meia-noite): plano de chegadas e gasto do dia.
      // Eventos de hoje (público sorteado, encerramentos, séries) e, com eles,
      // os turistas e o público que vão andar pela cidade.
      runEventsOfDay(state, rt);
      // Jogos do dia dos clubes da cidade (e começo e fim das temporadas).
      runSportsOfDay(state, rt);
      startRacesOfDay(state, rt);
      planDay(state, rt);
      // Notícias do dia, com a cidade já atualizada.
      dailyNews(state, rt);
    }
    // Andares vagos são alugados antes de surgirem prédios novos.
    openCompanies(state, rt);
    growBuildings(state, rt);
    moveIn(state, rt);
    assignJobs(state, rt);
    computeDemand(state, rt);
  }

  if (t % TICKS_PER_MONTH === 0) {
    closeMonth(state, rt);
    closeDemographyMonth(state, rt);
    closeHealthMonth(state, rt);
    closeResearchMonth(state, rt);
    closeCultureMonth(state, rt);
    closeSportsMonth(state, rt);
    monthlyNews(state, rt);
  }
}

/** Avança vários ticks de uma vez (testes e ferramentas). */
export function advance(state, rt, ticks) {
  for (let i = 0; i < ticks; i++) tick(state, rt);
}

/** Monta os índices derivados de um estado (novo ou recém-carregado). */
export function prepare(state) {
  const rt = buildRuntime(state);
  indexVisitors(state, rt);
  grantLegacyResearch(state);
  computeMods(state, rt);
  updateClosures(state, rt);
  convertLegacyJobs(state, rt);
  computeDemand(state, rt);
  computeUtilities(state, rt);
  computeLandValue(state, rt); // para os mapas e o painel; a simulação recalcula antes de usar
  refreshSchoolMap(state, rt); // só o mapa: matricular mudaria o estado ao carregar
  // Para os mapas e o painel; a simulação recalcula no começo de cada dia.
  computeTransit(state, rt);
  computeFreight(state, rt);
  computeCoverage(state, rt);
  computeWellbeing(state, rt);
  return rt;
}
