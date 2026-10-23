import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ECONOMY } from '../src/world/catalog.js';
import { applyCommand } from '../src/world/commands.js';
import { advance, prepare } from '../src/systems/simulation.js';
import { closeMonth, loanPayment, monthlyBudget } from '../src/systems/economy.js';
import { createSave, readSave, checksum } from '../src/save/format.js';
import { TICKS_PER_DAY } from '../src/core/time.js';
import { testCity } from './helpers.js';

test('impostos: arrecadação proporcional ao imposto de cada zona', () => {
  const { state, rt } = testCity();
  advance(state, rt, TICKS_PER_DAY * 3);
  const before = monthlyBudget(state, rt);
  const employed = state.citizens.filter((c) => c.job !== null).length;
  assert.equal(before.income.residential, Math.round(employed * ECONOMY.incomePerWorker * 9));
  assert.ok(before.income.commercial > 0 && before.income.industrial > 0);

  assert.ok(applyCommand(state, rt, { type: 'tax', zone: 'residential', percent: 18 }).ok);
  const after = monthlyBudget(state, rt);
  assert.ok(Math.abs(after.income.residential - before.income.residential * 2) <= 1, 'dobra com o dobro do imposto');
  assert.equal(after.income.commercial, before.income.commercial, 'as outras zonas não mudam');
  assert.equal(after.net, after.income.total - after.expenses.total);

  assert.match(applyCommand(state, rt, { type: 'tax', zone: 'residential', percent: 25 }).reason, /0% a 20%/);
  assert.match(applyCommand(state, rt, { type: 'tax', zone: 'parque', percent: 5 }).reason, /desconhecida/);
});

test('imposto alto freia o crescimento; baixo acelera', () => {
  const grow = (percent) => {
    const { state, rt } = testCity({ seed: 8 });
    for (const zone of ['residential', 'commercial', 'industrial']) applyCommand(state, rt, { type: 'tax', zone, percent });
    advance(state, rt, TICKS_PER_DAY * 3);
    return state.citizens.length;
  };
  const low = grow(2);
  const normal = grow(9);
  const high = grow(20);
  assert.ok(low > normal && normal > high, `população: 2% ${low}, 9% ${normal}, 20% ${high}`);
});

test('fechamento do mês aplica o saldo e guarda o histórico', () => {
  const { state, rt } = testCity();
  advance(state, rt, TICKS_PER_DAY * 2);
  const budget = monthlyBudget(state, rt);
  const money = state.economy.money;
  closeMonth(state, rt);
  assert.equal(state.economy.money, money + budget.net);
  assert.equal(state.economy.history.length, 1);
  assert.deepEqual(state.economy.history[0].income, budget.income);
  for (let i = 0; i < ECONOMY.historyMonths + 5; i++) closeMonth(state, rt);
  assert.equal(state.economy.history.length, ECONOMY.historyMonths, 'histórico limitado');
});

test('empréstimo: entra o dinheiro, paga 24 parcelas com juros e some', () => {
  const { state, rt } = testCity();
  const money = state.economy.money;
  assert.ok(applyCommand(state, rt, { type: 'loan', amount: 50_000 }).ok);
  assert.equal(state.economy.money, money + 50_000);
  const payment = loanPayment(50_000);
  assert.ok(payment > 50_000 / 24, 'parcela inclui juros');
  assert.equal(monthlyBudget(state, rt).expenses.loans, payment);

  let paid = 0;
  for (let m = 0; m < ECONOMY.loanMonths; m++) {
    paid += monthlyBudget(state, rt).expenses.loans;
    closeMonth(state, rt);
  }
  assert.equal(state.economy.loans.length, 0, 'quitado depois de 24 meses');
  // Juros de 10% ao ano em 24 meses: paga uns 10,7% a mais.
  assert.ok(paid > 54_500 && paid < 56_000, `total pago ${paid}`);
});

test('empréstimos: limite, quitação antecipada e valores oferecidos', () => {
  const { state, rt } = testCity();
  assert.match(applyCommand(state, rt, { type: 'loan', amount: 12_345 }).reason, /não oferecido/);
  for (let i = 0; i < ECONOMY.maxLoans; i++) assert.ok(applyCommand(state, rt, { type: 'loan', amount: 25_000 }).ok);
  assert.match(applyCommand(state, rt, { type: 'loan', amount: 25_000 }).reason, /No máximo/);

  const [loan] = state.economy.loans;
  const money = state.economy.money;
  assert.ok(applyCommand(state, rt, { type: 'repay', id: loan.id }).ok);
  assert.equal(state.economy.money, money - 25_000);
  assert.equal(state.economy.loans.length, ECONOMY.maxLoans - 1);

  state.economy.money = 10;
  assert.match(applyCommand(state, rt, { type: 'repay', id: state.economy.loans[0].id }).reason, /insuficiente/);
});

test('save v3 vira impostos por zona a partir da taxa única', () => {
  const { state } = testCity();
  const v3 = createSave(state, { id: 'v3' });
  v3.data.economy = { money: 777, taxRate: 0.12, lastMonth: null };
  v3.version = 3;
  v3.checksum = checksum(v3.data);
  const { state: migrated } = readSave(JSON.stringify(v3));
  assert.deepEqual(migrated.economy.taxes, { residential: 12, commercial: 12, industrial: 12 });
  assert.deepEqual(migrated.economy.loans, []);
  assert.equal(migrated.economy.money, 777);
  const rt = prepare(migrated);
  advance(migrated, rt, TICKS_PER_DAY);
});
