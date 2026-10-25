import { createWorld } from './world/world.js';
import { BUILDINGS, DENSITY, DENSITY_INFO, EDUCATION, ZONE, ZONE_INFO } from './world/catalog.js';
import { radiusOf, seatsOf } from './systems/education.js';
import { applyCommand, costs, lineTiles, planCommand, rectTiles } from './world/commands.js';
import { BUILDING_TECH, MARCOS, TECHS, TECH_BY_ID } from './world/techs.js';
import { isUnlocked, utilityCost, utilityOutput, utilityUpkeep } from './systems/mods.js';
import { advance, prepare, tick } from './systems/simulation.js';
import { startLoop } from './core/loop.js';
import { formatDate } from './core/time.js';
import { MAP_MODES, Renderer } from './render/renderer.js';
import { moverPose } from './render/movers.js';
import { Minimap } from './render/minimap.js';
import {
  centerOn, createCamera, panBy, screenToTile, worldToScreen, zoomAt,
} from './render/camera.js';
import { renderInspector } from './ui/inspector.js';
import { BudgetPanel } from './ui/budget.js';
import { ResearchPanel } from './ui/research.js';
import { Sheets } from './ui/sheets.js';
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
  { id: 'road', name: 'Estrada', key: 'e', shape: 'line', color: 'rgba(255,255,255,0.35)' },
  ...[ZONE.RESIDENTIAL, ZONE.COMMERCIAL, ZONE.INDUSTRIAL].map((zone) => ({
    id: `zone-${zone}`, name: ZONE_INFO[zone].name, key: ZONE_INFO[zone].key,
    shape: 'rect', zone, color: ZONE_INFO[zone].color + '88', swatch: ZONE_INFO[zone].color,
  })),
  { id: 'bulldoze', name: 'Demolir', key: 'b', shape: 'rect', color: 'rgba(255,80,60,0.45)' },
  // Prédios do jogador: um clique coloca (precisa encostar numa rua). Os que
  // dependem de pesquisa ficam escondidos (no celular, com cadeado) até liberar.
  ...[
    ['usina_carvao', 'Carvão', '#5f5d58', 'utility'], ['usina_gas', 'Gás', '#8d949b', 'utility'],
    ['hidreletrica', 'Hidrelétrica', '#4a88b4', 'utility'], ['usina_eolica', 'Eólica', '#dfe2e5', 'utility'],
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
  ].map(([building, label, swatch, group], i) => ({
    id: `place-${building}`, name: BUILDINGS[building].name, label, shape: 'single', building, swatch, group,
    separatorBefore: i === 0,
  })),
];

/** Preço mostrado nos botões do painel "Construir" (celular). */
function toolCost(t) {
  if (t.building) return `$${utilityCost(rt, t.building).toLocaleString('pt-BR')}`;
  const c = costs(rt);
  if (t.id === 'road') return `$${round(c.road)}/tile`;
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
let hover = null;
let drag = null; //   { kind: 'tool' | 'pan', start, last, moved }
let selection = null; // { type: 'building' | 'citizen', id }
let mapMode = null; //   chave de MAP_MODES (valor do terreno, poluição) ou null
let following = false;
const keysDown = new Set();

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
  refreshTools();
  announceResearch();
}

