// Cena cultural: artistas inventados com carreira, gêneros que entram e saem
// de moda, e filmes e peças com temporada (ver CULTURE no catálogo).
//
// Formato no estado (state.culture):
//   artists: [{ id, name, kind: 'musica'|'teatro', genre, fame (0 a 1),
//               trend (−1 a 1), born, debut (anos do mundo), shows, low,
//               local? (nasceu na cidade), citizen? (id do cidadão, quando
//               é da cidade), since? (tick em que virou artista da cidade),
//               lastCityShow? (tick do último show na cidade, ver agenda.js),
//               touring? (sem show na cidade há meses: em turnê) }]
//   genres:  { gênero: { hype (0,1 a 1) } }
//   works:   [{ id, kind: 'filme'|'peca', title, genre, quality (0 a 1),
//               premiere (tick), peak, run (dias) }]
//   nextId
//   events, series, history: agenda de eventos (ver systems/agenda.js)
//
// Todo mês (closeCultureMonth): a moda dos gêneros anda, a fama de cada
// artista segue a tendência (veteranos tendem a cair), quem passa muito tempo
// esquecido se aposenta, estreiam filmes e peças e saem os que acabaram a
// temporada. Em janeiro surgem novatos (mais numa cidade grande), e cidadãos
// com vocação para a arte e talento viram artistas da cidade.
//
// Turnê: quem passa CULTURE.touringMonths sem show na cidade sai em turnê
// (a fama anda mais devagar e com mais sorte). O artista da cidade com fama
// vive da arte (larga o emprego); se passa CULTURE.leaveMonths sem
// oportunidade aqui, muda de cidade com a família. Tudo com state.rng, no
// estado: carregar um save continua igual.

import { CULTURE } from '../world/catalog.js';
import { FIRST_NAMES, LAST_NAMES } from '../agents/names.js';
import { chance, pick, random, randomInt } from '../core/rng.js';
import { TICKS_PER_DAY, TICKS_PER_MONTH, calendar } from '../core/time.js';
import { mod } from './mods.js';
import { removeCitizen, setJob } from '../world/runtime.js';
import { report } from './news.js';

const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

/** Gêneros em que surgem novatos no ano `year` do mundo. */
export function activeGenres(year, kind) {
  return Object.entries(CULTURE.genres)
    .filter(([, g]) => (!kind || g.kind === kind) && g.from <= year && (!g.until || year < g.until))
    .map(([id]) => id);
}

/** Cena inicial (jogo novo ou save antigo): artistas de várias gerações e obras em cartaz. */
export function createCulture(rng, year, tick = 0) {
  const culture = { artists: [], genres: {}, works: [], events: [], series: [], history: [], nextId: 1 };
  // Só os gêneros que ainda têm novatos: os que já acabaram não estão na moda.
  for (const id of activeGenres(year)) culture.genres[id] = { hype: 0.3 + random(rng) * 0.6 };
  for (let i = 0; i < CULTURE.startArtists; i++) {
    // Poucos famosos e muitos começando: fama ~ sorteio ao quadrado.
    const kind = random(rng) < 0.8 ? 'musica' : 'teatro';
    const genres = activeGenres(year, kind);
    if (!genres.length) continue;
    // A estreia nunca cai antes de o gênero surgir.
    const genre = pick(rng, genres);
    const debut = Math.max(year - randomInt(rng, 0, 30), CULTURE.genres[genre].from);
    addArtist(culture, rng, { kind, genre, debut, fame: random(rng) ** 2 });
  }
  // Algumas obras já em cartaz, em pontos diferentes da temporada.
  for (const kind of ['filme', 'peca']) {
    for (let i = 0; i < CULTURE.premieres[kind] * 2; i++) addWork(culture, rng, kind, year, tick - randomInt(rng, 0, 40) * TICKS_PER_DAY);
  }
  return culture;
}

function artistName(rng, kind, genre) {
  const person = `${pick(rng, FIRST_NAMES)} ${pick(rng, LAST_NAMES)}`;
  if (kind === 'teatro') return `Cia. ${pick(rng, LAST_NAMES)} de Teatro`;
  const prefix = CULTURE.stagePrefix[genre];
  if (prefix) return `${prefix} ${pick(rng, FIRST_NAMES)}`;
  const roll = random(rng);
  if (roll < 0.25) return `${pick(rng, CULTURE.bandNouns)} ${pick(rng, CULTURE.bandAdjectives)}`;
  if (roll < 0.35 && genre === 'sertanejo') return `${pick(rng, FIRST_NAMES)} & ${pick(rng, FIRST_NAMES)}`;
  return person;
}

