// Agenda de eventos: o jogador organiza shows, festivais, mostras de cinema,
// temporadas de teatro, feiras culturais e torneios de eSports (tipos e
// números em CULTURE.eventTypes e no resto de CULTURE).
//
// Formato no estado (state.culture):
//   events:  [{ id, type, name, venue (id do prédio | { tile } de um calçadão),
//               day (dia absoluto do início), days, artists: [ids], work (id |
//               null), ticket, marketing, series (id | null), status:
//               'pendente' (edição esperando o jogador confirmar) | 'agendado' |
//               'realizado' | 'cancelado' | 'pulado', results: [público de
//               cada dia], warned? }]
//   series:  [{ id, name, type, recurrence: 'mensal' | 'anual', edition,
//               reputation (0 a 1), lastBudget, lastResult }]
//   history: últimos resultados [{ id, name, day, attendance, capacity,
//               revenue, cost, success }]
//
// Agendar cobra na hora o custo (cachês, aluguel do local e propaganda). Nos
// dias do evento, à meia-noite, sorteia o público do dia: os ingressos vão
// para a receita "Eventos" do mês e o público aparece andando até o local
// (ver tourism.js). No último dia: a fama dos artistas sobe (sucesso) ou cai
// (fracasso), o resultado vira notícia e, numa série, a reputação muda e a
// próxima edição fica esperando confirmação.
//
// A previsão (forecast) é a mesma conta sem o sorteio.

import { CULTURE, ROAD_TYPES } from '../world/catalog.js';
import { TICKS_PER_DAY } from '../core/time.js';
import { random } from '../core/rng.js';
import { effectiveFame, nowShowing, workCurve } from './culture.js';
import { entryTiles } from './tourism.js';
import { mod } from './mods.js';
import { report } from './news.js';

const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
export const today = (state) => Math.floor(state.time.tick / TICKS_PER_DAY);
const weekdayOf = (day) => day % 7;
const PERIOD = { mensal: 30, anual: 360 };

/** Tipos de evento que a cidade já pode organizar. */
export function unlockedTypes(rt) {
  return Object.keys(CULTURE.eventTypes).filter((id) => {
    const t = CULTURE.eventTypes[id];
    if (t.tech && !rt.techDone?.has(t.tech)) return false;
    if (t.mod && mod(rt, t.mod, 0) <= 0) return false;
    return true;
  });
}

/** Tiles de calçadão ligados a `tile` (até o limite do catálogo). */
export function promenade(state, tile) {
  const { width, height, road } = state.map;
  if (!ROAD_TYPES[road[tile]]?.pedestrian) return [];
  const seen = new Set([tile]);
  const stack = [tile];
  while (stack.length && seen.size < CULTURE.venues.calcadao.maxTiles) {
    const t = stack.pop();
    const x = t % width;
    const y = (t - x) / width;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const n = ny * width + nx;
      if (!seen.has(n) && ROAD_TYPES[road[n]]?.pedestrian) {
        seen.add(n);
        stack.push(n);
      }
    }
  }
  return [...seen];
}

/**
 * Local do evento: { kind (tipo do prédio ou 'calcadao'), capacity, rent,
 * tile (para onde o público vai), building (id | null) } ou null se não existe.
 */
export function venueOf(state, rt, venue) {
  if (venue && typeof venue === 'object') {
    const tiles = promenade(state, venue.tile);
    if (!tiles.length) return null;
    return { kind: 'calcadao', capacity: tiles.length * CULTURE.venues.calcadao.perTile, rent: 0, tile: venue.tile, building: null };
  }
  const b = rt.buildingById.get(venue);
  const info = b && CULTURE.venues[b.type];
  if (!info) return null;
  return { kind: b.type, capacity: info.capacity, rent: info.rent ?? 0, tile: b.tile, building: b.id };
}

/** Locais onde a cidade pode fazer um evento do tipo (prédios e um ponto de cada calçadão). */
export function venuesFor(state, rt, type) {
  const allowed = new Set(CULTURE.eventTypes[type].venues);
  const out = [];
  for (const b of state.buildings) if (allowed.has(b.type)) out.push(b.id);
  if (allowed.has('calcadao')) {
    const seen = new Set();
    const road = state.map.road;
    for (let t = 0; t < road.length; t++) {
      if (!ROAD_TYPES[road[t]]?.pedestrian || seen.has(t)) continue;
      const tiles = promenade(state, t);
      for (const x of tiles) seen.add(x);
      out.push({ tile: tiles[Math.floor(tiles.length / 2)] });
    }
  }
  return out;
}

