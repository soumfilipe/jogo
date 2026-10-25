import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILDINGS, SPORTS } from '../src/world/catalog.js';
import { applyCommand, rectTiles } from '../src/world/commands.js';
import { advance, prepare } from '../src/systems/simulation.js';
import { completeTech } from '../src/systems/research.js';
import { TICKS_PER_DAY } from '../src/core/time.js';
import { createRng } from '../src/core/rng.js';
import { removeCitizen } from '../src/world/runtime.js';
import { canWork } from '../src/agents/citizens.js';
import {
  academyKids, closeSportsMonth, drawScore, matchPoints, newSeason, squad, standings, teamName, today, youthCategory,
} from '../src/systems/sports.js';
import { createCitizen } from '../src/agents/citizens.js';
import { todaysVisits } from '../src/systems/tourism.js';
import { monthlyBudget } from '../src/systems/economy.js';
import { createSave, readSave, checksum } from '../src/save/format.js';
import { testCity } from './helpers.js';

const S = 48;

/** Cidade com um campo de futebol e alguns dias de vida (já tem moradores). */
function fieldCity(seed = 5, days = 12) {
  const { state, rt } = testCity({ seed });
  state.economy.money = 5_000_000;
  applyCommand(state, rt, { type: 'bulldoze', tiles: rectTiles(S, 18, 8, 19, 9) });
  completeTech(state, rt, 'futebol_profissional');
  assert.ok(applyCommand(state, rt, { type: 'place', building: 'campo_futebol', tile: 8 * S + 18 }).ok);
  advance(state, rt, TICKS_PER_DAY * days);
  const field = state.buildings.find((b) => b.type === 'campo_futebol');
  return { state, rt, field };
}

/** Funda o clube e monta a liga com as rodadas a partir de amanhã (uma por dia). */
function clubWithLeague(seed = 5) {
  const { state, rt, field } = fieldCity(seed);
  assert.ok(applyCommand(state, rt, { type: 'club', sport: 'futebol', home: field.id }).ok);
  const club = state.sports.clubs[0];
  newSeason(state, rt, 'futebol', Math.floor(today(state) / 360) + 1);
  const league = state.sports.leagues[0];
  const start = today(state) + 1;
  for (const f of league.fixtures) f.day = start + f.round;
  return { state, rt, field, club, league };
}

/** Avança até a meia-noite do dia `day` (e roda a virada). */
function untilDay(state, rt, day) {
  advance(state, rt, day * TICKS_PER_DAY - state.time.tick + 1);
}

test('fundar clube: recusa pesquisa, local, repetido e dinheiro; contrata atletas da cidade', () => {
  const { state, rt, field } = fieldCity();
  assert.match(applyCommand(state, rt, { type: 'club', sport: 'volei', home: field.id }).reason, /pesquisa/);
  const house = state.buildings.find((b) => rt.residents.get(b.id)?.size);
  assert.match(applyCommand(state, rt, { type: 'club', sport: 'futebol', home: house.id }).reason, /campo de futebol/);

  const eligible = state.citizens.filter((c) => c.age >= SPORTS.ages[0] && c.age <= SPORTS.ages[1] && canWork(c));
  const vocation = eligible.filter((c) => c.calling === 'esporte').length;
  const money = state.economy.money;
  const r = applyCommand(state, rt, { type: 'club', sport: 'futebol', home: field.id, name: 'Unidos' });
  assert.ok(r.ok);
  assert.equal(state.economy.money, money - SPORTS.foundCost);
  const club = state.sports.clubs[0];
  assert.equal(club.name, 'Unidos');
  assert.equal(club.cash, SPORTS.foundCost);
  const players = squad(state, rt, club);
  assert.equal(players.length, SPORTS.kinds.futebol.squad);
  assert.ok(players.every((c) => c.job === null && c.fullTime === 'esporte' && !canWork(c) && c.skill > 0));
  assert.equal(players.filter((c) => c.calling === 'esporte').length, Math.min(vocation, players.length), 'vocação primeiro');
  assert.match(applyCommand(state, rt, { type: 'club', sport: 'futebol', home: field.id }).reason, /já tem um clube/);
  // Atletas pagam imposto como empregados.
  assert.ok(monthlyBudget(state, rt).income.residential > 0);

  assert.ok(applyCommand(state, rt, { type: 'closeClub', id: club.id }).ok);
  assert.ok(players.every((c) => c.athlete === undefined && canWork(c)));
  state.economy.money = 10;
  assert.match(applyCommand(state, rt, { type: 'club', sport: 'futebol', home: field.id }).reason, /Dinheiro/);
});

