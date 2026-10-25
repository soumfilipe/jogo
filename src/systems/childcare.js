// Creches e famílias: quem trabalha e tem filho pequeno (0 a 5 anos) sem vaga
// na creche cuida da criança e trabalha ao mesmo tempo. Rende menos
// (CHILDCARE.productivity nos impostos, nas empresas e na pesquisa) e acumula
// estresse dia a dia, o que tira satisfação e saúde da casa.
//
// A família é quem mora no mesmo prédio com o mesmo sobrenome (os filhos
// herdam o sobrenome dos pais, ver systems/demography.js).
//
// Quem está sobrecarregado é derivado do estado (idade, matrícula na creche,
// emprego) e recalculado sempre antes de usar; o estresse de cada cidadão
// (citizen.stress, de 0 a 1, ausente = 0) fica no estado.

import { CHILDCARE } from '../world/catalog.js';
import { WORKING_AGE } from '../agents/citizens.js';

const lastName = (c) => c.name.slice(c.name.indexOf(' ') + 1);
const isToddler = (c) => c.age >= CHILDCARE.ages[0] && c.age <= CHILDCARE.ages[1];

/** Ids dos cidadãos que trabalham e têm filho pequeno sem vaga na creche. */
export function overloadedParents(state, rt) {
  const out = new Set();
  for (const ids of rt.residents.values()) {
    if (ids.size < 2) continue;
    // Sobrenomes com criança pequena fora da creche nesta casa.
    let families = null;
    for (const id of ids) {
      const c = rt.citizenById.get(id);
      if (c && isToddler(c) && c.stage !== 'creche') (families ??= new Set()).add(lastName(c));
    }
    if (!families) continue;
    for (const id of ids) {
      const c = rt.citizenById.get(id);
      if (c && c.job !== null && c.age >= WORKING_AGE[0] && families.has(lastName(c))) out.add(id);
    }
  }
  return out;
}

/** Quanto o cidadão rende no trabalho (1 = normal). */
export function productivity(overloaded, id) {
  return overloaded.has(id) ? CHILDCARE.productivity : 1;
}

/** Soma do rendimento de um grupo de trabalhadores (ids). */
export function effectiveWorkers(overloaded, ids) {
  let total = 0;
  for (const id of ids) total += productivity(overloaded, id);
  return total;
}

/** Uma vez por dia: o estresse sobe para quem está sobrecarregado e baixa para os outros. */
export function updateStress(state, rt, overloaded = overloadedParents(state, rt)) {
  for (const c of state.citizens) {
    if (overloaded.has(c.id)) {
      c.stress = Math.min(1, Math.round(((c.stress ?? 0) + CHILDCARE.rise) * 1000) / 1000);
    } else if (c.stress) {
      const next = Math.round((c.stress - CHILDCARE.fall) * 1000) / 1000;
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