/** Cachê de um artista por apresentação. */
export function artistFee(culture, rt, artist) {
  const fame = effectiveFame(culture, artist);
  return Math.round(CULTURE.fee * (0.2 + fame * fame) * mod(rt, 'culture.fee') / 10) * 10;
}

/** Custo total do evento: cachês e aluguel por dia, mais a propaganda. */
export function eventCost(state, rt, ev) {
  const culture = state.culture;
  const venue = venueOf(state, rt, ev.venue);
  let perDay = venue?.rent ?? 0;
  for (const id of ev.artists ?? []) {
    const a = culture.artists.find((x) => x.id === id);
    if (a) perDay += artistFee(culture, rt, a);
  }
  return Math.round(perDay * (ev.days ?? 1) + (ev.marketing ?? 0));
}

/** Poder de atração das atrações do evento num dia (0 a ~2). */
function power(state, ev, day) {
  const culture = state.culture;
  const type = CULTURE.eventTypes[ev.type];
  const tick = day * TICKS_PER_DAY;
  const fames = (ev.artists ?? [])
    .map((id) => culture.artists.find((a) => a.id === id))
    .filter(Boolean)
    .map((a) => effectiveFame(culture, a))
    .sort((a, b) => b - a);
  // O principal puxa o público; os outros somam 30%.
  const lineup = fames.length ? fames[0] + 0.3 * fames.slice(1).reduce((s, f) => s + f, 0) : 0;
  if (type.power === null || type.power === undefined) return lineup;
  if (type.power === 'filme') {
    const films = nowShowing(culture, 'filme', tick).slice(0, 5);
    return 0.3 + 0.4 * films.reduce((s, w) => s + workCurve(w, tick), 0);
  }
  if (type.power === 'peca') {
    const work = culture.works.find((w) => w.id === ev.work) ?? nowShowing(culture, 'peca', tick)[0];
    return (work ? 0.3 + workCurve(work, tick) : 0.3) + 0.5 * lineup;
  }
  return type.power + 0.5 * lineup;
}

/** Fator da propaganda (retorno decrescente; rádio, TV e internet melhoram). */
export function marketingFactor(rt, budget) {
  const { k, scale } = CULTURE.marketing;
  return 1 + k * Math.log(1 + Math.max(0, budget) / scale) * mod(rt, 'marketing');
}

/** Fator do preço do ingresso (grátis atrai o dobro). */
function priceFactor(ticket) {
  if (ticket <= 0) return 2;
  return clamp((CULTURE.ticket / ticket) ** CULTURE.priceElasticity, 0.2, 2);
}

/** Público potencial: parte da cidade e, com estrada para fora, gente de fora. */
export function audiencePool(state, rt) {
  const pop = state.citizens.length;
  const A = CULTURE.audience;
  const outside = entryTiles(state, rt).tiles.length > 0 ? pop * A.outside + A.regional : 0;
  return pop * A.city + outside;
}

/**
 * Público de cada dia do evento: [{ day, attendance, demand }]. Com `noise`,
 * sorteia (com state.rng) a variação do dia; sem, é a previsão.
 */
export function eventDemand(state, rt, ev, { noise = false } = {}) {
  const venue = venueOf(state, rt, ev.venue);
  if (!venue) return [];
  const series = ev.series ? state.culture.series.find((s) => s.id === ev.series) : null;
  const reputation = series ? 0.7 + 0.6 * series.reputation : 1;
  const base = audiencePool(state, rt) * marketingFactor(rt, ev.marketing ?? 0) * reputation * priceFactor(ev.ticket ?? CULTURE.ticket);
  const out = [];
  for (let d = 0; d < (ev.days ?? 1); d++) {
    const day = ev.day + d;
    const weekend = weekdayOf(day) >= 5 ? CULTURE.weekend : 1;
    // Outros eventos no mesmo dia dividem o público.
    const rivals = state.culture.events.filter((e) => e !== ev && e.id !== ev.id && e.status === 'agendado'
      && e.day <= day && day < e.day + (e.days ?? 1)).length;
    const demand = base * power(state, ev, day) * weekend / (1 + 0.5 * rivals);
    const jitter = noise ? 1 + (random(state.rng) * 2 - 1) * CULTURE.noise : 1;
    out.push({ day, demand, attendance: Math.round(Math.min(venue.capacity, demand * jitter)) });
  }
  return out;
}

