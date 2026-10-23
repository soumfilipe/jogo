import { createWorld } from './world/world.js';
import { BUILDINGS, ZONE, ZONE_INFO } from './world/catalog.js';
import { applyCommand, lineTiles, planCommand, rectTiles } from './world/commands.js';
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
  // Serviços públicos: um clique coloca (precisa encostar numa rua).
  ...[
    ['usina_carvao', 'Carvão', '#5f5d58'], ['usina_solar', 'Solar', '#3d5c9e'],
    ['bomba_agua', 'Bomba', '#4f97c4'], ['poco', 'Poço', '#9fc3e0'],
  ].map(([building, label, swatch], i) => ({
    id: `place-${building}`, name: BUILDINGS[building].name, label, shape: 'single', building, swatch,
    separatorBefore: i === 0,
  })),
];

let state;
let rt;
let cam;
let speed = 1;
let tool = TOOLS[1];
let dirty = false; // mudanças desde o último save manual
let hover = null;
let drag = null; //   { kind: 'tool' | 'pan', start, last, moved }
let selection = null; // { type: 'building' | 'citizen', id }
let mapMode = null; //   chave de MAP_MODES (valor do terreno, poluição) ou null
let following = false;
const keysDown = new Set();

const renderer = new Renderer(canvas);
const minimap = new Minimap($('minimap'));

const saves = new SaveManager({
  backend: await detectBackend(),
  getState: () => state,
  onEvent: handleSaveEvent,
});
$('storage-mode').textContent = `Saves: ${saves.backend.label}`;

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

function newCity(name) {
  setWorld(createWorld({ name }));
  saves.startNew(state.city.name);
}

newCity('Nova Cidade');
saves.startAutosave(AUTOSAVE_MS);

startLoop({
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
  renderer,
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
}

function renderHud() {
  const s = rt.stats;
  $('city-name').textContent = state.city.name + (dirty ? ' *' : '');
  $('date').textContent = formatDate(state.time.tick);
  $('population').textContent = s.population.toLocaleString('pt-BR');
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
}
function utilityTitle(id) {
  const u = BUILDINGS[id].utility;
  const makes = u.power ? `${u.power.toLocaleString('pt-BR')} de energia` : `${u.water.toLocaleString('pt-BR')} de água`;
  const notes = [u.pollution ? 'polui' : null, u.needsWater ? 'na beira de rio ou lago' : null].filter(Boolean);
  return `Produz ${makes} · $${u.cost.toLocaleString('pt-BR')} + $${u.upkeep}/mês${notes.length ? ' · ' + notes.join(', ') : ''}`;
}
function selectTool(t) {
  tool = t;
  drag = null;
  for (const b of $('tools').querySelectorAll('[data-tool]')) b.classList.toggle('active', b.dataset.tool === t.id);
}
selectTool(tool);

// Mapas: botões que ligam/desligam a sobreposição de valor do terreno e poluição.
const MAP_KEYS = { valor: 'l', poluicao: 'p', energia: 'n', agua: 'h' };
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
  mapMode = mapMode === id ? null : id;
  for (const b of $('tools').querySelectorAll('[data-map]')) b.classList.toggle('active', b.dataset.map === mapMode);
}

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
  return { type: 'zone', zone: tool.zone, tiles };
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
  tooltip.textContent = `${plan.tiles.length} tiles · $${plan.cost.toLocaleString('pt-BR')}`;
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

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  const [sx, sy] = pointerPos(e);
  const panButton = e.button === 1 || e.button === 2;
  if (panButton || tool.id === 'inspect') {
    drag = { kind: 'pan', last: [sx, sy], origin: [sx, sy], moved: false, click: !panButton };
  } else if (e.button === 0 && hover) {
    drag = { kind: 'tool', start: hover };
  }
});

canvas.addEventListener('pointermove', (e) => {
  const [sx, sy] = pointerPos(e);
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

canvas.addEventListener('pointerup', (e) => {
  const [sx, sy] = pointerPos(e);
  canvas.classList.remove('panning');
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
  status(`Carregado: ${meta.name}`);
}

$('btn-new').onclick = () => {
  if (!confirmDiscard()) return;
  const name = prompt('Nome da cidade:', 'Nova Cidade');
  if (name) newCity(name.trim());
};

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
