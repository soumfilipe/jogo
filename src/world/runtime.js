// Índices derivados do estado: NÃO são salvos, são reconstruídos ao carregar
// (buildRuntime) e mantidos atualizados pelas funções deste módulo. Qualquer
// mudança em prédios, cidadãos ou estradas deve passar por aqui.

import { BUILDINGS, ROAD_ACCESS_RADIUS, TERRAIN } from './catalog.js';

export function buildRuntime(state) {
  const { width, height } = state.map;
  const rt = {
    buildingById: new Map(),
    citizenById: new Map(),
    buildingAt: new Int32Array(width * height), // id do prédio em cada tile (0 = nenhum)
    residents: new Map(), // id do prédio -> Set de ids de cidadãos
    workers: new Map(), //   id do prédio -> Set de ids de cidadãos
    departures: new Map(), // minuto do dia -> Set de ids de cidadãos
    movers: new Set(), //    cidadãos andando agora
    roadComponent: new Int32Array(width * height), // rede de estradas de cada tile (0 = sem)
    access: new Map(), //    id do prédio -> tile de estrada de acesso (-1 = sem acesso)
    pathCache: new Map(),
    demand: { residential: 0, commercial: 0, industrial: 0 },
    landValue: new Float32Array(width * height), // 0 a 1, ver systems/landvalue.js
    pollution: new Float32Array(width * height), // 0 a 1
    // Incrementado a cada mudança visível no mapa (o renderizador usa como cache).
    mapVersion: 0,
    // O que mudou desde o último desenho: pares [tile, tamanho] dos trechos
    // alterados, ou dirtyAll quando é preciso redesenhar tudo (ver touchMap).
    dirtyTiles: [],
    dirtyAll: true,
  };

  for (const b of state.buildings) indexBuilding(state, rt, b);
  for (const c of state.citizens) indexCitizen(rt, c);
  recomputeRoads(state, rt, { reroute: false });
  return rt;
}

/**
 * Avisa o renderizador que o mapa mudou: no trecho size x size a partir de
 * `tile` ou, sem `tile`, no mapa todo. Assim ele redesenha só o que mudou.
 */
export function touchMap(rt, tile = -1, size = 1) {
  rt.mapVersion++;
  if (rt.dirtyAll) return;
  // Muita coisa pendente (ex.: simulação sem tela): redesenha tudo de uma vez.
  if (tile < 0 || rt.dirtyTiles.length >= MAX_DIRTY * 2) {
    rt.dirtyAll = true;
    rt.dirtyTiles.length = 0;
    return;
  }
  rt.dirtyTiles.push(tile, size);
}
const MAX_DIRTY = 400;

// ---------------------------------------------------------------------------
// Prédios
// ---------------------------------------------------------------------------

/** Cria um prédio com o canto de cima (menor x e y) em `tile`. */
export function addBuilding(state, rt, type, tile) {
  const building = { id: state.nextId++, type, tile, builtAt: state.time.tick };
  state.buildings.push(building);
  for (const t of footprint(state, building)) {
    if (state.map.terrain[t] === TERRAIN.FOREST) state.map.terrain[t] = TERRAIN.GRASS;
  }
  indexBuilding(state, rt, building);
  rt.access.set(building.id, findAccessRoad(state, rt, tile, BUILDINGS[type].size));
  touchMap(rt, tile, BUILDINGS[type].size);
  return building;
}

export function removeBuilding(state, rt, id) {
  const building = rt.buildingById.get(id);
  if (!building) return;

  for (const cid of [...(rt.residents.get(id) || [])]) removeCitizen(state, rt, cid);
  for (const cid of [...(rt.workers.get(id) || [])]) {
    const citizen = rt.citizenById.get(cid);
    if (citizen.state !== 'casa') sendHome(state, rt, citizen);
    setJob(rt, citizen, null);
  }

  state.buildings.splice(state.buildings.indexOf(building), 1);
  rt.buildingById.delete(id);
  for (const t of footprint(state, building)) rt.buildingAt[t] = 0;
  rt.residents.delete(id);
  rt.workers.delete(id);
  rt.access.delete(id);
  touchMap(rt, building.tile, BUILDINGS[building.type].size);
}