/** Previsão: público médio, lotação, receita, custo e lucro (sem sorteio). */
export function forecast(state, rt, ev) {
  const venue = venueOf(state, rt, ev.venue);
  const days = eventDemand(state, rt, ev);
  const attendance = days.length ? Math.round(days.reduce((s, d) => s + d.attendance, 0) / days.length) : 0;
  const revenue = days.reduce((s, d) => s + d.attendance, 0) * (ev.ticket ?? CULTURE.ticket);
  const cost = eventCost(state, rt, ev);
  return { attendance, capacity: venue?.capacity ?? 0, fill: venue ? attendance / venue.capacity : 0, revenue, cost, profit: revenue - cost };
}

/** Nome padrão do evento ("Show de X", "Festival de {cidade}"...). */
export function defaultName(state, ev) {
  const t = CULTURE.eventTypes[ev.type];
  const head = state.culture.artists.find((a) => a.id === ev.artists?.[0]);
  if (ev.type === 'show' && head) return `Show de ${head.name}`;
  if (ev.type === 'festival') return `Festival de ${state.city.name}`;
  if (ev.type === 'teatro') {
    const w = state.culture.works.find((x) => x.id === ev.work);
    if (w) return `"${w.title}" no teatro`;
  }
  return `${t.name} de ${state.city.name}`;
}

/** Valida um evento (agendar ou confirmar edição): devolve o motivo ou null. */
export function checkEvent(state, rt, ev) {
  const type = CULTURE.eventTypes[ev.type];
  if (!type) return 'Tipo de evento desconhecido.';
  if (!unlockedTypes(rt).includes(ev.type)) return `${type.name} ainda não está liberado pela pesquisa.`;
  const venue = venueOf(state, rt, ev.venue);
  if (!venue || !type.venues.includes(venue.kind)) return `${type.name} não pode acontecer nesse local.`;
  const now = today(state);
  if (ev.day < now + CULTURE.minDays) return `Agende com pelo menos ${CULTURE.minDays} dias de antecedência.`;
  if (ev.day > now + CULTURE.maxDays) return `Agende com no máximo ${CULTURE.maxDays} dias de antecedência.`;
  const days = ev.days ?? 1;
  if (days < type.days[0] || days > type.days[1]) return `${type.name} dura de ${type.days[0]} a ${type.days[1]} dias.`;
  const artists = ev.artists ?? [];
  if (artists.length < type.artists[0] || artists.length > type.artists[1]) {
    return type.artists[1] === 0 ? `${type.name} não tem artistas.` : `${type.name} precisa de ${type.artists[0]} a ${type.artists[1]} artistas.`;
  }
  if (new Set(artists).size !== artists.length) return 'Artista repetido na programação.';
  if (artists.some((id) => !state.culture.artists.some((a) => a.id === id))) return 'Artista não encontrado.';
  if ((ev.ticket ?? 0) < 0 || (ev.marketing ?? 0) < 0) return 'Valores inválidos.';
  // Um evento por vez em cada local.
  const sameVenue = (e) => (typeof e.venue === 'object' && typeof ev.venue === 'object'
    ? promenade(state, e.venue.tile).includes(ev.venue.tile)
    : e.venue === ev.venue);
  const busy = state.culture.events.some((e) => e.id !== ev.id && e.status === 'agendado' && sameVenue(e)
    && e.day < ev.day + days && ev.day < e.day + (e.days ?? 1));
  if (busy) return 'O local já tem um evento nessas datas.';
  return null;
}

/**
 * Agenda um evento (comando 'event'): cobra o custo e, com recorrência, cria
 * a série. Devolve { ok, cost, reason }.
 */