test('temporada: turno e returno no dia de jogo, rivais inventadas e determinísticas', () => {
  const a = fieldCity(5);
  const b = fieldCity(5);
  for (const { state, rt, field } of [a, b]) {
    applyCommand(state, rt, { type: 'club', sport: 'futebol', home: field.id });
    newSeason(state, rt, 'futebol', 2);
  }
  const league = a.state.sports.leagues[0];
  assert.equal(league.teams.length, SPORTS.teams);
  assert.deepEqual(league.teams.map((t) => teamName(a.state, t)), b.state.sports.leagues[0].teams.map((t) => teamName(b.state, t)));
  assert.ok(league.teams.filter((t) => t.rival !== undefined).every((t) => / de /.test(teamName(a.state, t))));
  const n = league.teams.length;
  assert.equal(league.fixtures.length, n * (n - 1));
  assert.ok(league.fixtures.every((f) => f.day % 7 === SPORTS.kinds.futebol.weekday));
  for (let i = 0; i < n; i++) {
    assert.equal(league.fixtures.filter((f) => f.home === i).length, n - 1, 'metade em casa');
    for (let j = 0; j < n; j++) {
      if (i !== j) assert.equal(league.fixtures.filter((f) => f.home === i && f.away === j).length, 1);
    }
  }
  // Uma rodada por dia de jogo: ninguém joga duas vezes no mesmo dia.
  const days = new Map();
  for (const f of league.fixtures) for (const t of [f.home, f.away]) {
    const key = `${f.day}:${t}`;
    assert.ok(!days.has(key));
    days.set(key, true);
  }
});

test('partida: o mais forte vence mais; placar no formato de cada modalidade', () => {
  const rng = createRng(3);
  let wins = 0;
  for (let i = 0; i < 2000; i++) {
    const [h, a] = drawScore(rng, 'futebol', 0.7, 0.35);
    if (h > a) wins++;
  }
  assert.ok(wins > 1200, `vitórias do forte: ${wins}`);
  for (let i = 0; i < 200; i++) {
    const v = drawScore(rng, 'volei', 0.5, 0.5);
    assert.equal(Math.max(...v), 3);
    assert.ok(Math.min(...v) < 3);
    const b = drawScore(rng, 'basquete', 0.5, 0.5);
    assert.notEqual(b[0], b[1], 'basquete não empata');
    assert.ok(b[0] > 30 && b[0] < 150);
    const h = drawScore(rng, 'handebol', 0.5, 0.5);
    assert.ok(h[0] > 5 && h[0] < 60);
  }
  assert.deepEqual(matchPoints('futebol', [2, 1]), [3, 0]);
  assert.deepEqual(matchPoints('futebol', [1, 1]), [1, 1]);
  assert.deepEqual(matchPoints('volei', [3, 2]), [2, 1]);
  assert.deepEqual(matchPoints('volei', [0, 3]), [0, 3]);
  assert.deepEqual(matchPoints('basquete', [70, 80]), [1, 2]);
});

