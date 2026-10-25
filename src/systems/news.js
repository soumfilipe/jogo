// Notícias: a imprensa transforma o que acontece na cidade em notícias, que
// são também os avisos para o jogador (ver NEWS no catálogo e os textos em
// world/stories.js).
//
// Os veículos são empresas (setor de mídia, ver SECTORS): abrem num andar
// comercial vago conforme a cidade cresce (wantedMedia), cada tipo depois da
// tecnologia dele: jornal desde o começo, rádio, TV, portal de notícias e, com
// o smartphone, as redes sociais. Quem trabalha neles são os jornalistas, que
// assinam as matérias. Sem imprensa local, a imprensa regional dá só as
// notícias importantes; fofoca, crítica ao governo e boato precisam de
// veículos da cidade.
//
// O que vira notícia:
//   - problemas da cidade (energia, água, desemprego, crime, saúde, trânsito,
//     lixo, esgoto, abandono, creche, satisfação), quando passam do limite, e
//     de novo quando acabam; enquanto duram, voltam como crítica ao governo;
//   - acontecimentos: incêndios, empresas que fecham, veículos que abrem e
//     fecham, epidemias, carnaval, megaevento, o jogo de domingo, marcos de
//     população, contas do mês, a cena cultural;
//   - tecnologias que a cidade conclui e as que o mundo descobre;
//   - rotina: fofocas, curiosidades, críticas pela origem da insatisfação
//     (rt.complaints, ver wellbeing.js) e boatos, que a checagem desmente
//     alguns dias depois.
//
// Estado (state.news, salvo): { items (as últimas NEWS.maxItems, da mais
// velha à mais nova), nextId, rng (próprio: as notícias não mudam a
// simulação), pending (acontecimentos do dia, ver report), next (quando cada
// pauta pode voltar), open (problemas noticiados que ainda não acabaram),
// fakes (boatos esperando checagem), recent (pautas de rotina recentes, para
// não repetir), world e techs (até onde já noticiou a
// pesquisa), pop (marcos de população já noticiados), rush (ruas paradas no
// rush das 8h), flags }.
//
// Para a tela, cada notícia publicada também entra em rt.newsFresh.

import { BUILDINGS, CULTURE, ECONOMY, NEWS, SECTORS, SPORTS, TOURISM, ZONE } from '../world/catalog.js';
import { MARCOS, TECHS, TECH_BY_ID, marcoAt } from '../world/techs.js';
import { MEDIA_ARRIVAL, SOLVED, STORIES } from '../world/stories.js';
import { FIRST_NAMES, LAST_NAMES } from '../agents/names.js';
import { createRng, pick, random, randomInt } from '../core/rng.js';
import { TICKS_PER_DAY, calendar } from '../core/time.js';
import { canWork } from '../agents/citizens.js';
import { overloadedParents } from './childcare.js';
import { isCollected } from './waste.js';
import { roadCapacity } from './traffic.js';
import { nowShowing, ranking } from './culture.js';
import { todaysEvents } from './events.js';

export const MEDIUM_IDS = Object.keys(NEWS.media);
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const REGIONS = ['região central', 'zona norte', 'zona sul', 'zona leste', 'zona oeste'];
const SERIOUS = new Set(['jornal', 'radio', 'tv', 'portal']);
const ALERT_PREFIX = { jornal: '', radio: 'No ar: ', tv: 'Plantão: ', portal: 'URGENTE: ', social: '🚨 ' };

/** Notícias de uma cidade nova (ou de um save antigo): nada publicado ainda. */
export function createNews(seed, research) {
  return {
    items: [],
    nextId: 1,
    rng: createRng((seed ^ 0x6e3e5) >>> 0),
    pending: [],
    next: {},
    open: [],
    fakes: [],
    recent: [],
    world: research.world,
    techs: research.done.length,
    pop: 0,
    rush: 0,
    flags: {},
  };
}

/** Acontecimento para as notícias do dia (incêndio, empresa que fechou...). */
export function report(state, event) {
  state.news?.pending.push(event);
}

// ---------------------------------------------------------------------------
// Imprensa da cidade
// ---------------------------------------------------------------------------

/** Tipos de veículo que a cidade já conhece, do mais antigo ao mais novo. */
export function availableMedia(rt) {
  return MEDIUM_IDS.filter((m) => !NEWS.media[m].tech || rt.techDone.has(NEWS.media[m].tech));
}

/** O veículo mais novo que a cidade conhece (a "era" da imprensa). */
export function mediaEra(rt) {
  const list = availableMedia(rt);
  return list[list.length - 1];
}

/** Veículos de imprensa da cidade (empresas do setor de mídia). */
export function outlets(state) {
  return state.companies.filter((co) => SECTORS[co.sector].kind === 'midia');
}

/**
 * Setor de mídia que a cidade quer abrir agora (ou null): primeiro um de cada
 * tipo que a cidade já conhece e tem gente para sustentar (minPop), depois
 * mais um a cada NEWS.peoplePerOutlet moradores, no tipo com menos veículos
 * (empate: o mais novo).
 */