function indexBuilding(state, rt, b) {
  rt.buildingById.set(b.id, b);
  for (const t of footprint(state, b)) rt.buildingAt[t] = b.id;
  rt.residents.set(b.id, new Set());
  rt.workers.set(b.id, new Set());
}

export function buildingInfo(b) {
  return BUILDINGS[b.type];
}

/** Tiles ocupados por um prédio (1 para 1x1, 4 para 2x2). */
export function footprint(state, b) {
  const size = BUILDINGS[b.type].size;
  if (size === 1) return [b.tile];
  const width = state.map.width;
  const tiles = [];
  for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) tiles.push(b.tile + dy * width + dx);
  return tiles;
}

/** Tile da frente do prédio (maior x+y): é nele que o renderizador o desenha. */
export function frontTile(state, b) {
  const size = BUILDINGS[b.type].size;
  return b.tile + (size - 1) * (state.map.width + 1);
}

// Prédio abandonado não recebe moradores nem contrata.
export function vacancies(rt, b) {
  if (b.abandoned !== undefined) return 0;
  return BUILDINGS[b.type].residents - rt.residents.get(b.id).size;
}

export function openJobs(rt, b) {
  if (b.abandoned !== undefined) return 0;
  return BUILDINGS[b.type].jobs - rt.workers.get(b.id).size;
}

// ---------------------------------------------------------------------------
// Cidadãos
// ---------------------------------------------------------------------------

export function addCitizen(state, rt, citizen) {
  citizen.id = state.nextId++;
  state.citizens.push(citizen);
  indexCitizen(rt, citizen);
  return citizen;
}

export function removeCitizen(state, rt, id) {
  const citizen = rt.citizenById.get(id);
  if (!citizen) return;
  setJob(rt, citizen, null);
  rt.residents.get(citizen.home)?.delete(id);
  rt.movers.delete(id);
  rt.citizenById.delete(id);
  state.citizens.splice(state.citizens.indexOf(citizen), 1);
}

function indexCitizen(rt, c) {
  rt.citizenById.set(c.id, c);
  rt.residents.get(c.home).add(c.id);
  if (c.job !== null) {
    rt.workers.get(c.job).add(c.id);
    addDeparture(rt, c.departWork, c.id);
    addDeparture(rt, c.departHome, c.id);
  }
  if (c.state === 'viajando') rt.movers.add(c.id);
}

/** Define (ou remove, com null) o emprego do cidadão e seus horários. */
export function setJob(rt, citizen, jobId, departWork = 0, departHome = 0) {
  if (citizen.job !== null) {
    rt.workers.get(citizen.job)?.delete(citizen.id);
    rt.departures.get(citizen.departWork)?.delete(citizen.id);
    rt.departures.get(citizen.departHome)?.delete(citizen.id);
  }
  citizen.job = jobId;
  citizen.departWork = jobId === null ? null : departWork;
  citizen.departHome = jobId === null ? null : departHome;
  if (jobId === null) citizen.shift = null;
  if (jobId !== null) {
    rt.workers.get(jobId).add(citizen.id);
    addDeparture(rt, departWork, citizen.id);
    addDeparture(rt, departHome, citizen.id);
  }
}

function addDeparture(rt, minute, id) {
  if (!rt.departures.has(minute)) rt.departures.set(minute, new Set());
  rt.departures.get(minute).add(id);
}

/** Teleporta o cidadão para casa (usado quando a viagem fica impossível). */
export function sendHome(state, rt, citizen) {
  const home = rt.buildingById.get(citizen.home);
  const [x, y] = tileCenter(state, home.tile);
  Object.assign(citizen, { state: 'casa', dest: null, path: null, step: 0, x, y });
  rt.movers.delete(citizen.id);
}

// ---------------------------------------------------------------------------
// Estradas
// ---------------------------------------------------------------------------