test('campeonato inteiro: tabela fecha, prêmio no caixa, acesso ou rebaixamento, histórico e notícias', () => {
  const { state, rt, club, league } = clubWithLeague();
  const cash = club.cash;
  const last = Math.max(...league.fixtures.map((f) => f.day));
  untilDay(state, rt, last + 1);
  assert.equal(league.done, true);
  assert.ok(league.fixtures.every((f) => f.score));
  const t = league.table;
  assert.equal(t.reduce((s, x) => s + x.f, 0), t.reduce((s, x) => s + x.a, 0));
  assert.ok(t.every((x) => x.w + x.d + x.l === 2 * (league.teams.length - 1)));
  const pos = standings(league).findIndex((i) => league.teams[i].club === club.id);
  const h = state.sports.history.at(-1);
  assert.equal(h.position, pos + 1);
  assert.equal(club.division, pos < SPORTS.up ? 1 : 0);
  assert.equal(h.promoted, pos < SPORTS.up);
  assert.ok(h.prize > 0);
  assert.ok(club.cash > cash - 50_000, 'prêmio e ingressos entraram no caixa');
  assert.ok(league.fixtures.some((f) => league.teams[f.home].club === club.id && f.attendance > 0));
  assert.ok(state.economy.sportsIncome > 0 || state.economy.history.length > 0);
  advance(state, rt, TICKS_PER_DAY);
  assert.ok(state.news.items.some((i) => i.cat === 'esporte' && i.headline.includes(club.name)));
});

test('caixa do mês: repasse da prefeitura vira despesa; sem dinheiro o treino é cortado', () => {
  const { state, rt, field } = fieldCity();
  applyCommand(state, rt, { type: 'club', sport: 'futebol', home: field.id });
  const club = state.sports.clubs[0];
  assert.ok(applyCommand(state, rt, { type: 'clubBudget', id: club.id, subsidy: 3000, training: 8000 }).ok);
  assert.equal(monthlyBudget(state, rt).expenses.sports, 3000);
  assert.match(applyCommand(state, rt, { type: 'clubBudget', id: club.id, training: -5 }).reason, /inválidos/);
  club.cash = 0;
  closeSportsMonth(state, rt);
  assert.equal(club.training, 0, 'treino cortado');
  // Centro de treinamento: pago pela prefeitura, sobe a força.
  const money = state.economy.money;
  assert.ok(applyCommand(state, rt, { type: 'clubCt', id: club.id }).ok);
  assert.equal(state.economy.money, money - SPORTS.ct.cost[0]);
  assert.equal(club.ct, 1);
});

test('atletas: treino melhora os jovens; aposentado e quem morre saem e são repostos', () => {
  const { state, rt, field } = fieldCity();
  applyCommand(state, rt, { type: 'club', sport: 'futebol', home: field.id });
  const club = state.sports.clubs[0];
  club.cash = 1_000_000;
  club.training = 20_000;
  const young = squad(state, rt, club).find((c) => c.age < SPORTS.peakAge);
  young.age = 20;
  const before = young.skill;
  for (let i = 0; i < 6; i++) closeSportsMonth(state, rt);
  assert.ok(young.skill > before + 0.05, `${before} -> ${young.skill}`);

  const [old, dead] = squad(state, rt, club).filter((c) => c !== young);
  old.age = SPORTS.ages[1] + 1;
  removeCitizen(state, rt, dead.id);
  closeSportsMonth(state, rt);
  assert.equal(old.athlete, undefined);
  assert.ok(canWork(old) || old.age > 64);
  assert.ok(!club.players.includes(dead.id) && !club.players.includes(old.id));
  assert.equal(squad(state, rt, club).length, SPORTS.kinds.futebol.squad, 'elenco reposto');
});

