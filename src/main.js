import { createWorld } from './world/world.js';
import { BUILDINGS, DENSITY, DENSITY_INFO, EDUCATION, NEWS, ROAD_TYPES, ZONE, ZONE_INFO } from './world/catalog.js';
import { radiusOf, seatsOf } from './systems/education.js';
import { serviceRadius } from './systems/services.js';

const SERVICE_NAMES = { saude: 'saúde', policia: 'menos crime', bombeiros: 'apaga incêndios', lazer: 'lazer' };
import {
  TOOL_TECH, applyCommand, costs, lineTiles, planCommand, rectTiles, roadCost, roadUnlocked,
} from './world/commands.js';
import { BUILDING_TECH, MARCOS, TECHS, TECH_BY_ID } from './world/techs.js';
import { forecastText } from './systems/census.js';
import { isUnlocked, utilityCost, utilityOutput, utilityUpkeep } from './systems/mods.js';
import { advance, prepare, tick } from './systems/simulation.js';
import { startLoop } from './core/loop.js';
import { formatDate } from './core/time.js';
import { MAP_MODES, Renderer, mapColor } from './render/renderer.js';
import { moverPose } from './render/movers.js';
import { Minimap } from './render/minimap.js';
import {
  centerOn, createCamera, panBy, screenToTile, worldToScreen, zoomAt,
} from './render/camera.js';
import { renderInspector } from './ui/inspector.js';
import { BudgetPanel } from './ui/budget.js';
import { ResearchPanel } from './ui/research.js';
import { CulturePanel } from './ui/culture.js';
import { SportsPanel } from './ui/sports.js';
import { NewsPanel, mediumIcon } from './ui/news.js';
import { Sheets } from './ui/sheets.js';
import { hydrateIcons, icon, inkFor } from './ui/icons.js';
import { computeDemand } from './systems/demand.js';
import { SaveManager } from './save/SaveManager.js';
import { detectBackend } from './save/backends.js';

const AUTOSAVE_MS = 60_000;
const KEY_PAN_SPEED = 900; // pixels por segundo

const $ = (id) => document.getElementById(id);
const canvas = $('map');

// Ferramentas: `shape` define como o arraste seleciona tiles.
const TOOLS = [
  { id: 'inspect', name: 'Inspecionar', key: 'v' },
  { id: 'road', name: 'Estrada', key: 'e', shape: 'line', road: 1, color: 'rgba(255,255,255,0.35)', swatch: '#5a5d65', group: 'road' },
  // Avenida e via expressa: sobre uma rua, melhoram ela (paga só a diferença).
  { id: 'avenida', name: 'Avenida', shape: 'line', road: 2, color: 'rgba(255,255,255,0.45)', swatch: '#4c4f57', group: 'road' },
  { id: 'expressa', name: 'Via expressa', label: 'Expressa', shape: 'line', road: 3, color: 'rgba(255,255,255,0.55)', swatch: '#3d4047', group: 'road' },
  { id: 'calcadao', name: 'Calçadão', shape: 'line', road: 4, color: 'rgba(216,207,189,0.7)', swatch: '#d8cfbd', group: 'road' },
  ...[ZONE.RESIDENTIAL, ZONE.COMMERCIAL, ZONE.INDUSTRIAL, ZONE.RURAL].map((zone) => ({
    id: `zone-${zone}`, name: ZONE_INFO[zone].name, key: ZONE_INFO[zone].key,
    shape: 'rect', zone, color: ZONE_INFO[zone].color + '88', swatch: ZONE_INFO[zone].color, group: 'zone',
  })),
  // Cidade planejada: arrastar um retângulo desenha ruas e zonas de um bairro inteiro.
  { id: 'bairro', name: 'Bairro planejado', label: 'Bairro', shape: 'rect', tech: TOOL_TECH.bairro, color: 'rgba(95,191,90,0.35)', swatch: '#7fa36b', group: 'zone' },
  { id: 'bulldoze', name: 'Demolir', key: 'b', shape: 'rect', color: 'rgba(255,80,60,0.45)', swatch: '#d9534f' },
  // Ferramentas que vêm da pesquisa (ficam escondidas até liberar).
  { id: 'parque', name: 'Parque de conservação', label: 'Conservação', shape: 'rect', tech: TOOL_TECH.parque, color: 'rgba(63,138,82,0.55)', swatch: '#3f8a52', group: 'tourism' },
  // Corrida de rua: arrastar da largada até a chegada (o percurso segue as ruas).
  { id: 'corrida', name: 'Corrida de rua', label: 'Corrida', shape: 'line', tech: TOOL_TECH.corrida, color: 'rgba(230,126,34,0.6)', swatch: '#e67e22', group: 'leisure' },
  { id: 'revitalizar', name: 'Revitalizar indústria abandonada', label: 'Revitalizar', shape: 'single', tech: TOOL_TECH.revitalizar, color: 'rgba(142,68,173,0.5)', swatch: '#8e44ad', group: 'tourism' },
  // Prédios do jogador: um clique coloca (precisa encostar numa rua). Os que
  // dependem de pesquisa ficam escondidos (no celular, com cadeado) até liberar.
  ...[
    ['usina_carvao', 'Carvão', '#5f5d58', 'utility'], ['usina_gas', 'Gás', '#8d949b', 'utility'],
    ['hidreletrica', 'Hidrelétrica', '#4a88b4', 'utility'], ['usina_eolica', 'Eólica', '#dfe2e5', 'utility'],
    ['usina_nuclear', 'Nuclear', '#d9dde2', 'utility'], ['bateria_rede', 'Baterias', '#3d8f5a', 'utility'],
    ['usina_solar', 'Solar', '#3d5c9e', 'utility'], ['usina_hidrogenio', 'Hidrogênio', '#16a085', 'utility'],
    ['bomba_agua', 'Bomba', '#4f97c4', 'utility'], ['poco', 'Poço', '#9fc3e0', 'utility'],
    ['instituto_pesquisa', 'Instituto', '#e9edf2', 'research'], ['parque_tecnologico', 'Parque tec.', '#7fa6d6', 'research'],
    ['refinaria', 'Refinaria', '#c8ccd2', 'research'], ['fabrica_cimento', 'Cimento', '#cfc9b8', 'research'],
    ['usina_etanol', 'Etanol', '#7d8a5c', 'research'], ['petroquimica', 'Petroquímica', '#d0d3d8', 'research'],
    ['biotecnologia', 'Biotecnologia', '#16a085', 'research'], ['torre_celular', 'Celular', '#c0c4c9', 'research'],
    ['creche', 'Creche', '#f2c6b4', 'education'], ['escola', 'Escola', '#e6d1a8', 'education'],
    ['escola_media', 'Ensino médio', '#3f6fc0', 'education'], ['escola_tecnica', 'Técnica', '#e8b931', 'education'],
    ['senai', 'Aprendizagem', '#c23b3b', 'education'], ['universidade', 'Universidade', '#6f8fae', 'education'],
    ['biblioteca', 'Biblioteca', '#e9e4da', 'education'],
    ['hospital', 'Hospital', '#f4f5f6', 'services'], ['clinica', 'Clínica', '#51cf66', 'services'],
    ['posto_saude', 'Vacinação', '#4f8ff7', 'services'], ['caps', 'CAPS', '#8e44ad', 'services'],
    ['delegacia', 'Delegacia', '#2c3e50', 'services'], ['guarda_municipal', 'Guarda', '#16a085', 'services'],
    ['central_cameras', 'Câmeras', '#5b7fa8', 'services'], ['quartel_bombeiros', 'Bombeiros', '#c0392b', 'services'],
    ['base_samu', 'SAMU', '#e05a47', 'services'], ['conjunto_habitacional', 'Habitação', '#d9b38c', 'services'],
    ['mercado_municipal', 'Mercado', '#e9d48a', 'food'], ['restaurante_popular', 'Restaurante', '#d9822b', 'food'],
    ['ceasa', 'Ceasa', '#3d8f5a', 'food'],
    ['museu', 'Museu', '#f0e6d2', 'tourism'], ['campo_futebol', 'Campo', '#4f9a48', 'tourism'],
    ['estadio', 'Estádio', '#d9dde2', 'tourism'], ['parque_tematico', 'Parque temático', '#e8b931', 'tourism'],
    ['hotel', 'Hotel', '#9fc3e0', 'tourism'], ['arena_eventos', 'Arena', '#8e44ad', 'tourism'],
    ['teatro', 'Teatro', '#c0392b', 'tourism'],
    ['aeroporto', 'Aeroporto', '#5b7fa8', 'tourism'],
    ['lixao', 'Lixão', '#7a6a4f', 'waste'], ['aterro', 'Aterro', '#6f8a4f', 'waste'],
    ['centro_reciclagem', 'Reciclagem', '#3d8f5a', 'waste'], ['estacao_esgoto', 'Esgoto', '#5f8a7a', 'waste'],
    ['parque', 'Praça', '#7fb069', 'leisure'], ['cinema', 'Cinema', '#8e44ad', 'leisure'], ['ginasio', 'Ginásio', '#3f6fc0', 'leisure'],
    ['pista_atletismo', 'Pista', '#c0703f', 'leisure'], ['parque_aquatico', 'Parque aquático', '#5fb7d8', 'leisure'],
    ['ponto_onibus', 'Ônibus', '#e8b931', 'transit'], ['estacao_brt', 'BRT', '#c0392b', 'transit'],
    ['estacao_vlt', 'VLT', '#16a085', 'transit'], ['estacao_metro', 'Metrô', '#9fc3e0', 'transit'],
    ['patio_ferroviario', 'Pátio', '#8a826f', 'freight'], ['porto', 'Porto', '#3f6fc0', 'freight'],
    ['centro_distribuicao', 'Distribuição', '#cfc9b8', 'freight'],
  ].map(([building, label, swatch, group]) => ({
    id: `place-${building}`, name: BUILDINGS[building].name, label, shape: 'single', building, swatch, group,
  })),
];

