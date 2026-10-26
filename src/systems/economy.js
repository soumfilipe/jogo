// Orçamento da cidade.
//
// Receitas (impostos, por zona):
//   residencial: cada morador empregado paga incomePerWorker por ponto de imposto
//   comercial / industrial / rural: cada vaga ocupada paga incomePerJob por ponto
//   estatais (refinaria, fábrica de cimento...): receita proporcional à lotação
//   exportação de alimentos que sobram (ver food.js)
//   taxa municipal dos ingressos dos jogos dos clubes (ver sports.js)
// Despesas: manutenção das ruas e dos serviços públicos, verba de pesquisa,
// leis e políticas ativas, alimentos importados, parcelas de empréstimos,
// repasse aos clubes. Tecnologias mudam vários desses valores (mod()).
//
// monthlyBudget() calcula o mês "como está agora" (para o painel e a
// previsão); closeMonth() aplica no fim de cada mês, paga as parcelas e guarda
// o mês no histórico.

import { BUILDINGS, ECONOMY, METRO, TAX_ZONES, ZONE } from '../world/catalog.js';
import { openJobs } from '../world/runtime.js';
import { jobsOf, mod, utilityOutput, utilityUpkeep } from './mods.js';
import { researchOutput } from './research.js';
import { policiesCost } from './policies.js';
import { freightFactor } from './logistics.js';
import { foodBalance } from './food.js';
import { effectiveWorkers, overloadedParents, productivity } from './childcare.js';
import { sportsSubsidy } from './sports.js';
import { commutersIn, commutersOut, metroActive } from './metro.js';

// O térreo do prédio misto paga como comércio (os moradores, no residencial).
const ZONE_KEY = { [ZONE.COMMERCIAL]: 'commercial', [ZONE.INDUSTRIAL]: 'industrial', [ZONE.RURAL]: 'rural', [ZONE.MIXED]: 'commercial' };

export function monthlyBudget(state, rt) {
  const taxes = state.economy.taxes;
  // Pais sem creche para o filho pequeno rendem menos (ver childcare.js).
  const overloaded = overloadedParents(state, rt);
  let employed = 0;
  // Atletas dos clubes recebem salário do clube e pagam imposto como empregados.
  // Quem mora num conjunto habitacional não paga (aluguel social).
  for (const c of state.citizens) {
    if (c.job === null && c.athlete === undefined) continue;
    if (BUILDINGS[rt.buildingById.get(c.home)?.type]?.utility?.housing) continue;
    employed += productivity(overloaded, c.id);
  }

  // Região metropolitana: quem trabalha nas vizinhas paga imposto aqui.
  employed += commutersOut(state, rt);
  const metro = commutersIn(state, rt);
  // Vagas ocupadas, já pesadas pelo modificador de imposto do nível do prédio.
  const jobsFilled = { commercial: 0, industrial: 0, rural: 0 };
  let utilities = 0;
  let statal = 0;
  for (const b of state.buildings) {
    const info = BUILDINGS[b.type];
    const workers = effectiveWorkers(overloaded, rt.workers.get(b.id));
    if (info.utility) {
      utilities += utilityUpkeep(rt, b.type);
      // Receita que vem da pesquisa (ex.: transmissão dos jogos) só depois dela.
      const gate = info.utility.gated?.income;
      if (info.utility.income && (!gate || mod(rt, gate, 0) > 0)) {
        const full = workers / jobsOf(rt, b.type);
        statal += info.utility.income * full * mod(rt, `output.${b.type}`);
      }
    }
    const key = ZONE_KEY[info.zone];
    if (key && b.abandoned === undefined) {
      // Trabalhadores de fora ocupam parte das vagas abertas do comércio e da indústria.
      const outside = metro.ratio && key !== 'rural' ? openJobs(rt, b) * metro.ratio : 0;
      jobsFilled[key] += (workers + outside) * mod(rt, `income.${key}.${info.level}`) * mod(rt, `income.${key}`) * freightFactor(rt, b);
    }
  }

  let roadTiles = 0;
  for (const r of state.map.road) roadTiles += r;

  const all = mod(rt, 'income.all');
  const food = foodBalance(state, rt);
  const income = {
    residential: Math.round(employed * ECONOMY.incomePerWorker * taxes.residential * all),
    // Clientes de fora (região metropolitana) também compram no comércio.
    commercial: Math.round(jobsFilled.commercial * ECONOMY.incomePerJob * taxes.commercial * all * (metroActive(state, rt) ? METRO.customers : 1)),
    industrial: Math.round(jobsFilled.industrial * ECONOMY.incomePerJob * taxes.industrial * all),
    rural: Math.round(jobsFilled.rural * ECONOMY.incomePerJob * (taxes.rural ?? ECONOMY.taxDefault) * all),
    statal: Math.round(statal),
    food: food.exportIncome,
    // Passagens do transporte público juntadas neste mês (ver transit.js).
    fares: Math.round(state.economy.fares ?? 0),
    // Gasto dos turistas juntado neste mês (ver tourism.js).
    // Ingressos dos eventos realizados neste mês (ver agenda.js).
    events: Math.round(state.economy.eventsIncome ?? 0),
    // Taxa municipal dos ingressos dos jogos (ver sports.js).
    sports: Math.round(state.economy.sportsIncome ?? 0),
    tourism: Math.round(state.economy.tourism ?? 0),
  };
  income.total = income.residential + income.commercial + income.industrial + income.rural
    + income.statal + income.food + income.fares + income.tourism + income.events + income.sports;

  const expenses = {
    roads: Math.round(roadTiles * mod(rt, 'roadUpkeep', ECONOMY.roadUpkeepPerMonth) * mod(rt, 'maintenance')),
    utilities,
    research: researchOutput(state, rt).fundingCost,
    policies: policiesCost(state, rt, income.total),
    food: food.importCost,
    loans: state.economy.loans.reduce((sum, loan) => sum + loanInstallment(loan), 0),
    // Repasse mensal aos clubes da cidade (ver sports.js).
    sports: sportsSubsidy(state),
  };
  expenses.total = expenses.roads + expenses.utilities + expenses.research + expenses.policies + expenses.food
    + expenses.loans + expenses.sports;

  return { income, expenses, net: income.total - expenses.total };
}