test('torcida visível: o público do jogo em casa anda até o campo; sem torcida genérica', () => {
  const { state, rt, field, club, league } = clubWithLeague(6);
  // Sem a torcida genérica de domingo no campo do clube.
  const { visits } = todaysVisits(state, rt, { game: true, weekend: true });
  assert.ok(!visits.some((v) => v.b.id === field.id && v.game));
  const home = league.fixtures.find((f) => league.teams[f.home].club === club.id);
  untilDay(state, rt, home.day);
  assert.ok(home.attendance > 0);
  advance(state, rt, (SPORTS.kinds.futebol.hour - 1) * 60);
  const crowd = state.visitors.filter((v) => v.match === home.id);
  assert.ok(crowd.length > 0, 'torcida a caminho');
  advance(state, rt, 4 * 60);
  assert.ok(state.visitors.filter((v) => v.match === home.id && v.state === 'visitando').length < crowd.length);
});

test('save: v17 abre sem clubes; salvar no dia do jogo e carregar dá o mesmo resultado', () => {
  const { state: a, rt: ra, club, league } = clubWithLeague(9);
  const home = league.fixtures.find((f) => league.teams[f.home].club === club.id);
  untilDay(a, ra, home.day);
  advance(a, ra, (SPORTS.kinds.futebol.hour - 1) * 60 + 17);
  assert.ok(a.visitors.some((v) => v.match === home.id));
  const { state: b } = readSave(JSON.stringify(createSave(a, { id: 'jogo' })));
  const rb = prepare(b);
  advance(a, ra, TICKS_PER_DAY * 3);
  advance(b, rb, TICKS_PER_DAY * 3);
  assert.deepEqual(b.sports, a.sports);
  assert.deepEqual(b.visitors, a.visitors);
  assert.deepEqual(b.citizens.map((c) => [c.athlete, c.skill]), a.citizens.map((c) => [c.athlete, c.skill]));

  const v17 = createSave(a, { id: 'v17' });
  delete v17.data.sports;
  delete v17.data.economy.sportsIncome;
  v17.version = 17;
  v17.checksum = checksum(v17.data);
  const { state: old } = readSave(JSON.stringify(v17));
  assert.deepEqual(old.sports.clubs, []);
  assert.equal(old.economy.sportsIncome, 0);
});

/** Clube de futebol fundado numa cidade com moradores (e crianças). */
function club(seed = 5) {
  const { state, rt, field } = fieldCity(seed, 20);
  assert.ok(applyCommand(state, rt, { type: 'club', sport: 'futebol', home: field.id }).ok);
  return { state, rt, field, club: state.sports.clubs[0] };
}

test('escolinha: cada nível abre uma categoria; vocação primeiro; as crianças seguem na escola', () => {
  const { state, rt, club: c } = club();
  assert.match(applyCommand(state, rt, { type: 'clubAcademy', id: 999 }).reason, /não encontrado/);
  const money = state.economy.money;
  state.economy.money = 10;
  assert.match(applyCommand(state, rt, { type: 'clubAcademy', id: c.id }).reason, /Dinheiro/);
  state.economy.money = money;
  const schools = new Map(state.citizens.map((x) => [x.id, x.school]));
  assert.ok(applyCommand(state, rt, { type: 'clubAcademy', id: c.id }).ok);
  assert.equal(state.economy.money, money - SPORTS.academy.cost[0]);
  let kids = academyKids(state, rt, c);
  assert.ok(kids.length > 0 && kids.length <= SPORTS.academy.seats);
  assert.ok(kids.every((k) => k.age >= 15 && k.age <= 17 && k.skill > 0), 'só a sub-17');
  assert.ok(kids.every((k) => k.school === schools.get(k.id)), 'continuam na escola');
  const left = state.citizens.filter((x) => x.age >= 15 && x.age <= 17 && x.youth === undefined);
  if (left.some((x) => x.calling === 'esporte')) assert.ok(kids.every((k) => k.calling === 'esporte'), 'vocação primeiro');
  assert.ok(applyCommand(state, rt, { type: 'clubAcademy', id: c.id }).ok);
  kids = academyKids(state, rt, c);
  assert.ok(kids.some((k) => youthCategory(k.age, 2)?.id === 'sub15'));
  assert.ok(kids.every((k) => k.age >= 11 && k.age <= 17));
  // Custo do mês: alunos e verba da base.
  assert.ok(applyCommand(state, rt, { type: 'clubBudget', id: c.id, youthBudget: 2000 }).ok);
  assert.equal(c.youthBudget, 2000);
});

