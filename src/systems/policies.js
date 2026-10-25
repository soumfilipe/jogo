// Leis e políticas: o jogador liga e desliga no painel do orçamento, como as
// portarias do SimCity 2000. Cada uma é liberada por uma tecnologia, tem um
// custo mensal (fixo ou por pessoa) e efeitos aplicados como modificadores
// (mods.js) enquanto está ativa.
//
// Estado (salvo): state.policies = { active: [ids] }.

import { TECH_BY_ID } from '../world/techs.js';

// cost: { flat, perResident, perStudent, perRetiree, perChild, incomeShare }
export const POLICIES = {
  codigo_incendio: {
    name: 'Código contra incêndio', tech: 'codigo_incendio',
    desc: 'Incêndios 40% menos frequentes; construir custa 5% mais.',
    cost: {}, effects: [{ mod: 'fireRisk', mul: 0.6 }, { mod: 'buildCost', mul: 1.05 }],
  },
  previdencia: {
    name: 'Previdência social', tech: 'previdencia',
    desc: 'Aposentados recebem renda: mais satisfação e consumo.',
    cost: { perRetiree: 2 }, effects: [{ mod: 'satisfactionPolicy', add: 0.04 }, { mod: 'demand.commercial', add: 3 }],
  },
  codigo_florestal: {
    name: 'Código florestal', tech: 'codigo_florestal',
    desc: 'Desmatar custa o triplo; a cidade fica mais agradável.',
    cost: {}, effects: [{ mod: 'clearForestCost', mul: 3 }, { mod: 'satisfactionPolicy', add: 0.02 }],
  },
  patrimonio: {
    name: 'Proteção do patrimônio', tech: 'patrimonio',
    desc: 'Terreno mais valorizado; prédios sobem de nível um pouco mais devagar.',
    cost: { flat: 200 }, effects: [{ mod: 'landValue.all', add: 0.02 }, { mod: 'upgradeChance.residential', mul: 0.9 }, { mod: 'upgradeChance.commercial', mul: 0.9 }],
  },
  leis_trabalhistas: {
    name: 'Leis trabalhistas', tech: 'leis_trabalhistas',
    desc: 'Jornada de 8 horas e férias: mais satisfação, menos demanda industrial.',
    cost: {}, effects: [{ mod: 'satisfactionPolicy', add: 0.06 }, { mod: 'demand.industrial', add: -5 }],
  },
  merenda: {
    name: 'Merenda escolar', tech: 'merenda',
    desc: 'O ensino fundamental avança 20% mais rápido.',
    cost: { perStudent: 1 }, effects: [{ mod: 'study.fundamental', mul: 1.2 }],
  },
  ensino_obrigatorio: {
    name: 'Ensino obrigatório', tech: 'ensino_obrigatorio',
    desc: 'As escolas primárias atendem casas 50% mais longe.',
    cost: { perStudent: 0.5 }, effects: [{ mod: 'radius.fundamental', mul: 1.5 }],
  },
  antitabagismo: {
    name: 'Controle do tabagismo', tech: 'antitabagismo',
    desc: 'Expectativa de vida 2 anos maior; o comércio perde um pouco.',
    cost: {}, effects: [{ mod: 'lifeExpectancy', add: 2 }, { mod: 'demand.commercial', add: -2 }],
  },
  eja: {
    name: 'Educação de jovens e adultos', tech: 'eja',
    desc: 'Adultos sem o fundamental estudam à noite na escola primária (2 anos).',
    cost: { perStudent: 1 }, effects: [{ mod: 'eja', add: 1 }],
  },
  credito_estudantil: {
    name: 'Crédito estudantil', tech: 'credito_estudantil',
    desc: 'Quem trabalha também pode largar o emprego para fazer faculdade.',
    cost: { perStudent: 3 }, effects: [{ mod: 'universityForWorkers', add: 1 }],
  },
  incentivo_pd: {
    name: 'Incentivo fiscal a P&D', tech: 'incentivo_pd',
    desc: 'Comércio e indústria pagam 10% menos imposto e todos os escritórios fazem pesquisa.',
    cost: {}, effects: [{ mod: 'income.commercial', mul: 0.9 }, { mod: 'income.industrial', mul: 0.9 }, { mod: 'rdIncentive', add: 1 }],
  },
  licenciamento: {
    name: 'Licenciamento ambiental', tech: 'licenciamento',
    desc: 'A indústria não cresce a menos de 5 tiles de casas; os moradores agradecem.',
    cost: {}, effects: [{ mod: 'industryBuffer', add: 5 }, { mod: 'satisfactionPolicy', add: 0.02 }],
  },
  microcredito: {
    name: 'Microcrédito', tech: 'microcredito',
    desc: 'Pequenos negócios: mais demanda comercial.',
    cost: { flat: 300 }, effects: [{ mod: 'demand.commercial', add: 5 }],
  },
  policia_comunitaria: {
    name: 'Polícia comunitária', tech: 'policia_comunitaria',
    desc: 'A polícia rende mais onde os moradores estão satisfeitos.',
    cost: { flat: 400 }, effects: [{ mod: 'communityPolicing', add: 1 }],
  },
  eia: {
    name: 'Estudo de impacto ambiental', tech: 'eia',
    desc: 'Prédios do jogador custam 10% mais e poluem 20% menos.',
    cost: {}, effects: [{ mod: 'cost.utilities', mul: 1.1 }, { mod: 'pollution.utilities', mul: 0.8 }],
  },
  protocolo_montreal: {
    name: 'Proteção da camada de ozônio', tech: 'protocolo_montreal',
    desc: 'Um pouco mais de saúde; o comércio perde um pouco.',
    cost: {}, effects: [{ mod: 'health', add: 0.03 }, { mod: 'demand.commercial', add: -1 }],
  },
  orcamento_participativo: {
    name: 'Orçamento participativo', tech: 'orcamento_participativo',
    desc: 'Mais satisfação; custa 2% da receita.',
    cost: { incomeShare: 0.02 }, effects: [{ mod: 'satisfactionPolicy', add: 0.06 }],
  },
  lei_cultura: {
    name: 'Incentivo à cultura', tech: 'lei_cultura',
    desc: 'Mais satisfação; a arrecadação cai 3%.',
    cost: {}, effects: [{ mod: 'income.all', mul: 0.97 }, { mod: 'satisfactionPolicy', add: 0.04 }],
  },
  saude_familia: {
    name: 'Saúde da família', tech: 'saude_familia',
    desc: 'Agentes de saúde visitam as casas: saúde +10.',
    cost: { perResident: 0.3 }, effects: [{ mod: 'health', add: 0.1 }],
  },
  mediacao: {
    name: 'Mediação de conflitos', tech: 'mediacao',
    desc: 'Crime 10% menor e um pouco mais de satisfação.',
    cost: { flat: 300 }, effects: [{ mod: 'crime', mul: 0.9 }, { mod: 'satisfactionPolicy', add: 0.02 }],
  },
  estatuto_cidade: {
    name: 'Função social da propriedade', tech: 'estatuto_cidade',
    desc: 'Ruínas desabam na metade do tempo, liberando o lote; arrecadação +2%.',
    cost: {}, effects: [{ mod: 'collapseDays', mul: 0.5 }, { mod: 'income.all', mul: 1.02 }],
  },
  transferencia_renda: {
    name: 'Transferência de renda', tech: 'transferencia_renda',
    desc: 'Famílias com filhos na escola recebem: mais consumo e satisfação.',
    cost: { perChild: 1.5 }, effects: [{ mod: 'demand.commercial', add: 5 }, { mod: 'satisfactionPolicy', add: 0.04 }],
  },
  mercado_carbono: {
    name: 'Mercado de carbono', tech: 'mercado_carbono',
    desc: 'A indústria polui 15% menos e paga 5% mais.',
    cost: {}, effects: [{ mod: 'pollution.industry', mul: 0.85 }, { mod: 'income.industrial', mul: 1.05 }],
  },
  escola_integral: {
    name: 'Escola em tempo integral', tech: 'escola_integral',
    desc: 'Fundamental 25% mais rápido e menos crime entre jovens.',
    cost: { perStudent: 2 }, effects: [{ mod: 'study.fundamental', mul: 1.25 }, { mod: 'crime', mul: 0.9 }],
  },
  telhados_verdes: {
    name: 'Telhados verdes', tech: 'telhados_verdes',
    desc: 'Casas e comércio gastam 10% menos energia; construir custa 3% mais.',
    cost: {}, effects: [{ mod: 'consumption.residential', mul: 0.9 }, { mod: 'consumption.commercial', mul: 0.9 }, { mod: 'buildCost', mul: 1.03 }],
  },
  cotas: {
    name: 'Ações afirmativas', tech: 'cotas',
    desc: 'Vagas da universidade para bairros pobres: mais satisfação.',
    cost: {}, effects: [{ mod: 'satisfactionPolicy', add: 0.03 }],
  },
  geracao_distribuida: {
    name: 'Geração distribuída', tech: 'geracao_distribuida',
    desc: 'Casas com painel no telhado: consumo residencial 15% menor.',
    cost: {}, effects: [{ mod: 'consumption.residential', mul: 0.85 }],
  },
  ciclovia_lazer: {
    name: 'Ruas de lazer', tech: 'ciclovia_lazer',
    desc: 'Domingo sem carros: mais saúde e satisfação, um pouco menos de capacidade nas ruas.',
    cost: {}, effects: [{ mod: 'satisfactionPolicy', add: 0.03 }, { mod: 'health', add: 0.03 }, { mod: 'roadCapacity', mul: 0.97 }],
  },
};

