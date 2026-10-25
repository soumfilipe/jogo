// Orçamento da cidade.
//
// Receitas (impostos, por zona):
//   residencial: cada morador empregado paga incomePerWorker por ponto de imposto
//   comercial / industrial: cada vaga ocupada paga incomePerJob por ponto
//   estatais (refinaria, fábrica de cimento...): receita proporcional à lotação
// Despesas: manutenção das ruas e dos serviços públicos, verba de pesquisa,
// leis e políticas ativas, parcelas de empréstimos. Tecnologias mudam vários desses valores (mod()).
//
// monthlyBudget() calcula o mês "como está agora" (para o painel e a
// previsão); closeMonth() aplica no fim de cada mês, paga as parcelas e guarda
// o mês no histórico.

import { BUILDINGS, ECONOMY, TAX_ZONES, ZONE } from '../world/catalog.js';
import { jobsOf, mod, utilityOutput, utilityUpkeep } from './mods.js';
import { researchOutput } from './research.js';
import { policiesCost } from './policies.js';
import { freightFactor } from './logistics.js';

const ZONE_KEY = { [ZONE.COMMERCIAL]: 'commercial', [ZONE.INDUSTRIAL]: 'industrial' };

export function monthlyBudget(state, rt) {
  const taxes = state.economy.taxes;
  let employed = 0;
  for (const c of state.citizens) if (c.job !== null) employed++;

  // Vagas ocupadas, já pesadas pelo modificador de imposto do nível do prédio.
  const jobsFilled = { commercial: 0, industrial: 0 };
  let utilities = 0;
  let statal = 0;
  for (const b of state.buildings) {
    const info = BUILDINGS[b.type];
    const workers = rt.workers.get(b.id).size;
    if (info.utility) {
      utilities += utilityUpkeep(rt, b.type);
      if (info.utility.income) {
        const full = workers / jobsOf(rt, b.type);
        statal += info.utility.income * full * mod(rt, `output.${b.type}`);
      }
    }
    const key = ZONE_KEY[info.zone];
    if (key && b.abandoned === undefined) {
      jobsFilled[key] += workers * mod(rt, `income.${key}.${info.level}`) * mod(rt, `income.${key}`) * freightFactor(rt, b);
    }
  }

  let roadTiles = 0;
  for (const r of state.map.road) roadTiles += r;

  const all = mod(rt, 'income.all');
  const income = {
    residential: Math.round(employed * ECONOMY.incomePerWorker * taxes.residential * all),
    commercial: Math.round(jobsFilled.commercial * ECONOMY.incomePerJob * taxes.commercial * all),
    industrial: Math.round(jobsFilled.industrial * ECONOMY.incomePerJob * taxes.industrial * all),
    statal: Math.round(statal),
    // Passagens do transporte público juntadas neste mês (ver transit.js).
    fares: Math.round(state.economy.fares ?? 0),
  };
  income.total = income.residential + income.commercial + income.industrial + income.statal + income.fares;

  const expenses = {
    roads: Math.round(roadTiles * mod(rt, 'roadUpkeep', ECONOMY.roadUpkeepPerMonth) * mod(rt, 'maintenance')),
    utilities,
    research: researchOutput(state, rt).fundingCost,
    policies: policiesCost(state, rt, income.total),
    loans: state.economy.loans.reduce((sum, loan) => sum + loanInstallment(loan), 0),
  };
  expenses.total = expenses.roads + expenses.utilities + expenses.research + expenses.policies + expenses.loans;

  return { income, expenses, net: income.total - expenses.total };
}

/** Fechamento do mês: aplica o orçamento, paga as parcelas e guarda no histórico. */
export function closeMonth(state, rt) {
  const budget = monthlyBudget(state, rt);
  const economy = state.economy;
  economy.money += budget.net;
  economy.fares = 0; // as passagens do mês já entraram na receita

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
  if (economy.loans.length >= ECONOMY.maxLoans) {
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

export function repayLoan(state, id) {
  const economy = state.economy;
  const loan = economy.loans.find((l) => l.id === id);
  if (!loan) return { ok: false, reason: 'Empréstimo não encontrado.' };
  if (economy.money < loan.balance) {
    return { ok: false, reason: `Dinheiro insuficiente para quitar ($${loan.balance}).` };
  }
  economy.money -= loan.balance;
  economy.loans = economy.loans.filter((l) => l !== loan);
  return { ok: true, cost: loan.balance, count: 1 };
}