// Grupos de ferramentas e os menus da barra, por área. Inspecionar e Demolir
// ficam fora dos menus, como botões diretos.
const GROUPS = {
  road: 'Ruas', zone: 'Zonas', utility: 'Energia e água', waste: 'Lixo e esgoto',
  education: 'Educação', services: 'Saúde e segurança', food: 'Alimentos',
  leisure: 'Lazer', tourism: 'Turismo e cultura', transit: 'Transporte público', freight: 'Carga',
  research: 'Pesquisa e estatais',
};
const MENUS = [
  { id: 'ruas', name: 'Ruas', icon: 'roads', groups: ['road'] },
  { id: 'zonas', name: 'Zonas', icon: 'zones', groups: ['zone'] },
  { id: 'infra', name: 'Infraestrutura', icon: 'infra', groups: ['utility', 'waste'] },
  { id: 'servicos', name: 'Serviços', icon: 'services', groups: ['education', 'services', 'food'] },
  { id: 'lazer', name: 'Lazer e cultura', icon: 'leisure', groups: ['leisure', 'tourism'] },
  { id: 'transporte', name: 'Transporte', icon: 'transport', groups: ['transit', 'freight'] },
  { id: 'economia', name: 'Estatais', icon: 'estatais', groups: ['research'] },
];
// Mapas, também por área.
const MAP_MENU = [
  ['Infraestrutura', ['energia', 'agua', 'lixo', 'transito']],
  ['Serviços', ['escolas', 'saude', 'crime', 'alimentos']],
  ['Cidade', ['valor', 'poluicao', 'satisfacao', 'escolaridade', 'desemprego']],
];
// Ícone de cada ferramenta (src/ui/icons.js): o do prédio, da zona ou o id.
const ZONE_ICON = { [ZONE.RESIDENTIAL]: 'residencial', [ZONE.COMMERCIAL]: 'comercial', [ZONE.INDUSTRIAL]: 'industrial', [ZONE.RURAL]: 'rural' };
const toolIcon = (t) => (t.building === 'parque' ? 'praca' : t.building ?? ZONE_ICON[t.zone] ?? t.id);
/** Ícone sobre a cor da ferramenta (a mesma do prédio ou da zona no mapa). */
const glyph = (t) => `<span class="glyph" style="--c:${t.swatch};color:${inkFor(t.swatch)}">${icon(toolIcon(t))}</span>`;
const DEMAND_KEY = {
  [ZONE.RESIDENTIAL]: 'residential', [ZONE.COMMERCIAL]: 'commercial',
  [ZONE.INDUSTRIAL]: 'industrial', [ZONE.RURAL]: 'rural',
};

/** Preço mostrado nos botões do painel "Construir" (celular). */
function toolCost(t) {
  if (t.building) return `$${utilityCost(rt, t.building).toLocaleString('pt-BR')}`;
  const c = costs(rt);
  if (t.road) return `$${round(roadCost(rt, t.road))}/tile`;
  if (t.zone) return `$${round(c.zone)}/tile`;
  if (t.id === 'bulldoze') return 'varia';
  return '';
}
const round = (v) => (Math.round(v * 10) / 10).toLocaleString('pt-BR');

let state;
let rt;
let cam;
let speed = 1;
let tool = TOOLS[1];
// Densidade usada ao zonear residencial e comercial (tecla X troca).
let density = DENSITY.MEDIUM;
const DENSITY_KEY = 'x';
const usesDensity = (t) => t.zone === ZONE.RESIDENTIAL || t.zone === ZONE.COMMERCIAL;
let dirty = false; // mudanças desde o último save manual
let newsReset = true; // cidade nova ou carregada: as notícias que já existem contam como lidas
let hover = null;
let drag = null; //   { kind: 'tool' | 'pan', start, last, moved }
let selection = null; // { type: 'building' | 'citizen', id }
let mapMode = null; //   chave de MAP_MODES (valor do terreno, poluição) ou null
let following = false;
const keysDown = new Set();

hydrateIcons();
const renderer = new Renderer(canvas);
const sheets = new Sheets(); // painéis do celular (ver mais abaixo)
const minimap = new Minimap($('minimap'));

const saves = new SaveManager({
  backend: await detectBackend(),
  getState: () => state,
  onEvent: handleSaveEvent,
});
$('storage-mode').textContent = `Saves: ${saves.backend.label}`;
if (saves.backend.migrated) {
  status(`${saves.backend.migrated} save(s) movidos do localStorage para o IndexedDB`);
}

// ---------------------------------------------------------------------------
// Partida
// ---------------------------------------------------------------------------

function setWorld(next) {
  state = next;
  rt = prepare(state);
  newsReset = true;
  renderer.invalidate();
  cam = createCamera(state.map.width, state.map.height);
  renderer.resize(cam);
  selection = null;
  following = false;
  dirty = false;
  updateInspector();
}

function newCity(name, startMarco = 1) {
  setWorld(createWorld({ name, startMarco }));
  saves.startNew(state.city.name);
}