/** Fechamento do mês: aplica o orçamento, paga as parcelas e guarda no histórico. */
export function closeMonth(state, rt) {
  const budget = monthlyBudget(state, rt);
  const economy = state.economy;
  economy.money += budget.net;
  economy.fares = 0; // as passagens do mês já entraram na receita
  economy.tourism = 0; // e o gasto dos turistas também
  economy.eventsIncome = 0; // e os ingressos dos eventos
  economy.sportsIncome = 0; // e a taxa dos jogos

  for (const loan of economy.loans) {
    const interest = Math.round(loan.balance * monthlyRate(loan));
    loan.balance = Math.max(0, loan.balance + interest - loanInstallment(loan));
    loan.monthsLeft--;
  }
  economy.loans = economy.loans.filter((loan) => loan.monthsLeft > 0 && loan.balance > 0);

  economy.lastMonth = budget;
  economy.history.push({ tick: state.time.tick, income: budget.income, expenses: budget.expenses, money: economy.money });
  if (economy.history.length > ECONOMY.historyMonths) economy.history.shift();
}

// --- Impostos -----------------------------------------------------------------

export function setTax(state, zone, percent) {
  if (!TAX_ZONES.includes(zone)) return { ok: false, reason: `Zona desconhecida: ${zone}` };
  const value = Math.round(Number(percent));
  if (!Number.isFinite(value) || value < ECONOMY.taxMin || value > ECONOMY.taxMax) {
    return { ok: false, reason: `O imposto vai de ${ECONOMY.taxMin}% a ${ECONOMY.taxMax}%.` };
  }
  state.economy.taxes[zone] = value;
  return { ok: true, cost: 0, count: 1 };
}

/** Quanto o imposto da zona desloca a demanda dela (negativo = menos demanda). */
export function taxDemandShift(state, zone) {
  return (ECONOMY.taxDefault - state.economy.taxes[zone]) * ECONOMY.taxDemandEffect[zone];
}

// --- Empréstimos --------------------------------------------------------------

// Cada empréstimo guarda os juros do dia em que foi feito (tecnologias como o
// investimento anticíclico baixam os juros dos próximos).
const monthlyRate = (loan) => (loan?.rate ?? ECONOMY.loanAnnualRate) / 12;

/** Juros ao ano oferecidos agora. */
export function loanRate(rt) {
  return Math.max(0, mod(rt, 'loanRate', ECONOMY.loanAnnualRate));
}

