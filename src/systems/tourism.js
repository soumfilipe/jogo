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
//   { id, src: tile de onde veio (e para onde volta), dest: id da atração
//     (null quando o destino é um tile de rua, destTile, como um calçadão),
//     until: minuto do dia em que vai embora, fan: torcedor da cidade?,
//     event?: id do evento da agenda (ver agenda.js), match?: id do jogo (ver sports.js),
//     race?: id da corrida de rua (ver races.js; corre o percurso com o ritmo `pace`),
//     commute?: true para quem vem trabalhar de fora ou vai trabalhar fora (ver metro.js),
//     state: 'indo' | 'visitando' | 'voltando', x, y, path, step }

import { BUILDINGS, CULTURE, METRO, SPORTS, TOURISM } from '../world/catalog.js';
import { CITIZEN_SPEED } from '../world/catalog.js';
import { touristWeather } from './weather.js';
import { MINUTES_PER_DAY, calendar } from '../core/time.js';
import { randomInt } from '../core/rng.js';
import { findRoadPath } from '../agents/pathfinding.js';
import { attractionAppeal, eventMultiplier, todaysEvents } from './events.js';
import { congestionFactor, roadSpeed } from './traffic.js';
import { mod } from './mods.js';
import { eventsToday, venueOf } from './agenda.js';
import { clubHomes, matchesToday } from './sports.js';
import { raceWave, runnerPace, runnersToday } from './races.js';
import { commutersIn, commutersOut } from './metro.js';
import { openJobs } from '../world/runtime.js';

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
  // Campo, estádio ou ginásio com clube: a torcida vem dos jogos do clube (ver sports.js).
  const clubs = clubHomes(state);
  for (const b of state.buildings) {
    if (!staffed(rt, b) || rt.access.get(b.id) < 0) continue;
    const today = clubs.has(b.id) ? { ...events, game: false } : events;
    const appeal = attractionAppeal(b.type, today, state.culture, state.time.tick);
    if (!appeal) continue;
    const isGame = today.game && BUILDINGS[b.type].utility.tourism.game;
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
  // Chuva espanta parte de quem vem ver a mata.
  return Math.round(tiles * TOURISM.parkAppeal * mod(rt, 'tourism') * touristWeather(state));
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
  // Público dos eventos da agenda (já sorteado por runEventsOfDay): parte da
  // cidade, parte de fora (se há por onde chegar).
  // Torcida dos jogos em casa dos clubes da cidade: chega antes e fica umas duas horas.
  const share = (total) => (entries.length ? Math.round(total * (1 - TOURISM.localFans)) : 0);
  const crowds = eventsToday(state).map((ev) => {
    const venue = venueOf(state, rt, ev.venue);
    const total = ev.results[ev.results.length - 1] ?? 0;
    const [h0, h1] = CULTURE.eventTypes[ev.type].hours;
    return { tag: { event: ev.id }, venue, total, fromOutside: share(total), h0, h1 };
  }).filter((c) => c.venue && c.total > 0);
  for (const { fx, club } of matchesToday(state)) {
    const b = rt.buildingById.get(club.home);
    if (!b) continue;
    const hour = SPORTS.kinds[club.sport].hour;
    crowds.push({ tag: { match: fx.id }, venue: { building: b.id, tile: b.tile }, total: fx.attendance, fromOutside: share(fx.attendance), h0: hour, h1: hour + 2 });
  }
  let outside = parkTourists(state, rt);
  let wanted = 0;
  for (const v of visits) {
    outside += v.tourists;
    wanted += v.tourists + v.fans;
  }
  for (const c of crowds) {
    outside += c.fromOutside;
    wanted += c.total;
  }
  // Corrida de rua: os corredores de fora também gastam na cidade.
  const races = runnersToday(state);
  for (const r of races) {
    outside += entries.length ? Math.min(r.runners, SPORTS.race.regional) : 0;
    wanted += r.runners;
  }
  state.economy.tourism = (state.economy.tourism ?? 0) + touristSpending(state, rt, outside);
  state.tourism.today = { tourists: outside, fans: visits.reduce((s, v) => s + v.fans, 0) };

  const scale = wanted > TOURISM.maxVisitors ? TOURISM.maxVisitors / wanted : 1;
  const homes = state.buildings.filter((b) => BUILDINGS[b.type].residents && rt.access.get(b.id) >= 0);
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
  // Público dos eventos e dos jogos: chega de 2h a 10 min antes e vai embora no fim.
  for (const { tag, venue, total, fromOutside, h0, h1 } of crowds) {
    const until = Math.min(MINUTES_PER_DAY - 30, h1 * 60);
    const dest = venue.building;
    const destTile = dest === null ? venue.tile : undefined;
    const add = (count, src, fan) => {
      for (let i = 0; i < count; i++) {
        const p = { at: randomInt(state.rng, h0 * 60 - 120, h0 * 60 - 10), dest, src: src(), until, fan, ...tag };
        if (destTile !== undefined) p.destTile = destTile;
        plan.push(p);
      }
    };
    add(Math.round(fromOutside * scale), () => entries[randomInt(state.rng, 0, entries.length - 1)], false);
    if (homes.length) add(Math.round((total - fromOutside) * scale), () => rt.access.get(homes[randomInt(state.rng, 0, homes.length - 1)].id), true);
  }
  // Região metropolitana: uma amostra de quem vem trabalhar de fora (das
  // entradas até prédios com vagas) e de quem trabalha fora (das casas até a
  // borda); chegam de manhã e voltam no fim da tarde.
  if (entries.length) {
    const sample = (n) => Math.min(METRO.visible, n);
    const jobsAt = state.buildings.filter((b) => openJobs(rt, b) > 0 && rt.access.get(b.id) >= 0);
    const inside = jobsAt.length ? sample(commutersIn(state, rt).total) : 0;
    for (let i = 0; i < inside; i++) {
      const b = jobsAt[randomInt(state.rng, 0, jobsAt.length - 1)];
      plan.push({ at: randomInt(state.rng, 6 * 60 + 30, 8 * 60), dest: b.id, src: entries[randomInt(state.rng, 0, entries.length - 1)], until: randomInt(state.rng, 17 * 60, 18 * 60), fan: false, commute: true });
    }
    const leaving = homes.length ? sample(commutersOut(state, rt)) : 0;
    for (let i = 0; i < leaving; i++) {
      const home = homes[randomInt(state.rng, 0, homes.length - 1)];
      plan.push({ at: randomInt(state.rng, 6 * 60, 7 * 60 + 30), dest: null, destTile: entries[randomInt(state.rng, 0, entries.length - 1)], src: rt.access.get(home.id), until: randomInt(state.rng, 17 * 60, 18 * 60), fan: false, commute: true });
    }
  }
  // Corredores: largam em ondas a partir das 7h e correm o percurso (as ruas estão fechadas).
  for (const r of races) {
    const until = SPORTS.race.closed[1] * 60 - 1;
    for (let i = 0; i < Math.round(r.runners * scale); i++) {
      plan.push({ at: raceWave(state.rng), dest: null, destTile: r.route[r.route.length - 1], src: r.route[0], until, fan: false, race: r.id, pace: runnerPace(state.rng) });
    }
  }
  plan.sort((a, b) => a.at - b.at || (a.dest ?? -1) - (b.dest ?? -1) || (a.destTile ?? -1) - (b.destTile ?? -1) || a.src - b.src);
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
    r = findRoadPath(state.map, from, to, rt.blocked);
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
    const dest = p.dest !== null ? rt.buildingById.get(p.dest) : null;
    const access = dest ? rt.access.get(dest.id) : p.dest === null && state.map.road[p.destTile] ? p.destTile : -1;
    if (access < 0 || !state.map.road[p.src] || rt.roadComponent[p.src] !== rt.roadComponent[access]) continue;
    // Corredor: o caminho é o percurso da corrida (fechado para os carros).
    const course = p.race ? state.sports.races.find((x) => x.id === p.race)?.route : null;
    const r = course ? [...course] : route(state, rt, p.src, access);
    if (!r) continue;
    const v = {
      id: 0, src: p.src, dest: p.dest, until: p.until, fan: p.fan, state: 'indo',
      x: (p.src % width) + 0.5, y: Math.floor(p.src / width) + 0.5, path: dest ? [...r, dest.tile] : [...r], step: 0,
    };
    if (p.dest === null) v.destTile = p.destTile;
    if (p.event) v.event = p.event;
    if (p.match) v.match = p.match;
    if (p.race) Object.assign(v, { race: p.race, pace: p.pace });
    if (p.commute) v.commute = true;
    addVisitor(state, rt, v);
  }

  // Hora de ir embora.
  for (const v of [...state.visitors]) {
    if (v.state !== 'visitando' || minute < v.until) continue;
    if (v.race) {
      removeVisitor(state, rt, v); // fim da corrida: os corredores se dispersam
      continue;
    }
    const dest = v.dest !== null ? rt.buildingById.get(v.dest) : null;
    const access = dest ? rt.access.get(dest.id) : v.dest === null && state.map.road[v.destTile] ? v.destTile : -1;
    const r = access >= 0 && state.map.road[v.src] ? route(state, rt, access, v.src) : null;
    if (!r) {
      removeVisitor(state, rt, v);
      continue;
    }
    Object.assign(v, { state: 'voltando', path: dest ? [dest.tile, ...r] : [...r], step: 0 });
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
    // Corredor: no ritmo da corrida (as ruas estão fechadas, sem trânsito).
    let budget = v.race
      ? speed * (type ? roadSpeed(rt, type) : 1) * SPORTS.race.pace * v.pace
      : speed * (type ? roadSpeed(rt, type) * congestionFactor(rt, tile, type) : 1);
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
      if (v.state === 'voltando' || (v.dest !== null && !rt.buildingById.has(v.dest))) {
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
