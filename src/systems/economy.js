// Orçamento da cidade.
//
// Receitas (impostos, por zona):
//   residencial: cada morador empregado paga incomePerWorker por ponto de imposto
//   comercial / industrial: cada vaga ocupada paga incomePerJob por ponto
// Despesas: manutenção das ruas e dos serviços públicos, parcelas de empréstimos.
//
// monthlyBudget() calcula o mês "como está agora" (para o painel e a
// previsão); closeMonth() aplica no fim de cada mês, paga as parcelas e guarda
// o mês no histórico.

import { BUILDINGS, ECONOMY, TAX_ZONES, ZONE } from '../world/catalog.js';

const ZONE_KEY = { [ZONE.COMMERCIAL]: 'commercial', [ZONE.INDUSTRIAL]: 'industrial' };

export function monthlyBudget(state, rt) {
  const taxes = state.economy.taxes;
  let employed = 0;
  for (const c of state.citizens) if (c.job !== null) employed++;

  const jobsFilled = { commercial: 0, industrial: 0 };
  let utilities = 0;
  for (const b of state.buildings) {
    const info = BUILDINGS[b.type];
    if (info.utility) utilities += info.utility.upkeep;
    const key = ZONE_KEY[info.zone];
    if (key && b.abandoned === undefined) jobsFilled[key] += rt.workers.get(b.id).size;
  }

  let roadTiles = 0;
  for (const r of state.map.road) roadTiles += r;

  const income = {
    residential: Math.round(employed * ECONOMY.incomePerWorker * taxes.residential),
    commercial: Math.round(jobsFilled.commercial * ECONOMY.incomePerJob * taxes.commercial),
    industrial: Math.round(jobsFilled.industrial * ECONOMY.incomePerJob * taxes.industrial),
  };
  income.total = income.residential + income.commercial + income.industrial;

  const expenses = {
    roads: Math.round(roadTiles * ECONOMY.roadUpkeepPerMonth),
    utilities,
    loans: state.economy.loans.reduce((sum, loan) => sum + loanInstallment(loan), 0),
  };
  expenses.total = expenses.roads + expenses.utilities + expenses.loans;

  return { income, expenses, net: income.total - expenses.total };
}

/** Fechamento do mês: aplica o orçamento, paga as parcelas e guarda no histórico. */
export function closeMonth(state, rt) {
  const budget = monthlyBudget(state, rt);
  const economy = state.economy;
  economy.money += budget.net;

  for (const loan of economy.loans) {
    const interest = Math.round(loan.balance * monthlyRate());
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

const monthlyRate = () => ECONOMY.loanAnnualRate / 12;

/** Parcela fixa (tabela Price) de um empréstimo de `amount`. */
export function loanPayment(amount) {
  const r = monthlyRate();
  const n = ECONOMY.loanMonths;
  return Math.ceil((amount * r) / (1 - (1 + r) ** -n));
}

// Na última parcela paga só o que falta (saldo + juros do mês).
function loanInstallment(loan) {
  if (loan.monthsLeft <= 1) return loan.balance + Math.round(loan.balance * monthlyRate());
  return loan.payment;
}

export function takeLoan(state, amount) {
  const economy = state.economy;
  if (!ECONOMY.loanOptions.includes(amount)) return { ok: false, reason: 'Valor de empréstimo não oferecido.' };
  if (economy.loans.length >= ECONOMY.maxLoans) {
    return { ok: false, reason: `No máximo ${ECONOMY.maxLoans} empréstimos ao mesmo tempo.` };
  }
  economy.loans.push({
    id: economy.nextLoanId++,
    amount,
    balance: amount,
    payment: loanPayment(amount),
    monthsLeft: ECONOMY.loanMonths,
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
