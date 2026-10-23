// Cidadãos: agentes individuais. Cada um tem casa, (talvez) emprego e uma
// rotina diária: sai de casa de manhã, anda pelas estradas até o trabalho e
// volta no fim da tarde.
//
// Formato de um cidadão no estado (e no save):
// {
//   id, name, age,
//   home: id do prédio,      job: id do prédio | null,
//   departWork / departHome: minuto do dia em que sai (null sem emprego),
//   state: 'casa' | 'trabalho' | 'aguardando' (rota sendo calculada) | 'viajando',
//   dest:  'trabalho' | 'casa' | null,
//   x, y:  posição em tiles (contínua),
//   path:  tiles da viagem atual | null,   step: índice no path
// }

import { CITIZEN_SPEED } from '../world/catalog.js';
import { MINUTES_PER_DAY } from '../core/time.js';
import { pick, randomInt } from '../core/rng.js';
import {
  addCitizen,
  openJobs,
  sameNetwork,
  sendHome,
  setJob,
  tileCenter,
} from '../world/runtime.js';
import { findRoadPath } from './pathfinding.js';
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
    departWork: null,
    departHome: null,
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

/** Contrata: escolhe horários de saída aleatórios em torno das 7h30 e 17h30. */
export function hire(state, rt, citizen, workplace) {
  const departWork = 6 * 60 + 30 + randomInt(state.rng, 0, 120);
  const departHome = 16 * 60 + 30 + randomInt(state.rng, 0, 120);
  setJob(rt, citizen, workplace.id, departWork, departHome);
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
  const workplaces = state.buildings.filter((b) => openJobs(rt, b) > 0 && rt.access.get(b.id) >= 0);
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