export function wantedMedia(state, rt) {
  const people = state.citizens.length;
  const sectors = availableMedia(rt).map((m) => NEWS.media[m].sector).filter((s) => people >= SECTORS[s].minPop);
  if (sectors.length === 0) return null;
  const have = Object.fromEntries(sectors.map((s) => [s, 0]));
  let total = 0;
  for (const co of state.companies) {
    if (SECTORS[co.sector].kind !== 'midia') continue;
    total++;
    if (co.sector in have) have[co.sector]++;
  }
  const missing = sectors.findLast((s) => have[s] === 0);
  if (missing) return missing;
  if (total >= Math.min(NEWS.maxOutlets, sectors.length + Math.floor(people / NEWS.peoplePerOutlet))) return null;
  let best = null;
  for (const s of sectors) if (best === null || have[s] <= have[best]) best = s;
  return best;
}

// ---------------------------------------------------------------------------
// Ganchos da simulação
// ---------------------------------------------------------------------------

/** Às 8h: parte das ruas com carros que está acima da capacidade. */
export function noteRushHour(state, rt) {
  if (!state.news || !rt.occupied) return;
  const road = state.map.road;
  let busy = 0;
  let jammed = 0;
  for (const t of rt.occupied) {
    if (!road[t]) continue;
    busy++;
    if (rt.occupancy[t] > roadCapacity(rt, road[t])) jammed++;
  }
  state.news.rush = busy >= 30 ? jammed / busy : 0;
}

/** Uma vez por dia (meia-noite): acontecimentos, problemas e rotina. */
export function dailyNews(state, rt) {
  const news = state.news;
  if (!news) return;
  const ctx = context(state, rt);
  const events = news.pending.splice(0);
  for (const e of events) publishEvent(ctx, e);
  calendarNews(ctx);
  epidemicNews(ctx);
  problemNews(ctx);
  populationNews(ctx);
  debunk(ctx);
  routine(ctx);
}

/** Fechamento do mês: pesquisa (da cidade e do mundo), contas e cultura. */
export function monthlyNews(state, rt) {
  const news = state.news;
  if (!news) return;
  const ctx = context(state, rt);
  researchNews(ctx);
  economyNews(ctx);
  cultureNews(ctx);
}

// ---------------------------------------------------------------------------
// Contexto e publicação
// ---------------------------------------------------------------------------

function context(state, rt) {
  const news = state.news;
  const local = outlets(state);
  const era = mediaEra(rt);
  return { state, rt, news, rng: news.rng, local, era, tick: state.time.tick, published: 0 };
}

/** Escolhe o veículo: local (com peso pelo tipo de pauta) ou o regional. */
function chooseOutlet(ctx, { serious = false, localOnly = false, medium = null } = {}) {
  let list = ctx.local;
  if (medium) list = list.filter((co) => SECTORS[co.sector].medium === medium);
  if (serious) {
    const s = list.filter((co) => SERIOUS.has(SECTORS[co.sector].medium));
    if (s.length) list = s;
  }
  if (list.length) {
    const co = pick(ctx.rng, list);
    return { co, name: co.name, medium: SECTORS[co.sector].medium };
  }
  if (localOnly) return null;
  // A imprensa regional fala de longe, pelo meio mais novo que não é rede social.
  const medium2 = ctx.era === 'social' ? 'portal' : ctx.era;
  return { co: null, name: NEWS.regional[ctx.era], medium: medium2 };
}

/** Quem assina: um jornalista do veículo (ou a redação). */
function byline(ctx, outlet) {
  if (!outlet.co) return 'Da redação';
  const ids = [...(ctx.rt.companyWorkers.get(outlet.co.id) ?? [])].sort((a, b) => a - b);
  if (ids.length === 0) return 'Da redação';
  return ctx.rt.citizenById.get(pick(ctx.rng, ids))?.name ?? 'Da redação';
}

const fill = (text, vars) => text.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));

/** Monta manchete e texto (3 ou 4 frases) a partir de uma pauta de STORIES. */
export function compose(rng, story, vars) {
  const headline = fill(pick(rng, story.h), vars);
  const sentences = [];
  story.s.forEach((options, i) => {
    // A quarta frase é opcional: o texto fica com três ou quatro.
    if (i >= 3 && random(rng) < 0.4) return;
    const text = fill(pick(rng, options), vars).trim();
    if (text) sentences.push(text);
  });
  return { headline: capitalize(headline), body: sentences.join(' ') };
}

const capitalize = (s) => (s && /^[a-zà-ú]/.test(s) && !s.startsWith('@') ? s[0].toUpperCase() + s.slice(1) : s);

/** Valores comuns a todas as pautas (pessoas da cidade, região, data...). */
function baseVars(ctx, extra = {}) {
  const { state, rng } = ctx;
  const c = calendar(ctx.tick);
  const [pessoa, idade] = citizen(ctx);
  const [pessoa2, idade2] = citizen(ctx);
  const companies = state.companies.filter((co) => SECTORS[co.sector].kind !== 'midia');
  // Fofoca é com músicos (as companhias de teatro não cortam o cabelo).
  const artists = state.culture ? ranking(state.culture).filter((a) => a.kind === 'musica').slice(0, 12) : [];
  const artist = artists.length ? pick(rng, artists) : null;
  const artist2 = artists.length > 1 ? pick(rng, artists.filter((a) => a !== artist)) : null;
  const W = STORIES.words;
  return {
    cidade: state.city.name,
    regiao: pick(rng, REGIONS),
    pessoa,
    idade,
    pessoa2: pessoa2 === pessoa ? `${pick(rng, FIRST_NAMES)} ${pick(rng, LAST_NAMES)}` : pessoa2,
    idade2,
    empresa: companies.length ? pick(rng, companies).name : `Padaria ${pick(rng, LAST_NAMES)}`,
    artista: artist?.name ?? 'Banda Sem Nome',
    artista2: artist2?.name ?? 'Trio Esquecido',
    genero: artist ? CULTURE.genres[artist.genre].name.toLowerCase() : 'samba',
    ano: c.year,
    mes: MONTHS[c.month - 1],
    pet: pick(rng, W.pets),
    sabor: pick(rng, W.sabores),
    tempo: pick(rng, W.tempo),
    n: String(randomInt(rng, 40, 300)),
    ...extra,
  };
}