function addArtist(culture, rng, { kind, genre, debut, fame, local = false }) {
  const artist = {
    id: culture.nextId++,
    name: artistName(rng, kind, genre),
    kind,
    genre,
    fame: clamp(fame),
    trend: (random(rng) - 0.5) * 0.6,
    born: debut - randomInt(rng, 16, 30),
    debut,
    shows: 0,
    low: 0,
  };
  if (local) artist.local = true;
  culture.artists.push(artist);
  return artist;
}

/** Gêneros de filme ou peça que já existem no ano `year` do mundo. */
export function workGenres(year, kind) {
  return Object.entries(CULTURE.workGenres[kind]).filter(([, from]) => from <= year).map(([g]) => g);
}

function addWork(culture, rng, kind, year, premiere) {
  const genre = pick(rng, workGenres(year, kind));
  const noun = pick(rng, CULTURE.titleNouns);
  // Às vezes sem o artigo ("Segredo do Sertão").
  const title = `${random(rng) < 0.7 ? noun : noun.replace(/^(O|A) /, '')} ${pick(rng, CULTURE.titlePlaces)}`;
  const work = {
    id: culture.nextId++,
    kind,
    title,
    genre,
    quality: 0.3 + random(rng) * 0.7,
    premiere,
    peak: randomInt(rng, CULTURE.peak[0], CULTURE.peak[1]),
    run: randomInt(rng, CULTURE.run[kind][0], CULTURE.run[kind][1]),
  };
  culture.works.push(work);
  return work;
}

/**
 * Um cidadão com vocação para a arte e talento vira artista da cidade (com o
 * nome dele). Devolve o artista, ou null se ninguém tem o perfil.
 */
export function cityTalent(state, rt, year = Math.floor(state.research.world)) {
  const culture = state.culture;
  const rng = state.rng;
  const candidates = state.citizens.filter((c) => c.calling === 'arte' && (c.talent ?? 0) >= CULTURE.artistTalent
    && c.age >= 18 && c.age <= 40 && c.artist === undefined);
  if (!candidates.length) return null;
  const c = pick(rng, candidates);
  const genres = activeGenres(year, 'musica');
  if (!genres.length) return null;
  const artist = addArtist(culture, rng, { kind: 'musica', genre: pick(rng, genres), debut: year, fame: 0.03 + c.talent * 0.1, local: true });
  artist.name = c.name;
  artist.citizen = c.id;
  artist.since = state.time.tick;
  c.artist = artist.id;
  return artist;
}

/**
 * Artistas da cidade: com fama, vivem da arte (largam o emprego); sem show na
 * cidade por muito tempo, mudam de cidade com a família e viram artistas de fora.
 */
function localArtists(state, rt) {
  const tick = state.time.tick;
  for (const a of state.culture.artists) {
    if (a.citizen === undefined) continue;
    const c = rt.citizenById.get(a.citizen);
    if (!c) {
      // O cidadão morreu ou foi embora por outro motivo.
      delete a.citizen;
      delete a.local;
      continue;
    }
    if (a.fame >= CULTURE.fullTimeFame && !c.fullTime) {
      c.fullTime = true;
      if (c.job !== null) setJob(rt, c, null);
    }
    const since = a.lastCityShow ?? a.since ?? tick;
    if (a.fame >= CULTURE.leaveFame && tick - since > CULTURE.leaveMonths * TICKS_PER_MONTH) {
      const surname = c.name.slice(c.name.indexOf(' ') + 1);
      const family = [...(rt.residents.get(c.home) ?? [])].filter((id) => {
        const m = rt.citizenById.get(id);
        return m && m.name.slice(m.name.indexOf(' ') + 1) === surname;
      });
      for (const id of family.sort((x, y) => x - y)) removeCitizen(state, rt, id);
      delete a.citizen;
      delete a.local;
      report(state, { kind: 'artista_saiu', name: a.name, genre: a.genre, people: family.length });
    }
  }
}

/** Fama que conta para o público: a do artista pesada pela moda do gênero. */
export function effectiveFame(culture, artist) {
  const hype = culture.genres[artist.genre]?.hype ?? 0.5;
  return artist.fame * (0.6 + 0.4 * hype);
}

/**
 * Público relativo da obra no dia (0 a qualidade): sobe até o auge e cai até
 * sair de cartaz.
 */
export function workCurve(work, tick) {
  const day = (tick - work.premiere) / TICKS_PER_DAY;
  if (day < 0 || day > work.run) return 0;
  const shape = day < work.peak ? day / work.peak : 1 - (day - work.peak) / Math.max(1, work.run - work.peak);
  return work.quality * Math.max(0, shape);
}

/** Obras em cartaz agora, da mais vista para a menos. */
export function nowShowing(culture, kind, tick) {
  return culture.works
    .filter((w) => w.kind === kind && workCurve(w, tick) > 0)
    .sort((a, b) => workCurve(b, tick) - workCurve(a, tick) || a.id - b.id);
}

