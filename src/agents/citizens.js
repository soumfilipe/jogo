// Cidadãos: agentes individuais. Cada um tem casa, (talvez) emprego e uma
// rotina diária: sai de casa de manhã, anda pelas estradas até o trabalho e
// volta no fim da tarde.
//
// Formato de um cidadão no estado (e no save):
// {
//   id, name, age,
//   home: id do prédio,      job: id do prédio | null,
//   company: id da empresa em que trabalha, dentro do prédio `job` (null sem
//            emprego ou num serviço público),
//   departWork / departHome: minuto do dia em que sai (null sem emprego),
//   shift: turno ('diurno', 'noturno', 'madrugada', 'manha', 'tarde'; null sem emprego),
//   state: 'casa' | 'trabalho' | 'aguardando' (rota sendo calculada) | 'viajando',
//   dest:  'trabalho' | 'casa' | null,
//   x, y:  posição em tiles (contínua),
//   path:  tiles da viagem atual | null,   step: índice no path
//   edu, field, school, stage, study: escolaridade e estudo (ver systems/education.js)
// }
//
// Crianças moram com a família e estudam; trabalham dos 18 aos 64 anos (ver
// systems/demography.js), menos quem estuda em tempo integral.

import { BUILDINGS, CITIZEN_SPEED, SECTORS, SHIFTS } from '../world/catalog.js';
import { MINUTES_PER_DAY } from '../core/time.js';
import { pick, random, randomInt } from '../core/rng.js';
import {
  addCitizen,
  companyJobs,
  openJobs,
  sameNetwork,
  sendHome,
  setJob,
  tileCenter,
  usesCompanies,
} from '../world/runtime.js';
import { findRoadPath } from './pathfinding.js';
import { isServed } from '../systems/utilities.js';
import { mod } from '../systems/mods.js';
import { isFullTimeStudent, minEduFor } from '../systems/education.js';
import { FIRST_NAMES, LAST_NAMES } from './names.js';

// Quantas rotas calcular por tick no máximo (o resto espera na fila).
const PATHS_PER_TICK = 100;
const PATH_CACHE_LIMIT = 30_000;
export const WORKING_AGE = [18, 64];

/**
 * Cria um cidadão morando em `home`. Opções: age (padrão: adulto de 18 a 75),
 * edu (escolaridade, padrão fundamental) e lastName (para quem é da mesma família).
 */
export function createCitizen(state, rt, home, { age, edu = 1, lastName } = {}) {
  const [x, y] = tileCenter(state, home.tile);
  return addCitizen(state, rt, {
    id: 0,
    name: `${pick(state.rng, FIRST_NAMES)} ${lastName ?? pick(state.rng, LAST_NAMES)}`,
    age: age ?? randomInt(state.rng, 18, 75),
    edu,
    field: null,
    school: null,
    stage: null,
    study: 0,
    home: home.id,
    job: null,
    company: null,
    departWork: null,
    departHome: null,
    shift: null,
    state: 'casa',
    dest: null,
    x,
    y,
    path: null,
    step: 0,
  });
}

export function canWork(citizen) {
  return citizen.age >= WORKING_AGE[0] && citizen.age <= WORKING_AGE[1] && !isFullTimeStudent(citizen);
}

/**
 * Contrata: escolhe a empresa com vaga no prédio (a do andar mais baixo),
 * sorteia o turno pelo setor dela e os horários de saída dentro das faixas.
 */
export function hire(state, rt, citizen, workplace) {
  let company = null;
  if (usesCompanies(BUILDINGS[workplace.type])) {
    company = rt.companiesIn.get(workplace.id).find((co) => rt.companyWorkers.get(co.id).size < companyJobs(rt, co));
    if (!company) return;
  }
  const shift = pickShift(random(state.rng), company ? SECTORS[company.sector].shifts : undefined);
  const { leave, back, hours } = SHIFTS[shift];
  const departWork = randomInt(state.rng, leave[0], leave[1]);
  const departHome = back
    ? randomInt(state.rng, back[0], back[1])
    : (departWork + randomInt(state.rng, hours[0], hours[1])) % MINUTES_PER_DAY;
  setJob(rt, citizen, workplace.id, departWork, departHome, company ? company.id : null);
  citizen.shift = shift;
}

const SHIFT_SHARES = Object.fromEntries(Object.entries(SHIFTS).map(([id, s]) => [id, s.share]));

/**
 * Turno para um sorteio `roll` em [0, 1), pelas frações `shares` (padrão: as
 * do catálogo, usadas nos serviços públicos; empresas usam as do setor).
 */
export function pickShift(roll, shares = SHIFT_SHARES) {
  let acc = 0;
  for (const [id, share] of Object.entries(shares)) {
    acc += share;
    if (roll < acc) return id;
  }
  return 'diurno';
}

/** Roda a cada tick: saídas do minuto, fila de rotas e movimento. */
export function updateCitizens(state, rt) {
  const minute = state.time.tick % MINUTES_PER_DAY;
  startDepartures(state, rt, minute);
  processPathQueue(state, rt);
  moveCitizens(state, rt);
}

function startDepartures(state, rt, minute) {
  const leaving = rt.departures.get(minute);
  if (!leaving || leaving.size === 0) return;
  // Ordena por id: a ordem não pode depender de como os índices foram montados.
  for (const id of [...leaving].sort((a, b) => a - b)) {
    const c = rt.citizenById.get(id);
    if (c.departWork === minute && c.state === 'casa') requestTrip(state, c, 'trabalho');
    else if (c.departHome === minute && c.state === 'trabalho') requestTrip(state, c, 'casa');
  }
}

