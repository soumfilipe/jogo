// Esporte: clubes da cidade jogando ligas contra cidades rivais inventadas
// (modalidades e números em SPORTS, no catálogo).
//
// Formato no estado (state.sports):
//   clubs:   [{ id, name, sport, home (id do prédio), division (0 Estadual,
//               1 Regional, 2 Nacional), cash (caixa do clube), training
//               (verba mensal de treino), subsidy (repasse mensal da
//               prefeitura), reinvest (prêmios viram treino), ct (centro de
//               treinamento, 0 a 3), fans (torcida, 0 a 1), players: [ids de
//               cidadãos], founded (tick), trophies, red (meses no vermelho),
//               closed? }]
//   rivals:  [{ id, sport, division, name, strength }] (times de fora; ficam
//               entre as temporadas, sobem e caem como os da cidade)
//   leagues: [{ id, sport, division, season (ano), teams: [{ club } | { rival }],
//               fixtures: [{ id, round, day, home, away (índices em teams),
//               score: [casa, fora] | null, attendance? }], table: [{ pts, w,
//               d, l, f, a }] (na ordem de teams), done }]
//            Nas modalidades individuais (atletismo, ginástica, natação), cada
//            fixture é uma etapa com todos os times: home = sede, away = null e
//            score = a classificação da etapa (índices em teams, do 1º ao
//            último); na tabela, w/d/l contam ouros, pratas e bronzes.
//   history: últimas temporadas dos clubes da cidade [{ season, sport, club,
//               name, division, position, teams, promoted, relegated, prize }]
//   offers:  propostas de clubes de fora pelos craques [{ id, club, player,
//               name, buyer, value, until (tick), status: 'aberta' | 'recusada' }]
//               (a recusada fica até `until` só para o comprador não voltar logo)
//   sales:   últimas vendas [{ id, club, clubName, name, buyer, value, day, people }]
//
// Escolinha (base): o clube tem `academy` (0 a 3: categorias abertas, da
// sub-17 para a sub-11), `youthBudget` (verba mensal) e `youth` (ids de
// crianças e adolescentes da cidade). O jovem tem `youth` (id do clube) e
// `skill`; continua estudando. Aos 18 anos sobe ao time adulto (ou é
// dispensado, se não for melhor que o pior do elenco cheio).
//
// Atleta: cidadão com `athlete` (id do clube), `skill` (habilidade, 0 a 1) e
// `fullTime = 'esporte'` (não procura emprego; conta como empregado no
// imposto). Tudo sorteado com state.rng, no estado: carregar um save continua igual.
//
// Calendário: a temporada de cada modalidade começa no primeiro dia do mês
// de início (SPORTS.kinds[x].season) com turno e returno, uma rodada a cada
// uma ou duas semanas no dia de jogo. Os jogos são sorteados à meia-noite: o
// público do jogo em casa anda até o local à tarde (ver tourism.js).

import { BUILDINGS, SPORTS } from '../world/catalog.js';
import { TICKS_PER_DAY, TICKS_PER_MONTH } from '../core/time.js';
import { chance, pick, random, randomInt } from '../core/rng.js';
import { familyOf, removeCitizen, sendHome, setJob } from '../world/runtime.js';
import { canWork } from '../agents/citizens.js';
import { entryTiles } from './tourism.js';
import { mod } from './mods.js';
import { report } from './news.js';

const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const round3 = (v) => Math.round(v * 1000) / 1000;
const DAYS_PER_YEAR = 360;
export const today = (state) => Math.floor(state.time.tick / TICKS_PER_DAY);
const yearOf = (day) => Math.floor(day / DAYS_PER_YEAR) + 1;
const PRIZE_SHARE = [1, 0.5, 0.3, 0.2];

export function createSports() {
  return { clubs: [], rivals: [], leagues: [], history: [], offers: [], sales: [], races: [], nextId: 1 };
}

/** Modalidades que a cidade já pode ter. */
export function unlockedSports(rt) {
  return Object.keys(SPORTS.kinds).filter((id) => rt.techDone?.has(SPORTS.kinds[id].tech));
}

export const activeClubs = (state) => (state.sports?.clubs ?? []).filter((c) => !c.closed);

/** Prédios que são casa de algum clube (não chamam a torcida genérica de domingo). */
export function clubHomes(state) {
  return new Set(activeClubs(state).map((c) => c.home));
}

/** Atletas do clube que ainda moram na cidade. */
export function squad(state, rt, club) {
  return club.players.map((id) => rt.citizenById.get(id)).filter((c) => c && c.athlete === club.id);
}

/** Força do clube (0 a 1): média dos titulares, mais o local e o centro de treinamento. */
export function clubStrength(state, rt, club) {
  if (club.closed) return 0.15;
  const kind = SPORTS.kinds[club.sport];
  const skills = squad(state, rt, club).map((c) => c.skill ?? 0).sort((a, b) => b - a).slice(0, kind.starters);
  while (skills.length < kind.starters) skills.push(0.1); // falta gente: entra quem estiver por perto
  const avg = skills.reduce((s, v) => s + v, 0) / kind.starters;
  const venue = rt.buildingById.get(club.home);
  const bonus = (venue && SPORTS.venues[venue.type]?.bonus) || 0;
  return clamp(avg + bonus + club.ct * SPORTS.ct.strength);
}

