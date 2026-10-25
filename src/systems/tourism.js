// Turismo: visitantes que chegam pelas estradas da borda do mapa (ou pelo
// aeroporto), vão a uma atração, ficam algumas horas e vão embora. Andam
// pelas ruas como carros (e entram no trânsito). Em dia de jogo, parte da
// torcida sai das casas da própria cidade.
//
// À meia-noite, planDay() decide quantos virão hoje a cada atração (com o
// calendário de eventos, ver events.js) e sorteia a hora de cada chegada:
// state.tourism.plan, em ordem de chegada. O gasto dos turistas do dia (mais
// o de quem dorme num hotel) entra em state.economy.tourism e vira receita
// no fechamento do mês.
//
// Formato de um visitante no estado (state.visitors):
//   { id, src: tile de onde veio (e para onde volta), dest: id da atração,
//     until: minuto do dia em que vai embora, fan: torcedor da cidade?,
//     state: 'indo' | 'visitando' | 'voltando', x, y, path, step }

import { BUILDINGS, TOURISM, ZONE } from '../world/catalog.js';
import { CITIZEN_SPEED } from '../world/catalog.js';
import { MINUTES_PER_DAY, calendar } from '../core/time.js';
import { randomInt } from '../core/rng.js';
import { findRoadPath } from '../agents/pathfinding.js';
import { attractionAppeal, eventMultiplier, todaysEvents } from './events.js';
import { congestionFactor, roadSpeed } from './traffic.js';
import { mod } from './mods.js';

export function createTourism() {
  return { plan: [] }; // { at: minuto do dia, dest, src, until, fan }
}

/** Índices do runtime: rt.visitorById e rt.visitorMovers (os que estão andando). */
export function indexVisitors(state, rt) {
  rt.visitorById = new Map();
  rt.visitorMovers = new Set();
  for (const v of state.visitors) {
    rt.visitorById.set(v.id, v);
    if (v.state !== 'visitando') rt.visitorMovers.add(v.id);
  }
}

const staffed = (rt, b) => (rt.workers.get(b.id)?.size ?? 0) > 0;