newCity('Nova Cidade');
saves.startAutosave(AUTOSAVE_MS);

const loopStats = startLoop({
  getSpeed: () => speed,
  tick: () => tick(state, rt),
  render: (dt) => {
    if (speed > 0) state.playTimeSeconds += dt;
    panWithKeys(dt);
    if (following && selection?.type === 'citizen') {
      const c = rt.citizenById.get(selection.id);
      if (c) centerOn(cam, c.x, c.y);
    }
    renderer.render(state, rt, cam, {
      hover,
      preview: currentPreview(),
      selected: selectedObjects(),
      mapMode,
      closed: rt.blockedTiles,
    });
    minimap.render(state, rt, cam);
    throttledHud();
  },
});

// O canvas muda de tamanho com a janela e também quando a barra de
// ferramentas quebra de linha: acompanha o tamanho real dele.
new ResizeObserver(() => renderer.resize(cam)).observe(canvas);

// Acesso pelo console do navegador, para depurar: jogo.state, jogo.rt, ...
window.jogo = {
  get state() { return state; },
  get rt() { return rt; },
  get cam() { return cam; },
  applyCommand: (cmd) => {
    renderer.invalidate();
    return applyCommand(state, rt, cmd);
  },
  advance: (ticks) => advance(state, rt, ticks),
  select: (next) => select(next), // { type: 'building' | 'citizen', id }
  renderer,
  loop: loopStats,
  saves,
  setSpeed,
};

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------

let lastHud = 0;
function throttledHud() {
  const now = performance.now();
  if (now - lastHud < 200) return;
  lastHud = now;
  renderHud();
  if (selection) updateInspector();
  budget.render(state, rt);
  research.render(state, rt);
  culture.render(state, rt);
  sports.render(state, rt);
  if (newsReset) {
    newsReset = false;
    newsPanel.markSeen(state);
    rt.newsFresh = [];
  }
  newsPanel.render(state, rt);
  const unread = newsPanel.unread(state);
  $('news-count').textContent = unread > 99 ? '99+' : String(unread);
  $('news-count').hidden = unread === 0;
  refreshTools();
  announceNews();
}

function renderHud() {
  const s = rt.stats;
  $('city-name').textContent = state.city.name + (dirty ? ' *' : '');
  $('date').textContent = formatDate(state.time.tick);
  $('population').textContent = s.population.toLocaleString('pt-BR');
  const city = rt.cityWellbeing;
  if (city) {
    const sat = Math.round(city.satisfaction * 100);
    const happy = $('happiness');
    const face = happy.firstElementChild;
    const mood = sat >= 60 ? 'face-happy' : sat >= 40 ? 'face-neutral' : 'face-sad';
    if (face.dataset.icon !== mood) {
      face.dataset.icon = mood;
      face.innerHTML = icon(mood);
    }
    happy.lastElementChild.textContent = `${sat}%`;
    happy.title = `Satisfação média ${sat}% · saúde ${Math.round(city.health * 100)}% · crime ${Math.round(city.crime * 100)}%`
      + (state.health?.epidemicUntil > state.time.tick ? ' · EPIDEMIA' : '');
    happy.classList.toggle('short', sat < 40 || state.health?.epidemicUntil > state.time.tick);
  }
  let kids = 0;
  for (const c of state.citizens) if (c.age < 18) kids++;
  $('population').parentElement.title = `População: ${(s.population - kids).toLocaleString('pt-BR')} adultos e ${kids.toLocaleString('pt-BR')} crianças e jovens`;
  // Taxa de desemprego no topo; os números completos na dica.
  const jobless = s.workforce ? s.unemployed / s.workforce : 0;
  const employment = $('employment');
  employment.textContent = `${(Math.round(jobless * 1000) / 10).toLocaleString('pt-BR')}%`;
  employment.parentElement.title = `Desemprego ${employment.textContent}: ${s.unemployed.toLocaleString('pt-BR')} procurando trabalho, `
    + `${s.employed.toLocaleString('pt-BR')} empregados, ${s.openJobs.toLocaleString('pt-BR')} vagas abertas`
    + (s.outside ? ` (${s.outside.toLocaleString('pt-BR')} trabalham em cidades vizinhas)` : '');
  employment.parentElement.classList.toggle('short', jobless > NEWS.problems.desemprego);
  $('money').textContent = `$${state.economy.money.toLocaleString('pt-BR')}`;
  // Com o censo, a dica do botão de demanda traz a previsão de 3 meses.
  $('btn-zones').title = ['Demanda por zona (R, C, I e rural): para cima falta, para baixo sobra. Clique para zonear e escolher a densidade.', forecastText(rt)].filter(Boolean).join('\n');
  const demands = [['demand-r', rt.demand.residential], ['demand-c', rt.demand.commercial],
    ['demand-i', rt.demand.industrial], ['demand-f', rt.demand.rural]];
  for (const [id, value] of demands) {
    const bar = $(id).firstElementChild;
    const pct = Math.min(50, Math.abs(value) * 2);
    bar.style.height = `${pct}%`;
    bar.style.bottom = value >= 0 ? '50%' : `${50 - pct}%`;
    bar.style.opacity = value >= 0 ? '1' : '0.45';
  }
  // A mesma demanda nos botões das zonas, em barras deitadas: para a direita
  // falta, para a esquerda sobra.
  for (const el of document.querySelectorAll('[data-demand]')) {
    const value = rt.demand[DEMAND_KEY[el.dataset.demand]] ?? 0;
    const pct = Math.min(50, Math.abs(value) * 2);
    const bar = el.firstElementChild;
    bar.style.width = `${pct}%`;
    bar.style.left = value >= 0 ? '50%' : `${50 - pct}%`;
    bar.style.opacity = value >= 0 ? '1' : '0.45';
    el.title = `Demanda ${value > 0 ? '+' : ''}${Math.round(value)}: ${value > 2 ? 'a cidade quer mais desta zona' : value < -2 ? 'sobra desta zona' : 'equilibrada'}`;
  }
  for (const b of $('speeds').children) b.classList.toggle('active', Number(b.dataset.speed) === speed);
  renderUtilities();
}

// Energia e água no topo: consumo / produção, em vermelho quando falta.
function renderUtilities() {
  const totals = rt.utilityTotals;
  const imported = state.utilities.imported;
  const missing = [];
  let anyZone = false;
  for (const z of state.map.zone) if (z) { anyZone = true; break; }
  for (const [res, id, label] of [['power', 'power', 'energia'], ['water', 'water', 'água']]) {
    const el = $(id);
    const t = totals[res];
    if (imported[res]) {
      el.lastElementChild.textContent = 'importada';
      el.classList.remove('short');
      continue;
    }
    el.lastElementChild.textContent = `${t.used.toLocaleString('pt-BR')} / ${t.supply.toLocaleString('pt-BR')}`;
    const unserved = [...rt.service.values()].some((s) => !s[res]);
    el.classList.toggle('short', unserved || (t.supply === 0 && anyZone));
    if (t.supply === 0 && anyZone) missing.push(label);
  }
  const hint = $('utility-hint');
  hint.hidden = missing.length === 0;
  if (missing.length) {
    const build = [];
    if (missing.includes('energia')) build.push('usina');
    if (missing.includes('água')) build.push('bomba ou poço');
    hint.textContent = `Sem ${missing.join(' e ')}: construa ${build.join(' e ')} junto a uma rua`;
  }
}

function setSpeed(value) {
  speed = value;
  renderHud();
}
for (const b of $('speeds').children) b.onclick = () => setSpeed(Number(b.dataset.speed));

