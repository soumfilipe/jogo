import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CULTURE } from '../src/world/catalog.js';
import { applyCommand, rectTiles } from '../src/world/commands.js';
import { advance, prepare } from '../src/systems/simulation.js';
import { completeTech } from '../src/systems/research.js';
import { TICKS_PER_DAY, TICKS_PER_MONTH } from '../src/core/time.js';
import { closeCultureMonth, cityTalent, effectiveFame, ranking } from '../src/systems/culture.js';
import {
  artistFee, eventCost, forecast, marketingFactor, runEventsOfDay, today, unlockedTypes, venuesFor,
} from '../src/systems/agenda.js';
import { monthlyBudget } from '../src/systems/economy.js';
import { createCitizen, talentOf } from '../src/agents/citizens.js';
import { createSave, readSave, checksum } from '../src/save/format.js';
import { encodeTable, decodeTable } from '../src/save/table.js';
import { testCity } from './helpers.js';

const S = 48;

/** Cidade com uma arena de eventos e alguns dias de vida (já tem moradores). */
function arenaCity(seed = 5, days = 12) {
  const { state, rt } = testCity({ seed });
  completeTech(state, rt, 'ginasio');
  applyCommand(state, rt, { type: 'bulldoze', tiles: rectTiles(S, 18, 8, 19, 9) });
  assert.ok(applyCommand(state, rt, { type: 'place', building: 'arena_eventos', tile: 8 * S + 18 }).ok);
  advance(state, rt, TICKS_PER_DAY * days);
  const arena = state.buildings.find((b) => b.type === 'arena_eventos');
  const star = ranking(state.culture).find((a) => a.kind === 'musica');
  return { state, rt, arena, star };
}

const show = (state, arena, star, extra = {}) => ({
  type: 'event', eventType: 'show', venue: arena.id, day: today(state) + 10, artists: [star.id], ticket: 20, marketing: 20_000, ...extra,
});

/** Avança até a meia-noite do dia `day` (e roda a virada). */
function untilDay(state, rt, day) {
  advance(state, rt, day * TICKS_PER_DAY - state.time.tick + 1);
}

test('custo: cachê cresce com a fama e a Lei de incentivo barateia', () => {
  const { state, rt, arena, star } = arenaCity();
  const c = state.culture;
  const weak = ranking(c).filter((a) => a.kind === 'musica').at(-1);
  assert.ok(artistFee(c, rt, star) > artistFee(c, rt, weak));
  const ev = { type: 'show', venue: arena.id, day: today(state) + 10, days: 1, artists: [star.id], marketing: 1000 };
  assert.equal(eventCost(state, rt, ev), artistFee(c, rt, star) + 1000);

  completeTech(state, rt, 'lei_cultura');
  const before = artistFee(c, rt, star);
  assert.ok(applyCommand(state, rt, { type: 'policy', id: 'lei_cultura', on: true }).ok);
  assert.ok(Math.abs(artistFee(c, rt, star) - before * 0.8) <= 10);
});

test('previsão: determinística; propaganda rende cada vez menos', () => {
  const { state, rt, arena, star } = arenaCity();
  const ev = { type: 'show', venue: arena.id, day: today(state) + 10, days: 1, artists: [star.id], ticket: 20, marketing: 5000 };
  assert.deepEqual(forecast(state, rt, ev), forecast(state, rt, ev));
  const gain = (a, b) => marketingFactor(rt, b) - marketingFactor(rt, a);
  assert.ok(gain(0, 10_000) > gain(10_000, 20_000));
  assert.ok(gain(10_000, 20_000) > gain(20_000, 30_000));
  const cheap = forecast(state, rt, { ...ev, marketing: 0 });
  const loud = forecast(state, rt, { ...ev, marketing: 40_000 });
  assert.ok(loud.attendance >= cheap.attendance);
  assert.ok(loud.attendance < cheap.attendance * 4 || loud.fill === 1);
  // Ingresso grátis atrai mais gente; o rádio deixa a propaganda mais forte.
  assert.ok(forecast(state, rt, { ...ev, ticket: 0 }).attendance >= forecast(state, rt, ev).attendance);
  const radio = marketingFactor(rt, 10_000);
  completeTech(state, rt, 'radio');
  assert.ok(marketingFactor(rt, 10_000) > radio);
});

