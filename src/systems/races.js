// Corrida de rua: o jogador marca largada e chegada (ferramenta "Corrida de
// rua"); o percurso segue as ruas. No dia, o percurso fica fechado para os
// carros das 6h às 12h: as rotas desviam (rt.blocked, ver pathfinding.js) e o
// trânsito aperta em volta. Os corredores largam às 7h e correm o percurso
// (visitantes com `race`, ver tourism.js). Ao meio-dia sai o resultado.
//
// Formato (state.sports.races):
//   [{ id, name, day (dia absoluto), route: [tiles], km, marketing, annual,
//      cost, status: 'agendada' | 'realizada' | 'cancelada', runners, winner,
//      local (o vencedor é da cidade?) }]
//
// O fechamento é derivado do estado (dia e hora): updateRaces() o remonta
// quando muda e prepare() também, então carregar no meio da corrida dá o
// mesmo resultado.

import { SPORTS } from '../world/catalog.js';
import { disasterClosures } from './disasters.js';
import { MINUTES_PER_DAY, TICKS_PER_DAY } from '../core/time.js';
import { chance, pick, random, randomInt } from '../core/rng.js';
import { FIRST_NAMES, LAST_NAMES } from '../agents/names.js';
import { findRoadPath } from '../agents/pathfinding.js';
import { activeClubs, squad } from './sports.js';
import { entryTiles } from './tourism.js';
import { report } from './news.js';

const R = SPORTS.race;
const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const today = (state) => Math.floor(state.time.tick / TICKS_PER_DAY);

/** Percurso e custo de uma corrida de `from` até `to` (prévia da ferramenta e comando). */
export function planRace(state, rt, cmd) {
  const fail = (reason) => ({ tiles: [], cost: 0, reason });
  if (!rt.techDone?.has(R.tech)) return fail('A corrida de rua precisa da tecnologia Educação física escolar.');
  const { road } = state.map;
  if (!road[cmd.from] || !road[cmd.to]) return fail('A largada e a chegada precisam ser em ruas.');
  const route = findRoadPath(state.map, cmd.from, cmd.to);
  if (!route) return fail('A largada e a chegada precisam estar ligadas por ruas.');
  if (route.length < R.tiles[0]) return fail(`Percurso curto demais (mínimo de ${R.tiles[0]} trechos de rua).`);
  if (route.length > R.tiles[1]) return fail(`Percurso longo demais (máximo de ${R.tiles[1]} trechos de rua).`);
  return { tiles: route, cost: R.base + R.perTile * route.length, reason: null };
}

/** Próximo domingo daqui a pelo menos `R.days[0]` dias. */
function nextSunday(state) {
  const min = today(state) + R.days[0];
  return min + ((6 - (min % 7)) + 7) % 7;
}

/** Agenda uma corrida (comando 'race'): cobra o custo. */
export function scheduleRace(state, rt, cmd) {
  const plan = planRace(state, rt, cmd);
  if (plan.reason) return { ok: false, cost: 0, reason: plan.reason };
  const day = cmd.day ?? nextSunday(state);
  const now = today(state);
  if (day < now + R.days[0] || day > now + R.days[1]) return { ok: false, cost: 0, reason: `Marque a corrida com ${R.days[0]} a ${R.days[1]} dias de antecedência.` };
  const marketing = Math.max(0, Math.round(cmd.marketing ?? 0));
  const cost = plan.cost + marketing;
  if (cost > state.economy.money) return { ok: false, cost, reason: `Dinheiro insuficiente (custa $${cost.toLocaleString('pt-BR')}).` };
  const sports = state.sports;
  if (sports.races.some((r) => r.status === 'agendada' && r.day === day)) return { ok: false, cost: 0, reason: 'Já há uma corrida nesse dia.' };
  state.economy.money -= cost;
  const race = {
    id: sports.nextId++, name: (cmd.name || '').trim().slice(0, 50) || `Corrida de ${state.city.name}`, day,
    route: plan.tiles, km: Math.round(plan.tiles.length * R.km * 10) / 10, marketing, annual: Boolean(cmd.annual), cost,
    status: 'agendada', runners: 0, winner: null,
  };
  sports.races.push(race);
  return { ok: true, cost, race: race.id };
}

/** Cancela (comando 'cancelRace'): devolve metade do custo. */
export function cancelRace(state, rt, cmd) {
  const race = state.sports.races.find((r) => r.id === cmd.id && r.status === 'agendada');
  if (!race) return { ok: false, cost: 0, reason: 'Essa corrida não pode ser cancelada.' };
  if (race.day === today(state) && state.time.tick % MINUTES_PER_DAY >= R.closed[0] * 60) return { ok: false, cost: 0, reason: 'A corrida já começou.' };
  race.status = 'cancelada';
  const refund = Math.round(race.cost / 2);
  state.economy.money += refund;
  return { ok: true, cost: -refund };
}

/** Ajusta a corrida agendada (comando 'raceOptions'): todo ano e mais propaganda (paga a diferença). */
export function raceOptions(state, rt, cmd) {
  const race = state.sports.races.find((r) => r.id === cmd.id && r.status === 'agendada');
  if (!race) return { ok: false, cost: 0, reason: 'Corrida não encontrada.' };
  let cost = 0;
  if (cmd.marketing !== undefined) {
    const marketing = Math.round(cmd.marketing);
    if (!Number.isFinite(marketing) || marketing < race.marketing) return { ok: false, cost: 0, reason: 'A propaganda já paga não volta: só dá para aumentar.' };
    cost = marketing - race.marketing;
    if (cost > state.economy.money) return { ok: false, cost, reason: `Dinheiro insuficiente (custa $${cost.toLocaleString('pt-BR')}).` };
    state.economy.money -= cost;
    race.marketing = marketing;
    race.cost += cost;
  }
  if (cmd.annual !== undefined) race.annual = Boolean(cmd.annual);
  return { ok: true, cost };
}