// ---------------------------------------------------------------------------
// Ferramentas e mouse
// ---------------------------------------------------------------------------

// Botão de uma ferramenta, igual nos menus da barra e no painel "Construir"
// do celular: cor, nome, tecla e preço (ou o cadeado, enquanto falta pesquisa).
// As zonas mostram também a demanda.
function toolButton(t) {
  const button = document.createElement('button');
  button.className = 'tool';
  button.dataset.tool = t.id;
  const key = t.key ? `<kbd>${t.key.toUpperCase()}</kbd>` : '';
  button.innerHTML = `${glyph(t)}
    <span class="name">${t.label || t.name}${key}</span><small>${toolCost(t)}</small>
    ${t.zone ? `<span class="demand" data-demand="${t.zone}" style="--zone:${t.swatch}"><i></i></span>` : ''}`;
  button.onclick = () => {
    selectTool(t);
    closeMenus();
    sheets.close();
  };
  return button;
}

/** Seções (título + grade de botões) de um menu; as zonas ganham a densidade. */
function menuSections(menu, extra = []) {
  const nodes = [];
  for (const group of menu.groups) {
    const title = document.createElement('h4');
    title.textContent = GROUPS[group];
    const grid = document.createElement('div');
    grid.className = 'tool-grid';
    grid.dataset.buildGroup = group;
    grid.append(...TOOLS.filter((t) => t.group === group).map(toolButton), ...(group === 'road' ? extra : []));
    nodes.push(title, grid);
    if (group === 'zone') {
      const dens = document.createElement('h4');
      dens.innerHTML = `Densidade <small>residencial e comercial · tecla ${DENSITY_KEY.toUpperCase()}</small>`;
      nodes.push(dens, densityButtons('density'));
    }
  }
  return nodes;
}

// Menu suspenso da barra: um botão que abre um painel logo abaixo dele.
function addMenu(id, label, nodes, className = '', parent = $('tools')) {
  const wrap = document.createElement('div');
  wrap.className = 'menu';
  wrap.dataset.menu = id;
  const button = document.createElement('button');
  button.className = 'menu-button';
  button.innerHTML = `${label}<span class="caret">▾</span>`;
  button.onclick = () => toggleMenu(id);
  const panel = document.createElement('div');
  panel.className = `menu-panel ${className}`;
  panel.hidden = true;
  panel.append(...nodes);
  wrap.append(button, panel);
  parent.append(wrap);
  return wrap;
}
let openMenu = null;
function toggleMenu(id) {
  const next = openMenu === id ? null : id;
  closeMenus();
  if (!next) return;
  openMenu = next;
  const wrap = document.querySelector(`.menu[data-menu="${id}"]`);
  wrap.classList.add('open');
  const panel = wrap.querySelector('.menu-panel');
  panel.hidden = false;
  // Não deixa o painel sair pela direita da janela.
  panel.style.left = '';
  const overflow = panel.getBoundingClientRect().right - (window.innerWidth - 8);
  if (overflow > 0) panel.style.left = `${-overflow}px`;
}
function closeMenus() {
  openMenu = null;
  for (const wrap of document.querySelectorAll('.menu.open')) {
    wrap.classList.remove('open');
    wrap.querySelector('.menu-panel').hidden = true;
  }
}
// Clicar fora de um menu aberto fecha ele.
document.addEventListener('pointerdown', (e) => {
  if (openMenu && !e.target.closest('.menu, #btn-zones')) closeMenus();
});

const directButton = (t) => {
  const button = document.createElement('button');
  button.dataset.tool = t.id;
  button.className = 'direct';
  button.innerHTML = `${icon(toolIcon(t))}${t.id === 'inspect' ? '' : `<span>${t.name}</span>`}<kbd>${t.key.toUpperCase()}</kbd>`;
  button.title = `${t.name} (tecla ${t.key.toUpperCase()})`;
  button.onclick = () => {
    selectTool(t);
    closeMenus();
  };
  return button;
};
const bulldozeTool = TOOLS.find((t) => t.id === 'bulldoze');
$('tools').append(directButton(TOOLS[0]));
for (const menu of MENUS) addMenu(menu.id, `${icon(menu.icon)}<span data-menu-label>${menu.name}</span>`, menuSections(menu));
$('tools').append(directButton(bulldozeTool));

// Escolha da densidade: Baixa / Média / Alta. Na barra fica depois das zonas;
// no celular, num grupo do painel "Construir".
function densityButtons(className) {
  const group = document.createElement('span');
  group.className = className;
  group.title = `Densidade das zonas residenciais e comerciais (tecla ${DENSITY_KEY.toUpperCase()})`;
  for (const [value, info] of Object.entries(DENSITY_INFO)) {
    const button = document.createElement('button');
    button.dataset.density = value;
    button.title = `${info.name}: ${info.maxLevel < 3 ? 'casas, sobrados, lojas e mercados' : `prédios até ${info.maxFloors} andares`}`;
    button.textContent = info.name;
    button.onclick = () => setDensity(Number(value));
    group.append(button);
  }
  return group;
}
function setDensity(value) {
  density = value;
  showDensity();
  // Escolher a densidade com outra ferramenta na mão já pega a zona residencial.
  if (!usesDensity(tool)) selectTool(TOOLS.find(usesDensity));
}
function showDensity() {
  for (const b of document.querySelectorAll('[data-density]')) b.classList.toggle('active', Number(b.dataset.density) === density);
}
function utilityTitle(id) {
  const u = BUILDINGS[id].utility;
  const fmt = (v) => v.toLocaleString('pt-BR');
  const makes = [];
  if (u.power) makes.push(`produz ${fmt(utilityOutput(rt, id, 'power'))} de energia`);
  if (u.water) makes.push(`produz ${fmt(utilityOutput(rt, id, 'water'))} de água`);
  if (u.institute) makes.push('transforma a verba de pesquisa em tecnologia');
  if (u.privateResearch) makes.push('escritórios em volta fazem pesquisa');
  if (u.income) makes.push(`estatal: rende até $${fmt(u.income)}/mês`);
  if (u.school) makes.push(`${EDUCATION.stages[u.school.stage].name.toLowerCase()}: ${fmt(seatsOf(rt, id))} vagas num raio de ${radiusOf(rt, id)} tiles`);
  if (u.library) makes.push(`estudantes num raio de ${u.library.radius} tiles avançam ${Math.round(u.library.bonus * 100)}% mais rápido`);
  if (u.signal) makes.push(`valoriza o terreno num raio de ${u.signal.radius} tiles`);
  if (u.service) makes.push(`${SERVICE_NAMES[u.service.kind]} num raio de ${serviceRadius(rt, id)} tiles`);
  const notes = [u.pollution ? 'polui' : null, u.needsWater ? 'na beira de rio ou lago' : null].filter(Boolean);
  const text = `${makes.join(', ')} · $${fmt(utilityCost(rt, id))} + $${fmt(utilityUpkeep(rt, id))}/mês`;
  return text.charAt(0).toUpperCase() + text.slice(1) + (notes.length ? ' · ' + notes.join(', ') : '');
}

/** Tecnologia que falta para um prédio, em texto curto ("Usina solar, marco 4"). */
function lockText(t) {
  const tech = TECH_BY_ID.get(t.tech ?? (t.road ? ROAD_TYPES[t.road].tech : BUILDING_TECH[t.building]));
  return `${tech.name} · marco ${tech.marco}`;
}