function renderHud() {
  const s = rt.stats;
  $('city-name').textContent = state.city.name + (dirty ? ' *' : '');
  $('date').textContent = formatDate(state.time.tick);
  $('population').textContent = s.population.toLocaleString('pt-BR');
  let kids = 0;
  for (const c of state.citizens) if (c.age < 18) kids++;
  $('population').parentElement.title = `População: ${(s.population - kids).toLocaleString('pt-BR')} adultos e ${kids.toLocaleString('pt-BR')} crianças e jovens`;
  $('employment').textContent = `${s.employed.toLocaleString('pt-BR')} / ${s.unemployed.toLocaleString('pt-BR')}`;
  $('money').textContent = `$${state.economy.money.toLocaleString('pt-BR')}`;
  for (const [id, value] of [['demand-r', rt.demand.residential], ['demand-c', rt.demand.commercial], ['demand-i', rt.demand.industrial]]) {
    const bar = $(id).firstElementChild;
    const pct = Math.min(50, Math.abs(value) * 2);
    bar.style.height = `${pct}%`;
    bar.style.bottom = value >= 0 ? '50%' : `${50 - pct}%`;
    bar.style.opacity = value >= 0 ? '1' : '0.45';
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

for (const t of TOOLS) {
  if (t.separatorBefore) {
    const sep = document.createElement('span');
    sep.className = 'separator';
    $('tools').append(sep);
  }
  const button = document.createElement('button');
  const swatch = t.swatch ? `<span class="swatch" style="background:${t.swatch}"></span>` : '';
  const key = t.key ? `<kbd>${t.key.toUpperCase()}</kbd>` : '';
  button.innerHTML = `${swatch}${t.label || t.name}${key}`;
  if (t.building) button.title = `${t.name}: ${utilityTitle(t.building)}`;
  button.dataset.tool = t.id;
  button.onclick = () => selectTool(t);
  $('tools').append(button);
  if (t.zone === ZONE.INDUSTRIAL) $('tools').append(densityButtons('density'));
}

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
  const notes = [u.pollution ? 'polui' : null, u.needsWater ? 'na beira de rio ou lago' : null].filter(Boolean);
  const text = `${makes.join(', ')} · $${fmt(utilityCost(rt, id))} + $${fmt(utilityUpkeep(rt, id))}/mês`;
  return text.charAt(0).toUpperCase() + text.slice(1) + (notes.length ? ' · ' + notes.join(', ') : '');
}

/** Tecnologia que falta para um prédio, em texto curto ("Usina solar, marco 4"). */
function lockText(building) {
  const tech = TECH_BY_ID.get(BUILDING_TECH[building]);
  return `${tech.name} · marco ${tech.marco}`;
}

// Liberações e preços mudam com a pesquisa: atualiza os botões.
let toolsKey = '';
function refreshTools() {
  const key = `${state.research.done.length}|${[...rt.mods.keys()].join()}|${[...rt.unlocked].join()}`;
  if (key === toolsKey) return;
  toolsKey = key;
  for (const t of TOOLS) {
    const buttons = document.querySelectorAll(`[data-tool="${t.id}"]`);
    const locked = t.building && !isUnlocked(rt, t.building);
    for (const button of buttons) {
      const mobile = button.closest('.sheet');
      if (!mobile) {
        button.hidden = Boolean(locked);
        if (t.building) button.title = `${t.name}: ${utilityTitle(t.building)}`;
        continue;
      }
      button.disabled = Boolean(locked);
      button.querySelector('small').textContent = locked ? `🔒 ${lockText(t.building)}` : toolCost(t);
    }
  }
  if (tool.building && !isUnlocked(rt, tool.building)) selectTool(TOOLS[0]);
}

function selectTool(t) {
  tool = t;
  drag = null;
  for (const b of document.querySelectorAll('[data-tool]')) b.classList.toggle('active', b.dataset.tool === t.id);
  updateMobileNav();
}
selectTool(tool);
document.querySelector('[data-build-group="density"]')?.append(...densityButtons('').children);
showDensity();

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

// Pesquisa: painel aberto pelo botão 🔬 no topo ou pela tecla T. Ocupa o
// mesmo canto do orçamento, então abrir um fecha o outro.
const research = new ResearchPanel($('research'), {
  act: (cmd) => {
    const result = applyCommand(state, rt, cmd);
    if (result.ok) dirty = true;
    return result;
  },
});
$('btn-research').onclick = () => toggleResearch();

function toggleBudget(force) {
  budget.toggle(force);
  if (budget.open) research.toggle(false);
  budget.render(state, rt);
}
function toggleResearch(force) {
  research.toggle(force);
  if (research.open) budget.toggle(false);
  research.render(state, rt);
}

// Aviso de tecnologia concluída (a simulação deixa os ids em rt.researchEvents).
let toastTimer = null;
function announceResearch() {
  const events = rt.researchEvents;
  if (!events?.length) return;
  rt.researchEvents = [];
  const names = events.map((id) => TECH_BY_ID.get(id));
  const toast = $('toast');
  toast.innerHTML = names.map((t) => `<b>🔬 ${escapeHtml(t.name)}</b><span>${escapeHtml(t.mechanic)}</span>`).join('');
  toast.hidden = false;
  status(`Nova tecnologia: ${names.map((t) => t.name).join(', ')}`);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 6000);
}
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

