// Painel de pesquisa: marco do mundo, institutos, e por área a verba, os
// pontos por mês e a tecnologia em que eles estão sendo gastos (automática ou
// escolhida pelo jogador). As ações passam por applyCommand, como no orçamento.

import { RESEARCH } from '../world/catalog.js';
import { AREAS, AREA_IDS, TECHS, TECH_BY_ID, marcoAt } from '../world/techs.js';
import {
  autoTarget, effectiveCost, isAvailable, progress, researchOutput, target, worldKnows, worldMarco,
} from '../systems/research.js';

// Cor de cada área (as mesmas da árvore em docs/arvore-tecnologica.html).
export const AREA_COLORS = {
  educacao: '#f06595', cultura: '#94d82d', social: '#9775fa', seguranca: '#ff6b6b',
  quimica: '#ff8a4c', abastecimento: '#748ffc', engenharia: '#c9a57f', energia: '#fcc419',
  computacao: '#4dabf7', saude: '#51cf66', ambiental: '#3bc9db',
};

const money = (v) => `$${Math.round(v).toLocaleString('pt-BR')}`;
const num = (v) => (Math.round(v * 10) / 10).toLocaleString('pt-BR');

export class ResearchPanel {
  /** `act(cmd)` aplica um comando de pesquisa e devolve o resultado. */
  constructor(el, { act }) {
    this.el = el;
    this.act = act;
    this.optionsKey = {};
    this.#build();
  }

  get open() {
    return !this.el.hidden;
  }

  toggle(force) {
    this.el.hidden = force === undefined ? !this.el.hidden : !force;
    this.optionsKey = {};
  }

  #build() {
    this.el.innerHTML = `
      <button class="close" data-close title="Fechar">×</button>
      <h3>Pesquisa</h3>
      <div class="world">
        <div class="world-head"><span>Mundo: <b data-marco></b></span><small data-next></small></div>
        <div class="meter"><i data-world-bar></i></div>
      </div>
      <p class="small" data-institutes></p>
      <p class="small muted" data-count></p>

      <h4>Áreas</h4>
      <p class="muted small">A verba vai para os institutos e rende com retorno decrescente
        (4× a verba, 2× os pontos). Prédios que atuam na área, como as usinas na energia,
        pesquisam ${Math.round(1 / RESEARCH.fieldShare)}× mais devagar.</p>
      <div class="areas">${AREA_IDS.map((a) => `
        <section class="area" data-area="${a}" style="--area:${AREA_COLORS[a]}">
          <header><span class="dot"></span><b>${AREAS[a]}</b><small data-rate></small></header>
          <label class="funding">
            <span>Verba</span>
            <input type="range" min="0" max="${RESEARCH.fundingMax}" step="${RESEARCH.fundingStep}" data-funding="${a}">
            <b data-funding-value></b>
          </label>
          <label class="goal">
            <span>Alvo</span>
            <select data-priority="${a}"></select>
          </label>
          <div class="meter"><i data-bar></i></div>
          <small class="muted" data-eta></small>
        </section>`).join('')}
      </div>

      <h4>Concluídas recentemente</h4>
      <ul class="recent" data-recent></ul>
      <p class="budget-error" data-error hidden></p>`;

