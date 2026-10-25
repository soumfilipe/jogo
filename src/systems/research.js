// Pesquisa: pontos por área do conhecimento, gerados por instituições e
// prédios que atuam na área, e gastos em tecnologias (world/techs.js).
//
// Uma vez por mês (closeResearchMonth):
//   1. o relógio do mundo avança RESEARCH.worldPace anos por ano de jogo;
//   2. cada área ganha pontos:
//        institutos × √(verba / fundingRef) × pointsPerInstitute
//        + prédios da área × pointsPerInstitute × fieldShare (1/15)
//        + P&D privado (escritórios perto de parques tecnológicos);
//   3. cada área escolhe um alvo: a prioridade do jogador ou, sem ela, a
//      tecnologia disponível mais barata da área. O alvo é concluído quando
//      todas as áreas do custo dele têm pontos suficientes.
//
// Antes de o relógio do mundo chegar à tecnologia, a cidade só a consegue
// como pioneira, pagando RESEARCH.pioneerMultiplier vezes o custo.
//
// Estado (salvo): state.research = {
//   world: ponto do relógio do mundo (mesma escala da "ordem" das techs),
//   startMarco, points: { área: pontos }, funding: { área: $ por mês },
//   priority: { área: id | null }, done: [ids, na ordem em que foram concluídas],
//   lastMonth: { área: pontos ganhos no último mês },
// }

import { BUILDINGS, EDU, RESEARCH, ZONE } from '../world/catalog.js';
import {
  AREA_IDS, BUILDING_TECH, LEVEL_TECH, MARCOS, START_TECHS, TECHS, TECH_BY_ID, WORLD_END, marcoAt,
} from '../world/techs.js';
import { MONTHS_PER_YEAR } from '../core/time.js';
import { computeMods, mod } from './mods.js';
import { overloadedParents, productivity } from './childcare.js';

const zeros = () => Object.fromEntries(AREA_IDS.map((a) => [a, 0]));

/** Estado inicial da pesquisa para uma cidade que começa no marco `startMarco`. */
export function createResearch(startMarco = 1) {
  const marco = MARCOS.find((m) => m.id === startMarco) ?? MARCOS[0];
  const done = new Set(START_TECHS);
  // Tudo o que o mundo já tinha antes do marco inicial vem pronto.
  for (const t of TECHS) if (t.order < marco.from) done.add(t.id);
  return {
    world: marco.from,
    startMarco: marco.id,
    points: zeros(),
    funding: zeros(),
    priority: Object.fromEntries(AREA_IDS.map((a) => [a, null])),
    done: TECHS.filter((t) => done.has(t.id)).map((t) => t.id),
    lastMonth: zeros(),
  };
}

/**
 * Save de antes da pesquisa (marca legacyResearch, ver a migração 8 -> 9):
 * conclui as tecnologias de tudo o que a cidade já tem (usinas, níveis de
 * prédio) e os requisitos delas, e leva o relógio do mundo até o marco da
 * mais recente. Assim a cidade continua podendo construir o que já tinha.
 */
export function grantLegacyResearch(state) {
  if (!state.legacyResearch) return;
  delete state.legacyResearch;
  const keys = { [ZONE.RESIDENTIAL]: 'residential', [ZONE.COMMERCIAL]: 'commercial', [ZONE.INDUSTRIAL]: 'industrial', [ZONE.RURAL]: 'rural' };
  const needed = new Set();
  for (const b of state.buildings) {
    const info = BUILDINGS[b.type];
    const tech = info.utility ? BUILDING_TECH[b.type] : LEVEL_TECH[`${keys[info.zone]}:${info.level}`];
    if (tech) needed.add(tech);
  }
  const done = new Set(state.research.done);
  const grant = (id) => {
    if (done.has(id)) return;
    done.add(id);
    for (const r of TECH_BY_ID.get(id).requires) grant(r);
  };
  for (const id of needed) grant(id);
  // Mantém a ordem da árvore e o relógio no marco da mais recente.
  state.research.done = TECHS.filter((t) => done.has(t.id)).map((t) => t.id);
  const latest = Math.max(...state.research.done.map((id) => TECH_BY_ID.get(id).order));
  state.research.world = Math.max(state.research.world, marcoAt(latest).from);
}

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------

export function isDone(rt, id) {
  return rt.techDone.has(id);
}

