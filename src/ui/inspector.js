// Painel de inspeção: mostra um prédio (com moradores/funcionários) ou um
// cidadão individual (casa, emprego, rotina e o que está fazendo agora).

import {
  BUILDINGS, DENSITY_INFO, EDU_NAMES, EDUCATION, MAX_LEVEL, SECTORS, SHIFTS, ZONE, buildingFloors, capacityOf,
} from '../world/catalog.js';
import { minEduFor, radiusOf, seatsOf } from '../systems/education.js';
import { serviceRadius } from '../systems/services.js';
import { transitRadius } from '../systems/transit.js';
import { EXPORT, freightFactor } from '../systems/logistics.js';
import { farmOutput } from '../systems/food.js';
import { isCollected, wasteCapacity } from '../systems/waste.js';
import { visitorsAt } from '../systems/tourism.js';
import { nowShowing, showingAppeal } from '../systems/culture.js';
import { homeStress, overloadedParents } from '../systems/childcare.js';
import { CHILDCARE, CULTURE } from '../world/catalog.js';
import { unlockedTypes } from '../systems/agenda.js';
import { activeClubs, clubStrength, unlockedSports, youthCategory } from '../systems/sports.js';
import { SPORTS } from '../world/catalog.js';
import { companyJobs, usesCompanies } from '../world/runtime.js';
import { vacantFloors } from '../systems/companies.js';
import { TICKS_PER_DAY, formatClock } from '../core/time.js';
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
  return renderCitizen(el, c, state, rt, following);
}