export function scheduleEvent(state, rt, cmd) {
  const culture = state.culture;
  const ev = {
    id: 0,
    type: cmd.eventType,
    name: '',
    venue: cmd.venue,
    day: cmd.day,
    days: cmd.days ?? CULTURE.eventTypes[cmd.eventType]?.days[0] ?? 1,
    artists: [...(cmd.artists ?? [])],
    work: cmd.work ?? null,
    ticket: cmd.ticket ?? CULTURE.ticket,
    marketing: Math.round(cmd.marketing ?? 0),
    series: null,
    status: 'agendado',
    results: [],
  };
  const reason = checkEvent(state, rt, ev);
  if (reason) return { ok: false, cost: 0, reason };
  const cost = eventCost(state, rt, ev);
  if (cost > state.economy.money) return { ok: false, cost, reason: `Dinheiro insuficiente (custa $${cost.toLocaleString('pt-BR')}).` };
  ev.id = culture.nextId++;
  ev.name = (cmd.name || '').trim().slice(0, 60) || defaultName(state, ev);
  ev.cost = cost;
  if (cmd.recurrence && PERIOD[cmd.recurrence]) {
    const series = { id: culture.nextId++, name: ev.name, type: ev.type, recurrence: cmd.recurrence, edition: 1, reputation: 0.3, lastBudget: 0, lastResult: null };
    culture.series.push(series);
    ev.series = series.id;
  }
  state.economy.money -= cost;
  culture.events.push(ev);
  if (ev.type === 'festival') report(state, { kind: 'festival_anuncio', name: ev.name, artists: ev.artists, day: ev.day });
  return { ok: true, cost };
}

/** Confirma (e paga) a próxima edição de uma série, podendo trocar a programação. */
export function confirmEdition(state, rt, cmd) {
  const ev = state.culture.events.find((e) => e.id === cmd.id);
  if (!ev || ev.status !== 'pendente') return { ok: false, cost: 0, reason: 'Não há edição para confirmar.' };
  const draft = { ...ev, artists: cmd.artists ?? ev.artists, marketing: cmd.marketing ?? ev.marketing, ticket: cmd.ticket ?? ev.ticket, status: 'agendado' };
  const reason = checkEvent(state, rt, draft);
  if (reason) return { ok: false, cost: 0, reason };
  const cost = eventCost(state, rt, draft);
  if (cost > state.economy.money) return { ok: false, cost, reason: `Dinheiro insuficiente (custa $${cost.toLocaleString('pt-BR')}).` };
  Object.assign(ev, { artists: draft.artists, marketing: draft.marketing, ticket: draft.ticket, status: 'agendado', cost });
  state.economy.money -= cost;
  return { ok: true, cost };
}

/** Cancela um evento agendado: devolve metade da propaganda; a série perde reputação. */
export function cancelEvent(state, rt, cmd) {
  const ev = state.culture.events.find((e) => e.id === cmd.id);
  if (!ev || (ev.status !== 'agendado' && ev.status !== 'pendente')) return { ok: false, cost: 0, reason: 'Esse evento não pode ser cancelado.' };
  if (ev.results?.length) return { ok: false, cost: 0, reason: 'O evento já começou.' };
  const refund = ev.status === 'agendado' ? Math.round((ev.marketing ?? 0) / 2) : 0;
  state.economy.money += refund;
  ev.status = 'cancelado';
  const series = state.culture.series.find((s) => s.id === ev.series);
  if (series) {
    series.reputation = clamp(series.reputation - 0.2);
    series.ended = true; // cancelar encerra a série
  }
  return { ok: true, cost: -refund };
}

/** Eventos acontecendo hoje (com o público do dia já sorteado). */
export function eventsToday(state) {
  const now = today(state);
  return state.culture.events.filter((e) => e.status === 'agendado' && e.day <= now && now < e.day + (e.days ?? 1));
}

/**
 * Meia-noite: sorteia o público dos eventos de hoje, encerra os que acabaram
 * ontem e cuida das séries (aviso de confirmar, edição pulada). Ordem por id.
 */
