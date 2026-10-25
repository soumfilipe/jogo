// Creches e famílias: quem trabalha e tem filho pequeno (0 a 5 anos) cuida da
// criança e trabalha ao mesmo tempo. A penalidade (de 0 a 1) depende da creche:
//   sem vaga na creche                        1 (penalidade cheia)
//   na creche, antes da Educação infantil     CHILDCARE.enrolled (25%)
//   na creche, depois da Educação infantil    0
// Com penalidade, rende menos (até CHILDCARE.productivity nos impostos, nas
// empresas e na pesquisa) e acumula estresse dia a dia, o que tira satisfação
// e saúde da casa.
//
// A família é quem mora no mesmo prédio com o mesmo sobrenome (os filhos
// herdam o sobrenome dos pais, ver systems/demography.js).
//
// Quem está sobrecarregado é derivado do estado (idade, matrícula na creche,
// emprego) e recalculado sempre antes de usar; o estresse de cada cidadão
// (citizen.stress, de 0 a 1, ausente = 0) fica no estado.

import { CHILDCARE } from '../world/catalog.js';
import { WORKING_AGE } from '../agents/citizens.js';
import { mod } from './mods.js';

const lastName = (c) => c.name.slice(c.name.indexOf(' ') + 1);
const isToddler = (c) => c.age >= CHILDCARE.ages[0] && c.age <= CHILDCARE.ages[1];

/**
 * Map(id do cidadão -> penalidade de 0 a 1) de quem trabalha e tem filho
 * pequeno (a maior penalidade entre os filhos).
 */
export function overloadedParents(state, rt) {
  const out = new Map();
  // Com a pesquisa, a creche resolve de vez.
  const enrolled = mod(rt, 'childcare.full', 0) > 0 ? 0 : CHILDCARE.enrolled;
  for (const ids of rt.residents.values()) {
    if (ids.size < 2) continue;
    // Penalidade de cada sobrenome com criança pequena nesta casa.
    let families = null;
    for (const id of ids) {
      const c = rt.citizenById.get(id);
      if (!c || !isToddler(c)) continue;
      const level = c.stage === 'creche' ? enrolled : 1;
      if (level > 0) {
        families ??= new Map();
        families.set(lastName(c), Math.max(families.get(lastName(c)) ?? 0, level));
      }
    }
    if (!families) continue;
    for (const id of ids) {
      const c = rt.citizenById.get(id);
      const level = c && c.job !== null && c.age >= WORKING_AGE[0] ? families.get(lastName(c)) : undefined;
      if (level) out.set(id, level);
    }
  }
  return out;
}

/** Quanto o cidadão rende no trabalho (1 = normal). */
export function productivity(overloaded, id) {
  return 1 - (1 - CHILDCARE.productivity) * (overloaded.get(id) ?? 0);
}

/** Soma do rendimento de um grupo de trabalhadores (ids). */
export function effectiveWorkers(overloaded, ids) {
  let total = 0;
  for (const id of ids) total += productivity(overloaded, id);
  return total;
}

/**
 * Uma vez por dia: o estresse sobe para quem tem penalidade, até o tamanho
 * dela (com o filho na creche, para em 25%), e baixa para os outros.
 */
export function updateStress(state, rt, overloaded = overloadedParents(state, rt)) {
  const round = (v) => Math.round(v * 10000) / 10000;
  for (const c of state.citizens) {
    const cap = overloaded.get(c.id) ?? 0;
    const stress = c.stress ?? 0;
    if (stress < cap) {
      c.stress = round(Math.min(cap, stress + CHILDCARE.rise * cap));
    } else if (stress > cap) {
      const next = round(Math.max(cap, stress - CHILDCARE.fall));
      if (next > 0) c.stress = next;
      else delete c.stress;
    }
  }
}

/** Estresse médio dos moradores de uma casa. */
export function homeStress(rt, b) {
  const ids = rt.residents.get(b.id);
  if (!ids?.size) return 0;
  let sum = 0;
  for (const id of ids) sum += rt.citizenById.get(id)?.stress ?? 0;
  return sum / ids.size;
}
