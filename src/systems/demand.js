// Demanda RCI (residencial, comercial, industrial) e rural, em "pessoas" ou "vagas".
// É derivada do estado, então fica no runtime e é recalculada a cada hora.

import { BUILDINGS, ZONE, capacityOf } from '../world/catalog.js';
import { canWork } from '../agents/citizens.js';
import { leasedJobs, usesCompanies } from '../world/runtime.js';
import { taxDemandShift } from './economy.js';
import { mod } from './mods.js';
import { ruralDemand } from './food.js';

// Quanto a satisfação média move a demanda residencial (de −15 a +15).
const SATISFACTION_DEMAND = 30;
// Desemprego natural: parte de quem pode trabalhar está sempre procurando o
// primeiro emprego ou trocando de vaga. As empresas não abrem vaga para todos
// e quem chega aceita esse tanto de desemprego; acima disso, a cidade espanta
// gente (imposto alto ou poucas zonas comerciais e industriais).
const NATURAL_UNEMPLOYMENT = 0.05;

export function computeDemand(state, rt) {
  let housing = 0;
  let commercialJobs = 0;
  let industrialJobs = 0;
  let ruralJobs = 0;
  let otherJobs = 0; // serviços públicos
  for (const b of state.buildings) {
    if (b.abandoned !== undefined) continue; // abandonado não tem casa nem vaga
    const info = BUILDINGS[b.type];
    // Comércio e indústria: só contam as vagas das empresas (andar vago não emprega).
    const people = usesCompanies(info) ? leasedJobs(rt, b) : capacityOf(b);
    if (info.residents) housing += people;
    else if (info.zone === ZONE.COMMERCIAL) commercialJobs += people;
    else if (info.zone === ZONE.INDUSTRIAL) industrialJobs += people;
    else if (info.zone === ZONE.RURAL) ruralJobs += people;
    else otherJobs += people;
  }

  const population = state.citizens.length;
  let employed = 0;
  let unemployed = 0;
  for (const c of state.citizens) {
    if (c.job !== null) employed++;
    else if (canWork(c)) unemployed++;
  }
  const workforce = employed + unemployed;
  const jobs = commercialJobs + industrialJobs + ruralJobs + otherJobs;
  const openJobs = jobs - employed;

  // Quanta gente quer vir morar aqui: vagas sobrando atraem, desemprego afasta,
  // imposto residencial alto afasta. A constante faz uma cidade vazia crescer.
  // A satisfação média (guardada uma vez por dia, ver wellbeing.js) também atrai ou afasta.
  const satisfaction = state.wellbeing?.satisfaction ?? 0.5;
  const extraUnemployed = unemployed - Math.round(workforce * NATURAL_UNEMPLOYMENT);
  const attraction = openJobs - extraUnemployed + 12 + taxDemandShift(state, 'residential')
    + Math.round((satisfaction - 0.5) * SATISFACTION_DEMAND);

  const privateJobs = Math.max(0, Math.round(workforce * (1 - NATURAL_UNEMPLOYMENT)) - otherJobs - ruralJobs);
  rt.demand = {
    attraction,
    residential: attraction - (housing - population),
    // Empregos acompanham a força de trabalho (menos o desemprego natural e as
    // vagas de serviços públicos e fazendas), com folga para atrair gente nova;
    // imposto alto na zona espanta empresas, baixo atrai.
    commercial: Math.round(privateJobs * 0.4) - commercialJobs + 5 + taxDemandShift(state, 'commercial')
      + mod(rt, 'demand.commercial', 0),
    industrial: Math.round(privateJobs * 0.6) - industrialJobs + 10 + taxDemandShift(state, 'industrial')
      + mod(rt, 'demand.industrial', 0),
    // Fazendas: enquanto a cidade importa comida (ver food.js).
    rural: ruralDemand(state, rt) + taxDemandShift(state, 'rural') + mod(rt, 'demand.rural', 0),
  };
  rt.stats = { population, housing, employed, unemployed, workforce, jobs, openJobs: Math.max(0, openJobs) };
  return rt.demand;
}
