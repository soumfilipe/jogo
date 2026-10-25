// Painel de orçamento: impostos por zona, receitas e despesas do mês,
// histórico (gráfico + tabela) e empréstimos. Todas as ações passam por
// applyCommand, como as ferramentas do mapa.

import { ECONOMY, TAX_ZONES } from '../world/catalog.js';
import { loanOffers, loanPayment, loanRate, monthlyBudget } from '../systems/economy.js';
import { POLICIES, policyCost, policyUnlocked } from '../systems/policies.js';
import { calendar } from '../core/time.js';

const ZONE_NAMES = { residential: 'Residencial', commercial: 'Comercial', industrial: 'Industrial', rural: 'Rural' };
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const CHART_MONTHS = 24;
const money = (v) => `${v < 0 ? '−' : ''}$${Math.abs(Math.round(v)).toLocaleString('pt-BR')}`;

export class BudgetPanel {
  /** `act(cmd)` aplica um comando do orçamento e devolve o resultado. */
  constructor(el, { act }) {
    this.el = el;
    this.act = act;
    this.historyKey = '';
    this.#build();
  }

  get open() {
    return !this.el.hidden;
  }

  toggle(force) {
    this.el.hidden = force === undefined ? !this.el.hidden : !force;
    this.historyKey = '';
  }

  #build() {
    this.el.innerHTML = `
      <button class="close" data-close title="Fechar">×</button>
      <h3>Orçamento</h3>
      <p class="budget-cash"><span data-money></span><small data-forecast></small></p>

      <h4>Impostos</h4>
      <div class="taxes">${TAX_ZONES.map((zone) => `
        <label class="tax-row">
          <span>${ZONE_NAMES[zone]}</span>
          <input type="range" min="${ECONOMY.taxMin}" max="${ECONOMY.taxMax}" step="1" data-tax="${zone}">
          <b data-tax-value="${zone}"></b>
          <small data-tax-income="${zone}"></small>
        </label>`).join('')}
      </div>
      <p class="muted small">Acima de ${ECONOMY.taxDefault}% a zona perde demanda; abaixo, ganha.</p>

      <h4>Este mês (previsão)</h4>
      <dl class="budget-lines">
        <dt>Impostos</dt><dd data-line="income"></dd>
        <dt data-statal>Estatais</dt><dd data-statal data-line="statal"></dd>
        <dt data-fares>Passagens</dt><dd data-fares data-line="fares"></dd>
        <dt data-food-export>Exportação de alimentos</dt><dd data-food-export data-line="food-export"></dd>
        <dt>Manutenção das ruas</dt><dd data-line="roads"></dd>
        <dt>Serviços públicos</dt><dd data-line="utilities"></dd>
        <dt>Pesquisa</dt><dd data-line="research"></dd>
        <dt>Leis e políticas</dt><dd data-line="policies"></dd>
        <dt data-food-import>Alimentos importados</dt><dd data-food-import data-line="food-import"></dd>
        <dt>Parcelas de empréstimos</dt><dd data-line="loans"></dd>
        <dt class="total">Saldo do mês</dt><dd class="total" data-line="net"></dd>
      </dl>

      <h4>Últimos meses</h4>
      <div class="chart" data-chart></div>

      <h4>Empréstimos</h4>
      <ul class="loans" data-loans></ul>
      <div class="loan-offers" data-offers></div>

      <h4>Leis e políticas</h4>
      <ul class="policies" data-policies></ul>
      <p class="muted small" data-policies-locked></p>
      <p class="budget-error" data-error hidden></p>`;