export function createPolicies() {
  return { active: [] };
}

/** A lei está liberada pela pesquisa? */
export function policyUnlocked(rt, id) {
  return Boolean(rt.techDone?.has(POLICIES[id].tech));
}

/** Liga ou desliga uma lei. */
export function setPolicy(state, rt, id, on) {
  const policy = POLICIES[id];
  if (!policy) return { ok: false, reason: `Lei desconhecida: ${id}` };
  const active = new Set(state.policies.active);
  if (on) {
    if (!policyUnlocked(rt, id)) {
      return { ok: false, reason: `Precisa da tecnologia ${TECH_BY_ID.get(policy.tech).name}.` };
    }
    active.add(id);
  } else {
    active.delete(id);
  }
  // Mantém a ordem do catálogo (o save não depende da ordem dos cliques).
  state.policies.active = Object.keys(POLICIES).filter((p) => active.has(p));
  return { ok: true, cost: 0, count: 1 };
}

/** Custo mensal de uma lei, do jeito que a cidade está agora. */
export function policyCost(state, rt, id, income = 0) {
  const c = POLICIES[id].cost;
  let residents = 0;
  let students = 0;
  let retirees = 0;
  let children = 0;
  if (c.perResident || c.perStudent || c.perRetiree || c.perChild) {
    for (const p of state.citizens) {
      residents++;
      if (p.stage) students++;
      if (p.age > 64) retirees++;
      if (p.age < 18) children++;
    }
  }
  return Math.round(
    (c.flat ?? 0) + (c.perResident ?? 0) * residents + (c.perStudent ?? 0) * students
    + (c.perRetiree ?? 0) * retirees + (c.perChild ?? 0) * children + (c.incomeShare ?? 0) * income,
  );
}

/** Custo mensal de todas as leis ativas. */
export function policiesCost(state, rt, income) {
  return (state.policies?.active ?? []).reduce((sum, id) => sum + policyCost(state, rt, id, income), 0);
}