/** Valores de empréstimo oferecidos agora: { amount, months }. */
export function loanOffers(rt) {
  return [
    ...ECONOMY.loanOptions.map((amount) => ({ amount, months: ECONOMY.loanMonths })),
    ...(rt?.extraLoans ?? []),
  ];
}

/** Parcela fixa (tabela Price) de um empréstimo de `amount`. */
export function loanPayment(amount, rate = ECONOMY.loanAnnualRate, months = ECONOMY.loanMonths) {
  const r = rate / 12;
  if (r === 0) return Math.ceil(amount / months);
  return Math.ceil((amount * r) / (1 - (1 + r) ** -months));
}

// Na última parcela paga só o que falta (saldo + juros do mês).
function loanInstallment(loan) {
  if (loan.monthsLeft <= 1) return loan.balance + Math.round(loan.balance * monthlyRate(loan));
  return loan.payment;
}

export function takeLoan(state, rt, amount) {
  const economy = state.economy;
  const offer = loanOffers(rt).find((o) => o.amount === amount);
  if (!offer) return { ok: false, reason: 'Valor de empréstimo não oferecido.' };
  if (economy.loans.filter((l) => l.kind !== 'ppp').length >= ECONOMY.maxLoans) {
    return { ok: false, reason: `No máximo ${ECONOMY.maxLoans} empréstimos ao mesmo tempo.` };
  }
  const rate = loanRate(rt);
  economy.loans.push({
    id: economy.nextLoanId++,
    amount,
    balance: amount,
    payment: loanPayment(amount, rate, offer.months),
    monthsLeft: offer.months,
    rate,
  });
  economy.money += amount;
  return { ok: true, cost: -amount, count: 1 };
}

/** As obras públicas saem por PPP? (pesquisa e opção no orçamento ligadas) */
export const pppActive = (state, rt) => Boolean(state.economy.ppp) && mod(rt, 'ppp', 0) > 0;

/** Liga ou desliga a PPP (comando 'ppp'). */
export function setPpp(state, rt, on) {
  if (mod(rt, 'ppp', 0) <= 0) return { ok: false, cost: 0, reason: 'As PPPs precisam da tecnologia Parcerias público-privadas.' };
  state.economy.ppp = Boolean(on);
  return { ok: true, cost: 0 };
}

/** Parcela mensal de um contrato de PPP de `cost`. */
export function pppPayment(rt, cost) {
  return loanPayment(cost, loanRate(rt) + ECONOMY.pppExtraRate, ECONOMY.pppMonths);
}

/**
 * Obra pública por PPP: em vez de pagar à vista, a cidade assina um contrato
 * pago em parcelas (entra nas "Parcelas de empréstimos"). Recusa se as
 * parcelas de PPP passariam do limite da receita. Devolve { ok, reason }.
 */
export function pppContract(state, rt, name, cost) {
  const economy = state.economy;
  const payment = pppPayment(rt, cost);
  const current = economy.loans.filter((l) => l.kind === 'ppp').reduce((s, l) => s + l.payment, 0);
  const limit = ECONOMY.pppShare * monthlyBudget(state, rt).income.total;
  if (current + payment > limit) {
    return { ok: false, reason: `Parcelas de PPP passariam de ${Math.round(ECONOMY.pppShare * 100)}% da receita ($${Math.round(current + payment).toLocaleString('pt-BR')} de $${Math.round(limit).toLocaleString('pt-BR')} por mês).` };
  }
  economy.loans.push({
    id: economy.nextLoanId++, kind: 'ppp', building: name, amount: cost, balance: cost, payment,
    monthsLeft: ECONOMY.pppMonths, rate: loanRate(rt) + ECONOMY.pppExtraRate,
  });
  return { ok: true };
}

export function repayLoan(state, id) {
  const economy = state.economy;
  const loan = economy.loans.find((l) => l.id === id);
  if (!loan) return { ok: false, reason: 'Empréstimo não encontrado.' };
  if (loan.kind === 'ppp') return { ok: false, reason: 'O contrato de PPP é pago até o fim (10 anos).' };
  if (economy.money < loan.balance) {
    return { ok: false, reason: `Dinheiro insuficiente para quitar ($${loan.balance}).` };
  }
  economy.money -= loan.balance;
  economy.loans = economy.loans.filter((l) => l !== loan);
  return { ok: true, cost: loan.balance, count: 1 };
}