export function runEventsOfDay(state, rt) {
  const culture = state.culture;
  if (!culture?.events) return;
  const now = today(state);

  for (const ev of [...culture.events].sort((a, b) => a.id - b.id)) {
    if (ev.status === 'agendado' && ev.day <= now && now < ev.day + (ev.days ?? 1) && ev.results.length === now - ev.day) {
      const [d] = eventDemand(state, rt, { ...ev, day: now, days: 1 }, { noise: true });
      ev.results.push(d?.attendance ?? 0);
      state.economy.eventsIncome = (state.economy.eventsIncome ?? 0) + (d?.attendance ?? 0) * ev.ticket;
    } else if (ev.status === 'agendado' && now >= ev.day + (ev.days ?? 1)) {
      finishEvent(state, rt, ev);
    } else if (ev.status === 'pendente') {
      if (ev.day - now <= CULTURE.minDays) {
        // Ninguém confirmou: a edição é pulada e a série segue para a próxima.
        ev.status = 'pulado';
        const series = culture.series.find((s) => s.id === ev.series);
        if (series) {
          series.reputation = clamp(series.reputation - 0.2);
          nextEdition(state, series, ev);
        }
      } else if (!ev.warned && ev.day - now <= 30) {
        ev.warned = true;
        report(state, { kind: 'serie_confirmar', name: ev.name, days: ev.day - now });
      }
    }
  }
  // Só os eventos recentes ficam na lista (o resto está no histórico).
  culture.events = culture.events.filter((e) => e.status === 'agendado' || e.status === 'pendente' || now - e.day < 60);
}

function finishEvent(state, rt, ev) {
  const culture = state.culture;
  const venue = venueOf(state, rt, ev.venue);
  const capacity = venue?.capacity ?? 1;
  const attendance = ev.results.length ? Math.round(ev.results.reduce((s, n) => s + n, 0) / ev.results.length) : 0;
  const fill = attendance / capacity;
  const success = fill >= CULTURE.success;
  const flop = fill < CULTURE.flop;
  ev.status = 'realizado';

  for (const id of ev.artists) {
    const a = culture.artists.find((x) => x.id === id);
    if (!a) continue;
    a.shows = (a.shows ?? 0) + 1;
    a.lastCityShow = state.time.tick;
    delete a.touring;
    if (success) {
      a.fame = clamp(a.fame + 0.03 * (1 - a.fame) + 0.01);
      a.trend = clamp(a.trend + 0.2, -1, 1);
    } else if (flop) {
      a.fame = clamp(a.fame - 0.02);
      a.trend = clamp(a.trend - 0.1, -1, 1);
    }
  }

  const revenue = ev.results.reduce((s, n) => s + n, 0) * ev.ticket;
  culture.history.push({ id: ev.id, name: ev.name, day: ev.day, attendance, capacity, revenue, cost: ev.cost ?? 0, success: success ? 1 : flop ? -1 : 0 });
  if (culture.history.length > 30) culture.history.shift();
  report(state, { kind: 'evento_resultado', name: ev.name, type: ev.type, artists: ev.artists, attendance, capacity, success, flop, tile: venue?.tile ?? null });

  const series = culture.series.find((s) => s.id === ev.series);
  if (series && !series.ended) {
    const budget = ev.cost ?? 0;
    if (success && budget >= series.lastBudget * 0.95) series.reputation = clamp(series.reputation + 0.1 * (1 - series.reputation));
    else if (success) series.reputation = clamp(series.reputation + 0.02);
    if (flop || budget < series.lastBudget * 0.8) series.reputation = clamp(series.reputation - 0.15);
    series.lastBudget = budget;
    series.lastResult = { attendance, capacity, revenue, cost: budget };
    nextEdition(state, series, ev);
  }
}

/** Cria a próxima edição da série, no mesmo dia da semana, esperando confirmação. */
function nextEdition(state, series, ev) {
  const culture = state.culture;
  let day = ev.day + PERIOD[series.recurrence];
  day += (weekdayOf(ev.day) - weekdayOf(day) + 7) % 7;
  series.edition++;
  const artists = ev.artists.filter((id) => culture.artists.some((a) => a.id === id));
  culture.events.push({
    ...ev,
    id: culture.nextId++,
    day,
    artists,
    status: 'pendente',
    results: [],
    warned: false,
    name: `${series.name}${series.edition > 1 ? ` (${series.edition}ª edição)` : ''}`,
  });
}
