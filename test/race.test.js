import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPORTS } from '../src/world/catalog.js';
import { applyCommand } from '../src/world/commands.js';
import { advance, prepare } from '../src/systems/simulation.js';
import { completeTech } from '../src/systems/research.js';
import { TICKS_PER_DAY } from '../src/core/time.js';
import { findRoadPath } from '../src/agents/pathfinding.js';
import { createSave, readSave, checksum } from '../src/save/format.js';
import { testCity } from './helpers.js';

const S = 48;
const R = SPORTS.race;
const T = (x, y) => y * S + x;

/** Cidade de teste com a pesquisa e alguns dias de vida. */
function raceCity(seed = 5) {
  const { state, rt } = testCity({ seed });
  state.economy.money = 5_000_000;
  advance(state, rt, TICKS_PER_DAY * 10);
  return { state, rt };
}

/** Corrida pela rua y = 7, de ponta a ponta. */
const course = { type: 'race', from: T(1, 7), to: T(41, 7) };

function untilMinute(state, rt, day, minute) {
  advance(state, rt, day * TICKS_PER_DAY + minute - state.time.tick);
}

test('marcar corrida: pesquisa, ruas, tamanho, data e dinheiro; o percurso só passa por ruas', () => {
  const { state, rt } = raceCity();
  assert.match(applyCommand(state, rt, course).reason, /tecnologia/);
  completeTech(state, rt, 'educacao_fisica');
  assert.match(applyCommand(state, rt, { type: 'race', from: T(3, 4), to: T(41, 7) }).reason, /ruas/);
  assert.match(applyCommand(state, rt, { type: 'race', from: T(1, 7), to: T(5, 7) }).reason, /curto/);
  const today = Math.floor(state.time.tick / TICKS_PER_DAY);
  assert.match(applyCommand(state, rt, { ...course, day: today + 2 }).reason, /antecedência/);
  const money = state.economy.money;
  state.economy.money = 10;
  assert.match(applyCommand(state, rt, course).reason, /Dinheiro/);
  state.economy.money = money;

  const r = applyCommand(state, rt, course);
  assert.ok(r.ok);
  const race = state.sports.races[0];
  assert.equal(race.day % 7, 6, 'no domingo');
  assert.ok(race.day >= today + R.days[0]);
  assert.ok(race.route.every((t) => state.map.road[t]));
  assert.equal(race.route[0], course.from);
  assert.equal(race.route.at(-1), course.to);
  assert.equal(state.economy.money, money - (R.base + R.perTile * race.route.length));
  assert.equal(race.km, Math.round(race.route.length * R.km * 10) / 10);
  assert.match(applyCommand(state, rt, course).reason, /Já há uma corrida/);
  // Cancelar devolve metade.
  const m = state.economy.money;
  assert.ok(applyCommand(state, rt, { type: 'cancelRace', id: race.id }).ok);
  assert.equal(state.economy.money, m + Math.round(race.cost / 2));
});

test('rotas desviam das ruas fechadas, mas saem e chegam em rua fechada', () => {
  const { state } = raceCity();
  const blocked = new Uint8Array(state.map.road.length);
  const a = T(5, 2);
  const b = T(5, 12);
  const free = findRoadPath(state.map, a, b);
  assert.ok(free.includes(T(9, 7)) || free.includes(T(1, 7)));
  // Fecha a rua y = 7 inteira: não dá para cruzar.
  for (let x = 1; x < S - 1; x++) blocked[T(x, 7)] = 1;
  assert.equal(findRoadPath(state.map, a, b, blocked), null, 'sem passagem');
  // Abre uma travessa (x = 9) e o caminho passa por ela.
  blocked[T(9, 7)] = 0;
  const detour = findRoadPath(state.map, a, b, blocked);
  assert.ok(detour.includes(T(9, 7)));
  assert.ok(detour.every((t) => !blocked[t]));
  // Origem e destino fechados ainda valem.
  const fromClosed = findRoadPath(state.map, T(17, 7), b, blocked);
  assert.ok(fromClosed && fromClosed[0] === T(17, 7));
  const toClosed = findRoadPath(state.map, a, T(17, 7), blocked);
  assert.ok(toClosed && toClosed.at(-1) === T(17, 7));
});

