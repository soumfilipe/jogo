import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NEWS, SECTORS } from '../src/world/catalog.js';
import { STORIES } from '../src/world/stories.js';
import { TECHS } from '../src/world/techs.js';
import { createWorld } from '../src/world/world.js';
import { advance, prepare } from '../src/systems/simulation.js';
import { completeTech } from '../src/systems/research.js';
import { createRng } from '../src/core/rng.js';
import { TICKS_PER_DAY, TICKS_PER_MONTH } from '../src/core/time.js';
import {
  cityProblems, compose, createNews, dailyNews, mediaEra, monthlyNews, outlets, regionOf, report, topComplaint, wantedMedia,
} from '../src/systems/news.js';
import { checksum, createSave, readSave } from '../src/save/format.js';
import { testCity } from './helpers.js';

// Uma cidade de teste que já cresceu um pouco (e a imprensa com ela).
function grownCity(months = 2, seed = 1234) {
  const { state, rt } = testCity({ seed });
  advance(state, rt, months * TICKS_PER_MONTH);
  return { state, rt };
}

// Avança até a próxima meia-noite (as notícias do dia saem nela).
const toMidnight = (state, rt) => advance(state, rt, TICKS_PER_DAY - (state.time.tick % TICKS_PER_DAY));

test('textos: toda pauta vira manchete e 3 ou 4 frases, sem chave sobrando', () => {
  // Chaves que são frases inteiras (descrição da tecnologia, nota histórica...).
  const SENTENCES = new Set(['o_que', 'texto', 'texto2', 'texto3', 'desc', 'nota', 'aqui', 'feridos', 'bombeiros', 'marco', 'lance']);
  const vars = new Proxy({}, { get: (_, k) => (typeof k !== 'string' ? undefined : SENTENCES.has(k) ? `Frase ${k}.` : `<${k}>`) });
  const rng = createRng(5);
  const stories = [];
  const collect = (node) => {
    if (Array.isArray(node)) node.forEach(collect);
    else if (node && typeof node === 'object') {
      if (node.h && node.s) stories.push(node);
      else Object.values(node).forEach(collect);
    }
  };
  collect(STORIES);
  assert.ok(stories.length > 60, `pautas: ${stories.length}`);
  for (const story of stories) {
    for (let i = 0; i < 6; i++) {
      const { headline, body } = compose(rng, story, vars);
      assert.ok(headline.length > 3, headline);
      assert.ok(!/\{|\}/.test(headline + body), `${headline} / ${body}`);
      const sentences = body.split(/(?<=[.!?"])\s+(?=[A-ZÀ-Ú"<@])/).length;
      assert.ok(sentences >= 3 && sentences <= 5, `${sentences} frases: ${body}`);
    }
  }
  // Toda fonte de insatisfação e todo problema têm crítica e nome.
  for (const k of Object.keys(STORIES.queixas)) assert.ok(STORIES.critica[k], `crítica de ${k}`);
  for (const k of Object.keys(NEWS.problems)) assert.ok(STORIES[k], `notícia de ${k}`);
  for (const s of STORIES.boato) assert.ok(s.claim, 'boato sem o que a checagem desmente');
});

test('cidade nova: sem notícias, sem imprensa local, na era do jornal', () => {
  const state = createWorld({ width: 32, height: 32, seed: 3 });
  const rt = prepare(state);
  assert.equal(state.news.items.length, 0);
  assert.equal(state.news.techs, state.research.done.length, 'as tecnologias iniciais não viram notícia');
  assert.equal(mediaEra(rt), 'jornal');
  assert.equal(wantedMedia(state, rt), null, 'sem moradores, ninguém abre jornal');
  // Começando no último marco, a cidade já conhece as redes sociais.
  const late = createWorld({ width: 32, height: 32, seed: 3, startMarco: 6 });
  assert.equal(mediaEra(prepare(late)), 'social');
});