    this.el.addEventListener('input', (e) => {
      const area = e.target.dataset.funding;
      if (area) this.#run({ type: 'funding', area, amount: Number(e.target.value) });
    });
    this.el.addEventListener('change', (e) => {
      const area = e.target.dataset.priority;
      if (area) this.#run({ type: 'priority', area, tech: e.target.value || null });
    });
    this.el.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) this.toggle(false);
    });
  }

  #run(cmd) {
    const result = this.act(cmd);
    const error = this.el.querySelector('[data-error]');
    error.hidden = result.ok;
    if (!result.ok) error.textContent = result.reason;
    this.optionsKey = {};
    this.render(this.state, this.rt);
  }

  render(state, rt) {
    if (!this.open) return;
    this.state = state;
    this.rt = rt;
    const q = (sel, root = this.el) => root.querySelector(sel);
    const research = state.research;

    const { marco, next, progress: worldProgress } = worldMarco(state);
    q('[data-marco]').textContent = `marco ${marco.id} · ${marco.name}`;
    q('[data-next]').textContent = next ? `próximo: ${next.name}` : 'último marco';
    q('[data-world-bar]').style.width = `${Math.round(worldProgress * 100)}%`;

    const out = researchOutput(state, rt);
    q('[data-institutes]').innerHTML = out.institutes
      ? `${out.institutes} instituto${out.institutes > 1 ? 's' : ''} · ${out.researchers} de ${out.jobs} pesquisadores · verba ${money(out.fundingCost)}/mês`
      : '<span class="warn">Sem instituto de pesquisa: a verba não rende. Construa um no menu Construir.</span>';
    const done = new Set(research.done);
    const available = TECHS.filter((t) => isAvailable(rt, t)).length;
    q('[data-count]').textContent = `${done.size} de ${TECHS.length} tecnologias · ${available} disponíveis para pesquisar`;

    for (const a of AREA_IDS) {
      const box = q(`[data-area="${a}"]`);
      const slider = q('[data-funding]', box);
      if (document.activeElement !== slider) slider.value = research.funding[a];
      q('[data-funding-value]', box).textContent = money(research.funding[a]);
      const rate = out.byArea[a];
      q('[data-rate]', box).textContent = `${num(rate)} pts/mês · ${num(research.points[a])} juntados`;
      this.#options(state, rt, a, q('[data-priority]', box));

      const goal = target(state, rt, a);
      q('[data-bar]', box).style.width = goal ? `${Math.round(Math.min(1, progress(state, goal)) * 100)}%` : '0';
      q('[data-eta]', box).textContent = goal ? eta(state, goal, out.byArea) : idle(rt, a);
    }

    const recent = research.done.filter((id) => !TECH_BY_ID.get(id).start).slice(-5).reverse();
    q('[data-recent]').innerHTML = recent.length
      ? recent.map((id) => {
        const t = TECH_BY_ID.get(id);
        return `<li><b>${esc(t.name)}</b><small>${esc(t.mechanic)}</small></li>`;
      }).join('')
      : '<li class="muted">Nenhuma ainda.</li>';
  }

  // Opções do alvo: automático + as disponíveis da área. Só refaz quando muda.
  #options(state, rt, area, select) {
    const auto = autoTarget(state, rt, area);
    const chosen = state.research.priority[area];
    const list = TECHS.filter((t) => t.area === area && isAvailable(rt, t));
    const key = `${chosen}|${auto?.id}|${list.map((t) => t.id + worldKnows(state, t)).join()}`;
    if (this.optionsKey[area] === key || document.activeElement === select) return;
    this.optionsKey[area] = key;
    select.innerHTML = `<option value="">Automático${auto ? `: ${esc(auto.name)}` : ''}</option>` +
      list.map((t) => `<option value="${t.id}"${t.id === chosen ? ' selected' : ''}>${esc(t.name)} · ${costText(state, t)}</option>`).join('');
  }
}

// Sem alvo: ou falta um requisito de outra área, ou o resto chega numa próxima versão.
function idle(rt, area) {
  const left = TECHS.filter((t) => t.area === area && !rt.techDone.has(t.id));
  if (left.length === 0) return 'Todas as tecnologias desta área foram concluídas.';
  // Alguma desta área dá para alcançar nesta versão (os requisitos existem ou já vieram)?
  const reachable = left.some((t) => t.ready && t.requires.every((r) => rt.techDone.has(r) || TECH_BY_ID.get(r).ready));
  const blocked = reachable;
  return blocked
    ? 'As próximas desta área dependem de tecnologias de outras áreas.'
    : 'As próximas tecnologias desta área chegam numa próxima versão do jogo.';
}

function costText(state, tech) {
  const cost = effectiveCost(state, tech);
  const parts = Object.entries(cost).map(([a, v]) => `${v} ${AREAS[a].split(' ')[0].toLowerCase()}`);
  return parts.join(' + ') + (worldKnows(state, tech) ? '' : ' (pioneira)');
}

/** "Faltam ~N meses" pela área mais lenta, ou o que está faltando. */
function eta(state, tech, rates) {
  const cost = effectiveCost(state, tech);
  let months = 0;
  for (const [a, v] of Object.entries(cost)) {
    const missing = v - state.research.points[a];
    if (missing <= 0) continue;
    if (rates[a] <= 0) return `${tech.name}: falta pesquisa em ${AREAS[a]}. ${pioneer(state, tech)}`;
    months = Math.max(months, Math.ceil(missing / rates[a]));
  }
  const when = months === 0 ? 'concluída no fim do mês' : `faltam ~${months} ${months === 1 ? 'mês' : 'meses'}`;
  return `${tech.name}: ${when}. ${pioneer(state, tech)}`;
}

function pioneer(state, tech) {
  if (worldKnows(state, tech)) return '';
  const years = Math.ceil((tech.order - state.research.world) / RESEARCH.worldPace);
  const marco = marcoAt(tech.order);
  const when = marco.id === marcoAt(state.research.world).id ? '' : ` (marco ${marco.id})`;
  return `Pioneira (custo ${RESEARCH.pioneerMultiplier}×): o mundo chega a ela em ~${years} ${years === 1 ? 'ano' : 'anos'}${when}.`;
}

function esc(text) {
  return String(text).replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}
