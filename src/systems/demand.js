// Demanda RCI (residencial, comercial, industrial), em "pessoas" ou "vagas".
// É derivada do estado, então fica no runtime e é recalculada a cada hora.

import { BUILDINGS, ZONE } from '../world/catalog.js';
import { canWork } from '../agents/citizens.js';

export function computeDemand(state, rt) {
  let housing = 0;
  let commercialJobs = 0;
  let industrialJobs = 0;
  for (const b of state.buildings) {
    const info = BUILDINGS[b.type];
    housing += info.residents;
    if (info.zone === ZONE.COMMERCIAL) commercialJobs += info.jobs;
    if (info.zone === ZONE.INDUSTRIAL) industrialJobs += info.jobs;
  }

  const population = state.citizens.length;
  let employed = 0;
  let unemployed = 0;
  for (const c of state.citizens) {
    if (c.job !== null) employed++;
    else if (canWork(c)) unemployed++;
  }
  const workforce = employed + unemployed;
  const openJobs = commercialJobs + industrialJobs - employed;

  // Quanta gente quer vir morar aqui: vagas sobrando atraem, desemprego afasta.
  // A constante garante que uma cidade vazia comece a crescer.
  const attraction = openJobs - unemployed + 12;

  rt.demand = {
    attraction,
    residential: attraction - (housing - population),
    // Empregos acompanham a força de trabalho, com folga para atrair gente nova.
    commercial: Math.round(workforce * 0.4) - commercialJobs + 5,
    industrial: Math.round(workforce * 0.6) - industrialJobs + 10,
  };
  rt.stats = { population, housing, employed, unemployed, jobs: commercialJobs + industrialJobs };
  return rt.demand;
}