    this.el.addEventListener('input', (e) => {
      const zone = e.target.dataset.tax;
      if (zone) this.#run({ type: 'tax', zone, percent: Number(e.target.value) });
    });
    this.el.addEventListener('change', (e) => {
      const id = e.target.dataset.policy;
      if (id) this.#run({ type: 'policy', id, on: e.target.checked });
    });
    this.el.addEventListener('click', (e) => {
      const target = e.target.closest('button');
      if (!target) return;
      if ('close' in target.dataset) this.toggle(false);
      else if (target.dataset.loan) this.#run({ type: 'loan', amount: Number(target.dataset.loan) });
      else if (target.dataset.repay) this.#run({ type: 'repay', id: Number(target.dataset.repay) });
    });
  }

  #run(cmd) {
    const result = this.act(cmd);
    const error = this.el.querySelector('[data-error]');
    error.hidden = result.ok;
    if (!result.ok) error.textContent = result.reason;
    this.render(this.state, this.rt);
  }

  // Lista de leis liberadas, com custo do mês; refeita só quando algo muda.
  #renderPolicies(state, rt, income) {
    const ids = Object.keys(POLICIES).filter((id) => policyUnlocked(rt, id));
    const active = new Set(state.policies.active);
    const costs = ids.map((id) => policyCost(state, rt, id, income));
    const key = ids.map((id, i) => `${id}:${active.has(id)}:${costs[i]}`).join();
    if (key === this.policiesKey) return;
    this.policiesKey = key;
    this.el.querySelector('[data-policies]').innerHTML = ids.length
      ? ids.map((id, i) => `
        <li><label>
          <input type="checkbox" data-policy="${id}"${active.has(id) ? ' checked' : ''}>
          <span><b>${POLICIES[id].name}</b><small>${POLICIES[id].desc}</small></span>
          <em>${costs[i] ? `${money(costs[i])}/mês` : 'sem custo'}</em>
        </label></li>`).join('')
      : '<li class="muted">Nenhuma lei liberada ainda: elas vêm da pesquisa.</li>';
    const locked = Object.keys(POLICIES).length - ids.length;
    this.el.querySelector('[data-policies-locked]').textContent = locked ? `Mais ${locked} leis chegam com a pesquisa.` : '';
  }

  render(state, rt) {
    if (!this.open) return;
    this.state = state;
    this.rt = rt;
    const q = (sel) => this.el.querySelector(sel);
    const economy = state.economy;
    const budget = monthlyBudget(state, rt);

    q('[data-money]').textContent = money(economy.money);
    q('[data-forecast]').textContent = ` ${budget.net >= 0 ? '▲' : '▼'} ${money(budget.net)} este mês`;

    for (const zone of TAX_ZONES) {
      const input = q(`[data-tax="${zone}"]`);
      if (document.activeElement !== input) input.value = economy.taxes[zone];
      q(`[data-tax-value="${zone}"]`).textContent = `${economy.taxes[zone]}%`;
      q(`[data-tax-income="${zone}"]`).textContent = `${money(budget.income[zone])}/mês`;
    }

    q('[data-line="income"]').textContent = money(budget.income.total - budget.income.statal - budget.income.fares - budget.income.food);
    for (const el of this.el.querySelectorAll('[data-food-export]')) el.hidden = budget.income.food === 0;
    q('[data-line="food-export"]').textContent = money(budget.income.food);
    for (const el of this.el.querySelectorAll('[data-food-import]')) el.hidden = budget.expenses.food === 0;
    q('[data-line="food-import"]').textContent = money(-budget.expenses.food);
    for (const el of this.el.querySelectorAll('[data-fares]')) el.hidden = budget.income.fares === 0;
    q('[data-line="fares"]').textContent = money(budget.income.fares);
    for (const el of this.el.querySelectorAll('[data-statal]')) el.hidden = budget.income.statal === 0;
    q('[data-line="statal"]').textContent = money(budget.income.statal);
    q('[data-line="roads"]').textContent = money(-budget.expenses.roads);
    q('[data-line="utilities"]').textContent = money(-budget.expenses.utilities);
    q('[data-line="research"]').textContent = money(-budget.expenses.research);
    q('[data-line="policies"]').textContent = money(-budget.expenses.policies);
    this.#renderPolicies(state, rt, budget.income.total);
    q('[data-line="loans"]').textContent = money(-budget.expenses.loans);
    q('[data-line="net"]').textContent = money(budget.net);

    const loans = q('[data-loans]');
    loans.innerHTML = economy.loans.length
      ? economy.loans.map((l) => `
        <li><span>${money(l.amount)} · saldo ${money(l.balance)}<br>
          <small>${money(l.payment)}/mês · faltam ${l.monthsLeft} ${l.monthsLeft === 1 ? 'mês' : 'meses'}</small></span>
          <button data-repay="${l.id}">Quitar</button></li>`).join('')
      : '<li class="muted">Nenhum empréstimo.</li>';
    // Valores e juros oferecidos mudam com a pesquisa.
    const rate = loanRate(rt);
    const offers = loanOffers(rt);
    const offersKey = `${rate}|${offers.map((o) => o.amount).join()}`;
    if (offersKey !== this.offersKey) {
      this.offersKey = offersKey;
      q('[data-offers]').innerHTML = offers.map(({ amount, months }) => `
        <button data-loan="${amount}" title="${months} parcelas de ${money(loanPayment(amount, rate, months))} (juros de ${Math.round(rate * 1000) / 10}% ao ano)">
          + ${money(amount)}<small>${money(loanPayment(amount, rate, months))}/mês</small>
        </button>`).join('');
    }
    for (const b of this.el.querySelectorAll('[data-loan]')) b.disabled = economy.loans.length >= ECONOMY.maxLoans;

    const key = `${economy.history.length}:${economy.history.at(-1)?.tick}`;
    if (key !== this.historyKey) {
      this.historyKey = key;
      renderChart(q('[data-chart]'), economy.history.slice(-CHART_MONTHS));
    }
  }
}