/** Turistas por dia que um cinema (filmes) ou teatro (peças) atrai hoje. */
export function showingAppeal(culture, kind, tick) {
  if (!culture) return 0;
  // As três obras mais vistas puxam o público.
  const top = nowShowing(culture, kind, tick).slice(0, 3);
  return Math.round(top.reduce((sum, w) => sum + workCurve(w, tick), 0) * CULTURE.appeal[kind]);
}

/** Artistas em ordem de fama efetiva (o ranking do painel). */
export function ranking(culture) {
  return [...culture.artists].sort((a, b) => effectiveFame(culture, b) - effectiveFame(culture, a) || a.id - b.id);
}

/** Fechamento do mês: moda, carreiras, aposentadorias, novatos (janeiro) e estreias. */
export function closeCultureMonth(state, rt) {
  const culture = state.culture;
  if (!culture) return;
  const rng = state.rng;
  const year = Math.floor(state.research.world);
  // O streaming acelera tudo: a fama sobe e cai mais depressa.
  const speed = mod(rt, 'culture.speed');

  // Gêneros novos entram na cena; a moda anda um pouco todo mês.
  for (const id of activeGenres(year)) culture.genres[id] ??= { hype: 0.3 + random(rng) * 0.3 };
  for (const g of Object.keys(culture.genres).sort()) {
    const genre = culture.genres[g];
    const info = CULTURE.genres[g];
    const fading = info.until && year >= info.until ? -0.04 : 0;
    genre.hype = clamp(genre.hype + (random(rng) - 0.5) * 0.12 + fading, 0.1, 1);
  }
  // Gênero que acabou some da cena quando não sobra ninguém tocando.
  const playing = new Set(culture.artists.map((a) => a.genre));
  for (const g of Object.keys(culture.genres)) {
    const until = CULTURE.genres[g].until;
    if (until && year >= until && !playing.has(g)) delete culture.genres[g];
  }

  const tick = state.time.tick;
  for (const a of culture.artists) {
    const veteran = year - a.debut > CULTURE.veteranYears ? -0.06 : 0;
    a.trend = clamp(a.trend * 0.85 + (random(rng) - 0.5) * 0.35 + veteran, -1, 1);
    // Em turnê (sem show na cidade há meses), a fama anda menos e com mais sorte.
    const since = a.lastCityShow ?? a.since ?? 0;
    if (tick - since > CULTURE.touringMonths * TICKS_PER_MONTH) a.touring = true;
    else delete a.touring;
    const luck = a.touring ? (random(rng) - 0.5) * 0.03 : 0;
    a.fame = clamp(a.fame + a.trend * 0.04 * speed * (a.touring ? 0.6 : 1) + luck);
    a.low = a.fame < 0.03 ? a.low + 1 : 0;
  }
  localArtists(state, rt);
  culture.artists = culture.artists.filter((a) => a.low < CULTURE.retireMonths && year - a.born < 85);

  if (calendar(state.time.tick).month === 1) {
    const people = state.citizens.length;
    const count = Math.min(CULTURE.newMax, CULTURE.newBase + Math.floor(people / CULTURE.newPerPeople));
    for (let i = 0; i < count; i++) {
      const kind = random(rng) < 0.8 ? 'musica' : 'teatro';
      const genres = activeGenres(year, kind);
      if (!genres.length) continue;
      addArtist(culture, rng, { kind, genre: pick(rng, genres), debut: year, fame: 0.02 + random(rng) * 0.12 });
    }
    // Talentos da cidade: um por ano numa cidade de 500+ moradores, mais com a economia criativa.
    const local = (people >= 500 ? 1 : 0) + Math.round(mod(rt, 'culture.local', 0));
    for (let i = 0; i < local; i++) cityTalent(state, rt, year);
    // Lista limitada: saem os menos famosos.
    if (culture.artists.length > CULTURE.maxArtists) {
      culture.artists = ranking(culture).slice(0, CULTURE.maxArtists).sort((x, y) => x.id - y.id);
    }
  }

  culture.works = culture.works.filter((w) => tick - w.premiere <= w.run * TICKS_PER_DAY);
  for (const kind of ['filme', 'peca']) {
    for (let i = 0; i < CULTURE.premieres[kind]; i++) addWork(culture, rng, kind, year, tick + randomInt(rng, 0, 29) * TICKS_PER_DAY);
  }
  // Um artista local às vezes vira sucesso (chance pequena, só para dar vida).
  for (const a of culture.artists) if (a.local && chance(rng, 0.02)) a.trend = clamp(a.trend + 0.5, -1, 1);
}
