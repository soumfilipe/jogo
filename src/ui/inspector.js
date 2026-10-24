// Painel de inspeção: mostra um prédio (com moradores/funcionários) ou um
// cidadão individual (casa, emprego, rotina e o que está fazendo agora).

import {
  BUILDINGS, DENSITY_INFO, MAX_LEVEL, SECTORS, SHIFTS, ZONE, buildingFloors, capacityOf,
} from '../world/catalog.js';
import { companyJobs, usesCompanies } from '../world/runtime.js';
import { vacantFloors } from '../systems/companies.js';
import { formatClock } from '../core/time.js';
import { upgradeBlockers } from '../systems/growth.js';
import { jobsOf, mod, utilityOutput, utilityUpkeep } from '../systems/mods.js';
import { AREAS } from '../world/techs.js';

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
  if (info.utility) return renderUtility(el, b, state, rt);
  const residents = [...rt.residents.get(b.id)].map((id) => rt.citizenById.get(id));
  const workers = [...rt.workers.get(b.id)].map((id) => rt.citizenById.get(id));
  const people = info.residents ? residents : workers;
  const capacity = capacityOf(b);
  const access = rt.access.get(b.id) >= 0;
  const stars = '★'.repeat(info.level) + '☆'.repeat(MAX_LEVEL - info.level);
  const upgrade = upgradeBlockers(state, rt, b);
  let next = '';
  const service = rt.service?.get(b.id);
  if (b.abandoned !== undefined) {
    next = 'Abandonado: ninguém mora ou trabalha aqui. Vai desabar se não for demolido.';
  } else if (upgrade?.limited) {
    next = `A densidade ${upgrade.limited.name.toLowerCase()} da zona não deixa crescer mais: rezoneie com densidade maior.`;
  } else if (upgrade) {
    next = upgrade.blockers.length
      ? `Para o ${upgrade.label} falta: ${upgrade.blockers.map(esc).join('; ')}.`
      : `Pronto para o ${upgrade.label}.`;
  } else if (info.tall) {
    next = 'Altura máxima.';
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
      <dt>Andares</dt><dd>${buildingFloors(b)} (${info.perFloor} por andar)</dd>
      ${info.zone !== ZONE.INDUSTRIAL ? `<dt>Densidade</dt><dd>${DENSITY_INFO[state.map.density[b.tile]].name}</dd>` : ''}
      <dt>Valor do terreno</dt><dd>${pct(rt.landValue[b.tile])}</dd>
      <dt>Poluição</dt><dd>${pct(rt.pollution[b.tile])}</dd>
      <dt>Acesso a estrada</dt><dd>${access ? 'Sim' : NO}</dd>
      ${service ? `<dt>Energia</dt><dd>${service.power ? 'Sim' : NO}</dd>
      <dt>Água</dt><dd>${service.water ? 'Sim' : NO}</dd>` : ''}
      ${b.unservedDays ? `<dt>Dias sem serviço</dt><dd>${b.unservedDays}</dd>` : ''}
    </dl>
    <p class="muted">${next}</p>
    ${usesCompanies(info) ? companies(b, rt) : ''}
    <ul>${people.map((c) => `
      <li><button class="link" data-citizen="${c.id}">${esc(c.name)}</button>
          <small>${esc(activity(c))}</small></li>`).join('')}
    </ul>`;
}

const NO = '<b style="color:#ff8a80">Não</b>';

// Empresas do prédio, andar por andar, e os andares vagos.
function companies(b, rt) {
  const list = rt.companiesIn.get(b.id);
  const vacant = vacantFloors(rt, b);
  const rows = list.map((co) => `
    <li><b>${esc(co.name)}</b> <small>${esc(SECTORS[co.sector].name)} · ${floorsLabel(co.floor, co.floors)} ·
      ${rt.companyWorkers.get(co.id).size} / ${companyJobs(rt, co)} vagas${co.understaffedDays ? ` · sem gente há ${co.understaffedDays} dias` : ''}</small></li>`);
  if (vacant.length) rows.push(`<li class="muted">Vago (aluga-se): ${vacant.map((f) => floorsLabel(f, 1)).join(', ')}</li>`);
  return `<h4>Empresas</h4><ul class="companies">${rows.join('')}</ul>`;
}

const floorLabel = (f) => (f === 0 ? 'térreo' : `${f}º andar`);
const floorsLabel = (floor, floors) => (floors === 1 ? floorLabel(floor) : `${floorLabel(floor)} ao ${floorLabel(floor + floors - 1)}`);

function renderUtility(el, b, state, rt) {
  const info = BUILDINGS[b.type];
  const u = info.utility;
  const res = u.power ? 'power' : u.water ? 'water' : null;
  const label = res === 'power' ? 'energia' : 'água';
  const access = rt.access.get(b.id);
  const net = res && access >= 0 ? rt.utilityNets?.get(rt.roadComponent[access]) : null;
  const workers = rt.workers.get(b.id).size;
  const jobs = jobsOf(rt, b.type);
  const fmt = (v) => Math.round(v).toLocaleString('pt-BR');
  const kind = u.institute || u.privateResearch ? 'Pesquisa' : u.income ? 'Estatal' : 'Serviço público';
  el.innerHTML = `
    <h3>${esc(info.name)} #${b.id}</h3>
    <p class="muted">${kind} · ${info.size}×${info.size}</p>
    <dl>
      ${res ? `<dt>Produz</dt><dd>${fmt(utilityOutput(rt, b.type, res))} de ${label}</dd>` : ''}
      ${u.income ? `<dt>Receita</dt><dd>$${fmt(u.income * (workers / jobs) * mod(rt, `output.${b.type}`))}/mês</dd>` : ''}
      <dt>Manutenção</dt><dd>$${fmt(utilityUpkeep(rt, b.type))}/mês</dd>
      <dt>${u.institute ? 'Pesquisadores' : 'Funcionários'}</dt><dd>${workers} / ${jobs}</dd>
      ${u.institute ? '<dt>Pesquisa</dt><dd>nas áreas com verba (painel Pesquisa)</dd>' : ''}
      ${u.area ? `<dt>Pesquisa</dt><dd>um pouco de ${esc(AREAS[u.area])}</dd>` : ''}
      ${u.privateResearch ? '<dt>Pesquisa</dt><dd>P&amp;D dos escritórios em volta</dd>' : ''}
      <dt>Acesso a estrada</dt><dd>${access >= 0 ? 'Sim' : NO}</dd>
      ${net ? `<dt>Rede (${label})</dt><dd>${net[res].used.toLocaleString('pt-BR')} usados de ${net[res].supply.toLocaleString('pt-BR')}</dd>` : ''}
      ${u.pollution ? `<dt>Poluição</dt><dd>alta em volta</dd>` : ''}
    </dl>`;
}

function renderCitizen(el, c, rt, following) {
  const home = rt.buildingById.get(c.home);
  const job = c.job !== null ? rt.buildingById.get(c.job) : null;
  const company = c.company != null ? rt.companyById.get(c.company) : null;
  el.innerHTML = `
    <h3>${esc(c.name)}</h3>
    <p class="muted">${c.age} anos · ${esc(activity(c))}</p>
    <dl>
      <dt>Casa</dt><dd><button class="link" data-building="${home.id}">${esc(BUILDINGS[home.type].name)} #${home.id}</button></dd>
      <dt>Trabalho</dt><dd>${job
        ? `${company ? `${esc(company.name)}, ` : ''}<button class="link" data-building="${job.id}">${esc(BUILDINGS[job.type].name)} #${job.id}</button>`
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