/** Jovens da escolinha do clube que ainda moram na cidade. */
export function academyKids(state, rt, club) {
  return (club.youth ?? []).map((id) => rt.citizenById.get(id)).filter((c) => c && c.youth === club.id);
}

/** Categoria de base (do catálogo) de quem tem `age` anos, entre as `level` abertas. */
export function youthCategory(age, level = SPORTS.academy.categories.length) {
  return SPORTS.academy.categories.slice(0, level).find((c) => age >= c.ages[0] && age <= c.ages[1]) ?? null;
}

/** Despesas do mês do clube: salários, treino e a base (alunos e verba). */
export function clubCosts(state, rt, club) {
  const salaries = Math.round(squad(state, rt, club).reduce((s, c) => s + SPORTS.salary * (0.5 + (c.skill ?? 0)), 0));
  const youth = academyKids(state, rt, club).length * SPORTS.academy.perKid + (club.youthBudget ?? 0);
  return { salaries, training: club.training, youth, total: salaries + club.training + youth };
}

/** Receitas do mês do clube (sem os ingressos): patrocínio, transmissão e o repasse da prefeitura. */
export function clubIncome(state, rt, club) {
  const div = SPORTS.divisions[club.division];
  const sponsor = Math.round(div.sponsor * mod(rt, 'sports.sponsor'));
  const broadcast = mod(rt, 'broadcast', 0) > 0 ? div.broadcast : 0;
  return { sponsor, broadcast, subsidy: club.subsidy, total: sponsor + broadcast + club.subsidy };
}

/** Repasse mensal da prefeitura aos clubes (despesa "Esporte" do orçamento). */
export function sportsSubsidy(state) {
  return activeClubs(state).reduce((s, c) => s + c.subsidy, 0);
}

// --- Elenco -----------------------------------------------------------------

function sign(state, rt, c, club) {
  if (c.job !== null) {
    if (c.state !== 'casa') sendHome(state, rt, c);
    setJob(rt, c, null);
  }
  c.fullTime = 'esporte';
  c.athlete = club.id;
  // Começa amador: o talento dá o teto inicial; o treino faz o resto.
  c.skill ??= round3(clamp(0.1 + (c.talent ?? 0) * 0.3 + (c.calling === 'esporte' ? 0.05 : 0)));
  club.players.push(c.id);
}

/** O atleta deixa o clube e volta a procurar emprego. */
export function release(state, rt, c) {
  const club = state.sports.clubs.find((x) => x.id === c.athlete);
  if (club) club.players = club.players.filter((id) => id !== c.id);
  delete c.athlete;
  delete c.fullTime;
}

/**
 * Completa o elenco: primeiro quem tem vocação para o esporte, depois os
 * mais talentosos em idade de jogar. Devolve quantos faltam.
 */
export function recruit(state, rt, club) {
  const kind = SPORTS.kinds[club.sport];
  club.players = club.players.filter((id) => rt.citizenById.get(id)?.athlete === club.id);
  const need = kind.squad - club.players.length;
  if (need <= 0) return 0;
  const [a0, a1] = SPORTS.ages;
  const candidates = state.citizens
    .filter((c) => c.age >= a0 && c.age <= a1 && c.athlete === undefined && c.artist === undefined && canWork(c))
    .sort((a, b) => (b.calling === 'esporte') - (a.calling === 'esporte') || (b.talent ?? 0) - (a.talent ?? 0) || a.id - b.id);
  for (const c of candidates.slice(0, need)) sign(state, rt, c, club);
  return kind.squad - club.players.length;
}

// --- Comandos ---------------------------------------------------------------

