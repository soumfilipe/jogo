// Viagens com horário de chegada. Quem sai de casa (ou do trabalho) recebe,
// uma vez só, o minuto em que vai chegar: `left` (minuto da saída) e `arrive`
// (minuto da chegada) ficam no cidadão, no estado. A simulação não move
// ninguém minuto a minuto; a cada minuto só trata quem sai e quem chega.
// Assim o custo não cresce com o número de carros na rua.
//
// Trânsito por fluxo: cada viagem soma, em cada tile de rua por onde passa,
// os "minutos de carro" que vai passar ali, na janela de TRIP_WINDOW minutos
// em que deve passar (a "carga"). Quem sai depois encontra a carga de quem já
// está na rua e anda mais devagar onde ela passa da capacidade (mesma fórmula
// de systems/traffic.js). A carga é a soma das viagens em andamento, em
// números inteiros: não depende da ordem das somas e é refeita igual a partir
// do estado ao carregar um save (rebuildTrips).
//
// Para a carga e a posição, a viagem segue o "horário livre" (velocidades do
// catálogo, sem modificadores nem trânsito) esticado até o minuto de chegada:
// tudo sai de path, x/y da saída, mode, left, arrive e das ruas, que estão no
// estado. Durante a viagem, c.x, c.y e c.step ficam com o ponto de saída;
// a posição de agora vem de travelPosition (só desenho e câmera).

import { CITIZEN_SPEED, ROAD_TYPES, TRAFFIC } from '../world/catalog.js';
import { mod } from '../systems/mods.js';
import { roadTables } from '../systems/traffic.js';

// Janela de tempo da carga (minutos) e quantas janelas o anel guarda.
export const TRIP_WINDOW = 30;
const WINDOWS = 64;
// Até onde, a partir da saída, a carga é distribuída (o resto vai para a última
// janela). Metade do anel: uma viagem nunca se mistura com uma janela reaproveitada.
const HORIZON = (WINDOWS / 2) * TRIP_WINDOW;
// Peso de um carro na carga (inteiro); o ônibus pesa TRAFFIC.busShare disso.
const UNIT = 100;

// Velocidade livre por tipo de rua (0 = dentro do lote: velocidade 1).
const FREE_SPEED = [1];
const PEDESTRIAN = [false];
for (const [value, type] of Object.entries(ROAD_TYPES)) {
  FREE_SPEED[value] = type.speed;
  PEDESTRIAN[value] = Boolean(type.pedestrian);
}

function modeOf(mode) {
  return mode ? TRAFFIC.modes[mode] : null;
}

/** Peso inteiro do viajante na carga: carro 100, ônibus 15, trilho e a pé 0. */
function weightOf(mode) {
  const m = modeOf(mode);
  if (!m) return UNIT;
  return m.ignoresTraffic ? 0 : Math.round(TRAFFIC.busShare * UNIT);
}

const windowOf = (minute) => Math.floor(minute / TRIP_WINDOW) % WINDOWS;

/**
 * Horário livre: cum[i] = minutos (sem trânsito) até chegar ao tile path[i],
 * saindo de (x0, y0). Devolve { cum, total }. startTrip faz a mesma conta
 * (com os mesmos números) junto com a do trânsito.
 */
function freeSchedule(width, road, path, x0, y0, mode) {
  const speed = CITIZEN_SPEED * (modeOf(mode)?.speed ?? 1);
  const cum = new Float32Array(path.length);
  let x = x0;
  let y = y0;
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const next = path[i];
    const nx = (next % width) + 0.5;
    const ny = Math.floor(next / width) + 0.5;
    const tile = Math.floor(y) * width + Math.floor(x);
    total += (Math.abs(nx - x) + Math.abs(ny - y)) / (speed * FREE_SPEED[road[tile]]);
    cum[i] = total;
    x = nx;
    y = ny;
  }
  return { cum, total };
}

/** Lugar de cada tile de rua na carga (e o tile de cada lugar). */
function roadSlots(map) {
  const slot = new Int32Array(map.road.length).fill(-1);
  const tiles = [];
  for (let t = 0; t < map.road.length; t++) {
    if (map.road[t]) {
      slot[t] = tiles.length;
      tiles.push(t);
    }
  }
  return { slot, tiles: Int32Array.from(tiles) };
}