/** Tiles de rua por onde chegam turistas: ruas na borda do mapa e acessos de aeroportos. */
export function entryTiles(state, rt) {
  const { width, height, road } = state.map;
  const tiles = [];
  for (let x = 0; x < width; x++) {
    if (road[x]) tiles.push(x);
    if (road[(height - 1) * width + x]) tiles.push((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y++) {
    if (road[y * width]) tiles.push(y * width);
    if (road[y * width + width - 1]) tiles.push(y * width + width - 1);
  }
  let gateway = 1;
  for (const b of state.buildings) {
    const g = BUILDINGS[b.type].utility?.gateway;
    if (!g || !staffed(rt, b) || rt.access.get(b.id) < 0) continue;
    tiles.push(rt.access.get(b.id));
    gateway = Math.max(gateway, g.tourism);
  }
  return { tiles, gateway };
}

/** Turistas de hoje por atração: [{ b, tourists, fans }] (fans: torcida da cidade). */
export function todaysVisits(state, rt, events = todaysEvents(state, rt)) {
  const { tiles, gateway } = entryTiles(state, rt);
  const outside = tiles.length > 0;
  const cityMul = mod(rt, 'tourism') * eventMultiplier(events) * gateway;
  const visits = [];
  for (const b of state.buildings) {
    if (!staffed(rt, b) || rt.access.get(b.id) < 0) continue;
    const appeal = attractionAppeal(b.type, events);
    if (!appeal) continue;
    const isGame = events.game && BUILDINGS[b.type].utility.tourism.game;
    const total = Math.round(appeal * cityMul);
    const fans = isGame ? Math.round(total * TOURISM.localFans) : 0;
    visits.push({ b, tourists: outside ? total - fans : 0, fans, game: Boolean(isGame) });
  }
  return { visits, entries: tiles };
}

/**
 * Turistas por dia nos parques de conservação (não aparecem andando: entram
 * só no gasto do dia).
 */
export function parkTourists(state, rt) {
  const park = state.map.park;
  if (!park) return 0;
  let tiles = 0;
  for (let i = 0; i < park.length; i++) tiles += park[i];
  return Math.round(tiles * TOURISM.parkAppeal * mod(rt, 'tourism'));
}

/** Quartos de hotel com funcionários. */
export function hotelRooms(state, rt) {
  let rooms = 0;
  for (const b of state.buildings) {
    const h = BUILDINGS[b.type].utility?.hotel;
    if (h && staffed(rt, b)) rooms += h.rooms;
  }
  return rooms;
}

/** Gasto dos turistas de um dia com `tourists` visitantes de fora. */
export function touristSpending(state, rt, tourists) {
  return tourists * TOURISM.daySpend + Math.min(tourists, hotelRooms(state, rt)) * TOURISM.hotelSpend;
}

/**
 * Meia-noite: monta o plano de chegadas do dia e soma o gasto dos turistas.
 * Os que aparecem andando são limitados a TOURISM.maxVisitors por dia (cada
 * carro vale por vários turistas quando passa disso).
 */
export function planDay(state, rt) {
  const events = todaysEvents(state, rt);
  const { visits, entries } = todaysVisits(state, rt, events);
  let outside = parkTourists(state, rt);
  let wanted = 0;
  for (const v of visits) {
    outside += v.tourists;
    wanted += v.tourists + v.fans;
  }
  state.economy.tourism = (state.economy.tourism ?? 0) + touristSpending(state, rt, outside);
  state.tourism.today = { tourists: outside, fans: visits.reduce((s, v) => s + v.fans, 0) };

  const scale = wanted > TOURISM.maxVisitors ? TOURISM.maxVisitors / wanted : 1;
  const homes = state.buildings.filter((b) => BUILDINGS[b.type].zone === ZONE.RESIDENTIAL && rt.access.get(b.id) >= 0);
  const plan = [];
  for (const v of visits) {
    const [a0, a1] = v.game ? TOURISM.gameArrive : TOURISM.arrive;
    const add = (count, src, fan) => {
      for (let i = 0; i < count; i++) {
        const at = randomInt(state.rng, a0, a1);
        const until = v.game ? TOURISM.gameEnd : Math.min(MINUTES_PER_DAY - 30, at + randomInt(state.rng, TOURISM.stay[0], TOURISM.stay[1]));
        plan.push({ at, dest: v.b.id, src: src(), until, fan });
      }
    };
    add(Math.round(v.tourists * scale), () => entries[randomInt(state.rng, 0, entries.length - 1)], false);
    if (homes.length) add(Math.round(v.fans * scale), () => rt.access.get(homes[randomInt(state.rng, 0, homes.length - 1)].id), true);
  }
  plan.sort((a, b) => a.at - b.at || a.dest - b.dest || a.src - b.src);
  state.tourism.plan = plan;

  // Aviso na tela no primeiro dia de cada festa.
  const c = calendar(state.time.tick);
  const announce = (name, text) => (rt.events ??= []).push({ kind: 'festa', name, text });
  if (events.carnaval && c.day === TOURISM.carnaval.days[0]) announce('Carnaval', 'Cinco dias de festa: mais turistas, mais satisfação e trânsito pesado.');
  if (events.mega && c.day === 1) announce('Megaevento esportivo', 'Um mês com o triplo de turistas na cidade.');
}

function route(state, rt, from, to) {
  const key = -(from * 100_000 + to) - 1; // chaves negativas: não colidem com as dos cidadãos
  let r = rt.pathCache.get(key);
  if (r === undefined) {
    r = findRoadPath(state.map, from, to);
    rt.pathCache.set(key, r && Int32Array.from(r));
  }
  return r;
}

function addVisitor(state, rt, v) {
  v.id = state.nextId++;
  state.visitors.push(v);
  rt.visitorById.set(v.id, v);
  rt.visitorMovers.add(v.id);
}

function removeVisitor(state, rt, v) {
  rt.visitorById.delete(v.id);
  rt.visitorMovers.delete(v.id);
  const i = state.visitors.indexOf(v);
  if (i >= 0) state.visitors.splice(i, 1);
}

/** Roda a cada tick, depois dos cidadãos (com a mesma ocupação das ruas). */
export function updateVisitors(state, rt) {
  const minute = state.time.tick % MINUTES_PER_DAY;
  const width = state.map.width;
  const plan = state.tourism.plan;

  // Chegadas deste minuto.
  while (plan.length && plan[0].at <= minute) {
    const p = plan.shift();
    const dest = rt.buildingById.get(p.dest);
    const access = dest ? rt.access.get(dest.id) : -1;
    if (access < 0 || !state.map.road[p.src] || rt.roadComponent[p.src] !== rt.roadComponent[access]) continue;
    const r = route(state, rt, p.src, access);
    if (!r) continue;
    addVisitor(state, rt, {
      id: 0, src: p.src, dest: p.dest, until: p.until, fan: p.fan, state: 'indo',
      x: (p.src % width) + 0.5, y: Math.floor(p.src / width) + 0.5, path: [...r, dest.tile], step: 0,
    });
  }

  // Hora de ir embora.
  for (const v of [...state.visitors]) {
    if (v.state !== 'visitando' || minute < v.until) continue;
    const dest = rt.buildingById.get(v.dest);
    const access = dest ? rt.access.get(dest.id) : -1;
    const r = access >= 0 && state.map.road[v.src] ? route(state, rt, access, v.src) : null;
    if (!r) {
      removeVisitor(state, rt, v);
      continue;
    }
    Object.assign(v, { state: 'voltando', path: [dest.tile, ...r], step: 0 });
    rt.visitorMovers.add(v.id);
  }

  moveVisitors(state, rt);
}

function moveVisitors(state, rt) {
  if (rt.visitorMovers.size === 0) return;
  const { width, road } = state.map;
  const speed = mod(rt, 'citizenSpeed', CITIZEN_SPEED);
  for (const id of [...rt.visitorMovers]) {
    const v = rt.visitorById.get(id);
    const tile = Math.floor(v.y) * width + Math.floor(v.x);
    const type = road[tile];
    // Rua demolida no caminho: o visitante desiste e some.
    const next = v.path[v.step + 1];
    if (next !== undefined && v.step + 1 < v.path.length - 1 && !road[next]) {
      removeVisitor(state, rt, v);
      continue;
    }
    let budget = speed * (type ? roadSpeed(rt, type) * congestionFactor(rt, tile, type) : 1);
    while (budget > 0 && v.step < v.path.length - 1) {
      const t = v.path[v.step + 1];
      const nx = (t % width) + 0.5;
      const ny = Math.floor(t / width) + 0.5;
      const dx = nx - v.x;
      const dy = ny - v.y;
      const dist = Math.abs(dx) + Math.abs(dy);
      if (dist <= budget) {
        v.x = nx;
        v.y = ny;
        v.step++;
        budget -= dist;
      } else {
        v.x += (dx / dist) * budget;
        v.y += (dy / dist) * budget;
        budget = 0;
      }
    }
    if (v.step >= v.path.length - 1) {
      if (v.state === 'voltando' || !rt.buildingById.has(v.dest)) {
        removeVisitor(state, rt, v);
      } else {
        Object.assign(v, { state: 'visitando', path: null, step: 0 });
        rt.visitorMovers.delete(id);
      }
    }
  }
}

/** Turistas na atração agora (para o inspetor). */
export function visitorsAt(state, buildingId) {
  let n = 0;
  for (const v of state.visitors) if (v.dest === buildingId && v.state === 'visitando') n++;
  return n;
}

/** Dia de hoje no calendário, para avisos (ex.: carnaval começando). */
export function todayKey(state) {
  const c = calendar(state.time.tick);
  return `${c.year}-${c.month}-${c.day}`;
}