// Mapas: botões que ligam/desligam a sobreposição de valor do terreno e poluição.
const MAP_KEYS = { valor: 'l', poluicao: 'p', energia: 'n', agua: 'h', escolas: 'u' };
const separator = document.createElement('span');
separator.className = 'separator';
$('tools').append(separator);
for (const [id, mode] of Object.entries(MAP_MODES)) {
  const button = document.createElement('button');
  button.innerHTML = `${mode.label || mode.name}${MAP_KEYS[id] ? `<kbd>${MAP_KEYS[id].toUpperCase()}</kbd>` : ''}`;
  button.title = `Mapa: ${mode.name}`;
  button.dataset.map = id;
  button.onclick = () => toggleMap(id);
  $('tools').append(button);
}
function toggleMap(id) {
  setMap(mapMode === id ? null : id);
}
function setMap(id) {
  mapMode = id;
  for (const b of document.querySelectorAll('[data-map]')) b.classList.toggle('active', (b.dataset.map || null) === mapMode);
  updateMobileNav();
}

// --- Celular: barra inferior e painéis que sobem de baixo -------------------

for (const t of TOOLS) {
  if (t.id === 'inspect') continue;
  const button = document.createElement('button');
  button.dataset.tool = t.id;
  button.innerHTML = `<span class="swatch" style="background:${t.swatch || t.color}"></span>
    <span>${t.label || t.name}</span><small>${toolCost(t)}</small>`;
  button.onclick = () => {
    selectTool(t);
    sheets.close();
  };
  document.querySelector(`[data-build-group="${t.group ?? 'ground'}"]`).append(button);
}

for (const [id, mode] of [[null, { name: 'Nenhum' }], ...Object.entries(MAP_MODES)]) {
  const button = document.createElement('button');
  button.dataset.map = id ?? '';
  button.textContent = mode.name;
  button.onclick = () => {
    setMap(id);
    sheets.close();
  };
  document.querySelector('[data-maps]').append(button);
}

for (const button of document.querySelectorAll('[data-click]')) {
  // Os botões do painel "Arquivo" fazem o mesmo que os da barra de baixo do computador.
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
    }
  };
}
sheets.onChange = () => updateMobileNav();

// Destaca o botão ativo e mostra a ferramenta/mapa escolhidos nos rótulos.
function updateMobileNav() {
  const nav = $('mobile-nav');
  if (!nav) return;
  const building = tool.id !== 'inspect';
  nav.querySelector('[data-mobile="inspect"]').classList.toggle('active', !building);
  nav.querySelector('[data-sheet="sheet-build"]').classList.toggle('active', building);
  nav.querySelector('[data-build-label]').textContent = building ? (tool.label || tool.name) : 'Construir';
  nav.querySelector('[data-maps-label]').textContent = mapMode ? MAP_MODES[mapMode].label || MAP_MODES[mapMode].name : 'Mapas';
  nav.querySelector('[data-sheet="sheet-maps"]').classList.toggle('active', Boolean(mapMode));
  for (const b of nav.querySelectorAll('[data-sheet]')) b.classList.toggle('open', sheets.openId === b.dataset.sheet);
}
updateMobileNav();

function toolCommand() {
  if (!tool.shape || !hover) return null;
  const { width } = state.map;
  // Colocar serviço público: a prévia aparece só passando o mouse.
  if (tool.shape === 'single') return { type: 'place', building: tool.building, tile: hover.y * width + hover.x };
  if (!drag || drag.kind !== 'tool') return null;
  const { start } = drag;
  const tiles = tool.shape === 'line'
    ? lineTiles(width, start.x, start.y, hover.x, hover.y)
    : rectTiles(width, start.x, start.y, hover.x, hover.y);
  if (tool.id === 'road') return { type: 'road', tiles };
  if (tool.id === 'bulldoze') return { type: 'bulldoze', tiles };
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
    select(null);
    budget.toggle(false);
    research.toggle(false);
  } else if (key === DENSITY_KEY) {
    setDensity((density + 1) % Object.keys(DENSITY_INFO).length);
  } else if (key === 'o') {
    toggleBudget();
  } else if (key === 't') {
    toggleResearch();
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