test('base: evolui mais rápido que o adulto; quem morre sai; aos 18 sobe ao time principal', () => {
  const { state, rt, club: c } = club();
  applyCommand(state, rt, { type: 'clubAcademy', id: c.id });
  c.cash = 1_000_000;
  c.training = 3000;
  c.youthBudget = 3000;
  const kid = academyKids(state, rt, c)[0];
  const adult = squad(state, rt, c).find((x) => x.age < 25);
  const [k0, a0] = [kid.skill, adult.skill];
  for (let i = 0; i < 6; i++) closeSportsMonth(state, rt);
  assert.ok(kid.skill - k0 > adult.skill - a0, `base ${kid.skill - k0} x adulto ${adult.skill - a0}`);

  const [dead] = academyKids(state, rt, c).filter((x) => x !== kid);
  if (dead) {
    removeCitizen(state, rt, dead.id);
    closeSportsMonth(state, rt);
    assert.ok(!c.youth.includes(dead.id));
  }
  // Fez 18 anos e é bom: sobe no lugar do pior do elenco cheio.
  kid.age = 18;
  kid.skill = 0.9;
  const worst = squad(state, rt, c).sort((a, b) => a.skill - b.skill)[0];
  closeSportsMonth(state, rt);
  assert.equal(kid.athlete, c.id);
  assert.equal(kid.youth, undefined);
  assert.ok(kid.skill > 0.85);
  assert.equal(worst.athlete, undefined, 'o pior do elenco saiu');
  assert.equal(squad(state, rt, c).length, SPORTS.kinds.futebol.squad);

  // Subir antes da hora: só com 16 anos ou mais.
  const young = academyKids(state, rt, c).find((x) => x.age < 16) ?? academyKids(state, rt, c)[0];
  young.age = 15;
  assert.match(applyCommand(state, rt, { type: 'promoteYouth', id: c.id, player: young.id }).reason, /16 anos/);
  young.age = 16;
  assert.ok(applyCommand(state, rt, { type: 'promoteYouth', id: c.id, player: young.id }).ok);
  assert.equal(young.athlete, c.id);
});

/** Faz um craque e fecha meses até chegar uma proposta por ele. */
function offerFor(state, rt, c) {
  const star = squad(state, rt, c).sort((a, b) => a.id - b.id)[0];
  c.cash = 1_000_000;
  for (let i = 0; i < 80 && !state.sports.offers.some((o) => o.player === star.id); i++) {
    star.skill = 0.9;
    star.age = 22;
    closeSportsMonth(state, rt);
  }
  const offer = state.sports.offers.find((o) => o.player === star.id);
  assert.ok(offer, 'chegou proposta');
  return { star, offer };
}

test('mercado: proposta pelo craque, vence em 30 dias; recusar segura o atleta', () => {
  const { state, rt, club: c } = club();
  const { star, offer } = offerFor(state, rt, c);
  assert.equal(offer.status, 'aberta');
  assert.ok(offer.value >= 0.8 * SPORTS.market.base * 0.9 ** 3 * SPORTS.market.young - 1000);
  assert.ok(state.news.pending.some((n) => n.kind === 'proposta'));
  // Passou o prazo: some.
  state.time.tick += 31 * TICKS_PER_DAY;
  star.skill = 0.1;
  closeSportsMonth(state, rt);
  assert.ok(!state.sports.offers.some((o) => o.id === offer.id));

  const { offer: again } = offerFor(state, rt, c);
  assert.ok(applyCommand(state, rt, { type: 'rejectOffer', id: again.id }).ok);
  assert.equal(again.status, 'recusada');
  for (let i = 0; i < 2; i++) closeSportsMonth(state, rt);
  assert.ok(!state.sports.offers.some((o) => o.player === again.player && o.status === 'aberta'), 'ninguém volta logo');
  assert.match(applyCommand(state, rt, { type: 'acceptOffer', id: again.id }).reason, /não está mais/);
});