test('imprensa: jornal abre com a cidade crescendo, com jornalistas; rádio só depois da tecnologia', () => {
  const { state, rt } = grownCity(2);
  assert.ok(state.citizens.length >= SECTORS.jornal.minPop, `população ${state.citizens.length}`);
  const papers = outlets(state);
  assert.ok(papers.length >= 1, 'a cidade tem jornal');
  assert.ok(papers.every((co) => SECTORS[co.sector].medium === 'jornal'), 'sem rádio antes da tecnologia');
  const staff = papers.reduce((n, co) => n + rt.companyWorkers.get(co.id).size, 0);
  assert.ok(staff > 0, 'há jornalistas trabalhando');
  // A abertura do jornal vira notícia, e as matérias são assinadas por quem trabalha lá.
  assert.ok(state.news.items.some((i) => i.cat === 'imprensa' && papers.some((co) => co.name === i.outlet)));
  const names = new Set(papers.flatMap((co) => [...rt.companyWorkers.get(co.id)].map((id) => rt.citizenById.get(id).name)));
  const signed = state.news.items.filter((i) => papers.some((co) => co.name === i.outlet) && i.author !== 'Da redação');
  assert.ok(signed.length > 0 && signed.every((i) => names.has(i.author) || state.citizens.some((c) => c.name === i.author)));

  completeTech(state, rt, 'radio');
  assert.equal(mediaEra(rt), 'radio');
  if (state.citizens.length >= SECTORS.radio.minPop) assert.equal(wantedMedia(state, rt), 'radio');
  advance(state, rt, TICKS_PER_MONTH);
  // A chegada do rádio é notícia (no fechamento do mês).
  assert.ok(state.news.items.some((i) => i.cat === 'imprensa' && /rádio/i.test(i.headline)));
});

test('acontecimentos: incêndio vira alerta com a região; empresa que fecha também', () => {
  const { state, rt } = grownCity(1);
  const b = state.buildings.find((x) => x.type === 'casa') ?? state.buildings.find((x) => !x.abandoned);
  report(state, { kind: 'incendio', count: 1, tile: b.tile, type: 'casa', people: 4, covered: false });
  report(state, { kind: 'fechou', name: 'Padaria Teste', sector: 'padaria', jobs: 5 });
  const before = state.news.items.length;
  toMidnight(state, rt);
  const fresh = state.news.items.slice(before);
  const fire = fresh.find((i) => i.cat === 'alerta' && /uma casa/.test(i.headline + i.body));
  assert.ok(fire, 'notícia do incêndio');
  assert.ok(fire.alert);
  assert.ok(fire.body.includes(regionOf(state, b.tile)) || fire.headline.includes(regionOf(state, b.tile)));
  assert.ok(fresh.some((i) => i.body.includes('Padaria Teste') || i.headline.includes('Padaria Teste')));
  assert.equal(state.news.pending.length, 0);
});

test('problemas: falta de energia vira alerta e, quando acaba, notícia de solução', () => {
  const { state, rt } = grownCity(1);
  // Corta a energia de toda a cidade.
  state.utilities.imported.power = false;
  advance(state, rt, 60);
  assert.ok(cityProblems(state, rt).energia.active);
  toMidnight(state, rt);
  const alert = state.news.items.find((i) => i.cat === 'alerta' && /energia|luz|escuras/i.test(i.headline + i.body));
  assert.ok(alert, 'alerta de energia');
  assert.ok(state.news.open.includes('energia'));
  // Críticas, fofocas e boatos só saem na imprensa da cidade.
  const regional = Object.values(NEWS.regional);
  assert.ok(!state.news.items.some((i) => ['critica', 'fofoca', 'boato'].includes(i.cat) && regional.includes(i.outlet)));
  const count = state.news.items.length;
  toMidnight(state, rt);
  assert.ok(!state.news.items.slice(count).some((i) => i.cat === 'alerta' && /luz|energia/i.test(i.headline)), 'não repete no dia seguinte');

  state.utilities.imported.power = true;
  advance(state, rt, 60);
  toMidnight(state, rt);
  assert.ok(!state.news.open.includes('energia'));
  assert.ok(state.news.items.some((i) => i.cat === 'resolvido' && /Energia volta/.test(i.headline)));
});