/**
 * O que a viagem soma na carga: pares (índice na carga, quantidade), a partir
 * do horário livre esticado até `arrive`.
 */
function contributions(state, trips, c, cum, total) {
  const w = weightOf(c.mode);
  if (!w || total <= 0) return EMPTY;
  const { width, road } = state.map;
  const { path } = c;
  const stretch = (c.arrive - c.left + 1) / total;
  const out = new Int32Array(2 * path.length);
  let n = 0;
  let x = c.x;
  let y = c.y;
  for (let i = 0; i < path.length - 1; i++) {
    const tile = Math.floor(y) * width + Math.floor(x);
    const s = trips.slot[tile];
    if (s >= 0 && road[tile] && !PEDESTRIAN[road[tile]]) {
      const amount = Math.round((cum[i + 1] - cum[i]) * stretch * w);
      if (amount > 0) {
        const at = c.left + Math.min(HORIZON, cum[i] * stretch);
        out[n++] = windowOf(at) * trips.slots + s;
        out[n++] = amount;
      }
    }
    x = (path[i + 1] % width) + 0.5;
    y = Math.floor(path[i + 1] / width) + 0.5;
  }
  return out.slice(0, n);
}
const EMPTY = new Int32Array(0);

function addTrip(state, rt, c, cum, total) {
  const trips = rt.trips;
  const parts = contributions(state, trips, c, cum, total);
  for (let i = 0; i < parts.length; i += 2) trips.load[parts[i]] += parts[i + 1];
  trips.byId.set(c.id, { cum, total, parts });
  let due = trips.arrivals.get(c.arrive);
  if (!due) trips.arrivals.set(c.arrive, (due = new Set()));
  due.add(c.id);
  rt.movers.add(c.id);
}

/**
 * Tira a viagem do cidadão da carga, das chegadas e de rt.movers (chegou,
 * desistiu, foi teleportado ou saiu da cidade).
 */
export function endTrip(rt, c) {
  rt.movers.delete(c.id);
  const trips = rt.trips;
  const trip = trips?.byId.get(c.id);
  if (!trip) return;
  for (let i = 0; i < trip.parts.length; i += 2) trips.load[trip.parts[i]] -= trip.parts[i + 1];
  trips.byId.delete(c.id);
  trips.arrivals.get(c.arrive)?.delete(c.id);
}

/**
 * Remonta a carga e as chegadas a partir das viagens do estado. Roda ao montar
 * o runtime e quando as ruas mudam (o horário livre depende delas).
 */
export function rebuildTrips(state, rt) {
  const { slot, tiles } = roadSlots(state.map);
  rt.trips = {
    slot,
    tiles,
    slots: tiles.length,
    load: new Int32Array(WINDOWS * tiles.length),
    byId: new Map(),
    arrivals: new Map(),
  };
  const { width, road } = state.map;
  for (const c of state.citizens) {
    if (c.state !== 'viajando') continue;
    // Save de antes das viagens com horário: segue do ponto onde estava.
    if (c.left == null) migrateTrip(state.map, c, state.time.tick);
    const { cum, total } = freeSchedule(width, road, c.path, c.x, c.y, c.mode);
    addTrip(state, rt, c, cum, total);
  }
}

/**
 * Começa a viagem de `c` (já com path, x, y e mode) no minuto atual: calcula
 * a chegada pelo trânsito que as viagens em andamento vão fazer no caminho.
 */