/**
 * Recalcula as redes de estrada (componentes conectados) e o acesso de cada
 * prédio. Com reroute, também resolve as consequências: quem estava andando
 * por uma estrada removida chega direto, e quem não alcança mais o trabalho
 * perde o emprego.
 */
export function recomputeRoads(state, rt, { reroute = true } = {}) {
  const { width, height, road } = state.map;
  const comp = rt.roadComponent;
  comp.fill(0);
  let label = 0;
  const stack = [];
  for (let start = 0; start < road.length; start++) {
    if (!road[start] || comp[start]) continue;
    label++;
    comp[start] = label;
    stack.push(start);
    while (stack.length) {
      const t = stack.pop();
      const x = t % width;
      const y = (t - x) / width;
      if (x > 0) visit(t - 1);
      if (x < width - 1) visit(t + 1);
      if (y > 0) visit(t - width);
      if (y < height - 1) visit(t + width);
    }
  }
  function visit(n) {
    if (road[n] && !comp[n]) {
      comp[n] = label;
      stack.push(n);
    }
  }

  for (const b of state.buildings) rt.access.set(b.id, findAccessRoad(state, rt, b.tile, BUILDINGS[b.type].size));
  rt.pathCache.clear();
  touchMap(rt);

  if (!reroute) return;

  for (const id of [...rt.movers]) {
    const c = rt.citizenById.get(id);
    const blocked = c.path.slice(c.step + 1, -1).some((t) => !road[t]);
    if (!blocked) continue;
    const target = rt.buildingById.get(c.dest === 'trabalho' ? c.job : c.home);
    if (c.dest === 'trabalho' && target && sameNetwork(rt, c.home, c.job)) {
      const [x, y] = tileCenter(state, target.tile);
      Object.assign(c, { state: 'trabalho', dest: null, path: null, step: 0, x, y });
      rt.movers.delete(id);
    } else {
      sendHome(state, rt, c);
    }
  }

  for (const c of state.citizens) {
    if (c.job !== null && !sameNetwork(rt, c.home, c.job)) {
      if (c.state !== 'casa') sendHome(state, rt, c);
      setJob(rt, c, null);
    }
  }
}

export function sameNetwork(rt, buildingA, buildingB) {
  const a = rt.access.get(buildingA);
  const b = rt.access.get(buildingB);
  return a >= 0 && b >= 0 && rt.roadComponent[a] === rt.roadComponent[b];
}

// Deslocamentos ordenados por distância: o acesso escolhido é sempre a
// estrada mais próxima, com desempate fixo (determinístico).
const ACCESS_OFFSETS = [];
for (let dy = -ROAD_ACCESS_RADIUS; dy <= ROAD_ACCESS_RADIUS; dy++) {
  for (let dx = -ROAD_ACCESS_RADIUS; dx <= ROAD_ACCESS_RADIUS; dx++) {
    const d = Math.abs(dx) + Math.abs(dy);
    if (d > 0 && d <= ROAD_ACCESS_RADIUS) ACCESS_OFFSETS.push([dx, dy, d]);
  }
}
ACCESS_OFFSETS.sort((a, b) => a[2] - b[2] || a[1] - b[1] || a[0] - b[0]);

/**
 * Tile de estrada mais próximo (até ROAD_ACCESS_RADIUS) de qualquer tile de
 * um terreno size x size com canto em `tile`, ou -1.
 */
export function findAccessRoad(state, rt, tile, size = 1) {
  const { width, height, road } = state.map;
  const x0 = tile % width;
  const y0 = (tile - x0) / width;
  let best = -1;
  let bestDist = Infinity;
  for (let sy = 0; sy < size; sy++) {
    for (let sx = 0; sx < size; sx++) {
      for (const [dx, dy, d] of ACCESS_OFFSETS) {
        if (d >= bestDist) break;
        const nx = x0 + sx + dx;
        const ny = y0 + sy + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        if (road[ny * width + nx]) {
          best = ny * width + nx;
          bestDist = d;
          break;
        }
      }
    }
  }
  return best;
}

export function tileCenter(state, tile) {
  const x = tile % state.map.width;
  return [x + 0.5, (tile - x) / state.map.width + 0.5];
}