/** A ferramenta ainda depende de pesquisa? */
const toolLocked = (t) => {
  if (t.building) return !isUnlocked(rt, t.building);
  if (t.road) return !roadUnlocked(rt, t.road);
  return t.tech ? !rt.techDone?.has(t.tech) : false;
};

// Liberações e preços mudam com a pesquisa: atualiza os botões.
let toolsKey = '';
function refreshTools() {
  const key = `${state.research.done.length}|${[...rt.mods.keys()].join()}|${[...rt.unlocked].join()}`;
  if (key === toolsKey) return;
  toolsKey = key;
  for (const t of TOOLS) {
    const locked = toolLocked(t);
    for (const button of document.querySelectorAll(`[data-tool="${t.id}"]`)) {
      const small = button.querySelector('small');
      if (!small) continue; // Inspecionar e Demolir: sempre liberados
      button.disabled = Boolean(locked);
      small.innerHTML = locked ? `${icon('lock')} ${escapeHtml(lockText(t))}` : toolCost(t);
      button.title = locked ? `${t.name}: precisa de ${lockText(t)}`
        : t.building ? `${t.name}: ${utilityTitle(t.building)}` : t.name;
    }
  }
  if (toolLocked(tool)) selectTool(TOOLS[0]);
}

function selectTool(t) {
  tool = t;
  drag = null;
  for (const b of document.querySelectorAll('[data-tool]')) b.classList.toggle('active', b.dataset.tool === t.id);
  // O botão do menu mostra a ferramenta escolhida dentro dele.
  for (const menu of MENUS) {
    const wrap = document.querySelector(`.menu[data-menu="${menu.id}"]`);
    const inside = menu.groups.includes(t.group);
    wrap.classList.toggle('active', inside);
    wrap.querySelector('[data-menu-label]').textContent = inside ? t.label || t.name : menu.name;
  }
  updateMobileNav();
}


// Orçamento: painel aberto pelo dinheiro no topo ou pela tecla O.
const budget = new BudgetPanel($('budget'), {
  act: (cmd) => {
    const result = applyCommand(state, rt, cmd);
    if (result.ok) {
      dirty = true;
      computeDemand(state, rt); // imposto muda a demanda na hora
      renderHud();
    }
    return result;
  },
});
$('btn-budget').onclick = () => toggleBudget();

// Pesquisa: painel aberto pelo botão de pesquisa no topo ou pela tecla T. Ocupa o
// mesmo canto do orçamento, então abrir um fecha o outro.
const research = new ResearchPanel($('research'), {
  act: (cmd) => {
    const result = applyCommand(state, rt, cmd);
    if (result.ok) dirty = true;
    return result;
  },
});
$('btn-research').onclick = () => toggleResearch();
// Cultura: artistas, gêneros e o que está em cartaz (botão no topo ou tecla Z).
const culture = new CulturePanel($('culture'), {
  act: (cmd) => {
    const result = applyCommand(state, rt, cmd);
    if (result.ok) dirty = true;
    return result;
  },
});
$('btn-culture').onclick = () => toggleCulture();
// Esporte: clubes, ligas e atletas (botão Esporte no topo).
const sports = new SportsPanel($('sports'), {
  act: (cmd) => {
    const result = applyCommand(state, rt, cmd);
    if (result.ok) dirty = true;
    return result;
  },
  inspect: (id) => select({ type: 'citizen', id }),
});
$('btn-sports').onclick = () => toggleSports();
// Notícias: o que a imprensa publicou e os veículos da cidade (botão Notícias no topo).
const newsPanel = new NewsPanel($('news'));
$('btn-news').onclick = () => toggleNews();

// Orçamento, pesquisa, cultura, esporte e notícias ocupam o mesmo canto: abrir um fecha os outros.
const cornerPanels = () => [budget, research, culture, sports, newsPanel];
function openOnly(panel, force) {
  panel.toggle(force);
  if (panel.open) for (const other of cornerPanels()) if (other !== panel) other.toggle(false);
  panel.render(state, rt);
}
const toggleBudget = (force) => openOnly(budget, force);
const toggleResearch = (force) => openOnly(research, force);
const toggleCulture = (force) => openOnly(culture, force);
const toggleSports = (force) => openOnly(sports, force);
const toggleNews = (force) => openOnly(newsPanel, force);

// Avisos na tela: as notícias de alerta que a imprensa acabou de publicar
// (problemas, incêndios, epidemias, festas, tecnologias). A simulação deixa
// as notícias novas em rt.newsFresh.
let toastTimer = null;
function announceNews() {
  // Os avisos antigos (rt.events, rt.researchEvents) agora chegam pelas notícias.
  rt.events = [];
  rt.researchEvents = [];
  const fresh = rt.newsFresh;
  if (!fresh?.length) return;
  rt.newsFresh = [];
  const alerts = fresh.filter((i) => i.alert).slice(-3);
  if (!alerts.length) return;
  const toast = $('toast');
  toast.innerHTML = alerts.map((i) => `<b>${mediumIcon(i.medium)} ${escapeHtml(i.headline)}</b>
    <span>${escapeHtml(i.outlet)} · ${escapeHtml(i.body.split(/(?<=[.!?])\s/)[0])}</span>`).join('');
  toast.hidden = false;
  status(alerts.map((i) => i.headline).join(' · '));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 7000);
}
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

// Mapas: sobreposições (valor do terreno, poluição, serviços...), num menu
// por área. Com um mapa ligado, a legenda das cores aparece embaixo do mapa.
const MAP_KEYS = { valor: 'l', poluicao: 'p', energia: 'n', agua: 'h', escolas: 'u', saude: 'g', crime: 'k', satisfacao: 'j', transito: 'm', alimentos: 'q', lixo: 'y' };
function mapButtons(onPick) {
  const nodes = [];
  for (const [area, ids] of [[null, [null]], ...MAP_MENU]) {
    if (area) {
      const title = document.createElement('h4');
      title.textContent = area;
      nodes.push(title);
    }
    const grid = document.createElement('div');
    grid.className = 'tool-grid maps';
    for (const id of ids) {
      const mode = id ? MAP_MODES[id] : { name: 'Nenhum (mapa normal)' };
      const button = document.createElement('button');
      button.className = 'tool';
      button.dataset.map = id ?? '';
      if (!id) button.classList.add('wide');
      // Ícone na cor "boa" do mapa, com a faixa de cores embaixo.
      const ramp = id ? `linear-gradient(90deg, ${mode.from}, ${mode.mid}, ${mode.to})` : 'var(--border)';
      button.innerHTML = `<span class="glyph map-glyph" style="--c:#20232a;--ramp:${ramp};color:${id ? mode.to : 'var(--muted)'}">${icon(id ?? 'map-off')}</span>
        <span class="name">${mode.name}${MAP_KEYS[id] ? `<kbd>${MAP_KEYS[id].toUpperCase()}</kbd>` : ''}</span>`;
      button.title = id ? `Mapa: ${mode.name}` : 'Desliga a sobreposição';
      button.onclick = () => {
        setMap(id);
        onPick();
      };
      grid.append(button);
    }
    nodes.push(grid);
  }
  return nodes;
}
const separator = document.createElement('span');
separator.className = 'separator';
$('tools').append(separator);
addMenu('mapas', `${icon('map')}<span data-menu-label>Mapas</span>`, mapButtons(closeMenus), 'narrow');