/** Funda um clube (comando 'club'). Devolve { ok, cost, reason, short }. */
export function foundClub(state, rt, cmd) {
  const sports = state.sports;
  const kind = SPORTS.kinds[cmd.sport];
  if (!kind) return { ok: false, cost: 0, reason: 'Modalidade desconhecida.' };
  if (!unlockedSports(rt).includes(cmd.sport)) return { ok: false, cost: 0, reason: `${kind.name} ainda não está liberado pela pesquisa.` };
  const b = rt.buildingById.get(cmd.home);
  if (!b || !kind.venues.includes(b.type)) {
    return { ok: false, cost: 0, reason: `Um clube de ${kind.name.toLowerCase()} joga em ${kind.venues.map((v) => BUILDINGS[v].name.toLowerCase()).join(' ou ')}.` };
  }
  if (activeClubs(state).some((c) => c.home === b.id && c.sport === cmd.sport)) return { ok: false, cost: 0, reason: `Esse local já tem um clube de ${kind.name.toLowerCase()}.` };
  if (SPORTS.foundCost > state.economy.money) return { ok: false, cost: SPORTS.foundCost, reason: `Dinheiro insuficiente (custa $${SPORTS.foundCost.toLocaleString('pt-BR')}).` };
  const base = cmd.sport === 'futebol' ? `Esporte Clube ${state.city.name}` : `${kind.name} ${state.city.name}`;
  let name = (cmd.name || '').trim().slice(0, 40) || base;
  for (let n = 2; sports.clubs.some((c) => c.name === name); n++) name = `${base} ${n}`;
  const club = {
    id: sports.nextId++, name, sport: cmd.sport, home: b.id, division: 0, cash: SPORTS.foundCost, training: 2_000, subsidy: 0,
    reinvest: true, ct: 0, fans: 0.2, players: [], founded: state.time.tick, trophies: 0, red: 0,
    academy: 0, youthBudget: 0, youth: [],
  };
  sports.clubs.push(club);
  state.economy.money -= SPORTS.foundCost;
  const short = recruit(state, rt, club);
  report(state, { kind: 'clube_fundado', name: club.name, sport: club.sport, tile: b.tile });
  return { ok: true, cost: SPORTS.foundCost, short };
}

/** Verba do clube (comando 'clubBudget'): treino, repasse da prefeitura, reinvestir prêmios. */
export function clubBudget(state, rt, cmd) {
  const club = activeClubs(state).find((c) => c.id === cmd.id);
  if (!club) return { ok: false, cost: 0, reason: 'Clube não encontrado.' };
  const valid = (v) => v === undefined || (Number.isFinite(v) && v >= 0 && v <= 1_000_000);
  if (!valid(cmd.training) || !valid(cmd.subsidy) || !valid(cmd.youthBudget)) return { ok: false, cost: 0, reason: 'Valores inválidos.' };
  if (cmd.training !== undefined) club.training = Math.round(cmd.training);
  if (cmd.youthBudget !== undefined) club.youthBudget = Math.round(cmd.youthBudget);
  if (cmd.subsidy !== undefined) club.subsidy = Math.round(cmd.subsidy);
  if (cmd.reinvest !== undefined) club.reinvest = Boolean(cmd.reinvest);
  return { ok: true, cost: 0 };
}

/** Sobe um nível do centro de treinamento (comando 'clubCt'), pago pela prefeitura. */
export function upgradeCt(state, rt, cmd) {
  const club = activeClubs(state).find((c) => c.id === cmd.id);
  if (!club) return { ok: false, cost: 0, reason: 'Clube não encontrado.' };
  if (club.ct >= SPORTS.ct.cost.length) return { ok: false, cost: 0, reason: 'O centro de treinamento já está no nível máximo.' };
  const cost = SPORTS.ct.cost[club.ct];
  if (cost > state.economy.money) return { ok: false, cost, reason: `Dinheiro insuficiente (custa $${cost.toLocaleString('pt-BR')}).` };
  state.economy.money -= cost;
  club.ct++;
  return { ok: true, cost };
}

/** Fecha o clube (comando 'closeClub'): os atletas voltam ao mercado. */
export function closeClub(state, rt, cmd) {
  const club = activeClubs(state).find((c) => c.id === cmd.id);
  if (!club) return { ok: false, cost: 0, reason: 'Clube não encontrado.' };
  for (const c of squad(state, rt, club)) release(state, rt, c);
  for (const c of academyKids(state, rt, club)) delete c.youth;
  club.players = [];
  club.youth = [];
  club.closed = true;
  state.sports.offers = state.sports.offers.filter((o) => o.club !== club.id);
  return { ok: true, cost: 0 };
}

// --- Temporada --------------------------------------------------------------

function createRival(state, sport, division) {
  const sports = state.sports;
  const rng = state.rng;
  const taken = new Set(sports.rivals.filter((r) => r.sport === sport).map((r) => r.name));
  let name = '';
  for (let i = 0; i < 20 && (!name || taken.has(name)); i++) name = `${pick(rng, SPORTS.rivalTeams)} de ${pick(rng, SPORTS.rivalCities)}`;
  const rival = { id: sports.nextId++, sport, division, name, strength: round3(clamp(SPORTS.divisions[division].strength + (random(rng) - 0.5) * 0.2, 0.1, 0.95)) };
  sports.rivals.push(rival);
  return rival;
}

/** Nome de um time da liga. */
export function teamName(state, team) {
  if (team.club !== undefined) return state.sports.clubs.find((c) => c.id === team.club)?.name ?? 'Clube extinto';
  return state.sports.rivals.find((r) => r.id === team.rival)?.name ?? 'Rival';
}

function teamStrength(state, rt, team) {
  if (team.club !== undefined) {
    const club = state.sports.clubs.find((c) => c.id === team.club);
    return club ? clubStrength(state, rt, club) : 0.15;
  }
  return state.sports.rivals.find((r) => r.id === team.rival)?.strength ?? 0.3;
}