function requestTrip(state, citizen, dest) {
  citizen.state = 'aguardando';
  citizen.dest = dest;
  state.pathQueue.push(citizen.id);
}

function processPathQueue(state, rt) {
  if (state.pathQueue.length === 0) return;
  const batch = state.pathQueue.splice(0, PATHS_PER_TICK);
  for (const id of batch) {
    const c = rt.citizenById.get(id);
    if (!c || c.state !== 'aguardando') continue;

    const from = rt.buildingById.get(c.dest === 'trabalho' ? c.home : c.job);
    const to = rt.buildingById.get(c.dest === 'trabalho' ? c.job : c.home);
    const route = from && to && sameNetwork(rt, from.id, to.id) && roadRoute(state, rt, from.id, to.id);

    if (!route) {
      // Sem caminho: quem ia trabalhar fica em casa; quem voltava "chega".
      sendHome(state, rt, c);
      continue;
    }
    const [x, y] = tileCenter(state, from.tile);
    Object.assign(c, { state: 'viajando', path: [from.tile, ...route, to.tile], step: 0, x, y });
    rt.movers.add(c.id);
  }
}

function roadRoute(state, rt, fromBuilding, toBuilding) {
  const a = rt.access.get(fromBuilding);
  const b = rt.access.get(toBuilding);
  const key = a * 100_000 + b;
  let route = rt.pathCache.get(key);
  if (route === undefined) {
    route = findRoadPath(state.map, a, b);
    if (rt.pathCache.size >= PATH_CACHE_LIMIT) evictOldest(rt.pathCache, PATH_CACHE_LIMIT / 4);
    rt.pathCache.set(key, route && Int32Array.from(route));
  }
  return route;
}

function evictOldest(map, count) {
  for (const key of map.keys()) {
    if (count-- <= 0) break;
    map.delete(key);
  }
}

function moveCitizens(state, rt) {
  const width = state.map.width;
  const speed = mod(rt, 'citizenSpeed', CITIZEN_SPEED);
  for (const id of rt.movers) {
    const c = rt.citizenById.get(id);
    let budget = speed;
    while (budget > 0 && c.step < c.path.length - 1) {
      const next = c.path[c.step + 1];
      const nx = (next % width) + 0.5;
      const ny = Math.floor(next / width) + 0.5;
      const dx = nx - c.x;
      const dy = ny - c.y;
      const dist = Math.abs(dx) + Math.abs(dy);
      if (dist <= budget) {
        c.x = nx;
        c.y = ny;
        c.step++;
        budget -= dist;
      } else {
        c.x += (dx / dist) * budget;
        c.y += (dy / dist) * budget;
        budget = 0;
      }
    }
    if (c.step >= c.path.length - 1) {
      c.state = c.dest;
      c.dest = null;
      c.path = null;
      c.step = 0;
      rt.movers.delete(id);
    }
  }
}

// Quanto um nível de escolaridade exigido "vale" em tiles de distância: quem
// estudou prefere a vaga que pede o estudo dele, mesmo um pouco mais longe.
const EDU_PREFERENCE_TILES = 40;

/**
 * Contrata desempregados. Cada um só pega vaga que peça no máximo a
 * escolaridade dele (ver minEduFor) e prefere a que mais aproveita o estudo,
 * e depois a mais perto.
 */
export function assignJobs(state, rt, budget = 200) {
  // Prédio sem energia ou água não contrata (ver systems/utilities.js).
  const workplaces = state.buildings.filter((b) => openJobs(rt, b) > 0 && rt.access.get(b.id) >= 0 && isServed(rt, b));
  if (workplaces.length === 0) return;
  const width = state.map.width;
  const need = new Map(workplaces.map((w) => [w.id, minEduFor(rt, w.type)]));

  // Vagas abertas por rede de estradas e escolaridade exigida: quem não tem
  // vaga possível na rede é pulado sem gastar o orçamento (senão trava a
  // contratação dos outros).
  const openByNetwork = new Map();
  for (const w of workplaces) {
    const net = rt.roadComponent[rt.access.get(w.id)];
    if (!openByNetwork.has(net)) openByNetwork.set(net, [0, 0, 0, 0, 0]);
    openByNetwork.get(net)[need.get(w.id)] += openJobs(rt, w);
  }
  const openFor = (net, edu) => {
    const counts = openByNetwork.get(net);
    if (!counts) return 0;
    let n = 0;
    for (let e = 0; e <= edu; e++) n += counts[e];
    return n;
  };

  for (const c of state.citizens) {
    if (budget <= 0) break;
    if (c.job !== null || !canWork(c) || c.state !== 'casa') continue;
    const edu = c.edu ?? 0;
    const homeAccess = rt.access.get(c.home);
    const net = homeAccess >= 0 ? rt.roadComponent[homeAccess] : 0;
    if (!openFor(net, edu)) continue;
    budget--;

    const home = rt.buildingById.get(c.home);
    const hx = home.tile % width;
    const hy = Math.floor(home.tile / width);
    let best = null;
    let bestScore = Infinity;
    for (const w of workplaces) {
      const n = need.get(w.id);
      if (n > edu || openJobs(rt, w) <= 0 || !sameNetwork(rt, home.id, w.id)) continue;
      const d = Math.abs((w.tile % width) - hx) + Math.abs(Math.floor(w.tile / width) - hy);
      const score = d - n * EDU_PREFERENCE_TILES;
      if (score < bestScore) {
        best = w;
        bestScore = score;
      }
    }
    if (best) {
      hire(state, rt, c, best);
      const net2 = rt.roadComponent[rt.access.get(best.id)];
      openByNetwork.get(net2)[need.get(best.id)]--;
    }
  }
}