test('vender: dinheiro no caixa (10% para a prefeitura), o atleta e a família se mudam, o elenco é reposto', () => {
  const { state, rt, club: c } = club();
  const { star, offer } = offerFor(state, rt, c);
  const surname = star.name.slice(star.name.indexOf(' ') + 1);
  const relative = createCitizen(state, rt, rt.buildingById.get(star.home), { age: 50, lastName: surname });
  const [cash, fee, pop] = [c.cash, state.economy.sportsIncome ?? 0, state.citizens.length];
  assert.ok(applyCommand(state, rt, { type: 'acceptOffer', id: offer.id }).ok);
  assert.equal(c.cash, cash + offer.value - Math.round(offer.value * SPORTS.cityShare));
  assert.equal(state.economy.sportsIncome, fee + Math.round(offer.value * SPORTS.cityShare));
  assert.ok(!rt.citizenById.has(star.id) && !rt.citizenById.has(relative.id));
  assert.ok(state.citizens.length <= pop - 2);
  assert.equal(state.sports.sales.at(-1).name, star.name);
  assert.ok(state.sports.sales.at(-1).people >= 2);
  assert.ok(state.news.pending.some((n) => n.kind === 'venda'));
  assert.equal(squad(state, rt, c).length, SPORTS.kinds.futebol.squad, 'reposto');
});

test('save: v18 ganha escolinha e mercado; salvar com proposta aberta e base cheia dá o mesmo resultado', () => {
  const { state: a, rt: ra, club: c } = club(9);
  applyCommand(a, ra, { type: 'clubAcademy', id: c.id });
  offerFor(a, ra, c);
  const { state: b } = readSave(JSON.stringify(createSave(a, { id: 'base' })));
  const rb = prepare(b);
  advance(a, ra, TICKS_PER_DAY * 31);
  advance(b, rb, TICKS_PER_DAY * 31);
  assert.deepEqual(b.sports, a.sports);
  assert.deepEqual(b.citizens.map((x) => [x.youth, x.athlete, x.skill]), a.citizens.map((x) => [x.youth, x.athlete, x.skill]));

  const v18 = createSave(a, { id: 'v18' });
  for (const club of v18.data.sports.clubs) {
    delete club.academy;
    delete club.youthBudget;
    delete club.youth;
  }
  delete v18.data.sports.offers;
  delete v18.data.sports.sales;
  v18.version = 18;
  v18.checksum = checksum(v18.data);
  const { state: old } = readSave(JSON.stringify(v18));
  assert.deepEqual(old.sports.offers, []);
  assert.ok(old.sports.clubs.every((x) => x.academy === 0 && Array.isArray(x.youth)));
});

/** Cidade com pista de atletismo e parque aquático (e as pesquisas). */
function venuesCity(seed = 5) {
  const { state, rt } = testCity({ seed });
  state.economy.money = 5_000_000;
  applyCommand(state, rt, { type: 'bulldoze', tiles: rectTiles(S, 18, 8, 20, 10) });
  applyCommand(state, rt, { type: 'bulldoze', tiles: rectTiles(S, 26, 18, 27, 19) });
  assert.match(applyCommand(state, rt, { type: 'place', building: 'pista_atletismo', tile: 18 * S + 26 }).reason, /tecnologia/);
  completeTech(state, rt, 'educacao_fisica');
  completeTech(state, rt, 'parque_tematico');
  assert.ok(applyCommand(state, rt, { type: 'place', building: 'pista_atletismo', tile: 18 * S + 26 }).ok);
  assert.ok(applyCommand(state, rt, { type: 'place', building: 'parque_aquatico', tile: 8 * S + 18 }).ok);
  advance(state, rt, TICKS_PER_DAY * 12);
  return {
    state, rt,
    track: state.buildings.find((b) => b.type === 'pista_atletismo'),
    pool: state.buildings.find((b) => b.type === 'parque_aquatico'),
  };
}

