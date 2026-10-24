// Empresas: quem dá emprego nos prédios comerciais e industriais.
//
// Cada empresa aluga andares inteiros de um prédio (ver SECTORS no catálogo):
// lojas e mercados têm uma empresa de varejo por andar, escritórios têm
// empresas de 1 a 3 andares (o térreo às vezes é comércio), e um prédio
// industrial é de uma empresa só. Andar sem empresa fica vago e não tem vagas.
//
//   - Prédio novo nasce já alugado (foi construído para as empresas dele).
//   - Andar vago (o prédio cresceu, ou uma empresa fechou) recebe uma empresa
//     nova quando a zona tem demanda.
//   - Empresa que passa muito tempo sem conseguir metade dos funcionários
//     fecha: quem trabalhava lá fica desempregado.
//
// Formato de uma empresa no estado (e no save):
//   { id, name, sector, building, floor (0 = térreo), floors, foundedAt,
//     understaffedDays? }

import {
  BUILDINGS, COMPANY_CLOSE_DAYS, COMPANY_GRACE_DAYS, COMPANY_OPEN_CHANCE, SECTORS, ZONE, buildingFloors,
} from '../world/catalog.js';
import {
  addCompany, companyJobs, removeCompany, setJob, touchMap, usesCompanies,
} from '../world/runtime.js';
import { chance, pick, randomInt } from '../core/rng.js';
import { TICKS_PER_DAY } from '../core/time.js';
import { LAST_NAMES } from '../agents/names.js';
import { isServed } from './utilities.js';

const SECTORS_BY_KIND = {};
for (const [id, sector] of Object.entries(SECTORS)) (SECTORS_BY_KIND[sector.kind] ??= []).push(id);

const DEMAND_KEY = { [ZONE.COMMERCIAL]: 'commercial', [ZONE.INDUSTRIAL]: 'industrial' };

/** Andares do prédio sem empresa, do mais baixo ao mais alto. */
export function vacantFloors(rt, b) {
  const taken = new Set();
  for (const co of rt.companiesIn.get(b.id)) for (let f = co.floor; f < co.floor + co.floors; f++) taken.add(f);
  const vacant = [];
  for (let f = 0; f < buildingFloors(b); f++) if (!taken.has(f)) vacant.push(f);
  return vacant;
}

/** Aluga todos os andares vagos do prédio (prédio recém-construído). */
export function foundCompanies(state, rt, b) {
  while (openCompanyIn(state, rt, b));
}

/**
 * Abre uma empresa no primeiro andar vago do prédio e devolve quantas vagas
 * ela tem (0 se o prédio está todo alugado).
 */
function openCompanyIn(state, rt, b) {
  const info = BUILDINGS[b.type];
  const vacant = vacantFloors(rt, b);
  if (vacant.length === 0) return 0;
  const floor = vacant[0];
  // Andares vagos seguidos a partir dele.
  let run = 1;
  while (vacant[run] === floor + run) run++;

  let kind;
  let floors;
  if (info.zone === ZONE.INDUSTRIAL) {
    // A indústria cresce junto com o prédio: a empresa que já está lá ocupa o
    // andar novo.
    const [owner] = rt.companiesIn.get(b.id);
    if (owner) {
      owner.floors = buildingFloors(b);
      return run * info.perFloor;
    }
    kind = 'industria';
    floors = run;
  } else if (info.tall) {
    kind = floor === 0 && chance(state.rng, 0.5) ? 'varejo' : 'escritorio';
    floors = kind === 'varejo' ? 1 : Math.min(run, randomInt(state.rng, 1, 3));
  } else {
    kind = 'varejo';
    floors = 1;
  }
  const sector = pick(state.rng, SECTORS_BY_KIND[kind]);
  addCompany(state, rt, {
    id: 0,
    name: companyName(state, sector),
    sector,
    building: b.id,
    floor,
    floors,
    foundedAt: state.time.tick,
  });
  return floors * info.perFloor;
}