// O status (salvo, erros) fica num balão no canto de baixo do mapa.
$('viewport').append($('status'));
// Arquivo: os botões de salvar/carregar ficam num menu no topo, antes das velocidades.
const fileMenu = addMenu('arquivo', `${icon('save')}<span>Arquivo</span>`, [...$('file-actions').children], 'narrow file-menu', $('speeds').parentElement);
$('speeds').before(fileMenu);
$('file-actions').remove();
fileMenu.querySelector('.menu-panel').addEventListener('click', (e) => {
  if (e.target.closest('button')) closeMenus();
});

function toggleMap(id) {
  setMap(mapMode === id ? null : id);
}
function setMap(id) {
  // Mapas de dados do censo: só depois da pesquisa.
  const tech = id && MAP_MODES[id]?.tech;
  if (tech && !rt.techDone?.has(tech)) {
    status(`O mapa ${MAP_MODES[id].name.toLowerCase()} precisa da tecnologia ${TECH_BY_ID.get(tech).name}.`);
    return;
  }
  mapMode = id;
  for (const b of document.querySelectorAll('[data-map]')) b.classList.toggle('active', (b.dataset.map || null) === mapMode);
  const wrap = document.querySelector('.menu[data-menu="mapas"]');
  wrap.classList.toggle('active', Boolean(id));
  wrap.querySelector('[data-menu-label]').textContent = id ? MAP_MODES[id].label || MAP_MODES[id].name : 'Mapas';
  renderLegend();
  updateMobileNav();
}

// Legenda das cores do mapa ligado: faixa contínua (de ruim a bom) ou
// categorias com a cor de cada uma.
function renderLegend() {
  const el = $('legend');
  const mode = mapMode && MAP_MODES[mapMode];
  el.hidden = !mode;
  if (!mode) return;
  const { legend } = mode;
  const body = legend.items
    ? `<ul>${legend.items.map(([v, text]) => `<li><i style="background:${mapColor(mode, v)}"></i>${text}</li>`).join('')}</ul>`
    : `<div class="ramp" style="background:linear-gradient(90deg, ${mode.colors.join(', ')})"></div>
       <div class="ends"><span>${legend.low}</span><span>${legend.high}</span></div>`;
  el.innerHTML = `<button class="close" data-legend-close title="Desligar o mapa">×</button>
    <b>${icon(mapMode)} ${mode.name}</b>${body}${legend.note ? `<small>${legend.note}</small>` : ''}`;
}
$('legend').addEventListener('click', (e) => {
  if (e.target.closest('[data-legend-close]')) setMap(null);
});

// --- Celular: barra inferior e painéis que sobem de baixo -------------------

// "Construir": as mesmas seções dos menus da barra, uma embaixo da outra.
const buildSections = document.querySelector('[data-build-sections]');
const mobileBulldoze = toolButton(bulldozeTool);
for (const menu of MENUS) buildSections.append(...menuSections(menu, [mobileBulldoze]));
document.querySelector('[data-maps]').append(...mapButtons(() => sheets.close()));

for (const button of document.querySelectorAll('[data-click]')) {
  // Os botões do painel "Arquivo" fazem o mesmo que os do menu Arquivo do computador.
  button.onclick = () => {
    sheets.close();
    $(button.dataset.click).click();
  };
}

for (const button of $('mobile-nav').children) {
  button.onclick = () => {
    if (button.dataset.sheet) {
      if (button.dataset.sheet === 'sheet-file') {
        document.querySelector('[data-file-status]').textContent =
          [$('storage-mode').textContent, $('status').textContent].filter(Boolean).join(' · ');
      }
      sheets.toggle(button.dataset.sheet);
    } else if (button.dataset.mobile === 'inspect') {
      sheets.close();
      selectTool(TOOLS[0]);
    } else if (button.dataset.mobile === 'budget') {
      sheets.close();
      toggleBudget();
    } else if (button.dataset.mobile === 'research') {
      sheets.close();
      toggleResearch();
    } else if (button.dataset.mobile === 'culture') {
      sheets.close();
      toggleCulture();
    } else if (button.dataset.mobile === 'sports') {
      sheets.close();
      toggleSports();
    } else if (button.dataset.mobile === 'news') {
      sheets.close();
      toggleNews();
    }
  };
}
sheets.onChange = () => updateMobileNav();

function setIcon(el, name) {
  if (el.dataset.icon === name) return;
  el.dataset.icon = name;
  el.innerHTML = icon(name);
}

// Destaca o botão ativo e mostra a ferramenta/mapa escolhidos nos rótulos.
function updateMobileNav() {
  const nav = $('mobile-nav');
  if (!nav) return;
  const building = tool.id !== 'inspect';
  nav.querySelector('[data-mobile="inspect"]').classList.toggle('active', !building);
  nav.querySelector('[data-sheet="sheet-build"]').classList.toggle('active', building);
  nav.querySelector('[data-build-label]').textContent = building ? (tool.label || tool.name) : 'Construir';
  // O ícone dos botões vira o da ferramenta e o do mapa escolhidos.
  setIcon(nav.querySelector('[data-sheet="sheet-build"] .ico'), building ? toolIcon(tool) : 'build');
  setIcon(nav.querySelector('[data-sheet="sheet-maps"] .ico'), mapMode ?? 'map');
  nav.querySelector('[data-maps-label]').textContent = mapMode ? MAP_MODES[mapMode].label || MAP_MODES[mapMode].name : 'Mapas';
  nav.querySelector('[data-sheet="sheet-maps"]').classList.toggle('active', Boolean(mapMode));
  for (const b of nav.querySelectorAll('[data-sheet]')) b.classList.toggle('open', sheets.openId === b.dataset.sheet);
}
selectTool(tool);
showDensity();

// Demanda (RCI) no topo: abre as zonas, onde estão a demanda de cada uma e a
// densidade. No celular, abre o painel "Construir" já nas zonas.
$('btn-zones').onclick = () => {
  if ($('tools').offsetParent) {
    toggleMenu('zonas');
    return;
  }
  sheets.open('sheet-build');
  document.querySelector('#sheet-build [data-build-group="zone"]').previousElementSibling.scrollIntoView({ block: 'start' });
};

function toolCommand() {
  if (!tool.shape || !hover) return null;
  const { width } = state.map;
  // Colocar serviço público: a prévia aparece só passando o mouse.
  if (tool.id === 'revitalizar') return { type: 'revitalize', tile: hover.y * width + hover.x };
  if (tool.shape === 'single') return { type: 'place', building: tool.building, tile: hover.y * width + hover.x };
  if (!drag || drag.kind !== 'tool') return null;
  const { start } = drag;
  const tiles = tool.shape === 'line'
    ? lineTiles(width, start.x, start.y, hover.x, hover.y)
    : rectTiles(width, start.x, start.y, hover.x, hover.y);
  if (tool.id === 'corrida') return { type: 'race', from: start.y * width + start.x, to: hover.y * width + hover.x };
  if (tool.road) return { type: 'road', road: tool.road, tiles };
  if (tool.id === 'bulldoze') return { type: 'bulldoze', tiles };
  if (tool.id === 'bairro') return { type: 'district', tiles };
  if (tool.id === 'parque') return { type: 'park', tiles };
  return usesDensity(tool) ? { type: 'zone', zone: tool.zone, density, tiles } : { type: 'zone', zone: tool.zone, tiles };
}