test('pista e parque aquático: liberados pela pesquisa; clubes de atletismo e de natação', () => {
  const { state, rt, track, pool } = venuesCity();
  assert.match(applyCommand(state, rt, { type: 'club', sport: 'atletismo', home: pool.id }).reason, /pista de atletismo/);
  assert.ok(applyCommand(state, rt, { type: 'club', sport: 'atletismo', home: track.id }).ok);
  assert.ok(applyCommand(state, rt, { type: 'club', sport: 'natacao', home: pool.id }).ok);
  const [run, swim] = state.sports.clubs;
  assert.equal(squad(state, rt, run).length, SPORTS.kinds.atletismo.squad);
  assert.equal(squad(state, rt, swim).length, SPORTS.kinds.natacao.squad);
  assert.ok(BUILDINGS.parque_aquatico.utility.tourism.weekend > 0, 'parque aquático chama turistas');
  assert.ok(pool && track);
});

test('etapas: 8 por temporada com a sede girando; pontos e medalhas fecham; o mais forte pontua mais', () => {
  const { state, rt, track } = venuesCity(6);
  applyCommand(state, rt, { type: 'club', sport: 'atletismo', home: track.id });
  const club = state.sports.clubs[0];
  for (const c of squad(state, rt, club)) c.skill = 0.95;
  newSeason(state, rt, 'atletismo', 1);
  const league = state.sports.leagues[0];
  assert.equal(league.fixtures.length, SPORTS.meets);
  assert.ok(league.fixtures.every((f) => f.away === null && f.day % 7 === SPORTS.kinds.atletismo.weekday));
  assert.deepEqual(league.fixtures.map((f) => f.home), league.fixtures.map((f) => f.round % league.teams.length));
  const start = today(state) + 1;
  for (const f of league.fixtures) f.day = start + f.round;
  const { state: copy } = readSave(JSON.stringify(createSave(state, { id: 'etapa' })));
  const rcopy = prepare(copy);
  untilDay(state, rt, start + SPORTS.meets);
  untilDay(copy, rcopy, start + SPORTS.meets);
  assert.deepEqual(copy.sports, state.sports, 'salvar antes das etapas e carregar dá o mesmo resultado');

  assert.equal(league.done, true);
  assert.ok(league.fixtures.every((f) => f.score.length === league.teams.length));
  const t = league.table;
  assert.equal(t.reduce((s, x) => s + x.pts, 0), SPORTS.meets * SPORTS.meetPoints.reduce((s, p) => s + p, 0));
  for (const medal of ['w', 'd', 'l']) assert.equal(t.reduce((s, x) => s + x[medal], 0), SPORTS.meets);
  const pos = standings(league).findIndex((i) => league.teams[i].club === club.id);
  assert.equal(pos, 0, 'o time muito mais forte vence');
  assert.equal(club.division, 1);
  assert.equal(state.sports.history.at(-1).position, 1);
  assert.ok(state.news.pending.some((n) => n.kind === 'medalha') || state.news.items.some((i) => i.cat === 'esporte' && /ouro/.test(i.body)));
  assert.ok(league.fixtures.some((f) => league.teams[f.home].club === club.id && f.attendance > 0), 'público na etapa em casa');
});

test('críquete: placar em corridas, sem empate na prorrogação; pontos 2 e 0', () => {
  const rng = createRng(4);
  for (let i = 0; i < 200; i++) {
    const s = drawScore(rng, 'criquete', 0.5, 0.45);
    assert.ok(s[0] > 60 && s[0] < 300 && s[1] > 60 && s[1] < 300, String(s));
    assert.notEqual(s[0], s[1]);
  }
  assert.deepEqual(matchPoints('criquete', [180, 150]), [2, 0]);
});