function renderBuilding(el, b, state, rt) {
  const info = BUILDINGS[b.type];
  // Conjunto habitacional: é do jogador, mas é casa (inspetor de casa).
  const housing = info.utility?.housing;
  if (info.utility && !housing) return renderUtility(el, b, state, rt);
  const residents = [...rt.residents.get(b.id)].map((id) => rt.citizenById.get(id));
  const workers = [...rt.workers.get(b.id)].map((id) => rt.citizenById.get(id));
  const people = info.residents ? residents : workers;
  const capacity = capacityOf(b);
  const access = rt.access.get(b.id) >= 0;
  const stars = '★'.repeat(info.level) + '☆'.repeat(MAX_LEVEL - info.level);
  const upgrade = upgradeBlockers(state, rt, b);
  let next = '';
  const service = rt.service?.get(b.id);
  if (b.burned) {
    next = 'Destruído por um incêndio: vai desabar se não for demolido. Quartéis de bombeiros apagam o fogo no raio deles.';
  } else if (b.abandoned !== undefined) {
    next = 'Abandonado: ninguém mora ou trabalha aqui. Vai desabar se não for demolido.';
  } else if (upgrade?.limited) {
    next = `A densidade ${upgrade.limited.name.toLowerCase()} da zona não deixa crescer mais: rezoneie com densidade maior.`;
  } else if (upgrade) {
    next = upgrade.blockers.length
      ? `Para o ${upgrade.label} falta: ${upgrade.blockers.map(esc).join('; ')}.`
      : `Pronto para o ${upgrade.label}.`;
  } else if (housing) {
    next = `Moradia pública: os moradores não pagam imposto residencial (aluguel social) e ficam mais satisfeitos. Manutenção de $${utilityUpkeep(rt, b.type).toLocaleString('pt-BR')}/mês.`;
  } else if (info.tall) {
    next = 'Altura máxima.';
  } else if (info.size > 1) {
    next = 'Prédio grande (nível máximo).';
  } else {
    next = 'Nível máximo.';
  }

  el.innerHTML = `
    <h3>${esc(info.name)} #${b.id}</h3>
    <p class="muted">${housing ? 'Habitação social' : `<span class="stars" title="Nível ${info.level}">${stars}</span> · nível ${info.level}`}${info.size > 1 ? ` · ${info.size}×${info.size}` : ''}</p>
    <dl>
      <dt>${info.residents ? 'Moradores' : 'Funcionários'}</dt><dd>${people.length} / ${capacity}</dd>
      ${info.residents ? `<dt>Crianças</dt><dd>${people.filter((c) => c.age < 18).length}</dd>`
        : `<dt>Estudo exigido</dt><dd>${EDU_NAMES[minEduFor(rt, b.type)]}</dd>`}
      ${wellbeingRows(rt, b)}
      ${info.residents ? parentsRow(state, rt, residents, b) : ''}
      ${housing ? '' : `<dt>Andares</dt><dd>${buildingFloors(b)} (${info.perFloor} por andar)</dd>`}
      ${info.food ? `<dt>Produção</dt><dd>${Math.round(farmOutput(state, rt, b))} de ${Math.round(farmOutput(state, rt, b, true))} alimentos/mês</dd>` : ''}
      ${info.residents ? `<dt>Alimentos</dt><dd>${foodText(rt.coverage?.alimentos?.[b.tile] ?? 0)}</dd>` : ''}
      ${!housing && info.zone !== ZONE.INDUSTRIAL && info.zone !== ZONE.RURAL ? `<dt>Densidade</dt><dd>${DENSITY_INFO[state.map.density[b.tile]].name}</dd>` : ''}
      <dt>Valor do terreno</dt><dd>${pct(rt.landValue[b.tile])}</dd>
      <dt>Poluição</dt><dd>${pct(rt.pollution[b.tile])}</dd>
      <dt>Acesso a estrada</dt><dd>${access ? 'Sim' : NO}</dd>
      ${freightRow(rt, b)}
      ${rt.waste ? `<dt>Lixo</dt><dd>${isCollected(rt.waste, b) ? 'recolhido' : '<b style="color:#ff8a80">acumulando (sem lixão ou aterro no raio)</b>'}</dd>` : ''}
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
const MODE_TEXT = { onibus: 'de ônibus', brt: 'de BRT', vlt: 'de VLT', metro: 'de metrô' };

// Carga: a indústria escoa por um terminal; o comércio pode ser abastecido.
function freightRow(rt, b) {
  const zone = BUILDINGS[b.type].zone;
  const f = freightFactor(rt, b);
  if (zone === ZONE.INDUSTRIAL) {
    return `<dt>Carga</dt><dd>${f < 1
      ? `<b style="color:#ff8a80">sem terminal ao alcance (receita ${pct(f)})</b>`
      : `escoa por terminal${f > 1 ? ` (+${pct(f - 1)} pelo porto)` : ''}`}</dd>`;
  }
  if (zone === ZONE.COMMERCIAL && f > 1) return `<dt>Abastecimento</dt><dd>centro de distribuição (+${pct(EXPORT.supplied)})</dd>`;
  return '';
}
const NO_STAFF = '<b style="color:#ff8a80">sem funcionários, não atende</b>';
const SERVICE_TEXT = { saude: 'saúde', policia: 'policiamento', bombeiros: 'bombeiros', lazer: 'lazer', alimentos: 'alimentos' };
// Acesso a alimentos da casa (cobertura dos mercados).
const foodText = (v) => (v === 0 ? '<b style="color:#ff8a80">sem mercado por perto</b>' : `mercado no raio (${pct(v)})`);

// Filho pequeno do cidadão: sem vaga (penalidade cheia) ou na creche antes da Educação infantil.
function childRow(level) {
  if (!level) return '';
  const rende = pct(1 - (1 - CHILDCARE.productivity) * level);
  return level >= 1
    ? `<dt>Filho pequeno</dt><dd><b style="color:#ff8a80">sem vaga na creche: rende ${rende} no trabalho</b></dd>`
    : `<dt>Filho pequeno</dt><dd>na creche (sem Educação infantil): rende ${rende} no trabalho</dd>`;
}

// Pais sem vaga na creche para o filho pequeno e o estresse da casa.
function parentsRow(state, rt, residents, b) {
  const overloaded = overloadedParents(state, rt);
  const full = residents.filter((c) => overloaded.get(c.id) >= 1).length;
  const partial = residents.filter((c) => overloaded.get(c.id) > 0 && overloaded.get(c.id) < 1).length;
  const stress = homeStress(rt, b);
  if (!full && !partial && stress < 0.005) return '';
  const parts = [];
  if (full) parts.push(`<b style="color:#ff8a80">${full} sem vaga na creche</b>`);
  if (partial) parts.push(`${partial} com filho na creche`);
  return `<dt>Pais</dt><dd>${parts.join(' · ') || 'ninguém agora'} · estresse ${pct(stress)}</dd>`;
}

// Saúde, crime e satisfação do prédio (ver systems/wellbeing.js).
function wellbeingRows(rt, b) {
  const w = rt.wellbeing?.get(b.id);
  if (!w) return '';
  const rows = [];
  if (BUILDINGS[b.type].residents) {
    rows.push(`<dt>Satisfação</dt><dd>${pct(w.satisfaction)}</dd>`, `<dt>Saúde</dt><dd>${pct(w.health)}</dd>`);
  }
  rows.push(`<dt>Crime</dt><dd>${pct(w.crime)}</dd>`);
  return rows.join('');
}

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
  // Palco de eventos (painel Cultura): arena, estádio, praça, cinema, teatro...
  const stage = unlockedTypes(rt).some((t) => CULTURE.eventTypes[t].venues.includes(b.type));
  const next = state.culture?.events.filter((e) => e.venue === b.id && e.status === 'agendado').sort((a, c) => a.day - c.day)[0];
  // Casa de clubes (painel Esporte): campo, estádio, ginásio.
  const clubs = activeClubs(state).filter((c) => c.home === b.id);
  const canFound = unlockedSports(rt).some((s) => SPORTS.kinds[s].venues.includes(b.type) && !clubs.some((c) => c.sport === s));
  const kind = u.service ? (u.service.kind === 'lazer' ? 'Lazer' : 'Serviço público') : u.school && u.institute ? 'Ensino e pesquisa' : u.school || u.library ? 'Educação'
    : u.institute || u.privateResearch ? 'Pesquisa' : u.income ? 'Estatal' : 'Serviço público';
  el.innerHTML = `
    <h3>${esc(info.name)} #${b.id}</h3>
    <p class="muted">${kind} · ${info.size}×${info.size}</p>
    <dl>
      ${res ? `<dt>Produz</dt><dd>${fmt(utilityOutput(rt, b.type, res))} de ${label}</dd>` : ''}
      ${u.storage ? `<dt>Guarda</dt><dd>até ${fmt(u.storage)} de energia solar ou eólica da rede (a rede usa ${fmt(rt.utilityNets?.get(rt.roadComponent[access])?.power.stored ?? 0)} agora)</dd>` : ''}
      ${u.income && (!u.gated?.income || mod(rt, u.gated.income, 0) > 0) ? `<dt>Receita</dt><dd>$${fmt(u.income * (workers / jobs) * mod(rt, `output.${b.type}`))}/mês</dd>` : ''}
      <dt>Manutenção</dt><dd>$${fmt(utilityUpkeep(rt, b.type))}/mês</dd>
      <dt>${u.institute ? 'Pesquisadores' : 'Funcionários'}</dt><dd>${workers} / ${jobs}</dd>
      ${jobs ? `<dt>Estudo exigido</dt><dd>${EDU_NAMES[minEduFor(rt, b.type)]}</dd>` : ''}
      ${u.school ? `<dt>Alunos</dt><dd>${rt.students.get(b.id).size} / ${seatsOf(rt, b.type)} (${esc(EDUCATION.stages[u.school.stage].name.toLowerCase())})</dd>
      <dt>Atende</dt><dd>casas a até ${radiusOf(rt, b.type)} tiles</dd>` : ''}
      ${u.library ? `<dt>Estudantes</dt><dd>a até ${u.library.radius} tiles estudam ${Math.round(u.library.bonus * 100)}% mais rápido</dd>` : ''}
      ${u.transit ? `<dt>Atende</dt><dd>quem mora e trabalha a até ${transitRadius(rt, b.type)} tiles de uma estação ${MODE_TEXT[u.transit.mode]}</dd>` : ''}
      ${u.freight ? `<dt>Carga</dt><dd>indústrias a até ${Math.round(u.freight.range * mod(rt, 'freightRange'))} tiles pela rua${u.freight.bonus ? ` (+${pct(u.freight.bonus)} na receita)` : ''}</dd>` : ''}
      ${u.supply ? `<dt>Abastece</dt><dd>comércio a até ${u.supply.radius} tiles</dd>` : ''}
      ${u.tourism?.works ? `<dt>Em cartaz</dt><dd>${nowShowing(state.culture, u.tourism.works, state.time.tick).slice(0, 3).map((w) => esc(w.title)).join(' · ') || 'nada'}</dd>` : ''}
      ${u.tourism ? `<dt>Turistas</dt><dd>${visitorsAt(state, b.id)} aqui agora · ${u.tourism.appeal + (u.tourism.works ? showingAppeal(state.culture, u.tourism.works, state.time.tick) : 0)} por dia${u.tourism.game && !clubs.length ? `, ${u.tourism.game} em dia de jogo (domingo)` : ''}${u.tourism.weekend ? `, ${u.tourism.weekend} no fim de semana` : ''}${workers ? '' : ` (${NO_STAFF})`}</dd>` : ''}
      ${u.hotel ? `<dt>Quartos</dt><dd>${u.hotel.rooms} (turista que dorme aqui gasta mais)</dd>` : ''}
      ${u.gateway ? '<dt>Turistas</dt><dd>chegam por aqui (+50% de turismo)</dd>' : ''}
      ${u.gated?.income ? `<dt>Transmissão</dt><dd>${mod(rt, u.gated.income, 0) > 0 ? 'jogos na TV dão a receita do mês' : 'sem receita até a pesquisa de esporte na TV'}</dd>` : ''}
      ${u.waste ? `<dt>Recolhe</dt><dd>lixo dos prédios a até ${u.waste.radius} tiles${workers ? '' : ` (${NO_STAFF})`}</dd>
      <dt>Ocupado</dt><dd>${pct((b.fill ?? 0) / wasteCapacity(b.type))}${(b.fill ?? 0) >= wasteCapacity(b.type) ? ' <b style="color:#ff8a80">cheio: construa outro</b>' : ''}</dd>` : ''}
      ${u.recycle ? `<dt>Recicla</dt><dd>lixo ×${u.recycle.share} dos prédios a até ${u.recycle.radius} tiles</dd>` : ''}
      ${u.sewage ? `<dt>Trata</dt><dd>${fmt(u.sewage)} de esgoto/h (${pct(rt.sanitation?.treated ?? 0)} do esgoto da cidade tratado)</dd>` : ''}
      ${u.signal ? `<dt>Sinal</dt><dd>valoriza o terreno a até ${u.signal.radius} tiles</dd>` : ''}
      ${u.service ? `<dt>Atende</dt><dd>${SERVICE_TEXT[u.service.kind]} a até ${serviceRadius(rt, b.type)} tiles${workers ? '' : ` (${NO_STAFF})`}</dd>` : ''}
      ${u.institute ? '<dt>Pesquisa</dt><dd>nas áreas com verba (painel Pesquisa)</dd>' : ''}
      ${u.area ? `<dt>Pesquisa</dt><dd>um pouco de ${esc(AREAS[u.area])}</dd>` : ''}
      ${u.privateResearch ? '<dt>Pesquisa</dt><dd>P&amp;D dos escritórios em volta</dd>' : ''}
      <dt>Acesso a estrada</dt><dd>${access >= 0 ? 'Sim' : NO}</dd>
      ${net ? `<dt>Rede (${label})</dt><dd>${net[res].used.toLocaleString('pt-BR')} usados de ${net[res].supply.toLocaleString('pt-BR')}</dd>` : ''}
      ${u.pollution ? `<dt>Poluição</dt><dd>alta em volta</dd>` : ''}
      ${clubs.length ? `<dt>${clubs.length > 1 ? 'Clubes' : 'Clube'}</dt><dd>${clubs.map((c) => `${esc(c.name)} (${SPORTS.divisions[c.division].name.toLowerCase()}, força ${pct(clubStrength(state, rt, c))})`).join('; ')}</dd>` : ''}
      ${next ? `<dt>Próximo evento</dt><dd>${esc(next.name)} (em ${next.day - Math.floor(state.time.tick / TICKS_PER_DAY)} dias)</dd>` : ''}
    </dl>
    ${stage ? '<button data-plan-event>Agendar evento aqui</button>' : ''}
    ${canFound ? '<button data-found-club>Fundar clube aqui</button>' : ''}`;
}

/** "Atleta do {clube} (habilidade X%)" ou null. */
function athleteOf(state, rt, c) {
  if (c.athlete === undefined) return null;
  const club = state.sports?.clubs.find((x) => x.id === c.athlete);
  return club ? `Atleta do ${esc(club.name)} (habilidade ${pct(c.skill ?? 0)})` : null;
}

/** "Base do {clube}, Sub-15 (habilidade X%)" ou null. */
function youthOf(state, c) {
  if (c.youth === undefined) return null;
  const club = state.sports?.clubs.find((x) => x.id === c.youth);
  const cat = youthCategory(c.age);
  return club ? `Base do ${esc(club.name)}${cat ? `, ${cat.name}` : ''} (habilidade ${pct(c.skill ?? 0)})` : null;
}

function renderCitizen(el, c, state, rt, following) {
  const home = rt.buildingById.get(c.home);
  const job = c.job !== null ? rt.buildingById.get(c.job) : null;
  const company = c.company != null ? rt.companyById.get(c.company) : null;
  const school = c.school != null ? rt.buildingById.get(c.school) : null;
  const edu = `${EDU_NAMES[c.edu ?? 0]}${c.field ? ` (${esc(AREAS[c.field])})` : ''}`;
  const studying = school
    ? `${esc(EDUCATION.stages[c.stage].name)}, ${c.stage === 'creche' ? '' : `${Math.floor(c.study || 0) + 1}º ano, `}<button class="link" data-building="${school.id}">${esc(BUILDINGS[school.type].name)} #${school.id}</button>`
    : null;
  const notWorking = c.age < 18 ? (school ? 'Estudante' : 'Criança') : c.age > 64 ? 'Aposentado(a)' : school ? 'Estudante' : 'Desempregado(a)';
  el.innerHTML = `
    <h3>${esc(c.name)}</h3>
    <p class="muted">${c.age} anos · ${esc(activity(c))}</p>
    <dl>
      <dt>Casa</dt><dd><button class="link" data-building="${home.id}">${esc(BUILDINGS[home.type].name)} #${home.id}</button></dd>
      <dt>Trabalho</dt><dd>${athleteOf(state, rt, c) ?? (job
        ? `${company ? `${esc(company.name)}, ` : ''}<button class="link" data-building="${job.id}">${esc(BUILDINGS[job.type].name)} #${job.id}</button>`
        : notWorking)}</dd>
      <dt>Escolaridade</dt><dd>${edu}</dd>
      ${studying ? `<dt>Estuda</dt><dd>${studying}</dd>` : ''}
      ${job ? `<dt>Turno</dt><dd>${esc(SHIFTS[c.shift ?? 'diurno'].name)}</dd>
      <dt>Rotina</dt><dd>sai ${formatClock(c.departWork)}, volta ${formatClock(c.departHome)}</dd>` : ''}
      ${youthOf(state, c) ? `<dt>Esporte</dt><dd>${youthOf(state, c)}</dd>` : ''}
      ${childRow(overloadedParents(state, rt).get(c.id))}
      ${c.stress ? `<dt>Estresse</dt><dd>${pct(c.stress)}</dd>` : ''}
    </dl>
    <button data-follow>${following ? 'Parar de seguir' : 'Seguir com a câmera'}</button>`;
}

function activity(c) {
  if (c.state === 'viajando') {
    const how = c.mode ? ` ${MODE_TEXT[c.mode]}` : '';
    return (c.dest === 'trabalho' ? 'Indo para o trabalho' : 'Voltando para casa') + how;
  }
  return STATE_TEXT[c.state];
}

const pct = (v) => `${Math.round(v * 100)}%`;

function esc(text) {
  return String(text).replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}