/** Corredores esperados (sem sorteio). */
export function expectedRunners(state, rt, race) {
  const pop = state.citizens.length;
  const outside = entryTiles(state, rt).tiles.length > 0 ? R.regional : 0;
  const ads = 1 + R.marketing.k * Math.log(1 + race.marketing / R.marketing.scale);
  return Math.min(R.max, Math.round(pop * R.share * ads + outside));
}

/** Corridas de hoje (agendadas ou já com o resultado). */
export function racesToday(state) {
  const now = today(state);
  return (state.sports?.races ?? []).filter((r) => r.day === now && r.status !== 'cancelada');
}

/** Monta rt.blocked com o percurso das corridas em andamento (e limpa o cache de rotas quando muda). */
export function updateClosures(state, rt) {
  const minute = state.time.tick % MINUTES_PER_DAY;
  const open = minute >= R.closed[0] * 60 && minute < R.closed[1] * 60;
  const races = open ? racesToday(state) : [];
  // Ruas alagadas também ficam fechadas (ver disasters.js).
  const floods = state.disasters?.floods ?? [];
  const key = `${races.map((r) => r.id).join(',')}|${floods.map((f) => f.id).join(',')}`;
  if (key === (rt.closedKey ?? '|')) return;
  rt.closedKey = key;
  rt.pathCache.clear();
  const flooded = disasterClosures(state);
  if (!races.length && !flooded.length) {
    rt.blocked = null;
    rt.blockedTiles = [];
    return;
  }
  rt.blocked = new Uint8Array(state.map.road.length);
  const tiles = new Set(flooded);
  for (const r of races) for (const t of r.route) tiles.add(t);
  for (const t of tiles) rt.blocked[t] = 1;
  rt.blockedTiles = [...tiles];
}

/** Meia-noite do dia da corrida: sorteia quantos correm e cobra as inscrições. */
export function startRacesOfDay(state, rt) {
  for (const race of racesToday(state)) {
    if (race.status !== 'agendada' || race.runners) continue;
    const jitter = 1 + (random(state.rng) - 0.5) * 0.2;
    race.runners = Math.max(1, Math.round(expectedRunners(state, rt, race) * jitter));
    state.economy.sportsIncome = (state.economy.sportsIncome ?? 0) + race.runners * R.fee;
  }
}

/** Ao meio-dia: o resultado (vencedor, notícia) e, se for anual, a próxima edição. */
function finishRace(state, rt, race) {
  const rng = state.rng;
  // O melhor atleta dos clubes de atletismo da cidade tenta vencer o campo de fora.
  const athletes = activeClubs(state).filter((c) => c.sport === 'atletismo').flatMap((c) => squad(state, rt, c))
    .sort((a, b) => b.skill - a.skill || a.id - b.id);
  const best = athletes[0];
  const local = Boolean(best) && chance(rng, clamp(best.skill * 1.2 - 0.3, 0.02, 0.8));
  race.winner = local ? best.name : `${pick(rng, FIRST_NAMES)} ${pick(rng, LAST_NAMES)}`;
  race.local = local;
  const from = local ? state.city.name : pick(rng, SPORTS.rivalCities);
  // Tempo do vencedor: uns 3 minutos por quilômetro.
  const minutes = Math.round(race.km * (2.8 + random(rng) * 0.6 - (local ? best.skill * 0.3 : 0.15)) * 10) / 10;
  race.status = 'realizada';
  report(state, { kind: 'corrida', name: race.name, runners: race.runners, km: race.km, winner: race.winner, from, local, minutes, streets: race.route.length, tile: race.route[0] });
  if (race.annual) {
    let day = race.day + 360;
    day += (race.day % 7 - day % 7 + 7) % 7;
    const cost = R.base + R.perTile * race.route.length + race.marketing;
    if (cost <= state.economy.money) {
      state.economy.money -= cost;
      const { local: _, ...rest } = race;
      state.sports.races.push({ ...rest, id: state.sports.nextId++, day, cost, status: 'agendada', runners: 0, winner: null });
    }
  }
  // Ficam as últimas 20 corridas encerradas.
  const done = state.sports.races.filter((r) => r.status !== 'agendada');
  if (done.length > 20) state.sports.races = state.sports.races.filter((r) => r.status === 'agendada' || done.indexOf(r) >= done.length - 20);
}

/** A cada tick: fecha e abre as ruas e, ao meio-dia, encerra as corridas do dia. */
export function updateRaces(state, rt) {
  if (!state.sports?.races) return;
  updateClosures(state, rt);
  if (state.time.tick % MINUTES_PER_DAY !== R.closed[1] * 60) return;
  for (const race of racesToday(state)) if (race.status === 'agendada') finishRace(state, rt, race);
}

/** Corredores visíveis de hoje (para planDay): ondas a partir da largada. */
export function runnersToday(state) {
  return racesToday(state).filter((r) => r.status === 'agendada' && r.runners > 0);
}

/** Ritmo de cada corredor (sorteado ao largar). */
export const runnerPace = (rng) => 0.8 + random(rng) * 0.4;
export const raceWave = (rng) => R.start * 60 + randomInt(rng, 0, 2) * 10;