test('agendar: recusa data, local, tipo e dinheiro; aceita e cobra', () => {
  const { state, rt, arena, star } = arenaCity();
  assert.ok(!unlockedTypes(rt).includes('festival'), 'festival só com a televisão');
  assert.match(applyCommand(state, rt, show(state, arena, star, { day: today(state) + 2 })).reason, /antecedência/);
  assert.match(applyCommand(state, rt, show(state, arena, star, { day: today(state) + 500 })).reason, /antecedência/);
  assert.match(applyCommand(state, rt, show(state, arena, star, { eventType: 'mostra', artists: [] })).reason, /local/);
  assert.match(applyCommand(state, rt, show(state, arena, star, { eventType: 'festival', artists: [star.id] })).reason, /pesquisa/);
  assert.match(applyCommand(state, rt, show(state, arena, star, { artists: [] })).reason, /artistas/);
  const money = state.economy.money;
  state.economy.money = 10;
  assert.match(applyCommand(state, rt, show(state, arena, star)).reason, /Dinheiro/);
  state.economy.money = money;

  const r = applyCommand(state, rt, show(state, arena, star));
  assert.ok(r.ok);
  assert.equal(state.economy.money, money - r.cost);
  const ev = state.culture.events.at(-1);
  assert.equal(ev.status, 'agendado');
  assert.equal(ev.name, `Show de ${star.name}`);
  assert.match(applyCommand(state, rt, show(state, arena, star)).reason, /já tem um evento/);
  assert.deepEqual(venuesFor(state, rt, 'show'), [arena.id]);

  // Cancelar devolve metade da propaganda.
  const m = state.economy.money;
  assert.ok(applyCommand(state, rt, { type: 'cancelEvent', id: ev.id }).ok);
  assert.equal(state.economy.money, m + 10_000);
  assert.equal(ev.status, 'cancelado');
});

test('dia do show: público, receita Eventos, histórico, fama e notícia', () => {
  const { state, rt, arena, star } = arenaCity();
  const r = applyCommand(state, rt, show(state, arena, star));
  const ev = state.culture.events.at(-1);
  const fame = star.fame;
  untilDay(state, rt, ev.day);
  assert.equal(ev.results.length, 1);
  assert.ok(ev.results[0] > 0 && ev.results[0] <= CULTURE.venues.arena_eventos.capacity);
  assert.equal(monthlyBudget(state, rt).income.events, ev.results[0] * 20);
  untilDay(state, rt, ev.day + 1);
  assert.equal(ev.status, 'realizado');
  const h = state.culture.history.at(-1);
  assert.equal(h.attendance, ev.results[0]);
  assert.equal(h.cost, r.cost);
  assert.equal(star.lastCityShow > 0, true);
  if (h.success > 0) assert.ok(star.fame > fame);
  if (h.success < 0) assert.ok(star.fame < fame);
  advance(state, rt, TICKS_PER_DAY);
  assert.ok(state.news.items.some((i) => i.cat === 'evento' && i.headline.includes(star.name)));
});