/** Pode ser pesquisada agora: pronta nesta versão, não concluída e com os requisitos. */
export function isAvailable(rt, tech) {
  return tech.ready && !rt.techDone.has(tech.id) && tech.requires.every((r) => rt.techDone.has(r));
}

/** O mundo já descobriu esta tecnologia? */
export function worldKnows(state, tech) {
  return tech.order <= state.research.world;
}

/** Custo por área, contando o preço de pioneiro. */
export function effectiveCost(state, tech) {
  const mul = worldKnows(state, tech) ? 1 : RESEARCH.pioneerMultiplier;
  return Object.fromEntries(Object.entries(tech.cost).map(([a, v]) => [a, v * mul]));
}

const total = (cost) => Object.values(cost).reduce((s, v) => s + v, 0);

/** Tecnologia em que os pontos da área estão sendo gastos (ou null). */
export function target(state, rt, area) {
  const chosen = state.research.priority[area];
  const tech = chosen && TECH_BY_ID.get(chosen);
  if (tech && isAvailable(rt, tech)) return tech;
  return autoTarget(state, rt, area);
}

/** Alvo automático: a tecnologia disponível mais barata da área. */
export function autoTarget(state, rt, area) {
  let best = null;
  let bestCost = Infinity;
  for (const t of TECHS) {
    if (t.area !== area || !isAvailable(rt, t)) continue;
    const c = total(effectiveCost(state, t));
    if (c < bestCost) {
      best = t;
      bestCost = c;
    }
  }
  return best;
}

/** Fração (0 a 1) já juntada para a tecnologia: a área mais atrasada manda. */
export function progress(state, tech) {
  const cost = effectiveCost(state, tech);
  let p = 1;
  for (const [a, v] of Object.entries(cost)) if (v > 0) p = Math.min(p, state.research.points[a] / v);
  return Math.max(0, p);
}

/** Marco atual do mundo e quanto dele já passou (0 a 1). */
export function worldMarco(state) {
  const marco = marcoAt(state.research.world);
  const next = MARCOS.find((m) => m.id === marco.id + 1);
  const end = next ? next.from : WORLD_END;
  return { marco, next, progress: Math.min(1, (state.research.world - marco.from) / (end - marco.from)) };
}

/**
 * Pontos que cada área ganha por mês, do jeito que a cidade está agora.
 * Devolve { byArea, institutes, researchers, jobs, fundingCost }.
 */
export function researchOutput(state, rt) {
  const byArea = zeros();
  const base = RESEARCH.pointsPerInstitute * mod(rt, 'research');
  let staffing = 0; // institutos equivalentes (lotação de cada um somada)
  let institutes = 0;
  let researchers = 0;
  let jobs = 0;
  const parks = [];
  // Pesquisadores formados em cada área (rendem mais nela) e o peso da pós.
  const byField = zeros();
  const pos = mod(rt, 'posGraduacao', 0) > 0;
  // Pesquisador sem creche para o filho pequeno rende menos (ver childcare.js).
  const overloaded = overloadedParents(state, rt);

  for (const b of state.buildings) {
    const u = BUILDINGS[b.type].utility;
    if (!u) continue;
    const workers = rt.workers.get(b.id)?.size ?? 0;
    const full = BUILDINGS[b.type].jobs ? workers / BUILDINGS[b.type].jobs : 0;
    if (u.institute) {
      institutes++;
      researchers += workers;
      jobs += BUILDINGS[b.type].jobs;
      let weight = 0;
      for (const id of rt.workers.get(b.id)) {
        const c = rt.citizenById.get(id);
        weight += (pos && c?.edu >= EDU.POS ? RESEARCH.posWeight : 1) * productivity(overloaded, id);
        if (c?.field) byField[c.field]++;
      }
      staffing += weight / BUILDINGS[b.type].jobs;
    }
    if (u.area) byArea[u.area] += base * RESEARCH.fieldShare * full * mod(rt, `fieldShare.${u.area}`);
    if (u.privateResearch) parks.push(b);
  }

  const funding = state.research.funding;
  const efficiency = mod(rt, 'funding');
  for (const a of AREA_IDS) {
    if (funding[a] > 0 && staffing > 0) {
      const specialists = researchers ? byField[a] / researchers : 0;
      byArea[a] += staffing * base * Math.sqrt((funding[a] * efficiency) / RESEARCH.fundingRef)
        * (1 + RESEARCH.fieldBonus * specialists);
    }
  }

  if (parks.length) addPrivateResearch(state, rt, parks, byArea);
  for (const a of AREA_IDS) byArea[a] = Math.round(byArea[a] * 100) / 100;

  // Sem instituto, a verba não tem quem a receba: não é cobrada.
  const fundingCost = institutes > 0 ? AREA_IDS.reduce((s, a) => s + funding[a], 0) : 0;
  return { byArea, institutes, researchers, jobs, fundingCost };
}