/** Primeiro dia (absoluto) da temporada da modalidade no ano `year` (1, 2, ...). */
export function seasonStart(sport, year) {
  return (year - 1) * DAYS_PER_YEAR + (SPORTS.kinds[sport].season[0] - 1) * 30;
}

/** Monta as ligas da temporada: os clubes da cidade de cada divisão mais rivais de fora. */
export function newSeason(state, rt, sport, year) {
  const sports = state.sports;
  const rng = state.rng;
  const kind = SPORTS.kinds[sport];
  const clubs = activeClubs(state).filter((c) => c.sport === sport);
  for (let d = 0; d < SPORTS.divisions.length; d++) {
    const mine = clubs.filter((c) => c.division === d);
    if (!mine.length) continue;
    const need = Math.max(0, SPORTS.teams - mine.length);
    const pool = sports.rivals.filter((r) => r.sport === sport && r.division === d).sort((a, b) => a.id - b.id);
    while (pool.length < need) pool.push(createRival(state, sport, d));
    const teams = [...mine.map((c) => ({ club: c.id })), ...pool.slice(0, need).map((r) => ({ rival: r.id }))];
    // Sorteia a ordem (quem joga com quem em cada rodada).
    for (let i = teams.length - 1; i > 0; i--) {
      const j = randomInt(rng, 0, i);
      [teams[i], teams[j]] = [teams[j], teams[i]];
    }
    const n = teams.length + (teams.length % 2);
    const rounds = kind.individual ? SPORTS.meets : 2 * (n - 1);
    const start = seasonStart(sport, year);
    const first = start + ((kind.weekday - (start % 7)) + 7) % 7;
    const days = (kind.season[1] - kind.season[0] + 1) * 30;
    const every = 7 * Math.max(1, Math.floor((days - (first - start)) / rounds / 7));
    const table = teams.map(() => ({ pts: 0, w: 0, d: 0, l: 0, f: 0, a: 0 }));
    if (kind.individual) {
      // Etapas: todos competem no mesmo dia; a sede gira entre os times.
      const fixtures = [];
      for (let r = 0; r < rounds; r++) fixtures.push({ id: sports.nextId++, round: r, day: first + r * every, home: r % teams.length, away: null, score: null });
      sports.leagues.push({ id: sports.nextId++, sport, division: d, season: year, teams, fixtures, table, done: false });
      continue;
    }
    // Rodízio (método do círculo): turno e, no returno, os mandos trocados.
    const order = [...Array(n).keys()];
    const fixtures = [];
    for (let r = 0; r < n - 1; r++) {
      for (let i = 0; i < n / 2; i++) {
        const a = order[i];
        const b = order[n - 1 - i];
        if (a >= teams.length || b >= teams.length) continue; // folga (número ímpar de times)
        const [home, away] = (r + i) % 2 ? [b, a] : [a, b];
        fixtures.push({ id: sports.nextId++, round: r, day: first + r * every, home, away, score: null });
        fixtures.push({ id: sports.nextId++, round: r + n - 1, day: first + (r + n - 1) * every, home: away, away: home, score: null });
      }
      order.splice(1, 0, order.pop());
    }
    fixtures.sort((a, b) => a.day - b.day || a.id - b.id);
    sports.leagues.push({ id: sports.nextId++, sport, division: d, season: year, teams, fixtures, table, done: false });
  }
}

function poisson(rng, lambda) {
  const limit = Math.exp(-lambda);
  let k = 0;
  let p = random(rng);
  while (p > limit) {
    k++;
    p *= random(rng);
  }
  return k;
}

/** Sorteia o placar [casa, fora] no formato da modalidade. */
export function drawScore(rng, sport, home, away) {
  const kind = SPORTS.kinds[sport];
  const diff = home - away;
  if (kind.score === 'sets') {
    const p = clamp(0.5 + 1.5 * diff, 0.1, 0.9);
    const s = [0, 0];
    while (s[0] < 3 && s[1] < 3) s[random(rng) < p ? 0 : 1]++;
    return s;
  }
  if (kind.score === 'pontos') {
    // Basquete (pontos) e críquete (corridas): base e quanto a diferença de força pesa.
    const base = kind.base ?? 75;
    const spread = kind.spread ?? 30;
    const noise = () => (random(rng) + random(rng) + random(rng) + random(rng) - 2) * 12 * (base / 75);
    const s = [Math.round(base + spread * diff + noise()), Math.round(base - spread * diff + noise())];
    while (s[0] === s[1]) {
      s[0] += randomInt(rng, 3, 12); // prorrogação
      s[1] += randomInt(rng, 3, 12);
    }
    return s.map((v) => Math.max(30, v));
  }
  const k = 2.5 * Math.sqrt(1.3 / kind.goals);
  return [poisson(rng, kind.goals * Math.exp(k * diff)), poisson(rng, kind.goals * Math.exp(-k * diff))];
}