test('série: reputação sobe com verba mantida, cai com verba cortada e com edição pulada', () => {
  const { state, rt, arena, star } = arenaCity();
  applyCommand(state, rt, show(state, arena, star, { recurrence: 'mensal', ticket: 5, marketing: 60_000 }));
  const series = state.culture.series.at(-1);
  const first = state.culture.events.at(-1);
  untilDay(state, rt, first.day + 1);
  assert.equal(series.edition, 2);
  const second = state.culture.events.find((e) => e.series === series.id && e.status === 'pendente');
  assert.ok(second);
  assert.equal((second.day - first.day) % 7, 0, 'mesmo dia da semana');
  assert.ok(second.day - first.day >= 30);
  const success = state.culture.history.at(-1).success > 0;
  if (success) assert.ok(series.reputation > 0.3);

  // Confirmar com a verba cortada pela metade: reputação cai.
  const rep = series.reputation;
  assert.ok(applyCommand(state, rt, { type: 'confirmEvent', id: second.id, marketing: 1000 }).ok);
  assert.equal(second.status, 'agendado');
  untilDay(state, rt, second.day + 1);
  assert.ok(series.reputation < rep);

  // A terceira ninguém confirma: chega o aviso e depois é pulada.
  const third = state.culture.events.find((e) => e.series === series.id && e.status === 'pendente');
  const rep2 = series.reputation;
  untilDay(state, rt, third.day - 29);
  assert.equal(third.warned, true);
  assert.ok(state.news.pending.some((n) => n.kind === 'serie_confirmar') || state.news.items.some((i) => i.alert && i.headline.includes(series.name)));
  untilDay(state, rt, third.day - CULTURE.minDays);
  assert.equal(third.status, 'pulado');
  assert.ok(series.reputation < rep2);
  assert.ok(state.culture.events.some((e) => e.series === series.id && e.status === 'pendente' && e.day > third.day));
});

test('público visível: a multidão do show chega antes e vai embora no fim', () => {
  const { state, rt, arena, star } = arenaCity();
  applyCommand(state, rt, show(state, arena, star, { ticket: 0 }));
  const ev = state.culture.events.at(-1);
  untilDay(state, rt, ev.day);
  advance(state, rt, (CULTURE.eventTypes.show.hours[0] - 1) * 60 + 30);
  const crowd = state.visitors.filter((v) => v.event === ev.id);
  assert.ok(crowd.length > 0, 'gente indo ao show');
  advance(state, rt, 60);
  assert.ok(state.visitors.filter((v) => v.event === ev.id && v.dest === arena.id).length > 0);
  advance(state, rt, (CULTURE.eventTypes.show.hours[1] - CULTURE.eventTypes.show.hours[0] + 1) * 60 + 30);
  assert.ok(state.visitors.filter((v) => v.event === ev.id && v.at === arena.id).length < crowd.length);
});

test('turnê e artista da cidade: sem palco aqui, um sai em turnê e o outro se muda com a família', () => {
  const { state, rt } = arenaCity(7, 2);
  closeCultureMonth(state, rt);
  const a = state.culture.artists.find((x) => x.kind === 'musica' && x.citizen === undefined);
  a.lastCityShow = state.time.tick - (CULTURE.touringMonths + 1) * TICKS_PER_MONTH;
  closeCultureMonth(state, rt);
  assert.equal(a.touring, true);

  // Um morador talentoso vira artista da cidade.
  const home = state.buildings.find((b) => rt.residents.get(b.id)?.size);
  const c = createCitizen(state, rt, home, { age: 25, lastName: 'Talento' });
  const kin = createCitizen(state, rt, home, { age: 50, lastName: 'Talento' });
  Object.assign(c, { calling: 'arte', talent: 0.99 });
  for (const x of state.citizens) if (x !== c) x.calling = null;
  const artist = cityTalent(state, rt);
  assert.equal(artist.citizen, c.id);
  assert.equal(artist.name, c.name);
  assert.equal(c.artist, artist.id);

  // Fica famoso: larga o emprego. Um ano sem show na cidade: a família se muda.
  artist.fame = 0.5;
  closeCultureMonth(state, rt);
  assert.equal(c.fullTime, true);
  assert.equal(c.job, null);
  artist.since = state.time.tick - (CULTURE.leaveMonths + 1) * TICKS_PER_MONTH;
  closeCultureMonth(state, rt);
  assert.ok(!rt.citizenById.has(c.id) && !rt.citizenById.has(kin.id));
  assert.equal(artist.local, undefined);
  assert.ok(state.culture.artists.includes(artist), 'continua artista, agora de fora');
  assert.ok(state.news.pending.some((n) => n.kind === 'artista_saiu'));
});

