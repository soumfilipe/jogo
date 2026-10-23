// Painel de inspeção: mostra um prédio (com moradores/funcionários) ou um
// cidadão individual (casa, emprego, rotina e o que está fazendo agora).

import { BUILDINGS, MAX_LEVEL, SHIFTS } from '../world/catalog.js';
import { formatClock } from '../core/time.js';
import { upgradeBlockers } from '../systems/growth.js';

const STATE_TEXT = {
  casa: 'Em casa',
  trabalho: 'No trabalho',
  aguardando: 'Saindo…',
  viajando: null, // depende do destino
};

export function renderInspector(el, selection, state, rt, { following }) {
  if (selection.type === 'building') {
    const b = rt.buildingById.get(selection.id);
    if (!b) return void (el.innerHTML = '<p class="muted">Este prédio foi demolido.</p>');
    return renderBuilding(el, b, state, rt);
  }
  const c = rt.citizenById.get(selection.id);
  if (!c) return void (el.innerHTML = '<p class="muted">Este cidadão saiu da cidade.</p>');
  return renderCitizen(el, c, rt, following);
}

function renderBuilding(el, b, state, rt) {
  const info = BUILDINGS[b.type];
  const residents = [...rt.residents.get(b.id)].map((id) => rt.citizenById.get(id));
  const workers = [...rt.workers.get(b.id)].map((id) => rt.citizenById.get(id));
  const people = info.residents ? residents : workers;
  const capacity = info.residents || info.jobs;
  const access = rt.access.get(b.id) >= 0;
  const stars = '★'.repeat(info.level) + '☆'.repeat(MAX_LEVEL - info.level);
  const upgrade = upgradeBlockers(state, rt, b);
  let next = '';
  if (upgrade) {
    next = upgrade.blockers.length
      ? `Para o nível ${upgrade.next} falta: ${upgrade.blockers.map(esc).join('; ')}.`
      : `Pronto para o nível ${upgrade.next}.`;
  } else if (info.size > 1) {
    next = 'Prédio grande (nível máximo).';
  } else {
    next = 'Nível máximo.';
  }

  el.innerHTML = `
    <h3>${esc(info.name)} #${b.id}</h3>
    <p class="muted"><span class="stars" title="Nível ${info.level}">${stars}</span> · nível ${info.level}${info.size > 1 ? ` · ${info.size}×${info.size}` : ''}</p>
    <dl>
      <dt>${info.residents ? 'Moradores' : 'Funcionários'}</dt><dd>${people.length} / ${capacity}</dd>
      <dt>Valor do terreno</dt><dd>${pct(rt.landValue[b.tile])}</dd>
      <dt>Poluição</dt><dd>${pct(rt.pollution[b.tile])}</dd>
      <dt>Acesso a estrada</dt><dd>${access ? 'Sim' : '<b style="color:#ff8a80">Não</b>'}</dd>
    </dl>
    <p class="muted">${next}</p>
    <ul>${people.map((c) => `
      <li><button class="link" data-citizen="${c.id}">${esc(c.name)}</button>
          <small>${esc(activity(c))}</small></li>`).join('')}
    </ul>`;
}

function renderCitizen(el, c, rt, following) {
  const home = rt.buildingById.get(c.home);
  const job = c.job !== null ? rt.buildingById.get(c.job) : null;
  el.innerHTML = `
    <h3>${esc(c.name)}</h3>
    <p class="muted">${c.age} anos · ${esc(activity(c))}</p>
    <dl>
      <dt>Casa</dt><dd><button class="link" data-building="${home.id}">${esc(BUILDINGS[home.type].name)} #${home.id}</button></dd>
      <dt>Trabalho</dt><dd>${job
        ? `<button class="link" data-building="${job.id}">${esc(BUILDINGS[job.type].name)} #${job.id}</button>`
        : c.age > 64 ? 'Aposentado(a)' : 'Desempregado(a)'}</dd>
      ${job ? `<dt>Turno</dt><dd>${esc(SHIFTS[c.shift ?? 'diurno'].name)}</dd>
      <dt>Rotina</dt><dd>sai ${formatClock(c.departWork)}, volta ${formatClock(c.departHome)}</dd>` : ''}
    </dl>
    <button data-follow>${following ? 'Parar de seguir' : 'Seguir com a câmera'}</button>`;
}

function activity(c) {
  if (c.state === 'viajando') return c.dest === 'trabalho' ? 'Indo para o trabalho' : 'Voltando para casa';
  return STATE_TEXT[c.state];
}

const pct = (v) => `${Math.round(v * 100)}%`;

function esc(text) {
  return String(text).replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}