/** Pontos de cada lado pelo placar. */
export function matchPoints(sport, [h, a]) {
  const [win, draw, loss] = SPORTS.kinds[sport].points;
  if (sport === 'volei') {
    const close = Math.min(h, a) === 2;
    return h > a ? [close ? 2 : 3, close ? 1 : 0] : [close ? 1 : 0, close ? 2 : 3];
  }
  if (h === a) return [draw, draw];
  return h > a ? [win, loss] : [loss, win];
}

/** Público de um jogo em casa do clube. */
function attendance(state, rt, club, strength) {
  const venue = rt.buildingById.get(club.home);
  const capacity = (venue && SPORTS.venues[venue.type]?.capacity) || 0;
  const pop = state.citizens.length;
  const outside = entryTiles(state, rt).tiles.length > 0 ? SPORTS.audience.regional : 0;
  const pool = pop * SPORTS.audience.city + outside;
  const jitter = 1 + (random(state.rng) - 0.5) * 0.2;
  return Math.round(Math.min(capacity, pool * (0.3 + club.fans) * (0.5 + strength) * jitter));
}

/** Jogo ou etapa em casa: público, ingressos no caixa do clube e a taxa da prefeitura. */
function gate(state, rt, club, fx, strength) {
  fx.attendance = attendance(state, rt, club, strength);
  const revenue = fx.attendance * SPORTS.ticket;
  club.cash += Math.round(revenue * (1 - SPORTS.cityShare));
  state.economy.sportsIncome = (state.economy.sportsIncome ?? 0) + Math.round(revenue * SPORTS.cityShare);
}

/** Etapa de modalidade individual: todos os times competem; a ordem dá pontos e medalhas. */
function playMeet(state, rt, league, fx) {
  const sports = state.sports;
  const rng = state.rng;
  const kind = SPORTS.kinds[league.sport];
  const perf = league.teams.map((team, i) => teamStrength(state, rt, team) + (i === fx.home ? 0.02 : 0) + (random(rng) - 0.5) * 2 * SPORTS.meetNoise);
  fx.score = league.teams.map((_, i) => i).sort((x, y) => perf[y] - perf[x] || x - y);
  fx.score.forEach((i, pos) => {
    const t = league.table[i];
    t.pts += SPORTS.meetPoints[pos] ?? 0;
    if (pos === 0) t.w++;
    else if (pos === 1) t.d++;
    else if (pos === 2) t.l++;
  });
  const host = league.teams[fx.home];
  const hostClub = host.club !== undefined ? sports.clubs.find((c) => c.id === host.club) : null;
  if (hostClub && !hostClub.closed) gate(state, rt, hostClub, fx, perf[fx.home]);
  fx.score.forEach((i, pos) => {
    const club = league.teams[i].club !== undefined ? sports.clubs.find((c) => c.id === league.teams[i].club) : null;
    if (!club || club.closed) return;
    club.fans = round3(clamp(club.fans + (pos < 3 ? 0.01 * (1 - club.fans) : pos >= 5 ? -0.005 : 0), 0.05, 1));
    if (pos >= 3) return;
    const star = squad(state, rt, club).sort((a, b) => b.skill - a.skill || a.id - b.id)[0];
    const venue = rt.buildingById.get(club.home);
    report(state, {
      kind: 'medalha', sport: league.sport, club: club.name, name: star?.name ?? club.name, event: pick(rng, kind.events),
      position: pos + 1, round: fx.round + 1, tile: venue?.tile ?? null,
      // Onde foi a etapa: a cidade (sede da casa) ou a cidade da rival.
      host: host.club !== undefined ? state.city.name : teamName(state, host).split(' de ').slice(1).join(' de ') || teamName(state, host),
    });
  });
}

function playMatch(state, rt, league, fx) {
  const sports = state.sports;
  const home = league.teams[fx.home];
  const away = league.teams[fx.away];
  const homeClub = home.club !== undefined ? sports.clubs.find((c) => c.id === home.club) : null;
  const awayClub = away.club !== undefined ? sports.clubs.find((c) => c.id === away.club) : null;
  const sh = teamStrength(state, rt, home);
  const sa = teamStrength(state, rt, away);
  const crowd = homeClub && !homeClub.closed ? 0.05 + 0.05 * homeClub.fans : 0.05; // mando de campo
  fx.score = drawScore(state.rng, league.sport, sh + crowd, sa);
  const [ph, pa] = matchPoints(league.sport, fx.score);
  const th = league.table[fx.home];
  const ta = league.table[fx.away];
  th.pts += ph;
  ta.pts += pa;
  th.f += fx.score[0];
  th.a += fx.score[1];
  ta.f += fx.score[1];
  ta.a += fx.score[0];
  const [h, a] = fx.score;
  if (h > a) (th.w++, ta.l++);
  else if (h < a) (th.l++, ta.w++);
  else (th.d++, ta.d++);

  if (homeClub && !homeClub.closed) gate(state, rt, homeClub, fx, sh);
  for (const [club, mine, theirs, isHome] of [[homeClub, h, a, true], [awayClub, a, h, false]]) {
    if (!club || club.closed) continue;
    club.fans = round3(clamp(club.fans + (mine > theirs ? 0.01 * (1 - club.fans) : mine < theirs ? -0.008 : 0), 0.05, 1));
    const venue = rt.buildingById.get(club.home);
    report(state, {
      kind: 'jogo', sport: league.sport, club: club.name, rival: teamName(state, isHome ? away : home),
      home: isHome, score: [mine, theirs], attendance: isHome ? fx.attendance : null, tile: venue?.tile ?? null,
    });
  }
}