/** Um morador de verdade (nome e idade), ou um nome inventado se a cidade está vazia. */
function citizen(ctx) {
  const list = ctx.state.citizens;
  for (let i = 0; i < 4 && list.length; i++) {
    const c = list[Math.floor(random(ctx.rng) * list.length)];
    if (c.age >= 18) return [c.name, String(c.age)];
  }
  return [`${pick(ctx.rng, FIRST_NAMES)} ${pick(ctx.rng, LAST_NAMES)}`, String(randomInt(ctx.rng, 20, 70))];
}

/**
 * Publica uma notícia. `story` é uma pauta de STORIES; `cat` o tipo
 * (alerta, resolvido, cidade, tecnologia, mundo, evento, cultura, economia,
 * imprensa, fofoca, critica, boato, checagem). Devolve a notícia.
 */
function publish(ctx, { cat, story, vars = {}, alert = false, outlet = null, fake = false, tile = null }) {
  const { news, rng } = ctx;
  const out = outlet ?? chooseOutlet(ctx, { serious: alert || cat === 'checagem' });
  if (!out) return null;
  const all = baseVars(ctx, vars);
  if (tile !== null) all.regiao = regionOf(ctx.state, tile);
  const { headline, body } = compose(rng, story, all);
  const item = {
    id: news.nextId++,
    tick: ctx.tick,
    cat,
    outlet: out.name,
    medium: out.medium,
    author: byline(ctx, out),
    headline: alert ? ALERT_PREFIX[out.medium] + headline : headline,
    body,
  };
  if (alert) item.alert = true;
  if (fake) item.fake = true;
  if (out.medium === 'social') {
    // Nas redes, a notícia vem com curtidas (fofoca e boato rendem mais).
    const viral = cat === 'fofoca' || cat === 'boato' ? 4 : 1;
    item.likes = randomInt(rng, 30, 2_500) * viral;
  }
  news.items.push(item);
  if (news.items.length > NEWS.maxItems) news.items.splice(0, news.items.length - NEWS.maxItems);
  (ctx.rt.newsFresh ??= []).push(item);
  ctx.published++;
  return item;
}

/** Região do mapa onde fica um tile (centro, norte, sul, leste, oeste). */
export function regionOf(state, tile) {
  const { width, height } = state.map;
  const dx = (tile % width) / width - 0.5;
  const dy = Math.floor(tile / width) / height - 0.5;
  if (Math.abs(dx) < 0.17 && Math.abs(dy) < 0.17) return REGIONS[0];
  if (Math.abs(dy) >= Math.abs(dx)) return dy < 0 ? REGIONS[1] : REGIONS[2];
  return dx > 0 ? REGIONS[3] : REGIONS[4];
}

const pct = (v) => `${Math.round(v * 100)}%`;
const money = (v) => `$${Math.round(Math.abs(v)).toLocaleString('pt-BR')}`;
const count = (v) => Math.round(v).toLocaleString('pt-BR');
const cooled = (ctx, key) => ctx.tick >= (ctx.news.next[key] ?? 0);
const cool = (ctx, key, days = NEWS.cooldownDays) => { ctx.news.next[key] = ctx.tick + days * TICKS_PER_DAY; };

// ---------------------------------------------------------------------------
// Acontecimentos
// ---------------------------------------------------------------------------