test('críticas ao governo seguem a maior fonte de insatisfação', () => {
  const { state, rt } = grownCity(2);
  rt.complaints = { health: 0, leisure: 0.01, school: 0, food: 0, garbage: 0, pollution: 0, unemployment: 0, tax: 0.2, stress: 0, crime: 0 };
  assert.deepEqual(topComplaint(rt), ['tax', 0.2]);
  rt.complaints.tax = 0.001;
  rt.complaints.leisure = 0.001;
  assert.equal(topComplaint(rt), null, 'abaixo do mínimo não vira pauta');

  // Com o imposto residencial alto, a imprensa local critica no fechamento do mês.
  state.economy.taxes.residential = 18;
  for (let i = 0; i < 6 && !state.news.items.some((x) => x.cat === 'critica' && x.body.includes('18%')); i++) {
    monthlyNews(state, rt);
    state.news.next.imposto = 0;
  }
  assert.ok(state.news.items.some((x) => x.cat === 'critica' && x.body.includes('18%')), 'crítica ao imposto');
});

test('boatos: saem na imprensa local e a checagem desmente depois', () => {
  const { state, rt } = grownCity(2);
  assert.ok(outlets(state).length > 0);
  // Força a rotina a publicar só boatos.
  const saved = NEWS.mix.jornal;
  NEWS.mix.jornal = { boato: 1 };
  try {
    for (let i = 0; i < 20 && !state.news.fakes.length; i++) dailyNews(state, rt);
  } finally {
    NEWS.mix.jornal = saved;
  }
  const fake = state.news.items.find((i) => i.fake);
  assert.ok(fake, 'um boato foi publicado');
  assert.ok(!fake.debunked);
  const [{ claim }] = state.news.fakes;
  advance(state, rt, (NEWS.debunkDays[1] + 1) * TICKS_PER_DAY);
  assert.ok(fake.debunked, 'desmentido');
  assert.ok(state.news.items.some((i) => i.cat === 'checagem' && i.headline.includes(claim)));
});

test('pesquisa: o que a cidade conclui e o que o mundo descobre viram notícia', () => {
  const { state, rt } = grownCity(1);
  completeTech(state, rt, 'radio');
  const world = state.research.world;
  state.research.world = world + 3; // o mundo avança três "anos" de uma vez
  monthlyNews(state, rt);
  const items = state.news.items;
  assert.ok(items.some((i) => i.cat === 'tecnologia' && i.alert && i.headline.includes('Rádio')));
  const found = TECHS.filter((t) => t.order > world && t.order <= world + 3 && !state.research.done.includes(t.id));
  assert.ok(found.length > 0);
  for (const t of found) assert.ok(items.some((i) => i.cat === 'mundo' && i.headline.includes(t.name)), t.name);
  // Nada é noticiado duas vezes.
  const n = items.length;
  monthlyNews(state, rt);
  assert.ok(!state.news.items.slice(n).some((i) => i.cat === 'tecnologia' || i.cat === 'mundo'));
});

test('determinismo: mesma semente, mesmas notícias; salvar e carregar não muda nada', () => {
  const a = grownCity(1, 77);
  const b = grownCity(1, 77);
  assert.deepEqual(a.state.news, b.state.news);
  assert.ok(a.state.news.items.length > 0);

  const save = createSave(a.state, { id: 'noticias' });
  const loaded = readSave(JSON.parse(JSON.stringify(save))).state;
  const rt2 = prepare(loaded);
  advance(a.state, a.rt, 10 * TICKS_PER_DAY);
  advance(loaded, rt2, 10 * TICKS_PER_DAY);
  assert.deepEqual(loaded.news, a.state.news);
});

test('save antigo (formato 15) ganha as notícias sem nada publicado', () => {
  const state = createWorld({ width: 32, height: 32, seed: 9 });
  const save = JSON.parse(JSON.stringify(createSave(state, { id: 'velho' })));
  save.version = 15;
  delete save.data.news;
  save.checksum = checksum(save.data);
  const { save: migrated, state: loaded } = readSave(save);
  assert.equal(migrated.version, 16);
  assert.deepEqual(loaded.news, createNews(state.seed, state.research));
});
