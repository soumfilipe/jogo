import { createNewState, placeTile, stepDay, TILE, TILE_INFO } from './game/state.js';
import { SaveManager } from './save/SaveManager.js';
import { detectBackend } from './save/backends.js';

const TILE_SIZE = 10;
const MS_PER_DAY = 250;
const AUTOSAVE_MS = 60_000;

const $ = (id) => document.getElementById(id);
const canvas = $('map');
const ctx = canvas.getContext('2d');

let state = createNewState();
let tool = TILE.ROAD;
let paused = false;
let dirty = false; // há mudanças desde o último save manual?

const saves = new SaveManager({
  backend: await detectBackend(),
  getState: () => state,
  onEvent: handleSaveEvent,
});
saves.startNew(state.city.name);
saves.startAutosave(AUTOSAVE_MS);
$('storage-mode').textContent = `Saves: ${saves.backend.label}`;

// ---------------------------------------------------------------------------
// Jogo
// ---------------------------------------------------------------------------

function setState(next) {
  state = next;
  canvas.width = state.map.width * TILE_SIZE;
  canvas.height = state.map.height * TILE_SIZE;
  dirty = false;
  render();
}

function render() {
  const { width, height, tiles } = state.map;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      ctx.fillStyle = TILE_INFO[tiles[y * width + x]].color;
      ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    }
  }
  ctx.strokeStyle = 'rgb(0 0 0 / .08)';
  ctx.beginPath();
  for (let x = 0; x <= width; x++) ctx.moveTo(x * TILE_SIZE + 0.5, 0), ctx.lineTo(x * TILE_SIZE + 0.5, canvas.height);
  for (let y = 0; y <= height; y++) ctx.moveTo(0, y * TILE_SIZE + 0.5), ctx.lineTo(canvas.width, y * TILE_SIZE + 0.5);
  ctx.stroke();
  renderHud();
}

function renderHud() {
  const { time, economy, stats, city } = state;
  $('city-name').textContent = city.name + (dirty ? ' *' : '');
  $('date').textContent = `Ano ${time.year}, mês ${time.month}, dia ${time.day}`;
  $('population').textContent = stats.population.toLocaleString('pt-BR');
  $('money').textContent = `$${economy.money.toLocaleString('pt-BR')}`;
  $('btn-pause').textContent = paused ? '▶' : '⏸';
}

setInterval(() => {
  if (paused) return;
  stepDay(state);
  state.playTimeSeconds += MS_PER_DAY / 1000;
  renderHud();
}, MS_PER_DAY);

// Ferramentas
for (const [type, info] of Object.entries(TILE_INFO)) {
  const button = document.createElement('button');
  button.innerHTML = `<span class="swatch" style="background:${info.color}"></span>${info.name} ($${info.cost})`;
  button.dataset.tool = type;
  button.onclick = () => selectTool(Number(type));
  $('tools').append(button);
}
function selectTool(type) {
  tool = type;
  for (const b of $('tools').children) b.classList.toggle('active', Number(b.dataset.tool) === type);
}
selectTool(tool);

// Pintar no mapa (clicar e arrastar)
let painting = false;
function paintAt(event) {
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor(((event.clientX - rect.left) / rect.width) * state.map.width);
  const y = Math.floor(((event.clientY - rect.top) / rect.height) * state.map.height);
  if (placeTile(state, x, y, tool)) {
    dirty = true;
    render();
  }
}
canvas.addEventListener('pointerdown', (e) => { painting = true; paintAt(e); });
canvas.addEventListener('pointermove', (e) => painting && paintAt(e));
window.addEventListener('pointerup', () => { painting = false; });

$('btn-pause').onclick = () => { paused = !paused; renderHud(); };

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
  renderHud();
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
  setState(loaded);
  status(`Carregado: ${meta.name}`);
}

$('btn-new').onclick = () => {
  if (!confirmDiscard()) return;
  const name = prompt('Nome da cidade:', 'Nova Cidade');
  if (!name) return;
  setState(createNewState({ name: name.trim() }));
  saves.startNew(state.city.name);
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
    info.innerHTML = `<strong></strong><small></small>`;
    info.querySelector('strong').textContent = meta.name + (meta.autosave ? ' (automático)' : '');
    info.querySelector('small').textContent =
      `Ano ${date.year}, mês ${date.month} · ${population.toLocaleString('pt-BR')} hab. · ` +
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

window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    attempt(() => saves.save());
  } else if (e.key === ' ' && e.target === document.body) {
    e.preventDefault();
    paused = !paused;
    renderHud();
  }
});

// Ao fechar a aba: grava um save automático e avisa se há mudanças não salvas.
window.addEventListener('beforeunload', (e) => {
  saves.save({ autosave: true, keepalive: true }).catch(() => {});
  if (dirty) e.preventDefault();
});

setState(state);