function companyName(state, sector) {
  const first = pick(state.rng, LAST_NAMES);
  let second = pick(state.rng, LAST_NAMES);
  if (second === first) second = LAST_NAMES[(LAST_NAMES.indexOf(first) + 1) % LAST_NAMES.length];
  return SECTORS[sector].label.replace('{L}', first).replace('{M}', second);
}

/**
 * Roda a cada hora, antes de surgirem prédios novos: andares vagos recebem
 * empresas enquanto a zona tiver demanda. A demanda usada aqui sai de
 * rt.demand, então sobra menos para prédios novos (andar vago é ocupado antes
 * de construir mais).
 */
export function openCompanies(state, rt) {
  for (const b of state.buildings) {
    const info = BUILDINGS[b.type];
    if (!usesCompanies(info) || b.abandoned !== undefined) continue;
    const key = DEMAND_KEY[info.zone];
    if (rt.demand[key] <= 0) continue;
    if (rt.access.get(b.id) < 0 || !isServed(rt, b)) continue;
    if (vacantFloors(rt, b).length === 0) continue;
    if (!chance(state.rng, COMPANY_OPEN_CHANCE)) continue;
    rt.demand[key] -= openCompanyIn(state, rt, b);
  }
}

/**
 * Depois que o prédio muda de tipo: a indústria continua de uma empresa só
 * (ela ocupa os andares novos) e ninguém fica além das vagas da empresa.
 */
export function fitCompanies(state, rt, b) {
  const info = BUILDINGS[b.type];
  if (!usesCompanies(info)) return;
  const list = rt.companiesIn.get(b.id);
  if (info.zone === ZONE.INDUSTRIAL && list.length === 1) list[0].floors = buildingFloors(b);
  for (const co of list) {
    const extra = [...rt.companyWorkers.get(co.id)].sort((x, y) => x - y).slice(companyJobs(rt, co));
    for (const id of extra) setJob(rt, rt.citizenById.get(id), null);
  }
}

/**
 * Roda uma vez por dia: empresa com menos da metade dos funcionários por
 * COMPANY_CLOSE_DAYS dias seguidos (depois do prazo para contratar) fecha.
 */
export function reviewCompanies(state, rt) {
  const tick = state.time.tick;
  for (const co of [...state.companies]) {
    if (tick - co.foundedAt < COMPANY_GRACE_DAYS * TICKS_PER_DAY) continue;
    if (rt.companyWorkers.get(co.id).size * 2 >= companyJobs(rt, co)) {
      delete co.understaffedDays;
      continue;
    }
    co.understaffedDays = (co.understaffedDays || 0) + 1;
    if (co.understaffedDays >= COMPANY_CLOSE_DAYS) {
      const b = rt.buildingById.get(co.building);
      removeCompany(state, rt, co.id);
      // As luzes do prédio dependem das empresas.
      touchMap(rt, b.tile, BUILDINGS[b.type].size);
    }
  }
}

/**
 * Saves de antes das empresas (state.legacyJobs): cada prédio comercial ou
 * industrial ganha empresas em todos os andares, e quem já trabalhava lá
 * passa a trabalhar nelas, com os mesmos horários. A cidade continua igual.
 */
export function convertLegacyJobs(state, rt) {
  if (!state.legacyJobs) return;
  delete state.legacyJobs;
  for (const c of state.citizens) c.company ??= null;
  for (const b of state.buildings) {
    if (!usesCompanies(BUILDINGS[b.type])) continue;
    foundCompanies(state, rt, b);
    const workers = [...rt.workers.get(b.id)].sort((x, y) => x - y);
    for (const co of rt.companiesIn.get(b.id)) {
      for (const id of workers.splice(0, companyJobs(rt, co))) {
        rt.citizenById.get(id).company = co.id;
        rt.companyWorkers.get(co.id).add(id);
      }
    }
  }
}