test('dia da corrida: ruas fechadas das 6h às 12h, corredores no percurso, resultado e notícia', () => {
  const { state, rt } = raceCity();
  completeTech(state, rt, 'educacao_fisica');
  // Até x = 25: a travessa x = 33 fica aberta para o desvio.
  assert.ok(applyCommand(state, rt, { type: 'race', from: T(1, 7), to: T(25, 7), annual: true, marketing: 5000 }).ok);
  const race = state.sports.races[0];
  untilMinute(state, rt, race.day, 5 * 60 + 50);
  assert.ok(!rt.blocked, 'antes das 6h, aberto');
  const income = state.economy.sportsIncome;
  assert.ok(race.runners > 0);
  assert.ok(income >= race.runners * R.fee);
  untilMinute(state, rt, race.day, 6 * 60 + 5);
  assert.ok(rt.blocked && race.route.every((t) => rt.blocked[t] === 1));
  // Quem sai agora não atravessa o percurso.
  const across = findRoadPath(state.map, T(5, 2), T(5, 12), rt.blocked);
  assert.ok(across && across.every((t) => !rt.blocked[t]));
  assert.ok(across.includes(T(33, 7)), 'desvia pela travessa aberta');

  untilMinute(state, rt, race.day, 7 * 60 + 40);
  const runners = state.visitors.filter((v) => v.race === race.id);
  assert.ok(runners.length > 0, 'corredores na rua');
  const onCourse = new Set(race.route);
  assert.ok(runners.every((v) => onCourse.has(Math.floor(v.y) * S + Math.floor(v.x))), 'todos no percurso');
  untilMinute(state, rt, race.day, 11 * 60 + 50);
  assert.ok(state.visitors.some((v) => v.race === race.id && v.state === 'visitando'), 'alguém chegou');

  const money = state.economy.money;
  untilMinute(state, rt, race.day, 12 * 60 + 5);
  assert.ok(!rt.blocked, 'reabriu');
  assert.equal(race.status, 'realizada');
  assert.ok(race.winner);
  assert.ok(!state.visitors.some((v) => v.race === race.id));
  assert.ok(state.news.pending.some((n) => n.kind === 'corrida') || state.news.items.some((i) => i.cat === 'esporte'));
  // Anual: a próxima edição, no mesmo dia da semana, já paga.
  const next = state.sports.races.find((r) => r.status === 'agendada');
  assert.ok(next && next.day > race.day + 350 && next.day % 7 === race.day % 7);
  assert.equal(money - state.economy.money, next.cost);
});

test('salvar no meio da corrida e carregar dá o mesmo resultado; save v19 abre sem corridas', () => {
  const { state: a, rt: ra } = raceCity(9);
  completeTech(a, ra, 'educacao_fisica');
  applyCommand(a, ra, course);
  const race = a.sports.races[0];
  untilMinute(a, ra, race.day, 8 * 60 + 13);
  assert.ok(a.visitors.some((v) => v.race === race.id));
  const { state: b } = readSave(JSON.stringify(createSave(a, { id: 'corrida' })));
  const rb = prepare(b);
  assert.ok(rb.blocked && race.route.every((t) => rb.blocked[t]), 'carregou com as ruas fechadas');
  advance(a, ra, 6 * 60);
  advance(b, rb, 6 * 60);
  assert.deepEqual(b.sports.races, a.sports.races);
  assert.deepEqual(b.visitors, a.visitors);
  assert.deepEqual(b.citizens.map((c) => [c.x, c.y, c.state]), a.citizens.map((c) => [c.x, c.y, c.state]));

  const v19 = createSave(a, { id: 'v19' });
  delete v19.data.sports.races;
  v19.version = 19;
  v19.checksum = checksum(v19.data);
  assert.deepEqual(readSave(JSON.stringify(v19)).state.sports.races, []);
});