/** Classificação: [índice do time] do primeiro ao último. */
export function standings(league) {
  return league.teams.map((_, i) => i).sort((x, y) => {
    const a = league.table[x];
    const b = league.table[y];
    // Individuais desempatam por ouros e pratas; coletivos, por saldo e gols pró.
    if (SPORTS.kinds[league.sport].individual) return b.pts - a.pts || b.w - a.w || b.d - a.d || x - y;
    return b.pts - a.pts || (b.f - b.a) - (a.f - a.a) || b.f - a.f || x - y;
  });
}

function endSeason(state, rt, league) {
  const sports = state.sports;
  const div = SPORTS.divisions[league.division];
  const order = standings(league);
  const n = order.length;
  order.forEach((idx, pos) => {
    const team = league.teams[idx];
    const promoted = pos < SPORTS.up && league.division < SPORTS.divisions.length - 1;
    const relegated = pos >= n - SPORTS.down && league.division > 0;
    const shift = promoted ? 1 : relegated ? -1 : 0;
    if (team.rival !== undefined) {
      const r = sports.rivals.find((x) => x.id === team.rival);
      if (r) {
        r.division += shift;
        r.strength = round3(clamp(r.strength + (random(state.rng) - 0.5) * 0.06 + shift * 0.03, 0.1, 0.95));
      }
      return;
    }
    const club = sports.clubs.find((c) => c.id === team.club);
    if (!club || club.closed) return;
    const prize = Math.round(div.prize * (PRIZE_SHARE[pos] ?? 0.1));
    club.cash += prize;
    club.division += shift;
    if (pos === 0) club.trophies++;
    club.fans = round3(clamp(club.fans + (pos === 0 ? 0.1 : promoted ? 0.05 : relegated ? -0.08 : 0), 0.05, 1));
    sports.history.push({
      season: league.season, sport: league.sport, club: club.id, name: club.name, division: league.division,
      position: pos + 1, teams: n, promoted, relegated, prize,
    });
    // Prêmios reinvestidos: o caixa acima da reserva vira treino.
    if (club.reinvest) {
      const reserve = SPORTS.reserveMonths * clubCosts(state, rt, club).total;
      if (club.cash > reserve) club.training += Math.round((club.cash - reserve) / 12 / 100) * 100;
    }
    const star = squad(state, rt, club).sort((a, b) => b.skill - a.skill || a.id - b.id)[0];
    report(state, {
      kind: 'temporada', sport: league.sport, club: club.name, position: pos + 1, division: div.name,
      next: SPORTS.divisions[club.division].name, champion: pos === 0, promoted, relegated, star: star?.name ?? null,
    });
  });
  if (sports.history.length > 40) sports.history.splice(0, sports.history.length - 40);
  league.done = true;
}

/** Jogos em casa dos clubes da cidade hoje (com o público já sorteado), para o público andar até o local. */
export function matchesToday(state) {
  const now = today(state);
  const out = [];
  for (const league of state.sports?.leagues ?? []) {
    if (league.done && league.season < yearOf(now)) continue;
    for (const fx of league.fixtures) {
      if (fx.day !== now || !fx.attendance) continue;
      const club = state.sports.clubs.find((c) => c.id === league.teams[fx.home].club);
      if (club && !club.closed) out.push({ league, fx, club });
    }
  }
  return out;
}

/** Meia-noite: começa temporadas, joga as partidas do dia e encerra as ligas. */
export function runSportsOfDay(state, rt) {
  const sports = state.sports;
  if (!sports) return;
  const now = today(state);
  const year = yearOf(now);
  for (const sport of Object.keys(SPORTS.kinds)) {
    if (now !== seasonStart(sport, year)) continue;
    if (sports.leagues.some((l) => l.sport === sport && l.season === year)) continue;
    newSeason(state, rt, sport, year);
  }
  for (const league of sports.leagues) {
    if (league.done) continue;
    const play = SPORTS.kinds[league.sport].individual ? playMeet : playMatch;
    for (const fx of league.fixtures) if (fx.day === now && !fx.score) play(state, rt, league, fx);
    if (league.fixtures.every((f) => f.score)) endSeason(state, rt, league);
  }
  // Ficam as ligas desta temporada e da anterior (para o painel).
  sports.leagues = sports.leagues.filter((l) => l.season >= year - 1);
}

// --- Escolinha (base) ---------------------------------------------------------

