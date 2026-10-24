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
// }

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
import { FIRST_NAMES, LAST_NAMES } from './names.js';

// Quantas rotas calcular por tick no máximo (o resto espera na fila).
const PATHS_PER_TICK = 100;
const PATH_CACHE_LIMIT = 30_000;
export const WORKING_AGE = [18, 64];

export function createCitizen(state, rt, home) {
  const [x, y] = tileCenter(state, home.tile);
  return addCitizen(state, rt, {
    id: 0,
    name: `${pick(state.rng, FIRST_NAMES)} ${pick(state.rng, LAST_NAMES)}`,
    age: randomInt(state.rng, 18, 75),
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
  return citizen.age >= WORKING_AGE[0] && citizen.age <= WORKING_AGE[1];
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
  for (const id of rt.movers) {
    const c = rt.citizenById.get(id);
    let budget = CITIZEN_SPEED;
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

/** Contrata desempregados, procurando a vaga alcançável mais próxima. */
export function assignJobs(state, rt, budget = 200) {
  // Prédio sem energia ou água não contrata (ver systems/utilities.js).
  const workplaces = state.buildings.filter((b) => openJobs(rt, b) > 0 && rt.access.get(b.id) >= 0 && isServed(rt, b));
  if (workplaces.length === 0) return;
  const width = state.map.width;

  // Vagas abertas por rede de estradas: quem mora numa rede sem vagas é
  // pulado sem gastar o orçamento (senão trava a contratação dos outros).
  const openByNetwork = new Map();
  for (const w of workplaces) {
    const net = rt.roadComponent[rt.access.get(w.id)];
    openByNetwork.set(net, (openByNetwork.get(net) || 0) + openJobs(rt, w));
  }

  for (const c of state.citizens) {
    if (budget <= 0) break;
    if (c.job !== null || !canWork(c) || c.state !== 'casa') continue;
    const homeAccess = rt.access.get(c.home);
    const net = homeAccess >= 0 ? rt.roadComponent[homeAccess] : 0;
    if (!openByNetwork.get(net)) continue;
    budget--;

    const home = rt.buildingById.get(c.home);
    const hx = home.tile % width;
    const hy = Math.floor(home.tile / width);
    let best = null;
    let bestDist = Infinity;
    for (const w of workplaces) {
      if (openJobs(rt, w) <= 0 || !sameNetwork(rt, home.id, w.id)) continue;
      const d = Math.abs((w.tile % width) - hx) + Math.abs(Math.floor(w.tile / width) - hy);
      if (d < bestDist) {
        best = w;
        bestDist = d;
      }
    }
    if (best) {
      hire(state, rt, c, best);
      openByNetwork.set(net, openByNetwork.get(net) - 1);
    }
  }
}