test('talento e vocação: mesma semente, mesmos talentos; save v16 ganha os campos', () => {
  assert.deepEqual(talentOf(0.5, 0.01), { talent: 0.5, calling: 'arte' });
  assert.deepEqual(talentOf(0.5, CULTURE.calling.arte + 0.01), { talent: 0.5, calling: 'esporte' });
  assert.equal(talentOf(0.5, 0.9).calling, null);
  const a = testCity({ seed: 3 });
  const b = testCity({ seed: 3 });
  advance(a.state, a.rt, TICKS_PER_DAY * 3);
  advance(b.state, b.rt, TICKS_PER_DAY * 3);
  assert.deepEqual(a.state.citizens.map((c) => [c.talent, c.calling]), b.state.citizens.map((c) => [c.talent, c.calling]));
  assert.ok(a.state.citizens.length > 0 && a.state.citizens.every((c) => c.talent >= 0 && c.talent <= 1));

  const v16 = createSave(a.state, { id: 'v16' });
  const opts = { moves: { path: S } };
  const citizens = decodeTable(v16.data.citizens, opts).map(({ talent, calling, ...rest }) => rest);
  v16.data.citizens = encodeTable(citizens, opts);
  delete v16.data.culture.events;
  delete v16.data.culture.series;
  delete v16.data.culture.history;
  delete v16.data.economy.eventsIncome;
  v16.version = 16;
  v16.checksum = checksum(v16.data);
  const { state } = readSave(JSON.stringify(v16));
  assert.deepEqual(state.culture.events, []);
  assert.equal(state.economy.eventsIncome, 0);
  assert.ok(state.citizens.every((c) => typeof c.talent === 'number' && 'calling' in c));
  const again = readSave(JSON.stringify(v16)).state;
  assert.deepEqual(again.citizens.map((c) => c.talent), state.citizens.map((c) => c.talent));
});

test('salvar no meio do festival (com o público na rua) e carregar dá o mesmo resultado', () => {
  const { state: a, rt: ra, arena } = arenaCity(9);
  completeTech(a, ra, 'televisao');
  const lineup = ranking(a.culture).filter((x) => x.kind === 'musica').slice(0, 3).map((x) => x.id);
  assert.ok(applyCommand(a, ra, { type: 'event', eventType: 'festival', venue: arena.id, day: today(a) + 8, days: 3, artists: lineup, ticket: 30, marketing: 30_000, recurrence: 'anual' }).ok);
  assert.ok(a.news.pending.some((n) => n.kind === 'festival_anuncio') || a.news.items.some((i) => i.cat === 'cultura'));
  const ev = a.culture.events.at(-1);
  untilDay(a, ra, ev.day + 1);
  advance(a, ra, 17 * 60 + 13); // segundo dia, 17h13: público chegando
  assert.ok(a.visitors.some((v) => v.event === ev.id));
  const { state: b } = readSave(JSON.stringify(createSave(a, { id: 'festival' })));
  const rb = prepare(b);
  advance(a, ra, TICKS_PER_DAY * 3);
  advance(b, rb, TICKS_PER_DAY * 3);
  assert.deepEqual(b.culture, a.culture);
  assert.deepEqual(b.visitors, a.visitors);
  assert.equal(b.economy.money, a.economy.money);
  assert.equal(a.culture.events.find((e) => e.id === ev.id).status, 'realizado');
});

test('runEventsOfDay é idempotente no mesmo dia', () => {
  const { state, rt, arena, star } = arenaCity();
  applyCommand(state, rt, show(state, arena, star));
  const ev = state.culture.events.at(-1);
  untilDay(state, rt, ev.day);
  const income = state.economy.eventsIncome;
  runEventsOfDay(state, rt);
  assert.equal(ev.results.length, 1);
  assert.equal(state.economy.eventsIncome, income);
  assert.ok(effectiveFame(state.culture, star) > 0);
});