const NUMBERS = ['nenhum', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez'];
// O que pegou fogo, com o artigo certo.
const FIRE_TARGET = {
  casa: 'uma casa', sobrado: 'um sobrado', apartamentos: 'um prédio de apartamentos', condominio: 'um condomínio',
  loja: 'uma loja', mercado: 'um mercado', escritorios: 'um prédio de escritórios', shopping: 'um shopping',
  fabrica: 'uma fábrica', industria: 'uma indústria', complexo: 'um complexo industrial', galpao: 'um galpão logístico',
  sitio: 'um sítio', fazenda: 'uma fazenda', fazenda_mecanizada: 'uma fazenda mecanizada', agroindustria: 'uma agroindústria',
};
// Cada tipo de veículo: [nome, com artigo, frase de quando é o primeiro da cidade].
const OUTLET_KIND = {
  jornal: ['jornal', 'um jornal', 'É o primeiro jornal da história da cidade.'],
  radio: ['rádio', 'uma rádio', 'É a primeira rádio da história da cidade.'],
  tv: ['emissora de TV', 'uma emissora de TV', 'É a primeira emissora de TV da cidade.'],
  portal: ['portal de notícias', 'um portal de notícias', 'É o primeiro portal de notícias da cidade.'],
  social: ['canal digital', 'um canal de notícias nas redes sociais', 'É o primeiro canal de notícias da cidade nas redes sociais.'],
};

function publishEvent(ctx, e) {
  if (e.kind === 'evento_resultado') {
    const story = e.success ? STORIES.evento_sucesso : e.flop ? STORIES.evento_fracasso : STORIES.evento_morno;
    publish(ctx, {
      cat: 'evento',
      tile: e.tile,
      story,
      vars: {
        evento: e.name,
        publico: count(e.attendance),
        lotacao: `${Math.round((e.attendance / Math.max(1, e.capacity)) * 100)}%`,
        atracoes: lineupText(ctx, e.artists),
      },
    });
    return;
  }
  if (e.kind === 'festival_anuncio') {
    publish(ctx, {
      cat: 'cultura',
      story: STORIES.festival_anuncio,
      vars: { evento: e.name, dias: Math.max(1, e.day - Math.floor(ctx.tick / TICKS_PER_DAY)), atracoes: lineupText(ctx, e.artists) },
    });
    return;
  }
  if (e.kind === 'artista_saiu') {
    publish(ctx, { cat: 'cultura', story: STORIES.artista_saiu, vars: { artista: e.name, genero: CULTURE.genres[e.genre]?.name ?? 'música' } });
    return;
  }
  if (e.kind === 'jogo') {
    const [mine, theirs] = e.score;
    const story = mine > theirs ? STORIES.jogo_vitoria : mine < theirs ? STORIES.jogo_derrota : STORIES.jogo_empate;
    publish(ctx, {
      cat: 'esporte',
      tile: e.home ? e.tile : null,
      story,
      vars: {
        clube: e.club,
        adversario: e.rival,
        modalidade: SPORTS.kinds[e.sport].name,
        placar: e.sport === 'volei' ? `${mine} sets a ${theirs}` : `${mine} a ${theirs}`,
        onde: e.home ? 'em casa' : 'fora de casa',
        torcida: e.home
          ? `${count(e.attendance ?? 0)} torcedores foram ao jogo.`
          : 'O time jogou longe de casa, diante da torcida adversária.',
      },
    });
    return;
  }
  if (e.kind === 'corrida') {
    const time = e.minutes.toLocaleString('pt-BR');
    publish(ctx, {
      cat: 'esporte',
      tile: e.tile,
      story: STORIES.corrida,
      vars: {
        corrida: e.name, corredores: count(e.runners), km: e.km.toLocaleString('pt-BR'), vencedor: e.winner, ruas: count(e.streets),
        resultado: e.local ? `${e.winner}, atleta da cidade, venceu em ${time} minutos.` : `${e.winner}, de ${e.from}, venceu em ${time} minutos.`,
      },
    });
    return;
  }
  if (e.kind === 'medalha') {
    const medal = ['ouro', 'prata', 'bronze'][e.position - 1];
    publish(ctx, {
      cat: 'esporte',
      tile: e.tile,
      story: STORIES.medalha,
      vars: {
        atleta: e.name, clube: e.club, prova: e.event, posicao: e.position, etapa: e.round, sede: e.host,
        modalidade: SPORTS.kinds[e.sport].name.toLowerCase(), medalha: medal, a_medalha: `a medalha de ${medal}`,
      },
    });
    return;
  }
  if (e.kind === 'escolinha') {
    publish(ctx, { cat: 'esporte', story: STORIES.escolinha, vars: { clube: e.club, categoria: e.category, modalidade: SPORTS.kinds[e.sport].name.toLowerCase() } });
    return;
  }
  if (e.kind === 'revelacao') {
    publish(ctx, { cat: 'esporte', story: STORIES.revelacao, vars: { clube: e.club, atleta: e.name, idade: e.age } });
    return;
  }
  if (e.kind === 'proposta' || e.kind === 'venda' || e.kind === 'proposta_recusada') {
    const people = e.people ?? 1;
    publish(ctx, {
      cat: 'esporte',
      alert: e.kind === 'proposta',
      story: STORIES[e.kind],
      vars: {
        clube: e.club, atleta: e.name, comprador: e.buyer, valor: `$${count(e.value)}`,
        familia: people > 1 ? `A família vai junto: ${count(people)} pessoas deixam a cidade.` : 'Ele se muda sozinho para a nova cidade.',
      },
    });
    return;
  }
  if (e.kind === 'clube_fundado') {
    publish(ctx, { cat: 'esporte', tile: e.tile, story: STORIES.clube_fundado, vars: { clube: e.name, modalidade: SPORTS.kinds[e.sport].name.toLowerCase() } });
    return;
  }
  if (e.kind === 'temporada') {
    const story = e.champion ? STORIES.temporada_titulo : e.promoted ? STORIES.temporada_acesso
      : e.relegated ? STORIES.temporada_rebaixamento : STORIES.temporada_fim;
    publish(ctx, {
      cat: 'esporte',
      alert: e.champion || e.promoted,
      story,
      vars: {
        clube: e.club,
        modalidade: SPORTS.kinds[e.sport].name.toLowerCase(),
        divisao: e.division.toLowerCase(),
        posicao: e.position,
        destaque: e.star ? `${e.star} foi o destaque da campanha.` : 'O elenco inteiro foi decisivo.',
        proxima: e.promoted || e.relegated
          ? `Na próxima temporada, o time disputa o campeonato ${e.next.toLowerCase()}.`
          : 'O time defende o título na próxima temporada.',
      },
    });
    return;
  }
  if (e.kind === 'serie_confirmar') {
    publish(ctx, { cat: 'evento', alert: true, story: STORIES.serie_confirmar, vars: { evento: e.name, dias: e.days } });
    return;
  }
  if (e.kind === 'incendio') {
    const alvo = e.count > 1 ? `${NUMBERS[e.count] ?? e.count} prédios` : (FIRE_TARGET[e.type] ?? 'um prédio');
    const covered = e.covered;
    publish(ctx, {
      cat: 'alerta',
      alert: true,
      tile: e.tile,
      story: STORIES.incendio,
      vars: {
        alvo,
        feridos: e.people > 0
          ? `${count(e.people)} ${e.people === 1 ? 'pessoa ficou' : 'pessoas ficaram'} sem casa ou sem trabalho por causa do fogo.`
          : 'Não havia ninguém no local, e ninguém se feriu.',
        bombeiros: covered
          ? 'Os bombeiros chegaram, mas não conseguiram salvar o prédio.'
          : 'Não há quartel de bombeiros perto dali, e o fogo só parou quando não havia mais o que queimar.',
      },
    });
  } else if (e.kind === 'fechou') {
    if (SECTORS[e.sector]?.kind === 'midia') {
      publish(ctx, { cat: 'imprensa', story: STORIES.veiculo_fim, vars: { veiculo: e.name } });
    } else {
      publish(ctx, {
        cat: 'cidade',
        alert: e.jobs >= 20,
        story: STORIES.fechou,
        vars: { empresa: e.name, setor: (SECTORS[e.sector]?.name ?? 'comércio').toLowerCase() },
      });
    }
  } else if (e.kind === 'veiculo') {
    const co = ctx.rt.companyById.get(e.company);
    if (!co) return;
    const medium = SECTORS[co.sector].medium;
    const first = ctx.local.filter((x) => SECTORS[x.sector].medium === medium).length <= 1;
    const b = ctx.rt.buildingById.get(co.building);
    publish(ctx, {
      cat: 'imprensa',
      outlet: { co, name: co.name, medium },
      tile: b?.tile ?? null,
      story: STORIES.veiculo,
      vars: {
        veiculo: co.name,
        tipo: first ? 'primeiro veículo de imprensa' : 'novo veículo de imprensa',
        um_tipo: OUTLET_KIND[medium][1],
        marco: first ? OUTLET_KIND[medium][2] : 'A concorrência na imprensa local fica mais acirrada.',
      },
    });
  }
}

/** "Nas atrações, X, Y e Z." (ou vazio, sem artistas). */
function lineupText(ctx, ids = []) {
  const names = ids.map((id) => ctx.state.culture?.artists.find((a) => a.id === id)?.name).filter(Boolean);
  if (!names.length) return '';
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}` : names[0];
  return names.length > 1 ? `No palco, ${list}.` : `A atração foi ${list}.`;
}

function calendarNews(ctx) {
  const { state, rt } = ctx;
  const c = calendar(ctx.tick);
  const ev = todaysEvents(state, rt);
  if (ev.carnaval && c.day === TOURISM.carnaval.days[0]) publish(ctx, { cat: 'evento', alert: true, story: STORIES.carnaval });
  if (ev.mega && c.day === 1) publish(ctx, { cat: 'evento', alert: true, story: STORIES.mega });
  // Segunda-feira: o resultado do jogo de domingo, se a cidade tem campo ou estádio.
  // (Com clube de futebol, as notícias são dos jogos de verdade; ver sports.js.)
  if (c.weekday === 0 && ctx.tick > TICKS_PER_DAY && random(ctx.rng) < 0.5
    && !state.sports?.clubs.some((x) => x.sport === 'futebol' && !x.closed)
    && state.buildings.some((b) => b.type === 'estadio' || b.type === 'campo_futebol')) {
    footballNews(ctx);
  }
}

function footballNews(ctx) {
  const { rng, state } = ctx;
  const W = STORIES.words;
  const home = randomInt(rng, 0, 4);
  const away = randomInt(rng, 0, 3);
  const team = `${W.times[state.seed % W.times.length]} ${state.city.name}`;
  const resultado = home > away ? 'venceu' : home < away ? 'perdeu para' : 'empatou com';
  const resultadoH = home > away ? 'vence' : home < away ? 'perde para' : 'empata com';
  const rival = pick(rng, W.rivais);
  publish(ctx, {
    cat: 'evento',
    story: STORIES.futebol,
    vars: {
      time: team,
      resultado,
      resultado_h: resultadoH,
      adversario: rival,
      rival_curto: `x ${rival.replace(/^o /, '')}`,
      placar: `${home} a ${away}`,
      lance: pick(rng, W.lances),
    },
  });
}

function epidemicNews(ctx) {
  const { state, news } = ctx;
  const now = (state.health?.epidemicUntil ?? 0) > ctx.tick;
  if (now && !news.flags.epidemic) {
    news.flags.epidemic = true;
    publish(ctx, { cat: 'alerta', alert: true, story: STORIES.epidemia });
  } else if (!now && news.flags.epidemic) {
    delete news.flags.epidemic;
    solved(ctx, 'epidemia');
  }
}

function populationNews(ctx) {
  const people = ctx.state.citizens.length;
  const marks = NEWS.milestones;
  let reached = ctx.news.pop;
  while (reached < marks.length && people >= marks[reached]) reached++;
  if (reached === ctx.news.pop) return;
  ctx.news.pop = reached;
  publish(ctx, { cat: 'cidade', alert: true, story: STORIES.populacao, vars: { n: count(marks[reached - 1]) } });
}

// ---------------------------------------------------------------------------
// Problemas da cidade
// ---------------------------------------------------------------------------

/** Situação de cada problema agora: { chave: { value, active, vars } }. */
export function cityProblems(state, rt) {
  const P = NEWS.problems;
  const people = state.citizens.length;
  const out = {};
  const put = (key, value, active, vars = {}) => { out[key] = { value, active, vars }; };

  let total = 0;
  let noPower = 0;
  let noWater = 0;
  let abandoned = 0;
  let dirty = 0;
  for (const b of state.buildings) {
    const info = BUILDINGS[b.type];
    if (!info.zone || info.zone === ZONE.NONE) continue;
    total++;
    if (b.abandoned !== undefined) {
      abandoned++;
      continue;
    }
    if (rt.waste && !isCollected(rt.waste, b)) dirty++;
    if (info.zone === ZONE.RURAL) continue;
    const s = rt.service?.get(b.id);
    if (s && !s.power) noPower++;
    if (s && !s.water) noWater++;
  }
  const share = (n) => (total ? n / total : 0);
  if (total >= 10) {
    put('energia', share(noPower), share(noPower) > P.energia, { n: count(noPower), pct: pct(share(noPower)) });
    put('agua', share(noWater), share(noWater) > P.agua, { n: count(noWater), pct: pct(share(noWater)) });
    put('abandono', share(abandoned), share(abandoned) > P.abandono, { n: count(abandoned) });
    put('lixo', share(dirty), share(dirty) > P.lixo, { n: count(dirty) });
  }

  if (people >= 50) {
    let able = 0;
    let jobless = 0;
    for (const c of state.citizens) {
      if (!canWork(c)) continue;
      able++;
      if (c.job === null) jobless++;
    }
    const rate = able ? jobless / able : 0;
    put('desemprego', rate, rate > P.desemprego, { n: count(jobless), pct: pct(rate) });
  }

  const city = rt.cityWellbeing;
  if (city && people >= 100) {
    put('crime', city.crime, city.crime > P.crime, { pct: pct(city.crime) });
    put('saude', 1 - city.health, city.health < P.saude, { pct: pct(city.health) });
    put('satisfacao', 1 - city.satisfaction, city.satisfaction < P.satisfacao, { pct: pct(city.satisfaction), queixa: STORIES.queixas[topComplaint(rt)?.[0]] ?? 'o custo de vida' });
  }
  if (people >= 300) put('transito', state.news?.rush ?? 0, (state.news?.rush ?? 0) > P.transito, { pct: pct(state.news?.rush ?? 0) });
  if (people >= 1_000 && rt.sanitation) {
    const untreated = 1 - rt.sanitation.treated;
    put('esgoto', untreated, untreated > P.esgoto, { pct: pct(untreated) });
  }
  if (people >= 200) {
    const workers = state.citizens.reduce((n, c) => n + (c.job !== null ? 1 : 0), 0);
    let parents = 0;
    for (const level of overloadedParents(state, rt).values()) if (level >= 1) parents++;
    const rate = workers ? parents / workers : 0;
    put('creche', rate, rate > P.creche, { n: count(parents) });
  }
  return out;
}

/** A maior fonte de insatisfação: [chave, perda média de satisfação] ou null. */
export function topComplaint(rt) {
  const c = rt.complaints;
  if (!c) return null;
  let best = null;
  for (const [k, v] of Object.entries(c)) if (!best || v > best[1]) best = [k, v];
  return best && best[1] >= NEWS.complaintMin ? best : null;
}

function problemNews(ctx) {
  const { news, state, rt } = ctx;
  const all = cityProblems(state, rt);
  let budget = 2; // no máximo duas notícias de problema por dia
  for (const [key, p] of Object.entries(all)) {
    const open = news.open.includes(key);
    // Para acabar, o problema tem que cair bem abaixo do limite (sem ficar indo e voltando).
    const limit = NEWS.problems[key];
    const over = key === 'saude' || key === 'satisfacao' ? 1 - limit : limit;
    if (open && p.value < over * 0.8) {
      news.open.splice(news.open.indexOf(key), 1);
      solved(ctx, key);
      continue;
    }
    if (!p.active || budget <= 0 || !cooled(ctx, key)) continue;
    budget--;
    cool(ctx, key);
    if (!open) {
      news.open.push(key);
      publish(ctx, { cat: 'alerta', alert: true, story: STORIES[key], vars: p.vars });
    } else {
      // O problema continua: agora é a imprensa local cobrando o governo.
      // Sem imprensa local, a regional só repete o alerta.
      const story = STORIES.critica[CRITIQUE[key] ?? key] ?? STORIES[key];
      const local = chooseOutlet(ctx, { localOnly: true });
      if (local) publish(ctx, { cat: 'critica', story, vars: p.vars, outlet: local });
      else publish(ctx, { cat: 'alerta', alert: true, story: STORIES[key], vars: p.vars });
    }
  }
  // Fora da lista acima (só chega aqui se algum problema sumiu da medição).
  news.open = news.open.filter((k) => k in all || k === 'deficit' || k === 'divida');
}

// Problema -> crítica com o mesmo assunto (as outras têm o nome do problema).
const CRITIQUE = { saude: 'health', desemprego: 'unemployment', lixo: 'garbage', creche: 'stress' };

function solved(ctx, key) {
  const [titulo, o_que] = SOLVED[key] ?? ['Problema resolvido', 'A situação voltou ao normal.'];
  const vars = { cidade: ctx.state.city.name };
  publish(ctx, { cat: 'resolvido', story: STORIES.resolvido, vars: { titulo: fill(titulo, vars), o_que: fill(o_que, vars) } });
}

// ---------------------------------------------------------------------------
// Pesquisa, contas e cultura (mensal)
// ---------------------------------------------------------------------------

const MEDIA_BY_TECH = Object.fromEntries(MEDIUM_IDS.filter((m) => NEWS.media[m].tech).map((m) => [NEWS.media[m].tech, m]));

function researchNews(ctx) {
  const { state, news } = ctx;
  const research = state.research;
  // O que a cidade concluiu desde a última vez.
  const done = research.done.slice(news.techs);
  news.techs = research.done.length;
  for (const id of done) {
    const tech = TECH_BY_ID.get(id);
    if (!tech) continue;
    publish(ctx, {
      cat: 'tecnologia',
      alert: true,
      story: STORIES.tech_cidade,
      vars: { tech: tech.name, desc: tech.desc, efeito: lowerFirst(tech.mechanic) },
    });
    // Rádio, TV, internet e smartphone mudam a própria imprensa.
    const medium = MEDIA_BY_TECH[id];
    if (medium) {
      const [titulo, ...texts] = MEDIA_ARRIVAL[medium];
      const vars = { cidade: state.city.name };
      publish(ctx, {
        cat: 'imprensa',
        alert: true,
        story: STORIES.midia,
        vars: { titulo: fill(titulo, vars), texto: fill(texts[0], vars), texto2: fill(texts[1], vars), texto3: fill(texts[2], vars) },
      });
    }
  }

  // O que o mundo descobriu desde o último mês (e a era nova, se mudou).
  const before = news.world;
  const now = research.world;
  news.world = now;
  if (before === undefined || before === null || now <= before) return;
  if (marcoAt(now).id !== marcoAt(before).id) {
    publish(ctx, { cat: 'mundo', alert: true, story: STORIES.marco, vars: { marco: marcoAt(now).name } });
  }
  const found = TECHS.filter((t) => t.order > before && t.order <= now && !research.done.includes(t.id));
  for (const tech of found) {
    const reachable = tech.ready && tech.requires.every((r) => research.done.includes(r));
    const aqui = reachable
      ? `Em ${state.city.name}, a novidade já pode ser pesquisada e ficou mais barata agora que o mundo a conhece.`
      : `Ainda vai levar um tempo para a novidade chegar a ${state.city.name}.`;
    publish(ctx, { cat: 'mundo', story: STORIES.tech_mundo, vars: { tech: tech.name, nota: tech.note || tech.desc, aqui } });
  }
}

const lowerFirst = (s) => (s ? s[0].toLowerCase() + s.slice(1) : s);

function economyNews(ctx) {
  const { state, news } = ctx;
  const last = state.economy.lastMonth;
  if (!last || state.citizens.length < 30) return;
  const cash = state.economy.money;
  if (cash < 0) {
    if (cooled(ctx, 'divida')) {
      cool(ctx, 'divida', 60);
      // Metade das vezes, a imprensa local já sai cobrando o governo.
      const local = random(ctx.rng) < 0.5 ? chooseOutlet(ctx, { localOnly: true }) : null;
      if (local) publish(ctx, { cat: 'critica', outlet: local, story: STORIES.critica.divida });
      else publish(ctx, { cat: 'alerta', alert: true, story: STORIES.divida, vars: { valor: money(cash) } });
    }
  } else if (last.net < 0) {
    if (cooled(ctx, 'deficit')) {
      cool(ctx, 'deficit', 90);
      publish(ctx, { cat: 'economia', alert: true, story: STORIES.deficit, vars: { valor: money(last.net), caixa: money(cash) } });
    }
  } else if (last.net > 0 && random(ctx.rng) < 0.12) {
    publish(ctx, { cat: 'economia', story: STORIES.superavit, vars: { valor: money(last.net), caixa: money(cash) } });
  }
  // Imposto residencial bem acima do padrão vira crítica (fora a perda na satisfação).
  if (state.economy.taxes.residential >= ECONOMY.taxDefault + 4 && cooled(ctx, 'imposto') && random(ctx.rng) < 0.5) {
    const local = chooseOutlet(ctx, { localOnly: true });
    if (local) {
      cool(ctx, 'imposto', 60);
      publish(ctx, { cat: 'critica', outlet: local, story: STORIES.critica.tax, vars: { imposto: `${state.economy.taxes.residential}%` } });
    }
  }
}

function cultureNews(ctx) {
  const { state, news, rng } = ctx;
  const culture = state.culture;
  if (!culture || state.citizens.length < 50) return;
  const top = ranking(culture).find((a) => a.kind === 'musica');
  if (top && top.id !== news.flags.topArtist) {
    news.flags.topArtist = top.id;
    publish(ctx, {
      cat: 'cultura',
      story: STORIES.cultura,
      vars: { artista: top.name, genero: CULTURE.genres[top.genre].name.toLowerCase() },
    });
  }
  // Uma estreia de destaque por mês (às vezes), se a cidade tem cinema ou teatro.
  if (random(rng) < 0.5 && state.buildings.some((b) => b.type === 'cinema' || b.type === 'teatro')) {
    const next = culture.works.filter((w) => w.premiere >= ctx.tick - 30 * TICKS_PER_DAY).sort((a, b) => b.quality - a.quality || a.id - b.id)[0]
      ?? nowShowing(culture, 'filme', ctx.tick)[0];
    if (next) {
      const W = STORIES.words;
      publish(ctx, {
        cat: 'cultura',
        story: STORIES.estreia,
        vars: { obra: next.title, tipo_obra: next.kind === 'filme' ? 'filme' : 'peça', genero_obra: next.genre.toLowerCase(), opiniao: pick(rng, W.opinioes) },
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Rotina: fofocas, curiosidades, críticas e boatos
// ---------------------------------------------------------------------------

function routine(ctx) {
  const { rng, local } = ctx;
  if (local.length === 0) return;
  const D = NEWS.daily;
  const rate = Math.min(D.max, D.base + D.perOutlet * local.length);
  let n = Math.floor(rate) + (random(rng) < rate % 1 ? 1 : 0);
  while (n-- > 0) {
    const outlet = chooseOutlet(ctx, { localOnly: true });
    const cat = weighted(rng, NEWS.mix[outlet.medium]);
    if (cat === 'fofoca') gossip(ctx, outlet);
    else if (cat === 'critica') criticism(ctx, outlet);
    else if (cat === 'boato') fakeNews(ctx, outlet);
    else publish(ctx, { cat: 'cidade', outlet, story: pickStory(ctx, 'cidade', STORIES.cidade) });
  }
}

/** Sorteia uma pauta da lista evitando as usadas há pouco (news.recent). */
function pickStory(ctx, group, list) {
  const recent = (ctx.news.recent ??= []);
  const fresh = list.map((_, i) => i).filter((i) => !recent.includes(`${group}:${i}`));
  const i = fresh.length ? pick(ctx.rng, fresh) : Math.floor(random(ctx.rng) * list.length);
  recent.push(`${group}:${i}`);
  if (recent.length > 16) recent.shift();
  return list[i];
}

function weighted(rng, weights) {
  const entries = Object.entries(weights);
  let roll = random(rng) * entries.reduce((s, [, w]) => s + w, 0);
  for (const [k, w] of entries) {
    roll -= w;
    if (roll < 0) return k;
  }
  return entries[entries.length - 1][0];
}

function gossip(ctx, outlet) {
  const social = outlet.medium === 'social' || (ctx.era === 'social' && random(ctx.rng) < 0.3);
  const story = social && random(ctx.rng) < 0.5
    ? pickStory(ctx, 'fofocaSocial', STORIES.fofocaSocial)
    : pickStory(ctx, 'fofoca', STORIES.fofoca);
  publish(ctx, { cat: 'fofoca', outlet, story, vars: { n: String(randomInt(ctx.rng, 12, 480)) } });
}

/** Crítica ao governo pela maior fonte de insatisfação (ou um problema aberto). */
function criticism(ctx, outlet) {
  const { rng, rt, news } = ctx;
  const top = topComplaint(rt);
  const options = [];
  if (top) options.push(top[0]);
  for (const k of news.open) if (STORIES.critica[CRITIQUE[k] ?? k]) options.push(CRITIQUE[k] ?? k);
  if (options.length === 0) {
    publish(ctx, { cat: 'cidade', outlet, story: pickStory(ctx, 'cidade', STORIES.cidade) });
    return;
  }
  const key = pick(rng, options);
  if (!cooled(ctx, `critica.${key}`)) {
    gossip(ctx, outlet);
    return;
  }
  cool(ctx, `critica.${key}`, 20);
  publish(ctx, {
    cat: 'critica',
    outlet,
    story: STORIES.critica[key],
    vars: { imposto: `${ctx.state.economy.taxes.residential}%`, queixa: STORIES.queixas[top?.[0]] ?? 'o custo de vida' },
  });
}

/** Boato: inventado, ou exagerando um problema que existe de verdade. */
function fakeNews(ctx, outlet) {
  const { rng, news } = ctx;
  if (news.fakes.length >= NEWS.maxPendingFakes) return;
  const real = news.open.filter((k) => STORIES.boatoProblema[k]);
  if (news.flags.epidemic) real.push('epidemia');
  const story = real.length && random(rng) < 0.5 ? STORIES.boatoProblema[pick(rng, real)] : pickStory(ctx, 'boato', STORIES.boato);
  const vars = baseVars(ctx);
  const item = publish(ctx, { cat: 'boato', outlet, story, vars, fake: true });
  if (!item) return;
  const [lo, hi] = NEWS.debunkDays;
  news.fakes.push({ id: item.id, at: ctx.tick + randomInt(rng, lo, hi) * TICKS_PER_DAY, claim: fill(story.claim, vars) });
}

/** A checagem desmente os boatos que já passaram do prazo. */
function debunk(ctx) {
  const { news } = ctx;
  const due = news.fakes.filter((f) => f.at <= ctx.tick);
  if (!due.length) return;
  news.fakes = news.fakes.filter((f) => f.at > ctx.tick);
  for (const f of due) {
    const original = news.items.find((x) => x.id === f.id);
    if (original) original.debunked = ctx.tick;
    publish(ctx, { cat: 'checagem', story: STORIES.checagem, vars: { claim: f.claim } });
  }
}
