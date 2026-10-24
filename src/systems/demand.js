// Demanda RCI (residencial, comercial, industrial), em "pessoas" ou "vagas".
// É derivada do estado, então fica no runtime e é recalculada a cada hora.

import { BUILDINGS, ZONE } from '../world/catalog.js';
import { canWork } from '../agents/citizens.js';
import { taxDemandShift } from './economy.js';
import { jobsOf, mod } from './mods.js';

export function computeDemand(state, rt) {
  let housing = 0;
  let commercialJobs = 0;
  let industrialJobs = 0;
  let otherJobs = 0; // serviços públicos
  for (const b of state.buildings) {
    if (b.abandoned !== undefined) continue; // abandonado não tem casa nem vaga
    const info = BUILDINGS[b.type];
    const jobs = jobsOf(rt, b.type);
    housing += info.residents;
    if (info.zone === ZONE.COMMERCIAL) commercialJobs += jobs;
    else if (info.zone === ZONE.INDUSTRIAL) industrialJobs += jobs;
    else otherJobs += jobs;
  }

  const population = state.citizens.length;
  let employed = 0;
  let unemployed = 0;
  for (const c of state.citizens) {
    if (c.job !== null) employed++;
    else if (canWork(c)) unemployed++;
  }
  const workforce = employed + unemployed;
  const openJobs = commercialJobs + industrialJobs + otherJobs - employed;

  // Quanta gente quer vir morar aqui: vagas sobrando atraem, desemprego afasta,
  // imposto residencial alto afasta. A constante faz uma cidade vazia crescer.
  const attraction = openJobs - unemployed + 12 + taxDemandShift(state, 'residential');

  rt.demand = {
    attraction,
    residential: attraction - (housing - population),
    // Empregos acompanham a força de trabalho, com folga para atrair gente nova;
    // imposto alto na zona espanta empresas, baixo atrai.
    commercial: Math.round(workforce * 0.4) - commercialJobs + 5 + taxDemandShift(state, 'commercial')
      + mod(rt, 'demand.commercial', 0),
    industrial: Math.round(workforce * 0.6) - industrialJobs + 10 + taxDemandShift(state, 'industrial')
      + mod(rt, 'demand.industrial', 0),
  };
  rt.stats = { population, housing, employed, unemployed, jobs: commercialJobs + industrialJobs + otherJobs };
  return rt.demand;
}