/** Abre a próxima categoria da escolinha (comando 'clubAcademy'), paga pela prefeitura. */
export function openAcademy(state, rt, cmd) {
  const club = activeClubs(state).find((c) => c.id === cmd.id);
  if (!club) return { ok: false, cost: 0, reason: 'Clube não encontrado.' };
  const A = SPORTS.academy;
  if (club.academy >= A.categories.length) return { ok: false, cost: 0, reason: 'A escolinha já tem todas as categorias.' };
  const cost = A.cost[club.academy];
  if (cost > state.economy.money) return { ok: false, cost, reason: `Dinheiro insuficiente (custa $${cost.toLocaleString('pt-BR')}).` };
  state.economy.money -= cost;
  const category = A.categories[club.academy];
  club.academy++;
  enrollYouth(state, rt, club);
  report(state, { kind: 'escolinha', club: club.name, sport: club.sport, category: category.name });
  return { ok: true, cost };
}

/** Preenche as vagas das categorias abertas: vocação para o esporte primeiro, depois talento. */
export function enrollYouth(state, rt, club) {
  const A = SPORTS.academy;
  club.youth = academyKids(state, rt, club).filter((c) => {
    if (youthCategory(c.age, club.academy)) return true;
    delete c.youth; // passou da idade (ou a categoria não está aberta)
    return false;
  }).map((c) => c.id);
  for (const cat of A.categories.slice(0, club.academy)) {
    const inCat = (c) => c.age >= cat.ages[0] && c.age <= cat.ages[1];
    const free = A.seats - academyKids(state, rt, club).filter(inCat).length;
    if (free <= 0) continue;
    const kids = state.citizens
      .filter((c) => inCat(c) && c.youth === undefined && c.athlete === undefined)
      .sort((a, b) => (b.calling === 'esporte') - (a.calling === 'esporte') || (b.talent ?? 0) - (a.talent ?? 0) || a.id - b.id)
      .slice(0, free);
    for (const c of kids) {
      c.youth = club.id;
      c.skill ??= round3(0.05 + (c.talent ?? 0) * 0.15);
      club.youth.push(c.id);
    }
  }
}

/**
 * O jovem sobe ao time adulto. Com o elenco cheio, entra no lugar do pior
 * (se for melhor que ele, ou se `force`); se não, deixa a base.
 */
function promote(state, rt, club, c, force = false) {
  club.youth = club.youth.filter((id) => id !== c.id);
  delete c.youth;
  const players = squad(state, rt, club);
  if (players.length >= SPORTS.kinds[club.sport].squad) {
    const worst = [...players].sort((a, b) => a.skill - b.skill || b.id - a.id)[0];
    if (!force && worst.skill >= c.skill) return false;
    release(state, rt, worst);
  }
  sign(state, rt, c, club);
  if (c.skill >= 0.45) report(state, { kind: 'revelacao', club: club.name, sport: club.sport, name: c.name, age: c.age, skill: c.skill });
  return true;
}

/** Sobe um jovem de 16 ou 17 anos antes da hora (comando 'promoteYouth'). */
export function promoteYouth(state, rt, cmd) {
  const club = activeClubs(state).find((c) => c.id === cmd.id);
  const c = rt.citizenById.get(cmd.player);
  if (!club || !c || c.youth !== club.id) return { ok: false, cost: 0, reason: 'Jovem não encontrado na base do clube.' };
  if (c.age < 16) return { ok: false, cost: 0, reason: 'Só sobe ao profissional quem tem 16 anos ou mais.' };
  promote(state, rt, club, c, true);
  return { ok: true, cost: 0 };
}

// --- Mercado ------------------------------------------------------------------

/** Habilidade a partir da qual o atleta do clube é craque (atrai propostas). */
export function starSkill(club) {
  const M = SPORTS.market;
  return Math.min(SPORTS.divisions[club.division].strength + M.star, M.minStar);
}

/** Clubes de fora fazem propostas pelos craques (uma por atleta de cada vez). */
function makeOffers(state, rt) {
  const sports = state.sports;
  const rng = state.rng;
  const M = SPORTS.market;
  const tick = state.time.tick;
  sports.offers = sports.offers.filter((o) => o.until > tick && rt.citizenById.get(o.player)?.athlete === o.club);
  for (const club of activeClubs(state).sort((a, b) => a.id - b.id)) {
    const star = starSkill(club);
    for (const c of squad(state, rt, club).sort((a, b) => a.id - b.id)) {
      if (c.skill < star || sports.offers.some((o) => o.player === c.id) || !chance(rng, M.chance)) continue;
      const luck = 0.8 + random(rng) * 0.4;
      const value = Math.round(M.base * c.skill ** 3 * (c.age < M.youngAge ? M.young : 1) * (1 + club.division * M.division)
        * luck * mod(rt, 'sports.offers') / 1000) * 1000;
      const offer = { id: sports.nextId++, club: club.id, player: c.id, name: c.name, buyer: pick(rng, SPORTS.buyers), value, until: tick + M.days * TICKS_PER_DAY, status: 'aberta' };
      sports.offers.push(offer);
      report(state, { kind: 'proposta', club: club.name, name: c.name, buyer: offer.buyer, value });
    }
  }
}