function currentPreview() {
  const cmd = toolCommand();
  const tooltip = $('tooltip');
  if (!cmd) {
    tooltip.hidden = true;
    return null;
  }
  const plan = planCommand(state, rt, cmd);
  const [sx, sy] = worldToScreen(cam, hover.x + 0.5, hover.y + 0.5);
  tooltip.hidden = false;
  tooltip.style.left = `${sx + 16}px`;
  tooltip.style.top = `${sy - 10}px`;
  if (cmd.type === 'place') {
    tooltip.textContent = plan.reason || `${tool.name} · $${plan.cost.toLocaleString('pt-BR')}`;
    tooltip.style.color = plan.reason ? '#ff8a80' : '';
    return { tiles: plan.tiles, color: plan.reason ? 'rgba(255,80,60,0.5)' : 'rgba(80,220,120,0.5)' };
  }
  if (cmd.type === 'district') {
    tooltip.textContent = plan.reason || `Bairro planejado · ${plan.roads.length} ruas · $${plan.cost.toLocaleString('pt-BR')} (30% mais barato)`;
    tooltip.style.color = plan.reason || plan.cost > state.economy.money ? '#ff8a80' : '';
    return { tiles: plan.reason ? [] : plan.roads, color: 'rgba(255,255,255,0.5)' };
  }
  if (cmd.type === 'race') {
    tooltip.textContent = plan.reason || `Corrida de rua · ${(plan.tiles.length * 0.1).toLocaleString('pt-BR')} km · $${plan.cost.toLocaleString('pt-BR')}`;
    tooltip.style.color = plan.reason ? '#ff8a80' : '';
    return { tiles: plan.tiles, color: tool.color };
  }
  const zoneName = usesDensity(tool) ? `${tool.name} ${DENSITY_INFO[density].name.toLowerCase()} · ` : '';
  tooltip.textContent = `${zoneName}${plan.tiles.length} tiles · $${plan.cost.toLocaleString('pt-BR')}`;
  tooltip.style.color = plan.cost > state.economy.money ? '#ff8a80' : '';
  return { tiles: plan.tiles, color: tool.color };
}

function selectedObjects() {
  if (!selection) return null;
  if (selection.type === 'citizen') return { citizen: rt.citizenById.get(selection.id) };
  return { building: rt.buildingById.get(selection.id) };
}

function pointerPos(e) {
  const rect = canvas.getBoundingClientRect();
  return [e.clientX - rect.left, e.clientY - rect.top];
}

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// Toque: dois dedos movem a câmera e dão zoom (pinça), em qualquer
// ferramenta; um dedo funciona como o mouse.
const touches = new Map(); // pointerId -> [x, y]
let pinch = null; //          { dist, mid } do último quadro com dois dedos

function twoFingers() {
  const [a, b] = [...touches.values()];
  return { dist: Math.max(1, Math.hypot(a[0] - b[0], a[1] - b[1])), mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] };
}

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  const [sx, sy] = pointerPos(e);
  if (e.pointerType === 'touch') {
    touches.set(e.pointerId, [sx, sy]);
    if (touches.size >= 2) {
      // Segundo dedo: cancela o que o primeiro estava fazendo e vira pinça.
      drag = null;
      canvas.classList.remove('panning');
      pinch = twoFingers();
      return;
    }
    // No toque não existe "passar o mouse": o tile é o que está sob o dedo.
    hover = screenToTile(cam, sx, sy);
  }
  if (pinch) return;
  const panButton = e.button === 1 || e.button === 2;
  if (panButton || tool.id === 'inspect') {
    drag = { kind: 'pan', last: [sx, sy], origin: [sx, sy], moved: false, click: !panButton };
  } else if (e.button === 0 && hover) {
    drag = { kind: 'tool', start: hover };
  }
});

canvas.addEventListener('pointermove', (e) => {
  const [sx, sy] = pointerPos(e);
  if (touches.has(e.pointerId)) touches.set(e.pointerId, [sx, sy]);
  if (pinch) {
    if (touches.size >= 2) {
      const now = twoFingers();
      zoomAt(cam, now.dist / pinch.dist, now.mid[0], now.mid[1]);
      panBy(cam, now.mid[0] - pinch.mid[0], now.mid[1] - pinch.mid[1]);
      following = false;
      pinch = now;
    }
    return;
  }
  hover = screenToTile(cam, sx, sy);
  if (drag?.kind === 'pan') {
    if (Math.hypot(sx - drag.origin[0], sy - drag.origin[1]) > 4) drag.moved = true;
    if (drag.moved) {
      panBy(cam, sx - drag.last[0], sy - drag.last[1]);
      following = false;
      canvas.classList.add('panning');
    }
    drag.last = [sx, sy];
  }
});

function endTouch(e) {
  touches.delete(e.pointerId);
  // A pinça só termina quando todos os dedos saem (nada é construído).
  if (pinch) {
    if (touches.size === 0) pinch = null;
    drag = null;
    return true;
  }
  return false;
}
canvas.addEventListener('pointercancel', (e) => {
  endTouch(e);
  drag = null;
});

canvas.addEventListener('pointerup', (e) => {
  const [sx, sy] = pointerPos(e);
  canvas.classList.remove('panning');
  if (endTouch(e)) return;
  if (drag?.kind === 'tool') {
    const cmd = toolCommand();
    if (cmd) {
      const result = applyCommand(state, rt, cmd);
      if (result.ok) {
        dirty = true;
        renderer.invalidate();
        // Corrida marcada: abre a aba Corridas do painel Esporte para ajustar.
        if (cmd.type === 'race') {
          sports.showTab('corridas');
          toggleSports(true);
        }
      }
      else status(result.reason);
    }
  } else if (drag?.kind === 'pan' && drag.click && !drag.moved) {
    pick(sx, sy);
  }
  drag = null;
});

canvas.addEventListener('pointerleave', () => {
  if (!drag) hover = null;
});

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const [sx, sy] = pointerPos(e);
  zoomAt(cam, Math.exp(-e.deltaY * 0.0015), sx, sy);
}, { passive: false });

// Clique com "Inspecionar": cidadão andando perto do cursor, senão o prédio.
function pick(sx, sy) {
  let best = null;
  let bestDist = 12;
  for (const id of rt.movers) {
    const c = rt.citizenById.get(id);
    const pose = moverPose(state, c);
    if (!pose) continue;
    const [cx, cy] = worldToScreen(cam, pose.x, pose.y);
    const d = Math.hypot(cx - sx, cy - 2 * cam.zoom - sy);
    if (d < bestDist) {
      best = c;
      bestDist = d;
    }
  }
  const tile = screenToTile(cam, sx, sy);
  const buildingId = tile ? rt.buildingAt[tile.y * state.map.width + tile.x] : 0;
  if (best) select({ type: 'citizen', id: best.id });
  else if (buildingId) select({ type: 'building', id: buildingId });
  else select(null);
}

function select(next) {
  selection = next;
  following = false;
  updateInspector();
}

function updateInspector() {
  const panel = $('inspector');
  panel.hidden = !selection;
  if (selection) renderInspector($('inspector-body'), selection, state, rt, { following });
}

$('inspector-close').onclick = () => select(null);
$('inspector-body').addEventListener('click', (e) => {
  const target = e.target.closest('button');
  if (!target) return;
  if (target.dataset.citizen) select({ type: 'citizen', id: Number(target.dataset.citizen) });
  else if (target.dataset.building) {
    select({ type: 'building', id: Number(target.dataset.building) });
    const b = rt.buildingById.get(selection.id);
    centerOn(cam, (b.tile % state.map.width) + 0.5, Math.floor(b.tile / state.map.width) + 0.5);
  } else if ('foundClub' in target.dataset) {
    sports.foundAt(selection.id);
    toggleSports(true);
  } else if ('planEvent' in target.dataset) {
    culture.planAt(selection.id);
    toggleCulture(true);
  } else if ('follow' in target.dataset) {
    following = !following;
    updateInspector();
  }
});