export function startTrip(state, rt, c) {
  const { width, road } = state.map;
  const path = c.path;
  const cum = new Float32Array(path.length);
  const freeSpeed = CITIZEN_SPEED * (modeOf(c.mode)?.speed ?? 1);
  let total = 0;
  const trips = rt.trips;
  const tables = roadTables(rt);
  const mode = modeOf(c.mode);
  const speed = mod(rt, 'citizenSpeed', CITIZEN_SPEED) * (mode ? mode.speed : 1);
  const jams = !mode?.ignoresTraffic;
  const now = state.time.tick;
  const perWindow = TRIP_WINDOW * UNIT;
  let minutes = 0;
  let x = c.x;
  let y = c.y;
  for (let i = 1; i < path.length; i++) {
    const next = path[i];
    const nx = (next % width) + 0.5;
    const ny = Math.floor(next / width) + 0.5;
    const tile = Math.floor(y) * width + Math.floor(x);
    const type = road[tile];
    // Horário livre (a mesma conta de freeSchedule).
    total += (Math.abs(nx - x) + Math.abs(ny - y)) / (freeSpeed * FREE_SPEED[type]);
    cum[i] = total;
    let factor = 1;
    if (type) {
      let jam = 1;
      if (jams) {
        const s = trips.slot[tile];
        const cars = s >= 0 ? trips.load[windowOf(now + Math.min(HORIZON, minutes)) * trips.slots + s] / perWindow : 0;
        const excess = Math.max(0, cars / tables.capacity[type] - 1);
        jam = 1 / (1 + TRAFFIC.slowdown * excess * tables.congestion);
      }
      factor = tables.speed[type] * jam;
    }
    minutes += (Math.abs(nx - x) + Math.abs(ny - y)) / (speed * factor);
    x = nx;
    y = ny;
  }
  // Anda já no minuto da saída: chega no minuto em que completa o caminho.
  c.left = now;
  c.arrive = now + Math.max(0, Math.ceil(minutes - 1e-9) - 1);
  addTrip(state, rt, c, cum, total);
}

/** Quem chega neste minuto (em ordem de id): vai para o destino. */
export function finishArrivals(state, rt) {
  const due = rt.trips.arrivals.get(state.time.tick);
  if (!due) return;
  rt.trips.arrivals.delete(state.time.tick);
  const width = state.map.width;
  for (const id of [...due].sort((a, b) => a - b)) {
    const c = rt.citizenById.get(id);
    endTrip(rt, c);
    const last = c.path[c.path.length - 1];
    c.x = (last % width) + 0.5;
    c.y = Math.floor(last / width) + 0.5;
    c.state = c.dest;
    c.dest = null;
    c.mode = null;
    c.path = null;
    c.step = 0;
    c.left = null;
    c.arrive = null;
  }
}

/**
 * Onde o viajante está agora: { x, y, step } (step = último tile do caminho
 * já alcançado). Só para desenho, câmera e o desvio quando uma rua some.
 */
export function travelPosition(state, rt, c) {
  const trip = rt.trips?.byId.get(c.id);
  if (!trip || !c.path) return { x: c.x, y: c.y, step: c.step };
  const { cum, total } = trip;
  const span = c.arrive - c.left + 1;
  const done = Math.min(1, Math.max(0, (state.time.tick - c.left + 1) / span)) * total;
  // Último tile com cum <= done (busca binária).
  let lo = 0;
  let hi = cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (cum[mid] <= done) lo = mid;
    else hi = mid - 1;
  }
  const width = state.map.width;
  const ax = lo === 0 ? c.x : (c.path[lo] % width) + 0.5;
  const ay = lo === 0 ? c.y : Math.floor(c.path[lo] / width) + 0.5;
  if (lo >= cum.length - 1) return { x: ax, y: ay, step: lo };
  const bx = (c.path[lo + 1] % width) + 0.5;
  const by = Math.floor(c.path[lo + 1] / width) + 0.5;
  const seg = cum[lo + 1] - cum[lo];
  const f = seg > 0 ? (done - cum[lo]) / seg : 0;
  return { x: ax + (bx - ax) * f, y: ay + (by - ay) * f, step: lo };
}

/**
 * Carros na rua agora, por tile (a carga da janela atual ÷ a duração dela),
 * somados em `occ`; devolve os tiles tocados em `touched`.
 */
export function addTripOccupancy(state, rt, occ, touched) {
  const trips = rt.trips;
  if (!trips) return;
  const base = windowOf(state.time.tick) * trips.slots;
  const perWindow = TRIP_WINDOW * UNIT;
  for (let s = 0; s < trips.slots; s++) {
    const v = trips.load[base + s];
    if (v <= 0) continue;
    const t = trips.tiles[s];
    if (occ[t] === 0) touched.push(t);
    occ[t] += v / perWindow;
  }
}

/**
 * Viagem de um save antigo (posição no meio do caminho, sem horário): segue
 * do ponto atual, no horário livre, a partir do próximo minuto.
 */
export function migrateTrip(map, c, tick) {
  const path = c.path.slice(c.step);
  const { total } = freeSchedule(map.width, map.road, path, c.x, c.y, c.mode);
  c.path = path;
  c.step = 0;
  c.left = tick + 1;
  c.arrive = c.left + Math.max(0, Math.ceil(total - 1e-9) - 1);
}