// Escritórios (comércio nível 3) perto de um parque tecnológico fazem P&D.
function addPrivateResearch(state, rt, parks, byArea) {
  const width = state.map.width;
  const r = RESEARCH.privateRadius;
  const rate = RESEARCH.privatePerJob * mod(rt, 'privateResearch');
  for (const park of parks) {
    const px = park.tile % width;
    const py = Math.floor(park.tile / width);
    let jobs = 0;
    for (const b of state.buildings) {
      const info = BUILDINGS[b.type];
      if (info.zone !== ZONE.COMMERCIAL || info.level < 3) continue;
      if (Math.abs((b.tile % width) - px) > r || Math.abs(Math.floor(b.tile / width) - py) > r) continue;
      jobs += rt.workers.get(b.id).size;
    }
    const areas = BUILDINGS[park.type].utility.privateResearch;
    for (const a of areas) byArea[a] += (jobs * rate) / areas.length;
  }
}

// ---------------------------------------------------------------------------
// Fechamento do mês
// ---------------------------------------------------------------------------

/** Avança o mundo, soma os pontos do mês e conclui o que der. Devolve as concluídas. */
export function closeResearchMonth(state, rt) {
  const research = state.research;
  research.world = Math.min(WORLD_END, research.world + RESEARCH.worldPace / MONTHS_PER_YEAR);
  const { byArea } = researchOutput(state, rt);
  for (const a of AREA_IDS) research.points[a] += byArea[a];
  research.lastMonth = byArea;
  return completeAffordable(state, rt);
}

/** Conclui os alvos que já têm pontos suficientes (várias vezes, se der). */
export function completeAffordable(state, rt) {
  const completed = [];
  for (;;) {
    const targets = new Map();
    for (const a of AREA_IDS) {
      const t = target(state, rt, a);
      if (t) targets.set(t.id, t);
    }
    const ready = [...targets.values()]
      .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
      .find((t) => progress(state, t) >= 1);
    if (!ready) break;
    const cost = effectiveCost(state, ready);
    for (const [a, v] of Object.entries(cost)) state.research.points[a] -= v;
    completeTech(state, rt, ready.id);
    completed.push(ready.id);
  }
  return completed;
}

/** Marca a tecnologia como concluída e aplica os efeitos. */
export function completeTech(state, rt, id) {
  if (rt.techDone.has(id)) return;
  state.research.done.push(id);
  for (const [area, chosen] of Object.entries(state.research.priority)) {
    if (chosen === id) state.research.priority[area] = null;
  }
  computeMods(state, rt);
  (rt.researchEvents ??= []).push(id);
}

// ---------------------------------------------------------------------------
// Ações do jogador
// ---------------------------------------------------------------------------

export function setFunding(state, area, amount) {
  if (!AREA_IDS.includes(area)) return { ok: false, reason: `Área desconhecida: ${area}` };
  const value = Math.round(Number(amount) / RESEARCH.fundingStep) * RESEARCH.fundingStep;
  if (!Number.isFinite(value) || value < 0 || value > RESEARCH.fundingMax) {
    return { ok: false, reason: `A verba vai de $0 a $${RESEARCH.fundingMax.toLocaleString('pt-BR')} por mês.` };
  }
  state.research.funding[area] = value;
  return { ok: true, cost: 0, count: 1 };
}

/** Prioriza uma tecnologia da área (null volta para o automático). */
export function setPriority(state, rt, area, id) {
  if (!AREA_IDS.includes(area)) return { ok: false, reason: `Área desconhecida: ${area}` };
  if (id === null) {
    state.research.priority[area] = null;
    return { ok: true, cost: 0, count: 1 };
  }
  const tech = TECH_BY_ID.get(id);
  if (!tech || tech.area !== area) return { ok: false, reason: 'Tecnologia não é desta área.' };
  if (!isAvailable(rt, tech)) return { ok: false, reason: `${tech.name} ainda não pode ser pesquisada.` };
  state.research.priority[area] = id;
  return { ok: true, cost: 0, count: 1 };
}