// Minimapa: clicar ou arrastar move a câmera.
const minimapCanvas = $('minimap');
function minimapJump(e) {
  const rect = minimapCanvas.getBoundingClientRect();
  const [x, y] = minimap.toWorld(e.clientX - rect.left, e.clientY - rect.top, state);
  centerOn(cam, x, y);
  following = false;
}
minimapCanvas.addEventListener('pointerdown', (e) => {
  minimapCanvas.setPointerCapture(e.pointerId);
  minimapJump(e);
});
minimapCanvas.addEventListener('pointermove', (e) => e.buttons && minimapJump(e));

// ---------------------------------------------------------------------------
// Teclado
// ---------------------------------------------------------------------------

const PAN_KEYS = {
  w: [0, 1], arrowup: [0, 1], s: [0, -1], arrowdown: [0, -1],
  a: [1, 0], arrowleft: [1, 0], d: [-1, 0], arrowright: [-1, 0],
};

window.addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea, dialog')) return;
  const key = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && key === 's') {
    e.preventDefault();
    attempt(() => saves.save());
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (key === ' ') {
    e.preventDefault();
    setSpeed(speed === 0 ? 1 : 0);
  } else if (['1', '2', '3'].includes(key)) {
    setSpeed(Number(key));
  } else if (key === 'escape') {
    drag = null;
    closeMenus();
    select(null);
    for (const panel of cornerPanels()) panel.toggle(false);
  } else if (key === DENSITY_KEY) {
    setDensity((density + 1) % Object.keys(DENSITY_INFO).length);
  } else if (key === 'o') {
    toggleBudget();
  } else if (key === 't') {
    toggleResearch();
  } else if (key === 'z') {
    toggleCulture();
  } else if (PAN_KEYS[key]) {
    e.preventDefault();
    keysDown.add(key);
  } else {
    const t = TOOLS.find((x) => x.key === key);
    const map = Object.keys(MAP_KEYS).find((id) => MAP_KEYS[id] === key);
    if (t) selectTool(t);
    else if (map) toggleMap(map);
  }
});
window.addEventListener('keyup', (e) => keysDown.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => keysDown.clear());

function panWithKeys(dt) {
  if (keysDown.size === 0) return;
  let dx = 0;
  let dy = 0;
  for (const key of keysDown) {
    dx += PAN_KEYS[key][0];
    dy += PAN_KEYS[key][1];
  }
  panBy(cam, dx * KEY_PAN_SPEED * dt, dy * KEY_PAN_SPEED * dt);
  following = false;
}

// ---------------------------------------------------------------------------
// Salvamento
// ---------------------------------------------------------------------------

function handleSaveEvent(event) {
  const time = new Date().toLocaleTimeString('pt-BR');
  if (event.type === 'saved') {
    dirty = false;
    status(`Salvo às ${time}`);
  } else if (event.type === 'autosaved') {
    status(`Salvo automaticamente às ${time}`);
  } else if (event.type === 'error') {
    status(`Erro ao salvar: ${event.error.message}`);
  }
}

function status(text) {
  $('status').textContent = text;
}

/** Roda uma ação de save mostrando o erro, se houver. */
async function attempt(action) {
  try {
    return await action();
  } catch (error) {
    console.error(error);
    status(`Erro: ${error.message}`);
    alert(error.message);
  }
}

function confirmDiscard() {
  return !dirty || confirm('Há mudanças não salvas. Continuar mesmo assim?');
}

function adopt({ state: loaded, meta }) {
  setWorld(loaded);
  toolsKey = '';
  status(`Carregado: ${meta.name}`);
}

// Nova cidade: nome e marco inicial (como escolher o ano no SimCity 2000).
$('new-marcos').innerHTML = MARCOS.map((m, i) => {
  const ready = TECHS.filter((t) => t.order < m.from).length;
  return `<label><input type="radio" name="marco" value="${m.id}"${i === 0 ? ' checked' : ''}>
    <span>${m.id}. ${m.name}<br><small>${i === 0 ? 'só o básico' : `${ready} tecnologias já prontas`}</small></span></label>`;
}).join('');
$('btn-new').onclick = () => {
  if (!confirmDiscard()) return;
  $('new-name').value = 'Nova Cidade';
  $('new-dialog').showModal();
};
$('new-dialog').addEventListener('close', () => {
  if ($('new-dialog').returnValue !== 'ok') return;
  const name = $('new-name').value.trim() || 'Nova Cidade';
  const marco = Number(new FormData($('new-form')).get('marco')) || 1;
  newCity(name, marco);
  toolsKey = '';
  refreshTools();
  status(`Cidade fundada no marco ${marco}.`);
});

$('btn-save').onclick = () => attempt(() => saves.save());

$('btn-save-as').onclick = () => attempt(async () => {
  const name = prompt('Salvar como (nome da cidade):', state.city.name);
  if (!name) return;
  state.city.name = name.trim();
  await saves.saveAs();
});

$('btn-load').onclick = () => attempt(async () => {
  const list = $('save-list');
  list.replaceChildren();
  const metas = await saves.list();
  if (metas.length === 0) list.innerHTML = '<li class="muted">Nenhum save ainda.</li>';

  for (const meta of metas) {
    const li = document.createElement('li');
    const info = document.createElement('div');
    info.className = 'info';
    const { population = 0, date = {} } = meta.summary || {};
    info.innerHTML = '<strong></strong><small></small>';
    info.querySelector('strong').textContent = meta.name + (meta.autosave ? ' (automático)' : '');
    info.querySelector('small').textContent =
      `${date.day}/${date.month}, ano ${date.year} · ${population.toLocaleString('pt-BR')} hab. · ` +
      new Date(meta.updatedAt).toLocaleString('pt-BR');

    const load = document.createElement('button');
    load.textContent = 'Carregar';
    load.onclick = () => attempt(async () => {
      if (!confirmDiscard()) return;
      adopt(await saves.load(meta.id));
      $('load-dialog').close();
    });

    const remove = document.createElement('button');
    remove.textContent = 'Apagar';
    remove.onclick = () => attempt(async () => {
      if (!confirm(`Apagar "${meta.name}"?`)) return;
      await saves.remove(meta.id);
      li.remove();
    });

    li.append(info, load, remove);
    list.append(li);
  }
  $('load-dialog').showModal();
});

$('btn-export').onclick = () => attempt(() => {
  const meta = saves.exportFile();
  status(`Exportado: ${meta.id}.jogo.json`);
});

$('btn-import').onclick = () => {
  if (confirmDiscard()) $('file-input').click();
};
$('file-input').onchange = (e) => attempt(async () => {
  const file = e.target.files[0];
  e.target.value = '';
  if (file) adopt(await saves.importFile(file));
});

$('btn-code').onclick = () => {
  $('code-text').value = saves.exportCode();
  $('code-dialog').showModal();
};
$('btn-code-copy').onclick = () => attempt(async () => {
  await navigator.clipboard.writeText($('code-text').value);
  status('Código copiado.');
});
$('btn-code-load').onclick = () => attempt(() => {
  if (!confirmDiscard()) return;
  adopt(saves.importCode($('code-text').value));
  $('code-dialog').close();
});

// Ao esconder/fechar a aba: grava um save automático e avisa se há mudanças.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') saves.save({ autosave: true }).catch(() => {});
});
window.addEventListener('beforeunload', (e) => {
  if (dirty) e.preventDefault();
});