/** Vende o atleta (comando 'acceptOffer'): o dinheiro vai para o clube e ele se muda com a família. */
export function acceptOffer(state, rt, cmd) {
  const sports = state.sports;
  const offer = sports.offers.find((o) => o.id === cmd.id && o.status === 'aberta');
  const club = offer && activeClubs(state).find((c) => c.id === offer.club);
  const c = offer && rt.citizenById.get(offer.player);
  if (!offer || !club || !c || c.athlete !== club.id) return { ok: false, cost: 0, reason: 'Essa proposta não está mais de pé.' };
  const fee = Math.round(offer.value * SPORTS.cityShare);
  club.cash += offer.value - fee;
  state.economy.sportsIncome = (state.economy.sportsIncome ?? 0) + fee;
  const family = familyOf(rt, c);
  release(state, rt, c);
  for (const id of family) removeCitizen(state, rt, id);
  sports.offers = sports.offers.filter((o) => o !== offer);
  sports.sales.push({ id: offer.id, club: club.id, clubName: club.name, name: offer.name, buyer: offer.buyer, value: offer.value, day: today(state), people: family.length });
  if (sports.sales.length > SPORTS.market.sales) sports.sales.shift();
  report(state, { kind: 'venda', club: club.name, name: offer.name, buyer: offer.buyer, value: offer.value, people: family.length });
  recruit(state, rt, club);
  return { ok: true, cost: -offer.value };
}

/** Recusa a proposta (comando 'rejectOffer'): o atleta fica e ninguém volta a oferecer por um tempo. */
export function rejectOffer(state, rt, cmd) {
  const offer = state.sports.offers.find((o) => o.id === cmd.id && o.status === 'aberta');
  if (!offer) return { ok: false, cost: 0, reason: 'Essa proposta não está mais de pé.' };
  offer.status = 'recusada';
  offer.until = state.time.tick + SPORTS.market.cooldown * TICKS_PER_MONTH;
  const club = state.sports.clubs.find((c) => c.id === offer.club);
  report(state, { kind: 'proposta_recusada', club: club?.name ?? '', name: offer.name, buyer: offer.buyer, value: offer.value });
  return { ok: true, cost: 0 };
}

/** Fim do mês: caixa dos clubes, evolução dos atletas e da base, subidas, reposição do elenco e propostas. */
export function closeSportsMonth(state, rt) {
  const sports = state.sports;
  if (!sports) return;
  const rng = state.rng;
  const { growth, scale } = SPORTS.training;
  const A = SPORTS.academy;
  for (const club of activeClubs(state).sort((a, b) => a.id - b.id)) {
    club.players = club.players.filter((id) => rt.citizenById.get(id)?.athlete === club.id);
    club.youth = academyKids(state, rt, club).map((c) => c.id);
    const income = clubIncome(state, rt, club).total;
    let costs = clubCosts(state, rt, club);
    // Sem dinheiro: corta a verba da base e depois o treino.
    for (const field of ['youthBudget', 'training']) {
      if (club.cash + income - costs.total < 0 && club[field] > 0) {
        club[field] = 0;
        costs = clubCosts(state, rt, club);
      }
    }
    club.cash += income - costs.total;
    club.red = club.cash < 0 ? club.red + 1 : 0;

    const players = squad(state, rt, club).sort((a, b) => a.id - b.id);
    const gain = growth * (0.3 + Math.log(1 + club.training / scale)) * (1 + club.ct * SPORTS.ct.bonus);
    for (const c of players) {
      const delta = c.age < SPORTS.peakAge ? gain : c.age <= SPORTS.declineAge ? gain * 0.2 : -SPORTS.decline;
      c.skill = round3(clamp((c.skill ?? 0) + delta + (random(rng) - 0.5) * 0.01));
      if (c.age > SPORTS.ages[1] || c.skill < 0.08) release(state, rt, c); // aposentadoria
    }
    // Base: evolui mais rápido; quem fez 18 anos sobe (ou deixa a base).
    const youthGain = A.growth * (0.3 + Math.log(1 + (club.youthBudget ?? 0) / A.scale)) * (1 + club.ct * SPORTS.ct.bonus) * mod(rt, 'sports.youth');
    for (const c of academyKids(state, rt, club).sort((a, b) => a.id - b.id)) {
      c.skill = round3(clamp((c.skill ?? 0) + youthGain + (random(rng) - 0.5) * 0.01));
      if (c.age >= SPORTS.ages[0]) promote(state, rt, club, c);
    }
    // Muito tempo no vermelho: os melhores vão embora (voltam ao mercado).
    if (club.red >= SPORTS.redMonths) {
      for (const c of squad(state, rt, club).sort((a, b) => b.skill - a.skill || a.id - b.id).slice(0, 2)) release(state, rt, c);
    }
    recruit(state, rt, club);
    enrollYouth(state, rt, club);
  }
  makeOffers(state, rt);
}