// --- Gráfico: receita x despesa por mês -----------------------------------------
//
// Duas séries no mesmo eixo (mesma unidade), linhas de 2px com marcadores,
// legenda + rótulo no fim de cada linha, grade discreta, cruz e dica ao passar
// o mouse, e a mesma informação em tabela.

const W = 330;
const H = 150;
const PAD = { left: 44, right: 54, top: 10, bottom: 22 };

function monthLabel(tick) {
  const c = calendar(tick - 1); // fechado no primeiro minuto do mês seguinte
  return { short: MONTHS[c.month - 1], long: `${MONTHS[c.month - 1]}, ano ${c.year}` };
}

function renderChart(el, history) {
  if (history.length === 0) {
    el.innerHTML = '<p class="muted small">O histórico aparece depois do primeiro mês fechado.</p>';
    return;
  }
  const series = [
    { key: 'income', name: 'Receita', css: 'var(--series-1)', values: history.map((h) => h.income.total) },
    { key: 'expenses', name: 'Despesa', css: 'var(--series-2)', values: history.map((h) => h.expenses.total) },
  ];
  const max = niceMax(Math.max(1, ...series.flatMap((s) => s.values)));
  const n = history.length;
  const x = (i) => PAD.left + (n === 1 ? (W - PAD.left - PAD.right) / 2 : (i * (W - PAD.left - PAD.right)) / (n - 1));
  const y = (v) => PAD.top + (1 - v / max) * (H - PAD.top - PAD.bottom);

  const grid = [0, 0.5, 1].map((f) => `
    <line class="grid" x1="${PAD.left}" x2="${W - PAD.right}" y1="${y(max * f)}" y2="${y(max * f)}"/>
    <text class="axis" x="${PAD.left - 6}" y="${y(max * f) + 3}" text-anchor="end">${compact(max * f)}</text>`).join('');
  const every = Math.max(1, Math.ceil(n / 6));
  const xLabels = history.map((h, i) => (i % every === 0 || i === n - 1)
    ? `<text class="axis" x="${x(i)}" y="${H - 6}" text-anchor="middle">${monthLabel(h.tick).short}</text>` : '').join('');

  // Rótulos no fim das linhas, afastados se ficarem colados.
  const ends = series.map((s) => ({ s, y: y(s.values[n - 1]) }));
  if (Math.abs(ends[0].y - ends[1].y) < 12) {
    const mid = (ends[0].y + ends[1].y) / 2;
    const up = ends[0].y <= ends[1].y ? 0 : 1;
    ends[up].y = mid - 6;
    ends[1 - up].y = mid + 6;
  }

  // Linhas sem marcadores (com muitos meses eles poluem); o mês sob o mouse
  // ganha um marcador por série.
  const lines = series.map((s) => `
    <polyline class="line" style="stroke:${s.css}" points="${s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')}"/>
    <circle class="dot" data-dot="${s.key}" style="fill:${s.css}" r="4" visibility="hidden"/>`).join('');
  const labels = ends.map(({ s, y: ly }) => `<text class="end-label" x="${x(n - 1) + 8}" y="${ly + 4}">${s.name}</text>`).join('');

  el.innerHTML = `
    <div class="legend">${series.map((s) => `<span><i style="background:${s.css}"></i>${s.name}</span>`).join('')}</div>
    <div class="chart-box">
      <svg viewBox="0 0 ${W} ${H}" width="100%" role="img"
           aria-label="Receita e despesa nos últimos ${n} meses">
        ${grid}${xLabels}${lines}${labels}
        <line class="crosshair" data-cross y1="${PAD.top}" y2="${H - PAD.bottom}" visibility="hidden"/>
        <rect class="hit" x="${PAD.left - 8}" y="0" width="${W - PAD.left - PAD.right + 16}" height="${H}"/>
      </svg>
      <div class="chart-tip" data-tip hidden></div>
    </div>
    <details><summary>Ver tabela</summary>
      <table>
        <thead><tr><th>Mês</th><th>Receita</th><th>Despesa</th><th>Caixa</th></tr></thead>
        <tbody>${history.map((h) => `<tr><td>${monthLabel(h.tick).long}</td>
          <td>${money(h.income.total)}</td><td>${money(h.expenses.total)}</td><td>${money(h.money)}</td></tr>`).join('')}</tbody>
      </table>
    </details>`;

  // Cruz + dica com o mês mais próximo do cursor.
  const svg = el.querySelector('svg');
  const cross = el.querySelector('[data-cross]');
  const tip = el.querySelector('[data-tip]');
  svg.addEventListener('pointermove', (e) => {
    const rect = svg.getBoundingClientRect();
    const sx = ((e.clientX - rect.left) / rect.width) * W;
    let i = 0;
    for (let k = 1; k < n; k++) if (Math.abs(x(k) - sx) < Math.abs(x(i) - sx)) i = k;
    cross.setAttribute('x1', x(i));
    cross.setAttribute('x2', x(i));
    cross.setAttribute('visibility', 'visible');
    for (const s of series) {
      const dot = el.querySelector(`[data-dot="${s.key}"]`);
      dot.setAttribute('cx', x(i));
      dot.setAttribute('cy', y(s.values[i]));
      dot.setAttribute('visibility', 'visible');
    }
    const h = history[i];
    tip.hidden = false;
    tip.innerHTML = `<b>${monthLabel(h.tick).long}</b>
      ${series.map((s) => `<span><i style="background:${s.css}"></i>${s.name} ${money(s.values[i])}</span>`).join('')}
      <span class="muted">Saldo ${money(h.income.total - h.expenses.total)}</span>`;
    const left = (x(i) / W) * rect.width;
    tip.style.left = `${Math.min(rect.width - 150, Math.max(0, left - 75))}px`;
  });
  svg.addEventListener('pointerleave', () => {
    cross.setAttribute('visibility', 'hidden');
    for (const dot of el.querySelectorAll('[data-dot]')) dot.setAttribute('visibility', 'hidden');
    tip.hidden = true;
  });
}

function niceMax(v) {
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (v <= m * p) return m * p;
  return 10 * p;
}

function compact(v) {
  if (v >= 1000) return `${Math.round(v / 100) / 10}k`.replace('.', ',');
  return String(Math.round(v));
}
